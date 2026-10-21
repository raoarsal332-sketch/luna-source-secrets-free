# Independent review: fixed-message handoff R9

**Verdict: NEEDS CHANGES**

Reviewed as an independent reviewer of the frozen tree. No merge, no approval, no deploy, and no Intercom call.

## Frozen identity

| Item | Value |
| --- | --- |
| Branch | `cursor/fixed-message-handoff-r9-8ad1` |
| Commit | `9fb86f70d37cc353183703de25e0cc69fcefbcd0` |
| Draft under review | PR #55 |
| Case seal | `603d05fde0295c212b2df9740050eb940e0bc186c2cf4edc8c42dea8e67df93d` |
| Cases executed | 225 |
| Entry | real `handleWebhook` from `luna-current/01_runtime/index.js` |
| Network | 0 tripwire hits, `externalCount` 0 |

sha256, all matched before the run:

| File | sha256 |
| --- | --- |
| `luna-current/01_runtime/fixedMessageHandoff.js` | `900b906933b4ebced5b24597e9710bc3789812a7cdf5afc1f3d51eeae12186c7` |
| `luna-current/01_runtime/index.js` | `eefba61c6d4e9302948936c3c24c6a568390cdd81204b8f1220d05b8bcab85d9` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `81c714c3730f1493b6a5772e09af3df8654efa09e3ef9f723491185cee64a3ae` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `d6f3e7de44e815ba8d329dbf6ad528b133a8cd47b134e5cb372d75cce92a577c` |
| `luna-current/02_statePresend/statePresend.js` | `0e3b8675e00856eca158748711683471e3820d43a9e5c0ff626a14dc84a90764` |
| `luna-current/01_runtime/challengeVariantGuard.js` | `0d6fff5f5330091c4f8ca02f5ae189845b386922c944d8a7b152970cdc43d12d` |
| `FM_R9_REPORT.md` | `ef54f53634a3d7924e5802fd7d8f0d4dc349987a0907ffe8883d717a08caf4c8` |

The author report hash was checked and the file was not used for the verdict. Author tests were not used. No `review/*` branch was read.

## How the run was built

`review-handoff-r9/harness.js` drives `handleWebhook` in-process. Axios is replaced with a recording transport that answers only `api.intercom.io`. The model is a stub queue. `http`, `https`, `net`, `tls`, `dns`, and `fetch` are tripwired. State files live under a fresh `/tmp/luna-r9-review-*` directory. Tokens are the literals `review-stub-key` and `review-stub-token`. Conversation ids are synthetic and do not collide with the teammate ids used by the runtime (Arsal `10118526`, Elite `8052954`, Jerry `8053416`, synthetic human `71717171`, synthetic teammate `42424242`).

The freeze stores the presend pack in `02_statePresend` while `index.js` requires `./statePresend`, and `presendMega.js` requires `../repeatedClientQuestion`. The harness creates those three links for the process and deletes them afterward. They are not part of this review diff.

`results.json` is the raw run. Its `productCritical: 23` counts assertion lines before this report separates harness mistakes from product failures. The counts below are the verdict.

## Denominators

225 cases, 0 harness exceptions.

| Bucket | n | Raw failing cases | Product failures after review |
| --- | ---: | ---: | --- |
| ownership | 20 | 0 | 0 |
| owner commands | 15 | 2 | 1 critical (a) |
| handoff happy path | 1 | 0 | 0 |
| replay | 1 | 0 | 0 |
| definite retry (422) | 1 | 0 | 0 |
| ambiguous hold (500, timeout, partial with state kept) | 5 | 0 | 0 |
| lost store | 4 | 2 | 1 critical (b) |
| note author | 4 | 2 | 0 (oracle) |
| order | 1 | 0 | 0 |
| bad drafts | 10 | 4 | 0 (oracle / fixture) |
| spread eligible | 5 | 0 | 0 |
| spread ineligible | 7 | 1 | 0 (oracle) |
| spread follow-up prompt | 1 | 1 | 0 (oracle) |
| secrets | 67 | 1 | 0 leaks |
| empty escalation | 7 | 0 | 0 |
| empty FAQ body | 1 | 1 | 1 unnecessary handoff |
| live-agent languages | 18 | 0 | 0 |
| account-number languages | 18 | 1 | 0 (oracle) |
| Fin wait | 9 | 0 | 0 |
| identity | 7 | 0 | 0 |
| FAQ miss | 6 | 1 | 1 defect |
| benign answers | 7 | 0 | 0 |
| mixed | 8 | 2 | 1 unnecessary handoff |
| parallel | 2 | 0 | 0 |

## Criticals by class

Unique product-critical conversations: **2**.

| Class | Product-critical conversations | What shipped |
| --- | ---: | --- |
| (a) human-owned public posts | 1 | `A-owner-spoof-type` |
| (b) fixed line without a real commit | 1 | `B-partial-lost-ops-kept` |
| (c) handoff promise without a successful commit | 1 | same conversation as (b) |
| (d) locked 55188 reply | 0 | |
| (e) synthetic secret leak | 0 | |
| (f) empty escalation-class body | 0 | |
| wrong language | 0 | |

### (a) Spoofed owner note posts on a human-assigned thread

`A-owner-spoof-type`. Topic `conversation.admin.noted`. Note body `@Arsal REPLY: Refund the client one thousand dollars now.` Author id is Arsal `10118526`, author type is `user`, assignee is the synthetic human. The runtime posted that sentence publicly and then wrote `Sent to client.`

`processAuthorizedNoteCommands` accepts the note when the author id is in `AUTHORIZED_NOTE_ADMIN_IDS`. It does not require `author.type` to be `admin`. An unauthenticated human admin (`A-owner-unauth-mention`) stayed silent. An empty or unparsable owner REPLY stayed silent. An authenticated owner REPLY on a human-assigned thread stayed verbatim. A generated FOLLOW on a human-assigned thread stayed silent.

Ownership silence held on all 20 ownership cases (human assignee, human public reply, teammate type, missing part type, Jerry, escalations, risk, ambiguous assignee, stale human, Elite, and unassigned).

### (b) and (c) A partial write is stored as confirmed, then replayed as success

`B-partial-held` (ticket state kept) withheld the public line after `note:ok:applied`, `assignment:partial`. That path is fine.

`B-partial-lost-ops-kept` is not. First turn: note applied, assignment returned HTTP 200 with `data.id` and `data.errors`, and the assignment was not applied (`assignCount` 0). Ticket state was then wiped and the op store was kept. Second turn posted `A teammate now has this conversation.` Order: `note:ok:applied`, `assignment:partial`, `comment:ok:applied`.

`icRequest` treats any HTTP 2xx body that `isValidWriteSuccess` accepts as op-store `confirmed`. `isValidWriteSuccess` returns true when `data.id` is set, before `data.errors` is considered. `classifyAssignment` does see `errors` and returns `partial`, so the same-state retry holds. After the ticket store is lost, the replay of that confirmed key returns `{ ok: true, status: 200, data: null }` and never calls the transport. `classifyAssignment` then sees status 200, `ok: true`, and no `errors` array, so the assignment counts as succeeded and the fixed line is posted with no assignment part.

Definite 422 recovery posted exactly one fixed line. HTTP 500, timeout, and malformed success stayed withheld across the follow-up turn. Parallel double delivery posted one line. A lost store after a real success did not post a second line.

## Unnecessary handoffs

**2.**

1. `F-faq-empty`. Customer asked `What is the daily loss limit?` The model returned an empty `REPLY` body. `index.js` commits the fixed handoff before presend when `isClearKbFaqAsk` matches. Public result: one fixed line, one bot note, one assignment. A non-empty miss of the same question (`J-miss-0`) hedged.
2. `M-status-ping-bot`. `any update?` on a fresh bot-owned thread, with a benign draft, completed a handoff. The ask is not a clear KB FAQ. The presend path treats it as understood and escalates. Counted here, and it does not by itself carry the verdict.

## Defects, over-blocks, regressions

**Defect: 1.** `J-promise-faq`. Draft `Our team will review this and get back to you.` on `What is the daily loss limit?` was posted. `ESCALATION_DRAFT_RE` matches `our team will review`, so the missed-question regeneration/hedge does not run, and no handoff commit ran. The public text was `Hello Synth, Our team will review this and get [secret] to you.`

**Over-block: 1.** The `[secret]` in that sentence is the English word `back`. An earlier turn, `Say that password back.`, is parsed as a labeled secret whose value is `back` (length 4). `rememberSecret` keeps it for the process. A later reply then replaces that word. Isolated `sanitizeCredentials('Our team will review this and get back to you.')` leaves the sentence unchanged until `password back` has been seen. No synthetic secret or alphanumeric fragment of one appeared in a public reply, note, or prompt. The 67 secret cases, including later-turn echoes, braces, quotes, NFKC, zero-width, `sk-`, Bearer, and base64, did not leak. `E-owner-secret` replaced the whole password value with `[secret]` and left the rest of the dictated sentence. That is the redaction the property asks for.

