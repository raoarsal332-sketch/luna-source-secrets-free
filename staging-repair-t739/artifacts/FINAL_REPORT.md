# t739 MT5 shared-file repair: candidate FREEZE report (author report, not a review)

> **Superseded in part (initial integrated candidate, Packs + Atom).** The module integration, the shared language gate, F1 for mixed turns, the deterministic-route gate, the baseline-leak table and the current hashes are in `INTEGRATION_REPORT.md`, `MANIFEST.sha256` and `FROZEN_CANDIDATE.md`. The hashes of `faqAssistance.js`, `faqAnswerSelect.js` and `faqModuleGates.js` in section 1 below are from the previous freeze and are no longer current. `index.js` and `publicCredentialHold.js` are unchanged.

Model id: **Claude Sonnet 5.5** (author and single integration owner of `index.js`, `faqAssistance.js`, `faqAnswerSelect.js`).
Branch: `t739-mt5-shared` (repo is private; never merged to main, no PR to main).
Authorization t739, owner Arsal. T0 2026-10-18 18:15 PKT. Non-production staging only.

I am the author. **I make no PASS claim.** Everything below is evidence for an independent reviewer. The candidate is frozen and I have stopped.

## 0. Critical security notes (top)

No new critical security issue was found that required stopping a workstream.
Open release blockers that remain true:

1. The credential detection has documented gaps (section 7). They are release blockers by the brief's own rule.
2. At the base version (bf9e1fc2) the approved 2158c43f guard ran only early in `postClientCommentOnceInner`. All routes that send after it, or never pass through it, leaked credential pairs (baseline differential: 36 of 51 transport tests fail on the base tree, section 5).
3. Base `index.js` logged raw customer/model text at the F4 sites (fixed in the candidate), plus further sites that are not fixed (section 6).

## 1. Changed files (full sha256)

Base files (hash-matched to the staging tarball and `INVENTORY.tsv`):

| file | base sha256 |
|---|---|
| index.js | bf9e1fc25a471a578e93c2d4b78b8f787b5e1acc556a3e7f9d4580f24b0d384d |
| faqAssistance.js | 8ff65201adac73453cdd5fd8080c7d43b9cb2cfaca021f1cb0e09a2710e8da6a |
| faqAnswerSelect.js | cb8df44284905f4477ad5b3148a81c6f9664900a897642f85a4c903164b85d5e |
| spreadPublicGuard (approved) | 2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c |

Candidate (`candidate/`):

| file | status | sha256 |
|---|---|---|
| index.js | CHANGED | 48899e132ac36a0e62ac242f5f3c47ba1de7ab336d16a61760634044e60225a7 |
| faqAssistance.js | CHANGED | 62bd9720a70c6798f5b33140c4498392d4443e2567068e7cb043944576a34c5a |
| faqAnswerSelect.js | CHANGED | 52bb121c04dfaefeeada11d4a63d713403bc95a0fe7229e3a7a888727bba5a8b |
| publicCredentialHold.js | NEW | 152f8f61803e5239ef3d26afdddda196fe64509f7c1e8d6124337130410432a1 |
| faqModuleGates.js | NEW | 89039b1b2ff9a81894ebdee4e97ed13f598bed5852a1c00c6fe78a0abcd598b8 |
| spreadPublicGuard.js | UNCHANGED (byte copy of `spreadPublicGuard.2158c43f.js`, `cmp` identical) | 2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c |
| faqApprovedAnswers.js, faqOutboundSafety.js, ownershipBoundary.js, publicReplyBoundary.js, spreadAskGate.js, faq-approved-answers-v12.json | UNCHANGED (`cmp` identical to base) | see `artifacts/MANIFEST.sha256` |

- No file with a 846c225f prefix exists anywhere in the workspace (find and sha256 scan, 0 hits). No such guard was used.
- Diffs vs base: `artifacts/diff_index.patch` (203 lines), `diff_faqAssistance.patch` (56), `diff_faqAnswerSelect.patch` (118).
- Manifest including harness and tests: `artifacts/MANIFEST.sha256`.
- Deployment note: `index.js` now requires `./publicCredentialHold` and `./faqModuleGates` (both in `candidate/`). `faqModuleGates` optionally requires `./faqModuleDetectors` (absent here, MODULE_NOT_FOUND tolerated, so no module is registered and the F1 branch is inert by default).

## 2. Root causes and what each change does

Labels: **SV** = verified in the staging source (hash-matched). **[HI]** = hint from older `luna-current/`. **[AS]** = my assumption. **[ME]** = my own substitute, not real code.

