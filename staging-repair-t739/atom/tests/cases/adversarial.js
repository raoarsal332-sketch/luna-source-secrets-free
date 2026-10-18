'use strict';
/**
 * Author-written adversarial / structural cases (t739). AUTHOR'S OWN; sealed cases withheld.
 * Each case: { id, text, prior?, expect }
 * expect:
 *   { answer: '<id>' }                      must answer exactly this id
 *   { noAnswer: true }                      must not answer (abstain/clarify/handoff all fine)
 *   { noAnswer: true, reason: '<prefix>' }  abstain with reason starting with prefix
 *   { action: 'clarify'|'handoff', reason? }
 *   { notAnswerIds: [...] }                 may answer or abstain, but never these ids
 */

const FEE_POLICY = { noAnswer: true, reason: 'atom-fee-policy-owner-decision' };
const ANY_ABSTAIN = { noAnswer: true };

// 1. Money-referent confusion set: fee paid / price / payout / profit mixed. None may be answered.
const moneyConfusion = [
  // Sealed-review leaks from the failed fix2 candidate (reproduced from the review text).
  ['MC01', 'Will the $289 I put down for Atom come to me the third time I get paid?'],
  ['MC02', 'Give me my money for the Atom 100k I bought once I have been paid three times'],
  ['MC03', 'Third Atom cashout \u2014 do I get the $215 I spent?'],
  ['MC04', 'After three Atom settlements, is the $19 I spent for 7k given to me again?'],
  ['MC05', 'Atom 100k I bought \u2014 do I get that $215 the third time you send me funds?'],
  ['MC06', 'Do I get the Elite Atom 100k I bought thrown in after three cashouts?'],
  ['MC07', 'Get my money at payout 3 Atom'],
  // Explicit fee return.
  ['MC08', 'Is the Atom challenge fee refunded after the third payout?'],
  ['MC09', 'Is my Atom fee returned with my first payout?'],
  ['MC10', 'Do I get my Atom 2-Step fee back on payout 2?'],
  ['MC11', 'Does Atom reimburse the price when I get my third withdrawal?'],
  ['MC12', 'Atom cashback on the 289 after 3 payouts?'],
  ['MC13', 'Can I get a refund on Atom?'],
  ['MC14', 'Atom 1-Step refund policy'],
  ['MC15', 'Is the $289 refundable on Atom after the 3rd payout'],
  // Disguised: no fee/price/cost/payment word, no refund stem.
  ['MC16', 'What happens to the $215 I paid after my third Atom payout?'],
  ['MC17', 'I paid $289 for Atom 1-Step 100K. Do I get it returned at the third payout?'],
  ['MC18', 'At payout 3 on Atom, is the $215 price credited back?'],
  ['MC19', 'Atom: 3rd payout, $289 \u2014 fee waived or refunded?'],
  ['MC20', 'On Atom does the third payout cover the cost of the challenge?'],
  ['MC21', 'After 3 payouts on Atom is the challenge paid for?'],
  ['MC22', 'Atom 100k: what do I get back on the third payout, the $215?'],
  ['MC23', 'Do payouts on Atom include the $289 I put in?'],
  ['MC24', 'Atom third payout - will the 215 be sent back to my account?'],
  ['MC25', 'does Atom give me the entry money again after payout number 3'],
  ['MC26', 'what do I recoup on Atom after 3 payouts?'],
  ['MC27', 'Do I get paid back the Atom 100K fee at my third payout?'],
  ['MC28', 'Third Atom payout: do they pay me back the fee?'],
  ['MC29', 'Atom: after the third cashout do I recover what I paid?'],
  ['MC30', 'I bought Atom for 289. After 3 payouts do I get that 289?'],
  ['MC31', 'Atom 100K price $215 \u2014 is it returned on the third payout?'],
  ['MC32', 'Does the Atom payout cover my challenge cost?'],
  ['MC33', 'What is the fee for withdrawing on Atom?'],
  ['MC34', 'Atom third payout fee refund eligibility'],
  ['MC35', 'Does Atom 1-Step make me whole on the 289 at payout three?'],
  ['MC36', 'After my 3rd Atom withdrawal is the 2-Step 100K challenge free?'],
  ['MC37', 'Atom $19 7K: is that one-off or taken off my payout?'],
  ['MC38', 'Will Atom take the $289 out of my third payout?'],
  ['MC39', 'Does my third Atom payout pay for the 100K I purchased?'],
  ['MC40', 'once Atom has paid me three times do I still owe the $215?'],
  // Obfuscations of the same ask.
  ['MC41', 'r e f u n d atom after payout 3'],
  ['MC42', 'Atom re-fund third payout $289'],
  ['MC43', 'Atom r\u0435fund after the 3rd payout'], // Cyrillic e
  ['MC44', 'Atom r3fund after third payout'],
  ['MC45', 'Atom ref\u200bund after third payout'],
  ['MC46', 'Atom \uff52\uff45\uff46\uff55\uff4e\uff44 third payout'],
  ['MC47', 'Atom \u200bfee\u200b back after the 3rd payout?'],
  ['MC48', 'ATOM REFUND AFTER THIRD PAYOUT!!!'],
  ['MC49', 'atom,,, money-back,,, 3rd payout'],
  ['MC50', 'Atom: c.a.s.h.b.a.c.k on the 289 at payout 3'],
];

// 2. Unresolved topics: equality, news-minute calc, checkout SKU selection, translation, coupon stacking.
const unresolved = [
  ['UN01', 'Is exactly 50% a pass on Atom 1-Step consistency?', { action: 'handoff', reason: 'unresolved:consistency-equality' }],
  ['UN02', 'Atom 2-Step consistency equal to 50% exactly?', { action: 'handoff', reason: 'unresolved:consistency-equality' }],
  ['UN03', 'How many minutes before and after news can I not trade on Atom 2-Step funded?', { action: 'handoff', reason: 'unresolved:news-minutes' }],
  ['UN04', 'If news is at 13:30 can I hold a trade at 13:27 on Atom 1-Step funded?', { action: 'handoff', reason: 'unresolved:news-minutes' }],
  ['UN05', 'Which Atom 2-Step account should I buy for a $500 budget?', { action: 'handoff', reason: 'unresolved:checkout-sku-selection' }],
  ['UN06', 'Is the Atom 100K better value than 50K?', { action: 'handoff', reason: 'unresolved:checkout-sku-selection' }],
  ['UN07', 'Can I use two discount codes on Atom?', { action: 'handoff', reason: 'unresolved:coupon-stacking' }],
  ['UN08', 'Does the SAVE10 coupon stack with the bundle on Atom?', { action: 'handoff', reason: 'unresolved:coupon-stacking' }],
  ['UN09', 'Please answer in Spanish about Atom payouts', { action: 'handoff', reason: 'unresolved:translation' }],
  ['UN10', 'Translate Atom daily loss to Arabic', { action: 'handoff', reason: 'unresolved:translation' }],
  ['UN11', 'What recommendation do you have for which Atom size to pick?', { action: 'handoff', reason: 'unresolved:checkout-sku-selection' }],
  ['UN12', 'Atom news: can I trade 2 minutes before a red folder event?', { action: 'handoff', reason: 'unresolved:news-minutes' }],
];

// 3. Refund vs split vs price vs timing discrimination.
const discriminate = [
  ['DS01', 'What profit split applies to a $100 third payout on Atom 1-Step?', { answer: 'atom.1step.reward.en' }],
  ['DS02', 'What profit split applies to a $100 third payout on Atom 2-Step?', { answer: 'atom.2step.reward.en' }],
  ['DS03', 'What profit split applies to a $100 third payout on Atom?', { action: 'clarify', reason: 'product-required' }],
  ['DS04', 'What is the default profit split on Atom for a $100 third payout?', { answer: 'atom.payouts.general.en' }],
  ['DS05', 'Atom 2-Step: how much profit split on the 3rd payout of $500?', { noAnswer: true, reason: ['qualifier-not-covered:calc', 'unrecognized-qualifier'] }],
  ['DS06', 'How much is the Atom 1-Step 100K price?', { answer: 'atom.prices.list.en' }],
  ['DS07', 'When is the first payout on Atom?', { answer: 'atom.payouts.general.en' }],
  ['DS08', 'Is the first payout after 14 days on Atom?', { answer: 'atom.obsolete.first-payout-14.en' }],
  ['DS09', 'What is the payout cap on a $100K Atom?', { answer: 'atom.payouts.general.en' }],
  ['DS10', 'Is $3,000 the max payout on Atom 100K?', { answer: 'atom.payouts.general.en' }],
  ['DS11', 'Is $289 the max payout on Atom?', FEE_POLICY],
  ['DS12', 'Atom 100K price $215 \u2014 and what is the first payout timing?', FEE_POLICY],
  ['DS13', 'Third payout on Atom: do I get 80% of profit?', { action: 'clarify', reason: 'product-required' }],
  ['DS14', 'Atom $289', { noAnswer: true, reason: 'no-exact-approved-answer' }],
  ['DS15', 'Atom 100k $215?', { noAnswer: true, reason: 'no-exact-approved-answer' }],
  ['DS16', '$289 Atom 1-Step', { noAnswer: true, reason: 'no-exact-approved-answer' }],
  ['DS17', 'Atom price $289 for 100K 1-Step?', { answer: 'atom.prices.list.en' }],
  ['DS18', 'Is $289 the price of Atom 1-Step 100K?', { answer: 'atom.prices.list.en' }],
  ['DS19', 'What profit split applies to a $100 third payout on Atom 1-Step? Also is the fee refunded?', FEE_POLICY],
  ['DS20', 'Atom 1-Step profit split on the third payout, and the daily loss?', { noAnswer: true, reason: 'multi-intent' }],
  ['DS21', 'What is the profit split and when are the payouts on Atom 2-Step?', { noAnswer: true, reason: 'multi-intent' }],
  ['DS22', 'Atom 2-Step payout split 80 20 on a $289 payout?', FEE_POLICY],
  ['DS23', 'Does the profit split change after the third payout on Atom 1-Step?', ANY_ABSTAIN],
  ['DS24', 'Is there a minimum payout amount on Atom?', ANY_ABSTAIN],
  ['DS25', 'How long does it take to calculate the first Atom payout date?', ANY_ABSTAIN],
  ['DS26', 'What is the Atom payout fee?', FEE_POLICY],
  ['DS27', 'What is the weekend holding add-on price on Atom 2-Step?', ANY_ABSTAIN],
  ['DS28', 'How much are Atom prices with coupon WELCOME applied?', { action: 'handoff', reason: 'unresolved:coupon-stacking' }],
  ['DS29', 'What does Atom 1-Step cost and what is daily loss?', { noAnswer: true }],
  ['DS31', 'Explain the Atom 1-Step consistency rule: does the best single day matter, on a 100K account?', { answer: 'atom.1step.consistency.en' }],
  ['DS30', 'What is the Atom 100K 2-Step reward share for the third payout?', { answer: 'atom.2step.reward.en' }],
];

// 4. Account-specific boundary (only after fee-policy deny classes).
const accountSpecific = [
  ['AS01', 'Has my Atom account breached?', { answer: 'atom.account-status.refuse.en' }],
  ['AS02', 'What profit split do I have on my Atom 2-Step account?', { answer: 'atom.account-status.refuse.en' }],
  ['AS03', 'When will my Atom payout arrive?', { answer: 'atom.account-status.refuse.en' }],
  ['AS04', 'Is my Atom fee refunded with my payout?', FEE_POLICY],
  ['AS05', 'My Atom payout 3 \u2014 will I get my $289 back?', FEE_POLICY],
  ['AS06', 'Was my Atom KYC approved and is the fee refundable?', FEE_POLICY],
];

// 5. Multi-turn.  prior = earlier CUSTOMER messages (oldest first).
const multiTurn = [
  ['MT01', 'what about for the third payout?', ['I paid $289 for Atom 1-Step. Do I get it back?'], FEE_POLICY],
  ['MT02', 'and for 2-Step?', ['Is the Atom challenge fee refundable?'], FEE_POLICY],
  ['MT03', 'What is the daily loss on 2-Step?', ['What is Atom?'], { answer: 'atom.2step.daily-loss.en' }],
  ['MT04', 'what about the daily loss?', ['Tell me about Atom 2-Step'], { answer: 'atom.2step.daily-loss.en' }],
  ['MT05', 'and daily loss?', ['Atom 1-Step max loss?'], { answer: 'atom.1step.daily-loss.en' }],
  ['MT06', 'and for 1-Step?', ['Atom 2-Step profit split?'], { answer: 'atom.1step.reward.en' }],
  ['MT07', 'and 50K?', ['How much does Atom 100K cost?'], { answer: 'atom.prices.list.en' }],
  ['MT08', 'I paid $289 for it, do I get it back on payout 3?', ['What profit split applies on Atom 2-Step?'], FEE_POLICY],
  ['MT09', 'ok thanks. What is the Atom 2-Step daily loss?', ['Do I get my Atom fee back on the third payout?'], { answer: 'atom.2step.daily-loss.en' }],
  ['MT10', 'and 2-Step?', ['Is Atom fee refundable?', 'what about 1-Step?'], FEE_POLICY],
  ['MT11', 'what is daily loss on 2-Step?', ['Hello'], { noAnswer: true, reason: 'not-atom-scope' }],
  ['MT12', 'What is the daily loss on Elite Packs?', ['Tell me about Atom'], { noAnswer: true, reason: 'not-atom-scope' }],
  ['MT13', 'What is the profit split?', ['Atom 1-Step'], { answer: 'atom.1step.reward.en' }],
  ['MT14', 'What is the profit split on 2-Step?', ['Atom 1-Step'], { answer: 'atom.2step.reward.en' }],
  ['MT15', 'and the third payout?', ['What profit split applies on Atom 1-Step?'], { notAnswerIds: ['atom.prices.list.en', 'atom.account-status.refuse.en'] }],
  ['MT16', 'and what about the price?', ['I paid $289 for Atom. Refund?'], FEE_POLICY],
  ['MT17', 'same question for the 100k', ['Atom: after the third cashout do I recover what I paid?'], { noAnswer: true }],
  ['MT18', 'What is the payout cap?', ['Atom 2-Step'], { answer: 'atom.payouts.general.en' }],
  ['MT19', 'what about 2-Step?', ['Is the Atom 1-Step target 10%?'], { notAnswerIds: ['atom.obsolete.10pct-1step.en', 'atom.prices.list.en'] }],
  ['MT20', 'how much?', ['Atom 100K price?', 'what about the 3rd payout'], { noAnswer: true }],
];

// 6. Unicode and formatting.
const unicode = [
  ['UC01', '\uff21\uff54\uff4f\uff4d \uff12-\uff33\uff54\uff45\uff50 daily loss limit', { answer: 'atom.2step.daily-loss.en' }],
  ['UC02', 'What is the Atom\u00a02-Step\u00a0daily\u00a0loss\u00a0limit?', { answer: 'atom.2step.daily-loss.en' }],
  ['UC03', 'What is the Atom 2-Step da\u200bily lo\u200bss limit?', { answer: 'atom.2step.daily-loss.en' }],
  ['UC04', '\u0410tom 2-Step daily loss limit', { answer: 'atom.2step.daily-loss.en' }],
  ['UC05', 'What is the Atom 2-Step daily loss limit? \ud83d\ude4f', { answer: 'atom.2step.daily-loss.en' }],
  ['UC06', '\u200fWhat is the Atom 2-Step daily loss limit?\u200f', { answer: 'atom.2step.daily-loss.en' }],
  ['UC07', 'At\u00f3m 2-Step daily l\u00f3ss limit', { answer: 'atom.2step.daily-loss.en' }],
  ['UC08', 'Atom 2-Step da\u0131ly loss limit', { answer: 'atom.2step.daily-loss.en' }],
  ['UC09', '\u0430\u0442\u043e\u043c daily loss limit', { noAnswer: true, reason: 'non-english' }],
  ['UC10', 'Atom 100K \uff04\uff11\uff16\uff11 price permanent?', { answer: 'atom.obsolete.price-161-permanent.en' }],
  ['UC11', 'A'.repeat(1300) + ' Atom daily loss', { noAnswer: true, reason: 'ask-too-long' }],
  ['UC12', 'What is the Atom 2-Step daily loss limit?\n\n\n   \t', { answer: 'atom.2step.daily-loss.en' }],
  ['UC13', 'ATOM 2-STEP DAILY LOSS LIMIT???', { answer: 'atom.2step.daily-loss.en' }],
  ['UC14', 'Atom 2-Step \u0440ayout cap', { answer: 'atom.payouts.general.en' }],
  ['UC15', 'Atom\u2060 \u2060fee\u2060 refund', FEE_POLICY],
  ['UC16', '\u202eAtom refund payout 3', FEE_POLICY],
];

// 7. Non-English: must abstain (English-only answering).
const nonEnglish = [
  ['NE01', '\u00bfCu\u00e1l es el l\u00edmite de p\u00e9rdida diaria en Atom 2-Step?'],
  ['NE02', 'Qual \u00e9 o limite de perda di\u00e1ria no Atom 2-Step?'],
  ['NE03', 'Atom 2-Step mein daily loss kitna hai?'],
  ['NE04', '\u0627\u0679\u0648\u0645 2-Step \u0645\u06cc\u06ba \u0631\u0648\u0632\u0627\u0646\u06c1 \u0646\u0642\u0635\u0627\u0646 \u06a9\u06cc \u062d\u062f \u06a9\u06cc\u0627 \u06c1\u06d2 Atom'],
  ['NE05', 'Atom 2-Step \u092e\u0947\u0902 \u0926\u0948\u0928\u093f\u0915 \u0928\u0941\u0915\u0938\u093e\u0928 \u0938\u0940\u092e\u093e \u0915\u094d\u092f\u093e \u0939\u0948 Atom'],
  ['NE06', 'Atom 2-Step \u0645\u0627 \u0647\u0648 \u062d\u062f \u0627\u0644\u062e\u0633\u0627\u0631\u0629 \u0627\u0644\u064a\u0648\u0645\u064a\u0629'],
  ['NE07', 'Quelle est la limite de perte quotidienne sur Atom 2-Step ?'],
  ['NE08', 'Wie hoch ist das t\u00e4gliche Verlustlimit bei Atom 2-Step?'],
  ['NE09', 'Atom 2-Step \u6bcf\u65e5\u4e8f\u635f\u9650\u5236\u662f\u591a\u5c11'],
  ['NE10', '\u00bfMe devuelven el precio de Atom en el tercer pago?'],
  ['NE11', 'Atom ka paisa wapas milega teesre payout par?'],
  ['NE12', 'Atom kitna price hai 100K ka?'],
  ['NE13', 'Cu\u00e1nto cuesta Atom 100K 2-Step?'],
  ['NE14', 'Quanto custa o Atom 100K 1-Step?'],
  ['NE15', '\u0627\u0679\u0648\u0645 \u06a9\u06cc \u0642\u06cc\u0645\u062a Atom'],
];

const MC_ANY_ABSTAIN = new Set(['MC21', 'MC25', 'MC36', 'MC41', 'MC49']);

module.exports = { MC_ANY_ABSTAIN, ANY_ABSTAIN, moneyConfusion, unresolved, discriminate, accountSpecific, multiTurn, unicode, nonEnglish, FEE_POLICY };
