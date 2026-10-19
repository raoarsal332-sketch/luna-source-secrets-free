'use strict';
/**
 * Canonical policy registry vetoes for Packs. Returns the stable id
 * or null. A substitute row stays sendable for its own wording: the
 * veto fires on the unresolved ask, not on the safe substitute.
 * The matcher does not contain these names. decide applies the veto
 * before any part id is chosen.
 */

function unresolvedPolicy(normalized) {
  const t = String(normalized || '');

  // Fee refunds are not the pack-purchase finality body.
  if (/\bfee\b/.test(t) && /\brefund/.test(t) && !/\bpack purchase/.test(t)) {
    return 'policy.fee-refunds';
  }

  // Coupons stacking is not the Founder's Key / discount-card body.
  if (/\bcoupons?\b/.test(t) && /\b(?:stack|combin)/.test(t)) {
    return 'policy.coupon-stacking';
  }

  // Demanding a settled free-pack tier, Help Center line, or launch-landing
  // number. The safe substitute asks whether a tier will be quoted, or what
  // to inspect instead of quoting.
  const safeFreePack = /\b(?:quoted as settled fact|instead of quoting|will a specific tier|specific tier or percent)\b/.test(t);
  const demandsFreePack =
    /\bwhat free-pack tier\b/.test(t) ||
    /\bhelp center\b/.test(t) ||
    /\blaunch-?landing\b/.test(t) ||
    (/\bprovisional\b/.test(t) && /\bfree-pack\b/.test(t)) ||
    /\bwhich number is the settled\b/.test(t);
  if (demandsFreePack && !safeFreePack) return 'policy.free-pack-tier-conflict';

  // The slogan that every risk rule is lifted. The sendable Million body
  // keeps the FAQ table and is not this veto.
  if (/\bevery (?:risk )?rule\b/.test(t) || /\brules? (?:are|is) (?:all )?removed\b/.test(t) || /\bevery rule lifted\b/.test(t)) {
    return 'policy.the-million-every-rule-conflict';
  }

  // Exact live bundle sizes and bonuses. The buy-credits body says those
  // figures are dashboard-only and does not list them.
  if (/\b(?:exact bundle|bundle sizes|bonus percent|today'?s bonus)\b/.test(t)) {
    return 'policy.live-bundle-sizes';
  }

  // Whether an offer is live at this moment, the current countdown percent,
  // or a live price override. The published expiry rule is not this veto.
  if (
    /\bstill live\b/.test(t) ||
    /\blive override\b/.test(t) ||
    /\bshowing right now\b/.test(t) ||
    /\bat this minute\b/.test(t) ||
    (/\bright now\b/.test(t) && /\b(?:percent|price|countdown)\b/.test(t) && !/\bmy\b/.test(t))
  ) {
    return 'policy.live-offer-freshness';
  }

  // Asking for the exact meter count the dashboard hides. Stating that the
  // count is dashboard-only is the sendable Pack Pass / Lucky Streak rule.
  if (/\bexact (?:count|threshold|number)\b/.test(t) && !/\bdashboard-only\b/.test(t) && !/\bhides the exact\b/.test(t)) {
    return 'policy.dashboard-only-meter-thresholds';
  }

  // Whether a statutory withdrawal right still exists after the pack was
  // opened. Naming the code on generally-final pack purchases is the
  // sendable legal body, not this veto.
  if (/\bstatutory\b/.test(t) && /\b(?:already been opened|already opened|has been opened|still exist)\b/.test(t)) {
    return 'policy.opened-pack-statutory-right';
  }

  return null;
}

module.exports = {
  unresolvedPolicy,
};
