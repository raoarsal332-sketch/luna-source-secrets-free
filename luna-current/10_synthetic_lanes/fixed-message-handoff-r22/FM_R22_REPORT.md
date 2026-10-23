# Fixed-message handoff R22 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/t800-handoff-r21` at `49e500757ba0e76ba546217c00275f28f9fee86c`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic. The R22 cases call `handleWebhook` with a mocked HTTP client and a temporary control file. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

The R21 review needs changes on a 943-case set: 888/943 (94.2%), 0 leaks, 0 duplicates, recovery 296/296, 0 candidate-only regressions. The remaining misses were pre-existing. Those R21 results stay. `statePresend.js`, `credentialSanitizer.js`, `targetedRegeneration.js`, `policyEvidence.js`, `escalateRelatedOnly.js`, `faq-kb.js`, and `writeOpStore.js` are unchanged from the R21 freeze.

## What changed

Three review classes are corrected on top of the R21 runtime. Each one was checked through `handleWebhook`, not only through the helper.

1. **Roman Urdu cues outweigh English fillers.** `janab please mujhe agent chahiye` was a tie: `janab` scored Urdu and `please` scored English, and a tie stayed English. When the line has a Roman Urdu cue (`mujhe`, `chahiye`, `hai`, `karna`, `baat`, `kisi`, `se`, `ko`, `ka`), the fillers `please`, `sir`, and `hi` are dropped from the English score. The locked line is the Urdu line. `please get me a human` has no Roman Urdu cue and stays English. `sir` and `hi` were not added as English markers.

2. **A fresh `conversation.user.replied` password-policy question posts the clarifier.** Conversation age under 120 seconds, with no Elite reply and no Arsal reply, used to return at Fin-wait and post nothing. That turn now uses the same clarifier path as `conversation.user.created`: `passwordPolicyPublicLine` on the customer text, then one public comment. An older `user.replied` still goes through the later draft and FAQ path.

3. **The checking line was the account-number gate, not the credential scrubber.** `presendMega` `CONVERSATION_CONTRADICTION` treats every 5–12 digit run from `textUtils.extractAccountNumbers` as an account. Once one account is known, a digit run inside an order id (`FE10482931` → `10482931`) or a receipt URL is a "foreign account", and `safeFallback` replaces the whole draft with `Thanks for the details. I am checking this now and will update you here shortly.` Order-id tokens, order/invoice/receipt labels, digit runs inside `http` URLs, and account numbers the customer wrote are no longer foreign. A bare number the customer did not state, such as `77889900` beside login `50123456`, still replaces the draft with that checking line. The MT5 `55188` spread template still hedges and is not posted. Labeled credential blocking is unchanged.

## Fail-closed declared secrets

A value the customer introduced behind a credential label stays scrubbed on every later reuse, even when the token has the shape of an order id. `pin: FE81000000` is remembered by the shared sanitizer. A later draft that repeats `FE81000000` posts `[secret]` and does not post that value. This is intentional. An unlabeled order id the customer did not declare as a secret, such as `FE10482931` in the same draft, still passes byte-exact. The structural-id exemption does not forget a labeled secret.

## Kept

Successful note, then successful assignment, then one fixed message. Value-based outbound scrubbing, comment 400/403/404/409 recovery, the owed line from the op store, Latin roles inside Devanagari or Arabic script, password-policy clarifiers on `conversation.user.created`, and raw FAQ bytes stay as in R21. Human-request detection, lost-state language, DLL/MLL concept binding, unique-rank FAQ posts, the sticky owed line, and the failed-confirmed assignment retry stay. Silence, owner spoofing, byte-exact locked lines, and the strict write judgment are unchanged.

## Tests

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r22/fixedMessageHandoff.test.js`

14 passed, 0 failed. Each case calls `handleWebhook`. The new cases cover the Urdu locked line for `janab please mujhe agent chahiye`, the clarifier on a 5-second `conversation.user.replied`, an order id plus receipt URLs plus the customer's own logins posting through the number gate, a bare foreign account still receiving the checking line, the `55188` spread template staying withheld, and `pin: FE81000000` staying scrubbed on a later turn.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r21/fixedMessageHandoff.test.js`

10 passed, 0 failed.

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

Protected prompt and FAQ hashes match (`system-prompt.txt` `bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d`, `fundedelite-faqs.md` `8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92`). Syntax check passed. Adversarial `current_checks.js` passed with `adversarialFail 0`, including `unknown-write-not-repeated-on-redelivery` and `malformed-write-success-not-trusted`. Eighteen included selftests passed. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R21 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate.

`node --check` passed on `fixedMessageHandoff.js`, `index.js`, and `presendMega.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `5f1b08cc998309891f52069e3c2ea5fe09316b5494e531b5963818eb261a1e3d` |
| `luna-current/01_runtime/index.js` | `e32c3652480026705f327be24ee6fdf51bfe76516a4f34533a1154870f731184` |
| `luna-current/02_statePresend/presendMega.js` | `26268375d49673c6e803e731d94b77049347ede5c6235944fa81f5fcbf7fb1b1` |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` |
| `luna-current/02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r22/fixedMessageHandoff.test.js` | `3c916dcf0964d4d6bde7ee50106bc8c5d0dd17f00958c867f45b0855c1a0fd18` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r21/fixedMessageHandoff.test.js` | `3b8cf81096a752e3ae2541506d22395e3e5f5fb5d5a720022d486c18f6b2d0fb` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |
