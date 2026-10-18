# t739 INITIAL integrated candidate: Packs + Atom integration report (author report, not a review)

Model id: **Claude Sonnet 5.5**. I am the integration owner and author of the integration. I make **no PASS claim**; this is evidence for the independent reviewer.
This is still the initial candidate (not a remediation cycle). Same hard limits as before: non-production staging only, no network to any external API, synthetic credentials only (99999001 / Fake#Pass1), nothing merged to main, no PR to main.

Sources integrated (not modified):
- Packs: branch `cursor/t739-packs-3f28` @ `495b8e3d681dcc8d2ad9a8f6e1f923dec814044f`, author bc-307de901, `staging-repair-t739/packs/`.
- Atom: branch `t739-atom` @ `f096125d55465dc1353fced3df70e0df6d4748d4`, author bc-768d6482, `staging-repair-t739/atom/`.
- The runtime files of both modules are copied byte for byte into `candidate/packs/` and `candidate/atom/`. Test `t7` proves they are byte-identical to the author branches (no selector edit).

## 1. What changed in this cycle (all in `candidate/`; `index.js` is unchanged since the previous freeze)

| file | status | change |
|---|---|---|
| `faqAnswerSelect.js` | changed | one canonical gate shape; the gate now applies to every route (deterministic cue, contextual follow-up, model classifier); `turnText` evidence; English verdict can not be re-rendered by a language hint |
| `faqAssistance.js` | changed | module scope (F1) moved to right after the ownership/controls/fin-wait/human-request checks, before intent classification, selection, the mixed-turn return and every fallback; clause-level claim; ON-path hook; `turnText` passed to selection |
| `faqModuleGates.js` | changed | gates may carry an optional `select`; `detect(text, ctx)` receives `ctx.priorClientTexts` |
| `faqModuleAdapter.js` | NEW | interface adapter: `normalizeGate`, `packsOptions`, `atomOptions` (fail closed) |
| `faqModuleDetectors.js` | NEW | real Packs and Atom detectors registered into `faqModuleGates`; ON-path `select` wrappers |
| `packs/*`, `atom/*` | NEW (byte copies) | the authors' runtime files, unmodified |

### 1.1 One language-gate shape (task 1)

Canonical result (produced by `faqAnswerSelect.languageGate`, accepted by the adapter, Packs and Atom):

```
{ lang: 'en'|'non-en'|'uncertain', language: 'en'|'non-en'|'unknown', confident: boolean, allowsAnswer: boolean, basis: string }
```

- English is `{language:'en', confident:true, allowsAnswer:true}` (exactly the Packs requirement) and also has `lang:'en'` and no negative flag (the Atom reader).
- `faqModuleAdapter.normalizeGate(x)` accepts the canonical, Packs-shaped and Atom-shaped object gates and returns the canonical shape. It **fails closed** (`lang:'uncertain', allowsAnswer:false`) for: absent, null, bare strings (no confidence information), arrays, numbers, empty objects, missing or non-boolean `confident`/`allowsAnswer`, English with a negative flag (mixed/uncertain/blocked/abstain/status unknown...), inconsistent `lang`/`language`, empty or non-string language.
- Note for the reviewer: the Atom author's own test gate `{lang:'en'}` (no confidence fields) is accepted by the Atom module but is **rejected by the adapter** by design.
- Evidence: `t6` G1 to G6 (shape, real Packs and Atom accept the canonical English gate, both refuse uncertain/non-English, 18 malformed gates fail closed through both real selectors, no gate at all abstains).

### 1.2 Real detectors and F1 end to end (task 2)

Detectors (`faqModuleDetectors.js`) only answer "does this text belong to the module". Neither selector's logic is touched.
- Packs: the module's own `packsProductHint()`, the module's inline Packs term list from `selectPacksAnswer` (L565; I removed the generic words refund/missing), the module's named-card list, and a missing-item report with the module's Packs item vocabulary, all on the module's obfuscation-folded text (`pregate.normalizeInput`). The term list is a copy of the module's inline regex (the module does not export it), guarded by test D5.
- Atom: the word "atom" in the current text, or Atom's own follow-up chain (`buildContext`: `scopeAtom` with `chain > 0`).
- Flags (default OFF): Packs `LUNA_PACKS_ENABLED` (only 1/true/on/yes); Atom follows the module's own `atomSelectorEnabled()` (`LUNA_ATOM_SELECTOR_ENABLED=1`). I use the module's own flag so there is one source of truth. `LUNA_ATOM_ENABLED` does nothing (tested).
- If a module file can not be loaded the detector degrades to a coarse word test and logs one body-free line; a detector that throws on an input counts as a claim.

**F1 definition (documented decision, including mixed turns).** For an unowned conversation (human-owned conversations are not touched), after ownership/controls/fin-wait/human-request, the turn is **terminal-silent** (`{reason:'module-off-fail-closed', terminal:true, module:id}`) when the whole text or **any clause** is claimed by the detector of a module whose flag is OFF **and the claiming clause is English**:
- A mixed turn (module-specific English clause plus a general V12 clause, or plus an account/backend clause, in either order) is silent as a whole. No partial answer, no note, no assignment. Tested for both orders and for a V12 clause and a payout clause.
- An English module clause inside a turn that also contains Spanish is claimed. A purely non-English module ask is not claimed (non-English main route unchanged).
- The clause language uses the clause's own evidence first, then the whole turn.
- Because it runs before intent classification, a module ask that classifies as small talk or support-meta can not reach the main path (tested).
- `module-off-fail-closed` is not in `DEFER_TO_MAIN_PATH`. Side effects (source-verified for prepare/finishPrepareWithoutPlan, [ME] for webhookFastAck/lunaEpisode): one `FAQ_ASSIST {cid,utc,action,reason}` log line, `d.end(cid)`, `res.sendStatus(200)`. No FAQ ledger record, no model call, no write at all.
- Observed below axios (`t6` F1e2e): for 10 English Packs/Atom asks, `handleWebhook` recorded zero non-GET requests (no reply, note, assignment, close), zero model calls, status 200, and the control (non-module ask) was still answered.

**ON paths (isolated test config only; default both OFF).** If the module is ON (env set only inside tests), the real module selector is consulted with the canonical gate and its result is recorded (`moduleResult`), but **delivery is not wired**: `faqApprovedAnswers.js` has no extra-catalog loading and the Atom `resolveExtraPath` file is missing (task 4, BLOCKED, not guessed). The turn therefore stays terminal-silent with `reason:'module-on-delivery-not-wired'`. The module's answer is never sent and the nearest V12 FAQ is never substituted. Tested for Packs (answer `packs.overview.en`), Atom (answer `atom.*`, a fee-recovery ask abstains), one module ON with the other OFF, and ON with non-English/uncertain text. Zero writes in all of them.

### 1.3 F5: the gate on the deterministic routes (task 3)

`selectApprovedAnswer` now computes the gate once at the top and again at every later decision point:
- `uncertain` language abstains with `language-uncertain` for **every** route: deterministic cue, contextual follow-up and model classifier (before the call, after the outcome, and before the result is built). The new reason was already in the abstain-fallthrough list.
- English evidence may come from the same turn (`turnText`, passed by `faqAssistance.prepare`, so a clause of a multi-clause English message is no longer judged alone), or from prior customer messages.
- A language hint can not turn an English verdict into another locale (`lang` is forced to `en`). Language never selects an intent.
- Non-English main route unchanged: ES, Roman Urdu and Urdu-script asks select exactly as at baseline (differential test vs the base selector on a mixed corpus: identical).
- Side effect that the reviewer must weigh: a bare catalog term with no English evidence (for example "free trial?" as the first message) now abstains where the base selected it. The abstention falls through to the legacy path as before, it is not silence.

## 2. Test commands and raw counts (candidate vs baseline)

All run from `/workspace/staging-repair-t739`, under `unshare -rn` (no network namespace). Raw outputs are in `artifacts/raw/`. "Baseline" = the base tree (bf9e1fc2, 8ff65201, cb8df442), which has no Packs/Atom code.

| command | candidate | baseline |
|---|---|---|
| `node tests/t1_detector.js` | 50 passed, 0 failed, 50 total | not run |
| `node tests/t2_transport.js` | 51 passed, 0 failed, 51 total | 15 passed, 36 failed, 51 total |
| `node tests/t3_faq_language_module.js` | 29 passed, 0 failed, 29 total | 13 passed, 4 failed, 17 total (the candidate-only tests do not run) |
| `node tests/t4_logs.js` | 6 passed, 0 failed, 6 total | 2 passed, 4 failed, 6 total |
| `node tests/t5_isolation.js` | 10 passed, 0 failed, 10 total | not run |
| `node tests/t6_modules.js` (new) | 35 passed, 0 failed, 35 total | 2 passed, 0 failed, 2 total (module files absent; the 2nd test observes that the same Packs/Atom asks reach the model path at baseline: 4 of 4 call the model, 1 sends a public reply) |
| `node tests/t7_corpus_equivalence.js` (new) | 6 passed, 0 failed, 6 total | 1 passed, 0 failed, 1 total |
| Packs `node tests/run-author-tests.js`, integrated copy `candidate/packs` + the author's `tests/` | `TOTAL 1322/1322 pass, 0 fail`; critical leaks 0; general controls 79/79 (60 without caller scope hint); must-stay-general 13/13 | the author's pre-t739 Packs files cannot run the author's tests (`HARNESS ERROR ... reading 'packsEnabled'`, rc 2, 0 tests executed) |
| Atom `./tests/run_all.sh`, integrated copy `candidate/atom` + the author's `tests/` | `node --test`: 19 pass, 0 fail; raw counts `TOTAL 5465 pass 5464 fail 1`; failing case `general GN25 "Can I get a bigger reward share on Atom 1-Step?" => clarify:unrecognized-qualifier` (the same failure is in the author's own run; I did not touch it) | Atom `baseline_compare` (dd3b9f79 selector): 80 deny cases, baseline sendable leaks 16, corrected leaks 0; baseline false refusals 12, corrected 1 |

