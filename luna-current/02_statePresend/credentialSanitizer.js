'use strict';

/**
 * Shared credential-aware sanitizer for notes, prompts, comments, memory,
 * and logs. Account identifiers are kept. Only values introduced by a
 * credential label, a repeated base64 token, or a secret already seen behind
 * a label are replaced.
 *
 * One label list lives here. Callers must not keep a second copy.
 */

const LABEL =
  'password|passcode|passphrase|passwd|pwd|pass|otp|o\\.t\\.p|one[\\s-]?time(?:\\s+(?:code|password|pin))?|pin|2fa|mfa|verification\\s+code|security\\s+code|auth(?:entication)?\\s+code|api[\\s-]?key|token|secret';

// Longer phrases first so "पास वर्ड" is not cut down to a shorter label.
const UNICODE_PASSWORD_LABEL = [
  'كلمة المرور',
  'پاس ورڈ',
  'پاسورڈ',
  'गुप्तशब्द',
  'गुप्त शब्द',
  'कूटशब्द',
  'कूट शब्द',
  'संकेत शब्द',
  'पासकोड',
  'पास वर्ड',
  'पासवर्ड',
  'ओटीपी',
].join('|');

const TAG = '<\\/?[a-zA-Z][^>]*>';
const ENTITY = '&(?:#0*58|#x0*3a|#0*61|#x0*3d|colon|equals);';
// Apostrophe, U+2019, tags, and HTML entities (&#58; is a colon) are separators.
const CREDENTIAL_SEP =
  "(?:['\u2019]s)?(?:" +
  TAG +
  '|\\s|' +
  ENTITY +
  "|[:=\"'\u2018\u2019\u201C\u201D-])*(?:is|was)?(?:" +
  TAG +
  '|\\s|' +
  ENTITY +
  "|[:=\"'\u2018\u2019\u201C\u201D-])*";

const STOP_WORD = 'and|but|please|account|email|thanks|thank';
const SECRET_TOKEN = '(?!(?:' + STOP_WORD + ')\\b)[^\\s<.!?,]{1,80}';
// Brace-wrapped, tag-wrapped, or up to six tokens. A following "and account …" stops the value.
// The placeholder is a valid value so a second pass keeps it instead of eating the
// letter before it ("password's [secret]" must stay unchanged).
const SECRET_VALUE =
  '(?:\\{[^{}]{1,240}\\}|<b>\\s*[^<]{1,240}\\s*</b>|' +
  SECRET_TOKEN +
  '(?:\\s+' +
  SECRET_TOKEN +
  '){0,5})';

const CREDENTIAL_VALUE_RE = new RegExp(
  '(?<!\\[)(' + UNICODE_PASSWORD_LABEL + '|\\b(?:' + LABEL + ')\\b)(?!\\])(' + CREDENTIAL_SEP + ')(' + SECRET_VALUE + ')',
  'giu'
);
const UNICODE_CREDENTIAL_RE = CREDENTIAL_VALUE_RE;

const BASE64_RE = /(?<![A-Za-z0-9+/])([A-Za-z0-9+/]{20,}={0,2})(?![A-Za-z0-9+/])/g;

const rememberedSecrets = new Set();

function cleanSecretValue(raw) {
  let v = String(raw || '').trim();
  if (v.startsWith('{') && v.endsWith('}')) v = v.slice(1, -1).trim();
  const tagged = v.match(/^<b>\s*([\s\S]*?)\s*<\/b>$/i);
  if (tagged) v = tagged[1].trim();
  v = v.replace(/^[`"'\u2018\u2019\u201C\u201D]+|[`"'\u2018\u2019\u201C\u201D]+$/g, '').trim();
  return v;
}

function rememberSecret(raw) {
  const v = cleanSecretValue(raw);
  if (!v || v.length < 4) return;
  if (/^\[secret\]$/i.test(v)) return;
  if (/^(secret|password|token|pass|pin|otp)$/i.test(v)) return;
  rememberedSecrets.add(v);
}

function replaceLabeledSecret(match, label, sep, value) {
  const cleaned = cleanSecretValue(value);
  if (!cleaned || /^\[secret\]$/i.test(cleaned)) return match;
  rememberSecret(value);
  return label + sep + '[secret]';
}

function redactRepeatedBase64(text) {
  const counts = new Map();
  const re = new RegExp(BASE64_RE.source, 'g');
  let m;
  while ((m = re.exec(text))) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  let out = text;
  for (const [token, n] of counts) {
    if (n < 2) continue;
    rememberSecret(token);
    out = out.split(token).join('[secret]');
  }
  return out;
}

function redactRememberedValues(text) {
  let out = String(text == null ? '' : text);
  const secrets = [...rememberedSecrets].sort((a, b) => b.length - a.length);
  for (const secret of secrets) {
    if (!secret || secret.length < 4) continue;
    if (!out.includes(secret)) continue;
    out = out.split(secret).join('[secret]');
  }
  return out;
}

function sanitizeCredentials(text) {
  const original = String(text == null ? '' : text);
  const labeled = original
    .replace(/\b(sk-[A-Za-z0-9_-]{16,})/g, (_m, tok) => {
      rememberSecret(tok);
      return '[secret]';
    })
    .replace(/\bBearer\s+([A-Za-z0-9._-]{16,})/gi, (_m, tok) => {
      rememberSecret(tok);
      return 'Bearer [secret]';
    })
    .replace(CREDENTIAL_VALUE_RE, replaceLabeledSecret);
  const repeated = redactRepeatedBase64(labeled);
  return redactRememberedValues(repeated);
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

function rememberedSecretCount() {
  return rememberedSecrets.size;
}

module.exports = {
  sanitizeCredentials,
  sanitizeDeep,
  redactRememberedValues,
  rememberedSecretCount,
  CREDENTIAL_VALUE_RE,
  UNICODE_CREDENTIAL_RE,
  CREDENTIAL_SEP,
  UNICODE_PASSWORD_LABEL,
};
