# T800 payout R9 — frozen candidate

Status: **frozen candidate, not approved**. This agent wrote the candidate. A different agent has to review it. This report does not approve the candidate and does not authorize a release, a deploy, or a merge.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

This freeze includes the owner update after the first R9 candidate. The independent review files were not used as the source of the rules below.

## Source authority

The current official Help Centre at `faq.fundedelite.com` is the primary public-policy reference. The repo FAQ file is secondary. Owner-final exceptions still override both where they differ:

- A funded Strategy Risk breach is a soft breach with a reset, never termination.
- A funded reset is allowed only at breakeven or in profit, never in drawdown.
- Previous-cycle profit is not payable after a reset.
- Completed payouts are not reversed.

A sentence that says the FAQ overrides or outranks the Help Centre is hedged. A sentence that says the Help Centre is primary and the repo FAQ is secondary is allowed.

## Approved Help Centre statements

These are classes, matched by the fact, not by one example sentence. Article ids are the ones named for this pass. Article 17437354 was read from the live Help Centre ("How will I be paid, and what are the fees?").

- 17437398: a soft-breach payout is still processed at a 30% profit split.
- 17437285: one-instrument risk is 50% of the daily loss limit. That includes 1.5% when the half is 1.5%, and 2.5% when the example daily drawdown is 5%. A bare "no more than 50%" with no other percent is the same rule. Any other derived percent is hedged.
- 17437410: the first reset fee is 40% of the original challenge cost, minimum $10. Any other percent or dollar amount is hedged, in English or as a fee sentence such as "la tarifa de reset". The second and third fees are twice the previous fee when no other number is stated.
- 17437354, from the live table:
  - Rise: withdrawals of $500 or more, fee $40 per withdrawal. A pair of amounts that differs by $40 matches that fee.
  - Crypto (USDC): any amount, the only method below $500, fee 3% of the amount. A pair of amounts in the 3% ratio matches that fee.
  - The repo line that caps crypto at 500 USD is not approved. "Rise has no withdrawal limit", a Rise maximum of $500, and a Rise fee other than $40 are not approved.
- Weekend holding is allowed and is not termination. Weekend trading ending the account is a separate outcome.

## What is judged as a class

A sentence is hedged when it asserts one of these outcomes and does not match the approved statement. The detectors are class stems and structure, not a list of the sample sentences.

1. Strategy Risk account-ending. The class is an ending of the account: termination, closure, shut down, kill, does not continue, abolish, suspend, wipe, liquidate, and the same class in Spanish, French, Italian, Portuguese, Russian, Hindi, Urdu, and Arabic when the Strategy Risk topic is visible. "Close to" and "at the end" are not this class. The approved statement is a soft breach with a reset, or an explicit denial of termination.
2. Reset eligibility. A grant of reset (can, may, eligible, offered, and the same grant in Hindi, Arabic, Russian, and Spanish) is allowed only at breakeven or in profit, or when the sentence denies reset under a loss. Loss is the class losing, negative, open loss, below the starting balance, drawdown, deficit, and the matching stems in those languages. No approved condition means hedge. A question does not hide a following declarative sentence. The trailing-drawdown clock is not this class.
3. Previous-cycle profit. The class is prior-cycle profit payable. Anchors cover English, Hinglish, Hindi, Urdu, Arabic, Spanish, French, and Russian. The sentence is allowed only when it denies payment. There is no English-only gate.
4. Reversal. The class is a completed payout, withdrawal, reward, funds, settlement, or disbursement taken back: reverse, cancel, undo, claw back, pull back, retract, recoup, and the matching stems in Hindi, Urdu, Arabic, and Russian. Allowed only when the sentence says completed payouts are not reversed. A note cannot clear it.
5. Completion. The class is a past or agent completion of a status noun (payout, withdrawal, payment, refund, reward, funds, disbursement, remittance, settlement, and the matching nouns in Hindi, Urdu, and Russian). "Finance processed the withdrawal" is one shape of that class. A human or note confirms it only with an attestation residue. A note that only repeats the span, denies it, or says not to tell the client does not confirm it. A negation particle in Hindi, Urdu, Arabic, or Russian on a note that contains the span is a denial.
6. Catalyst stage-reset stays unresolved in both directions. Erasing a stage and keeping a stage are both hedged.

`index.js.public-sends.diff` is unchanged. It still wraps every public comment: `postClientCommentOnce` (identity recovery, the Fin welcome, review-status, and the presend send), the owner REPLY, and the authorized-note REPLY. A throw or a silent result posts the visible hedge and does not drop the send. The diff does not require `statePresend`.

A sentence with no topic anchor for these classes is not hedged. The anchors are not limited to English.

## Tests

`node luna-current/10_synthetic_lanes/t800-payout-r9/payoutClaimGuard.test.js`

17 passed, 0 failed. The cases cover the classes above, not only the original example sentences. `node --check` passed on both JS files. `git apply --check` passed on the proposed diff.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/10_synthetic_lanes/t800-payout-r9/payoutClaimGuard.js` | `a1fb1f44ba5e2db0ea86546cab307f05c0a189535457e06d19bbd63002c8e3a1` |
| `luna-current/10_synthetic_lanes/t800-payout-r9/payoutClaimGuard.test.js` | `5db691edbcf3f3a34bcc1019dc62e9d4a074eb02bdb0ff0dba47c9d9b6d5e707` |
| `luna-current/10_synthetic_lanes/t800-payout-r9/index.js.public-sends.diff` | `6934c79d20d4a3193192481fe128140fef06089e005e7e66f4e32f69efb81bb4` |

`SHA256SUMS.txt` is written after this report and includes this report's digest. This report does not approve the candidate.

## Blockers

- Independent review has not approved R9. This agent is the author and must not approve it.
- The hook is a proposed diff. It is not applied to `index.js`.
- Catalyst stage-reset stays hedged.
- No live webhook or customer conversation was used.
