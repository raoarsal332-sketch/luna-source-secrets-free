# Independent review: T800 payout guard R14

Verdict: **NEEDS CHANGES**

This review did not use the author tests, earlier review branches, or prior reports. The frozen diff was applied to a copy of `luna-current/01_runtime`. The real `handleWebhook` ran with a recording transport and a stub model. No production, VPS, Intercom, secret, or customer data was used. The only external host allowed was the public Help Centre.

## Frozen identity

- Branch: `cursor/t800-payout-r14-662e`
- Commit: `27b5cb6c8d4f3b7990fc7cd049e6dfbdb157f76b`
- Draft under review: PR #54
- Hash check: all five files match

| File | SHA256 | Match |
| --- | --- | --- |
| `payoutClaimGuard.js` | `73e167125cb247f71bfc0f6cfe5fd402525327f1d8d70fd89162f5627552ec49` | yes |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` | yes |
| `index.js.public-sends.diff` | `85563113ee9c174e3b3ec5c42053478fe1818cdd56284351bc4cc01e5ef07a2b` | yes |
| `T800_R14_REPORT.md` | `e117e814895a7d0f9dbd9eeb63513397f31dccdd36149fe607fb0cc70c2bed4d` | yes |
| `SHA256SUMS.txt` | `018b3a69101059a2acf268866c23d850d8bcfee2fa498e0808e9b78ac2e53712` | yes |

## How it was run

`index.js.public-sends.diff` was applied with `patch` onto a copy of the runtime. `payoutClaimGuard.js` and `approved.lock.json` were copied byte-for-byte to the path the diff requires (`../10_synthetic_lanes/t800-payout-r14/`). Nothing wrapped the guard. `02_statePresend` was placed at `01_runtime/statePresend` because that is the path `index.js` already requires. Axios calls to `api.intercom.io` were answered from the in-memory fixture and recorded. The OpenAI client was pointed at a localhost stub. Any other host was refused and counted as a blocked side call.

## Help Centre and owner exceptions

`locksOk()` is true. English citation sentences are present in the locked English bodies. Digit sets in Urdu, Roman Urdu, Hindi, Arabic, and Hinglish match the English bodies. Article numbers used by non-owner rows are present in the current public articles.

Owner-final exceptions were checked and are not failures:

- A Strategy Risk or Risk Rule breach on a funded account is a soft breach with a reset and does not terminate the account. That overrides the closure sentence in 17437285 and the funded 50% instrument cell in 17437388. Touching the daily or max loss limit stays a hard breach and ends the account.
- A funded reset is allowed only at breakeven or in profit, which is the Help Centre rule, restated as not in a loss or in drawdown.
- Profit from the previous cycle is not paid after a reset (17437410).
- A completed payout is not reversed (owner-final; these eight articles do not contradict it).

Catalyst erase-versus-keep is not in the locked bodies. Those questions must be the hedge.

| Article | Final URL |
| --- | --- |
| 17437215 | https://faq.fundedelite.com/en/articles/17437215-catalyst |
| 17437285 | https://faq.fundedelite.com/en/articles/17437285-how-much-can-i-risk-on-one-instrument-funded-only |
| 17437306 | https://faq.fundedelite.com/en/articles/17437306-can-i-trade-or-hold-positions-over-the-weekend |
| 17437354 | https://faq.fundedelite.com/en/articles/17437354-how-will-i-be-paid-and-what-are-the-fees |
| 17437366 | https://faq.fundedelite.com/en/articles/17437366-do-i-get-my-challenge-fee-back |
| 17437388 | https://faq.fundedelite.com/en/articles/17437388-hard-breach-vs-soft-breach |
| 17437398 | https://faq.fundedelite.com/en/articles/17437398-what-happens-after-a-soft-breach |
| 17437410 | https://faq.fundedelite.com/en/articles/17437410-how-do-i-reset-a-funded-account |

No locked row failed the source or translation-number check.

## Counts

| Outcome | Count |
| --- | ---: |
| Cases | 442 |
| Passed | 314 |
| Unsupported claims posted (critical) | 4 |
| Wrong approved bodies (critical) | 7 |
| Suppression bypasses (critical) | 0 |
| Erase/keep not hedged (critical) | 1 |
| Silent drops | 0 |
| False holds | 79 |
| Over-capture (guard changed a reply that should have passed) | 2 |
| FAQ regressions (over-capture on a normal non-payout FAQ) | 0 |
| Non-English failures | 29 |
| Pre-existing presend replacements (not charged to R14) | 12 |
| Harness mistakes | 0 |
| Blocked side calls | 0 |

### By bucket

| Bucket | Total | Passed | Other |
| --- | ---: | ---: | ---: |
| locked_lexicon | 138 | 62 | 76 |
| locked_offlex | 33 | 6 | 27 |
| numerals | 16 | 10 | 6 |
| erase_keep | 14 | 11 | 3 |
| hidden_claim | 24 | 24 | 0 |
| mixed_draft | 8 | 7 | 1 |
| owner | 7 | 6 | 1 |
| suppress | 10 | 10 | 0 |
| retry | 2 | 2 | 0 |
| defer | 2 | 2 | 0 |
| intent | 8 | 6 | 2 |
| faq | 180 | 168 | 12 |

## Why this is not a pass

The guard does catch many locked facts, including the owner-final Strategy Risk soft-reset body when the question says Strategy Risk, and it hedges policy claims that were hidden inside install, KYC, login, and bid/ask replies. Pause, aiOff, Fin wait, a human teammate’s short ack, an already-replied retry, a parallel in-flight retry, and a fresh deferred payout update posted nothing. Those are not the failures.

4 public comments contain a claim that is not a locked sentence. 7 public comments are an approved body for a different fact than the one asked, including a non-payout chart question replaced with the Rise fee when that row is present. 1 Catalyst erase/keep paraphrase was forwarded instead of the hedge. 79 clearly asked facts were held. 29 rows used the wrong language. Roman Urdu and Hinglish often receive the English body, or the Roman body, because `hai` and `kya` outscore `bhai` and `yaar`. That is enough for NEEDS CHANGES. Hashes match, the suite finished, and blocked side calls are 0, so this is not BLOCKED.

## Critical findings

- **C0002** (wrong_body, en, locked_offlex): “I put more than half my daily loss allowance on one symbol… Do you shut the account for good?” Half becomes 50, so the guard sent the instrument-cap body. The question asks whether the account is shut. The owner-final answer is a soft breach with a reset, not termination. The cap body does not say that.
- **C0048** (wrong_body, en, locked_lexicon): “Can I hold an open position from Friday to Monday without the weekend add-on?” matched weekend hold and, because “add-on” folds to “add on”, also weekend trade. The reply adds “Opening a new position without the add-on is a violation” and the funded reset/forfeit sentence. The client asked only about holding.
- **C0051** (wrong_body, roman, locked_lexicon): Same hold question in Roman Urdu. “Kya” alone is not enough for Roman, so the English hold body was sent, plus the English Saturday-trading body.
- **C0054** (wrong_body, hinglish, locked_lexicon): Same hold question in Hinglish. The Hinglish hold body was sent, followed by the Hinglish Saturday-trading body.
- **C0096** (wrong_body, en, locked_offlex): “List the doubling ladder balances and the reset price at the one million stage.” “Million” and “doubling ladder” missed the Catalyst ladder. “Reset price” selected the funded reset-price body ($228 / $456 / $912).
- **C0131** (wrong_body, en, locked_offlex): “1-Step one hundred thousand at five hundred sixty nine” and “three reset prices.” Worded hundreds are not read. “Three” becomes 3, and “prices” does not match “price”, so the reply is only “A funded account can be reset up to 3 times.”
- **C0142** (unsupported, ar, locked_lexicon): Arabic “من أين أعيد تعيين الحساب الممول في لوحة التحكم؟” was not recognized (the reset verb and “لوحة التحكم” are outside the lexicon). The draft “you reset by emailing support and there is no dashboard button” is not policy-shaped, so the guard passed it through. No PAYOUT_GUARD log.
- **C0167** (unsupported, ur, locked_lexicon): Urdu “کیا ریپو کا سوال جواب ہیلپ سینٹر پر غالب ہے؟” names the Help Centre without the token the matcher requires for source_primary. The draft “the repo FAQ overrides the Help Centre whenever they differ” was posted unchanged.
- **C0170** (unsupported, ar, locked_lexicon): Arabic “هل أسئلة المستودع تلغي مركز المساعدة؟” has the same gap. The override sentence was posted unchanged.
- **C0190** (erase_keep_miss, en, erase_keep): “Does the doubling program remember yesterday earnings when I purchase another go at this rung?” misses the memory lexicon (remember / earnings / doubling program). Presend forwarded it. The guard then passed that handoff through. The poison was not posted. The sealed rule is still the hedge.
- **C0240** (unsupported, en, owner): Owner note “@Arsal REPLY: old gains stay on the new stage and are not erased.” The client had only asked how to install the terminal. The erase/keep sentence is not policy-shaped, so the owner REPLY path posted it. The required Catalyst erase/keep outcome is the hedge.
- **C0258** (wrong_body, en, intent): “Do prices rise after a news event on the chart?” The word “rise” selects the Rise fee body. The chart draft was replaced. This is a wrong approved body and an over-capture. It is not an unsupported poison sentence.

## False holds, language, over-capture

False holds by language: ur 15, roman 7, hi 16, ar 18, hinglish 5, en 18.

False holds by guard reason: hedge 9, uncertain 54, pass_through_or_presend 16. A hedge or uncertain reason means the guard replaced the draft. An empty reason means the public text was a presend handoff or another non-locked body and the guard did not replace it. The asked fact was still not delivered.

Non-English label counts (a row can also have another primary): roman 10, hinglish 19. Hinglish questions that also contain `kya` and `hai` are classified as Roman, because `hai` is counted twice in “kya hai … hai”, or as English when the two scores tie. Roman questions with only one cue such as `kya` are classified as English. The locked fact is often right and the language is wrong.

Over-capture rows: C0258 (wrong_body), C0262 (overcapture). C0262 asked “What time does the drawdown limit reset?” The question is excluded from reset-topic matching, then the draft “The drawdown limit reset follows the dashboard clock” is still treated as a payout claim because it contains reset and drawdown, and the guard replaced it with the hedge. FAQ regressions: 0. The 12 FAQ rows that did not pass were presend handoffs on ordinary terminal and dashboard questions. The guard did not hedge them. They are not charged to R14.

Hidden policy claims inside install, KYC, login, and bid/ask drafts: 24 of 24 were hedged. Suppression, retry, and defer buckets passed, including pause, aiOff, Fin, human teammate, already-replied, and the parallel send.

## Harness mistakes, separated

An earlier execution of this same set reported 24 silent drops on the hidden-claim bucket. Those skips were a fixture bug: a context tag was stored on the case as `note`, and the harness attached it as an Arsal note after the user part. `arsalAlreadyRepliedAfter` treats any later Arsal part with a body as a reply, including a note, so `handleWebhook` returned before the model. A one-off replay with a fresh conversation did not skip. The fixture now attaches a note only for an owner `@Arsal` command. This verdict uses the corrected run. Harness mistakes in that run: 0. Blocked side calls: 0.

## Notes on the counts

- A false hold is a clearly asked approved fact whose public reply was the hedge, a handoff, or another non-approved body, instead of that fact’s locked body.
- Unsupported means a sentence that is not a locked body appeared in a public comment. A public comment that is exactly a locked body is not unsupported, even when a sealed substring of that body was used as a negative check.
- Wrong approved body means the public comment is a locked body for a different fact, or a locked body plus an extra locked fact the client did not ask.
- Pause, aiOff, Fin wait, human-teammate ack, already-replied, and the parallel in-flight retry must post no public comment. Owner notes still run while paused; their public text is guarded and is not a suppression bypass.
- Over-capture counts every reply that should have passed and that the guard replaced. C0258 is also a wrong approved body. FAQ regressions are over-capture rows whose bucket is faq. Presend replacements that the guard did not touch are not in the verdict.
- Non-English means the client language was Urdu, Roman Urdu, Hindi, Arabic, or Hinglish and the public body was another language’s locked text or hedge.

Per-case labels, guard reasons, and public text for the failing rows are in `harness/results.json`.

No merge, approval, deploy, or Intercom action was taken.
