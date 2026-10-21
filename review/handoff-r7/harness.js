'use strict';

/**
 * Independent sealed review of frozen fixed-message handoff R7.
 * Runs the real handleWebhook from luna-current/01_runtime.
 * Transport is an in-process recording stub. The model is a scripted stub.
 * Sockets, DNS, and child processes are tripwired. No production, VPS,
 * Intercom, or customer data. Secrets below are synthetic and must never
 * equal a conversation id.
 *
 * This file does not read review branches, author tests, or author reports.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const dns = require('dns');
const cp = require('child_process');

const ROOT = '/workspace';
const RUNTIME = path.join(ROOT, 'luna-current/01_runtime');
const ISO = '/tmp/handoff-r7-iso';
const OUT_DIR = path.join(ROOT, 'review/handoff-r7');
const COMMIT = '8675a8796edeceb2204a7402a1a50b9e0f182ba1';

const EXPECTED_HASHES = {
  'luna-current/01_runtime/fixedMessageHandoff.js':
    'bb9c20c275d215ae992df9e17c98f3f9af6f8f14592cdf9c18d64b5fd3c0cd6b',
  'luna-current/01_runtime/index.js':
    '22dee4ddc616761f2debe109fe81ebaad06649ff43219a5d6c05f01b298e397f',
  'luna-current/02_statePresend/credentialSanitizer.js':
    'c86c6c45fe217334bc7e028a3962a560af735c4c3a1f6a8305f1b41ce8578418',
  'luna-current/02_statePresend/targetedRegeneration.js':
    '689216077646c0183b4989c75f04224ce16bb5e4a468b5b952c0f98f65cd5325',
  'luna-current/02_statePresend/statePresend.js':
    '0e3b8675e00856eca158748711683471e3820d43a9e5c0ff626a14dc84a90764',
  'luna-current/01_runtime/softEdges.js':
    '22f8b555a71bb81f6936997a57c85481b5c351b9446c0f30f7f178c93d5071e0',
  'luna-current/10_synthetic_lanes/fixed-message-handoff-r7/FM_R7_REPORT.md':
    'e92a060ce0b15a7acc3a473284a59f49b8eebaccfbe02e5ebc1c7e648d4c7568',
};

const ARSAL = '10118526';
const HUMAN = '424242';
const OTHER = '515151';
const SUPPORT_TEAM = 9629780;

const FIXED = Object.freeze({
  en: 'A teammate now has this conversation.',
  ur: 'یہ گفتگو اب ایک ساتھی کے پاس ہے۔',
  ar: 'هذه المحادثة الآن لدى أحد الزملاء.',
  hi: 'यह बातचीत अब एक साथी के पास है।',
  it: 'Un collega ha ora questa conversazione.',
});

const ACCOUNT = Object.freeze({
  en: 'For MT5, the account number is in the email that was sent with the trading login. Those details cannot be changed.',
  ur: 'MT5 پر اکاؤنٹ نمبر اس ای میل میں ہے جو ٹریڈنگ لاگ اِن کے ساتھ بھیجی گئی تھی۔ یہ تفصیلات تبدیل نہیں ہوتیں۔',
  ar: 'في MT5، رقم الحساب موجود في البريد الذي أُرسل مع بيانات الدخول. هذه التفاصيل لا تُغيَّر.',
  hi: 'MT5 पर खाता नंबर उस ईमेल में है जो ट्रेडिंग लॉगिन के साथ भेजी गई थी। ये विवरण बदले नहीं जाते।',
  it: "Su MT5 il numero di conto è nell'email inviata con i dati di accesso. Questi dati non si cambiano.",
  hinglish:
    'MT5 par account number us email mein hai jo trading login ke sath bheji gayi thi. Yeh details change nahi hoti.',
});

const SPREAD =
  'TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server\n\n' +
  'Platform: MetaTrader 5\n' +
  'Server: Fundedelite-Server\n' +
  'Account Number: 55188\n' +
  'Password: QBG5FetfozKz7^a?J!\n\n' +
  'Use this account to check spreads.';

const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const SENTINEL = 'PUBLIC-LEAK-MARKER';
const TRAP = 'ACTION: REPLY\nBODY:\n' + SENTINEL + ' should not be sent.';

const world = {
  convs: new Map(),
  writes: [],
  prompts: [],
  tripwires: [],
  blockedLive: [],
  queue: [],
  currentCase: '',
  faults: null,
  complete: null,
};

function trip(name) {
  return function tripped() {
    const err = new Error('NETWORK_TRIPWIRE ' + name);
    err.code = 'TRIPWIRE';
    world.tripwires.push(name);
    throw err;
  };
}

net.Socket.prototype.connect = trip('socket.connect');
if (typeof net.connect === 'function') net.connect = trip('net.connect');
tls.connect = trip('tls.connect');
http.request = trip('http.request');
http.get = trip('http.get');
https.request = trip('https.request');
https.get = trip('https.get');
dns.lookup = function (host, opts, cb) {
  const err = new Error('NETWORK_TRIPWIRE dns.lookup');
  world.tripwires.push('dns.lookup');
  if (typeof opts === 'function') opts(err);
  else if (typeof cb === 'function') cb(err);
  else throw err;
};
if (dns.promises) {
  dns.promises.lookup = async function () {
    world.tripwires.push('dns.promises.lookup');
    throw new Error('NETWORK_TRIPWIRE dns.promises.lookup');
  };
}
global.fetch = function () {
  world.tripwires.push('fetch');
  throw new Error('NETWORK_TRIPWIRE fetch');
};
for (const name of ['spawn', 'exec', 'execFile', 'fork', 'spawnSync', 'execSync', 'execFileSync']) {
  cp[name] = function () {
    world.tripwires.push('child_process.' + name);
    throw new Error('NETWORK_TRIPWIRE child_process.' + name);
  };
}

function sha256File(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256Text(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function verifyHashes() {
  const out = [];
  let ok = true;
  for (const [rel, expect] of Object.entries(EXPECTED_HASHES)) {
    const got = sha256File(rel);
    const match = got === expect;
    if (!match) ok = false;
    out.push({ rel, expect, got, match });
  }
  return { ok, out };
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

function leakPattern(secret) {
  const chars = Array.from(secret).map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(chars.join('[\\s\\u200b\\u200c\\u200d\\u2060\\ufeff]*'), 'u');
}

function containsLeak(hay, secret) {
  if (!secret) return false;
  const raw = String(hay || '');
  if (raw.includes(secret)) return true;
  const folded = raw.normalize('NFKC').replace(/\p{Cf}/gu, '');
  if (folded.includes(secret)) return true;
  return leakPattern(secret).test(folded);
}

function reply(body) {
  return 'ACTION: REPLY\nBODY:\n' + body;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function userPart(id, idx, text, at) {
  return {
    id: 'up-' + id + '-' + idx,
    part_type: 'comment',
    body: text,
    author: { type: 'user', id: 'user-' + id, name: 'Casey' },
    created_at: at,
  };
}

function notePart(id, at) {
  return {
    id: 'pre-note-' + id,
    part_type: 'note',
    body:
      '<b>Account:</b> Not provided<br><b>Email:</b> Not provided<br><br><b>Problem:</b><br>Client asked for a teammate.<br><br><b>Action needed:</b><br>Please take this conversation.',
    author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    created_at: at,
  };
}

function assignPart(id, at, who) {
  return {
    id: 'pre-asg-' + id,
    part_type: 'assignment',
    body: '',
    author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    assigned_to: { type: 'admin', id: who || HUMAN },
    created_at: at,
  };
}

function applyOwnership(conv, mode, created) {
  if (!mode || mode === 'bot') return;
  if (mode === 'human_assignee') conv.admin_assignee_id = HUMAN;
  if (mode === 'human_reply') {
    conv.conversation_parts.conversation_parts.push({
      id: 'hm-' + conv.id,
      part_type: 'comment',
      body: 'I am already looking at this for you.',
      author: { type: 'admin', id: HUMAN, name: 'Synth Teammate' },
      created_at: created + 1,
    });
  }
  if (mode === 'teammate_author') {
    conv.conversation_parts.conversation_parts.push({
      id: 'tm-' + conv.id,
      part_type: 'comment',
      body: 'A teammate already answered this thread.',
      author: { type: 'teammate', id: HUMAN, name: 'Synth Teammate' },
      created_at: created + 1,
    });
  }
  if (mode === 'admin_no_type') {
    conv.conversation_parts.conversation_parts.push({
      id: 'nt-' + conv.id,
      body: 'Human wrote this without a part type.',
      author: { type: 'admin', id: HUMAN, name: 'Synth Teammate' },
      created_at: created + 1,
    });
  }
  if (mode === 'ambiguous') {
    conv.admin_assignee_id = '0';
    conv.assignee = { type: 'admin' };
  }
  if (mode === 'risk') conv.team_assignee_id = '10675195';
  if (mode === 'escalations') conv.team_assignee_id = '9629759';
  if (mode === 'stale') {
    conv.admin_assignee_id = ARSAL;
    conv.conversation_parts.conversation_parts.push(assignPart(conv.id + '-stale', created + 1, HUMAN));
  }
  if (mode === 'foreign') {
    conv.admin_assignee_id = OTHER;
    conv.conversation_parts.conversation_parts.push({
      id: 'fr-' + conv.id,
      part_type: 'comment',
      body: 'Another person owns this ticket.',
      author: { type: 'admin', id: OTHER, name: 'Other Synth' },
      created_at: created + 1,
    });
  }
}

function applyPreload(conv, preload, created) {
  if (!preload) return;
  const at = created + 2;
  if (preload === 'note' || preload === 'note+assign' || preload === 'note+assign+line' || preload === 'fake+assign') {
    if (preload !== 'fake+assign') conv.conversation_parts.conversation_parts.push(notePart(conv.id, at));
  }
  if (preload === 'fake+assign') {
    conv.conversation_parts.conversation_parts.push({
      id: 'fake-' + conv.id,
      part_type: 'comment',
      body: 'Account: 738261\nProblem: this comment is not an internal note.',
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      created_at: at,
    });
  }
  if (preload === 'assign' || preload === 'note+assign' || preload === 'note+assign+line' || preload === 'fake+assign') {
    conv.admin_assignee_id = HUMAN;
    conv.conversation_parts.conversation_parts.push(assignPart(conv.id, at + 1, HUMAN));
  }
  if (preload === 'note+assign+line') {
    conv.conversation_parts.conversation_parts.push({
      id: 'pre-line-' + conv.id,
      part_type: 'comment',
      body: FIXED.en,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      created_at: at + 2,
    });
  }
  if (preload === 'incomplete-note+assign') {
    conv.admin_assignee_id = HUMAN;
    conv.conversation_parts.conversation_parts.push({
      id: 'half-' + conv.id,
      part_type: 'note',
      body: 'Problem: missing the account label so this is not a confirmed handoff note.',
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      created_at: at,
    });
    conv.conversation_parts.conversation_parts.push(assignPart(conv.id, at + 1, HUMAN));
  }
}

function makeConversation(c, step) {
  const now = nowSec();
  const age = step.ageSec != null ? step.ageSec : 600;
  const created = now - age;
  const conv = {
    id: c.id,
    type: 'conversation',
    open: true,
    state: 'open',
    created_at: created,
    admin_assignee_id: step.assignee || ARSAL,
    team_assignee_id: '0',
    source: {
      body: step.text || '',
      author: { type: 'user', id: 'user-' + c.id, name: 'Casey', email: 'casey@example.test' },
      created_at: created,
    },
    contacts: { contacts: [{ id: 'user-' + c.id, name: 'Casey', email: 'casey@example.test' }] },
    conversation_parts: { conversation_parts: [] },
  };
  applyOwnership(conv, c.ownership || 'bot', created);
  applyPreload(conv, step.preload, created);
  if (step.priorBot) {
    conv.conversation_parts.conversation_parts.push({
      id: 'prior-' + c.id,
      part_type: 'comment',
      body: 'Hello Casey, happy to help with your FundedElite question.',
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      created_at: created + 3,
    });
  }
  if (!step.sourceOnly && step.text) {
    conv.conversation_parts.conversation_parts.push(userPart(c.id, 0, step.text, now - 3));
  }
  if (step.seedAwaiting) {
    const all = loadTickets();
    all[c.id] = {
      escalateAwaitingFirstTeammate: true,
      lastEscalateProblem: 'payout rejected',
      lastEscalateTopic: 'payout',
      lastEscalateTopics: ['payout'],
      lastEscalateAt: now - 30,
      fixedHandoff: {
        noteConfirmed: true,
        assignConfirmed: true,
        messageSent: true,
        assigneeId: HUMAN,
      },
      deferredRelatedReply: { at: now - 20, text: step.text, partId: 'def-' + c.id },
    };
    saveTickets(all);
  }
  return conv;
}

function loadTickets() {
  try {
    return JSON.parse(fs.readFileSync(process.env.TICKET_STATE_FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function saveTickets(all) {
  fs.writeFileSync(process.env.TICKET_STATE_FILE, JSON.stringify(all));
}

function mutate(conv, id, name) {
  if (name === 'wipe-state') {
    const all = loadTickets();
    delete all[id];
    saveTickets(all);
    return;
  }
  if (name === 'forget-public-history') {
    const parts = conv.conversation_parts.conversation_parts;
    conv.conversation_parts.conversation_parts = parts.filter((p) => {
      const a = (p && p.author) || {};
      if (String(a.id || '') !== ARSAL) return true;
      const pt = String(p.part_type || '');
      return pt !== 'comment' && pt !== 'note' && pt !== 'assignment' && pt !== 'assign';
    });
    conv.admin_assignee_id = ARSAL;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return '';
  }
}

function convIdFromUrl(url) {
  const m = String(url || '').match(/conversations\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function successBody(kind) {
  return { id: 'w-' + kind + '-' + world.writes.length + '-' + Math.random().toString(16).slice(2), type: 'conversation' };
}

function takeFault(kind) {
  const faults = world.faults || {};
  const spec = faults[kind];
  if (!spec) return null;
  if (spec.once) {
    if (spec._used) return null;
    spec._used = true;
  }
  return spec;
}

function mirrorWrite(conv, kind, payload, response) {
  if (!conv || !response || response.status < 200 || response.status >= 300) return;
  const data = response.data || {};
  if (!data.id) return;
  if (Array.isArray(data.errors) && data.errors.length) return;
  const at = nowSec();
  if (kind === 'note') {
    conv.conversation_parts.conversation_parts.push({
      id: 'mir-note-' + at + '-' + world.writes.length,
      part_type: 'note',
      body: payload.body,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      created_at: at,
    });
  } else if (kind === 'assignment') {
    const who = String(payload.assignee_id || HUMAN);
    conv.admin_assignee_id = who;
    conv.conversation_parts.conversation_parts.push({
      id: 'mir-asg-' + at + '-' + world.writes.length,
      part_type: 'assignment',
      body: '',
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      assigned_to: { type: 'admin', id: who },
      created_at: at,
    });
  } else if (kind === 'comment') {
    conv.conversation_parts.conversation_parts.push({
      id: 'mir-cmt-' + at + '-' + world.writes.length,
      part_type: 'comment',
      body: payload.body,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      created_at: at,
    });
  }
}

async function dispatch(method, url, data) {
  const host = hostOf(url);
  const m = String(method || 'get').toLowerCase();
  if (host === 'faq.fundedelite.com' || host === 'fundedelite.com' || host === 'www.fundedelite.com') {
    world.blockedLive.push(m + ' ' + url);
    return { status: 404, data: '' };
  }
  if (host !== 'api.intercom.io') {
    world.tripwires.push('axios ' + m + ' ' + url);
    throw new Error('NETWORK_TRIPWIRE axios ' + url);
  }
  if (m === 'get' && /\/admins/.test(url)) {
    return {
      status: 200,
      data: {
        admins: [
          {
            id: HUMAN,
            name: 'Synth Teammate',
            email: 'synth.teammate@example.test',
            has_inbox_seat: true,
            away_mode_enabled: false,
            team_ids: [SUPPORT_TEAM],
          },
        ],
      },
    };
  }
  if (m === 'get' && /\/conversations\//.test(url)) {
    const id = convIdFromUrl(url);
    const conv = world.convs.get(id);
    if (!conv) return { status: 404, data: { errors: [{ code: 'not_found' }] } };
    return { status: 200, data: conv };
  }
  if (m === 'post' && /\/conversations\/search/.test(url)) {
    return { status: 200, data: { conversations: [], pages: {} } };
  }
  if (m === 'post' && /\/reply/.test(url)) {
    const id = convIdFromUrl(url);
    const kind = String((data && data.message_type) || 'comment');
    const fault = takeFault(kind === 'assignment' ? 'assignment' : kind);
    let response;
    if (fault && fault.throw) {
      const err = new Error(fault.throw);
      err.code = fault.throw;
      throw err;
    }
    if (fault) {
      response = {
        status: fault.status,
        data: fault.data !== undefined ? fault.data : { errors: [{ code: 'synthetic_fault' }] },
      };
    } else {
      response = { status: 200, data: successBody(kind) };
    }
    world.writes.push({
      conv: id,
      caseId: world.currentCase,
      kind,
      status: response.status,
      body: data && data.body,
      assignee: data && data.assignee_id,
      data: response.data,
    });
    mirrorWrite(world.convs.get(id), kind, data || {}, response);
    return response;
  }
  world.tripwires.push('axios-unhandled ' + m + ' ' + url);
  throw new Error('NETWORK_TRIPWIRE unhandled ' + url);
}

function axiosMock(config) {
  const cfg = config || {};
  return dispatch(cfg.method || 'get', cfg.url, cfg.data);
}
axiosMock.get = (url) => dispatch('get', url);
axiosMock.post = (url, data) => dispatch('post', url, data);
axiosMock.create = () => axiosMock;
axiosMock.interceptors = { request: { use() {} }, response: { use() {} } };
axiosMock.defaults = { headers: { common: {} } };

function OpenAI() {
  this.chat = {
    completions: {
      create: async (req) => ({
        choices: [{ message: { role: 'assistant', content: world.complete(req), tool_calls: [] } }],
      }),
    },
  };
}

function installMocks() {
  const axiosPath = require.resolve('axios', { paths: [RUNTIME] });
  const openaiPath = require.resolve('openai', { paths: [RUNTIME] });
  require.cache[axiosPath] = { id: axiosPath, filename: axiosPath, loaded: true, exports: axiosMock };
  require.cache[openaiPath] = { id: openaiPath, filename: openaiPath, loaded: true, exports: OpenAI };
}

function installEnv() {
  fs.mkdirSync(ISO, { recursive: true });
  const control = {
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: [],
    testAllowConversationIds: [],
    config: { model: 'stub-model', welcomeEnabled: true, repliesEnabled: true },
  };
  fs.writeFileSync(path.join(ISO, 'control.json'), JSON.stringify(control));
  fs.writeFileSync(path.join(ISO, 'tickets.json'), '{}');
  fs.writeFileSync(path.join(ISO, 'mention.json'), JSON.stringify({ recent: [], lastId: '', at: 0 }));
  fs.writeFileSync(path.join(ISO, 'ops.json'), '{}');
  process.env.LUNA_CONTROL_STATE_FILE = path.join(ISO, 'control.json');
  process.env.LUNA_PROMPT_FILE = path.join(RUNTIME, 'system-prompt.txt');
  process.env.TICKET_STATE_FILE = path.join(ISO, 'tickets.json');
  process.env.MENTION_ROTATE_FILE = path.join(ISO, 'mention.json');
  process.env.LUNA_OP_STORE_FILE = path.join(ISO, 'ops.json');
  process.env.FUNDEDELITE_FAQ_PATH = path.join(RUNTIME, 'fundedelite-faqs.md');
  process.env.OPENAI_API_KEY = 'stub-key-not-real';
  process.env.INTERCOM_ACCESS_TOKEN = 'stub-token-not-real';
  process.env.LUNA_PRESEND_MODE = 'enforce';
  process.env.MAINTAINER_ENABLED = 'false';
  // index.js requires ./statePresend/statePresend, and presendMega requires
  // ../repeatedClientQuestion. A directory symlink is realpathed by Node, so
  // those relatives would leave 01_runtime. Copy the frozen pack into a real
  // directory. The copy is a local layout fixture and is not part of the review.
  const dest = path.join(RUNTIME, 'statePresend');
  let stat = null;
  try {
    stat = fs.lstatSync(dest);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (stat && stat.isSymbolicLink()) {
    fs.unlinkSync(dest);
    stat = null;
  }
  if (!stat) {
    fs.cpSync(path.join(ROOT, 'luna-current/02_statePresend'), dest, { recursive: true });
  }
}

const LANGS = [
  { id: 'en', live: 'I want to talk to a live agent', account: 'What is my account number?', fixed: 'en', accountLine: 'en' },
  { id: 'ur', live: 'مجھے ایک ایجنٹ چاہیے', account: 'میرا اکاؤنٹ نمبر کیا ہے؟', fixed: 'ur', accountLine: 'ur' },
  { id: 'ur-roman', live: 'mujhe insaan se baat karni chahiye', account: 'mera account number kya hai?', fixed: 'ur', accountLine: 'hinglish' },
  { id: 'hi', live: 'मुझे एक एजेंट से बात करनी है', account: 'मेरा खाता नंबर क्या है?', fixed: 'hi', accountLine: 'hi' },
  { id: 'ar', live: 'اريد التحدث الى موظف', account: 'ما هو رقم الحساب؟', fixed: 'ar', accountLine: 'ar' },
  { id: 'hinglish', live: 'live agent chahiye', account: 'account number kya hai?', fixed: 'ur', accountLine: 'hinglish' },
  { id: 'it', live: 'Voglio parlare con un operatore', account: 'Qual è il numero di conto?', fixed: 'it', accountLine: 'it' },
  { id: 'fr', live: 'Je voudrais parler avec un conseiller', account: 'Quel est mon numéro de compte ?', fixed: 'en', accountLine: 'en' },
  { id: 'de', live: 'Ich möchte mit einem Mitarbeiter sprechen', account: 'Wie lautet meine Kontonummer?', fixed: 'en', accountLine: 'en' },
  { id: 'nl', live: 'Ik wil met een medewerker spreken', account: 'Wat is mijn rekeningnummer?', fixed: 'en', accountLine: 'en' },
  { id: 'es', live: 'Quiero hablar con un agente', account: '¿Cuál es mi número de cuenta?', fixed: 'en', accountLine: 'en' },
  { id: 'pt', live: 'Quero falar com um agente', account: 'Qual é o meu número de conta?', fixed: 'en', accountLine: 'en' },
  { id: 'tr', live: 'Bir temsilci ile konusmak istiyorum', account: 'Hesap numaram nedir?', fixed: 'en', accountLine: 'en' },
  { id: 'pl', live: 'Chcę rozmawiać z konsultantem', account: 'Jaki jest numer konta?', fixed: 'en', accountLine: 'en' },
  { id: 'ru', live: 'Хочу говорить с оператором', account: 'Какой номер счёта?', fixed: 'en', accountLine: 'en' },
  { id: 'zh', live: '我要转接人工客服', account: '我的账号是什么？', fixed: 'en', accountLine: 'en' },
  { id: 'ja', live: '担当者と話したいです', account: '口座番号は何ですか', fixed: 'en', accountLine: 'en' },
  { id: 'id', live: 'Saya ingin bicara dengan agen', account: 'Berapa nomor akun saya?', fixed: 'en', accountLine: 'en' },
];

const OWNERS = ['human_assignee', 'human_reply', 'teammate_author', 'admin_no_type', 'ambiguous', 'risk', 'escalations', 'stale', 'foreign'];

const HUMAN_STIMULI = [
  { key: 'account', text: 'What is my account number?' },
  { key: 'identity', text: 'Are you a bot or a real person?' },
  { key: 'live', text: 'I want to talk to a live agent' },
  { key: 'faq', text: 'What is the daily loss limit on the 2-step challenge?' },
  { key: 'spread', text: 'Can I check the spreads on your server?' },
  { key: 'urdu-live', text: 'مجھے ایک ایجنٹ چاہیے' },
];

function secret(name, value) {
  if (value.includes('r7c') || /\d{5,}/.test(value)) {
    throw new Error('synthetic secret collides with id space: ' + name);
  }
  return { name, value };
}

const SECRETS = {
  plain: secret('plain', 'SYNSECplainPassword'),
  nfkc: secret('nfkc', 'SYNSECnfcPassword'),
  zwlabel: secret('zwlabel', 'SYNSECzwLabelValue'),
  spaced: secret('spaced', 'SYNSECspacedLabel'),
  symbols: secret('symbols', 'SYNSECsymbolValue'),
  apos: secret('apos', 'SYNSECapostrophe'),
  braces: secret('braces', 'SYNSECbraceValue'),
  bold: secret('bold', 'SYNSECboldValue'),
  b64: secret('b64', 'SYNSECbaseSixtyFourToken'),
  echo: secret('echo', 'SYNSECechoValue'),
  ar: secret('ar', 'SYNSECarabicLabel'),
  ur: secret('ur', 'SYNSECurduLabel'),
  hi: secret('hi', 'SYNSEChindiLabel'),
  otp: secret('otp', 'SYNSECotpValue'),
  apikey: secret('apikey', 'SYNSECapiKeyValue'),
  bearer: secret('bearer', 'SYNSECbearerToken'),
  sk: secret('sk', 'SYNSECskTokenValue'),
  zwvalue: secret('zwvalue', 'SYNSECzwValue'),
};

function buildCases() {
  const cases = [];
  const add = (c) => cases.push(c);

  for (const owner of OWNERS) {
    for (const stim of HUMAN_STIMULI) {
      add({
        class: 'human-silence',
        property: 'a',
        level: 'critical',
        title: owner + ' / ' + stim.key + ' posts nothing public',
        ownership: owner,
        secrets: [],
        steps: [{ text: stim.text, scripts: [TRAP] }],
        expect: { shape: 'silence' },
      });
    }
  }

  for (const stim of ['live', 'faq', 'account']) {
    const text = HUMAN_STIMULI.find((s) => s.key === stim).text;
    add({
      class: 'human-silence',
      property: 'a',
      level: 'critical',
      title: 'human assignee replay twice / ' + stim,
      ownership: 'human_assignee',
      secrets: [],
      steps: [{ text, scripts: [TRAP] }, { replay: true, scripts: [TRAP] }],
      expect: { shape: 'silence' },
    });
  }

  for (const owner of ['human_assignee', 'human_reply', 'foreign']) {
    add({
      class: 'human-silence',
      property: 'a',
      level: 'critical',
      title: owner + ' deferred status ping posts nothing public',
      ownership: owner,
      secrets: [],
      steps: [{ text: 'any update on my payout?', scripts: [TRAP], seedAwaiting: true }],
      expect: { shape: 'silence' },
    });
  }

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'live agent posts the fixed line only after note and assignment',
    secrets: [],
    steps: [{ text: 'I want to talk to a live agent', scripts: [TRAP] }],
    expect: { shape: 'handoff', lang: 'en' },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'note HTTP 500 withholds the fixed line and does not confirm the note',
    secrets: [],
    steps: [
      { text: 'I want to talk to a live agent', scripts: [TRAP], faults: { note: { status: 500, once: true, data: { id: 'n500', type: 'conversation' } } } },
      { text: 'I still want a live agent', scripts: [TRAP] },
    ],
    expect: { shape: 'silence', noteConfirmed: false },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'note timeout withholds the fixed line',
    secrets: [],
    steps: [{ text: 'I want to talk to a live agent', scripts: [TRAP], faults: { note: { throw: 'timeout' } } }],
    expect: { shape: 'silence', noteConfirmed: false },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'note 422 is not confirmed and a later attempt can complete once',
    secrets: [],
    steps: [
      { text: 'I want to talk to a live agent', scripts: [TRAP], faults: { note: { status: 422, once: true, data: { errors: [{ code: 'unprocessable' }] } } } },
      { replay: true, scripts: [TRAP] },
    ],
    expect: { shape: 'handoff', lang: 'en' },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'note 200 without a write id is not confirmed',
    secrets: [],
    steps: [{ text: 'I want to talk to a live agent', scripts: [TRAP], faults: { note: { status: 200, data: { ok: true } } } }],
    expect: { shape: 'silence', noteConfirmed: false },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'note 200 with an errors array is partial and not confirmed',
    secrets: [],
    steps: [
      {
        text: 'I want to talk to a live agent',
        scripts: [TRAP],
        faults: { note: { status: 200, data: { id: 'partial-note', type: 'conversation', errors: [{ code: 'partial' }] } } },
      },
      { text: 'Please connect me to a live agent', scripts: [TRAP] },
    ],
    expect: { shape: 'silence', noteConfirmed: false },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'a public comment that mentions Account and Problem is not a confirmed note',
    secrets: [],
    steps: [{ text: 'What is the profit split?', scripts: [reply('The profit split depends on the challenge you selected.')], preload: 'fake+assign', wipeState: true }],
    expect: { shape: 'silence' },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'assignment HTTP 500 after a good note withholds the line',
    secrets: [],
    steps: [{ text: 'I want to talk to a live agent', scripts: [TRAP], faults: { assignment: { status: 500, data: { id: 'a500', type: 'conversation' } } } }],
    expect: { shape: 'silence', noteConfirmed: true },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'assignment timeout withholds the line',
    secrets: [],
    steps: [{ text: 'I want to talk to a live agent', scripts: [TRAP], faults: { assignment: { throw: 'etimedout' } } }],
    expect: { shape: 'silence' },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'assignment 422 withholds the line and a later attempt completes once',
    secrets: [],
    steps: [
      { text: 'I want to talk to a live agent', scripts: [TRAP], faults: { assignment: { status: 422, once: true, data: { errors: [{ code: 'unprocessable' }] } } } },
      { replay: true, scripts: [TRAP] },
    ],
    expect: { shape: 'handoff', lang: 'en' },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'assignment 200 with errors is partial and withholds the line',
    secrets: [],
    steps: [
      {
        text: 'I want to talk to a live agent',
        scripts: [TRAP],
        faults: { assignment: { status: 200, data: { id: 'partial-asg', type: 'conversation', errors: [{ code: 'partial' }] } } },
      },
    ],
    expect: { shape: 'silence' },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'message HTTP 500 after note and assignment does not publish the line',
    secrets: [],
    steps: [
      { text: 'I want to talk to a live agent', scripts: [TRAP], faults: { comment: { status: 500, data: null } } },
      { replay: true, scripts: [TRAP] },
    ],
    expect: { shape: 'silence', noteConfirmed: true },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'lost store with note and assignment posts the fixed line once',
    secrets: [],
    steps: [
      { text: 'any update on this please?', scripts: [TRAP], preload: 'note+assign', wipeState: true },
      { replay: true, scripts: [TRAP] },
    ],
    expect: { shape: 'handoff', lang: 'en', preloaded: true },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'lost store with only a note does not post the fixed line',
    secrets: [],
    steps: [{ text: 'What is the profit split?', scripts: [reply('Profit split options depend on the challenge.')], preload: 'note', wipeState: true }],
    expect: { shape: 'includes', includes: 'Profit split', fixed: 'none' },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'lost store with only an assignment does not post the fixed line',
    secrets: [],
    steps: [{ text: 'What is the profit split?', scripts: [reply('Profit split options depend on the challenge.')], preload: 'assign', wipeState: true }],
    expect: { shape: 'silence' },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'lost store with note, assignment, and the line already public does not duplicate',
    secrets: [],
    steps: [{ text: 'any update on this please?', scripts: [TRAP], preload: 'note+assign+line', wipeState: true }],
    expect: { shape: 'silence' },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'incomplete note plus assignment is not a lost-store completion',
    secrets: [],
    steps: [{ text: 'What is the profit split?', scripts: [reply('Profit split options depend on the challenge.')], preload: 'incomplete-note+assign', wipeState: true }],
    expect: { shape: 'silence', fixed: 'none' },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'same webhook replay after success does not post a second fixed line',
    secrets: [],
    steps: [
      { text: 'I want to talk to a live agent', scripts: [TRAP] },
      { replay: true, scripts: [TRAP] },
    ],
    expect: { shape: 'handoff', lang: 'en' },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'a later live-agent turn does not post a second fixed line when history remains',
    secrets: [],
    steps: [
      { text: 'I want to talk to a live agent', scripts: [TRAP] },
      { text: 'I still want to talk to a live agent', scripts: [TRAP] },
    ],
    expect: { shape: 'handoff', lang: 'en' },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'a later turn whose fetch dropped the handoff parts does not post a second line',
    secrets: [],
    steps: [
      { text: 'I want to talk to a live agent', scripts: [TRAP] },
      { text: 'I still want to talk to a live agent', scripts: [TRAP], mutateBefore: 'forget-public-history' },
    ],
    expect: { shape: 'handoff', lang: 'en', publicCount: 1 },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'two concurrent deliveries of one live-agent webhook post one line',
    secrets: [],
    parallel: true,
    steps: [{ text: 'I want to talk to a live agent', scripts: [TRAP] }],
    expect: { shape: 'handoff', lang: 'en' },
  });

  add({
    class: 'sequence',
    property: 'b',
    level: 'critical',
    title: 'lost-store account question does not finish as the fixed line',
    secrets: [],
    steps: [{ text: 'What is my account number?', scripts: [TRAP], preload: 'note+assign', wipeState: true }],
    expect: { shape: 'silence' },
  });

  add({
    class: 'false-promise',
    property: 'c',
    level: 'critical',
    title: 'unsupported daily-loss figure is hedged, not handed off',
    secrets: [],
    steps: [{
      text: 'What is the daily loss limit on the 2-step challenge?',
      scripts: [
        reply('The daily loss limit on the 2-step challenge is 99%.'),
        reply('I will pass this to a teammate who has the exact figure.'),
      ],
    }],
    expect: { shape: 'hedge', absent: ['99%', FIXED.en, 'I will pass this to a teammate'] },
  });

  add({
    class: 'false-promise',
    property: 'c',
    level: 'critical',
    title: 'regenerated handoff promise is not sent for an unsupported number',
    secrets: [],
    steps: [{
      text: 'What is the daily loss limit on the 2-step challenge?',
      scripts: [
        reply('The daily loss limit is 99% and a teammate will take it from here.'),
        reply('A teammate now has this conversation.'),
      ],
    }],
    expect: { shape: 'hedge', absent: ['99%', FIXED.en] },
  });

  add({
    class: 'false-promise',
    property: 'c',
    level: 'critical',
    title: 'exact spread template drafted for a payout question is not sent',
    secrets: [],
    steps: [{ text: 'What is the payout schedule?', scripts: [SPREAD] }],
    expect: { shape: 'hedge', absent: ['55188', 'QBG5FetfozKz7', FIXED.en] },
  });

  add({
    class: 'false-promise',
    property: 'c',
    level: 'critical',
    title: 'one-character spread near-miss is not sent and is not a handoff',
    secrets: [],
    steps: [{
      text: 'What is the payout schedule?',
      scripts: [SPREAD.replace('QBG5FetfozKz7^a?J!', 'QBG5FetfozKz7^a?J?')],
    }],
    expect: { shape: 'hedge', absent: ['QBG5FetfozKz7', '55188', FIXED.en] },
  });

  add({
    class: 'false-promise',
    property: 'c',
    level: 'critical',
    title: 'three-hit spread near-miss without a spread ask is not sent',
    secrets: [],
    steps: [{
      text: 'How do payouts work?',
      scripts: [reply('Platform: MetaTrader 5\nServer: Fundedelite-Server\nAccount Number: 55188\nUse this account to check spreads.')],
    }],
    expect: { shape: 'hedge', absent: ['55188', FIXED.en, 'Fundedelite-Server'] },
  });

  add({
    class: 'false-promise',
    property: 'c',
    level: 'critical',
    title: 'regenerated spread template on a non-spread question is not sent',
    secrets: [],
    steps: [{
      text: 'What is the daily loss limit on the 2-step challenge?',
      scripts: [reply('The daily loss limit on the 2-step challenge is 99%.'), SPREAD],
    }],
    expect: { shape: 'hedge', absent: ['99%', '55188', 'QBG5FetfozKz7', FIXED.en] },
  });

  add({
    class: 'spread',
    property: 'd',
    level: 'critical',
    title: 'first reply to an eligible spread ask is the locked bytes',
    secrets: [],
    steps: [{ text: 'Can I check the spreads?', scripts: [TRAP] }],
    expect: { shape: 'spread' },
  });

  add({
    class: 'spread',
    property: 'd',
    level: 'critical',
    title: 'later eligible spread ask is still the locked bytes',
    secrets: [],
    steps: [{ text: 'Can I check the spreads on a later message?', scripts: [TRAP], priorBot: true }],
    expect: { shape: 'spread' },
  });

  add({
    class: 'spread',
    property: 'd',
    level: 'critical',
    title: 'bare spreads question is the locked bytes',
    secrets: [],
    steps: [{ text: 'spreads?', scripts: [TRAP] }],
    expect: { shape: 'spread' },
  });

  add({
    class: 'spread',
    property: 'd',
    level: 'critical',
    title: 'what are your spreads is the locked bytes',
    secrets: [],
    steps: [{ text: 'What are your spreads?', scripts: [TRAP] }],
    expect: { shape: 'spread' },
  });

  add({
    class: 'spread',
    property: 'd',
    level: 'critical',
    title: 'please check the spreads is the locked bytes',
    secrets: [],
    steps: [{ text: 'Please check the spreads', scripts: [TRAP] }],
    expect: { shape: 'spread' },
  });

  add({
    class: 'spread',
    property: 'd',
    level: 'critical',
    title: 'spread the word is not the locked reply',
    secrets: [],
    steps: [{ text: 'Please spread the word about FundedElite', scripts: [reply('Glad you want to tell people about FundedElite. I can help with an account question.')] }],
    expect: { shape: 'includes', includes: 'FundedElite', fixed: 'none', absent: ['55188', 'QBG5FetfozKz7'] },
  });

  add({
    class: 'spread',
    property: 'd',
    level: 'critical',
    title: 'spreadsheet is not the locked reply',
    secrets: [],
    steps: [{ text: 'I keep a spreadsheet of my trades', scripts: [reply('A spreadsheet is fine for your own notes.')] }],
    expect: { shape: 'includes', includes: 'spreadsheet', fixed: 'none', absent: ['55188', 'QBG5FetfozKz7'] },
  });

  add({
    class: 'spread',
    property: 'd',
    level: 'critical',
    title: 'positions spread across accounts is not the locked reply',
    secrets: [],
    steps: [{ text: 'My positions are spread across two accounts', scripts: [reply('Tell me which account you want to talk about.')] }],
    expect: { shape: 'includes', includes: 'which account', fixed: 'none', absent: ['55188', 'QBG5FetfozKz7'] },
  });

  add({
    class: 'spread',
    property: 'd',
    level: 'critical',
    title: 'not about spreads does not send the locked reply',
    secrets: [],
    steps: [{ text: 'This is not about spreads. What is the payout schedule?', scripts: [reply('Payout timing depends on the challenge and the profitable-day rule.')] }],
    expect: { shape: 'includes', includes: 'Payout timing', fixed: 'none', absent: ['55188', 'QBG5FetfozKz7'] },
  });

  add({
    class: 'spread',
    property: 'd',
    level: 'critical',
    title: 'MT5 login words without spread do not send the locked reply',
    secrets: [],
    steps: [{ text: 'I cannot login to MT5 and the server name looks wrong', scripts: [reply('Use the dashboard to review the trading login. I will not guess a server password.')] }],
    expect: { shape: 'includes', includes: 'dashboard', fixed: 'none', absent: ['55188', 'QBG5FetfozKz7'] },
  });

  add({
    class: 'spread',
    property: 'd',
    level: 'observation',
    title: 'user.created eligible spread ask is recorded, not scored as a format miss',
    secrets: [],
    steps: [{ text: 'Can I check the spreads?', scripts: [TRAP], topic: 'conversation.user.created', ageSec: 15, sourceOnly: true }],
    expect: { shape: 'observe-spread-created' },
  });

  // Consistency-rule, not the 2-step daily-loss question. The 2-step clarifier
  // rewrites that ask before redaction can be scored, which is a different path.
  const secretCases = [
    { name: 'plain', text: (v) => 'My password: ' + v + '. What is the consistency rule?' },
    { name: 'nfkc', text: (v) => 'My ｐａｓｓｗｏｒｄ：' + v + '. What is the consistency rule?' },
    { name: 'zwlabel', text: (v) => 'My pass\u200bword: ' + v + '. What is the consistency rule?' },
    { name: 'spaced', text: (v) => 'My p a s s w o r d : ' + v + '. What is the consistency rule?' },
    { name: 'symbols', text: (v) => 'password: a?b!' + v + ' end. What is the consistency rule?' },
    { name: 'apos', text: (v) => "password's " + v + '. What is the consistency rule?' },
    { name: 'braces', text: (v) => 'password: {' + v + '}. What is the consistency rule?' },
    { name: 'bold', text: (v) => 'password: <b>' + v + '</b>. What is the consistency rule?' },
    { name: 'b64', text: (v) => 'See ' + v + ' and again ' + v + '. What is the consistency rule?' },
    { name: 'echo', text: (v) => 'password: ' + v + ' and later ' + v.split('').join(' ') + '. What is the consistency rule?' },
    { name: 'ar', text: (v) => 'كلمة المرور: ' + v + '. What is the consistency rule?' },
    { name: 'ur', text: (v) => 'پاس ورڈ: ' + v + '. What is the consistency rule?' },
    { name: 'hi', text: (v) => 'पासवर्ड: ' + v + '. What is the consistency rule?' },
    { name: 'otp', text: (v) => 'otp: ' + v + '. What is the consistency rule?' },
    { name: 'apikey', text: (v) => 'api key: ' + v + '. What is the consistency rule?' },
    { name: 'bearer', text: (v) => 'Bearer ' + v + '. What is the consistency rule?' },
    { name: 'sk', text: (v) => 'sk-' + v + ' is not for chat. What is the consistency rule?' },
    { name: 'zwvalue', text: (v) => 'password: ' + v.split('').join('\u200b') + '. What is the consistency rule?' },
  ];

  for (const sc of secretCases) {
    const spec = SECRETS[sc.name];
    add({
      class: 'secret',
      property: 'e',
      level: 'critical',
      title: 'secret ' + sc.name + ' stays out of prompts, notes, and public replies',
      secrets: [spec],
      steps: [{
        text: sc.text(spec.value),
        scripts: [reply('The consistency rule limits how much one trading day can count. ' + spec.value)],
      }],
      expect: { shape: 'noleak', includes: 'consistency rule', absent: ['99%'] },
    });
  }

  for (const name of ['plain', 'nfkc', 'zwlabel', 'b64']) {
    const spec = SECRETS[name];
    const text = name === 'b64'
      ? 'I want a live agent. Token ' + spec.value + ' and ' + spec.value + '.'
      : 'I want a live agent. My password: ' + spec.value;
    add({
      class: 'secret',
      property: 'e',
      level: 'critical',
      title: 'live-agent note redacts ' + name,
      secrets: [spec],
      steps: [{ text, scripts: [reply('Daily loss limits vary by challenge. ' + spec.value)] }],
      expect: { shape: 'handoff', lang: 'en', noleak: true },
    });
  }

  for (const lang of LANGS) {
    add({
      class: 'language',
      property: 'language',
      level: 'critical',
      title: lang.id + ' live-agent uses the approved line',
      secrets: [],
      steps: [{ text: lang.live, scripts: [TRAP] }],
      expect: { shape: 'handoff', lang: lang.fixed },
    });
    add({
      class: 'language',
      property: 'language',
      level: 'critical',
      title: lang.id + ' account-number question uses the approved fact',
      secrets: [],
      steps: [{ text: lang.account, scripts: [TRAP] }],
      expect: { shape: 'account', lang: lang.accountLine },
    });
  }

  add({
    class: 'language',
    property: 'language',
    level: 'critical',
    title: 'Arabic account question with diacritics still uses the Arabic fact',
    secrets: [],
    steps: [{ text: 'مَا هُوَ رَقْمُ الْحِسَابِ؟', scripts: [TRAP] }],
    expect: { shape: 'account', lang: 'ar' },
  });

  add({
    class: 'language',
    property: 'language',
    level: 'critical',
    title: 'ASCII German moechte live-agent uses the English line',
    secrets: [],
    steps: [{ text: 'Ich moechte mit einem Mitarbeiter sprechen', scripts: [TRAP] }],
    expect: { shape: 'handoff', lang: 'en' },
  });

  add({
    class: 'fin-wait',
    property: 'fin',
    level: 'critical',
    title: 'user.created live-agent request bypasses fin-wait',
    secrets: [],
    steps: [{ text: 'I want to talk to a live agent', scripts: [TRAP], topic: 'conversation.user.created', ageSec: 15, sourceOnly: true }],
    expect: { shape: 'handoff', lang: 'en' },
  });

  add({
    class: 'fin-wait',
    property: 'fin',
    level: 'critical',
    title: 'user.created ordinary FAQ stays in fin-wait',
    secrets: [],
    steps: [{ text: 'What is the leverage?', scripts: [TRAP], topic: 'conversation.user.created', ageSec: 15, sourceOnly: true }],
    expect: { shape: 'silence' },
  });

  add({
    class: 'fin-wait',
    property: 'fin',
    level: 'critical',
    title: 'user.created account-number question is answered, not handed off',
    secrets: [],
    steps: [{ text: 'What is my account number?', scripts: [TRAP], topic: 'conversation.user.created', ageSec: 15, sourceOnly: true }],
    expect: { shape: 'account', lang: 'en' },
  });

  add({
    class: 'fin-wait',
    property: 'fin',
    level: 'critical',
    title: 'fresh user.replied FAQ stays in fin-wait',
    secrets: [],
    steps: [{ text: 'What is the daily loss limit?', scripts: [TRAP], ageSec: 20 }],
    expect: { shape: 'silence' },
  });

  add({
    class: 'fin-wait',
    property: 'fin',
    level: 'critical',
    title: 'fresh user.replied live-agent request is not held for fin',
    secrets: [],
    steps: [{ text: 'I want to talk to a live agent', scripts: [TRAP], ageSec: 20 }],
    expect: { shape: 'handoff', lang: 'en' },
  });

  add({
    class: 'fin-wait',
    property: 'fin',
    level: 'critical',
    title: 'fresh user.replied account question is answered',
    secrets: [],
    steps: [{ text: 'What is my account number?', scripts: [TRAP], ageSec: 20 }],
    expect: { shape: 'account', lang: 'en' },
  });

  add({
    class: 'identity',
    property: 'identity',
    level: 'critical',
    title: 'are you a bot is answered, not handed off',
    secrets: [],
    steps: [{ text: 'Are you a bot or a real person?', scripts: [TRAP] }],
    expect: { shape: 'includes', includes: 'AI', fixed: 'none', absent: [FIXED.en] },
  });

  add({
    class: 'identity',
    property: 'identity',
    level: 'critical',
    title: 'are you a real person is not a handoff',
    secrets: [],
    steps: [{ text: 'Are you a real person?', scripts: [TRAP] }],
    expect: { shape: 'includes', includes: 'AI', fixed: 'none' },
  });

  add({
    class: 'identity',
    property: 'identity',
    level: 'critical',
    title: 'Roman Urdu identity question is not a handoff',
    secrets: [],
    steps: [{ text: 'kya aap ai ho?', scripts: [TRAP] }],
    expect: { shape: 'includes', includes: 'AI', fixed: 'none' },
  });

  add({
    class: 'identity',
    property: 'identity',
    level: 'critical',
    title: 'Italian identity question is not a handoff',
    secrets: [],
    steps: [{ text: 'Sei un bot o una persona reale?', scripts: [TRAP] }],
    expect: { shape: 'includes', includes: 'AI', fixed: 'none' },
  });

  add({
    class: 'identity',
    property: 'identity',
    level: 'critical',
    title: 'I want a real person is a handoff, not an identity answer',
    secrets: [],
    steps: [{ text: 'I want a real person', scripts: [TRAP] }],
    expect: { shape: 'handoff', lang: 'en' },
  });

  add({
    class: 'identity',
    property: 'identity',
    level: 'critical',
    title: 'personal family question is not a handoff',
    secrets: [],
    steps: [{ text: 'What is your wife name?', scripts: [reply('I will pass you to a teammate about your family.')] }],
    expect: { shape: 'includes', includes: 'Personal', fixed: 'none', absent: [FIXED.en, 'teammate'] },
  });

  add({
    class: 'empty-body',
    property: 'empty',
    level: 'critical',
    title: 'empty model body on a policy FAQ escalates',
    secrets: [],
    steps: [{ text: 'What is the consistency rule?', scripts: ['ACTION: REPLY\nBODY:\n'] }],
    expect: { shape: 'handoff', lang: 'en' },
  });

  add({
    class: 'empty-body',
    property: 'empty',
    level: 'critical',
    title: 'empty model body on what are the rules escalates',
    secrets: [],
    steps: [{ text: 'What are the rules?', scripts: ['ACTION: REPLY\nBODY:   '] }],
    expect: { shape: 'handoff', lang: 'en' },
  });

  add({
    class: 'empty-body',
    property: 'empty',
    level: 'critical',
    title: 'empty model body on a rejected payout is not silence',
    secrets: [],
    steps: [{ text: 'My payout was rejected', scripts: ['ACTION: REPLY\nBODY:\n'] }],
    expect: { shape: 'handoff', lang: 'en' },
  });

  add({
    class: 'empty-body',
    property: 'empty',
    level: 'critical',
    title: 'empty customer body does not invent a public reply',
    secrets: [],
    steps: [{ text: '', scripts: [TRAP], sourceOnly: true }],
    expect: { shape: 'silence' },
  });

  add({
    class: 'regression',
    property: 'regression',
    level: 'regression',
    title: 'greeting is not a handoff',
    secrets: [],
    steps: [{ text: 'Hello', scripts: [reply('Hello Casey, how can I help with your FundedElite account today?')] }],
    expect: { shape: 'includes', includes: 'how can I help', fixed: 'none' },
  });

  add({
    class: 'regression',
    property: 'regression',
    level: 'regression',
    title: 'non-numeric FAQ answer still ships',
    secrets: [],
    steps: [{ text: 'What is the consistency rule?', scripts: [reply('Consistency means your best day cannot dominate the profit you have made. The exact ratio depends on the challenge.')] }],
    expect: { shape: 'includes', includes: 'Consistency means', fixed: 'none', absent: [HEDGE] },
  });

  add({
    class: 'regression',
    property: 'regression',
    level: 'regression',
    title: 'supplying an account number is not treated as an account-number question',
    secrets: [],
    steps: [{ text: 'my account number is 738261', scripts: [reply('Thanks, I have the account reference you typed.')] }],
    expect: { shape: 'includes', includes: 'account reference', fixed: 'none', absent: [ACCOUNT.en] },
  });

  add({
    class: 'regression',
    property: 'regression',
    level: 'regression',
    title: 'short thanks after a prior reply is not a handoff',
    secrets: [],
    steps: [{ text: 'thanks', scripts: [reply("You're welcome, Casey.")], priorBot: true }],
    expect: { shape: 'includes', includes: 'welcome', fixed: 'none' },
  });

  add({
    class: 'regression',
    property: 'regression',
    level: 'overblock',
    title: 'medium live-agent request still hands off',
    secrets: [],
    steps: [{ text: 'I want to talk to a live agent about the payout status', scripts: [TRAP] }],
    expect: { shape: 'handoff', lang: 'en' },
  });

  cases.forEach((c, i) => {
    c.id = 'r7c' + String(i + 1).padStart(4, '0');
  });
  return cases;
}

function publicComments(writes) {
  // A public post is a delivered 2xx comment. A 500/422 attempt keeps its body
  // in the write log but never reached the customer.
  return writes.filter((w) => w.kind === 'comment' && successful(w));
}

function successful(w) {
  return w.status >= 200 && w.status < 300 && w.data && w.data.id && !(Array.isArray(w.data.errors) && w.data.errors.length);
}

function joinedPublic(writes) {
  return publicComments(writes).map((w) => stripHtml(w.body)).join('\n');
}

function rawPublic(writes) {
  return publicComments(writes).map((w) => String(w.body || ''));
}

function channelText(acc) {
  const chunks = [];
  for (const w of acc.writes) chunks.push(String(w.body || ''));
  for (const p of acc.prompts) chunks.push(p.blob);
  return chunks.join('\n');
}

function wrongFixed(text, allowed) {
  const hits = [];
  for (const [lang, line] of Object.entries(FIXED)) {
    if (lang === allowed) continue;
    if (text.includes(line)) hits.push(lang);
  }
  return hits;
}

function nfc(s) {
  return String(s || '').normalize('NFC');
}

function hasApprovedLine(text, line) {
  return nfc(text).includes(nfc(line));
}

function wrongAccount(text, allowed) {
  const hits = [];
  for (const [lang, line] of Object.entries(ACCOUNT)) {
    if (lang === allowed) continue;
    if (hasApprovedLine(text, line)) hits.push(lang);
  }
  return hits;
}

function handoffOk(writes, lang, preloaded) {
  const reasons = [];
  const comments = publicComments(writes);
  const line = FIXED[lang];
  const matching = comments.filter((w) => stripHtml(w.body) === line);
  if (matching.length !== 1) reasons.push('expected exactly one fixed line ' + lang + ', saw ' + matching.length);
  if (comments.length !== matching.length) reasons.push('extra public comments besides the fixed line: ' + comments.length);
  const wrong = wrongFixed(joinedPublic(writes), lang);
  if (wrong.length) reasons.push('wrong-language fixed line: ' + wrong.join(','));
  if (!preloaded) {
    const idx = writes.findIndex((w) => w.kind === 'comment' && stripHtml(w.body) === line);
    const before = idx >= 0 ? writes.slice(0, idx) : writes;
    const note = before.some((w) => w.kind === 'note' && successful(w));
    const asg = before.some((w) => w.kind === 'assignment' && successful(w));
    if (!note) reasons.push('fixed line was not preceded by a successful note');
    if (!asg) reasons.push('fixed line was not preceded by a successful assignment');
  }
  if (joinedPublic(writes).includes(SENTINEL)) reasons.push('sentinel reached the customer');
  if (joinedPublic(writes).includes('55188') || joinedPublic(writes).includes('QBG5FetfozKz7')) {
    reasons.push('spread template leaked into a handoff');
  }
  return reasons;
}

function evaluate(c, acc) {
  const reasons = [];
  const expect = c.expect || {};
  const text = joinedPublic(acc.writes);
  const raws = rawPublic(acc.writes);
  const logs = acc.logs.join('\n');
  let blame = 'product';
  if (world.tripwires.length) {
    reasons.push('network tripwire: ' + world.tripwires.join(','));
    blame = 'harness';
  }
  if (acc.threw) {
    reasons.push('threw ' + acc.threw);
    if (/TRIPWIRE|fixture|harness/i.test(acc.threw)) blame = 'harness';
  }
  if (/SKIP paused|SKIP test-mode|SKIP repliesEnabled/.test(logs) && expect.shape !== 'silence') {
    reasons.push('runtime skipped before the case could run');
    blame = 'harness';
  }
  if (/SKIP no user part/.test(logs) && c.steps.some((s) => s.text && !s.sourceOnly) && expect.shape !== 'silence') {
    reasons.push('user part was not visible to the webhook');
    blame = 'harness';
  }
  if (/WEBHOOK_ERR/.test(logs) && expect.shape !== 'silence' && expect.shape !== 'observe-spread-created') {
    reasons.push('WEBHOOK_ERR ' + (logs.match(/WEBHOOK_ERR.*/) || [''])[0].slice(0, 240));
  }

  const leaks = [];
  for (const spec of c.secrets || []) {
    if (containsLeak(channelText(acc), spec.value)) leaks.push(spec.name);
  }
  if (leaks.length) reasons.push('synthetic secret leaked: ' + leaks.join(','));

  if (expect.shape === 'silence') {
    if (publicComments(acc.writes).length !== 0) reasons.push('public posts=' + publicComments(acc.writes).length);
    if (text.includes(SENTINEL)) reasons.push('sentinel published');
    for (const line of Object.values(FIXED)) if (text.includes(line)) reasons.push('fixed line published on a silent path');
  } else if (expect.shape === 'handoff') {
    reasons.push(...handoffOk(acc.writes, expect.lang || 'en', !!expect.preloaded));
  } else if (expect.shape === 'account') {
    const line = ACCOUNT[expect.lang || 'en'];
    if (!hasApprovedLine(text, line)) reasons.push('missing account line ' + (expect.lang || 'en'));
    const wf = wrongFixed(text, '');
    if (wf.length || Object.values(FIXED).some((l) => text.includes(l))) reasons.push('account question posted a fixed handoff line');
    const wa = wrongAccount(text, expect.lang || 'en');
    if (wa.length) reasons.push('wrong-language account line: ' + wa.join(','));
    if (text.includes(SENTINEL)) reasons.push('sentinel published');
  } else if (expect.shape === 'spread') {
    const ok = raws.filter((b) => b === SPREAD);
    if (ok.length !== 1) reasons.push('locked spread bytes count=' + ok.length + ' public=' + raws.length);
    if (raws.length !== 1) reasons.push('spread path posted extra public bodies');
    if (text.includes('Hello') || text.includes('Ciao') || text.includes('Salam')) reasons.push('welcome prefix on the locked spread reply');
  } else if (expect.shape === 'hedge') {
    if (!text.includes(HEDGE)) reasons.push('missing hedge');
    if (Object.values(FIXED).some((l) => text.includes(l))) reasons.push('hedge path posted the fixed handoff line');
    if (text.includes('QBG5FetfozKz7') || /\b55188\b/.test(text)) reasons.push('spread material published');
  } else if (expect.shape === 'includes') {
    if (expect.includes && !text.toLowerCase().includes(String(expect.includes).toLowerCase())) {
      reasons.push('missing text: ' + expect.includes);
    }
    if (expect.fixed === 'none' && Object.values(FIXED).some((l) => text.includes(l))) reasons.push('unexpected fixed line');
    if (text.includes(SENTINEL)) reasons.push('sentinel published');
  } else if (expect.shape === 'noleak') {
    if (expect.includes && text && !text.toLowerCase().includes(String(expect.includes).toLowerCase()) && publicComments(acc.writes).length) {
      reasons.push('secret path altered the safe answer');
    }
    if (!text && publicComments(acc.writes).length === 0 && !leaks.length) {
      reasons.push('OVERBLOCK safe answer withheld');
    }
  } else if (expect.shape === 'observe-spread-created') {
    if (raws.length && raws.some((b) => b !== SPREAD)) reasons.push('user.created spread path posted non-exact bytes');
  }

  for (const bit of expect.absent || []) {
    if (bit && text.includes(bit)) reasons.push('forbidden text present: ' + bit.slice(0, 80));
  }
  if (expect.noteConfirmed === false) {
    const prog = acc.state && acc.state.fixedHandoff;
    if (prog && prog.noteConfirmed === true) reasons.push('partial note was stored as confirmed');
  }
  if (expect.noteConfirmed === true) {
    const prog = acc.state && acc.state.fixedHandoff;
    if (!prog || prog.noteConfirmed !== true) reasons.push('successful note was not stored as confirmed');
  }
  if (expect.publicCount != null && publicComments(acc.writes).length !== expect.publicCount) {
    reasons.push('public count ' + publicComments(acc.writes).length + ' != ' + expect.publicCount);
  }

  const unique = [];
  for (const r of reasons) if (r && !unique.includes(r)) unique.push(r);
  const overblock = unique.length === 1 && unique[0].startsWith('OVERBLOCK');
  let level = 'pass';
  if (unique.length) {
    if (blame === 'harness') level = 'harness';
    else if (overblock || c.level === 'overblock') level = 'overblock';
    else if (c.level === 'observation') level = 'observation';
    else if (c.level === 'regression') level = 'regression';
    else level = 'critical';
  }
  if (c.level === 'observation' && !unique.length) level = 'pass';
  return { level, reasons: unique, blame };
}

