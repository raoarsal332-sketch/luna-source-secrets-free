'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { PassThrough } = require('stream');
const { spawn } = require('child_process');

const PATCHED = '/tmp/cg-r14/luna-current/01_runtime';
const BASE = '/tmp/cg-base-luna/01_runtime';
const CASES_PATH = path.join(__dirname, '..', 'SEALED_CASES.json');
const RESULT_PATH = process.env.RESULT_PATH || '/tmp/cg-r14-review-results.json';
const AUTH_HASH = 'bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d';
const AUTH_LEN = 77282;

function log(line) {
  fs.writeSync(2, line + '\n');
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function loadCases() {
  const doc = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'));
  const fileHash = sha256(fs.readFileSync(CASES_PATH));
  const sealed = fs.readFileSync(path.join(__dirname, '..', 'SEALED_CASES.sha256'), 'utf8').split(/\s+/)[0];
  if (fileHash !== sealed) throw new Error('sealed case hash mismatch');
  return doc;
}

function prepareState(dir, promptSrc) {
  fs.mkdirSync(dir, { recursive: true });
  const control = {
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: ['Synthetic Client'],
    testAllowConversationIds: [],
    config: { model: 'stub-model', welcomeEnabled: true, repliesEnabled: true },
  };
  fs.writeFileSync(path.join(dir, 'control.json'), JSON.stringify(control));
  fs.writeFileSync(path.join(dir, 'tickets.json'), '{}');
  fs.writeFileSync(path.join(dir, 'ops.json'), '{}');
  if (!fs.existsSync(path.join(dir, 'prompt.txt'))) fs.copyFileSync(promptSrc, path.join(dir, 'prompt.txt'));
  return {
    control: path.join(dir, 'control.json'),
    tickets: path.join(dir, 'tickets.json'),
    ops: path.join(dir, 'ops.json'),
    prompt: path.join(dir, 'prompt.txt'),
    mention: path.join(dir, 'mention.json'),
  };
}

function applyEnv(runtime, files) {
  process.env.LUNA_CONTROL_STATE_FILE = files.control;
  process.env.TICKET_STATE_FILE = files.tickets;
  process.env.LUNA_OP_STORE_FILE = files.ops;
  process.env.LUNA_PROMPT_FILE = files.prompt;
  process.env.FUNDEDELITE_FAQ_PATH = path.join(runtime, 'fundedelite-faqs.md');
  process.env.MENTION_ROTATE_FILE = files.mention;
  process.env.IMAGE_GUARD_STATE_FILE = path.join(path.dirname(files.tickets), 'image-guard.json');
  process.env.OPENAI_API_KEY = 'sk-synthetic-review-not-a-real-key';
  process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-intercom-token-not-real';
  process.env.CONTROL_SECRET = 'synthetic-control-secret';
  process.env.LUNA_PRESEND_MODE = 'observe';
  process.env.MAINTAINER_ENABLED = 'false';
  process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';
}

function startModelServer() {
  const session = { mode: 'literal', text: 'Thanks, a teammate will review the request.', calls: [] };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      session.calls.push(raw);
      if (session.mode === 'throw') {
        res.statusCode = 500;
        res.end(raw);
        return;
      }
      let content = session.text || '';
      if (session.mode === 'echo_prompt_tail') content = raw.slice(-1500);
      const body = JSON.stringify({
        id: 'chatcmpl-synthetic',
        object: 'chat.completion',
        created: 1700000000,
        model: 'stub-model',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      });
      res.setHeader('content-type', 'application/json');
      res.end(body);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      process.env.OPENAI_BASE_URL = 'http://127.0.0.1:' + port + '/v1';
      resolve({ server, session, port });
    });
  });
}

function installOpenAIStub(session) {
  const Module = require('module');
  const previous = Module._load;
  Module._load = function (request, parent, isMain) {
    const loaded = previous.apply(this, arguments);
    if (request === 'openai' && loaded && !loaded.__cgReviewStub && typeof loaded.default === 'function') {
      const Real = loaded.default;
      function Wrapped(opts) {
        const next = Object.assign({}, opts || {}, {
          fetch: async function (url, init) {
            const body = init && init.body != null ? String(init.body) : '';
            session.calls.push(body);
            if (session.mode === 'throw') return new Response(body, { status: 500 });
            let content = session.text || '';
            if (session.mode === 'echo_prompt_tail') content = body.slice(-1500);
            const payload = JSON.stringify({
              id: 'chatcmpl-synthetic',
              object: 'chat.completion',
              created: 1700000000,
              model: 'stub-model',
              choices: [{ index: 0, message: { role: 'assistant', content: content }, finish_reason: 'stop' }],
            });
            return new Response(payload, { status: 200, headers: { 'content-type': 'application/json' } });
          },
        });
        return new Real(next);
      }
      Object.defineProperty(loaded, 'default', { configurable: true, enumerable: true, writable: true, value: Wrapped });
      loaded.__cgReviewStub = true;
    }
    return loaded;
  };
}

