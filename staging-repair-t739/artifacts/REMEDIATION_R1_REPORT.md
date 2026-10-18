# Remediation cycle 1 report (t739-integrated-r1)

Author report only. This is not a PASS claim and it has not been independently reviewed.

- Requested model: claude-sonnet-5-5
- Actual model: grok-4.7
- An earlier run of this same cycle errored on a usage limit. That run is not a new cycle. Committed work on `t739-mt5-shared` was kept.
- Frozen content commit: `76e1c9ee8be6aa522818a8905a6d98af21621ac8`
- Candidate id: `t739-integrated-r1`
- Default flags: `LUNA_PACKS_ENABLED` unset (OFF), `LUNA_ATOM_SELECTOR_ENABLED` unset (OFF)
- Approved guard `spreadPublicGuard.js` remains byte-identical to `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c`. No `846c225f` file. No investor-template sharing was restored.
- Hard limits held: no SSH, no VPS, no production, no network calls to Intercom or any external API, synthetic credentials only (`99999001` / `Fake#Pass1`), no deployment.

## Root causes and changes

### MT5-1 (false hold)

`leafStrings` pushed JSON keys and values, then joined them. Envelope `admin_id` `10118526` plus the key name `admin_id` was read as an unlabelled credential pair whenever the body had a cue word (`account`, `server`, `demo`, `login`, `credentials`). That held `SAFE_SPREAD_REPLY`, `faq.is-broker.en`, the Packs refuse row, and ordinary Spanish and Portuguese replies.

Payload and plan scans now read only customer-visible fields: body text, rendered HTML text, `href`/`src`, and attachment URLs. Keys and envelope ids are not read.

### MT5-2 (leak)

`detectInView` returned null when the same string had no 5–10 digit id. These then passed Layer A, Layer B, and `holdPlanForPersistence`, and the S10 FOLLOW path wrote the password into `intercom_auth_commands.json`:

- `Here is the investor password you requested: Fake#Pass1`
- `Here is what you requested: Fake#Pass1`
- prior turn with login `99999001` and server, current turn `The password for that login is Fake#Pass1.`

A strong password label now holds with no login id (`CRED_SECRET_LABELLED`). A strong-shaped token (upper, lower, digit, and an internal symbol) holds with no label (`CRED_SECRET_SHAPED`). `fetchConversation` registers the last 8 public bodies. A split holds only when the current text supplies one half and that context supplies the other (`CRED_PAIR_CONTEXT`). The plan hold runs before the ledger write. An innocent reply is not held just because history already contained a pair.

Two false holds found by the catalog scan were fixed at the cause, not by skipping those ids: a weak `pass` label no longer holds a hyphenated catalog phrase with no login id (`Pack Pass: … credit-purchased`), and trailing Unicode punctuation is trimmed so `1-Step` plus a danda is not secret-shaped.

### MT5-3

`index.js` called `buildSafeSpreadReply`, `isAuthorizedInvestorSpreadTemplate`, and `appendApprovedSpreadTemplate`. The 2158c43f guard exports only `SAFE_SPREAD_REPLY` and `blocksPublicCredentialPair`, so those calls were dead and `pendingSpreadTemplateAppend` was never cleared.

The spread reply is only `SAFE_SPREAD_REPLY`. Mixed turns append that same text and delete the pending entry. The webhook `finally` deletes any leftover, so the map size is 0 after the turn. A bare follow-up (`send again`, `what's the server`) runs only when the last public bot body is that contained reply, and it resends that text.

### MT5-4

`spreadAskGate` treated a strong spread phrase as enough, so a personal broken login, `my account 99999001`, an obfuscated password ask, a payout/KYC ask, or a widening complaint still took the spread-test reply. General pricing (commission per lot, raw vs standard, news widening) did too.

In this tree that reply is the contained `SAFE_SPREAD_REPLY` (no login, no password). The gate now refuses the spread-test route for those personal, payout, complaint, and general-pricing asks. `What are the spreads?` and `give me a spread check account` still receive the contained reply.

### F5-7

`selectApprovedAnswer` abstained only for `uncertain`. `preferLocale` fell back to the `.en` row. V12 has only English rows, so Roman Urdu, Arabic, and Spanish turns that contained English rule words received an English answer.

The gated FAQ route now abstains unless `lang === 'en'`. `non-en` returns `language-non-en` and does not call the classifier. `preferLocale` returns null instead of the English id. `language-non-en` is on the FAQ fallthrough list, so the non-English main model route is unchanged. V12 phrase coverage was not broadened.

### F1-8 (owner-reviewable default)

`language-uncertain-module-off` was `terminal: false`. Short English module asks do not have two English function words, so `Are Elite Packs refundable?` and `Atom funded profitable days requirement?` fell through to the main LLM while the flags were OFF.

When a detector claims the turn and that module's flag is OFF, `uncertain` is now terminal-silent. A positive `non-en` verdict is still not claimed. Module ON plus uncertain stays non-terminal. This default is marked in `faqAssistance.moduleScope` for owner review.

## Raw counts

All candidate and baseline runs below are under `unshare -rn` except the Packs and Atom author suites, which were also run under `unshare -rn` from the integrated copies (`candidate/packs` and `candidate/atom` plus the authors' `tests/`). Fixed model stubs test enforcement only.

| suite | candidate | baseline |
|---|---|---|
| t1_detector | 53 passed, 0 failed, 53 total | not a baseline suite (detector is candidate-only) |
| t2_transport | 51 passed, 0 failed, 51 total | 15 passed, 36 failed, 51 total |
| t3_faq_language_module | 29 passed, 0 failed, 29 total | 11 passed, 6 failed, 17 total |
| t4_logs | 6 passed, 0 failed, 6 total | 2 passed, 4 failed, 6 total |
| t5_isolation | 10 passed, 0 failed, 10 total | not re-run (isolation is of the harness, not the base tree) |
| t6_modules | 35 passed, 0 failed, 35 total | 2 passed, 0 failed, 2 total |
| t7_corpus_equivalence | 6 passed, 0 failed, 6 total | 1 passed, 0 failed, 1 total |
| t8_remediation_r1 | 6 passed, 0 failed, 6 total | 6 passed, 0 failed, 6 total, with the observations below |
| Packs author `run-author-tests.js` | 1322/1322 pass, 0 fail | author pre-t739 tree still cannot run those tests (unchanged from the integration report) |
| Atom `run_all.sh` | `node --test` fail 0; `TOTAL 5465 pass 5464 fail 1` | same author GN25 failure as the previous freeze |

Baseline t8 observations (the tests record the pre-fix behavior instead of requiring the new hold):

- Spread gate: personal broken-login plus "what are the spreads" is still a spread-test route (`personal: true`). General widening is not (`general: false`).
- `SAFE_SPREAD_REPLY`, `faq.is-broker.en`, and the es/pt samples are delivered (`held: false`, one public write). Baseline has no envelope false hold because it has no `publicCredentialHold`.
- Layer A sends all three MT5-2 samples (`held: false`, `writes: 1`).
- S10 FOLLOW persists the plaintext password (`leaked: true`).

False holds, counted separately from leak holds:

- 0 holds of 17 safe bodies (12 V12 English answers, `SAFE_SPREAD_REPLY`, general spread sentences, es/pt), each with envelope `admin_id` `10118526`.
- 0 holds of 474 catalog bodies (V12, Packs, Atom).

F1 exposure on the authors' questions (flags OFF, unowned, 609 asks): terminal `module-off-fail-closed` 373, terminal `language-uncertain-module-off` 145, non-terminal `no-isolatable-faq` 51, non-terminal `existing-unowned-faq-path` 40. The 145 uncertain claims are the F1-8 default; they were non-terminal in `t739-initial-integrated-1`.

Atom `general GN25` (`Can I get a bigger reward share on Atom 1-Step?` => `clarify:unrecognized-qualifier`) is the author's own failure from the previous freeze. This cycle did not edit Atom or Packs selector files.

## Not in this freeze

V12 phrase coverage was not broadened. Packs r1 was not copied. Atom r1 on `t739-atom` (`2e4051d`, `29e76f7`, `b9af481`, manifest `1b92b4885fd08baff188d326b20762dda46917b1680f625e9585b57978dda9c9`) is copied only after this freeze, in a later commit, and delivery wiring stays blocked.
