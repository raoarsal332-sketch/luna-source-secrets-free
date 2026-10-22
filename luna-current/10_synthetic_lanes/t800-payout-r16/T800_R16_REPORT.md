# T800 payout guard R16

Frozen synthetic candidate. Not approved. This report does not approve the candidate.

Staging only. No production, VPS, Intercom, secrets, deploy, or merge. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

## Review result this candidate answers

R15 (`966e9d3d`) returned FAIL across 450 cases: unsupported 6, wrong bodies 13, suppression bypasses 3, FAQ regressions 80/168, false holds 42/156, non-English failures 14/375. Erase/keep stayed hedged 36/36. Silent drops stayed 0.

## What R16 changes

1. Owner-dictated text and drafts in Urdu, Hindi, and Arabic use the same claim screen as English. After numeral normalization and script folding, the original script surface is kept so Arabic hamza decomposition cannot hide a phrase. A claim that a completed payout was reversed or pulled back, that a payout was paid yesterday, or that a fee was refunded becomes the localized hedge. A locked sentence still passes. A single clear question is answered with its one locked body, so the unsupported draft is not posted.

2. A mixed or compound question gets the hedge. That includes weekend hold together with close, "both hard and soft", a conflict, and more than one fact id. A locked sentence is posted only when it fully answers the single detected intent. Closing over the weekend when a stop loss is hit stays the hold body, because that question has one intent.

3. Defer-window overlap tokenizes Arabic, Devanagari, and Urdu. `tokenizeIssue` and `wordOverlapScore` keep Unicode letters and digits. Strategy Risk text in those scripts shares a `strategyrisk` token with an English defer problem, so the awaiting-teammate gate returns status-only and a same-issue restatement is suppressed. Latin token-length thresholds are unchanged. The first message is not treated as a restatement of itself. The three-minute in-flight time lock is unchanged. The guard does not return `silent: true`.

4. An ordinary non-payout reply passes through untouched, including when the customer question is about a payout. The guard activates on a payout or policy-shaped claim, a status claim, an erase/keep claim, or a source-precedence claim. It does not replace a normal answer with the hedge or with the teammate-forward sentence.

5. When the draft is the teammate-forward sentence, it is rewritten in the thread language. A Hindi or Arabic thread does not keep the English sentence. The sentence is not added to any other draft.

## Kept

`approved.lock.json` is byte-identical to R13, R14, and R15 (`edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667`). Locked bodies were not rewritten. The weekend table, the owner exception for Strategy Risk, and the Catalyst bodies are unchanged. Erase/keep claims, including owner text, stay on the localized hedge. Every allowed send posts a body or the hedge, with `silent: false`.

## Checks

25 tests passed. `node --check` passed on the guard, the test, `teammateHandoffGates.js`, and `escalateRelatedOnly.js`. `git apply --check` passed on the proposed diff from the repo root. `git diff -- luna-current/01_runtime/index.js` is empty. The escalate-related selftest passed 19 checks.

Over-capture on 120 normal operational FAQ replies: **0 / 120 (0.0000)**. `locksOk()` is true. `STATUS.approved` and `result.approved` stay false.

The suite covers the five classes above. It is not the independent 450-case review, and this candidate is not approved.

## Implementation hashes

These hashes are of the files below. `SHA256SUMS.txt` is written after this report and also lists this report. The checksum file's own hash is not in this report.

| File | SHA256 |
| --- | --- |
| `payoutClaimGuard.js` | `ba7fe5096e19175af4752d2c9644643ec62a5dccff1f27e9841dedf12937cc89` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `payoutClaimGuard.test.js` | `dc5c94c780292aaf2b0b0295b8a9dd04a0625eb7899e66718086f10db359d31a` |
| `index.js.public-sends.diff` | `6e5e038b34d50d1420bc09446fa4c05355b5350ef3610b244baa3f98541ef4b3` |
| `luna-current/01_runtime/teammateHandoffGates.js` | `2d7aa5c81a326109d225a2b3a12d30fb9b06cf647d093264826b5c6d84e3acdf` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c3d69a4d871095fbd6343ee3d7c834aaf8197ad8bbeb5524d1f9be017f704218` |
