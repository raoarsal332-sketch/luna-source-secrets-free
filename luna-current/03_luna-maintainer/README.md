# Luna Maintainer

An approval-gated self-improvement layer for Luna. It watches Luna in production,
turns failures into structured issues, diagnoses them, proposes a fix, tests that fix
in an isolated sandbox, scores it against a baseline — and then **stops and waits for
you**.

Built *on top of* Luna's existing modules, not beside them. Node, CommonJS, **zero new
dependencies**.

Nothing has been deployed. No service has been restarted. `MAINTAINER_DRY_RUN` defaults
to `true`.

---

## 1. Architecture overview

```
   PRODUCTION (unchanged)                    LUNA MAINTAINER (this package)
 ┌───────────────────────────┐            ┌──────────────────────────────────────┐
 │ index.js  /webhook        │            │ bridge.js  (only file touching Luna) │
 │   └ Hook P:               │            │                                      │
 │     __statePresend.gate() │──result───>│ detectors.js  ← presendMega HARD     │
 │        presendMega        │            │   collector.js → store.js (durable)  │
 │        analytics{...}     │──sweep────>│        │                             │
 │ control.js pause/aiOff    │            │        v                             │
 └───────────────────────────┘            │ analyzer.js   (LLM: root cause)      │
              ^                           │        v                             │
              │                           │ proposer.js   (LLM patch + envelope) │
              │                           │        v                             │
              │                           │ sandbox.js → runner.js → scoring.js  │
              │                           │        v                             │
              │                           │ approval.js  ==== HUMAN GATE ====    │
              └────── deploy.js ──────────│ deploy.js  backup/health/rollback    │
                (only after approval)     │ ledger.js  anti-repeat memory        │
                                          └──────────────────────────────────────┘
```

Two hard separations:

- **Responsibility** — customer-facing Luna never imports the maintainer. The maintainer
  reaches into Luna through exactly one file, `bridge.js`.
- **Filesystem** — candidate patches are only ever applied to a temp copy. `sandbox.js`
  throws if its root resolves inside `LUNA_ROOT`, and it redirects `TICKET_STATE_FILE`
  and the analytics JSONL paths to sandbox copies so a test run cannot mutate live state.
  A test asserts `teammateHandoffGates.js` is byte-identical after a patched evaluation.

Model weights are never touched. The loop improves the system around the model: code,
prompts, rules, retrieval, state handling, tools, validation, tests, observability.

## 2. What was reused instead of rebuilt

This is the part that changed after reading your source. Roughly 60% of a naive
"maintainer" already exists in Luna, so the package consumes it rather than duplicating it:

| Already in Luna | How the maintainer uses it |
|---|---|
| `statePresend/presendMega.js` `HARD` codes | The event taxonomy. Hard fails are imported verbatim from `gate().result`, never re-detected. |
| `statePresend/analytics` `createErrorAnalytics` | Reason-code counting; the maintainer adds durable aggregation on top. |
| `analytics.createHumanCorrectionCapture` | Teammate-correction events (`TEAMMATE_CORRECTION`). |
| `analytics.createKnowledgeGapAnalytics` | Recurring-gap events (`RECURRING_KNOWLEDGE_GAP`). |
| `analytics.createConversationTrace` | Route / retry / outcome evidence attached to each event. |
| `analytics.toGoldenCase` / `writeGoldenCase` | The golden-case format — a captured production failure becomes a regression case with no conversion step. |
| `statePresend.gate()` | The sandbox execution entry point. Offline, no Intercom, no OpenAI. |
| `control.js` (`paused`, `aiOff`, `testMode`) | The existing kill switch stays the operator's emergency brake; no parallel one was invented. |
| `openai` dependency | Reused for analysis; loaded lazily so the package works offline. |

Only what was genuinely missing got written: durable fingerprinted storage, **the golden
test runner** (`package.json` said `"no test specified"`, and `toGoldenCase` referenced a
runner that did not exist), root-cause analysis, the proposal envelope, baseline-vs-candidate
evaluation, the approval state machine, the anti-repeat ledger, and backup/rollback.

## 3. Files

| File | Purpose |
|---|---|
| `bridge.js` | The only file that reaches into Luna. Loads `statePresend`, `presendMega`, `analytics`, `control` from a given root. |
| `schema.js` | Event / proposal shapes, severity map, fingerprinting, patch hashing. |
| `config.js` | Env-overridable settings; every default is the safe one. |
| `store.js` | Durable JSON store (events, proposals, evaluations, deployments, ledger) + append-only `audit.jsonl`. Atomic writes. |
| `detectors.js` | Imports presend hard fails; detects the signals presend cannot see. Extensible via `register()`. |
| `collector.js` | `observe()` — the one production hook. Fail-safe by construction. |
| `runner.js` | **The golden-case runner Luna lacked.** `presend` cases and `module` cases, both fully offline. |
| `sandbox.js` | Isolated copy, patch application, escape prevention, env redirection. |
| `scoring.js` | Metric aggregation, deltas, hard gates, report rendering. |
| `evaluator.js` | Baseline run vs candidate run, regression diffing. |
| `llm.js` | Strict JSON-only OpenAI client + `createStubLlm` for tests. |
| `analyzer.js` | Root cause with a confidence floor and refusal-to-guess. |
| `proposer.js` | Proposal generation + safety envelope. Carries Luna's full "do not weaken" list. |
| `ledger.js` | Memory of rejected / failed / rolled-back patches. |
| `approval.js` | Status machine and the human gate. |
| `deploy.js` | Backup → staging → swap → health check → monitor → rollback. |
| `index.js` | Facade / wiring. |
| `cli.js` | Operator commands. |
| `cases/presend-core.json` | 6 pre-send golden cases. |
| `cases/gates-modules.json` | 20 module-level gate cases. |
| `test/run-tests.js` | 27 self-tests, no framework, no network. |
| `patches/0001-maintainer-hook-and-env-paths.patch` | The proposed integration diff — **not applied**. |

**Files changed in Luna: none.** The integration is a patch for you to review.

## 4. How each component works

**Detection is rule-based, never AI.** It has to be cheap and explainable, and it must not
hallucinate its own input. Two sources feed it:

- `fromPresend(gateResult, meta)` — reads `gate().result.hardFails` and emits one event per
  code, carrying route, final reason, regeneration attempts and whether the reply was sent.
- `fromTurn(turn, cfg)` — the signals presend structurally cannot see: `TOOL_FAILURE`,
  `TOOL_FALLBACK`, `LOOP_RETRY`, `LATENCY_ANOMALY`, `API_USAGE_ANOMALY`, `ASSIGNMENT_ERROR`
  (mismatch and escalated-unassigned), `REPLY_NOTE_MISTAKE` (both directions),
  `MISSED_ESCALATION`, `STATE_HISTORY_ERROR`, `RUNTIME_ERROR`.

Plus `fromCorrection` and `fromKnowledgeGaps`, which read the analytics objects Luna
already maintains.

**Fingerprinting** hashes code + detector + signature and deliberately excludes
conversation id and timestamp, so the same systemic failure across 40 conversations
collapses into one bucket with `occurrences: 40`. Only buckets at or above
`MAINTAINER_MIN_OCCURRENCES` — or anything `critical` — cost an LLM call.

**The analyzer** returns one category, an explanation, cited evidence keys and a
confidence. Below `MAINTAINER_MIN_CONFIDENCE` (0.6), on category `unknown`, or on any LLM
error, `insufficientEvidence` is forced true and the pipeline stops. It collects more
signal rather than guessing.

**The proposer** is where the LLM writes the change, but `proposer.js` enforces the
envelope. A proposal is refused outright if it touches a forbidden path (`.env`, secrets,
`.git/`, `package-lock.json`), uses an absolute path or `..`, names no affected files,
carries an empty patch, names no required tests, or names no rollback plan. Its system
prompt carries your full do-not-weaken list by name — Intercom webhook handling, identity
detection, self-message prevention, admin note commands, note-vs-reply, Escalations/Risk/
Jerry assignment, Fin ownership waiting, `accountNumberPrefer`, duplicate and loop
prevention, `conversationState`, `statePresend/tools`, `presendMega`, `knowledgeGapGate`,
`postProcessModelReply`.

**The runner** is the piece that did not exist. Two case kinds:

