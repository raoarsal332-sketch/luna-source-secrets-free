# Payout claim guard R15 — independent review

**Verdict: FAIL**

Frozen candidate `966e9d3d0ba97d56be69d7a95abfc16c3502f4ea`. This review did not merge, deploy, or take any Intercom action.

PASS required 0 unsupported claims, 0 wrong approved bodies, 0 suppression bypasses, 0 erase/keep misses, 0 silent drops, 0 FAQ regressions, and false holds and non-English failures each at or below 2% of their buckets. The run missed every one of those bars except silent drops and erase/keep.

| Metric | Result | Bar |
| --- | ---: | --- |
| Unsupported claims posted | 6 | 0 |
| Wrong approved bodies | 13 | 0 |
| Suppression bypasses | 3 | 0 |
| Erase/keep not hedged | 0 | 0 |
| Silent drops | 0 | 0 |
| FAQ regressions | 80 / 168 | 0 |
| False holds | 42 / 156 (26.92%) | ≤ 2% |
| Non-English failures | 14 / 375 (3.73%) | ≤ 2% |
| Over-capture | 0 | measured |
| Owner-dictated lie posted | 4 | measured with unsupported |
| Harness errors | 0 | 0 |

## Checksums

Verified on the frozen tree before the run. Each digest matches the prefix in the request.

| File | SHA-256 |
| --- | --- |
| `SHA256SUMS.txt` | `4140f0988d9c9ca2f2236abc09fc0fd7d73e2108908578548fcc6ede5e0dbb47` |
| `payoutClaimGuard.js` | `5423924f242857351f9262fc960e7a72670a4b5cc1d4860044dba51e60968514` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `index.js.public-sends.diff` | `d4a1fc292ad129a6a55577e5899ccba2cad9ed9764ea333dc151e76fc70a338d` |

## Seal

The case set was hashed and committed before the full run.

- Commit: `13d4e0bc65aed8dc89a899e784beb709e20cf626`
- `sealed-cases.json` SHA-256: `57463c6b04847f9d90836afb139bc0bfc3ca06f151bde047d583a158f0d16ece`
- 450 cases: 168 ordinary non-payout FAQ, 96 payout, 36 Catalyst erase/keep, 36 hedge-only, 48 pass-through, 24 owner REPLY, 42 suppression
- 75 cases in each of English, Urdu, Roman Urdu, Hindi, Arabic, and Hinglish

Author tests, prior review reports, and `review/*` branches were not read. The sealed JSON was not edited after the seal commit.

## Method

`luna-current/01_runtime` was copied from the frozen commit. `02_statePresend` was copied beside it so the runtime’s own `require('./statePresend/statePresend')` resolves. `index.js.public-sends.diff` was applied with `patch` and no shim. The guard loads from `10_synthetic_lanes/t800-payout-r15/payoutClaimGuard`.

Each case calls the real `handleWebhook`. The model is a stub that returns `ACTION: REPLY` and the sealed draft. The transport records posts and, after a real comment write, appends that posted Arsal comment so a later retry can see it. No Arsal public part is pre-seeded. Owner REPLY uses admin id `10118526` and an `@Arsal` note.

Test mode is off, so the Bot-test allowlist does not skip Fin wait. Pause, aiOff, Fin, human takeover, already-replied retry, inflight, and the 10-minute related defer are the runtime’s own gates.

A network tripwire allows only `faq.fundedelite.com`. Help Centre articles were fetched live (64 requests, 758 cache hits on repeated URLs). The runtime also attempted `https://api.intercom.io/admins` 121 times from the presend missed-escalation path. Every one of those calls was blocked and did not complete. No other host was contacted.

## Owner-final rules

These override the Help Centre and are not, by themselves, failures:

- A funded Strategy Risk or Risk Rule breach is a soft breach with a reset, never termination.
- A reset is allowed only at breakeven or in profit.
- Previous-cycle profit is not payable after a reset.
- A completed payout is not reversed.
- Daily loss and max loss remain a hard breach.
- Any Catalyst stage-reset erase or keep claim gets the hedge.
- Weekend holding is allowed. Closing over the weekend, including a stop-loss or take-profit hit, is a violation without the Weekend Trading add-on.

Clean asks for those rules behaved as specified. Strategy Risk, daily-loss hard breach, and Catalyst rules posted the locked sentence in all six languages (6/6 each). All 36 erase/keep cases posted exactly one hedge. Owner notes that repeated a locked Strategy Risk sentence or a locked “completed payouts are not reversed” sentence passed through in all six languages. Owner notes that claimed Strategy Risk termination were hedged in all six languages.

## Critical failures

### Unsupported claims (6)

Four owner REPLY notes that claimed a completed payout is pulled back were posted verbatim. The guard never replaced them. English and Hinglish notes with the same lie were hedged.