The authors' suites exercise the modules directly with the authors' own gate shapes. They do not exercise my adapter or the F1 wiring; that is what t6 and t7 do.

Integration-level observations (from `t6`/`t7`, raw in `artifacts/raw/cand_t6_modules.out` and `cand_t7_corpus_equivalence.out`):
- Both authors' corpora through the shared gate and the adapter: whenever the shared gate says English the module result is identical to the author-gate result (Packs 205/205, Atom 206/206); whenever it is not English or uncertain the module abstains. The gate withholds 61 of 316 Packs questions and 87 of 293 Atom questions (short asks without English evidence). That is the cost of the language gate, not a selector difference.
- Detector coverage: Atom detector claims 293/293 of the Atom author questions. Packs detector: every phrase the real Packs selector answers by its own scope is claimed (0 misses); 0 claims where the module says "not-elite-packs".
- Neither detector claims the 12 V12 questions or plain account asks (D6).
- All 474 approved bodies in the V12, Packs and Atom catalogs pass the credential detector (no hold).

## 3. F1 exposure that remains (measured, see open decisions)

Over the 609 authored Packs and Atom questions (flags OFF, unowned, single turn, `prepare` result):

| outcome | count |
|---|---|
| terminal silent `module-off-fail-closed` | 373 |
| non-terminal `language-uncertain-module-off` (claimed, but no English evidence in the clause or turn; goes to the legacy path) | 145 |
| not claimed: `no-isolatable-faq` | 51 |
| not claimed: `existing-unowned-faq-path` | 40 |

