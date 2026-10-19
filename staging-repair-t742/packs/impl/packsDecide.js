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
 */

const approved = require('../../../staging-repair-t739/candidate/packs/packsApprovedAnswers');
const { matchApproved, loadParams } = require('../../../staging-repair-t739/candidate/approvedMatcher');
const { isPersonalOrMixed } = require('./packsAccount');

const REFUSE_ID = 'packs.account-status.refuse.en';
const HANDOFF_ID = 'packs.handoff.unverified.en';

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
  const normalized = input && input.normalized != null ? String(input.normalized) : '';
  const gate = (input && input.gate) || {};
  const claim = (input && input.claim) || {};
  if (gate.lang === 'non-en') return abstain('language-non-en', null);
  if (claim.kind !== 'exclusive') return abstain('not-exclusive', null);

  const data = approved.load();
  if (isPersonalOrMixed(normalized)) {
    const row = data.byId.get(REFUSE_ID);
    if (!row || !row.sendable) return abstain('COVERAGE_DENIED', null);
    return { action: 'SEND', partId: row.id, contentHash: row.contentHash };
  }

  const params = (input && input.params) || loadParams();
  if (!params) return abstain('calibration-blocked', null);
  const matched = matchApproved({ normalized, rows: productRows(data), params });
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
