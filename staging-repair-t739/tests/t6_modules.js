'use strict';
/**
 * Integration tests: shared language-gate shape, Packs/Atom detectors, F1 end to end with both
 * flags OFF (below-axios recorder), mixed turns, ON paths in an isolated test config, and the
 * language gate on the deterministic cue routes (F5).
 * Fixed model stubs test enforcement only.
 */
const assert = require('assert');
const path = require('path');
const E = require('./env');
const { test, run } = require('./runner');
const { h, T, fake, lm, reset, newConv, index } = E;

if (E.which !== 'candidate') {
  test('baseline tree has no Packs/Atom integration (module files absent)', () => {
    assert.throws(() => require(path.join(E.t.dir, 'faqModuleDetectors')));
    assert.throws(() => require(path.join(E.t.dir, 'packs', 'packsAnswerSelect')));
  });
  const bq = ['How do Elite Packs work?', 'What is Elite Atom and how does the profit split work?', 'How do Elite Packs work? Also, what is the daily loss limit for 2 step lite?',
    'What is Elite Atom? Also, did my payout get approved?'];
  function breq(id, user) {
    return { body: { topic: 'conversation.user.replied', data: { item: { id, type: 'conversation', conversation_parts: { conversation_parts: [user] }, source: fake.getConversation(id).source } } }, headers: {} };
  }
  const bres = { sendStatus() { return this; }, status() { return this; }, json() { return this; }, send() { return this; } };
  test('baseline differential for F1: the same Packs/Atom asks (flags are not a concept at baseline) reach the model path and get a public reply', async () => {
    const out = [];
    for (const q of bq) {
      reset();
      const { id, user } = newConv(q);
      lm.state.queue.push('ACTION: REPLY\nBODY: Elite Packs and Atom are great. They cost nothing.');
      await index.handleWebhook(breq(id, user), bres);
      out.push({ q, publicWrites: fake.publicWrites().length, modelCalls: lm.state.calls.length, writes: fake.writes().length });
    }
    h.say('OBS|baseline-f1|' + JSON.stringify(out));
    assert.ok(out.some((o) => o.publicWrites > 0), 'baseline never replied; differential would be vacuous');
  });
  run('modules (baseline)');
  return;
}

const sel = require(path.join(E.t.dir, 'faqAnswerSelect'));
const gates = require(path.join(E.t.dir, 'faqModuleGates'));
const adapter = require(path.join(E.t.dir, 'faqModuleAdapter'));
const detectors = require(path.join(E.t.dir, 'faqModuleDetectors'));
const packs = require(path.join(E.t.dir, 'packs', 'packsAnswerSelect'));
const atom = require(path.join(E.t.dir, 'atom', 'atomAnswerSelect'));
const faq = T.faqAssistance;
const PACKS_CASES = require(path.join(E.root, 'packs', 'tests', 'cases'));
const ATOM_GENERAL = require(path.join(E.root, 'atom', 'tests', 'cases', 'general'));
const ATOM_CONTROLS = require(path.join(E.root, 'atom', 'tests', 'cases', 'controls'));

const FLAGS = ['LUNA_PACKS_ENABLED', 'LUNA_ATOM_SELECTOR_ENABLED', 'LUNA_ATOM_ENABLED'];
const withFlags = async (env, fn) => {
  const saved = FLAGS.map((k) => [k, process.env[k]]);
  FLAGS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, env);
  try { return await fn(); } finally { saved.forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; }); }
};
const deps = () => ({ ...T.faqAssistanceDeps() });
const prep = async (text, opts) => {
  opts = opts || {};
  const c = newConv(text, opts.extra);
  if (opts.assign) Object.assign(c.full, opts.assign);
  return faq.prepare(c.full, c.full.conversation_parts.conversation_parts, 'conversation.user.replied', deps());
};
function webhookReq(id, user) {
  return { body: { topic: 'conversation.user.replied', data: { item: { id, type: 'conversation', conversation_parts: { conversation_parts: [user] }, source: fake.getConversation(id).source } } }, headers: {} };
}
const statuses = [];
const res = { sendStatus(s) { statuses.push(s); return this; }, status() { return this; }, json() { return this; }, send() { return this; } };
const EN = Object.freeze({ language: 'en', confident: true, allowsAnswer: true });

