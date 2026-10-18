# Atom r1 selector import

This commit is after the `t739-integrated-r1` freeze. It does not change that freeze.

- Source branch: `t739-atom`
- Source commits: `2e4051d`, `29e76f7`, `b9af481b91fb0188d0b322bb5801cf55ce30ffa0`
- Author `MANIFEST.json` sha256: `1b92b4885fd08baff188d326b20762dda46917b1680f625e9585b57978dda9c9` (matches the first line of that commit's `MANIFEST.sha256`)
- Destinations: `staging-repair-t739/atom/` and `staging-repair-t739/candidate/atom/`
- The five selector files were copied byte-for-byte. They were not edited.

| file | bytes | sha256 |
|---|---|---|
| atomAnswerScope.js | 5772 | `8f2d3672680e33978f17532ebd11edda926ee2337c24821dfcd95839ceafde63` |
| atomAnswerSelect.js | 39451 | `b204fc2871b1536d3c15fde123f37e2cfeb0e3105cea8f1d3085fb3dbb5883e1` |
| atomApprovedAnswers.js | 4729 | `5008e3343dad76eb77cc0a4cd595b07a79ba134904c018e3320a8d85d5ccdbd8` |
| atomMoneyFrame.js | 19126 | `cf40e0fceca039a96066915ffc05e8a2a36eaf56f824a0ff9bc5265d2c32f721` |
| faq-approved-answers-atom-v1.json | 148077 | `df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6` |

`atomApprovedAnswers.js` and `faq-approved-answers-atom-v1.json` are the same bytes as the previous import. `t7` still checks that `candidate/atom` matches `atom/` for these five files.

## Delivery stays blocked

`resolveExtraPath` was not added. `candidate/faqApprovedAnswers.js` has no extra-catalog loader and was not modified. The Atom ON path remains `module-on-delivery-not-wired`. Packs r1 was not copied.

`artifacts/MANIFEST.sha256` and `artifacts/FROZEN_CANDIDATE.md` still describe frozen content commit `76e1c9ee8be6aa522818a8905a6d98af21621ac8`. They were not regenerated for this copy.

## Suites after the copy (`unshare -rn`)

- `tests/t6_modules.js`: 35 passed, 0 failed, 35 total
- `tests/t7_corpus_equivalence.js`: 6 passed, 0 failed, 6 total. Atom general+controls equal 206/206. Catalog bodies scanned 474, holds 0.
- Author r1 suite from commit `b9af481`, with these selector bytes overlaid: `node --test` 21 pass, 0 fail; `TOTAL 5798 pass 5798 fail 0`. Corrected sendable leaks 0. Corrected false refusals 0.

The in-repo `atom/tests` directory is still the initial import (`f096125`). Its older `report_counts` expectations report two fails against the r1 selector: GN35 now answers `atom.overview.en` (the old expectation was `clarify`) and GN40 now answers `atom.bundles.en` (the old expectation was `abstain`). Those are the expectations in the author's r1 `general.js`, which was not part of the selector copy. The r1 suite above is the check against the frozen manifest's tests.

Raw output: `artifacts/raw/atom_r1_import.out`, `artifacts/raw/cand_t6_after_atom_r1.out`, `artifacts/raw/cand_t7_after_atom_r1.out`, `artifacts/raw/atom_local_suite_after_r1_selectors.out`.
