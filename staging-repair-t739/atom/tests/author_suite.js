'use strict';
/**
 * Author suite runner (t739). Returns structured raw counts; used by both
 * `node --test` wrapper and the CLI report. Own cases only.
 */
const { run, check, sel } = require('./harness');
const controls = require('./cases/controls');
const A = require('./cases/adversarial');
const GEN = require('./cases/general');
const PROBES = require('./cases/probes');
const VARIED = require('./cases/varied');
const approved = require('../atomApprovedAnswers');

const HANDOFF = 'atom.handoff.unverified.en';

async function runControls() {
  const rows = [];
  for (const [id, qs] of Object.entries(controls)) {
    for (const q of qs) {
      const r = await run(q);
      let pass;
      let why = '';
      if (id === HANDOFF) {
        pass = r.abstain === true && r.action === 'handoff' && r.handoffAnswerId === HANDOFF && r.answerId === undefined;
        why = r.abstain ? r.action + ':' + r.reason : 'answered:' + r.answerId;
      } else {
        pass = !r.abstain && r.answerId === id;
        why = r.abstain ? r.action + ':' + r.reason : 'answered:' + r.answerId;
      }
      rows.push({ set: 'controls', id, text: q, pass, why, falseRefusal: !pass && id !== HANDOFF && r.abstain === true });
    }
  }
  return rows;
}

async function runCases(set, list) {
  const rows = [];
  for (const c of list) {
    const [cid, text, a, b] = c;
    let expect;
    let prior;
    if (Array.isArray(a)) {
      prior = a;
      expect = b;
    } else expect = a || { noAnswer: true };
    const r = await run(text, prior ? { priorClientTexts: prior } : {});
    const res = check(expect, r);
    rows.push({ set, id: cid, text, pass: res.pass, why: res.why || '', leak: !!(res.why && res.why.startsWith('LEAK')) });
  }
  return rows;
}

async function runGeneral() {
  const rows = [];
  for (const [cid, text, kind, id] of GEN) {
    const r = await run(text);
    let pass;
    let falseRefusal = false;
    let clarifyInstead = false;
    if (kind === 'answer') {
      pass = !r.abstain && r.answerId === id;
      falseRefusal = r.abstain === true;
      clarifyInstead = r.abstain === true && r.action === 'clarify';
    } else if (kind === 'clarify') {
      pass = r.abstain === true && r.action === 'clarify' && r.clarify && r.clarify.slot === 'product';
    } else {
      pass = r.abstain === true;
    }
    rows.push({ set: 'general', id: cid, text, kind, pass, falseRefusal, clarifyInstead, why: r.abstain ? r.action + ':' + r.reason : 'answered:' + r.answerId });
  }
  return rows;
}

async function runVaried() {
  const rows = [];
  for (const [id, qs] of Object.entries(VARIED.SUPPORTED)) {
    for (let i = 0; i < qs.length; i++) {
      const text = qs[i];
      const r = await run(text);
      const pass = r.abstain !== true && r.answerId === id;
      rows.push({
        set: 'varied-supported',
        id: id + '#' + (i + 1),
        text,
        pass,
        why: r.abstain ? r.action + ':' + r.reason : 'answered:' + r.answerId,
        falseRefusal: r.abstain === true,
        leak: false,
      });
    }
  }
  for (const [cid, text, kind] of VARIED.MUST_NOT_ANSWER) {
    const r = await run(text);
    const leaked = r.abstain !== true;
    const pass = !leaked && r.answerId === undefined && (kind !== 'handoff' || r.action === 'handoff');
    rows.push({
      set: 'varied-deny',
      id: cid,
      text,
      pass,
      why: r.abstain ? r.action + ':' + r.reason : 'LEAK:answered:' + r.answerId,
      leak: leaked,
    });
  }
  return rows;
}

async function runRobustness() {
  const rows = [];
  const add = (id, pass, why) => rows.push({ set: 'robustness', id, pass, why: why || '' });
  const { execFileSync } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const root = path.join(__dirname, '..');
  const sub = (kbPath, code) =>
    execFileSync(process.execPath, ['-e', code], { cwd: root, env: Object.assign({}, process.env, { LUNA_ATOM_APPROVED_ANSWERS: kbPath }) }).toString().trim();
  const q = "What is the Atom 2-Step daily loss limit?";
  const probe = "require('./atomAnswerSelect').selectAtomAnswer(" + JSON.stringify(q) + ",{enabled:true,languageGate:{lang:'en'}}).then(r=>console.log(JSON.stringify([r.abstain,r.reason,r.answerId||null])))";
  add('RB01-missing-kb-fails-closed', sub('/nonexistent/kb.json', probe) === JSON.stringify([true, 'selector-error-fail-closed', null]), '');
  const kb = JSON.parse(fs.readFileSync(path.join(root, 'faq-approved-answers-atom-v1.json'), 'utf8'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atomkb-'));
  const mut = JSON.parse(JSON.stringify(kb));
  for (const a of mut.answers) if (a.id === 'atom.2step.daily-loss.en') { a.sendable = false; }
  fs.writeFileSync(path.join(tmp, 'kb.json'), JSON.stringify(mut));
  const out1 = JSON.parse(sub(path.join(tmp, 'kb.json'), probe));
  add('RB02-kb-sendable-false-is-authoritative', out1[0] === true && out1[2] === null, JSON.stringify(out1));
  const mut2 = JSON.parse(JSON.stringify(kb));
  for (const a of mut2.answers) if (a.id === 'atom.2step.daily-loss.en') { a.body = a.body + ' x'; }
  fs.writeFileSync(path.join(tmp, 'kb2.json'), JSON.stringify(mut2));
  const out2 = JSON.parse(sub(path.join(tmp, 'kb2.json'), probe));
  add('RB03-tampered-body-hash-mismatch-fails-closed', out2[0] === true && out2[2] === null, JSON.stringify(out2));
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const [id, v] of [['RB04-null', null], ['RB05-undefined', undefined], ['RB06-number', 123], ['RB07-object', {}], ['RB08-array', ['Atom']]]) {
    const r = await sel.selectAtomAnswer(v, { enabled: true, languageGate: { lang: 'en' } });
    add(id, r.abstain === true && r.answerId === undefined, r.reason);
  }
  const r0 = await sel.selectAtomAnswer(q, { enabled: true, languageGate: { lang: 'en' }, priorClientTexts: 'not-an-array' });
  add('RB09-priors-not-array-ok', !r0.abstain && r0.answerId === 'atom.2step.daily-loss.en', r0.reason);
  const r1 = await sel.selectAtomAnswer(q, { enabled: true, languageGate: { lang: 'en' }, priorClientTexts: [null, 5, {}, 'Atom'] });
  add('RB10-priors-mixed-types-ok', !r1.abstain, r1.reason);
  const long = 'Atom refund ' + 'a '.repeat(590);
  const t0 = Date.now();
  await sel.selectAtomAnswer(long, { enabled: true, languageGate: { lang: 'en' } });
  const evil = 'Atom ' + 'a-'.repeat(590);
  await sel.selectAtomAnswer(evil, { enabled: true, languageGate: { lang: 'en' } });
  const dt = Date.now() - t0;
  add('RB11-1200-char-inputs-fast(<500ms)', dt < 500, dt + 'ms');
  const r2 = await sel.selectAtomAnswer('Atom 1-Step refund ' + 'x', { enabled: true, languageGate: { lang: 'en' } });
  add('RB12-diagnostics-have-no-customer-words-by-default', !r2.diagnostics || !('residual' in r2.diagnostics), JSON.stringify(r2.diagnostics || {}));
  const r3 = await sel.selectAtomAnswer('Atom 1-Step zzzzqq price', { enabled: true, languageGate: { lang: 'en' }, debug: true });
  add('RB13-debug-opt-in-includes-residual', !!(r3.diagnostics && r3.diagnostics.residual), JSON.stringify(r3.diagnostics || {}));
  return rows;
}

async function runGating() {
  const rows = [];
  const add = (id, pass, why) => rows.push({ set: 'gating', id, pass, why: why || '' });
  const q = 'What is the Atom 2-Step daily loss limit?';
  const gateCases = [
    ['GT01-gate-absent', undefined, 'language-gate-missing'],
    ['GT02-gate-null', null, 'language-gate-missing'],
    ['GT03-gate-ur', { lang: 'ur' }, 'language-gate-not-english'],
    ['GT04-gate-es-string', 'es', 'language-gate-not-english'],
    ['GT05-gate-en-low-conf', { lang: 'en', confident: false }, 'language-gate-not-confident'],
    ['GT06-gate-mixed', { lang: 'en', mixed: true }, 'language-gate-not-confident'],
    ['GT07-gate-empty-object', {}, 'language-gate-malformed'],
    ['GT08-gate-number', 42, 'language-gate-malformed'],
    ['GT09-gate-status-unknown', { lang: 'en', status: 'unknown' }, 'language-gate-not-confident'],
    ['GT10-gate-blocked', { lang: 'en', blocked: true }, 'language-gate-not-confident'],
  ];
  for (const [id, gate, reason] of gateCases) {
    const r = await sel.selectAtomAnswer(q, { enabled: true, languageGate: gate });
    add(id, r.abstain === true && r.reason === reason && r.answerId === undefined, r.reason);
  }
  for (const [id, gate] of [['GT11-gate-en-string', 'en'], ['GT12-gate-en-US', { language: 'en-US' }], ['GT13-gate-code', { code: 'EN' }]]) {
    const r = await sel.selectAtomAnswer(q, { enabled: true, languageGate: gate });
    add(id, !r.abstain && r.answerId === 'atom.2step.daily-loss.en', r.reason);
  }
  let r = await sel.selectAtomAnswer('\u00bfCu\u00e1l es el l\u00edmite de p\u00e9rdida diaria en Atom 2-Step?', { enabled: true, languageGate: { lang: 'en' } });
  add('GT14-gate-en-but-text-spanish', r.abstain && r.reason === 'non-english', r.reason);
  r = await sel.selectAtomAnswer(q, { languageGate: { lang: 'en' } });
  add('GT15-atom-off-by-default', r.abstain && r.reason === 'atom-off', r.reason);
  r = await sel.selectAtomAnswer(q, { enabled: false, languageGate: { lang: 'en' } });
  add('GT16-atom-explicit-off', r.abstain && r.reason === 'atom-off', r.reason);
  r = await sel.selectAtomAnswer(q, { enabled: true, languageGate: { lang: 'en' }, langHint: 'ur' });
  add('GT17-langHint-is-not-a-gate', !r.abstain && r.lang === 'en' && r.answerId === 'atom.2step.daily-loss.en', r.reason);
  for (const [id, o, reason] of [
    ['GT18-paused', { paused: true }, 'global-pause'],
    ['GT19-aiOff', { aiOff: true }, 'aiOff'],
    ['GT20-stop', { stop: true }, 'STOP'],
    ['GT21-finWait', { finWait: true }, 'fin-wait'],
    ['GT22-protected', { protectedTeam: true }, 'protected-team-silence'],
  ]) {
    r = await sel.selectAtomAnswer(q, Object.assign({ enabled: true, languageGate: { lang: 'en' } }, o));
    add(id, r.abstain && r.reason === reason, r.reason);
  }
  r = await sel.selectAtomAnswer('', { enabled: true, languageGate: { lang: 'en' } });
  add('GT23-empty', r.abstain && r.reason === 'empty', r.reason);
  r = await sel.selectAtomAnswer('What is the daily loss limit on 2-Step?', { enabled: true, languageGate: { lang: 'en' } });
  add('GT24-not-atom-scope', r.abstain && r.reason === 'not-atom-scope', r.reason);
  r = await sel.selectAtomAnswer(q, { enabled: true, languageGate: { lang: 'en' }, requireOwnerApproved: true });
  add('GT25-requireOwnerApproved-source-verified-ok', !r.abstain, r.reason);
  const isolatedOk = (() => {
    const { execFileSync } = require('child_process');
    const out = execFileSync(process.execPath, ['-e', "require('./atomAnswerSelect').selectAtomAnswer('x',{languageGate:{lang:'en'}}).then(r=>console.log(r.reason))"], { cwd: require('path').join(__dirname, '..'), env: Object.assign({}, process.env, { LUNA_ATOM_SELECTOR_ENABLED: '' }) }).toString().trim();
    return out === 'atom-off';
  })();
  add('GT26-env-unset-is-off', isolatedOk, '');
  const envOn = (() => {
    const { execFileSync } = require('child_process');
    const out = execFileSync(process.execPath, ['-e', "require('./atomAnswerSelect').selectAtomAnswer('What is the Atom 2-Step daily loss limit?',{languageGate:{lang:'en'}}).then(r=>console.log(r.answerId))"], { cwd: require('path').join(__dirname, '..'), env: Object.assign({}, process.env, { LUNA_ATOM_SELECTOR_ENABLED: '1' }) }).toString().trim();
    return out === 'atom.2step.daily-loss.en';
  })();
  add('GT27-env-on-isolated-test-config', envOn, '');
  return rows;
}

// Structural template sweep: fee-recovery meaning built from independent parts.
async function runFeeSweep() {
  const fee = [
    'the $289 I put down', 'the $215 I spent', 'my 100k fee', 'the money I paid', 'what I paid', 'the challenge fee',
    'the entry cost', 'the price', 'my purchase', 'the $19', 'the 289', 'the amount I deposited', 'the 100K I bought',
    'my initial payment', 'what I gave you', 'my Atom 2-Step fee',
  ];
  const rel = [
    'come back to me', 'be returned', 'be refunded', 'be given to me again', 'be credited', 'get it back',
    'be sent to me', 'come to me', 'be paid to me', 'be added to my payout', 'be waived', 'be covered', 'be reimbursed',
    'be recovered', 'be rebated', 'be repaid', 'be handed over', 'be reversed', 'be thrown in', 'be made up to me',
  ];
  const stage = [
    'on the third payout', 'after payout 3', 'the third time I get paid', 'after three cashouts', 'when I get my first withdrawal',
    'at my 2nd payout', 'once paid three times', 'after three settlements', 'after three distributions', 'at the third disbursement',
  ];
  const tpl = [
    (f, r, s) => `Will ${f} ${r} ${s}?`,
    (f, r, s) => `Atom: does ${f} ${r} ${s}`,
    (f, r, s) => `${s} on Atom, can ${f} ${r}?`,
  ];
  const rows = [];
  let n = 0;
  for (const f of fee) {
    for (const r of rel) {
      for (const s of stage) {
        const t = tpl[n++ % tpl.length](f, r, s);
        const res = await run(t);
        rows.push({ set: 'fee-sweep', id: 'FS' + n, text: t, pass: res.abstain === true && res.answerId === undefined, leak: res.abstain !== true, why: res.abstain ? res.reason : 'answered:' + res.answerId });
      }
    }
  }
  return rows;
}

async function runMixedSweep() {
  const suffixes = [
    ' Also is the fee refundable?',
    ' And do I get the $215 I spent back on the third payout?',
    ' Also will the $289 I put down come to me the third time I get paid?',
    ' Btw can I get my money back?',
  ];
  const rows = [];
  let n = 0;
  for (const [id, qs] of Object.entries(controls)) {
    for (const q of qs) {
      for (const sfx of suffixes) {
        n++;
        const res = await run(q + sfx);
        rows.push({ set: 'mixed-sweep', id: 'MX' + n, text: q + sfx, pass: res.abstain === true && res.answerId === undefined, leak: res.abstain !== true, why: res.abstain ? res.reason : 'answered:' + res.answerId });
      }
    }
  }
  return rows;
}

async function runWrapperStability() {
  const wraps = [(q) => 'Hi, ' + q, (q) => q + ' thanks', (q) => 'hello ' + q.toLowerCase() + ' please'];
  const rows = [];
  let n = 0;
  for (const [id, qs] of Object.entries(controls)) {
    for (const q of qs) {
      const base = await run(q);
      for (const wrap of wraps) {
        n++;
        const res = await run(wrap(q));
        const same = res.abstain === base.abstain && res.answerId === base.answerId;
        rows.push({ set: 'wrapper-stability(info)', id: 'WS' + n, text: wrap(q), pass: same, why: res.abstain ? res.reason : 'answered:' + res.answerId, info: true });
      }
    }
  }
  return rows;
}

function kbInvariants() {
  const rows = [];
  const add = (id, pass, why) => rows.push({ set: 'kb', id, pass, why: why || '' });
  const all = approved.list(sel.KB_PATH);
  const en = all.filter((r) => /\.en$/.test(r.id));
  const enSend = en.filter((r) => r.sendable);
  add('KB01-198-total-rows', all.length === 198, String(all.length));
  add('KB02-33-english-base-rows', en.length === 33, String(en.length));
  add('KB03-31-sendable-english', enSend.length === 31, String(enSend.length));
  add('KB04-31x8=248', enSend.length * 8 === 248 && Object.values(controls).every((v) => v.length === 8) && Object.keys(controls).length === 31, String(Object.values(controls).reduce((a, v) => a + v.length, 0)));
  add('KB05-no-nonEN-sendable', all.filter((r) => !/\.en$/.test(r.id) && r.sendable).length === 0, '');
  add('KB06-nonsendable-en', en.filter((r) => !r.sendable).map((r) => r.id).sort().join(',') === 'atom.consistency.boundary.en,atom.news.minutes.unverified.en', en.filter((r) => !r.sendable).map((r) => r.id).join(','));
  add('KB07-controls-cover-exactly-sendable-ids', JSON.stringify(Object.keys(controls).sort()) === JSON.stringify(enSend.map((r) => r.id).sort()), '');
  const problems = require('../atomAnswerScope').validateAgainstKb(approved, sel.KB_PATH);
  add('KB08-scope-sidecar-valid', problems.length === 0, problems.join(';'));
  const crypto = require('crypto');
  const bad = all.filter((r) => crypto.createHash('sha256').update(r.body, 'utf8').digest('hex') !== r.contentHash);
  add('KB09-body-hashes-match', bad.length === 0, bad.map((r) => r.id).join(','));
  const fs = require('fs');
  const path = require('path');
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', f))).digest('hex');
  const EXPECT = {
    'faq-approved-answers-atom-v1.json': 'df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6',
    'atomApprovedAnswers.js': '5008e3343dad76eb77cc0a4cd595b07a79ba134904c018e3320a8d85d5ccdbd8',
    'baseline/atomAnswerSelect.baseline.dd3b9f79.js': 'dd3b9f79c002a8c04ba8298aab5eca3ba6f187c86a0e23dcf89fa60041d9473f',
    'baseline/faqAnswerSelect.atomwired.fc752a47.js': 'fc752a472bd691713127b7fafdd40dba98eb669ae777a5578a1085484a070deb',
    'baseline/INTERFACE_REQUEST.orig.md': 'c90c7dcea847ce531ed8340de6d277eb42e49e07c5d6f748e89a3ab987961710',
  };
  for (const [f, h] of Object.entries(EXPECT)) add('KB10-byte-identical:' + f, sha(f) === h, sha(f));
  const ids = new Set();
  for (const f of ['atomAnswerSelect.js', 'atomAnswerScope.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    for (const m of src.matchAll(/atom\.[a-z0-9.\-]+\.en/g)) ids.add(m[0]);
  }
  const missing = [...ids].filter((id) => !approved.get(id, sel.KB_PATH));
  add('KB11-every-referenced-id-exists-in-kb(' + ids.size + ')', missing.length === 0, missing.join(','));
  const sendableRefs = [...ids].filter((id) => !(approved.get(id, sel.KB_PATH) || {}).sendable);
  add('KB12-non-sendable-ids-referenced-only-as-classify-only', sendableRefs.sort().join(',') === 'atom.consistency.boundary.en,atom.news.minutes.unverified.en', sendableRefs.join(','));
  return rows;
}

async function runAll() {
  const out = [];
  out.push(...kbInvariants());
  out.push(...(await runControls()));
  out.push(...(await runCases('money-confusion', A.moneyConfusion.map(([id, t]) => [id, t, A.MC_ANY_ABSTAIN.has(id) ? A.ANY_ABSTAIN : A.FEE_POLICY]))));
  out.push(...(await runCases('unresolved', A.unresolved)));
  out.push(...(await runCases('discriminate', A.discriminate)));
  out.push(...(await runCases('account-specific', A.accountSpecific)));
  out.push(...(await runCases('multi-turn', A.multiTurn)));
  out.push(...(await runCases('unicode', A.unicode)));
  out.push(...(await runCases('non-english', A.nonEnglish.map(([id, t]) => [id, t, { noAnswer: true }]))));
  out.push(...(await runGating()));
  out.push(...(await runRobustness()));
  out.push(...(await runGeneral()));
  out.push(...(await runVaried()));
  out.push(...(await runCases('probes-novel', PROBES.map((t, i) => ['PR' + String(i + 1).padStart(2, '0'), t, { noAnswer: true }]))));
  out.push(...(await runFeeSweep()));
  out.push(...(await runMixedSweep()));
  out.push(...(await runWrapperStability()));
  return out;
}

function summarize(rows) {
  const sets = {};
  for (const r of rows) {
    const s = (sets[r.set] = sets[r.set] || { total: 0, pass: 0, fail: 0, leaks: 0, falseRefusals: 0 });
    s.total++;
    if (r.pass) s.pass++;
    else s.fail++;
    if (r.leak) s.leaks++;
    if (r.falseRefusal) s.falseRefusals++;
  }
  return sets;
}

module.exports = { runAll, summarize };
