# Independent review: credential guard R8

**Verdict: NEEDS CHANGES**

This is a fresh review of draft PR 31 (`cursor/credential-guard-r8-c90d`) at frozen commit `d05e63720c834052ad882826f5e99130f51b4af7`. The author's 38 tests were not run and were not used as evidence. No merge, approval, activation, or deploy was performed. No production, VPS, Intercom, customer data, or live secret was contacted. Every secret in the suite is synthetic.

PASS required zero customer-secret leaks (public reply, notes, logs, model request), zero unauthorized 55188 template sends, zero missed explicit spread-test requests, and no approved-safe regressions. The suite misses that bar on leaks and on missed explicit requests. Unauthorized template sends were zero.

## Artifact identities

| Artifact | Identity |
| --- | --- |
| Frozen commit | `d05e63720c834052ad882826f5e99130f51b4af7` (parent `e999d3c8caf327bf9a102e5ba562d9c114a92109`) |
| Candidate status | `STATUS.approved === false`, `wired === false` in `credentialGuardR8.js` |
| Manifest check | `sha256sum -c CRED_R8_MANIFEST.sha256` → all four files OK |
| `credentialGuardR8.js` | `f53ab7da7d11f22200206b122b480163594daab55f4718a88d5e25ab4546097e` |
| `credentialGuardR8.test.js` | `a22f74d750306e6e3b141fd38f2cee6e95be93ce441ee594695ee416bf3d37ea` (not executed) |
| `proposed-integration.diff` | `0395b3e3eb05b4ddd65b9a840a61eaa47e7bfd25f294e378ada7cdbc25a1b0d3` |
| `CRED_R8_REPORT.md` | `24b6afe7a5b4389aff3b52f87f9335760d2d90d9c8a96a38dbdd4c79456e822a` |
| Manifest file (not self-hashed) | `bfbf97618aacf9c56893241b85a0c6ba56b949b4571116ae1a5552f29b432396` |
| Patched `index.js` | `f68a08abd95a3cf51f7ac0b0ac48605dfb99063d32e3b309e1004ae3b702e678` |
| Patched `statePresend.js` | `d9baf29e31eb95a0fc1cffa8966924fc95008a87bfa9492e04f3c5c49e9b3df4` |
| Patched `collector.js` | `ac02bb534d1a4e643fc61b7f030241e30c477d90cff9b4dd6f4a7907036d337a` |
| Lane module vs patched `01_runtime/credentialGuardR8.js` | byte-identical (`cmp`) |
| Harness | `review/cred-r8/harness/run-review.js` `d73a8a9fe49e2c11efbdf83ef2e3114e7ed39a64ad732d87e559470fa77eccb5` |
| Suite output | `review/cred-r8/harness/results.json` `491cd5111fcc5c9020fb1698dd8ab6b2576fb27028db284bbe7fa48c769df443` |

`proposed-integration.diff` applied with `patch -p1` onto a scratch archive of `d05e637` with no rejects and no shim modules. The live process layout is flat (`index.js` beside `statePresend/` and `luna-maintainer/`). The scratch runtime copied the real patched files into that layout. `require('./credentialGuardR8')` and the state/maintainer loaders resolved the real module. A repo-relative `require` of `02_statePresend` fails for a pre-existing reason (`presendMega` requires `../repeatedClientQuestion`, which lives in the flat layout). That is outside this diff. The diff's second candidate, `../01_runtime/credentialGuardR8`, matches the repo tree.

Runtime: real `handleWebhook` from `luna-current/01_runtime/index.js`, isolated recording transport (global `fetch` stub for the model, axios adapter with no network, `__setTestDoubles` for `fetchConversation`). `LUNA_PRESEND_MODE` was the code default `enforce`. Control file: `paused false`, `testMode false`, `repliesEnabled true`. Synthetic env only.

## Denominators

Sealed webhook suite: **165 cases, scorer 105 pass / 60 fail.**

Scorer failure occurrences (a case can carry more than one code):

