# Fixed-message handoff R10 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/fixed-message-handoff-r9-8ad1` at `9fb86f70d37cc353183703de25e0cc69fcefbcd0`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `seat-e`, `human-1`, `human-7`, `owner-admin`). The tests use an in-process recording transport. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

Ownership silence, language, the live-agent Fin wait, identity, the byte-exact locked spread reply, assignment-pending recovery, the terminal number hedge, original-draft run order, symbol-run echoes, owner verbatim replies, and handoff-note provenance are unchanged from the R9 freeze.

## What changed

Five classes are closed on top of the R9 runtime.

1. **Owner authentication.** `authenticatedOwnerCommand` accepts a command only when `author.type` is `admin`, `author.id` is one of the configured owner admin ids (Arsal or Jerry), and the part is an internal note. `author.type` `user` or `lead` fails closed even when the id, name, or email matches an owner. A public comment fails closed. On a human-assigned thread a failed check posts nothing. A real owner note may still post the dictated body verbatim.

2. **Write-success validation.** A note, assignment, or message is confirmed only when the status is 2xx, the body is not `type: error.list` and has no `errors`, and `data` is not null. When the body names the resource, a note must include `part_type: note` and an assignment must carry the expected assignee id. HTTP 200 with an error list or `data: null` is failed or ambiguous and is never stored as confirmed. If stored note and assignment flags are both set but the conversation parts were wiped, replay writes them again and does not post the fixed line from the stored flags alone.

3. **Empty FAQ and idle status pings.** An empty model body on a plain KB FAQ such as "What is the daily loss limit?" posts `plainFaqCustomerLine` (the matching FAQ article, or a challenge clarification). It does not take the presend handoff. "any update?" on a bot-owned thread with no pending case posts `STATUS_PING_CLARIFY`. A pending handoff, an awaiting teammate, or a human owner keeps the earlier status behavior.

4. **Team-will-review in a FAQ answer.** A draft that says "the team will review" (or "our team will review") on a KB FAQ regenerates once. If the replacement still says it, the approved number hedge is posted instead. The customer's own case, such as "my payout was rejected", is not treated as that FAQ block.

5. **Taint precision.** `rememberSecret` stores a value only when it is value-shaped: a digit, an internal symbol, a multi-word passphrase that is not only ordinary words, or a single token of 8 or more letters that is not a dictionary or function word. "password back" still redacts that labeled occurrence and does not scrub a later "back". Alphanumeric runs of 6 or more characters inside a symbol secret are still remembered, except ordinary words.

## Kept

Successful note, then successful assignment, then one fixed message. Assignment 500, timeout, 422, and partial success withhold the message and `escalateAwaitingFirstTeammate`. A definite 422 stays `assignment-pending`. An ambiguous assignment is not replayed. A human note does not count as this bot's handoff note. The approved number hedge stays terminal. `softEdges.js`, `imageAskGuard.js`, `escalateRelatedOnly.js`, `teammateHandoffGates.js`, `challengeVariantGuard.js`, `statePresend.js`, `textUtils.js`, and the R4 through R9 tests are unchanged from the R9 freeze.

## Tests

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

`node --check` passed on `fixedMessageHandoff.js`, `index.js`, `credentialSanitizer.js`, and `targetedRegeneration.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `441c2c306565c27ec2c6ebbd0dbf3601018312494606fdfd29878b1ae5fe8857` |
| `luna-current/01_runtime/index.js` | `b32ecc9d878096ebc50e535b450c328f227790dd0dee76bcb8afdf5ce11b5054` |
| `luna-current/01_runtime/challengeVariantGuard.js` | `0d6fff5f5330091c4f8ca02f5ae189845b386922c944d8a7b152970cdc43d12d` |
| `luna-current/01_runtime/softEdges.js` | `22f8b555a71bb81f6936997a57c85481b5c351b9446c0f30f7f178c93d5071e0` |
| `luna-current/01_runtime/imageAskGuard.js` | `a1f2d24187dab83e5a98f643f8c6cb93bb8f0c8efc118bf936f7f347d12e70b9` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `1d1a0f6ae8b5bc2e91d9068425b8476d4e7fe92e3296c8627b826a932d34189a` |
| `luna-current/01_runtime/teammateHandoffGates.js` | `96eaf4ce75a0eb888cdabb5552a7e90996cdde2278721a8958e7991032e4ca2b` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `31b8c5329980a32c8bc864582aa52c976dc0838bac8bccb854d534b46c19a58a` |
| `luna-current/02_statePresend/statePresend.js` | `0e3b8675e00856eca158748711683471e3820d43a9e5c0ff626a14dc84a90764` |
| `luna-current/02_statePresend/textUtils.js` | `8a023ab868017cac7e04a5e89de85a2960dcba1c1e7e21b1dce8dad925a6c20c` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r4/fixedMessageHandoff.test.js` | `74f9fdd2fbea587515d1ed062fbd0c947d5a305e4b0f3a1f0fd8693e8788ae2d` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r5/fixedMessageHandoff.test.js` | `9dbbd19b7fceae0bfb306276765defb3c13833531ba006b3105549de5bf12c1f` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r6/fixedMessageHandoff.test.js` | `86768ddd278620d3427a44573db26d0f5093082b7da9f39b4677ba872c1e3544` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r7/fixedMessageHandoff.test.js` | `3a4f6b745b8582acea3defee0253625bf0d32b47c7477b0e3c069862d6833aee` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r8/fixedMessageHandoff.test.js` | `a5e0aba2948dd8eb02843143c8dd9fb0cae8283336cb5ec0bb6ca9c45ad99347` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r9/fixedMessageHandoff.test.js` | `3b4735e05730f162c9d69fded5a97c6f77ef793f4b4f67af5ee9c491b2b361dd` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r10/fixedMessageHandoff.test.js` | `090696eb1588731f705a5d6561dfe21b103301cd72473f7c3b755477e518396c` |

`challengeVariantGuard.js`, `softEdges.js`, `imageAskGuard.js`, `escalateRelatedOnly.js`, `teammateHandoffGates.js`, `statePresend.js`, `textUtils.js`, and the R4 through R9 tests match the R9 freeze. This report's own SHA-256 is not written inside itself. It is recorded in the freeze commit message.

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- Not a release. No production, VPS, Intercom call, secret, deploy, or merge was performed.
- No live webhook or customer conversation was used.
