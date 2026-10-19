# Atom section (t742 alignment)

Staging only. This file is not runtime code. It matches the MODULE ALIGNMENT CONTRACT in `staging-repair-t739/docs/T742_DESIGN_AND_ACCEPTANCE.md` on branch `t742-design` at commit `bce740fb6955e9fc60b3a87809b94bfb67246d7f`, sha256 `fedb3bc6a7b58172ad3af4cca6f47b2504361883ed901fa407662fa3e352783b`. No product code is added here.

Catalog bytes stay `faq-approved-answers-atom-v1.json` sha256 `df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6`. No new rows. Bodies, ids, approval, and sendability stay unchanged.

Development set: `staging-repair-t742/atom/atom_dev_set.json`  
sha256 `7fdad664f5359c12acd8a335f79ad0a6be273e3a421f52f4425aca6d702afacf`  
412 synthetic English rows. Same texts as the prep set. Not an acceptance set.

Label changelog: `staging-repair-t742/atom/LABEL_CHANGELOG.md`  
This revision changes 107 rows. The prior revision (`3c173899`) is kept below the divider.

Requested model for this alignment: not named. Actual model: `grok-4.7`.

## Gold rule

One or more approved bodies each state every asked fact, and they do not conflict: the gold is that acceptable set. Any member is a correct send. Silence on that row is a false refusal.

`decide.partId` is one member, chosen deterministically: highest cosine of IDF-weighted tokens plus overlapping character trigrams, then the lexicographically smallest `partId`. IDF is computed on the 31 sendable English bodies. `T` is not an abstain threshold. Two rows at or above `T` do not abstain.

Abstain only when no sendable body states every asked fact, or the remaining bodies state incompatible facts and are not an obsolete-versus-current split.

An obsolete row that restates the same fact stays in the set. `atom.obsolete.10pct-1step.en` and `atom.1step.phases.en` both state that the 1-Step evaluation target is 8%, not 10%. That is agreement. An obsolete row that stated an incompatible fact would be dropped, and the non-obsolete covering ids would stay. No pair in this set is that conflict. The obsolete row stays the only member when it is the only body that states the asked fact (`AD156` and `AD159` ask about an old draft; only `atom.obsolete.10pct-1step.en` says older drafts that said 10% are outdated).

A single covering body is a set of one. `AD089` stays `atom.1step.min-days.en` alone, because only that body states the $500 example. `atom.1step.funded-profitable-days.en` states the 0.5% gate and does not state $500.

`atom.handoff.unverified.en` is sendable and is not a retrieval gold.

## Claim

| field | values |
|---|---|
| `kind` | `exclusive`, `shared`, or `none` |
| `entity` | `atom` when `kind` is `exclusive`, otherwise `null` |
| `evidenceSpans` | offsets into the normalized text when `kind` is `exclusive`, otherwise empty |

Normalization before the entity check: NFKC, delete format characters, fold the detector confusable map (Cyrillic A/a to `a`), lowercase, then join a spaced single-letter run the way `normalizeForDetect` does. Digit `0` is not rewritten to `o`.

Atom entity: `elite atom` or the token `atom`, excluding `atomic`, `anatomy`, `anatomical`, `atomizer`. Packs entity: `elite packs` or the token `pack` / `packs`, not inside `packet`, `package`, or `backpack`.

`exclusive` only when the Atom entity is present and the Packs entity is absent. Both entities: `kind` is `none`. Shared words do not cancel an exclusive Atom entity and do not select an id.

This set: `exclusive` 401, `none` 11, `shared` 0.

`claim.kind` `none` is a router outcome. `decide` is not called. The row does not say `SEND`.

| router reason | rows | what |
|---|---|---|
| `both-entities` | 9 | Atom token and pack/packs/elite packs. Router abstain. No module body. |
| `no-atom-entity` | 2 | `AD349` (`at0m` is not `atom`). `AD352` (U+200B is deleted, so `atom1step` is not the token `atom`). |

