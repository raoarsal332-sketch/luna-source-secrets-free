#!/usr/bin/env node
'use strict';
/**
 * Author tests for the Elite Packs module (t739). Isolated: no network, no
 * Intercom, no production paths. Packs is enabled ONLY through opts here.
 *
 *   node tests/run-author-tests.js [--json out.json] [--verbose]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PACKS_DIR = path.join(__dirname, '..');
process.env.LUNA_PACKS_APPROVED_ANSWERS = path.join(PACKS_DIR, 'faq-approved-answers-packs-v1.json');

const approved = require('../packsApprovedAnswers');
const sel = require('../packsAnswerSelect');
const pregate = require('../packsOwnershipPregate');
const C = require('./cases');

const VERBOSE = process.argv.includes('--verbose');
const jsonIdx = process.argv.indexOf('--json');
const JSON_OUT = jsonIdx >= 0 ? process.argv[jsonIdx + 1] : null;

const EN_GATE = Object.freeze({ language: 'en', confident: true, allowsAnswer: true });
const BASE_OPTS = Object.freeze({ packsEnabled: true, languageGate: EN_GATE });

const summary = { categories: {}, failures: [], criticalLeaks: [], falseRefusals: [] };

function cat(name) {
  if (!summary.categories[name]) summary.categories[name] = { total: 0, pass: 0, fail: 0 };
  return summary.categories[name];
}

function record(name, ok, detail) {
  const c = cat(name);
  c.total += 1;
  if (ok) c.pass += 1;
  else {
    c.fail += 1;
    summary.failures.push({ category: name, ...detail });
  }
  if (VERBOSE && !ok) console.log('FAIL', name, JSON.stringify(detail));
}

async function ask(text, extra) {
  return sel.selectPacksAnswer(text, Object.assign({}, BASE_OPTS, extra || {}));
}

function outcome(r) {
  if (!r) return 'none';
  if (r.abstain) return 'abstain';
  if (r.answerId === C.REFUSE) return 'refuse';
  if (r.answerId === C.HANDOFF) return 'handoff';
  if (r.answerId === 'packs.refunds-legal.en') return 'refund';
  if (r.answerId === 'packs.missing-reward.en') return 'missing';
  return 'product';
}

/** A leak = any product answer emitted where ownership/mixed/ambiguous was asked. */
function isLeak(r) {
  const o = outcome(r);
  return o === 'product' || o === 'refund' || o === 'missing';
}

async function runBlocked(name, items, opts) {
  for (const it of items) {
    const q = typeof it === 'string' ? it : it.q;
    const r = await ask(q, opts);
    const leak = isLeak(r);
    const ok = !leak;
    if (leak) summary.criticalLeaks.push({ category: name, q, answerId: r.answerId, reason: r.reason });
    record(name, ok, { q, outcome: outcome(r), answerId: r.answerId, reason: r.reason });
  }
}

(async function main() {
  // ---------------------------------------------------------------- catalog
  const jsonPath = path.join(PACKS_DIR, 'faq-approved-answers-packs-v1.json');
  const rawBytes = fs.readFileSync(jsonPath);
  const hash = crypto.createHash('sha256').update(rawBytes).digest('hex');
  record('catalog:json-hash', hash === 'bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318', { hash });
  const baseHash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(PACKS_DIR, 'baseline', 'faq-approved-answers-packs-v1.json')))
    .digest('hex');
  record('catalog:matches-baseline', baseHash === hash, { baseHash, hash });
  const data = approved.load(jsonPath);
  const enAll = data.all.filter((a) => a.locale === 'en');
  const enSendable = enAll.filter((a) => a.sendable);
  record('catalog:44-english-base-rows', enAll.length === 44, { count: enAll.length });
  record('catalog:40-sendable', enSendable.length === 40, { count: enSendable.length });
  record('catalog:all-sendable-are-english', data.sendableIds.size === 40, { size: data.sendableIds.size });
  for (const id of [
    'packs.the-million-every-rule-conflict.en',
    'packs.free-packs-provisional.en',
    'packs.free-packs-help-center.en',
    'packs._fail_closed.en',
  ]) {
    const row = approved.get(id);
    record('catalog:non-sendable-rows', !!row && row.sendable === false && !data.sendableIds.has(id), { id });
  }
  for (const row of data.all.filter((a) => a.locale !== 'en')) {
    if (row.sendable) record('catalog:translations-non-sendable', false, { id: row.id });
  }
  cat('catalog:translations-non-sendable').total = cat('catalog:translations-non-sendable').total || 0;
  record('catalog:translations-non-sendable', data.all.filter((a) => a.locale !== 'en' && a.sendable).length === 0, {});

  // every sendable id has a control
  const controlled = new Set([...C.GENERAL_CONTROLS.map((x) => x.id), ...C.BOUNDARY_CONTROLS.map((x) => x.id)]);
  const sendableIds = [...data.sendableIds].sort();
  record('controls:cover-all-40-sendable-ids', sendableIds.every((id) => controlled.has(id)) && controlled.size === 40, {
    missing: sendableIds.filter((id) => !controlled.has(id)),
    extra: [...controlled].filter((id) => !data.sendableIds.has(id)),
  });

  // ------------------------------------------------- default OFF / controls
  record('config:off-by-default', (await sel.selectPacksAnswer('What are Elite Packs?', { languageGate: EN_GATE })).reason === 'packs-disabled-default', {});
  record('config:off-by-default-empty-opts', (await sel.selectPacksAnswer('What are Elite Packs?')).reason === 'packs-disabled-default', {});
  record('config:enabled-false-explicit', (await sel.selectPacksAnswer('What are Elite Packs?', { packsEnabled: false, languageGate: EN_GATE })).abstain === true, {});
  record('config:enabled-truthy-string-not-enough', (await sel.selectPacksAnswer('What are Elite Packs?', { packsEnabled: 'true', languageGate: EN_GATE })).abstain === true, {});
  record('config:default-config-frozen-off', sel.DEFAULT_CONFIG.packsEnabled === false && Object.isFrozen(sel.DEFAULT_CONFIG), {});
  for (const flag of ['stop', 'aiOff', 'globalPause', 'finWait', 'protectedTeam']) {
    const r = await ask('What are Elite Packs?', { [flag]: true });
    record('control-gates', r.abstain === true && !r.answerId, { flag, reason: r.reason });
  }

  // ------------------------------------------------------- language gate
  const q0 = 'What are Elite Packs?';
  const noGate = await sel.selectPacksAnswer(q0, { packsEnabled: true });
  record('language-gate:absent-fails-closed', noGate.abstain === true && /absent/.test(noGate.reason), noGate);
  for (const [label, g] of [
    ['null', null],
    ['string', 'en'],
    ['array', []],
    ['empty-object', {}],
    ['allows-false', { language: 'en', confident: true, allowsAnswer: false }],
    ['allows-truthy-string', { language: 'en', confident: true, allowsAnswer: 'true' }],
    ['not-en', { language: 'ur', confident: true, allowsAnswer: true }],
    ['ur-latn', { language: 'ur-latn', confident: true, allowsAnswer: true }],
    ['no-language', { confident: true, allowsAnswer: true }],
    ['unconfident', { language: 'en', confident: false, allowsAnswer: true }],
    ['uncertain', { language: 'en', uncertain: true, allowsAnswer: true }],
    ['mixed', { language: 'en', mixed: true, allowsAnswer: true }],
  ]) {
    const r = await sel.selectPacksAnswer(q0, { packsEnabled: true, languageGate: g });
    record('language-gate:malformed-or-negative-fails-closed', r.abstain === true && !r.answerId, { label, reason: r.reason });
  }
  const okGate = await sel.selectPacksAnswer(q0, { packsEnabled: true, languageGate: EN_GATE });
  record('language-gate:valid-allows', okGate.abstain === false && okGate.answerId === 'packs.overview.en', okGate);
  record(
    'language-gate:en-subtag',
    (await sel.selectPacksAnswer(q0, { packsEnabled: true, languageGate: { language: 'EN', confident: true, allowsAnswer: true } })).abstain === false,
    {}
  );
  // gate-level robustness
  for (const bad of [undefined, null, 42, {}, [], () => 1]) {
    const g = pregate.evaluateOwnershipPregate(bad);
    record('pregate:non-string-input-blocked', g.allowsProductSelect === false && pregate.productSelectPermitted(g) === false, { bad: String(bad) });
  }
  for (const g of [undefined, null, {}, { allowsProductSelect: true }, { kind: 'not-personal' }, { kind: 'not-personal', allowsProductSelect: true }, { kind: 'personal-account-status', allowsProductSelect: true, blocksProductSelect: false }]) {
    record('pregate:productSelectPermitted-fail-closed', pregate.productSelectPermitted(g) === false, { g });
  }
  record('pregate:productSelectPermitted-true-only-for-real-permit', pregate.productSelectPermitted(pregate.evaluateOwnershipPregate('What are Exotic cards?')) === true, {});
  const longText = 'what are exotic cards ' + 'and '.repeat(600);
  const gl = pregate.evaluateOwnershipPregate(longText);
  record('pregate:overlong-input-blocked', gl.allowsProductSelect === false, { reason: gl.reason });
  {
    const t0 = Date.now();
    for (const t of ['a '.repeat(700), 'what is ' + 'the '.repeat(300) + 'card', ('m' + '\u200b').repeat(700), 'i, '.repeat(400), 'do i own instant override and '.repeat(40)]) {
      pregate.evaluateOwnershipPregate(t.slice(0, 1500));
    }
    record('pregate:no-pathological-latency', Date.now() - t0 < 2000, { ms: Date.now() - t0 });
  }

  // ------------------------------------------- supported-general controls
  const fr = { total: 0, answered: 0, refuse: 0, handoff: 0, abstain: 0, wrong: 0 };
  for (const g of C.GENERAL_CONTROLS) {
    for (const q of g.q) {
      const r = await ask(q, { forcePacks: true });
      const rNoScope = await ask(q);
      if (!rNoScope.abstain && rNoScope.answerId === g.id) fr.noScopeAnswered = (fr.noScopeAnswered || 0) + 1;
      fr.total += 1;
      const ok = !r.abstain && r.answerId === g.id;
      if (ok) fr.answered += 1;
      else {
        const o = outcome(r);
        if (o === 'refuse') fr.refuse += 1;
        else if (o === 'handoff') fr.handoff += 1;
        else if (o === 'abstain') fr.abstain += 1;
        else fr.wrong += 1;
        summary.falseRefusals.push({ q, expected: g.id, outcome: o, answerId: r.answerId, reason: r.reason });
      }
      record('general-controls', ok, { q, expected: g.id, got: r.answerId, reason: r.reason });
    }
  }
  const mg = { total: 0, answered: 0, miss: 0 };
  for (const [q, id] of C.MUST_STAY_GENERAL) {
    const gate = pregate.evaluateOwnershipPregate(q);
    const gateOk = gate.kind === pregate.KIND.NOT_PERSONAL;
    record('must-stay-general:gate-permits', gateOk, { q, kind: gate.kind, reason: gate.reason, clauses: gate.clauses.map((c) => c.reasons) });
    mg.total += 1;
    if (!gateOk) mg.miss += 1;
    if (id) {
      const r = await ask(q, { forcePacks: true });
      record('must-stay-general:selects', !r.abstain && r.answerId === id, { q, expected: id, got: r.answerId, reason: r.reason });
    }
  }

  for (const b of C.BOUNDARY_CONTROLS) {
    for (const q of b.q) {
      const r = await ask(q);
      record('boundary-controls', !r.abstain && r.answerId === b.id, { q, expected: b.id, got: r.answerId, reason: r.reason });
    }
  }

  // ------------------------------------------------ ownership / adversarial
  for (const q of C.MISSING_REPORTS) {
    const r = await ask(q);
    record('missing-report-routes-to-missing-reward', !r.abstain && r.answerId === 'packs.missing-reward.en', { q, got: r.answerId });
  }
  for (const s of C.SAFETY_R1) {
    const r = await ask(s.q);
    const bad = !r.abstain && r.answerId === s.notId;
    if (bad || isLeak(r)) summary.criticalLeaks.push({ category: 'safety-r1', q: s.q, answerId: r.answerId, reason: r.reason });
    record('safety-r1:no-product-assertion', !bad && !isLeak(r), { q: s.q, got: r.answerId, reason: r.reason, kind: r.pregateKind });
  }
  for (const s of C.RULE_FACT_R1) {
    const r = await ask(s.q, { forcePacks: true });
    record('rule-fact-r1:answered', !r.abstain && r.answerId === s.id, { q: s.q, expected: s.id, got: r.answerId, reason: r.reason, kind: r.pregateKind });
  }

  await runBlocked('personal-en', C.PERSONAL_EN);
  await runBlocked('implicit-dropped-subject', C.IMPLICIT_EN);
  await runBlocked('third-person-self', C.THIRD_PERSON_SELF);
  await runBlocked('confirm-without-possessive', C.CONFIRM_WITHOUT_POSSESSIVE);
  await runBlocked('unicode-zwsp-homoglyph', C.UNICODE_OBFUSCATED);
  await runBlocked('mixed', C.MIXED);
  await runBlocked('allow-list-bait', C.ALLOW_LIST_BAIT);

  // strict: personal/implicit/third/confirm/mixed must land on the refusal or handoff row (not just "not product")
  for (const [name, items] of [
    ['strict:personal-refuse-or-handoff', C.PERSONAL_EN],
    ['strict:mixed-refuse-or-handoff', C.MIXED],
    ['strict:third-person-refuse-or-handoff', C.THIRD_PERSON_SELF],
  ]) {
    for (const it of items) {
      const q = typeof it === 'string' ? it : it.q;
      const r = await ask(q);
      const o = outcome(r);
      record(name, o === 'refuse' || o === 'handoff' || o === 'abstain', { q, outcome: o });
    }
  }

  // obfuscated but otherwise general text is blocked (fail closed) - measured
  for (const q of C.UNICODE_GENERAL_OBFUSCATED) {
    const r = await ask(q);
    record('unicode-general-obfuscated-fail-closed', !isLeak(r), { q, outcome: outcome(r) });
  }

  // non-English: must abstain even when the shared gate wrongly says English
  for (const q of C.NON_ENGLISH) {
    const r = await ask(q);
    record('non-english:abstain-with-permissive-gate', r.abstain === true && !r.answerId, { q, outcome: outcome(r), reason: r.reason });
  }
  for (const q of C.NON_ENGLISH.slice(0, 12)) {
    const r = await sel.selectPacksAnswer(q, { packsEnabled: true, languageGate: { language: 'ur-latn', confident: true, allowsAnswer: false } });
    record('non-english:abstain-with-negative-gate', r.abstain === true && !r.answerId, { q });
    const r2 = await sel.selectPacksAnswer(q, { packsEnabled: true });
    record('non-english:abstain-without-gate', r2.abstain === true && !r2.answerId, { q });
  }

  // multi-turn
  for (const m of C.MULTI_TURN) {
    const opts = { priorClientTexts: m.prior };
    const r = await ask(m.q, opts);
    const gate = pregate.evaluateOwnershipPregate(m.q, opts);
    if (m.expect === 'blocked') {
      const leak = isLeak(r);
      if (leak) summary.criticalLeaks.push({ category: 'multi-turn', q: m.q, prior: m.prior, answerId: r.answerId });
      record('multi-turn:blocked', !leak && !gate.allowsProductSelect, { q: m.q, prior: m.prior, kind: gate.kind, outcome: outcome(r) });
    } else if (m.expect === 'gate-general') {
      record('multi-turn:general-resolves', gate.kind === pregate.KIND.NOT_PERSONAL, { q: m.q, prior: m.prior, kind: gate.kind, reasons: gate.clauses.map((c) => c.reasons) });
    } else if (m.expect === 'answer') {
      record('multi-turn:explicit-general-answered', !r.abstain && r.answerId === m.id, { q: m.q, got: r.answerId });
    }
  }

  // ---------------------------------------------- allow-list can never override
  {
    const personalClauses = ['do I own Instant Override', 'is Instant Override in my inventory', 'did I get Open Season', 'how many credits do I have left', 'am I eligible for Founder\'s Key', 'check my balance', 'Instant Override showing yet', 'does this account have Lifetime Split', 'has my Oracle pack been opened', 'my card is not unlocked yet'];
    const generalClauses = ['What are Exotic cards', 'How do I open a pack', 'What are the drop rates', 'How many cards are in a pack', 'What is Pack Pass', 'Can I cancel my subscription', 'What makes a trader eligible', 'Explain Exotic cards', 'Tell me about the Whale pack', 'Which pack is best'];
    const joiners = [(g, p) => `${g}? ${p}?`, (g, p) => `${g}, and ${p}?`, (g, p) => `${g} - ${p}`, (g, p) => `${p}? ${g}?`, (g, p) => `${g}; also ${p}`, (g, p) => `Hi, ${g}. Thanks. ${p}`, (g, p) => `${g} and ${p}`, (g, p) => `${g}\n${p}`];
    let n = 0;
    for (const g of generalClauses) {
      for (const p of personalClauses) {
        for (const j of joiners) {
          const q = j(g, p);
          const r = await ask(q);
          n += 1;
          const leak = isLeak(r);
          if (leak) summary.criticalLeaks.push({ category: 'combinatorial-mixed', q, answerId: r.answerId });
          record('combinatorial-general+personal', !leak, { q, outcome: outcome(r), answerId: r.answerId });
        }
      }
    }
    cat('combinatorial-general+personal');
  }

  // ------------------------------------------------ intentTags narrow-only
  {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'packs-scope-'));
    const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const mutate = (fn) => {
      const copy = JSON.parse(JSON.stringify(j));
      fn(copy);
      const p = path.join(tmp, `cat-${Math.random().toString(16).slice(2)}.json`);
      fs.writeFileSync(p, JSON.stringify(copy));
      return p;
    };
    const nonSendIds = ['packs.the-million-every-rule-conflict.en', 'packs.free-packs-provisional.en', 'packs.free-packs-help-center.en', 'packs._fail_closed.en'];
    // widening attempt: add every "sendable-looking" tag to non-sendable rows
    const p1 = mutate((c) => {
      for (const a of c.answers) {
        if (nonSendIds.includes(a.id)) a.intentTags = ['packs', 'exotic', 'sendable', 'safeGeneral', 'overview', 'freePacks', 'handoff', 'accountStatusBoundary', 'refunds'];
      }
    });
    const d1 = approved.load(p1);
    for (const id of nonSendIds) {
      const row = d1.byId.get(id);
      record('scope:tags-never-enable-nonsendable', row.sendable === false && !d1.sendableIds.has(id) && !approved.scopeAllows(row, 'product') && !approved.scopeAllows(row, 'handoff') && !approved.scopeAllows(row, 'refuse'), { id });
    }
    // narrowing: a sendable row tagged nonSendable is not deliverable
    const p2 = mutate((c) => {
      const a = c.answers.find((x) => x.id === 'packs.exotic-cards.en');
      a.intentTags = ['packs', 'exotic', 'nonSendable'];
    });
    const d2 = approved.load(p2);
    record('scope:tag-can-narrow', approved.scopeAllows(d2.byId.get('packs.exotic-cards.en'), 'product') === false, {});
    // pending/needs-owner rows given sendable=true flag remain non-sendable via approval/status
    const p3 = mutate((c) => {
      for (const a of c.answers) if (nonSendIds.slice(0, 3).includes(a.id)) a.sendable = true;
    });
    const d3 = approved.load(p3);
    for (const id of nonSendIds.slice(0, 3)) record('scope:sendable-flag-alone-cannot-enable', d3.byId.get(id).sendable === false, { id });
    // selector end-to-end over a mutated catalog: widening tags on non-sendable rows cannot surface them
    process.env.LUNA_PACKS_APPROVED_ANSWERS = p1;
    approved.clearCache();
    const rA = await ask('Is it true that The Million has every rule lifted?');
    record('scope:selector-never-emits-nonsendable', !rA.answerId || !nonSendIds.includes(rA.answerId), { got: rA.answerId });
    const rB = await ask('Which account sizes get the free pack tier from the Help Center?');
    record('scope:selector-never-emits-nonsendable-free-tier', !rB.answerId || !nonSendIds.includes(rB.answerId), { got: rB.answerId });
    process.env.LUNA_PACKS_APPROVED_ANSWERS = jsonPath;
    approved.clearCache();
    approved.load(jsonPath);
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // -------------------------------------------------------------- report
  const lines = [];
  let tot = 0;
  let pass = 0;
  for (const [k, v] of Object.entries(summary.categories)) {
    tot += v.total;
    pass += v.pass;
    lines.push(`${k.padEnd(58)} ${String(v.pass).padStart(4)}/${String(v.total).padEnd(4)} ${v.fail ? 'FAIL ' + v.fail : ''}`);
  }
  console.log(lines.join('\n'));
  console.log('----');
  console.log(`TOTAL ${pass}/${tot} pass, ${tot - pass} fail`);
  console.log(`CRITICAL ownership->product leaks (author cases): ${summary.criticalLeaks.length}`);
  console.log(
    `General controls: ${fr.total} asked | answered correctly ${fr.answered} (without caller scope hint: ${fr.noScopeAnswered || 0}) | false refusal(refuse ${fr.refuse}, handoff ${fr.handoff}, abstain ${fr.abstain}) | wrong answer ${fr.wrong}`
  );
  console.log(`Must-stay-general gate permits: ${mg.total - mg.miss}/${mg.total}`);
  if (summary.failures.length) {
    console.log('\nFAILURES:');
    for (const f of summary.failures.slice(0, 80)) console.log(' -', JSON.stringify(f).slice(0, 300));
    if (summary.failures.length > 80) console.log(` ... ${summary.failures.length - 80} more`);
  }
  if (JSON_OUT) {
    fs.writeFileSync(
      JSON_OUT,
      JSON.stringify({ totals: { pass, total: tot, fail: tot - pass }, generalControls: fr, mustStayGeneral: mg, categories: summary.categories, criticalLeaks: summary.criticalLeaks, falseRefusals: summary.falseRefusals, failures: summary.failures }, null, 2)
    );
  }
  process.exit(summary.failures.length ? 1 : 0);
})().catch((e) => {
  console.error('HARNESS ERROR', e);
  process.exit(2);
});
