'use strict';

/**
 * Independent R17 runner. Loads the sealed case file, checks its sha256,
 * then drives the real handleWebhook through a recording axios transport,
 * a stub model, and a network tripwire. It does not edit the sealed cases.
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const net = require('net');
const dns = require('dns');

const ROOT = path.join(__dirname);
const SEALED = path.join(ROOT, 'sealed-cases.json');
const SEAL_FILE = path.join(ROOT, 'SEALED.sha256');
const sealBytes = fs.readFileSync(SEALED);
const sealHash = crypto.createHash('sha256').update(sealBytes).digest('hex');
const sealRecorded = fs.readFileSync(SEAL_FILE, 'utf8').trim().split(/\s+/)[0];
if (sealHash !== sealRecorded) {
  console.error('SEAL MISMATCH', sealHash, sealRecorded);
  process.exit(2);
}

const sealed = JSON.parse(sealBytes.toString('utf8'));
const CANARY = sealed.canary;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-r17-ind-'));
const axiosMock = path.join(tmp, 'axios.js');
const openaiMock = path.join(tmp, 'openai.js');

const session = {
  world: null,
  script: { note: 'ok', assign: 'ok', comment: 'ok' },
  calls: [],
  modelCalls: [],
  tripwires: [],
  modelReply: 'ACTION: REPLY\nBODY: I can help with that.',
};

fs.writeFileSync(axiosMock, `
'use strict';
function impl(config) {
  const session = global.__FM_R17_SESSION;
  const cfg = config || {};
  const method = String(cfg.method || 'get').toLowerCase();
  const url = String(cfg.url || '');
  const data = cfg.data;
  const allowed = url.indexOf('https://api.intercom.io/') === 0 || url.indexOf('https://faq.fundedelite.com/') === 0;
  if (!allowed) {
    session.tripwires.push(method + ' ' + url);
    const err = new Error('NETWORK_TRIPWIRE ' + url);
    err.code = 'TRIPWIRE';
    throw err;
  }
  if (url.indexOf('https://faq.fundedelite.com/') === 0) {
    session.calls.push({ kind: 'faq-stub', method, url, status: 404 });
    return Promise.resolve({ status: 404, data: '' });
  }
  if (url.indexOf('/admins') !== -1 && method === 'get') {
    session.calls.push({ kind: 'admins', method, url, status: 200 });
    return Promise.resolve({
      status: 200,
      data: {
        admins: [{
          id: 'human-7',
          name: 'Mina Support',
          email: 'mina.support@example.test',
          away_mode_enabled: false,
          has_inbox_seat: true,
          team_ids: [9629780],
        }],
      },
    });
  }
  if (method === 'get' && /\\/conversations\\/[^/]+$/.test(url)) {
    session.calls.push({ kind: 'fetch', method, url, status: 200 });
    return Promise.resolve({ status: 200, data: JSON.parse(JSON.stringify(session.world)) });
  }
  if (method === 'post' && /\\/reply$/.test(url)) {
    return session.reply(url, data);
  }
  session.tripwires.push(method + ' ' + url);
  const err = new Error('NETWORK_TRIPWIRE ' + url);
  err.code = 'TRIPWIRE';
  throw err;
}
function axios(config) { return impl(config); }
axios.get = function (url, cfg) { return impl(Object.assign({}, cfg || {}, { url: url, method: 'get' })); };
axios.post = function (url, data, cfg) { return impl(Object.assign({}, cfg || {}, { url: url, data: data, method: 'post' })); };
axios.put = function (url, data, cfg) { return impl(Object.assign({}, cfg || {}, { url: url, data: data, method: 'put' })); };
axios.request = axios;
axios.create = function () { return axios; };
module.exports = axios;
`);

fs.writeFileSync(openaiMock, `
'use strict';
class OpenAI {
  constructor() {}
  chat = { completions: { create: async function (body) {
    global.__FM_R17_SESSION.modelCalls.push(body || {});
    return { choices: [{ message: { content: global.__FM_R17_SESSION.modelReply } }] };
  } } };
}
module.exports = OpenAI;
module.exports.default = OpenAI;
`);

session.reply = function reply(url, data) {
  const kind = data && data.message_type ? String(data.message_type) : 'post';
  const mode = (session.script && session.script[kind]) || 'ok';
  const id = session.world && session.world.id;
  function record(status, confirmed, err) {
    session.calls.push({
      kind,
      method: 'post',
      url,
      data,
      body: data && data.body,
      assignee: data && data.assignee_id != null ? String(data.assignee_id) : '',
      status,
      confirmed: !!confirmed,
      error: err || '',
    });
  }
  if (mode === 'timeout') {
    record(0, false, 'timeout');
    const err = new Error('timeout of 20000ms exceeded');
    err.code = 'ECONNABORTED';
    return Promise.reject(err);
  }
  if (mode === '500') {
    record(500, false, '');
    return Promise.resolve({ status: 500, data: { type: 'error.list', errors: [{ code: 'server_error', message: 'synthetic' }] } });
  }
  if (mode === '422') {
    record(422, false, '');
    return Promise.resolve({ status: 422, data: { type: 'error.list', errors: [{ code: 'invalid', message: 'synthetic' }] } });
  }
  if (mode === '429') {
    record(429, false, '');
    return Promise.resolve({ status: 429, data: { type: 'error.list', errors: [{ code: 'rate_limit', message: 'synthetic' }] } });
  }
  if (mode === 'malformed') {
    record(200, false, 'malformed');
    return Promise.resolve({ status: 200, data: {} });
  }
  if (mode === 'error-list') {
    record(200, false, 'error-list');
    return Promise.resolve({ status: 200, data: { id: id, type: 'error.list', errors: [{ code: 'bad', message: 'synthetic' }] } });
  }
  if (mode === 'wrong-seat') {
    record(200, false, 'wrong-seat');
    return Promise.resolve({ status: 200, data: { id: id, type: 'conversation', admin_assignee_id: '999001' } });
  }
  const wanted = data && data.assignee_id != null ? String(data.assignee_id) : '';
  if (kind === 'assignment') {
    session.world.admin_assignee_id = wanted;
    session.world.clock += 10;
    session.world.conversation_parts.conversation_parts.push({
      id: id + '-asg-' + session.world.clock,
      part_type: 'assignment',
      body: '',
      created_at: session.world.clock,
      author: { id: '10118526', type: 'admin', name: 'Arsal' },
      assigned_to: { id: wanted, type: 'admin' },
    });
    record(200, true, '');
    return Promise.resolve({ status: 200, data: { id: id, type: 'conversation', admin_assignee_id: wanted } });
  }
  session.world.clock += 10;
  const partType = kind === 'note' ? 'note' : 'comment';
  session.world.conversation_parts.conversation_parts.push({
    id: id + '-' + partType + '-' + session.world.clock,
    part_type: partType,
    body: data && data.body ? data.body : '',
    created_at: session.world.clock,
    author: { id: '10118526', type: 'admin', name: 'Arsal' },
  });
  record(200, true, '');
  return Promise.resolve({ status: 200, data: { id: id, type: 'conversation' } });
};

global.__FM_R17_SESSION = session;

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'axios') return axiosMock;
  if (request === 'openai') return openaiMock;
  return resolveFilename.call(this, request, parent, isMain, options);
};

const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function () {
  session.tripwires.push('socket');
  const err = new Error('NETWORK_TRIPWIRE socket');
  err.code = 'TRIPWIRE';
  throw err;
};
dns.lookup = function () {
  session.tripwires.push('dns');
  const err = new Error('NETWORK_TRIPWIRE dns');
  err.code = 'TRIPWIRE';
  throw err;
};
dns.promises = dns.promises || {};
dns.promises.lookup = dns.lookup;

process.env.LUNA_CONTROL_STATE_FILE = path.join(tmp, 'control.json');
process.env.LUNA_OP_STORE_FILE = path.join(tmp, 'ops.json');
process.env.TICKET_STATE_FILE = path.join(tmp, 'tickets.json');
process.env.LUNA_PROMPT_FILE = path.join(__dirname, '../../luna-current/01_runtime/system-prompt.txt');
process.env.MENTION_ROTATE_FILE = path.join(tmp, 'rotate.json');
process.env.FUNDEDELITE_FAQ_PATH = path.join(__dirname, '../../luna-current/01_runtime/fundedelite-faqs.md');
process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-review-token';
process.env.OPENAI_API_KEY = 'synthetic-review-key';
process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';

fs.writeFileSync(process.env.LUNA_CONTROL_STATE_FILE, JSON.stringify({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Bot test'],
  testAllowConversationIds: [],
  config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
}));
fs.writeFileSync(process.env.LUNA_OP_STORE_FILE, '{}');
fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}');

const runtime = require('../../luna-current/01_runtime/index.js');
const policy = require('../../luna-current/02_statePresend/policyEvidence.js');
const handleWebhook = runtime.handleWebhook;

const log = console.log;
const errorLog = console.error;
console.log = function () {};

const ARSAL = '10118526';
let seq = 0;

function stamp(world) {
  world.clock += 10;
  return world.clock;
}

function userAuthor() {
  return { id: 'user-1', type: 'user', name: 'Case User', email: 'case.user@example.test' };
}

function buildWorld(entry, turn) {
  const now = Math.floor(Date.now() / 1000);
  const id = 'c' + (++seq);
  const created = now - (turn.ageSec || 400);
  const parts = [];
  let clock = created + 1;
  if (entry.seed && Array.isArray(entry.seed.parts)) {
    for (const part of entry.seed.parts) {
      clock += 10;
      if (part.type === 'user') {
        parts.push({ id: id + '-su-' + clock, part_type: 'comment', body: part.body, created_at: clock, author: userAuthor() });
      } else if (part.type === 'note') {
        parts.push({
          id: id + '-sn-' + clock,
          part_type: 'note',
          body: '<!-- LUNA_HANDOFF_NOTE --><b>Account:</b> Not provided<br><b>Problem:</b> review',
          created_at: clock,
          author: { id: ARSAL, type: 'admin', name: 'Arsal' },
        });
      } else if (part.type === 'assignment') {
        parts.push({
          id: id + '-sa-' + clock,
          part_type: 'assignment',
          body: '',
          created_at: clock,
          author: { id: ARSAL, type: 'admin', name: 'Arsal' },
          assigned_to: { id: String(part.assignee || 'human-7'), type: 'admin' },
        });
      } else if (part.type === 'human') {
        parts.push({
          id: id + '-sh-' + clock,
          part_type: 'comment',
          body: part.body,
          created_at: clock,
          author: { id: 'human-7', type: 'admin', name: 'Mina Support' },
        });
      }
    }
  }
  if (turn.priorBot) {
    clock += 10;
    parts.push({
      id: id + '-prior',
      part_type: 'comment',
      body: 'I can help with that.',
      created_at: clock,
      author: { id: ARSAL, type: 'admin', name: 'Arsal' },
    });
  }
  if (!entry.seed && turn.text) {
    clock += 10;
    parts.push({
      id: id + '-u0',
      part_type: 'comment',
      body: turn.text,
      created_at: clock,
      author: userAuthor(),
    });
  }
  if (entry.noteBody) {
    clock += 10;
    parts.push({
      id: id + '-spoof',
      part_type: 'note',
      body: entry.noteBody,
      created_at: clock,
      author: {
        id: entry.noteAuthor.id,
        type: entry.noteAuthor.type,
        name: entry.noteAuthor.name,
        email: 'spoof@example.test',
      },
    });
  }
  return {
    id,
    created_at: created,
    updated_at: now,
    admin_assignee_id: (entry.seed && entry.seed.assignee) || ARSAL,
    team_assignee_id: entry.team || '0',
    source: { body: turn.text || '', author: userAuthor() },
    contacts: { contacts: [{ id: 'user-1', name: 'Case User', email: 'case.user@example.test' }] },
    conversation_parts: { conversation_parts: parts },
    clock,
  };
}

function appendUser(world, text) {
  const at = stamp(world);
  world.conversation_parts.conversation_parts.push({
    id: world.id + '-u-' + at,
    part_type: 'comment',
    body: text,
    created_at: at,
    author: userAuthor(),
  });
}

function resetStores() {
  fs.writeFileSync(process.env.LUNA_OP_STORE_FILE, '{}');
  fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}');
}

function applyAfter(world, action) {
  if (action === 'wipe-op') fs.writeFileSync(process.env.LUNA_OP_STORE_FILE, '{}');
  else if (action === 'wipe-ticket') fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}');
  else if (action === 'drop-note') {
    world.conversation_parts.conversation_parts = world.conversation_parts.conversation_parts.filter((part) => part.part_type !== 'note');
  } else if (action === 'add-human-reply') {
    world.conversation_parts.conversation_parts.push({
      id: world.id + '-human-' + stamp(world),
      part_type: 'comment',
      body: 'I have this ticket from here.',
      created_at: world.clock,
      author: { id: 'human-7', type: 'admin', name: 'Mina Support' },
    });
  }
}

function isCustomerModel(call) {
  const messages = call && Array.isArray(call.messages) ? call.messages : [];
  const system = messages.filter((item) => item && item.role === 'system').map((item) => String(item.content || '')).join('\n');
  return system.indexOf('Rewrite the following INTERNAL') === -1;
}

function includesText(bodies, needle) {
  return bodies.some((body) => String(body || '').indexOf(needle) !== -1);
}

function checkExpect(expect, delta, errors) {
  if (!expect) return;
  const publicBodies = delta.calls.filter((call) => call.kind === 'comment' && call.confirmed).map((call) => String(call.body || ''));
  const assign2xx = delta.calls.filter((call) => call.kind === 'assignment' && call.confirmed).length;
  const note2xx = delta.calls.filter((call) => call.kind === 'note' && call.confirmed).length;
  const customerModel = delta.modelCalls.filter(isCustomerModel).length;
  if (Array.isArray(expect.publicExact) && JSON.stringify(publicBodies) !== JSON.stringify(expect.publicExact)) {
    errors.push('publicExact got ' + JSON.stringify(publicBodies).slice(0, 400));
  }
  if (typeof expect.publicCount === 'number' && publicBodies.length !== expect.publicCount) {
    errors.push('publicCount got ' + publicBodies.length + ' ' + JSON.stringify(publicBodies).slice(0, 240));
  }
  if (typeof expect.publicCountMin === 'number' && publicBodies.length < expect.publicCountMin) {
    errors.push('publicCountMin got ' + publicBodies.length);
  }
  if (expect.notSilent && publicBodies.length < 1) errors.push('silent');
  for (const needle of expect.publicIncludes || []) {
    if (needle && !includesText(publicBodies, needle)) errors.push('missing ' + needle.slice(0, 80));
  }
  for (const needle of expect.publicExcludes || []) {
    if (needle && includesText(publicBodies, needle)) errors.push('excluded present ' + needle.slice(0, 80));
  }
  for (const needle of expect.forbidPublic || []) {
    if (needle && includesText(publicBodies, needle)) errors.push('forbidden ' + needle.slice(0, 80));
  }
  if (typeof expect.assign2xx === 'number' && assign2xx !== expect.assign2xx) errors.push('assign2xx got ' + assign2xx);
  if (typeof expect.assign2xxMax === 'number' && assign2xx > expect.assign2xxMax) errors.push('assign2xxMax got ' + assign2xx);
  if (typeof expect.note2xx === 'number' && note2xx !== expect.note2xx) errors.push('note2xx got ' + note2xx);
  if (typeof expect.note2xxMax === 'number' && note2xx > expect.note2xxMax) errors.push('note2xxMax got ' + note2xx);
  if (typeof expect.customerModel === 'number' && customerModel !== expect.customerModel) errors.push('customerModel got ' + customerModel);
  if (typeof expect.customerModelMax === 'number' && customerModel > expect.customerModelMax) errors.push('customerModelMax got ' + customerModel);
  if (expect.canaryAbsent) {
    const blob = JSON.stringify({ calls: delta.calls, modelCalls: delta.modelCalls });
    if (blob.indexOf(CANARY) !== -1) errors.push('canary leaked');
  }
  if (typeof expect.publicCount === 'number' && publicBodies.length > expect.publicCount) errors.push('duplicate-public');
  if (Array.isArray(expect.publicExact) && publicBodies.length > expect.publicExact.length) errors.push('duplicate-public');
  if (typeof expect.assign2xx === 'number' && assign2xx > expect.assign2xx) errors.push('duplicate-assignment');
  if (typeof expect.note2xx === 'number' && note2xx > expect.note2xx) errors.push('duplicate-note');
}

function sliceDelta(calls, modelCalls, callFrom, modelFrom) {
  return { calls: calls.slice(callFrom), modelCalls: modelCalls.slice(modelFrom) };
}

async function runWebhookCase(entry) {
  resetStores();
  const errors = [];
  const turns = entry.turns || [];
  let world = null;
  for (let i = 0; i < turns.length; i += 1) {
    const turn = turns[i];
    if (!world) {
      world = buildWorld(entry, turn);
      if (entry.seed && !turn.replay && turn.text) appendUser(world, turn.text);
    } else if (!turn.replay) appendUser(world, turn.text);
    session.world = world;
    session.script = Object.assign({ note: 'ok', assign: 'ok', comment: 'ok' }, turn.script || {});
    session.modelReply = turn.model || 'ACTION: REPLY\nBODY: I can help with that.';
    const callFrom = session.calls.length;
    const modelFrom = session.modelCalls.length;
    const tripFrom = session.tripwires.length;
    const req = { body: { topic: turn.topic || 'conversation.user.replied', data: { item: { id: world.id } } }, get: function () { return ''; } };
    const res = { statusCode: 0, sendStatus: function (code) { this.statusCode = code; return this; }, status: function (code) { this.statusCode = code; return this; }, json: function (body) { this.body = body; return this; } };
    try {
      await handleWebhook(req, res);
    } catch (err) {
      errors.push('webhook threw ' + (err && err.message));
    }
    if (session.tripwires.length > tripFrom) errors.push('tripwire ' + session.tripwires.slice(tripFrom).join(','));
    const delta = sliceDelta(session.calls, session.modelCalls, callFrom, modelFrom);
    const before = errors.length;
    checkExpect(turn.expect, delta, errors);
    for (let k = before; k < errors.length; k += 1) errors[k] = 'turn ' + i + ' ' + errors[k];
    for (const action of turn.after || []) applyAfter(world, action);
  }
  if (entry.caseExpect) {
    const assignAttempts = session.calls.filter((call) => call.kind === 'assignment').length;
    const publicTotal = session.calls.filter((call) => call.kind === 'comment' && call.confirmed).length;
    if (typeof entry.caseExpect.assignAttemptsMax === 'number' && assignAttempts > entry.caseExpect.assignAttemptsMax) {
      errors.push('assign attempts ' + assignAttempts);
    }
    if (typeof entry.caseExpect.publicTotal === 'number' && publicTotal !== entry.caseExpect.publicTotal) {
      errors.push('public total ' + publicTotal);
    }
  }
  const blob = JSON.stringify(session.calls) + JSON.stringify(session.modelCalls);
  if (entry.canary && blob.indexOf(entry.canary) !== -1) errors.push('canary leaked');
  return errors;
}

function runFigure(entry) {
  const got = policy.unsupportedPublicFigures(entry.draft, entry.evidence).slice().sort();
  const want = (entry.expectBad || []).slice().sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    return ['figures got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)];
  }
  return [];
}

function classify(entry, errors) {
  const text = errors.join(' | ');
  const tags = [];
  if (text.indexOf('canary leaked') !== -1) tags.push('leak');
  if (text.indexOf('duplicate-') !== -1) tags.push('duplicate');
  if (entry.group.indexOf('recovery') === 0) tags.push('recovery');
  if (entry.critical) tags.push('product-critical');
  if (!tags.length) tags.push('other');
  return tags;
}

async function main() {
  const failures = [];
  let passed = 0;
  const started = Date.now();
  for (const entry of sealed.cases) {
    session.calls = [];
    session.modelCalls = [];
    session.tripwires = [];
    let errors = [];
    try {
      if (entry.group === 'figure-policy') errors = runFigure(entry);
      else errors = await runWebhookCase(entry);
    } catch (err) {
      errors = ['runner ' + (err && err.stack || err)];
    }
    if (errors.length) {
      failures.push({ id: entry.id, group: entry.group, lang: entry.lang || '', errors: errors.slice(0, 8), tags: classify(entry, errors) });
    } else passed += 1;
  }
  console.log = log;
  console.error = errorLog;
  const tags = {};
  for (const failure of failures) {
    for (const tag of failure.tags) tags[tag] = (tags[tag] || 0) + 1;
  }
  const summary = {
    seal: sealHash,
    cases: sealed.cases.length,
    recovery: sealed.counts.recovery,
    passed,
    failed: failures.length,
    tags,
    elapsedMs: Date.now() - started,
    failures: failures.slice(0, 80),
  };
  fs.writeFileSync(path.join(ROOT, 'run-summary.json'), JSON.stringify(summary, null, 2));
  log('SEAL', sealHash);
  log('CASES', summary.cases, 'RECOVERY', summary.recovery, 'PASSED', passed, 'FAILED', failures.length);
  log('TAGS', JSON.stringify(tags));
  for (const failure of failures.slice(0, 40)) {
    log('FAIL', failure.id, failure.group, failure.errors.join(' || ').slice(0, 300));
  }
  net.Socket.prototype.connect = origConnect;
  if (failures.length) process.exitCode = 1;
}

main().catch((err) => {
  console.log = log;
  console.error(err && err.stack || err);
  process.exit(1);
});
