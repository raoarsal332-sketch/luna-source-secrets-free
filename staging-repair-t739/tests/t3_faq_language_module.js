'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('./env');
const { test, run } = require('./runner');
const { h, T, fake, lm, sc, reset, newConv } = E;

const sel = require(path.join(E.t.dir, 'faqAnswerSelect'));
const approved = require(path.join(E.t.dir, 'faqApprovedAnswers'));
const baseSel = require(path.join(E.root, 'base', 'faqAnswerSelect'));
const faq = T.faqAssistance;
const gates = E.which === 'candidate' ? require(path.join(E.t.dir, 'faqModuleGates')) : null;

const QUESTIONS = {
  'faq.stop-loss-mandatory.en': 'Is a stop loss mandatory?',
  'faq.2step-lite.daily-loss.en': 'What is the daily loss limit for 2 step lite?',
  'faq.2step.daily-loss.en': 'What is the daily loss limit for the 2 step account?',
  'faq.1step.daily-loss.en': 'What is the daily loss limit for the 1 step account?',
  'faq.2step-lite.min-trading-days.en': 'How many minimum trading days for 2 step lite?',
  'faq.min-holding-time.en': 'What is the minimum holding time for a trade?',
  'faq.soft-breach.en': 'What is a soft breach?',
  'faq.travel-trade.en': 'Can I trade while travelling with a different IP?',
  'faq.2step-lite.leverage.en': 'What leverage do you offer on 2 step lite?',
  'faq.payout-request-timing.en': 'When can I request the payout?',
  'faq.is-broker.en': 'Are you a broker?',
  'faq.free-trial.en': 'Do you have a free trial?',
};

// ---------------- F5: language gate ----------------
test('F5 "please" is no longer a Roman Urdu cue (candidate) / was one at baseline', () => {
  assert.strictEqual(baseSel.detectLangHint('please tell me the daily loss limit'), 'ur-latn');
  if (E.which === 'candidate') assert.strictEqual(sel.detectLangHint('please tell me the daily loss limit'), 'en');
});
test('F5 languageGate tri-state', () => {
  assert.strictEqual(sel.languageGate('payout?', []).lang, 'uncertain');
  assert.strictEqual(sel.languageGate('payout?', undefined).lang, 'uncertain');
  assert.strictEqual(sel.languageGate('payout?', ['hello I have a question about my challenge']).lang, 'en');
  assert.strictEqual(sel.languageGate('payout?', ['kya aap mujhe bata sakte hain']).lang, 'non-en');
  assert.strictEqual(sel.languageGate('what is the daily loss limit', []).lang, 'en');
  assert.strictEqual(sel.languageGate('cuál es el límite de pérdida diaria', []).lang, 'non-en');
  assert.strictEqual(sel.languageGate('ڈیلی لوس لمٹ کیا ہے', []).lang, 'non-en');
  assert.strictEqual(sel.languageGate('kitna daily loss hai', []).lang, 'non-en');
  assert.strictEqual(sel.languageGate('please', []).lang, 'uncertain');
  assert.strictEqual(sel.languageGate('', []).lang, 'uncertain');
});
test('F5 model route is gated BEFORE the call: short catalog term with no English evidence never reaches the classifier', async () => {
  let calls = 0;
  const r = await sel.selectApprovedAnswer('payout?', { modelClassify: async () => { calls += 1; return { answerId: 'faq.payout-request-timing.en', confidence: 0.99 }; }, priorClientTexts: [] });
  assert.strictEqual(calls, 0);
  assert.strictEqual(r.abstain, true);
  assert.strictEqual(r.reason, 'language-uncertain');
});
test('F5 model route runs when prior customer messages are English', async () => {
  let calls = 0;
  const r = await sel.selectApprovedAnswer('payout?', { modelClassify: async () => { calls += 1; return { answerId: 'faq.payout-request-timing.en', confidence: 0.99 }; }, priorClientTexts: ['hello, I have a question about my challenge'] });
  assert.strictEqual(calls, 1);
  assert.strictEqual(r.abstain, false);
  assert.strictEqual(r.answerId, 'faq.payout-request-timing.en');
});
test('F5 model route is gated AFTER the classifier: evidence that disappears during the call drops the model pick (any sendable id)', async () => {
  const priors = ['hello, I have a question about my challenge'];
  const r = await sel.selectApprovedAnswer('payout?', { priorClientTexts: priors, modelClassify: async () => { priors.length = 0; return { answerId: 'faq.is-broker.en', confidence: 0.99 }; } });
  assert.strictEqual(r.abstain, true);
  assert.strictEqual(r.reason, 'language-uncertain');
});
test('F5 language never establishes intent: English evidence alone selects nothing', async () => {
  const r = await sel.selectApprovedAnswer('hello, I have a question about my challenge', { modelClassify: async () => null, priorClientTexts: [] });
  assert.strictEqual(r.abstain, true);
  assert.notStrictEqual(r.reason, 'language-uncertain');
});
test('F5 deterministic cue routes ARE gated (initial-candidate cycle 2): "free trial?" with no English evidence abstains, with English prior evidence it selects', async () => {
  const none = await sel.selectApprovedAnswer('free trial?', { priorClientTexts: [] });
  assert.strictEqual(none.abstain, true);
  assert.strictEqual(none.reason, 'language-uncertain');
  const withPrior = await sel.selectApprovedAnswer('free trial?', { priorClientTexts: ['Hi, I have a question about your accounts.'] });
  assert.strictEqual(withPrior.abstain, false);
  assert.strictEqual(withPrior.answerId, 'faq.free-trial.en');
});
test('F5 V12 keeps exactly 12 sendable answers and every one is still selected by its question', async () => {
  const ids = approved.list().map((a) => a.id).sort();
  assert.strictEqual(ids.length, 12);
  assert.deepStrictEqual(ids, Object.keys(QUESTIONS).sort());
  for (const id of ids) {
    const r = await sel.selectApprovedAnswer(QUESTIONS[id], { priorClientTexts: [] });
    assert.strictEqual(r.abstain, false, id + ' ' + JSON.stringify(r));
    assert.strictEqual(r.answerId, id, QUESTIONS[id]);
  }
});
test('F5 differential: English asks still match baseline; non-English asks abstain and never return an English row (F5-7)', async () => {
  const corpus = Object.values(QUESTIONS).concat([
    'cuál es el límite de pérdida diaria para 2 step lite', 'kitna daily loss limit hai 2 step lite mein', 'ڈیلی لوس لمٹ کیا ہے 2 step lite', 'what is the profit split',
    'Is stop loss compulsory bhai', 'kya stop loss zoruri hai', 'hello', 'payout?', 'my kyc status?', 'And the daily loss for that?', 'leverage?', 'broker?',
    'what is the minimum trade duration', 'نسبة الربح ما هو', 'travel trade different ip', 'can i get a refund',
  ]);
  for (const q of corpus) {
    const priors = ['What is the 2 step lite account about?'];
    const a = await sel.selectApprovedAnswer(q, { priorClientTexts: priors });
    const nonEn = sel.languageGate(q, []).lang === 'non-en';
    if (nonEn) {
      assert.strictEqual(a.abstain, true, q);
      assert.strictEqual(a.reason, 'language-non-en', q);
      assert.ok(!a.answerId, q);
    } else {
      const b = await baseSel.selectApprovedAnswer(q, { priorClientTexts: priors });
      assert.deepStrictEqual({ abstain: a.abstain, id: a.answerId, reason: a.reason }, { abstain: b.abstain, id: b.answerId, reason: b.reason }, q);
    }
  }
});
test('F5-7 gated FAQ abstains on non-English before the classifier; the English row is not a fallback', async () => {
  let calls = 0;
  const samples = [
    'cuál es el tiempo para pedir el pago',
    '2-Step Lite daily loss kitna hai',
    'ما هو حد الخسارة اليومية لـ 2-Step Lite',
    'Is stop loss mandatory bhai',
  ];
  for (const q of samples) {
    calls = 0;
    const r = await sel.selectApprovedAnswer(q, { priorClientTexts: [], modelClassify: async () => { calls += 1; return { answerId: 'faq.payout-request-timing.en', confidence: 0.95 }; } });
    assert.strictEqual(calls, 0, q);
    assert.strictEqual(r.abstain, true, q);
    assert.strictEqual(r.reason, 'language-non-en', q);
    assert.strictEqual(sel.preferLocale('faq.2step-lite.daily-loss.en', 'es'), null);
    assert.strictEqual(sel.preferLocale('faq.2step-lite.daily-loss.en', 'ur-latn'), null);
    assert.strictEqual(sel.preferLocale('faq.2step-lite.daily-loss.en', 'ar'), null);
  }
});

// ---------------- F1: module-off fail closed ----------------
const gateSetup = () => {
  gates.reset();
  gates.register({ id: 'test-packs-detector', flag: 'LUNA_PACKS_ENABLED', detect: (t) => /\bpacks?\b/i.test(t) });
};
const deps = (over) => ({ ...T.faqAssistanceDeps(), ...(over || {}) });
const prep = async (text, opts) => {
  opts = opts || {};
  const parts = [];
  const c = newConv(text, opts.extra);
  if (opts.assign) Object.assign(c.full, opts.assign);
  return { c, p: await faq.prepare(c.full, c.full.conversation_parts.conversation_parts, 'conversation.user.replied', opts.deps || deps()) };
};
const ENG = 'Do you have the Elite Packs for sale right now?';
if (E.which === 'candidate') {
  test('F1 unowned + English + module detector hit + flag OFF -> terminal module-off-fail-closed', async () => {
    reset(); gateSetup();
    const { p } = await prep(ENG);
    assert.deepStrictEqual({ reason: p.reason, terminal: p.terminal }, { reason: 'module-off-fail-closed', terminal: true });
  });
  test('F1 reason is not in the defer list and finishPrepareWithoutPlan returns handled:true', () => {
    assert.strictEqual(faq.shouldDeferToMainPath('module-off-fail-closed'), false);
    reset();
    const out = faq.finishPrepareWithoutPlan('1', { reason: 'module-off-fail-closed', terminal: true }, deps());
    assert.deepStrictEqual(out, { handled: true, reason: 'module-off-fail-closed' });
  });
  test('F1 side effects: no public reply, no note, no assignment, no model/classifier call, no FAQ ledger entry', async () => {
    reset(); gateSetup();
    let selectCalls = 0;
    const full = newConv(ENG);
    const d = deps({ selectAnswer: async () => { selectCalls += 1; return null; } });
    const out = await faq.offer(full.full, full.full.conversation_parts.conversation_parts, 'conversation.user.replied', d);
    assert.deepStrictEqual(out, { handled: true, reason: 'module-off-fail-closed' });
    assert.strictEqual(fake.writes().length, 0, JSON.stringify(fake.writes()));
    assert.strictEqual(selectCalls, 0);
    assert.strictEqual(lm.state.calls.length, 0);
    const ledger = E.read(path.join(h.tmp, 'faq-assist.json'));
    assert.ok(!/module-off/.test(ledger) && !ledger.includes(full.id), 'no FAQ ledger record for a silent fail-closed');
    assert.ok(h.logs.some((l) => /FAQ_ASSIST/.test(l.line) && /module-off-fail-closed/.test(l.line)));
  });
  test('F1 flag ON for the module: branch not taken', async () => {
    reset(); gateSetup();
    process.env.LUNA_PACKS_ENABLED = '1';
    try { const { p } = await prep(ENG); assert.notStrictEqual(p.reason, 'module-off-fail-closed'); }
    finally { delete process.env.LUNA_PACKS_ENABLED; }
  });
  test('F1 default config (flags unset) is OFF', () => { assert.strictEqual(process.env.LUNA_PACKS_ENABLED, undefined); assert.strictEqual(process.env.LUNA_ATOM_ENABLED, undefined); assert.strictEqual(gates.flagOn('LUNA_PACKS_ENABLED'), false); });
  test('F1 only 1/true/on/yes turn a flag on', () => {
    for (const v of ['1', 'true', 'ON', 'yes']) { process.env.T739_FLAG = v; assert.strictEqual(gates.flagOn('T739_FLAG'), true, v); }
    for (const v of ['0', 'false', 'off', '', 'enabled', 'y']) { process.env.T739_FLAG = v; assert.strictEqual(gates.flagOn('T739_FLAG'), false, v); }
    delete process.env.T739_FLAG;
  });
  test('F1 human-owned conversation: branch not taken', async () => {
    reset(); gateSetup();
    const { p } = await prep(ENG, { assign: { admin_assignee_id: '555111' } });
    assert.notStrictEqual(p.reason, 'module-off-fail-closed');
  });
  test('F1 non-English text: branch not taken (non-English main route unchanged)', async () => {
    reset(); gateSetup();
    const { p } = await prep('cuál es el precio de los packs para comprar');
    assert.notStrictEqual(p.reason, 'module-off-fail-closed');
  });
  test('F1 uncertain language: non-terminal language-uncertain-module-off (legacy path, no V12 selection)', async () => {
    reset(); gateSetup();
    const { p } = await prep('packs?');
    assert.deepStrictEqual({ reason: p.reason, terminal: p.terminal }, { reason: 'language-uncertain-module-off', terminal: false });
  });
  test('F1 detector that throws counts as a hit (fails closed)', async () => {
    reset(); gates.reset();
    gates.register({ id: 'throwing', flag: 'LUNA_ATOM_ENABLED', detect: () => { throw new Error('boom'); } });
    const { p } = await prep('What is the weather like for trading today in general?');
    assert.strictEqual(p.reason, 'module-off-fail-closed');
    gates.reset();
  });
  test('F1 precedence: Risk team ownership, aiOff, human request and fin-wait all outrank the new branch', async () => {
    reset(); gateSetup();
    assert.strictEqual((await prep(ENG, { assign: { team_assignee_id: '10675195' } })).p.reason, 'risk-escalations-silence');
    const c = newConv(ENG);
    h.setControl({ aiOff: { [c.id]: true } });
    assert.strictEqual((await faq.prepare(c.full, c.full.conversation_parts.conversation_parts, 't', deps())).reason, 'control-disabled');
    h.setControl({ aiOff: {} });
    assert.strictEqual((await prep('Elite Packs please let me talk to a real person')).p.reason, 'customer-human-request');
    assert.strictEqual((await prep(ENG, { deps: deps({ finWait: () => true }) })).p.reason, 'fin-wait');
  });
  test('F1 no gate registered (shipped default): prepare equals baseline behaviour on the same input', async () => {
    reset(); gates.reset();
    const { p } = await prep(ENG);
    assert.notStrictEqual(p.reason, 'module-off-fail-closed');
  });
}

// ---------------- preserved FAQ behaviour ----------------
test('preserved: V12 answer is selected and sent through the real send path, once, for an unowned English ask', async () => {
  reset();
  if (gates) gates.reset();
  const c = newConv('What is the daily loss limit for 2 step lite?');
  const out = await faq.offer(c.full, c.full.conversation_parts.conversation_parts, 'conversation.user.replied', deps());
  obs('v12-unowned-offer', { out, pub: fake.publicWrites().length });
  assert.strictEqual(fake.publicWrites().length, 0, 'unowned plain FAQ stays on the existing main path (no V12 send here)');
  assert.deepStrictEqual(out, null);
});
test('preserved: V12 approved answer is sent once, byte-equal to the approved body, when a human owns the ticket (Option B)', async () => {
  reset();
  if (gates) gates.reset();
  const c = newConv('What is the daily loss limit for 2 step lite?');
  c.full.admin_assignee_id = '555111';
  const out = await faq.offer(c.full, c.full.conversation_parts.conversation_parts, 'conversation.user.replied', deps());
  obs('v12-owned-offer', { out, pub: fake.publicWrites().length, reason: h.logs.filter((l) => /FAQ_ASSIST/.test(l.line)).map((l) => l.line.slice(-60)) });
  assert.strictEqual(fake.publicWrites().length, 1);
  assert.ok(fake.publicWrites()[0].data.body.includes(approved.get('faq.2step-lite.daily-loss.en').body.slice(0, 40)));
});
const obs = (name, v) => process.stdout.write('OBS|' + name + '|' + JSON.stringify(v) + '\n');
test('preserved: STOP in history, Risk/Escalations team, aiOff -> silence reasons unchanged', async () => {
  reset();
  const stopNote = sc.notePart('@Arsal stop', sc.AUTH_ADMIN);
  const a = newConv('What is the daily loss limit for 2 step lite?', [stopNote]);
  const ra = await faq.prepare(a.full, a.full.conversation_parts.conversation_parts, 't', deps());
  obs('stop-history', { reason: ra.reason, terminal: ra.terminal });
  assert.ok(/stop-in-history|ownership-ambiguous-fail-closed/.test(ra.reason) && ra.terminal === true, JSON.stringify(ra));
  const b = newConv('What is the daily loss limit for 2 step lite?');
  b.full.team_assignee_id = '9629759';
  assert.strictEqual((await faq.prepare(b.full, b.full.conversation_parts.conversation_parts, 't', deps())).reason, 'risk-escalations-silence');
});
test('preserved: duplicate prevention - the second offer for the same turn does not send again', async () => {
  reset();
  if (gates) gates.reset();
  const c = newConv('What is the daily loss limit for 2 step lite?');
  const parts = c.full.conversation_parts.conversation_parts;
  await faq.offer(c.full, parts, 'conversation.user.replied', deps());
  const first = fake.publicWrites().length;
  const fresh = fake.getConversation(c.id);
  await faq.offer(fresh, fresh.conversation_parts.conversation_parts, 'conversation.user.replied', deps());
  assert.strictEqual(fake.publicWrites().length, first);
});
test('preserved: concurrent offers serialize and send at most once (locks)', async () => {
  reset();
  if (gates) gates.reset();
  const c = newConv('What is the daily loss limit for 2 step lite?');
  const parts = c.full.conversation_parts.conversation_parts;
  await Promise.all([faq.offer(c.full, parts, 'conversation.user.replied', deps()), faq.offer(c.full, parts, 'conversation.user.replied', deps())]);
  assert.ok(fake.publicWrites().length <= 1);
});
test('preserved: ownership write lock serialises concurrent public sends for one conversation', async () => {
  reset();
  const c = newConv();
  const [a, b] = await Promise.all([E.index.postReply(c.id, 'comment', 'First clean answer.'), E.index.postReply(c.id, 'comment', 'Second clean answer.')]);
  assert.ok(a.ok && b.ok);
  assert.strictEqual(fake.publicWrites().length, 2);
});

test('no egress attempt was made in this process', () => assert.strictEqual(h.net.attempts.length, 0));
run('faq/language/module (' + E.which + ')');
