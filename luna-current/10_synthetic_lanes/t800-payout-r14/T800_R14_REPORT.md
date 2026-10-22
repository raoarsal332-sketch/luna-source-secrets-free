# T800 payout guard R14

Frozen synthetic candidate. Not approved. This report does not approve the candidate.

Staging only. No production, VPS, Intercom, secrets, deploy, or merge. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

## Review result this candidate answers

R13 returned NEEDS CHANGES: 368 cases, 13 unsupported claims, 3 wrong bodies, 0 suppression bypasses, 1 silent drop, 99 false holds, 8 over-capture, 15 regressions, 41 non-English failures. The weekend table, the owner exceptions, and Catalyst (13/13) were correct and are unchanged.

Root cause: topic entry depended on a lexicon, so an off-lexicon draft (Urdu and Arabic paraphrases, and other topics) never reached the guard.

## What R14 changes

The claim screen runs on every outbound customer body, in every language, including an owner REPLY. It does not wait for a payout-topic lexicon hit.

A sentence with a policy-shaped claim is hedged unless that sentence is byte-equal to a locked body sentence. Policy shape is money, a percent, a count, a duration or timing, or termination, close, reverse, refund, reset, or breach semantics. Detection uses a multilingual classifier plus numeral normalization across Arabic-Indic, Eastern Arabic-Indic, Devanagari, and fullwidth digits. The classifier also reads the original script after diacritics are stripped, so a decomposed Urdu or Arabic word is not invisible. Uncertainty fails closed to the localized hedge.

A locked body is chosen only when the customer question's intent matches that row. Resetting MT5 or a password is not a funded reset. A KYC upload is not a breach. Installing MT5 is not a payout. Paying with crypto at checkout is not the withdrawal fee. An owner REPLY is screened the same way. A clear approved question is answered with the matching locked body even when the draft adds other claims.

No allowed send returns empty. An empty draft and an uncertain draft post the hedge with send true and silent false. The postgate path that used to `return null` when the guard left the body unchanged now assigns the guard result and continues. Pause, aiOff, already-replied, human-teammate, and Fin ownership skips still return before the helper and do not post.

Non-payout FAQ replies post unchanged unless they contain a policy-shaped claim that is not a locked sentence.

## Kept from R13

`approved.lock.json` is byte-identical to the R13 lock (`edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667`). Locked bodies were not rewritten.

- Weekend (17437306): holding and moving SL/TP are allowed with or without the add-on. Opening or closing, including an SL/TP hit, is a violation without the add-on and allowed only with it. The unconditional "cannot hold any position from Friday to Monday" sentence is not used.
- Owner exception: a funded Strategy Risk or Risk Rule breach is a soft breach with a reset and does not terminate the account. It overrides 17437285 and the 17437388 instrument cell. Touching the daily loss limit or the max loss limit remains a hard breach and ends the account (17437388).
- Catalyst erase, wipe, clean slate, or profit kept is always the hedge. Published Catalyst rules, ladder, reopen, and the one-reset-after-the-first-stage body stay approved. Weekend trading on Catalyst is the Catalyst rules sentence only.

## Checks

17 tests passed. `node --check` passed on the guard and the test. `git apply --check` passed on the proposed diff from the repo root. `git diff -- luna-current/01_runtime/index.js` is empty.

Over-capture on 120 normal operational FAQ replies (login, password, MT5 terminal, KYC selfie, inbox, browser, dashboard, settings, profile, ticket, platform, chart): **0 / 120 (0.0000)**. Those replies posted unchanged.

The paraphrase set for clear approved facts covers strategy risk, daily-loss hard breach, instrument cap, crypto fee, Rise fee, reset count, reset eligibility, reset price, reset location, previous-cycle profit, fee refund, payout reversal, payout timing, weekend hold, weekend trade, Catalyst rules, ladder, reopen, and stage reset, including Urdu, Arabic, Hindi, Roman Urdu, and Hinglish paraphrases. Each returned that row's locked body and did not keep the model draft.

Off-lexicon drafts that are not a locked sentence are hedged, including Urdu reversal, Arabic closure with an Arabic-Indic percent, Arabic and French and Spanish "within one hour", a funded reset count stated on a hello, and a Hindi payout-timing sentence.

## Implementation hashes

These hashes are of the files below. `SHA256SUMS.txt` is written after this report and also lists this report. The checksum file's own hash is not in this report.

| File | SHA256 |
| --- | --- |
| `payoutClaimGuard.js` | `73e167125cb247f71bfc0f6cfe5fd402525327f1d8d70fd89162f5627552ec49` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `payoutClaimGuard.test.js` | `c1e82549eb8246bf0867921c457e3ea8b4935224fd18f26938394d5bd3323437` |
| `index.js.public-sends.diff` | `85563113ee9c174e3b3ec5c42053478fe1818cdd56284351bc4cc01e5ef07a2b` |
