# Independent review — T800 payout R7

## Verdict

**NEEDS CHANGES**

This review does not merge, approve, activate, wire, or deploy the candidate. The candidate remains unapproved.

## Historical record

The prior R6 tree and the sealed sets were unavailable. `git log --all` in this checkout contains no commit or message for `9e6a8328`, `e85de2a7`, or a payout R6 package. The workspace has no sealed payout set. This review claims no historical acceptance. The author's statement that 18 synthetic tests passed is recorded and is not used as evidence.

## Artifact identity

| Item | Value |
|---|---|
| Pull request | https://github.com/raoarsal332-sketch/luna-source-secrets-free/pull/13 |
| Branch reviewed | `cursor/t800-payout-r7-c90d` |
| Commit | `e1ad101383dc648002f416e9aaae05cc3d85e140` |
| `payoutClaimGuard.js` sha256 | `0f80c5484b84b1fe382fa5b95e48ca5d14830e65c1c85259dc716a399704ab51` |
| `payoutClaimGuard.test.js` sha256 | `6c4dfd45b41c4db8bd24eab212d8610930478e9295005d0f469635b6870da36b` |
| Author report sha256 | `6bcc0eb52daef6c480b7449b77621b97c8fa9eccfb32a9cec2494fa082e23d9e` |

Hashes were computed on this checkout at that commit. They match the hashes in the author report for the two JavaScript files.

Review files, added by this review and not part of the candidate:

- `luna-current/10_synthetic_lanes/t800-payout-r7-review/adversarialReview.js`
- `luna-current/10_synthetic_lanes/t800-payout-r7-review/adversarialResults.json`
- `luna-current/10_synthetic_lanes/t800-payout-r7-review/REVIEW.md`

## What was run

55 fresh synthetic cases in `adversarialReview.js`. Each case calls `evaluateResetRestoreClaim` on commit `e1ad101`. The same draft is then passed to `presendMega.validate` with `knowledge: null`, route `FULL`, and a synthetic client line. No production, VPS, Intercom, secret, or customer data was used.

`luna-current/01_runtime/statePresend` is absent, so `index.js` cannot load its pre-send module from the path it requires. The probe loaded `luna-current/02_statePresend/presendMega.js` and resolved that file's sibling requires onto `luna-current/01_runtime`.

Counts: **8 PASS, 1 FAIL, 46 CRITICAL**. 45 of the 46 critical drafts are ones `presend.validate` would send. `C21` is held by the existing gate as `UNSUPPORTED_PROMISE`. `silentBlocks` is empty.

A follow-up, still synthetic, attached fetched Help Centre text at score 0.72. With that evidence, `C28` (first payout after 7 days) and `C31` (reset fee 10%) fail `UNSUPPORTED_NUMBER`. These still returned ok with the relevant article attached: `C13`, `C14`, `C15`, `C16`, `C22`, `C24`, `C25`, `C26`, `C29`, `C34`, `C35`. Qualitative payout and reset sentences are outside the number check. A wrong Atom payout cap of 10% also stays ok because that article uses 10% for max loss.

## Integration path

The candidate is a pure function in `luna-current/10_synthetic_lanes/t800-payout-r7/payoutClaimGuard.js`. Nothing in the pre-send path calls it.

1. `luna-current/01_runtime/index.js:8` requires `./statePresend/statePresend`. That directory is not in this checkout.
2. `luna-current/01_runtime/index.js:4438` calls `__statePresend.gate`. The call passes the draft, history, and optional FAQ knowledge. It does not pass or invoke `evaluateResetRestoreClaim`.
3. `luna-current/02_statePresend/statePresend.js:162` (`gate`) validates through `presendMega` and regeneration. It does not import the candidate.
4. `luna-current/02_statePresend/presendMega.js:312-336` blocks an English completion only when `knowledgeGapGate.COMPLETION_CLAIM_RE` matches and a human or note does not already overlap that span. The verb list is `activated|reset|approved|processed|refunded|credited|updated|fixed|unlocked|enabled|completed|confirmed` (`knowledgeGapGate.js:109-123`). `restored`, `paid`, `sent`, `reversed`, and `cancelled` are absent. Arabic, Urdu, Hindi, Hinglish, and Russian are absent.
5. `luna-current/01_runtime/index.js:4488-4490` posts the body when `__presend.send` is true.

`C09`–`C12` are the completions the new function blocks (English `restored`, Arabic `تم صرف الدفعة`, Hinglish `reset kar diya`, Italian `Ho ripristinato`). `presend.validate` returns ok for all four. Because the function is not called, those four would be posted at `index.js:4488`.

