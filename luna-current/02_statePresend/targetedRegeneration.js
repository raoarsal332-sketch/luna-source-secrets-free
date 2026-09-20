'use strict';

/**
 * targetedRegeneration.js - Phase 3.
 *
 * runWithRegeneration({ draft, ctx, validate, regenerate, maxRetries })
 *   1. validate(draft)
 *   2. on hard fail: regenerate(correctionInstruction, failures) at most maxRetries times (default 1)
 *   3. if still failing: deterministic safe fallback (strip offending sentences, or skip send)
 *
 * Never loops. Never sends. Returns a decision object the engine acts on.
 * Protects the caller against double-send with an in-flight key set.
 */

const T = require('./textUtils');
const presend = require('./presendMega');

const inflight = new Set();

function stripSentences(draft, predicate) {
  const parts = T.stripHtml(draft).split(/(?<=[.!?])\s+/);
  const kept = parts.filter((s) => !predicate(s));
  return kept.join(' ').trim();
}

const ASK_ITEM_RE = {
  account_number: /\b(?:account|login|trading account|acc)\s*(?:number|no\.?|id|#)/i,
  email: /\be-?mail\b/i,
  order_id: /\b(?:order|payment|transaction|invoice)\s*(?:id|number|no\.?|reference)/i,
};

// Sent instead of the generic checking-line when the client's own last message gives no
// question or topic to work with at all (garbled/ambiguous input). Short, neutral, one ask.
const CLARIFY_REPLY = 'Sorry, I want to make sure I get this right - could you tell me a bit more about what you mean?';

/**
 * MISSED_QUESTION / WRONG_TOPIC reaching here means regeneration (if any ran) still
 * could not produce a compliant draft. Rather than always shipping the generic
 * "checking this now" line, tell clarify from escalate:
 *  - the client's last message has no extractable question/topic at all -> we do not
 *    understand it -> ask one short clarification (once; a repeat means escalate).
 *  - otherwise we understood the ask but cannot answer/comply -> hand off to a human via
 *    the engine's existing escalate path (same as MISSED_ESCALATION, reused, not duplicated).
 * Returns null for codes this distinction does not apply to (e.g. REPEATED_IMAGE_ASK,
 * which already has its own dedicated fix/hold handling above and below).
 */
function decideFallbackIntent(codes, opts) {
  // A policy value contradicting the approved evidence is understood but unanswerable by the
  // bot: it must go to a teammate, never to the generic checking line and never as the wrong
  // figure. Handled before the clarify/escalate split because the ask itself was understood.
  if (codes.has(presend.HARD.UNSUPPORTED_NUMBER) || codes.has(presend.HARD.FORBIDDEN_DIAGNOSTIC_ACTION) || codes.has(presend.HARD.UNSUPPORTED_PROMISE)) return 'escalate';
  if (!codes.has(presend.HARD.MISSED_QUESTION) && !codes.has(presend.HARD.WRONG_TOPIC)) return null;
  const state = opts.ctx && opts.ctx.state;
  const lastClient = (state && state.last_client_message) || '';
  const understood = T.extractQuestions(lastClient).length > 0 || T.extractTopics(lastClient).length > 0;
  if (understood) return 'escalate';
  const recentBotReplies = state && Array.isArray(state.last_bot_replies) ? state.last_bot_replies.slice() : [];
  if (state && state.last_bot_reply) recentBotReplies.push(state.last_bot_reply);
  const alreadyAskedClarify = recentBotReplies.some((r) => T.normalize(r) === T.normalize(CLARIFY_REPLY));
  return alreadyAskedClarify ? 'escalate' : 'clarify';
}

/**
 * Deterministic fallback when regeneration is unavailable or still fails.
 * Returns { body, send, reason }.
 */
function safeFallback(draft, result, opts) {
  opts = opts || {};
  let body = T.stripHtml(draft);
  const codes = new Set(result.hardFails.map((f) => f.code));

  // Duplicates: safest is not to send the same thing twice.
  if (codes.has(presend.HARD.DUPLICATE_REPLY) || codes.has(presend.HARD.SEMANTIC_REPEAT)) {
    return { body: '', send: false, reason: 'duplicate-suppressed' };
  }

  // Strip fixable sentences (repeated asks, em dash).
  for (const f of result.hardFails) {
    if (f.fixable === 'strip-ask' && f.item && ASK_ITEM_RE[f.item]) {
      body = stripSentences(body, (s) => ASK_ITEM_RE[f.item].test(s) && T.isQuestionSentence(s) || (ASK_ITEM_RE[f.item].test(s) && /\b(?:please|could you|can you|share|provide|send)\b/i.test(s)));
    }
    if (f.fixable === 'strip-em-dash') body = body.replace(/\s*\u2014\s*/g, ', ');
  }
  // Image asks: reuse imageAskGuard replacement text if available.
  if ((codes.has(presend.HARD.REPEATED_IMAGE_ASK) || codes.has(presend.HARD.IMAGE_UNAVAILABLE_CLAIM)) && opts.imageAskGuard && opts.conversationId !== undefined) {
    try { body = opts.imageAskGuard.hookD(opts.conversationId, body); } catch (_) { /* ignore */ }
  }

  // Missed human handoff: never send a normal/fallback reply — hold so the engine can escalate.
  if (codes.has(presend.HARD.MISSED_ESCALATION)) {
    return { body: '', send: false, reason: 'missed-escalation-held' };
  }

  // Re-validate the stripped body with the same context; only accept if clean.
  const re = presend.validate(body, opts.ctx || {});
  if (body && re.ok && body.split(/\s+/).length >= 2) return { body, send: true, reason: 'deterministic-fix' };

  // These codes must never ship the original failing draft. Prefer safe fallback,
  // else hold (fail closed).
  // UNSUPPORTED_NUMBER means the draft states a policy value the approved evidence
  // contradicts. Shipping the generic holding line there would leave the client with nothing,
  // so it takes the same clarify/escalate route as the other critical codes.
  const critical = codes.has(presend.HARD.MISSED_QUESTION) || codes.has(presend.HARD.WRONG_TOPIC) || codes.has(presend.HARD.REPEATED_IMAGE_ASK) || codes.has(presend.HARD.MISSED_ESCALATION) || codes.has(presend.HARD.UNSUPPORTED_NUMBER) || codes.has(presend.HARD.FORBIDDEN_DIAGNOSTIC_ACTION) || codes.has(presend.HARD.UNSUPPORTED_PROMISE);

  // MISSED_QUESTION / WRONG_TOPIC: never fall straight to the generic checking-line when a
  // clarify or an escalate is possible instead (Arsal requirement - see CLAUDE.md task notes).
  const intent = decideFallbackIntent(codes, opts);
  if (intent === 'clarify') return { body: CLARIFY_REPLY, send: true, reason: 'clarify-reply' };
  if (intent === 'escalate') return { body: '', send: false, reason: 'needs-escalate' };

  // Unfixable: use the engine's safe fallback message if given (and not itself a
  // repeat of any recent reply), otherwise hold.
  if (opts.fallbackReply) {
    const state = opts.ctx && opts.ctx.state;
    const recentBotReplies = state && Array.isArray(state.last_bot_replies) ? state.last_bot_replies.slice() : [];
    if (state && state.last_bot_reply) recentBotReplies.push(state.last_bot_reply);
    if (recentBotReplies.some((reply) => T.normalize(reply) === T.normalize(opts.fallbackReply))) {
      return { body: '', send: false, reason: 'fallback-would-repeat-held' };
    }
    // Neutral fallback will often still trip MISSED_QUESTION (it does not answer
    // every ask). That is expected: we replace the bad draft with a short ack.
    // Only hold if the fallback itself is still WRONG_TOPIC or a repeated image ask.
    if (critical) {
      const fbCheck = presend.validate(opts.fallbackReply, opts.ctx || {});
      const stillBad = (fbCheck.hardFails || []).some((f) => f.code === presend.HARD.WRONG_TOPIC || f.code === presend.HARD.REPEATED_IMAGE_ASK || f.code === presend.HARD.MISSED_ESCALATION);
      if (stillBad) return { body: '', send: false, reason: 'critical-unfixable-held' };
    }
    return { body: opts.fallbackReply, send: true, reason: 'fallback-reply' };
  }
  return { body: '', send: false, reason: critical ? 'critical-unfixable-held' : 'unfixable-held' };
}

// Keys processed recently (webhook redelivery protection). Cleared after RECENT_MS.
const recentKeys = new Map();
const RECENT_MS = 60 * 1000;

function seenRecently(key) {
  const now = Date.now();
  for (const [k, t] of recentKeys) if (now - t > RECENT_MS) recentKeys.delete(k);
  if (recentKeys.has(key)) return true;
  recentKeys.set(key, now);
  return false;
}

/**
 * @param {object} p
 * @param {string} p.draft
 * @param {object} p.ctx presendMega ctx
 * @param {function} [p.regenerate] async (correctionInstruction, failures, ctx) => newDraft | null
 * @param {number} [p.maxRetries] default 1
 * @param {string} [p.fallbackReply]
 * @param {string} [p.key] idempotency key (conversation id + inbound message id)
 * @returns {Promise<{body:string, send:boolean, attempts:number, regenerated:boolean, results:Array, finalReason:string}>}
 */
async function runWithRegeneration(p) {
  const maxRetries = Number.isInteger(p.maxRetries) ? Math.min(Math.max(p.maxRetries, 0), 2) : 1;
  const key = p.key !== undefined ? String(p.key) : null;
  if (key !== null) {
    if (inflight.has(key) || seenRecently(key)) return { body: '', send: false, attempts: 0, regenerated: false, results: [], finalReason: 'duplicate-inflight' };
    inflight.add(key);
  }
  try {
    const results = [];
    let draft = p.draft;
    let attempts = 0;
    let regenerated = false;
    let result = presend.validate(draft, p.ctx);
    results.push(result);
    while (!result.ok && attempts < maxRetries && typeof p.regenerate === 'function') {
      attempts += 1;
      let next = null;
      try { next = await p.regenerate(result.correctionInstruction, result.hardFails, p.ctx); } catch (_) { next = null; }
      if (typeof next !== 'string' || !next.trim()) break;
      regenerated = true;
      draft = next;
      result = presend.validate(draft, p.ctx);
      results.push(result);
    }
    if (result.ok) return { body: draft, send: true, attempts, regenerated, results, finalReason: attempts ? 'regenerated-ok' : 'ok' };
    const fb = safeFallback(draft, result, { ctx: p.ctx, fallbackReply: p.fallbackReply, imageAskGuard: p.ctx && p.ctx.guards && p.ctx.guards.imageAskGuard, conversationId: p.ctx && p.ctx.conversationId });
    return { body: fb.body, send: fb.send, attempts, regenerated, results, finalReason: fb.reason };
  } finally {
    if (key !== null) inflight.delete(key);
  }
}

module.exports = { runWithRegeneration, safeFallback, stripSentences, decideFallbackIntent, CLARIFY_REPLY, inflight, recentKeys };
