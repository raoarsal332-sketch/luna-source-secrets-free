# Independent review — fixed-message handoff R2

Verdict: **NEEDS CHANGES**

This review is not an approval. The draft was not merged, approved, activated, wired, or deployed. No production, VPS, Intercom, secret, or customer data was used. Fixtures are synthetic.

## Artifact identities

| Item | Identity |
|---|---|
| PR | https://github.com/raoarsal332-sketch/luna-source-secrets-free/pull/14 |
| Branch | `cursor/fixed-message-handoff-r2-c90d` |
| Commit | `c9548cc7d7be89cd622415b01da97face8f25be8` |
| `fixedMessageHandoff.js` | `9c9f6eed451748d5a40205ae3828b64d014477e4feb1ea598c41d655bb200e3c` |
| `fixedMessageHandoff.test.js` | `b5399271cee444f0d522ea4d3a32ee09ae1f4e8768c6f9ce61e7c9ea6aecc251` |
| `FM_R2_REVIEW_PREP.md` | `99e5947a3cfdf3f6d0bfb0cb465caf103ce641ed166f8f5b0d09aa1bdfa97610` |
| `luna-current/01_runtime/index.js` | `512b76e3d2ce9e5721b21d88c91ae0aabbb12e750f7310bd03ae4d843aa72c31` |

The three packet hashes match the hashes published on PR 14. That match identifies the bytes under review. It is not acceptance.

## Historical acceptance

Prior tree `b02e38e7` is not a valid object in this clone and was not found on any fetched ref. No sealed-set files were present on the reviewed tree. This review claims no historical acceptance. The author note of 0 critical on that tree was not re-checked and is not evidence.

The author packet tests were not executed. They are not the oracle for this review.

## What the packet implements

`decideFixedMessageHandoff` copies the current welcome selector (`lockedFinHandoffWelcome` and the send condition around `index.js` 3763-3777). It does not post an internal note, does not assign, and does not wait for either operation to succeed. `behaviorChange` is false and the module is not called from `index.js`. Merging the packet would not implement the fixed-message handoff design.

The live design that was inspected sends a customer-facing line first. The required order is successful note, then successful assignment, then one fixed message.

## Case results

11 passed, 29 failed, 25 critical failures.

Exact Risk and Escalations team ids stayed silent for Urdu, Arabic, and Hindi on the live webhook path. A substantive English account question did not take the welcome. An identical welcome write was not replayed after a confirmed send or after an unknown timeout, and an overlapping webhook was skipped. Those passes do not authorize the first customer send.

