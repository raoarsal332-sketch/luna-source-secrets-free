# Fixed-message handoff R21 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/t800-handoff-r20` at `0d9af3733d48cd7a59ca20dab8e3a00531e2ca6d`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic. The R21 cases call `handleWebhook` with a mocked HTTP client and a temporary control file. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

The R20 review needs changes on a 981-case set: 906/981 (92.4%; R19 scored 521), 0 leaks, 0 duplicates, handoff 648/648, password 90/90, FAQ 6/6, figures 20/20. Those R20 results stay. `policyEvidence.js`, `targetedRegeneration.js`, `statePresend.js`, `credentialSanitizer.js`, `escalateRelatedOnly.js`, `faq-kb.js`, and `writeOpStore.js` are unchanged from the R20 freeze.

## What changed

Two review classes are corrected on top of the R20 runtime. Each one was checked through `handleWebhook`, not only through the helper.

1. **Outbound scrubbing is value-based.** Secret values are collected from the customer's inbound text: labeled values, using the shared sanitizer's one pattern, and unlabeled high-entropy tokens (at least eight letters and digits, with both a letter and a digit). Order ids (`FE10482931`), the same id inside a receipt URL, MT5 login numbers, and `MT5` plus digits are not collected. Prompt, note, and public bodies then drop only those exact values. Customer text still gets prompt-side sanitization before the model, and that pass skips the same structural ids. A shape rule no longer runs on outbound text, so a model or KB token the customer did not send stays byte-exact. FAQ article bodies still ship raw, including U+200B.

2. **Every non-2xx or timeout on the customer comment keeps the owed line.** A comment 400, 403, 404, or 409 is stored the same way as 422, 429, 500, or timeout. The next turn posts the owed line from the op store. It does not write a second note and it does not repeat the assignment. After five failed comment attempts, the same bound used for assignment, the line stays owed and that turn posts nothing.

## Kept

Successful note, then successful assignment, then one fixed message. The R20 secret scrub for real customer secrets, Latin roles inside Devanagari or Arabic script, the owed line after a removed note, password-policy clarifiers on `conversation.user.created`, and raw FAQ bytes stay. Human-request detection, lost-state language, DLL/MLL concept binding, unique-rank FAQ posts, the sticky owed line, and the failed-confirmed assignment retry stay as in R20. Silence, owner spoofing, byte-exact locked lines, and the strict write judgment are unchanged.

## Tests

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r21/fixedMessageHandoff.test.js`

10 passed, 0 failed. Each case calls `handleWebhook`. The new cases cover an order id, a receipt URL, and MT5 logins in the prompt, the public reply, and the handoff note; comment 400, 403, 404, and 409 with a removed note; and the five-attempt comment bound.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r20/fixedMessageHandoff.test.js`

6 passed, 0 failed.

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

Protected prompt and FAQ hashes match. Syntax check passed. Adversarial `current_checks.js` passed with `adversarialFail 0`, including `unknown-write-not-repeated-on-redelivery` and `malformed-write-success-not-trusted`. Eighteen included selftests passed. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R20 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate.

`node --check` passed on `fixedMessageHandoff.js` and `index.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `89d905230bacb250a28c896320efe855e3f960bc66ed3009f870ce8c386c5d43` |
| `luna-current/01_runtime/index.js` | `ae9520bb5faacb01f773a59ffe613cb171edbd152fa3be2abb5628a0a94eaf3a` |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` |
| `luna-current/02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r21/fixedMessageHandoff.test.js` | `3b8cf81096a752e3ae2541506d22395e3e5f5fb5d5a720022d486c18f6b2d0fb` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r20/fixedMessageHandoff.test.js` | `601f7e2d41a101ca920c9acdf19b4c6713fe6fe6bf2a03abebb95620f4b11100` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r19/fixedMessageHandoff.test.js` | `5721dfc7b1f7e237369806f1983f2b9962c09155ca27c5e6526a0d4ecd0fb24b` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |
