'use strict';
/**
 * Retrieval boosts for luna-reasoning-bench-20260922 misses.
 * Uses the local FAQ markdown only (no live Intercom / no production writes).
 */
process.env.FUNDEDELITE_FAQ_PATH = require('path').join(__dirname, 'fundedelite-faqs.md');

const assert = require('assert');
const kb = require('./faq-kb');
kb.reloadFaqKb();

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('PASS', name);
  } catch (e) {
    console.error('FAIL', name, e && e.message);
    process.exitCode = 1;
  }
}

const titles = async (q) => {
  const r = await kb.retrieveOfficialFaqContext(q, { live: false });
  return ((r && r.block) || '').split('\n').filter((l) => l.startsWith('TITLE:')).join(' | ');
};

(async () => {
  await check('R001/R086: 300k + consistency surfaces Additional info for 300K', async () => {
    const t = await titles(
      '300k Instant Elite still 25 percent consistency only, no extra overlay?'
    );
    assert.ok(/additional info for 300k/i.test(t), t);
  });
  await check('R001 wording: 350k extra consistency at 300k plus', async () => {
    const t = await titles(
      'I want the 350k instant size. Is that Instant or Instant Elite, and what extra consistency applies at 300k plus?'
    );
    assert.ok(/additional info for 300k/i.test(t), t);
  });
  await check('R171: 300k minimum trading days surfaces 300K overlay', async () => {
    const t = await titles('On any 300k challenge, is the minimum trading day count still 3?');
    assert.ok(/additional info for 300k/i.test(t), t);
  });
  await check('R176: live account after pass surfaces 72-hour article', async () => {
    const t = await titles(
      'I passed a 1 step free retry today. How long until the live account, business hours rule?'
    );
    assert.ok(/receive the next account after passing/i.test(t), t);
  });
  await check('R149: fail Instant + buy another same day surfaces Account Rolling', async () => {
    const t = await titles(
      'If I fail Instant can I immediately buy another Instant and keep going the same day?'
    );
    assert.ok(/account rolling/i.test(t), t);
  });
  await check('R042: USDT 800 cycle surfaces payouts process / limitations', async () => {
    const t = await titles('Can I take 800 USD of this cycle entirely as USDT?');
    assert.ok(/payouts process|payout limitations/i.test(t), t);
  });
  await check('R175: lost email challenge login surfaces Trading credentials', async () => {
    const t = await titles('Where can I see challenge login after I lost the email? General process only.');
    assert.ok(/trading credentials/i.test(t), t);
  });
  await check('R056: news lottery whole profit surfaces Gambling', async () => {
    const t = await titles('I passed the whole Instant profit in one news lottery trade. Soft or hard?');
    assert.ok(/gambling/i.test(t), t);
  });
  await check('neighbor: plain Instant daily loss does NOT force 300K overlay', async () => {
    const t = await titles('What is the daily loss limit on Instant?');
    assert.ok(!/additional info for 300k/i.test(t), t);
  });
  await check('clock regression still holds after new boosts', async () => {
    const t = await titles('What time does my daily loss limit reset?');
    assert.ok(/dashboard clock/i.test(t), t);
  });

  console.log(
    passed === 10 && process.exitCode !== 1
      ? `ALL PASS ${passed}`
      : `RESULT: FAIL (${passed} passed)`
  );
})();