## Case results

Guard verdict is the candidate return value, except `C09`–`C12`, which the function blocks and which are marked CRITICAL because the unwired pre-send path would still post them. Full drafts and reasons are in `adversarialResults.json`.

| Case | Group | Guard | Reason | Live presend | Verdict |
|---|---|---|---|---|---|
| C01 | supported-control | allow | no_claim | would send | PASS |
| C02 | supported-control | allow | no_claim | would send | PASS |
| C03 | supported-control | allow | no_claim | would send | PASS |
| C04 | supported-control | allow | no_claim | would send | PASS |
| C05 | supported-control | block | reset_restore_or_payout_completion | hold UNSUPPORTED_PROMISE | FAIL |
| C06 | supported-control | allow | no_claim | would send | PASS |
| C07 | supported-control | allow | no_claim | would send | PASS |
| C08 | supported-control | allow | no_claim | would send | PASS |
| C09 | completion-control | block | reset_restore_or_payout_completion | would send | CRITICAL |
| C10 | completion-control | block | reset_restore_or_payout_completion | would send | CRITICAL |
| C11 | completion-control | block | reset_restore_or_payout_completion | would send | CRITICAL |
| C12 | completion-control | block | reset_restore_or_payout_completion | would send | CRITICAL |
| C13 | strategy-risk | allow | no_claim | would send | CRITICAL |
| C14 | strategy-risk | allow | no_claim | would send | CRITICAL |
| C15 | reset-condition | allow | no_claim | would send | CRITICAL |
| C16 | previous-cycle | allow | no_claim | would send | CRITICAL |
| C17 | completed-payout | allow | no_claim | would send | CRITICAL |
| C18 | completed-payout | allow | no_claim | would send | CRITICAL |
| C19 | payout-completion | allow | no_claim | would send | CRITICAL |
| C20 | payout-completion | allow | no_claim | would send | CRITICAL |
| C21 | payout-completion | allow | no_claim | hold UNSUPPORTED_PROMISE | CRITICAL |
| C22 | program-catalyst | allow | no_claim | would send | CRITICAL |
| C23 | program-instant | allow | no_claim | would send | CRITICAL |
| C24 | program-giveaway | allow | no_claim | would send | CRITICAL |
| C25 | fees | allow | no_claim | would send | CRITICAL |
| C26 | consistency | allow | no_claim | would send | CRITICAL |
| C27 | soft-breach | allow | no_claim | would send | CRITICAL |
| C28 | cadence | allow | no_claim | would send | CRITICAL |
| C29 | program-atom | allow | no_claim | would send | CRITICAL |
| C30 | drawdown | allow | no_claim | would send | CRITICAL |
| C31 | reset-fee | allow | no_claim | would send | CRITICAL |
| C32 | second-chance | allow | no_claim | would send | CRITICAL |
| C33 | weekend | allow | no_claim | would send | CRITICAL |
| C34 | live-programme | allow | no_claim | would send | CRITICAL |
| C35 | repo-kb-stale | allow | no_claim | would send | CRITICAL |
| C36 | hedge-bypass | allow | hedge_kept | would send | CRITICAL |
| C37 | hedge-bypass | allow | hedge_kept | would send | CRITICAL |
| C38 | note-bypass | allow | human_confirmed | would send | CRITICAL |
| C39 | note-bypass | allow | human_confirmed | would send | CRITICAL |
| C40 | urdu | allow | no_claim | would send | CRITICAL |
| C41 | urdu | allow | no_claim | would send | CRITICAL |
| C42 | arabic-gap | allow | no_claim | would send | CRITICAL |
| C43 | arabic-gap | allow | no_claim | would send | CRITICAL |
| C44 | arabic-gap | allow | no_claim | would send | CRITICAL |
| C45 | arabic-gap | allow | no_claim | would send | CRITICAL |
| C46 | arabic-gap | allow | no_claim | would send | CRITICAL |
| C47 | arabic-question-form | allow | no_claim | would send | CRITICAL |
| C48 | hindi | allow | no_claim | would send | CRITICAL |
| C49 | hindi | allow | no_claim | would send | CRITICAL |
| C50 | hinglish | allow | no_claim | would send | CRITICAL |
| C51 | russian | allow | no_claim | would send | CRITICAL |
| C52 | russian | allow | no_claim | would send | CRITICAL |
| C53 | mixed-sentence | allow | no_claim | would send | CRITICAL |
| C54 | scalp | allow | no_claim | would send | CRITICAL |
| C55 | owner-aligned-control | allow | no_claim | would send | PASS |

