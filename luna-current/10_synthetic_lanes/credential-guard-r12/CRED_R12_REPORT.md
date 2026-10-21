# Credential Guard R12

Frozen staging candidate. `approved`, `release`, and `wired` are false. This agent does not approve it.

R12 is a redesign of the outbound boundary. Detection patterns are no longer the primary control. The R11 review case file was not opened. The written summary was 24 leaks, 0 unauthorized template sends, 39 missed eligible asks, and 8 over-blocks.

## Protected files

`system-prompt.txt` and `fundedelite-faqs.md` were not edited.

| File | SHA-256 |
| --- | --- |
| `luna-current/01_runtime/system-prompt.txt` | `bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d` |
| `luna-current/01_runtime/fundedelite-faqs.md` | `8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92` |
| `luna-current/04_docs/fundedelite-faqs.md` | `8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92` |

## 1. One transport

`authorizeOutbound(op)` is the only authorization decision. `dispatchAuthorized` holds a one-shot permit while the send callback runs. `createGuardedTransport` rejects a write whose permit is missing, including a direct `post`, and still allows a read.

In `proposed-integration.diff`:

- `icRequest` writes call `authorizeOutbound` and then `dispatchAuthorized`. The only `axios(` call is the delegate inside `createGuardedTransport`.
- Open, assignment, close, notes, public replies, owner-dictated replies, retries, replay, and deferred posts use that write path.
- The three conversation-search pollers call `__searchPost`, which calls `authorizeOutbound` before the same transport.
- Every model completion in `index.js` goes through `__guardedChat`. `lunaToolsRuntime.js`, `luna-export/lunaToolsRuntime.js`, maintainer `llm.js`, and local chat each have one completion, and that completion is the callback of `dispatchAuthorized`.
- Startup calls `startupSelfCheck` on `index.js`. The lane test applies the diff in an isolated tree and runs the same static scan. A thrown guard or a 100,000-character run of `<` becomes the fixed public sentence. The raw body is not sent.

An exception or a timeout denies. A public deny sends the fixed sentence. An internal deny sends `Internal note withheld. A credential was removed before this note was saved.` A model request or a search that cannot be made safe is not sent.

## 2. Provenance

Inbound customer text, owner text, attachments, and tool outputs are canonicalized: NFKC, a confusable skeleton that includes the mathematical alphanumeric blocks, zero-width and combining marks removed, HTML entities decoded, and base64 or hex decoded up to four layers. A value offered in a credential context (a label such as password, PIN, OTP, or key, including the cue list used only to label inbound spans) is stored as a SHA-256 hash on that conversation. The set does not keep the raw value.

Outbound text uses the same canonical form. A span whose hash is in the conversation taint set, or in the secret store, is denied at any length, including letters-only and numeric values. Symbol-separated, homoglyph, and mathematical-alphanumeric forms hash to the same value. Decoded layers are checked, so a later hex or nested base64 of a tainted password is denied in the reply, the model request, memory, `lastEscalateProblem`, and logs.

High-entropy ASCII and encoded spans that decode to a labeled secret remain a secondary check. They do not decide ordinary FAQ prose, prices, or non-ASCII sentences.

`exportTaint` / `importTaint` persist hashes only. A restart that imports the saved set still denies. A second send after a deny records the safe payload again.

## 3. Canonical allowlist

The 55188 template is recognized by a paragraph hash after `<br>`, blank lines, and HTML are normalized. An eligible ask may send those webhook bytes, including the template password. An ineligible copy is replaced with the fixed sentence. The password is not in that payload.

Intercom mention hrefs, the workspace id `h2z8cgfr`, all-digit conversation and admin ids, approved FundedElite, Confirmo, Intercom, Trustpilot, and PropFirmMatch URLs, and prices are structural. They are not a secondary-entropy hit. A customer value that hashes to one of them is still tainted.

## 4. Eligibility

The t691 boundary is unchanged. A request is eligible when it is not a negation, a definition, a self-report, a third-party ask, or a payout clause, and it has a spread marker plus a check, test, demo, or account intent in a request shape. Borderline asks are recorded with a reason instead of being moved across the boundary.

146 normal FAQ sections were measured. 0 were blocked. Payout, handoff, and the Jerry mention note were allowed and their exact bytes were recorded.

## 5. Tests

16 lane tests passed. The adversarial cases record every byte handed to the guarded transport. The suite also covers restart, retry after deny, the canonical template, the Jerry href, the static bypass scan, and `patch --dry-run`.

Offline smoke scripts are not loaded by the engine: `smoke_final.js`, `smoke_movie.js`, and `smoke_v2.js` through `smoke_v10.js`. `scan-acct-mismatch.js` is a standalone search script and is not on the engine require path.

`system-prompt.txt` is the owner-authorized public disclosure of the 55188 template. An exact copy is left unchanged on the system-message path. Text appended to it is scrubbed. The file itself was not edited.

## Freeze

Nothing here is wired into the live engine. Stop. Do not self-approve.
