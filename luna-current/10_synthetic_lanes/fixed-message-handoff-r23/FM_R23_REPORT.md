# Fixed-message handoff R23 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/t800-handoff-r22` at `998e9d5abdf48a35fdd4c4baa4718f20f5d2f217`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart of a live seat. Seat ids in the tests are synthetic. The R23 cases call `handleWebhook` with a mocked HTTP client and a temporary control file. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

The R22 review needs changes. It reported 12 candidate-only regressions. Those R22 results stay. `statePresend.js`, `credentialSanitizer.js`, `targetedRegeneration.js`, `policyEvidence.js`, `escalateRelatedOnly.js`, `faq-kb.js`, and `writeOpStore.js` are unchanged from the R22 freeze.

## What changed

The R22 order-id exemption and the shared misses below are corrected on top of the R22 runtime. Each one was checked through `handleWebhook`, not only through the helper.

1. **Account prefixes are account numbers.** `presendMega` `CONVERSATION_CONTRADICTION` no longer treats every 1–6 letter prefix as an order id. `Login11261000`, `MT511261194`, and `acct11261291` are account numbers: the prefix is `login`, `mt5`, or `acct`, and the digits glued to `login`, `acct`, `account`, `mt5`, `mt4`, `id`, `user`, or `no` count as that account. If the customer never stated those digits, the draft is replaced with `Thanks for the details. I am checking this now and will update you here shortly.` The same tokens pass when the customer stated them. A real order id is an `FE`-prefixed token. Digit runs inside an `http` receipt URL stay. The exact numbers the customer stated stay. A bare unstated number such as `77889900` still gets the checking line. The MT5 `55188` spread template still hedges and is not posted. Labeled credential blocking is unchanged.

2. **A dead process does not swallow the owed reply, and a declared pin stays scrubbed.** A write left `pending` by a process that has exited is not an in-flight replay. The next process posts that owed customer line once. Labeled secret values are written beside the op store and loaded into the shared sanitizer when the new process starts, so `pin: FE82000000` is still replaced on a later turn that echoes the value with no label. An unlabeled order id such as `FE10482931` still passes. This remains fail-closed.

3. **A write 429 is one failure.** The same body is not posted again inside that call. The handoff records `commentRejected` `429` and the next turn posts the owed line once, bounded by the existing assignment retry limit. Reads may still retry a 429.

4. **A wiped op store takes language from the conversation.** When the latest customer text is `any update?`, the locked line is chosen from `source.body` and earlier customer text, skipping the status ping. An English source stays English. An Urdu source posts the Urdu line.

5. **Roman Urdu grammar outweighs a Latin Hindi courtesy word.** `kripya mujhe agent chahiye` has the Roman Urdu cues `mujhe` and `chahiye`. Devanagari is what selects Hindi. The locked line is the Urdu line used for Hinglish. `janab please mujhe agent chahiye` stays Urdu. `please get me a human` stays English.

6. **Talking to someone is a handoff.** `kisi` is an indefinite person and is not a short role by itself. Together with the talk act `baat`, `assalam mujhe kisi se baat karna hai` is a handoff and posts the Urdu line.

7. **Italian handoffs that have no approved phrase post the English line.** Italian role and act grammar detects the request, so it no longer stays silent. `Vorrei parlare con un umano` posts the English line. `voglio un operatore` and `voglio parlare con un operatore` still post the Italian line.

## Fail-closed declared secrets

A value the customer introduced behind a credential label stays scrubbed on every later reuse, including after a new process starts, even when the token has the shape of an order id. `pin: FE81000000` is remembered by the shared sanitizer and reloaded from the declared-secret file. A later draft that repeats `FE81000000` posts `[secret]` and does not post that value. This is intentional. An unlabeled order id the customer did not declare as a secret, such as `FE10482931`, still passes byte-exact.

## Kept

Successful note, then successful assignment, then one fixed message. Value-based outbound scrubbing, comment 400/403/404/409 recovery, the owed line from the op store, Latin roles inside Devanagari or Arabic script, password-policy clarifiers on `conversation.user.created` and on a fresh `conversation.user.replied`, and raw FAQ bytes stay as in R22. Human-request detection, DLL/MLL concept binding, unique-rank FAQ posts, the sticky owed line, and the failed-confirmed assignment retry stay. Silence, owner spoofing, byte-exact locked lines, and the strict write judgment are unchanged.

## Tests

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r23/fixedMessageHandoff.test.js`

21 passed, 0 failed. Each case calls `handleWebhook`. The new cases cover unstated `Login11261000` / `MT511261194` / `acct11261291` receiving the checking line, the same tokens passing when the customer stated them, the Urdu line for `kripya mujhe agent chahiye`, a handoff for `assalam mujhe kisi se baat karna hai`, the English line for `Vorrei parlare con un umano` with `voglio un operatore` still Italian, a wiped store whose latest text is `any update?` using the Urdu source, one 429 body then one owed line on the next turn, and a subprocess exit during the customer comment whose next process posts the owed line with the declared pin still scrubbed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r22/fixedMessageHandoff.test.js`

14 passed, 0 failed.

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

Protected prompt and FAQ hashes match (`system-prompt.txt` `bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d`, `fundedelite-faqs.md` `8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92`). Syntax check passed. Adversarial `current_checks.js` passed with `adversarialFail 0`, including `unknown-write-not-repeated-on-redelivery` and `malformed-write-success-not-trusted`. Eighteen included selftests passed. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R22 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate.

`node --check` passed on `fixedMessageHandoff.js`, `index.js`, and `presendMega.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `b2dd80e2a4580f498893329ea7185a277dd7129a7de6fadeb22c93689c4ace8e` |
| `luna-current/01_runtime/index.js` | `235a69b785740655e18962ec6a74acdb6162f18d6900235b9ea449ae6a74759e` |
| `luna-current/02_statePresend/presendMega.js` | `b2706eac5141eb55b1c8b8f385c75f69ab3573bb38e0d5fea6e345ea5a61dedc` |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` |
| `luna-current/02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r23/fixedMessageHandoff.test.js` | `f9397d02f71f155ee0d01b043cef306d6ac11c2d8d94b3286a000308d97c03bc` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r22/fixedMessageHandoff.test.js` | `3c916dcf0964d4d6bde7ee50106bc8c5d0dd17f00958c867f45b0855c1a0fd18` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r21/fixedMessageHandoff.test.js` | `3b8cf81096a752e3ae2541506d22395e3e5f5fb5d5a720022d486c18f6b2d0fb` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |
