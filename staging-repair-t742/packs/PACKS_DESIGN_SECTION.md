# Packs section (aligned to t742-design bce740fb)

Authority: branch `t742-design`, commit `bce740fb`, `staging-repair-t739/docs/T742_DESIGN_AND_ACCEPTANCE.md` sha256 `fedb3bc6a7b58172ad3af4cca6f47b2504361883ed901fa407662fa3e352783b`. Sections (b), (f), (g), (h), and (j) win. No catalog edits. No product code.

Actual model for this alignment: grok-4.7. The instruction did not name a requested model.

Catalog stays `staging-repair-t739/packs/faq-approved-answers-packs-v1.json`, sha256 `bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318`.

## claim and decide

```
claim({ text, normalized, prior }) ->
  { kind: 'exclusive'|'shared'|'none', entity: 'packs'|null, evidenceSpans: [{start, end}] }

decide({ text, normalized, prior, gate, claim }) ->
  { action: 'SEND', partId: string, contentHash: string }
  | { action: 'ABSTAIN', code: string, policy: string|null }
```

No `PERSONAL` action. No prose. `packsProductHint` does not set `exclusive`.

`exclusive` only when the Packs entity is present and the Atom entity is absent. Both entities: `kind` is `none`. The router abstains. `decide` is not called. No module body.

`decide` is called only after one `exclusive` claim and language `en`. Clearly non-English is not a module claim and is not a terminal Packs abstain. Uncertain language with the flag off is the router's silence.

A row with `claim.kind` `none` does not carry a module `SEND`. The dev row states the router outcome.

- Both entities: `outcome` `ROUTER`, `routerOutcome` `claim-none`, `publicResult` `router-abstain`, `decide` null. Ids: `PD-125`, `PD-183`, `PD-219`, `PD-250`, `PD-255`, `PD-314`. `PD-183` is not `SEND` `packs.atom-bundle-distinct.en`.
- No Packs entity and no shared word: `outcome` `ROUTER`, `routerOutcome` `claim-none`, `publicResult` `not-a-claim`, `decide` null. The covering set, when one exists, stays on the row and is not emitted. V12 and spread are not silenced.

## Coverage gold

Two rows at or above `T` are not an abstain. `M` is not a parameter.

When `claim.kind` is `exclusive` or `shared`, and one or more approved bodies each state every asked fact and do not conflict, the gold is that acceptable set. Any member is correct. `decide` returns one member: highest cosine score on the product pool, then the lexicographically smallest `partId`. A single covering body is a set of one. The recorded pick is `answerId`.

Abstain, code `COVERAGE_DENIED`, only when no body states every asked fact, or the covering bodies state incompatible facts for that fact. Near-neighbour rows where neither body covers stay `ABSTAIN`, not `packs.handoff.unverified.en`.

`packs.account-status.refuse.en` (`084d4da1970176508bcf2f994e003c466cfe2a44f1226070c2c335dc43a580ea`) and `packs.handoff.unverified.en` (`711e367ff423b475860478dbd2e5b66d1b8c0b3372efd0298558876cc0f940f0`) stay in the catalog index and out of the product overlap pool. Personal and mixed turns are `SEND` of the refuse id only when `claim.kind` is `exclusive` or `shared`. The handoff id is not the near-neighbour filler.

`shared` rows still carry that coverage `SEND`. Contract item 7 names `kind: none`, not `shared`. The router still does not call `decide` unless the claim is the one `exclusive` owner.

## Vetoes and policy ids

`policy.fee-refunds` abstains. Do not `SEND` `packs.refunds-legal.en` for evaluation, challenge, reset, or duplicate-charge fee refunds. That row stays sendable for pack-purchase finality.

`policy.coupon-stacking` abstains. Do not `SEND` `packs.discount-stacking.en` for homepage or newsletter coupons. That row stays sendable for ordinary discount cards and Founder's Key.

Canonical Packs ids, each `ABSTAIN` / `unresolved-policy`, with the named neighbour not substituted: `policy.free-pack-tier-conflict`, `policy.the-million-every-rule-conflict`, `policy.live-bundle-sizes`, `policy.live-offer-freshness`, `policy.dashboard-only-meter-thresholds`, `policy.opened-pack-statutory-right`.

## Development set

`staging-repair-t742/packs/devset/packs-dev-t742.json`

sha256 `aea495828a1e5b016690d607f3faefb9fcdecb653d724728c1e3b95500ecdb00`

88 gold labels changed from commit `d886382`. The changelog cites the body fact for each row: `Alignment to bce740fb` and `Alignment to bce740fb — kind none is not a module SEND` in `staging-repair-t742/packs/devset/LABEL_CHANGELOG.md`.

| Gold | Rows |
| --- | --- |
| `SEND` one covering id | 164 |
| of which `packs.account-status.refuse.en` | 33 |
| `SEND` acceptable set of 2 or 3 agreeing ids | 16 |
| `ABSTAIN` `COVERAGE_DENIED` | 65 |
| `ABSTAIN` canonical `policy.*` | 22 |
| `ROUTER` `claim-none` / `not-a-claim` | 63 |
| `ROUTER` `claim-none` / `router-abstain` | 6 |

336 rows. `SEND` 180. `ABSTAIN` 87. `ROUTER` 69.

The 16 sets are former `two-above-threshold` rows whose bodies agree and whose claim is `exclusive` or `shared`. Three of those 22 stayed `COVERAGE_DENIED`: `PD-075` (neither body states both produce and unopened), `PD-080` (Save for checkout and the Checkout label are different facts), `PD-120` (Lucky Streak and Pack Pass name different meters). `PD-030` and `PD-055` agree, and `claim.kind` is `none`, so the covering set is recorded and the end-to-end gold is `not-a-claim`, not a module `SEND`. No other `COVERAGE_DENIED` multi-intent, not-owned, or obfuscation row had one body that stated every asked fact.

`PD-255` and `PD-314` contain both entities. End-to-end gold is router abstain. `PD-255` has no body that states an Atom daily loss limit. `PD-314` needs both the Atom example and the independent card draw, and no one body states both.

Freeze this hash before any sealed set. Do not retune `T` on a sealed set.
