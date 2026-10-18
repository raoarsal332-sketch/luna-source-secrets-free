# Remediation cycle 2 notes (t739-integrated-r2)

Author record for remediation cycle 2 of 2 (final) for MT5 and shared F1/F5. Independent review of r1 (`716cd404` / `d8cc2e68`) was FAIL. Sealed texts were not used. This file does not claim PASS.

- Requested model: claude-sonnet-5-5
- Actual model this cycle: grok-4.7
- Branch: `t739-mt5-shared`
- Content commit: `47768c490a91fd805b1fbc0da6d263d1f074e1ca`
- Freeze marker commit message: `t739: freeze t739-integrated-r2` (the commit that adds the updated `artifacts/MANIFEST.sha256` and `artifacts/FROZEN_CANDIDATE.md`)
- Parent of the content commit: `d8cc2e68e61befc9d46e28ffc636fb1d3cf86d31` (`t739-integrated-r1-full`)
- Hard limits unchanged: no SSH, no VPS, no production, no network calls to Intercom or any external API, synthetic credentials only (`99999001` / `Fake#Pass1`), no deployment.
- Approved guard `candidate/spreadPublicGuard.js` remains `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c`, byte-identical to `base/spreadPublicGuard.2158c43f.js`. Exports only `SAFE_SPREAD_REPLY` and `blocksPublicCredentialPair`. No file with sha256 prefix `846c225f`.
- Packs and Atom selector files are not edited in the r2 code commit. They stay the r1 bytes (`af30a48` and `b9af481`). The cycle-2 byte copy is a later commit, `t739-integrated-r2-full`.
- `faqModuleAdapter.js` `7b19352003b5767cc3842bd85661d46054a195ca61b4d60e216ac14eea3d4642` and `faqModuleGates.js` `9d46fe3d520b88d7b92381a08b34d34fcfcbc442cfe98178f173f01f4785a0e8` are unchanged.
- Delivery stays BLOCKED. `resolveExtraPath` is not added. Flags stay OFF by default.

## MT5 safety

### (1) Authorized-note REPLY posted a credential that lived in an href

`processAuthorizedNoteCommands` stripped tags, including `href`, before the public body was built, and the hold sat before the write-op record rather than on the payload axios actually received. A credential that survived as a URL (nonstandard query keys, a path pair, a fragment, or an attachment URL) was not the same decision as a labelled body pair.

Changes:

- `icRequestUnguarded` judges `credentialHoldForWrite` on the exact payload inside the retry loop, immediately before `axios`. The earlier hold, before the fast-ack store and before the op record, is still there, so a hold on the original payload still leaves the op store empty. A retry that changed the payload is judged again.
- `holdPlanForPersistence` uses the same `holdStrings` decision.
- `holdStrings` scans body text, rendered HTML text, `href`/`src`, and attachment URLs. A standalone URL is judged by the guard plus the URL rule only. It is not concatenated onto prose, so a later URL token cannot complete a prose label.
- `oneUrlHasCredential` holds a URL when the query, userinfo, or fragment contains a strong token, a credentialish mixed token, or a password-key value, or when the path has both a 5–10 digit id and a secret segment. A login id alone is not a hold. `/password/reset` with no secret value is not a hold.
- The REPLY command calls `holdOutgoingPayload` on the raw note body and attachments before `postReply`. A hold posts the staff note `Reply held by safety check (reason: CODE). Nothing was sent to the customer.` and does not post the comment. Automated holds stay silent.

### (2) Unlabelled pair on the model path and the model-plan follow-up

`adjacentSecret` required a login cue before a mixed token (letters and a digit, no symbol). `99999001 / Passw0rd` therefore passed. `urlParamPair` required both a standard login query key and a standard password query key, so `u`/`p`, a path pair, and a fragment passed.

Changes in `publicCredentialHold.js` (`PUBLIC_CREDENTIAL_HOLD_V1+t739-r2`): `isCredentialishMixed` (letters and digits, length 8–64, not a URL, version, filename, ordinary hyphen word, or short product code) holds as `CRED_PAIR_UNLABELLED` with no cue word. Strong-shaped `Fake#Pass1` is still `CRED_SECRET_SHAPED` / the labelled rule. URL cases above hold as `CRED_PAIR_URL`.

### (3) False holds, a silent drop, and a replaced body

`labelledSecrets` treated `is`/`are`/`was`/`es`/`est`/`ist` as opening an 8-hop window, and any hyphen counted as a symbol. `password is case-sensitive`, `access code is read-only`, and `password is never shared … v2.0` became `CRED_SECRET_LABELLED`.

`postClientCommentOnceInner` called `blocksPublicCredentialPair` and `return null` with only a log line, so the caller saw no hold code.

`publicReplyBoundary.screen()` can drop a majority of a reply (role lines, or a BODY block when both CLIENT and BODY markers exist). `postReply` then sent `screen.body` with no hold code.

Changes:

- Assignment is only `:` or `=`. A copula allows only the immediate next token, and only when that token is strong-shaped or credentialish-mixed. Ordinary hyphen words and version tokens are not secrets.
- The early `return null` in `postClientCommentOnceInner` is gone. The credential reaches the transport and comes back `{ok:false, skipped:true, held:true, reason:'credential-hold', holdCode}`.
- `postReplyWithOwnershipLock` holds the original composed body before `screen()`. If the screen drops a majority of the letters (original at least 40 letters, screened under half) and the removals are not only role-marker / role-label lines, the original body is kept (`BOUNDARY_REWRITE_KEPT_ORIGINAL`). `screen()` returning `ok:false` still skips with `screen.reason`.

## MT5 usefulness (contained reply only)

Review counts were eligible spread-test asks 8/12, bare follow-ups 0/12, mixed appends 5/12. Causes in this tree:

- `explain()` returned `password-ask-not-spread-template` before the personal-versus-test split, so a spread-term ask that also said password never reached `SAFE_SPREAD_REPLY`.
- `gateLegacy` required strict AND legacy, so a strict-true ask was dropped when legacy was false.
- `priorBotWasContainedSpreadReply` required squash equality. `ensureFirstReplyWelcomeIntro` prefixes `Hello Name,`, so the stored body never matched.
- `isBareSpreadFollowUpAsk` was a short anchored regex and returned false when a spread term was present.
- The FAQ offer runs before the spread block, so a pure spread ask or a bare follow-up could be swallowed there.
- The identical-body dedupe dropped a second send of the same contained reply.
- The mixed template was appended only inside `postClientCommentOnceInner`. On a mixed turn the presend gate held the model draft (`MISSED_QUESTION` / `needs-escalate`, quiet `no_reply_needed`) and `finally` deleted the pending entry, so the template never went out. `__episode.canRegenerate is not a function` is a harness stub gap; the flush does not depend on that regenerate path.

Changes (`spread-image-fixes-v1+t739-r2-routing`):

- A personal problem (account id, own credential, own-reference plus a problem, credential cue plus a problem, or `my` plus a credential cue) still returns false (`personal-account-not-spread`) before any spread-test credential route.
- A spread-term ask that wants a credential and test/demo/investor/check/see/view/show/send/share/give access, and is not a personal problem, returns true (`spread-test-credential`).
- Legacy cannot widen a strict false and cannot veto a strict true.
- Contained-reply recognition is squash inclusion, so a Hello-prefixed body still counts.
- A bare follow-up is at most 180 characters, has no spread term, is not a personal problem / payout / own-credential / account-id ask, and has an access word or again/resend.
- Pure spread and bare follow-up skip `faqAssistance.offer`. A mixed ask stores `{customerText, userPart, clientName}` in `pendingSpreadTemplateAppend`.
- Identical-body dedupe does not skip when the body contains the contained reply and the current user part is a bare follow-up.
- `postReply` still appends a pending template idempotently. If the entry is still set when the webhook `finally` runs, it posts `SAFE_SPREAD_REPLY` through `postClientCommentOnce` (`SPREAD_TEST_REPLY_MIXED_FLUSH`) and then deletes the entry.

`t8` moved `what is the p a s s w o r d for the spread test login` and `send me the passw0rd and login for spreads` onto the true list, and added `what is the investor password to check spreads`. Personal, payout, complaint, and general-pricing asks stay false.

## F5

Portuguese and Spanish FAQ text that also contains English rule terms (`daily loss`, `stop loss mandatory`) was labelled `en` / `current-english` because English function words were counted before the language cues, and the cue lists were short.

`languageGate` now runs non-English evidence first (non-Latin, expanded `ES_CUE_RE`, new `PT_CUE_RE`, Roman Urdu). English keywords do not relabel that text. `detectLangHint` returns `pt` before `es`.

`reliableEnglish` is the existing two-function-word rule, or `shortClearEnglish`: the first token is a closed question/auxiliary word (`is`/`are`/`do`/`does`/`did`/`can`/`could`/`what`/`when`/`where`/`how`/`why`/`which`/`who`/`will`/`would`/`should`) and there are at least three tokens. `Is stop loss mandatory?` is `en`. `payout?` is one token and stays `uncertain`. A clearly English current question is decided before priors. Prior non-English still wins over a current text that is not reliable English. Prior reliable English still upgrades a short uncertain follow-up.

`Are Elite Packs refundable?` is now English, so with the flag OFF it is `module-off-fail-closed` rather than `language-uncertain-module-off`. `Elite Packs?` and `Atom funded profitable days requirement?` stay uncertain.

## F1

With flags OFF, module asks that the detector did not claim fell through to the main route. The Packs pregate folds confusables only when the whole text has enough ASCII letters, so a pure homoglyph token never folded. The detector was also narrower than the catalog entity list, and a dropped-subject follow-up (`how many did I open?`) was unclaimed even after an Elite Packs turn.

`faqModuleDetectors.js` only. Selector files are not edited.

`normalizeForDetect` applies NFKC, strips zero-width and format characters, folds confusables per character, then joins spaced or punctuated single-letter runs (`E l i t e P a c k s`, `a.t.o.m`) with the same pattern the Packs pregate uses. `scrubNonModule` removes `pack my bags`, backpack/package/packet, and credit/debit card before the entity match. `PACKS_ENTITY_RE` covers Elite Packs, My Packs, packs, pack credits, pack pass, pack/redeem/founder's keys, named rarity cards, pack cards, and rarity of cards/packs. A prior customer text that hits the entity plus a current `PACKS_FOLLOW_RE` (open/redeem/rarity/cards/collection/inventory/streak) claims the follow-up. The same follow-up with no prior entity does not.

Atom: after the same normalize, `atomic`/`anatomy`/`anatomical`/`atomizer` are stripped, then `\belite\s*atom\b|\batom\b`, otherwise the module `buildContext` chain on the normalized text.

V12 questions, `pack my bags`, `credit card`, `anatomy`, and `atomic habits` stay unclaimed.

## Suites before the module copy

Sequential, `unshare -rn`, from `staging-repair-t739`. Raw files: `artifacts/raw/r2_cand_*.out` and `artifacts/raw/r2_base_*.out`.

| suite | candidate | baseline |
|---|---|---|
| t1 detector | 57/57 | candidate-only |
| t2 transport | 51/51 | 15 passed, 36 failed, 51 (exit 1) |
| t3 faq/language/module | 29/29 | 11 passed, 6 failed, 17 (exit 1) |
| t4 logs | 6/6 | 2 passed, 4 failed, 6 (exit 1) |
| t5 isolation | 10/10 | not a baseline suite |
| t6 modules | 35/35 | 2/2 |
| t7 corpus | 6/6 | 1/1 |
| t8 remediation r1 | 6/6 | 6/6 with OBS, not a product pass |
| t9 remediation r2 | 6/6 | candidate-only |

t7 candidate observations: Packs corpus total 316, en 212, equal 212, withheld 54, nonEn 50. Atom general+controls total 293, en 219, equal 219, withheld 74, nonEn 0. F1 exposure 609: `T:module-off-fail-closed` 392, `N:no-isolatable-faq` 51, `N:existing-unowned-faq-path` 40, `T:language-uncertain-module-off` 126. Catalog bodies scanned 474, holds 0. t8 false-hold probe 0/17.

The English count rose against r1-full (Packs en 205, Atom en 219 was 206) because `shortClearEnglish` labels short but clearly English questions as `en`. Equality with the author gate still holds on every row the shared gate calls English. Selector bytes are unchanged, so this shift is the shared gate.

## Known gaps (not closed by phrase patches)

Cross-message context older than 8 bodies or 4000 characters, or an id half with no login cue. Spaced or worded password characters. A purely alphabetic labelled secret with no internal capital (`password: swordfish`). A weak-label secret with no id and no strong shape (`pw: hunter2`). Encodings beyond rot13 and one-level base64/hex. Image pixels. A login id alone in a URL is not a hold.

Packs and Atom author suites are rerun after the cycle-2 byte copy, not on these r1 module bytes.

## Cycle-2 module copy (t739-integrated-r2-full)

Copied after the r2 freeze, byte-for-byte, into both the top-level directory and `candidate/`. No selector edits. No other product file changed. `faqModuleAdapter.js` was not changed: `packsOptions` still passes `{language, confident, allowsAnswer}`, and the cycle-2 Packs `languageGateDecision` accepts `{language:'en', confident:true, allowsAnswer:true}` (`language-gate-english`) and fail-closes non-English and uncertain gates.

Packs source `cursor/t739-packs-cycle2-3f28` @ `9a828c80b406be2790bea213a52971e8bfa1fc3e`:

| file | bytes | sha256 |
|---|---|---|
| packsOwnershipPregate.js | 75702 | `ca7bb1ea54493bb67c0aa24b0bb81d2e059adbc20590807726ff019f53e3d30e` |
| packsAnswerSelect.js | 34788 | `75bcf653044a67598a2d73ea6690e6e4a9a863f498b16128dd7a5142c0e8a013` |
| packsApprovedAnswers.js | 7028 | `10dd4ef8f5fb9fd1e3a10de0bfce41ec81dde8c8119b987b0b054cbe91847a3d` (unchanged) |
| faq-approved-answers-packs-v1.json | 313681 | `bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318` (unchanged) |

Atom source `t739-atom` @ `fa77b0fa0d30346a8d0f447209bfe1fe1353a400`. Author `MANIFEST.json` sha256 `febbf7291bb48d152e0c5b1f4d8dbe0a86cd1a328673cb8955451d1026d39687`:

| file | bytes | sha256 |
|---|---|---|
| atomAnswerScope.js | 5772 | `8f2d3672680e33978f17532ebd11edda926ee2337c24821dfcd95839ceafde63` (unchanged) |
| atomAnswerSelect.js | 40486 | `fc5ab9052107140658e6b5414085fcdfaf44e43cb10d0893af08876172b7a51c` |
| atomApprovedAnswers.js | 4729 | `5008e3343dad76eb77cc0a4cd595b07a79ba134904c018e3320a8d85d5ccdbd8` (unchanged) |
| atomMoneyFrame.js | 19623 | `b672fc3e43cd46bd5d210bc9e1c49250865a5d0bb8d19f4058bb62a6d2940398` |
| faq-approved-answers-atom-v1.json | 148077 | `df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6` (unchanged) |

Guard still `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c`. Delivery stays BLOCKED.

### What the copy changed in the shared detector

`faqModuleDetectors.packsDetect` treats `packsProductHint` as a Packs claim, and Packs is registered before Atom. Cycle-2 `packsProductHint` returns `elite-packs` for `\batom\b`, `\bdiscount\b`, `\bsubscription\b`, and `\brefund`. Those words are not Packs-only in the integrated routes.

Observed:

- `Do you offer a student discount for the challenge?` is now a Packs claim. With the flag OFF the webhook stops at `module-off-fail-closed` and never reaches the model. That is why t2's FAST-route pair hold and its clean-answer control do not run, and why t4 never reaches `SKIP model`.
- `Was my subscription charged this month?` is now a Packs claim (t6 D6).
- `What is Elite Atom?` and `Atom funded profitable days requirement?` are Packs claims as well as Atom claims. Packs runs first, so an Atom-ON turn is silenced as Packs-OFF, and a Packs-ON turn takes the Packs ON path for an Atom question (t6 F1-8, ON2, ON3).

No selector byte was edited to change this. No shared file was edited after the r2 freeze. The next step for this interaction is an architecture reassessment, not another phrase patch.

### Suites after the copy

Sequential `unshare -rn`. Raw files: `artifacts/raw/r2full_*`. Author suites ran from the source commits' tests with these candidate bytes overlaid (`/tmp/int/packs` from `9a828c8`, `/tmp/int/atom` from `fa77b0f`).

| suite | result |
|---|---|
| t1 detector | 57 passed, 0 failed |
| t2 transport | 49 passed, 2 failed, 51 total |
| t3 faq/language/module | 29 passed, 0 failed |
| t4 logs | 5 passed, 1 failed, 6 total |
| t5 isolation | 10 passed, 0 failed |
| t6 modules | 30 passed, 5 failed, 35 total |
| t7 corpus | 6 passed, 0 failed |
| t8 remediation r1 | 6 passed, 0 failed |
| t9 remediation r2 | 6 passed, 0 failed |
| baseline t2 | 15 passed, 36 failed, 51 (exit 1) |
| baseline t3 | 11 passed, 6 failed, 17 (exit 1) |
| baseline t4 | 2 passed, 4 failed, 6 (exit 1) |
| baseline t6 | 2/2 |
| baseline t7 | 1/1 |
| baseline t8 | 6/6 observations |
| Packs author | 1328/1328, 0 critical leaks. General controls 79/79 correct, false refusal 0 |
| Packs paraphrase | general 266/266 correct, false refusal 0. State 51/51 safe, product leaks 0 |
| Atom author | `node --test` 21 pass, 0 fail. TOTAL 5798 pass, 5798 fail 0. Corrected sendable leaks 0. Corrected false refusals 0 |

t7 after the copy: Packs corpus total 316, en 212, equal 212, withheld 54, nonEn 50. Atom total 293, en 219, equal 219, withheld 74, nonEn 0. F1 exposure 609: `T:module-off-fail-closed` 427, `N:existing-unowned-faq-path` 36, `T:language-uncertain-module-off` 128, `N:no-isolatable-faq` 18. Catalog bodies 474, holds 0. t8 false-hold probe 0/17.

This is not a PASS.