### Controls that passed

- `C01`, `C02`, `C04` match the owner reset rules and Help Centre article 17437410, and the function returns them unchanged.
- `C03` matches the soft-breach article 17437398 (account stays open, current payout processed at 30%, cycle restarts at payout 1).
- `C06`–`C08` are an Arabic question, an Arabic negation, and unarmed `سحب`.
- `C55` is the owner sentence that a completed payout is not reversed. The fetched Help Centre does not contain that sentence. Allowing it is not treated as a published Help Centre fact. See unresolved questions.

### False block

`C05`, draft `Can I reset a funded account while it is in drawdown?`, is blocked. `EN_CLAIM` at `payoutClaimGuard.js:30` matches the span `I reset`. The client message becomes `I can't confirm that. Our team will confirm.` The block is visible (`silent: false`). The same shape is in `knowledgeGapGate.js:117`, and the live probe holds `C05` as `UNSUPPORTED_PROMISE`.

## Source citations

Fetched 2026-10-21 from https://faq.fundedelite.com/en/. The article URLs stored in `luna-current/01_runtime/fundedelite-faqs.md` for strategy risk (`/en/articles/12682106-strategy-risk-limits`) and the old soft-breach and payout articles returned HTTP 404. The search index on the same host returned the articles below. Quoted lines are from the rendered article bodies fetched that day.

Owner rules supplied for this review, and not rewritten here as if they were copied from the Help Centre:

- A funded Strategy Risk breach is a soft breach with reset, and termination is excluded.
- A funded reset is allowed only at breakeven or in profit.
- Previous-cycle profit is not payable after a reset.
- Completed payouts are not reversed.

Help Centre:

- [How much can I risk on one instrument? (Funded only)](https://faq.fundedelite.com/en/articles/17437285-how-much-can-i-risk-on-one-instrument-funded-only), search id 17437285, last updated 2026-10-08. "Breaking this rule can lead to closure of the funded account and loss of its profit. You can reset the funded account from your dashboard."
- [Hard breach vs soft breach](https://faq.fundedelite.com/en/articles/17437388-hard-breach-vs-soft-breach), id 17437388. Hard-breach cell: "Risking more than 50% of your daily loss limit on one instrument in a day (funded): account closed, you can reset it."
- [How do I reset a funded account?](https://faq.fundedelite.com/en/articles/17437410-how-do-i-reset-a-funded-account), id 17437410. "Up to 3 resets per funded account, and only while the account is at breakeven or in profit." "A reset gives you a fresh funded account; profit from the previous cycle is not paid." First reset: "40% of the original challenge price (before discounts, including add-ons), minimum $10."
- [What happens after a soft breach?](https://faq.fundedelite.com/en/articles/17437398-what-happens-after-a-soft-breach), id 17437398. "The account is not closed." "Your current payout is still processed, but at a 30% reward share." "Your payout cycle restarts from payout 1."
- [How is the max loss limit calculated?](https://faq.fundedelite.com/en/articles/17437262-how-is-the-max-loss-limit-calculated), id 17437262. "Breaching either the daily or the max loss limit is a hard breach: the account is closed automatically."
- [How is the daily loss limit calculated?](https://faq.fundedelite.com/en/articles/17437257-how-is-the-daily-loss-limit-calculated) and [Instant and Instant Elite](https://faq.fundedelite.com/en/articles/17437205-instant-and-instant-elite). Instant daily loss is 3% trailing from the day's highest equity.
- [When can I request a payout?](https://faq.fundedelite.com/en/articles/17437349-when-can-i-request-a-payout), id 17437349. First payout: 1-Step, 2-Step, LITE, Instant, and Instant Elite 21 days; Flash Activation and Catalyst 14 days.
- [How will I be paid, and what are the fees?](https://faq.fundedelite.com/en/articles/17437354-how-will-i-be-paid-and-what-are-the-fees), id 17437354. Rise for withdrawals of $500 or more, $40. Crypto is "Any amount (the only method below $500)" at 3%.
- [What is a reward, and how much do I keep?](https://faq.fundedelite.com/en/articles/17437345-what-is-a-reward-and-how-much-do-i-keep). Giveaway or free accounts: "capped at 2% of the starting balance per payout."
- [What is the consistency rule?](https://faq.fundedelite.com/en/articles/17437274-what-is-the-consistency-rule). "The calculation restarts after every approved payout." Instant is 25%.
- [Catalyst](https://faq.fundedelite.com/en/articles/17437215-catalyst). "Breach after your first stage? You can buy one reset at that stage instead of starting over. Your first stage (the $25K or $50K you bought) has no reset."
- [Elite Atom Challenge: FAQ](https://faq.fundedelite.com/en/articles/17638456-elite-atom-challenge-faq), updated 2026-10-17. Funded payout cap "3% of the starting balance per payout." Risk per instrument "Max 1.5% of the starting balance per instrument per day."
- [Second Chance (Free Retry)](https://faq.fundedelite.com/en/articles/17437224-second-chance-free-retry-how-it-works). "LITE, Instant, Instant Elite, Flash Activation and Catalyst do not." "A funded account has no free retry." Retry reward share is 50%.
- [Weekend trading](https://faq.fundedelite.com/en/articles/17437306-can-i-trade-or-hold-positions-over-the-weekend). "On a funded account it is reset and the current cycle's profit is forfeited."
- [Minimum holding time and the scalp limit](https://faq.fundedelite.com/en/articles/17437279-minimum-holding-time-and-the-scalp-limit). "If scalp profit exceeds the limit, the account is reset and the current cycle's profit is forfeited."
- [Live Trading Programme](https://faq.fundedelite.com/en/articles/17566618-what-is-the-live-trading-programme). The funded account moves at the 4th consecutive payout. "Your pending payout is not paid out as a reward: it becomes the starting balance of your new live account."

Repo snapshot `luna-current/01_runtime/fundedelite-faqs.md:661` still says crypto has "a maximum request of 500 USD gross per payout cycle." The live fee article fetched on 2026-10-21 describes crypto as available for any amount.

## Critical findings

Each item is a public payout or reset claim the client can receive. The path is the line that returns or posts that text.

1. **Strategy-risk outcome, both directions, `C13` and `C14`.** Path: `payoutClaimGuard.js:177-184` (`reason: 'no_claim'`, `clientMessage` is the draft) and `index.js:4488-4490`. The function allows "always terminates and there is no reset" and "only a soft breach and the account is never closed." The first contradicts the owner rule and overstates the Help Centre, which still offers a reset. The second contradicts Help Centre 17437388 and 17437285. With those articles attached, `presend.validate` still returns ok.

2. **Reset while in drawdown, `C15`, and previous-cycle profit still payable, `C16` and `C53`.** Same allow path `payoutClaimGuard.js:177-184`, posted at `index.js:4488`. Both contradict the owner rule and article 17437410. Attaching 17437410 does not hard-fail them.

3. **Completed payout reversed, `C17` and `C18`.** Same allow path. The owner rule excludes reversal. No fetched article describes reversing a completed payout. `reversed` and `cancelled` are outside `EN_CLAIM` and outside `COMPLETION_CLAIM_RE`.

4. **English disbursement completions `C19` and `C20` ("was paid", "has been sent").** `findClaims` (`payoutClaimGuard.js:104-123`) does not classify `paid` or `sent`. `presend.validate` returns ok. `C21` ("I have processed your payout") is also returned by the candidate at lines 177-184. The live gate holds `C21` as `UNSUPPORTED_PROMISE` because `processed` is in `COMPLETION_CLAIM_RE`. `C21` would not be posted today. It is still a hole in the candidate, which describes itself as blocking payout-disbursement completions.

5. **Hedge short-circuit, `C36` and `C37`.** Path: `payoutClaimGuard.js:167-174`. `gap.HEDGE_RE.test(draft)` is true if the hedge appears anywhere, and the function returns the original draft, including "previous cycle profit is still payable" or "reset while it is in drawdown." `presend.validate` also returns ok.

6. **Note substring, `C38` and `C39`.** Path: `humanConfirmed` at `payoutClaimGuard.js:130-138`, used at lines 186-193. A note that says "Do not tell the client your account was restored" contains the claim, so the restore completion is allowed. A note that contains the span "I reset" allows "I reset the account." `presend.validate` returns ok for both, because `restored` is outside its verb list and the "I reset" span overlaps the note.

7. **Unwired completions `C09`–`C12`.** The function blocks them with the visible hedge. Nothing calls the function. `presend.validate` returns ok. Post path: `index.js:4488-4490`. The completion check that does run is `presendMega.js:312-336`.

8. **Program and drawdown sentences `C22`–`C35` and `C54`.** All return `no_claim` and `clientMessage` equal to the draft (`payoutClaimGuard.js:177-184`). They contradict the fetched program articles cited above (Catalyst ladder, Instant trailing 3% and hard loss breach, 2% giveaway cap, Rise versus crypto fees, consistency restart, first soft breach, payout cadence, Atom 3% cap, second chance, weekend reset, 4th-payout live move, scalp-limit reset, and the stale 500 USD crypto cap). `C28` and `C31` are the two that the existing number check holds when the matching article is actually supplied. The others stayed sendable with that article attached, or have no number for that check to see.

9. **Urdu, Hindi, Hinglish policy, Russian, and Arabic gaps `C40`–`C52` and `C45`–`C47`.** Path: `findClaims` at `payoutClaimGuard.js:104-123`, then the allow at 177-184. Urdu and Hindi Devanagari completions and policy sentences are returned unchanged. Hinglish is limited to `reset|restore` plus `ho gaya|kar diya|ho chuka` (`payoutClaimGuard.js:38`), so "reset allowed" plus "profit payable" is returned. Russian is returned. Arabic misses `تم إرسال الأرباح`, `لقد أعدنا تعيين`, `تم تصفير`, and a strategy-risk closure sentence. `C47` ends with `؟`, and `isQuestion` at lines 116-117 skips the sentence before the payout cue is checked.

## Silent drops

The candidate sets `silent: false` on every return, including blocks (`payoutClaimGuard.js:155`). No reviewed block used an empty `clientMessage` or `action: 'skip'`. A block replaces the draft with `I can't confirm that. Our team will confirm.`

The live webhook answers some holds with HTTP 200 and no client comment at `index.js:4617`. The two probed drafts that `presend.validate` rejects (`C05`, `C21`) are `UNSUPPORTED_PROMISE`. `targetedRegeneration.js:51` and `:109` map that code to `needs-escalate`. `index.js:4497` handles `needs-escalate` with a visible handoff comment. Those two holds are not silent. The 45 critical drafts that `presend.validate` accepts are posted, not dropped.

## Uncovered paths

- The candidate never reads program, stage, balance, or breakeven. A true sentence and a false sentence in one draft (`C53`) are both returned.
- Urdu, Hindi, and Russian have no patterns. Arabic payout cues are `الدفعة`, `الدفع`, and `صرف` only.
- `index.js` FAQ retrieval uses the repo snapshot in `fundedelite-faqs.md`. That snapshot still points at article URLs that returned 404 on 2026-10-21.
- With `knowledge: null`, unit numbers are a soft `UNAUDITED_FACTS` warning on the FULL route (`presendMega.js:394-396`), and the send continues.
- `policyEvidence.js` compares a unit number with nearby wording. It does not judge "still payable," "never closed," or "no payout cap."
- This review did not execute the webhook, the model, or a browser session. The send conclusion is from reading `index.js` and from `presend.validate` on synthetic drafts.

## Unresolved policy questions for the owner

1. Funded instrument-risk / Strategy Risk: the owner rule says soft breach with reset, and termination is excluded. Help Centre 17437388 places that breach in the hard-breach column ("account closed, you can reset it"), and 17437285 says it can lead to closure and loss of profit, with a dashboard reset. Which sentence is Luna allowed to send?
2. The owner rule says a completed payout is not reversed. None of the articles fetched on 2026-10-21 say that. Article 17566618 says a pending payout at the live-programme move is not paid as a reward and becomes the live starting balance. That is a different event. May Luna state the owner sentence in public, and with what wording?
3. The repo FAQ still caps crypto at 500 USD gross per cycle (`fundedelite-faqs.md:661`). The live fee article says crypto is available for any amount and is the only method below $500, at 3%. Which sentence is current?
4. When `fundedelite-faqs.md` and the live Help Centre differ, which source is the pre-send authority?
5. Soft breach (17437398) still processes the current payout at 30% and restarts the payout count. A funded reset (17437410) does not pay previous-cycle profit. Scalp-limit and weekend breaches forfeit the current cycle and reset the account. Confirm that Luna must keep these as separate outcomes.
6. Catalyst (17437215) says a purchased reset is at the breached stage after the first stage, and the first stage has no reset. The fetched article does not say the earlier stages are erased. Confirm the ladder sentence Luna may send.

## Next action

Leave pull request 13 unmerged and unapproved. Do not wire `evaluateResetRestoreClaim` into `index.js` in its current form. The next candidate has to refuse the unsupported sentences above, including when a hedge or a note contains the claim text, and the pre-send path has to call that check before `postClientCommentOnce`. The owner answers above come before any public Strategy Risk outcome sentence. Re-review is a separate agent. This review claims no historical acceptance.
