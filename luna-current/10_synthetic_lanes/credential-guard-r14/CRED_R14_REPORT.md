# Credential Guard R14

Frozen staging candidate. `approved`, `release`, and `wired` stay false. This lane is not connected to the live engine. `system-prompt.txt` and both `fundedelite-faqs.md` copies are unchanged.

Independent review of R13 (`7c8b668`) was not opened. The five class fixes below are built from the review facts that were supplied with the request: 116/277 leak failures (1964 bytes), eligible exact template 8/13, ineligible template sends 0, over-blocks 2/227 (0.88%), fail-closed misses 4/6, and 7 unguarded transports.

## 1. Owner text and every control path

`authorizeOutbound` checks owner `REPLY:` / `NOTE:` text, including `ACTION:` / `BODY:` continuations, against the conversation's taint hashes. The same check runs for the customer body. Inbound text on the operation is remembered before that check, including a secret that arrives on the same call as the outbound body.

`control.js` calls `rememberControl` before reply, note, close, open, snooze, assign, unassign, priority, tag, untag, and the `/control/intercom` passthrough. `intercomRequest` remembers again, then `guardedSend` authorizes the payload. `client_text`, `inbound`, and `owner_text` are removed from the object that would be posted. A tainted token in owner-dictated text, including a Latin secret inside Urdu or Arabic, is replaced with the fixed sentence or the redacted internal note. Clean snooze, close, open, and assign metadata still pass. Metadata that contains a tainted token does not.

## 2. Fail-closed logs and sends

`logCode` keeps only short uppercase log tags. Bodies, free text, error messages, stacks, and numbers outside 0–999 become `[redacted]`. `console` and `process.stdout` are scrubbed at the top of `index.js`. `WEBHOOK_ERR` is `logEvent('WEBHOOK_ERR')` and does not receive `e.message` or `e.stack`. The state-presend gate error log no longer interpolates the exception, and that catch returns the fixed sentence with send held.

`guardedSend` remembers inbound, then on `budgetMs === 0`, an oversize body, a thrown read, or a timeout hands the transport only the fixed sentence. A timeout-length control reply does not read the raw body. The F003 path (24000 OTP characters, throwing getter) records that sentence and not the OTP.

## 3. Network seal

`credentialGuardR14-preload.js` is loaded with `node --require` and as the first require in `index.js`, before any other module. `installNetworkSeal` patches the already-loaded singletons and the lower-level handles: `node:http` / `https` / `net` / `tls`, `net.Socket.prototype.connect`, TCP connect, `fetch`, `child_process` including the sync spawn binding, `process.binding` for egress bindings, `process.getBuiltinModule`, `Module._load`, and `Module.prototype.require`. The only egress is `guardedSend` through `dispatchAuthorized`, which holds a one-shot permit. Without that permit every enumerated probe throws `UNGUARDED_EGRESS`, including functions captured before the seal. With the permit, `assertEgressPermitted` returns true and does not open a connection.

## 4. Template topic

`give me the test account`, `how do I check spreads`, and their `<br>` / `&lt;br&gt;` forms flatten to the authorized template topic. Presend calls `isAuthorizedTemplateTopic` before the spread-credential hard fail, so those asks are not rejected as the wrong topic. When the ask is eligible, the recorded body is the exact 213-character `SPREAD_TEST_REPLY`.

`I want the test account but not for spreads` is not an authorized topic. It is recorded as borderline `not_for_spreads` and the fixed sentence is what would be sent. The earlier near-misses stay recorded (`no_request_shape`, `definition`, `self_report`, `negation`, `payout`, `spreadsheet`). Unauthorized template sends in that set: 0.

## 5. Exact-token redaction

Common dictionary words are tainted only when they are the credential value. Substrings are not hashed. `password is sunshine` blocks `sunshine` and leaves `shine` and `machine` untouched, including inside model messages. `password is shine` blocks the token `shine` and does not block `sunshine`. A dictionary word that never appears in credential context is not tainted.

Re-measured on the runtime FAQ, split into paragraphs of 40–4000 characters: 212 answers, 0 blocked (0%, under the 1% target). `$7.000` and the Jerry mention href for workspace `h2z8cgfr` pass unchanged.

## Wiring

`proposed-integration.diff` is unapplied. `patch --dry-run -p1` succeeds. The added `luna-current/01_runtime/credentialGuardR14.js` matches the lane module. The added preload matches `credentialGuardR14-preload.js`. Live `index.js` does not reference `credentialGuardR14`.

Offline smoke scripts under `01_runtime/` (`smoke_final.js`, `smoke_movie.js`, `smoke_v2.js` through `smoke_v10.js`) are not loaded by the engine and are not given a network client by this diff. `09_failfix_staging/faq-kb.js` is a staging copy, also outside the engine require path.

## Status

Candidate `credential-guard-r14`. Frozen. Not approved, not released, not wired.
