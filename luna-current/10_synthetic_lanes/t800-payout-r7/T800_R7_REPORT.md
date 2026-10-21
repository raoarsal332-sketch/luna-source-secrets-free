# T800 payout R7 — frozen candidate

Status: **frozen candidate, not approved**. Author and reviewer must be different agents. This report does not approve the candidate and does not authorize a release.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. The R6 package `9e6a8328` and review `e85de2a7` are not in this checkout, so this is a rebuild from the repo and the t812 handoff delta, not a byte patch on those trees.

## What changed

`evaluateResetRestoreClaim` is a pure function. It is not wired into `presendMega.js`, `knowledgeGapGate.js`, or `index.js`.

- Reset and restore completion claims are blocked with no topic check and no language-tag check. Passing `topic` or `language` is not read.
- Arabic payout cues `الدفع`, `الدفعة`, and `صرف` (plus a short inflection such as `صرفت`) mark a completion when the same sentence has `تم` / `تمت` or an equivalent done-marker. A question or `لم يتم` is not a claim.
- A block is never silent. `action` is `block`, `silent` is false, and `clientMessage` is the non-empty hedge line `I can't confirm that. Our team will confirm.`
- `سحب` / `السحب` arms only in the same sentence as a loss word (`خسارة`, `خسائر`, loss, drawdown) or a payout word (the Arabic cues above, payout, withdrawal). `تم سحب` with none of those does not arm. Armed `سحب` still needs a completion marker before it blocks.
- The hedge is the existing `HEDGE_RE` in `02_statePresend/knowledgeGapGate.js`. If it matches, the draft is returned unchanged. A human or note message that contains the claim phrase also allows the draft, which is the existing support rule.
- Explanatory wording such as "a soft breach resets the payout cycle" is not a completion claim. No payout date, amount, or approval is added.

Covered claim shapes: English reset/restore completions, the Arabic cues above, Italian `ho/abbiamo ripristinato|resettato` and `è stato ripristinato|resettato`, and Hinglish `reset/restore ho gaya|kar diya|ho chuka`. Italian and Hinglish are already present in the runtime greeting and soft-edge copy. No other languages were added.

## Tests

`node luna-current/10_synthetic_lanes/t800-payout-r7/payoutClaimGuard.test.js`

18 passed, 0 failed. Fixtures are synthetic. `node --check` passed on both JS files.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/10_synthetic_lanes/t800-payout-r7/payoutClaimGuard.js` | `0f80c5484b84b1fe382fa5b95e48ca5d14830e65c1c85259dc716a399704ab51` |
| `luna-current/10_synthetic_lanes/t800-payout-r7/payoutClaimGuard.test.js` | `6c4dfd45b41c4db8bd24eab212d8610930478e9295005d0f469635b6870da36b` |

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- Not wired into the pre-send path. Integration waits on that review and on a separate release approval.
- R6 bytes were not available, so behavior that R6 already had, beyond this delta, was not replayed.
- Languages that are not English, the named Arabic cues, Italian, or Hinglish are not covered. The original T800 language pack was not in this repo.
- The hedge exception is the existing English `HEDGE_RE` only. No new hedge translations were invented.
- No live webhook or customer conversation was used.