- The 145: short English questions such as "Are Elite Packs refundable?" (one function word) and bare names such as "Instant Override". By the brief ("English gate passes") they are not terminal, so the main (model) path can still answer them. The one-line alternative is to make a claimed turn terminal when the gate is `uncertain` too; I did not do it because it is a wider behaviour change (it would also silence a non-English ask in a language my cue lists do not know).
- The 91 not claimed: Packs card/credit questions that carry no Packs term ("What are the odds of an Epic card?"). The Packs author's own tests need a caller scope hint (`forcePacks`) for the same 19 of 79 general controls, and no such conversation-topic source exists in the staging tree. Not guessed.
- Also not claimed: a Packs follow-up whose only Packs context is in an earlier message. Atom follow-ups are claimed through Atom's own chain logic.

## 4. Baseline transport leaks: which origins, and what text they need (task 6)

Source: `artifacts/raw/base_t2_transport.out` (36 failed of 51). A "variant" is one of the 5 synthetic shapes (labelled, unlabelled slash, html wrapped, worded digits plus weak label, zero-width label). The base early guard (2158c43f, base L6327) runs only inside `postClientCommentOnceInner`, so only a labelled pair there is blocked.
"Needs" says whose text must contain the credential for the leak to occur. The exposure assessment is [AS]: it depends on production data I can not see.