| Case | Result | Severity | Path | Actual |
|---|---|---|---|---|
| `C0` | FAIL | critical | `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:decideFixedMessageHandoff` | action fixed_message or allow, with no handoff operations |
| `C1` | FAIL | critical | `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:decideFixedMessageHandoff` | Hello Synthetic, how can I help? |
| `C2` | PASS | critical | `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:isVagueOrLiveAgentOnlyAsk` | allow null |
| `C3` | FAIL | critical | `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:isVagueOrLiveAgentOnlyAsk` | fixed_message Hello, how can I help? |
| `C4-ur` | FAIL | blocking | `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:lockedFinHandoffWelcome` | allow null |
| `C4-ar` | FAIL | blocking | `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:lockedFinHandoffWelcome` | allow null |
| `C4-hi` | FAIL | blocking | `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:lockedFinHandoffWelcome` | allow null |
| `C5-ur` | FAIL | critical | `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:isVagueOrLiveAgentOnlyAsk` | fixed_message السلام علیکم، میں آپ کی کیا مدد کر سکتا ہوں؟ |
| `C5-ar` | FAIL | critical | `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:isVagueOrLiveAgentOnlyAsk` | fixed_message السلام علیکم، میں آپ کی کیا مدد کر سکتا ہوں؟ |
| `C5-hi` | FAIL | critical | `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:isVagueOrLiveAgentOnlyAsk` | fixed_message Hello, how can I help? |
| `C6` | FAIL | critical | `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:decideFixedMessageHandoff` | fixed_message السلام علیکم، میں آپ کی کیا مدد کر سکتا ہوں؟ |
| `C7` | FAIL | critical | `luna-current/01_runtime/teammateHandoffGates.js:isHumanTeammatePublicReply` | fixed_message |
| `C8` | PASS | blocking | `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:lockedFinHandoffWelcome` | secret absent; action allow |
| `C9` | FAIL | blocking | `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:firstNameFromClient` | {"urduGreeting":"السلام علیکم، میں آپ کی کیا مدد کر سکتا ہوں؟","hindiGreeting":"Hello, how can I help?"} |
| `C10` | PASS | info | `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.test.js` | not executed |
| `S1-1` | FAIL | critical | `luna-current/01_runtime/index.js:3685` | customer message is attempted first |
| `S2-1` | FAIL | critical | `luna-current/01_runtime/index.js:4233` | customer message is attempted first |
| `S2-2` | FAIL | critical | `luna-current/01_runtime/index.js:4369` | customer message is attempted first |
| `S2-3` | FAIL | critical | `luna-current/01_runtime/index.js:4575` | customer message is attempted first |
| `S3` | FAIL | critical | `luna-current/01_runtime/index.js:3776` | postClientCommentOnce then return |
| `S4` | FAIL | critical | `luna-current/01_runtime/index.js:4301` | flag is set after a failed or skipped assign as long as the note returned ok |
| `S5` | FAIL | critical | `luna-current/01_runtime/teammateHandoffGates.js:251` | defer returns skip false and the welcome gate can send |
| `R1` | FAIL | critical | `luna-current/01_runtime/index.js:3763` | order comment, public 1 |
| `R2` | PASS | critical | `luna-current/01_runtime/index.js:3573` | public 0 order none |
| `R3` | PASS | critical | `luna-current/01_runtime/index.js:3568` | public 0 |
| `R4` | PASS | critical | `luna-current/01_runtime/index.js:3573` | public 0 |
| `R5` | FAIL | critical | `luna-current/01_runtime/index.js:3752` | public 1 order comment |
| `R6` | FAIL | critical | `luna-current/01_runtime/teammateHandoffGates.js:isHumanTeammatePublicReply` | public 1 |
| `R7` | FAIL | critical | `luna-current/01_runtime/index.js:3684` | order comment,note,assignment, secretInComment false, secretInNote true |
| `R8` | FAIL | critical | `luna-current/01_runtime/index.js:4231` | order comment,note,assignment, noteStatus 200, assignStatus 500, secretInComment false, secretInNote true |
| `R9` | FAIL | critical | `luna-current/01_runtime/index.js:4231` | public 1 assignAttempts true order comment,note,assignment |
| `R10` | FAIL | critical | `luna-current/01_runtime/index.js:4231` | order comment,note |
| `R11` | PASS | critical | `luna-current/01_runtime/index.js:3763` | public 0 order none |
| `R12` | FAIL | critical | `luna-current/01_runtime/index.js:2534` | public 1 script arabic-script |
| `R13` | FAIL | critical | `luna-current/01_runtime/index.js:2552` | public 1 script latin |
| `R14` | PASS | critical | `luna-current/01_runtime/writeOpStore.js:shouldSkipReplay` | firstPublic 1 secondPublic 0 firstWrites 1 |
| `R15` | PASS | critical | `luna-current/01_runtime/writeOpStore.js:shouldSkipReplay` | firstAttempts 1 replayAttempts 0 |
| `R16` | PASS | critical | `luna-current/01_runtime/index.js:3536` | during 0 after 1 |
| `R17` | FAIL | critical | `luna-current/01_runtime/index.js:4262` | awaiting true order comment,note,assignment |
| `R18` | PASS | info | `/tmp/luna-handoff-r2-vk8VsT/state` | /tmp/luna-handoff-r2-vk8VsT/state |

## Critical findings

### C0 — Packet contains no note or assignment executor

Path: `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:decideFixedMessageHandoff`

decideFixedMessageHandoff returns a customer message and never posts a note or an assignment. The required order cannot be enforced.

Expected: note success, then assign success, then fixed message

Actual: action fixed_message or allow, with no handoff operations

### C1 — Fixed message is returned when note and assign have not succeeded

Path: `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:decideFixedMessageHandoff`

noteOk, assignOk, and handoffSucceeded are ignored. teamAssigneeId is ignored.

Expected: no customer message

Actual: Hello Synthetic, how can I help?

### C3 — Short account-number ask plus a live-agent phrase still sends the fixed message

Path: `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:isVagueOrLiveAgentOnlyAsk`

Non-latin characters and the live-agent phrase are stripped. A short remainder is classified as vague, so an account-number question becomes a customer message with no handoff.

Expected: no customer message before identity handling and a successful handoff

Actual: fixed_message Hello, how can I help?

### C5-ur — Urdu account-number question must not emit a premature or English-only fixed message

Path: `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:isVagueOrLiveAgentOnlyAsk`

Script other than Latin is removed before the vagueness length check, so the account question collapses into a live-agent welcome.

Expected: no customer message

Actual: fixed_message السلام علیکم، میں آپ کی کیا مدد کر سکتا ہوں؟