### MT5 hold (SV)

- Every customer-visible message goes through `postReply(..., 'comment', ...)`, then `postReplyWithOwnershipLock`, then `icRequest`, then `icRequestUnguarded`, then `axios` (base L6069, L6073, L238, L272, L317).
- The approved guard (`blocksPublicCredentialPair`) was called at base L6327, early in `postClientCommentOnceInner`. After that call the body changes (welcome intro, assembly, `postProcessModelReply`, `toHtml` at base L6114). Four other public senders (`postDeterministicFlowReply` L7440, owner REPLY 8a L7061 and 8b L7362, FAQ `deps.send` L12061) never pass through that early call at all. The guard also does not see unlabelled, HTML-wrapped or obfuscated pairs.
- Fix: a **hold, not a rewrite**, at three layers. The same module (`publicCredentialHold.js`) runs at each layer.
  - Layer A, final public boundary: `postReplyWithOwnershipLock` (candidate L6137-6143), after `toHtml`. It checks the screened text and the rendered payload.
  - Layer B: top of `icRequest` (candidate L257), before `webhookFastAck.prepareCustomerWrite`. It checks the actual outgoing payload (all nested strings, so attachments and extra fields are covered).
  - Layer C: `icRequestUnguarded` (candidate L303), before any write-op 'pending' record.
  - Held result: `{ok:false, skipped:true, held:true, reason:'credential-hold', holdCode}`. No retry, no queue, no op record.
  - Plan persistence (candidate L7437-7451): a plan body with a pair is never written to `AUTH_COMMAND_FILE`. A body-free marker `{action, held, bodyLength}` is stored instead. `executeOwnerActionPlan` REPLY with `plan.held` posts the staff note and returns `'HELD'`.
- Detection = the existing 2158c43f guard called unchanged, plus my own detector (labelled, unlabelled adjacency, worded/spaced digits, URL values, multilingual labels, homoglyph folding, zero-width characters, base64/hex one level, ROT13). Normalised views are used only for detection; the sent text is never changed.
- Detector failure (exception, oversize input over 200000 characters, hostile `toString`) holds.
- Internal notes (`message_type === 'note'`) are not scanned (design decision, open item 6).

### F2 (SV)

- Automated holds: silent. One body-free log line `[code, length, conversation id]` through `credentialHoldLog`. No note, no assignment.
- Staff-command holds (owner REPLY via plan, owner exact REPLY, FOLLOW exact, FOLLOW plan): fixed note `Reply held by safety check (reason: CODE). Nothing was sent to the customer.` (candidate L7082, L7097, L7400).
- **OWNER WORDING CONFIRMATION REQUIRED** for that note wording.

### F4 (SV)

Nine log sites redacted via `logLen()` / `icErrorCodes()` (candidate lines): L380 (`IC_REQ_FAIL`, now error codes and length only), L1040/L1043, L1244, L4217, L6622, L7028, L9189, L10674. I did not rely on the brief's historical line numbers; the sites were located by content. The list of other log paths I did **not** change is in section 6.

### F5 (SV for faqAnswerSelect; the models are fixed stubs)

- `please` removed from the Roman Urdu cue list.
- New tri-state `languageGate(text, priorTexts)` returns `{lang: en|non-en|uncertain, basis}`. English evidence is at least 2 distinct English function words among at least 3 tokens, in the current text or in prior customer texts. A short catalog term like `payout?` is not English evidence. Non-Latin script or the ES / Roman Urdu cue regexes give non-en.
- The gate runs before the model classifier call (the model call is skipped when uncertain), after the model outcome, and again on the final `model-classify` result. The abstain reason is `language-uncertain` (added to the abstain-fallthrough list in `faqAssistance`).
- Language never establishes intent (tested). The non-English main route is unchanged (differential test against baseline, no model).
- Interpretation [AS]: "gated routes" = the model-classifier route only. Deterministic cue routes (for example `free trial?`) stay ungated. Owner confirmation needed (open item 3).

### F1 (SV for prepare/finishPrepareWithoutPlan; webhookFastAck, lunaEpisode, replyDecision are [ME])

- In `faqAssistance.prepare`, after the ownership/controls/fin-wait/human checks and the `mixed-unowned-escalation` return, and before `requireOwnerApproved` and the selection probe:
  - `!humanOwns` plus a disabled-module detector hit plus language gate `en` returns `{reason:'module-off-fail-closed', terminal:true}`.
  - Gate `uncertain` returns `{reason:'language-uncertain-module-off', terminal:false}` (legacy path, no V12 selection).
  - A detector that throws counts as a hit.
