'use strict';
/**
 * atomicJsonFile.js — crash/disk-full safe JSON state files.
 *
 * Why (live incident 2026-09-23 14:4x UTC): the root filesystem filled up, a plain
 * fs.writeFileSync of bot-ticket-state.json was cut short, the next load hit a JSON parse
 * error, loadTicketState() silently returned {}, and the next save wrote a fresh file holding
 * only 7 conversations — every escalation / Risk-note / dedupe record for ~180 conversations
 * was gone.
 *
 * writeJsonAtomic: write a sibling temp file, fsync it, then rename over the target. rename is
 *   atomic on the same filesystem, so a reader sees either the old or the new file, never a
 *   torn one. If the write fails (ENOSPC etc.) the temp file is removed and the old file is
 *   untouched; the error is re-thrown exactly as writeFileSync did.
 *   With { lastGood: true } the previous good file is kept as <file>.lastgood first.
 * readJsonSafe: a MISSING file returns the fallback (fresh install). A CORRUPT file is logged
 *   loudly and recovered from <file>.lastgood; if that is unusable too it throws — it never
 *   pretends the state is empty, because the next save would then erase it.
 */

const fs = require('fs');
const path = require('path');

function writeJsonAtomic(file, value, opts) {
  opts = opts || {};
  const data = JSON.stringify(value, null, opts.pretty === false ? 0 : 2);
  const tmp = path.join(path.dirname(file), '.' + path.basename(file) + '.tmp-' + process.pid + '-' + Date.now());
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    if (opts.lastGood) {
      try { fs.copyFileSync(file, file + '.lastgood'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    fs.renameSync(tmp, file);
  } catch (e) {
    if (fd !== null) { try { fs.closeSync(fd); } catch (_) { /* ignore */ } }
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    throw e;
  }
}

function tryParse(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const v = JSON.parse(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not a JSON object');
  return v;
}

/**
 * @param {string} file
 * @param {{fallback?: object, label?: string, log?: Function}} [opts]
 */
function readJsonSafe(file, opts) {
  opts = opts || {};
  const fallback = opts.fallback !== undefined ? opts.fallback : {};
  const label = opts.label || path.basename(file);
  const log = typeof opts.log === 'function' ? opts.log : (...a) => console.error(...a);
  try {
    return tryParse(file);
  } catch (e) {
    if (e && e.code === 'ENOENT') return typeof fallback === 'function' ? fallback() : JSON.parse(JSON.stringify(fallback));
    log('STATE_FILE_CORRUPT', label, file, (e && e.message) || String(e));
    try {
      const v = tryParse(file + '.lastgood');
      log('STATE_FILE_RECOVERED_FROM_LASTGOOD', label, Object.keys(v).length, 'keys');
      return v;
    } catch (e2) {
      const err = new Error('STATE_FILE_UNREADABLE ' + label + ': ' + ((e && e.message) || e) +
        ' (lastgood: ' + ((e2 && e2.message) || e2) + ') — refusing to treat state as empty');
      err.code = 'STATE_FILE_UNREADABLE';
      throw err;
    }
  }
}

module.exports = { writeJsonAtomic, readJsonSafe };
