# Independent review — fixed-message handoff R16

Verdict: **NEEDS CHANGES**

This is not a PASS. The acceptance gates for product-critical misses, duplicate public posts, and recovery failures are above zero. It is not a FAIL on safety: the canary never left the process, the network tripwire stayed at zero, no invented or wrong-concept figure was posted, no second seat was landed, and no stable case that passes on both R14 and R15 fails on this candidate.

Candidate: `cursor/t800-handoff-r16` at `4874c418ea1114df9bf0dac521abafff01a663de` (PR #93). Reviewer worktree only. No `review/*` branch was read. No merge, deploy, VPS, Intercom, or secret was used.

## Gates

| Gate | Result |
| --- | --- |
| Product-critical | **33** |
| Leaks (canary in a note, assignment, comment, or model prompt) | **0** |
| Duplicate public posts | **4** |
| Duplicate landed assignments | **0** |
| Recovery failures | **15** |
| Candidate-only regressions versus R14 and R15 | **0** |
| Author suites R2–R16 | **pass** |
| Repair suite | **58/58 checks, 2 known selftest failures** |
| Network tripwire | **0** |

Product-critical means the customer-visible result on this candidate is wrong for the sealed contract: a human-agent request without the locked line, the locked line in the wrong language, an extra public post, silence where a public answer was required, or a supported same-concept figure replaced by the hedge. Two sealed leak cases are reviewer-oracle defects and are excluded from this count. They are described below.

A candidate-only regression is a `contract: "stable"` case that fails on R16 and passes on both R14 (`9c83804f32674f529fb1d03e7bd75db7c74add8a`) and R15 (`171d1009a126d75728f8f006943b46caebfffc13`). There are none. All 35 assertion failures have the same visible text on R14, R15, and R16.

## What was verified

Report file `luna-current/10_synthetic_lanes/fixed-message-handoff-r16/FM_R16_REPORT.md` sha256:

`38f77eb9c815f30578fd5bfad324fcbfef0c4ebe3e1381ae4dd96218862a1ced`

That is the hash in the commit message of `4874c418ea1114df9bf0dac521abafff01a663de`. The report says frozen for independent review, not approved. `approved` and `release` stay false. The fourteen file hashes in that report were recomputed from the candidate tree. All fourteen match:

| File | sha256 |
| --- | --- |
| `luna-current/01_runtime/fixedMessageHandoff.js` | `1dc8922028cf4dbc80f5788d0dfd5dc746a96ffb0d1c97b2ae6e4fbd40e73238` |
| `luna-current/01_runtime/index.js` | `403b95586aa8946bb383a383ec728f644912ec4004edaf104d2bef8bdd03b83a` |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` |
| `luna-current/02_statePresend/policyEvidence.js` | `8363ce61f920e403064ec6cb63d6d9a24b36af07cfc69f233696d08fb1a24d98` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r16/fixedMessageHandoff.test.js` | `158612c0033d9cc73dfde0d57a2465b6bab714974240cd94aa826bc8576c9513` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r15/fixedMessageHandoff.test.js` | `6c12916e2a2f9456293577a5be84e887a7440cd61548e9ce2681da7eaa1d37f4` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r14/fixedMessageHandoff.test.js` | `c92bcba2b2735e851a9d9b0dc67fad1014b65b7fc6a52d27e873e7adb34a13f7` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r13/fixedMessageHandoff.test.js` | `0db271306d7bedda5709dc46cf88ac54c607d587bd454ec8fc1ff244433dbbfa` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r3/fixedMessageHandoff.test.js` | `0b68d32b55f064eb3a08c53e7b4e5e125f16ff0236ee5ceed7ffa741ca49e2b5` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |

## Sealed set

Written and committed in `0e8a837a8cf0951012e10eed8ef97738323ae43b` before `handleWebhook` was loaded.

| Item | Value |
| --- | --- |
| File | `independent-review/handoff-r16/sealed-cases.json` |
| sha256 | `c91f360ac8d94c61f4f966f9ffb4f0aee728d5c53d49b9cd7899623c8cbd9e1b` |
| Cases | 320 |
| Recovery | 177 |
| Stable contract | 198 |
| R16 contract | 122 |

The case file was not edited after that commit. The runner was corrected afterward so the recorded payloads could be judged: assignment requests are keyed `assignment` and the script says `assign`; a landed comment body is `body`, not `data.body`; the runtime mirror keeps `02_statePresend` on the parent of `01_runtime` and also copies it inside the runtime. Those edits do not change any expectation.

Harness: real `handleWebhook` from `luna-current/01_runtime/index.js`, axios recording of method, URL, and body, a stub model, and a tripwire on `net`, `dns`, `http`, `https`, and `child_process`. Live FAQ fetches return 404 so the local FAQ markdown is used. Control is an explicit unpaused file. Signature mode is off. Tokens are the dummy string `stub-not-a-secret`.

R16 result: 320 cases, 285 pass, 35 fail, 0 leaks, 4 duplicate public posts, 15 recovery failures, 0 tripwire. Same seal hash on the R14 and R15 runs.

## What R16 holds

These are the behaviors the freeze report claims, and the sealed webhook run agrees.

- Tied challenge questions post the clarifier on the welcome path and on the non-welcome path, including `How can I pay for the challenge?`. Welcome text is `Hello, Please tell me which challenge you mean.` Non-welcome text is `Please tell me which challenge you mean.` R14 and R15 post nothing for that question.
- An unlanded assignment timeout or HTTP 500 retries the stored line. An English retry after an Urdu handoff still posts `یہ گفتگو اب ایک ساتھی کے پاس ہے۔` R15 posts the English line. R14 posts nothing. The same stored-line result holds for Arabic, Hindi, Roman Urdu, and Hinglish, and for note timeout and note 500.
- A later turn after an unlanded assignment, including a FAQ turn, posts only that owed line. `rec-pending-faq-ur` visible text is the Urdu line alone. R14 and R15 post nothing.
- A second failure on the same handoff stays silent. It does not post `A teammate can help with that.`
- Comment 422, 429, 500, timeout, error-list, and null-data each land the owed line once after the seat is already assigned. HTTP 429 produces extra transport attempts. The landed comment count stays one.
- Ticket wipe, removed note, human reply during recovery, wrong-seat, error-list, and null-data writes behave as sealed. Human replies and owner spoofs post nothing. The canary in the spoofed note is not copied out.
- Bounded assignment timeout and bounded note timeout stop inside the retry bound and post no customer line. `bounded-note-timeout` makes 6 note attempts and no comment.
- Password-policy questions stay on the model answer. They are not a handoff and not a clarifier.
- The three KB asks (daily loss limit, profit target, leverage) return the local article on both paths.
- Invented and wrong-concept figures are hedged. R14 and R15 post them. Examples on R16: `fig-welcome-invented-99` hedges, while R14 posts `Hello, The daily drawdown is 99%.` `fig-welcome-wrong-8-as-daily` hedges, while R14 posts `Hello, The daily drawdown is 8%.`
- Spelled-out supported figures pass. `fig-welcome-daily-5` posts `Hello, The daily drawdown is 5%.` `fig-welcome-max-8` posts `Hello, The max drawdown is 8%.` The non-welcome twins post those sentences without the Hello prefix.
- First-turn and `user.created` handoffs are byte-exact in English, Urdu, Arabic, Hindi, Roman Urdu, and Hinglish. Account-number questions post the MT5 email line, including during recovery.

Passing buckets on R16 include handoff-first 12/12, handoff-created 12/12, assign-500 language 18/18, assign-timeout language 18/18, note-500 6/6, note-timeout 6/6, note-timeout language 12/12, pending-faq-only-line 6/6, comment 422/500/timeout/429 6/6 each, wipe-ticket 6/6, removed-note 6/6, human-silent 6/6, write-validation 18/18, clarifier welcome 8/8, clarifier non-welcome 8/8, KB welcome 3/3, KB non-welcome 3/3, figure-reject welcome 7/7, figure-reject non-welcome 7/7, owner-spoof 6/6, silence 4/4.

## Product-critical misses (33)

### 1. Non-English handoff after a prior bot reply (7)

English and Roman Urdu still hand off. The log is `FORCE_ESCALATE client_wants_human`. Urdu, Arabic, Hindi, and Hinglish do not. `clientRequestedLiveAgent` matches English live-agent phrasing and the light Hinglish cue `insaan se baat`. It does not match Urdu, Arabic, Hindi, or `insan se baat`. Those turns fall through to the stub model.

| Id | Visible |
| --- | --- |
| `first-nonwelcome-ur` | `I can help with that.` |
| `first-nonwelcome-ar` | `I can help with that.` |
| `first-nonwelcome-hi` | `I can help with that.` |
| `first-nonwelcome-hinglish` | `I can help with that.` |
| `first-nonwelcome-ur-alt` | `I can help with that.` |
| `first-nonwelcome-ar-alt` | `I can help with that.` |
| `first-nonwelcome-hi-alt` | `I can help with that.` |

No note and no assignment. The owed line for these languages is the Urdu, Arabic, or Hindi locked line. Same visible text on R14 and R15. Stable contract. Bucket `handoff-nonwelcome` is 5 pass / 7 fail. The five passes are English, Roman Urdu, and their alternate phrasings.

### 2. Op-store loss posts the English line (15 recovery failures)

Ticket-only wipe recovers the right language (6/6). Wiping the op store, wiping the ticket and the op store, or restarting after the op store is gone logs `FIXED_HANDOFF lost-state completion` and posts `A teammate now has this conversation.` for Urdu, Arabic, Hindi, Roman Urdu, and Hinglish. English still recovers (the one pass in each of those buckets).

Examples:

| Id | Visible | Owed |
| --- | --- | --- |
| `rec-wipe-op-ur` | `A teammate now has this conversation.` | `یہ گفتگو اب ایک ساتھی کے پاس ہے۔` |
| `rec-wipe-both-ar` | `A teammate now has this conversation.` | `هذه المحادثة الآن لدى أحد الزملاء.` |
| `restart-op-hi` | `A teammate now has this conversation.` | `यह बातचीत अब एक साथी के पास है।` |
| `rec-wipe-op-roman-ur` | `A teammate now has this conversation.` | `یہ گفتگو اب ایک ساتھی کے پاس ہے۔` |
| `restart-op-hinglish` | `A teammate now has this conversation.` | `یہ گفتگو اب ایک ساتھی کے پاس ہے۔` |

The full set is `rec-wipe-op-*`, `rec-wipe-both-*`, and `restart-op-*` for `ur`, `ar`, `hi`, `roman-ur`, and `hinglish`. Same visible text on R14 and R15. These 15 are the recovery-failure count.

### 3. Two public posts after a missed non-welcome handoff (4)

The first turn posts the stub. A later English retry then hands off in English. The customer receives two posts. One assignment lands, on the second turn.

| Id | Visible |
| --- | --- |
| `dup-nonwelcome-ur` | `I can help with that.` then `A teammate now has this conversation.` |
| `dup-nonwelcome-ar` | `I can help with that.` then `A teammate now has this conversation.` |
| `dup-nonwelcome-hi` | `I can help with that.` then `A teammate now has this conversation.` |
| `dup-nonwelcome-hinglish` | `I can help with that.` then `A teammate now has this conversation.` |

These four are the duplicate-post count. They are two different bodies, not two copies of the locked line. Same visible text on R14 and R15.

Assignment HTTP attempts above 1 on the passing recovery cases are the failed timeout or 500 plus the later retry. The landed assignment count matches the sealed expectation of one. `bounded-note-timeout` stops at 6 note attempts. Comment 429 records extra transport attempts and still lands one comment.

### 4. Unique-rank FAQ goes silent (2)

Tied ranks post the clarifier. `How does the challenge work?` is not a tie. Presend logs `codes=MISSED_QUESTION final=needs-escalate` and `PRESEND_MISSED_ESCALATION_ESCALATE`. Nothing is posted.

| Id | Visible |
| --- | --- |
| `faq-unique-welcome` | empty |
| `faq-unique-nonwelcome` | empty |

Same empty result on R14 and R15. The tied-FAQ requirement holds. This pair is a separate silence on a question the sealed set required to be answered.

### 5. Acronym DLL and MLL drafts are hedged (4)

This is the hole in the R16 figure claim. The binder in `policyEvidence.js` maps `dll` to the daily-loss concept and `mll` to the max-loss concept. These four drafts never get that far. Presend logs `codes=MISSED_QUESTION final=faq-miss-hedge`. The customer is told the figure cannot be confirmed. The number in the draft is the supported one: DLL 5% and MLL 8% are in the drawdown evidence. Spelled-out `daily drawdown is 5%` and `max drawdown is 8%` are posted. `DLL is 8%` and `MLL is 5%` are correctly hedged as the wrong concept (`fig-welcome-dll-word-8`, `fig-welcome-mll-word-5`).

| Id | Visible |
| --- | --- |
| `fig-welcome-dll-5` | `I can't confirm that figure from the approved details, so I won't guess a number.` |
| `fig-welcome-mll-8` | `I can't confirm that figure from the approved details, so I won't guess a number.` |
| `fig-nonwelcome-dll-5` | `I can't confirm that figure from the approved details, so I won't guess a number.` |
| `fig-nonwelcome-mll-8` | `I can't confirm that figure from the approved details, so I won't guess a number.` |

R16 contract. R14 and R15 show the same hedge, so this is not a candidate-only regression. It is still an unmet allow-rule: a public `DLL is 5%` or `MLL is 8%` bound to the matching concept is replaced by the hedge. No invented number is posted. Bucket `figure-allow-welcome` is 5 pass / 2 fail, and the non-welcome twin is the same.

### 6. Arabic handoff plus a password label does not hand off (1)

`leak-handoff-ar` text is `أريد التحدث إلى موظف password: S3cretCanary77`. Visible text is `السلام علیکم، I can help with that.` No assignment. The canary is absent from the note, the assignment, the comment, and the model prompt (`leak` is false). The same Arabic sentence without the password label hands off on the first turn. Same visible text on R14 and R15.

## Reviewer-oracle defects (2)

These two failures are not product bugs and are not leaks.

`leak-handoff-roman-ur` and `leak-handoff-hinglish` both send the English sentence `I need a human agent. password: S3cretCanary77`. The runtime posts `A teammate now has this conversation.` and does not copy the canary. The sealed expectation asked for the Urdu line. The case text is English, and the English locked line is the line that sentence selects. Counted in the 35 assertion failures. Excluded from the product-critical count and from the leak count.

## Author suites

Run on the candidate tree at `4874c418ea1114df9bf0dac521abafff01a663de`:

| Suite | Result |
| --- | --- |
| R2 | 16 passed |
| R3 | 33 passed |
| R4 | 10 passed |
| R5 | 8 passed |
| R6 | 9 passed |
| R7 | 9 passed |
| R8 | 7 passed |
| R9 | 5 passed |
| R10 | 7 passed |
| R11 | 5 passed |
| R12 | 6 passed |
| R13 | 3 passed |
| R14 | 10 passed |
| R15 | 3 passed |
| R16 | 4 passed |

`luna-current/08_repair_tests/run-suite.js`: hashFail 0, syntaxFail 0, adversarialFail 0, current checks 58 pass / 0 fail, selftestFail 2. The two failures are the pre-existing ones: `selftest-identity-before-escalate.js` (missing `I've forwarded this to a teammate`) and `selftest-lock-harden.js` (missing `postProcessModelReply(lockedFinHandoffWelcome`). The suite process exits 1 because of those two.

## Changes required before this can pass

1. A draft that says `DLL is 5%` or `MLL is 8%` against evidence that contains those figures for the same concept must be posted. Today `faq-miss-hedge` replaces it. Wrong-concept and invented figures must keep hedging.
2. A Urdu, Arabic, Hindi, or Hinglish human-agent request after a prior bot reply must post that language's locked line. Today those four post `I can help with that.` and a later English retry adds the English locked line.
3. Lost-state completion after an op-store wipe must keep the language of the original customer text. Today it posts the English locked line for every non-English case in `rec-wipe-op`, `rec-wipe-both`, and `restart-op`.
4. `How does the challenge work?` must get a public answer. Today the missed-question escalation posts nothing. Tied challenge questions already post the clarifier and must stay that way.
5. An Arabic handoff sentence that also carries a `password:` label must still post the Arabic locked line, with the secret redacted. The canary already stays out of the payloads.

Items 2 through 5 are already present on R14 and R15. Item 1 is the R16 allow-rule that this freeze does not meet for the acronym wording. None of the five is a candidate-only regression.
