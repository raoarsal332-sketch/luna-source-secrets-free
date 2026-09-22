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

function opKey(method, url, data) {
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
    .update(String(method || '').toLowerCase() + '\n' + safeUrl + '\n' + JSON.stringify(data || null))
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

function shouldSkipReplay(rec) {
  if (!rec) return false;
  return rec.status === 'confirmed' || rec.status === 'unknown' || rec.status === 'pending';
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
