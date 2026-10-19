'use strict';
/**
 * variantComparisonCompleteness.js — VARIANT_COMPARISON_COMPLETE_V1
 *
 * For product-variant pairs whose approved knowledge says rules are shared and the
 * only delta is account sizes (driven by challengeVariantGuard family metadata),
 * a public comparison must:
 *   1) briefly state important shared rules, AND
 *   2) clearly state the size delta.
 * Does not invent Elite-only rules. Formatting-agnostic checks.
 */

const T = require('./statePresend/textUtils');

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function mentionsInstantAndElite(text) {
  const t = String(text || '');
  if (/instant\s*elite/i.test(t) && /\binstant\b(?!\s*elite)/i.test(t)) return true;
  // "instant and elite" / "instant vs elite" without the compound name
  return /\binstant\b/i.test(t) && /\belite\b/i.test(t);
}

function looksLikeVariantComparisonAsk(text) {
  const t = normalize(text);
  if (!t) return false;
  // Bare follow-up shapes that still count when Instant+Elite context is already known
  // (presend / selftests pass the resolved ask; detectors also accept standalone paraphrases).
  const bareCompare =
    /\bare (?:the )?rules the same\b/.test(t) ||
    /\bwhat(?:'s| is) (?:the )?(?:main )?difference\b/.test(t) ||
    /\bonly these(?:\s+differences?)?\b/.test(t) ||
    /\banything else\b/.test(t);
  if (bareCompare && mentionsInstantAndElite(t)) return true;
  if (bareCompare && !mentionsInstantAndElite(t)) {
    // Standalone paraphrase without product names: treat as comparison-shaped for routing
    // when the phrase itself is clearly a "difference / same rules" ask (contextualFollowUp
    // attaches Instant+Elite from prior turns).
    return /\bare (?:the )?rules the same\b/.test(t) ||
      /\bwhat(?:'s| is) (?:the )?(?:main )?difference\b/.test(t);
  }
  if (!mentionsInstantAndElite(t)) return false;
  return /\b(?:differ|difference|different|compare|comparison|versus|\bvs\b|between|same|rules?)\b/.test(t);
}

/** Families that declare onlyApprovedDeltaIsSizes (from challengeVariantGuard). */
function sizeOnlyFamilyForAsk(text, productFamilies) {
  const t = String(text || '');
  const families = Array.isArray(productFamilies) ? productFamilies : [];
  for (const f of families) {
    if (!f || !f.onlyApprovedDeltaIsSizes) continue;
    if (typeof f.hasBothVariants === 'function' && f.hasBothVariants(t)) return f;
    if (f.id === 'instant' && mentionsInstantAndElite(t)) return f;
    // Comparison-shaped bare ask: Instant family still applies when metadata says size-only
    // (caller should pass resolved pending ask with Instant+Elite when available).
    if (f.id === 'instant' && looksLikeVariantComparisonAsk(t) && !/\b(?:1[\s-]*step|2[\s-]*step|catalyst|flash|lite)\b/i.test(t)) {
      return f;
    }
  }
  return null;
}

function hasSharedRulesCoverage(body) {
  const t = normalize(body);
  if (!t) return false;
  // Need at least two distinct shared-rule signals from the Instant KB set.
  const signals = [
    /\b(?:live\s+phase|no\s+evaluation|no\s+second\s+chance|skip(?:s|ping)?\s+evaluation)\b/,
    /\b(?:3\s*%|3%)\b.*\b(?:daily|day)\b|\bdaily\b.*\b(?:3\s*%|3%)\b/,
    /\b(?:6\s*%|6%)\b.*\b(?:max|maximum|overall)\b|\b(?:max|maximum)\b.*\b(?:6\s*%|6%)\b|\btrailing\b/,
    /\b25\s*%\b.*\bconsistency\b|\bconsistency\b.*\b25\s*%\b/,
    /\b(?:70\s*%|70%)\b.*\b(?:95\s*%|95%)\b|\bprofit\s*split\b/,
    /\b21\s*days?\b.*\bpayout|\bfirst\s+payout\b/,
    /\b1\s*:\s*30\b|\bleverage\b/,
    /\b4\s+profitable\b|\b0\s*[.,]?5\s*%\b.*\b(?:profit|payout|pnl|p\s*&\s*l)/i,
  ];
  let hits = 0;
  for (const re of signals) if (re.test(t)) hits += 1;
  // Prefer live-phase OR drawdown/consistency as anchors; payout/leverage conditions also count.
  const hasStructure = signals[0].test(t);
  const hasRiskOrConsist = signals[1].test(t) || signals[2].test(t) || signals[3].test(t);
  const hasPayoutOrLev = signals[4].test(t) || signals[5].test(t) || signals[6].test(t) || (signals[7] && signals[7].test(t));
  return hits >= 2 && (hasStructure || hasRiskOrConsist || hasPayoutOrLev);
}

// INSTANT_VARIANTS_OFFICIAL_V2 (Arsal 2026-09-27, official FAQ 12683783): the approved Instant Standard vs
// Instant Elite difference is the Consistency Rule (Standard 25%, Elite none); sizes are shared ($7k-$100k).
// Kept under the old name for callers; it now checks that approved delta.
function hasSizeDeltaCoverage(body) {
  const t = normalize(body);
  if (!/\belite\b/.test(t) || !/\bconsisten(?:cy|t)\b/.test(t)) return false;
  // Elite stated as having no consistency rule, in either word order.
  const eliteNone = /\belite\b[^.\n]{0,120}\b(?:no|not|doesn['\u2019]?t|does\s+not|without|free\s+of|isn['\u2019]?t|none)\b[^.\n]{0,60}\bconsisten/.test(t)
    || /\b(?:no|without|not)\b[^.\n]{0,40}\bconsisten[^.\n]{0,120}\belite\b/.test(t)
    || /\bconsisten[^.\n]{0,80}\b(?:only|just)\b[^.\n]{0,60}\bstandard\b/.test(t)
    || /\bconsisten[^.\n]{0,80}\b(?:not|doesn['\u2019]?t|does\s+not)\b[^.\n]{0,40}\b(?:apply|applied)\b[^.\n]{0,40}\belite\b/.test(t);
  return eliteNone;
}

/** A reply that puts the retired size split ($200k / $300k / $400k) or a shared consistency rule on Instant. */
function statesRetiredInstantFacts(body) {
  const t = normalize(body);
  if (!/\binstant\b/.test(t)) return false;
  // Retired size claims only; owner-approved promo lines (e.g. Instant Elite 300k/400k discounts) are not size claims.
  const sentences = t.split(/(?<=[.!?])\s+|\n+/);
  if (sentences.some((x) => /\$?\s*(?:200|300|400)\s*k\b|\$?\s*(?:200|300|400)(?:,000|\.000)\b/.test(x)
    && !/\b(?:discount|discounts|off|promo|promotion|coupon|code|sale|offer ends)\b|%\s*off/.test(x))) return true;
  return /\b(?:both|shared|share)\b[^.\n*]{0,80}\b25\s*%?\s*consisten|\bboth\b[^.\n*]{0,40}\b(?:have|has|include|includes|share|come\s+with)\b[^.\n*]{0,40}\bconsisten|\bconsisten[^.\n*]{0,40}\b(?:is|are)\s+(?:the\s+)?same\b/.test(t);
}

/** Invented Elite-only rule markers we must not see without KB support. */
function inventsEliteOnlyRules(body) {
  const t = normalize(body);
  // Phrases that claim Elite has a different drawdown/consistency/leverage/split.
  // Consistency is the approved difference (Elite has none), so it is not an invented Elite-only rule.
  return /\binstant\s*elite\b.{0,80}\b(?:different|higher|lower|unique|its own)\b.{0,40}\b(?:drawdown|leverage|profit\s*split|daily\s+loss)\b/i.test(body)
    || /\b(?:drawdown|leverage|profit\s*split).{0,40}\b(?:different|differs)\b.{0,40}\binstant\s*elite\b/i.test(body)
    || statesRetiredInstantFacts(body);
}

function isPureCompletenessFollowUp(text) {
  const t = normalize(text);
  if (!t) return false;
  // Short expansion nudges without naming Instant/Elite — prior turn already carried the comparison.
  if (mentionsInstantAndElite(t)) return false;
  return /^(?:anything else|any others?|only these(?: differences?)?|only those(?: differences?)?|is that all|what else)\??$/.test(t);
}

function assessVariantComparisonReply(clientText, body, productFamilies) {
  const family = sizeOnlyFamilyForAsk(clientText, productFamilies);
  if (!family && !looksLikeVariantComparisonAsk(clientText)) {
    return { applicable: false, ok: true, reason: 'not-size-only-comparison' };
  }
  // Pure "anything else?" without product names: do not hard-fail for missing full shared+delta
  // restatement (the prior comparison reply already carried them). Still block invented Elite-only rules.
  if (isPureCompletenessFollowUp(clientText)) {
    const invented = inventsEliteOnlyRules(body);
    if (invented) return { applicable: true, ok: false, reason: 'invented-elite-only-rules', shared: false, delta: false, invented };
    return { applicable: false, ok: true, reason: 'completeness-followup-skip', shared: false, delta: false, invented: false };
  }
  if (!family && looksLikeVariantComparisonAsk(clientText)) {
    // Instant+Elite comparison without metadata — still apply Instant size-only checks.
  }
  const shared = hasSharedRulesCoverage(body);
  const delta = hasSizeDeltaCoverage(body);
  const invented = inventsEliteOnlyRules(body);
  if (invented) return { applicable: true, ok: false, reason: 'invented-elite-only-rules', shared, delta, invented };
  if (!shared) return { applicable: true, ok: false, reason: 'missing-shared-rules', shared, delta, invented };
  if (!delta) return { applicable: true, ok: false, reason: 'missing-approved-delta', shared, delta, invented };
  return { applicable: true, ok: true, reason: 'ok', shared, delta, invented };
}

function comparisonPlanLinesForSizeOnlyFamily(family) {
  const shared = (family && family.comparisonSharedRules) || [
    'Both Instant Standard and Instant Elite start directly in the live phase (no evaluation phases; no second chance).',
    'Shared rules from the official Instant article: sizes $7k, $15k, $25k, $50k, $100k; trailing drawdown 3% daily / 6% max; profit split 70%, 80% or 95% (first payout at 70%, then the selected split); first payout requestable after 21 days, cycles 3/7/14/21 days; 4 profitable days of at least 0.5%; MT5/TradeLocker; FX leverage 1:30, 1:50 or 1:100; scalping and weekend add-ons.',
  ];
  const delta = (family && family.comparisonSizeDelta) ||
    'Consistency Rule: Instant Standard includes the 25% consistency rule; Instant Elite does not have a consistency rule.';
  return [
    '- Variant pair (approved knowledge): rules are SHARED except the approved difference below.',
    '- Structure the reply: (1) clearly state the difference, (2) then briefly state the important shared rules/features below. Do NOT answer with only one of the two.',
    '- Shared rules to mention (only these — do not invent Elite-only rules): ' + shared.join(' '),
    '- Difference to state clearly: ' + delta,
    '- Use compact size form in public replies ($100k not $100,000) for account/challenge sizes.',
  ];
}


/**
 * LIVE 215476080792109: scrub false "official info does not state how Instant and Instant Elite differ"
 * hedges whenever approved knowledge has the size-only delta.
 */
function scrubFalseVariantGapHedge(body, askText) {
  let t = String(body || '');
  if (!t) return t;
  const ask = String(askText || '');
  const relevant =
    looksLikeVariantComparisonAsk(ask) ||
    mentionsInstantAndElite(ask) ||
    mentionsInstantAndElite(t) ||
    /instant\s*(?:vs\.?|versus|and|or)\s*instant\s*elite/i.test(t);
  if (!relevant) return t;
  const gapRe2 =
    /(?:The\s+)?(?:official\s+information(?:\s+provided\s+here)?|KB|knowledge(?:\s+base)?)\b[^.\n]{0,100}(?:does\s+not\s+state|doesn(?:'|’)t\s+state|does\s+not\s+say)\b[^.\n]{0,100}(?:Instant(?:\s+and|\s+vs\.?|\s+versus)?\s*Instant\s*Elite|how\s+Instant\s+and\s+Instant\s+Elite\s+differ)[^.\n]*[.!]?\s*(?:so\s+I\s+can(?:'|’)t\s+give\s+you\s+an\s+accurate\s+comparison[.!]?)?/gi;
  const before = t;
  t = t.replace(gapRe2, '');
  t = t.replace(
    /[^\n]*\b(?:does\s+not\s+state|doesn(?:'|’)t\s+state)\b[^\n]*\b(?:Instant\s+and\s+Instant\s+Elite|Instant\s+vs\.?\s+Instant\s+Elite)\b[^\n]*/gi,
    ''
  );
  // Drop orphaned "Instant vs Instant Elite" heading left after scrub
  t = t.replace(/(?:^|\n)\s*(?:\*\*|<b>)?\s*Instant\s+vs\.?\s+Instant\s+Elite(?:\*\*|\s*<\/b>)?\s*:?\s*(?=\n|$)/gi, '\n');
  if (t !== before) {
    if (!hasSizeDeltaCoverage(t) && (mentionsInstantAndElite(ask) || looksLikeVariantComparisonAsk(ask) || /Instant\s+vs/i.test(before))) {
      const delta =
        'Instant Standard and Instant Elite share the same core rules and both start in the live phase. The difference is the consistency rule: Instant Standard has a 25% consistency rule, Instant Elite has none.';
      t = String(t).trim() + '\n\n' + delta;
    }
    t = t.replace(/\n{3,}/g, '\n\n').trim();
  }
  return t;
}

module.exports = {
  mentionsInstantAndElite,
  looksLikeVariantComparisonAsk,
  sizeOnlyFamilyForAsk,
  hasSharedRulesCoverage,
  hasSizeDeltaCoverage,
  inventsEliteOnlyRules,
  statesRetiredInstantFacts,
  assessVariantComparisonReply,
  comparisonPlanLinesForSizeOnlyFamily,
  scrubFalseVariantGapHedge,
};
