'use strict';
/**
 * teammateAudit.js — durable record of ticket-level teammate commands.
 *
 * Global control mutations were already audited (control.js). Ticket commands were not: a
 * teammate STOP only wrote a console line, so there was no durable answer to "who stopped Luna
 * on which ticket". This closes that gap.
 *
 * Append-only: every entry is a single JSON line appended with O_APPEND, never rewritten. Each
 * entry names exactly one conversation, so a record can neither describe nor influence another
 * ticket.
 *
 * NEVER recorded: control secrets, API keys, authorization headers, or customer message bodies.
 * Only a normalized command type, the verified ids, and a short redacted reason are stored.
 * Auditing must never break a command, so every failure here is swallowed after logging.
 */
const fs = require('fs');

const AUDIT_FILE = process.env.LUNA_TEAMMATE_AUDIT_FILE || '/home/ubuntu/bot-teammate-audit.jsonl';
const FILE_MODE = 0o600;

// Commands Luna recognises. Anything else is recorded as OTHER rather than echoed back, so a
// crafted note cannot write arbitrary text into the audit.
const KNOWN_COMMANDS = new Set(['STOP', 'RESUME', 'CLOSE', 'REPLY', 'NOTE', 'FOLLOW', 'OPEN', 'SKIP', 'PING', 'CLARIFY', 'NOOP']);

// Anything that looks like a credential never reaches the file, even via `reason`.
const SECRETISH_RE = /(secret|token|api[-_ ]?key|authorization|bearer|password|passwd|otp)/i;

function safeId(value, max) {
  const s = value == null ? '' : String(value).trim();
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(s)) return null;
  return s.slice(0, max || 64);
}

function safeReason(value) {
  const s = value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  if (SECRETISH_RE.test(s)) return 'redacted';
  // Short, fixed-vocabulary style strings only; never a customer message body.
  return s.slice(0, 80);
}

/**
 * @param {object} e
 * @param {string} e.command      normalized command type (STOP/RESUME/...)
 * @param {string} e.conversationId the ONE ticket this entry concerns
 * @param {string} e.adminId      verified Intercom admin id (never a display name)
 * @param {string} e.outcome      'applied' | 'rejected' | 'failed'
 * @param {string} [e.reason]     short redacted reason
 */
function record(e) {
  try {
    const o = e || {};
    const command = KNOWN_COMMANDS.has(String(o.command || '').toUpperCase())
      ? String(o.command).toUpperCase()
      : 'OTHER';
    const entry = {
      t: new Date().toISOString(),
      command,
      conversationId: safeId(o.conversationId),
      adminId: safeId(o.adminId),
      outcome: ['applied', 'rejected', 'failed'].indexOf(String(o.outcome)) !== -1 ? String(o.outcome) : 'unknown',
      reason: safeReason(o.reason),
      pid: process.pid,
    };
    // O_APPEND: concurrent writers cannot interleave or truncate each other's lines.
    const fd = fs.openSync(AUDIT_FILE, 'a', FILE_MODE);
    try { fs.writeSync(fd, JSON.stringify(entry) + '\n'); } finally { fs.closeSync(fd); }
    try { fs.chmodSync(AUDIT_FILE, FILE_MODE); } catch (_) { /* best effort */ }
    return entry;
  } catch (err) {
    console.error('TEAMMATE_AUDIT_FAIL', err && err.message);
    return null;
  }
}

/** Read back entries for ONE conversation. Used by tests and by an operator asking "who?". */
function entriesFor(conversationId) {
  const want = safeId(conversationId);
  if (!want) return [];
  let raw = '';
  try { raw = fs.readFileSync(AUDIT_FILE, 'utf8'); } catch (_) { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (o && o.conversationId === want) out.push(o); } catch (_) { /* skip */ }
  }
  return out;
}

module.exports = { record, entriesFor, AUDIT_FILE, KNOWN_COMMANDS };
