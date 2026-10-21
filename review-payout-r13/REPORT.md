# Independent review: payout guard R13

**Verdict: NEEDS CHANGES**

This review did not merge, approve, deploy, or take any Intercom action. The author test file was not used for the verdict. No earlier review branch, review folder, or earlier report was read.

## Frozen candidate

| File | SHA-256 | Result |
| --- | --- | --- |
| `payoutClaimGuard.js` | `f581dbc7c46e06619732f600463a6ad2d090951d7210521f1c59cafe7412df07` | match |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` | match |
| `index.js.public-sends.diff` | `522c859e3054ee4e28fadb77cabf01caa16c24226a703818fa0571a6e54d0e0c` | match |
| `T800_R13_REPORT.md` | `d5e3bfbe66d10fafcf6397bc959449eacff5c259a76961ca4fec41727037badf` | match |
| `SHA256SUMS.txt` | `81dac33adb2c0a2384e7d137b00c6d515eff66a56fc381ef60882121229da589` | match |

Commit `06bcbfc9ca160c2c3ebce88c6435e7aabb9a5f89` on `cursor/t800-payout-r13-662e` (draft PR #48). The same guard hash was present in the runtime copy that served `handleWebhook`.

## How the webhook was run

The public-sends diff was applied to a copy of `luna-current/01_runtime` from that commit, with the real `luna-current/02_statePresend` module copied in beside it. The guard was required from `10_synthetic_lanes/t800-payout-r13/` by the patched runtime. There was no guard shim and no substitute for `handleWebhook`.

The model was a stub on the `openai` module. The transport was the runtime’s own `__setTestDoubles` recording seam for `icRequest` and `fetchConversation`. `LUNA_TOOLS_ENABLED=0`. The FAQ file used by the runtime was the copy under `01_runtime`. The only host allowed through the HTTP gate was `faq.fundedelite.com`. Calls to `api.intercom.io` were rejected and are counted below as blocked side calls.

## Help Centre and lock audit

Articles 17437410, 17437398, 17437388, 17437285, 17437354, 17437215, 17437306, and 17437366 were fetched from the public Help Centre. `locksOk()` is true. Every citation sentence is a substring of the matching English locked body. Quoted locators match the fetched article text after ordinary punctuation and spacing differences (a space before a period, a semicolon where the locator has a period). Numeral multisets in Urdu, Roman Urdu, Hindi, Arabic, and Hinglish match the English body for all 23 facts.

Weekend article 17437306, table body exactly:

| Action on Saturday or Sunday | Without add-on | With add-on |
| --- | --- | --- |
| Hold an open position | Allowed | Allowed |
| Move your stop loss or take profit | Allowed | Allowed |
| Open a new position | Violation | Allowed |
| Close a position, including a stop loss or take profit being hit | Violation | Allowed |

The locked `weekend_hold` and `weekend_trade` sentences match those cells, including the close-row Violation / Allowed pair. The article also says positions can be held from Friday to Monday, and that a fill on Saturday or Sunday counts as weekend trading.

Owner-final exceptions override the Help Centre and are not failures:

- A Strategy Risk or Risk Rule breach on a funded account is a soft breach with a reset. The locked English body says the account is not terminated or closed. That overrides the 17437285 closure sentence and the 17437388 hard-breach cell about risking more than 50% of the daily loss on one instrument. Daily and max loss remain hard breaches.
- Reset only at breakeven or in profit.
- Previous-cycle profit is not payable after a reset.
- Completed payouts are not reversed.

Article 17437215 does not say whether a Catalyst stage reset erases or keeps profit. All 13 erase/keep cases, in every review language, received the hedge and none received `catalyst_stage_reset`.

## Sealed cases

368 cases in `cases.js`, above the 250 minimum. Sealed SHA-256 of that file: `73a19a97c7c95cab79a084820dfcdae8e706ce8ba526d48720c715d22f8600ea`.

Languages: English 99, Urdu 57, Roman Urdu 52, Hindi 53, Arabic 54, Hinglish 53. The set covers worded numbers, paraphrases, mixed true/false drafts, password reset versus funded reset, crypto purchase versus withdrawal, Catalyst versus weekend, termination paraphrases, fee and timing lies in each language, Catalyst erase/keep, owner REPLY / “send this message” / FOLLOW, customer turns, a repeated question, deferred sends, pause, aiOff, replies disabled, already-replied, human teammate, early returns, postgate, and non-payout questions.

Raw grader output is `results.json` (368 ran, 185 raw passes). The recount below moves three harness mistakes out of the product totals and corrects labels where the grader’s bucket did not match the public text. The case expectations were not edited after the run.

## Adjudicated product counts

| Bucket | Count | Severity |
| --- | ---: | --- |
| Unsupported claims posted | 13 | critical |
| Wrong or incorrect approved bodies | 3 | critical |
| Suppression bypasses | 0 | critical |
| False holds | 99 | product |
| Silent drops | 1 | product |
| Over-capture | 8 | product |
| Regressions | 15 | product |
| Non-English failures (right fact or adjacent fact, wrong language) | 41 | product |
| Product failures, one primary each | 180 | |
| Harness mistakes removed from the product total | 3 | |
| Blocked side calls treated as product failures | 0 | |

Ninety-six of the 99 false holds are on Urdu, Roman Urdu, Hindi, Arabic, or Hinglish questions. Those are false holds, and they are also non-English misses. They are not added again to the 41.

Pass rate of the adjudicated set is 188 of 368. By language, raw passes were English 80/99, Urdu 25/57, Roman Urdu 26/52, Hindi 22/53, Arabic 18/54, Hinglish 14/53.

### Unsupported claims posted (13)

Eleven customer questions in Urdu or Arabic were treated as out of topic. The English lie draft was posted in full, including “Strategy risk terminates the funded account,” “The Rise fee is $5,” “Crypto arrives within one hour,” “You can reset in drawdown,” “Previous cycle profit is paid,” “A completed payout is reversed,” and the weekend and Catalyst erase/keep lies. A localized greeting was prepended. Examples:

- Urdu: `میکس لاس کی حد چھونے سے اکاؤنٹ ختم ہوتا ہے؟` (`m-daily_loss_hard-ur-1`)
- Urdu: `کیا کرپٹو فیس تین فیصد ہے اور پانچ سو سے کم کی واحد صورت ہے؟` (`m-crypto_fee-ur-1`)
- Arabic: `كم يمكنني المخاطرة على الأداة نفسها في الحساب الممول؟` (`m-instrument_cap-ar-0`)
- Arabic: `هل الأسئلة الشائعة تلغي مركز المساعدة؟` (`m-source_primary-ar-1`)
- Arabic reset price, reset location, and fee-refund questions in the same list

The detector’s Latin and script lexicon missed these paraphrases, so the guard returned the draft unchanged.

Owner path, `owner-reply-offtopic-lie`: the customer asked “How do I install MT5?” and the authorized note was `@Arsal REPLY:` followed by the termination sentence and the one-hour sentence. The public comment was those two sentences. An out-of-topic customer turn skips claim analysis, so an owner REPLY that itself contains payout claims is posted.

`measurement-omitted`: “Is instrument risk counted on the day the trade closes even if it closed in profit?” The public comment was “Risk is counted when you open the trade, not when it closes.” Article 17437285 counts the risk on the day the trade closes. That sentence is not in the lock, so the required behavior is the hedge. The false sentence was posted. The raw grader called this `wrong_body` because the sentence was outside its lie list. It is an unsupported claim.

### Wrong or incorrect approved bodies (3)

- `confuse-mt5-reset`, customer “How do I reset MT5?”. Public comment was the five funded-reset bodies (`reset_eligibility`, `reset_count`, `reset_price`, `reset_where`, `reset_previous`). The “how do I reset” rule attached a funded-account reset answer to a platform reset.
- `confuse-kyc`, customer “How do I complete KYC verification?”. Public comment was `hard_breach`, which says a hard breach ends the account and lists KYC fraud. The raw grader called this over-capture. The body answers a different question.
- `m-weekend_hold-roman-1`, customer “Kya Jumma se Peer tak position rakhna weekend add-on ke baghair allowed hai?”. Public comment was `weekend_trade` (Saturday/Sunday opening is a violation). The hold question did not receive `weekend_hold`.

### Suppression bypasses (0)

Pause, aiOff, replies disabled, already-replied, a human teammate comment after the customer, `conversation.admin.assigned`, an empty customer turn, and a fresh `conversation.user.created` all stayed silent. No lie left on those paths.

Owner REPLY and “send this message” during global pause and during aiOff still ran, and the posted text was the locked body rather than the owner’s false fee or reset-count sentence. That matches the runtime rule that an authorized note is handled while the bot is paused.

### False holds (99)

A clear question had a locked body, and the public comment was only the hedge (“I can’t confirm that. Our team will confirm.” or the localized hedge). Ninety-six are non-English paraphrases whose wording is absent from the Latin keyword list (`how many`, `kitne`, `times`, `weekend`, `fee`, and similar). Three English holds:

- “Does the FAQ override the Help Centre, or is the Help Centre primary?”
- “Does the repo FAQ override the Help Centre?”
- “Is the Catalyst reopen automatic, or done by the team within 24 hours?”

The FAQ questions match `faq` plus `override` and miss the “does not override” exception, so they hedge instead of posting `source_primary`. The Catalyst reopen wording misses `fresh`, `double the size`, and `doubles after`.

`owner-follow-urdu` is in this 99. The customer asked in Urdu how many times a funded account can be reset. The owner FOLLOW draft said “nine times.” The public comment was the hedge, not Urdu `reset_count`.

### Silent drop (1)

`retry-repeated`: the customer asked “What is the Rise withdrawal fee?” again after the same correct Rise body. `statePresend` marked the turn `DUPLICATE_REPLY` / `duplicate-suppressed`. No public comment. The poisoned rephrase (“ten dollars” and “within one hour”) was not posted. The locked Rise body was not posted either.

### Over-capture (8)

- Password reset that also says “funded” was hedged (`confuse-password-funded-word`).
- A Hinglish crypto purchase of a challenge was hedged (`confuse-crypto-buy-hinglish`).
- Hinglish hold-only question also received `weekend_trade` (`m-weekend_hold-hinglish-1`). The hold body itself was present and correct.
- Five Catalyst stage-reset questions also received `catalyst_ladder`, or received the ladder alone. The ladder’s “stage 1 has no reset” sentence is true. The extra ladder is a broader locked body than the question asked. Cases: `m-catalyst_stage_reset-en-0`, `en-1`, `roman-0`, `roman-1`, `hinglish-0`.

### Regressions (15)

Eleven clear questions were replaced by “I’ve forwarded this to a teammate who can take a closer look.” `statePresend` routed them as a missed question or a fast handoff. Five of these were labeled `wrong_body` by the grader; the public text contains no locked payout sentence. They are handoffs:

- Hindi daily-loss, crypto-fee, payout-timing, and source questions, and a Roman Urdu instrument-cap question
- Roman Urdu, Hindi, and Hinglish password-reset questions, a Hindi crypto-purchase question, the holding-time question, and the Canada question

Two MT5 install answers were rewritten from “MT5” to “the trading platform” (`confuse-mt5`, `confuse-mt5-ur`). The install instructions remained. The payout guard did not attach a payout body.

Two spread questions (`confuse-spread`, `postgate-leak-nontopic`) hit the runtime’s spread-check short circuit and posted its canned spread-test reply. That reply contains a server login and a password. The review record redacts the secret. The “according to our database” leak in the non-payout draft was not the text that went out. This path is in the existing webhook, and the patched runtime still sends it.

### Non-English failures (41)

Forty cases posted a locked fact whose language was English or Roman Urdu while the customer wrote Roman Urdu or Hinglish. The facts were the right ids. Example: Roman Urdu “daily loss / max loss is a hard breach” received the English `daily_loss_hard` body. Hinglish often received the Roman Urdu body, which is a different locked translation, not the Hinglish one. `m-catalyst_stage_reset-hinglish-1` is the forty-first: a Hinglish stage question received the English ladder. The raw grader had called that one `wrong_body`.

`fee-lie-hinglish` and `termination-paraphrase-roman` are in the 40. The false fee and the termination paraphrase were replaced, and the replacement was English.

## What held

- Owner-final strategy-risk, breakeven reset, previous-cycle profit, and completed-payout sentences were posted for the matching English asks, including owner REPLY and “send this message,” and they were not scored as Help Centre conflicts.
- Catalyst erase/keep hedged in English, Urdu, Roman Urdu, Hindi, Arabic, and Hinglish.
- Fee lies (“five dollars”) and one-hour timing lies were replaced by `rise_fee` or the hedge / `payout_timing` in the dedicated lie groups, except the Hinglish fee lie’s language miss above.
- A Catalyst question about weekend rules stayed on `catalyst_rules` and did not attach the weekend table.
- Mixed true/false drafts, worded “fifty” and “thirty,” defer-inside-window silence, defer-after-window Rise fee, model SKIP, and model ESCALATE on the Rise fee question produced the locked Rise body or the required silence.
- Postgate replacement on a Rise question that also said “according to our database” sent `rise_fee` rather than the leak.

## Harness mistakes (3)

These are not product failures.

- `suppress-human-handled` expected silence. The teammate comment is older than the customer turn. `checkSendBoundary` treats a human public reply as a takeover only when that reply is newer than the customer turn. The webhook sent the hedge, not the lie.
- `m-weekend_hold-en-1` asked both whether holding is allowed and whether closing is a violation. `weekend_hold` and `weekend_trade` together are the right pair. The case expected only `weekend_hold`.
- `both-directions` expected a hedge. The false draft “only buy trades count” was not posted. The public comment was the locked instrument-cap body. The cap’s both-directions sentence is not in the lock; posting the true cap, with no false measurement, is the allowed coverage gap.

## Blocked side calls

`api.intercom.io/admins` was blocked by the review gate. The block was recorded on 102 raw failures because those turns also touched admin lookup. The public text on those turns came from the local guard, from `statePresend`, or from the unchanged draft. The block is not counted as a product failure. Help Centre fetches to `faq.fundedelite.com` during the run: 829, all allowed. The missing `./luna-maintainer` module is caught by the runtime at load and did not change the sends.

## Verdict

NEEDS CHANGES. Thirteen unsupported claims were posted, including a full English lie on Urdu and Arabic questions and an owner REPLY lie on an MT5 install turn, and three approved bodies answered a different question (MT5 reset, KYC verification, and a Roman Urdu weekend hold). Suppression of pause, aiOff, already-replied, and a later human teammate held. The non-English lexicon still hedges or misses a large share of Urdu, Hindi, Arabic, Roman Urdu, and Hinglish paraphrases.

No merge, no approval, no deploy, and no Intercom action.
