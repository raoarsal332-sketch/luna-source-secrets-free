'use strict';

/**
 * detectors.js - turns observations into structured improvement events.
 *
 * REUSE, NOT REBUILD:
 *   - hard-fail codes come from the live presendMega result (`gate().result`);
 *     they are not re-detected here.
 *   - teammate corrections come from analytics.corrections (humanCorrectionCapture).
 *   - recurring knowledge gaps come from analytics.gaps.
 * Only the signals the pre-send gate structurally cannot see are detected here:
 * tool failures, latency/API usage, retry loops, assignment, note-vs-reply,
 * missed escalation, state truncation and runtime errors.
 *
 * Detection stays rule-based on purpose: it must be cheap and explainable, and
 * it must never hallucinate its own input. The LLM enters later, at analysis.
 */

const { makeEvent, EXTRA } = require('./schema');

const REGISTRY = {};
function register(name, fn) { REGISTRY[name] = fn; }

const ESCALATE_RE = /\b(speak (?:to|with) (a |an |my )?(human|agent|person|advisor|manager|supervisor)|live agent|real person|talk to (a |an |my )?(human|agent|person|manager|supervisor)|connect(?: me)? (?:to|with) (a |an |my )?(human|agent|person|manager|supervisor)|manager|supervisor|chargeback|legal|complaint)\b/i;

/** 1. Pre-send hard fails - taxonomy owned by presendMega, reused verbatim. */
function fromPresend(gateResult, meta) {
  const out = [];
  const r = gateResult && gateResult.result;
  if (!r || !Array.isArray(r.hardFails)) return out;
  let CATEGORY_OF = {};
  try { CATEGORY_OF = require('./bridge').categoryOf(meta && meta.lunaRoot) || {}; } catch (_) { /* optional */ }
  for (const f of r.hardFails) {
    out.push(makeEvent({
      code: f.code,
      detector: 'presendMega',
      category: CATEGORY_OF[f.code] || null,
      summary: `Pre-send hard fail ${f.code}${f.detail ? `: ${String(f.detail).slice(0, 160)}` : ''}`,
      signature: f.code,
      conversationId: meta && meta.conversationId,
      messageId: meta && meta.messageId,
      engine: gateResult.version || '',
      evidence: {
        code: f.code, detail: f.detail || null, route: gateResult.route || null,
        finalReason: gateResult.reason || null, regenerated: !!gateResult.regenerated,
        attempts: gateResult.attempts || 0, sent: !!gateResult.send,
        stage: gateResult.state && gateResult.state.current_stage,
      },
    }));
  }
  return out;
}
register('presend', fromPresend);