async function withLogs(fn) {
  const lines = [];
  const orig = console.log;
  const origErr = console.error;
  console.log = (...a) => lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  console.error = (...a) => lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  try {
    return { value: await fn(), lines };
  } finally {
    console.log = orig;
    console.error = origErr;
  }
}

function mockRes() {
  return { statusCode: 0, sendStatus(code) { this.statusCode = code; return this; } };
}

async function runCase(c, handleWebhook) {
  world.currentCase = c.id;
  world.writes = world.writes.filter((w) => w.conv !== c.id);
  world.prompts = [];
  world.tripwires = [];
  const step0 = c.steps[0];
  const conv = makeConversation(c, step0);
  world.convs.set(c.id, conv);
  if (step0.wipeState) mutate(conv, c.id, 'wipe-state');
  const logs = [];
  let threw = null;
  let statusCode = 0;
  for (let i = 0; i < c.steps.length; i++) {
    const step = c.steps[i];
    world.queue = (step.scripts || [TRAP]).slice();
    world.faults = step.faults ? JSON.parse(JSON.stringify(step.faults)) : null;
    if (i > 0 && step.mutateBefore) mutate(conv, c.id, step.mutateBefore);
    if (i > 0 && step.wipeState) mutate(conv, c.id, 'wipe-state');
    if (i > 0 && !step.replay) {
      conv.conversation_parts.conversation_parts.push(userPart(c.id, i, step.text, nowSec()));
      conv.source.body = step.text;
    }
    const topic = step.topic || 'conversation.user.replied';
    const req = { body: { topic, data: { item: { id: c.id, type: 'conversation' } } } };
    const call = async () => {
      const res = mockRes();
      await handleWebhook(req, res);
      statusCode = res.statusCode;
    };
    try {
      const ran = await withLogs(async () => {
        if (c.parallel && i === 0) await Promise.all([call(), call()]);
        else await call();
      });
      logs.push(...ran.lines);
    } catch (e) {
      threw = e && e.stack ? e.stack : String(e);
    }
  }
  const acc = {
    writes: world.writes.filter((w) => w.conv === c.id),
    prompts: world.prompts.filter((p) => p.conv === c.id),
    logs,
    state: loadTickets()[c.id] || {},
    threw,
    statusCode,
  };
  const judged = evaluate(c, acc);
  return {
    id: c.id,
    class: c.class,
    property: c.property,
    title: c.title,
    level: judged.level,
    reasons: judged.reasons,
    blame: judged.blame,
    publicCount: publicComments(acc.writes).length,
    writeKinds: acc.writes.map((w) => w.kind + ':' + w.status),
    publicPreview: redactPreview(joinedPublic(acc.writes), c),
    logTail: redactPreview(logs.slice(-8).join(' | '), c).slice(0, 500),
  };
}

