# Fixed-message handoff R6 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/fixed-message-handoff-r5-8ad1` at `9f67dc0dd03bcb4ac56cc6c3ecf83ca4816aa9f4`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `seat-e`, `human-1`, `human-7`). The tests use an in-process recording transport. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

## What changed

The R5 order, assignment-failure withholding, ownership, and the account-number fact line are still in place. Eight gaps are closed in the runtime.

1. **Locked spread reply.** `SPREAD_TEST_REPLY` is exempt from redaction only when the whole string hashes to the locked template. `postProcessModelReply` returns those bytes before spacing or MT5 stripping, and `sanitizeCredentials` returns the same bytes. A one-character drift loses the exemption. A labeled password is still redacted, and the secret token now keeps `?`, `!`, `^`, `.`, and `,` inside the value. Whitespace and `<` still end a token. `and` / `account` still stop a multi-token value, so `189143` after a password stays.

2. **Repeated base64.** Copies are counted on the original text, before the label pass. Every copy is replaced, including a copy inside a multi-token label value. A base64 token that appears once and was not remembered is left alone. A later echo of a remembered token is still removed. A second pass leaves `[secret]` unchanged.

3. **No second comment after the fixed line.** Hook A's `STATUS_ONLY` branch fetches the conversation and checks `fixedHandoff.messageSent` and the parts before `postClientCommentOnce`. `postEscalateHoldingStatus` does the same check after its fetch. Either match skips the holding comment.

4. **Lost ticket state and lost op store, with the line still owed.** When both stores are empty and the parts already show the Account/Problem note and a non-bot assignment, but not the fixed line, the webhook sends that one line and does not write the note or the assignment again. A human public comment, or an assignee who is a different human, blocks that completion. The handoff assignee, an empty assignee, and a bot seat do not. Account-number questions stay on the answer path. The handoff assignee is passed into `decide` so that seat is not treated as foreign ownership.

5. **Fresh account-number questions.** `conversation.user.created`, and `conversation.user.replied` while the conversation is younger than `FIN_FRESH_CONV_SEC` (120 seconds), are answered before `shouldWaitForFin`. Italian `numero di conto` and `qual è il mio numero di conto` use the Italian MT5 fact line. `número de cuenta`, `numéro de compte`, `kontonummer`, and `rekeningnummer` are detected by the same number-word / account-word shape and use the fact line for the detected language, or English when that language has no approved line. `my account number is 189143` is still an identity supply and a handoff.

6. **Identity questions.** `are you a bot or a real person?` is answered with the existing disclosure and is not a live-agent request. `clientRequestedLiveAgent` returns false for a direct identity question. A human owner still silences the turn.

7. **Unsupported number on a bot-owned status ping or FAQ.** Regeneration still runs first. If the draft still states an unsupported number and the bot owns the conversation, the fallback is `I can't confirm that figure from the approved details, so I won't guess a number.` It has no digit and it does not promise a teammate. A human assignee still holds for escalation. An account-number question still gets the fact line. `please get me a human` on a missed escalation still stays empty so the handoff path can run.

8. **Emptied known-account re-ask.** An empty body after the known-account strip is no longer a silent 200. An account-number question gets the fact line. An identity question gets the disclosure. Anything else goes through `commitFixedMessageHandoff` on `presend_escalate`, which is note, then assignment, then the one fixed line, with the existing 500 / timeout / 422 / partial withholding. An Italian live-agent request (`voglio un operatore`, `voglio parlare con un operatore`) gets `Un collega ha ora questa conversazione.` and does not ask for the account number. That early commit on main escalate is before `ensureIdentityBeforeAccountEscalate`.

## Kept

Successful note, then successful assignment, then one fixed message. Assignment 500, timeout, 422, and partial success withhold the message and `escalateAwaitingFirstTeammate`. Ambiguous writes are not replayed. Ownership still fails closed, including a status ping while a human or another assignee owns the conversation. Account questions still fall through that defer. Hinglish still uses the approved Urdu handoff line. FAQ and MT5 behavior was not given a new promise. `escalateRelatedOnly.js`, `textUtils.js`, `imageAskGuard.js`, and `teammateHandoffGates.js` are unchanged from R5.

## Tests

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

`node --check` passed on `fixedMessageHandoff.js`, `index.js`, `softEdges.js`, `credentialSanitizer.js`, `targetedRegeneration.js`, and `statePresend.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `e7cc1a81387a69859ad5636b9b0c5520a47c4125c0b7510001dee4f09e5fa678` |
| `luna-current/01_runtime/index.js` | `f48ebb3aee624679223dbb19087263b2134bdc89bd1e0a3701d2ec5d44b92347` |
| `luna-current/01_runtime/softEdges.js` | `22f8b555a71bb81f6936997a57c85481b5c351b9446c0f30f7f178c93d5071e0` |
| `luna-current/01_runtime/imageAskGuard.js` | `a1f2d24187dab83e5a98f643f8c6cb93bb8f0c8efc118bf936f7f347d12e70b9` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `1d1a0f6ae8b5bc2e91d9068425b8476d4e7fe92e3296c8627b826a932d34189a` |
| `luna-current/01_runtime/teammateHandoffGates.js` | `96eaf4ce75a0eb888cdabb5552a7e90996cdde2278721a8958e7991032e4ca2b` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `2c6353936fdec3e990f6fa1eb7ca70134110c9ad6ef8061825839f358f4fe781` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `38fa4e2a56c23b96d3559e22f7135f5e69ecfc1e9cbafb157a92c46d672461b9` |
| `luna-current/02_statePresend/statePresend.js` | `0e3b8675e00856eca158748711683471e3820d43a9e5c0ff626a14dc84a90764` |
| `luna-current/02_statePresend/textUtils.js` | `8a023ab868017cac7e04a5e89de85a2960dcba1c1e7e21b1dce8dad925a6c20c` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r4/fixedMessageHandoff.test.js` | `74f9fdd2fbea587515d1ed062fbd0c947d5a305e4b0f3a1f0fd8693e8788ae2d` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r5/fixedMessageHandoff.test.js` | `9dbbd19b7fceae0bfb306276765defb3c13833531ba006b3105549de5bf12c1f` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r6/fixedMessageHandoff.test.js` | `61627c9bb45ea36139ba24bf09fe9a58815bca4112a36bfd81486a6370077665` |

`escalateRelatedOnly.js`, `textUtils.js`, `imageAskGuard.js`, `teammateHandoffGates.js`, and the R4 and R5 tests match the R5 freeze. This report's own SHA-256 is not written inside itself. It is recorded in the freeze commit message.

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- Not a release. No production, VPS, Intercom call, secret, deploy, or merge was performed.
- No live webhook or customer conversation was used.
