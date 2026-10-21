# Independent review: payout guard R12

**Verdict: BLOCKED**

Reviewed as an independent reviewer. The author's tests and the author's `T800_R12_REPORT.md` were not used as evidence. No earlier review branch, `independent-review/` folder, or earlier report was read. Nothing was merged, approved, deployed, or sent to Intercom.

Frozen target: branch `cursor/t800-payout-r12-662e`, commit `71ed3d69fd1d7cef10a249fe00971f8998f33a8d`, draft PR #41. This review is on `review/payout-r12`.

## Hash check

All five frozen blobs match the requested sha256. Hashes were taken with `git show 71ed3d69fd1d7cef10a249fe00971f8998f33a8d:<path>` because this review branch does not contain the lane.

| File | sha256 | Result |
| --- | --- | --- |
| `payoutClaimGuard.js` | `2936f87ee4f9ce35c0efd9587c5e6f2fbbf667eb27e1d2b8bbe79967baa099a9` | match |
| `approved.lock.json` | `52a4eca9c8d306e48653a05aad26e83b2f4644dc15a48137190be1775b241aed` | match |
| `index.js.public-sends.diff` | `440d7028b1493f8fbd5c660faf393016877cae7a9ad5192d40d5fe9d558f8466` | match |
| `T800_R12_REPORT.md` | `b7822ce96d10a5c886ae584f6ba99d68f1ef966339b1a000b3076cf543742360` | match (identity only) |
| `SHA256SUMS.txt` | `cb3645a26b468753068ec54589b94d7e459231dd43f22493df4a5de836b58a7f` | match |

`locksOk()` on the frozen lock file passed: every locked hash matches the body and hedge strings in the guard.

## Method

R12 is not applied on `main`. The commit only adds the frozen lane under `luna-current/10_synthetic_lanes/t800-payout-r12/`. The runtime blob of `luna-current/01_runtime/index.js` is the same on `main` and on this commit.

A copy of `luna-current/01_runtime` was built at `/tmp/r12-run/01_runtime`. The public-sends diff was applied there with `patch -p3`. The frozen guard and lock were copied beside it so the real `require('../10_synthetic_lanes/t800-payout-r12/payoutClaimGuard')` resolves. No guard shim was inserted. `luna-current/02_statePresend` was copied to `statePresend/` inside the runtime copy because that is the directory `index.js` already requires. `npm ci --ignore-scripts` installed the runtime's own dependencies.

The harness calls the real exported `handleWebhook` through `module.exports.__setTestDoubles({ icRequest, fetchConversation })`, with a local stub at `OPENAI_BASE_URL` for `/v1/chat/completions`. Presend mode is the unset default, `enforce`. Control state was a local file with pause and test mode off. The client is the synthetic name Sam. No production host, VPS, Intercom API, secret, or customer record was used.

Network egress was limited to `127.0.0.1`, `localhost`, and the public Help Centre hosts `faq.fundedelite.com`, `www.fundedelite.com`, and `fundedelite.com`. The eight articles were fetched live on 21 October 2026:

- 17437410 How do I reset a funded account?
- 17437398 What happens after a soft breach?
- 17437388 Hard breach vs soft breach
- 17437285 How much can I risk on one instrument? (Funded only)
- 17437354 How will I be paid, and what are the fees?
- 17437215 Catalyst
- 17437306 Can I trade or hold positions over the weekend?
- 17437366 Do I get my challenge fee back?

The sealed set is 259 cases in `harness/run.js`: 23 facts × 6 languages, plus erase/keep, termination paraphrases, worded numbers, mixed drafts, owner REPLY / "send this message" / FOLLOW, suppression, early returns, postgate, customer turns, retries, deferred sends, non-payout FAQs, and paraphrases. Languages are English, Urdu script, Urdu Roman, Hindi, Arabic, and Hinglish.

## Counts

The harness scorer's raw tally is in `results/summary.json`. It over-counts two things. This table is the reviewer recount in `results/recount.json`.

