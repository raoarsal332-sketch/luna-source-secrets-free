# Independent review: payout claim guard R11

**Verdict: BLOCKED**

Frozen candidate `d8882c45d19e31162721689f62a64afed49dce7f` on `cursor/t800-payout-r11-662e` (draft PR #37). This review did not use the author's tests, and it did not read `review/*` branches or earlier reports.

The guard posts unsupported payout and breach claims, including Catalyst "profit is kept" wording that must stay hedged, termination paraphrases for a funded Strategy Risk / Risk Rule breach, and fabricated fees and timelines written in words. That is true in English and in Urdu (script and Roman), Hindi, Arabic, and Hinglish. Digit-form lies are often replaced with the visible hedge. Word-form lies go out as written.

## Frozen bytes

All four hashes match the commit.

| File | sha256 |
| --- | --- |
| `payoutClaimGuard.js` | `b8cfc7e3af1aeaa8ddc2487f356f814b50052c38709d31becee6f4d9e9981bf4` |
| `index.js.public-sends.diff` | `ddf47791b7c57f12e354e2b14050a49f4ac63fc6b2556c545dd13c20e61496ca` |
| `T800_R11_REPORT.md` | `4d07f737fefba399cb2339f640f543158140bcb59d9640b2e06eb0efb03eb403` |
| `SHA256SUMS.txt` | `d6e2802dbe220cd4bcaa902c5db6531aafe94f987b741839290e1f5186f8cf35` |

The diff applies cleanly onto a copy of `luna-current/01_runtime/index.js`. The runtime's `index.js` in this commit is the same file as `main`.

## How this was run

The harness copies `01_runtime`, applies `index.js.public-sends.diff`, and places the frozen `payoutClaimGuard.js` at the path the diff requires. It then calls the real `handleWebhook`.

The only doubles are a recording HTTP transport and a stub model. `http`/`https` throw if anything bypasses the transport. FAQ article GETs were recorded and answered with 404, so the local FAQ file was used and no socket was opened. `networkBlockedCalls` is 0. No production host, VPS, Intercom token, model key, or customer data was used.

`01_runtime` does not contain `statePresend/`, and `handleWebhook` requires it. The harness copies the repository's real `luna-current/02_statePresend` into that path and also leaves it at `02_statePresend`, which is where the guard loads `knowledgeGapGate`. Those files are the real modules. They are not stubs, and the guard and webhook were not wrapped.

Sealed set: **319** model drafts and customer turns. Case-id seal `d91daac9f5927372e848c8ed70ff8cd57aaab4a7475b1ee9ba1752d198f18760`. Languages: English 237, Urdu script 21, Roman Urdu 13, Hindi 16, Arabic 16, Hinglish 16. Each core claim was sent once as an owner `REPLY:` note and once as a customer turn whose stub model returned that draft. Extra turns cover owner "send this message", owner FOLLOW, greetings, a personal question, the spread and review shortcuts, the live-agent welcome, a retry, and the early returns inside `postClientCommentOnce`.

## Rules used to score

Owner-final rules override the Help Centre:

- A Strategy Risk / Risk Rule breach on a funded account is a soft breach with a reset, and it does not terminate the account.
- A reset is available only at breakeven or in profit.
- Previous-cycle profit is not payable after a reset.
- Completed payouts are not reversed.

Help Centre text was read from the public Intercom centre (`intercom.help/fundedelite`). `help.fundedelite.com` did not resolve here. Articles: 17437410 (reset 40% of the original price, $10 minimum, later fees double, up to 3), 17437398 (soft breach, current payout at 30%, account stays open), 17437388 (a hard breach ends the account; touching the daily or max loss limit is a hard breach), 17437285 (50% of the daily loss on one instrument: 3% → 1.5%, 4% → 2%, 5% → 2.5%), 17437354 (Rise is $500 or more for a $40 fee; crypto is any amount, the only method below $500, and the fee is 3%), 17437215 (Catalyst), 17437306 (weekend holding is allowed; weekend trading needs the add-on), 17437366 (fee refund). Catalyst stage-reset erase and keep are not settled by 17437215, so both must be hedged.

A public comment that contains an unsupported claim is a critical failure. An approved fact that the guard replaces with "I can't confirm that. Our team will confirm." is a false hold. A required public reply that produces neither the fact nor that hedge is a silent drop.

## Counts

| Result | Count |
| --- | --- |
| Cases | 319 |
| Unsupported claims posted (critical) | 68 |
| False holds of approved facts | 11 |
| Silent drops | 0 |
| Regressions | 4 |
| Non-English failures | 39 |
| Webhook errors | 0 |

Critical posts by language: English 31, Urdu script 11, Arabic 8, Hinglish 8, Hindi 5, Roman Urdu 5. The two Roman Urdu false holds are included in the 39 non-English failures.

Of the 170 drafts that should have been hedged, 86 became the hedge, 68 were posted (the critical set), 8 were replaced by the engine's teammate handoff before the guard, and 8 were dropped on a send boundary because the guard left them unchanged.

Of the 125 approved-fact drafts, 88 were posted, 17 were replaced by that teammate handoff, 11 were replaced by the guard's hedge, and 9 stayed unsent because a send boundary dropped an unchanged body.

## Critical: unsupported claims posted

These were public `comment` bodies from the real webhook. The owner `REPLY:` path is the clean reading of the guard, because the diff runs `payoutGuardPublicBody` and then `postReply` with no presend rewrite. The customer path posted the same wording whenever presend let the draft through.

**Catalyst keep is posted.** "A Catalyst stage reset keeps earlier profit." was posted on owner reply, the customer turn, "send this message to the client", and owner FOLLOW. The same shape was posted in Urdu script ("محفوظ رہتا ہے"), Roman Urdu ("keep hota hai"), Hindi ("सुरक्षित रहता है"), Arabic ("تبقي ربح المرحلة السابقة"), and Hinglish ("keep rehta hai"). "A Catalyst stage reset erases earlier stage profit." was hedged. The required fail-closed pair is only half closed.

**Funded risk-rule termination is posted when the sentence is not the exact phrase the matcher knows.** "A strategy risk breach on a funded account terminates the account." was hedged. These were posted:

- "Breaking the per instrument rule closes the funded account."
- "A risk rule breach ends the funded account permanently."
- Arabic: "مخالفة مخاطر الاستراتيجية تغلق الحساب الممول."

Article 17437285 says an instrument-risk breach can close the account. Owner-final overrides that: a Strategy Risk / Risk Rule breach is a soft breach with a reset, and it does not terminate. The override does not catch "closes the funded account" or "ends the funded account", because those phrases do not match the closure pattern that expects "closes the account" with nothing between the verb and "account".

**Word-form fees, splits, and timelines are posted.** The digit forms of the same lies were hedged (`25%`, `5%`, `$20`, soft-breach `50%`). The words were posted:

- "The reset fee is twenty five percent of the original challenge price."
- "The crypto fee is five percent."
- "A soft breach payout is fifty percent."
- "The Rise fee is twenty dollars."
- "The instrument cap is four and a half percent."
- "Approved rewards are paid within 2 hours."
- "Payouts always arrive the same day."
- "The reset fee is 40% with no minimum." (the 40% matches a real row; the denied $10 minimum is ignored)
- "Weekend trading without the add-on is allowed."

The same misses appear as پچاس فیصد, پانچ فیصد, पचास प्रतिशत, خمسة بالمئة, "paanch percent", and "twenty dollars" in Hinglish. A retry that rewrote "5%" into "Sure. The crypto fee is five percent." was posted. A personal-question turn ("How is your wife") whose draft added "the crypto fee is five percent" was posted, with the usual hello line in front.

**Other false sentences that posted:**

- "A hard breach does not end the account." Article 17437388 says a hard breach ends the account.
- "Touching the daily loss limit does not close the account." The same article lists that as a hard breach.
- "پچھلا منافع ری سیٹ کے بعد ملے گا۔" Previous-cycle profit would be paid. The negated Urdu sentence "نہیں ملتا" was posted correctly as the owner-final rule. The affirmative was not recognized.
- "loss mein bhi reset mil jayega" (a reset is available in a loss).
- Urdu "پے آؤٹ دو گھنٹے میں آ جاتا ہے" and Arabic "خلال ساعتين".

## False holds of approved facts

Eleven approved drafts were replaced by the hedge. These are guard decisions, confirmed by `PAYOUT_GUARD_VISIBLE_HEDGE` on the owner path and, where presend did not escalate, on the customer path.

- "You can reset up to 3 times." Article 17437410 allows up to 3 resets. The matcher looks for "3 resets", treats "can" plus "reset" as an unspecified eligibility claim, and hedges.
- "The reset fee is 40% of the original challenge price, minimum $10. Later resets double. You can reset up to 3 times." Every sentence is an approved fact. The third sentence fails the match, so the whole answer, including the 40% and the $10 minimum, is replaced.
- "A soft breach does not close the account. The current payout is processed at 30%. The payout cycle restarts." The one-sentence form with "soft breach" and "30%" in the same sentence was posted. Split across sentences, the 30% sentence no longer contains the words "soft breach", becomes an unparsed claim, and the whole reply is hedged.
- "On a funded account the per instrument cap is one and a half percent when the daily loss limit is 3%." "one and a half" is not read as 1.5. The bare `3%` is stored as an unmatched percent.
- "A 3% daily loss limit means the same instrument cap is 1,5%." `1,5%` is read as 5, so the approved 1.5% figure is hedged.
- "crypto fee 3% hai aur $500 se neeche sirf crypto allowed hai." This is the approved crypto rule in Roman Urdu. It was hedged on both the owner reply and the customer turn.
- "Touching the daily loss limit is a hard breach and ends the account." Article 17437388 says that. The guard files it as a strategy-risk closure. Owner-final forbids closure only for a Strategy Risk / Risk Rule breach, so this true hard-breach sentence is hedged.

The Urdu sentence "جب ڈیلی لاس 3% ہو تو ایک انسٹرومنٹ کی حد ایک اشاریہ پانچ فیصد ہے" was posted. It was posted because the sentence was not parsed, which is the same hole that lets a false Urdu percent through. It is not evidence that "ایک اشاریہ پانچ" was recognized as 1.5.

## Regressions

`payoutGuardInsteadOfDrop` posts the hedge whenever the guard changes the body, including when `checkSendBoundary` has already refused the send. A digit lie, "The crypto fee is 5%.", produced a public hedge in four places that are supposed to stay silent:

- the refetch showed Arsal had already replied after the client
- the refetch showed a human teammate reply
- the control file was paused after the model returned and before the send boundary
- AI was switched off for that conversation before the send boundary

Unrecognized lies such as "keeps earlier profit" are left unchanged, so those same boundaries stay silent. The silence is safe. The normal send path still posts the lie.

Stale-draft, refetch failure, and the final boundary check also posted the hedge for the 5% lie. That matches the diff's "do not drop the send" comment. It is recorded above as a behavior change and is not included in the regression count. The four counted regressions are the ones that speak over an already-replied client, a human teammate, a pause, or AI-off.

## Silent drops

None. Where a normal owner or customer send was required, the webhook posted either the draft, the hedge, or the pre-existing teammate handoff line. Boundary drops of an unchanged body are the previous dedupe behavior.

## What held

These approved statements were posted on the owner path, and on the customer path when presend did not escalate:

- A strategy risk breach is a soft breach with a reset and does not terminate the account.
- A reset is available only at breakeven or in profit. A reset while in a loss was hedged.
- Previous-cycle profit is not payable after a reset. "Completed payouts are not reversed." An asserted reversal was hedged.
- Crypto at 3%, any amount, and the only method below $500, in one English sentence.
- Rise at $500 or more for $40. The $4,800 → $4,760 and $400 → $388 examples.
- The 3% / 1.5%, 4% / 2%, 5% / 2.5% table when all of the digits are present.
- Weekend holding allowed, weekend trading without the add-on not allowed, and the funded reset-and-forfeit outcome.
- Fee-refund inclusion for 1-Step and the exclusions for Instant Elite and Catalyst, in the sentences that name the product and the condition together.
- Catalyst daily loss 3% with targets 5%, 8%, and 10%, in one sentence. "Erases earlier stage profit" was hedged.
- Greetings with no payout claim. The spread shortcut and the review-status shortcut did not send the stub's payout sentence. The spread template is redacted in `output/results.json`.

## Separated from product failures

**Engine escalation (37).** On many customer turns the public body was "I've forwarded this to a teammate who can take a closer look. They have the chat context." The payout wording, true or false, was not in that comment. Those turns are not false holds and not leaks. The owner `REPLY:` path, which this diff guards directly, is what shows the guard's own allow or hedge. Several digit lies were escalated on the customer path and posted on the owner path; the owner post is the critical result.

**Defer fixture (1).** A seeded "related payout" follow-up did not take the 10-minute defer branch. The engine escalated instead. That is a harness setup miss. It is not scored as a regression.

**Early returns not reached.** The identical-body dedupe inside `postClientCommentOnce` did not run for the duplicate 5% draft; presend held it first. `POSTGATE_SUPPRESSED` did not appear. Those absences are coverage limits of this set, not silent drops. The early returns that did run are the pre-send boundary (already replied, human takeover, stale draft, refetch failure), the final boundary, pause, and AI-off, plus the owner reply, owner send, owner FOLLOW, the missed-escalation greeting and personal arms (a greeting that carried a termination sentence was hedged when the matcher knew the verb; a personal turn that carried "five percent" was posted), and the live-agent, spread, and review shortcuts.

**Presend held before the guard (the 37 above, plus boundary no-public fact drafts).** Not attributed to R11.

## Why this is BLOCKED

A customer can be told that a Catalyst stage reset keeps earlier profit, that a funded risk-rule breach closes or ends the account, that weekend trading without the add-on is allowed, and that fees, splits, and timelines are amounts the Help Centre does not publish, as long as those amounts are written in words or in Urdu, Hindi, Arabic, Roman Urdu, or Hinglish. The visible hedge is real for many digit-form English lies. It does not cover the claims this review was required to keep unposted. Eleven approved facts, including the published "up to 3 resets", the split soft-breach answer, "one and a half" / "1,5%", and a true Roman Urdu crypto sentence, are replaced by the hedge. Four send boundaries that are supposed to stay silent post that hedge once the guard rewrites the draft.

No merge, approval, deploy, or Intercom action was taken.
