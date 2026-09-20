'use strict';

/**
 * schema.js - event / proposal / report shapes.
 *
 * The event taxonomy is NOT invented here: hard-fail codes come straight from
 * statePresend/presendMega.js (HARD) and its analytics CATEGORY_OF map, so the
 * maintainer speaks the same language as the live pre-send gate. Only the
 * signals presend cannot see (tools, latency, assignment, notes, loops) are
 * added on top.
 */

const crypto = require('crypto');
const path = require('path');

let sanitizeDeep = (v) => v;
let sanitizeCredentials = (s) => String(s == null ? '' : s);
(function loadSanitizer() {
  const candidates = [
    '../statePresend/credentialSanitizer',
    '../02_statePresend/credentialSanitizer',
    path.join(__dirname, '..', 'statePresend', 'credentialSanitizer'),
  ];
  for (const p of candidates) {
    try {
      const mod = require(p);
      if (mod && typeof mod.sanitizeDeep === 'function') {
        sanitizeDeep = mod.sanitizeDeep;
        sanitizeCredentials = mod.sanitizeCredentials;
        return;
      }
    } catch (_) { /* optional at load time */ }
  }
})();

const EXTRA = {
  TOOL_FAILURE: 'TOOL_FAILURE',
  TOOL_FALLBACK: 'TOOL_FALLBACK',
  LOOP_RETRY: 'LOOP_RETRY',
  LATENCY_ANOMALY: 'LATENCY_ANOMALY',
  API_USAGE_ANOMALY: 'API_USAGE_ANOMALY',
  ASSIGNMENT_ERROR: 'ASSIGNMENT_ERROR',
  REPLY_NOTE_MISTAKE: 'REPLY_NOTE_MISTAKE',
  MISSED_ESCALATION: 'MISSED_ESCALATION',
  STATE_HISTORY_ERROR: 'STATE_HISTORY_ERROR',
  TEAMMATE_CORRECTION: 'TEAMMATE_CORRECTION',
  RECURRING_KNOWLEDGE_GAP: 'RECURRING_KNOWLEDGE_GAP',
  RUNTIME_ERROR: 'RUNTIME_ERROR',
  REGRESSION_AFTER_CHANGE: 'REGRESSION_AFTER_CHANGE',
};

const SEVERITY = {
  UNSUPPORTED_FACT: 'critical', UNSUPPORTED_NUMBER: 'critical', UNSUPPORTED_PROMISE: 'critical',
  KNOWLEDGE_GAP_UNSAFE: 'critical', INTERNAL_INFO_LEAK: 'critical',
  HUMAN_CONTRADICTION: 'high', CONVERSATION_CONTRADICTION: 'high',
  REPEATED_QUESTION: 'high', ALREADY_COLLECTED_INFO_REQUEST: 'high', REPEATED_IMAGE_ASK: 'high',
  DUPLICATE_REPLY: 'high', SEMANTIC_REPEAT: 'high', MISSED_QUESTION: 'high',
  UNNECESSARY_ESCALATION: 'medium', UNNECESSARY_CLARIFICATION: 'medium', WRONG_TOPIC: 'medium',
  FORBIDDEN_FORMAT_OR_CONTENT: 'low', FORBIDDEN_DIAGNOSTIC_ACTION: 'critical', IMAGE_UNAVAILABLE_CLAIM: 'medium', EMPTY_REPLY: 'high',
  [EXTRA.TOOL_FAILURE]: 'high', [EXTRA.TOOL_FALLBACK]: 'medium', [EXTRA.LOOP_RETRY]: 'high',
  [EXTRA.LATENCY_ANOMALY]: 'medium', [EXTRA.API_USAGE_ANOMALY]: 'medium',
  [EXTRA.ASSIGNMENT_ERROR]: 'high', [EXTRA.REPLY_NOTE_MISTAKE]: 'critical',
  [EXTRA.MISSED_ESCALATION]: 'critical', [EXTRA.STATE_HISTORY_ERROR]: 'high',
  [EXTRA.TEAMMATE_CORRECTION]: 'high', [EXTRA.RECURRING_KNOWLEDGE_GAP]: 'medium',
  [EXTRA.RUNTIME_ERROR]: 'critical', [EXTRA.REGRESSION_AFTER_CHANGE]: 'critical',
};

const STATUS = {
  DRAFT: 'draft', EVALUATING: 'evaluating', EVALUATED: 'evaluated',
  AWAITING_APPROVAL: 'awaiting_approval', APPROVED: 'approved', REJECTED: 'rejected',
  BLOCKED_BY_LEDGER: 'blocked_by_ledger', FAILED_EVALUATION: 'failed_evaluation',
  DEPLOYED: 'deployed', ROLLED_BACK: 'rolled_back',
};

/**
 * Names that must never be accepted as the human approver, shared by approval.js
 * (the intended gate) and store.js (defense in depth against a caller that bypasses
 * the gate and calls setStatus directly). Deliberately broad: an approver string
 * must look like a real name, not a generic/automation placeholder.
 */
const NOT_A_HUMAN = new Set([
  '', 'n/a', 'na', 'none', 'null', 'undefined', 'unset', 'unknown',
  'luna-maintainer', 'maintainer', 'ai', 'system', 'bot', 'luna',
  'cron', 'cron-job', 'cronjob', 'automation', 'automated', 'script', 'ci', 'test',
]);

function looksHuman(name) {
  const who = String(name || '').trim().toLowerCase();
  if (NOT_A_HUMAN.has(who)) return false;
  return /[a-z]/i.test(who) && who.length >= 2;
}

const ROOT_CAUSES = [
  'prompt_instruction', 'business_rule', 'retrieval_rag', 'conversation_state',
  'tool_api', 'parsing_structured_output', 'code_bug', 'intercom_workflow',
  'formatting_presend', 'infrastructure', 'unknown',
];

function severityOf(code) { return SEVERITY[code] || 'medium'; }

function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16); }

/** Stable identity: excludes conversation id and time so one systemic failure is one bucket. */
function fingerprint(ev) {
  return sha(JSON.stringify({ c: ev.code, s: ev.signature || '', d: ev.detector || '' }));
}

function makeEvent(p) {
  const ev = {
    code: p.code,
    detector: p.detector || 'presend',
    severity: p.severity || severityOf(p.code),
    category: p.category || null,
    summary: sanitizeCredentials(p.summary || p.code),
    signature: p.signature || p.code,
    conversationId: p.conversationId ? String(p.conversationId) : '',
    messageId: p.messageId ? String(p.messageId) : '',
    evidence: sanitizeDeep(p.evidence || {}),
    engine: p.engine || '',
    at: Date.now(),
  };
  ev.fingerprint = fingerprint(ev);
  return ev;
}

/** Whitespace-normalised so cosmetic rewording of the same patch is still recognised. */
function patchHash(patch) {
  return sha(String(patch || '').split('\n').map((l) => l.replace(/\s+$/, '')).filter(Boolean).join('\n'));
}

module.exports = { EXTRA, SEVERITY, STATUS, ROOT_CAUSES, NOT_A_HUMAN, looksHuman, severityOf, fingerprint, makeEvent, patchHash, sha };
