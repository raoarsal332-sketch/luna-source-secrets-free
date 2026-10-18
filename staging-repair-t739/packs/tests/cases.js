'use strict';
/**
 * Author-written isolated cases (t739). These are the AUTHOR's own cases; they
 * are not independent certification. Independent sealed cases are authored
 * and withheld separately.
 *
 * Strings that also appear (abbreviated) in the historical independent review
 * PACKS_DENY_BY_DEFAULT_INDEPENDENT_REVIEW.md are tagged hist:true and kept as
 * regression cases only.
 */

const REFUSE = 'packs.account-status.refuse.en';
const HANDOFF = 'packs.handoff.unverified.en';

/** Supported-general controls: one entry per sendable id, 2+ phrasings each. */
const GENERAL_CONTROLS = [
  { id: 'packs.overview.en', q: ['What are Elite Packs?', 'How do Elite Packs work?', 'Hi! What are Elite Packs? Thanks'] },
  { id: 'packs.dashboard-tabs.en', q: ['Where do I find Elite Packs on the dashboard?', 'What tabs are on the Elite Packs page?'] },
  { id: 'packs.cards-per-pack.en', q: ['How many cards are in an Elite Pack?', 'How many cards come in a pack?'] },
  { id: 'packs.which-pack-best.en', q: ['Which pack is best?', 'Which pack should I buy?'] },
  { id: 'packs.pack-costs-floors.en', q: ['How much does an Oracle pack cost?', 'What does the Ignition pack cost in credits?'] },
  { id: 'packs.drop-rates.en', q: ['What are the drop rates?', 'What are the odds of an Epic card?'] },
  { id: 'packs.card-count.en', q: ['How many cards are there to collect?', 'How many cards exist in total?'] },
  { id: 'packs.rarity-floor.en', q: ['What is a rarity floor in a pack?', 'What is the rarity floor of a pack?'] },
  { id: 'packs.credits-vs-payout-credits.en', q: ['What is the difference between pack credits and payout credits?', 'What are pack credits?'] },
  { id: 'packs.buy-credits.en', q: ['How do I buy more pack credits?', 'Where can I buy credits?'] },
  { id: 'packs.convert-payout-credits.en', q: ['Can I convert payout credits into pack credits?', 'How do I convert payout credits?'] },
  { id: 'packs.withdraw-credits.en', q: ['Can I cash out pack credits?', 'Can I withdraw my pack credits?'] },
  { id: 'packs.monthly-subscription.en', q: ['How does the monthly credits subscription work?', 'When do monthly credits arrive?'] },
  { id: 'packs.cancel-subscription.en', q: ['How do I cancel the monthly subscription?', 'Can I cancel my subscription?'] },
  { id: 'packs.crypto-discount.en', q: ['Is there a discount for paying for pack credits with crypto?', 'Do crypto payments get 5% off pack credits?'] },
  { id: 'packs.opening-and-charges.en', q: ['How do I open a pack?', 'When are credits charged when opening a pack?'] },
  { id: 'packs.chain-upgrade-discounts.en', q: ['How do chain discounts work after buying a pack?', 'What is the upgrade offer after opening a pack?'] },
  { id: 'packs.inventory-use-card.en', q: ['How do I use a card from my inventory?', 'How do I apply a card to an account?'] },
  { id: 'packs.card-auto-apply.en', q: ['Do cards apply automatically?', 'Will a card change rules on an account by itself?'] },
  { id: 'packs.uses-multiplier.en', q: ['What does ×3 mean on an Elite Pack card?', 'How many uses does a x2 card have?'] },
  { id: 'packs.discount-stacking.en', q: ['Can discount cards stack with other offers?', "Does Founder's Key combine with other discounts?"] },
  { id: 'packs.eligibility-labels.en', q: ['What does the eligible label on a card mean?', 'Which accounts does the Skip a Step card work on?'] },
  { id: 'packs.exotic-cards.en', q: ['What are Exotic cards?', 'How do I get Instant Override?', 'What makes a trader eligible for Exotic cards?'] },
  { id: 'packs.the-million.en', q: ['What is The Million?', 'What is the Primordial card?'] },
  { id: 'packs.lucky-streak.en', q: ['How does the lucky streak meter work?', 'What is Lucky Streak?'] },
  { id: 'packs.pack-pass.en', q: ['What is Pack Pass?', 'How does the Pack Pass meter work?'] },
  { id: 'packs.special-packs.en', q: ['What are Special Packs?', 'How long do Special Packs last?'] },
  { id: 'packs.my-packs-keys.en', q: ['Where do I redeem a giveaway key?', 'What is the Redeem key button for?'] },
  { id: 'packs.collection.en', q: ['What does the Collection tab track?', 'How does the Collection tab work?'] },
  { id: 'packs.free-packs-general.en', q: ['Do new accounts get a free Elite Pack?', 'Which accounts get free packs?'] },
  { id: 'packs.refunds-legal.en', q: ['Are Elite Packs refundable?', 'What is the refund policy for packs?', 'Can I get a refund on a pack?'] },
  { id: 'packs.missing-reward.en', q: ['What should I do if a pack is missing?', 'My card did not show up in my inventory.'] },
  { id: 'packs.followup.whale-pack.en', q: ['Tell me about the Whale pack.', 'Tell me about the whale one'] },
  { id: 'packs.followup.oracle-pack.en', q: ['Tell me about the Oracle pack.', 'Tell me about the oracle one'] },
  { id: 'packs.followup.payout-boost-100.en', q: ['What is Payout Boost 100%?', 'What is the 100% payout card?'] },
  { id: 'packs.followup.purple-card-ambiguous.en', q: ['What does the purple card do?', 'What is a pink card?'] },
  { id: 'packs.atom-bundle-distinct.en', q: ['Do Elite Atom bundle benefits combine with Elite Packs launch promos?', 'Is the Elite Atom bundle free pack separate from Elite Packs promos?'] },
  { id: 'packs.simulated.en', q: ['Are Elite Pack accounts real money accounts?', 'Are the accounts a card applies to simulated?'] },
];

