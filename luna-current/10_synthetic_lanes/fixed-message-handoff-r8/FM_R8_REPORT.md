# Fixed-message handoff R8 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/fixed-message-handoff-r7-8ad1` at `8675a8796edeceb2204a7402a1a50b9e0f182ba1`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `seat-e`, `human-1`, `human-7`). The tests use an in-process recording transport. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

Ownership (including the early return before every public path), language detection, the live-agent Fin-wait bypass, identity answers, and the byte-exact locked spread reply are unchanged from the R7 freeze. No approved translation of the fixed line or the MT5 fact line was found for French, German, Dutch, Spanish, Portuguese, Turkish, Polish, Russian, Chinese, Japanese, or Indonesian. Those customers still receive the existing English line.

## What changed

Six classes are closed on top of the R7 runtime.

1. **Partial-failure recovery.** When the note write succeeds and the assignment comes back as a definite failure (HTTP 422), the persisted handoff progress has `phase: 'assignment-pending'`, `noteConfirmed` true, and `assignConfirmed` false. A replay calls assign and then posts the fixed line once. It does not write the note again. An ambiguous 500, timeout, or partial assignment is still not replayed and does not take that phase. `arsalAlreadyRepliedAfter` treats only a public customer-facing reply as already answered. A note, an assignment, an open, or a close does not skip recovery and does not block the later public comment.

2. **The approved hedge is terminal.** Once the draft is `I can't confirm that figure from the approved details, so I won't guess a number.`, the 2-step clarifier, the Lite vs Free Retry follow-up, regeneration, the welcome intro, `toHtml`, and missed-escalation leave it unchanged. A human-owned hedge is still held and does not become the fixed line.

3. **Run order uses the original draft.** Missed-escalation and the handoff-promise decision read the customer's own message and the draft captured at `parseAction`, not the body left after a hedge. A spread template or a near-miss on a payout question is hedged. It does not become `A teammate now has this conversation.` A live-agent request can still commit, and the fixed line is sent only when that commit completes the note, the assignment, and the one message.

4. **Echo redaction.** A secret remembered from the customer message is stored as its normalized canonical token (NFKC, format characters stripped, leading and trailing punctuation trimmed, internal symbols kept) and as the full span when that span differs. Later drafts, public replies, notes, and the English note prompt are scrubbed by a boundary-tolerant pattern: optional edge punctuation, optional spaces between characters, and the `sk-` or `Bearer` token with its trailing punctuation in the same replacement. A longer neighboring token is left in place. The locked spread reply is still compared on the original bytes and returned unchanged.

5. **An empty escalation body.** An empty model body on an escalation-class message, including `my payout was rejected`, commits `presend_escalate` (note, then assign, then the fixed line). An empty FAQ or general-policy body still commits `main_escalate`. Any other empty body still skips.

6. **Spread ask on `conversation.user.created`.** After the ownership return, `shouldWaitForFin` does not wait when the fresh ticket is an eligible spread ask. The locked reply path below posts it. An identity question and an account-number question do not take that bypass.

## Kept

Successful note, then successful assignment, then one fixed message. Assignment 500, timeout, 422, and partial success withhold the message and `escalateAwaitingFirstTeammate`. Ambiguous assignment is not replayed when the seat is not observed. Account questions are still decided before ownership silence inside `decide`, and the webhook still suppresses the public post when a human owns. The pending handoff assignee is not treated as a foreign owner, so a 422 retry can finish. Hinglish still uses the approved Urdu handoff line. `softEdges.js`, `imageAskGuard.js`, `escalateRelatedOnly.js`, `teammateHandoffGates.js`, `statePresend.js`, `textUtils.js`, and the R4, R5, R6, and R7 tests are unchanged from the R7 freeze.

## Tests

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

`node --check` passed on `fixedMessageHandoff.js`, `index.js`, `challengeVariantGuard.js`, `credentialSanitizer.js`, and `targetedRegeneration.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `b296c6834a1d4cea2c4cc26e36fb1f8767245e53367de0afaa8e652a386e07c2` |
| `luna-current/01_runtime/index.js` | `14befdafb196637c51d34a8bab2f47ae2ca543c2e9a662a3a7e0a67d1332b74b` |
| `luna-current/01_runtime/challengeVariantGuard.js` | `0d6fff5f5330091c4f8ca02f5ae189845b386922c944d8a7b152970cdc43d12d` |
| `luna-current/01_runtime/softEdges.js` | `22f8b555a71bb81f6936997a57c85481b5c351b9446c0f30f7f178c93d5071e0` |
| `luna-current/01_runtime/imageAskGuard.js` | `a1f2d24187dab83e5a98f643f8c6cb93bb8f0c8efc118bf936f7f347d12e70b9` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `1d1a0f6ae8b5bc2e91d9068425b8476d4e7fe92e3296c8627b826a932d34189a` |
| `luna-current/01_runtime/teammateHandoffGates.js` | `96eaf4ce75a0eb888cdabb5552a7e90996cdde2278721a8958e7991032e4ca2b` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `a72f4d467f79fce0dd7bf0643159ba8798def962b318b03847538d413ca29352` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `21d52aede4955b1373ef2f3356247514734685a7741d4c713efe82ae022ff549` |
| `luna-current/02_statePresend/statePresend.js` | `0e3b8675e00856eca158748711683471e3820d43a9e5c0ff626a14dc84a90764` |
| `luna-current/02_statePresend/textUtils.js` | `8a023ab868017cac7e04a5e89de85a2960dcba1c1e7e21b1dce8dad925a6c20c` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r4/fixedMessageHandoff.test.js` | `74f9fdd2fbea587515d1ed062fbd0c947d5a305e4b0f3a1f0fd8693e8788ae2d` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r5/fixedMessageHandoff.test.js` | `9dbbd19b7fceae0bfb306276765defb3c13833531ba006b3105549de5bf12c1f` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r6/fixedMessageHandoff.test.js` | `86768ddd278620d3427a44573db26d0f5093082b7da9f39b4677ba872c1e3544` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r7/fixedMessageHandoff.test.js` | `3a4f6b745b8582acea3defee0253625bf0d32b47c7477b0e3c069862d6833aee` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r8/fixedMessageHandoff.test.js` | `a5e0aba2948dd8eb02843143c8dd9fb0cae8283336cb5ec0bb6ca9c45ad99347` |

`softEdges.js`, `imageAskGuard.js`, `escalateRelatedOnly.js`, `teammateHandoffGates.js`, `statePresend.js`, `textUtils.js`, and the R4, R5, R6, and R7 tests match the R7 freeze. This report's own SHA-256 is not written inside itself. It is recorded in the freeze commit message.

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- Not a release. No production, VPS, Intercom call, secret, deploy, or merge was performed.
- No live webhook or customer conversation was used.
