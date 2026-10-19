# Atom dev-set label changelog

## Revision bce740fb

Authority: branch t742-design, commit `bce740fb6955e9fc60b3a87809b94bfb67246d7f`, `staging-repair-t739/docs/T742_DESIGN_AND_ACCEPTANCE.md` sha256 `fedb3bc6a7b58172ad3af4cca6f47b2504361883ed901fa407662fa3e352783b`.

The rule "two rows at or above T means ABSTAIN" is withdrawn. Where one or more approved bodies each state every asked fact and do not conflict, the gold is that set. Any member is a correct send. `decide.partId` is the deterministic pick: highest score, then smallest id. An obsolete body that restates the same fact stays in the set. Abstain only when nothing covers, or the facts conflict and are not an obsolete-versus-current split.

Row text is unchanged. Catalog bodies, ids, and sendability are unchanged.

Rows changed in this revision: 107.


atom.2step.phases.en states "Phase 1 profit target is 8%". atom.checkout.options.en states "Phase 1 target 6%/7%/8%/10%/12% (default 8%)". Both state the phase-1 figure. They agree, so both are acceptable. The withdrawn two-above-threshold abstain does not apply. Deterministic pick atom.checkout.options.en (highest score, then smallest id). Scores: checkout.options=0.1381, 2step.phases=0.1061.

| row | old | new |
|---|---|---|
| AD015 | ABSTAIN COVERAGE_DENIED | SEND atom.checkout.options.en acceptable [atom.2step.phases.en, atom.checkout.options.en] |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. They agree. Deterministic pick atom.2step.news.en (highest score, then smallest id). Scores: 2step.news=0.4087, 1step.news=0.3717.

| row | old | new |
|---|---|---|
| AD045 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.news.en acceptable [atom.1step.news.en, atom.2step.news.en] |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. They agree. Deterministic pick atom.2step.news.en (highest score, then smallest id). Scores: 2step.news=0.4075, 1step.news=0.3697.

