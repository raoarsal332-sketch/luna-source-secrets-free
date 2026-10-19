'use strict';
/**
 * F1 terminal abstain mark. Bound to conversation id and initiating event id.
 * Does not expire into a send. Stores no customer text.
 */

const path = require('path');
const atomicJsonFile = require('./atomicJsonFile');

const FILE_NAME = 'f1-terminal-abstain.json';

function filePath() {
  const ticket = process.env.TICKET_STATE_FILE || path.join(process.cwd(), 'bot-ticket-state.json');
  return path.join(path.dirname(ticket), FILE_NAME);
}

function readAll() {
  const raw = atomicJsonFile.readJsonSafe(filePath(), { fallback: null });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw;
}

function mark(conversationId, eventId, reason) {
  const cid = String(conversationId || '');
  const eid = String(eventId || '');
  if (!cid || !eid) return false;
  const all = readAll();
  const rec = all[cid] && typeof all[cid] === 'object' ? all[cid] : {};
  rec[eid] = { v: 1, reason: String(reason || 'module-off-fail-closed'), at: new Date().toISOString() };
  all[cid] = rec;
  try {
    atomicJsonFile.writeJsonAtomic(filePath(), all);
    return true;
  } catch (_) {
    return false;
  }
}

function blocks(conversationId, eventId) {
  const cid = String(conversationId || '');
  const eid = String(eventId || '');
  if (!cid || !eid) return false;
  const all = readAll();
  const rec = all[cid];
  return !!(rec && typeof rec === 'object' && rec[eid]);
}

function clear(conversationId) {
  const cid = String(conversationId || '');
  if (!cid) return false;
  const all = readAll();
  if (!all[cid]) return false;
  delete all[cid];
  try {
    atomicJsonFile.writeJsonAtomic(filePath(), all);
    return true;
  } catch (_) {
    return false;
  }
}

function blocksConversation(conversationId) {
  const cid = String(conversationId || '');
  if (!cid) return false;
  const all = readAll();
  const rec = all[cid];
  return !!(rec && typeof rec === 'object' && Object.keys(rec).length);
}

module.exports = { mark, clear, blocks, blocksConversation, filePath, FILE_NAME };
