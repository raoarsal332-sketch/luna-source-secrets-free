'use strict';
/** Compares the frozen baseline (dd3b9f79) against the corrected selector on the author sets. */
process.env.LUNA_ATOM_APPROVED_ANSWERS = require('path').join(__dirname, '..', 'faq-approved-answers-atom-v1.json');
const { loadBaseline } = require('./baseline_loader');
const { run } = require('./harness');
const A = require('./cases/adversarial');
const GEN = require('./cases/general');
const PROBES = require('./cases/probes');

(async () => {
  const base = loadBaseline();
  const deny = []
    .concat(A.moneyConfusion.map(([id, t]) => [id, t]))
    .concat(PROBES.map((t, i) => ['PR' + (i + 1), t]));
  let bLeak = 0, nLeak = 0;
  const bLeaks = [];
  for (const [id, t] of deny) {
    const b = await base.selectAtomAnswer(t, {});
    const n = await run(t);
    if (!b.abstain) { bLeak++; bLeaks.push(id + '->' + b.answerId); }
    if (!n.abstain) nLeak++;
  }
  let bFR = 0, nFR = 0, total = 0;
  for (const [id, t, kind] of GEN) {
    if (kind !== 'answer') continue;
    total++;
    const b = await base.selectAtomAnswer(t, {});
    const n = await run(t);
    if (b.abstain) bFR++;
    if (n.abstain) nFR++;
  }
  console.log(JSON.stringify({
    denyCases: deny.length,
    baselineSendableLeaks: bLeak,
    baselineLeakIds: bLeaks,
    correctedSendableLeaks: nLeak,
    generalAnswerExpected: total,
    baselineFalseRefusals: bFR,
    correctedFalseRefusals: nFR,
  }, null, 2));
})();