- `module-off-fail-closed` is not in `DEFER_TO_MAIN_PATH`.
- Module hook: `faqModuleGates.register({id, detect, enabled})`. Flags are OFF unless `1/true/on/yes`. Packs/Atom logic is NOT implemented; the optional `./faqModuleDetectors` is where their detectors plug in.
- Side-effect trace (SV unless marked): `prepare` returns terminal, then `finishPrepareWithoutPlan` runs `recover` (no-op) and `log()` (one `FAQ_ASSIST {cid,utc,action,reason}` line) and returns `{handled:true, reason}`. `offer`'s `finally` runs `d.end(cid)` ([ME] lunaEpisode.end). `handleWebhook` then does `res.sendStatus(200)` ([ME] webhookFastAck). The outer `finally` runs `clientReplyInflight.delete`, `scheduleBurstRerun` and `lunaEpisode.end` ([ME]). Not performed: no public reply, no note, no assignment, no model call, no FAQ ledger save (asserted in t3).
- This also silences personal Pack asks in the unowned English case. Open item 1.

## 3. Route matrix

Base line numbers are bf9e1fc2. Candidate lines are in section 2.

Origin reconciliation [AS]: the brief names 12 origins and 11 test paths, and I was not given the 12-origin list. My own source-derived inventory is below. Origin 8 is split into **8a** (owner model follow-through via `executeOwnerActionPlan` REPLY, base L7061) and **8b** (owner exact send in `processAuthorizedNoteCommands`, base L7362). **R1** (burst rerun) and **R2** (auth replay) are re-entries into `handleWebhook`, not new senders. Counting 1-7 plus 8a, 8b, 9 plus R1 and R2 gives 12 (the 12 origins). Tests cover each of them separately (11 test paths; R1 and R2 are covered by two tests and the shared `handleWebhook` route test). I cannot confirm that my numbering equals the brief's.

| # | origin | transformations before send | final sender | check location (candidate) | ownership checks | queue / retry / stored op | content can change after the check? |
|---|---|---|---|---|---|---|---|
| 1 | `postClientCommentOnce(Inner)` (base L6287/L6301) generated, rephrased, mixed assembly | early guard L6327; welcome intro; assembly; `postProcessModelReply` | `postReply` (`__posted`, base L6701) | early 2158c43f guard (kept), then Layer A, B, C | `postReplyWithOwnershipLock` | retried only through `icRequest` retry; a held send is never queued | Early guard: yes (that was the base gap). Layer A runs after `toHtml`, so after Layer A no. |
| 2 | `postDeterministicFlowReply` (base L7440) | none beyond `postReply` | `postReply` | Layer A, B, C (never had the early guard) | lock | same | no |
| 3 | `completeNonAccountEscalation` (base L2381) | goes through `postClientCommentOnce` | origin 1 | as 1 | as 1 | as 1 | as 1 |
| 4 | FAQ `deps.send` (base L12061) | approved body | `postReply` | Layer A, B, C | lock; `faqAssistance` ownership checks | `faqAssistance` ledger | no |
| 5 | exports / `__setTestDoubles` (base L11834/L11931) | replace `icRequest`/`icRequestUnguarded` | n/a | doubles replace layers B and C only, Layer A still runs. Tests do not use doubles for transport proof. | | | n/a |
| 6 | `icRequest` direct (base L238) | none | `icRequestUnguarded` | Layer B, C on the real payload | `retryPermission` re-check (base L309) | write-op store (Layer C is before 'pending') | no |
| 7 | direct `axios` (base L317, plus GET and `conversations/search` POSTs L11568/L11698/L11732) | n/a | none carries public content (GET and search reads only) | n/a | n/a | n/a | n/a |
| 8a | owner model follow-through (base L7061) | `interpretOwnerCommandViaLlm` (L6964) plan, `postProcessModelReply` | `postReply` | Layer A; plan hold before persistence (candidate L7437) | owner authz | plan persisted at base L7399, deleted at L7423, reused on retry. Candidate persists a body-free marker if held. | no |
| 8b | owner exact send / FOLLOW exact (base L7362) | `postProcessModelReply` | `postReply` | Layer A, plus the plan hold in FOLLOW | owner authz | same ledger | no |
| 9 | persisted plan from an older version (body with a pair, pending) | none | `executeOwnerActionPlan` | Layer A on retry; body removed at completion | owner authz | `AUTH_COMMAND_FILE` | no |
| R1 | burst rerun (`scheduleBurstRerun`, base L6206) | re-enters `handleWebhook` | origin 1 | as 1 | as 1 | re-evaluated on rerun | as 1 |
| R2 | auth replay (`replayAuthDeferred`, base L215; `deferForAuth`) | re-enters `handleWebhook` | origin 1 | as 1 | as 1 | deferred ops replayed, re-screened | as 1 |

