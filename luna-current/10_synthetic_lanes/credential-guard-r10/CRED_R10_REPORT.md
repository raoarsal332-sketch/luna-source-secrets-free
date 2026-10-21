# Credential Guard R10

Frozen staging candidate. `approved`, `release`, and `wired` are false. This agent does not approve it.

The R9 review case file was not opened. R10 follows the written class summary only: 181 cases, 42 critical leak events across 18 cases, 0 unauthorized template sends, 0 over-blocks, 0 regressions, 5 missed eligible asks, 1 hang.

## Protected files

`system-prompt.txt` and `fundedelite-faqs.md` were not edited.

| File | SHA-256 |
| --- | --- |
| `luna-current/01_runtime/system-prompt.txt` | `bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d` |
| `luna-current/01_runtime/fundedelite-faqs.md` | `8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92` |
| `luna-current/04_docs/fundedelite-faqs.md` | `8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92` |

## Class 1 — key and token families, embedded secrets, nested decoding

Labeled families are recognized in any case, with space, underscore, or hyphen, and with or without a colon: `api_key`, `API key`, `apikey`, `token`, `secret`, and `bearer`. A copula plus an ordinary word (`the secret is patience`) is not a secret. A separator or a shaped or long token is.

`sk-` keys are matched inside a larger token. A remembered secret matches inside a larger token only at a non-alphanumeric boundary (`pass=Hunt9`). `Hunt99` does not match `Hunt9`.

HTML entities are decoded repeatedly, so `&amp;#72;` becomes `H` before matching. Labeled base64, including nested base64, is decoded before the inner value is matched. Comparison strips zero-width characters.

## Class 2 — one choke before every model call

`__guardedChat` is the only `openai.chat.completions.create` left in `index.js`. It runs `guardModelMessages` on every message content, including system, user, and array text parts, before the call.

Live call sites covered by `proposed-integration.diff`:

| Site | File |
| --- | --- |
| `ensureInternalNoteEnglish` | `01_runtime/index.js` |
| `summarizeEscalationsClientBatch` (escalation search summarizer) | `01_runtime/index.js` |
| repeated-question rewrite inside `postClientCommentOnceInner` | `01_runtime/index.js` |
| `interpretOwnerCommandViaLlm` | `01_runtime/index.js` |
| FAQ force rewrite | `01_runtime/index.js` |
| `__presendRegenerate` | `01_runtime/index.js` |
| repeated-question retry | `01_runtime/index.js` |
| `plainCreate`, tool round, and final tool reply | `01_runtime/lunaToolsRuntime.js` |
| `createOpenAiLlm` | `03_luna-maintainer/llm.js` |
| local chat completion | `06_tools/luna-local-chat.js` |

Owner-dictated public reply text is passed through `guardSend` before `postReply`.

Offline smoke scripts still call a model directly and are not on the live request path: `smoke_final.js`, `smoke_movie.js`, `smoke_v2.js`, `smoke_v3.js`, `smoke_v4.js`, `smoke_v5.js`, `smoke_v6.js`, `smoke_v7.js`, `smoke_v8.js`, `smoke_v9.js`, `smoke_v10.js`.

## Class 3 — scrub the whole turn

A secret found in a turn is remembered for that conversation and removed from presend memory, state, and model history (`noteInbound`, `buildState`, `messagesFor`, `buildHistory`). Escalation summaries, English note rewrites, and retry prompts are redacted before they are stored or sent to a model. Public comments that still carry a secret become the fixed message. Notes are redacted. Comparison uses the zero-width-stripped form.

## Class 4 — time bound

Comment and tag stripping is an `indexOf` scan. There is no comment regex. Input longer than 90,000 characters, or an unclosed `<!--`, fails closed. `<!--` plus 100,000 characters returns `validation_error` with `post: false` in well under 200ms. The total guard budget is 200ms.

## Class 5 — eligibility

These asks are eligible:

- `How should I check your spreads?`
- `I want to check the spreads`
- `سپریڈ چیک کرنے کا طریقہ بتائیں`
- `spread test account dena`

`isSelfReport` is structural. A question mark or a request mood (how, can, should, want, please, send, dena, بتائیں) is not a self-report. `I check the spreads every day` and `I was testing the spreads` stay self-reports. `please check the spreads`, `I want a spread test`, and the other R9 near-misses stay ineligible. No near-miss receives the 55188 template.

## Class 6 — system prompt

`system-prompt.txt` is the owner-authorized public disclosure of the 55188 spread-test template. Its SHA-256 and length are `AUTHORIZED_PROMPT_DISCLOSURE`. An exact copy is left unchanged on the system-message path, so the authorized template remains available to the model. Any text appended to that prompt, and every other system or user message, is scrubbed of every other secret. The template password is not left in user content.

## What this lane does not do

No VPS, production host, Intercom API, or `.env` was touched. `index.js` on this branch does not load the guard. The wiring is only in `proposed-integration.diff`, and `patch --dry-run` succeeds. 43 lane tests passed.

## Freeze

Stop here. Do not self-approve.
