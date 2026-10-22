'use strict';

/**
 * One synthetic turn (or a whole in-process case) against the real handleWebhook.
 * Axios is replaced before index.js loads. Sockets, DNS, and fetch throw.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const SEAT = '424242';
const ARSAL = '10118526';
const ELITE = '8052954';

const hits = [];
function trip(name) {
  return function tripwire() {
    const err = new Error('NETWORK_TRIPWIRE ' + name);
    err.code = 'TRIPWIRE';
    hits.push({ name, stack: String(err.stack || '').split('\n').slice(0, 6).join('\n') });
    throw err;
  };
}

const net = require('net');
const http = require('http');
const https = require('https');
const dns = require('dns');
const tls = require('tls');
net.Socket.prototype.connect = trip('socket.connect');
if (net.connect) net.connect = trip('net.connect');
http.request = trip('http.request');
http.get = trip('http.get');
https.request = trip('https.request');
https.get = trip('https.get');
dns.lookup = trip('dns.lookup');
if (dns.promises) dns.promises.lookup = trip('dns.promises.lookup');
dns.resolve = trip('dns.resolve');
tls.connect = trip('tls.connect');
global.fetch = trip('fetch');

const logs = [];
console.log = (...args) => {
  logs.push(args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
};
console.error = console.log;
console.warn = console.log;

const { loadRemote, saveRemote, applyMutation } = require('./mutate');

let runtimeRoot = '';
let recording = [];
let remote = {};
let faultState = {};
let modelState = { mode: 'reply', body: 'The daily loss limit is five percent.', replies: [], canary: '' };
let spreadSecret = '';
let lockedSpread = '';

function jsonBytes(data) {
  if (data === undefined) return '';
  return JSON.stringify(data);
}

function adminList() {
  return {
    status: 200,
    data: {
      admins: [
        {
          id: SEAT,
          name: 'Synthetic Seat',
          email: 'seat-a@example.test',
          has_inbox_seat: true,
          away_mode_enabled: false,
          team_ids: [9629780],
        },
      ],
    },
  };
}

function handleAxios(config) {
  const cfg = config || {};
  const method = String(cfg.method || 'get').toLowerCase();
  const url = String(cfg.url || '');
  const data = cfg.data;
  const bytes = jsonBytes(data);
  const entry = {
    method,
    url,
    body: bytes,
    timeout: cfg.timeout || 0,
    hasAuth: !!(cfg.headers && (cfg.headers.Authorization || cfg.headers.authorization)),
  };
  recording.push(entry);
  const convMatch = url.match(/\/conversations\/([^/?#]+)(?:\/reply)?$/);
  const convId = convMatch ? decodeURIComponent(convMatch[1]) : '';
  if (url.indexOf('/admins') !== -1 && method === 'get') {
    entry.status = 200;
    return Promise.resolve(adminList());
  }
  if (method === 'get' && convId && url.indexOf('/reply') === -1) {
    const conv = remote[convId];
    if (!conv) {
      entry.status = 404;
      return Promise.resolve({ status: 404, data: { type: 'error.list', errors: [{ code: 'not_found' }] } });
    }
    entry.status = 200;
    return Promise.resolve({ status: 200, data: conv });
  }
  if (method === 'post' && url.indexOf('/reply') !== -1) {
    return Promise.resolve(handleReply(convId, data, entry));
  }
  entry.status = 0;
  hits.push({ name: 'unscripted-axios', stack: method + ' ' + url });
  const err = new Error('NETWORK_TRIPWIRE unscripted ' + method + ' ' + url);
  err.code = 'TRIPWIRE';
  return Promise.reject(err);
}

function faultFor(messageType) {
  const faults = faultState || {};
  if (messageType === 'note') return faults.note || 'ok';
  if (messageType === 'assignment') return faults.assign || 'ok';
  if (messageType === 'comment' || messageType === 'close' || messageType === 'open') return faults.comment || 'ok';
  return 'ok';
}

function bump(key) {
  faultState.counts = faultState.counts || {};
  faultState.counts[key] = (faultState.counts[key] || 0) + 1;
  return faultState.counts[key];
}

function applyRemote(convId, data) {
  const conv = remote[convId];
  if (!conv) return;
  const type = data && data.message_type;
  const now = Math.floor(Date.now() / 1000);
  if (type === 'note' || type === 'comment') {
    conv.conversation_parts.conversation_parts.push({
      id: type + '-' + now + '-' + conv.conversation_parts.conversation_parts.length,
      part_type: type === 'note' ? 'note' : 'comment',
      body: data.body || '',
      created_at: now,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    });
  } else if (type === 'assignment') {
    const id = data.assignee_id == null ? '' : String(data.assignee_id);
    conv.admin_assignee_id = id;
    conv.conversation_parts.conversation_parts.push({
      id: 'assign-' + now,
      part_type: 'assignment',
      body: '',
      created_at: now,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      assigned_to: { id },
    });
  } else if (type === 'close') {
    conv.state = 'closed';
  } else if (type === 'open') {
    conv.state = 'open';
  }
}

function successBody(messageType, data, kind) {
  if (kind === 'error-list') {
    return { status: 200, data: { type: 'error.list', id: 'err-1', errors: [{ code: 'synthetic', message: 'synthetic error' }] } };
  }
  if (kind === 'data-null') return { status: 200, data: null };
  if (kind === '422') return { status: 422, data: { type: 'error.list', errors: [{ code: 'parameter_invalid', message: 'synthetic 422' }] } };
  if (kind === '422-nested') return { status: 0, data: { errors: [{ status: 422, code: 'parameter_invalid', message: 'nested 422' }] } };
  if (kind === '500') return { status: 500, data: { type: 'error.list', errors: [{ code: 'server_error' }] } };
  if (kind === 'wrong-assignee') {
    return { status: 200, data: { id: 'asg-wrong', type: 'conversation', admin_assignee_id: '7000007' } };
  }
  if (kind === 'names-bot') {
    return { status: 200, data: { id: 'asg-bot', type: 'conversation', admin_assignee_id: ARSAL } };
  }
  if (kind === 'names-other') {
    return { status: 200, data: { id: 'asg-other', type: 'conversation', admin_assignee_id: '7000009' } };
  }
  if (kind === 'missing-assignee') return { status: 200, data: { id: 'asg-missing', type: 'conversation' } };
  if (kind === 'partial-named') {
    return { status: 200, data: { id: 'asg-partial', type: 'conversation', partial: true, admin_assignee_id: SEAT } };
  }
  if (kind === 'partial-unnamed') return { status: 200, data: { id: 'asg-partial', type: 'conversation', partial: true } };
  if (messageType === 'assignment') {
    return { status: 200, data: { id: 'asg-ok', type: 'conversation', admin_assignee_id: String(data.assignee_id) } };
  }
  return { status: 200, data: { id: messageType + '-ok', type: messageType === 'note' ? 'conversation' : 'admin_reply' } };
}

function handleReply(convId, data, entry) {
  const messageType = data && data.message_type;
  const spec = faultFor(messageType);
  const n = bump(messageType + ':' + spec);
  let kind = spec;
  if (spec === '429-then-ok') {
    if (n === 1) {
      entry.status = 429;
      return { status: 429, data: { type: 'error.list', errors: [{ code: 'rate_limit' }] } };
    }
    kind = 'ok';
  }
  if (spec === 'timeout-before' || (spec === 'timeout' && n === 1)) {
    entry.status = 0;
    entry.fault = 'timeout-before';
    const err = new Error('timeout of 20000ms exceeded');
    err.code = 'ECONNABORTED';
    throw err;
  }
  if (spec === 'timeout-after') {
    applyRemote(convId, data);
    entry.status = 0;
    entry.fault = 'timeout-after';
    entry.applied = true;
    const err = new Error('timeout of 20000ms exceeded');
    err.code = 'ECONNABORTED';
    throw err;
  }
  if (spec === '500-after') {
    applyRemote(convId, data);
    entry.applied = true;
    const res = successBody(messageType, data, '500');
    entry.status = res.status;
    return res;
  }
  const res = successBody(messageType, data, kind);
  entry.status = res.status;
  const live = (faultState && faultState.liveAfterAssign) || 'match';
  const failed = !(res.status >= 200 && res.status < 300) || kind === 'error-list' || kind === 'data-null' || kind === 'wrong-assignee' || kind === 'names-bot' || kind === 'names-other' || kind === 'missing-assignee' || kind === 'partial-unnamed' || kind === '422' || kind === '422-nested' || kind === '500';
  // Response names the requested seat, but the conversation refetch still shows the bot.
  if (messageType === 'assignment' && kind === 'ok' && live === 'bot') {
    if (res.data && typeof res.data === 'object') res.data.admin_assignee_id = String(data.assignee_id);
    remote[convId].admin_assignee_id = ARSAL;
    entry.applied = false;
    return res;
  }
  if (!failed) {
    applyRemote(convId, data);
    if (messageType === 'assignment' && live === 'other') remote[convId].admin_assignee_id = '7000009';
    if (messageType === 'assignment' && live === 'unset') remote[convId].admin_assignee_id = '0';
    entry.applied = true;
  }
  return res;
}

function axios(config) {
  return Promise.resolve().then(() => handleAxios(config));
}
axios.get = (url, config) => axios(Object.assign({}, config, { method: 'get', url }));
axios.post = (url, data, config) => axios(Object.assign({}, config, { method: 'post', url, data }));
axios.defaults = {};
axios.create = () => axios;

class OpenAI {
  constructor() {}
  chat = { completions: { create: async (req) => this._create(req) } };
  _create(req) {
    const joined = (req.messages || []).map((m) => String(m.content || '')).join('\n');
    if (/Rewrite the following INTERNAL/i.test(joined) || /Summarize the client messages/i.test(joined)) {
      return { choices: [{ message: { content: 'Client asked for help with this conversation.' } }] };
    }
    if (/OWNER_CMD|interpret the owner|ACTION: REPLY\|NOTE/i.test(joined) || /flexible owner/i.test(joined)) {
      return { choices: [{ message: { content: 'ACTION: NOOP\nBODY: noted' } }] };
    }
    const mode = modelState.mode || 'reply';
    if (mode === 'empty') return { choices: [{ message: { content: '' } }] };
    if (mode === 'whitespace') return { choices: [{ message: { content: '   \n' } }] };
    if (mode === 'clarifier') {
      return { choices: [{ message: { content: 'ACTION: REPLY\nBODY: Please tell me which challenge you mean.' } }] };
    }
    if (mode === 'team-review') {
      return { choices: [{ message: { content: 'ACTION: REPLY\nBODY: Our team will review this and get back to you.' } }] };
    }
    if (mode === 'echo') {
      return { choices: [{ message: { content: 'ACTION: REPLY\nBODY: Your password is ' + modelState.canary + ' and the daily loss limit is five percent.' } }] };
    }
    if (mode === 'spread-locked') {
      return { choices: [{ message: { content: 'ACTION: REPLY\nBODY: ' + lockedSpread } }] };
    }
    if (mode === 'spread-mutated') {
      return { choices: [{ message: { content: 'ACTION: REPLY\nBODY: ' + lockedSpread.replace('Testing', 'TestingX') } }] };
    }
    if (mode === 'queue') {
      const next = modelState.replies.shift();
      return { choices: [{ message: { content: next == null ? '' : next } }] };
    }
    const body = modelState.body || 'The daily loss limit is five percent.';
    return { choices: [{ message: { content: 'ACTION: REPLY\nBODY: ' + body } }] };
  }
}

const origRequire = Module.prototype.require;
Module.prototype.require = function patched(id) {
  if (id === 'axios') return axios;
  if (id === 'openai') return OpenAI;
  return origRequire.apply(this, arguments);
};

let handleWebhook = null;
let control = null;
let fixedLines = null;

function boot(root) {
  if (handleWebhook) return;
  runtimeRoot = root;
  process.chdir(root);
  const parent = path.join(root, '..');
  const linkState = path.join(root, 'statePresend');
  const linkMaint = path.join(root, 'luna-maintainer');
  if (!fs.existsSync(linkState)) fs.symlinkSync(path.join(parent, '02_statePresend'), linkState);
  if (!fs.existsSync(linkMaint)) fs.symlinkSync(path.join(parent, '03_luna-maintainer'), linkMaint);
  for (const name of ['repeatedClientQuestion.js', 'assistantIdentityGuard.js']) {
    const dest = path.join(parent, name);
    if (!fs.existsSync(dest)) fs.symlinkSync(path.join(root, name), dest);
  }
  const modules = path.join(root, 'node_modules');
  if (!fs.existsSync(modules)) {
    fs.symlinkSync('/tmp/r12-src/luna-current/01_runtime/node_modules', modules);
  }
  const engine = require(path.join(root, 'index.js'));
  handleWebhook = engine.handleWebhook;
  control = require(path.join(root, 'control.js'));
  try {
    fixedLines = require(path.join(root, 'fixedMessageHandoff.js')).FIXED_MESSAGES;
  } catch (_) {
    fixedLines = null;
  }
  try {
    const sanitizer = require(path.join(root, '..', '02_statePresend', 'credentialSanitizer.js'));
    lockedSpread = sanitizer.LOCKED_SPREAD_TEST_REPLY;
    const m = String(lockedSpread).match(/Password: (\S+)/);
    spreadSecret = m ? m[1] : '';
  } catch (_) {
    lockedSpread = '';
    spreadSecret = '';
  }
}

function redact(text) {
  let s = String(text == null ? '' : text);
  if (spreadSecret && s.includes(spreadSecret)) s = s.split(spreadSecret).join('[redacted-spread-secret]');
  if (lockedSpread && s === lockedSpread) return '[locked-template]';
  return s;
}

function writeControl(stateDir, turn, reset) {
  const file = path.join(stateDir, 'control.json');
  let ctrl = {
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: [],
    testAllowConversationIds: [],
    config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
  };
  if (!reset && fs.existsSync(file)) {
    try { ctrl = Object.assign(ctrl, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (_) { /* fresh */ }
  }
  const c = turn.control || {};
  if (c.paused != null) ctrl.paused = !!c.paused;
  if (c.repliesEnabled != null) ctrl.config.repliesEnabled = !!c.repliesEnabled;
  if (c.aiOff === true) ctrl.aiOff[String(turn.convId)] = true;
  if (c.aiOff === false) delete ctrl.aiOff[String(turn.convId)];
  fs.writeFileSync(file, JSON.stringify(ctrl));
}

function buildConv(turn) {
  const now = Math.floor(Date.now() / 1000);
  const created = now - (turn.ageSec == null ? 3600 : turn.ageSec);
  const parts = [];
  for (let i = 0; i < (turn.extraParts || []).length; i += 1) {
    const p = turn.extraParts[i];
    parts.push({
      id: p.id || 'prior-' + i,
      part_type: p.partType || 'comment',
      body: p.body || '',
      created_at: p.createdAt || created + i + 1,
      author: {
        type: p.authorType || 'admin',
        id: p.authorId || '7000007',
        name: p.authorName || 'Human Seven',
        email: p.email || 'human7@example.test',
      },
      assigned_to: p.assignedTo ? { id: String(p.assignedTo) } : undefined,
    });
  }
  if (turn.topic !== 'conversation.admin.noted') {
    parts.push({
      id: turn.partId || 'user-' + turn.convId,
      part_type: turn.partType || 'comment',
      body: turn.text || '',
      created_at: turn.partCreatedAt || now - 5,
      author: { type: 'user', id: 'user-1', name: turn.clientName || '', email: 'user@example.test' },
    });
  }
  if (turn.note) {
    parts.push({
      id: turn.note.id || 'authnote-' + turn.convId,
      part_type: 'note',
      body: turn.note.body || '',
      created_at: now - 1,
      author: {
        type: turn.note.authorType || 'admin',
        id: turn.note.authorId || ARSAL,
        name: turn.note.authorName || '',
        email: turn.note.email || '',
      },
    });
  }
  const conv = {
    type: 'conversation',
    id: String(turn.convId),
    state: turn.convState || 'open',
    created_at: created,
    admin_assignee_id: turn.assignee == null ? ARSAL : String(turn.assignee),
    team_assignee_id: turn.team == null ? '0' : String(turn.team),
    team_assignee: turn.teamName ? { id: String(turn.team), name: turn.teamName } : null,
    source: {
      body: turn.sourceBody == null ? turn.text || '' : turn.sourceBody,
      author: { type: 'user', id: 'user-1', name: turn.clientName || '' },
      created_at: created,
    },
    contacts: { contacts: [{ id: 'user-1', name: turn.clientName || '', email: 'user@example.test' }] },
    conversation_parts: { conversation_parts: parts },
  };
  if (turn.assigneeObject) {
    conv.admin_assignee_id = '0';
    conv.assignee = { type: 'admin', id: '', name: '' };
  }
  return conv;
}

async function runTurn(turn, stateDir) {
  const before = recording.length;
  faultState = Object.assign({ counts: {} }, turn.faults || {});
  modelState = {
    mode: turn.modelMode || 'reply',
    body: turn.modelBody || 'The daily loss limit is five percent.',
    replies: (turn.modelReplies || []).slice(),
    canary: turn.canary || '',
  };
  writeControl(stateDir, turn, !turn.keepRemote);
  if (!turn.keepRemote) {
    remote[turn.convId] = buildConv(turn);
  } else if (!remote[turn.convId]) {
    remote[turn.convId] = buildConv(turn);
  } else if (turn.appendUser) {
    const conv = remote[turn.convId];
    conv.conversation_parts.conversation_parts.push({
      id: turn.partId || 'user-next-' + recording.length,
      part_type: turn.partType || 'comment',
      body: turn.text || '',
      created_at: Math.floor(Date.now() / 1000),
      author: { type: 'user', id: 'user-1', name: turn.clientName || '', email: 'user@example.test' },
    });
    if (turn.assignee != null) conv.admin_assignee_id = String(turn.assignee);
    if (turn.team != null) conv.team_assignee_id = String(turn.team);
  }
  saveRemote(stateDir, remote);
  const req = { body: { topic: turn.topic || 'conversation.user.replied', data: { item: { id: String(turn.convId) } } } };
  const res = { statusCode: 0, sendStatus(code) { this.statusCode = code; return this; } };
  let threw = null;
  try {
    await handleWebhook(req, res);
  } catch (e) {
    threw = e && e.message;
  }
  saveRemote(stateDir, remote);
  const writes = recording.slice(before).map((row) => ({
    method: row.method,
    url: row.url.replace(/https:\/\/api\.intercom\.io/, ''),
    body: redact(row.body),
    status: row.status == null ? null : row.status,
    applied: !!row.applied,
    fault: row.fault || '',
  }));
  return { statusCode: res.statusCode, threw, writes };
}

