'use strict';
/**
 * Thin Elite Packs adapter — same allowlist contract as V12 faqApprovedAnswers,
 * loading only the Elite Packs KB set. Does not patch V12 core files.
 *
 * Atom independent-review lesson (C-ARCH-1): needs_owner_decision / provisional
 * rows are catalogued but NEVER enter the sendable allowlist.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CATALOG_FILE = 'faq-approved-answers-packs-v1.json';
const DEFAULT_PATH =
  process.env.LUNA_PACKS_APPROVED_ANSWERS ||
  (fs.existsSync(path.join(__dirname, CATALOG_FILE))
    ? path.join(__dirname, CATALOG_FILE)
    : path.join(__dirname, '..', 'kb', 'elite_packs', CATALOG_FILE));

function sha256(s) {
  return crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
}

function normalizeBody(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isSendableRow(a) {
  if (!a) return false;
  if (a.sendable === false || a.selectable === false) return false;
  if (a.status === 'needs_owner_decision' || a.status === 'provisional') return false;
  if (a.approval === 'pending' || a.approval === 'needs-owner-approval') return false;
  // Premature owner-approved is forbidden; treat as non-sendable until relabeled.
  if (a.approval === 'owner-approved') return false;
  if (a.translationStatus === 'unverified') {
    if (process.env.LUNA_FAQ_ALLOW_UNVERIFIED_TRANSLATIONS === '1') {
      // Still refuse disputed statuses even when translations are allowed for staging quizzes.
      if (a.status === 'needs_owner_decision' || a.status === 'provisional') return false;
      // Unverified translations remain non-sendable by default policy; flag only for locale
      // preference experiments — do not add to production allowlist.
      return false;
    }
    return false;
  }
  if (a.approval !== 'source-verified') return false;
  if (a.sendable === true) return true;
  // Legacy rows without explicit sendable: only source-verified EN confirmed.
  return a.approval === 'source-verified' && (a.locale === 'en' || a.language === 'en');
}

/**
 * Scope metadata (intentTags) is NARROW-ONLY. It can remove a row from a
 * delivery role (or from delivery entirely); it can never make a non-sendable
 * row sendable and never widen a row beyond its role. The sendability decision
 * itself (isSendableRow) reads only approval / status / sendable fields.
 *
 * Roles: 'product' (general rule answer), 'refuse' (personal / mixed boundary),
 * 'handoff' (ambiguous / unresolved), 'refund', 'missing'.
 */
const NEVER_DELIVER_TAGS = Object.freeze(['nonSendable', 'conflict', 'failClosed', 'everyRuleLifted']);
const ROLE_TAG = Object.freeze({
  refuse: 'accountStatusBoundary',
  handoff: 'handoff',
  refund: 'refunds',
  missing: 'missing',
});
const RESERVED_ROLE_TAGS = Object.freeze(Object.values(ROLE_TAG));

function scopeAllows(row, role) {
  if (!isSendableRow(row)) return false;
  const tags = Array.isArray(row.intentTags) ? row.intentTags : [];
  if (NEVER_DELIVER_TAGS.some((t) => tags.includes(t))) return false;
  const r = role || 'product';
  if (r === 'product') return !RESERVED_ROLE_TAGS.some((t) => tags.includes(t));
  const need = ROLE_TAG[r];
  return !!need && tags.includes(need);
}

let cache = null;

function load(filePath) {
  const p = filePath || DEFAULT_PATH;
  if (cache && cache.path === p) return cache.data;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!raw || !Array.isArray(raw.answers)) throw new Error('invalid-packs-approved-answers');
  const byId = new Map();
  const hashToId = new Map();
  const sendableHashToId = new Map();
  const sendableIds = new Set();
  for (const a of raw.answers) {
    if (!a.id || typeof a.body !== 'string') throw new Error('invalid-packs-answer-row');
    const body = normalizeBody(a.body);
    const contentHash = a.contentHash || sha256(body);
    if (a.contentHash && a.contentHash !== sha256(body)) {
      throw new Error('packs-answer-hash-mismatch:' + a.id);
    }
    if (a.approval === 'owner-approved') {
      // Soft invariant: catalog must not ship premature owner-approved stamps.
      // Keep loadable for audit, but never sendable.
    }
    const status = a.status || (a.source && a.source.policyConfirmation) || null;
    const row = Object.freeze({
      ...a,
      body,
      contentHash,
      status,
      sendable: isSendableRow({ ...a, status }),
      intentTags: Object.freeze([...(a.intentTags || [])]),
    });
    byId.set(a.id, row);
    hashToId.set(contentHash, a.id);
    if (row.sendable) {
      sendableHashToId.set(contentHash, a.id);
      sendableIds.add(a.id);
    }
  }
  const templates = Object.freeze({ ...(raw.templates || {}) });
  const data = Object.freeze({
    version: raw.version,
    byId,
    hashToId,
    sendableHashToId,
    sendableIds,
    templates,
    all: Object.freeze([...byId.values()]),
  });
  cache = { path: p, data };
  return data;
}

function get(id, filePath) {
  return load(filePath).byId.get(id) || null;
}

function list(filePath) {
  return load(filePath).all;
}

function listSendable(filePath) {
  return load(filePath).all.filter((a) => a.sendable);
}

function isApprovedHash(hash, filePath) {
  // Catalog presence (any row). Prefer isSendableHash for delivery.
  return load(filePath).hashToId.has(hash);
}

function isSendableHash(hash, filePath) {
  return load(filePath).sendableHashToId.has(hash);
}

function isApprovedBody(body, filePath) {
  return isApprovedHash(sha256(normalizeBody(body)), filePath);
}

function isSendableBody(body, filePath) {
  return isSendableHash(sha256(normalizeBody(body)), filePath);
}

function assertAllowlistedFinal(body, answerIds, filePath) {
  const data = load(filePath);
  const ids = (answerIds || []).filter((id) => data.byId.has(id));
  if (!ids.length) return { ok: false, reason: 'no-approved-answer-ids', coreHashes: [], answerIds: [] };
  // C-ARCH-1: only sendable ids may pass final allowlist equality.
  const sendableIds = ids.filter((id) => data.sendableIds.has(id));
  if (!sendableIds.length) {
    return {
      ok: false,
      reason: 'non-sendable-answer-ids',
      coreHashes: ids.map((id) => data.byId.get(id).contentHash),
      answerIds: ids,
    };
  }
  const norm = normalizeBody(body);
  const coreHashes = sendableIds.map((id) => data.byId.get(id).contentHash);
  for (const id of sendableIds) {
    if (norm === data.byId.get(id).body) {
      return { ok: true, reason: 'exact', coreHashes, answerIds: sendableIds };
    }
  }
  return { ok: false, reason: 'non-allowlisted-body', coreHashes, answerIds: sendableIds };
}

function clearCache() {
  cache = null;
}

module.exports = {
  DEFAULT_PATH,
  sha256,
  normalizeBody,
  isSendableRow,
  scopeAllows,
  NEVER_DELIVER_TAGS,
  load,
  get,
  list,
  listSendable,
  isApprovedHash,
  isSendableHash,
  isApprovedBody,
  isSendableBody,
  assertAllowlistedFinal,
  clearCache,
};
