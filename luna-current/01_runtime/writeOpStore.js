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

function hasErrorPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (String(data.type || '') === 'error.list') return true;
  if (Array.isArray(data.errors) && data.errors.length > 0) return true;
  return false;
}

function isValidWriteSuccess(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  // An id does not make an error list a successful write.
  if (hasErrorPayload(data)) return false;
  if (data.id != null && String(data.id)) return true;
  if (data.type === 'conversation' || data.type === 'admin_reply' || data.type === 'comment') return true;
  if (data.conversation_parts) return true;
  if (data.conversation && (data.conversation.id || data.conversation.conversation_parts)) return true;
  return false;
}

function namedAssigneeId(data) {
  if (!data || typeof data !== 'object') return '';
  if (data.admin_assignee_id != null && String(data.admin_assignee_id) !== '' && String(data.admin_assignee_id) !== '0') {
    return String(data.admin_assignee_id);
  }
  if (data.assignee_id != null && String(data.assignee_id) !== '' && String(data.assignee_id) !== '0') {
    return String(data.assignee_id);
  }
  const assigned = data.assigned_to || data.assignee;
  if (assigned && assigned.id != null && String(assigned.id) !== '' && String(assigned.id) !== '0') {
    return String(assigned.id);
  }
  return '';
}

function conversationIdFromUrl(url) {
  const match = String(url || '').match(/\/conversations\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

// One strict 2xx judgment. error.list or errors is a definite failure even when
// an id is present, so the op is not confirmed and a later attempt is not
// replay-suppressed. An assignment is confirmed only when the response names
// the intended seat. A different seat, or no seat, is a definite miss.
function classifyWriteOutcome(requestData, responseData, status) {
  const code = Number(status || 0);
  if (!(code >= 200 && code < 300)) return { confirm: false, unknown: false, reason: 'http' };
  if (hasErrorPayload(responseData)) {
    return { confirm: false, unknown: false, reason: 'errors' };
  }
  const request = requestData && typeof requestData === 'object' ? requestData : {};
  const wanted = request.message_type === 'assignment' && request.assignee_id != null
    ? String(request.assignee_id)
    : '';
  const named = namedAssigneeId(responseData);
  if (wanted && wanted !== '0') {
    if (!named || named !== wanted) {
      return {
        confirm: false,
        unknown: false,
        reason: named ? 'wrong-assignee' : 'assignee-unconfirmed',
      };
    }
    return {
      confirm: true,
      unknown: false,
      reason: 'confirmed',
      record: {
        status: 'confirmed',
        kind: 'assignment',
        assigneeId: wanted,
        madeBy: request.admin_id != null ? String(request.admin_id) : '',
      },
    };
  }
  if (!isValidWriteSuccess(responseData)) {
    return { confirm: false, unknown: true, reason: 'malformed-success' };
  }
  return { confirm: true, unknown: false, reason: 'confirmed', record: { status: 'confirmed' } };
}

// A live conversation that is still on the bot contradicts a stored confirmation.
// Drop it so the next assignment is not replay-suppressed.
function invalidateHandoffAssignment(conversationId, madeBy, assigneeId) {
  const wantConv = String(conversationId || '');
  const wantBy = String(madeBy || '');
  const wantSeat = String(assigneeId || '');
  if (!wantConv || !wantBy) return false;
  const all = load();
  let changed = false;
  for (const [key, rec] of Object.entries(all)) {
    if (!rec || rec.status !== 'confirmed' || rec.kind !== 'assignment') continue;
    if (String(rec.conversationId || '') !== wantConv) continue;
    if (String(rec.madeBy || '') !== wantBy) continue;
    if (wantSeat && String(rec.assigneeId || '') !== wantSeat) continue;
    all[key] = Object.assign({}, rec, {
      status: 'failed',
      reason: 'assignee_still_bot',
      at: Date.now(),
    });
    changed = true;
  }
  if (changed) save(all);
  return changed;
}

function latestHandoffAssignment(conversationId, madeBy) {
  const wantConv = String(conversationId || '');
  const wantBy = String(madeBy || '');
  if (!wantConv || !wantBy) return null;
  let best = null;
  const all = load();
  for (const rec of Object.values(all)) {
    if (!rec || rec.status !== 'confirmed' || rec.kind !== 'assignment') continue;
    if (String(rec.conversationId || '') !== wantConv) continue;
    if (String(rec.madeBy || '') !== wantBy) continue;
    if (!rec.assigneeId) continue;
    if (!best || Number(rec.at || 0) >= Number(best.at || 0)) best = rec;
  }
  return best;
}

module.exports = {
  storePath,
  opKey,
  get,
  set,
  shouldSkipReplay,
  hasErrorPayload,
  isValidWriteSuccess,
  namedAssigneeId,
  conversationIdFromUrl,
  classifyWriteOutcome,
  invalidateHandoffAssignment,
  latestHandoffAssignment,
};
