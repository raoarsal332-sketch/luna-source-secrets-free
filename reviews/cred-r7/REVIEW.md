# Credential guard R7 — independent review

**Verdict: NEEDS CHANGES**

This review does not merge, approve, activate, or deploy the candidate. The frozen module still reports `approved: false`, `wired: false`, `release: false`. The integration diff stays unapplied on `main`.

Reviewer constraint: this pass did not read `reviews/cred-r5`, `reviews/cred-r6`, their cases, or the author's `credentialGuardR7.test.js`. The author's 32-test claim in `CRED_R7_REPORT.md` is not evidence.

## Artifact identities

| Artifact | Identity |
| --- | --- |
| PR | https://github.com/raoarsal332-sketch/luna-source-secrets-free/pull/25 |
| Branch | `cursor/credential-guard-r7-c90d` |
| Frozen commit | `b965b40888984cd0ee7d7d6844eef1b758dfe0b4` ("Freeze credential guard R7 for independent review.") |
| Base at review time | `e999d3c8caf327bf9a102e5ba562d9c114a92109` (`origin/main`) |
| Manifest check | `sha256sum -c` from a `git archive` of that commit: all four files OK |
| `credentialGuardR7.js` | `15e3353fef9164b7b44178d37741e047e60bda5d43088f22eff2496d2aa2a9cc` |
| `credentialGuardR7.test.js` | `7465a756beb20b6f1e661660dbfbaba333ccdff05a68293a11ed28e646d56248` (not executed, not read) |
| `proposed-integration.diff` | `891523da73e995f5f7dd49d5e7ec53e0a7b0f3c724b74ba357667b147bcc0845` |
| `CRED_R7_REPORT.md` | `40b0b84c05baeaa91d6432c8da0b85a10b027fa819f70a701948e5d610c03870` |
| Manifest file | `4f4b8cfcc6f25224bec8e837476bc1ed99d7bf0c1e4895b2eb8fdf949d915dc3` |
| Sealed cases | 135, SHA-256 `80da5077f26163817ff891dc7a3e1fd1c83f556cb47a52b96daf1d7e487193f5` |
| Harness | SHA-256 `03ae6e7f69d8c14435a2a4ea00d2d5e9c0a7537cc86a578ad989cd9588ecd0a6` |
| Raw results | SHA-256 `c51c8dc9c88695902c19c2e9be5c7698b465c148e748509b2df74695f046110b` |

Manifest paths are repo-root relative. The check was run from the extracted archive root, not from the lane directory.

Synthetic markers only. No production, VPS, Intercom, customer data, or live credentials. The OpenAI and Intercom tokens in the harness are the literals `synthetic-review-key` and `synthetic-review-token`. DNS lookup was pinned to `93.184.216.34`. The 55188 template password is the string already stored in `luna-current/01_runtime/system-prompt.txt:232` and in `SPREAD_TEST_REPLY`. It is referred to below as `TEMPLATE_PASSWORD`.

## Method

`proposed-integration.diff` was applied with `patch -p1` in a scratch copy of the frozen tree. `handleWebhook` was loaded from the patched `01_runtime/index.js` (`require.main !== module`, so the listen/pollers did not start for the 135 cases). Axios and OpenAI were stubbed in `Module._load` before that require. Each case recorded the HTTP body, console log/error/warn/info, opstore file, ticket file, maintainer tree, `statePresend.snapshot` (noteInbound / noteOutbound), and the model request.

The behavioral load used two symlinks so Node's realpath matched the source tree the diff assumes:

- `01_runtime/statePresend` → `02_statePresend`
- `01_runtime/luna-maintainer` → `03_luna-maintainer`

`presendMega.js` requires `../repeatedClientQuestion`. That resolves only when a one-line shim at `luna-current/repeatedClientQuestion.js` re-exports `01_runtime/repeatedClientQuestion.js`. The shim is test infrastructure. It is not in the diff, and the candidate sources were not edited.

A second layout probe copied `statePresend` and `luna-maintainer` beside `index.js`. Both failed to load:

- `01_runtime/statePresend/presendMega.js` → `Cannot find module '../repeatedClientQuestion'` (pre-existing split)
- `01_runtime/luna-maintainer/collector.js` → `Cannot find module '../10_synthetic_lanes/credential-guard-r7/credentialGuardR7'` (the diff's require is one directory too high for a copy that sits under `01_runtime`)

Search coverage was a separate process: `node -r search-preload.js index.js` so `require.main === module` and the pollers ran. Four `POST https://api.intercom.io/conversations/search` bodies were captured, then the process exited.

Control file for the run: `paused: false`, `testMode: false`, `repliesEnabled: true`. `LUNA_PRESEND_MODE=enforce`. `MAINTAINER_DRY_RUN=true`.

## Denominators

135 sealed cases. Raw harness tally: **37 pass, 98 fail**.

31 of the 98 fails are only `TEMPLATE_PASSWORD` inside the OpenAI system prompt (`system-prompt.txt:232`). Every model call contains that string because the prompt file contains it. Those 31 are not R7 customer-secret leaks and are not counted in the bars below.

PASS bars, after that split:

| Bar | Result |
| --- | --- |
| Public customer-secret leaks | **9** — S11, S15, S18, S30, S32, S35, S36, S37, G14 |
| Console log, opstore, ticket, maintainer, open payload, thrown error | **0** customer-marker hits |
| Intercom note bodies | **0** customer-marker hits |
| Unauthorized 55188 template sends | **8** — N08, N12, N24, N25, N28, N29, N32, N36 |
| Missed direct requests on the greeting path | **2** — D31, D32 |
| Exact template, including first-contact greeting | **33 / 36** template expects |
| Approved-safe over-block (fixed message instead of FAQ) | **2** — O01, O02 |
| FAQ expects that still delivered the approved broker sentence | **30 / 44** |

The other 14 FAQ-expect misses are the 7 unauthorized templates above, plus N10, N11, N30 (pre-existing presend escalation; the detector correctly returned false), G07 (pre-existing repeated-question hold), G13 (tool round-trip never ran), and the two over-blocks.

D36 (`conversation.user.created`, "Hello, please send the spread test account") was silent with log `SKIP fin-wait user.created`. That gate is `shouldWaitForFin` in patched `index.js` around line 2496 and is pre-existing. It is not scored as an R7 detector miss. It is also not a first-contact greeting success.

Customer markers in the OpenAI user message: **45** cases. That path is `buildHistory` (patched `index.js:2657`), which the diff does not redact. Counted separately from console logs. See finding 8.

`messagesFor` column in the sealed harness is **void**. `messagesFor` is not on `module.exports` (`02_statePresend/statePresend.js` exports `buildState` / `getState` only). The harness call threw `statePresend.messagesFor is not a function`, the catch stored that string on the snapshot, and the scanned messages text was empty. A post-seal `buildState(history)` probe, which calls `messagesFor` internally, is reported in finding 7. It is not part of the sealed hash.

## Critical findings

### 1. Unauthorized 55188 template on negation, sarcasm, indirect wording, a Hindi definition, and "my own account"

`isExplicitSpreadTestRequest` (`credentialGuardR7.js:470-497`) returns true, and the patched early path (`index.js:3820-3824`) posts raw `SPREAD_TEST_REPLY` with `modelCalls: 0`. `ensureFirstReplyWelcomeIntro` then prefixes `Hello Sam,\n\n`. The public body is that greeting plus the exact template, including `TEMPLATE_PASSWORD`.

| Case | Client text | Why the detector returns true |
| --- | --- | --- |
| N08 | Never send the spread test account | `never` is outside the negation list. Line 465 matches `send`. |
| N12 | स्प्रेड टेस्ट क्या है | Line 494 `/स्प्रेड\s+(?:चेक\|टेस्ट\|जांच\|जाँच)/` returns true. The definition exclusion on line 484 is English-only (`what is a/the spread test`). |
| N24, N36 | Yeah right, please send the spread test account, as if that would help | Line 465 matches `please send`. |
| N25 | Oh sure, can you send the spread test credentials? Said nobody. | Line 466 matches `can you`. |
| N28 | Would you ever send the spread test account to a random person? | Line 466 matches `would you`. |
| N29 | How do I check the spreads on my own account? | Line 462 `\bhow (?:do i\|can i\|to) check (?:the )?spreads\b` returns true immediately. |
| N32 | Wow, send me the spread test password, I am sure that is the professional move | Line 465 matches `send`. |

N36 was meant to observe a model-emitted template on an ineligible ask. The early path fired first, so that model call never happened. The ineligible English definition N35 ("What is a spread test?") did reach the model, the model emitted the template, and the public body was the fixed message. That one block held.

Controls that stayed off the template and received the broker FAQ include the listed negations other than N08 (`do not send`, `don't want`, `cannot`, `no need`), past and self-report (N14–N17, N34), failure (N18, N19), non-trading senses (spreadsheet, rumor, "spread the word", N20–N23), and indirect wording that lacks an imperative (N26, N27).

### 2. Missed direct requests on first contact

`isExplicitSpreadTestRequest` returned false. The model FAQ was posted with a first-contact greeting. Neither customer received the template.

- D31, Hinglish: `please mujhe spread test account bhejo`. `bhejo` is not in the English verb list (line 465) and not `karo` (line 492). Public: `Salam Sam,\n\n` plus the broker FAQ.
- D32, Arabic: `أرسل لي حساب اختبار السبريد`. `أرسل` is not in `تحقق|افحص|اختبر|فحص` (line 496). Public: `السلام علیکم Sam،\n\n` plus the broker FAQ.

Directs that did produce the exact template, with the greeting on first contact and without it on second contact: D01–D30, D33 (second contact, no greeting prefix), D34 (name `O'Neil`), D35 (name `Bot test`, greeting without a junk name). That includes Urdu `براہ کرم سپریڈ چیک کر دیں` (D30, Arabic greeting prefix) and `Salam` (D28).

### 3. Public customer-secret leaks

The fixed message was required. The posted comment contained the synthetic secret.

| Case | What shipped | Mechanism |
| --- | --- | --- |
| S11 | `Use Nimbus44$k as given.` | `readValueToken` (`credentialGuardR7.js:125-131`) joins only a single-character run. `$` ends the run. `extractSecrets` stores `Nimbus44`, not `Nimbus44$k`. The echo token does not equal the stored value. |
| S37 | same full value | Bigrams `password: Ni mb us44$k`. The joiner requires one character per gap. Stored value is `Ni`. |
| S15 | same full value | `decodeClientMarkup` (`:178`) `<[^>]+>` deletes `<img alt="password: Nimbus44$k">`, secret included, before extraction. Nothing is remembered. |
| S18 | same full value | The same regex consumes `<!-- password: … -->`. |
| S30 | `Use Ab,cdEF12 as given.` | `postProcessModelReply` (`index.js:1717-1720`) rewrites `;` to `,` before `guardSend`. The store holds `Ab;cdEF12`. `guardSend` on the comma form returns `clean`. |
| G14 | `Try Ab,cdEF12 today.` plus note `Sent to client.` | Owner `REPLY` calls `postProcessModelReply` then `postReply` (`index.js:3489-3490`). Same semicolon rewrite. Path `AUTH_NOTE REPLY`. |
| S32 | `Use SK-SYNTHETICKEY0123456789abcd as given.` | `keyMaterialValues` (`:290`) is case-sensitive `/\bsk-/`. `SK-` is neither stored nor matched. The lowercase echo of the same key is caught. |
| S35 | `Use SYNTHETICTOKEN0123456789 as given.` | The Bearer regex (`:293`) stores the whole `Bearer <token>` match. A later bare token is `containsSecret` false, and `keyHit` requires the `Bearer` prefix in the outbound body. |
| S36 | same bare token | `Bearer\u200B SYNTHETICTOKEN…`. `\bBearer\s+` does not treat U+200B as whitespace, and `keyMaterialValues` does not normalize. `secretsFor` is empty. |

Classes the public choke did catch, with the fixed message and no public marker: plain, ZWSP, homoglyph, combining, and fullwidth labels; split labels; leetspeak; ZWSP and homoglyph values; a normal HTML tag and a script tag; numeric and named entities; spaced Devanagari; Hindi, Urdu, Arabic, and Hinglish copulas; a short shaped token; padded and unpadded base64; canonical `sk-`; split `otp`; an RTL mark; history echo (O04); history base64 echo (G15); owner-dictated secret (G01); presend regenerate (G06, two model calls); repeated-question echo (G08, two model calls); replay (G10); deferred throw (G11); HTTP 400 (G12).

### 4. URL-safe base64 of an angle-bracket secret is held silent

S29. `extractSecrets('password: ' + base64url('<<<<????>>>>'))` remembers both the token and `<<<<????>>>>`. `guardSend` on the raw echo `Use <<<<????>>>> now` returns `clean` / `post: true`, because `decodeClientMarkup` strips `<[^>]+>` before matching, so the secret disappears.

`postReply` then runs `toHtml` (`index.js:1777-1791`), which emits `Use &lt;&lt;&lt;&lt;????&gt;&gt;&gt;&gt; now`. `guardOutboundWrite` (`:711-731`) decodes entities after the tag strip, sees the secret, wants the fixed message (`post: true` and `body` changed), and refuses the rewrite with reason `unsanitizable`. The webhook log is `IC_REQ_BLOCKED`. Public count is 0. The customer gets silence instead of the fixed message. The secret is not in the public body.

The same inequality is why a redacted note never ships (finding 5).

### 5. Redacted notes are dropped at the second choke

G04. Owner `@Arsal NOTE` whose body contains the password. First `guardSend` with `messageType: 'note'` returns `post: true`, `action: 'redact'`, body `Client password is [secret]`.

`guardOutboundWrite` calls `guardSend` again on that redacted body. `cleanToken` (`:113-114`) strips the brackets, so `extractSecrets` reads label `password` and value `secret` (the copula `is` sets `hadCopula`). `stillHas` is true. The second decision is `blocked` / `residual_secret`. `icRequest` logs `IC_REQ_BLOCKED` and returns before `writeOpStore.set`. Note count is 0. There is no public leak and no opstore plaintext. The redacted note is not delivered.

G09 (account escalate whose model body contained the password) posted the public forward sentence and dropped the teammate note the same way (`IC_REQ_BLOCKED`, note count 0). The identity-ask retry inside the helper was not observed.

### 6. Over-block of approved FAQ answers

`acceptValue` (`:190-199`) has no minimum length. An explicit separator accepts any non-stop token.

- O01. Client `pin: 5` plus "What is the daily loss limit?". Stored secret is `5`. Model answer "The daily loss limit is 5 percent." becomes the fixed message.
- O02. Client `password: reset` plus "How do I reset my password?". `reset` is not in `STOP` and is not shaped, but the colon is an explicit separator. The dashboard-reset FAQ becomes the fixed message.

O03 (a later FAQ after a high-entropy secret, with no colliding token) stayed the broker FAQ. O05 and O06 (broker FAQ and free-trial FAQ with no colliding secret) stayed on the approved sentence.

### 7. noteInbound, noteOutbound, and messagesFor

`noteInbound` (`statePresend.js:104-108`) remembers, then `redactForConversation`, then stores. `noteOutbound` (`:123-124`) is called from `gate`'s `finish` (`:236`) on the presend body, which is earlier than `postReply`'s fixed-message substitution.

Snapshot leaks (10 cases):

- S11, S37: client memory keeps the unjoined tail (`$ k`, `mb us44$k`). Bot memory keeps `Nimbus44$k` because noteOutbound stored the echo that also went public.
- S15, S18: `stripHtml` / the tag regex removes the secret from the client line. Bot memory keeps the public echo.
- S30: client line redacts `Ab;cdEF12`. Bot memory keeps the comma form `Ab,cdEF12`.
- S32: client memory keeps `SK-SYNTHETICKEY0123456789abcd`.
- S33: client memory keeps `sk-` + U+200B + the key body. The bot line's ASCII echo was redacted, and the public body was the fixed message.
- S34: client memory keeps the fullwidth `ｓｋ－` prefix plus the key body. Public body was the fixed message.
- S35: bot memory keeps the bare token from the echo. The inbound `Bearer <token>` line is redacted.
- S36: client memory keeps `Bearer` + U+200B + the token.

Post-seal `buildState(history)` (this calls the unexported `messagesFor`):

- Leaks the client text on S11 (tail `i m b u s 4 4 $ k`), S32 (full `SK-` token), S33, S34, S36, and S37 (tail `mb us44$k`). Those strings also land in `client_burst`.
- S33 and S34 also set `known_details.account_number` to `0123456789`, a digit slice of the synthetic key.
- S15 and S18 history text loses the secret before `messagesFor`, because `normalizeMessages` runs `stripHtml` first (`conversationState.js:89`).
- S30 and canonical S35 client history are redacted. S35's stored form is the mangled `Authorization Bearer [secret[secret]`. The bare token from the public echo is not in that history-only array; it is in noteOutbound.

### 8. Model user message still carries the customer secret

`buildHistory` (`index.js:2657-2677`) concatenates `stripHtml` of the client parts and is passed into the chat request (call site around `index.js:3952`). The diff redacts `OWNER_CMD_LLM_RAW` and `SKIP model` logs. It does not redact this history. 45 cases put a customer marker in the recorded OpenAI request. Console logs of those paths did not contain the marker (`SKIP model` on G05 was clean).

`noteVisionHint` (`statePresend.js:248-253`) still stores raw `stripHtml` text. No sealed case drove a vision hint, so that store was not observed with a secret.

### 9. The diff does not load in the flattened runtime layout

`index.js` require of the guard, `../10_synthetic_lanes/credential-guard-r7/credentialGuardR7` from `01_runtime`, resolves. The same relative path added to `02_statePresend/statePresend.js` and `03_luna-maintainer/collector.js` resolves from those real directories and from the symlinks used here. It does not resolve when those files are copied under `01_runtime/`, which is the layout `presendMega.js` also fails to load, for a different missing module. Do not treat the diff as a drop-in for a flattened `01_runtime` tree.

## Outbound graph that held

Observed log tags: `SPREAD_TEST_REPLY`, `AUTH_NOTE OPEN`, `AUTH_NOTE REPLY`, `AUTH_NOTE NOTE`, `ESCALATED`, `IC_REQ_BLOCKED`, `IC_REQ_ERR`, `IC_REQ_FAIL`, `IC_REQ_UNKNOWN`, `IC_REQ_REPLAY_SUPPRESSED`, `SKIP model`, `fin-wait`.

- G03 open. Payload `{ message_type: 'open', type: 'admin', admin_id: '10118526' }` with no `body`. `guardOutboundWrite` returns `no_public_body`. No customer marker in the open body, the reopen note, the log, or the opstore.
- Search. Four posts, all `https://api.intercom.io/conversations/search`, filters only: team `9629759` and `open=true`; `open=true`; team `10675195` and `open=true`; admin `8053416` and `open=true`. No `body` field and no customer text. Poller logs: `TEAMBOX_POLL ESCALATIONS`, `AUTO_CLOSE_POLL`, `TEAMBOX_POLL RISK`, `TEAMBOX_POLL JERRY`.
- G01 owner-dictated secret → fixed message. G02 owner-dictated clean FAQ → FAQ plus note `Sent to client.`
- G05 `SKIP model` log redacted. G06 presend regenerate, two model calls, public fixed message. G08 repeated-question echo, two model calls, public fixed message. G10 replay suppressed on the second webhook, one public fixed message. G11 deferred axios throw: `IC_REQ_ERR` / `request_error` and `IC_REQ_UNKNOWN`, no secret in those log lines. G12 HTTP 400: `IC_REQ_FAIL` / `response_withheld`, response body not returned.
- Opstore entries that were written are status records (`pending` / `confirmed` / `unknown` / `failed`), not the plaintext body. Blocked writes return before `writeOpStore.set`.

## Uncovered paths

- `OUTBOUND_BLOCKED` did not appear. The blocks that fired were `IC_REQ_BLOCKED` at `guardOutboundWrite`.
- `REPEATED_QUESTION_REPHRASED` did not appear. G07 held the clean duplicate (3 model calls, no public body). That hold is the pre-existing repeated-question path. G08 replaced an echo with the fixed message without that log line.
- `PRESEND_REGENERATE_FAILED` did not appear. G06 did call the model twice and posted the fixed message.
- `LUNA_TOOLS_CALL` did not appear. G13 returned a `get_state` tool call on the first model response; the route stayed silent and never posted a tool result. `client_burst` from the `buildState` probe would carry the secret if that round-trip completed before a bot reply.
- Helper identity retry (`IDENTITY_BEFORE_ESCALATE` or a second identity ask) did not appear. G09 dropped the escalate note.
- `noteVisionHint` was not fed a secret.
- Model emission of the template on a detector-false ask was observed only for N35. N36 never reached the model.
- Copy-beside-index of `statePresend` and `collector` does not load, so those files were not executed in that layout.

## Next action

Leave the diff unwired. Repair the detector and the integration, then freeze a new commit for another independent review. The repairs the failures above require:

1. Eligibility: treat `never`, sarcasm, and indirect `would you ever` as non-requests; do not let "my own account" or a Hindi definition match the direct-request rule; accept Hinglish `bhejo` and Arabic `أرسل` as direct requests.
2. Values: join split secrets across `$` and across bigrams; read HTML attributes and comments before the tag strip; match `sk-` case-insensitively and after ZWSP / fullwidth fold; store and match the Bearer token, not only the prefixed span, including U+200B.
3. Order: run the credential decision on the bytes that will be posted. The semicolon rewrite in `postProcessModelReply` currently changes the secret before `guardSend`. `toHtml` then changes it again before `guardOutboundWrite`.
4. Second choke: a note redaction and a fixed-message substitution must be able to post. Today `guardOutboundWrite` rejects any body that differs from the body it was given, and a second `extractSecrets` on `[secret]` blocks the note.
5. `acceptValue`: do not treat a one-character digit or an ordinary word after a colon as a secret that poisons later FAQ text.
6. Retention: redact `buildHistory` before the model request; make `noteInbound` / `messagesFor` / `client_burst` use the same normalized value the public choke uses; decide whether `noteVisionHint` stores raw text.
7. Requires: one layout that loads `index.js`, `statePresend`, and `collector` together, including `repeatedClientQuestion`.

Do not merge PR 25 on this evidence.
