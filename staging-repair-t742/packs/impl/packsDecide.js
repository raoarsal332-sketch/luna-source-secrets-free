'use strict';
/**
 * Packs decide. SEND a sendable catalog id, or ABSTAIN. Never prose.
 *
 * Order, once the router has one exclusive owner:
 * 1. non-en: do not send an English body
 * 2. not exclusive: do not send
 * 3. personal or mixed account-state: SEND the refuse id
 * 4. Packs registry veto: ABSTAIN unresolved-policy
 * 5. shared matchApproved scores the sendable pool (T and M from
 *    matcher-params.json). Cosine only ranks.
 * 6. proposition coverage is the membership gate
 * 7. one id: highest score, then smallest partId
 */

const approved = require('../../../staging-repair-t739/candidate/packs/packsApprovedAnswers');
const { matchApproved, loadParams } = require('../../../staging-repair-t739/candidate/approvedMatcher');
const { isPersonalOrMixed } = require('./packsAccount');
const { unresolvedPolicy } = require('./packsPolicy');
const { coversPart } = require('./packsPropositions');

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

  const policy = unresolvedPolicy(normalized);
  if (policy) return abstain('unresolved-policy', policy);

  const params = loadParams();
  if (!params) return abstain('calibration-blocked', null);
  const rows = productRows(data);
  const matched = matchApproved({ normalized, rows, params });
  const ranked = matched.candidates || [];
  const kept = [];
  for (const cand of ranked) {
    if (cand.partId === HANDOFF_ID || cand.partId === REFUSE_ID) continue;
    const row = data.byId.get(cand.partId);
    if (!row || !row.sendable) continue;
    if (!coversPart(normalized, row.id)) continue;
    kept.push(row);
  }
  if (!kept.length) return abstain('COVERAGE_DENIED', null);
  kept.sort((a, b) => {
    const sa = ranked.find((c) => c.partId === a.id);
    const sb = ranked.find((c) => c.partId === b.id);
    const ds = (sb ? sb.score : 0) - (sa ? sa.score : 0);
    if (ds) return ds;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const pick = kept[0];
  return { action: 'SEND', partId: pick.id, contentHash: pick.contentHash };
}

module.exports = {
  REFUSE_ID,
  HANDOFF_ID,
  decide,
  productRows,
  catalogCensus,
};