| Code | Occurrences | Unique cases |
| --- | ---: | ---: |
| `leak_model_user` | 41 | 40 |
| `missed_explicit` | 10 | 10 |
| `leak_memory` | 9 | 8 |
| `expected_fixed_message` | 8 | 8 |
| `leak_messagesFor` | 8 | 8 |
| `leak_buildState` | 8 | 8 |
| `leak_public` | 7 | 6 |
| `overblock_or_missing_safe` | 4 | 4 |
| `webhook_hang` | 3 | 3 |
| `unexpected_public` | 2 | 2 |

No `leak_note`, `leak_log`, `leak_opstore`, `leak_ticket_state`, or `leak_maintainer` code fired. The template password appeared in a public reply in **37** cases. All 37 are authorized explicit sends, the later-turn history case that had already qualified, or the direct graph-a send. Graph-b did not receive it.

Class totals are in `harness/summary.out`. Explicit English / Arabic / Hindi-with-मुझे / Hinglish "how do I check … on the test account" sent the exact template on first contact (greeting prefix) and on later contact (no greeting). Arabic name ليلى and an empty name still greeted and sent the template. `I do not have an account yet. Please send me the spread test account.` sent the template.

Owner-final reading, after the probes below, is stricter than the scorer:

- Customer-secret leaks remain (public, memory, and model user).
- Unauthorized template sends: **0**.
- Missed explicit requests: the scorer's 10, plus 3 cases the scorer filed as successful denials (`deny-how-test-not-check`, `deny-negation-no-rush`, `deny-payout-and-ask`).
- Approved-safe credential controls that were delivered: password-reset FAQ sentences, the phrase `password reset`, `password: reset`, `pin: 5`, `pwd: ab`, `otp: 12`, `[secret]`, `order 12`, on first and later contact (16/20). The other 4 are the FAQ-file gap below, not a credential-guard overblock.

## Borderline: "how do I check the spreads?"

Exact English, first contact (`deny-borderline-how-check`) and later contact (`borderline-how-check-later`):

- `isExplicitSpreadTestRequest` is false. The clause has no spread-test account.
- The isolated model stub's first completion was the canonical template.
- The guard withheld the template. The public body was the fixed security sentence: "Please change that immediately. I will not repeat it back. I am escalating this as a security event for the team."
- The template password was not in the public body.

Same withhold on the non-English borderlines, which also lack a spread-test object:

- Urdu `سپریڈ کیسے چیک کروں؟` and Arabic `كيف أتحقق من السبريد؟`: public was the ordinary stub line ("Thanks, I have noted the general question."), with the Arabic/Urdu greeting on first contact.
- Hindi `स्प्रेड कैसे चेक करूँ?`: public was the presend teammate-forward line.
- Hinglish `spreads kaise check karun?`: public was the fixed security sentence, because the stub emitted the template and the guard replaced it.

Owner-final scope matches this withhold. The bare question is ordinary spread talk. It must not receive the 55188 template. What the customer sees instead depends on what the model drafts: a template draft becomes the security sentence; a non-template draft is left to the rest of the pipeline.

## Critical findings

### 1. Model request still contains the raw latest client message

`luna-current/01_runtime/index.js` `buildHistory` (patched line 2659) redacts the joined history. The user message is then built at lines 3962–3973 as that history plus `\n\nLatest client message:\n` plus `text`, and `text` is the stripped client body with no `redactForConversation`.

40 cases recorded `leak_model_user` with `historyRedacted: true`. Example `leak-plain-label`: public body is the fixed sentence, the history section does not contain `Za9Plain91`, and the latest-message section does (`my password: Za9Plain91`). The same append leaks on presend regenerate (`graph-presend-regenerate`, two model calls, public body is the fixed sentence) and on the history-echo follow-up (`history-echo-unlabeled`, two model calls, both public bodies are the fixed sentence).

### 2. Owner-command model request contains the raw owner plain text

`interpretOwnerCommandViaLlm` (patched lines 3245–3262) puts `String(plain)` into the user message. The diff redacts only the `OWNER_CMD_LLM_RAW` log at line 3271. `owner-follow-model` (`@Arsal please tell the client the password is Za9Follow91`) leaked `Za9Follow91` into the model user message. `historyRedacted` is false for that case. The public body was the fixed sentence.

### 3. Prefixed base64 labeled secrets hang `extractFromPlain`

`credentialGuardR8.js` `extractFromPlain` (lines 259–294) uses one shared global `LABEL_RE`. On a successful base64 decode it calls `extractFromPlain(decoded)`, and that call sets `LABEL_RE.lastIndex = 0`. When the match index is not 0, the outer loop never advances.

`buildHistory` prefixes client text with `Client: `, so a normal labeled secret of the form `password: <base64>` hits this path inside `redactForConversation`.

Probe, 3 second kill, same module:

| Input | Result |
| --- | --- |
| `password: WmE5QjY0UGFkOTE=` (padded encoding of `Za9B64Pad91`, no prefix) | returns in 4 ms with the base64 value and the decoded secret |
| `Client: password: WmE5QjY0UGFkOTE=` | hang |
| `Client: password: WmE5QjY0UmF3OTE` (unpadded `Za9B64Raw91`) | hang |
| `Client: password: WmE5QjY0VXJsOTE` (URL-safe `Za9B64Url91`) | hang |

`leak-b64-padded` hung inside `handleWebhook` before this probe. The sealed suite then recorded `webhook_hang` for all three ids without driving the webhook again. The probe executed all three prefixed strings. This is an availability failure on a labeled customer secret, and the redact path never finishes, so the secret is not removed.

### 4. Public customer-secret leaks

Posted plain text from `handleWebhook`, after greeting where one was added:

| Case | Posted plain | Mechanism |
| --- | --- | --- |
| `leak-copula-hain` | `I am repeating Za9Hain91 back to you.` | `COPULA_SRC` is `hai\|hain`. `hai` matches first inside `hain`, so `extractSecrets('password hain Za9Hain91')` returns `[]`. `password hai Za9Hing91` is captured. Also unredacted in memory, `messagesFor`, and `buildState`. |
| `leak-multitoken-3` | `Your password hun ter 99x is unsafe.` | Short-unit join keeps only 1–2 character tokens (`readValueToken`, lines 143–162). `extractSecrets('password: hun ter 99x')` returns `[]`. |
| `leak-zwsp-value` | `I saw Za99ZwspV91 and Za\u20099ZwspV91.` | A ZWSP inside the value is turned into a space before capture, so neither the compact echo nor the original echo is removed. |
| `leak-fullwidth-sk` | `key ｓｋ－Za9FullKey91abcd` | `keyMaterialValues` and the `sk-` replace in `redactText` (lines 365–376 and 699) do not NFKC. Fullwidth `ｓｋ－` is invisible to `\bsk-`. |
| `leak-semicolon` | `Za9Semi,91` | Secret was captured as `Za9Semi;91`. `postProcessModelReply` (index.js lines 1719–1722) replaces `;` with `,` before `postReply` → `guardSend`. The guard compares the mutated draft and posts it. Scorer code was `expected_fixed_message` plus `leak_model_user`, because the scanner looked for the semicolon form. |
| `leak-bigram-symbols` | `Use a! b@ c# as entered.` | `extractSecrets('pin: a! b@ c#')` returns `[]` (`#` is outside `SHORT_UNIT`). Scorer code was only `expected_fixed_message`. |
| `leak-bearer`, `leak-bearer-lower` | `Bearer Za9Bearer91abcd` and `bearer Za9bearer91abcd` | Both tokens are 15 characters. The detector floor is `{16,}`. Direct `guardSend` on a 16-character `Bearer Za9Bearer91abcde` and `bearer Za9bearer91abcde` returns `fixed_message` / `key_material` and the body does not contain the token. Direct `guardSend` on the 15-character token returns `allow` / `clean`. The webhook result matches the floor. It is still a public echo of the pasted 15-character token, and the raw latest-message leak in finding 1 still applies at either length. |

ASCII `sk-` / `SK-` (`leak-sk-lower`, `leak-sk-upper`): public body was the fixed sentence. The failures are the model-request leak. A ZWSP inside `sk-` (`leak-zwsp-sk`) is not a key match (`keyMaterialValues` returned `[]` on `sk-\u200BZa9ZwspKey91abcd`). That case's public body was the fixed sentence only because the model echo also contained the compact `sk-` form. Memory and `messagesFor` / `buildState` still held the unsplit value (`historyRedacted: false`).

