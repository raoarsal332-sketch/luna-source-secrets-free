# Atom dev-set label changelog

Authority: branch t742-design, commit 31b07389e4fef10d433c306ed7de2850f254c468, `staging-repair-t739/docs/T742_DESIGN_AND_ACCEPTANCE.md` sha256 `0aeb4ea6e1bac8366a0b45b502c9d3eeab0d5be1b7b63209bbf7d9f08c5fc1b0`.

Gold rule used: one approved body covers every intent, judged from that body's text, so the label is that id. Otherwise ABSTAIN. Two bodies that each state every asked fact are ABSTAIN `COVERAGE_DENIED`, not the more specific row. A question whose single approved body already covers it is not moved to ABSTAIN.

Row text is unchanged. Catalog bodies, ids, and sendability are unchanged. No new catalog row.

## Decision changes (99)

These rows change the gold id, or change between SEND and ABSTAIN.


atom.2step.phases.en states "Phase 1 profit target is 8%". atom.checkout.options.en states "Phase 1 target 6%/7%/8%/10%/12% (default 8%)". Both bodies state the phase-1 figure the question asks. Neither is kept by a specificity tie-break.

| row | old | new |
|---|---|---|
| AD015 | SEND atom.2step.phases.en | ABSTAIN COVERAGE_DENIED |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. The challenge-phase sentence is not asked, so the product news row is not a single covering body.

| row | old | new |
|---|---|---|
| AD045 | SEND atom.2step.news.en | ABSTAIN COVERAGE_DENIED |
| AD048 | SEND atom.2step.news.en | ABSTAIN COVERAGE_DENIED |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the menu the question asks.

| row | old | new |
|---|---|---|
| AD049 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |
| AD050 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |
| AD051 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |
| AD052 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |
| AD053 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |
| AD054 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu.

| row | old | new |
|---|---|---|
| AD055 | SEND atom.2step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD056 | SEND atom.2step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD057 | SEND atom.2step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD058 | SEND atom.2step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD059 | SEND atom.2step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD060 | SEND atom.2step.reward.en | ABSTAIN COVERAGE_DENIED |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Both cover a percent-only ask. The obsolete body is not more specific under the new rule.

| row | old | new |
|---|---|---|
| AD062 | SEND atom.1step.phases.en | ABSTAIN COVERAGE_DENIED |
| AD063 | SEND atom.1step.phases.en | ABSTAIN COVERAGE_DENIED |
| AD065 | SEND atom.1step.phases.en | ABSTAIN COVERAGE_DENIED |

atom.1step.min-days.en states "no minimum profitable days in evaluation". atom.1step.funded-profitable-days.en states "Evaluation has no minimum profitable days". Both cover an evaluation profitable-day ask. The question does not ask the trading-day or $500 facts that only the min-days body states.

| row | old | new |
|---|---|---|
| AD082 | SEND atom.1step.min-days.en | ABSTAIN COVERAGE_DENIED |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state the funded gate the question asks. The $500 example is not asked.

| row | old | new |
|---|---|---|
| AD085 | SEND atom.1step.funded-profitable-days.en | ABSTAIN COVERAGE_DENIED |
| AD086 | SEND atom.1step.funded-profitable-days.en | ABSTAIN COVERAGE_DENIED |
| AD087 | SEND atom.1step.funded-profitable-days.en | ABSTAIN COVERAGE_DENIED |
| AD088 | SEND atom.1step.funded-profitable-days.en | ABSTAIN COVERAGE_DENIED |

The question identifies a day of at least five hundred dollars on 100k. atom.1step.min-days.en states "Example (100K): a day counts as profitable when you close it at least $500 up". atom.1step.funded-profitable-days.en states the 0.5% rule and does not state $500. One body covers the dollar fact.

| row | old | new |
|---|---|---|
| AD089 | SEND atom.1step.funded-profitable-days.en | SEND atom.1step.min-days.en |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state the funded gate the question asks. The $500 example is not asked.

| row | old | new |
|---|---|---|
| AD090 | SEND atom.1step.funded-profitable-days.en | ABSTAIN COVERAGE_DENIED |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. The challenge-phase sentence is not asked, so the product news row is not a single covering body.

| row | old | new |
|---|---|---|
| AD098 | SEND atom.1step.news.en | ABSTAIN COVERAGE_DENIED |
| AD101 | SEND atom.1step.news.en | ABSTAIN COVERAGE_DENIED |

atom.1step.leverage.en states "Atom 1-Step leverage is fixed at the published default of 1:30". atom.checkout.options.en states "Atom 1-Step — max loss, target, leverage and scalping fixed". Both state that 1-Step leverage is fixed. The question does not ask a fact that only one of those sentences contains.

