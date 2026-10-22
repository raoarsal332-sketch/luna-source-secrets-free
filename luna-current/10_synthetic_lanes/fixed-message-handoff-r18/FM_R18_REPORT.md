# Fixed-message handoff R18 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/t800-handoff-r17` at `91c1bab3ac2d768ce2f4f8b40bf821bac1cccbd0`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `human-7`). The tests use an in-process recording transport, a temporary op-store file, and the synced FAQ markdown. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

The R17 review held: 416/423, 0 leaks, 0 duplicates, recovery 222/222, 0 candidate-only regressions, 7 pre-existing misses. Those R17 fixes stay. `policyEvidence.js`, `targetedRegeneration.js`, `statePresend.js`, `credentialSanitizer.js`, `escalateRelatedOnly.js`, `faq-kb.js`, and `writeOpStore.js` are unchanged from the R17 freeze.

## What changed

Three review classes are corrected on top of the R17 runtime.

1. **Fin-wait on `conversation.user.created` uses the same human-request detector as later turns.** The bypass was `isPureLiveAgentAsk` on the raw text, so a long Latin password made the Hindi request look English and the turn stayed on the Fin skip. Detection now runs after secret-like tokens and Latin noise are removed. `मुझे एजेंट से बात करनी है password: ...` posts the Hindi locked line once. Short Latin role words such as `agent` are left in place. Hinglish and English requests are unchanged.

2. **A general password-policy question is not silence.** `Can you explain the password policy?` was held as a missed question, then the password-policy skip dropped the draft. The skip now posts the usable original draft, an approved FAQ line when one exists, or `Which part of the password policy should I explain?`. A tied unrelated article is not posted. The other wordings stay on the normal path and are not a hedge or a locked line: `what is the password policy?`, `what are the password requirements?`, `what are the password rules?`, `what is the password criteria?`, `what is the password requirement?`, `what are the password rule?`.

3. **A supported figure posts as itself.** `The DLL is 5%.` was replaced by the missed-escalation handoff even when the figure-binding check passed. When that check passes, the draft is posted verbatim and the handoff does not run. `The DLL is 99%.` and `The daily drawdown is 8%.` against `DLL 5%/3%, MLL 8%.` stay off that post. A draft with no public figure still follows the existing handoff path. The number hedge sentence is unchanged.

## Kept

Successful note, then successful assignment, then one fixed message. Human-request detection on later turns, lost-state language, DLL/MLL concept binding, unique-rank FAQ posts, the Arabic password handoff, the sticky owed line, and the failed-confirmed assignment retry stay as in R17. Silence, owner spoofing, byte-exact lines, and the strict write judgment are unchanged. Zero customer-line leaks were observed in this suite.

## Tests

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r18/fixedMessageHandoff.test.js`

3 passed, 0 failed.

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

Protected prompt and FAQ hashes match. Syntax check passed. Adversarial `current_checks.js` passed 58/58, including `unknown-write-not-repeated-on-redelivery` and `malformed-write-success-not-trusted`. Eighteen included selftests passed. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R17 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate.

`node --check` passed on `fixedMessageHandoff.js` and `index.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `5085977159bad894d66be9fdd7d64c53fade2c4359baeebf5245a943c8f98ded` |
| `luna-current/01_runtime/index.js` | `af12a4d99fe7934fa99a8507069f3ae53c6118ff8f9e81e105305fa1a47e0aa2` |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` |
| `luna-current/02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r18/fixedMessageHandoff.test.js` | `14951e209bc1f222010603edb951cecb66f92c52b82beaba0361fc9af35f78a2` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r17/fixedMessageHandoff.test.js` | `f6d662599735fef452636d95b06ef8e1047eb0714539145ec4b5691e2a12bb5e` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |
