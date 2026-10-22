# T800 payout guard R19

Frozen synthetic candidate. Not approved. This report does not approve the candidate.

Staging only. No production, VPS, Intercom, secrets, deploy, or merge. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

## Review result this candidate answers

R18 (`bbe407c5`) returned FAIL: 1416 cases, critical 128 (47 unsupported, 81 wrong bodies), 139 FAQ regressions. Silent drops were 0, false holds 0.14%, non-English failures 0%, bypasses 0, erase/keep 84/84, defer 168/168, and owner locks 156/156.

The wrong bodies and 137 of the FAQ regressions came from the guard rewriting the presend teammate-forward line: it stripped the greeting and replaced the line with a localized copy.

## Structural rule

R19 keeps the R18 final stage. One classifier runs on every outbound public body after the other presend rewriting.

- An exact locked sentence passes as the thread-language variant. A known welcome prefix is stripped only for that classification, so the lock is not hedged.
- A body with no payout or policy claim passes byte for byte, greeting included. The guard does not rewrite, localize, or strip a presend forward line or a status line. Those baseline bytes win. Localization of the forward line, if any, belongs at its source.
- Any policy or payout-shaped body that is not exactly locked becomes the localized hedge.

An empty body hedges. A Catalyst erase or keep intent hedges, including an empty model turn. A failed postgate hedges. `silent` stays false. A defer window still suppresses the public send.

## Class fixes

1. Forward and status lines. `guardPublicBody` no longer calls the forward or status rewrite. English, Urdu, Roman Urdu, Hindi, Arabic, Hinglish, French, Spanish, and Russian copies, with or without `Hello`, `Hi`, `Ciao`, `Salam`, or `السلام علیکم`, pass through unchanged on every thread language.

2. Instruction leaks, by concept, on the owner draft and the customer path. Hindi (`सिस्टम प्रॉम्प्ट`, `आंतरिक नोट`, `सिस्टम निर्देश`, `छिपी हिदायतें`), Arabic (`التعليمات الخفية`, `موجه النظام`, `ملاحظة داخلية`), Urdu (`سسٹم پرامپٹ`, `اندرونی نوٹ`, `چھپی ہدایات`), and Roman Urdu or Hinglish (`system prompt`, `andaruni note`, `chhupi hidayat`, `nizam ka prompt`) hedge. Ordinary "follow the instructions in the email" still passes.

3. Unsupported policy assertions that are not an exact lock hedge on both paths. The classes added from the slips that still passed in R18 are: a crypto or challenge fee amount, a reset price, payout timing in any script (hour, گھنٹہ, घंटा, ساعة, ghante), previous-cycle profit said as received (`مل جاتا`, `mil jata`), an Arabic payout cancellation (`يُلغى`), a Catalyst fee returned (`يعيد الرسوم`), and a reset in a roman loss (`nuqsan`). Exact locks of those facts still pass.

4. Urdu `مٹا` / `صاف` for chart clearing, and Arabic `يحتفظ` for a browser session, are not policy unless they co-occur with a stage, profit, reset, or payout context. They were removed from the unconditional stage-memory fold.

## Kept

`approved.lock.json` is byte-identical to R13 through R18 (`edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667`). Locked bodies were not rewritten. The weekend table, the Strategy Risk owner exception, and the Catalyst bodies are unchanged. Pause, aiOff, human, Fin, and already-replied skips still return before the guard.

## Checks

20 R19 tests passed. `node --check` passed on the guard and the test. `git apply --check` passed on the proposed diff from the repo root. `git diff -- luna-current/01_runtime/index.js` is empty.

FAQ harness: **0 diffs / 258** ordinary replies, including chart-clearing and browser-session lines. Forward and status harness, with welcome prefixes, across the thread languages: **0 diffs / 1680**. `locksOk()` is true. `STATUS.approved` and `result.approved` stay false.

The frozen R13 through R18 author suites were re-run and passed.

This suite is not the independent review, and this candidate is not approved.

## Implementation hashes

These hashes are of the files below. `SHA256SUMS.txt` is written after this report and also lists this report. The checksum file's own hash is not in this report.

| File | SHA256 |
| --- | --- |
| `payoutClaimGuard.js` | `8513ba219e3cfcad4a6cc3dc007a9f92530834b36a424d028d1388dbddbfa164` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `payoutClaimGuard.test.js` | `d4ebf9bb2d931219fa27e292a18b8ce5067576d94d7f6ceaec093d53029bff0c` |
| `index.js.public-sends.diff` | `967316c516f61da3a91e38e1e423cb2611bb77cecada9c9c645063a246d87674` |
