# T800 payout R8 — frozen candidate

Status: **frozen candidate, not approved**. This agent wrote the candidate. A different agent has to review it. This report does not approve the candidate and does not authorize a release, a deploy, or a merge.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

Branch base: `cursor/t800-payout-r7-c90d` (PR #13). The independent review and its case file were not read. The fixes below follow the review summary that was supplied with this task.

## Owner-final rules

These override Help Centre wording where they differ. The guard enforces them as blocks. It does not add a replacement policy paragraph.

- A funded Strategy Risk breach is a soft breach with a reset, never termination.
- A funded reset is allowed only at breakeven or in profit, never in drawdown.
- Previous-cycle profit is not payable after a reset.
- Completed payouts are not reversed.

Soft breach, funded reset, and scalp/weekend reset are separate outcomes. A sentence that states they are the same outcome is blocked. A scalp or weekend sentence is not classified as a Strategy Risk termination.

## What changed

`evaluateResetRestoreClaim` and `beforeSend` stay pure. They are not called from `index.js`.

1. Outcome claims that contradict the owner-final rules are blocked: Strategy Risk termination or no-reset, a funded reset in drawdown, previous-cycle profit payable after a reset, and a completed payout reversed or cancelled. A confirming note does not clear those blocks. The aligned statements of the same rules are allowed. Questions are not claims.
2. Completion detection covers paid, sent, processed, restored, reversed, and cancelled, including Urdu, Hindi, Hinglish, Russian, and Arabic. Matching is aspect or auxiliary plus a stem in the same sentence, with negation and question exclusion. Italian reset/restore coverage from R7 is kept. `سحب` still arms only beside a loss or payout word and still needs a completion marker.
3. A hedge no longer returns before the rest of the draft. Each sentence is checked. A later sentence can still block. A sentence that is only the existing hedge is not treated as a positive completion. An owner-final contradiction in a hedged sentence still blocks.
4. A human or note message that says not to tell the client is excluded from confirmation. Client text and the bot's own admin id are not confirmation. Another non-withhold human or note can still confirm an ordinary completion.
5. A question such as "Can I reset..." is not a completion claim and is not an outcome claim, including "Can I reset the account while it is in drawdown?"
6. A program or drawdown factual sentence with no authoritative support is held. Support is supplied knowledge or an explicit authority string, not the client's own message. Conflicting numbers in that support are held. The draft is not replaced with a different figure.
7. `index.js.before-send.diff` is the proposed hook immediately before `postClientCommentOnce` at the send site around lines 4438–4490. `git apply --check` succeeds against this tree. `01_runtime/statePresend` is absent, so the diff does not require it and does not call the presend gate. If the guard throws, returns a silent result, or returns an empty body, the hook posts the visible hedge and does not drop the send. A block or hold also posts that hedge instead of the draft.

The hedge line is unchanged: `I can't confirm that. Our team will confirm.` It matches the existing `HEDGE_RE`. If `02_statePresend/knowledgeGapGate.js` cannot be loaded, the same pattern is used locally.

## Left held, not decided

- Crypto 500 USD cap versus a live any-amount rule.
- Whether the FAQ or the Help Centre outranks the other.
- Catalyst stage-erasure.

Knowledge that supports one side does not turn these into an allow. Rise having no withdrawal limit is not treated as the crypto question.

## Tests

`node luna-current/10_synthetic_lanes/t800-payout-r8/payoutClaimGuard.test.js`

21 passed, 0 failed. Fixtures are synthetic. `node --check` passed on both JS files. `git apply --check` passed on the proposed diff.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/10_synthetic_lanes/t800-payout-r8/payoutClaimGuard.js` | `793a9fd995186b6acd3bc51b7a21cd54205a322465d067e0ee67d0c32402b43a` |
| `luna-current/10_synthetic_lanes/t800-payout-r8/payoutClaimGuard.test.js` | `00f360fdc281ec3406c9d9f0339bf4e8555081345231db7e01671529ba7ac9d6` |
| `luna-current/10_synthetic_lanes/t800-payout-r8/index.js.before-send.diff` | `ee9d14bf3dff4a8fb81a5937519301d377efa2a955526cf9b98b6a11c8b02540` |

`SHA256SUMS.txt` is written after this report and includes this report's digest. This report does not approve the candidate.

## Blockers

- Independent review has not been run on R8. This agent is the author and must not approve it.
- The hook is a proposed diff. It is not applied to `index.js`.
- The three unresolved conflicts above stay held.
- No live webhook or customer conversation was used.