### C5-ar — Arabic account-number question must not emit a premature or English-only fixed message

Path: `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:isVagueOrLiveAgentOnlyAsk`

Script other than Latin is removed before the vagueness length check, so the account question collapses into a live-agent welcome.

Expected: no customer message

Actual: fixed_message السلام علیکم، میں آپ کی کیا مدد کر سکتا ہوں؟

### C5-hi — Hindi account-number question must not emit a premature or English-only fixed message

Path: `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:isVagueOrLiveAgentOnlyAsk`

Script other than Latin is removed before the vagueness length check, so the account question collapses into a live-agent welcome.

Expected: no customer message

Actual: fixed_message Hello, how can I help?

### C6 — Risk ownership is not visible to the packet, so a Risk conversation still gets a fixed message

Path: `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:decideFixedMessageHandoff`



Expected: silence

Actual: fixed_message السلام علیکم، میں آپ کی کیا مدد کر سکتا ہوں؟

### C7 — Ambiguous teammate author type fails open and the fixed message is released

Path: `luna-current/01_runtime/teammateHandoffGates.js:isHumanTeammatePublicReply`

Author type teammate is not admin, so humanTeammateAlreadyRepliedPublic is false. Missing part_type is also ignored. The packet then sends.

Expected: silence

Actual: fixed_message

### S1-1 — identity-recovery promise is posted before note and assignment

Path: `luna-current/01_runtime/index.js:3685`

In the source window, postClientCommentOnce is at offset 223, note at 1045, assign at 1334. Assignment failure is only logged.

Expected: note, then assign, then customer message, and only after both succeed

Actual: customer message is attempted first

### S2-1 — main escalate promise is posted before note and assignment

Path: `luna-current/01_runtime/index.js:4233`

In the source window, postClientCommentOnce is at offset 208, note at 995, assign at 1272. Assignment failure is only logged.

Expected: note, then assign, then customer message, and only after both succeed

Actual: customer message is attempted first

### S2-2 — main escalate promise is posted before note and assignment

Path: `luna-current/01_runtime/index.js:4369`

In the source window, postClientCommentOnce is at offset 226, note at 987, assign at 1288. Assignment failure is only logged.

Expected: note, then assign, then customer message, and only after both succeed

Actual: customer message is attempted first

### S2-3 — main escalate promise is posted before note and assignment

Path: `luna-current/01_runtime/index.js:4575`

In the source window, postClientCommentOnce is at offset 142, note at 905, assign at 1045. Assignment failure is only logged.

Expected: note, then assign, then customer message, and only after both succeed

Actual: customer message is attempted first

### S3 — Fin handoff welcome is a customer send with no note and no assignment

Path: `luna-current/01_runtime/index.js:3776`

The gate at the FIN_HANDOFF_WELCOME log posts lockedFinHandoffWelcome and returns. No note or assignment is attempted.

Expected: no customer message until note and assign succeed

Actual: postClientCommentOnce then return

### S4 — Awaiting-teammate state is set even when assignment fails

Path: `luna-current/01_runtime/index.js:4301`

After ESCALATE_ASSIGN_FAILED is logged, the same block still sets escalateAwaitingFirstTeammate. A later related turn can send a status line that says the team already has the case.

Expected: awaiting flag only after assign succeeds

Actual: flag is set after a failed or skipped assign as long as the note returned ok

### S5 — Human assignment does not by itself silence a live-agent ask

Path: `luna-current/01_runtime/teammateHandoffGates.js:251`

The last return in shouldDeferToHumanTeammate is skip false. A non-greeting live-agent ask still falls through when a human is assigned or has already replied, unless a narrower external-handoff rule matches. The welcome gate then runs.

Expected: silence on human-owned conversations

Actual: defer returns skip false and the welcome gate can send

### R1 — Welcome path sends a customer message with no note and no assignment

Path: `luna-current/01_runtime/index.js:3763`

Executed handleWebhook. FIN_HANDOFF welcome path.

Expected: no customer message before note and assign succeed

Actual: order comment, public 1

### R5 — Human-assigned conversation still receives the fixed welcome

Path: `luna-current/01_runtime/index.js:3752`

admin_assignee_id 424242 is a human seat. shouldDeferToHumanTeammate does not skip this live-agent ask, and the welcome gate does not read assignment.

Expected: silence

Actual: public 1 order comment

### R6 — Ambiguous admin part shape fails open into the fixed welcome

Path: `luna-current/01_runtime/teammateHandoffGates.js:isHumanTeammatePublicReply`

The admin body has no part_type, so it is not treated as a human reply.

