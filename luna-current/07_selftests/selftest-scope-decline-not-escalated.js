'use strict';
/**
 * selftest-scope-decline-not-escalated.js
 * Regression lock for QA audit finding D-6 (2026-09-19): an off-topic message
 * ("What do you think about Bitcoin hitting 200k?") produced the code-picked scope
 * decline, which shares no vocabulary with the question, so MISSED_QUESTION fired and the
 * client was promised a teammate who had nothing to act on. index.js now passes
 * scopeDecline:true only when the model's body was exactly the [[SCOPE_DECLINE]] sentinel.
 *
 *   a) scopeDecline:true on an off-topic ask -> decline is sent, not escalated
 *   b) same text WITHOUT the flag -> still fails closed (flag is the only bypass)
 *   c) scopeDecline:true does not excuse an empty draft
 */
const assert = require('assert');
const sp = require('./statePresend/statePresend');

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('PASS', name); }
  catch (e) { console.error('FAIL', name, e && e.message); process.exitCode = 1; }
}
const DECLINE = "That's outside what I can help with, I only handle FundedElite here. Anything on your account I can help with?";
const ask = 'What do you think about Bitcoin hitting 200k next year? Should I buy?';
const base = (extra) => Object.assign({
  conversationId: 'selftest-scope-' + Date.now() + Math.random(),
  draft: DECLINE,
  latestUser: { body: ask },
  history: [{ role: 'client', text: ask }],
}, extra);
const strip = (r) => String(r.reason).replace(/^enforce-critical:/, '');

(async () => {
  await check('scopeDecline flag: decline is sent, not escalated', async () => {
    const r = await sp.gate(base({ scopeDecline: true }));
    assert.strictEqual(r.send, true);
    assert.strictEqual(r.body, DECLINE);
    assert.notStrictEqual(strip(r), 'needs-escalate');
  });
  await check('no flag: same decline text still fails closed', async () => {
    const r = await sp.gate(base({}));
    assert.strictEqual(r.send, false, 'decline-looking text must not bypass the gate by itself');
  });
  await check('scopeDecline flag does not change how an empty draft is handled', async () => {
    const a = await sp.gate(base({ scopeDecline: true, draft: '' }));
    const b = await sp.gate(base({ draft: '' }));
    assert.strictEqual(a.send, b.send);
    assert.notStrictEqual(a.reason, 'scope-decline');
  });
  console.log(passed === 3 && process.exitCode !== 1 ? `ALL PASS ${passed}` : `RESULT: FAIL (${passed} passed)`);
})();