| row | old | new |
|---|---|---|
| AD048 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.news.en acceptable [atom.1step.news.en, atom.2step.news.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.2303, 2step.leverage=0.2285, checkout.options=0.1129.

| row | old | new |
|---|---|---|
| AD049 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.3253, 2step.leverage=0.2384, checkout.options=0.1223.

| row | old | new |
|---|---|---|
| AD050 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.2step.leverage.en (highest score, then smallest id). Scores: 2step.leverage=0.2287, obsolete.leverage-150-default=0.1427, checkout.options=0.0467.

| row | old | new |
|---|---|---|
| AD051 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.leverage.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.1689, 2step.leverage=0.1516, checkout.options=0.0879.

| row | old | new |
|---|---|---|
| AD052 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.2step.leverage.en (highest score, then smallest id). Scores: 2step.leverage=0.2018, obsolete.leverage-150-default=0.1353, checkout.options=0.0341.

| row | old | new |
|---|---|---|
| AD053 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.leverage.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.2step.leverage.en (highest score, then smallest id). Scores: 2step.leverage=0.1025, obsolete.leverage-150-default=0.0862, checkout.options=0.0770.

| row | old | new |
|---|---|---|
| AD054 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.leverage.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu. They agree. Deterministic pick atom.2step.reward.en (highest score, then smallest id). Scores: 2step.reward=0.1581, checkout.options=0.0710.

| row | old | new |
|---|---|---|
| AD055 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.reward.en acceptable [atom.2step.reward.en, atom.checkout.options.en] |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu. They agree. Deterministic pick atom.2step.reward.en (highest score, then smallest id). Scores: 2step.reward=0.2291, checkout.options=0.0251.

| row | old | new |
|---|---|---|
| AD056 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.reward.en acceptable [atom.2step.reward.en, atom.checkout.options.en] |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu. They agree. Deterministic pick atom.2step.reward.en (highest score, then smallest id). Scores: 2step.reward=0.2561, checkout.options=0.1309.

| row | old | new |
|---|---|---|
| AD057 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.reward.en acceptable [atom.2step.reward.en, atom.checkout.options.en] |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu. They agree. Deterministic pick atom.2step.reward.en (highest score, then smallest id). Scores: 2step.reward=0.1996, checkout.options=0.0638.

| row | old | new |
|---|---|---|
| AD058 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.reward.en acceptable [atom.2step.reward.en, atom.checkout.options.en] |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu. They agree. Deterministic pick atom.2step.reward.en (highest score, then smallest id). Scores: 2step.reward=0.1053, checkout.options=0.0584.

| row | old | new |
|---|---|---|
| AD059 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.reward.en acceptable [atom.2step.reward.en, atom.checkout.options.en] |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu. They agree. Deterministic pick atom.2step.reward.en (highest score, then smallest id). Scores: 2step.reward=0.2405, checkout.options=0.1491.

| row | old | new |
|---|---|---|
| AD060 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.reward.en acceptable [atom.2step.reward.en, atom.checkout.options.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.obsolete.10pct-1step.en (highest score, then smallest id). Scores: obsolete.10pct-1step=0.2000, 1step.phases=0.1803.

| row | old | new |
|---|---|---|
| AD062 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.10pct-1step.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.obsolete.10pct-1step.en (highest score, then smallest id). Scores: obsolete.10pct-1step=0.2014, 1step.phases=0.1392.

| row | old | new |
|---|---|---|
| AD063 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.10pct-1step.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.1step.phases.en (highest score, then smallest id). Scores: 1step.phases=0.1940, obsolete.10pct-1step=0.1674.

| row | old | new |
|---|---|---|
| AD065 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.phases.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.1step.min-days.en states "no minimum profitable days in evaluation". atom.1step.funded-profitable-days.en states "Evaluation has no minimum profitable days". Both state that evaluation fact. They agree. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.2619, 1step.min-days=0.2383.

| row | old | new |
|---|---|---|
| AD082 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state that gate. They agree. The question does not ask the $500 example, which only the min-days body states. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.3662, 1step.min-days=0.2383.

| row | old | new |
|---|---|---|
| AD085 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state that gate. They agree. The question does not ask the $500 example, which only the min-days body states. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.1668, 1step.min-days=0.1096.

| row | old | new |
|---|---|---|
| AD086 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state that gate. They agree. The question does not ask the $500 example, which only the min-days body states. Deterministic pick atom.1step.min-days.en (highest score, then smallest id). Scores: 1step.min-days=0.1736, 1step.funded-profitable-days=0.1116.

| row | old | new |
|---|---|---|
| AD087 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.min-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state that gate. They agree. The question does not ask the $500 example, which only the min-days body states. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.2644, 1step.min-days=0.1489.

| row | old | new |
|---|---|---|
| AD088 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state that gate. They agree. The question does not ask the $500 example, which only the min-days body states. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.1560, 1step.min-days=0.1217.

| row | old | new |
|---|---|---|
| AD090 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. They agree. Deterministic pick atom.2step.news.en (highest score, then smallest id). Scores: 2step.news=0.6218, 1step.news=0.5989.

| row | old | new |
|---|---|---|
| AD098 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.news.en acceptable [atom.1step.news.en, atom.2step.news.en] |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. They agree. Deterministic pick atom.2step.news.en (highest score, then smallest id). Scores: 2step.news=0.4390, 1step.news=0.4325.

| row | old | new |
|---|---|---|
| AD101 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.news.en acceptable [atom.1step.news.en, atom.2step.news.en] |

atom.1step.leverage.en states "Atom 1-Step leverage is fixed". atom.checkout.options.en states "Atom 1-Step — max loss, target, leverage and scalping fixed". Both state that 1-Step leverage is fixed. They agree. Deterministic pick atom.1step.leverage.en (highest score, then smallest id). Scores: 1step.leverage=0.1421, checkout.options=0.1117.

| row | old | new |
|---|---|---|
| AD108 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.leverage.en acceptable [atom.1step.leverage.en, atom.checkout.options.en] |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.2773, checkout.options=0.0624.

| row | old | new |
|---|---|---|
| AD109 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.checkout.options.en] |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.1000, checkout.options=0.0118.

| row | old | new |
|---|---|---|
| AD110 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.checkout.options.en] |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.2024, checkout.options=0.0853.

| row | old | new |
|---|---|---|
| AD111 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.checkout.options.en] |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.2874, checkout.options=0.0222.

| row | old | new |
|---|---|---|
| AD112 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.checkout.options.en] |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.2175, checkout.options=0.0521.

| row | old | new |
|---|---|---|
| AD113 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.checkout.options.en] |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.1286, checkout.options=0.1131.

| row | old | new |
|---|---|---|
| AD114 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.checkout.options.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.3376, payouts.general=0.2128.

| row | old | new |
|---|---|---|
| AD115 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states "later payouts are every 14 days by default". atom.obsolete.first-payout-14.en states "Later payouts follow the purchased interval (default 14 days)". atom.checkout.options.en states "payout interval 3/7/14/21 days (default 14)". All three state the later default. They agree. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.2662, payouts.general=0.2250, checkout.options=0.0655.

| row | old | new |
|---|---|---|
| AD116 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.checkout.options.en, atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states the purchased interval "3, 7, 14, or 21 days". atom.checkout.options.en states "payout interval 3/7/14/21 days". Both list those intervals. atom.obsolete.first-payout-14.en does not list 3 and 21. Deterministic pick atom.payouts.general.en (highest score, then smallest id). Scores: payouts.general=0.2585, checkout.options=0.0857.

| row | old | new |
|---|---|---|
| AD117 | ABSTAIN COVERAGE_DENIED | SEND atom.payouts.general.en acceptable [atom.checkout.options.en, atom.payouts.general.en] |

atom.payouts.general.en states the first wait of 21 days and later payouts every 14 days by default. atom.obsolete.first-payout-14.en states both of those facts. atom.checkout.options.en does not state the first wait of 21 days. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.2356, payouts.general=0.1313.

| row | old | new |
|---|---|---|
| AD122 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Same list figures. The obsolete row restates them, so both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.2310, prices.list=0.1396.

| row | old | new |
|---|---|---|
| AD124 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Same list figures. The obsolete row restates them, so both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.3390, prices.list=0.2150.

| row | old | new |
|---|---|---|
| AD129 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

The normalized text contains both the atom token and a pack/packs token. claim.kind is none. The router abstains and does not call decide. atom.bundles.en states the multi-buy offer where that is the asked fact, and that body is not emitted on this row.

| row | old | new |
|---|---|---|
| AD137 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |
| AD139 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |
| AD140 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |

atom.overview.en and atom.house.simulated.en both state "All Elite Atom accounts, including funded accounts, are simulated trading accounts." The question asks only that fact. They agree. The real-capital and guaranteed-reward sentences are not asked. Deterministic pick atom.house.simulated.en (highest score, then smallest id). Scores: house.simulated=0.3201, overview.en=0.1445.

| row | old | new |
|---|---|---|
| AD148 | ABSTAIN COVERAGE_DENIED | SEND atom.house.simulated.en acceptable [atom.house.simulated.en, atom.overview.en] |

atom.overview.en and atom.house.simulated.en both state "All Elite Atom accounts, including funded accounts, are simulated trading accounts." The question asks only that fact. They agree. The real-capital and guaranteed-reward sentences are not asked. Deterministic pick atom.overview.en (highest score, then smallest id). Scores: overview.en=0.1062, house.simulated=0.0880.

