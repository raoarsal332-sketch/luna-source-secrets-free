# Fixed-message handoff R14 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/fixed-message-handoff-r13-8ad1` at `d769d0aa25143698a804936991eb239cdfa0fb15`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `human-7`, `human-1`). The tests use an in-process recording transport and a temporary op-store file. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

R13 Arabic-floor-plus-stems, the strict assignment verdict, the live-assignee check, the same-turn ambiguous hold, byte-exact fixed lines, and the empty clarifier result are kept. `statePresend.js`, `credentialSanitizer.js`, `escalateRelatedOnly.js`, and `targetedRegeneration.js` are unchanged from the R13 freeze.

## What changed

Four review classes are corrected on top of the R13 runtime.

1. **The owed customer line is durable and survives the seat landing.** `commit` writes an owed-fixed-line op record before it calls assign. The record holds the locked line, the assignee, and one idempotency key. After that seat is the live assignee, or the parts show our assignment, the next customer message is not treated as human-owned. The stored line is posted once. A real human public reply after our assignment suppresses that post. A wiped op store re-derives the debt from parts: our assignment part is present, no later comment from us, and no later human comment. The internal note is not required, so a removed note still completes. A 422, 429, 500, or timeout on the customer comment leaves `messageAmbiguous` clear and `commentRejected` set, and the next commit posts the line once. If the parts already contain the line, the commit is `already_sent`. A timeout or 5xx on the assignment or the note stays `unknown`. `shouldSkipReplay` still suppresses a blind HTTP replay of that unknown write. The next process re-reads the live assignee and the parts. When the write has landed, it continues to the owed line. A same-turn assignment replay without `recheckHold`, while the seat is still the bot, still returns `assign_ambiguous_held` and makes no calls. The customer-comment unknown op is the only one released, and only when the line is not already in the parts.

2. **Urdu and Arabic role lists both run on Arabic-script text.** `بات آدمی` and `ملاؤ آدمی` have no Urdu-only letter, so script detection used to call them Arabic and skip the Urdu list. Arabic-script text now hits when either list matches. The locked line language follows Urdu lexical cues (`ایجنٹ`, `بندہ`, `نمائندہ`, `آدمی`, `چاہیے`, `بات`, `ملاؤ`, and the other Urdu acts), not only Urdu-only letters. `شخص` and `انسان` stay shared and are not cues, so `أريد التحدث مع موظف` stays the Arabic line. Short Roman sentences follow their own language: `agent`, `agent please`, and `live agent please` stay English; `agent chahiye` and `agent se baat karo` take the Urdu line. `voglio un operatore` stays Italian.

3. **A knowledge question is not forced onto the fixed line.** Welcome already returns `route_normal` for `ما هي قواعد السحب؟`. A non-welcome path used to set `force` for every sentence. Force now stays off for a knowledge question, so that FAQ stays `route_normal` on `main_escalate`, `missed_escalation`, `presend_escalate`, and `recovery`. Vague `hi`, an identity supply such as `my account number is 189143`, a status ping such as `any update?`, and a real handoff ask still follow force. When a line is already owed, the completion uses the stored line, so a later FAQ does not drop the debt.

4. **The four clarifier and password-policy cases stay off the number hedge and off the handoff.** `Please tell me which challenge you mean.` and `Which challenge do you mean?` stay legitimate clarifiers. `what is the password policy?` and `what are the password requirements?` stay `route_normal` on welcome and on the escalate paths. None of the four is a fixed line or the number hedge. The missed-escalation hold returns before the hedge and before `commitFixedMessageHandoff` for these cases. A clarifier draft is still posted. `targetedRegeneration.js` and `credentialSanitizer.js` are unchanged.

## Kept

Successful note, then successful assignment, then one fixed message. Assignment 422 and 429 stay definite and retryable. An unnamed partial, a wrong seat, and an unnamed incomplete body stay `assign_failed` with `phase` `assignment-pending`. A clean synthetic shell with no assignee field stays successful. A timeout or HTTP 500 on assignment still sets `assignAmbiguous` and does not set `assignment-pending`. Silence, owner spoofing, byte-exact lines, and the strict write judgment are unchanged. `requireLiveAssignee` is still set on the runtime commit. Zero customer-line leaks were observed in this suite.

## Tests

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

Protected prompt and FAQ hashes match. Syntax check passed. Adversarial `current_checks.js` passed 58/58, including `unknown-write-not-repeated-on-redelivery` and `malformed-write-success-not-trusted`. Eighteen included selftests passed. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R13 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate.

`node --check` passed on `fixedMessageHandoff.js`, `writeOpStore.js`, and `index.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `ef80f0e764a45b5d0e810c0caa3b0752c8e7b508fa1bd2c768c3088dc84f8ad0` |
| `luna-current/01_runtime/index.js` | `e3458c3f3c0045f5880babf1ba6226990d60b083078f54f906d8f0a089fb027e` |
| `luna-current/01_runtime/writeOpStore.js` | `e50d867f717b607003bd00065d67346bd2c5c50f74ddb342bfbebd6e98ff44ab` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r14/fixedMessageHandoff.test.js` | `c92bcba2b2735e851a9d9b0dc67fad1014b65b7fc6a52d27e873e7adb34a13f7` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r13/fixedMessageHandoff.test.js` | `0db271306d7bedda5709dc46cf88ac54c607d587bd454ec8fc1ff244433dbbfa` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r3/fixedMessageHandoff.test.js` | `0b68d32b55f064eb3a08c53e7b4e5e125f16ff0236ee5ceed7ffa741ca49e2b5` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |
