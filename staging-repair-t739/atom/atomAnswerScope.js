'use strict';
/**
 * Scope metadata for Elite Atom approved answers (staging t739).
 *
 * SIDECAR ONLY. The approved-answer JSON is byte-unchanged: bodies, ids, approval
 * and sendability come exclusively from there. This table can only NARROW what a
 * row may be used for (frame, product, qualifiers it actually covers). It can
 * never add a row, make a row sendable, or change a body.
 *
 * Qualifier names (computed by the selector from the resolved ask):
 *   ordinal, amount, pricePoint, pct, ratio, size, num, options, preList,
 *   change, calc, coupon, addon, selection
 * 'product' is always allowed (it selects the row, it does not narrow coverage).
 */

const Q_RULE = ['amount', 'pct', 'ratio', 'size', 'num', 'options', 'change'];
const Q_RULE_PAYOUT = [...Q_RULE, 'ordinal'];

function row(frame, product, relationships, allowedQualifiers, extra) {
  return Object.freeze({
    frame,
    product,
    relationships: Object.freeze(relationships),
    allowedQualifiers: Object.freeze(allowedQualifiers),
    ...(extra || {}),
  });
}

const SCOPE = Object.freeze({
  'atom.overview.en': row('rule', 'any', ['overview'], ['size', 'num']),
  'atom.2step.phases.en': row('rule', '2step', ['rule'], Q_RULE),
  'atom.2step.daily-loss.en': row('rule', '2step', ['rule'], Q_RULE),
  'atom.2step.max-loss.en': row('rule', '2step', ['rule'], Q_RULE),
  'atom.2step.min-days.en': row('rule', '2step', ['rule'], Q_RULE),
  'atom.2step.consistency.en': row('rule', '2step', ['rule'], [...Q_RULE_PAYOUT, 'calc']),
  'atom.2step.news.en': row('rule', '2step', ['rule'], Q_RULE),
  'atom.2step.leverage.en': row('rule', '2step', ['rule'], [...Q_RULE, 'options']),
  'atom.2step.reward.en': row('split', '2step', ['split'], ['ordinal', 'amount', 'pct', 'ratio', 'size', 'num', 'options']),
  'atom.1step.phases.en': row('rule', '1step', ['rule'], Q_RULE),
  'atom.1step.daily-loss.en': row('rule', '1step', ['rule'], Q_RULE),
  'atom.1step.max-loss.en': row('rule', '1step', ['rule'], Q_RULE),
  'atom.1step.min-days.en': row('rule', '1step', ['rule'], Q_RULE),
  'atom.1step.consistency.en': row('rule', '1step', ['rule'], [...Q_RULE_PAYOUT, 'calc']),
  'atom.1step.news.en': row('rule', '1step', ['rule'], Q_RULE),
  'atom.1step.leverage.en': row('rule', '1step', ['rule'], Q_RULE),
  'atom.1step.reward.en': row('split', '1step', ['split'], ['ordinal', 'amount', 'pct', 'ratio', 'size', 'num', 'options']),
  'atom.1step.funded-profitable-days.en': row('rule', '1step', ['rule'], Q_RULE_PAYOUT),
  'atom.payouts.general.en': row('payout', 'any', ['timing', 'cap', 'rules', 'default-split'], ['ordinal', 'amount', 'pct', 'num', 'size', 'options']),
  'atom.prices.list.en': row('price', 'any', ['cost'], ['pricePoint', 'size', 'preList']),
  'atom.checkout.options.en': row('checkout', 'any', ['options'], ['pct', 'ratio', 'size', 'num', 'options', 'addon']),
  'atom.bundles.en': row('bundle', 'any', ['discount'], ['ordinal', 'pct', 'num', 'size']),
  'atom.house.eas-copy.en': row('rule', 'any', ['rule'], []),
  'atom.house.simulated.en': row('rule', 'any', ['rule'], []),
  'atom.handoff.unverified.en': row('handoff', 'any', ['fallback'], [], { selectOnlyAsFallback: true }),
  'atom.account-status.refuse.en': row('boundary', 'any', ['account-specific'], ['ordinal', 'amount', 'pricePoint', 'pct', 'ratio', 'size', 'num', 'options', 'change', 'calc']),
  'atom.obsolete.10pct-1step.en': row('rule', '1step', ['correction'], ['pct', 'num', 'size', 'change']),
  'atom.obsolete.first-payout-14.en': row('payout', 'any', ['correction'], ['ordinal', 'num', 'pct']),
  'atom.obsolete.leverage-150-default.en': row('rule', 'any', ['correction', 'default'], ['ratio', 'num', 'options', 'change']),
  'atom.obsolete.price-161-permanent.en': row('price', 'any', ['correction'], ['pricePoint', 'amount', 'size', 'preList']),
  'atom.obsolete.sizes-5k-10k.en': row('price', 'any', ['correction'], ['size', 'pricePoint', 'preList']),
  'atom.consistency.boundary.en': row('unresolved', 'any', ['equality'], [], { classifyOnly: true }),
  'atom.news.minutes.unverified.en': row('unresolved', 'any', ['news-minutes'], [], { classifyOnly: true }),
});

const UNRESOLVED_TOPICS = Object.freeze({
  'consistency-equality': 'atom.consistency.boundary.en',
  'news-minutes': 'atom.news.minutes.unverified.en',
  'checkout-sku-selection': null,
  'coupon-stacking': null,
  translation: null,
});

function admit(answerId, ctx) {
  const s = SCOPE[answerId];
  if (!s) return { ok: false, reason: 'scope-missing:' + answerId };
  if (s.classifyOnly) return { ok: false, reason: 'scope-classify-only' };
  if (ctx.frame && s.frame !== ctx.frame) return { ok: false, reason: 'scope-frame-mismatch' };
  if (s.product !== 'any') {
    if (ctx.product !== 'atom-' + s.product) return { ok: false, reason: 'scope-product-mismatch' };
  }
  if (ctx.relationship && !s.relationships.includes(ctx.relationship)) {
    return { ok: false, reason: 'scope-relationship-mismatch' };
  }
  const bad = [...(ctx.qualifiers || [])].filter((q) => !s.allowedQualifiers.includes(q));
  if (bad.length) return { ok: false, reason: 'qualifier-not-covered:' + bad.sort().join(',') };
  return { ok: true };
}

/** Throws if the sidecar references a missing id or tries to widen sendability. */
function validateAgainstKb(approved, kbPath) {
  const problems = [];
  for (const id of Object.keys(SCOPE)) {
    const row = approved.get(id, kbPath);
    if (!row) problems.push('scope-id-not-in-kb:' + id);
  }
  const enSendable = approved.listSendable(kbPath).filter((r) => /\.en$/.test(r.id));
  for (const r of enSendable) {
    if (!SCOPE[r.id]) problems.push('sendable-en-row-without-scope:' + r.id);
  }
  return problems;
}

module.exports = { SCOPE, UNRESOLVED_TOPICS, admit, validateAgainstKb };
