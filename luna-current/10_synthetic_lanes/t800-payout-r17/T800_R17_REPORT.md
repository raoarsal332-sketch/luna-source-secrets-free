# T800 payout guard R17

Frozen synthetic candidate. Not approved. This report does not approve the candidate.

Staging only. No production, VPS, Intercom, secrets, deploy, or merge. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

## Review result this candidate answers

R16 (`d414374`) returned FAIL and regressed: 720 cases, 106 critical (unsupported 68, erase/keep not hedged 36, bypasses 2), silent drops 102, FAQ regressions 71, non-English failures 27/525. Wrong bodies were 0 and false holds were 0.84%. Critical counts rose from R14 12 to R15 22 to R16 106.

## Structural rule

One final stage classifies every outbound public body after the other presend rewriting. The same stage covers the model reply, owner-dictated text, presend replacements, the forward line, status lines, and retries.

- An exact locked sentence, matched after numeral normalization and script folding in any core language, passes as the thread-language variant.
- A body with no payout or policy claim passes byte for byte.
- Any policy or payout-shaped body that is not exactly locked becomes the localized hedge.

The stage does not choose a different locked fact for a question. A wrong Rise fee, a fee-refund assertion, a reversal, or a weekend-violation sentence hedges unless that text is the exact locked sentence.

An empty body hedges. A Catalyst erase or keep intent hedges, including when the model body is empty and when the draft is an otherwise locked ladder sentence. A send that is allowed therefore always has a non-empty body. `silent` stays false.

## Language

Thread language is taken from the customer text, including Roman Urdu. The hedge, the forward line, the status line, and a matched locked body use that language. French, Spanish, and Russian have hedges and no locked bodies, so a fixed line on those threads is the hedge in that language. An ordinary FAQ reply is not translated.

## Defer window

While `escalateAwaitingFirstTeammate` is set, or while a related reply is inside the 10-minute defer window, the final stage suppresses the public send. The forward line is included, in English, Urdu, Roman Urdu, Hindi, Arabic, and Hinglish. Suppression is not an empty body: the guard marks the send suppressed, and the hook returns before `postReply`. Outside that window, an empty or erase turn posts the hedge.

## Kept

`approved.lock.json` is byte-identical to R13 through R16 (`edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667`). Locked bodies were not rewritten. The weekend table, the Strategy Risk owner exception, and the Catalyst bodies are unchanged.

## Checks

12 R17 tests passed. `node --check` passed on the guard and the test. `git apply --check` passed on the proposed diff from the repo root. `git diff -- luna-current/01_runtime/index.js` is empty.

FAQ harness against the unmodified baseline body: **0 diffs / 245** ordinary replies. `locksOk()` is true. `STATUS.approved` and `result.approved` stay false.

The frozen R13, R14, R15, and R16 author suites were re-run and passed. They still exercise their own lanes. R17 does not restore their draft-to-fact composer.

This suite is not the independent review, and this candidate is not approved.

## Implementation hashes

These hashes are of the files below. `SHA256SUMS.txt` is written after this report and also lists this report. The checksum file's own hash is not in this report.

| File | SHA256 |
| --- | --- |
| `payoutClaimGuard.js` | `b9b8039c0c3e56ad093cc37237391c1ea3b2cb20a70af5c7fd86cb3a0a71c0b6` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `payoutClaimGuard.test.js` | `c39900b3421f4abc9ce2e5dce91d50d913e7aac03919f80fb8425d2991b816a1` |
| `index.js.public-sends.diff` | `d6d380272396382b07c147fedd4e5263104a5a0433586b252625cb952061b547` |
