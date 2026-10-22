'use strict';

/**
 * Runs the sealed cases through the real handleWebhook.
 * Does not modify cases.json. Recording transport, stub model, network tripwire.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const FIXED = new Set([
  'A teammate now has this conversation.',
  'یہ گفتگو اب ایک ساتھی کے پاس ہے۔',
  'هذه المحادثة الآن لدى أحد الزملاء.',
  'यह बातचीत अब एक साथी के पास है।',
  'Un collega ha ora questa conversazione.',
]);

const VERSIONS = {
  r23: '/tmp/r23-src',
  r22: '/tmp/r22-src',
  r21: '/tmp/r21-src',
};

if (process.env.LUNA_REVIEW_WORKER === '1') {
  runWorker().catch((err) => {
    try {
      fs.writeFileSync(process.env.LUNA_REVIEW_RESULT, JSON.stringify({ error: String(err && err.stack || err), turns: [] }));
    } catch (_) { /* result path missing */ }
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error(err && err.stack || err);
    process.exit(1);
  });
}

function installTripwire() {
  const http = require('http');
  const https = require('https');
  const dns = require('dns');
  global.__tripwire = [];
  function note(name, detail) {
    const err = new Error('NETWORK_TRIPWIRE ' + name + ' ' + detail);
    global.__tripwire.push({ name, detail: String(detail).slice(0, 300), stack: err.stack });
    return err;
  }
  http.request = function (options, cb) {
    const host = options && (options.hostname || options.host || options.href || options);
    const err = note('http.request', host);
    if (typeof cb === 'function') cb(err);
    return { on() { return this; }, once() { return this; }, end() {}, write() {}, destroy() {}, abort() {} };
  };
  https.request = function (options, cb) {
    const host = options && (options.hostname || options.host || options.href || options);
    const err = note('https.request', host);
    if (typeof cb === 'function') cb(err);
    return { on() { return this; }, once() { return this; }, end() {}, write() {}, destroy() {}, abort() {} };
  };
  http.get = function (options, cb) { return http.request(options, cb); };
  https.get = function (options, cb) { return https.request(options, cb); };
  dns.lookup = function (hostname, opts, cb) {
    const callback = typeof opts === 'function' ? opts : cb;
    const err = note('dns.lookup', hostname);
    if (typeof callback === 'function') callback(err);
  };
  dns.resolve = function (hostname, type, cb) {
    const callback = typeof type === 'function' ? type : cb;
    const err = note('dns.resolve', hostname);
    if (typeof callback === 'function') callback(err);
  };
}

function installResolver(runtime, presend) {
  const Module = require('module');
  const resolveFilename = Module._resolveFilename;
  const axiosMock = path.join(process.env.LUNA_REVIEW_STATE, 'axios-mock.js');
  const openaiMock = path.join(process.env.LUNA_REVIEW_STATE, 'openai-mock.js');
  const expressMock = path.join(process.env.LUNA_REVIEW_STATE, 'express-mock.js');
  const dotenvMock = path.join(process.env.LUNA_REVIEW_STATE, 'dotenv-mock.js');
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
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'axios') return axiosMock;
    if (request === 'openai') return openaiMock;
    if (request === 'express') return expressMock;
    if (request === 'dotenv') return dotenvMock;
    if (request === './statePresend/statePresend' || request === './statePresend/statePresend.js') {
      return path.join(presend, 'statePresend.js');
    }
    if (request === './statePresend/textUtils' || request === './statePresend/textUtils.js') {
      return path.join(presend, 'textUtils.js');
    }
    if (typeof request === 'string' && request.indexOf('statePresend/') !== -1) {
      const base = request.split('statePresend/').pop();
      const file = base.endsWith('.js') ? base : base + '.js';
      const candidate = path.join(presend, file);
      if (fs.existsSync(candidate)) return candidate;
    }
    if (typeof request === 'string' && request.startsWith('../') && parent && parent.filename && parent.filename.includes('02_statePresend')) {
      const rel = request.replace(/^\.\.\//, '');
      const candidate = path.join(runtime, rel.endsWith('.js') ? rel : rel + '.js');
      if (fs.existsSync(candidate)) return candidate;
    }
    return resolveFilename.call(this, request, parent, isMain, options);
  };
}

function recordCall(call) {
  fs.appendFileSync(process.env.LUNA_REVIEW_CALLS, JSON.stringify(call) + '\n');
}

