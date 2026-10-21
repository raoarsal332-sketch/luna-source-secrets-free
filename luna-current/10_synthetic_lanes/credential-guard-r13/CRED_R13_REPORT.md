# Credential Guard R13

Frozen staging candidate. `approved`, `release`, and `wired` stay false. This lane is not connected to the live engine. `system-prompt.txt` and both `fundedelite-faqs.md` copies are unchanged.

Independent review of R12 (`4ad7375`) was not opened. The five class fixes below are built from the review facts that were supplied with the request.

## 1. One transport

`guardedSend` is the only send path. `control.js` no longer calls axios. `index.js` installs `installRequireTripwire` before any other require, then uses the injected client. `faq-kb.js`, `scan-acct-mismatch.js`, the tool runtimes, the maintainer, state presend, and local chat go through the same boundary.

The tripwire seals `axios`, `http`, and `https`. A request without a one-shot permit throws `UNGUARDED_HTTP`. The static scan rejects `axios(`, `axios.get`/`post`/`put`/`patch`/`delete`, `http.request`, `https.request`, and a raw `require` of those modules in the patched engine files. The patched set scans clean.

Assign, close, snooze, open, and search with no customer body are structural allows. Metadata is not scanned for taint. A customer body on those operations is still judged, and a tainted body is replaced before anything is sent.

## 2. Exceptions, timeouts, and size

The transport callback receives only the authorized payload. A thrown body read, a bounds failure, a timeout, or a body over 16384 characters becomes the fixed sentence for a public send and the redacted internal note for a note. The original body is not copied into that payload.

F003: a 24000-character OTP (`482913` repeated) whose body getter throws is recorded as the fixed sentence (113 characters) and the OTP is absent. The same OTP sent as a normal body is oversize and records the same sentence. A 100000-character run of `<` returns in under 200ms as that sentence.

## 3. Taint that survives a new process

Inbound credential values are stored as SHA-256 hashes (`cg13:`), including letter-only secrets, numeric PIN/OTP, and dash-joined digit groups. `saveConvState` writes `state.credentialTaint` from `exportTaint`. `getConvState` calls `importConversationTaint` before the conversation is used. The exported JSON does not contain the raw secret. After `resetStore`, importing that hash list still blocks the secret on a later turn whose new inbound does not repeat it.

Owner-dictated text is remembered and checked against the same hashes. Fragments of 4 or more characters are hashed as whole tokens, not as slices inside a longer word (`shine` from `sunshine` is removed; `machine` is kept). Split-turn pieces offered in credential context are joined and hashed. Another 4–8 digit MT5 account number beside a credential cue is tainted; a bare account-number sentence is not. Model messages, tool arguments, and escalate memory are scrubbed to `[redacted]` before the model call.

## 4. Ordinary answers

Taint is applied only to values taken from credential context. A stray `<` in ordinary text is kept as text. Secondary entropy still ignores prices, hosts, the workspace id, and dictionary compounds.

Re-measured on the runtime FAQ, split into paragraphs of 40–4000 characters: 212 answers, 0 blocked (0%, under the 1% target). `$7.000` and the Jerry mention href for workspace `h2z8cgfr` pass unchanged.

## 5. Exact 55188 template

Whitespace, blank lines, and `<br>` are canonicalized for recognition. When the ask is eligible, the recorded body is replaced with the exact template: 213 characters, byte-for-byte `SPREAD_TEST_REPLY`. `give me the test account` and `how do I check spreads` both take that path, along with the previously eligible spread asks. Near-misses stay ineligible and are recorded (`no_request_shape`, `definition`, `self_report`, `negation`, `payout`, `spreadsheet`). Unauthorized template sends in that set: 0. The template password is not present on those denies.

## Wiring

`proposed-integration.diff` is unapplied. `patch --dry-run -p1` succeeds. The added `luna-current/01_runtime/credentialGuardR13.js` matches the lane module. Live `index.js` does not reference `credentialGuardR13`.

Offline smoke scripts under `01_runtime/` (`smoke_final.js`, `smoke_movie.js`, `smoke_v2.js` through `smoke_v10.js`) are not loaded by the engine and are not given a network client by this diff. `09_failfix_staging/faq-kb.js` is a staging copy, also outside the engine require path.

## Status

Candidate `credential-guard-r13`. Frozen. Not approved, not released, not wired.