```jsonc
// presend case - replays a conversation through the REAL statePresend.gate()
{ "kind": "presend", "messages": [...], "draft": "...",
  "expected": { "presend_ok": false, "must_fail_codes": ["DUPLICATE_REPLY"], "send": false } }

// module case - calls an exported Luna function directly
{ "kind": "module", "module": "teammateHandoffGates",
  "fn": "isGreetingOnlyClientMsg", "args": ["hi"], "expected": { "equals": true } }
```

`regenerate` is passed as `null`, so a hard fail cannot be quietly "fixed away" by a model
call — the gate's real decision is what gets asserted. Cases with `reviewed: false` are
skipped until a human fills `expected`, exactly as `toGoldenCase` intended.

## 5. Event / data flow

```
Luna turn
  → gate() result + turn meta
  → detectors        → events
  → collector        → store (fingerprint-aggregated, durable)
  → actionable()     → buckets worth an LLM call
  → analyzer         → root cause   (or STOP: insufficient evidence)
  → proposer         → proposal     (or STOP: refused / ledger-blocked)
  → evaluator        → baseline run | patched run → report
  → approval gate    → awaiting_approval          [PIPELINE STOPS HERE]
  → human approve    → approved
  → deploy           → backup → stage → swap → health → deployed
  → monitor          → stable | rolled_back
```

## 6. Safety controls

1. **No autonomous deploy.** `deploy()` throws unless status is exactly `approved`.
2. **No AI self-approval.** `approve()` rejects `""`, `luna-maintainer`, `maintainer`, `ai`,
   `system`, `bot`, `luna`.
3. **No self-declared success.** `passed` is computed in `scoring.js`/`evaluator.js` from
   measured case outcomes. There is no field the model can set to pass itself.
4. **Fixing the reported case is not enough.** Pass requires target cases green **and** zero
   new regressions **and** zero gate failures.
5. **Production is never patched in place.** Sandbox for tests, staging copy for deploy,
   then only the declared files are swapped in.
6. **Sandbox isolation is asserted, not assumed** — and Luna's state files are env-redirected
   during a run.
7. **Path allowlisting** on every proposal.
8. **Evidence floor** — low confidence stops the pipeline.
9. **Anti-repeat ledger** — a rejected / failed / rolled-back patch (whitespace-normalised
   hash) cannot be re-proposed until `newEvidence: true` is passed.
10. **Dry run on by default.**
11. **Backup before every deploy**, independently reversible.
12. **Feature flags** for risky behaviour; the flag name is part of the proposal.
13. **Auto-rollback** on a failed health check or a breached monitoring threshold.
14. **Full audit trail** — every status change, actor and reason in `audit.jsonl`.
15. **`observe()` is fail-safe** — wrapped in try/catch at two levels, never mutates the
    reply, returns `[]` on malformed input (tested).
16. **Separate store.** The maintainer never writes to Luna's own state files.

## 7. Tests added

**27 self-tests** (`npm test`) plus **26 golden cases** that run against your real source.

Self-tests cover: fingerprint identity; store aggregation and sample bounding; presend
import; the seven turn-detector codes; correction shape; `observe()` fail-safety; the
confidence floor; LLM-failure degradation; five proposal-envelope refusals; ledger block
and new-evidence unblock; sandbox isolation, production-file immutability, path-escape
refusal and env redirection; the golden suite against real Luna; and nine end-to-end tests
(good patch passes and needs approval; unapproved deploy throws; regressing patch fails and
is remembered; AI cannot self-approve; unevaluated proposal cannot be approved; dry run
writes nothing; approved deploy backs up, applies and rolls back; monitoring auto-rollback;
history and audit).

Golden cases: 6 pre-send (clean answer, duplicate reply, already-collected account request,
unsupported promise + number, internal leak, empty reply) and 20 module cases across
`teammateHandoffGates`, `escalateRelatedOnly`, `softEdges`, `identityEscalateGates`,
`accountNumberPrefer` and `spreadAskGate`.

## 8. Test results

```
27 passed, 0 failed
26/26 golden cases passed against the shipped Luna source
```

Full output in `TEST_RESULTS.txt`. Reproduce:

```bash
LUNA_ROOT=/home/ubuntu node luna-maintainer/test/run-tests.js
LUNA_ROOT=/home/ubuntu node luna-maintainer/cli.js self-test
```

Two real bugs were found by these tests and fixed during the build: the latency gate fired
on sub-millisecond noise (now floored at 50 ms), and the health check treated a missing
`node_modules` as a deploy failure (now non-fatal for optional deps only).

## 9. How approval works

```bash
node luna-maintainer/cli.js events                       # issue buckets, most frequent first
node luna-maintainer/cli.js analyze <fingerprint>        # root cause + proposal
node luna-maintainer/cli.js evaluate <proposalId>        # sandbox baseline-vs-candidate
node luna-maintainer/cli.js request-approval <proposalId># only succeeds if the report passed
node luna-maintainer/cli.js pending                      # your review queue
node luna-maintainer/cli.js show <proposalId>            # full proposal incl. patch
node luna-maintainer/cli.js approve <id> --approver arsal --note "reviewed diff"
node luna-maintainer/cli.js deploy  <id> --approver arsal
```

`request-approval` throws if the evaluation did not pass and writes the failure to the
ledger. `reject` requires a reason, which is stored so the same patch cannot return.

## 10. How rollback works

Every deploy writes `backups/luna_<deployId>_<timestamp>.tar.gz` before touching anything.

- Manual: `node luna-maintainer/cli.js rollback <deployId> --reason "..."`
- Automatic on a failed post-deploy health check.
- Automatic on a monitoring breach:
  `deployer.monitor(deployId, windowEvents, messagesSeen)` rolls back when the critical/high
  event rate exceeds `MAINTAINER_ROLLBACK_ERROR_RATE` or regression events reach
  `MAINTAINER_ROLLBACK_EVENTS`.

Rollback extracts the tarball over `LUNA_ROOT`, sets the proposal to `rolled_back`, and
writes the patch to the ledger so it is not proposed again. **Restarting pm2 is left to you
on purpose** — the maintainer does not restart services.

## 11. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `LUNA_ROOT` | `/home/ubuntu` | Luna repo root |
| `MAINTAINER_DATA_DIR` | `~/.luna-maintainer` | Store + audit log |
| `MAINTAINER_BACKUP_DIR` | `<data>/backups` | Backups and staging |
| `MAINTAINER_SANDBOX_DIR` | tempdir | Sandbox parent |
| `MAINTAINER_CASES_DIR` | `luna-maintainer/cases` | Golden cases |
| `MAINTAINER_GOLDEN_DIR` | `<data>/golden` | Cases captured from production |
| `MAINTAINER_ENABLED` | `true` | Master switch for observation |
| `MAINTAINER_DRY_RUN` | **`true`** | Deploy writes nothing while true |
| `MAINTAINER_REQUIRE_APPROVAL` | **`true`** | Human gate |
| `MAINTAINER_LLM_MODEL` | `gpt-4o-mini` | Analyzer / proposer model |
| `MAINTAINER_LLM_KEY_ENV` | `OPENAI_API_KEY` | Which env var holds the key |
| `MAINTAINER_MIN_CONFIDENCE` | `0.6` | Below this, no proposal |
| `MAINTAINER_MIN_OCCURRENCES` | `2` | Frequency before an LLM call |
| `MAINTAINER_LATENCY_MS` | `20000` | Latency anomaly threshold |
| `MAINTAINER_MAX_API_CALLS` | `6` | API-usage anomaly threshold |
| `MAINTAINER_MAX_RETRIES` | `2` | Loop detection threshold |
| `MAINTAINER_GATE_MIN_PASS_RATE` | `1.0` | Required candidate pass rate |
| `MAINTAINER_GATE_LATENCY_PCT` | `15` | Max latency regression |
| `MAINTAINER_GATE_LATENCY_FLOOR_MS` | `50` | Below this baseline, latency is not gated |
| `MAINTAINER_ROLLBACK_ERROR_RATE` | `0.05` | Auto-rollback error rate |
| `MAINTAINER_ROLLBACK_EVENTS` | `3` | Auto-rollback regression count |
| `MAINTAINER_MONITOR_MINUTES` | `60` | Post-deploy watch window |

Proposed for Luna itself (in `patches/0001`, not applied): `LUNA_CONTROL_STATE_FILE` and
`LUNA_PROMPT_FILE`, so `control.js` stops hardcoding `/home/ubuntu/bot-control.json` and
`/home/ubuntu/system-prompt.txt`. Defaults are unchanged, so production behaviour is
identical without them.

