'use strict';

/**
 * Independent R10 runner.
 * Calls the frozen handleWebhook with a recording axios adapter and a stub model.
 * No socket is opened. Author tests and review branches are not loaded.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const FREEZE = 'c4553a93f20751b84ebdca5fb21cc7703af84a03';
const ROOT = process.env.R10_FREEZE_ROOT || '/tmp/r10-freeze';
const RUNTIME = path.join(ROOT, 'luna-current/01_runtime');
const ARSAL = '10118526';
const ELITE = '8052954';
const JERRY = '8053416';
const HUMAN = '900002';
const SEAT = '900001';
const RISK = '10675195';
const ESC = '9629759';
const SUPPORT = 9629780;
const TOKEN = 'synthetic-review-token';
const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";

function redactReportText(spec, text) {
  if (spec && spec.expect && spec.expect.spreadExact === true) return '[exact-allowed-template]';
  let out = String(text || '').slice(0, 500);
  for (const canary of (spec && spec.canaries) || []) {
    if (canary) out = out.split(canary).join('[canary]');
  }
  return out;
}

function strip(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function fixedLines() {
  return [
    'A teammate now has this conversation.',
    'یہ گفتگو اب ایک ساتھی کے پاس ہے۔',
    'هذه المحادثة الآن لدى أحد الزملاء.',
    'यह बातचीत अब एक साथी के पास है।',
    'Un collega ha ora questa conversazione.',
  ];
}

function containsFixed(text) {
  const s = strip(text);
  return fixedLines().filter((line) => s.includes(line));
}

function isVerifiedAssignment(post, response) {
  if (!post || !response || response.threw) return false;
  if (!(response.status >= 200 && response.status < 300)) return false;
  const data = response.data;
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return false;
  if (String(data.type || '') === 'error.list') return false;
  if (Array.isArray(data.errors) && data.errors.length) return false;
  let requested = '';
  try {
    requested = String(JSON.parse(post.bytes).assignee_id || '');
  } catch (_) {
    return false;
  }
  const got =
    data.admin_assignee_id != null
      ? String(data.admin_assignee_id)
      : data.assignee_id != null
        ? String(data.assignee_id)
        : '';
  if (!got || got === '0' || got !== requested) return false;
  return true;
}

if (process.argv[2] === '--worker') {
  runWorker().catch((err) => {
    process.stderr.write('WORKER_FATAL ' + (err && err.stack ? err.stack : err) + '\n');
    process.exit(1);
  });
} else {
  main().catch((err) => {
    process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
    process.exit(1);
  });
}

async function runWorker() {
  const casePath = process.argv[3];
  const index = Number(process.argv[4]);
  const phase = Number(process.argv[5] || 0);
  const dir = process.argv[6];
  const pack = JSON.parse(fs.readFileSync(casePath, 'utf8'));
  const spec = pack.cases[index];
  const convId = 'conv-' + spec.id;

  for (const key of Object.keys(process.env)) {
    if (/INTERCOM|OPENAI|SECRET|TOKEN|PASSWORD|API_KEY/i.test(key)) delete process.env[key];
  }
  process.env.INTERCOM_ACCESS_TOKEN = TOKEN;
  process.env.OPENAI_API_KEY = 'sk-synthetic-review';
  process.env.LUNA_CONTROL_STATE_FILE = path.join(dir, 'control.json');
  process.env.LUNA_PROMPT_FILE = path.join(RUNTIME, 'system-prompt.txt');
  process.env.LUNA_OP_STORE_FILE = path.join(dir, 'ops.json');
  process.env.TICKET_STATE_FILE = path.join(dir, 'tickets.json');
  process.env.MENTION_ROTATE_FILE = path.join(dir, 'rotate.json');
  process.env.FUNDEDELITE_FAQ_PATH = path.join(RUNTIME, 'fundedelite-faqs.md');
  process.env.LUNA_TOOLS_ENABLED = '0';
  process.env.MAINTAINER_ENABLED = 'false';
  process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';

  if (phase === 0) {
    const control = {
      paused: !!spec.paused,
      pausedUntil: null,
      aiOff: spec.aiOff ? { [convId]: true } : {},
      testMode: false,
      testAllowNames: ['Bot test'],
      testAllowConversationIds: [],
      config: {
        model: 'gpt-5.6-luna',
        welcomeEnabled: true,
        repliesEnabled: spec.repliesEnabled !== false,
      },
    };
    fs.writeFileSync(process.env.LUNA_CONTROL_STATE_FILE, JSON.stringify(control, null, 2));
    const seed = {};
    if (spec.seed) seed[convId] = Object.assign({}, spec.seed);
    fs.writeFileSync(process.env.TICKET_STATE_FILE, JSON.stringify(seed, null, 2));
    fs.writeFileSync(process.env.MENTION_ROTATE_FILE, JSON.stringify({ recent: [] }));
  }

  installStatePresend();

  const modelState = { queue: (spec.model || []).slice(), prompts: [], calls: 0 };
  const Module = require('module');
  const origRequire = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === 'openai') {
      return class OpenAI {
        constructor() {
          this.chat = {
            completions: {
              create: async (req) => {
                modelState.calls += 1;
                const messages = (req && req.messages) || [];
                modelState.prompts.push(messages.map((m) => String((m && m.content) || '')).join('\n'));
                const next = modelState.queue.length ? modelState.queue.shift() : '';
                return { choices: [{ message: { content: next } }] };
              },
            },
          };
        }
      };
    }
    return origRequire.apply(this, arguments);
  };

  const axios = require(path.join(RUNTIME, 'node_modules/axios'));
  const records = [];
  let turn = phase;
  const convo = buildConversation(spec, convId);
  let crashed = false;

  axios.defaults.adapter = async function recordingAdapter(config) {
    const method = String(config.method || 'get').toLowerCase();
    const url = String(config.url || '');
    let bytes = '';
    if (config.data == null) bytes = '';
    else if (Buffer.isBuffer(config.data)) bytes = config.data.toString('utf8');
    else bytes = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
    const headers = config.headers && config.headers.toJSON ? config.headers.toJSON() : Object.assign({}, config.headers || {});
    const rec = { turn, method, url, bytes, headers, status: 0, data: null, threw: false };
    records.push(rec);
    const host = safeHost(url);
    if (host && host !== 'api.intercom.io' && host !== 'faq.fundedelite.com') {
      rec.unexpectedHost = host;
      rec.status = 403;
      rec.data = '';
      return { data: '', status: 403, statusText: 'blocked', headers: {}, config };
    }
    if (host === 'faq.fundedelite.com') {
      rec.status = 403;
      rec.data = '';
      return { data: '', status: 403, statusText: 'blocked', headers: {}, config };
    }
    const auth = String(headers.Authorization || headers.authorization || '');
    if (auth && auth !== 'Bearer ' + TOKEN) {
      rec.badAuth = true;
    }
    if (method === 'get' && /\/admins\/?$/.test(url)) {
      const data = {
        admins: [
          {
            id: SEAT,
            name: 'Ada Seat',
            email: 'ada.seat@example.test',
            has_inbox_seat: true,
            away_mode_enabled: false,
            team_ids: [SUPPORT],
          },
        ],
      };
      rec.status = 200;
      rec.data = data;
      return { data, status: 200, statusText: 'OK', headers: {}, config };
    }
    if (method === 'get' && /\/admins\//.test(url)) {
      const data = { id: HUMAN, name: 'Nia Reviewer', email: 'nia@example.test' };
      rec.status = 200;
      rec.data = data;
      return { data, status: 200, statusText: 'OK', headers: {}, config };
    }
    if (method === 'get' && /\/conversations\//.test(url)) {
      rec.status = 200;
      rec.data = convo;
      return { data: convo, status: 200, statusText: 'OK', headers: {}, config };
    }
    let body = null;
    try {
      body = bytes ? JSON.parse(bytes) : null;
    } catch (_) {
      body = null;
    }
    const messageType = body && body.message_type;
    const mode = writeMode(spec, turn, messageType);
    if (mode === 'timeout') {
      rec.threw = true;
      rec.status = 0;
      const err = new Error('timeout of 20000ms exceeded');
      err.code = 'ECONNABORTED';
      throw err;
    }
    const scripted = scriptResponse(mode, body);
    rec.status = scripted.status;
    rec.data = scripted.data;
    if (spec.mirrorWrites !== false && mode === 'ok' && scripted.status >= 200 && scripted.status < 300) {
      mirror(convo, messageType, body, scripted.data);
    }
    if (spec.crashAfter === 'note' && phase === 0 && messageType === 'note' && turn === 0) {
      process.exit(70);
    }
    return { data: scripted.data, status: scripted.status, statusText: 'OK', headers: {}, config };
  };

  const http = require('http');
  const https = require('https');
  const net = require('net');
  const dns = require('dns');
  function boom(name) {
    return function () {
      const err = new Error('NETWORK_TRIPWIRE ' + name);
      err.code = 'NETWORK_TRIPWIRE';
      throw err;
    };
  }
  http.request = boom('http.request');
  http.get = boom('http.get');
  https.request = boom('https.request');
  https.get = boom('https.get');
  net.connect = boom('net.connect');
  dns.lookup = function (host, opts, cb) {
    const err = new Error('NETWORK_TRIPWIRE dns ' + host);
    err.code = 'NETWORK_TRIPWIRE';
    if (typeof opts === 'function') return opts(err);
    if (typeof cb === 'function') return cb(err);
    throw err;
  };

  process.chdir(RUNTIME);
  const engine = require(path.join(RUNTIME, 'index.js'));
  const sanitizer = require(path.join(ROOT, 'luna-current/02_statePresend/credentialSanitizer.js'));

  const turns = spec.turns || 1;
  for (let t = phase; t < turns; t += 1) {
    turn = t;
    if (t > 0 && !spec.redelivery) pushUser(convo, spec, t);
    const topic = spec.topic || 'conversation.user.replied';
    const req = { body: { topic, data: { item: { id: convId, type: 'conversation' } } }, get() { return ''; } };
    const res = { statusCode: 0, sendStatus(code) { this.statusCode = code; return this; }, status(code) { this.statusCode = code; return this; }, json(v) { this.body = v; return this; } };
    try {
      await engine.handleWebhook(req, res);
    } catch (err) {
      if (crashed) break;
      throw err;
    }
    if (crashed) break;
  }

  if (crashed) return;

  const result = judge(spec, convId, records, modelState, sanitizer);
  process.stdout.write(JSON.stringify(result) + '\n');
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch (_) {
    return '';
  }
}

function writeMode(spec, turn, messageType) {
  const table = (spec.writesByTurn && spec.writesByTurn[turn]) || spec.writes || {};
  if (messageType === 'note') return table.note || 'ok';
  if (messageType === 'assignment') return table.assignment || 'ok';
  if (messageType === 'comment') return table.comment || 'ok';
  return 'ok';
}

function scriptResponse(mode, body) {
  const messageType = body && body.message_type;
  if (mode === '500') return { status: 500, data: { id: 'e500', type: 'conversation' } };
  if (mode === '422') return { status: 422, data: { type: 'error.list', errors: [{ code: 'invalid', message: 'no' }] } };
  if (mode === 'null') return { status: 200, data: null };
  if (mode === 'errors') {
    return { status: 200, data: { id: 'eerr', type: 'conversation', errors: [{ code: 'bad', message: 'no' }] } };
  }
  if (mode === 'error-list') {
    return { status: 200, data: { type: 'error.list', errors: [{ code: 'bad', message: 'no' }] } };
  }
  if (mode === 'error-list-id') return { status: 200, data: { id: 'elist', type: 'error.list', errors: [] } };
  if (mode === 'wrong-assignee') {
    return { status: 200, data: { id: 'wrong', type: 'conversation', admin_assignee_id: '777777' } };
  }
  if (mode === 'empty-object') return { status: 200, data: {} };
  if (mode === 'array') return { status: 200, data: [] };
  const data = {
    id: 'ok-' + String(messageType || 'x'),
    type: 'conversation',
    conversation_parts: {
      conversation_parts: [
        {
          part_type: messageType === 'note' ? 'note' : messageType === 'assignment' ? 'assignment' : 'comment',
          body: (body && body.body) || '',
          author: { id: ARSAL, type: 'admin' },
        },
      ],
    },
  };
  if (messageType === 'assignment') data.admin_assignee_id = String((body && body.assignee_id) || '');
  return { status: 200, data };
}

function mirror(convo, messageType, body, data) {
  if (!data || typeof data !== 'object') return;
  if (String(data.type || '') === 'error.list') return;
  if (Array.isArray(data.errors) && data.errors.length) return;
  const parts = convo.conversation_parts.conversation_parts;
  const at = Math.floor(Date.now() / 1000);
  if (messageType === 'assignment') {
    convo.admin_assignee_id = data.admin_assignee_id;
    parts.push({
      id: 'mir-asg-' + parts.length,
      part_type: 'assignment',
      body: '',
      created_at: at,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      assigned_to: { id: String(data.admin_assignee_id || ''), type: 'admin' },
    });
    return;
  }
  if (messageType === 'note' || messageType === 'comment') {
    parts.push({
      id: 'mir-' + messageType + '-' + parts.length,
      part_type: messageType,
      body: (body && body.body) || '',
      created_at: at,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    });
  }
}

function buildConversation(spec, convId) {
  const now = Math.floor(Date.now() / 1000);
  const created = now - Number(spec.ageSec == null ? 400 : spec.ageSec);
  const assignee = assigneeId(spec);
  const parts = [];
  let at = created + 5;
  if (spec.priorElite) {
    parts.push(part('prior-elite', 'comment', spec.priorElite, at, { type: 'bot', id: ELITE, name: 'Elite AI' }));
    at += 5;
  }
  if (spec.priorBot) {
    parts.push(part('prior-bot', 'comment', spec.priorBot, at, { type: 'admin', id: ARSAL, name: 'Arsal' }));
    at += 5;
  }
  if (spec.priorHuman) {
    parts.push(part('prior-human', 'comment', spec.priorHuman, at, { type: 'admin', id: HUMAN, name: 'Nia Reviewer' }));
    at += 5;
  }
  for (const extra of spec.extraParts || []) {
    at += 5;
    parts.push(
      part(
        'extra-' + parts.length,
        extra.part_type,
        extra.body || '',
        at,
        extra.author || { type: 'admin', id: HUMAN, name: 'Nia Reviewer' },
        extra.assigned_to
      )
    );
  }
  if (spec.topic === 'conversation.admin.noted') {
    at += 5;
    const author = spec.noteAuthor || { type: 'admin', id: ARSAL, name: 'Arsal', email: 'arsal@example.test' };
    parts.push(part('note-cmd', spec.notePartType || 'note', spec.noteBody || '', at, author));
  } else {
    at += 5;
    parts.push(
      part('part-user-0', spec.partType || 'comment', spec.text || '', at, {
        type: 'user',
        id: 'user-1',
        name: 'Casey Client',
        email: 'casey@example.test',
      })
    );
  }
  const team = spec.team === 'risk' ? RISK : spec.team === 'escalations' ? ESC : 0;
  const convo = {
    type: 'conversation',
    id: convId,
    created_at: created,
    updated_at: now,
    open: spec.open !== false,
    state: spec.state || 'open',
    admin_assignee_id: assignee,
    team_assignee_id: team,
    source: {
      body: spec.text || '',
      created_at: created,
      author: { type: 'user', id: 'user-1', name: 'Casey Client', email: 'casey@example.test' },
    },
    contacts: { contacts: [{ id: 'user-1', name: 'Casey Client', email: 'casey@example.test' }] },
    conversation_parts: { conversation_parts: parts },
  };
  if (spec.assignee === 'ambiguous') {
    convo.admin_assignee_id = 0;
    convo.assignee = { type: 'admin' };
  }
  return convo;
}

function pushUser(convo, spec, turn) {
  const at = Math.floor(Date.now() / 1000) + turn;
  const text = spec.secondText || spec.text || '';
  convo.conversation_parts.conversation_parts.push(
    part('part-user-' + turn, spec.partType || 'comment', text, at, {
      type: 'user',
      id: 'user-1',
      name: 'Casey Client',
      email: 'casey@example.test',
    })
  );
}

function part(id, partType, body, created, author, assigned) {
  const row = {
    id,
    part_type: partType,
    body,
    created_at: created,
    author: author || { type: 'user', id: 'user-1' },
  };
  if (assigned) row.assigned_to = assigned;
  return row;
}

function assigneeId(spec) {
  if (spec.assignee === 'human') return HUMAN;
  if (spec.assignee === 'jerry') return JERRY;
  if (spec.assignee === 'ambiguous' || spec.assignee === 'unassigned') return 0;
  return ARSAL;
}

function judge(spec, convId, records, modelState, sanitizer) {
  const failures = [];
  const posts = records.filter((r) => r.method === 'post' && /\/reply(?:\?|$)/.test(r.url));
  function parsed(rec) {
    try {
      return JSON.parse(rec.bytes || 'null');
    } catch (_) {
      return null;
    }
  }
  const comments = posts.filter((r) => parsed(r) && parsed(r).message_type === 'comment');
  const notes = posts.filter((r) => parsed(r) && parsed(r).message_type === 'note');
  const assignments = posts.filter((r) => parsed(r) && parsed(r).message_type === 'assignment');
  const publicText = comments.map((r) => strip(parsed(r).body)).join('\n');
  const outbound = posts.map((r) => String(parsed(r) && parsed(r).body || '')).join('\n');
  const fixedHits = comments.filter((r) => containsFixed(parsed(r).body).length);
  const exp = spec.expect || {};

  function eq(name, got, want) {
    if (want == null) return;
    if (got !== want) failures.push({ check: name, got, want });
  }
  function max(name, got, want) {
    if (want == null) return;
    if (got > want) failures.push({ check: name, got, want });
  }
  function min(name, got, want) {
    if (want == null) return;
    if (got < want) failures.push({ check: name, got, want });
  }

  eq('comments', comments.length, exp.comments);
  max('commentsMax', comments.length, exp.commentsMax);
  eq('assignments', assignments.length, exp.assignments);
  max('assignmentPostsMax', assignments.length, exp.assignmentPostsMax);
  eq('notes', notes.length, exp.notes);
  min('notesMin', notes.length, exp.notesMin);
  eq('fixed', fixedHits.length, exp.fixed);
  max('fixedPostsMax', fixedHits.length, exp.fixedPostsMax);
  min('publicCountMin', comments.length, exp.publicCountMin);
  min('modelCallsMin', modelState.calls, exp.modelCallsMin);

  if (exp.fixedLine) {
    const bodies = fixedHits.map((r) => strip(parsed(r).body));
    if (!bodies.includes(exp.fixedLine)) failures.push({ check: 'fixedLine', got: bodies, want: exp.fixedLine });
  }
  if (exp.publicEquals != null) {
    if (publicText !== exp.publicEquals) failures.push({ check: 'publicEquals', got: publicText, want: exp.publicEquals });
  }
  for (const needle of exp.publicHas || []) {
    if (!publicText.includes(needle)) failures.push({ check: 'publicHas', got: publicText.slice(0, 400), want: needle });
  }
  for (const needle of exp.publicHasNot || []) {
    if (needle && publicText.includes(needle)) failures.push({ check: 'publicHasNot', got: publicText.slice(0, 400), want: needle });
  }
  if (exp.publicHasAny && exp.publicHasAny.length) {
    if (!exp.publicHasAny.some((needle) => publicText.includes(needle))) {
      failures.push({ check: 'publicHasAny', got: publicText.slice(0, 400), want: exp.publicHasAny });
    }
  }
  if (exp.forbidLoneHedge && publicText === HEDGE) {
    failures.push({ check: 'forbidLoneHedge', got: publicText });
  }
  if (exp.spreadExact === true) {
    const bodies = comments.map((r) => String(parsed(r).body || ''));
    if (bodies.length !== 1 || !sanitizer.isExactAllowedTemplate(bodies[0])) {
      failures.push({ check: 'spreadExact', got: bodies.map((b) => sanitizer.sha256Text(b)) });
    }
  }
  if (exp.spreadExact === false) {
    for (const rec of comments) {
      if (sanitizer.isExactAllowedTemplate(String(parsed(rec).body || ''))) {
        failures.push({ check: 'spreadExactFalse' });
      }
    }
  }
  const promptBlob = modelState.prompts.join('\n');
  for (const needle of exp.promptHasNot || []) {
    if (needle && promptBlob.includes(needle)) failures.push({ check: 'promptHasNot', want: needle });
  }
  for (const needle of exp.outboundHasNot || []) {
    if (needle && outbound.includes(needle)) failures.push({ check: 'outboundHasNot', want: needle });
  }
  for (const canary of spec.canaries || []) {
    if (canary && (publicText.includes(canary) || outbound.includes(canary))) {
      failures.push({ check: 'leak', want: canary, klass: 'leak' });
    }
  }
  if (exp.order) {
    const kinds = posts
      .map((r) => parsed(r) && parsed(r).message_type)
      .filter((k) => k === 'note' || k === 'assignment' || k === 'comment');
    const want = exp.order.join(',');
    if (kinds.join(',') !== want && !kinds.join(',').includes(want)) {
      failures.push({ check: 'order', got: kinds, want: exp.order });
    }
  }

  let verified = false;
  for (const rec of posts) {
    const body = parsed(rec);
    const kind = body && body.message_type;
    if (kind === 'assignment' && isVerifiedAssignment(rec, rec)) verified = true;
    if (kind === 'comment' && containsFixed(body && body.body).length && !verified) {
      failures.push({ check: 'fixed-without-verified-assignment', klass: 'product-critical' });
    }
  }
  for (const rec of records) {
    if (rec.unexpectedHost) failures.push({ check: 'unexpected-host', got: rec.unexpectedHost, klass: 'defect' });
    if (rec.badAuth) failures.push({ check: 'bad-auth', klass: 'product-critical' });
    if (String(rec.bytes || '').includes('sk-') && !String(rec.bytes).includes('sk-synthetic-review')) {
      failures.push({ check: 'secret-looking-body', klass: 'leak' });
    }
  }

  let aiOff = null;
  try {
    const control = JSON.parse(fs.readFileSync(process.env.LUNA_CONTROL_STATE_FILE, 'utf8'));
    aiOff = !!(control.aiOff && control.aiOff[convId]);
  } catch (_) {
    aiOff = null;
  }
  if (exp.aiOff != null && aiOff !== exp.aiOff) failures.push({ check: 'aiOff', got: aiOff, want: exp.aiOff });

  return {
    id: spec.id,
    group: spec.group,
    klass: spec.klass,
    ok: failures.length === 0,
    failures,
    counts: { comments: comments.length, notes: notes.length, assignments: assignments.length, fixed: fixedHits.length, modelCalls: modelState.calls, http: records.length },
    publicText: redactReportText(spec, publicText),
    jerryOwnerAdmin: !!spec.jerryOwnerAdmin,
  };
}

function installStatePresend() {
  // presendMega.js requires ../repeatedClientQuestion with no fallback. That resolves
  // only when the pack is a real directory beside index.js, which is how the runtime
  // loads ./statePresend. A symlink is realpath'd and breaks that require.
  const dest = path.join(RUNTIME, 'statePresend');
  const src = path.join(ROOT, 'luna-current/02_statePresend');
  if (fs.existsSync(dest)) {
    if (!fs.lstatSync(dest).isSymbolicLink()) return;
    fs.unlinkSync(dest);
  }
  fs.cpSync(src, dest, { recursive: true });
}

function spawnWorker(casePath, index, phase, dir) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [__filename, '--worker', casePath, String(index), String(phase), dir], {
      cwd: RUNTIME,
      env: process.env,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (buf) => {
      out += buf.toString();
    });
    child.stderr.on('data', (buf) => {
      err += buf.toString();
    });
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

async function main() {
  const casePath = path.resolve(process.argv[2] || '');
  if (!process.argv[2]) {
    console.error('usage: node run-sealed.js sealed-cases.json');
    process.exit(2);
  }
  const pack = JSON.parse(fs.readFileSync(casePath, 'utf8'));
  if (pack.freeze !== FREEZE) throw new Error('case file freeze mismatch');
  installStatePresend();
  const only = process.env.R10_ONLY ? new Set(process.env.R10_ONLY.split(',')) : null;
  const indexes = [];
  pack.cases.forEach((c, i) => {
    if (!only || only.has(c.id) || only.has(c.group)) indexes.push(i);
  });
  const results = new Array(pack.cases.length);
  const concurrency = Number(process.env.R10_CONCURRENCY || 3);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const n = cursor;
      cursor += 1;
      if (n >= indexes.length) return;
      const i = indexes[n];
      const spec = pack.cases[i];
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r10rev-'));
      let phase = 0;
      let last = null;
      for (;;) {
        const run = await spawnWorker(casePath, i, phase, dir);
        if (run.code === 70) {
          phase += 1;
          if (phase > 3) {
            last = { id: spec.id, group: spec.group, klass: spec.klass, ok: false, failures: [{ check: 'crash-loop' }], stderr: run.err.slice(-1500) };
            break;
          }
          continue;
        }
        const line = run.out.trim().split('\n').filter(Boolean).pop();
        if (run.code !== 0 || !line) {
          last = {
            id: spec.id,
            group: spec.group,
            klass: 'defect',
            ok: false,
            failures: [{ check: 'worker', got: run.code, detail: ((run.err || '').slice(0, 500) + '\n...\n' + (run.err || '').slice(-400)).slice(0, 1200) }],
          };
          break;
        }
        try {
          last = JSON.parse(line);
        } catch (e) {
          last = { id: spec.id, group: spec.group, klass: 'defect', ok: false, failures: [{ check: 'bad-json', detail: line.slice(0, 300) }] };
        }
        break;
      }
      results[i] = last;
      const mark = last.ok ? 'PASS' : 'FAIL';
      process.stderr.write(mark + ' ' + spec.id + '\n');
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const ran = results.filter(Boolean);
  const summary = summarize(ran);
  const outPath = process.argv[3] || path.join(path.dirname(casePath), 'results.json');
  fs.writeFileSync(outPath, JSON.stringify({ freeze: FREEZE, summary, results: ran }, null, 2));
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(summary.productCritical || summary.leaks || summary.regressions ? 1 : 0);
}

function summarize(results) {
  const buckets = { 'product-critical': 0, 'unnecessary-handoff': 0, defect: 0, 'over-block': 0, regression: 0, leak: 0 };
  const failed = [];
  for (const row of results) {
    if (row.ok) continue;
    const classes = new Set();
    for (const f of row.failures || []) {
      if (f.klass === 'leak' || f.check === 'leak') classes.add('leak');
      else if (f.klass) classes.add(f.klass);
    }
    if (!classes.size) classes.add(row.klass || 'defect');
    if (classes.has('leak')) classes.add('product-critical');
    for (const k of classes) if (buckets[k] != null) buckets[k] += 1;
    failed.push({ id: row.id, group: row.group, classes: Array.from(classes), failures: row.failures, publicText: row.publicText, counts: row.counts });
  }
  return {
    ran: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: failed.length,
    productCritical: buckets['product-critical'],
    leaks: buckets.leak,
    regressions: buckets.regression,
    unnecessaryHandoff: buckets['unnecessary-handoff'],
    defects: buckets.defect,
    overBlock: buckets['over-block'],
    failedIds: failed.map((f) => f.id),
    failures: failed,
  };
}
