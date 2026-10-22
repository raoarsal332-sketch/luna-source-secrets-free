'use strict';

/**
 * Drives the real handleWebhook for one sealed pass.
 * REVIEW_MODE=baseline replaces the guard with an identity function.
 * REVIEW_MODE=candidate uses the frozen guard.
 * Network sockets are tripwired. Intercom writes go through the recording transport.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const MODE = process.env.REVIEW_MODE === 'baseline' ? 'baseline' : 'candidate';
const ROOT = process.env.CANDIDATE_ROOT;
const CASES_PATH = process.env.CASES_PATH;
const RESULT_PATH = process.env.RESULT_PATH;
const SEAL_PATH = process.env.SEAL_PATH;
if (!ROOT || !CASES_PATH || !RESULT_PATH || !SEAL_PATH) {
  console.error('missing CANDIDATE_ROOT, CASES_PATH, RESULT_PATH, or SEAL_PATH');
  process.exit(2);
}

const rawCases = fs.readFileSync(CASES_PATH);
const sealLine = fs.readFileSync(SEAL_PATH, 'utf8').split('\n')[0].split(/\s+/)[0];
const digest = crypto.createHash('sha256').update(rawCases).digest('hex');
if (digest !== sealLine) {
  console.error('SEAL MISMATCH', digest, sealLine);
  process.exit(3);
}

const packed = JSON.parse(rawCases.toString('utf8'));
const cases = packed.cases;
const runtime = path.join(ROOT, 'luna-current/01_runtime');
const tmp = fs.mkdtempSync(path.join('/tmp', 'ir21-' + MODE + '-'));
const controlFile = path.join(tmp, 'bot-control.json');
const ticketFile = path.join(tmp, 'ticket-state.json');
const promptFile = path.join(runtime, 'system-prompt.txt');
const faqFile = path.join(runtime, 'fundedelite-faqs.md');

process.env.OPENAI_API_KEY = 'stub-review-key';
process.env.INTERCOM_ACCESS_TOKEN = 'stub-review-token';
process.env.CONTROL_SECRET = 'stub-review-secret';
process.env.LUNA_CONTROL_STATE_FILE = controlFile;
process.env.LUNA_PROMPT_FILE = promptFile;
process.env.TICKET_STATE_FILE = ticketFile;
process.env.FUNDEDELITE_FAQ_PATH = faqFile;
process.env.LUNA_TOOLS_ENABLED = '0';
process.env.LUNA_PRESEND_MODE = process.env.LUNA_PRESEND_MODE || 'enforce';
process.env.MAINTAINER_ENABLED = 'false';
process.env.LUNA_OP_STORE_FILE = path.join(tmp, 'write-ops.json');

const tripwireHits = [];
function noteTrip(info) {
  tripwireHits.push({
    via: info.via || 'net',
    method: info.method || '',
    url: String(info.url || info.host || '').slice(0, 300),
  });
}

const net = require('net');
net.Socket.prototype.connect = function blockedConnect() {
  noteTrip({ via: 'net.connect', url: arguments[0] && (arguments[0].host || arguments[0]) });
  const err = new Error('NETWORK_TRIPWIRE');
  err.code = 'TRIPWIRE';
  process.nextTick(() => this.emit('error', err));
  return this;
};
const dns = require('dns');
dns.lookup = function blockedLookup(host, opts, cb) {
  noteTrip({ via: 'dns.lookup', url: host });
  const callback = typeof opts === 'function' ? opts : cb;
  const err = new Error('NETWORK_TRIPWIRE');
  if (typeof callback === 'function') callback(err);
  return Promise.reject(err);
};
dns.promises = dns.promises || {};
dns.promises.lookup = function (host) {
  noteTrip({ via: 'dns.promises.lookup', url: host });
  return Promise.reject(new Error('NETWORK_TRIPWIRE'));
};

function tripAxios(info) {
  noteTrip(info);
  const err = new Error('NETWORK_TRIPWIRE ' + (info.url || ''));
  err.code = 'TRIPWIRE';
  return Promise.reject(err);
}
function axiosMock(cfg) {
  const url = cfg && (cfg.url || cfg);
  return tripAxios({ via: 'axios', method: cfg && cfg.method, url });
}
axiosMock.get = (url) => tripAxios({ via: 'axios.get', method: 'get', url });
axiosMock.post = (url) => tripAxios({ via: 'axios.post', method: 'post', url });
axiosMock.put = (url) => tripAxios({ via: 'axios.put', method: 'put', url });
axiosMock.delete = (url) => tripAxios({ via: 'axios.delete', method: 'delete', url });
axiosMock.request = axiosMock;
axiosMock.create = () => axiosMock;
axiosMock.defaults = { headers: { common: {} } };
axiosMock.interceptors = { request: { use() {} }, response: { use() {} } };

function OpenAI() {
  this.chat = {
    completions: {
      create: async () => {
        modelCalls += 1;
        return { choices: [{ message: { content: currentModel } }] };
      },
    },
  };
}

const originalRequire = Module.prototype.require;
Module.prototype.require = function patched(id) {
  if (id === 'axios') return axiosMock;
  if (id === 'openai') return OpenAI;
  return originalRequire.apply(this, arguments);
};

let currentModel = 'ACTION: REPLY\nBODY:\nHello.';
let currentConv = null;
let modelCalls = 0;
const recorded = [];

function writeControl(extra) {
  const state = Object.assign({
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: ['Bot test'],
    testAllowConversationIds: [],
    config: { model: 'stub-model', welcomeEnabled: true, repliesEnabled: true },
  }, extra || {});
  fs.writeFileSync(controlFile, JSON.stringify(state));
}
writeControl();
fs.writeFileSync(ticketFile, '{}');

const index = require(path.join(runtime, 'index.js'));
const guardPath = path.join(ROOT, 'luna-current/10_synthetic_lanes/t800-payout-r21/payoutClaimGuard.js');
const guard = require(guardPath);
if (MODE === 'baseline') {
  guard.guardPublicBody = function passthrough(body) {
    const text = body == null ? '' : String(body);
    return {
      send: true,
      body: text.length ? text : "I can't confirm that. Our team will confirm.",
      replaced: false,
      silent: false,
      suppressed: false,
      failClosed: false,
      reason: 'pass_through',
      result: { approved: false, release: false, silent: false, action: 'allow' },
    };
  };
}

index.__setTestDoubles({
  icRequest(method, url, data, tag) {
    const payload = {
      method: String(method || ''),
      url: String(url || ''),
      tag: String(tag || ''),
      data: data == null ? null : JSON.parse(JSON.stringify(data)),
    };
    recorded.push(payload);
    return Promise.resolve({ ok: true, status: 200, data: { id: 'rec-' + recorded.length, type: 'admin' } });
  },
  fetchConversation() {
    return Promise.resolve(currentConv);
  },
});

function buildConv(row) {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: row.id + '-user',
    part_type: 'comment',
    created_at: now - 90,
    author: { type: 'user', id: 'user-' + row.id, name: 'Review Client', email: 'review.client@example.com' },
    body: row.client || 'Hello',
  };
  const prior = {
    id: row.id + '-prior',
    part_type: 'comment',
    created_at: now - 5000,
    author: { type: 'admin', id: '10118526', name: 'Arsal' },
    body: 'Hello, how can I help?',
  };
  const parts = [];
  if (row.setup === 'human') {
    parts.push({
      id: row.id + '-human',
      part_type: 'comment',
      created_at: now - 6000,
      author: { type: 'admin', id: '5550001', name: 'Sam' },
      body: 'We already handled this and it is resolved.',
    });
    user.body = 'thanks';
    user.created_at = now - 40;
    parts.push(user);
  } else if (row.setup === 'already') {
    parts.push(user);
    parts.push({
      id: row.id + '-after',
      part_type: 'comment',
      created_at: now - 20,
      author: { type: 'admin', id: '10118526', name: 'Arsal' },
      body: 'Hello, how can I help?',
    });
  } else if (row.path === 'owner') {
    parts.push(prior);
    if (row.client) parts.push(user);
    parts.push({
      id: row.id + '-note',
      part_type: 'note',
      created_at: now - 5,
      author: { type: 'admin', id: '10118526', name: 'Arsal' },
      body: '@Arsal REPLY: ' + (row.model || ''),
    });
  } else {
    parts.push(prior);
    parts.push(user);
  }
  return {
    id: row.id,
    created_at: now - 86400,
    updated_at: now - 30,
    state: 'open',
    open: true,
    team_assignee_id: 0,
    admin_assignee_id: '10118526',
    source: {
      body: user.body,
      author: { type: 'user', id: 'user-' + row.id, name: 'Review Client', email: 'review.client@example.com' },
    },
    contacts: { contacts: [{ id: 'c-' + row.id, name: 'Review Client', email: 'review.client@example.com' }] },
    conversation_parts: { type: 'conversation_part.list', conversation_parts: parts },
  };
}

function resMock() {
  return {
    statusCode: 0,
    sendStatus(code) {
      this.statusCode = code;
      return this;
    },
  };
}

const interesting = /SKIP|PAYOUT|EMPTY|FIN_|WEBHOOK|POSTGATE|AI_ACTION|PRESEND|ESCALATE|AUTH_NOTE|OWNER|TRIPWIRE|defer|handoff/i;

async function runOne(row) {
  recorded.length = 0;
  const tripsBefore = tripwireHits.length;
  modelCalls = 0;
  const logs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => {
    const line = args.map((x) => (typeof x === 'string' ? x : '')).join(' ');
    if (interesting.test(line) && logs.length < 25) logs.push(line.slice(0, 400));
  };
  console.error = (...args) => {
    const line = args.map((x) => (typeof x === 'string' ? x : (x && x.message) || '')).join(' ');
    if (logs.length < 25) logs.push('ERR ' + line.slice(0, 400));
  };
  try {
    if (row.setup === 'pause') writeControl({ paused: true });
    else if (row.setup === 'aioff') writeControl({ aiOff: { [row.id]: true } });
    else writeControl();
    if (row.setup === 'defer') {
      const now = Math.floor(Date.now() / 1000);
      fs.writeFileSync(ticketFile, JSON.stringify({
        [row.id]: {
          escalateAwaitingFirstTeammate: true,
          lastEscalateAt: now - 300,
          lastEscalateProblem: 'The login button on the dashboard is grey and the password field is blank.',
          lastEscalateTopic: 'login',
          lastEscalateNoteSnippet: 'login button grey password field blank',
          authNotesBootstrapped: true,
          handledAuthNoteIds: [],
        },
      }));
    } else {
      fs.writeFileSync(ticketFile, '{}');
    }
    currentConv = buildConv(row);
    currentModel = row.setup === 'empty' || !row.model
      ? 'ACTION: REPLY\nBODY:\n'
      : 'ACTION: REPLY\nBODY:\n' + row.model;
    const topic = row.path === 'owner'
      ? 'conversation.admin.noted'
      : (row.setup === 'fin' ? 'conversation.user.created' : 'conversation.user.replied');
    const req = { body: { topic, data: { item: currentConv } } };
    const res = resMock();
    await Promise.race([
      index.handleWebhook(req, res),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000)),
    ]);
    const comments = recorded
      .filter((p) => p.data && p.data.message_type === 'comment')
      .map((p) => p.data.body);
    return {
      id: row.id,
      cls: row.cls,
      lang: row.lang,
      topic: row.topic,
      expect: row.expect,
      path: row.path,
      setup: row.setup,
      statusCode: res.statusCode,
      comments,
      payloads: recorded.map((p) => ({ method: p.method, url: p.url, tag: p.tag, data: p.data })),
      modelCalls,
      tripwires: tripwireHits.slice(tripsBefore),
      logs,
      error: '',
    };
  } catch (err) {
    return {
      id: row.id,
      cls: row.cls,
      lang: row.lang,
      topic: row.topic,
      expect: row.expect,
      path: row.path,
      setup: row.setup,
      statusCode: 0,
      comments: recorded.filter((p) => p.data && p.data.message_type === 'comment').map((p) => p.data.body),
      payloads: recorded.map((p) => ({ method: p.method, url: p.url, tag: p.tag, data: p.data })),
      modelCalls,
      tripwires: tripwireHits.slice(tripsBefore),
      logs,
      error: (err && err.message) || String(err),
    };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

(async () => {
  const out = [];
  const started = Date.now();
  for (let i = 0; i < cases.length; i++) {
    const row = await runOne(cases[i]);
    out.push(row);
    if ((i + 1) % 100 === 0) {
      console.error(MODE, i + 1, '/', cases.length, 'ms', Date.now() - started);
    }
  }
  fs.writeFileSync(RESULT_PATH, JSON.stringify({
    mode: MODE,
    seal: digest,
    count: out.length,
    tripwireTotal: tripwireHits.length,
    results: out,
  }));
  console.error(MODE, 'done', out.length, 'ms', Date.now() - started, 'tripwires', tripwireHits.length);
})().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
