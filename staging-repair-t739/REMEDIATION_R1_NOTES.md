# Remediation cycle 1 notes (t739-integrated-r1)

This file is the incremental record for remediation cycle 1 of max 2. An errored prior run is the same cycle, not a new one.

- Requested model: claude-sonnet-5-5
- Actual model this cycle: grok-4.7
- Branch: t739-mt5-shared
- Base freeze resumed from: t739-initial-integrated-1 (commit 5c4fa9d)
- Hard limits unchanged: no SSH, no VPS, no production, no network calls to Intercom or any external API, synthetic credentials only, no deployment.

## Step 1 — MT5-3 and MT5-4 (committed with this note)

Root causes, from the frozen tree:

- MT5-3. `index.js` called `spreadPublicGuard.buildSafeSpreadReply`, `isAuthorizedInvestorSpreadTemplate` and `appendApprovedSpreadTemplate`. The approved guard `2158c43f` exports only `SAFE_SPREAD_REPLY` and `blocksPublicCredentialPair`. Those calls were dead, so a bare follow-up never recognized the contained reply, and `pendingSpreadTemplateAppend` was set on mixed turns but deleted only inside the dead `appendApprovedSpreadTemplate` branch. Entries stayed for later turns.
- MT5-4. `spreadAskGate.explain` returned true for any non-negated spread term that was not a distribution verb, a mechanism question, or an un-strong personal-login phrase. A strong phrase such as "what are the spreads" or "check the spreads" bypassed the personal-login exclusion, so a broken login, "my account 99999001", an obfuscated password ask, a payout/KYC ask, or a widening complaint still routed to the spread-test reply. General pricing asks (commission per lot, raw vs standard, news widening) also routed there.

Source check: in this tree the spread-test reply is `spreadPublicGuard.SAFE_SPREAD_REPLY` (contained text, no login and no password). The guard file is not modified.

Changes:

- `index.js` sends only `SAFE_SPREAD_REPLY`. Mixed turns append that same text inside `postClientCommentOnceInner`, and the pending entry is deleted there. The webhook `finally` deletes any leftover for that conversation, so the map is empty after the turn. Bare follow-ups ("send again", "what's the server") run only when the last public bot body squashes equal to `SAFE_SPREAD_REPLY`, and they resend that same text.
- `spreadAskGate.js` (version `spread-image-fixes-v1+t739-r1-routing`) refuses the spread-test route for: a password ask after leet/spaced-letter folding; an account id next to an account/login word; the customer's own login plus a problem; payout/KYC/withdrawal/refund; a widening/size complaint; general pricing (commission, raw vs standard, news, fees) unless the ask is test-access ("spread test", "demo login to check spreads"). "What are the spreads?" and "give me a spread check account" still route to the contained reply.

## Step 2 — MT5-1 and MT5-2

Root causes:

- MT5-1. `leafStrings` pushed every object key and every string value, then `holdStrings` joined them. The envelope key `admin_id` plus the value `10118526` became an unlabelled pair whenever the body contained a cue word (`account`, `server`, `demo`, `login`, `credentials`). That held `SAFE_SPREAD_REPLY`, `faq.is-broker.en`, the Packs refuse row, and ordinary es/pt replies.
- MT5-2. `detectInView` returned null when the same string had no 5–10 digit id. A labelled password, a cue-free strong-shaped secret (`Fake#Pass1`), and a password whose login id was only in an earlier turn all passed Layer A, Layer B, and `holdPlanForPersistence`. The S10 FOLLOW path then persisted the password.

Changes:

- Payloads and plan objects are scanned structurally. Only customer-visible fields are read: `body` / html text, `href` / `src`, and attachment URLs. Keys and envelope ids are not read.
- A labelled password value is a hold with no login id (`CRED_SECRET_LABELLED`). A strong-shaped token (upper, lower, digit, symbol) is a hold with no label and no id (`CRED_SECRET_SHAPED`). Words between a label and an explicit value (`password you requested: …`) are skipped; a version token later in a policy sentence is not.
- `fetchConversation` registers the last 8 public bodies (4000 characters) per conversation. A split holds only when the current text supplies one half and that context supplies the other (`CRED_PAIR_CONTEXT`). An innocent reply is not held because history already contained a pair. The plan hold runs before the ledger write and sees that context.
- Detector regressions are in `tests/t1_detector.js`. `node tests/t1_detector.js` 53/53. `node tests/t2_transport.js` 51/51.
- False-hold probe on 22 safe bodies (12 V12 English answers, Packs refuse row, `SAFE_SPREAD_REPLY`, general spread sentences, es/pt), each posted with `admin_id: 10118526`: 0 holds.

## Step 3 — F5-7

Root cause: `selectApprovedAnswer` abstained only when `lang === 'uncertain'`. A positive `non-en` gate still ran the deterministic cues, and `preferLocale` returned the `.en` id when no locale row existed. V12 has only English rows, so a Roman Urdu, Arabic, or Spanish turn that contained English rule words (`2-Step Lite daily loss`, `stop loss mandatory`) was sent the English answer.

Change: the gated FAQ route returns before selection unless `lang === 'en'`. `non-en` abstains with `language-non-en` and does not call the classifier. `preferLocale` returns null instead of the English id. `language-non-en` is on the FAQ abstain-fallthrough list, so the non-English main model route in `index.js` is unchanged.

`node tests/t3_faq_language_module.js`: 29/29.

## Step 4 — F1-8

OWNER-REVIEWABLE DEFAULT. When a module detector claims the turn and that module's flag is OFF, `lang === 'uncertain'` is now terminal-silent (`language-uncertain-module-off`, `terminal: true`). Short English module asks do not carry two English function words, so they were uncertain and fell through to the main LLM. `Are Elite Packs refundable?` and `Atom funded profitable days requirement?` are in that class. A positive `non-en` verdict is still not claimed, so the non-English main route is unchanged. Module ON + uncertain stays non-terminal.

`node tests/t3_faq_language_module.js` 29/29. `node tests/t6_modules.js` 35/35.

## Step 5 — regressions

`tests/t8_remediation_r1.js` covers the exposed failures: safe replies delivered through `postClientCommentOnce` and `icRequest` (including the `admin_id` envelope), lone password / cue-free secret / cross-message split held, S10 ledger has no plaintext password, pending spread map size 0, bare follow-up after `SAFE_SPREAD_REPLY` sends no credential, and spread-test routing. False-hold measurement on 17 safe bodies with `admin_id` 10118526: 0 holds.

Candidate: `node tests/t8_remediation_r1.js` 6/6.

## Step 6 — false holds found by the catalog scan

`packs.pack-pass.en` ("Pack Pass: … credit-purchased") was held because a weak label `pass` plus a colon treated a hyphenated word as a secret. Id-independent labelled holds now require a strong password label. Weak labels still hold only together with a login id.

`atom.overview.ur` / `.hi` were held because `1-Step)।` kept a trailing danda, so the token looked strong-shaped. Trailing Unicode punctuation is trimmed before the shape check. `Fake#Pass1` still holds.

Catalog scan after the fix: 474 bodies, 0 holds. `t1` 53/53, `t2` 51/51, `t7` 6/6, `t8` 6/6.

Next: freeze `t739-integrated-r1`. Atom r1 copy waits until after that freeze. Packs r1 is not copied.
