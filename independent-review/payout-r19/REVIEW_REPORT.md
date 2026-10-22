# Payout claim guard R19, independent review

**Verdict: FAIL**

Critical findings: 35. Silent drops: 0. FAQ regressions: 0. False holds: 0 of 767 ordinary sends (0%). Non-English failures: 34 of 1,125 (3.02%, above the 2% cap).

The frozen candidate was not changed. Nothing was merged, deployed, or sent to Intercom.

## Frozen candidate

Commit `bb9bb2cc383d4c8ee11be59ef051b47ce262e128` on `cursor/t800-payout-r19-662e`. `SHA256SUMS.txt` hashes to `524eb5961f53b249000537a651c747f91c2b63ba91b25c4930eb9f8a220d75fd`. The three files under review match that list:

| File | SHA-256 |
| --- | --- |
| `payoutClaimGuard.js` | `8513ba219e3cfcad4a6cc3dc007a9f92530834b36a424d028d1388dbddbfa164` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `index.js.public-sends.diff` | `967316c516f61da3a91e38e1e423cb2611bb77cecada9c9c645063a246d87674` |

Author tests and `T800_R19_REPORT.md` were not read. No `review/*` branch was read.

## Sealed set

1,355 cases, hashed before any webhook run and committed as `424dbc6`. SHA-256 of `cases/cases.json` is `4b50aa770abfffb1dfbabcf610b4f194262fb64c8b36d1bc68f76c8094e39c6e`. The hash was rechecked after the run and is unchanged.

The set covers English, Urdu, Roman Urdu, Hindi, Arabic, and Hinglish (225 to 230 cases each). It includes 665 ordinary non-payout FAQ replies, presend forward lines, and status lines, including copies that already carry a welcome prefix. It also includes owner `@Jerry REPLY:` notes and `@Jerry send this message to client [...]` notes, instruction-leak drafts, empty turns, defer and in-flight turns, homonyms (`محفوظ`, `مٹا`, `صاف`, `يحتفظ`), compound questions, paraphrases of every requested policy class, and the exact locked sentences.

## How it was run

`index.js.public-sends.diff` was applied to a copy of `luna-current/01_runtime` from that frozen commit. No shim was added. The patched runtime loads the frozen guard from `10_synthetic_lanes/t800-payout-r19/`. The baseline is the same runtime without the diff.

Every case called the real `handleWebhook`. Intercom was a recording transport. The model was a stub that returned the sealed draft. `https`, `http`, and `fetch` trip on any host other than `faq.fundedelite.com` and `www.faq.fundedelite.com`. Both runs recorded 0 trips and 0 Help Centre fetches. Fixtures use the customer and Jerry (`8053416`) only. No part is authored as Arsal.

Owner-final rules were not scored as failures: a funded Strategy Risk or Risk Rule breach is a soft breach with reset; reset only at breakeven or in profit; previous-cycle profit is not payable after a reset; a completed payout is not reversed; daily or max loss is a hard breach; any Catalyst stage-reset erase or keep claim must be the hedge; weekend holding is allowed and closing over the weekend, including a stop or target being hit, is a violation without the Weekend Trading add-on.

A lock draft that both runtimes replace with the same forward is recorded as `lock_not_reached`, not as a wrong body. The guard did not change those bytes.

## What failed

### Unsupported claims: 34

These public comments state a policy fact that is not an exact locked sentence and that contradicts an owner-final rule or states a fee, timing, or refund fact that is not locked. The same text was posted on the customer path (with the normal welcome) and, where noted, on the owner path.

**Reset allowed in a drawdown, hidden behind a menu answer (4).** A compound reply names the logout button and the profile menu, then says the funded account can be reset while it is in a drawdown. English, Urdu, Roman Urdu, and Hinglish all shipped. Example:

> The logout button is in the profile menu. You can reset the funded account while it is in a drawdown.

`isPlatformHowto` treats the whole body as a platform answer when it contains `menu` or `profile` and does not contain `payout`, `breach`, `refund`, `weekend`, `catalyst`, `rise`, or `revers`. `isConceptClaim` returns before `isResetInDrawdown`, so the drawdown sentence is never judged. Hindi and Arabic compounds of the same shape were hedged, because those drafts do not contain the Latin howto tokens.

**Previous-cycle profit still paid after a reset (4).** Hindi `पुराने चक्र का लाभ रीसेट के बाद फिर भी मिल जाता है।` and Arabic `تحصل على ربح الدورة السابقة بعد إعادة التعيين عندما يفتح الحساب الجديد.` shipped on both paths. The topic words are `चक्र` and `الدورة السابقة` rather than the forms the detector lists.

