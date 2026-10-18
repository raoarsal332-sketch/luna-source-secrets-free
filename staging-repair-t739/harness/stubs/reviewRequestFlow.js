'use strict';
/** [ME] review-link flow stand-in: no review ask is ever added or stripped. */
module.exports = require('./_generic').withFallback({
  RESUME_INTENT_RE: /\b(?:resume|reply now|you can reply)\b/i,
  stripUnsolicitedReviewAsk: (body) => body,
  mayEndTurnWithoutReply: () => false,
  decideReviewFlow: () => ({ action: 'NONE', reason: 'stub' }),
  claimSend: () => ({ claimed: false }),
  releaseClaim() {}, commitSend() {},
  isResolutionClosure: () => false,
}, 'reviewRequestFlow');
