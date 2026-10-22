'use strict';

// One sealed case, one process. Loads the real handleWebhook behind a recording
// transport, a stub model, and a network tripwire. Prints one JSON object.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : '';
}

const casePath = arg('--case');
const runtimeIndex = arg('--runtime');
const stateDir = arg('--state');
const spec = JSON.parse(fs.readFileSync(casePath, 'utf8'));

fs.mkdirSync(stateDir, { recursive: true });

const controlFile = path.join(stateDir, 'control.json');
const promptFile = path.join(path.dirname(runtimeIndex), 'system-prompt.txt');
const faqFile = path.join(path.dirname(runtimeIndex), 'fundedelite-faqs.md');

const control = {
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Bot test'],
  testAllowConversationIds: [],
  config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
};
fs.writeFileSync(controlFile, JSON.stringify(control));
fs.writeFileSync(path.join(stateDir, 'tickets.json'), '{}');
fs.writeFileSync(path.join(stateDir, 'ops.json'), '{}');
fs.writeFileSync(path.join(stateDir, 'mentions.json'), JSON.stringify({ recent: [] }));
fs.writeFileSync(path.join(stateDir, 'image.json'), '{}');

process.env.LUNA_CONTROL_STATE_FILE = controlFile;
process.env.LUNA_PROMPT_FILE = promptFile;
process.env.LUNA_OP_STORE_FILE = path.join(stateDir, 'ops.json');
process.env.TICKET_STATE_FILE = path.join(stateDir, 'tickets.json');
process.env.MENTION_ROTATE_FILE = path.join(stateDir, 'mentions.json');
process.env.IMAGE_GUARD_STATE_FILE = path.join(stateDir, 'image.json');
process.env.FUNDEDELITE_FAQ_PATH = faqFile;
process.env.LUNA_ROOT = path.dirname(runtimeIndex);
process.env.MAINTAINER_ENABLED = 'false';
process.env.MAINTAINER_DATA_DIR = path.join(stateDir, 'maintainer');
process.env.LUNA_TOOLS_ENABLED = '0';
process.env.OPENAI_API_KEY = 'synthetic-review-token';
process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-review-token';
process.env.CONTROL_SECRET = 'synthetic-review-token';
process.env.LUNA_PRESEND_MODE = 'enforce';

const tripwire = [];
const calls = [];
const modelPrompts = [];
let currentDraft = '';
let conv = null;
const SEAT = '7007001';
const BOT = '10118526';

function blocked(why) {
  const err = new Error('NETWORK_TRIPWIRE ' + why);
  tripwire.push(String(why));
  throw err;
}

global.fetch = () => blocked('fetch');
for (const name of ['http', 'https']) {
  const m = require(name);
  m.request = () => blocked(name + '.request');
  m.get = () => blocked(name + '.get');
}
const net = require('net');
net.connect = () => blocked('net.connect');
net.createConnection = () => blocked('net.createConnection');
const dns = require('dns');
dns.lookup = (_h, cb) => {
  const err = new Error('NETWORK_TRIPWIRE dns.lookup');
  tripwire.push('dns.lookup');
  if (typeof cb === 'function') cb(err);
  else throw err;
};
dns.resolve = () => blocked('dns.resolve');

function allowUrl(url) {
  const u = String(url || '');
  if (u.startsWith('https://api.intercom.io/admins')) return true;
  if (u.startsWith('https://api.intercom.io/conversations/')) return true;
  if (u.startsWith('https://faq.fundedelite.com/')) return true;
  return false;
}

function publicConv() {
  return {
    id: conv.id,
    type: conv.type,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    admin_assignee_id: conv.admin_assignee_id,
    team_assignee_id: conv.team_assignee_id,
    state: conv.state,
    source: conv.source,
    contacts: conv.contacts,
    conversation_parts: {
      conversation_parts: conv.conversation_parts.conversation_parts.slice(),
    },
  };
}

function respond(config) {
  const method = String(config.method || 'get').toLowerCase();
  const url = String(config.url || '');
  if (!allowUrl(url)) blocked(url);
  if (url.startsWith('https://faq.fundedelite.com/')) {
    const response = { status: 200, data: 'short' };
    calls.push({ method, url, data: null, status: 200, response: 'short' });
    return response;
  }
  if (url.startsWith('https://api.intercom.io/admins')) {
    const response = {
      status: 200,
      data: {
        admins: [
          {
            id: SEAT,
            name: 'Synthetic Seat',
            email: 'synthetic.seat@example.com',
            away_mode_enabled: false,
            has_inbox_seat: true,
            team_ids: [9629780],
          },
        ],
      },
    };
    calls.push({ method, url, data: null, status: 200, response: { admins: 1 } });
    return response;
  }
  if (method === 'get') {
    const response = { status: 200, data: publicConv() };
    calls.push({ method, url, data: null, status: 200, response: { id: conv && conv.id, assignee: conv && conv.admin_assignee_id } });
    return response;
  }
  const data = config.data || {};
  const kind = String(data.message_type || '');
  const script = (conv && conv.__script) || {};
  const mode = script[kind] || 'ok';
  const record = { method, url, data, status: 0, response: null };
  calls.push(record);

  if (mode === 'timeout') {
    const err = new Error('timeout of 20000ms exceeded');
    err.code = 'ECONNABORTED';
    record.status = 0;
    record.response = { timeout: true };
    throw err;
  }
  if (mode === '500' || mode === '422' || mode === '429') {
    const status = Number(mode);
    record.status = status;
    record.response = { type: 'error.list', errors: [{ code: 'synthetic', message: mode }] };
    return { status, data: record.response };
  }
  if (mode === 'malformed') {
    record.status = 200;
    record.response = {};
    return { status: 200, data: {} };
  }
  if (mode === 'error-list') {
    const body = { id: 'err-1', type: 'error.list', errors: [{ code: 'synthetic', message: 'error-list' }] };
    record.status = 200;
    record.response = body;
    return { status: 200, data: body };
  }
  if (mode === 'wrong-seat') {
    const body = { id: conv.id, type: 'conversation', admin_assignee_id: 999001 };
    record.status = 200;
    record.response = body;
    return { status: 200, data: body };
  }
  if (mode === 'confirm-but-bot') {
    const body = { id: conv.id, type: 'conversation', admin_assignee_id: Number(SEAT) };
    record.status = 200;
    record.response = body;
    return { status: 200, data: body };
  }

  if (kind === 'note') {
    conv.conversation_parts.conversation_parts.push({
      id: 'note-' + conv.conversation_parts.conversation_parts.length,
      part_type: 'note',
      body: String(data.body || ''),
      created_at: nextAt(),
      author: { type: 'admin', id: BOT, name: 'Arsal' },
    });
  } else if (kind === 'assignment') {
    conv.admin_assignee_id = SEAT;
    conv.conversation_parts.conversation_parts.push({
      id: 'asg-' + conv.conversation_parts.conversation_parts.length,
      part_type: 'assignment',
      body: '',
      created_at: nextAt(),
      author: { type: 'admin', id: BOT, name: 'Arsal' },
      assigned_to: { type: 'admin', id: SEAT },
    });
  } else if (kind === 'comment') {
    conv.conversation_parts.conversation_parts.push({
      id: 'cmt-' + conv.conversation_parts.conversation_parts.length,
      part_type: 'comment',
      body: String(data.body || ''),
      created_at: nextAt(),
      author: { type: 'admin', id: BOT, name: 'Arsal' },
    });
  }
  const body = { id: conv.id, type: 'conversation', admin_assignee_id: Number(conv.admin_assignee_id || 0) };
  if (kind === 'assignment') body.admin_assignee_id = Number(data.assignee_id);
  record.status = 200;
  record.response = body;
  record.landed = kind === 'assignment';
  record.posted = kind === 'comment' || kind === 'note';
  return { status: 200, data: body };
}

function axios(config) {
  return Promise.resolve().then(() => respond(config || {}));
}
axios.get = (url, opts) => axios(Object.assign({ method: 'get', url }, opts || {}));
axios.post = (url, data, opts) => axios(Object.assign({ method: 'post', url, data }, opts || {}));
axios.request = axios;
axios.create = () => axios;

class OpenAI {
  constructor() {
    this.chat = { completions: { create: (req) => modelCreate(req) } };
  }
}
function modelCreate(req) {
  const messages = (req && req.messages) || [];
  const blob = messages.map((m) => String((m && m.content) || '')).join('\n');
  modelPrompts.push(blob);
  if (/Rewrite the following INTERNAL/i.test(blob)) {
    return Promise.resolve({
      choices: [{ message: { content: 'The customer asked for help with this conversation.' } }],
    });
  }
  const draft = currentDraft == null ? '' : String(currentDraft);
  const content = draft ? 'ACTION: REPLY\nBODY: ' + draft : '';
  return Promise.resolve({ choices: [{ message: { content } }] });
}

function express() {
  const app = {
    use() { return app; },
    get() { return app; },
    post() { return app; },
    listen() { blocked('express.listen'); },
  };
  return app;
}
express.json = () => (req, res, next) => { if (typeof next === 'function') next(); };
express.urlencoded = express.json;

const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'axios') return axios;
  if (name === 'openai') return OpenAI;
  if (name === 'express') return express;
  if (name === 'dotenv') return { config: () => ({ parsed: {} }) };
  return realLoad.apply(this, arguments);
};

console.log = () => {};
console.info = () => {};
console.warn = () => {};
console.error = () => {};

const runtime = require(runtimeIndex);
const handleWebhook = runtime.handleWebhook;

let clock = Math.floor(Date.now() / 1000) - 50;
function nextAt() {
  clock += 1;
  return clock;
}

function baseConv(id, createdAt) {
  return {
    id,
    type: 'conversation',
    created_at: createdAt,
    updated_at: createdAt,
    admin_assignee_id: BOT,
    team_assignee_id: '0',
    state: 'open',
    source: {
      body: '',
      author: { type: 'user', id: 'u1', name: 'Synthetic Client' },
      created_at: createdAt,
    },
    contacts: {
      contacts: [{ id: 'u1', name: 'Synthetic Client', email: 'synthetic.client@example.com' }],
    },
    conversation_parts: { conversation_parts: [] },
    __script: { note: 'ok', assign: 'ok', comment: 'ok' },
  };
}

function userPart(text, id) {
  return {
    id: id || 'u' + nextAt(),
    part_type: 'comment',
    body: text,
    created_at: nextAt(),
    author: { type: 'user', id: 'u1', name: 'Synthetic Client' },
  };
}

function applyScript(turn) {
  conv.__script = {
    note: turn.note || 'ok',
    assign: turn.assign || 'ok',
    comment: turn.comment || 'ok',
  };
}

function applyBefore(turn) {
  const before = turn.before || [];
  if (before.indexOf('human-comment') >= 0) {
    conv.conversation_parts.conversation_parts.push({
      id: 'human-' + nextAt(),
      part_type: 'comment',
      body: 'I am handling this now.',
      created_at: nextAt(),
      author: { type: 'admin', id: SEAT, name: 'Synthetic Seat' },
    });
  }
}

function applyAfter(turn) {
  const after = turn.after || [];
  if (after.indexOf('drop-notes') >= 0) {
    conv.conversation_parts.conversation_parts = conv.conversation_parts.conversation_parts.filter(
      (p) => p.part_type !== 'note'
    );
  }
  if (after.indexOf('wipe-op') >= 0 || after.indexOf('wipe-both') >= 0) {
    fs.writeFileSync(process.env.LUNA_OP_STORE_FILE, '{}');
  }
  if (after.indexOf('wipe-state') >= 0 || after.indexOf('wipe-both') >= 0) {
    fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}');
  }
  if (after.indexOf('stay-bot') >= 0) {
    conv.admin_assignee_id = BOT;
  }
}

function resMock() {
  return {
    statusCode: 0,
    sendStatus(code) { this.statusCode = code; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

async function post(topic) {
  const res = resMock();
  await handleWebhook({
    body: { topic, data: { item: { id: conv.id, type: 'conversation' } } },
    headers: {},
    get() { return ''; },
  }, res);
  return res.statusCode;
}

async function main() {
  const turns = spec.turns && spec.turns.length ? spec.turns : [spec];
  const now = Math.floor(Date.now() / 1000);
  const first = turns[0];
  const surface = first.surface || spec.surface || 'later';
  const id = 'c' + String(spec.n || 1);
  if (surface === 'fin-wait') conv = baseConv(id, now);
  else conv = baseConv(id, now - 10000);
  if (spec.assignee) conv.admin_assignee_id = String(spec.assignee);

  if (spec.paused) {
    control.paused = true;
    fs.writeFileSync(controlFile, JSON.stringify(control));
  }

  if (spec.ownerNote) {
    conv.conversation_parts.conversation_parts.push(spec.ownerNote);
    conv.source.body = '';
    await post('conversation.admin.noted');
  } else {
    for (let i = 0; i < turns.length; i += 1) {
      const turn = turns[i];
      applyBefore(turn);
      applyScript(turn);
      currentDraft = turn.model == null ? (spec.model == null ? 'I can help with that.' : spec.model) : turn.model;
      const replay = (turn.before || []).indexOf('replay') >= 0;
      if (!replay) {
        const text = turn.text == null ? '' : String(turn.text);
        if (i === 0 && surface === 'fin-wait') {
          conv.source.body = text;
          conv.source.created_at = now;
          conv.conversation_parts.conversation_parts = [];
        } else {
          if (i === 0 && surface === 'later') {
            conv.conversation_parts.conversation_parts.push({
              id: 'b0',
              part_type: 'comment',
              body: 'Hello, how can I help you today?',
              created_at: now - 800,
              author: { type: 'admin', id: BOT, name: 'Arsal' },
            });
          }
          conv.conversation_parts.conversation_parts.push(userPart(text, 'u' + (i + 1)));
          if (i === 0) conv.source.body = text;
        }
      }
      const topic = i === 0 && surface === 'fin-wait' ? 'conversation.user.created' : 'conversation.user.replied';
      await post(topic);
      applyAfter(turn);
    }
  }

  process.stdout.write(JSON.stringify({
    id: spec.id,
    calls,
    modelPrompts,
    tripwire,
    error: null,
  }));
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({
    id: spec.id,
    calls,
    modelPrompts,
    tripwire,
    error: String(err && err.stack || err),
  }));
  process.exit(0);
});