// ---------------- 1. one language-gate shape ----------------
test('G1 shared gate result is canonical for en / non-en / uncertain and carries the Packs-required fields', () => {
  const en = sel.languageGate('What are the Elite Packs?', []);
  assert.deepStrictEqual({ ...en, basis: undefined }, { lang: 'en', language: 'en', confident: true, allowsAnswer: true, basis: undefined });
  const non = sel.languageGate('cuál es el límite de pérdida diaria', []);
  assert.deepStrictEqual({ ...non, basis: undefined }, { lang: 'non-en', language: 'non-en', confident: true, allowsAnswer: false, basis: undefined });
  const unc = sel.languageGate('packs?', []);
  assert.deepStrictEqual({ ...unc, basis: undefined }, { lang: 'uncertain', language: 'unknown', confident: false, allowsAnswer: false, basis: undefined });
  for (const g of [en, non, unc]) assert.deepStrictEqual(adapter.normalizeGate(g).lang, g.lang);
});
test('G2 the canonical English gate is accepted by the real Packs and the real Atom selector (no language-gate abstain)', async () => {
  const g = sel.languageGate('How do Elite Packs work?', []);
  const p = await packs.selectPacksAnswer('How do Elite Packs work?', adapter.packsOptions(g, { enabled: true }));
  assert.strictEqual(p.abstain, false, JSON.stringify(p));
  const g2 = sel.languageGate('What is Elite Atom?', []);
  const a = await atom.selectAtomAnswer('What is Elite Atom?', adapter.atomOptions(g2, { enabled: true }));
  assert.strictEqual(a.abstain, false, JSON.stringify(a));
  assert.strictEqual(a.answerId, 'atom.overview.en');
});
test('G3 canonical uncertain and non-English gates are refused by both real selectors (language-gate reasons)', async () => {
  for (const text of ['packs?', 'cuál es el límite de pérdida diaria']) {
    const g = sel.languageGate(text, []);
    const p = await packs.selectPacksAnswer(text, adapter.packsOptions(g, { enabled: true }));
    assert.strictEqual(p.abstain, true);
    assert.match(p.reason, /^language-gate-/);
    const a = await atom.selectAtomAnswer(text, adapter.atomOptions(g, { enabled: true }));
    assert.strictEqual(a.abstain, true);
    assert.match(a.reason, /^language-gate-/);
  }
});
test('G4 adapter fails closed for absent / malformed / inconsistent gates and both selectors then abstain', async () => {
  const bad = [undefined, null, 'en', 42, [], {}, { language: 'en' }, { language: 'en', confident: true }, { language: 'en', allowsAnswer: true },
    { language: 'en', confident: 'yes', allowsAnswer: true }, { lang: 'en', language: 'es', confident: true, allowsAnswer: true },
    { language: 'en', confident: false, allowsAnswer: true }, { language: 'en', confident: true, allowsAnswer: true, mixed: true },
    { language: 'en', confident: true, allowsAnswer: true, status: 'unknown' }, { language: 'en', confident: true, allowsAnswer: false },
    { lang: 'uncertain', language: 'unknown' }, { language: '' }, { language: 5 }];
  for (const g of bad) {
    const n = adapter.normalizeGate(g);
    assert.strictEqual(n.allowsAnswer, false, JSON.stringify(g));
    assert.strictEqual(n.confident, false === n.confident ? false : n.confident && n.lang === 'non-en' ? true : false, JSON.stringify(g));
    assert.notStrictEqual(n.lang, 'en', JSON.stringify(g));
    const p = await packs.selectPacksAnswer('How do Elite Packs work?', adapter.packsOptions(g, { enabled: true }));
    assert.strictEqual(p.abstain, true, 'packs ' + JSON.stringify(g));
    const a = await atom.selectAtomAnswer('What is Elite Atom?', adapter.atomOptions(g, { enabled: true }));
    assert.strictEqual(a.abstain, true, 'atom ' + JSON.stringify(g));
  }
});
test('G5 adapter maps Packs-shaped and Atom-shaped English gates to the canonical shape', () => {
  assert.strictEqual(adapter.normalizeGate(EN).lang, 'en');
  assert.strictEqual(adapter.normalizeGate({ lang: 'en-US', confident: true, allowsAnswer: true }).allowsAnswer, true);
  assert.strictEqual(adapter.normalizeGate({ language: 'es', confident: true, allowsAnswer: false }).lang, 'non-en');
});
test('G6 modules called with no gate at all abstain (fail closed, nothing selected)', async () => {
  const p = await packs.selectPacksAnswer('How do Elite Packs work?', { packsEnabled: true });
  assert.strictEqual(p.abstain, true);
  const a = await atom.selectAtomAnswer('What is Elite Atom?', { enabled: true });
  assert.strictEqual(a.abstain, true);
  assert.strictEqual(a.reason, 'language-gate-missing');
});

