'use strict';

/**
 * Credential guard R7 — frozen staging candidate.
 *
 * Builds on the R6 staging module. The R6 review case file was not read.
 * Not wired into index.js, statePresend, or the maintainer. approved is
 * false until a different agent reviews it.
 *
 * The fixed client message follows the existing credentials rule: do not
 * repeat a pasted secret, tell the client to change it immediately, and
 * escalate it as a security event. It states no account, payout, or lock
 * outcome.
 */

const STATUS = Object.freeze({
  candidate: 'credential-guard-r7',
  frozen: true,
  approved: false,
  release: false,
  wired: false,
});

const FIXED_MESSAGE =
  'Please change that immediately. I will not repeat it back. I am escalating this as a security event for the team.';

/** Canonical 55188 spread-test template. Same bytes as index.js SPREAD_TEST_REPLY. */
const SPREAD_TEST_REPLY =
  'TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server\n\n' +
  'Platform: MetaTrader 5\n' +
  'Server: Fundedelite-Server\n' +
  'Account Number: 55188\n' +
  'Password: QBG5FetfozKz7^a?J!\n\n' +
  'Use this account to check spreads.';

/** Password inside the existing 55188 spread-test template in index.js. */
const TEMPLATE_PASSWORD = 'QBG5FetfozKz7^a?J!';

const HOMO = {
  '\u0410': 'A', '\u0412': 'B', '\u0415': 'E', '\u041a': 'K', '\u041c': 'M', '\u041d': 'H',
  '\u041e': 'O', '\u0420': 'P', '\u0421': 'C', '\u0422': 'T', '\u0425': 'X',
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c', '\u0443': 'y', '\u0445': 'x',
  '\u0456': 'i', '\u0455': 's',
  '\u0391': 'A', '\u0392': 'B', '\u0395': 'E', '\u0396': 'Z', '\u0397': 'H', '\u0399': 'I',
  '\u039a': 'K', '\u039c': 'M', '\u039d': 'N', '\u039f': 'O', '\u03a1': 'P', '\u03a4': 'T', '\u03a7': 'X',
  '\u03b1': 'a', '\u03bf': 'o', '\u03c1': 'p',
};

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

const STOP = new Set([
  'the', 'a', 'an', 'my', 'your', 'mera', 'meri', 'apna', 'this', 'that', 'it', 'to', 'on',
  'in', 'and', 'or', 'please', 'challenge', 'phase', 'evaluation', 'account', 'for', 'of',
  'me', 'you', 'hai', 'hain', 'he', 'ho', 'is', 'was', 'spreads', 'spread',
]);

const LABEL_SRC = [
  'password', 'passwd', 'passcode', 'pwd', 'pass', 'otp', 'pin', '2fa', 'mfa',
  'پاسورڈ', 'پاس\\s*ورڈ', 'كلمة\\s+المرور', 'كلمة\\s+السر', 'الباسورد', 'باسورد', 'पासवर्ड', 'पास\\s*वर्ड',
].join('|');

const COPULA_SRC = 'hai|hain|he|ho|is|was|है|ہے|هي|هو';

const LABEL_RE = new RegExp(
  '(?:^|[^\\p{L}\\p{N}])((?:' + LABEL_SRC + '))([\\s:=\\-]*)(?:(' + COPULA_SRC + ')[\\s:=\\-]*)?',
  'giu'
);

const DIAGNOSTIC_DROP = new Set([
  'body', 'draft', 'clientText', 'clienttext', 'raw', 'password', 'secret', 'secrets',
  'data', 'message', 'stack', 'text', 'payload', 'html', 'error', 'err',
]);

const secretsByConversation = new Map();
const lastAskByConversation = new Map();
const opQueue = [];

function normalizeForMatch(text) {
  let s = String(text == null ? '' : text).normalize('NFKC');
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u180E]/g, '');
  // Drop inherited combining marks (Latin spoofing, Arabic harakat). Keep
  // Devanagari matras: they are letters of the word, not spoof marks.
  let kept = '';
  for (const ch of s.normalize('NFD')) {
    if (/\p{M}/u.test(ch) && /\p{Script=Inherited}/u.test(ch)) continue;
    kept += ch;
  }
  let out = '';
  for (const ch of kept) out += HOMO[ch] || ch;
  return out;
}

function leetFold(text) {
  return String(text).replace(/[013457@$]/g, (ch) => LEET[ch] || ch);
}

function collapseSplitLabels(text) {
  let s = String(text || '');
  s = s.replace(/\bpass[\s._-]*word\b/gi, 'password');
  s = s.replace(/\bp[\s._-]*w[\s._-]*d\b/gi, 'pwd');
  s = s.replace(/(?:\b[\p{L}\p{N}]\b[\s._-]+){2,}\b[\p{L}\p{N}]\b/gu, (m) => {
    const joined = leetFold(m.replace(/[\s._-]+/g, '')).toLowerCase();
    if (['password', 'passwd', 'passcode', 'pwd', 'pass', 'otp', 'pin'].includes(joined)) return joined;
    return m;
  });
  return s;
}

function prepare(text) {
  return collapseSplitLabels(normalizeForMatch(text));
}

function cleanToken(raw) {
  return String(raw || '').replace(/^['"`([{]+|['"`)\]}.,;!?]+$/g, '');
}

function readToken(text, index) {
  const m = /^\s*(\S+)/.exec(String(text || '').slice(index));
  if (!m) return null;
  const raw = cleanToken(m[1]);
  if (!raw) return null;
  return { raw, end: index + m[0].length };
}

function readValueToken(text, index) {
  const rest = String(text || '').slice(index);
  const split = /^\s*((?:[\p{L}\p{N}])(?:\s+[\p{L}\p{N}]){2,})/u.exec(rest);
  if (split) {
    return { raw: split[1].replace(/\s+/g, ''), end: index + split[0].length };
  }
  return readToken(text, index);
}

function isShaped(value) {
  if (/\d/.test(value)) return true;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) return true;
  if (/[^\p{L}\p{N}]/u.test(value)) return true;
  return false;
}

function tryBase64(token, minLen) {
  const original = String(token || '').trim();
  const min = minLen == null ? 12 : minLen;
  if (original.length < min) return null;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(original)) return null;
  let t = original.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (t.length % 4 === 1) return null;
  while (t.length % 4 !== 0) t += '=';
  let decoded;
  try {
    decoded = Buffer.from(t, 'base64').toString('utf8');
  } catch (_) {
    return null;
  }
  if (!decoded || /[\u0000-\u0008]/.test(decoded)) return null;
  if (!/^[\u0009\u000a\u000d\u0020-\u007e\u00a0-\u024f\u0600-\u06ff\u0900-\u097f]+$/.test(decoded)) return null;
  const round = Buffer.from(decoded, 'utf8').toString('base64').replace(/=+$/, '');
  const input = original.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (round !== input) return null;
  return decoded;
}

function codePointChar(value) {
  const code = Number(value);
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  if (code < 32 && code !== 9 && code !== 10 && code !== 13) return '';
  try { return String.fromCodePoint(code); } catch (_) { return ''; }
}

const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

function decodeClientMarkup(text) {
  let s = String(text == null ? '' : text);
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&#(\d+);/g, (_, n) => codePointChar(n));
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, n) => codePointChar(parseInt(n, 16)));
  s = s.replace(/&([a-z]+);/gi, (m, name) => {
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : m;
  });
  s = s.replace(/&#(\d+);/g, (_, n) => codePointChar(n));
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, n) => codePointChar(parseInt(n, 16)));
  return s;
}

function acceptValue(label, token, explicitSep, hadCopula) {
  const value = cleanToken(token);
  if (!value || value.length > 128) return null;
  const lower = value.toLowerCase();
  if (STOP.has(lower)) return null;
  // A bare label plus an ordinary word ("password reset") is not a secret.
  // A copula, a separator, or a shaped token is required.
  if (!explicitSep && !hadCopula && !isShaped(value)) return null;
  if (String(label || '').toLowerCase() === 'pass' && !explicitSep && !hadCopula && !isShaped(value)) return null;
  return value;
}

/**
 * Secrets introduced by a credential label. Values are taken after a copula,
 * so "mera password hai X" captures X.
 * @returns {{value: string, label: string}[]}
 */
function extractSecrets(text) {
  const prepared = prepare(decodeClientMarkup(text));
  const folded = leetFold(prepared);
  const found = [];
  const seen = new Set();
  LABEL_RE.lastIndex = 0;
  let match;
  while ((match = LABEL_RE.exec(folded))) {
    const label = String(match[1] || '');
    const sep = String(match[2] || '') + String(match[3] || '');
    const explicitSep = /[:=]/.test(sep);
    const hadCopula = !!match[3];
    let cursor = match.index + match[0].length;
    let token = readValueToken(prepared, cursor);
    if (token && !explicitSep && STOP.has(token.raw.toLowerCase())) {
      cursor = token.end;
      token = readValueToken(prepared, cursor);
    }
    if (!token) {
      if (match.index === LABEL_RE.lastIndex) LABEL_RE.lastIndex += 1;
      continue;
    }
    const value = acceptValue(label, token.raw, explicitSep, hadCopula);
    if (value && !seen.has(value)) {
      seen.add(value);
      found.push({ value, label });
      const decoded = tryBase64(value);
      if (decoded) {
        for (const inner of extractSecrets(decoded)) {
          if (!seen.has(inner.value)) {
            seen.add(inner.value);
            found.push(inner);
          }
        }
        if (!seen.has(decoded) && decoded.length >= 4 && decoded !== value) {
          seen.add(decoded);
          found.push({ value: decoded, label: 'base64' });
        }
      }
    }
    if (match.index === LABEL_RE.lastIndex) LABEL_RE.lastIndex += 1;
  }
  return found;
}

function tokenMatches(token, secret) {
  const needle = normalizeForMatch(secret);
  if (!needle) return false;
  const forms = [normalizeForMatch(token), normalizeForMatch(cleanToken(token))];
  const needles = [needle, normalizeForMatch(cleanToken(secret))];
  for (const form of forms) {
    if (!form) continue;
    for (const item of needles) {
      if (!item) continue;
      if (form.toLowerCase() === item.toLowerCase()) return true;
      if (item.length >= 4 && form.length >= 4 && leetFold(form).toLowerCase() === leetFold(item).toLowerCase()) {
        return true;
      }
    }
  }
  return false;
}

function rejoinedRuns(prepared) {
  const parts = String(prepared || '').split(/\s+/);
  const runs = [];
  let buf = [];
  function flush() {
    if (buf.length >= 3) runs.push(buf.join(''));
    buf = [];
  }
  for (const part of parts) {
    const token = cleanToken(part);
    if (token && [...token].length === 1 && /[\p{L}\p{N}]/u.test(token)) buf.push(token);
    else flush();
  }
  flush();
  return runs;
}

function keyMaterialValues(text) {
  const source = String(text || '');
  const found = [];
  for (const value of source.match(/\bsk-[A-Za-z0-9_-]{16,}/g) || []) {
    if (!found.includes(value)) found.push(value);
  }
  for (const value of source.match(/\bBearer\s+[A-Za-z0-9._-]{16,}/gi) || []) {
    if (value && !found.includes(value)) found.push(value);
  }
  return found;
}

function hasKeyMaterial(text) {
  return keyMaterialValues(text).length > 0;
}

function containsSecret(haystack, secret, depth) {
  const needle = normalizeForMatch(secret);
  if (!needle || typeof haystack !== 'string') return false;
  const limit = depth == null ? 2 : depth;
  if (limit < 0) return false;
  const prepared = prepare(decodeClientMarkup(haystack));
  const parts = prepared.split(/\s+/);
  for (const part of parts) {
    if (!part) continue;
    if (tokenMatches(part, needle)) return true;
    const decoded = tryBase64(cleanToken(part), 8);
    if (!decoded) continue;
    const decodedNorm = normalizeForMatch(decoded).trim();
    if (decodedNorm.toLowerCase() === needle.toLowerCase()) return true;
    if (decoded !== haystack && containsSecret(decoded, secret, limit - 1)) return true;
  }
  if (needle.length >= 4) {
    for (const run of rejoinedRuns(prepared)) {
      if (tokenMatches(run, needle)) return true;
    }
  }
  return false;
}

function clientTextsFrom(history) {
  const out = [];
  for (const item of history || []) {
    if (item == null) continue;
    if (typeof item === 'string') {
      out.push(item);
      continue;
    }
    const role = String(item.role || (item.author && item.author.type) || '');
    if (role && !/user|lead|client|customer/i.test(role)) continue;
    out.push(String(item.text || item.body || ''));
  }
  return out;
}

function rememberValues(conversationId, values) {
  const id = String(conversationId || '');
  if (!id) return;
  const bag = secretsByConversation.get(id) || [];
  for (const value of values) {
    if (typeof value === 'string' && value && !bag.includes(value)) bag.push(value);
  }
  secretsByConversation.set(id, bag);
}

function rememberClientText(conversationId, text) {
  const decoded = decodeClientMarkup(text);
  const id = String(conversationId || '');
  rememberValues(id, extractSecrets(decoded).map((hit) => hit.value).concat(keyMaterialValues(decoded)));
  if (id) lastAskByConversation.set(id, decoded);
}

function rememberClientParts(conversationId, parts) {
  for (const part of parts || []) {
    if (!part) continue;
    const role = String(part.role || (part.author && part.author.type) || '');
    if (role && !/user|lead|client|customer/i.test(role)) continue;
    rememberClientText(conversationId, part.body || part.text || '');
  }
}

function secretsFor(conversationId) {
  return (secretsByConversation.get(String(conversationId || '')) || []).slice();
}

function resetStore() {
  secretsByConversation.clear();
  lastAskByConversation.clear();
  opQueue.length = 0;
}

function addSecret(values, value) {
  if (typeof value !== 'string' || !value) return;
  if (!values.includes(value)) values.push(value);
}

function collectSecrets(input) {
  const values = [];
  for (const text of clientTextsFrom(input.history)) {
    for (const hit of extractSecrets(text)) addSecret(values, hit.value);
  }
  for (const text of input.clientTexts || []) {
    if (typeof text !== 'string') {
      const err = new Error('validation_error');
      err.code = 'validation_error';
      throw err;
    }
    for (const hit of extractSecrets(text)) addSecret(values, hit.value);
  }
  for (const value of input.knownSecrets || []) {
    if (typeof value !== 'string') {
      const err = new Error('validation_error');
      err.code = 'validation_error';
      throw err;
    }
    addSecret(values, value);
  }
  for (const value of secretsFor(input.conversationId)) addSecret(values, value);
  return values;
}

function latestClientAsk(ctx) {
  const texts = [];
  for (const text of clientTextsFrom(ctx.history)) texts.push(text);
  for (const text of ctx.clientTexts || []) {
    if (typeof text === 'string') texts.push(text);
  }
  if (typeof ctx.clientText === 'string') texts.push(ctx.clientText);
  if (texts.length) return texts[texts.length - 1];
  if (ctx.conversationId && lastAskByConversation.has(String(ctx.conversationId))) {
    return lastAskByConversation.get(String(ctx.conversationId)) || '';
  }
  return '';
}

function plainFromHtml(body) {
  return decodeClientMarkup(body)
    .replace(/&nbsp;/gi, ' ')
    .replace(/\r\n/g, '\n')
    .trim();
}

const GREET_PREFIX_RE = /^(?:Hello|Ciao|Salam)(?: [A-Za-zÀ-ÿ'-]+)?,\n\n|^السلام علیکم(?: [A-Za-zÀ-ÿ'-]+)?،\n\n/;

function templatePlain(body) {
  if (typeof body !== 'string') return '';
  if (body === SPREAD_TEST_REPLY) return body;
  return plainFromHtml(body);
}

function isExactSpreadTemplate(body) {
  return templatePlain(body) === SPREAD_TEST_REPLY;
}

function isDeliverableSpreadTemplate(body) {
  const plain = templatePlain(body);
  if (plain === SPREAD_TEST_REPLY) return true;
  const greet = GREET_PREFIX_RE.exec(plain);
  if (!greet) return false;
  return plain.slice(greet[0].length) === SPREAD_TEST_REPLY;
}

function eligibilityText(text) {
  return normalizeForMatch(decodeClientMarkup(text)).toLowerCase().replace(/\s+/g, ' ').trim();
}

function asksForSpreadTestAsset(t) {
  if (/\bspread[\s-]*test\s+(?:account|credentials|credential|login|password|details)\b/.test(t)) return true;
  if (/\b(?:account|credentials|credential|login) to check (?:the )?spreads\b/.test(t)) return true;
  if (/\bhow (?:do i|can i|to) check (?:the )?spreads\b/.test(t)) return true;
  if (/\bcheck (?:the )?spreads on (?:the )?(?:test account|spread[\s-]*test account)\b/.test(t)) return true;
  return false;
}

