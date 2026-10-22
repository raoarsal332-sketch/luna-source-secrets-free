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

// A format character is a hard stop only when it sits between two complete
// letter-and-digit tokens. That keeps a pin from swallowing the next order id.
// A format character inside a label, or inside one token, is still removed.
function isCfChar(ch) {
  return /\p{Cf}/u.test(ch);
}

function isAlnumChar(ch) {
  return /[A-Za-z0-9]/.test(ch);
}

function alnumRunBefore(chars, index) {
  let i = index;
  while (i >= 0 && isCfChar(chars[i])) i -= 1;
  if (i < 0 || !isAlnumChar(chars[i])) return '';
  const end = i;
  while (i >= 0 && isAlnumChar(chars[i])) i -= 1;
  return chars.slice(i + 1, end + 1).join('');
}

function alnumRunAfter(chars, index) {
  let i = index;
  while (i < chars.length && isCfChar(chars[i])) i += 1;
  if (i >= chars.length || !isAlnumChar(chars[i])) return '';
  const start = i;
  while (i < chars.length && isAlnumChar(chars[i])) i += 1;
  return chars.slice(start, i).join('');
}

function isSeparateValueToken(run) {
  return run.length >= 4 && /[A-Za-z]/.test(run) && /\d/.test(run);
}

function prepareCredentialText(text) {
  const nfkc = String(text == null ? '' : text).normalize('NFKC');
  if (!/\p{Cf}/u.test(nfkc)) return nfkc;
  const chars = Array.from(nfkc);
  const boundary = new Set();
  for (let i = 0; i < chars.length; i += 1) {
    if (!isCfChar(chars[i])) continue;
    const left = alnumRunBefore(chars, i - 1);
    const right = alnumRunAfter(chars, i + 1);
    if (isSeparateValueToken(left) && isSeparateValueToken(right)) boundary.add(i);
  }
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    if (!isCfChar(chars[i])) {
      out += chars[i];
      continue;
    }
    if (boundary.has(i) && !out.endsWith('\n')) out += '\n';
  }
  return out;
}

// Detection only. Cyrillic and Greek letters that look like Latin are folded
// so a homoglyph label cannot skip the credential pattern. The stored secret
// and the returned text keep the original characters.
const CONFUSABLES = {};
function mapConfusables(from, to) {
  const src = Array.from(from);
  const dst = Array.from(to);
  for (let i = 0; i < src.length; i += 1) CONFUSABLES[src[i]] = dst[i];
}
mapConfusables('АаВвЕеКкМмНнОоРрСсТтУуХхЅѕІіЈј', 'AaBbEeKkMmHhOoPpCcTtYyXxSsIiJj');
mapConfusables('ΑαΒΕεΖζΗΙιΚκΜΝΟοΡρΤτΥυΧχ', 'AaBEeZzHIiKkMNOoPpTtYyXx');
mapConfusables('\u0500\u0501\u051a\u051b\u051c\u051d\u04ba\u04bb\u04c0\u04ae\u04af\u03bd', 'DdQqWwHhIYYv');

function foldConfusables(text) {
  const raw = String(text || '');
  if (!/[\u0370-\u03FF\u0400-\u052F]/u.test(raw)) return raw;
  let changed = false;
  let out = '';
  for (const ch of raw) {
    const mapped = CONFUSABLES[ch];
    if (mapped) {
      out += mapped;
      changed = true;
    } else {
      out += ch;
    }
  }
  return changed ? out : raw;
}

function confusableLabelSpans(prepared, folded) {
  const spans = [];
  if (folded === prepared) return spans;
  for (const source of [CREDENTIAL_VALUE_RE, FLEX_LABEL_RE]) {
    const re = new RegExp(source.source, 'giu');
    let m;
    while ((m = re.exec(folded))) {
      const label = m[1];
      const sep = m[2];
      const value = m[3];
      const labelStart = m.index;
      if (prepared.slice(labelStart, labelStart + label.length) === label) continue;
      const valueStart = labelStart + label.length + sep.length;
      const origValue = prepared.slice(valueStart, valueStart + value.length);
      const cleaned = cleanSecretValue(origValue);
      if (!cleaned || /^\[secret\]$/i.test(cleaned)) continue;
      spans.push({ valueStart, valueEnd: valueStart + value.length, origValue });
    }
  }
  return spans;
}

function applyConfusableLabels(prepared) {
  const folded = foldConfusables(prepared);
  const spans = confusableLabelSpans(prepared, folded);
  if (!spans.length) return prepared;
  spans.sort((a, b) => b.valueStart - a.valueStart || b.valueEnd - a.valueEnd);
  let out = prepared;
  let cursor = out.length;
  for (const span of spans) {
    if (span.valueEnd > cursor) continue;
    rememberSecret(span.origValue);
    out = out.slice(0, span.valueStart) + '[secret]' + out.slice(span.valueEnd);
    cursor = span.valueStart;
  }
  return out;
}

function labeledCredentialValues(text) {
  const prepared = prepareCredentialText(text);
  const folded = foldConfusables(prepared);
  const values = [];
  const plain = new RegExp(CREDENTIAL_VALUE_RE.source, 'giu');
  let m;
  while ((m = plain.exec(prepared))) values.push(m[3]);
  for (const span of confusableLabelSpans(prepared, folded)) values.push(span.origValue);
  return values;
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

function canonicalSecret(raw) {
  const full = normalizeCredentialText(cleanSecretValue(raw));
  if (!full) return '';
  // Edge punctuation is not part of the token. Internal symbols stay.
  return full.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
}

const RUN_STOP = /^(secret|password|token|pass|pin|otp|account|email|thanks|thank)$/i;

// Ordinary dictionary and function words are not secrets. "password back"
// still redacts that labeled occurrence, and it does not taint later "back".
const ORDINARY_WORDS = new Set(
  ('a an the and or but if so to of in on for from with at by as is was were be been being ' +
    'it this that these those i you we they he she my your our their me him her us them ' +
    'not no nor yes do does did doing done have has had having will would can could should ' +
    'may might must shall please thanks thank hello hi hey ok okay back soon here there now ' +
    'just only also very into over after before again still then than too well much many ' +
    'more most other some any each both few own same such out up down off about above below ' +
    'between through during without within further once team review update client message ' +
    'help need want send share check look know mean call tell ask give take make see come ' +
    'get let put keep hold turn next last first new old good fine sure right left true false ' +
    'same different question answer status progress news waiting wait today tomorrow already ' +
    'because while where when what which who how why all any been from your')
    .split(/\s+/)
    .filter(Boolean)
);

function isOrdinaryWord(token) {
  const word = String(token || '').toLowerCase();
  return !!word && ORDINARY_WORDS.has(word);
}

// A value-shaped token has a digit, an internal symbol, or is not a lone
// dictionary word. A multi-word passphrase still counts when one word is not
// ordinary. Edge punctuation does not turn "back" into a secret.
function isValueShaped(full) {
  const text = String(full || '').trim();
  if (!text || /^\[secret\]$/i.test(text)) return false;
  const body = text.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
  if (!body) return false;
  if (/\d/u.test(body)) return true;
  if (/[^\p{L}\p{N}\s]/u.test(body)) return true;
  const words = body.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.some((word) => !isOrdinaryWord(word));
  if (isOrdinaryWord(body)) return false;
  if (/^\p{L}+$/u.test(body) && body.length < 8) return false;
  return body.length >= 8;
}

function rememberSecret(raw) {
  const full = normalizeCredentialText(cleanSecretValue(raw));
  if (!full || full.length < 4) return;
  if (/^\[secret\]$/i.test(full)) return;
  if (/^(secret|password|token|pass|pin|otp)$/i.test(full)) return;
  if (!isValueShaped(full)) return;
  const canon = canonicalSecret(full);
  if (canon && canon.length >= 4 && !/^(secret|password|token|pass|pin|otp)$/i.test(canon) && isValueShaped(canon)) {
    rememberedSecrets.add(canon);
  }
  if (canon !== full && isValueShaped(full)) rememberedSecrets.add(full);
  // A symbol inside the secret means a later draft may quote only one
  // alphanumeric piece of it, including inside braces or quotes.
  // Ordinary words inside that secret are not stored.
  if (!/[^\p{L}\p{N}\s]/u.test(full)) return;
  const runs = full.match(/[\p{L}\p{N}]{6,}/gu) || [];
  for (const run of runs) {
    const piece = normalizeCredentialText(run);
    if (!piece || piece.length < 6 || RUN_STOP.test(piece) || /^\[secret\]$/i.test(piece)) continue;
    if (isOrdinaryWord(piece)) continue;
    rememberedSecrets.add(piece);
  }
}

function echoPattern(secret) {
  const canonical = canonicalSecret(secret) || normalizeCredentialText(secret);
  if (!canonical || canonical.length < 4 || canonical.length > 80) return null;
  const chars = Array.from(canonical);
  const body = chars.map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  const edge = '[\\p{P}\\p{S}]*';
  // Leading and trailing punctuation are outside the token. Braces, quotes,
  // and <b> wrappers are part of the same span the label pass removes.
  const open = '(?:\\{\\s*|<(?:b|B)>\\s*|[\'"\u2018\u201C]\\s*)?';
  const close = '(?:\\s*\\}|\\s*</(?:b|B)>|\\s*[\'"\u2019\u201D])?';
  return new RegExp(
    '(?<![A-Za-z0-9])' + open + edge + '(?:' + body + ')' + edge + close + '(?![A-Za-z0-9])',
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
  const normalized = applyConfusableLabels(prepareCredentialText(original));
  const echoed = redactRememberedValues(normalized);
  const repeated = redactRepeatedBase64(echoed);
  const labeled = repeated
    .replace(/\b(sk-[A-Za-z0-9_-]{16,})([\p{P}\p{S}]*)/gu, (_m, tok, punct) => {
      rememberSecret(tok + (punct || ''));
      return '[secret]';
    })
    .replace(/\b(Bearer)\s+([A-Za-z0-9._-]{16,})([\p{P}\p{S}]*)/giu, (_m, label, tok, punct) => {
      rememberSecret(tok + (punct || ''));
      return label + ' [secret]';
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
  labeledCredentialValues,
};
