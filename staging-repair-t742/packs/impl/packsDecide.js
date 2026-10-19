'use strict';
/**
 * Packs decide. SEND a sendable catalog id, or ABSTAIN. Never prose.
 *
 * Order when the router has already established one exclusive owner:
 * 1. non-en: do not send an English body
 * 2. not exclusive: do not send (the router should not have called)
 * 3. personal or mixed account-state: SEND packs.account-status.refuse.en
 * 4. canonical policy veto: ABSTAIN unresolved-policy
 * 5. matchApproved on the sendable pool excluding refuse and handoff
 * 6. keep a candidate only when its body covers every intent
 * 7. one id: highest score, then lexicographically smallest partId
 *    otherwise ABSTAIN COVERAGE_DENIED
 *
 * The handoff row stays in the catalog index and is not a candidate.
 * No model-composed text. No new FAQ row.
 */

const approved = require('../../../staging-repair-t739/packs/packsApprovedAnswers');
const { isPersonalOrMixed } = require('./packsAccount');
const { unresolvedPolicy } = require('./packsPolicy');
const { coversAllIntents, catalogStemSet } = require('./packsCoverage');
const { matchApproved } = require('./packsMatch');

const REFUSE_ID = 'packs.account-status.refuse.en';
const HANDOFF_ID = 'packs.handoff.unverified.en';

/**
 * Operating point from the dev sweep. No T in {0.15 … 0.60} meets
 * ≥95% correct and ≤5% false refusal, so this value is not frozen
 * and is not written to matcher-params.json. See the dev harness.
 */
const DEFAULT_T = 0.15;

function abstain(code, policy) {
  return { action: 'ABSTAIN', code, policy: policy || null };
}

function productRows(data) {
  return data.all.filter((row) => {
    if (!row.sendable) return false;
    const tags = row.intentTags || [];
    if (tags.includes('accountStatusBoundary')) return false;
    if (tags.includes('handoff')) return false;
    return true;
  });
}

function catalogCensus(data) {
  const all = data.all;
  const english = all.filter((row) => row.locale === 'en' || row.language === 'en');
  const sendable = all.filter((row) => row.sendable);
  const englishSendable = english.filter((row) => row.sendable);
  return {
    rows: all.length,
    english: english.length,
    sendable: sendable.length,
    englishSendable: englishSendable.length,
    productPool: productRows(data).length,
  };
}

function decide(input, params) {
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

  const t = params && typeof params.T === 'number' ? params.T : DEFAULT_T;
  const rows = productRows(data);
  const matched = matchApproved({ normalized, rows, params: { T: t } });
  const catalog = catalogStemSet(rows);
  const kept = [];
  for (const cand of matched.candidates || []) {
    if (cand.partId === HANDOFF_ID || cand.partId === REFUSE_ID) continue;
    const row = data.byId.get(cand.partId);
    if (!row || !row.sendable) continue;
    if (!coversAllIntents(normalized, row.body, catalog)) continue;
    kept.push({ partId: row.id, score: cand.score, contentHash: row.contentHash });
  }
  if (!kept.length) return abstain('COVERAGE_DENIED', null);
  kept.sort((a, b) => b.score - a.score || a.partId.localeCompare(b.partId));
  const pick = kept[0];
  return { action: 'SEND', partId: pick.partId, contentHash: pick.contentHash };
}

module.exports = {
  REFUSE_ID,
  HANDOFF_ID,
  DEFAULT_T,
  decide,
  productRows,
  catalogCensus,
};
