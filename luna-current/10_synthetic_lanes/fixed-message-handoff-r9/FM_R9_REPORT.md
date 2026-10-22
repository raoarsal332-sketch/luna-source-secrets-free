# Fixed-message handoff R9 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/fixed-message-handoff-r8-8ad1` at `5c39fd7001c06482470ff470d9ad0ea07b4ec37a`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `seat-e`, `human-1`, `human-7`). The tests use an in-process recording transport. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

Ownership, language, the live-agent Fin wait, identity, the byte-exact locked spread reply, assignment-pending recovery, the terminal number hedge, original-draft run order, and the empty escalation body are unchanged from the R8 freeze.

## What changed

Four classes are closed on top of the R8 runtime.

1. **Symbol-secret echoes.** When a remembered secret contains a symbol, every alphanumeric run of 6 or more characters inside the normalized secret is remembered as well. Later drafts, public replies, notes, and the English note prompt scrub that run, including inside braces or quotes. A longer neighboring token is left in place. The locked spread reply is still returned unchanged when the whole string matches.

2. **Owner reply on a human-assigned thread.** `ownerPublicReplyDecision` is the explicit gate. If the authenticated owner dictated the body (`REPLY:` or "send this message to the client"), that body is posted verbatim and is not passed through `postProcessModelReply` or `toHtml`. Luna-generated or templated text substituted for that body is not posted. An empty or unparsable owner body posts nothing. A bot-assigned thread keeps the existing owner-command path.

3. **Handoff-note provenance.** A note counts toward note-then-assign-then-fixed-line only when its author id is this bot, or when the opstore record `noteConfirmed` says this bot already wrote it. A human-authored note with the same Account/Problem shape does not count, and the bot writes its own note first. Runtime notes carry the marker `LUNA_HANDOFF_NOTE`.

4. **Fewer FAQ handoffs.** A non-answering draft classified `MISSED_QUESTION` regenerates first. If regeneration does not produce an answer, a KB FAQ or a negated spread ask (`SPR-negated`, reason `negated-spread`) is hedged instead of handed off. Escalation remains when the knowledge level is `none` or `conflicting`, when the fail is `KNOWLEDGE_GAP_UNSAFE`, or when the message is the customer's own case (`my payout was rejected`). `this is not about the spread` is not a spread-template delivery and is not the fixed line.

## Kept

Successful note, then successful assignment, then one fixed message. Assignment 500, timeout, 422, and partial success withhold the message and `escalateAwaitingFirstTeammate`. A definite 422 stays `assignment-pending` and the retry assigns, then sends the fixed line once. An internal note is still not "already answered". The approved number hedge stays terminal. `softEdges.js`, `imageAskGuard.js`, `escalateRelatedOnly.js`, `teammateHandoffGates.js`, `challengeVariantGuard.js`, `statePresend.js`, `textUtils.js`, and the R4 through R8 tests are unchanged from the R8 freeze.

## Tests

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
| `luna-current/01_runtime/fixedMessageHandoff.js` | `900b906933b4ebced5b24597e9710bc3789812a7cdf5afc1f3d51eeae12186c7` |
| `luna-current/01_runtime/index.js` | `eefba61c6d4e9302948936c3c24c6a568390cdd81204b8f1220d05b8bcab85d9` |
| `luna-current/01_runtime/challengeVariantGuard.js` | `0d6fff5f5330091c4f8ca02f5ae189845b386922c944d8a7b152970cdc43d12d` |
| `luna-current/01_runtime/softEdges.js` | `22f8b555a71bb81f6936997a57c85481b5c351b9446c0f30f7f178c93d5071e0` |
| `luna-current/01_runtime/imageAskGuard.js` | `a1f2d24187dab83e5a98f643f8c6cb93bb8f0c8efc118bf936f7f347d12e70b9` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `1d1a0f6ae8b5bc2e91d9068425b8476d4e7fe92e3296c8627b826a932d34189a` |
| `luna-current/01_runtime/teammateHandoffGates.js` | `96eaf4ce75a0eb888cdabb5552a7e90996cdde2278721a8958e7991032e4ca2b` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `81c714c3730f1493b6a5772e09af3df8654efa09e3ef9f723491185cee64a3ae` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `d6f3e7de44e815ba8d329dbf6ad528b133a8cd47b134e5cb372d75cce92a577c` |
| `luna-current/02_statePresend/statePresend.js` | `0e3b8675e00856eca158748711683471e3820d43a9e5c0ff626a14dc84a90764` |
| `luna-current/02_statePresend/textUtils.js` | `8a023ab868017cac7e04a5e89de85a2960dcba1c1e7e21b1dce8dad925a6c20c` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r4/fixedMessageHandoff.test.js` | `74f9fdd2fbea587515d1ed062fbd0c947d5a305e4b0f3a1f0fd8693e8788ae2d` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r5/fixedMessageHandoff.test.js` | `9dbbd19b7fceae0bfb306276765defb3c13833531ba006b3105549de5bf12c1f` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r6/fixedMessageHandoff.test.js` | `86768ddd278620d3427a44573db26d0f5093082b7da9f39b4677ba872c1e3544` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r7/fixedMessageHandoff.test.js` | `3a4f6b745b8582acea3defee0253625bf0d32b47c7477b0e3c069862d6833aee` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r8/fixedMessageHandoff.test.js` | `a5e0aba2948dd8eb02843143c8dd9fb0cae8283336cb5ec0bb6ca9c45ad99347` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r9/fixedMessageHandoff.test.js` | `3b4735e05730f162c9d69fded5a97c6f77ef793f4b4f67af5ee9c491b2b361dd` |

`challengeVariantGuard.js`, `softEdges.js`, `imageAskGuard.js`, `escalateRelatedOnly.js`, `teammateHandoffGates.js`, `statePresend.js`, `textUtils.js`, and the R4 through R8 tests match the R8 freeze. This report's own SHA-256 is not written inside itself. It is recorded in the freeze commit message.

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- Not a release. No production, VPS, Intercom call, secret, deploy, or merge was performed.
- No live webhook or customer conversation was used.