## 12–13. Example event, proposed fix and evaluation report

Full transcript in `EXAMPLES.txt`. Summary — a real gap found in your source: the
greeting-only allowlist in `teammateHandoffGates.js` is English-only, so `salam`,
`assalam o alaikum` and `aoa` are not treated as greetings and Luna re-engages after a
teammate has taken over.

```json
{
  "fingerprint": "3bd037257a5aed92",
  "code": "MISSED_ESCALATION",
  "detector": "turn",
  "severity": "critical",
  "summary": "Roman Urdu greeting restarted the bot after a teammate handoff",
  "occurrences": 4,
  "engine": "fresh-2026-09-16-botstop-owner-only-v1",
  "samples": [{ "conversationId": "conv_91400", "evidence": { "clientText": "salam", "escalated": false } }]
}
```

```diff
--- a/teammateHandoffGates.js
+++ b/teammateHandoffGates.js
@@ -45,7 +45,7 @@ function isShortClientAckExpanded(text) {
 function isGreetingOnlyClientMsg(text) {
   const t = normalizeAckText(text);
   if (!t || t.length > 40) return false;
-  return /^(hi|hello|hey|yo|hola|ciao|good\s*(morning|afternoon|evening)|sup)[.!?\s]*$/i.test(t);
+  return /^(hi|hello|hey|yo|hola|ciao|good\s*(morning|afternoon|evening)|sup|salam|salaam|salam\s*alaikum|assalam\s*o?\s*alaikum|assalamu\s*alaikum|aoa)[.!?\s]*$/i.test(t);
 }
```

```
EVALUATION REPORT eval_27e149f7b60f6c3b  (proposal prop_ac6b57fbcd9d544c)
RESULT: PASS

metric                      baseline   candidate       delta
cases                         10.000      10.000      +0.000
passed                         7.000      10.000      +3.000
passRate                       0.700       1.000      +0.300
answerCorrectness              0.700       1.000      +0.300
unsupportedClaimRate           0.000       0.000      +0.000
duplicateRate                  0.100       0.100      +0.000
escalationErrorRate            0.000       0.000      +0.000

target cases fixed : true
new regressions    : none
gate failures      : none
```

A deliberately over-broad version of the same patch (a catch-all greeting regex) is caught:
`guard-not-greeting-question` and `guard-not-greeting-heythere` regress, the report fails,
approval is refused and the patch is written to the ledger.

## 14. Remaining risks and future work

1. **The integration patch is unapplied and unverified at runtime.** `patches/0001` was
   generated as a real diff against your `index.js`, but **the exported `index.js` does not
   parse** — line 1723, `'Password: REDACTED_SECRET +`, lost its closing quote during your
   export's secret redaction (`system-prompt.txt:219` has the same string). That is an
   export artifact, not a live bug, but it means I could not execute the webhook path. The
   `escalateRequested` / `full.admin_assignee_id` variable names in the hook must be checked
   against the real file before applying.
2. **Golden coverage is a floor, not coverage.** 26 cases is a starting point. Every real
   incident should be frozen in via `analytics.toGoldenCase` → `MAINTAINER_GOLDEN_DIR`; the
   suite's value compounds with use.
3. **Case assertions are exact-match.** Semantic correctness of free text is not graded. An
   LLM judge would help but must be scored against a fixed labelled rubric, never allowed to
   bless its own patch.
4. **Prompt changes have no unit-test analogue.** A `system-prompt.txt` tweak can pass every
   case and still shift tone across thousands of conversations. Keep those behind feature
   flags and roll out narrowly.
5. **`git apply` is line-fragile.** Live edits between proposal and deploy make the patch
   fail on staging — safe, but expect friction.
6. **Root-cause analysis can be confidently wrong.** The confidence floor reduces this; it
   does not remove it. Your review of the diff is still the real safeguard.
7. **Deploy swaps files, not processes.** pm2 restart is deliberately yours.
8. **`index.js` is a 4,076-line monolith.** The maintainer works around it via the pure
   modules, but the webhook path itself is largely untestable until parts of it are extracted.
   That is the single highest-value refactor for making this loop stronger.

**Next, in order:** verify and apply `patches/0001`; run `self-test` on the VPS; leave it in
observe-only for a week and read `events`; then work the first real bucket end to end.
