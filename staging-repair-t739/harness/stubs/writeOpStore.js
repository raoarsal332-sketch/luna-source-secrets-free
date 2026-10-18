'use strict';
/**
 * [HI]+[ME] stand-in for the staging writeOpStore (not in the tree). Same API as the historical
 * snapshot, except opKey also folds in opScope: the staging index.js calls opKey with a 4th
 * argument, which the historical file ignores. Records are kept in a JSON file so a test can read
 * every persisted/retryable write-op.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function storePath() { return process.env.LUNA_OP_STORE_FILE; }
function load() {
  try { const j = JSON.parse(fs.readFileSync(storePath(), 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch (_) { return {}; }
}
function save(all) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(all));
}
function opKey(method, url, data, scope) {
  let safeUrl = String(url || '');
  try { const u = new URL(safeUrl); u.search = ''; u.hash = ''; safeUrl = u.toString(); } catch (_) { safeUrl = safeUrl.split('?')[0]; }
  return crypto.createHash('sha256').update(String(method || '').toLowerCase() + '\n' + safeUrl + '\n' + JSON.stringify(data || null) + '\n' + String(scope || '')).digest('hex');
}
function get(key) { return load()[key] || null; }
function set(key, rec) { const all = load(); all[key] = Object.assign({}, rec, { at: Date.now() }); save(all); return all[key]; }
function shouldSkipReplay(rec) { return !!rec && ['confirmed', 'unknown', 'pending'].includes(rec.status); }
function isValidWriteSuccess(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (data.id != null && String(data.id)) return true;
  if (['conversation', 'admin_reply', 'comment'].includes(data.type)) return true;
  if (data.conversation_parts) return true;
  return !!(data.conversation && (data.conversation.id || data.conversation.conversation_parts));
}
module.exports = { storePath, opKey, get, set, shouldSkipReplay, isValidWriteSuccess, load };
