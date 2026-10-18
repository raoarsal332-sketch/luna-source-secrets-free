'use strict';
/**
 * Thin Atom adapter — same allowlist contract as V12 faqApprovedAnswers,
 * loading only the Elite Atom KB set. Does not patch V12 core files.
 *
 * C-ARCH-1: needs_owner_decision / provisional / non-sendable rows are
 * excluded from the sendable allowlist (fail closed to handoff).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PATH =
  process.env.LUNA_ATOM_APPROVED_ANSWERS ||
  (fs.existsSync(path.join(__dirname, 'kb', 'elite_atom', 'faq-approved-answers-atom-v1.json'))
    ? path.join(__dirname, 'kb', 'elite_atom', 'faq-approved-answers-atom-v1.json')
    : path.join(__dirname, '..', 'kb', 'elite_atom', 'faq-approved-answers-atom-v1.json'));

const NON_SENDABLE_STATUS = new Set(['needs_owner_decision', 'provisional', 'expired']);

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

let cache = null;

function computeSendable(a) {
  if (a && typeof a.sendable === 'boolean') return a.sendable;
  const status = (a && a.source && a.source.atomStatus) || (a && a.status) || null;
  const approval = (a && a.approval) || '';
  if (NON_SENDABLE_STATUS.has(status)) return false;
  if (approval === 'owner-approved') return status === 'confirmed'; // reserved; none expected yet
  if (approval === 'source-verified' && status === 'confirmed') return true;
  return false;
}

function load(filePath) {
  const p = filePath || DEFAULT_PATH;
  if (cache && cache.path === p) return cache.data;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!raw || !Array.isArray(raw.answers)) throw new Error('invalid-atom-approved-answers');
  const byId = new Map();
  const hashToId = new Map();
  const sendableById = new Map();
  const sendableHashToId = new Map();
  for (const a of raw.answers) {
    if (!a.id || typeof a.body !== 'string') throw new Error('invalid-atom-answer-row');
    const body = normalizeBody(a.body);
    const contentHash = a.contentHash || sha256(body);
    if (a.contentHash && a.contentHash !== sha256(body)) {
      throw new Error('atom-answer-hash-mismatch:' + a.id);
    }
    const status = (a.source && a.source.atomStatus) || a.status || null;
    const sendable = computeSendable({ ...a, status });
    const row = Object.freeze({
      ...a,
      body,
      contentHash,
      status,
      sendable,
      intentTags: Object.freeze([...(a.intentTags || [])]),
    });
    byId.set(a.id, row);
    hashToId.set(contentHash, a.id);
    if (sendable) {
      sendableById.set(a.id, row);
      sendableHashToId.set(contentHash, a.id);
    }
  }
  const templates = Object.freeze({ ...(raw.templates || {}) });
  const data = Object.freeze({
    version: raw.version,
    byId,
    hashToId,
    sendableById,
    sendableHashToId,
    templates,
    all: Object.freeze([...byId.values()]),
    sendable: Object.freeze([...sendableById.values()]),
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
  return load(filePath).sendable;
}

function isSendable(idOrRow, filePath) {
  if (!idOrRow) return false;
  if (typeof idOrRow === 'string') {
    const row = get(idOrRow, filePath);
    return !!(row && row.sendable);
  }
  return computeSendable(idOrRow);
}

function isApprovedHash(hash, filePath) {
  // Outbound allowlist uses SENDABLE hashes only.
  return load(filePath).sendableHashToId.has(hash);
}

function isApprovedBody(body, filePath) {
  return isApprovedHash(sha256(normalizeBody(body)), filePath);
}

function assertAllowlistedFinal(body, answerIds, filePath) {
  const data = load(filePath);
  const ids = (answerIds || []).filter((id) => data.sendableById.has(id));
  if (!ids.length) return { ok: false, reason: 'no-sendable-answer-ids', coreHashes: [], answerIds: [] };
  const norm = normalizeBody(body);
  const coreHashes = ids.map((id) => data.sendableById.get(id).contentHash);
  for (const id of ids) {
    if (norm === data.sendableById.get(id).body) {
      return { ok: true, reason: 'exact', coreHashes, answerIds: ids };
    }
  }
  return { ok: false, reason: 'non-allowlisted-body', coreHashes, answerIds: ids };
}

function clearCache() {
  cache = null;
}

module.exports = {
  DEFAULT_PATH,
  NON_SENDABLE_STATUS,
  sha256,
  normalizeBody,
  load,
  get,
  list,
  listSendable,
  isSendable,
  isApprovedHash,
  isApprovedBody,
  assertAllowlistedFinal,
  clearCache,
};
