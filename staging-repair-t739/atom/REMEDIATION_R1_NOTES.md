# Atom remediation cycle 1 of max 2

Status: CANDIDATE, not a PASS. These counts are the author's own cases, including a new paraphrase set written for this cycle. The independent sealed set is still withheld. Nothing here is an acceptance result.

Integration (`resolveExtraPath` / Atom-tree `faqApprovedAnswers.js`) stays BLOCKED. Not implemented and not guessed. No edits to `index.js`, `faqAssistance.js`, or `faqAnswerSelect.js`. No SSH, VPS, production, Intercom, external API, customer data, or deployment. Atom stays OFF unless `opts.enabled === true` or `LUNA_ATOM_SELECTOR_ENABLED=1`.

## Models

| | id |
|---|---|
| Requested for this cycle | `claude-sonnet-5-5` (Claude Sonnet 5.5) |
| Actual for this cycle | `grok-4.7` (Grok 4.7) |

The previous freeze (`REPORT_T739_ATOM.md`) was written by Claude Sonnet 5.5. This cycle was reassigned after that run stopped mid-edit. The uncommitted selector edit on `t739-atom` was kept and finished here. The exact API effort tier is not exposed.

## What the review required

Safety on the reviewer's 88 adversarial/boundary cases was already PASS (0 violations). That behavior is kept: fee recovery, fee x payout, equality, news-minute calculations, checkout SKU selection, translations, and coupon stacking still do not return a sendable answer.

Usefulness failed because `unrecognized-qualifier` fired on neutral request words (`explain`, `understand`, `details`, `specifically`, `allowed`, `happen`). The required regression is: "Can you explain how the Atom trailing drawdown locks?" must be answered by the catalog row that covers that proposition.

## Catalog ids (consolidation)

The reviewer topic labels are not rows in `faq-approved-answers-atom-v1.json`. The selector returns the real sendable id:

| reviewer label | actual catalog id |
|---|---|
| trailing drawdown, including how it locks | `atom.1step.max-loss.en` (only trailing row; the body is the lock: the floor follows the high and never moves down) |
| static max loss | `atom.2step.max-loss.en` |
| first-withdrawal cap | `atom.payouts.general.en` (cap is 3% of starting balance, including the first payout) |
| consistency formula | `atom.1step.consistency.en` / `atom.2step.consistency.en` |
| scaling targets / criteria | the phases rows (`atom.1step.phases.en`, `atom.2step.phases.en`), which state the profit targets |

"Can you explain how the Atom trailing drawdown locks?" returns `atom.1step.max-loss.en`. Returning the reviewer's label would fail closed, because that id is not in the KB.

## Changes

Discourse versus substance (`atomAnswerSelect.js`):

- Request and discourse words, and the same stems, are not substantive qualifiers. They no longer produce `unrecognized-qualifier`.
- A substantive unknown word still does: an amount or condition the row does not cover, another product, or a policy with no approved row.
- "bigger / higher reward share" on a named product is the published option list (`atom.1step.reward.en` / `atom.2step.reward.en`), not an uncovered policy change. "Does the split change after the third payout?" still abstains.
- Bare "total" is no longer treated as a calculation request. Explicit calculate / compute / what date still is.
- "hold trades" is not the weekend-holding add-on. Weekend holding and scalping add-ons still are.
- "am I allowed to trade news" is not a news-minute calculation. Minute, window, instrument, and clock asks still hand off as `unresolved:news-minutes`.

Product clarification, only where the rows actually differ:

- No-product time limit and minimum trading days answer `atom.overview.en`. The body states both: no minimum trading days and no time limit.
- Funded profitable days still clarify `product` (only Atom 1-Step has them).
- Trailing drawdown with no product answers `atom.1step.max-loss.en`. Static max loss with no product answers `atom.2step.max-loss.en`. Max loss with neither word still clarifies.
- News, daily-loss percent, phases, consistency, and reward-share options still clarify when no product is named, because the two rows disagree.
- A published payout schedule ("when is the first payout") is not an account-status lookup. "When will my payout arrive?", KYC, breach, and "did I pass?" still return `atom.account-status.refuse.en`.
- "Elite Packs" / "Elite Pro" as the subject abstains `not-atom-scope`. The Atom multi-account bundle, including the Market Maker Pack in that offer, still answers `atom.bundles.en`.

Scope sidecar (`atomAnswerScope.js`): the consistency rows may carry the formula example (`calc`). The overview row may carry a stated day-count (`num`) when the answer is "there is no time limit." Both widens are limited to propositions the body already states.

Money-referent deny classes are unchanged and still run first.

## Tests

From `staging-repair-t739/atom/`:

```
./tests/run_all.sh
node --test tests/author_suite.test.js
node tests/report_counts.js
node tests/baseline_compare.js
node tests/measure_varied.js
```

Captured output: `artifacts/cycle1_final_test_run.txt`. Pre-fix snapshot of the first paraphrase draft: `artifacts/cycle1_varied_BEFORE_fix.txt`. Node v22.14.0 only.

`node --test`: 21 tests, 21 pass, 0 fail.

Raw counts, final run:

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

Baseline dd3b9f79 on the same deny cases: 16 sendable leaks. This selector: 0. General answer-expected questions: baseline 13 false refusals, this selector 0 of 35. Two general expectations changed because the catalog already covers them: GN35 (time limit) is `atom.overview.en`, GN40 (bundle deal) is `atom.bundles.en`. GN25 ("bigger reward share") now returns `atom.1step.reward.en`.

Pre-fix snapshot on the first 290 supported paraphrases, before this cycle's selector edit: 215 strict-id correct, 73 false refusals, 2 wrong id, 1 sendable leak (`Elite Packs credits` -> `atom.bundles.en`). That leak is gone. The final paraphrase list is not identical to that snapshot: account-status questions that the refuse row covers were moved onto the supported list, one evaluation-versus-funded expectation was pointed at `atom.1step.min-days.en`, and "which intervals can I pick" is `atom.checkout.options.en`.

Safety sets that must stay clean, and did: money-confusion 50, unresolved 12, probes 30, fee-sweep 3200, mixed-sweep 992, varied-deny 38. Sendable leaks in all of those: 0.

## Still true

- Author cases were iterated against. They do not stand in for the sealed review.
- Unusual substantive wording outside a frame vocabulary still clarifies or abstains. That is the remaining usefulness risk.
- No approved clarification text. No challenge-fee refund row. Both are owner decisions.
- `languageGate` shape and the other-product marker list are still assumptions.
- Only Node 22 was run. Production reportedly runs Node 20.
- `resolveExtraPath` remains BLOCKED.

## Freeze

`MANIFEST.json` is the full sha256 and size of every file in this candidate, including this note. `MANIFEST.sha256` is the hash of that manifest. No PASS is claimed.
