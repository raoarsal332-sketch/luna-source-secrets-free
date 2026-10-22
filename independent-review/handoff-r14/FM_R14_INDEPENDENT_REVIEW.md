# Independent review — fixed-message handoff R14

**Verdict: NEEDS CHANGES**

Reviewer is not the author. Candidate `cursor/t800-handoff-r14` at `9c83804f32674f529fb1d03e7bd75db7c74add8a` (PR #84) was not modified. No merge, deploy, VPS, Intercom, or secrets. No `review/*` branch was read.

The R14 delta holds: Urdu lexical asks, owed-line recovery, FAQ force exemption, clarifiers, and password-policy cases behave as specified, with no leaks and no duplicate customer posts. Two recovery cases still leave a customer who asked for a human with the seat on the bot and no locked line, after an assignment timeout or HTTP 500 that did not land. That misses the recovery gate. Three welcome numeric FAQs post the inherited number hedge. Those three are not a handoff regression.

## Gate counts

| Gate | Result | Count |
|---|---|---|
| Product-critical sealed failures | Not met | 5 |
| Leaks | Met | 0 |
| Duplicate customer posts | Met | 0 |
| Recovery failures | Not met | 2 / 39 |
| Candidate-only regressions vs R13 | Met | 0 |
| Candidate-only regressions vs R12 | Met | 0 |
| Author handoff suites R2–R14 | Met | all exit 0 |

Sealed set: 308 cases (220 preserved, 88 new to this review, 39 recovery). Every case is marked critical, so each sealed failure counts as product-critical. SHA-256 `2c145b0a4f7ccdc5840987bc258558e1759c410e3bc5e90664cedeae7ceafb73`, committed at `8d9403c` before the harness and before any candidate execution. The file hash was checked again after the runs and is unchanged.

| Runtime | Passed | Failed | Leaks | Duplicate posts | Recovery failures |
|---|---:|---:|---:|---:|---:|
| R14 `9c83804` | 303 | 5 | 0 | 0 | 2 / 39 |
| R13 `d769d0aa` | 236 | 72 | 12 | 0 | 15 / 39 |
| R12 `b9ebaacc` | 230 | 78 | 15 | 0 | 18 / 39 |

R14 passes 67 cases that fail on R13, including all 16 Urdu-lexical asks, 18 Hinglish asks, 13 recovery cases, 10 non-welcome FAQs, 4 welcome FAQs, both escalate clarifiers, both escalate password-policy cases, and 2 leak cases. All 88 cases tagged as new for this review pass. The five R14 failures are byte-identical to R12 and R13 (same turn reasons and same customer bodies).

## Hash check

`luna-current/10_synthetic_lanes/fixed-message-handoff-r14/FM_R14_REPORT.md` at the candidate commit is SHA-256 `36fa7baea787b041bdac5a6a7e4ece546ad6e8cfb427b347759e57cc23a6402f`. Match.

Every file hash listed in that report matches the blob at `9c83804`:

| File | SHA-256 | Check |
|---|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `ef80f0e764a45b5d0e810c0caa3b0752c8e7b508fa1bd2c768c3088dc84f8ad0` | match |
| `luna-current/01_runtime/index.js` | `e3458c3f3c0045f5880babf1ba6226990d60b083078f54f906d8f0a089fb027e` | match |
| `luna-current/01_runtime/writeOpStore.js` | `e50d867f717b607003bd00065d67346bd2c5c50f74ddb342bfbebd6e98ff44ab` | match |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` | match |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r14/fixedMessageHandoff.test.js` | `c92bcba2b2735e851a9d9b0dc67fad1014b65b7fc6a52d27e873e7adb34a13f7` | match |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r13/fixedMessageHandoff.test.js` | `0db271306d7bedda5709dc46cf88ac54c607d587bd454ec8fc1ff244433dbbfa` | match |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r3/fixedMessageHandoff.test.js` | `0b68d32b55f064eb3a08c53e7b4e5e125f16ff0236ee5ceed7ffa741ca49e2b5` | match |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` | match |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` | match |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` | match |

## What was run

The sealed cases call the real `handleWebhook` export. Axios is a recording transport limited to `https://api.intercom.io/`. The model is a stub. `http`, `https`, and `net` throw if anything else opens a socket. Tokens are the stubs `stub-not-a-secret` and `stub-token-not-real`. One eligible synthetic teammate is admin `900007` (Hana Support). The customer line is accepted only when its body is byte-exact and there is exactly one such comment, or when the case expects silence.

Author suites were re-run on the candidate worktree with `node luna-current/10_synthetic_lanes/fixed-message-handoff-rN/fixedMessageHandoff.test.js`:

| Suite | Result |
|---|---|
| R2 | 16 passed, exit 0 |
| R3 | 33 passed, exit 0 |
| R4 | 10 passed, exit 0 |
| R5 | 8 passed, exit 0 |
| R6 | 9 passed, exit 0 |
| R7 | 9 passed, exit 0 |
| R8 | 7 passed, exit 0 |
| R9 | 5 passed, exit 0 |
| R10 | 7 passed, exit 0 |
| R11 | 5 passed, exit 0 |
| R12 | 6 passed, exit 0 |
| R13 | 3 passed, exit 0 |
| R14 | 10 passed, exit 0 |

Those author tests call `decide` / `commit` with an in-process transport. They do not go through `icRequest`, so they do not show the replay suppression below.

Sealed group results on R14: english 71/71, hinglish 33/33, urdu-lexical 16/16, urdu-script 12/12, arabic 26/26, hindi 22/22, other-language 14/14, faq-welcome 6/9, faq-nonwelcome 10/10, clarifier 4/4, password-policy 4/4, silence 16/16, force-kept 2/2, owner-spoof 14/14, write-validation 8/8, no-leak 8/8, recovery 37/39.

## Failures

### 1–2. Assignment timeout or 500 that did not land stays stuck

`rec-assign-timeout-not-landed` and `rec-assign-500-not-landed`. Both are preserved cases. Both fail the same way on R12 and R13. Recovery failures: these two.

Turn 0 correctly posts the internal note and one assignment, and posts no customer line. The scripted assignment times out or returns HTTP 500 and the live assignee stays the bot. Turn 1 expects exactly one English line, `A teammate now has this conversation.` The webhook posts nothing.

Recorded turn 0 for the timeout case, conversation `880000273`:

```json
{"message_type":"note","type":"admin","admin_id":"10118526","body":"<!-- LUNA_HANDOFF_NOTE --><b>Account:</b> Not provided<br><b>Email:</b> Not provided<br><br><b>Problem:</b><br>agent<br><br><b>Action needed:</b><br><a class=\"entity_mention intercom-content-link\" href=\"//app.intercom.com/apps/h2z8cgfr/admin/900007\" rel=\"nofollow noopener noreferrer\" target=\"_blank\">Hana Support</a> Please take this conversation.<br><br><b>If remains unsolved:</b><br>please mention jerry & assign ticket to him"}
```

```json
{"message_type":"assignment","type":"admin","admin_id":"10118526","assignee_id":900007}
```

Turn 1 customer comments: `[]`. The 500 case (`880000275`, follow-up text `please get me a human`) is the same shape. Logs for the second turn include `IC_REQ_REPLAY_SUPPRESSED` on the assignment.

What the code does: `commit` stores the owed line before assign. A timeout or 500 sets `assignAmbiguous` and does not post the customer line. On the next turn `recheckHold` is set because that flag was saved. `releaseStaleAssignmentHold` sees the live seat is still the bot, clears `assignAmbiguous`, and `commit` calls `assign` again. `icRequest` then finds the earlier op with status `unknown` and the same method, URL, and body. `shouldSkipReplay` returns before any HTTP call. The assignment is classified as a miss, `assignAmbiguous` is set again, and the locked line is withheld.

The landed twins pass on R14, R13, and R12. `rec-assign-timeout-landed` and `rec-assign-500-landed` post the English line once on the second turn and do not post it on the first. Note timeout and note 500 that did not land stay silent on both turns, which is what those cases expect. Comment 422, 429, 500, and timeout retry the line once. A human reply during recovery stays silent. Duplicate delivery stays a single customer line.

The author R14 test `assignment and note timeouts stay unknown and a landed write continues` passes because its transport does not consult `shouldSkipReplay`. A same-turn replay without `recheckHold` correctly returns `assign_ambiguous_held` and makes no calls. The webhook path is the one that cannot finish a not-landed assignment: the hold is cleared, then the identical assignment is swallowed.

This needs a change before the recovery gate is met. After a live read shows the seat is still the bot, the next assignment has to be sendable (a new op key, or an explicit release of that unknown assignment, the way an unknown customer comment can be released). A write that might already have landed must still not be blind-replayed. The landed cases must stay single-post.

### 3–5. Welcome numeric FAQs post the number hedge

`faq-en-loss` (`What is the daily loss limit?`), `faq-en-target` (`How does the profit target work?`), and `faq-en-leverage` (`What is the leverage?`). Preserved. Identical on R12 and R13. Not recovery cases. Not leaks. Not fixed lines.

The stub draft for each is `Withdrawal rules depend on the challenge type.`, which does not state the asked figure. The only customer comment is:

```json
{"message_type":"comment","type":"admin","admin_id":"10118526","body":"I can't confirm that figure from the approved details, so I won't guess a number."}
```

The sealed expectation allows at most one normal comment and forbids that hedge and every locked line. The hedge is the missed-number behavior the author R6 and R9 suites require (`a bot-owned status ping or FAQ with an unsupported number hedges instead of handing off`). Nearby welcome FAQs whose draft matches the question stay off the fixed line: `faq-en-withdraw` posts `Hello Sam,<br><br>Withdrawal rules depend on the challenge type.`, `faq-en-payout` and `faq-ar-withdraw` (`ما هي قواعد السحب؟`) post nothing, and all ten non-welcome FAQ cases stay off the fixed line, including `faq-force-ar`.

These three are sealed failures under the pre-registered scoring. They are not an R14 handoff defect and they are not a reason to treat the language or owed-line work as regressed. Changing them means a presend decision about off-topic drafts, which this candidate did not take and which R12 and R13 already share.

## Examples that passed

Short English `agent` on conversation `880000000` posts note, then assignment `assignee_id` 900007, then one comment whose body is exactly `A teammate now has this conversation.`

`بات آدمی` (`ur-baat-aadmi`) posts the Urdu line `یہ گفتگو اب ایک ساتھی کے پاس ہے۔`. The note contains `CANARY-NOTE-9c2e`. That canary is absent from the customer comment. On R13 the same ask posts `السلام علیکم Sam،<br><br>CANARY-MODEL-SHOULD-NOT-POST` as a customer comment. R14 leak count for this case is 0. R13 leaks 12 customer posts on Hinglish, Urdu-lexical, and `leak-email-urdu`. R14 leaks 0. `leak-email-urdu` posts only the Urdu locked line.

`agent chahiye` uses the Urdu line. Hindi `agent` uses `यह बातचीत अब एक साथी के पास है।`. `أريد التحدث مع موظف` uses `هذه المحادثة الآن لدى أحد الزملاء.`. `voglio un operatore` uses `Un collega ha ora questa conversazione.`.

Welcome clarifier `Please tell me which challenge you mean.` is posted as `Hello Sam,<br><br>Please tell me which challenge you mean.` Password policy is posted as a normal reply, not the hedge and not a locked line. Owner spoof, silence when a human already owns the seat, error-list / null / unnamed / wrong-seat assignment, still-bot, and flip-before-comment post no customer line. `rec-wipe-op-and-ticket-removed-note` posts the owed Urdu line once after the store wipe. `rec-human-during-recovery` posts the English line on the first turn and stays silent after the human reply.

## Scope

This review did not merge, deploy, restart a VPS, call Intercom, or read production secrets. The sealed case file was not edited after the runs.
