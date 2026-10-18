'use strict';
/* node tests/run-heldout.js [--json out.json]
 * Scores the frozen held-out file. Does not modify it. */
const path = require('path');
process.env.LUNA_PACKS_APPROVED_ANSWERS = path.join(__dirname, '..', 'faq-approved-answers-packs-v1.json');
const sel = require('../packsAnswerSelect');
const { ITEMS } = require('./heldout');

const gate = { language: 'en', confident: true, allowsAnswer: true };
const short = (id) => (id || '').replace(/^packs\./, '').replace(/\.en$/, '');
const PRODUCTISH = (id) => id && id !== 'account-status.refuse' && id !== 'handoff.unverified';

(async () => {
  const by = {};
  const fails = [];
  let correct = 0;
  let falseRefusal = 0;
  let wrong = 0;
  let leaks = 0;
  for (const item of ITEMS) {
    const r = await sel.selectPacksAnswer(item.q, { packsEnabled: true, languageGate: gate });
    const got = r.abstain ? null : short(r.answerId);
    const bucket = (by[item.kind] = by[item.kind] || { n: 0, correct: 0, falseRefusal: 0, wrong: 0, leaks: 0 });
    bucket.n += 1;
    let ok = false;
    if (item.expect === 'block') {
      ok = !got || !PRODUCTISH(got);
      if (!ok) {
        leaks += 1;
        bucket.leaks += 1;
        fails.push({ kind: item.kind, q: item.q, expect: 'block', got: got || r.reason });
      }
    } else if (item.expect === 'abstain') {
      ok = r.abstain === true && !got;
      if (!ok) fails.push({ kind: item.kind, q: item.q, expect: 'abstain', got: got || r.reason });
    } else {
      ok = got === item.expect || item.also.includes(got);
      if (!ok && (!got || !PRODUCTISH(got))) {
        falseRefusal += 1;
        bucket.falseRefusal += 1;
        fails.push({ kind: item.kind, q: item.q, expect: item.expect, got: got || r.reason, why: r.reason });
      } else if (!ok) {
        wrong += 1;
        bucket.wrong += 1;
        fails.push({ kind: item.kind, q: item.q, expect: item.expect, got, why: r.reason });
      }
    }
    if (ok) {
      correct += 1;
      bucket.correct += 1;
    }
  }
  const summary = { n: ITEMS.length, correct, falseRefusal, wrong, leaks, by, fails };
  console.log(`HELDOUT n=${summary.n} correct=${correct} falseRefusal=${falseRefusal} wrong=${wrong} leaks=${leaks}`);
  for (const [k, v] of Object.entries(by)) {
    console.log(`  ${k}: n=${v.n} correct=${v.correct} falseRefusal=${v.falseRefusal} wrong=${v.wrong} leaks=${v.leaks}`);
  }
  const jsonIdx = process.argv.indexOf('--json');
  if (jsonIdx > 0) require('fs').writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(summary, null, 2));
  if (process.argv.includes('--verbose')) {
    for (const f of fails) console.log(' MISS', f.kind, f.expect, 'got', f.got, '|', f.q);
  }
})();
