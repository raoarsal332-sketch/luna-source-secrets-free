# Credential guard R7 — frozen staging candidate

Status: **frozen candidate, not approved**. This follows the written R6 review summary (NEEDS CHANGES, 30 product failures out of 144). The branch `review/cred-r6` and its case file were not read. Author and reviewer must be different agents. This report does not approve the candidate and does not authorize a release.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Nothing here is wired into `index.js`, `statePresend.js`, or `collector.js`. `proposed-integration.diff` is unapplied.

## What changed

1. 55188 eligibility is no longer a `check|test` plus `spread` regex. `isExplicitSpreadTestRequest` accepts a direct request addressed to us, in imperative or question form, asking for the spread-test account or credentials, or how to check spreads on that account. It rejects negation (`no need`, `cannot`, `don't want`), self-reports (`I check`, `I was testing`, `I already test`), definitions (`what is a spread test`), failures (`the test failed`), and non-trading senses (spreadsheet, spread sheet, spread of a rumor). HTML and `&nbsp;` are decoded before that decision. Direct Hinglish, Hindi, Urdu, and Arabic imperatives from the previous candidate still qualify.
2. A first reply may carry an allowed welcome prefix (`Hello`, `Ciao`, `Salam`, or `السلام علیکم`, with an optional first name) and then the exact template. `guardSend` and `guardOutboundWrite` both use `decide()`, so the greeting, the plain template, and the `<br>` form share one eligibility result. The recorded payload keeps that greeting plus the exact template bytes.
3. Detection rejoins character-split values, accepts unpadded and URL-safe base64, strips HTML and decodes numeric and named entities in remembered client parts, and matches a spaced Devanagari `पास वर्ड` label. Public comments that contain an `sk-` or `Bearer` token take the fixed client message. Raw secrets stay out of diagnostic objects.
4. `redactForConversation` redacts remembered secrets. The diff uses it for `noteOutbound`, the `SKIP model` log, and `messagesFor`.
5. `openConversation` goes through `icRequest`, so `guardOutboundWrite` runs. Its payload is only `message_type: open`. The three `conversations/search` posts call `guardOutboundWrite` first. Those query objects have no customer text. A public reply body that still contains a secret is not posted.

## Tests

`node luna-current/10_synthetic_lanes/credential-guard-r7/credentialGuardR7.test.js`

32 passed, 0 failed. `node --check` passed on both JS files. `patch --dry-run -p1 --forward --batch` exits 0 and does not modify the runtime files.

The suite locks 26 eligibility negatives, all rejected, and 6 over-block controls, all allowed. That is the local regression set. It is not a replay of the unseen 144-case file.

## File hashes

`CRED_R7_MANIFEST.sha256` lists these files and this report. The manifest's own digest is not stored inside itself.

| File | SHA-256 |
|---|---|
| `luna-current/10_synthetic_lanes/credential-guard-r7/credentialGuardR7.js` | `15e3353fef9164b7b44178d37741e047e60bda5d43088f22eff2496d2aa2a9cc` |
| `luna-current/10_synthetic_lanes/credential-guard-r7/credentialGuardR7.test.js` | `7465a756beb20b6f1e661660dbfbaba333ccdff05a68293a11ed28e646d56248` |
| `luna-current/10_synthetic_lanes/credential-guard-r7/proposed-integration.diff` | `891523da73e995f5f7dd49d5e7ec53e0a7b0f3c724b74ba357667b147bcc0845` |

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- The choke, the opstore guard, and the log redaction are a proposed diff, not a live wire-up.
- The 144-case file was not replayed, so this does not claim the 30 product failures are closed.
- No live webhook or customer conversation was used.
