# T800 payout R10 — frozen candidate

Status: **frozen candidate, not approved**. This agent wrote the candidate. A different agent has to review it. This report does not approve the candidate and does not authorize a release, a deploy, or a merge.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

The independent review files for R9 were not read. The nine classes below are the ones named in the review summary.

## Source authority

The current official Help Centre at `faq.fundedelite.com` is the primary public-policy reference. The repo FAQ file is secondary. Owner-final exceptions still override both where they differ:

- A funded Strategy Risk breach is a soft breach with a reset, never termination.
- A funded reset is allowed only at breakeven or in profit, never in drawdown.
- Previous-cycle profit is not payable after a reset.
- Completed payouts are not reversed.

A sentence that says the FAQ overrides or outranks the Help Centre is hedged. A sentence that says the Help Centre is primary and the repo FAQ is secondary is allowed.

## What changed in R10

1. Weekend trading. Article 17437306: on a funded account, weekend trading resets the account and forfeits the current cycle's profit. It never terminates. Weekend holding stays allowed and is a separate outcome. "Weekend trading terminates the account" is hedged.
2. Clause judging. A supported clause does not approve a sentence that also asserts closure or termination. Clauses split on semicolon, comma, "but", and "and". "Or" is not a split, so "breakeven or in profit" and "$500 or more" stay intact.
3. Fees. Rise is approved only as the published $40 fee and the $500-or-more minimum. Crypto is approved only as any amount, the only method below $500, or a 3% fee. A pair of amounts is not treated as a fee, including "$4,800 arrives as $4,760" and "$400 arrives as $388".
4. Percents. A trailing `%` matches, including "A soft-breach payout is 30%." A hyphenated soft-breach is the same class as "soft breach". A 20% soft-breach payout is hedged.
5. Hedges and confirmation. A hedge sentence that still carries a completion or a take-back is replaced with the clean hedge, so the claim is not posted. "I confirm the opposite", "the contrary", or "otherwise" is not a confirmation.
6. Negation scope. Hindi नहीं, Urdu نہیں, Arabic لا, and Russian не deny a claim only in the same clause as that claim's predicate. A stray particle on the fee does not clear a payable-profit sentence or a real attestation.
7. Language. Account-ending stems cover French (`ferme` / `clôture` plus `compte`), Spanish (`cierra` / `cierre` plus `cuenta`), Arabic (`يغلق` / `إغلاق` plus `حساب`), Urdu (`بند ہو جا`), Hinglish (`band ho jayega`), and Cyrillic (`закр` / `прекращ` plus the account word). A pure question that names Strategy Risk, soft breach, weekend trading or holding, reset, previous profit, a payout method, or Catalyst carries that topic into the next declarative sentence only.
8. False holds removed. Article 17437285 allows "50% of the daily loss limit", including "may not risk more than", and the table rows 3% → 1.5%, 4% → 2%, and 5% → 2.5% when the sentence is about daily loss or one-instrument risk. A wrong derived percent is still hedged, and so is closure in the same sentence. "Can be reset in profit" and "cannot reset in a loss" match the owner rule. Later reset fees that double, with no other amount, match article 17437410. Published Catalyst stage share and reset-price facts match article 17437215. Erase-versus-keep stays hedged, and it wins when the same sentence also states a share or a price.
9. The proposed diff guards the postgate suppression branch. If the guard replaces that body, the hedge is posted instead of the silent `return null`. The missed-escalation greet and personal-question arms are wrapped before `postClientCommentOnce`. The owner REPLY, the authorized-note REPLY, and the inner public comment path stay wrapped. The diff does not require `statePresend`.

## Tests

`node luna-current/10_synthetic_lanes/t800-payout-r10/payoutClaimGuard.test.js`

19 passed, 0 failed. `node --check` passed on both JS files. `git apply --check` passed on the proposed diff.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/10_synthetic_lanes/t800-payout-r10/payoutClaimGuard.js` | `69bd169c124b294aa80cc182057aea9bc394921c36330aa5ffb8e8fbdd6ceea0` |
| `luna-current/10_synthetic_lanes/t800-payout-r10/payoutClaimGuard.test.js` | `9489c32c77fc61244cbdb94ab4b0080b6af01b2e9b3e380f2a8d39994ef3888e` |
| `luna-current/10_synthetic_lanes/t800-payout-r10/index.js.public-sends.diff` | `db2c3dccccf15c0ddf53be2f047ffa158044f725edd9d71da6d8b70b389a4603` |

`SHA256SUMS.txt` is written after this report and includes this report's digest. This report does not approve the candidate.

## Blockers

- Independent review has not approved R10. This agent is the author and must not approve it.
- The hook is a proposed diff. It is not applied to `index.js`.
- Catalyst erase-versus-keep stays hedged.
- No live webhook or customer conversation was used.
