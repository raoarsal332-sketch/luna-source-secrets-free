'use strict';

/**
 * Independent R3 review. Drives the pinned webhook handler through an isolated
 * recording transport. Does not merge, approve, activate, deploy, or call
 * Intercom, OpenAI, a VPS, or any customer store. Synthetic fixtures only.
 *
 * This file is the sealed case list. It does not import or replay the author's
 * fixedMessageHandoff.test.js suite.
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PIN = '88a663da6b1aac1e8e14fe4e9f1459f2eea7287b';
const EXPECTED = {
  'luna-current/01_runtime/fixedMessageHandoff.js':
    '4b540186af6cce394abd3f6a90cc51a56d908bd823d647a8cc5653cca8245236',
  'luna-current/01_runtime/teammateHandoffGates.js':
    '96eaf4ce75a0eb888cdabb5552a7e90996cdde2278721a8958e7991032e4ca2b',
  'luna-current/01_runtime/index.js':
    'a99d781e7d6d0a2297f76fa8d81e7e34a0478ad83402ae7c9cd90d7c12dbf1cd',
};

const REPO = path.resolve(__dirname, '../../..');
const ARSAL = '10118526';
const ELITE = '8052954';
const RISK = '10675195';
const ESC = '9629759';
const JERRY = '8053416';
const TEAMMATE = '424242';
const CANARY = 'CANARY77';
const FIXED = Object.freeze({
  en: 'A teammate now has this conversation.',
  ur: 'یہ گفتگو اب ایک ساتھی کے پاس ہے۔',
  ar: 'هذه المحادثة الآن لدى أحد الزملاء.',
  hi: 'यह बातचीत अब एक साथी के पास है।',
});

const PROMISE = /\b(review(?:ing)?|shortly|guarantee|forwarded|will update|as soon as|closer look|have your|they have your|hang tight)\b/i;
const LANGS = [
  ['en', 'I want to talk to a human', 'en'],
  ['ur', 'مجھے ایک انسان سے بات کرنی ہے۔', 'ur'],
  ['ar', 'اريد التحدث مع موظف', 'ar'],
  ['hi', 'मुझे एक एजेंट से बात करनी है', 'hi'],
  ['hinglish', 'mujhe agent please', 'ur'],
];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function verifyPin() {
  const head = execFileSync('git', ['rev-parse', PIN], { cwd: REPO, encoding: 'utf8' }).trim();
  assert.strictEqual(head, PIN, 'pinned commit is not the advertised head');
  const out = {};
  for (const file of Object.keys(EXPECTED)) {
    const blob = execFileSync('git', ['show', PIN + ':' + file], { cwd: REPO });
    const got = sha256(blob);
    assert.strictEqual(got, EXPECTED[file], file + ' sha256 mismatch');
    out[file] = got;
  }
  return out;
}

function prepareRuntime() {
  const stamp = path.join(os.tmpdir(), 'luna-r3-independent-runtime');
  const marker = path.join(stamp, '.pin');
  const markerValue = PIN + ':layout2';
  if (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== markerValue) {
    fs.rmSync(stamp, { recursive: true, force: true });
    fs.mkdirSync(stamp, { recursive: true });
    const archivePath = path.join(stamp, 'pin.tar');
    execFileSync('git', ['archive', '--output=' + archivePath, PIN, 'luna-current'], { cwd: REPO });
    execFileSync('tar', ['-x', '-C', stamp, '-f', archivePath]);
    fs.rmSync(archivePath, { force: true });
    const runtime = path.join(stamp, 'luna-current/01_runtime');
    // The live process keeps these modules inside the runtime directory so their
    // ../repeatedClientQuestion and ../assistantIdentityGuard requires resolve.
    fs.cpSync(path.join(stamp, 'luna-current/02_statePresend'), path.join(runtime, 'statePresend'), { recursive: true });
    execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: runtime,
      stdio: 'inherit',
    });
    fs.writeFileSync(marker, markerValue);
  }
  return path.join(stamp, 'luna-current/01_runtime');
}

function loadHandler(runtime) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-r3-state-'));
  const controlFile = path.join(stateDir, 'control.json');
  const ticketFile = path.join(stateDir, 'tickets.json');
  const opFile = path.join(stateDir, 'ops.json');
  const rotateFile = path.join(stateDir, 'rotate.json');
  fs.writeFileSync(
    controlFile,
    JSON.stringify({
      paused: false,
      pausedUntil: null,
      aiOff: {},
      testMode: false,
      testAllowNames: [],
      testAllowConversationIds: [],
      config: { model: 'synthetic-review', welcomeEnabled: true, repliesEnabled: true },
    })
  );
  fs.writeFileSync(ticketFile, '{}');
  fs.writeFileSync(opFile, '{}');
  process.env.LUNA_CONTROL_STATE_FILE = controlFile;
  process.env.TICKET_STATE_FILE = ticketFile;
  process.env.LUNA_OP_STORE_FILE = opFile;
  process.env.MENTION_ROTATE_FILE = rotateFile;
  process.env.LUNA_PROMPT_FILE = path.join(runtime, 'system-prompt.txt');
  process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-review-token';
  process.env.OPENAI_API_KEY = 'synthetic-review-key';
  process.env.LUNA_TOOLS_ENABLED = '0';
  process.env.MAINTAINER_ENABLED = 'false';
  delete process.env.LUNA_PRESEND_MODE;

  const calls = [];
  const openaiCalls = [];
  const logs = [];
  const fixtures = new Map();
  const current = { script: { note: 'ok', assign: 'ok', comment: 'ok' }, model: null };

  const axios = require(path.join(runtime, 'node_modules/axios'));
  axios.defaults.adapter = async function recordingAdapter(config) {
    const method = String(config.method || 'get').toLowerCase();
    let data = config.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (_) { /* keep */ }
    }
    const url = String(config.url || '');
    const call = { method, url, data: data || null };
    calls.push(call);
    if (!/^https:\/\/api\.intercom\.io\//.test(url)) {
      const err = new Error('BLOCKED_NON_INTERCOM ' + url);
      err.code = 'BLOCKED';
      throw err;
    }
    const auth = config.headers && (config.headers.Authorization || config.headers.authorization);
    if (auth && auth !== 'Bearer synthetic-review-token') {
      const err = new Error('BLOCKED_UNEXPECTED_TOKEN');
      err.code = 'BLOCKED';
      throw err;
    }
    const respond = (status, body) => ({
      data: body,
      status,
      statusText: String(status),
      headers: {},
      config,
    });
    if (method === 'get' && url.indexOf('/admins') !== -1) {
      return respond(200, {
        admins: [
          {
            id: TEAMMATE,
            name: 'Synthetic Teammate',
            email: 'synthetic.teammate@example.net',
            has_inbox_seat: true,
            away_mode_enabled: false,
            team_ids: [9629780],
          },
        ],
      });
    }
    if (method === 'get' && url.indexOf('/conversations/') !== -1) {
      const id = decodeURIComponent(url.split('/conversations/')[1].split(/[?#]/)[0]);
      const conv = fixtures.get(id);
      if (!conv) return respond(404, { type: 'error.list', errors: [{ code: 'not_found' }] });
      return respond(200, conv);
    }
    if (method === 'post' && /\/reply(?:\?|$)/.test(url)) {
      const kind = data && data.message_type;
      const mode = kind === 'assignment' ? current.script.assign : kind === 'note' ? current.script.note : current.script.comment;
      if (mode === 'timeout') {
        const err = new Error('timeout of 20000ms exceeded');
        err.code = 'ECONNABORTED';
        throw err;
      }
      if (mode === '500') return respond(500, { type: 'error.list', errors: [{ code: 'server_error', message: 'synthetic' }] });
      if (mode === '422') return respond(422, { type: 'error.list', errors: [{ code: 'parameter_invalid', message: 'synthetic assignee' }] });
      if (mode === 'partial') {
        return respond(200, { id: 'partial-1', type: 'conversation', errors: [{ code: 'partial_apply', message: 'not fully applied' }] });
      }
      if (mode === 'malformed') return respond(200, { ok: true });
      return respond(200, { id: 'write-' + calls.length, type: 'conversation' });
    }
    return respond(404, { type: 'error.list', errors: [{ code: 'unexpected_url', message: url }] });
  };

  const Module = require('module');
  const origRequire = Module.prototype.require;
  Module.prototype.require = function patchedRequire(id) {
    if (id === 'openai') {
      return class FakeOpenAI {
        constructor() {}
        chat = {
          completions: {
            create: async (req) => {
              openaiCalls.push(req);
              const blob = JSON.stringify(req || {});
              if (blob.indexOf('INTERNAL Intercom note field') !== -1) {
                return { choices: [{ message: { content: 'Synthetic English internal summary.' } }] };
              }
              const scripted = current.model;
              const text = typeof scripted === 'function' ? scripted(req) : scripted || 'ACTION: REPLY\nBODY: Synthetic general answer.';
              return { choices: [{ message: { content: text } }] };
            },
          },
        };
      };
    }
    return origRequire.apply(this, arguments);
  };

  process.chdir(runtime);
  const handler = require(path.join(runtime, 'index.js'));
  Module.prototype.require = origRequire;

  const origLog = console.log;
  console.log = (...args) => {
    logs.push(args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  };

  function readTickets() {
    try { return JSON.parse(fs.readFileSync(ticketFile, 'utf8')); } catch (_) { return {}; }
  }
  function writeTickets(all) {
    fs.writeFileSync(ticketFile, JSON.stringify(all));
  }

  return {
    handler,
    calls,
    openaiCalls,
    logs,
    fixtures,
    current,
    readTickets,
    writeTickets,
    opFile,
    ticketFile,
    restore() { console.log = origLog; },
  };
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function userPart(id, body, at) {
  return {
    id,
    part_type: 'comment',
    body,
    created_at: at,
    author: { type: 'user', id: 'user-synth', name: 'Synthetic Client' },
  };
}

function makeConv(opts) {
  const created = opts.createdAt == null ? nowSec() - 86400 : opts.createdAt;
  const text = opts.text || '';
  const parts = opts.parts || [userPart('u-' + opts.id, text, created + 100)];
  const conv = {
    type: 'conversation',
    id: String(opts.id),
    created_at: created,
    updated_at: created + 100,
    admin_assignee_id: opts.assignee == null ? ARSAL : opts.assignee,
    team_assignee_id: opts.teamId == null ? '0' : opts.teamId,
    source: {
      type: 'conversation',
      id: 'src-' + opts.id,
      body: opts.sourceBody == null ? text : opts.sourceBody,
      created_at: created,
      author: { type: 'user', id: 'user-synth', name: 'Synthetic Client', email: 'synthetic.client@example.net' },
    },
    contacts: {
      type: 'contact.list',
      contacts: [{ id: 'ct-synth', name: 'Synthetic Client', email: 'synthetic.client@example.net' }],
    },
    conversation_parts: { type: 'conversation_part.list', conversation_parts: parts },
  };
  if (opts.teamName) conv.team_assignee = { type: 'team', id: String(opts.teamId || '0'), name: opts.teamName };
  if (opts.teamAssigneeName) conv.team_assignee_name = opts.teamAssigneeName;
  if (opts.assigneeObj) conv.assignee = opts.assigneeObj;
  return conv;
}

function writesOf(calls) {
  return calls.filter((c) => c.method === 'post' && /\/reply(?:\?|$)/.test(c.url));
}

function kindsOf(calls) {
  return writesOf(calls).map((c) => c.data && c.data.message_type);
}

function bodies(calls, type) {
  return writesOf(calls).filter((c) => c.data && c.data.message_type === type).map((c) => String(c.data.body || ''));
}

function blobOf(calls, openaiCalls) {
  return JSON.stringify({ calls, openaiCalls });
}

function show(s) {
  return String(s || '').replace(/CANARY77[A-Za-z0-9_-]*/g, '[canary]').slice(0, 300);
}

const MODEL = {
  escalate:
    'ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: Payout rejected and the dashboard shows a breach.\nACTION_NEEDED: Please take this conversation.',
  escalateCanary:
    "ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: Payout rejected. password's CANARY77\nACTION_NEEDED: Please take this conversation.",
  reask:
    'ACTION: REPLY\nBODY: I will check the payout status. What is your account number?',
  faq: 'ACTION: REPLY\nBODY: SYNTH_FAQ_CONSISTENCY The consistency rule is a general product rule in this synthetic answer.',
  account: 'ACTION: REPLY\nBODY: SYNTH_ACCOUNT_ANSWER Your question about the account number is a normal question and is answered here.',
  missed:
    'ACTION: REPLY\nBODY: SYNTH_MISSED_DRAFT The consistency rule is a general product rule.',
  greeting: 'ACTION: REPLY\nBODY: SYNTH_GREETING Hello, how can I help with FundedElite today?',
};

function baseConv(id, text, extra) {
  return makeConv(Object.assign({ id, text }, extra || {}));
}

function problemsFor(snap, expect) {
  const problems = [];
  const kinds = kindsOf(snap.calls);
  const comments = bodies(snap.calls, 'comment');
  const notes = bodies(snap.calls, 'note');
  const joined = comments.join('\n');
  if (expect.kinds && JSON.stringify(kinds) !== JSON.stringify(expect.kinds)) {
    problems.push('write order ' + JSON.stringify(kinds) + ' wanted ' + JSON.stringify(expect.kinds));
  }
  if (expect.kindsPrefix) {
    const prefix = kinds.slice(0, expect.kindsPrefix.length);
    if (JSON.stringify(prefix) !== JSON.stringify(expect.kindsPrefix)) {
      problems.push('write prefix ' + JSON.stringify(kinds) + ' wanted ' + JSON.stringify(expect.kindsPrefix));
    }
  }
  if (expect.commentCount != null && comments.length !== expect.commentCount) {
    problems.push('comment count ' + comments.length + ' wanted ' + expect.commentCount + ' :: ' + show(joined));
  }
  if (expect.commentExact != null && joined !== expect.commentExact) {
    problems.push('comment exact ' + show(joined));
  }
  if (expect.commentIncludes && joined.indexOf(expect.commentIncludes) === -1) {
    problems.push('comment missing ' + expect.commentIncludes + ' :: ' + show(joined));
  }
  for (const piece of expect.commentExcludes || []) {
    if (joined.indexOf(piece) !== -1) problems.push('comment contained forbidden text ' + show(piece));
  }
  if (expect.noPromise) {
    for (const c of comments) {
      if (PROMISE.test(c)) problems.push('premature promise in comment: ' + show(c));
    }
  }
  if (expect.noFixed) {
    for (const line of Object.values(FIXED)) {
      if (joined.indexOf(line) !== -1) problems.push('fixed handoff line was sent: ' + line);
    }
  }
  if (expect.awaiting === true && !(snap.state && snap.state.escalateAwaitingFirstTeammate === true)) {
    problems.push('escalateAwaitingFirstTeammate was not set');
  }
  if (expect.awaiting === false && snap.state && snap.state.escalateAwaitingFirstTeammate === true) {
    problems.push('escalateAwaitingFirstTeammate was set');
  }
  if (expect.assignId != null) {
    const assign = writesOf(snap.calls).find((c) => c.data && c.data.message_type === 'assignment');
    if (!assign) problems.push('missing assignment payload');
    else if (Number(assign.data.assignee_id) !== Number(expect.assignId)) {
      problems.push('assignee_id ' + assign.data.assignee_id);
    } else if (String(assign.data.admin_id) !== ARSAL) problems.push('admin_id ' + assign.data.admin_id);
    else if (assign.data.type !== 'admin') problems.push('assignment type ' + assign.data.type);
  }
  if (expect.noteHas) {
    const note = notes.join('\n');
    if (note.indexOf(expect.noteHas) === -1) problems.push('note missing ' + expect.noteHas);
  }
  if (expect.pathLog && snap.logs.join('\n').indexOf(expect.pathLog) === -1) {
    problems.push('path log missing ' + expect.pathLog);
  }
  if (expect.noteAmbiguous != null) {
    const flag = !!(snap.state && snap.state.fixedHandoff && snap.state.fixedHandoff.noteAmbiguous);
    if (flag !== expect.noteAmbiguous) problems.push('noteAmbiguous ' + flag);
  }
  if (expect.assignAmbiguous != null) {
    const flag = !!(snap.state && snap.state.fixedHandoff && snap.state.fixedHandoff.assignAmbiguous);
    if (flag !== expect.assignAmbiguous) problems.push('assignAmbiguous ' + flag);
  }
  if (expect.messageAmbiguous != null) {
    const flag = !!(snap.state && snap.state.fixedHandoff && snap.state.fixedHandoff.messageAmbiguous);
    if (flag !== expect.messageAmbiguous) problems.push('messageAmbiguous ' + flag);
  }
  for (const secret of expect.absent || []) {
    const surfaces = [];
    if (bodies(snap.calls, 'note').join('\n').indexOf(secret) !== -1) surfaces.push('internal note');
    if (bodies(snap.calls, 'comment').join('\n').indexOf(secret) !== -1) surfaces.push('customer message');
    if (JSON.stringify(snap.openaiCalls).indexOf(secret) !== -1) surfaces.push('note-translation prompt');
    if (surfaces.length) problems.push('credential leak of synthetic canary into ' + surfaces.join(' and '));
  }
  if (expect.oneCustomerMessage) {
    const customer = comments.filter((c) => Object.values(FIXED).indexOf(c) !== -1 || c.indexOf(FIXED.en) !== -1);
    if (comments.length !== 1) problems.push('expected exactly one customer message, saw ' + comments.length);
  }
  return problems;
}

async function main() {
  const hashes = verifyPin();
  const runtime = prepareRuntime();
  const ctx = loadHandler(runtime);
  const cases = [];
  let seq = 910000;

  function id() {
    seq += 1;
    return String(seq);
  }

  function add(entry) {
    cases.push(entry);
  }

  async function deliver(opts) {
    if (!opts.keepCalls) {
      ctx.calls.length = 0;
      ctx.openaiCalls.length = 0;
      ctx.logs.length = 0;
    }
    ctx.current.script = opts.script || { note: 'ok', assign: 'ok', comment: 'ok' };
    ctx.current.model = opts.model || null;
    if (opts.state) {
      const all = ctx.readTickets();
      all[String(opts.conv.id)] = opts.state;
      ctx.writeTickets(all);
    }
    ctx.fixtures.set(String(opts.conv.id), opts.conv);
    const req = {
      body: {
        topic: opts.topic || 'conversation.user.replied',
        data: { item: { id: opts.conv.id, type: 'conversation' } },
      },
    };
    const res = { statusCode: 0, sendStatus(code) { this.statusCode = code; return this; } };
    await ctx.handler.handleWebhook(req, res);
    const state = ctx.readTickets()[String(opts.conv.id)] || null;
    return {
      calls: ctx.calls.slice(),
      openaiCalls: ctx.openaiCalls.slice(),
      logs: ctx.logs.slice(),
      res,
      state,
    };
  }

  const okScript = { note: 'ok', assign: 'ok', comment: 'ok' };

  function successExpect(lang, pathLog) {
    return {
      kinds: ['note', 'assignment', 'comment'],
      commentExact: FIXED[lang],
      commentCount: 1,
      noPromise: true,
      awaiting: true,
      assignId: Number(TEAMMATE),
      pathLog,
      absent: [CANARY],
    };
  }

  // --- five paths, happy order ---
  for (const [name, text, lang] of LANGS) {
    add({
      id: 'R3I-welcome-' + name,
      title: 'welcome handoff in ' + name + ' posts note, assignment, then one fixed line',
      group: 'order',
      async run() {
        const snap = await deliver({ conv: baseConv(id(), text), script: okScript });
        return problemsFor(snap, successExpect(lang, 'FIXED_HANDOFF sent welcome'));
      },
    });
  }

  add({
    id: 'R3I-identity-recovery',
    title: 'identity recovery posts note, assignment, then one fixed line',
    group: 'order',
    async run() {
      const cid = id();
      const created = nowSec() - 86400;
      const conv = makeConv({
        id: cid,
        text: 'Account 189143 email synth.user@example.net',
        sourceBody: '',
        createdAt: created,
        parts: [
          userPart('u-rec', 'My payout was rejected. Account 189143 email synth.user@example.net', created + 10),
          {
            id: 'a-ask',
            part_type: 'comment',
            body: 'Before I pass this to the team, please share your account number.',
            created_at: created + 20,
            author: { type: 'admin', id: ARSAL, name: 'Arsal' },
          },
        ],
      });
      const snap = await deliver({ conv, script: okScript });
      return problemsFor(snap, successExpect('en', 'FIXED_HANDOFF sent identity_recovery'));
    },
  });

  add({
    id: 'R3I-main-escalate',
    title: 'main escalate posts note, assignment, then one fixed line',
    group: 'order',
    async run() {
      const text = 'My payout was rejected and my dashboard shows a breach. Account 189143 email synth.user@example.net';
      const snap = await deliver({ conv: baseConv(id(), text), script: okScript, model: MODEL.escalate });
      return problemsFor(snap, successExpect('en', 'FIXED_HANDOFF sent main_escalate'));
    },
  });

  add({
    id: 'R3I-presend-escalate',
    title: 'pre-send re-ask of a known account becomes note, assignment, then one fixed line',
    group: 'order',
    async run() {
      const cid = id();
      const created = nowSec() - 86400;
      const conv = makeConv({
        id: cid,
        text: 'Can you check why my payout was rejected?',
        sourceBody: '',
        createdAt: created,
        parts: [
          userPart('u-old', 'Account 189143 email synth.user@example.net', created + 10),
          userPart('u-new', 'Can you check why my payout was rejected?', created + 30),
        ],
      });
      const snap = await deliver({ conv, script: okScript, model: MODEL.reask });
      return problemsFor(snap, successExpect('en', 'FIXED_HANDOFF sent presend_escalate'));
    },
  });

  add({
    id: 'R3I-missed-escalation',
    title: 'missed escalation posts note, assignment, then one fixed line',
    group: 'order',
    async run() {
      const text = 'I have a complaint about the payout rules.';
      const snap = await deliver({ conv: baseConv(id(), text), script: okScript, model: MODEL.missed });
      return problemsFor(snap, successExpect('en', 'FIXED_HANDOFF sent missed_escalation'));
    },
  });

  // --- assignment failures on all five paths ---
  const failPaths = [
    {
      key: 'welcome',
      pathLogWithheld: 'FIXED_HANDOFF withheld',
      build(cid) {
        return { conv: baseConv(cid, 'I want to talk to a human') };
      },
    },
    {
      key: 'identity',
      build(cid) {
        const created = nowSec() - 86400;
        return {
          conv: makeConv({
            id: cid,
            text: 'Account 189143',
            sourceBody: '',
            createdAt: created,
            parts: [
              userPart('u-' + cid, 'Account 189143 email synth.user@example.net', created + 10),
              {
                id: 'ask-' + cid,
                part_type: 'comment',
                body: 'Before I pass this to the team, please share your account number.',
                created_at: created + 20,
                author: { type: 'admin', id: ARSAL, name: 'Arsal' },
              },
            ],
          }),
        };
      },
    },
    {
      key: 'main',
      build(cid) {
        return {
          conv: baseConv(cid, 'My payout was rejected and my dashboard shows a breach. Account 189143 email synth.user@example.net'),
          model: MODEL.escalate,
        };
      },
    },
    {
      key: 'presend',
      build(cid) {
        const created = nowSec() - 86400;
        return {
          model: MODEL.reask,
          conv: makeConv({
            id: cid,
            text: 'Can you check why my payout was rejected?',
            sourceBody: '',
            createdAt: created,
            parts: [
              userPart('old-' + cid, 'Account 189143 email synth.user@example.net', created + 10),
              userPart('new-' + cid, 'Can you check why my payout was rejected?', created + 30),
            ],
          }),
        };
      },
    },
    {
      key: 'missed',
      build(cid) {
        return {
          conv: baseConv(cid, 'I have a complaint about the payout rules.'),
          model: MODEL.missed,
        };
      },
    },
  ];

  const failModes = [
    ['500', { assign: '500' }, { assignAmbiguous: true }],
    ['timeout', { assign: 'timeout' }, { assignAmbiguous: true }],
    ['422', { assign: '422' }, { assignAmbiguous: false }],
    ['partial', { assign: 'partial' }, { assignAmbiguous: true }],
  ];

  for (const pathSpec of failPaths) {
    for (const [mode, scriptAssign, flags] of failModes) {
      add({
        id: 'R3I-fail-' + pathSpec.key + '-' + mode,
        title: pathSpec.key + ' assignment ' + mode + ' withholds the message and leaves awaiting clear',
        group: 'assign-failure',
        critical: 'premature_promise',
        async run() {
          const built = pathSpec.build(id());
          const snap = await deliver({
            conv: built.conv,
            model: built.model || null,
            script: { note: 'ok', comment: 'ok', assign: scriptAssign.assign },
          });
          return problemsFor(snap, Object.assign({
            kinds: ['note', 'assignment'],
            commentCount: 0,
            awaiting: false,
            noPromise: true,
            absent: [CANARY],
          }, flags));
        },
      });
    }
  }

  add({
    id: 'R3I-note-500',
    title: 'note HTTP 500 posts nothing else and leaves awaiting clear',
    group: 'assign-failure',
    async run() {
      const snap = await deliver({
        conv: baseConv(id(), 'I want to talk to a human'),
        script: { note: '500', assign: 'ok', comment: 'ok' },
      });
      return problemsFor(snap, { kinds: ['note'], commentCount: 0, awaiting: false, noteAmbiguous: true });
    },
  });

  add({
    id: 'R3I-note-timeout',
    title: 'note timeout posts nothing else and leaves awaiting clear',
    group: 'assign-failure',
    async run() {
      const snap = await deliver({
        conv: baseConv(id(), 'I want to talk to a human'),
        script: { note: 'timeout', assign: 'ok', comment: 'ok' },
      });
      return problemsFor(snap, { kinds: ['note'], commentCount: 0, awaiting: false, noteAmbiguous: true });
    },
  });

  add({
    id: 'R3I-note-422',
    title: 'note HTTP 422 withholds assignment and the message',
    group: 'assign-failure',
    async run() {
      const snap = await deliver({
        conv: baseConv(id(), 'I want to talk to a human'),
        script: { note: '422', assign: 'ok', comment: 'ok' },
      });
      return problemsFor(snap, { kinds: ['note'], commentCount: 0, awaiting: false, noteAmbiguous: false });
    },
  });

  add({
    id: 'R3I-assign-malformed',
    title: 'malformed assignment success withholds the message',
    group: 'assign-failure',
    async run() {
      const snap = await deliver({
        conv: baseConv(id(), 'I want to talk to a human'),
        script: { note: 'ok', assign: 'malformed', comment: 'ok' },
      });
      return problemsFor(snap, { kinds: ['note', 'assignment'], commentCount: 0, awaiting: false, assignAmbiguous: true });
    },
  });

  add({
    id: 'R3I-message-timeout',
    title: 'message timeout after a successful assignment does not set awaiting',
    group: 'assign-failure',
    async run() {
      const snap = await deliver({
        conv: baseConv(id(), 'I want to talk to a human'),
        script: { note: 'ok', assign: 'ok', comment: 'timeout' },
      });
      return problemsFor(snap, {
        kinds: ['note', 'assignment', 'comment'],
        commentCount: 1,
        awaiting: false,
        messageAmbiguous: true,
        noPromise: true,
        commentExact: FIXED.en,
      });
    },
  });

  // --- ownership fail closed ---
  const owners = [
    ['human', (cid, text) => baseConv(cid, text, { assignee: '555001' })],
    ['numeric-human', (cid, text) => baseConv(cid, text, { assignee: 555001 })],
    ['jerry', (cid, text) => baseConv(cid, text, { assignee: JERRY })],
    ['admin-body-without-part-type', (cid, text) => {
      const created = nowSec() - 86400;
      return makeConv({
        id: cid,
        text,
        sourceBody: '',
        createdAt: created,
        parts: [
          { id: 'bare-' + cid, body: 'I am taking this from here.', created_at: created + 10, author: { type: 'admin', id: '555005', name: 'Sam' } },
          userPart('u-' + cid, text, created + 20),
        ],
      });
    }],
    ['teammate-author', (cid, text) => {
      const created = nowSec() - 86400;
      return makeConv({
        id: cid,
        text,
        sourceBody: '',
        createdAt: created,
        parts: [
          { id: 'tm-' + cid, part_type: 'comment', body: 'I am looking at this.', created_at: created + 10, author: { type: 'teammate', id: '555006', name: 'Sam' } },
          userPart('u-' + cid, text, created + 20),
        ],
      });
    }],
    ['teammate-note', (cid, text) => {
      const created = nowSec() - 86400;
      return makeConv({
        id: cid,
        text,
        sourceBody: '',
        createdAt: created,
        parts: [
          { id: 'tn-' + cid, part_type: 'note', body: 'Internal teammate note.', created_at: created + 10, author: { type: 'teammate', id: '555007', name: 'Sam' } },
          userPart('u-' + cid, text, created + 20),
        ],
      });
    }],
    ['risk-id', (cid, text) => baseConv(cid, text, { teamId: RISK, createdAt: nowSec() - 30 })],
    ['risk-name', (cid, text) => baseConv(cid, text, { teamName: 'Risk' })],
    ['escalations-id', (cid, text) => baseConv(cid, text, { teamId: ESC, createdAt: nowSec() - 30 })],
    ['escalations-name', (cid, text) => baseConv(cid, text, { teamAssigneeName: 'Escalations' })],
    ['ambiguous', (cid, text) => baseConv(cid, text, { assignee: '0', assigneeObj: { type: 'admin', name: 'Unclear' } })],
    ['stale', (cid, text) => {
      const created = nowSec() - 86400;
      return makeConv({
        id: cid,
        text,
        sourceBody: '',
        createdAt: created,
        parts: [
          {
            id: 'asg-' + cid,
            part_type: 'assignment',
            body: '',
            created_at: created + 10,
            author: { type: 'admin', id: ARSAL, name: 'Arsal' },
            assigned_to: { type: 'admin', id: '555002' },
          },
          userPart('u-' + cid, text, created + 20),
        ],
      });
    }],
  ];

  for (const [ownerName, build] of owners) {
    for (const [langName, text] of LANGS) {
      add({
        id: 'R3I-own-' + ownerName + '-' + langName,
        title: 'ownership ' + ownerName + ' stays silent for ' + langName,
        group: 'ownership',
        critical: 'ownership_breach',
        async run() {
          const snap = await deliver({ conv: build(id(), text), script: okScript, model: MODEL.faq });
          return problemsFor(snap, {
            commentCount: 0,
            awaiting: false,
            noFixed: true,
            noPromise: true,
            absent: [CANARY],
          });
        },
      });
    }
  }

  // Ownership also has to fail closed on the paths that run before the defer gate.
  for (const lang of LANGS) {
    add({
      id: 'R3I-own-identity-' + lang[0],
      title: 'identity recovery stays silent when a human already owns the thread (' + lang[0] + ')',
      group: 'ownership',
      critical: 'ownership_breach',
      async run() {
        const cid = id();
        const created = nowSec() - 86400;
        const conv = makeConv({
          id: cid,
          assignee: '555001',
          text: lang[1],
          sourceBody: '',
          createdAt: created,
          parts: [
            userPart('u-' + cid, 'Account 189143 email synth.user@example.net. ' + lang[1], created + 10),
            {
              id: 'ask-' + cid,
              part_type: 'comment',
              body: 'Before I pass this to the team, please share your account number.',
              created_at: created + 20,
              author: { type: 'admin', id: ARSAL, name: 'Arsal' },
            },
          ],
        });
        const snap = await deliver({ conv, script: okScript });
        return problemsFor(snap, { commentCount: 0, kinds: [], awaiting: false, noFixed: true });
      },
    });
  }

  // --- account-number questions must not be taken by the welcome ---
  const accountPhrases = [
    ['en', 'What is my account number?'],
    ['en-ac', 'What is my a/c no?'],
    ['en-hash', 'Can you tell me the account # ?'],
    ['en-acct', 'What is the acct number?'],
    ['ur', 'میرا اکاؤنٹ نمبر کیا ہے؟'],
    ['ar', 'ما هو رقم الحساب؟'],
    ['hi', 'मेरा खाता नंबर क्या है?'],
    ['hi-latin-script', 'मेरा अकाउंट नंबर क्या है?'],
    ['hinglish', 'mera account number kya hai?'],
  ];

  for (const [name, text] of accountPhrases) {
    for (const fin of [false, true]) {
      add({
        id: 'R3I-acct-' + name + (fin ? '-after-fin' : '-plain'),
        title: 'account question ' + name + (fin ? ' after a Fin handoff' : '') + ' is answered, not replaced by the fixed line',
        group: 'account',
        critical: 'swallowed_account_question',
        async run() {
          const cid = id();
          const created = nowSec() - 86400;
          const parts = [];
          if (fin) {
            parts.push({
              id: 'fin-' + cid,
              part_type: 'comment',
              body: 'I am connecting you to a teammate.',
              created_at: created + 10,
              author: { type: 'admin', id: ELITE, name: 'Elite AI' },
            });
          }
          parts.push(userPart('u-' + cid, text, created + 20));
          const conv = makeConv({ id: cid, text, sourceBody: '', createdAt: created, parts });
          const snap = await deliver({ conv, script: okScript, model: MODEL.account });
          return problemsFor(snap, {
            commentIncludes: 'SYNTH_ACCOUNT_ANSWER',
            noFixed: true,
            awaiting: false,
            noPromise: true,
          });
        },
      });
    }
  }

  // --- credentials ---
  const credPhrases = [
    ['password-is', 'human please. password is CANARY77', [CANARY]],
    ['password-apostrophe', "human please. password's CANARY77", [CANARY]],
    ['password-curly', 'human please. password’s CANARY77', [CANARY]],
    ['pwd', 'human please. pwd: CANARY77', [CANARY]],
    ['otp', 'human please. otp is CANARY77', [CANARY]],
    ['token', 'human please token CANARY77', [CANARY]],
    ['sk', 'human please sk-CANARY77CANARY77', ['sk-CANARY77CANARY77']],
    ['arabic-label', 'اريد موظف كلمة المرور CANARY77', [CANARY]],
    ['urdu-label', 'انسان چاہیے پاس ورڈ CANARY77', [CANARY]],
    ['hindi-label', 'एजेंट चाहिए पासवर्ड CANARY77', [CANARY]],
  ];

  for (const [name, text, secrets] of credPhrases) {
    add({
      id: 'R3I-cred-welcome-' + name,
      title: 'welcome note and customer line redact ' + name,
      group: 'credentials',
      critical: 'credential_leak',
      async run() {
        const snap = await deliver({ conv: baseConv(id(), text), script: okScript });
        const base = successExpect(name.indexOf('arabic') === 0 ? 'ar' : name.indexOf('urdu') === 0 ? 'ur' : name.indexOf('hindi') === 0 ? 'hi' : 'en', 'FIXED_HANDOFF sent welcome');
        // Language expectation is checked by commentExact only when we know it.
        delete base.commentExact;
        base.commentCount = 1;
        base.noFixed = false;
        base.absent = secrets;
        base.noPromise = true;
        const problems = problemsFor(snap, base);
        const comments = bodies(snap.calls, 'comment');
        if (comments.length === 1 && Object.values(FIXED).indexOf(comments[0]) === -1) {
          problems.push('customer message was not a sealed fixed line: ' + show(comments[0]));
        }
        return problems;
      },
    });
  }

  add({
    id: 'R3I-cred-main-apostrophe',
    title: 'main escalate redacts an apostrophe password inside the note body',
    group: 'credentials',
    critical: 'credential_leak',
    async run() {
      const text = 'My payout was rejected and my dashboard shows a breach. Account 189143 email synth.user@example.net';
      const snap = await deliver({ conv: baseConv(id(), text), script: okScript, model: MODEL.escalateCanary });
      return problemsFor(snap, {
        kinds: ['note', 'assignment', 'comment'],
        commentExact: FIXED.en,
        awaiting: true,
        noPromise: true,
        absent: [CANARY],
        pathLog: 'FIXED_HANDOFF sent main_escalate',
      });
    },
  });

  add({
    id: 'R3I-cred-note-translation-prompt',
    title: 'Urdu handoff does not send the canary into the English note translation',
    group: 'credentials',
    critical: 'credential_leak',
    async run() {
      const text = 'انسان چاہیے پاس ورڈ CANARY77';
      const snap = await deliver({ conv: baseConv(id(), text), script: okScript });
      return problemsFor(snap, {
        commentExact: FIXED.ur,
        commentCount: 1,
        awaiting: true,
        noPromise: true,
        absent: [CANARY],
        pathLog: 'FIXED_HANDOFF sent welcome',
      });
    },
  });

  // --- duplicates, retries, replay, recovery ---
  add({
    id: 'R3I-replay-same-webhook',
    title: 'replaying the same webhook does not post a second customer message',
    group: 'replay',
    critical: 'duplicate_send',
    async run() {
      const cid = id();
      const conv = baseConv(cid, 'I want to talk to a human');
      ctx.calls.length = 0;
      ctx.openaiCalls.length = 0;
      ctx.logs.length = 0;
      await deliver({ conv, script: okScript, keepCalls: true });
      const created = conv.created_at;
      const replay = makeConv({
        id: cid,
        text: 'I want to talk to a human',
        sourceBody: '',
        createdAt: created,
        parts: [
          userPart('u-' + cid, 'I want to talk to a human', created + 100),
          {
            id: 'bot-' + cid,
            part_type: 'comment',
            body: FIXED.en,
            created_at: created + 110,
            author: { type: 'admin', id: ARSAL, name: 'Arsal' },
          },
        ],
      });
      await deliver({ conv: replay, script: okScript, keepCalls: true });
      const snap = {
        calls: ctx.calls.slice(),
        openaiCalls: ctx.openaiCalls.slice(),
        logs: ctx.logs.slice(),
        state: ctx.readTickets()[cid] || null,
      };
      return problemsFor(snap, { commentCount: 1, noPromise: true });
    },
  });

  add({
    id: 'R3I-replay-state-lost-opstore-kept',
    title: 'losing ticket state but keeping the write ledger does not send a second message',
    group: 'replay',
    critical: 'duplicate_send',
    async run() {
      const cid = id();
      const conv = baseConv(cid, 'I want to talk to a human');
      await deliver({ conv, script: okScript });
      const all = ctx.readTickets();
      delete all[cid];
      ctx.writeTickets(all);
      ctx.calls.length = 0;
      const snap = await deliver({ conv, script: okScript, keepCalls: true });
      return problemsFor(snap, { commentCount: 0, noPromise: true });
    },
  });

  add({
    id: 'R3I-retry-422-then-success',
    title: 'assignment 422 then a later recovery sends exactly one fixed message',
    group: 'replay',
    critical: 'duplicate_send',
    async run() {
      const cid = id();
      const created = nowSec() - 86400;
      const first = makeConv({
        id: cid,
        text: 'I want to talk to a human',
        sourceBody: '',
        createdAt: created,
        parts: [userPart('u1-' + cid, 'I want to talk to a human', created + 10)],
      });
      ctx.calls.length = 0;
      await deliver({ conv: first, script: { note: 'ok', assign: '422', comment: 'ok' }, keepCalls: true });
      const second = makeConv({
        id: cid,
        text: 'I want to talk to a human',
        sourceBody: '',
        createdAt: created,
        parts: [
          userPart('u1-' + cid, 'I want to talk to a human', created + 10),
          userPart('u2-' + cid, 'still waiting on a person', created + 40),
        ],
      });
      await deliver({ conv: second, script: okScript, keepCalls: true });
      const snap = {
        calls: ctx.calls.slice(),
        openaiCalls: ctx.openaiCalls.slice(),
        logs: ctx.logs.slice(),
        state: ctx.readTickets()[cid] || null,
      };
      const comments = bodies(snap.calls, 'comment');
      const problems = [];
      if (comments.length !== 1) problems.push('expected one customer message across 422 and recovery, saw ' + comments.length + ' :: ' + show(comments.join(' | ')));
      if (comments.length === 1 && comments[0] !== FIXED.en) problems.push('recovery message was not the fixed line: ' + show(comments[0]));
      for (const c of comments) if (PROMISE.test(c)) problems.push('promise in recovery message');
      if (!(snap.state && snap.state.escalateAwaitingFirstTeammate === true)) problems.push('awaiting not set after eventual success');
      return problems;
    },
  });

  add({
    id: 'R3I-recovery-after-500-holds',
    title: 'assignment 500 stays ambiguous and recovery does not send the message',
    group: 'replay',
    critical: 'premature_promise',
    async run() {
      const cid = id();
      const created = nowSec() - 86400;
      const first = makeConv({
        id: cid,
        text: 'I want to talk to a human',
        sourceBody: '',
        createdAt: created,
        parts: [userPart('u1-' + cid, 'I want to talk to a human', created + 10)],
      });
      ctx.calls.length = 0;
      await deliver({ conv: first, script: { note: 'ok', assign: '500', comment: 'ok' }, keepCalls: true });
      const second = makeConv({
        id: cid,
        text: 'hello again',
        sourceBody: '',
        createdAt: created,
        parts: [
          userPart('u1-' + cid, 'I want to talk to a human', created + 10),
          userPart('u2-' + cid, 'hello again', created + 40),
        ],
      });
      await deliver({ conv: second, script: okScript, model: MODEL.greeting, keepCalls: true });
      const snap = {
        calls: ctx.calls.slice(),
        openaiCalls: [],
        logs: ctx.logs.slice(),
        state: ctx.readTickets()[cid] || null,
      };
      return problemsFor(snap, { commentCount: 0, awaiting: false, noPromise: true });
    },
  });

  add({
    id: 'R3I-recovery-swallows-account-question',
    title: 'an account-number question during an unfinished handoff is still answered',
    group: 'recovery',
    critical: 'swallowed_account_question',
    async run() {
      const cid = id();
      const created = nowSec() - 86400;
      const first = makeConv({
        id: cid,
        text: 'I want to talk to a human',
        sourceBody: '',
        createdAt: created,
        parts: [userPart('u1-' + cid, 'I want to talk to a human', created + 10)],
      });
      await deliver({ conv: first, script: { note: 'ok', assign: '422', comment: 'ok' } });
      const second = makeConv({
        id: cid,
        text: 'What is my account number?',
        sourceBody: '',
        createdAt: created,
        parts: [
          userPart('u1-' + cid, 'I want to talk to a human', created + 10),
          userPart('u2-' + cid, 'What is my account number?', created + 50),
        ],
      });
      const snap = await deliver({ conv: second, script: okScript, model: MODEL.account });
      return problemsFor(snap, {
        commentIncludes: 'SYNTH_ACCOUNT_ANSWER',
        noFixed: true,
        noPromise: true,
      });
    },
  });

  add({
    id: 'R3I-recovery-500-swallows-account-question',
    title: 'an account-number question after an ambiguous assignment failure is still answered',
    group: 'recovery',
    critical: 'swallowed_account_question',
    async run() {
      const cid = id();
      const created = nowSec() - 86400;
      await deliver({
        conv: makeConv({
          id: cid,
          text: 'I want to talk to a human',
          sourceBody: '',
          createdAt: created,
          parts: [userPart('u1-' + cid, 'I want to talk to a human', created + 10)],
        }),
        script: { note: 'ok', assign: '500', comment: 'ok' },
      });
      const snap = await deliver({
        conv: makeConv({
          id: cid,
          text: 'What is my account number?',
          sourceBody: '',
          createdAt: created,
          parts: [
            userPart('u1-' + cid, 'I want to talk to a human', created + 10),
            userPart('u2-' + cid, 'What is my account number?', created + 50),
          ],
        }),
        script: okScript,
        model: MODEL.account,
      });
      return problemsFor(snap, { commentIncludes: 'SYNTH_ACCOUNT_ANSWER', noFixed: true, commentCount: 1 });
    },
  });

  add({
    id: 'R3I-second-handoff-phrase',
    title: 'a later different handoff ask does not send a second fixed message',
    group: 'replay',
    critical: 'duplicate_send',
    async run() {
      const cid = id();
      const created = nowSec() - 86400;
      ctx.calls.length = 0;
      await deliver({
        conv: makeConv({
          id: cid,
          text: 'I want to talk to a human',
          sourceBody: '',
          createdAt: created,
          parts: [userPart('u1-' + cid, 'I want to talk to a human', created + 10)],
        }),
        script: okScript,
        keepCalls: true,
      });
      await deliver({
        conv: makeConv({
          id: cid,
          text: 'supervisor please',
          sourceBody: '',
          createdAt: created,
          assignee: TEAMMATE,
          parts: [
            userPart('u1-' + cid, 'I want to talk to a human', created + 10),
            {
              id: 'bot-' + cid,
              part_type: 'comment',
              body: FIXED.en,
              created_at: created + 20,
              author: { type: 'admin', id: ARSAL, name: 'Arsal' },
            },
            userPart('u2-' + cid, 'supervisor please', created + 40),
          ],
        }),
        script: okScript,
        model: MODEL.faq,
        keepCalls: true,
      });
      const comments = bodies(ctx.calls, 'comment');
      const problems = [];
      if (comments.length !== 1) problems.push('duplicate customer send, count ' + comments.length + ' :: ' + show(comments.join(' | ')));
      for (const c of comments) if (PROMISE.test(c)) problems.push('promise on second turn: ' + show(c));
      return problems;
    },
  });

  add({
    id: 'R3I-status-ping-no-promise',
    title: 'a status ping after a successful handoff does not invent a review or a time',
    group: 'followup',
    critical: 'premature_promise',
    async run() {
      const cid = id();
      const created = nowSec() - 86400;
      await deliver({
        conv: makeConv({
          id: cid,
          text: 'I want to talk to a human',
          sourceBody: '',
          createdAt: created,
          parts: [userPart('u1-' + cid, 'I want to talk to a human', created + 10)],
        }),
        script: okScript,
      });
      ctx.calls.length = 0;
      const snap = await deliver({
        conv: makeConv({
          id: cid,
          text: 'any update?',
          sourceBody: '',
          createdAt: created,
          assignee: TEAMMATE,
          parts: [
            userPart('u1-' + cid, 'I want to talk to a human', created + 10),
            {
              id: 'bot-' + cid,
              part_type: 'comment',
              body: FIXED.en,
              created_at: created + 20,
              author: { type: 'admin', id: ARSAL, name: 'Arsal' },
            },
            userPart('u2-' + cid, 'any update?', created + 40),
          ],
        }),
        script: okScript,
        model: MODEL.greeting,
        keepCalls: true,
      });
      return problemsFor(snap, { noPromise: true, noFixed: false });
    },
  });

  add({
    id: 'R3I-parallel-inflight',
    title: 'two overlapping deliveries of the same conversation post one customer message',
    group: 'replay',
    critical: 'duplicate_send',
    async run() {
      const cid = id();
      const conv = baseConv(cid, 'I want to talk to a human');
      ctx.calls.length = 0;
      ctx.current.script = okScript;
      ctx.current.model = null;
      ctx.fixtures.set(cid, conv);
      const req = { body: { topic: 'conversation.user.replied', data: { item: { id: cid, type: 'conversation' } } } };
      const resA = { statusCode: 0, sendStatus(c) { this.statusCode = c; return this; } };
      const resB = { statusCode: 0, sendStatus(c) { this.statusCode = c; return this; } };
      await Promise.all([ctx.handler.handleWebhook(req, resA), ctx.handler.handleWebhook(req, resB)]);
      const comments = bodies(ctx.calls, 'comment');
      const problems = [];
      if (comments.length !== 1) problems.push('parallel duplicate, count ' + comments.length);
      if (comments[0] && comments[0] !== FIXED.en) problems.push('parallel message ' + show(comments[0]));
      return problems;
    },
  });

  add({
    id: 'R3I-message-ambiguous-no-retry',
    title: 'an ambiguous customer-message result is not retried on recovery',
    group: 'replay',
    critical: 'duplicate_send',
    async run() {
      const cid = id();
      const created = nowSec() - 86400;
      ctx.calls.length = 0;
      await deliver({
        conv: makeConv({
          id: cid,
          text: 'I want to talk to a human',
          sourceBody: '',
          createdAt: created,
          parts: [userPart('u1-' + cid, 'I want to talk to a human', created + 10)],
        }),
        script: { note: 'ok', assign: 'ok', comment: 'timeout' },
        keepCalls: true,
      });
      await deliver({
        conv: makeConv({
          id: cid,
          text: 'hello again',
          sourceBody: '',
          createdAt: created,
          parts: [
            userPart('u1-' + cid, 'I want to talk to a human', created + 10),
            userPart('u2-' + cid, 'hello again', created + 40),
          ],
        }),
        script: okScript,
        keepCalls: true,
      });
      const comments = writesOf(ctx.calls).filter((c) => c.data && c.data.message_type === 'comment');
      const problems = [];
      if (comments.length !== 1) problems.push('message retry count ' + comments.length);
      if (ctx.readTickets()[cid] && ctx.readTickets()[cid].escalateAwaitingFirstTeammate === true) {
        problems.push('awaiting set after an ambiguous message');
      }
      return problems;
    },
  });

  // --- regressions ---
  add({
    id: 'R3I-faq-consistency',
    title: 'an ordinary consistency-rule question is answered and not handed off',
    group: 'regression',
    async run() {
      const snap = await deliver({
        conv: baseConv(id(), 'What is the consistency rule?'),
        script: okScript,
        model: MODEL.faq,
      });
      return problemsFor(snap, {
        commentIncludes: 'SYNTH_FAQ_CONSISTENCY',
        noFixed: true,
        awaiting: false,
        noPromise: true,
        kindsPrefix: ['comment'],
      });
    },
  });

  add({
    id: 'R3I-faq-leverage',
    title: 'an ordinary leverage question is answered and not handed off',
    group: 'regression',
    async run() {
      const snap = await deliver({
        conv: baseConv(id(), 'What leverage is available on the challenge?'),
        script: okScript,
        model: 'ACTION: REPLY\nBODY: SYNTH_FAQ_LEVERAGE Leverage depends on the challenge type in this synthetic answer.',
      });
      return problemsFor(snap, {
        commentIncludes: 'SYNTH_FAQ_LEVERAGE',
        noFixed: true,
        awaiting: false,
        kinds: ['comment'],
      });
    },
  });

  add({
    id: 'R3I-faq-after-handoff',
    title: 'an unrelated FAQ after a completed handoff is still answered',
    group: 'regression',
    async run() {
      const cid = id();
      const created = nowSec() - 86400;
      await deliver({
        conv: makeConv({
          id: cid,
          text: 'I want to talk to a human',
          sourceBody: '',
          createdAt: created,
          parts: [userPart('u1-' + cid, 'I want to talk to a human', created + 10)],
        }),
        script: okScript,
      });
      const snap = await deliver({
        conv: makeConv({
          id: cid,
          text: 'What is the consistency rule?',
          sourceBody: '',
          createdAt: created,
          parts: [
            userPart('u1-' + cid, 'I want to talk to a human', created + 10),
            {
              id: 'bot-' + cid,
              part_type: 'comment',
              body: FIXED.en,
              created_at: created + 20,
              author: { type: 'admin', id: ARSAL, name: 'Arsal' },
            },
            userPart('u2-' + cid, 'What is the consistency rule?', created + 40),
          ],
        }),
        script: okScript,
        model: MODEL.faq,
      });
      return problemsFor(snap, { commentIncludes: 'SYNTH_FAQ_CONSISTENCY', noPromise: true });
    },
  });

  add({
    id: 'R3I-spread',
    title: 'MT5 spread-test ask returns the spread reply and does not hand off',
    group: 'regression',
    async run() {
      const snap = await deliver({
        conv: baseConv(id(), 'Can I get the MT5 spread test account?'),
        script: okScript,
        model: MODEL.escalate,
      });
      const problems = problemsFor(snap, {
        kinds: ['comment'],
        commentCount: 1,
        noFixed: true,
        awaiting: false,
        commentIncludes: 'TEST SPREAD ACCOUNT DETAILS',
      });
      const body = bodies(snap.calls, 'comment').join('\n');
      if (body.indexOf('MetaTrader 5') === -1) problems.push('spread reply lost the MetaTrader 5 line');
      if (body.indexOf('Fundedelite-Server') === -1) problems.push('spread reply lost the server line');
      if (snap.logs.join('\n').indexOf('SPREAD_TEST_REPLY') === -1) problems.push('spread path was not taken');
      return problems;
    },
  });

  add({
    id: 'R3I-spread-not-swallowed-by-fin',
    title: 'a spread-test ask after a Fin handoff line is still the spread reply',
    group: 'regression',
    async run() {
      const cid = id();
      const created = nowSec() - 86400;
      const text = 'Can I get the MT5 spread test account?';
      const conv = makeConv({
        id: cid,
        text,
        sourceBody: '',
        createdAt: created,
        parts: [
          {
            id: 'fin-' + cid,
            part_type: 'comment',
            body: 'I am connecting you to a teammate.',
            created_at: created + 10,
            author: { type: 'admin', id: ELITE, name: 'Elite AI' },
          },
          userPart('u-' + cid, text, created + 20),
        ],
      });
      const snap = await deliver({ conv, script: okScript, model: MODEL.escalate });
      return problemsFor(snap, {
        kinds: ['comment'],
        commentIncludes: 'TEST SPREAD ACCOUNT DETAILS',
        noFixed: true,
        awaiting: false,
      });
    },
  });

  add({
    id: 'R3I-greeting',
    title: 'a plain greeting is not a handoff',
    group: 'regression',
    async run() {
      const snap = await deliver({
        conv: baseConv(id(), 'Hello'),
        script: okScript,
        model: MODEL.greeting,
      });
      return problemsFor(snap, {
        commentIncludes: 'SYNTH_GREETING',
        noFixed: true,
        awaiting: false,
        kinds: ['comment'],
      });
    },
  });

  add({
    id: 'R3I-substantive-payout-not-welcome',
    title: 'a substantive payout complaint without a human ask is not a welcome handoff when the model answers',
    group: 'regression',
    async run() {
      const snap = await deliver({
        conv: baseConv(id(), 'My payout was rejected and my dashboard shows a breach. Account 189143 email synth.user@example.net'),
        script: okScript,
        model: 'ACTION: REPLY\nBODY: SYNTH_PAYOUT_ANSWER I can explain the payout rejection process in general terms.',
      });
      return problemsFor(snap, { commentIncludes: 'SYNTH_PAYOUT_ANSWER', noFixed: true, awaiting: false });
    },
  });

  add({
    id: 'R3I-fixed-lines-have-no-promise',
    title: 'sealed fixed lines do not promise a review, a time, or possession of details',
    group: 'copy',
    async run() {
      const problems = [];
      for (const [lang, line] of Object.entries(FIXED)) {
        if (PROMISE.test(line)) problems.push(lang + ' fixed line contains a promise');
        if (!line || line.length < 10) problems.push(lang + ' fixed line empty');
      }
      return problems;
    },
  });

  add({
    id: 'R3I-user-created-does-not-race',
    title: 'conversation.user.created does not send the fixed handoff',
    group: 'regression',
    async run() {
      const snap = await deliver({
        conv: baseConv(id(), 'I want to talk to a human'),
        topic: 'conversation.user.created',
        script: okScript,
      });
      return problemsFor(snap, { commentCount: 0, kinds: [], noFixed: true, awaiting: false });
    },
  });

  add({
    id: 'R3I-partial-errors-only',
    title: 'assignment 200 with an errors array is partial and withholds the message',
    group: 'assign-failure',
    async run() {
      const snap = await deliver({
        conv: baseConv(id(), 'supervisor please'),
        script: { note: 'ok', assign: 'partial', comment: 'ok' },
      });
      return problemsFor(snap, { kinds: ['note', 'assignment'], commentCount: 0, awaiting: false, assignAmbiguous: true });
    },
  });

  // Extra adversarial ownership edges that are not language-matrix copies.
  const edges = [
    ['mismatch-ids', (cid) => baseConv(cid, 'I want to talk to a human', {
      assignee: ARSAL,
      assigneeObj: { type: 'admin', id: '555009', name: 'Other' },
    })],
    ['blank-admin-type', (cid) => baseConv(cid, 'اريد موظف', {
      assignee: '0',
      assigneeObj: { type: '', name: 'Unknown seat' },
    })],
    ['risk-word-in-team', (cid) => baseConv(cid, 'mujhe agent please', { teamName: 'Tier Risk Review' })],
    ['escalation-singular', (cid) => baseConv(cid, 'एजेंट चाहिए', { teamAssigneeName: 'Escalation' })],
  ];
  for (const [name, build] of edges) {
    add({
      id: 'R3I-edge-' + name,
      title: 'ownership edge ' + name + ' stays silent',
      group: 'ownership',
      critical: 'ownership_breach',
      async run() {
        const snap = await deliver({ conv: build(id()), script: okScript, model: MODEL.faq });
        return problemsFor(snap, { commentCount: 0, noFixed: true, awaiting: false });
      },
    });
  }

  if (cases.length < 100) {
    console.error('SEALED_CASE_COUNT', cases.length);
    process.exit(2);
  }

  const seal = sha256(Buffer.from(cases.map((c) => c.id + '\n' + c.title).join('\n')));
  const results = [];
  let failed = 0;
  for (const entry of cases) {
    let problems = [];
    let thrown = null;
    try {
      problems = await entry.run();
    } catch (err) {
      thrown = err && err.stack ? err.stack : String(err);
      problems = ['threw ' + (err && err.message)];
    }
    const ok = problems.length === 0;
    if (!ok) failed += 1;
    results.push({
      id: entry.id,
      title: entry.title,
      group: entry.group,
      critical: entry.critical || null,
      ok,
      problems,
      thrown,
      logs: ok ? undefined : (ctx.logs || []).filter((line) => /FIN_HANDOFF|FIXED_HANDOFF|PRESEND|AI_ACTION|MISSED|account-number|STRIP|SKIP /.test(line)).slice(0, 24),
    });
    console.error((ok ? 'PASS ' : 'FAIL ') + entry.id + (ok ? '' : ' ' + problems[0]));
  }

  const byGroup = {};
  for (const r of results) {
    byGroup[r.group] = byGroup[r.group] || { pass: 0, fail: 0 };
    byGroup[r.group][r.ok ? 'pass' : 'fail'] += 1;
  }
  const criticalFails = results.filter((r) => !r.ok && r.critical);
  const summary = {
    pin: PIN,
    hashes,
    seal,
    caseCount: cases.length,
    passed: results.length - failed,
    failed,
    byGroup,
    criticalFails: criticalFails.map((r) => ({ id: r.id, critical: r.critical, title: r.title, problems: r.problems })),
    failures: results.filter((r) => !r.ok).map((r) => ({ id: r.id, title: r.title, critical: r.critical, problems: r.problems })),
  };
  const outFile = path.join(__dirname, 'adversarial-results.json');
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    seal,
    caseCount: cases.length,
    passed: summary.passed,
    failed,
    critical: criticalFails.length,
    outFile,
  }));
  ctx.restore();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(2);
});
