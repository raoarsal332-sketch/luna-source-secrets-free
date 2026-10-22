'use strict';

/**
 * Drive the real handleWebhook with a recording transport, a stub model,
 * and a network tripwire. Does not contact Intercom or any other host.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const http = require('http');
const https = require('https');
const net = require('net');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1];
}

const runtimeDir = path.resolve(arg('--runtime', ''));
const casesPath = path.resolve(arg('--cases', ''));
const outPath = path.resolve(arg('--out', ''));
const label = arg('--label', 'run');
if (!runtimeDir || !casesPath || !outPath) {
  console.error('usage: node run-webhook.js --runtime <01_runtime> --cases <cases.json> --out <results.json> --label <name>');
  process.exit(1);
}

const pack = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const rows = pack.cases;
const tmp = fs.mkdtempSync(path.join('/tmp', 'payout-r20-' + label + '-'));
const ticketFile = path.join(tmp, 'tickets.json');
const controlFile = path.join(tmp, 'control.json');
const promptFile = path.join(runtimeDir, 'system-prompt.txt');
const opFile = path.join(tmp, 'ops.json');
const mentionFile = path.join(tmp, 'mentions.json');

fs.writeFileSync(ticketFile, '{}');
fs.writeFileSync(controlFile, JSON.stringify({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Bot test'],
  testAllowConversationIds: [],
  config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
}));
fs.writeFileSync(opFile, '{}');
fs.writeFileSync(mentionFile, '{}');

process.env.TICKET_STATE_FILE = ticketFile;
process.env.LUNA_CONTROL_STATE_FILE = controlFile;
process.env.LUNA_PROMPT_FILE = promptFile;
process.env.LUNA_OP_STORE_FILE = opFile;
process.env.MENTION_ROTATE_FILE = mentionFile;
process.env.LUNA_PRESEND_MODE = 'observe';
process.env.LUNA_TOOLS_ENABLED = '0';
process.env.OPENAI_API_KEY = 'stub-not-a-real-key';
process.env.INTERCOM_ACCESS_TOKEN = 'stub-not-a-real-token';
process.env.PORT = '0';
process.env.CONTROL_SECRET = '';

const tripwire = [];
function trip(kind, detail) {
  const entry = { kind, detail: String(detail == null ? '' : detail).slice(0, 300), at: Date.now() };
  tripwire.push(entry);
  const err = new Error('NETWORK_TRIPWIRE ' + kind);
  err.code = 'NETWORK_TRIPWIRE';
  throw err;
}

function describeOpts(opts) {
  if (!opts) return '';
  if (typeof opts === 'string') return opts;
  try {
    return opts.href || ((opts.protocol || '') + '//' + (opts.host || opts.hostname || '') + (opts.path || ''));
  } catch (_) {
    return '';
  }
}

http.request = function blockedHttp(opts) { trip('http.request', describeOpts(opts)); };
https.request = function blockedHttps(opts) { trip('https.request', describeOpts(opts)); };
http.get = function blockedHttpGet(opts) { trip('http.get', describeOpts(opts)); };
https.get = function blockedHttpsGet(opts) { trip('https.get', describeOpts(opts)); };
net.Socket.prototype.connect = function blockedConnect() {
  trip('net.connect', arguments[0] && (arguments[0].host || arguments[0].hostname || arguments[0]));
};

const axiosCalls = [];
function axiosRequest(config) {
  config = config || {};
  const url = String(config.url || '');
  axiosCalls.push({ method: String(config.method || 'get'), url });
  if (url && !/faq\.fundedelite\.com/i.test(url)) {
    tripwire.push({ kind: 'axios', detail: url.slice(0, 300), at: Date.now() });
  }
  return Promise.resolve({ status: 204, data: '', headers: {}, config });
}
function axiosStub(config) { return axiosRequest(config); }
axiosStub.request = axiosRequest;
axiosStub.get = (url, cfg) => axiosRequest(Object.assign({}, cfg, { url, method: 'get' }));
axiosStub.post = (url, data, cfg) => axiosRequest(Object.assign({}, cfg, { url, data, method: 'post' }));
axiosStub.put = (url, data, cfg) => axiosRequest(Object.assign({}, cfg, { url, data, method: 'put' }));
axiosStub.delete = (url, cfg) => axiosRequest(Object.assign({}, cfg, { url, method: 'delete' }));
axiosStub.create = () => axiosStub;
axiosStub.defaults = { headers: { common: {}, get: {}, post: {} } };
axiosStub.interceptors = { request: { use() {} }, response: { use() {} } };
axiosStub.isAxiosError = () => false;

let current = null;
const modelCalls = [];
class OpenAIStub {
  constructor() {
    this.chat = {
      completions: {
        create: async (req) => {
          modelCalls.push({ model: req && req.model, n: (req && req.messages && req.messages.length) || 0 });
          const row = current || {};
          const action = row.modelAction || 'REPLY';
          let content;
          if (action === 'ESCALATE') {
            content = [
              'ACTION: ESCALATE',
              'KIND: FAQ_CONFIRM',
              'CLIENT: ' + String(row.draft || ''),
              'BODY: Client asked about the chart menu.',
            ].join('\n');
          } else {
            content = 'ACTION: REPLY\nBODY: ' + String(row.draft || '');
          }
          return { choices: [{ message: { content, tool_calls: [] } }] };
        },
      },
    };
  }
}

const origRequire = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
  if (id === 'axios') return axiosStub;
  if (id === 'openai') return OpenAIStub;
  return origRequire.apply(this, arguments);
};

const errors = [];
const logs = [];
const origError = console.error;
console.error = (...args) => {
  const line = args.map((x) => (typeof x === 'string' ? x : (x && x.message) || '')).join(' ');
  if (/WEBHOOK_ERR|NETWORK_TRIPWIRE|PAYOUT_GUARD/.test(line)) errors.push(line.slice(0, 500));
};
console.log = (...args) => {
  const line = args.map((x) => (typeof x === 'string' ? x : '')).join(' ');
  if (/AI_ACTION|PRESEND|ESCALAT|PAYOUT_|POSTGATE|SKIP |FAQ_RETRIEVE|statePresend/.test(line)) logs.push(line.slice(0, 300));
};

const runtimeIndex = path.join(runtimeDir, 'index.js');
const runtimeModule = new Module(runtimeIndex, module);
runtimeModule.filename = runtimeIndex;
runtimeModule.paths = Module._nodeModulePaths(runtimeDir);
const appMod = runtimeModule.require(runtimeIndex);
const conversations = new Map();
const transport = [];

appMod.__setTestDoubles({
  fetchConversation: async (id) => conversations.get(String(id)) || null,
  icRequest: async (method, url, data, tag) => {
    const payload = {
      method: String(method || ''),
      url: String(url || ''),
      tag: String(tag || ''),
      data: data == null ? null : JSON.parse(JSON.stringify(data)),
    };
    transport.push({ caseId: current && current.id, payload });
    return { ok: true, status: 200, data: { id: 'local-' + transport.length, type: 'conversation' } };
  },
});

function esc(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildConversation(row, convId) {
  const now = Math.floor(Date.now() / 1000);
  const parts = [];
  if (row.teammate) {
    parts.push({
      id: 'tm-' + convId,
      part_type: 'comment',
      body: '<p>I am looking at the chart menu with you.</p>',
      created_at: now - 300,
      author: { type: 'admin', id: '555001', name: 'Nia' },
    });
  }
  parts.push({
    id: 'user-' + convId,
    part_type: 'comment',
    body: '<p>' + esc(row.client || '') + '</p>',
    created_at: now - 30,
    author: { type: 'user', id: 'user-amina', name: 'Amina', email: 'amina@example.com' },
  });
  if (row.path === 'owner_reply') {
    parts.push({
      id: 'note-' + convId,
      part_type: 'note',
      body: '<p>@Arsal REPLY: ' + esc(row.draft || '') + '</p>',
      created_at: now - 5,
      author: { type: 'admin', id: '10118526', name: 'Arsal' },
    });
  }
  return {
    id: convId,
    type: 'conversation',
    created_at: now - 7200,
    updated_at: now - 20,
    state: 'open',
    open: true,
    team_assignee_id: null,
    admin_assignee_id: null,
    source: {
      type: 'conversation',
      body: '<p>Hello from the home screen.</p>',
      author: { type: 'user', id: 'user-amina', name: 'Amina', email: 'amina@example.com' },
      delivered_as: 'customer_initiated',
    },
    contacts: { contacts: [{ type: 'user', id: 'user-amina', name: 'Amina', email: 'amina@example.com' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function seedState(row, convId) {
  const now = Math.floor(Date.now() / 1000);
  const all = {};
  if (row.seedAwaiting) {
    all[convId] = {
      escalateAwaitingFirstTeammate: true,
      lastEscalateAt: now - 600,
      lastEscalateProblem: 'The withdrawal has not arrived',
      lastEscalateNoteSnippet: 'The withdrawal has not arrived',
      lastEscalateTopic: 'payout',
      lastEscalateTopics: ['payout'],
      deferredRelatedReply: null,
      escalateTeammateExplainedAt: 0,
      authNotesBootstrapped: false,
      handledAuthNoteIds: [],
    };
  }
  fs.writeFileSync(ticketFile, JSON.stringify(all));
}

function readFlag(convId) {
  try {
    const all = JSON.parse(fs.readFileSync(ticketFile, 'utf8'));
    const st = all[String(convId)];
    if (!st) return null;
    return !!st.escalateAwaitingFirstTeammate;
  } catch (_) {
    return null;
  }
}

function mockRes() {
  const res = {
    statusCode: null,
    ended: false,
    sendStatus(code) { this.statusCode = code; this.ended = true; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.ended = true; return this; },
    send(body) { this.body = body; this.ended = true; return this; },
    end() { this.ended = true; return this; },
  };
  return res;
}

(async () => {
  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const convId = 'c' + String(i + 1);
    const beforeTrip = tripwire.length;
    const beforeErr = errors.length;
    const beforeLogs = logs.length;
    const beforeTransport = transport.length;
    current = row;
    conversations.set(convId, buildConversation(row, convId));
    seedState(row, convId);
    const topic = row.path === 'owner_reply' ? 'conversation.admin.noted' : 'conversation.user.replied';
    const req = { body: { topic, data: { item: { id: convId, type: 'conversation' } } }, headers: {} };
    const res = mockRes();
    try {
      await appMod.handleWebhook(req, res);
    } catch (err) {
      errors.push('THROW ' + (err && err.message));
    }
    const mine = transport.slice(beforeTransport).filter((item) => String(item.payload.url).includes('/' + convId + '/'));
    const comments = [];
    const notes = [];
    const payloads = [];
    for (const item of mine) {
      payloads.push(item.payload);
      const data = item.payload.data || {};
      if (data.message_type === 'comment') comments.push(String(data.body || ''));
      else if (data.message_type === 'note') notes.push(String(data.body || ''));
    }
    results.push({
      id: row.id,
      lang: row.lang,
      kind: row.kind,
      rule: row.rule,
      path: row.path,
      benignFaq: !!row.benignFaq,
      homonym: !!row.homonym,
      baselineGroup: row.baselineGroup || 'none',
      factId: row.factId || null,
      expectFlag: row.expectFlag == null ? null : !!row.expectFlag,
      leakMarkers: row.leakMarkers || [],
      comments,
      notes,
      payloads,
      flag: readFlag(convId),
      statusCode: res.statusCode,
      tripwire: tripwire.length - beforeTrip,
      errors: errors.slice(beforeErr),
      logs: logs.slice(beforeLogs, beforeLogs + 12),
    });
  }
  const summary = {
    label,
    caseCount: results.length,
    casesSha256: pack.sha256 || null,
    transportCalls: transport.length,
    modelCalls: modelCalls.length,
    axiosCalls: axiosCalls.length,
    tripwire: tripwire.length,
    tripwireSample: tripwire.slice(0, 8),
    commentCases: results.filter((r) => r.comments.length).length,
    errorCases: results.filter((r) => r.errors.length).length,
  };
  fs.writeFileSync(outPath, JSON.stringify({ summary, results }));
  origError.call(console, JSON.stringify(summary));
  process.exit(0);
})().catch((err) => {
  origError.call(console, err && err.stack || err);
  process.exit(1);
});
