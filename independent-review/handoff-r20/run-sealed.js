'use strict';

/**
 * Independent runner. Loads a runtime tree, calls the real handleWebhook,
 * records exact transport payloads, stubs the model, and trips on real sockets.
 * Case expectations are read from the sealed JSON and are not rewritten here.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const { spawnSync } = require('child_process');

const ARSAL = '10118526';
const CASEY = '424242';
const HUMAN = '777001';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}
function has(name) {
  return process.argv.includes(name);
}

const RUNTIME_ROOT = path.resolve(arg('--runtime', ''));
const CASES_PATH = path.resolve(arg('--cases', path.join(__dirname, 'sealed', 'cases.json')));
const OUT_PATH = arg('--out', '');
const FILTER = arg('--filter', '');
const LIMIT = Number(arg('--limit', '0')) || 0;
const CHILD = has('--child');

if (!RUNTIME_ROOT) {
  console.error('missing --runtime');
  process.exit(2);
}

const RUNTIME = path.join(RUNTIME_ROOT, 'luna-current', '01_runtime');
const PRESEND = path.join(RUNTIME_ROOT, 'luna-current', '02_statePresend');

function boot(stateDir) {
  fs.mkdirSync(stateDir, { recursive: true });
  const pid = process.pid + '-' + Math.random().toString(16).slice(2);
  const axiosMock = path.join(stateDir, 'axios-' + pid + '.js');
  const openaiMock = path.join(stateDir, 'openai-' + pid + '.js');
  const expressMock = path.join(stateDir, 'express-' + pid + '.js');
  const dotenvMock = path.join(stateDir, 'dotenv-' + pid + '.js');
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
    'express.urlencoded = function () { return function (_req, _res, next) { if (next) next(); }; };',
    'module.exports = express;',
    '',
  ].join('\n'));
  fs.writeFileSync(dotenvMock, 'module.exports = { config: function () { return { parsed: {} }; } };\n');

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

  const tripHits = [];
  function boom(name) {
    return function tripwireBlocked() {
      tripHits.push(name);
      const err = new Error('network tripwire ' + name);
      err.code = 'TRIPWIRE';
      throw err;
    };
  }
  const http = require('http');
  const https = require('https');
  const net = require('net');
  const dns = require('dns');
  http.request = boom('http.request');
  http.get = boom('http.get');
  https.request = boom('https.request');
  https.get = boom('https.get');
  net.connect = boom('net.connect');
  net.Socket.prototype.connect = boom('socket.connect');
  dns.lookup = boom('dns.lookup');
  if (dns.promises) dns.promises.lookup = async function () { boom('dns.promises.lookup')(); };
  global.fetch = boom('fetch');

  const controlFile = path.join(stateDir, 'control.json');
  if (!fs.existsSync(controlFile)) {
    fs.writeFileSync(controlFile, JSON.stringify({
      paused: false,
      pausedUntil: null,
      aiOff: {},
      testMode: false,
      testAllowNames: ['Bot test'],
      testAllowConversationIds: [],
      config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
    }));
  }
  process.env.LUNA_CONTROL_STATE_FILE = controlFile;
  process.env.LUNA_OP_STORE_FILE = path.join(stateDir, 'ops.json');
  process.env.TICKET_STATE_FILE = path.join(stateDir, 'tickets.json');
  process.env.MENTION_ROTATE_FILE = path.join(stateDir, 'mentions.json');
  process.env.IMAGE_GUARD_STATE_FILE = path.join(stateDir, 'image.json');
  process.env.LUNA_PROMPT_FILE = path.join(RUNTIME, 'system-prompt.txt');
  process.env.FUNDEDELITE_FAQ_PATH = path.join(RUNTIME, 'fundedelite-faqs.md');
  process.env.OPENAI_API_KEY = 'sealed-review-not-a-secret';
  process.env.INTERCOM_ACCESS_TOKEN = 'sealed-review-not-a-secret';
  process.env.MAINTAINER_ENABLED = 'false';
  process.env.LUNA_TOOLS_ENABLED = '0';

  const calls = [];
  const prompts = [];
  const hosts = [];
  let current = null;
  let liveAssignee = '';
  let failComment = '';
  global.__lunaReply = 'ACTION: REPLY\nOK';
  global.__lunaModel = function (req) {
    const messages = (req && req.messages) || [];
    const sys = String((messages.find((m) => m.role === 'system') || {}).content || '');
    const user = String((messages.find((m) => m.role === 'user') || {}).content || '');
    prompts.push(user);
    if (/INTERNAL Intercom note/i.test(sys)) {
      return Promise.resolve({ choices: [{ message: { content: user.replace(/^\[[^\]]+\]\n/, '') } }] });
    }
    return Promise.resolve({ choices: [{ message: { content: global.__lunaReply } }] });
  };
  global.__lunaAxios = function (cfg) {
    const method = String((cfg && cfg.method) || 'get').toLowerCase();
    const url = String((cfg && cfg.url) || '');
    const data = cfg && cfg.data;
    let host = '';
    try { host = new URL(url).host; } catch (_) { host = ''; }
    if (host) hosts.push(host);
    if (url.includes('/admins')) {
      calls.push({ method, url, data, status: 200 });
      return Promise.resolve({
        status: 200,
        data: {
          admins: [{
            id: CASEY,
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
      const copy = JSON.parse(JSON.stringify(current || { id: 'missing' }));
      if (liveAssignee) copy.admin_assignee_id = liveAssignee;
      calls.push({ method, url, data, status: 200 });
      return Promise.resolve({ status: 200, data: copy });
    }
    if (data && data.message_type === 'comment' && failComment) {
      if (failComment === 'timeout') {
        calls.push({ method, url, data, status: 0, error: 'timeout' });
        return Promise.reject(new Error('timeout'));
      }
      const status = Number(failComment);
      calls.push({ method, url, data, status });
      return Promise.resolve({ status, data: { type: 'error.list', errors: [{ code: 'parameter_invalid', status }] } });
    }
    if (data && data.message_type === 'assignment') {
      liveAssignee = String(data.assignee_id || '');
      if (current) current.admin_assignee_id = liveAssignee;
      calls.push({ method, url, data, status: 200 });
      return Promise.resolve({ status: 200, data: { id: 'asg', type: 'conversation', admin_assignee_id: liveAssignee } });
    }
    calls.push({ method, url, data, status: 200 });
    return Promise.resolve({ status: 200, data: { id: 'w1', type: 'conversation' } });
  };

  const logPath = path.join(stateDir, 'runtime.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const realError = console.error.bind(console);
  console.log = (...a) => { logStream.write(a.map(String).join(' ') + '\n'); };
  console.error = (...a) => {
    const line = a.map(String).join(' ');
    logStream.write('[err] ' + line + '\n');
    if (CHILD) realError(line);
  };

  const index = require(path.join(RUNTIME, 'index'));
  const faq = require(path.join(RUNTIME, 'faq-kb'));
  const realRetrieve = faq.retrieveOfficialFaqContext.bind(faq);
  return {
    index,
    faq,
    realRetrieve,
    calls,
    prompts,
    hosts,
    tripHits,
    logPath,
    realError,
    setCurrent(v) { current = v; },
    setLive(v) { liveAssignee = v || ''; },
    getLive() { return liveAssignee; },
    setFail(v) { failComment = v || ''; },
  };
}

function conv(id, text, opts) {
  const o = opts || {};
  const now = Math.floor(Date.now() / 1000);
  const name = 'Sam';
  const parts = [];
  if (o.priorBot) {
    parts.push({
      id: id + '-bot',
      part_type: 'comment',
      body: 'Hello, how can I help?',
      created_at: now - 400,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    });
  }
  for (const extra of o.extraParts || []) parts.push(extra);
  parts.push({
    id: id + '-user-' + (o.step || 0) + '-' + now,
    part_type: 'comment',
    body: text,
    created_at: now - 5,
    author: { type: 'user', id: 'user-1', name },
  });
  if (o.human) {
    parts.push({
      id: id + '-human',
      part_type: 'comment',
      body: 'I am looking at this now.',
      created_at: now - 2,
      author: { type: 'admin', id: HUMAN, name: 'Riley Human' },
    });
  }
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

function ofType(calls, type, okOnly) {
  return calls.filter((c) => {
    if (!c.data || c.data.message_type !== type) return false;
    if (!okOnly) return true;
    return c.status >= 200 && c.status < 300;
  });
}

async function oneTurn(rt, spec) {
  const start = rt.calls.length;
  const promptStart = rt.prompts.length;
  rt.setFail(spec.fail || '');
  if (spec.assignee) rt.setLive(spec.assignee);
  else if (!spec.keepAssignee) rt.setLive('');
  global.__lunaReply = spec.model || 'ACTION: REPLY\nOK';
  if (spec.figureEvidence) {
    rt.faq.retrieveOfficialFaqContext = async function () {
      return { ok: true, block: spec.figureEvidence, from: 'faq-kb' };
    };
  } else {
    rt.faq.retrieveOfficialFaqContext = rt.realRetrieve;
  }
  rt.setCurrent(conv(spec.id, spec.text, spec));
  const res = { status: 0, sendStatus(code) { this.status = code; return this; } };
  await rt.index.handleWebhook({ body: { topic: spec.topic || 'conversation.user.replied', data: { item: rt.calls && spec && null } } }, res).catch((err) => {
    throw err;
  });
  // The item must be the conversation. Re-call is wrong. Fixed below if this path is used.
  void res;
  const stepCalls = rt.calls.slice(start);
  return {
    status: res.status,
    calls: stepCalls,
    prompts: rt.prompts.slice(promptStart),
  };
}

async function turn(rt, spec) {
  const start = rt.calls.length;
  const promptStart = rt.prompts.length;
  const tripStart = rt.tripHits.length;
  rt.setFail(spec.fail || '');
  if (spec.keepAssignee) {
    /* leave the seat set by the previous assignment */
  } else if (spec.assignee) rt.setLive(spec.assignee);
  else rt.setLive('');
  global.__lunaReply = spec.model || 'ACTION: REPLY\nOK';
  if (spec.figureEvidence) {
    rt.faq.retrieveOfficialFaqContext = async function () {
      return { ok: true, block: spec.figureEvidence, from: 'faq-kb' };
    };
  } else {
    rt.faq.retrieveOfficialFaqContext = rt.realRetrieve;
  }
  const full = conv(spec.id, spec.text, spec);
  if (spec.assignee) full.admin_assignee_id = spec.assignee;
  rt.setCurrent(full);
  const res = { status: 0, sendStatus(code) { this.status = code; return this; } };
  let error = '';
  try {
    await rt.index.handleWebhook({ body: { topic: spec.topic || 'conversation.user.replied', data: { item: full } } }, res);
  } catch (err) {
    error = String(err && err.stack || err);
  } finally {
    rt.setFail('');
    rt.faq.retrieveOfficialFaqContext = rt.realRetrieve;
  }
  return {
    status: res.status,
    error,
    calls: rt.calls.slice(start),
    prompts: rt.prompts.slice(promptStart),
    trip: rt.tripHits.slice(tripStart),
  };
}

