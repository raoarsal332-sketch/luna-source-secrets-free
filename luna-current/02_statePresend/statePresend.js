'use strict';

/**
 * statePresend.js - integration facade required by the patched index.js.
 *
 * Hooks installed by apply-state-presend-on-vps.js:
 *   Hook T (after `let text = ...;`):
 *     __statePresend.noteInbound(conversationId, text, latestUser, imageAtts)
 *   Hook P (before the client reply is posted):
 *     const __presend = await __statePresend.gate({ conversationId, draft: body, latestUser, clientName, history: <historyExpr or null> });
 *     body = __presend.body;   and the send line is guarded with `if (__presend.send)`
 *
 * Modes (env LUNA_PRESEND_MODE): 'enforce' (default) | 'observe' (log only, never changes body).
 *
 * Existing live guards are reused (imageAskGuard, spreadAskGate); nothing is re-implemented.
 */

const T = require('./textUtils');
const conversationState = require('./conversationState');
const presend = require('./presendMega');
const regen = require('./targetedRegeneration');
const router = require('./router');
const gapGate = require('./knowledgeGapGate');
const imageX = require('./structuredImageExtractor');
const analytics = require('./analytics');
const { sanitizeCredentials } = require('./credentialSanitizer');
const { createTools } = require('./tools');

const STATE_PRESEND_VERSION = 'fresh-2026-09-16-state-presend-v1';

// Used only when a hard fail cannot be fixed deterministically and no
// regeneration is wired. Short, neutral, no figures, no em dash, no platform names.
const DEFAULT_FALLBACK_REPLY = 'Thanks for the details. I am checking this now and will update you here shortly.';

function fallbackReply() {
  const v = process.env.LUNA_PRESEND_FALLBACK_REPLY;
  if (v === undefined) return DEFAULT_FALLBACK_REPLY;
  return v.trim() ? v : null; // empty string disables the fallback (hold instead)
}

const guards = presend.loadGuards();

const memory = new Map(); // conversationId -> { messages: [], updatedAt }
const MEMORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MEMORY_MAX = 5000;
const MEMORY_MAX_MESSAGES = 60;

const lastVisionHint = new Map(); // conversationId -> last OCR/description hint
const VISION_HINT_TTL_MS = 24 * 60 * 60 * 1000;
const VISION_HINT_MAX = 2000;

const trace = analytics.createConversationTrace();
const errors = analytics.createErrorAnalytics();
const gaps = analytics.createKnowledgeGapAnalytics();
const corrections = analytics.createHumanCorrectionCapture();

let knowledgeRetriever = null;
let tools = null;

function mode() {
  const m = String(process.env.LUNA_PRESEND_MODE || 'enforce').toLowerCase();
  return m === 'observe' ? 'observe' : 'enforce';
}

/** Arsal posts as Intercom admin; without botAdminIds those replies look like human teammates. */
function botIdentityOpts() {
  const fromEnv = String(process.env.LUNA_BOT_ADMIN_IDS || process.env.ARSAL_ID || '')
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  // Live defaults from index.js (Arsal + Elite AI). Override via LUNA_BOT_ADMIN_IDS.
  const ids = fromEnv.length ? fromEnv : ['10118526', '8052954'];
  return {
    botName: process.env.LUNA_BOT_NAME || 'arsal',
    botAdminIds: ids,
  };
}

function mem(conversationId) {
  const k = String(conversationId);
  let e = memory.get(k);
  if (!e) {
    e = { messages: [], updatedAt: Date.now() };
    memory.set(k, e);
    if (memory.size % 100 === 0) prune();
  }
  e.updatedAt = Date.now();
  return e;
}

function prune() {
  const now = Date.now();
  for (const [k, e] of memory) if (now - e.updatedAt > MEMORY_TTL_MS) memory.delete(k);
  while (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value);
}

function push(e, msg) {
  e.messages.push(msg);
  if (e.messages.length > MEMORY_MAX_MESSAGES) e.messages.splice(0, e.messages.length - MEMORY_MAX_MESSAGES);
}

/** Hook T. Records the inbound client message (text already initialised by the engine). */
function noteInbound(conversationId, text, latestUser, attachments) {
  try {
    const e = mem(conversationId);
    const t = sanitizeCredentials(T.stripHtml(text));
    const atts = Array.isArray(attachments) ? attachments : (latestUser && Array.isArray(latestUser.attachments) ? latestUser.attachments : []);
    const ts = latestUser && (latestUser.created_at || latestUser.ts) ? Number(latestUser.created_at || latestUser.ts) : Date.now();
    const last = e.messages[e.messages.length - 1];
    if (last && last.role === 'client' && last.text === t && Math.abs((last.ts || 0) - ts) < 2000) return e; // webhook redelivery
    push(e, { role: 'client', text: t, ts, attachments: atts });
    return e;
  } catch (_) { return null; }
}

/** Records a public teammate reply if the engine sees one (optional hook). */
function noteHuman(conversationId, text, ts) {
  try { push(mem(conversationId), { role: 'human', text: sanitizeCredentials(T.stripHtml(text)), ts: ts || Date.now(), attachments: [] }); } catch (_) { /* ignore */ }
}

function noteOutbound(conversationId, body) {
  try { push(mem(conversationId), { role: 'bot', text: sanitizeCredentials(T.stripHtml(body)), ts: Date.now(), attachments: [] }); } catch (_) { /* ignore */ }
}

function imagesFor(conversationId) {
  try {
    if (guards.imageAskGuard) { const s = guards.imageAskGuard.snapshot(conversationId); return { received: s.imagesReceived, loaded: s.imagesLoaded }; }
  } catch (_) { /* ignore */ }
  return null;
}

/** Messages for state: engine-provided history when available, else observed memory. */
function messagesFor(conversationId, history, latestUser) {
  let msgs = [];
  if (history) {
    msgs = conversationState.normalizeMessages(history, botIdentityOpts());
  }
  const observed = mem(conversationId).messages;
  if (!msgs.length) msgs = observed.slice();
  else {
    // Ensure the latest inbound (possibly not yet in the fetched history) is present.
    const lastObs = observed[observed.length - 1];
    if (lastObs && lastObs.role === 'client' && !msgs.some((m) => m.role === 'client' && m.text === lastObs.text)) msgs.push(lastObs);
  }
  if (latestUser && latestUser.body) {
    const t = sanitizeCredentials(T.stripHtml(latestUser.body));
    if (t && !msgs.some((m) => m.role === 'client' && m.text === t)) msgs.push({ role: 'client', text: t, ts: Date.now(), attachments: latestUser.attachments || [] });
  }
  return msgs;
}

function buildState(conversationId, history, latestUser) {
  const msgs = messagesFor(conversationId, history, latestUser);
  const state = conversationState.buildState(msgs, { ...(botIdentityOpts()), images: imagesFor(conversationId) || undefined });
  return { state, messages: msgs };
}

/**
 * Hook P. Validates (and if needed corrects) the draft before the engine posts it.
 * Never throws. In 'observe' mode returns the original body with send:true.
 */
async function gate(p) {
  p = p || {};
  const conversationId = p.conversationId;
  const original = p.draft;
  const tr = trace.start(conversationId, p.messageId || (p.latestUser && p.latestUser.id));
  try {
    if (typeof original !== 'string') return finish({ body: original, send: true, reason: 'non-string-draft' });
    // The code-picked out-of-scope decline shares no vocabulary with the client's off-topic
    // question by design, so MISSED_QUESTION would always fire and escalate it to a human.
    // index.js sets scopeDecline only when the model's body was exactly the [[SCOPE_DECLINE]]
    // sentinel, never from the draft text, so the flag cannot be imitated by a reply.
    if (p.scopeDecline === true && original.trim()) return finish({ body: original, send: true, reason: 'scope-decline' });
    const { state, messages } = buildState(conversationId, p.history, p.latestUser);
    trace.record(tr, 'state', { schema_version: state.schema_version, current_stage: state.current_stage, known: Object.keys(state.known_details) });

    let knowledge = p.knowledge || null;
    if (knowledge && !knowledge.level) knowledge = gapGate.classify(knowledge, state.last_client_message);
    if (knowledge) trace.record(tr, 'knowledge', { level: knowledge.level, confidence: knowledge.confidence });

    const route = p.route || router.decide(state, { knowledgeLevel: knowledge && knowledge.level, hasImage: !!(p.latestUser && Array.isArray(p.latestUser.attachments) && p.latestUser.attachments.length) }).route;
    trace.record(tr, 'route', router.decide(state, { knowledgeLevel: knowledge && knowledge.level }));

    if (p.visionText) {
      const sx = imageX.shouldExtract({ state, text: state.last_client_message, imageCount: 1 });
      if (sx.extract) imageX.mergeIntoState(state, imageX.extract(p.visionText));
    }

    const ctx = { state, messages, knowledge, route, guards, conversationId, forbiddenPatterns: p.forbiddenPatterns || [], assigneeId: p.assigneeId, botIds: p.botIds || [] };
    const fb = p.fallbackReply !== undefined ? p.fallbackReply : fallbackReply();
    const out = await regen.runWithRegeneration({ draft: original, ctx, regenerate: p.regenerate || null, maxRetries: p.maxRetries, fallbackReply: fb || undefined, key: p.messageId ? `${conversationId}:${p.messageId}` : undefined });
    const first = out.results[0];
    trace.record(tr, 'presend', { ok: first.ok, codes: first.hardFails.map((f) => f.code), soft: first.softWarnings.map((w) => w.code) });
    trace.record(tr, 'regeneration', { attempts: out.attempts, regenerated: out.regenerated, finalReason: out.finalReason });
    errors.record(first, { conversationId });

    if (!first.ok) log(`presend ${mode()} conversation=${conversationId} route=${route} codes=${first.hardFails.map((f) => f.code).join(',')} final=${out.finalReason}`);

    // Critical maintainer codes must fail closed even while LUNA_PRESEND_MODE=observe.
    // Unrelated soft/observe behavior stays observe-only (fail-open for those).
    // UNSUPPORTED_NUMBER is mandatory: stating a policy value that contradicts the approved
// evidence is a factual error, and observe mode used to let it ship ("the minimum holding
// time is 99 minutes"). It only fires when evidence for the ask was actually supplied.
const FAIL_CLOSED_CODES = new Set(['MISSED_QUESTION', 'WRONG_TOPIC', 'REPEATED_IMAGE_ASK', 'MISSED_ESCALATION', 'DUPLICATE_REPLY', 'UNSUPPORTED_NUMBER', 'UNSUPPORTED_PROMISE', 'FORBIDDEN_DIAGNOSTIC_ACTION']);
    const mustFailClosed = !!(first && Array.isArray(first.hardFails) && first.hardFails.some((f) => FAIL_CLOSED_CODES.has(f.code)));

    if (mode() === 'observe' && !mustFailClosed) return finish({ body: original, send: true, reason: first.ok ? 'ok' : `observe:${out.finalReason}`, result: first, route, state });
    const decision = {
      body: out.send ? out.body : '',
      send: out.send,
      reason: (mode() === 'observe' && mustFailClosed) ? `enforce-critical:${out.finalReason}` : out.finalReason,
      result: first,
      route,
      state,
      regenerated: out.regenerated,
      attempts: out.attempts,
    };
    return finish(decision);
  } catch (e) {
    // Any exception here means none of the hard-fail checks (including the mandated
    // fail-closed codes: MISSED_QUESTION, WRONG_TOPIC, REPEATED_IMAGE_ASK, MISSED_ESCALATION)
    // ran to completion. Hold the send rather than shipping an unvalidated draft.
    log(`gate error (fail-closed, holding send): ${e && e.message}`);
    return finish({ body: original, send: false, reason: 'error-fail-closed' });
  }

  function finish(d) {
    if (d.send && typeof d.body === 'string' && d.body.trim()) noteOutbound(conversationId, d.body);
    d.trace = trace.finish(tr, { sent: d.send, reason: d.reason, changed: d.body !== original });
    d.version = STATE_PRESEND_VERSION;
    return d;
  }
}

