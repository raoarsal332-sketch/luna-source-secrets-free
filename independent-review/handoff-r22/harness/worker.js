'use strict';

// One runtime process. Reads JSON jobs from stdin, one per line.
// Recording transport, stub model, network tripwire. No real socket.

const fs = require('fs');
const path = require('path');
const Module = require('module');
const net = require('net');
const http = require('http');
const https = require('https');
const dns = require('dns');
const dgram = require('dgram');

const runtime = path.resolve(process.argv[2]);
const presend = path.resolve(process.argv[3]);
const stateDir = path.resolve(process.argv[4]);
fs.mkdirSync(stateDir, { recursive: true });

const logPath = path.join(stateDir, 'worker.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });
console.log = function () {
  logStream.write(Array.from(arguments).map(String).join(' ') + '\n');
};
console.error = console.log;
console.warn = console.log;

let tripwire = 0;
let tripwireLast = '';
function trip(name) {
  return function () {
    tripwire += 1;
    tripwireLast = name;
    throw new Error('NETWORK_TRIPWIRE ' + name);
  };
}
net.connect = trip('net.connect');
net.createConnection = trip('net.createConnection');
if (net.Socket && net.Socket.prototype) net.Socket.prototype.connect = trip('socket.connect');
http.request = trip('http.request');
http.get = trip('http.get');
https.request = trip('https.request');
https.get = trip('https.get');
dns.lookup = trip('dns.lookup');
dns.resolve = trip('dns.resolve');
dns.resolve4 = trip('dns.resolve4');
dns.resolve6 = trip('dns.resolve6');
dgram.createSocket = trip('dgram.createSocket');
global.fetch = trip('fetch');

const stubDir = path.join(stateDir, 'stubs');
fs.mkdirSync(stubDir, { recursive: true });
const axiosMock = path.join(stubDir, 'axios.js');
const openaiMock = path.join(stubDir, 'openai.js');
const expressMock = path.join(stubDir, 'express.js');
const dotenvMock = path.join(stubDir, 'dotenv.js');
fs.writeFileSync(axiosMock, [
  'function axios(cfg) { return global.__lunaAxios(cfg); }',
  'axios.get = function (url, opts) { return axios(Object.assign({ method: "get", url: url }, opts || {})); };',
  'axios.post = function (url, data, opts) { return axios(Object.assign({ method: "post", url: url, data: data }, opts || {})); };',
  'axios.create = function () { return axios; };',
  'module.exports = axios;',
  '',
].join('\n'));
fs.writeFileSync(openaiMock, [
  'class OpenAI {',
  '  constructor() { this.chat = { completions: { create: function (req) { return global.__lunaModel(req); } } }; }',
  '}',
  'module.exports = OpenAI;',
  '',
].join('\n'));
fs.writeFileSync(expressMock, [
  'function express() {',
  '  const app = { use() { return app; }, get() { return app; }, post() { return app; }, listen() { return app; } };',
  '  return app;',
  '}',
  'express.json = function () { return function (_req, _res, next) { if (next) next(); }; };',
  'module.exports = express;',
  '',
].join('\n'));
fs.writeFileSync(dotenvMock, 'module.exports = { config: function () { return { parsed: {} }; } };\n');

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'axios') return axiosMock;
  if (request === 'openai') return openaiMock;
  if (request === 'express') return expressMock;
  if (request === 'dotenv') return dotenvMock;
  if (request === './statePresend/statePresend' || request === './statePresend/statePresend.js') {
    return path.join(presend, 'statePresend.js');
  }
  if (request === './statePresend/textUtils' || request === './statePresend/textUtils.js') {
    return path.join(presend, 'textUtils.js');
  }
  if (typeof request === 'string' && request.indexOf('statePresend/') !== -1) {
    const base = request.split('statePresend/').pop();
    const file = base.endsWith('.js') ? base : base + '.js';
    const candidate = path.join(presend, file);
    if (fs.existsSync(candidate)) return candidate;
  }
  if (typeof request === 'string' && request.startsWith('../') && parent && parent.filename && parent.filename.includes('02_statePresend')) {
    const rel = request.replace(/^\.\.\//, '');
    const candidate = path.join(runtime, rel.endsWith('.js') ? rel : rel + '.js');
    if (fs.existsSync(candidate)) return candidate;
  }
  return resolveFilename.call(this, request, parent, isMain, options);
};

