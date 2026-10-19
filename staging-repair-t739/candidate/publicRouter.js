'use strict';
/**
 * One router. Asks both modules for a claim, then applies the conflict rule.
 * Does not read packsProductHint or the V12 SELECTORS loop.
 * Does not run before mandatory controls. The caller does.
 */

const path = require('path');
const { claimFor, validateClaim, PACKS_REFUSE_ID, ATOM_REFUSE_ID } = require('./moduleInterface');
const { packsEntityPresent, atomEntityPresent } = require('./moduleInterface');
const { normalizeForRoute } = require('./routeNormalizer');
const { languageGate } = require('./faqAnswerSelect');
const { matchApproved, loadParams } = require('./approvedMatcher');
const { canonicalPolicy } = require('./unresolvedPolicy');
const f1 = require('./f1AbstainMark');

if (!process.env.LUNA_ATOM_APPROVED_ANSWERS) {
  process.env.LUNA_ATOM_APPROVED_ANSWERS = path.join(__dirname, 'atom', 'faq-approved-answers-atom-v1.json');
}

function flagOn(name) {
  return String(process.env[name] == null ? '' : process.env[name]).trim() === '1';
}

function deliveryWired(input) {
  if (input && input.deliveryWired === true) return true;
  if (String(process.env.LUNA_T742_DELIVERY_WIRED || '') === '1') return true;
  try {
    const faq = require('./faqApprovedAnswers');
    if (typeof faq.resolveExtraPath !== 'function') return false;
  } catch (_) {
    return false;
  }
  const fs = require('fs');
  if (!fs.existsSync(path.join(__dirname, 'webhookFastAck.js'))) return false;
  if (!fs.existsSync(path.join(__dirname, 'writeOpStore.js'))) return false;
  return true;
}

function askClaim(entity, input) {
  let mod = null;
  try {
    mod = entity === 'packs' ? require('./packs/packsAnswerSelect') : require('./atom/atomAnswerSelect');
  } catch (_) {
    mod = null;
  }
  if (mod && typeof mod.claim === 'function') {
    try {
      const claim = mod.claim(input);
      if (validateClaim(claim)) return claim;
      return { kind: 'exclusive', entity, evidenceSpans: [], malformed: true };
    } catch (_) {
      return { kind: 'exclusive', entity, evidenceSpans: [], thrown: true };
    }
  }
  return claimFor(entity, input);
}

function resolveClaims(packsClaim, atomClaim, normalized) {
  const packsEx = packsClaim && packsClaim.kind === 'exclusive';
  const atomEx = atomClaim && atomClaim.kind === 'exclusive';
  const packsThere = atomEntityPresent(normalized) && packsEx;
  const atomThere = packsEntityPresent(normalized) && atomEx;
  if ((packsEx && atomEx) || packsThere || atomThere) return { malformed: true };
  if (packsEx) return { kind: 'exclusive', entity: 'packs', claim: packsClaim };
  if (atomEx) return { kind: 'exclusive', entity: 'atom', claim: atomClaim };
  if (packsEntityPresent(normalized) && atomEntityPresent(normalized)) return { kind: 'none' };
  if ((packsClaim && packsClaim.kind === 'shared') || (atomClaim && atomClaim.kind === 'shared')) return { kind: 'shared' };
  return { kind: 'none' };
}

function sendableRows(entity) {
  if (entity === 'packs') {
    const packs = require('./packs/packsApprovedAnswers');
    return packs.listSendable().filter((r) => r.id !== PACKS_REFUSE_ID && r.id !== 'packs.handoff.unverified.en');
  }
  const atom = require('./atom/atomApprovedAnswers');
  return atom.listSendable().filter((r) => r.id !== ATOM_REFUSE_ID && r.id !== 'atom.handoff.unverified.en');
}

function rowById(entity, id) {
  const mod = entity === 'packs' ? require('./packs/packsApprovedAnswers') : require('./atom/atomApprovedAnswers');
  const row = mod.get(id);
  if (!row) return null;
  return row;
}

function sendRow(entity, id) {
  const row = rowById(entity, id);
  if (!row || !row.body) return { action: 'ABSTAIN', code: 'NON_SENDABLE', policy: null };
  if (row.sendable === false) return { action: 'ABSTAIN', code: 'NON_SENDABLE', policy: null };
  return { action: 'SEND', partId: row.id, contentHash: row.contentHash, policy: null };
}

