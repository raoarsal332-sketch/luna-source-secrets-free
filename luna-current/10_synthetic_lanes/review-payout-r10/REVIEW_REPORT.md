# Independent review — T800 payout R10

Verdict: **NEEDS CHANGES**

This review does not approve, merge, activate, or deploy the candidate. `luna-current/01_runtime/index.js` was not modified. The public-send diff was applied only in a scratch copy.

Reviewer is independent of the R10 author and did not read any `review/payout-*` branch or its cases. Expectations come from the live Help Centre and the owner-final exceptions, not from the candidate's 19 tests.

## Artifact identities

| Artifact | Identity |
|---|---|
| PR | https://github.com/raoarsal332-sketch/luna-source-secrets-free/pull/30 (draft) |
| Branch reviewed | `cursor/t800-payout-r10-662e` |
| Frozen commit | `6c3c228bd4d41cd3ad316e56b832ecdc939b6950` |
| `HEAD` of that branch | same commit |
| `SHA256SUMS.txt` | `a9cb86b004222525b94d94fcb11cfe2be8e5d512518687b0e0ce02ae99e5a2ae` |
| `sha256sum -c` | all four listed files **OK** |
| `payoutClaimGuard.js` | `69bd169c124b294aa80cc182057aea9bc394921c36330aa5ffb8e8fbdd6ceea0` |
| `payoutClaimGuard.test.js` | `9489c32c77fc61244cbdb94ab4b0080b6af01b2e9b3e380f2a8d39994ef3888e` (not used as evidence) |
| `index.js.public-sends.diff` | `db2c3dccccf15c0ddf53be2f047ffa158044f725edd9d71da6d8b70b389a4603` |
| `T800_R10_REPORT.md` | `a397a0b0051edbb9d6d1cfe087d0800c04b47dab68d184752fc503f59811f0d2` |
| Sealed cases | `luna-current/10_synthetic_lanes/review-payout-r10/sealed-cases.js` `c105d868bcf70519ad0ba3059bf8b9d04258d1f7a362a978d36af44f064c6e78` |
| Case runner output | `sealed-case-results.json` |
| Webhook recording | `webhook-results.json` (spread-test password redacted; body hash kept) |

## Denominators

Sealed guard cases: **204** (107 expected allow, 97 expected hedge).

| Result | Count |
|---|---|
| Correct allow | 89 |
| Correct hedge | 75 |
| Unsupported or contradicting claims posted | **22** |
| False holds of supported live or owner-final facts | **18** |
| Silent drops inside `guardPublicBody` | **0** |
| Other | 0 |

Languages in the 204: English 132, Hinglish 11, Hindi 9, Urdu 8, Arabic 8, Russian 10, Spanish 11, French 11, mixed 4.

Real `handleWebhook` on the patched scratch copy, isolated recording transport, no Intercom and no OpenAI network: **11 public-send paths, 10 posted, 1 silent**.

| Path | Public comments | Payload |
|---|---|---|
| Authorized-note `REPLY:` unsafe weekend termination | 1 | visible hedge |
| Authorized-note `REPLY:` safe Strategy Risk sentence | 1 | draft unchanged |
| Authorized-note "send this message" take-back | 1 | visible hedge |
| Authorized-note `FOLLOW` → owner `REPLY` | 1 | visible hedge (`AUTH_NOTE FOLLOW-> REPLY`) |
| Fin welcome | 1 | `Hello Synthetic, how can I help?` |
| Spread-test | 1 | welcome intro plus the locked spread template (hash `f403ae99e99ef839591892be9cc711386cb1689b5698494191b607b2d7822b9b`) |
| Review-status | 1 | welcome intro plus one locked review-status line |
| Identity recovery | 1 | `I've sent this to a teammate for review. They have your account details and the chat context.` |
| Missed-escalation greet | 1 | `Hey — I'm doing well, thanks for asking. How can I help with your FundedElite account today?` |
| Missed-escalation personal question | 1 | personal-boundary decline, with the welcome intro |
| Postgate suppression, payout cap plus internal leak | 1 | visible hedge, not the cap |
| Postgate suppression, internal leak only | **0** | silent `return null` |

Approved-safe controls that did post unchanged include the Strategy Risk soft-breach sentence, the 50% / 3%→1.5% / 4%→2% / 5%→2.5% rows, the 30% soft-breach payout, Rise $40 and $500-or-more, crypto 3%, the 40% / $10 reset fee, later fees that double, weekend reset-and-forfeit, weekend holding allowed, and the Catalyst 95% / $1,790 stage fact.

## Citations

Primary, fetched live from https://faq.fundedelite.com/en/ on this review:

- **17437410** — up to 3 funded resets, only at breakeven or in profit. First reset is 40% of the original challenge price before discounts, including add-ons, minimum $10. Second doubles the first. Third doubles the second. Worked example: 1-Step $100,000 at $569 resets at $228, then $456, then $912. A reset is a fresh funded account and previous-cycle profit is not paid.
- **17437398** — funded soft breach: account is not closed; current payout still processed at a 30% reward share; payout cycle restarts. If it happens again after the warning, the account can be reset and its profit forfeited.
- **17437388** HTML table — a hard breach ends the account. Touching daily or max loss is a hard breach. The 50%-of-daily-loss one-instrument cell is in the hard-breach column and says the account is closed and can be reset. A soft breach keeps the account open. First gambling-style trading is a soft breach. Repeated soft breaches after a warning are in the hard-breach column.
- **17437285** — funded one-instrument cap is 50% of the daily loss limit. Table: 3% → 1.5%, 4% (LITE 2-Step) → 2%, 5% (2-Step) → 2.5%. The article also says breaking the rule can lead to closure and loss of profit. That closure sentence is overridden below.
- **17437354** — Rise is for withdrawals of $500 or more at $40. Crypto (USDC) is any amount, the only method below $500, at 3%. Published arrivals: a $4,800 Rise reward arrives as $4,760; a $400 crypto reward arrives as $388.
- **17437215** — Catalyst ladder shares and reset prices, including stage 4 at 95% and $1,790, stage 1 "No reset", and a $50,000 start at 80% in the prose (the table lists stage 2 at 85%). Daily loss 3%. Profit target 8% with options 5%, 8%, 10%. Max loss 6% on $25,000 and 5% from $50,000. Consistency 30%. Weekend trading is not allowed. Each approved payout closes the account and opens a fresh one at double size. Erase-versus-keep of profit or earlier stages is not settled in this article.
- **17437306** HTML table — hold, and moving a stop or target, are allowed with or without the add-on. Opening a new position without the add-on is a violation. Closing a position, including a stop or target being hit, is a **violation** without the add-on and allowed with it. Funded consequence: the account is reset and the current cycle's profit is forfeited. Holding Friday to Monday is always allowed.
- **17437366** — fee refund on the third payout for 1-Step, 2-Step, LITE 1-Step, and LITE 2-Step if the first attempt had no free retry, no reset, and no soft breach. A soft breach restarts that count. Instant, Instant Elite, Flash Activation, and Catalyst have no fee refund.

Owner-final exceptions, used over both the Help Centre and the repo FAQ:

- Strategy Risk is a soft breach with a reset, never termination.
- A funded reset is allowed only at breakeven or in profit.
- Previous-cycle profit is not payable after a reset.
- Completed payouts are not reversed.
- Catalyst erase-versus-keep stays hedged.

Secondary: the repo FAQ still says crypto has a maximum request of 500 USD (`luna-current/04_docs/fundedelite-faqs.md`, article 12675058). That page now returns HTTP 404. The live article 17437354 controls. The guard correctly hedges a $500 crypto cap.

Older URLs 12682106, 12675058, and 13868489 returned HTTP 404 on direct fetch. They were not treated as current authority. Web-search snippets of those URLs were not used as policy.

## Critical findings

1. **Wrong one-instrument percents are posted.** `isHalfRuleSentence` (`payoutClaimGuard.js` lines 289–296) returns true only when the sentence contains 50 (or the word "half") or both numbers of a correct pair. A wrong pair is therefore invisible and is posted as `no_claim`. Posted drafts: "A 3% daily loss limit means 2% per instrument.", "A 5% daily loss limit means 2% per instrument.", "A 4% daily loss limit means 1.5% per instrument.", and "You may risk 60% of your daily loss limit on one instrument." Article 17437285 says 3% → 1.5%, 4% → 2%, 5% → 2.5%, and the cap is 50%. Cases C05, C06, C07, C08.

2. **The Strategy Risk closure sentence from 17437285 is posted.** "Breaking this rule can lead to closure of the funded account and loss of its profit." is `no_claim`. `judgeSentence` (lines 728–739) rejects account-ending wording only after some other check has already approved the sentence. A closure sentence that never enters the Strategy Risk domain is posted. The owner override says this rule never terminates. Case T05. The same gap posts the Arabic "مخاطر الاستراتيجية تغلق الحساب." because `affirmsAccountEnd` (line 181) lists يغلق / إغلاق and not تغلق. Case T27.

3. **Weekend facts that do not use the tokens "weekend trad" or "weekend hold" are posted.** `weekendTrading` / `weekendHolding` (lines 614–622). Posted, and contradicting the 17437306 HTML table: "You can trade on Saturday without the add-on." and "Closing a position on Saturday without the add-on is allowed." Cases T14, T15. "Catalyst weekend trading is allowed." is also posted, contradicting 17437215. Case G12.

4. **Catalyst erase-versus-keep is not fully hedged.** `catalystErases` (lines 668–671) requires "stages" before kept / preserved / lost counts. Posted: "Your Catalyst profit is kept after a reset." and "Catalyst profit is preserved." Cases G16, G17. "Catalyst earlier stages stay won." is correctly hedged.

5. **Supported Catalyst percents that are not reward shares are false-held.** `judgeCatalystFacts` (line 681) rejects every percent outside {80, 85, 90, 95}. Held, though 17437215 states them: daily loss 3%, profit target 8%, options 5% / 8% / 10%, max loss 6% on the $25,000 stage, consistency 30%. Cases G06–G10.

6. **Published money examples are false-held.** 17437354's arrivals "$4,800 … arrives as $4,760" and "$400 … arrives as $388" are held as `payout_method_amount` (`isArrivalClaim`, lines 562–565, and the amount allow-list at lines 574–599). Cases M07, M08. 17437410's worked example "$569 … $228" and the following $456 / $912 are held because `approvedResetPrice` (lines 527–537) allows only 40 and 10. Cases F08, F09.

7. **A true two-method sentence is false-held.** "The Rise fee is $40 and crypto is the only method below $500." is held because crypto approval rejects any dollar figure other than 500, and the Rise $40 is in the same sentence. Case X06. Both clauses are in 17437354.

8. **Unqualified "can be reset" false-holds supported reset facts.** `judgeResetEligibility` (lines 374–380) holds every reset-eligibility sentence that does not restate breakeven or profit. Held: "You can reset the funded account from your dashboard." (17437410), "Repeated soft breaches can reset the account and forfeit its profit." (17437398), and "Strategy Risk never closes the funded account and it can be reset." (owner). Cases R24, R23, X23. Hinglish "ya" and Hindi "या" are also held even when they state breakeven or profit. Cases R10, R12.

9. **The fee-refund fact is false-held as a reset price.** "With your third payout the challenge fee is refunded on 1-Step if you never reset and had no soft breach." matches `isResetPriceSentence` (lines 521–525) because it contains "reset" and "fee", then fails the 40% / $10 check. Case G20. Article 17437366.

10. **Several non-English contradicting claims are posted** because the stems do not cover the words actually used:
    - Spanish "reiniciar … en pérdida", "ganancia … se paga", "revertido", and "El pago sigue al 30%" (the last is a false hold: 30% is right, but "pago" is not "payout", so the percent branch holds it). Cases R19, P16, K11, C16.
    - French "réinitialiser … en perte", "annulé", "paiement … 30%" (false hold), and "Le compte est clôturé." after a weekend question. Cases R21, K12, C17, X22.
    - Russian "Сброс можно сделать в убытке." Case R17.
    - Arabic "أثناء الخسارة" and "تم استرجاع الدفعة". Cases R15, K09.
    - "The second reset triples the first." has no fee/price token, so `isResetPriceSentence` does not see it. Case F05.
    - "Is the Rise fee $40? It is $90." The follow-up has no fee or percent token, so topic carry does not judge it (`judgePayoutMethod`, lines 606–608). Case X19.

11. **Postgate fall-through.** In `index.js.public-sends.diff` lines 46–52 the new `if` has no braces around the following `return null`. When the guard replaces the body, execution does not return. The recording shows `PAYOUT_GUARD_VISIBLE_HEDGE`, then `POSTGATE_REVALIDATE_FELLBACK`, then a second hedge, and the posted body is the hedge. The unsafe "$500 cap" was not posted. The unchanged-body branch still executes `return null`. The internal-leak-only path posted **zero** public comments. That is the one silent drop in the webhook run. It did not drop a payout claim. It also does not match the diff comment that a guarded public send is not dropped.

Note bypasses that were checked and held: a human "I confirmed" on a take-back, "I confirm the opposite", a withhold note, and a note confirming that previous-cycle profit is payable. A note that repeats "The payout was paid." and says "confirmed" does allow that completion. That is an operational confirmation, not a reversal.

`guardPublicBody` on an empty draft fail-closes to the hedge (`send: true`). It does not drop.

## Uncovered paths

- The only `postReply(..., 'comment', ...)` sites in `index.js` are inside `postClientCommentOnceInner`, the owner `REPLY` arm, and the authorized-note `REPLY` arm. The diff wraps all three, and it also wraps the missed-escalation greet and personal arms before `postClientCommentOnce`. Those paths were executed. Identity recovery, Fin welcome, review-status, and spread-test reach the guard through `postClientCommentOnceInner`.
- `postClientCommentOnceInner` can still return null before the guard: paused control, identical last body, a failed repeated-question rephrase, or a failed final `checkSendBoundary`. Those drops were not re-tested as payout policy.
- Weekend close/open rules, Catalyst weekend permission, and Catalyst erase-versus-keep wordings that avoid the current stems are not classified, so they post.
- A carried answer is judged only when the follow-up sentence itself matches a rule keyword. A bare dollar amount after a Rise question is not judged.

## Residual policy dependencies

- 17437285 and the hard-breach cell in 17437388 still say the one-instrument rule can close the account. The owner override forbids that outcome for Strategy Risk. Any future wording has to follow the owner, including paraphrases that describe the rule without the English name "Strategy Risk".
- 17437215 states both "stage 2 is 85%" in the table and "a $50,000 start begins at 80%" in the prose. Both were allowed. Erase-versus-keep remains unresolved and must stay hedged.
- The markdown rendering of 17437306 dropped the "Violation" cell for closing a position. The HTML table is the one used here: close without the add-on is a violation.
- The missed-escalation greet posts an em dash (`Hey — I'm doing well...`). That is outside the payout classes. `postProcessModelReply` is not applied on that arm.
- The repo FAQ crypto cap of $500 remains in-tree and is secondary. It must not be posted.

## Next action

Do not merge, approve, activate, or deploy PR 30. The candidate needs another revision that:

- treats a wrong one-instrument percent as a claim, not as silence;
- applies the owner override to Strategy Risk closure even when the sentence uses the article's "can lead to closure" wording or a non-English verb such as تغلق;
- hedges weekend open/close claims and Catalyst weekend-trading permission without requiring the exact English tokens;
- hedges Catalyst profit kept / preserved / erased without requiring the word "stages";
- allows the published non-share Catalyst percents, the 17437354 arrival examples, the 17437410 $228 / $456 / $912 example, the 17437398 repeated-soft-breach reset sentence, and the 17437366 fee-refund sentence;
- judges "can be reset" without treating every true reset sentence as a loss reset;
- covers the missing Spanish, French, Russian, and Arabic stems listed above;
- gives the postgate branch explicit braces so a replaced body cannot fall through, and does not silently drop a body the guard has already replaced.

This review is not that revision and does not approve R10.
