'use strict';
const { runAll, summarize } = require('./author_suite');

(async () => {
  const rows = await runAll();
  const sets = summarize(rows);
  const failures = rows.filter((r) => !r.pass);
  const total = rows.length;
  const pass = rows.filter((r) => r.pass).length;
  const json = process.argv.includes('--json');
  if (json) {
    console.log(JSON.stringify({ total, pass, fail: total - pass, sets, failures }, null, 2));
  } else {
    console.log('set                total  pass  fail  leaks  falseRefusals');
    for (const [k, v] of Object.entries(sets)) {
      console.log(k.padEnd(18), String(v.total).padStart(5), String(v.pass).padStart(5), String(v.fail).padStart(5), String(v.leaks).padStart(6), String(v.falseRefusals).padStart(8));
    }
    console.log('TOTAL', total, 'pass', pass, 'fail', total - pass);
    for (const f of failures.slice(0, process.env.MAXFAIL ? Number(process.env.MAXFAIL) : 80)) {
      console.log('FAIL', f.set, f.id, JSON.stringify(f.text), '=>', f.why);
    }
  }
  process.exit(0);
})();
