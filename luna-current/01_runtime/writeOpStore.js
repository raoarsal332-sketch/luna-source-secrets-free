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

// Same bytes icRequest posts for an assignment. The op key is the idempotency key.
function assignmentRequestData(adminId, assigneeId) {
  return {
    message_type: 'assignment',
    type: 'admin',
    admin_id: adminId,
    assignee_id: Number(assigneeId),
  };
}

function assignmentOpKey(conversationId, adminId, assigneeId) {
  const url = 'https://api.intercom.io/conversations/' + String(conversationId || '') + '/reply';
  return opKey('post', url, assignmentRequestData(adminId, assigneeId));
}

// A live re-check that the seat is still the bot confirms the unknown assignment
// did not land. failed-confirmed is not replay-suppressed, so the same key is
// tried once on this turn. Further misses stay owed and retry on later turns,
// up to this bound, and never as a second customer line.
const ASSIGNMENT_RETRY_BOUND = 5;

function confirmAssignmentDidNotLand(input) {
  const src = input || {};
  const conversationId = String(src.conversationId || '');
  const madeBy = String(src.madeBy || '');
  const assigneeId = String(src.assigneeId || '');
  if (!conversationId || !madeBy || !assigneeId) return null;
  const key = assignmentOpKey(conversationId, madeBy, assigneeId);
  const prev = get(key);
  if (!prev || prev.status !== 'unknown') return null;
  const attempts = Number(prev.attempts || 0) + 1;
  if (attempts > ASSIGNMENT_RETRY_BOUND) return null;
  return set(key, Object.assign({}, prev, {
    status: 'failed-confirmed',
    reason: 'assignment-did-not-land',
    kind: prev.kind || 'assignment',
    conversationId,
    madeBy,
    assigneeId,
    attempts,
  }));
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

function owedFixedLineKey(conversationId, madeBy) {
  return 'owed-fixed-line:' + String(conversationId || '') + ':' + String(madeBy || '');
}

// Recorded before the assignment so a landed seat still owes the customer line
// after a restart. The idempotency key is the one post of that line.
function rememberOwedFixedLine(input) {
  const src = input || {};
  const conversationId = String(src.conversationId || '');
  const madeBy = String(src.madeBy || '');
  if (!conversationId || !madeBy) return null;
  const key = owedFixedLineKey(conversationId, madeBy);
  const prev = get(key);
  if (prev && prev.messageSent) return prev;
  const message = String(src.message || '');
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(['fixed-line', conversationId, madeBy, message].join('\n'))
    .digest('hex');
  return set(key, {
    status: 'confirmed',
    kind: 'owed-fixed-line',
    conversationId,
    madeBy,
    assigneeId: String(src.assigneeId || (prev && prev.assigneeId) || ''),
    message,
    idempotencyKey,
    messageSent: false,
  });
}

function latestOwedFixedLine(conversationId, madeBy) {
  const rec = get(owedFixedLineKey(conversationId, madeBy));
  if (!rec || rec.kind !== 'owed-fixed-line' || rec.messageSent) return null;
  if (!rec.conversationId) return null;
  return rec;
}

function markOwedFixedLineSent(conversationId, madeBy) {
  const key = owedFixedLineKey(conversationId, madeBy);
  const prev = get(key);
  if (!prev) return null;
  return set(key, Object.assign({}, prev, { messageSent: true, status: 'confirmed' }));
}

// A timeout or 5xx on the customer line is unknown at the HTTP layer. If the
// parts still do not contain the line, that unknown record must not block the
// one owed post. Assignment and note unknowns are left in place.
function releaseUnknownReply(conversationId, messageType, body, adminId) {
  const url = 'https://api.intercom.io/conversations/' + String(conversationId || '') + '/reply';
  const data = {
    message_type: messageType,
    type: 'admin',
    admin_id: adminId,
    body: body,
  };
  const key = opKey('post', url, data);
  const prev = get(key);
  if (!prev || prev.status !== 'unknown') return false;
  const all = load();
  delete all[key];
  save(all);
  return true;
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
  assignmentRequestData,
  assignmentOpKey,
  confirmAssignmentDidNotLand,
  ASSIGNMENT_RETRY_BOUND,
  hasErrorPayload,
  isValidWriteSuccess,
  namedAssigneeId,
  conversationIdFromUrl,
  classifyWriteOutcome,
  invalidateHandoffAssignment,
  rememberOwedFixedLine,
  latestOwedFixedLine,
  markOwedFixedLineSent,
  releaseUnknownReply,
  latestHandoffAssignment,
};