| row | old | new |
|---|---|---|
| AD108 | SEND atom.1step.leverage.en | ABSTAIN COVERAGE_DENIED |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu.

| row | old | new |
|---|---|---|
| AD109 | SEND atom.1step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD110 | SEND atom.1step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD111 | SEND atom.1step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD112 | SEND atom.1step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD113 | SEND atom.1step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD114 | SEND atom.1step.reward.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Both cover a first-wait ask. The obsolete body does not add a fact this question requires.

| row | old | new |
|---|---|---|
| AD115 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states "later payouts are every 14 days by default". atom.obsolete.first-payout-14.en states "Later payouts follow the purchased interval (default 14 days)". atom.checkout.options.en states "payout interval 3/7/14/21 days (default 14)". More than one body states the later default of 14 days.

| row | old | new |
|---|---|---|
| AD116 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states the purchased interval "3, 7, 14, or 21 days". atom.checkout.options.en states "payout interval 3/7/14/21 days". Both list the intervals the question asks. atom.obsolete.first-payout-14.en does not list 3 and 21.

| row | old | new |
|---|---|---|
| AD117 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states the first wait of 21 days and later payouts every 14 days by default. atom.obsolete.first-payout-14.en states both of those facts. The question asks only that pair.

| row | old | new |
|---|---|---|
| AD122 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Both state the 100k list figures the question asks.

| row | old | new |
|---|---|---|
| AD124 | SEND atom.prices.list.en | ABSTAIN COVERAGE_DENIED |
| AD129 | SEND atom.prices.list.en | ABSTAIN COVERAGE_DENIED |

atom.overview.en and atom.house.simulated.en both state "All Elite Atom accounts, including funded accounts, are simulated trading accounts." The question asks only that fact. It does not ask the real-capital or guaranteed-reward sentences, which only the house body states.

| row | old | new |
|---|---|---|
| AD148 | SEND atom.house.simulated.en | ABSTAIN COVERAGE_DENIED |
| AD152 | SEND atom.house.simulated.en | ABSTAIN COVERAGE_DENIED |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Both cover a percent-only ask. The obsolete body is not more specific under the new rule.

| row | old | new |
|---|---|---|
| AD154 | SEND atom.obsolete.10pct-1step.en | ABSTAIN COVERAGE_DENIED |
| AD155 | SEND atom.obsolete.10pct-1step.en | ABSTAIN COVERAGE_DENIED |
| AD157 | SEND atom.obsolete.10pct-1step.en | ABSTAIN COVERAGE_DENIED |
| AD158 | SEND atom.obsolete.10pct-1step.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Both cover a first-wait ask. The obsolete body does not add a fact this question requires.

| row | old | new |
|---|---|---|
| AD160 | SEND atom.obsolete.first-payout-14.en | ABSTAIN COVERAGE_DENIED |
| AD161 | SEND atom.obsolete.first-payout-14.en | ABSTAIN COVERAGE_DENIED |
| AD162 | SEND atom.obsolete.first-payout-14.en | ABSTAIN COVERAGE_DENIED |
| AD163 | SEND atom.obsolete.first-payout-14.en | ABSTAIN COVERAGE_DENIED |
| AD164 | SEND atom.obsolete.first-payout-14.en | ABSTAIN COVERAGE_DENIED |
| AD165 | SEND atom.obsolete.first-payout-14.en | ABSTAIN COVERAGE_DENIED |

atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.2step.leverage.en states "Atom leverage defaults to 1:30". Both cover a default-leverage ask. The old tie-break preferred the obsolete id.

| row | old | new |
|---|---|---|
| AD166 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |
| AD167 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |
| AD168 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |
| AD169 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |
| AD170 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |
| AD171 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |
| AD172 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |

atom.prices.list.en states "Promotional figures such as a permanent $161 100K price are not list prices." atom.obsolete.price-161-permanent.en states "A $161 figure from older marketing is promotional, not a permanent list price." Both cover a permanent-$161 ask.

| row | old | new |
|---|---|---|
| AD173 | SEND atom.obsolete.price-161-permanent.en | ABSTAIN COVERAGE_DENIED |
| AD174 | SEND atom.obsolete.price-161-permanent.en | ABSTAIN COVERAGE_DENIED |
| AD175 | SEND atom.obsolete.price-161-permanent.en | ABSTAIN COVERAGE_DENIED |
| AD176 | SEND atom.obsolete.price-161-permanent.en | ABSTAIN COVERAGE_DENIED |
| AD177 | SEND atom.obsolete.price-161-permanent.en | ABSTAIN COVERAGE_DENIED |
| AD178 | SEND atom.obsolete.price-161-permanent.en | ABSTAIN COVERAGE_DENIED |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Both cover a size-list or 5k/10k ask. The old tie-break preferred the obsolete id.