function aiOffNow(stateDir, convId) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(stateDir, 'control.json'), 'utf8'));
    return !!(s.aiOff && s.aiOff[String(convId)]);
  } catch (_) {
    return null;
  }
}

async function runCase(message) {
  boot(message.runtimeRoot);
  const logFrom = logs.length;
  const hitFrom = hits.length;
  const stateDir = message.stateDir;
  fs.mkdirSync(stateDir, { recursive: true });
  if (message.resume) remote = loadRemote(stateDir);
  else remote = {};
  const cse = message.case;
  const turns = cse.turns || [];
  const indexes = message.onlyTurn == null ? turns.map((_, i) => i) : [message.onlyTurn];
  const turnResults = [];
  for (const i of indexes) {
    const turn = Object.assign({ convId: cse.convId || cse.id }, turns[i]);
    if (message.resume || i > 0) turn.keepRemote = true;
    if (i > 0 && turn.appendUser !== false && turn.topic !== 'conversation.admin.noted' && !turn.sameDelivery) {
      turn.appendUser = turn.appendUser == null ? true : turn.appendUser;
    }
    if (message.resume && message.onlyTurn != null) {
      turn.keepRemote = true;
      if (turn.topic !== 'conversation.admin.noted' && !turn.sameDelivery) turn.appendUser = turn.appendUser !== false;
    }
    turnResults.push(await runTurn(turn, stateDir));
    if (message.onlyTurn == null && cse.between && cse.between[i] && cse.between[i] !== 'restart') {
      applyMutation(stateDir, cse.between[i]);
      remote = loadRemote(stateDir);
    }
  }
  const writes = turnResults.flatMap((t) => t.writes);
  const publicBodies = [];
  const noteBodies = [];
  for (const w of writes) {
    if (w.method !== 'post' || w.url.indexOf('/reply') === -1) continue;
    let parsed = null;
    try { parsed = JSON.parse(w.body); } catch (_) { parsed = null; }
    if (!parsed) continue;
    if (parsed.message_type === 'comment') publicBodies.push(redact(parsed.body || ''));
    if (parsed.message_type === 'note') noteBodies.push(redact(parsed.body || ''));
  }
  const canaries = cse.canaries || [];
  const leaks = [];
  const caseLogs = logs.slice(logFrom);
  const blob = writes.map((w) => w.body).join('\n') + '\n' + caseLogs.join('\n');
  for (const c of canaries) {
    if (c && blob.includes(c)) leaks.push(c);
  }
  const convId = cse.convId || cse.id;
  return {
    id: cse.id,
    threw: turnResults.some((t) => t.threw) ? turnResults.map((t) => t.threw).filter(Boolean).join(' | ') : null,
    statusCodes: turnResults.map((t) => t.statusCode),
    writes,
    publicBodies,
    noteBodies,
    aiOff: aiOffNow(stateDir, convId),
    leaks,
    tripwires: hits.slice(hitFrom),
    webhookErr: caseLogs.some((l) => l.includes('WEBHOOK_ERR') || l.includes('gate error')),
    logTail: caseLogs.slice(-20),
  };
}

function listen() {
  const chunks = [];
  process.stdin.on('data', (buf) => chunks.push(buf));
  process.stdin.on('end', async () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    const lines = raw.split('\n').filter((l) => l.trim());
    const outs = [];
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        outs.push(JSON.stringify(await runCase(message)));
      } catch (e) {
        outs.push(JSON.stringify({ threw: e && e.stack ? e.stack : String(e), id: 'worker-error' }));
      }
    }
    process.stdout.write(outs.join('\n') + '\n');
  });
}

if (require.main === module) listen();

module.exports = { boot, runCase };
