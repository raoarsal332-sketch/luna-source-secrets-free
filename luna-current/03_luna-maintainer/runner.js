'use strict';

/**
 * runner.js - the golden-case test runner Luna does not have.
 *
 * package.json currently says "no test specified", and analytics.toGoldenCase
 * writes cases for "the test runner" that was never built. This is it.
 *
 * Two case kinds, both fully offline - no Intercom, no OpenAI, no network:
 *
 *   kind:"presend"  replays a conversation through the REAL statePresend.gate()
 *                   loaded from `root`, with a scripted draft, and asserts on
 *                   the hard-fail codes, the send decision and the final body.
 *   kind:"module"   calls an exported function of a Luna module and asserts on
 *                   the return value (escalation gates, handoff gates, account
 *                   preference, soft edges, identity checks).
 *
 * Case format is a superset of analytics.toGoldenCase(), so a captured
 * production failure becomes a regression case with no conversion step.
 * Cases with reviewed:false are skipped until a human fills `expected`.
 */

const fs = require('fs');
const path = require('path');
const bridge = require('./bridge');

function loadCases(dirs) {
  const out = [];
  for (const dir of dirs.filter(Boolean)) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith('.json')) continue;
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const c of Array.isArray(parsed) ? parsed : [parsed]) out.push(Object.assign({ pack: path.basename(f, '.json') }, c));
    }
  }
  return out;
}

function deepGet(obj, dotted) {
  return String(dotted).split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function assertValue(actual, expect, label, fails) {
  if (expect === undefined || expect === null) return;
  if ('equals' in expect && JSON.stringify(actual) !== JSON.stringify(expect.equals)) fails.push(`${label}: expected ${JSON.stringify(expect.equals)}, got ${JSON.stringify(actual)}`);
  if ('truthy' in expect && !!actual !== !!expect.truthy) fails.push(`${label}: expected truthy=${expect.truthy}, got ${JSON.stringify(actual)}`);
  if ('contains' in expect && !String(actual || '').toLowerCase().includes(String(expect.contains).toLowerCase())) fails.push(`${label}: missing ${JSON.stringify(expect.contains)}`);
}

async function runPresendCase(root, c) {
  const sp = bridge.statePresend(root);
  const fails = [];
  const started = Date.now();
  sp.resetAll();

  const convId = c.conversationId || `case-${c.id}`;
  let lastClient = '';
  for (const m of c.messages || []) {
    if (m.role === 'client') { lastClient = m.text; sp.noteInbound(convId, m.text, { body: m.text, created_at: Date.now() }, m.attachments || []); }
    else if (m.role === 'bot') sp.noteOutbound(convId, m.text);
    else if (m.role === 'human') sp.noteHuman(convId, m.text);
  }

  const res = await sp.gate({
    conversationId: convId,
    draft: c.draft,
    latestUser: { body: lastClient, created_at: Date.now() },
    history: null,
    knowledge: c.knowledge || null,
    regenerate: null, // deterministic: no model call, so a hard fail cannot be "fixed away"
    maxRetries: 0,
  });

  const codes = ((res.result && res.result.hardFails) || []).map((f) => f.code);
  const soft = ((res.result && res.result.softWarnings) || []).map((w) => w.code);
  const e = c.expected || {};

  if (e.presend_ok !== undefined && e.presend_ok !== null && !!(res.result && res.result.ok) !== !!e.presend_ok) {
    fails.push(`presend_ok expected ${e.presend_ok}, got ${res.result && res.result.ok} (codes: ${codes.join(',') || 'none'})`);
  }
  for (const code of e.must_fail_codes || []) if (!codes.includes(code)) fails.push(`expected hard fail ${code}, got [${codes.join(',') || 'none'}]`);
  for (const code of e.must_not_fail_codes || []) if (codes.includes(code)) fails.push(`unexpected hard fail ${code}`);
  if (e.send !== undefined && e.send !== null && !!res.send !== !!e.send) fails.push(`send expected ${e.send}, got ${res.send}`);
  for (const re of e.reply_must_match || []) if (!new RegExp(re, 'i').test(res.body || '')) fails.push(`reply did not match /${re}/i`);
  for (const re of e.reply_must_not_match || []) if (new RegExp(re, 'i').test(res.body || '')) fails.push(`reply matched forbidden /${re}/i`);

  return {
    id: c.id, pack: c.pack, kind: 'presend', passed: !fails.length, failures: fails,
    metrics: {
      correct: fails.length ? 0 : 1,
      unsupported: codes.some((x) => x.startsWith('UNSUPPORTED') || x === 'KNOWLEDGE_GAP_UNSAFE') ? 1 : 0,
      duplicate: codes.some((x) => x === 'DUPLICATE_REPLY' || x === 'SEMANTIC_REPEAT') ? 1 : 0,
      escalationErr: codes.includes('UNNECESSARY_ESCALATION') ? 1 : 0,
      hardFails: codes.length, softWarnings: soft.length, latencyMs: Date.now() - started,
    },
    observed: { codes, soft, send: res.send, reason: res.reason, body: String(res.body || '').slice(0, 300) },
  };
}

function runModuleCase(root, c) {
  const fails = [];
  const started = Date.now();
  let actual;
  try {
    const mod = bridge.loadModule(root, c.module);
    const fn = deepGet(mod, c.fn);
    if (typeof fn !== 'function') throw new Error(`${c.module}.${c.fn} is not a function`);
    actual = fn(...(c.args || []));
    if (c.pick) actual = deepGet(actual, c.pick);
  } catch (err) {
    return { id: c.id, pack: c.pack, kind: 'module', passed: false, failures: [`threw: ${err.message}`], metrics: { correct: 0, latencyMs: Date.now() - started }, observed: null };
  }
  assertValue(actual, c.expected, `${c.module}.${c.fn}`, fails);
  return {
    id: c.id, pack: c.pack, kind: 'module', passed: !fails.length, failures: fails,
    metrics: { correct: fails.length ? 0 : 1, unsupported: 0, duplicate: 0, escalationErr: 0, hardFails: 0, softWarnings: 0, latencyMs: Date.now() - started },
    observed: { actual },
  };
}

async function runSuite(root, cases) {
  const results = [];
  for (const c of cases) {
    if (c.reviewed === false) { results.push({ id: c.id, pack: c.pack, kind: c.kind || 'presend', skipped: true, passed: true, failures: [], metrics: { correct: 1, latencyMs: 0 } }); continue; }
    try {
      results.push(c.kind === 'module' ? runModuleCase(root, c) : await runPresendCase(root, c));
    } catch (err) {
      results.push({ id: c.id, pack: c.pack, kind: c.kind || 'presend', passed: false, failures: [`runner raised: ${err.message}`], metrics: { correct: 0, latencyMs: 0 } });
    }
  }
  return results;
}

module.exports = { loadCases, runSuite, runPresendCase, runModuleCase };