| row | old | new |
|---|---|---|
| AD152 | ABSTAIN COVERAGE_DENIED | SEND atom.overview.en acceptable [atom.house.simulated.en, atom.overview.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.obsolete.10pct-1step.en (highest score, then smallest id). Scores: obsolete.10pct-1step=0.3204, 1step.phases=0.2833.

| row | old | new |
|---|---|---|
| AD154 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.10pct-1step.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.obsolete.10pct-1step.en (highest score, then smallest id). Scores: obsolete.10pct-1step=0.2075, 1step.phases=0.0429.

| row | old | new |
|---|---|---|
| AD155 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.10pct-1step.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.1step.phases.en (highest score, then smallest id). Scores: 1step.phases=0.0819, obsolete.10pct-1step=0.0627.

| row | old | new |
|---|---|---|
| AD157 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.phases.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.obsolete.10pct-1step.en (highest score, then smallest id). Scores: obsolete.10pct-1step=0.2584, 1step.phases=0.1452.

| row | old | new |
|---|---|---|
| AD158 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.10pct-1step.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.3668, payouts.general=0.1330.

| row | old | new |
|---|---|---|
| AD160 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.2087, payouts.general=0.1011.

| row | old | new |
|---|---|---|
| AD161 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.3220, payouts.general=0.1995.

| row | old | new |
|---|---|---|
| AD162 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.1492, payouts.general=0.0817.

| row | old | new |
|---|---|---|
| AD163 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.0958, payouts.general=0.0846.

| row | old | new |
|---|---|---|
| AD164 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.2826, payouts.general=0.0808.

| row | old | new |
|---|---|---|
| AD165 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30". atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.checkout.options.en states leverage "(default 1:30)". atom.1step.leverage.en states "the published default of 1:30". All four state that default. They agree. The obsolete row is a restatement, not a conflicting fact. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.3042, 2step.leverage=0.2397, 1step.leverage=0.2263, checkout.options=0.1471.

| row | old | new |
|---|---|---|
| AD166 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30". atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.checkout.options.en states leverage "(default 1:30)". atom.1step.leverage.en states "the published default of 1:30". All four state that default. They agree. The obsolete row is a restatement, not a conflicting fact. Deterministic pick atom.1step.leverage.en (highest score, then smallest id). Scores: 1step.leverage=0.1658, 2step.leverage=0.1501, checkout.options=0.1002, obsolete.leverage-150-default=0.0784.

| row | old | new |
|---|---|---|
| AD167 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.leverage.en acceptable [atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30" and that 2-Step can pick 1:50 or 1:100. atom.checkout.options.en states the 2-Step leverage default 1:30. atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and that 1:50 or 1:100 is a 2-Step checkout option, not the universal default. They agree. atom.1step.leverage.en does not state the 2-Step default. Deterministic pick atom.2step.leverage.en (highest score, then smallest id). Scores: 2step.leverage=0.2445, obsolete.leverage-150-default=0.1041, checkout.options=0.0823.

| row | old | new |
|---|---|---|
| AD168 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.leverage.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30". atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.checkout.options.en states leverage "(default 1:30)". atom.1step.leverage.en states "the published default of 1:30". All four state that default. They agree. The obsolete row is a restatement, not a conflicting fact. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.0619, 1step.leverage=0.0440, 2step.leverage=0.0378, checkout.options=0.0359.

| row | old | new |
|---|---|---|
| AD169 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30". atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.checkout.options.en states leverage "(default 1:30)". atom.1step.leverage.en states "the published default of 1:30". All four state that default. They agree. The obsolete row is a restatement, not a conflicting fact. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.1857, 2step.leverage=0.1188, 1step.leverage=0.1131, checkout.options=0.0792.

| row | old | new |
|---|---|---|
| AD170 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30" and that 2-Step can pick 1:50 or 1:100. atom.checkout.options.en states the 2-Step leverage default 1:30. atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and that 1:50 or 1:100 is a 2-Step checkout option, not the universal default. They agree. atom.1step.leverage.en does not state the 2-Step default. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.2615, 2step.leverage=0.1532, checkout.options=0.0743.

| row | old | new |
|---|---|---|
| AD171 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30". atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.checkout.options.en states leverage "(default 1:30)". atom.1step.leverage.en states "the published default of 1:30". All four state that default. They agree. The obsolete row is a restatement, not a conflicting fact. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.2108, 1step.leverage=0.1626, checkout.options=0.0960, 2step.leverage=0.0844.

| row | old | new |
|---|---|---|
| AD172 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.prices.list.en states "Promotional figures such as a permanent $161 100K price are not list prices." atom.obsolete.price-161-permanent.en states "A $161 figure from older marketing is promotional, not a permanent list price." Same fact. Both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.3185, prices.list=0.2350.

| row | old | new |
|---|---|---|
| AD173 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "Promotional figures such as a permanent $161 100K price are not list prices." atom.obsolete.price-161-permanent.en states "A $161 figure from older marketing is promotional, not a permanent list price." Same fact. Both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.2334, prices.list=0.1793.

| row | old | new |
|---|---|---|
| AD174 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "Promotional figures such as a permanent $161 100K price are not list prices." atom.obsolete.price-161-permanent.en states "A $161 figure from older marketing is promotional, not a permanent list price." Same fact. Both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.2306, prices.list=0.1982.

| row | old | new |
|---|---|---|
| AD175 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "Promotional figures such as a permanent $161 100K price are not list prices." atom.obsolete.price-161-permanent.en states "A $161 figure from older marketing is promotional, not a permanent list price." Same fact. Both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.3635, prices.list=0.2094.

| row | old | new |
|---|---|---|
| AD176 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "Promotional figures such as a permanent $161 100K price are not list prices." atom.obsolete.price-161-permanent.en states "A $161 figure from older marketing is promotional, not a permanent list price." Same fact. Both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.2340, prices.list=0.1416.

| row | old | new |
|---|---|---|
| AD177 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "Promotional figures such as a permanent $161 100K price are not list prices." atom.obsolete.price-161-permanent.en states "A $161 figure from older marketing is promotional, not a permanent list price." Same fact. Both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.3185, prices.list=0.2364.

| row | old | new |
|---|---|---|
| AD178 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Same facts. Both stay. Deterministic pick atom.obsolete.sizes-5k-10k.en (highest score, then smallest id). Scores: obsolete.sizes-5k-10k=0.2435, prices.list=0.1250.

| row | old | new |
|---|---|---|
| AD179 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.sizes-5k-10k.en acceptable [atom.obsolete.sizes-5k-10k.en, atom.prices.list.en] |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Same facts. Both stay. Deterministic pick atom.obsolete.sizes-5k-10k.en (highest score, then smallest id). Scores: obsolete.sizes-5k-10k=0.2823, prices.list=0.1083.

| row | old | new |
|---|---|---|
| AD180 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.sizes-5k-10k.en acceptable [atom.obsolete.sizes-5k-10k.en, atom.prices.list.en] |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Same facts. Both stay. Deterministic pick atom.obsolete.sizes-5k-10k.en (highest score, then smallest id). Scores: obsolete.sizes-5k-10k=0.2333, prices.list=0.1650.

| row | old | new |
|---|---|---|
| AD181 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.sizes-5k-10k.en acceptable [atom.obsolete.sizes-5k-10k.en, atom.prices.list.en] |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Same facts. Both stay. Deterministic pick atom.obsolete.sizes-5k-10k.en (highest score, then smallest id). Scores: obsolete.sizes-5k-10k=0.3600, prices.list=0.1206.

| row | old | new |
|---|---|---|
| AD182 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.sizes-5k-10k.en acceptable [atom.obsolete.sizes-5k-10k.en, atom.prices.list.en] |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Same facts. Both stay. Deterministic pick atom.obsolete.sizes-5k-10k.en (highest score, then smallest id). Scores: obsolete.sizes-5k-10k=0.2919, prices.list=0.1782.

| row | old | new |
|---|---|---|
| AD183 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.sizes-5k-10k.en acceptable [atom.obsolete.sizes-5k-10k.en, atom.prices.list.en] |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Same facts. Both stay. Deterministic pick atom.obsolete.sizes-5k-10k.en (highest score, then smallest id). Scores: obsolete.sizes-5k-10k=0.1876, prices.list=0.0141.

| row | old | new |
|---|---|---|
| AD184 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.sizes-5k-10k.en acceptable [atom.obsolete.sizes-5k-10k.en, atom.prices.list.en] |

atom.payouts.general.en states "Default reward share is 80%". atom.2step.reward.en and atom.1step.reward.en each state "the default reward share is 80%". atom.checkout.options.en states reward default 80% for both products. The question asks only that default. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.3132, 2step.reward=0.2977, payouts.general=0.1402, checkout.options=0.0962.

| row | old | new |
|---|---|---|
| AD185 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.2step.reward.en, atom.checkout.options.en, atom.payouts.general.en] |

atom.payouts.general.en states "Default reward share is 80%". atom.2step.reward.en and atom.1step.reward.en each state "the default reward share is 80%". atom.checkout.options.en states reward default 80% for both products. The question asks only that default. They agree. Deterministic pick atom.payouts.general.en (highest score, then smallest id). Scores: payouts.general=0.1119, checkout.options=0.0721, 1step.reward=0.0612, 2step.reward=0.0578.

| row | old | new |
|---|---|---|
| AD186 | ABSTAIN COVERAGE_DENIED | SEND atom.payouts.general.en acceptable [atom.1step.reward.en, atom.2step.reward.en, atom.checkout.options.en, atom.payouts.general.en] |

The normalized text contains both the atom token and a pack/packs token. claim.kind is none. The router abstains and does not call decide. atom.bundles.en states the multi-buy offer where that is the asked fact, and that body is not emitted on this row.

| row | old | new |
|---|---|---|
| AD194 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |
| AD229 | claim none; ABSTAIN COVERAGE_DENIED | claim none; router abstain both-entities; decide not called |
| AD337 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |
| AD338 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |
| AD340 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |
| AD342 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Same facts. Both stay. Deterministic pick atom.obsolete.sizes-5k-10k.en (highest score, then smallest id). Scores: obsolete.sizes-5k-10k=0.3016, prices.list=0.1673.

| row | old | new |
|---|---|---|
| AD345 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.sizes-5k-10k.en acceptable [atom.obsolete.sizes-5k-10k.en, atom.prices.list.en] |

atom.overview.en and atom.house.simulated.en both state "All Elite Atom accounts, including funded accounts, are simulated trading accounts." The question asks only that fact. They agree. The real-capital and guaranteed-reward sentences are not asked. Deterministic pick atom.house.simulated.en (highest score, then smallest id). Scores: house.simulated=0.1623, overview.en=0.1520.

| row | old | new |
|---|---|---|
| AD347 | ABSTAIN COVERAGE_DENIED | SEND atom.house.simulated.en acceptable [atom.house.simulated.en, atom.overview.en] |

atom.1step.leverage.en states "Atom 1-Step leverage is fixed". atom.checkout.options.en states "Atom 1-Step — max loss, target, leverage and scalping fixed". Both state that 1-Step leverage is fixed. They agree. Deterministic pick atom.1step.leverage.en (highest score, then smallest id). Scores: 1step.leverage=0.2356, checkout.options=0.1206.

| row | old | new |
|---|---|---|
| AD348 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.leverage.en acceptable [atom.1step.leverage.en, atom.checkout.options.en] |

Digit 0 is not folded, so at0m is not the atom token. claim.kind stays none. atom.1step.max-loss.en states "max loss is 6% trailing equity" and is not the end-to-end gold. decide is not called.

| row | old | new |
|---|---|---|
| AD349 | claim none; SEND atom.1step.max-loss.en | claim none; router abstain no-atom-entity; no module SEND |

atom.2step.phases.en states "Phase 1 profit target is 8%". atom.checkout.options.en states "Phase 1 target 6%/7%/8%/10%/12% (default 8%)". Both state the phase-1 figure. They agree, so both are acceptable. The withdrawn two-above-threshold abstain does not apply. Deterministic pick atom.2step.phases.en (highest score, then smallest id). Scores: 2step.phases=0.2321, checkout.options=0.1011.

| row | old | new |
|---|---|---|
| AD351 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.phases.en acceptable [atom.2step.phases.en, atom.checkout.options.en] |

The zero-width character is a format character and is deleted, not turned into a space. The glued form atom1step is not the token atom. claim.kind is none. atom.1step.daily-loss.en states the asked daily-loss fact and is not the end-to-end gold. decide is not called.

| row | old | new |
|---|---|---|
| AD352 | claim exclusive; SEND atom.1step.daily-loss.en | claim none; router abstain no-atom-entity; no module SEND |

Spaced single letters join to the token atom. claim is exclusive. atom.1step.news.en states "On Atom 1-Step, news trading is allowed during evaluation." That is the only covering body. Flag off, the end-to-end gold is F1 silence. Flag on, the module gold is that id.

| row | old | new |
|---|---|---|
| AD353 | claim none; SEND atom.1step.news.en | claim exclusive atom; SEND atom.1step.news.en; flag off f1-silence |

atom.2step.leverage.en states "Atom leverage defaults to 1:30". atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.checkout.options.en states leverage "(default 1:30)". atom.1step.leverage.en states "the published default of 1:30". All four state that default. They agree. The obsolete row is a restatement, not a conflicting fact. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.2572, 2step.leverage=0.1242, 1step.leverage=0.1066, checkout.options=0.0629.

| row | old | new |
|---|---|---|
| AD354 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Same list figures. The obsolete row restates them, so both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.2789, prices.list=0.1734.

| row | old | new |
|---|---|---|
| AD357 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.1589, 2step.leverage=0.1356, checkout.options=0.1145.

| row | old | new |
|---|---|---|
| AD359 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state that gate. They agree. The question does not ask the $500 example, which only the min-days body states. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.2589, 1step.min-days=0.2231.

| row | old | new |
|---|---|---|
| AD360 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.4253, payouts.general=0.1367.

| row | old | new |
|---|---|---|
| AD361 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.obsolete.10pct-1step.en (highest score, then smallest id). Scores: obsolete.10pct-1step=0.1892, 1step.phases=0.1858.

| row | old | new |
|---|---|---|
| AD362 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.10pct-1step.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Same list figures. The obsolete row restates them, so both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.2669, prices.list=0.1654.

| row | old | new |
|---|---|---|
| AD365 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Same list figures. The obsolete row restates them, so both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.1492, prices.list=0.0884.

| row | old | new |
|---|---|---|
| AD370 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. They agree. Deterministic pick atom.2step.news.en (highest score, then smallest id). Scores: 2step.news=0.5755, 1step.news=0.5399.

| row | old | new |
|---|---|---|
| AD375 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.news.en acceptable [atom.1step.news.en, atom.2step.news.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.1617, 2step.leverage=0.1394, checkout.options=0.0495.

| row | old | new |
|---|---|---|
| AD377 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu. They agree. Deterministic pick atom.2step.reward.en (highest score, then smallest id). Scores: 2step.reward=0.1779, checkout.options=0.0556.

| row | old | new |
|---|---|---|
| AD379 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.reward.en acceptable [atom.2step.reward.en, atom.checkout.options.en] |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.1507, checkout.options=0.0438.

| row | old | new |
|---|---|---|
| AD380 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.checkout.options.en] |

atom.1step.min-days.en states "no minimum profitable days in evaluation". atom.1step.funded-profitable-days.en states "Evaluation has no minimum profitable days". Both state that evaluation fact. They agree. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.4398, 1step.min-days=0.2874.

| row | old | new |
|---|---|---|
| AD382 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state that gate. They agree. The question does not ask the $500 example, which only the min-days body states. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.2313, 1step.min-days=0.1830.

| row | old | new |
|---|---|---|
| AD383 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.2step.phases.en states "Phase 1 profit target is 8%". atom.checkout.options.en states "Phase 1 target 6%/7%/8%/10%/12% (default 8%)". Both state the phase-1 figure. They agree, so both are acceptable. The withdrawn two-above-threshold abstain does not apply. Deterministic pick atom.2step.phases.en (highest score, then smallest id). Scores: 2step.phases=0.2206, checkout.options=0.0667.

| row | old | new |
|---|---|---|
| AD387 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.phases.en acceptable [atom.2step.phases.en, atom.checkout.options.en] |

atom.payouts.general.en states the first wait of 21 days and later payouts every 14 days by default. atom.obsolete.first-payout-14.en states both. atom.checkout.options.en states the interval default of 14 days and does not state the first wait, so it does not cover "distinct from the first wait". Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.4178, payouts.general=0.2203.

| row | old | new |
|---|---|---|
| AD393 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states the purchased interval "3, 7, 14, or 21 days". atom.checkout.options.en states "payout interval 3/7/14/21 days". Both list those intervals. atom.obsolete.first-payout-14.en does not list 3 and 21. Deterministic pick atom.payouts.general.en (highest score, then smallest id). Scores: payouts.general=0.1464, checkout.options=0.1174.

| row | old | new |
|---|---|---|
| AD394 | ABSTAIN COVERAGE_DENIED | SEND atom.payouts.general.en acceptable [atom.checkout.options.en, atom.payouts.general.en] |

atom.overview.en and atom.house.simulated.en both state "All Elite Atom accounts, including funded accounts, are simulated trading accounts." The question asks only that fact. They agree. The real-capital and guaranteed-reward sentences are not asked. Deterministic pick atom.house.simulated.en (highest score, then smallest id). Scores: house.simulated=0.2728, overview.en=0.2371.

| row | old | new |
|---|---|---|
| AD401 | ABSTAIN COVERAGE_DENIED | SEND atom.house.simulated.en acceptable [atom.house.simulated.en, atom.overview.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30". atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.checkout.options.en states leverage "(default 1:30)". atom.1step.leverage.en states "the published default of 1:30". All four state that default. They agree. The obsolete row is a restatement, not a conflicting fact. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.1786, 1step.leverage=0.1056, 2step.leverage=0.1033, checkout.options=0.0706.

| row | old | new |
|---|---|---|
| AD411 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

---

# Previous revision (3c173899)

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
