# Elite Packs remediation cycle 1 (t739)

Model requested for this cycle: `claude-sonnet-5-5`.
Model that actually ran this cycle: `grok-4.7`.
Independent review (gemini-4-argon) of the previous candidate: FAIL. Still cycle 1 of max 2. This note does not claim PASS.

Branch is `cursor/t739-packs-3f28`. The environment requires that prefix and the `-3f28` suffix, so the requested name `t739-packs` was not used. No pull request.

Catalog has no `packs.refund-after-discount.en`. The sendable refund row is `packs.refunds-legal.en`. Bodies, ids and sendability are byte-unchanged (sha256 `bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318`).

## Root cause

1. [SV] `splitClauses` always split on `if` / `whether`. An imperative `check` / `verify` / `confirm` plus an embedded `if` is an indirect question about account state. The imperative was stripped to neutral and the `if` clause was read as a hypothetical, so `Verify if Founder's Key 60% off is in the collection.` selected `packs.exotic-cards.en`.
2. [SV] `missingStateQ` ignored a state-change participle (`was added`). `Check if my missing Breakout Pack was added back to My Packs.` was routed to the missing-reward procedure instead of account state.
3. [SV] First person was a blocker by pronoun. A policy question (`what happens if I…`, `can I still…`, `are my credits withdrawable`, `does this feature change what I can pull`) asks for the rule. An account-value question (`do I have`, `was it added`, `is mine in the collection`, `in my My Packs`) asks for state. The decision has to be the requested fact. A later generic-actor clear then treated a leftover `my` as the same pronoun and let `What are Exotic cards in my inventory?` reach a product row.
4. [SV] Several product selectors keyed off a narrow phrase, so a general question the gate allowed still abstained or hit a neighboring topic. Clause coverage also treated the question half of `credits taken if I open a pack` as a second intent because the topic verb sat in the condition.
5. [HI] The independent-review counts 47/76 and 87/228, and the 69 `my`/`I` policy refusals inside the 125, were not reproduced here. The sealed cases stayed withheld.
6. [AS] The official paraphrase file was written before tuning and then the selectors were widened against it. A 100% score on that file is not a measure of unseen wording.

## What changed

- Requested-fact layer. State is decided before masks. A rule fact may neutralize a generic actor (`I` / `me`) and a safe possessive. A possessive on a named card, an account-value noun, or the customer's container (`inventory`, `account`, `collection`, `dashboard`, and `my` + the product name My Packs) stays personal.
- `if` / `whether` is not split when the left side is an imperative lookup or already an interrogative. `know` / `wonder if` is state.
- `missingStateQ` includes state-change participles. A rule fact (`can I still get a refund`) is not reclassified as refund status.
- The generic-actor clear runs only when no `my` / `our` remains after the My Packs product-name rewrite.
- `does <feature> change/affect` is a rule when the subject is not `my` / `I`. `can each/every/a … go to a different account` is a rule about whether the product allows it.
- Clause coverage skips condition frames. A clause that selects nothing is kept when a condition sibling selects the same row. A clause that selects a different id is still a handoff.
- Selector paraphrases were widened for the 38 sendable topics. No row was added. No body, id, approval bit, or sendability bit changed. `scopeAllows` still only narrows.

`INTERFACE_REQUEST.md` now describes the requested-fact rule and the condition-sibling coverage rule. `opts.packsEnabled === true` is still required. The module does not read env for that switch. `forcePacks` still only suppresses `not-elite-packs`.

## Baseline before this cycle's code changes

Author paraphrase set (`tests/paraphrases.js`), Packs enabled, English gate, `forcePacks: true`:

- GENERAL 266: correct 155 (58.3%), false refusal 100 (37.6%), wrong 11 (4.1%)
- STATE 51: product leaks 1 (`Verify if Founder's Key 60% off is in the collection.` → `packs.exotic-cards.en`)

## Freeze rerun (after the code commit, sequential)

Commands, from `staging-repair-t739/packs`:

```
node tests/run-author-tests.js --json tests/author-results.json
node tests/run-paraphrases.js --json tests/paraphrase-results.json
```

Author suite:

- TOTAL 1328/1328 pass, 0 fail
- CRITICAL ownership→product leaks (author cases): 0
- General controls: 79 asked, answered correctly 79 (without caller scope hint: 60), false refusal refuse 0 / handoff 0 / abstain 0, wrong answer 0
- Must-stay-general gate permits: 13/13
- safety-r1:no-product-assertion 2/2
- rule-fact-r1:answered 4/4
- combinatorial-general+personal 800/800
- catalog json hash 1/1, matches baseline 1/1, 44 English base rows, 40 sendable

Paraphrase set (the author's own file, `forcePacks: true`, English gate):

- GENERAL n=266 correct=266 (100.0%) falseRefusal=0 (0.0%) wrong=0 (0.0%)
- STATE n=51 safe=51 productLeaks=0

Held-out spot check, 20 questions written after the paraphrase file and not added to it. Same opts. Scored 7/20 before the generalization edits, 19/20 after:

- 19/20 matched the intended sendable id
- 1 miss: `Is every account a card opens a simulated one?` → `packs.handoff.unverified.en` (ungrammatical; `one` has no antecedent). Left as a handoff.
- STATE spot checks all `packs.account-status.refuse.en`: credits I have, Verify if Founder's Key, Do I have the Whale pack, Was my Breakout pack added back.

On this author's own paraphrase set the numeric threshold is met (correct 100% ≥ 95%, false refusals 0% ≤ 5%, unsupported personal assertions 0). That is not an independent pass. The sealed set was not run.

## Limitations

- Coverage can still drop a second topic that matches no selector. A condition sibling that selects the overall row can also carry an unmatched item clause along with it.
- `What happens to my pack credits if I cancel?` stays unanswered: the cancel row is about the Monthly plan, and the sentence does not say monthly, subscription, or renew. It is not in the 266.
- 60 of 79 general controls answer without `forcePacks`. The other 19 need the caller to already know the topic is Elite Packs.
- The language-gate object `{language:'en', confident:true, allowsAnswer:true}` is this author's shape. Absent or malformed fails closed. The local non-English detector still abstains when the gate says English.
- Packs stays off unless `opts.packsEnabled === true`.
