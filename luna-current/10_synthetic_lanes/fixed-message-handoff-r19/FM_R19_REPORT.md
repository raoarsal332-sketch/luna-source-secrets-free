# Fixed-message handoff R19 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/t800-handoff-r18` at `c7fe62e7daedca4452a28acf706bc5f613a2f805`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic. The R19 cases call `handleWebhook` with a mocked HTTP client and a temporary control file. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

The R18 review held: 0 product-critical, 0 leaks, 0 duplicates, recovery 204/204, 0 candidate-only regressions, sealed scorer 512/593. Those R18 fixes stay. `policyEvidence.js`, `targetedRegeneration.js`, `statePresend.js`, `credentialSanitizer.js`, `escalateRelatedOnly.js`, `faq-kb.js`, and `writeOpStore.js` are unchanged from the R18 freeze.

## What changed

Five review classes are corrected on top of the R18 runtime. Each one was checked through `handleWebhook`, not only through the helper.

1. **A supported figure is posted before the number hedge.** The binding check now runs before `if (__presend.send)` and again before the missed-escalation hedge. Ten passing drafts, including `The DLL is 5%.` and `The MLL is 8%.`, post as themselves against `DLL 5%/3%, MLL 8%.`. `The DLL is 99%.` and `The daily drawdown is 8%.` are not posted. The hedge sentence is unchanged.

2. **An empty or bare number-hedge password-policy draft is not silence.** Outside the missed-escalation branch, as well as inside it, that draft posts `Which part of the password policy should I explain?` (or an approved FAQ when one exists). A usable draft such as `Passwords must include letters and numbers.` still posts. The other six password wordings stay on the normal path.

3. **Latin `agent` / `human` inside a human request is detected on every turn, including Fin-wait.** `मुझे agent से बात करनी है` posts the Hindi locked line. `janab mujhe agent chahiye` posts the Urdu locked line. `please get me a human` plus `Zq8LatinNoise88ab` or a labeled password posts the English locked line. When Devanagari or Arabic script is present, the locked line follows that script.

4. **Unlabeled secret-like tokens are removed from the internal note.** A token of at least eight letters and digits, such as `Zq8LatinNoise88ab`, is replaced with `[secret]` in the Problem field. The customer locked line does not contain it. The exact spread template stays exempt.

5. **Two FAQ byte fixes.** `How does the challenge work?` and `What is the leverage?` keep U+200B in the posted article. The welcome tie clarifier for `How can I pay for the challenge?` is exactly `Please tell me which challenge you mean.` with no `Hello <name>,` prefix.

## Kept

Successful note, then successful assignment, then one fixed message. The R18 Fin-wait detector, password-policy skip, and supported-figure helper stay. Human-request detection on later turns, lost-state language, DLL/MLL concept binding, unique-rank FAQ posts, the Arabic password handoff, the sticky owed line, and the failed-confirmed assignment retry stay as in R18. Silence, owner spoofing, byte-exact lines, and the strict write judgment are unchanged. Zero customer-line leaks were observed in this suite.

## Tests

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r19/fixedMessageHandoff.test.js`

4 passed, 0 failed. Each case calls `handleWebhook`.

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

Protected prompt and FAQ hashes match. Syntax check passed. Adversarial `current_checks.js` passed 58/58, including `unknown-write-not-repeated-on-redelivery` and `malformed-write-success-not-trusted`. Eighteen included selftests passed. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R18 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate.

`node --check` passed on `fixedMessageHandoff.js` and `index.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `aedcbb8efcdcef3e1918c7f78864b43a42cacb227ccbe1c127bc189ca24e2841` |
| `luna-current/01_runtime/index.js` | `a80c341f1b8bf9eee7538c258b8a8a9bdf780343a954f12938731676c51f8ea2` |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` |
| `luna-current/02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r19/fixedMessageHandoff.test.js` | `5721dfc7b1f7e237369806f1983f2b9962c09155ca27c5e6526a0d4ecd0fb24b` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r18/fixedMessageHandoff.test.js` | `14951e209bc1f222010603edb951cecb66f92c52b82beaba0361fc9af35f78a2` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |
