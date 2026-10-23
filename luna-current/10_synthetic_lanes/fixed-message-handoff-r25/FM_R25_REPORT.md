# Fixed-message handoff R25 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: R24 at `3b8ea5131e350ff7e043298e4ecd2220473e925d` (PR #111). R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart of a live seat. Seat ids in the tests are synthetic. The R25 cases call `handleWebhook` with a mocked HTTP client and a temporary control file. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

## Owner rule

Luna's customer-facing lines are English only. Roman Urdu, Urdu, Italian, Arabic, Hindi, and every other non-English fixed handoff line are no longer selected. A handoff detected in any of those languages posts `A teammate now has this conversation.` A stored copy of an old translation is recognized so it is not posted again, and the retry posts the English line.

## What changed

1. **The only approved handoff line is English.** `FIXED_MESSAGES` keeps `en`. The old Urdu, Arabic, Hindi, and Italian sentences are in `RETIRED_HANDOFF_LINES`. They are never selected. Detection still marks a non-English human request as a handoff.

2. **Account facts, welcomes, identity, and promo replies are English.** An account-number question in any language gets the existing English MT5 fact, not a translation and not the handoff line. A non-English draft is not used as that fact. `lockedFinHandoffWelcome` and the first-reply greeting prefix are the English Hello line. Identity disclosure and personal-boundary lines are the English lines. September promo replies no longer have a Roman Urdu branch. The system prompt now tells the model to reply in English only. Its new SHA-256 is `bbd8b5b62eab08a43dafdded1f13889d8c4942e090ce9ada93137dc0a395f82f`. The previous protected hash was `bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d`. The FAQ file hash is unchanged.

3. **R23's shared leak and three over-redactions stay closed.** They were already fixed on R24 in `credentialSanitizer.js` (hash unchanged from the R24 report, `2d0b5b320634fa529d67247ff3c1c97969384feba0ab80dee77680d36dfe04c4`). R25 calls `handleWebhook` again for a stated `account11261292` / `Account11261293`, an unstated `account11261292` on the checking line, a U+0430 `password` label whose `FE81000033` is absent from the prompt and the public reply while `FE10482931` remains, and a U+200B pin that captures one value while `FE10482931` remains.

## Kept

Human-assignee suppression, a human public reply, and Risk / Escalations silence stay fail-closed. An ordinary knowledge path does not invent a payout figure: an ungrounded Arabic withdrawal draft that contains a number is replaced by the existing English hedge. Account questions are still decided before ownership silence. Value-based outbound scrubbing, the owed line from the op store, password-policy clarifiers, and raw FAQ bytes stay. The MT5 `55188` spread template still hedges unless the customer's own message is an eligible spread ask. A declared secret stays scrubbed on reuse.

## Tests

Counts below are the same as the R24 baseline for R2–R24. Suites that used to expect a translated customer line now expect the English line. The pass counts did not drop.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r25/fixedMessageHandoff.test.js`

7 passed, 0 failed. Each case calls `handleWebhook`.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r24/fixedMessageHandoff.test.js` — 24 passed, 0 failed. R24 baseline 24.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r23/fixedMessageHandoff.test.js` — 21 passed, 0 failed. R24 baseline 21.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r22/fixedMessageHandoff.test.js` — 14 passed, 0 failed. R24 baseline 14.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r21/fixedMessageHandoff.test.js` — 10 passed, 0 failed. R24 baseline 10.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r20/fixedMessageHandoff.test.js` — 6 passed, 0 failed. R24 baseline 6.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r19/fixedMessageHandoff.test.js` — 4 passed, 0 failed. R24 baseline 4.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r18/fixedMessageHandoff.test.js` — 3 passed, 0 failed. R24 baseline 3.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r17/fixedMessageHandoff.test.js` — 5 passed, 0 failed. R24 baseline 5.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r16/fixedMessageHandoff.test.js` — 4 passed, 0 failed. R24 baseline 4.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r15/fixedMessageHandoff.test.js` — 3 passed, 0 failed. R24 baseline 3.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r14/fixedMessageHandoff.test.js` — 10 passed, 0 failed. R24 baseline 10.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r13/fixedMessageHandoff.test.js` — 3 passed, 0 failed. R24 baseline 3.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r12/fixedMessageHandoff.test.js` — 6 passed, 0 failed. R24 baseline 6.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r11/fixedMessageHandoff.test.js` — 5 passed, 0 failed. R24 baseline 5.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r10/fixedMessageHandoff.test.js` — 7 passed, 0 failed. R24 baseline 7.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r9/fixedMessageHandoff.test.js` — 5 passed, 0 failed. R24 baseline 5.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r8/fixedMessageHandoff.test.js` — 7 passed, 0 failed. R24 baseline 7.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r7/fixedMessageHandoff.test.js` — 9 passed, 0 failed. R24 baseline 9.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r6/fixedMessageHandoff.test.js` — 9 passed, 0 failed. R24 baseline 9.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r5/fixedMessageHandoff.test.js` — 8 passed, 0 failed. R24 baseline 8.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r4/fixedMessageHandoff.test.js` — 10 passed, 0 failed. R24 baseline 10.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r3/fixedMessageHandoff.test.js` — 33 passed, 0 failed. R24 baseline 33.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.test.js` — 16 passed, 0 failed. R24 baseline 16.

`node luna-current/08_repair_tests/run-suite.js`

FAQ hash matches (`fundedelite-faqs.md` `8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92`). Prompt hash is the new English-only value above. Syntax check passed. Adversarial `current_checks.js` passed with `adversarialFail 0`. `selftest-identity-before-escalate.js` and `selftest-lock-harden.js` fail on the same missing source strings they already miss on the R24 freeze (`I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`). Those two failures are not new on this candidate. Suite line: `hashFail 0 syntaxFail 0 adversarialFail 0 selftestFail 2`.

## Unresolved

- No independent sealed review of this candidate. Author tests are not acceptance.
- `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js` is an unwired snapshot. It still contains the old Urdu, Italian, and Roman Urdu welcome strings. Runtime `index.js` does not. The R2 suite tests that snapshot, not the live welcome.
- Approved FAQ article bytes are still posted verbatim. The FAQ file contains Japanese help-centre text. A selected article in that script is not rewritten, because rewriting it would break the byte-exact FAQ path. There is no second outbound filter on free-form model text beyond the locked lines, the English account fact, the English hedge, and the prompt instruction.
- Jerry as an owner admin id was not changed.
- Nothing here was deployed.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `c50cbcc5e346783d3dfbd098921432cc7917b0a8d1219fd14d61e53f9b53c6df` |
| `luna-current/01_runtime/index.js` | `9e16836b5d37a720ea53dbf6094adf8d1da36d524c7612e34ca030f970696b79` |
| `luna-current/01_runtime/assistantIdentityGuard.js` | `f8353244129de257562f0ad4601df8ca1950ad2ba708ed3bdc52f03ab6363e18` |
| `luna-current/01_runtime/september-promos.js` | `84b6ab168b0f4ace178c7766c157061c6f6d828406d6fb52fdaebeb229c79cf3` |
| `luna-current/01_runtime/system-prompt.txt` | `bbd8b5b62eab08a43dafdded1f13889d8c4942e090ce9ada93137dc0a395f82f` |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `2d0b5b320634fa529d67247ff3c1c97969384feba0ab80dee77680d36dfe04c4` |
| `luna-current/02_statePresend/presendMega.js` | `b2706eac5141eb55b1c8b8f385c75f69ab3573bb38e0d5fea6e345ea5a61dedc` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r25/fixedMessageHandoff.test.js` | `b6edc8cb008a51bcae706637aa7d3b4934383c4a48c4cc75d53b39b25f299f2e` |
