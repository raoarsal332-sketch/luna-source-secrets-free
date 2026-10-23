'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const childMode = process.env.LUNA_R24_CHILD === '1';
const tmp = os.tmpdir();
const pid = process.pid;
const axiosMock = path.join(tmp, 'luna-r24-axios-' + pid + '.js');
const openaiMock = path.join(tmp, 'luna-r24-openai-' + pid + '.js');
const expressMock = path.join(tmp, 'luna-r24-express-' + pid + '.js');
const dotenvMock = path.join(tmp, 'luna-r24-dotenv-' + pid + '.js');
const stateDir = childMode && process.env.LUNA_OP_STORE_FILE
  ? path.dirname(process.env.LUNA_OP_STORE_FILE)
  : path.join(tmp, 'luna-r24-state-' + pid);
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
if (!childMode) {
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
}

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
  if (data && data.message_type === 'comment' && global.__lunaDieOnComment) {
    process.exit(86);
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
  assert.deepStrictEqual(arabic.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(arabic.comments));
  for (const role of ['staff', 'banda', 'insaan', 'representative']) {
    const out = await webhook('मुझे ' + role + ' से बात करनी है', fresh);
    assert.deepStrictEqual(out.comments, [handoff.FIXED_MESSAGES.en], role + ' ' + JSON.stringify(out.comments));
  }
  const support = await webhook('मुझे support person से बात करनी है', fresh);
  assert.deepStrictEqual(support.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(support.comments));
  const urdu = await webhook('مجھے staff چاہیے', fresh);
  assert.deepStrictEqual(urdu.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(urdu.comments));
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

test('Roman Urdu cues outweigh English fillers on the locked line', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const fresh = { topic: 'conversation.user.created', createdAgo: 5 };
  const tied = await webhook('janab please mujhe agent chahiye', fresh);
  assert.deepStrictEqual(tied.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(tied.comments));
  const cues = await webhook('hi sir please mujhe agent se baat karna hai', fresh);
  assert.deepStrictEqual(cues.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(cues.comments));
  const english = await webhook('please get me a human', fresh);
  assert.deepStrictEqual(english.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(english.comments));
});

test('a fresh user.replied password-policy question posts the clarifier', async () => {
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
    const out = await webhook(ask, { topic: 'conversation.user.replied', createdAgo: 5 });
    assert.deepStrictEqual(out.comments, [POLICY], ask + ' ' + JSON.stringify(out.comments));
  }
  const later = await webhook('What password criteria do you use?', { topic: 'conversation.user.replied', createdAgo: 1000 });
  assert.deepStrictEqual(later.comments, [POLICY], JSON.stringify(later.comments));
});

test('order ids, receipt URLs, and the customer account pass the presend number gate', async () => {
  const order = 'FE10482931';
  const receipt = 'https://pay.example/receipts/' + order;
  const otherReceipt = 'https://pay.example/receipts/99881122';
  const mt5 = '50123456';
  const ownOther = '61234567';
  const mt5Login = 'MT50123456';
  const checking = 'Thanks for the details. I am checking this now and will update you here shortly.';
  const echoed = 'Trading days are Monday through Friday. Login ' + mt5 + ' and ' + ownOther + ' order ' + order + ' receipt ' + receipt + ' ' + otherReceipt + ' ' + mt5Login + '.';
  global.__lunaReply = 'ACTION: REPLY\n' + echoed;
  const ask = 'what are the trading days? my login is ' + mt5 + ' and my other login is ' + ownOther;
  const out = await webhook(ask);
  assert.strictEqual(out.comments.length, 1, JSON.stringify(out.comments));
  const body = out.comments[0];
  assert.strictEqual(body.includes(checking), false, body);
  assert.strictEqual(body.includes(order), true, body);
  assert.strictEqual(body.includes(receipt), true, body);
  assert.strictEqual(body.includes(otherReceipt), true, body);
  assert.strictEqual(body.includes(mt5), true, body);
  assert.strictEqual(body.includes(ownOther), true, body);
  assert.strictEqual(body.includes(mt5Login), true, body);
  global.__lunaReply = 'ACTION: REPLY\nTrading days are Monday through Friday. Account 77889900.';
  const foreign = await webhook('what are the trading days? my login is ' + mt5);
  assert.strictEqual(foreign.comments.length, 1, JSON.stringify(foreign.comments));
  assert.strictEqual(foreign.comments[0].includes(checking), true, foreign.comments[0]);
  assert.strictEqual(foreign.comments[0].includes('77889900'), false, foreign.comments[0]);
  const spread = 'TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server\n\nPlatform: MetaTrader 5\nServer: Fundedelite-Server\nAccount Number: 55188\nPassword: QBG5FetfozKz7^a?J!\n\nUse this account to check spreads.';
  global.__lunaReply = 'ACTION: REPLY\n' + spread;
  const blocked = await webhook('what are the trading days?');
  assert.strictEqual(blocked.comments.join('\n').includes('QBG5FetfozKz7'), false, blocked.comments.join('\n'));
  assert.strictEqual(blocked.comments.join('\n').includes('55188'), false, blocked.comments.join('\n'));
  assert.strictEqual(blocked.comments.join('\n').includes(checking), false, blocked.comments.join('\n'));
});

test('a customer-declared secret stays scrubbed when it is reused later', async () => {
  const declared = 'FE81000000';
  const order = 'FE10482931';
  const checking = 'Thanks for the details. I am checking this now and will update you here shortly.';
  global.__lunaReply = 'ACTION: REPLY\nTrading days are Monday through Friday. Login 50123456 order ' + order + ' pin ' + declared + '.';
  const first = await webhook('what are the trading days? login 50123456 order ' + order + ' pin: ' + declared, { id: 'r22-declared-secret' });
  assert.strictEqual(first.comments.length, 1, JSON.stringify(first.comments));
  assert.strictEqual(first.comments[0].includes(declared), false, first.comments[0]);
  assert.strictEqual(first.comments[0].includes(order), true, first.comments[0]);
  assert.strictEqual(first.comments[0].includes('50123456'), true, first.comments[0]);
  assert.strictEqual(first.comments[0].includes('[secret]'), true, first.comments[0]);
  assert.strictEqual(first.comments[0].includes(checking), false, first.comments[0]);
  global.__lunaReply = 'ACTION: REPLY\nMarket hours follow the symbol. Ref ' + declared + ' order ' + order + '.';
  const later = await webhook('what hours does the market use?', { id: 'r22-declared-secret-later' });
  assert.strictEqual(later.comments.length, 1, JSON.stringify(later.comments));
  assert.strictEqual(later.comments[0].includes(declared), false, later.comments[0]);
  assert.strictEqual(later.comments[0].includes(order), true, later.comments[0]);
  assert.strictEqual(later.comments[0].includes('[secret]'), true, later.comments[0]);
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

function runChild(spec) {
  const resultFile = path.join(stateDir, 'child-result-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.json');
  const env = Object.assign({}, process.env, {
    LUNA_R24_CHILD: '1',
    LUNA_R24_SPEC: JSON.stringify(spec),
    LUNA_R24_RESULT: resultFile,
  });
  const r = spawnSync(process.execPath, [__filename], { env, encoding: 'utf8', timeout: 60000 });
  let out = null;
  if (fs.existsSync(resultFile)) out = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, out };
}

test('account-prefix tokens stay on the checking line unless the customer stated them', async () => {
  const checking = 'Thanks for the details. I am checking this now and will update you here shortly.';
  const login = 'Login11261000';
  const mt5 = 'MT511261194';
  const acct = 'acct11261291';
  const order = 'FE10482931';
  const receipt = 'https://pay.example/receipts/' + order;
  global.__lunaReply = 'ACTION: REPLY\nTrading days are Monday through Friday. ' + login + ' ' + mt5 + ' ' + acct + ' order ' + order + ' ' + receipt + '.';
  const blocked = await webhook('what are the trading days? my login is 50123456');
  assert.strictEqual(blocked.comments.length, 1, JSON.stringify(blocked.comments));
  const body = blocked.comments[0];
  assert.strictEqual(body.includes(checking), true, body);
  assert.strictEqual(body.includes('11261000'), false, body);
  assert.strictEqual(body.includes('511261194'), false, body);
  assert.strictEqual(body.includes('11261194'), false, body);
  assert.strictEqual(body.includes('11261291'), false, body);
  global.__lunaReply = 'ACTION: REPLY\nTrading days are Monday through Friday. ' + login + ' ' + mt5 + ' ' + acct + ' order ' + order + ' ' + receipt + '.';
  const stated = await webhook('what are the trading days? my login is ' + login + ' and ' + mt5 + ' and ' + acct);
  assert.strictEqual(stated.comments.length, 1, JSON.stringify(stated.comments));
  const kept = stated.comments[0];
  assert.strictEqual(kept.includes(checking), false, kept);
  assert.strictEqual(kept.includes(login), true, kept);
  assert.strictEqual(kept.includes(mt5), true, kept);
  assert.strictEqual(kept.includes(acct), true, kept);
  assert.strictEqual(kept.includes(order), true, kept);
  assert.strictEqual(kept.includes(receipt), true, kept);
});

test('kripya with Roman Urdu cues uses the Hinglish locked line', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const out = await webhook('kripya mujhe agent chahiye', { topic: 'conversation.user.created', createdAgo: 5 });
  assert.deepStrictEqual(out.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(out.comments));
});

test('kisi se baat is a handoff request', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const out = await webhook('assalam mujhe kisi se baat karna hai', { topic: 'conversation.user.created', createdAgo: 5 });
  assert.deepStrictEqual(out.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(out.comments));
  assert.strictEqual(out.assigns.length, 1, JSON.stringify(out.assigns));
});

test('an Italian handoff outside the approved phrase uses the English line', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const fresh = { topic: 'conversation.user.created', createdAgo: 5 };
  const silent = await webhook('Vorrei parlare con un umano', fresh);
  assert.deepStrictEqual(silent.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(silent.comments));
  const approved = await webhook('voglio un operatore', fresh);
  assert.deepStrictEqual(approved.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(approved.comments));
});

test('a wiped store uses the conversation language when the latest text is a status ping', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const id = 'r23-wiped-ur';
  const now = Math.floor(Date.now() / 1000);
  liveAssignee = CASEY;
  const out = await webhook('any update?', {
    id,
    keepAssignee: true,
    assignee: CASEY,
    sourceBody: 'مجھے ایجنٹ چاہیے',
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

test('a 429 on the customer comment is one failure and the next turn posts once', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const id = 'r23-429';
  global.__lunaFailComment = '429';
  liveAssignee = '';
  const first = await webhook('please get me a human', {
    id,
    topic: 'conversation.user.created',
    createdAgo: 5,
    keepAssignee: true,
  });
  assert.strictEqual(first.comments.length, 1, 'bodies ' + JSON.stringify(first.comments));
  const owed = store.latestOwedFixedLine(id, ARSAL);
  assert.ok(owed && owed.message === handoff.FIXED_MESSAGES.en && owed.messageSent === false, JSON.stringify(owed));
  global.__lunaFailComment = '';
  const second = await webhook('just checking in', { id, keepAssignee: true });
  assert.deepStrictEqual(second.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(second.comments));
  assert.strictEqual(second.notes.length, 0, JSON.stringify(second.notes));
  assert.strictEqual(second.assigns.length, 0, JSON.stringify(second.assigns));
});

test('a restarted process posts the owed reply and still scrubs a declared pin', async () => {
  const declared = 'FE82000000';
  const id = 'r23-restart';
  const now = Math.floor(Date.now() / 1000);
  const crashed = runChild({
    text: 'please get me a human pin: ' + declared,
    reply: 'ACTION: REPLY\nI can help with that.',
    dieOnComment: true,
    opts: { id, topic: 'conversation.user.created', createdAgo: 5, keepAssignee: true },
  });
  assert.strictEqual(crashed.status, 86, crashed.stderr + '\n' + crashed.stdout);
  assert.ok(store.latestOwedFixedLine(id, ARSAL), 'owed line missing after the crash');
  const next = runChild({
    text: 'any update?',
    reply: 'ACTION: REPLY\nRef ' + declared,
    opts: {
      id,
      keepAssignee: true,
      assignee: CASEY,
      sourceBody: 'please get me a human pin: ' + declared,
      extraParts: [{
        id: id + '-note',
        part_type: 'note',
        created_at: now - 30,
        author: { type: 'admin', id: ARSAL },
        body: 'Account: <br>Problem: please get me a human pin: [secret]',
      }, {
        id: id + '-asg',
        part_type: 'assignment',
        created_at: now - 20,
        author: { type: 'admin', id: ARSAL },
        assigned_to: { type: 'admin', id: CASEY },
        body: '',
      }],
    },
  });
  assert.strictEqual(next.status, 0, next.stderr + '\n' + next.stdout);
  assert.ok(next.out, next.stderr + '\n' + next.stdout);
  assert.deepStrictEqual(next.out.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(next.out));
  assert.strictEqual(JSON.stringify(next.out).includes(declared), false, JSON.stringify(next.out));
  const echoed = 'FE83000000';
  const first = runChild({
    text: 'what are the trading days? pin: ' + echoed,
    reply: 'ACTION: REPLY\nTrading days are Monday through Friday.',
    opts: { id: 'r23-restart-pin' },
  });
  assert.strictEqual(first.status, 0, first.stderr + '\n' + first.stdout);
  assert.ok(first.out && first.out.comments.length === 1, JSON.stringify(first.out));
  assert.strictEqual(JSON.stringify(first.out).includes(echoed), false, JSON.stringify(first.out));
  const later = runChild({
    text: 'what hours does the market use?',
    reply: 'ACTION: REPLY\nMarket hours follow the symbol. Ref ' + echoed + ' order FE10482931.',
    opts: { id: 'r23-restart-pin-later' },
  });
  assert.strictEqual(later.status, 0, later.stderr + '\n' + later.stdout);
  assert.ok(later.out && later.out.comments.length === 1, JSON.stringify(later.out));
  assert.strictEqual(later.out.comments[0].includes(echoed), false, later.out.comments[0]);
  assert.strictEqual(later.out.comments[0].includes('FE10482931'), true, later.out.comments[0]);
  assert.strictEqual(later.out.comments[0].includes('[secret]'), true, later.out.comments[0]);
});

test('a stated account prefix passes byte-exact and an unstated one keeps the checking line', async () => {
  const checking = 'Thanks for the details. I am checking this now and will update you here shortly.';
  const lower = 'account11261292';
  const upper = 'Account11261293';
  global.__lunaReply = 'ACTION: REPLY\nTrading days are Monday through Friday. ' + lower + ' and ' + upper + '.';
  const stated = await webhook('what are the trading days? my login is ' + lower + ' and ' + upper);
  assert.strictEqual(stated.comments.length, 1, JSON.stringify(stated.comments));
  const kept = stated.comments[0];
  assert.strictEqual(kept.includes(checking), false, kept);
  assert.strictEqual(kept.includes(lower), true, kept);
  assert.strictEqual(kept.includes(upper), true, kept);
  assert.strictEqual(kept.includes('[secret]'), false, kept);
  global.__lunaReply = 'ACTION: REPLY\nTrading days are Monday through Friday. account11261292.';
  const unstated = await webhook('what are the trading days? my login is 50123456');
  assert.strictEqual(unstated.comments.length, 1, JSON.stringify(unstated.comments));
  assert.strictEqual(unstated.comments[0].includes(checking), true, unstated.comments[0]);
  assert.strictEqual(unstated.comments[0].includes('11261292'), false, unstated.comments[0]);
  assert.strictEqual(unstated.comments[0].includes('account11261292'), false, unstated.comments[0]);
});

test('a confusable password label is fail-closed and the following order id survives', async () => {
  const secret = 'FE81000033';
  const order = 'FE10482931';
  const label = 'p\u0430ssword';
  global.__lunaReply = 'ACTION: REPLY\nTrading days are Monday through Friday. Ref ' + secret + '. order ' + order;
  global.__lunaSeenPrompt = '';
  const out = await webhook('what are the trading days? ' + label + ': ' + secret);
  assert.strictEqual(out.comments.length, 1, JSON.stringify(out.comments));
  const body = out.comments[0];
  assert.strictEqual(body.includes(secret), false, body);
  assert.strictEqual(body.includes('[secret]'), true, body);
  assert.strictEqual(body.includes(order), true, body);
  assert.strictEqual(global.__lunaSeenPrompt.includes(secret), false, global.__lunaSeenPrompt);
  assert.strictEqual(out.notes.join('\n').includes(secret), false, out.notes.join('\n'));
  assert.strictEqual(JSON.stringify(out).includes(secret), false, JSON.stringify(out));
});

test('a zero-width pin captures one value and the following order id survives', async () => {
  const secret = 'FE81000033';
  const order = 'FE10482931';
  global.__lunaReply = 'ACTION: REPLY\nTrading days are Monday through Friday. Ref ' + secret + ' ' + order;
  global.__lunaSeenPrompt = '';
  const out = await webhook('what are the trading days? pin:\u200b' + secret + '\u200b' + order);
  assert.strictEqual(out.comments.length, 1, JSON.stringify(out.comments));
  const body = out.comments[0];
  assert.strictEqual(body.includes(secret), false, body);
  assert.strictEqual(body.includes(order), true, body);
  assert.strictEqual(body.includes('[secret]'), true, body);
  assert.strictEqual(global.__lunaSeenPrompt.includes(secret), false, global.__lunaSeenPrompt);
  assert.strictEqual(global.__lunaSeenPrompt.includes(order), true, global.__lunaSeenPrompt);
  assert.strictEqual(JSON.stringify(out).includes(secret), false, JSON.stringify(out));
  global.__lunaReply = 'ACTION: REPLY\nTrading days are Monday through Friday. Ref ' + secret + '. ' + order;
  global.__lunaSeenPrompt = '';
  const dotted = await webhook('what are the trading days? pin:\u200b' + secret + '\u200b' + order + '.');
  assert.strictEqual(dotted.comments.length, 1, JSON.stringify(dotted.comments));
  assert.strictEqual(dotted.comments[0].includes(secret), false, dotted.comments[0]);
  assert.strictEqual(dotted.comments[0].includes(order), true, dotted.comments[0]);
  assert.strictEqual(dotted.comments[0].includes('[secret]'), true, dotted.comments[0]);
});

if (childMode) {
  (async () => {
    const spec = JSON.parse(process.env.LUNA_R24_SPEC || '{}');
    if (spec.reply) global.__lunaReply = spec.reply;
    if (spec.failComment) global.__lunaFailComment = spec.failComment;
    if (spec.dieOnComment) global.__lunaDieOnComment = true;
    const out = await webhook(spec.text, spec.opts || {});
    fs.writeFileSync(process.env.LUNA_R24_RESULT, JSON.stringify(out));
    process.exit(0);
  })().catch((err) => {
    console.error('CHILD_FAIL', err && err.stack || err);
    process.exit(1);
  });
} else {
  (async () => {
    for (const run of tests) await run();
    console.log('OK', passed, 'passed');
  })().catch((err) => {
    console.error('FAIL', err && err.stack || err);
    process.exit(1);
  });
}
