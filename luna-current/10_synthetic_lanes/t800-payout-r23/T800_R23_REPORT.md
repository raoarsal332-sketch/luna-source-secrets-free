# T800 payout guard R23

Frozen synthetic candidate. Not approved. This report does not approve the candidate.

Staging only. No production, VPS, Intercom, secrets, deploy, or merge. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

## Review result this candidate answers

R22 (`c283cfab43d75846c176f2efc07b3154a9176c61`) returned FAIL on a fresh 1470-case set. 54 claims were posted with reason `pass_through`. 28 sends were silent drops (retry 16, fallback 12). 49 FAQ replies differed by whitespace. 9 forward or status lines were rewritten. False holds were 3.96%, and homonym probes were 6.67%. Missing-verdict was 8/8. Defer was 18/18.

Lexicon growth was not converging, so the default changed.

## Structural rule

`pass_through` is allowed only in two cases.

1. The body is byte-identical to an approved lock, a forward or status line, or an allowlisted FAQ article. The allowlist comparison is the SHA256 of the exact bytes. A collapsed-whitespace fingerprint is not enough.
2. Every sentence is policy-neutral by a positive test. The sentence has no policy-domain concept in the normalized set: account, funded, challenge, reset, cycle, profit, earnings, kamai, کمائی, مكافأة, reward, payout, refund, cost back, loss, نقصان, drawdown, underwater, breach, rule, قاعدة, risk, weekend, and time-promise words. Arabic tatweel, diacritics, and letter variants, and Urdu and Hindi variants, are folded before that match. The original surface is also tested, because NFKD splits آ and ؤ.

Anything else is the localized hedge. `STATUS.approved` and `result.approved` stay false. A throw fails closed to `I can't confirm that. Our team will confirm.` `send` stays true and `silent` stays false whenever the send is otherwise allowed. The guard does not return `silent: true`.

Named neutrals stay byte-identical unless a policy concept is also present: bare aaj, weather, an email or password reset link (and a UI reset of zoom, theme, chart, column, or notification), and a weekend market-hours question. Connection, session, signal, packet, network, and power loss stay neutral. A financial or chart loss hedges. A clock question stays neutral.

Exact locks, forward lines, and status lines are classified before the concept gate, so a forward that contains "account" still passes. A welcome prefix on an exact lock still emits the locked sentence. A welcome prefix on an exact forward, status line, or FAQ article passes the original bytes, greeting included.

## Class fixes

1. Deny by default. The old topic lexicon no longer decides. `positivelyNeutral` is the only pass that is not an exact lock, forward, status line, or FAQ hash. `The funded account remains in the same cycle.` and `Earnings stay on the book.` hedge. Bare `پرافٹ سپلٹ` and `منافع کا ذکر نہیں۔` hedge because profit is a concept. Bare `حصہ` and bare `آج` stay byte-identical. `الخسارة القصوى لا تنهي الحساب` hedges with diacritics and tatweel. `پے آؤٹ` is matched on the original surface because the fold turns آؤٹ into اوٹ.

2. Silent drops. A repeated-question retry no longer returns before the guard. The postgate fallback no longer returns before the guard. Both log that the guard verdict is posted once, then the final stage posts that verdict. At the end of the webhook, a hold whose hard fails include `DUPLICATE_REPLY`, or whose reason matches fallback, calls the guard and posts once through `postClientCommentOnce` when the verdict is not suppressed. `duplicate-suppressed` applies only when the identical public body has a comment id, so a not-yet-posted retry is not treated as already sent.

3. Bytes. The guard runs on the final body after `postProcessModelReply` and reply spacing. That processor returns exact locks, forward and status lines, and allowlisted FAQ bodies unchanged: no semicolon replacement and no added blank lines. The allowlist hash is of those exact bytes.

4. False holds. The cases named above are neutral unless a policy concept co-occurs. `لاس` is a whole token, so it does not match inside `الاسبوع`. Bare `hours` and `minute` are not time promises. Market-closed and "I closed the laptop" are not trade cues.

Live FAQ_CONFIRM routing is unchanged and still posts the teammate-forward line before a public send. A review reaches the allowlist with the exact article body by calling the stub, which does not send:

```javascript
const guard = require('./luna-current/10_synthetic_lanes/t800-payout-r23/payoutClaimGuard');
const verdict = guard.harnessPublicBody(exactArticleBody, { clientText: customerText });
```

An exact article returns `reason: 'pass_through'` and the original bytes. It does not return the teammate-forward line. `guardPublicBody` is the same function.

## Kept

`approved.lock.json` is byte-identical to R13 through R22 (`edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667`). Locked bodies were not rewritten. The weekend table, the Strategy Risk owner exception, and the Catalyst bodies are unchanged. `faqAllowlist.json` is byte-identical to R21 and R22. Pause, aiOff, human, Fin, and already-replied skips still return before the guard. Unrelated follow-ups, including Roman Urdu, still do not clear defer. The guard does not require `fs`, `child_process`, `process.env`, or Intercom.

## Checks

31 R23 tests passed. `node --check` passed on the guard and the test. `git apply --check` passed on the proposed diff from the repo root. `git diff -- luna-current/01_runtime/index.js` is empty.

Synthetic FAQ harness: **0 diffs / 258**. Baseline FAQ article bodies: **0 diffs / 198**. `harnessPublicBody` on those articles: **0 diffs / 198**, **0** forwarded, and `isPreservedPublicBody` is true for each. Forward and status harness: **0 diffs / 1680**. Benign homonym and ordinary probes: **0 holds / 84** (0%, under the 2% target). Owner replies of FAQ bodies that contain daily loss, max loss, weekend, or reset wording: **30 / 30** hedged. `locksOk()` is true. `STATUS.approved` and `result.approved` stay false.

The frozen R13 through R22 author suites were re-run and passed.

This suite is not the independent review, and this candidate is not approved.

## Implementation hashes

These hashes are of the files below. `SHA256SUMS.txt` is written after this report and also lists this report. The checksum file's own hash is not in this report.

| File | SHA256 |
| --- | --- |
| `payoutClaimGuard.js` | `c2da4b37d6743f255a5a63f16fb8a383ccb944ee6facb4a12b66414b1f9a0634` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `payoutClaimGuard.test.js` | `e50c6989f4fc64ecdca962ebae842aed3e7fc647a66a16762c0e63930a82ec97` |
| `index.js.public-sends.diff` | `74f20b02803276597b2ade4d696fa189a5581d0b55ffd8b876d554f7e188c5ba` |
| `faqAllowlist.json` | `9f051040460d4be968957f3877186a85bce86d0242f66db034dcf813769fa404` |
