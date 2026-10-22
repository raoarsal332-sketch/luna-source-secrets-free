# Independent review: fixed-message handoff R17

**Verdict: NEEDS CHANGES**

Candidate `cursor/t800-handoff-r17` at `91c1bab3ac2d768ce2f4f8b40bf821bac1cccbd0` (PR #96). This review did not read any `review/*` branch. Nothing was merged, deployed, or sent to a VPS or Intercom. No production secret was used. The canary below is a synthetic marker.

The candidate is not a pass. Seven sealed cases miss a customer-visible outcome. None of those seven are new relative to R16, and none leak the canary, double-post a locked line, or drop a recovery. Author suites R2–R17 pass. The repair suite’s two selftest failures are the pre-existing ones.

## Report and file hashes

`luna-current/10_synthetic_lanes/fixed-message-handoff-r17/FM_R17_REPORT.md` sha256 is `d537af472b750bd0e157790d9d6486f699d816703b61be3a7d4e4c09686df0fa`. That matches the claimed report hash.

Every file hash listed in that report matches the tree at this commit:

| File | sha256 |
| --- | --- |
| `luna-current/01_runtime/fixedMessageHandoff.js` | `065bf0ee2a67ac8d642ef1c2bac73f4fb72e63ae86d1dd61d961d33a197caa24` |
| `luna-current/01_runtime/index.js` | `0b505e1a2f1afb84b5717214a66ba8e080dd4c0039020ec19f8b41d814be186c` |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` |
| `luna-current/02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r17/fixedMessageHandoff.test.js` | `f6d662599735fef452636d95b06ef8e1047eb0714539145ec4b5691e2a12bb5e` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r16/fixedMessageHandoff.test.js` | `158612c0033d9cc73dfde0d57a2465b6bab714974240cd94aa826bc8576c9513` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |

## Sealed set

Written and committed in `325c053ca0af6d22a31060eb83162e6e61b36306` before any scored run of this candidate. The case file was not edited after that commit.

- Path: `independent-review/handoff-r17/sealed-cases.json`
- sha256: `ff6e51e2e6a99c06f68a90dc22443765def84c574deb820322f65d5682e9b1eb`
- 423 cases, 222 of them recovery
- Canary: `CANARYR17SEAL7f3a9c2e`

Group sizes: human-agent 72, secret 36, recovery-unlanded-timeout 48, recovery-unlanded-500 24, recovery-unlanded-422 12, recovery-comment 24, recovery-wipe 18, recovery-restart 12, recovery-pending-owed 24, recovery-human-silent 12, recovery-duplicate 6, recovery-removed-note 6, recovery-write-validation 18, recovery-account-exempt 6, recovery-bounded 6, recovery-seed-restart 6, faq-unique 14, faq-tie 4, faq-kb 6, figure-policy 36, figure-webhook 6, password-policy 8, silence 9, owner-spoof 6, byte-exact 2, account-question 2.

## How it was run

The runner calls the exported `handleWebhook` in `luna-current/01_runtime/index.js`. Axios is replaced in-process. Allowed hosts are `api.intercom.io` and `faq.fundedelite.com` (the FAQ host returns 404 so the local FAQ file is used). Any other URL, `net.Socket.connect`, or `dns.lookup` is a tripwire. The model is a stub. Customer-model calls are those whose system text is not the internal-note rewrite prompt. Assignment replies use a numeric inbox seat, `7007007`, because `Number(assigneeId)` is what the live assignee check compares.

Figure-policy cases call `unsupportedPublicFigures` directly. Every other case is a webhook.

Scored run: 416 passed, 7 failed, 19827 ms. No tripwire fired.

## Gate counts

| Gate | Count | Notes |
| --- | ---: | --- |
| Product-critical | 7 | The seven cases below. Not zero, so this is not a pass. |
| Leaks | 0 | Canary absent from every recorded transport body and model message. |
| Duplicate posts | 0 | No case posted a second customer comment. |
| Duplicate assignments | 0 | No case confirmed two assignments. |
| Unexpected assignments | 4 | One assignment each, where the oracle required zero. See figures. |
| Recovery failures | 0 | 222/222 recovery cases passed. |
| Candidate-only regressions vs R15/R16 | 0 | The same seven fail on R16. R15 fails those seven and also `fig-webhook-5`, which R16 and R17 pass. |

The harness tags an assignment as `duplicate-assignment` whenever the confirmed count is above the oracle. On the four figure cases the oracle is 0 and the product confirmed 1. That is one forbidden handoff, not a second copy of a completed handoff. Recovery replay cases stayed at one post and one assignment.

## The seven misses

### 1. Hindi human request plus a password on the first message

`sec-hi-first-password` (group `secret`).

Customer text: `मुझे एजेंट से बात करनी है password: CANARYR17SEAL7f3a9c2e`

Topic: `conversation.user.created`.

Expected: one public post, byte-exact `यह बातचीत अब एक साथी के पास है।`, one confirmed assignment, no customer-model call, canary absent.

Actual: no public post, no assignment, no model call. Log: `SKIP fin-wait user.created`.

`isHumanAgentRequest` on that text is true, because secret stripping leaves the Hindi ask. `shouldWaitForFin` does not use that check. It calls `isPureLiveAgentAsk` on the raw text. The raw text has 23 Latin letters and 20 Devanagari letters, so `detectLanguage` returns `en`, the English grammar does not see `एजेंट`, and the Fin wait swallows the turn before handoff.

The same sentence on a welcome turn and on a later turn (`sec-hi-welcome-password`, `sec-hi-later-password`) posted the Hindi line once. English, Urdu, Arabic, Roman Urdu, and Hinglish first-message secret cases also passed. The hole is specifically a non-Latin ask whose secret’s Latin letters outnumber the script letters, on `conversation.user.created`.

The same case fails the same way on R16 `4874c418` and R15 `171d100`.

### 2–5. A supported figure draft is replaced by a teammate handoff

`fig-webhook-0` through `fig-webhook-3` (group `figure-webhook`).

Customer text, later turn: `Tell me the DLL and MLL for the 2-step product.`

| Case | Stub draft | Expected | Actual |
| --- | --- | --- | --- |
| `fig-webhook-0` | `The DLL is 5%.` | public text contains `5%`, no assignment, not the hedge | note 200, assign `7007007` 200, one customer comment, `5%` absent |
| `fig-webhook-1` | `The MLL is 8%.` | contains `8%`, no assignment | same handoff, `8%` absent |
| `fig-webhook-2` | `The daily loss limit is 5%.` | contains `5%`, no assignment | same handoff, `5%` absent |
| `fig-webhook-3` | `The max drawdown is 8%.` | contains `8%`, no assignment | same handoff, `8%` absent |

Log on each: `PRESEND_MISSED_ESCALATION_ESCALATE` reason `needs-escalate`, then `FIXED_HANDOFF sent missed_escalation`. The question asks for two limits. The draft states one. Presend records `MISSED_QUESTION`. The number itself is supported by the FAQ, so the unsupported-number hedge does not run, and the hold becomes a fixed-message handoff. The customer comment is the English locked line, which has no percent.

`fig-webhook-4` (`The daily drawdown is 99%.`) and `fig-webhook-5` (`The daily drawdown is 8%.`) passed: the bad sentence was not posted, and there was no assignment. The 36 direct `unsupportedPublicFigures` cases also passed, including DLL/MLL/daily-drawdown/max-drawdown binding against `DLL 5%/3%, MLL 8%.`, `daily loss limit of 5%` / `max loss limit of 8%`, and `5% daily loss limit` / `8% max loss limit`.

The same four webhook misses fail on R16 and R15. R15 additionally hands off `fig-webhook-5`. R16 and R17 withhold that sentence and do not assign. That R16 fix is still present.

### 6–7. “Can you explain the password policy?” is silent

`pw-welcome-402` and `pw-later-403`.

Customer text: `Can you explain the password policy?`

Stub body: `Use a strong password and do not share it.`

Expected: that sentence posted once, no assignment, not a locked line and not the hedge.

Actual: no public post. Log: `AI_ACTION REPLY ACCOUNT`, presend `MISSED_QUESTION` / `needs-escalate`, then `PRESEND skip clarifier or password policy`.

`isPasswordPolicyQuestion` is true, so the missed-escalation branch returns without assigning. It posts a body only when that body is the challenge clarifier. The password answer is not a clarifier, so the turn ends with nothing.

These passed on both turns: `what is the password policy?`, `What are the password requirements?`, `password rules for the dashboard?`. The miss is this wording once presend holds the draft.

The same two cases fail on R16 and R15.

## What the sealed set did pass

- Human-agent requests: 72/72. English, Roman Urdu, Urdu, Arabic, Hindi, and Hinglish, on first, welcome, and later turns (a prior bot reply of `I can help with that.`). One locked line in that language, one assignment, no customer-model call before the post. Hinglish and Roman Urdu use the Urdu line.
- Secrets: 35/36. The canary stayed out of notes, assignments, customer comments, and model messages. Arabic, English, Urdu, Roman Urdu, and Hinglish requests that include `password:` / `pwd=` handed off in the request’s language, including the first message. Hindi did too, except the first-message case above.
- Recovery: 222/222. Unlanded assignment timeout, 500, and 422; comment 422, 429, 500, and timeout; op-store wipe and restart, with the original request’s language kept when the later turn is English; a landed seat that still owes the line; a removed note; a human public reply during recovery (next turn silent); duplicate webhook replay (no second post or assignment); bounded retries while every assignment times out (no customer line, attempts inside the bound); malformed, wrong-seat, and error-list assignment bodies; account-number question during a pending handoff still gets the account line.
- Pending handoff: hello, the challenge FAQ, and `what is the password policy?` each posted only the owed line.
- FAQs: 14/14 unique-rank questions posted the article, including `How does the challenge work?` and `How does the challenge/evaluation work?` (the participation sentence, no customer-model call). 4/4 ties posted the clarifier. 6/6 approved KB figure questions (`What is the daily loss limit?`, `How does the profit target work?`, `What is the leverage?`) posted one answer and not the hedge. None of these were silent.
- Silence: a human teammate already in the thread, Risk team, Escalations team, and a bare `any update?` with no pending handoff. 9/9.
- Owner spoof: six non-owner note authors, including a user with the bot id and an admin who is not an owner. No public post, canary absent. 6/6.
- Byte-exact spread replies: 2/2. Account-number questions on welcome and later turns: 2/2.
- Password policy other than the “explain” wording: 6/8.

## Author suites and the repair suite

`node luna-current/10_synthetic_lanes/fixed-message-handoff-rN/fixedMessageHandoff.test.js` for N = 2..17, all exit 0:

R2 16, R3 33, R4 10, R5 8, R6 9, R7 9, R8 7, R9 5, R10 7, R11 5, R12 6, R13 3, R14 10, R15 3, R16 4, R17 5.

Those R17 tests call `decide` / `commit` and the policy helper. They do not drive `handleWebhook`, so they do not see the Fin-wait bypass or the presend skip that failed the sealed cases.

`node luna-current/08_repair_tests/run-suite.js`: protected hashes pass, syntax pass, adversarial checks 58/58. Selftests 20 run, 18 pass, 2 fail:

- `selftest-identity-before-escalate.js` — source order assertion against `IDENTITY_BEFORE_ESCALATE asked missing` and `postProcessModelReply`.
- `selftest-lock-harden.js` — one assertion, `postProcessModelReply(lockedFinHandoffWelcome` is absent. The rest of that file passed.

Those two are the known pre-existing selftest failures. No other selftest failed.

## Why this is not a pass and not a fail

Not a pass: product-critical is 7. A Hindi human request that carries a password is silent on the opening message. Two password-policy turns are silent. Four figure questions that the stub answered with a supported percent are handed to a teammate instead.

Not a fail: leaks are 0, recovery failures are 0, and no handoff posted or assigned twice. The seven misses reproduce on R16, so they are not candidate-only regressions. R17 still holds the behaviors this sealed set was built to check: later-turn multilingual handoff, secret stripping on the handoff detector, owed-line language after a wipe, unique FAQ articles, tied-FAQ clarifiers, and concept-bound figures in `unsupportedPublicFigures`.
