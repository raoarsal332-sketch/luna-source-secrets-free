# Independent review — fixed-message handoff R21

**Verdict: NEEDS CHANGES**

Reviewer is independent of the author. Candidate `49e500757ba0e76ba546217c00275f28f9fee86c` on `cursor/t800-handoff-r21` (PR #105). No merge, deploy, VPS, Intercom, or production secret was used. No `review/*` branch was read.

A pass needs every gate at zero. Product-critical is 17 and literal over-redaction is 38, so the candidate does not pass.

Leaks, duplicate posts and assignments, recovery failures, and candidate-only regressions versus R19 and R20 are all 0. The 55 cases that fail here also fail on R20 and on R19. The R21 recovery change holds on this set. That is why the verdict is needs-changes rather than fail.

## Scorer pass rate

Literal sealed scorer, same 943 cases, fresh process per group:

| Runtime | Commit | Passed | Rate |
|---|---|---|---|
| R21 (candidate) | `49e500757ba0e76ba546217c00275f28f9fee86c` | 888/943 | 94.2% |
| R20 | `0d9af3733d48cd7a59ca20dab8e3a00531e2ca6d` | 836/943 | 88.7% |
| R19 | `6bb9e2dcb3fdc71e4f67444c8b2e4ea3a2894779` | 677/943 | 71.8% |

R21 fixes 52 cases versus R20 and 211 cases versus R19. Candidate-only regressions versus R20: 0. Versus R19: 0.

The 52 fixes versus R20 are all recovery: 5 new comment statuses in each of six language groups (30) and the five-attempt bound in English and Urdu (22). R20 scored `recovery-bound-en` and `recovery-bound-ur` at 0/11, and each language recovery group at 37/42.

## Gates

| Gate | Count | Result |
|---|---|---|
| Product-critical | 17 | open |
| Leaks | 0 | holds |
| Over-redaction (literal) | 38 | open |
| Duplicate posts or assignments | 0 | holds |
| Recovery failures | 0 | holds |
| Candidate-only regressions vs R19/R20 | 0 | holds |
| Unexpected sockets | 0 | holds |
| Author suites R2–R21 | all exit 0 | holds |
| Repair selftests | 2 failures, both pre-existing | holds |

## Report and file hashes

`luna-current/10_synthetic_lanes/fixed-message-handoff-r21/FM_R21_REPORT.md` at the candidate commit is 7827 bytes. SHA-256 `6e922542d642cf48a0a4ed287acf3f2073606a0f1f0fe7aaa2a3e5b09c9da425` matches.

Every file hash listed in that report matches the blob at `49e500757`:

| File | SHA-256 | |
|---|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `89d905230bacb250a28c896320efe855e3f960bc66ed3009f870ce8c386c5d43` | match |
| `luna-current/01_runtime/index.js` | `ae9520bb5faacb01f773a59ffe613cb171edbd152fa3be2abb5628a0a94eaf3a` | match |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` | match |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` | match |
| `luna-current/02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` | match |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r21/fixedMessageHandoff.test.js` | `3b8cf81096a752e3ae2541506d22395e3e5f5fb5d5a720022d486c18f6b2d0fb` | match |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r20/fixedMessageHandoff.test.js` | `601f7e2d41a101ca920c9acdf19b4c6713fe6fe6bf2a03abebb95620f4b11100` | match |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r19/fixedMessageHandoff.test.js` | `5721dfc7b1f7e237369806f1983f2b9962c09155ca27c5e6526a0d4ecd0fb24b` | match |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` | match |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` | match |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` | match |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` | match |

`node --check` passed on `fixedMessageHandoff.js` and `index.js` at that commit.

## Sealed set

Written and committed **before** any `handleWebhook` call, on `0096bcda42b3ea1214be4b63e613938f76623f41`.

- File: `independent-review/handoff-r21/sealed/cases.json`
- SHA-256: `b0034a41bc7ac0ff3d2f5197cba685fd00a58a9d949a8c3b6faf3e046c5ea5e9`
- 943 cases, 296 recovery. Header `seal` is `independent-handoff-r21` and `candidateNotRun` is true.
- Kinds: handoff 261, secret 204, over 38, password 96, recovery 296, duplicate 18, faq 14, figure 16.

`cases.json` was not edited after that commit. The harness clock change below is a later commit and does not move this hash.

The world clock used to start ten seconds behind the opening user part. The first multi-turn case in a fresh process then attached a later user part with an earlier `created_at`, and `checkSendBoundary` dropped the draft as stale. `catchUp` now raises the clock to the newest part time before `handleWebhook`. After that fix, the FAQ group is 14/14, including the article that follows a secret turn. That miss was a harness bug.

## How it was run

Real `handleWebhook` from the candidate worktree, one new Node process per case group, plus a second process for each restart turn. Recording transport keeps `{method, url, data}` for `api.intercom.io` only. The model is a stub. `http.request`, `https.request`, `net.connect`, `fetch`, and the matching getters are tripwired. Calls to `faq.fundedelite.com` are blocked inside the mock and are not scored as product failures. Sockets observed: 0.

Approved lines used as the oracle (sealed in the case file, not read back from the runtime under test):

- en: `A teammate now has this conversation.`
- ur: `یہ گفتگو اب ایک ساتھی کے پاس ہے۔`
- ar: `هذه المحادثة الآن لدى أحد الزملاء.`
- hi: `यह बातचीत अब एक साथी के पास है।`
- Password clarifier: `Which part of the password policy should I explain?`

Hinglish and Roman Urdu expect the Urdu line. Synthetic secret tokens are fixed-width `Z9kQ########` and `N8pL########`. No live credential was used.

## Product-critical (17)

All 17 also fail on R20 and on R19. Each still writes exactly one note, one assignment, and one public comment when it posts. The defect is the wrong line, or silence.

### Wrong language (5)

`detectLatinLanguage` scores `janab` as Urdu and `please` as English. Both scores are 1. The winner starts as English and a non-English language replaces it only when its score is strictly greater, so English wins the tie. The Hinglish fallback requires the Urdu score to be 0, so it does not apply. The public body is the English line. The expected body is the Urdu line.

| Case | Stage | Customer text | Posted |
|---|---|---|---|
| `h-roman-finwait-0063` | `conversation.user.created`, age 5 | `janab please mujhe agent chahiye` | `A teammate now has this conversation.` |
| `h-roman-welcome-0064` | `conversation.user.replied`, age 400 | same | same English line |
| `h-roman-later-0065` | `conversation.user.replied`, age 1000, prior bot | same | same English line |
| `hs-roman-finwait-0303` | fin-wait, with labeled and unlabeled secrets | same phrase plus secrets | same English line, secrets absent |
| `hs-roman-later-0304` | later, with secrets | same | same English line, secrets absent |

Other Roman phrases in the same groups pass, including `janab mujhe agent chahiye` (no `please`) and the typo `janab mujhe agent chahiyee`. English, Urdu, Arabic, Hindi, Hinglish, and Latin role words inside Arabic or Urdu script are exact on fin-wait, welcome, and later turns: `handoff-en` 48/48, `handoff-ur` 30/30, `handoff-ar` 30/30, `handoff-hi` 42/42, `handoff-hinglish` 36/36, `handoff-mix-ar` 18/18, `handoff-mix-ur` 21/21. `handoff-roman` is 33/36. Secret handoff groups match that pattern: only the two `janab please` cases fail, and they fail on language, not on a leak.

### Password policy silent on a fresh reply (12)

`password-fresh` is 0/12. Every case is `conversation.user.replied` with `createdAgo` 5, inside `FIN_FRESH_CONV_SEC` (120). The turn posts nothing: comment count 0, body empty. The expected line is `Which part of the password policy should I explain?`

Examples: `pw-fresh-reply-0510` (`What password criteria do you use?`), `pw-fresh-reply-0518` (`what is the password policy?`), `pw-fresh-reply-0582` (`wht is the password policy?`), `pw-fresh-reply-0598` (`Sir, can you explain the password policy in simple words?`).

The clarifier does post on `conversation.user.created` (`password-finwait` 24/24), on welcome replies at age 400 (`password-welcome` 24/24), and on later turns with a prior bot (`password-later` 36/36). The R20/R21 password path covers `conversation.user.created`. A fresh `conversation.user.replied` is still swallowed by the Fin wait. The same twelve cases are silent on R19 and R20.

## Over-redaction (literal 38/38)

Every over-redaction case fails the byte-exact scorer. The substantive miss is a labeled value whose shape is an order id (`pin: FE########`). `credentialSanitizer` redacts labeled values before the structural-id exemption, so `isStructuralId` does not keep them. Real unlabeled order ids, numeric ids, receipt URLs, and MT5 logins stay in the handoff note.

`over-note-00` note body (truncated only at the review's quote of the recorded payload):

`<!-- LUNA_HANDOFF_NOTE -->... please get me a human order FE31000000 numeric 41000000 receipt https://pay.example/receipts/FE31000000 mt5 51000000 pin: [secret`

The scorer's only note miss on that case is `FE81000000`. The same pattern holds for `over-note-00` through `over-note-11` (12/12).

Two further splits inside the literal 38:

- **24 public cases** (`over-public-00` … `over-public-23`). The public body is the presend fallback `Thanks for the details. I am checking this now and will update you here shortly.` Several 8-digit numbers in one draft trip `CONVERSATION_CONTRADICTION`, so the whole draft is replaced. That is a stimulus artifact, not a per-token scrub of the order id. The prompt for `over-public-00` still contains `FE30000000`, `40000000`, the receipt URL, `50000000`, `MT56000000`, and `TKT700000`. The prompt loses the labeled pin `FE80000000`, the model sentence `Trading days are Monday through Friday.`, and the model-only token `KbKeep0000x7`. Those last two strings are model output, not customer text, so requiring them in the prompt is an oracle miss. The public fallback still makes the literal case fail.
- **Lookalike order id.** `over-lookalike-then-order` sends `pin: FE55443322`. The public body is `Trading days are Monday through Friday. pin [secret]`. The prompt also drops `FE55443322`. `over-lookalike-reused-as-order` is the next case in the same process and sends `order FE55443322` with no label. The public body is `Trading days are Monday through Friday. order [secret]`. The value was remembered from the labeled turn and then scrubbed when the customer used the same bytes as an order id. Inbound secret memory is process-global. A secret value that resembles an order id does not pass byte-exact.

The literal over-redaction gate stays non-zero because of that labeled order-shaped value. The same 38 cases fail on R20 and R19.

## What holds

- **Leaks: 0.** `secrets-public` 30/30. Labeled and unlabeled customer secrets are absent from the prompt, the note, the assignment, and every public body, including non-handoff replies. The five wrong-language handoffs still kept the secret tokens out of the English line, the note, and the prompt.
- **Duplicates: 0.** `duplicates` 18/18. One note, one assignment, one public post. A 429 turn may attempt the comment more than once inside `icRequest` (`IC_MAX_RETRY` 2). The sealed scorer allows 1–3 identical comment bodies on that status, and those cases passed. There is no second note and no repeat assignment.
- **Recovery: 296/296.** Statuses 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, and timeout. Each failed comment leaves one owed line, writes no second note, and does not repeat the assignment. The next turn posts that line. Removed note, wiped op store, a real subprocess restart, a human comment during recovery (Casey `424242`), and duplicate redelivery are included. After five failed comment attempts the next turn posts nothing and the owed line remains (`recovery-bound-en` 11/11, `recovery-bound-ur` 11/11, covering every status above). `recovery-restart` 22/22.
- **FAQ bytes: 14/14**, including the article after a secret turn. The sealed body matches the article, including U+200B.
- **Figures: 16/16.** Supported DLL/MLL figures post. Invented figures are withheld.
- **Handoff once.** Where the language is correct, fin-wait, welcome, and later turns post exactly one fixed line in English, Roman Urdu, Urdu, Arabic, Hindi, or Hinglish, including honorifics, typos, long sentences, and Latin role words inside another script.

## Author suites

Re-run on the candidate worktree in this review. Each command exited 0.

| Suite | Result |
|---|---|
| R2 | 16 passed |
| R3 | 33 passed |
| R4 | 10 passed |
| R5 | 8 passed |
| R6 | 9 passed |
| R7 | 9 passed |
| R8 | 7 passed |
| R9 | 5 passed |
| R10 | 7 passed |
| R11 | 5 passed |
| R12 | 6 passed |
| R13 | 3 passed |
| R14 | 10 passed |
| R15 | 3 passed |
| R16 | 4 passed |
| R17 | 5 passed |
| R18 | 3 passed |
| R19 | 4 passed |
| R20 | 6 passed |
| R21 | 10 passed |

`luna-current/08_repair_tests/run-suite.js` on the same tree: `hashFail 0`, `syntaxFail 0`, `adversarialFail 0`, `selftestFail 2`. The two failures are `selftest-identity-before-escalate.js` (missing `I've forwarded this to a teammate`) and `selftest-lock-harden.js` (missing `postProcessModelReply(lockedFinHandoffWelcome`). Both source strings are also absent from the R20 tree. They are pre-existing.

## Changes that would clear the open gates

1. A Latin tie between an Urdu honorific and an English function word has to select the Urdu handoff line. `janab please mujhe agent chahiye` is the witness, on fin-wait, welcome, and later, with and without a secret in the same sentence.
2. A password-policy question on a fresh `conversation.user.replied` (age under 120 seconds) has to post `Which part of the password policy should I explain?` The clarifier already posts for `conversation.user.created`, welcome, and later.
3. A labeled value that matches an order id (`pin: FE81000000`, `pin: FE55443322`) has to survive byte-exact in the prompt, the note, and the public body, including when a later turn uses those same bytes as an order id. Unlabeled order ids, numeric ids, receipt URLs, MT5 logins, and ticket ids already survive in the note and the prompt.
