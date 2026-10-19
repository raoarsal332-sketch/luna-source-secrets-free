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

function tryRequire(rel) {
  try {
    return require(rel);
  } catch (_) {
    return null;
  }
}

/**
 * Prefer a module that exports claim and decide. The candidate selector is
 * first. The author package is the fallback so the host does not keep a
 * second ownership pregate. Module files are not edited here.
 */
function loadOwnerModule(entity) {
  const rels = entity === 'packs'
    ? ['./packs/packsAnswerSelect', '../../staging-repair-t742/packs/impl']
    : ['./atom/atomAnswerSelect', '../../staging-repair-t742/atom/atomModule'];
  const mods = rels.map(tryRequire).filter(Boolean);
  return mods.find((m) => typeof m.decide === 'function' && typeof m.claim === 'function')
    || mods.find((m) => typeof m.decide === 'function')
    || mods.find((m) => typeof m.claim === 'function')
    || null;
}

function askClaim(entity, input) {
  const mod = loadOwnerModule(entity);
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

async function hostDecide(input) {
  const entity = input.claim && input.claim.entity;
  const text = String(input.text || '');
  const normalized = String(input.normalized || '');
  const params = input.params || loadParams();
  const mod = loadOwnerModule(entity);
  if (mod && typeof mod.decide === 'function') {
    try {
      const decided = await mod.decide({
        text,
        normalized,
        prior: input.prior || [],
        gate: input.gate,
        claim: input.claim,
        params,
      });
      if (decided && (decided.action === 'SEND' || decided.action === 'ABSTAIN')) return decided;
    } catch (_) {
      return { action: 'ABSTAIN', code: 'decide-error', policy: null };
    }
  }
  let clarify = false;
  if (entity === 'atom' && mod && typeof mod.explain === 'function') {
    try {
      clarify = !!mod.explain(normalized).clarify;
    } catch (_) {
      clarify = false;
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
    // Option A. Flag-on uncertain is not F1 and decide does not run.
    // The main route stays in force. Its suppression is that a protected
    // comment origin does not let the model compose a public paragraph.
    if (input.conversationId) f1.clear(input.conversationId);
    return {
      terminal: false,
      f1: false,
      reason: 'language-uncertain-module-on',
      mainRoute: true,
      suppressPublicComposition: true,
      normalized,
      gate,
      kind: 'exclusive',
      entity: resolved.entity,
    };
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
