'use strict';

/**
 * Independent R7 integration harness.
 * Loads the patched runtime, stubs axios and OpenAI, and calls handleWebhook.
 * Does not merge, approve, activate, deploy, or contact Intercom.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const crypto = require('crypto');

const ROOT = '/tmp/cred-r7-scratch/luna-current';
const RUNTIME = path.join(ROOT, '01_runtime');
const STATE = '/tmp/cred-r7-state';
const CASES_FILE = '/tmp/cred-r7-work/cases.js';

const caseSrc = fs.readFileSync(CASES_FILE);
const caseHash = crypto.createHash('sha256').update(caseSrc).digest('hex');
const { cases } = require(CASES_FILE);

const FAQ = 'No, Funded Elite is not a broker and does not accept deposits.';

fs.mkdirSync(STATE, { recursive: true });
fs.mkdirSync('/tmp/cred-r7-home', { recursive: true });

process.env.LUNA_CONTROL_STATE_FILE = path.join(STATE, 'bot-control.json');
process.env.LUNA_PROMPT_FILE = path.join(RUNTIME, 'system-prompt.txt');
process.env.LUNA_OP_STORE_FILE = path.join(STATE, 'ops.json');
process.env.TICKET_STATE_FILE = path.join(STATE, 'tickets.json');
process.env.MENTION_ROTATE_FILE = path.join(STATE, 'mention.json');
process.env.IMAGE_GUARD_STATE_FILE = path.join(STATE, 'image.json');
process.env.MAINTAINER_DATA_DIR = path.join(STATE, 'maintainer');
process.env.MAINTAINER_ENABLED = 'true';
process.env.MAINTAINER_DRY_RUN = 'true';
process.env.OPENAI_API_KEY = 'synthetic-review-key';
process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-review-token';
process.env.HOME = '/tmp/cred-r7-home';
process.env.LUNA_PRESEND_MODE = 'enforce';
process.env.LUNA_TOOLS_ENABLED = '1';

fs.writeFileSync(process.env.LUNA_CONTROL_STATE_FILE, JSON.stringify({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Bot test'],
  testAllowConversationIds: [],
  config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
}, null, 2));

const httpRecords = [];
const modelRecords = [];
const fixtures = new Map();
const axiosMode = { kind: 'ok' };
let modelQueue = [];
let toolFirst = false;

function snapshot(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function streamFrom(buf) {
  const { Readable } = require('stream');
  return Readable.from([buf]);
}

async function axiosImpl(config) {
  const cfg = config || {};
  const method = String(cfg.method || 'get').toLowerCase();
  const url = String(cfg.url || '');
  const data = cfg.data;
  httpRecords.push({ method: method, url: url, data: snapshot(data) });
  if (cfg.responseType === 'stream') {
    return { status: 200, data: streamFrom(PNG), headers: { 'content-type': 'image/png', 'content-length': String(PNG.length) } };
  }
  if (axiosMode.kind === 'throw' && method === 'post' && url.indexOf('/reply') !== -1) {
    const body = data && data.body ? String(data.body).slice(0, 180) : '';
    const err = new Error('synthetic timeout body=' + body);
    err.code = 'ETIMEDOUT';
    throw err;
  }
  if (method === 'get' && url.indexOf('/conversations/') !== -1 && url.indexOf('/reply') === -1) {
    const id = decodeURIComponent(url.split('/conversations/')[1].split(/[/?#]/)[0]);
    const conv = fixtures.get(id);
    if (!conv) return { status: 404, data: { errors: [{ code: 'not_found' }] }, headers: {} };
    return { status: 200, data: snapshot(conv), headers: {} };
  }
  if (axiosMode.kind === 'fail400' && method === 'post') {
    const planted = (axiosMode.marker || 'synthetic-error') ;
    return {
      status: 400,
      data: { errors: [{ code: 'synthetic', message: 'echo ' + planted }] },
      headers: {},
    };
  }
  if (url.indexOf('/conversations/search') !== -1) {
    return { status: 200, data: { conversations: [], pages: {} }, headers: {} };
  }
  return { status: 200, data: { type: 'conversation', id: 'synthetic-ok' }, headers: {} };
}
axiosImpl.post = function post(url, data, config) {
  return axiosImpl(Object.assign({}, config || {}, { method: 'post', url: url, data: data }));
};
axiosImpl.get = function get(url, config) {
  return axiosImpl(Object.assign({}, config || {}, { method: 'get', url: url }));
};
axiosImpl.request = axiosImpl;
axiosImpl.create = function create() { return axiosImpl; };

class OpenAI {
  constructor() {}
}
OpenAI.prototype.chat = {
  completions: {
    create: async function create(req) {
      modelRecords.push(snapshot(req));
      if (toolFirst) {
        toolFirst = false;
        return {
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_synth_1',
                type: 'function',
                function: { name: 'get_state', arguments: '{}' },
              }],
            },
          }],
        };
      }
      const next = modelQueue.length ? modelQueue.shift() : ('ACTION: REPLY\nKIND: FAQ_CONFIRM\nBODY: ' + FAQ);
      return { choices: [{ message: { content: next, tool_calls: [] } }] };
    },
  },
};

const origLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'axios') return axiosImpl;
  if (request === 'openai') return OpenAI;
  return origLoad.apply(this, arguments);
};

function probeLayouts() {
  const out = [];
  const layoutMaint = '/tmp/cred-r7-layout/01_runtime/luna-maintainer';
  fs.cpSync(path.join(ROOT, '03_luna-maintainer'), layoutMaint, { recursive: true });
  try {
    require('/tmp/cred-r7-layout/01_runtime/statePresend/statePresend.js');
    out.push({ layout: 'statePresend-copied-beside-index', loaded: true });
  } catch (e) {
    out.push({ layout: 'statePresend-copied-beside-index', loaded: false, error: String(e && e.message || e) });
  }
  try {
    require(path.join(layoutMaint, 'collector.js'));
    out.push({ layout: 'collector-copied-beside-index', loaded: true });
  } catch (e) {
    out.push({ layout: 'collector-copied-beside-index', loaded: false, error: String(e && e.message || e) });
  }
  return out;
}

const layoutProbe = probeLayouts();

const engine = require(path.join(RUNTIME, 'index.js'));
const guard = require(path.join(ROOT, '10_synthetic_lanes/credential-guard-r7/credentialGuardR7.js'));
const statePresend = require(path.join(RUNTIME, 'statePresend/statePresend.js'));

const dns = require('dns');
dns.lookup = function lookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const row = { address: '93.184.216.34', family: 4 };
  if (options && options.all) return callback(null, [row]);
  callback(null, row.address, 4);
};

const SPREAD = guard.SPREAD_TEST_REPLY;
const FIXED = guard.FIXED_MESSAGE;
const TEMPLATE_PASSWORD = guard.TEMPLATE_PASSWORD;
const GREET = /^(?:Hello|Ciao|Salam)(?: [A-Za-zÀ-ÿ'-]+)?,\n\n|^السلام علیکم(?: [A-Za-zÀ-ÿ'-]+)?،\n\n/;

function plain(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\r\n/g, '\n')
    .trim();
}

function isTemplate(text) {
  if (text === SPREAD) return true;
  const m = GREET.exec(text);
  if (!m) return false;
  return text.slice(m[0].length) === SPREAD;
}

function isFixed(text) {
  if (text === FIXED) return true;
  const m = GREET.exec(text);
  if (!m) return false;
  return text.slice(m[0].length) === FIXED;
}

function norm(s) {
  return String(s || '').normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u180E]/g, '');
}

function hit(hay, marker) {
  if (!marker) return false;
  const h = String(hay || '');
  if (h.indexOf(marker) !== -1) return true;
  const hn = norm(h);
  const mn = norm(marker);
  return !!(mn && hn.indexOf(mn) !== -1);
}

function part(partType, authorType, authorId, body, at, extra) {
  return Object.assign({
    id: 'p' + at + '-' + authorType,
    part_type: partType,
    body: body,
    created_at: at,
    author: { type: authorType, id: String(authorId), name: authorType === 'admin' ? 'Arsal' : 'Sam' },
    attachments: [],
  }, extra || {});
}

function buildConv(cs) {
  const id = 'c' + String(cs.id).replace(/[^A-Za-z0-9]/g, '');
  const userId = 'u' + id;
  const name = cs.name || 'Sam';
  let at = 100;
  const parts = [];
  if (cs.earlierUser) {
    parts.push(part('comment', 'user', userId, cs.earlierUser, at));
    at += 10;
  }
  if (cs.priorBot) {
    parts.push(part('comment', 'admin', '10118526', FAQ, at));
    at += 10;
  }
  const topic = cs.topic || (cs.owner ? 'conversation.admin.noted' : 'conversation.user.replied');
  if (cs.owner) {
    parts.push(part('note', 'admin', '10118526', cs.owner, at + 5));
  } else if (topic !== 'conversation.user.created' && cs.text) {
    parts.push(part('comment', 'user', userId, cs.text, at + 5));
  }
  const conv = {
    id: id,
    open: true,
    state: 'open',
    created_at: cs.createdAt || 0,
    team_assignee_id: null,
    admin_assignee_id: null,
    contacts: { contacts: [{ id: userId, name: name, email: 'sam@example.com' }] },
    source: {
      type: 'conversation',
      body: topic === 'conversation.user.created' ? cs.text : (cs.earlierUser || ''),
      author: { type: 'user', id: userId, name: name },
      created_at: 50,
    },
    conversation_parts: { conversation_parts: parts },
  };
  return { id: id, conv: conv, topic: topic, userId: userId };
}

function fmt(v) {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.message || String(v);
  try { return JSON.stringify(v); } catch (_) { return String(v); }
}

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return ''; }
}

function readTree(dir) {
  let out = '';
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let ents = [];
    try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { continue; }
    for (const ent of ents) {
      const p = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(p);
      else {
        try { out += fs.readFileSync(p, 'utf8') + '\n'; } catch (_) {}
      }
    }
  }
  return out;
}

function clearStores() {
  for (const p of [process.env.LUNA_OP_STORE_FILE, process.env.TICKET_STATE_FILE, process.env.MENTION_ROTATE_FILE, process.env.IMAGE_GUARD_STATE_FILE]) {
    try { fs.unlinkSync(p); } catch (_) {}
  }
  fs.rmSync(process.env.MAINTAINER_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(process.env.MAINTAINER_DATA_DIR, { recursive: true });
  guard.resetStore();
  try { statePresend.resetAll(); } catch (_) {}
}

function classifyPublic(texts) {
  if (!texts.length) return 'silent';
  if (texts.some(isTemplate)) return 'template';
  if (texts.some(isFixed)) return 'fixed';
  return 'other';
}

async function runCase(cs) {
  clearStores();
  httpRecords.length = 0;
  modelRecords.length = 0;
  modelQueue = (cs.model || []).slice();
  toolFirst = !!cs.toolFirst;
  axiosMode.kind = cs.axiosMode || 'ok';
  axiosMode.marker = (cs.markers && cs.markers[0]) || '';
  const built = buildConv(cs);
  fixtures.set(built.id, built.conv);
  const logs = [];
  const orig = {};
  for (const m of ['log', 'error', 'warn', 'info']) {
    orig[m] = console[m];
    console[m] = function patched() {
      const line = Array.prototype.map.call(arguments, fmt).join(' ');
      logs.push(m + ' ' + line);
    };
  }
  const req = { body: { topic: built.topic, data: { item: built.conv } }, headers: {} };
  const res = { statusCode: 0, sendStatus: function sendStatus(code) { this.statusCode = code; return this; } };
  let thrown = null;
  try {
    await engine.handleWebhook(req, res);
    if (cs.replay) await engine.handleWebhook(req, res);
  } catch (e) {
    thrown = e && e.stack ? e.stack : String(e);
  } finally {
    for (const m of ['log', 'error', 'warn', 'info']) console[m] = orig[m];
  }
  const publics = [];
  const notes = [];
  const opens = [];
  const otherPosts = [];
  for (const rec of httpRecords) {
    if (rec.method !== 'post') continue;
    const data = rec.data || {};
    const body = typeof data.body === 'string' ? plain(data.body) : '';
    if (rec.url.indexOf('/reply') !== -1 && data.message_type === 'comment') publics.push(body);
    else if (rec.url.indexOf('/reply') !== -1 && data.message_type === 'note') notes.push(body);
    else if (rec.url.indexOf('/reply') !== -1 && data.message_type === 'open') opens.push(snapshot(data));
    else otherPosts.push({ url: rec.url, data: snapshot(data) });
  }
  const latest = (built.conv.conversation_parts.conversation_parts || []).slice().reverse().find((p) => p.author && (p.author.type === 'user' || p.author.type === 'lead'));
  let memoryText = '';
  let messagesText = '';
  let vision = '';
  try {
    const snap = statePresend.snapshot(built.id);
    memoryText = JSON.stringify(snap);
    const msgs = statePresend.messagesFor(built.id, built.conv.conversation_parts.conversation_parts, latest || null);
    messagesText = JSON.stringify(msgs);
    vision = String(statePresend.getLastVisionHint(built.id) || '');
  } catch (e) {
    memoryText += ' SNAP_ERR ' + (e && e.message);
  }
  const modelText = JSON.stringify(modelRecords);
  const obs = {
    publics: publics,
    notes: notes,
    opens: opens,
    otherPosts: otherPosts,
    logs: logs,
    opstore: readFile(process.env.LUNA_OP_STORE_FILE),
    ticket: readFile(process.env.TICKET_STATE_FILE),
    maintainer: readTree(process.env.MAINTAINER_DATA_DIR),
    memory: memoryText,
    messagesFor: messagesText,
    model: modelText,
    vision: vision,
    http: httpRecords.map((r) => ({ method: r.method, url: r.url, message_type: r.data && r.data.message_type, body: r.data && r.data.body })),
    thrown: thrown,
    statusCode: res.statusCode,
    modelCalls: modelRecords.length,
  };
  return obs;
}

function scan(obs, marker, where) {
  const map = {
    public: obs.publics.join('\n'),
    note: obs.notes.join('\n'),
    log: obs.logs.join('\n'),
    opstore: obs.opstore,
    ticket: obs.ticket,
    maintainer: obs.maintainer,
    memory: obs.memory,
    messagesFor: obs.messagesFor,
    model: obs.model,
    vision: obs.vision,
    thrown: obs.thrown || '',
    other: JSON.stringify(obs.otherPosts || []),
    open: JSON.stringify(obs.opens || []),
  };
  const hits = [];
  for (const key of where) {
    if (hit(map[key], marker)) hits.push(key);
  }
  return hits;
}

function evaluate(cs, obs) {
  const fails = [];
  const markers = (cs.markers || []).filter(Boolean);
  const surfaces = ['public', 'note', 'log', 'opstore', 'ticket', 'maintainer', 'memory', 'messagesFor', 'model', 'vision', 'thrown', 'other', 'open'];
  for (const marker of markers) {
    for (const where of scan(obs, marker, surfaces)) {
      fails.push({ t: 'leak_' + where, marker: marker.slice(0, 12) + (marker.length > 12 ? '…' : '') });
    }
  }
  const always = ['log', 'note', 'opstore', 'ticket', 'maintainer', 'memory', 'messagesFor', 'model', 'vision', 'thrown', 'other', 'open'];
  for (const where of scan(obs, TEMPLATE_PASSWORD, always)) {
    fails.push({ t: 'leak_' + where, marker: 'TEMPLATE_PASSWORD' });
  }
  if (cs.expect !== 'template') {
    for (const where of scan(obs, TEMPLATE_PASSWORD, ['public'])) {
      fails.push({ t: 'unauthorized_template', marker: 'TEMPLATE_PASSWORD', where: where });
    }
    if (obs.publics.some(isTemplate)) fails.push({ t: 'unauthorized_template', marker: 'full_template' });
  }
  if (cs.expect === 'template') {
    if (!obs.publics.some(isTemplate)) {
      fails.push({
        t: cs.preexistingGate ? 'preexisting_gate' : 'missed_direct',
        got: obs.publics.slice(0, 2).map((s) => s.slice(0, 120)),
        logs: obs.logs.filter((l) => /SPREAD|fin-wait|OUTBOUND_BLOCKED|IC_REQ_BLOCKED|SKIP/.test(l)).slice(0, 8),
      });
    }
  }
  if (cs.expect === 'faq') {
    const snippet = cs.faqSnippet || 'not a broker';
    if (obs.publics.some(isFixed)) fails.push({ t: 'overblock_fixed' });
    if (!obs.publics.some((p) => p.indexOf(snippet) !== -1)) fails.push({ t: 'faq_regression', got: classifyPublic(obs.publics) });
  }
  if (cs.expect === 'fixed') {
    if (!obs.publics.some(isFixed)) {
      fails.push({ t: obs.publics.length ? 'secret_not_replaced' : 'held_silent', got: classifyPublic(obs.publics) });
    }
  }
  if (cs.expect === 'blocked-template') {
    if (obs.publics.some(isTemplate) || obs.publics.some((p) => p.indexOf(TEMPLATE_PASSWORD) !== -1)) {
      fails.push({ t: 'unauthorized_template' });
    }
  }
  if (cs.expect === 'silent') {
    if (obs.publics.length) fails.push({ t: 'unexpected_public', got: classifyPublic(obs.publics) });
  }
  if (cs.expect === 'open') {
    const ok = obs.opens.some((p) => p && p.message_type === 'open' && p.type === 'admin' && String(p.admin_id) === '10118526' && !p.body);
    if (!ok) fails.push({ t: 'open_missing', opens: obs.opens });
  }
  if (cs.expect === 'note-redacted') {
    if (obs.publics.some(isTemplate)) fails.push({ t: 'unauthorized_template' });
  }
  if (cs.expect === 'safe-public') {
    if (obs.publics.some(isTemplate)) fails.push({ t: 'unauthorized_template' });
    if (obs.publics.some(isFixed) && cs.allowFixed !== true) {
      /* a fixed message is safe; not a leak */
    }
  }
  const seen = new Set();
  const uniq = [];
  for (const f of fails) {
    const k = f.t + '|' + (f.marker || '') + '|' + (f.got || '');
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(f);
  }
  return uniq;
}

function pathHits(obs) {
  const line = obs.logs.join('\n');
  const names = [
    'SPREAD_TEST_REPLY', 'OUTBOUND_BLOCKED', 'IC_REQ_BLOCKED', 'IC_REQ_ERR', 'IC_REQ_FAIL',
    'IC_REQ_UNKNOWN', 'IC_REQ_REPLAY_SUPPRESSED', 'SKIP model', 'AUTH_NOTE OPEN', 'AUTH_NOTE REPLY',
    'AUTH_NOTE NOTE', 'REPEATED_QUESTION_REPHRASED', 'PRESEND_REGENERATE_FAILED', 'fin-wait',
    'IDENTITY_BEFORE_ESCALATE', 'LUNA_TOOLS_CALL', 'ESCALATED',
  ];
  return names.filter((n) => line.indexOf(n) !== -1);
}

(async function main() {
  const results = [];
  for (const cs of cases) {
    const obs = await runCase(cs);
    const fails = evaluate(cs, obs);
    results.push({
      id: cs.id,
      cls: cs.cls,
      expect: cs.expect,
      firstContact: !!cs.firstContact,
      got: classifyPublic(obs.publics),
      publicCount: obs.publics.length,
      noteCount: obs.notes.length,
      openCount: obs.opens.length,
      modelCalls: obs.modelCalls,
      paths: pathHits(obs),
      fails: fails,
      statusCode: obs.statusCode,
      samplePublic: obs.publics.slice(0, 1).map((s) => s.replace(TEMPLATE_PASSWORD, '[template-password]').slice(0, 180)),
      sampleNote: obs.notes.slice(0, 1).map((s) => s.slice(0, 180)),
    });
  }

  const search = await runSearch();
  const byType = {};
  for (const row of results) {
    for (const f of row.fails) byType[f.t] = (byType[f.t] || 0) + 1;
  }
  const primary = ['leak_public', 'leak_note', 'leak_log', 'leak_opstore', 'leak_memory', 'leak_messagesFor', 'unauthorized_template', 'missed_direct', 'faq_regression', 'overblock_fixed'];
  const primaryFails = results.filter((r) => r.fails.some((f) => primary.indexOf(f.t) !== -1 || f.t === 'leak_messagesFor' || f.t === 'leak_memory'));
  const summary = {
    caseHash: caseHash,
    caseCount: cases.length,
    layoutProbe: layoutProbe,
    failTypeCounts: byType,
    failedIds: results.filter((r) => r.fails.length).map((r) => ({ id: r.id, cls: r.cls, expect: r.expect, got: r.got, fails: r.fails, paths: r.paths, samplePublic: r.samplePublic })),
    passCount: results.filter((r) => r.fails.length === 0).length,
    failCount: results.filter((r) => r.fails.length).length,
    search: search,
    classCounts: countBy(results, 'cls'),
    pathUnion: Array.from(new Set(results.flatMap((r) => r.paths))).sort(),
  };
  fs.writeFileSync('/tmp/cred-r7-work/RESULTS.json', JSON.stringify({ summary: summary, results: results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})().catch((e) => {
  console.error(e && e.stack || e);
  process.exit(1);
});

function countBy(rows, key) {
  const out = {};
  for (const row of rows) out[row[key]] = (out[row[key]] || 0) + 1;
  return out;
}

function runSearch() {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, ['-r', '/tmp/cred-r7-work/search-preload.js', path.join(RUNTIME, 'index.js')], {
      cwd: RUNTIME,
      env: Object.assign({}, process.env, {
        PORT: '18991',
        LUNA_CONTROL_STATE_FILE: '/tmp/cred-r7-search-state/bot-control.json',
        LUNA_OP_STORE_FILE: '/tmp/cred-r7-search-state/ops.json',
        TICKET_STATE_FILE: '/tmp/cred-r7-search-state/tickets.json',
        MENTION_ROTATE_FILE: '/tmp/cred-r7-search-state/mention.json',
        IMAGE_GUARD_STATE_FILE: '/tmp/cred-r7-search-state/image.json',
        MAINTAINER_DATA_DIR: '/tmp/cred-r7-search-state/maintainer',
        HOME: '/tmp/cred-r7-home',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (b) => { out += b.toString(); });
    child.stderr.on('data', (b) => { err += b.toString(); });
    const timer = setTimeout(() => { try { child.kill('SIGTERM'); } catch (_) {} }, 20000);
    child.on('close', () => {
      clearTimeout(timer);
      let recorded = null;
      try { recorded = JSON.parse(fs.readFileSync('/tmp/cred-r7-search-state/search.json', 'utf8')); } catch (e) { recorded = { error: String(e.message || e) }; }
      resolve({ recorded: recorded, stderrTail: err.slice(-800), stdoutTail: out.slice(-400) });
    });
  });
}
