'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const childMode = process.env.LUNA_R25_CHILD === '1';
const tmp = os.tmpdir();
const pid = process.pid;
const axiosMock = path.join(tmp, 'luna-r25-axios-' + pid + '.js');
const openaiMock = path.join(tmp, 'luna-r25-openai-' + pid + '.js');
const expressMock = path.join(tmp, 'luna-r25-express-' + pid + '.js');
const dotenvMock = path.join(tmp, 'luna-r25-dotenv-' + pid + '.js');
const stateDir = childMode && process.env.LUNA_OP_STORE_FILE
  ? path.dirname(process.env.LUNA_OP_STORE_FILE)
  : path.join(tmp, 'luna-r25-state-' + pid);
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
    team_assignee_id: o.team || '0',
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
  const id = (opts && opts.id) || ('r25-' + (++seq));
  current = conv(id, text, opts);
  const topic = (opts && opts.topic) || 'conversation.user.replied';
  const res = { status: 0, sendStatus(code) { this.status = code; return this; } };
  await index.handleWebhook({ body: { topic, data: { item: current } } }, res);
  return { id, status: res.status, comments: commentsOf(), notes: notesOf(), assigns: assignsOf() };
}

const ENGLISH = handoff.FIXED_MESSAGES.en;
const ACCOUNT = handoff.ACCOUNT_QUESTION_LINES.en;
const DISCLOSURE = "I'm an AI assistant for FundedElite. I can help with your questions and involve the support team when needed.";
const identity = require(path.join(RUNTIME, 'assistantIdentityGuard'));
const promos = require(path.join(RUNTIME, 'september-promos'));
const FRESH = { topic: 'conversation.user.created', createdAgo: 5 };

function assertEnglishHandoff(out, label) {
  assert.deepStrictEqual(out.comments, [ENGLISH], label + ' ' + JSON.stringify(out.comments));
  assert.strictEqual(out.assigns.length, 1, label + ' assign');
  assert.strictEqual(out.notes.length, 1, label + ' note');
  const posted = out.comments.join('\n');
  assert.strictEqual(/[\u0600-\u06FF\u0900-\u097F\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF]/.test(posted), false, label);
  for (const retired of handoff.RETIRED_HANDOFF_LINES) {
    assert.strictEqual(posted.includes(retired), false, label);
  }
}

test('a non-English handoff posts the English line once', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const asks = [
    'مجھے ایجنٹ چاہیے',
    'أريد التحدث إلى موظف',
    'मुझे एजेंट से बात करनी है',
    'mujhe agent chahiye',
    'janab please mujhe agent chahiye',
    'kripya mujhe agent chahiye',
    'assalam mujhe kisi se baat karna hai',
    'voglio un operatore',
    'Vorrei parlare con un umano',
    'je veux parler à un agent',
    '我要转接人工',
  ];
  for (const ask of asks) {
    const out = await webhook(ask, FRESH);
    assertEnglishHandoff(out, ask);
  }
});

test('a non-English account question posts the English fact', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  for (const ask of ['میرا اکاؤنٹ نمبر کیا ہے؟', 'numero di conto', 'मेरा खाता नंबर क्या है', 'quel est mon numéro de compte']) {
    const out = await webhook(ask, FRESH);
    assert.strictEqual(out.comments.length, 1, ask + ' ' + JSON.stringify(out.comments));
    assert.strictEqual(out.comments[0].includes(ACCOUNT), true, out.comments[0]);
    assert.strictEqual(out.comments[0].includes(ENGLISH), false, out.comments[0]);
    assert.strictEqual(out.assigns.length, 0, ask);
    assert.strictEqual(/[\u0600-\u06FF\u0900-\u097F]/.test(out.comments[0]), false, out.comments[0]);
  }
});

test('an ungrounded Arabic withdrawal figure is hedged in English', async () => {
  global.__lunaReply = 'ACTION: REPLY\nThe withdrawal limit is 99 percent.';
  const out = await webhook('ما هي قواعد السحب؟', { topic: 'conversation.user.replied', createdAgo: 1000 });
  const hedge = "I can't confirm that figure from the approved details, so I won't guess a number.";
  assert.deepStrictEqual(out.comments, [hedge], JSON.stringify(out.comments));
  assert.strictEqual(out.comments[0].includes('99'), false);
  assert.strictEqual(/[\u0600-\u06FF]/.test(out.comments[0]), false);
});

test('identity replies and promo facts stay English', async () => {
  assert.strictEqual(identity.disclosureFor('sei un bot'), DISCLOSURE);
  assert.strictEqual(identity.disclosureFor('کیا آپ AI ہیں'), DISCLOSURE);
  assert.strictEqual(identity.disclosureFor('kya aap ai ho'), DISCLOSURE);
  const boundary = identity.personalBoundaryFor('aap ki biwi ka naam kya hai', 'r25');
  assert.strictEqual(/[\u0600-\u06FF]/.test(boundary), false, boundary);
  assert.strictEqual(/Non posso|Personal cheezein|ذاتی/.test(boundary), false, boundary);
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const urduId = await webhook('kya aap ai ho', FRESH);
  assert.strictEqual(urduId.comments.join('\n').includes(DISCLOSURE), true, JSON.stringify(urduId.comments));
  assert.strictEqual(urduId.comments.join('\n').includes('Main FundedElite'), false);
  const italianId = await webhook('sei un bot', FRESH);
  assert.strictEqual(italianId.comments.join('\n').includes(DISCLOSURE), true, JSON.stringify(italianId.comments));
  assert.strictEqual(italianId.comments.join('\n').includes('Sono un'), false);
  const promo = promos.answerPromotionQuestion('mujhe 1 step free retry ka discount chahiye');
  assert.strictEqual(typeof promo, 'string');
  assert.strictEqual(/SEP35/.test(promo) && /35%/.test(promo), true, promo);
  assert.strictEqual(/Haan -|pe SEP35 se|milta hai/.test(promo), false, promo);
  assert.strictEqual(promos.prefersRomanUrdu('mujhe discount chahiye'), false);
});