| origin (base line) | baseline result | credential text must be produced by | note |
|---|---|---|---|
| `postClientCommentOnce`/`Inner` (L6287/L6301): generated, rephrased, template-assembled replies | leaks 4 of 5 variants; the labelled variant is blocked by 2158c43f; the mixed assembly (clean answer plus pair) leaks | **model output** (or a template that interpolates a pair; no staff action needed) | the most plausible live route: the model repeating or rephrasing a pair the customer pasted into the chat |
| full `handleWebhook` FAST route (model output into Inner) | leaks (unlabelled pair) | **model output** | same origin end to end |
| auth replay (R2, L215) and burst rerun (R1, L6206) | both leak | **model output** (they re-enter `handleWebhook`) | no new text source |
| `postDeterministicFlowReply` (L7440), single caller: the review flow | leaks 3 of 3 tested variants including labelled (this route has no early guard) | review-flow template body (`reviewRequestFlow` is not in the staging tree, so the body source is unverifiable) then `postProcessModelReply` | low likelihood unless the template carries free text [AS]; not verified |
| FAQ `deps.send` (L12061) | leaks when called directly with a pair | not reachable from the real FAQ path: `execute` sends only a body equal to the approved catalog body (`gateFinalOutbound` plus `approvedBodyHash`); all 474 catalog bodies carry no credential | live exposure only if a catalog row is edited to contain one |
| `icRequest` (L238) and `icRequestUnguarded` (L272) direct, layers B and C | leak 3 of 3 variants each | any caller above | transport sinks, not origins |
| owner exact REPLY (8b, L7362) | leaks 4 of 4 variants including labelled | **staff**: an authorized admin typed the text ("send this message to client [...]") | no guard on this route at base |
| owner FOLLOW exact | leaks 3 of 3 including labelled | **staff** | same |
| owner FOLLOW via model plan (8a, L7061) | leaks 3 of 3 including labelled; the plan body is written in clear to `AUTH_COMMAND_FILE` (L7399) | **staff instruction plus model-produced plan body** | credential also persisted at rest |
| persisted plan from an earlier run (retry) | leaks on retry and the body stays in the ledger | **staff and/or model**, earlier | |
| not leaks at baseline (15 tests pass): clean control send, internal note not held (by design), GET never held, retry byte-identical, retry permission re-check, clean owner send, clean plan, clean webhook control, ownership, aiOff/paused, detector exception | | | |

Count check: postReply 5, Once 5, F2-silent 1, flow 3, FAQ 1, layer B 3, layer C 3, held-not-retried 1, owner REPLY 4, FOLLOW exact 3, FOLLOW plan 3, persisted 1, webhook 1, auth 1, burst 1 = 36.

## 5. Isolation (unchanged, re-run)

`t5_isolation` 10/10 under `unshare -rn` (loopback only; DNS EAI_AGAIN; TCP ENETUNREACH; in-process block of net/tls/http/https/dns/fetch/child_process; recorder below axios; synthetic credentials). Every suite asserts zero egress attempts. Init side effects (`artifacts/raw/resolution_and_init.out`): only `control.json` and `system-prompt.txt` in a fresh temp dir; zero egress attempts and zero Intercom requests at init; only `logRedact.install` and `luna-maintainer.create` generic stubs are called at init. In the test environment Packs and Atom are the real module files; their copies run from the test tree. The harness stubs (`webhookFastAck`, `lunaEpisode`, `replyDecision`, `reviewRequestFlow` and others, listed in the same file) are still [ME] or [HI].

## 6. Open items and decisions for the owner (this cycle)

1. **F1 on `uncertain` language** (section 3): 145 of 609 authored module questions are not terminal. Decide whether a claimed turn with an uncertain gate should also be terminal-silent.
2. **Customer experience of F1:** a Packs/Atom English ask now gets no reply and no human handoff note while the module is OFF (as specified). Nobody is notified.
3. **ON paths cannot deliver** until `faqApprovedAnswers.js` extra-catalog loading exists (the Atom `resolveExtraPath` file is missing). BLOCKED, not guessed.
4. **Packs coverage without a caller scope hint** (91 authored questions are not claimed): needs a conversation-topic source I do not have.
5. The F5 deterministic gate withholds bare short catalog terms with no English evidence (they fall through to the legacy path).
6. From the previous cycle and still open: OWNER WORDING CONFIRMATION for the staff hold note, notes are not scanned, a lone password is not held, detection gaps (see `FINAL_REPORT.md` section 7), the unredacted log sites (`f4_unredacted_log_candidates.txt`), the missing real modules behind the harness stubs.
7. Atom author-reported failure GN25 is untouched.
8. Nothing here is independently reviewed.
