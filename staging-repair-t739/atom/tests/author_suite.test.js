'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { runAll, summarize } = require('./author_suite');

let rowsP;
const rows = () => (rowsP = rowsP || runAll());

const GATING_SETS = [
  'kb', 'controls', 'money-confusion', 'unresolved', 'discriminate', 'account-specific', 'multi-turn',
  'unicode', 'non-english', 'gating', 'robustness', 'probes-novel', 'fee-sweep', 'mixed-sweep',
];

for (const set of GATING_SETS) {
  test('author set: ' + set, async () => {
    const r = (await rows()).filter((x) => x.set === set);
    assert.ok(r.length > 0, 'set has cases');
    const fails = r.filter((x) => !x.pass);
    assert.deepStrictEqual(fails.map((f) => f.id + ' ' + JSON.stringify(f.text) + ' => ' + f.why), []);
  });
}

test('zero sendable leaks on every deny-class set', async () => {
  const r = (await rows()).filter((x) => x.leak);
  assert.deepStrictEqual(r.map((x) => x.id), []);
});

test('no abstain/clarify/handoff result ever carries an answerId', async () => {
  const bad = (await rows()).filter((x) => /abstain-carries-answerId/.test(x.why));
  assert.deepStrictEqual(bad, []);
});

test('false refusals on general questions are reported, not gated', async () => {
  const g = (await rows()).filter((x) => x.set === 'general');
  const fr = g.filter((x) => x.falseRefusal);
  console.log('# general: total=%d falseRefusals=%d -> %j', g.length, fr.length, fr.map((x) => x.id + ':' + x.why));
  assert.ok(g.length === 45);
});

test('wrapper stability is informational', async () => {
  const w = (await rows()).filter((x) => x.info);
  console.log('# wrapper-stability: total=%d unchanged=%d', w.length, w.filter((x) => x.pass).length);
  assert.ok(w.length > 0);
});

test('summary', async () => {
  console.log('# ' + JSON.stringify(summarize(await rows())));
});
