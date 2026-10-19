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
