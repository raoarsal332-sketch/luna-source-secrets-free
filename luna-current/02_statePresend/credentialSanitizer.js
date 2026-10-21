'use strict';

const crypto = require('crypto');

/**
 * Shared credential-aware sanitizer for notes, prompts, comments, memory,
 * and logs. Account identifiers are kept. Only values introduced by a
 * credential label, a repeated base64 token, or a secret already seen behind
 * a label are replaced.
 *
 * One label list lives here. Callers must not keep a second copy.
 *
 * The locked spread-test reply is allowed through only when its bytes hash to
 * the template. Any other text, including a copy with one character changed,
 * is redacted.
 */

function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

// Byte-for-byte copy of index.js SPREAD_TEST_REPLY. The allow check compares
// hashes, so a drift of one character does not keep the exemption.
const LOCKED_SPREAD_TEST_REPLY =
  'TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server\n\n' +
  'Platform: MetaTrader 5\n' +
  'Server: Fundedelite-Server\n' +
  'Account Number: 55188\n' +
  'Password: QBG5FetfozKz7^a?J!\n\n' +
  'Use this account to check spreads.';

const EXACT_ALLOW_HASHES = new Set([sha256Text(LOCKED_SPREAD_TEST_REPLY)]);

function isExactAllowedTemplate(text) {
  if (typeof text !== 'string' || !text) return false;
  return EXACT_ALLOW_HASHES.has(sha256Text(text));
}

// NFKC folds compatibility lookalikes. Format characters (ZWSP, ZWNJ, BOM, bidi
// marks) are removed so a label or a secret cannot hide inside them.
function normalizeCredentialText(text) {
  return String(text == null ? '' : text).normalize('NFKC').replace(/\p{Cf}/gu, '');
}

function flexLabel(label) {
  const chars = Array.from(String(label || ''));
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/\s/u.test(ch)) {
      out += '\\s+';
      continue;
    }
    out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (i !== chars.length - 1) out += '\\s*';
  }
  return out;
}

const LATIN_LABELS = [
  'one time password',
  'one-time password',
  'one time code',
  'one-time code',
  'one time pin',
  'authentication code',
  'verification code',
  'security code',
  'passphrase',
  'passcode',
  'password',
  'api key',
  'api-key',
  'passwd',
  'o.t.p',
  'token',
  'secret',
  'pass',
  'pwd',
  'otp',
  '2fa',
  'mfa',
  'pin',
];

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
// Symbols stay inside the token. A password such as "a?b!" must not leave the
// suffix after "?" in the note, the prompt, or the comment.
const SECRET_TOKEN = '(?!(?:' + STOP_WORD + ')\\b)[^\\s<]{1,120}';
// Brace-wrapped, tag-wrapped, or any number of chunks on the same line.
// A following "and account …" stops the value. Spaces may separate every chunk.
// The placeholder is a valid value so a second pass keeps it instead of eating the
// letter before it ("password's [secret]" must stay unchanged).
const SECRET_VALUE =
  '(?:\\{[^{}]{1,400}\\}|<b>\\s*[^<]{1,400}\\s*</b>|' +
  SECRET_TOKEN +
  '(?:[ \\t]+' +
  SECRET_TOKEN +
  ')*)';

const CREDENTIAL_VALUE_RE = new RegExp(
  '(?<!\\[)(' + UNICODE_PASSWORD_LABEL + '|\\b(?:' + LABEL + ')\\b)(?!\\])(' + CREDENTIAL_SEP + ')(' + SECRET_VALUE + ')',
  'giu'
);
const UNICODE_CREDENTIAL_RE = CREDENTIAL_VALUE_RE;

const FLEX_LABELS = LATIN_LABELS.concat(UNICODE_PASSWORD_LABEL.split('|')).sort((a, b) => Array.from(b).length - Array.from(a).length);
const FLEX_LABEL_RE = new RegExp(
  '(?<!\\[)(?<![A-Za-z0-9])(' + FLEX_LABELS.map(flexLabel).join('|') + ')(?![A-Za-z0-9])(?!\\])(' + CREDENTIAL_SEP + ')(' + SECRET_VALUE + ')',
  'giu'
);

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
  const v = normalizeCredentialText(cleanSecretValue(raw));
  if (!v || v.length < 4) return;
  if (/^\[secret\]$/i.test(v)) return;
  if (/^(secret|password|token|pass|pin|otp)$/i.test(v)) return;
  rememberedSecrets.add(v);
}

function echoPattern(secret) {
  const chars = Array.from(secret);
  if (!chars.length || chars.length > 80) return null;
  const body = chars.map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  // A second pass must remove the same span the label pass removed, including a
  // brace or <b> wrapper. Otherwise "{secret}" becomes "{[secret]}" only on the
  // replay, and the two calls disagree.
  return new RegExp(
    '(?<![A-Za-z0-9])(?:\\{\\s*|<(?:b|B)>\\s*)?(?:' + body + ')(?:\\s*\\}|\\s*</(?:b|B)>)?(?![A-Za-z0-9])',
    'giu'
  );
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
    const key = normalizeCredentialText(secret);
    if (!key || key.length < 4) continue;
    const re = echoPattern(key);
    // The pattern covers the exact secret, a spaced echo, and a brace or <b>
    // wrapper. Splitting the bare secret first would leave the wrapper behind
    // ("{[secret]}") and the next call would disagree with the first.
    if (re) out = out.replace(re, '[secret]');
    else if (out.includes(key)) out = out.split(key).join('[secret]');
  }
  return out;
}

function sanitizeCredentials(text) {
  const original = String(text == null ? '' : text);
  if (isExactAllowedTemplate(original)) return original;
  // Normalize before counting so a repeated base64 token hidden by a format
  // character is still the same token, including inside a label value.
  // Known secrets are removed in normalized form before the label pass, so a
  // spaced echo is not split into a label plus a leftover value.
  const normalized = normalizeCredentialText(original);
  const echoed = redactRememberedValues(normalized);
  const repeated = redactRepeatedBase64(echoed);
  const labeled = repeated
    .replace(/\b(sk-[A-Za-z0-9_-]{16,})/g, (_m, tok) => {
      rememberSecret(tok);
      return '[secret]';
    })
    .replace(/\bBearer\s+([A-Za-z0-9._-]{16,})/gi, (_m, tok) => {
      rememberSecret(tok);
      return 'Bearer [secret]';
    })
    .replace(CREDENTIAL_VALUE_RE, replaceLabeledSecret)
    .replace(FLEX_LABEL_RE, replaceLabeledSecret);
  return redactRememberedValues(labeled);
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
  isExactAllowedTemplate,
  sha256Text,
  LOCKED_SPREAD_TEST_REPLY,
  CREDENTIAL_VALUE_RE,
  UNICODE_CREDENTIAL_RE,
  CREDENTIAL_SEP,
  UNICODE_PASSWORD_LABEL,
};