| row | old | new |
|---|---|---|
| AD179 | SEND atom.obsolete.sizes-5k-10k.en | ABSTAIN COVERAGE_DENIED |
| AD180 | SEND atom.obsolete.sizes-5k-10k.en | ABSTAIN COVERAGE_DENIED |
| AD181 | SEND atom.obsolete.sizes-5k-10k.en | ABSTAIN COVERAGE_DENIED |
| AD182 | SEND atom.obsolete.sizes-5k-10k.en | ABSTAIN COVERAGE_DENIED |
| AD183 | SEND atom.obsolete.sizes-5k-10k.en | ABSTAIN COVERAGE_DENIED |
| AD184 | SEND atom.obsolete.sizes-5k-10k.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states "Default reward share is 80%". atom.2step.reward.en and atom.1step.reward.en each state "the default reward share is 80%". atom.checkout.options.en states reward default 80% for both products. The question asks only for that default.

| row | old | new |
|---|---|---|
| AD185 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |
| AD186 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |

atom.2step.max-loss.en states "The floor is your starting balance minus 10% and never moves." The question asks whether that floor chases, ratchets, or lifts, and the text does not contain "trailing", so the 2-Step trailing veto does not apply. No other sendable body states this 2-Step floor.

| row | old | new |
|---|---|---|
| AD202 | ABSTAIN abstain:2step-trailing-uncovered | SEND atom.2step.max-loss.en |
| AD205 | ABSTAIN abstain:2step-trailing-uncovered | SEND atom.2step.max-loss.en |
| AD210 | ABSTAIN abstain:2step-trailing-uncovered | SEND atom.2step.max-loss.en |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Both cover a size-list or 5k/10k ask. The old tie-break preferred the obsolete id.

| row | old | new |
|---|---|---|
| AD345 | SEND atom.obsolete.sizes-5k-10k.en | ABSTAIN COVERAGE_DENIED |

atom.overview.en and atom.house.simulated.en both state "All Elite Atom accounts, including funded accounts, are simulated trading accounts." The question asks only that fact. It does not ask the real-capital or guaranteed-reward sentences, which only the house body states.

| row | old | new |
|---|---|---|
| AD347 | SEND atom.house.simulated.en | ABSTAIN COVERAGE_DENIED |

atom.1step.leverage.en states "Atom 1-Step leverage is fixed at the published default of 1:30". atom.checkout.options.en states "Atom 1-Step — max loss, target, leverage and scalping fixed". Both state that 1-Step leverage is fixed. The question does not ask a fact that only one of those sentences contains.

| row | old | new |
|---|---|---|
| AD348 | SEND atom.1step.leverage.en | ABSTAIN COVERAGE_DENIED |

atom.2step.phases.en states "Phase 1 profit target is 8%". atom.checkout.options.en states "Phase 1 target 6%/7%/8%/10%/12% (default 8%)". Both bodies state the phase-1 figure the question asks. Neither is kept by a specificity tie-break.

| row | old | new |
|---|---|---|
| AD351 | SEND atom.2step.phases.en | ABSTAIN COVERAGE_DENIED |

atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.2step.leverage.en states "Atom leverage defaults to 1:30". Both cover a default-leverage ask. The old tie-break preferred the obsolete id.

| row | old | new |
|---|---|---|
| AD354 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Both state the 100k list figures the question asks.

| row | old | new |
|---|---|---|
| AD357 | SEND atom.prices.list.en | ABSTAIN COVERAGE_DENIED |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the menu the question asks.

| row | old | new |
|---|---|---|
| AD359 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state the funded gate the question asks. The $500 example is not asked.

| row | old | new |
|---|---|---|
| AD360 | SEND atom.1step.funded-profitable-days.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Both cover a first-wait ask. The obsolete body does not add a fact this question requires.

| row | old | new |
|---|---|---|
| AD361 | SEND atom.obsolete.first-payout-14.en | ABSTAIN COVERAGE_DENIED |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Both cover a percent-only ask. The obsolete body is not more specific under the new rule.

| row | old | new |
|---|---|---|
| AD362 | SEND atom.obsolete.10pct-1step.en | ABSTAIN COVERAGE_DENIED |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Both state the 100k list figures the question asks.