| Bucket | Count | Class |
| --- | --- | --- |
| Cases | 259 | |
| Clean after recount | 161 | |
| Unsupported claims posted | 5 | critical |
| Wrong approved bodies posted | 17 | critical |
| Suppression bypasses | 0 | critical |
| False holds | 42 | |
| Silent drops observed | 0 | |
| Over-capture | 6 | 3 of these are also wrong bodies |
| Regressions | 5 | presend escalation of a safe non-payout draft |
| Non-English failures | 30 | right fact, wrong language register |
| Harness side effects | 136 | blocked `api.intercom.io`, no thrown error |

The 136 harness flags are side calls the recording double does not implement (admin list, assign, conversation open). The public comment was still captured when one was sent. Zero webhook errors. Those flags are excluded from the product counts. 75 of them had no product flag and posted the expected locked body or a correct skip.

Scorer corrections, so the raw `critical_wrong_body: 28` and `critical_bypass: 1` are not the product result:

- Seven presend escalations (`I've forwarded this to a teammate...` or `I am checking this now...`) were scored as wrong bodies. They posted no locked fact. They are false holds.
- `postgate-unsafe-unchanged` was scored as a suppression bypass because any public text failed a `silent` expectation. The posted text is the teammate handoff. The draft `I have approved your password change.` was not posted. `POSTGATE_SUPPRESSED` was false. Pause, aiOff, already-replied, human takeover, and teammate handoff did not fire on that fixture. It is a false hold.
- `more-hard-hi` posted the Hindi hard-breach body, which does say that touching max loss ends the account. That claim matches article 17437388. It is removed from the product failure count.
- Urdu and Arabic weekend-hold questions posted the English draft `You cannot hold any position from Friday to Monday.` The scorer missed them because it only flags `weekend_hold` when the locked body is present. They are unsupported claims.
- Three raw drafts (`more-rev-ur`, `more-time-ur`, `more-time-ar`) are unsupported claims. They are not approved bodies, so they are not also counted as wrong approved bodies.

## Why this is BLOCKED

### 1. The locked weekend-hold body is false in all six languages

Help Centre 17437306, table "Action on Saturday or Sunday":

| Action | Without add-on | With add-on |
| --- | --- | --- |
| Hold an open position | Allowed | Allowed |
| Move your stop loss or take profit | Allowed | Allowed |
| Open a new position | Violation | Allowed |
| Close a position, including a stop loss or take profit being hit | Violation | Allowed |

The article also says a fill on Saturday or Sunday counts as weekend trading, and on a funded account the consequence is a reset and the current cycle's profit is forfeited.

The locked English `weekend_hold` body says:

> You can hold positions from Friday to Monday without the Weekend Trading add-on. Moving the stop loss or take profit over the weekend is allowed. Closing a position over the weekend, including a stop loss or take profit being hit, is allowed.

The first two sentences match the table. The third sentence drops the add-on condition and states the opposite of the Violation cell. The Urdu, Roman, Hindi, Arabic, and Hinglish bodies are hash-locked translations of that same claim. `weekend_trade` correctly says that opening without the add-on is a violation and that a funded account is reset with the cycle profit forfeited. It does not say that closing is also a violation.

This run posted that false close-is-allowed sentence on five Catalyst-rules questions, because the question included "weekend" and the classifier attached `weekend_hold` as well as the Catalyst facts:

- `fact-catalyst_rules-en`
- `fact-catalyst_rules-ur`
- `fact-catalyst_rules-roman`
- `fact-catalyst_rules-hi`
- `fact-catalyst_rules-hinglish` (Roman text, also a non-English failure)

Arabic Catalyst rules posted the Catalyst bundle without `weekend_hold`.

The direct hold questions did not post the locked body. English, Roman, Hindi, and Hinglish were escalated to a teammate (false holds). Urdu and Arabic passed the stub draft through unchanged:

> You cannot hold any position from Friday to Monday.

Article 17437306 says holding from Friday to Monday is allowed without the add-on. That posted sentence is an unsupported claim (`fact-weekend_hold-ur`, `fact-weekend_hold-ar`).

