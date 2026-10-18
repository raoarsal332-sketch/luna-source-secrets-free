'use strict';
/**
 * Author-written genuine general questions (t739) used to measure FALSE REFUSALS separately.
 * kind:
 *   'answer'   -> a supported approved answer exists and should be returned
 *   'clarify'  -> product-dependent; correct behaviour is a clarification (slot: product), not an answer
 *   'abstain'  -> no approved row covers the proposition; abstaining is correct (NOT a false refusal)
 * First 8 entries reproduce the questions the failed fix2 candidate wrongly blocked (from the review).
 */
const G = [
  ['GN01', 'What is default Atom leverage?', 'answer', 'atom.obsolete.leverage-150-default.en'],
  ['GN02', 'Atom news trading allowed in challenge?', 'clarify'],
  ['GN03', 'Are EAs allowed on Atom?', 'answer', 'atom.house.eas-copy.en'],
  ['GN04', 'Atom funded profitable days requirement?', 'clarify'],
  ['GN05', 'Is Atom 1-Step still 10%?', 'answer', 'atom.obsolete.10pct-1step.en'],
  ['GN06', 'What is Atom 2-Step daily 3%?', 'answer', 'atom.2step.daily-loss.en'],
  ['GN07', 'When can I request Atom payout after the first one?', 'answer', 'atom.payouts.general.en'],
  ['GN08', 'How often are Atom payouts after the first?', 'answer', 'atom.payouts.general.en'],
  ['GN09', 'What is the first payout wait on Atom?', 'answer', 'atom.payouts.general.en'],
  ['GN10', 'What are Atom payout rules?', 'answer', 'atom.payouts.general.en'],
  ['GN11', 'Is the Atom payout cap 3%?', 'answer', 'atom.payouts.general.en'],
  ['GN12', 'How long between Atom payouts?', 'answer', 'atom.payouts.general.en'],
  ['GN13', 'What is the max risk per instrument on Atom payouts?', 'answer', 'atom.payouts.general.en'],
  ['GN14', 'What is Atom 2-Step max loss on a 100K account?', 'answer', 'atom.2step.max-loss.en'],
  ['GN15', 'Atom 1-Step trailing drawdown, how does it move?', 'answer', 'atom.1step.max-loss.en'],
  ['GN16', 'Does Atom 1-Step have a daily loss limit?', 'answer', 'atom.1step.daily-loss.en'],
  ['GN17', 'Does Atom have a daily loss limit?', 'clarify'],
  ['GN18', 'What is the max loss on Atom?', 'clarify'],
  ['GN19', 'Is there a consistency rule on Atom?', 'clarify'],
  ['GN20', 'What are the phases on Atom?', 'clarify'],
  ['GN21', 'How much does Elite Atom cost?', 'answer', 'atom.prices.list.en'],
  ['GN22', 'What sizes does Atom come in and how much are they?', 'answer', 'atom.prices.list.en'],
  ['GN23', 'Atom 50K 1-Step price please', 'answer', 'atom.prices.list.en'],
  ['GN24', 'Is the Atom 7K cheap? what is the price', 'abstain'],
  ['GN25', 'Can I get a bigger reward share on Atom 1-Step?', 'answer', 'atom.1step.reward.en'],
  ['GN26', 'Atom 2-Step: can I choose a 95% reward share?', 'answer', 'atom.2step.reward.en'],
  ['GN27', 'What are the Atom 1-Step reward options?', 'answer', 'atom.1step.reward.en'],
  ['GN28', 'What is the Atom reward share by default?', 'answer', 'atom.payouts.general.en'],
  ['GN29', 'What are the Atom reward share options?', 'clarify'],
  ['GN30', 'Is Atom leverage adjustable?', 'answer', 'atom.obsolete.leverage-150-default.en'],
  ['GN31', 'Is Atom news trading allowed on funded accounts?', 'clarify'],
  ['GN32', 'Is Atom 2-Step news trading allowed on funded accounts?', 'answer', 'atom.2step.news.en'],
  ['GN33', 'Can I use a copier on my own accounts with Atom?', 'answer', 'atom.house.eas-copy.en'],
  ['GN34', 'Are Atom funded accounts simulated?', 'answer', 'atom.house.simulated.en'],
  ['GN35', 'Do Atom accounts have a time limit?', 'clarify'],
  ['GN36', 'Is there a minimum number of trading days on Atom 1-Step?', 'answer', 'atom.1step.min-days.en'],
  ['GN37', 'What add-ons can I buy at Atom checkout?', 'answer', 'atom.checkout.options.en'],
  ['GN38', 'What payout intervals can I choose when buying Atom?', 'answer', 'atom.checkout.options.en'],
  ['GN39', 'How many Atom accounts get a discount in one order?', 'answer', 'atom.bundles.en'],
  ['GN40', 'Is there a bundle deal on Atom?', 'abstain'],
  ['GN41', 'What is the Atom 1-Step profit target?', 'answer', 'atom.1step.phases.en'],
  ['GN42', 'What is the Atom 2-Step phase 2 target?', 'answer', 'atom.2step.phases.en'],
  ['GN43', 'Is Atom 1-Step 8% or 10% to pass?', 'answer', 'atom.obsolete.10pct-1step.en'],
  ['GN44', 'Tell me everything about Atom', 'abstain'],
  ['GN45', 'What is the Atom 2-Step consistency rule when funded?', 'answer', 'atom.2step.consistency.en'],
];

module.exports = G;
