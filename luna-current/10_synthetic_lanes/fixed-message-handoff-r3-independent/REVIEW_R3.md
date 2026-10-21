# Independent review: fixed-message handoff R3

Verdict: **NEEDS CHANGES**

This review did not merge, approve, activate, or deploy. It did not call production, a VPS, Intercom, or a live model, and it did not use customer data or real secrets. Every outbound call below was captured by an isolated recording transport in front of the real `handleWebhook`. The author's 33 tests were not executed and are not evidence: they call `handoff.commit()` with an injected transport, not the webhook.

## Artifact identities

| Artifact | Identity |
| --- | --- |
| PR | https://github.com/raoarsal332-sketch/luna-source-secrets-free/pull/20 (open draft) |
| Branch reviewed | `cursor/fixed-message-handoff-r3-8ad1` |
| Pinned head | `88a663da6b1aac1e8e14fe4e9f1459f2eea7287b` |
| `luna-current/01_runtime/fixedMessageHandoff.js` | `4b540186af6cce394abd3f6a90cc51a56d908bd823d647a8cc5653cca8245236` |
| `luna-current/01_runtime/teammateHandoffGates.js` | `96eaf4ce75a0eb888cdabb5552a7e90996cdde2278721a8958e7991032e4ca2b` |
| `luna-current/01_runtime/index.js` | `a99d781e7d6d0a2297f76fa8d81e7e34a0478ad83402ae7c9cd90d7c12dbf1cd` |
| Sealed case list | `2a24f6ca866e07a8ec017237d9798982d40aec9e5e9b82a7748ab29f34ca8db7` |
| Harness | `luna-current/10_synthetic_lanes/fixed-message-handoff-r3-independent/adversarial.test.js` |
| Run record | `adversarial-results.json` beside the harness |

The three file hashes were checked against `git show` of the pinned head before the handler was loaded. The handler under test was that tree, extracted with `git archive`, with `02_statePresend` copied into `01_runtime/statePresend` so the runtime's relative requires resolve. OpenAI was a local stub. Axios was an in-process adapter that rejects any host other than `api.intercom.io` and any token other than the synthetic review token. State files lived in a fresh temp directory.

## Case counts

153 sealed cases. 137 passed. 16 failed. All 16 failures are critical.

| Group | Pass | Fail |
| --- | ---: | ---: |
| order (note, then assign, then one fixed message) | 9 | 0 |
| assignment 500 / timeout / 422 / partial, plus note failures | 26 | 0 |
| ownership fail-closed | 69 | 0 |
| account-number questions | 12 | 6 |
| credential redaction | 5 | 7 |
| replay, retry, duplicate suppression | 7 | 0 |
| recovery of an unfinished handoff | 0 | 2 |
| status ping after a successful handoff | 0 | 1 |
| FAQ and MT5 spread-test regressions | 8 | 0 |
| fixed-line copy has no invented promise | 1 | 0 |

What held:

- Welcome, identity recovery, main escalate, pre-send escalate, and missed escalation each posted one note, then one assignment, then one fixed customer line, in that order. English, Urdu, Arabic, and Hindi lines matched the sealed text. Hinglish was classified as Urdu and received the Urdu line, which does not invent a review or a time.
- Assignment HTTP 500, timeout, 422, and partial success withheld the customer message on all five paths and left `escalateAwaitingFirstTeammate` clear. 500, timeout, and partial set `assignAmbiguous`. 422 did not. Note 500, timeout, and 422 also withheld the message. A malformed 200 without an id was treated as partial.
- Ownership stayed silent for a human assignee, an admin body with an empty `part_type`, a teammate author, Risk and Escalations by id and by name, ambiguous ownership, and stale ownership, in English, Urdu, Arabic, Hindi, and Hinglish, including identity recovery with a human assignee.
- English, Urdu-script, and Arabic account-number questions were answered and were not replaced by the fixed line, including after a Fin handoff phrase.
- `password is`, `pwd:`, `otp is`, `token`, and an `sk-` key of 16 or more characters did not leave the raw secret in the note or the customer line.
- A webhook replay that already contained the fixed line, a ticket-state loss with the write-op store kept, a parallel in-flight pair, a second different handoff phrase, and a 422 followed by recovery each produced exactly one customer message. An ambiguous 500 was not retried into a send.
- Ordinary FAQ answers (consistency rule, leverage, and a later FAQ while the bot was still the assignee) and both MT5 spread-test asks (plain, and after a Fin handoff line) stayed on their own paths: one public reply, no note, no assignment.

## Critical findings

### 1. Hindi and Hinglish account-number questions are swallowed

Welcome correctly refuses these as a handoff. `decide()` returns `route_normal` / `account_number_question` (`fixedMessageHandoff.js` lines 275–283). The webhook logs that and falls through (`index.js` lines 3896–3914). The draft is then rejected by the pre-send gate, and the missed-escalation branch force-sends the fixed line.

The gate treats a sentence ending in an ASCII `?` as a question (`statePresend/textUtils.js` `isQuestionSentence`, lines 184–188). Coverage is token overlap (`statePresend/multiAskCompleteness.js` `isCovered`, threshold 0.45). A probe of the pinned modules against the synthetic draft `SYNTH_ACCOUNT_ANSWER Your question about the account number...` gave:

| Customer text | Extracted as | Coverage | Result |
| --- | --- | --- | --- |
| `What is my account number?` | question | covered | answered |
| `میرا اکاؤنٹ نمبر کیا ہے؟` | statement (Arabic `؟`, not ASCII `?`) | not a question | answered |
| `ما هو رقم الحساب؟` | statement | not a question | answered |
| `मेरा खाता नंबर क्या है?` | question | missed | fixed Hindi line sent |
| `मेरा अकाउंट नंबर क्या है?` | question | missed | fixed Hindi line sent |
| `mera account number kya hai?` | question | missed (2 of 5 tokens) | fixed Urdu line sent |

`presendMega.js` lines 277–280 record `MISSED_QUESTION`. `targetedRegeneration.js` `decideFallbackIntent` (lines 55–56) treats any extracted question as understood, and line 109 returns `needs-escalate`. `index.js` lines 4555–4644 then call `commitFixedMessageHandoff` with `path: 'missed_escalation'`. `decide()` sets `force` whenever `path !== 'welcome'` (line 291), so the account-number exemption never runs. The customer receives the fixed handoff line and `escalateAwaitingFirstTeammate` is set.

Failing cases: `R3I-acct-hi-plain`, `R3I-acct-hi-after-fin`, `R3I-acct-hi-latin-script-plain`, `R3I-acct-hi-latin-script-after-fin`, `R3I-acct-hinglish-plain`, `R3I-acct-hinglish-after-fin`.

### 2. Recovery swallows an account-number question

The unfinished-handoff block runs before the welcome exemption and returns 200 unconditionally (`index.js` lines 3839–3858, marker `FIXED_MESSAGE_HANDOFF_R3:recovery`).

- After assignment 422 (note confirmed, not ambiguous), the next customer text `What is my account number?` is sent as `A teammate now has this conversation.` The recovery path is not `welcome`, so lines 275–283 do not apply and lines 291–332 force the fixed line. Case `R3I-recovery-swallows-account-question`.
- After assignment 500 (`assignAmbiguous`), the same question produces zero customer comments. Recovery returns `assign_ambiguous_held` and the handler returns 200 before any answer. Case `R3I-recovery-500-swallows-account-question`.

### 3. Credential material leaves in the internal note or the note-translation prompt

`credentialSanitizer.js` lines 9–20 and `fixedMessageHandoff.js` `redactCredentials` lines 75–91 share one label pattern: an English label, then the separator class `[\s:=-]`, then one token. An apostrophe is not a separator, so both `password's CANARY77` and `password’s CANARY77` become `password[secret] CANARY77`. The canary remains. Arabic `كلمة المرور`, Urdu `پاس ورڈ`, and Hindi `पासवर्ड` are not labels, so those strings are unchanged.

`sanitizeEscalateProblem` (`index.js` lines 546–549) runs that redactor and then `buildEscalateNoteAndAssignee` (lines 627–632) puts the result through `ensureInternalNoteEnglish` (lines 590–612). `looksNonEnglishNote` (lines 574–587) matches Arabic and Urdu script only. It does not match Devanagari.

Observed surfaces, synthetic canary `CANARY77` only:

| Case | Surface that still contained the canary |
| --- | --- |
| `R3I-cred-welcome-password-apostrophe` | internal note |
| `R3I-cred-welcome-password-curly` | internal note |
| `R3I-cred-main-apostrophe` | internal note (model body through the same sanitizer) |
| `R3I-cred-welcome-hindi-label` | internal note (Hindi is not translated, and `पासवर्ड` is not a label) |
| `R3I-cred-welcome-arabic-label` | note-translation prompt (`كلمة المرور` survives redaction, then the raw problem is sent to the model) |
| `R3I-cred-welcome-urdu-label` | note-translation prompt |
| `R3I-cred-note-translation-prompt` | note-translation prompt |

The sealed customer line itself did not contain the canary. English `password is`, `pwd:`, `otp is`, `token`, and `sk-` did not leak. An `sk-` value of 16 or more characters is rewritten to a mangled `[secret[secret]` token; the key material is gone, so that case is not critical.

### 4. A status ping after a successful handoff promises a review and a reply time, and it does so while a human teammate owns the conversation

After a successful welcome, the follow-up `any update?` was posted as:

`We have already passed this to the team. They are reviewing it and will reply here when ready.`

That sentence is `STATUS_ONLY_REPLIES` in `escalateRelatedOnly.js` lines 474–479. `isStatusPing` (lines 245–254) matches `any update`. Hook A (`index.js` lines 3712–3752) runs this gate before the ownership defer at lines 3867–3874, and `evaluateFromConvState` (`escalateRelatedOnly.js` lines 574–599) never reads the assignee. The follow-up fixture set `admin_assignee_id` to the synthetic teammate `424242` and still received the public comment. The fixed handoff line itself does not contain a promise. Case `R3I-status-ping-no-promise`. This is a premature promise and an ownership miss on the same call.

No duplicate fixed-message send was reproduced when the first fixed line was present in the fetched parts, when the write-op store remained, on a parallel in-flight pair, on a second handoff phrase, or on 422-then-recovery (exactly one fixed line).

## Uncovered paths

- Losing both ticket state and the write-op store in the same restart, with a fetch that does not yet show the fixed line, was not asserted. The write-op store alone did suppress the replay.
- The Italian fixed line is present and was not part of the required matrix.
- A status ping while the bot is still the assignee was not a separate case. The human-assignee ping above is the stronger case, and it already sends.
- Account questions that use only the Arabic question mark `؟` were not swallowed on a fresh welcome. The swallow is the ASCII-`?` Hindi and Hinglish path, plus the recovery short-circuit, which swallows English too.
- The author's unit tests were not run.

## Next action

Do not merge, approve, activate, or deploy PR 20. Fix the four critical classes and request a fresh review of a new pin:

1. Keep the account-number exemption on every path that can still post, including `missed_escalation` and `recovery`. A pre-send `needs-escalate` on an account-number question must not become a fixed handoff.
2. Do not enter the recovery block for an account-number question, and do not return 200 from an ambiguous hold before that question can be answered.
3. Redact apostrophe and curly-apostrophe forms, and Arabic, Urdu, and Hindi credential labels, before the note is built and before `ensureInternalNoteEnglish` sends the problem to the model. Treat Devanagari as non-English for that translation, after redaction.
4. Do not post a status line that promises a review or a reply time, and do not post it when ownership is a human teammate. Hook A has to fail closed on the same ownership rules as the defer gate.
