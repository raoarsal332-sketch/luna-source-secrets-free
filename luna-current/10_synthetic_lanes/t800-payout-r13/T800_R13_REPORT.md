# T800 payout R13 — frozen candidate

Status: **frozen candidate, not approved**. This agent wrote the candidate. A different agent has to review it. This report does not approve the candidate and does not authorize a release, a deploy, or a merge.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

The independent review files for R12 were not read. The change follows the review summary: 259 cases, 5 unsupported claims posted, 17 wrong approved bodies, 0 suppression bypasses, 0 silent drops, 42 false holds, 6 over-capture, 5 regressions, 30 non-English failures.

## What changed

The public body in a payout, reset, breach, weekend, Catalyst, fee, or percent topic is still composed only from hash-locked approved bodies, or the localized hedge. There is no claim parsing. A body is posted only when the customer's question intent matches that body. Keyword overlap is not enough. Uncertain intent is the hedge.

- Password reset is out of topic. Paying with crypto for a purchase is out of topic. An MT5 install question is out of topic.
- A Catalyst rules question, including whether weekend trading is allowed on Catalyst, returns `catalyst_rules` only. It does not attach the weekend add-on bodies.
- The customer's confident intent wins over extra claims in the model draft, so a Rise fee question stays the Rise body when the draft also mentions an hour and a reset count.
- Topic detection covers Arabic, Urdu, Hindi, and Cyrillic stems. A payout-topic draft is not returned unchanged. Urdu "completed payout was returned" and Arabic "arrives within one hour" become the hedge.
- Catalyst erase, wipe, clean slate, profit kept, and profit preserved, in every paraphrase tried here, is the hedge. Ladder and rules text are not attached.
- The guard still runs only after ownership, already-replied, human-teammate, pause, and aiOff checks. It does not post when those checks would have suppressed the send.

## Owner exception

Recorded in `approved.lock.json` under `owner_exceptions`:

A Strategy Risk or Risk Rule breach on a funded account is a soft breach with a reset. It does not terminate or close the account. This owner-final exception overrides 17437285 ("Breaking this rule can lead to closure of the funded account and loss of its profit.") and the 17437388 cell that lists risking more than 50% of the daily loss limit on one instrument as a hard breach. That cell is omitted from `hard_breach`.

Touching the daily loss limit or the max loss limit remains a hard breach and ends the account (17437388). `daily_loss_hard_unchanged` is `17437388`.

## Weekend holding

Re-read from the live 17437306 table on this pass:

- Hold an open position: without the add-on Allowed, with the add-on Allowed. The intro says "You can always hold positions from Friday to Monday."
- Move stop loss or take profit: Allowed in both columns.
- Open a new position: Violation without the add-on, Allowed with it.
- Close a position, including a stop loss or take profit being hit: Violation without the add-on, Allowed with it.

`weekend_hold` states holding and moving stops as allowed with or without the add-on, and states closing as a violation without the add-on and allowed only with it. The six translations use that same split. The body does not say "cannot hold any position from Friday to Monday."

## Selection

A funded-reset body is used for a funded-account reset question. "How many times" is only the count. "Can I reset while losing?" is only eligibility. A bare reset with no intent is the hedge. Catalyst stage-reset purchase is the breach-after-first-stage body from 17437215, not the funded reset product.

## Tests

`node luna-current/10_synthetic_lanes/t800-payout-r13/payoutClaimGuard.test.js`

14 passed, 0 failed. `node --check` passed on both JS files. `git apply --check` passed on the proposed diff. `locksOk()` is true.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/10_synthetic_lanes/t800-payout-r13/payoutClaimGuard.js` | `f581dbc7c46e06619732f600463a6ad2d090951d7210521f1c59cafe7412df07` |
| `luna-current/10_synthetic_lanes/t800-payout-r13/approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `luna-current/10_synthetic_lanes/t800-payout-r13/payoutClaimGuard.test.js` | `1b53d6a99e1df192b103fefc8696961682070cd472c6c6ee4a6f756a8df0baff` |
| `luna-current/10_synthetic_lanes/t800-payout-r13/index.js.public-sends.diff` | `522c859e3054ee4e28fadb77cabf01caa16c24226a703818fa0571a6e54d0e0c` |