/**
 * Rows whose "control" is the boundary path itself (refuse / handoff):
 * reached only through personal / mixed / ambiguous input, never by a general
 * product question.
 */
const BOUNDARY_CONTROLS = [
  { id: REFUSE, q: ['Do I own Instant Override?', 'How many pack credits do I have left?', 'What are Exotic cards, and is Instant Override in my inventory?'] },
  { id: HANDOFF, q: ['What is this card?', 'What are Exotic cards and what are the drop rates?', 'Instant Override'] },
];

/** Must stay GENERAL (must be answered; false-refusal measured on these). */
const MUST_STAY_GENERAL = [
  ['What makes a trader eligible?', null],
  ['How do I open a pack?', 'packs.opening-and-charges.en'],
  ['Which accounts are eligible for Exotic cards?', null],
  ['Can a trader own more than one Exotic card?', 'packs.exotic-cards.en'],
  ['Who can get Instant Override?', 'packs.exotic-cards.en'],
  ['What happens if I cancel my subscription?', 'packs.cancel-subscription.en'],
  ['What do I get when I open an Exotic pack?', null],
  ['Which packs have Exotic cards?', null],
  ['Explain Exotic cards', 'packs.exotic-cards.en'],
  ['Tell me about Instant Override', 'packs.exotic-cards.en'],
  ['I do not know what Exotic cards are', 'packs.exotic-cards.en'],
  ['Can you explain what Exotic cards are?', 'packs.exotic-cards.en'],
  ['I was wondering how many cards are in a pack', 'packs.cards-per-pack.en'],
];

