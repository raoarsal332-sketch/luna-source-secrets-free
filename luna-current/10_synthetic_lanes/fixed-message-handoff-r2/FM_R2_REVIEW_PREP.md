# Fixed-message handoff R2 — review prep

Status: **frozen candidate, not approved**. This file prepares an independent review. It does not approve the candidate, does not assign a critical count, and does not authorize a release.

The handoff says tree `b02e38e7` had 0 critical and that an independent review had not been run. That tree is not in this checkout, so that critical count was not re-checked. This package is a reconstruction of the fixed welcome already in this repo.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Seat ids in the tests are synthetic (`seat-a`, `seat-e`, `human-1`).

## What was frozen

`decideFixedMessageHandoff` copies the current send condition in `01_runtime/index.js` around lines 3763-3772:

- no public Arsal reply yet
- no human teammate public reply
- a Fin/Elite handoff phrase is in history, or the latest client text asks for a live agent, or a client asked for a live agent after the last Elite comment
- the latest client text is a vague or live-agent-only ask

The message is `lockedFinHandoffWelcome` (index.js lines 2552-2559): English, the existing Urdu line for Arabic script, Italian, or Hinglish. Tests assert those return lines still match the runtime source. No wording was rewritten.

Live-agent and Fin-phrase detection call `01_runtime/softEdges.js`. Human-reply detection calls `01_runtime/teammateHandoffGates.js`. `stripHtml` is the copy in that handoff module, which matches `index.js`.

Seat ids are arguments. The runtime constants were not copied into this file. A caller has to pass the same ids the runtime uses or the id equality checks will not match `index.js`. Omitting an Elite id skips only the id-equality branch; a `bot` author still counts, as in the source.

This module is not wired back into `index.js`. `behaviorChange` is false.

## Reviewer checklist

A different agent should review this. Suggested checks:

1. Diff `lockedFinHandoffWelcome`, `isVagueOrLiveAgentOnlyAsk`, and `firstNameFromClient` against `01_runtime/index.js` lines 2534-2559 and 2780-2800.
2. Diff `finHandoffInHistory` and `clientRequestedLiveAgentAfterLastElite` against lines 2362-2376 and 2401-2412, remembering that ids are parameters.
3. Decide whether empty client text should stay vague. The source returns vague for empty text, and this candidate keeps that. With a Fin handoff already in history, the fixed welcome is sent.
4. Decide whether a handoff phrase that exists only in a note should stay ignored. The source ignores notes.
5. Decide whether Arabic script should keep selecting the existing Urdu welcome line.
6. If tree `b02e38e7` can be retrieved, compare it to this reconstruction. This agent could not open it.
7. Do not treat this report, or the handoff's "0 critical" note, as the independent review.

## Tests

`node luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.test.js`

16 passed, 0 failed. Fixtures are synthetic. `node --check` passed on both JS files. The tests pin the extracted behavior. They are not an approval.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js` | `9c9f6eed451748d5a40205ae3828b64d014477e4feb1ea598c41d655bb200e3c` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.test.js` | `b5399271cee444f0d522ea4d3a32ee09ae1f4e8768c6f9ce61e7c9ea6aecc251` |

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- Tree `b02e38e7` was not available, so this is not a verification of that tree.
- Not a release. Wiring or deployment still needs a separate approval.
- No live webhook or customer conversation was used.
