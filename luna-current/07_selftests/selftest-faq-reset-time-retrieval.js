'use strict';
/**
 * selftest-faq-reset-time-retrieval.js
 * Regression lock for QA audit finding D-5 (2026-09-19): "What time does my daily loss
 * limit reset?" retrieved the generic "Daily loss limit" article but not "What time is
 * the dashboard clock based on?" (4 pm ET / 21:00 UTC), so Luna said the time was not in
 * the FAQ. A clock/reset-time ask must surface the clock article; unrelated asks must not.
 */
const assert = require('assert');
const kb = require('./faq-kb');

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('PASS', name); }
  catch (e) { console.error('FAIL', name, e && e.message); process.exitCode = 1; }
}
const CLOCK = /dashboard clock/i;
const titles = async (q) => {
  const r = await kb.retrieveOfficialFaqContext(q);
  return ((r && r.block) || '').split('\n').filter((l) => l.startsWith('TITLE:')).join(' | ');
};

(async () => {
  await check('"what time does my daily loss limit reset" surfaces the clock article', async () => {
    assert.ok(CLOCK.test(await titles('What time does my daily loss limit reset?')));
  });
  await check('"when does the daily drawdown reset" surfaces the clock article', async () => {
    assert.ok(CLOCK.test(await titles('when does the daily drawdown reset?')));
  });
  await check('"what timezone is the dashboard" surfaces the clock article', async () => {
    assert.ok(CLOCK.test(await titles('what timezone is the dashboard on')));
  });
  await check('plain daily loss limit % ask does NOT pull the clock article', async () => {
    assert.ok(!CLOCK.test(await titles('What is the daily loss limit on Instant?')));
  });
  await check('account reset fee ask does NOT pull the clock article', async () => {
    assert.ok(!CLOCK.test(await titles('how much does an account reset cost after a breach?')));
  });
  console.log(passed === 5 && process.exitCode !== 1 ? `ALL PASS ${passed}` : `RESULT: FAIL (${passed} passed)`);
})();
