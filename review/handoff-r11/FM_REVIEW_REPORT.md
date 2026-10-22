# Independent review: Fixed-Message Handoff R11

Verdict: **FAIL**

Frozen candidate `1a5c35f754d5d5e80336a24b7371676e52ce9bf6` (PR #67, `cursor/fixed-message-handoff-r11-8ad1`). Baseline `main` is `e999d3c8caf327bf9a102e5ba562d9c114a92109`. R10 is `c4553a93f20751b84ebdca5fb21cc7703af84a03`.

| Gate | Result |
| --- | --- |
| Product-critical failures | 6 |
| Credential leaks on the recorded wire | 0 |
| Candidate-only regressions | 0 |
| Unjustified corpus diffs | 0 |
| Recovery failures | 2 |
| Network tripwire hits | 0 |

PASS required every gate at zero. The candidate fails the product-critical gate and the recovery gate.

## What was run

Synthetic only. No production host, no VPS, no live Intercom, no secrets. The runner calls the real `handleWebhook`. Axios is a recording transport that stores the exact request body bytes. The model is a scripted stub. Sockets, DNS, HTTP, fetch, and child processes are tripwired inside that runner.

The sealed set was hashed and committed in `7cd48d46fc8bf9ea8315716b8e296836ef57e444` before any sealed execution.

| File | SHA-256 |
| --- | --- |
| `sealed/cases.json` | `60bfd601725cfcba94223460a683d6715c137c3cbda303852ee8092c6235aea3` |
| `harness/evaluate.js` | `c9b2f6bec5e6c8528a779cccee51ca30e82d6da06e39d0ca833db51333205d83` |
| `harness/generate-cases.js` | `778cd295e97afcf92b7e80155947995e891c8639c7b504f329d8468448c38e2e` |
| `harness/worker.js` | `b5c3f88f4ac082a9657ca0b7626c0431abbe12e230a0fc8692d563364a7388bf` |

Counts: 366 cases. Review 242. Recovery 14. Corpus 110.

Review result: 231 pass, 11 fail. Recovery result: 12 pass, 2 fail.

## Frozen report and file hashes

`luna-current/10_synthetic_lanes/fixed-message-handoff-r11/FM_R11_REPORT.md` content SHA-256 is `1f2054638d4f7ee9005cf2f7a90cd42b96afbd5028c9f26a2876de81a0da6780`.

All 10 hashes listed in that report match the bytes at `1a5c35f`:

| File | SHA-256 | Check |
| --- | --- | --- |
| `01_runtime/fixedMessageHandoff.js` | `8589b87da32ad17ce30e34fd2da05f504af72e3da129b4b094cb3b5926b1f4be` | match |
| `01_runtime/index.js` | `240b2d893fb649fd27387b93b5a90c93c891dda935da8f7099f6c064602abbad` | match |
| `01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` | match |
| `01_runtime/writeOpStore.js` | `bf454d7b4b1003aa95862f062d8dcd4e409845779f1a85e87ec5446664190f44` | match |
| `01_runtime/challengeVariantGuard.js` | `0d6fff5f5330091c4f8ca02f5ae189845b386922c944d8a7b152970cdc43d12d` | match |
| `01_runtime/teammateHandoffGates.js` | `96eaf4ce75a0eb888cdabb5552a7e90996cdde2278721a8958e7991032e4ca2b` | match |
| `02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` | match |
| `02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` | match |
| R11 lane test | `9ab07da887cac9b55ea73b030906176fbda6b905c3845eee776c95aac9a65ca3` | match |
| R10 lane test | `090696eb1588731f705a5d6561dfe21b103301cd72473f7c3b755477e518396c` | match |

Runtime difference from R10 is exactly five files: `escalateRelatedOnly.js`, `fixedMessageHandoff.js`, `index.js`, `writeOpStore.js`, `targetedRegeneration.js`.

## Part A — review failures

### Product-critical

1. `lang-handoff-ur-2`. Customer text `براہ مہربانی مجھے نمائندے سے جوڑو`. The Urdu role token is `نمائندہ`. The oblique `نمائندے` does not match, so this is not treated as a handoff. The public reply is the ungrounded FAQ stub with an Arabic greeting. No note, no assignment, no fixed line.

2. `write-assign-errors`. A 200 assignment body `{type:'error.list', id:'e1', errors:[...]}` is stored as a confirmed assignment to seat `900001`. `isValidWriteSuccess` returns true whenever `data.id` is set, and it does that before any error-list check. The recording transport did not apply the seat. The public line was withheld (`assign_partial`), but the op record now says the assignment is confirmed, so a later delivery will skip it.

3. `write-retry-wrong-assignee`. The first assignment returns 200 naming admin `900009`. The op record is correctly `failed` / `wrong-assignee`, and no public line is sent. `classifyAssignment` then returns reason `partial` because `result.ok !== true`, before the wrong-assignee resource check. `partial` is an ambiguous write, so the ticket sets `assignAmbiguous`. The second delivery logs `assign_ambiguous_held` and still sends no fixed line. A definite wrong-assignee miss is not retried.

4. `write-retry-assign-errors`. Same 200 error-list body as (2). The op record is confirmed on the first turn. The second delivery does not post the fixed line.

5. `rec-remove-note`. First turn assigns seat `900001` and the customer comment returns 422, so the fixed line is correctly withheld. After restart the note is gone and the assignment part remains. The note write is replay-suppressed as already confirmed. The engine then logs `note_partial` and `lost-state completion` and sends no public line. The handoff is lost.

6. `rec-op-unverified`. The op record says seat `900001` was confirmed, but the conversation assignee is still the bot `10118526`. The customer text is `any update?`, not a new live-agent ask. The engine assigns `900001`, posts `A teammate now has this conversation.`, and logs `sent recovery` plus `lost-state completion`. An unverified prior assignment is resumed instead of held.

### Defect

`lang-account-ar`. The Arabic account fact is sent, but the last word is not the approved constant. The source has shadda then fatha (`U+0651 U+064E` in `تُغيَّر`). The posted line has fatha then shadda (`U+064E U+0651`). The approved line is therefore not contained in the public body.

### Over-block

All six clarification cases (`clarify-0`, `clarify-1`, `clarify-2`, and the three leverage FAQ variants) send nothing. The drafts are `Please tell me which challenge you mean.`, `Which challenge do you mean?`, and `Which challenge you mean for this rule?`. `runWithRegeneration` short-circuits those drafts with `results: []`. `statePresend.gate` then reads `out.results[0].ok`, throws, and the catch holds the send: `gate error (fail-closed, holding send): Cannot read properties of undefined (reading 'ok')`. A legitimate challenge clarifier becomes silence.

### Checks that held

- Human-owned, reopened, closed, Jerry-assigned, Risk, Escalations, paused, aiOff, Fin-owned, and fresh `user.created` stays silent. A fresh live-agent `user.created` and a fresh spread `user.created` are not held for Fin.
- Owner-spoof notes from user, lead, contact, and bot authors carrying the owner id, name, or email do not set `aiOff` and do not post the dictated client line. A real admin owner `@Arsal STOP` sets `aiOff` and does not post publicly.
- English, Urdu, Hindi, Arabic, Hinglish, and Roman Urdu handoff lines match the frozen constants, except the oblique Urdu case above. Account lines match except the Arabic diacritic order.
- `Is news trading allowed?`, `How long do payouts take?`, and the other FAQ asks that contain news, update, status, or waiting stay on the answer path. With no pending case, `any update?` and `status` get the status clarifier. While a teammate is awaited, those pings get the hashed status-hold sentence. `I am still waiting on my payout` during a human-handoff wait is answered, because it is not the escalated problem.
- Empty model bodies on a clear FAQ still produce a public answer and do not hand off. Team-review drafts become the approved number hedge.
- Canaries `S3cretValue99`, `Hunter22!`, and `QbgCanary88` are absent from every recorded request body. Ordinary words back, please, status, update, waiting, news, team, and review survive in the public reply.
- A single-turn wrong assignee, data null, 422, 500, and timeout do not post the fixed line. 429 is retried inside the request and then posts one line after a verified assignment. A duplicate delivery and a restart after a completed handoff do not post a second fixed line.

## Part B — regression

Candidate-only means the check fails on R11 and passes on both `main` and R10. That count is **0**.

Author lane tests, run as black boxes with the network left to each file's own stubs:

| Suite | main | R10 | R11 |
| --- | --- | --- | --- |
| fixed-message-handoff-r2 through r9 | not present | pass | pass |
| fixed-message-handoff-r10 | not present | pass | pass |
| fixed-message-handoff-r11 | not present | not present | pass |
| Repair suite | pass | fail | fail |
| failfix identity | pass | pass | pass |
| failfix retrieval | fail | fail | fail |
| failfix variant | pass | pass | pass |
| Maintainer | fail | fail | fail |

The repair suite fails on R10 and R11 for the same two selftests, both of which pass on main:

- `selftest-identity-before-escalate.js` looks for the old string `I've forwarded this to a teammate` after `IDENTITY_BEFORE_ESCALATE asked missing`. R10 replaced that sentence with the fixed line.
- `selftest-lock-harden.js` looks for `postProcessModelReply(lockedFinHandoffWelcome`. That call is not in the R10 or R11 source.

Failfix retrieval fails with the same nine article-routing assertions on all three trees. The maintainer suite fails with the same sandbox path and empty case-pack errors on all three trees (`teammateHandoffGates.js` is under `01_runtime/`, and the golden pack is absent). Those failures are not candidate-only.

### Corpus versus baseline

110 cases. 105 signatures differ from baseline main. Every one is justified. Five of them also differ from R10. The full list is `results/corpus-diffs.json`.

R11-only diffs, all five justified by the status-ping versus FAQ change:

| Case | main | R10 | R11 |
| --- | --- | --- | --- |
| `corp-faq-20` Is news trading allowed on the challenge? | old forward sentence | status clarifier | number hedge |
| `corp-faq-21` What is the news trading rule for the classic challenge? | old forward sentence | status clarifier | number hedge |
| `corp-pay-3` How long do payouts take? | old forward sentence | status clarifier | number hedge |
| `corp-pay-10` How long does a payout take? | old forward sentence | status clarifier | number hedge |
| `corp-pay-16` How long do payouts take on the classic challenge? | old forward sentence | status clarifier | number hedge |

The other 100 diffs match R10 exactly. They are the R10 behavior this candidate keeps:

- Ordinary FAQ and payout questions that R10 already hedges, where main still posts `I've forwarded this to a teammate who can take a closer look.`
- Spread checks, where R10 and R11 post the locked MT5 template with no welcome prefix, and main prefixes `Hello Casey,`.
- Partnership questions, where R10 and R11 post the fixed handoff line and main posts the older forward sentence.
- Human-owned threads, where R10 and R11 stay silent and main still replies.

Some general FAQ and partnership questions are handed off on both R10 and R11, and main also forwards them. That handoff is shared with R10. It is not a candidate-only change. Examples include `Are expert advisors allowed?`, `What is the refund policy in general?`, and `How does the partnership program work?`.

## Part C — recovery

| Assertion | Result |
| --- | --- |
| Wipe after the fixed line is already public | no second line |
| Wipe with note and assignment still present, message missing | exactly one fixed line |
| Corrupt op store after the line is public | no invented line |
| Op record plus the seat already held, note missing | one fixed line |
| Op record while a different human owns the thread | silence |
| Human-owned silence after restart | silence kept |
| Kill and restart after note, after assignment, after 500 on note, assignment, or message, and after 429 on assignment | no duplicate public fixed line and no fixed line without a verified assignment |
| Note removed after assignment, then restart | **fail** — handoff lost (`rec-remove-note`) |
| Confirmed op record while the seat is still the bot | **fail** — fixed line posted on a status ping (`rec-op-unverified`) |

Duplicate delivery in the review lane also posts one fixed line and does not post a second one.

## Part D — rollback

The five R10 files were copied byte-for-byte onto a copy of the R11 tree. The same 110 corpus cases were run. All 110 signatures match the pure R10 run. Restoring those files reproduces R10 outputs.

## Classification totals

| Class | Count |
| --- | --- |
| product-critical | 6 |
| unnecessary handoff | 0 in the sealed failures; partnership and some general FAQ handoffs are shared with R10 |
| defect | 1 |
| over-block | 6 |