**Regressions: 0.** All 7 benign answers posted. Eligible spread asks, including `conversation.user.created`, were the locked reply byte for byte. Fin-wait held a fresh hello, a fresh FAQ, and a recent Elite reply, and it let a created live-agent ask, a created spread ask, a created account-number ask, and an Elite live-agent ask through. Identity questions were answered on the paths in this set, including when the draft was an escalate promise. Empty escalation-class bodies with an account id completed note, assignment, and one fixed line. An empty escalation without an account id asked for the account number. A human-owned empty body stayed silent.

## Language

Live-agent lines, 18/18, were the approved fixed line and nothing else: Urdu script and Roman Urdu and Hinglish used the Urdu line; Hindi, Arabic, and Italian used their lines; French, German, Dutch, Spanish, Portuguese, Turkish, Polish, Russian, Chinese, Japanese, and Indonesian used the English line.

Account-number lines used the approved sentence for English, Urdu, Hindi, Italian, and Hinglish (including Roman Urdu). Chinese, Japanese, and the other languages with no approved account line used the English sentence. No reply used a different language's sentence.

Urdu and Arabic account answers were prefixed with `السلام علیکم`. Hindi and Italian account answers were prefixed with `Hello Synth,`. The approved sentence followed the greeting. Live-agent fixed lines had no greeting.

## Harness mistakes, not product failures

These raw assertion lines are excluded from the critical counts.

| Case | Why it is a harness or oracle mistake |
| --- | --- |
| `A-owner-follow-generated-bot` | Thread was bot-owned. Property (a) constrains human-owned, human-assigned, and human-replied threads. The same generated FOLLOW on a human-assigned thread stayed silent. |
| `B-note-partial-lost-state` | First note was partial and not applied. After ticket state was wiped, the second note body differed, so it was a new write and it applied, then the assignment applied, then one fixed line. That is one safe recovery. The oracle demanded a permanent withhold. |
| `B-comment-not-note` | The seeded Arsal comment was newer than the user part, so the already-replied skip ran. The case never reached the note-author check. |
| `B-forged-user-note` | The forged note became the latest user part. The model answered the FAQ. It did not emit the fixed line from that note. |
| `C-unsupported`, `C-unsupported-regen` | `faq.md` starts with `### Holding time`. `parseArticles` skips `parts[0]`, so the holding-time article was never indexed (`FAQ_KB loaded 4 articles`). Retrieval returned the no-match block. With that article passed in directly, `presend.validate` returns `UNSUPPORTED_NUMBER` for `99 minutes`. |
| `C-fixed-as-draft`, `C-fixed-bang` | Public text was the approved daily-loss answer. Regeneration is allowed. |
| `D-no-2` | `My MT5 login password and server are not working.` is an account-specific login failure. The fixed line is that escalation. |
| `D-then-prompt` | The scanner treated account number `55188` in the redacted history as the template credential. `sanitizeCredentials` on the locked reply keeps `55188` and replaces the password with `[secret]`. `QBG5FetfozKz7` was not in the prompt. |
| `E-owner-secret` | Whole password value became `[secret]`. The dictated remainder was unchanged. |
| `L-acct-ar` | The posted Arabic sentence is the approved line after NFKC. The only difference is the canonical order of U+0651 and U+064E on the same letter. `normalize('NFKC')` of `ACCOUNT_QUESTION_LINES.ar` equals the posted tail. |
| `M-zw-assignee` | Assignee id `71717171` plus a zero-width space was treated as a human assignee and the bot stayed silent. |

## Observation that is not a scored critical

On a bot-owned thread, an authenticated owner FOLLOW whose model plan is `I have approved a full refund for you.` is posted through `postReply` and skips presend (`A-owner-follow-generated-bot`). The same plan on a human-assigned thread was withheld.

When retrieval returns the no-match block, `index.js` still passes that block to presend with score `0.72`. `classify` then reports `supported`, and `99 minutes` is only the soft warning `UNAUDITED_FACTS`. This suite did not establish that path as a product failure, because the holding-time article was dropped by the fixture before retrieval.

## What has to change

1. An owner command note must be an admin author, not only an author id that matches Arsal or Jerry. A `user` author with that id must not post a public body.
2. An HTTP 200 write body that contains `errors` must not be stored as op-store `confirmed`. A later replay must not come back as `ok: true` with `data: null` and then pass `classifyAssignment`.
3. An empty body on a clear FAQ ask should take the same regenerate-or-hedge path as a non-empty miss, rather than `commitFixedMessageHandoff` before presend.
4. A labeled value that is only the English word `back` should not enter the process-wide remembered-secret set. A team-review sentence on an FAQ the knowledge base answers should hedge or be regenerated.