### 2. A 50% instrument outcome was answered with the Strategy Risk body

`worded-outcome` asked what happens if the customer risks fifty percent of the daily loss on one instrument. The public comment was:

> A Strategy Risk or Risk Rule breach on a funded account is a soft breach with a reset. It does not terminate or close the account.

Article 17437285 says breaking the 50% rule can lead to closure of the funded account and loss of its profit, and that the customer can reset. Article 17437388 lists "Risking more than 50% of your daily loss limit on one instrument in a day (funded): account closed, you can reset it" in the hard column. The Help Centre does not name that line Strategy Risk or Risk Rule.

The owner-final rule is that a Strategy Risk or Risk Rule breach on a funded account is a soft reset and never termination. The named `strategy_risk` body matches that rule, and the named questions in this set were answered with it, including owner REPLY, "send this message", and FOLLOW. That override does not authorize "does not terminate or close" for the separate 50% instrument question.

When the same 50% question asked only for the cap (`worded-fifty`, `worded-pachas`), the guard posted `instrument_cap`. Those numbers match 17437285 ($2,500 on a 2-Step $100,000 account; 3% → 1.5%, 4% → 2%, 5% → 2.5%). `instrument_cap` does not deny closure.

### 3. Non-payout wording was rewritten into payout facts

- `over-password`, customer "How do I reset my password?", draft "Open the login page and choose a new password." Posted the funded-reset bundle: breakeven-or-profit only, up to 3, 40% / $228 / $456 / $912, dashboard button, previous-cycle profit not paid.
- `owner-password-reset` did the same to an owner REPLY about resetting a password from the login page.
- `over-crypto-pay`, "Can I pay for a new challenge with crypto?", posted the USDC withdrawal fee: 3%, $400 arrives as $388.

Those three are wrong approved bodies and over-capture. The keyword `reset` and the keyword `crypto` are enough.

Three further non-payout lines were captured only as the hedge ("I can't confirm that. Our team will confirm."): "half a pip", Instant profit-split percent, and "I rise up early" plus a leverage question. No false money claim was posted. They are over-capture and false holds.

Five other safe non-payout drafts (KYC timing, platform name, trailing-drawdown clock, account merge, restricted countries) were escalated to a teammate by presend. The payout facts were not attached. Counted as regressions of the non-payout answer. Leverage, inactivity, news, and affiliate drafts passed through.

### 4. False reversal and timing drafts were posted unchanged

The guard did not replace these stub drafts:

- `more-rev-ur`: جی ہاں، مکمل پے آؤٹ واپس ہو جاتا ہے۔
- `more-time-ur`: ایک گھنٹے میں ادا ہو جاتا ہے۔
- `more-time-ar`: تُدفع خلال ساعة واحدة.

The owner rule is that a completed payout is not reversed. Article 17437354 says approved rewards are paid within 5 business days, then bank transfers take 1–3 days. English "undo" was replaced with "A completed payout is not reversed." English "take back", Hindi, and Arabic reversal paraphrases were hedged, which is a false hold of the true "not reversed" sentence and does not post the false reversal.

### 5. Catalyst erase versus keep was not always the hedge

Article 17437215 does not say whether a stage reset erases or keeps profit. The locked `catalyst_stage_reset` body correctly stops at "you can buy one reset after the first stage; the first stage has no reset." Erase/keep has no approved body.

Keyword cases hedged, including English erase/wipe/clean slate/kept/preserved, Urdu محفوظ/محو, Hindi मिटा, and one Roman "munafa rakha". These three paraphrases posted other Catalyst facts instead:

- `erase-6` Roman "mita" / "reh jata" posted the Roman ladder.
- `erase-11` Hindi "रह जाता है या साफ" posted the Hindi Catalyst rules.
- `erase-15` Hinglish "stay" / "delete" posted the Roman Catalyst rules.

`postgate-valid-hedge-exact` did post the English hedge for the keyword erase/keep question.

