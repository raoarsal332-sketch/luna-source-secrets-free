'use strict';

/**
 * Independent R9 review runner.
 * Loads the frozen guard, then the scratch index.js with the public-sends diff
 * applied. Intercom and OpenAI are replaced before the runtime loads.
 * No production, VPS, secrets, or customer data.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const Module = require('module');

const REVIEW_DIR = __dirname;
const REPO = path.resolve(REVIEW_DIR, '../../../..');
const SCRATCH = process.env.R9_SCRATCH || '/tmp/r9-scratch';
const GUARD_PATH = path.join(SCRATCH, 'luna-current/10_synthetic_lanes/t800-payout-r9/payoutClaimGuard.js');
const INDEX_PATH = path.join(SCRATCH, 'luna-current/01_runtime/index.js');
const SUMS_PATH = path.join(SCRATCH, 'luna-current/10_synthetic_lanes/t800-payout-r9/SHA256SUMS.txt');
const CASES_PATH = path.join(REVIEW_DIR, 'sealed-cases.js');
const SEAL_PATH = path.join(REVIEW_DIR, 'SEAL.sha256');
const HEDGE = "I can't confirm that. Our team will confirm.";
const ARSAL_ID = '10118526';
const ELITE_AI_ID = '8052954';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

function verifyFrozenSums() {
  const lines = fs.readFileSync(SUMS_PATH, 'utf8').trim().split(/\n/);
  const out = [];
  for (const line of lines) {
    const m = line.match(/^([a-f0-9]{64})\s+(.+)$/);
    if (!m) throw new Error('bad sums line ' + line);
    const rel = m[2].trim();
    const abs = path.join(SCRATCH, rel);
    const got = sha256File(abs);
    out.push({ file: rel, expected: m[1], got, ok: got === m[1] });
  }
  return out;
}

function verifySeal() {
  const got = sha256File(CASES_PATH);
  const expected = fs.readFileSync(SEAL_PATH, 'utf8').trim().split(/\s+/)[0];
  return { file: 'sealed-cases.js', expected, got, ok: got === expected };
}

function runGuardCases() {
  const cases = require(CASES_PATH);
  const guard = require(GUARD_PATH);
  const rows = [];
  for (const c of cases) {
    let out;
    let threw = null;
    try {
      out = guard.guardPublicBody(c.draft, { messages: c.messages || [] });
    } catch (e) {
      threw = e && e.message;
    }
    const body = out && out.body;
    const dropped = !out || out.send !== true || out.silent === true || !body;
    let ok = false;
    let failure = null;
    if (threw) {
      failure = 'throw';
    } else if (c.expect === 'hold') {
      ok = !dropped && body === HEDGE;
      if (!ok) failure = dropped ? 'silent_drop' : (body === c.draft ? 'unsupported_or_contradiction' : 'partial_or_other');
    } else if (c.expect === 'allow') {
      ok = !dropped && body === c.draft && out.replaced === false;
      if (!ok) {
        if (dropped) failure = 'silent_drop';
        else if (body === HEDGE) failure = 'false_hold';
        else failure = 'mutated';
      }
    } else if (c.expect === 'visible') {
      ok = !dropped;
      if (!ok) failure = 'silent_drop';
    } else {
      failure = 'bad_expect';
    }
    rows.push({
      id: c.id,
      class: c.class,
      lang: c.lang,
      expect: c.expect,
      ok,
      failure,
      reason: out && out.reason,
      replaced: out && out.replaced,
      silent: out && out.silent,
      send: out && out.send,
      body,
      why: c.why,
    });
  }
  return rows;
}

function installIsolatedTransport() {
  const recorded = [];
  const convos = new Map();
  const scripted = [];
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === 'openai') {
      return class OpenAI {
        constructor() {
          this.chat = {
            completions: {
              create: async () => {
                const content = scripted.shift() || 'ACTION: REPLY\nBODY: Hello.';
                recorded.push({ via: 'openai', content });
                return { choices: [{ message: { content } }] };
              },
            },
          };
        }
      };
    }
    if (id === 'axios') {
      const axios = function axiosFn(cfg) {
        recorded.push({ via: 'axios', method: (cfg && cfg.method) || 'get', url: cfg && cfg.url, data: cfg && cfg.data });
        const url = String((cfg && cfg.url) || '');
        if (/intercom\.io|openai\.com/i.test(url)) {
          return Promise.resolve({ status: 401, data: { blocked: true } });
        }
        return Promise.reject(new Error('outbound blocked ' + url));
      };
      axios.get = (url) => axios({ method: 'get', url });
      axios.post = (url, data) => axios({ method: 'post', url, data });
      axios.create = () => axios;
      return axios;
    }
    return originalRequire.apply(this, arguments);
  };
  // Refuse any raw socket to Intercom or OpenAI if a dependency bypasses the mocks.
  const origRequest = http.request;
  http.request = function (options, cb) {
    const host = String((options && (options.hostname || options.host)) || '');
    if (/intercom|openai/i.test(host)) {
      throw new Error('blocked network host ' + host);
    }
    return origRequest.apply(this, arguments);
  };
  return { recorded, convos, scripted, originalRequire };
}

function commentPayloads(recorded) {
  return recorded
    .filter((c) => c.via === 'icRequest' && c.data && c.data.message_type === 'comment')
    .map((c) => c.data.body);
}

function notePayloads(recorded) {
  return recorded
    .filter((c) => c.via === 'icRequest' && c.data && c.data.message_type === 'note')
    .map((c) => c.data.body);
}

function baseConv(id, parts, extra) {
  const now = Math.floor(Date.now() / 1000);
  return Object.assign({
    type: 'conversation',
    id,
    state: 'open',
    open: true,
    created_at: now - 86400,
    updated_at: now,
    admin_assignee_id: null,
    team_assignee_id: null,
    contacts: { contacts: [{ id: 'synthetic-contact', name: 'Bot test', email: '' }] },
    source: {
      type: 'conversation',
      id: id + '-src',
      body: '',
      author: { type: 'user', id: 'synthetic-user', name: 'Bot test' },
      created_at: now - 86400,
    },
    conversation_parts: { conversation_parts: parts },
  }, extra || {});
}

function userPart(id, body, at) {
  return {
    type: 'conversation_part',
    id,
    part_type: 'comment',
    body,
    created_at: at,
    author: { type: 'user', id: 'synthetic-user', name: 'Bot test' },
  };
}

function adminPart(id, body, at, who) {
  const author = who === 'elite'
    ? { type: 'admin', id: ELITE_AI_ID, name: 'Elite AI' }
    : { type: 'admin', id: ARSAL_ID, name: 'Arsal' };
  return { type: 'conversation_part', id, part_type: 'comment', body, created_at: at, author };
}

function notePart(id, body, at) {
  return {
    type: 'conversation_part',
    id,
    part_type: 'note',
    body,
    created_at: at,
    author: { type: 'admin', id: ARSAL_ID, name: 'Arsal' },
  };
}

async function invoke(luna, conv) {
  const req = { body: { topic: conv.__topic || 'conversation.user.replied', data: { item: { id: conv.id, type: 'conversation' } } } };
  let status = null;
  const res = {
    sendStatus(code) { status = code; return res; },
    status(code) { status = code; return res; },
    json() { return res; },
  };
  await luna.handleWebhook(req, res);
  return status;
}

function publicComments(recorded) {
  return recorded.filter((c) => c.via === 'icRequest' && String(c.method).toLowerCase() === 'post' && c.data && c.data.message_type === 'comment');
}

async function runPaths(luna, bag) {
  const now = Math.floor(Date.now() / 1000);
  const results = [];

  async function scenario(spec) {
    bag.recorded.length = 0;
    bag.scripted.length = 0;
    (spec.scripts || []).forEach((s) => bag.scripted.push(s));
    bag.convos.set(spec.conv.id, spec.conv);
    const logs = [];
    const orig = console.log;
    const origErr = console.error;
    console.log = (...a) => { logs.push(a.map(String).join(' ')); };
    console.error = (...a) => { logs.push('ERR ' + a.map(String).join(' ')); };
    let status = null;
    let threw = null;
    try {
      status = await invoke(luna, spec.conv);
    } catch (e) {
      threw = e && e.message;
    } finally {
      console.log = orig;
      console.error = origErr;
    }
    const comments = publicComments(bag.recorded).map((c) => ({
      url: c.url,
      admin_id: c.data.admin_id,
      message_type: c.data.message_type,
      body: c.data.body,
    }));
    const notes = bag.recorded
      .filter((c) => c.via === 'icRequest' && c.data && c.data.message_type === 'note')
      .map((c) => c.data.body);
    const joined = comments.map((c) => c.body).join('\n');
    const verdict = spec.judge({ comments, notes, joined, logs, status, threw, recorded: bag.recorded.slice() });
    results.push({
      id: spec.id,
      path: spec.path,
      status,
      threw,
      commentCount: comments.length,
      comments,
      noteCount: notes.length,
      ok: verdict.ok,
      failure: verdict.failure || null,
      detail: verdict.detail || '',
      logTail: logs.slice(-12),
    });
  }

  const hedgeHtml = HEDGE;

  await scenario({
    id: 'PATH-01',
    path: 'spread-test',
    conv: baseConv('syn-spread', [userPart('u-spread', 'What are the spreads on the test server?', now)]),
    judge({ comments, joined }) {
      const ok = comments.length === 1 && /TEST SPREAD ACCOUNT DETAILS/.test(joined) && !joined.includes(HEDGE);
      return { ok, failure: ok ? null : (comments.length === 0 ? 'silent_drop' : 'approved_safe_regression'), detail: 'locked spread template must be the only public comment' };
    },
  });

  await scenario({
    id: 'PATH-02',
    path: 'review-status',
    conv: baseConv('syn-review', [userPart('u-review', 'How will I know when the review is done? Will I get an email once verification is complete?', now)]),
    judge({ comments, joined }) {
      const templates = [
        'Once your review is complete',
        'When the review finishes',
        'You\'ll get an update from our team',
      ];
      const ok = comments.length === 1 && templates.some((t) => joined.includes(t)) && !joined.includes(HEDGE);
      return { ok, failure: ok ? null : (comments.length === 0 ? 'silent_drop' : 'approved_safe_regression'), detail: 'one of the locked review-status replies' };
    },
  });

  await scenario({
    id: 'PATH-03',
    path: 'fin-welcome',
    conv: baseConv('syn-fin', [
      adminPart('e-fin', "I'm going to connect you to a teammate.", now - 30, 'elite'),
      userPart('u-fin', 'Hello', now),
    ]),
    judge({ comments, joined }) {
      const ok = comments.length === 1 && /how can I help/i.test(joined) && !joined.includes(HEDGE);
      return { ok, failure: ok ? null : (comments.length === 0 ? 'silent_drop' : 'approved_safe_regression'), detail: 'locked Fin welcome' };
    },
  });

  await scenario({
    id: 'PATH-04',
    path: 'identity-recovery',
    conv: baseConv('syn-id', [
      userPart('u-id', 'Please look at account 55123456. I already sent the details.', now - 50),
      adminPart('a-id', 'Please share your account number before I pass this to the team.', now - 10),
    ]),
    judge({ comments, joined }) {
      const ok = comments.length >= 1 && /sent this to a teammate/i.test(joined) && !/terminat/i.test(joined) && !joined.includes(HEDGE);
      return { ok, failure: ok ? null : (comments.length === 0 ? 'silent_drop' : 'approved_safe_regression'), detail: 'identity recovery client line' };
    },
  });

  await scenario({
    id: 'PATH-05',
    path: 'authorized-note-REPLY',
    conv: Object.assign(baseConv('syn-note-bad', [
      userPart('u-nb', 'What happens on strategy risk?', now - 20),
      notePart('n-nb', '@Arsal REPLY: Strategy risk terminates the funded account.', now),
    ]), { __topic: 'conversation.admin.noted' }),
    judge({ comments, joined }) {
      const ok = comments.length === 1 && comments[0].body === hedgeHtml && !/terminat/i.test(joined);
      return { ok, failure: ok ? null : (comments.length === 0 ? 'silent_drop' : 'unsupported_or_contradiction'), detail: 'bad owner REPLY must be the exact hedge' };
    },
  });

  await scenario({
    id: 'PATH-06',
    path: 'authorized-note-REPLY-supported',
    conv: Object.assign(baseConv('syn-note-ok', [
      userPart('u-no', 'What happens on strategy risk?', now - 20),
      notePart('n-no', '@Arsal REPLY: Strategy risk is a soft breach with a reset, and it does not terminate the account.', now),
    ]), { __topic: 'conversation.admin.noted' }),
    judge({ comments, joined }) {
      const ok = comments.length === 1 && /soft breach/i.test(joined) && /does not terminate/i.test(joined) && !joined.includes(HEDGE);
      return { ok, failure: ok ? null : (comments.length === 0 ? 'silent_drop' : 'false_hold'), detail: 'supported owner REPLY must pass unchanged' };
    },
  });

  await scenario({
    id: 'PATH-07',
    path: 'authorized-note-send-this',
    conv: Object.assign(baseConv('syn-send-bad', [
      userPart('u-sb', 'status?', now - 20),
      notePart('n-sb', '@Arsal send this message to the client [Weekend trading will terminate the funded account]', now),
    ]), { __topic: 'conversation.admin.noted' }),
    judge({ comments, joined }) {
      const ok = comments.length === 1 && comments[0].body === hedgeHtml && !/terminat/i.test(joined);
      return { ok, failure: ok ? null : (comments.length === 0 ? 'silent_drop' : 'unsupported_or_contradiction'), detail: 'bracket send of a contradicting weekend claim' };
    },
  });

  await scenario({
    id: 'PATH-08',
    path: 'presend-send',
    scripts: ['ACTION: REPLY\nBODY: Strategy risk terminates the funded account.'],
    conv: baseConv('syn-presend', [userPart('u-ps', 'What is the consequence of a strategy risk breach on a funded account?', now)]),
    judge({ comments, joined }) {
      if (comments.length === 0) return { ok: false, failure: 'silent_drop', detail: 'presend path produced no public comment' };
      const leak = /terminat/i.test(joined);
      return { ok: !leak, failure: leak ? 'unsupported_or_contradiction' : null, detail: 'model termination draft must not be posted; hedge or a clean handoff is acceptable' };
    },
  });

  await scenario({
    id: 'PATH-09',
    path: 'presend-send-supported',
    scripts: ['ACTION: REPLY\nBODY: Strategy risk is a soft breach with a reset, and it does not terminate the account.'],
    conv: baseConv('syn-presend-ok', [userPart('u-po', 'Is strategy risk a termination?', now)]),
    judge({ comments, joined }) {
      if (comments.length === 0) return { ok: false, failure: 'silent_drop', detail: 'supported presend answer produced no public comment' };
      const leak = /\bterminates\b/i.test(joined);
      const kept = /soft breach/i.test(joined) && /does not terminate/i.test(joined);
      const hedged = joined.includes(HEDGE);
      if (leak) return { ok: false, failure: 'unsupported_or_contradiction', detail: 'supported draft was altered into a termination' };
      if (hedged && !kept) return { ok: false, failure: 'false_hold', detail: 'supported draft was replaced by the hedge' };
      return { ok: kept, failure: kept ? null : 'other', detail: 'supported strategy-risk statement on the presend path' };
    },
  });

  const humanAsk = 'I need to speak with a human manager about this funded account because the dashboard has been stuck for several days and I want a real person to take over this conversation please connect me with a supervisor today.';
  await scenario({
    id: 'PATH-10',
    path: 'presend-escalation',
    scripts: ['ACTION: REPLY\nBODY: Strategy risk terminates the funded account.'],
    conv: baseConv('syn-esc', [userPart('u-esc', humanAsk, now)]),
    judge({ comments, joined }) {
      if (comments.length === 0) return { ok: false, failure: 'silent_drop', detail: 'human-request path produced no public comment' };
      const leak = /terminat/i.test(joined);
      return { ok: !leak, failure: leak ? 'unsupported_or_contradiction' : null, detail: 'bad draft must not be posted; identity ask or handoff is acceptable' };
    },
  });

  await scenario({
    id: 'PATH-10b',
    path: 'presend-escalation-with-identity',
    scripts: ['ACTION: REPLY\nBODY: Strategy risk terminates the funded account.'],
    conv: baseConv('syn-esc2', [userPart('u-esc2', humanAsk + ' My account number is 55123456.', now)]),
    judge({ comments, joined }) {
      if (comments.length === 0) return { ok: false, failure: 'silent_drop', detail: 'escalation with identity produced no public comment' };
      const leak = /terminat/i.test(joined);
      const forwarded = /forwarded this to a teammate|sent this to a teammate/i.test(joined);
      return { ok: !leak && forwarded, failure: leak ? 'unsupported_or_contradiction' : (forwarded ? null : 'other'), detail: 'with identity present, the handoff line must be the public comment' };
    },
  });

  await scenario({
    id: 'PATH-11',
    path: 'presend-weekend-claim',
    scripts: ['ACTION: REPLY\nBODY: Weekend trading will terminate the funded account.'],
    conv: baseConv('syn-we', [userPart('u-we', 'What happens if I trade during the weekend on a funded account?', now)]),
    judge({ comments, joined }) {
      if (comments.length === 0) return { ok: false, failure: 'silent_drop', detail: 'weekend claim path produced no public comment' };
      const leak = /terminat/i.test(joined);
      return { ok: !leak, failure: leak ? 'unsupported_or_contradiction' : null, detail: '17437306 does not allow a termination claim' };
    },
  });

  await scenario({
    id: 'PATH-13',
    path: 'owner-follow-REPLY',
    scripts: ['ACTION: REPLY\nBODY: Strategy risk terminates the funded account.'],
    conv: Object.assign(baseConv('syn-follow', [
      userPart('u-fl', 'What happens on strategy risk?', now - 20),
      notePart('n-fl', '@Arsal please tell the client the outcome of strategy risk.', now),
    ]), { __topic: 'conversation.admin.noted' }),
    judge({ comments, joined, logs }) {
      const reached = logs.some((l) => /AUTH_NOTE FOLLOW/.test(l) || /OWNER_REPLY/.test(l));
      if (comments.length === 0) return { ok: false, failure: 'silent_drop', detail: 'owner FOLLOW REPLY produced no public comment' };
      const leak = /terminat/i.test(joined);
      return { ok: !leak && reached, failure: leak ? 'unsupported_or_contradiction' : (reached ? null : 'other'), detail: 'executeOwnerActionPlan REPLY hook must hedge the termination draft' };
    },
  });

  return results;
}

async function main() {
  const sums = verifyFrozenSums();
  const seal = verifySeal();
  const guardRows = runGuardCases();
  const work = path.join('/tmp', 'r9-review-state');
  fs.mkdirSync(work, { recursive: true });
  const controlFile = path.join(work, 'bot-control.json');
  fs.writeFileSync(controlFile, JSON.stringify({
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: true,
    testAllowNames: ['Bot test'],
    testAllowConversationIds: [],
    config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
  }, null, 2));
  fs.writeFileSync(path.join(work, 'prompt.txt'), 'Synthetic review prompt. Do not invent FundedElite facts.\n');
  process.env.LUNA_CONTROL_STATE_FILE = controlFile;
  process.env.LUNA_PROMPT_FILE = path.join(work, 'prompt.txt');
  process.env.TICKET_STATE_FILE = path.join(work, 'ticket-state.json');
  process.env.MENTION_ROTATE_FILE = path.join(work, 'mention-rotate.json');
  process.env.LUNA_OP_STORE_FILE = path.join(work, 'write-ops.json');
  process.env.OPENAI_API_KEY = 'synthetic-review-key';
  process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-review-token';
  process.env.LUNA_PRESEND_MODE = 'enforce';
  delete process.env.PORT;

  const bag = installIsolatedTransport();
  const luna = require(INDEX_PATH);
  let n = 0;
  luna.__setTestDoubles({
    icRequest: async (method, url, data, tag) => {
      bag.recorded.push({ via: 'icRequest', method, url, data, tag });
      const u = String(url || '');
      if (String(method).toLowerCase() === 'get' && /\/conversations\/[^/]+$/.test(u)) {
        const id = u.split('/').pop();
        const conv = bag.convos.get(id);
        if (!conv) return { ok: false, status: 404, data: { id: 'missing' } };
        return { ok: true, status: 200, data: conv };
      }
      n += 1;
      return { ok: true, status: 200, data: { id: 'syn-out-' + n, type: 'admin_reply' } };
    },
  });

  for (const f of [process.env.TICKET_STATE_FILE, process.env.LUNA_OP_STORE_FILE, process.env.MENTION_ROTATE_FILE]) {
    try { fs.unlinkSync(f); } catch (_) { /* fresh store */ }
  }
  const paths = await runPaths(luna, bag);

  // Fail-closed: the next PATH-12 already ran inside runPaths, but the throw
  // has to be installed before that scenario. Re-run it here with the throw.
  const guard = require(GUARD_PATH);
  const orig = guard.guardPublicBody;
  guard.guardPublicBody = function () { throw new Error('synthetic-guard-throw'); };
  const throwBag = bag;
  throwBag.recorded.length = 0;
  const now = Math.floor(Date.now() / 1000);
  const throwConv = Object.assign(baseConv('syn-throw-2', [
    userPart('u-th2', 'hello there', now - 20),
    notePart('n-th2', '@Arsal REPLY: Hello from the note.', now),
  ]), { __topic: 'conversation.admin.noted' });
  throwBag.convos.set(throwConv.id, throwConv);
  let throwStatus = null;
  let throwErr = null;
  try { throwStatus = await invoke(luna, throwConv); } catch (e) { throwErr = e && e.message; }
  guard.guardPublicBody = orig;
  const throwComments = publicComments(throwBag.recorded).map((c) => c.data.body);
  const throwOk = throwComments.length === 1 && throwComments[0] === HEDGE;
  const kept = paths.filter((p) => p.id !== 'PATH-12');
  paths.length = 0;
  kept.forEach((p) => paths.push(p));
  paths.push({
    id: 'PATH-12',
    path: 'guard-throw-fail-closed',
    status: throwStatus,
    threw: throwErr,
    commentCount: throwComments.length,
    comments: throwComments.map((body) => ({ body, message_type: 'comment' })),
    ok: throwOk,
    failure: throwOk ? null : (throwComments.length === 0 ? 'silent_drop' : 'other'),
    detail: 'throwing guardPublicBody must still post the hedge',
  });
  // Drop the earlier PATH-12 that ran without the throw, if present.
  const firstThrow = paths.findIndex((p) => p.id === 'PATH-12' && p.detail && p.detail.indexOf('throwing') === -1);
  if (firstThrow !== -1) paths.splice(firstThrow, 1);

  const guardFail = guardRows.filter((r) => !r.ok);
  const pathFail = paths.filter((p) => !p.ok);
  const byClass = {};
  for (const r of guardRows) {
    if (!byClass[r.class]) byClass[r.class] = { total: 0, failed: 0 };
    byClass[r.class].total += 1;
    if (!r.ok) byClass[r.class].failed += 1;
  }
  const failureKinds = {};
  for (const r of guardFail) failureKinds[r.failure] = (failureKinds[r.failure] || 0) + 1;
  for (const p of pathFail) failureKinds['path:' + p.failure] = (failureKinds['path:' + p.failure] || 0) + 1;

  const summary = {
    frozenCommit: '5212f98351a81041116e99cc2a1e4fe1455711b1',
    sums,
    seal,
    guardCases: guardRows.length,
    guardFailed: guardFail.length,
    pathCases: paths.length,
    pathFailed: pathFail.length,
    byClass,
    failureKinds,
    criticalGuard: guardFail.filter((r) => r.failure === 'unsupported_or_contradiction' || r.failure === 'silent_drop' || r.failure === 'false_hold').map((r) => ({
      id: r.id, class: r.class, lang: r.lang, expect: r.expect, failure: r.failure, reason: r.reason, body: r.body, why: r.why,
    })),
    criticalPaths: pathFail.map((p) => ({ id: p.id, path: p.path, failure: p.failure, detail: p.detail, comments: p.comments, logTail: p.logTail })),
  };

  const outFile = path.join(REVIEW_DIR, 'results.json');
  fs.writeFileSync(outFile, JSON.stringify({ summary, guardRows, paths }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (!sums.every((s) => s.ok) || !seal.ok) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e && e.stack || e);
  process.exit(1);
});
