# Fixed-message handoff R3 — freeze

Status: **frozen for independent review. Not approved.** This file does not approve the candidate, does not assign a critical count, and does not authorize a release, deploy, or merge.

Base: `cursor/fixed-message-handoff-r2-c90d` (PR #14, commit `c9548cc7d7be89cd622415b01da97face8f25be8`). R2 extracted the old welcome and was not wired into `01_runtime/index.js`. R3 is the proposed integration. The R2 lane is unchanged.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `seat-e`, `human-1`, `human-7`). The tests use an in-process recording transport. They do not open a socket.

This author is not the reviewer. Do not treat this report as the independent review.

## What changed

`commitFixedMessageHandoff` in `01_runtime/index.js` is the only customer-facing handoff sequence. It is used on all five paths:

- welcome
- identity recovery
- main escalate
- pre-send escalate
- missed escalation

An in-flight recovery runs before the rest of the webhook when a note already succeeded and the one message has not been sent.

1. **Order.** A successful note, then a successful assignment, then exactly one fixed customer message. The message is not sent first.
2. **Assignment failure.** HTTP 500, timeout, 422, or a partial success (malformed body, `unknown`, or an errors array) does not send the message and does not set `escalateAwaitingFirstTeammate`. An ambiguous 500, timeout, or partial assignment is not replayed. If a later read shows that same assignee, recovery sends the one message and does not post the note again. A finished turn does not send a second message. A later customer turn may start a new handoff.
3. **Ownership fails closed in every language.** A human assignee, an admin body with no `part_type`, author type `teammate`, a Risk or Escalations team (id or team name), and ambiguous or stale ownership all stay silent. `shouldDeferToHumanTeammate` uses that classification. English phrase checks do not reopen the thread. The assignee this handoff itself just confirmed is not treated as foreign ownership, so the one message can still be completed.
4. **Account-number questions.** On the welcome path, an account-number question in English, Urdu, Arabic, or Hindi is routed to the normal answer / escalation path. The welcome does not take it.
5. **Language.** Urdu, Arabic, and Hindi handoff asks are chosen by script and by letters that separate Urdu from Arabic, then by that language's role-and-act grammar. They do not go through the English live-agent expression. Arabic script without Urdu letters gets the Arabic line, not the Urdu line. The fixed lines state only that a teammate now has the conversation. They do not promise a review, a time, or that anyone holds the customer's details.
6. **Credentials.** `sanitizeEscalateProblem` redacts credential values before the note is built. The note HTML is redacted again at send. The customer message is one of the fixed lines, and it is redacted before send. Account numbers are kept.

`escalateAwaitingFirstTeammate = true` is set only inside `commitFixedMessageHandoff`, and only when the sequence returns `setAwaiting`.

## Tests

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r3/fixedMessageHandoff.test.js`

33 passed, 0 failed. `node --check` passed on `fixedMessageHandoff.js`, `teammateHandoffGates.js`, and `index.js`.

The unchanged R2 suite still passes: 16 passed, 0 failed. That suite pins the old welcome extraction. It is not this integration.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `4b540186af6cce394abd3f6a90cc51a56d908bd823d647a8cc5653cca8245236` |
| `luna-current/01_runtime/teammateHandoffGates.js` | `96eaf4ce75a0eb888cdabb5552a7e90996cdde2278721a8958e7991032e4ca2b` |
| `luna-current/01_runtime/index.js` | `a99d781e7d6d0a2297f76fa8d81e7e34a0478ad83402ae7c9cd90d7c12dbf1cd` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r3/fixedMessageHandoff.test.js` | `dce7cea15872aac0e632229dbbcc8d631d3149ae632bffd040d18d492210a92b` |

This report's own SHA-256 is not written inside itself. It is recorded after the file is frozen.

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- Not a release. No production, VPS, Intercom call, secret, deploy, or merge was performed.
- No live webhook or customer conversation was used.
