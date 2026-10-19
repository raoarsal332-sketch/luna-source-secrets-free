'use strict';
/**
 * One unresolved-policy registry. Returns a canonical id or null.
 * Packs-only vetoes run first, then the Atom detectors. A listed
 * substitute row stays sendable for its own id and is not the answer
 * when this returns a policy id. The matcher does not contain these names.
 * Local module strings are aliases only.
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

function packsPolicy(t) {
  if (/\bfee\b/.test(t) && /\brefund/.test(t) && !/\bpack purchase/.test(t)) {
    return 'policy.fee-refunds';
  }
  if (/\bcoupons?\b/.test(t) && /\b(?:stack|combin)/.test(t)) {
    return 'policy.coupon-stacking';
  }
  const safeFreePack = /\b(?:quoted as settled fact|instead of quoting|will a specific tier|specific tier or percent)\b/.test(t);
  const demandsFreePack =
    /\bwhat free-pack tier\b/.test(t) ||
    /\bhelp center\b/.test(t) ||
    /\blaunch-?landing\b/.test(t) ||
    (/\bprovisional\b/.test(t) && /\bfree-pack\b/.test(t)) ||
    /\bwhich number is the settled\b/.test(t);
  if (demandsFreePack && !safeFreePack) return 'policy.free-pack-tier-conflict';
  if (/\bevery (?:risk )?rule\b/.test(t) || /\brules? (?:are|is) (?:all )?removed\b/.test(t) || /\bevery rule lifted\b/.test(t)) {
    return 'policy.the-million-every-rule-conflict';
  }
  if (/\b(?:exact bundle|bundle sizes|bonus percent|today'?s bonus)\b/.test(t)) {
    return 'policy.live-bundle-sizes';
  }
  if (
    /\bstill live\b/.test(t) ||
    /\blive override\b/.test(t) ||
    /\bshowing right now\b/.test(t) ||
    /\bat this minute\b/.test(t) ||
    (/\bright now\b/.test(t) && /\b(?:percent|price|countdown)\b/.test(t) && !/\bmy\b/.test(t))
  ) {
    return 'policy.live-offer-freshness';
  }
  if (/\bexact (?:count|threshold|number)\b/.test(t) && !/\bdashboard-only\b/.test(t) && !/\bhides the exact\b/.test(t)) {
    return 'policy.dashboard-only-meter-thresholds';
  }
  if (/\bstatutory\b/.test(t) && /\b(?:already been opened|already opened|has been opened|still exist)\b/.test(t)) {
    return 'policy.opened-pack-statutory-right';
  }
  return null;
}

function atomFeeReturn(t) {
  if (/\bnot a refund\b/.test(t)) return false;
  // Pack purchase finality names a consumer code for pack refunds. That ask
  // is not the Atom fee-return veto (PD-305).
  if (/\bconsumer code\b/.test(t) && /\bpack refunds?\b/.test(t)) return false;
  return (
    /\b(?:refund(?:ed|s)?|reimburse\w*|rebates?|repaid|repay\w*)\b/.test(t) ||
    /\bhanded back\b/.test(t) ||
    /\bcredited back\b/.test(t) ||
    /\bcome back\b/.test(t) ||
    /\breturned after\b/.test(t) ||
    /\bpurchase price be returned\b/.test(t) ||
    /\bcharge repaid\b/.test(t)
  );
}

function atomEquality50(t) {
  if (/\bequal split\b/.test(t)) return false;
  const topic = /\b(?:consistenc\w*|best[\s-]day|50|fifty|half)\b/.test(t);
  if (!topic) return false;
  return (
    /\b(?:exactly|precisely|on the nose|exact equality|right at)\b/.test(t) ||
    /\bequal to half\b/.test(t) ||
    /\bequals the halfway\b/.test(t) ||
    /\bprecisely equal\b/.test(t) ||
    /\bborderline\b/.test(t) ||
    (/\bequality\b/.test(t) && /\b(?:50|fifty|half)\b/.test(t))
  );
}

function atomNewsMinutes(t) {
  if (/\bminute of the day\b/.test(t) || /\bclock time\b/.test(t)) return false;
  if (!/\b(?:news|release|print|event|blackout)\b/.test(t)) return false;
  return (
    /\bminutes\b/.test(t) ||
    /\bseconds\b/.test(t) ||
    /\bgmt\b/.test(t) ||
    /\bblackout\b/.test(t) ||
    /\bclock range\b/.test(t) ||
    /\binstruments?\b/.test(t) ||
    /\bwindow\b/.test(t) ||
    /\bminute count\b/.test(t)
  );
}

function atomSku(t) {
  return (
    /\bwhich size should\b/.test(t) ||
    /\bwhich atom size should\b/.test(t) ||
    /\bshould (?:a |the )?(?:beginner|customer)\b/.test(t) ||
    /\brecommend an atom\b/.test(t) ||
    /\bbest atom plan\b/.test(t) ||
    /\bpick the right\b/.test(t) ||
    /\bmost suitable\b/.test(t) ||
    /\bhelp me choose\b/.test(t) ||
    /\bought they\b/.test(t) ||
    /\bchoose between\b/.test(t) ||
    /\b50k or atom 100k\b/.test(t)
  );
}

function atomTranslation(t) {
  return /\b(?:translate|translation|german wording)\b/.test(t) ||
    /\b(?:into|in)\s+(?:spanish|french|urdu|arabic|portuguese|hindi|german|italian)\b/.test(t);
}

function atomCouponStack(t) {
  return (
    /\bstack(?:ing|ed)?\b/.test(t) ||
    /\bcombine\b/.test(t) ||
    /\bboth coupons\b/.test(t) ||
    /\btwo (?:promo|voucher|discounts)\b/.test(t) ||
    /\bsecond code\b/.test(t) ||
    /\bcoupons be combined\b/.test(t) ||
    /\b2 promo codes\b/.test(t)
  );
}

function atomPolicy(t) {
  if (atomFeeReturn(t)) return 'policy.fee-refunds';
  if (atomEquality50(t)) return 'policy.equality-50';
  if (atomNewsMinutes(t)) return 'policy.news-minutes';
  if (atomSku(t)) return 'policy.sku';
  if (atomTranslation(t)) return 'policy.translations';
  if (atomCouponStack(t)) return 'policy.coupon-stacking';
  return null;
}

function unresolvedPolicy(normalized) {
  const t = String(normalized || '');
  if (!t) return null;
  return packsPolicy(t) || atomPolicy(t);
}

function canonicalPolicy(localOrId) {
  const s = String(localOrId || '');
  if (!s) return null;
  if (ALIASES[s]) return ALIASES[s];
  if (IDS.includes(s)) return s;
  return null;
}

module.exports = { unresolvedPolicy, canonicalPolicy, ALIASES, IDS };