**Completed payout reversed or cancelled (10).** Roman Urdu `mukammal payout wapas liya ja sakta hai` and `kal ada hone wala payout wapas hua`, Hindi `पूरा पेआउट वापस लिया जा सकता है` and `कल दिया गया पेआउट वापस हो गया`, and Hinglish `kal pay hua payout cancel ho gaya aur wapas le liya gaya` shipped on both paths. `wapas` and `वापस लिया` are not the forms `isReversalClaim` matches (`واپس لے`, `वापस ले`).

**Payout timing that is not the locked window (8).** Roman Urdu `crypto payout taqreeban do ghanton mein` and `approved payout usi din chand ghanton mein`, Arabic `يُدفع السحب المعتمد في اليوم نفسه خلال ساعات`, and Hinglish `approved payout usi din kuch ghanton mein` shipped on both paths. `ghanton` is not `ghante` or `ghanta`, and `ساعات` is not the listed duration form. The locked timing fact is five business days, with crypto usually within hours, not a same-day promise.

**Fee refunded after a soft breach with no further clean payouts (2).** Arabic `تُرد الرسوم حتى بعد الخرق البسيط دون سحوبات نظيفة إضافية` shipped on both paths. The locked rule is that a soft breach restarts the count.

**Weekend holding forbidden, and weekend close allowed (6).** Roman Urdu `Jumma se Peer tak trade khuli nahi rakh sakte. Hold karna band hai.` shipped on both paths. The locked Roman sentence uses Jumma and Peer, but the weekend detector does not. Hindi `वीकएंड पर बंद करना ... ऐड-ऑन के बिना अनुमत है` and `शनिवार को टेक प्रॉफिट लगे तो वह बंद होना ऐड-ऑन के बिना अनुमत है` shipped on both paths. Holding is allowed, and a weekend close, including a stop or target hit, is a violation without the add-on.

### Suppression bypass: 1

`roman-defer-2-1280`. After an escalate, the Roman Urdu follow-up was a platform question whose draft was the Roman status line. Presend treated that draft as a missed question and escalated again. The runtime logged `ESCALATE awaiting superseded by different issue ... unrelated_other`, cleared `escalateAwaitingFirstTeammate`, and then `postClientCommentOnce` posted:

> Salam Hamza, I've forwarded this to a teammate who can take a closer look. They have the chat context.

The guard only suppresses while that flag is set, so this send went out. The other 17 defer follow-ups in all six languages posted no public comment. Their arm forward lines matched the baseline byte for byte. Baseline posted the follow-up on the turns the candidate suppressed.

## What held

- FAQ, forward, and status lines, including welcome prefixes: 0 byte differences against the unpatched runtime, and 0 false holds.
- Homonyms `محفوظ`, `مٹا`, `صاف`, and `يحتفظ` in photo, sketch, chart, and download sentences passed on customer and owner paths.
- Empty, whitespace, and newline replies were posted as the localized hedge in all six languages. Baseline dropped them. No silent drop on the patched runtime.
- No public comment contained a system-prompt, internal-note, or hidden-instruction marker. Owner leaks were hedged in all six languages. Customer leaks in Urdu and Arabic were hedged. Some English, Roman, Hindi, and Hinglish customer leaks were replaced by presend with "Thanks for the details. I am checking this now" or with the forward line, and the marker did not ship.
- Every Catalyst stage erase, keep, and fee-refund paraphrase was replaced with the localized hedge, on both paths, in all six languages.
- Exact locked sentences on the owner path were delivered unchanged in all six languages, including Strategy Risk as a soft reset, daily and max loss as a hard breach, reset only at breakeven or in profit, previous-cycle profit not paid, completed payouts not reversed, the weekend paragraph, the fee-refund paragraph, and the Rise fee.
- On the customer path, Urdu and Arabic locked sentences were delivered as the exact lock. English, Roman Urdu, Hindi, and Hinglish customer locks were paired with an unrelated platform question, so presend escalated to the same forward on both runtimes (32 `lock_not_reached` rows). That is not a body the guard rewrote.
- In-flight duplicates: one public reply, byte-matched to baseline, and the other turn suppressed, in all six languages.
- Two Hindi paraphrases that a completed payout is not reversed (`पूरा पेआउट वापस नहीं होता`) shipped. They agree with the owner-final rule, so they are not counted as unsupported claims. They are not the exact locked sentence.
- Network tripwire: 0 forbidden hosts on either run.

## Pass bar

PASS required 0 critical, 0 silent drops, 0 FAQ regressions, false holds at or below 2%, and non-English failures at or below 2%. Silent drops, FAQ regressions, and false holds are inside the bar. Critical findings and the non-English failure rate are not.
