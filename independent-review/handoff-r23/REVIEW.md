# Independent review — Handoff R23

**Verdict: NEEDS CHANGES**

Reviewer is not the author. This review did not read any `review/*` branch or any other `independent-review/` tree. Staging only: no merge, no deploy, no VPS, no Intercom, and no production secrets, `.env`, `bot-control`, or key stores.

| Item | Value |
|---|---|
| Candidate | `b3398bbeb92149ddd386ccd9c1b1f97cb749573b` (`cursor/t800-handoff-r23`, PR #109) |
| Baselines | R22 `998e9d5abdf48a35fdd4c4baa4718f20f5d2f217`, R21 `49e500757ba0e76ba546217c00275f28f9fee86c` |
| Sealed set | 962 cases, SHA-256 `412651bb53c4f38b0dec6e452fe5c7db94a208112312eff3be3d95774f9c76a8` |
| Seal commit | `ea625ff632f4e590c5f08bacc55332d76572124f`, recorded before any `handleWebhook` run |
| Author report | `FM_R23_REPORT.md` SHA-256 `8e36e934577af68d6b798d0f8af407887a7cc1a6ba3cb199acc76db9ffb45773` — matches |

`cases.json` was not edited after the seal. Its git blob is still `43c69a26ffb85b57df3cb7acf7c6bce6ae36df59`, and the SHA-256 above was rechecked after the webhook run.

## Gate table

Counts are product failures on R23. Oracle mismatches are listed later and are excluded. A candidate-only regression is a sealed-oracle failure on R23 where both R22 and R21 pass.

| Gate | Count | Candidate-only | Cases |
|---|---:|---:|---|
| Product-critical | 2 | 0 | `numbers-0010`, `numbers-0012` |
| Leaks | 1 | 0 | `secrets-0033` |
| Over-redaction | 3 | 0 | `numbers-0010`, `numbers-0012`, `secrets-0034` |
| Duplicates | 0 | 0 | — |
| Recovery failures | 0 | 0 | 353/353 recovery cases passed |
| Candidate-only regressions | 0 | 0 | none |

The two product-critical cases are the same two over-redactions. They are one incident class, counted in both rows because the customer-visible login is wrong and the token was replaced with `[secret]`.

Raw sealed-oracle scores, including oracle mismatches: R23 898/962, R22 646/962, R21 658/962. Of the 64 R23 failures, 60 are oracle mismatches and 4 are the gated cases above. All 63 cases that fail on every version, plus the one asymmetric case, are accounted for below. Network tripwire failures: 0.

## What has to change

### Stated `account` + digits is replaced with `[secret]`

R23's account-prefix rule treats `login`, `acct`, `account`, `mt5`, `mt4`, `id`, `user`, and `no` glued to digits as account numbers, and the freeze report says those tokens pass when the customer stated them. `Login`, `acct`, `MT5`, `id`, `user`, and `no` do pass when stated (`numbers-0002`, `numbers-0008`, `numbers-0014`, `numbers-0022`, `numbers-0026`, `numbers-0030`). The seven-letter prefix `account` does not.

`isStructuralId` accepts all digits, `MT5` plus digits, or 1–6 letters glued to at least five digits. `account11261292` has a seven-letter prefix, so `isUnlabeledSecret` stores it and the outbound reply replaces that token with `[secret]`. The presend contradiction check would have kept the draft: the customer stated the token, and the order id and receipt URL survive.

`numbers-0010`. Customer: `what are the trading days? my login is account11261292`. Draft includes `account11261292 order FE10482931` and the receipt URL. R23 comment:

`Hello Sam,<br><br>Trading days are Monday through Friday. [secret] order FE10482931 https://pay.example/receipts/99881122`

`numbers-0012` is the same with `Account11261293`.

R22 posts the same `[secret]` body. R21 also drops `FE10482931` and the receipt URL. This is shared, so it is not a candidate-only regression. It is still a miss of the new prefix list: the author's own webhook test states `Login11261000`, `MT511261194`, and `acct11261291`, and never the word `account`.

### Cyrillic homoglyph label posts the pin

`secrets-0033`. Customer text uses `pаssword:` with U+0430 CYRILLIC SMALL LETTER A in place of the Latin `a`. The draft is `Ref FE81000033.` R23, R22, and R21 all post:

`Hello Sam,<br><br>Trading days are Monday through Friday. Ref FE81000033.`

NFKC plus stripping format characters does not fold that Cyrillic letter, so the password label does not match and the value is not remembered. The sanitizer file hash matches the freeze table and is unchanged from R22. The leak is shared. It is in scope for this review because the sealed set required homoglyph labels, and the value reached the customer comment.

### A ZWSP pin swallows the following order id

`secrets-0034`. Customer: `pin:` plus `FE` + U+200B + `81` + U+200B + `00099`, then `order FE10482931`. The pin itself is scrubbed. The comment is:

`Hello Sam,<br><br>Trading days are Monday through Friday. Ref [secret]`

`FE10482931` is gone. After format characters are stripped, the labeled-value capture takes `FE8100099 order FE10482931` as one secret (`order` is not a stop word), and the later echo replaces that whole span. R22 and R21 do the same. The pin does not appear. This is over-redaction of an unlabeled order id the freeze report says must pass.

## Candidate-only regressions

None. The only R23 failure that R22 passes is `numbers-0034`, and R21 fails it too. R22 passes it because the old 1–6 letter exemption still lets `MT511261194` through. That exemption is the behavior R23 removed: unstated `MT511261194` (`numbers-0013`) stays on the checking line on R23 and is posted by R22.

## Oracle mismatches (excluded from the gates)

The sealed file was not edited to fit these results.

- **52 separator cases** (`secrets-0038` through `secrets-0089`). The oracle required `50123456` in the comment. The stub draft was `Ref <secret> order FE10482931` and never contained `50123456`. All 52 comments contain `[secret]`, keep `FE10482931`, and do not contain the pin. All three versions fail the same way.
- **`password-0051` and `password-0052`.** The asks are `what is your refund policy?` and `how do payouts work?`. The oracle required the stub sentence `published schedule`. R23 posted the refund FAQ body and the payout FAQ body. No password clarifier and no locked handoff line. Shared.
- **`password-0053`.** Ask: `what are the trading days?` Stub: `Payouts follow the published schedule.` All three versions posted the hedge line. The dedicated FAQ byte-exact cases passed separately.
- **`account-0010`, `account-0011`, `account-0012`.** Asks: `are you a bot?`, `are you a real human?`, `are you ai or human?` on `conversation.user.created`. The oracle required the identity sentence with no welcome prefix. The posted body is `Hello Sam,<br><br>` plus that sentence. No handoff, no note, no assignment. Shared.
- **`numbers-0034`.** Customer stated `11261194`. Draft was `MT511261194`. The oracle required `11261194` to remain. R23 and R21 posted the checking line. The implementation's own comment says `MT511261194` is not covered by a different number: `extractAccountNumbers` reads the trailing run `511261194`, and a stated `11261194` does not put that run in the supported set. Sister cases match that rule and pass: stating the whole token `MT511261194` keeps it (`numbers-0014`); stating `50123456` keeps `MT50123456` (`numbers-0033`); stating `50123456` blocks `MT511261194` (`numbers-0035`). The freeze prose also says the digits glued to `mt5` count as the account, which would have let `11261194` cover this token. The author's webhook test states the whole token, which is the rule the passing sisters follow. Counted as an oracle over-claim, with that prose tension left visible.
- **`mt5-0021`.** Ask: `what is my mt5 login password for account 50123456`, with the model returning the spread template. The oracle required the hedge. R23 posted the account-number line. `55188` and `QBG5FetfozKz7^a?J!` are absent. Eligible spread asks (`mt5-0001` through `mt5-0016`) post the template byte-exact. The other ineligible and near-miss asks (`mt5-0017` through `mt5-0020`, `mt5-0022` through `mt5-0025`) hedge and do not post `55188`. Shared.

## What held

Recovery, 353/353 on R23. Each non-2xx and timeout comment failure records one attempt and the next turn posts the owed line once, with no second note and no second assignment. Covered statuses: 400, 403, 404, 409, 422, 429, 500, timeout, 401, 408, 502, 503.

- `recovery-0126` (write 429): first turn `429` plus one note and one assignment; second turn `200` `A teammate now has this conversation.` with no note and no assignment. R22 posts `429` and `200` inside the same call.
- `recovery-0301` (five-attempt bound): five `400` comments, then the sixth turn posts nothing.
- `recovery-0309`: removed note, assignment remains, owed line posts once.
- `recovery-0310`: a human comment during recovery posts no owed line.
- `recovery-0334`: wiped store, latest text a status ping, Urdu source, Urdu locked line. R22 fails this case.
- `recovery-0343`: subprocess exit 86, then the next process posts the owed English line once.
- `recovery-0344`: after the line lands, the next turn does not post it again.

Multilingual handoff, 279/279. English 142, Urdu (including Hinglish and Roman Urdu) 76, Italian 22, Hindi 18, Arabic 10, plus 11 waits that correctly post nothing. Examples that R22 misses and R23 posts: `kripya please sir mujhe agent chahiye` → Urdu line; `assalam mujhe kisi se baat karna hai` → Urdu line; `Vorrei parlare con un umano` → English line; `voglio un operatore` → Italian line. English filler ties (`please sir talk to a human`) stay English. Greeting-led `hello sir I need an agent` hands off in English. Bare `assalam` and bare `kisi` stay in the Fin wait.

Password policy: fresh `conversation.user.created` and fresh `conversation.user.replied` both post `Which part of the password policy should I explain?` with no handoff (`password-0001`, `password-0002`, and the same pair for the other policy wordings). 50/53 passed; the three failures are the oracle mismatches above.

Numbers other than the two `account` tokens: unstated `Login` / `MT5` / `acct` / `id` / `user` / `no` prefixes go to the checking line; the same tokens pass when the customer stated them; FE order ids and receipt-URL digit runs stay; bare unstated numbers go to the checking line. 140/143 passed.

Declared secrets across a restart: `secrets-0036` dies on the comment (exit 86) and the next process posts the owed line with `FE82000000` absent. `secrets-0037` reuses `FE83000000` as `[secret]` after a new process and still posts unlabeled `FE10482931`.

FAQ byte-exactness: 8/8, including the daily-loss body, profit target, leverage, challenge, and a password-policy turn that does not rewrite the next FAQ article.

MT5 `55188`: the template password appears only on the 16 eligible spread-check cases, all of which passed. No other R23 comment contains `55188`.

## Author hashes

`FM_R23_REPORT.md` SHA-256 is `8e36e934577af68d6b798d0f8af407887a7cc1a6ba3cb199acc76db9ffb45773`. Every hash in the report table matches the file at `b3398bb`:

| File | SHA-256 | |
|---|---|---|
| `luna-current/01_runtime/fixedMessageHandoff.js` | `b2dd80e2a4580f498893329ea7185a277dd7129a7de6fadeb22c93689c4ace8e` | match |
| `luna-current/01_runtime/index.js` | `235a69b785740655e18962ec6a74acdb6162f18d6900235b9ea449ae6a74759e` | match |
| `luna-current/02_statePresend/presendMega.js` | `b2706eac5141eb55b1c8b8f385c75f69ab3573bb38e0d5fea6e345ea5a61dedc` | match |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` | match |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` | match |
| `luna-current/02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` | match |
| `fixed-message-handoff-r23/fixedMessageHandoff.test.js` | `f9397d02f71f155ee0d01b043cef306d6ac11c2d8d94b3286a000308d97c03bc` | match |
| `fixed-message-handoff-r22/fixedMessageHandoff.test.js` | `3c916dcf0964d4d6bde7ee50106bc8c5d0dd17f00958c867f45b0855c1a0fd18` | match |
| `fixed-message-handoff-r21/fixedMessageHandoff.test.js` | `3b8cf81096a752e3ae2541506d22395e3e5f5fb5d5a720022d486c18f6b2d0fb` | match |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` | match |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` | match |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` | match |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` | match |

`system-prompt.txt` `bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d` and `fundedelite-faqs.md` `8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92` match the report prose.

## How the set was run

`generate-cases.js` writes the cases without importing `index.js` and without calling `handleWebhook`. It loads `faq-kb.js` only to copy sealed FAQ bytes, behind a local axios stub. Counts: multilingual 279, recovery 353, numbers 143, secrets 89, password 53, mt5 25, account 12, faq 8.

`run-review.js` loads the real `handleWebhook` from each detached worktree. The worker installs an HTTP, HTTPS, and DNS tripwire, mocks axios, openai, express, and dotenv, points state files at a wiped temp directory, and sets a synthetic API key and a synthetic Intercom token. The model reply is the case's stub. `dieOnComment` cases exit 86 so the next phase is a new process on the same state directory. Duplicate detection counts an HTTP 200 comment whose body equals or contains a locked line. The parent runs a pool of four with a 45 second timeout per case and does not pass the parent environment through.

R23 elapsed about 27s, R22 about 34s, R21 about 35s. Per-case signatures are in `results/raw-summary.json`. The gate counts are in `results/summary.json`.
