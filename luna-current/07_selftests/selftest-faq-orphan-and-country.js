'use strict';
/**
 * selftest-faq-orphan-and-country.js
 * Regression lock for two FAQ retrieval defects found by the QA audit (2026-09-19,
 * scenario CALC-02-2step-dll-dollars, where Luna told a 2-Step client the daily loss
 * limit was 3% / $1,500 instead of 5% / $2,500).
 *
 * A) parseArticles() splits on every "### ", so a sub-heading inside an article became a
 *    standalone, product-less article. Catalyst's "### Daily loss limit" (3%) was served as
 *    a generic "Daily loss limit" fact, and each product's "Daily and Max loss limits:"
 *    section lost the product from its title. Sub-sections must inherit the parent title.
 * B) isCountryEligibilityAsk() matched "can I lose in one day before I breach?" via its
 *    "<verb> ... in <words>" pattern, forcing Restricted Countries to the top (+50) and
 *    pushing the real loss-limit article out of the results.
 */
const assert = require('assert');
const kb = require('./faq-kb');

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('PASS', name); }
  catch (e) { console.error('FAIL', name, e && e.message); process.exitCode = 1; }
}
const titlesOf = async (q) => {
  const r = await kb.retrieveOfficialFaqContext(q);
  return ((r && r.block) || '').split('\n').filter((l) => l.startsWith('TITLE:')).map((l) => l.slice(7).trim());
};

(async () => {
  // --- A) orphaned sub-sections must carry their product ---
  await check('A1 no product-less "Daily loss limit" article exists', () => {
    const bare = kb.getArticles().filter((a) => /^daily loss limit$/i.test(a.title));
    assert.strictEqual(bare.length, 0, 'found product-less article(s) titled "Daily loss limit"');
  });

  await check('A2 no bare "Daily and Max loss limits:" articles (4 products share that heading)', () => {
    const bare = kb.getArticles().filter((a) => /^daily and max loss limits:?$/i.test(a.title));
    assert.strictEqual(bare.length, 0, `found ${bare.length} product-less loss-limit articles`);
  });

  await check('A3 the Catalyst 3% daily loss text stays attributed to Catalyst', () => {
    const hit = kb.getArticles().find((a) => /daily loss limit is 3%/i.test(a.searchText || a.body || ''));
    assert.ok(hit, 'article containing the 3% text not found');
    assert.ok(/catalyst/i.test(hit.title), `3% text is under an unattributed title: "${hit.title}"`);
  });

  // --- B) a loss question must not be treated as a country-eligibility ask ---
  await check('B1 "how much can I lose in one day" does not retrieve Restricted Countries first', async () => {
    const t = await titlesOf('My 2-step account is 50k. How much can I lose in one day before I breach?');
    assert.notStrictEqual(t[0], 'Restricted Countries', 'country boost fired on a loss-limit question');
  });

  await check('B2 the 2-Step loss-limit article is retrieved for that question', async () => {
    const t = await titlesOf('My 2-step account is 50k. How much can I lose in one day before I breach?');
    assert.ok(t.some((x) => /2-step/i.test(x) && /loss/i.test(x)), 'no 2-Step loss-limit article in: ' + t.join(' | '));
  });

  // --- B negative controls: real country asks must still work ---
  await check('B3 "can I trade from Pakistan?" still retrieves Restricted Countries first', async () => {
    const t = await titlesOf('can I trade from Pakistan?');
    assert.strictEqual(t[0], 'Restricted Countries');
  });

  await check('B4 "I live in the USA, can I open an MT5 account?" still retrieves Restricted Countries first', async () => {
    const t = await titlesOf('I live in the USA. Can I open an MT5 account with you?');
    assert.strictEqual(t[0], 'Restricted Countries');
  });

  console.log(passed === 7 && process.exitCode !== 1 ? `ALL PASS ${passed}` : `RESULT: FAIL (${passed} passed)`);
})();