function installRecorder(runtime) {
  const rec = { intercom: [], memory: [], logs: [], authorized: [], faults: [] };
  const axios = require(path.join(runtime, 'node_modules/axios'));
  const session = { conv: null, fault: '', crashOnWrite: false };
  axios.defaults.adapter = async function adapter(config) {
    const method = String(config.method || 'get').toLowerCase();
    const url = String(config.url || '');
    const data = config.data;
    const entry = { method, url, data, at: Date.now() };
    rec.intercom.push(entry);
    if (session.crashOnWrite && method !== 'get' && method !== 'head') {
      const err = new Error('crash before send');
      err.code = 'ECONNRESET';
      throw err;
    }
    if (session.fault === 'throw_read' && method === 'get' && url.indexOf('/conversations/') >= 0 && url.indexOf('/reply') < 0) {
      const err = new Error('read failed');
      err.code = 'ERR_READ';
      rec.faults.push('ERR_READ');
      throw err;
    }
    if (session.fault === 'timeout_read' && method === 'get' && url.indexOf('/conversations/') >= 0 && url.indexOf('/reply') < 0) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const err = new Error('timeout of 20000ms exceeded');
          err.code = 'ECONNABORTED';
          reject(err);
        }, 20000);
        if (session.cancelTimeout) session.cancelTimeout.push(() => clearTimeout(timer));
      });
    }
    if (method === 'get' && url.indexOf('/admins') >= 0) {
      return { data: { type: 'admin.list', admins: [{ id: '8053416', name: 'Jerry', type: 'admin' }, { id: '10118526', name: 'Arsal', type: 'admin' }] }, status: 200, statusText: 'OK', headers: {}, config };
    }
    if (method === 'get' && url.indexOf('/conversations/') >= 0 && url.indexOf('/reply') < 0) {
      return { data: session.conv || { id: 'missing', type: 'conversation' }, status: 200, statusText: 'OK', headers: {}, config };
    }
    if (url.indexOf('faq.fundedelite.com') >= 0) {
      return { data: '', status: 404, statusText: 'Not Found', headers: {}, config };
    }
    return { data: { id: 'rec', type: 'conversation' }, status: 200, statusText: 'OK', headers: {}, config };
  };
  const fsOrig = {
    writeFileSync: fs.writeFileSync.bind(fs),
    appendFileSync: fs.appendFileSync.bind(fs),
  };
  fs.writeFileSync = function (file, data) {
    try {
      rec.memory.push({ op: 'write', file: String(file), text: Buffer.isBuffer(data) ? data.toString('utf8') : String(data) });
    } catch (_) { /* record must not break the write */ }
    return fsOrig.writeFileSync.apply(fs, arguments);
  };
  fs.appendFileSync = function (file, data) {
    try {
      rec.memory.push({ op: 'append', file: String(file), text: Buffer.isBuffer(data) ? data.toString('utf8') : String(data) });
    } catch (_) { /* record must not break the write */ }
    return fsOrig.appendFileSync.apply(fs, arguments);
  };
  for (const name of ['log', 'error', 'warn', 'info', 'debug']) {
    const orig = console[name].bind(console);
    console[name] = function () {
      const parts = [];
      for (let i = 0; i < arguments.length; i++) {
        const value = arguments[i];
        try { parts.push(typeof value === 'string' ? value : JSON.stringify(value)); }
        catch (_) { parts.push(String(value)); }
      }
      rec.logs.push(name + ' ' + parts.join(' '));
      return orig.apply(null, arguments);
    };
  }
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = function (chunk, enc, cb) {
    try { rec.logs.push('stdout ' + (Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk))); } catch (_) {}
    return stdoutWrite(chunk, enc, cb);
  };
  return { rec, session, axios };
}

function invoke(app, method, url, body) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body || {}));
    const reqSocket = new PassThrough();
    const resSocket = new PassThrough();
    const req = new http.IncomingMessage(reqSocket);
    req.method = method;
    req.url = url;
    req.originalUrl = url;
    req.httpVersion = '1.1';
    req.headers = {
      'content-type': 'application/json',
      'content-length': String(payload.length),
      'x-control-secret': process.env.CONTROL_SECRET,
    };
    const res = new http.ServerResponse(req);
    res.assignSocket(resSocket);
    const chunks = [];
    resSocket.write = (chunk, enc, cb) => {
      if (chunk) chunks.push(Buffer.from(chunk));
      if (typeof enc === 'function') enc();
      else if (typeof cb === 'function') cb();
      return true;
    };
    const timer = setTimeout(() => reject(new Error('control invoke timeout')), 12000);
    res.on('finish', () => {
      clearTimeout(timer);
      const raw = Buffer.concat(chunks).toString('utf8');
      const parts = raw.split('\r\n\r\n');
      resolve({ status: res.statusCode, raw, body: parts.slice(1).join('\r\n\r\n') });
    });
    app.handle(req, res, (err) => {
      if (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
    req.push(payload);
    req.push(null);
  });
}

function htmlOrText(turn) {
  if (turn.html) return turn.html;
  return turn.text || '';
}

function buildConversation(c, users, convId) {
  const created = 1700003000;
  const parts = [];
  users.forEach((turn, i) => {
    parts.push({
      id: convId + '-u' + i,
      part_type: 'comment',
      body: htmlOrText(turn),
      created_at: created + i,
      author: { type: 'user', id: 'user-synthetic', name: 'Synthetic Client', email: 'synthetic.client@example.com' },
    });
  });
  if (c.note_text) {
    parts.push({
      id: convId + '-note',
      part_type: 'note',
      body: c.note_text,
      created_at: created + 20,
      author: { type: 'admin', id: String(c.author_id || '8053416'), name: 'Jerry' },
    });
  }
  const first = users[0] ? htmlOrText(users[0]) : (c.note_text || 'hello');
  return {
    id: convId,
    type: 'conversation',
    open: true,
    state: 'open',
    team_assignee_id: 0,
    admin_assignee_id: null,
    source: {
      id: convId + '-src',
      body: first,
      created_at: created,
      author: { type: 'user', id: 'user-synthetic', name: 'Synthetic Client', email: 'synthetic.client@example.com' },
    },
    contacts: { contacts: [{ id: 'user-synthetic', name: 'Synthetic Client', email: 'synthetic.client@example.com' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function webhookBody(topic, conv) {
  return { topic: topic || 'conversation.user.replied', data: { item: conv } };
}

function modelFromTurns(turns) {
  let model = { mode: 'safe', text: 'Thanks, a teammate will review the request.' };
  for (const turn of turns || []) if (turn.role === 'model') model = turn;
  return model;
}

function usersBefore(turns, stopRoles) {
  const users = [];
  for (const turn of turns || []) {
    if (stopRoles.indexOf(turn.role) >= 0) break;
    if (turn.role === 'user') users.push(turn);
  }
  return users;
}

function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scanNeedles(text, exact, boundary) {
  const hits = [];
  const src = String(text || '');
  for (let i = 0; i < exact.length; i++) {
    if (exact[i] && src.indexOf(exact[i]) >= 0) hits.push('e' + i);
  }
  for (let i = 0; i < boundary.length; i++) {
    const n = boundary[i];
    if (!n) continue;
    const re = new RegExp('(?:^|[^0-9A-Za-z])' + escapeReg(n) + '(?:[^0-9A-Za-z]|$)');
    if (re.test(src)) hits.push('b' + i);
  }
  return hits;
}

function rawWindows(raw) {
  const s = String(raw || '');
  const out = [];
  if (s.length < 12) return out;
  const step = s.length > 4000 ? 24 : 1;
  const width = s.length >= 24 ? 24 : s.length;
  for (let i = 0; i + width <= s.length; i += step) {
    const slice = s.slice(i, i + width);
    if (/^(.)\1+$/.test(slice)) continue;
    out.push(slice);
  }
  return out;
}

function parsePayload(data) {
  if (typeof data !== 'string') return data;
  try { return JSON.parse(data); } catch (_) { return data; }
}

function intercomText(records, template) {
  const parts = [];
  const bodies = [];
  for (const rec of records) {
    parts.push(rec.method + ' ' + rec.url);
    const data = parsePayload(rec.data);
    if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      for (let i = 0; i < keys.length; i++) {
        const value = data[keys[i]];
        if (typeof value !== 'string') continue;
        if (keys[i] === 'body') {
          bodies.push(value);
          if (value !== template) parts.push(value);
        } else parts.push(value);
      }
    } else if (typeof data === 'string' && data !== template) parts.push(data);
  }
  return { text: parts.join('\n'), bodies };
}

function visibleModel(calls, prompt) {
  const kept = [];
  const list = calls || [];
  for (let n = 0; n < list.length; n++) {
    const raw = String(list[n] || '');
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
    const messages = parsed && parsed.messages;
    if (!messages) {
      kept.push(stripAuthorized(raw, prompt));
      continue;
    }
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg) continue;
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
      if (String(msg.role || '') === 'system') {
        const token = content.slice(0, AUTH_LEN);
        if (sha256(token) === AUTH_HASH || sha256(content) === AUTH_HASH) continue;
      }
      kept.push(content);
    }
  }
  return kept.join('\n');
}

function stripAuthorized(text, prompt) {
  let src = String(text || '');
  const token = prompt.slice(0, AUTH_LEN);
  if (sha256(token) !== AUTH_HASH) return src;
  let guard = 0;
  while (src.indexOf(token) >= 0 && guard < 5) {
    src = src.split(token).join('');
    guard += 1;
  }
  return src;
}

async function runWebhook(engine, bag, c, conv, modelSession, opts) {
  modelSession.mode = (opts.model && opts.model.mode) || 'literal';
  modelSession.text = (opts.model && opts.model.text) || 'Thanks, a teammate will review the request.';
  modelSession.calls.length = 0;
  bag.session.conv = conv;
  bag.session.fault = opts.fault || '';
  bag.session.crashOnWrite = !!opts.crashOnWrite;
  const req = {
    body: webhookBody(opts.topic, conv),
    headers: {},
    get() { return ''; },
  };
  req.rawBody = Buffer.from(JSON.stringify(req.body));
  const res = {
    statusCode: 200,
    sendStatus(code) { this.statusCode = code; return this; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    send(obj) { this.body = obj; return this; },
    end() { return this; },
  };
  await engine.handleWebhook(req, res);
  return res.statusCode;
}

function summarize(c, bag, modelSession, prompt, presend, convId, controlRaw) {
  const inter = intercomText(bag.rec.intercom, bag.template);
  let memory = bag.rec.memory.map((m) => m.text).join('\n');
  try {
    if (presend && presend.snapshot) memory += '\n' + JSON.stringify(presend.snapshot(convId));
  } catch (_) { /* snapshot is best-effort */ }
  try { memory += '\n' + fs.readFileSync(process.env.TICKET_STATE_FILE, 'utf8'); } catch (_) {}
  const logs = bag.rec.logs.join('\n');
  const modelRaw = visibleModel(modelSession.calls, prompt);
  const channels = {
    intercom_write: inter.text,
    model_request: modelRaw,
    memory_write: memory,
    log_line: logs + (controlRaw ? '\n' + controlRaw : ''),
  };
  const exact = c.needles_exact || [];
  const boundary = c.needles_boundary || [];
  const leaks = [];
  for (const name of Object.keys(channels)) {
    for (const hit of scanNeedles(channels[name], exact, boundary)) {
      leaks.push({ channel: name, hit });
    }
  }
  const template = bag.template;
  const password = bag.password;
  const catalog = bag.catalog || [];
  for (const name of Object.keys(channels)) {
    for (let i = 0; i < catalog.length; i++) {
      const item = catalog[i];
      if (!item || !item.needle) continue;
      const hit = item.boundary
        ? scanNeedles(channels[name], [], [item.needle])
        : scanNeedles(channels[name], [item.needle], []);
      if (hit.length) leaks.push({ channel: name, hit: 'c' + i });
    }
  }
  const exactSend = inter.bodies.some((b) => b === template);
  const passwordLeaks = [];
  if (password) {
    const interRest = channels.intercom_write.split(template).join('');
    if (interRest.indexOf(password) >= 0) passwordLeaks.push('intercom_write');
    if (stripAuthorized(channels.model_request, prompt).indexOf(password) >= 0) passwordLeaks.push('model_request');
    if (channels.memory_write.indexOf(password) >= 0) passwordLeaks.push('memory_write');
    if (channels.log_line.indexOf(password) >= 0) passwordLeaks.push('log_line');
  }
  let rawMiss = false;
  if (c.bucket === 'failclosed') {
    const raws = [c.raw_text, c.raw_text_head, c.raw_text_tail].filter(Boolean);
    if (c.fault === 'oversize') raws.push(c._oversize || '');
    const blob = channels.log_line + '\n' + channels.intercom_write;
    for (const raw of raws) {
      for (const slice of rawWindows(raw)) {
        if (slice && blob.indexOf(slice) >= 0) { rawMiss = true; break; }
      }
      if (rawMiss) break;
    }
  }
  if (process.env.DEBUG_MEM === '1') {
    const files = bag.rec.memory.map((m) => {
      const hits = [];
      const text = m.text || '';
      for (let i = 0; i < catalog.length; i++) {
        const item = catalog[i];
        if (item && item.needle && text.indexOf(item.needle) >= 0) hits.push(i);
      }
      return { op: m.op, file: path.basename(String(m.file || '')), len: text.length, hits: hits };
    });
    fs.writeFileSync('/tmp/cg-r14-mem-' + c.id + '.json', JSON.stringify(files));
  }
  const marker = c.marker || '';
  return {
    id: c.id,
    bucket: c.bucket,
    lang: c.lang || '',
    class: c.class || c.mode || c.fault || c.kind || '',
    leaks,
    password_leaks: passwordLeaks,
    template_exact: exactSend,
    marker: marker ? channels.intercom_write.indexOf(marker) >= 0 : false,
    raw_miss: rawMiss,
    writes: bag.rec.intercom.length,
    model_calls: modelSession.calls.length,
    log_count: bag.rec.logs.length,
    body_len: inter.bodies.map((b) => b.length),
    body_sha256: inter.bodies.map((b) => sha256(b)),
    authorized: (bag.rec.authorized || []).map((a) => ({ len: a.len, sha256: a.sha, send: a.send, reason: a.reason || '' })),
    faults: (bag.rec.faults || []).slice(0, 8),
  };
}

function resetCase(bag, presend, guard) {
  bag.rec.intercom.length = 0;
  bag.rec.memory.length = 0;
  bag.rec.logs.length = 0;
  if (bag.rec.authorized) bag.rec.authorized.length = 0;
  if (bag.rec.faults) bag.rec.faults.length = 0;
  if (bag.model && bag.model.session) bag.model.session.calls.length = 0;
  try { fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}'); } catch (_) {}
  try { fs.writeFileSync(process.env.LUNA_OP_STORE_FILE, '{}'); } catch (_) {}
  bag.rec.memory.length = 0;
  if (guard && guard.resetStore) guard.resetStore();
  if (presend && presend.resetAll) presend.resetAll();
  if (bag.imageGuard && bag.imageGuard.resetAll) bag.imageGuard.resetAll();
  try { fs.writeFileSync(process.env.IMAGE_GUARD_STATE_FILE, '{}'); } catch (_) {}
  bag.rec.memory.length = 0;
}

async function executeSimple(engine, bag, presend, guard, c, prompt) {
  bag.imageGuard = bag.imageGuard || null;
  const convId = '9' + String(c._n).padStart(8, '0');
  let users = (c.turns || []).filter((t) => t.role === 'user');
  if (c.fault === 'oversize') {
    const text = c.raw_text_head + 'A'.repeat(c.oversize_pad || 280000) + c.raw_text_tail;
    c._oversize = text;
    users = [{ role: 'user', text }];
  }
  const model = modelFromTurns(c.turns);
  if (model.mode === 'safe') model.text = 'Thanks, a teammate will review the request.';
  const topic = c.topic || 'conversation.user.replied';
  const conv = buildConversation(c, users, convId);
  resetCase(bag, presend, guard);
  let controlRaw = '';
  let crashed = false;
  try {
    if (c.bucket === 'control') {
      bag.session.conv = conv;
      bag.session.fault = '';
      const response = await invoke(engine.app, 'POST', c.path, c.request_body);
      controlRaw = response.raw || response.body || '';
    } else if (c.mode === 'duplicate_delivery' || (c.turns || []).some((t) => t.role === 'duplicate')) {
      await runWebhook(engine, bag, c, conv, bag.model.session, { model, topic, fault: c.fault });
      await runWebhook(engine, bag, c, conv, bag.model.session, { model, topic, fault: c.fault });
    } else {
      await runWebhook(engine, bag, c, conv, bag.model.session, { model, topic, fault: c.fault });
    }
  } catch (e) {
    crashed = true;
    bag.rec.logs.push('uncaught ' + (e && e.name) + ' ' + (e && e.message) + '\n' + (e && e.stack));
  }
  const summary = summarize(c, bag, bag.model.session, prompt, presend, convId, controlRaw);
  summary.uncaught = crashed;
  return summary;
}

function watchAuthorized(guard, rec) {
  if (!guard || guard.__cgReviewWatch || typeof guard.dispatchAuthorized !== 'function') return;
  const orig = guard.dispatchAuthorized;
  guard.dispatchAuthorized = function (decision, send) {
    const dataBody = decision && decision.data && typeof decision.data.body === 'string' ? decision.data.body : '';
    const body = typeof (decision && decision.body) === 'string' ? decision.body : '';
    const exact = dataBody || body;
    rec.authorized.push({
      len: exact.length,
      sha: sha256(exact),
      send: !!(decision && decision.send),
      reason: decision && decision.reason ? String(decision.reason).slice(0, 40) : '',
    });
    return orig.call(guard, decision, send);
  };
  guard.__cgReviewWatch = true;
}

async function boot(runtime, stateDir) {
  const files = prepareState(stateDir, path.join(runtime, 'system-prompt.txt'));
  applyEnv(runtime, files);
  process.chdir(stateDir);
  const model = await startModelServer();
  const bag = installRecorder(runtime);
  bag.model = model;
  installOpenAIStub(model.session);
  const engine = require(path.join(runtime, 'index.js'));
  let guard = null;
  const guardPath = fs.existsSync(path.join(runtime, 'credentialGuardR14.js'))
    ? path.join(runtime, 'credentialGuardR14.js')
    : '/tmp/cg-r14/luna-current/01_runtime/credentialGuardR14.js';
  guard = require(guardPath);
  watchAuthorized(guard, bag.rec);
  const presend = require(path.join(runtime, 'statePresend/statePresend'));
  let imageGuard = null;
  try { imageGuard = require(path.join(runtime, 'imageAskGuard')); } catch (_) { imageGuard = null; }
  bag.template = guard.SPREAD_TEST_REPLY;
  bag.password = guard.TEMPLATE_PASSWORD;
  if (bag.template.length !== 213) throw new Error('template length ' + bag.template.length);
  return { engine, guard, presend, imageGuard, bag, prompt: fs.readFileSync(files.prompt, 'utf8'), files };
}

async function phaseMain(doc) {
  const id = process.env.CASE_ID;
  const phase = process.env.PHASE || '1';
  const c = doc.cases.find((item) => item.id === id);
  if (!c) throw new Error('missing case ' + id);
  c._n = 1;
  const ctx = await boot(PATCHED, process.env.STATE_DIR);
  ctx.bag.catalog = doc.catalog_needles;
  ctx.bag.imageGuard = ctx.imageGuard;
  const turns = c.turns || [];
  const restartAt = turns.findIndex((t) => t.role === 'restart' || t.role === 'retry' || t.role === 'crash_before_send' || t.role === 'defer');
  const before = turns.slice(0, Math.max(0, restartAt));
  const after = turns.slice(restartAt + 1);
  const useBefore = phase === '1';
  const selected = useBefore ? before : after.filter((t) => t.role !== 'replay' && t.role !== 'restart');
  const users = selected.filter((t) => t.role === 'user');
  const model = modelFromTurns(selected.length ? selected : before);
  if (c.fault === 'oversize') {
    /* phases do not use oversize */
  }
  const convId = '8' + String(id.replace(/\D/g, '') || '1').padStart(8, '0');
  const conv = buildConversation(c, users.length ? users : before.filter((t) => t.role === 'user'), convId);
  if (phase === '1') resetCase(ctx.bag, ctx.presend, ctx.guard);
  ctx.bag.rec.intercom.length = 0;
  ctx.bag.rec.memory.length = 0;
  ctx.bag.rec.logs.length = 0;
  if (ctx.bag.rec.authorized) ctx.bag.rec.authorized.length = 0;
  if (ctx.bag.rec.faults) ctx.bag.rec.faults.length = 0;
  const crash = phase === '1' && (c.mode === 'restart_mid_op' || turns.some((t) => t.role === 'crash_before_send'));
  const defer = phase === '1' && (c.mode === 'deferred_replay' || turns.some((t) => t.role === 'defer'));
  try {
    if (defer) {
      fs.writeFileSync(path.join(process.env.STATE_DIR, 'deferred.json'), JSON.stringify(webhookBody('conversation.user.replied', conv)));
    } else if (phase === '2' && c.mode === 'deferred_replay') {
      const saved = JSON.parse(fs.readFileSync(path.join(process.env.STATE_DIR, 'deferred.json'), 'utf8'));
      ctx.bag.session.conv = saved.data.item;
      await runWebhook(ctx.engine, ctx.bag, c, saved.data.item, ctx.bag.model.session, { model, topic: saved.topic });
    } else if (phase === '2' && (c.mode === 'restart_mid_op')) {
      const replayUsers = before.filter((t) => t.role === 'user');
      const replayConv = buildConversation(c, replayUsers, convId);
      const replayModel = modelFromTurns(before);
      await runWebhook(ctx.engine, ctx.bag, c, replayConv, ctx.bag.model.session, { model: replayModel, topic: 'conversation.user.replied' });
    } else {
      await runWebhook(ctx.engine, ctx.bag, c, conv, ctx.bag.model.session, { model, topic: c.topic || 'conversation.user.replied', fault: c.fault, crashOnWrite: crash });
    }
  } catch (e) {
    ctx.bag.rec.logs.push('uncaught ' + (e && e.message));
  }
  const summary = summarize(c, ctx.bag, ctx.bag.model.session, ctx.prompt, ctx.presend, convId, '');
  summary.phase = phase;
  fs.writeFileSync(path.join(process.env.STATE_DIR, 'phase-' + phase + '.json'), JSON.stringify(summary));
  process.exit(0);
}

function runPhaseProcess(caseId, phase, stateDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename], {
      env: Object.assign({}, process.env, {
        REVIEW_MODE: 'phase',
        CASE_ID: caseId,
        PHASE: phase,
        STATE_DIR: stateDir,
      }),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (b) => { err += b.toString(); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('phase timeout ' + caseId)); }, 90000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const file = path.join(stateDir, 'phase-' + phase + '.json');
      if (!fs.existsSync(file)) return reject(new Error('phase missing ' + caseId + ' ' + phase + ' ' + err.slice(0, 300)));
      resolve(JSON.parse(fs.readFileSync(file, 'utf8')));
    });
  });
}

function mergePhase(a, b) {
  return {
    id: a.id,
    bucket: a.bucket,
    lang: a.lang,
    class: a.class,
    leaks: (a.leaks || []).concat(b.leaks || []),
    password_leaks: Array.from(new Set((a.password_leaks || []).concat(b.password_leaks || []))),
    template_exact: !!(a.template_exact || b.template_exact),
    marker: !!(a.marker || b.marker),
    raw_miss: !!(a.raw_miss || b.raw_miss),
    writes: (a.writes || 0) + (b.writes || 0),
    model_calls: (a.model_calls || 0) + (b.model_calls || 0),
    log_count: (a.log_count || 0) + (b.log_count || 0),
    phased: true,
  };
}

function needsPhase(c) {
  return c.bucket === 'taint' || c.mode === 'restart_mid_op' || c.mode === 'deferred_replay';
}

async function main() {
  const doc = loadCases();
  if (process.env.REVIEW_MODE === 'phase') return phaseMain(doc);
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
  const canary = process.env.CANARY === '1';
  const phaseResults = new Map();
  if (!canary) {
    for (const c of doc.cases) {
      if (!needsPhase(c)) continue;
      if (only && !only.has(c.id)) continue;
      const dir = path.join('/tmp/cg-r14-phases', c.id);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      try {
        const p1 = await runPhaseProcess(c.id, '1', dir);
        const p2 = await runPhaseProcess(c.id, '2', dir);
        phaseResults.set(c.id, mergePhase(p1, p2));
      } catch (e) {
        phaseResults.set(c.id, { id: c.id, bucket: c.bucket, harness_error: true, leaks: [], password_leaks: [], template_exact: false, marker: false, raw_miss: false, detail: String(e && e.message || e).slice(0, 180) });
      }
      log('phase ' + c.id);
    }
  }
  const ctx = await boot(canary ? BASE : PATCHED, canary ? '/tmp/cg-r14-canary-state' : '/tmp/cg-r14-run');
  ctx.bag.catalog = doc.catalog_needles;
  ctx.bag.imageGuard = ctx.imageGuard;
  log('engine booted template=' + ctx.bag.template.length + (canary ? ' canary' : ''));
  const results = [];
  let n = 0;
  for (const c of doc.cases) {
    if (c.bucket === 'bypass') continue;
    if (canary && c.bucket !== 'ordinary') continue;
    if (only && !only.has(c.id)) continue;
    n += 1;
    c._n = n;
    const started = Date.now();
    let summary;
    try {
      if (needsPhase(c)) {
        summary = phaseResults.get(c.id);
      } else {
        summary = await executeSimple(ctx.engine, ctx.bag, ctx.presend, ctx.guard, c, ctx.prompt);
      }
    } catch (e) {
      summary = { id: c.id, bucket: c.bucket, harness_error: true, leaks: [], password_leaks: [], template_exact: false, marker: false, raw_miss: false, detail: String(e && e.message || e).slice(0, 180) };
    }
    summary.ms = Date.now() - started;
    results.push(summary);
    if (n % 25 === 0) log('progress ' + n + ' ' + c.id + ' ' + summary.ms + 'ms leaks=' + ((summary.leaks && summary.leaks.length) || 0));
  }
  const bypass = fs.existsSync('/tmp/cg-r14-bypass.json') ? JSON.parse(fs.readFileSync('/tmp/cg-r14-bypass.json', 'utf8')) : { bypasses: null, results: [] };
  const report = buildReport(doc, results, bypass);
  fs.writeFileSync(RESULT_PATH, JSON.stringify(report, null, 2));
  log('WROTE ' + RESULT_PATH + ' verdict=' + report.verdict);
  try { ctx.bag.model.server.close(); } catch (_) { /* already closed */ }
  process.exit(report.verdict === 'PASS' ? 0 : 2);
}

