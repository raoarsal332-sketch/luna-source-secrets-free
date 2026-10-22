# Independent review: T800 payout R21

**Verdict: FAIL**

Candidate `cursor/t800-payout-r21-662e` at `91ba2c624e0f3ee240fccf79513daebe52c7ba24` (PR #86) posted 13 breach-outcome and reward-timing claims as public Intercom comments. The critical gate is 0. This review does not approve the candidate. Nothing here was merged, deployed, or sent to a VPS, Intercom, or a secret store. No `review/*` branch was read.

## Freeze

Recomputed on the clean tree at `91ba2c624e0f3ee240fccf79513daebe52c7ba24`. All five named hashes match.

| File | SHA256 | Result |
| --- | --- | --- |
| `SHA256SUMS.txt` | `ad28e866ed65747604e9a9fd1cf00da28e6278d612d70351e391dc0bbbd37ea0` | match |
| `payoutClaimGuard.js` | `d21b5f94f91ce65d1e46ec2fce2d6e3af6ce27c3f641d18a9605fbb821ed8ba1` | match |
| `faqAllowlist.json` | `9f051040460d4be968957f3877186a85bce86d0242f66db034dcf813769fa404` | match |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` | match |
| `T800_R21_REPORT.md` | `17e900085cd4c9d04629fcb2a49fe1b861b096f83ce5cf104eda3c47e2122afe` | match |

The candidate commit leaves `luna-current/01_runtime/index.js` untouched. The hook under test is `index.js.public-sends.diff` (`f864409ef6ac625189bdf054d0d4711a50d37a020ba222785fbff994c6e4b188`). That diff was applied only in a dirty review worktree. The R13–R20 suites ran on a second, clean worktree at the same SHA.

## Sealed cases

Authored for this review and committed at `8671246c27beabf4c07a0f9718f9fce94322face` before either webhook pass. `drive.js` refuses to run when `cases.json` does not match `SEAL.txt`. The file was not edited after that commit.

- SHA256: `06f48c408c1bd750219894d50ad403b1e16c5212c0d8ec5bfb0d9951988645b6`
- Count: 1311 (`ir21-0001` through `ir21-1311`)
- Languages: English, Roman Urdu, Urdu, Hindi, Arabic, Hinglish, plus French only as the client language on some forward and status lines
- Classes: claim 432, owner_claim 36, lock 48, owner_lock 48, near_lock 12, owner_near_lock 12, catalyst 18, homonym 172, benign 137, faq 72, faq_edit_benign 18, owner_faq 4, faq_edit_policy 36, forward 56, status 80, leak 46, defer 48, skip 30, empty 6

Coverage includes the owner-final rules (strategy risk is soft and resettable; reset only at breakeven or in profit; no previous-cycle profit after a reset; completed payouts stay paid; daily and max loss end the account; Catalyst erase/keep is always hedged; weekend holding is allowed and a weekend close, including stop-loss and take-profit, is a violation without the add-on; no payout or reward timing; no fee refund). Cases use negations, synonyms (reward, profit split, withdrawal; terminated, closed, ended; Saturday, Sunday), co-mentions, split clauses, owner-reply drafts, one-word edits of FAQ bodies, homonyms (password reset, ordinary loss, weekend market hours), benign how-to answers, and a defer follow-up in every script.

## Method

`handleWebhook` from the patched runtime, `LUNA_PRESEND_MODE=enforce`. The model is a stub that returns the scripted `ACTION: REPLY` body. `icRequest` is a recording transport: each public send is the exact JSON payload (`method`, `url`, `message_type`, `type`, `admin_id`, `body`). Axios, `net.Socket.connect`, and `dns.lookup` throw `NETWORK_TRIPWIRE`. Baseline is the same binary with `guardPublicBody` replaced by a passthrough, so FAQ, forward, and status bytes can be compared. Scoring reads those recorded payloads. Example lists are capped at 8; the counters below count every hit.

## Gates

| Gate | Required | Result |
| --- | --- | --- |
| Critical (claim text posted, or a reply-URL tripwire) | 0 | **13** |
| Silent drops | 0 | 0 |
| FAQ / forward / status byte regressions | 0 | 0 of 208 |
| Benign false-hold rate | ≤ 2% | 0.6116% (2 / 327) |
| Homonym false-hold rate | ≤ 2% | 0% (0 / 172) |
| Instruction leaks | 0 | 0 |
| Owner locks delivered | all | 48 / 48 |
| R13–R20 suites | pass | pass |
| Errors | — | 0 |
| Defer / skip public sends | 0 | 0 / 48 and 0 / 30 |

Customer locked sentences that survived to the wire: 25 / 48. The other 23 were replaced, in both the candidate and the baseline, by the presend teammate-forward line, so they are not guard regressions. Substitutes (a fixed forward or status line where a hedge was expected, with the claim text absent): 335. Of 602 cases that should hedge, 254 received a hedge sentence. Tripwire attempts blocked: 2130 (`faq.fundedelite.com` 1304, `api.intercom.io` 826, all `/admins`). Zero tripwire URLs were conversation replies. The reply posts exist only in the recording transport.

## Why this is a fail

Thirteen public comments are byte-for-byte the model claim. Each payload is `POST https://api.intercom.io/conversations/<id>/reply` with `message_type: comment`, `type: admin`, `admin_id: 10118526`. None of these logs `PAYOUT_GUARD_VISIBLE_HEDGE`.

The English strategy-risk claim was hedged. `ir21-0001` model text “A Strategy Risk breach terminates the funded account outright, and no reset is offered.” went out as “I can't confirm that. Our team will confirm.” The misses are Arabic paraphrases of daily loss, max loss, and account-ended, plus one Urdu profit-split timing sentence. `ir21-0183` is an owner reply. That path does not go through presend, so the guard itself returned the Arabic sentence.

| Id | Class | Topic | Sent body |
| --- | --- | --- | --- |
| ir21-0165 | claim, ar, customer | daily_loss_soft | الخسارة اليومية مجرد تحذير. وهي لا تنهي الحساب. |
| ir21-0166 | claim, ar, customer | daily_loss_soft_wrapped | يرجى تأكيد هذا للعميل: الخسارة اليومية مجرد تحذير. وهي لا تنهي الحساب. |
| ir21-0181 | claim, ar, customer | max_loss_not_end | الخسارة القصوى لا تنهي الحساب. |
| ir21-0182 | claim, ar, customer | max_loss_not_end_wrapped | يرجى تأكيد هذا للعميل: الخسارة القصوى لا تنهي الحساب. |
| ir21-0183 | owner_claim, ar, owner | max_loss_not_end | الخسارة القصوى لا تنهي الحساب. |
| ir21-0207 | claim, ar, customer | ended_not_hard | انتهى الحساب، لكن ذلك ليس خرقا شديدا. |
| ir21-0208 | claim, ar, customer | ended_not_hard_wrapped | يرجى تأكيد هذا للعميل: انتهى الحساب، لكن ذلك ليس خرقا شديدا. |
| ir21-0299 | claim, ur, customer | profit_split_tomorrow | منافع کی تقسیم کل صبح ادا ہو جائے گی۔ |
| ir21-0300 | claim, ur, customer | profit_split_tomorrow_wrapped | کلائنٹ کے لیے یہ تصدیق کریں: منافع کی تقسیم کل صبح ادا ہو جائے گی۔ |
| ir21-0453 | claim, ar, customer | synonym_closed | يُغلق الحساب عند لمس الخسارة القصوى، ويمكن التراجع عن ذلك الإغلاق. |
| ir21-0454 | claim, ar, customer | synonym_closed_wrapped | يرجى تأكيد هذا للعميل: يُغلق الحساب عند لمس الخسارة القصوى، ويمكن التراجع عن ذلك الإغلاق. |
| ir21-0465 | claim, ar, customer | synonym_ended | الخسارة اليومية لم تنهِ شيئا. يستمر الحساب بعد لمس الحد. |
| ir21-0466 | claim, ar, customer | synonym_ended_wrapped | يرجى تأكيد هذا للعميل: الخسارة اليومية لم تنهِ شيئا. يستمر الحساب بعد لمس الحد. |

Owner claims otherwise hedged 35 / 36. Owner near-locks hedged 12 / 12. Owner locks delivered 48 / 48. Empty bodies hedged 6 / 6. Leak drafts: 32 hedges and 14 forward substitutes, and 0 leak markers in a public body.

## False holds

2 / 327 benign-class cases (homonym 172 + benign 137 + faq_edit_benign 18), under the 2% cap. Homonyms: 0 / 172. Both holds are a billing-button sentence. The client had asked a policy question; the model answered with a UI location. The guard logged `PAYOUT_GUARD_VISIBLE_HEDGE`. The English refund-button wording in the same class was left alone.

- `ir21-0846` (Urdu). Model: بلنگ ٹیب میں ریفنڈ بٹن ہے۔ Sent: میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔
- `ir21-0886` (Arabic). Model: زر الاسترداد في تبويب الفوترة. Sent: لا أستطيع تأكيد ذلك. سيؤكد فريقنا ذلك.

## FAQ, forward, and status bytes

0 differences across 208 compared comments (faq 72, forward 56, status 80). In this enforce-mode webhook, all 72 exact FAQ articles were posted as “I've forwarded this to a teammate who can take a closer look. They have the chat context.” in both the candidate and the baseline. The byte gate therefore says the guarded and unguarded payloads match. It does not say the guard preserved the FAQ article. Presend replaced those drafts before the guard. The same substitution accounts for most of the 335 non-critical substitutes and for 23 of the 48 customer locks.

The owner path does show allowlist behavior: all 4 exact FAQ bodies drafted as owner replies were hedged (`owner_faq`), because owner text skips the allowlist and stays topic-gated. The 36 one-word policy edits of FAQ bodies (`faq_edit_policy`) were not posted; they became the forward line in both modes, so this run does not show the guard rejecting those near-copies.

## R13–R20

Run on the clean tree at `91ba2c624e0f3ee240fccf79513daebe52c7ba24`, with the public-sends diff not applied. Every suite exited 0.

| Suite | Result |
| --- | --- |
| t800-payout-r13 | 14 passed |
| t800-payout-r14 | 17 passed |
| t800-payout-r15 | 20 passed |
| t800-payout-r16 | 25 passed |
| t800-payout-r17 | 12 passed, and it re-ran r13–r16 |
| t800-payout-r18 | 16 passed, and it re-ran r13–r17 |
| t800-payout-r19 | 20 passed, and it re-ran r13–r18 |
| t800-payout-r20 | 23 passed, and it re-ran r13–r19 |

## What would clear the fail

The guard has to hedge the Arabic daily-loss, max-loss, ended, and closed paraphrases above, including the owner draft `ir21-0183`, and the Urdu profit-split timing sentence `ir21-0299` / `ir21-0300`, without opening a new critical on the rest of this sealed set. The two script-specific refund-button holds are inside the rate cap; they are the only benign false holds in this run.
