'use strict';

/**
 * In-process runner for one Luna tree.
 * Real handleWebhook. Axios is a recording transport (exact request body bytes).
 * The model is a stub. Sockets, DNS, and fetch are tripwired.
 *
 * Usage: node worker.js --source <tree> --cases <cases.json> --out <results.json> [--lane review]
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const net = require('net');
const tls = require('tls');
const dns = require('dns');
const http = require('http');
const https = require('https');
const childProcess = require('child_process');

const ARSAL = '10118526';
const ELITE = '8052954';
const JERRY = '8053416';
const SUPPORT_TEAM = 9629780;

const ADMINS = [
  {
    id: '900001',
    name: 'Seat A',
    email: 'seat-a@example.test',
    has_inbox_seat: true,
    away_mode_enabled: false,
    team_ids: [SUPPORT_TEAM],
    type: 'admin',
  },
];

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}

const source = path.resolve(arg('--source', ''));
const casesPath = path.resolve(arg('--cases', ''));
const outPath = path.resolve(arg('--out', ''));
const lane = arg('--lane', '');
if (!source || !casesPath || !outPath) {
  console.error('need --source --cases --out');
  process.exit(2);
}

const layout = fs.mkdtempSync('/tmp/luna-layout-');
const mirror = path.join(layout, '01_runtime');
const stateDir = fs.mkdtempSync('/tmp/luna-state-');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'test_mirror' || ent.name === 'isolated_state') continue;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(from, to);
    else if (ent.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(from), to);
    else fs.copyFileSync(from, to);
  }
}

// statePresend must live inside 01_runtime so presendMega's ../repeatedClientQuestion
// and ../assistantIdentityGuard resolve. targetedRegeneration's ../01_runtime/*
// resolves through a self-symlink. fixedMessageHandoff's ../02_statePresend/*
// resolves through a sibling symlink to that same statePresend copy.
copyDir(path.join(source, 'luna-current/01_runtime'), mirror);
copyDir(path.join(source, 'luna-current/02_statePresend'), path.join(mirror, 'statePresend'));
copyDir(path.join(source, 'luna-current/03_luna-maintainer'), path.join(mirror, 'luna-maintainer'));
fs.symlinkSync(path.join(mirror, 'statePresend'), path.join(layout, '02_statePresend'));
fs.symlinkSync(mirror, path.join(mirror, '01_runtime'));

const controlFile = path.join(stateDir, 'control.json');
const opFile = path.join(stateDir, 'ops.json');
const ticketFile = path.join(stateDir, 'tickets.json');
const mentionFile = path.join(stateDir, 'mentions.json');
const imageFile = path.join(stateDir, 'image.json');
const maintainerDir = path.join(stateDir, 'maintainer');
fs.mkdirSync(maintainerDir, { recursive: true });

process.env.NODE_PATH = '/tmp/luna-deps/node_modules';
Module._initPaths();
process.env.LUNA_CONTROL_STATE_FILE = controlFile;
process.env.LUNA_OP_STORE_FILE = opFile;
process.env.LUNA_PROMPT_FILE = path.join(mirror, 'system-prompt.txt');
process.env.TICKET_STATE_FILE = ticketFile;
process.env.MENTION_ROTATE_FILE = mentionFile;
process.env.IMAGE_GUARD_STATE_FILE = imageFile;
process.env.FUNDEDELITE_FAQ_PATH = path.join(mirror, 'fundedelite-faqs.md');
process.env.MAINTAINER_ENABLED = 'false';
process.env.MAINTAINER_DATA_DIR = maintainerDir;
process.env.OPENAI_API_KEY = 'synthetic-review-key';
process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-review-token';
process.env.CONTROL_SECRET = 'synthetic-review-secret';
process.env.LUNA_PRESEND_MODE = 'enforce';
process.env.LUNA_TOOLS_ENABLED = '0';
process.env.LUNA_ATTACHMENT_HOSTS = '';

let tripwireHits = [];
function trip(kind, detail) {
  const err = new Error('NETWORK_TRIPWIRE ' + kind + ' ' + detail);
  err.code = 'NETWORK_TRIPWIRE';
  tripwireHits.push({ kind, detail: String(detail).slice(0, 300) });
  throw err;
}
net.Socket.prototype.connect = function () { trip('socket', 'connect'); };
net.connect = function () { trip('socket', 'net.connect'); };
net.createConnection = function () { trip('socket', 'createConnection'); };
if (tls.connect) tls.connect = function () { trip('tls', 'connect'); };
for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
  dns[name] = function () { trip('dns', name); };
}
http.request = function () { trip('http', 'request'); };
http.get = function () { trip('http', 'get'); };
https.request = function () { trip('https', 'request'); };
https.get = function () { trip('https', 'get'); };
global.fetch = function () { trip('fetch', 'global'); };
for (const k of ['exec', 'execSync', 'spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']) {
  childProcess[k] = function () { trip('child', k); };
}

let records = [];
let unexpected = [];
let conversation = null;
let writeQueues = {};
let modelScript = [];
let modelIdx = 0;
let modelCalls = 0;

function hasErrorList(data) {
  if (!data || typeof data !== 'object') return false;
  if (String(data.type || '') === 'error.list') return true;
  if (Array.isArray(data.errors) && data.errors.length) return true;
  return false;
}

function defaultSuccess(messageType, data) {
  if (messageType === 'assignment') {
    return {
      type: 'conversation',
      id: conversation && conversation.id,
      admin_assignee_id: data && data.assignee_id != null ? String(data.assignee_id) : '900001',
    };
  }
  if (messageType === 'note') {
    return {
      type: 'conversation',
      id: conversation && conversation.id,
      conversation_parts: {
        conversation_parts: [
          {
            part_type: 'note',
            id: 'note-' + records.length,
            body: (data && data.body) || '',
            author: { type: 'admin', id: ARSAL, name: 'Arsal' },
          },
        ],
      },
    };
  }
  if (messageType === 'comment') {
    return { type: 'admin_reply', id: 'reply-' + records.length };
  }
  if (messageType === 'open' || messageType === 'close') {
    return { type: 'conversation', id: conversation && conversation.id, state: messageType === 'close' ? 'closed' : 'open' };
  }
  return { type: 'conversation', id: conversation && conversation.id };
}

function applyWrite(messageType, data) {
  if (!conversation) return;
  const parts = conversation.conversation_parts.conversation_parts;
  const now = Math.floor(Date.now() / 1000);
  if (messageType === 'note') {
    parts.push({
      id: 'applied-note-' + parts.length,
      part_type: 'note',
      body: (data && data.body) || '',
      created_at: now,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    });
  } else if (messageType === 'assignment') {
    const id = data && data.assignee_id != null ? String(data.assignee_id) : '900001';
    conversation.admin_assignee_id = id;
    parts.push({
      id: 'applied-asg-' + parts.length,
      part_type: 'assignment',
      body: '',
      created_at: now,
      author: { type: 'admin', id: ARSAL },
      assigned_to: { type: 'admin', id },
      assignee_id: id,
    });
  } else if (messageType === 'comment') {
    parts.push({
      id: 'applied-c-' + parts.length,
      part_type: 'comment',
      body: (data && data.body) || '',
      created_at: now,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    });
  } else if (messageType === 'close') {
    conversation.state = 'closed';
    conversation.open = false;
  } else if (messageType === 'open') {
    conversation.state = 'open';
    conversation.open = true;
  }
}

function scriptedWrite(data) {
  const messageType = String((data && data.message_type) || 'other');
  const queue = writeQueues[messageType] || [];
  const spec = queue.length ? queue.shift() : null;
  if (spec && spec.timeout) {
    const err = new Error('timeout of 20000ms exceeded');
    err.code = 'ECONNABORTED';
    throw err;
  }
  if (spec && spec.hangup) {
    const err = new Error('socket hang up');
    err.code = 'ECONNRESET';
    throw err;
  }
  const status = spec && spec.status != null ? spec.status : 200;
  const responseData = spec && Object.prototype.hasOwnProperty.call(spec, 'data')
    ? spec.data
    : defaultSuccess(messageType, data);
  const clean = status >= 200 && status < 300 && responseData && !hasErrorList(responseData);
  const named = responseData && responseData.admin_assignee_id != null ? String(responseData.admin_assignee_id) : '';
  const wanted = data && data.assignee_id != null ? String(data.assignee_id) : '';
  const wrong = messageType === 'assignment' && named && wanted && named !== wanted;
  const applied = !!(clean && !wrong && !(spec && spec.apply === false));
  if (applied) applyWrite(messageType, data);
  return { status, data: responseData, applied, messageType };
}

function recordingAxios(config) {
  config = config || {};
  const method = String(config.method || 'get').toLowerCase();
  const url = String(config.url || '');
  const data = config.data;
  const bodyStr = data == null ? '' : (typeof data === 'string' ? data : JSON.stringify(data));
  const bytes = Buffer.from(bodyStr, 'utf8');
  if (method === 'get' && /\/conversations\/[^/?#]+$/.test(url)) {
    records.push({ method, url, byteLength: 0, bytes: '', messageType: '', status: 200, applied: false, kind: 'fetch' });
    return Promise.resolve({ status: 200, data: conversation, headers: {} });
  }
  if (method === 'get' && /api\.intercom\.io\/admins\/?$/.test(url)) {
    records.push({ method, url, byteLength: 0, bytes: '', messageType: '', status: 200, applied: false, kind: 'admins' });
    return Promise.resolve({ status: 200, data: { admins: ADMINS }, headers: {} });
  }
  if (method === 'get' && /api\.intercom\.io\/admins\/[^/]+$/.test(url)) {
    const id = url.split('/').pop();
    records.push({ method, url, byteLength: 0, bytes: '', messageType: '', status: 200, applied: false, kind: 'admin' });
    return Promise.resolve({ status: 200, data: { id, name: 'Teammate', type: 'admin', email: 't@example.test' }, headers: {} });
  }
  if (/faq\.fundedelite\.com|fundedelite\.com/.test(url)) {
    records.push({ method, url, byteLength: bytes.length, bytes: bytes.toString('utf8'), messageType: '', status: 200, applied: false, kind: 'faq-blocked' });
    return Promise.resolve({ status: 200, data: {}, headers: {} });
  }
  if (method === 'post' && /\/conversations\/search$/.test(url)) {
    records.push({ method, url, byteLength: bytes.length, bytes: bytes.toString('utf8'), messageType: '', status: 200, applied: false, kind: 'search' });
    return Promise.resolve({ status: 200, data: { conversations: [], total_count: 0 }, headers: {} });
  }
  if (method === 'post' && /\/reply$/.test(url)) {
    try {
      const result = scriptedWrite(data);
      records.push({
        method,
        url,
        byteLength: bytes.length,
        bytes: bytes.toString('utf8'),
        messageType: result.messageType,
        status: result.status,
        applied: result.applied,
        kind: 'write',
      });
      return Promise.resolve({ status: result.status, data: result.data, headers: {} });
    } catch (err) {
      records.push({
        method,
        url,
        byteLength: bytes.length,
        bytes: bytes.toString('utf8'),
        messageType: String((data && data.message_type) || ''),
        status: 0,
        applied: false,
        kind: 'write-throw',
        error: err.code || err.message,
      });
      return Promise.reject(err);
    }
  }
  unexpected.push(method + ' ' + url);
  records.push({ method, url, byteLength: bytes.length, bytes: bytes.toString('utf8'), messageType: '', status: 404, applied: false, kind: 'unexpected' });
  return Promise.resolve({ status: 404, data: { type: 'error.list', errors: [{ code: 'unscripted' }] }, headers: {} });
}
recordingAxios.get = (url, opts) => recordingAxios(Object.assign({}, opts || {}, { method: 'get', url }));
recordingAxios.post = (url, data, opts) => recordingAxios(Object.assign({}, opts || {}, { method: 'post', url, data }));
recordingAxios.put = (url, data, opts) => recordingAxios(Object.assign({}, opts || {}, { method: 'put', url, data }));
recordingAxios.delete = (url, opts) => recordingAxios(Object.assign({}, opts || {}, { method: 'delete', url }));
recordingAxios.request = recordingAxios;
recordingAxios.create = () => recordingAxios;
recordingAxios.interceptors = { request: { use() {} }, response: { use() {} } };
recordingAxios.defaults = { headers: { common: {} } };

class OpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (req) => {
          modelCalls += 1;
          const messages = (req && req.messages) || [];
          const userBlob = messages
            .filter((m) => m && m.role !== 'system')
            .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')))
            .join('\n');
          // The base system prompt also contains the owner-command heading.
          // Only the dedicated rewrite and direct-command user turns are canned.
          if (/Rewrite the following INTERNAL Intercom note field/.test(userBlob)) {
            return { choices: [{ message: { content: userBlob } }] };
          }
          if (/DIRECT COMMAND from /.test(userBlob) || /Interpret the direct command/.test(userBlob)) {
            return { choices: [{ message: { content: 'ACTION: NOTE\nBODY: Noted internally.' } }] };
          }
          const scripted = modelScript.length
            ? modelScript[Math.min(modelIdx, modelScript.length - 1)]
            : 'ACTION: REPLY\nBODY: I can help with that from the FAQ.';
          modelIdx += 1;
          if (scripted === '__EMPTY__') return { choices: [{ message: { content: '' } }] };
          if (scripted === '__WHITESPACE__') return { choices: [{ message: { content: '   \n  ' } }] };
          return { choices: [{ message: { content: scripted } }] };
        },
      },
    };
  }
}

const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'axios') return recordingAxios;
  if (request === 'openai') return OpenAI;
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  return realLoad.call(this, request, parent, isMain);
};

const logs = [];
const origLog = console.log;
const origErr = console.error;
console.log = (...a) => { logs.push(a.map(String).join(' ')); };
console.error = (...a) => { logs.push(a.map(String).join(' ')); };

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function loadIndex() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(layout)) delete require.cache[key];
  }
  return require(path.join(mirror, 'index.js'));
}

function materialize(spec, fallbackId) {
  const now = Math.floor(Date.now() / 1000);
  const parts = (spec.parts || []).map((p, i) => {
    const part = {
      id: p.id || ('p' + i),
      part_type: p.part_type || 'comment',
      body: p.body == null ? '' : p.body,
      created_at: now - (p.agoSec == null ? 30 + i : p.agoSec),
      author: p.author || { type: 'user', id: 'cust-1', name: spec.name || 'Casey', email: spec.email || 'casey@example.test' },
    };
    if (p.assigned_to) part.assigned_to = p.assigned_to;
    if (p.assignee_id != null) part.assignee_id = p.assignee_id;
    return part;
  });
  const name = spec.name || 'Casey';
  const email = spec.email || 'casey@example.test';
  const conv = {
    type: 'conversation',
    id: spec.conversationId || fallbackId,
    state: spec.state || 'open',
    open: spec.open !== false,
    created_at: now - (spec.createdAgoSec == null ? 10000 : spec.createdAgoSec),
    updated_at: now - 5,
    admin_assignee_id: spec.assignee == null ? ARSAL : spec.assignee,
    team_assignee_id: spec.team == null ? '0' : spec.team,
    source: {
      type: 'conversation',
      id: 'src-' + (spec.conversationId || fallbackId),
      body: spec.sourceBody || '',
      delivered_as: 'customer_initiated',
      author: { type: 'user', id: 'cust-1', name, email },
      created_at: now - 10000,
    },
    contacts: { type: 'contact.list', contacts: [{ type: 'user', id: 'cust-1', name, email }] },
    conversation_parts: { type: 'conversation_part.list', conversation_parts: parts },
  };
  if (spec.assigneeObj) conv.assignee = spec.assigneeObj;
  if (spec.adminAssigneeObj) conv.admin_assignee = spec.adminAssigneeObj;
  return conv;
}

function defaultControl() {
  return {
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: ['Bot test'],
    testAllowConversationIds: [],
    config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
  };
}

let indexApi = null;

async function runStep(step, convId) {
  if (step.restart) indexApi = loadIndex();
  if (!indexApi) indexApi = loadIndex();
  if (step.conversation) conversation = materialize(step.conversation, convId);
  modelScript = step.model || [];
  modelIdx = 0;
  writeQueues = {};
  for (const [k, v] of Object.entries(step.writes || {})) writeQueues[k] = (v || []).map((x) => Object.assign({}, x));
  const control = Object.assign(defaultControl(), step.control || {});
  writeJson(controlFile, control);
  if (step.ticket !== undefined) writeJson(ticketFile, step.ticket);
  if (step.opStore !== undefined) writeJson(opFile, step.opStore);
  if (step.wipeOp) { try { fs.unlinkSync(opFile); } catch (_) {} }
  if (step.corruptOp) fs.writeFileSync(opFile, '{{{not-json');
  writeJson(mentionFile, { recent: [] });
  const topic = step.topic || 'conversation.user.replied';
  const req = { body: { topic, data: { item: { id: conversation.id, type: 'conversation' } } }, headers: {} };
  const res = {
    statusCode: 0,
    sendStatus(code) { this.statusCode = code; return this; },
    status(code) { this.statusCode = code; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
  };
  let error = '';
  try {
    await indexApi.handleWebhook(req, res);
  } catch (err) {
    error = (err && (err.code || err.message)) || 'throw';
  }
  let aiOff = false;
  try {
    const saved = JSON.parse(fs.readFileSync(controlFile, 'utf8'));
    aiOff = !!(saved.aiOff && saved.aiOff[String(conversation.id)]);
  } catch (_) {}
  let opSnap = {};
  try { opSnap = JSON.parse(fs.readFileSync(opFile, 'utf8')); } catch (_) { opSnap = { __unreadable: true }; }
  return { http: res.statusCode, error, aiOff, opSnap };
}

function redactRecord(rec) {
  return {
    method: rec.method,
    url: String(rec.url || '').replace(/https:\/\/api\.intercom\.io/, 'https://api.intercom.io'),
    byteLength: rec.byteLength,
    bytes: rec.bytes,
    messageType: rec.messageType,
    status: rec.status,
    applied: rec.applied,
    kind: rec.kind,
    error: rec.error || '',
  };
}

async function main() {
  const all = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const selected = all.filter((c) => !lane || c.lane === lane);
  const results = [];
  for (const cse of selected) {
    logs.length = 0;
    records = [];
    unexpected = [];
    tripwireHits = [];
    modelCalls = 0;
    conversation = null;
    indexApi = loadIndex();
    try { fs.unlinkSync(opFile); } catch (_) {}
    try { fs.unlinkSync(ticketFile); } catch (_) {}
    writeJson(controlFile, defaultControl());
    const steps = cse.steps || [];
    const stepOut = [];
    for (let i = 0; i < steps.length; i++) {
      const before = records.length;
      const out = await runStep(steps[i], cse.id);
      stepOut.push({
        http: out.http,
        error: out.error,
        aiOff: out.aiOff,
        newRecords: records.slice(before).map(redactRecord),
        opSnap: out.opSnap,
      });
    }
    results.push({
      id: cse.id,
      lane: cse.lane,
      group: cse.group,
      failClass: cse.failClass || 'defect',
      modelCalls,
      unexpected,
      tripwire: tripwireHits.length,
      tripwireSample: tripwireHits.slice(0, 3),
      records: records.map(redactRecord),
      steps: stepOut,
      logTail: logs.slice(-40),
    });
  }
  fs.writeFileSync(outPath, JSON.stringify({ source, lane, count: results.length, results }, null, 2));
  origLog.call(console, 'WROTE', outPath, 'cases', results.length, 'tripwire', results.reduce((n, r) => n + r.tripwire, 0));
}

main().catch((err) => {
  origErr.call(console, err && err.stack || err);
  process.exit(1);
});
