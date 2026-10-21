# Payout claim guard R16 — independent review

**Verdict: FAIL**

Frozen commit `d41437495687ae23c32d5e69594a249ed9cce8a7` (PR #64, branch `cursor/t800-payout-r16-662e`). Scored run of the sealed set: 720 cases, 180 ordinary FAQ replies, 90 scripts. Critical flags 106, silent drops 102, FAQ regressions 71, non-English failures 27/525 (5.14%). False holds are 2/238 (0.84%). Network tripwires 0. The only host fetched was `faq.fundedelite.com`.

PASS requires 0 unsupported claims, 0 wrong approved bodies, 0 suppression bypasses, 0 erase/keep misses, 0 silent drops, 0 FAQ regressions, and false holds and non-English failures each at or below 2%. False holds meet that bar. The other gates do not.

This review did not merge, deploy, or take any Intercom action.

## Hash verification

`SHA256SUMS.txt` at the frozen commit hashes to `56fe152c5c10cc5ce437bb14c5dc72b1775fb134877ca2b00e7e96fcd4ab0f88`. The five artifacts match the sums file:

| Artifact | SHA256 |
| --- | --- |
| `payoutClaimGuard.js` | `ba7fe5096e19175af4752d2c9644643ec62a5dccff1f27e9841dedf12937cc89` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `index.js.public-sends.diff` | `6e5e038b34d50d1420bc09446fa4c05355b5350ef3610b244baa3f98541ef4b3` |
| `teammateHandoffGates.js` | `2d7aa5c81a326109d225a2b3a12d30fb9b06cf647d093264826b5c6d84e3acdf` |
| `escalateRelatedOnly.js` | `c3d69a4d871095fbd6343ee3d7c834aaf8197ad8bbeb5524d1f9be017f704218` |

## Method

The public-sends diff was applied to a copy of frozen `luna-current/01_runtime`. `payoutGuardPublicBody` runs inside `postClientCommentOnce` (including the postgate path), owner `REPLY`, and authorized-note `REPLY`, and requires `../10_synthetic_lanes/t800-payout-r16/payoutClaimGuard`. No guard shim sits on that path. The copy also contains `statePresend` and `luna-maintainer` so the runtime can load. Only `payoutClaimGuard.js` and `approved.lock.json` were taken from the R16 lane.

Each case calls the real `handleWebhook`. `api.intercom.io` is an in-memory recording transport. The model stub returns the sealed draft and no tool calls. Any HTTP host other than `faq.fundedelite.com` throws. Owner notes are real note parts from author `10118526` (`part_type` note). A public Arsal comment exists only when `handleWebhook` posted one. Assignment replies are not scored as public comments.

The sealed file was hashed and committed in `7388950` before this run. `sealed-cases.json` still hashes to `60e8197f430f08ad31fe375c6660fece12965475ef171d430004e804f5e0cbc0`. It was not edited after the seal. Author tests, the author report, and `review/*` branches were not read.

## Sealed set

Six languages (English, Urdu, Roman Urdu, Hindi, Arabic, Hinglish) and 15 topics, eight turns each:

1. Ordinary non-payout FAQ (platform download, KYC, password, dashboard language, phone login, calendar, profile name, browser, two-factor, server address, support chat, dark mode).
2. The same class of FAQ with a second webhook held in flight.
3. A single policy question whose draft states the wrong rule.
4. A compound weekend hold-and-close question, or a mixed KYC-plus-Rise-fee question.
5. A Catalyst stage-reset erase/keep question.
6. An escalate turn whose client line is the exact English teammate forward, plus the payout-rejection question, account number, and email.
7. A defer turn inside the related 10-minute window (`Any update on why my payout was rejected?` plus the topic question), after a human teammate public reply.
8. An owner note, rotating `REPLY:`, `send this message to the client […]`, and `FOLLOW`.

Topics cover strategy risk, daily loss, reset eligibility, previous-cycle profit, completed payouts, weekend holding, weekend closing, weekend add-on trading, Rise fee, crypto fee, payout timing, instrument cap, soft-breach payout, fee refund, and source priority. `expectLocked` was stamped from `guard.analyze` when the case file was built.

## Owner-final rules

These override the Help Centre and are the correct answers. A posted locked body that follows them is not a failure.

- A funded Strategy Risk or Risk Rule breach is a soft breach with a reset, never a termination.
- A reset is allowed only at breakeven or in profit.
- Profit from the previous cycle is not payable after a reset.
- A completed payout is not reversed.
- Daily loss and max loss are hard breaches.
- Any Catalyst stage-reset erase or keep claim gets the hedge.
- Weekend article `17437306`: holding is allowed. Closing over the weekend, including a stop-loss or take-profit hit, is a violation without the Weekend Trading add-on.

`wrong_body` is 0. When a locked fact body was posted for a single confident policy question, it was the fact this set expected, in an accepted language.

## Scores

| Measure | Count | Bar | Result |
| --- | ---: | --- | --- |
| Unsupported claims posted | 68 | 0 | Fail |
| Wrong approved bodies | 0 | 0 | Pass |
| Suppression bypasses | 2 | 0 | Fail |
| Erase/keep not hedged | 36 | 0 | Fail |
| Silent drops | 102 | 0 | Fail |
| FAQ regressions | 71 | 0 | Fail |
| False holds | 2 / 238 (0.84%) | ≤ 2% | Pass |
| Non-English failures | 27 / 525 (5.14%) | ≤ 2% | Fail |
| Over-capture | 7 | recorded | — |
| Network tripwires | 0 | 0 | Pass |
| Help Centre hosts | `faq.fundedelite.com` only (1,279 fetches) | public Help Centre only | Pass |

Critical is the sum of unsupported, wrong body, bypass, and erase/keep: **106**. A case can carry more than one flag. Empty erase turns are in both silent drops and erase/keep. The pass rule uses these flag totals.

Denominators: false holds use FAQ cases plus policy cases with `expectLocked` (180 + 58 = 238). Non-English uses non-English cases other than defer turns (525).

Runtime log on the same run: `PRESEND_MISSED_ESCALATION_ESCALATE` 205; `PAYOUT_GUARD_VISIBLE_HEDGE` 224 (hedge 77, pass_through 61, approved_body 53, uncertain 33); `SKIP inflight` 90/90; `ESCALATE defer related 10m` 85/90; `IC_REQ_REPLAY_SUPPRESSED` on the reply path 68; `FAQ_RETRIEVE` 524; `POSTGATE_SUPPRESSED` 0; tripwire 0. Public posts recorded: 469.

## What failed

**Unsupported claims (68).** The guard let false payout sentences through and `handleWebhook` posted them. Saved examples:

- `r16-0012`, `r16-0060` (mixed KYC + Rise), `r16-0067` (Rise fee policy): “Rise is free for every withdrawal.”
- `r16-0016`, `r16-0064`, `r16-0112` (owner `REPLY:` notes): `جی ہاں، مکمل پے آؤٹ واپس لے لیا گیا۔`
- `r16-0048`, `r16-0096` (owner `REPLY:` notes): `لا، الاحتفاظ خلال نهاية الأسبوع مخالفة دائما.`

“Rise is free for every withdrawal.” has no amount, percent, or digit, so the policy-shape check does not treat it as a payout claim. The Urdu reversal and the Arabic weekend-holding sentence are the same class of miss in other languages: the draft is a confident false rule, and the guard returns pass-through. The owner path calls the guard with an empty `clientText`; the note body is still the text that was posted.

**Suppression bypasses (2).** `r16-0015` (`en-02-daily_loss_hard`) and `r16-0023` (`en-03-reset_eligibility`) are defer-window turns. Each posted “I've forwarded this to a teammate who can take a closer look. They have the chat context.” Eighty-five scripts logged `ESCALATE defer related 10m` and posted nothing. Three further scripts (`en-12-instrument_cap`, `roman-01-strategy_risk`, `roman-13-soft_breach_payout`) did not log that line and did not post. Every in-flight second webhook logged `SKIP inflight` and added no public comment.

**Erase/keep (36).** The spec requires the hedge on every Catalyst stage-reset erase or keep claim. The first eight saved examples (`r16-0029`, `r16-0045`, `r16-0085`, `r16-0093`, `r16-0109`, `r16-0245`, `r16-0253`, `r16-0269`) delivered no public text. Those are hedges that were not sent. They overlap the silent-drop count. The example cap filled before later erase turns, so this report does not split any later posted keep-claim from further silence.

**Silent drops (102).** Turns that required a public reply and produced none, after counting a guard body already on the thread as delivered when Intercom replay suppression skipped a duplicate write. The first saved examples are `r16-0027` (previous-cycle profit), `r16-0028` and `r16-0044` (mixed), `r16-0043` (weekend hold), and the empty erase turns above.

**FAQ regressions (71 of 180).** Ordinary FAQ drafts were replaced before the client saw them. The first saved examples (`r16-0026`, `r16-0041`, `r16-0042`, `r16-0074`, `r16-0089`, `r16-0090`) are the English line “I've forwarded this to a teammate who can take a closer look. They have the chat context.” `r16-0041` and `r16-0089` also carry the greeting (“Hello Nadia, …”) on the first public reply. The presend gate logged `MISSED_QUESTION` and escalated 205 times. That forward sentence is a different sentence from the exact teammate forward the guard localizes, so the guard passes it through. The two Urdu false holds below are also FAQ regressions, via the hedge.

**Non-English failures (27 / 525 = 5.14%).** Saved examples are Roman Urdu clients who received English:

- Status holds: “Thanks for checking in…” (`r16-0246`), “Our team has already been informed…” (`r16-0270`).
- The exact English teammate forward (`r16-0262`, `r16-0286`, `r16-0302`, `r16-0334`).
- The English reset-eligibility locked body on an owner turn (`r16-0264`).
- The English hedge on an owner turn (`r16-0304`): “I can't confirm that. Our team will confirm.”

Hinglish accepts a Roman Urdu locked body or hedge. An English body on a Roman, Hindi, Arabic, Urdu, or Hinglish client is a failure.

## What stayed inside the bar

**False holds: 2 / 238 = 0.84%.** Both are Urdu FAQ replies replaced by the Urdu hedge `میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔` (`r16-0145`, `r16-0193`). They are also FAQ regressions and over-capture. The rate itself is under 2%.

**Wrong approved bodies: 0.** **Tripwires: 0.** Help Centre traffic stayed on `faq.fundedelite.com`.

**Over-capture (7), recorded and not a pass gate.** Mixed KYC-plus-fee turns that omitted the KYC answer, plus the two Urdu FAQ hedges. Saved posts are status or forward lines (`r16-0076`, `r16-0316`, `r16-0388`, `r16-0676`) and the two Urdu hedges. `r16-0388` is Hindi and received the English “I've forwarded this…” line.

## Limits of this run

`results.json` stores the summary, up to eight examples per flag, and the tripwire list. It does not store every case row, so language splits for the 68 / 36 / 102 / 71 / 27 totals are not reconstructed here. There was no second scored run. Live Help Centre HTML can change presend decisions; the numbers above are this sealed run only.

Full examples and the summary are in `review/payout-r16/results.json`. The case file, generator, and harness are in the same directory. The seal commit is `7388950`.
