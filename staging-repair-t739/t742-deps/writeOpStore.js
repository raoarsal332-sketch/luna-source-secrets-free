'use strict';

/**
 * Durable identity for consequential Intercom writes. An unknown/pending/confirmed
 * outcome is not blindly replayed. Confirmed HTTP 4xx non-execution may be retried.
 * Intercom documents no idempotency key for these endpoints; this is local
 * reconciliation only, not exactly-once delivery.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function storePath() {
  if (process.env.LUNA_OP_STORE_FILE) return process.env.LUNA_OP_STORE_FILE;
  if (process.env.LUNA_CONTROL_STATE_FILE) {
    return path.join(path.dirname(process.env.LUNA_CONTROL_STATE_FILE), 'luna-write-ops.json');
  }
  return '/home/ubuntu/luna-write-ops.json';
}

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch (_) {
    return {};
  }
}

function save(all) {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(all));
  fs.renameSync(tmp, file);
}

// `scope` identifies the event that caused the write (for a client reply: the client turn it
// answers). Without it the key was only (method, url, body), so a legitimately repeated
// identical message - the same personal-matters decline to a repeated question, "Hello, how can
// I help?" again - hashed to an old confirmed write and was silently dropped, while the caller
// logged "OUT 200 ok" (live Bot-test chat 215476019117282: the client got no reply at all).
function opKey(method, url, data, scope) {
  let safeUrl = String(url || '');
  try {
    const u = new URL(safeUrl);
    u.search = '';
    u.hash = '';
    safeUrl = u.toString();
  } catch (_) {
    safeUrl = safeUrl.split('?')[0];
  }
  return crypto.createHash('sha256')
    .update(String(method || '').toLowerCase() + '\n' + safeUrl + '\n' + JSON.stringify(data || null) + (scope ? '\n#' + String(scope) : ''))
    .digest('hex');
}

function get(key) {
  return load()[key] || null;
}

function set(key, rec) {
  const all = load();
  all[key] = Object.assign({}, rec, { at: Date.now() });
  save(all);
  return all[key];
}

// How long a recorded outcome blocks an identical write. This guards against a DUPLICATE
// DELIVERY of the same event, so it must expire: a confirmed write with no event scope only
// suppresses an immediate double-send; one bound to its triggering event stays suppressed for a
// full day (Intercom redelivers within minutes to hours); an unresolved (pending/unknown)
// outcome blocks blind repetition for ten minutes and then allows a new attempt.
const UNSCOPED_CONFIRMED_MS = Number(process.env.LUNA_OP_REPLAY_WINDOW_MS) || 2 * 60 * 1000;
const SCOPED_CONFIRMED_MS = 24 * 60 * 60 * 1000;
const UNRESOLVED_MS = 10 * 60 * 1000;

function shouldSkipReplay(rec, now) {
  if (!rec) return false;
  const age = (now || Date.now()) - Number(rec.at || 0);
  if (rec.status === 'confirmed') return age < (rec.scoped ? SCOPED_CONFIRMED_MS : UNSCOPED_CONFIRMED_MS);
  if (rec.status === 'unknown' || rec.status === 'pending') return age < UNRESOLVED_MS;
  return false;
}

function isValidWriteSuccess(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (data.id != null && String(data.id)) return true;
  if (data.type === 'conversation' || data.type === 'admin_reply' || data.type === 'comment') return true;
  if (data.conversation_parts) return true;
  if (data.conversation && (data.conversation.id || data.conversation.conversation_parts)) return true;
  return false;
}

module.exports = { storePath, opKey, get, set, shouldSkipReplay, isValidWriteSuccess };
