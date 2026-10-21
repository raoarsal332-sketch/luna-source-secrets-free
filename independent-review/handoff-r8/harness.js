'use strict';

/**
 * Independent sealed review of frozen fixed-message handoff R8.
 * Commit 5c39fd7001c06482470ff470d9ad0ea07b4ec37a.
 * Drives the real handleWebhook. Axios is an in-process recording transport.
 * The model is stubbed. Raw sockets, fetch, and DNS are tripwired.
 * No production host, no live Intercom, no customer data.
 *
 * Run: NODE_PATH=/tmp/r8-nm/node_modules node independent-review/handoff-r8/harness.js
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const dns = require('dns');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '../..');
const RUNTIME = path.join(ROOT, 'luna-current/01_runtime');
const FROZEN = '5c39fd7001c06482470ff470d9ad0ea07b4ec37a';
const EXPECTED_SHA = {
  'luna-current/01_runtime/fixedMessageHandoff.js':
    'b296c6834a1d4cea2c4cc26e36fb1f8767245e53367de0afaa8e652a386e07c2',
  'luna-current/01_runtime/index.js':
    '14befdafb196637c51d34a8bab2f47ae2ca543c2e9a662a3a7e0a67d1332b74b',
  'luna-current/01_runtime/challengeVariantGuard.js':
    '0d6fff5f5330091c4f8ca02f5ae189845b386922c944d8a7b152970cdc43d12d',
  'luna-current/02_statePresend/credentialSanitizer.js':
    'a72f4d467f79fce0dd7bf0643159ba8798def962b318b03847538d413ca29352',
  'luna-current/02_statePresend/targetedRegeneration.js':
    '21d52aede4955b1373ef2f3356247514734685a7741d4c713efe82ae022ff549',
  'luna-current/02_statePresend/statePresend.js':
    '0e3b8675e00856eca158748711683471e3820d43a9e5c0ff626a14dc84a90764',
  'luna-current/10_synthetic_lanes/fixed-message-handoff-r8/FM_R8_REPORT.md':
    '5c34c265ff8ef6bbe9057a9862656b5b23bd8871587adc93c298c9c9d5d6d8a7',
};

const ARSAL = '10118526';
const ELITE = '8052954';
const JERRY = '8053416';
const HUMAN = '88001021';
const TEAMMATE = '77001021';
const RISK = '10675195';
const ESC = '9629759';
const SUPPORT_TEAM = 9629780;
const IC_TOKEN = 'ICSYNTHR8TOKEN9F3A7C2E1B';
const OAI_KEY = 'sk-synthR8NOTREAL000111222333';
const SPREAD_PASSWORD = 'QBG5FetfozKz7^a?J!';
const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const FAQ_REPLY =
  'ACTION: REPLY\nBODY: I can explain the challenge rules that apply here. Which product should I walk through?';
const EMPTY_REPLY = 'ACTION: REPLY\nBODY:';
const BLANK_MODEL = '';
const HEDGE_MODEL = 'ACTION: REPLY\nBODY: ' + HEDGE;
const WRONG_9 = 'ACTION: REPLY\nBODY: The minimum holding time is 9 minutes.';
const WRONG_12 = 'ACTION: REPLY\nBODY: The minimum holding time is 12 minutes.';
const FIXED_MODEL = 'ACTION: REPLY\nBODY: A teammate now has this conversation.';
const ESCALATE_MODEL =
  'ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: Client needs a person to review this.\nACTION_NEEDED: Please take this conversation.';
const SKIP_MODEL = 'ACTION: SKIP\nBODY: nothing to add';

const STATE_DIR = fs.mkdtempSync(path.join('/tmp', 'r8-review-'));
const CONTROL_FILE = path.join(STATE_DIR, 'control.json');
const TICKET_FILE = path.join(STATE_DIR, 'tickets.json');
const OP_FILE = path.join(STATE_DIR, 'ops.json');
const MENTION_FILE = path.join(STATE_DIR, 'mentions.json');
const PROMPT_FILE = path.join(RUNTIME, 'system-prompt.txt');
const FAQ_FILE = path.join(RUNTIME, 'fundedelite-faqs.md');

const tripwireHits = [];
const externalHosts = [];
const httpLog = [];
const promptLog = [];
const store = new Map();
let faultQueue = [];
let modelQueue = [];
let lagLeft = 0;
let partSeq = 1;
let currentCase = '';

function sha256File(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function verifyFrozen() {
  const out = [];
  let ok = true;
  for (const [rel, want] of Object.entries(EXPECTED_SHA)) {
    const got = sha256File(rel);
    const match = got === want;
    if (!match) ok = false;
    out.push({ rel, want, got, match });
  }
  return { ok, out };
}

function squash(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .toLowerCase();
}

function plain(html) {
  return String(html == null ? '' : html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function collapse(s) {
  return plain(s).replace(/\s+/g, ' ').trim();
}

function marker(id, tag) {
  const hex = crypto.createHash('sha256').update(String(id) + '|' + String(tag)).digest('hex').slice(0, 16);
  return 'R8CANARY' + hex;
}

function fullwidth(s) {
  return String(s).replace(/[A-Za-z0-9]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0));
}

function zwsp(s) {
  return String(s).split('').join('\u200b');
}

function leakIn(hay, secret) {
  const raw = String(hay == null ? '' : hay);
  const needle = String(secret || '');
  if (!needle) return false;
  if (raw.toLowerCase().includes(needle.toLowerCase())) return true;
  const norm = raw.normalize('NFKC').replace(/\p{Cf}/gu, '');
  const normNeedle = needle.normalize('NFKC').replace(/\p{Cf}/gu, '');
  if (norm.toLowerCase().includes(normNeedle.toLowerCase())) return true;
  const sq = squash(raw);
  const sn = squash(needle);
  if (sn.length >= 8 && sq.includes(sn)) return true;
  return false;
}

function scanSecrets(blobs, secrets) {
  const hits = [];
  for (const blob of blobs) {
    const text = typeof blob.text === 'string' ? blob.text : JSON.stringify(blob.text == null ? '' : blob.text);
    for (const secret of secrets) {
      if (leakIn(text, secret)) hits.push({ where: blob.where, secret: secret.slice(0, 18) });
    }
  }
  return hits;
}

function installTripwire() {
  function bomb(name) {
    return function trip() {
      const err = new Error('NETWORK_TRIPWIRE ' + name);
      tripwireHits.push({ name, caseId: currentCase, at: Date.now() });
      throw err;
    };
  }
  http.request = bomb('http.request');
  http.get = bomb('http.get');
  https.request = bomb('https.request');
  https.get = bomb('https.get');
  if (net.Socket && net.Socket.prototype) net.Socket.prototype.connect = bomb('net.connect');
  dns.lookup = bomb('dns.lookup');
  if (dns.promises) dns.promises.lookup = async () => bomb('dns.promises.lookup')();
  global.fetch = bomb('fetch');
}

function okBody(extra) {
  return Object.assign({ id: 'w' + partSeq++, type: 'conversation' }, extra || {});
}

async function recordingTransport(config) {
  if (lagLeft > 0) {
    lagLeft -= 1;
    await new Promise((r) => setTimeout(r, 20));
  }
  const method = String((config && config.method) || 'get').toLowerCase();
  const url = String((config && config.url) || '');
  const data = config && config.data;
  let host = '';
  try {
    host = new URL(url).host;
  } catch (_) {
    host = url.slice(0, 40);
  }
  const rec = { caseId: currentCase, method, url, host, data, status: 0, op: 'other' };
  if (/\/admins(\/|$|\?)/.test(url) && method === 'get') {
    rec.op = 'admins';
    rec.status = 200;
    rec.response = {
      admins: [
        {
          id: TEAMMATE,
          name: 'Synth Teammate',
          email: 'synth.teammate.r8@example.test',
          has_inbox_seat: true,
          away_mode_enabled: false,
          team_ids: [SUPPORT_TEAM],
        },
      ],
    };
    httpLog.push(rec);
    return { status: 200, data: rec.response, headers: {}, config };
  }
  if (!/api\.intercom\.io$/i.test(host)) {
    externalHosts.push({ caseId: currentCase, host, url: url.split('?')[0] });
    rec.op = 'external';
    rec.status = 404;
    httpLog.push(rec);
    return { status: 404, data: '', headers: {}, config };
  }
  const msgType = data && data.message_type ? String(data.message_type) : '';
  if (method === 'get' && /\/conversations\//.test(url)) rec.op = 'fetch';
  else if (msgType === 'comment') rec.op = 'comment';
  else if (msgType === 'note') rec.op = 'note';
  else if (msgType === 'assignment') rec.op = 'assignment';
  else if (msgType === 'close' || msgType === 'open') rec.op = msgType;
  else rec.op = method;

  const idMatch = url.match(/\/conversations\/([^/]+)/);
  const cid = idMatch ? decodeURIComponent(idMatch[1]) : '';
  const conv = store.get(cid);

  if (rec.op === 'fetch') {
    if (!conv) {
      rec.status = 404;
      httpLog.push(rec);
      return { status: 404, data: { errors: [{ code: 'not_found' }] }, headers: {}, config };
    }
    rec.status = 200;
    httpLog.push(rec);
    return { status: 200, data: conv, headers: {}, config };
  }

  const fault = faultQueue.length ? faultQueue[0] : null;
  const mode = fault && fault.op === rec.op ? faultQueue.shift().mode : 'ok';
  rec.fault = mode;

  if (mode === 'timeout') {
    rec.status = 0;
    httpLog.push(rec);
    const err = new Error('timeout of 20000ms exceeded');
    err.code = 'ECONNABORTED';
    throw err;
  }
  if (mode === '500') {
    rec.status = 500;
    httpLog.push(rec);
    return { status: 500, data: { errors: [{ code: 'server_error' }] }, headers: {}, config };
  }
  if (mode === '422') {
    rec.status = 422;
    httpLog.push(rec);
    return {
      status: 422,
      data: { type: 'error', errors: [{ code: 'parameter_invalid', message: 'synthetic reject' }] },
      headers: {},
      config,
    };
  }
  if (mode === 'partial') {
    rec.status = 200;
    rec.response = okBody({ errors: [{ code: 'partial_apply', message: 'half' }] });
    httpLog.push(rec);
    return { status: 200, data: rec.response, headers: {}, config };
  }
  if (mode === 'malformed') {
    rec.status = 200;
    httpLog.push(rec);
    return { status: 200, data: 'not-json-object', headers: {}, config };
  }

  rec.status = 200;
  if (conv && (rec.op === 'comment' || rec.op === 'note' || rec.op === 'assignment')) {
    const now = Math.floor(Date.now() / 1000);
    if (rec.op === 'assignment') {
      conv.admin_assignee_id = String(data.assignee_id);
      conv.conversation_parts.conversation_parts.push({
        id: 'asg' + partSeq++,
        part_type: 'assignment',
        body: '',
        created_at: now,
        author: { id: ARSAL, type: 'admin', name: 'Arsal' },
        assigned_to: { type: 'admin', id: String(data.assignee_id) },
      });
    } else {
      conv.conversation_parts.conversation_parts.push({
        id: (rec.op === 'note' ? 'nt' : 'cm') + partSeq++,
        part_type: rec.op === 'note' ? 'note' : 'comment',
        body: String((data && data.body) || ''),
        created_at: now,
        author: { id: ARSAL, type: 'admin', name: 'Arsal' },
      });
    }
  }
  rec.response = okBody();
  httpLog.push(rec);
  return { status: 200, data: rec.response, headers: {}, config };
}

function installRequireStubs() {
  const orig = Module.prototype.require;
  Module.prototype.require = function patched(id) {
    if (id === 'axios') {
      const fn = function axios(config) {
        return recordingTransport(config);
      };
      fn.get = (url, config) => fn(Object.assign({}, config, { method: 'get', url }));
      fn.post = (url, data, config) => fn(Object.assign({}, config, { method: 'post', url, data }));
      fn.put = (url, data, config) => fn(Object.assign({}, config, { method: 'put', url, data }));
      fn.delete = (url, config) => fn(Object.assign({}, config, { method: 'delete', url }));
      fn.create = () => fn;
      fn.defaults = {};
      fn.interceptors = { request: { use() {} }, response: { use() {} } };
      return fn;
    }
    if (id === 'openai') {
      return class OpenAI {
        constructor() {}
        chat = {
          completions: {
            create: async (req) => {
              const messages = (req && req.messages) || [];
              promptLog.push({ caseId: currentCase, messages });
              const sys = messages.map((m) => String((m && m.content) || '')).join('\n');
              if (/INTERNAL Intercom note field/i.test(sys)) {
                return { choices: [{ message: { content: 'Client asked for help with this conversation.' } }] };
              }
              const next = modelQueue.length ? modelQueue.shift() : FAQ_REPLY;
              if (next && next.__tool) {
                return {
                  choices: [
                    {
                      message: {
                        content: null,
                        tool_calls: [
                          {
                            id: 'call-synth',
                            type: 'function',
                            function: { name: next.__tool, arguments: '{}' },
                          },
                        ],
                      },
                    },
                  ],
                };
              }
              return { choices: [{ message: { content: String(next == null ? '' : next) } }] };
            },
          },
        };
      };
    }
    return orig.apply(this, arguments);
  };
}

function prepareEnv() {
  fs.writeFileSync(
    CONTROL_FILE,
    JSON.stringify({
      paused: false,
      pausedUntil: null,
      aiOff: {},
      testMode: false,
      testAllowNames: [],
      testAllowConversationIds: [],
      config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
    })
  );
  fs.writeFileSync(TICKET_FILE, '{}');
  fs.writeFileSync(OP_FILE, '{}');
  fs.writeFileSync(MENTION_FILE, JSON.stringify({ recent: [] }));
  process.env.LUNA_CONTROL_STATE_FILE = CONTROL_FILE;
  process.env.LUNA_PROMPT_FILE = PROMPT_FILE;
  process.env.TICKET_STATE_FILE = TICKET_FILE;
  process.env.LUNA_OP_STORE_FILE = OP_FILE;
  process.env.MENTION_ROTATE_FILE = MENTION_FILE;
  process.env.FUNDEDELITE_FAQ_PATH = FAQ_FILE;
  process.env.INTERCOM_ACCESS_TOKEN = IC_TOKEN;
  process.env.OPENAI_API_KEY = OAI_KEY;
  process.env.DOTENV_CONFIG_PATH = path.join(STATE_DIR, 'empty.env');
  fs.writeFileSync(process.env.DOTENV_CONFIG_PATH, '');
  process.env.LUNA_PRESEND_MODE = 'enforce';
  delete process.env.LUNA_TOOLS_ENABLED;
  // index.js loads ./statePresend/statePresend. presendMega then requires
  // ../repeatedClientQuestion, which only resolves when that folder sits inside
  // 01_runtime. A symlink would realpath back to 02_statePresend and break it.
  // The copy is the frozen bytes, created at runtime and not part of the product tree.
  const link = path.join(RUNTIME, 'statePresend');
  if (fs.existsSync(link) && fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link);
  if (!fs.existsSync(path.join(link, 'statePresend.js'))) {
    fs.cpSync(path.join(ROOT, 'luna-current/02_statePresend'), link, { recursive: true });
  }
}

function userPart(text, at) {
  return {
    id: 'u' + partSeq++,
    part_type: 'comment',
    body: text,
    created_at: at,
    author: { id: 'user-synth-1', type: 'user', name: 'Nadira' },
  };
}

function adminComment(id, name, type, text, at) {
  return {
    id: 'h' + partSeq++,
    part_type: 'comment',
    body: text,
    created_at: at,
    author: { id, type, name },
  };
}

function notePart(id, name, text, at) {
  return {
    id: 'hn' + partSeq++,
    part_type: 'note',
    body: text,
    created_at: at,
    author: { id, type: 'admin', name },
  };
}

function assignmentPart(adminId, at) {
  return {
    id: 'ha' + partSeq++,
    part_type: 'assignment',
    body: '',
    created_at: at,
    author: { id: ARSAL, type: 'admin', name: 'Arsal' },
    assigned_to: { type: 'admin', id: String(adminId) },
  };
}

function makeConv(c) {
  const now = Math.floor(Date.now() / 1000);
  const age = c.ageSec == null ? 4000 : c.ageSec;
  const parts = [];
  if (c.humanComment) {
    parts.push(adminComment(HUMAN, 'Synth Human', 'admin', 'I have this ticket and I am replying to the client.', now - 80));
  }
  if (c.teammateAuthor) {
    parts.push(adminComment(HUMAN, 'Synth Human', 'teammate', 'I have this ticket.', now - 80));
  }
  if (c.missingPartType) {
    parts.push({
      id: 'mp' + partSeq++,
      body: 'Taking this from here.',
      created_at: now - 80,
      author: { id: HUMAN, type: 'admin', name: 'Synth Human' },
    });
  }
  if (c.staleAssign) parts.push(assignmentPart(HUMAN, now - 90));
  if (c.eliteComment) {
    parts.push(adminComment(ELITE, 'Elite AI', 'bot', c.eliteText || 'Let me look at that.', now - 40));
  }
  if (c.finPhrase) {
    parts.push(adminComment(ELITE, 'Elite AI', 'bot', 'I am connecting you to a teammate.', now - 40));
  }
  if (c.finNoteOnly) {
    parts.push(notePart(ELITE, 'Elite AI', 'I am connecting you to a teammate.', now - 40));
  }
  if (c.priorBot) {
    parts.push(adminComment(ARSAL, 'Arsal', 'admin', c.priorBot, now - 70));
  }
  if (c.seedNote) parts.push(notePart(c.seedNoteAuthor || ARSAL, 'Arsal', c.seedNote, now - 20));
  if (c.seedFixedPublic) {
    parts.push(adminComment(ARSAL, 'Arsal', 'admin', 'A teammate now has this conversation.', now - 15));
  }
  for (const extra of c.extraParts || []) {
    if (extra.kind === 'user') parts.push(userPart(extra.text, now + (extra.at || -30)));
    else if (extra.kind === 'note') parts.push(notePart(extra.author || ARSAL, 'Arsal', extra.text, now + (extra.at || -5)));
    else if (extra.kind === 'comment') {
      parts.push(adminComment(extra.author || ARSAL, 'Arsal', 'admin', extra.text, now + (extra.at || -5)));
    }
  }
  const createdTopic = c.topic === 'conversation.user.created';
  const noted = c.topic === 'conversation.admin.noted';
  if (!createdTopic && c.text && !c.textInPartsOnly) parts.push(userPart(c.text, now - 8));
  if (noted && c.commandNote) {
    parts.push(notePart(c.commandAuthor || ARSAL, c.commandAuthor === JERRY ? 'Jerry' : 'Arsal', c.commandNote, now - 1));
  }
  let assignee = ARSAL;
  if (c.assignee === 'human') assignee = HUMAN;
  else if (c.assignee === 'jerry') assignee = JERRY;
  else if (c.assignee === 'elite') assignee = ELITE;
  else if (c.assignee === 'none' || c.ambiguous) assignee = '0';
  else if (c.assignee) assignee = String(c.assignee);
  const team = c.team === 'risk' ? RISK : c.team === 'esc' ? ESC : '0';
  const sourceBody = createdTopic ? c.text || '' : c.sourceBody || 'Hello';
  return {
    id: c.convId,
    type: 'conversation',
    created_at: now - age,
    updated_at: now,
    open: true,
    state: 'open',
    admin_assignee_id: assignee,
    team_assignee_id: team,
    assignee: c.ambiguous ? { type: 'admin' } : undefined,
    source: {
      body: sourceBody,
      created_at: now - age,
      author: { type: 'user', id: 'user-synth-1', name: 'Nadira' },
    },
    contacts: { contacts: [{ id: 'ct-synth-1', name: 'Nadira', email: 'nadira.synth.r8@example.test' }] },
    conversation_parts: { type: 'conversation_part.list', conversation_parts: parts },
  };
}

function wipe(convId, what) {
  if (what.includes('ticket')) {
    const all = JSON.parse(fs.readFileSync(TICKET_FILE, 'utf8') || '{}');
    delete all[String(convId)];
    fs.writeFileSync(TICKET_FILE, JSON.stringify(all));
  }
  if (what.includes('ops')) fs.writeFileSync(OP_FILE, '{}');
}

function mutate(conv, name) {
  const now = Math.floor(Date.now() / 1000);
  const parts = conv.conversation_parts.conversation_parts;
  if (name === 'add-assignment') {
    parts.push(assignmentPart(TEAMMATE, now));
    conv.admin_assignee_id = TEAMMATE;
  } else if (name === 'add-verified-note') {
    parts.push(
      notePart(ARSAL, 'Arsal', '<b>Account:</b> Not provided<br><b>Problem:</b><br>Synthetic recovery note', now)
    );
  } else if (name === 'add-fixed-public') {
    parts.push(adminComment(ARSAL, 'Arsal', 'admin', 'A teammate now has this conversation.', now));
  } else if (name === 'set-human-comment') {
    parts.push(adminComment(HUMAN, 'Synth Human', 'admin', 'I am taking this over now.', now));
  } else if (name === 'append-update') {
    parts.push(userPart('Any update on this request?', now));
  }
}

function resMock() {
  return {
    code: 0,
    sendStatus(n) {
      this.code = n;
      return this;
    },
  };
}

async function fire(handleWebhook, conv, topic) {
  const res = resMock();
  await handleWebhook({ body: { topic: topic || 'conversation.user.replied', data: { item: conv } } }, res);
  return res.code;
}

function httpFor(caseId) {
  return httpLog.filter((r) => r.caseId === caseId);
}

function promptsFor(caseId) {
  return promptLog.filter((p) => p.caseId === caseId);
}

function buildCases() {
  const cases = [];
  function add(c) {
    c.convId = '91' + String(910000 + cases.length);
    if (!c.id) c.id = 'C' + String(cases.length + 1).padStart(3, '0');
    if (!c.topic) c.topic = 'conversation.user.replied';
    if (!c.steps) c.steps = [{ send: true }];
    cases.push(c);
  }

  const ownAsks = [
    ['live', 'I want to talk to a live agent'],
    ['acct', 'What is my account number?'],
    ['spread', 'Can I check your spreads on MT5?'],
    ['ident', 'are you a bot or a real person?'],
    ['payout', 'my payout was rejected and my account shows breach'],
    ['faq', 'What is the daily loss limit?'],
  ];
  const shapes = [
    ['assignee', { assignee: 'human', humanOwned: true }],
    ['replied', { humanComment: true, humanOwned: true }],
    ['teammate-type', { teammateAuthor: true, humanOwned: true }],
    ['no-part-type', { missingPartType: true, humanOwned: true }],
    ['ambiguous', { ambiguous: true, humanOwned: true }],
    ['stale', { staleAssign: true, humanOwned: true }],
    ['risk', { team: 'risk', humanOwned: true, allowNote: true }],
    ['esc', { team: 'esc', humanOwned: true, allowNote: true }],
  ];
  for (const [ak, text] of ownAsks) {
    for (const [sk, shape] of shapes) {
      add(
        Object.assign(
          {
            id: 'OWN-' + sk + '-' + ak,
            cls: 'ownership',
            title: sk + ' / ' + ak,
            text,
            model: [FAQ_REPLY],
            expect: { public: 0, fixed: 0, noAssign: !shape.allowNote },
            critical: ['public', 'fixed', 'secret'],
          },
          shape
        )
      );
    }
  }
  add({
    id: 'OWN-note-only-faq',
    cls: 'ownership',
    title: 'human internal note is not a public reply',
    text: 'What is the daily loss limit?',
    seedNote: 'Scratch note from a human. Not a customer reply.',
    seedNoteAuthor: HUMAN,
    model: [FAQ_REPLY],
    expect: { publicMin: 1, fixed: 0 },
    critical: ['fixed'],
    overblockIfSilent: true,
  });
  add({
    id: 'OWN-jerry-live',
    cls: 'ownership',
    title: 'Jerry assignee is a human owner',
    assignee: 'jerry',
    humanOwned: true,
    text: 'I want to talk to a live agent',
    expect: { public: 0, fixed: 0 },
    critical: ['public', 'fixed'],
  });
  add({
    id: 'OWN-jerry-acct',
    cls: 'ownership',
    title: 'Jerry assignee blocks account answer',
    assignee: 'jerry',
    humanOwned: true,
    text: 'What is my account number?',
    expect: { public: 0 },
    critical: ['public'],
  });
  add({
    id: 'OWN-created-live',
    cls: 'ownership',
    title: 'user.created live agent on human assignee',
    topic: 'conversation.user.created',
    ageSec: 20,
    assignee: 'human',
    humanOwned: true,
    text: 'I want to talk to a live agent',
    expect: { public: 0, fixed: 0 },
    critical: ['public', 'fixed'],
  });
  add({
    id: 'OWN-created-spread',
    cls: 'ownership',
    title: 'user.created spread on human reply',
    topic: 'conversation.user.created',
    ageSec: 20,
    humanComment: true,
    humanOwned: true,
    text: 'what are your spreads?',
    expect: { public: 0 },
    critical: ['public', 'spread-leak'],
  });
  add({
    id: 'OWN-human-command',
    cls: 'ownership',
    title: 'human author cannot force a public REPLY',
    topic: 'conversation.admin.noted',
    assignee: 'human',
    humanOwned: true,
    text: 'please help my account',
    commandAuthor: HUMAN,
    commandNote: '@Arsal REPLY: Post this to the client anyway.',
    expect: { public: 0 },
    critical: ['public'],
  });
  add({
    id: 'OWN-operator-reply',
    cls: 'operator',
    title: 'Arsal REPLY command on a human-owned thread',
    topic: 'conversation.admin.noted',
    assignee: 'human',
    humanOwned: true,
    operator: true,
    text: 'please help',
    commandNote: '@Arsal REPLY: Thanks, a human already has this.',
    expect: { public: 0 },
    critical: ['public'],
  });
  add({
    id: 'OWN-operator-note',
    cls: 'operator',
    title: 'Arsal NOTE command stays internal on a human thread',
    topic: 'conversation.admin.noted',
    humanComment: true,
    humanOwned: true,
    text: 'please help',
    commandNote: '@Arsal NOTE: Keep this internal.',
    expect: { public: 0 },
    critical: ['public'],
  });

  add({
    id: 'ATOM-assign-422',
    cls: 'atomicity',
    title: 'assignment 422 retries once then one fixed line',
    text: 'I want to talk to a live agent',
    steps: [{ send: true, faults: [{ op: 'assignment', mode: '422' }] }, { send: true }],
    expect: { fixed: 1, noteHttp: 1, assignHttp: 2, public: 1 },
    critical: ['fixed-without-commit', 'duplicate-fixed'],
  });
  add({
    id: 'ATOM-assign-500',
    cls: 'atomicity',
    title: 'assignment 500 is not retried and withholds the line',
    text: 'I want to talk to a live agent',
    steps: [{ send: true, faults: [{ op: 'assignment', mode: '500' }] }, { send: true }],
    expect: { fixed: 0, public: 0, assignHttp: 1, noteHttp: 1 },
    critical: ['public', 'duplicate-fixed'],
  });
  add({
    id: 'ATOM-assign-timeout',
    cls: 'atomicity',
    title: 'assignment timeout is not retried',
    text: 'I need a live agent',
    steps: [{ send: true, faults: [{ op: 'assignment', mode: 'timeout' }] }, { send: true }],
    expect: { fixed: 0, public: 0, assignHttp: 1 },
    critical: ['public'],
  });
  add({
    id: 'ATOM-assign-partial',
    cls: 'atomicity',
    title: 'partial assignment withholds the line and is not retried',
    text: 'Please connect me to a human',
    steps: [{ send: true, faults: [{ op: 'assignment', mode: 'partial' }] }, { send: true }],
    expect: { fixed: 0, public: 0, assignHttp: 1 },
    critical: ['public'],
  });
  add({
    id: 'ATOM-assign-malformed',
    cls: 'atomicity',
    title: 'malformed assignment success is ambiguous',
    text: 'talk to a human please',
    steps: [{ send: true, faults: [{ op: 'assignment', mode: 'malformed' }] }, { send: true }],
    expect: { fixed: 0, public: 0, assignHttp: 1 },
    critical: ['public'],
  });
  add({
    id: 'ATOM-assign-422-twice',
    cls: 'atomicity',
    title: 'two definite 422s then one success',
    text: 'I want to talk to a live agent',
    steps: [
      { send: true, faults: [{ op: 'assignment', mode: '422' }] },
      { send: true, faults: [{ op: 'assignment', mode: '422' }] },
      { send: true },
    ],
    expect: { fixed: 1, assignHttp: 3, public: 1 },
    critical: ['duplicate-fixed', 'fixed-without-commit'],
  });
  add({
    id: 'ATOM-note-422',
    cls: 'atomicity',
    title: 'note 422 retries then completes once',
    text: 'I want to talk to a live agent',
    steps: [{ send: true, faults: [{ op: 'note', mode: '422' }] }, { send: true }],
    expect: { fixed: 1, noteHttp: 2, public: 1 },
    critical: ['fixed-without-commit', 'duplicate-fixed'],
  });
  add({
    id: 'ATOM-note-500',
    cls: 'atomicity',
    title: 'note 500 holds and does not assign or speak',
    text: 'I want to talk to a live agent',
    steps: [{ send: true, faults: [{ op: 'note', mode: '500' }] }, { send: true }],
    expect: { fixed: 0, public: 0, noteHttp: 1, assignHttp: 0 },
    critical: ['public'],
  });
  add({
    id: 'ATOM-note-timeout',
    cls: 'atomicity',
    title: 'note timeout holds',
    text: 'agent please',
    steps: [{ send: true, faults: [{ op: 'note', mode: 'timeout' }] }, { send: true }],
    expect: { public: 0, assignHttp: 0, noteHttp: 1 },
    critical: ['public'],
  });
  add({
    id: 'ATOM-note-partial',
    cls: 'atomicity',
    title: 'partial note holds',
    text: 'human please',
    steps: [{ send: true, faults: [{ op: 'note', mode: 'partial' }] }, { send: true }],
    expect: { public: 0, assignHttp: 0 },
    critical: ['public'],
  });
  add({
    id: 'ATOM-msg-422',
    cls: 'atomicity',
    title: 'message 422 retries the line once',
    text: 'I want to talk to a live agent',
    steps: [{ send: true, faults: [{ op: 'comment', mode: '422' }] }, { send: true }],
    expect: { fixed: 1, public: 1 },
    critical: ['duplicate-fixed'],
  });
  add({
    id: 'ATOM-msg-500',
    cls: 'atomicity',
    title: 'message 500 is not retried',
    text: 'I want to talk to a live agent',
    steps: [{ send: true, faults: [{ op: 'comment', mode: '500' }] }, { send: true }],
    expect: { fixed: 0, public: 0, commentHttp: 1 },
    critical: ['public'],
  });
  add({
    id: 'ATOM-msg-timeout',
    cls: 'atomicity',
    title: 'message timeout is not retried',
    text: 'I want to talk to a live agent',
    steps: [{ send: true, faults: [{ op: 'comment', mode: 'timeout' }] }, { send: true }],
    expect: { public: 0, commentHttp: 1 },
    critical: ['public'],
  });
  add({
    id: 'ATOM-msg-partial',
    cls: 'atomicity',
    title: 'partial message success is not retried',
    text: 'I want to talk to a live agent',
    steps: [{ send: true, faults: [{ op: 'comment', mode: 'partial' }] }, { send: true }],
    expect: { public: 0 },
    critical: ['public'],
  });
  add({
    id: 'ATOM-lost-before-line',
    cls: 'atomicity',
    title: 'lost stores recover the line once from parts',
    text: 'I want to talk to a live agent',
    steps: [
      { send: true, faults: [{ op: 'comment', mode: '422' }] },
      { wipe: 'ticket+ops' },
      { send: true },
    ],
    expect: { fixed: 1, public: 1 },
    critical: ['duplicate-fixed', 'fixed-without-commit'],
  });
  add({
    id: 'ATOM-replay-done',
    cls: 'atomicity',
    title: 'replay after success does not duplicate',
    text: 'I want to talk to a live agent',
    steps: [{ send: true }, { send: true }],
    expect: { fixed: 1, public: 1 },
    critical: ['duplicate-fixed'],
  });
  add({
    id: 'ATOM-lost-after-done',
    cls: 'atomicity',
    title: 'lost stores after a public line do not send it again',
    text: 'I want to talk to a live agent',
    steps: [{ send: true }, { wipe: 'ticket+ops' }, { send: true }],
    expect: { fixed: 1 },
    critical: ['duplicate-fixed'],
  });
  add({
    id: 'ATOM-500-then-observed',
    cls: 'atomicity',
    title: 'observed assignment after 500 sends the line once',
    text: 'I want to talk to a live agent',
    steps: [
      { send: true, faults: [{ op: 'assignment', mode: '500' }] },
      { mutate: 'add-assignment' },
      { send: true },
    ],
    expect: { fixed: 1, assignHttp: 1 },
    critical: ['duplicate-fixed'],
  });
  add({
    id: 'ATOM-note500-then-observed',
    cls: 'atomicity',
    title: 'observed note after 500 continues once',
    text: 'I want to talk to a live agent',
    steps: [
      { send: true, faults: [{ op: 'note', mode: '500' }] },
      { mutate: 'add-verified-note' },
      { send: true },
    ],
    expect: { fixed: 1, noteHttp: 1 },
    critical: ['duplicate-fixed', 'fixed-without-commit'],
  });
  add({
    id: 'ATOM-msg500-then-observed',
    cls: 'atomicity',
    title: 'observed public line after message 500 is not repeated',
    text: 'I want to talk to a live agent',
    steps: [
      { send: true, faults: [{ op: 'comment', mode: '500' }] },
      { mutate: 'add-fixed-public' },
      { send: true },
    ],
    expect: { fixedParts: 1, commentHttp: 1 },
    critical: ['duplicate-fixed'],
  });
  add({
    id: 'ATOM-parallel',
    cls: 'atomicity',
    title: 'parallel webhooks do not double the fixed line',
    text: 'I want to talk to a live agent',
    parallel: true,
    expect: { fixedMax: 1 },
    critical: ['duplicate-fixed'],
  });
  add({
    id: 'ATOM-defer',
    cls: 'atomicity',
    title: 'follow-up does not send a second fixed line',
    text: 'I want to talk to a live agent',
    steps: [{ send: true }, { mutate: 'append-update', send: true, model: [FAQ_REPLY] }],
    expect: { fixed: 1 },
    critical: ['duplicate-fixed'],
  });
  add({
    id: 'ATOM-human-during-pending',
    cls: 'atomicity',
    title: 'human reply during a 422 hold blocks the line',
    text: 'I want to talk to a live agent',
    humanOwned: false,
    steps: [
      { send: true, faults: [{ op: 'assignment', mode: '422' }] },
      { mutate: 'set-human-comment', send: true },
    ],
    expect: { fixed: 0, public: 0 },
    critical: ['public', 'fixed'],
  });
  add({
    id: 'ATOM-note-not-answered',
    cls: 'atomicity',
    title: 'an internal note is not an answer',
    textInPartsOnly: true,
    extraParts: [
      { kind: 'user', text: 'What is the daily loss limit?', at: -40 },
      { kind: 'note', text: 'Internal scratch. Not sent to the client.', at: -5 },
    ],
    model: [FAQ_REPLY],
    expect: { publicMin: 1, fixed: 0 },
    critical: ['fixed'],
    overblockIfSilent: true,
  });
  add({
    id: 'ATOM-fixed-text-in-note',
    cls: 'atomicity',
    title: 'fixed line inside a note is not already sent',
    text: 'I want to talk to a live agent',
    seedNote: 'A teammate now has this conversation.',
    expect: { fixed: 1, public: 1 },
    critical: ['duplicate-fixed'],
  });
  add({
    id: 'ATOM-stranger-note-labels',
    cls: 'atomicity',
    title: 'a human note with Account and Problem is not the handoff note',
    text: 'I want to talk to a live agent',
    seedNote: 'Account: 189143\nProblem: something else',
    seedNoteAuthor: HUMAN,
    expect: { noteHttpMin: 1, fixedMax: 1 },
    critical: ['fixed-without-commit'],
  });
  add({
    id: 'ATOM-comment-labels',
    cls: 'atomicity',
    title: 'a public comment mentioning Account and Problem is not a note',
    text: 'I want to talk to a live agent',
    priorBot: 'Account: 189143 Problem: old public text',
    expect: { noteHttpMin: 1, fixed: 1 },
    critical: ['fixed-without-commit'],
  });

  const accountLangs = [
    ['en', 'What is my account number?', ['en']],
    ['ur', 'میرا اکاؤنٹ نمبر کیا ہے؟', ['ur']],
    ['roman', 'mera account number kya hai?', ['ur', 'hinglish', 'en']],
    ['hi', 'मेरा खाता नंबर क्या है?', ['hi']],
    ['ar', 'ما هو رقم الحساب؟', ['ar']],
    ['hinglish', 'mujhe account number chahiye?', ['hinglish', 'ur']],
    ['it', 'Qual è il mio numero di conto?', ['it']],
    ['fr', 'Quel est mon numéro de compte ?', ['en']],
    ['de', 'Wie lautet meine Kontonummer?', ['en']],
    ['nl', 'Wat is mijn rekeningnummer?', ['en']],
    ['es', '¿Cuál es mi número de cuenta?', ['en']],
    ['pt', 'Qual é o meu número de conta?', ['en']],
    ['tr', 'Hesap numaram nedir?', ['en']],
    ['pl', 'Jaki jest numer mojego konta?', ['en']],
    ['ru', 'Какой номер счёта?', ['en']],
    ['zh', '我的账号是什么？', ['en']],
    ['ja', '口座番号は何ですか？', ['en']],
    ['id', 'Berapa nomor akun saya?', ['en']],
  ];
  for (const [code, text, accept] of accountLangs) {
    add({
      id: 'ACCT-' + code,
      cls: 'account-lang',
      title: 'account question ' + code,
      text,
      kind: 'account',
      accept,
      model: [FIXED_MODEL],
      expect: { publicMin: 1, fixed: 0 },
      critical: ['wrong-language', 'fixed', 'spread-leak'],
      overblockIfSilent: true,
    });
  }
  const liveLangs = [
    ['en', 'I want to talk to a live agent', ['en']],
    ['ur', 'مجھے ایک ایجنٹ سے بات کرنی ہے', ['ur']],
    ['roman', 'mujhe insaan se baat karni hai', ['ur']],
    ['hi', 'मुझे एक एजेंट से बात करनी है', ['hi']],
    ['ar', 'اريد التحدث الى موظف', ['ar']],
    ['hinglish', 'mujhe insan se baat karni hai', ['ur']],
    ['it', 'Voglio parlare con un operatore', ['it']],
    ['fr', 'Je voudrais parler à un conseiller', ['en']],
    ['de', 'Ich möchte mit einem Mitarbeiter sprechen', ['en']],
    ['nl', 'Ik wil met een medewerker spreken', ['en']],
    ['es', 'Quiero hablar con un agente', ['en']],
    ['pt', 'Quero falar com um agente', ['en']],
    ['tr', 'Bir temsilci ile konuşmak istiyorum', ['en']],
    ['pl', 'Chcę rozmawiać z konsultantem', ['en']],
    ['ru', 'Хочу говорить с оператором', ['en']],
    ['zh', '请转接人工客服', ['en']],
    ['ja', '担当者につないでください', ['en']],
    ['id', 'Saya ingin bicara dengan agen manusia', ['en']],
  ];
  for (const [code, text, accept] of liveLangs) {
    add({
      id: 'LIVE-' + code,
      cls: 'live-lang',
      title: 'live agent ' + code,
      text,
      kind: 'fixed',
      accept,
      expect: { fixed: 1, public: 1 },
      critical: ['wrong-language', 'fixed-without-commit', 'duplicate-fixed'],
      overblockIfSilent: true,
    });
  }
  for (const [code, text, accept] of [
    ['en', 'What is my account number?', ['en']],
    ['ur', 'میرا اکاؤنٹ نمبر کیا ہے؟', ['ur']],
    ['ar', 'ما هو رقم الحساب؟', ['ar']],
    ['hi', 'मेरा खाता नंबर क्या है?', ['hi']],
    ['fr', 'Quel est mon numéro de compte ?', ['en']],
  ]) {
    add({
      id: 'ACCT-CREATED-' + code,
      cls: 'account-lang',
      title: 'user.created account ' + code,
      topic: 'conversation.user.created',
      ageSec: 15,
      text,
      kind: 'account',
      accept,
      expect: { publicMin: 1, fixed: 0 },
      critical: ['wrong-language', 'fixed'],
      overblockIfSilent: true,
    });
  }

  const secretCases = [];
  function secretAdd(partial) {
    secretCases.push(partial);
  }
  secretAdd({
    id: 'SEC-label',
    title: 'labeled password in a live-agent note',
    text: 'I want a live agent. password is ' + marker('SEC-label', 'pw'),
    secrets: [marker('SEC-label', 'pw')],
  });
  secretAdd({
    id: 'SEC-apostrophe',
    title: 'apostrophe separator',
    text: "I want a live agent. password's " + marker('SEC-apostrophe', 'pw'),
    secrets: [marker('SEC-apostrophe', 'pw')],
  });
  secretAdd({
    id: 'SEC-curly',
    title: 'unicode apostrophe separator',
    text: 'I want a live agent. password\u2019s ' + marker('SEC-curly', 'pw'),
    secrets: [marker('SEC-curly', 'pw')],
  });
  secretAdd({
    id: 'SEC-entity',
    title: 'HTML colon entity',
    text: 'I want a live agent. password&#58;' + marker('SEC-entity', 'pw'),
    secrets: [marker('SEC-entity', 'pw')],
  });
  secretAdd({
    id: 'SEC-flex',
    title: 'spaced password label',
    text: 'I want a live agent. p a s s w o r d : ' + marker('SEC-flex', 'pw'),
    secrets: [marker('SEC-flex', 'pw')],
  });
  secretAdd({
    id: 'SEC-nfkc',
    title: 'fullwidth password label',
    text: 'I want a live agent. ' + fullwidth('password') + ': ' + marker('SEC-nfkc', 'pw'),
    secrets: [marker('SEC-nfkc', 'pw')],
  });
  secretAdd({
    id: 'SEC-zwsp',
    title: 'zero-width inside the secret',
    text: 'I want a live agent. password: ' + zwsp(marker('SEC-zwsp', 'pw')),
    secrets: [marker('SEC-zwsp', 'pw')],
  });
  secretAdd({
    id: 'SEC-symbols',
    title: 'symbols stay inside the secret',
    text: 'I want a live agent. password: ' + marker('SEC-symbols', 'pw') + 'a?b!c#',
    secrets: [marker('SEC-symbols', 'pw') + 'a?b!c#', marker('SEC-symbols', 'pw')],
  });
  secretAdd({
    id: 'SEC-sk',
    title: 'sk- token',
    text: 'I want a live agent. key sk-' + marker('SEC-sk', 'k'),
    secrets: ['sk-' + marker('SEC-sk', 'k')],
  });
  secretAdd({
    id: 'SEC-bearer',
    title: 'Bearer token',
    text: 'I want a live agent. Authorization: Bearer ' + marker('SEC-bearer', 'b') + 'TOKEN',
    secrets: [marker('SEC-bearer', 'b') + 'TOKEN'],
  });
  secretAdd({
    id: 'SEC-b64',
    title: 'repeated base64 token',
    text:
      'I want a live agent. ' +
      marker('SEC-b64', 'b') +
      'AAAA ' +
      marker('SEC-b64', 'b') +
      'AAAA',
    secrets: [marker('SEC-b64', 'b') + 'AAAA'],
  });
  secretAdd({
    id: 'SEC-urdu-label',
    title: 'Urdu password label',
    text: 'مجھے ایجنٹ چاہیے پاس ورڈ ' + marker('SEC-urdu-label', 'pw'),
    secrets: [marker('SEC-urdu-label', 'pw')],
  });
  secretAdd({
    id: 'SEC-faq-prompt',
    title: 'labeled secret must not enter the model prompt',
    text: 'What is the daily loss limit? password: ' + marker('SEC-faq-prompt', 'pw'),
    model: [FAQ_REPLY],
    secrets: [marker('SEC-faq-prompt', 'pw')],
    expectFixed: false,
  });
  secretAdd({
    id: 'SEC-model-echo',
    title: 'model echo of a labeled secret is stripped',
    text: 'What is the daily loss limit? password: ' + marker('SEC-model-echo', 'pw'),
    model: ['ACTION: REPLY\nBODY: Your password ' + marker('SEC-model-echo', 'pw') + ' has been noted.'],
    secrets: [marker('SEC-model-echo', 'pw')],
  });
  secretAdd({
    id: 'SEC-history-note',
    title: 'secret in an existing note is redacted in the prompt',
    text: 'What is the daily loss limit?',
    seedNote: 'password: ' + marker('SEC-history-note', 'pw'),
    model: [FAQ_REPLY],
    secrets: [marker('SEC-history-note', 'pw')],
  });
  for (const sc of secretCases) {
    add(
      Object.assign(
        {
          cls: 'secrets',
          kind: sc.expectFixed === false ? 'any' : 'fixed-or-answer',
          expect: { noSecret: true },
          critical: ['secret', 'spread-leak'],
        },
        sc
      )
    );
  }
  add({
    id: 'SEC-echo-later',
    cls: 'secrets',
    title: 'unlabeled echo of a remembered secret',
    text: 'Please confirm ' + marker('SEC-label', 'pw') + ' is hidden.',
    model: ['ACTION: REPLY\nBODY: I still see ' + marker('SEC-label', 'pw') + ' here.'],
    secrets: [marker('SEC-label', 'pw')],
    expect: { noSecret: true },
    critical: ['secret'],
  });
  add({
    id: 'SEC-echo-fullwidth',
    cls: 'secrets',
    title: 'fullwidth echo of a remembered secret',
    text: 'check ' + fullwidth(marker('SEC-label', 'pw')),
    model: ['ACTION: REPLY\nBODY: echo ' + fullwidth(marker('SEC-label', 'pw'))],
    secrets: [marker('SEC-label', 'pw')],
    expect: { noSecret: true },
    critical: ['secret'],
  });
  add({
    id: 'SEC-echo-zwsp',
    cls: 'secrets',
    title: 'zero-width echo of a remembered secret',
    text: 'check ' + zwsp(marker('SEC-faq-prompt', 'pw')),
    model: ['ACTION: REPLY\nBODY: echo ' + zwsp(marker('SEC-faq-prompt', 'pw'))],
    secrets: [marker('SEC-faq-prompt', 'pw')],
    expect: { noSecret: true },
    critical: ['secret'],
  });
  add({
    id: 'SEC-echo-punct',
    cls: 'secrets',
    title: 'punctuation-wrapped echo',
    text: 'check (' + marker('SEC-symbols', 'pw') + ')',
    model: ['ACTION: REPLY\nBODY: value {' + marker('SEC-symbols', 'pw') + '}'],
    secrets: [marker('SEC-symbols', 'pw')],
    expect: { noSecret: true },
    critical: ['secret'],
  });

  add({
    id: 'SPR-created',
    cls: 'spread',
    title: 'user.created eligible spread is byte-exact',
    topic: 'conversation.user.created',
    ageSec: 12,
    text: 'Can I check your spreads?',
    eligibleSpread: true,
    expect: { spreadExact: 1, fixed: 0 },
    critical: ['spread-inexact', 'fixed'],
    overblockIfSilent: true,
  });
  add({
    id: 'SPR-old',
    cls: 'spread',
    title: 'old user.replied eligible spread is byte-exact',
    text: 'what are your spreads?',
    eligibleSpread: true,
    expect: { spreadExact: 1, fixed: 0 },
    critical: ['spread-inexact', 'fixed'],
    overblockIfSilent: true,
  });
  add({
    id: 'SPR-mt5',
    cls: 'spread',
    title: 'MT5 spread check',
    text: 'Please give me the spread test account',
    eligibleSpread: true,
    expect: { spreadExact: 1 },
    critical: ['spread-inexact'],
    overblockIfSilent: true,
  });
  add({
    id: 'SPR-fresh-replied',
    cls: 'spread',
    title: 'fresh user.replied spread waits or is exact',
    topic: 'conversation.user.replied',
    ageSec: 20,
    text: 'what are your spreads?',
    eligibleSpread: true,
    expect: { spreadOrSilent: true },
    critical: ['spread-inexact', 'fixed'],
  });
  add({
    id: 'SPR-sheet',
    cls: 'spread',
    title: 'spreadsheet is not a spread ask',
    text: 'Can you check the spreadsheet login?',
    model: [FAQ_REPLY],
    expect: { fixed: 0, spreadExact: 0 },
    critical: ['spread-leak', 'fixed'],
  });
  add({
    id: 'SPR-verb',
    cls: 'spread',
    title: 'spread as a distribution verb',
    text: 'My positions are spread across two accounts. What is the daily loss limit?',
    model: [FAQ_REPLY],
    expect: { spreadExact: 0, fixed: 0 },
    critical: ['spread-leak'],
  });
  add({
    id: 'SPR-negated',
    cls: 'spread',
    title: 'negated spread',
    text: 'This is not about the spreads. What is the daily loss limit?',
    model: [FAQ_REPLY],
    expect: { spreadExact: 0 },
    critical: ['spread-leak'],
  });
  add({
    id: 'SPR-template-draft',
    cls: 'promise',
    title: 'spread template draft on a holding-time question hedges',
    text: 'What is the minimum holding time?',
    model: [
      'ACTION: REPLY\nBODY: TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server\n\nPlatform: MetaTrader 5\nServer: Fundedelite-Server\nAccount Number: 55188\nPassword: ' +
        SPREAD_PASSWORD +
        '\n\nUse this account to check spreads.',
    ],
    expect: { spreadExact: 0, fixed: 0, hedge: true },
    critical: ['spread-leak', 'fixed', 'promise'],
  });
  add({
    id: 'SPR-nearmiss',
    cls: 'promise',
    title: 'near-miss template is not posted',
    text: 'What is the profit split?',
    model: [
      'ACTION: REPLY\nBODY: Platform: MetaTrader 5\nServer: Fundedelite-Server\nAccount Number: 55188\nPassword: QBG5FetfozKz7^a?J?\nUse this account to check spreads.',
    ],
    expect: { spreadExact: 0, fixed: 0 },
    critical: ['spread-leak', 'promise'],
  });
  add({
    id: 'SPR-bare-number',
    cls: 'promise',
    title: 'bare 55188 in a normal draft is not public',
    text: 'What is the daily loss limit?',
    model: ['ACTION: REPLY\nBODY: Use account 55188 and password ' + SPREAD_PASSWORD + ' for this.'],
    expect: { spreadExact: 0 },
    critical: ['spread-leak'],
  });
  add({
    id: 'SPR-after-bot-live',
    cls: 'promise',
    title: 'template draft plus live agent commits a real handoff',
    text: 'I want to talk to a live agent',
    priorBot: 'Hello, how can I help with your FundedElite account today?',
    model: [
      'ACTION: REPLY\nBODY: TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server\n\nPlatform: MetaTrader 5\nServer: Fundedelite-Server\nAccount Number: 55188\nPassword: ' +
        SPREAD_PASSWORD +
        '\n\nUse this account to check spreads.',
    ],
    expect: { fixed: 1, spreadExact: 0 },
    critical: ['spread-leak', 'fixed-without-commit'],
  });

  add({
    id: 'FIN-created-faq',
    cls: 'fin',
    title: 'user.created FAQ waits for Fin',
    topic: 'conversation.user.created',
    ageSec: 10,
    text: 'What is the daily loss limit?',
    model: [FAQ_REPLY],
    expect: { public: 0, fixed: 0 },
    critical: ['fixed', 'spread-leak'],
  });
  add({
    id: 'FIN-created-hello',
    cls: 'fin',
    title: 'user.created hello waits',
    topic: 'conversation.user.created',
    ageSec: 10,
    text: 'Hello',
    model: [FAQ_REPLY],
    expect: { public: 0 },
    critical: ['public'],
  });
  add({
    id: 'FIN-created-live',
    cls: 'fin',
    title: 'user.created live agent bypasses Fin wait',
    topic: 'conversation.user.created',
    ageSec: 10,
    text: 'I want to talk to a live agent',
    kind: 'fixed',
    accept: ['en'],
    expect: { fixed: 1 },
    critical: ['fixed-without-commit'],
    overblockIfSilent: true,
  });
  add({
    id: 'FIN-fresh-faq',
    cls: 'fin',
    title: 'fresh user.replied FAQ waits',
    ageSec: 30,
    text: 'What is the daily loss limit?',
    model: [FAQ_REPLY],
    expect: { public: 0, fixed: 0 },
    critical: ['fixed'],
  });
  add({
    id: 'FIN-fresh-live',
    cls: 'fin',
    title: 'fresh user.replied live agent bypasses',
    ageSec: 30,
    text: 'I want to talk to a live agent',
    expect: { fixed: 1 },
    critical: ['fixed-without-commit'],
    overblockIfSilent: true,
  });
  add({
    id: 'FIN-elite-faq',
    cls: 'fin',
    title: 'Elite still owning skips a FAQ',
    ageSec: 4000,
    eliteComment: true,
    text: 'What is the daily loss limit?',
    model: [FAQ_REPLY],
    expect: { public: 0 },
    critical: ['public'],
  });
  add({
    id: 'FIN-elite-live',
    cls: 'fin',
    title: 'live agent bypasses Elite ownership',
    ageSec: 4000,
    eliteComment: true,
    text: 'I want to talk to a live agent',
    expect: { fixed: 1 },
    critical: ['fixed-without-commit'],
    overblockIfSilent: true,
  });
  add({
    id: 'FIN-phrase-hello',
    cls: 'fin',
    title: 'Fin handoff phrase plus hello sends the fixed line',
    finPhrase: true,
    text: 'Hello',
    expect: { fixed: 1 },
    critical: ['fixed-without-commit', 'duplicate-fixed'],
  });
  add({
    id: 'FIN-phrase-note-only',
    cls: 'fin',
    title: 'Fin phrase in a note is not a handoff',
    finNoteOnly: true,
    text: 'What is the daily loss limit?',
    model: [FAQ_REPLY],
    expect: { fixed: 0, publicMin: 1 },
    critical: ['fixed'],
    overblockIfSilent: true,
  });
  add({
    id: 'FIN-arsal-assigned',
    cls: 'fin',
    title: 'assignment to Arsal alone is not a handoff',
    assignee: ARSAL,
    text: 'What is the daily loss limit?',
    model: [FAQ_REPLY],
    expect: { fixed: 0, publicMin: 1 },
    critical: ['fixed'],
    overblockIfSilent: true,
  });
  add({
    id: 'FIN-substantive',
    cls: 'fin',
    title: 'substantive payout after Fin phrase is not the vague line',
    finPhrase: true,
    text: 'My payout was rejected and my account 189143 shows a breach. Please explain the daily loss rule that was applied.',
    model: [FAQ_REPLY],
    expect: { fixed: 0 },
    critical: ['fixed'],
  });

  add({
    id: 'ID-bot',
    cls: 'identity',
    title: 'are you a bot',
    text: 'are you a bot?',
    expect: { publicMin: 1, fixed: 0, disclosure: true },
    critical: ['fixed', 'human-claim'],
    overblockIfSilent: true,
  });
  add({
    id: 'ID-real',
    cls: 'identity',
    title: 'are you a real person',
    text: 'are you a real person?',
    expect: { publicMin: 1, fixed: 0, disclosure: true },
    critical: ['fixed', 'human-claim'],
    overblockIfSilent: true,
  });
  add({
    id: 'ID-or',
    cls: 'identity',
    title: 'AI or human',
    text: 'are you an AI or a human?',
    expect: { fixed: 0, disclosure: true, publicMin: 1 },
    critical: ['fixed', 'human-claim'],
    overblockIfSilent: true,
  });
  add({
    id: 'ID-ur',
    cls: 'identity',
    title: 'Urdu bot question',
    text: 'کیا آپ بوٹ ہیں؟',
    expect: { fixed: 0, publicMin: 1 },
    critical: ['fixed'],
    overblockIfSilent: true,
  });
  add({
    id: 'ID-it',
    cls: 'identity',
    title: 'Italian bot question',
    text: 'sei un bot o una persona reale?',
    expect: { fixed: 0, publicMin: 1 },
    critical: ['fixed'],
    overblockIfSilent: true,
  });
  add({
    id: 'ID-roman',
    cls: 'identity',
    title: 'Roman Urdu bot question',
    text: 'kya aap bot ho?',
    expect: { fixed: 0, publicMin: 1 },
    critical: ['fixed'],
    overblockIfSilent: true,
  });
  add({
    id: 'ID-wife',
    cls: 'identity',
    title: 'personal question is not a handoff',
    text: "what is your wife's name?",
    model: ['ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: I will pass this to a teammate.'],
    expect: { fixed: 0, publicMin: 1, noAiOnPersonal: true },
    critical: ['fixed'],
  });
  add({
    id: 'ID-wife-ur',
    cls: 'identity',
    title: 'Roman Urdu personal question',
    text: 'aap ki biwi ka naam kya hai?',
    model: [ESCALATE_MODEL],
    expect: { fixed: 0 },
    critical: ['fixed'],
  });
  add({
    id: 'ID-age-it',
    cls: 'identity',
    title: 'Italian personal question',
    text: 'quanti anni hai?',
    model: [ESCALATE_MODEL],
    expect: { fixed: 0 },
    critical: ['fixed'],
  });
  add({
    id: 'ID-combined',
    cls: 'identity',
    title: 'identity plus live agent',
    text: 'are you a bot? I want a live agent too',
    expect: { publicMin: 1 },
    critical: ['spread-leak'],
  });
  add({
    id: 'ID-supply',
    cls: 'identity',
    title: 'supplying an account number is not an account question',
    text: 'my account number is 189143',
    model: [FAQ_REPLY],
    expect: { fixed: 0, notAccountLine: true },
    critical: ['fixed'],
  });

  add({
    id: 'EMP-policy',
    cls: 'empty',
    title: 'empty body on a policy question escalates',
    text: 'What is the daily loss limit?',
    model: [EMPTY_REPLY],
    escalationEmpty: true,
    expect: { publicMin: 1 },
    critical: ['silent-escalation', 'fixed-without-commit'],
  });
  add({
    id: 'EMP-policy-blank',
    cls: 'empty',
    title: 'blank model output on a policy question',
    text: 'What is the profit split rule?',
    model: [BLANK_MODEL],
    escalationEmpty: true,
    expect: { publicMin: 1 },
    critical: ['silent-escalation'],
  });
  add({
    id: 'EMP-holding',
    cls: 'empty',
    title: 'empty body on a holding-time rule',
    text: 'What is the minimum holding time rule?',
    model: [EMPTY_REPLY],
    escalationEmpty: true,
    expect: { publicMin: 1 },
    critical: ['silent-escalation'],
  });
  add({
    id: 'EMP-payout',
    cls: 'empty',
    title: 'empty body on a rejected payout',
    text: 'my payout was rejected and my account shows breach',
    model: [EMPTY_REPLY],
    escalationEmpty: true,
    expect: { publicMin: 1 },
    critical: ['silent-escalation', 'fixed-without-commit'],
  });
  add({
    id: 'EMP-login',
    cls: 'empty',
    title: 'empty body on a login failure',
    text: "I can't log in and my password is not working",
    model: [EMPTY_REPLY],
    escalationEmpty: true,
    expect: { publicMin: 1 },
    critical: ['silent-escalation'],
  });
  add({
    id: 'EMP-ws',
    cls: 'empty',
    title: 'whitespace body on a policy question',
    text: 'How does the daily loss limit work?',
    model: ['ACTION: REPLY\nBODY:    \n'],
    escalationEmpty: true,
    expect: { publicMin: 1 },
    critical: ['silent-escalation'],
  });
  add({
    id: 'EMP-hello',
    cls: 'empty',
    title: 'empty body on a greeting may stay quiet',
    text: 'Hello',
    model: [EMPTY_REPLY],
    expect: { fixed: 0 },
    critical: ['fixed', 'promise'],
  });
  add({
    id: 'EMP-escalate-action',
    cls: 'empty',
    title: 'ESCALATE action on a payout is not silence',
    text: 'my payout was rejected and my account shows breach',
    model: [ESCALATE_MODEL],
    escalationEmpty: true,
    expect: { publicMin: 1, fixed: 0 },
    critical: ['silent-escalation', 'promise'],
  });
  add({
    id: 'EMP-escalate-with-id',
    cls: 'empty',
    title: 'ESCALATE with an account number completes or asks once',
    text: 'my payout was rejected on account 189143 and the dashboard shows breach',
    model: [ESCALATE_MODEL],
    escalationEmpty: true,
    expect: { publicMin: 1 },
    critical: ['silent-escalation', 'fixed-without-commit'],
  });
  add({
    id: 'EMP-skip',
    cls: 'empty',
    title: 'SKIP on an escalation-class payout',
    text: 'my payout was rejected and my account shows breach',
    model: [SKIP_MODEL],
    escalationEmpty: true,
    expect: { publicMin: 1 },
    critical: ['silent-escalation'],
    observe: true,
  });
  add({
    id: 'EMP-customer-empty',
    cls: 'empty',
    title: 'empty customer body is not an escalation',
    text: '',
    model: [ESCALATE_MODEL],
    expect: { public: 0, fixed: 0 },
    critical: ['public'],
  });

  add({
    id: 'PR-hedge-2step',
    cls: 'promise',
    title: 'approved hedge stays exact on a 2-step question',
    text: 'what is the 2-step?',
    model: [HEDGE_MODEL],
    expect: { hedgeExact: true, fixed: 0 },
    critical: ['hedge', 'fixed', 'promise'],
  });
  add({
    id: 'PR-hedge-first',
    cls: 'promise',
    title: 'hedge has no welcome prefix',
    text: 'What is the minimum holding time?',
    model: [HEDGE_MODEL],
    expect: { hedgeExact: true, fixed: 0 },
    critical: ['hedge', 'fixed'],
  });
  add({
    id: 'PR-wrong-number',
    cls: 'promise',
    title: 'unsupported holding time does not promise a handoff',
    text: 'What is the minimum holding time?',
    model: [WRONG_9, WRONG_12],
    expect: { fixed: 0, noWrongNumber: true },
    critical: ['promise', 'fixed', 'wrong-number'],
  });
  add({
    id: 'PR-regen-fixed',
    cls: 'promise',
    title: 'regenerated fixed line is not posted without a commit',
    text: 'What is the minimum holding time?',
    model: [WRONG_9, FIXED_MODEL],
    expect: { noWrongNumber: true },
    critical: ['fixed-without-commit', 'wrong-number', 'promise'],
  });
  add({
    id: 'PR-model-fixed',
    cls: 'promise',
    title: 'model-written fixed line on a FAQ is not a commit',
    text: 'What is the daily loss limit?',
    model: [FIXED_MODEL],
    expect: { fixed: 0 },
    critical: ['promise', 'fixed-without-commit'],
  });
  add({
    id: 'PR-promise-sentence',
    cls: 'promise',
    title: 'I will pass this to a teammate is not sent as the answer',
    text: 'What is the daily loss limit?',
    model: ['ACTION: REPLY\nBODY: I will pass this to a teammate and they will confirm the figure.'],
    expect: { fixed: 0 },
    critical: ['promise'],
  });
  add({
    id: 'PR-hedge-spaced',
    cls: 'promise',
    title: 'hedge with extra spaces stays the approved sentence',
    text: 'What is the profit target rule?',
    model: ['ACTION: REPLY\nBODY: ' + HEDGE.replace('figure', 'figure').split(' ').join('  ')],
    expect: { fixed: 0 },
    critical: ['promise', 'fixed'],
  });
  add({
    id: 'PR-urdu-promise',
    cls: 'promise',
    title: 'Urdu fixed line is not a normal FAQ answer',
    text: 'What is the daily loss limit?',
    model: ['ACTION: REPLY\nBODY: یہ گفتگو اب ایک ساتھی کے پاس ہے۔'],
    expect: { fixed: 0 },
    critical: ['promise'],
  });
  add({
    id: 'CTRL-faq',
    cls: 'control',
    title: 'ordinary FAQ is answered',
    text: 'What is the daily loss limit?',
    model: [FAQ_REPLY],
    expect: { publicMin: 1, fixed: 0 },
    critical: ['fixed', 'promise'],
    overblockIfSilent: true,
  });
  add({
    id: 'CTRL-greet',
    cls: 'control',
    title: 'greeting is not a handoff',
    text: 'Hello',
    model: ['ACTION: REPLY\nBODY: Hello, how can I help with your FundedElite account today?'],
    expect: { fixed: 0, publicMin: 1 },
    critical: ['fixed'],
    overblockIfSilent: true,
  });
  add({
    id: 'CTRL-thanks',
    cls: 'control',
    title: 'thanks after nothing is not a handoff',
    text: 'thanks',
    model: ['ACTION: REPLY\nBODY: You are welcome.'],
    expect: { fixed: 0 },
    critical: ['fixed'],
  });
  add({
    id: 'CTRL-close',
    cls: 'control',
    title: 'CLOSE does not post the fixed line',
    text: 'What is the daily loss limit?',
    model: ['ACTION: CLOSE\nBODY: done'],
    expect: { fixed: 0, public: 0 },
    critical: ['fixed', 'public'],
  });
  add({
    id: 'CTRL-tool-then-reply',
    cls: 'control',
    title: 'a tool call then a normal reply is not a handoff',
    text: 'What is the daily loss limit?',
    model: [{ __tool: 'get_state' }, FAQ_REPLY],
    expect: { fixed: 0, publicMin: 1 },
    critical: ['fixed'],
    overblockIfSilent: true,
  });
  add({
    id: 'CTRL-lost-thanks',
    cls: 'atomicity',
    title: 'thanks after a completed handoff does not repeat the line',
    text: 'I want to talk to a live agent',
    steps: [{ send: true }, { wipe: 'ticket+ops' }, { mutate: 'append-update', send: true, model: [FAQ_REPLY] }],
    expect: { fixed: 1 },
    critical: ['duplicate-fixed'],
  });

  return cases;
}

function evaluate(c, obs, fm) {
  const fails = [];
  function bad(code, detail, severity) {
    fails.push({ code, detail, severity: severity || (c.critical && c.critical.includes(code) ? 'critical' : 'major') });
  }
  const publics = obs.comments.filter((x) => x.status >= 200 && x.status < 300 && x.fault === 'ok');
  const notes = obs.notes.filter((x) => x.status >= 200 && x.status < 300 && x.fault === 'ok');
  const assigns = obs.assigns;
  const assignOk = assigns.filter((x) => x.fault === 'ok' && x.status >= 200 && x.status < 300);
  const fixedBodies = publics.filter((x) => fm.FIXED && Object.values(fm.FIXED).includes(collapse(x.body)));
  const fixedParts = obs.fixedParts;
  const blob = publics.map((x) => x.body).join('\n') + '\n' + notes.map((x) => x.body).join('\n');
  const promptBlob = obs.promptText;

  if (c.humanOwned && publics.length) bad('public', 'public comment on a human-owned thread', 'critical');
  if (c.humanOwned && !c.allowNote && (notes.length || assigns.length)) {
    bad('public', 'write on a human-owned thread (' + (notes.length ? 'note ' : '') + (assigns.length ? 'assign' : '') + ')', 'critical');
  }
  if (fixedBodies.length > 1 || fixedParts > 1) bad('duplicate-fixed', 'fixed line count ' + Math.max(fixedBodies.length, fixedParts), 'critical');

  const committedBefore = (index) => {
    const prior = obs.ordered.slice(0, index);
    const noteOk = prior.some((r) => r.op === 'note' && r.fault === 'ok' && r.status >= 200 && r.status < 300) || c.seedNote || (c.extraParts || []).some((p) => p.kind === 'note');
    const asgOk =
      prior.some((r) => r.op === 'assignment' && r.fault === 'ok' && r.status >= 200 && r.status < 300) ||
      c.staleAssign ||
      obs.sawAssignmentPart;
    return noteOk && asgOk;
  };
  obs.ordered.forEach((r, i) => {
    if (r.op === 'comment' && r.fault === 'ok' && Object.values(fm.FIXED).includes(collapse(r.data && r.data.body))) {
      if (!committedBefore(i) && !(c.seedFixedPublic && fixedParts >= 1 && fixedBodies.length === 0)) {
        bad('fixed-without-commit', 'fixed line without a successful note and assignment before it', 'critical');
      }
    }
  });

  const secrets = (c.secrets || []).concat([IC_TOKEN, OAI_KEY]);
  const secretHits = scanSecrets(
    [
      { where: 'public', text: publics.map((x) => x.body).join('\n') },
      { where: 'note', text: notes.map((x) => x.body).join('\n') },
      { where: 'prompt', text: promptBlob },
    ],
    secrets
  );
  if (secretHits.length) bad('secret', JSON.stringify(secretHits.slice(0, 4)), 'critical');

  if (!c.eligibleSpread) {
    const surface = blob + '\n' + promptBlob;
    if (surface.includes('55188') || surface.includes(SPREAD_PASSWORD)) {
      bad('spread-leak', '55188 or spread password outside an eligible spread ask', 'critical');
    }
  }
  if (c.eligibleSpread && c.expect && c.expect.spreadExact === 1) {
    const raw = publics.map((x) => String(x.body || ''));
    if (!raw.includes(fm.SPREAD)) bad('spread-inexact', 'eligible spread reply was not the locked bytes', 'critical');
  }
  if (c.expect && c.expect.spreadOrSilent) {
    const raw = publics.map((x) => String(x.body || ''));
    if (publics.length && !raw.includes(fm.SPREAD)) bad('spread-inexact', 'fresh spread reply was neither silence nor the locked bytes', 'critical');
    if (publics.some((x) => Object.values(fm.FIXED).includes(collapse(x.body)))) bad('fixed', 'spread ask became a handoff line', 'critical');
  }

  const exp = c.expect || {};
  if (exp.public != null && publics.length !== exp.public) bad('public-count', 'public ' + publics.length + ' wanted ' + exp.public, c.overblockIfSilent && publics.length === 0 ? 'major' : 'major');
  if (exp.publicMin != null && publics.length < exp.publicMin) {
    bad(c.escalationEmpty ? 'silent-escalation' : 'overblock', 'public ' + publics.length + ' < ' + exp.publicMin, c.escalationEmpty ? 'critical' : 'major');
  }
  if (exp.fixed != null && fixedParts !== exp.fixed && fixedBodies.length !== exp.fixed) {
    bad('fixed', 'fixed parts ' + fixedParts + ' http ' + fixedBodies.length + ' wanted ' + exp.fixed, 'major');
  }
  if (exp.fixedMax != null && fixedParts > exp.fixedMax) bad('duplicate-fixed', 'fixed parts ' + fixedParts, 'critical');
  if (exp.noteHttp != null && notes.length !== exp.noteHttp) bad('note-count', 'notes ' + notes.length + ' wanted ' + exp.noteHttp, 'major');
  if (exp.noteHttpMin != null && notes.length < exp.noteHttpMin) bad('note-count', 'notes ' + notes.length, 'major');
  if (exp.assignHttp != null && assigns.length !== exp.assignHttp) bad('assign-count', 'assigns ' + assigns.length + ' wanted ' + exp.assignHttp, 'major');
  if (exp.commentHttp != null && obs.comments.length !== exp.commentHttp) bad('comment-count', 'comment http ' + obs.comments.length, 'major');
  if (exp.hedgeExact) {
    const raws = publics.map((x) => String(x.body || ''));
    if (raws.length !== 1 || raws[0] !== HEDGE) bad('hedge', 'hedge bytes ' + JSON.stringify(raws.map((x) => x.slice(0, 80))), 'critical');
  }
  if (exp.hedge) {
    const joined = collapse(publics.map((x) => x.body).join(' '));
    if (joined !== HEDGE && !publics.every((x) => collapse(x.body) === HEDGE)) bad('hedge', 'expected the approved hedge', 'critical');
  }
  if (exp.noWrongNumber) {
    const joined = collapse(blob);
    if (/9 minutes|12 minutes/.test(joined)) bad('wrong-number', 'unsupported holding-time figure was public', 'critical');
  }
  if (exp.disclosure) {
    const joined = collapse(publics.map((x) => x.body).join(' '));
    if (!/AI|assistant|اسسٹنٹ|assistente/i.test(joined)) bad('disclosure', 'identity answer missing', 'major');
  }
  if (exp.noAiOnPersonal) {
    const joined = collapse(publics.map((x) => x.body).join(' '));
    if (/\bAI\b|artificial intelligence|assistente AI/i.test(joined)) bad('personal-ai', 'personal question received an AI disclosure', 'major');
  }
  if (exp.notAccountLine) {
    const joined = collapse(publics.map((x) => x.body).join(' '));
    if (/Those details cannot be changed|تبدیل نہیں ہوتیں|لا تُغيَّر|बदले नहीं जाते|non si cambiano/i.test(joined)) {
      bad('overblock', 'identity supply was answered as an account-number question', 'major');
    }
  }
  if (c.kind === 'account' || c.kind === 'fixed') {
    const accept = new Set(c.accept || ['en']);
    const wanted = [];
    const forbidden = [];
    const langs = ['en', 'ur', 'ar', 'hi', 'it', 'hinglish'];
    for (const lang of langs) {
      const line = c.kind === 'account' ? fm.accountLine(lang) : fm.fixedLine(lang);
      if (!line) continue;
      if (accept.has(lang)) wanted.push(line);
      else forbidden.push(line);
    }
    const joined = collapse(publics.map((x) => x.body).join('\n'));
    if (publics.length && !wanted.some((line) => joined.includes(collapse(line)))) {
      bad('wrong-language', 'missing approved line for ' + [...accept].join('/'), 'critical');
    }
    for (const line of forbidden) {
      if (joined.includes(collapse(line)) && !wanted.some((w) => collapse(w) === collapse(line))) {
        bad('wrong-language', 'used a different language line', 'critical');
      }
    }
  }
  if (/I will pass this to a teammate|I'll pass this|A teammate now has this conversation|یہ گفتگو اب|هذه المحادثة الآن|यह बातचीत अब|Un collega ha ora/.test(collapse(publics.map((x) => x.body).join('\n')))) {
    const allowed = fixedBodies.length > 0 && !fails.some((f) => f.code === 'fixed-without-commit');
    const isExactFixed = fixedBodies.length === publics.length && fixedBodies.length > 0;
    if (!isExactFixed && !allowed) bad('promise', 'handoff promise in a public reply without a completed commit', 'critical');
  }
  if (c.overblockIfSilent && publics.length === 0 && !fails.some((f) => f.code === 'overblock' || f.code === 'silent-escalation')) {
    bad('overblock', 'eligible turn produced no public reply', 'major');
  }

  const unique = [];
  const seen = new Set();
  for (const f of fails) {
    const k = f.code + '|' + f.detail;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(f);
  }
  return unique;
}

async function runCase(handleWebhook, c, fm) {
  currentCase = c.id;
  faultQueue = [];
  modelQueue = (c.model || []).slice();
  const conv = makeConv(c);
  store.set(conv.id, conv);
  const startHttp = httpLog.length;
  const startPrompt = promptLog.length;
  if (c.parallel) {
    lagLeft = 6;
    await Promise.all([fire(handleWebhook, conv, c.topic), fire(handleWebhook, conv, c.topic)]);
    lagLeft = 0;
  } else {
    for (const step of c.steps) {
      if (step.wipe) wipe(conv.id, step.wipe);
      if (step.mutate) mutate(conv, step.mutate);
      if (step.faults) faultQueue = step.faults.slice();
      if (step.model) modelQueue = step.model.slice();
      if (step.text) conv.conversation_parts.conversation_parts.push(userPart(step.text, Math.floor(Date.now() / 1000)));
      if (step.send) await fire(handleWebhook, conv, step.topic || c.topic);
    }
  }
  const ordered = httpLog.slice(startHttp).filter((r) => r.caseId === c.id);
  const comments = ordered.filter((r) => r.op === 'comment').map((r) => ({ body: r.data && r.data.body, status: r.status, fault: r.fault || 'ok' }));
  const notes = ordered.filter((r) => r.op === 'note').map((r) => ({ body: r.data && r.data.body, status: r.status, fault: r.fault || 'ok' }));
  const assigns = ordered.filter((r) => r.op === 'assignment').map((r) => ({ status: r.status, fault: r.fault || 'ok', body: r.data }));
  const promptText = promptLog
    .slice(startPrompt)
    .map((p) =>
      (p.messages || [])
        .filter((m) => !(m && m.role === 'system' && String(m.content || '').includes('FundedElite')))
        .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
        .join('\n')
    )
    .join('\n');
  const parts = (conv.conversation_parts && conv.conversation_parts.conversation_parts) || [];
  const fixedParts = parts.filter(
    (p) => p && p.part_type !== 'note' && Object.values(fm.FIXED).includes(collapse(p.body || ''))
  ).length;
  const sawAssignmentPart = parts.some((p) => p && (p.part_type === 'assignment' || p.part_type === 'assign'));
  const obs = { comments, notes, assigns, ordered, promptText, fixedParts, sawAssignmentPart };
  const failures = evaluate(c, obs, fm);
  return {
    id: c.id,
    cls: c.cls,
    title: c.title,
    observe: !!c.observe,
    operator: !!c.operator,
    failures,
    publics: comments.map((x) => collapse(x.body).slice(0, 180)),
    noteCount: notes.length,
    assignCount: assigns.length,
    fixedParts,
  };
}

async function main() {
  const seal = verifyFrozen();
  if (!seal.ok) {
    console.error(JSON.stringify({ verdict: 'BLOCKED', reason: 'frozen sha mismatch', seal }, null, 2));
    process.exit(2);
  }
  prepareEnv();
  installTripwire();
  installRequireStubs();
  process.chdir(STATE_DIR);
  const runtime = require(path.join(RUNTIME, 'index.js'));
  const fmMod = require(path.join(RUNTIME, 'fixedMessageHandoff.js'));
  const sanitizer = require(path.join(ROOT, 'luna-current/02_statePresend/credentialSanitizer.js'));
  const fm = {
    FIXED: fmMod.FIXED_MESSAGES,
    SPREAD: sanitizer.LOCKED_SPREAD_TEST_REPLY,
    accountLine(lang) {
      if (lang === 'hinglish') return fmMod.ACCOUNT_QUESTION_LINES.hinglish;
      return fmMod.ACCOUNT_QUESTION_LINES[lang] || fmMod.ACCOUNT_QUESTION_LINES.en;
    },
    fixedLine(lang) {
      return fmMod.fixedMessageFor(lang);
    },
  };
  if (fm.SPREAD.indexOf('55188') < 0 || fm.SPREAD.indexOf(SPREAD_PASSWORD) < 0) {
    throw new Error('locked spread template drifted');
  }
  const cases = buildCases();
  const caseSeal = crypto.createHash('sha256').update(JSON.stringify(cases.map((c) => ({ id: c.id, cls: c.cls, title: c.title, text: c.text || '', topic: c.topic })))).digest('hex');
  const results = [];
  for (const c of cases) {
    try {
      results.push(await runCase(runtime.handleWebhook, c, fm));
    } catch (err) {
      results.push({
        id: c.id,
        cls: c.cls,
        title: c.title,
        failures: [{ code: 'harness-throw', detail: String(err && err.stack || err), severity: 'harness' }],
        publics: [],
      });
    }
  }
  const summary = {
    frozen: FROZEN,
    shaOk: true,
    cases: results.length,
    caseSeal,
    tripwire: tripwireHits.length,
    externalHosts: externalHosts.reduce((m, h) => {
      m[h.host] = (m[h.host] || 0) + 1;
      return m;
    }, {}),
    byClass: {},
  };
  for (const r of results) {
    const bucket = (summary.byClass[r.cls] = summary.byClass[r.cls] || { n: 0, pass: 0, critical: 0, major: 0, harness: 0 });
    bucket.n += 1;
    const crit = (r.failures || []).filter((f) => f.severity === 'critical' && !r.observe);
    const major = (r.failures || []).filter((f) => f.severity === 'major' && !r.observe);
    const harness = (r.failures || []).filter((f) => f.severity === 'harness');
    if (r.observe) {
      bucket.observe = (bucket.observe || 0) + 1;
      bucket.observeFails = bucket.observeFails || [];
      if (r.failures.length) bucket.observeFails.push({ id: r.id, failures: r.failures, publics: r.publics });
    }
    if (harness.length) bucket.harness += 1;
    else if (crit.length) bucket.critical += 1;
    else if (major.length) bucket.major += 1;
    else bucket.pass += 1;
  }
  const productFails = results.filter((r) => !r.observe && (r.failures || []).some((f) => f.severity === 'critical' || f.severity === 'major'));
  const criticals = results.filter((r) => !r.observe && (r.failures || []).some((f) => f.severity === 'critical'));
  const out = {
    summary,
    criticals: criticals.map((r) => ({ id: r.id, cls: r.cls, title: r.title, failures: r.failures, publics: r.publics })),
    majors: productFails
      .filter((r) => !criticals.includes(r))
      .map((r) => ({ id: r.id, cls: r.cls, title: r.title, failures: r.failures, publics: r.publics })),
    harness: results.filter((r) => (r.failures || []).some((f) => f.severity === 'harness')).map((r) => ({ id: r.id, failures: r.failures })),
  };
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log('CRITICAL', criticals.length, 'MAJOR', productFails.length - criticals.length, 'CASES', results.length);
  for (const r of criticals) {
    console.log('C', r.id, r.failures.map((f) => f.code + ':' + f.detail).join(' | '), 'PUB', JSON.stringify(r.publics));
  }
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
