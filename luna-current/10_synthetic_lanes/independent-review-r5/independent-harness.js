'use strict';

/**
 * Independent R5 review harness. It calls the real handleWebhook.
 * Transport is an in-process axios stand-in. No socket, no Intercom, no live model.
 * Case specs are declarative and hashed before any assertion runs.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const RUNTIME = process.env.R5_RUNTIME;
if (!RUNTIME) {
  process.stderr.write('R5_RUNTIME is required\n');
  process.exit(2);
}

const ROOT = process.env.R5_STATE_DIR || '/tmp/r5-review/state';
fs.mkdirSync(ROOT, { recursive: true });
const TICKET = path.join(ROOT, 'ticket-state.json');
const OPS = path.join(ROOT, 'write-ops.json');
const CONTROL = path.join(ROOT, 'control.json');
const MENTION = path.join(ROOT, 'mention-rotate.json');
const DOTENV = path.join(ROOT, 'empty.env');
fs.writeFileSync(DOTENV, '');
fs.writeFileSync(
  CONTROL,
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

process.env.TICKET_STATE_FILE = TICKET;
process.env.LUNA_OP_STORE_FILE = OPS;
process.env.LUNA_CONTROL_STATE_FILE = CONTROL;
process.env.MENTION_ROTATE_FILE = MENTION;
process.env.LUNA_PROMPT_FILE = path.join(RUNTIME, 'system-prompt.txt');
process.env.FUNDEDELITE_FAQ_PATH = path.join(RUNTIME, 'fundedelite-faqs.md');
process.env.LUNA_TOOLS_ENABLED = '0';
process.env.DOTENV_CONFIG_PATH = DOTENV;
process.env.OPENAI_API_KEY = 'synthetic-review-key';
process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-review-token';
process.env.CONTROL_SECRET = 'synthetic-review-secret';

const ARSAL = '10118526';
const ELITE = '8052954';
const SEAT = '9000007';
const NOW = Math.floor(Date.now() / 1000);

const world = {
  conversation: null,
  calls: [],
  prompts: [],
  script: {},
  mainReply: '',
  ownerReply: '',
  logs: [],
};

function plain(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function scripted(mode) {
  if (mode === '500') return { status: 500, data: { errors: [{ code: 'server_error', message: 'synthetic' }] } };
  if (mode === '422') return { status: 422, data: { errors: [{ code: 'synthetic_422', message: 'synthetic' }] } };
  if (mode === 'partial') {
    return { status: 200, data: { id: 'synth-partial', type: 'conversation', errors: [{ code: 'partial_synth' }] } };
  }
  if (mode === 'timeout') {
    const err = new Error('synthetic timeout');
    err.code = 'ECONNABORTED';
    throw err;
  }
  if (mode === 'malformed') return { status: 200, data: { unexpected: true } };
  return { status: 200, data: { id: 'synth-write', type: 'conversation' } };
}

async function axiosImpl(config) {
  const method = String((config && config.method) || 'get').toLowerCase();
  const url = String((config && config.url) || '');
  const data = config && config.data;
  const call = { method, url, data: data || null };
  world.calls.push(call);
  if (/faq\.fundedelite\.com/i.test(url)) return { status: 500, data: '' };
  if (/api\.intercom\.io\/admins/.test(url)) {
    return {
      status: 200,
      data: {
        admins: [
          {
            id: SEAT,
            name: 'Synthetic Teammate',
            email: 'synthetic-seat@example.test',
            has_inbox_seat: true,
            away_mode_enabled: false,
            team_ids: [9629780],
          },
        ],
      },
    };
  }
  if (method === 'get' && /\/conversations\/[^/]+$/.test(url)) {
    if (!world.conversation) return { status: 404, data: { errors: [{ code: 'missing' }] } };
    return { status: 200, data: world.conversation };
  }
  if (method === 'post' && /\/reply$/.test(url)) {
    const mt = data && data.message_type;
    const mode = (world.script && world.script[mt]) || 'ok';
    return scripted(mode);
  }
  return { status: 599, data: { blocked: url } };
}

function installMocks() {
  const axios = function axios(config) {
    return axiosImpl(config);
  };
  axios.get = (url, config) => axiosImpl(Object.assign({}, config || {}, { method: 'get', url }));
  axios.post = (url, data, config) => axiosImpl(Object.assign({}, config || {}, { method: 'post', url, data }));
  axios.request = axiosImpl;
  axios.create = () => axios;
  const OpenAI = class OpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async (req) => {
            world.prompts.push(req);
            const blob = JSON.stringify(req.messages || []);
            let content = world.mainReply || 'ACTION: REPLY\nBODY: I can help with your FundedElite account.';
            if (/Rewrite the following INTERNAL/i.test(blob)) content = 'Client asked for a teammate review.';
            else if (/OWNER ACTION format/i.test(blob)) content = world.ownerReply || 'ACTION: NOTE\nBODY: Noted for the team.';
            else if (/HARD OVERRIDE: This is a general KB/i.test(blob)) {
              content = 'ACTION: REPLY\nBODY: The help centre describes that rule. I can explain it here.';
            }
            return { choices: [{ message: { content } }] };
          },
        },
      };
    }
  };
  const orig = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === 'axios') return axios;
    if (id === 'openai') return OpenAI;
    return orig.apply(this, arguments);
  };
}

installMocks();
const engine = require(path.join(RUNTIME, 'index.js'));
const handoff = require(path.join(RUNTIME, 'fixedMessageHandoff.js'));
const FIXED = handoff.FIXED_MESSAGES;
const FACTS = handoff.ACCOUNT_QUESTION_LINES;

function resetStores() {
  for (const f of [TICKET, OPS, MENTION]) {
    try { fs.unlinkSync(f); } catch (_) {}
  }
  world.calls = [];
  world.prompts = [];
  world.logs = [];
  world.script = { note: 'ok', assignment: 'ok', comment: 'ok' };
  world.mainReply = 'ACTION: REPLY\nBODY: I can help with your FundedElite account.';
  world.ownerReply = 'ACTION: NOTE\nBODY: Noted for the team.';
}

function userPart(id, text, at) {
  return {
    id: 'user-' + id,
    part_type: 'comment',
    body: text,
    author: { type: 'user', id: 'user-synth', name: 'Synthetic Client' },
    created_at: at,
  };
}

function adminPart(extra) {
  return Object.assign(
    {
      id: 'adm-' + Math.random().toString(16).slice(2),
      part_type: 'comment',
      body: '',
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      created_at: NOW - 100,
    },
    extra
  );
}

function makeConv(spec) {
  const id = spec.id;
  const created = spec.fresh ? NOW - 8 : NOW - 5000;
  const parts = (spec.prior || []).slice();
  if (spec.fin) {
    parts.push(
      adminPart({
        id: 'fin-' + id,
        author: { type: 'bot', id: ELITE, name: 'Elite AI' },
        body: "I'm connecting you to a teammate.",
        created_at: created + 10,
      })
    );
  }
  if (spec.botAsk) {
    parts.push(
      adminPart({
        id: 'ask-' + id,
        body: spec.botAsk,
        created_at: created + 30,
      })
    );
  }
  const text = spec.text || '';
  if (spec.sourceOnly) {
    parts.push();
  } else if (text) {
    parts.push(userPart(id, text, spec.botAfterUser ? created + 15 : created + 40));
    if (spec.botAfterUser) {
      parts.push(
        adminPart({
          id: 'after-' + id,
          body: spec.botAfterUser,
          created_at: created + 50,
        })
      );
    }
  }
  for (const p of spec.extraParts || []) parts.push(p);
  return {
    id,
    open: true,
    state: 'open',
    created_at: created,
    updated_at: created + 60,
    admin_assignee_id: spec.assignee == null ? ARSAL : spec.assignee,
    team_assignee_id: spec.team || 0,
    source: {
      body: spec.sourceOnly ? text : '',
      author: { type: 'user', id: 'user-synth', name: 'Synthetic Client' },
      created_at: created,
    },
    contacts: {
      contacts: [{ id: 'user-synth', name: 'Synthetic Client', email: 'synth-user@example.test' }],
    },
    conversation_parts: { conversation_parts: parts },
  };
}

function writesOf(calls) {
  const out = [];
  for (const c of calls) {
    if (!c.data || !c.data.message_type) continue;
    if (!/\/reply$/.test(c.url)) continue;
    out.push({
      type: c.data.message_type,
      body: String(c.data.body || ''),
      plain: plain(c.data.body || ''),
      assignee: c.data.assignee_id,
    });
  }
  return out;
}

function promptBlob() {
  return world.prompts.map((p) => JSON.stringify(p.messages || [])).join('\n');
}

function logBlob() {
  return world.logs.map((l) => l[1]).join('\n');
}

const PREMATURE =
  /\b(i['’]?ll|i will|we['’]?ll|we will)\s+(pass|forward|send|escalate|connect|transfer)\b|\bbefore i pass\b|\b(pass|forward|escalat\w*)\b[^.]{0,48}\b(teammate|the team)\b|\bour team will\b|\ba teammate will\b/i;

function containsCanary(blob, canary) {
  if (!canary) return false;
  return String(blob).includes(canary);
}

function ticketState(id) {
  try {
    const all = JSON.parse(fs.readFileSync(TICKET, 'utf8'));
    return all[id] || null;
  } catch (_) {
    return null;
  }
}

function check(spec, writes) {
  const fails = [];
  const exp = spec.expect || {};
  const comments = writes.filter((w) => w.type === 'comment');
  const notes = writes.filter((w) => w.type === 'note');
  const assigns = writes.filter((w) => w.type === 'assignment');
  const types = writes.map((w) => w.type);
  if (exp.writes && types.join(',') !== exp.writes.join(',')) {
    fails.push('write order ' + types.join(',') + ' wanted ' + exp.writes.join(','));
  }
  if (exp.noCustomer && comments.length) fails.push('customer message was sent: ' + comments.map((c) => c.plain).join(' | '));
  if (exp.noAssign && assigns.length) fails.push('assignment was sent');
  if (exp.noNote && notes.length) fails.push('note was sent');
  if (exp.oneComment && comments.length !== 1) fails.push('comment count ' + comments.length);
  if (exp.commentIs) {
    const want = exp.commentIs === 'fact' ? FACTS[exp.factLang || 'en'] : FIXED[exp.commentIs] || exp.commentIs;
    const got = comments.map((c) => c.plain).join(' || ');
    if (exp.commentIs === 'fact') {
      if (!comments.length || !got.includes(want)) fails.push('account answer missing fact; got ' + JSON.stringify(got));
      if (comments.some((c) => !c.plain.trim())) fails.push('empty account answer');
    } else if (comments.length !== 1 || comments[0].plain !== want) {
      fails.push('comment ' + JSON.stringify(got) + ' wanted ' + JSON.stringify(want));
    }
  }
  if (exp.commentHas) {
    const got = comments.map((c) => c.plain).join('\n');
    for (const bit of exp.commentHas) {
      if (!got.includes(bit)) fails.push('comment missing ' + JSON.stringify(bit) + ' got ' + JSON.stringify(got).slice(0, 400));
    }
  }
  if (exp.commentLacks) {
    const got = comments.map((c) => c.plain).join('\n') + '\n' + comments.map((c) => c.body).join('\n');
    for (const bit of exp.commentLacks) {
      if (got.includes(bit)) fails.push('comment leaked ' + bit);
    }
  }
  if (exp.noteLacks) {
    const got = notes.map((n) => n.body).join('\n');
    for (const bit of exp.noteLacks) if (got.includes(bit)) fails.push('note leaked ' + bit);
  }
  if (exp.noteHas) {
    const got = notes.map((n) => plain(n.body)).join('\n');
    for (const bit of exp.noteHas) if (!got.includes(bit)) fails.push('note missing ' + bit + ' got ' + got.slice(0, 300));
  }
  if (exp.promptLacks) {
    const blob = promptBlob();
    for (const bit of exp.promptLacks) if (blob.includes(bit)) fails.push('prompt leaked ' + bit);
  }
  if (exp.promptHas) {
    const blob = promptBlob();
    for (const bit of exp.promptHas) if (!blob.includes(bit)) fails.push('prompt missing ' + JSON.stringify(bit).slice(0, 180));
  }
  if (exp.logLacks) {
    const blob = logBlob();
    for (const bit of exp.logLacks) if (blob.includes(bit)) fails.push('log leaked ' + bit);
  }
  if (exp.noPromise) {
    for (const c of comments) {
      if (PREMATURE.test(c.plain)) fails.push('premature promise: ' + c.plain);
    }
  }
  if (exp.noFixed) {
    for (const c of comments) {
      if (Object.values(FIXED).includes(c.plain)) fails.push('fixed handoff line was sent');
    }
  }
  if (exp.awaiting === true) {
    const st = ticketState(spec.id);
    if (!st || st.escalateAwaitingFirstTeammate !== true) fails.push('escalateAwaitingFirstTeammate not set');
  }
  if (exp.awaiting === false) {
    const st = ticketState(spec.id);
    if (st && st.escalateAwaitingFirstTeammate === true) fails.push('escalateAwaitingFirstTeammate set on failure');
  }
  if (exp.assignee) {
    for (const a of assigns) {
      if (String(a.assignee) !== String(exp.assignee)) fails.push('assignee ' + a.assignee);
    }
  }
  if (exp.maxComments != null && comments.length > exp.maxComments) {
    fails.push('too many comments ' + comments.length);
  }
  if (exp.spreadIntact) {
    const got = comments.map((c) => c.plain).join('\n');
    if (!/TEST SPREAD ACCOUNT DETAILS/i.test(got)) fails.push('spread template missing');
    if (!got.includes('55188')) fails.push('spread account number missing');
    if (!got.includes('QBG5FetfozKz7^a?J!')) fails.push('spread password not intact: ' + got);
    if (/\bMT5\b|MetaTrader 5/.test(got) === false) fails.push('spread MT5 wording stripped');
  }
  if (exp.notSpread) {
    const got = comments.map((c) => c.plain).join('\n');
    if (/TEST SPREAD ACCOUNT DETAILS/i.test(got)) fails.push('spread template used for a non-spread ask');
  }
  return fails;
}

function resMock() {
  return { statusCode: 0, sendStatus(code) { this.statusCode = code; return this; } };
}

async function invoke(spec) {
  const prevLog = console.log;
  const prevErr = console.error;
  console.log = (...a) => { world.logs.push(['log', a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')]); };
  console.error = (...a) => { world.logs.push(['error', a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')]); };
  try {
    const res = resMock();
    await engine.handleWebhook(
      { body: { topic: spec.topic || 'conversation.user.replied', data: { item: { id: spec.id } } } },
      res
    );
    return res.statusCode;
  } finally {
    console.log = prevLog;
    console.error = prevErr;
  }
}

function seed(spec) {
  if (!spec.seed) return;
  fs.writeFileSync(TICKET, JSON.stringify({ [spec.id]: spec.seed }));
}

const CASES = [];

function add(spec) {
  CASES.push(spec);
}

const LANG_HANDOFF = [
  ['en', 'I want to talk to a human'],
  ['ur', 'مجھے ایجنٹ سے بات کرنی ہے'],
  ['ar', 'اريد التحدث مع موظف'],
  ['hi', 'मुझे एजेंट से बात करनी है'],
  ['it', 'Vorrei parlare con un operatore'],
  ['hinglish', 'mujhe agent se baat chahiye'],
];

for (const [lang, text] of LANG_HANDOFF) {
  add({
    id: 'order-welcome-' + lang,
    cls: 'order',
    text,
    expect: {
      writes: ['note', 'assignment', 'comment'],
      commentIs: lang === 'hinglish' ? 'ur' : lang,
      noPromise: true,
      awaiting: true,
      assignee: Number(SEAT),
    },
  });
}

add({
  id: 'order-welcome-fin-vague',
  cls: 'order',
  text: 'I need help',
  fin: true,
  expect: { writes: ['note', 'assignment', 'comment'], commentIs: 'en', noPromise: true, awaiting: true },
});

add({
  id: 'order-main',
  cls: 'order',
  text: 'My payout was rejected on account 77011001. Registered email synth77011001@example.test. The dashboard balance is wrong.',
  mainReply: 'ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: Payout rejected and the dashboard balance looks wrong.\nACTION_NEEDED: Please take this conversation.',
  expect: {
    writes: ['note', 'assignment', 'comment'],
    commentIs: 'en',
    noPromise: true,
    awaiting: true,
    noteHas: ['77011001', 'synth77011001@example.test'],
  },
});

add({
  id: 'order-presend',
  cls: 'order',
  text: 'My payout was rejected on account 77011002. Registered email synth77011002@example.test. The dashboard balance is wrong.',
  mainReply: 'ACTION: REPLY\nBODY: Please share your account number.',
  expect: { writes: ['note', 'assignment', 'comment'], commentIs: 'en', noPromise: true, awaiting: true, noteHas: ['77011002'] },
});

add({
  id: 'order-missed',
  cls: 'order',
  text: 'My payout was rejected on account 77011003 and the registered email is synth77011003@example.test. I need to speak to a human about the wrong balance shown on my dashboard after the review.',
  mainReply: 'ACTION: REPLY\nBODY: Payout reviews follow the help centre timeline.',
  expect: { writes: ['note', 'assignment', 'comment'], commentIs: 'en', noPromise: true, awaiting: true },
});

add({
  id: 'order-identity-recovery',
  cls: 'order',
  text: 'my account number is 77011004 and the email is synth77011004@example.test',
  botAfterUser: 'Please share your account number.',
  expect: { writes: ['note', 'assignment', 'comment'], commentIs: 'en', noPromise: true, awaiting: true, noteHas: ['77011004'] },
});

add({
  id: 'order-recovery-continue',
  cls: 'order',
  text: 'I still want to talk to a human about this payout',
  seed: {
    fixedHandoff: {
      noteConfirmed: true,
      noteAmbiguous: false,
      assignConfirmed: false,
      assignAmbiguous: false,
      assigneeId: SEAT,
      messageSent: false,
      messageAmbiguous: false,
      turnId: 'user-order-recovery-continue',
    },
  },
  expect: { writes: ['assignment', 'comment'], commentIs: 'en', noPromise: true, awaiting: true, noNote: true },
});

const FAIL_MODES = [
  ['note', '500'],
  ['note', 'timeout'],
  ['note', '422'],
  ['note', 'partial'],
  ['assignment', '500'],
  ['assignment', 'timeout'],
  ['assignment', '422'],
  ['assignment', 'partial'],
];
const FAIL_PATHS = [
  { key: 'welcome', text: 'I want to talk to a human', mainReply: null },
  {
    key: 'main',
    text: 'My payout was rejected on account 77012001. Email synth77012001@example.test and the dashboard balance is wrong.',
    mainReply: 'ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: Payout rejected.\nACTION_NEEDED: Please take this conversation.',
  },
  {
    key: 'presend',
    text: 'My payout was rejected on account 77012002. Email synth77012002@example.test and the dashboard balance is wrong.',
    mainReply: 'ACTION: REPLY\nBODY: Please share your account number.',
  },
  {
    key: 'missed',
    text: 'My payout was rejected on account 77012003. Email synth77012003@example.test. I need to speak to a human about the wrong dashboard balance.',
    mainReply: 'ACTION: REPLY\nBODY: Reviews follow the published timeline.',
  },
  { key: 'recovery', text: 'please connect me to a human', recovery: true },
];
for (const pathSpec of FAIL_PATHS) {
  for (const [which, mode] of FAIL_MODES) {
    if (pathSpec.recovery && which === 'note') continue;
    const id = 'fail-' + pathSpec.key + '-' + which + '-' + mode;
    const script = { note: 'ok', assignment: 'ok', comment: 'ok' };
    script[which] = mode;
    const expectWrites = pathSpec.recovery
      ? ['assignment']
      : which === 'note'
        ? ['note']
        : ['note', 'assignment'];
    add({
      id,
      cls: 'failure',
      text: pathSpec.text,
      mainReply: pathSpec.mainReply,
      script,
      seed: pathSpec.recovery
        ? {
            fixedHandoff: {
              noteConfirmed: true,
              assignConfirmed: false,
              assignAmbiguous: false,
              assigneeId: SEAT,
              messageSent: false,
              turnId: 'user-' + id,
            },
          }
        : null,
      expect: {
        writes: expectWrites,
        noCustomer: true,
        awaiting: false,
        noPromise: true,
      },
    });
  }
}

function notePart(body) {
  return adminPart({
    part_type: 'note',
    body,
    created_at: NOW - 30,
  });
}
function fixedPart(body) {
  return adminPart({
    part_type: 'comment',
    body,
    created_at: NOW - 10,
  });
}
function assignPart(assignee) {
  return {
    id: 'asg-replay',
    part_type: 'assignment',
    body: '',
    author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    assigned_to: { id: assignee },
    created_at: NOW - 20,
  };
}

add({
  id: 'replay-same-turn-state-kept',
  cls: 'replay',
  text: 'I want to talk to a human',
  second: { text: 'I want to talk to a human' },
  expect: { writes: ['note', 'assignment', 'comment'], oneComment: true, commentIs: 'en' },
});

add({
  id: 'replay-both-lost-parts-complete',
  cls: 'replay',
  text: 'I want to talk to a human',
  extraParts: [
    notePart('<b>Account:</b> Not provided<br><b>Problem:</b> Client asked for a human'),
    assignPart(SEAT),
    fixedPart(FIXED.en),
  ],
  assignee: SEAT,
  wipe: 'both',
  expect: { writes: [], noCustomer: true, noAssign: true, noNote: true },
});

add({
  id: 'replay-both-lost-assignee-visible-message-missing',
  cls: 'replay',
  text: 'I want to talk to a human',
  extraParts: [
    notePart('<b>Account:</b> Not provided<br><b>Problem:</b> Client asked for a human'),
    assignPart(SEAT),
  ],
  assignee: SEAT,
  wipe: 'both',
  expect: { writes: ['comment'], commentIs: 'en', noNote: true, noAssign: true, oneComment: true },
});

add({
  id: 'replay-bot-seat-not-already-assigned',
  cls: 'replay',
  text: 'I want to talk to a human',
  extraParts: [assignPart(ARSAL)],
  assignee: ARSAL,
  expect: { writes: ['note', 'assignment', 'comment'], assignee: Number(SEAT), commentIs: 'en' },
});

add({
  id: 'replay-ambiguous-hold-state-kept',
  cls: 'replay',
  text: 'I want to talk to a human',
  firstScript: { note: 'ok', assignment: '500', comment: 'ok' },
  secondScript: { note: 'ok', assignment: 'ok', comment: 'ok' },
  expectFirstNoCustomer: true,
  expectSecondWrites: [],
});

add({
  id: 'replay-500-opstore-kept-state-lost',
  cls: 'replay',
  text: 'I want to talk to a human',
  firstScript: { note: 'ok', assignment: '500', comment: 'ok' },
  secondScript: { note: 'ok', assignment: 'ok', comment: 'ok' },
  wipe: 'state',
  expectFirstNoCustomer: true,
  expectSecondNoCustomer: true,
});

add({
  id: 'replay-422-retries-assign-still-no-message',
  cls: 'replay',
  text: 'I want to talk to a human',
  firstScript: { note: 'ok', assignment: '422', comment: 'ok' },
  secondScript: { note: 'ok', assignment: '422', comment: 'ok' },
  expectFirstNoCustomer: true,
  expectSecondNoCustomer: true,
});

add({
  id: 'replay-message-500-no-second-message',
  cls: 'replay',
  text: 'I want to talk to a human',
  firstScript: { note: 'ok', assignment: 'ok', comment: '500' },
  secondScript: { note: 'ok', assignment: 'ok', comment: 'ok' },
  expectSecondNoCustomer: true,
  expectSecondWrites: [],
});

const OWN_LANG = [
  ['en', 'I want to talk to a human', 'any update?'],
  ['ur', 'مجھے ایجنٹ سے بات کرنی ہے', 'کوئی اپڈیٹ؟'],
  ['ar', 'اريد التحدث مع موظف', 'هل يوجد تحديث؟'],
  ['hi', 'मुझे एजेंट से बात करनी है', 'कोई अपडेट?'],
  ['hinglish', 'mujhe agent se baat chahiye', 'koi update hai?'],
  ['mixed', 'please مجھے agent chahiye now', 'any update بھائی?'],
];
for (const [lang, handoffText, ping] of OWN_LANG) {
  add({
    id: 'own-handoff-' + lang,
    cls: 'ownership',
    text: handoffText,
    assignee: SEAT,
    expect: { writes: [], noCustomer: true, noAssign: true, noNote: true },
  });
  add({
    id: 'own-ping-' + lang,
    cls: 'ownership',
    text: ping,
    assignee: SEAT,
    expect: { writes: [], noCustomer: true, noAssign: true, noNote: true },
  });
  add({
    id: 'own-stale-' + lang,
    cls: 'ownership',
    text: handoffText,
    assignee: ARSAL,
    extraParts: [assignPart(SEAT)],
    expect: { writes: [], noCustomer: true, noAssign: true },
  });
}

const ACCT_Q = [
  ['en', 'what is my account number', 'en'],
  ['en-q', 'what is my account number?', 'en'],
  ['en-bare', 'account number', 'en'],
  ['ur', 'میرا اکاؤنٹ نمبر کیا ہے', 'ur'],
  ['ur-q', 'میرا اکاؤنٹ نمبر کیا ہے؟', 'ur'],
  ['ar', 'ما هو رقم الحساب', 'ar'],
  ['ar-q', 'ما هو رقم الحساب؟', 'ar'],
  ['hi', 'मेरा खाता नंबर क्या है', 'hi'],
  ['hi-q', 'मेरा खाता नंबर क्या है?', 'hi'],
  ['hinglish', 'mera account number kya hai', 'hinglish'],
  ['hinglish-q', 'mera account number kya hai?', 'hinglish'],
  ['it', 'qual e il numero di conto', 'it'],
  ['mixed', 'bhai what is my اکاؤنٹ نمبر', 'ur'],
];
for (const [tag, text, factLang] of ACCT_Q) {
  add({
    id: 'acct-welcome-' + tag,
    cls: 'account',
    text,
    expect: { noAssign: true, noNote: true, oneComment: true, commentIs: 'fact', factLang, noPromise: true, noFixed: true, awaiting: false },
  });
  add({
    id: 'acct-owned-' + tag,
    cls: 'account',
    text,
    assignee: SEAT,
    expect: { noAssign: true, noNote: true, oneComment: true, commentIs: 'fact', factLang, noPromise: true, noFixed: true },
  });
}

add({
  id: 'acct-recovery-422',
  cls: 'account',
  text: 'what is my account number?',
  seed: {
    fixedHandoff: {
      noteConfirmed: true,
      assignConfirmed: false,
      assignAmbiguous: false,
      assigneeId: SEAT,
      messageSent: false,
      turnId: 'old-turn',
    },
  },
  expect: { noAssign: true, noNote: true, oneComment: true, commentIs: 'fact', factLang: 'en', noPromise: true, noFixed: true },
});
add({
  id: 'acct-recovery-500',
  cls: 'account',
  text: 'account number',
  seed: {
    fixedHandoff: {
      noteConfirmed: true,
      assignConfirmed: false,
      assignAmbiguous: true,
      assigneeId: SEAT,
      messageSent: false,
      turnId: 'old-turn',
    },
  },
  expect: { noAssign: true, noNote: true, oneComment: true, commentIs: 'fact', factLang: 'en', noPromise: true, noFixed: true },
});
add({
  id: 'acct-fresh-created',
  cls: 'account',
  text: 'what is my account number?',
  topic: 'conversation.user.created',
  fresh: true,
  sourceOnly: true,
  expect: { oneComment: true, commentIs: 'fact', factLang: 'en', noPromise: true, noFixed: true },
});
add({
  id: 'acct-fresh-replied',
  cls: 'account',
  text: 'what is my account number?',
  fresh: true,
  expect: { oneComment: true, commentIs: 'fact', factLang: 'en', noPromise: true, noFixed: true },
});
add({
  id: 'acct-identity-supply-is-handoff',
  cls: 'account',
  text: 'my account number is 77013001',
  mainReply: 'ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: Client supplied an account number.\nACTION_NEEDED: Please take this conversation.',
  expect: { writes: ['note', 'assignment', 'comment'], commentIs: 'en', noPromise: true, noteHas: ['77013001'] },
});
add({
  id: 'acct-digits-with-question-mark',
  cls: 'account',
  text: 'account number 77013002?',
  expect: { noFixed: true, noPromise: true, oneComment: true, commentIs: 'fact', factLang: 'en', noAssign: true },
});
add({
  id: 'identity-ask-no-promise',
  cls: 'identity',
  text: 'My payout was rejected and the dashboard balance is wrong.',
  mainReply: 'ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: Payout rejected.\nACTION_NEEDED: Please take this conversation.',
  expect: {
    noAssign: true,
    noNote: true,
    oneComment: true,
    noPromise: true,
    noFixed: true,
    commentLacks: ["I'll pass", 'I will pass', 'teammate', 'before I pass'],
    awaiting: false,
  },
});
add({
  id: 'identity-bot-question',
  cls: 'identity',
  text: 'Are you a bot or a real person?',
  mainReply: 'ACTION: REPLY\nBODY: I am an AI assistant for FundedElite support.',
  expect: { noAssign: true, noNote: true, noFixed: true, noPromise: true, oneComment: true },
});
add({
  id: 'identity-ask-email-only',
  cls: 'identity',
  text: 'My payout was rejected on account 77013003 and the dashboard balance is wrong.',
  mainReply: 'ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: Payout rejected.\nACTION_NEEDED: Please take this conversation.',
  expect: {
    writes: ['note', 'assignment', 'comment'],
    commentIs: 'en',
    noteHas: ['77013003'],
    noPromise: true,
  },
});

const CREDS = [
  ['multi', 'password is blue river stone 77', 'blue river stone 77'],
  ['braces', 'password is {brace-secret-alpha}', 'brace-secret-alpha'],
  ['html', 'password is <b>htmlsecretvalue</b>', 'htmlsecretvalue'],
  ['entity', 'password&#58;entitysecretvalue', 'entitysecretvalue'],
  ['equals-entity', 'password&#61;equalsecretvalue', 'equalsecretvalue'],
  ['apostrophe', "password's apostrophesecret", 'apostrophesecret'],
  ['curly-apos', 'password’s curlyaposecret', 'curlyaposecret'],
  ['deva', 'पास वर्ड spacedevasecret', 'spacedevasecret'],
  ['gupt', 'गुप्तशब्द guptshabdsecret', 'guptshabdsecret'],
  ['gupt-space', 'गुप्त शब्द guptspace-secret', 'guptspace-secret'],
  ['koot', 'कूटशब्द kootshabdsecret', 'kootshabdsecret'],
  ['koot-space', 'कूट शब्द kootspacesecret', 'kootspacesecret'],
  ['sanket', 'संकेत शब्द sanketshabdsecret', 'sanketshabdsecret'],
  ['passcode-hi', 'पासकोड hindipasscodesecret', 'hindipasscodesecret'],
  ['ar', 'كلمة المرور arabicsecretvalue', 'arabicsecretvalue'],
  ['ur', 'پاس ورڈ urdusecretvalue', 'urdusecretvalue'],
  ['tag-label', '<b>password</b> is taglabelsecret', 'taglabelsecret'],
  ['stop-account', 'password is keepsecret and account 77014088', 'keepsecret'],
];
for (const [tag, fragment, canary] of CREDS) {
  add({
    id: 'cred-escalate-' + tag,
    cls: 'credential',
    text:
      'My payout was rejected on account 77014001. Email synth77014001@example.test. ' +
      fragment +
      '. The dashboard balance is wrong.',
    mainReply: 'ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: Payout rejected.\nACTION_NEEDED: Please review.',
    canary,
    expect: {
      writes: ['note', 'assignment', 'comment'],
      commentIs: 'en',
      noteLacks: [canary],
      promptLacks: [canary],
      logLacks: [canary],
      commentLacks: [canary],
      noteHas: tag === 'stop-account' ? ['77014088'] : ['77014001'],
      noPromise: true,
    },
  });
  add({
    id: 'cred-reply-echo-' + tag,
    cls: 'credential',
    text: 'How does the consistency rule work? ' + fragment,
    mainReply: 'ACTION: REPLY\nBODY: The consistency rule still applies. Value was ' + canary + '.',
    canary,
    expect: {
      noAssign: true,
      noNote: true,
      promptLacks: [canary],
      logLacks: [canary],
      commentLacks: [canary],
      noPromise: true,
      noFixed: true,
    },
  });
}

const B64 = 'QWJjZGVmZ2hpamtsbW5vcHFyc3Q';
add({
  id: 'cred-base64-twice',
  cls: 'credential',
  text: 'How does the consistency rule work? token block ' + B64 + ' and again ' + B64,
  mainReply: 'ACTION: REPLY\nBODY: The consistency rule still applies.',
  canary: B64,
  expect: { promptLacks: [B64], commentLacks: [B64], logLacks: [B64], noFixed: true, noPromise: true },
});
add({
  id: 'cred-second-pass-placeholder',
  cls: 'credential',
  text: "How does the consistency rule work? password's [secret] stays quoted",
  mainReply: 'ACTION: REPLY\nBODY: The consistency rule still applies and the placeholder stays.',
  expect: {
    promptHas: ['[secret]'],
    commentLacks: ['passwordd', 'passwor[secret]'],
    noPromise: true,
    noFixed: true,
  },
});
add({
  id: 'cred-owner-prompt',
  cls: 'credential',
  topic: 'conversation.admin.noted',
  text: 'please summarise this ticket',
  priorNote: 'Client wrote password is ownerpromptsecret before the note.',
  canary: 'ownerpromptsecret',
  ownerReply: 'ACTION: NOTE\nBODY: Summary prepared.',
  expect: { promptLacks: ['ownerpromptsecret'], noteLacks: ['ownerpromptsecret'], logLacks: ['ownerpromptsecret'] },
});
add({
  id: 'cred-remembered-echo',
  cls: 'credential',
  text: 'How does a challenge reset work?',
  priorUser: 'password is rememberedsecretvalue',
  canary: 'rememberedsecretvalue',
  mainReply: 'ACTION: REPLY\nBODY: A reset follows the help centre. rememberedsecretvalue should not echo.',
  expect: { promptLacks: ['rememberedsecretvalue'], commentLacks: ['rememberedsecretvalue'], logLacks: ['rememberedsecretvalue'], noPromise: true },
});

add({
  id: 'faq-holding-time',
  cls: 'faq',
  text: 'What is the minimum holding time for trades?',
  mainReply: 'ACTION: REPLY\nBODY: There is a minimum holding time for trades. I can explain that rule from the help centre.',
  expect: {
    noAssign: true,
    noNote: true,
    noFixed: true,
    noPromise: true,
    oneComment: true,
    promptHas: ['minimum holding', 'OFFICIAL FAQ CONTEXT'],
  },
});
add({
  id: 'faq-daily-loss',
  cls: 'faq',
  text: 'How much can I lose in one day before a breach?',
  mainReply: 'ACTION: ESCALATE\nKIND: FAQ_CONFIRM\nBODY: Daily loss question.',
  expect: { noFixed: true, noPromise: true, promptHas: ['OFFICIAL FAQ CONTEXT'] },
});
add({
  id: 'faq-escalate-not-account-ask',
  cls: 'faq',
  text: 'What is the consistency rule?',
  mainReply: 'ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: I will pass this to a teammate and need the account number.',
  expect: { noPromise: true },
});
add({
  id: 'spread-check',
  cls: 'spread',
  text: 'Can I check the spreads on the test server?',
  expect: { spreadIntact: true, noAssign: true, noNote: true, noPromise: true, oneComment: true },
});
add({
  id: 'spread-what-are',
  cls: 'spread',
  text: 'What are the spreads?',
  expect: { spreadIntact: true, noAssign: true, oneComment: true },
});
add({
  id: 'spread-negative-login',
  cls: 'spread',
  text: 'My MT5 login password is not working on my own account.',
  mainReply: 'ACTION: REPLY\nBODY: I can help with the login issue on your FundedElite account.',
  expect: { notSpread: true, noFixed: true },
});
add({
  id: 'spread-negative-distribution',
  cls: 'spread',
  text: 'My positions are spread across two accounts. What should I do?',
  mainReply: 'ACTION: REPLY\nBODY: Tell me which FundedElite account you mean and I can explain the rule.',
  expect: { notSpread: true },
});
add({
  id: 'handoff-substantive-not-fixed',
  cls: 'order',
  text: 'I want to talk to a human because my payout was rejected on account 77015001 and the dashboard balance is wrong after the review finished yesterday.',
  mainReply: 'ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: Payout rejected.\nACTION_NEEDED: Please take this conversation.',
  expect: { writes: ['note', 'assignment', 'comment'], commentIs: 'en', awaiting: true },
});
add({
  id: 'status-ping-bot-owned-not-silent',
  cls: 'ownership',
  text: 'any update on the payout rules?',
  mainReply: 'ACTION: REPLY\nBODY: Payout requests follow the help centre schedule.',
  expect: { noFixed: true, noPromise: true },
});
add({
  id: 'owned-account-arabic-question-mark',
  cls: 'account',
  text: 'رقم الحساب؟',
  assignee: SEAT,
  expect: { oneComment: true, commentIs: 'fact', factLang: 'ar', noAssign: true, noPromise: true, noFixed: true },
});
add({
  id: 'mixed-hindi-english-handoff',
  cls: 'order',
  text: 'kripya mujhe agent se baat karwa do',
  expect: { noPromise: true },
});
add({
  id: 'urdu-note-english',
  cls: 'order',
  text: 'مجھے ایجنٹ سے بات کرنی ہے',
  expect: {
    writes: ['note', 'assignment', 'comment'],
    commentIs: 'ur',
    promptHas: ['Rewrite the following INTERNAL'],
    noteLacks: ['ایجنٹ'],
  },
});

const seal = crypto
  .createHash('sha256')
  .update(JSON.stringify(CASES.map((c) => ({ id: c.id, cls: c.cls, text: c.text, topic: c.topic || '', expect: c.expect || null, canary: c.canary || '' }))))
  .digest('hex');

async function runOne(spec) {
  resetStores();
  world.conversation = makeConv(spec);
  world.mainReply = spec.mainReply || world.mainReply;
  world.ownerReply = spec.ownerReply || world.ownerReply;
  if (spec.priorUser) {
    world.conversation.conversation_parts.conversation_parts.unshift(
      userPart(spec.id + '-prior', spec.priorUser, NOW - 4000)
    );
  }
  if (spec.priorNote) {
    world.conversation.conversation_parts.conversation_parts.unshift(
      notePart(spec.priorNote)
    );
    world.conversation.conversation_parts.conversation_parts.push({
      id: 'owner-note-' + spec.id,
      part_type: 'note',
      body: spec.text,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      created_at: NOW,
    });
  }
  seed(spec);
  if (spec.script) world.script = Object.assign({ note: 'ok', assignment: 'ok', comment: 'ok' }, spec.script);
  if (spec.firstScript) world.script = Object.assign({ note: 'ok', assignment: 'ok', comment: 'ok' }, spec.firstScript);
  const status = await invoke(spec);
  const firstWrites = writesOf(world.calls);
  let fails = [];
  if (spec.expectFirstNoCustomer && firstWrites.some((w) => w.type === 'comment')) {
    fails.push('first turn sent a customer message');
  }
  if (spec.second || spec.secondScript || spec.wipe) {
    const snap = world.calls.length;
    if (spec.wipe === 'both' || spec.wipe === 'state') {
      try { fs.unlinkSync(TICKET); } catch (_) {}
    }
    if (spec.wipe === 'both' || spec.wipe === 'ops') {
      try { fs.unlinkSync(OPS); } catch (_) {}
    }
    if (spec.secondScript) world.script = Object.assign({ note: 'ok', assignment: 'ok', comment: 'ok' }, spec.secondScript);
    await invoke(spec.second ? Object.assign({}, spec, spec.second) : spec);
    const secondWrites = writesOf(world.calls.slice(snap));
    if (spec.expectSecondWrites && secondWrites.map((w) => w.type).join(',') !== spec.expectSecondWrites.join(',')) {
      fails.push('second write order ' + secondWrites.map((w) => w.type).join(','));
    }
    if (spec.expectSecondNoCustomer && secondWrites.some((w) => w.type === 'comment')) {
      fails.push('second turn sent a customer message');
    }
    if (spec.expect) fails = fails.concat(check(spec, writesOf(world.calls)));
    return { id: spec.id, cls: spec.cls, status, fails, writes: writesOf(world.calls).map((w) => w.type) };
  }
  fails = fails.concat(check(spec, firstWrites));
  return {
    id: spec.id,
    cls: spec.cls,
    status,
    fails,
    writes: firstWrites.map((w) => w.type + (w.type === 'comment' ? ':' + w.plain.slice(0, 80) : '')),
  };
}

(async () => {
  const results = [];
  for (const spec of CASES) {
    try {
      results.push(await runOne(spec));
    } catch (e) {
      results.push({ id: spec.id, cls: spec.cls, status: 0, fails: ['threw ' + (e && e.stack || e)], writes: [] });
    }
  }
  const failed = results.filter((r) => r.fails.length);
  const byClass = {};
  for (const r of results) {
    byClass[r.cls] = byClass[r.cls] || { n: 0, fail: 0 };
    byClass[r.cls].n += 1;
    if (r.fails.length) byClass[r.cls].fail += 1;
  }
  const out = {
    seal,
    cases: results.length,
    failed: failed.length,
    passed: results.length - failed.length,
    byClass,
    failures: failed,
    all: results.map((r) => ({ id: r.id, cls: r.cls, ok: r.fails.length === 0, writes: r.writes })),
  };
  fs.writeFileSync(path.join('/tmp/r5-review', 'results.json'), JSON.stringify(out, null, 2));
  process.stdout.write(
    'SEAL ' + seal + '\nCASES ' + results.length + '\nFAILED ' + failed.length + '\n' +
      failed.map((f) => f.id + ' :: ' + f.fails.join(' || ') + ' || writes=' + f.writes.join(',')).join('\n') +
      '\n'
  );
  process.exit(failed.length ? 1 : 0);
})();