function log(msg) {
  try { console.log(`[statePresend] ${msg}`); } catch (_) { /* ignore */ }
}

/** Wire the existing FAQ retriever once; tools become available afterwards. */
function noteVisionHint(conversationId, text) {
  try {
    const t = T.stripHtml(text);
    if (!t) return;
    const k = String(conversationId);
    lastVisionHint.set(k, { text: t, at: Date.now() });
    if (lastVisionHint.size > VISION_HINT_MAX) {
      const first = lastVisionHint.keys().next().value;
      lastVisionHint.delete(first);
    }
  } catch (_) { /* ignore */ }
}

function getLastVisionHint(conversationId) {
  try {
    const e = lastVisionHint.get(String(conversationId));
    if (!e) return '';
    if (Date.now() - (e.at || 0) > VISION_HINT_TTL_MS) {
      lastVisionHint.delete(String(conversationId));
      return '';
    }
    return e.text || '';
  } catch (_) {
    return '';
  }
}

function configure(o) {
  o = o || {};
  if (typeof o.retriever === 'function') knowledgeRetriever = o.retriever;
  tools = createTools({
    retriever: knowledgeRetriever,
    knowledgeGapAnalytics: gaps,
    getMessages: o.getMessages || (async (conversationId) => mem(conversationId).messages.slice()),
    getImages: o.getImages || ((conversationId) => imagesFor(conversationId)),
    escalateGetter: typeof o.escalateGetter === 'function' ? o.escalateGetter : undefined,
    getLastVisionHint: typeof o.getLastVisionHint === 'function' ? o.getLastVisionHint : getLastVisionHint,
  });
  return tools;
}

function getTools() { return tools || configure({}); }

function getState(conversationId, history, latestUser) {
  return conversationState.publicView(buildState(conversationId, history, latestUser).state);
}

function snapshot(conversationId) {
  return { memory: mem(conversationId).messages.slice(), images: imagesFor(conversationId) };
}

function resetAll() { memory.clear(); lastVisionHint.clear(); errors.reset(); gaps.reset(); }

module.exports = {
  STATE_PRESEND_VERSION,
  DEFAULT_FALLBACK_REPLY,
  noteInbound, noteHuman, noteOutbound, noteVisionHint, getLastVisionHint,
  gate, buildState, getState, snapshot, resetAll,
  configure, getTools,
  analytics: { trace, errors, gaps, corrections },
  guards, mode,
  modules: { conversationState, presend, regen, router, gapGate, imageX },
};
