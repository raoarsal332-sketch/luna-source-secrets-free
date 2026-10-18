# Elite Packs remediation cycle 1 (t739)

Model requested for this cycle: `claude-sonnet-5-5`.
Model that actually ran this cycle: `grok-4.7`.
Independent review (gemini-4-argon) of the previous candidate: FAIL. Still cycle 1 of max 2. No PASS claim.

## Baseline before this cycle's code changes

Author paraphrase set (`tests/paraphrases.js`, written before tuning), Packs enabled, English gate, `forcePacks: true`:

- GENERAL 266: correct 155 (58.3%), false refusal 100 (37.6%), wrong 11 (4.1%)
- STATE 51: product leaks 1 (`Verify if Founder's Key 60% off is in the collection.` → `packs.exotic-cards.en`)

Catalog has no `packs.refund-after-discount.en`. The sendable refund row is `packs.refunds-legal.en`. Bodies, ids and sendability stay byte-unchanged (sha256 `bed88e6a…2318`).

## Root causes being fixed

1. `splitClauses` always splits on `if`/`whether`. An imperative `check`/`verify`/`confirm` plus an embedded `if` is an indirect question about account state, not a hypothetical conditional. The imperative was stripped to NEUTRAL and the `if` clause was read as GENERAL.
2. `missingStateQ` did not treat a state-change participle (`was added`) as an account-state question, so a lookup about a missing item was routed to the missing-reward procedure.
3. First person was a blocker by pronoun. A policy question (`what happens if I…`, `can I still…`, `are my credits withdrawable`) asks for the rule. An account-value question (`do I have`, `was it added`, `is mine unlocked`, `how many credits do I have`) asks for state. The decision has to be the requested fact.
4. Several product selectors key off a narrow phrase, so a general question that the gate allowed still abstained or hit a neighboring topic. Coverage also treated a conditional fragment as a second intent.

## Exposed failures added as regressions

- `Verify if Founder's Key 60% off is in the collection.` must not select a product row.
- `Check if my missing Breakout Pack was added back to My Packs.` must not select `packs.missing-reward.en`.
- `If I use a 50% off reward on my challenge, can I still get a refund?` must select `packs.refunds-legal.en`.
