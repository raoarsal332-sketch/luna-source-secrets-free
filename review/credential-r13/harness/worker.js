'use strict';

/**
 * Runs sealed cases against a patched copy of the real handleWebhook.
 * Synthetic transport only. Loopback is allowed so the local control routes
 * can be exercised. Every other connect, lookup, fetch, or spawn trips.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const dns = require('dns');
const cp = require('child_process');
const http = require('http');
const https = require('https');
const rawHttpRequest = http.request;
const rawHttpsRequest = https.request;

const SEAL_HASH = '5b3fc28f6ef56fbfe8de92e72a8dd29a6d0b86bd7585ea34db3ea2ca1ed3dafb';
const AUTH_LEN = 77282;
const AUTH_SHA = 'bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d';
const ARSAL_ID = '10118526';
const JERRY_ID = '8053416';
const ESCALATIONS_TEAM_ID = '9629759';

const trips = [];
function trip(kind, detail) {
  const row = { kind: kind, detail: String(detail == null ? '' : detail).slice(0, 240) };
  trips.push(row);
  const err = new Error('NETWORK_TRIPWIRE ' + kind + ' ' + row.detail);
  err.code = 'NETWORK_TRIPWIRE';
  throw err;
}

function hostOf(args) {
  const a = args[0];
  if (a && typeof a === 'object') return String(a.host || a.hostname || a.address || '');
  if (typeof args[1] === 'string') return args[1];
  return '';
}

function loopback(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function () {
  const host = hostOf(arguments);
  if (!loopback(host)) trip('connect', host || 'empty-host');
  return origConnect.apply(this, arguments);
};
for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
  const orig = dns[name];
  if (typeof orig !== 'function') continue;
  dns[name] = function (host) {
    if (!loopback(String(host || ''))) trip('dns-' + name, host);
    return orig.apply(this, arguments);
  };
}
for (const name of ['spawn', 'exec', 'execFile', 'fork', 'spawnSync', 'execSync', 'execFileSync']) {
  const orig = cp[name];
  if (typeof orig !== 'function') continue;
  cp[name] = function () {
    trip('child-' + name, arguments[0]);
    return orig.apply(this, arguments);
  };
}
const origFetch = global.fetch;
global.fetch = function (url) {
  trip('fetch', typeof url === 'string' ? url : (url && url.url) || 'request');
  if (typeof origFetch === 'function') return origFetch.apply(this, arguments);
  return Promise.reject(new Error('NETWORK_TRIPWIRE fetch'));
};

for (const key of Object.keys(process.env)) {
  if (/INTERCOM|OPENAI|API_KEY|SECRET|TOKEN|PASSWORD|AWS_|SSH|PRIVATE/i.test(key) && key !== 'PATH') {
    delete process.env[key];
  }
}

const runtime = process.env.R13_RUNTIME;
const stateDir = process.env.R13_STATE;
const casesPath = process.env.R13_CASES;
const httpLog = process.env.R13_HTTP_LOG || path.join(stateDir, 'http.jsonl');
if (!runtime || !stateDir || !casesPath) {
  process.stderr.write('worker missing R13_RUNTIME, R13_STATE, or R13_CASES\n');
  process.exit(2);
}

const sealedBytes = fs.readFileSync(casesPath);
const actualHash = crypto.createHash('sha256').update(sealedBytes).digest('hex');
if (actualHash !== SEAL_HASH) {
  process.stderr.write('SEAL MISMATCH ' + actualHash + '\n');
  process.exit(3);
}
const sealed = JSON.parse(sealedBytes.toString('utf8'));
const TEMPLATE = sealed.constants.template;
const FIXED = sealed.constants.fixed;
const REDACTED = sealed.constants.redactedNote;

fs.mkdirSync(stateDir, { recursive: true });
const ticketFile = path.join(stateDir, 'ticket-state.json');
const opFile = path.join(stateDir, 'write-ops.json');
const controlFile = path.join(stateDir, 'control.json');
const mentionFile = path.join(stateDir, 'mention.json');
if (!fs.existsSync(ticketFile)) fs.writeFileSync(ticketFile, '{}');
if (!fs.existsSync(opFile)) fs.writeFileSync(opFile, '{}');
fs.writeFileSync(controlFile, JSON.stringify({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Review Client'],
  testAllowConversationIds: [],
  config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
}, null, 2));

process.env.TICKET_STATE_FILE = ticketFile;
process.env.LUNA_OP_STORE_FILE = opFile;
process.env.LUNA_CONTROL_STATE_FILE = controlFile;
process.env.LUNA_PROMPT_FILE = path.join(runtime, 'system-prompt.txt');
process.env.MENTION_ROTATE_FILE = mentionFile;
process.env.CONTROL_SECRET = 'synthetic-review-secret';
process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-intercom-token-not-real';
process.env.OPENAI_API_KEY = 'synthetic-openai-key-not-real';
process.env.FUNDEDELITE_FAQ_PATH = path.join(runtime, 'fundedelite-faqs.md');
process.env.MAINTAINER_ENABLED = 'false';
process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';

const httpRecords = [];
const modelRecords = [];
const logLines = [];
const stateWrites = [];
const convoMap = new Map();
let modelQueue = [];
let retryState = null;
let hangWrites = process.env.R13_HANG === '1';

function recordingAxios(config) {
  if (typeof config === 'string') config = { url: config, method: 'get' };
  config = config || {};
  const method = String(config.method || 'get').toLowerCase();
  const url = String(config.url || '');
  const data = config.data === undefined ? null : config.data;
  const exact = JSON.stringify({ method: method, url: url, data: data });
  const rec = { method: method, url: url, data: data, exact: exact };
  httpRecords.push(rec);
  try { fs.appendFileSync(httpLog, JSON.stringify(rec) + '\n'); } catch (_) {}
  if (method === 'get' && /\/conversations\/([^/?]+)$/.test(url) && url.indexOf('/reply') < 0) {
    const id = decodeURIComponent(url.match(/\/conversations\/([^/?]+)$/)[1]);
    const conv = convoMap.get(String(id));
    if (!conv) return Promise.resolve({ status: 404, data: { error: 'missing' }, headers: {} });
    return Promise.resolve({ status: 200, data: conv, headers: {} });
  }
  if (method === 'get' && url.indexOf('/admins') >= 0) {
    return Promise.resolve({ status: 200, data: { type: 'admin.list', admins: [] }, headers: {} });
  }
  if (url.indexOf('faq.fundedelite.com') >= 0 || url.indexOf('fundedelite.com') >= 0) {
    return Promise.resolve({ status: 404, data: '', headers: {} });
  }
  if (retryState && method !== 'get' && url.indexOf(retryState.id) >= 0) {
    retryState.hits += 1;
    if (retryState.hits === 1) return Promise.resolve({ status: 429, data: { message: 'slow-down' }, headers: {} });
  }
  if (hangWrites && method !== 'get' && method !== 'head' && method !== 'options') {
    return new Promise(function () {});
  }
  return Promise.resolve({ status: 200, data: { id: 'rec-' + httpRecords.length, type: 'conversation' }, headers: {} });
}
for (const name of ['request', 'delete', 'head', 'options']) {
  recordingAxios[name] = function (url, opts) {
    return recordingAxios(Object.assign({ method: name === 'request' ? 'get' : name, url: url }, opts || {}));
  };
}
recordingAxios.get = function (url, opts) {
  return recordingAxios(Object.assign({ method: 'get', url: url }, opts || {}));
};
recordingAxios.post = function (url, data, opts) {
  return recordingAxios(Object.assign({ method: 'post', url: url, data: data }, opts || {}));
};
recordingAxios.put = function (url, data, opts) {
  return recordingAxios(Object.assign({ method: 'put', url: url, data: data }, opts || {}));
};
recordingAxios.patch = function (url, data, opts) {
  return recordingAxios(Object.assign({ method: 'patch', url: url, data: data }, opts || {}));
};
recordingAxios.create = function () { return recordingAxios; };
recordingAxios.defaults = { headers: { common: {} } };
recordingAxios.interceptors = { request: { use: function () {} }, response: { use: function () {} } };
recordingAxios.__recording = true;

function FakeOpenAI() {
  this.chat = {
    completions: {
      create: async function (payload) {
        modelRecords.push(payload);
        const script = modelQueue.length ? modelQueue.shift() : 'ACTION: REPLY\nBODY: Thanks, I can help with that.';
        return { choices: [{ message: { role: 'assistant', content: script } }] };
      },
    },
  };
}

const Module = require('module');
const realRequire = Module.prototype.require;
Module.prototype.require = function (request) {
  if (request === 'axios') return recordingAxios;
  if (request === 'openai') return FakeOpenAI;
  return realRequire.apply(this, arguments);
};

function capture(level, args) {
  const parts = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a === 'string') parts.push(a);
    else {
      try { parts.push(JSON.stringify(a)); } catch (_) { parts.push('[unprintable]'); }
    }
  }
  logLines.push(level + ' ' + parts.join(' '));
}
console.log = function () { capture('log', arguments); };
console.error = function () { capture('error', arguments); };
console.warn = function () { capture('warn', arguments); };
console.info = function () { capture('info', arguments); };

const origWrite = fs.writeFileSync;
fs.writeFileSync = function (file, data) {
  const name = String(file);
  if (/ticket-state|write-ops|control\.json|mention/.test(name)) {
    const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    stateWrites.push({ file: path.basename(name), text: text });
  }
  return origWrite.apply(fs, arguments);
};

process.chdir(runtime);
let engine;
let guard;
let statePresend;
try {
  engine = realRequire.call(module, path.join(runtime, 'index.js'));
  guard = realRequire.call(module, path.join(runtime, 'credentialGuardR13.js'));
  statePresend = realRequire.call(module, path.join(runtime, 'statePresend', 'statePresend.js'));
} catch (err) {
  process.stderr.write('BOOT_FAIL ' + (err && err.stack || err) + '\n');
  process.exit(4);
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function mask(text) {
  return String(text)
    .replace(/\b[a-f0-9]{32,}\b/gi, ' ')
    .replace(/\b\d{9,}\b/g, ' ');
}

function foldFormats(text) {
  return String(text).replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u180E]/g, '');
}

function needlesOf(row) {
  const set = [];
  const seen = new Set();
  function add(v) {
    if (v == null) return;
    const s = String(v);
    if (s.length < 4 || seen.has(s)) return;
    seen.add(s);
    set.push(s);
  }
  add(row.secret);
  add(row.alnum);
  for (const s of row.surfaces || []) add(s);
  for (const s of row.fragments || []) add(s);
  return set;
}

function byteCount(text, needles) {
  if (!needles || !needles.length) return 0;
  const folded = foldFormats(text);
  const views = [
    { hay: String(text), lower: false },
    { hay: folded, lower: false },
    { hay: folded.toLowerCase(), lower: true },
  ];
  let best = 0;
  const ordered = needles.slice().sort(function (a, b) { return b.length - a.length; });
  for (const view of views) {
    const masked = mask(view.hay);
    let total = 0;
    const occupied = [];
    for (const needle0 of ordered) {
      const needle = view.lower ? needle0.toLowerCase() : needle0;
      const hay = needle0.length >= 8 ? view.hay : masked;
      let from = 0;
      while (from < hay.length) {
        const at = hay.indexOf(needle, from);
        if (at < 0) break;
        const end = at + needle.length;
        let overlap = false;
        for (let i = 0; i < occupied.length; i++) {
          if (at < occupied[i][1] && end > occupied[i][0]) { overlap = true; break; }
        }
        if (!overlap) {
          total += Buffer.byteLength(needle0);
          occupied.push([at, end]);
        }
        from = end;
      }
    }
    if (total > best) best = total;
  }
  return best;
}

function excerpt(text, needle) {
  const hay = String(text);
  const at = hay.toLowerCase().indexOf(String(needle).toLowerCase());
  if (at < 0) return '';
  return hay.slice(Math.max(0, at - 40), Math.min(hay.length, at + needle.length + 40));
}

function scanBlob(text, needles) {
  const bytes = byteCount(text, needles);
  let sample = '';
  if (bytes && needles && needles.length) {
    const ordered = needles.slice().sort(function (a, b) { return b.length - a.length; });
    for (const n of ordered) {
      sample = excerpt(text, n);
      if (sample) break;
    }
  }
  return { bytes: bytes, sample: sample };
}

function scanModel(payload, needles) {
  const messages = (payload && payload.messages) || [];
  let bytes = 0;
  let sample = '';
  const roles = [];
  for (const msg of messages) {
    let content = '';
    if (typeof msg.content === 'string') content = msg.content;
    else content = JSON.stringify(msg.content == null ? '' : msg.content);
    roles.push({ role: msg.role || '', bytes: Buffer.byteLength(content) });
    let slice = content;
    if (msg.role === 'system' && content.length >= AUTH_LEN && sha256(content.slice(0, AUTH_LEN)) === AUTH_SHA) {
      slice = content.slice(AUTH_LEN);
    }
    const hit = scanBlob(slice, needles);
    const extra = JSON.stringify({ tool_calls: msg.tool_calls || null, function_call: msg.function_call || null });
    const hit2 = scanBlob(extra, needles);
    bytes += hit.bytes + hit2.bytes;
    if (!sample && (hit.sample || hit2.sample)) sample = hit.sample || hit2.sample;
  }
  return { bytes: bytes, sample: sample, roles: roles, sha256: sha256(JSON.stringify(messages)) };
}

function plainish(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCodePoint(Number(n)); })
    .replace(/\s+/g, ' ')
    .trim();
}

function bodiesOf(records) {
  const out = [];
  for (const rec of records) {
    const data = rec.data;
    if (!data || typeof data !== 'object') continue;
    if (typeof data.body === 'string') {
      out.push({
        method: rec.method,
        url: rec.url,
        messageType: data.message_type || '',
        body: data.body,
        plain: plainish(data.body),
      });
    }
  }
  return out;
}

function templatePasswordHits(records) {
  const password = 'QBG5FetfozKz7^a?J!';
  const hits = [];
  for (const body of bodiesOf(records)) {
    if (body.body === TEMPLATE) continue;
    if (body.body.indexOf(password) >= 0 || body.plain.indexOf(password) >= 0) {
      hits.push({ url: body.url, messageType: body.messageType, exactTemplate: false, sample: excerpt(body.body, password) });
    }
  }
  return hits;
}

function exactTemplateSends(records) {
  return bodiesOf(records).filter(function (b) { return b.body === TEMPLATE; });
}

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null,
    sendStatus: function (code) { res.statusCode = code; return res; },
    status: function (code) { res.statusCode = code; return res; },
    json: function (body) { res.body = body; return res; },
    send: function (body) { res.body = body; return res; },
    end: function () { return res; },
    setHeader: function () {},
  };
  return res;
}

function makeConv(id, text, opts) {
  opts = opts || {};
  const now = Math.floor(Date.now() / 1000);
  const created = opts.createdAt || now;
  const user = { type: 'user', id: 'user-' + id, name: 'Review Client' };
  const parts = opts.parts || [{
    id: 'part-' + id + '-' + created,
    part_type: 'comment',
    body: text,
    author: user,
    created_at: created,
  }];
  return {
    type: 'conversation',
    id: String(id),
    open: true,
    state: 'open',
    team_assignee_id: opts.team == null ? 0 : opts.team,
    admin_assignee_id: opts.admin == null ? 0 : opts.admin,
    created_at: opts.openedAt || (created - 30),
    contacts: { contacts: [{ id: 'ct-' + id, name: 'Review Client', email: 'synthetic@example.test' }] },
    source: {
      type: 'conversation',
      body: opts.sourceBody == null ? text : opts.sourceBody,
      author: user,
      created_at: opts.openedAt || (created - 30),
    },
    conversation_parts: { type: 'conversation_part.list', conversation_parts: parts },
  };
}

async function postWebhook(conv, topic) {
  convoMap.set(String(conv.id), conv);
  await engine.handleWebhook({
    body: { topic: topic || 'conversation.user.replied', data: { item: conv } },
    headers: {},
    get: function () { return ''; },
  }, fakeRes());
}

function callControl(url, payload) {
  return new Promise(function (resolve, reject) {
    const server = http.createServer(engine.app);
    server.listen(0, '127.0.0.1', function () {
      const port = server.address().port;
      const data = Buffer.from(JSON.stringify(payload || {}));
      const req = rawHttpRequest({
        host: '127.0.0.1',
        port: port,
        method: 'POST',
        path: url,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
          'X-Control-Secret': process.env.CONTROL_SECRET,
        },
      }, function (res) {
        const chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          server.close(function () {
            resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
          });
        });
      });
      req.on('error', function (err) { server.close(function () { reject(err); }); });
      req.end(data);
    });
  });
}

function resetIsolation() {
  try { guard.resetStore(); } catch (_) {}
  try { statePresend.resetAll(); } catch (_) {}
  convoMap.clear();
  modelQueue = [];
  retryState = null;
  try { origWrite.call(fs, ticketFile, '{}'); } catch (_) {}
}

function sinkText(bundle, memory, taintExport, convState) {
  const chunks = [];
  for (const rec of bundle.http) chunks.push(rec.exact);
  for (const line of bundle.logs) chunks.push(line);
  for (const w of bundle.states) chunks.push(w.text);
  chunks.push(JSON.stringify(memory || []));
  chunks.push(JSON.stringify(taintExport || {}));
  chunks.push(JSON.stringify(convState || {}));
  return chunks.join('\n');
}

function modelScan(bundle, needles) {
  let bytes = 0;
  let sample = '';
  const requests = [];
  for (const payload of bundle.models) {
    const hit = scanModel(payload, needles);
    bytes += hit.bytes;
    if (!sample && hit.sample) sample = hit.sample;
    requests.push({ sha256: hit.sha256, roles: hit.roles, secretBytes: hit.bytes });
  }
  return { bytes: bytes, sample: sample, requests: requests };
}

async function runTurns(row, id) {
  const turns = row.turns || [];
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const cid = id;
    if (turn.ownerReply || turn.ownerNote) {
      const cmd = turn.ownerReply ? ('REPLY: ' + turn.ownerReply) : ('NOTE: ' + turn.ownerNote);
      const now = Math.floor(Date.now() / 1000);
      const conv = makeConv(cid, turn.client || 'hello', {
        createdAt: now - 20,
        parts: [
          {
            id: 'user-' + cid,
            part_type: 'comment',
            body: turn.client || 'hello',
            author: { type: 'user', id: 'user-' + cid, name: 'Review Client' },
            created_at: now - 20,
          },
          {
            id: 'note-' + cid + '-' + i,
            part_type: 'note',
            body: '@Arsal ' + cmd,
            author: { type: 'admin', id: ARSAL_ID, name: 'Arsal' },
            created_at: now,
          },
        ],
      });
      modelQueue = [turn.model || 'ACTION: NOTE\nBODY: Okay, noted.'];
      await postWebhook(conv, 'conversation.admin.noted');
      continue;
    }
    const opts = { createdAt: turn.createdAt };
    if (turn.team === 'escalations') {
      opts.team = ESCALATIONS_TEAM_ID;
      opts.openedAt = Math.floor(Date.now() / 1000) - 20 * 60;
      opts.createdAt = Math.floor(Date.now() / 1000) - 20 * 60;
    }
    if (turn.team === 'jerry') {
      opts.admin = JERRY_ID;
      opts.openedAt = Math.floor(Date.now() / 1000) - 20 * 60;
      opts.createdAt = Math.floor(Date.now() / 1000) - 20 * 60;
    }
    if (turn.summary) modelQueue = [turn.summary, turn.model || 'ACTION: REPLY\nBODY: Thanks.'];
    else modelQueue = [turn.model || 'ACTION: REPLY\nBODY: Thanks, I can help with that.'];
    const conv = makeConv(cid, turn.client || '', opts);
    if (turn.throwBody) {
      const secret = row.secret;
      const trap = { toString: function () { throw new Error('cannot read body ' + secret); } };
      conv.conversation_parts.conversation_parts[0].body = trap;
      conv.source.body = trap;
    }
    await postWebhook(conv, 'conversation.user.replied');
  }
}

function templateVariant(kind) {
  if (kind === 'html') return TEMPLATE.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  if (kind === 'spaced') return TEMPLATE.split('\n').join('\n\n');
  if (kind === 'greeting') return 'Hello\n\n' + TEMPLATE;
  return TEMPLATE;
}

async function runCase(row) {
  const id = 'c' + row.id;
  const needles = needlesOf(row);
  const mark = {
    http: httpRecords.length,
    logs: logLines.length,
    states: stateWrites.length,
    models: modelRecords.length,
    trips: trips.length,
  };
  try {
    if (row.group === 'leak' || row.group === 'taint' || row.group === 'recovery') {
      if (row.shape === 'throwing-read') {
        await runTurns({ turns: [{ client: 'hello', throwBody: true }], secret: row.secret }, id);
      } else if (row.group === 'recovery' && row.shape === 'deferred-replay') {
        const now = Math.floor(Date.now() / 1000);
        const seeded = {};
        seeded[id] = {
          lastTouchedAt: now,
          escalateAwaitingFirstTeammate: false,
          escalateTeammateExplainedAt: now - 60,
          lastEscalateProblem: 'client asked about a reset',
          lastEscalateTopic: 'reset',
          lastEscalateTopics: ['reset'],
        };
        origWrite.call(fs, ticketFile, JSON.stringify(seeded));
        modelQueue = [row.model];
        await postWebhook(makeConv(id, row.ask), 'conversation.user.replied');
        modelQueue = ['ACTION: REPLY\nBODY: password krmplqvbnx from the deferred note'];
        const later = makeConv(id, 'what is the daily loss limit?', { createdAt: now - 11 * 60 });
        later.conversation_parts.conversation_parts.unshift({
          id: 'old-' + id,
          part_type: 'comment',
          body: row.ask,
          author: { type: 'user', id: 'user-' + id, name: 'Review Client' },
          created_at: now - 12 * 60,
        });
        await postWebhook(later, 'conversation.user.replied');
      } else if (row.group === 'recovery' && row.shape === 'duplicate-delivery') {
        modelQueue = [row.model, row.model];
        const conv = makeConv(id, row.ask);
        convoMap.set(id, conv);
        await Promise.all([
          engine.handleWebhook({ body: { topic: 'conversation.user.replied', data: { item: conv } }, get: function () { return ''; } }, fakeRes()),
          engine.handleWebhook({ body: { topic: 'conversation.user.replied', data: { item: conv } }, get: function () { return ''; } }, fakeRes()),
        ]);
      } else if (row.group === 'recovery' && row.shape === 'retry-429') {
        retryState = { id: id, hits: 0 };
        modelQueue = [row.model];
        await postWebhook(makeConv(id, row.ask), 'conversation.user.replied');
      } else if (row.group === 'taint' && row.shape === 'retry-after-deny') {
        modelQueue = [row.model];
        await postWebhook(makeConv(id, row.ask), 'conversation.user.replied');
        modelQueue = [row.model];
        await postWebhook(makeConv(id, 'just checking again'), 'conversation.user.replied');
      } else if (row.group === 'taint' && process.env.R13_PHASE === 'check') {
        modelQueue = [row.secondModel];
        await postWebhook(makeConv(id, row.secondAsk), 'conversation.user.replied');
      } else if (row.group === 'taint' && row.shape === 'restart-fresh-inbound') {
        modelQueue = [row.firstModel];
        await postWebhook(makeConv(id, row.firstAsk), 'conversation.user.replied');
      } else {
        await runTurns(row, id);
      }
    } else if (row.group === 'fail-closed') {
      if (row.shape === 'throwing-read') {
        await runTurns({ turns: [{ client: 'hello', throwBody: true }], secret: row.secret }, id);
      } else if (row.shape === 'throwing-outbound') {
        const payload = { method: 'POST', path: '/conversations/' + id + '/reply' };
        Object.defineProperty(payload, 'body', {
          enumerable: true,
          get: function () { throw new Error('read failed ' + row.secret); },
        });
        try { await callControl('/control/intercom', payload); } catch (err) { logLines.push('error CONTROL_THROW ' + (err && err.message)); }
      } else if (row.shape === 'oversize-reply') {
        const huge = (row.filler || 'krmplqvbnx ').repeat(row.count || 1200);
        modelQueue = ['ACTION: REPLY\nBODY: ' + huge];
        await postWebhook(makeConv(id, row.ask || 'what is the profit split?'), 'conversation.user.replied');
      } else if (row.shape === 'oversize-inbound') {
        const huge = (row.askPrefix || '') + 'x'.repeat(row.count || 20000);
        modelQueue = ['ACTION: REPLY\nBODY: The profit split is 80% on that challenge.'];
        await postWebhook(makeConv(id, huge), 'conversation.user.replied');
      } else if (row.shape === 'lt-run') {
        await callControl('/control/reply', { conversation_id: id, body: row.body });
      } else if (row.shape === 'timeout-scan') {
        let body = '';
        while (body.length < 15000) body += 'zq' + body.length.toString(36) + ' ';
        body += ' password krmplqvbnx';
        await callControl('/control/reply', { conversation_id: id, body: body });
      }
    } else if (row.group === 'spread') {
      modelQueue = ['ACTION: REPLY\nBODY: ' + templateVariant(row.replyVariant)];
      await postWebhook(makeConv(id, row.ask), 'conversation.user.replied');
    } else if (row.group === 'overblock') {
      if (row.preInbound) {
        modelQueue = ['ACTION: REPLY\nBODY: Please change that credential in your dashboard settings.'];
        await postWebhook(makeConv(id, row.preInbound), 'conversation.user.replied');
      }
      modelQueue = ['ACTION: REPLY\nBODY: ' + row.reply];
      await postWebhook(makeConv(id, row.ask), 'conversation.user.replied');
    } else if (row.group === 'boundary') {
      await runProbe(row);
    }
  } catch (err) {
    logLines.push('error CASE_THROW ' + (err && err.stack || err));
  }
  const bundle = {
    http: httpRecords.slice(mark.http),
    logs: logLines.slice(mark.logs),
    states: stateWrites.slice(mark.states),
    models: modelRecords.slice(mark.models),
    trips: trips.slice(mark.trips),
  };
  let memory = [];
  let convState = null;
  let taintExport = null;
  let borderline = [];
  try { memory = statePresend.snapshot(id).memory || []; } catch (_) {}
  try { convState = engine.getConvState(id).state; } catch (_) {}
  try { taintExport = guard.exportTaint(); } catch (_) {}
  try { borderline = guard.borderlineAsks(); } catch (_) {}
  const joined = sinkText(bundle, memory, taintExport, convState);
  const secret = scanBlob(joined, needles);
  const modeled = modelScan(bundle, needles);
  const publicBodies = bodiesOf(bundle.http);
  const templateSends = exactTemplateSends(bundle.http);
  const unauthorizedTemplate = templatePasswordHits(bundle.http);
  const fixedSends = publicBodies.filter(function (b) { return b.body === FIXED || b.plain === FIXED; });
  const blockedLog = bundle.logs.filter(function (line) { return /IC_REQ_BLOCKED|UNAUTHORIZED|UNGUARDED|NETWORK_TRIPWIRE/.test(line); });
  const result = {
    id: row.id,
    group: row.group,
    shape: row.shape || row.kind || row.probe || row.eligibility || '',
    channel: row.channel || '',
    lang: row.lang || '',
    expect: row.expect,
    secretBytes: {
      transportLogsState: secret.bytes,
      model: modeled.bytes,
      total: secret.bytes + modeled.bytes,
    },
    sample: secret.sample || modeled.sample || '',
    httpCount: bundle.http.length,
    writes: publicBodies.map(function (b) {
      return { messageType: b.messageType, bytes: Buffer.byteLength(b.body), exact: b.body.length > 4000 ? b.body.slice(0, 200) : b.body };
    }),
    exactTemplateSends: templateSends.length,
    unauthorizedTemplate: unauthorizedTemplate.length,
    fixedSends: fixedSends.length,
    modelRequests: modeled.requests,
    trips: bundle.trips,
    blockedLog: blockedLog.slice(0, 6),
    memoryMessages: (memory || []).map(function (m) { return { role: m.role, text: String(m.text || '').slice(0, 240) }; }),
    lastEscalateProblem: convState && convState.lastEscalateProblem ? String(convState.lastEscalateProblem).slice(0, 240) : '',
    deferred: convState && convState.deferredRelatedReply ? convState.deferredRelatedReply : null,
    borderline: borderline.slice(-4),
    logCount: bundle.logs.length,
  };
  result.verdict = judge(row, result, publicBodies);
  if (row.group === 'taint' && row.shape === 'restart-fresh-inbound' && process.env.R13_PHASE !== 'check') {
    result.keepState = true;
  }
  return result;
}

function judge(row, result, publicBodies) {
  if (row.group === 'boundary') return row.probeResult || 'unknown';
  if (row.expect === 'no-secret-bytes') {
    return result.secretBytes.total === 0 && result.unauthorizedTemplate === 0 ? 'pass' : 'fail';
  }
  if (row.expect === 'exact-template') {
    return result.exactTemplateSends === 1 && result.unauthorizedTemplate === 0 && result.secretBytes.total === 0 ? 'pass' : 'fail';
  }
  if (row.expect === 'no-template') {
    return result.exactTemplateSends === 0 && result.unauthorizedTemplate === 0 ? 'pass' : 'fail';
  }
  if (row.expect === 'fixed-only' || row.expect === 'fixed-or-timeout') {
    const raw = result.secretBytes.total > 0;
    const sentOther = publicBodies.some(function (b) { return b.body !== FIXED && b.body !== REDACTED && b.plain !== FIXED; });
    if (raw) return 'fail';
    if (row.shape === 'timeout-scan') {
      const timed = publicBodies.some(function (b) { return b.body === FIXED; }) || result.fixedSends > 0;
      return timed || !sentOther ? 'pass' : 'fail';
    }
    if (sentOther) return 'fail';
    return 'pass';
  }
  if (row.expect === 'deliver') {
    const text = publicBodies.map(function (b) { return b.plain; }).join('\n');
    const blocked = result.fixedSends > 0 || result.blockedLog.some(function (line) { return /IC_REQ_BLOCKED/.test(line); });
    const missing = (row.mustContain || []).filter(function (bit) { return text.indexOf(bit) < 0; });
    if (blocked || missing.length) return 'overblock';
    if (!publicBodies.length) return 'held-other';
    return 'pass';
  }
  return 'unknown';
}

async function runProbe(row) {
  const beforeTrips = trips.length;
  const beforeHttp = httpRecords.length;
  let error = '';
  const secret = 'krmplqvbnx';
  try {
    if (row.probe === 'axios-post' || row.probe === 'axios-get') {
      const axios = require('axios');
      await axios({ method: row.probe === 'axios-get' ? 'get' : 'post', url: 'https://api.intercom.io/conversations/probe/reply', data: { body: secret } });
    } else if (row.probe === 'axios-create') {
      const axios = require('axios');
      const client = axios.create();
      await client.post('https://api.intercom.io/conversations/probe/reply', { body: secret });
    } else if (row.probe === 'axios-cache') {
      const resolved = require.resolve('axios');
      const cached = require.cache[resolved] && require.cache[resolved].exports;
      if (!cached) throw Object.assign(new Error('no axios cache entry'), { code: 'NO_CACHE' });
      if (typeof cached.post === 'function') await cached.post('https://api.intercom.io/conversations/probe/reply', { body: secret });
      else if (typeof cached === 'function') await cached({ method: 'post', url: 'https://api.intercom.io/conversations/probe/reply', data: { body: secret } });
      else throw Object.assign(new Error('cache exports not callable'), { code: 'NO_CACHE' });
    } else if (row.probe === 'http-request') {
      await new Promise(function (resolve, reject) {
        const req = http.request({ host: 'api.intercom.io', path: '/conversations/probe', method: 'POST' }, resolve);
        req.on('error', reject);
        req.end(secret);
      });
    } else if (row.probe === 'https-request') {
      await new Promise(function (resolve, reject) {
        const req = https.request({ host: 'api.intercom.io', path: '/conversations/probe', method: 'POST' }, resolve);
        req.on('error', reject);
        req.end(secret);
      });
    } else if (row.probe === 'node:http' || row.probe === 'node:https') {
      const mod = require(row.probe);
      await new Promise(function (resolve, reject) {
        const req = mod.request({ host: 'api.intercom.io', path: '/', method: 'GET' }, resolve);
        req.on('error', reject);
        req.end();
      });
    } else if (row.probe === 'fetch') {
      await fetch('https://api.intercom.io/conversations/probe', { method: 'POST', body: secret });
    } else if (row.probe === 'child-process') {
      cp.spawn('curl', ['https://api.intercom.io/conversations/probe']);
    } else if (row.probe === 'dynamic-require') {
      const name = 'ax' + 'ios';
      const dyn = require(name);
      await dyn.post('https://api.intercom.io/conversations/probe/reply', { body: secret });
    } else if (row.probe === 'getBuiltinModule') {
      const builtin = process.getBuiltinModule ? process.getBuiltinModule('https') : null;
      if (!builtin) throw Object.assign(new Error('getBuiltinModule unavailable'), { code: 'UNAVAILABLE' });
      await new Promise(function (resolve, reject) {
        const req = builtin.request({ host: 'api.intercom.io', method: 'GET', path: '/' }, resolve);
        req.on('error', reject);
        req.end();
      });
    } else if (row.probe === 'vm') {
      const vm = require('vm');
      vm.runInNewContext('require("https").request({host:"api.intercom.io",path:"/",method:"GET"}).end()');
    } else if (row.probe === 'function-constructor') {
      const fn = new Function('return require("https")');
      const mod = fn();
      await new Promise(function (resolve, reject) {
        const req = mod.request({ host: 'api.intercom.io', method: 'GET', path: '/' }, resolve);
        req.on('error', reject);
        req.end();
      });
    } else if (row.probe === 'control-snooze') {
      await callControl('/control/snooze', { conversation_id: 'snooze-1', minutes: 15 });
    } else if (row.probe === 'control-snooze-tainted') {
      await callControl('/control/intercom', {
        method: 'POST',
        path: '/conversations/snooze-2/reply',
        body: { message_type: 'snoozed', body: 'password krmplqvbnx', type: 'admin', admin_id: ARSAL_ID },
      });
    } else if (row.probe === 'control-assign') {
      await callControl('/control/assign', { conversation_id: 'assign-1', admin_id: JERRY_ID });
    } else if (row.probe === 'control-close') {
      await callControl('/control/close', { conversation_id: 'close-1' });
    } else if (row.probe === 'control-open') {
      await callControl('/control/open', { conversation_id: 'open-1' });
    } else if (row.probe === 'control-search') {
      await callControl('/control/intercom', {
        method: 'POST',
        path: '/conversations/search',
        body: { query: { field: 'open', operator: '=', value: true } },
      });
    } else if (row.probe === 'control-note-jerry') {
      await callControl('/control/note', {
        conversation_id: 'note-jerry',
        body: 'Please review. ' + sealed.constants.jerryHref,
      });
    } else if (row.probe === 'control-reply-clean') {
      await callControl('/control/reply', {
        conversation_id: 'reply-clean',
        body: 'The profit split is 80% and the price is $7.000.',
      });
    } else {
      throw new Error('unknown probe ' + row.probe);
    }
  } catch (err) {
    error = (err && (err.code || err.message)) || 'error';
  }
  const newTrips = trips.slice(beforeTrips);
  const newHttp = httpRecords.slice(beforeHttp);
  const unguardedBytes = newHttp.some(function (rec) {
    return rec.url && rec.url.indexOf('api.intercom.io') >= 0 && rec.exact.indexOf(secret) >= 0 && error.indexOf('UNGUARDED') < 0 && error.indexOf('NETWORK_TRIPWIRE') < 0 && error.indexOf('unauthorized') < 0;
  });
  const escaped = newTrips.length > 0;
  let status = 'pass';
  if (row.probe.indexOf('control-') === 0) {
    const needles = needlesOf(row);
    const blob = newHttp.map(function (r) { return r.exact; }).join('\n') + '\n' + logLines.slice(-20).join('\n');
    if (needles.length && byteCount(blob, needles) > 0) status = 'fail';
    else if (row.probe === 'control-reply-clean' || row.probe === 'control-note-jerry') {
      const text = newHttp.map(function (r) { return r.exact; }).join('\n');
      if (row.probe === 'control-reply-clean' && text.indexOf('80%') < 0 && text.indexOf(FIXED) >= 0) status = 'overblock';
      if (row.probe === 'control-note-jerry' && text.indexOf('h2z8cgfr') < 0) status = 'overblock';
    }
  } else if (escaped || unguardedBytes) status = 'bypass';
  else if (!error && newHttp.some(function (r) { return String(r.url).indexOf('api.intercom.io') >= 0; })) status = 'bypass';
  row.probeResult = status;
  logLines.push('log PROBE ' + row.probe + ' ' + status + ' ' + error);
}

function selectedCases() {
  const phase = process.env.R13_PHASE || 'batch';
  const groups = (process.env.R13_GROUPS || '').split(',').filter(Boolean);
  const id = process.env.R13_ID || '';
  return sealed.cases.filter(function (row) {
    if (id && row.id !== id) return false;
    if (phase === 'seed') return row.id === 'T001';
    if (phase === 'check') return row.id === 'T001';
    if (phase === 'hang') return row.id === 'R001';
    if (phase === 'resume') return row.id === 'R001';
    if (groups.length && groups.indexOf(row.group) < 0) return false;
    if (phase === 'batch' && (row.id === 'T001' || row.id === 'R001')) return false;
    return true;
  });
}

async function main() {
  const rows = selectedCases();
  const results = [];
  process.stderr.write('worker cases ' + rows.length + ' phase ' + (process.env.R13_PHASE || 'batch') + '\n');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i === 0 || (i + 1) % 25 === 0) process.stderr.write('progress ' + (i + 1) + '/' + rows.length + ' ' + row.id + '\n');
    const result = await runCase(row);
    results.push({
      id: result.id,
      group: result.group,
      shape: result.shape,
      channel: result.channel,
      lang: result.lang,
      expect: result.expect,
      verdict: result.verdict,
      secretBytes: result.secretBytes,
      sample: result.sample,
      httpCount: result.httpCount,
      writes: result.writes,
      exactTemplateSends: result.exactTemplateSends,
      unauthorizedTemplate: result.unauthorizedTemplate,
      fixedSends: result.fixedSends,
      modelRequests: result.modelRequests,
      trips: result.trips,
      blockedLog: result.blockedLog,
      lastEscalateProblem: result.lastEscalateProblem,
      deferred: result.deferred,
      borderline: result.borderline,
      memoryMessages: result.memoryMessages,
      probe: row.probe || '',
    });
    if (!result.keepState && process.env.R13_PHASE !== 'seed') resetIsolation();
  }
  const out = {
    phase: process.env.R13_PHASE || 'batch',
    trips: trips,
    results: results,
  };
  const dest = process.env.R13_OUT;
  if (dest) fs.writeFileSync(dest, JSON.stringify(out));
  else process.stdout.write(JSON.stringify(out));
  process.stderr.write('worker done ' + results.length + '\n');
}

main().catch(function (err) {
  process.stderr.write('WORKER_FAIL ' + (err && err.stack || err) + '\n');
  process.exit(5);
});
