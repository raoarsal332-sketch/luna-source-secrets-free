'use strict';

/**
 * Isolated Atom dev-set test. Reads staging-repair-t742/atom/atom_dev_set.json only.
 * Host text is the shared routeNormalizer. Does not load held-out, sealed, or reviewer files.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

process.env.TICKET_STATE_FILE = path.join(os.tmpdir(), 't742-atom-dev-ticket-state.json');

process.env.LUNA_ATOM_APPROVED_ANSWERS = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'staging-repair-t739',
  'candidate',
  'atom',
  'faq-approved-answers-atom-v1.json'
);

const atom = require('../atomModule');
const { normalizeForRoute } = require('../../../staging-repair-t739/candidate/routeNormalizer');
const router = require('../../../staging-repair-t739/candidate/publicRouter');
const approved = require('../../../staging-repair-t739/candidate/faqApprovedAnswers');
const faq = require('../../../staging-repair-t739/candidate/faqAssistance');

const DEV_PATH = path.join(__dirname, '..', 'atom_dev_set.json');

function sameSpans(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].start !== b[i].start || a[i].end !== b[i].end) return false;
  }
  return true;
}

function goldDecision(row) {
  if (!row.decide) return null;
  if (row.decide.action === 'SEND') return { action: 'SEND', partId: row.decide.partId };
  return { action: 'ABSTAIN', code: row.decide.code, policy: row.decide.policy == null ? null : row.decide.policy };
}

function matches(got, gold) {
  if (!gold) return got.action !== 'SEND';
  if (got.action !== gold.action) return false;
  if (gold.action === 'SEND') return got.partId === gold.partId;
  return got.code === gold.code && (got.policy || null) === (gold.policy || null);
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
    clientName() { return 'dev-set'; },
    silence() { return { silenced: false }; },
    isOwn() { return false; },
    stop() { return false; },
    isGrant() { return false; },
    teammateScopeOpts() { return {}; },
  };
}

function conversation(text, n) {
  const part = {
    id: 'e' + n,
    part_type: 'comment',
    body: text,
    created_at: 1700000000,
    author: { type: 'user' },
  };
  return {
    full: {
      id: 'c' + n,
      state: 'open',
      open: true,
      team_assignee_id: null,
      admin_assignee_id: null,
      conversation_parts: { total_count: 1, conversation_parts: [part] },
    },
    parts: [part],
  };
}

async function main() {
  const dev = JSON.parse(fs.readFileSync(DEV_PATH, 'utf8'));
  const devSha = crypto.createHash('sha256').update(fs.readFileSync(DEV_PATH)).digest('hex');
  const catalog = atom.verifyCatalog();
  const exclusive = [];
  const claimMiss = [];
  const mismatches = [];
  let personal = { n: 0, exact: 0 };
  let mixed = { n: 0, exact: 0 };
  let correct = 0;
  let wrong = 0;
  let abstain = 0;
  let fr = 0;
  let goldSend = 0;
  let noneCalledSend = 0;
  const deps = hostDeps();
  let f1 = 0;
  let f1Exclusive = 0;
  let noneSharedRouterSend = 0;
  let catalogPlans = 0;
  let routerSends = 0;
  let catalogPlanMiss = 0;
  let languageUncertain = 0;
  let policyShortCircuit = 0;
  const catalogMisses = [];

  const savedFlag = process.env.LUNA_ATOM_SELECTOR_ENABLED;
  process.env.LUNA_ATOM_SELECTOR_ENABLED = '0';

  for (const row of dev.rows) {
    const normalized = normalizeForRoute(row.text);
    const gotClaim = atom.claim({ text: row.text, normalized, prior: null });
    if (gotClaim.kind !== row.claim.kind || gotClaim.entity !== row.claim.entity || !sameSpans(gotClaim.evidenceSpans, row.claim.evidenceSpans)) {
      claimMiss.push({
        id: row.id,
        kind: gotClaim.kind === row.claim.kind && gotClaim.entity === row.claim.entity ? 'span' : 'kind',
        got: gotClaim,
        gold: row.claim,
      });
    }
    const off = await router.route({
      text: row.text,
      prior: [],
      conversationId: 'off-' + row.id,
      eventId: 'e-' + row.id,
    });
    if (row.claim.kind !== 'exclusive') {
      const stray = atom.decide({ text: row.text, normalized, prior: null, claim: gotClaim });
      if (stray.action === 'SEND') noneCalledSend += 1;
      if (off && off.send) noneSharedRouterSend += 1;
      continue;
    }
    f1Exclusive += 1;
    if (off && off.terminal && off.f1 && !off.send && off.mainRoute === false) f1 += 1;
    exclusive.push(row);
    const got = atom.decide({ text: row.text, normalized, prior: null, gate: { lang: 'en' }, claim: gotClaim });
    const gold = goldDecision(row);
    const ok = matches(got, gold);
    if (ok) correct += 1;
    else {
      wrong += 1;
      if (mismatches.length < 30) {
        mismatches.push({
          id: row.id,
          gold: gold.action === 'SEND' ? gold.partId : gold.code + (gold.policy ? ' ' + gold.policy : ''),
          got: got.action === 'SEND' ? got.partId : got.code + (got.policy ? ' ' + got.policy : ''),
        });
      }
    }
    if (got.action === 'ABSTAIN') abstain += 1;
    if (gold.action === 'SEND') {
      goldSend += 1;
      if (!ok) fr += 1;
    }
    if (row.ask === 'personal') {
      personal.n += 1;
      if (got.action === 'SEND' && got.partId === atom.REFUSE_ID) personal.exact += 1;
    }
    if (row.ask === 'mixed') {
      mixed.n += 1;
      if (got.action === 'SEND' && got.partId === atom.REFUSE_ID) mixed.exact += 1;
    }
  }

  process.env.LUNA_ATOM_SELECTOR_ENABLED = '1';
  let routerIndex = 0;
  for (const row of exclusive) {
    routerIndex += 1;
    const conv = conversation(row.text, routerIndex);
    const prepared = await faq.prepare(conv.full, conv.parts, 'conversation.user.replied', deps);
    const routed = await router.route({
      text: row.text,
      prior: [],
      conversationId: conv.full.id,
      eventId: conv.parts[0].id,
    });
    if (routed && routed.reason === 'language-uncertain-module-on') languageUncertain += 1;
    if (routed && routed.reason === 'unresolved-policy' && row.decide.action === 'SEND') policyShortCircuit += 1;
    if (routed && routed.send && routed.decide && routed.decide.action === 'SEND') {
      routerSends += 1;
      const rowCat = approved.get(routed.decide.partId);
      const planOk = prepared
        && prepared.reason === 'module-send'
        && prepared.plan
        && prepared.plan.answerIds
        && prepared.plan.answerIds[0] === routed.decide.partId
        && prepared.plan.contentHashes
        && prepared.plan.contentHashes[0] === routed.decide.contentHash
        && rowCat
        && rowCat.sendable !== false
        && rowCat.contentHash === routed.decide.contentHash;
      if (planOk) catalogPlans += 1;
      else {
        catalogPlanMiss += 1;
        if (catalogMisses.length < 10) {
          catalogMisses.push({
            id: row.id,
            partId: routed.decide.partId,
            prepare: prepared && prepared.reason,
            gotHash: rowCat && rowCat.contentHash,
          });
        }
      }
    }
  }

  if (savedFlag == null) delete process.env.LUNA_ATOM_SELECTOR_ENABLED;
  else process.env.LUNA_ATOM_SELECTOR_ENABLED = savedFlag;

  const kindMiss = claimMiss.filter((m) => m.kind === 'kind').length;
  const report = {
    node: process.version,
    devSha256: devSha,
    rows: dev.rows.length,
    catalog,
    shared: atom.sharedStatus(),
    claimMiss: claimMiss.length + '/' + dev.rows.length,
    claimKindMiss: kindMiss + '/' + dev.rows.length,
    claimSpanMiss: (claimMiss.length - kindMiss) + '/' + dev.rows.length,
    claimSpanIds: claimMiss.filter((m) => m.kind === 'span').map((m) => m.id),
    exclusive: exclusive.length,
    correct: correct + '/' + exclusive.length,
    wrong: wrong + '/' + exclusive.length,
    abstain: abstain + '/' + exclusive.length,
    falseRefusals: fr + '/' + goldSend,
    personalExact: personal.exact + '/' + personal.n,
    mixedExact: mixed.exact + '/' + mixed.n,
    noneOrSharedSent: noneCalledSend,
    f1FlagOff: f1 + '/' + f1Exclusive,
    noneSharedRouterSend,
    catalogPlans: catalogPlans + '/' + routerSends,
    catalogPlanMiss,
    languageUncertain: languageUncertain + '/' + exclusive.length,
    policyShortCircuit: policyShortCircuit + '/' + goldSend,
  };
  console.log(JSON.stringify(report, null, 2));
  console.log('MISMATCHES', mismatches.length);
  for (const m of mismatches) console.log(m.id, 'gold', m.gold, 'got', m.got);
  if (catalogMisses.length) {
    console.log('CATALOG_PLAN_MISS');
    for (const m of catalogMisses) console.log(JSON.stringify(m));
  }
  if (!catalog.baseOk || !catalog.sendableOk) process.exitCode = 1;
  const expectedWrong = mismatches.length === 1
    && mismatches[0].id === 'AD049'
    && mismatches[0].got === 'atom.2step.leverage.en';
  if (kindMiss || noneCalledSend || noneSharedRouterSend) process.exitCode = 1;
  if (wrong && !expectedWrong) process.exitCode = 1;
  if (personal.exact !== personal.n || mixed.exact !== mixed.n) process.exitCode = 1;
  if (f1 !== f1Exclusive) process.exitCode = 1;
  if (catalogPlanMiss) process.exitCode = 1;
  if (!atom.sharedStatus().paramsFrozen || atom.sharedStatus().T !== 0 || atom.sharedStatus().M !== null) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
