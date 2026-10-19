'use strict';
/**
 * Isolated Packs dev harness. Disk only. No network. No Intercom.
 * Does not open a sealed set. Scores decide on the 94 exclusive rows.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const approved = require('../../../staging-repair-t739/candidate/packs/packsApprovedAnswers');
const { loadParams } = require('../../../staging-repair-t739/candidate/approvedMatcher');
const { normalizeForRoute } = require('../../../staging-repair-t739/candidate/routeNormalizer');
const sharedPolicy = require('../../../staging-repair-t739/candidate/unresolvedPolicy');
const { claim, decide, catalogCensus, REFUSE_ID, HANDOFF_ID, propositionsSha256 } = require('../impl');

const DEV_PATH = path.join(__dirname, '..', 'devset', 'packs-dev-t742.json');
const CATALOG_PATH = approved.DEFAULT_PATH;

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function runDecide(row) {
  return decide({
    text: row.text,
    normalized: row.normalized,
    prior: null,
    gate: { lang: 'en' },
    claim: claim({ text: row.text, normalized: row.normalized, prior: null }),
  });
}

function decisionOk(row, out) {
  if (row.outcome === 'SEND') return out.action === 'SEND' && out.partId === row.answerId;
  if (row.outcome !== 'ABSTAIN') return false;
  if (out.action !== 'ABSTAIN' || out.code !== row.code) return false;
  if (row.code === 'unresolved-policy') return out.policy === row.policy;
  return true;
}

function main() {
  const dev = JSON.parse(fs.readFileSync(DEV_PATH, 'utf8'));
  const rows = dev.rows;
  const data = approved.load();
  const census = catalogCensus(data);
  const params = loadParams();
  const exclusive = rows.filter((row) => row.claim && row.claim.kind === 'exclusive');
  const sendRows = exclusive.filter((row) => row.outcome === 'SEND');
  let correct = 0;
  let wrong = 0;
  let abstain = 0;
  let fr = 0;
  let nonSendable = 0;
  let handoffSent = 0;
  let personalExact = 0;
  let mixedExact = 0;
  let registryExact = 0;
  let coverageExact = 0;
  const personalN = exclusive.filter((row) => row.ask === 'personal').length;
  const mixedN = exclusive.filter((row) => row.ask === 'mixed').length;
  const registryN = exclusive.filter((row) => row.code === 'unresolved-policy').length;
  const coverageN = exclusive.filter((row) => row.code === 'COVERAGE_DENIED').length;
  const misses = [];
  const refuse = data.byId.get(REFUSE_ID);

  for (const row of exclusive) {
    const out = runDecide(row);
    if (out.action === 'ABSTAIN') abstain += 1;
    if (out.action === 'SEND') {
      const got = data.byId.get(out.partId);
      if (!got || !got.sendable) nonSendable += 1;
      if (out.partId === HANDOFF_ID) handoffSent += 1;
    }
    const ok = decisionOk(row, out);
    if (ok) correct += 1;
    else {
      wrong += 1;
      if (row.outcome === 'SEND') fr += 1;
      misses.push({
        id: row.id,
        gold: row.outcome === 'SEND' ? row.answerId : row.code + (row.policy ? ':' + row.policy : ''),
        got: out.action === 'SEND' ? out.partId : out.code + (out.policy ? ':' + out.policy : ''),
      });
    }
    if ((row.ask === 'personal' || row.ask === 'mixed') && out.action === 'SEND' && out.partId === REFUSE_ID && out.contentHash === refuse.contentHash) {
      if (row.ask === 'personal') personalExact += 1;
      else mixedExact += 1;
    }
    if (row.code === 'unresolved-policy' && ok) registryExact += 1;
    if (row.code === 'COVERAGE_DENIED' && ok) coverageExact += 1;
  }

  let claimOk = 0;
  for (const row of rows) {
    const got = claim({ text: row.text, normalized: row.normalized, prior: null });
    const gold = row.claim;
    if (
      got.kind === gold.kind &&
      (got.entity || null) === (gold.entity || null) &&
      JSON.stringify(got.evidenceSpans) === JSON.stringify(gold.evidenceSpans || [])
    ) {
      claimOk += 1;
    }
  }

  let offN = 0;
  let offSent = 0;
  for (const row of rows) {
    if (row.claim && row.claim.kind === 'exclusive') continue;
    offN += 1;
    if (runDecide(row).action === 'SEND') offSent += 1;
  }

  let normMismatch = 0;
  const normIds = [];
  let policyMiss = 0;
  let policyExtra = 0;
  for (const row of rows) {
    if (normalizeForRoute(row.text) !== row.normalized) {
      normMismatch += 1;
      if (normIds.length < 12) normIds.push(row.id);
    }
  }
  for (const row of exclusive) {
    const shared = sharedPolicy.unresolvedPolicy(row.normalized);
    const gold = row.policy || null;
    if (gold && shared !== gold) policyMiss += 1;
    else if (!gold && shared) policyExtra += 1;
  }

  const report = {
    catalog: {
      sha256: sha256File(CATALOG_PATH),
      ...census,
      censusOk: census.english === 44 && census.sendable === 40 && census.englishSendable === 40,
    },
    dev: { sha256: sha256File(DEV_PATH), rows: rows.length },
    params: params ? { T: params.T, M: params.M, algorithm: params.algorithm, sha256: sha256File(require('../../../staging-repair-t739/candidate/approvedMatcher').PARAMS_PATH) } : null,
    propositionsSha256: propositionsSha256(),
    claim: { ok: claimOk, n: rows.length },
    exclusive: {
      correct: correct + '/' + exclusive.length,
      wrong: wrong + '/' + exclusive.length,
      abstain: abstain + '/' + exclusive.length,
      fr: fr + '/' + sendRows.length,
      personalExact: personalExact + '/' + personalN,
      mixedExact: mixedExact + '/' + mixedN,
      registryExact: registryExact + '/' + registryN,
      coverageExact: coverageExact + '/' + coverageN,
      nonSendable,
      handoffSent,
      misses,
    },
    sharedNoneSends: { sent: offSent, n: offN },
    sharedNormalizerMismatches: { n: normMismatch, ids: normIds },
    sharedPolicyDisagreementsOnExclusive: { miss: policyMiss, extra: policyExtra },
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.catalog.censusOk || claimOk !== rows.length || correct !== exclusive.length || fr !== 0 || offSent !== 0) {
    process.exitCode = 2;
  }
}

main();
