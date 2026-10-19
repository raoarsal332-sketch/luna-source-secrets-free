'use strict';
/**
 * Isolated Packs dev harness. Disk only. No network. No Intercom.
 * Does not open a sealed set.
 * Scores module-direct decide and publicRouter.route (flag on and flag off).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const approved = require('../../../staging-repair-t739/candidate/packs/packsApprovedAnswers');
const { loadParams, PARAMS_PATH } = require('../../../staging-repair-t739/candidate/approvedMatcher');
const { normalizeForRoute } = require('../../../staging-repair-t739/candidate/routeNormalizer');
const sharedPolicy = require('../../../staging-repair-t739/candidate/unresolvedPolicy');
const { route } = require('../../../staging-repair-t739/candidate/publicRouter');
const { claim, decide, catalogCensus, REFUSE_ID, HANDOFF_ID, propositionsSha256 } = require('../impl');

const DEV_PATH = path.join(__dirname, '..', 'devset', 'packs-dev-t742.json');
const CATALOG_PATH = approved.DEFAULT_PATH;
const IMPL_DIR = path.join(__dirname, '..', 'impl');
const F1_STATE = path.join('/tmp', 'packs-dev-f1-ticket-state.json');

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function moduleFiles() {
  return fs.readdirSync(IMPL_DIR)
    .filter((name) => fs.statSync(path.join(IMPL_DIR, name)).isFile())
    .sort()
    .map((name) => ({ file: 'staging-repair-t742/packs/impl/' + name, sha256: sha256File(path.join(IMPL_DIR, name)) }));
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

function sig(out) {
  if (!out) return 'none';
  if (out.action === 'SEND') return 'SEND:' + out.partId;
  return 'ABSTAIN:' + (out.code || '') + ':' + (out.policy || '');
}

async function routeRow(row, packsOn) {
  const prevPacks = process.env.LUNA_PACKS_ENABLED;
  const prevAtom = process.env.LUNA_ATOM_SELECTOR_ENABLED;
  if (packsOn) process.env.LUNA_PACKS_ENABLED = '1';
  else delete process.env.LUNA_PACKS_ENABLED;
  delete process.env.LUNA_ATOM_SELECTOR_ENABLED;
  try {
    return await route({
      text: row.text,
      prior: [],
      deliveryWired: true,
      conversationId: 'dev-' + row.id + (packsOn ? '-on' : '-off'),
      eventId: 'evt-' + row.id + (packsOn ? '-on' : '-off'),
    });
  } finally {
    if (prevPacks == null) delete process.env.LUNA_PACKS_ENABLED;
    else process.env.LUNA_PACKS_ENABLED = prevPacks;
    if (prevAtom == null) delete process.env.LUNA_ATOM_SELECTOR_ENABLED;
    else process.env.LUNA_ATOM_SELECTOR_ENABLED = prevAtom;
  }
}

function routerExclusiveOk(row, routed) {
  if (row.outcome === 'SEND') {
    return !!(routed && routed.reason === 'module-send' && routed.decide && routed.decide.action === 'SEND' && routed.decide.partId === row.answerId);
  }
  if (row.outcome !== 'ABSTAIN') return false;
  if (!routed || !routed.terminal || routed.reason !== row.code) return false;
  if (row.code === 'unresolved-policy') return !!(routed.decide && routed.decide.policy === row.policy);
  return true;
}

function isF1(routed) {
  return !!(routed && routed.f1 === true && routed.terminal === true && routed.entity === 'packs');
}

async function main() {
  process.env.TICKET_STATE_FILE = F1_STATE;
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

  let routerCorrect = 0;
  let routerFr = 0;
  let f1 = 0;
  const routerMisses = [];
  const parity = [];
  let sharedNoneRouterSends = 0;
  let sharedNoneFlagOffF1 = 0;

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

    const on = await routeRow(row, true);
    const off = await routeRow(row, false);
    if (routerExclusiveOk(row, on)) routerCorrect += 1;
    else {
      if (row.outcome === 'SEND') routerFr += 1;
      routerMisses.push({
        id: row.id,
        gold: row.outcome === 'SEND' ? row.answerId : row.code + (row.policy ? ':' + row.policy : ''),
        got: on && on.decide
          ? (on.decide.action === 'SEND' ? on.decide.partId : on.decide.code + (on.decide.policy ? ':' + on.decide.policy : ''))
          : (on && on.reason) || 'none',
      });
    }
    if (isF1(off)) f1 += 1;
    const routedSig = on && on.decide ? sig(on.decide) : 'none:' + ((on && on.reason) || '');
    if (sig(out) !== routedSig) {
      parity.push({ id: row.id, module: sig(out), router: routedSig });
    }
  }

  for (const row of rows) {
    if (row.claim && row.claim.kind === 'exclusive') continue;
    const on = await routeRow(row, true);
    const off = await routeRow(row, false);
    if (on && (on.send || (on.decide && on.decide.action === 'SEND') || (on.decide && on.decide.partId === REFUSE_ID))) {
      sharedNoneRouterSends += 1;
    }
    if (off && off.f1 === true && off.entity === 'packs') sharedNoneFlagOffF1 += 1;
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
    params: params ? { T: params.T, M: params.M, algorithm: params.algorithm, sha256: sha256File(PARAMS_PATH) } : null,
    propositionsSha256: propositionsSha256(),
    moduleFiles: moduleFiles(),
    claim: { ok: claimOk, n: rows.length },
    moduleDirect: {
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
    routerFlagOn: {
      correct: routerCorrect + '/' + exclusive.length,
      fr: routerFr + '/' + sendRows.length,
      misses: routerMisses,
    },
    routerFlagOff: {
      f1: f1 + '/' + exclusive.length,
    },
    parityGap: parity,
    sharedNoneSends: { module: offSent, router: sharedNoneRouterSends, n: offN },
    sharedNoneFlagOffPacksF1: sharedNoneFlagOffF1,
    sharedNormalizerMismatches: { n: normMismatch, of: rows.length, ids: normIds },
    sharedPolicyDisagreementsOnExclusive: { miss: policyMiss, extra: policyExtra },
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  const parityOk = parity.length === 0
    && correct === exclusive.length
    && fr === 0
    && routerCorrect === exclusive.length
    && routerFr === 0
    && f1 === exclusive.length
    && offSent === 0
    && sharedNoneRouterSends === 0
    && nonSendable === 0
    && handoffSent === 0;
  if (!report.catalog.censusOk || claimOk !== rows.length || !parityOk) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
  process.exitCode = 2;
});
