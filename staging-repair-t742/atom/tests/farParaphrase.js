'use strict';

/**
 * Far paraphrases through the integrated handler.
 * Hold split is frozen: sha256(id) first byte mod 10 < 3.
 * Reports tune and hold separately. Does not read a sealed set.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

process.env.TICKET_STATE_FILE = path.join(os.tmpdir(), 't742-atom-far-ticket-state.json');
process.env.LUNA_ATOM_APPROVED_ANSWERS = path.join(
  __dirname, '..', '..', '..', 'staging-repair-t739', 'candidate', 'atom', 'faq-approved-answers-atom-v1.json'
);
process.env.LUNA_ATOM_SELECTOR_ENABLED = '1';

const atom = require('../atomModule');
const { normalizeForRoute } = require('../../../staging-repair-t739/candidate/routeNormalizer');
const router = require('../../../staging-repair-t739/candidate/publicRouter');
const faq = require('../../../staging-repair-t739/candidate/faqAssistance');
const approved = require('../../../staging-repair-t739/candidate/faqApprovedAnswers');
const boundary = require('../../../staging-repair-t739/candidate/publicWriteBoundary');
const { matchApproved, coversAllIntents, loadParams } = require('../../../staging-repair-t739/candidate/approvedMatcher');

const FILE = path.join(__dirname, 'far-paraphrases.json');
const FROZEN_CATALOG_SHA = 'df6e02686d6d4033f487f6c3140881ad67d920d3a5a52e424011e29220b072a6';

function hold(id) {
  const n = crypto.createHash('sha256').update(id).digest()[0];
  return n % 10 < 3;
}

function goldIds(gold) {
  const ids = Array.isArray(gold.acceptable) ? gold.acceptable.slice() : [];
  if (gold.partId && !ids.includes(gold.partId)) ids.push(gold.partId);
  return ids;
}

function decisionOk(got, gold) {
  if (gold.action === 'ROUTER') return true;
  if (gold.action === 'ABSTAIN') {
    return got && got.action === 'ABSTAIN' && got.code === gold.code && (got.policy || null) === (gold.policy || null);
  }
  return got && got.action === 'SEND' && goldIds(gold).includes(got.partId);
}

function hostDeps() {
  return {
    ownership() { return { blocked: false }; },
    parts(full) { return (full.conversation_parts && full.conversation_parts.conversation_parts) || []; },
    finWait() { return false; },
    humanRequest() { return false; },
    control: {
      isPaused() { return false; },
      isAiOff() { return false; },
      getConfig() { return { repliesEnabled: true }; },
      isTestAllowed() { return true; },
    },
    clientName() { return 'far'; },
    silence() { return { silenced: false }; },
    isOwn() { return false; },
    stop() { return false; },
    isGrant() { return false; },
    teammateScopeOpts() { return {}; },
  };
}

function conversation(text, n) {
  const part = {
    id: 'f' + n,
    part_type: 'comment',
    body: text,
    created_at: 1700000000,
    author: { type: 'user' },
  };
  return {
    full: {
      id: 'far' + n,
      state: 'open',
      open: true,
      team_assignee_id: null,
      admin_assignee_id: null,
      conversation_parts: { total_count: 1, conversation_parts: [part] },
    },
    parts: [part],
  };
}

function firstDivergence(trace) {
  const gold = trace.gold;
  if (gold.action === 'ROUTER') {
    if (!trace.router || trace.router.reason !== gold.reason || trace.router.send) return 'scope';
    if (trace.prepared && trace.prepared.plan) return 'downstream-substitution';
    return null;
  }
  if (!decisionOk(trace.decide, gold)) {
    if (gold.contractConflict && trace.decide && trace.decide.action === 'SEND' && goldIds(gold).includes(trace.decide.partId)) {
      return 'ranking';
    }
    if (gold.action === 'SEND' && gold.partId === atom.REFUSE_ID) return 'scope';
    if (gold.action === 'ABSTAIN' && gold.policy === 'policy.fee-refunds' && trace.decide && trace.decide.action === 'SEND') return 'scope';
    if (gold.action === 'ABSTAIN' && gold.code === 'atom-clarification' && trace.decide && trace.decide.action === 'SEND') {
      return trace.explain && trace.explain.product ? 'scope' : 'coverage';
    }
    if (gold.action === 'ABSTAIN' && gold.code === 'atom-2step-trailing' && trace.decide && trace.decide.action === 'SEND') return 'coverage';
    if (trace.decide && trace.decide.action === 'ABSTAIN') return 'coverage';
    if (trace.decide && /\.obsolete\./.test(trace.decide.partId || '') && gold.acceptable && gold.acceptable.some((id) => !/\.obsolete\./.test(id))) return 'ranking';
    return 'coverage';
  }
  if (gold.action === 'SEND') {
    if (!trace.catalogRow) return 'eligibility';
    if (trace.catalogRow.sendable !== true) return 'eligibility';
    if (trace.v12Get !== true) return 'eligibility';
    if (trace.boundary && trace.boundary.code === 'NON_SENDABLE') return 'eligibility';
    if (trace.boundary && trace.boundary.code === 'COVERAGE_DENIED') return 'coverage';
    if (!trace.prepared || trace.prepared.reason !== 'module-send') return 'downstream-substitution';
    if (!trace.prepared.plan || trace.prepared.partId !== trace.decide.partId) return 'downstream-substitution';
    if (!trace.router || trace.router.partId !== trace.decide.partId) return 'downstream-substitution';
    if (!trace.boundary || trace.boundary.ok !== true) return 'downstream-substitution';
  } else if (trace.prepared && trace.prepared.plan) {
    return 'downstream-substitution';
  }
  return null;
}

function eligibility() {
  const catalogPath = process.env.LUNA_ATOM_APPROVED_ANSWERS;
  const catalogSha = crypto.createHash('sha256').update(fs.readFileSync(catalogPath)).digest('hex');
  const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const atomCat = require('../../../staging-repair-t739/candidate/atom/atomApprovedAnswers');
  atomCat.clearCache();
  const loaded = atomCat.load();
  const refuse = atomCat.get(atom.REFUSE_ID);
  const v12 = approved.get(atom.REFUSE_ID);
  const index = boundary.loadIndex();
  const indexed = index.byId.get(atom.REFUSE_ID);
  const facts = JSON.parse(fs.readFileSync(atom.BODY_FACTS_PATH, 'utf8'));
  const params = loadParams();
  return {
    catalogPath,
    catalogSha256: catalogSha,
    catalogShaMatchesFrozen: catalogSha === FROZEN_CATALOG_SHA,
    catalogVersion: raw.version,
    loadedVersion: loaded.version,
    english: raw.answers.filter((a) => a.locale === 'en' && String(a.id).endsWith('.en')).length,
    sendableEnglish: loaded.sendable.filter((r) => String(r.id).endsWith('.en')).length,
    refuseInAtomLoader: !!(refuse && refuse.sendable === true && refuse.approval === 'source-verified'),
    refuseContentHash: refuse && refuse.contentHash,
    v12GetReturnsRefuse: !!(v12 && v12.sendable === true),
    v12IsSendableRow: approved.isSendableRow(refuse),
    boundaryKind: indexed && indexed.kind,
    refuseFactCount: Array.isArray(facts.facts[atom.REFUSE_ID]) ? facts.facts[atom.REFUSE_ID].length : null,
    moduleCatalog: atom.verifyCatalog(),
    T: params && params.T,
    M: params && params.M,
  };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const fileSha = crypto.createHash('sha256').update(fs.readFileSync(FILE)).digest('hex');
  const gateInfo = eligibility();
  const index = boundary.loadIndex();
  const params = loadParams();
  const deps = hostDeps();
  const buckets = { tune: [], hold: [] };
  for (const row of data.rows) {
    const split = hold(row.id) ? 'hold' : 'tune';
    const normalized = normalizeForRoute(row.text);
    const claim = atom.claim({ normalized });
    const explain = atom.explain(normalized);
    let decide = null;
    if (claim && claim.kind === 'exclusive' && claim.entity === 'atom') {
      decide = atom.decide({ normalized, gate: { lang: 'en' }, claim });
    }
    const conv = conversation(row.text, row.id);
    const prepared = await faq.prepare(conv.full, conv.parts, 'conversation.user.replied', deps);
    const routed = await router.route({
      text: row.text,
      prior: [],
      conversationId: conv.full.id,
      eventId: conv.parts[0].id,
    });
    const postedId = decide && decide.partId;
    const catalogRow = postedId ? approved.get(postedId) : null;
    let boundaryResult = null;
    let cover = null;
    if (decide && decide.action === 'SEND' && catalogRow) {
      boundary.bindTurn({ normalized, text: row.text, conversationId: conv.full.id });
      cover = coversAllIntents(normalized, decide.partId, index.rows, params);
      boundaryResult = boundary.assertApprovedPublicOutput({ message_type: 'comment', body: catalogRow.body });
    }
    let cosineFirst = null;
    if (row.contractConflict || (row.gold && row.gold.contractConflict)) {
      const matched = matchApproved({
        normalized,
        rows: router.sendableRows('atom'),
        params,
        clarify: false,
      });
      cosineFirst = matched && matched.partId;
    }
    const trace = {
      id: row.id,
      split,
      referent: row.referent,
      gold: row.gold,
      explain: explain && { product: explain.product, personal: explain.personal, policy: explain.policy, trailing: explain.trailing, clarify: explain.clarify, intents: explain.intents, covered: explain.covered },
      decide,
      cosineFirst,
      router: routed && { reason: routed.reason, send: !!routed.send, partId: routed.decide && routed.decide.partId },
      prepared: prepared && { reason: prepared.reason, partId: prepared.plan && prepared.plan.answerIds && prepared.plan.answerIds[0], plan: !!(prepared.plan) },
      catalogRow: catalogRow && { id: catalogRow.id, sendable: catalogRow.sendable, approval: catalogRow.approval },
      v12Get: !!(catalogRow && catalogRow.sendable === true),
      cover,
      boundary: boundaryResult && { ok: boundaryResult.ok, code: boundaryResult.code, ids: boundaryResult.ids },
    };
    trace.divergence = firstDivergence(trace);
    trace.ok = !trace.divergence || (trace.divergence === 'ranking' && row.gold && row.gold.contractConflict);
    buckets[split].push(trace);
  }
  function summarize(list) {
    const scored = list.filter((t) => !(t.gold && t.gold.contractConflict));
    const ok = scored.filter((t) => t.ok).length;
    return {
      n: list.length,
      scored: scored.length,
      correct: ok + '/' + scored.length,
      contractConflict: list.filter((t) => t.gold && t.gold.contractConflict).map((t) => ({
        id: t.id,
        cosineFirst: t.cosineFirst,
        decide: t.decide && t.decide.partId,
        divergence: t.divergence,
      })),
      misses: list.filter((t) => !t.ok).map((t) => ({
        id: t.id,
        referent: t.referent,
        divergence: t.divergence,
        gold: t.gold.partId || t.gold.code || t.gold.reason,
        decide: t.decide && (t.decide.partId || (t.decide.code + (t.decide.policy ? '/' + t.decide.policy : ''))),
        explain: t.explain,
        prepare: t.prepared && t.prepared.reason,
        router: t.router,
        boundary: t.boundary && t.boundary.code,
        cover: t.cover,
        cosineFirst: t.cosineFirst,
      })),
    };
  }
  const report = {
    node: process.version,
    fileSha256: fileSha,
    eligibility: gateInfo,
    tune: summarize(buckets.tune),
    hold: summarize(buckets.hold),
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
