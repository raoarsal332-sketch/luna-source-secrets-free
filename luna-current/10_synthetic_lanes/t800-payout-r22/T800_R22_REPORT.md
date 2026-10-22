# T800 payout guard R22

Frozen synthetic candidate. Not approved. This report does not approve the candidate.

Staging only. No production, VPS, Intercom, secrets, deploy, or merge. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

## Review result this candidate answers

R21 (`91ba2c624e0f3ee240fccf79513daebe52c7ba24`) returned FAIL. 13 claims were posted. Silent drops were 0. Benign false holds were 0.61% and homonym false holds were 0%. Owner locks were 48/48. Defer sends were 0.

The misses were a wiring gap on owner replies, Arabic daily-loss / max-loss / account-ended paraphrases, and Urdu profit-split timing. Exact FAQ articles reached the review as the teammate-forward line, so the allowlist path was not exercised.

## Structural rule

R22 keeps the R21 final stage.

- An exact locked sentence passes as the thread-language variant, including an owner reply.
- An exact presend forward line or status line passes byte for byte.
- A customer-path body whose bytes match a baseline FAQ answer passes untouched. The match is the SHA256 of the answer, or of the same text with invisible characters and whitespace collapsed.
- Any other sentence that touches a policy topic, and is not an exact lock, makes the whole body the localized hedge. Owner-reply drafts take this gate. A menu or profile co-mention does not cancel the topic.
- Homonyms hedge only when the same sentence also has a policy assertion cue.
- A body with no policy topic passes byte for byte.

An empty body hedges. A Catalyst erase or keep intent hedges. A failed postgate hedges. Instruction leaks hedge. `silent` stays false. A defer window still suppresses the public send.

## Class fixes

1. Wiring. `postReply` is the single outbound send. A note is posted as written. A public comment (customer, owner reply, retry, or fallback) is posted only as the guard verdict. The caller may still pass the original body; the send function runs the guard again and posts that result. Owner and postgate flags travel with the body via `takeSendContext` and `payoutRememberOutbound`, so an owner reply is still owner-gated when the original text is what arrives at the send. A defer verdict returns without posting and without throwing. If the guard throws or returns no usable verdict, the send posts `I can't confirm that. Our team will confirm.` and throws `PAYOUT_GUARD_MISSING_VERDICT`. The original body is not posted.

2. Arabic daily loss, max loss, and account ended. Topic detection folds Arabic before the stem check: tatweel and diacritics are stripped, alef and hamza fold to ا, yeh forms fold to ي, and ta marbuta folds to ه. The prefixes ال, و, ب, ف, and ل are removed only when the remainder is one of the policy stems, so forms such as والخسارة, بالحد, and للحساب match, and إلغاء keeps its letters. Stems are خسر / خسارة, يومي, قصوى / الحد الأقصى, انتهى / نهاية / أنهى / إغلاق / إيقاف / لغى, and حساب. `الخسارة القصوى لا تنهي الحساب` hedges on the customer path and on an owner reply, including with diacritics and tatweel. Weekend `نهاية الأسبوع` and `كم الساعة الآن؟` stay byte-identical.

3. Urdu profit-split timing. پرافٹ سپلٹ, حصہ, or منافع together with گھنٹے, دن, آج, فوراً, or یقینی hedges. The same words without that pairing stay byte-identical, so a bare حصہ or آج line does not become a hold. Exact locked sentences that contain منافع and دن still pass as locks.

4. FAQ allowlist harness. Live FAQ routing is unchanged. FAQ_CONFIRM still replaces an FAQ ask with the teammate-forward line before a public send, which is why an end-to-end FAQ turn never reached the allowlist. A review reaches the guard with the exact article body by calling the stub, which does not send:

```javascript
const guard = require('./luna-current/10_synthetic_lanes/t800-payout-r22/payoutClaimGuard');
const verdict = guard.harnessPublicBody(exactArticleBody, { clientText: customerText });
```

An exact article returns `reason: 'pass_through'` and the original bytes. It does not return the teammate-forward line. `guardPublicBody` is the same function.

## Kept

`approved.lock.json` is byte-identical to R13 through R21 (`edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667`). Locked bodies were not rewritten. The weekend table, the Strategy Risk owner exception, and the Catalyst bodies are unchanged. `faqAllowlist.json` is byte-identical to R21. Pause, aiOff, human, Fin, and already-replied skips still return before the guard. Unrelated follow-ups, including Roman Urdu, still do not clear defer.

## Checks

30 R22 tests passed. `node --check` passed on the guard and the test. `git apply --check` passed on the proposed diff from the repo root. `git diff -- luna-current/01_runtime/index.js` is empty.

Synthetic FAQ harness: **0 diffs / 258**. Baseline FAQ article bodies: **0 diffs / 198**. `harnessPublicBody` on those articles: **0 diffs / 198**, and **0** of them came back as the teammate-forward line. Forward and status harness: **0 diffs / 1680**. Benign homonym and ordinary probes: **0 holds / 95** (0%, under the 2% target). Owner replies of FAQ bodies that contain daily loss, max loss, weekend, or reset wording: **29 / 30** hedged. `locksOk()` is true. `STATUS.approved` and `result.approved` stay false.

The frozen R13 through R21 author suites were re-run and passed.

This suite is not the independent review, and this candidate is not approved.

## Implementation hashes

These hashes are of the files below. `SHA256SUMS.txt` is written after this report and also lists this report. The checksum file's own hash is not in this report.

| File | SHA256 |
| --- | --- |
| `payoutClaimGuard.js` | `4ed729159374ad18235dba95c81642a172278b5d116c3595641a43cd222039b9` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `payoutClaimGuard.test.js` | `274cfaa9afa2c0d7537221da656dbb42b8bb831b6a36e0d9f993430cbeacb275` |
| `index.js.public-sends.diff` | `ac2269ba92ab9d10c2e6ad5f1a03a2ab1e4674ccb872e4aa6c476118c29a25b7` |
| `faqAllowlist.json` | `9f051040460d4be968957f3877186a85bce86d0242f66db034dcf813769fa404` |
