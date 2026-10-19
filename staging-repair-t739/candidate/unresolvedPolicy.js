'use strict';
/**
 * One unresolved-policy registry. Returns a canonical id or null.
 * Local module strings are aliases only. A listed substitute row stays
 * sendable for its own id and is not the answer when this returns a policy id.
 * The matcher does not contain these names.
 */

const ALIASES = Object.freeze({
  'atom-fee-policy-owner-decision': 'policy.fee-refunds',
  'unresolved:consistency-equality': 'policy.equality-50',
  'unresolved:news-minutes': 'policy.news-minutes',
  'unresolved:checkout-sku-selection': 'policy.sku',
  'unresolved:translation': 'policy.translations',
  'unresolved:coupon-stacking': 'policy.coupon-stacking',
});

const IDS = Object.freeze([
  'policy.fee-refunds',
  'policy.equality-50',
  'policy.news-minutes',
  'policy.sku',
  'policy.translations',
  'policy.coupon-stacking',
  'policy.free-pack-tier-conflict',
  'policy.the-million-every-rule-conflict',
  'policy.live-bundle-sizes',
  'policy.live-offer-freshness',
  'policy.dashboard-only-meter-thresholds',
  'policy.opened-pack-statutory-right',
]);

function has(text, re) {
  return re.test(text);
}

function unresolvedPolicy(normalized) {
  const t = String(normalized || '');
  if (!t) return null;
  if (has(t, /\btranslat/) || has(t, /\b(?:in|into)\s+(?:urdu|hindi|spanish|arabic|portuguese|french|german|chinese|russian|turkish|bengali|farsi|persian|italian|roman\s+urdu)\b/)) {
    return 'policy.translations';
  }
  if (has(t, /\b(?:refund|reimburs|rebate|handed\s+back|money\s+back|given\s+back|fee\s+back)\b/)
    && has(t, /\b(?:fee|fees|challenge|evaluation|reset|payout|paid|start|failed)\b/)) {
    return 'policy.fee-refunds';
  }
  if (has(t, /\b(?:50|fifty)\b/) && has(t, /\b(?:percent|%|consistency)\b/)
    && has(t, /\b(?:exact(?:ly)?|equal|equality|right\s+at|precisely|consistency)\b/)) {
    return 'policy.equality-50';
  }
  if (has(t, /\bnews\b/) && has(t, /\b(?:minutes?|mins?|window)\b/)) {
    return 'policy.news-minutes';
  }
  if (has(t, /\bsku\b/) || has(t, /\bwhich\s+(?:size|one|plan|account)\b.{0,40}\b(?:buy|get|pick|choose)\b/)
    || has(t, /\b(?:should|beginner)\b.{0,40}\b(?:buy|size)\b/)) {
    return 'policy.sku';
  }
  if ((has(t, /\b(?:stack(?:ed|ing)?|combine[d]?)\b/) && has(t, /\b(?:coupon|coupons|code|codes|voucher|promo)\b/))
    || has(t, /\bhomepage\s+coupon\b/)
    || (has(t, /\bcoupon\b/) && has(t, /\b(?:stack|sale|newsletter)\b/))) {
    return 'policy.coupon-stacking';
  }
  if (has(t, /\bfree[-\s]?pack\b/) && has(t, /\b(?:tier|percent|credit)\b/) && has(t, /\b(?:50k|100k|account|help\s+center)\b/)) {
    return 'policy.free-pack-tier-conflict';
  }
  if (has(t, /\bmillion\b/) && has(t, /\bevery\s+rule\b|lifts\s+every|rule-lifted|every-rule/)) {
    return 'policy.the-million-every-rule-conflict';
  }
  if (has(t, /\bbundle\b/) && has(t, /\b(?:today|current|bonus)\b/) && has(t, /\bcredits?\b/)) {
    return 'policy.live-bundle-sizes';
  }
  if (has(t, /\b(?:still\s+live|right\s+now|this\s+minute|countdown)\b/)) {
    return 'policy.live-offer-freshness';
  }
  if (has(t, /\b(?:lucky\s+streak|pack\s+pass)\b/) && has(t, /\b(?:how\s+many|exact\s+count|fills?|fill)\b/)) {
    return 'policy.dashboard-only-meter-thresholds';
  }
  if (has(t, /\b(?:statutory|legal\s+ruling)\b/) && has(t, /\b(?:opened|seal|withdrawal)\b/)) {
    return 'policy.opened-pack-statutory-right';
  }
  return null;
}

function canonicalPolicy(localOrId) {
  const s = String(localOrId || '');
  if (!s) return null;
  if (ALIASES[s]) return ALIASES[s];
  if (IDS.includes(s)) return s;
  return null;
}

module.exports = { unresolvedPolicy, canonicalPolicy, ALIASES, IDS };
