'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tmp = os.tmpdir();
const pid = process.pid;
const axiosMock = path.join(tmp, 'luna-r19-axios-' + pid + '.js');
const openaiMock = path.join(tmp, 'luna-r19-openai-' + pid + '.js');
const expressMock = path.join(tmp, 'luna-r19-express-' + pid + '.js');
const dotenvMock = path.join(tmp, 'luna-r19-dotenv-' + pid + '.js');
const stateDir = path.join(tmp, 'luna-r19-state-' + pid);
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
process.env.OPENAI_API_KEY = 'r19-webhook';
process.env.MAINTAINER_ENABLED = 'false';

const calls = [];
let current = null;
let liveAssignee = '';
global.__lunaReply = 'ACTION: REPLY\nOK';
global.__lunaModel = function (req) {
  const messages = (req && req.messages) || [];
  const sys = String((messages.find((m) => m.role === 'system') || {}).content || '');
  const user = String((messages.find((m) => m.role === 'user') || {}).content || '');
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
  if (data && data.message_type === 'assignment') {
    liveAssignee = String(data.assignee_id);
    return Promise.resolve({ status: 200, data: { id: 'asg', type: 'conversation', admin_assignee_id: liveAssignee } });
  }
  return Promise.resolve({ status: 200, data: { id: 'w1', type: 'conversation' } });
};

const handoff = require(path.join(RUNTIME, 'fixedMessageHandoff'));
const index = require(path.join(RUNTIME, 'index'));
const faq = require(path.join(RUNTIME, 'faq-kb'));
const realRetrieve = faq.retrieveOfficialFaqContext.bind(faq);

const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const CLARIFIER = 'Please tell me which challenge you mean.';
const POLICY = 'Which part of the password policy should I explain?';
const NOISE = 'Zq8LatinNoise88ab';
const SECRET = 'SuperSecretValue99';
const SUPPORTED = [
  'The DLL is 5%.',
  'The MLL is 8%.',
  'The daily loss limit is 5%.',
  'The max loss limit is 8%.',
  'DLL is 5%.',
  'The maximum loss is 8%.',
  'Daily loss limit is 5%.',
  'Max loss limit is 8%.',
  'The daily drawdown is 5%.',
  'The max drawdown is 8%.',
];

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
  const parts = [];
  if (o.priorBot) {
    parts.push({
      id: id + '-bot',
      part_type: 'comment',
      body: 'Hello, how can I help?',
      created_at: now - 400,
      author: { type: 'admin', id: '10118526', name: 'Arsal' },
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
    admin_assignee_id: '0',
    team_assignee_id: '0',
    source: { body: text, created_at: now - 5, author: { type: 'user', id: 'user-1', name } },
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

async function webhook(text, opts) {
  calls.length = 0;
  liveAssignee = '';
  const id = 'r19-' + (++seq);
  current = conv(id, text, opts);
  const topic = (opts && opts.topic) || 'conversation.user.replied';
  const res = { status: 0, sendStatus(code) { this.status = code; return this; } };
  await index.handleWebhook({ body: { topic, data: { item: current } } }, res);
  return { status: res.status, comments: commentsOf(), notes: notesOf() };
}

test('supported figures post through handleWebhook and wrong figures stay withheld', async () => {
  faq.retrieveOfficialFaqContext = async function () {
    return { ok: true, block: 'DLL 5%/3%, MLL 8%.', from: 'faq-kb' };
  };
  try {
    for (const draft of SUPPORTED) {
      global.__lunaReply = 'ACTION: REPLY\n' + draft;
      const out = await webhook('what are the trading days?');
      assert.deepStrictEqual(out.comments, [draft], draft + ' got ' + JSON.stringify(out.comments));
      assert.strictEqual(out.comments.some((body) => body === HEDGE), false, draft);
      assert.strictEqual(out.comments[0].includes('Hello'), false, draft);
    }
    global.__lunaReply = 'ACTION: REPLY\nThe DLL is 99%.';
    const invented = await webhook('what are the trading days?');
    assert.strictEqual(invented.comments.includes('The DLL is 99%.'), false, JSON.stringify(invented.comments));
    assert.strictEqual(invented.comments.some((body) => body.includes('99%')), false, JSON.stringify(invented.comments));
    global.__lunaReply = 'ACTION: REPLY\nThe daily drawdown is 8%.';
    const wrong = await webhook('what are the trading days?');
    assert.strictEqual(wrong.comments.includes('The daily drawdown is 8%.'), false, JSON.stringify(wrong.comments));
  } finally {
    faq.retrieveOfficialFaqContext = realRetrieve;
  }
});

test('an empty or number-hedge password draft posts the clarifier through handleWebhook', async () => {
  global.__lunaReply = 'ACTION: REPLY\n';
  const empty = await webhook('Can you explain the password policy?');
  assert.deepStrictEqual(empty.comments, [POLICY], JSON.stringify(empty.comments));
  global.__lunaReply = 'ACTION: REPLY\n' + HEDGE;
  const hedged = await webhook('Can you explain the password policy?');
  assert.deepStrictEqual(hedged.comments, [POLICY], JSON.stringify(hedged.comments));
  global.__lunaReply = 'ACTION: REPLY\nPasswords must include letters and numbers.';
  const usable = await webhook('what is the password policy?');
  assert.strictEqual(usable.comments.length, 1, JSON.stringify(usable.comments));
  assert.strictEqual(usable.comments[0].includes('Passwords must include letters and numbers.'), true, usable.comments[0]);
  assert.notStrictEqual(usable.comments[0], HEDGE);
  assert.notStrictEqual(usable.comments[0], POLICY);
});

test('human requests are detected on Fin-wait and later turns through handleWebhook', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI can help with that.';
  const hindi = await webhook('मुझे agent से बात करनी है', { topic: 'conversation.user.created', createdAgo: 5 });
  assert.deepStrictEqual(hindi.comments, [handoff.FIXED_MESSAGES.hi], JSON.stringify(hindi.comments));
  const hindiNoise = await webhook('मुझे agent से बात करनी है ' + NOISE, { topic: 'conversation.user.created', createdAgo: 5 });
  assert.deepStrictEqual(hindiNoise.comments, [handoff.FIXED_MESSAGES.hi], JSON.stringify(hindiNoise.comments));
  assert.strictEqual(hindiNoise.notes.join('\n').includes(NOISE), false);
  const hindiSecret = await webhook('मुझे agent से बात करनी है password: ' + SECRET, { topic: 'conversation.user.created', createdAgo: 5 });
  assert.deepStrictEqual(hindiSecret.comments, [handoff.FIXED_MESSAGES.hi], JSON.stringify(hindiSecret.comments));
  assert.strictEqual(JSON.stringify(hindiSecret).includes(SECRET), false);
  const janab = await webhook('janab mujhe agent chahiye', { priorBot: true });
  assert.deepStrictEqual(janab.comments, [handoff.FIXED_MESSAGES.ur], JSON.stringify(janab.comments));
  const human = await webhook('please get me a human ' + NOISE, { topic: 'conversation.user.created', createdAgo: 5 });
  assert.deepStrictEqual(human.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(human.comments));
  assert.strictEqual(human.notes.join('\n').includes(NOISE), false);
  assert.strictEqual(human.notes.join('\n').includes('[secret]'), true, human.notes.join('\n'));
  const later = await webhook('please get me a human ' + NOISE, { priorBot: true });
  assert.deepStrictEqual(later.comments, [handoff.FIXED_MESSAGES.en], JSON.stringify(later.comments));
  assert.strictEqual(later.notes.join('\n').includes(NOISE), false);
});

test('FAQ articles keep U+200B and the welcome tie clarifier has no Hello prefix', async () => {
  global.__lunaReply = 'ACTION: REPLY\nI will guess.';
  const challenge = await webhook('How does the challenge work?');
  assert.strictEqual(challenge.comments.length, 1, JSON.stringify(challenge.comments));
  assert.strictEqual(challenge.comments[0].includes('\u200b'), true);
  assert.strictEqual(challenge.comments[0].includes('Hello'), false);
  const leverage = await webhook('What is the leverage?');
  assert.strictEqual(leverage.comments.length, 1, JSON.stringify(leverage.comments));
  assert.strictEqual(leverage.comments[0].includes('\u200b'), true);
  assert.strictEqual(leverage.comments[0].includes('Hello'), false);
  const tie = await webhook('How can I pay for the challenge?');
  assert.deepStrictEqual(tie.comments, [CLARIFIER], JSON.stringify(tie.comments));
});

(async () => {
  for (const run of tests) await run();
  console.log('OK', passed, 'passed');
})().catch((err) => {
  console.error('FAIL', err && err.stack || err);
  process.exit(1);
});