function isDirectSpreadTestRequest(t) {
  if (/\bhow (?:do i|can i|to) check (?:the )?spreads\b/.test(t)) return true;
  if (!asksForSpreadTestAsset(t)) return false;
  if (/[?]/.test(t) && /\b(?:can|could|would|will|may|how|what|where|please)\b/.test(t)) return true;
  if (/\b(?:please\s+)?(?:send|give|share|provide|show)\b/.test(t)) return true;
  if (/\b(?:can you|could you|would you|will you|can i|could i|may i)\b/.test(t)) return true;
  return false;
}

function isExplicitSpreadTestRequest(text) {
  const t = eligibilityText(text);
  if (!t) return false;
  if (/\bspread some light\b/.test(t)) return false;
  if (/\bproblem spread\b/.test(t)) return false;
  if (/\brisk spread\b/.test(t)) return false;
  if (/\bspreadsheet\b/.test(t) || /\bspread sheet\b/.test(t)) return false;
  if (/\bspread of (?:a |the )?(?:rumor|rumour)\b/.test(t)) return false;
  if (/\b(?:payouts?|withdrawn|withdrawal|withdraw)\b/.test(t)) return false;
  if (/\bno need\b/.test(t)) return false;
  if (/\b(?:cannot|can not)\b/.test(t)) return false;
  if (/\bcan't\b/.test(t) && !/\bcan't you\b/.test(t)) return false;
  if (/\bdon'?t want\b/.test(t) || /\bdo not want\b/.test(t) || /\bdont want\b/.test(t)) return false;
  if (/\b(?:do not|don't|dont)\s+(?:send|give|share|provide|show|check)\b/.test(t)) return false;
  if (/\bwhat(?:'s| is) (?:a|the) spread test\b/.test(t)) return false;
  if (/\b(?:the )?test failed\b/.test(t)) return false;
  if (/\bi was testing\b/.test(t)) return false;
  if (/\bi already test(?:ed|ing)?\b/.test(t)) return false;
  if (/\bi(?:'m| am| was) testing\b/.test(t)) return false;
  if (/\bi checked\b/.test(t)) return false;
  if (/\bi check\b/.test(t) && !/\b(?:can|could|may|how do|how can) i check\b/.test(t)) return false;
  if (isDirectSpreadTestRequest(t)) return true;
  if (/\bspread check karo\b/.test(t) || /\bspread test karo\b/.test(t)) return true;
  if (/\bcheck karo (?:the |your |our |my )?spreads\b/.test(t)) return true;
  if (/स्प्रेड\s+(?:चेक|टेस्ट|जांच|जाँच)/.test(t)) return true;
  if (/سپریڈ\s+(?:چیک|ٹیسٹ|جانچ)/.test(t)) return true;
  if (/(?:تحقق|افحص|اختبر|فحص)\s+(?:ال)?سبريد/.test(t)) return true;
  return false;
}

function replaceSplitRun(text, secret) {
  const needle = normalizeForMatch(secret);
  if (!needle || [...needle].length < 4) return String(text);
  const pattern = [...needle].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const re = new RegExp('(^|\\s)(' + pattern + ')(?=\\s|$)', 'giu');
  return String(text).replace(re, (full, lead) => lead + '[secret]');
}

function flexReplace(text, secret) {
  const needle = normalizeForMatch(secret);
  if (!needle) return String(text);
  return String(text).replace(/\S+/g, (token) => {
    if (tokenMatches(token, needle)) return '[secret]';
    const decoded = tryBase64(cleanToken(normalizeForMatch(token)), 8);
    if (!decoded) return token;
    const decodedNorm = normalizeForMatch(decoded).trim();
    if (decodedNorm.toLowerCase() === needle.toLowerCase()) return '[secret]';
    if (tokenMatches(decodedNorm, needle)) return '[secret]';
    return token;
  });
}

function redactText(text, extraSecrets) {
  let out = String(text == null ? '' : text);
  out = out.replace(/\bsk-[A-Za-z0-9_-]{16,}/g, '[secret]');
  out = out.replace(/\bBearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer [secret]');
  const values = extractSecrets(out).map((hit) => hit.value).concat(extraSecrets || [], [TEMPLATE_PASSWORD]);
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || !value || seen.has(value)) continue;
    seen.add(value);
    out = flexReplace(out, value);
    out = replaceSplitRun(out, value);
  }
  return out;
}

function redactForConversation(conversationId, text) {
  return redactText(decodeClientMarkup(text), secretsFor(conversationId));
}

function redactTurnMeta(meta) {
  const source = meta || {};
  const fromClient = extractSecrets(source.clientText || '').map((hit) => hit.value);
  const copy = {};
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (typeof value !== 'string') {
      copy[key] = value;
      continue;
    }
    let next = redactText(value, fromClient);
    const residual = fromClient.some((item) => containsSecret(next, item))
      || extractSecrets(next).some((hit) => containsSecret(next, hit.value));
    copy[key] = residual ? '[redacted]' : next;
  }
  return copy;
}

function redactDiagnostic(value, depth) {
  const level = depth == null ? 0 : depth;
  if (level > 4) return '[redacted]';
  if (value == null) return null;
  if (typeof value === 'string') {
    const next = redactText(value);
    if (extractSecrets(value).some((hit) => containsSecret(next, hit.value))) return '[redacted]';
    return next;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value !== 'object') return '[redacted]';
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => redactDiagnostic(item, level + 1));
  const out = {};
  for (const key of Object.keys(value)) {
    if (DIAGNOSTIC_DROP.has(key)) continue;
    out[key] = redactDiagnostic(value[key], level + 1);
  }
  return out;
}

function baseResult() {
  return {
    version: STATUS.candidate,
    frozen: true,
    approved: false,
    release: false,
    wired: false,
    silent: false,
  };
}

function blocked(reason) {
  return Object.assign(baseResult(), {
    action: 'block',
    reason: reason,
    post: false,
    posted: false,
    blocked: true,
    body: null,
    diagnostic: { reason: reason },
  });
}

function allowed(reason, body, secretsChecked) {
  return Object.assign(baseResult(), {
    action: 'allow',
    reason: reason,
    post: true,
    posted: false,
    blocked: false,
    body: body,
    secretsChecked: secretsChecked,
    diagnostic: { reason: reason },
  });
}

function sameToken(left, right) {
  return normalizeForMatch(left).toLowerCase() === normalizeForMatch(right).toLowerCase();
}

function watchList(secrets, draftHits) {
  const values = secrets.slice();
  for (const value of draftHits) addSecret(values, value);
  if (!values.some((value) => sameToken(value, TEMPLATE_PASSWORD))) values.push(TEMPLATE_PASSWORD);
  return values;
}

function stillHas(text, secrets) {
  return secrets.some((value) => containsSecret(text, value));
}

function finishDecision(result, eligible) {
  result.spreadEligible = !!eligible;
  return result;
}

function decide(ctx) {
  if (typeof ctx.body !== 'string') return blocked('non_string');
  const body = ctx.body;
  const messageType = String(ctx.messageType || 'comment');
  const secrets = collectSecrets(ctx);
  const eligible = isExplicitSpreadTestRequest(latestClientAsk(ctx));
  const deliverable = isDeliverableSpreadTemplate(body);
  if (deliverable && eligible) {
    const others = secrets.filter((value) => !sameToken(value, TEMPLATE_PASSWORD));
    if (stillHas(body, others)) return finishDecision(blocked('residual_secret'), eligible);
    return finishDecision(allowed('spread_template', body, secrets.length), eligible);
  }
  if (deliverable && !eligible) return finishDecision(blocked('spread_not_eligible'), eligible);

  const keys = messageType === 'note' ? [] : keyMaterialValues(body);
  const draftHits = extractSecrets(body)
    .map((hit) => hit.value)
    .concat(keys)
    .filter((value) => !sameToken(value, TEMPLATE_PASSWORD));
  const watch = watchList(secrets, draftHits.concat(keyMaterialValues(body)));
  const echoed = secrets.some((value) => containsSecret(body, value));
  const introduced = draftHits.some((value) => containsSecret(body, value) || keys.includes(value));
  const templateHit = containsSecret(body, TEMPLATE_PASSWORD);
  const keyHit = keyMaterialValues(body).length > 0;
  if (!echoed && !introduced && !templateHit && !keyHit) {
    return finishDecision(allowed('clean', body, secrets.length), eligible);
  }

  let reason = 'draft_secret';
  if (keyHit && !echoed && !templateHit) reason = 'key_material';
  else if (templateHit && !echoed) reason = 'template_password';
  else if (echoed) reason = 'history_echo';

  if (messageType === 'note') {
    const redacted = redactText(body, watch);
    if (stillHas(redacted, watch) || hasKeyMaterial(redacted)) return finishDecision(blocked('residual_secret'), eligible);
    return finishDecision(Object.assign(baseResult(), {
      action: 'redact',
      reason: reason,
      post: true,
      posted: false,
      blocked: false,
      body: redacted,
      secretsChecked: secrets.length,
      diagnostic: { reason: 'redact' },
    }), eligible);
  }

  if (stillHas(FIXED_MESSAGE, watch) || hasKeyMaterial(FIXED_MESSAGE)) {
    return finishDecision(blocked('unsanitizable'), eligible);
  }
  return finishDecision(Object.assign(baseResult(), {
    action: 'fixed_message',
    reason: reason,
    post: true,
    posted: false,
    blocked: false,
    body: FIXED_MESSAGE,
    secretsChecked: secrets.length,
    diagnostic: { reason: reason },
  }), eligible);
}

function guardSend(input) {
  try {
    return decide(input || {});
  } catch (_) {
    return blocked('validation_error');
  }
}

function conversationIdFromUrl(url) {
  const match = /conversations\/([^/?#]+)/.exec(String(url || ''));
  return match ? match[1] : '';
}

function guardOutboundWrite(url, data) {
  try {
    if (!data || typeof data !== 'object' || !Object.prototype.hasOwnProperty.call(data, 'body')) {
      return { post: true, blocked: false, posted: false, data: data, reason: 'no_public_body', diagnostic: { reason: 'no_public_body' } };
    }
    const decision = guardSend({
      conversationId: conversationIdFromUrl(url),
      messageType: String(data.message_type || '') === 'note' ? 'note' : 'comment',
      body: data.body,
    });
    if (!decision.post || decision.body !== data.body) {
      const reason = decision.post ? 'unsanitizable' : decision.reason;
      return {
        post: false,
        blocked: true,
        posted: false,
        data: null,
        reason: reason,
        spreadEligible: !!decision.spreadEligible,
        diagnostic: { reason: reason },
      };
    }
    return {
      post: true,
      blocked: false,
      posted: false,
      data: data,
      reason: decision.reason,
      spreadEligible: !!decision.spreadEligible,
      diagnostic: { reason: decision.reason },
    };
  } catch (_) {
    return { post: false, blocked: true, posted: false, data: null, reason: 'validation_error', diagnostic: { reason: 'validation_error' } };
  }
}

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function enqueuePublicOp(input) {
  const ctx = input || {};
  const decision = guardSend(ctx);
  if (!decision.post || decision.action !== 'allow' || decision.body !== ctx.body) {
    return {
      ok: false,
      queued: false,
      posted: false,
      post: false,
      blocked: true,
      reason: decision.reason || 'blocked',
      diagnostic: { reason: decision.reason || 'blocked' },
    };
  }
  const rec = {
    id: 'op-' + (opQueue.length + 1),
    conversationId: String(ctx.conversationId || ''),
    messageType: String(ctx.messageType || 'comment'),
    body: decision.body,
  };
  opQueue.push(rec);
  return {
    ok: true,
    queued: true,
    posted: false,
    post: false,
    blocked: false,
    id: rec.id,
    reason: 'queued',
    diagnostic: { reason: 'queued' },
  };
}

function restoreQueuedOp(record) {
  const src = record || {};
  opQueue.push({
    id: String(src.id || ('op-restored-' + (opQueue.length + 1))),
    conversationId: String(src.conversationId || ''),
    messageType: String(src.messageType || 'comment'),
    body: src.body,
  });
  return { restored: true, posted: false, id: opQueue[opQueue.length - 1].id };
}

function inspectQueue() {
  return opQueue.map((op) => ({
    id: op.id,
    bytes: typeof op.body === 'string' ? op.body.length : -1,
  }));
}

function flushQueue(transport) {
  const posted = [];
  const blockedItems = [];
  const pending = opQueue.splice(0);
  const deliver = transport && typeof transport.record === 'function'
    ? transport.record.bind(transport)
    : null;
  for (const op of pending) {
    const decision = guardSend({
      conversationId: op.conversationId,
      messageType: op.messageType,
      body: op.body,
    });
    if (!decision.post || decision.action !== 'allow' || decision.body !== op.body) {
      blockedItems.push({ id: op.id, reason: decision.reason || 'blocked', posted: false });
      continue;
    }
    const payload = {
      conversationId: op.conversationId,
      messageType: op.messageType,
      body: decision.body,
    };
    if (deliver) deliver(snapshot(payload));
    posted.push(snapshot(payload));
  }
  return { posted: posted, blocked: blockedItems };
}

function carriesCustomerText(data) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.body === 'string' && data.body.trim()) return true;
  if (typeof data.text === 'string' && data.text.trim()) return true;
  if (typeof data.clientText === 'string' && data.clientText.trim()) return true;
  return false;
}

function createRecordingTransport() {
  const records = [];
  function push(entry) {
    records.push(snapshot(entry));
    return { ok: true, posted: true };
  }
  return {
    records: records,
    postReply(conversationId, messageType, body) {
      return push({ via: 'postReply', conversationId: conversationId, messageType: messageType, body: body });
    },
    postClientCommentOnce(conversationId, body, userPart, clientName) {
      return push({
        via: 'postClientCommentOnce',
        conversationId: conversationId,
        body: body,
        userPart: userPart || null,
        clientName: clientName || '',
      });
    },
    record(payload) {
      return push(payload);
    },
  };
}

function closedChokeResult() {
  return {
    ok: false,
    blocked: true,
    posted: false,
    post: false,
    reason: 'validation_error',
    body: null,
    diagnostic: { reason: 'validation_error' },
  };
}

function chokeResult(decision) {
  if (!decision || !decision.post) {
    return {
      ok: false,
      blocked: true,
      posted: false,
      post: false,
      reason: decision && decision.reason ? decision.reason : 'blocked',
      body: null,
      diagnostic: { reason: decision && decision.reason ? decision.reason : 'blocked' },
    };
  }
  return null;
}

function createChoke(raw) {
  const post = raw && raw.postReply;
  const once = raw && raw.postClientCommentOnce;
  if (typeof post !== 'function' || typeof once !== 'function') {
    throw new Error('createChoke requires postReply and postClientCommentOnce');
  }
  return {
    postReply(conversationId, messageType, body, guardCtx) {
      let decision;
      try {
        decision = guardSend(Object.assign({ conversationId: conversationId, messageType: messageType, body: body }, guardCtx || {}));
      } catch (_) {
        return closedChokeResult();
      }
      const held = chokeResult(decision);
      if (held) return held;
      return post(conversationId, messageType, decision.body, guardCtx);
    },
    postClientCommentOnce(conversationId, body, userPart, clientName, guardCtx) {
      let decision;
      try {
        const ctx = guardCtx || {};
        if (ctx.parts) rememberClientParts(conversationId, ctx.parts);
        if (userPart) rememberClientParts(conversationId, [userPart]);
        const clientTexts = Array.isArray(ctx.clientTexts) ? ctx.clientTexts.slice() : [];
        if (userPart) clientTexts.push(String(userPart.body || userPart.text || ''));
        decision = guardSend({
          conversationId: conversationId,
          messageType: 'comment',
          body: body,
          history: ctx.history,
          clientTexts: clientTexts,
          clientText: ctx.clientText,
        });
      } catch (_) {
        return closedChokeResult();
      }
      const held = chokeResult(decision);
      if (held) return held;
      return once(conversationId, decision.body, userPart, clientName, guardCtx || {});
    },
  };
}

module.exports = {
  STATUS,
  FIXED_MESSAGE,
  SPREAD_TEST_REPLY,
  TEMPLATE_PASSWORD,
  normalizeForMatch,
  prepare,
  extractSecrets,
  containsSecret,
  rememberClientText,
  rememberClientParts,
  secretsFor,
  resetStore,
  redactText,
  redactForConversation,
  redactTurnMeta,
  redactDiagnostic,
  isExplicitSpreadTestRequest,
  isExactSpreadTemplate,
  isDeliverableSpreadTemplate,
  carriesCustomerText,
  guardSend,
  guardOutboundWrite,
  enqueuePublicOp,
  restoreQueuedOp,
  inspectQueue,
  flushQueue,
  createRecordingTransport,
  createChoke,
};
