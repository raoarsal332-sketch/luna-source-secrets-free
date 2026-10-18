# Atom section (t742 prep)

Staging only. This is not runtime code and not a candidate. The shared router, matcher, and public-write contract is being written by the lead architect. This file states what Atom needs from that contract. Do not implement it from this note.

Catalog bytes stay `faq-approved-answers-atom-v1.json` sha256 `df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6`. No new rows. Bodies, ids, approval, and sendability stay unchanged.

Development set: `staging-repair-t742/atom/atom_dev_set.json`  
sha256 `d24a200c3ead820a4dfe5e55031b9f3800d4c2ef3a5bfbb615833beba50c505e`  
412 synthetic English rows. Not an acceptance set. Disjoint from the t739 author suites (controls, general, adversarial, probes, varied, held-out, and the strings embedded in those runners): no normalized row text equals a prior quoted string, and no prior quoted string of 48 characters or more is contained in a row.

Requested model for this prep: not named. Actual model: `grok-4.7`.

## Owner rules encoded in the labels

- Retrieval returns an existing sendable id only when one approved body covers the ask.
- Clarification is not an action. Missing product or missing approved wording is `abstain:clarification-unapproved`.
- Explicit Atom 2-Step trailing is `abstain:2step-trailing-uncovered` until an approved policy and body cover it. The static 2-Step max-loss body is not that body. 1-Step trailing, and trailing with no product named, stay `atom.1step.max-loss.en`.
- Two intents abstain (`abstain:multi-intent`) unless one approved body states every intent. A registry clause outranks that and uses the registry code.
- Personal status returns `atom.account-status.refuse.en` and no other id.
- Packs words do not move an Atom product ask off Atom. `module` is `atom` on every row.
- Atom stays disabled in deployed config. A calibration match is not a public send.

## Catalog record fields

One signed record per existing English id. The record may only narrow the JSON. It must not add a body or flip `sendable`.

| field | required | meaning |
|---|---|---|
| `id` | yes | Existing id. Unchanged. |
| `contentHash` | yes | Rechecked against the JSON before any id is returned. |
| `sendable` | yes | Copied from the JSON. `false` rows are not retrieval targets. |
| `retrieval` | yes | `false` for `atom.handoff.unverified.en`, `atom.consistency.boundary.en`, and `atom.news.minutes.unverified.en`. Also `false` whenever `sendable` is false. |
| `locale` | yes | `en` for this set. |
| `product` | yes | `atom-1step`, `atom-2step`, or `any`. |
| `topic` | yes | One topic drawn from the row that already exists: overview, phases, daily-loss, max-loss, min-days, funded-days, consistency, news, leverage, reward, payout, price, checkout, bundle, eas-copy, simulated, correction, refuse. |
| `states` | yes | Proposition names the body already states. Owner-signed. Not a paraphrase of a missing policy. |
| `contradicts` | yes | List of `{ premise, correctionAllowed }`. Empty when the body does not deny a premise. |
| `specificity` | yes | Integer. Lower is narrower. Used only for the tie-break below. |

2-Step max loss record, required shape: `contradicts` contains `{ premise: "2step-trailing", correctionAllowed: false }`. An ask that asserts 2-Step trailing does not retrieve `atom.2step.max-loss.en`. `correctionAllowed` stays false until the owner supplies a policy and a body. This prep does not supply either.

Tie-break when more than one `retrieval: true` record entails the ask: keep records whose `product` matches a named product; then keep the lowest `specificity`; if two remain, `abstain:clarification-unapproved`. That is how a simulation-only ask prefers `atom.house.simulated.en` over overview, a size-list ask prefers `atom.obsolete.sizes-5k-10k.en` over the price table, and a no-product default-leverage ask prefers `atom.obsolete.leverage-150-default.en`. The dev set is labeled under this tie-break.

`states` for a combined ask is a superset check. Example already in the dev set: the general payout row states both the first wait and the cap, so that pair is one id. Daily loss plus a phase target is two records, so it abstains.

## Registry

Names only. The matcher stores the name and the abstain code. It does not store a description, a formula, or a decision.

