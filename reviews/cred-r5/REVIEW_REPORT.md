# Independent review — credential guard R5

**Verdict: NEEDS CHANGES (NO-GO).**

This review does not merge, approve, wire, activate, or deploy the candidate. It does not claim historical sealed-set acceptance.

Reviewed commit `e3c1c9c6eb04741c764e803819f521598f7741da` on `cursor/credential-guard-r5-c90d` (PR 12). The candidate is a pure function with no `require`. It is not referenced from `luna-current/01_runtime/index.js`. The author's 17 tests were not used as evidence.

## Limitation

The prior R4 tree `e40bf7db` and review `b7b58257` are not in this repository. No sealed set from that review was replayed. Findings below are from this checkout only: the R5 bytes at `e3c1c9c`, `luna-current/01_runtime/index.js`, `spreadAskGate.js`, `presendMega.js`, and `credentialSanitizer.js`.

## Artifact identities

| Artifact | Identity |
|---|---|
| Reviewed commit | `e3c1c9c6eb04741c764e803819f521598f7741da` |
| `credentialGuard.js` sha256 | `2e9cd341955ded1bbb1ea512731d30d0a26b05023f70849353cb4316474ac8c8` |
| Author `credentialGuard.test.js` sha256 | `6ed130f6ad9ee90a25d8f2ed8447afd1a20aafbc644016092a0764b9c0c07a72` |
| Author `CRED_R5_REPORT.md` sha256 | `b2a4f4c2c9bd74dbd51e0e63d8a9c31f5c12adb2587fc2ffbc50389a4c3092b4` |
| `luna-current/01_runtime/index.js` sha256 | `512b76e3d2ce9e5721b21d88c91ae0aabbb12e750f7310bd03ae4d843aa72c31` |
| `luna-current/01_runtime/spreadAskGate.js` sha256 | `3b2b0546cd9bfb8c94dd062c7c41e77300b3a3a810d251842a292c1737d8f9ef` |
| `luna-current/02_statePresend/credentialSanitizer.js` sha256 | `ed62aa7b330aa090d7faeac9ef70f75e1f2ef312361d6530158e2dd30123d64a` |

`reviews/cred-r5/pinned/credentialGuard.js` is a byte copy of the candidate for this run. The copy's sha256 matches `git show e3c1c9c:.../credentialGuard.js`. It is not a runtime wire-up.

Review artifacts from this run:

| File | sha256 |
|---|---|
| `reviews/cred-r5/adversarial.test.js` | `603786696ae87bdf29969532648c9b5da521cb3741d1ffd43a751fcbae151716` |
| `reviews/cred-r5/RESULTS.json` | `34edcca4501188c1b04548543f13d5ba7cb7158b93558042785c2df33933aa82` |

## How the candidate would integrate

`decideCredentialGuard` scans `clientText` with four ASCII regular expressions (`LABELED_RE`, `PASS_RE`, `TYPED_RE`, `HERE_RE` in `credentialGuard.js`). It does not import `credentialSanitizer.js`. `draftContains` is true only when the draft includes a value already extracted from the client text (`credentialGuard.js:153`). When `findDisclosures` returns nothing, the function returns `action: 'allow'` and `message` equal to the draft (`credentialGuard.js:173-177`).

`index.js` has no call to that function. A wire-up at a single client-comment helper would still miss the owner reply sites, and a call placed before the retry rewrites would miss the new model body. Calling it at every site would still allow the drafts listed below, because the allow decision does not inspect the outbound text.

Outbound sites executed or read for this review:

- Model answer: `index.js:4489` `postClientCommentOnce` after the presend gate. Final post is `postReply` at `index.js:2991`.
- Owner-dictated reply: `executeOwnerActionPlan` `index.js:3278-3280` calls `postReply(..., 'comment', out)` directly.
- Owner note `REPLY:` / “send this message”: `processAuthorizedNoteCommands` `index.js:3450-3452` does the same.
- Locked template: `index.js:3782-3785` returns `SPREAD_TEST_REPLY` (`index.js:2150-2156`) before the model and before presend.
- Retry inside the send helper: `postClientCommentOnceInner` `index.js:2909-2924` can replace `finalBody` with a new model draft.
- Presend regenerate: `index.js:4424-4435`.
- Repeated-question retry: `index.js:4446-4463`.

