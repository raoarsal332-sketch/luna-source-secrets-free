# Atom remediation cycle 2 of 2 (final)

Status: CANDIDATE, not a PASS. Tuning counts and held-out counts are reported separately. The independent sealed set from the review was not rerun and is not in this tree. Nothing here is an acceptance result.

This is the last selector cycle. The next step is an architecture reassessment, not more tuning.

Integration (`resolveExtraPath` / Atom-tree `faqApprovedAnswers.js`) stays BLOCKED. Not implemented and not guessed. No edits to `index.js`, `faqAssistance.js`, or `faqAnswerSelect.js`. No SSH, VPS, production, Intercom, external API, customer data, or deployment. Atom stays OFF unless `opts.enabled === true` or `LUNA_ATOM_SELECTOR_ENABLED=1`.

## Models

| | id |
|---|---|
| Requested for this cycle | none named (the cycle-2 message did not name a different model) |
| Actual for this cycle | `grok-4.7` (Grok 4.7) |

Cycle 1 requested `claude-sonnet-5-5` and was also run as `grok-4.7`. The exact API effort tier is not exposed.

## What the review required

Independent review of cycle 1 (`b9af481`) on a fresh sealed set: 136/248 exact (54.8%), 96 non-answers, 16 wrong ids. The author suite 5798/5798 did not generalise.

Dominant non-answer: `unrecognized-qualifier` on neutral discourse words (57). Also multi-intent abstains where one catalog row covers the ask (24), `non-english` on supported English (8), fee-policy and news-minute abstains the reviewer judged answerable from existing bodies (4 and 2; real unresolved policy still abstains), and one uncovered qualifier.

Wrong ids: minimum-day asks sent to `atom.1step.funded-profitable-days.en` (8); a 150 leverage default sent to `atom.2step.leverage.en` (8).

Safety misses (abstain expected, a sendable rule returned): a personal ask to `atom.1step.max-loss.en`, an ask to `atom.1step.phases.en`, two asks to `atom.overview.en`.

D1–D6 stay fail-closed: equality at exactly 50%, news-minute calculations, fee refund, checkout SKU selection, translations, coupon stacking.

## Root cause and the change

The closed per-frame vocabulary treated every unknown token as a qualifier. Discourse and request words outside the list therefore clarified instead of matching the proposition. Cycle 2 removes that gate. A frame is the proposition: topic, product, and condition. A word that does not name another topic, another product, a money relation, or an unresolved policy is neutral.

`residualTokens` is still defined and exported. It is no longer called to clarify. `unrecognized-qualifier` is no longer emitted. Scope still abstains on `qualifier-not-covered` for a calculation, an add-on price, and a real policy change.

Removing the gate also let disguised fee questions reach `atom.prices.list.en` when the payout was named with a synonym the canon did not know (`distributions`, `disbursements`, `settlements`) or the return was phrased as waived, handed over, thrown in, made up, come to me, given back, or "be covered". Those are payout stages and fee-return relations again. Movement ("drops back under", "back down") is not a refund. A bare "before" or "after" without a clock, window, or instrument is not a news-minute calculation.

## Catalog decisions (existing ids only)

| ask | id | why |
|---|---|---|
| trailing lock, no product | `atom.1step.max-loss.en` | only trailing row; floor follows the high and never moves down |
| explicit Atom 2-Step trailing drawdown | `atom.2step.max-loss.en` | body says 10% static and the floor never moves. That is the catalog answer to the trailing premise. Not retuned to 1-step or to abstain |
| static max loss, no product | `atom.2step.max-loss.en` | only static row |
| minimum trading days or time limit, including funded 1-Step without "profitable" | `atom.1step.min-days.en` (no product: `atom.overview.en`) | min-days leads with "no minimum trading days"; the overview body states the same for both products |
| profitable days or 0.5% | `atom.1step.funded-profitable-days.en` | unless the ask is about the evaluation and does not say funded, in which case min-days (evaluation has none) |
| 1:150, 150:1, or 150 next to leverage, even if 2-Step is named | `atom.obsolete.leverage-150-default.en` | sendable. Body: default is 1:30; 1:50 or 1:100 is a 2-Step checkout option, not a universal 1:150. `atom.2step.leverage.en` does not mention 150 |
| choosing 1:100 or 1:50 on 2-Step | `atom.2step.leverage.en` | that body states the checkout choice |
| pure "what is Atom" | `atom.overview.en` | payout, amount, size, percent, and ratio are substantive, so they are not overview. Personal state and an unsupported content word do not fall through to overview |
| 7K list price | `atom.prices.list.en` | body lists 7K $19/$29 |

Personal state (refuse, not a rule): my/our situation or case; my/our current, personal, live, or actual drawdown, loss, floor, phase, target, balance, equity, status, or account; my trailing drawdown; overview of me. "For a friend" and "my own accounts" on the copier row are not personal state.

## Held-out, frozen before the selector edit

`tests/cases/heldout.js` was written from catalog bodies and from the failure classes above, then committed as `7bb58b9` before any cycle-2 selector edit. It is not imported by `author_suite`. It was not edited after the hash was recorded, and its sentences were not copied into the tuning set.

sha256: `b58d5ae660c3e168ddc97943a2f02e5ad2d0729e99689687110d811796e2ab44`

The selector was not changed after `node tests/heldout_run.js` was run. The one miss below was not repaired.

## Counts

Node v22.14.0. Production Node 20 was not run. Captured in `artifacts/cycle2_final_test_run.txt` and `artifacts/cycle2_heldout_run.txt`.

### Tuning (author suite, iterated)

`node --test tests/author_suite.test.js`: 21 tests, 21 pass, 0 fail.

| Set | Total | Pass | Fail | Leaks | False refusals |
|---|---|---|---|---|---|
| kb | 16 | 16 | 0 | 0 | 0 |
| controls (31 x 8) | 248 | 248 | 0 | 0 | 0 |
| money-confusion | 50 | 50 | 0 | 0 | 0 |
| unresolved | 12 | 12 | 0 | 0 | 0 |
| discriminate | 31 | 31 | 0 | 0 | 0 |
| account-specific | 6 | 6 | 0 | 0 | 0 |
| multi-turn | 20 | 20 | 0 | 0 | 0 |
| unicode | 16 | 16 | 0 | 0 | 0 |
| non-english | 15 | 15 | 0 | 0 | 0 |
| gating | 27 | 27 | 0 | 0 | 0 |
| robustness | 13 | 13 | 0 | 0 | 0 |
| general | 45 | 45 | 0 | 0 | 0 |
| varied-supported | 295 | 295 | 0 | 0 | 0 |
| varied-deny | 38 | 38 | 0 | 0 | 0 |
| probes-novel | 30 | 30 | 0 | 0 | 0 |
| fee-sweep | 3200 | 3200 | 0 | 0 | 0 |
| mixed-sweep | 992 | 992 | 0 | 0 | 0 |
| wrapper-stability (info) | 744 | 744 | 0 | 0 | 0 |
| TOTAL | 5798 | 5798 | 0 | 0 | 0 |

Baseline dd3b9f79 on the same 80 deny cases: 16 sendable leaks. This selector: 0. General answer-expected questions: baseline 13 false refusals, this selector 0 of 36.

One tuning expectation changed because the body already states the fact: GN24 ("Is the Atom 7K cheap? what is the price") is `atom.prices.list.en`. The 7K prices are in that body. RB13 now expects a nonsense token not to block a clear price proposition.

### Held-out (scored once, not used to change the selector)

| | Total | Pass | Fail | Leaks |
|---|---|---|---|---|
| held-out H01–H38 | 38 | 37 | 1 | 0 |

The miss is H27, "Did I already pass phase 1 on my Atom 1-Step?", which returned `atom.1step.phases.en`. The account-status pattern requires the verb directly after "did I" / "have I". The word "already" sits in between, so the ask is read as a phase-target question. That is the same safety class the review reported (a personal pass ask answered with `atom.1step.phases.en`). It is recorded here and left unrepaired, because the held-out file is not a tuning set.

No held-out case returned a sendable id where the case expected an abstain (leaks 0).

## Still true

- The tuning suite was iterated against. 5798/5798 does not show that the sealed 248 would pass. Cycle 1 already demonstrated that it does not.
- Held-out is 37/38 with one personal-status miss. That is not a PASS.
- No approved clarification text. No challenge-fee refund row. Both are owner decisions.
- `languageGate` shape is still an assumption. Local non-English detection no longer treats the English homographs "as", "main", and "die" as foreign markers. "la" is still a marker.
- Only Node 22 was run. Production reportedly runs Node 20.
- `resolveExtraPath` remains BLOCKED.

## Freeze

`MANIFEST.json` is the full sha256 and size of every file in this candidate, including this note. `MANIFEST.sha256` is the hash of that manifest. No PASS is claimed.