function bodies(calls, type, okOnly) {
  return ofType(calls, type, okOnly).map((c) => String((c.data && c.data.body) || ''));
}

function includesAll(hay, needles) {
  const missing = [];
  for (const n of needles || []) if (!hay.includes(n)) missing.push(n);
  return missing;
}
function excludesAll(hay, needles) {
  const present = [];
  for (const n of needles || []) if (n && hay.includes(n)) present.push(n);
  return present;
}

function evaluate(cse, steps) {
  const fails = [];
  const tags = [];
  const allCalls = steps.flatMap((s) => s.calls);
  const allPrompts = steps.flatMap((s) => s.prompts);
  const last = steps[steps.length - 1] || { calls: [], prompts: [] };
  const expect = cse.expect || {};
  const comments = bodies(allCalls, 'comment', true);
  const notes = bodies(allCalls, 'note', true);
  const assigns = ofType(allCalls, 'assignment', true);
  const lastComments = bodies(last.calls, 'comment', true);
  const lastNotes = bodies(last.calls, 'note', true);
  const lastAssigns = ofType(last.calls, 'assignment', true);
  const firstAttempts = ofType((steps[0] && steps[0].calls) || [], 'comment', false);
  const outbound = JSON.stringify(allCalls.map((call) => ({ url: call.url, data: call.data, status: call.status })));
  const promptBlob = allPrompts.join('\n');
  const lastBlob = lastComments.join('\n');
  const err = steps.map((s) => s.error).filter(Boolean).join('\n');
  if (err) fails.push('threw: ' + err.split('\n')[0]);
  if (steps.some((s) => s.trip && s.trip.length)) fails.push('tripwire ' + steps.flatMap((s) => s.trip || []).join(','));

  function eq(name, got, want) {
    if (want == null) return;
    if (got !== want) fails.push(name + ' got ' + got + ' want ' + want);
  }
  eq('successComments', comments.length, expect.successComments);
  eq('successNotes', notes.length, expect.successNotes);
  eq('successAssigns', assigns.length, expect.successAssigns);
  eq('lastComments', lastComments.length, expect.lastComments);
  eq('lastNotes', lastNotes.length, expect.lastNotes);
  eq('lastAssigns', lastAssigns.length, expect.lastAssigns);
  if (expect.successCommentsMax != null && comments.length > expect.successCommentsMax) {
    fails.push('successComments ' + comments.length + ' over max ' + expect.successCommentsMax);
  }
  if (expect.successCommentsMin != null && comments.length < expect.successCommentsMin) {
    fails.push('successComments ' + comments.length + ' under min ' + expect.successCommentsMin);
  }
  if (expect.successAssignsMax != null && assigns.length > expect.successAssignsMax) {
    fails.push('successAssigns ' + assigns.length + ' over max ' + expect.successAssignsMax);
  }
  const wanted = expect.lastCommentEquals || expect.commentEquals;
  if (wanted != null) {
    const got = (expect.lastCommentEquals ? lastComments[0] : (lastComments[0] || comments[0])) || '';
    if (got !== wanted) fails.push('comment body mismatch');
  }
  const inc = includesAll(lastBlob || comments.join('\n'), expect.commentIncludes);
  if (inc.length) fails.push('missing ' + inc.join(' | '));
  const exc = excludesAll(lastBlob || comments.join('\n'), expect.commentExcludes);
  if (exc.length) fails.push('forbidden ' + exc.join(' | '));
  if (expect.zwsp && !(lastBlob || comments.join('\n')).includes('\u200b')) fails.push('missing U+200B');
  if (expect.bodySha256) {
    const got = crypto.createHash('sha256').update(lastComments[0] || '', 'utf8').digest('hex');
    if (got !== expect.bodySha256) fails.push('faq sha ' + got);
  }
  if (expect.commentAttemptMax != null && firstAttempts.length > expect.commentAttemptMax) {
    fails.push('comment attempts ' + firstAttempts.length + ' over ' + expect.commentAttemptMax);
  }
  const secretHits = [];
  for (const secret of expect.secrets || cse.secrets || []) {
    if (!secret) continue;
    if (outbound.includes(secret)) secretHits.push('outbound:' + secret);
    if (promptBlob.includes(secret)) secretHits.push('prompt:' + secret);
  }
  if (secretHits.length) fails.push('leak ' + secretHits.join(','));
  const promptMissing = includesAll(promptBlob, expect.promptMustInclude);
  if (promptMissing.length) fails.push('prompt missing ' + promptMissing.join(' | '));
  const promptBad = excludesAll(promptBlob, expect.promptMustExclude || []);
  if (promptBad.length) fails.push('prompt has ' + promptBad.join(' | '));

  const secretLeak = secretHits.length > 0 || (promptBad.length > 0 && (expect.secrets || []).some((s) => promptBad.includes(s)));
  const tooManyComments = (expect.successComments != null && comments.length > expect.successComments)
    || (expect.successCommentsMax != null && comments.length > expect.successCommentsMax)
    || (expect.lastComments != null && lastComments.length > expect.lastComments);
  const tooManyAssigns = (expect.successAssigns != null && assigns.length > expect.successAssigns)
    || (expect.successAssignsMax != null && assigns.length > expect.successAssignsMax)
    || (expect.lastAssigns != null && lastAssigns.length > expect.lastAssigns);
  if (secretLeak || secretHits.length) tags.push('leak');
  if (tooManyComments || tooManyAssigns) tags.push('duplicate');
  if (fails.length && cse.class === 'recovery') tags.push('recovery');
  if (fails.length && cse.class !== 'recovery') tags.push('product-critical');
  return {
    pass: fails.length === 0,
    fails,
    tags,
    comments: comments.slice(0, 3).map((b) => b.slice(0, 240)),
    lastComments: lastComments.slice(0, 2).map((b) => b.slice(0, 240)),
    notes: notes.length,
    assigns: assigns.length,
    attempts: firstAttempts.length,
    prompt: promptBlob.slice(0, 240),
  };
}