Writes that carry no body (close, open, assignment) and internal notes are not part of the hold. A held automated reply therefore produces no assignment or note.

## 4. Executed tests (all raw outputs in `artifacts/raw/`)

All run from `/workspace/staging-repair-t739` on the candidate tree under `unshare -rn` (no network namespace) unless marked baseline.

| command | result |
|---|---|
| `unshare -rn node tests/t1_detector.js` | 50 passed, 0 failed, 50 total (rc 0) |
| `unshare -rn node tests/t2_transport.js` | 51 passed, 0 failed, 51 total (rc 0) |
| `unshare -rn node tests/t3_faq_language_module.js` | 29 passed, 0 failed, 29 total (rc 0) |
| `unshare -rn node tests/t4_logs.js` | 6 passed, 0 failed, 6 total (rc 0), `RESIDUAL_LOG_LINES 0` |
| `unshare -rn node tests/t5_isolation.js` | 10 passed, 0 failed, 10 total (rc 0) |
| `TREE=baseline unshare -rn node tests/t2_transport.js` | 15 passed, 36 failed, 51 total (rc 1) |
| `TREE=baseline unshare -rn node tests/t3_faq_language_module.js` | 14 passed, 3 failed, 17 total (rc 1, the candidate-only tests do not run on baseline) |
| `TREE=baseline unshare -rn node tests/t4_logs.js` | 2 passed, 4 failed, 6 total (rc 1) |

Notes:
- The baseline differential proves the tests are not vacuous. Baseline leaks on postReply, postDeterministicFlowReply, FAQ send, layers B and C, owner REPLY and FOLLOW, persisted plan, handleWebhook, auth replay and burst rerun. It also leaks on `postClientCommentOnce` for every variant except the labelled one that the 2158c43f guard sees.
- Preserved behavior: the observation lines (OBS) for unowned V12 offer, owned V12 send and STOP history are identical between candidate and baseline (`cand_t3_*.out` vs `base_t3_*.out`). V12 still has exactly 12 sendable answers and each is still selected. Ownership, STOP, aiOff/paused, Risk/Escalations silence, fin-wait precedence, duplicate prevention, locks and the non-English main route are tested.
- Model stubs are **fixed outputs and test enforcement only. They say nothing about model quality.**
- The staging tarball contained no test files. I ran the historical [HI] suites from `luna-current/07_selftests` in a flat tree under `unshare -rn` (`artifacts/raw/hi_*.out`). They test the OLD snapshot, not the staging files, so they are not evidence for the candidate. rc and raw results: audit-harden rc0 27 ok; coverage-morphology rc0 13; escalate-related-only rc0 19; identity-escalate-gates rc0 17; identity-question-not-human-request rc0 7; missedq-clarify-escalate rc0 5; scope-decline-not-escalated rc0 3; smalltalk-missedq rc0 27; soft-edges rc0 15; wrongtopic-client-raised-reset rc0 4; escalate-ack-norepeat rc0 12; fin-wait rc0 6; promo-prompt rc1 (23 ok lines); owner-cmd-router rc1 (15 ok lines); faq-orphan-and-country rc1 (3 ok, 4 fail); faq-reset-time-retrieval rc1 (2 ok, 3 fail); lock-harden and review-status-direct rc1 with 0 parsed lines; identity-before-escalate and reply-spacing 0 parsed lines. I did **not** diagnose the rc1 results; they are not attributable to the candidate.

## 5. Isolation proof

