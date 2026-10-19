const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

// CONTROL_SECRET_PREVIOUS exists only for a bounded, restart-safe rotation window. Remove it
// after every consumer has moved to CONTROL_SECRET; an empty previous value authorizes nothing.
const CONTROL_SECRET = process.env.CONTROL_SECRET || '';
const CONTROL_SECRET_PREVIOUS = process.env.CONTROL_SECRET_PREVIOUS || '';

function secretMatches(got, expected) {
  if (!got || !expected) return false;
  const a = Buffer.from(String(got));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Env-overridable so a sandbox / staging run can never mutate live control state.
// Canonical production SoT (also pinned in ecosystem.config.js via LUNA_CONTROL_STATE_FILE).
// Do NOT fall back to /home/ubuntu/bot-control.json — that path is a quarantined stale copy (aiOff=22),
// not production. Sandbox/staging MUST set LUNA_CONTROL_STATE_FILE explicitly.
const STATE_FILE = process.env.LUNA_CONTROL_STATE_FILE || '/home/ubuntu/luna-brain-upgrade/bot-control.json';
const PROMPT_FILE = process.env.LUNA_PROMPT_FILE || '/home/ubuntu/system-prompt.txt';
const ADMIN_ID = '10118526';
const INTERCOM_BASE = 'https://api.intercom.io';

const defaultState = () => ({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Bot test'],
  testAllowConversationIds: [],
  replyAllowedConversationIds: [],
  config: {
    model: 'gpt-6-luna',
    welcomeEnabled: true,
    repliesEnabled: true,
  },
});

// A missing or corrupt control file used to fall back to defaultState(), which is
// paused:false / testMode:false — a read fault could therefore UNPAUSE the bot and remove
// the test-audience restriction. Operational state must fail safe instead: keep the last
// state we successfully read, and if we never read one, hold paused with testMode on.
// Deliberate first-run initialisation is distinguished from runtime corruption by the
// absence of any prior successful read AND an absent file.
const failSafeState = () => ({
  ...defaultState(),
  paused: true,
  pausedUntil: null,
  testMode: true,
});

let _lastGoodState = null;
let _warnedUnreadable = false;

function isValidControlSchema(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
  if (typeof s.paused !== 'boolean') return false;
  if (typeof s.testMode !== 'boolean') return false;
  if (s.pausedUntil != null && typeof s.pausedUntil !== 'string') return false;
  if (s.aiOff != null && (typeof s.aiOff !== 'object' || Array.isArray(s.aiOff))) return false;
  if (s.testAllowNames != null && !Array.isArray(s.testAllowNames)) return false;
  if (s.testAllowConversationIds != null && !Array.isArray(s.testAllowConversationIds)) return false;
  if (s.replyAllowedConversationIds != null && !Array.isArray(s.replyAllowedConversationIds)) return false;
  if (s.config != null && (typeof s.config !== 'object' || Array.isArray(s.config))) return false;
  return true;
}

function acceptControlState(s) {
  return {
    ...defaultState(),
    ...s,
    paused: !!s.paused,
    testMode: !!s.testMode,
    aiOff: s.aiOff && typeof s.aiOff === 'object' && !Array.isArray(s.aiOff) ? s.aiOff : {},
    config: { ...defaultState().config, ...(s.config || {}) },
  };
}

function loadState() {
  let raw = null;
  let existed = false;
  try {
    existed = fs.existsSync(STATE_FILE);
    if (existed) raw = fs.readFileSync(STATE_FILE, 'utf8');
  } catch (e) {
    existed = true; // it is there but unreadable: treat as a fault, never as first run
  }

  if (raw !== null) {
    try {
      const s = JSON.parse(raw);
      if (isValidControlSchema(s)) {
        const merged = acceptControlState(s);
        _lastGoodState = merged;
        _warnedUnreadable = false;
        return merged;
      }
    } catch (_) { /* fall through to the fail-safe path */ }
  }

  if (_lastGoodState) {
    if (!_warnedUnreadable) {
      _warnedUnreadable = true;
      console.error('CONTROL_STATE_UNREADABLE , holding last known good state (paused=' + !!_lastGoodState.paused + ')');
    }
    return _lastGoodState;
  }

  if (!existed && raw === null) {
    // Genuine first run: no file has ever existed. Still start conservatively.
    return failSafeState();
  }

  if (!_warnedUnreadable) {
    _warnedUnreadable = true;
    console.error('CONTROL_STATE_CORRUPT , failing safe (paused, testMode on)');
  }
  return failSafeState();
}


/**
 * Control-state audit trail.
 *
 * Until now nothing recorded who changed paused/testMode/model, so a stop could not be
 * attributed after the fact (the 2026-09-21 12:46 pause was untraceable for exactly this
 * reason). Appends one JSON line per mutation. Never records the control secret, any header
 * value, or credentials - only the action, the resulting state and coarse source metadata.
 */
// AUDIT_FOLLOWS_STATE_V1 (2026-09-24): a process that redirected the control STATE file (every test
// and sandbox does) must not append to the LIVE audit log; 11 selftests set only the state file, and
// fixture ids (9154760000000xx) were found in /home/ubuntu/bot-control-audit.jsonl. Production (state
// file at its canonical path) keeps the exact audit path it has always used.
const PRODUCTION_STATE_FILE = '/home/ubuntu/luna-brain-upgrade/bot-control.json';
const AUDIT_FILE = process.env.LUNA_CONTROL_AUDIT_FILE ||
  (require('path').resolve(STATE_FILE) === PRODUCTION_STATE_FILE
    ? '/home/ubuntu/bot-control-audit.jsonl'
    : require('path').join(require('path').dirname(require('path').resolve(STATE_FILE)), 'bot-control-audit.jsonl'));

function auditSource(req) {
  if (!req || typeof req !== 'object') return { via: 'internal' };
  const ipRaw = (req.ip || (req.connection && req.connection.remoteAddress) || '').toString();
  return {
    via: 'http',
    // Forwarded-for can be spoofed, so it is recorded as a hint, never as identity.
    ip: ipRaw.replace(/^::ffff:/, '').slice(0, 45) || null,
    fwd: String(req.get ? (req.get('X-Forwarded-For') || '') : '').split(',')[0].trim().slice(0, 45) || null,
    ua: String(req.get ? (req.get('User-Agent') || '') : '').slice(0, 120) || null,
    path: String(req.originalUrl || req.url || '').split('?')[0].slice(0, 80) || null,
  };
}

function auditControl(action, req, resultState, extra) {
  try {
    const s = resultState || {};
    const line = JSON.stringify({
      t: new Date().toISOString(),
      action: String(action || 'unknown'),
      state: {
        paused: !!s.paused,
        pausedUntil: s.pausedUntil || null,
        testMode: !!s.testMode,
        model: (s.config && s.config.model) || undefined,
        aiOffCount: Array.isArray(s.aiOff) ? s.aiOff.length : undefined,
      },
      source: auditSource(req),
      meta: extra || undefined,
      pid: process.pid,
    });
    fs.appendFileSync(AUDIT_FILE, line + '\n');
  } catch (e) {
    // Auditing must never break a control call.
    console.error('CONTROL_AUDIT_FAIL', e && e.message);
  }
}

function saveState(state) {
  // Atomic: never leave a half-written control file behind for the next reader.
  if (!isValidControlSchema(state) && !(state && typeof state.paused === 'boolean' && typeof state.testMode === 'boolean')) {
    const safe = _lastGoodState || failSafeState();
    console.error('CONTROL_STATE_REFUSE_INVALID_WRITE , holding last known good / fail-safe');
    return safe;
  }
  const tmp = STATE_FILE + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
  _lastGoodState = state;
}

function isPaused() {
  const s = loadState();
  if (s.pausedUntil) {
    const until = Date.parse(s.pausedUntil);
    if (!Number.isNaN(until) && Date.now() < until) return true;
    if (!Number.isNaN(until) && Date.now() >= until) {
      s.pausedUntil = null;
      saveState(s);
      return !!s.paused;
    }
  }
  return !!s.paused;
}


function setAiOff(conversationId) {
  if (!conversationId) return false;
  const s = loadState();
  s.aiOff[String(conversationId)] = true;
  saveState(s);
  return true;
}

function clearAiOff(conversationId) {
  if (!conversationId) return false;
  const s = loadState();
  delete s.aiOff[String(conversationId)];
  saveState(s);
  return true;
}

function isAiOff(conversationId) {
  if (!conversationId) return false;
  return !!loadState().aiOff[String(conversationId)];
}

function getConfig() {
  return loadState().config;
}

function getModel() {
  return getConfig().model || 'gpt-6-luna';
}

function getPrompt() {
  return fs.readFileSync(PROMPT_FILE, 'utf8');
}


function getTestMode() {
  const s = loadState();
  return {
    enabled: !!s.testMode,
    names: Array.isArray(s.testAllowNames) ? s.testAllowNames : ['Bot test'],
    conversationIds: Array.isArray(s.testAllowConversationIds)
      ? s.testAllowConversationIds.map(String)
      : [],
  };
}

function setTestMode(opts) {
  const s = loadState();
  if (opts && typeof opts.enabled === 'boolean') s.testMode = opts.enabled;
  if (opts && Array.isArray(opts.names)) s.testAllowNames = opts.names.map(String);
  if (opts && Array.isArray(opts.conversationIds)) {
    s.testAllowConversationIds = opts.conversationIds.map(String);
  }
  saveState(s);
  return getTestMode();
}

function allowTestConversationId(conversationId) {
  if (!conversationId) return getTestMode();
  const s = loadState();
  const id = String(conversationId);
  if (!Array.isArray(s.testAllowConversationIds)) s.testAllowConversationIds = [];
  if (!s.testAllowConversationIds.includes(id)) s.testAllowConversationIds.push(id);
  s.testMode = true;
  saveState(s);
  return getTestMode();
}

function isTestAllowed(conversationId, clientName) {
  const tm = getTestMode();
  if (!tm.enabled) return true; // test mode off = normal (all tickets)
  const id = String(conversationId || '');
  if (id && tm.conversationIds.includes(id)) return true;
  const name = String(clientName || '').trim().toLowerCase();
  for (const n of tm.names) {
    if (name && name === String(n).trim().toLowerCase()) return true;
  }
  return false;
}

// Explicit, ticket-scoped owner takeover after a human teammate has replied.
// This only bypasses the ordinary teammate-handoff deferral; pause, aiOff,
// test audience, Risk/Escalations and pre-send checks still apply.
function isReplyAllowed(conversationId) {
  const s = loadState();
  return Array.isArray(s.replyAllowedConversationIds) &&
    s.replyAllowedConversationIds.map(String).includes(String(conversationId || ''));
}

function setReplyAllowed(conversationId, allowed) {
  if (!conversationId) return false;
  const id = String(conversationId);
  const s = loadState();
  const ids = new Set((s.replyAllowedConversationIds || []).map(String));
  if (allowed) {
    ids.add(id);
    // An explicit ticket allowance must also pass the existing test-mode gate.
    const testIds = new Set((s.testAllowConversationIds || []).map(String));
    testIds.add(id);
    s.testAllowConversationIds = [...testIds];
    delete s.aiOff[id];
  } else {
    ids.delete(id);
  }
  s.replyAllowedConversationIds = [...ids];
  saveState(s);
  auditControl(allowed ? 'allow-reply' : 'disallow-reply', null, s, { conversationId: id });
  return isReplyAllowed(id);
}

function requireControl(req, res, next) {
  const got = req.get('X-Control-Secret') || '';
  const authorized = secretMatches(got, CONTROL_SECRET)
    || secretMatches(got, CONTROL_SECRET_PREVIOUS);
  if (!authorized) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}


function intercomHeaders() {
  return {
    Authorization: 'Bearer ' + process.env.INTERCOM_ACCESS_TOKEN,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Intercom-Version': '2.11',
  };
}

async function intercomRequest(method, path, body, query) {
  let url = INTERCOM_BASE + (path.startsWith('/') ? path : '/' + path);
  if (query && typeof query === 'object') {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) qs.append(k, String(v));
    });
    const s = qs.toString();
    if (s) url += (url.includes('?') ? '&' : '?') + s;
  }
  const res = await axios({
    method: (method || 'GET').toLowerCase(),
    url,
    data: body,
    headers: intercomHeaders(),
    validateStatus: () => true,
  });
  return { status: res.status, data: res.data };
}


