# Independent review: Fixed-Message Handoff R12

Verdict: **FAIL**

The candidate is frozen at `b9ebaacc83e7d15f028799f7ba9139006ded19b7` (PR #74, `cursor/fixed-message-handoff-r12-8ad1`). This review did not merge, deploy, or call Intercom. No production, VPS, or live secret was used. The network tripwire stayed on for every corpus turn. The real `handleWebhook` ran against a recording transport and a stub model.

| Bar | Result |
| --- | --- |
| Product-critical failures | 20 |
| Credential leaks on R12 | 0 |
| Network tripwires | 0 |
| Candidate-only regressions | 6 |
| Unjustified R12-vs-R11 diffs | 0 |
| Recovery failures | 6 |
| Rollback signature mismatches | 0 |

PASS required every one of those to be zero. The rollback bar and the unjustified-diff bar hold. The product-critical, candidate-only, and recovery bars do not.

## Freeze

`FM_R12_REPORT.md` SHA-256 is `d7aed15654104837464cef92fb10ec14123c156f22148b2c6bb61abbb83794cd`. Every listed file hash matches the freeze:

| File | SHA-256 |
| --- | --- |
| `01_runtime/fixedMessageHandoff.js` | `a466d7665ef96808240ce8e7ec59f366eec359fdbba9f6bdf3536b7b022f1f4c` |
| `01_runtime/index.js` | `4bd065dd5e5b7d7c14ddf5de656c1a19c59ab1134c6fe4c16c27ea704425a0b0` |
| `01_runtime/writeOpStore.js` | `b69d7694880bbd1167f5df2cecb0d2b391ae83691e80d2d6ea889aeca73c4766` |
| `02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| author test (hash only, not read) | `fdccabdd442d3f3b6ed4fcc2c608f50e698c42a113d650a109ee57766dbb5e04` |
| `02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |

HEAD of the candidate worktree is `b9ebaac`. R11 is `1a5c35f754d5d5e80336a24b7371676e52ce9bf6`. Baseline main is `e999d3c8caf327bf9a102e5ba562d9c114a92109`.

## Seal

The sealed set is `independent-review/handoff-r12/cases.json`: 252 cases, all in the corpus, 27 isolated. SHA-256 `ac5640df66c279a572aa8ec79b69d1796944e1e5e2985a9812b8338b8e2efe7b`, committed in `b565d6f` before any scored run. `cases.json` and `SEAL.sha256` were not edited after that commit.

Two measurement bugs showed up in the first run and were corrected in the harness only:

- Follow-up turns wrote the default bot assignee back onto the conversation, so a landed assignment looked stale on the next delivery.
- Unapplied comment requests (429, 422, timeout, 500) were counted as public lines.

The verdict uses the re-run after those two corrections. State directories are keyed by the runtime path, so the R12, R11, main, and rollback runs did not share ticket files. Corrected R12 result: 198 passed, 54 failed.

## Part A

Silence holds for human-owned, human-reply, reopened, aiOff, paused, replies disabled, Risk, Escalations, Jerry (including a long Jerry note), stale and ambiguous ownership, teammate author, and a body with no part type. Owner spoofing by customer id, name, email, or a public comment does not set aiOff and does not post. Real Arsal and Jerry STOP notes set aiOff and stay off the public thread. An authenticated owner REPLY on a human thread is verbatim.

Fixed lines that were posted are byte-exact in English, Urdu, Hindi, Arabic, and Italian. Hinglish requests that the detector classifies as Hinglish use the Urdu line. The Arabic account line contains yeh + U+064E + U+0651 and not the reversed cluster. That line’s bytes match R11 in this corpus, so the shadda order is not an R12-only change here. Empty model output does not throw. The challenge clarifier is posted and is not replaced by the number hedge. Team-review sentences on FAQ turns become the hedge. Spread-template drafts do not echo the locked password. Status pings post the clarifier. A status ping on a human thread stays silent. No applied fixed line was duplicated. No applied fixed line was posted without an earlier assignment write.

### Product-critical (20)

Lost handoff after a definite assignment miss. `classifyWriteOutcome` records wrong-assignee, assignee-unconfirmed, and a null body as failed, which the op store will retry. `classifyAssignment` then treats `ok !== true` as `partial` before it reads that verdict. `partial` is an ambiguous hold. The next customer message enters recovery and stops.

| Case | What the customer got |
| --- | --- |
| W107 | 200 with `data: null`. Note only. No retry. |
| W108 | 200 naming a different assignee. No retry. |
| W109 | 200 with no assignee field. No retry. Candidate-only: R11 completed the handoff. |
| W112 | 200 naming the bot. No retry. |
| W113 | 200 naming another human. No retry. |
| W114 | `partial: true` and no assignee. No retry. Candidate-only: R11 completed the handoff. |
| W229 | Comment 200 with `data: null` is stored unknown and held. The line is never applied. |

The same hold drops the handoff when a write did not land and the op store is wiped or the process restarts. Ambiguous flags live on the ticket, so wiping the op store does not resume them.

| Case | Step that stuck |
| --- | --- |
| R168 | Assignment timeout before apply, then restart. |
| R169 | Note timeout before apply, wipe, then the next message. |
| R171 | Assignment timeout before apply, wipe. |
| R173 | Assignment 500 before apply, wipe. |
| R175 | Comment timeout before apply, wipe. |
| R177 | Comment 500 before apply, wipe. |

Human requests the stemmer misses. The Arabic stemmer strips a fixed suffix list and does not strip the accusative alef or the object pronoun, so the lexicon form never matches:

- H055 `أريد موظفا`
- H063 `اوصلني بوكيل` (`بوكيل` is not `وكيل`, `اوصلني` is not `اوصل`)
- H206 `اريد شخصا`
- H244 `أريد وكيلا الآن`

R11 posted the Arabic fixed line for all four. R12 answered with the stub FAQ. These four are candidate-only regressions.

Other human requests that do not hand off, on R11 as well as R12:

- H087 `ciao voglio un umano`. Italian has a fixed line and no grammar entry, and the live-agent expression does not match this sentence. The stub FAQ is posted.
- S034. Fin’s “I am handing this to a live agent now.” is not `finHandoffPhrase` (`handing this` is not `handing you off`). Fin-wait still owns the thread, so `hello` stays silent and the fixed line is never sent.
- H084 `human se baat karo`. The Hinglish live-agent expression matches this sentence, and the module says the Hinglish customer line stays Urdu. Language detection returns English because the sentence has no South Asian function word, `shortRole` fires on `human`, and the public line is the English sentence.

### Unnecessary handoff (13 cases that posted a fixed line)

These questions are not human requests. Presend rejects the stub sentence (it states an unsupported “five percent” and does not answer the question). The hedge exception requires an unsupported number without a missed-escalation flag. When both flags are set, the webhook commits the fixed line. The same wire is produced on R11, so this is not an R12 regression. It is still an unnecessary handoff on the candidate.

Arabic withdrawal rules, Arabic leverage, Arabic daily-withdrawal policy, Arabic “what is the daily target”, Urdu “who is a representative”, Urdu “what does agent mean”, Hindi drawdown rule, Hindi “what is a representative”, English “What is a human?”, “What does representative mean in the FAQ?”, “Are expert advisors allowed?”, “Is weekend holding allowed?”, “Do you allow scalping?”.

Two over-block cases take the same path: “What is the password policy if I forget the trading login?” and a token-bonus FAQ.

### Defects that are not product-critical

The sealed expect asked the stub sentence “five percent” to be posted for ordinary FAQ turns. The product replaces that invented figure with the approved hedge: “I can't confirm that figure from the approved details, so I won't guess a number.” That is the hedge, not a new R12 defect. It is the same on R11. Counted here so the sealed miss is visible: N096, N097, N100, N101, N102, N103, P135, N212, N213, N214, N217, N218, and the credential-echo turns whose public body is that hedge.

S236. “What is my account number?” on a human-owned thread stays silent. `decide()` documents the account-question exemption before ownership silence. `handleWebhook` returns on `owned.silent` before `decide()`. The customer is not spoken over. The exemption is not wired. Same on R11.

C154. “What is the daily loss limit for account 189143?” is routed to the account-number line because `account` plus a 5–12 digit token matches. In the shared process, an earlier turn (“Is there a secret rule for news trading?”) stores the fragment `trading` in the process-global remembered-secret set, because the value after `secret` contains `?` and `trading` is a 7-letter run that is not on the ordinary-word list. The approved English account line is then posted with `trading` replaced by `[secret]`. The canary itself does not appear. No leak. The remembered set is not cleared between conversations.

### Over-block

C147 and C148 echo a canary next to a profit-target or news-trading question. The canary is removed. The public body is the number hedge, because the stub figure is unsupported. The canary does not leak. C151, C152, and C233 are the same hedge on FAQ wording that happens to contain “secret” or a figure. C153 and C234 are the unnecessary handoffs above.

### What the corrected harness cleared

These were failures or false passes only because of the two measurement bugs. After the correction they behave as the case required:

- W124. A 429 on the comment is not applied. The retry applies one English fixed line.
- R172 and R174. Assignment timeout-after and 500-after leave the seat in place. Restart posts one line and does not assign a second time.
- R176. Comment timeout-after applies one line. Restart does not post a second line.
- R178. A corrupt op store after assignment 422 still completes once.
- R179. Removing the note after assignment rewrites the note and posts the line once.
- R180. Comment 422, then restart, posts the line once.
- R181 and W121. A duplicate delivery does not post a second line.
- R182 and R183. A human assignee, and a human public comment, keep silence. The 422 comment from the first turn is not applied.
- R184. Wiping the op store after success does not post a second line.
- W106, W110, W111, W115, W118, W119. error.list, 422, nested 422, a live seat that is still the bot, a failed note, and a comment error list are retried into one applied line.

## Part B

Author suites were executed and not read. R2–R12 are `fixedMessageHandoff.test.js` in each lane. Repair is `08_repair_tests/run-suite.js`. Failfix is the three bench files that exist. Maintainer is `03_luna-maintainer/test/run-tests.js` with `LUNA_ROOT` set to that tree. The README also names `selftest-product-variant-awareness.js`, `selftest-both-variants-not-decline.js`, and `selftest-faq-reset-time-retrieval.js` inside `09_failfix_staging`. Those three files are absent on main, R11, and R12. The retrieval selftest that does exist lives under `07_selftests` and is already inside the repair suite.

| Suite | main | R11 | R12 |
| --- | --- | --- | --- |
| Handoff R2–R11 | absent | pass | pass |
| Handoff R12 | absent | absent | pass |
| Repair hashes, syntax, adversarial | pass | pass | pass |
| Repair `selftest-identity-before-escalate.js` | pass | fail | fail |
| Repair `selftest-lock-harden.js` | pass | fail | fail |
| Repair, every other selftest | pass | pass | pass |
| Failfix identity | pass | pass | pass |
| Failfix variant | pass | pass | pass |
| Failfix retrieval | fail, same nine checks | fail, same nine | fail, same nine |
| Maintainer | 18 pass, 9 fail | 18 pass, 9 fail | 18 pass, 9 fail |

The two repair failures are the same assertion on R11 and R12: the source no longer contains `I've forwarded this to a teammate` in the order the selftest searches for, and `postProcessModelReply(lockedFinHandoffWelcome` is absent. Both already fail on R11. They are not candidate-only.

Maintainer’s nine failures are the same on all three trees. The sandbox looks for `teammateHandoffGates.js` at the `luna-current` root, and the golden pack resolves to zero cases, so later approval tests never become eligible. Not candidate-only.

Failfix retrieval fails the same nine article lookups on all three trees (300K overlay, 72-hour issuance, account rolling, USDT cycle, credentials, gambling, and the clock regression). Not candidate-only.

Candidate-only suite failures: **0**.

### Corpus diffs

252 cases on all three trees, plus the rollback tree. 0 leaks and 0 tripwires on R12, R11, and the rollback tree. Main echoed the four synthetic canaries (C146–C149). R12 and R11 did not.

Against R11 there are 19 signature diffs. Every one carries a tag that matches the wire change. Untagged diffs: **0**.

Morphology (10). R12’s stemmer now hands off Urdu inflections R11 answered with the stub: H046, H047, H048, H053, H054, H205. The same stemmer misses the four Arabic forms above, which R11 handed off: H055, H063, H206, H244.

Write judgment (6). R12 retries an assignment error list (W106), a nested 422 (W111), a failed note (W118), and a comment error list (W119). R11 did not finish those. R12 does not retry a 200 with no assignee (W109) or an unnamed partial (W114). R11 did finish those. That pair is the candidate-only lost handoff.

Live recheck (2). W115 still ends as one applied line. R11 posts that line after a response that names the seat while the live assignee is still the bot (`note`, unapplied assignment, comment). R12 assigns again, sees the seat, then posts (`note`, unapplied assignment, applied assignment, comment). W116: the live refetch names another human, R12 posts nothing, R11 posted the fixed line.

Clarifier (1). E140. R12 posts `Hello,<br><br>Please tell me which challenge you mean.` R11 posted nothing.

Against main, 204 signatures differ and 48 match. 190 of the differences are already the R11-vs-main gap: fixed-message handoff is not on baseline, so silence, byte-exact lines, and the handoff write order differ there for the same reason they differ on R11. The other 14 are the tagged R12 changes above, which also differ from main. No main diff is left without one of those two reasons.

## Part C

Recovery was the 17 isolated cases, each in its own process, with the tripwire on. Kill/restart is a new process against the same ticket, op store, and remote conversation.

| Procedure | Result |
| --- | --- |
| Note timeout after the write has landed, restart | One line, no second note (R170) |
| Assignment timeout or 500 after the write has landed, restart | One line, no second assignment (R172, R174) |
| Assignment timeout or 500 before the write lands, restart or wipe | Lost. No public line (R168, R171, R173) |
| Note timeout before the write lands, wipe | Lost (R169) |
| Comment timeout or 500 before the write lands, wipe | Lost (R175, R177) |
| Comment timeout after the write lands, restart | One applied line, no second line (R176) |
| 429 on note, assignment, and comment | One applied line (W122, W123, W124) |
| 422 on assignment, corrupt op store | Completes once (R178) |
| 422 on the comment, restart | One applied line (R180) |
| Note removed after assignment, restart | Note rewritten, one line (R179) |
| Duplicate delivery after success | No second line (R181, W121, R184) |
| Human assignee or human comment during recovery | Silence kept (R182, R183) |

Assertions on the corrected R12 run:

- Applied duplicate fixed lines: 0
- Applied fixed line with no earlier assignment write: 0
- Lost handoffs in the recovery set: 6 (R168, R169, R171, R173, R175, R177)
- Human silence broken: 0

The six losses are the ambiguous hold. A timeout or a 5xx before the remote write is applied is stored as unknown, `classifyAssignment` returns `timeout` or `500`, and the ticket sets `noteAmbiguous`, `assignAmbiguous`, or `messageAmbiguous`. The next delivery refuses to write that step again. Wiping `ops.json` does not clear the ticket flag.

## Part D

The four R12 files `fixedMessageHandoff.js`, `index.js`, `writeOpStore.js`, and `statePresend.js` were replaced with the R11 bytes. SHA-256 of each copy matches R11. The same 252-case corpus was run on that tree. Signatures match the R11 run on all 252 cases. Restoring those four files reproduces R11 output.

## Verdict

FAIL. Twenty product-critical cases, six of them candidate-only regressions, and six recovery losses. Leaks, tripwires, untagged diffs, and rollback mismatches are zero.

The candidate-only product regressions are the four Arabic human requests the new stemmer misses, and the two definite assignment misses (no assignee field, unnamed partial) that R11 retried and R12 holds forever. The recovery losses are timeouts and 5xx responses that never landed: the ticket remembers them as ambiguous, and a wipe or a restart does not finish the handoff.