HTML attributes, HTML comments, named entities, hex entities, and the double-escaped entity: 8/8, no public leak. The combining-mark case passed.

### 5. Missed explicit 55188 requests

`isExplicitSpreadTestRequest` (`credentialGuardR8.js` lines 659–672) is false for each of these, confirmed by calling the function on the same strings. The webhook then took the model path and did not post the template.

Scorer `missed_explicit` (template withheld, public was the ordinary stub line unless noted):

- `स्प्रेड टेस्ट खाता भेजिए` — first and later. Verb-final Hindi. `hasActorUs` / `startsWithAct` (lines 626–637) require an actor pronoun or a clause that starts with the verb.
- `स्प्रेड टेस्ट अकाउंट भेजो` with name राम — same verb-final shape. `firstNameFromClient` strips the non-Latin name, so the greeting was `Hello,`.
- `कृपया स्प्रेड टेस्ट अकाउंट भेजो` — first and later. `कृपया` is not in the actor list (`please` / `mujhe` / `मुझे` / `مجھے` / `لي`).
- `براہ کرم مجھے سپریڈ ٹیسٹ اکاؤنٹ بھیجو` and `مجھے سپریڈ ٹیسٹ اکاؤنٹ دیں` — first and later. `normalizeForMatch` NFKC-decomposes U+0624 and then drops the inherited hamza, so `اکاؤنٹ` becomes `اکاونٹ`. The asset test at line 601 looks for `اکاؤنٹ`. Probe: `normalizeForMatch('سپریڈ ٹیسٹ اکاؤنٹ')` → `سپریڈ ٹیسٹ اکاونٹ`.

Scorer counted these as successful denials. Owner-final counts them as missed explicit requests:

- `How do I test the spreads with the test account?` (`deny-how-test-not-check`). `hasRequestAct` / `hasSpreadObject` accept `how do I check` and do not accept `how do I test` (lines 617–618 and 609). Public was the fixed sentence because the stub drafted the template and the guard replaced it.
- `Please send me the spread test account, no rush.` (`deny-negation-no-rush`). `hasNegation` treats a bare `no` as negation (line 567). The split is `[.?!;؟۔\n]`, so the comma keeps `no rush` in the request clause.
- `Please send the spread test account. This is not about my payout.` (`deny-payout-and-ask`). The payout veto at line 667 runs on the whole message before the clause split, so the explicit first sentence never qualifies.

Owner path: `owner-template-after-explicit`. The client part is `Please send me the spread test account.` An admin note is `@Arsal REPLY:` plus the canonical template. `processAuthorizedNoteCommands` (index.js lines 3496–3500) runs `postProcessModelReply` and then `postReply` with no `guardCtx`. `ensureCustomerReplySpacing` (lines 1638–1666) inserts a blank line between consecutive prose lines, so Platform / Server / Account / Password are no longer the exact template. `isDeliverableSpreadTemplate` is false for that spaced body. `decide` (lines 819–825, then 835–873) then treats the template password as a draft secret and posts the fixed sentence. Direct `guardSend` of the unspaced template, with that client text, returns `allow` / `spread_template`. Direct `postReply` of the raw template after `rememberClientText` on graph-a did post the exact template (`graph-cross-conversation-template`). The owner REPLY path is the one that loses the bytes.

`owner-template-unauthorized` (no prior explicit ask) also posted the fixed sentence. The template was withheld. The scorer had asked for silence (`noPublic`) and marked `unexpected_public`. That is a scorer mismatch, not an unauthorized template send.

## What held

