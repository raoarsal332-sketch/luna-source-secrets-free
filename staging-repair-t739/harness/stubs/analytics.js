'use strict';
/** [ME] Trace/analytics are absent from this tree. No-op so a missing recorder cannot blank a draft. */
function noop() {}
function trace() {
  return {
    start() { return {}; },
    record() {},
    finish() { return {}; },
  };
}
module.exports = require('./_generic').withFallback({
  createConversationTrace: trace,
  createErrorAnalytics: () => ({ record: noop, reset: noop }),
  createKnowledgeGapAnalytics: () => ({ record: noop, reset: noop }),
  createHumanCorrectionCapture: () => ({ record: noop, reset: noop }),
}, 'analytics');
