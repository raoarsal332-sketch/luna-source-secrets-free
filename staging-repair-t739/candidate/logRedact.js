'use strict';
/**
 * logRedact.js — LOG_REDACT_V1 (2026-09-29)
 * Log-output-only safety net: wraps process.stdout.write / process.stderr.write so that secrets
 * never reach PM2 logs (e.g. an AxiosError dumped by util.inspect includes config.headers with
 * "Authorization: Bearer …"). It redacts:
 *   - literal values (>=16 chars) of secret-named env vars (via secretRedact.secretValues)
 *   - OpenAI-style keys  sk-… / sk-proj-… / sk-admin-… / sk-svcacct-…
 *   - "Bearer <token>" and Intercom base64 "dG9rOj…" tokens
 * It only rewrites bytes written to stdout/stderr. It does not touch replies, prompts, routing,
 * validators, model settings or any Intercom/OpenAI request. Any internal error falls back to the
 * original write unchanged (fail-open for logging, never throws into the caller).
 */
const { secretValues } = require('./secretRedact');

const MARK = '[REDACTED_SECRET]';
const SHAPES = [
  /\bsk-(?:proj-|admin-|svcacct-)?[A-Za-z0-9_-]{16,}/g,
  /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\bdG9rOj[A-Za-z0-9+/=]{12,}/g,
];
const QUICK = /sk-|bearer|dG9rOj/i;

let cache = null;
let cacheAt = 0;
let cacheN = -1;
function values() {
  const now = Date.now();
  const n = Object.keys(process.env).length; // refresh as soon as dotenv adds variables
  if (!cache || n !== cacheN || now - cacheAt > 30000) {
    cacheN = n;
    try { cache = secretValues(process.env).filter((v) => v.length >= 16); } catch (_) { cache = []; }
    cacheAt = now;
  }
  return cache;
}

function redactLog(text) {
  let t = String(text);
  for (const v of values()) if (t.indexOf(v) !== -1) t = t.split(v).join(MARK);
  if (QUICK.test(t)) {
    t = t.replace(SHAPES[0], MARK);
    t = t.replace(SHAPES[1], (m, b) => b + ' ' + MARK);
    t = t.replace(SHAPES[2], MARK);
  }
  return t;
}

function wrap(stream) {
  if (!stream || typeof stream.write !== 'function' || stream.__lunaLogRedact) return;
  const orig = stream.write;
  stream.write = function lunaRedactedWrite(chunk, encoding, cb) {
    try {
      if (typeof chunk === 'string') {
        chunk = redactLog(chunk);
      } else if (Buffer.isBuffer(chunk)) {
        const s = chunk.toString('utf8');
        const r = redactLog(s);
        if (r !== s) chunk = Buffer.from(r, 'utf8');
      }
    } catch (_) { /* fail-open: write original */ }
    return orig.call(this, chunk, encoding, cb);
  };
  stream.__lunaLogRedact = true;
}

function install() {
  wrap(process.stdout);
  wrap(process.stderr);
  return true;
}

module.exports = { install, redactLog, LOG_REDACT_MARK: MARK };
