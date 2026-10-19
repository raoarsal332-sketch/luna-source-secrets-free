'use strict';

/**
 * lunaEpisode.js — the budget that is attached to ONE accepted inbound customer event.
 *
 * A processing episode covers everything Luna does for that one event: FAST generation, a
 * FAST→FULL promotion, every model call, every tool round, the exhaustion finalization,
 * presend regeneration and the duplicate-reply rewrite. Wrapper calls and retries consume the
 * SAME budget — they never reset it. That is the whole point: before this module, a retry
 * path could quietly start a second four-round tool loop.
 *
 * Luna runs single-instance in PM2 fork mode and serializes work per conversation, so the
 * active episode is held in a small registry keyed by conversation id. Helper functions deep
 * in index.js (note English overlay, problem polish, escalation summary) can therefore reach
 * the live budget without threading a parameter through a 270k-line file.
 *
 * If a helper runs with no episode open, `current()` hands back a DETACHED episode: it still
 * enforces the MEDIUM floor and still logs, but it cannot consume or reset a real customer
 * budget.
 */

const DEFAULTS = {
  MAX_TOOL_ROUNDS: 4,          // hard rule from the migration contract
  MAX_CALLS_PER_ROUND: 4,      // one response cannot bypass the limit with a huge batch
  MAX_TOOL_CALLS: 10,          // total individual handler invocations
  MAX_MODEL_CALLS: 12,         // 4 tool rounds + finalization + regenerations + headroom
  MAX_REGENERATIONS: 2,        // presend correction + duplicate-reply rewrite
  // One SDK call is up to 60s and retries twice, so a single call can legitimately take ~180s.
  // The deadline is only ever checked BEFORE starting new work, never to cancel a call in
  // flight, so it has to sit above that worst case to mean anything.
  DEADLINE_MS: 240000,
};

let SEQ = 0;

class Episode {
  constructor(meta) {
    meta = meta || {};
    SEQ += 1;
    this.id = 'ep' + Date.now().toString(36) + '-' + SEQ.toString(36);
    this.conversationId = meta.conversationId != null ? String(meta.conversationId) : null;
    this.messageId = meta.messageId != null ? String(meta.messageId) : null;
    this.detached = !!meta.detached;
    this.startedAt = Date.now();
    this.limits = { ...DEFAULTS, ...(meta.limits || {}) };
    this.deadlineAt = this.startedAt + this.limits.DEADLINE_MS;

    this.toolRounds = 0;
    this.toolCalls = 0;
    this.modelCalls = 0;
    this.regenerations = 0;
    this.finalizeReserveUsed = false;
    this.promoted = false;
    this.fallbackReason = null;

    // Set by effortPolicy once HIGH has been justified in this episode.
    this.effortLocked = null;
    this.effortRule = null;

    this.usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, uncertain: 0 };
    this.purposes = [];
  }

  get elapsedMs() { return Date.now() - this.startedAt; }
  get remainingMs() { return this.deadlineAt - Date.now(); }
  expired() { return Date.now() >= this.deadlineAt; }

  /** True when there is room for another tool round. Never auto-increments. */
  canStartToolRound() {
    return !this.expired() && this.toolRounds < this.limits.MAX_TOOL_ROUNDS && this.toolCalls < this.limits.MAX_TOOL_CALLS;
  }

  /**
   * One model response containing one or more requested function calls that the runtime
   * processes — including a round spent entirely on structured rejections of invalid calls.
   * A batch of calls is ONE round, not one round per function.
   */
  startToolRound() {
    this.toolRounds += 1;
    return this.toolRounds;
  }

  /** How many calls from this batch may actually run. */
  allowedCallsThisRound(requested) {
    const perRound = Math.min(requested, this.limits.MAX_CALLS_PER_ROUND);
    const remainingTotal = Math.max(0, this.limits.MAX_TOOL_CALLS - this.toolCalls);
    return Math.min(perRound, remainingTotal);
  }

  chargeToolCall(name) {
    this.toolCalls += 1;
    if (name) this.purposes.push('tool:' + name);
    return this.toolCalls;
  }

  canModelCall() { return !this.expired() && this.modelCalls < this.limits.MAX_MODEL_CALLS; }

  /**
   * TOOL_BUDGET_FINAL_V1 (2026-09-28): the single no-tools exhaustion final that concludes a tool loop.
   * It is not new work (no tools, tool_choice none), so it may run after the deadline and may use ONE
   * reserved call above MAX_MODEL_CALLS. Without this, a loop that ended on the deadline or the call cap
   * returned '' and the handler skipped the send ("SKIP empty reply body") - silence.
   */
  canFinalize() { return this.modelCalls < this.limits.MAX_MODEL_CALLS || !this.finalizeReserveUsed; }

  chargeModelCall(purpose) {
    this.modelCalls += 1;
    if (purpose) this.purposes.push(purpose);
    if (this.modelCalls > this.limits.MAX_MODEL_CALLS && purpose === 'full.exhaustion-final' && !this.finalizeReserveUsed) {
      this.finalizeReserveUsed = true; // TOOL_BUDGET_FINAL_V1: the one reserved call
      return this.modelCalls;
    }
    if (this.modelCalls > this.limits.MAX_MODEL_CALLS) {
      const e = new Error('episode model-call budget exhausted (' + this.limits.MAX_MODEL_CALLS + ')');
      e.kind = 'budget';
      throw e;
    }
    return this.modelCalls;
  }

  canRegenerate() { return !this.expired() && this.regenerations < this.limits.MAX_REGENERATIONS; }

  chargeRegeneration() { this.regenerations += 1; return this.regenerations; }

  /** A FAST draft promoted to FULL keeps this same identity and these same budgets. */
  markPromoted() { this.promoted = true; }

  markFallback(reason) { if (!this.fallbackReason) this.fallbackReason = String(reason || 'unknown'); }

  recordUsage(u) {
    if (!u || !u.available) { this.usage.uncertain += 1; return; }
    const add = (k, v) => { if (typeof v === 'number') this.usage[k] += v; };
    add('inputTokens', u.inputTokens);
    add('cachedInputTokens', u.cachedInputTokens);
    add('outputTokens', u.outputTokens);
    add('reasoningTokens', u.reasoningTokens);
  }

  summary() {
    return {
      episode: this.id,
      cid: this.conversationId,
      detached: this.detached || undefined,
      ms: this.elapsedMs,
      modelCalls: this.modelCalls,
      toolRounds: this.toolRounds,
      toolCalls: this.toolCalls,
      regenerations: this.regenerations,
      promoted: this.promoted,
      effort: 'medium', // REASONING_MEDIUM_V1: every live call is MEDIUM; effortLocked/effortRule are shadow-only
      effortRule: this.effortRule,
      fallbackReason: this.fallbackReason,
      // reasoningTokens are a subset of outputTokens; cachedInputTokens a subset of
      // inputTokens. Reported nested-in, never added on top.
      usage: this.usage,
    };
  }
}

/* --------------------------------------------------------------- registry */

const ACTIVE = new Map();
const MAX_AGE_MS = 15 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [k, ep] of ACTIVE) {
    if (now - ep.startedAt > MAX_AGE_MS) ACTIVE.delete(k);
  }
}

/** Open the episode for one accepted inbound event. Replaces any stale one for that ticket. */
function begin(conversationId, meta) {
  sweep();
  const ep = new Episode({ ...(meta || {}), conversationId });
  if (ep.conversationId) ACTIVE.set(ep.conversationId, ep);
  return ep;
}

function get(conversationId) {
  if (conversationId == null) return null;
  return ACTIVE.get(String(conversationId)) || null;
}

/**
 * The live episode for this ticket, or a detached one that enforces settings without
 * touching a real customer budget.
 */
function current(conversationId) {
  return get(conversationId) || new Episode({ conversationId, detached: true });
}

function end(conversationId) {
  if (conversationId == null) return null;
  const key = String(conversationId);
  const ep = ACTIVE.get(key);
  if (ep) {
    ACTIVE.delete(key);
    try { console.log('LUNA_EPISODE ' + JSON.stringify(ep.summary())); } catch (_) {}
  }
  return ep;
}

/** Test/ops helper. */
function activeCount() { return ACTIVE.size; }
function reset() { ACTIVE.clear(); }

module.exports = { Episode, DEFAULTS, begin, get, current, end, activeCount, reset };