No case contacted Intercom, a VPS, or production. Secrets in the cases are synthetic. The locked template password was read only in memory and is not written in this report or in `RESULTS.json`.

## Case count and results

Command: `node reviews/cred-r5/adversarial.test.js`

**82 cases. 36 passed. 46 failed. 46 critical.** Exit code 1. That exit code is the measured result.

What held:

- ASCII `password is`, `PASSWORD IS`, `pass:`, `typed`, `here it is:`, and a newline after the label, including when that English label sits inside an Urdu, Arabic, or Hindi sentence.
- Hinglish `password:` with a colon. A long message ending in `pass <secret>`.
- Luna team assign and Luna escalation assign override a skip when the ASCII disclosure is detected. The fixed message does not contain the secret, and the blocked decision JSON does not contain it.
- `pass the challenge` stays allowed.
- The module has no `console` and no `require`.
- An explicit spread-test request sends only the post-processed locked template (server `Fundedelite-Server`, account `55188`). A client password pasted in that same request is not appended.
- These do not send the template: MT5 login/password/server with no spread word, an investor-password question, “spreadsheet”, “not about the spreads”, “spread the word”, “spread across”, “widespread”, and a personal-login line that only uses “spread” as “spread to phase 2”.
- `credentialSanitizer` redacts a plain `password is <secret>` before `noteInbound` / maintainer `observe`.

## Critical findings

### 1. Transformed client disclosures are echoed

Path: `findDisclosures` (`credentialGuard.js:70`) misses the client text → `decideCredentialGuard` (`credentialGuard.js:173-177`) returns the draft → that draft would be posted by `postClientCommentOnce` (`index.js:4489` / `index.js:2991`).

Failed case ids: `zwsp-between-pass-and-word`, `zwsp-inside-password`, `zwsp-after-label`, `homoglyph-cyrillic-o`, `combining-mark-label`, `spaced-label`, `leet-at`, `leet-zero`, `fullwidth-label`, `fullwidth-colon-here`, `pwd-alias`, `passwd-alias`, `split-short-first-token`, `spaced-character-secret`, `split-second-half`, `base64-message`, `urdu-label`, `arabic-label`, `hindi-label`, `hinglish-hai`, `hinglish-pass-hai`, `urdu-otp`.

The patterns are ASCII words plus a single non-space token. A zero-width space, a Cyrillic lookalike, a combining mark, a fullwidth label or colon, a space inside the label, leetspeak, `pwd` / `passwd`, a short first token, a secret split into characters, a base64 body whose draft contains the decoded secret, and Urdu, Arabic, Hindi, or Hinglish wording without an ASCII `password is` / `password:` cue all take the allow path. In `mera password hai <secret>` the scanner consumes `hai` as the value and drops it, so the secret is never extracted.

### 2. The outbound draft is not scanned

`draftContains` cannot become true unless a client-text hit already exists (`credentialGuard.js:147-153`).

- `model-history-echo`: current client text is an ordinary payout update. The model draft repeats a secret from earlier. Allow. Send site `index.js:4489`.
- `owner-dictated-body`: client text is a payout question. The dictated body is `Password: <secret>`. Allow. Send site `index.js:3278-3280`.
- `model-payout-answer-appends-secret`: a payout answer that appends a password is `presendMega.validate` ok and the candidate allow. Send site `index.js:4489`.
- `model-shares-template-password-off-request`: a payout answer that includes server `Fundedelite-Server`, account `55188`, and the locked template password, without the word “spread”, is allowed by presend and by the candidate. Presend’s spread check (`presendMega.js:208-212`) requires the word “spread” in the draft. Send site `index.js:4489`.

### 3. The runtime never calls the guard, including after retries

Failed case ids and anchors:

- `runtime-references-guard` — `index.js` contains no `decideCredentialGuard`.
- `owner-plan-bypasses-guard` — `index.js:3278` `executeOwnerActionPlan` public `REPLY`.
- `owner-note-bypasses-guard` — `index.js:3450` authorized-note `REPLY`.
- `inner-retry-bypasses-guard` — `index.js:2924` (`postClientCommentOnceInner` model rephrase, body assigned from the new completion).
- `presend-regenerate-bypasses-guard` — `index.js:4435` (`__presendRegenerate`, `index.js:4424`).
- `repeated-question-retry-bypasses-guard` — `index.js:4463` (retry body assignment just above that log).

A secret the function would have blocked on a plain `password is` line is still sent on the owner `postReply` path, because that path does not call the function. A retry that runs after a hypothetical earlier check can put a new secret into `finalBody` with no second check.

### 4. The 55188 / Fundedelite-Server template is sent without an explicit spread-test request

Path: `isSpreadCheckAsk` (`index.js:3782`) → `spreadAskGate.gateLegacy` → `explain` returns `reason: 'spread-term'` (`spreadAskGate.js:89-94`) → `postClientCommentOnce(postProcessModelReply(SPREAD_TEST_REPLY))` (`index.js:3783`). `SPREAD_TEST_REPLY` (`index.js:2150-2156`) is the investor template: MetaTrader 5, server `Fundedelite-Server`, account `55188`, and the investor password. This return happens before presend, so `presendMega.js:208-212` does not run.

Failed case ids:

- `spread-idiom-some-light` — “can you spread some light on the payout rules?”
- `spread-idiom-spread-to` — “the problem spread to my second account”
- `spread-idiom-risk` — “how is the risk spread?”

On an explicit spread-test request the early return sends the locked template and does not append a pasted client password (`spread-mixed-client-secret-not-appended` passed). The three idiom messages are not explicit spread-test requests, and the investor template is still the entire public reply.

### 5. Retention and logs keep the same transformed secrets

`noteInbound` (`statePresend.js`, called from `index.js:3732`) and maintainer `observe` (`index.js:4473-4480`, sanitizer applied in `collector.js`) both use `sanitizeCredentials`. That helper uses the same ASCII-label shape. Failed case ids: `log-hinglish-hai`, `log-zwsp`, `log-leet`, `log-urdu`, `log-arabic`, `log-hindi`, `log-homoglyph`, `log-spaced-label`, `log-base64-retained`. The base64 client text is stored verbatim and still decodes to the disclosure.

Two raw log sites are also on the outbound path and do not pass through the sanitizer:

- `skip-logs-model-body` — `index.js:4024` logs `parsed.body`.
- `owner-logs-raw-model` — `index.js:3225` logs the first 240 characters of the owner-command model output.

The candidate module itself writes no logs. `findDisclosures` does return the raw extracted value to its caller. Callers that log that array would record the secret. The blocked `decideCredentialGuard` object does not include it.

## Uncovered paths

- Webhook replay was not executed against Intercom. The replay comment at `index.js:2835` and `postClientCommentOnce` show a second delivery re-enters the same handler. Identical public text can be dropped by the dedupe in `postClientCommentOnceInner`. There is no separate credential filter on that path.
- A password that exists only inside a screenshot was not rendered. The placeholder client text would not contain the secret, and `findDisclosures` never sees image bytes.
- A non-English spread-test request that does not contain the ASCII word “spread” does not take the locked template (Urdu script was not a send). That is a miss of the positive exception, not a send. The model path can still emit the template password afterward; that leak is `model-shares-template-password-off-request`.
- Internal notes other than the owner public `REPLY` path were not posted. `postReply` for `note` does not log the body. It also does not run this candidate.
- R4 sealed cases remain uncovered because those trees are absent.

## Next action

Stop. Do not merge PR 12, do not approve it, and do not wire `decideCredentialGuard` into `index.js`.

The author has to close every failing path above: scan the outbound body, cover the transformed and mixed-language disclosures, call the check on owner replies and on every retry/regenerate body, keep the 55188 template on explicit spread-test requests only, and redact the same forms before any log or `noteInbound` write. A different reviewer has to run a fresh set after that. This report is not sealed-set acceptance.