async function hostDecide(input) {
  const entity = input.claim && input.claim.entity;
  const text = String(input.text || '');
  const normalized = String(input.normalized || '');
  const params = input.params || loadParams();
  if (entity === 'packs') {
    try {
      const pre = require('./packs/packsOwnershipPregate');
      const g = pre.evaluateOwnershipPregate(text);
      if (g && (g.kind === pre.KIND.PERSONAL || g.kind === pre.KIND.MIXED)) return sendRow('packs', PACKS_REFUSE_ID);
      if (g && g.kind === pre.KIND.AMBIGUOUS) return { action: 'ABSTAIN', code: 'account-ambiguous', policy: null };
    } catch (_) { /* pregate unavailable: matcher still runs */ }
  }
  let clarify = false;
  if (entity === 'atom') {
    try {
      const atom = require('./atom/atomAnswerSelect');
      if (atom.accountSpecific(normalized) || atom.accountSpecific(text)) return sendRow('atom', ATOM_REFUSE_ID);
      const selected = await atom.selectAtomAnswer(text, {
        enabled: true,
        languageGate: { lang: 'en', language: 'en', confident: true, allowsAnswer: true },
      });
      if (selected && (selected.action === 'clarify' || selected.clarify)) clarify = true;
      const pol = canonicalPolicy(selected && selected.reason);
      if (pol) return { action: 'ABSTAIN', code: 'unresolved-policy', policy: pol };
    } catch (_) {
      return { action: 'ABSTAIN', code: 'decide-error', policy: null };
    }
  }
  let mod = null;
  try {
    mod = entity === 'packs' ? require('./packs/packsAnswerSelect') : require('./atom/atomAnswerSelect');
  } catch (_) { mod = null; }
  if (mod && typeof mod.decide === 'function') {
    try {
      const decided = await mod.decide({ text, normalized, prior: input.prior || [], gate: input.gate, claim: input.claim });
      if (decided && (decided.action === 'SEND' || decided.action === 'ABSTAIN')) return decided;
    } catch (_) {
      return { action: 'ABSTAIN', code: 'decide-error', policy: null };
    }
  }
  const matched = matchApproved({ normalized, rows: sendableRows(entity), params, clarify });
  if (matched.action === 'SEND') {
    return { action: 'SEND', partId: matched.partId, contentHash: matched.contentHash, policy: null, acceptableSet: matched.acceptableSet };
  }
  return { action: 'ABSTAIN', code: matched.code || 'COVERAGE_DENIED', policy: matched.policy || null };
}

async function route(input) {
  input = input || {};
  const text = String(input.text || '');
  const prior = Array.isArray(input.prior) ? input.prior.map((t) => String(t || '')) : [];
  const normalized = normalizeForRoute(text);
  const priorNorm = prior.map((t) => normalizeForRoute(t));
  const gate = languageGate(normalized, priorNorm);
  if (f1.blocks(input.conversationId, input.eventId)) {
    return { terminal: true, f1: true, reason: 'f1-english-module-off', mainRoute: false, normalized, gate, kind: 'exclusive' };
  }
  if (gate.lang === 'non-en') {
    if (input.conversationId) f1.clear(input.conversationId);
    return { terminal: false, reason: 'language-non-en', mainRoute: true, normalized, gate, kind: 'none', entity: null };
  }
  const claimInput = { text, normalized, prior: priorNorm };
  const packsClaim = askClaim('packs', claimInput);
  const atomClaim = askClaim('atom', claimInput);
  const resolved = resolveClaims(packsClaim, atomClaim, normalized);
  if (resolved.malformed) {
    return { terminal: true, reason: 'malformed-claim', mainRoute: false, normalized, gate, kind: 'exclusive', packsClaim, atomClaim };
  }
  if (resolved.kind !== 'exclusive') {
    if (input.conversationId) f1.clear(input.conversationId);
    return {
      terminal: false,
      reason: 'main-route',
      mainRoute: true,
      normalized,
      gate,
      kind: resolved.kind,
      entity: null,
      packsClaim,
      atomClaim,
    };
  }
  const on = resolved.entity === 'packs' ? flagOn('LUNA_PACKS_ENABLED') : flagOn('LUNA_ATOM_SELECTOR_ENABLED');
  if (!on) {
    const reason = gate.lang === 'uncertain' ? 'language-uncertain-module-off' : 'module-off-fail-closed';
    if (input.conversationId && input.eventId) f1.mark(input.conversationId, input.eventId, reason);
    return { terminal: true, f1: true, reason, mainRoute: false, normalized, gate, kind: 'exclusive', entity: resolved.entity };
  }
  if (!deliveryWired(input)) {
    return { terminal: true, reason: 'module-on-delivery-not-wired', mainRoute: false, normalized, gate, kind: 'exclusive', entity: resolved.entity };
  }
  if (gate.lang !== 'en') {
    return { terminal: true, reason: 'language-uncertain-module-on', mainRoute: false, normalized, gate, kind: 'exclusive', entity: resolved.entity };
  }
  const decided = await hostDecide({ text, normalized, prior: priorNorm, gate, claim: resolved.claim, params: input.params });
  if (!decided || decided.action !== 'SEND') {
    return {
      terminal: true,
      reason: (decided && decided.code) || 'COVERAGE_DENIED',
      mainRoute: false,
      normalized,
      gate,
      kind: 'exclusive',
      entity: resolved.entity,
      decide: decided,
    };
  }
  if (input.conversationId) f1.clear(input.conversationId);
  return {
    terminal: true,
    reason: 'module-send',
    mainRoute: false,
    normalized,
    gate,
    kind: 'exclusive',
    entity: resolved.entity,
    decide: decided,
    send: true,
  };
}

module.exports = {
  route,
  hostDecide,
  askClaim,
  resolveClaims,
  deliveryWired,
  flagOn,
  sendableRows,
};