const controlFile = path.join(stateDir, 'control.json');
if (!fs.existsSync(controlFile)) {
  fs.writeFileSync(controlFile, JSON.stringify({
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: [],
    testAllowConversationIds: [],
    config: { model: 'stub-luna', welcomeEnabled: true, repliesEnabled: true },
  }));
}
process.env.LUNA_CONTROL_STATE_FILE = controlFile;
process.env.LUNA_OP_STORE_FILE = path.join(stateDir, 'ops.json');
process.env.TICKET_STATE_FILE = path.join(stateDir, 'tickets.json');
process.env.MENTION_ROTATE_FILE = path.join(stateDir, 'mentions.json');
process.env.IMAGE_GUARD_STATE_FILE = path.join(stateDir, 'image.json');
process.env.LUNA_PROMPT_FILE = path.join(runtime, 'system-prompt.txt');
process.env.FUNDEDELITE_FAQ_PATH = path.join(runtime, 'fundedelite-faqs.md');
process.env.OPENAI_API_KEY = 'review-stub';
process.env.INTERCOM_ACCESS_TOKEN = 'review-stub';
process.env.MAINTAINER_ENABLED = 'false';
process.env.LUNA_SPREAD_GATE_MODE = 'strict-and-legacy';

const calls = [];
let current = null;
let liveAssignee = '';
let failComment = '';
let failNote = '';
let failAssign = '';
const prompts = [];

global.__lunaModel = function (req) {
  const messages = (req && req.messages) || [];
  const sys = String((messages.find(function (m) { return m.role === 'system'; }) || {}).content || '');
  const user = String((messages.find(function (m) { return m.role === 'user'; }) || {}).content || '');
  prompts.push(user);
  if (/INTERNAL Intercom note/i.test(sys)) {
    return Promise.resolve({ choices: [{ message: { content: user.replace(/^\[[^\]]+\]\n/, '') } }] });
  }
  return Promise.resolve({ choices: [{ message: { content: global.__lunaReply || 'ACTION: REPLY\nOK' } }] });
};

function failResult(flag) {
  if (flag === 'timeout') return Promise.reject(new Error('timeout'));
  const status = Number(flag);
  return Promise.resolve({
    status: status,
    data: { type: 'error.list', errors: [{ code: 'parameter_invalid', status: status }] },
  });
}

global.__lunaAxios = function (cfg) {
  const method = String((cfg && cfg.method) || 'get').toLowerCase();
  const url = String((cfg && cfg.url) || '');
  const data = cfg && cfg.data;
  const rec = { method: method, url: url, data: data, status: 200 };
  calls.push(rec);
  if (url.indexOf('/admins') !== -1) {
    rec.status = 200;
    return Promise.resolve({
      status: 200,
      data: {
        admins: [{
          id: '424242',
          name: 'Casey Support',
          email: 'casey.support@example.com',
          has_inbox_seat: true,
          away_mode_enabled: false,
          team_ids: [9629780],
        }],
      },
    });
  }
  if (method === 'get' && url.indexOf('/conversations/') !== -1) {
    const copy = JSON.parse(JSON.stringify(current || {}));
    if (liveAssignee) copy.admin_assignee_id = liveAssignee;
    rec.status = 200;
    return Promise.resolve({ status: 200, data: copy });
  }
  if (data && data.message_type === 'note' && failNote) {
    rec.status = failNote === 'timeout' ? 0 : Number(failNote);
    return failResult(failNote);
  }
  if (data && data.message_type === 'assignment' && failAssign) {
    rec.status = failAssign === 'timeout' ? 0 : Number(failAssign);
    return failResult(failAssign);
  }
  if (data && data.message_type === 'comment' && failComment) {
    rec.status = failComment === 'timeout' ? 0 : Number(failComment);
    return failResult(failComment);
  }
  if (data && data.message_type === 'assignment') {
    liveAssignee = String(data.assignee_id);
    rec.status = 200;
    return Promise.resolve({
      status: 200,
      data: { id: 'asg', type: 'conversation', admin_assignee_id: liveAssignee },
    });
  }
  rec.status = 200;
  return Promise.resolve({ status: 200, data: { id: 'w1', type: 'conversation' } });
};

