# Independent review of fixed-message handoff R4

**Verdict: NEEDS CHANGES**

Draft PR https://github.com/raoarsal332-sketch/luna-source-secrets-free/pull/26, head `cursor/fixed-message-handoff-r4-8ad1`, frozen commit `45e533d60b4b0e8eef7d1607e77a9bbdf8439662`.

This review does not approve, merge, activate, or deploy that candidate. No production host, VPS, live Intercom conversation, secret, or customer record was contacted. Every case called the real `handleWebhook` through an in-process recording transport. The author suite under `luna-current/10_synthetic_lanes/` was not executed and was not used as evidence.

`STATUS` in `fixedMessageHandoff.js` remains `candidate: 'fixed-message-handoff-r3'`, `approved: false`, `release: false`.

## Artifact identities

SHA-256 of the frozen tree, verified locally at that commit. All five prefixes match the review request.

| File | SHA-256 | Bytes |
| --- | --- | --- |
| `luna-current/01_runtime/fixedMessageHandoff.js` | `5e845f478296c0ff28431e84eed529db8656227137f8c7afaa88014e3c1a0e64` | 21361 |
| `luna-current/01_runtime/index.js` | `4548780b984af5a285e973c6c4d9146843fb5e4d5ccf1ea4234c207ddafbcd10` | 211191 |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `1d1a0f6ae8b5bc2e91d9068425b8476d4e7fe92e3296c8627b826a932d34189a` | 22883 |
| `luna-current/02_statePresend/credentialSanitizer.js` | `d856030f693b420820cc52dcc121ab4638c7fa8c1b22bd266f5a7e1f585b3f1a` | 2178 |
| `luna-current/02_statePresend/textUtils.js` | `8a023ab868017cac7e04a5e89de85a2960dcba1c1e7e21b1dce8dad925a6c20c` | 14448 |

Review seal for the run that produced `results.json`:

| File | SHA-256 |
| --- | --- |
| `review/handoff-r4/sealed-cases.js` | `2612830135d5154f9bbbf3188db4b84528ca05927f0df3dd28632a2a9b505087` |
| `review/handoff-r4/harness.js` | `145916406f2c2dff27dc5000f96a17047ec04066f4208c72fbbf9809fcaba946` |
| `review/handoff-r4/run.js` | `bdf4f00628bee7d716bc1c85e5bf302953f0c8dfe5b757659f72d234c4f93dca` |

The case file was sealed before scoring. Later edits were limited to the scorer: recovery completion uses the non-ping follow-up `I am still here`, and an account-number answer that is only an identity re-ask is a failure. Canary strings and case inputs were not weakened.

## How the webhook was run

`harness.js` points `LUNA_CONTROL_STATE_FILE`, `LUNA_PROMPT_FILE`, `TICKET_STATE_FILE`, `LUNA_OP_STORE_FILE`, and `MENTION_ROTATE_FILE` at `/tmp/luna-r4-indep` before `index.js` loads. The control file is unpaused with replies enabled. Tokens are the literals `synthetic-intercom-token`, `synthetic-openai-key`, and `synthetic-control-secret`. `LUNA_TOOLS_ENABLED=0`.

Axios and the OpenAI client are replaced inside `Module.prototype.require` before the engine loads, so `handleWebhook` still runs the real `icRequest` and write-op store. The hook rewrites `./statePresend/*` from `01_runtime` onto `02_statePresend`, and the four relative imports those modules make back into `01_runtime`. No symlink was committed. Intercom writes are recorded as `{method, url, data, auth}`. A call whose host is outside `api.intercom.io` fails the case. Every recorded Intercom call had to carry `Bearer synthetic-intercom-token`. None of the 172 cases failed either check, and none logged `WEBHOOK_ERR`.

The scorer checks ordered write types, `assignee_id` `424242`, `admin_id` `10118526`, the exact fixed sentence, `escalateAwaitingFirstTeammate`, canaries in note bodies, customer comment bodies, and model prompts, and this promise pattern:

`/\b(i('|’)ll|i will|we will|we'll|will reply|will update|will get back|will follow up|hang tight|already been informed|within \d|shortly|as soon as|guarantee|promised)\b/i`

Fixed lines do not match that pattern.

## Denominators

172 fresh cases, 172 unique ids (`R4I-001` through `R4I-172`). 171 scored. 143 passed. 28 failed. 1 observed and left unscored.

| Class | Scored | Pass | Fail |
| --- | ---: | ---: | ---: |
| order (note, then assignment, then one message, five paths) | 11 | 11 | 0 |
| assignment 500 / timeout / 422 / partial, plus welcome note failures | 23 | 23 | 0 |
| retry, hold, completion, replay, thanks | 9 | 9 | 0 |
| ownership fail-closed, six languages | 62 | 62 | 0 |
| account-number questions | 42 | 23 | 19 |
| credentials in notes, prompts, and customer lines | 15 | 6 | 9 |
| FAQ and MT5 spread | 8 | 8 | 0 |
| fixed text, no invented promise | 1 | 1 | 0 |
| stale replay (observed, unscored) | 0 | — | — |

The pass bar is zero premature promises, zero duplicate customer lines, zero ownership bypasses, zero credential leaks, and zero swallowed account questions. This run has credential leaks, swallowed account questions, and a premature promise on the identity re-ask. The bar is missed.

## What the recording showed holding

Successful handoffs posted `note`, then `assignment`, then one `comment`, in that order, and set `escalateAwaitingFirstTeammate` only after the comment. Welcome covered English, Urdu, Arabic, Hindi, Italian, Hinglish, and mixed Latin plus Urdu. `identity_recovery`, `main_escalate`, `presend_escalate`, and `missed_escalation` each posted the English line `A teammate now has this conversation.` The log line was `FIXED_HANDOFF sent <path>`.

Assignment HTTP 500, timeout, 422, and partial success on all five paths wrote `note`, `assignment` and no customer line, and left the awaiting flag clear. `classifyAssignment` plus `ambiguousWrite` mark 500, timeout, and partial as ambiguous, so a later turn does not retry them. 422 stays retryable. A later `still waiting on this` after 422 wrote `assignment`, `comment` only, one English fixed line, and then set awaiting. Welcome note 500, timeout, and 422 stopped at the single note.

After a 500, partial, or timeout hold, `any update?` produced no further write and did not set awaiting. The same 500 hold still answered `What is my account number?` with the scripted dashboard reply and did not assign again. After a confirmed assignment whose message had not been sent, `I am still here` wrote exactly one comment, the English fixed line, log `FIXED_HANDOFF sent recovery`, and set awaiting. A status ping is silenced earlier, by `SKIP status-ping owned`, so that completion case deliberately uses a non-ping follow-up. `thanks` after a completed handoff did not send a second fixed line.

Replay with ticket state and the op store both removed, while the fetched conversation already contained the note, the assignee `424242`, and the fixed comment, posted nothing. Replay with ticket state removed and the op store kept posted nothing. `thanks` did not assign again.

Ownership stayed silent for status pings in English, Urdu, Arabic, Hindi, Hinglish, and mixed text under a human assignee, another assignee, an admin body with an empty `part_type`, a teammate author, the Risk team id, the Escalations team id, an ambiguous assignee, and a stale assignment part. Name-only `Risk Desk` and `Escalations Queue` were silent as well. A substantive English payout question under a human owner, and an Urdu handoff ask under a teammate author, were also silent. No fixed line and no assignment were posted in those 62 cases.

FAQ answers for the Catalyst Challenge and the profit target were posted, including while awaiting. `Can I get the spread test account for MT5?` and `what are the spreads?` returned one customer line containing `TEST SPREAD ACCOUNT DETAILS`, `MetaTrader 5`, and `55188`, with no note and no assignment, including while awaiting. `spread across` and an MT5 login sentence that does not contain the word spread did not receive that template.

The customer lines on successful handoffs were exactly:

- en: `A teammate now has this conversation.`
- ur: `یہ گفتگو اب ایک ساتھی کے پاس ہے۔`
- ar: `هذه المحادثة الآن لدى أحد الزملاء.`
- hi: `यह बातचीत अब एक साथी के पास है।`
- it: `Un collega ha ora questa conversazione.`

Hinglish `live agent chahiye` and mixed `agent please مجھے ایجنٹ چاہیے` received the Urdu sentence. `detectLatinLanguage` returns `ur` when a shared South Asian token such as `chahiye` is present and no Hindi-only or Urdu-only Latin marker is (`fixedMessageHandoff.js` lines 144–154). That is the approved Urdu sentence. It is recorded as an observation, and it is not one of the 28 failures.

Six credential shapes stayed out of notes, prompts, and customer lines: ASCII `password's CANARYAPO`, Arabic `كلمة المرور`, Urdu `پاس ورڈ`, Hindi `पासवर्ड`, a single base64 token `QkFTRTY0U0VDUkVU`, and `password is 73918462`.

## Critical findings

### 1. Credential material reaches the model prompt, and some of it reaches the note or the customer

Nine of fifteen credential cases leaked a canary. The note path redacts before `ensureInternalNoteEnglish` (`index.js` 592–614) and again on the model output. The main chat prompt does not.

`index.js` 4110–4120 builds `userMsg` from raw `buildHistory` and the raw latest client text, then sends that string to the model. `postClientCommentOnceInner` posts `finalBody` at line 3004 with no `redactCredentials` call. `credentialSanitizer.js` lines 17–20 capture only one `\S+` token after the label, and the Unicode label list is only `كلمة المرور|پاس ورڈ|पासवर्ड`.

| Case | Where the canary was | Mechanism |
| --- | --- | --- |
| R4I-148 curly apostrophe `password’s CANARYCURL` | prompt | Note redaction holds. The message is long enough to enter the main prompt, which is unredacted. |
| R4I-152 spaced Devanagari `पास वर्ड CANARYDEVA` | prompt | `पासवर्ड` does not match when a space is inserted. The translation prompt receives the value. |
| R4I-153 `pwd CANARYALPHA CANARYBETA` | prompt has both tokens; note has `CANARYBETA` | `\S+` redacts the first token. The second token remains in the note and in the prompt. |
| R4I-154 `पासवर्ड गुप्तशब्द दूसराशब्द` | prompt has both Devanagari tokens | Same one-token capture. The scripted English note did not echo them. The prompt did. |
| R4I-156 `pwd QUJDREVG QUJDREVG` | note and prompt | The second base64 token remains after the first is replaced. |
| R4I-157 `password&#58;CANARYHTML` | prompt | The raw entity is not a separator. The note path, which strips HTML first, stayed clean. |
| R4I-158 `<b>password</b> is CANARYTAG` | prompt | Raw tags reach `userMsg`. The note is built from stripped text and stayed clean. |
| R4I-160 `password is CANARYPROMPT` on a substantive live-agent message | prompt | `FULL TICKET HISTORY` and `Latest client message` include the raw secret. |
| R4I-161 account question whose scripted reply echoes `password is CANARYECHO` | customer comment and prompt | `postClientCommentOnceInner` posts the echo. |

### 2. Account-number questions are swallowed, or replaced by an identity re-ask, on the missed-escalation hold

Nineteen of forty-two account-question cases failed. The question is recognized. Presend then clears the draft, and the exemption only posts a draft that is still non-empty.

`targetedRegeneration.js` line 109 returns `{ body: '', send: false, reason: 'needs-escalate' }`, and lines 90–91 return `body: ''` with `missed-escalation-held`. `index.js` line 4573 assigns that empty body back onto the reply. The missed-escalation block at lines 4709–4716 logs `FIXED_HANDOFF missed account-question` and posts only when `stripHtml(draft)` is non-empty and is not a fixed line. An empty draft produces silence. The same empty-draft shape exists at the main escalate exemption (lines 4431–4437) and the presend escalate exemption (lines 4514–4519). Those two sites were not given their own account-question cases.

Before that exemption, lines 4692–4707 run `ensureIdentityBeforeAccountEscalate` when `isClearlyAccountSpecificIssue(text)` is true, and return as soon as the gate is not ready. `pickAccountEmailAsk` (lines 1136–1146) then posts one of these templates, chosen with `Math.random`:

- `Please share your account number so I can forward this with the right details.`
- `Can you send the account number linked to this issue? I’ll pass it to a teammate once I have it.`
- `Before I pass this to the team, please share your account number.`

This run drew the second template. It is an ask for the number the client just requested, and `I’ll pass it to a teammate once I have it` matches the promise pattern.

Swallowed, customer bodies empty, log `PRESEND_MISSED_ESCALATION_ESCALATE` then `FIXED_HANDOFF missed account-question`:

- Welcome, reason `needs-escalate`: R4I-113 Hinglish with `?`, R4I-114 Hinglish without a mark, R4I-115 mixed `my account number کیا ہے؟`.
- Recovery after a 500 hold, after `FIXED_HANDOFF recovery account-question exemption`, reason `needs-escalate`: R4I-125 and R4I-126 Hinglish, R4I-127 mixed with `؟`.
- Recovery after a 422 hold, same sequence: R4I-133 Hinglish.
- Missed escalation, reason `missed-escalation-held`: R4I-135 English with `?`; R4I-137 and R4I-138 Urdu; R4I-139 and R4I-140 Arabic; R4I-141 and R4I-142 Hindi; R4I-143 and R4I-144 Hinglish.

Identity re-ask plus the promise above, log `PRESEND_MISSED_ESCALATION_ESCALATE … missed-escalation-held` then `IDENTITY_BEFORE_ESCALATE asked missing`:

- R4I-136 English without a mark. Customer line: `Hello Synthetic, Can you send the account number linked to this issue? I’ll pass it to a teammate once I have it.`
- R4I-145 mixed with `؟`, and R4I-146 mixed without `؟`. Customer line: `السلام علیکم Synthetic، Can you send the account number linked to this issue? I’ll pass it to a teammate once I have it.`

The 23 account questions that were answered are welcome and recovery for English, Urdu, Arabic, and Hindi, with and without a mark, plus mixed text only when the Arabic question mark was absent (R4I-116, R4I-128, R4I-134). Hinglish was not answered on any path. No missed-escalation account question was answered.

### 3. Premature promise

The only customer lines that matched the promise pattern are the three identity re-asks in R4I-136, R4I-145, and R4I-146. Successful fixed lines, FAQ lines, spread-template lines, withheld handoffs, and owned conversations did not.

## Observed residual

R4I-043 is unscored. After a successful handoff, ticket state and the op store were both deleted, and the next fetch returned the original conversation with neither the note, the assignee, nor the fixed comment. The webhook posted `note`, `assignment`, `comment` again. Reconciled replay, where the fetch shows those writes, and op-store replay did not duplicate. A lost pair of stores together with a stale conversation read can post the handoff a second time.

## Paths this suite did not drive

- Account-number questions were not sent down `main_escalate` or `presend_escalate`. Both exemptions share the empty-draft return with the missed path.
- Note HTTP 500, timeout, and 422 were run on welcome only. Assignment failures were run on all five paths.
- Italian was checked as a welcome fixed line. Italian ownership and Italian account questions were outside the six requested languages.
- A model reply that is only `Before I pass this to the team, please share your account number.` when the account is already in history is stripped to empty at `index.js` 4464–4479 and the turn returns. The scored presend path used `What is your account number?` and did post note, assignment, and the fixed comment.
- A status ping while the handoff assignee already owns the conversation returns at `index.js` 3735–3737, before recovery. That silence is what the ownership and hold-ping cases require. Completion of an unsent message was checked with `I am still here`.

## Next action

Leave PR 26 unmerged, unapproved, and undeployed. Repair the three leaks before another review: redact history and the latest client line before the main model prompt (`index.js` 4110–4120), redact the outbound customer body before `postReply` (`index.js` 3004), and stop the credential pattern at a value boundary that includes a following token, a spaced Devanagari label, and HTML entities or tags (`credentialSanitizer.js` 17–20). On an account-number question, post an answer when presend has emptied the draft (`index.js` 4709–4716 and `targetedRegeneration.js` 90–109), and do not let `ensureIdentityBeforeAccountEscalate` (`index.js` 4692–4707) replace that question with `pickAccountEmailAsk`. Then repeat an independent run against a new frozen commit. This report is not that approval.
