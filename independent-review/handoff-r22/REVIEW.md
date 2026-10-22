# Independent review: Handoff R22

**Verdict: NEEDS CHANGES**

Candidate `998e9d5abdf48a35fdd4c4baa4718f20f5d2f217` on `cursor/t800-handoff-r22` (PR #107). Baselines R21 `49e500757ba0e76ba546217c00275f28f9fee86c` and R20 `0d9af3733d48cd7a59ca20dab8e3a00531e2ca6d`. This review is a separate branch. Staging only: no merge, deploy, VPS, Intercom, production secrets, or `.env` / bot-control / key stores.

The three requested behaviors hold on the sealed set: Roman Urdu filler ties lock the Urdu handoff line, a fresh `conversation.user.replied` password-policy question posts the clarifier, and order ids, receipt URLs, and customer-stated MT5 logins stay in the draft. Declared-secret reuse in the same process scrubs the secret and keeps the order id. FAQ replies are byte-exact, including U+200B. Eligible MT5 spread asks post the 55188 template; ineligible echoes become the hedge. The five-attempt comment bound stops on R22. The network tripwire recorded 0 hits and 0 worker errors across 1183 turns.

The number-gate exemption is wider than order, invoice, receipt, and customer-stated logins. `presendMega.js` treats any 1–6 letter prefix plus 5–12 digits as an order id (`/\b[A-Za-z]{1,6}(\d{5,12})\b/`). An unstated `Login`, `MT5`, or `acct` token therefore survives. R21 and R20 still replace those drafts with the checking line. Twelve cases fail only on R22. That is a product-critical regression. The posted tokens are account-shaped numbers the customer did not state. This review does not class them as credential disclosures.

## Seal

`cases.json` was written and committed before any `handleWebhook` run, then left unchanged.

| Item | Value |
| --- | --- |
| SHA-256 | `f8f5db46c4cced66fdcf1b26db03d296d4746520f47bb0efcc9acc87f41e4343` |
| Git commit | `44312008a382840135b2d517347febfabbff894c` |
| Seal commit | `e7df791b64f35b37caff702b5a2b78666b2ea95f` (`SEAL.txt`) |
| Cases | 958 |
| Recheck after the full run | same SHA-256 |

Buckets: language 238, password 290, numbers 166, secrets 20, adversarial 48, mt5 28, faq 19, recovery 139, duplicates 10. Gate tags overlap. Every case is product-critical. Leaks 98, over-redaction 134, duplicates 144, recovery 139.

An early smoke reused a previous conversation's assignee and silenced the next handoff. The worker was corrected so only a named non-zero assignee carries between turns. `cases.json` was already sealed and was not edited. The numbers below are from the full run after that correction (49,335 ms).

## How the set was run

Each version ran the real `handleWebhook` in its own process. The transport records comment, note, and assignment bodies and statuses. The model returns the case's stub reply. `net`, `http`, `https`, `dns`, `dgram`, and `fetch` throw `NETWORK_TRIPWIRE`. Axios, OpenAI, Express, and dotenv are module mocks, so the recording path is the only HTTP client. A `freshProcess` segment starts a second worker on the same state directory, so the op store and ticket file survive and in-memory secrets do not. R22, R21, and R20 saw the same 958 cases.

## Author report and file hashes

Author report `luna-current/10_synthetic_lanes/fixed-message-handoff-r22/FM_R22_REPORT.md`:

`115019cb139afeee24dd340e87a1b60c24aed3f177513ba8fb0c5a6b24f5f04f` — **match**.

Every hash in the report table matches the file at `998e9d5`. `fundedelite-faqs.md` and `system-prompt.txt`, cited in the report prose, also match (`8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92` and `bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d`). The FAQ hash is identical on R20, R21, and R22.

| File | SHA-256 | Check |
| --- | --- | --- |
| `01_runtime/fixedMessageHandoff.js` | `5f1b08cc998309891f52069e3c2ea5fe09316b5494e531b5963818eb261a1e3d` | match |
| `01_runtime/index.js` | `e32c3652480026705f327be24ee6fdf51bfe76516a4f34533a1154870f731184` | match |
| `02_statePresend/presendMega.js` | `26268375d49673c6e803e731d94b77049347ede5c6235944fa81f5fcbf7fb1b1` | match |
| `01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` | match |
| `01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` | match |
| `02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` | match |
| `fixed-message-handoff-r22/fixedMessageHandoff.test.js` | `3c916dcf0964d4d6bde7ee50106bc8c5d0dd17f00958c867f45b0855c1a0fd18` | match |
| `fixed-message-handoff-r21/fixedMessageHandoff.test.js` | `3b8cf81096a752e3ae2541506d22395e3e5f5fb5d5a720022d486c18f6b2d0fb` | match |
| `02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` | match |
| `02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` | match |
| `01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` | match |
| `02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` | match |

`writeOpStore.js`, `faq-kb.js`, `policyEvidence.js`, `statePresend.js`, `credentialSanitizer.js`, `escalateRelatedOnly.js`, and `targetedRegeneration.js` are byte-identical on R20, R21, and R22. `presendMega.js` is identical on R20 and R21 and differs on R22. `fixedMessageHandoff.js` and `index.js` differ on all three.

## Gate table

Raw fail counts include misses that R21 and R20 share. Candidate-only means R22 fails and both baselines pass.

| Gate | R22 raw | R21 raw | R20 raw | Candidate-only |
| --- | ---: | ---: | ---: | ---: |
| Product-critical | 928 pass / 30 fail | 639 / 319 | 577 / 381 | 12 |
| Leaks (disclosure) | 0 disclosed (8 raw fails are silence) | 27 raw fails | 35 raw fails | 0 |
| Over-redaction | 8 raw fails, all silent restart turns | 114 | 134 | 0 |
| Duplicates | 5 raw fails | 40 | 82 | 0 |
| Recovery failures | 5 raw fails | 38 | 80 | 0 |
| Candidate-only regressions | 12 | 0 vs this set | 0 vs this set | 12 |

R22 fixes 301 cases that R21 fails, including all 80 fresh `user.replied` password cases, 73 Roman Urdu filler ties, 94 structural-number drafts, and all 12 same-process declared-secret cases. Cases where R21 passes and R22 fails, outside the 12 prefix-width rows: **0**.

The 18 shared misses (R22 and R21 both fail):

- `secret-restart-history-0` … `7` — after a subprocess restart the second turn posts nothing. The declared pin does not appear.
- `rec-429-en` — the recording transport stores three identical comment bodies because a 429 is retried inside the client (statuses 429, 429, 429). The following turn posts the owed line once. R20 does the same.
- `wiped-store-ur`, `wiped-store-hi`, `wiped-store-ar`, `wiped-store-it` — latest text is "any update?" and the original request is only `source.body`. All three versions post the English line. `wiped-store-en` passes.
- `lang-hinglish-2` — "kripya mujhe agent chahiye" posts the Hindi line on all three versions.
- `lang-hinglish2-1`, `lang-hinglish2-old-1` — "assalam mujhe kisi se baat karna hai" is silent on all three.
- `lang-it-1`, `lang-it-2` — "buongiorno voglio parlare con un umano" and "salve vorrei un agente" are silent on all three.

## Candidate-only regressions

All 12 are target `r22-prefix-width`. The customer stated one login. The stub model emitted a different prefixed token. R22 posted that token. R21 and R20 posted the checking line and omitted the number.

| Case | R22 posted | R21 and R20 posted |
| --- | --- | --- |
| `num-wide-prefix-0` | `Login11261000` | checking line |
| `num-wide-prefix-2` | `MT511261194` | checking line |
| `num-wide-prefix-3` | `acct11261291` | checking line |
| `num-wide-prefix-4`, `8`, `12` | `Login…` | checking line |
| `num-wide-prefix-6`, `10`, `14` | `MT5…` | checking line |
| `num-wide-prefix-7`, `11`, `15` | `acct…` | checking line |

`num-wide-prefix-1` uses `Account11261097` (seven letters). R22, R21, and R20 all post "Thanks for the details. I am checking this now and will update you here shortly." and omit the number. The same holds for the other `Account` rows in that series.

Customer text for `num-wide-prefix-0`: "what are the trading days? my login is 11164000". Stub draft: "Trading days are Monday through Friday. Login11261000." R22 reply:

`Hello Sam,<br><br>Trading days are Monday through Friday. Login11261000.`

## Examples

**Urdu filler tie.** "janab please mujhe agent chahiye" (`lang-urdu-tie-0`). R22 posts "یہ گفتگو اب ایک ساتھی کے پاس ہے۔" with a note and an assignment. R21 and R20 post "A teammate now has this conversation." "please get me a human" and "janab please get me a human" stay on the English line on R22.

**Fresh password question.** `conversation.user.replied`, age 1 second, "What password criteria do you use?" (`pw-replied-fresh-0-1`). R22 posts "Which part of the password policy should I explain?" R21 and R20 post nothing. The same question on `conversation.user.created` posts the clarifier on all three. An older `user.replied` (age 180) also posts the clarifier on all three, through the later path.

**Structural numbers.** `num-structural-0`, customer stated logins 10194000 and 10291000 and order `FE10388000`. R22 keeps both logins, `FE10388000`, both receipt URLs, and `MT510194000`, and does not use the checking line. R21 and R20 replace the whole draft with the checking line.

**Declared secret, same process.** `secret-reuse-0`: "pin: FE11358000" with order `FE11455000` and login 11552000. R22 turn 0 keeps the order and the login and replaces the pin with `[secret]`. Turn 1, which mentions the pin again with no label, still posts `[secret]` and keeps `FE11455000`. R21 turn 0 becomes the checking line because the order id was still a foreign number; turn 1 still scrubs the pin and keeps the order. R20 turn 1 also replaces the unlabeled order id with `[secret]`.

**Declared secret after restart.** `secret-restart-history-0` turn 0 on R22 scrubs the pin and keeps `FE11746000`. The next segment is a new process whose history part repeats the labeled pin. All three versions post no comment. The pin value does not appear.

**Credential adversarials.** A ZWSP inside the label (`pass​word:`) and a Cyrillic `а` in `pаssword:` both become `[secret]` on R22, R21, and R20. The raw values are absent from the comment, the note, and the model prompt.

**MT5 55188.** Eligible "what are the spreads?" on `user.created` posts the spread template on all three versions, including account 55188, server Fundedelite-Server, and password `QBG5FetfozKz7^a?J!`. An ineligible "what are the trading days?" whose model echoes that template becomes "I can't confirm that figure from the approved details, so I won't guess a number." The account and the password are absent. 55188 on an eligible ask is the approved template.

**FAQ bytes.** "How does the challenge work?" (`faq-exact-0`) matches the approved article on all three versions: 664 bytes, including the U+200B after "Trading Rules". The stub paraphrase and `[secret]` are absent.

**Recovery.** `rec-400-en`: a 400 on the fixed line leaves the line owed; the next turn posts it once and does not repeat the note or the assignment. `bound-400-en`: five failed comment attempts, then the sixth turn posts nothing and the owed line remains. R21 matches that stop. R20 still posts the line on the sixth turn and rewrites the note on each retry. `removed-note-en` and `removed-note-ur` complete with one fixed line after the note is gone. `human-during-400`: a human public comment on the recovery turn produces no bot comment, note, or assignment. `dup-redelivery-en`: the second delivery of the same handoff posts nothing. `note-fail-500` and `note-fail-timeout` post no customer comment on the failed note turn and complete on the next turn.

**429 duplicate recording.** `rec-429-en` stores three identical bodies, all status 429, then one successful owed line. That pattern is the same on R22, R21, and R20. It is an in-client retry of a failed write, recorded three times, and the duplicate gate flags it on every version.

## What would clear NEEDS CHANGES

Narrow the order-id exemption so a 1–6 letter prefix is an order id only with an order, invoice, or receipt label, or when the customer wrote that digit run. `Login`, `MT5`, and `acct` glued to an unstated number should take the checking line, as they do on R21 and R20. `Account` (seven letters) already does. The Urdu tie, the fresh `user.replied` password clarifier, structural order and receipt handling, same-process secret reuse, the 55188 eligibility split, FAQ bytes, and the five-attempt bound can stay as they ran here.
