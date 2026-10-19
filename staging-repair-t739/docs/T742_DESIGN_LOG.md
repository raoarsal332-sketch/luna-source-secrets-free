# T742 design log

Integration decision after freeze `46efb63b` (design file sha256 `06e2be0bcb7ceb843db1a12e2b1b0c3e8358a8f9589cc69ddfeffd4da703dde2`). This log does not reopen sections other than the matcher membership rule in (g). Requested model `grok-4.7`. Actual model `grok-4.7`.

## Matcher membership

Section (g) step 5 made `score >= T` a condition of membership, with `T` swept only in `{0.15, 0.20, …, 0.60}`. Step 4 is a different check: a body covers a turn when that body's text states every substantive intent. Cosine is the rank among the covering set (highest score, then smallest `partId`). `M` is not a parameter.

Both module authors measured the legal grid on their dev sets and no value qualifies. Reproduced here, dev sets only, sealed set not opened:

| Set | sha256 | At T=0.15 | At T=0, coverage is membership, cosine only ranks |
| --- | --- | --- | --- |
| Atom exclusive rows, commit `6880dbb2`, dev `ea1a8a02` | `d0fd43f77d10e2e2012815f3b8babbd89b702cc27436cf9ec142adca85debb4f` | 348/401 correct, false refusals 53/287 | 401/401 correct, false refusals 0/287 |
| Packs exclusive rows, commit `c7093874` | `19df3874c2272134390122f8b75e0e90dc22bd61a355ffdcd80d67a4dee0b693` | 55/94 correct, false refusals 39/69 | 55/94 correct, false refusals 39/69 |

Atom's 53 misses at the bottom of the grid are covered gold rows whose paraphrase cosine is below 0.15. Removing the floor, and leaving their statement check as the membership gate, meets the ≥95% / ≤5% false-refusal gate on that dev set. Packs does not move between T=0 and T=0.15. Those 39 misses are `COVERAGE_DENIED`: the stem check does not treat the paraphrase as stated, even though 6 of 52 gold product sends also have cosine below 0.15. A floor inside the legal grid cannot repair that, and it false-refuses Atom.

Decision, one rule for both modules: membership is coverage. Cosine only ranks bodies that cover. There is no per-module score floor and no per-module `M`. `matcher-params.json` freezes `T` at 0 and `M` at null. `T=0` means "not a send floor". It is not a second coverage function. Packs stays short of the numeric gate because of coverage misses; that is recorded and is not a pass. No sealed item was used.

`matcher-params.json` sha256 `c8e5f1a1d22dec2e47dcddefa143c1947d4754c5dc4b055afe9b548bc0992d42`. With that file loaded, Atom's decide on the dev set stays 401/401, false refusals 0/287. The legal grid still does not qualify.

## Delivery

`faqApprovedAnswers.resolveExtraPath` returns the Packs and Atom catalog paths. `webhookFastAck.js` and `writeOpStore.js` from the verified closure are on the candidate boot path. With a module flag on, an exclusive English decide `SEND` is posted as that catalog row. With the flag off, the same turn is an F1 silent abstain, including a later comment write, burst re-entry, and auth replay of that turn. A later turn that is not F1 clears the mark before its own approved comment. P1 risk and escalations notes are not comment writes and are not held by the comment matcher.

## Proposition membership, one registry, one normalizer

The stem check recorded above is not the coverage function either module froze. Using it as membership false-refuses 239/287 Atom gold sends and leaves Packs at 55/94, false refusals 39/69. Membership is now the proposition feed. Packs feeds `packs-propositions.json` sha256 `8be5778a8d684126c0d4f23f90ca93821f4681895e8b987c42587ceaa97506ac`: a fact triggers when every `all` phrase is present and, when `any` is non-empty, one `any` phrase is present; a body covers only when every triggered fact lists that part id; concealed spelling triggers nothing. Atom feeds its frozen body-fact result (`explain().covered`). `statementCovers` agrees with both feeds on every exclusive dev row (0 disagreements). There is no stem fallback for `packs.*` or `atom.*`. `T` stays 0 and `M` stays null. Cosine still only ranks.

`unresolvedPolicy.js` is the one registry: the Packs vetoes, then the Atom detectors. The Packs purchase-finality ask that names a consumer code for pack refunds (PD-305) is not the Atom fee-return veto. On exclusive dev rows, shared versus gold is miss 0 / extra 0 for Packs and miss 0 / extra 0 for Atom.

`routeNormalizer.js` matches the frozen host string: U+00D7 maps to `x`, U+00B7 maps to `.`, and a single-letter run joins when the separator is repeated. Packs dev mismatches are 0/336.

`twoStepTrailing` follows the frozen 2-Step trailing-veto proposition (product is 2-Step, `trail` counts, a negated trail does not, a drawdown that moves with the peak counts, `together with` does not). It fires on the 10 gold rows AD201, AD203, AD204, AD206, AD207, AD208, AD209, AD211, AD212, AD355, and on 0 Packs exclusive rows.

`publicRouter.hostDecide` does not run `packsOwnershipPregate` or `selectAtomAnswer` before the module's claim and decide.

Language gate, still Option A / F5: a short catalog term does not establish English (`payout?` and `Atom 289.` stay uncertain). A full English sentence does: at least four alphabetic tokens and one content word of length at least 4, and only after non-English evidence has already failed. Exclusive Atom uncertain rows are 1/401 (AD259), and that row is not a gold SEND.

Router-path remeasure, dev sets only, sealed set not opened. Label AUTHOR-TESTED. Not accepted.

| Path | Result |
| --- | --- |
| Packs flag on, through `publicRouter.route` | 94/94, false refusals 0/69 |
| Packs flag off | F1 94/94, sends 0 |
| Atom flag on, through `publicRouter.route` | 399/401, false refusals 1/287, catalog plans 287/287 |
| Atom flag off | F1 401/401, sends 0 |
| Atom module-direct decide | 400/401, false refusals 1/287 |
| Atom language-uncertain on the flag-on router | 1/401 |
| Atom policy short-circuit on a gold SEND | 0/287 |

The Atom false refusal is AD049. Gold primary is `atom.obsolete.leverage-150-default.en`. Decide sends `atom.2step.leverage.en` (score 0.170 against the obsolete row at 0.162). The dev scorer compares that one part id; it does not score acceptable-set membership. Labels were not changed. See the AD049 and span notes below.

`matcher-params.json` sha256 after this measurement is `05e542ada2b4f3a937c6422c308b4f72070a7fa6a25c7cfd1fe3b9e53ad8df3f`. That hash is not written inside the file. `T` is still 0 and `M` is still null.

## AD345 / AD364 spans

Report only. Gold was not relabeled. Both rows are ASCII. `normalizeForRoute` lowercases them and does not move the token `atom`. Shared index of that token: AD345 start 52, AD364 start 12. Gold spans are AD345 `{start:56,end:60}` (slice ` siz`) and AD364 `{start:14,end:18}` (slice `om 1`). The shared normalizer matches the frozen ASCII algorithm. The stored gold offsets do not select `atom`. These are the only two exclusive Atom span mismatches (2/412, kind mismatches 0).

## AD049

Report only. The reviewer owns labels. Gold was not relabeled.

The frozen rule in (g): when two covering bodies state incompatible facts and one side is `obsoleteCorrection`, the acceptable set keeps the non-obsolete ids. The same section says a restated fact is not a conflict, and any member of the acceptable set is correct. Later scoring lines in (j) say the scored send is the one deterministic part id and that another member is not a pass.

AD049 text: "Which leverage steps can be chosen on Atom 2-Step at checkout, besides the default?" Acceptable set: `atom.2step.leverage.en`, `atom.checkout.options.en`, `atom.obsolete.leverage-150-default.en`. Gold `decide.partId` is the obsolete id. The dev scorer in the Atom harness (`matches`) requires `got.partId === gold.partId`. It does not treat another acceptable-set member as correct.

The obsolete row's body does not state a 1:150 default. It states the same facts as the current 2-Step row: default 1:30, and 1:50 or 1:100 is an Atom 2-Step checkout option. `atom.checkout.options.en` lists that same leverage menu. The incompatible-fact condition for dropping the obsolete id is not met, so "keep the non-obsolete id" does not by itself remove this primary. The deterministic rank does: highest score, then smallest id, is `atom.2step.leverage.en`. That id is also in the acceptable set. The gold primary is not that rank. No label was changed.
