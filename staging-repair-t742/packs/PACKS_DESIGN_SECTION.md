# Packs section (t742 design draft)

Staging only. Prep for the shared router, matcher, and public-write contract. No runtime code in this change. No new catalog rows. No body, id, or sendability edits.

Requested model: not named in the t742 prep instruction. Actual model: grok-4.7.

Catalog locked at `staging-repair-t739/packs/faq-approved-answers-packs-v1.json`, sha256 `bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318` (44 English rows, 40 sendable). Development set below is synthetic, disjoint from `tests/paraphrases.js`, `tests/heldout.js`, and `tests/cases.js`, and is not a sealed set. Sealed question text was not read. The 26 neighbour pairs are the body-overlap set for the wrong-id failure class (overview against auto-apply, credits against withdraw, My Packs against Pack Pass, Whale and Oracle against price, odds, and floor, inventory against eligibility). They are not a reconstruction of sealed items.

Packs stays disabled in deployed config. `packsEnabled` is not implied by the environment. This draft does not add a switch.

## Module interface

The host owns routing. Packs does not export an ownership signal. `packsProductHint`, topic scores, and selector regexes must not be consulted to decide that a turn belongs to Packs. The tokens atom, discount, subscription, refund, credits, keys, and checkout do not establish Packs ownership. A not-packs-owned turn never reaches retrieval. If Packs is invoked by mistake, the gold outcome is still `ABSTAIN` / `not-packs-owned`, not a nearby pack row.

Order after the host has assigned the turn to Packs:

1. Control gates abstain before any read (STOP, aiOff, global pause, fin-wait, protected team, locks). Unchanged.
2. Language gate fails closed unless English and confident.
3. Personal-state stop. A hit blocks retrieval. Absence of a hit does not authorize an answer.
4. Obfuscation gate. Concealed spelling abstains. Do not deobfuscate into an id.
5. Unresolved-policy registry. A registered fact abstains even when a nearby body shares words.
6. Matcher over the sendable index only. One body must cover every asked fact. Otherwise abstain. Two bodies that each cover the asked fact abstain. Do not pick the higher score.

### Personal-state stop

```
personalStateStop(text) => {
  decision: 'no-hit' | 'refuse' | 'handoff',
  reason: 'personal-account-state' | 'personal-mixed-stop' | null,
  blocksRetrieval: boolean
}
```

| decision | blocksRetrieval | When | Dev-set outcome |
| --- | --- | --- | --- |
| no-hit | false | No positive request for this customer's account value, balance, delivery, ownership, eligibility, meter, or receipt | Not PERSONAL. Matcher may still abstain. |
| refuse | true | The asked fact is that account value | `PERSONAL`, reason `personal-account-state`, `stopDecision` `refuse` |
| handoff | true | A personal-state hit shares the message with any other intent | `PERSONAL`, reason `personal-mixed-stop`, `stopDecision` `handoff` |

`no-hit` is not permission to send. First person plus a policy verb, asking the published rule, is `no-hit` (dev slice `first-person-policy`, outcome `SEND` of the one covering body). Asking the value on the customer's own account is `refuse`. A generic "if I cancel" that asks the published cancel rule is not a refuse.

The stop does not return a retrieval score. The customer text for `refuse` may be the already-approved body `packs.account-status.refuse.en`. The customer text for `handoff` may be `packs.handoff.unverified.en`. Those two ids are templates for the stop and for abstention. They are not matcher targets. The dev set never labels them `SEND`.

### Catalog record fields

Index a row only when all of these hold:

- `id` ends in `.en`
- `locale` and `language` are `en`
- `approval` is `source-verified`
- `sendable` is true and `selectable` is not false
- `status` is not `needs_owner_decision` or `provisional`
- `translationStatus` is not `unverified`
- `intentTags` contain none of `nonSendable`, `conflict`, `failClosed`, `everyRuleLifted`

Fields the matcher may read: `id`, `body`, `contentHash`, `locale`, `language`, `approval`, `status`, `sendable`, `selectable`, `intentTags`, `program`, `source.sourceKey`.

`intentTags` may only narrow. They never make a non-sendable row sendable and never add a row the gates above excluded.

Drop these two sendable ids from the product index. They are stop and abstain templates:

- `packs.account-status.refuse.en`
- `packs.handoff.unverified.en`

That leaves 38 product targets. The dev set has at least two `SEND` rows for each.

Do not index `packs.the-million-every-rule-conflict.en`, `packs.free-packs-provisional.en`, `packs.free-packs-help-center.en`, `packs._fail_closed.en`, or any `ur-latn` row.

### Matcher result

```
match(text, index) => {
  outcome: 'SEND' | 'ABSTAIN',
  answerId: string | null,
  reason: string | null,
  margin: number | null
}
```

`SEND` only when one indexed body covers every asked fact, the top score is at least T, and the margin to the next body is at least M. Otherwise `ABSTAIN`. Multi-intent abstains unless one approved body covers all intents. T and M are fit on the development set below and then frozen. They are not refit after a sealed run.

## Near-neighbour pairs that need a margin abstain

For each pair the dev set has unique `SEND` rows on both sides and one `ABSTAIN` on the overlap. `margin-neighbour:both-cover` means every id in `coveredBy` fully answers the asked fact, so the matcher must not choose among them. `margin-neighbour:neither-covers` means the wording attracts both bodies and neither covers the asked fact.

| # | Pair | Overlap the margin must refuse to split |
| --- | --- | --- |
| 1 | `packs.overview.en` / `packs.card-auto-apply.en` | Cards are not automatic; the trader applies a compatible card |
| 2 | `packs.overview.en` / `packs.cards-per-pack.en` | An Elite Pack contains three cards |
| 3 | `packs.overview.en` / `packs.simulated.en` | FundedElite accounts are simulated |
| 4 | `packs.pack-costs-floors.en` / `packs.followup.whale-pack.en` | Whale price and Uncommon-or-better floor |
| 5 | `packs.pack-costs-floors.en` / `packs.followup.oracle-pack.en` | Oracle price and Rare-or-better floor |
| 6 | `packs.pack-costs-floors.en` / `packs.rarity-floor.en` | Whale and Oracle floors (which-pack also states them) |
| 7 | `packs.drop-rates.en` / `packs.followup.whale-pack.en` | Whale Exotic 0.050% per card |
| 8 | `packs.drop-rates.en` / `packs.followup.oracle-pack.en` | Oracle Exotic 0.080% per card |
| 9 | `packs.drop-rates.en` / `packs.rarity-floor.en` | Whale does not contain Common |
| 10 | `packs.credits-vs-payout-credits.en` / `packs.withdraw-credits.en` | Pack Credits cannot be cashed out or transferred |
| 11 | `packs.credits-vs-payout-credits.en` / `packs.convert-payout-credits.en` | Conversion only when the customer chooses it |
| 12 | `packs.withdraw-credits.en` / `packs.convert-payout-credits.en` | Conversion is voluntary (the two-balance body states it too) |
| 13 | `packs.buy-credits.en` / `packs.monthly-subscription.en` | Credits can be bought on a monthly basis |
| 14 | `packs.monthly-subscription.en` / `packs.cancel-subscription.en` | Cancelling leaves the paid period active until it ends |
| 15 | `packs.my-packs-keys.en` / `packs.pack-pass.en` | Pack Pass yields a free pack that waits unopened |
| 16 | `packs.inventory-use-card.en` / `packs.eligibility-labels.en` | How discount cards relate to checkout |
| 17 | `packs.inventory-use-card.en` / `packs.card-auto-apply.en` | Save for checkout |
| 18 | `packs.discount-stacking.en` / `packs.exotic-cards.en` | Founder's Key: 60% for one year, does not combine |
| 19 | `packs.discount-stacking.en` / `packs.chain-upgrade-discounts.en` | Unqualified "can discounts be combined" (neither body covers it) |
| 20 | `packs.chain-upgrade-discounts.en` / `packs.special-packs.en` | Better offer wins, and a live offer must not be promised |
| 21 | `packs.exotic-cards.en` / `packs.followup.payout-boost-100.en` | "the 100% card" (neither body covers the unnamed card) |
| 22 | `packs.exotic-cards.en` / `packs.the-million.en` | Once per lifetime, from Whale or Oracle, with no further fact |
| 23 | `packs.collection.en` / `packs.card-count.en` | "Explain the collection" (tab versus catalogue size) |
| 24 | `packs.lucky-streak.en` / `packs.pack-pass.en` | A meter whose exact threshold is dashboard-only |
| 25 | `packs.free-packs-general.en` / `packs.atom-bundle-distinct.en` | Atom same-order bundles are separate from launch free-pack promos |
| 26 | `packs.refunds-legal.en` / `packs.withdraw-credits.en` | Pack Credits are not cash (the two-balance body states it too) |

Unique gold on each side asks a fact the other body does not contain. Examples: the floor definition ("lowest rarity a pack can hold") is only `packs.rarity-floor.en`; Ignition's Common percent is only `packs.drop-rates.en`; two-click cancel is only `packs.cancel-subscription.en`; the four Exotic names are only `packs.exotic-cards.en`.

## Unresolved-policy registry

Names the matcher and the abstain path must recognize. No new rows. Non-sendable ids stay non-sendable.

| Name | Do not assert | Non-sendable id, if any | Still sendable when |
| --- | --- | --- | --- |
| `free-pack-tier-conflict` | A specific free-pack tier, percent, account size, or credit amount | `packs.free-packs-provisional.en`, `packs.free-packs-help-center.en` | The question asks whether a settled number will be quoted. That is `packs.free-packs-general.en`. |
| `the-million-every-rule-conflict` | The landing slogan that every rule is lifted, or a request to emit the conflict row | `packs.the-million-every-rule-conflict.en` | The question asks the FAQ parameters. That is `packs.the-million.en`, which keeps max drawdown, daily drawdown, and minimum days. |
| `live-bundle-sizes` | Today's bundle size or bonus percent | none | The question asks where to add credits or that Luna does not purchase them. That is `packs.buy-credits.en`. |
| `live-offer-freshness` | That a chain or Special Pack offer is live right now, or a live price override | none | The question asks the published schedule or that a Special Pack ends when the timer ends. |
| `dashboard-only-meter-thresholds` | The digit that fills Lucky Streak or Pack Pass | none | The question asks the Epic guarantee or which purchases move Pack Pass, including that the threshold is dashboard-only. |
| `opened-pack-statutory-right` | Whether a statutory withdrawal right survives an opened pack or a cut seal | none | The question asks general finality, the Italian Consumer Code, the 18+ rule, or that Luna gives no individual legal conclusion. That is `packs.refunds-legal.en`. |

## Development set

Path: `staging-repair-t742/packs/devset/packs-dev-t742.json`

sha256 of that file (trailing newline included): `623c97a5f924ea724669a8c1fea8285e65d71e18d668c55d3688c2806acd149b`

Sidecar: `staging-repair-t742/packs/devset/packs-dev-t742.sha256`

336 synthetic English rows.

| Slice | Rows |
| --- | --- |
| near-neighbour | 130 |
| first-person-policy | 46 |
| personal-account-state | 36 |
| not-packs-owned | 28 |
| mixed | 24 |
| obfuscation | 20 |
| general-policy | 18 |
| multi-intent | 18 |
| unresolved-policy | 16 |

Outcomes: 168 `SEND`, 108 `ABSTAIN`, 60 `PERSONAL`.

Row fields: `id` (`PD-001` onward), `slice`, `text`, `outcome`, `answerId`, `reason`, `stopDecision`, `neighbourPair`, `coveredBy`, `needsAll`, `note`.

`needsAll` is set on multi-intent rows to the bodies that would be required together. `coveredBy` is empty there because no single body covers the question. `coveredBy` lists every body that fully covers a both-cover abstain.

Freeze this hash before any sealed set is drawn. Do not add sealed items to this file. Do not retune T or M on the sealed set. Calibration against this file is not a pass.

## Out of scope for this prep

No matcher, no router, no change to `selectPacksAnswer`, no change to the catalog bytes, no change to FAQ bodies or ids, no production config edit, no Intercom, no network. `spreadPublicGuard` stays at sha256 `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c`.
