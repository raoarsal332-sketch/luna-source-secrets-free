# Atom section (t742 alignment)

Staging only. This file is not runtime code. It matches the MODULE ALIGNMENT CONTRACT in `staging-repair-t739/docs/T742_DESIGN_AND_ACCEPTANCE.md` on branch `t742-design` at commit `31b07389e4fef10d433c306ed7de2850f254c468`, sha256 `0aeb4ea6e1bac8366a0b45b502c9d3eeab0d5be1b7b63209bbf7d9f08c5fc1b0`. No product code is added here. `publicRouter.js` and `approvedMatcher.js` are not implemented.

Catalog bytes stay `faq-approved-answers-atom-v1.json` sha256 `df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6`. No new rows. Bodies, ids, approval, and sendability stay unchanged.

Development set: `staging-repair-t742/atom/atom_dev_set.json`  
sha256 `dee9d3f39d19b2f5de456e38ab16fa729d0d259ad5bf6edf6ec3d11e56c9b51a`  
412 synthetic English rows. Same texts as the prep set. Not an acceptance set. Disjoint from the t739 author suites.

Label changelog: `staging-repair-t742/atom/LABEL_CHANGELOG.md`  
99 decision changes. 135 representation-only alignments. 178 answer ids unchanged.

Requested model: not named. Actual model: `grok-4.7`.

## Gold rule

One approved body covers every intent in the turn, judged from that body's text: `decide` is `SEND` of that id. Otherwise `decide` is `ABSTAIN`.

Two bodies that each state every asked fact are `ABSTAIN` `COVERAGE_DENIED`. Product match, then lowest specificity, is not a labeling rule. A near-neighbour is not chosen. A question whose single approved body already covers it stays `SEND`.

`atom.handoff.unverified.en` is sendable in the catalog and is not a retrieval gold. A handoff suggestion is not a `SEND`.

## Claim

`claim` replaces the scope return `atom|packs|other|none`.

| field | values |
|---|---|
| `kind` | `exclusive`, `shared`, or `none` |
| `entity` | `atom` when `kind` is `exclusive`, otherwise `null` |
| `evidenceSpans` | offsets into the normalized text when `kind` is `exclusive`, otherwise empty |

Atom entity: the phrase `elite atom` or the token `atom`, after excluding `atomic`, `anatomy`, `anatomical`, and `atomizer`. Packs entity: the phrase `elite packs` or the token `pack` / `packs`, not inside `packet`, `package`, or `backpack`.

`exclusive` only when the Atom entity is present and the Packs entity is absent. If both entities are in the normalized text, `kind` is `none`. The router then abstains. Neither module keeps the turn. The covering id may still be recorded on `decide`. That does not give Atom the turn.

Shared words (`discount`, `subscription`, `refund`, `dashboard`, `elite` alone, `card`, `credit`, `checkout`, `simulated`) establish nothing. They do not cancel an exclusive Atom entity, and they do not select an id.

Spans in the dev set use this fold only: NFKC, lowercase, Cyrillic A/a (`U+0410` / `U+0430`) to `a`, zero-width characters replaced with a space. Spaced single letters are not joined into the token `atom`.

This set: `exclusive` 401, `none` 11, `shared` 0. Nine `none` rows contain both an Atom entity and a Packs entity (bundle asks that say pack, packs, or elite packs). `AD349` (`at0m`) and `AD353` (spaced `A t o m`) have no Atom token after that fold, so `kind` is `none`. Their `decide` stays the one covering body.

## Decide

```
{ action: 'SEND', partId, contentHash }
| { action: 'ABSTAIN', code, policy }
```

No prose. No third action. No `PERSONAL` action. `contentHash` is the catalog hash of `partId`.