function stepsFor(cse) {
  if (cse.kind === 'single') {
    return [{
      id: cse.id,
      text: cse.text,
      topic: cse.topic,
      createdAgo: cse.createdAgo,
      priorBot: cse.priorBot,
      model: cse.model,
      figureEvidence: cse.figureEvidence,
    }];
  }
  if (cse.kind === 'sequence') {
    return cse.steps.map((step, i) => Object.assign({ id: cse.id, step: i }, step));
  }
  return null;
}

function recoverySpecs(cse) {
  const first = {
    id: cse.id,
    text: cse.text,
    topic: cse.topic || 'conversation.user.created',
    createdAgo: cse.createdAgo == null ? 5 : cse.createdAgo,
    priorBot: !!cse.priorBot,
    model: 'ACTION: REPLY\nI can help with that.',
    fail: cse.fail || '',
    keepAssignee: false,
  };
  if (cse.kind === 'wiped-store') {
    const now = Math.floor(Date.now() / 1000);
    return [{
      id: cse.id,
      text: cse.followup || 'hello again',
      topic: 'conversation.user.replied',
      createdAgo: 1000,
      assignee: CASEY,
      sourceBody: cse.text,
      model: 'ACTION: REPLY\nI can help with that.',
      extraParts: [
        {
          id: cse.id + '-req',
          part_type: 'comment',
          body: cse.text,
          created_at: now - 80,
          author: { type: 'user', id: 'user-1', name: 'Sam' },
        },
        {
          id: cse.id + '-asg',
          part_type: 'assignment',
          created_at: now - 20,
          author: { type: 'admin', id: ARSAL, name: 'Arsal' },
          assigned_to: { type: 'admin', id: CASEY },
          body: '',
        },
      ],
    }];
  }
  const second = {
    id: cse.id,
    text: cse.followup || 'just checking in',
    topic: 'conversation.user.replied',
    createdAgo: 1000,
    keepAssignee: true,
    model: 'ACTION: REPLY\nI can help with that.',
    human: cse.kind === 'human',
  };
  if (cse.kind === 'restart') {
    second.keepAssignee = false;
    second.assignee = CASEY;
  }
  if (cse.kind === 'duplicate') {
    const now = Math.floor(Date.now() / 1000);
    second.extraParts = [
      {
        id: cse.id + '-req',
        part_type: 'comment',
        body: cse.text,
        created_at: now - 90,
        author: { type: 'user', id: 'user-1', name: 'Sam' },
      },
      {
        id: cse.id + '-note',
        part_type: 'note',
        body: '<!-- LUNA_HANDOFF_NOTE --><b>Account:</b> Not provided<br><b>Problem:</b><br>human ask',
        created_at: now - 40,
        author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      },
      {
        id: cse.id + '-asg',
        part_type: 'assignment',
        created_at: now - 30,
        author: { type: 'admin', id: ARSAL, name: 'Arsal' },
        assigned_to: { type: 'admin', id: CASEY },
        body: '',
      },
      {
        id: cse.id + '-line',
        part_type: 'comment',
        body: cse.expect.line,
        created_at: now - 20,
        author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      },
    ];
    second.assignee = CASEY;
    second.keepAssignee = true;
  }
  return [first, second];
}

