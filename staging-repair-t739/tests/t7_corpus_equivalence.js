'use strict';
/**
 * Runs the Packs and Atom authors' own corpora through the integrated interface (shared gate +
 * adapter options) and compares with the result under each author's own English gate.
 *   - gate English  -> the module result must be identical (the adapter changes no selector logic)
 *   - gate not English / uncertain -> the module must abstain (fail closed)
 * The number of author cases the shared gate withholds (short asks without English evidence) is
 * reported as an observation: that is the price of the language gate, not a selector defect.
 */
const assert = require('assert');
const path = require('path');
const E = require('./env');
const { test, run } = require('./runner');

if (E.which !== 'candidate') {
  test('baseline has no Packs/Atom modules', () => assert.throws(() => require(path.join(E.t.dir, 'atom', 'atomAnswerSelect'))));
  run('corpus equivalence (baseline)');
  return;
}
const sel = require(path.join(E.t.dir, 'faqAnswerSelect'));
const adapter = require(path.join(E.t.dir, 'faqModuleAdapter'));
const packs = require(path.join(E.t.dir, 'packs', 'packsAnswerSelect'));
const atom = require(path.join(E.t.dir, 'atom', 'atomAnswerSelect'));
const PC = require(path.join(E.root, 'packs', 'tests', 'cases'));
const AG = require(path.join(E.root, 'atom', 'tests', 'cases', 'general'));
const AC = require(path.join(E.root, 'atom', 'tests', 'cases', 'controls'));

const PACKS_EN = { language: 'en', confident: true, allowsAnswer: true };
const norm = (r) => JSON.stringify({ a: r.abstain, id: r.answerId, why: r.reason, act: r.action });

async function corpus(label, items, authorRun, integratedRun) {
  const tally = { total: 0, en: 0, withheld: 0, nonEn: 0, equal: 0 };
  const diffs = [];
  for (const q of items) {
    tally.total++;
    const g = sel.languageGate(q, []);
    const a = await authorRun(q);
    const b = await integratedRun(q, g);
    if (g.lang === 'en') {
      tally.en++;
      if (norm(a) === norm(b)) tally.equal++;
      else diffs.push([q, norm(a), norm(b)]);
    } else {
      if (g.lang === 'uncertain') tally.withheld++;
      else tally.nonEn++;
      assert.strictEqual(b.abstain, true, label + ' not-English/uncertain gate must abstain: ' + q);
    }
  }
  assert.deepStrictEqual(diffs, [], label + ' result differs under the shared gate');
  E.h.say('OBS|corpus|' + label + '|' + JSON.stringify(tally));
}

const flat = (x) => (Array.isArray(x) ? x.flatMap(flat) : typeof x === 'string' ? [x] : x && x.q ? flat(x.q) : []);
const packsAll = [];
for (const k of Object.keys(PC)) if (typeof PC[k] !== 'string' && k !== 'MULTI_TURN') for (const it of PC[k]) packsAll.push(...flat(it && it.q ? it.q : it));

test('Packs author corpus (all single-turn categories): identical to the author-gate result whenever the shared gate says English; abstain otherwise', async () => {
  await corpus('packs', packsAll,
    (q) => packs.selectPacksAnswer(q, { packsEnabled: true, languageGate: PACKS_EN, forcePacks: true }),
    (q, g) => packs.selectPacksAnswer(q, { ...adapter.packsOptions(g, { enabled: true }), forcePacks: true }));
});
test('Atom author corpus (general + control questions): identical whenever the shared gate says English; abstain otherwise', async () => {
  const items = AG.map((g) => g[1]);
  for (const id of Object.keys(AC)) items.push(...AC[id]);
  await corpus('atom', items,
    (q) => atom.selectAtomAnswer(q, { enabled: true, languageGate: { lang: 'en' } }),
    (q, g) => atom.selectAtomAnswer(q, adapter.atomOptions(g, { enabled: true })));
});
test('Packs/Atom copies in candidate/ keep author bodies; selectors export claim and decide', () => {
  const fs = require('fs');
  const same = (a, b) => assert.ok(fs.readFileSync(a).equals(fs.readFileSync(b)), a);
  // Design line 157: one router asks both modules for a claim.
  // Design line 1107: bodies, ids, and sendability do not change.
  // Design line 1111: each module exports claim and decide.
  // The two selector files re-export those functions for loadOwnerModule.
  // They are not byte-identical to the pre-contract copies. The catalog
  // files that carry bodies, ids, and sendability stay byte-identical.
  // atomApprovedAnswers.js differs only by resolveDefaultPath(), which loads
  // the beside JSON. That is not a body, id, or sendability change (line 1107).
  for (const f of ['packsApprovedAnswers.js', 'packsOwnershipPregate.js', 'faq-approved-answers-packs-v1.json']) same(path.join(E.root, 'candidate', 'packs', f), path.join(E.root, 'packs', f));
  for (const f of ['atomMoneyFrame.js', 'atomAnswerScope.js', 'faq-approved-answers-atom-v1.json']) same(path.join(E.root, 'candidate', 'atom', f), path.join(E.root, 'atom', f));
  const sendability = (p) => (fs.readFileSync(p, 'utf8').match(/NON_SENDABLE_STATUS = new Set\(\[[^\]]+\]\)/) || [''])[0];
  assert.strictEqual(sendability(path.join(E.root, 'candidate', 'atom', 'atomApprovedAnswers.js')), sendability(path.join(E.root, 'atom', 'atomApprovedAnswers.js')));
  const packsSel = require(path.join(E.t.dir, 'packs', 'packsAnswerSelect'));
  const atomSel = require(path.join(E.t.dir, 'atom', 'atomAnswerSelect'));
  assert.strictEqual(typeof packsSel.claim, 'function');
  assert.strictEqual(typeof packsSel.decide, 'function');
  assert.strictEqual(typeof atomSel.claim, 'function');
  assert.strictEqual(typeof atomSel.decide, 'function');
});
test('F1 exposure over the authors\' own questions (flags OFF, unowned, single turn): how many are terminal-silent, how many are left to the legacy path and why', async () => {
  const faq = E.T.faqAssistance;
  const items = packsAll.concat(AG.map((g) => g[1]));
  for (const id of Object.keys(AC)) items.push(...AC[id]);
  const tally = {};
  const examples = {};
  for (const q of items) {
    const c = E.newConv(q);
    const p = await faq.prepare(c.full, c.full.conversation_parts.conversation_parts, 'conversation.user.replied', { ...E.T.faqAssistanceDeps() });
    const k = (p.terminal ? 'T:' : 'N:') + p.reason;
    tally[k] = (tally[k] || 0) + 1;
    (examples[k] = examples[k] || []).length < 3 && examples[k].push(q);
  }
  E.h.say('OBS|f1-exposure|total=' + items.length + '|' + JSON.stringify(tally));
  E.h.say('OBS|f1-exposure-examples|' + JSON.stringify(examples));
  assert.strictEqual(E.fake.writes().length, 0);
});
test('credential detector over every catalog body (V12, Packs, Atom): no approved body is held, so a catalog-sourced FAQ send cannot carry a pair', () => {
  const fs = require('fs');
  const H = require(path.join(E.t.dir, 'publicCredentialHold'));
  let n = 0;
  for (const f of ['faq-approved-answers-v12.json', 'packs/faq-approved-answers-packs-v1.json', 'atom/faq-approved-answers-atom-v1.json']) {
    const j = JSON.parse(fs.readFileSync(path.join(E.t.dir, f), 'utf8'));
    const rows = Array.isArray(j) ? j : j.answers || j.rows || Object.values(j).find(Array.isArray) || [];
    for (const r of rows) {
      if (!r || typeof r.body !== 'string') continue;
      n++;
      assert.strictEqual(H.inspect(r.body).hold, false, f + ' ' + (r.id || r.answer_id));
    }
  }
  E.h.say('OBS|catalog-bodies-scanned|' + n);
  assert.ok(n >= 400);
});
test('no egress attempt was made', () => assert.strictEqual(E.h.net.attempts.length, 0));
run('corpus equivalence (candidate)');