`AD353` (`A t o m`) joins to `atom`. `claim` is `exclusive`. The module gold, when the flag is on, is `SEND` `atom.1step.news.en`, because that body states news trading is allowed during Atom 1-Step evaluation. Flag off, the end-to-end gold is F1 silence. The row records `route.flagOff: f1-silence`. The same flag-off silence is the end-to-end gold for every exclusive English Atom row. It is not a false refusal.

## Decide

Called only for an exclusive Atom claim, English, flag on.

```
{ action: 'SEND', partId, contentHash, acceptable: [{ partId, contentHash }] }
| { action: 'ABSTAIN', code, policy }
```

`contentHash` is the catalog hash of `partId`. `acceptable` is the set, sorted by `partId`. `partId` on `SEND` is the pick, and it is a member of `acceptable`.

| code | policy | when |
|---|---|---|
| `atom-clarification` | `null` | Clarification. The handoff body is not the partId. |
| `atom-2step-trailing` | `null` | A 2-Step trailing ask. Not `atom.2step.max-loss.en` and not `atom.1step.max-loss.en`. |
| `unresolved-policy` | one registry id | The registry hit outranks a covering id. |
| `COVERAGE_DENIED` | `null` | No single body states every intent, and no veto above applies. |

Personal status is `SEND` `atom.account-status.refuse.en` (`c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128`). A personal ask mixed with a rule ask is `COVERAGE_DENIED`.

### Trailing

`atom.1step.max-loss.en` (`78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc`) states that max loss on Atom 1-Step is 6% trailing equity. It is the only sendable body that states trailing. 1-Step trailing, and trailing with no product named, are that id. `AD349` is not this gold: `at0m` is not an entity, so the module is not called.

`atom.2step.max-loss.en` states 10% static and that the floor never moves. It does not state trailing. A 2-Step trailing ask is `ABSTAIN` `atom-2step-trailing`.

`AD202`, `AD205`, and `AD210` ask whether the 2-Step floor chases, ratchets, or lifts. They do not contain `trailing`. The static body covers them. They stay `SEND` `atom.2step.max-loss.en`.

### Registry

| local string | policy |
|---|---|
| `atom-fee-policy-owner-decision`, `unresolved:fee-refund` | `policy.fee-refunds` |
| `unresolved:consistency-equality` | `policy.equality-50` |
| `unresolved:news-minutes` | `policy.news-minutes` |
| `unresolved:checkout-sku`, `unresolved:checkout-sku-selection` | `policy.sku` |
| `unresolved:translation` | `policy.translations` |
| `unresolved:coupon-stacking` | `policy.coupon-stacking` |

A neighbour stays sendable for its own id. It is not the answer when the policy id is returned. English requests to translate stay `policy.translations`. They are not clearly non-English turns.

## Language

Clearly non-English is not a terminal Atom abstain. The router does not call `claim` or `decide` when the gate language is non-English. This dev set has no clearly non-English paragraph. `AD351` is a confusable folded to `atom` before that gate.

## What the host must do

Atom stays disabled unless `LUNA_ATOM_SELECTOR_ENABLED=1` (or the deployed `opts.enabled === true` switch). Flag off: the router does not call `decide`. An exclusive English Atom claim with the flag off is F1 silence. `shared` and `none` do not silence V12 or spread.

Pause, STOP, aiOff, fin-wait, protected team, ownership, Risk, and locks stay the existing host gates and run before the router.

`resolveExtraPath` stays unwired. A match in this file is not a public send while delivery is absent. This section does not add the path.

## Dev-set counts

| gold | rows |
|---|---|
| `SEND` (acceptable set non-empty; `partId` is the pick) | 286 |
| router abstain, `decide` not called | 11 |
| `ABSTAIN` `COVERAGE_DENIED` | 38 |
| `ABSTAIN` `unresolved-policy` | 51 |
| `ABSTAIN` `atom-clarification` | 16 |
| `ABSTAIN` `atom-2step-trailing` | 10 |
| total | 412 |

`unresolved-policy`: `policy.coupon-stacking` 9, `policy.equality-50` 9, `policy.sku` 9, `policy.fee-refunds` 8, `policy.news-minutes` 8, `policy.translations` 8.

`SEND` picks (`decide.partId`):

