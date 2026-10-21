# T800 payout R9 — frozen candidate

Status: **frozen candidate, not approved**. This agent wrote the candidate. A different agent has to review it. This report does not approve the candidate and does not authorize a release, a deploy, or a merge.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

Branch base: `cursor/t800-payout-r8-662e` (the frozen R8 candidate). The independent review of R8 and its case file were not read. The changes below follow the review summary supplied with this task.

## Why R8 failed this pass

R8 decided outcome claims by listing English phrases that contradict the owner rules. A synonym, or the same claim in another language, did not hit the list and was sent. R9 does not add those synonyms to a block list. A sentence that asserts an outcome in one of the domains below is sent only when it matches an approved statement. Every other assertion in that domain is replaced with the visible hedge.

## Approved statements

Owner-final rules, which override Help Centre wording where they differ:

- A funded Strategy Risk breach is a soft breach with a reset, never termination.
- A funded reset is allowed only at breakeven or in profit, never in drawdown.
- Previous-cycle profit is not payable after a reset.
- Completed payouts are not reversed.

Help Centre facts used as approved statements for this pass:

- Article 17437398: a soft-breach payout is still processed at a 30% profit split.
- Article 17437285: one-instrument risk is 50% of the daily loss limit. That is 1.5% when the half is 1.5%, and 2.5% when the daily drawdown in the example is 5%. A bare "no more than 50% of the daily loss" with no other percent is the same rule. A different derived percent is not.
- Article 17437410: the first reset fee is 40% of the original challenge cost, minimum $10. The second and third reset fees are twice the previous fee.
- Article 17437354: Rise is for $500 or more only.
- Weekend holding is allowed and is not termination. Weekend trading is a separate outcome. Weekend holding is not the same outcome as weekend trading.

The numeric article ids are not in this repo. The 40% / $10 reset fee, the 30% soft-breach split, the 50% daily-loss rule, and the 5% → 2.5% example are in `luna-current/01_runtime/fundedelite-faqs.md`. The local payout article still says Rise has no withdrawal limits. That sentence is not an approved statement. Article 17437354, as named for this pass, replaces it. The FAQ line that a Strategy Risk breach may close the funded account is also not approved, because the owner rule is a soft breach with a reset.

## What the guard does

`evaluateResetRestoreClaim`, `guardPublicBody`, and `beforeSend` stay pure. They are not called from `index.js`.

1. Domains are Strategy Risk breach consequences, reset eligibility, previous-cycle profit, payout reversal or completion, reset price, and payout-method amount limits. Inside a domain, the allow is the approved statement above. "Ends", "shut down", "kill", "does not continue", and "closure" do not match the soft-breach-with-reset statement, so they are hedged. "Close to" and "at the end" are not termination. A funded-stage scope sentence with no breach consequence is left alone.
2. Reset eligibility is allowed only for breakeven or profit, or for a denial of reset while losing, negative, in open loss, below the starting balance, or in drawdown. "The account can be reset" with no approved condition is hedged. A how-question or can-question is not a claim. A declarative sentence after the question, including one joined by a comma, is still judged. A pure question does not hide it. The trailing-drawdown clock ("the limit does not reset") is not reset eligibility.
3. Previous-cycle profit is denied only when the sentence itself denies payment. Payable claims are hedged in English, Hinglish, Hindi, Urdu, and Arabic. A denial in those languages is allowed.
4. Take-back wording (reversed, cancelled, took back, undone, clawed back, pull back) on a payout, withdrawal, payment, refund, reward, funds, or disbursement is hedged. "Completed payouts are not reversed" is the approved statement. A note cannot clear that hedge.
5. Completions include paid, sent, processed, restored, reset, and the same structural shapes in Urdu, Hindi, Hinglish, Russian, Arabic, and Italian. "Your reward was paid", "your funds were sent", and "Finance processed the withdrawal" are completions. A human or note confirms one only when the text contains the claim and an attestation residue (confirm, verify, approve, attest, checked). A note that only repeats the claim, a note that denies it, a note that says not to tell the client, and client or bot text do not confirm it. A hedge sentence does not launder a reversal or another owner contradiction. A hedge that only withholds a completion is kept, and a later sentence is still checked.
6. Reset-price sentences must use 40% and, if they name a dollar amount, $10. 40% of profit, payout, balance, or drawdown is not the fee. Any other percent or dollar amount is hedged. Rise amount sentences are allowed only for $500 or more, at least $500, or a $500 minimum. "No withdrawal limit", "any amount", and "maximum $500" are hedged. Crypto amount sentences stay hedged.
7. `index.js.public-sends.diff` adds `payoutGuardPublicBody` and calls it on every public comment path. `postClientCommentOnceInner` guards the body immediately before its only `postReply` of a comment, so identity recovery, the Fin welcome, review-status, and the presend send are all covered. The owner REPLY in `executeOwnerActionPlan` and the authorized-note REPLY in `processAuthorizedNoteCommands` (about lines 3448–3452) call the same helper with `partsOf(full)`. The diff does not touch the `__presend.send` condition and does not require `01_runtime/statePresend`. If the guard throws, returns a silent result, or returns an empty body, the hook posts `I can't confirm that. Our team will confirm.` and does not drop the send.

`git apply --check` succeeds against this tree. If `02_statePresend/knowledgeGapGate.js` cannot be loaded, the hedge pattern falls back to the same literal used by that module.

## Left held, not decided

- Crypto 500 USD cap versus a live any-amount rule. Knowledge that repeats the FAQ cap does not turn it into an allow.
- Whether the FAQ or the Help Centre outranks the other.
- Catalyst stage-erasure.

A sentence the module cannot place in one of the domains above is not hedged. Previous-cycle profit is anchored in English, Hinglish, Hindi, Urdu, and Arabic. A Strategy Risk sentence with no recognizable topic anchor is outside what this candidate can see.

## Tests

`node luna-current/10_synthetic_lanes/t800-payout-r9/payoutClaimGuard.test.js`

17 passed, 0 failed. Fixtures are synthetic. `node --check` passed on both JS files. `git apply --check` passed on the proposed diff.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/10_synthetic_lanes/t800-payout-r9/payoutClaimGuard.js` | `09d6b1e0f053430bb43851e72d40273e38f281d95ebf5081484a70128b4699c5` |
| `luna-current/10_synthetic_lanes/t800-payout-r9/payoutClaimGuard.test.js` | `0b9052222c4ef925d544541f2487bdae2c4d425589159e47cacc55036f95c5b9` |
| `luna-current/10_synthetic_lanes/t800-payout-r9/index.js.public-sends.diff` | `6934c79d20d4a3193192481fe128140fef06089e005e7e66f4e32f69efb81bb4` |

`SHA256SUMS.txt` is written after this report and includes this report's digest. This report does not approve the candidate.

## Blockers

- Independent review has not been run on R9. This agent is the author and must not approve it.
- The hook is a proposed diff. It is not applied to `index.js`.
- The three unresolved conflicts above stay held.
- No live webhook or customer conversation was used.