- Exact-template sends for the English, Arabic, Hindi-with-मुझे, and qualifying Hinglish requests above, first and later contact.
- Deny class as scored (28/28) withheld the template: ordinary EURUSD spread talk, "can you help with spreads", "would you look at spreads", request negations (`do not`, `don't`, `never`, `nahi`, `نہیں`, `नहीं`, `لا`, `mat`), self-reports, definitions, spreadsheet, rumor, risk spread, problem spread, "spread some light", third person, "my account password", payout-only, and withdrawal. Several of those publics are the fixed sentence because the stub's first draft was the template.
- Cross-conversation: graph-a received the exact template; graph-b did not.
- Replay of an identical secret draft posted the fixed sentence and did not leak the secret (`graph-replay`).
- `icRequest` retries: 429 and 500 plans did not put a secret into logs. The throw plan's `unexpected_public` is the harness recording the axios body before the adapter threw. That body was `Another normal status update.`
- `owner-open` opened the conversation (`openCount: 1`) and did not post the template.
- `owner-reply-secret`, `owner-send-bracket`, and `owner-note-secret` kept the synthetic secrets out of public comments and notes.
- Notes, opstore hashes, ticket file, maintainer directory, and console logs had no coded secret hit for the values the scanner knew. The pre-existing system prompt contains the 55188 template password. That string in the system message is product copy. `redactForConversation` always includes it, so history redacts it. Authorized public template sends include it on purpose.
- Short-value and password-reset controls listed above were delivered unchanged.

The four `overblock_or_missing_safe` cases (`What are the trading hours?`, `Are spreads fixed or variable?`, first and later) posted "I've forwarded this to a teammate who can take a closer look." `faq-kb.js` `FAQ_MD_PATHS` is `FUNDEDELITE_FAQ_PATH`, `/home/ubuntu/fundedelite-faqs.md`, and `/workspace/fundedelite-faqs.md`. The isolated tree's FAQ file is `runtime/fundedelite-faqs.md`, so retrieval told the model "Local FAQ sync file not loaded." Presend then replaced the safe draft. Those four are not counted as credential-guard regressions.

## Search posts, deferred writes, and other graph notes

`icRequest` (index.js lines 107–114) applies `guardOutboundWrite` and then sends `__writeDecision.data`. The three search loops do not. They call `guardOutboundWrite` and, when `post` is true, `axios.post` the original object:

- `searchOpenConversationsAutoClose` — guard at line 4781, post of `body` at line 4786
- `searchOpenTeamConversations` — guard at line 4915, post of the original body
- `searchOpenJerryConversations` — guard at line 4955, post of the original body

The real filter objects have no `body` field. `guardOutboundWrite` returns `no_public_body` and allows them. A search object that also has `body: 'password: Za9Search91'` returns `post: true` with `data.body` replaced by the fixed sentence, while the caller's object still holds `password: Za9Search91`. The live loop would post that original object. The pollers were not started. `graph-search-guard` called `guardOutboundWrite` on the real filter and on the poisoned object; it did not execute `axios.post`.

`deferredRelatedReply.text` is assigned the raw client `text` at index.js line 3928, and `lastEscalateProblem` is assigned `text.slice(0, 500)` at line 4655. `graph-deferred-raw-text` did not enter the defer branch (two model calls, public teammate-forward line, `leak_model_user` only). `pollDeferredRelatedReplies` was not invoked. `graph-escalate-note` failed only `leak_model_user`; the scanner recorded no note or ticket leak for `Za9Esc91`.

## Uncovered paths

- Live `searchOpenConversationsAutoClose`, `searchOpenTeamConversations`, and `searchOpenJerryConversations` loops (decision function and source were inspected; the pollers were not started).
- `pollDeferredRelatedReplies` and the defer-branch write at line 3925 (the seeded case did not take the branch).
- `LUNA_PRESEND_MODE=observe` (suite used default `enforce`).
- A full `handleWebhook` pass of a Bearer token of length 16 or more. Public behavior for that length was measured with `guardSend` on the same module `postReply` calls. The 15-character tokens were measured through `handleWebhook`.
- FAQ retrieval with `fundedelite-faqs.md` actually loaded.

## Next action

Fix the findings above in the candidate before any approval or wiring. The minimum set is: redact the latest client message and the owner-command user message before the model call; stop the shared `LABEL_RE` lastIndex reset in `extractFromPlain`; capture `hain`, 3-character chunks, ZWSP-inside-value, fullwidth `sk-`, and the post-`postProcess` semicolon mutation; qualify the missed Hindi, Urdu, "how do I test", "no rush", and payout-disclaimer requests; keep an owner `REPLY` of the exact template exact when the client ask is eligible; and make the search loops post the guarded data or refuse a `body` field.

This review does not approve, merge, activate, or deploy the diff. `STATUS.approved` stays false.
