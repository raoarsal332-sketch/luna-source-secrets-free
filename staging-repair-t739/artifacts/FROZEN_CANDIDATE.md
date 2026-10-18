# FROZEN CANDIDATE

- Candidate id: `t739-integrated-r2-full`
- Branch: `t739-mt5-shared` (private repo; never merged to main, no PR to main)
- r2 content commit: `47768c490a91fd805b1fbc0da6d263d1f074e1ca`
- r2 freeze marker: `444da046ae8e7c284008b4e3dec66595bd507485` (message `t739: freeze t739-integrated-r2`). Manifest at that commit, self-sha256 `0ef9773cbf350f62b693cc58e04d14ae7be0e8eca9042500688e9d7361286988`, 100 paths, 0 mismatches.
- This file's r2-full text is added by the commit whose message is `t739: freeze t739-integrated-r2-full`.
- Packs source: `cursor/t739-packs-cycle2-3f28` @ `9a828c80b406be2790bea213a52971e8bfa1fc3e`. Module files copied byte-for-byte. Catalog JSON unchanged (`bed88e6a`).
- Atom source: `t739-atom` @ `fa77b0fa0d30346a8d0f447209bfe1fe1353a400`. Author `MANIFEST.json` sha256 `febbf7291bb48d152e0c5b1f4d8dbe0a86cd1a328673cb8955451d1026d39687`. Catalog JSON unchanged (`df6e0268`).
- Manifest: `artifacts/MANIFEST.sha256` (sha256 of the manifest file itself: `baef1b46b46bf45076b5cbaed986ce757d7011f8cab30e6c7be2b9f36fc95fea`). 100 paths, 0 mismatches.
- Requested model for remediation cycle 2: `claude-sonnet-5-5`. Actual model: `grok-4.7`.
- Author and integration owner report only. No PASS claim. Not independently reviewed.
- Author notes: `REMEDIATION_R2_NOTES.md`.

## Default flag configuration (both OFF)

| module | flag | default | turns ON only with |
|---|---|---|---|
| Elite Packs | `LUNA_PACKS_ENABLED` | unset = OFF | `1`, `true`, `on`, `yes` (case-insensitive) |
| Elite Atom | `LUNA_ATOM_SELECTOR_ENABLED` (the Atom module's own flag) | unset = OFF | `1` |

`packsAnswerSelect` also abstains unless `opts.packsEnabled === true` (`packs-disabled-default`). Delivery wiring stays BLOCKED (`resolveExtraPath` is not added; `faqApprovedAnswers.js` has no extra-catalog loader).

## Packs cycle-2 module files (sha256 matches `9a828c8`)

| file | sha256 |
|---|---|
| packs/packsAnswerSelect.js and candidate/packs/packsAnswerSelect.js | `75bcf653044a67598a2d73ea6690e6e4a9a863f498b16128dd7a5142c0e8a013` |
| packs/packsOwnershipPregate.js and candidate/packs/packsOwnershipPregate.js | `ca7bb1ea54493bb67c0aa24b0bb81d2e059adbc20590807726ff019f53e3d30e` |
| packs/packsApprovedAnswers.js and candidate/packs/packsApprovedAnswers.js | `10dd4ef8f5fb9fd1e3a10de0bfce41ec81dde8c8119b987b0b054cbe91847a3d` |
| packs/faq-approved-answers-packs-v1.json and candidate/packs/faq-approved-answers-packs-v1.json | `bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318` |

## Atom cycle-2 module files (sha256 matches `fa77b0f`)

| file | sha256 |
|---|---|
| atomAnswerScope.js | `8f2d3672680e33978f17532ebd11edda926ee2337c24821dfcd95839ceafde63` |
| atomAnswerSelect.js | `fc5ab9052107140658e6b5414085fcdfaf44e43cb10d0893af08876172b7a51c` |
| atomApprovedAnswers.js | `5008e3343dad76eb77cc0a4cd595b07a79ba134904c018e3320a8d85d5ccdbd8` |
| atomMoneyFrame.js | `b672fc3e43cd46bd5d210bc9e1c49250865a5d0bb8d19f4058bb62a6d2940398` |
| faq-approved-answers-atom-v1.json | `df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6` |

## Shared files from the r2 content commit (unchanged by this copy)

| file | sha256 |
|---|---|
| candidate/index.js | `08b3cd7ff96a13b3854706696fc7a1dbb39099fbf7ed52e7e2287459f219ae9d` |
| candidate/publicCredentialHold.js | `9b4fcb27a591c355ac460da87a5553a1d92702eea577e2e1e1a3322475bb7993` |
| candidate/spreadAskGate.js | `8b5a7b5cc72d8c3bdc4b6c5d3743aaf5e8a5b0d0281668dc962506c99ac3802e` |
| candidate/faqAnswerSelect.js | `37295105039f0ca25e6347a340a8b4795a3cb4db259574299cea8b130f0420f9` |
| candidate/faqAssistance.js | `6c56f2e806ad36e908420306496aaf2a02fc7e706367c99a552a3351bbf06b9c` |
| candidate/faqModuleDetectors.js | `a915bbba4df361274c0e689ea793e5a66b7e5f146940c8a63c295e2a42b68f99` |

## Unchanged

Approved guard `candidate/spreadPublicGuard.js` `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c` (same as `base/spreadPublicGuard.2158c43f.js`). No file with sha256 prefix `846c225f`.

`candidate/faqModuleAdapter.js` `7b19352003b5767cc3842bd85661d46054a195ca61b4d60e216ac14eea3d4642`. `candidate/faqModuleGates.js` `9d46fe3d520b88d7b92381a08b34d34fcfcbc442cfe98178f173f01f4785a0e8`.

## Language gate

No adapter change. `faqAssistance` passes `languageGateForTurn`, shape `{lang, language, confident, allowsAnswer, basis}`. `faqModuleAdapter.packsOptions` gives Packs `{language, confident, allowsAnswer}`. English is `{language:'en', confident:true, allowsAnswer:true}`. The cycle-2 Packs gate accepts that object and fail-closes non-English and uncertain gates.

## After the copy

Author suites on the overlaid bytes are green (Packs 1328/1328, paraphrase 266/266 and state 51/51, Atom 5798/5798). Integrated t2, t4, and t6 are not: cycle-2 `packsProductHint` returns `elite-packs` for `discount`, `subscription`, and `atom`, and the shared detector treats that hint as a Packs claim before Atom. Detail and raw counts are in `REMEDIATION_R2_NOTES.md`. This is not a PASS.