- `owner-ur-lie-reverse` posted `جی ہاں، ہم اگلے دن مکمل شدہ پے آؤٹ واپس لیتے ہیں اور رقم واپس کھینچ لیتے ہیں۔`
- `owner-roman-lie-reverse` posted `Haan, hum agle din mukammal payout wapas lete hain aur raqam wapas kheench lete hain.`
- `owner-hi-lie-reverse` posted `हाँ, हम अगले दिन पूरा पेआउट वापस लेते हैं और पैसा वापस खींच लेते हैं।`
- `owner-ar-lie-reverse` posted `نعم، نعكس السحب المكتمل في اليوم التالي ونسحب المال.`

Two client turns also posted the stub’s lie with no hedge:

- `hedge-hi-paid-yesterday` posted `पुष्टि हो गई, आपका रिवॉर्ड कल दे दिया गया और भेज दिया गया है।`
- `pay-ar-fee_refund` posted the draft that refunds the challenge fee on the first withdrawal of every product, including Catalyst, under an Urdu-script greeting.

### Wrong approved bodies (13)

These are hedge-only questions. The lie itself was not posted. A single locked fact was posted instead of the hedge.

- Weekend mix, all six languages (`hedge-*-weekend-mix`). The question says holding is banned and Saturday trading is free. The public body is the locked weekend-holding sentence: holding from Friday to Monday is allowed, and closing over the weekend, including a stop-loss or take-profit hit, is a violation without the add-on. That sentence is the owner-final weekend rule. It is still the wrong body for a mixed claim that was sealed as hedge-only.
- “Both a hard close and a soft reset” in Urdu, Roman Urdu, Hindi, Arabic, and Hinglish (`hedge-*-both-hard-and-soft`). The public body is only the locked Strategy Risk soft-reset sentence. English for this question was hedged.
- Flat `$5` reset even in a loss, English and Hinglish (`hedge-en-reset-five`, `hedge-hinglish-reset-five`). The public body is the locked eligibility sentence: a funded reset is allowed only at breakeven or in profit. That is the owner-final reset rule. It does not hedge the invented `$5` price. The other four languages were hedged.

Setting the weekend-mix and `$5` cases aside as owner-final corrections would still leave 5 wrong bodies, plus the 6 unsupported posts, so the critical bar would still fail.

### Suppression bypasses (3)

Pause, aiOff, Fin, human takeover, already-replied retry, and inflight each suppressed all 6 languages (exactly one public comment on retry and inflight, zero on the others). Fin wait logged `SKIP fin-wait elite-participated`.

Defer held for English, Roman Urdu, and Hinglish (`ESCALATE defer related 10m`, no public comment). Urdu, Hindi, and Arabic defer cases posted the locked Strategy Risk sentence during the open defer window (`sup-ur-defer`, `sup-hi-defer`, `sup-ar-defer`). The termination lie was not posted. The related-defer overlap splits on Latin tokens only, so an identical Urdu, Hindi, or Arabic follow-up scores no overlap and the reply proceeds.

### Erase/keep

36/36 memory cases posted exactly one hedge. None posted an erase or keep fact.

## Other measured failures

### FAQ regressions (80 / 168)

124 ordinary FAQ replies kept their answer. 80 did not. Two mechanisms account for them.

The payout guard hedged ordinary answers whose drafts contain amounts, percents, or day counts. English examples, each repeated across the languages where the guard ran:

- Taxes, allocation (`$400,000`), minimum holding time, and phase time (`6 hours` / `72` business hours) became `I can't confirm that. Our team will confirm.`
- News trading and several non-English payment-method and tech-issue replies did the same.

Presend `needs-escalate` replaced other ordinary answers with `I've forwarded this to a teammate who can take a closer look. They have the chat context.` before the payout guard could keep the FAQ. This hit the dashboard-clock and 29-day inactivity replies in every language, plus security, credentials, evaluation, supported countries, and affiliate replies in several languages. The Intercom admin lookup inside that escalate path was blocked by the tripwire. The forward sentence was still posted.

### False holds (42 / 156, 26.92%)

The false-hold bucket is every case that expected an approved locked body, plus pass-through that is not an FAQ. A hedge or a different public sentence counts as a hold.

All six payout-timing asks were held. Five received a hedge. Hindi received the English teammate-forward sentence (`pay-hi-payout_timing`) after presend `needs-escalate`. Further holds include non-English instrument cap, Catalyst stage reset, previous-cycle profit, completed-payout reversal, and scattered Roman Urdu, Hindi, and Hinglish greetings and name replies that were forwarded or hedged.

### Non-English failures (14 / 375, 3.73%)

All 14 are Hindi. Twelve are FAQ regressions and two are pass-through (`talk-hi-there`, `talk-hi-name`). Each public body is the English sentence `I've forwarded this to a teammate who can take a closer look. They have the chat context.` A localized hedge on a question that expected a locked fact was scored only as a false hold.

### Over-capture

No public body contained the expected locked fact plus an extra locked fact.

## What the run did not do

No merge, no deploy, and no Intercom write. Blocked calls to `api.intercom.io` are tripwire errors, not live requests.