test('Risk and Escalations stay silent and a human reply is not a second handoff', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const risk = await webhook('please get me a human', Object.assign({ team: '10675195' }, FRESH));
  assert.deepStrictEqual(risk.comments, [], JSON.stringify(risk.comments));
  const escalations = await webhook('مجھے ایجنٹ چاہیے', Object.assign({ team: '9629759' }, FRESH));
  assert.deepStrictEqual(escalations.comments, [], JSON.stringify(escalations.comments));
  const now = Math.floor(Date.now() / 1000);
  const owned = await webhook('please get me a human', {
    topic: 'conversation.user.replied',
    createdAgo: 1000,
    assignee: CASEY,
    extraParts: [{
      id: 'human-said',
      part_type: 'comment',
      created_at: now - 30,
      author: { type: 'admin', id: CASEY, name: 'Casey Support' },
      body: 'I am looking at this.',
    }],
  });
  assert.deepStrictEqual(owned.comments, [], JSON.stringify(owned.comments));
  assert.deepStrictEqual(owned.assigns, [], JSON.stringify(owned.assigns));
  const assignedOnly = await webhook('what are the trading days?', {
    topic: 'conversation.user.replied',
    createdAgo: 1000,
    assignee: CASEY,
  });
  assert.deepStrictEqual(assignedOnly.comments, [], JSON.stringify(assignedOnly.comments));
  assert.deepStrictEqual(assignedOnly.assigns, [], JSON.stringify(assignedOnly.assigns));
});

test('a stored translation is posted as the English line', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const id = 'r25-retired';
  const retired = handoff.RETIRED_HANDOFF_LINES[0];
  store.rememberOwedFixedLine({
    conversationId: id,
    madeBy: ARSAL,
    assigneeId: CASEY,
    message: retired,
    language: 'ur',
  });
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
  assert.deepStrictEqual(out.comments, [ENGLISH], JSON.stringify(out.comments));
  assert.strictEqual(out.comments[0].includes(retired), false);
  assert.strictEqual(out.comments.join('\n').includes('یہ گفتگو'), false);
});

test('the R23 homoglyph leak and over-redactions stay closed', async () => {
  const checking = 'Thanks for the details. I am checking this now and will update you here shortly.';
  const lower = 'account11261292';
  const upper = 'Account11261293';
  global.__lunaReply = 'ACTION: REPLY\nTrading days are Monday through Friday. ' + lower + ' and ' + upper + '.';
  const stated = await webhook('what are the trading days? my login is ' + lower + ' and ' + upper);
  assert.strictEqual(stated.comments.length, 1, JSON.stringify(stated.comments));
  assert.strictEqual(stated.comments[0].includes(lower), true, stated.comments[0]);
  assert.strictEqual(stated.comments[0].includes(upper), true, stated.comments[0]);
  assert.strictEqual(stated.comments[0].includes('[secret]'), false, stated.comments[0]);
  global.__lunaReply = 'ACTION: REPLY\nTrading days are Monday through Friday. account11261292.';
  const unstated = await webhook('what are the trading days? my login is 50123456');
  assert.strictEqual(unstated.comments[0].includes(checking), true, unstated.comments[0]);
  assert.strictEqual(unstated.comments[0].includes('account11261292'), false, unstated.comments[0]);
  const secret = 'FE81000033';
  const order = 'FE10482931';
  global.__lunaReply = 'ACTION: REPLY\nTrading days are Monday through Friday. Ref ' + secret + '. order ' + order;
  global.__lunaSeenPrompt = '';
  const homo = await webhook('what are the trading days? p\u0430ssword: ' + secret);
  assert.strictEqual(homo.comments[0].includes(secret), false, homo.comments[0]);
  assert.strictEqual(homo.comments[0].includes(order), true, homo.comments[0]);
  assert.strictEqual(homo.comments[0].includes('[secret]'), true, homo.comments[0]);
  assert.strictEqual(global.__lunaSeenPrompt.includes(secret), false, global.__lunaSeenPrompt);
  global.__lunaReply = 'ACTION: REPLY\nTrading days are Monday through Friday. Ref ' + secret + ' ' + order;
  global.__lunaSeenPrompt = '';
  const zw = await webhook('what are the trading days? pin:\u200b' + secret + '\u200b' + order);
  assert.strictEqual(zw.comments[0].includes(secret), false, zw.comments[0]);
  assert.strictEqual(zw.comments[0].includes(order), true, zw.comments[0]);
  assert.strictEqual(global.__lunaSeenPrompt.includes(order), true, global.__lunaSeenPrompt);
});

if (childMode) {
  process.exit(0);
} else {
  (async () => {
    for (const run of tests) await run();
    console.log('OK', passed, 'passed');
  })().catch((err) => {
    console.error('FAIL', err && err.stack || err);
    process.exit(1);
  });
}
