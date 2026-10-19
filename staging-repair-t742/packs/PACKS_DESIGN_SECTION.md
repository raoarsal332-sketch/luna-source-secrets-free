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

Flag-off for every exclusive row is F1 silence: no reply, no note, no assignment, refuse id not sent. Flag-off for `shared` and `none` is the same main-route cell, not F1.

`packs.handoff.unverified.en` (`711e367ff423b475860478dbd2e5b66d1b8c0b3372efd0298558876cc0f940f0`) stays in the catalog index and out of the product pool. It is not the near-neighbour filler.

A canonical `policy.*` veto is the scored `ABSTAIN` only when `decide` runs. On `shared` and `none` the policy id stays coverage metadata.

## Development set

`staging-repair-t742/packs/devset/packs-dev-t742.json`

sha256 `cc3e7bcc6e3ff7d23971f79a6f419d70978f4bf06fb6e11783e0919f1ab05636`

336 rows. The changelog section `Alignment to ad6169bb` has one line per row. Flag-on scored result changed on 248 rows. The other 88 are exclusive rows whose flag-on partId or abstain code stayed the same and whose flag-off is now F1 silence. One claim kind changed: `PD-123` is `none` plain, because the host-normalized text has the Atom token, no Packs token, and no selector word.

| Gold-table row | Rows | Flag-on scored result |
| --- | --- | --- |
| `exclusive` / Packs / personal / decide runs | 8 | `SEND` `packs.account-status.refuse.en` |
| `exclusive` / Packs / mixed / decide runs | 9 | `SEND` the same refuse id, no product part |
| `exclusive` / Packs / general / decide runs | 77 | 52 `SEND` of the one `partId`; 25 `ABSTAIN` (15 `COVERAGE_DENIED`, 10 `unresolved-policy`) |
| `shared` / personal or mixed | 16 | main route, no module body, refuse id not sent |
| `shared` / general | 123 | main route, V12 or spread only, no module body |
| `none`, both entities | 6 | main route, no module body, not terminal silence |
| `none`, plain / general | 72 | main route, V12 or spread |
| `none`, plain / personal or mixed | 25 | main route, no module body, refuse id not sent |
| `none`, obfuscated not-a-claim | 0 | no dev row left without an entity token after (e) in the `at0m` or zero-width sense |

Flag-off: 94 exclusive rows are F1 silence. 242 `shared` and `none` rows keep the same main-route cell.

`PD-125`, `PD-183`, `PD-219`, `PD-250`, `PD-255`, and `PD-314` are the both-entity rows. `PD-183` does not emit `packs.atom-bundle-distinct.en`.

Freeze this hash before any sealed set. Do not retune `T` on a sealed set.
