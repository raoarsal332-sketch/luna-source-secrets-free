# T800 payout R12 — frozen candidate

Status: **frozen candidate, not approved**. This agent wrote the candidate. A different agent has to review it. This report does not approve the candidate and does not authorize a release, a deploy, or a merge.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

The independent review files for R11 were not read. The change below follows the review summary: claim-tuple parsing cannot cover worded numbers, paraphrases, and other languages (319 cases, 68 unsupported claims posted, 11 false holds, 4 regressions, 39 non-English failures). R12 replaces that architecture.

## Source authority

Approved bodies come only from owner-final rules and the current Help Centre articles `17437410`, `17437398`, `17437388`, `17437285`, `17437354`, `17437215`, `17437306`, and `17437366`. The Help Centre is the primary public-policy reference. The repo FAQ does not override it. Owner-final exceptions still override both where they differ:

- A funded Strategy Risk or Risk Rule breach is a soft breach with a reset. It does not terminate or close the account. That owner rule overrides article 17437285 ("Breaking this rule can lead to closure") and the 17437388 cell that lists risking more than 50% of the daily loss limit on one instrument as a hard breach. The approved hard-breach body omits that cell. The instrument cap itself (50%, and the table 3% → 1.5%, 4% → 2%, 5% → 2.5%) stays in the instrument body, with no closure outcome.
- Touching the daily loss limit or the max loss limit is a hard breach and ends the account (17437388). This stays a separate body from Strategy Risk.
- A funded reset is allowed only at breakeven or in profit, never in a loss or in drawdown (17437410).
- Profit from the previous cycle is not paid after a reset (17437410).
- A completed payout is not reversed (owner-final).
- Article 17437410 states "Up to 3 resets per funded account", so the reset-count body is included: "A funded account can be reset up to 3 times."
- Catalyst stage-reset erase, wipe, clean slate, profit kept, and profit preserved are not in 17437215. Those intents are always the hedge. The published "one reset can be bought after the first stage" body, and the published "closes the account and opens a fresh one at double the size" body, stay approved.
- Article 17437306 does not say weekend trading never terminates. The approved weekend-trade body states the published outcomes: evaluation may be reset with a free retry or reinstated; a funded account is reset and the current cycle's profit is forfeited.

## Architecture

In a payout, reset, breach, weekend, Catalyst, fee, or percent topic, the model does not author the public factual text. There is no parsing of model claims and no claim tuples.

Topic and intent are classified in a language-independent way. Detection may use multilingual keyword stems (after accent folding) and an optional model hint. Any uncertainty fails closed: client and draft id sets that disagree, a model hint that disagrees with the keywords, Strategy Risk and daily-loss hard breach in the same turn, or a Catalyst erase/keep memory, all become the visible hedge.

When the turn is in topic and the ids are confident, the public body is composed only from pre-written approved answer bodies, one per fact row, in table order. Each body is hash-locked in `approved.lock.json`. A core language (English, Urdu script, Roman Urdu, Hindi, Arabic, Hinglish) with a matching hash uses that translation. Any other language, or a missing translation, uses the English body plus the localized hedge. A model-written sentence in these topics is dropped. If the topic is recognized and no approved row is selected, the whole reply is the localized hedge.

Out-of-topic text, including a greeting and the trailing-drawdown clock, passes through unchanged. The guard does not silently drop an in-topic answer that would otherwise have been posted. `STATUS.approved` and `result.approved` are always false. A throw returns the English hedge with `send: true` and `silent: false`.

English hedge: `I can't confirm that. Our team will confirm.`

## Approved bodies

Twenty-three rows. Hashes cover every language body and every hedge.

