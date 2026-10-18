'use strict';
/** Tiny sequential test runner: prints one line per test and a raw pass/fail count. */
const cases = [];
let current = '';
function test(name, fn) { cases.push({ name, fn }); }
async function run(title) {
  let pass = 0, fail = 0;
  const failures = [];
  process.stdout.write('== ' + title + '\n');
  for (const c of cases) {
    current = c.name;
    try {
      await c.fn();
      pass += 1;
      process.stdout.write('  ok   ' + c.name + '\n');
    } catch (e) {
      fail += 1;
      failures.push(c.name);
      process.stdout.write('  FAIL ' + c.name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n       ') + '\n');
    }
  }
  process.stdout.write('RESULT ' + title + ': ' + pass + ' passed, ' + fail + ' failed, ' + cases.length + ' total\n');
  process.exit(fail ? 1 : 0);
}
module.exports = { test, run };
