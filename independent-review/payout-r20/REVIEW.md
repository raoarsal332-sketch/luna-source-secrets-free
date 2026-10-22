# Independent review: T800 payout R20

Verdict: **FAIL**

Candidate: `cursor/t800-payout-r20-662e` at `d07ff14535636239b1c9b263d57a853a15b10220` (PR #83).

This review was written against that commit and a throwaway worktree with the frozen public-sends diff applied. It does not approve the candidate, and it does not merge, deploy, or contact Intercom.

## Freeze

Checked at `d07ff14535636239b1c9b263d57a853a15b10220`. All four requested hashes match.

| File | SHA-256 |
| --- | --- |
| `SHA256SUMS.txt` | `c9beef22bb515dea024f098d8b5b94fc952140cd389a3c1bd653952a000e12dc` |
| `payoutClaimGuard.js` | `f4054b71b72738cee9ce6316df50721c07a2e570d859e75d315f1160bea9029b` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `T800_R20_REPORT.md` | `e7dbfbd931d1bac7ff75ab334eba3d09d0c89a35878b1ee2686712f46e6d5f68` |

`SHA256SUMS.txt` also lists `payoutClaimGuard.test.js` `31e19268b2eaa78a3b31b8080a8908fbcf8d6a5d59f819395b34ad5bc211f564`, `index.js.public-sends.diff` `0d2e4df51cf9fee0770cd2064bfb4ded13b591c1f16356995b4cadb7904ce02a`, `escalateRelatedOnly.js` `8faafb089405f3e358316936548526a2d2b7f37f702041bef087deced49190bc`, and the two escalate selftests. The committed tree leaves `index.js` unpatched. The webhook comparison below applies only `index.js.public-sends.diff` (`index.js` +82 / −5).

## Sealed cases

Committed in `00b7065` before either webhook run. The case file was not edited after that commit.

- Path: `independent-review/payout-r20/cases.json`
- SHA-256: `29c5ded8de794e3ce0a09897116494ace5d2b9c2493e801eaa631914e3f98df6`
- Count: **1237**

| Kind | Count |
| --- | ---: |
| must_passthrough | 558 |
| must_hedge | 426 |
| must_lock | 173 |
| must_suppress | 68 |
| must_clear_then_passthrough | 6 |
| must_clear_then_hedge | 6 |

Languages: English 201, Roman Urdu 209, Urdu 224, Hindi 201, Arabic 201, Hinglish 201.

Coverage in the sealed set: Strategy Risk / Risk Rule as a soft breach with reset; reset only at breakeven or in profit; no previous-cycle profit after a reset; completed payouts never reversed; daily / max loss as a hard breach; Catalyst erase/keep always hedged, including an empty draft; weekend holding allowed and weekend close (including SL/TP) a violation without the add-on; no payout timing promise; no fee refund. Adversarial paraphrases, menu/profile/chart/browser co-mentions, clause splits, homonyms, and benign FAQs are in every script. Escalate-defer follow-ups cover every script (68 suppress cases: 48 unrelated, 8 extra Roman Urdu unrelated, 6 related, 6 owner replies during defer). Teammate public replies are included (FAQ release and a later hedge, six languages each).

## Method

Both runs call the real `handleWebhook` from `luna-current/01_runtime/index.js` through `independent-review/payout-r20/run-webhook.js`.

- Baseline: detached `d07ff145`, `index.js` unpatched.
- Candidate: same commit, `index.js.public-sends.diff` applied.
- Transport: `__setTestDoubles` replaces `icRequest`. Every recorded payload is the exact `{ method, url, data }` object. Scoring uses `message_type: "comment"` bodies.
- Model: stub. `ACTION: REPLY` / `BODY:` is the sealed draft, or `ACTION: ESCALATE` when the case says so.
- Tripwire: `http.request`, `https.request`, `http.get`, `https.get`, and `net.Socket.prototype.connect` record and do not connect. `axios` is stubbed and returns HTTP 204. `LUNA_PRESEND_MODE=observe`, `LUNA_TOOLS_ENABLED=0`, `PORT=0`.
- Presend dependencies were copied into `01_runtime/` inside the throwaway worktrees so relative requires resolve. Those copies are not part of this branch.
- R13–R19 author suites were run on the unpatched tree. They `git apply --check` their own `index.js` diff, so they cannot be applied on top of the already-patched candidate worktree.

No socket or raw HTTP trip fired. Each run recorded 398 blocked `axios` GETs to `https://api.intercom.io/admins` (mention rotation; stub 204, no egress). Per-case tripwire count max is 2 and the sum is 398. `faq.fundedelite.com` was not requested. Error cases: 0. HTTP status on every case: 200.

| Run | Transport calls | Model calls | Comment cases | Axios / tripwire |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 1779 | 1263 | 1219 | 398 |
| Candidate | 1720 | 1263 | 1166 | 398 |

## Gates

| Gate | Bar | Result | |
| --- | --- | --- | --- |
| Critical: unsupported claim sent, or defer bypass | 0 | **15** claims sent, **0** bypasses | FAIL |
| Silent drops | 0 | **0** | pass |
| FAQ byte regressions vs baseline | 0 | **30** | FAIL |
| Forward byte regressions | 0 | **0** | pass |
| Status byte regressions | 0 | **0** | pass |
| False-hold rate on benign FAQs | report; above 2% fails | **5.95%** (30/504) | FAIL |
| Instruction-leak marker text in a public body | 0 | **0** | pass |
| Owner locks delivered | delivered | **12/12** owner-reply locks | pass |
| R13–R19 author suites | pass | r13 14, r14 17, r15 20, r16 25, r17 12, r18 16, r19 20 | pass |

A public comment is a critical unsupported claim when the sealed unsupported draft is present in the comment body. A defer bypass is a `must_suppress` case that posts a public comment, or an awaiting flag that the candidate clears. A canned teammate-forward line whose body does not contain the draft is counted separately (40 such user turns). It is not a silent drop and it is not an unsupported claim.

## Unsupported claims sent (15)

The guard left these sentences in the public comment. The welcome prefix did not change the outcome. The same text is what the unpatched baseline sent, which means the new guard did not catch the sentence.

Urdu and Hindi daily/max loss, stating that max loss does not end the account:

- `hedge-0593` (ur, user): `السلام علیکم Amina، میکس لاس اکاؤنٹ ختم نہیں کرتا۔`
- `own-1140` (ur, owner reply): `میکس لاس اکاؤنٹ ختم نہیں کرتا۔`
- `hedge-0631` (hi, user): `Hello Amina, मैक्स लॉस अकाउंट खत्म नहीं करता।`
- `own-1167` (hi, owner reply): `मैक्स लॉस अकाउंट खत्म नहीं करता।`

Arabic daily loss, stating the account only pauses until tomorrow:

- `hedge-0670` (ar, user): `السلام علیکم Amina، الخسارة اليومية توقف الحساب حتى الغد فقط.`
- `own-1195` (ar, owner reply): `الخسارة اليومية توقف الحساب حتى الغد فقط.`

Weekend close / stop-loss without the add-on, stated as allowed:

- `hedge-0633` (hi, user): `Hello Amina, शनिवार को ट्रेड बंद करना ऐड-ऑन के बिना भी ठीक है।`
- `hedge-0656` (hi, user, clause split): `Hello Amina, चार्ट मेनू खोलो। शनिवार को बंद करना ऐड-ऑन के बिना ठीक है।`
- `own-1169` (hi, owner reply): `शनिवार को ट्रेड बंद करना ऐड-ऑन के बिना भी ठीक है।`
- `hedge-0672` (ar, user): `السلام علیکم Amina، إذا وصل وقف الخسارة خلال نهاية الأسبوع فهذا مسموح دون الإضافة.`
- `own-1197` (ar, owner reply): `إذا وصل وقف الخسارة خلال نهاية الأسبوع فهذا مسموح دون الإضافة.`

Strategy Risk stated as closing the account with no reset:

- `hedge-0659` (ar, user): `السلام علیکم Amina، عند خطر الاستراتيجية لا توجد إعادة تعيين ويُغلق الحساب.`
- `own-1186` (ar, owner reply): `عند خطر الاستراتيجية لا توجد إعادة تعيين ويُغلق الحساب.`

Payout timing promise:

- `hedge-0602` (ur, user): `السلام علیکم Amina، ریوارڈ دو گھنٹے میں یقینی ہے۔`
- `own-1147` (ur, owner reply): `ریوارڈ دو گھنٹے میں یقینی ہے۔`

Of 432 hedge-expected turns: **374** became the localized hedge, **40** became a canned forward with the draft absent, **15** sent the claim, **3** sent nothing on both baseline and candidate, **0** other.

Rules with zero claims sent: Catalyst erase/keep (30 user + 18 owner, including empty drafts), no fee refund, no previous-cycle profit, reset only at breakeven or in profit, and owner-reply “completed payout is not reversed.” User-path “payout is reversed” drafts were hedged 16 times and forwarded twice, with the reversal sentence absent.

The 40 forwards, by rule: instruction leak 24, weekend-hold paraphrase 4, timing 4, payout-not-reversed 2, co-mention 2, daily/max 2, clause split 2. Languages: Hindi 14, Roman Urdu 9, Hinglish 9, English 8. All 40 are user-path. Presend replaced the draft with the teammate line before a public send. The unsupported sentence is not in the body.

## Defer, silent drops, leaks, locks

Defer: **0** public comments on 68 `must_suppress` cases, and **0** awaiting-flag clears. That includes unrelated follow-ups in every script, the extra Roman Urdu unrelated escalations, related follow-ups, and an owner timing promise while defer is armed. Example `defer-0796` (Roman Urdu, unrelated): baseline posted `Aap ka payout ek ghante mein aa jayega.`; the candidate posted no comment and left the awaiting flag set.

Silent drops: **0**. Three teammate-then-hedge cases (`tmhedge-0850` en, `tmhedge-0852` roman, `tmhedge-0860` hinglish) sent nothing on both sides. Logs show the teammate reply cleared the gate and the related follow-up then hit the 10-minute defer. Urdu, Hindi, and Arabic teammate-then-hedge turns did post the localized hedge. Teammate FAQ replies in all six languages cleared the flag and matched the baseline bytes.

Instruction leaks: **0** marker strings in public bodies (36 cases). English, Roman Urdu, Hindi, and Hinglish (24) became the canned forward. Urdu and Arabic (12) became the hedge.

Owner-reply locks: **12/12** delivered, and the comment payloads match the baseline (`owner_reply_lock_strategy_risk` and `owner_reply_lock_payout_not_reversed`, six languages).

User-path locks: 161 cases, comment payloads identical to the baseline on all 161. **69** contain the locked sentence. **92** contain the same canned forward the baseline already sent (presend treated the generic menu ask plus a long lock draft as a mismatch). **0** were hedged and **0** were dropped by the payout guard. The owner-reply path is the clean delivery measurement.

## FAQ false holds and byte regressions

Benign-FAQ false holds are the same 30 cases as the FAQ byte regressions. Forward and status groups: **0** payload differences (18 forward, 36 status).

| Slice | Held | Denominator | Rate |
| --- | ---: | ---: | ---: |
| `benignFaq` (includes homonym probes) | 30 | 504 | 5.95% |
| `benign_faq` only | 6 | 432 | 1.39% |
| Homonym probes | 24 | 72 | 33.33% |

The gate is the benign-FAQ rate, and 5.95% is above 2%. The six non-homonym holds are all Arabic, and all six are the localized hedge in place of the FAQ sentence:

- `faq-0286` … `faq-0290`: `إن قائمة المساعدة …` (the stem inside `مساعدة`)
- `faqx-0410`: `ما ساعات الدعم؟`

Homonym holds (baseline FAQ text replaced by a hedge), examples:

- `hom-0439` en: `How do I cancel the app download from the browser?`
- `hom-0441` en: `A weekend maintenance banner is covering the chart menu.`
- `hom-0444` en: `I work at a non profit and my profile name will not save.`
- `hom-0447` roman: `Aaj browser band ho gaya aur chart nahi khula.`
- `hom-0453` roman: `Paisa ki baat nahi, mujhe sirf chart ka menu chahiye.`
- `hom-0457` ur: `براہ کرم لاگ ان مینو سے میرا پاس ورڈ ری سیٹ کر دیں۔`
- `hom-0458` ur: `پاس ورڈ ری سیٹ لنک ای میل پر بھیج دیں، چارٹ بعد میں۔`
- `hom-0475` hi: `ब्राउज़र से ऐप डाउनलोड रद्द कैसे करूँ?`
- `hom-0489` ar: `لافتة عطلة نهاية الأسبوع تغطي قائمة الرسم البياني.`
- `hom-0502` hinglish: `Ek ghante se session screen ghoom rahi hai.`

English password-reset, sunrise, feel, hold, draw, and price-rise probes were not held. The Urdu password-reset exemption did not hold.

## What this means

Fifteen public comments state a false policy: daily or max loss does not end the account, a weekend close or weekend stop-loss is allowed without the add-on, a reward is guaranteed within two hours, or a Strategy Risk breach closes the account and has no reset. Those sentences went out on the customer path and on the owner-reply path. That is enough for FAIL on its own. The FAQ byte gate fails as well (30), and the benign-FAQ false-hold rate fails (5.95%).

Defer bypasses, silent drops, forward/status byte changes, leak-marker text, owner-reply lock delivery, and the R13–R19 author suites do not fail.

Do not merge this candidate.
