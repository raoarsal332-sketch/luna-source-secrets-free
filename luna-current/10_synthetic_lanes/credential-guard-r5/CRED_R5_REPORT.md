# Credential guard R5 — frozen candidate

Status: **frozen candidate, not approved**. Author and reviewer must be different agents. This report does not approve the candidate and does not authorize a release.

Synthetic only. No production, VPS, Intercom, secrets, `.env`, or `bot-control.json`. No deploy and no restart. The prior R4 tree `e40bf7db` and review `b7b58257` are not in this checkout, so this is a rebuild from the repo and the t812 handoff delta, not a byte patch on those trees.

## What changed

`decideCredentialGuard` is a pure function. It is not wired into `index.js` or `credentialSanitizer.js`.

- After Luna's own team assign, a pasted secret still produces the fixed message and overrides a skip (AF02).
- After Luna's own escalation assign, same fixed message (NT03).
- After an assignment part authored by a Luna seat to team or escalation, same fixed message (NC01). A human teammate's assignment is not labeled AF02/NC01.
- `pass X`, `typed X`, and `here it is: X` are scanned on the full string. There is no length cap and no start anchor.
- OH07 uses match mode `contains`: a cue that does not cover the whole message, or a draft that contains an extracted value, is replaced with the fixed message.
- Without a disclosure, a Luna assign does not force the security message, and a skip is left to the caller.
- Account-number text such as `219876` is not treated as a secret. `pass the challenge` and `typed the wrong email` are not disclosures.

The fixed message is only the existing credentials rule: change it immediately, do not repeat it, escalate as a security event. It does not state an account, payout, lock, or refund outcome.

Bare `pass` / `typed` tokens are accepted when they contain a digit, contain a capital letter, or are at least 6 characters. A colon, equals sign, or `is`/`was` accepts a token of 3 or more characters. Function words and challenge words are rejected. This rule is a candidate choice because the original pack was not available.

## Tests

`node luna-current/10_synthetic_lanes/credential-guard-r5/credentialGuard.test.js`

17 passed, 0 failed. Fixtures are synthetic. `node --check` passed on both JS files.

## File hashes

| File | SHA-256 |
|---|---|
| `luna-current/10_synthetic_lanes/credential-guard-r5/credentialGuard.js` | `2e9cd341955ded1bbb1ea512731d30d0a26b05023f70849353cb4316474ac8c8` |
| `luna-current/10_synthetic_lanes/credential-guard-r5/credentialGuard.test.js` | `6ed130f6ad9ee90a25d8f2ed8447afd1a20aafbc644016092a0764b9c0c07a72` |

## Blockers

- Independent review has not been run. This agent is the author and must not approve it.
- Not wired into the runtime. Integration waits on that review and on a separate release approval.
- R4 bytes were not available, so behavior that R4 already had, beyond this delta, was not replayed.
- The bare-token rule above may not match every unseen fixture.
- No live webhook or customer conversation was used.
