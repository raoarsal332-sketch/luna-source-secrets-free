# Fixed-message handoff R24 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/t800-handoff-r23` at `b3398bbeb92149ddd386ccd9c1b1f97cb749573b`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart of a live seat. Seat ids in the tests are synthetic. The R24 cases call `handleWebhook` with a mocked HTTP client and a temporary control file. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

The R23 review needs changes, and it is close. It reported 0 candidate-only regressions, recovery 353/353, and multilingual 279/279. Those R23 results stay. `index.js`, `presendMega.js`, `statePresend.js`, `targetedRegeneration.js`, `policyEvidence.js`, `escalateRelatedOnly.js`, `faq-kb.js`, and `writeOpStore.js` are unchanged from the R23 freeze.

## What changed

Three R23 misses are corrected. Each one was checked through `handleWebhook`, not only through the helper. Ordinary text that is not one of these three cases stays on the R23 path.

1. **Account prefixes of any length are structural ids.** `isStructuralId` used to accept a letter prefix of only 1–6 characters, so a customer-stated `account11261292` or `Account11261293` was stored as an unlabeled secret and posted as `[secret]`. The structural check now uses the same account-prefix list as the presend account gate: `login`, `acct`, `account`, `mt5`, `mt4`, `id`, `user`, and `no`, case-insensitive, with the digits glued to that prefix at any length. A customer-stated token passes byte-exact. An unstated `account11261292` still takes the checking line `Thanks for the details. I am checking this now and will update you here shortly.` A longer prefix that is not on that list stays a secret. A labeled pin whose value is an account token stays fail-closed.

2. **Credential labels are normalized before detection.** A Cyrillic homoglyph (U+0430 inside `password`) skipped the ASCII label pattern, so `Ref FE81000033.` was posted. Detection now runs on text that has been through NFKC, has format characters removed from inside a label, and has Cyrillic and Greek lookalikes folded to Latin. The fold is a detection copy. The posted text keeps the original label characters and replaces only the value. `FE81000033` is remembered and later echoes, including `Ref FE81000033.`, post `[secret]`. An order id that was not the declared value, such as `FE10482931`, still passes. The same values are persisted for a later process. This stays fail-closed.

3. **A zero-width pin captures one value token.** `pin:` plus U+200B plus `FE81000033` plus U+200B plus `FE10482931` used to become one secret. The echo then posted `Ref [secret]` and removed `FE10482931`. A format character that sits between two complete letter-and-digit tokens is now a hard stop, so the label captures `FE81000033` only. The following order id survives in the prompt and in `Ref FE81000033 FE10482931` and `Ref FE81000033. FE10482931`. A format character inside a label, or inside a single token, is still removed, so `p` plus U+200B plus `assword` still matches and a spaced echo of one secret still scrubs.

The label fold and the zero-width bound live in `credentialSanitizer.js` because `statePresend.noteInbound` calls that sanitizer directly. A wrapper in `fixedMessageHandoff.js` would run after the shared memory already held the glued value.

## Fail-closed declared secrets

A value the customer introduced behind a credential label stays scrubbed on every later reuse, including after a new process starts, even when the token has the shape of an order id. That now includes a label written with a Cyrillic or Greek lookalike. `pin: FE81000000` is still replaced on a later turn. An unlabeled order id the customer did not declare as a secret, such as `FE10482931`, still passes byte-exact.

## Kept

Account-prefix checking lines, the dead-process owed reply, one write 429, wiped-store language, Roman Urdu over a Latin Hindi courtesy word, `kisi` plus `baat`, and the English line for an Italian handoff that has no approved phrase stay as in R23. Value-based outbound scrubbing, comment recovery, the owed line from the op store, password-policy clarifiers, and raw FAQ bytes stay. The MT5 `55188` spread template still hedges. Multi-word passphrases such as `correct horse` still redact, and an ordinary `password back` still does not taint a later `back`.

## Tests

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r24/fixedMessageHandoff.test.js`

24 passed, 0 failed. Each case calls `handleWebhook`. The new cases cover stated `account11261292` / `Account11261293` passing byte-exact, unstated `account11261292` receiving the checking line, a U+0430 `password` label whose `FE81000033` is absent from the prompt, the note, and the public reply while `FE10482931` remains, and a U+200B pin whose single value is scrubbed while `FE10482931` remains on both the spaced and the dotted reply.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r23/fixedMessageHandoff.test.js`

21 passed, 0 failed.

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

Protected prompt and FAQ hashes match (`system-prompt.txt` `bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d`, `fundedelite-faqs.md` `8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92`). Syntax check passed. Adversarial `current_checks.js` passed with `adversarialFail 0`. Eighteen included selftests passed. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R23 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate. Suite line: `hashFail 0 syntaxFail 0 adversarialFail 0 selftestFail 2`.

`node --check` passed on `fixedMessageHandoff.js`, `index.js`, and `presendMega.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `11967ec7fddc99c07b7e75d74fe7f78f06e0dd7c972e38f1f65a96501c069fdd` |
| `luna-current/01_runtime/index.js` | `235a69b785740655e18962ec6a74acdb6162f18d6900235b9ea449ae6a74759e` |
| `luna-current/02_statePresend/presendMega.js` | `b2706eac5141eb55b1c8b8f385c75f69ab3573bb38e0d5fea6e345ea5a61dedc` |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` |
| `luna-current/02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r24/fixedMessageHandoff.test.js` | `a391fbe2f54694e22fcbd04420a89ea2f3cbf098eda68e84b64e86b98f68879e` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r23/fixedMessageHandoff.test.js` | `f9397d02f71f155ee0d01b043cef306d6ac11c2d8d94b3286a000308d97c03bc` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r22/fixedMessageHandoff.test.js` | `3c916dcf0964d4d6bde7ee50106bc8c5d0dd17f00958c867f45b0855c1a0fd18` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r21/fixedMessageHandoff.test.js` | `3b8cf81096a752e3ae2541506d22395e3e5f5fb5d5a720022d486c18f6b2d0fb` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `2d0b5b320634fa529d67247ff3c1c97969384feba0ab80dee77680d36dfe04c4` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |
