'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tmp = os.tmpdir();
const pid = process.pid;
const axiosMock = path.join(tmp, 'luna-r20-axios-' + pid + '.js');
const openaiMock = path.join(tmp, 'luna-r20-openai-' + pid + '.js');
const expressMock = path.join(tmp, 'luna-r20-express-' + pid + '.js');
const dotenvMock = path.join(tmp, 'luna-r20-dotenv-' + pid + '.js');
const stateDir = path.join(tmp, 'luna-r20-state-' + pid);
fs.mkdirSync(stateDir, { recursive: true });

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

const RUNTIME = path.join(__dirname, '../../01_runtime');
const PRESEND = path.join(__dirname, '../../02_statePresend');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'axios') return axiosMock;
  if (request === 'openai') return openaiMock;
  if (request === 'express') return expressMock;
  if (request === 'dotenv') return dotenvMock;
  if (request === './statePresend/statePresend' || request === './statePresend/statePresend.js') {
    return path.join(PRESEND, 'statePresend.js');
  }
  if (request === './statePresend/textUtils' || request === './statePresend/textUtils.js') {
    return path.join(PRESEND, 'textUtils.js');
  }
  if (typeof request === 'string' && request.indexOf('statePresend/') !== -1) {
    const base = request.split('statePresend/').pop();
    const file = base.endsWith('.js') ? base : base + '.js';
    const candidate = path.join(PRESEND, file);
    if (fs.existsSync(candidate)) return candidate;
  }
  if (typeof request === 'string' && request.startsWith('../') && parent && parent.filename && parent.filename.includes('02_statePresend')) {
    const rel = request.replace(/^\.\.\//, '');
    const candidate = path.join(RUNTIME, rel.endsWith('.js') ? rel : rel + '.js');
    if (fs.existsSync(candidate)) return candidate;
  }
  return resolveFilename.call(this, request, parent, isMain, options);
};

const controlFile = path.join(stateDir, 'control.json');
fs.writeFileSync(controlFile, JSON.stringify({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Bot test'],
  testAllowConversationIds: [],
  config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
}));
process.env.LUNA_CONTROL_STATE_FILE = controlFile;
process.env.LUNA_OP_STORE_FILE = path.join(stateDir, 'ops.json');
process.env.TICKET_STATE_FILE = path.join(stateDir, 'tickets.json');
process.env.MENTION_ROTATE_FILE = path.join(stateDir, 'mentions.json');
process.env.IMAGE_GUARD_STATE_FILE = path.join(stateDir, 'image.json');
process.env.LUNA_PROMPT_FILE = path.join(RUNTIME, 'system-prompt.txt');
process.env.FUNDEDELITE_FAQ_PATH = path.join(RUNTIME, 'fundedelite-faqs.md');
process.env.OPENAI_API_KEY = 'r20-webhook';
process.env.MAINTAINER_ENABLED = 'false';

const calls = [];
let current = null;
let liveAssignee = '';
global.__lunaReply = 'ACTION: REPLY\nOK';
global.__lunaFailComment = '';
global.__lunaSeenPrompt = '';
global.__lunaModel = function (req) {
  const messages = (req && req.messages) || [];
  const sys = String((messages.find((m) => m.role === 'system') || {}).content || '');
  const user = String((messages.find((m) => m.role === 'user') || {}).content || '');
  global.__lunaSeenPrompt = user;
  if (/INTERNAL Intercom note/i.test(sys)) {
    return Promise.resolve({ choices: [{ message: { content: user.replace(/^\[[^\]]+\]\n/, '') } }] });
  }
  return Promise.resolve({ choices: [{ message: { content: global.__lunaReply } }] });
};
global.__lunaAxios = function (cfg) {
  const method = String((cfg && cfg.method) || 'get').toLowerCase();
  const url = String((cfg && cfg.url) || '');
  const data = cfg && cfg.data;
  calls.push({ method, url, data });
  if (url.includes('/admins')) {
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
  if (method === 'get' && url.includes('/conversations/')) {
    const copy = JSON.parse(JSON.stringify(current));
    if (liveAssignee) copy.admin_assignee_id = liveAssignee;
    return Promise.resolve({ status: 200, data: copy });
  }
  if (data && data.message_type === 'comment' && global.__lunaFailComment) {
    const fail = global.__lunaFailComment;
    global.__lunaFailComment = '';
    if (fail === 'timeout') return Promise.reject(new Error('timeout'));
    const status = Number(fail);
    return Promise.resolve({ status, data: { type: 'error.list', errors: [{ code: 'parameter_invalid', status }] } });
  }
  if (data && data.message_type === 'assignment') {
    liveAssignee = String(data.assignee_id);
    return Promise.resolve({ status: 200, data: { id: 'asg', type: 'conversation', admin_assignee_id: liveAssignee } });
  }
  return Promise.resolve({ status: 200, data: { id: 'w1', type: 'conversation' } });
};

const handoff = require(path.join(RUNTIME, 'fixedMessageHandoff'));
const index = require(path.join(RUNTIME, 'index'));
const store = require(path.join(RUNTIME, 'writeOpStore'));

const POLICY = 'Which part of the password policy should I explain?';
const NOISE = 'Zq8LatinNoise88ab';
const SECRET = 'SuperSecretValue99';
const ARSAL = '10118526';
const CASEY = '424242';

let seq = 0;
let passed = 0;
const tests = [];

function test(name, fn) {
  tests.push(async () => {
    await fn();
    passed += 1;
    console.log('PASS', name);
  });
}

function conv(id, text, opts) {
  const o = opts || {};
  const now = Math.floor(Date.now() / 1000);
  const name = o.name || 'Sam';
  const parts = (o.extraParts || []).slice();
  if (o.priorBot) {
    parts.push({
      id: id + '-bot',
      part_type: 'comment',
      body: 'Hello, how can I help?',
      created_at: now - 400,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    });
  }
  parts.push({
    id: id + '-user',
    part_type: 'comment',
    body: text,
    created_at: now - 5,
    author: { type: 'user', id: 'user-1', name },
  });
  return {
    id,
    created_at: now - (o.createdAgo == null ? 1000 : o.createdAgo),
    admin_assignee_id: o.assignee || '0',
    team_assignee_id: '0',
    source: { body: o.sourceBody || text, created_at: now - 30, author: { type: 'user', id: 'user-1', name } },
    contacts: { contacts: [{ name, email: 'sam@example.com', id: 'user-1' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function commentsOf() {
  return calls.filter((c) => c.data && c.data.message_type === 'comment').map((c) => c.data.body);
}
function notesOf() {
  return calls.filter((c) => c.data && c.data.message_type === 'note').map((c) => c.data.body);
}
function assignsOf() {
  return calls.filter((c) => c.data && c.data.message_type === 'assignment');
}

async function webhook(text, opts) {
  calls.length = 0;
  if (!opts || !opts.keepAssignee) liveAssignee = '';
  const id = (opts && opts.id) || ('r20-' + (++seq));
  current = conv(id, text, opts);
  const topic = (opts && opts.topic) || 'conversation.user.replied';
  const res = { status: 0, sendStatus(code) { this.status = code; return this; } };
  await index.handleWebhook({ body: { topic, data: { item: current } } }, res);
  return { id, status: res.status, comments: commentsOf(), notes: notesOf(), assigns: assignsOf() };
}

test('customer secrets are scrubbed before the model and on every public reply', async () => {
  global.__lunaReply = 'ACTION: REPLY\nTrading days are Monday through Friday. Ref ' + SECRET + ' ' + NOISE;
  global.__lunaSeenPrompt = '';
  const out = await webhook('what are the trading days? password: ' + SECRET + ' ' + NOISE);
  assert.strictEqual(global.__lunaSeenPrompt.includes(SECRET), false, global.__lunaSeenPrompt);
  assert.strictEqual(global.__lunaSeenPrompt.includes(NOISE), false, global.__lunaSeenPrompt);
  assert.strictEqual(out.comments.length, 1, JSON.stringify(out.comments));
  assert.strictEqual(out.comments[0].includes(SECRET), false, out.comments[0]);
  assert.strictEqual(out.comments[0].includes(NOISE), false, out.comments[0]);
  assert.strictEqual(out.comments[0].includes('[secret]'), true, out.comments[0]);
});

test('Latin roles inside Devanagari or Arabic script hand off in the script language', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const fresh = { topic: 'conversation.user.created', createdAgo: 5 };
  const arabic = await webhook('أريد human', fresh);
  assert.deepStrictEqual(arabic.comments, [handoff.FIXED_MESSAGES.ar], JSON.stringify(arabic.comments));
  for (const role of ['staff', 'banda', 'insaan', 'representative']) {
    const out = await webhook('मुझे ' + role + ' से बात करनी है', fresh);
    assert.deepStrictEqual(out.comments, [handoff.FIXED_MESSAGES.hi], role + ' ' + JSON.stringify(out.comments));
  }
  const support = await webhook('मुझे support person से बात करनी है', fresh);
  assert.deepStrictEqual(support.comments, [handoff.FIXED_MESSAGES.hi], JSON.stringify(support.comments));
  const urdu = await webhook('مجھے staff چاہیے', fresh);
  assert.deepStrictEqual(urdu.comments, [handoff.FIXED_MESSAGES.ur], JSON.stringify(urdu.comments));
  const human = await webhook('please get me a human password: hunter2', fresh);
  assert.deepStrictEqual(human.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(human.comments));
  assert.strictEqual(JSON.stringify(human.comments).includes('hunter2'), false);
  assert.strictEqual(human.notes.join('\n').includes('hunter2'), false, human.notes.join('\n'));
});

test('a rejected comment and a removed note still posts the owed line from the op store', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  for (const reason of ['422', '500', 'timeout']) {
    const id = 'r20-recover-' + reason;
    global.__lunaFailComment = reason;
    liveAssignee = '';
    const first = await webhook('please get me a human', {
      id,
      topic: 'conversation.user.created',
      createdAgo: 5,
      keepAssignee: true,
    });
    assert.strictEqual(first.comments.length, 1, reason + ' first ' + JSON.stringify(first.comments));
    assert.ok(store.latestOwedFixedLine(id, ARSAL), reason + ' owed missing');
    assert.strictEqual(store.latestOwedFixedLine(id, ARSAL).message, handoff.FIXED_MESSAGES.en, reason);
    const second = await webhook('just checking in', { id, keepAssignee: true });
    assert.deepStrictEqual(second.comments, [handoff.FIXED_MESSAGES.en], reason + ' ' + JSON.stringify(second.comments));
    assert.strictEqual(second.assigns.length, 0, reason + ' redid assignment');
    assert.strictEqual(second.notes.length, 0, reason + ' redid note');
  }
});

test('a wiped op store does not redo a handoff when our assignment part is present', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const id = 'r20-wiped';
  const now = Math.floor(Date.now() / 1000);
  liveAssignee = CASEY;
  const out = await webhook('any update?', {
    id,
    keepAssignee: true,
    assignee: CASEY,
    sourceBody: 'please get me a human',
    extraParts: [{
      id: id + '-asg',
      part_type: 'assignment',
      created_at: now - 20,
      author: { type: 'admin', id: ARSAL },
      assigned_to: { type: 'admin', id: CASEY },
      body: '',
    }],
  });
  assert.deepStrictEqual(out.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(out.comments));
  assert.strictEqual(out.notes.length, 0, JSON.stringify(out.notes));
  assert.strictEqual(out.assigns.length, 0, JSON.stringify(out.assigns));
});

test('password-policy questions on user.created post the clarifier', async () => {
  global.__lunaReply = 'ACTION: REPLY\n';
  const asks = [
    'What password criteria do you use?',
    'what is the password policy?',
    'what are the password requirements?',
    'what are the password rules?',
    'what is the password criteria?',
    'what is the password requirement?',
    'what are the password rule?',
    'Can you explain the password policy?',
  ];
  for (const ask of asks) {
    const out = await webhook(ask, { topic: 'conversation.user.created', createdAgo: 5 });
    assert.deepStrictEqual(out.comments, [POLICY], ask + ' ' + JSON.stringify(out.comments));
  }
});

test('order ids, receipt URLs, and MT5 logins stay byte-exact while customer secrets are removed', async () => {
  const order = 'FE10482931';
  const receipt = 'https://pay.example/receipts/' + order;
  const mt5 = '50123456';
  const mt5Login = 'MT50123456';
  const kb = 'KbToken9mixed';
  const echoed = 'Trading days are Monday through Friday. Order ' + order + ' receipt ' + receipt + ' login ' + mt5 + ' ' + mt5Login + ' code ' + kb + ' ref ' + SECRET + ' ' + NOISE;
  global.__lunaReply = 'ACTION: REPLY\n' + echoed;
  global.__lunaSeenPrompt = '';
  const ask = 'what are the trading days? order ' + order + ' receipt ' + receipt + ' mt5 ' + mt5 + ' ' + mt5Login + ' password: ' + SECRET + ' ' + NOISE;
  const out = await webhook(ask);
  assert.strictEqual(global.__lunaSeenPrompt.includes(SECRET), false, global.__lunaSeenPrompt);
  assert.strictEqual(global.__lunaSeenPrompt.includes(NOISE), false, global.__lunaSeenPrompt);
  assert.strictEqual(global.__lunaSeenPrompt.includes(order), true, global.__lunaSeenPrompt);
  assert.strictEqual(global.__lunaSeenPrompt.includes(receipt), true, global.__lunaSeenPrompt);
  assert.strictEqual(global.__lunaSeenPrompt.includes(mt5), true, global.__lunaSeenPrompt);
  assert.strictEqual(global.__lunaSeenPrompt.includes(mt5Login), true, global.__lunaSeenPrompt);
  assert.strictEqual(out.comments.length, 1, JSON.stringify(out.comments));
  const body = out.comments[0];
  assert.strictEqual(body.includes(SECRET), false, body);
  assert.strictEqual(body.includes(NOISE), false, body);
  assert.strictEqual(body.includes('[secret]'), true, body);
  assert.strictEqual(body.includes(order), true, body);
  assert.strictEqual(body.includes(receipt), true, body);
  assert.strictEqual(body.includes(mt5), true, body);
  assert.strictEqual(body.includes(mt5Login), true, body);
  assert.strictEqual(body.includes(kb), true, body);
});

test('a handoff note keeps the order id and drops only the customer secret values', async () => {
  const order = 'FE10482931';
  const receipt = 'https://pay.example/receipts/' + order;
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const ask = 'please get me a human order ' + order + ' ' + receipt + ' 50123456 password: ' + SECRET + ' ' + NOISE;
  const out = await webhook(ask, { topic: 'conversation.user.created', createdAgo: 5 });
  assert.deepStrictEqual(out.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(out.comments));
  const note = out.notes.join('\n');
  assert.strictEqual(note.includes(SECRET), false, note);
  assert.strictEqual(note.includes(NOISE), false, note);
  assert.strictEqual(note.includes(order), true, note);
  assert.strictEqual(note.includes(receipt), true, note);
  assert.strictEqual(note.includes('50123456'), true, note);
});

test('comment 400, 403, 404, and 409 keep the owed line without a second note or assignment', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  for (const reason of ['400', '403', '404', '409']) {
    const id = 'r21-recover-' + reason;
    global.__lunaFailComment = reason;
    liveAssignee = '';
    const first = await webhook('please get me a human', {
      id,
      topic: 'conversation.user.created',
      createdAgo: 5,
      keepAssignee: true,
    });
    assert.strictEqual(first.comments.length, 1, reason + ' first ' + JSON.stringify(first.comments));
    assert.strictEqual(first.notes.length, 1, reason + ' note ' + first.notes.length);
    assert.strictEqual(first.assigns.length, 1, reason + ' assign ' + first.assigns.length);
    const second = await webhook('just checking in', { id, keepAssignee: true });
    assert.deepStrictEqual(second.comments, [handoff.FIXED_MESSAGES.en], reason + ' ' + JSON.stringify(second.comments));
    assert.strictEqual(second.assigns.length, 0, reason + ' redid assignment');
    assert.strictEqual(second.notes.length, 0, reason + ' redid note');
  }
});

test('a comment failure stops retrying at the assignment bound without a new note', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const id = 'r21-bound';
  liveAssignee = '';
  for (let n = 0; n < 5; n++) {
    global.__lunaFailComment = '400';
    const turn = await webhook(n === 0 ? 'please get me a human' : 'still waiting', {
      id,
      topic: n === 0 ? 'conversation.user.created' : 'conversation.user.replied',
      createdAgo: n === 0 ? 5 : 1000,
      keepAssignee: true,
    });
    assert.strictEqual(turn.comments.length, 1, 'attempt ' + n + ' ' + JSON.stringify(turn));
    if (n > 0) {
      assert.strictEqual(turn.notes.length, 0, 'note on retry ' + n);
      assert.strictEqual(turn.assigns.length, 0, 'assign on retry ' + n);
    }
  }
  global.__lunaFailComment = '400';
  const stopped = await webhook('one more', { id, keepAssignee: true });
  assert.deepStrictEqual(stopped.comments, [], JSON.stringify(stopped.comments));
  assert.deepStrictEqual(stopped.notes, [], JSON.stringify(stopped.notes));
  assert.deepStrictEqual(stopped.assigns, [], JSON.stringify(stopped.assigns));
  assert.ok(store.latestOwedFixedLine(id, ARSAL), 'owed line dropped at the bound');
  global.__lunaFailComment = '';
});

test('a password-policy turn does not rewrite the next FAQ article', async () => {
  global.__lunaReply = 'ACTION: REPLY\n[secret] should not be here';
  await webhook('What password criteria do you use?', { topic: 'conversation.user.created', createdAgo: 5 });
  const raw = handoff.uniqueRankedFaqArticle('How does the challenge work?');
  const out = await webhook('How does the challenge work?');
  assert.strictEqual(out.comments.length, 1, JSON.stringify(out.comments));
  assert.strictEqual(out.comments[0], raw);
  assert.strictEqual(out.comments[0].includes('\u200b'), true);
  assert.strictEqual(out.comments[0].includes('[secret]'), false, out.comments[0]);
});

(async () => {
  for (const run of tests) await run();
  console.log('OK', passed, 'passed');
})().catch((err) => {
  console.error('FAIL', err && err.stack || err);
  process.exit(1);
});
