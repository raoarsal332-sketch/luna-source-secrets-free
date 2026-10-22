# Fixed-message handoff R20 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/t800-handoff-r19` at `6bb9e2dcb3fdc71e4f67444c8b2e4ea3a2894779`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic. The R20 cases call `handleWebhook` with a mocked HTTP client and a temporary control file. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

The R19 review failed on a harder 698-case set: 547/698, 121 product-critical, 18 leaks, 0 duplicates, 14 recovery failures, 0 candidate-only regressions. R19 fixed 209 cases that fail on R18. Those R19 fixes stay. `policyEvidence.js`, `targetedRegeneration.js`, `statePresend.js`, `credentialSanitizer.js`, `escalateRelatedOnly.js`, `faq-kb.js`, and `writeOpStore.js` are unchanged from the R19 freeze.

## What changed

Five review classes are corrected on top of the R19 runtime. Each one was checked through `handleWebhook`, not only through the helper.

1. **Secret-like tokens are removed before the model and again at the outbound boundary.** Customer text is sanitized for labeled secrets and for unlabeled high-entropy tokens (a token of at least eight characters that contains a letter and a digit) before it is placed in the model prompt. `postReply` is the single outbound scrub for every public comment and every internal note, including a non-handoff model reply. `href` and `src` values are left in place so a mention id is not treated as a secret. The exact spread template and the two clarifiers stay exempt.

2. **Latin role words inside Devanagari or Arabic script hand off in the script's language.** `agent`, `human`, `staff`, `banda`, `insaan`, `representative`, and `support person` count when the rest of the ask is in Devanagari or Arabic script. Urdu versus Arabic follows lexical cues, so `أريد human` posts the Arabic locked line and `مجھے staff چاہیے` posts the Urdu line. The 24-character short-role cap is gone. Detection uses the text after the secret is removed, so `please get me a human password: hunter2` posts the English locked line and the secret is absent from the comment and the note.

3. **A missed customer comment still owes the stored line after the note is removed.** A comment 422, 500, or timeout followed by a removed note posts the owed line from the op store. The note is not required, and replaying the confirmed note does not drop the line. No second note and no second assignment are posted. A wiped op store does not open another handoff when our assignment part is already present. The line is re-derived from the parts.

4. **Password-policy questions on `conversation.user.created` are not silent.** Fin-wait no longer swallows them. They take the same clarifier or approved answer used for an empty or number-hedge draft on a later turn. `What password criteria do you use?` posts `Which part of the password policy should I explain?`.

5. **FAQ article bodies are not sanitized, and a prior password turn does not rewrite the next article.** After `What password criteria do you use?`, `How does the challenge work?` posts the raw article, including U+200B, with no `[secret]`. Approved and unique-rank articles ship as stored.

## Kept

Successful note, then successful assignment, then one fixed message. The R19 supported-figure path, password clarifier, mixed-script handoff, unlabeled note scrub, and FAQ byte path stay. Human-request detection on later turns, lost-state language, DLL/MLL concept binding, unique-rank FAQ posts, the Arabic password handoff, the sticky owed line, and the failed-confirmed assignment retry stay as in R19. Silence, owner spoofing, byte-exact lines, and the strict write judgment are unchanged.

## Tests

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r20/fixedMessageHandoff.test.js`

6 passed, 0 failed. Each case calls `handleWebhook`.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r19/fixedMessageHandoff.test.js`

4 passed, 0 failed.

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

Protected prompt and FAQ hashes match. Syntax check passed. Adversarial `current_checks.js` passed 58/58, including `unknown-write-not-repeated-on-redelivery` and `malformed-write-success-not-trusted`. Eighteen included selftests passed. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R19 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate.

`node --check` passed on `fixedMessageHandoff.js` and `index.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `abfbc9993818d1284dc46cdd5b15ae397a645552a3fdab216081d38e5359ab0d` |
| `luna-current/01_runtime/index.js` | `d029a8ebfed38b4bf7c1d351b81dfc9ec9325c4459c3c1117c2c6040018517ce` |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` |
| `luna-current/02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r20/fixedMessageHandoff.test.js` | `601f7e2d41a101ca920c9acdf19b4c6713fe6fe6bf2a03abebb95620f4b11100` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r19/fixedMessageHandoff.test.js` | `5721dfc7b1f7e237369806f1983f2b9962c09155ca27c5e6526a0d4ecd0fb24b` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |
