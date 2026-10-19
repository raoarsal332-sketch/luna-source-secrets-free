'use strict';
/**
 * Packs decide. SEND a sendable catalog id, or ABSTAIN. Never prose.
 *
 * Order, once the router has one exclusive owner:
 * 1. non-en: do not send an English body
 * 2. not exclusive: do not send
 * 3. personal or mixed account-state: SEND the refuse id
 *    (before the shared matcher, which applies unresolvedPolicy first)
 * 4. shared matchApproved: policy veto, proposition membership, cosine rank
 * 5. when overview or the chain-upgrade body ties a more specific covering
 *    body, send the specific body
 */

const approved = require('../../../staging-repair-t739/candidate/packs/packsApprovedAnswers');
const { matchApproved, loadParams } = require('../../../staging-repair-t739/candidate/approvedMatcher');
const { isPersonalOrMixed } = require('./packsAccount');

const REFUSE_ID = 'packs.account-status.refuse.en';
const HANDOFF_ID = 'packs.handoff.unverified.en';
const BROAD_IDS = new Set(['packs.overview.en', 'packs.chain-upgrade-discounts.en']);

function preferSpecific(matched, data) {
  if (!matched || matched.action !== 'SEND' || !BROAD_IDS.has(matched.partId)) return matched;
  const set = (matched.acceptableSet || []).filter((id) => !BROAD_IDS.has(id));
  if (!set.length) return matched;
  const score = new Map((matched.candidates || []).map((c) => [c.partId, c.score]));
  set.sort((a, b) => {
    const ds = (score.get(b) || 0) - (score.get(a) || 0);
    if (ds) return ds;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const row = data.byId.get(set[0]);
  if (!row || !row.sendable) return matched;
  return {
    action: 'SEND',
    partId: row.id,
    contentHash: row.contentHash,
    code: null,
    policy: null,
  };
}

function abstain(code, policy) {
  return { action: 'ABSTAIN', code, policy: policy || null };
}

function productRows(data) {
  return data.all.filter((row) => {
    if (!row.sendable) return false;
    const tags = row.intentTags || [];
    if (tags.includes('accountStatusBoundary')) return false;
    if (tags.includes('handoff')) return false;
    if (row.id === REFUSE_ID || row.id === HANDOFF_ID) return false;
    return true;
  });
}

function catalogCensus(data) {
  const all = data.all;
  const english = all.filter((row) => row.locale === 'en' || row.language === 'en');
  const sendable = all.filter((row) => row.sendable);
  return {
    rows: all.length,
    english: english.length,
    sendable: sendable.length,
    englishSendable: english.filter((row) => row.sendable).length,
    productPool: productRows(data).length,
  };
}

function decide(input) {
  const current = input && input.normalized != null ? String(input.normalized) : '';
  const prior = input && Array.isArray(input.prior) ? input.prior.map((t) => String(t || '')).filter(Boolean) : [];
  const gate = (input && input.gate) || {};
  const claim = (input && input.claim) || {};
  if (gate.lang === 'non-en') return abstain('language-non-en', null);
  if (claim.kind !== 'exclusive') return abstain('not-exclusive', null);

  const data = approved.load();
  if (isPersonalOrMixed(current, prior)) {
    const row = data.byId.get(REFUSE_ID);
    if (!row || !row.sendable) return abstain('COVERAGE_DENIED', null);
    return { action: 'SEND', partId: row.id, contentHash: row.contentHash };
  }

  const params = (input && input.params) || loadParams();
  if (!params) return abstain('calibration-blocked', null);
  const continuation = prior.length && (/^\s*(?:and|also)\b/.test(current) || /\b(?:it|that|this|one|they|them)\b/.test(current));
  const normalized = continuation ? prior[prior.length - 1] + ' ' + current : current;
  const matched = preferSpecific(matchApproved({ normalized, rows: productRows(data), params }), data);
  if (matched && matched.action === 'SEND') {
    const row = data.byId.get(matched.partId);
    if (!row || !row.sendable || row.id === HANDOFF_ID || row.id === REFUSE_ID) {
      return abstain('COVERAGE_DENIED', null);
    }
    return { action: 'SEND', partId: row.id, contentHash: row.contentHash };
  }
  return abstain((matched && matched.code) || 'COVERAGE_DENIED', matched && matched.policy);
}

module.exports = {
  REFUSE_ID,
  HANDOFF_ID,
  decide,
  productRows,
  catalogCensus,
};