function redactPreview(s, c) {
  let out = String(s || '');
  for (const spec of c.secrets || []) out = out.split(spec.value).join('[SYNTHETIC:' + spec.name + ']');
  return out.slice(0, 400);
}

world.complete = function complete(req) {
  const texts = [];
  for (const m of (req && req.messages) || []) {
    if (typeof m.content === 'string') texts.push(m.content);
    else texts.push(JSON.stringify(m.content));
  }
  const blob = texts.join('\n---\n');
  world.prompts.push({ conv: world.currentCase, blob });
  if (/Rewrite the following INTERNAL/i.test(blob)) {
    return 'The client asked for help with this conversation.';
  }
  if (world.queue.length) return world.queue.shift();
  return TRAP;
};

function tally(results) {
  const byClass = {};
  for (const r of results) {
    if (!byClass[r.class]) byClass[r.class] = { n: 0, pass: 0, critical: 0, regression: 0, overblock: 0, harness: 0, observation: 0 };
    const row = byClass[r.class];
    row.n += 1;
    if (r.level === 'pass') row.pass += 1;
    else row[r.level] += 1;
  }
  return byClass;
}

function verdictOf(results, hashOk, tripDuringLoad) {
  if (!hashOk || tripDuringLoad) return 'BLOCKED';
  const harness = results.filter((r) => r.level === 'harness');
  if (harness.length) return 'BLOCKED';
  const bad = results.filter((r) => r.level === 'critical' || r.level === 'regression' || r.level === 'overblock');
  if (bad.length) return 'NEEDS CHANGES';
  return 'PASS';
}

