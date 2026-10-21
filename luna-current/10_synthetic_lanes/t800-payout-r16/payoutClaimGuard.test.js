'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const guard = require('./payoutClaimGuard');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log('ok', name);
}

function reply(draft, clientText, extra) {
  return guard.guardPublicBody(draft, Object.assign({ clientText: clientText || '' }, extra || {}));
}

test('candidate is frozen and unapproved', () => {
  assert.strictEqual(guard.STATUS.candidate, 't800-payout-r16');
  assert.strictEqual(guard.STATUS.frozen, true);
  assert.strictEqual(guard.STATUS.approved, false);
  assert.strictEqual(guard.STATUS.release, false);
  assert.strictEqual(guard.CLIENT_MESSAGE, "I can't confirm that. Our team will confirm.");
  assert.ok(guard.locksOk());
  const lock = require('./approved.lock.json');
  const ex = lock.owner_exceptions.find((row) => row.id === 'strategy_risk');
  assert.strictEqual(ex.kind, 'owner_final_exception');
  assert.ok(ex.overrides.includes('17437285'));
  assert.ok(ex.overrides.includes('17437388'));
  assert.strictEqual(ex.daily_loss_hard_unchanged, '17437388');
  for (const fact of guard.FACTS) {
    assert.ok(lock.citations[fact.id].length > 0);
  }
  for (const fact of guard.FACTS) {
    for (const [lang, text] of Object.entries(fact.body)) {
      assert.strictEqual(guard.sha256(text), fact.hash[lang], fact.id + ' ' + lang);
    }
  }
  for (const [lang, text] of Object.entries(guard.HEDGES)) {
    assert.strictEqual(guard.sha256(text), guard.HEDGE_HASH[lang], lang);
  }
});

test('strategy risk and daily-loss hard breach stay distinct approved bodies', () => {
  const draft = 'MODEL-DRAFT it terminates the account for $25.';
  const strategy = reply(draft, 'What happens on a Strategy Risk breach?');
  const daily = reply(draft, 'What happens if I hit the daily loss limit?');
  assert.strictEqual(strategy.body, guard.BY_ID.strategy_risk.body.en);
  assert.strictEqual(strategy.reason, 'approved_body');
  assert.strictEqual(strategy.result.approved, false);
  assert.strictEqual(daily.body, guard.BY_ID.daily_loss_hard.body.en);
  assert.notStrictEqual(strategy.body, daily.body);
  assert.ok(!strategy.body.includes('MODEL-DRAFT'));
  assert.ok(!daily.body.includes('MODEL-DRAFT'));
  assert.ok(/soft breach with a reset/i.test(strategy.body));
  assert.ok(/does not terminate or close/i.test(strategy.body));
  assert.ok(/ends the account/i.test(daily.body));
  const mixed = reply(draft, 'What if I hit my daily loss limit and also break the strategy risk rule?');
  assert.strictEqual(mixed.body, guard.HEDGES.en);
  assert.strictEqual(mixed.reason, 'uncertain');
});

test('worded numbers and paraphrases select the approved body, not the model sentence', () => {
  const draft = 'MODEL-DRAFT you can risk ninety percent and the account dies.';
  const cap = reply(draft, 'May I risk fifty percent of my daily loss limit on one instrument?');
  assert.strictEqual(cap.body, guard.BY_ID.instrument_cap.body.en);
  assert.ok(!/fifty|ninety|dies|MODEL/i.test(cap.body));
  assert.ok(cap.body.includes('50%'));
  assert.ok(cap.body.includes('1.5%'));
  const rise = reply('MODEL-DRAFT a $4,800 Rise payout arrives as $4,700.', 'What does a Rise withdrawal arrive as?');
  assert.strictEqual(rise.body, guard.BY_ID.rise_fee.body.en);
  assert.ok(rise.body.includes('$4,760'));
  assert.ok(!rise.body.includes('$4,700'));
  const crypto = reply('MODEL-DRAFT crypto is capped at $500.', 'What is the crypto fee?');
  assert.strictEqual(crypto.body, guard.BY_ID.crypto_fee.body.en);
  assert.ok(crypto.body.includes('3%'));
  assert.ok(crypto.body.includes('$388'));
});

test('core languages get the approved translation and other languages get English plus the hedge', () => {
  const draft = 'MODEL-DRAFT the account is closed forever.';
  const cases = [
    ['سٹریٹیجی رسک کی خلاف ورزی پر کیا ہوتا ہے؟', 'ur'],
    ['Strategy risk ki breach par kya hota hai?', 'roman'],
    ['स्ट्रैटेजी रिस्क ब्रीच पर क्या होता है?', 'hi'],
    ['ماذا يحدث عند خرق مخاطر الاستراتيجية؟', 'ar'],
    ['Bhai strategy risk breach pe account band ho jayega kya?', 'hinglish'],
  ];
  for (const [question, lang] of cases) {
    const result = reply(draft, question);
    assert.strictEqual(result.body, guard.BY_ID.strategy_risk.body[lang], lang);
    assert.ok(!result.body.includes('MODEL-DRAFT'), lang);
  }
  const french = reply(draft, 'Que se passe-t-il en cas de risque de stratégie ?');
  assert.ok(french.body.startsWith(guard.BY_ID.strategy_risk.body.en));
  assert.ok(french.body.endsWith(guard.HEDGES.fr));
  assert.ok(!french.body.includes('MODEL-DRAFT'));
  const spanish = reply(draft, '¿Qué pasa con el riesgo de estrategia?');
  assert.ok(spanish.body.endsWith(guard.HEDGES.es));
});

test('catalyst erase or keep is always the hedge, and published catalyst facts are bodies', () => {
  const kept = reply('MODEL-DRAFT your earlier stage profit is preserved.', 'Is Catalyst profit kept when the stage resets?');
  assert.strictEqual(kept.body, guard.HEDGES.en);
  assert.ok(!/preserved|MODEL/i.test(kept.body));
  const rules = reply('MODEL-DRAFT daily loss is 9%.', 'What is the Catalyst daily loss and profit target?');
  assert.strictEqual(rules.body, guard.BY_ID.catalyst_rules.body.en);
  assert.ok(rules.body.includes('3%'));
  assert.ok(rules.body.includes('8%'));
  const ladder = reply('MODEL-DRAFT stage 3 costs $10.', 'What is Catalyst stage 3?');
  assert.strictEqual(ladder.body, guard.BY_ID.catalyst_ladder.body.en);
  assert.ok(ladder.body.includes('$1,290'));
});

test('reset count is the published limit, and a status claim is hedged', () => {
  const count = reply('MODEL-DRAFT you can reset 4 times.', 'How many times can I reset?');
  assert.strictEqual(count.body, guard.BY_ID.reset_count.body.en);
  assert.ok(!count.body.includes('4'));
  assert.ok(count.body.includes('3'));
  const losing = reply('MODEL-DRAFT you can reset in drawdown.', 'Can I reset while losing?');
  assert.strictEqual(losing.body, guard.BY_ID.reset_eligibility.body.en);
  const paid = reply('Your reward was paid. MODEL-DRAFT', 'Was my payout sent?');
  assert.strictEqual(paid.body, guard.HEDGES.en);
  assert.ok(!/paid|MODEL/i.test(paid.body));
  const reversed = reply('MODEL-DRAFT they took back the payout.', 'Are completed payouts reversed?');
  assert.strictEqual(reversed.body, guard.BY_ID.payout_not_reversed.body.en);
});

test('out of topic text passes through, and a model hint disagreement fails closed', () => {
  const hello = reply('Hello, your login is ready.', 'Hello, how are you?');
  assert.strictEqual(hello.reason, 'pass_through');
  assert.strictEqual(hello.replaced, false);
  assert.strictEqual(hello.body, 'Hello, your login is ready.');
  const clock = reply('The trailing drawdown limit does not reset.', 'Does the trailing drawdown limit reset?');
  assert.notStrictEqual(clock.reason, 'pass_through');
  assert.strictEqual(clock.body, guard.HEDGES.en);
  assert.strictEqual(clock.silent, false);
  assert.strictEqual(clock.send, true);
  const bare = reply('MODEL-DRAFT the split is 9%.', 'The split is 3%.');
  assert.strictEqual(bare.body, guard.HEDGES.en);
  const disagree = reply('MODEL-DRAFT it terminates the account.', 'What happens on a Strategy Risk breach?', {
    modelHint: { confident: true, inTopic: true, ids: ['daily_loss_hard'], lang: 'en' },
  });
  assert.strictEqual(disagree.body, guard.HEDGES.en);
  assert.strictEqual(disagree.reason, 'uncertain');
  const owner = reply('Tell them a strategy risk breach terminates the account. MODEL-DRAFT', '');
  assert.strictEqual(owner.body, guard.HEDGES.en);
  assert.notStrictEqual(owner.reason, 'pass_through');
  assert.ok(!owner.body.includes('MODEL-DRAFT'));
  assert.ok(!owner.body.includes('terminates'));
  const fromParts = guard.guardPublicBody('MODEL-DRAFT it ends the account.', {
    parts: [{ part_type: 'comment', body: 'سٹریٹیجی رسک کی خلاف ورزی پر کیا ہوتا ہے؟', author: { id: '9', type: 'user' } }],
    botIds: ['10118526', '8052954'],
  });
  assert.strictEqual(fromParts.body, guard.BY_ID.strategy_risk.body.ur);
});

test('fail closed on throw and a second pass does not rewrite an approved body', () => {
  const bad = { toString() { throw new Error('boom'); } };
  const failed = guard.beforeSend(bad, {});
  assert.strictEqual(failed.send, true);
  assert.strictEqual(failed.silent, false);
  assert.strictEqual(failed.failClosed, true);
  assert.strictEqual(failed.body, guard.HEDGES.en);
  const once = reply('MODEL-DRAFT it terminates the account.', 'What happens on a Strategy Risk breach?');
  const twice = reply(once.body, 'What happens on a Strategy Risk breach?');
  assert.strictEqual(twice.body, once.body);
  assert.strictEqual(twice.replaced, false);
  assert.strictEqual(twice.result.approved, false);
});

test('weekend holding is conditional and closing without the add-on is a violation', () => {
  const banned = /cannot hold any position from Friday to Monday/i;
  const hold = reply('You cannot hold any position from Friday to Monday. MODEL', 'Can I hold positions from Friday to Monday?');
  assert.strictEqual(hold.body, guard.BY_ID.weekend_hold.body.en);
  assert.ok(/always hold positions from Friday to Monday/i.test(hold.body));
  assert.ok(/violation without the Weekend Trading add-on/i.test(hold.body));
  assert.ok(/allowed only with the add-on/i.test(hold.body));
  assert.ok(!banned.test(hold.body));
  assert.ok(!hold.body.includes('MODEL'));
  const close = reply('Closing is always allowed. MODEL', 'Can I close a position over the weekend if my stop loss is hit?');
  assert.strictEqual(close.body, guard.BY_ID.weekend_hold.body.en);
  const marks = { ur: 'خلاف ورزی', roman: 'violation', hi: 'उल्लंघन', ar: 'مخالفة', hinglish: 'violation' };
  for (const [lang, mark] of Object.entries(marks)) {
    const body = guard.BY_ID.weekend_hold.body[lang];
    assert.ok(body.includes(mark), lang);
    assert.ok(!banned.test(body), lang);
    assert.ok(!/is allowed\.$/.test(body));
  }
});

test('intent match does not fire on keyword overlap', () => {
  const password = reply('Use the reset link in the email.', 'How do I reset my password?');
  assert.strictEqual(password.reason, 'pass_through');
  assert.ok(password.body.includes('reset link'));
  const purchase = reply('You can pay with crypto at checkout.', 'Can I pay with crypto?');
  assert.strictEqual(purchase.reason, 'pass_through');
  const mt5 = reply('Download MT5 from the site.', 'How do I install MT5?');
  assert.strictEqual(mt5.reason, 'pass_through');
  const catalystWeekend = reply('MODEL weekend holding is allowed without the add-on.', 'On Catalyst, is weekend trading allowed?');
  assert.strictEqual(catalystWeekend.body, guard.BY_ID.catalyst_rules.body.en);
  assert.ok(!catalystWeekend.body.includes('add-on'));
  const saturday = reply('MODEL opening a new position on Saturday is always allowed.', 'Can I trade on Saturday?');
  assert.strictEqual(saturday.body, guard.BY_ID.weekend_trade.body.en);
  const fee = reply('MODEL there is no refund.', 'Do I get my challenge fee back?');
  assert.strictEqual(fee.body, guard.BY_ID.fee_refund.body.en);
});

test('a payout-topic draft in any script is not posted, and erase or keep is always the hedge', () => {
  const urdu = 'آپ کی مکمل ادائیگی واپس کر دی گئی ہے۔';
  const urduResult = reply(urdu, '');
  assert.notStrictEqual(urduResult.body, urdu);
  assert.notStrictEqual(urduResult.reason, 'pass_through');
  assert.ok(!urduResult.body.includes('واپس کر دی'));
  const arabic = 'يصل السحب خلال ساعة واحدة.';
  const arabicResult = reply(arabic, '');
  assert.notStrictEqual(arabicResult.body, arabic);
  assert.notStrictEqual(arabicResult.reason, 'pass_through');
  const hourOnHello = reply('Your payout arrives within one hour.', 'Hello');
  assert.strictEqual(hourOnHello.body, guard.HEDGES.en);
  assert.notStrictEqual(hourOnHello.reason, 'pass_through');
  const offLexicon = [
    'Le retrait arrive dans une heure.',
    'El retiro llega en una hora.',
    'Payout wapas kar diya gaya.',
    'You can reset this funded account 4 times.',
    'भुगतान एक घंटे में आ जाएगा।',
  ];
  for (const draft of offLexicon) {
    const result = reply(draft, 'Hello');
    assert.notStrictEqual(result.reason, 'pass_through', draft);
    assert.notStrictEqual(result.body, draft, draft);
    assert.strictEqual(result.send, true, draft);
    assert.strictEqual(result.silent, false, draft);
  }
  const paraphrases = [
    'Catalyst stage reset ke baad profit reh gaya?',
    'کیا کیٹالسٹ کا پرانا منافع محفوظ رہتا ہے؟',
    'هل يُحفظ ربح المرحلة السابقة في كاتاليست؟',
    'क्या कैटलिस्ट का पुराना लाभ बचता है?',
    'Bhai catalyst reset pe profit rakha jayega?',
    'Le profit du palier Catalyst est-il conservé ?',
  ];
  for (const question of paraphrases) {
    const result = reply('Stage 3 is $100,000 and 90% share. MODEL', question);
    assert.notStrictEqual(result.reason, 'pass_through', question);
    assert.ok(!result.body.includes('$1,290'), question);
    assert.ok(!result.body.includes('90%'), question);
    assert.ok(!result.body.includes('MODEL'), question);
  }
});

test('a clear question keeps its approved body when the draft adds other claims', () => {
  const rise = reply('MODEL-DRAFT the fee is $40 and it arrives in one hour and you can reset 4 times.', 'What is the Rise withdrawal fee?');
  assert.strictEqual(rise.body, guard.BY_ID.rise_fee.body.en);
  const again = reply(rise.body, 'What does a Rise withdrawal arrive as?');
  assert.strictEqual(again.body, rise.body);
  assert.strictEqual(again.replaced, false);
  const rules = reply(guard.BY_ID.catalyst_rules.body.en, 'What is the Catalyst daily loss and profit target?');
  assert.strictEqual(rules.body, guard.BY_ID.catalyst_rules.body.en);
  assert.strictEqual(rules.replaced, false);
  const weekend = reply(guard.BY_ID.weekend_hold.body.en, 'Can I hold positions from Friday to Monday?');
  assert.strictEqual(weekend.body, guard.BY_ID.weekend_hold.body.en);
  assert.strictEqual(weekend.replaced, false);
});

test('every allowed send posts a body or the hedge', () => {
  const empty = guard.beforeSend('', { clientText: '' });
  assert.strictEqual(empty.send, true);
  assert.strictEqual(empty.silent, false);
  assert.ok(empty.body && empty.body.length > 0);
  const off = reply('تم إغلاق الحساب لأن النسبة ٥٠٪ خلال ساعة.', '');
  assert.strictEqual(off.send, true);
  assert.strictEqual(off.silent, false);
  assert.notStrictEqual(off.reason, 'pass_through');
  assert.ok(!off.body.includes('٥٠'));
  assert.ok(!off.body.includes('50'));
  const mt5 = reply('Open MT5 and use the reset button in the terminal.', 'How do I reset MT5?');
  assert.strictEqual(mt5.reason, 'pass_through');
  assert.strictEqual(mt5.body, 'Open MT5 and use the reset button in the terminal.');
  const kyc = reply('Upload your passport and a selfie from the dashboard settings.', 'How do I complete KYC?');
  assert.strictEqual(kyc.reason, 'pass_through');
  assert.ok(!/breach|hard breach/i.test(kyc.body));
});

test('clear approved questions return the locked row across paraphrases', () => {
  const cases = [
    ['What happens on a Strategy Risk breach?', 'strategy_risk'],
    ['What happens if I hit the daily loss limit?', 'daily_loss_hard'],
    ['May I risk fifty percent of my daily loss limit on one instrument?', 'instrument_cap'],
    ['What is the crypto fee?', 'crypto_fee'],
    ['What is the Rise withdrawal fee?', 'rise_fee'],
    ['How many times can I reset?', 'reset_count'],
    ['Can I reset while losing?', 'reset_eligibility'],
    ['Do I get my challenge fee back?', 'fee_refund'],
    ['Are completed payouts reversed?', 'payout_not_reversed'],
    ['Can I hold positions from Friday to Monday?', 'weekend_hold'],
    ['Can I trade on Saturday?', 'weekend_trade'],
    ['What is the Catalyst daily loss and profit target?', 'catalyst_rules'],
    ['What is Catalyst stage 3?', 'catalyst_ladder'],
    ['What happens after a soft breach?', 'soft_breach_payout'],
    ['What is a soft breach?', 'soft_kinds'],
    ['What is a hard breach?', 'hard_breach'],
    ['Strategy risk ki breach par kya hota hai?', 'strategy_risk'],
    ['Bhai strategy risk breach pe account band ho jayega kya?', 'strategy_risk'],
    ['سٹریٹیجی رسک کی خلاف ورزی پر کیا ہوتا ہے؟', 'strategy_risk'],
    ['What happens on a risk rule breach?', 'strategy_risk'],
    ['رسک رول کی خلاف ورزی پر اکاؤنٹ بند ہوتا ہے؟', 'strategy_risk'],
    ['कितनी बार funded account reset हो सकता है?', 'reset_count'],
    ['Kitni dafa reset kar sakta hoon?', 'reset_count'],
    ['میں کتنی بار ری سیٹ کر سکتا ہوں؟', 'reset_count'],
    ['كم مرة يمكنني إعادة التعيين؟', 'reset_count'],
    ['कितनी बार रीसेट कर सकता हूँ?', 'reset_count'],
    ['डेली लॉस लिमिट छू जाए तो क्या होगा?', 'daily_loss_hard'],
    ['ڈیلی لاس کی حد چھونے پر کیا ہوتا ہے؟', 'daily_loss_hard'],
    ['ماذا يحدث إذا لمست حد الخسارة اليومية؟', 'daily_loss_hard'],
    ['کیا میں جمعہ سے پیر تک پوزیشن ہولڈ کر سکتا ہوں؟', 'weekend_hold'],
    ['هل يمكنني الاحتفاظ بصفقة من الجمعة إلى الاثنين؟', 'weekend_hold'],
    ['क्या मैं शुक्रवार से सोमवार तक पोजीशन होल्ड कर सकता हूँ?', 'weekend_hold'],
    ['Kya main ek instrument par 50 percent risk le sakta hoon?', 'instrument_cap'],
    ['क्रिप्टो फीस क्या है?', 'crypto_fee'],
    ['On Catalyst, can I buy one reset after the first stage?', 'catalyst_stage_reset'],
    ['Where do I reset the funded account?', 'reset_where'],
    ['What is the funded reset price?', 'reset_price'],
    ['Is previous cycle profit paid after a reset?', 'reset_previous'],
    ['How will I be paid?', 'payout_timing'],
    ['Does a Catalyst payout open a fresh account?', 'catalyst_reopen'],
  ];
  for (const [question, id] of cases) {
    const result = reply('MODEL-DRAFT unsupported $999 and 99%.', question);
    const lang = guard.detectLanguage(question);
    const expectedLang = lang.confident && guard.BY_ID[id].body[lang.lang] ? lang.lang : 'en';
    const expected = guard.BY_ID[id].body[expectedLang] || guard.BY_ID[id].body.en;
    assert.strictEqual(result.body, expected, question);
    assert.strictEqual(result.silent, false, question);
    assert.ok(!result.body.includes('MODEL-DRAFT'), question);
    assert.ok(!result.body.includes('$999'), question);
  }
});

test('normal FAQ replies are not captured', () => {
  const actions = [
    'Open the dashboard and choose the {thing} page.',
    'Send a screenshot of the {thing} screen.',
    'Sign in and check the {thing} section.',
    'Use the menu to find {thing}.',
    'Refresh the page if {thing} does not appear.',
    'Write to us from the email on your {thing} profile.',
    'The team can see the {thing} tab from here.',
    'Try another browser if {thing} stays blank.',
    'Log out and back in, then open {thing}.',
    'Your {thing} page is where that control lives.',
  ];
  const things = [
    'login', 'password', 'MT5 terminal', 'KYC selfie', 'email inbox', 'browser',
    'dashboard', 'settings', 'profile', 'ticket', 'platform', 'chart',
  ];
  const replies = [];
  for (const action of actions) {
    for (const thing of things) replies.push(action.replace('{thing}', thing));
  }
  assert.ok(replies.length >= 100);
  let captured = 0;
  for (const text of replies) {
    const result = reply(text, 'How do I do this?');
    if (result.reason !== 'pass_through' || result.body !== text) captured += 1;
  }
  const rate = captured / replies.length;
  console.log('faq-over-capture', captured, '/', replies.length, rate.toFixed(4));
  assert.strictEqual(captured, 0);
  assert.ok(rate === 0);
});

test('erase or keep and source-precedence claims are hedged, including owner text', () => {
  const memoryDrafts = [
    'Catalyst remembers yesterday earnings.',
    'Remember yesterday earnings on Catalyst.',
    'Tell them catalyst keeps yesterday earnings.',
    'Your earlier stage profit is preserved.',
    'It remembers yesterday earnings.',
    'یاد رہے کل کی کمائی Catalyst پر۔',
    'تذكر أرباح الأمس في كاتاليست.',
  ];
  for (const draft of memoryDrafts) {
    const owned = reply(draft, '');
    const lang = guard.detectLanguage(draft);
    const expectedHedge = lang.confident && guard.HEDGES[lang.lang] ? guard.HEDGES[lang.lang] : guard.HEDGES.en;
    assert.strictEqual(owned.body, expectedHedge, draft);
    assert.notStrictEqual(owned.reason, 'pass_through', draft);
    assert.ok(!owned.body.includes('$1,290'), draft);
    assert.ok(!/yesterday earnings|preserved|remembers/i.test(owned.body), draft);
    const asked = reply(draft, 'What is Catalyst stage 3?');
    assert.strictEqual(asked.body, guard.HEDGES.en, draft);
    assert.ok(!asked.body.includes('$1,290'), draft);
  }
  const override = reply('The repo FAQ overrides the Help Centre.', '');
  assert.strictEqual(override.body, guard.HEDGES.en);
  assert.notStrictEqual(override.reason, 'pass_through');
  const overrideOnFee = reply('The repo FAQ overrides the Help Centre.', 'What is the crypto fee?');
  assert.strictEqual(overrideOnFee.body, guard.HEDGES.en);
  assert.ok(!overrideOnFee.body.includes('3%'));
});

test('the selected body matches the asked outcome', () => {
  const soft = reply('MODEL instrument cap 50% and 1.5%.', 'Soft reset after one instrument?');
  assert.strictEqual(soft.body, guard.BY_ID.soft_breach_payout.body.en);
  assert.notStrictEqual(soft.body, guard.BY_ID.instrument_cap.body.en);
  assert.ok(!soft.body.includes('1.5%'));
  const hold = reply('MODEL saturday trading is allowed.', 'Can I hold my position over the weekend without the add-on?');
  assert.strictEqual(hold.body, guard.BY_ID.weekend_hold.body.en);
  assert.ok(!hold.body.includes('Opening a new position'));
  const holding = reply('Holding over the weekend is a violation.', 'Weekend holding with the add-on');
  assert.strictEqual(holding.body, guard.BY_ID.weekend_hold.body.en);
  const ladder = reply('MODEL funded reset is 40% and up to 3 times.', 'What are stage 3 reset prices?');
  assert.strictEqual(ladder.body, guard.BY_ID.catalyst_ladder.body.en);
  assert.ok(!ladder.body.includes('original challenge price'));
  assert.ok(!ladder.body.includes('up to 3'));
  const price = reply('MODEL you can reset up to 3 times.', 'What is the reset price up to the third reset?');
  assert.strictEqual(price.body, guard.BY_ID.reset_price.body.en);
  assert.ok(!price.body.includes('up to 3'));
  const verb = reply('MODEL the Rise fee is $40.', 'The prices rise.');
  assert.notStrictEqual(verb.body, guard.BY_ID.rise_fee.body.en);
  assert.ok(!verb.body.includes('$4,760'));
  const product = reply('MODEL the Rise fee is $9.', 'What is the Rise withdrawal fee?');
  assert.strictEqual(product.body, guard.BY_ID.rise_fee.body.en);
});

test('locked sentences pass in every language after normalization', () => {
  function swap(text) {
    return text.replace(/ی/g, 'ي').replace(/ک/g, 'ك').replace(/ہ/g, 'ه');
  }
  const variants = [
    swap(guard.BY_ID.strategy_risk.body.ur),
    guard.BY_ID.catalyst_rules.body.ar,
    guard.BY_ID.daily_loss_hard.body.hi,
    guard.BY_ID.weekend_hold.body.ur,
    guard.BY_ID.reset_count.body.hinglish,
    guard.BY_ID.crypto_fee.body.roman,
  ];
  for (const text of variants) {
    const result = reply(text, '');
    assert.strictEqual(result.reason, 'pass_through', text.slice(0, 24));
    assert.strictEqual(result.body, text);
    assert.strictEqual(result.silent, false);
    assert.strictEqual(result.send, true);
  }
});

test('reversal, paid-yesterday, and fee-refund claims hedge in every script unless locked', () => {
  const claims = [
    ['Your completed payout was reversed.', 'en'],
    ['The payout was pulled back.', 'en'],
    ['Your payout was paid yesterday.', 'en'],
    ['Your challenge fee was refunded.', 'en'],
    ['آپ کی مکمل ادائیگی واپس لے لی گئی ہے۔', 'ur'],
    ['پے آؤٹ کل ادا ہو گیا۔', 'ur'],
    ['آپ کی فیس ریفنڈ کر دی گئی۔', 'ur'],
    ['पूरा पेआउट वापस ले लिया गया।', 'hi'],
    ['पेआउट कल भुगतान हो गया।', 'hi'],
    ['आपकी फीस रिफंड कर दी गई।', 'hi'],
    ['تم استرجاع السحب المكتمل.', 'ar'],
    ['السحب دفعت أمس.', 'ar'],
    ['تم استرداد الرسوم.', 'ar'],
  ];
  for (const [draft, lang] of claims) {
    const owned = reply(draft, '');
    assert.strictEqual(owned.body, guard.HEDGES[lang], draft);
    assert.notStrictEqual(owned.reason, 'pass_through', draft);
    assert.strictEqual(owned.send, true, draft);
    assert.strictEqual(owned.silent, false, draft);
    assert.notStrictEqual(owned.body, draft, draft);
  }
  for (const id of ['payout_not_reversed', 'fee_refund']) {
    for (const lang of ['en', 'ur', 'hi', 'ar']) {
      const body = guard.BY_ID[id].body[lang];
      const result = reply(body, '');
      assert.strictEqual(result.reason, 'pass_through', id + ' ' + lang);
      assert.strictEqual(result.body, body, id + ' ' + lang);
    }
  }
  const button = reply('The refund button is under the billing tab.', 'Where is the refund button?');
  assert.strictEqual(button.reason, 'pass_through');
  assert.strictEqual(button.body, 'The refund button is under the billing tab.');
});

