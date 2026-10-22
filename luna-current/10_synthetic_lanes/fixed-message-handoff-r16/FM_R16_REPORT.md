# Fixed-message handoff R16 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/t800-handoff-r15` at `171d1009a126d75728f8f006943b46caebfffc13`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `human-7`). The tests use an in-process recording transport, a temporary op-store file, and the synced FAQ markdown. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

R15 failed-confirmed assignment retry, the three welcome KB article bodies, owed-line recovery, Urdu lexical cues, the knowledge-question force exception, the clarifier and password-policy exemptions, silence, owner spoofing, byte-exact lines, and the strict write judgment are kept. `faq-kb.js`, `statePresend.js`, `targetedRegeneration.js`, `credentialSanitizer.js`, and `escalateRelatedOnly.js` are unchanged from the R15 freeze.

## What changed

Four review classes are corrected on top of the R15 runtime.

1. **An ambiguous or empty challenge rank posts the clarifier.** `How can I pay for the challenge?` was silent. Its top two FAQ scores tie, and neither winner is the payment article. A welcome ask that says "challenge", does not name a product, and whose ranking is empty or tied now posts `Please tell me which challenge you mean.` Password-policy questions and the three approved KB articles are unchanged. The three articles still come from the same ranking as retrieval.

2. **The retry posts the body stored at owe-time.** The locked line is written to the op store before the note and the assignment, and a later remember does not replace that body. An assignment timeout or HTTP 500 that did not land still retries as `failed-confirmed`. The retry posts that stored body once. It does not recompute English from the retry turn. Urdu, Arabic, Hindi, Roman Urdu, and Hinglish keep the line chosen on the first turn.

3. **A public percent or amount must be in the evidence and bound to the same concept.** `what is the daily drawdown?` no longer ships `The daily drawdown is 99%.` Daily drawdown and daily loss are the daily-loss concept. Max drawdown and max loss are the max-loss concept. Against evidence `DLL 5%/3%, MLL 8%`, 99% is hedged, 8% stated as a daily drawdown is hedged, and 5% or 3% stated as a daily drawdown is allowed. 8% stated as a max drawdown is allowed. No figure is invented. The number hedge is still the only replacement.

4. **A pending handoff does not get a model answer.** A note timeout or HTTP 500 still withholds on the same turn. The next turn, once the parts show the note did not land, retries that note and then posts only the owed locked line once. If the retry does not complete, the turn stays silent. It does not post `A teammate can help with that.`

## Kept

Successful note, then successful assignment, then one fixed message. Assignment 422 and 429 stay definite and retryable. A same-turn assignment or note replay without a live re-check still makes no calls. Silence, owner spoofing, byte-exact lines, and the strict write judgment are unchanged. `requireLiveAssignee` is still set on the runtime commit. Zero customer-line leaks were observed in this suite.

## Tests

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

Protected prompt and FAQ hashes match. Syntax check passed. Adversarial `current_checks.js` passed 58/58, including `unknown-write-not-repeated-on-redelivery` and `malformed-write-success-not-trusted`. Eighteen included selftests passed. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R15 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate.

`node --check` passed on `fixedMessageHandoff.js`, `writeOpStore.js`, `index.js`, and `policyEvidence.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `1dc8922028cf4dbc80f5788d0dfd5dc746a96ffb0d1c97b2ae6e4fbd40e73238` |
| `luna-current/01_runtime/index.js` | `403b95586aa8946bb383a383ec728f644912ec4004edaf104d2bef8bdd03b83a` |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` |
| `luna-current/02_statePresend/policyEvidence.js` | `8363ce61f920e403064ec6cb63d6d9a24b36af07cfc69f233696d08fb1a24d98` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r16/fixedMessageHandoff.test.js` | `158612c0033d9cc73dfde0d57a2465b6bab714974240cd94aa826bc8576c9513` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r15/fixedMessageHandoff.test.js` | `6c12916e2a2f9456293577a5be84e887a7440cd61548e9ce2681da7eaa1d37f4` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r14/fixedMessageHandoff.test.js` | `c92bcba2b2735e851a9d9b0dc67fad1014b65b7fc6a52d27e873e7adb34a13f7` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r13/fixedMessageHandoff.test.js` | `0db271306d7bedda5709dc46cf88ac54c607d587bd454ec8fc1ff244433dbbfa` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r3/fixedMessageHandoff.test.js` | `0b68d32b55f064eb3a08c53e7b4e5e125f16ff0236ee5ceed7ffa741ca49e2b5` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |
