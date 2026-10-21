'use strict';

/**
 * Shared credential-aware sanitizer for retained memory, maintainer evidence,
 * analytics, logs and report artifacts. Account identifiers are kept: only values
 * introduced by a credential label (or obvious key/token shapes) are replaced.
 */

const LABEL = String.raw`password|passcode|passphrase|passwd|pwd|pass|otp|o\.t\.p|one[\s-]?time(?:\s+(?:code|password|pin))?|pin|2fa|mfa|verification\s+code|security\s+code|auth(?:entication)?\s+code|api[\s-]?key|token|secret`;

// Apostrophe and U+2019 are separators, including a possessive 's / ’s, so the
// value after "password's …" is the secret and not the two letters "'s".
const CREDENTIAL_SEP = "(?:['\u2019]s)?[\\s:='\"\u2018\u2019\u201C\u201D-]*(?:is|was|:|=)?[\\s:='\"\u2018\u2019\u201C\u201D-]*";

// One pass. A second pass would see the word "secret" inside the placeholder
// and redact that placeholder again. Unicode labels have no ASCII \\b.
const UNICODE_PASSWORD_LABEL = 'كلمة المرور|پاس ورڈ|पासवर्ड';
const CREDENTIAL_VALUE_RE = new RegExp(
  '(' + UNICODE_PASSWORD_LABEL + '|\\b(?:' + LABEL + ')\\b)(' + CREDENTIAL_SEP + ')(\\S+)',
  'giu'
);
const UNICODE_CREDENTIAL_RE = CREDENTIAL_VALUE_RE;

function replaceLabeledSecret(_m, label, sep) {
  return label + sep + '[secret]';
}

function sanitizeCredentials(text) {
  return String(text == null ? '' : text)
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, '[secret]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer [secret]')
    .replace(CREDENTIAL_VALUE_RE, replaceLabeledSecret);
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

module.exports = {
  sanitizeCredentials,
  sanitizeDeep,
  CREDENTIAL_VALUE_RE,
  UNICODE_CREDENTIAL_RE,
  CREDENTIAL_SEP,
};
