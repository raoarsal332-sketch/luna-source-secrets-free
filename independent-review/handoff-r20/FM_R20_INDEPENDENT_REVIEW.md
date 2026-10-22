# Independent review: fixed-message handoff R20

Verdict: **NEEDS CHANGES**

This review does not approve the candidate, does not merge it, and does not authorize a deploy.

| Item | Value |
|---|---|
| Candidate | `cursor/t800-handoff-r20` at `0d9af3733d48cd7a59ca20dab8e3a00531e2ca6d` (PR #103) |
| Reviewer branch | `cursor/handoff-r20-independent-review-6cd7` (off `main`) |
| Author report | `luna-current/10_synthetic_lanes/fixed-message-handoff-r20/FM_R20_REPORT.md` |
| Report sha256 | `ab96e5bd9270aba5510d7259235d12ab1144e4eab791b4e6e7c617a652ae75cc` (match) |
| Sealed set | `independent-review/handoff-r20/sealed/cases.json` |
| Sealed sha256 | `7d95d259404c0e6e5c3eebc8946dace016a96c9cb0bdc3e9b16d051bb80be3a9` |
| Scorer pass rate | **906 / 981 (0.9235)** |

No `review/*` branch was checked out or read. Baselines are the R19 freeze `6bb9e2dcb3fdc71e4f67444c8b2e4ea3a2894779` and the R18 freeze `c7fe62e7daedca4452a28acf706bc5f613a2f805`, each in its own detached worktree. The author report was checked for hashes and for its own claims. It was not used as the score.

## Hash verification

The report bytes at the pinned commit hash to `ab96e5bd9270aba5510d7259235d12ab1144e4eab791b4e6e7c617a652ae75cc`. All 11 files listed in that report match the commit:

| File | SHA-256 | Result |
|---|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `abfbc9993818d1284dc46cdd5b15ae397a645552a3fdab216081d38e5359ab0d` | match (88370 bytes) |
| `luna-current/01_runtime/index.js` | `d029a8ebfed38b4bf7c1d351b81dfc9ec9325c4459c3c1117c2c6040018517ce` | match (241837 bytes) |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` | match |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` | match |
| `luna-current/02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` | match |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r20/fixedMessageHandoff.test.js` | `601f7e2d41a101ca920c9acdf19b4c6713fe6fe6bf2a03abebb95620f4b11100` | match |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r19/fixedMessageHandoff.test.js` | `5721dfc7b1f7e237369806f1983f2b9962c09155ca27c5e6526a0d4ecd0fb24b` | match |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` | match |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` | match |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` | match |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` | match |

## Sealed set

The set was written and committed before any scored run of the candidate. The generator does not load the runtime. It reads FAQ article bytes with `git show` of the pinned SHA.

Commits on this branch, in order, before the scored hash was executed:

1. `fe7f6aa` first seal `f3696556805097e9b903e1e88f4730a6712ea688f081023609ea590b55ebdae8`. Two-step FAQ cases required one public comment. That oracle was wrong: a password or secret turn plus an article is two public posts.
2. `c654619` second seal `64e9e5697e02601fcd4013ff88fc449f9c7ea07c34f864b8444165969588531f`. Two-step FAQ expects were corrected to two successful comments and an exact final article.
3. `2c3fa33` scored seal `7d95d259404c0e6e5c3eebc8946dace016a96c9cb0bdc3e9b16d051bb80be3a9`. A harness smoke showed the article URL header is stripped from the customer body, and some order or MT5 tokens existed only in the stub reply. Those two checks were dropped. Order-ID survival checks on the posted body were kept. The scored file was not edited after the run.

| | |
|---|---|
| Cases | 981 |
| Recovery | 200 |
| Bytes | 503673 |
| handoff | 648 |
| password | 90 |
| faq | 6 |
| figure | 20 |
| preserve | 10 |
| reply-secret | 7 |
| recovery | 200 |

Coverage in the set: human-agent requests in English, Hindi, Urdu, Arabic, Roman Urdu, and Hinglish, including Latin role words (`agent`, `human`, `staff`, `banda`, `insaan`, `representative`, `support`) inside Devanagari and Arabic script, honorifics, typos, and long sentences. Labeled and unlabeled secrets on Fin-wait (`conversation.user.created`), welcome, and later turns. Non-handoff replies that must keep a legitimate order ID and must not echo a customer secret. Password-policy questions on every path, including Fin-wait, with empty, hedge, and usable drafts. FAQ exact bytes (U+200B) after a password turn and after a secret turn. Supported figures posted as themselves, invented figures withheld. Recovery matrix below. Over-sanitization cases for alphanumeric order IDs, a numeric order ID, MT5 login numbers, and a URL whose path contains an order ID.

## How it was run

`independent-review/handoff-r20/run-sealed.js` calls the real `handleWebhook`. The HTTP client is a recording axios mock (exact payloads). The model is a stub. `http`, `https`, `net`, `dns`, and `fetch` are tripwired. Live FAQ lookups to `faq.fundedelite.com` stay inside the mock. Restart cases run in a child process with the same state files. Each runtime (R20, R19, R18) was one process for the full 981. Fresh processes were used afterwards for the cases the process-global secret memory can mask.

Observed hosts on the R20 full run: `api.intercom.io` 8010, `faq.fundedelite.com` 210. Tripwire fires: 0. Elapsed about 92 seconds. No VPS, no live Intercom, no production secrets.

## Scorer

| Runtime | Passed | Pass rate | Product-critical | Leaks | Duplicate posts or assignments | Recovery failures | Tripwire |
|---|---:|---:|---:|---:|---:|---:|---:|
| R20 `0d9af373` | 906 / 981 | 0.9235 | 15 | 0 | 0 | 60 | 0 |
| R19 `6bb9e2dc` | 521 / 981 | 0.5311 | 287 | 0 | 0 | 173 | 0 |
| R18 `c7fe62e7` | 397 / 981 | 0.4047 | 405 | 0 | 0 | 179 | 0 |

R20 class counts:

| Class | Pass | Fail |
|---|---:|---:|
| handoff | 648 | 0 |
| password | 90 | 0 |
| faq | 6 | 0 |
| figure | 20 | 0 |
| preserve | 1 | 9 |
| reply-secret | 1 | 6 |
| recovery | 140 | 60 |

Same sealed hash on all three runs. R20 fixes 388 cases that fail on R19, and 512 that fail on R18. In the single-process comparison, 3 cases fail on R20 and pass on both R19 and R18: `K-model-0`, `K-model-1`, `K-model-4`. A fresh-process recheck adds the reply-secret class, described below. The full-run R19 score under-counts that class because `credentialSanitizer` keeps labeled secret values in a process-global set, and an earlier case had stored `FE10482931` as a labeled password.

## Gates

| Gate | Result |
|---|---|
| 0 product-critical | miss: 15 |
| 0 leaks of the sealed secret strings | pass: 0 |
| 0 duplicate customer posts or assignments | pass: 0 |
| 0 recovery failures | miss: 60 |
| 0 candidate-only regressions versus R18/R19 | miss: 3 in the single-process diff, and 5 more reply-secret cases once each runtime is a fresh process |
| Author suites R2–R20 | pass (exit 0) |
| Repair suite, 2 known selftest failures | pre-existing: `selftestFail 2`, `hashFail 0`, `syntaxFail 0`, adversarial 58/58 |

The two selftests fail on the same missing source strings the author report names, and those strings are absent from `index.js` on both the R19 freeze and this candidate: `I've forwarded this to a teammate` and `postProcessModelReply(lockedFinHandoffWelcome`. Author suite totals on this candidate: R2 16, R3 33, R4 10, R5 8, R6 9, R7 9, R8 7, R9 5, R10 7, R11 5, R12 6, R13 3, R14 10, R15 3, R16 4, R17 5, R18 3, R19 4, R20 6.

## What holds

Handoff, 648/648. English, Hindi, Urdu, Arabic, Roman Urdu, and Hinglish, including code-mixed Latin role words, honorifics, typos, and long sentences, on Fin-wait, welcome, and later turns, with no secret, a labeled secret, unlabeled noise, or both. Each case posted the locked line once (`A teammate now has this conversation.` / `यह बातचीत अब एक साथी के पास है।` / `یہ گفتگو اب ایک ساتھی کے پاس ہے۔` / `هذه المحادثة الآن لدى أحد الزملاء.`), one note, one assignment, and the sealed secrets were absent from the prompt, the note, the assignment, and the public body.

Password policy, 90/90, including `conversation.user.created`. Empty and hedge drafts post `Which part of the password policy should I explain?`. A usable draft keeps `Passwords must include letters and numbers.` No path was silent.

FAQ, 6/6. Challenge and leverage articles match the parsed customer body, including U+200B, on a direct ask and on the turn after a password-policy question and after a secret turn. The pay-for-challenge tie posts `Please tell me which challenge you mean.` with no Hello prefix. The posted article does not contain `[secret]`.

Figures, 20/20. Supported drafts (`The DLL is 5%.`, `The MLL is 8%.`, and the other supported forms against `DLL 5%/3%, MLL 8%.`) post as themselves. `The DLL is 99%.` and `The daily drawdown is 8%.` are withheld. Sequences after a password turn and after a secret turn passed.

Recovery other than comment HTTP 400/403/404/409, 140/200. The 200 recovery cases are 135 comment-miss (5 languages × Fin-wait/welcome/later × 400, 403, 404, 409, 422, 500, 502, 503, timeout), 15 wiped-store, 15 human-during-recovery, 15 duplicate, 10 restart, 10 bounded. Passing comment-miss codes are 422, 500, 502, 503, and timeout: the owed locked line posts once, the removed note is not rewritten, and the assignment is not repeated. A wiped op store with the assignment still present does not redo the note or the assignment. A restart child posts the owed line. A human assignee during recovery stays silent. A duplicate delivery does not post again. Bounded 429 stays within three attempts.

A labeled order ID presented as a password (`K-labeled-order-is-secret`) stays out of the public body on both R20 and R19 in a fresh process. A pure numeric order ID `10482931` and MT5 login numbers `10023456`, `55188`, and `189143` survive. The word `MT5` is rewritten to `the trading platform`. That rewrite is the existing lock the repair selftest already records as `PASS: MT5 stripped from client reply` and `PASS: spread template MT5 preserved`.

Leaks of `SuperSecretValue99`, `Zq8LatinNoise88ab`, and `hunter2` on the R20 full run: 0. Duplicate successful customer comments and duplicate assignments: 0.

## What fails the gates

### Alphanumeric order IDs and URL path segments become `[secret]`

`redactUnlabeledSecrets` replaces any token of at least 8 alphanumerics that contains both a letter and a digit with `[secret]`. `href` and `src` attributes, the spread template, and the two clarifiers are exempt. A bare URL path is not. FAQ posts use a separate approved-bytes path, which is why the FAQ cases stayed exact.

These are customer-visible bodies from the R20 run. The MT5 number is intact. The order ID is not.

`K-model-0` (fails R20, passes R19 and R18 in the same sealed process):

`Your order ID is [secret] and your the trading platform login is 10023456.`

`K-model-1`:

`Order [secret] is open. the trading platform login 55188.`

`K-model-4`, also confirmed in a fresh R20 process (the same case passes in a fresh R19 process):

`Receipt https://files.example.com/orders/[secret]/receipt and the trading platform 10023456.`

The stub had sent `https://files.example.com/orders/FE10482931/receipt`. The path segment `FE10482931` was replaced. `ORD104829` was replaced the same way.

`K-model-2` passes on R20 and R19. Its order ID is the digits `10482931`, which the rule does not treat as a secret, and its MT5 login `189143` is unchanged.

### Non-handoff replies scrub the order ID the customer must see

The reply-secret stub is `Trading days are Monday through Friday. Ref <customer secret> Order FE10482931 MT5 10023456`. The secret must disappear. `FE10482931` and `10023456` must remain.

Fresh R20 process, all 6 of `R-welcome-labeled`, `R-welcome-unlabeled`, `R-welcome-both`, `R-later-labeled`, `R-later-unlabeled`, `R-later-both` fail. Welcome example:

`Hello Sam,<br><br>Trading days are Monday through Friday. Ref [secret] Order [secret] the trading platform 10023456`

The labeled and unlabeled customer secrets are absent, so these six are product-critical and not leak-tagged. The order ID is gone.

Fresh R19 process: 5 of those 6 pass, and `FE10482931` is still in the body. The one R19 failure is `R-welcome-unlabeled`, tagged leak: the public body and the prompt still contain `Zq8LatinNoise88ab`, while `Order FE10482931` survives. R20 closes that echo and, on the same path, deletes the order ID.

The single-process R19 full run also failed these six, because an earlier preserve case had stored `FE10482931` in the process-global remembered-secret set. That is why the sealed diff lists only three candidate-only ids. The fresh-process recheck is the one that separates the behaviors.

### Recovery still rewrites the note on comment 400, 403, 404, and 409

All 60 R20 recovery failures are `C-{en,hi,ur,ar,rom}-{fin,welcome,later}-{400,403,404,409}`. Example `C-en-fin-400`: the only miss is `lastNotes got 1 want 0`. The last public comment is `A teammate now has this conversation.` Assignment was not repeated. The same 60 fail on R19, where the miss is often harsher (assignment not recorded). They are pre-existing relative to R19, and they still miss the absolute recovery gate.

`commentMiss` in `fixedMessageHandoff.js` is true only for `commentRejected` of `422`, `429`, `500`, and `timeout`. The other 4xx values take the path that writes the internal note again while posting the owed customer line once.

### Pre-existing misses inside the 15 product-critical

`K-model-3` fails on R20 and on R19, including in fresh processes. The stub was `Track it at <challenge article URL> using order FE10482931.` The posted body is the number hedge: `I can't confirm that figure from the approved details, so I won't guess a number.` The URL and the order ID are withheld.

`K-customer-0` through `K-customer-4` fail on both runtimes. The customer text contains the challenge article URL, so the challenge article is posted and the stub reply is not. On the long R19 process the posted article had replaced the word `criteria` with `[secret]` after password-policy turns had remembered that word. The R20 article keeps `criteria`. That is an FAQ-byte improvement. The cases still fail the order-ID and prompt expects because the article preempts the stub.

## Verdict

**NEEDS CHANGES.** The language matrix, the password-policy paths, the exact FAQ bytes, the figure evidence rule, the 422/5xx/timeout recovery, the wiped-store and restart behavior, and the absence of the sealed secrets all hold, and the author suites R2–R20 pass. The release gates do not. Alphanumeric order IDs and order-ID URL segments are replaced with `[secret]` in approved public bodies, including non-handoff replies that must show the order ID. Comment HTTP 400, 403, 404, and 409 still write a second internal note. Those are the changes this candidate still needs. This file is a review record only.
