# Independent review — credential guard R6

Verdict: **NEEDS CHANGES**

This review did not merge, approve, activate, or deploy. The integration diff was applied only in a scratch tree and exercised with synthetic fixtures. No production, VPS, Intercom, customer data, or live secrets were used.

Reviewer is not the author and did not use the author's 28 tests as evidence.

## Artifact identities

| Artifact | Identity |
|---|---|
| PR | https://github.com/raoarsal332-sketch/luna-source-secrets-free/pull/18 |
| Branch | `cursor/credential-guard-r6-c90d` |
| Frozen commit | `d87a673a056c79ece9866e44765136b752621496` |
| `CRED_R6_MANIFEST.sha256` | `0f624bba821f058ed12f89b5e24c72a4792bad08cf4486748011d1b484ad976a` |
| `credentialGuardR6.js` | `72461d23b878bca818f74d866ae983921d2979200400b49465958913447a62a1` |
| `credentialGuardR6.test.js` | `cac5784db707bad15c491f19eab6e850d9dc5b4ac2472e0596e164ed4192fb61` |
| `proposed-integration.diff` | `d7cfd65282ea385f31b6af3e89ffb363f273e790850d81b6ff96d1032d05d191` |
| `CRED_R6_REPORT.md` | `6b76578b116281ac72baa667d338054e26ce8c0846c709280d662721d77cfd7a` |
| This review source | `88e8b6df9d34484afb1c1a75d3feb9bb175b850f187a29b194f589c9e2b32805` |

`sha256sum -c` of the manifest against the frozen blobs passed. The manifest's own digest matches the table above. The diff dry-run and the scratch apply both succeeded. The scratch runtime requires the guard; the repository runtime on this review branch does not.

## How it was run

Scratch copy of `luna-current`, frozen lane files extracted from the commit, `proposed-integration.diff` applied, then the real `handleWebhook`, `postReply`, and `postClientCommentOnce` loaded from the patched `index.js`. Axios and the model client were replaced with an in-process recording transport before load. Every public reply body, note body, console log, ticket-state file, opstore file, maintainer store, trace file, and presend memory snapshot was scanned for the fixture secrets and for the spread-test template password.

## Case counts

144 sealed cases. 113 matched the sealed expectation. 31 did not.

One of those 31 (`pay-ordinary`) is a harness case-fold mismatch: the public reply was an ordinary payout sentence and contained no fixture secret and no template password. It is not a product defect. Product failures: **30**.

| Class | Cases | Product failures |
|---|---:|---:|
| 55188 negatives (spread some light, problem spread, risk spread, ordinary spread, payout) | 22 | 0 |
| 55188 direct requests with a prior public reply | 17 plain/HTML | 0 for plain and `<p>` text |
| 55188 direct requests, first contact | 7 | 7 template not delivered |
| 55188 non-requests that still match the regex | 12 | 11 exact template sent |
| `&nbsp;` direct request; template passed only via `clientTexts` | 2 | 2 template dropped |
| Credential echoes (ZWSP, homoglyph, combining, fullwidth, spaced ASCII labels, leetspeak, pwd/passwd, short tokens, Hinglish, Urdu, Arabic, compact Hindi, padded and double base64, dictated and history echoes) |  | 0 |
| Character-split, unpadded base64, HTML history, numeric entity, spaced Hindi, introduced `sk-` token |  | public writes leaked |
| Approved FAQ / review-status replies, including after a history secret | 5 | 0 |
| Over-block controls (`Hunt99`, `testing` vs `test`, password reset, pass the challenge, account number, embedded token) | 6 | 0 |
| Skip-model log, owner-command log, thrown transport error, HTTP 400 body, opstore block, note redact, noteInbound, observe |  | split-label skip log leaked; the others held |

Pass condition was zero credential leaks in outbound payloads or logs/diagnostics, zero unauthorized 55188 activations, and no new approved-safe regressions. That condition is not met.

