'use strict';
/**
 * Persistent spread-test state. One record per conversation in
 * spread-test-state.json beside the ticket-state file.
 * atomicJsonFile temp-file rename. No credentials and no raw customer text.
 *
 * SPREAD_OFFER_TTL_MS is the named duration. A missing or non-positive
 * constant fails closed to idle. The auth-deferred age is not this duration.
 */

const path = require('path');
const atomicJsonFile = require('./atomicJsonFile');
const spreadAskGate = require('./spreadAskGate');
const { normalizeBody, sha256 } = require('./faqApprovedAnswers');

const SPREAD_OFFER_TTL_MS = 24 * 60 * 60 * 1000;
const TEMPLATE_ID = 'tpl.spread.safe-reply';
const FILE_NAME = 'spread-test-state.json';

function ttlMs() {
  if (typeof SPREAD_OFFER_TTL_MS !== 'number' || !(SPREAD_OFFER_TTL_MS > 0)) return null;
  return SPREAD_OFFER_TTL_MS;
}

function filePath() {
  const ticket = process.env.TICKET_STATE_FILE || path.join(process.cwd(), 'bot-ticket-state.json');
  return path.join(path.dirname(ticket), FILE_NAME);
}

function templateHash() {
  const guard = require('./spreadPublicGuard');
  return sha256(normalizeBody(guard.SAFE_SPREAD_REPLY));
}

function readMap() {
  const raw = atomicJsonFile.readJsonSafe(filePath(), { fallback: null });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw;
}

function writeMap(map) {
  atomicJsonFile.writeJsonAtomic(filePath(), map);
}

function validRecord(rec, conversationId) {
  if (!rec || typeof rec !== 'object') return false;
  if (rec.v !== 1) return false;
  if (String(rec.conversationId || '') !== String(conversationId || '')) return false;
  if (rec.state !== 'idle' && rec.state !== 'offered') return false;
  if (rec.templateId !== TEMPLATE_ID) return false;
  if (rec.state === 'offered') {
    if (typeof rec.expiresAt !== 'string' || !rec.expiresAt) return false;
    const exp = Date.parse(rec.expiresAt);
    if (!Number.isFinite(exp)) return false;
  }
  return true;
}

function classifyRecord(rec, conversationId) {
  if (rec == null) return { state: 'idle', reason: 'absent' };
  if (typeof rec !== 'object' || Array.isArray(rec)) return { state: 'idle', reason: 'corrupt', silence: true };
  if (String(rec.conversationId || '') !== String(conversationId || '')) {
    return { state: 'idle', reason: 'binding', silence: true };
  }
  if (rec.v !== 1 || (rec.state !== 'idle' && rec.state !== 'offered') || rec.templateId !== TEMPLATE_ID) {
    return { state: 'idle', reason: 'corrupt', silence: true };
  }
  if (rec.state === 'offered') {
    if (typeof rec.expiresAt !== 'string' || !rec.expiresAt) {
      return { state: 'idle', reason: 'missing-expires', silence: true };
    }
    const exp = Date.parse(rec.expiresAt);
    if (!Number.isFinite(exp)) return { state: 'idle', reason: 'missing-expires', silence: true };
    if (!(exp > Date.now())) return { state: 'idle', reason: 'expired', silence: true };
  }
  return rec;
}

function load(conversationId) {
  const ttl = ttlMs();
  if (ttl == null) return { state: 'idle', reason: 'ttl-missing', silence: true };
  const map = readMap();
  return classifyRecord(map[String(conversationId || '')], conversationId);
}

function save(conversationId, rec) {
  const map = readMap();
  map[String(conversationId)] = rec;
  writeMap(map);
  return rec;
}

function commitActed(conversationId) {
  const cid = String(conversationId || '');
  const map = readMap();
  const rec = map[cid];
  if (!validRecord(rec, cid) || rec.state !== 'offered') return rec || { state: 'idle' };
  rec.acted = true;
  map[cid] = rec;
  writeMap(map);
  return rec;
}

function clear(conversationId, reason) {
  const cid = String(conversationId || '');
  if (!cid) return { state: 'idle' };
  const rec = {
    v: 1,
    conversationId: cid,
    eventId: '',
    state: 'idle',
    templateId: TEMPLATE_ID,
    templateHash: templateHash(),
    offeredAt: '',
    expiresAt: '',
    eventAt: 0,
    acted: false,
    clearReason: String(reason || ''),
  };
  return save(cid, rec);
}

/**
 * Line-124 boolean without the hasTerm guard. Runs only when the caller
 * has already established state === 'offered'. Does not call explain().
 */
function personalAccountWhileOffered(text) {
  return spreadAskGate.personalAccountCue(text) === true;
}

function onTurn(opts) {
  opts = opts || {};
  const cid = String(opts.conversationId || '');
  const eventId = String(opts.eventId || '');
  const eventAt = Number(opts.eventAt || 0);
  const text = String(opts.text || '');
  const ttl = ttlMs();
  if (!cid || ttl == null) return { send: false, state: 'idle', reason: 'idle' };
  if (opts.clearEvent) {
    clear(cid, opts.clearReason || 'clear-event');
    return { send: false, state: 'idle', reason: 'clear-event' };
  }
  const cur = load(cid);
  if (cur.silence) {
    try { clear(cid, cur.reason || 'silence'); } catch (_) {}
    return { send: false, state: 'idle', reason: cur.reason || 'silence', blockPublic: true, silence: true };
  }
  if (cur.state === 'offered') {
    if (personalAccountWhileOffered(text)) {
      clear(cid, 'personal-account-while-offered');
      return { send: false, state: 'idle', reason: 'personal-clear', blockPublic: true, silence: true };
    }
    if (eventId && cur.eventId === eventId && cur.acted) {
      return { send: false, state: 'offered', reason: 'duplicate-event', duplicate: true, blockPublic: true, silence: true };
    }
    if (eventAt && cur.eventAt && eventAt < Number(cur.eventAt)) {
      return { send: true, state: 'offered', reason: 'offered-resend', entry: false, classId: 'comp.spread-only', stale: true };
    }
    if (!(eventId && cur.eventId === eventId)) {
      cur.eventId = eventId || cur.eventId;
      cur.eventAt = eventAt || cur.eventAt;
      cur.acted = false;
      save(cid, cur);
    }
    return { send: true, state: 'offered', reason: eventId && cur.eventId === eventId && !cur.acted ? 'retry-unsent' : 'offered-resend', entry: false, classId: 'comp.spread-only' };
  }
  let explained = { result: false, reason: 'no-spread-term' };
  try { explained = spreadAskGate.explain(text); } catch (_) { explained = { result: false, reason: 'explain-error' }; }
  const personal = spreadAskGate.personalAccountCue(text) === true;
  if (explained.reason === 'spread-test-credential' && !personal) {
    if (eventId && cur.eventId === eventId && cur.acted) {
      return { send: false, state: 'idle', reason: 'duplicate-event', duplicate: true, blockPublic: true, silence: true };
    }
    const now = new Date();
    const rec = {
      v: 1,
      conversationId: cid,
      eventId,
      state: 'offered',
      templateId: TEMPLATE_ID,
      templateHash: templateHash(),
      offeredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl).toISOString(),
      eventAt: eventAt || now.getTime(),
      acted: false,
    };
    save(cid, rec);
    return { send: true, state: 'offered', reason: 'spread-test-credential', entry: true };
  }
  return { send: false, state: 'idle', reason: explained.reason || 'idle', loadReason: cur.reason || 'idle' };
}

function noteHistoryOffer(conversationId, eventId, eventAt) {
  const cid = String(conversationId || '');
  const cur = load(cid);
  if (!cid || cur.reason !== 'absent') return cur;
  const ttl = ttlMs();
  if (ttl == null) return cur;
  const now = new Date();
  return save(cid, {
    v: 1,
    conversationId: cid,
    eventId: String(eventId || ''),
    state: 'offered',
    templateId: TEMPLATE_ID,
    templateHash: templateHash(),
    offeredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
    eventAt: Number(eventAt || 0) || now.getTime(),
    acted: false,
  });
}

module.exports = {
  SPREAD_OFFER_TTL_MS,
  TEMPLATE_ID,
  ttlMs,
  filePath,
  templateHash,
  load,
  clear,
  onTurn,
  commitActed,
  personalAccountWhileOffered,
  noteHistoryOffer,
};
