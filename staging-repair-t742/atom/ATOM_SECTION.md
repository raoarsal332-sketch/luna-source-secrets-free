# Atom section (t742 alignment)

Staging only. Not runtime code. Authority: `staging-repair-t739/docs/T742_DESIGN_AND_ACCEPTANCE.md` on `t742-design` at `ad6169bb671ca5369932d69a31aedfc476b0824c`, sha256 `5529a4878d4ef6adbce88875021a5f14b1eb77260bc9e11a4d48be8f26e52677`.

Catalog bytes stay `faq-approved-answers-atom-v1.json` sha256 `df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6`. No new rows. Bodies, ids, and sendability are unchanged.

Development set: `staging-repair-t742/atom/atom_dev_set.json`  
sha256 `d0fd43f77d10e2e2012815f3b8babbd89b702cc27436cf9ec142adca85debb4f`  
412 rows. Same texts. Not an acceptance set.

Changelog: `staging-repair-t742/atom/LABEL_CHANGELOG.md`, revision `ad6169bb`. Every row is listed.

Requested model for this alignment: not named. Actual model: `grok-4.7`.

## Scored gold

The scored public result is the gold-table cell in `e2e`, not the covering set. `acceptableSet` is metadata. Another member of that set is not a correct scored send. The 95 multi-cover sets stay, and the eight ids stay members of each set their body covers.

`decide` runs only for one exclusive Atom claim, English, flag on, delivery wired. Otherwise `decide` does not run.

`atom.account-status.refuse.en` (`c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128`) is the scored send only on that exclusive decide-runs cell, for a personal ask or a mixed ask. It is not sent for `shared` or `none`, and it is not sent when the flag is off.

Flag on with delivery absent is the table cell `module-on-delivery-not-wired` for every exclusive row. `resolveExtraPath` is still unwired, so that cell is the staging host. The recorded `e2e.flagOn` cell is the delivery-wired cell. It is not an end-to-end PASS.

## Claim

`claim` reads the host string from section (e). It does not call `normalizeForDetect` and it does not apply the detector hand map.

Host order: NFKC, delete format characters, UTS #39 skeleton, lowercase, then the spaced single-letter join inside `normalizeForRoute`. Digit `0` is not rewritten. ASCII Latin letters are not rewritten: UTS #39 maps Latin `m` to `rn` and digit `1` to `l`, and applying those would erase the token `atom` that the contract matches. The skeleton applied here is every other character that has a UTS #39 mapping.

Re-derived confusable and zero-width rows. **No `claim.kind` changed.**

| row | host string | kind |
|---|---|---|
| AD351 | U+0410 skeletons to `A`, then lowercase, so the token is `atom` | exclusive, unchanged |
| AD349 | `at0m` stays `at0m` | none, obfuscated, unchanged |
| AD352 | U+200B deleted; `atom1step` is not the token `atom` | none, obfuscated, unchanged |
| AD353 | spaced letters join to `atom` | exclusive, unchanged |

Both entities: `kind` is `none`, `noneClass` `both-entities`. Shared words do not cancel an exclusive Atom entity. This set has no `shared` row and no plain `none` row.

## Gold counts

Flag-on scored cell. Each row is one cell. Sum 412.

| table row | rows | scored result |
|---|---|---|
| `exclusive\|Atom\|general\|runs` | 267 | the one `decide` partId |
| `exclusive\|Atom\|general\|runs\|silence` | 114 | silence. `decide` abstains |
| `exclusive\|Atom\|personal\|runs` | 19 | `atom.account-status.refuse.en` |
| `exclusive\|Atom\|mixed\|runs` | 1 | the same refuse id, no product part (`AD235`) |
| `none\|both-entities\|main-route` | 9 | main route, no module body, not terminal silence |
| `none\|obfuscated\|main-route-v12-12` | 2 | main route, 12 sendable V12 rows only (`AD349`, `AD352`) |

The 114 silences: `unresolved-policy` 51, `COVERAGE_DENIED` 37, `atom-clarification` 16, `atom-2step-trailing` 10.

Flag-off scored cell. Sum 412.

| table row | rows | scored result |
|---|---|---|
| `exclusive\|flag-off\|f1-silence` | 401 | no reply, no note, no assignment. The refuse id is not sent |
| `none\|both-entities\|main-route` | 9 | same main route as flag on. Not silenced |
| `none\|obfuscated\|main-route-v12-12` | 2 | same main route as flag on. Not F1 |

## What stayed a module decide

On the exclusive general send cell, the partId is the deterministic pick already on the row. 1-Step trailing and trailing with no product stay `atom.1step.max-loss.en` (`78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc`). 2-Step trailing stays silence `atom-2step-trailing`. `AD202`, `AD205`, and `AD210` stay `atom.2step.max-loss.en` because they do not say trailing and that body states the floor never moves.

`AD235` changed. It asks for the daily-loss rule and whether the customer passed. Neither body states both facts. The ask is exclusive mixed, so the scored send when `decide` runs is the refuse id and no product part. Flag off is F1 silence.

Atom stays disabled unless `LUNA_ATOM_SELECTOR_ENABLED=1`. This file is not a public send and not a PASS.
