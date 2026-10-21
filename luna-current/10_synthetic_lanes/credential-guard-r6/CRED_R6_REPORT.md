# Credential guard R6 — frozen staging candidate

Status: **frozen candidate, not approved**. This replaces the R5 behavior that the independent review scored NEEDS CHANGES / NO-GO (46 critical out of 82). The reviewer's case file was not read. The five written summaries are the whole spec. Author and reviewer must be different agents. This report does not approve the candidate and does not authorize a release.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Nothing here is wired into `index.js`, `statePresend.js`, or `collector.js`.

## What changed

`credentialGuardR6.js` is a pure staging module.

1. Matching runs on normalized text: NFKC, zero-width characters removed, inherited combining marks removed, homoglyphs and fullwidth mapped, spaced or split labels collapsed, leetspeak folded for labels, plus `pwd` / `passwd`. Short tokens are kept. A base64 token in a draft is decoded and compared with known secrets. Urdu, Arabic, Hindi, and Hinglish cues are included. `mera password hai X` captures `X`, not `hai`. Devanagari matras are kept so Hindi words stay intact; inherited spoof marks are still removed.
2. `guardSend` checks the outbound draft against every secret extracted from client history, not only the current message. Notes are redacted. Client comments that echo a secret are replaced with the fixed message from the existing credentials rule.
3. `createChoke` wraps `postReply` and `postClientCommentOnce`. `proposed-integration.diff` is the unapplied integration: one choke inside those two functions, so owner replies (`executeOwnerActionPlan`, `processAuthorizedNoteCommands`), the helper retry, `__presendRegenerate`, the `REPEATED_QUESTION` retry, and replay are covered because they all post through those functions. `patch --dry-run -p1` succeeds. The diff was not applied.
4. The 55188 spread-test template is sent only for an explicit check or test request. `spread some light`, `problem spread`, and `risk spread` do not qualify. Explicit requests in Hinglish, Hindi, Urdu, and Arabic do. The template password is blocked in any other outbound draft.
5. `redactText` and `redactTurnMeta` use the same normalized forms. The diff calls them from `noteInbound`, `observe`, the `SKIP model` / `parsed.body` log, and the `OWNER_CMD_LLM_RAW` log.

## Tests

`node luna-current/10_synthetic_lanes/credential-guard-r6/credentialGuardR6.test.js`

22 passed, 0 failed. Fixtures are synthetic. `node --check` passed on both JS files. The dry-run does not modify the runtime files.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/10_synthetic_lanes/credential-guard-r6/credentialGuardR6.js` | `f9e3c47a3c34e52f2bff50be825a8fa955355d17885ddff96b53c6293d6e5bb7` |
| `luna-current/10_synthetic_lanes/credential-guard-r6/credentialGuardR6.test.js` | `83915d37045a1bc69039a7e9c0a131f2e9cdb32ee2f219396063c1163641426e` |
| `luna-current/10_synthetic_lanes/credential-guard-r6/proposed-integration.diff` | `f544e94f133950ea21fba6acea5426a0901a8bc7a74b449e28c7b0628b2e853d` |

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- The choke and the log/memory redaction are a proposed diff, not a live wire-up. Applying it still needs that review and a separate release approval.
- The original 82-case file was not replayed. Coverage is the summaries above, not a claim that all 46 critical cases are closed.
- No live webhook or customer conversation was used.
