# Elite Packs remediation cycle 2 of 2 (t739)

Model that ran this cycle: `grok-4.7`.
Independent review of cycle 1 (`af30a48`, integrated at `d8cc2e68`): FAIL. This note does not claim PASS. The next step named by the owner is an architecture reassessment.

Branch: `cursor/t739-packs-cycle2-3f28`. No pull request.
Catalog sha256 unchanged: `bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318`. Bodies, ids, and sendability were not edited. There is still no `packs.refund-after-discount.en`.

## Root cause

Cycle 1 required every clause to be positively proved GENERAL, and it treated a first-person pronoun as account state. On a fresh sealed set that produced 199 false refusals (55 mixed, 52 personal, 34 not-positively-general) and only 5/110 first-person policy questions correct. Selectors were narrow phrase regexes, so supported questions missed or hit a neighbor (overview vs auto-apply, credits-vs vs withdraw, my-packs vs pack-pass, whale/oracle follow-ups vs cost, odds, or rarity floor). The module also abstained as `not-elite-packs` unless the text literally carried a small token list, so pack credits, keys, cards, rarity, My Packs, and pack names never established the module. The author's own 266/266 paraphrase file had been tuned to those phrasings and did not measure this.

## What changed

- A how-it-works or what-is-the-rule question defaults to GENERAL. PERSONAL requires positive evidence of a request for this customer's possession, status, balance, delivery, or a specific item of theirs. `How do I open a pack` stays a procedure. `Do I own Instant Override` stays a lookup.
- A fronted `if I …` is a condition. `tell me if I own` stays a lookup.
- A narrative aside that does not ask for an account value is dropped. A real state request joined to a general question is still mixed and is refused.
- Selection scores topic and entity cues (cost, odds, rarity floor, withdraw, convert, auto-apply, pack name). A score of 6 overrides a conflicting phrase selector. Phrase selectors remain the fallback.
- `packs`, `cards`, `credits`, `keys`, `rarity`, `odds`, `inventory`, `collection`, pack names, and the other catalog entities establish the module without the words "Elite Packs".
- A confident English gate may omit `allowsAnswer`. An explicit `allowsAnswer: false` still fails closed.

## Held-out, frozen before the code change

`tests/heldout.js` was committed at `4f9e7a6` before any cycle-2 edit. It was not relabeled. `forcePacks` is off. English gate is the full `{language:'en', confident:true, allowsAnswer:true}`.

Before the code change: n=121 correct=56 falseRefusal=63 wrong=2 leaks=0.

After the code change (`node tests/run-heldout.js`):

- n=121 correct=98 falseRefusal=22 wrong=1 leaks=0
- general 76: correct 61, falseRefusal 14, wrong 1
- neighbor 7: correct 7
- policy-first-person 15: correct 8, falseRefusal 7
- state 10: correct 10, leaks 0
- mixed-needed 4: correct 4
- context-aside 3: correct 2, falseRefusal 1
- boundary 4: correct 4 (none returned overview)
- off-topic 2: correct 2
- The one wrong id is `How is a saved card applied to a challenge at checkout?` → `packs.eligibility-labels.en` (expected `packs.inventory-use-card.en`)
- Refusal reasons on the misses: handoff.unverified 10, not-elite-packs 4, no-confident-select 4, account-status.refuse 4

## Tuning sets (not the held-out file)

Commands, from `staging-repair-t739/packs`, run one after another:

```
node tests/run-author-tests.js --json tests/author-results.json
node tests/run-paraphrases.js --json tests/paraphrase-results.json
node tests/run-heldout.js --json tests/heldout-results.json
```

Author suite: **1328/1328 pass, 0 fail**. Critical ownership-to-product leaks: **0**. General controls **79/79** (without `forcePacks`: **79**). safety-r1 **2/2**. rule-fact-r1 **4/4**. Combinatorial general+personal **800/800**.

Paraphrase file (the cycle-1 tuning set): GENERAL **266/266 (100%)**, false refusals **0**, wrong **0**. STATE **51/51**, product leaks **0**.

## Limitations

- The held-out score is 98/121 with 22 false refusals and 1 wrong id. That is not the reviewer's sealed 240, and it is not a pass.
- First-person policy on the held-out file is 8/15. Some `I`/`my` rule questions are still refused.
- Four held-out questions still abstain as `not-elite-packs` because they name a tier, a monthly plan, or an upgrade offer without a catalog entity.
- Explicit `allowsAnswer: false` still abstains. If the sealed `language-gate-not-allowed` cases sent that flag, they stay refused.
- Mixed messages that really ask for an account value are still refused in full.
- Packs stays off unless `opts.packsEnabled === true`.
