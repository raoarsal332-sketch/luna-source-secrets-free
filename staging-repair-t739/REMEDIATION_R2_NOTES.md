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