## Critical findings

### 1. Unauthorized 55188 template sends

`isExplicitSpreadTestRequest` in `credentialGuardR6.js` (lines 364–383) treats any `check|test|testing` plus `spread(s)`, and any `spread test`, as eligible. With a prior public reply, so the welcome prefix is not applied, the webhook posts the exact spread-test template, including the template password.

Confirmed public writes (`kinds=template`) for:

- `I check the spreads every morning`
- `I was testing spreads yesterday`
- `no need to check the spreads`
- `cannot check the spreads`
- `I don't want you to check the spreads`
- `please check the spread sheet`
- `what is a spread test`
- `the spread test failed yesterday`
- `I already test the spreads myself`
- `can you explain what people mean when they check the spreads`
- `please check the spread of this rumor`

The required negatives did not fire: `spread some light`, `problem spread`, `risk spread`, ordinary spread questions, and payout questions (22/22). `please check the spreadsheet` also did not fire. A caller flag cannot widen eligibility; that part holds.

### 2. A direct first-contact request does not receive the exact template

The spread branch (`index.js` 3818–3820 in the applied scratch) calls `postClientCommentOnce` with the exact template. `ensureFirstReplyWelcomeIntro` (call at line 2936) runs before `postReply`. On a first public reply it prefixes a greeting, so the body is no longer the exact template. The choke then sees the template password outside an exact body and replaces the send with the fixed security message.

All 7 first-contact direct requests, including Hindi, Urdu, Arabic, Hinglish `spread check karo`, wrapped `<p>`, and `&nbsp;`, posted that fixed message and not the template. The password did not leak on this path. The approved template was not delivered.

The same direct phrases do deliver the exact template when a prior Arsal public reply already exists, including fullwidth, ZWSP inside `spreads`, a Cyrillic `с` in `check`, and `<p>please check the spreads</p>`.

### 3. `&nbsp;` and the second guard drop a real direct request

`eligible-nbsp-prior`: the stripped text is a direct check, but `rememberClientParts` stores the raw part body (`credentialGuardR6.js` 282–288). `lastAsk` becomes `please check the&nbsp;spreads`, eligibility fails, and nothing is posted.

`direct-template-without-remember`: `postReply` allows the exact template from `clientTexts`, then `guardOutboundWrite` (`index.js` 109, guard lines 570–587) checks again without those texts and without a stored ask. The write is blocked (`IC_REQ_BLOCKED`). No password is sent, and the template is not sent.

### 4. Public credential leaks the choke does not catch

Confirmed on the real owner-note webhook (`conversation.admin.noted` → `processAuthorizedNoteCommands` → `postReply`) unless noted:

| Case | What was posted | Where |
|---|---|---|
| `own-split-capture` | Joined secret after a character-split label and value | public comment |
| `own-split-echo` | Character-split echo of a captured secret | public comment |
| `own-b64-unpadded` | Base64 echo with padding removed | public comment |
| `own-html` | Bare echo; history body was `<p>…password…</p>` | public comment |
| `own-html-entity` | Bare echo; history value used a numeric character reference | public comment |
| `hindi-spaced` | Bare echo after `पास वर्ड` | public comment |
| `own-sk` | Introduced `sk-` token with no password label | public comment |
| `presend-regenerate` | Regenerated model reply containing the secret | public comment and presend memory |
| `skip-split` | Character-split client secret | `SKIP model` log, no public post |
| `model-webhook-echo` | Public body was the fixed message; presend memory kept the bare echo | memory |

Causes, in the frozen guard:

- `containsSecret` (lines 232–248) compares whitespace-separated tokens only. It does not rejoin a character-split value. `collapseSplitLabels` rejoins labels, not values.
- `tryBase64` (line 137) rejects a token whose length is not a multiple of 4, so an unpadded echo is invisible. Padded and double-encoded base64 were caught.
- `rememberClientParts` reads `part.body` with tags and without decoding numeric entities. `stripHtml` is not applied. A later bare echo does not match the HTML-wrapped token.
- `decide` (line 502) does not apply the `sk-` / `Bearer` replacements. Those replacements live only in `redactText` (line 401), which notes and log helpers use. A public comment that introduces an `sk-` token is allowed.
- Spaced Devanagari `पास वर्ड` is not in the label list. Compact Hindi, Urdu, Arabic, and `mera password hai` were caught.

`noteOutbound` in the patched `statePresend.js` (line 124) calls `redactText` with no conversation secret list. A bare echo with no label is stored in presend memory even when the later public choke replaces the send. That is the `model-webhook-echo` result: public body was the fixed message, memory still held the fixture.

The `SKIP model` log (`index.js` 4061) is redacted from `secretsFor`. A character-split client message never enters that set, so the joined secret is logged.

### 5. Approved FAQ behavior that held

These posted the approved text and did not contain the fixture secret or the template password:

- Direct `postReply` of the escalate status line, with a history secret present.
- The second status-bank line, with a `pwd:` history secret.
- Webhook `how will I know when the review is done`, alone and after a plain or HTML history secret.
- Over-block controls: `Hunt99` was not treated as `Hunt9`, `testing` was not treated as `test`, `password reset` and `pass the challenge` were not captured, and account number `219876` was preserved.

Labeled owner logs (`OWNER_CMD_LLM_RAW`), a thrown transport error whose message contained the fixture, and an HTTP 400 response body containing the fixture stayed out of the logs. A dirty opstore write was not posted and the opstore file did not contain the fixture. Internal notes were redacted. `noteInbound` memory for `mera password hai` was redacted. Maintainer `observe` did not retain that labeled client text.

## Uncovered paths

- Helper retry inside `postClientCommentOnceInner` (`index.js` 2947, the `The client repeated this question` model call). Identical public text is dropped by the earlier identical-body dedupe, so this run never reached the model call. A near-copy rephrase was not executed.
- Repeated-question retry (`index.js` 4488). The marker was not observed. The case did not leak, and it also did not prove the retry output is guarded.
- `openConversation` uses `axios.post` directly (`index.js` 3209) and does not go through `icRequest` / `guardOutboundWrite`.
- Conversation search uses `axios.post` directly (`index.js` 4767, 4895, 4929). Those bodies are search filters, not client replies; they were not credential-bearing in this run.
- `messagesFor` (`statePresend.js` 148) still calls the old `sanitizeCredentials` on the latest user body. The diff does not route that copy through R6. This run did not show that string in a log file.
- Replay suppression was not isolated. The clean double `postReply` of the FAQ did not leak; the `IC_REQ_REPLAY_SUPPRESSED` tag was not in the retained tag sample.

Every `postReply` and `postClientCommentOnce` call site in the patched `index.js` funnels into the choke at `postReply` (line 2751). The leaks above are bodies that the choke allowed, or text written before that choke (welcome mutation, presend memory, skip log).

## Next action

Do not merge PR 18. Do not apply `proposed-integration.diff` to the runtime. Do not activate or deploy.

The author should fix, in a new candidate:

1. Eligibility so only a direct request to check or test spreads matches, including the non-requests listed above, and so a direct request still matches after HTML and `&nbsp;`.
2. Exact-template delivery on first contact. The welcome prefix must not destroy the exact body before the choke, and the second `guardOutboundWrite` check must see the same eligibility as the first.
3. Detection of character-split values, unpadded base64, HTML part bodies, numeric entities, and spaced Hindi labels, before any public post or `SKIP model` / owner log.
4. Public-comment coverage for `sk-` tokens, not only `redactText`.
5. `noteOutbound` / presend memory must redact secrets already remembered for the conversation.

A different reviewer should rerun a sealed webhook suite against the new frozen commit. This review is not an approval.