| name | abstain code |
|---|---|
| `fee-refund` | `unresolved:fee-refund` |
| `consistency-equality` | `unresolved:consistency-equality` |
| `news-minutes` | `unresolved:news-minutes` |
| `checkout-sku` | `unresolved:checkout-sku` |
| `translation` | `unresolved:translation` |
| `coupon-stacking` | `unresolved:coupon-stacking` |

A registry hit on any clause abstains the turn with that code and no `answerId`. The non-sendable boundary rows in the JSON are not substitutes for these names.

## Abstain codes

| code | when |
|---|---|
| `unresolved:fee-refund` | registry `fee-refund` |
| `unresolved:consistency-equality` | registry `consistency-equality` |
| `unresolved:news-minutes` | registry `news-minutes` |
| `unresolved:checkout-sku` | registry `checkout-sku` |
| `unresolved:translation` | registry `translation` |
| `unresolved:coupon-stacking` | registry `coupon-stacking` |
| `abstain:clarification-unapproved` | product or wording would need a clarification, and none is approved for delivery |
| `abstain:2step-trailing-uncovered` | the ask asserts Atom 2-Step trailing |
| `abstain:multi-intent` | more than one intent, and no single retrieval record states them all |
| `abstain:no-covering-body` | Atom-scoped, and no retrieval record entails the ask |

There is no `clarify` action in the Atom result.

Personal status is not an abstain code. It is `kind: "refuse"` with `answerId: "atom.account-status.refuse.en"`.

## Interface needs

The host contract should expose these, without Atom embedding a second router.

**Router.** Input is the turn text plus prior customer texts. Output is `{ module: "atom" | "packs" | "other" | "none", reason }`. If the product is Atom, `module` is `atom` even when the text also contains Packs vocabulary (pack, credits, discount, subscription, market maker, elite packs, checkout, card). Packs vocabulary never owns that turn. The dev rows set `module: "atom"` for this reason. Ambiguous product with no Atom and no Packs referent is `none`, not a guess.

**Control short-circuit, before the matcher.** Deployed config leaves Atom disabled. `enabled` defaults false. Pause, STOP, aiOff, fin-wait, protected team, ownership, Risk, and locks are the existing host gates. The matcher is not called. A disabled module does not public-write.

**Language.** The shared language gate is required. Missing, non-English, or uncertain fails closed. This dev set is English only, including obfuscated English.

**Matcher result.**

- `kind: "answer"` and a retrieval id. `contentHash` must match the catalog. `sendable` must be true. `retrieval` must be true.
- `kind: "refuse"` and `atom.account-status.refuse.en` only.
- `kind: "abstain"` and one code from the table above. `answerId` is absent. `atom.handoff.unverified.en` is not filled in.

**Public write.** Even an `answer` result is not a customer send while Atom is disabled in deployed config, and not until delivery of any clarification wording is verified. Clarification wording is not approved in this prep, so clarification stays abstain. `resolveExtraPath` stays unwired. This section does not add it.

**Calibration.** Score `atom_dev_set.json` as development only. Exact id on `kind: "answer"`, exact reason on `kind: "abstain"`, refuse id on `kind: "refuse"`. Do not tune on a sealed set. Do not treat 412/412 as acceptance.

## Dev-set counts

| label | rows |
|---|---|
| sendable answer ids (30 retrieval ids, every one present) | 274 |
| `atom.account-status.refuse.en` | 19 |
| `abstain:multi-intent` | 23 |
| `abstain:clarification-unapproved` | 16 |
| `abstain:no-covering-body` | 16 |
| `abstain:2step-trailing-uncovered` | 13 |
| `unresolved:checkout-sku` | 9 |
| `unresolved:consistency-equality` | 9 |
| `unresolved:coupon-stacking` | 9 |
| `unresolved:fee-refund` | 8 |
| `unresolved:news-minutes` | 8 |
| `unresolved:translation` | 8 |
| total | 412 |

`atom.handoff.unverified.en` is sendable in the catalog and is intentionally not a gold id.
