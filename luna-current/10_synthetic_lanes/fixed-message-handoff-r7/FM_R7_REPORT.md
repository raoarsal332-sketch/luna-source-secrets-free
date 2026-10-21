# Fixed-message handoff R7 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/fixed-message-handoff-r6-8ad1` at `08775b56d3752a0ac03e865e33c91f52ef176043`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `seat-e`, `human-1`, `human-7`). The tests use an in-process recording transport. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

No approved translation of the fixed line or the MT5 fact line was found for French, German, Dutch, Spanish, Portuguese, Turkish, Polish, Russian, Chinese, Japanese, or Indonesian. Those customers receive the existing English line. Italian, Urdu, Arabic, Hindi, and the Hinglish fact line stay on the lines that were already approved. A French customer is not sent the Italian line.

## What changed

The R6 order, assignment-failure withholding, locked-template hash, and account-number fact line are still in place. Nine classes are closed in the runtime.

1. **Ownership first.** The early ownership block always classifies ownership, including for an account-number question. A human owner, a human assignee, or a human public comment returns before the identity answer, the fresh-ticket account answer, the Fin wait, Hook A, and every later public path. No public post is made on that thread. A bot-owned account question and a bot-owned identity question still answer. The one owed fixed line is still allowed when the stores are lost, a real note part and a real assignment part are both present, the fixed line is absent, and the handoff assignee is the only human seat.

2. **A note is confirmed only after a verified write.** `noteConfirmed` is set after `postNote` classifies as success, or when that flag was already true from an earlier success, or when a `part_type === 'note'` contains Account and Problem. A 500, timeout, partial, or other failed write sets `noteConfirmed` to false and does not assign or message. A comment that merely contains those words is not a note. Lost-store completion requires `hasVerifiedNotePart` and `hasAssignmentPart`. The conversation assignee alone is not an assignment part. The observed-seat recovery (`assignmentAlreadyHeld`) is unchanged: a prior ambiguous assignment still sends one message when the seat is actually on the conversation.

3. **Unsupported numbers hedge.** A bot-owned `UNSUPPORTED_NUMBER`, including a holding time and a figure that is still present after regeneration, becomes `I can't confirm that figure from the approved details, so I won't guess a number.` It has no digit and it does not promise a teammate. A human-owned unsupported number is held (`unsupported-number-held`) and does not enter the fixed line. The R6 suite's one assertion for that hold was updated from `needs-escalate` to `unsupported-number-held`. `please get me a human` on a missed escalation still stays empty so the handoff path can run.

4. **The spread template is not a handoff promise.** The locked reply and a near-miss of it are sent only when the customer's own message is an eligible spread ask. A payout question, or any other non-spread ask, whose draft is the template or a near-miss, is hedged. A human owner holds that draft instead of posting. An account-number answer never adopts the template as its draft.

5. **Credential redaction.** Text is NFKC-normalized and format characters (zero-width and other `Cf`) are stripped before labels and echoes. Labels may be split by spaces or those format characters (`p a s s w o r d`). A value keeps `?`, `!`, and other symbols inside the token. A value may be any number of same-line chunks. A remembered secret is compared in normalized form, including a spaced echo and a fullwidth echo, on the user text and on the public reply. The exact spread template is compared on the original bytes and returned unchanged. `{correct horse}` and `<b>…</b>` still redact to the same string on a second call.

6. **The locked spread reply is byte-exact on the first message.** `postClientCommentOnceInner` returns through `postReply` before the welcome intro, the identity guard, and the post gate when the body hashes to the template. `postReply` does not run `toHtml` on that body. `ensureFirstReplyWelcomeIntro` returns the template before it can prepend `Hello,`.

7. **Live agent on `conversation.user.created`.** After the ownership return, `shouldWaitForFin` does not wait when the fresh ticket is a live-agent request. An identity question and an account-number question do not take that bypass.

8. **Multilingual structure.** Live-agent and account-number detection use script plus function-word scores and a role/act grammar for French, German, Dutch, Spanish, Portuguese, Turkish, Polish, Russian, Chinese, Japanese, Indonesian, and Roman Hinglish. The customer line is the approved translation when one exists. Otherwise it is the English line. `voglio un operatore` stays Italian. `mujhe ek insaan chahiye` stays the Urdu handoff line. `ما هي قواعد السحب؟` stays on the normal path. `my account number is 189143` stays a supply and a handoff.

9. **FAQ numbers and an empty FAQ body.** `max daily drawdown is 14%` and the same class of unsupported figure in a FAQ reply are regenerated or hedged. An empty model body on a clear KB FAQ or a general policy question commits the handoff sequence instead of returning silently. Any other empty body still skips.

## Kept

Successful note, then successful assignment, then one fixed message. Assignment 500, timeout, 422, and partial success withhold the message and `escalateAwaitingFirstTeammate`. Ambiguous assignment is not replayed when the seat is not observed. Account questions are still decided before ownership silence inside `decide`, and the webhook now suppresses the public post when a human owns. Hinglish still uses the approved Urdu handoff line. `softEdges.js`, `imageAskGuard.js`, `escalateRelatedOnly.js`, `teammateHandoffGates.js`, `statePresend.js`, `textUtils.js`, and the R4 and R5 tests are unchanged from the R6 freeze.

## Tests

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

`node --check` passed on `fixedMessageHandoff.js`, `index.js`, `credentialSanitizer.js`, and `targetedRegeneration.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `bb9c20c275d215ae992df9e17c98f3f9af6f8f14592cdf9c18d64b5fd3c0cd6b` |
| `luna-current/01_runtime/index.js` | `22dee4ddc616761f2debe109fe81ebaad06649ff43219a5d6c05f01b298e397f` |
| `luna-current/01_runtime/softEdges.js` | `22f8b555a71bb81f6936997a57c85481b5c351b9446c0f30f7f178c93d5071e0` |
| `luna-current/01_runtime/imageAskGuard.js` | `a1f2d24187dab83e5a98f643f8c6cb93bb8f0c8efc118bf936f7f347d12e70b9` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `1d1a0f6ae8b5bc2e91d9068425b8476d4e7fe92e3296c8627b826a932d34189a` |
| `luna-current/01_runtime/teammateHandoffGates.js` | `96eaf4ce75a0eb888cdabb5552a7e90996cdde2278721a8958e7991032e4ca2b` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `c86c6c45fe217334bc7e028a3962a560af735c4c3a1f6a8305f1b41ce8578418` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `689216077646c0183b4989c75f04224ce16bb5e4a468b5b952c0f98f65cd5325` |
| `luna-current/02_statePresend/statePresend.js` | `0e3b8675e00856eca158748711683471e3820d43a9e5c0ff626a14dc84a90764` |
| `luna-current/02_statePresend/textUtils.js` | `8a023ab868017cac7e04a5e89de85a2960dcba1c1e7e21b1dce8dad925a6c20c` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r4/fixedMessageHandoff.test.js` | `74f9fdd2fbea587515d1ed062fbd0c947d5a305e4b0f3a1f0fd8693e8788ae2d` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r5/fixedMessageHandoff.test.js` | `9dbbd19b7fceae0bfb306276765defb3c13833531ba006b3105549de5bf12c1f` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r6/fixedMessageHandoff.test.js` | `86768ddd278620d3427a44573db26d0f5093082b7da9f39b4677ba872c1e3544` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r7/fixedMessageHandoff.test.js` | `3a4f6b745b8582acea3defee0253625bf0d32b47c7477b0e3c069862d6833aee` |

`softEdges.js`, `imageAskGuard.js`, `escalateRelatedOnly.js`, `teammateHandoffGates.js`, `statePresend.js`, `textUtils.js`, and the R4 and R5 tests match the R6 freeze. This report's own SHA-256 is not written inside itself. It is recorded in the freeze commit message.

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- Not a release. No production, VPS, Intercom call, secret, deploy, or merge was performed.
- No live webhook or customer conversation was used.
