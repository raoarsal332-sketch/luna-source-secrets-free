'use strict';

/**
 * Independent sealed review harness for fixed-message handoff R6.
 * Frozen commit 08775b56d3752a0ac03e865e33c91f52ef176043.
 * Loads the real handleWebhook. No network, no production, no customer data.
 * Synthetic canaries only. This file is not the author's test suite.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const net = require('net');
const dns = require('dns');

const COMMIT = '08775b56d3752a0ac03e865e33c91f52ef176043';
const FROZEN = process.env.R6_FROZEN_ROOT || '/tmp/r6-frozen';
const RUNTIME = path.join(FROZEN, 'luna-current/01_runtime');
const PRESEND = path.join(FROZEN, 'luna-current/02_statePresend');
const SANDBOX = process.env.R6_SANDBOX || '/tmp/r6-review-sandbox';
const OUT_DIR = path.join(__dirname);

const EXPECTED = {
  'fixedMessageHandoff.js': 'e7cc1a81387a69859ad5636b9b0c5520a47c4125c0b7510001dee4f09e5fa678',
  'index.js': 'f48ebb3aee624679223dbb19087263b2134bdc89bd1e0a3701d2ec5d44b92347',
  'credentialSanitizer.js': '2c6353936fdec3e990f6fa1eb7ca70134110c9ad6ef8061825839f358f4fe781',
  'targetedRegeneration.js': '38fa4e2a56c23b96d3559e22f7135f5e69ecfc1e9cbafb157a92c46d672461b9',
  'statePresend.js': '0e3b8675e00856eca158748711683471e3820d43a9e5c0ff626a14dc84a90764',
  'softEdges.js': '22f8b555a71bb81f6936997a57c85481b5c351b9446c0f30f7f178c93d5071e0',
};

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function sha256Text(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

const identity = {};
for (const [name, hex] of Object.entries(EXPECTED)) {
  const candidates = [
    path.join(RUNTIME, name),
    path.join(PRESEND, name),
  ];
  const hit = candidates.find((p) => fs.existsSync(p));
  identity[name] = { path: hit || null, sha256: hit ? sha256File(hit) : null, match: hit && sha256File(hit) === hex };
}
if (Object.values(identity).some((x) => !x.match)) {
  console.error(JSON.stringify({ identity }, null, 2));
  throw new Error('frozen identity mismatch; refusing to run');
}

fs.mkdirSync(SANDBOX, { recursive: true });
const PATHS = {
  control: path.join(SANDBOX, 'control.json'),
  prompt: path.join(RUNTIME, 'system-prompt.txt'),
  ticket: path.join(SANDBOX, 'ticket-state.json'),
  ops: path.join(SANDBOX, 'write-ops.json'),
  mention: path.join(SANDBOX, 'mention-rotate.json'),
  image: path.join(SANDBOX, 'image-guard.json'),
  faq: path.join(RUNTIME, 'fundedelite-faqs.md'),
};
fs.writeFileSync(PATHS.control, JSON.stringify({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: [],
  testAllowConversationIds: [],
  config: { model: 'stub-review-model', welcomeEnabled: true, repliesEnabled: true },
}));
fs.writeFileSync(PATHS.ticket, '{}');
fs.writeFileSync(PATHS.ops, '{}');
fs.writeFileSync(PATHS.mention, JSON.stringify({ recent: [], lastId: '', at: 0 }));

for (const key of ['INTERCOM_ACCESS_TOKEN', 'OPENAI_API_KEY', 'INTERCOM_WEBHOOK_SECRET', 'INTERCOM_CLIENT_SECRET', 'CONTROL_SECRET']) {
  delete process.env[key];
}
process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-intercom-token-not-real';
process.env.OPENAI_API_KEY = 'synthetic-openai-key-not-real';
process.env.LUNA_CONTROL_STATE_FILE = PATHS.control;
process.env.LUNA_PROMPT_FILE = PATHS.prompt;
process.env.TICKET_STATE_FILE = PATHS.ticket;
process.env.LUNA_OP_STORE_FILE = PATHS.ops;
process.env.MENTION_ROTATE_FILE = PATHS.mention;
process.env.IMAGE_GUARD_STATE_FILE = PATHS.image;
process.env.FUNDEDELITE_FAQ_PATH = PATHS.faq;
process.env.LUNA_PRESEND_MODE = 'enforce';
process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';
process.env.LUNA_TOOLS_ENABLED = '1';
process.env.MAINTAINER_ENABLED = 'false';
process.env.LUNA_SPREAD_GATE_MODE = 'strict-and-legacy';

const link = path.join(RUNTIME, 'statePresend');
try {
  const st = fs.lstatSync(link);
  if (!st.isSymbolicLink()) throw new Error('statePresend exists and is not a symlink');
} catch (e) {
  if (e.code === 'ENOENT') fs.symlinkSync(PRESEND, link);
  else throw e;
}

const tripwire = [];
function blockNetwork(label) {
  tripwire.push(label);
  const err = new Error('NETWORK_BLOCKED ' + label);
  err.code = 'ENETUNREACH';
  throw err;
}
net.Socket.prototype.connect = function blockedConnect() { blockNetwork('socket'); };
dns.lookup = function blockedLookup(_h, cb) {
  const err = new Error('NETWORK_BLOCKED dns');
  err.code = 'ENETUNREACH';
  tripwire.push('dns');
  if (typeof cb === 'function') cb(err);
  else return Promise.reject(err);
};
dns.resolve = dns.lookup;
if (dns.promises) {
  dns.promises.lookup = async () => blockNetwork('dns.promises');
}
global.fetch = async () => blockNetwork('fetch');

const store = new Map();
const frozenGet = new Map();
const writes = [];
const prompts = [];
const logs = [];
let seq = 0;
let active = null;

function plain(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function kindOf(url, data) {
  const u = String(url || '');
  if (/\/admins(\?|$)/.test(u)) return 'admins';
  if (/\/conversations\/search/.test(u)) return 'search';
  if (/\/reply$/.test(u)) {
    const mt = data && data.message_type;
    if (mt === 'note') return 'note';
    if (mt === 'assignment') return 'assignment';
    if (mt === 'comment') return 'comment';
    if (mt === 'close') return 'close';
    return 'reply-other';
  }
  if (/\/conversations\/[^/]+$/.test(u)) return 'fetch';
  return 'other';
}

async function fakeAxios(config) {
  const cfg = config || {};
  const method = String(cfg.method || 'get').toLowerCase();
  const url = String(cfg.url || '');
  const data = cfg.data;
  const kind = kindOf(url, data);
  if (/^https?:\/\//i.test(url) && !/api\.intercom\.io|faq\.fundedelite\.com|fundedelite\.com/i.test(url)) {
    tripwire.push('axios:' + url);
  }
  if (/faq\.fundedelite\.com|fundedelite\.com/i.test(url)) {
    return { status: 0, data: '', headers: {} };
  }
  if (kind === 'admins') {
    return {
      status: 200,
      headers: {},
      data: {
        admins: [{
          id: '424242',
          name: 'Synthetic Teammate',
          email: 'synthetic.teammate@example.test',
          has_inbox_seat: true,
          away_mode_enabled: false,
          team_ids: [9629780],
        }],
      },
    };
  }
  if (kind === 'search') return { status: 200, headers: {}, data: { conversations: [] } };
  if (kind === 'fetch') {
    const id = url.split('/conversations/')[1];
    const conv = frozenGet.has(id) ? frozenGet.get(id) : store.get(id);
    if (!conv) return { status: 404, headers: {}, data: { errors: [{ code: 'not_found' }] } };
    return { status: 200, headers: {}, data: conv };
  }
  if (kind === 'note' || kind === 'assignment' || kind === 'comment' || kind === 'close' || kind === 'reply-other') {
    const id = (url.match(/conversations\/([^/]+)\/reply/) || [])[1];
    const fault = (active && active.faults && active.faults[kind]) || 'ok';
    const body = data && data.body;
    const rec = {
      kind,
      conv: id,
      status: 0,
      accepted: false,
      fault,
      plain: plain(body),
      raw: typeof body === 'string' ? body : '',
      assignee: data && data.assignee_id != null ? String(data.assignee_id) : '',
      at: writes.length,
    };
    writes.push(rec);
    const fail = (status, payload, throwIt) => {
      rec.status = status;
      if (throwIt) {
        const err = new Error('timeout of 20000ms exceeded');
        err.code = 'ECONNABORTED';
        throw err;
      }
      return { status, headers: {}, data: payload };
    };
    if (fault === 'timeout' || fault === 'timeout-after-accept') {
      if (fault === 'timeout-after-accept') {
        rec.accepted = true;
        rec.status = 200;
        applyWrite(id, kind, data);
      }
      return fail(0, null, true);
    }
    if (fault === '500') return fail(500, { errors: [{ code: 'server_error' }] });
    if (fault === '422') return fail(422, { errors: [{ code: 'unprocessable' }] });
    if (fault === 'partial') return fail(200, { id: 'partial-' + (++seq), type: 'conversation', errors: [{ code: 'partial' }] });
    if (fault === 'malformed') return fail(200, {});
    rec.accepted = true;
    rec.status = 200;
    applyWrite(id, kind, data);
    return { status: 200, headers: {}, data: { id: 'part-' + (++seq), type: 'conversation' } };
  }
  tripwire.push('unhandled-axios:' + method + ':' + url);
  return { status: 0, headers: {}, data: null };
}
fakeAxios.get = (url, cfg) => fakeAxios(Object.assign({}, cfg, { method: 'get', url }));
fakeAxios.post = (url, data, cfg) => fakeAxios(Object.assign({}, cfg, { method: 'post', url, data }));
fakeAxios.create = () => fakeAxios;

function applyWrite(id, kind, data) {
  const conv = store.get(id);
  if (!conv || (active && active.stale)) return;
  const now = Math.floor(Date.now() / 1000);
  if (kind === 'note') {
    conv.conversation_parts.conversation_parts.push({
      id: 'note-' + (++seq),
      part_type: 'note',
      body: data.body,
      author: { type: 'admin', id: '10118526', name: 'Arsal' },
      created_at: now,
    });
  } else if (kind === 'comment') {
    conv.conversation_parts.conversation_parts.push({
      id: 'cmt-' + (++seq),
      part_type: 'comment',
      body: data.body,
      author: { type: 'admin', id: '10118526', name: 'Arsal' },
      created_at: now,
    });
  } else if (kind === 'assignment') {
    const assignee = String(data.assignee_id || '');
    conv.admin_assignee_id = assignee;
    conv.conversation_parts.conversation_parts.push({
      id: 'asg-' + (++seq),
      part_type: 'assignment',
      body: '',
      author: { type: 'admin', id: '10118526', name: 'Arsal' },
      assigned_to: { type: 'admin', id: assignee },
      created_at: now,
    });
  }
}

function userTextOf(req) {
  const messages = (req && req.messages) || [];
  return messages.filter((m) => m && m.role === 'user').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
}

class FakeOpenAI {
  constructor() {
    this.chat = { completions: { create: async (req) => {
      const user = userTextOf(req);
      const system = ((req && req.messages) || []).filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      prompts.push({ user, systemHasLocked: false, at: prompts.length });
      const step = active && active.step;
      const regen = /corrected client-facing|Do not state|HARD OVERRIDE|Return ACTION: REPLY/i.test(user);
      let content = (regen && step && step.modelRegen) || (step && step.model) || 'ACTION: REPLY\nBODY: The standard minimum holding time is 3 minutes.';
      if (typeof content === 'function') content = content({ user, regen });
      return { choices: [{ message: { role: 'assistant', content: String(content) } }] };
    } } };
  }
}

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'axios') return 'axios';
  if (request === 'openai') return 'openai';
  if (request === 'express') return 'express';
  if (request === 'dotenv') return 'dotenv';
  try {
    return origResolve.call(this, request, parent, isMain, options);
  } catch (err) {
    if (parent && parent.filename && parent.filename.startsWith(PRESEND) && request.startsWith('../') && !request.includes('01_runtime')) {
      const alt = path.join(RUNTIME, request.replace(/^\.\.\//, ''));
      if (fs.existsSync(alt) || fs.existsSync(alt + '.js')) return origResolve.call(this, alt, parent, isMain, options);
    }
    throw err;
  }
};
require.cache.axios = { id: 'axios', filename: 'axios', loaded: true, exports: fakeAxios };
require.cache.openai = { id: 'openai', filename: 'openai', loaded: true, exports: FakeOpenAI };
require.cache.dotenv = { id: 'dotenv', filename: 'dotenv', loaded: true, exports: { config() { return { parsed: {} }; } } };
function express() {
  const app = {};
  for (const m of ['use', 'get', 'post', 'put', 'delete', 'listen']) app[m] = () => app;
  return app;
}
express.json = () => (_req, _res, next) => next && next();
require.cache.express = { id: 'express', filename: 'express', loaded: true, exports: express };

const origLog = console.log;
const origErr = console.error;
const origWarn = console.warn;
function pushLog(level, args) {
  logs.push(level + ' ' + args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
}
console.log = (...a) => pushLog('log', a);
console.error = (...a) => pushLog('err', a);
console.warn = (...a) => pushLog('warn', a);

const handoff = require(path.join(RUNTIME, 'fixedMessageHandoff.js'));
const sanitizer = require(path.join(PRESEND, 'credentialSanitizer.js'));
const engine = require(path.join(RUNTIME, 'index.js'));
const FIXED = handoff.FIXED_MESSAGES;
const ACCOUNT = handoff.ACCOUNT_QUESTION_LINES;
const LOCKED = sanitizer.LOCKED_SPREAD_TEST_REPLY;
const LOCKED_PW = LOCKED.split('Password: ')[1].split('\n')[0];
prompts.forEach(() => {});

function markLockedPrompts() {
  for (const p of prompts) p.systemHasLocked = String(p.user).includes(LOCKED_PW);
}

const ARSAL = '10118526';
const ELITE = '8052954';
const HUMAN = '555001';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function part(spec, now) {
  return {
    id: spec.id,
    part_type: spec.part_type || 'comment',
    body: spec.body || '',
    author: spec.author,
    created_at: spec.created_at != null ? spec.created_at : now,
    assigned_to: spec.assigned_to,
  };
}

function buildConv(convId, step) {
  const now = Math.floor(Date.now() / 1000);
  const age = step.ageSec != null ? step.ageSec : 400;
  const created = now - age;
  const author = { type: 'user', id: 'user-synth', name: step.clientName || 'Synthetic Client', email: 'synthetic.client@example.test' };
  const body = step.raw ? step.text : '<p>' + esc(step.text || '') + '</p>';
  const user = {
    id: step.userPartId || ('user-' + convId),
    part_type: 'comment',
    body,
    author,
    created_at: now - 2,
  };
  const prior = (step.prior || []).map((p, i) => part(Object.assign({ id: 'prior-' + i, created_at: now - 50 - i }, p), now));
  const parts = step.sourceOnly ? prior.slice() : prior.concat([user]);
  return {
    id: convId,
    type: 'conversation',
    created_at: created,
    updated_at: now,
    open: true,
    state: 'open',
    admin_assignee_id: step.assignee != null ? String(step.assignee) : ARSAL,
    team_assignee_id: step.team != null ? String(step.team) : '0',
    assignee: step.assigneeObj || null,
    admin_assignee: step.adminAssignee || null,
    team_assignee: step.teamObj || null,
    source: { body, author, created_at: created, attachments: [] },
    contacts: { contacts: [{ id: author.id, name: author.name, email: author.email }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function wipe(which) {
  if (which.includes('ticket')) fs.writeFileSync(PATHS.ticket, '{}');
  if (which.includes('ops')) fs.writeFileSync(PATHS.ops, '{}');
}

async function callWebhook(convId, topic) {
  const req = { body: { topic, id: 'notif-' + (++seq), data: { item: { id: convId, type: 'conversation' } } }, get() { return ''; }, headers: {} };
  let status = 0;
  const res = {
    sendStatus(code) { status = code; return this; },
    status(code) { status = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await engine.handleWebhook(req, res);
  return status;
}

function readState(convId) {
  try {
    const all = JSON.parse(fs.readFileSync(PATHS.ticket, 'utf8'));
    return all[String(convId)] || {};
  } catch (_) {
    return {};
  }
}

function buildCases() {
  const cases = [];
  const add = (c) => cases.push(c);
  const handoffText = {
    en: 'I want a live agent',
    ur: 'مجھے ایجنٹ چاہیے',
    ar: 'اريد التحدث مع موظف',
    hi: 'मुझे एजेंट से बात करनी है',
    it: 'voglio parlare con un operatore',
    hinglish: 'mujhe live agent chahiye',
  };
  for (const lang of Object.keys(handoffText)) {
    add({
      id: 'H-ok-' + lang,
      prop: 'a',
      title: 'Successful handoff in ' + lang + ' posts note, assignment, then one fixed line',
      canaries: [],
      steps: [{ text: handoffText[lang], ageSec: 400 }],
      expect: { mode: 'handoff', lang: lang === 'hinglish' ? 'ur' : lang },
    });
  }
  const faults = ['500', 'timeout', '422', 'partial', 'malformed'];
  for (const phase of ['note', 'assign']) {
    for (const fault of faults) {
      add({
        id: 'H-' + phase + '-' + fault,
        prop: 'a',
        title: 'English handoff withholds the fixed line when ' + phase + ' returns ' + fault,
        canaries: [],
        steps: [{ text: 'I want a live agent', ageSec: 400, faults: { [phase === 'assign' ? 'assignment' : 'note']: fault } }],
        expect: { mode: 'withhold' },
      });
    }
  }
  for (const fault of ['500', 'timeout']) {
    add({
      id: 'H-message-' + fault,
      prop: 'a',
      title: 'Message ' + fault + ' after note and assignment does not claim success and does not duplicate',
      canaries: [],
      steps: [{ text: 'I want a live agent', ageSec: 400, faults: { comment: fault } }],
      expect: { mode: 'withhold', note: true, assign: true },
    });
  }
add({
      id: 'H-retry-after-note-500',
      prop: 'a',
      title: 'Ambiguous note 500 stays withheld on replay instead of posting the fixed line',
      canaries: [],
      steps: [
        { text: 'I want a live agent', ageSec: 400, faults: { note: '500' } },
        { replay: true },
      ],
      expect: { mode: 'withhold' },
    });
    add({
      id: 'H-retry-after-note-422',
      prop: 'a',
      title: 'A rejected note 422 can be retried and then completes once',
      canaries: [],
      steps: [
        { text: 'I want a live agent', ageSec: 400, faults: { note: '422' } },
        { replay: true },
      ],
      expect: { mode: 'handoff', lang: 'en', maxFixed: 1 },
    });
  add({
    id: 'H-replay-same-event',
    prop: 'a',
    title: 'Webhook replay after success does not post a second fixed line',
    canaries: [],
    steps: [
      { text: 'talk to a human', ageSec: 400 },
      { replay: true },
    ],
    expect: { mode: 'handoff', lang: 'en', maxFixed: 1 },
  });
  add({
    id: 'H-parallel-inflight',
    prop: 'a',
    title: 'Two in-flight deliveries of the same event produce one fixed line',
    canaries: [],
    steps: [{ text: 'connect me to an agent', ageSec: 400, parallel: 2 }],
    expect: { mode: 'handoff', lang: 'en', maxFixed: 1 },
  });
  add({
    id: 'H-lost-ticket-parts-have-line',
    prop: 'a',
    title: 'Lost ticket store with the fixed line still in parts does not duplicate',
    canaries: [],
    steps: [
      { text: 'I need a live agent', ageSec: 400 },
      { replay: true, wipe: ['ticket'] },
    ],
    expect: { mode: 'handoff', lang: 'en', maxFixed: 1 },
  });
  add({
    id: 'H-lost-ops-state-remembers',
    prop: 'a',
    title: 'Lost write-op store with ticket state remembering the send does not duplicate',
    canaries: [],
    steps: [
      { text: 'human please', ageSec: 400 },
      { replay: true, wipe: ['ops'] },
    ],
    expect: { mode: 'handoff', lang: 'en', maxFixed: 1 },
  });
  add({
    id: 'H-lost-both-parts-remember',
    prop: 'a',
    title: 'Both stores lost but parts show the completed line does not duplicate',
    canaries: [],
    steps: [
      { text: 'agent please', ageSec: 400 },
      { replay: true, wipe: ['ticket', 'ops'] },
    ],
    expect: { mode: 'handoff', lang: 'en', maxFixed: 1 },
  });
  add({
    id: 'H-stale-snapshot-state-remembers',
    prop: 'a',
    title: 'Stale fetch that hides the sent line still does not duplicate when ticket state remembers it',
    canaries: [],
    steps: [
      { text: 'I want a live agent', ageSec: 400 },
      { replay: true, stale: true },
    ],
    expect: { mode: 'handoff', lang: 'en', maxFixed: 1 },
  });
  add({
    id: 'H-lost-and-stale',
    prop: 'a',
    title: 'Lost stores plus a stale snapshot must not post a second fixed line',
    canaries: [],
    steps: [
      { text: 'I want a live agent', ageSec: 400 },
      { replay: true, wipe: ['ticket', 'ops'], stale: true },
    ],
    expect: { mode: 'handoff', lang: 'en', maxFixed: 1 },
  });
  add({
    id: 'H-message-timeout-then-parts',
    prop: 'a',
    title: 'Ambiguous message timeout that actually landed is not posted again',
    canaries: [],
    steps: [
      { text: 'I want a live agent', ageSec: 400, faults: { comment: 'timeout-after-accept' } },
      { replay: true },
    ],
expect: { mode: 'landed-once', lang: 'en' },
    });
  add({
    id: 'H-assign-timeout-held',
    prop: 'a',
    title: 'Ambiguous assignment timeout does not later promise on a stale snapshot',
    canaries: [],
    steps: [
      { text: 'I want a live agent', ageSec: 400, faults: { assignment: 'timeout' } },
      { replay: true, stale: true },
    ],
    expect: { mode: 'withhold' },
  });
  add({
    id: 'H-partial-note-lost-ticket',
    prop: 'a',
    title: 'Partial note recorded as success must not unlock the fixed line after the ticket store is lost',
    canaries: [],
    steps: [
      { text: 'I want a live agent', ageSec: 400, faults: { note: 'partial' } },
      { replay: true, wipe: ['ticket'] },
    ],
    expect: { mode: 'withhold' },
  });
  add({
    id: 'H-second-customer-turn',
    prop: 'a',
    title: 'A later live-agent turn after a completed handoff does not post a second promise',
    canaries: [],
    steps: [
      { text: 'I want a live agent', ageSec: 400 },
      { append: true, text: 'still want a live agent', ageSec: 400 },
    ],
    expect: { mode: 'handoff', lang: 'en', maxFixed: 1 },
  });
  add({
    id: 'H-order-urdu-replay',
    prop: 'a',
    title: 'Urdu success then replay keeps a single Urdu fixed line',
    canaries: [],
    steps: [
      { text: handoffText.ur, ageSec: 400 },
      { replay: true },
      { replay: true, wipe: ['ticket'] },
    ],
    expect: { mode: 'handoff', lang: 'ur', maxFixed: 1 },
  });
  add({
    id: 'H-italian-after-elite',
    prop: 'a',
    title: 'Italian live-agent request after Elite has spoken still gets the Italian line',
    canaries: [],
    steps: [{
      text: 'voglio un operatore',
      ageSec: 30,
      prior: [{
        id: 'elite1',
        part_type: 'comment',
        body: '<p>Ciao, come posso aiutarti?</p>',
        author: { type: 'admin', id: ELITE, name: 'Elite AI' },
      }],
    }],
    expect: { mode: 'handoff', lang: 'it' },
  });
  add({
    id: 'H-fresh-created-en',
    prop: 'd',
    title: 'Fresh conversation.user.created live-agent request gets the English fixed line',
    canaries: [],
    steps: [{ text: 'I want a live agent', topic: 'conversation.user.created', ageSec: 15, sourceOnly: true }],
    expect: { mode: 'handoff', lang: 'en' },
  });
  const moreLive = [
    ['en-manager', 'manager please', 'en'],
    ['en-supervisor', 'connect me to a supervisor', 'en'],
    ['en-real', 'I need a real person', 'en'],
    ['hinglish-baat', 'mujhe agent se baat karni hai', 'ur'],
    ['roman', 'bhai mujhe real person chahiye', 'ur'],
    ['fr', 'je veux parler à un agent humain', 'en'],
    ['es', 'quiero hablar con un agente humano', 'en'],
    ['de', 'ich möchte mit einem Menschen sprechen', 'en'],
    ['pt', 'quero falar com um agente humano', 'en'],
    ['nl', 'ik wil met een medewerker praten', 'en'],
    ['tr', 'canli bir temsilci ile gorusmek istiyorum', 'en'],
    ['pl', 'chcę rozmawiać z konsultantem', 'en'],
    ['ru', 'хочу поговорить с оператором', 'en'],
    ['zh', '我要人工客服', 'en'],
    ['ja', '担当者につないでください', 'en'],
  ];
  for (const [id, text, lang] of moreLive) {
    add({
      id: 'D-live-' + id,
      prop: 'd',
      title: 'Live-agent request [' + id + '] gets the fixed line',
      canaries: [],
      steps: [{ text, ageSec: 400 }],
      expect: { mode: 'handoff', lang },
    });
  }
  const identities = [
    ['en', 'are you a bot or a real person?'],
    ['en-ai', 'are you an AI?'],
    ['en-human', 'are you a real person?'],
    ['or', 'bot or human?'],
    ['hinglish', 'kya aap bot ho?'],
    ['hinglish-insaan', 'kya aap insaan ho?'],
    ['it', 'sei un bot o una persona reale?'],
    ['ur', 'آپ بوٹ ہیں یا انسان؟'],
    ['mixed', 'are you a bot or a real person? please connect me to a human'],
  ];
  for (const [id, text] of identities) {
    add({
      id: 'D-id-' + id,
      prop: 'd',
      title: 'Identity question [' + id + '] is answered and not handed off',
      canaries: [],
      steps: [{ text, ageSec: 15, topic: id === 'en' ? 'conversation.user.created' : 'conversation.user.replied', sourceOnly: id === 'en' }],
      expect: { mode: 'identity' },
    });
  }

  const ownershipTexts = [
    ['hello', 'Hello'],
    ['live', 'I want a live agent'],
    ['status', 'any update?'],
    ['account', 'What is my account number?'],
    ['identity', 'are you a bot or a real person?'],
    ['spread', 'can I check the spreads?'],
    ['urdu-live', 'مجھے ایجنٹ چاہیے'],
    ['it-live', 'voglio parlare con un operatore'],
  ];
  for (const [id, text] of ownershipTexts) {
    add({
      id: 'B-assignee-' + id,
      prop: 'b',
      title: 'Human assignee stays silent for [' + id + ']',
      canaries: [],
      steps: [{ text, ageSec: 400, assignee: HUMAN }],
      expect: { mode: 'silent', ownership: true },
    });
    add({
      id: 'B-replied-' + id,
      prop: 'b',
      title: 'Human public reply stays silent for [' + id + ']',
      canaries: [],
      steps: [{
        text,
        ageSec: 400,
        assignee: ARSAL,
        prior: [{
          id: 'hum-' + id,
          part_type: 'comment',
          body: '<p>I am taking this from here.</p>',
          author: { type: 'admin', id: HUMAN, name: 'Synthetic Human' },
        }],
      }],
      expect: { mode: 'silent', ownership: true },
    });
  }
  add({
    id: 'B-admin-body-no-type',
    prop: 'b',
    title: 'Admin body with no part_type stays silent',
    canaries: [],
    steps: [{
      text: 'I want a live agent',
      ageSec: 400,
      prior: [{ id: 'nobody', part_type: '', body: 'I already replied to the client about this.', author: { type: 'admin', id: HUMAN, name: 'Synthetic Human' } }],
    }],
    expect: { mode: 'silent', ownership: true },
  });
  add({
    id: 'B-author-teammate',
    prop: 'b',
    title: 'author.type teammate stays silent',
    canaries: [],
    steps: [{
      text: 'hello there',
      ageSec: 400,
      prior: [{ id: 'tm', part_type: 'comment', body: '<p>We have this.</p>', author: { type: 'teammate', id: HUMAN, name: 'Synthetic Human' } }],
    }],
    expect: { mode: 'silent', ownership: true },
  });
  add({
    id: 'B-risk',
    prop: 'b',
    title: 'Risk team stays publicly silent',
    canaries: [],
    steps: [{ text: 'I want a live agent', ageSec: 400, team: '10675195' }],
    expect: { mode: 'silent', ownership: true, allowNote: true },
  });
  add({
    id: 'B-escalations',
    prop: 'b',
    title: 'Escalations team stays publicly silent',
    canaries: [],
    steps: [{ text: 'I want a live agent', ageSec: 400, team: '9629759' }],
    expect: { mode: 'silent', ownership: true, allowNote: true },
  });
  add({
    id: 'B-ambiguous',
    prop: 'b',
    title: 'Ambiguous assignee stays silent',
    canaries: [],
    steps: [{ text: 'I want a live agent', ageSec: 400, assignee: '0', assigneeObj: { type: 'admin', id: '' } }],
    expect: { mode: 'silent', ownership: true },
  });
  add({
    id: 'B-stale-assignment',
    prop: 'b',
    title: 'Stale assignment target versus current bot assignee stays silent',
    canaries: [],
    steps: [{
      text: 'I want a live agent',
      ageSec: 400,
      assignee: ARSAL,
      prior: [{ id: 'stale', part_type: 'assignment', body: '', author: { type: 'admin', id: ARSAL, name: 'Arsal' }, assigned_to: { type: 'admin', id: HUMAN } }],
    }],
    expect: { mode: 'silent', ownership: true },
  });
  add({
    id: 'B-human-urdu-reply',
    prop: 'b',
    title: 'Urdu human public reply keeps a later live-agent ask silent',
    canaries: [],
    steps: [{
      text: 'مجھے ایجنٹ چاہیے',
      ageSec: 400,
      prior: [{ id: 'urh', part_type: 'comment', body: '<p>میں دیکھ رہا ہوں۔</p>', author: { type: 'admin', id: HUMAN, name: 'Synthetic Human' } }],
    }],
    expect: { mode: 'silent', ownership: true },
  });

  const accountAsks = [
    ['en', 'What is my account number?', 'en', { topic: 'conversation.user.created', ageSec: 15, sourceOnly: true }],
    ['en-where', 'Where can I find the account number?', 'en', { ageSec: 20 }],
    ['en-can', 'Can you tell me the account number?', 'en', { ageSec: 30 }],
    ['en-bare', 'account number', 'en', { ageSec: 400 }],
    ['roman', 'mera account number kya hai?', 'hinglish', { ageSec: 15 }],
    ['hinglish', 'account number kya hai?', 'hinglish', { ageSec: 400 }],
    ['ur', 'میرا اکاؤنٹ نمبر کیا ہے؟', 'ur', { topic: 'conversation.user.created', ageSec: 12, sourceOnly: true }],
    ['hi', 'मेरा खाता नंबर क्या है?', 'hi', { ageSec: 18 }],
    ['ar', 'ما هو رقم الحساب؟', 'ar', { ageSec: 18 }],
    ['it', 'Qual è il numero di conto?', 'it', { ageSec: 18 }],
    ['es', '¿Cuál es el número de cuenta?', 'es', { ageSec: 15, topic: 'conversation.user.created', sourceOnly: true }],
    ['fr', 'Quel est le numéro de compte ?', 'fr', { ageSec: 400 }],
    ['de', 'Wie lautet meine Kontonummer?', 'de', { ageSec: 400 }],
    ['pt', 'Qual é o número da conta?', 'pt', { ageSec: 400 }],
    ['nl', 'Wat is mijn rekeningnummer?', 'nl', { ageSec: 400 }],
    ['pl', 'Jaki jest numer konta?', 'pl', { ageSec: 400 }],
    ['tr', 'Hesap numaram nedir?', 'tr', { ageSec: 400 }],
    ['ru', 'Какой номер счета?', 'ru', { ageSec: 400 }],
    ['id', 'Berapa nomor akun saya?', 'id', { ageSec: 400 }],
  ];
  for (const [id, text, lang, extra] of accountAsks) {
    add({
      id: 'C-acct-' + id,
      prop: 'c',
      title: 'Account-number question [' + id + '] gets the KB fact line',
      canaries: [],
      steps: [Object.assign({ text }, extra)],
      expect: { mode: 'fact', lang },
    });
  }
  add({
    id: 'C-not-supply',
    prop: 'c',
    title: 'Supplying an account number is not answered as an account-number question and is not handed off',
    canaries: [],
    steps: [{ text: 'my account number is 189143', ageSec: 400, model: 'ACTION: REPLY\nBODY: Thanks, I have the account number you sent.' }],
    expect: { mode: 'no-handoff', forbid: [/please share your account number/i, /A teammate now has this conversation/] },
  });
  add({
    id: 'C-reask-loop',
    prop: 'c',
    title: 'A second account-number ask is answered again and does not ask the customer for the number',
    canaries: [],
    steps: [
      { text: 'What is my account number?', ageSec: 400 },
      { append: true, text: 'I still need the account number', ageSec: 400 },
    ],
    expect: { mode: 'fact', lang: 'en', noReask: true },
  });
  add({
    id: 'C-elite-fresh',
    prop: 'c',
    title: 'Account-number question is answered before the Fin wait even after Elite spoke',
    canaries: [],
    steps: [{
      text: 'What is my account number?',
      ageSec: 20,
      prior: [{ id: 'el2', part_type: 'comment', body: '<p>Hi, how can I help?</p>', author: { type: 'admin', id: ELITE, name: 'Elite AI' } }],
    }],
    expect: { mode: 'fact', lang: 'en' },
  });
  add({
    id: 'C-emptied-draft',
    prop: 'c',
    title: 'An emptied re-ask draft escalates instead of going silent',
    canaries: [],
    steps: [{
      text: 'please look at this again',
      ageSec: 400,
      model: 'ACTION: REPLY\nBODY: Please share your account number before I pass this to the team.',
      prior: [{ id: 'known', part_type: 'comment', body: '<p>My account number is 189143 and the payout failed.</p>', author: { type: 'user', id: 'user-synth', name: 'Synthetic Client' } }],
    }],
    expect: { mode: 'emptied' },
  });
  add({
    id: 'C-emptied-assign-fail',
    prop: 'c',
    title: 'Emptied draft whose assignment fails still records an escalation attempt and does not promise',
    canaries: [],
    steps: [{
      text: 'please look at this again',
      ageSec: 400,
      faults: { assignment: '500' },
      model: 'ACTION: REPLY\nBODY: Please share your account number before I pass this to the team.',
      prior: [{ id: 'known2', part_type: 'comment', body: '<p>My account number is 189143 and the payout failed.</p>', author: { type: 'user', id: 'user-synth', name: 'Synthetic Client' } }],
    }],
    expect: { mode: 'emptied-fail' },
  });
  add({
    id: 'C-recovery-account',
    prop: 'c',
    title: 'Account question during a half-finished handoff is answered, not replaced by the fixed line',
    canaries: [],
    steps: [
      { text: 'I want a live agent', ageSec: 400, faults: { assignment: '422' } },
      { append: true, text: 'What is my account number?', ageSec: 400 },
    ],
    expect: { mode: 'fact', lang: 'en', noFixed: true },
  });

  add({
    id: 'E-hold-regen-ok',
    prop: 'e',
    title: 'Unsupported 99-minute holding time regenerates to the FAQ figure and does not hand off',
    canaries: [],
    steps: [{
      text: 'What is the minimum holding time?',
      ageSec: 400,
      model: 'ACTION: REPLY\nBODY: The minimum holding time is 99 minutes.',
      modelRegen: 'ACTION: REPLY\nBODY: The standard minimum holding time is 3 minutes.',
    }],
    expect: { mode: 'regen', good: /3 minutes/i, bad: /99 minutes/i },
  });
  add({
    id: 'E-hold-regen-still-bad',
    prop: 'e',
    title: 'Unsupported number that regenerates to another wrong figure hedges and does not hand off',
    canaries: [],
    steps: [{
      text: 'What is the minimum holding time?',
      ageSec: 400,
      model: 'ACTION: REPLY\nBODY: The minimum holding time is 99 minutes.',
      modelRegen: 'ACTION: REPLY\nBODY: The minimum holding time is 47 minutes.',
    }],
    expect: { mode: 'regen', good: /can.?t confirm that figure|3 minutes/i, bad: /99 minutes|47 minutes/i },
  });
  add({
    id: 'E-status-ping',
    prop: 'e',
    title: 'Status ping with an unsupported number hedges instead of handing off',
    canaries: [],
    steps: [{
      text: 'any update on the minimum holding time?',
      ageSec: 400,
      model: 'ACTION: REPLY\nBODY: The minimum holding time is 99 minutes.',
      modelRegen: 'ACTION: REPLY\nBODY: The minimum holding time is 99 minutes.',
    }],
    expect: { mode: 'regen', good: /can.?t confirm that figure|3 minutes/i, bad: /99 minutes/i },
  });
  add({
    id: 'E-correct-control',
    prop: 'e',
    title: 'A draft that already states the FAQ holding time is sent and not handed off',
    canaries: [],
    steps: [{
      text: 'What is the minimum holding time for trades?',
      ageSec: 400,
      model: 'ACTION: REPLY\nBODY: The standard minimum holding time is 3 minutes.',
    }],
    expect: { mode: 'regen', good: /3 minutes/i, bad: /99 minutes/i },
  });
  add({
    id: 'E-drawdown',
    prop: 'e',
    title: 'Unsupported drawdown percent does not hand off',
    canaries: [],
    steps: [{
      text: 'What is the maximum daily drawdown?',
      ageSec: 400,
      model: 'ACTION: REPLY\nBODY: The maximum daily drawdown is 14%.',
      modelRegen: 'ACTION: REPLY\nBODY: I cannot confirm that drawdown figure from the approved details.',
    }],
    expect: { mode: 'regen', good: /cannot confirm|can.?t confirm|3%/i, bad: /14%/ },
  });
  add({
    id: 'E-split',
    prop: 'e',
    title: 'Unsupported profit-split percent does not hand off',
    canaries: [],
    steps: [{
      text: 'What is the profit split?',
      ageSec: 400,
      model: 'ACTION: REPLY\nBODY: The profit split is 12%.',
      modelRegen: 'ACTION: REPLY\nBODY: The profit split depends on the option selected at checkout.',
    }],
    expect: { mode: 'regen', good: /checkout|cannot confirm|can.?t confirm|80%|70%|50%/i, bad: /12%/ },
  });

  const spreads = [
    ['what', 'what are the spreads?'],
    ['check', 'can I check the spreads?'],
    ['test', 'spread test account please'],
    ['mt5', 'I want to test the spreads'],
  ];
  for (const [id, text] of spreads) {
    add({
      id: 'F-spread-' + id,
      prop: 'f',
      title: 'Appropriate spread ask [' + id + '] delivers the locked template byte-exact',
      canaries: [],
      steps: [{ text, ageSec: 400 }],
      expect: { mode: 'spread' },
    });
  }
  add({
    id: 'F-spread-after-bot',
    prop: 'f',
    title: 'Spread ask after an earlier bot reply is still byte-exact',
    canaries: [],
    steps: [{
      text: 'can I check the spreads?',
      ageSec: 400,
      prior: [{ id: 'botprior', part_type: 'comment', body: '<p>Hello, how can I help?</p>', author: { type: 'admin', id: ARSAL, name: 'Arsal' }, created_at: Math.floor(Date.now() / 1000) - 100 }],
    }],
    expect: { mode: 'spread' },
  });
  const notSpread = [
    ['login', 'I cannot log in and the password was regenerated'],
    ['password', 'I forgot my password'],
    ['negated', 'this is not about the spreads, my login failed'],
    ['sheet', 'please send the spreadsheet'],
    ['acct', 'account 55188 will not log in'],
    ['history', 'my trade history disappeared and the login password fails'],
  ];
  for (const [id, text] of notSpread) {
    add({
      id: 'F-notspread-' + id,
      prop: 'f',
      title: 'Non-spread [' + id + '] must not receive the locked template',
      canaries: [],
      steps: [{ text, ageSec: 400, model: 'ACTION: REPLY\nBODY: I can help with the login issue. I will not send test credentials.' }],
      expect: { mode: 'no-spread' },
    });
  }
  add({
    id: 'F-echo-exact',
    prop: 'f',
    title: 'Model echo of the exact locked template on a payout question is not delivered',
    canaries: [],
    steps: [{ text: 'where is my payout?', ageSec: 400, model: () => 'ACTION: REPLY\nBODY: ' + LOCKED }],
    expect: { mode: 'no-spread' },
  });
  add({
    id: 'F-tamper-password',
    prop: 'f',
    title: 'Near-miss template with a tampered password is redacted',
    canaries: ['SynthTamper91'],
    steps: [{ text: 'where is my payout?', ageSec: 400, model: () => 'ACTION: REPLY\nBODY: ' + LOCKED.replace(LOCKED_PW, 'SynthTamper91') }],
    expect: { mode: 'no-spread' },
  });
  add({
    id: 'F-tamper-account',
    prop: 'f',
    title: 'Template with account 55189 is not treated as the locked reply',
    canaries: ['SynthAcct91'],
    steps: [{ text: 'where is my payout?', ageSec: 400, model: () => 'ACTION: REPLY\nBODY: ' + LOCKED.replace('55188', '55189').replace(LOCKED_PW, 'SynthAcct91') }],
    expect: { mode: 'no-spread' },
  });
  add({
    id: 'F-tamper-space',
    prop: 'f',
    title: 'Template with one extra space is not allow-listed',
    canaries: [],
    steps: [{ text: 'where is my payout?', ageSec: 400, model: () => 'ACTION: REPLY\nBODY: ' + LOCKED.replace('Password: ', 'Password:  ') }],
    expect: { mode: 'no-spread' },
  });
  add({
    id: 'F-tamper-zw',
    prop: 'f',
    title: 'Template with a zero-width character in the password is redacted',
    canaries: [],
    steps: [{ text: 'where is my payout?', ageSec: 400, model: () => 'ACTION: REPLY\nBODY: ' + LOCKED.replace(LOCKED_PW, LOCKED_PW.slice(0, 4) + '\u200b' + LOCKED_PW.slice(4)) }],
    expect: { mode: 'no-spread', extraScan: [LOCKED_PW.slice(0, 4) + '\u200b' + LOCKED_PW.slice(4), LOCKED_PW] },
  });

  function cred(id, title, text, extraScan) {
    const canaries = extraScan || [];
    const m = text.match(/Synth[A-Za-z0-9]+/g) || [];
    for (const c of m) if (!canaries.includes(c)) canaries.push(c);
    add({
      id: 'F-cred-' + id,
      prop: 'f',
      title,
      canaries,
      steps: [{
        text,
        raw: /<|&#|&amp;|\u200b/.test(text),
        ageSec: 400,
        model: 'ACTION: REPLY\nBODY: The standard minimum holding time is 3 minutes. ' + canaries.join(' '),
      }],
      expect: { mode: 'redact' },
    });
  }
  cred('label', 'Labeled password is redacted from prompt, reply, notes and logs', 'What is the minimum holding time? password: SynthPwAlpha91');
  cred('apos', 'Apostrophe separator is redacted', "What is the minimum holding time? password's SynthPwBeta91");
  cred('curly', 'Curly apostrophe separator is redacted', 'What is the minimum holding time? password\u2019s SynthPwGamma91');
  cred('braces', 'Brace-wrapped password is redacted', 'What is the minimum holding time? pwd: {SynthPwDelta91}');
  cred('bold', 'Tag-wrapped password is redacted', 'What is the minimum holding time? password <b>SynthPwEpsilon91</b>');
  cred('entity', 'HTML-entity colon separator is redacted', 'What is the minimum holding time? password&#58;SynthPwZeta91');
  cred('symbol', 'Password containing ? and ! is fully redacted', 'What is the minimum holding time? Password: SynthPwSymbol91?a!');
  cred('urdu-label', 'Urdu password label is redacted', 'What is the minimum holding time? پاس ورڈ SynthPwUrdu91');
  cred('hindi-label', 'Hindi password label is redacted', 'What is the minimum holding time? पासवर्ड SynthPwHindi91');
  cred('arabic-label', 'Arabic password label is redacted', 'What is the minimum holding time? كلمة المرور SynthPwArab91');
  cred('zw-label', 'Zero-width character inside the password label is still redacted', 'What is the minimum holding time? pass\u200bword: SynthPwZw91');
  cred('spaced-label', 'Spaced password label is still redacted', 'What is the minimum holding time? p a s s w o r d : SynthPwSpaced91');
  cred('spaced-value', 'Spaced password value is fully redacted', 'What is the minimum holding time? password: S y n t h S p a c e 9 1', ['S y n t h S p a c e 9 1', 'SynthSpace91']);
  cred('sk', 'sk- key is redacted', 'What is the minimum holding time? sk-synthSYNTHKEY0123456789ab');
  cred('bearer', 'Bearer token is redacted', 'What is the minimum holding time? Bearer synthBearerToken91abcdef');
  cred('otp', 'OTP value is redacted', 'What is the minimum holding time? otp: SynthOtp918273645');
  cred('apikey', 'API key label is redacted', 'What is the minimum holding time? api key: SynthApiKey918273645');
  cred('zw-value', 'Zero-width character inside the secret value is redacted', 'What is the minimum holding time? password: Syn\u200bthPwInside91', ['Syn\u200bthPwInside91', 'SynthPwInside91']);
  const b64 = 'U3ludGhCYXNlNjRTZWNyZXQ5MQ==';
  cred('b64-repeat', 'Repeated base64 token is redacted', 'What is the minimum holding time? ' + b64 + ' and again ' + b64, [b64]);
  cred('b64-once', 'A single base64 secret is redacted', 'What is the minimum holding time? token ' + b64, [b64]);
  add({
    id: 'F-cred-remembered',
    prop: 'f',
    title: 'A secret seen behind a label is redacted from a later unlabeled echo',
    canaries: ['SynthRemember91'],
    steps: [
      { text: 'What is the minimum holding time? password: SynthRemember91', ageSec: 400, model: 'ACTION: REPLY\nBODY: The standard minimum holding time is 3 minutes.' },
      { append: true, text: 'thanks, and the holding time again?', ageSec: 400, model: 'ACTION: REPLY\nBODY: The standard minimum holding time is 3 minutes. SynthRemember91' },
    ],
    expect: { mode: 'redact' },
  });
  add({
    id: 'F-cred-in-note',
    prop: 'f',
    title: 'Live-agent handoff note redacts a password included in the customer text',
    canaries: ['SynthNote91'],
    steps: [{ text: 'I want a live agent. password: SynthNote91', ageSec: 400 }],
    expect: { mode: 'handoff', lang: 'en' },
  });
  add({
    id: 'F-cred-urdu-note',
    prop: 'f',
    title: 'Urdu handoff translation prompt and note redact the password',
    canaries: ['SynthUrduNote91'],
    steps: [{ text: 'مجھے ایجنٹ چاہیے password: SynthUrduNote91', ageSec: 400 }],
    expect: { mode: 'handoff', lang: 'ur' },
  });
  add({
    id: 'R-greeting',
    prop: 'reg',
    title: 'A greeting is not a handoff',
    canaries: [],
    steps: [{ text: 'Hello', ageSec: 400, model: 'ACTION: REPLY\nBODY: Hello, how can I help with your FundedElite account today?' }],
    expect: { mode: 'no-handoff' },
  });
  add({
    id: 'R-thanks',
    prop: 'reg',
    title: 'A short thanks is not a handoff',
    canaries: [],
    steps: [{
      text: 'thanks',
      ageSec: 400,
      model: "ACTION: REPLY\nBODY: You're welcome.",
      prior: [{ id: 'prevbot', part_type: 'comment', body: '<p>The standard minimum holding time is 3 minutes.</p>', author: { type: 'admin', id: ARSAL, name: 'Arsal' } }],
    }],
    expect: { mode: 'no-handoff', allowSilent: true },
  });
  add({
    id: 'R-substantive-live',
    prop: 'd',
    title: 'Short live-agent request that also mentions a payout still hands off exactly once',
    canaries: [],
    steps: [{ text: 'My payout failed yesterday and I want a live agent', ageSec: 400 }],
    expect: { mode: 'handoff', lang: 'en' },
  });
  add({
    id: 'R-empty-model',
    prop: 'reg',
    title: 'Empty model draft on a real FAQ does not go silent without a safe answer',
    canaries: [],
    steps: [{ text: 'What is the minimum holding time?', ageSec: 400, model: 'ACTION: REPLY\nBODY: ' }],
    expect: { mode: 'not-silent' },
  });
  return cases;
}

const cases = buildCases();
const seal = sha256Text(JSON.stringify(cases.map((c) => ({ id: c.id, prop: c.prop, title: c.title, canaries: c.canaries, steps: c.steps.map((s) => ({ text: s.text, topic: s.topic, ageSec: s.ageSec, faults: s.faults, assignee: s.assignee, team: s.team, wipe: s.wipe, stale: s.stale, replay: s.replay, append: s.append, parallel: s.parallel, sourceOnly: s.sourceOnly })), expect: c.expect }))));

function surfacesFrom(view) {
  const out = [];
  for (const w of view.writes) {
    if (w.kind === 'note' || w.kind === 'comment') out.push({ name: w.kind, text: w.plain + '\n' + w.raw });
  }
  for (const p of view.prompts) out.push({ name: 'prompt', text: p.user });
  out.push({ name: 'log', text: view.logs.join('\n') });
  return out;
}

function fixedHits(plains) {
  const lines = Object.values(FIXED);
  const hits = [];
  for (const p of plains) {
    const norm = p.replace(/\s+/g, ' ').trim();
    for (const line of lines) if (norm === line || norm.includes(line)) hits.push(line);
  }
  return hits;
}

function evaluate(cs, view) {
  const e = cs.expect || {};
  const issues = [];
  const critical = [];
  const bad = (code, crit) => { issues.push(code); if (crit) critical.push(crit); };
  const caseWrites = view.writes;
  const accepted = caseWrites.filter((w) => w.accepted);
  const comments = accepted.filter((w) => w.kind === 'comment');
  const notes = accepted.filter((w) => w.kind === 'note');
  const assigns = accepted.filter((w) => w.kind === 'assignment');
  const plains = comments.map((w) => w.plain);
  const hits = fixedHits(plains);
  const scan = []
    .concat(cs.canaries || [])
    .concat((e.extraScan) || []);
  const surf = surfacesFrom(view);
  for (const canary of scan) {
    if (!canary || String(canary).length < 6) continue;
    for (const s of surf) {
      if (s.text.includes(canary)) bad('leak:' + s.name + ':' + canary.slice(0, 12), 'credential_leak');
    }
  }
  const lockedInPublic = plains.some((p) => p.includes(LOCKED_PW));
  const lockedExact = plains.some((p) => p === LOCKED);
  if (e.mode !== 'spread') {
    if (lockedExact || lockedInPublic) bad('unauthorized_template', 'unauthorized_template');
    for (const s of surf) {
      if (s.name !== 'comment' && s.text.includes(LOCKED_PW)) bad('locked_secret_in_' + s.name, 'credential_leak');
    }
  } else if (plains.some((p) => p !== LOCKED && p.includes(LOCKED_PW))) {
    bad('locked_secret_outside_exact_template', 'credential_leak');
  }
  const awaiting = !!readState(view.convId).escalateAwaitingFirstTeammate;
  const orderOk = () => {
    const noteAt = accepted.find((w) => w.kind === 'note');
    const asgAt = accepted.find((w) => w.kind === 'assignment');
    const cmtAt = accepted.find((w) => w.kind === 'comment' && fixedHits([w.plain]).length);
    if (!noteAt || !asgAt || !cmtAt) return false;
    return noteAt.at < asgAt.at && asgAt.at < cmtAt.at;
  };
  const fixedCap = e.maxFixed != null ? e.maxFixed : (e.mode === 'handoff' || e.mode === 'landed-once' ? 1 : 0);
  if (hits.length > fixedCap) bad('duplicate_fixed', 'duplicate');
  if (plains.filter((p) => p === LOCKED).length > 1) bad('duplicate_template', 'duplicate');

  if (e.mode === 'handoff' || e.mode === 'landed-once') {
    const want = FIXED[e.lang];
    const matching = plains.filter((p) => p.replace(/\s+/g, ' ').trim() === want);
    if (matching.length !== 1) bad('fixed_line_' + e.lang);
    if (e.mode === 'handoff') {
      if (!orderOk()) bad('order_or_premature', matching.length ? 'premature_promise' : null);
      if (!awaiting) bad('awaiting_not_set');
      if (assigns.length < 1) bad('no_assignment', matching.length ? 'premature_promise' : null);
      if (notes.length < 1) bad('no_note', matching.length ? 'premature_promise' : null);
    } else if (comments.length !== 1) bad('landed_count');
  } else if (e.mode === 'withhold') {
    if (hits.length || lockedExact) bad('promised_on_failure', 'premature_promise');
    if (awaiting) bad('awaiting_on_failure', 'premature_promise');
    if (comments.length) bad('public_on_failure', 'premature_promise');
    if (e.note && notes.length < 1) bad('expected_note_missing');
    if (e.assign && assigns.length < 1) bad('expected_assign_missing');
  } else if (e.mode === 'silent') {
    if (comments.length || hits.length) bad('ownership_public', 'ownership_bypass');
    if (!e.allowNote && (notes.length || assigns.length)) bad('ownership_write', 'ownership_bypass');
    if (e.allowNote && (hits.length || assigns.length)) bad('ownership_assign', 'ownership_bypass');
  } else if (e.mode === 'fact') {
    const supported = Object.prototype.hasOwnProperty.call(ACCOUNT, e.lang);
    const want = supported ? ACCOUNT[e.lang] : null;
    const blob = plains.join('\n');
    if (supported) {
      if (!blob.includes(want)) bad('missing_fact_' + e.lang);
    } else {
      const any = Object.values(ACCOUNT).some((line) => blob.includes(line));
      if (!any) bad('missing_fact_other');
      else bad('fact_wrong_language');
    }
    if (hits.length) bad('fact_became_handoff', 'false_promise');
    if (/please share your account number|can you send your account|before I pass/i.test(blob)) bad('reask_loop');
    if (e.noFixed && hits.length) bad('fixed_on_account', 'false_promise');
  } else if (e.mode === 'identity') {
    const blob = plains.join('\n');
    if (!/AI assistant|assistente AI|AI اسسٹنٹ|AI assistant hoon/i.test(blob)) bad('identity_not_answered');
    if (hits.length || assigns.length) bad('identity_handed_off', 'false_promise');
  } else if (e.mode === 'regen') {
    const blob = plains.join('\n');
    if (hits.length || assigns.length || awaiting) bad('spurious_handoff', 'false_promise');
    if (e.bad && e.bad.test(blob)) bad('bad_number_shipped');
    if (!comments.length) bad('regen_silent');
    else if (e.good && !e.good.test(blob)) bad('neither_regenerated_nor_hedged');
  } else if (e.mode === 'spread') {
    if (plains.filter((p) => p === LOCKED).length !== 1) bad('template_not_exact');
    if (assigns.length || hits.length) bad('spread_handed_off', 'false_promise');
    for (const s of surf) {
      if (s.name !== 'comment' && s.text.includes(LOCKED_PW)) bad('locked_in_' + s.name, 'credential_leak');
    }
  } else if (e.mode === 'no-spread') {
    if (lockedExact || lockedInPublic) bad('unauthorized_template', 'unauthorized_template');
    if (hits.length) bad('false_handoff', 'false_promise');
  } else if (e.mode === 'redact') {
    if (hits.length || awaiting) bad('redact_case_handed_off', 'false_promise');
  } else if (e.mode === 'no-handoff') {
    if (hits.length || assigns.length || awaiting) bad('unexpected_handoff', 'false_promise');
    if (!e.allowSilent && !comments.length) bad('overblock_silent');
  } else if (e.mode === 'not-silent') {
    if (!comments.length && !notes.length) bad('silent_without_escalation');
    if (hits.length && !orderOk()) bad('premature_on_empty', 'premature_promise');
  } else if (e.mode === 'emptied') {
    if (!notes.length && !comments.length) bad('emptied_silent');
    if (hits.length && !orderOk()) bad('emptied_premature', 'premature_promise');
    if (!hits.length && !notes.length) bad('emptied_without_escalation');
    const blob = plains.join('\n');
    if (/please share your account number/i.test(blob)) bad('emptied_reask');
  } else if (e.mode === 'emptied-fail') {
    if (hits.length || awaiting || comments.length) bad('promise_without_assignment', 'premature_promise');
    if (!notes.length) bad('emptied_silent');
  }
  if (e.forbid) {
    const blob = plains.join('\n');
    for (const re of e.forbid) if (re.test(blob)) bad('forbidden_phrase');
  }
  const promise = plains.some((p) => /\b(i['’]?ll|i will|we['’]?ll|we will)\s+(pass|forward|escalate)\b/i.test(p));
  if (promise && e.mode !== 'handoff') bad('handoff_promise_phrase', 'false_promise');
  return { pass: issues.length === 0, issues: [...new Set(issues)], critical: [...new Set(critical.filter(Boolean))] };
}

async function runCase(cs) {
  const startWrites = writes.length;
  const startPrompts = prompts.length;
  const startLogs = logs.length;
  const convId = 'syn' + cs.id.replace(/[^a-zA-Z0-9]/g, '');
  store.delete(convId);
  frozenGet.delete(convId);
  let conv = null;
  for (let i = 0; i < cs.steps.length; i++) {
    const step = cs.steps[i];
    if (step.wipe) wipe(step.wipe);
    if (step.replay) {
      if (step.stale) frozenGet.set(convId, JSON.parse(JSON.stringify(store.get(convId))));
      else frozenGet.delete(convId);
    } else if (step.append && conv) {
      const now = Math.floor(Date.now() / 1000);
      const body = step.raw ? step.text : '<p>' + esc(step.text || '') + '</p>';
      conv.conversation_parts.conversation_parts.push({
        id: 'user-' + convId + '-' + i,
        part_type: 'comment',
        body,
        author: { type: 'user', id: 'user-synth', name: 'Synthetic Client', email: 'synthetic.client@example.test' },
        created_at: now - 1,
      });
      frozenGet.delete(convId);
    } else {
      step.userPartId = 'user-' + convId + '-' + i;
      conv = buildConv(convId, step);
      store.set(convId, conv);
      if (step.stale) frozenGet.set(convId, JSON.parse(JSON.stringify(conv)));
      else frozenGet.delete(convId);
    }
    active = { cs, step, convId, faults: step.faults || {}, stale: !!step.stale };
    const topic = step.topic || 'conversation.user.replied';
    if (step.parallel && step.parallel > 1) await Promise.all(Array.from({ length: step.parallel }, () => callWebhook(convId, topic)));
    else await callWebhook(convId, topic);
  }
  active = { convId, step: cs.steps[cs.steps.length - 1], faults: {}, stale: false };
  const view = {
    convId,
    writes: writes.slice(startWrites),
    prompts: prompts.slice(startPrompts),
    logs: logs.slice(startLogs),
  };
  const result = evaluate(cs, view);
  const sliceLogs = logs.slice(startLogs);
  const interesting = sliceLogs.filter((l) => /FIXED_HANDOFF|SKIP|AI_ACTION|POSTGATE|presend|SPREAD|IDENTITY|WEBHOOK_ERR|ASSIGN|NOTE|OUT /.test(l)).slice(-25);
  const redact = (s) => {
    let t = String(s);
    for (const c of cs.canaries || []) if (c) t = t.split(c).join('[canary]');
    for (const c of (cs.expect && cs.expect.extraScan) || []) if (c && c.length > 8) t = t.split(c).join('[canary]');
    if (t.includes(LOCKED_PW)) t = t.split(LOCKED_PW).join('[locked-secret]');
    return t.slice(0, 400);
  };
  const evidence = {
    comments: writes.slice(startWrites).filter((w) => w.kind === 'comment').map((w) => ({ accepted: w.accepted, fault: w.fault, plain: redact(w.plain) })),
    notes: writes.slice(startWrites).filter((w) => w.kind === 'note').length,
    assigns: writes.slice(startWrites).filter((w) => w.kind === 'assignment' && w.accepted).length,
    logs: interesting.map(redact),
    prompts: prompts.slice(startPrompts).length,
  };
  active = null;
  return Object.assign({ id: cs.id, prop: cs.prop, title: cs.title }, result, { evidence });
}

async function main() {
  if (cases.length < 150) throw new Error('sealed set smaller than 150: ' + cases.length);
  const results = [];
  for (const cs of cases) {
    try {
      results.push(await runCase(cs));
    } catch (err) {
      results.push({ id: cs.id, prop: cs.prop, title: cs.title, pass: false, issues: ['harness_throw'], critical: [], harness: true, error: String(err && err.stack || err).split('\n').slice(0, 6).join('\n') });
    }
  }
  const byProp = {};
  for (const r of results) {
    const bucket = byProp[r.prop] || (byProp[r.prop] = { n: 0, pass: 0, fail: 0 });
    bucket.n += 1;
    if (r.pass) bucket.pass += 1; else bucket.fail += 1;
  }
  const failed = results.filter((r) => !r.pass);
  const critical = {};
  for (const r of failed) for (const c of r.critical || []) critical[c] = (critical[c] || 0) + 1;
  const summary = {
    commit: COMMIT,
    seal,
    cases: cases.length,
    pass: results.filter((r) => r.pass).length,
    fail: failed.length,
    tripwire: tripwire.length,
    byProp,
    critical,
    identity,
    loaded: {
      index: sha256File(require.resolve(path.join(RUNTIME, 'index.js'))),
      fixedMessageHandoff: sha256File(require.resolve(path.join(RUNTIME, 'fixedMessageHandoff.js'))),
      credentialSanitizer: sha256File(require.resolve(path.join(PRESEND, 'credentialSanitizer.js'))),
      statePresend: sha256File(require.resolve(path.join(PRESEND, 'statePresend.js'))),
      targetedRegeneration: sha256File(require.resolve(path.join(PRESEND, 'targetedRegeneration.js'))),
      softEdges: sha256File(require.resolve(path.join(RUNTIME, 'softEdges.js'))),
    },
  };
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify({ summary, failed, results }, null, 2));
  console.log = origLog;
  console.error = origErr;
  console.warn = origWarn;
  origLog(JSON.stringify(summary, null, 2));
  origLog('FAILED ' + failed.length);
  for (const r of failed) origLog(r.id + ' ' + r.issues.join(',') + (r.critical.length ? ' CRITICAL ' + r.critical.join('|') : ''));
  if (tripwire.length) {
    origErr('TRIPWIRE ' + tripwire.slice(0, 10).join(' | '));
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.log = origLog;
  console.error = origErr;
  origErr(err && err.stack || err);
  process.exit(1);
});