/** 2. Everything presend cannot see. `turn` is assembled by the index.js hook. */
function fromTurn(turn, cfg) {
  const out = [];
  const t = turn || {};
  const push = (code, summary, signature, evidence) => out.push(makeEvent({
    code, detector: 'turn', summary, signature,
    conversationId: t.conversationId, messageId: t.messageId,
    engine: t.engine || '', evidence: evidence || {},
  }));

  for (const name of t.toolFailures || []) push(EXTRA.TOOL_FAILURE, `Tool/API call failed: ${name}`, `tool_failure:${name}`, { tool: name });
  for (const name of t.toolFallbacks || []) push(EXTRA.TOOL_FALLBACK, `Tool fell back to a degraded path: ${name}`, `tool_fallback:${name}`, { tool: name });

  if (Number(t.retries) > cfg.maxRetries) push(EXTRA.LOOP_RETRY, `Retry loop: ${t.retries} regeneration attempts for one message.`, 'loop_retry', { retries: t.retries });
  if (Number(t.latencyMs) > cfg.latencyMs) push(EXTRA.LATENCY_ANOMALY, `Latency ${Math.round(t.latencyMs)}ms above ${cfg.latencyMs}ms.`, 'latency_anomaly', { latencyMs: t.latencyMs });
  if (Number(t.apiCalls) > cfg.maxApiCalls) push(EXTRA.API_USAGE_ANOMALY, `${t.apiCalls} model/API calls for a single message.`, 'api_usage_anomaly', { apiCalls: t.apiCalls, tokens: t.tokens || null, cached: t.tokensCached || null });

  if (t.error) push(EXTRA.RUNTIME_ERROR, `Unhandled error while answering: ${String(t.error).slice(0, 200)}`, `runtime_error:${String(t.error).split(':')[0].slice(0, 60)}`, { error: String(t.error).slice(0, 500) });

  // reply vs internal note
  if (t.expectedNote === true && t.isNote === false) push(EXTRA.REPLY_NOTE_MISTAKE, 'Internal-note content was sent as a customer-visible reply.', 'note_sent_as_reply', { body: String(t.body || '').slice(0, 300) });
  if (t.expectedNote === false && t.isNote === true && t.authorType === 'customer') push(EXTRA.REPLY_NOTE_MISTAKE, 'Customer answer was written as an internal note; the client saw nothing.', 'reply_sent_as_note', {});

  // assignment / escalation handling
  if (t.expectedAssigneeId && String(t.assignedToId || '') !== String(t.expectedAssigneeId)) {
    push(EXTRA.ASSIGNMENT_ERROR, `Assigned to '${t.assignedToId || 'nobody'}', expected '${t.expectedAssigneeId}'.`, 'assignment_mismatch', { expected: t.expectedAssigneeId, actual: t.assignedToId || null });
  }
  if (t.escalated && !t.assignedToId) push(EXTRA.ASSIGNMENT_ERROR, 'Escalated without assigning the conversation to a teammate.', 'escalated_unassigned', {});
  if (!t.escalated && t.authorType === 'customer' && ESCALATE_RE.test(String(t.clientText || ''))) {
    push(EXTRA.MISSED_ESCALATION, 'Client asked for a human / raised a handoff topic but no escalation happened.', 'missed_escalation', { clientText: String(t.clientText).slice(0, 300), sent: !!t.sent });
  }

  // conversation state integrity
  if (t.historyTruncated) push(EXTRA.STATE_HISTORY_ERROR, 'Conversation history was truncated before the model call.', 'history_truncated', { historyLength: t.historyLength || null });
  if (t.stateMismatch) push(EXTRA.STATE_HISTORY_ERROR, 'Cached conversation state disagreed with the fetched Intercom state.', 'state_mismatch', {});

  return out;
}
register('turn', fromTurn);

/** 3. Teammate corrections - captured by the EXISTING humanCorrectionCapture. */
function fromCorrection(item) {
  if (!item) return [];
  return [makeEvent({
    code: EXTRA.TEAMMATE_CORRECTION, detector: 'analytics.corrections',
    summary: `Teammate ${item.kind === 'explicit-correction' ? 'corrected Luna' : 'took over shortly after a bot reply'}.`,
    signature: `teammate_correction:${item.kind}`,
    conversationId: item.conversation_id,
    evidence: { kind: item.kind, botReply: item.bot_reply, humanReply: item.human_reply, clientContext: item.client_context, state: item.state_snapshot },
  })];
}
register('corrections', fromCorrection);

/** 4. Recurring knowledge gaps - from the EXISTING knowledgeGapAnalytics.top(). */
function fromKnowledgeGaps(top, minCount) {
  return (top || []).filter((g) => g.count >= (minCount || 3)).map((g) => makeEvent({
    code: EXTRA.RECURRING_KNOWLEDGE_GAP, detector: 'analytics.gaps',
    summary: `Knowledge gap asked ${g.count} times across ${g.conversations} conversations: "${g.example}"`,
    signature: `knowledge_gap:${g.example.toLowerCase().slice(0, 60)}`,
    evidence: { example: g.example, count: g.count, levels: g.levels, conversations: g.conversations },
  }));
}
register('knowledgeGaps', fromKnowledgeGaps);

module.exports = { REGISTRY, register, fromPresend, fromTurn, fromCorrection, fromKnowledgeGaps, ESCALATE_RE };
