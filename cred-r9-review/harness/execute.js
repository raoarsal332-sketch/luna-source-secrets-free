'use strict';

const fs = require('fs');
const path = require('path');
const { TEMPLATE } = require('./cases');

const ARSAL = '10118526';
const JERRY = '8053416';
const ESC = '9629759';
const RISK = '10675195';
const FIXED = 'Please change that immediately. I will not repeat it back. I am escalating this as a security event for the team.';
const PW = 'QBG5FetfozKz7^a?J!';
const CRED_REASONS = /draft_secret|history_echo|template_password|key_material|residual_secret|spread_not_eligible|unsanitizable|validation_error/;

function userPart(id, at, body) {
  return { id, part_type: 'comment', created_at: at, body, author: { type: 'user', id: 'user-syn', name: 'Synthetic User' } };
}
function adminPart(id, at, body, adminId) {
  return { id, part_type: 'comment', created_at: at, body, author: { type: 'admin', id: adminId || ARSAL, name: 'Arsal' } };
}
function notePart(id, at, body) {
  return { id, part_type: 'note', created_at: at, body, author: { type: 'admin', id: ARSAL, name: 'Arsal' } };
}

function conversation(fields) {
  return {
    type: 'conversation',
    id: fields.id,
    open: fields.open !== false,
    state: fields.open === false ? 'closed' : 'open',
    created_at: fields.createdAt,
    updated_at: fields.updatedAt,
    team_assignee_id: fields.team == null ? null : fields.team,
    admin_assignee_id: fields.admin == null ? ARSAL : fields.admin,
    source: {
      type: 'conversation',
      body: fields.source || '',
      author: { type: 'user', id: 'user-syn', name: fields.name || 'Synthetic User' },
    },
    contacts: { contacts: [{ name: fields.name || 'Synthetic User', email: 'synthetic.user@example.test' }] },
    conversation_parts: { conversation_parts: fields.parts || [] },
  };
}

function decodeLoose(s) {
  let t = String(s == null ? '' : s);
  t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n');
  t = t.replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch (_) { return _; } });
  t = t.replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch (_) { return _; } });
  t = t.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&nbsp;/gi, ' ');
  t = t.replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch (_) { return _; } });
  return t;
}

function contains(hay, needle) {
  if (!needle || String(needle).length < 2) return false;
  const h = String(hay == null ? '' : hay);
  if (h.includes(needle)) return true;
  const d = decodeLoose(h);
  if (d.includes(needle)) return true;
  try {
    if (h.normalize('NFKC').includes(String(needle).normalize('NFKC'))) return true;
    if (d.normalize('NFKC').includes(String(needle).normalize('NFKC'))) return true;
  } catch (_) { /* ignore */ }
  return false;
}

function hasTemplate(body) {
  const t = decodeLoose(body);
  return t.includes(PW) && t.includes('55188') && /TEST SPREAD ACCOUNT DETAILS/i.test(t);
}