function buildReport(doc, results, bypass) {
  const byBucket = {};
  let leakCases = 0;
  let leakEvents = 0;
  let passwordEvents = 0;
  let unauth = 0;
  let eligibleMiss = 0;
  let eligible = 0;
  let failMiss = 0;
  let ordinary = 0;
  let overblock = 0;
  const borderline = [];
  const leakIds = [];
  const overIds = [];
  const missIds = [];
  const unauthIds = [];
  const failIds = [];
  const passwordIds = [];
  const harnessErrors = [];
  for (const r of results) {
    byBucket[r.bucket] = (byBucket[r.bucket] || 0) + 1;
    if (r.harness_error) harnessErrors.push({ id: r.id, detail: r.detail });
    const leaked = (r.leaks && r.leaks.length) || (r.password_leaks && r.password_leaks.length);
    if (r.leaks && r.leaks.length) {
      leakCases += 1;
      leakEvents += r.leaks.length;
      leakIds.push(r.id);
    }
    if (r.password_leaks && r.password_leaks.length) {
      passwordEvents += 1;
      passwordIds.push({ id: r.id, channels: r.password_leaks });
    }
    if (r.bucket === 'template_eligible') {
      eligible += 1;
      if (!r.template_exact) {
        eligibleMiss += 1;
        missIds.push(r.id);
      }
    } else if (r.bucket === 'template_borderline') {
      borderline.push({ id: r.id, template_exact: !!r.template_exact, marker: !!r.marker });
    } else if (r.template_exact) {
      unauth += 1;
      unauthIds.push(r.id);
    }
    if (r.bucket === 'ordinary') {
      ordinary += 1;
      if (!r.marker) {
        overblock += 1;
        overIds.push(r.id);
      }
    }
    if (r.bucket === 'failclosed' && (r.raw_miss || (r.leaks && r.leaks.length) || (r.password_leaks && r.password_leaks.length))) {
      failMiss += 1;
      failIds.push(r.id);
    }
  }
  const overRate = ordinary ? overblock / ordinary : 1;
  const bypasses = bypass.bypasses == null ? -1 : bypass.bypasses;
  const pass = leakEvents === 0 && passwordEvents === 0 && bypasses === 0 && unauth === 0 && failMiss === 0 && eligibleMiss === 0 && overRate <= 0.01 && ordinary >= 220 && harnessErrors.length === 0;
  return {
    verdict: pass ? 'PASS' : 'FAIL',
    frozen_commit: doc.seal.frozen_commit,
    case_sha256: fs.readFileSync(path.join(__dirname, '..', 'SEALED_CASES.sha256'), 'utf8').trim(),
    counts: doc.seal.counts,
    executed: byBucket,
    leaks: { cases: leakCases, events: leakEvents, ids: leakIds },
    template_password_outside_exact: { cases: passwordEvents, ids: passwordIds },
    bypasses: { count: bypasses, paths: (bypass.results || []).filter((r) => r.bypass).map((r) => ({ id: r.id, vector: r.vector, script: r.script })) },
    bypass_blocked: (bypass.results || []).filter((r) => !r.bypass).map((r) => r.id + ':' + r.vector),
    unauthorized_template_sends: { count: unauth, ids: unauthIds },
    eligible_template: { eligible, misses: eligibleMiss, miss_ids: missIds },
    fail_closed_misses: { count: failMiss, ids: failIds },
    overblock: { ordinary, overblock, rate: overRate, ids: overIds },
    borderline,
    harness_errors: harnessErrors,
    results,
  };
}

main().catch((e) => {
  log('REVIEW_FAIL ' + (e && e.stack || e));
  process.exit(1);
});
