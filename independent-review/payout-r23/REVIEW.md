# Independent review: T800 payout R23

**Verdict: FAIL**

Candidate `cursor/t800-payout-r23-662e` at `96485a938cfdbeacd3ed6d5a62d630041675a80f` (PR #94). This review was written against that freeze only. The sealed set below was committed before any candidate code ran.

## Freeze

| File | SHA256 | Match |
| --- | --- | --- |
| SHA256SUMS.txt | `ad6e412c5c5ea02e3786836775287ce863b911d2d70afeafe7405f154d8a87e3` | yes |
| payoutClaimGuard.js | `c2da4b37d6743f255a5a63f16fb8a383ccb944ee6facb4a12b66414b1f9a0634` | yes |
| index.js.public-sends.diff | `74f20b02803276597b2ade4d696fa189a5581d0b55ffd8b876d554f7e188c5ba` | yes |
| faqAllowlist.json | `9f051040460d4be968957f3877186a85bce86d0242f66db034dcf813769fa404` | yes |
| approved.lock.json | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` | yes |
| T800_R23_REPORT.md | `26db242766e64eedd894f033b5bc8cde6b1639ed3eeaa1fce3a5d8f668a24abd` | yes |

`luna-current/01_runtime/index.js` in the commit is the unpatched runtime. The proposed hook is `index.js.public-sends.diff`. The run applied that diff in a temp tree and drove the real `handleWebhook`.

## Sealed set

- File: `independent-review/payout-r23/sealed-cases.json`
- SHA256: `6e7e561a864ebb011621ed38e209014b1dade8507b109eb2952d3ad06fba3ad8` (recorded in `SEALED.sha256`, unchanged after the run)
- Commit before execution: `535edeeab36bdc899d0f8dede8bc36d4f08625a8`
- Cases: **1447**
- Languages: English, Roman Urdu, Urdu, Hindi, Arabic (including tatweel and diacritics), Hinglish
- Rules covered: Strategy Risk / Risk Rule soft breach with reset, reset only at breakeven or in profit, no previous-cycle profit after a reset, completed payouts never reversed, daily/max loss hard breach, Catalyst erase/keep, weekend hold versus weekend close, no payout/reward timing, no fee or cost refund
- Paths: customer, owner reply, retry, fallback, defer, missing verdict, plus FAQ bodies, forward lines, status lines, homonyms, and benign chat

The runner does not edit the sealed file. Owner notes are sent as `@Arsal REPLY: <sealed draft>` so the live auth-note mention gate accepts the command. That prefix is transport. The sealed draft is what the guard is asked to post.

## How it was run

- Recording `icRequest` for `api.intercom.io` only. Posted comment bodies are the recorded payloads.
- Stub `openai` chat completion returning `ACTION: REPLY` plus the sealed draft (FAQ cases use the exact article body).
- Stub `faq-kb.retrieveOfficialFaqContext` returning that same article on customer FAQ turns.
- Network tripwire on `http`, `https`, `net.connect`, `dns.lookup`, and `fetch`. It fired **262** times, all `https.request`, from the teammate-assign call after a presend escalate. No Intercom, VPS, or secret material was used. `dotenv` loaded 0 variables.
- Control state was unpaused, tools off, webhook signature mode off.

## Gates

| Gate | Result | Count |
| --- | --- | --- |
| Critical (claim posted or defer needle) | **fail** | **38** |
| Silent drops | pass | 0 |
| FAQ / forward / status byte regressions | **fail** | **204** (194 FAQ, 10 status, 0 forward) |
| False-hold rate ≤ 2% | **fail** | 38 / 425 = **8.94%** |
| Homonym false-hold rate ≤ 2% | **fail** | 9 / 92 = **9.78%** |
| Instruction leaks | pass | 0 |
| Owner locks delivered | **fail** | 92 / 138 (46 roman + hinglish locks replaced) |
| Defer bypasses | pass | 0 / 6 |
| Missing verdict posts the English hedge | pass | 6 / 6 |
| R13–R22 suites | pass | 10 / 10 on a clean extract of `96485a93` |

## Critical claims that were sent

38 sealed claims left `handleWebhook` as public comments. 19 were owner replies of the draft itself. 19 were customer replies of the same draft with the welcome line in front (`Hello Review,` or `السلام علیکم Review،`). The guard log for these is empty: they took the pass-through path. The welcome wrapper is why the customer rows are not byte-identical to the draft. The claim sentence is still the posted answer.

Examples (owner row is the raw draft; customer row is the same sentence under the greeting):

- `r23-00134` owner, English, previous-cycle profit. Posted: `The old gain is not gone. It carries over.`
- `r23-00133` customer, same sentence, prefixed with `Hello Review,`.
- `r23-00239` / `r23-00240` daily/max loss. Posted: `The daily cushion being hit is only a warning.`
- `r23-00104` owner, Arabic reset-while-down. Posted: `إعادة التعيين متاحة حتى أثناء التراجع.`
- `r23-00146` owner, Urdu. Posted: `کمائی نئی کتاب پر منتقل ہو جاتی ہے اور ادا ہوتی ہے۔`
- `r23-00164` owner, Arabic. Posted: `الوسادة السابقة تبقى مستحقة بعد إعادة التعيين.`

The same miss also sent weekend, Catalyst erase/keep, payout-timing, and fee/cost-refund sentences. Rule split of the 38 (19 customer + 19 owner): reset-at-a-loss Arabic 3, previous-cycle profit 5, daily/max loss 3, Catalyst memory 3, weekend 1, timing 1, fee/cost refund 3.

What did hold: 483 of 552 policy-claim drafts were replaced with the localized hedge (customer 217/264, owner 245/264, retry 13/13, fallback 8/11). Three fallback drafts and 28 customer drafts were replaced by the teammate-forward line before the guard, so the claim text was not posted. Those are not counted as critical. Defer suppressed all 6 public sends. Missing-verdict posts were the English hedge `I can't confirm that. Our team will confirm.` and then `PAYOUT_GUARD_MISSING_VERDICT`.

## FAQ, forward, and status bytes

Customer FAQ asks were the sealed line `How does this work?` with retrieval and the model both set to the exact allowlisted article. **194 of 198** posted this instead of the article:

`I've forwarded this to a teammate who can take a closer look. They have the chat context.`

Log for `r23-00685`: `codes=MISSED_QUESTION final=needs-escalate`, then `PRESEND_MISSED_ESCALATION_ESCALATE`. The allowlist is never consulted on that path. Four articles did pass byte-for-byte because presend treated the draft as covering the question: `r23-00693` (What Is The Refund Policy?), `r23-00733`, `r23-00745`, `r23-00818` (Resets, the safety net).

Forward lines: **28 / 28** exact (18 customer, 10 owner), including the spaced and non-English lines. Customer client text for those cases is `Hello`, which presend treats as small talk.

Status lines, customer, client text `Any update?`: **3 / 13** exact. The three that passed are English (`r23-00947`, `r23-00950`, `r23-00956`). The other ten, including the English line `This is already with our team for review...` (`r23-00953`) and every Urdu, Roman Urdu, Hindi, Arabic, Hinglish, French, Spanish, and Russian line, were replaced by the same teammate-forward sentence (`MISSED_QUESTION`). Owner status lines: 13 / 13 exact. Owner forward lines: 10 / 10 exact.

## False holds

Pool is 425 rows that should have been posted as written: 320 benign, 92 homonyms, 13 status lines whose final period was changed to a question mark.

- Homonym holds 9. Five are the guard (`PAYOUT_GUARD_VISIBLE_HEDGE hedge`): `r23-01068` `Reset notifications, the bell is stuck.` became the English hedge; `r23-01025` Urdu connection-loss, `r23-01031` Hindi connection-loss, `r23-01064` Hindi theme reset, `r23-01075` Urdu theme reset. Three were presend forwards (`r23-00986` password-reset link, `r23-00990` weekend market hours, `r23-01001` status-page hours). One was the MT5 rewrite in `postProcessModelReply`: `r23-01005` `Download MT5...` posted as `Download the trading platform...`.
- Benign holds 19. Eleven are the guard. `r23-01139`, `r23-01320`, `r23-01321`, and `r23-01322` are ordinary garden sentences and were logged `erase`. `r23-01151` `Theek hai, baad mein likh dena.` was logged `erase`. Seven benign lines were presend forwards, including `r23-01096` `Still here.` One (`r23-01134`) lost a semicolon to the spacing pass (`empty;` became `empty,`). `r23-01188` draft `Hello.` collided with the harness's prior `Hello.` and was hedged as an empty duplicate; removing that one row still leaves the rate above 2%.
- Status punctuation variants: 10 of 13 were forwarded and sit in the false-hold pool.

## Owner locks

92 of 138 dictated locks were posted unchanged. Those are the English, Urdu, Hindi, and Arabic sentences for all 23 facts.

All **23 Roman Urdu** locks and all **23 Hinglish** locks were replaced with the English fact. Log: `PAYOUT_GUARD_VISIBLE_HEDGE locked`.

- `r23-00549` Roman Urdu `strategy_risk` draft begins `Funded account par Strategy Risk ya Risk Rule ki breach ek soft breach hai...`. Posted: `A Strategy Risk or Risk Rule breach on a funded account is a soft breach with a reset. It does not terminate or close the account.`
- `r23-00558` Hinglish `daily_loss_hard` draft begins `Daily loss limit ya max loss limit ko touch karna hard breach hai...`. Posted: `Touching the daily loss limit or the max loss limit is a hard breach. A hard breach ends the account.`

## Public send paths

| Path | Cases | Hedge | Exact bytes | Forward line | Other | Nothing posted | Critical |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| customer | 938 | 251 | 412 | 253 | 22 | 0 | 19 |
| owner | 473 | 293 | 134 | 0 | 46 | 0 | 19 |
| retry | 13 | 13 | 0 | 0 | 0 | 0 | 0 |
| fallback | 11 | 8 | 0 | 3 | 0 | 0 | 0 |
| defer | 6 | 0 | 0 | 0 | 0 | 6 | 0 |
| missing | 6 | 6 | 0 | 0 | 0 | 0 | 0 |

The 46 owner "other" rows are the Roman Urdu and Hinglish locks above. Instruction-leak drafts (20 customer, 12 owner) all posted a hedge, and none of the leak needles were in the payload.

## R13–R22

Each lane's `payoutClaimGuard.test.js` passed on a clean `git archive` of `96485a93`, where `index.js` is still the unpatched file those diffs target: r13, r14, r15, r16, r17, r18, r19, r20, r21, r22.

A first execution inside the temp tree after the R23 diff had already been applied failed every suite at `git apply --check` (the older hunks no longer match). The assertions before that check had already printed success. The suite result used for this verdict is the clean-tree run.

## Result

The hook does hedge the majority of in-vocabulary claims, it suppresses defer, it fail-closes a missing verdict, it keeps forward lines byte-identical, and the older lane suites pass on the frozen tree. It still posts novel claim sentences on both the customer and owner public paths, it swaps every Roman Urdu and Hinglish lock for English, and the live presend escalate rewrites 194 allowlisted FAQ bodies and 10 status lines before the guard can preserve them. False holds on homonyms are 9.78%. That is a fail.