test('compound questions get the hedge, and one locked sentence is not enough', () => {
  const holdClose = reply(guard.BY_ID.weekend_hold.body.en, 'Can I hold and also close a position over the weekend?');
  assert.strictEqual(holdClose.body, guard.HEDGES.en);
  assert.notStrictEqual(holdClose.body, guard.BY_ID.weekend_hold.body.en);
  const both = reply('A hard breach ends the account and a soft breach resets it.', 'Is it both a hard breach and a soft breach?');
  assert.strictEqual(both.body, guard.HEDGES.en);
  assert.ok(!both.body.includes('ends the account'));
  const multi = reply('MODEL crypto is 3% and Rise is $40.', 'What is the crypto fee and the Rise withdrawal fee?');
  assert.strictEqual(multi.body, guard.HEDGES.en);
  assert.notStrictEqual(multi.body, guard.BY_ID.crypto_fee.body.en);
  assert.notStrictEqual(multi.body, guard.BY_ID.rise_fee.body.en);
  const closeOnly = reply('Closing is always allowed. MODEL', 'Can I close a position over the weekend if my stop loss is hit?');
  assert.strictEqual(closeOnly.body, guard.BY_ID.weekend_hold.body.en);
  const faq = reply('Open the dashboard and choose the login page.', 'Can I hold and also close a position over the weekend?');
  assert.strictEqual(faq.reason, 'pass_through');
  assert.strictEqual(faq.body, 'Open the dashboard and choose the login page.');
});

test('ordinary FAQ replies stay untouched, including on a payout question', () => {
  const onFee = reply('Open the dashboard and choose the login page.', 'What is the crypto fee?');
  assert.strictEqual(onFee.reason, 'pass_through');
  assert.strictEqual(onFee.body, 'Open the dashboard and choose the login page.');
  assert.notStrictEqual(onFee.body, guard.HEDGES.en);
  assert.notStrictEqual(onFee.body, guard.TEAMMATE_FORWARD.en);
  assert.notStrictEqual(onFee.body, guard.BY_ID.crypto_fee.body.en);
  const password = reply('Remember your password before you sign in.', 'How do I reset my password?');
  assert.strictEqual(password.reason, 'pass_through');
  assert.strictEqual(password.body, 'Remember your password before you sign in.');
});

test('the teammate-forward sentence is localized and is not injected onto other replies', () => {
  const hindi = reply(guard.TEAMMATE_FORWARD.en, 'क्या मेरा पेआउट हुआ?');
  assert.strictEqual(hindi.body, guard.TEAMMATE_FORWARD.hi);
  assert.strictEqual(hindi.reason, 'pass_through');
  assert.ok(!hindi.body.includes("I've sent"));
  assert.notStrictEqual(hindi.body, guard.HEDGES.hi);
  const arabic = reply(guard.TEAMMATE_FORWARD.en, 'هل تم السحب؟');
  assert.strictEqual(arabic.body, guard.TEAMMATE_FORWARD.ar);
  const english = reply(guard.TEAMMATE_FORWARD.en, 'Hello');
  assert.strictEqual(english.body, guard.TEAMMATE_FORWARD.en);
  const urdu = reply(guard.TEAMMATE_FORWARD.ur, '');
  assert.strictEqual(urdu.body, guard.TEAMMATE_FORWARD.ur);
});

test('defer overlap tokenizes strategy risk in Arabic, Devanagari, and Urdu', () => {
  const Module = require('module');
  const textUtils = require('../../02_statePresend/textUtils');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === './statePresend/textUtils') return textUtils;
    return originalRequire.apply(this, arguments);
  };
  const escalate = originalRequire.call(module, '../../01_runtime/escalateRelatedOnly');
  Module.prototype.require = originalRequire;
  const handoff = require('../../01_runtime/teammateHandoffGates');
  const problem = 'The client reported a strategy risk breach and asked whether the funded account is terminated.';
  const followUps = [
    'فنڈڈ اکاؤنٹ پر اسٹریٹیجی رسک کی خلاف ورزی ہوئی ہے اور میں جاننا چاہتا ہوں کہ اکاؤنٹ بند ہوتا ہے یا نہیں۔',
    'फंडेड अकाउंट पर स्ट्रैटेजी रिस्क की ब्रीच हुई है और मैं जानना चाहता हूं कि अकाउंट बंद होगा या नहीं।',
    'حدث خرق مخاطر الاستراتيجية في الحساب الممول وأريد أن أعرف هل يُغلق الحساب بعد ذلك أم لا.',
  ];
  for (const text of followUps) {
    assert.strictEqual(escalate.isRelatedToEscalatedProblem(text, { problem }), true, text.slice(0, 12));
    const decision = escalate.decideEscalateAwaitingGate({
      awaitingFirstTeammate: true,
      userText: text,
      lastEscalateProblem: problem,
    });
    assert.strictEqual(decision.action, 'STATUS_ONLY', text.slice(0, 12));
    assert.strictEqual(guard.suppressionOverlaps(problem, text), true, text.slice(0, 12));
    const parts = [
      { author: { type: 'user' }, body: problem },
      { author: { type: 'user' }, body: text },
    ];
    assert.strictEqual(handoff.looksLikeSameIssueRestatement(text, parts), true, text.slice(0, 12));
  }
  const unrelated = 'میں لاگ ان نہیں کر پا رہا ہوں براہ کرم پاس ورڈ ری سیٹ بتا دیں۔';
  assert.strictEqual(escalate.isRelatedToEscalatedProblem(unrelated, { problem }), false);
  assert.strictEqual(handoff.looksLikeSameIssueRestatement(unrelated, [
    { author: { type: 'user' }, body: problem },
    { author: { type: 'user' }, body: unrelated },
  ]), false);
  const firstOnly = handoff.looksLikeSameIssueRestatement(problem, [
    { author: { type: 'user' }, body: problem },
  ]);
  assert.strictEqual(firstOnly, false);
});

test('the guard source does not parse claims or touch live systems', () => {
  const src = fs.readFileSync(path.join(__dirname, 'payoutClaimGuard.js'), 'utf8');
  assert.ok(!/extractTuples|factMatches|fact_mismatch/.test(src));
  assert.ok(!/action:\s*'skip'/.test(src));
  assert.ok(!/silent:\s*true/.test(src));
  assert.ok(!/require\(['"]fs['"]\)/.test(src));
  assert.ok(!/child_process/.test(src));
  assert.ok(!/api\.intercom/.test(src));
  assert.ok(!/process\.env/.test(src));
  assert.ok(src.includes('approved.lock.json'));
});

test('proposed diff guards sends only after suppression checks', () => {
  const diffPath = path.join(__dirname, 'index.js.public-sends.diff');
  const diff = fs.readFileSync(diffPath, 'utf8');
  assert.ok(diff.startsWith('diff --git a/luna-current/01_runtime/index.js b/luna-current/01_runtime/index.js\n'));
  assert.ok(diff.includes('t800-payout-r16/payoutClaimGuard'));
  assert.ok(diff.includes('payoutGuardPublicBody'));
  assert.ok(!diff.includes('payoutGuardInsteadOfDrop'));
  assert.ok(/already-replied/i.test(diff));
  assert.ok(/human-teammate/i.test(diff));
  assert.ok(/\bpause\b/i.test(diff));
  assert.ok(/aiOff/.test(diff));
  assert.ok(/ownership/i.test(diff));
  assert.ok(/send-this-message|send this message/i.test(diff));
  assert.ok(/\bFOLLOW\b/.test(diff));
  assert.ok(/Owner REPLY|owner REPLY/i.test(diff));
  assert.ok(/deferred/i.test(diff));
  assert.ok(diff.includes('finalBody = payoutGuardPublicBody(finalBody, parts, latestClientText)'));
  assert.ok(diff.includes("partsOf(full)"));
  assert.ok(!/require\(\s*['"]\.\/statePresend/.test(diff));
  assert.ok(!/02_statePresend/.test(diff));
  assert.ok(!/__statePresend\s*\./.test(diff));
  assert.ok(!diff.includes('__presend.send'));
  assert.ok(!diff.includes('SKIP pre-send'));
  assert.ok(!diff.includes('SKIP paused'));
  assert.ok(!diff.includes('SKIP aiOff'));
  assert.ok(!diff.includes('shouldWaitForFin'));
  const added = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
  assert.ok(!added.some((line) => line.includes('postReply(')));
  assert.ok(!added.some((line) => /SKIP pre-send|SKIP paused|SKIP aiOff|already replied after user/.test(line)));
  const postgate = diff.split(/^@@/m).find((hunk) => hunk.includes('POSTGATE_SUPPRESSED'));
  assert.ok(postgate);
  assert.ok(postgate.includes('} else {'));
  const postgateAdded = postgate.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
  assert.ok(postgateAdded.some((line) => line.includes('finalBody = payoutGuardPublicBody(finalBody, parts, latestClientText)')));
  assert.ok(!postgateAdded.some((line) => line.includes('return null')));
  assert.ok(!postgate.includes('else return null'));
  assert.ok(!postgate.includes('payoutBody !== finalBody'));
  const root = path.resolve(__dirname, '../../..');
  execFileSync('git', ['apply', '--check', diffPath], { cwd: root, stdio: 'pipe' });
});

console.log('t800-payout-r16', passed, 'passed');
