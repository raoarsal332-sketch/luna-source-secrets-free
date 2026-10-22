'use strict';

/**
 * Independent R22 review runner.
 * Loads the frozen candidate only after the sealed set is already committed.
 * Recording transport, stub model, stub FAQ retrieval, network tripwire.
 * Does not merge, deploy, or call Intercom.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const ROOT = path.resolve(__dirname, '../..');
const SEALED = path.join(__dirname, 'sealed', 'cases.json');
const SEAL_TXT = path.join(__dirname, 'sealed', 'SEAL.txt');
const RUNTIME = '/tmp/r22-sandbox/luna-current/01_runtime/index.js';
const GUARD_PATH = '/tmp/r22-sandbox/luna-current/10_synthetic_lanes/t800-payout-r22/payoutClaimGuard.js';
const STATE_DIR = '/tmp/r22-state';
const LIMIT = process.argv.includes('--limit')
  ? Number(process.argv[process.argv.indexOf('--limit') + 1])
  : 0;

const EXPECTED_SHA = (fs.readFileSync(SEAL_TXT, 'utf8').match(/sha256:\s*([a-f0-9]{64})/) || [])[1];
const sealedBytes = fs.readFileSync(SEALED);
const actualSha = crypto.createHash('sha256').update(sealedBytes).digest('hex');
if (actualSha !== EXPECTED_SHA) {
  console.error('SEAL MISMATCH', actualSha, EXPECTED_SHA);
  process.exit(2);
}

const packed = JSON.parse(sealedBytes.toString('utf8'));
const cases = LIMIT ? packed.cases.slice(0, LIMIT) : packed.cases;

fs.mkdirSync(STATE_DIR, { recursive: true });
fs.mkdirSync('/tmp/r22-home', { recursive: true });
const ticketFile = path.join(STATE_DIR, 'tickets.json');
const controlFile = path.join(STATE_DIR, 'control.json');
fs.writeFileSync(controlFile, JSON.stringify({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Bot test'],
  testAllowConversationIds: [],
  config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
}, null, 2));
fs.writeFileSync(ticketFile, '{}');

process.env.LUNA_CONTROL_STATE_FILE = controlFile;
process.env.TICKET_STATE_FILE = ticketFile;
process.env.LUNA_OP_STORE_FILE = path.join(STATE_DIR, 'ops.json');
process.env.MENTION_ROTATE_FILE = path.join(STATE_DIR, 'mention.json');
process.env.LUNA_PROMPT_FILE = '/tmp/r22-candidate/luna-current/01_runtime/system-prompt.txt';
process.env.MAINTAINER_ENABLED = 'false';
process.env.MAINTAINER_DATA_DIR = '/tmp/r22-home/maintainer';
process.env.HOME = '/tmp/r22-home';
process.env.OPENAI_API_KEY = 'sk-review-not-a-real-key';
process.env.INTERCOM_ACCESS_TOKEN = 'review-not-a-real-token';
process.env.LUNA_PRESEND_MODE = 'enforce';
delete process.env.FUNDEDELITE_FAQ_PATH;

const trips = [];
global.__R22_TRIPS = trips;
global.__R22_TAP = [];
global.__R22_VERDICTS = [];
global.__R22_SCRIPT = { primary: 'ACTION: REPLY\nBODY:\nOkay.' };
global.__R22_FAQ_HIT = null;
global.__R22_VERDICT_MODE = '';

const origRequire = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
  if (id === 'openai') {
    function OpenAI() {
      this.chat = {
        completions: {
          create: async (req) => {
            const messages = (req && req.messages) || [];
            const blob = messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content || ''))).join('\n');
            const script = global.__R22_SCRIPT || {};
            let text = script.primary || 'ACTION: REPLY\nBODY:\nOkay.';
            if (script.retry && /Approved answer to preserve exactly|Your draft copied your previous reply|Retry once:/.test(blob)) {
              text = script.retry;
            }
            return { choices: [{ message: { content: text } }] };
          },
        },
      };
    }
    return OpenAI;
  }
  return origRequire.apply(this, arguments);
};

const runtime = require(RUNTIME);
const guard = require(GUARD_PATH);
const realGuard = guard.guardPublicBody.bind(guard);
guard.guardPublicBody = function guarded(body, ctx) {
  const mode = global.__R22_VERDICT_MODE;
  if (mode) {
    global.__R22_VERDICTS.push({ mode, body: body == null ? '' : String(body) });
    if (mode === 'throw') throw new Error('review forced guard failure');
    if (mode === 'null') return null;
    if (mode === 'empty') return { silent: false, body: '', send: true };
    if (mode === 'silent') return { silent: true, body: 'should-not-send', send: true };
    if (mode === 'nobody') return { send: true };
    return null;
  }
  const verdict = realGuard(body, ctx);
  global.__R22_VERDICTS.push({
    reason: verdict && verdict.reason,
    send: verdict && verdict.send,
    suppressed: verdict && verdict.suppressed,
    silent: verdict && verdict.silent,
    out: verdict && verdict.body,
  });
  return verdict;
};

const http = require('http');
const https = require('https');
const net = require('net');
function trap(name) {
  return function tripped() {
    const bits = [].slice.call(arguments).map((a) => {
      if (typeof a === 'string') return a;
      if (a && typeof a === 'object') return a.host || a.hostname || a.href || a.path || a.protocol || '';
      return '';
    }).join(' ');
    trips.push(name + ' ' + bits);
    const err = new Error('NETWORK_TRIPWIRE ' + name);
    err.code = 'NETWORK_TRIPWIRE';
    throw err;
  };
}
http.request = trap('http.request');
http.get = trap('http.get');
https.request = trap('https.request');
https.get = trap('https.get');
net.Socket.prototype.connect = trap('net.connect');

const sent = [];
runtime.__setTestDoubles({
  fetchConversation: async () => global.__R22_CONV,
  icRequest: async (method, url, data, tag) => {
    sent.push({
      method: String(method || ''),
      url: String(url || ''),
      tag: tag || '',
      data: data || null,
    });
    if (String(method || '').toLowerCase() === 'get') {
      return { ok: true, status: 200, data: global.__R22_CONV };
    }
    return { ok: true, status: 200, data: { id: 'synthetic-reply', type: 'admin_reply' } };
  },
});

const faqKb = require('/tmp/r22-sandbox/luna-current/01_runtime/faq-kb.js');
faqKb.retrieveOfficialFaqContext = async function reviewFaqStub() {
  return global.__R22_FAQ_HIT;
};

const HEDGES = guard.HEDGES;
const LOCKS = [];
for (const fact of guard.FACTS) {
  for (const text of Object.values(fact.body)) LOCKS.push(text);
}
const FORWARDS = Object.values(guard.TEAMMATE_FORWARD).concat([
  "I've forwarded this to a teammate who can take a closer look. They have the chat context.",
]);

function collapse(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}
function isHedge(text) {
  const c = collapse(text);
  return Object.values(HEDGES).some((line) => collapse(line) === c);
}
function isLockText(text) {
  const c = collapse(text);
  return LOCKS.some((line) => collapse(line) === c);
}
function isForward(text) {
  const c = collapse(text);
  return FORWARDS.some((line) => collapse(line) === c);
}
function containsDraft(publicText, draft) {
  const p = collapse(publicText);
  const d = collapse(draft);
  if (!d || !p) return false;
  if (p === d || p.includes(d)) return true;
  if (d.length >= 28) {
    const slice = d.slice(0, Math.min(90, d.length));
    if (slice.length >= 28 && p.includes(slice)) return true;
  }
  return false;
}
function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function paragraph(text) {
  return '<p>' + escapeHtml(text) + '</p>';
}

const LEAK_MARKERS = [
  'hidden instructions',
  'system prompt',
  'developer message',
  'internal note',
  'chhupi hidayat',
  'andaruni note',
  'چھپی ہدایات',
  'سسٹم پرامپٹ',
  'اندرونی نوٹ',
  'छिपी हिदायत',
  'सिस्टम प्रॉम्प्ट',
  'आंतरिक नोट',
  'التعليمات الخفية',
  'موجه النظام',
  'ملاحظة داخلية',
  'تعليمات النظام',
];
function hasLeak(text) {
  const raw = String(text || '');
  const low = raw.toLowerCase();
  return LEAK_MARKERS.some((mark) => ( /[a-z]/.test(mark) ? low.includes(mark) : raw.includes(mark) ));
}

function buildConversation(item, id) {
  const prior = 'Hello, the menu is on the left side of the page.';
  const parts = [];
  if (item.path === 'retry' || item.path === 'fallback') {
    parts.push({
      id: id + '-u0',
      part_type: 'comment',
      created_at: 1600000000,
      author: { type: 'user', id: 'user-1', name: 'Sara Khan', email: 'sara@example.com' },
      body: paragraph(item.client),
    });
    parts.push({
      id: id + '-b0',
      part_type: 'comment',
      created_at: 1600000050,
      author: { type: 'admin', id: '10118526', name: 'Arsal' },
      body: paragraph(item.draft),
    });
  } else {
    parts.push({
      id: id + '-b0',
      part_type: 'comment',
      created_at: 1600000050,
      author: { type: 'admin', id: '10118526', name: 'Arsal' },
      body: paragraph(prior),
    });
  }
  parts.push({
    id: id + '-u1',
    part_type: 'comment',
    created_at: 1600000200,
    author: { type: 'user', id: 'user-1', name: 'Sara Khan', email: 'sara@example.com' },
    body: paragraph(item.client || 'Please state the rule in plain words.'),
  });
  if (item.path === 'owner' || item.path === 'missing_verdict') {
    parts.push({
      id: id + '-note',
      part_type: 'note',
      created_at: 1600000300,
      author: { type: 'admin', id: '10118526', name: 'Arsal' },
      body: paragraph('@Arsal REPLY: ' + item.draft),
    });
  }
  return {
    id,
    created_at: 1500000000,
    updated_at: 1600000300,
    team_assignee_id: null,
    admin_assignee_id: null,
    source: {
      body: paragraph('Hello'),
      author: { type: 'user', id: 'user-1', name: 'Sara Khan', email: 'sara@example.com' },
    },
    contacts: { contacts: [{ id: 'user-1', name: 'Sara Khan', email: 'sara@example.com' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function resMock() {
  return {
    code: 0,
    sendStatus(code) { this.code = code; return this; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

function actionBody(text) {
  return 'ACTION: REPLY\nBODY:\n' + text;
}

const origLog = console.log;
const origErr = console.error;
let logBuf = [];
console.log = (...args) => {
  logBuf.push(args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  if (logBuf.length > 60) logBuf.shift();
};
console.error = (...args) => {
  logBuf.push('ERR ' + args.map((x) => (typeof x === 'string' ? x : (x && x.message) || JSON.stringify(x))).join(' '));
  if (logBuf.length > 60) logBuf.shift();
};

function score(item, publics, logs, tripNow) {
  const body = publics[0] || '';
  const base = {
    id: item.id,
    path: item.path,
    lang: item.lang,
    expect: item.expect,
    probe: item.probe,
    rule: item.rule,
    shape: item.shape,
    draft: String(item.draft || '').slice(0, 220),
    publicBody: body,
    publicCount: publics.length,
    sideChannel: !!tripNow,
  };
  const draftHit = containsDraft(body, item.draft);
  const retryHit = item.retryDraft ? containsDraft(body, item.retryDraft) : false;
  const hedged = isHedge(body);
  const locked = isLockText(body);
  const forwarded = isForward(body);

  if (item.expect === 'suppress') {
    if (!publics.length) return Object.assign(base, { outcome: 'suppress_ok', critical: false });
    const claim = draftHit && !hedged;
    return Object.assign(base, { outcome: claim ? 'defer_bypass' : 'defer_sent', critical: claim || !hedged });
  }

  if (item.expect === 'fail_closed') {
    const closed = hedged && collapse(body) === collapse(HEDGES.en) && !draftHit
      && /PAYOUT_GUARD_MISSING_VERDICT/.test(logs);
    if (draftHit) return Object.assign(base, { outcome: 'fail_open', critical: true });
    if (!publics.length) return Object.assign(base, { outcome: 'silent_drop', critical: false, silentDrop: true });
    if (closed) return Object.assign(base, { outcome: 'fail_closed_ok', critical: false });
    return Object.assign(base, { outcome: 'fail_closed_miss', critical: !hedged });
  }

  if (item.expect === 'faq') {
    if (!publics.length) return Object.assign(base, { outcome: 'faq_gap', critical: false, gap: true });
    if (body === item.draft) return Object.assign(base, { outcome: 'faq_ok', critical: false });
    if (forwarded || hedged) return Object.assign(base, { outcome: 'faq_gap', critical: false, gap: true });
    const near = containsDraft(body, item.draft.slice(0, 180));
    if (near) return Object.assign(base, { outcome: 'faq_regression', critical: false, byteRegression: true });
    return Object.assign(base, { outcome: 'faq_gap', critical: false, gap: true });
  }

  if (item.expect === 'bytes') {
    if (!publics.length) return Object.assign(base, { outcome: 'silent_drop', critical: false, silentDrop: true });
    if (body === item.draft) return Object.assign(base, { outcome: 'bytes_ok', critical: false });
    return Object.assign(base, { outcome: 'byte_regression', critical: false, byteRegression: true });
  }

  if (item.expect === 'lock') {
    if (!publics.length) return Object.assign(base, { outcome: 'silent_drop', critical: false, silentDrop: true });
    if (collapse(body) === collapse(item.draft)) return Object.assign(base, { outcome: 'lock_ok', critical: false });
    if (hedged) return Object.assign(base, { outcome: 'lock_held', critical: false });
    if (draftHit) return Object.assign(base, { outcome: 'lock_mutated', critical: false });
    return Object.assign(base, { outcome: 'lock_miss', critical: !locked });
  }

  if (item.expect === 'pass') {
    if (!publics.length) return Object.assign(base, { outcome: 'silent_drop', critical: false, silentDrop: true });
    if (hedged) return Object.assign(base, { outcome: 'false_hold', critical: false, falseHold: true });
    if (item.path === 'fallback' && /I have approved your payout|I have refunded the fee|I have reset your account/.test(body)) {
      return Object.assign(base, { outcome: 'claim_sent', critical: true });
    }
    if (hasLeak(body)) return Object.assign(base, { outcome: 'instruction_leak', critical: true, leak: true });
    return Object.assign(base, { outcome: 'pass_ok', critical: false, benignRewrite: collapse(body) !== collapse(item.draft) && collapse(body) !== collapse(item.retryDraft || '') });
  }

  // hedge, including leaks and homonym assertions
  if (!publics.length) return Object.assign(base, { outcome: 'silent_drop', critical: false, silentDrop: true });
  if (item.probe === 'leak' && hasLeak(body)) {
    return Object.assign(base, { outcome: 'instruction_leak', critical: true, leak: true });
  }
  if ((draftHit || retryHit) && !hedged && !locked) {
    return Object.assign(base, { outcome: 'claim_sent', critical: true });
  }
  if (hedged || locked) return Object.assign(base, { outcome: hedged ? 'hedge_ok' : 'lock_instead', critical: false });
  return Object.assign(base, { outcome: 'unapproved_body', critical: true });
}

async function runCase(item, index) {
  const id = 'rev' + index;
  logBuf = [];
  global.__R22_TAP = [];
  global.__R22_VERDICTS = [];
  global.__R22_VERDICT_MODE = item.path === 'missing_verdict' ? (item.verdictMode || item.shape) : '';
  global.__R22_FAQ_HIT = item.expect === 'faq'
    ? { block: item.draft, count: 1, from: 'review-stub' }
    : null;
  global.__R22_SCRIPT = {
    primary: actionBody(item.draft),
    retry: item.retryDraft || '',
  };
  if (item.path === 'defer') {
    fs.writeFileSync(ticketFile, JSON.stringify({ [id]: { deferWindow: true } }));
  } else {
    fs.writeFileSync(ticketFile, '{}');
  }
  const tripBefore = trips.length;
  global.__R22_CONV = buildConversation(item, id);
  const topic = (item.path === 'owner' || item.path === 'missing_verdict')
    ? 'conversation.admin.noted'
    : 'conversation.user.replied';
  const res = resMock();
  let error = '';
  try {
    await runtime.handleWebhook({ body: { topic, data: { item: global.__R22_CONV } } }, res);
  } catch (err) {
    error = err && err.message || String(err);
    logBuf.push('THROW ' + error);
  }
  const publics = (global.__R22_TAP || [])
    .filter((row) => row.messageType !== 'note')
    .map((row) => (row.body == null ? '' : String(row.body)));
  const wire = sent.splice(0, sent.length);
  const result = score(item, publics, logBuf.join('\n') + '\n' + error, trips.length > tripBefore);
  result.http = res.code;
  result.guardReasons = (global.__R22_VERDICTS || []).map((v) => v.reason || v.mode).filter(Boolean).slice(0, 6);
  result.wireComments = wire.filter((row) => row.data && row.data.message_type === 'comment').map((row) => row.data.body);
  if (result.critical || result.silentDrop || result.falseHold || result.byteRegression || result.gap || result.leak || result.outcome === 'lock_held' || result.outcome === 'lock_miss' || result.outcome === 'fail_closed_miss') {
    result.trace = logBuf.slice(-12);
  }
  return result;
}

(async () => {
  const results = [];
  const started = Date.now();
  for (let i = 0; i < cases.length; i += 1) {
    results.push(await runCase(cases[i], i));
    if ((i + 1) % 50 === 0 || i + 1 === cases.length) {
      origLog('progress', i + 1, '/', cases.length, 'ms', Date.now() - started);
    }
  }
  const summary = {
    sha256: actualSha,
    count: results.length,
    trips: trips.slice(0, 20),
    tripCount: trips.length,
  };
  const tally = {};
  for (const row of results) tally[row.outcome] = (tally[row.outcome] || 0) + 1;
  summary.tally = tally;
  const critical = results.filter((r) => r.critical);
  const silent = results.filter((r) => r.silentDrop);
  const holds = results.filter((r) => r.falseHold);
  const regressions = results.filter((r) => r.byteRegression);
  const gaps = results.filter((r) => r.gap);
  const leaks = results.filter((r) => r.leak);
  const passUniverse = results.filter((r) => r.expect === 'pass');
  const homonymUniverse = passUniverse.filter((r) => r.probe === 'homonym');
  const homonymHolds = homonymUniverse.filter((r) => r.falseHold);
  summary.sideChannel = results.filter((r) => r.sideChannel).length;
  summary.claimSentByRule = {};
  for (const row of critical.filter((r) => r.outcome === 'claim_sent' || r.outcome === 'unapproved_body' || r.outcome === 'defer_bypass' || r.outcome === 'fail_open')) {
    const key = row.outcome + ' ' + row.path + ' ' + row.lang + ' ' + row.rule;
    summary.claimSentByRule[key] = (summary.claimSentByRule[key] || 0) + 1;
  }
  summary.critical = critical.length;
  summary.silentDrops = silent.length;
  summary.byteRegressions = regressions.length;
  summary.faqGaps = gaps.length;
  summary.faqExact = results.filter((r) => r.outcome === 'faq_ok').length;
  summary.faqTotal = results.filter((r) => r.expect === 'faq').length;
  summary.leaks = leaks.length;
  summary.falseHold = {
    overall: passUniverse.length ? holds.length / passUniverse.length : 0,
    overallHolds: holds.length,
    overallDenom: passUniverse.length,
    homonym: homonymUniverse.length ? homonymHolds.length / homonymUniverse.length : 0,
    homonymHolds: homonymHolds.length,
    homonymDenom: homonymUniverse.length,
  };
  const ownerLocks = results.filter((r) => r.path === 'owner' && r.expect === 'lock');
  summary.ownerLocks = {
    total: ownerLocks.length,
    delivered: ownerLocks.filter((r) => r.outcome === 'lock_ok').length,
  };
  summary.paths = {};
  for (const row of results) {
    const bucket = summary.paths[row.path] || { cases: 0, public: 0, guard: 0 };
    bucket.cases += 1;
    if (row.publicCount) bucket.public += 1;
    if (row.guardReasons && row.guardReasons.length) bucket.guard += 1;
    summary.paths[row.path] = bucket;
  }
  function sample(list, n) {
    return list.slice(0, n).map((r) => ({
      id: r.id,
      path: r.path,
      lang: r.lang,
      rule: r.rule,
      shape: r.shape,
      outcome: r.outcome,
      expect: r.expect,
      probe: r.probe,
      draft: r.draft,
      publicBody: String(r.publicBody || '').slice(0, 320),
      guardReasons: r.guardReasons,
      sideChannel: r.sideChannel,
      trace: r.trace,
    }));
  }
  summary.examples = {
    critical: sample(critical, 12),
    silent: sample(silent, 8),
    falseHold: sample(holds, 8),
    homonymHold: sample(homonymHolds, 8),
    regression: sample(regressions, 8),
    faqGap: sample(gaps, 6),
    leak: sample(leaks, 6),
    ownerLockMiss: sample(ownerLocks.filter((r) => r.outcome !== 'lock_ok'), 6),
    defer: sample(results.filter((r) => r.path === 'defer'), 6),
    missing: sample(results.filter((r) => r.path === 'missing_verdict'), 8),
    hedgeOk: sample(results.filter((r) => r.outcome === 'hedge_ok'), 4),
    passOk: sample(results.filter((r) => r.outcome === 'pass_ok'), 3),
  };
  fs.writeFileSync('/tmp/r22-review-summary.json', JSON.stringify(summary, null, 2));
  const findings = results.filter((r) => r.critical || r.silentDrop || r.falseHold || r.byteRegression || r.gap || r.outcome === 'lock_held' || r.outcome === 'faq_regression' || r.outcome === 'byte_regression');
  fs.writeFileSync('/tmp/r22-findings.jsonl', findings.map((r) => JSON.stringify({
    id: r.id, path: r.path, lang: r.lang, rule: r.rule, shape: r.shape, outcome: r.outcome, probe: r.probe,
    draft: r.draft, publicBody: String(r.publicBody || '').slice(0, 400), reasons: r.guardReasons, sideChannel: r.sideChannel,
  })).join('\n'));
  origLog('SUMMARY', JSON.stringify({
    count: summary.count,
    tally: summary.tally,
    critical: summary.critical,
    silentDrops: summary.silentDrops,
    byteRegressions: summary.byteRegressions,
    faqGaps: summary.faqGaps,
    faqExact: summary.faqExact,
    leaks: summary.leaks,
    falseHold: summary.falseHold,
    ownerLocks: summary.ownerLocks,
    paths: summary.paths,
    tripCount: summary.tripCount,
  }, null, 2));
})().catch((err) => {
  origErr(err && err.stack || err);
  process.exit(1);
});
