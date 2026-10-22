# Fixed-message handoff R17 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/t800-handoff-r16` at `4874c418ea1114df9bf0dac521abafff01a663de`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `human-7`). The tests use an in-process recording transport, a temporary op-store file, and the synced FAQ markdown. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

R16 clarifier, owed-line language, concept-bound figures, note-retry silence, failed-confirmed assignment retry, the three welcome KB articles, Urdu lexical cues, the knowledge-question force exception, silence, owner spoofing, byte-exact lines, and the strict write judgment are kept. `faq-kb.js`, `writeOpStore.js`, `statePresend.js`, `targetedRegeneration.js`, `credentialSanitizer.js`, and `escalateRelatedOnly.js` are unchanged from the R16 freeze.

## What changed

Five review classes are corrected on top of the R16 runtime.

1. **A human-agent request is detected on every turn, before any model reply.** After a prior bot reply, Urdu, Arabic, Hindi, and Hinglish requests were routed as normal and the model posted `I can help with that.` with no assignment. The same multilingual detector now runs on welcome and later turns. A request posts that language's locked line once. A model reply and a locked line are not both posted for the same handoff. Knowledge questions, password-policy questions, and clarifiers stay on the normal path.

2. **Lost-state completion re-detects the original request.** After an op-store wipe, the owed line was coming from the latest turn, so those languages received the English line. The customer's human-request part is detected again, and that text's locked body is the one posted. A later `hello` does not replace it.

3. **DLL and MLL are the same concepts as the spelled-out labels.** `The DLL is 5%.` and `The MLL is 8%.` were hedged while `daily loss limit` and `max loss limit` were allowed. DLL, daily loss limit, and daily drawdown are one concept. MLL, max loss limit, and max drawdown are the other. The nearest label binds the figure, including a label that follows the percent. Against `DLL 5%/3%, MLL 8%`, against `daily loss limit of 5%` / `max loss limit of 8%`, and against `5% daily loss limit` / `8% max loss limit`, those sentences post. 99% is still hedged. A daily drawdown of 8% is still hedged. No figure is invented. The number hedge sentence is unchanged.

4. **A unique-rank FAQ posts its article.** `How does the challenge work?` was silent on the welcome path and on a later turn. A unique rank now posts the selected article on both, including the empty-reply and final-hold returns, so the turn does not end with no public line. `How can I pay for the challenge?` is still the tie clarifier `Please tell me which challenge you mean.` Password-policy questions and the three approved KB articles are unchanged.

5. **Arabic `أريد التحدث إلى موظف` plus a password hands off in Arabic.** The password's Latin letters were making the turn look English and substantive, so the model reply was `السلام علیکم، I can help with that.` The detector runs on the text after the secret is removed, the locked line is the Arabic line, and the secret is absent from the note, the assignment, and the customer payload.

## Kept

Successful note, then successful assignment, then one fixed message. The body stored at owe-time stays sticky. Assignment and note timeouts stay held on the same turn and retry on the next turn with a live re-check. Silence, owner spoofing, byte-exact lines, and the strict write judgment are unchanged. `requireLiveAssignee` is still set on the runtime commit. Zero customer-line leaks were observed in this suite.

## Tests

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r17/fixedMessageHandoff.test.js`

5 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r16/fixedMessageHandoff.test.js`

4 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r15/fixedMessageHandoff.test.js`

3 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r14/fixedMessageHandoff.test.js`

10 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r13/fixedMessageHandoff.test.js`

3 passed, 0 failed.

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

Protected prompt and FAQ hashes match. Syntax check passed. Adversarial `current_checks.js` passed 58/58, including `unknown-write-not-repeated-on-redelivery` and `malformed-write-success-not-trusted`. Eighteen included selftests passed. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R16 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate.

`node --check` passed on `fixedMessageHandoff.js`, `index.js`, and `policyEvidence.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `065bf0ee2a67ac8d642ef1c2bac73f4fb72e63ae86d1dd61d961d33a197caa24` |
| `luna-current/01_runtime/index.js` | `0b505e1a2f1afb84b5717214a66ba8e080dd4c0039020ec19f8b41d814be186c` |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` |
| `luna-current/02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r17/fixedMessageHandoff.test.js` | `f6d662599735fef452636d95b06ef8e1047eb0714539145ec4b5691e2a12bb5e` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r16/fixedMessageHandoff.test.js` | `158612c0033d9cc73dfde0d57a2465b6bab714974240cd94aa826bc8576c9513` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |
