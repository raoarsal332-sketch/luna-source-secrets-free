'use strict';
/**
 * V12 approved-answer catalog.
 * Customer-facing FAQ bodies are only those listed here (id + contentHash).
 * No free-text composition authority.
 *
 * Sendable allowlist = owner-approved rows only. needs-owner-approval / pending /
 * provisional / draft rows remain inspectable but are excluded from get/list/
 * hash allowlist used at send time (fail closed).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PATH =
  process.env.LUNA_FAQ_APPROVED_ANSWERS ||
  path.join(__dirname, 'faq-approved-answers-v12.json');

const NON_SENDABLE_STATUS = new Set([
  'needs-owner-approval',
  'pending',
  'provisional',
  'staging-provisional',
  'draft',
  'unverified',
]);

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

function approvalStatus(row) {
  return String((row && (row.approval || row.status)) || '')
    .trim()
    .toLowerCase();
}

function isSendableStatus(status) {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  if (!s) return false;
  if (NON_SENDABLE_STATUS.has(s)) return false;
  return s === 'owner-approved' || s === 'approved';
}

function isSendableRow(row) {
  if (!row) return false;
  if (!isSendableStatus(approvalStatus(row))) return false;
  if (row.translationStatus === 'unverified' && process.env.LUNA_FAQ_ALLOW_UNVERIFIED_TRANSLATIONS !== '1') {
    return false;
  }
  return true;
}

/** Exact pure greeting/courtesy lines only — no policy/KYC/payout/account/number content. */
const PURE_GREETING_ALLOWLIST = new Set(
  [
    'Hello,',
    'Hello.',
    'Hello!',
    'Hello',
    'Hi,',
    'Hi.',
    'Hi!',
    'Hi',
    'Hey,',
    'Hey.',
    'Hey!',
    'Hey',
    'Ciao,',
    'Ciao.',
    'Ciao',
    'Salam,',
    'Salam.',
    'Salam',
    'Thanks for reaching out.',
    'Thanks for contacting us.',
    'Thanks for writing.',
    'Hope you are doing well.',
    "Hope you're doing well.",
    'Hope you are well.',
  ].map(normalizeBody)
);

const PURE_GREETING_WITH_NAME =
  /^(?:Hello|Hi|Hey|Ciao|Salam|السلام علیکم)\s+[A-Za-zÀ-ÿ'\-]{1,40}[,!.]?$/i;

let cache = null;

function load(filePath) {
  const p = filePath || DEFAULT_PATH;
  if (cache && cache.path === p) return cache.data;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!raw || !Array.isArray(raw.answers)) throw new Error('invalid-approved-answers');
  const allById = new Map();
  const sendableById = new Map();
  const hashToId = new Map();
  const pending = [];
  for (const a of raw.answers) {
    if (!a.id || typeof a.body !== 'string') throw new Error('invalid-answer-row');
    const body = normalizeBody(a.body);
    const contentHash = a.contentHash || sha256(body);
    if (a.contentHash && a.contentHash !== sha256(body)) {
      throw new Error('answer-hash-mismatch:' + a.id);
    }
    const row = Object.freeze({
      ...a,
      body,
      contentHash,
      approval: a.approval || a.status || '',
      intentTags: Object.freeze([...(a.intentTags || [])]),
    });
    allById.set(a.id, row);
    if (isSendableRow(row)) {
      sendableById.set(a.id, row);
      hashToId.set(contentHash, a.id);
    } else {
      pending.push(row);
    }
  }
  const templates = Object.freeze({ ...(raw.templates || {}) });
  const data = Object.freeze({
    version: raw.version,
    byId: sendableById,
    allById,
    hashToId,
    templates,
    all: Object.freeze([...sendableById.values()]),
    pending: Object.freeze(pending),
  });
  cache = { path: p, data };
  return data;
}

function extraEnabled() {
  return true;
}

/**
 * Extra-catalog paths for Packs and Atom. The files are the sibling JSON
 * already in this tree. V12 list() does not include them. get() loads a
 * sendable extra row by id when decide has already chosen that id.
 */
function resolveExtraPath(kind) {
  if (!extraEnabled()) return null;
  if (kind === 'packs') return path.join(__dirname, 'packs', 'faq-approved-answers-packs-v1.json');
  if (kind === 'atom') return path.join(__dirname, 'atom', 'faq-approved-answers-atom-v1.json');
  return null;
}

function extraGet(id) {
  for (const kind of ['packs', 'atom']) {
    const file = resolveExtraPath(kind);
    if (!file || !fs.existsSync(file)) continue;
    const row = load(file).allById.get(id);
    if (row && row.sendable === true) return row;
  }
  return null;
}

function get(id, filePath) {
  const hit = load(filePath).byId.get(id);
  if (hit || filePath) return hit || null;
  return extraGet(id);
}

function getAny(id, filePath) {
  return load(filePath).allById.get(id) || null;
}

function list(filePath) {
  return load(filePath).all;
}

function listPending(filePath) {
  return load(filePath).pending;
}

function template(name, filePath) {
  return load(filePath).templates[name] || '';
}

function isApprovedHash(hash, filePath) {
  return load(filePath).hashToId.has(hash);
}

function isApprovedBody(body, filePath) {
  return isApprovedHash(sha256(normalizeBody(body)), filePath);
}

function sentenceSetForAnswers(answerIds, filePath) {
  const data = load(filePath);
  const set = new Set();
  for (const id of answerIds || []) {
    const a = data.byId.get(id);
    if (!a) continue;
    for (const s of a.body.split(/\n+/)) {
      const n = normalizeBody(s);
      if (n) set.add(n);
    }
    set.add(a.body);
  }
  for (const t of Object.values(data.templates)) {
    const n = normalizeBody(t);
    if (n) set.add(n);
  }
  return set;
}

/**
 * Pure greeting/courtesy only. Must not carry policy, KYC, payout, account, or number content.
 */
function isWelcomeOrBoilerplate(sentence) {
  const s = normalizeBody(sentence);
  if (!s) return true;
  if (PURE_GREETING_ALLOWLIST.has(s)) return true;
  if (PURE_GREETING_WITH_NAME.test(s) && s.length <= 48) {
    // Reject if any digit or account/KYC/payout cue sneaks into the "name" slot.
    if (/\d/.test(s)) return false;
    if (/\b(?:kyc|payout|withdraw|refund|breach|account|verified|approved|sent|limit|%|\$)\b/i.test(s)) return false;
    return true;
  }
  return false;
}

function chunkMatchesAllowlistedTemplate(chunk, filePath) {
  const data = load(filePath);
  const c = normalizeBody(chunk);
  if (!c) return true;
  for (const t of Object.values(data.templates)) {
    const tb = normalizeBody(t);
    if (!tb) continue;
    if (c === tb) return true;
    const relaxed = c.replace(/,/g, ';');
    if (relaxed === tb || tb.replace(/;/g, ',') === c) return true;
  }
  return false;
}

/**
 * @returns {{ ok:boolean, reason:string, coreHashes:string[], answerIds:string[] }}
 */
function assertAllowlistedFinal(body, answerIds, filePath) {
  const data = load(filePath);
  // Pending / non-sendable ids never enter the allowlist.
  const ids = (answerIds || []).filter((id) => data.byId.has(id));
  if (!ids.length) return { ok: false, reason: 'no-approved-answer-ids', coreHashes: [], answerIds: [] };

  const allowed = sentenceSetForAnswers(ids, filePath);
  const coreHashes = ids.map((id) => data.byId.get(id).contentHash);

  const norm = normalizeBody(body);
  for (const id of ids) {
    const a = data.byId.get(id);
    if (norm === a.body) return { ok: true, reason: 'exact', coreHashes, answerIds: ids };
  }

  const chunks = norm
    .split(/\n\n+/)
    .map(normalizeBody)
    .filter(Boolean);
  for (const chunk of chunks) {
    if (allowed.has(chunk) || isWelcomeOrBoilerplate(chunk)) continue;
    let rest = chunk;
    let progressed = true;
    while (rest && progressed) {
      progressed = false;
      if (isWelcomeOrBoilerplate(rest)) {
        rest = '';
        progressed = true;
        break;
      }
      for (const id of ids) {
        const b = data.byId.get(id).body;
        if (rest === b || rest.startsWith(b + ' ') || rest.startsWith(b + '\n')) {
          rest = normalizeBody(rest.slice(b.length));
          progressed = true;
          break;
        }
      }
      if (progressed) continue;
      for (const t of Object.values(data.templates)) {
        const tb = normalizeBody(t);
        if (!tb) continue;
        if (rest === tb || rest.startsWith(tb + ' ') || rest.startsWith(tb + '\n')) {
          rest = normalizeBody(rest.slice(tb.length));
          progressed = true;
          break;
        }
      }
    }
    if (rest && !isWelcomeOrBoilerplate(rest) && !chunkMatchesAllowlistedTemplate(rest, filePath)) {
      return { ok: false, reason: 'non-allowlisted-chunk', coreHashes, answerIds: ids };
    }
  }
  return { ok: true, reason: 'allowlisted-composition', coreHashes, answerIds: ids };
}

function needsOwnerApproval(filePath) {
  return listPending(filePath);
}

/** Non-sendable ids still present in the catalog file (for preflight refusal of sendable pending). */
function catalogMarksPendingSendable(filePath) {
  // After load-time exclusion, sendable list must never include pending statuses.
  return list(filePath).filter((a) => !isSendableRow(a));
}

function clearCache() {
  cache = null;
}

module.exports = {
  DEFAULT_PATH,
  sha256,
  normalizeBody,
  load,
  get,
  getAny,
  list,
  listPending,
  template,
  isApprovedHash,
  isApprovedBody,
  assertAllowlistedFinal,
  needsOwnerApproval,
  catalogMarksPendingSendable,
  isSendableStatus,
  isSendableRow,
  isWelcomeOrBoilerplate,
  resolveExtraPath,
  clearCache,
  sentenceSetForAnswers,
  PURE_GREETING_ALLOWLIST,
  NON_SENDABLE_STATUS,
};