`SHA256SUMS.txt` is written after this report and includes this report's digest. This report does not approve the candidate.

## Per-sentence citations

Each English sentence below is a substring of the locked body. The same meaning is locked in Urdu script, Roman Urdu, Hindi, Arabic, and Hinglish. The locator is the source sentence or table cell used for that line.

| Body | Source | Sentence | Citation |
|---|---|---|---|
| `strategy_risk` | owner_final | A Strategy Risk or Risk Rule breach on a funded account is a soft breach with a reset. | owner-final exception. Overrides 17437285 "Breaking this rule can lead to closure of the funded account and loss of its profit." and the 17437388 hard-breach cell "Risking more than 50% of your daily loss limit on one instrument in a day (funded): account closed, you can reset it." |
| `strategy_risk` | owner_final | It does not terminate or close the account. | owner-final exception. The breach does not terminate or close the account. Daily and max loss limits are not this rule. |
| `daily_loss_hard` | 17437388 | Touching the daily loss limit or the max loss limit is a hard breach. | 17437388 hard-breach column: "Touching the daily or max loss limit." |
| `daily_loss_hard` | 17437388 | A hard breach ends the account. | 17437388: "A hard breach ends the account." |
| `hard_breach` | 17437388 | A hard breach ends the account. | 17437388: "A hard breach ends the account." |
| `hard_breach` | 17437388 | Hard breaches include touching the daily or max loss limit, fraud, KYC fraud or chargebacks, group trading or IP sharing, account management or passing services, scalp profit above the scalp limit in evaluation, and a repeated soft breach after a warning. | 17437388 hard-breach column, excluding the 50% instrument cell because the owner-final exception overrides that cell. |
| `hard_breach` | 17437388 | In evaluation, a hard breach on 1-Step or 2-Step with Free Retry triggers the free retry automatically, unless the cause is fraud. | 17437388: "In evaluation, a hard breach on 1-Step or 2-Step + Free Retry triggers your free retry automatically, unless the cause is fraud." |
| `soft_kinds` | 17437388 | A soft breach keeps the account open and you must correct your trading. | 17437388: "A soft breach keeps the account open but has consequences and needs you to correct your trading." |
| `soft_kinds` | 17437388 | It includes an isolated trade under the minimum holding time, scalp profit under the limit, an IP flag with an honest explanation, a hedging flag with no link to another trader, and a first case of gambling-style trading. | 17437388 soft-breach column: isolated trades under the minimum holding time and scalp profit under the limit; IP flags with an honest explanation; hedging flags with no link to another trader; a first case of gambling-style trading. |
| `instrument_cap` | 17437285 | On a funded account you may not risk more than 50% of your daily loss limit on the same instrument in one trading day. | 17437285: "On a funded account you may not risk more than 50% of your daily loss limit on the same instrument in one trading day, counting all trades on that instrument in both directions." The closure sentence in that article is not used. |
| `instrument_cap` | 17437285 | A 3% daily loss limit means 1.5% on that instrument, 4% means 2%, and 5% means 2.5%. | 17437285 table: 3% → 1.5%; 4% (LITE 2-Step) → 2%; 5% (2-Step) → 2.5%. |
| `instrument_cap` | 17437285 | Example: a 2-Step $100,000 account has a $2,500 limit. | 17437285 example: 2-Step $100,000 funded, limit $2,500 per instrument. |
| `instrument_cap` | 17437285 | Trades of $1,000 and $1,500 on the same instrument reach that limit. | 17437285 example: EURUSD $1,000 at risk and another EURUSD trade $1,500 at risk reach $2,500. |
| `soft_breach_payout` | 17437398 | After a soft breach on a funded account, the account is not closed. | 17437398: "The account is not closed and you are notified by email." |
| `soft_breach_payout` | 17437398 | The current payout is still processed at a 30% reward share, and the payout cycle restarts from payout 1, which also restarts the fee-refund count. | 17437398: current payout still processed at a 30% reward share, and the payout cycle restarts from payout 1, which also restarts the fee-refund count. |
| `soft_breach_payout` | 17437398 | If it happens again after the warning, the account can be reset and its profit forfeited. | 17437398: "If it happens again after the warning, the account can be reset and its profit forfeited." |
| `soft_breach_payout` | 17437398 | In evaluation, the team may reset the account using a free retry if you still have one. | 17437398: "In evaluation, the team may reset your account, using your free retry if you still have it." |
| `weekend_hold` | 17437306 | You can always hold positions from Friday to Monday. | 17437306 intro: "You can always hold positions from Friday to Monday." |
| `weekend_hold` | 17437306 | Holding an open position over the weekend is allowed without the Weekend Trading add-on and allowed with the add-on. | 17437306 table "Hold an open position": Without add-on Allowed; With add-on Allowed. |
| `weekend_hold` | 17437306 | Moving your stop loss or take profit over the weekend is allowed without the Weekend Trading add-on and allowed with the add-on. | 17437306 table "Move your stop loss or take profit": Without add-on Allowed; With add-on Allowed. |
| `weekend_hold` | 17437306 | Closing a position over the weekend, including a stop loss or take profit being hit, is a violation without the Weekend Trading add-on and is allowed only with the add-on. | 17437306 table "Close a position, including a stop loss or take profit being hit": Without add-on Violation; With add-on Allowed. |
| `weekend_trade` | 17437306 | Trading on Saturday or Sunday needs the Weekend Trading add-on. | 17437306 intro: "Trading on Saturday and Sunday needs the Weekend Trading add-on." |
| `weekend_trade` | 17437306 | Opening a new position without the add-on is a violation. | 17437306 table "Open a new position": Without add-on Violation. |
| `weekend_trade` | 17437306 | With the add-on it is allowed. | 17437306 table "Open a new position": With add-on Allowed. |
| `weekend_trade` | 17437306 | A fill on Saturday or Sunday counts as weekend trading. | 17437306 callout: "a fill on Saturday or Sunday counts as weekend trading." |
| `weekend_trade` | 17437306 | In evaluation the account may be reset with a free retry or reinstated. | 17437306 consequence: "in evaluation the account may be reset with your free retry or reinstated." |
| `weekend_trade` | 17437306 | On a funded account it is reset and the current cycle's profit is forfeited. | 17437306 consequence: "On a funded account it is reset and the current cycle's profit is forfeited." |
| `rise_fee` | 17437354 | Rise is available for withdrawals of $500 or more. | 17437354 table: Rise available for withdrawals of $500 or more. |
| `rise_fee` | 17437354 | The fee is $40 per withdrawal. | 17437354 table: Rise fee $40 per withdrawal. |
| `rise_fee` | 17437354 | A $4,800 reward through Rise arrives as $4,760. | 17437354 example: "a $4,800 reward through Rise arrives as $4,760." |
| `crypto_fee` | 17437354 | Crypto (USDC) is available for any amount and is the only method below $500. | 17437354 table: Crypto (USDC) any amount, the only method below $500. |
| `crypto_fee` | 17437354 | The fee is 3% of the amount. | 17437354 table: fee 3% of the amount. |
| `crypto_fee` | 17437354 | A $400 crypto reward arrives as $388. | 17437354 example: "A $400 reward in crypto arrives as $388." |
| `payout_timing` | 17437354 | Approved rewards are paid within 5 business days of approval. | 17437354: "approved rewards are paid within 5 business days of approval." |
| `payout_timing` | 17437354 | Bank transfers then take 1 to 3 days. | 17437354: "Bank transfers then take 1–3 days." |
| `payout_timing` | 17437354 | Crypto usually arrives within hours. | 17437354: "crypto usually arrives within hours." |
| `payout_timing` | 17437354 | If a review is needed first, it is finished within 30 days. | 17437354: "If we need to review your account first, we tell you what we are checking and finish within 30 days." |
| `payout_timing` | 17437354 | In some cases the reward is paid back to the original payment method, and you are told before it is sent. | 17437354: in some cases the reward is paid back to the original payment method, and you are told before it is sent. |
| `catalyst_rules` | 17437215 | On every Catalyst stage the profit target is 8% of the stage balance, with options of 5%, 8%, and 10%, and there is no time limit. | 17437215: "Profit target 8% of the stage balance (options 5%, 8%, 10%), no time limit." |
| `catalyst_rules` | 17437215 | The daily loss limit is 3%, based on the higher of yesterday's closing balance or equity. | 17437215: "Daily loss 3%, based on the higher of yesterday's closing balance or equity." |
| `catalyst_rules` | 17437215 | Max loss is trailing equity: 6% on the $25,000 stage and 5% from $50,000 up. | 17437215: "Max loss trailing equity: 6% on the $25K stage, 5% from $50K up." |
| `catalyst_rules` | 17437215 | It rises with equity and never moves down. | 17437215: "It rises with your equity and never moves down." |
| `catalyst_rules` | 17437215 | You need 5 profitable days, each with at least one trade and the stage's minimum P&L. | 17437215: "5 profitable days, each with at least one trade and the stage's minimum P&L." |
| `catalyst_rules` | 17437215 | The consistency rule is 30% and can be removed at checkout. | 17437215: "30% consistency rule (can be removed at checkout)." |
| `catalyst_rules` | 17437215 | Weekend trading is not allowed. | 17437215: "Weekend trading is not allowed." |
| `catalyst_rules` | 17437215 | The first payout is after 14 days, then every 7, 14, or 21 days as chosen at checkout. | 17437215: "First payout after 14 days; after that, every 7, 14 or 21 days as chosen at checkout." |
| `catalyst_ladder` | 17437215 | Catalyst doubles after every approved payout, up to a $1,000,000 account and a 95% reward share. | 17437215: doubles after every approved payout, up to $1,000,000 and a 95% reward share. |
| `catalyst_ladder` | 17437215 | Stage 1 is $25,000, 80% share, $150 minimum P&L per profitable day, and no reset. | 17437215 ladder stage 1: $25,000, 80%, $150, No reset. |
| `catalyst_ladder` | 17437215 | Stage 2 is $50,000, 85%, $250, reset $890. | 17437215 ladder stage 2: $50,000, 85%, $250, $890. |
| `catalyst_ladder` | 17437215 | Stage 3 is $100,000, 90%, $350, reset $1,290. | 17437215 ladder stage 3: $100,000, 90%, $350, $1,290. |
| `catalyst_ladder` | 17437215 | Stage 4 is $200,000, 95%, $450, reset $1,790. | 17437215 ladder stage 4: $200,000, 95%, $450, $1,790. |
| `catalyst_ladder` | 17437215 | Stage 5 is $400,000, 95%, $650, reset $2,490. | 17437215 ladder stage 5: $400,000, 95%, $650, $2,490. |
| `catalyst_ladder` | 17437215 | Stage 6 is $800,000, 95%, $850, reset $3,390. | 17437215 ladder stage 6: $800,000, 95%, $850, $3,390. |
| `catalyst_ladder` | 17437215 | Stage 7 is $1,000,000, 95%, $1,000, reset $4,790. | 17437215 ladder stage 7: $1,000,000, 95%, $1,000, $4,790. |
| `catalyst_ladder` | 17437215 | Starting from $50,000 begins at stage 2 with an 80% share, rising 5 points per approved payout up to 95%. | 17437215: "Starting from $50,000, you begin at stage 2 with an 80% share, rising 5 points per approved payout up to 95%." |
| `catalyst_reopen` | 17437215 | Each approved Catalyst payout closes the account and opens a fresh one at double the size, with new limits. | 17437215: "each approved payout closes your account and opens a fresh one at double the size, with new limits." |
| `catalyst_reopen` | 17437215 | This is automatic, or done by the team within 24 hours. | 17437215: "This is automatic, or done by our team within 24 hours." |
| `catalyst_stage_reset` | 17437215 | If you breach after your first Catalyst stage, you can buy one reset at that stage instead of starting over. | 17437215: "Breach after your first stage? You can buy one reset at that stage instead of starting over." |
| `catalyst_stage_reset` | 17437215 | Your first stage, the $25,000 or $50,000 account you bought, has no reset. | 17437215: "Your first stage (the $25K or $50K you bought) has no reset." |
| `reset_eligibility` | 17437410 | A funded reset is allowed only while the account is at breakeven or in profit. | 17437410: "only while the account is at breakeven or in profit." |
| `reset_eligibility` | owner_final | It is not allowed in a loss or in drawdown. | owner-final: a funded reset is never allowed in drawdown or loss. 17437410 states the same limit as breakeven or profit only. |
| `reset_count` | 17437410 | A funded account can be reset up to 3 times. | 17437410: "Up to 3 resets per funded account." |
| `reset_price` | 17437410 | The first funded reset is 40% of the original challenge price before discounts, including add-ons, with a minimum of $10. | 17437410: "1st reset: 40% of the original challenge price (before discounts, including add-ons), minimum $10." |
| `reset_price` | 17437410 | The second reset doubles the first. | 17437410: "2nd reset: double the 1st." |
| `reset_price` | 17437410 | The third reset doubles the second. | 17437410: "3rd reset: double the 2nd." |
| `reset_price` | 17437410 | Example: a 1-Step $100,000 account bought at $569 resets for $228, then $456, then $912. | 17437410 example: 1-Step $100,000 bought at $569 with no add-ons. Resets cost $228, then $456, then $912. |
| `reset_where` | 17437410 | You can reset a funded account from Trading Objectives on the dashboard. | 17437410: reset from Trading Objectives on the dashboard. |
| `reset_where` | 17437410 | The Reset options button sits next to Credentials. | 17437410: "The Reset options button sits next to Credentials on the dashboard." |
| `reset_where` | 17437410 | It shows the next reset price, or it shows No reset options on this account. | 17437410: it shows the price of the next reset, or "No reset options on this account." |
| `reset_previous` | 17437410 | A reset gives a fresh funded account. | 17437410: "A reset gives you a fresh funded account." |
| `reset_previous` | 17437410 | Profit from the previous cycle is not paid. | 17437410: "profit from the previous cycle is not paid." |
| `fee_refund` | 17437366 | On 1-Step, 2-Step, LITE 1-Step, and LITE 2-Step, the challenge fee is refunded with the third payout if you passed the evaluation on the first attempt with no Free Retry, never reset the account, and had no soft breach in those three payout cycles. | 17437366: third payout on 1-Step, 2-Step, LITE 1-Step, and LITE 2-Step if the evaluation was passed on the first attempt with no Free Retry, the account was never reset, and those cycles had no soft breach. |
| `fee_refund` | 17437366 | A soft breach restarts the count, so three more clean payouts are needed. | 17437366: "A soft breach restarts the count: you will need three more clean payouts." |
| `fee_refund` | 17437366 | Instant, Instant Elite, Flash Activation, and Catalyst have no fee refund. | 17437366: "Instant, Instant Elite, Flash Activation and Catalyst have no fee refund." |
| `payout_not_reversed` | owner_final | A completed payout is not reversed. | owner-final: a completed payout is not reversed. |
| `source_primary` | owner_final | The Help Centre is the primary public policy reference. | owner-final: the Help Centre is the primary public policy reference. |
| `source_primary` | owner_final | The repo FAQ does not override it. | owner-final: the repo FAQ does not override the Help Centre. |

## Blockers

- Independent review has not approved R13. This agent is the author and must not approve it.
- The hook is a proposed diff. It is not applied to `index.js`.
- Catalyst erase-versus-keep stays hedged.
- No live webhook or customer conversation was used.
