# Freeze manifest — one candidate for fresh-case review

Label: AUTHOR-TESTED. Not accepted. Not a sealed pass.
Actual model: grok-4.7. Frozen `T=0`, `M=null`. No label or threshold change.
Staging only. No production, no Intercom, no sealed set was read.

This file is part of the freeze commit on `t742-impl`. The review identity is the file hashes below. The commit sha is the `t742-impl` head that adds this file.

Parents:

| Piece | Identity |
| --- | --- |
| Outbound contract | `98e3a9164f132772d898fbb1429b479b3804acb8` |
| Atom cycle 2 integration | `31d8f7bf1d550cebf6bd0f00055d538fff502df8` |
| Atom module | sha256 `63165ef6a01defdb5b0e29b1424fa3421b181ad1b99916ab637d4930b29d52bd` (source commit `db98c83440a389290e84aa405227fa7d6fc7ad82` on `t742-impl-atom`, PR #9) |
| Packs cycle 2 source | `cfcc229238c93d3413be56ce8b33b8b9488931dc` on `t742-impl-packs`, PR #10 |

## Authority

Final outbound authorization remains the contract from `98e3a91`: approved answer, approved refusal, terminal abstain, hold, or normal unprotected. `coversAllIntents` still requires a valid `T`, an existing row, then `approvedRefusalEligible`, then the unresolved-policy veto, then the two-step trailing veto, then `statementCovers`. Exclusive flag-off denial, the ownership-lock skip, and the exact-catalog screen skip stay in force.

## Conflict resolutions

Packs module files were taken from `cfcc2292` with no further logic edits: `packsApplicability.js`, `packsAccount.js`, `packsClaim.js`, `packsDecide.js`, and `packs/tests/cycle2/`. Atom `atomModule.js` was not edited.

| Packs change on the shared files | Resolution |
| --- | --- |
| `packsPropositionCovers` returns `bodyCovers` first and skips the fact file | Not taken. Frozen `coversByFacts` stays first and is authoritative when it returns true. `bodyCovers` runs only after a fact miss. The refuse id is never approved by `bodyCovers`. If `packsAccount.isPersonalOrMixed(normalized, prior)` is true, the fallback returns false, so a product id cannot become eligible on an account-state turn. `coversAllIntents` is not replaced. |
| Boundary allows `packs.account-status.refuse.en` by skipping `coversAllIntents` whenever the account predicate is true | Not taken. The refuse id still goes through `coversAllIntents`. `approvedRefusalEligible` now passes `prior` into `isPersonalOrMixed`, so an anaphoric follow-up can qualify without a path that returns ok before the contract checks. |
| Boundary concatenates the previous customer sentence onto `and` / `also` / pronoun turns before coverage | Taken only for a non-refuse catalog id, and only when that join is not an account-state Packs ask. An account-state product id is checked on the current sentence alone. The refuse id is not joined and is not exempt from `coversAllIntents`. |
| `faqAssistance.execute` screens first, then restores the raw core if the screen empties an exact body | Not taken. The contract already skips the instruction-voice screen when `assertAllowlistedFinal` reason is `exact`. The screen-then-restore path was not added. |
| `postReplyWithOwnershipLock` skips the screen for one paragraph whose whole text is a catalog hit | Not taken. `approvedParagraphComposition` already skips the screen when every paragraph is catalog, template, spread, or greeting. A single-paragraph check misses the greeting prefix on PD-072. |
| `handleWebhook` stores `priorNorm` on the bound turn | Taken. `postClientCommentOnce` fills `priorNorm` from earlier customer parts only when the bound turn does not already have an array. |
| Flag-on uncertain exclusive Packs account-state is treated as English (`basis: account-state-english`) so `decide` runs | Taken. Non-English still returns before claims. A bare uncertain term such as `packs?` stays `language-uncertain-module-on`, non-terminal, with `suppressPublicComposition`. This does not bypass `coversAllIntents` or the refuse rule. |

## Open conflicts left visible

t6 ON2. The assertion still expects `module-send` and `atom.account-status.refuse.en` for "Can I get my Atom challenge fee back after the first payout?". Atom cycle 2 runs `policyOf` before `isPersonalOrMixed`. `explain().personal` is false when that policy is set. The integrated result is terminal `unresolved-policy` (`policy.fee-refunds`). Atom logic was not changed to satisfy the assertion.

t3 frozen pair, both in `tests/t3_faq_language_module.js`:

- "F1 detector that throws counts as a hit (fails closed)". After `gates.reset()`, a throwing detector is registered, and the input is "What is the weather like for trading today in general?". Expected reason `module-off-fail-closed`. Actual reason `existing-unowned-faq-path`.
- "F1 no gate registered (shipped default): prepare equals baseline behaviour on the same input". After `gates.reset()`, input `ENG` is "Do you have the Elite Packs for sale right now?". Expected reason is not `module-off-fail-closed`. Actual reason is `module-off-fail-closed`, because the real Packs claim path still fail-closes flag-off exclusive English.

## Held-out

Packs author's own result on required sends is 7/12 exact. This tree was not tuned toward that score. No proposition, threshold, label, applicability rule, or example was edited after the measurement.

The same `new-examples.json` holdout rows (bucket `send` or `refuse`, 12 rows) were run once through `handleWebhook` on this tree. Exact posted catalog id: 7/12. Exact ids: N08, N14, N17, N20, N23, N28, N34. Not exact: N02, N05, N11, N26, N31. N26 and N31 called the scripted model and did not post the gold id. The two holdout abstain rows, N37 and N40, posted nothing.

## Author-tested on this head

| Check | Result |
| --- | --- |
| t1 detector | 57/57 PASS |
| t2 transport | 54/54 PASS |
| t3 faq/language/module | 27/29 FAIL (frozen pair above) |
| t4 logs | 8/8 PASS |
| t5 isolation (`unshare -rn`) | 10/10 PASS |
| t6 modules | 38/39 FAIL (ON2, Atom policy before refuse) |
| t7 corpus | 6/6 PASS |
| t8 remediation | 7/7 PASS |
| t9 remediation | 6/6 PASS |
| t10 contract | 5/5 PASS |
| Packs dev `decide` / `route` | 94/94, false refusals 0/69 PASS |
| Packs gold-send `handleWebhook` | 69/69 approved, 0 model, 0 silence PASS |
| Atom dev module and router | 401/401, false refusals 0/287, router mismatches 0, catalog plans 287/287 PASS |
| Packs holdout required sends | 7/12 exact (not tuned) |
| Sealed set | UNTESTED |
| Production / Intercom | BLOCKED |

## File hashes

Unchanged:

| File | sha256 |
| --- | --- |
| `docs/T742_DESIGN_AND_ACCEPTANCE.md` | `17e89179ae28881e2eb20b1116be7f852750ba0958009947a61c8269f820808c` |
| `candidate/matcher-params.json` | `05e542ada2b4f3a937c6422c308b4f72070a7fa6a25c7cfd1fe3b9e53ad8df3f` |
| `candidate/spreadPublicGuard.js` and `base/spreadPublicGuard.2158c43f.js` | `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c` |
| Packs catalog `faq-approved-answers-packs-v1.json` | `bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318` |
| Packs propositions | `aff0f61f9eff749cb81bb4955369f24ff50610e6796a8f16ecb3431dc2629e2f` |
| Atom catalog `faq-approved-answers-atom-v1.json` | `df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6` |
| `candidate/faqAssistance.js` | `e07e83d48259093fc83e18a508df2b333d5bce1aac30b006046b3480c2b22e76` |
| `candidate/control.js` | `34b32e39971a5f990f4a63ab07c541ce184e62ec6ae5c6aa685d18b42d3611f2` |
| `candidate/ownershipWriteLock.js` | `ee4e3f545eb9892b85c103c5db97344f6f56f90d123233e644d451356226b663` |
| `candidate/spreadTestState.js` | `231a28fa490933f61beb056b7dea0b43d48cb889944d04d562331fc1cc8cd328` |

Integrated on this head:

| File | sha256 |
| --- | --- |
| `candidate/approvedMatcher.js` | `12636426bb5df7dc4aa9ae7da29bced3fa28f48bd96228f565a033a4ce6a8f7e` |
| `candidate/publicRouter.js` | `dec698c04fac0145ea272cf6992139cbf61c70ec868c50aeb0268f6b74a522f3` |
| `candidate/publicWriteBoundary.js` | `eb6da7444d5c39693bfd3676e28bcd198de48929db15c801a5089009908e9c30` |
| `candidate/index.js` | `61b27c6c701bfa137efac67ad5c8e76bd6bbc6e2910f378623546f974397b65b` |
| `packs/impl/packsApplicability.js` | `cf51c571312f4c5520046060b3006ef5f237c44bf944d7a8a99465c70222f339` |
| `packs/impl/packsAccount.js` | `c9eea6d7dc9c5bddc11135b8d26bc9cd24549391ed0169060fe6ccbd6e57db3d` |
| `packs/impl/packsClaim.js` | `199169803e6c5081ac493e611fdfa176b2b94b603a08394241820fe03158e757` |
| `packs/impl/packsDecide.js` | `3d3ac5068fdfc41e40b74fc2f1afd0e113bce2616828bf3c79d3701e29ae3f1e` |
| `atom/atomModule.js` | `63165ef6a01defdb5b0e29b1424fa3421b181ad1b99916ab637d4930b29d52bd` |
