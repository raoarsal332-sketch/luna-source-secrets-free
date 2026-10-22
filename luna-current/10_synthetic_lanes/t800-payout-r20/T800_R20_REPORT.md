# T800 payout guard R20

Frozen synthetic candidate. Not approved. This report does not approve the candidate.

Staging only. No production, VPS, Intercom, secrets, deploy, or merge. `luna-current/01_runtime/index.js` is not modified. The hook is a proposed diff only.

## Review result this candidate answers

R19 (`bb9bb2cc`) returned FAIL: 1355 cases, critical 35 (34 unsupported, 1 bypass), 0 silent drops, 0 FAQ regressions, 0/767 false holds, all Catalyst claims hedged, 0 instruction leaks. Non-English failures were 3.02%, and those were the same 34 unsupported claims.

The 34 misses were assertion detection in Roman Urdu, Hindi, Arabic, and Hinglish: the draft named a policy topic without a second assertion word. The bypass was an escalate defer flag cleared by a follow-up classified unrelated.

## Structural rule

R20 keeps the R19 final stage. One classifier runs on every outbound public body after the other presend rewriting.

- An exact locked sentence passes as the thread-language variant. A known welcome prefix is stripped only for that classification.
- An exact presend forward line or status line passes byte for byte, greeting included. The match is the collapsed line itself. A longer body that merely contains the English forward sentence is not exempt.
- Any other sentence that touches a policy topic, in any script, and is not itself an exact lock, makes the whole body the localized hedge. This is per sentence. A menu, profile, chart, or browser co-mention in that sentence does not cancel the topic.
- A body with no policy topic and no policy claim passes byte for byte.

An empty body hedges. A Catalyst erase or keep intent hedges, including an empty model turn. A failed postgate hedges. Instruction leaks hedge. `silent` stays false. A defer window still suppresses the public send, including the forward line, in every script.

## Class fixes

1. Topic fail-closed. The gate does not require a second assertion. Stems include Roman Urdu `payout`, `paisa`, `withdrawal`, `wapas`, `cancel`, `reverse`, `aaj`, `ghante`, `weekend`, and `hafte`; Hindi `भुगतान`, `वापस`, `रद्द`, `घंटे`, `सप्ताहांत`, and `लाभ`; Arabic `دفع`, `سحب`, `استرداد`, `إلغاء`, `ساعة`, `عطلة`, `ربح`, and `رسوم`. The same topic classes in English (payout, fee, refund, weekend, breach, drawdown, reset, profit) hedge unless the sentence is an exact lock, a password or MT5 reset, a reset link, or the refund-button line. Exact locks of those facts still pass.

2. Defer. `decideEscalateAwaitingGate` no longer sets `supersedesAwaiting` on `unrelated_other`. `index.js` clears `escalateAwaitingFirstTeammate` and `deferredRelatedReply` only when that flag is true, so an unrelated follow-up, including Roman Urdu that does not overlap an English escalate problem, leaves both flags armed. A public teammate reply still clears the awaiting flag. The fallthrough action is unchanged, so the unrelated case does not become a status-only hold. Forwards during an open defer or awaiting flag stay suppressed in every script.

## Kept

`approved.lock.json` is byte-identical to R13 through R19 (`edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667`). Locked bodies were not rewritten. The weekend table, the Strategy Risk owner exception, and the Catalyst bodies are unchanged. Pause, aiOff, human, Fin, and already-replied skips still return before the guard. Baseline FAQ, forward, and status bytes are not rewritten.

## Checks

23 R20 tests passed. `node --check` passed on the guard and the test. `git apply --check` passed on the proposed diff from the repo root. `git diff -- luna-current/01_runtime/index.js` is empty.

FAQ harness: **0 diffs / 258** ordinary replies. Forward and status harness, with welcome prefixes, across the thread languages: **0 diffs / 1680**. `locksOk()` is true. `STATUS.approved` and `result.approved` stay false.

The frozen R13 through R19 author suites were re-run and passed. The escalate-related selftest passed with the unrelated cases leaving `supersedesAwaiting` false, including the Roman Urdu follow-up.

This suite is not the independent review, and this candidate is not approved.

## Implementation hashes

These hashes are of the files below. `SHA256SUMS.txt` is written after this report and also lists this report. The checksum file's own hash is not in this report.

| File | SHA256 |
| --- | --- |
| `payoutClaimGuard.js` | `f4054b71b72738cee9ce6316df50721c07a2e570d859e75d315f1160bea9029b` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `payoutClaimGuard.test.js` | `31e19268b2eaa78a3b31b8080a8908fbcf8d6a5d59f819395b34ad5bc211f564` |
| `index.js.public-sends.diff` | `0d2e4df51cf9fee0770cd2064bfb4ded13b591c1f16356995b4cadb7904ce02a` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `8faafb089405f3e358316936548526a2d2b7f37f702041bef087deced49190bc` |
| `luna-current/07_selftests/selftest-escalate-related-only.js` | `0162932cfa9da912a7faf8d0b2178a079ce9e92fafbd1a0376fef87e88271f7c` |
| `luna-current/07_selftests/selftest-identity-before-escalate.js` | `6d410200bfd6887237e2876b79f7199a0cc26a7d24c934d6323aacdd50fdd950` |
