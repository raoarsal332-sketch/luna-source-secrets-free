'use strict';
/* Dev-set lock for the T801 structural claim gate. Not the held-out evaluation. */
const assert = require('assert');
const G = require('./handoffClaimGate.js');
const DEV = require('./dev_set.js');
let pass = 0;
let fail = 0;
function check(kind, item) {
  const got = G.hasHandoffClaim(item.text);
  const want = kind === 'positive';
  try {
    assert.strictEqual(got, want);
    pass++;
  } catch (e) {
    fail++;
    console.log('FAIL', kind, item.lang, JSON.stringify(item.text), 'got', got);
  }
}
for (const item of DEV.positive) check('positive', item);
for (const item of DEV.negative) check('negative', item);
console.log('DEV pass=' + pass + ' fail=' + fail + ' pos=' + DEV.positive.length + ' neg=' + DEV.negative.length);
process.exit(fail ? 1 : 0);
