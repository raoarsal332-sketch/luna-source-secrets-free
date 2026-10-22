# Fixed-message handoff R13 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/fixed-message-handoff-r12-8ad1` at `b9ebaacc83e7d15f028799f7ba9139006ded19b7`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `human-7`, `human-9`). The tests use an in-process recording transport and a temporary op-store file. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

R12 stem matching, the strict write judgment, the live-assignee check before the fixed line, 422 comment recovery, the empty clarifier result, and the Arabic account-line bytes are kept. `writeOpStore.js`, `statePresend.js`, `credentialSanitizer.js`, `escalateRelatedOnly.js`, and `targetedRegeneration.js` are unchanged from the R12 freeze.

## What changed

Three review classes are corrected on top of the R12 runtime.

1. **Arabic human-request detection is the R11 matcher plus stems.** `containsToken` is a union. The R11 floor is still there: Arabic is a normalized substring, and Urdu, Hindi, and the other non-English grammars are a folded substring. English stays a whole word. Stem matching is added on top of that floor, so a sentence R11 treated as structural cannot fall out. Arabic stemming also drops object clitics (`ني`, `نا`, `كم`, `كن`, `ها`, `هم`, `هن`, and a final `ك` or `ه` when three letters remain) and the accusative alef left after tanween is stripped. A stem key with alefs removed lets `اوصل` meet `وصلني`, and the hamza plural of `شخص` meet `شخص`. Hamza folding still maps `أريد` and `اريد`. `موظف`, `وكيل`, and `شخص` match with and without hamza and tanween, including `موظفاً`, `موظفة`, `الموظفين`, `وكيلاً`, and `شخصاً`. Those spellings are not added to `GRAMMAR`. `ما هي قواعد السحب؟` stays `route_normal`. The R13 test checks an R11-parity corpus: every generated R11 structural sentence stays structural, and every R11 handoff in the R3 and R7 lists still decides `fixed_message`.

2. **A failed assignment is read before an ambiguous hold.** For a 2xx assignment, `classifyAssignment` calls `classifyWriteOutcome` before `partial`, `unknown`, or `ok !== true`. A wrong seat is `failed` even when `partial` is set. An unnamed partial, a 200 with `unknown`, a null body, or a seat field that is empty is `failed`. `confirm` is false and `unknown` is false, so the hold flag is not set, `phase` becomes `assignment-pending`, and the next attempt assigns again. A response that names the intended seat confirms. A clean synthetic shell (`ok: true`, an id, `type: 'conversation'`, no assignee field, no errors, no `partial`, no `unknown`) stays successful so the older recording transports still complete. The R3 unnamed-partial fixture is this definite miss: it now expects `assign_failed`, `assignAmbiguous` false, and `phase` `assignment-pending`. It still withholds the customer line and `escalateAwaitingFirstTeammate`. That is the one R3 assertion this round changes.

3. **A timeout or 5xx hold is not permanent.** The first timeout or HTTP 500 still sets `assignAmbiguous`, does not set `assignment-pending`, and withholds the line. A same-turn replay that does not ask for a recheck still returns `assign_ambiguous_held` and makes no calls, which is what the R3 and R8 replays lock. `resumeLostHandoff` does not trust that stored flag. It reads the live `admin_assignee_id`. If the seat is still the bot or empty, it resumes with `assignment_unverified` so the handoff can assign again. If the intended seat is already on the conversation, it resumes with `op_assignment`. A note-write ambiguous hold still returns `ambiguous_held`. The runtime sets `recheckHold` on recovery, when the caller asks, and whenever the ticket progress still has `assignAmbiguous`, including after a restart or an op-store wipe. `commit` then drops the stale flag. If the live seat is the intended assignee, it posts the fixed line once and does not assign again. If the live seat is the bot or empty, it assigns again and posts only after that write is verified. A different human is not taken over. A later turn that already shows the fixed line does not post it again.

## Kept

Successful note, then successful assignment, then one fixed message. Assignment 422 stays definite and retryable. An error list is a failed write even when an id is present. A wrong assignee is not confirmed. The fixed line is not posted while the live assignee is still the bot unless this turn's assignment response named the intended seat. `requireLiveAssignee` is still set on the runtime commit. A 422 on the customer comment still resumes after the note is removed. An empty presend result list still posts the clarifier. The Arabic account line stays fatha then shadda. Fixed-line bytes are unchanged. A same-turn ambiguous assignment replay without `recheckHold` still makes no second call.

## Tests

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

33 passed, 0 failed. The unnamed-partial assertion now expects `assign_failed` rather than `assign_partial`.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.test.js`

16 passed, 0 failed.

`node luna-current/08_repair_tests/run-suite.js`

Protected prompt and FAQ hashes match. Syntax check passed. Adversarial `current_checks.js` passed 58/58. Eighteen included selftests passed. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R12 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate.

`node --check` passed on `fixedMessageHandoff.js` and `index.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `fe41c8a504c2769b297da2e193f50994bbebe20d8626c558e4006c63f1797056` |
| `luna-current/01_runtime/index.js` | `e73e6d5a5c62fedd50c625992ae2755a46af2711b17b66ad6f8cb0350eca7f26` |
| `luna-current/01_runtime/writeOpStore.js` | `b69d7694880bbd1167f5df2cecb0d2b391ae83691e80d2d6ea889aeca73c4766` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r13/fixedMessageHandoff.test.js` | `0db271306d7bedda5709dc46cf88ac54c607d587bd454ec8fc1ff244433dbbfa` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r3/fixedMessageHandoff.test.js` | `0b68d32b55f064eb3a08c53e7b4e5e125f16ff0236ee5ceed7ffa741ca49e2b5` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |
