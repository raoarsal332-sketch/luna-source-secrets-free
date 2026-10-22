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
  assert.strictEqual(guard.STATUS.candidate, 't800-payout-r17');
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
    for (const [lang, text] of Object.entries(fact.body)) {
      assert.strictEqual(guard.sha256(text), fact.hash[lang], fact.id + ' ' + lang);
    }
    assert.ok(lock.citations[fact.id].length > 0);
  }
  for (const [lang, text] of Object.entries(guard.HEDGES)) {
    assert.strictEqual(guard.sha256(text), guard.HEDGE_HASH[lang], lang);
  }
});

test('exact locked sentences pass and other policy claims hedge', () => {
  const strategy = reply(guard.BY_ID.strategy_risk.body.en, 'What happens on a Strategy Risk breach?');
  assert.strictEqual(strategy.body, guard.BY_ID.strategy_risk.body.en);
  assert.strictEqual(strategy.reason, 'locked');
  assert.strictEqual(strategy.send, true);
  assert.strictEqual(strategy.silent, false);
  assert.strictEqual(strategy.result.approved, false);
  const bad = reply('MODEL-DRAFT it terminates the account for $25.', 'What happens on a Strategy Risk breach?');
  assert.strictEqual(bad.body, guard.HEDGES.en);
  assert.notStrictEqual(bad.body, guard.BY_ID.strategy_risk.body.en);
  const rise = reply('The Rise fee is $40.', 'What is the Rise withdrawal fee?');
  assert.strictEqual(rise.body, guard.HEDGES.en);
  assert.ok(!rise.body.includes('$4,760'));
  const lockedRise = reply(guard.BY_ID.rise_fee.body.en, 'What is the Rise withdrawal fee?');
  assert.strictEqual(lockedRise.body, guard.BY_ID.rise_fee.body.en);
  const verb = reply('The prices rise.', 'The prices rise.');
  assert.strictEqual(verb.reason, 'pass_through');
  assert.strictEqual(verb.body, 'The prices rise.');
  const weekend = reply('You cannot hold any position from Friday to Monday.', 'Can I hold positions from Friday to Monday?');
  assert.strictEqual(weekend.body, guard.HEDGES.en);
  const weekendLock = reply(guard.BY_ID.weekend_hold.body.en, 'Can I hold positions from Friday to Monday?');
  assert.strictEqual(weekendLock.body, guard.BY_ID.weekend_hold.body.en);
  const refund = reply('MODEL there is no refund.', 'Do I get my challenge fee back?');
  assert.strictEqual(refund.body, guard.HEDGES.en);
  const refundLock = reply(guard.BY_ID.fee_refund.body.en, '');
  assert.strictEqual(refundLock.body, guard.BY_ID.fee_refund.body.en);
  const reversed = reply('Your completed payout was reversed.', '');
  assert.strictEqual(reversed.body, guard.HEDGES.en);
  const notReversed = reply(guard.BY_ID.payout_not_reversed.body.en, '');
  assert.strictEqual(notReversed.body, guard.BY_ID.payout_not_reversed.body.en);
});

test('reversal, paid-yesterday, and fee-refund claims hedge in every script unless locked', () => {
  const claims = [
    ['Your completed payout was pulled back.', 'en'],
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
    assert.strictEqual(owned.send, true, draft);
    assert.strictEqual(owned.silent, false, draft);
    assert.notStrictEqual(owned.body, draft, draft);
  }
  for (const lang of ['en', 'ur', 'hi', 'ar']) {
    for (const id of ['payout_not_reversed', 'fee_refund']) {
      const body = guard.BY_ID[id].body[lang];
      const result = reply(body, '');
      assert.strictEqual(result.body, body, id + ' ' + lang);
      assert.strictEqual(result.reason, 'locked', id + ' ' + lang);
    }
  }
});

test('catalyst erase or keep always hedges, including an empty model turn', () => {
  const questions = [
    'Does Catalyst remember yesterday earnings?',
    'Remember yesterday earnings on Catalyst.',
    'کیا کیٹالسٹ کل کی کمائی یاد رکھتا ہے؟',
    'تذكر أرباح الأمس في كاتاليست.',
  ];
  for (const question of questions) {
    const lang = guard.detectLanguage(question).lang;
    const empty = reply('', question);
    assert.strictEqual(empty.body, guard.HEDGES[lang] || guard.HEDGES.en, question);
    assert.strictEqual(empty.send, true, question);
    assert.ok(empty.body.length > 0, question);
    const ladder = reply(guard.BY_ID.catalyst_ladder.body.en, question);
    assert.strictEqual(ladder.body, guard.HEDGES[lang] || guard.HEDGES.en, question);
    assert.ok(!ladder.body.includes('$1,290'), question);
  }
  const rules = reply(guard.BY_ID.catalyst_rules.body.en, 'What is the Catalyst daily loss and profit target?');
  assert.strictEqual(rules.body, guard.BY_ID.catalyst_rules.body.en);
  assert.strictEqual(rules.reason, 'locked');
});

test('empty turns hedge and never return an empty body', () => {
  const empty = reply('', 'Hello');
  assert.strictEqual(empty.send, true);
  assert.strictEqual(empty.silent, false);
  assert.strictEqual(empty.body, guard.HEDGES.en);
  const blank = reply('   ', '');
  assert.strictEqual(blank.body, guard.HEDGES.en);
  assert.ok(blank.body.length > 0);
});

test('fixed lines use the thread language, including Roman Urdu', () => {
  const hindi = reply(guard.BY_ID.strategy_risk.body.en, 'स्ट्रैटेजी रिस्क ब्रीच पर क्या होता है?');
  assert.strictEqual(hindi.body, guard.BY_ID.strategy_risk.body.hi);
  assert.ok(!hindi.body.includes("A Strategy Risk"));
  const roman = reply(guard.BY_ID.strategy_risk.body.en, 'Aap batao strategy risk ka kya hota hai');
  assert.strictEqual(roman.body, guard.BY_ID.strategy_risk.body.roman);
  const french = reply(guard.BY_ID.strategy_risk.body.en, 'Que se passe-t-il avec le risque de strategie du compte ?');
  assert.strictEqual(french.body, guard.HEDGES.fr);
  assert.ok(!french.body.includes('A Strategy Risk'));
  const forward = reply(guard.TEAMMATE_FORWARD.en, 'क्या मेरा पेआउट हुआ?');
  assert.strictEqual(forward.body, guard.TEAMMATE_FORWARD.hi);
  assert.strictEqual(forward.reason, 'forward');
  assert.ok(!forward.body.includes("I've sent"));
  const status = reply(guard.STATUS_EN[0], 'کیا پے آؤٹ ہوا؟');
  assert.strictEqual(status.body, guard.STATUS_LINE.ur);
  assert.ok(!status.body.includes('Our team has already'));
  const englishStatus = reply(guard.STATUS_EN[2], 'Hello');
  assert.strictEqual(englishStatus.body, guard.STATUS_EN[2]);
  const englishForward = reply(guard.TEAMMATE_FORWARD.en, 'Hello');
  assert.strictEqual(englishForward.body, guard.TEAMMATE_FORWARD.en);
});

test('a defer window suppresses the forward line in every script', () => {
  const threads = [
    ['Hello', 'en'],
    ['کیا پے آؤٹ ہوا؟', 'ur'],
    ['Aap batao payout ka kya scene hai', 'roman'],
    ['क्या मेरा पेआउट हुआ?', 'hi'],
    ['هل تم السحب؟', 'ar'],
    ['Bhai yaar yeh batao', 'hinglish'],
  ];
  for (const [client, lang] of threads) {
    const result = reply(guard.TEAMMATE_FORWARD.en, client, { deferWindow: true });
    assert.strictEqual(result.send, false, lang);
    assert.strictEqual(result.suppressed, true, lang);
    assert.strictEqual(result.silent, false, lang);
    assert.ok(result.body && result.body.length > 0, lang);
    assert.notStrictEqual(result.body, guard.TEAMMATE_FORWARD.en, lang);
    const again = reply(guard.TEAMMATE_FORWARD[lang] || guard.TEAMMATE_FORWARD.en, client, {
      state: { escalateAwaitingFirstTeammate: true },
    });
    assert.strictEqual(again.send, false, lang + ' awaiting');
    assert.strictEqual(again.suppressed, true, lang + ' awaiting');
  }
  const now = 1_700_000_000;
  const open = reply('Open the dashboard and choose the login page.', 'How do I log in?', {
    state: { deferredRelatedReply: { at: now - 30 } },
    nowSec: now,
  });
  assert.strictEqual(open.send, false);
  assert.strictEqual(open.suppressed, true);
  const matured = reply(guard.TEAMMATE_FORWARD.en, 'Hello', {
    state: { deferredRelatedReply: { at: now - 601 } },
    nowSec: now,
  });
  assert.strictEqual(matured.send, true);
  assert.strictEqual(matured.body, guard.TEAMMATE_FORWARD.en);
  const urduBypass = reply('فنڈڈ اکاؤنٹ پر اسٹریٹیجی رسک کی خلاف ورزی اکاؤنٹ بند کر دیتی ہے۔', 'فنڈڈ اکاؤنٹ پر اسٹریٹیجی رسک', {
    deferWindow: true,
  });
  assert.strictEqual(urduBypass.send, false);
  assert.strictEqual(urduBypass.suppressed, true);
});

test('ordinary replies pass untouched, including on a payout question', () => {
  const samples = [
    ['Open the dashboard and choose the login page.', 'What is the crypto fee?'],
    ['Use the reset link in the email.', 'How do I reset my password?'],
    ['You can pay with crypto at checkout.', 'Can I pay with crypto?'],
    ['Download MT5 from the site.', 'How do I install MT5?'],
    ['The refund button is under the billing tab.', 'Where is the refund button?'],
    ['Hello, your login is ready.', 'Hello, how are you?'],
    ['Remember your password before you sign in.', 'How do I reset my password?'],
  ];
  for (const [draft, client] of samples) {
    const result = reply(draft, client);
    assert.strictEqual(result.reason, 'pass_through', draft);
    assert.strictEqual(result.body, draft, draft);
    assert.strictEqual(result.replaced, false, draft);
    assert.notStrictEqual(result.body, guard.HEDGES.en, draft);
    assert.notStrictEqual(result.body, guard.TEAMMATE_FORWARD.en, draft);
  }
});

test('faq regression harness matches the luna-current baseline with 0 diffs', () => {
  function baselineFaqBody(text) {
    return text;
  }
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
    'Check the {thing} history after you sign in.',
    'The {thing} control is on the left side of the screen.',
  ];
  const things = [
    'login', 'password', 'MT5 terminal', 'KYC selfie', 'email inbox', 'browser',
    'dashboard', 'settings', 'profile', 'ticket', 'platform', 'chart',
    'notification', 'two-factor', 'server', 'history', 'statement', 'device',
    'session', 'theme',
  ];
  const replies = [];
  for (const action of actions) {
    for (const thing of things) replies.push(action.replace('{thing}', thing));
  }
  replies.push(
    'Dashboard kholo aur login page dekho.',
    'اپنا لاگ ان صفحہ کھولیں۔',
    'डैशबोर्ड खोलकर लॉगिन पेज देखें।',
    'افتح صفحة تسجيل الدخول من لوحة التحكم.',
    'Refresh karke inbox dobara dekho.'
  );
  assert.ok(replies.length >= 200, String(replies.length));
  let diffs = 0;
  for (const text of replies) {
    const baseline = baselineFaqBody(text);
    const guarded = reply(text, 'How do I do this?');
    if (guarded.body !== baseline || guarded.reason !== 'pass_through') diffs += 1;
  }
  console.log('faq-baseline-diffs', diffs, '/', replies.length);
  assert.strictEqual(diffs, 0);
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

test('proposed diff is the final stage and suppresses defer sends', () => {
  const diffPath = path.join(__dirname, 'index.js.public-sends.diff');
  const diff = fs.readFileSync(diffPath, 'utf8');
  assert.ok(diff.startsWith('diff --git a/luna-current/01_runtime/index.js b/luna-current/01_runtime/index.js\n'));
  assert.ok(diff.includes('t800-payout-r17/payoutClaimGuard'));
  assert.ok(diff.includes('payoutGuardPublicBody'));
  assert.ok(diff.includes('payout.suppressed'));
  assert.ok(diff.includes('if (finalBody == null) return null;'));
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
  assert.ok(diff.includes('finalBody = payoutGuardPublicBody(finalBody, parts, latestClientText, conversationId)'));
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
  const postgate = diff.split(/^@@/m).find((hunk) => hunk.includes('POSTGATE_SUPPRESSED'));
  assert.ok(postgate);
  assert.ok(postgate.includes('} else {'));
  const postgateAdded = postgate.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
  assert.ok(!postgateAdded.some((line) => line.includes('return null')));
  assert.ok(!postgate.includes('else return null'));
  assert.ok(!postgate.includes('payoutBody !== finalBody'));
  const root = path.resolve(__dirname, '../../..');
  execFileSync('git', ['apply', '--check', diffPath], { cwd: root, stdio: 'pipe' });
});

test('r13 through r16 author suites still pass', () => {
  for (const lane of ['t800-payout-r13', 't800-payout-r14', 't800-payout-r15', 't800-payout-r16']) {
    const file = path.resolve(__dirname, '../', lane, 'payoutClaimGuard.test.js');
    execFileSync(process.execPath, [file], { stdio: 'pipe' });
    console.log('ok suite', lane);
  }
});

console.log('t800-payout-r17', passed, 'passed');