// ---------------- 2. shipped detectors and flags ----------------
test('D1 both module detectors are registered by the shipped candidate, both OFF by default', async () => {
  await withFlags({}, async () => {
    const ids = gates.list().map((g) => g.id).sort();
    assert.deepStrictEqual(ids, ['atom', 'packs']);
    for (const g of gates.list()) assert.strictEqual(g.enabled(), false, g.id);
    assert.strictEqual(detectors._status().warned, false);
  });
});
test('D2 flag semantics: only 1/true/on/yes turn Packs on; Atom follows the module\'s own LUNA_ATOM_SELECTOR_ENABLED', async () => {
  const gp = gates.list().find((g) => g.id === 'packs');
  const ga = gates.list().find((g) => g.id === 'atom');
  for (const v of ['1', 'true', 'ON', 'Yes']) await withFlags({ LUNA_PACKS_ENABLED: v }, () => assert.strictEqual(gp.enabled(), true, v));
  for (const v of ['0', 'false', 'off', 'no', '', '2', 'enabled']) await withFlags({ LUNA_PACKS_ENABLED: v }, () => assert.strictEqual(gp.enabled(), false, v));
  await withFlags({ LUNA_ATOM_SELECTOR_ENABLED: '1' }, () => assert.strictEqual(ga.enabled(), true));
  await withFlags({ LUNA_ATOM_SELECTOR_ENABLED: '0' }, () => assert.strictEqual(ga.enabled(), false));
  await withFlags({ LUNA_ATOM_ENABLED: '1', LUNA_PACKS_ENABLED: undefined }, () => assert.strictEqual(ga.enabled(), false));
});
test('D3 Atom detector claims every Atom author-case question (general + controls)', () => {
  let n = 0;
  for (const g of ATOM_GENERAL) { n++; assert.ok(detectors.atomDetect(g[1], { priorClientTexts: [] }), g[1]); }
  for (const id of Object.keys(ATOM_CONTROLS)) for (const q of ATOM_CONTROLS[id]) { n++; assert.ok(detectors.atomDetect(q, { priorClientTexts: [] }), q); }
  h.say('OBS|atom-detector-claimed|' + n + '/' + n);
});
test('D4 Atom detector: follow-up in an Atom chain is claimed, a non-follow-up after an Atom mention and plain V12 asks are not', () => {
  const pri = ['Tell me about Elite Atom'];
  assert.strictEqual(detectors.atomDetect('and what about the split?', { priorClientTexts: pri }), true);
  assert.strictEqual(detectors.atomDetect('What is the daily loss limit for 2 step lite?', { priorClientTexts: pri }), false);
  assert.strictEqual(detectors.atomDetect('What is the daily loss limit for 2 step lite?', { priorClientTexts: [] }), false);
});
test('D5 Packs detector covers every phrase the real Packs selector answers by its own scope (no caller hint), plus obfuscated terms', async () => {
  const flat = (x) => (Array.isArray(x) ? x.flatMap(flat) : typeof x === 'string' ? [x] : x && x.q ? flat(x.q) : []);
  let claimed = 0, scoped = 0, byHint = 0;
  const missed = [];
  for (const k of Object.keys(PACKS_CASES)) {
    if (typeof PACKS_CASES[k] === 'string') continue;
    for (const it of PACKS_CASES[k]) for (const q of flat(it && it.q ? it.q : it)) {
      const r = await packs.selectPacksAnswer(q, { packsEnabled: true, languageGate: EN });
      const d = detectors.packsDetect(q);
      if (d) claimed++;
      if (r.reason === 'packs-cue-select' || r.reason === 'not-elite-packs') {
        scoped++;
        if (r.reason === 'packs-cue-select' && !d) missed.push(q);
        if (r.reason === 'not-elite-packs' && d) byHint++;
      }
    }
  }
  assert.deepStrictEqual(missed, []);
  h.say('OBS|packs-detector|claimed=' + claimed + ' module-scope-cases=' + scoped + ' claimed-though-module-says-not-packs=' + byHint);
  for (const q of ['What are Exo\u200Btic cards?', 'what is E l i t e P a c k s', 'What are Ｅｌｉｔｅ Ｐａｃｋｓ?']) assert.strictEqual(detectors.packsDetect(q), true, q);
});
test('D6 neither detector claims the 12 V12 questions, plain account asks or generic English', () => {
  const qs = ['Is a stop loss mandatory?', 'What is the daily loss limit for 2 step lite?', 'What is the daily loss limit for the 2 step account?',
    'What is the daily loss limit for the 1 step account?', 'How many minimum trading days for 2 step lite?', 'What is the minimum holding time for a trade?',
    'What is a soft breach?', 'Can I trade while travelling with a different IP?', 'What leverage do you offer on 2 step lite?', 'When can I request the payout?',
    'Are you a broker?', 'Do you have a free trial?', 'Is my payout approved?', 'Did I breach my account yesterday?',
    'How do I check my balance?', 'I want to buy a challenge, which one is best?', 'The weather is nice today and I like to pack my bags'];
  const sub = 'Was my subscription charged this month?';
  const packsClaim = require(path.join(E.root, '..', 'staging-repair-t742', 'packs', 'impl')).claim;
  const norm = require(path.join(E.t.dir, 'routeNormalizer')).normalizeForRoute(sub);
  assert.strictEqual(packsClaim({ text: sub, normalized: norm, prior: [] }).kind, 'shared', 'subscription is a shared selector, not an exclusive Packs claim');
  for (const q of qs) {
    if (/pack my bags/.test(q)) {
      assert.strictEqual(detectors.packsDetect(q), false, 'packs ' + q);
      assert.strictEqual(detectors.atomDetect(q, { priorClientTexts: [] }), false, 'atom ' + q);
      continue;
    }
    assert.strictEqual(detectors.packsDetect(q), false, 'packs ' + q);
    assert.strictEqual(detectors.atomDetect(q, { priorClientTexts: [] }), false, 'atom ' + q);
  }
});
test('D7 degraded detector (module file missing) falls back to a coarse word test and never throws', () => {
  const src = require('fs').readFileSync(path.join(E.t.dir, 'faqModuleDetectors.js'), 'utf8');
  assert.match(src, /FAQ_MODULE_DETECTOR_DEGRADED/);
  assert.match(src, /if \(!p\) return false/);
});

// ---------------- 3. F1 end to end, flags OFF ----------------
const PACKS_Q = ['How do Elite Packs work?', 'What is the Whale Pack and how much does it cost?', 'Do you sell pack credits right now?',
  'What are the drop rates for the Oracle Pack?'];
const ATOM_Q = ['What is Elite Atom and how does the profit split work?', 'How many minimum trading days does Atom 2-Step have?', 'Can you explain the Atom payout rules please?',
  'What leverage do I get on Elite Atom 1-Step?', 'How much does the Atom 50k account cost?'];
const noWrites = (label) => {
  assert.deepStrictEqual(fake.writes().map((r) => r.method + ' ' + r.url), [], label + ': any write (reply, note, assignment, close) was recorded');
  assert.strictEqual(lm.state.calls.length, 0, label + ': the model was called');
};
test('F1e2e: Packs and Atom English asks, unowned, flags OFF: handleWebhook records ZERO writes (no reply, note, assignment) and no model call', async () => {
  await withFlags({}, async () => {
    for (const q of PACKS_Q.concat(ATOM_Q)) {
      reset(); statuses.length = 0;
      const { id, user } = newConv(q);
      lm.state.queue.push('ACTION: REPLY\nBODY: Elite Packs and Atom are great. They cost nothing.');
      await index.handleWebhook(webhookReq(id, user), res);
      noWrites(q);
      assert.deepStrictEqual(statuses, [200], q);
      assert.ok(h.logs.some((l) => /FAQ_ASSIST/.test(l.line) && /module-off-fail-closed/.test(l.line)), 'reason not logged for ' + q);
      assert.ok(fake.requests.every((r) => r.method === 'get'), q);
    }
  });
});
test('F1e2e control: a non-module English ask is not an F1 silence, and model prose is not a public comment', async () => {
  await withFlags({}, async () => {
    reset();
    const prose = 'Yes, we offer a student discount on the challenge fee.';
    const { id, user } = newConv('Do you offer a student discount for the challenge?');
    lm.state.queue.push('ACTION: REPLY\nBODY: ' + prose);
    await index.handleWebhook(webhookReq(id, user), res);
    assert.ok(!h.logs.some((l) => /module-off-fail-closed/.test(l.line)));
    assert.ok(!JSON.stringify(fake.publicWrites()).includes(prose));
    h.say('OBS|discount-main|' + JSON.stringify({ public: fake.publicWrites().length, notes: fake.notes().length, model: lm.state.calls.length }));
  });
});
test('none-claim Instant Override stays on the main route and ordinary model prose is sent (t745)', async () => {
  await withFlags({}, async () => {
    const router = require(path.join(E.t.dir, 'publicRouter'));
    const routed = await router.route({ text: 'Can I redeem a key for Instant Override?', prior: [], conversationId: 'k', eventId: 'ek' });
    assert.strictEqual(routed.reason, 'main-route');
    assert.strictEqual(routed.mainRoute, true);
    assert.strictEqual(routed.kind, 'none');
    reset();
    const prose = 'yes you can redeem it';
    const { id, user } = newConv('Can I redeem a key for Instant Override?');
    lm.state.queue.push('ACTION: REPLY\nBODY: ' + prose);
    await index.handleWebhook(webhookReq(id, user), res);
    assert.ok(JSON.stringify(fake.publicWrites()).includes(prose));
    assert.strictEqual(fake.publicWrites().length, 1);
    h.say('OBS|instant-override|' + JSON.stringify({ public: fake.publicWrites().length, notes: fake.notes().length, model: lm.state.calls.length, writes: fake.writes().map((w) => w.data && w.data.message_type) }));
  });
});
test('F1 mixed turn: a clearly module-specific English clause + a general V12 clause is terminal silent (no partial answer)', async () => {
  await withFlags({}, async () => {
    const t = 'How do Elite Packs work? Also, what is the daily loss limit for 2 step lite?';
    const p = await prep(t);
    assert.deepStrictEqual({ r: p.reason, t: p.terminal, m: p.module }, { r: 'module-off-fail-closed', t: true, m: 'packs' });
    reset(); statuses.length = 0;
    const { id, user } = newConv(t);
    lm.state.queue.push('ACTION: REPLY\nBODY: The daily loss limit for 2 step lite is 4%.');
    await index.handleWebhook(webhookReq(id, user), res);
    noWrites('mixed packs+v12');
  });
});
test('F1 mixed turn: module clause + a backend/account clause is terminal silent too (and the order of the clauses does not matter)', async () => {
  await withFlags({}, async () => {
    for (const t of ['What is Elite Atom? Also, did my payout get approved?', 'Did my payout get approved? Also, how do Elite Packs work?', 'Is my KYC approved and what are pack credits?']) {
      reset();
      const { id, user } = newConv(t);
      lm.state.queue.push('ACTION: REPLY\nBODY: ok');
      await index.handleWebhook(webhookReq(id, user), res);
      noWrites(t);
    }
  });
});
test('F1 mixed language: an English module clause inside a turn that also contains Spanish is still claimed; a purely non-English module ask is not', async () => {
  await withFlags({}, async () => {
    const a = await prep('Hola, ¿cuál es el límite de pérdida diaria? How do Elite Packs work?');
    assert.notStrictEqual(a.reason, 'module-off-fail-closed');
    assert.notStrictEqual(a.terminal, true);
    const b = await prep('¿Qué son los Elite Packs? ¿Cuál es el límite de pérdida diaria?');
    assert.notStrictEqual(b.reason, 'module-off-fail-closed');
    const c = await prep('ایلیٹ پیکس کیا ہیں؟');
    assert.notStrictEqual(c.reason, 'module-off-fail-closed');
  });
});
test('F1-8 uncertain + claimed + flag OFF is terminal-silent (owner-reviewable default), including short English module asks', async () => {
  await withFlags({}, async () => {
    for (const t of ['Elite Packs?', 'Atom 289.']) {
      const p = await prep(t);
      assert.deepStrictEqual({ r: p.reason, t: p.terminal, m: p.module }, { r: 'language-uncertain-module-off', t: true, m: /\batom\b/i.test(t) ? 'atom' : 'packs' }, t);
      reset();
      const { id, user } = newConv(t);
      lm.state.queue.push('ACTION: REPLY\nBODY: Elite Packs are refundable and Atom needs ten days.');
      await index.handleWebhook(webhookReq(id, user), res);
      noWrites(t);
    }
    const sentence = await prep('Atom funded profitable days requirement?');
    assert.deepStrictEqual({ r: sentence.reason, t: sentence.terminal, m: sentence.module }, { r: 'module-off-fail-closed', t: true, m: 'atom' });
    const clearEn = await prep('Are Elite Packs refundable?');
    assert.deepStrictEqual({ r: clearEn.reason, t: clearEn.terminal, m: clearEn.module }, { r: 'module-off-fail-closed', t: true, m: 'packs' });
    const p2 = await prep('thanks', {});
    assert.notStrictEqual(p2.reason, 'language-uncertain-module-off');
  });
});
test('F1 runs before intent classification: a module ask that classifies as small talk / support-meta still cannot reach the main path', async () => {
  await withFlags({}, async () => {
    for (const t of ['Thanks a lot, I really like the Elite Packs idea!', 'Hello there, I would like some help with the Atom challenge please', 'Hi, how are you? What are Elite Packs?']) {
      const p = await prep(t);
      assert.deepStrictEqual({ r: p.reason, t: p.terminal }, { r: 'module-off-fail-closed', t: true }, t);
    }
  });
});
test('F1 not taken: human-owned conversation, customer human request, fin-wait / controls outrank, flags ON route to the module', async () => {
  await withFlags({}, async () => {
    const owned = await prep('How do Elite Packs work?', { assign: { admin_assignee_id: '555111' } });
    assert.notStrictEqual(owned.reason, 'module-off-fail-closed');
    const human = await prep('I want to talk to a human about Elite Packs please');
    assert.notStrictEqual(human.reason, 'module-off-fail-closed');
    reset();
    const c = newConv('How do Elite Packs work?');
    h.setControl({ aiOff: { [c.id]: true } });
    const aiOff = await faq.prepare(c.full, c.full.conversation_parts.conversation_parts, 'conversation.user.replied', deps());
    assert.notStrictEqual(aiOff.reason, 'module-off-fail-closed');
    h.setControl({ aiOff: {} });
  });
});
test('F1 side effects (trace): terminal reason is not deferred, handled:true, no ledger, no note, no assignment, no model, one body-free log line', async () => {
  await withFlags({}, async () => {
    reset();
    assert.strictEqual(faq.shouldDeferToMainPath('module-off-fail-closed'), false);
    const c = newConv(PACKS_Q[0]);
    const out = await faq.offer(c.full, c.full.conversation_parts.conversation_parts, 'conversation.user.replied', deps());
    assert.deepStrictEqual(out, { handled: true, reason: 'module-off-fail-closed' });
    noWrites('offer');
    assert.ok(!require('fs').existsSync(h.files.faq) || !/"cid"/.test(E.read(h.files.faq)), 'FAQ ledger written');
    const lines = h.logs.filter((l) => /FAQ_ASSIST/.test(l.line));
    assert.strictEqual(lines.length, 1);
    assert.ok(!lines[0].line.includes('Elite Packs'));
  });
});