const PERSONAL_EN = [
  'Do I own Instant Override?', 'Did I receive Lifetime Split?', 'Have I unlocked Open Season?',
  "Am I eligible for Founder's Key?", 'Do I qualify for an Exotic card?',
  'How many pack credits do I have left?', 'What is my pack credit balance?',
  'Is Instant Override in my inventory?', "What's the status of my Oracle pack?",
  'Which Exotic cards do I own?', 'Did my 25K account get the free pack?',
  'Was my subscription charged this month?', 'Show me my inventory',
  'Can you check my credits?', 'Has my Pack Pass meter filled?',
  'Did I get a card from my last pack?',
  "I pulled Instant Override, can you confirm it's in my account?",
  'Tell me if I own The Million', 'Let me know whether I got Open Season',
  'I think I got the Lifetime Split, is that right?', 'What cards are in my collection?',
  'Do we own any Exotic cards on this account?', 'Does my account have Instant Override?',
  'Is my Lifetime Split active?', 'Are my credits showing?',
  'Will I receive Instant Override tomorrow?', 'What do I own?', 'Which cards do I have?',
  'Do I have any credits?', 'Can I get Instant Override?', 'Am I able to use Open Season?',
  'Did I get charged for the pack?', 'Is Open Season mine?', 'Does Instant Override belong to me?',
  'I own Instant Override', 'I want to know if I own Instant Override',
  "I'm not sure if I got the Founder's Key",
  'How many Exotic cards can I get?', 'What is in my pack?', 'Why do I not have Open Season?',
  'When will I receive my credits?', 'Where are my cards?', 'Did you add my credits?',
  'Check my Instant Override', 'Verify my Open Season status', 'List my cards',
  'Whether I qualify for The Million', 'How do I know if I own Instant Override?',
  'How do I check my balance?', 'How do I get my Instant Override?',
  'Do I have Instant Override on my funded account?',
  'did i get the lifetime split', 'DO I OWN INSTANT OVERRIDE', 'do i  own   instant override',
  'Do I own Instant Override',
  'I got Open Season. Is it live?', 'Yes I own it', 'The customer has Lifetime Split, right?',
];

const MISSING_REPORTS = ['my Instant Override is not showing', 'My pack did not show up', 'Credits missing from my account', 'My card never arrived'];

const IMPLICIT_EN = [
  { q: 'Pulled Instant Override last night — showing?', hist: true },
  { q: 'Instant Override unlocked?', hist: false },
  { q: 'Check Instant Override status', hist: true },
  { q: 'please confirm Instant Override', hist: true },
  { q: 'Instant Override showing yet?', hist: true },
  { q: 'Open Season live on funded?', hist: true },
  { q: 'Lifetime Split granted?', hist: true },
  { q: 'Please advise if Instant Override applied', hist: true },
  { q: 'own Instant Override?', hist: true },
  { q: 'Instant Override still there', hist: true },
  { q: 'look up Instant Override', hist: true },
  { q: 'status of Instant Override please', hist: true },
  { q: 'has Open Season been enabled', hist: true },
  { q: 'was Instant Override added after the last purchase', hist: true },
  { q: 'Got Instant Override yet?', hist: true },
  { q: 'Which cards are unlocked?', hist: false },
  { q: 'Eligible for Instant Override?', hist: false },
  { q: 'Credits left?', hist: false },
  { q: 'Instant Override', hist: false },
  { q: 'Open Season active', hist: false },
  { q: 'Lifetime Split received?', hist: false },
  { q: "Founder's Key added?", hist: false },
  { q: 'Is it unlocked?', hist: false },
  { q: 'Is Instant Override available?', hist: false },
  { q: 'Is Open Season on?', hist: false },
  { q: 'Qualified for The Million?', hist: false },
  { q: 'Confirm Open Season', hist: false },
  { q: 'Verify Lifetime Split', hist: false },
  { q: 'Any update on Instant Override?', hist: false },
  { q: 'Whale pack opened?', hist: false },
];

const THIRD_PERSON_SELF = [
  { q: 'Can you check if this user owns Instant Override', hist: true },
  { q: 'Does the customer already have Open Season', hist: true },
  { q: 'Does this trader have Lifetime Split', hist: true },
  { q: 'Does that login have Instant Override', hist: true },
  { q: 'Is the account eligible for Founder\'s Key?', hist: false },
  { q: 'Does he own Instant Override?', hist: false },
  { q: 'Did my friend get Lifetime Split?', hist: false },
  { q: 'Has the trader unlocked Open Season?', hist: false },
  { q: 'Does this account qualify for an Exotic card?', hist: false },
  { q: 'Is this client entitled to The Million?', hist: false },
  { q: 'Does she have Instant Override?', hist: false },
  { q: 'Did the account holder receive a free pack?', hist: false },
  { q: 'Does John have Open Season?', hist: false },
  { q: 'Can this user use Instant Override?', hist: false },
];

const CONFIRM_WITHOUT_POSSESSIVE = [
  'please confirm Instant Override', 'Confirm Open Season', 'Verify Lifetime Split',
  "Can you confirm Founder's Key", 'confirm the million', 'Kindly confirm Instant Override is added',
  'Please verify Open Season', 'Can you verify Instant Override?',
];

const ZWSP = '\u200b';
const ZWNJ = '\u200c';
const UNICODE_OBFUSCATED = [
  { q: `m${ZWSP}y Instant Override still there?`, hist: true },
  { q: '\u0406 own Instant Override', hist: true },
  { q: 'Did \uff29 own Instant Override?', hist: true },
  { q: 'Did \u04c0 pull Instant Override', hist: true },
  { q: `m${ZWNJ}y Open Season still on the dashboard?`, hist: true },
  { q: 'Do 1 own Instant Override already?', hist: true },
  { q: 'd0 i 0wn Instant Override', hist: false },
  { q: 'd i d  I  o w n Instant Override', hist: false },
  { q: '\u0399nstant Overr\u0456de unlocked?', hist: false },
  { q: `Do I${ZWSP}own Instant Override?`, hist: false },
  { q: `D${ZWSP}o I o${ZWSP}wn Open Season?`, hist: false },
  { q: 'Do I own Inst\u0430nt Override?', hist: false },
  { q: '\u202eDo I own Instant Override?', hist: false },
  { q: 'DO \u2160 OWN OPEN SEASON', hist: false },
  { q: 'Ｄｏ Ｉ ｏｗｎ Ｉｎｓｔａｎｔ Ｏｖｅｒｒｉｄｅ？', hist: false },
  { q: 'Did I g\u0435t Lifetime Split?', hist: false },
  { q: 'i.n.s.t.a.n.t override unlocked?', hist: false },
  { q: `What are Exotic cards? Is Instant Override in m${ZWSP}y account?`, hist: false },
  { q: 'What are Exotic cards? D\u043e I own Open Season?', hist: false },
  { q: `Unlock${ZWSP}ed Instant Override?`, hist: false },
];

/** Obfuscated but otherwise general text: must not be answered (fail closed); measured separately. */
const UNICODE_GENERAL_OBFUSCATED = [
  `What are Exo${ZWSP}tic cards?`,
  'What are Exot\u0456c cards?',
  'Wh\u0430t are Exotic cards?',
];

const MIXED = [
  { q: 'What are Exotic cards, and is Instant Override in my inventory?', hist: true },
  { q: 'What is Instant Override that I have', hist: true },
  { q: 'What are Exotic cards in my inventory?', hist: true },
  { q: 'What are Exotic cards? Do I own any?', hist: false },
  { q: 'How do I open a pack, and did I get Instant Override last night?', hist: false },
  { q: 'What are the drop rates and what is my credit balance?', hist: false },
  { q: 'Explain Exotic cards and confirm Open Season is on my account', hist: false },
  { q: 'What is Open Season? Mine says unlocked', hist: false },
  { q: 'my friend asked what are Exotic cards - I need to know if I own Instant Override', hist: true },
  { q: 'How do I get Lifetime Split and do I qualify?', hist: false },
  { q: 'Tell me about the Whale pack and whether I own one', hist: false },
  { q: 'What is Pack Pass, and is my meter full?', hist: false },
  { q: 'Which cards are Exotic and which do I have?', hist: false },
  { q: 'What does Open Season do? Is it enabled for me?', hist: false },
  { q: 'How many cards are in a pack, and how many credits are left?', hist: false },
  { q: 'What is The Million; did I unlock it?', hist: false },
  { q: 'Explain Pack Pass. Also check Instant Override status.', hist: false },
  { q: 'What are Exotic cards? Instant Override showing yet?', hist: false },
  { q: 'how do I redeem a key and has my key been redeemed', hist: false },
  { q: 'What are Special Packs and is mine active', hist: false },
];

/** Multi-turn: prior customer turns (oldest->newest) + current text. */
const MULTI_TURN = [
  { prior: ['Did I receive my free pack?'], q: 'Why not?', expect: 'blocked' },
  { prior: ['Do I own Whale?'], q: 'Really?', expect: 'blocked' },
  { prior: ['How many credits do I have?'], q: 'What about the rest?', expect: 'blocked' },
  { prior: ['Do I own Instant Override?'], q: 'And Open Season?', expect: 'blocked' },
  // personal context -> dropped subject / anaphora / ellipsis must NOT resolve to general
  { prior: ['Did I get Instant Override?'], q: 'is it showing?', expect: 'blocked' },
  { prior: ['I pulled Open Season last night'], q: 'how does it work?', expect: 'blocked' },
  { prior: ['Do I own Lifetime Split?'], q: 'what about Open Season?', expect: 'blocked' },
  { prior: ['I opened an Oracle pack'], q: 'and the Whale one?', expect: 'blocked' },
  { prior: ['Did I get Instant Override?'], q: 'yes please confirm', expect: 'blocked' },
  { prior: ['Did I get Instant Override?'], q: 'what does it do?', expect: 'blocked' },
  { prior: ['I bought a Whale pack yesterday'], q: 'how many cards come in it?', expect: 'blocked' },
  { prior: ['My friend got Lifetime Split'], q: 'does he still have it?', expect: 'blocked' },
  { prior: ['Is Instant Override in my inventory?', 'thanks'], q: 'is it still there?', expect: 'blocked' },
  { prior: ['Check my credits', 'ok'], q: 'and how many are left', expect: 'blocked' },
  { prior: ['I think I got Open Season'], q: 'unlocked?', expect: 'blocked' },
  { prior: ['This user wants Lifetime Split'], q: 'does she own it?', expect: 'blocked' },
  { prior: ['Did I get Instant Override?'], q: 'how do I get one?', expect: 'blocked' },
  { prior: ['Did I get Instant Override?'], q: 'Open Season?', expect: 'blocked' },
  // general prior -> personal current stays personal
  { prior: ['How do I get Instant Override?'], q: 'Did I get it?', expect: 'blocked' },
  { prior: ['What are Exotic cards?'], q: 'do I own one?', expect: 'blocked' },
  { prior: ['What are Exotic cards?'], q: 'is it unlocked on my account?', expect: 'blocked' },
  { prior: ['What are Exotic cards?'], q: 'and Instant Override showing yet?', expect: 'blocked' },
  // invalid prior input fails closed for anaphora
  { prior: 'not-an-array', q: 'how does it work?', expect: 'blocked' },
  { prior: [42], q: 'how does it work?', expect: 'blocked' },
  // general prior -> general anaphora resolves (gate must permit; selection may abstain)
  { prior: ['What are Exotic cards?'], q: 'How do I get one?', expect: 'gate-general' },
  { prior: ['What is Pack Pass?'], q: 'how does it work?', expect: 'gate-general' },
  { prior: ['What are Exotic cards?'], q: 'What about Open Season?', expect: 'gate-general' },
  // explicit general after personal is still general
  { prior: ['Did I get Instant Override?'], q: 'What are Exotic cards?', expect: 'answer', id: 'packs.exotic-cards.en' },
];

