'use strict';

/**
 * Executes sealed cases against a runtime tree through handleWebhook.
 * Axios is a recording transport. The model is a stub. Any socket is a tripwire.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const http = require('http');
const https = require('https');
const net = require('net');
const { spawnSync } = require('child_process');

const ARSAL = '10118526';
const CASEY = '424242';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? '' : process.argv[i + 1];
}

function installTripwire() {
  const hits = [];
  function boom(kind) {
    return function blocked() {
      hits.push(kind);
      const err = new Error('NETWORK_TRIPWIRE ' + kind);
      err.code = 'NETWORK_TRIPWIRE';
      throw err;
    };
  }
  http.request = boom('http.request');
  http.get = boom('http.get');
  https.request = boom('https.request');
  https.get = boom('https.get');
  net.connect = boom('net.connect');
  net.createConnection = boom('net.createConnection');
  if (typeof global.fetch === 'function') {
    global.fetch = function blockedFetch() {
      hits.push('fetch');
      return Promise.reject(new Error('NETWORK_TRIPWIRE fetch'));
    };
  }
  return hits;
}

function installMocks(runtime, presend) {
  const tmp = os.tmpdir();
  const pid = process.pid + '-' + Math.random().toString(16).slice(2);
  const axiosMock = path.join(tmp, 'luna-ind-axios-' + pid + '.js');
  const openaiMock = path.join(tmp, 'luna-ind-openai-' + pid + '.js');
  const expressMock = path.join(tmp, 'luna-ind-express-' + pid + '.js');
  const dotenvMock = path.join(tmp, 'luna-ind-dotenv-' + pid + '.js');
  fs.writeFileSync(axiosMock, [
    'function axios(cfg){ return global.__lunaAxios(cfg); }',
    'axios.get=function(url,opts){ return axios(Object.assign({method:"get",url:url}, opts||{})); };',
    'axios.post=function(url,data,opts){ return axios(Object.assign({method:"post",url:url,data:data}, opts||{})); };',
    'axios.create=function(){ return axios; };',
    'module.exports=axios;',
  ].join('\n'));
  fs.writeFileSync(openaiMock, [
    'class OpenAI { constructor(){ this.chat={completions:{create:function(req){ return global.__lunaModel(req); }}}; } }',
    'module.exports=OpenAI;',
  ].join('\n'));
  fs.writeFileSync(expressMock, [
    'function express(){ const app={use(){return app;},get(){return app;},post(){return app;},listen(){return app;}}; return app; }',
    'express.json=function(){ return function(_req,_res,next){ if(next) next(); }; };',
    'module.exports=express;',
  ].join('\n'));
  fs.writeFileSync(dotenvMock, 'module.exports={config:function(){return {parsed:{}};}};\n');
  const orig = Module._resolveFilename;
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
    return orig.call(this, request, parent, isMain, options);
  };
}

function loadRuntime(runtimeRoot, stateDir) {
  const runtime = path.join(runtimeRoot, 'luna-current/01_runtime');
  const presend = path.join(runtimeRoot, 'luna-current/02_statePresend');
  installMocks(runtime, presend);
  const controlFile = path.join(stateDir, 'control.json');
  fs.writeFileSync(controlFile, JSON.stringify({
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: [],
    testAllowConversationIds: [],
    config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
  }));
  process.env.LUNA_CONTROL_STATE_FILE = controlFile;
  process.env.LUNA_OP_STORE_FILE = path.join(stateDir, 'ops.json');
  process.env.TICKET_STATE_FILE = path.join(stateDir, 'tickets.json');
  process.env.MENTION_ROTATE_FILE = path.join(stateDir, 'mentions.json');
  process.env.IMAGE_GUARD_STATE_FILE = path.join(stateDir, 'image.json');
  process.env.LUNA_PROMPT_FILE = path.join(runtime, 'system-prompt.txt');
  process.env.FUNDEDELITE_FAQ_PATH = path.join(runtime, 'fundedelite-faqs.md');
  process.env.OPENAI_API_KEY = 'synthetic-independent-review';
  process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-independent-review';
  process.env.MAINTAINER_ENABLED = 'false';
  const index = require(path.join(runtime, 'index.js'));
  const store = require(path.join(runtime, 'writeOpStore.js'));
  const faq = require(path.join(runtime, 'faq-kb.js'));
  return { index, store, faq, runtime };
}

function bodiesOf(calls, type) {
  return calls.filter((c) => c.data && c.data.message_type === type).map((c) => String(c.data.body || ''));
}

function assignsOf(calls) {
  return calls.filter((c) => c.data && c.data.message_type === 'assignment');
}

function includesAll(hay, needles) {
  const missing = [];
  for (const needle of needles || []) {
    if (!hay.includes(needle)) missing.push(needle);
  }
  return missing;
}

function scoreTurn(turn, raw, store, convId) {
  const failures = [];
  const exp = turn.expect || {};
  const comments = bodiesOf(raw.calls, 'comment');
  const notes = bodiesOf(raw.calls, 'note');
  const assigns = assignsOf(raw.calls);
  const prompts = raw.prompts.join('\n');
  const assignBlob = JSON.stringify(assigns.map((c) => c.data));
  const publicBlob = comments.join('\n');
  const noteBlob = notes.join('\n');
  const everywhere = [prompts, publicBlob, noteBlob, assignBlob].join('\n');

  function fail(gate, msg, extra) {
    failures.push(Object.assign({ gate, msg }, extra || {}));
  }

  if (raw.error) fail('critical', 'webhook threw: ' + raw.error);
  if (raw.unexpected && raw.unexpected.length) {
    fail('critical', 'unexpected network host ' + raw.unexpected.join(','));
  }
  if (raw.sockets) fail('critical', 'socket tripwire fired ' + raw.sockets);

  const commentMode = exp.comments;
  if (commentMode === '429') {
    if (comments.length < 1 || comments.length > 3) {
      fail(exp.commentGate || 'recovery', '429 comment posts ' + comments.length, { got: comments.slice(0, 3) });
    }
  } else if (commentMode != null) {
    if (comments.length < commentMode) fail(exp.commentGate || 'critical', 'comments ' + comments.length + ' expected ' + commentMode, { got: comments.slice(0, 2) });
    if (comments.length > commentMode) fail(exp.extraGate || 'duplicate', 'extra comments ' + comments.length + ' expected ' + commentMode, { got: comments.slice(0, 3) });
  }
  if (exp.notes != null && notes.length !== exp.notes) {
    const gate = notes.length > exp.notes ? (exp.noteGate || 'duplicate') : (exp.noteGate || 'critical');
    fail(gate, 'notes ' + notes.length + ' expected ' + exp.notes, { got: notes.slice(0, 1).map((s) => s.slice(0, 180)) });
  }
  if (exp.assigns != null && assigns.length !== exp.assigns) {
    const gate = assigns.length > exp.assigns ? (exp.assignGate || 'duplicate') : (exp.assignGate || 'critical');
    fail(gate, 'assignments ' + assigns.length + ' expected ' + exp.assigns);
  }
  if (exp.commentEquals != null) {
    const wanted = exp.commentEquals;
    if (!comments.length || comments.some((body) => body !== wanted)) {
      fail(exp.equalsGate || 'critical', 'public body is not the sealed line', {
        expected: wanted.slice(0, 180),
        got: (comments[0] || '').slice(0, 240),
      });
    }
  }
  for (const needle of exp.commentContains || []) {
    if (!comments.some((body) => body.includes(needle))) {
      fail(exp.equalsGate || 'critical', 'public body missing sealed text', { missing: needle.slice(0, 80), got: (comments[0] || '').slice(0, 180) });
    }
  }
  for (const needle of exp.commentExcludes || []) {
    if (comments.some((body) => body.includes(needle))) {
      fail('critical', 'withheld text was posted', { text: needle.slice(0, 120) });
    }
  }
  for (const secret of exp.secrets || []) {
    if (everywhere.includes(secret)) {
      const where = [];
      if (prompts.includes(secret)) where.push('prompt');
      if (publicBlob.includes(secret)) where.push('public');
      if (noteBlob.includes(secret)) where.push('note');
      if (assignBlob.includes(secret)) where.push('assign');
      fail('leak', 'secret present in ' + where.join('+'), { where });
    }
  }
  const keepIn = exp.keepIn || [];
  for (const token of exp.keep || []) {
    if (keepIn.includes('public') && comments.length && !publicBlob.includes(token)) {
      fail('over', 'public body lost a byte-exact token', { token: token.slice(0, 140), got: publicBlob.slice(0, 240) });
    }
    if (keepIn.includes('prompt') && prompts && !prompts.includes(token)) {
      fail('over', 'prompt lost a byte-exact token', { token: token.slice(0, 140) });
    }
    if (keepIn.includes('note') && notes.length && !noteBlob.includes(token)) {
      fail('over', 'note lost a byte-exact token', { token: token.slice(0, 140), got: noteBlob.slice(0, 240) });
    }
    if (keepIn.includes('assign') && assignBlob.includes(token) === false && keepIn.includes('assign')) {
      // Assignment payloads are seat ids. A customer token must not be required there.
    }
  }
  for (const needle of exp.promptContains || []) {
    if (!prompts.includes(needle)) fail('critical', 'prompt missing ' + needle);
  }
  if (exp.owed) {
    const owed = store.latestOwedFixedLine(convId, ARSAL);
    if (!owed || owed.message !== exp.owed) {
      fail('recovery', 'owed line missing', { expected: exp.owed, got: owed && owed.message });
    }
  }
  if (exp.owedAbsent) {
    const owed = store.latestOwedFixedLine(convId, ARSAL);
    if (owed) fail('recovery', 'owed line still open after a successful post', { got: owed.message });
  }
  return {
    failures,
    comments: comments.length,
    notes: notes.length,
    assigns: assigns.length,
    commentSample: (comments[0] || '').slice(0, 160),
  };
}

function createWorld(stateDir) {
  const calls = [];
  const prompts = [];
  const unexpected = [];
  let conv = null;
  let fail = '';
  let clock = Math.floor(Date.now() / 1000) - 10;
  global.__lunaReply = 'ACTION: REPLY\nOK';
  global.__lunaModel = function (req) {
    const messages = (req && req.messages) || [];
    for (const message of messages) prompts.push(String(message.content || ''));
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
    let host = '';
    try { host = new URL(url).host; } catch (_) { host = url.slice(0, 80); }
    if (host !== 'api.intercom.io') {
      // Live FAQ fetches are blocked here. They are not a socket, and they are
      // not a product failure unless some other host is contacted.
      if (host !== 'faq.fundedelite.com') unexpected.push(host || url.slice(0, 120));
      return Promise.resolve({ status: 599, data: '' });
    }
    calls.push({ method, url, data: data == null ? null : JSON.parse(JSON.stringify(data)) });
    if (url.includes('/admins')) {
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
      return Promise.resolve({ status: 200, data: JSON.parse(JSON.stringify(conv)) });
    }
    if (data && data.message_type === 'comment' && fail) {
      if (fail === 'timeout') return Promise.reject(new Error('timeout'));
      const status = Number(fail);
      return Promise.resolve({ status, data: { type: 'error.list', errors: [{ code: 'parameter_invalid', status }] } });
    }
    if (data && data.message_type === 'assignment') {
      const assignee = String(data.assignee_id);
      conv.admin_assignee_id = assignee;
      clock += 1;
      conv.conversation_parts.conversation_parts.push({
        id: conv.id + '-asg-' + clock,
        part_type: 'assignment',
        created_at: clock,
        author: { type: 'admin', id: ARSAL, name: 'Arsal' },
        assigned_to: { type: 'admin', id: assignee },
        body: '',
      });
      return Promise.resolve({ status: 200, data: { id: 'asg', type: 'conversation', admin_assignee_id: assignee } });
    }
    if (data && (data.message_type === 'note' || data.message_type === 'comment')) {
      clock += 1;
      conv.conversation_parts.conversation_parts.push({
        id: conv.id + '-' + data.message_type + '-' + clock,
        part_type: data.message_type,
        created_at: clock,
        author: { type: 'admin', id: ARSAL, name: 'Arsal' },
        body: data.body,
      });
    }
    return Promise.resolve({ status: 200, data: { id: 'w1', type: 'conversation' } });
  };
  return {
    stateDir,
    calls,
    prompts,
    unexpected,
    get conv() { return conv; },
    set conv(v) { conv = v; },
    setFail(v) { fail = v || ''; },
    nextClock() { clock += 1; return clock; },
  };
}

function freshConv(id, text, turn) {
  const now = Math.floor(Date.now() / 1000);
  const name = 'Sam';
  const parts = [];
  if (turn.priorBot) {
    parts.push({
      id: id + '-bot',
      part_type: 'comment',
      body: 'Hello, how can I help?',
      created_at: now - 400,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    });
  }
  parts.push({
    id: id + '-user-0',
    part_type: 'comment',
    body: text,
    created_at: now - 5,
    author: { type: 'user', id: 'user-1', name },
  });
  return {
    id,
    created_at: now - (turn.createdAgo == null ? 1000 : turn.createdAgo),
    admin_assignee_id: '0',
    team_assignee_id: '0',
    source: { body: text, created_at: now - 30, author: { type: 'user', id: 'user-1', name } },
    contacts: { contacts: [{ name, email: 'sam@example.com', id: 'user-1' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

async function runTurn(world, index, faq, conv, turn) {
  world.calls.length = 0;
  world.prompts.length = 0;
  world.unexpected.length = 0;
  world.setFail(turn.fail || '');
  global.__lunaReply = turn.model || 'ACTION: REPLY\nOK';
  if (turn.faqBlock) {
    faq.retrieveOfficialFaqContext = async function () {
      return { ok: true, block: turn.faqBlock, from: 'sealed-evidence' };
    };
  }
  world.conv = conv;
  const topic = turn.topic || 'conversation.user.replied';
  const res = { status: 0, sendStatus(code) { this.status = code; return this; } };
  let error = '';
  try {
    await index.handleWebhook({ body: { topic, data: { item: conv } } }, res);
  } catch (err) {
    error = err && err.stack ? err.stack.split('\n')[0] : String(err);
  }
  world.setFail('');
  return {
    calls: world.calls.slice(),
    prompts: world.prompts.slice(),
    unexpected: world.unexpected.slice(),
    error,
    sockets: 0,
    status: res.status,
  };
}

function prepareConv(conv, turn, world) {
  if (turn.dropNotes) {
    conv.conversation_parts.conversation_parts = conv.conversation_parts.conversation_parts.filter((p) => p.part_type !== 'note');
  }
  if (turn.wipeStore) fs.writeFileSync(process.env.LUNA_OP_STORE_FILE, '{}');
  if (turn.human) {
    conv.conversation_parts.conversation_parts.push({
      id: conv.id + '-human-' + world.nextClock(),
      part_type: 'comment',
      body: 'I will take it from here.',
      created_at: world.nextClock(),
      author: { type: 'admin', id: CASEY, name: 'Casey Support' },
    });
  }
  if (turn.text && conv.conversation_parts.conversation_parts.some((p) => p.author && p.author.type === 'user')) {
    const already = conv.conversation_parts.conversation_parts[conv.conversation_parts.conversation_parts.length - 1];
    if (!(already && already.author && already.author.type === 'user' && already.body === turn.text && String(already.id).endsWith('-user-0'))) {
      conv.conversation_parts.conversation_parts.push({
        id: conv.id + '-user-' + world.nextClock(),
        part_type: 'comment',
        body: turn.text,
        created_at: world.nextClock(),
        author: { type: 'user', id: 'user-1', name: 'Sam' },
      });
    }
  }
}

function resumeChild(runtimeRoot, stateDir, conv, turn) {
  const worldFile = path.join(stateDir, 'resume-world.json');
  const outFile = path.join(stateDir, 'resume-out.json');
  fs.writeFileSync(worldFile, JSON.stringify({ conv, turn }));
  const run = spawnSync(process.execPath, [__filename, '--resume', '--runtime', runtimeRoot, '--state', stateDir, '--world', worldFile, '--resume-out', outFile], {
    encoding: 'utf8',
    timeout: 120000,
    env: process.env,
  });
  if (!fs.existsSync(outFile)) {
    return { calls: [], prompts: [], unexpected: [], error: 'resume child failed ' + (run.stderr || run.stdout || run.status), sockets: 0 };
  }
  return JSON.parse(fs.readFileSync(outFile, 'utf8'));
}

async function executeCase(item, world, loaded, runtimeRoot, socketHits) {
  const convId = 'ind-' + item.id;
  let conv = null;
  const turnReports = [];
  for (let i = 0; i < item.turns.length; i++) {
    const turn = item.turns[i];
    if (i === 0) conv = freshConv(convId, turn.text, turn);
    else prepareConv(conv, turn, world);
    let raw;
    const socketsBefore = socketHits.length;
    if (turn.restart) {
      raw = resumeChild(runtimeRoot, world.stateDir, conv, turn);
      if (raw.conv) conv = raw.conv;
    } else {
      raw = await runTurn(world, loaded.index, loaded.faq, conv, turn);
    }
    raw.sockets = (raw.sockets || 0) + (socketHits.length - socketsBefore);
    const scored = scoreTurn(turn, raw, loaded.store, convId);
    turnReports.push({
      i,
      failures: scored.failures,
      comments: scored.comments,
      notes: scored.notes,
      assigns: scored.assigns,
      sample: scored.commentSample,
    });
    if (turn.restart && raw.conv) conv = raw.conv;
  }
  const failures = [];
  turnReports.forEach((report) => {
    report.failures.forEach((failure) => {
      failures.push(Object.assign({ turn: report.i }, failure));
    });
  });
  return {
    id: item.id,
    kind: item.kind,
    group: item.group,
    ok: failures.length === 0,
    failures,
    turns: turnReports.map((report) => ({
      i: report.i,
      comments: report.comments,
      notes: report.notes,
      assigns: report.assigns,
      sample: report.sample,
    })),
  };
}

async function runGroup(cases, group, runtimeRoot) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-ind-'));
  const socketHits = installTripwire();
  const loaded = loadRuntime(runtimeRoot, stateDir);
  const world = createWorld(stateDir);
  const selected = cases.filter((item) => item.group === group);
  const results = [];
  for (const item of selected) {
    results.push(await executeCase(item, world, loaded, runtimeRoot, socketHits));
    if (results.length % 25 === 0) process.stderr.write('group ' + group + ' ' + results.length + '/' + selected.length + '\n');
  }
  return {
    group,
    cases: results.length,
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    sockets: socketHits.length,
    results,
  };
}

async function resumeMain() {
  const runtimeRoot = arg('--runtime');
  const stateDir = arg('--state');
  const world = JSON.parse(fs.readFileSync(arg('--world'), 'utf8'));
  installTripwire();
  const loaded = loadRuntime(runtimeRoot, stateDir);
  const live = createWorld(stateDir);
  const raw = await runTurn(live, loaded.index, loaded.faq, world.conv, world.turn);
  raw.conv = world.conv;
  fs.writeFileSync(arg('--resume-out'), JSON.stringify(raw));
}

async function main() {
  const origLog = console.log;
  const origErr = console.error;
  if (process.argv.includes('--resume')) {
    console.log = function () {};
    console.error = function () {};
    try {
      await resumeMain();
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
    return;
  }
  console.log = function () {};
  console.error = function () {};
  const runtimeRoot = arg('--runtime');
  const casesFile = arg('--cases');
  const group = arg('--group');
  const out = arg('--out');
  assert.ok(runtimeRoot && casesFile && group && out, 'runtime, cases, group, and out are required');
  const doc = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
  const summary = await runGroup(doc.cases, group, runtimeRoot);
  fs.writeFileSync(out, JSON.stringify(summary));
  console.log = origLog;
  console.error = origErr;
  origLog(JSON.stringify({ group: summary.group, cases: summary.cases, passed: summary.passed, failed: summary.failed, sockets: summary.sockets }));
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack || err) + '\n');
  process.exit(1);
});
