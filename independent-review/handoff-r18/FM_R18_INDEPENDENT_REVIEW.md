# Independent review — fixed-message handoff R18

Verdict: **NEEDS CHANGES**

Reviewer is not the author. Candidate `cursor/t800-handoff-r18` at `c7fe62e7daedca4452a28acf706bc5f613a2f805` (PR #99). No review/* branch was read. No merge, deploy, VPS, live Intercom, or real secrets.

The safety gates hold. The three behaviors R18 claims to have fixed do not all hold when the real `handleWebhook` runs. Author unit tests pass because they do not drive that webhook.

## Hashes

`luna-current/10_synthetic_lanes/fixed-message-handoff-r18/FM_R18_REPORT.md` sha256 `ef3b5a839c3d311ee01d987dde566305b8457f814283476c74a4b6327e2c8155`. Matches `c7fe62e`.

All 11 file hashes listed in that report match the same commit:

| File | sha256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `5085977159bad894d66be9fdd7d64c53fade2c4359baeebf5245a943c8f98ded` |
| `luna-current/01_runtime/index.js` | `af12a4d99fe7934fa99a8507069f3ae53c6118ff8f9e81e105305fa1a47e0aa2` |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` |
| `luna-current/02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r18/fixedMessageHandoff.test.js` | `14951e209bc1f222010603edb951cecb66f92c52b82beaba0361fc9af35f78a2` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r17/fixedMessageHandoff.test.js` | `f6d662599735fef452636d95b06ef8e1047eb0714539145ec4b5691e2a12bb5e` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |

R17 base used for comparison: `91c1bab3ac2d768ce2f4f8b40bf821bac1cccbd0`. R16 freeze: `4874c418ea1114df9bf0dac521abafff01a663de`.

## Sealed set

Written and committed before any `handleWebhook` run. Not regenerated after results.

- File: `independent-review/handoff-r18/sealed/cases.json`
- sha256: `adcc4363c051a7945a3d1adf68eb56f6e717be5649f535988a8f2a7d83749e31`
- 593 cases, 204 recovery
- Classes: human-request 240, password-policy 81, fin-wait-silence 5, figure-supported 10, figure-withheld 6, faq-unique 10, faq-tie 2, silence 6, owner-spoof 5, write-validation 24, recovery 204

The runner calls the real `handleWebhook` with a recording axios transport (exact request bodies), a stub model, and a network tripwire on `fetch`, `http`/`https`, `net`, and `dns`. Tripwire hits: 0. Worker crashes: 0.

One harness correction was applied after the seal, without touching `cases.json`. Assignment scripts were keyed `assign` while Intercom sends `message_type: "assignment"`, so the first pass treated every assignment failure as success. The scorer also treated a byte-exact multi-line article as a line mismatch after whitespace folding. Both were fixed and the suite was re-run. The numbers below are from that re-run.

## Gate counts

| Gate | Result |
|---|---|
| Product-critical | **0** |
| Credential or customer-payload leaks | **0** |
| Duplicate customer posts or landed assignments | **0** |
| Recovery failures | **0** (204/204 on R18 and on R17; R16 was 68/204) |
| Candidate-only regressions versus R16 and R17 | **0** |
| Author suites R2–R18 | **pass** |
| Repair suite | adversarial 58/58; 18 selftests pass; the 2 known selftests fail |

Product-critical means a customer-visible secret, a second customer post, a second landed assignment, a customer line posted without a landed assignment, a locked line in the wrong language, or an invented or wrong-concept figure posted.

Sealed scorer: **512 / 593 passed, 81 failed**. The split of those 81 is below. Product-critical stays 0.

R18 is not worse than R17 on this set. Every sealed case that fails on R18 also fails on R17. No baseline case fails on R18 after passing on both R16 and R17.

## What R18 got right on the webhook

Human requests in English, Roman Urdu, Urdu, Arabic, Hindi (Devanagari “एजेंट”), and Hinglish hand off on Fin-wait (`conversation.user.created`), welcome, and later turns. The locked line matches the language, is byte-exact, and is one post after one landed assignment. Labeled canary `Kx9canaryR18Value` is absent from notes, assignments, customer comments, and model prompts. Example that the report names: `मुझे एजेंट से बात करनी है password: Kx9canaryR18Value` posts `यह बातचीत अब एक साथी के पास है।` once.

A usable password-policy draft is posted. `Can you explain the password policy?` with model text `Passwords must include letters and numbers.` posts that sentence (welcome adds the existing Hello prefix). Other ordinary wordings with a usable draft do the same. 72/81 password cases pass.

Invented and wrong-concept figures stay off the customer thread and do not hand off. `The DLL is 99%.` and `The daily drawdown is 8%.` on `What is the DLL on the 2-step challenge?` do not post. 6/6 withheld.

Unique-rank articles post for holding time, daily loss limit, and profit target, byte-exact on later turns. The tie clarifier `Please tell me which challenge you mean.` is byte-exact on a later turn. Silence, foreign seat, human-already-replied, and owner spoof post nothing (6/6, 5/5) and the spoof canary does not leave in a payload.

Recovery is 204/204. Unlanded assignment timeout and 500 withhold the line. A wiped store or a removed note still completes in the original language. A landed seat with an owed line posts that line once. Comment 422, 429, 500, and timeout still post the owed line once. A human reply during an unlanded assignment stops the retry. Replays do not add a second post or a second assignment. Assignment timeout stops at 6 HTTP attempts with no customer line.

Bad assignment writes (malformed 200, wrong seat, error list, 422) do not post the customer line. A malformed or error-list customer comment is not posted. The assignment before that comment does land, which is the note-then-assign-then-comment order. Six sealed rows required zero assignments for those comment failures. That counter is stricter than the write rule. The customer line stayed withheld. The same six fail on R17.

## Why this is not a pass

### 1. Supported figures still become the number hedge

10/10 supported-figure cases fail on R18, and they also fail on R16 and R17. `supportedFigureDraft("The DLL is 5%.", knowledge)` returns `The DLL is 5%.` for the FAQ block this question retrieves (`isClearKbFaqAsk` is true; the block contains the LITE 2-step limits and other 5%/3%/8% text). `The DLL is 99%.` and `The daily drawdown is 8%.` correctly return empty.

`handleWebhook` never reaches that check. In `luna-current/01_runtime/index.js` the missed-escalation branch posts `UNSUPPORTED_NUMBER_HEDGE` and returns when the question is a clear KB FAQ ask, before `__postFig`. Observed customer body on welcome and later turns:

`I can't confirm that figure from the approved details, so I won't guess a number.`

No handoff. The author test passes by calling the helper, not the webhook. The R18 claim “a supported figure posts as itself” is not true on this path.

### 2. Password policy is still silent, or still the hedge, when the draft is empty or is the hedge

`passwordPolicyPublicLine` would drop a terminal hedge and an empty draft and return `Which part of the password policy should I explain?`. The webhook only calls it inside the missed-escalation clarifier branch. A normal send of the hedge, or an empty draft that never enters that branch, does not.

Observed, all introduced for R18, all still failing on R18 (and on R17):

- `Can you explain the password policy?` with the hedge as the model draft posts the hedge. Same for `Please explain the password requirements.` and `what is the password policy?` (welcome and later).
- The same three questions with an empty model draft post nothing (`policy-later-313`, `policy-later-316`, `policy-later-319`).

72 other wordings with a usable draft do post an answer. The “never silent” claim is not met for an empty draft.

### 3. Hindi with the Latin role word `agent` is not a handoff

`isHumanAgentRequest("मुझे agent से बात करनी है")` is false. `stripLatinNoise` keeps `agent` (five letters), and the detector still does not treat the sentence as a human request. Fin-wait posts nothing. Welcome posts `Hello Synthetic, I can help with that.` Later posts `I can help with that.` The same happens with `password: Kx9canaryR18Value` attached. Six cases, all tagged as R18 work, all fail. The Devanagari spelling `एजेंट` does hand off. The report’s sentence that short Latin `agent` stays so the Hindi request can still name the role is not what the webhook does.

### Pre-existing misses (not R18 regressions)

These fail on R18 and on R17. They are not candidate-only.

- `janab mujhe agent chahiye` is not detected, plain or with a secret or noise. Fin-wait is silent. Welcome posts `Salam Synthetic, I can help with that.`
- `please get me a human` is a handoff when it is the whole message. With `password: Kx9canaryR18Value` or `Zq8LatinNoise88ab` it is not. Fin-wait stays silent. Welcome and later post the model line and do not assign.
- Four FAQ bodies differ from the markdown article by a removed U+200B: `How does the challenge work?` and `What is the leverage?`, welcome and later. The rest of the article is posted. Holding time, daily loss limit, and profit target are byte-exact.
- Welcome tie clarifier is `Hello Synthetic, Please tell me which challenge you mean.` The later turn is the clarifier alone.
- Unlabeled noise `Zq8LatinNoise88ab` remains in the internal note Problem field for English and Hinglish (30 cases). The customer comment is the locked line and does not contain it. Label redaction does not remove an unlabeled token, and English notes are not rewritten. Counted separately from credential leaks. Not new on R18.

## Author suites

Run from the candidate tree at `c7fe62e`.

`node --check` passed on `fixedMessageHandoff.js` and `index.js`.

`fixedMessageHandoff.test.js` for R18 through R2: all exited 0. R18 itself reports 3 passed. Those tests do not call `handleWebhook`.

`node luna-current/08_repair_tests/run-suite.js`: protected prompt and FAQ hashes match, syntax check passed, adversarial `current_checks.js` passed, 18 selftests passed. Exit code 1 from the two pre-existing failures:

- `selftest-identity-before-escalate.js` looks for `I've forwarded this to a teammate` and does not find it.
- `selftest-lock-harden.js` looks for `postProcessModelReply(lockedFinHandoffWelcome` and does not find it.

No other selftest failed.

## Conclusion

R18 is not ready to freeze. Recovery, write withholding, silence, spoofing, secret redaction, and the Devanagari password handoff hold, with zero candidate-only regressions against R16 and R17. The webhook still hedges a figure that `supportedFigureDraft` would post, still goes silent or posts the number hedge for some password-policy drafts, and still misses `मुझे agent से बात करनी है`.
