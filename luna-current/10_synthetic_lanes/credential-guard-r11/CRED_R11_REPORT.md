# Credential Guard R11

Frozen staging candidate. `approved`, `release`, and `wired` are false. This agent does not approve it.

The R10 review case file was not opened. R11 is an architecture change, not another pattern list. The written summary was 200 cases, 38 product leak events, 0 unauthorized template sends, 0 over-blocks, 3 missed eligible asks, and one 4573ms hang.

## Protected files

`system-prompt.txt` and `fundedelite-faqs.md` were not edited.

| File | SHA-256 |
| --- | --- |
| `luna-current/01_runtime/system-prompt.txt` | `bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d` |
| `luna-current/01_runtime/fundedelite-faqs.md` | `8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92` |
| `luna-current/04_docs/fundedelite-faqs.md` | `8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92` |

## A. Deny-by-default outbound

Every customer comment, owner reply, and note is canonicalized before a decision:

- NFKC
- a skeleton fold for Cyrillic, Greek, and common letterlikes
- format characters and zero-width characters removed
- HTML entities decoded, repeatedly
- whitespace and symbol separators collapsed for joined spans

The body becomes the fixed sentence when the canonical form contains any of:

1. a token or joined span the inbound turn classified as secret-like, including a customer token in a credential context (a digit-bearing value of 4 or more characters, or a long high-entropy letter string)
2. an ASCII mixed-class token of 8 or more characters that is not allowlisted
3. a decodable base64 or hex span of 12 or more characters, including nested base64

The allowlist is the exact 55188 template by hash, all-digit order and conversation ids, approved FundedElite, Confirmo, Intercom, Trustpilot, and PropFirmMatch URLs, ordinary hyphenated words, market symbols, and prices. Owner text with no credential label still goes through this rule, so a remembered secret is blocked even when the reply does not say "password".

146 normal FAQ sections were measured. 0 were blocked.

## B. Model, memory, logs

`guardModelMessages` scrubs every message content, tool call, function argument, and tool output, replacing secret-like spans with `[redacted]` before the call. The same scrub is used for presend memory, state, and history. `installProcessScrub` covers logs and maintainer stdout. Local chat scrubs stdout.

Live call sites in `proposed-integration.diff`:

| Site | File |
| --- | --- |
| `__guardedChat` (the only `openai.chat.completions.create` in `index.js`) | `01_runtime/index.js` |
| note English rewrite, escalation summarizer, retries, owner command, FAQ force | `01_runtime/index.js` |
| plain, tool-round, and final tool completions | `01_runtime/lunaToolsRuntime.js` |
| the same three completions | `luna-export/lunaToolsRuntime.js` |
| maintainer JSON completion | `03_luna-maintainer/llm.js` |
| local chat completion | `06_tools/luna-local-chat.js` |

`index.js` loads `./lunaToolsRuntime`. The export copy is the flat tree the maintainer points at, and it is patched too. `llm.js` resolves `./credentialGuardR11`, then `../credentialGuardR11`, then `../01_runtime/credentialGuardR11`, so a flat runtime and the repo layout both work. If the guard cannot be loaded, the maintainer does not call the model.

Offline smoke scripts are not loaded by the engine: `smoke_final.js`, `smoke_movie.js`, `smoke_v2.js` through `smoke_v10.js`.

## C. Linear time

Input longer than 32,768 characters is rejected before any scan. A run of `<` or `&` longer than 32 characters fails closed. A 100,000-character run of `<` returns in well under 200ms with nothing posted. The same is true for a 20,000-character run.

## D. Eligibility

A request is eligible when it is not a negation, a definition, a self-report, a third-party ask, or a payout clause, and it has a spread marker plus a check, test, demo, or account intent, in a request shape (how, want-to, send-me, or demo account). That covers English, Urdu, Hindi, Arabic, and Hinglish, including:

- `I want the demo account to check spreads`
- `مجھے سپریڈ ٹیسٹ اکاؤنٹ بھیجیں`
- `स्प्रेड चेक करने का तरीका बताएं`

`please check the spreads`, `I want a spread test`, definitions, self-reports, and the other near-misses stay ineligible. An ineligible copy of the 55188 template is replaced with the fixed sentence. The password is not sent.

## System prompt

`system-prompt.txt` is the owner-authorized public disclosure of the 55188 template. An exact copy is left unchanged on the system-message path. Text appended to it is scrubbed. The file itself was not edited.

## Freeze

15 lane tests passed. `patch --dry-run` succeeds. Nothing here is wired into the live engine. Stop. Do not self-approve.
