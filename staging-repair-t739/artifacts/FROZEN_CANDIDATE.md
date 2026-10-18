# FROZEN CANDIDATE

- Candidate id: `t739-integrated-r2`
- Branch: `t739-mt5-shared` (private repo; never merged to main, no PR to main)
- Content commit: `47768c490a91fd805b1fbc0da6d263d1f074e1ca`. The freeze commit that adds this file's r2 text is the commit whose message is `t739: freeze t739-integrated-r2`.
- Built on `d8cc2e68e61befc9d46e28ffc636fb1d3cf86d31` (`t739-integrated-r1-full`).
- Packs module files in this freeze are still the r1 bytes from `cursor/t739-packs-3f28` @ `af30a483a90437093ee7e8e6bae9863b24f89916`. Catalog JSON unchanged.
- Atom module files in this freeze are still the r1 bytes from `t739-atom` @ `b9af481b91fb0188d0b322bb5801cf55ce30ffa0`. `MANIFEST.json` sha256 `1b92b4885fd08baff188d326b20762dda46917b1680f625e9585b57978dda9c9`.
- Manifest: `artifacts/MANIFEST.sha256` (sha256 of the manifest file itself: `0ef9773cbf350f62b693cc58e04d14ae7be0e8eca9042500688e9d7361286988`). 100 paths, 0 mismatches.
- Requested model for remediation cycle 2: `claude-sonnet-5-5`. Actual model: `grok-4.7`.
- Author and integration owner report only. No PASS claim. Not independently reviewed.
- Author notes: `REMEDIATION_R2_NOTES.md`.

## Default flag configuration (both OFF)

| module | flag | default | turns ON only with |
|---|---|---|---|
| Elite Packs | `LUNA_PACKS_ENABLED` | unset = OFF | `1`, `true`, `on`, `yes` (case-insensitive) |
| Elite Atom | `LUNA_ATOM_SELECTOR_ENABLED` (the Atom module's own flag) | unset = OFF | `1` |

`packsAnswerSelect` also abstains unless `opts.packsEnabled === true` (`packs-disabled-default`). Delivery wiring stays BLOCKED (`resolveExtraPath` is not added; `faqApprovedAnswers.js` has no extra-catalog loader).

## Packs r1 module files still in this freeze (sha256 matches `af30a48`)

| file | sha256 |
|---|---|
| packs/packsAnswerSelect.js and candidate/packs/packsAnswerSelect.js | `21e179351578906ddf725c4874f3474468655955817cbdafb7cab514e66ab58c` |
| packs/packsOwnershipPregate.js and candidate/packs/packsOwnershipPregate.js | `c8eab2121bf675128729ddf716346a004859b8435928a5da72857f5454a7516b` |
| packs/packsApprovedAnswers.js and candidate/packs/packsApprovedAnswers.js | `10dd4ef8f5fb9fd1e3a10de0bfce41ec81dde8c8119b987b0b054cbe91847a3d` |
| packs/faq-approved-answers-packs-v1.json and candidate/packs/faq-approved-answers-packs-v1.json | `bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318` |

## Atom r1 module files still in this freeze (sha256 matches `b9af481`)

| file | sha256 |
|---|---|
| atomAnswerScope.js | `8f2d3672680e33978f17532ebd11edda926ee2337c24821dfcd95839ceafde63` |
| atomAnswerSelect.js | `b204fc2871b1536d3c15fde123f37e2cfeb0e3105cea8f1d3085fb3dbb5883e1` |
| atomApprovedAnswers.js | `5008e3343dad76eb77cc0a4cd595b07a79ba134904c018e3320a8d85d5ccdbd8` |
| atomMoneyFrame.js | `cf40e0fceca039a96066915ffc05e8a2a36eaf56f824a0ff9bc5265d2c32f721` |
| faq-approved-answers-atom-v1.json | `df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6` |

## Shared files changed in the content commit

| file | sha256 |
|---|---|
| candidate/index.js | `08b3cd7ff96a13b3854706696fc7a1dbb39099fbf7ed52e7e2287459f219ae9d` |
| candidate/publicCredentialHold.js | `9b4fcb27a591c355ac460da87a5553a1d92702eea577e2e1e1a3322475bb7993` |
| candidate/spreadAskGate.js | `8b5a7b5cc72d8c3bdc4b6c5d3743aaf5e8a5b0d0281668dc962506c99ac3802e` |
| candidate/faqAnswerSelect.js | `37295105039f0ca25e6347a340a8b4795a3cb4db259574299cea8b130f0420f9` |
| candidate/faqAssistance.js | `6c56f2e806ad36e908420306496aaf2a02fc7e706367c99a552a3351bbf06b9c` |
| candidate/faqModuleDetectors.js | `a915bbba4df361274c0e689ea793e5a66b7e5f146940c8a63c295e2a42b68f99` |

## Unchanged in this freeze

Approved guard `candidate/spreadPublicGuard.js` `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c` (same as `base/spreadPublicGuard.2158c43f.js`). No file with sha256 prefix `846c225f`.

`candidate/faqModuleAdapter.js` `7b19352003b5767cc3842bd85661d46054a195ca61b4d60e216ac14eea3d4642`. `candidate/faqModuleGates.js` `9d46fe3d520b88d7b92381a08b34d34fcfcbc442cfe98178f173f01f4785a0e8`.

## Language gate

No adapter change. `faqAssistance` passes `languageGateForTurn`, shape `{lang, language, confident, allowsAnswer, basis}`. `faqModuleAdapter.packsOptions` gives Packs `{language, confident, allowsAnswer}`. English is `{language:'en', confident:true, allowsAnswer:true}`. Non-English evidence (Portuguese and Spanish cues included) is decided before English keywords. `payout?` stays uncertain. `Is stop loss mandatory?` is English.