// ---------------- 4. ON paths (isolated test config only) ----------------
test('ON1 Packs ON: an ordinary exclusive catalog question sends the overview body and does not post the model paragraph', async () => {
  await withFlags({ LUNA_PACKS_ENABLED: '1' }, async () => {
    const p = await prep('How do Elite Packs work?');
    assert.deepStrictEqual({ r: p.reason, t: p.terminal, m: p.module }, { r: 'module-send', t: true, m: 'packs' });
    assert.deepStrictEqual(p.plan.answerIds, ['packs.overview.en']);
    const personal = await prep('Did the Elite Pack I purchased show up on my account?');
    assert.deepStrictEqual(personal.plan && personal.plan.answerIds, ['packs.account-status.refuse.en']);
    const neighbour = await prep('Can I gift a special Elite Pack to another trader?');
    assert.strictEqual(neighbour.plan, undefined);
    assert.strictEqual(neighbour.terminal, true);
    reset();
    const { id, user } = newConv('How do Elite Packs work?');
    lm.state.queue.push('ACTION: REPLY\nBODY: Elite Packs are whatever I invent.');
    await index.handleWebhook(webhookReq(id, user), res);
    const pubs = fake.publicWrites();
    assert.strictEqual(pubs.length, 1, JSON.stringify(fake.writes().map((w) => ({ t: w.data && w.data.message_type, reason: w.reason }))));
    assert.ok(String(pubs[0].data && pubs[0].data.body || '').includes('packs of three reward cards'));
    assert.ok(!String(pubs[0].data && pubs[0].data.body || '').includes('whatever I invent'));
    assert.strictEqual(lm.state.calls.length, 0);
  });
});
test('ON2 Atom ON: a covering exclusive ask sends the one approved id; a fee-return ask abstains', async () => {
  await withFlags({ LUNA_ATOM_SELECTOR_ENABLED: '1' }, async () => {
    const a = await prep('What is Elite Atom?');
    assert.deepStrictEqual({ r: a.reason, t: a.terminal, m: a.module }, { r: 'module-send', t: true, m: 'atom' });
    assert.deepStrictEqual(a.plan.answerIds, ['atom.overview.en']);
    const fee = await prep('Can I get my Atom challenge fee back after the first payout?');
    assert.strictEqual(fee.terminal, true);
    assert.strictEqual(fee.reason, 'unresolved-policy');
    assert.ok(!fee.plan);
    reset();
    const { id, user } = newConv('What is Elite Atom?');
    lm.state.queue.push('ACTION: REPLY\nBODY: x');
    await index.handleWebhook(webhookReq(id, user), res);
    const pubs = fake.publicWrites();
    assert.strictEqual(pubs.length, 1, JSON.stringify(fake.writes().map((w) => ({ t: w.data && w.data.message_type, reason: w.reason }))));
    assert.ok(String(pubs[0].data && pubs[0].data.body || '').includes('low-cost challenge'));
    assert.ok(!String(pubs[0].data && pubs[0].data.body || '').includes('BODY: x'));
    assert.strictEqual(lm.state.calls.length, 0);
  });
});
test('ON3 one module ON does not turn the other off-gate into an answer: Packs ON + Atom OFF still silences Atom asks as module-off', async () => {
  await withFlags({ LUNA_PACKS_ENABLED: '1' }, async () => {
    const a = await prep('What is Elite Atom and how does the split work?');
    assert.deepStrictEqual({ r: a.reason, m: a.module }, { r: 'module-off-fail-closed', m: 'atom' });
  });
});
test('ON4 ON path with a non-English or uncertain gate does not call the module as English (non-English route unchanged / non-terminal)', async () => {
  await withFlags({ LUNA_PACKS_ENABLED: '1' }, async () => {
    const non = await prep('¿Qué son los Elite Packs? ¿Cuál es el límite diario?');
    assert.notStrictEqual(non.reason, 'module-on-delivery-not-wired');
    const unc = await prep('Elite Packs?');
    assert.notStrictEqual(unc.terminal, true, JSON.stringify(unc));
    assert.notStrictEqual(unc.reason, 'module-off-fail-closed');
  });
});
test('ON5 default config afterwards: flags unset in this process, both OFF', async () => {
  for (const k of FLAGS) assert.ok(!(k in process.env) || process.env[k] === undefined, k);
  for (const g of gates.list()) assert.strictEqual(g.enabled(), false);
});

