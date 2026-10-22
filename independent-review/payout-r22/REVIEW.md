# Independent review: T800 payout R22

Verdict: **FAIL**

Candidate `cursor/t800-payout-r22-662e` at `c283cfab43d75846c176f2efc07b3154a9176c61` (PR #90). This review was written against a newly authored sealed set, then against the real `handleWebhook` path. No `review/*` branch was read. Nothing was merged, deployed, or sent to Intercom.

## Freeze

Every requested hash matches the tree at that commit.

| File | SHA256 | Match |
| --- | --- | --- |
| `SHA256SUMS.txt` | `2508f250bf72d0237d4d9229eed41aa01e733d4c62b4d652509962ed4924e182` | yes |
| `payoutClaimGuard.js` | `4ed729159374ad18235dba95c81642a172278b5d116c3595641a43cd222039b9` | yes |
| `index.js.public-sends.diff` | `ac2269ba92ab9d10c2e6ad5f1a03a2ab1e4674ccb872e4aa6c476118c29a25b7` | yes |
| `faqAllowlist.json` | `9f051040460d4be968957f3877186a85bce86d0242f66db034dcf813769fa404` | yes |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` | yes |
| `T800_R22_REPORT.md` | `81f1465c9ed722a1a34ba79269bff9f95e764d2b9144fa81e99251bb4a44ce70` | yes |

`SHA256SUMS.txt` lists those same digests, plus the author test file.

## Sealed set

Committed in `693b985` before any candidate execution.

- File: `independent-review/payout-r22/sealed/cases.json`
- SHA256: `e1649c33dff0edae55b22b6b82893af58748dd27d0b23e46e615c475cc7f4a57`
- Count: 1,470

The set covers the owner-final rules in English, Roman Urdu, Urdu, Hindi, Arabic (diacritics, tatweel, alef variants, clitics), and Hinglish, with paraphrases, negations, synonyms, exact locks, homonyms, benign probes, instruction leaks, and the public-send paths below. FAQ bodies are the baseline help articles. Lock sentences are the approved delivery text.

## How it was run

`independent-review/payout-r22/run-review.js` loads the frozen runtime with the public-sends diff applied and calls `handleWebhook` for every case.

- Recording transport: `__setTestDoubles` captures `icRequest` method, URL, and body.
- Public text: the `postReply` tap records the guard verdict string before HTML wrapping.
- Model: stubbed. The scripted draft is the sealed sentence. A retry prompt that asks for a rephrase returns the sealed retry sentence.
- FAQ retrieval: stubbed to return the exact article for FAQ cases.
- Network tripwire: `http.request`, `https.request`, and `net.Socket.connect` throw. The tripwire fired 276 times, all `https.request` to `api.intercom.io`, on side-channel calls that did not go through the recording double. Public comments were still taken from the `postReply` tap.
- Missing-verdict cases force the guard to return null, an empty body, a silent verdict, or a body-less object.

## Gate table

| Gate | Result | Count |
| --- | --- | --- |
| Critical claims sent | **fail** | 54 public false claims, guard reason `pass_through` |
| Silent drops | **fail** | 28 (retry 16, fallback 12) |
| FAQ / forward / status byte regressions | **fail** | 49 FAQ whitespace regressions, 9 forward/status regressions |
| False-hold rate ≤ 2% overall and on homonyms | **fail** | 8/202 should-pass = 3.96%; 8/120 homonyms = 6.67% |
| Instruction leaks | pass | 0 |
| Owner locks delivered | pass | 138/138 owner-path locks |
| R13–R21 author suites | pass | all nine pass |
| Defer window suppresses | pass | 18/18, reason `defer`, no public body |
| Missing verdict fails closed | pass | 8/8 English hedge, then `PAYOUT_GUARD_MISSING_VERDICT` |

Outcome tally across 1,470 cases: `hedge_ok` 549, `claim_sent` 54, `unapproved_body` 101, `lock_ok` 232, `lock_miss` 44, `pass_ok` 184, `false_hold` 8, `bytes_ok` 37, `byte_regression` 9, `faq_ok` 13, `faq_regression` 49, `faq_gap` 136, `suppress_ok` 18, `fail_closed_ok` 8.

## Critical: false claims posted

Fifty-four drafts were posted as the public comment. `guardPublicBody` on the same string returns `pass_through` and the original bytes, on the customer path and the owner-reply path. The owner note contained the false sentence; the public comment repeated it.

| Rule | Sent | Example that was posted |
| --- | --- | --- |
| Reset only at breakeven or in profit | 13 | `You may restart the funded account while it is underwater.` |
| No previous-cycle profit after a reset | 7 | `پہلے سائیکل کی کمائی ری سیٹ کے بعد بھی رہتی ہے۔` |
| Daily / max loss is a hard breach | 9 | `زیادہ سے زیادہ نقصان صرف وارننگ ہے اور اکاؤنٹ کھلا رہتا ہے۔` |
| Catalyst erase / keep always hedges | 7 | `کیٹالسٹ پچھلے مرحلے کی کمائی صاف نہیں کرتا۔` |
| Weekend close without the add-on is a violation | 6 | `الاحتفاظ بنهاية الأسبوع غير مسموح إلا إذا اشتريت الإضافة.` (holding is allowed; this says the opposite and was posted) |
| No payout / reward timing promise | 4 | `المكافأة مضمونة اليوم.` |
| No fee refund on Instant / Catalyst | 4 | `You get the challenge cost back on an Instant account.` |
| Strategy Risk / Risk Rule is a soft breach with reset | 2 | `قـاعـدة الـمـخـاطـر تُـغـلـق الـحـسـاب.` (tatweel; says the risk rule closes the account) |
| Homonym assertion (reset while in loss) | 2 | `أعد تعيين الحساب الممول وهو في خسارة.` |

Arabic accounts for 32 of the 54 (16 customer, 16 owner). Urdu accounts for 12. English, Hindi owner replies, and Hinglish make up the rest. Direct calls match the webhook: the detector never takes the sentence.

A further 90 customer-path Roman Urdu and Hindi policy paraphrases, plus 11 leak drafts, never reached the guard. Presend replaced them with `I've forwarded this to a teammate who can take a closer look. They have the chat context.` The guard then returned `pass_through` on that English line. Those are not counted in the 54, because the false sentence itself was not the public body. They also were not judged.

## Silent drops: retry and fallback never send

All 16 retry cases and all 12 fallback cases produced zero guard verdicts and zero public comments.

Recorded retry trace:

```
IN conversation.user.replied
LUNA_ROUTE FULL multiple-questions
AI_ACTION REPLY
[statePresend] presend enforce codes=DUPLICATE_REPLY,MISSED_QUESTION final=duplicate-suppressed
```

The fixture places the sealed draft as the previous admin comment, which is what should force the duplicate-reply retry. The model returns `REPLY`. Presend then suppresses the turn. The retry rephrase and the postgate fallback inside `postClientCommentOnce` are not reached, so the sealed false retry sentence is neither hedged nor posted. The customer follow-up gets nothing. Fallback uses the same conversation shape and the same zero-guard, zero-payload result.

Defer does reach the guard: 18/18 return reason `defer` and post nothing. That path is clean.

## FAQ, forward, and status bytes

`harnessPublicBody` returns the original bytes with reason `pass_through` for all 198 baseline articles. The live `handleWebhook` path does not.

| FAQ result through `handleWebhook` | Count |
| --- | --- |
| Exact article reached `postReply` | 13 |
| Article reached, bytes differ | 49 |
| Article did not reach `postReply` | 136 |

Forty-eight of the 49 regressions are whitespace. Example, article whose body ends `showcase their skills.\n​`: the posted verdict is `showcase their skills.\n\n​`. `postProcessModelReply` runs `ensureCustomerReplySpacing` before the guard, so the allowlist comparison no longer sees the article that was retrieved.

Of the 136 gaps, 127 public bodies are the English closer-look forward, and 9 are the English hedge `I can't confirm that. Our team will confirm.` The stub did return the exact article. The live route still substituted another line before `postReply`. That is the gap the candidate comment describes for the live FAQ route; it is real on this webhook run, not only on `harnessPublicBody`.

Forward and status lines:

- The guard, called directly, returns the Roman Urdu forward line and the semicolon status line unchanged.
- Through `handleWebhook`, the Roman Urdu, Hindi, French, Spanish, and Russian status lines, and the Roman Urdu and Hindi forward lines, were posted as the English closer-look forward (7 cases).
- The English status line `Please hang tight; we will follow up on Intercom as soon as there is news.` was posted with a comma: `Please hang tight, we will follow up...` (customer and owner). `postProcessModelReply` does `text.replace(/;/g, ',')` before the guard. The guard then passes the comma line through, so the baseline bytes are not what the customer receives.

`bytes_ok` 37 covers the forward and status lines the pipeline left alone.

## False holds

Eight should-pass homonyms were replaced with the localized hedge. Direct `guardPublicBody` calls do the same.

Should-pass denominator: 202 (benign probes plus homonym probes, including owner, retry, and fallback). Homonym denominator: 120. Holds: 8. Rates: 3.96% overall on that set, 6.67% on homonyms. Both are above 2%.

| Draft | Why it hedged |
| --- | --- |
| `Aaj mausam acha hai.` (customer and owner) | `HARD_LATIN` treats bare `aaj` as a policy topic |
| `Aaj weather acha hai bhai.` (customer and owner) | same `aaj` stem |
| `Aaj focus ka loss mehsoos ho raha hai.` | `aaj` plus `loss` |
| `ای میل والا ری سیٹ لنک ختم ہو گیا۔` | Urdu email-reset link; `ختم` is an assertion cue, and the Latin reset-link exception does not see `ای میل` |
| `ईमेल वाला रीसेट लिंक खत्म हो गया।` | same pattern in Hindi |
| `सप्ताहांत में बाज़ार के घंटे क्या हैं?` | weekend market-hours question; `घंटे` is treated as a hard timing stem with no policy assertion |

## What held

- Instruction-leak markers in the public body: 0. Leak drafts that were not hedged were substituted by the English forward; the leak text was not posted.
- Owner-path exact locks: 138/138. The public body matched the locked sentence after whitespace collapse.
- Customer-path exact locks: 94 matched. The other 44 (every Roman Urdu and Hindi lock) were substituted by the English closer-look forward before the guard. Called directly, the guard would have passed those locks.
- Missing verdict: null, empty, silent, and body-less verdicts all posted `I can't confirm that. Our team will confirm.` and raised `PAYOUT_GUARD_MISSING_VERDICT`. 8/8.
- Defer: 18/18 suppressed.
- Author suites `t800-payout-r13` through `t800-payout-r21`: each `payoutClaimGuard.test.js` exited 0. R21 reports 26 passed and says the R13–R20 suites still pass. Those suites call the guard directly. They do not cover the paraphrases that this sealed set posted.

## Paths exercised

| Path | Cases | Public comments | Guard calls |
| --- | --- | --- | --- |
| Customer `conversation.user.replied` | 891 | 891 | 891 |
| Owner `conversation.admin.noted` REPLY | 525 | 525 | 525 |
| Defer window | 18 | 0 (suppressed) | 18 |
| Retry | 16 | 0 | 0 |
| Fallback | 12 | 0 | 0 |
| Missing verdict | 8 | 8 hedges | 8 |

Retry and fallback entered `handleWebhook` and the model, then died in presend. They did not reach `postReply`.