| code | policy | when |
|---|---|---|
| `atom-clarification` | `null` | A clarification ask. The handoff body is not the partId. |
| `atom-2step-trailing` | `null` | A 2-Step trailing ask. Not `atom.2step.max-loss.en` and not `atom.1step.max-loss.en`. |
| `unresolved-policy` | one registry id | The registry hit outranks a matcher id. |
| `COVERAGE_DENIED` | `null` | No single sendable body covers every intent, and no veto above applies. Includes multi-intent and asks with no covering body. |

Personal status is `SEND` `atom.account-status.refuse.en` (`c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128`). A personal ask mixed with a rule ask is `COVERAGE_DENIED`: the refuse body does not state the rule, and the rule body does not state personal status.

### Trailing

`atom.1step.max-loss.en` (`78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc`) states that max loss on Atom 1-Step is 6% trailing equity. It is the only sendable Atom body that states trailing. 1-Step trailing, and trailing with no product named, are `SEND` of that id.

`atom.2step.max-loss.en` states that max loss is 10% static and that the floor never moves. It does not state trailing. A 2-Step trailing ask is `ABSTAIN` `atom-2step-trailing`.

`AD202`, `AD205`, and `AD210` ask whether the 2-Step floor chases, ratchets, or lifts. They do not contain `trailing`. The static body covers them, so they are `SEND` `atom.2step.max-loss.en`.

### Registry

Local strings are aliases only. `unresolvedPolicy` returns the stable id.

| local string | policy |
|---|---|
| `atom-fee-policy-owner-decision`, `unresolved:fee-refund` | `policy.fee-refunds` |
| `unresolved:consistency-equality` | `policy.equality-50` |
| `unresolved:news-minutes` | `policy.news-minutes` |
| `unresolved:checkout-sku`, `unresolved:checkout-sku-selection` | `policy.sku` |
| `unresolved:translation` | `policy.translations` |
| `unresolved:coupon-stacking` | `policy.coupon-stacking` |

A listed neighbour stays sendable for its own id. It is not the answer when the policy id is returned. `atom.obsolete.leverage-150-default.en` is not `policy.equality-50`. The news rows and `atom.news.minutes.unverified.en` are not `policy.news-minutes`. Price and payout bodies are not `policy.fee-refunds`. `atom.bundles.en` tells the reader to verify stacking on live checkout and does not state whether two promo codes combine.

English requests to translate stay `policy.translations`. They are not clearly non-English turns.

## Language

Clearly non-English is not a terminal Atom abstain. The router does not call `claim` or `decide` when the gate language is non-English. The main route stays as in the design. Provisional gold for that case is OWNER-PENDING. This dev set has no clearly non-English paragraph. `AD351` is a confusable the fold maps to `atom` before that gate. It is not a non-English abstain.

Uncertain language with an exclusive claim and the Atom flag off is the router's fail-closed silence. It is not an Atom `decide` code and not a public body.

## What the host must do

Atom stays disabled unless `LUNA_ATOM_SELECTOR_ENABLED=1` (or the deployed `opts.enabled === true` switch). Flag off: the router does not call `decide`. An exclusive Atom claim with the flag off is terminal silence, reason `module-off-fail-closed` or `language-uncertain-module-off`. `shared` and `none` do not silence V12 or spread.

Pause, STOP, aiOff, fin-wait, protected team, ownership, Risk, and locks stay the existing host gates and run before the router.

`resolveExtraPath` stays unwired. A match in this file is not a public send. Delivery of an Atom id, while the flag is on and delivery is absent, is `module-on-delivery-not-wired`. This section does not add the path.

`decide` calls the shared matcher when one is provided. A score does not override a veto. `T` and `M` are not chosen here.

## Dev-set counts

| gold | rows |
|---|---|
| `SEND` | 201 |
| `ABSTAIN` `COVERAGE_DENIED` | 134 |
| `ABSTAIN` `unresolved-policy` | 51 |
| `ABSTAIN` `atom-clarification` | 16 |
| `ABSTAIN` `atom-2step-trailing` | 10 |
| total | 412 |