async function runWorker() {
  installTripwire();
  const root = process.env.LUNA_REVIEW_ROOT;
  const runtime = path.join(root, 'luna-current', '01_runtime');
  const presend = path.join(root, 'luna-current', '02_statePresend');
  const stateDir = process.env.LUNA_REVIEW_STATE;
  fs.mkdirSync(stateDir, { recursive: true });
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
  process.env.LUNA_DECLARED_SECRET_FILE = path.join(stateDir, 'luna-declared-secrets.json');
  process.env.LUNA_PROMPT_FILE = path.join(runtime, 'system-prompt.txt');
  process.env.FUNDEDELITE_FAQ_PATH = path.join(runtime, 'fundedelite-faqs.md');
  process.env.OPENAI_API_KEY = 'synthetic-review-not-a-secret';
  process.env.MAINTAINER_ENABLED = 'false';
  process.env.LUNA_TOOLS_ENABLED = '0';
  process.env.INTERCOM_TOKEN = 'synthetic-review-token';
  installResolver(runtime, presend);

  const calls = [];
  let current = null;
  let liveAssignee = '';
  global.__lunaReply = 'ACTION: REPLY\nOK';
  global.__lunaFailComment = '';
  global.__lunaDieOnComment = false;
  global.__lunaRead429 = 0;
  global.__lunaSeenPrompt = '';
  global.__lunaModel = function (req) {
    const messages = (req && req.messages) || [];
    const sys = String((messages.find((m) => m.role === 'system') || {}).content || '');
    const user = String((messages.find((m) => m.role === 'user') || {}).content || '');
    global.__lunaSeenPrompt += '\n' + user;
    if (/INTERNAL Intercom note/i.test(sys)) {
      return Promise.resolve({ choices: [{ message: { content: user.replace(/^\[[^\]]+\]\n/, '') } }] });
    }
    return Promise.resolve({ choices: [{ message: { content: global.__lunaReply } }] });
  };
  global.__lunaAxios = function (cfg) {
    const method = String((cfg && cfg.method) || 'get').toLowerCase();
    const url = String((cfg && cfg.url) || '');
    const data = cfg && cfg.data;
    const call = { method, url, data, status: 200, timeout: false };
    calls.push(call);
    recordCall(call);
    if (url.includes('/admins')) {
      call.status = 200;
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
      if (global.__lunaRead429 > 0) {
        global.__lunaRead429 -= 1;
        call.status = 429;
        return Promise.resolve({ status: 429, data: { type: 'error.list', errors: [{ code: 'rate_limit', status: 429 }] } });
      }
      const copy = JSON.parse(JSON.stringify(current));
      if (liveAssignee) copy.admin_assignee_id = liveAssignee;
      call.status = 200;
      return Promise.resolve({ status: 200, data: copy });
    }
    if (data && data.message_type === 'comment' && global.__lunaDieOnComment) {
      call.status = 0;
      process.exit(86);
    }
    if (data && data.message_type === 'comment' && global.__lunaFailComment) {
      const fail = global.__lunaFailComment;
      global.__lunaFailComment = '';
      if (fail === 'timeout') {
        call.status = 0;
        call.timeout = true;
        return Promise.reject(new Error('timeout'));
      }
      const status = Number(fail);
      call.status = status;
      return Promise.resolve({ status, data: { type: 'error.list', errors: [{ code: 'parameter_invalid', status }] } });
    }
    if (data && data.message_type === 'assignment') {
      liveAssignee = String(data.assignee_id);
      call.status = 200;
      return Promise.resolve({ status: 200, data: { id: 'asg', type: 'conversation', admin_assignee_id: liveAssignee } });
    }
    call.status = 200;
    return Promise.resolve({ status: 200, data: { id: 'w1', type: 'conversation' } });
  };

  const index = require(path.join(runtime, 'index.js'));
  const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const observations = [];
  let seq = 0;
  for (const turn of payload.turns || []) {
    calls.length = 0;
    global.__lunaReply = turn.reply || 'ACTION: REPLY\nOK';
    global.__lunaFailComment = turn.failComment || '';
    global.__lunaDieOnComment = !!turn.dieOnComment;
    global.__lunaRead429 = turn.read429 ? 1 : 0;
    global.__lunaSeenPrompt = '';
    if (turn.assignee) liveAssignee = String(turn.assignee);
    else if (!turn.keepAssignee) liveAssignee = '';
    const id = turn.id || payload.caseId;
    current = buildConv(id, turn, seq++);
    const topic = turn.topic || 'conversation.user.replied';
    const res = { status: 0, sendStatus(code) { this.status = code; return this; } };
    let error = '';
    try {
      await index.handleWebhook({ body: { topic, data: { item: current } } }, res);
    } catch (err) {
      error = String(err && err.stack || err);
    }
    const snapshot = calls.map((c) => ({
      method: c.method,
      url: c.url,
      status: c.status,
      timeout: !!c.timeout,
      messageType: c.data && c.data.message_type || '',
      body: c.data && c.data.body ? String(c.data.body) : '',
    }));
    observations.push({
      httpStatus: res.status,
      error,
      prompt: global.__lunaSeenPrompt,
      tripwire: global.__tripwire.slice(),
      comments: snapshot.filter((c) => c.messageType === 'comment'),
      notes: snapshot.filter((c) => c.messageType === 'note'),
      assigns: snapshot.filter((c) => c.messageType === 'assignment'),
    });
    global.__tripwire.length = 0;
  }
  fs.writeFileSync(process.env.LUNA_REVIEW_RESULT, JSON.stringify({ turns: observations }));
  process.exit(0);
}

function buildConv(id, turn, seq) {
  const now = Math.floor(Date.now() / 1000);
  const name = turn.name || 'Sam';
  const parts = [];
  for (const extra of turn.extraParts || []) {
    if (extra.kind === 'assignment') {
      parts.push({
        id: id + '-asg-' + parts.length,
        part_type: 'assignment',
        created_at: now - (extra.ago || 20),
        author: { type: 'admin', id: '10118526', name: 'Arsal' },
        assigned_to: { type: 'admin', id: String(extra.assignee || '424242') },
        body: '',
      });
    } else if (extra.kind === 'human') {
      parts.push({
        id: id + '-human-' + parts.length,
        part_type: 'comment',
        body: extra.body || 'I am taking this from here.',
        created_at: now - (extra.ago || 12),
        author: { type: 'admin', id: '777001', name: 'Riley Support' },
      });
    } else if (extra.kind === 'note') {
      parts.push({
        id: id + '-note-' + parts.length,
        part_type: 'note',
        body: extra.body || '',
        created_at: now - (extra.ago || 30),
        author: { type: 'admin', id: '10118526', name: 'Arsal' },
      });
    }
  }
  parts.push({
    id: id + '-user-' + seq,
    part_type: 'comment',
    body: turn.text,
    created_at: now - 5,
    author: { type: 'user', id: 'user-1', name },
  });
  return {
    id,
    created_at: now - (turn.createdAgo == null ? 5000 : turn.createdAgo),
    admin_assignee_id: turn.assignee || (parts.length ? '0' : '0'),
    team_assignee_id: '0',
    source: {
      body: turn.sourceBody || turn.text,
      created_at: now - 30,
      author: { type: 'user', id: 'user-1', name },
    },
    contacts: { contacts: [{ name, email: 'sam@example.com', id: 'user-1' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function normStatus(value) {
  if (value === 'timeout') return 'timeout';
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isFinite(n) && String(value).trim() !== '' ? n : value;
}

function blobOf(turn) {
  return [
    (turn.comments || []).map((c) => c.body).join('\n'),
    (turn.notes || []).map((c) => c.body).join('\n'),
    turn.prompt || '',
  ].join('\n');
}

function checkTurn(turn, exp) {
  const failures = [];
  if (!exp) return failures;
  const comments = turn.comments || [];
  const notes = turn.notes || [];
  const assigns = turn.assigns || [];
  if (exp.commentCount != null && comments.length !== exp.commentCount) {
    failures.push('commentCount ' + comments.length + '!=' + exp.commentCount);
  }
  if (exp.noteCount != null && notes.length !== exp.noteCount) {
    failures.push('noteCount ' + notes.length + '!=' + exp.noteCount);
  }
  if (exp.assignCount != null && assigns.length !== exp.assignCount) {
    failures.push('assignCount ' + assigns.length + '!=' + exp.assignCount);
  }
  if (exp.commentStatuses) {
    const got = comments.map((c) => (c.timeout ? 'timeout' : normStatus(c.status)));
    const want = exp.commentStatuses.map(normStatus);
    if (JSON.stringify(got) !== JSON.stringify(want)) failures.push('statuses ' + JSON.stringify(got) + '!=' + JSON.stringify(want));
  }
  if (exp.exactComments) {
    const got = comments.map((c) => c.body);
    if (JSON.stringify(got) !== JSON.stringify(exp.exactComments)) {
      failures.push('exact ' + JSON.stringify(got).slice(0, 240));
    }
  }
  const bodies = comments.map((c) => c.body).join('\n');
  const all = blobOf(turn);
  for (const item of exp.includes || []) {
    if (!bodies.includes(item)) failures.push('missing ' + JSON.stringify(item).slice(0, 160));
  }
  for (const item of exp.excludes || []) {
    if (item && all.includes(item)) failures.push('present ' + JSON.stringify(item).slice(0, 160));
  }
  if (turn.error) failures.push('throw ' + turn.error.slice(0, 240));
  if (turn.tripwire && turn.tripwire.length) failures.push('tripwire ' + turn.tripwire.map((t) => t.name).join(','));
  return failures;
}

function successfulFixed(turns) {
  let n = 0;
  for (const turn of turns || []) {
    for (const comment of turn.comments || []) {
      if (comment.timeout || normStatus(comment.status) !== 200) continue;
      const body = String(comment.body || '');
      if (FIXED.has(body) || [...FIXED].some((line) => body.includes(line))) n += 1;
    }
  }
  return n;
}

function secretsIn(turns, secrets) {
  const hits = [];
  const all = (turns || []).map(blobOf).join('\n');
  for (const secret of secrets || []) {
    if (secret && all.includes(secret)) hits.push(secret);
  }
  return hits;
}

function evaluate(spec, phases) {
  const failures = [];
  const expect = spec.expect || {};
  if (spec.mode === 'restart') {
    const wanted = spec.phases || [];
    if (phases.length !== wanted.length) failures.push('phases ' + phases.length + '!=' + wanted.length);
    wanted.forEach((phase, i) => {
      const got = phases[i] || {};
      if (phase.expectExit != null && got.code !== phase.expectExit) {
        failures.push('exit ' + got.code + '!=' + phase.expectExit);
      }
      if (got.error) failures.push('worker ' + String(got.error).slice(0, 240));
    });
  } else if (phases[0] && phases[0].code !== 0) {
    failures.push('exit ' + phases[0].code);
  }
  const phaseIndex = expect.phase || 0;
  const observed = (phases[phaseIndex] && phases[phaseIndex].turns) || [];
  (expect.perTurn || []).forEach((exp, i) => {
    const turn = observed[i] || { comments: [], notes: [], assigns: [], prompt: '', error: 'missing turn', tripwire: [] };
    for (const failure of checkTurn(turn, exp)) failures.push('t' + i + ' ' + failure);
  });
  if (expect.fixedLineSuccessMax != null) {
    const n = successfulFixed(observed);
    if (n > expect.fixedLineSuccessMax) failures.push('fixedSuccess ' + n + '>' + expect.fixedLineSuccessMax);
  }
  const allTurns = phases.reduce((acc, phase) => acc.concat(phase.turns || []), []);
  const leaked = secretsIn(allTurns, spec.secretsAbsent || []);
  if (leaked.length) failures.push('secret ' + leaked.join(','));
  for (const turn of allTurns) {
    if (turn.tripwire && turn.tripwire.length) failures.push('tripwire ' + turn.tripwire.map((t) => t.name + ':' + t.detail).join(','));
  }
  return { pass: failures.length === 0, failures };
}

function signature(phases) {
  return JSON.stringify((phases || []).map((phase) => ({
    code: phase.code,
    turns: (phase.turns || []).map((turn) => ({
      c: (turn.comments || []).map((c) => (c.timeout ? 'timeout' : c.status) + ':' + c.body),
      n: (turn.notes || []).map((c) => c.body.length),
      a: (turn.assigns || []).length,
      e: turn.error ? 1 : 0,
    })),
  })));
}

function runPhase(root, stateDir, caseId, turns) {
  return new Promise((resolve) => {
    const payloadFile = path.join(stateDir, 'payload-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.json');
    const resultFile = path.join(stateDir, 'result-' + Math.random().toString(16).slice(2) + '.json');
    const callsFile = path.join(stateDir, 'calls-' + Math.random().toString(16).slice(2) + '.jsonl');
    fs.writeFileSync(payloadFile, JSON.stringify({ caseId, turns }));
    const child = spawn(process.execPath, [__filename, payloadFile], {
      env: {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '',
        LUNA_REVIEW_WORKER: '1',
        LUNA_REVIEW_ROOT: root,
        LUNA_REVIEW_STATE: stateDir,
        LUNA_REVIEW_RESULT: resultFile,
        LUNA_REVIEW_CALLS: callsFile,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 45000);
    child.on('close', (code) => {
      clearTimeout(timer);
      let parsed = null;
      if (fs.existsSync(resultFile)) {
        try { parsed = JSON.parse(fs.readFileSync(resultFile, 'utf8')); } catch (err) { parsed = { error: String(err), turns: [] }; }
      }
      resolve({
        code: code == null ? -1 : code,
        turns: parsed && parsed.turns ? parsed.turns : [],
        error: (parsed && parsed.error) || (!parsed && code !== 86 ? stderr.slice(-800) : ''),
      });
    });
  });
}

async function runCase(version, spec) {
  const root = VERSIONS[version];
  const stateDir = path.join(os.tmpdir(), 'luna-r23-review', version, spec.id);
  fs.rmSync(stateDir, { recursive: true, force: true });
  fs.mkdirSync(stateDir, { recursive: true });
  const phases = [];
  if (spec.mode === 'restart') {
    for (const phase of spec.phases) {
      phases.push(await runPhase(root, stateDir, spec.id, phase.turns));
    }
  } else {
    phases.push(await runPhase(root, stateDir, spec.id, spec.turns || []));
  }
  const judged = evaluate(spec, phases);
  return {
    id: spec.id,
    bucket: spec.bucket,
    intent: spec.intent,
    gates: spec.gates || [],
    pass: judged.pass,
    failures: judged.failures,
    signature: signature(phases),
    sample: sample(phases),
  };
}

function sample(phases) {
  const phase = phases[phases.length - 1] || { turns: [] };
  const turn = (phase.turns || [])[0] || {};
  return {
    code: phase.code,
    comments: (turn.comments || []).map((c) => ({ status: c.timeout ? 'timeout' : c.status, body: String(c.body).slice(0, 280) })),
    noteCount: (turn.notes || []).length,
    assignCount: (turn.assigns || []).length,
    error: turn.error ? String(turn.error).slice(0, 240) : '',
  };
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  }
  const workers = [];
  for (let i = 0; i < limit; i += 1) workers.push(worker());
  await Promise.all(workers);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const idArg = args.find((a) => a.startsWith('--ids='));
  const versionArg = args.find((a) => a.startsWith('--versions='));
  const ids = idArg ? idArg.slice('--ids='.length).split(',') : null;
  const versions = versionArg ? versionArg.slice('--versions='.length).split(',') : ['r23', 'r22', 'r21'];
  const sealed = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
  const selected = ids ? sealed.cases.filter((c) => ids.includes(c.id)) : sealed.cases;
  const summary = {
    sealedTotal: sealed.total,
    selected: selected.length,
    versions: {},
  };
  for (const version of versions) {
    const started = Date.now();
    let done = 0;
    const results = await pool(selected, 4, async (spec) => {
      const row = await runCase(version, spec);
      done += 1;
      if (done % 40 === 0 || done === selected.length) {
        console.error(version, done + '/' + selected.length, 'pass', resultsSoFar(version));
      }
      running[version].push(row.pass);
      return row;
    });
    summary.versions[version] = {
      elapsedMs: Date.now() - started,
      pass: results.filter((r) => r.pass).length,
      fail: results.filter((r) => !r.pass).length,
      results: results.map((r) => ({
        id: r.id,
        bucket: r.bucket,
        intent: r.intent,
        gates: r.gates,
        pass: r.pass,
        failures: r.failures,
        signature: r.signature,
        sample: r.pass ? undefined : r.sample,
      })),
    };
    console.error('DONE', version, summary.versions[version].pass, 'pass', summary.versions[version].fail, 'fail');
  }
  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'raw-summary.json'), JSON.stringify(summary));
  console.log('wrote', path.join(outDir, 'raw-summary.json'));
}

const running = { r23: [], r22: [], r21: [] };
function resultsSoFar(version) {
  return running[version].filter(Boolean).length;
}
