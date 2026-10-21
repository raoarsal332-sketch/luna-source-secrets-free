# Independent review: fixed-message handoff R6

Verdict: **BLOCKED**

Reviewer role: independent. This report does not use the author's tests or `FM_R6_REPORT.md` as a case source. That file was hashed for identity only.

No merge, approval, deploy, or Intercom action was taken. The run used no network, no production host, no VPS, no live Intercom, and no customer data. Tokens and secrets in the harness are synthetic.

## Frozen identity

| Item | Expected | Observed |
| --- | --- | --- |
| Branch | `cursor/fixed-message-handoff-r6-8ad1` | Worktree detached at the commit below |
| Commit | `08775b56d3752a0ac03e865e33c91f52ef176043` | `08775b56d3752a0ac03e865e33c91f52ef176043` (`Freeze fixed-message handoff R6 for independent review.`) |
| Candidate PR | Draft PR #36 | Reviewed as the frozen tree; this review does not modify it |

sha256, verified on the frozen tree before `handleWebhook` was loaded, and again on the modules Node actually loaded:

| File | sha256 | Match |
| --- | --- | --- |
| `luna-current/01_runtime/fixedMessageHandoff.js` | `e7cc1a81387a69859ad5636b9b0c5520a47c4125c0b7510001dee4f09e5fa678` | yes |
| `luna-current/01_runtime/index.js` | `f48ebb3aee624679223dbb19087263b2134bdc89bd1e0a3701d2ec5d44b92347` | yes |
| `luna-current/02_statePresend/credentialSanitizer.js` | `2c6353936fdec3e990f6fa1eb7ca70134110c9ad6ef8061825839f358f4fe781` | yes |
| `luna-current/02_statePresend/targetedRegeneration.js` | `38fa4e2a56c23b96d3559e22f7135f5e69ecfc1e9cbafb157a92c46d672461b9` | yes |
| `luna-current/02_statePresend/statePresend.js` | `0e3b8675e00856eca158748711683471e3820d43a9e5c0ff626a14dc84a90764` | yes |
| `luna-current/01_runtime/softEdges.js` | `22f8b555a71bb81f6936997a57c85481b5c351b9446c0f30f7f178c93d5071e0` | yes |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r6/FM_R6_REPORT.md` | `6a6ec34c5593130a0d2a2acc4427903f4d2deceb65b37ee5d0c554f0182b11be` | yes |

Loaded-module hashes for the six runtime files matched the table. `FM_R6_REPORT.md` was not loaded.

## Method

The harness calls the real exported `handleWebhook` from `luna-current/01_runtime/index.js` (`require.main !== module`, so the server and pollers stay down). `__setTestDoubles` was not used. Axios is an in-process recording transport. The model is a stub. `express` and `dotenv` are mocked. `net.Socket.connect`, `dns.lookup`, and `fetch` are tripwired.

Tripwire count on the scored run: **0**.

Control state, ticket state, and the write-op store live under `/tmp/r6-review-sandbox`. The FAQ path points at the frozen local markdown. Presend mode is `enforce`. Webhook signature mode is off. Tools are enabled; the stub returns no tool calls.

`index.js` requires `./statePresend/statePresend`, which is absent from the frozen git tree, while presend modules require siblings as if `02_statePresend` sat beside `01_runtime`. The harness added a symlink `01_runtime/statePresend` → `02_statePresend` and a `Module._resolveFilename` fallback for `../` imports that are not `../01_runtime`. That symlink is untracked in the frozen worktree and is not part of this review commit. It is a layout hazard for a checkout that has no such link. It is not one of the scored product failures.

Each case sees only the writes, prompts, and logs recorded after it starts. An earlier run scanned the global accumulators and is discarded. The case-definition seal did not change.

Case-definition seal (ids, titles, steps, expects): `97c54669757605eeeb9d88194067606b2e16f2366fb7a9b91a5067b0a0dfdde5`

Scored cases: **155**. Raw checker: **110 pass / 45 fail**.

## How to read the counts

The raw checker over-counts. Seven of the 45 fails are harness mistakes and are removed from the product totals. The remaining 38 are product failures. Thirteen of those 38 are critical.

| Bucket | Count |
| --- | --- |
| Scored cases | 155 |
| Raw checker pass / fail | 110 / 45 |
| Harness mistakes inside the 45 | 7 |
| Product passes | 110 |
| Product failures | 38 |
| Critical product failures | 13 |
| Non-critical product failures | 25 |
| Confirmed duplicate customer lines | 0 |
| Unauthorized template deliveries | 0 |
| Network tripwire | 0 |

Critical classes below: credential leak, unauthorized template, ownership bypass, false or premature handoff promise, duplicate.

## Denominators

| Property | Cases | Product held | Product failed | Harness-invalid | Critical |
| --- | --- | --- | --- | --- | --- |
| (a) promise only after note and assignment; exactly once | 33 | 28 scored passes + 4 harness cases that still posted one line | 1 | 4 | 1 premature promise |
| (b) human-owned or human-replied stays silent | 23 | 21 | 2 | 0 | 2 ownership bypasses |
| (c) account-number fact line, no re-ask, emptied draft escalates | 25 | 14 scored + emptied-draft (harness-tagged) | 9 | 2 | 0 |
| (d) live-agent fixed line; identity answered, not handed off | 26 | 17 | 9 | 0 | 0 |
| (e) unsupported numbers regenerate or hedge | 6 | 4 | 2 | 0 | 1 false promise |
| (f) locked spread reply only when appropriate; other secrets redacted | 39 | 24 | 14 | 1 | 4 leaks + 5 false promises |
| Regression probes | 3 | 2 | 1 | 0 | 0 |

Property (a) observable exactly-once holds on 32 of 33 cases. The four harness-invalid lost-store cases each posted one fixed line and did not post a second.

## Critical product failures

### 1. Ownership bypass on account-number questions (property b) — 2

`B-assignee-account` and `B-replied-account`.

A human assignee, and a thread a human had already answered in public, both received a public reply: "For MT5, the account number is in the email that was sent with the trading login. Those details cannot be changed." The account-question exemption runs before the ownership silence.

Every other ownership text stayed silent, with no public reply: hello, live agent, status, identity, spread, Urdu live agent, Italian live agent, admin body with an empty `part_type`, `author.type` teammate, risk team, escalations team, ambiguous assignee, stale assignment, and a later Urdu live-agent ask after an Urdu human reply. Ownership bypasses outside the account-question exemption: **0**.

### 2. Premature fixed line after a partial note (property a) — 1

`H-partial-note-lost-ticket`.

The note returned HTTP 200 with an id and an errors payload. The first turn withheld (`FIXED_HANDOFF withheld note_partial`) and posted nothing public. The transport stored that write as confirmed. After the ticket store was wiped, the replay logged `IC_REQ_REPLAY_SUPPRESSED NOTE ... confirmed`, then assigned and posted "A teammate now has this conversation." (`FIXED_HANDOFF sent welcome`). One public line. The line was sent without a clean note success.

The checker's `duplicate_fixed` tag on this case is noise: there is one line.

### 3. Spurious handoff when an unsupported number survives regeneration (property e) — 1

`E-hold-regen-still-bad`.

The customer asked the minimum holding time. The draft said 99 minutes. Regeneration said 47 minutes. Presend logged `codes=UNSUPPORTED_NUMBER final=needs-escalate`. The webhook then wrote a note, assigned, and posted the English fixed line (`FIXED_HANDOFF sent missed_escalation`). The required outcome is a regenerated or hedged answer.

Held on this property: a 99-minute draft regenerated to 3 minutes and was not handed off; a status ping with a bad number hedged; a correct 3-minute draft was sent; an unsupported profit-split draft regenerated.

### 4. Wrong-topic and tampered spread drafts become a handoff promise (property f) — 5

`F-echo-exact`, `F-tamper-password`, `F-tamper-account`, `F-tamper-space`, `F-tamper-zw`.

Customer text: "where is my payout?". The stub returned the locked spread template or a near-miss (tampered password, tampered account number, extra space after the password label, zero-width inside the password). Presend logged `WRONG_TOPIC,MISSED_QUESTION final=needs-escalate`. The public body was the English fixed line after a successful note and assignment. The template, including its password, was not delivered. Unauthorized template sends in these five cases: **0**. One public line each; the `duplicate_fixed` tags are checker noise.

This is one mechanism: a draft that does not answer the customer is escalated into the fixed handoff promise. The customer did not ask for an agent.

### 5. Credential leaks, synthetic canaries only (property f) — 4 scored, plus one direct sanitizer finding

Scored customer-visible leaks (public comment contained the canary; evidence in `results.json` stores `[canary]`):

| Case | What reached the customer | Also in the user prompt |
| --- | --- | --- |
| `F-cred-symbol` | `SynthPwSymbol91` from `Password: SynthPwSymbol91?a!` echoed by the stub | no |
| `F-cred-zw-label` | `SynthPwZw91` behind a password label with U+200B inside the word | no |
| `F-cred-spaced-label` | `SynthPwSpaced91` behind `p a s s w o r d :` | yes |
| `F-cred-zw-value` | unlabeled echo `SynthPwInside91` after the labeled value `Syn` + U+200B + `thPwInside91` was redacted | no |

A direct call to the frozen `sanitizeCredentials` (same file hash) shows the same boundaries:

- `password: SynthPwSymbol91?a!` → `password: [secret]` in isolation. The webhook leak is the unlabeled echo. The labeled form is remembered in a way that does not catch that echo.
- `pass` + U+200B + `word: SynthPwZw91` → `pass[secret]`. The value still reached the webhook reply.
- `p a s s w o r d : SynthPwSpaced91` is unchanged.
- `password: Syn` + U+200B + `thPwInside91` → `password: [secret]`. The copy without the zero-width character is not remembered.
- `password: S y n t h S p a c e 9 1` → `password: [secret] p a c e 9 1`. The six-token cap leaves a tail.

`F-cred-spaced-value` is a harness mistake in the scored tally. The checker injected the collapsed token `SynthSpace91` into the stub body via `extraScan`. That token's appearance is not an independent product leak. The tail `p a c e 9 1` is a product partial leak of the spaced value, confirmed on the frozen sanitizer, and it is counted here as that direct finding rather than as the injected canary.

Redaction that held on the webhook path: labeled password, apostrophe, curly apostrophe, braces, bold tags, HTML-entity colon, Urdu / Hindi / Arabic labels, `sk-`, Bearer, OTP, API key, a repeated base64 token, a token-labeled base64 string, a later unlabeled echo of a secret previously seen behind a label, and a password inside an English live-agent note. A single unlabeled base64 string was not isolated: `F-cred-b64-once` passed because the word `token` is a label.

The static system prompt in the frozen tree contains the locked spread template. Every model call's system role therefore includes it. The leak scan for this review is the user-role prompt, the public reply, notes, and logs. The locked password is not copied into this report.

## Non-critical product failures

### Locked spread reply is not byte-exact on the first customer message (property f) — 4

`F-spread-what`, `F-spread-check`, `F-spread-test`, `F-spread-mt5`.

The customer plain, with the password already replaced before it was stored in the evidence file, was:

```
Hello Synthetic,

TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server

Platform: MetaTrader 5
Server: Fundedelite-Server
Account Number: 55188
Password: [secret] account to check spreads.
```

`postClientCommentOnce` prepends the first-reply welcome before the second credential pass. The welcome breaks the exact-template allowlist, the password is replaced, and the words "Use this" are consumed. `F-spread-after-bot` passed: a prior Arsal comment skips the welcome and the locked reply is byte-exact. This is over-redaction of an appropriate template, not an unauthorized template send.

Near-miss templates were not delivered as templates. See critical item 4 for the handoff those drafts produced.

Non-spread asks did not receive the template: login trouble, a forgotten password, a negated spread ask, "spreadsheet", account 55188 without a spread ask, and a trade-history complaint.

### Unsupported drawdown percent was shipped (property e) — 1

`E-drawdown`. The stub said "The maximum daily drawdown is 14%." Presend did not flag `UNSUPPORTED_NUMBER`. The customer received "Hello Synthetic, The maximum daily drawdown is 14%." No hedge and no handoff.

### Account-number language gaps (property c) — 9

Answered with the English fact line: Spanish, French, German, Dutch (`C-acct-es`, `C-acct-fr`, `C-acct-de`, `C-acct-nl`).

Portuguese `Qual é o número da conta?` was answered with the Italian fact line (`C-acct-pt`). The Latin marker `qual` selects Italian.

Not recognized as account questions, so the stub's default holding-time draft ran and presend escalated `MISSED_QUESTION` into the English fixed line: Polish, Turkish, Russian, Indonesian (`C-acct-pl`, `C-acct-tr`, `C-acct-ru`, `C-acct-id`). The off-topic draft is the harness default. The product failure counted here is the missed detection. These four handoffs are not counted again as critical false promises.

Held: English (including `conversation.user.created` before the Fin wait, "where", "can you tell me", and bare "account number"), Roman Urdu, Hinglish, Urdu script on a fresh ticket, Hindi, Arabic, Italian, a second ask that does not re-ask the customer for the number, and an account question after Elite has spoken. "my account number is 189143" was not treated as an account-number question and was not handed off. `C-emptied-assign-fail` withheld the promise when assignment returned 500.

### Live-agent detection gaps (property d) — 9

`H-fresh-created-en`: a live-agent request on `conversation.user.created` logged `SKIP fin-wait user.created`. No note, no assignment, no public reply. Account-number questions and identity questions on that topic are answered before the Fin wait. The live-agent path is not.

Unrecognized, so the stub's "3 minutes" sentence was sent with a greeting: French, German, Dutch, Turkish, Polish, Russian, Chinese, Japanese (`D-live-fr`, `D-live-de`, `D-live-nl`, `D-live-tr`, `D-live-pl`, `D-live-ru`, `D-live-zh`, `D-live-ja`). The sentence is the stub. The product failure is that the fixed line was not selected. The harness expected the English fixed line for those languages.

Held: English "live agent", "manager please", "connect me to a supervisor", "I need a real person"; Urdu, Arabic, Hindi, and Italian fixed lines on the property (a) success cases; Hinglish `mujhe live agent chahiye` (Urdu line); `mujhe agent se baat karni hai`; `bhai mujhe real person chahiye`; Spanish and Portuguese. Italian after Elite has spoken gets the Italian line. A payout complaint that also asks for a live agent hands off once.

Identity, all answered and not handed off (9/9): "are you a bot or a real person?" including fresh `conversation.user.created`, "are you an AI?", "are you a real person?", "bot or human?", "kya aap bot ho?", "kya aap insaan ho?", Italian, Urdu script, and "are you a bot or a real person? please connect me to a human".

### Mixed Urdu live-agent text plus a password (property f) — 1

`F-cred-urdu-note`. "مجھے ایجنٹ چاہیے password: SynthUrduNote91" was not handed off. The Latin password clause flipped detection. The canary was redacted. The customer received an Urdu greeting plus the stub's holding-time sentence. Missed handoff, no leak.

### Empty model body goes silent (regression) — 1

`R-empty-model`. An empty `ACTION` body on "What is the minimum holding time?" logged `SKIP empty reply body`. No note and no public reply. Over-block. A greeting and a short thanks were not handed off.

`C-emptied-draft` is the emptied-draft requirement and it held: one fixed line after note and assignment (`FIXED_HANDOFF sent presend_escalate`). The checker tagged it `duplicate_fixed` because the emptied-draft mode uses a fixed-line cap of 0. That tag is a harness mistake.

## Harness mistakes (not product failures)

| Case | What the checker said | What the run showed |
| --- | --- | --- |
| `H-lost-ticket-parts-have-line`, `H-lost-both-parts-remember`, `H-order-urdu-replay` | `awaiting_not_set` | One note, one assignment, one fixed line. Replay logged `SKIP teammate-handoff human_assignee` because the recording transport had set the assignee to the synthetic teammate. The awaiting flag was gone because the harness wiped the ticket file. No second line. |
| `H-lost-and-stale` | `awaiting_not_set` | Same single line. The stale snapshot was taken after step 1 had already written the assignment and the line, so the case does not prove an all-records-gone duplicate. No second line. |
| `C-emptied-draft` | `duplicate_fixed` | One correct escalation. Cap bug in the emptied mode. |
| `C-recovery-account` | `missing_fact_en` | The follow-up user part was stamped earlier than the internal note from the failed assignment, so the note looked newer and the runtime logged `SKIP pre-send already-replied` after the account-question exemption. Invalid ordering. Residual observation, not scored: `arsalAlreadyRepliedAfter` does not ignore notes. |
| `F-cred-spaced-value` | `leak:comment:SynthSpace91` | The collapsed canary was placed in the stub body by the harness. See the direct sanitizer tail above. |

The discarded first run (global write accumulator, 154 false fails) is not in these totals.

## What property (a) held

Successful note, then assignment, then one fixed line: English, Urdu, Arabic, Hindi, Italian, and Hinglish (Urdu line). Withhold, with no public fixed line, on note and assignment 500, timeout, 422, partial, and malformed, and on message 500 and timeout. A 422 note can be retried and then completes once. A 500 note stays withheld on replay. Parallel in-flight posts one line. Replay after success posts one line. A second customer turn posts one line. Assignment timeout followed by a stale replay stays withheld. Message timeout-after-accept is not duplicated.

## Verdict

**BLOCKED.**

The candidate posts the account-number fact line on human-owned and human-replied conversations, posts the fixed line after a partial note once the ticket store is gone, hands the customer the fixed line when an unsupported holding-time figure survives regeneration, and turns a wrong-topic or tampered spread draft into that same promise. Synthetic secrets with a zero-width label, a spaced label, a symbol-ended password echo, and a zero-width-normalized echo reach the public reply; the spaced label also reaches the user prompt. The locked spread reply is byte-exact only after the bot has already spoken; the first customer message gets a welcome prefix, a redacted password, and a damaged last sentence.

Duplicates of the fixed line were not observed. No tampered template was delivered as the customer body. Those two results do not offset the critical set.
