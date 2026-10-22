# Fixed-message handoff R11 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/fixed-message-handoff-r10-8ad1` at `c4553a93f20751b84ebdca5fb21cc7703af84a03`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `human-7`, `human-9`). The tests use an in-process recording transport and a temporary op-store file. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

R10 owner authentication, write-success rules, empty-FAQ answers, team-will-review regeneration, dictionary-word taint exclusion, verbatim owner commands, and the earlier handoff sequence are unchanged.

## What changed

Four regression classes are closed on top of the R10 runtime.

1. **Status pings do not swallow KB FAQs.** `isStatusPing` checks `isClearKbFaqAsk` before the update/status regex. "Is news trading allowed?" and "How long do payouts take?" are clear FAQ asks (the payout-duration pattern now accepts the plural "payouts") and fall through to the FAQ answer. "I am still waiting on my payout" and "any update?" stay status pings. With no pending case, those two still use `STATUS_PING_CLARIFY`. While a teammate is awaited, they stay `STATUS_ONLY`.

2. **Lost-handoff recovery uses Luna's assignment op record.** `writeOpStore` stores a confirmed assignment with the conversation id, the intended assignee, and the admin who made it. On restart, `resumeLostHandoff` treats that seat as this handoff's assignee when the note part is gone. It is not a foreign human owner. If the seat is still held, the missing note is rewritten and the fixed line is posted once. If the assignment is not on the conversation or in the parts, the turn holds and does not post the fixed line. A different human, an ambiguous write, or a line that is already public does not resume and does not post again.

3. **A 200 that names the wrong assignee is not confirmed.** `classifyWriteOutcome` returns `wrong-assignee` (failed, not unknown) when the response names a different assignee than the request. The op record is not `confirmed`, so the next assignment is not replay-suppressed. `commit` leaves `assignConfirmed` false and the retry assigns the intended seat, then posts the fixed line once.

4. **A legitimate challenge clarification is not the number hedge.** "Please tell me which challenge you mean." is returned as `challenge-clarifier` from `safeFallback` and `runWithRegeneration`, including when presend marks it `MISSED_QUESTION`. A draft that still says "the team will review" after one regeneration still becomes the approved number hedge.

## Kept

Successful note, then successful assignment, then one fixed message. Assignment 500, timeout, 422, and partial success withhold the message and `escalateAwaitingFirstTeammate`. A definite 422 stays `assignment-pending`. An ambiguous assignment is not replayed. A human note does not count as this bot's handoff note. The approved number hedge stays terminal for unsupported figures and for a FAQ answer that still promises a team review. `challengeVariantGuard.js`, `softEdges.js`, `imageAskGuard.js`, `teammateHandoffGates.js`, `statePresend.js`, `textUtils.js`, `credentialSanitizer.js`, and the R4 through R10 tests are unchanged from the R10 freeze.

## Tests

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

Protected prompt and FAQ hashes match. Syntax check passed. Adversarial `current_checks.js` passed 58/58. Eighteen included selftests passed. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R10 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate.

`node --check` passed on `fixedMessageHandoff.js`, `index.js`, `writeOpStore.js`, `escalateRelatedOnly.js`, and `targetedRegeneration.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `8589b87da32ad17ce30e34fd2da05f504af72e3da129b4b094cb3b5926b1f4be` |
| `luna-current/01_runtime/index.js` | `240b2d893fb649fd27387b93b5a90c93c891dda935da8f7099f6c064602abbad` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/01_runtime/writeOpStore.js` | `bf454d7b4b1003aa95862f062d8dcd4e409845779f1a85e87ec5446664190f44` |
| `luna-current/01_runtime/challengeVariantGuard.js` | `0d6fff5f5330091c4f8ca02f5ae189845b386922c944d8a7b152970cdc43d12d` |
| `luna-current/01_runtime/teammateHandoffGates.js` | `96eaf4ce75a0eb888cdabb5552a7e90996cdde2278721a8958e7991032e4ca2b` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r11/fixedMessageHandoff.test.js` | `9ab07da887cac9b55ea73b030906176fbda6b905c3845eee776c95aac9a65ca3` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r10/fixedMessageHandoff.test.js` | `090696eb1588731f705a5d6561dfe21b103301cd72473f7c3b755477e518396c` |

`challengeVariantGuard.js`, `teammateHandoffGates.js`, `credentialSanitizer.js`, and the R4 through R10 tests match the R10 freeze. This report's own SHA-256 is not written inside itself. It is recorded in the freeze commit message.

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- Not a release. No production, VPS, Intercom call, secret, deploy, or merge was performed.
- No live webhook or customer conversation was used.
