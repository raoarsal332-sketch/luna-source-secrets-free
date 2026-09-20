'use strict';
/**
 * Lock-harden smoke: intercom-mail email reject, MT5 strip, soft image asks.
 */
const fs = require('fs');
const assert = require('assert');
const path = '/home/ubuntu';

let fails = 0;
function check(name, fn) {
  try {
    fn();
    console.log('PASS:', name);
  } catch (e) {
    fails++;
    console.error('FAIL:', name, e && e.message);
  }
}

// --- Extract isUsableClientEmail + postProcess core from index.js (no server start) ---
const src = fs.readFileSync(path + '/index.js', 'utf8');

check('engine id lock-harden', () => {
  assert.ok(/fresh-2026-09-16-/.test(src));
  assert.ok(!/LUNA_PRESEND_MODE\s*=\s*['"]enforce['"]/.test(src));
});

const emailStart = src.indexOf('function isUsableClientEmail(email)');
const emailEnd = src.indexOf('\nfunction collectEscalateIds', emailStart);
assert.ok(emailStart > 0 && emailEnd > emailStart, 'locate isUsableClientEmail');
const emailFn = src.slice(emailStart, emailEnd);
const emailBox = {};
Function(emailFn + '\nthis.isUsableClientEmail = isUsableClientEmail;').call(emailBox);

check('reject intercom-mail subdomain', () => {
  assert.strictEqual(
    emailBox.isUsableClientEmail('shahid.fundedelite@fundedelite.intercom-mail.com'),
    false
  );
});
check('reject bare intercom-mail', () => {
  assert.strictEqual(emailBox.isUsableClientEmail('x@intercom-mail.com'), false);
});
check('reject intercom.io', () => {
  assert.strictEqual(emailBox.isUsableClientEmail('team@intercom.io'), false);
});
check('reject fundedelite.com', () => {
  assert.strictEqual(emailBox.isUsableClientEmail('support@fundedelite.com'), false);
});
check('accept real gmail', () => {
  assert.strictEqual(emailBox.isUsableClientEmail('client.real@gmail.com'), true);
});

// Minimal postProcess core (steps 4 + 4b) without softEdges/server deps
function postProcessCore(rawText) {
  let text = String(rawText || '');
  text = text.replace(/\u2014/g, ',').replace(/\u2013/g, '-');
  if (!/TEST SPREAD ACCOUNT DETAILS/i.test(text)) {
    text = text.replace(/MetaTrader\s*5/gi, 'the trading platform');
    text = text.replace(/\bMT5\b/gi, 'the trading platform');
  }
  return text.trim();
}

check('MT5 stripped from client reply', () => {
  const out = postProcessCore('Please reinstall MT5 and reopen MetaTrader 5.');
  assert.ok(!/\bMT5\b/i.test(out), out);
  assert.ok(!/MetaTrader\s*5/i.test(out), out);
  assert.ok(/trading platform/i.test(out), out);
});

check('spread template MT5 preserved', () => {
  const spread =
    'TEST SPREAD ACCOUNT DETAILS – For MT5 Testing on our new FundedElite server\n\n' +
    'Platform: MetaTrader 5\n' +
    'Server: Fundedelite-Server\n' +
    'Account Number: 55188\n' +
    'Password: QBG5FetfozKz7^a?J!\n\n' +
    'Use this account to check spreads.';
  const out = postProcessCore(spread);
  assert.ok(/TEST SPREAD ACCOUNT DETAILS/i.test(out));
  assert.ok(/\bMT5\b/.test(out) || /MetaTrader 5/.test(out), out);
  assert.ok(/55188/.test(out));
  assert.ok(/QBG5FetfozKz7\^a\?J!/.test(out));
});

check('REVIEW_STATUS strings have no em dash', () => {
  const m = src.match(/const REVIEW_STATUS_DIRECT_REPLIES = \[([\s\S]*?)\];/);
  assert.ok(m, 'array found');
  assert.ok(!/\u2014/.test(m[1]), 'no em dash in variants');
});

check('canned paths wrap postProcess', () => {
  assert.ok(src.includes('postProcessModelReply(pickReviewStatusDirectReply()'));
  assert.ok(src.includes('postProcessModelReply(SPREAD_TEST_REPLY'));
  assert.ok(src.includes('postProcessModelReply(lockedFinHandoffWelcome'));
});

// Image soft asks
const g = require(path + '/imageAskGuard.js');
check('soft ask: Can I get a screenshot? → GENERIC', () => {
  assert.strictEqual(g.classifyReply('Can I get a screenshot?'), 'GENERIC_IMAGE_ASK');
});
check('soft ask: screenshot please → GENERIC', () => {
  assert.strictEqual(g.classifyReply('screenshot please'), 'GENERIC_IMAGE_ASK');
});
check('soft ask: Mind sending a screenshot? → GENERIC', () => {
  assert.strictEqual(g.classifyReply('Mind sending a screenshot?'), 'GENERIC_IMAGE_ASK');
});
check('soft ask: please send a screenshot → GENERIC', () => {
  assert.strictEqual(g.classifyReply('please send a screenshot'), 'GENERIC_IMAGE_ASK');
});
check('specific crop still SPECIFIC', () => {
  assert.strictEqual(
    g.classifyReply('Could you please crop the error banner in the screenshot?'),
    'SPECIFIC_IMAGE_ASK'
  );
});
check('hasRecentImage blocks soft generic', () => {
  const id = 'lock-harden-selftest-' + Date.now();
  g.hookC(id, [{ url: 'https://example.com/x.png', content_type: 'image/png' }], 1);
  const r = g.filterOutboundReply(id, 'Can I get a screenshot?');
  assert.strictEqual(r.blocked, true, JSON.stringify(r));
  assert.ok(/already have the screenshot/i.test(r.text), r.text);
});
check('hasRecentImage allows one specific clarification', () => {
  const id = 'lock-harden-selftest-spec-' + Date.now();
  g.hookC(id, [{ url: 'https://example.com/y.png', content_type: 'image/png' }], 1);
  const r = g.filterOutboundReply(id, 'Could you please crop the error banner in the screenshot?');
  assert.strictEqual(r.blocked, false, JSON.stringify(r));
  assert.strictEqual(r.kind, 'SPECIFIC_IMAGE_ASK');
});

// identityEscalateGates shared filter
const idg = require(path + '/identityEscalateGates.js');
check('gates export isUsableClientEmail', () => {
  assert.strictEqual(typeof idg.isUsableClientEmail, 'function');
  assert.strictEqual(
    idg.isUsableClientEmail('shahid.fundedelite@fundedelite.intercom-mail.com'),
    false
  );
  assert.strictEqual(idg.isUsableClientEmail('ok@gmail.com'), true);
});
check('gates collectEscalateIds skips intercom-mail', () => {
  const ids = idg.collectEscalateIds([
    'my email is shahid.fundedelite@fundedelite.intercom-mail.com and also real.client@gmail.com account 71238',
  ]);
  assert.strictEqual(ids.email, 'real.client@gmail.com', JSON.stringify(ids));
  assert.ok(ids.hasEmail);
});

if (fails) {
  console.error('\n' + fails + ' failure(s)');
  process.exit(1);
}
console.log('\nALL PASS selftest-lock-harden');