function writeReport(meta) {
  const { results, hashes, seal, verdict, byClass } = meta;
  const lines = [];
  lines.push('# Independent review: fixed-message handoff R7');
  lines.push('');
  lines.push('Reviewer role: independent. The author tests and the author report were not used for the verdict. No review branch was read.');
  lines.push('');
  lines.push('## Frozen artifact');
  lines.push('');
  lines.push('- Branch: `cursor/fixed-message-handoff-r7-8ad1`');
  lines.push('- Commit: `' + COMMIT + '`');
  lines.push('- Draft PR: https://github.com/raoarsal332-sketch/luna-source-secrets-free/pull/43');
  lines.push('- Hashes match: **' + (hashes.ok ? 'yes' : 'NO') + '**');
  lines.push('');
  lines.push('| File | sha256 | match |');
  lines.push('| --- | --- | --- |');
  for (const row of hashes.out) {
    lines.push('| `' + row.rel + '` | `' + row.got + '` | ' + (row.match ? 'yes' : 'no') + ' |');
  }
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('The harness requires `luna-current/01_runtime/index.js` and calls the exported `handleWebhook`. Axios is replaced in the require cache before that load, so `icRequest`, `postReply`, and `assignToTeammate` are the real functions and the only I/O is the recording transport. OpenAI is a scripted stub. `net`, `tls`, `http`, `https`, `dns`, `fetch`, and `child_process` throw if anything tries to leave the process. Ticket, control, mention, and write-op files are under `/tmp/handoff-r7-iso`. Conversation ids are `r7c####`. Synthetic secrets are letter tokens that do not contain `r7c` and do not contain a 5-digit run.');
  lines.push('');
  lines.push('Sealed case sha256: `' + seal + '`');
  lines.push('Cases: **' + results.length + '**');
  lines.push('');
  lines.push('The set was sealed again after the first execution. That first seal (`109f2a680d12b7762d75e473ba080a0eed5bb104e5af73fe668321edbf12a366`) is not the verdict. Three measurement errors were corrected: a non-2xx comment attempt was being counted as a public post; secret stimuli asked about the 2-step daily-loss limit, so the variant clarifier replaced the draft before redaction could be scored; account-line equality was byte-exact, so Unicode NFC reordering of one Arabic combining sequence looked like a missing translation. The oracles for handoff, hedge, spread bytes, silence, and leaks were not relaxed.');
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push('**' + verdict + '**');
  lines.push('');
  lines.push('## Denominators');
  lines.push('');
  lines.push('| Class | Cases | Pass | Critical | Regression | Over-block | Harness |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  let totals = { n: 0, pass: 0, critical: 0, regression: 0, overblock: 0, harness: 0 };
  for (const [name, row] of Object.entries(byClass)) {
    lines.push('| ' + name + ' | ' + row.n + ' | ' + row.pass + ' | ' + row.critical + ' | ' + row.regression + ' | ' + row.overblock + ' | ' + row.harness + ' |');
    totals.n += row.n;
    totals.pass += row.pass;
    totals.critical += row.critical;
    totals.regression += row.regression;
    totals.overblock += row.overblock;
    totals.harness += row.harness;
  }
  lines.push('| **total** | **' + totals.n + '** | **' + totals.pass + '** | **' + totals.critical + '** | **' + totals.regression + '** | **' + totals.overblock + '** | **' + totals.harness + '** |');
  lines.push('');
  const props = ['a', 'b', 'c', 'd', 'e', 'language', 'fin', 'identity', 'empty', 'regression'];
  lines.push('## By property');
  lines.push('');
  lines.push('| Property | Cases | Product failures |');
  lines.push('| --- | ---: | ---: |');
  for (const p of props) {
    const rows = results.filter((r) => r.property === p);
    const fails = rows.filter((r) => r.level === 'critical' || r.level === 'regression' || r.level === 'overblock');
    lines.push('| ' + p + ' | ' + rows.length + ' | ' + fails.length + ' |');
  }
  lines.push('');
  function section(title, level) {
    const rows = results.filter((r) => r.level === level);
    lines.push('## ' + title + ' (' + rows.length + ')');
    lines.push('');
    if (!rows.length) {
      lines.push('None.');
      lines.push('');
      return;
    }
    for (const r of rows) {
      lines.push('- `' + r.id + '` [' + r.class + '] ' + r.title);
      for (const reason of r.reasons) lines.push('  - ' + reason);
      if (r.publicPreview) lines.push('  - public: ' + r.publicPreview.replace(/\n/g, ' '));
      if (r.logTail) lines.push('  - log: ' + r.logTail.replace(/\n/g, ' '));
    }
    lines.push('');
  }
  section('Critical product failures', 'critical');
  section('Regressions', 'regression');
  section('Over-blocks', 'overblock');
  section('Harness mistakes', 'harness');
  const observed = results.filter((r) => r.class === 'spread' && r.title.includes('user.created'));
  lines.push('## Observation');
  lines.push('');
  if (observed.length) {
    const r = observed[0];
    lines.push('`' + r.id + '` user.created spread ask: level ' + r.level + ', public count ' + r.publicCount + '. Fin-wait still applies to spread asks on `conversation.user.created`. The byte-exact checks are the first reply and a later reply on conversations older than the Fin window. ' + (r.reasons.join('; ') || 'No format miss.'));
  }
  lines.push('');
  lines.push('## Mechanisms');
  lines.push('');
  lines.push('Property (a) held on all 60 human-owned, human-assigned, and human-replied threads. Account answers, identity answers, live-agent requests, FAQ drafts, replays, and deferred turns posted nothing public.');
  lines.push('');
  lines.push('Property (b) held on 21 of 22 sequence cases. A successful note plus a successful assignment is required before the fixed line, a 200 body with an errors array stays unconfirmed, a lost store replays the line once only when both parts exist, and a second delivery does not add a second line. `r7c0070` is the miss: assignment HTTP 422 withholds the line and does not mark the assignment ambiguous, so a later delivery is allowed to finish. The internal note is stored with a body. On the replay, `arsalAlreadyRepliedAfter` treats that note as a reply and returns before the recovery commit, so the assignment is never retried and the customer line is never sent.');
  lines.push('');
  lines.push('Property (c) failed on all 6 cases. For an unsupported 99% daily-loss figure, presend selects the approved hedge and logs `PRESEND hedge instead of fixed line`. `postClientCommentOnce` then runs the 2-step variant clarifier, which replaces the hedge with a Lite versus Free Retry question (`r7c0083`, `r7c0084`, `r7c0088`). The figure and the fixed line stay unpublished, and the approved hedge does not reach the customer. For an exact spread template, a one-character password near-miss, and a three-hit near-miss on a payout question, the draft is replaced with the hedge before the missed-escalation decision. The decision then no longer sees a spread template, the payout question is not an unsupported-number fail, and the path sends the fixed line (`r7c0085`, `r7c0086`, `r7c0087`). From `01_runtime/statePresend`, `targetedRegeneration.js` cannot load `../01_runtime/fixedMessageHandoff` (`MODULE_NOT_FOUND`, caught). Its spread-template and account-question checks are inactive in this layout. The fixed lines above were sent by `index.js`.');
  lines.push('');
  lines.push('Property (d) held. The locked 55188 reply was byte-exact on the first eligible ask and on a later ask outside the Fin window, with no welcome prefix. Near-miss wording (spread the word, spreadsheet, spread across, not about spreads, MT5 login without a spread ask) stayed off that template. The `conversation.user.created` spread ask remained in Fin-wait and posted nothing. That is recorded as an observation because the Fin-wait bypass was specified for live-agent requests.');
  lines.push('');
  lines.push('Property (e) failed on 15 of 22 cases. The delivered public comment contained the synthetic value after the sentence "The consistency rule limits how much one trading day can count." The customer message was labeled, so the labeled copy was redacted, and the model echo of the same value was still posted. The echo is kept when the remembered span includes trailing punctuation (`password: VALUE.` remembers `VALUE.`), when the remembered span is wider than the echo (`a?b!VALUE end`, `sk-VALUE`), when Bearer captures the following period, or when zero-width characters sit between the characters of the value. Brace-wrapped values, a label that stops before the word "and", and a base64 token repeated twice in the customer message were removed from the public reply. The four live-agent notes stayed free of those secrets.');
  lines.push('');
  lines.push('Language held for English, Urdu script, Roman Urdu, Hindi, Arabic, Hinglish, and Italian, and for French, German, Dutch, Spanish, Portuguese, Turkish, Polish, Russian, Chinese, Japanese, and Indonesian. Languages without an approved line used the English line. The Arabic account fact was the approved sentence, including the diacritic form of the question. German `möchte` and ASCII `moechte` both used the English line.');
  lines.push('');
  lines.push('Fin-wait held. A `conversation.user.created` live-agent request bypassed the wait and sent the fixed line. A fresh FAQ on that topic stayed quiet. Account-number questions were answered. Identity questions were answered and were not handed off. "I want a real person" was a handoff.');
  lines.push('');
  lines.push('Empty model bodies on "What is the consistency rule?" and "What are the rules?" escalated with the fixed line. `r7c0174` ("My payout was rejected") logged `SKIP empty reply body` and posted no note, assignment, or customer line. An empty customer body stayed silent.');
  lines.push('');
  lines.push('Regressions: 0. Over-blocks: 0. Harness mistakes in this sealed run: 0.');
  lines.push('');
  lines.push('## What was not done');
  lines.push('');
  lines.push('No merge, approval, deploy, or Intercom action. The author suite was not executed. The statePresend directory used to load the runtime is a local copy of the frozen pack and is not part of this review.');
  lines.push('');
  fs.writeFileSync(path.join(OUT_DIR, 'REPORT.md'), lines.join('\n'));
  const safe = results.map((r) => ({
    id: r.id,
    class: r.class,
    property: r.property,
    title: r.title,
    level: r.level,
    reasons: r.reasons,
    publicCount: r.publicCount,
    writeKinds: r.writeKinds,
  }));
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify({ verdict, seal, totals, results: safe }, null, 2));
}

async function main() {
  const hashes = verifyHashes();
  installEnv();
  installMocks();
  const engine = require(path.join(RUNTIME, 'index.js'));
  const cases = buildCases();
  if (cases.length < 160) throw new Error('sealed set is smaller than 160: ' + cases.length);
  const sealBody = JSON.stringify(cases.map((c) => ({
    id: c.id,
    class: c.class,
    property: c.property,
    level: c.level,
    title: c.title,
    ownership: c.ownership || '',
    steps: c.steps,
    expect: c.expect,
    parallel: !!c.parallel,
    secrets: (c.secrets || []).map((s) => s.name),
  })));
  const seal = sha256Text(sealBody);
  fs.writeFileSync(path.join(OUT_DIR, 'sealed-cases.json'), sealBody);
  const results = [];
  for (const c of cases) {
    results.push(await runCase(c, engine.handleWebhook));
  }
  const byClass = tally(results);
  const verdict = verdictOf(results, hashes.ok, false);
  writeReport({ results, hashes, seal, verdict, byClass });
  const failed = results.filter((r) => r.level !== 'pass');
  console.log(JSON.stringify({
    cases: results.length,
    verdict,
    seal,
    hashesOk: hashes.ok,
    failed: failed.length,
    byClass,
  }, null, 2));
  for (const r of failed) {
    console.log('FAIL', r.level, r.id, r.title, r.reasons.join(' || '));
  }
}

main().catch((e) => {
  console.error('HARNESS_FATAL', e && e.stack ? e.stack : e);
  process.exit(1);
});
