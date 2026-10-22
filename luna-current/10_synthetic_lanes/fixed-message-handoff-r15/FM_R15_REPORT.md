# Fixed-message handoff R15 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/t800-handoff-r14` at `9c83804f32674f529fb1d03e7bd75db7c74add8a`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `human-7`). The tests use an in-process recording transport, a temporary op-store file, and the synced FAQ markdown. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

R14 owed-line recovery, Urdu lexical cues, the knowledge-question force exception, the clarifier and password-policy exemptions, silence, owner spoofing, byte-exact lines, and the strict write judgment are kept. `statePresend.js`, `targetedRegeneration.js`, `credentialSanitizer.js`, and `escalateRelatedOnly.js` are unchanged from the R14 freeze.

## What changed

Two review classes are corrected on top of the R14 runtime.

1. **An assignment that did not land is retried once, then the owed line is posted once.** A timeout or HTTP 500 on assignment is still stored as `unknown`, and `shouldSkipReplay` still suppresses a blind replay of that unknown write. On the next turn, `recheckHold` reads the live seat. When the seat is still the bot, the assignment did not land, and that same op is marked `failed-confirmed` before `assign` runs. `failed-confirmed` is not replay-suppressed, so `icRequest` performs one retry with the same idempotency key. On success the owed customer line is posted once. If that retry also times out or returns 500, the op returns to `unknown`, the line stays owed, and the next turn may retry again. The attempt count is carried on the op and stops after five retries. A same-turn replay without `recheckHold` still returns `assign_ambiguous_held` and makes no calls. A note timeout stays `unknown`. A landed seat is not marked `failed-confirmed` and is not assigned again.

2. **Three welcome KB questions take the selected FAQ body.** `What is the daily loss limit?`, `How does the profit target work?`, and `What is the leverage?` were leaving the welcome path as only the number-hedge sentence. Welcome now posts the top article from the same ranking `retrieveOfficialFaqContext` uses. The body is the synced article text. No figure is added. The number hedge still applies when the model drafts a figure the article does not back, including `leverage is 1:999` and a holding time of 99. `what is the daily drawdown?` is not one of these three and still hedges on a missed FAQ. Clarifiers and password-policy questions are not answered from this selector.

## Kept

Successful note, then successful assignment, then one fixed message. Assignment 422 and 429 stay definite and retryable. A timeout or HTTP 500 on assignment still sets `assignAmbiguous` until the live re-check. Silence, owner spoofing, byte-exact lines, and the strict write judgment are unchanged. `requireLiveAssignee` is still set on the runtime commit. Zero customer-line leaks were observed in this suite.

## Tests

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

Protected prompt and FAQ hashes match. Syntax check passed. Adversarial `current_checks.js` passed 58/58, including `unknown-write-not-repeated-on-redelivery` and `malformed-write-success-not-trusted`. Eighteen included selftests passed. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R14 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate.

`node --check` passed on `fixedMessageHandoff.js`, `writeOpStore.js`, `index.js`, and `faq-kb.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `ebe336d32faefde37beec7f7bd8acf42c2aae8c7613adb9a83e114210f34a5fc` |
| `luna-current/01_runtime/index.js` | `d10464945ece066f33b0252956402abf18d0f512aa4bb3ede208647fa25243fd` |
| `luna-current/01_runtime/writeOpStore.js` | `9256babf2c6423e1a621a5ee40a747a6821b4d9e97b0ddb5d3e0e479964d14f3` |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r15/fixedMessageHandoff.test.js` | `6c12916e2a2f9456293577a5be84e887a7440cd61548e9ce2681da7eaa1d37f4` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r14/fixedMessageHandoff.test.js` | `c92bcba2b2735e851a9d9b0dc67fad1014b65b7fc6a52d27e873e7adb34a13f7` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r13/fixedMessageHandoff.test.js` | `0db271306d7bedda5709dc46cf88ac54c607d587bd454ec8fc1ff244433dbbfa` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r3/fixedMessageHandoff.test.js` | `0b68d32b55f064eb3a08c53e7b4e5e125f16ff0236ee5ceed7ffa741ca49e2b5` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |
