'use strict';
/**
 * Isolated Packs dev harness. Reads the frozen dev set and the approved
 * catalog from disk. No network. No Intercom. Does not open a sealed set.
 *
 * Scores decide on the 94 exclusive rows. Shared and none are checked
 * only to prove the refuse id is not sent. Claim is checked on every row.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const approved = require('../../../staging-repair-t739/packs/packsApprovedAnswers');
const { claim, decide, normalizeForRoute, catalogCensus, DEFAULT_T, REFUSE_ID, HANDOFF_ID } = require('../impl');
const { T_GRID, loadSharedMatcher, loadSharedParams, localMatchApproved } = require('../impl/packsMatch');
const { productRows } = require('../impl/packsDecide');

const DEV_PATH = path.join(__dirname, '..', 'devset', 'packs-dev-t742.json');
const CATALOG_PATH = approved.DEFAULT_PATH;

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function isExclusive(row) {
  return row.claim && row.claim.kind === 'exclusive';
}

function goldSend(row) {
  return row.outcome === 'SEND';
}

function decisionOk(row, out) {
  if (goldSend(row)) return out.action === 'SEND' && out.partId === row.answerId;
  if (row.outcome !== 'ABSTAIN') return false;
  if (out.action !== 'ABSTAIN' || out.code !== row.code) return false;
  if (row.code === 'unresolved-policy') return out.policy === row.policy;
  return true;
}

function isFalseRefusal(row, out) {
  if (!goldSend(row)) return false;
  if (out.action !== 'SEND') return true;
  return out.partId !== row.answerId;
}

function scoreAt(rows, T) {
  const exclusive = rows.filter(isExclusive);
  const sendRows = exclusive.filter(goldSend);
  let correct = 0;
  let wrong = 0;
  let abstain = 0;
  let fr = 0;
  let nonSendable = 0;
  let handoffSent = 0;
  const data = approved.load();
  const misses = [];
  let registryExact = 0;
  let registryN = 0;
  let coverageExact = 0;
  let coverageN = 0;
  for (const row of exclusive) {
    const out = decide(
      { text: row.text, normalized: row.normalized, prior: null, gate: { lang: 'en' }, claim: claim({ normalized: row.normalized }) },
      { T }
    );
    if (out.action === 'ABSTAIN') abstain += 1;
    if (out.action === 'SEND') {
      const got = data.byId.get(out.partId);
      if (!got || !got.sendable) nonSendable += 1;
      if (out.partId === HANDOFF_ID) handoffSent += 1;
    }
    if (row.code === 'unresolved-policy') {
      registryN += 1;
      if (decisionOk(row, out)) registryExact += 1;
    }
    if (row.code === 'COVERAGE_DENIED') {
      coverageN += 1;
      if (decisionOk(row, out)) coverageExact += 1;
    }
    if (decisionOk(row, out)) correct += 1;
    else {
      wrong += 1;
      if (isFalseRefusal(row, out)) fr += 1;
      misses.push({
        id: row.id,
        gold: goldSend(row) ? row.answerId : row.code + (row.policy ? ':' + row.policy : ''),
        got: out.action === 'SEND' ? out.partId : out.code + (out.policy ? ':' + out.policy : ''),
        fr: isFalseRefusal(row, out),
      });
    }
  }
  const personal = exclusive.filter((row) => row.ask === 'personal');
  const mixed = exclusive.filter((row) => row.ask === 'mixed');
  const exact = (list) =>
    list.filter((row) => {
      const out = decide(
        { text: row.text, normalized: row.normalized, prior: null, gate: { lang: 'en' }, claim: claim({ normalized: row.normalized }) },
        { T }
      );
      return out.action === 'SEND' && out.partId === REFUSE_ID && out.contentHash === data.byId.get(REFUSE_ID).contentHash;
    }).length;
  return {
    T,
    exclusive: exclusive.length,
    correct,
    wrong,
    abstain,
    fr,
    sendGold: sendRows.length,
    nonSendable,
    handoffSent,
    personalExact: exact(personal),
    personalN: personal.length,
    mixedExact: exact(mixed),
    mixedN: mixed.length,
    registryExact,
    registryN,
    coverageExact,
    coverageN,
    misses,
  };
}

function claimReport(rows) {
  let ok = 0;
  const bad = [];
  for (const row of rows) {
    const got = claim({ text: row.text, normalized: row.normalized, prior: null });
    const gold = row.claim;
    const sameKind = got.kind === gold.kind;
    const sameEntity = (got.entity || null) === (gold.entity || null);
    const sameSpans = JSON.stringify(got.evidenceSpans) === JSON.stringify(gold.evidenceSpans || []);
    if (sameKind && sameEntity && sameSpans) ok += 1;
    else if (bad.length < 12) bad.push(row.id);
  }
  return { ok, n: rows.length, bad };
}

function normalizerReport(rows) {
  let ok = 0;
  const bad = [];
  for (const row of rows) {
    const got = normalizeForRoute(row.text);
    if (got === row.normalized) ok += 1;
    else if (bad.length < 8) bad.push(row.id);
  }
  return { ok, n: rows.length, bad };
}

function refuseNotSentOffExclusive(rows) {
  let sent = 0;
  let n = 0;
  for (const row of rows) {
    if (isExclusive(row)) continue;
    n += 1;
    const owned = claim({ normalized: row.normalized });
    const out = decide({ normalized: row.normalized, gate: { lang: 'en' }, claim: owned });
    if (out.action === 'SEND') sent += 1;
  }
  return { n, sent };
}

function goldBelowT(rows, T) {
  const pool = productRows(approved.load());
  const sends = rows.filter((row) => isExclusive(row) && goldSend(row) && row.answerId !== REFUSE_ID);
  let below = 0;
  for (const row of sends) {
    const matched = localMatchApproved({ normalized: row.normalized, rows: pool, params: { T: 0.0001 } });
    const gold = (matched.candidates || []).find((cand) => cand.partId === row.answerId);
    if (!gold || gold.score < T) below += 1;
  }
  return { below, productSends: sends.length };
}

function qualifies(result) {
  const correctRate = result.correct / result.exclusive;
  const frRate = result.sendGold ? result.fr / result.sendGold : 1;
  return result.nonSendable === 0 && result.handoffSent === 0 && frRate <= 0.05 && correctRate >= 0.95;
}

function main() {
  const dev = JSON.parse(fs.readFileSync(DEV_PATH, 'utf8'));
  const rows = dev.rows;
  const census = catalogCensus(approved.load());
  const shared = loadSharedMatcher();
  const sharedParams = loadSharedParams();
  const sweep = T_GRID.map((T) => {
    const result = scoreAt(rows, T);
    return {
      T: result.T,
      correct: result.correct,
      exclusive: result.exclusive,
      wrong: result.wrong,
      abstain: result.abstain,
      fr: result.fr,
      sendGold: result.sendGold,
      nonSendable: result.nonSendable,
      handoffSent: result.handoffSent,
      qualifies: qualifies(result),
      personalExact: result.personalExact,
      personalN: result.personalN,
      mixedExact: result.mixedExact,
      mixedN: result.mixedN,
      registryExact: result.registryExact,
      registryN: result.registryN,
      coverageExact: result.coverageExact,
      coverageN: result.coverageN,
    };
  });
  const operating = scoreAt(rows, DEFAULT_T);
  const report = {
    catalog: {
      path: path.relative(process.cwd(), CATALOG_PATH),
      sha256: sha256File(CATALOG_PATH),
      ...census,
      expectedEnglish: 44,
      expectedSendable: 40,
      censusOk: census.english === 44 && census.sendable === 40 && census.englishSendable === 40,
    },
    dev: {
      path: path.relative(process.cwd(), DEV_PATH),
      sha256: sha256File(DEV_PATH),
      rows: rows.length,
    },
    sharedMatcher: { source: shared.source, file: shared.file || null, error: shared.error || null },
    sharedParams: sharedParams,
    normalizer: normalizerReport(rows),
    claim: claimReport(rows),
    refuseLeakOffExclusive: refuseNotSentOffExclusive(rows),
    sweep,
    goldCosineBelowT: goldBelowT(rows, DEFAULT_T),
    calibration: sweep.some((row) => row.qualifies) ? 'QUALIFIED' : 'BLOCKED',
    operatingT: DEFAULT_T,
    operating: {
      correct: operating.correct + '/' + operating.exclusive,
      wrong: operating.wrong + '/' + operating.exclusive,
      abstain: operating.abstain + '/' + operating.exclusive,
      fr: operating.fr + '/' + operating.sendGold,
      personalExact: operating.personalExact + '/' + operating.personalN,
      mixedExact: operating.mixedExact + '/' + operating.mixedN,
      registryExact: operating.registryExact + '/' + operating.registryN,
      coverageExact: operating.coverageExact + '/' + operating.coverageN,
      nonSendable: operating.nonSendable,
      handoffSent: operating.handoffSent,
      misses: operating.misses,
    },
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.catalog.censusOk) process.exitCode = 2;
  if (report.claim.ok !== report.claim.n) process.exitCode = 2;
}

main();