| row | old | new |
|---|---|---|
| AD365 | SEND atom.prices.list.en | ABSTAIN COVERAGE_DENIED |
| AD370 | SEND atom.prices.list.en | ABSTAIN COVERAGE_DENIED |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. The challenge-phase sentence is not asked, so the product news row is not a single covering body.

| row | old | new |
|---|---|---|
| AD375 | SEND atom.2step.news.en | ABSTAIN COVERAGE_DENIED |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the menu the question asks.

| row | old | new |
|---|---|---|
| AD377 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu.

| row | old | new |
|---|---|---|
| AD379 | SEND atom.2step.reward.en | ABSTAIN COVERAGE_DENIED |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu.

| row | old | new |
|---|---|---|
| AD380 | SEND atom.1step.reward.en | ABSTAIN COVERAGE_DENIED |

atom.1step.min-days.en states "no minimum profitable days in evaluation". atom.1step.funded-profitable-days.en states "Evaluation has no minimum profitable days". Both cover an evaluation profitable-day ask. The question does not ask the trading-day or $500 facts that only the min-days body states.

| row | old | new |
|---|---|---|
| AD382 | SEND atom.1step.min-days.en | ABSTAIN COVERAGE_DENIED |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state the funded gate the question asks. The $500 example is not asked.

| row | old | new |
|---|---|---|
| AD383 | SEND atom.1step.funded-profitable-days.en | ABSTAIN COVERAGE_DENIED |

atom.2step.phases.en states "Phase 1 profit target is 8%". atom.checkout.options.en states "Phase 1 target 6%/7%/8%/10%/12% (default 8%)". Both bodies state the phase-1 figure the question asks. Neither is kept by a specificity tie-break.

| row | old | new |
|---|---|---|
| AD387 | SEND atom.2step.phases.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states "later payouts are every 14 days by default". atom.obsolete.first-payout-14.en states "Later payouts follow the purchased interval (default 14 days)". atom.checkout.options.en states "payout interval 3/7/14/21 days (default 14)". More than one body states the later default of 14 days.

| row | old | new |
|---|---|---|
| AD393 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states the purchased interval "3, 7, 14, or 21 days". atom.checkout.options.en states "payout interval 3/7/14/21 days". Both list the intervals the question asks. atom.obsolete.first-payout-14.en does not list 3 and 21.

| row | old | new |
|---|---|---|
| AD394 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |

atom.overview.en and atom.house.simulated.en both state "All Elite Atom accounts, including funded accounts, are simulated trading accounts." The question asks only that fact. It does not ask the real-capital or guaranteed-reward sentences, which only the house body states.

| row | old | new |
|---|---|---|
| AD401 | SEND atom.house.simulated.en | ABSTAIN COVERAGE_DENIED |

atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.2step.leverage.en states "Atom leverage defaults to 1:30". Both cover a default-leverage ask. The old tie-break preferred the obsolete id.

| row | old | new |
|---|---|---|
| AD411 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |

## Representation only (135)

The abstain-versus-send decision is the same. The code, the policy id, or the action name changes to the contract. Refuse rows are SEND of `atom.account-status.refuse.en` because there is no PERSONAL action. The partId on those rows does not change.


The ask is a 2-Step trailing mechanism. atom.2step.max-loss.en states "max loss is 10% static" and "the floor ... never moves" and does not state trailing. atom.1step.max-loss.en states "max loss is 6% trailing equity" on Atom 1-Step and does not cover a 2-Step trailing ask. Code is atom-2step-trailing.

| row | old | new |
|---|---|---|
| AD201 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD203 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD204 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD206 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD207 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD208 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD209 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD211 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD212 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |

More than one intent, and no single approved body states every intent. Code is COVERAGE_DENIED.

| row | old | new |
|---|---|---|
| AD215 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD216 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD217 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD218 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD219 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD220 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD221 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD222 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD223 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD224 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD225 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD226 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD227 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD228 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD229 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD230 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD231 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD232 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD233 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD234 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |

atom.account-status.refuse.en states that Luna cannot confirm an individual account. It does not state the daily-loss rule. The daily-loss body does not state personal status. Neither body covers both intents. Code is COVERAGE_DENIED, not a SEND of the refuse id.

| row | old | new |
|---|---|---|
| AD235 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |

More than one intent, and no single approved body states every intent. Code is COVERAGE_DENIED.

| row | old | new |
|---|---|---|
| AD236 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD237 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |

No sendable body states which size to buy. Code unresolved-policy, policy policy.sku.

| row | old | new |
|---|---|---|
| AD238 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |

Clarification stays an abstain. atom.handoff.unverified.en says a teammate can help and is a handoff suggestion. The registry does not name that id as a clarification partId, so it is not a SEND. Code is atom-clarification.

