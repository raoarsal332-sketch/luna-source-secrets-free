'use strict';
/**
 * secretRedact.js — SECRET_REDACT_V1
 * Redacts secrets from diagnostic text before it is printed. Used by bin/luna-safe-diag and
 * bin/luna-rotate-intercom.js. Best effort: redaction reduces exposure; it cannot guarantee that
 * every possible secret shape is caught, so diagnostics must still print allowlisted fields only.
 *
 * Redacts (a) the literal VALUES of secret-named environment variables (name contains KEY, TOKEN,
 * SECRET, PASSWORD, PASS, CREDENTIAL or AUTH) and (b) common token shapes: OpenAI keys, Bearer
 * headers, Intercom base64 "tok:" tokens, JWTs, and key=value pairs whose key looks secret.
 */
const SECRET_NAME_RE = /(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|CREDENTIAL|AUTH)/i;
const SHAPES = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\bdG9rOj[A-Za-z0-9+/=]{12,}/g, // base64("tok:…") Intercom access tokens
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWT
];
const KV_RE = /\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|AUTH)[A-Za-z0-9_]*)(\s*[=:]\s*)(["']?)([^\s"',}]{6,})\3/gi;

function secretValues(env) {
  const out = [];
  for (const [k, v] of Object.entries(env || {})) {
    if (!SECRET_NAME_RE.test(k)) continue;
    const s = String(v || '');
    if (s.length >= 8) out.push(s);
  }
  return out.sort((a, b) => b.length - a.length);
}

function redact(text, env) {
  let t = String(text == null ? '' : text);
  for (const v of secretValues(env || process.env)) t = t.split(v).join('[REDACTED]');
  for (const re of SHAPES) t = t.replace(re, '[REDACTED]');
  t = t.replace(KV_RE, (m, k, sep, q) => k + sep + q + '[REDACTED]' + q);
  return t;
}

function redactDeep(value, env) {
  let s;
  try { s = JSON.stringify(value, (k, v) => (v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v)); } catch (_) { s = String(value); }
  return redact(s, env);
}

module.exports = { redact, redactDeep, secretValues, SECRET_NAME_RE };
