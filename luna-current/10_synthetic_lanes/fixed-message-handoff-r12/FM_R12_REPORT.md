# Fixed-message handoff R12 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/fixed-message-handoff-r11-8ad1` at `1a5c35f754d5d5e80336a24b7371676e52ce9bf6`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `human-7`, `human-9`). The tests use an in-process recording transport and a temporary op-store file. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

R11 status-ping FAQ ordering, lost-handoff op records, wrong-assignee retry, and the challenge clarifier are unchanged. Owner authentication, empty-FAQ answers, team-will-review regeneration, and dictionary-word taint exclusion stay as they were in R10.

## What changed

Six review classes are closed on top of the R11 runtime.

1. **Urdu, Arabic, and Hindi human requests are stemmed, not listed.** `containsToken` and `stripHandoffTokens` stem those three languages. Urdu and Arabic drop harakat, fold yeh variants, and remove plural and oblique endings (`وں`, `ین`, `ات`, `ان`, final `ہ` / `ے`) while the stem stays at least three letters. Arabic also drops a leading `ال`. Hindi drops `यों`, `याँ`, `وں`, `یں`, `ो`, and `े` the same way. `نمائندہ`, `نمائندے`, `نمائندوں`, and the yeh spelling `نمایندے` share one stem. `الموظفين` stems to `موظف`. `प्रतिनिधियों` stems to `प्रतिनिधि` and `एजेंटों` stems to `एजेंट`. Those inflected spellings are not in `GRAMMAR`. `ما هي قواعد السحب؟` stays `route_normal`. English and the other languages stay on the previous matcher.

2. **Write success is one strict judgment.** `classifyWriteOutcome` is that judgment. `error.list` or a non-empty `errors` array is a definite failure even when an id is present (`confirm` false, `unknown` false, reason `errors`), so `shouldSkipReplay` does not block the next attempt. An assignment is confirmed only when the response names the requested assignee. A different name is `wrong-assignee`. No name is `assignee-unconfirmed`. Both are failed, not unknown. A matching assignee confirms even when the body has no conversation id. `commit` uses the same judgment. An explicit `partial: true` flag is still ambiguous, which is what the R3 partial fixture requires. A synthetic 2xx body with no assignee field and no errors is still a successful assignment inside `commit`, so the older recording transports stay green. The op store does not treat that unnamed body as a confirmed assignment.

3. **The fixed line is not posted while the live assignee is still the bot.** If the conversation assignee is the bot, a parts record is not enough: `commit` assigns again. A response that names the bot, or any other seat, does not post. The runtime passes `requireLiveAssignee` and, before the customer line, refetches the conversation. If that live seat is still Luna or Elite, or is not the intended seat, the post is withheld, the stored assignment confirmation is invalidated, and the handoff stays `assignment-pending` so the next turn can assign again. A response that names the intended seat may post. Once the conversation itself holds that seat, the missing note is rewritten if needed and the fixed line is posted once.

4. **A 422 on the customer comment is not a lost handoff.** Top-level status 422, or a 422 carried on the error object when the top-level status is missing, is a definite miss. It sets `commentRejected` to `422` and does not set `messageAmbiguous`. After the note is removed, `resumeLostHandoff` still resumes from the assignment op record. If the seat is held, the note is rewritten and the fixed line is posted once. If the seat is still the bot, the turn holds with `assignment_unverified` and keeps the assignee id. A later turn that already shows the fixed line does not post it again.

5. **An empty presend result list does not throw.** `statePresend.gate` treats a missing `results[0]` as an empty hard-fail list. The clarifier short-circuit (`Please tell me which challenge you mean.`, `results: []`) is posted. It is not replaced by the number hedge and it is not held as `error-fail-closed`.

6. **The Arabic account line uses fatha then shadda.** On `تُغيَّر`, the yeh cluster is U+064E then U+0651, which is the NFC order. The previous shadda-then-fatha bytes do not match. Every `FIXED_MESSAGES` line (`en`, `ur`, `ar`, `hi`, `it`) and every `ACCOUNT_QUESTION_LINES` line is byte-compared to a frozen hex value.

## Kept

Successful note, then successful assignment, then one fixed message. Assignment 500, timeout, 422, and an explicit partial success withhold the message and `escalateAwaitingFirstTeammate`. A definite assignment 422 stays `assignment-pending`. An ambiguous assignment is not replayed. A human note does not count as this bot's handoff note. The approved number hedge stays terminal for unsupported figures and for a FAQ answer that still promises a team review. `credentialSanitizer.js`, `escalateRelatedOnly.js`, and `targetedRegeneration.js` are unchanged from the R11 freeze. The R2 through R11 tests were not edited.

## Tests

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r12/fixedMessageHandoff.test.js`

6 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r11/fixedMessageHandoff.test.js`

5 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r10/fixedMessageHandoff.test.js`

7 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r9/fixedMessageHandoff.test.js`

5 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r8/fixedMessageHandoff.test.js`

7 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r7/fixedMessageHandoff.test.js`

9 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r6/fixedMessageHandoff.test.js`

9 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r5/fixedMessageHandoff.test.js`

8 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r4/fixedMessageHandoff.test.js`

10 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r3/fixedMessageHandoff.test.js`

33 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.test.js`

16 passed, 0 failed.

`node luna-current/08_repair_tests/run-suite.js`

Protected prompt and FAQ hashes match. Syntax check passed. Adversarial `current_checks.js` passed 58/58. Eighteen included selftests passed. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R11 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate.

`node --check` passed on `fixedMessageHandoff.js`, `index.js`, `writeOpStore.js`, and `statePresend.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `a466d7665ef96808240ce8e7ec59f366eec359fdbba9f6bdf3536b7b022f1f4c` |
| `luna-current/01_runtime/index.js` | `4bd065dd5e5b7d7c14ddf5de656c1a19c59ab1134c6fe4c16c27ea704425a0b0` |
| `luna-current/01_runtime/writeOpStore.js` | `b69d7694880bbd1167f5df2cecb0d2b391ae83691e80d2d6ea889aeca73c4766` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r12/fixedMessageHandoff.test.js` | `fdccabdd442d3f3b6ed4fcc2c608f50e698c42a113d650a109ee57766dbb5e04` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |
