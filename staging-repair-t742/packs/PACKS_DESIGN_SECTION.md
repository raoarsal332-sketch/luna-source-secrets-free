# Packs section (aligned to t742-design)

Authority: branch `t742-design`, commit `31b07389`, `staging-repair-t739/docs/T742_DESIGN_AND_ACCEPTANCE.md` sha256 `0aeb4ea6e1bac8366a0b45b502c9d3eeab0d5be1b7b63209bbf7d9f08c5fc1b0`. Sections (b), (f), (g), (h), and (j) of that file win. This section does not add catalog rows, edit bodies, edit ids, or edit sendability. No product code.

Requested model: not named in the alignment instruction. Actual model: grok-4.7.

Catalog stays `staging-repair-t739/packs/faq-approved-answers-packs-v1.json`, sha256 `bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318`.

## claim and decide

Packs exports only these, matching (h). There is no other ownership return. `packsProductHint` does not set `exclusive` and the router does not call it.

```
claim({ text, normalized, prior }) ->
  { kind: 'exclusive'|'shared'|'none', entity: 'packs'|null, evidenceSpans: [{start, end}] }

decide({ text, normalized, prior, gate, claim }) ->
  { action: 'SEND', partId: string, contentHash: string }
  | { action: 'ABSTAIN', code: string, policy: string|null }

unresolvedPolicy(normalized) -> null | <canonical policy id from the registry in (h)>
```

`decide` returns no prose and no third action. There is no `PERSONAL` action.

`claim` follows (b):

| Text after `normalizeForRoute` | `kind` | `entity` |
| --- | --- | --- |
| Packs entity present, Atom entity absent | `exclusive` | `packs` |
| Selector word present, Packs entity absent | `shared` | `null` |
| No Packs entity and no selector word | `none` | `null` |
| Both the Packs entity and the Atom entity present | `none` | `null` |

Packs entity: the phrase `elite packs` or the token `pack` / `packs`, including forms the normalizer already folded. `pack` inside `packet`, `package`, or `backpack` is not an entity. Atom entity: `elite atom` or `atom`, after exclusions `atomic`, `anatomy`, `anatomical`, `atomizer`.

Selector words, shared for both modules, establish nothing: `discount`, `subscription`, `refund`, `dashboard`, `elite` alone, `card`, `credit`, `checkout`, `simulated`, and `atom` when it is not this module's entity. `evidenceSpans` is empty unless `kind` is `exclusive`.

Both entities: `kind` is `none`. The router abstains. Packs does not keep the turn. `decide` is not called.

The router calls `decide` only after `claim` returns the one `exclusive` owner and the language is `en`. Flag off: the router never calls `decide`.

## Language

Clearly non-English is not a module claim. Packs does not fail closed, does not return a terminal abstain, and does not call the turn handled. The router does not call `claim` or `decide`. The main route stays as (f). Provisional gold for that stratum is OWNER-PENDING.

Uncertain language on an exclusive claim with the flag off is fail-closed silence, and the router does that. Packs does not emit a public body for it.

## decide

`decide` calls `matchApproved` on the product pool. A matcher win does not override a veto.

Product pool: sendable English rows whose `intentTags` are allowed for the product role. `scopeAllows` already keeps `accountStatusBoundary` and `handoff` out of that role. The product matcher does not score those two ids.

Role index, still in the catalog index, not in the product overlap pool:

| id | contentHash | When it is SEND |
| --- | --- | --- |
| `packs.account-status.refuse.en` | `084d4da1970176508bcf2f994e003c466cfe2a44f1226070c2c335dc43a580ea` | A Packs personal-account ask, and a Packs turn that is both personal and a product question. The refuse body is the only part. Its text says it cannot confirm whether the account received a pack, card, Exotic, The Million, credits, a subscription charge, or any personal eligibility or ownership status. |
| `packs.handoff.unverified.en` | `711e367ff423b475860478dbd2e5b66d1b8c0b3372efd0298558876cc0f940f0` | Its own handoff role only. It is not the near-neighbour answer. |

Near-neighbour product rows whose texts do not cover every intent: `ABSTAIN`. Not `packs.handoff.unverified.en`.

One approved body covers every intent, read from that body's text: `SEND` that id and its catalog `contentHash`. Otherwise `ABSTAIN`. Two product rows at or above `T`: `ABSTAIN`, code `two-above-threshold`, not the more specific row. A question whose single approved body already covers it is not relabelled `ABSTAIN`.

Multi-intent with no single covering body: `ABSTAIN`, code `COVERAGE_DENIED`.

If `unresolvedPolicy` returns a canonical id, `decide` returns `ABSTAIN` with `code: 'unresolved-policy'` and that `policy`, even when the matcher returned an id.

## Vetoes

These two are in the registry in (h). Packs did not name them before this alignment. They force abstain. They do not select an id.

| Policy | Do not SEND | The row stays sendable for its own text |
| --- | --- | --- |
| `policy.fee-refunds` | `packs.refunds-legal.en` (`e39b5fe616372c3c7eaaf2a36ca849d6491266f6981e1f260173d564b16ae00c`) | Pack-purchase finality, the Italian Consumer Code, age 18+, and the refusal to give an individual legal conclusion. Not evaluation-fee, challenge-fee, reset, or duplicate-charge refunds. |
| `policy.coupon-stacking` | `packs.discount-stacking.en` (`e97f34e85a768bb6b3fcb1ac70f4329a4b4721614c00cc662ba7bfe39f34be3e`) | Ordinary discount cards stacking as the card states, and Founder's Key at 60% for one year. Not homepage or newsletter coupons. |

## Packs policy ids

Local names map onto the canonical ids. There is no second registry.

| Former local name | Canonical id | Not a substitute |
| --- | --- | --- |
| `free-pack-tier-conflict` | `policy.free-pack-tier-conflict` | `packs.free-packs-general.en` |
| `the-million-every-rule-conflict` | `policy.the-million-every-rule-conflict` | `packs.the-million.en` |
| `live-bundle-sizes` | `policy.live-bundle-sizes` | none |
| `live-offer-freshness` | `policy.live-offer-freshness` | none |
| `dashboard-only-meter-thresholds` | `policy.dashboard-only-meter-thresholds` | `packs.dashboard-tabs.en` |
| `opened-pack-statutory-right` | `policy.opened-pack-statutory-right` | `packs.refunds-legal.en` |

Each of these is `ABSTAIN` / `unresolved-policy`. The named neighbour is not sent in place of the policy.

## Development set

`staging-repair-t742/packs/devset/packs-dev-t742.json`

sha256 `efa61f9fc1bc6d4c00259fff0db5d4b8b2feebcc644004b227a91c9a513c9f6d`

Sidecar: `staging-repair-t742/packs/devset/packs-dev-t742.sha256`

Changelog of gold changes: `staging-repair-t742/packs/devset/LABEL_CHANGELOG.md` (82 rows).

336 synthetic English rows. No non-English row is labelled as a terminal Packs abstain. `claim` is recorded on every row. `outcome` is `SEND` or `ABSTAIN` only.

| Gold | Rows |
| --- | --- |
| `SEND` `packs.account-status.refuse.en` | 58 |
| `SEND` other single covering product ids | 168 |
| `ABSTAIN` `COVERAGE_DENIED` | 64 |
| `ABSTAIN` `two-above-threshold` | 22 |
| `ABSTAIN` `policy.free-pack-tier-conflict` | 5 |
| `ABSTAIN` `policy.fee-refunds` | 4 |
| `ABSTAIN` `policy.live-offer-freshness` | 3 |
| `ABSTAIN` `policy.coupon-stacking` | 2 |
| `ABSTAIN` `policy.the-million-every-rule-conflict` | 2 |
| `ABSTAIN` `policy.live-bundle-sizes` | 2 |
| `ABSTAIN` `policy.dashboard-only-meter-thresholds` | 2 |
| `ABSTAIN` `policy.opened-pack-statutory-right` | 2 |
| `ABSTAIN` `router-both-entities` (claim `none`, decide not called) | 2 |

`SEND` total 226. `ABSTAIN` total 110. Claim kinds on the 336 rows: `exclusive` 94, `shared` 140, `none` 102.

`PD-183` stays `SEND` `packs.atom-bundle-distinct.en` because that body states the three-account example and the do-not-assume-they-combine rule. Its `claim.kind` is `none` because both entities are present, so the router does not call `decide`. The coverage label was not moved to `ABSTAIN`.

`PD-219` and `PD-250` are the two `router-both-entities` rows. They are personal or mixed and also contain both entities. Packs returns `kind: none` and does not `SEND` the refuse body.

Freeze this dev-set hash before any sealed set exists. Do not retune `T` or `M` on a sealed set. This file is not a pass.
