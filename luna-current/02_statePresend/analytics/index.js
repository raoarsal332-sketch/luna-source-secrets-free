'use strict';

/**
 * analytics/index.js - Phase 6 foundations. Lightweight, in-memory, optional
 * JSONL persistence. Nothing here changes production behavior automatically.
 *
 *   conversationTrace      - per-message trace (route, state version, knowledge, presend, retry, outcome)
 *   errorAnalytics         - counts of presend reason codes
 *   knowledgeGapAnalytics  - recurring unsupported/partial knowledge queries
 *   humanCorrectionCapture - teammate corrections after a bot reply, for review
 *   failureToTestConverter - turns a reviewed capture/trace into a golden test case (reviewed:false until approved)
 */

const fs = require('fs');
const path = require('path');
const { sanitizeCredentials } = require('../credentialSanitizer');

function appendJsonl(file, obj) {
  if (!file) return false;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(obj) + '\n');
    return true;
  } catch (_) { return false; }
}

function redact(text) {
  return sanitizeCredentials(text)
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b(?:\+?\d[\d\s-]{8,}\d)\b/g, (m) => (/^\d{5,7}$/.test(m.replace(/\D/g, '')) ? m : '[number]'));
}


// --- conversationTrace -------------------------------------------------------

function createConversationTrace(opts) {
  opts = opts || {};
  const file = opts.file || process.env.LUNA_TRACE_FILE || null;
  const recent = [];
  const max = opts.maxRecent || 200;

  function start(conversationId, messageId) {
    return { conversation_id: String(conversationId), message_id: messageId !== undefined ? String(messageId) : null, started_at: Date.now(), steps: {} };
  }
  function record(trace, stage, data) {
    if (!trace) return;
    trace.steps[stage] = { at: Date.now(), ...(data || {}) };
  }
  function finish(trace, outcome) {
    if (!trace) return null;
    trace.finished_at = Date.now();
    trace.duration_ms = trace.finished_at - trace.started_at;
    trace.outcome = outcome || null;
    const compact = {
      conversation_id: trace.conversation_id, message_id: trace.message_id, duration_ms: trace.duration_ms,
      route: trace.steps.route && trace.steps.route.route, route_reasons: trace.steps.route && trace.steps.route.reasons,
      state_version: trace.steps.state && trace.steps.state.schema_version, stage: trace.steps.state && trace.steps.state.current_stage,
      knowledge_level: trace.steps.knowledge && trace.steps.knowledge.level,
      presend_ok: trace.steps.presend && trace.steps.presend.ok, reason_codes: trace.steps.presend && trace.steps.presend.codes,
      soft_codes: trace.steps.presend && trace.steps.presend.soft,
      retried: !!(trace.steps.regeneration && trace.steps.regeneration.attempts), regeneration: trace.steps.regeneration,
      outcome: trace.outcome,
    };
    recent.push(compact);
    if (recent.length > max) recent.shift();
    appendJsonl(file, compact);
    return compact;
  }
  return { start, record, finish, recent: () => recent.slice(), redact };
}

// --- errorAnalytics ----------------------------------------------------------

const CATEGORY_OF = {
  REPEATED_QUESTION: 'repeated_question', ALREADY_COLLECTED_INFO_REQUEST: 'repeated_question', REPEATED_IMAGE_ASK: 'repeated_question',
  DUPLICATE_REPLY: 'duplicate_reply', SEMANTIC_REPEAT: 'duplicate_reply',
  KNOWLEDGE_GAP_UNSAFE: 'knowledge_gap', UNSUPPORTED_FACT: 'unsupported_fact', UNSUPPORTED_NUMBER: 'unsupported_fact', UNSUPPORTED_PROMISE: 'unsupported_fact',
  MISSED_QUESTION: 'missed_question', UNNECESSARY_CLARIFICATION: 'unnecessary_clarification',
  HUMAN_CONTRADICTION: 'human_contradiction', CONVERSATION_CONTRADICTION: 'human_contradiction',
  UNNECESSARY_ESCALATION: 'escalation_error', MISSED_ESCALATION: 'escalation_error', WRONG_TOPIC: 'wrong_topic', INTERNAL_INFO_LEAK: 'leak',   FORBIDDEN_FORMAT_OR_CONTENT: 'format', FORBIDDEN_DIAGNOSTIC_ACTION: 'safety', IMAGE_UNAVAILABLE_CLAIM: 'image', EMPTY_REPLY: 'format',
};

function createErrorAnalytics(opts) {
  opts = opts || {};
  const codes = new Map();
  const categories = new Map();
  let total = 0;
  function record(presendResult, meta) {
    if (!presendResult || !presendResult.hardFails) return;
    total += 1;
    for (const f of presendResult.hardFails) {
      codes.set(f.code, (codes.get(f.code) || 0) + 1);
      const cat = CATEGORY_OF[f.code] || 'other';
      categories.set(cat, (categories.get(cat) || 0) + 1);
    }
    if (presendResult.hardFails.length) appendJsonl(opts.file || process.env.LUNA_ERROR_FILE || null, { at: Date.now(), conversation_id: meta && meta.conversationId, codes: presendResult.hardFails.map((f) => f.code) });
  }
  function summary() {
    return { drafts_checked: total, by_code: Object.fromEntries([...codes].sort((a, b) => b[1] - a[1])), by_category: Object.fromEntries([...categories].sort((a, b) => b[1] - a[1])) };
  }
  return { record, summary, reset: () => { codes.clear(); categories.clear(); total = 0; } };
}

// --- knowledgeGapAnalytics --------------------------------------------------

function createKnowledgeGapAnalytics(opts) {
  opts = opts || {};
  const gaps = new Map();
  function norm(q) { return String(q || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter((w) => w.length > 2).sort().join(' '); }
  function record(query, level, conversationId) {
    const k = norm(query);
    if (!k) return;
    const e = gaps.get(k) || { key: k, example: String(query).slice(0, 160), count: 0, levels: {}, conversations: new Set() };
    e.count += 1;
    e.levels[level] = (e.levels[level] || 0) + 1;
    if (conversationId !== undefined) e.conversations.add(String(conversationId));
    gaps.set(k, e);
    appendJsonl(opts.file || process.env.LUNA_KNOWLEDGE_GAP_FILE || null, { at: Date.now(), query: String(query).slice(0, 200), level, conversation_id: conversationId });
  }
  function top(n) {
    return [...gaps.values()].sort((a, b) => b.count - a.count).slice(0, n || 20).map((e) => ({ example: e.example, count: e.count, levels: e.levels, conversations: e.conversations.size }));
  }
  return { record, top, reset: () => gaps.clear() };
}

// --- humanCorrectionCapture --------------------------------------------------

function createHumanCorrectionCapture(opts) {
  opts = opts || {};
  const items = [];
  const CORRECTION_RE = /\b(?:actually|correction|that(?:'s| is) (?:not|in)correct|ignore (?:the )?(?:previous|above|bot)|sorry for the confusion|to clarify|let me correct|the correct)\b/i;
  /**
   * Call when a teammate replies after a bot message. Captures only if the
   * teammate message looks like a correction or the takeover happened within
   * a short window after the bot reply.
   */
  function capture(p) {
    p = p || {};
    const human = String(p.humanReply || '');
    const looksCorrective = CORRECTION_RE.test(human);
    const quickTakeover = p.botAt && p.humanAt ? (p.humanAt - p.botAt) <= (opts.takeoverWindowMs || 30 * 60 * 1000) : false;
    if (!looksCorrective && !quickTakeover) return null;
    const item = {
      id: `${p.conversationId}-${p.humanAt || Date.now()}`, at: Date.now(), conversation_id: String(p.conversationId),
      bot_reply: redact(p.botReply || ''), human_reply: redact(human), client_context: redact(p.clientMessage || ''),
      state_snapshot: p.state ? { known_details: p.state.known_details, active_topics: p.state.active_topics, stage: p.state.current_stage } : null,
      kind: looksCorrective ? 'explicit-correction' : 'quick-takeover', reviewed: false,
    };
    items.push(item);
    appendJsonl(opts.file || process.env.LUNA_HUMAN_CORRECTION_FILE || null, item);
    return item;
  }
  return { capture, items: () => items.slice(), CORRECTION_RE };
}

// --- failureToTestConverter --------------------------------------------------

/**
 * Converts a confirmed production failure into a golden test case skeleton.
 * The case is written with reviewed:false and ignored by the test runner until
 * a human sets reviewed:true and fills `expected`.
 */
function toGoldenCase(p) {
  p = p || {};
  if (!Array.isArray(p.messages) || !p.messages.length) throw new Error('messages required');
  return {
    id: p.id || `case-${Date.now()}`,
    title: p.title || 'Untitled production failure',
    source: { conversation_id: p.conversationId ? String(p.conversationId) : null, captured_at: new Date().toISOString(), trace: p.trace || null },
    reviewed: false,
    messages: p.messages.map((m) => ({ role: m.role, text: redact(m.text), attachments: m.attachments ? m.attachments.length : 0 })),
    draft: p.draft !== undefined ? redact(p.draft) : null,
    expected: p.expected || { presend_ok: null, must_fail_codes: [], must_not_fail_codes: [], reply_must_not_match: [], reply_must_match: [] },
    notes: p.notes || 'Fill expected.* and set reviewed:true after human review.',
  };
}

function writeGoldenCase(dir, c) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${c.id.replace(/[^\w.-]/g, '_')}.json`);
  fs.writeFileSync(file, JSON.stringify(c, null, 2));
  return file;
}

module.exports = { createConversationTrace, createErrorAnalytics, createKnowledgeGapAnalytics, createHumanCorrectionCapture, toGoldenCase, writeGoldenCase, redact, CATEGORY_OF, appendJsonl };