- OS level (`t5_isolation`, under `unshare -rn`): only loopback exists (A1); DNS for `api.intercom.io` fails with EAI_AGAIN (A2); a raw TCP connect to a public IP fails with ENETUNREACH (A3).
- In-process: `harness/netblock.js` refuses and records net/tls/http/https/dns/fetch/child_process (B1). Every suite asserts zero egress attempts.
- The recorder is at the axios **adapter** level, BELOW axios. The real `icRequest`/`icRequestUnguarded` and axios stack run above it and the real code builds the headers (B2). A direct axios call to an external host also lands at the recorder (B3).
- Credentials are synthetic: Intercom/OpenAI env tokens are fake strings, the test login is 99999001 and the password is `Fake#Pass1` (B4).
- Init side effects (`artifacts/raw/resolution_and_init.out`): state files are only `control.json` and `system-prompt.txt` in a fresh temp dir. Zero egress attempts and zero recorded Intercom requests at init. Generic-stub calls at init: only `logRedact.install` and `luna-maintainer.create` (inert). No server is listening (C2). Packs/Atom flags are OFF by default (C3).
- Setup disclosure: `npm install` was run to obtain `axios`, `express`, `openai`, `dotenv` and `body-parser` in `node_modules`. This is the only network use. It happened before the tests and is not part of any test run. The `openai` package itself is replaced in the harness by the fixed stub.
- Test copy of the tree: byte-identical to the candidate except one appended `module.exports.__t = {...}` statement in `index.js`. `verifyStripped` proves that the copy minus that statement equals the candidate's sha256.
- Not real code in the harness (full list in `artifacts/raw/resolution_and_init.out`): 17 modules from [HI] `luna-current` (some wrapped by `hiPatches`, which adds functions I wrote [ME]); 33 modules resolved to [ME] stubs (30 hand-written, including `webhookFastAck`, `lunaEpisode`, `replyDecision`, `writeOpStore`; 3 generic inert Proxy stubs: `logRedact`, `luna-maintainer`, `generalAccountAskGuard`); `spreadAskGate` resolved from the tree. The behavior of layer B in particular is proven only with the stub `webhookFastAck` store. A reviewer must repeat that with the real module.

## 6. F4: log paths NOT changed (static grep, not proven to carry customer text)

`artifacts/f4_unredacted_log_candidates.txt` lists 86 console sites in `candidate/index.js` that print `e.message`, `e.stack`, `JSON.stringify(...)` or `.slice(` and that I did not change. Sites I consider most likely to carry content, for review first: L3832 (attachment name slice), L8188 (`JSON.stringify(route.log)`), L8474/L8480/L8506 (turn intent/diag JSON), L8714 (`planIntent`), L8953 (`__whyS.slice(0,60)`), L9832 (pending-ask JSON), L11289 (`WEBHOOK_ERR` with `e.stack`), and the many `e && e.message` sites (an upstream error message can embed request text). `logRedact` is missing from the staging tree [ME], so I cannot say what it redacts at runtime. t4 observed 0 lines containing the sentinel on the exercised routes only; that is not a proof for unexercised paths.

## 7. Detection gaps (remaining release blockers)

From `KNOWN_GAPS` in `publicCredentialHold.js`:
1. A pair split across two separate public messages (no cross-message memory at the send boundary).
2. A password given only as spaced, worded or per-letter characters (login digits are folded, password characters are not).
3. A paraphrased secret with no label word and no adjacency or strong-token shape.
4. A purely alphabetic labelled secret without an internal capital.
5. Reversed, shifted (other than ROT13), compressed, encrypted or steganographic encodings; base64/hex only one level deep.
6. Label words in languages or scripts not in the built-in lists.
7. A login or password only inside an image, attachment or link target outside the message body.
8. A single login without a password, and a lone labelled password without a login (policy: the hold needs a pair).

Also: the early 2158c43f guard still sees only its own patterns; my detector is additive.

## 8. Open dependencies and owner decisions

1. F1 silences personal Pack asks for unowned English conversations when the module is OFF and a detector is registered. No detector is shipped, so this is inert until Packs/Atom register one. Confirm the intent.
2. The `mixed-unowned-escalation` return precedes the F1 branch, so F1 does not cover mixed turns.
3. "Gated routes" interpretation: only the model-classifier route is gated, and deterministic cue routes are ungated.
4. Lone-password policy (not held).
5. **OWNER WORDING CONFIRMATION** for the staff hold note text.
6. Internal notes are not scanned (a staff-only note can still contain a pair).
7. Packs/Atom detectors (`./faqModuleDetectors`) are not implemented; the hook is `faqModuleGates.register`.
8. Missing from the staging tree (all [ME]/[HI] in the harness): `webhookFastAck`, `lunaEpisode`, `replyDecision`, `writeOpStore`, `logRedact`, `luna-maintainer`, `generalAccountAskGuard` (generic inert stub), and others in section 5. The real modules need a review run.
9. The list of 12 origins from the brief was not provided; the reconciliation in section 3 is [AS].
10. Needs an independent reviewer. Nothing here is a PASS.

## 9. Files in this branch

`candidate/` (frozen), `base/` (hash-matched originals), `harness/`, `tests/`, `artifacts/` (this report, `MANIFEST.sha256`, `INVENTORY.tsv`, diffs, `raw/` outputs).
