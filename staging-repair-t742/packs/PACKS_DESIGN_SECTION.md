# Packs section (aligned to t742-design ad6169bb)

Authority: branch `t742-design`, commit `ad6169bb`, `staging-repair-t739/docs/T742_DESIGN_AND_ACCEPTANCE.md` sha256 `5529a4878d4ef6adbce88875021a5f14b1eb77260bc9e11a4d48be8f26e52677`. The end-to-end gold table in (j) is the scored public result. Where it disagrees with an earlier "router abstains" or "any member is correct" sentence, the table wins. No catalog edits. No product code.

Actual model for this alignment: grok-4.7. The instruction did not name a requested model.

Catalog stays `staging-repair-t739/packs/faq-approved-answers-packs-v1.json`, sha256 `bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318`.

## claim

`claim` reads the host `normalized` string from (e). It does not call `normalizeForDetect` and it does not apply the detector hand map.

`normalizeForRoute`: NFKC, delete `\p{Cf}`, UTS #39 skeleton, lowercase, then join a spaced single-letter run (space, dot, hyphen, underscore, asterisk, or middle dot). Digit `0` is not folded, so `at0m` is not the Atom token. No leetspeak pass.

`exclusive` only when the Packs entity is present and the Atom entity is absent. Both entities: `kind` is `none`, `noneClass` `both-entities`, evidence spans empty. A selector word with no Packs entity is `shared`. Atom alone is not a Packs selector. No entity and no shared word is `none` `plain`. Evidence spans are offsets into the host-normalized text.

```
claim({ text, normalized, prior }) ->
  { kind: 'exclusive'|'shared'|'none', entity: 'packs'|null, evidenceSpans: [{start, end}] }

decide({ text, normalized, prior, gate, claim }) ->
  { action: 'SEND', partId: string, contentHash: string }
  | { action: 'ABSTAIN', code: string, policy: string|null }
```

`decide` runs only for one exclusive owner, language `en`, flag on, and delivery wired. No `PERSONAL` action. `packsProductHint` does not set `exclusive`.

## Scored gold

The scored result is the gold-table cell, not the covering set. `acceptableSet` and `recordedPick` are metadata. The scored send, when `decide` runs and does not abstain, is the one deterministic `partId` (highest score, then smallest id). Another member of the set is not the scored send.

`packs.account-status.refuse.en` (`084d4da1970176508bcf2f994e003c466cfe2a44f1226070c2c335dc43a580ea`) is the scored send only for an exclusive personal or mixed ask when `decide` runs. `shared` and `none` personal or mixed asks do not send it.

Flag-off for every exclusive Packs row is F1 silence: no reply, no note, no assignment, refuse id not sent. Flag-off for `shared` and `none` is the same main-route cell, not F1, except where section (b) gives the turn to Atom. Those rows are F1 silence because the Atom flag is off.

`packs.handoff.unverified.en` (`711e367ff423b475860478dbd2e5b66d1b8c0b3372efd0298558876cc0f940f0`) stays in the catalog index and out of the product pool. It is not the near-neighbour filler.

A canonical `policy.*` veto is the scored `ABSTAIN` only when `decide` runs. On `shared` and `none` the policy id stays coverage metadata.

## Development set

`staging-repair-t742/packs/devset/packs-dev-t742.json`

sha256 `19df3874c2272134390122f8b75e0e90dc22bd61a355ffdcd80d67a4dee0b693`

336 rows. Freeze re-check 4 changes four rows only: `PD-123`, `PD-256`, `PD-257`, and `PD-258`. Each has the Atom token and no Packs token. Packs-local claim kind stays. Section (b) gives the turn to Atom, so the flag-on cell is the Atom decide cell and flag-off is F1 silence.

| Gold-table row | Rows | Flag-on scored result |
| --- | --- | --- |
| `exclusive` / Packs / personal / decide runs | 8 | `SEND` `packs.account-status.refuse.en` |
| `exclusive` / Packs / mixed / decide runs | 9 | `SEND` the same refuse id, no product part |
| `exclusive` / Packs / general / decide runs | 77 | 52 `SEND` of the one `partId`; 25 `ABSTAIN` (15 `COVERAGE_DENIED`, 10 `unresolved-policy`) |
| `shared` / personal or mixed | 16 | main route, no module body, refuse id not sent |
| `shared` / general | 120 | main route, V12 or spread only, no module body |
| `none`, both entities | 6 | main route, no module body, not terminal silence |
| `none`, plain / general | 71 | main route, V12 or spread |
| `none`, plain / personal or mixed | 25 | main route, no module body, refuse id not sent |
| `none`, obfuscated not-a-claim | 0 | no dev row left without an entity token after (e) in the `at0m` or zero-width sense |
| atom-owned, section (b) | 4 | Atom decide cell, not the Packs main route |

`PD-123` flag-on is `SEND` `atom.bundles.en` (`c863a8cb57783b367916b550f0e308d15e8a042aca72e34a8cf7589612cac62a`): that body states the free Market Maker Pack plus 6,000 credits on a three-account order. `PD-257` flag-on is `SEND` `atom.1step.news.en` (`8c2bb7076db6391614dd42befb979dc513f017f2f38d7f688e39791c7a5e02ee`): both news bodies state that evaluation news trading is allowed, and that id is the deterministic pick. `PD-256` and `PD-258` flag-on is `atom-owned; scored in Atom module; ABSTAIN COVERAGE_DENIED`. `PD-256` names no product, and 1-Step states one evaluation phase while 2-Step states two. `PD-258` has no sendable Atom body that covers a credential-email download. Flag-off stays F1 silence. Packs-local claim stays `shared`.

Flag-off: 98 rows are F1 silence (94 exclusive Packs, plus these 4 Atom-owned rows). 238 `shared` and `none` rows keep the same main-route cell.

`PD-125`, `PD-183`, `PD-219`, `PD-250`, `PD-255`, and `PD-314` are the both-entity rows. `PD-183` does not emit `packs.atom-bundle-distinct.en`.

Freeze this hash before any sealed set. Do not retune `T` on a sealed set.
