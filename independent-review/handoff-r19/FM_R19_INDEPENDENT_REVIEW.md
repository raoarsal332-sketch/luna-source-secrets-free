# Fixed-message handoff R19 — independent review

Verdict: **FAIL**

Candidate: `cursor/t800-handoff-r19` at `6bb9e2dcb3fdc71e4f67444c8b2e4ea3a2894779` (PR #101). This review was written against that commit. It does not approve the candidate and does not authorize a merge, deploy, or release.

The candidate still leaks unlabeled tokens into the customer comment and the model prompt, and it loses the owed customer line when a failed comment is followed by a removed note while the op store is still present. Those two gates are enough for FAIL. The same run also has 121 product-critical cases. It has 0 duplicate posts or assignments and 0 candidate-only regressions against R18 and R17.

## Counts

Official scorer seal `5bfbb9cbc3a9c24350c9ea52dd464035799809d4dbbe23f27314b7a238bacc61` (commit `ec290febc49ecc10ada533ff793c006a160a671b`). 698 cases, 202 recovery. Real `handleWebhook`, recording transport, stub model, network tripwire. Tripwire blocks: 0.

| Gate | Result |
| --- | ---: |
| Scorer pass | 547/698 |
| Product-critical | 121 |
| Leaks | 18 |
| Duplicate posts or assignments | 0 |
| Recovery failures | 14 |
| Candidate-only regressions vs R18 | 0 |
| Candidate-only regressions vs R17 | 0 |
| Soft misses (scorer only) | 24 |

| Group | Cases | Pass | Product | Leak | Duplicate | Recovery |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Handoff | 324 | 222 | 72 | 18 | 0 | 0 |
| Password policy | 96 | 64 | 32 | 0 | 0 | 0 |
| Figures | 32 | 32 | 0 | 0 | 0 | 0 |
| FAQ | 12 | 10 | 2 | 0 | 0 | 0 |
| Silence | 8 | 8 | 0 | 0 | 0 | 0 |
| Owner spoof | 8 | 8 | 0 | 0 | 0 | 0 |
| Write validation | 12 | 12 | 0 | 0 | 0 | 0 |
| Spread | 4 | 3 | 1 | 0 | 0 | 0 |
| Recovery | 202 | 188 | 14 | 0 | 0 | 14 |

Same seal on the parents:

| Tree | Scorer | Product | Leak | Duplicate | Recovery |
| --- | ---: | ---: | ---: | ---: | ---: |
| R19 `6bb9e2d` | 547/698 | 121 | 18 | 0 | 14 |
| R18 `c7fe62e` | 338/698 | 264 | 104 | 2 | 66 |
| R17 `91c1bab` | 319/698 | 298 | 99 | 2 | 66 |

R19 fixes 209 cases that fail on R18. No case passes on R18 and fails on R19. No case passes on both parents and fails on R19.

## What passed

Supported DLL/MLL drafts post as themselves when the evidence is `DLL 5%/3%, MLL 8%.` Invented and wrong-concept figures (`The DLL is 99%.`, `The daily drawdown is 8%.`, `Leverage is 1:500.`) are withheld and the number hedge is posted. 32/32.

`What is the leverage?` posts the 379-byte article, including U+200B, with no `Hello Sam`. `How can I pay for the challenge?` posts exactly `Please tell me which challenge you mean.` on welcome and later, and stays silent during Fin-wait.

Welcome and later password-policy questions are never silent. An empty draft and the number hedge become `Which part of the password policy should I explain?`. A usable draft such as `Passwords must include letters and numbers.` is posted.

Silence while a human, Escalations, or Risk already owns the conversation: 8/8. Owner-spoof notes and comments do not post a customer line and do not write the spoofed secret: 8/8. Malformed assignment, wrong seat, missing seat, note or comment `error.list`, HTTP 400/422/500, and timeout do not land a customer line, and a single turn does not retry the write: 12/12.

The exact spread template is posted byte for byte, including `Password: QBG5FetfozKz7^a?J!`, for `what are the spreads?`, `can you check the spreads`, and `show me the spread test account`.

Recognized handoffs post one note, one assignment, and one locked line. A labeled value on a recognized ask is stored as `password: [secret]`. Replaying a completed handoff, including a second identical customer turn, does not post or assign again. Assignment HTTP 500/timeout stays inside the retry bound and does not send the customer line. A human comment or a foreign assignee during recovery stops the line. Comment 422, 500, and timeout are retried on the next turn when the note is still in the conversation, and the locked language stays put when the follow-up is `thanks`, another language, or a password-policy question.

Author suites R2 through R19 all exit 0 (147 assertions: R2 16, R3 33, R4 10, R5 8, R6 9, R7 9, R8 7, R9 5, R10 7, R11 5, R12 6, R13 3, R14 10, R15 3, R16 4, R17 5, R18 3, R19 4). The repair suite matches the protected prompt and FAQ hashes, syntax-checks clean, and the adversarial file is 58/58. Selftests are 18/20. The two failures are the pre-existing ones: `selftest-identity-before-escalate.js` (the canned `I've forwarded this to a teammate` string is gone) and `selftest-lock-harden.js` (`postProcessModelReply(lockedFinHandoffWelcome` is absent).

## Leaks (18)

An unrecognized handoff falls through to the model. The stub replies with the customer's unlabeled token. `postReply` redacts labeled values and does not redact an unlabeled letter-digit token, so the token is posted. The same token is in the prompt that was sent to the model.

`مجھے agent سے بات کرنی ہے Zq80158kLm` on welcome posts:

```text
السلام علیکم Sam،

MODELSHOULDNOTPOST Zq80158kLm
```

The same shape is posted for Latin `staff` and `banda` inside Urdu, Arabic, and Hindi, on welcome and later. Three scorer-only typos do it too: `please get me a humen`, `janab mujhe agnet chahiye`, and `मुझे agnet से बात करनी है`, each with the noise token on welcome and later. Fin-wait does not call the model, so those turns do not leak.

A recognized handoff does not leak. `I want to talk to an agent password: Zq80015kLm` writes a note whose Problem line is `I want to talk to an agent password: [secret]`, assigns once, and posts `A teammate now has this conversation.` The token is absent from the note, the assignment, the comment, and the prompts.

## Recovery failures (14)

Twelve are removed-note cases. The first turn's comment returns 422, 500, or times out. The note is then deleted from the conversation. On `keep` and on a tickets-only wipe, the next turn posts no customer line and does not rewrite the note (`recovery.dropnote.422.keep.en`: `comments []`, `removed note rewritten 0`). The owed English or Hindi line is lost. Wiping the op store (`ops` or `both`) does redo the handoff, so those 12 pass.

Two more: `please get me a human password: Zq8…kLm` is not detected as a handoff, so recovery has no locked line to resume. With stores kept, the follow-up posts nothing. With both stores wiped, the follow-up posts the model draft `MODELSHOULDNOTPOST`. The token value is redacted in that draft. The same labeled ask in Hindi, Urdu, Arabic, Urdu script, and Roman Urdu does recover the locked line without leaking the token.

## Product-critical misses

### Short English plus a labeled secret

`please get me a human` and `pleas get me a human` post the English line on Fin-wait, welcome, and later, including with an unlabeled token. Appending `password: Zq8…kLm` makes `isHumanAgentRequest` false. After the label and the value are stripped, the detection text is `please get me a human : [ ]` at length 27, past the 24-character short-role cap, and the sentence has no act verb. Welcome then posts `Hello Sam,\n\nMODELSHOULDNOTPOST password`. Later posts the draft without the greeting. Fin-wait posts nothing. `I want to talk to an agent password: …` still hands off, because the role and the act both survive. The spread near-miss `please get me a human password: QBG5FetfozKz7a?J!` is this same miss. The template password does not appear in the outputs.

### Latin role words inside Arabic script, and staff/banda

`devanagariLatinRole` matches Latin `agent` or `human` only when the text also has Devanagari and a Hindi role or act. `मुझे agent से बात करनी है` and `मुझे human चाहिए` post the Hindi line on every turn, with noise or a labeled secret. `romanHinglishHandoff` returns false as soon as Devanagari or Arabic script is present, so Latin `banda` works in Roman Urdu (`mujhe banda chahiye` posts the Urdu line) and does not work inside either script.

These post the model draft, or nothing during Fin-wait, on all three turns and all three adornments:

- `مجھے agent سے بات کرنی ہے`
- `مجھے staff سے بات کرنی ہے`
- `مجھے banda چاہیے`
- `أريد staff الآن من فضلك`
- `मुझे staff से बात करनी है`
- `मुझे banda से बात करनी है`

`أريد human` is detected as a handoff and the locked line is the English one. `detectLanguage` lets the Latin word outweigh the Arabic, so all 9 variants miss the Arabic line `هذه المحادثة الآن لدى أحد الزملاء.` `أريد التحدث إلى agent` posts the Arabic line for plain and noise, and misses when a labeled secret is attached.

### Password policy during Fin-wait

All 32 password-policy cases on `conversation.user.created` inside the 120-second Fin window are silent, for every wording and every draft (empty, hedge, and both usable sentences). Welcome is 32/32 and later is 32/32.

### FAQ bytes

`How does the challenge work?` is the article `How does the challenge/evaluation work?` (664 bytes, one U+200B after `Trading Rules`). In this process the earlier question `What password criteria do you use?` is sanitized to `What password [secret]`, and the value-shaped word `criteria` is remembered. The later article is then posted as 663 bytes, without U+200B, with `specific [secret] for passing` where the article says `specific criteria for passing`. `keepApprovedBytes` does not restore the original because the redaction changed more than format characters. A direct call shows the same poisoning: redact the password question, then redact `specific criteria for passing`, and the second string comes back as `specific [secret] for passing`. The leverage article does not contain that word, so its bytes stay exact.

## Hash check

Report sha256 `0a8f683733b67519b7b20f05c59145953daef3bb7ba89b2af457a58f836a9c56` matches `FM_R19_REPORT.md` at the candidate commit (7753 bytes). All 11 listed file hashes match `git cat-file -p 6bb9e2d:<path>`:

| File | sha256 |
| --- | --- |
| `luna-current/01_runtime/fixedMessageHandoff.js` | `aedcbb8efcdcef3e1918c7f78864b43a42cacb227ccbe1c127bc189ca24e2841` |
| `luna-current/01_runtime/index.js` | `a80c341f1b8bf9eee7538c258b8a8a9bdf780343a954f12938731676c51f8ea2` |
| `luna-current/01_runtime/writeOpStore.js` | `c8241727e37a813c478728ff3cbf65000202633eda738a4eeeb24d4fcdccd5d4` |
| `luna-current/01_runtime/faq-kb.js` | `5ca08a5c5f8a1b2916dc361d6f433fbd9414f74b93f01df5c62a78f3544f6a78` |
| `luna-current/02_statePresend/policyEvidence.js` | `edefa324a5acba5205400633b426ac6871f4f53f0dbfe484f3ab39520c9b8d57` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r19/fixedMessageHandoff.test.js` | `5721dfc7b1f7e237369806f1983f2b9962c09155ca27c5e6526a0d4ecd0fb24b` |
| `luna-current/10_synthetic_lanes/fixed-message-handoff-r18/fixedMessageHandoff.test.js` | `14951e209bc1f222010603edb951cecb66f92c52b82beaba0361fc9af35f78a2` |
| `luna-current/02_statePresend/statePresend.js` | `6d023f019738a518386b17ad2515f5503a767e427772fe35b344b5772d0ee7b1` |
| `luna-current/02_statePresend/credentialSanitizer.js` | `454d094137063fd7e0cb010dcbda8ea9acbf1257e96c816e8aee7dd754c69a15` |
| `luna-current/01_runtime/escalateRelatedOnly.js` | `c506cd2214460856224b89c5833443a8758c4396a741e5facae232b8f93aee23` |
| `luna-current/02_statePresend/targetedRegeneration.js` | `6003d7cf83645d10584ab7e11ab69cd9bdda711aca1064e964d2378ed5614b7a` |

## Sealed suite

The suite is `independent-review/handoff-r19/sealed/fm-r19-sealed.js`. It was committed before any `handleWebhook` run.

| Seal | sha256 | Role |
| --- | --- | --- |
| `56fd3c3` | `5d79b587b4c520819e235d39cb4bf1494dde658d1d7cf82ae33ba191c85815ff` | Written and committed before the candidate was run |
| `d38f810` | `8568d4495c53e6f69a2b34ebbcedb4b022e5e7cf1f1a5dde5664f1ee6276ed00` | Counts a customer post only when the write was accepted. The first run had counted HTTP 422, 500, and timeout bodies as posts, which invented duplicates |
| `ec290fe` | `5bfbb9cbc3a9c24350c9ea52dd464035799809d4dbbe23f27314b7a238bacc61` | Official score. The leak scan looks for the `Zq8` token. The previous seal matched the word `password`, so a note that already said `password: [secret]` was counted as a leak |

Case oracles were not relaxed. The second and third commits correct measurement. The official numbers above are from `ec290fe` only.

No `review/*` branch was read. No merge, deploy, VPS, Intercom, or live secret was used.