## The 23 approved bodies

English was compared sentence by sentence with the live articles. Translations were checked where the lock carries the English claim into the other five languages, and where the webhook posted them. A full independent re-translation of every sentence was not done; the lock binds each translation to the frozen string.

| Id | Against | Result |
| --- | --- | --- |
| `strategy_risk` | Owner-final | Match for the named Strategy Risk / Risk Rule question: soft breach with a reset, does not terminate. Wrong body for the 50% instrument outcome. |
| `daily_loss_hard` | 17437388 | Match. Touching daily or max loss is a hard breach and ends the account. |
| `hard_breach` | 17437388 | Match for fraud, KYC/chargeback, group trading, account management, scalp-above-limit in evaluation, repeated soft breach, and the free-retry exception. Omits the 50% instrument line, which that article lists as hard. |
| `soft_kinds` | 17437388 | Match for the soft column. |
| `instrument_cap` | 17437285 | Cap numbers match. The article also says the breach can close the account. This body does not say that and does not deny it. |
| `soft_breach_payout` | 17437398 | Match. Account stays open, current payout at 30%, cycle restarts at payout 1, fee-refund count restarts, a repeat after warning can reset and forfeit profit. |
| `weekend_hold` | 17437306 | **Fail, all six languages.** Closing, including a stop or target being hit, is stated as allowed with no add-on condition. |
| `weekend_trade` | 17437306 | Opening without the add-on, the Saturday/Sunday fill, and the funded reset plus forfeited cycle profit match. Closing is not stated as a violation. |
| `rise_fee` | 17437354 | Match. $500 minimum, $40, $4,800 arrives as $4,760. |
| `crypto_fee` | 17437354 | Match. USDC, any amount, only method below $500, 3%, $400 arrives as $388. |
| `payout_timing` | 17437354 | Match. 5 business days, bank 1–3 days, crypto within hours, review within 30 days, sometimes the original payment method with notice before sending. |
| `catalyst_rules` | 17437215 | Match. 8% target, options 5/8/10, no time limit, daily loss 3%, trailing max loss 6% then 5%, 5 profitable days, 30% consistency, weekend not allowed, first payout at 14 days then 7/14/21. |
| `catalyst_ladder` | 17437215 | Match, including stage 7 at $1,000,000 / 95% / reset $4,790 and a $50,000 start at stage 2 on 80%. |
| `catalyst_reopen` | 17437215 | Match. An approved payout closes the account and opens a fresh double-size account, automatic or within 24 hours. |
| `catalyst_stage_reset` | 17437215 | Match for "buy one reset after the first stage; the $25k or $50k first stage has no reset." No erase/keep claim. |
| `reset_eligibility` | 17437410 and owner-final | Match. Only at breakeven or in profit. |
| `reset_count` | 17437410 | Match. Up to 3. |
| `reset_price` | 17437410 | Match. 40% of the original price before discounts, including add-ons, minimum $10; second doubles the first; third doubles the second; $569 → $228, $456, $912. |
| `reset_where` | 17437410 | Match. Trading Objectives, Reset options next to Credentials. |
| `reset_previous` | 17437410 and owner-final | Match. Fresh account; previous-cycle profit is not paid. |
| `fee_refund` | 17437366 | Match. 1-Step, 2-Step, LITE 1-Step, LITE 2-Step, with the third payout if first-attempt pass, no Free Retry, never reset, no soft breach in those three cycles. Soft breach restarts the count. Instant, Instant Elite, Flash Activation, and Catalyst have no fee refund. |
| `payout_not_reversed` | Owner-final | Match. The eight articles do not say the opposite. |
| `source_primary` | Meta | The Help Centre is the primary public reference. Not a money rule. Not contradicted by the articles. |

Named Strategy Risk termination drafts were replaced with the soft-reset body on the customer path and on owner REPLY, "send this message", and FOLLOW. An owner note about KYC review passed through without a payout body.

## Postgate null path

In the patched `postClientCommentOnceInner`, after both the candidate and the fallback fail the mandatory postgate codes, the hook is:

```js
if (fbHits.length) {
  console.log('POSTGATE_SUPPRESSED', ...);
  const payoutBody = payoutGuardPublicBody(finalBody, parts, latestClientText);
  if (payoutBody !== finalBody) finalBody = payoutBody;
  else return null;
}
```

If the guard returns the same string, the function returns null and that body is not sent. A second call at line 3029 runs when this branch does not return, including when the guard has just replaced the string. The replacement is not passed through `verdict()` again.

This run did not observe a silent drop.

- `postgate-valid-exact`: prior public note plus the exact English Rise fee body. `POSTGATE_SUPPRESSED` was false. The Rise fee body was posted.
- `postgate-valid-hedge-exact`: exact English hedge on an erase/keep question. `POSTGATE_SUPPRESSED` was false. The hedge was posted.
- Silent-drop count: 0.

The null return is still in the patched function. It drops a body only when postgate has already flagged it and the guard echoes it. The exact locked Rise body and the exact hedge were not flagged in these fixtures, so this set does not show that drop happening.

## Suppression, turns, and early returns

These stayed silent, with the webhook's own skip reason:

- pause at start, and pause during the pre-send check
- aiOff at start, and ticket-ai-off during the pre-send check
- already replied on refetch
- human takeover after the customer part
- teammate handoff on a short thanks
- stale draft after a newer customer part
- refetch unavailable
- identical body already sent
- final boundary after aiOff

No suppression bypass.

`retry-same-event` posted the crypto fee once. The second delivery logged "already replied after user part" and did not post again.

`customer-second-turn` posted the Strategy Risk body on the first question. The second question, the Rise fee, was skipped with "already replied after user part". That is a false hold of the second customer turn by the existing webhook gate. The payout guard did not rewrite it.

`defer-window` stayed silent and did not post the draft that said the reward was reversed and the account terminated. `defer-matured` stayed silent because the fixture's earlier human note tripped human takeover.

The spread question posted the runtime's existing spread template, including a synthetic MT5 test login. That template is outside the payout guard. No payout fact was attached.

## False holds and language

42 false holds. Clear questions received only the hedge, a teammate escalation, or no second-turn answer. Examples: English hard-breach (the draft mentioned soft and hard together, and the guard treats that pair as a conflict), Roman instrument cap, Urdu and Arabic payout timing, English Catalyst stage reset, Urdu reset count / where / previous, Arabic fee refund, Hindi "not reversed", and the source-primary question in Urdu, Roman, and Arabic. Arabic "خمسين" (fifty) was not in the worded-number map, so the 50% cap question was hedged. A mixed Rise draft that also said payouts are reversed was hedged instead of posting the Rise fee. Saturday stop-loss in English was hedged; the Urdu and Arabic versions posted `weekend_trade`, which states the funded reset and forfeiture.

30 non-English failures. Hinglish is usually classified as Roman because Roman markers outrank Hinglish markers, so the Roman body is posted for a Hinglish question. Some Hinglish and Roman questions received the English body. The fact in those replies was generally the right locked fact. `fact-catalyst_rules-hinglish` is both a language miss and a false weekend-hold body.

## What held

Owner-final rules held on the questions that actually named them: Strategy Risk / Risk Rule stayed a soft reset, reset stayed limited to breakeven or profit, previous-cycle profit stayed unpaid, and the English completed-payout line stayed "not reversed." The other 21 English bodies match the current articles except `weekend_hold`, with the omissions noted in the table. Pause, aiOff, already-replied, human teammate, and the pre-send boundary checks did not let a comment through.

## Verdict

BLOCKED. The locked `weekend_hold` sentence is false in every shipped language, and this webhook posted it. The same run posted a "does not close" answer for a 50% instrument breach, posted funded-reset and crypto-withdrawal facts for password and purchase questions, posted false Urdu and Arabic reversal and timing drafts unchanged, and missed the required hedge on three erase/keep paraphrases. Suppression bypasses and silent drops of a valid body were not observed.
