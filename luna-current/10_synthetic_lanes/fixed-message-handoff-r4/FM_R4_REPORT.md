# Fixed-message handoff R4 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/fixed-message-handoff-r3-8ad1` at `88a663da6b1aac1e8e14fe4e9f1459f2eea7287b`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `seat-e`, `human-1`, `human-7`). The tests use an in-process recording transport. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

## What changed

The R3 order, assignment-failure, ownership, and replay behavior is still in place. Four gaps are closed in the runtime.

1. **Account-number questions.** A question is an account-number reference plus an interrogative (`?`, `؟`, `？`, Devanagari क्या/कैसे/कहाँ/कहां/कब/क्यों/कौन/किस, or Hinglish kya/kaise/kahan/kab/kyun/kyon/kaun/kis). Hindi number nouns include नंबर, नम्बर, and संख्या. Account nouns include खाता, अकाउंट, अकाउण्ट, एकाउंट, and अकाउन्ट. `decide()` returns `route_normal` for that question on every path, before ownership silence and before the force flag. A supplied identity (`my account number is 189143`) is not a question and still hands off. The recovery branch checks the question before it returns, for both a 422 retry (`assignConfirmed` false) and a 500 / ambiguous hold (`assignAmbiguous`). Missed escalation does not call the handoff for an account question; it posts the existing draft when that draft is non-empty and is not a fixed line. Main escalate and pre-send escalate do the same. Question sentences, ask detection, and compound-ask splitting treat Devanagari danda, Arabic and fullwidth question marks, और, and aur.

2. **Credential redaction.** `'` and `’` (U+2019), including a possessive `'s` / `’s`, are separators. The labels كلمة المرور, پاس ورڈ, and पासवर्ड are matched without an ASCII word boundary. Redaction is one pass on the original text, so a placeholder cannot be treated as a second secret and a canary cannot survive a narrower first match. `ensureInternalNoteEnglish` redacts before the translation prompt and redacts model output before it enters the note. `looksNonEnglishNote` detects Devanagari (U+0900–U+097F).

3. **Status pings after a handoff.** The ownership defer runs before Hook A. A status ping (`any update?`) is silent when classification without the pending-assignee exception says a human or another assignee owns the conversation, including the assignee this handoff just confirmed. Other messages still let that confirmed assignee finish the one fixed message. `evaluateFromConvState` reads `assigneeId` and `conversation.admin_assignee_id`. A human owner produces `SKIP` / `assignee_owns_status_ping`. A bot seat, or a call that does not pass an assignee, keeps the previous holding-line behavior. An account-number question falls through instead of becoming a holding line. Account questions are not silenced by either defer.

4. **Kept.** Successful note, then successful assignment, then one fixed message. Assignment 500, timeout, 422, and partial success withhold the message and `escalateAwaitingFirstTeammate`. Ambiguous writes are not replayed. Ownership still fails closed for a human assignee, an admin body without `part_type`, author type teammate, Risk and Escalations teams, and ambiguous or stale ownership. Urdu, Arabic, and Hindi handoff asks still select their own fixed lines. Those lines do not add a promise.

## Tests

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r4/fixedMessageHandoff.test.js`

10 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r3/fixedMessageHandoff.test.js`

33 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.test.js`

16 passed, 0 failed.

`node --check` passed on `fixedMessageHandoff.js`, `index.js`, `escalateRelatedOnly.js`, `credentialSanitizer.js`, and `textUtils.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `5e845f478296c0ff28431e84eed529db8656227137f8c7afaa88014e3c1a0e64` |
| `luna-current/01_runtime/index.js` | `4548780b984af5a285e973c6c4d9146843fb5e4d5ccf1ea4234c207ddafbcd10` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `1d1a0f6ae8b5bc2e91d9068425b8476d4e7fe92e3296c8627b826a932d34189a` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `d856030f693b420820cc52dcc121ab4638c7fa8c1b22bd266f5a7e1f585b3f1a` |
| `luna-current/02_statePresend/textUtils.js` | `8a023ab868017cac7e04a5e89de85a2960dcba1c1e7e21b1dce8dad925a6c20c` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r4/fixedMessageHandoff.test.js` | `6e2742265df58d28ed5fb9c4d54dc004c9895926220b85c8dc7ec0edd9348b66` |

This report's own SHA-256 is not written inside itself. It is recorded in the freeze commit message.

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- Not a release. No production, VPS, Intercom call, secret, deploy, or merge was performed.
- No live webhook or customer conversation was used.
