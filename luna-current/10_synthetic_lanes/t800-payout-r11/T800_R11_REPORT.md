# T800 payout R11 — frozen candidate

Status: **frozen candidate, not approved**. This agent wrote the candidate. A different agent has to review it. This report does not approve the candidate and does not authorize a release, a deploy, or a merge.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

The independent review files for R10 were not read. The change below follows the review summary: token patching was converging too slowly (critical counts 46, 34, 34, 22), so R11 replaces it with an approved fact table.

## Source authority

The current official Help Centre at `faq.fundedelite.com` is the primary public-policy reference. The repo FAQ file is secondary. Owner-final exceptions still override both where they differ:

- A funded Strategy Risk breach is a soft breach with a reset, never termination or closure. That owner rule overrides the article 17437285 wording that breaking the instrument rule can lead to closure.
- A funded reset is allowed only at breakeven or in profit, never in drawdown or loss.
- Previous-cycle profit is not payable after a reset.
- Completed payouts are not reversed.

A sentence that says the FAQ overrides or outranks the Help Centre is hedged. A sentence that says the Help Centre is primary and the repo FAQ is secondary is allowed.

## Architecture

Each approved fact is one row: subject, predicate, value, and the published numbers, sourced to `owner_final` or a live article id. After normalization (accents and the other-language stems folded into the same tokens), a sentence in a payout, reset, breach, weekend, Catalyst, fee, or percent topic is parsed into claim tuples. The sentence is posted only when every tuple matches a row. Numbers are value-exact. Anything else becomes the visible hedge `I can't confirm that. Our team will confirm.` There is no silent drop. A pure question is not a claim. A greeting between a question and the answer does not consume the question topic.

Rows that are not in the table stay denied. Catalyst erase-versus-keep and "profit kept" or "profit preserved" have no row, so they hedge even when the same sentence also states a published share or price.

## Approved rows

- **17437285.** No more than 50% of the daily loss limit on one instrument. Table rows 3% → 1.5%, 4% → 2%, 5% → 2.5%, the derived 1.5 / 2 / 2.5 figures, and the published $100,000 / $2,500 / $1,500 / $1,000 example. "Can lead to closure" is not a row.
- **17437306.** Weekend holding is allowed, including moving stop loss and take profit. Funded weekend trading resets the account and forfeits the current cycle's profit. It never terminates. Trading on Saturday or Sunday without the add-on is not allowed; with the add-on it is allowed.
- **17437215.** Catalyst daily loss 3%, profit target 8% (options 5 / 8 / 10), consistency 30%, published stage sizes, shares, minimums, and reset prices. "Closes your account and opens a fresh one at double the size" is the published ladder reopen. Erase, keep, and preserved stay hedged.
- **17437354.** Rise fee $40 for withdrawals of $500 or more. Crypto fee 3% on any amount, and crypto is the only method below $500. Published arrivals are rows and nothing else is: $4,800 Rise arrives as $4,760, and $400 crypto arrives as $388. A different pair is hedged, including a pair that merely differs by $40 or by 3%.
- **17437410.** Reset only at breakeven or in profit. First reset 40% of the original price, minimum $10. The second doubles the first and the third doubles the second, up to 3 resets. Published example $569 → $228, then $456, then $912. Reset from Trading Objectives on the dashboard. "No reset options on this account" and the button next to Credentials are rows.
- **17437398.** A soft-breach payout is still processed at 30% and the account is not closed. If it happens again, the account can be reset and its profit forfeited.
- **17437366.** Fee refund on the third payout for 1-Step, 2-Step, LITE 1-Step, and LITE 2-Step when the evaluation was passed on the first attempt, the account was never reset, and those cycles had no soft breach. Instant, Instant Elite, Flash, and Catalyst have no fee refund.

## Proposed diff

`index.js.public-sends.diff` does not edit `index.js`. The postgate suppression branch is a braced `if / else`. The guard result is assigned on the suppressed path, and that path no longer returns null, so a body the guard does not replace is not dropped. The fallback path still assigns the clean fallback. Early returns inside `postClientCommentOnceInner` (pre-send, identical body, repeated-reply hold, repeated-reply retry failure, post-rephrase, and final boundary) call `payoutGuardInsteadOfDrop`: a replaced body is posted as the hedge, and an unchanged body keeps the original null return. The inner public comment, the owner REPLY, the authorized-note REPLY, and the missed-escalation greet and personal-question arms still run the guard. The diff does not require the absent presend directory.

## Tests

`node luna-current/10_synthetic_lanes/t800-payout-r11/payoutClaimGuard.test.js`

15 passed, 0 failed. `node --check` passed on both JS files. `git apply --check` passed on the proposed diff.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/10_synthetic_lanes/t800-payout-r11/payoutClaimGuard.js` | `b8cfc7e3af1aeaa8ddc2487f356f814b50052c38709d31becee6f4d9e9981bf4` |
| `luna-current/10_synthetic_lanes/t800-payout-r11/payoutClaimGuard.test.js` | `690a5b0f54ff368d50bc0031e198311e5a007c05e0e698564d558ab312410fe5` |
| `luna-current/10_synthetic_lanes/t800-payout-r11/index.js.public-sends.diff` | `ddf47791b7c57f12e354e2b14050a49f4ac63fc6b2556c545dd13c20e61496ca` |

`SHA256SUMS.txt` is written after this report and includes this report's digest. This report does not approve the candidate.

## Blockers

- Independent review has not approved R11. This agent is the author and must not approve it.
- The hook is a proposed diff. It is not applied to `index.js`.
- Catalyst erase-versus-keep, and any "profit kept" or "profit preserved" wording, stays hedged.
- No live webhook or customer conversation was used.
