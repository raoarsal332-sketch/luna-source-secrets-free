# T800 payout guard R21

Frozen synthetic candidate. Not approved. This report does not approve the candidate.

Staging only. No production, VPS, Intercom, secrets, deploy, or merge. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

## Review result this candidate answers

R20 (`d07ff145`) returned FAIL. 15 claims were sent. Bypasses were 0, silent drops were 0, and the defer clear was fixed. 30 FAQ bodies were byte-changed. Benign false holds were 5.95% (homonym probes 24/72, non-homonym 6/432).

The sent claims named breach outcomes and reward timing the lexicon did not treat as topics. The FAQ regressions and homonym holds came from words such as reset, loss, and weekend firing without a policy assertion.

## Structural rule

R21 keeps the R20 final stage.

- An exact locked sentence passes as the thread-language variant, including an owner reply.
- An exact presend forward line or status line passes byte for byte.
- A customer-path body whose bytes match a baseline FAQ answer passes untouched. The match is the SHA256 of the answer, or of the same text with invisible characters and whitespace collapsed.
- Any other sentence that touches a breach-outcome or reward topic, and is not an exact lock, makes the whole body the localized hedge. Owner-reply drafts take this gate. A menu or profile co-mention does not cancel the topic.
- Homonyms (password reset, loss as an ordinary word, weekend market hours) hedge only when the same sentence also has a policy assertion cue.
- A body with no policy topic passes byte for byte.

An empty body hedges. A Catalyst erase or keep intent hedges. A failed postgate hedges. Instruction leaks hedge. `silent` stays false. A defer window still suppresses the public send, including the forward line.

## Class fixes

1. Topic coverage. Max loss and daily loss, account ended or terminated, strategy risk and risk rule, stop-loss and take-profit, the add-on, Saturday and Sunday with a trading-rule cue, and reward, profit split, and withdrawal synonyms are detected in English, Urdu, Hindi, Arabic, Roman Urdu, and Hinglish. The six sent examples hedge on both the customer path and an owner reply. Exact owner locks still pass.

2. FAQ allowlist. Article bodies from `fundedelite-faqs.md` are hashed into `faqAllowlist.json`. A customer-path body that matches passes byte for byte. An owner reply of that same text is still topic-gated.

3. Homonyms. Reset, bare loss, and weekend or market-hour wording do not hedge unless a policy cue is present (position, hold, add-on, stop-loss, payout, fee, breach, money, or the same class). Password reset, a loss on a chart, and weekend market hours stay byte-identical.

## Kept

`approved.lock.json` is byte-identical to R13 through R20 (`edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667`). Locked bodies were not rewritten. The weekend table, the Strategy Risk owner exception, and the Catalyst bodies are unchanged. Pause, aiOff, human, Fin, and already-replied skips still return before the guard. Unrelated follow-ups, including Roman Urdu, still do not clear defer.

## Checks

26 R21 tests passed. `node --check` passed on the guard and the test. `git apply --check` passed on the proposed diff from the repo root. `git diff -- luna-current/01_runtime/index.js` is empty.

Synthetic FAQ harness: **0 diffs / 258**. Baseline FAQ article bodies: **0 diffs / 198**. Forward and status harness: **0 diffs / 1680**. Benign homonym and ordinary probes: **0 holds / 91** (0%, under the 2% target). `locksOk()` is true. `STATUS.approved` and `result.approved` stay false.

The frozen R13 through R20 author suites were re-run and passed.

This suite is not the independent review, and this candidate is not approved.

## Implementation hashes

These hashes are of the files below. `SHA256SUMS.txt` is written after this report and also lists this report. The checksum file's own hash is not in this report.

| File | SHA256 |
| --- | --- |
| `payoutClaimGuard.js` | `d21b5f94f91ce65d1e46ec2fce2d6e3af6ce27c3f641d18a9605fbb821ed8ba1` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `payoutClaimGuard.test.js` | `1b327802a3e90e99edf4cd9991028ca2d234843aba3a4379ce9a39749b7d4e45` |
| `index.js.public-sends.diff` | `f864409ef6ac625189bdf054d0d4711a50d37a020ba222785fbff994c6e4b188` |
| `faqAllowlist.json` | `9f051040460d4be968957f3877186a85bce86d0242f66db034dcf813769fa404` |