| Id | Source | English body (short) |
|---|---|---|
| `strategy_risk` | owner_final | Soft breach with a reset. Does not terminate or close the account. |
| `daily_loss_hard` | 17437388 | Touching the daily or max loss limit is a hard breach and ends the account. |
| `hard_breach` | 17437388 | Hard-breach list and evaluation free-retry rule. The 50% instrument cell is omitted. |
| `soft_kinds` | 17437388 | What counts as a soft breach. The account stays open. |
| `instrument_cap` | 17437285 | 50% of the daily loss limit on one instrument, with the published table and example. |
| `soft_breach_payout` | 17437398 | Current payout at 30%, cycle restarts, repeat can reset and forfeit profit. |
| `weekend_hold` | 17437306 | Hold, move SL/TP, and close (including SL/TP hit) are allowed. |
| `weekend_trade` | 17437306 | Saturday/Sunday trading needs the add-on. Published evaluation and funded outcomes. |
| `rise_fee` | 17437354 | Rise for $500+, fee $40. $4,800 arrives as $4,760. |
| `crypto_fee` | 17437354 | Crypto any amount, only method below $500, fee 3%. $400 arrives as $388. |
| `payout_timing` | 17437354 | 5 business days, bank 1–3 days, crypto hours, review within 30 days. |
| `catalyst_rules` | 17437215 | Target, daily loss, max loss, profitable days, consistency, weekend, payout cadence. |
| `catalyst_ladder` | 17437215 | Stage sizes, shares, minimums, and reset prices through stage 7. |
| `catalyst_reopen` | 17437215 | Approved payout closes the account and opens a fresh one at double the size. |
| `catalyst_stage_reset` | 17437215 | One bought reset after the first stage. First stage has no reset. |
| `reset_eligibility` | 17437410 | Only at breakeven or in profit. |
| `reset_count` | 17437410 | Up to 3 times. |
| `reset_price` | 17437410 | 40% then double, minimum $10. Example $228, $456, $912. |
| `reset_where` | 17437410 | Trading Objectives, Reset options next to Credentials. |
| `reset_previous` | 17437410 | Fresh funded account. Previous-cycle profit is not paid. |
| `fee_refund` | 17437366 | Third payout on the listed programs, with the published conditions. |
| `payout_not_reversed` | owner_final | A completed payout is not reversed. |
| `source_primary` | owner_final | Help Centre is primary. The repo FAQ does not override it. |

A per-client completion or status sentence ("was my payout sent", "your reward was paid") has no row, so it is the hedge. A question that says the FAQ overrides the Help Centre is the hedge.

## Ordering

`index.js.public-sends.diff` does not edit `index.js`. The helper `payoutGuardPublicBody` does not send. It runs only after the checks that already suppress a send.

- Pause, aiOff, already-replied, human-teammate, and Fin ownership skips in the customer path return before `postClientCommentOnce`. The helper is not called on those returns, and the diff adds no `postReply`.
- Inside `postClientCommentOnceInner`, the pre-send, identical-body, repeated-reply, post-rephrase, and final-boundary returns stay `return null`. The guard runs after the final-boundary check, immediately before the existing public comment post, and again on the postgate path.
- Postgate is a braced `if / else`. When both the candidate and the fallback fail validation, the guard runs. If it replaces the body, that body continues into the final-boundary check. If it does not replace the body, the path still returns null.
- Customer turns, identity retries, greetings, personal questions, and model retries all post through `postClientCommentOnce`, so they hit the same guard. `pollDeferredRelatedReplies` does not post; it clears the flag, and the later customer send goes through `postClientCommentOnce`.
- Owner REPLY, including FOLLOW (which executes an owner REPLY), and the authorized-note REPLY (`send this message`) replace the body with the guard output. Owner-dictated text in these topics is guarded. Those paths do not gain a new pause, already-replied, or welcome-intro suppression. Auth notes stay allowed while paused, which is the existing behavior.

## Tests

`node luna-current/10_synthetic_lanes/t800-payout-r12/payoutClaimGuard.test.js`

10 passed, 0 failed. `node --check` passed on both JS files. `git apply --check` passed on the proposed diff. `locksOk()` is true.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/10_synthetic_lanes/t800-payout-r12/payoutClaimGuard.js` | `2936f87ee4f9ce35c0efd9587c5e6f2fbbf667eb27e1d2b8bbe79967baa099a9` |
| `luna-current/10_synthetic_lanes/t800-payout-r12/approved.lock.json` | `52a4eca9c8d306e48653a05aad26e83b2f4644dc15a48137190be1775b241aed` |
| `luna-current/10_synthetic_lanes/t800-payout-r12/payoutClaimGuard.test.js` | `c7662b1848f63f8b6e4ff9c62a60171b0f1d8a853d4a8d4dd114ad6f9a54a8f8` |
| `luna-current/10_synthetic_lanes/t800-payout-r12/index.js.public-sends.diff` | `440d7028b1493f8fbd5c660faf393016877cae7a9ad5192d40d5fe9d558f8466` |

`SHA256SUMS.txt` is written after this report and includes this report's digest. This report does not approve the candidate.

## Blockers

- Independent review has not approved R12. This agent is the author and must not approve it.
- The hook is a proposed diff. It is not applied to `index.js`.
- Catalyst erase-versus-keep, and any "profit kept" or "profit preserved" wording, stays hedged.
- No live webhook or customer conversation was used.
