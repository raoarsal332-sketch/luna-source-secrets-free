# T800 payout guard R15

Frozen synthetic candidate. Not approved. This report does not approve the candidate.

Staging only. No production, VPS, Intercom, secrets, deploy, or merge. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

## Review result this candidate answers

R14 (`27b5cb6c`) returned NEEDS CHANGES across 442 cases: 4 unsupported posts, 7 wrong bodies, 1 erase/keep not hedged, 79 false holds, 2 over-capture, 29 non-English failures, 0 bypasses, 0 FAQ regressions.

## What R15 changes

The claim screen runs on every outbound body, including an owner REPLY and an Arabic or Urdu draft. It does not wait for a lexicon hit.

Catalyst erase-or-keep is always the localized hedge. That includes paraphrases such as "remember yesterday earnings", "keeps yesterday earnings", Urdu یاد / کل کی کمائی, and Arabic تذكر أرباح. The hedge is used whether the claim is the customer question or owner-dictated text. A ladder or rules body is not sent in its place.

A claim that the repo FAQ overrides the Help Centre is hedged. The locked sentence that the Help Centre is primary and the repo FAQ does not override it still passes.

Body selection follows the asked outcome:

- A soft-reset or soft-breach outcome question gets the soft-breach payout body, not the instrument-cap body.
- A weekend holding question gets only the hold body. The Saturday-trading body is used only when the question asks about Saturday or Sunday trading, a new position, or trading on those days. The word "add-on" alone does not select it.
- A stage or ladder price question gets the Catalyst ladder, not the funded reset price (40% / $228) and not "up to 3 times".
- A funded reset-price question gets the reset-price body and does not also get the count body.
- "prices rise" is the verb, not the Rise payout product. Rise is selected from the product name or from Rise next to fee, payout, or withdrawal.

Locked sentences in every core language pass the screen when they match after multilingual normalization (yeh, kaf, heh, and Arabic diacritics), not only as exact English bytes. An uncertain question does not hedge a draft that is already those locked sentences. Other uncertainty still fails closed to the hedge.

An allowed send still posts a body or the hedge. Pause, aiOff, already-replied, human-teammate, and Fin ownership skips still return before the helper.

## Kept from R14

`approved.lock.json` is byte-identical to R14 (`edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667`). Locked bodies were not rewritten. The weekend table, the owner exception for Strategy Risk, and the Catalyst bodies are unchanged.

## Checks

20 tests passed. `node --check` passed on the guard and the test. `git apply --check` passed on the proposed diff from the repo root. `git diff -- luna-current/01_runtime/index.js` is empty.

Over-capture on 120 normal operational FAQ replies: **0 / 120 (0.0000)**, which is below the allowed 2. `locksOk()` is true.

## Implementation hashes

These hashes are of the files below. `SHA256SUMS.txt` is written after this report and also lists this report. The checksum file's own hash is not in this report.

| File | SHA256 |
| --- | --- |
| `payoutClaimGuard.js` | `5423924f242857351f9262fc960e7a72670a4b5cc1d4860044dba51e60968514` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `payoutClaimGuard.test.js` | `215210e3f740923f75839eb95a7e367070c434defe24cf32f24dd2e416f47c35` |
| `index.js.public-sends.diff` | `d4a1fc292ad129a6a55577e5899ccba2cad9ed9764ea333dc151e76fc70a338d` |
