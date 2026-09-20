'use strict';
const assert = require('assert');
const se = require('./softEdges');
const id = require('./identityEscalateGates');

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('PASS', name);
  } catch (e) {
    console.error('FAIL', name, e && e.message);
    process.exitCode = 1;
  }
}

// --- Soft edge 1: promo + plan-diff ---
check('1a plan-diff only → not promo short-circuit', () => {
  const c = se.classifyPromoPlanMix('difference between lite and standard?');
  assert.strictEqual(c.planDiff, true);
  assert.strictEqual(c.promoSignal, false);
  assert.strictEqual(c.shortCircuit, null);
  assert.strictEqual(se.shouldBypassPromoShortCircuit('difference between lite and standard?').bypass, true);
});

check('1b history plan-diff then "2 step" → not promo', () => {
  const c = se.classifyPromoPlanMix('2 step', [
    { role: 'user', content: 'difference between lite and standard?' },
  ]);
  assert.strictEqual(c.planDiff, true);
  assert.notStrictEqual(c.shortCircuit, 'promo');
});

check('1c mixed plan-diff + discount → not pure SEP35 short-circuit', () => {
  const c = se.classifyPromoPlanMix(
    'difference between lite and standard and any discount?'
  );
  assert.strictEqual(c.mixed, true);
  assert.strictEqual(c.shortCircuit, null);
  assert.ok(c.systemHint && /MIXED ASK/i.test(c.systemHint));
});

check('1d SEP35 on 2 step lite → promo OK', () => {
  const c = se.classifyPromoPlanMix('SEP35 on 2 step lite?');
  assert.strictEqual(c.promoSignal, true);
  assert.strictEqual(c.planDiff, false);
  assert.strictEqual(c.shortCircuit, 'promo');
});

check('1e never treat canned bulk as required paste target', () => {
  assert.ok(se.BULK_CANNED_RE.test('1=35% / 2=40%'));
  assert.strictEqual(se.stripCannedBulkScript('Use 1=35%/2=40% at checkout'), 'Use at checkout');
});

// --- Soft edge 2: Fin wait phrases (full gate tests in test-fin-wait.js) ---
check('2a Italian live-agent ask detected', () => {
  assert.strictEqual(se.clientRequestedLiveAgent('Vorrei parlare con un operatore'), true);
  assert.strictEqual(se.clientRequestedLiveAgent('agente live per favore'), true);
  assert.strictEqual(se.clientRequestedLiveAgent('assistenza umana'), true);
});

check('2b Hinglish + short UI live-agent', () => {
  assert.strictEqual(se.clientRequestedLiveAgent('live agent chahiye'), true);
  assert.strictEqual(se.clientRequestedLiveAgent('human se baat'), true);
  assert.strictEqual(se.clientRequestedLiveAgent('live agent'), true);
  assert.strictEqual(se.clientRequestedLiveAgent('What is the profit target on 2-step?'), false);
});

check('2c Fin handoff phrase', () => {
  assert.strictEqual(
    se.finHandoffPhrase("I'm connecting you to a teammate who can help further."),
    true
  );
  assert.strictEqual(
    se.finHandoffPhrase('The profit target on phase 1 is 8%.'),
    false
  );
});

// --- Soft edge 3: identity (via gates module) ---
check('3a non-ask status/email wording', () => {
  assert.deepStrictEqual(
    id.detectIdentityAskFields("Your account is under review. We'll email you."),
    { account: false, email: false }
  );
});

check('3b login id / trading account asks', () => {
  assert.strictEqual(id.detectIdentityAskFields('Please share your login id').account, true);
  assert.strictEqual(
    id.detectIdentityAskFields('Please share your trading account number').account,
    true
  );
});

check('3c preSend blocks email re-ask when account known', () => {
  const r = id.preSendIdentityCheck(
    { accountNumber: '71238' },
    'Please share your registered email address please'
  );
  assert.strictEqual(r.ok, false);
});

// --- Soft edge 4: junk strip ---
check('4a English/Italian/Japanese FAQ unchanged', () => {
  const en = 'Flash Activation is Buy 1 Get 4 Free with FLASH5.';
  assert.strictEqual(se.stripOrphanScriptJunk(en).text, en);
  const it = 'La promozione FLASH5 è Buy 1, Get 4 Free.';
  assert.strictEqual(se.stripOrphanScriptJunk(it).text, it);
  const ja =
    'お問い合わせありがとうございます。FLASH5のご案内です。Buy 1 Get 4 Freeとなります。';
  assert.strictEqual(se.stripOrphanScriptJunk(ja).text, ja);
});

check('4b strip Cyrillic+CJK junk append', () => {
  const raw = 'Flash answer here.\n\nцели 北京pk赛车';
  const r = se.stripOrphanScriptJunk(raw);
  assert.strictEqual(r.stripped, true);
  assert.ok(!/цели|北京|pk赛车/.test(r.text), 'junk remains: ' + r.text);
  assert.ok(/Flash answer here/.test(r.text));
  assert.strictEqual(r.skipSend, false);
});

check('4c full JA reply kept', () => {
  const ja = 'お問い合わせありがとうございます。詳細を確認してご案内します。';
  const r = se.stripOrphanScriptJunk(ja);
  assert.strictEqual(r.stripped, false);
  assert.strictEqual(r.text, ja);
});

check('4d Trustpilot + PropFirmMatch preserved', () => {
  const body =
    '<b>Review request</b>\nPlease leave a review on https://www.trustpilot.com/review/fundedelite.com\nAlso see https://propfirmmatch.com/fundedelite';
  const r = se.stripOrphanScriptJunk(body);
  assert.ok(/trustpilot/i.test(r.text));
  assert.ok(/propfirmmatch/i.test(r.text));
  assert.ok(/<b>Review request<\/b>/.test(r.text));
});

if (process.exitCode) {
  console.error('SOFT-EDGES SELFTEST FAILED', passed, 'passed before failure');
  process.exit(1);
}
console.log('ALL PASS', passed);