function wipe(paths) {
  fs.writeFileSync(paths.ticket, '{}');
  fs.writeFileSync(paths.ops, '{}');
  if (fs.existsSync(paths.maintainer)) {
    for (const name of fs.readdirSync(paths.maintainer)) {
      const p = path.join(paths.maintainer, name);
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
}

function readTree(dir) {
  if (!fs.existsSync(dir)) return '';
  let out = '';
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.size < 2_000_000) out += '\n' + fs.readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

function captureConsole(fn) {
  const lines = [];
  const orig = {};
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    orig[m] = console[m];
    console[m] = (...args) => {
      lines.push(args.map((x) => {
        if (typeof x === 'string') return x;
        try { return JSON.stringify(x); } catch (_) { return String(x); }
      }).join(' '));
    };
  }
  const restore = () => {
    for (const m of Object.keys(orig)) console[m] = orig[m];
  };
  let result;
  try {
    result = fn();
  } catch (err) {
    restore();
    err.lines = lines;
    throw err;
  }
  return Promise.resolve(result).then(
    () => {
      restore();
      return { lines };
    },
    (err) => {
      restore();
      err.lines = lines;
      throw err;
    }
  );
}

function buildScenario(c) {
  const now = Math.floor(Date.now() / 1000);
  const id = c.runId;
  if (c.path === 'search-esc') {
    const conv = conversation({
      id,
      createdAt: now - 20 * 60,
      updatedAt: now,
      team: ESC,
      admin: '0',
      source: c.pollText,
      parts: [
        userPart(id + '-1', now - 19 * 60, c.pollText),
        userPart(id + '-2', now - 18 * 60, 'Following up on the same issue.'),
        userPart(id + '-3', now - 17 * 60, c.pollText),
      ],
    });
    return { conv, search: { teamId: ESC, list: [{ id, team_assignee_id: Number(ESC), open: true }] } };
  }
  if (c.path === 'search-jerry') {
    const conv = conversation({
      id,
      createdAt: now - 20 * 60,
      updatedAt: now,
      team: null,
      admin: JERRY,
      source: c.pollText,
      parts: [userPart(id + '-1', now - 19 * 60, c.pollText)],
    });
    return { conv, search: { adminId: JERRY, list: [{ id, admin_assignee_id: Number(JERRY), open: true }] } };
  }
  if (c.path === 'search-risk') {
    const conv = conversation({
      id,
      createdAt: now - 20 * 60,
      updatedAt: now,
      team: RISK,
      admin: '0',
      source: c.pollText,
      parts: [userPart(id + '-1', now - 19 * 60, c.pollText)],
    });
    return { conv, search: { teamId: RISK, list: [{ id, team_assignee_id: Number(RISK), open: true }] } };
  }
  if (c.path === 'search-close') {
    const conv = conversation({
      id,
      createdAt: now - 40 * 60,
      updatedAt: now,
      team: null,
      admin: ARSAL,
      source: 'Hello',
      parts: [
        userPart(id + '-u', now - 30 * 60, c.pollText),
        adminPart(id + '-a', now - 15 * 60, 'Thanks, that is resolved on our side.'),
      ],
    });
    return { conv, search: { openOnly: true, list: [{ id, open: true, team_assignee_id: null, admin_assignee_id: Number(ARSAL) }] } };
  }
  if (c.path === 'defer-poll') {
    const conv = conversation({
      id,
      createdAt: now - 7200,
      updatedAt: now,
      source: 'Hello',
      parts: [userPart(id + '-u', now - 800, 'any update on this?')],
    });
    return {
      conv,
      seed: {
        [id]: {
          lastEscalateAt: now - 900,
          escalateAwaitingFirstTeammate: false,
          escalateTeammateExplainedAt: now - 850,
          lastEscalateProblem: 'login delay',
          deferredRelatedReply: { partId: id + '-u', at: now - 800, text: 'password: ' + c.secrets[0] },
        },
      },
    };
  }
  const parts = [];
  if (c.older) parts.push(userPart(id + '-old', now - 5000, c.older));
  parts.push(adminPart(id + '-bot', now - 4000, 'Hello, how can I help with your question?'));
  parts.push(userPart(id + '-new', now - 30, c.latest));
  if (c.note) parts.push(notePart(id + '-note', now - 5, c.note));
  const conv = conversation({
    id,
    createdAt: now - 7200,
    updatedAt: now,
    source: c.source || 'Hello',
    name: c.name,
    parts,
  });
  let seed = null;
  if (c.path === 'defer') {
    seed = {
      [id]: {
        lastEscalateAt: now - 500,
        escalateAwaitingFirstTeammate: false,
        escalateTeammateExplainedAt: now - 400,
        lastEscalateProblem: 'login delay while waiting',
      },
    };
  }
  return { conv, seed };
}

function sectionsOf(content) {
  const s = typeof content === 'string' ? content : JSON.stringify(content == null ? '' : content);
  let history = '';
  let latest = '';
  let command = '';
  const h = s.indexOf('FULL TICKET HISTORY:\n');
  const l = s.indexOf('Latest client message:\n');
  if (h >= 0) {
    history = l > h ? s.slice(h + 'FULL TICKET HISTORY:\n'.length, l) : s.slice(h + 'FULL TICKET HISTORY:\n'.length);
  }
  if (l >= 0) {
    const rest = s.slice(l + 'Latest client message:\n'.length);
    latest = rest.split('\n\n')[0];
  }
  const d = s.indexOf('DIRECT COMMAND from ');
  if (d >= 0) command = h > d ? s.slice(d, h) : s.slice(d, d + 500);
  return { history, latest, command, full: s };
}

function publicBodies(httpLog) {
  const out = [];
  httpLog.forEach((row, index) => {
    if (!row || String(row.url || '').indexOf('/reply') < 0) return;
    const data = row.data || {};
    const mt = String(data.message_type || '');
    if (typeof data.body === 'string') out.push({ index, mt: mt || 'comment', body: data.body, url: row.url });
  });
  return out;
}

async function runOne(rt, c, paths, promptText) {
  const started = process.hrtime.bigint();
  const runId = c.runId || c.id;
  c.runId = runId;
  wipe(paths);
  rt.guard.resetStore();
  rt.presend.resetAll();
  rt.clearLogs();
  rt.convs.clear();
  rt.resetPlan({
    reply: c.reply,
    toolFirst: !!c.toolFirst,
    fail429: c.fail429 || 0,
    parrot: !!c.parrot,
  });
  process.env.LUNA_PRESEND_MODE = c.mode || 'enforce';
  process.env.LUNA_TOOLS_ENABLED = c.toolFirst ? '1' : '0';

  const scenario = buildScenario(c);
  rt.convs.set(runId, scenario.conv);
  rt.plan.search = scenario.search || null;
  if (scenario.seed) rt.luna.__review.saveTicketState(scenario.seed);

  let thrown = null;
  let lines = [];
  try {
    const captured = await captureConsole(async () => {
      if (c.path === 'owner' || c.path === 'owner-note' || c.path === 'owner-stop') {
        const res = { statusCode: 0, sendStatus(code) { this.statusCode = code; return this; } };
        await rt.luna.handleWebhook({ body: { topic: 'conversation.admin.noted', data: { item: scenario.conv } } }, res);
        return res.statusCode;
      }
      if (c.path === 'defer-poll') {
        await rt.luna.__review.pollDeferredRelatedReplies();
        return 0;
      }
      if (c.path === 'search-esc' || c.path === 'search-risk' || c.path === 'search-jerry') {
        await rt.luna.__review.pollSilentTeamboxNotes();
        return 0;
      }
      if (c.path === 'search-close') {
        await rt.luna.__review.pollAutoCloseSilentTickets();
        return 0;
      }
      const res = { statusCode: 0, sendStatus(code) { this.statusCode = code; return this; } };
      await rt.luna.handleWebhook({
        body: { topic: 'conversation.user.replied', data: { item: scenario.conv } },
      }, res);
      if (c.path === 'replay' || c.path === 'replay-clean') {
        const bodies = publicBodies(rt.httpLog).filter((b) => b.mt === 'comment');
        const replayBody = c.path === 'replay'
          ? c.replayBody
          : (bodies.length ? bodies[bodies.length - 1].body : 'You can review that in the dashboard help centre.');
        await rt.luna.__review.icRequest(
          'post',
          'https://api.intercom.io/conversations/' + runId + '/reply',
          { message_type: 'comment', type: 'admin', admin_id: ARSAL, body: replayBody },
          'REPLAY'
        );
      }
      return res.statusCode;
    });
    lines = captured.lines;
  } catch (err) {
    thrown = err;
    if (err && Array.isArray(err.lines)) lines = err.lines;
  }

  const logs = lines.join('\n');
  const httpText = JSON.stringify(rt.httpLog).split('harness-intercom-token').join('[harness-token]');
  const modelPackets = rt.modelLog.map((call) => {
    const buckets = { model_system: '', model_history: '', model_latest: '', model_other: '' };
    for (const msg of call.messages || []) {
      const role = msg && msg.role;
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content == null ? msg : msg.content);
      if (role === 'system') {
        buckets.model_system += '\n' + String(content).split(promptText).join('');
      } else if (role === 'tool') {
        buckets.model_other += '\n' + content;
      } else if (role === 'user') {
        const sec = sectionsOf(content);
        buckets.model_history += '\n' + sec.history;
        buckets.model_latest += '\n' + sec.latest;
        if (sec.command) buckets.model_other += '\n' + sec.command;
        if (!sec.history && !sec.latest) buckets.model_other += '\n' + sec.full;
      } else {
        buckets.model_other += '\n' + content;
      }
    }
    return buckets;
  });

  const ticket = fs.existsSync(paths.ticket) ? fs.readFileSync(paths.ticket, 'utf8') : '';
  const ops = fs.existsSync(paths.ops) ? fs.readFileSync(paths.ops, 'utf8') : '';
  const maint = readTree(paths.maintainer);
  let snap = '';
  try { snap = JSON.stringify(rt.presend.snapshot(runId)); } catch (_) { snap = ''; }

  const surfaces = {
    public: publicBodies(rt.httpLog).filter((b) => b.mt === 'comment').map((b) => b.body).join('\n'),
    note: publicBodies(rt.httpLog).filter((b) => b.mt === 'note').map((b) => b.body).join('\n'),
    search: rt.httpLog.filter((r) => /\/search$/.test(String(r.url || ''))).map((r) => JSON.stringify(r.data || '')).join('\n'),
    retry: (() => {
      const writes = rt.httpLog.filter((r) => /\/reply$/.test(String(r.url || '')) && r.data && r.data.body);
      return writes.slice(1).map((r) => String(r.data.body)).join('\n');
    })(),
    replay: c.path === 'replay' || c.path === 'replay-clean'
      ? (rt.httpLog.filter((r) => /\/reply$/.test(String(r.url || ''))).slice(-1).map((r) => JSON.stringify(r.data || '')).join('\n'))
      : '',
    state: ticket + '\n' + snap + '\n' + maint,
    opstore: ops,
    logs,
    defer: (() => {
      try {
        const all = JSON.parse(ticket || '{}');
        const row = all[runId] || {};
        return JSON.stringify(row.deferredRelatedReply || '');
      } catch (_) { return ''; }
    })(),
  };
  for (const packet of modelPackets) {
    for (const key of Object.keys(packet)) surfaces[key] = (surfaces[key] || '') + '\n' + packet[key];
  }

  const hits = [];
  const needles = (c.secrets || []).filter((s) => s && String(s).length >= 2);
  for (const [surface, text] of Object.entries(surfaces)) {
    for (const needle of needles) {
      if (contains(text, needle)) {
        hits.push({ surface, kind: 'customer', needle: String(needle).slice(0, 6) });
        break;
      }
    }
    const allowTemplateHere = surface === 'public' && c.kind === 'eligible';
    if (!allowTemplateHere && contains(text, PW)) {
      hits.push({ surface, kind: 'template', needle: 'template-password' });
    }
  }

  const pubs = publicBodies(rt.httpLog).filter((b) => b.mt === 'comment');
  const templateSent = pubs.some((b) => hasTemplate(b.body) || (decodeLoose(b.body).includes(PW)));
  const fixedSent = pubs.some((b) => decodeLoose(b.body).includes(FIXED)) || surfaces.note.includes(FIXED);
  const credBlock = CRED_REASONS.test(logs) && /OUTBOUND_BLOCKED|IC_REQ_BLOCKED/.test(logs);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const pathMiss = detectPathMiss(c, logs);

  let product = [];
  if (!pathMiss) {
    for (const hit of hits) product.push('leak:' + hit.surface + ':' + hit.kind);
    if (c.kind === 'eligible' && !templateSent) product.push('missed-eligible');
    if (c.kind === 'ineligible' && templateSent) product.push('unauthorized-template');
    if ((c.kind === 'faq' || c.expect === 'faq') && (fixedSent || templateSent || (credBlock && !pubs.length))) product.push('overblock');
    if (c.expect === 'stop-note' && !/AUTH_NOTE STOP/.test(logs)) product.push('regression:stop');
    if (c.expect === 'replay-suppressed' && !/IC_REQ_REPLAY_SUPPRESSED/.test(logs)) product.push('regression:replay');
    if (c.expect === 'defer-cleared') {
      if (contains(surfaces.defer, c.secrets[0]) || contains(logs, c.secrets[0]) || contains(httpText, c.secrets[0])) {
        product.push('leak:defer:customer');
      }
    }
    if (thrown && thrown.code === 'NETWORK_BLOCKED') product.push('network-attempt');
    else if (thrown) product.push('threw');
  }

  const hang = c.kind === 'hang' && ms > 3000;
  if (hang && !pathMiss) product.push('hang');
  if (!c.slow && c.kind !== 'hang' && ms > 3000 && !pathMiss) product.push('hang');

  return {
    id: c.id,
    runId,
    group: c.group,
    kind: c.kind,
    mode: c.mode || 'enforce',
    title: c.title,
    ms: Math.round(ms * 10) / 10,
    pathMiss,
    templateSent,
    fixedSent,
    credBlock,
    modelCalls: rt.modelLog.length,
    posts: pubs.length,
    notes: publicBodies(rt.httpLog).filter((b) => b.mt === 'note').length,
    hits: dedupe(hits),
    product: [...new Set(product)],
    thrown: thrown ? String(thrown.code || thrown.message || thrown).slice(0, 180) : '',
    logHint: pathMiss || product.length ? logs.split('\n').filter(Boolean).slice(-8).join(' | ').slice(0, 500) : '',
  };
}

function dedupe(hits) {
  const seen = new Set();
  const out = [];
  for (const hit of hits) {
    const key = hit.surface + ':' + hit.kind;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

function detectPathMiss(c, logs) {
  if (c.path === 'webhook' || c.path === 'hang' || c.path === 'replay' || c.path === 'replay-clean' || c.path === 'defer') {
    if (/SKIP paused/.test(logs)) return 'skipped-paused';
    if (/SKIP test-mode/.test(logs)) return 'skipped-test-mode';
    if (/SKIP fin-wait/.test(logs)) return 'skipped-fin-wait';
    if (/SKIP no user part/.test(logs)) return 'skipped-no-user';
    if (/SKIP repliesEnabled/.test(logs)) return 'skipped-replies';
    if (/SKIP inflight/.test(logs)) return 'skipped-inflight';
  }
  if ((c.path === 'owner' || c.path === 'owner-note' || c.path === 'owner-stop') && !/AUTH_NOTE/.test(logs)) return 'owner-not-taken';
  if (c.path === 'defer' && !/ESCALATE defer related/.test(logs)) return 'defer-not-taken';
  if (c.path === 'defer-poll' && !/ESCALATE defer matured|DEFER_POLL_ITEM|DEFER_POLL_ERR/.test(logs)) return 'defer-poll-not-taken';
  if (c.path === 'search-esc' && !/ESCALATIONS note-only/.test(logs)) return 'esc-not-taken';
  if (c.path === 'search-jerry' && !/JERRY_LONG note/.test(logs)) return 'jerry-not-taken';
  if (c.path === 'search-risk' && !/RISK note-only/.test(logs)) return 'risk-not-taken';
  if (c.path === 'search-close' && !/AUTO_CLOSE /.test(logs)) return 'close-not-taken';
  return '';
}

module.exports = { runOne, TEMPLATE, PW, FIXED };