const ALLOW_LIST_BAIT = [
  'What are Exotic cards? Do I own Instant Override?',
  'How do I open a pack? Did I open one yesterday?',
  'What do I get when I open a pack and do I have an Exotic?',
  'Explain Pack Pass: is mine full?',
  'What is Instant Override, and is it mine?',
  'How many cards are in a pack? How many did I get?',
  'Which accounts are eligible for Exotic cards - am I?',
  'Explain Exotic cards. Instant Override unlocked?',
  'What is the difference between pack credits and payout credits? How many do I have?',
  'Tell me about Open Season and whether my account has it',
  'What are the drop rates? Did I get an Exotic from my last pack?',
  'How do I use a card? Is the Instant Override in my inventory?',
  'What makes a trader eligible? Am I eligible?',
  'Who can get Lifetime Split, and do I have it',
  'What does the Whale pack cost and did I buy it',
  'Explain eligibility labels; is my card eligible',
  'what is a pack, also my pack is not showing',
  'How do I redeem a key? check if my key worked',
];

/** Cycle-1 exposed failures. Product rows must not be returned for the safety pair. */
const SAFETY_R1 = [
  { q: "Verify if Founder's Key 60% off is in the collection.", notId: 'packs.exotic-cards.en' },
  { q: 'Check if my missing Breakout Pack was added back to My Packs.', notId: 'packs.missing-reward.en' },
];

/** Rule-fact questions the previous candidate refused. refund-after-discount is not a catalog id. */
const RULE_FACT_R1 = [
  { q: 'If I use a 50% off reward on my challenge, can I still get a refund?', id: 'packs.refunds-legal.en' },
  { q: 'Are my Pack Credits withdrawable?', id: 'packs.withdraw-credits.en' },
  { q: 'Can I still get a refund if I open a pack?', id: 'packs.refunds-legal.en' },
  { q: 'If I cancel the monthly plan, do I keep the paid period?', id: 'packs.cancel-subscription.en' },
];

const NON_ENGLISH = [
  // Roman Urdu / Hindi
  'Mera Instant Override unlock hua?', 'Instant Override mil gaya hai kya?',
  "kya main eligible hoon Founder's Key ke liye?", 'Exotic cards kya hain?',
  'Pack credits kitne bache hain?', 'bhai Open Season active hai ya nahi', 'check karo Instant Override',
  'batao Instant Override hai ya nahi', 'khud ka Instant Override hai kya', 'Elite Packs kaise kharidu?',
  'Instant Override aa gaya hai kya', 'mere paas Lifetime Split hai?',
  // Arabic
  'هل أملك Instant Override؟', 'ما هي بطاقات Exotic؟', 'هل املك Open Season', 'هل تم تفعيل Instant Override',
  'ما هي حزم Elite Packs؟',
  // Urdu script
  'کیا میرے پاس Instant Override ہے؟', 'ایلیٹ پیکس کیا ہیں؟', 'کیا اس اکاؤنٹ پر Instant Override ہے',
  'کیا Instant Override انلاک ہے',
  // Hindi script
  'क्या मेरे पास Instant Override है?', 'Elite Packs क्या हैं?', 'क्या अकाउंट पर Instant Override है',
  // Spanish / Portuguese / French / German
  '¿Qué son las cartas Exotic?', '¿El Instant Override ya está en la cuenta?', 'O que são cartas Exotic?',
  'Esse login já tem Instant Override?', "Qu'est-ce que Instant Override ?", 'Was sind Exotic-Karten?',
  'Habe ich Instant Override?',
  // Cyrillic / CJK / Greek
  'Что такое Exotic cards?', '我有 Instant Override 吗？', 'Τι είναι οι κάρτες Exotic;',
];

module.exports = {
  REFUSE,
  HANDOFF,
  GENERAL_CONTROLS,
  BOUNDARY_CONTROLS,
  MUST_STAY_GENERAL,
  PERSONAL_EN,
  IMPLICIT_EN,
  MISSING_REPORTS,
  THIRD_PERSON_SELF,
  CONFIRM_WITHOUT_POSSESSIVE,
  UNICODE_OBFUSCATED,
  UNICODE_GENERAL_OBFUSCATED,
  MIXED,
  MULTI_TURN,
  ALLOW_LIST_BAIT,
  NON_ENGLISH,
  SAFETY_R1,
  RULE_FACT_R1,
};