| partId | picks |
|---|---|
| `atom.account-status.refuse.en` | 19 |
| `atom.overview.en` | 15 |
| `atom.2step.max-loss.en` | 13 |
| `atom.checkout.options.en` | 12 |
| `atom.obsolete.leverage-150-default.en` | 12 |
| `atom.prices.list.en` | 12 |
| `atom.1step.max-loss.en` | 11 |
| `atom.obsolete.first-payout-14.en` | 11 |
| `atom.obsolete.price-161-permanent.en` | 11 |
| `atom.payouts.general.en` | 11 |
| `atom.2step.daily-loss.en` | 10 |
| `atom.2step.phases.en` | 10 |
| `atom.1step.daily-loss.en` | 9 |
| `atom.1step.leverage.en` | 9 |
| `atom.1step.min-days.en` | 9 |
| `atom.2step.min-days.en` | 9 |
| `atom.2step.news.en` | 9 |
| `atom.1step.consistency.en` | 8 |
| `atom.1step.funded-profitable-days.en` | 8 |
| `atom.1step.reward.en` | 8 |
| `atom.2step.consistency.en` | 8 |
| `atom.house.eas-copy.en` | 8 |
| `atom.house.simulated.en` | 8 |
| `atom.obsolete.10pct-1step.en` | 8 |
| `atom.1step.phases.en` | 7 |
| `atom.2step.reward.en` | 7 |
| `atom.bundles.en` | 7 |
| `atom.obsolete.sizes-5k-10k.en` | 7 |
| `atom.1step.news.en` | 6 |
| `atom.2step.leverage.en` | 4 |

The eight ids that had lost every `SEND` label are members again wherever their body states the asked fact. Membership is wider than the pick count, because another member of the same set can be the pick:

| id | rows whose acceptable set includes it |
|---|---|
| `atom.2step.leverage.en` | 17 |
| `atom.obsolete.leverage-150-default.en` | 17 |
| `atom.obsolete.first-payout-14.en` | 11 |
| `atom.obsolete.price-161-permanent.en` | 11 |
| `atom.1step.funded-profitable-days.en` | 9 |
| `atom.1step.reward.en` | 9 |
| `atom.2step.reward.en` | 9 |
| `atom.obsolete.sizes-5k-10k.en` | 7 |

## Rows changed in this revision

107. Each row, the old gold, the new gold, and the body fact are in the revision `bce740fb` section of `LABEL_CHANGELOG.md`.

| change | rows | why |
|---|---|---|
| `ABSTAIN` `COVERAGE_DENIED` back to an acceptable set | 95 | Two or more bodies state every asked fact and agree. The two-above-threshold abstain is withdrawn. |
| both-entities `SEND` or module abstain removed | 9 | Pack and Atom entities are both present. Router abstain. `decide` is not called. |
| `AD349` `SEND` removed | 1 | `at0m` is not the atom token. Router abstain. The 1-Step trailing body is not the end-to-end gold. |
| `AD352` `SEND` removed | 1 | U+200B is deleted. `atom1step` is not the token `atom`. Router abstain. |
| `AD353` claim `none` to `exclusive` | 1 | Spaced letters join to `atom`. Module gold stays `atom.1step.news.en`. Flag off is F1 silence. |

The 95 restored groups are: phase-1 target 8% (phases and checkout); 1-Step 8% not 10% (phases and the obsolete 10% body); the 2-Step leverage menu and the 1:30 default (2-Step leverage, checkout, the obsolete default body, and, for a no-product default ask, the 1-Step leverage body because it states the published default of 1:30); 1-Step "is leverage fixed"; reward menus and a no-product 80% default; first wait of 21 days and the later default of 14; the 3/7/14/21 interval list; the funded 5×0.5% gate and "no minimum profitable days" in evaluation; funded high-impact news (the same sentence in both news bodies); 100k list prices and the permanent $161 figure; 5k/10k and the size list; "are the accounts simulated" (overview and the house body).

Calibration scores this file only. Sending any member of `acceptable` is correct. It is not acceptance. Do not treat 412/412 as a pass.