// ---------------- 5. F5: the gate on deterministic cue routes ----------------
test('F5b deterministic cue route: no English evidence -> approved abstention for every V12 cue question stripped to a bare catalog term', async () => {
  const terms = ['free trial?', 'broker?', 'leverage 2 step lite', 'soft breach', 'profit split', 'holding time', 'payout timing'];
  for (const t of terms) {
    const r = await sel.selectApprovedAnswer(t, { priorClientTexts: [] });
    assert.strictEqual(r.abstain, true, t);
    assert.ok(r.reason === 'language-uncertain' || r.reason === 'language-uncertain', t + ' ' + r.reason);
  }
});
test('F5b deterministic cue route: English evidence in the SAME turn (another clause) or a prior customer message lets the cue select', async () => {
  const a = await sel.selectApprovedAnswer('free trial?', { priorClientTexts: [], turnText: 'Do you have a free trial? And what about the broker?' });
  assert.strictEqual(a.abstain, false);
  const b = await sel.selectApprovedAnswer('free trial?', { priorClientTexts: ['Hello I have a question'] });
  assert.strictEqual(b.abstain, false);
});
test('F5b contextual follow-up route is gated the same way', async () => {
  const none = await sel.selectApprovedAnswer('and daily loss?', { priorClientTexts: ['2 step lite'] });
  assert.strictEqual(none.abstain, true);
  assert.strictEqual(none.reason, 'language-uncertain');
  const ok = await sel.selectApprovedAnswer('and daily loss?', { priorClientTexts: ['What is the 2 step lite challenge?'] });
  assert.strictEqual(ok.abstain, false);
  assert.strictEqual(ok.reason, 'contextual-followup');
});
test('F5b an English verdict cannot be re-rendered into another locale by a language hint', async () => {
  const r = await sel.selectApprovedAnswer('What is the daily loss limit for 2 step lite?', { priorClientTexts: [], langHint: 'es' });
  assert.strictEqual(r.abstain, false);
  assert.strictEqual(r.lang, 'en');
  assert.ok(/\.en$/.test(r.answerId));
});
test('F5b the gate is re-evaluated before the result: English evidence that vanishes during the model call drops ANY pick, deterministic included', async () => {
  const priors = ['Hello, I have a question about my challenge'];
  const r = await sel.selectApprovedAnswer('free trial?', { priorClientTexts: priors, modelClassify: async () => { priors.length = 0; return null; } });
  assert.strictEqual(r.abstain, true);
  assert.strictEqual(r.reason, 'language-uncertain');
});
test('F5-7 gated FAQ abstains unless lang is en: ES / Roman Urdu / Urdu-script deterministic asks do not receive an English V12 row', async () => {
  for (const t of ['cuál es el límite de pérdida diaria para 2 step lite', 'kitna daily loss limit hai 2 step lite mein', 'ڈیلی لوس لمٹ کیا ہے 2 step lite', '2-Step Lite daily loss kitna hai', 'stop loss mandatory يا بطل']) {
    const r = await sel.selectApprovedAnswer(t, { priorClientTexts: [] });
    assert.strictEqual(r.abstain, true, t);
    assert.strictEqual(r.reason, 'language-non-en', t);
    assert.ok(!r.answerId, t);
  }
});
test('F5b prepare passes the whole turn as language evidence: "Do you have a free trial? Are you a broker?" is selected clause by clause', async () => {
  await withFlags({}, async () => {
    reset();
    const c = newConv('Do you have a free trial? Are you a broker?', undefined);
    Object.assign(c.full, { admin_assignee_id: '10118526' });
    const p = await faq.prepare(c.full, c.full.conversation_parts.conversation_parts, 'conversation.user.replied', deps());
    assert.notStrictEqual(p.reason, 'language-uncertain');
  });
});
test('language-uncertain-module-on AD259: main route, no public composition, no post, no note, no assignment', async () => {
  const router = require(path.join(E.t.dir, 'publicRouter'));
  await withFlags({ LUNA_ATOM_SELECTOR_ENABLED: '1' }, async () => {
    const routed = await router.route({ text: 'Atom 289.', prior: [], conversationId: 'ad259', eventId: 'e-ad259' });
    assert.strictEqual(routed.reason, 'language-uncertain-module-on');
    assert.strictEqual(routed.mainRoute, true);
    assert.strictEqual(routed.terminal, false);
    assert.strictEqual(routed.f1, false);
    assert.strictEqual(routed.suppressPublicComposition, true);
    assert.ok(!routed.send);
    assert.ok(!routed.decide);
    reset();
    statuses.length = 0;
    const { id, user } = newConv('Atom 289.');
    lm.state.queue.push('ACTION: REPLY\nBODY: Atom 289 is a catalog size and here is a public paragraph the model composed.');
    await index.handleWebhook(webhookReq(id, user), res);
    assert.deepStrictEqual(statuses, [200]);
    assert.strictEqual(fake.writes().length, 0, JSON.stringify(fake.writes()));
    assert.strictEqual(fake.publicWrites().length, 0);
    assert.strictEqual(fake.notes().length, 0);
    assert.strictEqual(lm.state.calls.length, 0, 'model composed a paragraph');
    assert.ok(h.logs.some((l) => /LANGUAGE_UNCERTAIN_MODULE_ON/.test(l.line) && /compose=0 post=0 note=0 assign=0/.test(l.line)));
    assert.ok(!h.logs.some((l) => /Atom 289 is a catalog size/.test(l.line)));
  });
});
test('F1 flag-off exclusive stays silent on a second entry of the same event', async () => {
  await withFlags({}, async () => {
    reset();
    const { id, user } = newConv('What is Elite Atom and how does the profit split work?');
    lm.state.queue.push('ACTION: REPLY\nBODY: a public paragraph');
    await index.handleWebhook(webhookReq(id, user), res);
    noWrites('first');
    lm.state.queue.push('ACTION: REPLY\nBODY: a public paragraph');
    await index.handleWebhook(webhookReq(id, user), res);
    noWrites('replay-same-event');
  });
});
test('F1 queued fallback, auth replay, burst rerun, and mark-file restart stay silent', async () => {
  const fs = require('fs');
  const f1 = require(path.join(E.t.dir, 'f1AbstainMark'));
  await withFlags({}, async () => {
    reset();
    const { id, user } = newConv('What is Elite Atom and how does the profit split work?');
    lm.state.queue.push('ACTION: REPLY\nBODY: a public paragraph');
    await index.handleWebhook(webhookReq(id, user), res);
    noWrites('mark-first');
    assert.strictEqual(f1.blocks(id, user.id), true, 'mark was not written for the initiating event');
    assert.ok(fs.existsSync(f1.filePath()));

    lm.state.queue.push('ACTION: REPLY\nBODY: queued paragraph');
    const queued = webhookReq(id, user);
    queued.__queuedWebhook = true;
    await index.handleWebhook(queued, res);
    noWrites('queued-fallback');

    T.deferForAuth(id);
    lm.state.queue.push('ACTION: REPLY\nBODY: replay paragraph');
    const replayed = await T.replayAuthDeferred('f1-author');
    assert.ok(replayed && replayed.replayed >= 1, JSON.stringify(replayed));
    noWrites('auth-replay');

    T.burstRerunPending.add(id);
    lm.state.queue.push('ACTION: REPLY\nBODY: burst paragraph');
    T.scheduleBurstRerun(id);
    await E.settle(400);
    assert.ok(h.logs.some((l) => l.line.startsWith('BURST_RERUN ' + id)), 'burst rerun did not run');
    noWrites('burst-rerun');

    const resolved = require.resolve(path.join(E.t.dir, 'f1AbstainMark'));
    delete require.cache[resolved];
    const reloaded = require(path.join(E.t.dir, 'f1AbstainMark'));
    assert.strictEqual(reloaded.blocksConversation(id), true, 'restart dropped the mark file');
    assert.strictEqual(reloaded.blocks(id, user.id), true);
  });
});
test('no generic stub other than the inert startup ones was called; no egress', () => {
  const inert = new Set([
    'generalAccountAskGuard.assessDraft', 'logRedact.install', 'luna-maintainer.create',
    // Optional main-route requires. Absent from the candidate and from the historical snapshot.
    'analytics.createConversationTrace', 'analytics.createErrorAnalytics', 'analytics.createKnowledgeGapAnalytics', 'analytics.createHumanCorrectionCapture',
    'tools.createTools', 'effortPolicy.select', 'publicReplyStructure.markdownHeadingsToBold', 'publicReplyStructure.restructurePublicReply',
    'accountSizeFormat.compactAccountChallengeSizes',
  ]);
  const called = [...E.generic.make.called].filter((n) => !inert.has(n));
  assert.strictEqual(called.join(','), '');
  assert.strictEqual(h.net.attempts.length, 0);
});

run('modules (candidate)');
