'use strict';
/**
 * t742 module interface stub. Packs and Atom authors code against this file.
 * Shared design sections (b), (f), (g), (h), and (j) are the authority.
 * This file does not add catalog rows, bodies, ids, or sendability.
 *
 * Frozen design: 46efb63b. Implementation model: grok-4.7.
 *
 * claim({ text, normalized, prior }) ->
 *   { kind: 'exclusive'|'shared'|'none', entity: 'packs'|'atom'|null,
 *     evidenceSpans: [{ start, end }] }
 *
 * decide({ text, normalized, prior, gate, claim }) ->
 *   { action: 'SEND', partId, contentHash }
 *   | { action: 'ABSTAIN', code, policy: string|null }
 *
 * unresolvedPolicy(normalized) -> null | canonical policy id
 *
 * There is no PERSONAL action and no scope enum atom|packs|other|none.
 * claim reads the host normalized string. It does not call normalizeForDetect
 * and it does not apply the hand map in faqModuleDetectors.js.
 * The router calls decide only for one exclusive owner, language en, flag on,
 * and delivery wired. Flag off: decide is not called. gate.lang === 'non-en':
 * claim and decide are not called.
 */

const DENY_CODES = Object.freeze([
  'NOT_APPROVED_OUTPUT',
  'ATTACHMENT_DENIED',
  'URL_DENIED',
  'NON_SENDABLE',
  'MULTI_BODY_DENIED',
  'COVERAGE_DENIED',
  'NAME_SLOT_DENIED',
]);

const DENY_CODE_SET = new Set(DENY_CODES);

const STAFF_HOLD_TEMPLATE = 'Reply held by safety check (reason: CODE). Nothing was sent to the customer.';

const SHARED_SELECTOR_WORDS = Object.freeze([
  'discount',
  'subscription',
  'refund',
  'dashboard',
  'elite',
  'atom',
  'card',
  'credit',
  'checkout',
  'simulated',
]);

const PACKS_REFUSE_ID = 'packs.account-status.refuse.en';
const ATOM_REFUSE_ID = 'atom.account-status.refuse.en';

function staffHoldNote(code) {
  const c = String(code || '');
  if (!DENY_CODE_SET.has(c)) return null;
  return 'Reply held by safety check (reason: ' + c + '). Nothing was sent to the customer.';
}

function scrubPackExclusions(norm) {
  return String(norm || '')
    .replace(/\bpack(?:ing)?\s+(?:my\s+|the\s+|a\s+)?bags?\b/g, ' ')
    .replace(/\b(?:backpacks?|packages?|packets?)\b/g, ' ');
}

function scrubAtomExclusions(norm) {
  return String(norm || '').replace(/\b(?:atomic|anatomy|anatomical|atomizer)\b/g, ' ');
}

function packsEntityPresent(normalized) {
  const s = scrubPackExclusions(normalized);
  return /\belite\s+packs\b/.test(s) || /\bpacks\b/.test(s) || /\bpack\b/.test(s);
}

function atomEntityPresent(normalized) {
  const s = scrubAtomExclusions(normalized);
  return /\belite\s+atom\b/.test(s) || /\batom\b/.test(s);
}

function sharedWordPresent(normalized) {
  const stripped = String(normalized || '')
    .replace(/\belite\s+packs\b/g, ' ')
    .replace(/\belite\s+atom\b/g, ' ');
  return /\b(?:discount|subscription|refund|dashboard|elite|atom|card|credit|checkout|simulated)\b/.test(stripped);
}

function evidenceFor(normalized, entity) {
  const src = entity === 'packs' ? scrubPackExclusions(normalized) : scrubAtomExclusions(normalized);
  const re = entity === 'packs'
    ? /\belite\s+packs\b|\bpacks\b|\bpack\b/
    : /\belite\s+atom\b|\batom\b/;
  const m = re.exec(src);
  if (!m) return [];
  const start = String(normalized || '').indexOf(m[0]);
  if (start < 0) return [{ start: 0, end: m[0].length }];
  return [{ start, end: start + m[0].length }];
}

/**
 * Reference claim for one module. Authors may delegate to this.
 * exclusive only when this module's entity is present and the other's is absent.
 * Both entities → none. Selector words without this entity → shared.
 * A throw is not produced here; the router treats a throw from a module claim
 * as exclusive for that module.
 */
function claimFor(entity, input) {
  const normalized = String((input && input.normalized) || '');
  const mine = entity === 'packs' ? packsEntityPresent(normalized) : atomEntityPresent(normalized);
  const other = entity === 'packs' ? atomEntityPresent(normalized) : packsEntityPresent(normalized);
  if (other && mine) {
    return { kind: 'none', entity: null, evidenceSpans: [] };
  }
  if (other && !mine) {
    return sharedWordPresent(normalized)
      ? { kind: 'shared', entity: null, evidenceSpans: [] }
      : { kind: 'none', entity: null, evidenceSpans: [] };
  }
  if (mine && !other) {
    return { kind: 'exclusive', entity, evidenceSpans: evidenceFor(normalized, entity) };
  }
  if (sharedWordPresent(normalized)) {
    return { kind: 'shared', entity: null, evidenceSpans: [] };
  }
  return { kind: 'none', entity: null, evidenceSpans: [] };
}

function validateClaim(claim) {
  if (!claim || typeof claim !== 'object') return false;
  if (claim.kind !== 'exclusive' && claim.kind !== 'shared' && claim.kind !== 'none') return false;
  if (claim.kind === 'exclusive') {
    if (claim.entity !== 'packs' && claim.entity !== 'atom') return false;
    if (!Array.isArray(claim.evidenceSpans)) return false;
  }
  return true;
}

function validateDecide(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.action === 'SEND') {
    return typeof result.partId === 'string' && result.partId && typeof result.contentHash === 'string';
  }
  if (result.action === 'ABSTAIN') {
    return typeof result.code === 'string' && (result.policy === null || typeof result.policy === 'string');
  }
  return false;
}

module.exports = {
  DENY_CODES,
  DENY_CODE_SET,
  STAFF_HOLD_TEMPLATE,
  SHARED_SELECTOR_WORDS,
  PACKS_REFUSE_ID,
  ATOM_REFUSE_ID,
  staffHoldNote,
  scrubPackExclusions,
  scrubAtomExclusions,
  packsEntityPresent,
  atomEntityPresent,
  sharedWordPresent,
  claimFor,
  validateClaim,
  validateDecide,
};
