'use strict';
/**
 * Cycle 2 held-out set. Written and frozen BEFORE any cycle-2 code change.
 * Do not add, delete, or relabel items after seeing scores. This file is not
 * a tuning set. Gold labels are the topic the question asks for.
 *
 * expect:
 *   short sendable id (no packs. / .en) — a product, refund, or missing row
 *   'block' — refuse or handoff, never a product / refund / missing row
 *   'abstain' — not this module
 * also: other short ids that are equally legitimate. Fixed at freeze time.
 */
const H = (kind, expect, q, also) => ({ kind, expect, q, also: also || [] });

const ITEMS = [
  // --- general, no "Elite Packs" required, one topic each ---
  H('general', 'overview', 'Could you sketch what these three-card reward packs are for?'),
  H('general', 'overview', 'Give me the big picture of how a trader opens packs of reward cards.'),
  H('general', 'dashboard-tabs', 'Which screen has the Packs, Inventory, Collection and Credits tabs?'),
  H('general', 'dashboard-tabs', 'How does someone reach the page that lists those five pack tabs?'),
  H('general', 'cards-per-pack', 'Does every pack contain three separate card draws?'),
  H('general', 'cards-per-pack', 'Are packs always a three-card pull?'),
  H('general', 'which-pack-best', 'Which tier is the sensible one to buy first?'),
  H('general', 'which-pack-best', 'If a trader is picking a pack, which one is worth opening?'),
  H('general', 'pack-costs-floors', 'What credit amount does the Oracle tier sell for?'),
  H('general', 'pack-costs-floors', 'How many credits does Ignition cost?'),
  H('general', 'drop-rates', 'How likely is an Epic compared with the other rarities?'),
  H('general', 'drop-rates', 'Where are the per-card odds published?'),
  H('general', 'card-count', 'How many distinct cards exist in the whole catalogue?'),
  H('general', 'card-count', 'What is the total number of different cards to collect?'),
  H('general', 'rarity-floor', 'What minimum rarity does a Whale pack guarantee?'),
  H('general', 'rarity-floor', 'Why can a common card not come out of the higher tiers?'),
  H('general', 'credits-vs-payout-credits', 'How do Pack Credits differ from Payout Credits?'),
  H('general', 'credits-vs-payout-credits', 'Do the two credit balances expire the same way?'),
  H('general', 'buy-credits', 'Where can Pack Credits be topped up?'),
  H('general', 'buy-credits', 'How does someone purchase additional Pack Credits?'),
  H('general', 'convert-payout-credits', 'Can Payout Credits be turned into Pack Credits?'),
  H('general', 'convert-payout-credits', 'Is there a conversion from the payout balance into packs?'),
  H('general', 'withdraw-credits', 'Are Pack Credits cashable?'),
  H('general', 'withdraw-credits', 'Can a trader withdraw Pack Credits to a bank?'),
  H('general', 'monthly-subscription', 'How does the monthly Pack Credits plan renew?'),
  H('general', 'monthly-subscription', 'When does the subscription drop new credits into the balance?'),
  H('general', 'cancel-subscription', 'If the monthly plan is cancelled, does the paid window remain?'),
  H('general', 'cancel-subscription', 'How is the monthly credits subscription cancelled?'),
  H('general', 'crypto-discount', 'Is the Pack Credits bundle cheaper when paid in crypto?'),
  H('general', 'crypto-discount', 'Does a crypto checkout take five percent off the credit price?'),
  H('general', 'opening-and-charges', 'At what step are credits deducted during a pack open?'),
  H('general', 'opening-and-charges', 'What happens between cutting the seal and the card reveal?'),
  H('general', 'chain-upgrade-discounts', 'What discount shows up on the next pack after a credit purchase?'),
  H('general', 'chain-upgrade-discounts', 'How do the successive upgrade offers work after an open?'),
  H('general', 'inventory-use-card', 'How is a saved card applied to a challenge at checkout?'),
  H('general', 'inventory-use-card', 'Where do unused cards wait until someone redeems them?'),
  H('general', 'card-auto-apply', 'Do reward cards rewrite rules on their own, or must someone apply them?'),
  H('general', 'card-auto-apply', 'Will an account change just because a card is sitting unused?'),
  H('general', 'uses-multiplier', 'How many times can a card printed x3 be used?'),
  H('general', 'uses-multiplier', 'What does a times-three mark on a card mean?'),
  H('general', 'discount-stacking', 'Can a discount card be combined with a website offer?'),
  H('general', 'discount-stacking', "Does Founder's Key stack on top of another checkout discount?"),
  H('general', 'eligibility-labels', 'What does the eligible label on a card restrict?'),
  H('general', 'eligibility-labels', 'Which account sizes can use a Skip a Step card?'),
  H('general', 'exotic-cards', 'What cards are in the Exotic group?'),
  H('general', 'exotic-cards', 'Who is allowed to receive Instant Override?'),
  H('general', 'the-million', 'Is the Primordial card inside the normal odds table?'),
  H('general', 'the-million', 'What is The Million card?'),
  H('general', 'lucky-streak', 'What does the lucky streak meter fill toward?'),
  H('general', 'lucky-streak', 'Does an Epic pull reset the lucky streak?'),
  H('general', 'pack-pass', 'How does the Pack Pass meter earn a free Ignition pack?'),
  H('general', 'pack-pass', 'Do free packs advance Pack Pass?'),
  H('general', 'special-packs', 'Do Special Packs disappear when the timer ends?'),
  H('general', 'special-packs', 'How long is a Special Pack available?'),
  H('general', 'my-packs-keys', 'Where is a giveaway key entered?'),
  H('general', 'my-packs-keys', 'What is the My Packs tab for?'),
  H('general', 'collection', 'What does the Collection tab keep track of?'),
  H('general', 'collection', 'Can odds be viewed from the Collection tab?'),
  H('general', 'free-packs-general', 'Does a new account include a free pack?'),
  H('general', 'free-packs-general', 'Which account sizes receive a complimentary pack?'),
  H('general', 'refunds-legal', 'Are opened packs still refundable?'),
  H('general', 'refunds-legal', 'What is the legal position on pack refunds?'),
  H('general', 'missing-reward', 'A pack never arrived. What should someone do?'),
  H('general', 'missing-reward', 'Who should be contacted if a reward does not show up?'),
  H('general', 'followup.whale-pack', 'Give me the rundown on the Whale pack.'),
  H('general', 'followup.whale-pack', 'What should a reader know about the Whale tier?'),
  H('general', 'followup.oracle-pack', 'What is the Oracle pack, in short?'),
  H('general', 'followup.oracle-pack', 'Describe the Oracle tier.'),
  H('general', 'followup.payout-boost-100', 'What does the 100% payout card change?'),
  H('general', 'followup.payout-boost-100', 'What is Payout Boost 100?'),
  H('general', 'followup.purple-card-ambiguous', 'What is the purple card?'),
  H('general', 'followup.purple-card-ambiguous', 'What does a pink card do?'),
  H('general', 'atom-bundle-distinct', 'Is the Elite Atom bundle the same promo as the pack launch offers?'),
  H('general', 'atom-bundle-distinct', 'Do Atom bundle perks stack with pack launch promotions?'),
  H('general', 'simulated', 'Are the accounts these cards apply to simulated?'),
  H('general', 'simulated', 'Is a pack account real money?'),

  // Neighbor traps: the question names a pack but asks for cost, odds, or floor.
  H('neighbor', 'drop-rates', 'What are the odds on the Whale pack?'),
  H('neighbor', 'pack-costs-floors', 'How much does the Whale pack cost?'),
  H('neighbor', 'rarity-floor', 'What rarity floor does the Oracle pack use?'),
  H('neighbor', 'card-auto-apply', 'Do cards apply automatically to an account?'),
  H('neighbor', 'withdraw-credits', 'Can pack credits be withdrawn?'),
  H('neighbor', 'pack-pass', 'How does Pack Pass award a free pack?'),
  H('neighbor', 'credits-vs-payout-credits', 'What separates the two credit balances?'),

  // First-person wording that still asks for the rule, not an account value.
  H('policy-first-person', 'refunds-legal', 'Suppose I apply a half-price reward on the challenge I am running. Is a refund still possible?'),
  H('policy-first-person', 'withdraw-credits', 'Are Pack Credits something I am allowed to cash out?'),
  H('policy-first-person', 'refunds-legal', 'If I have already opened the pack, do I still have a refund?'),
  H('policy-first-person', 'cancel-subscription', 'When I cancel the monthly plan, do I keep the period I paid for?'),
  H('policy-first-person', 'discount-stacking', 'Can I combine two discount cards if I check out a single time?'),
  H('policy-first-person', 'inventory-use-card', 'How do I apply one of my saved cards when I reach checkout?'),
  H('policy-first-person', 'crypto-discount', 'If I pay the bundle in crypto, is it cheaper for me?'),
  H('policy-first-person', 'opening-and-charges', 'Does opening faster change which cards I can pull?'),
  H('policy-first-person', 'cancel-subscription', 'What happens if I cancel my monthly credits plan?'),
  H('policy-first-person', 'withdraw-credits', 'Can I withdraw the pack credits I purchase?'),
  H('policy-first-person', 'convert-payout-credits', 'Are my payout credits convertible into pack credits?'),
  H('policy-first-person', 'exotic-cards', 'How do I get Instant Override if I want that card?'),
  H('policy-first-person', 'chain-upgrade-discounts', 'If I buy a second pack right after the first, what discount do I get?'),
  H('policy-first-person', 'free-packs-general', 'Do I get a free pack when I open a new account?'),
  H('policy-first-person', 'monthly-subscription', 'How am I billed for the monthly credits plan?'),

  // Positive requests for this customer's value. Must not select a product row.
  H('state', 'block', 'Do I have the Whale pack on the account right now?'),
  H('state', 'block', 'Was my Breakout pack added back?'),
  H('state', 'block', 'How many pack credits are on my balance?'),
  H('state', 'block', "Is Founder's Key in my collection?"),
  H('state', 'block', "Did this month's subscription charge post to me?"),
  H('state', 'block', 'Show the cards I currently hold.'),
  H('state', 'block', "Verify if the 60% Founder's Key is in the collection for me."),
  H('state', 'block', 'Has my Pack Pass meter filled up?'),
  H('state', 'block', 'Where is my Instant Override?'),
  H('state', 'block', 'Did I receive the free pack on this account?'),

  // General question plus a real request for account state: do not answer the general part.
  H('mixed-needed', 'block', 'How do the odds work, and what is my credit balance?'),
  H('mixed-needed', 'block', 'Explain the Oracle pack and tell me if I own it.'),
  H('mixed-needed', 'block', 'Describe Exotic cards. Also, is Instant Override sitting in my inventory?'),
  H('mixed-needed', 'block', 'What is Pack Pass, and is my meter full?'),

  // Context that does not ask for an account value. Answer the rule.
  H('context-aside', 'drop-rates', 'I was reading the help page. How do drop rates work?'),
  H('context-aside', 'opening-and-charges', 'If I were to open a pack, when would credits be taken?'),
  H('context-aside', 'overview', 'Just curious, nothing on my account. What are these reward packs?'),

  // Boundary / handoff. Must not become overview or another product row.
  H('boundary', 'block', 'What is this card?'),
  H('boundary', 'block', 'Instant Override'),
  H('boundary', 'block', 'Explain Exotic cards and also explain the drop rates.'),
  H('boundary', 'block', 'What does that one do?'),

  H('off-topic', 'abstain', 'What time does the stock market open?'),
  H('off-topic', 'abstain', 'How do I reset my email password?'),
];

module.exports = { ITEMS, frozenAt: 'cycle-2-before-code-change' };