| row | old | new |
|---|---|---|
| AD239 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD240 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD241 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD242 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD243 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD244 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD245 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD246 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD247 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD248 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD249 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD250 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD251 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD252 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD253 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD254 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |

No sendable body states the asked fact. Code is COVERAGE_DENIED.

| row | old | new |
|---|---|---|
| AD255 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD256 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD257 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD258 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD259 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD260 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD261 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD262 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD263 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD264 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD265 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD266 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD267 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD268 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD269 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD270 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |

Unresolved fee-refund ask. atom.prices.list.en states list prices and atom.payouts.general.en states payout timing and the 3% cap. Neither states a fee-refund outcome. Code unresolved-policy, policy policy.fee-refunds.

| row | old | new |
|---|---|---|
| AD271 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |
| AD272 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |
| AD273 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |
| AD274 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |
| AD275 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |
| AD276 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |
| AD277 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |
| AD278 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |

atom.1step.consistency.en and atom.2step.consistency.en state that the best day must be less than 50%. They do not state the exactly-50% case. atom.consistency.boundary.en is not sendable. Code unresolved-policy, policy policy.equality-50.

| row | old | new |
|---|---|---|
| AD279 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |
| AD280 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |
| AD281 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |
| AD282 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |
| AD283 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |
| AD284 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |
| AD285 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |
| AD286 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |

atom.1step.news.en and atom.2step.news.en state whether high-impact news is allowed. They do not state a minute window or an instrument list. atom.news.minutes.unverified.en is not sendable. Code unresolved-policy, policy policy.news-minutes.

| row | old | new |
|---|---|---|
| AD287 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |
| AD288 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |
| AD289 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |
| AD290 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |
| AD291 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |
| AD292 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |
| AD293 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |
| AD294 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |

No sendable body states which size to buy. Code unresolved-policy, policy policy.sku.

| row | old | new |
|---|---|---|
| AD295 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |
| AD296 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |
| AD297 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |
| AD298 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |
| AD299 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |
| AD300 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |
| AD301 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |
| AD302 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |

The turn is an English request to translate. It is not a non-English turn, so it is not left off the module. No sendable body is a translation. Code unresolved-policy, policy policy.translations.

| row | old | new |
|---|---|---|
| AD303 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |
| AD304 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |
| AD305 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |
| AD306 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |
| AD307 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |
| AD308 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |
| AD309 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |
| AD310 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |

atom.bundles.en states "Verify current eligibility and stacking on the live checkout" and does not state whether two promo codes combine. Code unresolved-policy, policy policy.coupon-stacking.

| row | old | new |
|---|---|---|
| AD311 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |
| AD312 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |
| AD313 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |
| AD314 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |
| AD315 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |
| AD316 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |
| AD317 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |
| AD318 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |

atom.account-status.refuse.en states that Luna cannot confirm whether an individual account is eligible, compliant, breached, KYC-approved, or ready for a payout. decide is SEND of that id. There is no PERSONAL action.

| row | old | new |
|---|---|---|
| AD319 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD320 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD321 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD322 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD323 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD324 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD325 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD326 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD327 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD328 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD329 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD330 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD331 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD332 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD333 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD334 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD335 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD336 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |

The ask is a 2-Step trailing mechanism. atom.2step.max-loss.en states "max loss is 10% static" and "the floor ... never moves" and does not state trailing. atom.1step.max-loss.en states "max loss is 6% trailing equity" on Atom 1-Step and does not cover a 2-Step trailing ask. Code is atom-2step-trailing.

| row | old | new |
|---|---|---|
| AD355 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |

atom.account-status.refuse.en states that Luna cannot confirm whether an individual account is eligible, compliant, breached, KYC-approved, or ready for a payout. decide is SEND of that id. There is no PERSONAL action.

| row | old | new |
|---|---|---|
| AD356 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |

atom.bundles.en states "Verify current eligibility and stacking on the live checkout" and does not state whether two promo codes combine. Code unresolved-policy, policy policy.coupon-stacking.

| row | old | new |
|---|---|---|
| AD363 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |

atom.1step.consistency.en and atom.2step.consistency.en state that the best day must be less than 50%. They do not state the exactly-50% case. atom.consistency.boundary.en is not sendable. Code unresolved-policy, policy policy.equality-50.

| row | old | new |
|---|---|---|
| AD364 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |

## Unchanged answer ids

178 rows keep the same sendable id. Each of those asks is covered by that one body, including 1-Step trailing and trailing with no product named, which stay `atom.1step.max-loss.en` (`78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc`) because that body states trailing equity and no other sendable Atom body does.
