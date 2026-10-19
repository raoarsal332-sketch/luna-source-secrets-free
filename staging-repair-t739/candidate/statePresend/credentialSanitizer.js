'use strict';

/**
 * Shared credential-aware sanitizer for retained memory, maintainer evidence,
 * analytics, logs and report artifacts. Account identifiers are kept: only values
 * introduced by a credential label (or obvious key/token shapes) are replaced.
 */

const LABEL = String.raw`password|passcode|pass|otp|o\.t\.p|one[\s-]?time(?:\s+(?:code|password|pin))?|pin|2fa|mfa|verification\s+code|security\s+code|auth(?:entication)?\s+code|api[\s-]?key|token|secret`;

const CREDENTIAL_VALUE_RE = new RegExp(
  String.raw`\b(${LABEL})\b([\s:=-]*(?:is|was|:|=)?[\s:=-]*)(\S+)`,
  'gi'
);

function sanitizeCredentials(text) {
  return String(text == null ? '' : text)
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, '[secret]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer [secret]')
    .replace(CREDENTIAL_VALUE_RE, (m, label, sep) => `${label}${sep}[secret]`);
}

function sanitizeDeep(value, seen) {
  if (value == null) return value;
  if (typeof value === 'string') return sanitizeCredentials(value);
  if (typeof value !== 'object') return value;
  const seenSet = seen || new WeakSet();
  if (seenSet.has(value)) return value;
  seenSet.add(value);
  if (Array.isArray(value)) return value.map((x) => sanitizeDeep(x, seenSet));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = sanitizeDeep(v, seenSet);
  return out;
}

module.exports = { sanitizeCredentials, sanitizeDeep, CREDENTIAL_VALUE_RE };
