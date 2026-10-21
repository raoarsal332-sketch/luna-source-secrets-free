# Credential guard R6 — frozen staging candidate

Status: **frozen candidate, not approved**. This is the R6 staging module after the written R5 review summaries and the later owner requirements on outbound coverage, normalized detection, and narrow 55188 eligibility. The reviewer's case file was not read. Author and reviewer must be different agents. This report does not approve the candidate and does not authorize a release.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. Nothing here is wired into `index.js`, `statePresend.js`, or `collector.js`. `proposed-integration.diff` is unapplied.

## Owner requirements

1. Every public outbound path is checked before posting: model answers, owner-dictated replies, the fixed spread template, retries, replay, and deferred writes. `guardSend` is the check. `createChoke` wraps `postReply` and `postClientCommentOnce` and does not call the transport when `post` is false. `enqueuePublicOp` checks before a body is queued, and `flushQueue` checks again before a recording transport receives it. The diff calls `guardOutboundWrite` inside `icRequest` before `writeOpStore` records a pending op and before `axios`. A non-string body, a thrown validation, or text that cannot be posted safely returns `post: false` and no body.
2. Detection is normalized token equality: NFKC, zero-width characters removed, inherited combining marks removed, homoglyphs and fullwidth mapped, spaced labels collapsed, and leetspeak folded only for a whole token of length 4 or more. `Hunt9` does not match `Hunt99`. `test` does not match `testing`. A base64 token is decoded and compared as a token. Client secrets and secrets introduced by a model or dictated draft are both covered. `password reset` without a copula or separator is left unchanged. Raw secret values are not placed on log lines, error objects, or diagnostic payloads. `redactDiagnostic` drops body, draft, client text, message, and stack fields.
3. 55188 eligibility is `isExplicitSpreadTestRequest`. It matches a direct check or test of spreads, or a direct request for the spread-test account, including the direct Hinglish, Hindi, Urdu, and Arabic sequences already covered. Ordinary spread talk, payout or withdrawal questions, ambiguous text, and unrelated text do not qualify. A caller flag cannot widen the decision. The template password is allowed only when that ask is eligible and the body is the exact `SPREAD_TEST_REPLY` text (or the same text after the existing `<br>` conversion).
4. Regression tests cover credentials, 55188 eligibility, fail-closed and opstore behavior, and one ordinary approved FAQ line already present in `escalateRelatedOnly.js`. Exact outbound bytes are recorded by `createRecordingTransport`, which keeps an in-memory copy and does not use the network.

## Tests

`node luna-current/10_synthetic_lanes/credential-guard-r6/credentialGuardR6.test.js`

28 passed, 0 failed. `node --check` passed on both JS files. `patch --dry-run -p1 --forward --batch` exits 0 and does not modify the runtime files.

## File hashes

Hashes below are for the implementation files. `CRED_R6_MANIFEST.sha256` lists those files and this report. The manifest's own digest is not stored inside itself.

| File | SHA-256 |
|---|---|
| `luna-current/10_synthetic_lanes/credential-guard-r6/credentialGuardR6.js` | `72461d23b878bca818f74d866ae983921d2979200400b49465958913447a62a1` |
| `luna-current/10_synthetic_lanes/credential-guard-r6/credentialGuardR6.test.js` | `cac5784db707bad15c491f19eab6e850d9dc5b4ac2472e0596e164ed4192fb61` |
| `luna-current/10_synthetic_lanes/credential-guard-r6/proposed-integration.diff` | `d7cfd65282ea385f31b6af3e89ffb363f273e790850d81b6ff96d1032d05d191` |

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- The choke, the opstore guard, and the log redaction are a proposed diff, not a live wire-up. Applying it still needs that review and a separate release approval.
- The original 82-case file was not replayed. Coverage is the written summaries and the owner requirements above, not a claim that all 46 critical cases are closed.
- No live webhook or customer conversation was used.