Expected: silence when ownership shape is ambiguous

Actual: public 1

### R7 — Identity recovery sends the customer promise before note and assignment

Path: `luna-current/01_runtime/index.js:3684`

Customer comment is first (index.js:3684). The note keeps the synthetic credential because sanitizeEscalateProblem (index.js:545) never calls credentialSanitizer. The customer comment does not echo it.

Expected: note, assign, then message; secret absent from every write

Actual: order comment,note,assignment, secretInComment false, secretInNote true

### R8 — Assignment HTTP 500 still leaves the customer promise already sent

Path: `luna-current/01_runtime/index.js:4231`

Main escalate path. HTTP 500 on assignment is stored as unknown and is not success. The customer comment was already accepted.

Expected: no customer message when assign returns 500

Actual: order comment,note,assignment, noteStatus 200, assignStatus 500, secretInComment false, secretInNote true

### R9 — Assignment timeout is an unknown outcome and the promise was already sent

Path: `luna-current/01_runtime/index.js:4231`

icRequest reports the assignment as unknown and does not retry it. The customer write already happened.

Expected: no customer message when assignment times out

Actual: public 1 assignAttempts true order comment,note,assignment

### R10 — Note failure still follows a customer promise

Path: `luna-current/01_runtime/index.js:4231`

Note 422 happens after the customer comment. Assignment is then skipped, awaiting is not marked, and the promise remains.

Expected: no customer message when the note is rejected

Actual: order comment,note

### R12 — Urdu account question mixed with a live-agent phrase takes the fixed welcome

Path: `luna-current/01_runtime/index.js:2534`

Same vagueness collapse as the packet. The runtime welcome path sends. arabic-script here is the existing Urdu welcome line.

Expected: no fixed welcome for an account-number question

Actual: public 1 script arabic-script

### R13 — Hindi account question mixed with a live-agent phrase is not served in Hindi

Path: `luna-current/01_runtime/index.js:2552`

Devanagari is stripped by the vagueness check and is not a branch in lockedFinHandoffWelcome. A latin script class means the English welcome was the customer message.

Expected: no English fixed welcome

Actual: public 1 script latin

### R17 — Partial success marks the case awaiting a teammate after a rejected assignment

Path: `luna-current/01_runtime/index.js:4262`

422 assignee_not_found is a failed assignment. The customer promise was already sent and the awaiting flag is still set.

Expected: awaiting flag clear when assign is rejected

Actual: awaiting true order comment,note,assignment

## Other blocking findings

- `C4-ur` `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:lockedFinHandoffWelcome`: Urdu handoff ask does not select a Urdu fixed message. The gate stays closed, so this is a language gap, not a premature send.
- `C4-ar` `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:lockedFinHandoffWelcome`: Arabic handoff ask does not select a Arabic fixed message. The gate stays closed, so this is a language gap, not a premature send.
- `C4-hi` `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:lockedFinHandoffWelcome`: Hindi handoff ask does not select a Hindi fixed message. The gate stays closed, so this is a language gap, not a premature send.
- `C9` `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:firstNameFromClient`: firstNameFromClient keeps only Latin-1 letters, so Urdu, Arabic, and Hindi names are dropped.

## Uncovered paths

- `index.js` reply pre-send escalate around line 4368 was confirmed by source order only (customer message, then note, then assign). It was not executed, because that branch sits behind a blocked model draft.
- `index.js` missed-escalation escalate around line 4574 has the same source order and was not executed.
- A later related-turn status line (`escalateRelatedOnly.js` status bank) was not executed as its own webhook. R17 shows the awaiting flag is set after a rejected assignment, which is what unlocks that status line.
- Pure Urdu, Arabic, and Hindi handoff asks that do not contain a Latin live-agent phrase do not open `clientRequestedLiveAgent` (`softEdges.js`). They were judged on the packet decision function. The runtime model reply for those asks was not executed.
- Tree `b02e38e7` and the sealed sets were not available, so no diff against them was made.
- No live webhook, Intercom assignment, or customer conversation was used.

## Next action

Do not merge, approve, wire, activate, or deploy PR 14. The next change has to perform a successful internal note, then a successful assignment, and only then send one fixed message. Urdu, Arabic, and Hindi each need their own message. Risk, Escalations, human-owned, and ambiguous ownership must stay silent in every language. Credentials must be removed before a note or a customer message is built. Assignment errors, timeouts, and partial success must withhold the message and must not set the awaiting-teammate flag. Re-review that implementation. This report is not historical acceptance and it is not an approval of `c9548cc7d7be89cd622415b01da97face8f25be8`.