const index = require(path.join(runtime, 'index.js'));
const store = require(path.join(runtime, 'writeOpStore.js'));
const ARSAL = '10118526';

function conv(id, spec) {
  const now = Math.floor(Date.now() / 1000);
  const name = spec.name || 'Sam';
  const text = spec.text || '';
  const parts = [];
  (spec.extraParts || []).forEach(function (p, i) {
    const part = {
      id: id + '-extra-' + i,
      part_type: p.part_type || 'comment',
      body: p.body || '',
      created_at: now + (p.created_at_offset == null ? -30 : p.created_at_offset),
      author: p.author || { type: 'user', id: 'user-1', name: name },
    };
    if (p.assigned_to) part.assigned_to = p.assigned_to;
    parts.push(part);
  });
  parts.push({
    id: id + '-user-' + now + '-' + Math.floor(Math.random() * 1000),
    part_type: 'comment',
    body: text,
    created_at: now - 5,
    author: { type: 'user', id: 'user-1', name: name },
  });
  const assignee = liveAssignee || '0';
  return {
    id: id,
    created_at: now - (spec.createdAgo == null ? 1000 : spec.createdAgo),
    admin_assignee_id: assignee,
    team_assignee_id: '0',
    source: {
      body: spec.sourceBody || text,
      created_at: now - 30,
      author: { type: 'user', id: 'user-1', name: name },
    },
    contacts: { contacts: [{ name: name, email: 'sam@example.com', id: 'user-1' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function ofType(type) {
  return calls.filter(function (c) { return c.data && c.data.message_type === type; });
}

async function runTurn(id, spec) {
  calls.length = 0;
  prompts.length = 0;
  const beforeTrip = tripwire;
  failComment = spec.failComment || '';
  failNote = spec.failNote || '';
  failAssign = spec.failAssign || '';
  // A named seat is the only value carried in from a previous turn. keepAssignee
  // must not reuse another conversation's assignee, or the next handoff is silent.
  if (spec.assignee && spec.assignee !== '0') liveAssignee = String(spec.assignee);
  else liveAssignee = '';
  global.__lunaReply = spec.model || 'ACTION: REPLY\nOK';
  current = conv(id, spec);
  const res = { status: 0, sendStatus: function (code) { this.status = code; return this; } };
  let error = '';
  try {
    await index.handleWebhook({ body: { topic: spec.topic || 'conversation.user.replied', data: { item: current } } }, res);
  } catch (err) {
    error = String(err && err.stack || err);
  }
  const owed = store.latestOwedFixedLine(id, ARSAL);
  return {
    status: res.status,
    comments: ofType('comment').map(function (c) { return String((c.data && c.data.body) || ''); }),
    commentStatuses: ofType('comment').map(function (c) { return c.status; }),
    notes: ofType('note').map(function (c) { return String((c.data && c.data.body) || ''); }),
    assigns: ofType('assignment').map(function (c) { return c.data || {}; }),
    prompts: prompts.slice(),
    owed: owed ? { message: owed.message, messageSent: !!owed.messageSent } : null,
    tripwire: tripwire - beforeTrip,
    tripwireLast: tripwire > beforeTrip ? tripwireLast : '',
    error: error,
  };
}

function writeResult(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', function (chunk) {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line.trim()) continue;
    const job = JSON.parse(line);
    if (job.cmd === 'stop') {
      writeResult({ ok: true, stopped: true });
      process.exit(0);
    }
    const id = String(job.id);
    const turns = job.turns || [];
    (async function () {
      const out = [];
      for (let i = 0; i < turns.length; i++) out.push(await runTurn(id, turns[i]));
      writeResult({ id: id, turns: out });
    })().catch(function (err) {
      writeResult({ id: id, error: String(err && err.stack || err), turns: [] });
    });
  }
});
process.stdin.on('end', function () { process.exit(0); });
writeResult({ ready: true, runtime: runtime });