async function main() {
  const stateDir = arg('--state', path.join(os.tmpdir(), 'luna-sealed-' + process.pid));
  const rt = boot(stateDir);
  if (CHILD) {
    const spec = JSON.parse(fs.readFileSync(arg('--request'), 'utf8'));
    const result = await turn(rt, spec);
    fs.writeFileSync(arg('--out'), JSON.stringify(result));
    process.exit(0);
  }
  const doc = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'));
  const fileHash = crypto.createHash('sha256').update(fs.readFileSync(CASES_PATH)).digest('hex');
  let list = doc.cases;
  if (FILTER) list = list.filter((c) => c.id.startsWith(FILTER) || c.class === FILTER);
  if (LIMIT) list = list.slice(0, LIMIT);
  const results = [];
  const started = Date.now();
  for (let i = 0; i < list.length; i++) {
    const cse = list[i];
    if (i % 100 === 0) process.stderr.write('case ' + i + '/' + list.length + ' ' + cse.id + '\n');
    let steps = [];
    try {
      if (cse.class === 'recovery') {
        const specs = recoverySpecs(cse);
        if (cse.kind === 'restart') {
          steps.push(await turn(rt, specs[0]));
          const requestPath = path.join(stateDir, 'restart-' + cse.id + '.json');
          const childOut = path.join(stateDir, 'restart-' + cse.id + '.out.json');
          fs.writeFileSync(requestPath, JSON.stringify(specs[1]));
          const child = spawnSync(process.execPath, [
            __filename,
            '--child',
            '--runtime', RUNTIME_ROOT,
            '--state', stateDir,
            '--request', requestPath,
            '--out', childOut,
          ], { encoding: 'utf8', timeout: 60000 });
          if (child.status !== 0 || !fs.existsSync(childOut)) {
            steps.push({ calls: [], prompts: [], error: 'restart child ' + (child.stderr || child.stdout || child.status), trip: [] });
          } else {
            steps.push(JSON.parse(fs.readFileSync(childOut, 'utf8')));
          }
        } else {
          for (const spec of specs) steps.push(await turn(rt, spec));
        }
      } else {
        for (const spec of stepsFor(cse)) steps.push(await turn(rt, spec));
      }
    } catch (err) {
      steps.push({ calls: [], prompts: [], error: String(err && err.stack || err), trip: [] });
    }
    const judged = evaluate(cse, steps);
    results.push({ id: cse.id, class: cse.class, kind: cse.kind, pass: judged.pass, fails: judged.fails, tags: judged.tags, sample: judged });
  }
  const summary = summarize(doc, fileHash, results, Date.now() - started, rt);
  if (OUT_PATH) fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2));
  rt.realError(JSON.stringify({
    pass: summary.passed,
    fail: summary.failed,
    rate: summary.passRate,
    productCritical: summary.productCritical,
    leaks: summary.leaks,
    duplicates: summary.duplicates,
    recoveryFailures: summary.recoveryFailures,
    tripwire: summary.tripwire,
  }));
  process.exit(summary.failed ? 1 : 0);
}

function summarize(doc, fileHash, results, elapsed, rt) {
  const byClass = {};
  const examples = [];
  let passed = 0;
  let leaks = 0;
  let duplicates = 0;
  let recoveryFailures = 0;
  let productCritical = 0;
  for (const row of results) {
    if (!byClass[row.class]) byClass[row.class] = { pass: 0, fail: 0 };
    if (row.pass) {
      passed += 1;
      byClass[row.class].pass += 1;
      continue;
    }
    byClass[row.class].fail += 1;
    if (row.tags.includes('leak')) leaks += 1;
    if (row.tags.includes('duplicate')) duplicates += 1;
    if (row.tags.includes('recovery')) recoveryFailures += 1;
    if (row.tags.includes('product-critical')) productCritical += 1;
    if (examples.filter((e) => e.class === row.class).length < 6) {
      examples.push({
        id: row.id,
        class: row.class,
        kind: row.kind,
        tags: row.tags,
        fails: row.fails.slice(0, 4),
        comments: row.sample.comments,
        lastComments: row.sample.lastComments,
        attempts: row.sample.attempts,
      });
    }
  }
  return {
    sealSha256: fileHash,
    cases: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? Number((passed / results.length).toFixed(4)) : 0,
    productCritical,
    leaks,
    duplicates,
    recoveryFailures,
    byClass,
    examples,
    tripwire: rt.tripHits.length,
    hosts: count(rt.hosts),
    elapsedMs: elapsed,
    failedIds: results.filter((r) => !r.pass).map((r) => r.id),
  };
}

function count(list) {
  const out = {};
  for (const item of list) out[item] = (out[item] || 0) + 1;
  return out;
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
