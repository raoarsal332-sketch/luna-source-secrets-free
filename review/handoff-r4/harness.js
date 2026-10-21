'use strict';

/**
 * Isolated recording transport for the real handleWebhook.
 * Axios and OpenAI are replaced before index.js loads. Nothing here opens a
 * socket, and every token is synthetic.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = process.env.LUNA_R4_ISOLATION_DIR || '/tmp/luna-r4-indep';
fs.mkdirSync(ROOT, { recursive: true });

const PATHS = {
  control: path.join(ROOT, 'control.json'),
  prompt: path.join(ROOT, 'prompt.txt'),
  tickets: path.join(ROOT, 'ticket-state.json'),
  ops: path.join(ROOT, 'write-ops.json'),
  mention: path.join(ROOT, 'mention-rotate.json'),
};

process.env.LUNA_CONTROL_STATE_FILE = PATHS.control;
process.env.LUNA_PROMPT_FILE = PATHS.prompt;
process.env.TICKET_STATE_FILE = PATHS.tickets;
process.env.LUNA_OP_STORE_FILE = PATHS.ops;
process.env.MENTION_ROTATE_FILE = PATHS.mention;
process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-intercom-token';
process.env.OPENAI_API_KEY = 'synthetic-openai-key';
process.env.CONTROL_SECRET = 'synthetic-control-secret';
process.env.LUNA_TOOLS_ENABLED = '0';
process.env.MAINTAINER_ENABLED = 'false';

fs.writeFileSync(
  PATHS.control,
  JSON.stringify({
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: ['Bot test'],
    testAllowConversationIds: [],
    config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
  })
);
fs.writeFileSync(PATHS.prompt, 'Synthetic review prompt. Do not invent promises.\n');
fs.writeFileSync(PATHS.tickets, '{}\n');
fs.writeFileSync(PATHS.ops, '{}\n');
fs.writeFileSync(PATHS.mention, JSON.stringify({ recent: [] }));

const ARSAL_ID = '10118526';
const ELITE_AI_ID = '8052954';
const TEAMMATE_ID = '424242';
const HUMAN_ID = '555001';
const OTHER_ID = '777002';
const RISK_TEAM_ID = '10675195';
const ESCALATIONS_TEAM_ID = '9629759';

const FIXED = Object.freeze({
  en: 'A teammate now has this conversation.',
  ur: 'یہ گفتگو اب ایک ساتھی کے پاس ہے۔',
  ar: 'هذه المحادثة الآن لدى أحد الزملاء.',
  hi: 'यह बातचीत अब एक साथी के पास है।',
  it: 'Un collega ha ora questa conversazione.',
});

const PROMISE_RE =
  /\b(i('|’)ll|i will|we will|we'll|will reply|will update|will get back|will follow up|hang tight|already been informed|within \d|shortly|as soon as|guarantee|promised)\b/i;

const world = {
  calls: [],
  prompts: [],
  conv: null,
  noteMode: 'ok',
  assignMode: 'ok',
  messageMode: 'ok',
  modelReplies: [],
  modelIndex: 0,
  logs: [],
};

function scriptedHttp(mode, kind) {
  if (mode === 'timeout') {
    const err = new Error('timeout of 20000ms exceeded');
    err.code = 'ECONNABORTED';
    throw err;
  }
  if (mode === '500') {
    return { status: 500, data: { type: 'error', errors: [{ code: 'server_error', message: 'synthetic 500' }] } };
  }
  if (mode === '422') {
    return { status: 422, data: { type: 'error', errors: [{ code: 'unprocessable', message: 'synthetic 422' }] } };
  }
  if (mode === 'partial') {
    return {
      status: 200,
      data: { id: 'synthetic-' + kind, type: 'conversation', errors: [{ code: 'partial_apply', message: 'synthetic partial' }] },
    };
  }
  return { status: 200, data: { id: 'synthetic-' + kind, type: 'conversation' } };
}

async function axiosImpl(config) {
  const cfg = config || {};
  const method = String(cfg.method || 'get').toLowerCase();
  const url = String(cfg.url || '');
  const data = cfg.data;
  const auth = cfg.headers && (cfg.headers.Authorization || cfg.headers.authorization);
  world.calls.push({ method, url, data, auth: auth || '' });
  if (url.includes('/admins')) {
    return {
      status: 200,
      data: {
        admins: [
          {
            id: TEAMMATE_ID,
            name: 'Sam Reviewer',
            email: 'sam.reviewer@example.test',
            away_mode_enabled: false,
            has_inbox_seat: true,
            team_ids: [9629780],
          },
        ],
      },
    };
  }
  if (method === 'get' && /\/conversations\//.test(url)) {
    return { status: 200, data: world.conv };
  }
  if (method === 'post' && /\/reply$/.test(url)) {
    const mt = data && data.message_type;
    if (mt === 'note') return scriptedHttp(world.noteMode, 'note');
    if (mt === 'assignment') return scriptedHttp(world.assignMode, 'assignment');
    if (mt === 'comment') return scriptedHttp(world.messageMode, 'comment');
    if (mt === 'close' || mt === 'open') return scriptedHttp('ok', mt);
  }
  if (/faq\.fundedelite\.com|api\.intercom\.io\/conversations\/search|fundedelite\.com/.test(url)) {
    return { status: 404, data: '' };
  }
  return { status: 404, data: { id: 'blocked', type: 'error', errors: [{ code: 'synthetic_block' }] } };
}
axiosImpl.get = (url, cfg) => axiosImpl(Object.assign({}, cfg, { method: 'get', url }));
axiosImpl.post = (url, data, cfg) => axiosImpl(Object.assign({}, cfg, { method: 'post', url, data }));
axiosImpl.put = axiosImpl.post;
axiosImpl.delete = (url, cfg) => axiosImpl(Object.assign({}, cfg, { method: 'delete', url }));
axiosImpl.create = () => axiosImpl;
axiosImpl.defaults = {};
axiosImpl.interceptors = { request: { use() {} }, response: { use() {} } };

class SyntheticOpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (req) => {
          world.prompts.push(req);
          const content =
            world.modelReplies[Math.min(world.modelIndex, Math.max(world.modelReplies.length - 1, 0))] ||
            'ACTION: REPLY\nBODY: Noted.';
          world.modelIndex += 1;
          return { choices: [{ message: { content } }] };
        },
      },
    };
  }
}

const RUNTIME_DIR = '/workspace/luna-current/01_runtime';
const PRESEND_DIR = '/workspace/luna-current/02_statePresend';
const PRESEND_FROM_RUNTIME = new Set([
  './statePresend/statePresend',
  './statePresend/textUtils',
  './statePresend/credentialSanitizer',
]);
const RUNTIME_FROM_PRESEND = new Set([
  '../repeatedClientQuestion',
  '../assistantIdentityGuard',
  '../imageAskGuard',
  '../spreadAskGate',
]);

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'axios') return axiosImpl;
  if (id === 'openai') return SyntheticOpenAI;
  const parentFile = this && this.filename ? this.filename : '';
  if (PRESEND_FROM_RUNTIME.has(id) && parentFile.startsWith(RUNTIME_DIR)) {
    return origRequire.call(this, path.join(PRESEND_DIR, id.slice('./statePresend/'.length)));
  }
  if (RUNTIME_FROM_PRESEND.has(id) && parentFile.startsWith(PRESEND_DIR)) {
    return origRequire.call(this, path.join(RUNTIME_DIR, id.slice(3)));
  }
  return origRequire.apply(this, arguments);
};

const origLog = console.log;
const origErr = console.error;
function muteConsole() {
  console.log = (...args) => {
    world.logs.push(args.map(String).join(' '));
  };
  console.error = (...args) => {
    world.logs.push('ERR ' + args.map(String).join(' '));
  };
}
muteConsole();
const engine = require(path.join(RUNTIME_DIR, 'index.js'));

function resetWorld() {
  world.calls = [];
  world.prompts = [];
  world.logs = [];
  world.noteMode = 'ok';
  world.assignMode = 'ok';
  world.messageMode = 'ok';
  world.modelReplies = [];
  world.modelIndex = 0;
  fs.writeFileSync(PATHS.tickets, '{}\n');
  fs.writeFileSync(PATHS.ops, '{}\n');
  fs.writeFileSync(PATHS.mention, JSON.stringify({ recent: [] }));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function wipeTickets() {
  fs.writeFileSync(PATHS.tickets, '{}\n');
}
function wipeOps() {
  fs.writeFileSync(PATHS.ops, '{}\n');
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function replyPosts() {
  return world.calls.filter((c) => c.method === 'post' && /\/reply$/.test(c.url));
}

function postsOf(type) {
  return replyPosts().filter((c) => c.data && c.data.message_type === type);
}

function customerBodies() {
  return postsOf('comment').map((c) => stripHtml(c.data.body));
}

function noteBodies() {
  return postsOf('note').map((c) => String(c.data.body || ''));
}

function fixedHits(bodies) {
  const values = Object.values(FIXED);
  return (bodies || customerBodies()).filter((b) => values.includes(b));
}

function blobAll() {
  const notes = noteBodies().join('\n');
  const comments = postsOf('comment').map((c) => String(c.data.body || '')).join('\n');
  const prompts = world.prompts
    .map((p) => (p.messages || []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n'))
    .join('\n');
  return { notes, comments, prompts, all: notes + '\n' + comments + '\n' + prompts };
}

function ticketState(conversationId) {
  const all = readJson(PATHS.tickets) || {};
  return all[String(conversationId)] || null;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function userPart(id, body, at) {
  return {
    id: id,
    part_type: 'comment',
    body: body,
    author: { type: 'user', id: 'user-synthetic', name: 'Synthetic Client' },
    created_at: at,
  };
}

function makeConv(opts) {
  const o = opts || {};
  const created = o.createdAt || nowSec() - 400;
  const parts = (o.parts || []).slice();
  const latest = o.latest || 'hello';
  const latestAt = o.latestAt || created + 20;
  const latestId = o.latestId || 'part-latest';
  if (!o.omitLatest) parts.push(userPart(latestId, latest, latestAt));
  const conv = {
    type: 'conversation',
    id: String(o.id),
    created_at: created,
    updated_at: latestAt,
    admin_assignee_id: o.assigneeId != null ? o.assigneeId : ARSAL_ID,
    team_assignee_id: o.teamId != null ? o.teamId : '0',
    team_assignee: o.teamName ? { name: o.teamName } : null,
    contacts: {
      contacts: [{ type: 'contact', id: 'user-synthetic', name: 'Synthetic Client', email: 'synthetic.client@example.test' }],
    },
    source: {
      type: 'conversation',
      id: 'source-' + o.id,
      body: o.sourceBody != null ? o.sourceBody : latest,
      created_at: created,
      author: { type: 'user', id: 'user-synthetic', name: 'Synthetic Client' },
    },
    conversation_parts: { type: 'conversation_part.list', conversation_parts: parts },
  };
  if (o.assigneeObj) conv.assignee = o.assigneeObj;
  return conv;
}

function resStub() {
  return {
    statusCode: 200,
    sendStatus(code) {
      this.statusCode = code;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
    send() {
      return this;
    },
  };
}

async function postWebhook(conv) {
  world.conv = conv;
  const res = resStub();
  await engine.handleWebhook(
    { body: { topic: 'conversation.user.replied', data: { item: { id: conv.id, type: 'conversation' } } } },
    res
  );
  return res;
}

function seedTicket(conversationId, state) {
  const all = readJson(PATHS.tickets) || {};
  all[String(conversationId)] = state;
  fs.writeFileSync(PATHS.tickets, JSON.stringify(all));
}

function containsCanary(text, canaries) {
  const s = String(text || '');
  return (canaries || []).filter((c) => c && s.includes(c));
}

module.exports = {
  PATHS,
  ARSAL_ID,
  ELITE_AI_ID,
  TEAMMATE_ID,
  HUMAN_ID,
  OTHER_ID,
  RISK_TEAM_ID,
  ESCALATIONS_TEAM_ID,
  FIXED,
  PROMISE_RE,
  world,
  resetWorld,
  wipeTickets,
  wipeOps,
  stripHtml,
  replyPosts,
  postsOf,
  customerBodies,
  noteBodies,
  fixedHits,
  blobAll,
  ticketState,
  readJson,
  makeConv,
  userPart,
  postWebhook,
  seedTicket,
  containsCanary,
  nowSec,
  engine,
  origLog,
};