`unresolved-policy` by id: `policy.coupon-stacking` 9, `policy.equality-50` 9, `policy.sku` 9, `policy.fee-refunds` 8, `policy.news-minutes` 8, `policy.translations` 8.

`SEND` by id:

| partId | rows |
|---|---|
| `atom.account-status.refuse.en` | 19 |
| `atom.bundles.en` | 15 |
| `atom.overview.en` | 14 |
| `atom.2step.max-loss.en` | 13 |
| `atom.1step.max-loss.en` | 12 |
| `atom.prices.list.en` | 12 |
| `atom.checkout.options.en` | 11 |
| `atom.1step.daily-loss.en` | 10 |
| `atom.2step.daily-loss.en` | 10 |
| `atom.2step.min-days.en` | 9 |
| `atom.1step.consistency.en` | 8 |
| `atom.1step.min-days.en` | 8 |
| `atom.2step.consistency.en` | 8 |
| `atom.2step.phases.en` | 8 |
| `atom.house.eas-copy.en` | 8 |
| `atom.payouts.general.en` | 8 |
| `atom.1step.leverage.en` | 6 |
| `atom.1step.news.en` | 6 |
| `atom.1step.phases.en` | 5 |
| `atom.house.simulated.en` | 5 |
| `atom.2step.news.en` | 4 |
| `atom.obsolete.10pct-1step.en` | 2 |

Eight sendable ids have no remaining `SEND` gold. Every previous gold for those ids was also stated by another body, so the gold is now `COVERAGE_DENIED`. The ids and bodies are unchanged: `atom.2step.leverage.en`, `atom.2step.reward.en`, `atom.1step.reward.en`, `atom.1step.funded-profitable-days.en`, `atom.obsolete.first-payout-14.en`, `atom.obsolete.leverage-150-default.en`, `atom.obsolete.price-161-permanent.en`, `atom.obsolete.sizes-5k-10k.en`.

## Decision changes

99 labels changed the gold id or moved between `SEND` and `ABSTAIN`. Each row, the old gold, the new gold, and the body fact are in `LABEL_CHANGELOG.md`.

| change | rows | why |
|---|---|---|
| `SEND` to `ABSTAIN` `COVERAGE_DENIED` | 95 | Two or more bodies state every asked fact. The old tie-break had kept the more specific id. |
| `atom.1step.funded-profitable-days.en` to `atom.1step.min-days.en` | 1 | `AD089` asks about a $500 day. Only the min-days body states that example. |
| `abstain:2step-trailing-uncovered` to `SEND` `atom.2step.max-loss.en` | 3 | `AD202`, `AD205`, `AD210` ask whether the floor moves and do not say trailing. The static body states the floor never moves. |

The 95 dual-coverage groups are: phase-1 target 8% (phases and checkout); 1-Step 8% not 10% (phases and the obsolete 10% body); 2-Step leverage menu and the 1:30 default (leverage, checkout, and the obsolete default body, which does not contain "150"); 1-Step "is leverage fixed" (1-Step leverage and checkout); reward menus and a no-product 80% default; first wait of 21 days and the later default of 14 days; the 3/7/14/21 interval list; the funded 5×0.5% gate and the evaluation "no minimum profitable days" sentence; funded high-impact news (the same sentence in both news bodies); 100k list prices and the permanent $161 figure; 5k/10k and the size list; "are the accounts simulated" (overview and the house body).

178 answer ids stay, because one body covers them. That includes 1-Step trailing and trailing with no product named.

135 rows change only the contract shape. Refuse becomes `SEND` of the same refuse id. Clarification becomes `atom-clarification`. Remaining 2-Step trailing asks become `atom-2step-trailing`. Multi-intent and no-covering-body become `COVERAGE_DENIED`. The six local unresolved strings become `unresolved-policy` plus the canonical policy id.

Calibration scores this file only. It is not acceptance. Do not treat 412/412 as a pass.