// Arsal lock 2026-09-22: NEVER auto-mention Jerry (or anyone) on control notes.
// /control/note must post the body as provided — no Jerry HTML injection.
function jerryMentionHtml() {
  // Kept as dead stub so old callers do not crash; MUST NOT be used for notes.
  return '';
}
function ensureJerryMentionInNote(body) {
  // No-op: never prepend/replace Jerry mentions on internal notes.
  return String(body || '');
}

function mount(app) {
  app.get('/control/status', requireControl, (req, res) => {
    const s = loadState();
    res.json({
      ok: true,
      paused: isPaused(),
      pausedFlag: !!s.paused,
      pausedUntil: s.pausedUntil || null,
      testMode: getTestMode(),
      config: s.config,
      aiOffCount: Object.keys(s.aiOff || {}).length,
      features: [
        'stop', 'start', 'pause', 'status', 'config', 'prompt', 'model', 'test-mode',
        'ai-off', 'ai-on', 'reply', 'note', 'close', 'open', 'snooze',
        'assign', 'unassign', 'priority', 'tag', 'untag', 'intercom-proxy',
      ],
      time: new Date().toISOString(),
    });
  });

  app.post('/control/stop', requireControl, (req, res) => {
    const s = loadState();
    s.paused = true;
    s.pausedUntil = null;
    saveState(s);
    auditControl('stop', req, s);
    res.json({ ok: true, paused: true });
  });

  app.post('/control/start', requireControl, (req, res) => {
    const s = loadState();
    s.paused = false;
    s.pausedUntil = null;
    saveState(s);
    auditControl('start', req, s);
    res.json({ ok: true, paused: false });
  });

  app.post('/control/pause', requireControl, (req, res) => {
    const minutes = Number((req.body && req.body.minutes) || req.query.minutes || 5);
    if (!minutes || minutes < 1 || minutes > 24 * 60) {
      return res.status(400).json({ ok: false, error: 'minutes must be 1..1440' });
    }
    const s = loadState();
    s.paused = false;
    s.pausedUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    saveState(s);
    auditControl('pause', req, s, { minutes });
    res.json({ ok: true, paused: true, minutes, pausedUntil: s.pausedUntil });
  });

  // Reload the authorized-teammate list without a restart. Privileged like every other control
  // route (requireControl), validated and swapped atomically by teammateAdmins.reload(): on a
  // malformed file the previous set is kept and ok:false is returned. Audited like a mutation.
  app.post('/control/teammate-admins/reload', requireControl, (req, res) => {
    let result;
    try {
      result = require('./teammateAdmins').reload();
    } catch (e) {
      console.error('TEAMMATE_ADMINS_RELOAD_FAIL', e && e.message);
      auditControl('teammate-admins-reload', req, loadState(), { ok: false });
      return res.status(500).json({ ok: false, error: 'reload failed' });
    }
    auditControl('teammate-admins-reload', req, loadState(), {
      ok: result.ok, authorized: result.authorized, authority: result.authority, changed: result.changed,
    });
    return res.status(result.ok ? 200 : 409).json(result);
  });

  app.get('/control/config', requireControl, (req, res) => {
    res.json({ ok: true, config: getConfig() });
  });

  app.post('/control/config', requireControl, (req, res) => {
    const s = loadState();
    s.config = { ...s.config, ...(req.body || {}) };
    saveState(s);
    res.json({ ok: true, config: s.config });
  });

  app.get('/control/prompt', requireControl, (req, res) => {
    try {
      const text = getPrompt();
      res.json({ ok: true, chars: text.length, preview: text.slice(0, 200) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/control/prompt', requireControl, (req, res) => {
    const mode = (req.body && req.body.mode) || 'replace';
    const text = req.body && req.body.text;
    if (typeof text !== 'string' || !text.length) {
      return res.status(400).json({ ok: false, error: 'text required' });
    }
    try {
      if (mode === 'append') {
        fs.appendFileSync(PROMPT_FILE, text.startsWith('\n') ? text : '\n' + text);
      } else {
        fs.writeFileSync(PROMPT_FILE, text);
      }
      res.json({ ok: true, mode, chars: getPrompt().length });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/control/test-mode', requireControl, (req, res) => {
    const body = req.body || {};
    const tm = setTestMode({
      enabled: body.enabled,
      names: body.names,
      conversationIds: body.conversationIds,
    });
    if (body.conversation_id) allowTestConversationId(body.conversation_id);
    auditControl('test-mode', req, loadState(), { enabled: tm && tm.enabled });
    res.json({ ok: true, testMode: getTestMode() });
  });

  app.post('/control/model', requireControl, (req, res) => {
    const model = req.body && req.body.model;
    if (!model || typeof model !== 'string') {
      return res.status(400).json({ ok: false, error: 'model required' });
    }
    const s = loadState();
    s.config.model = model.trim();
    saveState(s);
    auditControl('model', req, s, { model: s.config.model });
    res.json({ ok: true, model: s.config.model });
  });

  app.post('/control/ai-off', requireControl, (req, res) => {
    const id = req.body && req.body.conversation_id;
    if (!id) return res.status(400).json({ ok: false, error: 'conversation_id required' });
    setAiOff(id);
    res.json({ ok: true, conversation_id: String(id), aiOff: true });
  });

  app.post('/control/ai-on', requireControl, (req, res) => {
    const id = req.body && req.body.conversation_id;
    if (!id) return res.status(400).json({ ok: false, error: 'conversation_id required' });
    clearAiOff(id);
    res.json({ ok: true, conversation_id: String(id), aiOff: false });
  });

  app.post('/control/allow-reply', requireControl, (req, res) => {
    const id = req.body && req.body.conversation_id;
    if (!id) return res.status(400).json({ ok: false, error: 'conversation_id required' });
    const allowed = setReplyAllowed(id, true);
    res.json({ ok: true, conversation_id: String(id), replyAllowed: allowed,
      testAllowed: isTestAllowed(id, ''), aiOff: isAiOff(id) });
  });

  app.post('/control/disallow-reply', requireControl, (req, res) => {
    const id = req.body && req.body.conversation_id;
    if (!id) return res.status(400).json({ ok: false, error: 'conversation_id required' });
    const allowed = setReplyAllowed(id, false);
    res.json({ ok: true, conversation_id: String(id), replyAllowed: allowed });
  });

  
function ensureIntercomSectionBreaks(body) {
  let s = String(body || '');
  if (!s) return s;
  // If plain/markdown-ish, apply light structure (bot path uses full formatIntercomHtml)
  if (!/<ul/i.test(s) && (/\n/.test(s) || /•/.test(s) || /\*\*/.test(s))) {
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/__([^_\n]+)__/g, '<b>$1</b>');
    s = s.replace(/^\s*[•\-]\s+/gm, '• ');
    // very light list wrap: consecutive • lines
    const lines = s.split(/\n/);
    const out = [];
    let buf = [];
    const flush = () => {
      if (!buf.length) return;
      out.push('<ul>' + buf.map((x) => '<li>' + x + '</li>').join('') + '</ul>');
      buf = [];
    };
    for (const line of lines) {
      const m = line.match(/^\s*•\s+(.*)$/);
      if (m) { buf.push(m[1].trim()); continue; }
      flush();
      out.push(line);
    }
    flush();
    s = out.join('\n');
    s = s.replace(/\n/g, '<br>');
  }
  s = s.replace(/<\/ul>(?:<br>|\s)*(<b>)/gi, '</ul><br>$1');
  s = s.replace(/(<\/b>)\s*<ul>/gi, '$1<br><ul>');
  s = s.replace(/<b>(?:<br>|\s)+/gi, '<b>');
  s = s.replace(/(?:<br>|\s)+<\/b>/gi, '</b>');
  s = s.replace(/(?:<br>){3,}/g, '<br><br>');
  return s;
}

async function convReply(id, payload) {
    return intercomRequest('POST', '/conversations/' + id + '/reply', {
      type: 'admin',
      admin_id: ADMIN_ID,
      ...payload,
    });
  }

  app.post('/control/reply', requireControl, async (req, res) => {
    const id = req.body && req.body.conversation_id;
    const body = req.body && req.body.body;
    if (!id || !body) return res.status(400).json({ ok: false, error: 'conversation_id and body required' });
    const r = await convReply(id, { message_type: 'comment', body: ensureIntercomSectionBreaks(body) });
    res.status(r.status >= 400 ? 500 : 200).json({ ok: r.status < 400, ...r });
  });

  app.post('/control/note', requireControl, async (req, res) => {
    const id = req.body && req.body.conversation_id;
    const body = req.body && req.body.body;
    if (!id || !body) return res.status(400).json({ ok: false, error: 'conversation_id and body required' });
    const r = await convReply(id, { message_type: 'note', body: String(body || '') }); // no Jerry auto-mention
    res.status(r.status >= 400 ? 500 : 200).json({ ok: r.status < 400, note: true, ...r });
  });

  app.post('/control/close', requireControl, async (req, res) => {
    const id = req.body && req.body.conversation_id;
    if (!id) return res.status(400).json({ ok: false, error: 'conversation_id required' });
    const r = await convReply(id, { message_type: 'close' });
    res.status(r.status >= 400 ? 500 : 200).json({ ok: r.status < 400, closed: true, ...r });
  });

  app.post('/control/open', requireControl, async (req, res) => {
    const id = req.body && req.body.conversation_id;
    if (!id) return res.status(400).json({ ok: false, error: 'conversation_id required' });
    const r = await convReply(id, { message_type: 'open' });
    res.status(r.status >= 400 ? 500 : 200).json({ ok: r.status < 400, opened: true, ...r });
  });

  app.post('/control/snooze', requireControl, async (req, res) => {
    const id = req.body && req.body.conversation_id;
    const minutes = Number((req.body && req.body.minutes) || 60);
    if (!id) return res.status(400).json({ ok: false, error: 'conversation_id required' });
    const snoozed_until = Math.floor(Date.now() / 1000) + minutes * 60;
    const r = await convReply(id, { message_type: 'snoozed', snoozed_until });
    res.status(r.status >= 400 ? 500 : 200).json({ ok: r.status < 400, snoozed_until, ...r });
  });

  app.post('/control/assign', requireControl, async (req, res) => {
    const id = req.body && req.body.conversation_id;
    const adminId = req.body && (req.body.admin_id || req.body.assignee_id);
    const teamId = req.body && req.body.team_id;
    if (!id || (!adminId && !teamId)) {
      return res.status(400).json({ ok: false, error: 'conversation_id and admin_id or team_id required' });
    }
    const payload = { message_type: 'assignment' };
    if (adminId) payload.assignee_id = Number(adminId);
    if (teamId) payload.team_assignee_id = Number(teamId);
    const r = await convReply(id, payload);
    res.status(r.status >= 400 ? 500 : 200).json({ ok: r.status < 400, ...r });
  });

  app.post('/control/unassign', requireControl, async (req, res) => {
    const id = req.body && req.body.conversation_id;
    if (!id) return res.status(400).json({ ok: false, error: 'conversation_id required' });
    const r = await convReply(id, { message_type: 'assignment', assignee_id: 0 });
    res.status(r.status >= 400 ? 500 : 200).json({ ok: r.status < 400, unassigned: true, ...r });
  });

  app.post('/control/priority', requireControl, async (req, res) => {
    const id = req.body && req.body.conversation_id;
    const priority = req.body ? req.body.priority : undefined;
    // A missing/omitted priority must not silently default to turning priority ON.
    if (!id || priority === undefined || priority === null || priority === '') {
      return res.status(400).json({ ok: false, error: 'conversation_id and priority required' });
    }
    const r = await intercomRequest('PUT', '/conversations/' + id, { priority: priority === 'priority' || priority === true ? 'priority' : 'not_priority' });
    res.status(r.status >= 400 ? 500 : 200).json({ ok: r.status < 400, ...r });
  });

  app.post('/control/tag', requireControl, async (req, res) => {
    const id = req.body && req.body.conversation_id;
    const tagId = req.body && (req.body.tag_id || req.body.id);
    if (!id || !tagId) return res.status(400).json({ ok: false, error: 'conversation_id and tag_id required' });
    const r = await intercomRequest('POST', '/conversations/' + id + '/tags', { id: Number(tagId), admin_id: Number(ADMIN_ID) });
    res.status(r.status >= 400 ? 500 : 200).json({ ok: r.status < 400, ...r });
  });

  app.post('/control/untag', requireControl, async (req, res) => {
    const id = req.body && req.body.conversation_id;
    const tagId = req.body && (req.body.tag_id || req.body.id);
    if (!id || !tagId) return res.status(400).json({ ok: false, error: 'conversation_id and tag_id required' });
    const r = await intercomRequest('DELETE', '/conversations/' + id + '/tags/' + tagId, { admin_id: Number(ADMIN_ID) });
    res.status(r.status >= 400 ? 500 : 200).json({ ok: r.status < 400, ...r });
  });

  // FULL Intercom API passthrough — any future feature without redeploy
  app.post('/control/intercom', requireControl, async (req, res) => {
    const method = (req.body && req.body.method) || 'GET';
    const path = req.body && req.body.path;
    if (!path || typeof path !== 'string' || path.includes('://') || path.includes('..')) {
      return res.status(400).json({ ok: false, error: 'path required (e.g. /conversations/123)' });
    }
    try {
      const r = await intercomRequest(method, path, req.body.body, req.body.query);
      res.status(200).json({ ok: r.status < 400, status: r.status, data: r.data });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });
}

module.exports = {
  mount,
  isPaused,
  getTestMode,
  setTestMode,
  allowTestConversationId,
  isTestAllowed,
  isReplyAllowed,
  setReplyAllowed,
  isAiOff,
  setAiOff,
  clearAiOff,
  getConfig,
  getModel,
  getPrompt,
};
