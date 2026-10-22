# T800 payout guard R18

Frozen synthetic candidate. Not approved. This report does not approve the candidate.

Staging only. No production, VPS, Intercom, secrets, deploy, or merge. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

## Review result this candidate answers

R17 (`c4925c13`) returned FAIL and improved: critical 106 to 26, non-English failures 0/609, wrong bodies 0, FAQ byte-identical 197/218 plus 12 forward-translation diffs. Suppression held for pause, aiOff, human, Fin, replay, defer, and in-flight. False holds were about 20%. Silent drops were 13.

## Structural rule

R18 keeps the R17 final stage. One classifier runs on every outbound public body after the other presend rewriting. The same stage covers the model reply, owner-dictated text, presend replacements, the forward line, status lines, and retries.

- An exact locked sentence, matched after numeral normalization and script folding in any core language, passes as the thread-language variant.
- A body with no payout or policy claim passes byte for byte.
- Any policy or payout-shaped body that is not exactly locked becomes the localized hedge.

The stage does not choose a different locked fact for a question. A wrong Rise fee, a fee-refund assertion, a reversal, or a weekend-violation sentence hedges unless that text is the exact locked sentence.

An empty body hedges. A Catalyst erase or keep intent hedges, including when the model body is empty and when the draft is an otherwise locked ladder sentence. A send that is allowed therefore always has a non-empty body. `silent` stays false. The guard does not return `silent: true`.

## Class fixes

1. Ordering. The final stage sees the exact outgoing body. Known welcome prefixes (`Hello` / `Hi` / `Hey` / `Ciao` / `Salam` / `السلام علیکم`, with an optional Latin first name, comma, and help question) are stripped before the lock, forward, and status checks. An exact lock is emitted in the thread language without the greeting, so a prepended welcome no longer hedges it. A non-policy remainder keeps the original bytes, greeting included. A greeting alone stays byte-identical.

2. Empty replies. The two model-reply skips (`empty reply body` and `empty after strip known-account ask`) call `postClientCommentOnce` in the proposed diff instead of returning before the guard. An empty or erase turn outside a defer window posts the localized hedge. Pause, aiOff, human-teammate, Fin, and already-replied skips still return before the guard.

3. Postgate and leaks. A failed postgate is passed as `postgateFailed: true`. The result is the localized hedge, never a passthrough, including when the draft looks locked or is ordinary FAQ text. Text that mentions the system prompt, an internal note, hidden or system instructions, `ACTION:`, or `[bot-ack]` is a leak and hedges. Ordinary "follow the instructions in the email" stays a passthrough. During a defer window the send stays suppressed.

4. Urdu and Arabic concepts. Paraphrases hedge when the topic and the assertion are both present, not only when a fixed phrase matches: reset in drawdown or loss, previous-cycle profit, payout reversal, weekend holding or closing, a Catalyst fee refund, and Catalyst erase or keep. Exact locked sentences of those facts still pass.

5. `محفوظ`. The ordinary Urdu word for "save" is not folded into the stage-memory marker. It hedges only together with a catalyst, stage, profit, earning, or reset context. `فائل محفوظ کریں` and a password-save line pass byte-identical.

6. FAQ byte identity. The harness is 0 diffs on 251 ordinary replies, including the save and instruction lines. Forward and status lines on a non-English thread still use that thread's fixed line.

## Language

Thread language is taken from the customer text, including Roman Urdu. The hedge, the forward line, the status line, and a matched locked body use that language. French, Spanish, and Russian have hedges and no locked bodies, so a fixed line on those threads is the hedge in that language. An ordinary FAQ reply is not translated.

## Defer window

While `escalateAwaitingFirstTeammate` is set, or while a related reply is inside the 10-minute defer window, the final stage suppresses the public send. The forward line is included, in English, Urdu, Roman Urdu, Hindi, Arabic, and Hinglish. Suppression is not an empty body: the guard marks the send suppressed, and the hook returns before `postReply`. Outside that window, an empty or erase turn posts the hedge.

## Kept

`approved.lock.json` is byte-identical to R13 through R17 (`edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667`). Locked bodies were not rewritten. The weekend table, the Strategy Risk owner exception, and the Catalyst bodies are unchanged.

## Checks

16 R18 tests passed. `node --check` passed on the guard and the test. `git apply --check` passed on the proposed diff from the repo root. `git diff -- luna-current/01_runtime/index.js` is empty.

FAQ harness against the unmodified baseline body: **0 diffs / 251** ordinary replies. `locksOk()` is true. `STATUS.approved` and `result.approved` stay false.

The frozen R13, R14, R15, R16, and R17 author suites were re-run and passed. They still exercise their own lanes. R18 does not restore their draft-to-fact composer.

This suite is not the independent review, and this candidate is not approved.

## Implementation hashes

These hashes are of the files below. `SHA256SUMS.txt` is written after this report and also lists this report. The checksum file's own hash is not in this report.

| File | SHA256 |
| --- | --- |
| `payoutClaimGuard.js` | `3c05806b514bc2f25883b7ce6d29513ecff2cefb8b250beb644e478ded7f5994` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `payoutClaimGuard.test.js` | `24e6349476da1d97f79d98512ad782c4ca2fb94129833914dbff83064ad74d16` |
| `index.js.public-sends.diff` | `98de216c8a45c91c3a0bc0bc44db34235bb75c9c379a06920ec464ae2c3cb3df` |
