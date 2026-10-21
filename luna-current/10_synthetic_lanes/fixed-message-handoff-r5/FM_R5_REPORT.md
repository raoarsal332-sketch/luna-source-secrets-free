# Fixed-message handoff R5 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/fixed-message-handoff-r4-8ad1` at `45e533d60b4b0e8eef7d1607e77a9bbdf8439662`. R3's candidate id is unchanged (`fixed-message-handoff-r3`) so the R3 suite still pins it. `approved` and `release` stay false.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `seat-e`, `human-1`, `human-7`). The tests use an in-process recording transport. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

## What changed

The R4 order, assignment-failure, retry, ownership, FAQ, and MT5 behavior is still in place. Five gaps are closed in the runtime.

1. **One credential sanitizer.** `luna-current/02_statePresend/credentialSanitizer.js` is the only label list. `fixedMessageHandoff.redactCredentials` calls it and does not keep a second copy. `imageAskGuard.stripCredentialValues` loads that same module. The pass treats `'`, `’` (U+2019), HTML tags, and the entities `&#58;`, `&#x3a;`, `&#61;`, `&#x3d;`, `&colon;`, and `&equals;` as separators. A value may be brace-wrapped, wrapped in `<b>`, or up to six tokens, and it stops before `and` / `account` so an account number after a password stays. Labels include كلمة المرور, پاس ورڈ, पास वर्ड, पासवर्ड, गुप्तशब्द, गुप्त शब्द, कूटशब्द, कूट शब्द, संकेत शब्द, and पासकोड. A base64 token of 20 or more characters is redacted when it occurs twice. Values taken from a label, a key prefix, or a repeated base64 token are remembered in the process and stripped from a later echo that has no label. A second pass leaves `[secret]` unchanged. The main prompt redacts conversation history and the latest line before they are concatenated. The owner-command prompt redacts the same way. `postReply` redacts notes and comments, and the final customer post redacts again before that send.

2. **Account-number questions get a non-empty answer.** A question is an account-number reference that is not an identity supply (`my account number is 189143` is still a handoff). A question mark is not required: Devanagari, Hinglish, Urdu, and Arabic interrogatives count, and a short account-number phrase with no digits counts. Welcome, recovery (422 and 500), main escalate, pre-send escalate, and missed escalation each post a line and return. If the draft is a usable answer of at least 12 characters and it does not ask for anything or promise a handoff, that draft is sent. Otherwise the customer gets the MT5 fact: the account number is in the login email, and those details cannot be changed. The same fact is used for Urdu, Arabic, Hindi, Italian, and Hinglish. It asks for nothing extra and it does not promise a teammate. `targetedRegeneration.safeFallback` returns that answer, with send true, when a missed-escalation, needs-escalate, or other cleared-draft hold would otherwise return an empty body. A duplicate hold stays empty.

3. **Identity follows the account exemption.** On main escalate and missed escalation, `ensureIdentityBeforeAccountEscalate` runs only after the account-question return. `pickAccountEmailAsk` asks for the missing field and does not say it will pass the conversation to a teammate. That sentence remains the fixed line, and only after the handoff has succeeded.

4. **Lost ticket state and lost op store.** `commit` reconciles from the conversation parts before it calls the transport. A note whose body contains Account and Problem, an assignment whose target is not the bot seat, and one fixed customer line are not written again. A bot seat is not treated as an already-held assignment. A held 500 whose conversation later shows the human assignee still sends exactly one message. An ambiguous hold whose conversation is still the bot seat still makes no calls.

5. **Hinglish handoff line.** Latin South Asian with no Hindi-specific and no Urdu-specific Latin markers is detected as `hinglish`. No approved Roman-Urdu handoff completion line exists, so the customer line stays the approved Urdu line `یہ گفتگو اب ایک ساتھی کے پاس ہے۔` The Roman line in the account-question answers is the MT5 fact, not a handoff completion line.

## Kept

Successful note, then successful assignment, then one fixed message. Assignment 500, timeout, 422, and partial success withhold the message and `escalateAwaitingFirstTeammate`. Ambiguous writes are not replayed. Ownership still fails closed. Status pings stay silent when a human or another assignee owns the conversation. Account questions still fall through that defer. FAQ and MT5 behavior was not edited. `escalateRelatedOnly.js` and `textUtils.js` are unchanged from R4.

## Tests

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r5/fixedMessageHandoff.test.js`

8 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r4/fixedMessageHandoff.test.js`

10 passed, 0 failed. The label source check now reads the shared sanitizer. The canary checks are unchanged.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r3/fixedMessageHandoff.test.js`

33 passed, 0 failed.

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.test.js`

16 passed, 0 failed.

`node --check` passed on `fixedMessageHandoff.js`, `index.js`, `imageAskGuard.js`, `credentialSanitizer.js`, and `targetedRegeneration.js`.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `d1aa5652e5e499f44fdef17e37023273923c756be37a61337f79357ce62a1f6d` |
| `luna-current/01_runtime/index.js` | `bedc51596887346b1af779ea47c3e31fb8d32d1370592623a0cf73fbc27a9d33` |
| `luna-current/01_runtime/imageAskGuard.js` | `a1f2d24187dab83e5a98f643f8c6cb93bb8f0c8efc118bf936f7f347d12e70b9` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `1d1a0f6ae8b5bc2e91d9068425b8476d4e7fe92e3296c8627b826a932d34189a` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `2d61c7f72280eab88251682a5eece24af6f5a3d7b6b09b0c49bc29eac6796f91` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `f066192a9a5b82e844d240a90222b0905ff3832a4ce1eb9beb71bdcc12d2ed74` |
| `luna-current/02_statePresend/textUtils.js` | `8a023ab868017cac7e04a5e89de85a2960dcba1c1e7e21b1dce8dad925a6c20c` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r4/fixedMessageHandoff.test.js` | `74f9fdd2fbea587515d1ed062fbd0c947d5a305e4b0f3a1f0fd8693e8788ae2d` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r5/fixedMessageHandoff.test.js` | `9dbbd19b7fceae0bfb306276765defb3c13833531ba006b3105549de5bf12c1f` |

`escalateRelatedOnly.js` and `textUtils.js` match the R4 freeze. This report's own SHA-256 is not written inside itself. It is recorded in the freeze commit message.

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- Not a release. No production, VPS, Intercom call, secret, deploy, or merge was performed.
- No live webhook or customer conversation was used.
