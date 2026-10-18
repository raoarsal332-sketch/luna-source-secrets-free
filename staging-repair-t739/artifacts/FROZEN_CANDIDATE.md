# FROZEN CANDIDATE

- Candidate id: `t739-integrated-r1-full`
- Branch: `t739-mt5-shared` (private repo; never merged to main, no PR to main)
- Built on `716cd4040ae2856b8c85525dd96e19c26e49a2bc` (Atom r1 selector copy). The freeze commit that adds this file is the commit whose message is `t739: freeze t739-integrated-r1-full`.
- Packs source: `cursor/t739-packs-3f28` @ `af30a483a90437093ee7e8e6bae9863b24f89916`. Module files copied byte-for-byte. Catalog JSON unchanged.
- Atom r1 source, unchanged in this commit: `t739-atom` @ `b9af481b91fb0188d0b322bb5801cf55ce30ffa0`. `MANIFEST.json` sha256 `1b92b4885fd08baff188d326b20762dda46917b1680f625e9585b57978dda9c9`.
- Manifest: `artifacts/MANIFEST.sha256` (sha256 of the manifest file itself: `e9eab1e10e1187027a7b4a5204bd749684a231a5f197519a1be2bb4ddb13bcd9`). 99 paths, 0 mismatches.
- Requested model for remediation cycle 1: `claude-sonnet-5-5`. Actual model: `grok-4.7`.
- Author and integration owner report only. No PASS claim. Not independently reviewed.

## Default flag configuration (both OFF)

| module | flag | default | turns ON only with |
|---|---|---|---|
| Elite Packs | `LUNA_PACKS_ENABLED` | unset = OFF | `1`, `true`, `on`, `yes` (case-insensitive) |
| Elite Atom | `LUNA_ATOM_SELECTOR_ENABLED` (the Atom module's own flag) | unset = OFF | `1` |

`packsAnswerSelect` also abstains unless `opts.packsEnabled === true` (`packs-disabled-default`). Delivery wiring stays BLOCKED (`resolveExtraPath` is not added; `faqApprovedAnswers.js` has no extra-catalog loader).

## Packs r1 module files (sha256 matches `af30a48`)

| file | sha256 |
|---|---|
| packs/packsAnswerSelect.js and candidate/packs/packsAnswerSelect.js | `21e179351578906ddf725c4874f3474468655955817cbdafb7cab514e66ab58c` |
| packs/packsOwnershipPregate.js and candidate/packs/packsOwnershipPregate.js | `c8eab2121bf675128729ddf716346a004859b8435928a5da72857f5454a7516b` |
| packs/packsApprovedAnswers.js and candidate/packs/packsApprovedAnswers.js | `10dd4ef8f5fb9fd1e3a10de0bfce41ec81dde8c8119b987b0b054cbe91847a3d` |
| packs/faq-approved-answers-packs-v1.json and candidate/packs/faq-approved-answers-packs-v1.json | `bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318` |

## Unchanged in this commit

Approved guard `candidate/spreadPublicGuard.js` `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c` (same as `base/spreadPublicGuard.2158c43f.js`). No file with sha256 prefix `846c225f`.

Atom r1 selector files, unchanged:

| file | sha256 |
|---|---|
| atomAnswerScope.js | `8f2d3672680e33978f17532ebd11edda926ee2337c24821dfcd95839ceafde63` |
| atomAnswerSelect.js | `b204fc2871b1536d3c15fde123f37e2cfeb0e3105cea8f1d3085fb3dbb5883e1` |
| atomApprovedAnswers.js | `5008e3343dad76eb77cc0a4cd595b07a79ba134904c018e3320a8d85d5ccdbd8` |
| atomMoneyFrame.js | `cf40e0fceca039a96066915ffc05e8a2a36eaf56f824a0ff9bc5265d2c32f721` |
| faq-approved-answers-atom-v1.json | `df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6` |

## Language gate

No adapter change. `faqAssistance` passes `languageGateForTurn`, shape `{lang, language, confident, allowsAnswer, basis}`. `faqModuleAdapter.packsOptions` gives Packs `{language, confident, allowsAnswer}`. English is `{language:'en', confident:true, allowsAnswer:true}`. Non-English, uncertain, absent, and malformed gates abstain with a `language-gate-` reason. Passing the full five-field object into Packs selects the same English answer and fail-closes the same way.

## Shared files not edited

`candidate/faqAssistance.js` `231b58c58cd294a0122c1bf8bf91fedf9c0ab8171f8ae23618644e79c15cb004`. `candidate/faqModuleAdapter.js` `7b19352003b5767cc3842bd85661d46054a195ca61b4d60e216ac14eea3d4642`. `candidate/faqAnswerSelect.js` `ecc6bcac8883c259b0c620ba88f391fc32694eba4b4b3b14e896345d2491a8bb`.
