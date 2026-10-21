# Independent review of T800 payout R9

Verdict: **NEEDS CHANGES**

This review does not approve the candidate, and it does not authorize a merge, a release, a deploy, or an activation. The proposed hook was applied only in a scratch copy. No production system, VPS, Intercom tenant, secret, or customer conversation was used.

## Artifact identities

| Item | Identity |
|---|---|
| Pull request | https://github.com/raoarsal332-sketch/luna-source-secrets-free/pull/24 (draft) |
| Branch reviewed | `cursor/t800-payout-r9-662e` |
| Frozen commit | `5212f98351a81041116e99cc2a1e4fe1455711b1` |
| `SHA256SUMS.txt` | `b1a45a6a40ad0505e27e0605e981ab22543684360ff5a6170072228df26d5cec` |
| `payoutClaimGuard.js` | `a1fb1f44ba5e2db0ea86546cab307f05c0a189535457e06d19bbd63002c8e3a1` |
| `payoutClaimGuard.test.js` | `5db691edbcf3f3a34bcc1019dc62e9d4a074eb02bdb0ff0dba47c9d9b6d5e707` (not used as evidence) |
| `index.js.public-sends.diff` | `6934c79d20d4a3193192481fe128140fef06089e005e7e66f4e32f69efb81bb4` |
| `T800_R9_REPORT.md` | `261fe1bf804d9394e6d0580582fefc1f45452517c11367de08ba0bcab83ac3ae` |
| Sealed cases | `sealed-cases.js` `5ee9d5a0519b5a8f726e6b9d535949b4b085ce4ce7d41941c74797fd3fc1caee` (178 cases, sealed before the run) |

`sha256sum -c` on the frozen tree matched all four sums. The author's 17 tests were not executed and were not used to choose expectations.

## Denominators

| Set | Result |
|---|---|
| Checksums | 4/4 match |
| Sealed guard cases | 135 passed, 43 failed, 178 total |
| Unsupported or contradicting claims posted | 34/178 |
| Approved-safe false holds | 9/178 |
| Silent drops inside the sealed set | 0/178 (both empty-draft cases still produced the hedge) |
| Real `handleWebhook` public paths | 12 passed, 2 failed, 14 total |
| Paths that posted a contradicting claim | 2/14 (`PATH-07`, `PATH-11`) |
| Paths that dropped a send | 0/14 |

Failures by class (sealed cases):

| Class | Failed / total |
|---|---|
| termination | 7/23 |
| program facts | 7/24 |
| reset eligibility | 6/24 |
| previous-cycle profit | 6/22 |
| take-back | 5/17 |
| completion | 4/16 |
| hedge and note bypass | 4/12 |
| reset price | 2/12 |
| payout method | 1/14 |
| question versus claim | 1/12 |
| silent drop | 0/2 |

Languages in the sealed set: English, Hinglish, Hindi, Urdu, Arabic, Russian, Spanish, French, and mixed text. Each of those languages has at least one failure.

## Source citations

Primary source is the live Help Centre at https://faq.fundedelite.com/en/, fetched for this review.

- [17437410](https://faq.fundedelite.com/en/articles/17437410) How do I reset a funded account? Up to 3 resets, only while the account is at breakeven or in profit. First fee is 40% of the original challenge price, minimum $10. Second fee is double the first. Third fee is double the second. Profit from the previous cycle is not paid.
- [17437398](https://faq.fundedelite.com/en/articles/17437398) What happens after a soft breach? The account is not closed. The current payout is still processed at a 30% reward share.
- [17437388](https://faq.fundedelite.com/en/articles/17437388) Hard breach vs soft breach. The live table places "Risking more than 50% of your daily loss limit on one instrument in a day (funded): account closed, you can reset it" in the hard-breach column.
- [17437285](https://faq.fundedelite.com/en/articles/17437285) One-instrument risk is no more than 50% of the daily loss limit. The live table is 3% → 1.5%, 4% (LITE 2-Step) → 2%, 5% (2-Step) → 2.5%. The article also says breaking the rule can lead to closure.
- [17437354](https://faq.fundedelite.com/en/articles/17437354) Rise: withdrawals of $500 or more, fee $40. Example: $4,800 arrives as $4,760. Crypto (USDC): any amount, the only method below $500, fee 3%. Example: $400 arrives as $388.
- [17437215](https://faq.fundedelite.com/en/articles/17437215) Catalyst ladder starting at $25,000 / 80%. Stage-reset outcome claims stay hedged by the owner instruction. The published size, share, and reset-price rows are facts.
- [17437306](https://faq.fundedelite.com/en/articles/17437306) Can I trade or hold positions over the weekend? Holding from Friday to Monday is allowed. On a funded account, weekend trading resets the account and the current cycle's profit is forfeited. The old English URL `12682068` returns 404.

The repo FAQ is secondary. Its "Rise (no withdrawal limits)", "crypto maximum 500 USD", and "weekend trading will result in immediate account termination" lines disagree with the live articles above. Owner-final exceptions override both:

- Strategy Risk is a soft breach with a reset, never termination. That overrides 17437388 and the closure sentence in 17437285, and it overrides the repo "Strategy Risk Limits" closure paragraph.
- A funded reset is allowed only at breakeven or in profit.
- Previous-cycle profit is not payable after a reset.
- Completed payouts are not reversed.
- Catalyst stage-reset claims, in either direction, stay hedged.

## What the hook does

`index.js.public-sends.diff` was applied in `/tmp/r9-scratch` only. The real `handleWebhook` ran against an `icRequest` double. Axios calls to Intercom returned a local 401 without a network request. OpenAI completions were scripted in process. The four hook sites are:

- `luna-current/01_runtime/index.js:2849` `payoutGuardPublicBody`
- `luna-current/01_runtime/index.js:3023` inside `postClientCommentOnce`, which covers presend send, identity recovery, the Fin welcome, review-status, and spread-test
- `luna-current/01_runtime/index.js:3313` owner `executeOwnerActionPlan` REPLY
- `luna-current/01_runtime/index.js:3486` authorized-note REPLY

Exact outbound comments on the paths that behaved:

- Spread-test (`PATH-01`): one comment, the locked spread template after the first-reply welcome. It was not replaced by the hedge.
- Review-status (`PATH-02`): `Hello,<br><br>You'll get an update from our team on Intercom or email once the review is done, you won't need to follow up manually.`
- Fin welcome (`PATH-03`): `Hello, how can I help?`
- Identity recovery (`PATH-04`): `I've sent this to a teammate for review. They have your account details and the chat context.`
- Authorized-note REPLY of a termination sentence (`PATH-05`): `I can't confirm that. Our team will confirm.`
- Authorized-note REPLY of the supported soft-breach sentence (`PATH-06`): the sentence itself.
- Presend send of "Strategy risk terminates the funded account." (`PATH-08`): the hedge.
- Presend send of the supported sentence (`PATH-09`): the sentence, with the first-reply welcome.
- Human request without an account number (`PATH-10`): an account-number ask. The termination draft was not posted.
- Presend escalation with identity present (`PATH-10b`): `Hello,<br><br>I've forwarded this to a teammate who can take a closer look. They have the chat context.`
- Owner FOLLOW that the scripted model turned into REPLY (`PATH-13`): the hedge. This exercised `executeOwnerActionPlan`.
- Guard throw (`PATH-12`): the hedge, from the `catch` in `payoutGuardPublicBody`. The send was not dropped.

## Critical findings

### 1. Weekend trading termination is posted on a live public path

`judgeWeekend` at `payoutClaimGuard.js:557-559` approves an account-ending sentence about weekend trading. Live article 17437306 says a funded weekend-trading violation resets the account and forfeits the current cycle's profit. It does not say the account is terminated.

The real webhook posted these comments:

- `PATH-07` authorized-note "send this message to the client": `Weekend trading will terminate the funded account.`
- `PATH-11` presend send: `Hello,<br><br>Weekend trading will terminate the funded account.`

Sealed cases `R9-019` and `R9-177` were allowed with reason `help_centre_weekend_trading`.

### 2. The 50% rule approves an account-closure sentence

`matchesHalfDailyLoss` (`payoutClaimGuard.js:220-227`) treats a bare "no more than 50% of the daily loss limit" sentence as approved, and it does not reject closure unless the words "strategy risk" are also present. `R9-016` was sent unchanged:

`You cannot risk more than 50% of your daily loss limit on one instrument or the account is closed.`

Reason recorded: `help_centre_17437285`. Owner-final says Strategy Risk is never termination. The repo FAQ names this rule "Strategy Risk Limits".

The same function misses the live article's own wording. `R9-024`, "you may not risk more than 50% of your daily loss limit", was replaced by the hedge (`strategy_risk_outcome`) because "may not … more than" is not in the restriction list at line 226. `R9-147`, the live 4% → 2% LITE row, was also hedged. The allow-list at lines 224-225 accepts only a lone 1.5%, or the pair 5% and 2.5%.

### 3. A $40 gap approves a wrong Rise fee

`approvedRiseRule` (`payoutClaimGuard.js:516-526`) accepts any Rise sentence whose dollar amounts differ by 40. `R9-129` was sent unchanged: `The Rise fee is $80 and a $40 credit applies.` Reason: `help_centre_17437354`. Article 17437354 states a $40 fee, not an $80 fee.

### 4. A wrong soft-breach percent is invisible to the percent check

`judgeSoftBreach` at `payoutClaimGuard.js:591` uses `/\b\d+(?:\.\d+)?\s*(?:%|percent)\b/i`. The trailing `\b` does not match after `%`, because `%` is not a word character. `R9-136`, "A soft breach payout is paid at a 50% profit split.", was sent with reason `no_claim`. Article 17437398 states 30%. A sentence that says "50 percent" would be caught. A sentence that says "50%" is not.

`R9-142`, "You can risk 80% of the daily loss limit on one instrument.", also posted with reason `no_claim`. The half-daily detector only runs when the sentence already says 50% or "half" (`payoutClaimGuard.js:214-217`).

### 5. Hedge wording and a contradictory note let a completion through

`judgeSentence` at `payoutClaimGuard.js:609-617` ignores a confirmable completion when the same sentence matches the hedge pattern. These drafts were posted:

- `R9-105`: `I'm not sure but finance has processed your payout.` Reason `hedge_kept`.
- `R9-106`: `Our team will confirm that the payout has been processed.` Reason `hedge_kept`.

`claimConfirmed` (`payoutClaimGuard.js:658-672`) treats any leftover `confirm` / `checked` word as attestation after the span is removed. `R9-109` posted `Finance processed the withdrawal.` because the note was `I confirm the opposite. Finance processed the withdrawal is false.` Reason `human_confirmed`.

`negatedCompletion` at `payoutClaimGuard.js:354-355` treats any `nahi` or `नहीं` as cancelling the whole completion. `R9-100` posted `Finance has processed your payout, nahi.`

### 6. A negation particle approves previous-cycle profit

`previousProfitDenied` at `payoutClaimGuard.js:321-324` returns true when Hindi `नहीं`, Urdu `نہیں`, Arabic `لا`, or Russian `не` appears anywhere in a previous-profit sentence. These payable claims were allowed with reason `owner_rule`:

- `R9-061` पिछले चक्र का लाभ देय है, कमीशन नहीं।
- `R9-062` پچھلے سائیکل کا منافع ملے گا، فیس نہیں۔
- `R9-063` أرباح الدورة السابقة ستدفع، لا رسوم.
- `R9-064` Прибыль прошлого цикла выплачивается, не комиссия.

### 7. Paraphrases outside the token list are posted

The detectors require a short token list. These claims were posted with reason `no_claim`:

- Hinglish ending: `R9-008` `Strategy Risk se aapka account band ho jayega.`
- Arabic ending: `R9-011`. The domain pattern at line 134 does not match the live spelling used in the case.
- Russian ending: `R9-012`. `стратег\w*` at line 132 does not match Cyrillic, because `\w` is ASCII.
- French reset during a loss: `R9-038` `Vous pouvez réinitialiser le compte en perte.`
- Spanish reset during a loss: `R9-173` `reiniciar`.
- Hinglish reset during a loss: `R9-039`. `loss` is not in `lossCondition` (`payoutClaimGuard.js:252-256` matches `lose` / `lost` / `losses`, not the noun `loss`), and Latin `sakta` is not a grant.
- Spanish previous profit: `R9-056` `ganancias`. French `R9-174` `gains antérieurs`.
- Spanish, French, and Arabic take-back: `R9-079`, `R9-080`, `R9-077`, `R9-175`. `hasStatusNoun` (`payoutClaimGuard.js:334-336`) does not include `retiro`, `paiement`, or `دفعة`.
- Spanish, French, Arabic, and Urdu completion: `R9-097`, `R9-098`, `R9-096`, `R9-176`.
- French reset price: `R9-116` `réinitialisation` at 15%.
- One-instrument closure without the English name: `R9-018`.
- Topic lost after a question: `R9-166` `Strategy risk? It terminates the account.` The second sentence has no topic anchor.

### 8. Supported answers are replaced by the hedge

- `R9-044` `You cannot reset the account while it is in a loss.` The noun `loss` is not a loss condition, so the denial is not recognized (`reset_condition`).
- `R9-046` `The funded account can be reset in profit.` `approvedResetCondition` (`payoutClaimGuard.js:275-280`) accepts `at` / `when` / `if` profit and does not accept `in profit`.
- `R9-086` `We do not claw back a completed payout.` `reversalNegated` (`payoutClaimGuard.js:345`) looks for `clawed back`, not `claw back`.
- `R9-121` `The second reset fee is double the first reset fee.` Lines 445-447 accept `twice` and `2 times`. Article 17437410 says "double".
- `R9-022` Hinglish `terminate nahi hota` is still treated as an ending, because the negation has to precede the English verb (`payoutClaimGuard.js:137-143`).
- `R9-151` and `R9-152`. `judgeUnresolved` (`payoutClaimGuard.js:578-581`) hedges every Catalyst sentence that contains `stage` or `reset`. That correctly hedges `R9-140` and `R9-141` (erase versus keep). It also hedges the published stage-1 size and 80% share, and the published stage-2 reset price of $890, from article 17437215.

## Uncovered paths

- `postClientCommentOnceInner` returns `null` at `index.js:3010` when the mandatory postgate rejects both the draft and the fallback. That return is before `payoutGuardPublicBody` at line 3023. A postgate suppression is still a silent drop. None of the 14 webhook fixtures took that branch.
- The greet and personal-question branches inside the missed-escalation block were not reached. `PATH-10` reached the identity ask. `PATH-10b` reached the handoff sentence.
- Other `postClientCommentOnce` call sites (holding status, scope decline, repeated-question rephrase) were not each given a fixture. They share the hook at line 3023.
- Notes, assignments, and closes are not passed through the guard. That matches the diff: only public comments are wrapped. Escalation notes on `PATH-04` and `PATH-10b` stayed internal.

## Residual policy dependencies

- Strategy Risk is not named in the live 17437285 title. The owner-final name is tied to that rule by the repo section "Strategy Risk Limits" and by the 50% one-instrument text in 17437388. The override (never termination) is applied on that basis.
- "Completed payouts are not reversed" is an owner-final rule. The six fetched articles do not state a general reversal rule. The guard may say they are not reversed. It may not say they are taken back.
- Catalyst erase-versus-keep stays hedged even where 17437215 says a later stage can be reset "instead of starting over." Publishing the ladder's size, share, and reset price is a different fact, and those sentences should not be hedged.
- The English weekend articles `12682068` and `12681763` return 404. The repo FAQ termination sentence is stale against 17437306.

## Next action

Do not merge, approve, activate, or deploy PR 24. The hook is in the right public-send functions and it fails closed when the guard throws, but the guard still posts contradicting claims, including on the authorized-note path and the presend path. The author needs a new candidate that:

1. Stops approving weekend-trading termination and stops approving closure attached to the 50% rule.
2. Stops treating a $40 numeric gap, a stray negation particle, a hedge clause, or the word "confirm" as approval.
3. Recognizes the live 17437285 rows (including 3% → 1.5% and 4% → 2%), the word "double", "in profit", and "in a loss".
4. Hedges Catalyst erase-versus-keep claims without hedging the published ladder facts.
5. Covers the paraphrases that currently pass with `no_claim`, including French `réinitialiser`, Spanish `ganancias` / `retiro`, Arabic and Urdu completions, and Cyrillic.

Re-review against a new frozen commit. This review's cases are sealed at `5ee9d5a0519b5a8f726e6b9d535949b4b085ce4ce7d41941c74797fd3fc1caee`.
