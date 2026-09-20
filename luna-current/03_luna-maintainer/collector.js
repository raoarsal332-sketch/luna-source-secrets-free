'use strict';

/**
 * collector.js - the single integration point for production.
 *
 * index.js needs exactly one added line after the existing pre-send gate:
 *
 *   __maintainer.observe(__presend, { conversationId, messageId, clientText: text,
 *                                     isNote: false, escalated, assignedToId, latencyMs, ... });
 *
 * observe() is fail-safe: it never throws, never blocks, never mutates the
 * reply, and does nothing at all when MAINTAINER_ENABLED=false.
 */

const path = require('path');
const det = require('./detectors');
const { log } = require('./observability');

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
      if (mod && typeof mod.sanitizeCredentials === 'function') {
        sanitizeCredentials = mod.sanitizeCredentials;
        return;
      }
    } catch (_) { /* optional */ }
  }
})();

function createCollector(cfg, store) {
  function record(events) {
    const saved = [];
    for (const ev of events) {
      try { saved.push(store.recordEvent(ev)); } catch (_) { /* never break the caller */ }
    }
    return saved;
  }

  /** Hook P companion: called with the statePresend.gate() result. */
  function observe(gateResult, turnMeta) {
    if (!cfg.enabled) return [];
    try {
      const meta = Object.assign({ lunaRoot: cfg.lunaRoot }, turnMeta || {});
      if (meta.clientText) meta.clientText = sanitizeCredentials(meta.clientText);
      if (meta.body) meta.body = sanitizeCredentials(meta.body);
      const events = det.fromPresend(gateResult, meta).concat(det.fromTurn(meta, cfg));
      if (events.length) log('observed', { conversationId: meta.conversationId, codes: events.map((e) => e.code) });
      return record(events);
    } catch (e) {
      log('observe_error', { error: String(e && e.message) });
      return [];
    }
  }

  /** Periodic sweep of the analytics objects Luna already maintains. */
  function sweepAnalytics(analytics) {
    if (!cfg.enabled || !analytics) return [];
    const events = [];
    try {
      for (const item of (analytics.corrections && analytics.corrections.items() ? analytics.corrections.items() : [])) {
        if (item.__maintainerSeen) continue;
        item.__maintainerSeen = true;
        events.push(...det.fromCorrection(item));
      }
    } catch (_) { /* ignore */ }
    try {
      if (analytics.gaps) events.push(...det.fromKnowledgeGaps(analytics.gaps.top(20), 3));
    } catch (_) { /* ignore */ }
    return record(events);
  }

  /** Only issues seen often enough - or anything critical - cost an LLM call. */
  function actionable() {
    return store.events().filter((e) => e.occurrences >= cfg.minOccurrences || e.severity === 'critical');
  }

  return { observe, sweepAnalytics, actionable, record };
}

module.exports = { createCollector };
