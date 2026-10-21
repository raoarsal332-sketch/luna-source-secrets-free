# Independent review — fixed-message handoff R5

Verdict: **NEEDS CHANGES**

This review did not merge, approve, activate, or deploy PR 32. It did not call production, a VPS, Intercom, or a live model. Every webhook result below is from the real `handleWebhook` on an in-process recording transport (synthetic admin id `9000007`, synthetic user, local ticket file, local op store). The author's R5 tests were not used as evidence.

## Artifact identities

| Artifact | sha256 |
| --- | --- |
| Frozen commit | `9f67dc0dd03bcb4ac56cc6c3ecf83ca4816aa9f4` |
| Branch reviewed | `cursor/fixed-message-handoff-r5-8ad1` |
| PR | https://github.com/raoarsal332-sketch/luna-source-secrets-free/pull/32 (draft, open) |
| `luna-current/01_runtime/fixedMessageHandoff.js` | `d1aa5652e5e499f44fdef17e37023273923c756be37a61337f79357ce62a1f6d` |
| `luna-current/01_runtime/index.js` | `bedc51596887346b1af779ea47c3e31fb8d32d1370592623a0cf73fbc27a9d33` |
| `luna-current/01_runtime/imageAskGuard.js` | `a1f2d24187dab83e5a98f643f8c6cb93bb8f0c8efc118bf936f7f347d12e70b9` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `2d61c7f72280eab88251682a5eece24af6f5a3d7b6b09b0c49bc29eac6796f91` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `f066192a9a5b82e844d240a90222b0905ff3832a4ce1eb9beb71bdcc12d2ed74` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r5/FM_R5_REPORT.md` | `ba62c82188ba70a149a5a3cd26bb42a369b93717411991e232a7678f2257ebf1` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `1d1a0f6ae8b5bc2e91d9068425b8476d4e7fe92e3296c8627b826a932d34189a` |
| Sealed case specs | `b6beb60fbab22c6349809289657581aee13775d1269e2d02a52e97fc94e2031c` |
| `independent-harness.js` | `5554a3660de353ad5ce5ea58a27a466eb9134bc93383d473d3dcc542e1b0173f` |
| `results.json` | `7b1c6b77126ec3856018436eaa1f95a01413b71c2fa02e1e488ef017ae91acfb` |

The six requested prefixes match the frozen tree. `textUtils.js` is not at `luna-current/01_runtime/textUtils.js` in this commit, so that author hash was not rechecked.

## Denominators

The sealed suite has **161** cases. The assertion tally is **136 pass / 25 fail**. Four of those 25 failures are harness expectation errors (the product did the safe thing and the assertion asked for a different string or a different model draft). **21** failures are product behavior on the real webhook. **18 / 18** human-owned silence cases passed (English, Urdu, Arabic, Hindi, Hinglish, and mixed text; handoff, status ping, and stale ownership). **0** ownership bypasses. **0** customer payloads matched the premature-promise pattern (`I'll pass`, `before I pass`, `a teammate will`, and the same family).

| Class | Cases | Assertion pass | Product failures |
| --- | ---: | ---: | ---: |
| order | 15 | 13 | Italian welcome; presend silence |
| failure | 36 | 28 | 8 presend failure modes never reached the handoff |
| replay | 8 | 6 | stale-snapshot duplicate; both-stores-lost silence |
| ownership | 19 | 18 | bot-owned status ping handed off |
| account | 33 | 27 | Italian (2), fresh tickets (2). Mixed-script (2) are expectation errors |
| identity | 3 | 2 | "Are you a bot or a real person?" |
| credential | 40 | 39 | repeated base64 token in the model prompt |
| faq | 3 | 1 | both assertion failures are expectation errors (see below) |
| spread | 4 | 2 | both spread-check asks corrupt the locked password |
| **total** | **161** | **136** | **21** |

Follow-up webhook runs, outside the seal, used the same transport:

- A holding-time draft that contains the KB durations (3 minutes, 30 seconds with the scalping addon) produced one customer comment and no assignment.
- A daily-loss draft that obeys the HARD OVERRIDE produced one customer comment with the KB limits (2-Step 5%, 1-Step 3%) and no assignment.
- A payout-rules draft that repeats the KB intervals (14 days between payouts, first payout after 21 days) was still handed off.
- A presend draft that is only "Please share your account number." produced zero writes. A draft that also contains another sentence was stripped down to that sentence and sent, with no note and no assignment.
- A same-turn replay whose fetched parts already contain "A teammate now has this conversation." produced zero further writes (`SKIP pre-send already-replied`).

## Product fact

The account-number fallback is supported by the repo knowledge base. `luna-current/01_runtime/fundedelite-faqs.md` (Trading credentials) says:

> For MT5 : You will receive an email containing your account number, account password, and trading service information. These details cannot be changed.

The code line is "For MT5, the account number is in the email that was sent with the trading login. Those details cannot be changed." That is the same fact.

The live Help Centre home `https://faq.fundedelite.com/en/` returned HTTP 200. The KB article URL `https://faq.fundedelite.com/en/articles/12658785-trading-credentials` returned HTTP 404 ("That page doesn’t exist."). The current article `https://faq.fundedelite.com/en/articles/17437106-where-do-i-find-my-login-details` (HTTP 200) says credentials are always in the dashboard under Show credentials, and that the trading-account-details email contains "your platform login, password and server. These cannot be changed." That page does not use the words "account number" or "MT5". It does not contradict the email fact. The repo KB is sufficient support. This is not an invented product fact.

Account answers go out through `postClientCommentOnce` and skip `postProcessModelReply`, so the customer-facing MT5 wording is left in place. The knowledge base uses that wording.

## Critical findings

### 1. Spread-test password is split, and the suffix is sent to the customer

`isSpreadCheckAsk` → `postClientCommentOnce(postProcessModelReply(SPREAD_TEST_REPLY))` → `redactCredentials` in `postClientCommentOnceInner` and again in `postReply`.

`SPREAD_TEST_REPLY` (`index.js`) contains `Password: QBG5FetfozKz7^a?J!`. `SECRET_TOKEN` in `credentialSanitizer.js` is `[^\s<.!?,]{1,80}`, so the value stops at `?`. The customer payload on both `spread-check` and `spread-what-are` was:

> Hello Synthetic, TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server Platform: MetaTrader 5 Server: Fundedelite-Server Account Number: 55188 Password: [secret]?J! Use this account to check spreads.

`?J!` remains. The locked template is also no longer intact. The two negative spread asks (own-account login, positions spread across accounts) did not use the template.

### 2. A repeated base64 token reaches the model prompt

Case `cred-base64-twice`. Customer text contains `token block QWJjZGVmZ2hpamtsbW5vcHFyc3Q` and the same token again. The label pass (`token` plus a multi-token value) consumes the first copy as one labeled secret. `redactRepeatedBase64` then sees the token once and leaves it. The prompt contained `QWJjZGVmZ2hpamtsbW5vcHFyc3Q`. The customer comment did not. The other 39 credential canaries (multi-token, braces, HTML, entities, apostrophes, curly apostrophe, spaced Devanagari, Hindi nouns, Arabic and Urdu labels, second-pass `[secret]`, owner prompt, remembered echo) stayed out of prompts, notes, comments, and logs.

### 3. Same-turn replay sends a second customer message when the snapshot lacks the fixed line

Case `replay-same-turn-state-kept`. First turn writes were note, assignment, then `A teammate now has this conversation.`, and ticket state set `escalateAwaitingFirstTeammate`. The recording transport's next fetch still had only the user part. The second turn wrote another comment:

> Hello Synthetic, We have already passed this to the team. They are reviewing it and will reply here when ready.

Path: `handleWebhook` Hook A (`evaluateFromConvState` → `decideEscalateAwaitingGate` → `STATUS_ONLY` / `related_to_escalate`) runs before the welcome duplicate guard and does not read `fixedHandoff.messageSent`. `postClientCommentOnce` then posts the holding line. When the fetched parts already include the fixed line, `checkSendBoundary` logs `SKIP pre-send already-replied` and the second post does not happen.

### 4. Both stores lost, human assignee visible, fixed line missing: the one message is never sent

Case `replay-both-lost-assignee-visible-message-missing`. Parts contained the note and an assignment to `9000007`, `admin_assignee_id` was `9000007`, the fixed line was absent, and the ticket file and op store were deleted. Writes: none.

Path: `handleWebhook` ownership block (`index.js` around the `FIXED_MESSAGE_HANDOFF_R4:ownership_before_hook_a` comment). `handoffAssigneeId` is set only when ticket state has `fixedHandoff` and `messageSent` is false. With state gone, that exemption is empty. `shouldDeferToHumanTeammate` skips. `reconcileFromParts` never runs. This is a fail-closed ownership result (no bypass). It also means the lost-state replay does not finish the single customer line.

### 5. Fresh tickets swallow account-number answers

`acct-fresh-created` (`conversation.user.created`, source body only, age about 8 seconds) and `acct-fresh-replied` (`conversation.user.replied`, age under 120 seconds, no Elite and no Arsal public reply) produced zero comments.

Path: `shouldWaitForFin` returns before the welcome account-question return. `conversation.user.created` always waits (`SKIP fin-wait user.created`). A `user.replied` conversation younger than `FIN_FRESH_CONV_SEC` (120) with no Elite participation and no Arsal public reply also waits (`SKIP fin-wait fresh-no-elite`). The account delivery is later, at the welcome `account_number_question` branch.

### 6. Italian account questions are empty or unanswered

`isAccountNumberQuestion` has no `numero di conto` pattern. `qual e il numero di conto` is `route_normal` / `not_handoff`.

- Bot-owned: the model reply is sent unchanged. Logged path: `FAQ_RETRIEVE 0`, `AI_ACTION REPLY`, customer text `Hello Synthetic, I can help with your FundedElite account.` The Italian fact line is never selected.
- Human-owned: the early ownership block treats it as an ordinary message and returns with zero comments.

### 7. An identity question is handed off

`Are you a bot or a real person?` produced note, assignment to `9000007`, and `A teammate now has this conversation.`

Path: `softEdges.clientRequestedLiveAgent` matches `real person` → `fixedMessageHandoff.decide` on the welcome path returns `fixed_message` (the leftover after the live-agent phrase is short enough for `isVagueEnglish`) → `commitFixedMessageHandoff` path `welcome`.

### 8. A bot-owned status ping is handed off, including when the draft repeats the KB

`any update on the payout rules?` on a bot-owned conversation, with the model returning the KB sentences "The standard days between payouts are 14" and "The first payout is requestable after 21 days" (`fundedelite-faqs.md`), logged:

`AI_ACTION REPLY` → `[statePresend] presend enforce route=FAST codes=MISSED_QUESTION,UNSUPPORTED_NUMBER final=needs-escalate` → `PRESEND_MISSED_ESCALATION_ESCALATE` → `commitFixedMessageHandoff` path `missed_escalation`.

Customer payload: the fixed English line. The policy answer was discarded. Human-owned status pings in all six languages stayed silent.

### 9. The presend handoff sequence does not run

`order-presend` and all eight `fail-presend-*` cases wrote nothing. Follow-up log for the pure re-ask "Please share your account number." when the user had already given account `77011002` and an email:

`AI_ACTION REPLY` → `SKIP empty after strip known-account ask`.

The known-account strip (`index.js`, `AUDIT_HARDEN_V1:stripKnownAccountAsk`) empties a draft that is only the re-ask and returns before `FIXED_MESSAGE_HANDOFF_R3:presend_escalate`. A draft that also contains "Payout reviews follow the published timeline." was reduced to that sentence and posted as a normal comment, still with no note and no assignment. Note-then-assign-then-one-message was not observed on `presend_escalate`, and the 500 / timeout / 422 / partial modes for that path were not reached.

Italian welcome has the same shape of a missed fixed line. `Vorrei parlare con un operatore` is `route_normal` / `substantive` on the welcome decision (the leftover is long), then:

`AI_ACTION REPLY` → `FORCE_ESCALATE client_wants_human` → `IDENTITY_BEFORE_ESCALATE asked missing` → customer text `Hello Synthetic, Please share your account number.`

The Italian fixed line `Un collega ha ora questa conversazione.` is not sent. `escalateAwaitingFirstTeammate` stays unset.

## What held

Welcome order (note, then assignment to `9000007`, then one fixed line, awaiting set) held for English, Urdu, Arabic, Hindi, Hinglish (Urdu line), and the vague Fin handoff "I need help". The same order held for `main_escalate`, `missed_escalation`, identity recovery, and recovery continuation (assignment then the one line, no second note). Substantive English handoff with an account and email kept the account number in the note and sent one English fixed line.

Welcome, main, and missed failure modes (note and assignment, each of 500, timeout, 422, and partial) withheld the customer message and did not set awaiting. Recovery assignment failures did the same. 422 remained the retry class. Ambiguous holds were not replayed into a customer message while state was kept.

Account answers were non-empty, contained the KB fact, and did not assign, on welcome and on human-owned conversations, in English, Urdu, Arabic, Hindi, and Hinglish, with and without `?` / `؟`, including the bare phrase "account number", a digit string that is still a question, and recovery seeds for 422 and 500. Mixed Hindi/English received the English fact with an Urdu greeting. That answer is non-empty and is not a promise. "my account number is …" stayed an identity supply and completed a handoff with the number kept in the note.

A holding-time answer that states 3 minutes and 30 seconds was delivered as one comment. A daily-loss answer that obeys HARD OVERRIDE and states the KB limits was delivered as one comment. The sealed FAQ failures used a fact-free holding-time draft (presend `MISSED_QUESTION` then `missed_escalation`) and a mock that returned `ESCALATE` again on the HARD OVERRIDE prompt. Those two are not product regressions once the draft actually answers from the KB.

## Uncovered paths

- `presend_escalate` note → assignment → one message, and its 500 / timeout / 422 / partial modes.
- `main_escalate` and `missed_escalation` account-question exemptions inside `handleWebhook`. A detected account question returns at the welcome branch first. The recovery exemption did run (422 and 500 seeds) and answered.
- Live Help Centre fetch from inside the bot. The transport returned HTTP 500 for `faq.fundedelite.com`. Retrieval used the local KB (208 articles). The live pages were read separately for the fact check.
- Italian `numero di conto` never selects `ACCOUNT_QUESTION_LINES.it`.

## Next action

Leave PR 32 unmerged, unapproved, and inactive. Repair the spread password, the repeated-base64 prompt leak, the stale-snapshot second customer message, the lost-state missing line, fresh-ticket and Italian account answers, the identity-question handoff, the bot-owned status-ping handoff, and the presend path that returns on an emptied re-ask. Freeze a new commit and send it through another independent review. This review is not that fix.
