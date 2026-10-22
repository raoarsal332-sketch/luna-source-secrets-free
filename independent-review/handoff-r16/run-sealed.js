'use strict';

/**
 * Independent runner. Loads the real handleWebhook from a candidate checkout,
 * records exact Intercom payloads, stubs the model, and tripwires the network.
 * It does not deploy, merge, or call a live service.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const os = require('os');

const ARSAL = '10118526';
const ELITE = '8052954';
const TEAMMATE = '7007001';
const USER = 'user-1';
const RISK_TEAM = '10675195';
const ESC_TEAM = '9629759';
const SUPPORT_TEAM = 9629780;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}

const casesPath = arg('--cases', path.join(__dirname, 'sealed-cases.json'));
const sealPath = arg('--seal', path.join(__dirname, 'seal-sha256.txt'));
const root = arg('--root', '');
const outPath = arg('--out', path.join(os.tmpdir(), 'sealed-results.json'));
const label = arg('--label', 'candidate');

if (!root) {
  console.error('missing --root');
  process.exit(2);
}

const rawCases = fs.readFileSync(casesPath);
const actualSha = crypto.createHash('sha256').update(rawCases).digest('hex');
const expectedSha = fs.readFileSync(sealPath, 'utf8').trim().split(/\s+/)[0];
if (actualSha !== expectedSha) {
  console.error('SEAL MISMATCH', actualSha, 'expected', expectedSha);
  process.exit(2);
}

const doc = JSON.parse(rawCases.toString('utf8'));
const cases = doc.cases;

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}
function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}
function copyTree(src, dest, skip) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip && skip.has(ent.name)) continue;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyTree(from, to, skip);
    else if (ent.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(from), to);
    else copyFile(from, to);
  }
}

const runtimeSrc = path.join(root, 'luna-current', '01_runtime');
const stateSrc = path.join(root, 'luna-current', '02_statePresend');
const maintainerSrc = path.join(root, 'luna-current', '03_luna-maintainer');
const mirror = path.join(os.tmpdir(), 'luna-sealed-mirror-' + label + '-' + process.pid);
rmrf(mirror);
copyTree(runtimeSrc, mirror, new Set(['node_modules']));
fs.symlinkSync(stateSrc, path.join(mirror, 'statePresend'));
fs.symlinkSync(maintainerSrc, path.join(mirror, 'luna-maintainer'));
const nm = path.join(runtimeSrc, 'node_modules');
if (fs.existsSync(nm)) fs.symlinkSync(nm, path.join(mirror, 'node_modules'));

const stateDir = path.join(os.tmpdir(), 'luna-sealed-state-' + label + '-' + process.pid);
rmrf(stateDir);
fs.mkdirSync(stateDir, { recursive: true });
const controlFile = path.join(stateDir, 'control.json');
const ticketFile = path.join(stateDir, 'tickets.json');
const opFile = path.join(stateDir, 'ops.json');
const rotateFile = path.join(stateDir, 'rotate.json');
fs.writeFileSync(controlFile, JSON.stringify({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Bot test'],
  testAllowConversationIds: [],
  config: { model: 'stub-model', welcomeEnabled: true, repliesEnabled: true },
}, null, 2));
fs.writeFileSync(ticketFile, '{}');
fs.writeFileSync(opFile, '{}');
fs.writeFileSync(rotateFile, JSON.stringify({ recent: [] }));

process.env.LUNA_CONTROL_STATE_FILE = controlFile;
process.env.TICKET_STATE_FILE = ticketFile;
process.env.LUNA_OP_STORE_FILE = opFile;
process.env.MENTION_ROTATE_FILE = rotateFile;
process.env.LUNA_PROMPT_FILE = path.join(mirror, 'system-prompt.txt');
process.env.FUNDEDELITE_FAQ_PATH = path.join(mirror, 'fundedelite-faqs.md');
process.env.OPENAI_API_KEY = 'stub-not-a-secret';
process.env.INTERCOM_ACCESS_TOKEN = 'stub-not-a-secret';
process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';
process.env.LUNA_PRESEND_MODE = 'enforce';
delete process.env.INTERCOM_WEBHOOK_SECRET;
delete process.env.INTERCOM_CLIENT_SECRET;
delete process.env.CONTROL_SECRET;

const tripwire = [];
function boom(name) {
  return function blocked() {
    const detail = name + ' ' + JSON.stringify(arguments[0] && arguments[0].host ? arguments[0].host : arguments[0]).slice(0, 180);
    tripwire.push(detail);
    throw new Error('NETWORK_TRIPWIRE ' + detail);
  };
}
const net = require('net');
const dns = require('dns');
const http = require('http');
const https = require('https');
const cp = require('child_process');
net.Socket.prototype.connect = boom('socket');
dns.lookup = boom('dns.lookup');
if (dns.promises) dns.promises.lookup = boom('dns.promises.lookup');
http.request = boom('http.request');
http.get = boom('http.get');
https.request = boom('https.request');
https.get = boom('https.get');
cp.spawn = boom('spawn');
cp.exec = boom('exec');
cp.execFile = boom('execFile');
cp.fork = boom('fork');

const recorded = [];
let modelPrompts = [];
let current = null;

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
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function adminList() {
  return {
    admins: [{
      id: TEAMMATE,
      name: 'Nadia Lane',
      email: 'nadia.lane@example.test',
      has_inbox_seat: true,
      away_mode_enabled: false,
      team_ids: [SUPPORT_TEAM],
    }],
  };
}

function outcomeFor(op) {
  const turn = current && current.turn;
  const script = (turn && turn.script) || {};
  const spec = Object.prototype.hasOwnProperty.call(script, op) ? script[op] : 'ok';
  return spec;
}

function applyOutcome(op, data) {
  const spec = outcomeFor(op);
  const conv = current.conv;
  if (spec === 'timeout') {
    const err = new Error('timeout');
    err.code = 'ETIMEDOUT';
    throw err;
  }
  if (spec === '500') return { status: 500, data: { type: 'error.list', errors: [{ code: 'server_error', message: 'synthetic' }] } };
  if (spec === '422') return { status: 422, data: { type: 'error.list', errors: [{ code: 'parameter_invalid', message: 'synthetic' }] } };
  if (spec === '429') return { status: 429, data: { type: 'error.list', errors: [{ code: 'rate_limit', message: 'synthetic' }] } };
  if (spec === 'wrong-seat') {
    return { status: 200, data: { id: conv.id, type: 'conversation', admin_assignee_id: ARSAL } };
  }
  if (spec === 'error-list') {
    return { status: 200, data: { id: conv.id, type: 'error.list', errors: [{ code: 'synthetic', message: 'not applied' }] } };
  }
  if (spec === 'null-data') return { status: 200, data: null };
  if (spec !== 'ok') return { status: 500, data: { type: 'error.list', errors: [{ message: 'unknown spec' }] } };

  const now = Math.floor(Date.now() / 1000);
  if (op === 'note') {
    conv.conversation_parts.conversation_parts.push({
      id: 'note-' + now + '-' + recorded.length,
      part_type: 'note',
      author: { id: ARSAL, type: 'admin', name: 'Arsal' },
      body: data.body,
      created_at: now,
    });
  } else if (op === 'assignment') {
    conv.admin_assignee_id = TEAMMATE;
    conv.conversation_parts.conversation_parts.push({
      id: 'asg-' + now + '-' + recorded.length,
      part_type: 'assignment',
      author: { id: ARSAL, type: 'admin', name: 'Arsal' },
      body: '',
      assigned_to: { id: TEAMMATE, type: 'admin' },
      assignee_id: TEAMMATE,
      created_at: now,
    });
  } else if (op === 'comment') {
    conv.conversation_parts.conversation_parts.push({
      id: 'cmt-' + now + '-' + recorded.length,
      part_type: 'comment',
      author: { id: ARSAL, type: 'admin', name: 'Arsal' },
      body: data.body,
      created_at: now,
    });
    if (current.landed) current.landed.comments.push(data);
  }
  if (op === 'assignment' && current.landed) current.landed.assigns.push(data);
  const body = { id: conv.id, type: 'conversation', admin_assignee_id: conv.admin_assignee_id };
  return { status: 200, data: body };
}

async function handleAxios(method, url, data) {
  const m = String(method || 'get').toLowerCase();
  const u = String(url || '');
  const entry = { method: m, url: u, data: data == null ? null : JSON.parse(JSON.stringify(data)) };
  recorded.push(entry);
  if (/faq\.fundedelite\.com/i.test(u) || /fundedelite\.com/i.test(u)) {
    return { status: 404, data: '' };
  }
  if (u === 'https://api.intercom.io/admins') return { status: 200, data: adminList() };
  if (u === 'https://api.intercom.io/conversations/search') return { status: 200, data: { conversations: [] } };
  const convMatch = u.match(/^https:\/\/api\.intercom\.io\/conversations\/([^/]+)$/);
  if (m === 'get' && convMatch) {
    if (!current || String(current.conv.id) !== String(convMatch[1])) {
      return { status: 404, data: { type: 'error.list', errors: [{ message: 'missing' }] } };
    }
    return { status: 200, data: JSON.parse(JSON.stringify(current.conv)) };
  }
  const replyMatch = u.match(/^https:\/\/api\.intercom\.io\/conversations\/([^/]+)\/reply$/);
  if (m === 'post' && replyMatch) {
    const op = data && data.message_type ? data.message_type : 'comment';
    return applyOutcome(op, data || {});
  }
  tripwire.push('axios ' + m + ' ' + u);
  throw new Error('NETWORK_TRIPWIRE axios ' + m + ' ' + u);
}

function axiosStub(config) {
  if (typeof config === 'string') return handleAxios('get', config, null);
  return handleAxios(config.method || 'get', config.url, config.data);
}
axiosStub.get = (url) => handleAxios('get', url, null);
axiosStub.post = (url, data) => handleAxios('post', url, data);
axiosStub.create = () => axiosStub;

class OpenAIStub {
  constructor() {
    this.chat = {
      completions: {
        create: async (req) => {
          modelPrompts.push(req);
          const sys = ((req && req.messages) || []).map((m) => String(m.content || '')).join('\n');
          if (/Rewrite the following INTERNAL/i.test(sys)) {
            const user = ((req.messages || []).filter((m) => m.role === 'user').pop() || {}).content || '';
            return { choices: [{ message: { content: String(user).replace(/password:\s*\S+/ig, 'password: [redacted]') } }] };
          }
          const scripted = current && current.model;
          return { choices: [{ message: { content: scripted || 'ACTION: REPLY\nBODY: I can help with that.' } }] };
        },
      },
    };
  }
}

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'axios') return path.join(stateDir, 'axios-stub.js');
  if (request === 'openai') return path.join(stateDir, 'openai-stub.js');
  return resolveFilename.call(this, request, parent, isMain, options);
};
fs.writeFileSync(path.join(stateDir, 'axios-stub.js'), 'module.exports = global.__SEALED_AXIOS;\n');
fs.writeFileSync(path.join(stateDir, 'openai-stub.js'), 'module.exports = global.__SEALED_OPENAI;\n');
global.__SEALED_AXIOS = axiosStub;
global.__SEALED_OPENAI = OpenAIStub;

const engine = require(path.join(mirror, 'index.js'));

function blankConv(id, opts) {
  const created = Math.floor(Date.now() / 1000) - 3600;
  const team = opts.team === 'risk' ? RISK_TEAM : opts.team === 'escalations' ? ESC_TEAM : '0';
  const conv = {
    id,
    type: 'conversation',
    created_at: created,
    updated_at: created,
    admin_assignee_id: opts.assignee || ARSAL,
    team_assignee_id: team,
    contacts: { contacts: [{ id: 'ct-1', type: 'user', name: 'Bot test', email: 'bot.test@example.test' }] },
    source: {
      id: 'src-' + id,
      body: '',
      author: { type: 'user', id: USER, name: 'Bot test' },
      created_at: created,
    },
    conversation_parts: { conversation_parts: [] },
  };
  let t = created + 10;
  if (opts.priorBot) {
    conv.conversation_parts.conversation_parts.push({
      id: 'prior-bot-' + id,
      part_type: 'comment',
      author: { id: ARSAL, type: 'admin', name: 'Arsal' },
      body: opts.priorBot,
      created_at: t,
    });
    t += 5;
  }
  if (opts.priorHuman) {
    conv.conversation_parts.conversation_parts.push({
      id: 'prior-human-' + id,
      part_type: 'comment',
      author: { id: TEAMMATE, type: 'admin', name: 'Nadia Lane' },
      body: opts.priorHuman,
      created_at: t,
    });
  }
  return conv;
}

function wipe(kind, convId) {
  if (kind === 'ticket' || kind === 'both') {
    const all = JSON.parse(fs.readFileSync(ticketFile, 'utf8'));
    delete all[String(convId)];
    fs.writeFileSync(ticketFile, JSON.stringify(all));
  }
  if (kind === 'op' || kind === 'both') {
    const all = JSON.parse(fs.readFileSync(opFile, 'utf8'));
    for (const key of Object.keys(all)) {
      const rec = all[key];
      if (key.includes(String(convId)) || (rec && String(rec.conversationId || '') === String(convId))) delete all[key];
    }
    fs.writeFileSync(opFile, JSON.stringify(all));
  }
}

function fakeRes() {
  return {
    statusCode: 0,
    body: null,
    sendStatus(code) { this.statusCode = code; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function evalCase(item, stats) {
  const expect = item.expect || {};
  const reasons = [];
  const visible = stats.successComments.map((c) => stripHtml(c.data && c.data.body));
  if (expect.successComments != null && visible.length !== expect.successComments) {
    reasons.push('successComments ' + visible.length + ' != ' + expect.successComments);
  }
  if (expect.successCommentsMin != null && visible.length < expect.successCommentsMin) {
    reasons.push('successComments ' + visible.length + ' < ' + expect.successCommentsMin);
  }
  if (expect.successCommentsMax != null && visible.length > expect.successCommentsMax) {
    reasons.push('successComments ' + visible.length + ' > ' + expect.successCommentsMax);
  }
  if (expect.successAssigns != null && stats.successAssigns.length !== expect.successAssigns) {
    reasons.push('successAssigns ' + stats.successAssigns.length + ' != ' + expect.successAssigns);
  }
  if (expect.successAssignsMax != null && stats.successAssigns.length > expect.successAssignsMax) {
    reasons.push('successAssigns ' + stats.successAssigns.length + ' > ' + expect.successAssignsMax);
  }
  if (expect.assignPostsMax != null && stats.assignPosts.length > expect.assignPostsMax) {
    reasons.push('assignPosts ' + stats.assignPosts.length + ' > ' + expect.assignPostsMax);
  }
  if (expect.commentPostsMax != null && stats.commentPosts.length > expect.commentPostsMax) {
    reasons.push('commentPosts ' + stats.commentPosts.length + ' > ' + expect.commentPostsMax);
  }
  if (expect.notePostsMax != null && stats.notePosts.length > expect.notePostsMax) {
    reasons.push('notePosts ' + stats.notePosts.length + ' > ' + expect.notePostsMax);
  }
  if (expect.publicExact) {
    const got = visible.join(' || ');
    const want = expect.publicExact.join(' || ');
    if (got !== want) reasons.push('publicExact got ' + JSON.stringify(visible) + ' want ' + JSON.stringify(expect.publicExact));
  }
  const blob = visible.join('\n');
  for (const bit of expect.publicIncludesAll || []) {
    if (!blob.includes(bit)) reasons.push('missing ' + JSON.stringify(bit));
  }
  for (const bit of expect.publicExcludes || []) {
    if (blob.includes(bit)) reasons.push('excluded text present ' + JSON.stringify(bit));
  }
  const leakHay = JSON.stringify({
    posts: stats.notePosts.concat(stats.assignPosts, stats.commentPosts),
    prompts: modelPrompts,
  });
  for (const secret of expect.leaks || []) {
    if (leakHay.includes(secret)) reasons.push('leak ' + secret);
  }
  if (tripwire.length) reasons.push('tripwire ' + tripwire[0]);
  const duplicate = (expect.successComments === 1 && visible.length > 1) ||
    (visible.length > 1 && visible.every((v) => v === visible[0]) && expect.successComments !== visible.length);
  if (duplicate) reasons.push('duplicate public line');
  return { pass: reasons.length === 0, reasons, visible, duplicate };
}

async function runCase(item, index) {
  const beforeTrip = tripwire.length;
  const startRec = recorded.length;
  const startPrompt = modelPrompts.length;
  const landed = { comments: [], assigns: [] };
  const id = 'conv-' + index + '-' + item.id.replace(/[^a-z0-9-]+/gi, '').slice(0, 40);
  fs.writeFileSync(rotateFile, JSON.stringify({ recent: [] }));
  const conv = blankConv(id, item);
  const logs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => { logs.push(a.map(String).join(' ')); };
  console.error = (...a) => { logs.push(a.map(String).join(' ')); };
  try {
    for (const turn of item.turns || []) {
      if (turn.wipe) wipe(turn.wipe, id);
      if (turn.restart) wipe('ticket', id);
      if (turn.dropNotes) {
        conv.conversation_parts.conversation_parts = conv.conversation_parts.conversation_parts.filter((p) => p.part_type !== 'note');
      }
      const now = Math.floor(Date.now() / 1000);
      if (turn.seedHuman) {
        conv.conversation_parts.conversation_parts.push({
          id: 'human-' + now,
          part_type: 'comment',
          author: { id: TEAMMATE, type: 'admin', name: 'Nadia Lane' },
          body: 'I have this conversation.',
          created_at: now,
        });
      }
      current = { conv, turn, model: item.model || '', landed };
      if (turn.kind === 'admin-note') {
        conv.conversation_parts.conversation_parts.push({
          id: 'auth-' + now + '-' + recorded.length,
          part_type: turn.partType || 'note',
          author: turn.noteAuthor || { id: USER, type: 'user', name: 'Arsal' },
          body: turn.text || '',
          created_at: now + 1,
        });
        const req = { body: { topic: 'conversation.admin.noted', data: { item: conv } }, get() { return ''; }, headers: {} };
        await engine.handleWebhook(req, fakeRes());
      } else {
        const part = {
          id: 'user-' + now + '-' + recorded.length,
          part_type: 'comment',
          author: { id: USER, type: 'user', name: 'Bot test' },
          body: turn.text || '',
          created_at: now + 1,
        };
        conv.conversation_parts.conversation_parts.push(part);
        conv.source.body = turn.text || '';
        conv.updated_at = now + 1;
        const topic = turn.topic || 'conversation.user.replied';
        const req = { body: { topic, data: { item: conv } }, get() { return ''; }, headers: {} };
        await engine.handleWebhook(req, fakeRes());
      }
    }
  } catch (err) {
    logs.push('THREW ' + (err && err.stack || err));
  } finally {
    console.log = origLog;
    console.error = origErr;
    current = null;
  }
  const slice = recorded.slice(startRec);
  const stats = {
    notePosts: slice.filter((e) => e.data && e.data.message_type === 'note'),
    assignPosts: slice.filter((e) => e.data && e.data.message_type === 'assignment'),
    commentPosts: slice.filter((e) => e.data && e.data.message_type === 'comment'),
    successComments: landed.comments,
    successAssigns: landed.assigns,
  };
  const judged = evalCase(item, stats);
  const newTrip = tripwire.slice(beforeTrip);
  if (newTrip.length && !judged.reasons.some((r) => r.startsWith('tripwire'))) judged.reasons.push('tripwire ' + newTrip[0]);
  judged.pass = judged.reasons.length === 0;
  return {
    id: item.id,
    contract: item.contract,
    bucket: item.bucket,
    recovery: !!item.recovery,
    pass: judged.pass,
    reasons: judged.reasons,
    visible: judged.visible,
    duplicate: judged.duplicate || judged.reasons.some((r) => r.includes('duplicate')),
    leak: judged.reasons.some((r) => r.startsWith('leak')),
    assignPosts: stats.assignPosts.length,
    commentPosts: stats.commentPosts.length,
    notePosts: stats.notePosts.length,
    prompts: modelPrompts.length - startPrompt,
    logTail: logs.slice(-12),
  };
}

(async () => {
  const results = [];
  for (let i = 0; i < cases.length; i += 1) {
    if (i % 40 === 0) process.stderr.write('case ' + i + '/' + cases.length + '\n');
    results.push(await runCase(cases[i], i));
  }
  const failed = results.filter((r) => !r.pass);
  const summary = {
    label,
    sha256: actualSha,
    cases: results.length,
    recovery: results.filter((r) => r.recovery).length,
    failed: failed.length,
    leaks: results.filter((r) => r.leak).length,
    duplicates: results.filter((r) => r.duplicate).length,
    recoveryFailed: results.filter((r) => r.recovery && !r.pass).length,
    tripwire: tripwire.length,
    byBucket: {},
  };
  for (const r of results) {
    const b = summary.byBucket[r.bucket] || { pass: 0, fail: 0 };
    if (r.pass) b.pass += 1; else b.fail += 1;
    summary.byBucket[r.bucket] = b;
  }
  fs.writeFileSync(outPath, JSON.stringify({ summary, failed, results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log('WROTE', outPath);
})().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
