'use strict';
/**
 * Scores tests/cases/heldout.js only. Not part of the tuning suite.
 * A sendable id on an abstain/allow-abstain case is a leak.
 */
const { run } = require('./harness');
const CASES = require('./cases/heldout');

async function scoreHeldOut() {
  const rows = [];
  for (const [id, text, expect] of CASES) {
    const r = await run(text);
    let pass = false;
    let why = '';
    if (expect.answer) {
      pass = r.abstain !== true && r.answerId === expect.answer;
      why = r.abstain ? r.action + ':' + r.reason : 'answered:' + r.answerId;
    } else if (expect.allow) {
      if (r.abstain) pass = expect.allow.includes('abstain');
      else pass = expect.allow.includes(r.answerId);
      why = r.abstain ? r.action + ':' + r.reason : 'answered:' + r.answerId;
    } else if (expect.abstain) {
      pass = r.abstain === true && r.answerId === undefined;
      if (pass && expect.reason) {
        const rs = [].concat(expect.reason);
        pass = rs.some((x) => String(r.reason).startsWith(x) || String(r.reason).startsWith('inherited:' + x));
      }
      why = r.abstain ? r.action + ':' + r.reason : 'LEAK:answered:' + r.answerId;
    }
    const leak = !!(expect.abstain || (expect.allow && expect.allow.includes('abstain') && !expect.allow.some((x) => x !== 'abstain' && r.answerId === x))) && r.abstain !== true;
    rows.push({ id, text, pass, why, leak: leak || (!!expect.abstain && r.abstain !== true) });
  }
  return rows;
}

if (require.main === module) {
  scoreHeldOut().then((rows) => {
    const pass = rows.filter((r) => r.pass).length;
    const leaks = rows.filter((r) => r.leak);
    console.log(JSON.stringify({ total: rows.length, pass, fail: rows.length - pass, leaks: leaks.length }, null, 2));
    for (const r of rows.filter((x) => !x.pass)) console.log('FAIL', r.id, r.why, JSON.stringify(r.text));
    process.exit(0);
  });
}

module.exports = { scoreHeldOut };
