'use strict';

/**
 * Credential guard R10 — frozen staging candidate.
 *
 * Builds on the R9 staging module. The R9 review case file was not read
 * and its 181 cases were not replayed. Not wired into index.js,
 * statePresend, or the maintainer. approved is false until a different
 * agent reviews it.
 *
 * system-prompt.txt is protected. It contains the owner-authorized public
 * 55188 spread-test template. That disclosure is accepted. No other secret
 * may be added to the system-prompt path. This module does not read or
 * edit that file.
 *
 * The fixed client message follows the existing credentials rule: do not
 * repeat a pasted secret, tell the client to change it immediately, and
 * escalate it as a security event. It states no account, payout, or lock
 * outcome.
 */

const crypto = require('crypto');

const STATUS = Object.freeze({
  candidate: 'credential-guard-r10',
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

const MIN_VALUE_LENGTH = 4;
const SHORT_VALUE_LENGTH = 1;
const EXTRACT_MAX_DEPTH = 3;
const EXTRACT_MAX_MATCHES = 64;
const EXTRACT_MAX_DECODE = 2048;
const EXTRACT_MAX_MS = 200;
const GUARD_BUDGET_MS = 200;
const MAX_SCAN = 90000;

/**
 * Owner-authorized disclosure. The protected system prompt contains the
 * public 55188 template. Exact-file bytes pass through. Anything appended
 * is scrubbed of every other secret.
 */
const AUTHORIZED_PROMPT_DISCLOSURE = Object.freeze({
  path: 'system-prompt.txt',
  sha256: 'bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d',
  length: 77282,
  account: '55188',
  kind: 'owner-authorized-public-template',
});

const SHORT_LABELS = new Set(['password', 'passwd', 'passcode', 'pwd', 'pass', 'otp', 'pin', '2fa', 'mfa']);
const FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'my', 'your', 'mera', 'meri', 'apna', 'this', 'that', 'it', 'to', 'on',
  'in', 'and', 'or', 'please', 'challenge', 'phase', 'evaluation', 'for', 'of',
  'me', 'you', 'hai', 'hain', 'he', 'ho', 'is', 'was', 'spreads', 'spread',
  'instructions', 'site', 'here', 'now', 'help', 'update', 'status', 'review',
  'email', 'login', 'number', 'account', 'true', 'false', 'none', 'null', 'secret',
]);

const HOMO = {
  '\u0410': 'A', '\u0412': 'B', '\u0415': 'E', '\u041a': 'K', '\u041c': 'M', '\u041d': 'H',
  '\u041e': 'O', '\u0420': 'P', '\u0421': 'C', '\u0422': 'T', '\u0425': 'X',
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c', '\u0443': 'y', '\u0445': 'x',
  '\u0456': 'i', '\u0455': 's',
  '\u0391': 'A', '\u0392': 'B', '\u0395': 'E', '\u0396': 'Z', '\u0397': 'H', '\u0399': 'I',
  '\u039a': 'K', '\u039c': 'M', '\u039d': 'N', '\u039f': 'O', '\u03a1': 'P', '\u03a4': 'T', '\u03a7': 'X',
  '\u03b1': 'a', '\u03bf': 'o', '\u03c1': 'p',
  '\u0624': '\u0648', '\u0623': '\u0627', '\u0625': '\u0627', '\u0622': '\u0627',
};

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

const STOP = new Set([
  'the', 'a', 'an', 'my', 'your', 'mera', 'meri', 'apna', 'this', 'that', 'it', 'to', 'on',
  'in', 'and', 'or', 'please', 'challenge', 'phase', 'evaluation', 'account', 'for', 'of',
  'me', 'you', 'hai', 'hain', 'he', 'ho', 'is', 'was', 'spreads', 'spread',
  'reset', 'resets', 'password', 'passwd', 'passcode', 'pwd', 'pass', 'pin', 'otp',
  'code', 'login', 'email', 'update', 'status', 'review', 'help', 'secret', 'number',
  'here', 'now', 'instructions', 'site', 'true', 'false', 'none', 'null',
]);

const LABEL_SRC = [
  'api[_\\s-]*key', 'apikey', 'bearer', 'token', 'secret',
  'password', 'passwd', 'passcode', 'pwd', 'pass', 'otp', 'pin', '2fa', 'mfa',
  'پاسورڈ', 'پاس\\s*ورڈ', 'كلمة\\s+المرور', 'كلمة\\s+السر', 'الباسورد', 'باسورد', 'पासवर्ड', 'पास\\s*वर्ड',
].join('|');

const COPULA_SRC = 'hain|hai|he|ho|is|was|है|ہے|هي|هو';

function makeLabelRe() {
  return new RegExp(
    '(?:^|[^\\p{L}\\p{N}])((?:' + LABEL_SRC + '))(?=$|[^\\p{L}\\p{N}])([\\s:=\\-]*)(?:(' + COPULA_SRC + ')(?=$|[^\\p{L}\\p{N}])[\\s:=\\-]*)?',
    'giu'
  );
}

const SHORT_UNIT = /^[\p{L}\p{N}$@#%&*^!?+/=._-]+$/u;

const DIAGNOSTIC_DROP = new Set([
  'body', 'draft', 'clientText', 'clienttext', 'raw', 'password', 'secret', 'secrets',
  'data', 'message', 'stack', 'text', 'payload', 'html', 'error', 'err',
]);

const secretsByConversation = new Map();
const lastAskByConversation = new Map();
const decisionsByKey = new Map();
const opQueue = [];

function normalizeForMatch(text) {
  let s = String(text == null ? '' : text).normalize('NFKC');
  // Format and zero-width characters are removed as separators so they cannot hide a
  // label or glue it to the next word.
  s = s.replace(/\p{Cf}/gu, ' ');
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
  return String(raw || '').replace(/^['"`([{]+|['"`)\]}.,;]+$/g, '');
}

function readToken(text, index) {
  const m = /^\s*(\S+)/.exec(String(text || '').slice(index));
  if (!m) return null;
  const raw = cleanToken(m[1]);
  if (!raw) return null;
  return { raw, end: index + m[0].length };
}

function isShortUnit(token) {
  if (!token || FUNCTION_WORDS.has(token.toLowerCase())) return false;
  if (!SHORT_UNIT.test(token)) return false;
  if (/[^\p{L}]/u.test(token)) return true;
  if ([...token].length <= 4) return true;
  if (/[A-Z]/.test(token) && /[a-z]/.test(token)) return true;
  return false;
}

function readValueToken(text, index) {
  const rest = String(text || '').slice(index);
  const tokenRe = /\s*(\S+)/g;
  const parts = [];
  let end = 0;
  let match;
  while ((match = tokenRe.exec(rest))) {
    const raw = cleanToken(match[1]);
    if (!isShortUnit(raw)) break;
    parts.push(raw);
    end = match.index + match[0].length;
    if (parts.length >= 12) break;
  }
  if (parts.length >= 2) {
    const joined = parts.join('');
    if ([...joined].length >= SHORT_VALUE_LENGTH && !FUNCTION_WORDS.has(joined.toLowerCase())) {
      return { raw: joined, end: index + end };
    }
  }
  return readToken(text, index);
}

function collapseShortRun(value) {
  const parts = String(value || '').trim().split(/\s+/).map(cleanToken).filter(Boolean);
  if (parts.length < 2) return cleanToken(value);
  if (!parts.every(isShortUnit)) return cleanToken(value);
  const joined = parts.join('');
  if ([...joined].length >= SHORT_VALUE_LENGTH && !FUNCTION_WORDS.has(joined.toLowerCase())) return joined;
  return cleanToken(value);
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

function decodeEntities(text) {
  let s = String(text == null ? '' : text);
  s = s.replace(/&#(\d+);/g, (_, n) => codePointChar(n));
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, n) => codePointChar(parseInt(n, 16)));
  s = s.replace(/&([a-z]+);/gi, (whole, name) => {
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : whole;
  });
  s = s.replace(/&#(\d+);/g, (_, n) => codePointChar(n));
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, n) => codePointChar(parseInt(n, 16)));
  return s;
}

function decodeEntitiesRepeat(text, budget) {
  let s = String(text == null ? '' : text);
  assertScanSize(s);
  for (let i = 0; i < 6; i++) {
    checkBudget(budget);
    const next = decodeEntities(s);
    if (next === s) return s;
    s = next;
    assertScanSize(s);
  }
  return s;
}

function decodeClientMarkup(text, budget) {
  const raw = String(text == null ? '' : text);
  assertScanSize(raw);
  checkBudget(budget);
  let out = '';
  let i = 0;
  while (i < raw.length) {
    if ((i & 8191) === 0) checkBudget(budget);
    const lt = raw.indexOf('<', i);
    if (lt < 0) {
      out += raw.slice(i);
      break;
    }
    out += raw.slice(i, lt);
    if (raw.startsWith('<!--', lt)) {
      const end = raw.indexOf('-->', lt + 4);
      if (end < 0) throw boundsError();
      i = end + 3;
      continue;
    }
    const gt = raw.indexOf('>', lt + 1);
    if (gt < 0 || gt - lt > 400) throw boundsError();
    const tag = raw.slice(lt + 1, gt);
    if (/^br\b/i.test(tag) || /^\/p\b/i.test(tag)) out += '\n';
    i = gt + 1;
  }
  return decodeEntitiesRepeat(out, budget);
}

function acceptValue(label, token, explicitSep, hadCopula) {
  const value = collapseShortRun(token);
  const labeledShort = (explicitSep || hadCopula) && SHORT_LABELS.has(String(label || '').toLowerCase());
  const minLength = labeledShort ? SHORT_VALUE_LENGTH : MIN_VALUE_LENGTH;
  if (!value || [...value].length < minLength || [...value].length > 128) return null;
  if (value === '[secret]') return null;
  const lower = value.toLowerCase();
  if (FUNCTION_WORDS.has(lower)) return null;
  const family = String(label || '').toLowerCase().replace(/[\s_-]+/g, '');
  const keyFamily = family === 'apikey' || family === 'token' || family === 'secret' || family === 'bearer';
  if (keyFamily) {
    const strong = explicitSep || isShaped(value) || /^sk-/i.test(value) || [...value].length >= 8;
    if (!strong || (hadCopula && !explicitSep && !isShaped(value) && !/^sk-/i.test(value))) return null;
  }
  // A bare label plus an ordinary word ("password reset instructions") is not a secret.
  // A copula, a separator, or a shaped token is required. Labeled pin, pwd, otp,
  // and password values, including a short reset value, are secrets.
  if (!explicitSep && !hadCopula && !isShaped(value)) return null;
  if (String(label || '').toLowerCase() === 'pass' && !explicitSep && !hadCopula && !isShaped(value)) return null;
  return value;
}

function pushHit(found, seen, hit) {
  if (!hit || typeof hit.value !== 'string' || !hit.value || seen.has(hit.value)) return;
  seen.add(hit.value);
  found.push(hit);
}

/**
 * Labeled secrets in already-plain text. "mera password hai Hunt9" captures Hunt9.
 * @returns {{value: string, label: string}[]}
 */
function boundsError() {
  const err = new Error('bounds');
  err.code = 'bounds';
  return err;
}

function extractionBudget() {
  const now = Date.now();
  return { depth: 0, matches: 0, started: now, deadline: now + GUARD_BUDGET_MS };
}

function checkBudget(budget) {
  if (budget && budget.deadline && Date.now() > budget.deadline) throw boundsError();
}

function assertScanSize(text) {
  if (String(text == null ? '' : text).length > MAX_SCAN) throw boundsError();
}

function extractFromPlain(text, budget) {
  const state = budget || extractionBudget();
  if (state.depth > EXTRACT_MAX_DEPTH) throw boundsError();
  checkBudget(state);
  if (Date.now() - state.started > EXTRACT_MAX_MS) throw boundsError();
  assertScanSize(text);
  const prepared = prepare(text);
  const folded = leetFold(prepared);
  const found = [];
  const seen = new Set();
  const labelRe = makeLabelRe();
  let match;
  while ((match = labelRe.exec(folded))) {
    state.matches += 1;
    if (state.matches > EXTRACT_MAX_MATCHES) throw boundsError();
    if (Date.now() - state.started > EXTRACT_MAX_MS) throw boundsError();
    const label = String(match[1] || '');
    const sep = String(match[2] || '') + String(match[3] || '');
    const explicitSep = /[:=]/.test(sep);
    const hadCopula = !!match[3];
    let cursor = match.index + match[0].length;
    let token = readValueToken(prepared, cursor);
    if (token && !explicitSep && FUNCTION_WORDS.has(token.raw.toLowerCase())) {
      cursor = token.end;
      token = readValueToken(prepared, cursor);
    }
    if (!token) {
      if (match.index === labelRe.lastIndex) labelRe.lastIndex += 1;
      continue;
    }
    const value = acceptValue(label, token.raw, explicitSep, hadCopula);
    if (value) {
      pushHit(found, seen, { value, label });
      const decoded = tryBase64(value);
      if (decoded) {
        if (decoded.length > EXTRACT_MAX_DECODE) throw boundsError();
        state.depth += 1;
        try {
          for (const inner of extractFromPlain(decoded, state)) pushHit(found, seen, inner);
        } finally {
          state.depth -= 1;
        }
        if (decoded.length >= SHORT_VALUE_LENGTH && decoded !== value && !FUNCTION_WORDS.has(decoded.toLowerCase())) {
          pushHit(found, seen, { value: decoded, label: 'base64' });
        }
      }
    }
    if (match.index === labelRe.lastIndex) labelRe.lastIndex += 1;
  }
  return found;
}

function harvestMarkup(raw, budget) {
  const hits = [];
  const source = String(raw || '');
  assertScanSize(source);
  let i = 0;
  while (i < source.length) {
    checkBudget(budget);
    const start = source.indexOf('<!--', i);
    if (start < 0) break;
    const end = source.indexOf('-->', start + 4);
    if (end < 0) throw boundsError();
    for (const hit of extractFromPlain(decodeClientMarkup(source.slice(start + 4, end), budget), budget)) hits.push(hit);
    i = end + 3;
  }
  let match;
  const attrRe = /(?:^|[\s<])((?:data-)?(?:password|passwd|passcode|pwd|pin|otp|secret|token))\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  while ((match = attrRe.exec(raw))) {
    const label = String(match[1] || '').replace(/^data-/i, '');
    const value = decodeEntities(match[2] || match[3] || match[4] || '');
    const accepted = acceptValue(label, value, true, true);
    if (accepted) hits.push({ value: accepted, label });
  }
  return hits;
}

/**
 * Secrets introduced by a credential label. HTML comments and attributes are
 * read before tags are stripped.
 * @returns {{value: string, label: string}[]}
 */
function expandDecoded(text, budget, depth) {
  const raw = String(text || '');
  assertScanSize(raw);
  if (depth > EXTRACT_MAX_DEPTH) return raw;
  checkBudget(budget);
  let extra = '';
  const re = /[A-Za-z0-9+/_-]{16,}={0,2}/g;
  let count = 0;
  let match;
  while ((match = re.exec(raw))) {
    count += 1;
    if (count > 6) break;
    checkBudget(budget);
    const decoded = tryBase64(match[0], 16);
    if (!decoded || decoded === match[0] || decoded.length > EXTRACT_MAX_DECODE) continue;
    extra += '\n' + expandDecoded(decodeEntitiesRepeat(decoded, budget), budget, depth + 1);
  }
  return extra ? raw + extra : raw;
}

function extractSecrets(text, budget) {
  const raw = String(text == null ? '' : text);
  assertScanSize(raw);
  const state = budget || extractionBudget();
  checkBudget(state);
  const found = [];
  const seen = new Set();
  for (const hit of harvestMarkup(raw, state)) pushHit(found, seen, hit);
  const plain = decodeClientMarkup(raw, state);
  for (const hit of extractFromPlain(plain, state)) pushHit(found, seen, hit);
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
      if (zwFlatten(form) === zwFlatten(item)) return true;
      if (embeddedAtBoundary(form, item)) return true;
      if (item.length >= MIN_VALUE_LENGTH && form.length >= MIN_VALUE_LENGTH) {
        const foldedForm = leetFold(form).toLowerCase();
        const foldedItem = leetFold(item).toLowerCase();
        if (foldedForm === foldedItem && !(STOP.has(foldedForm) && form.toLowerCase() !== item.toLowerCase())) {
          return true;
        }
      }
    }
  }
  return false;
}

function windowHasNeedle(prepared, needle) {
  const target = normalizeForMatch(needle);
  if (!target || [...target].length < SHORT_VALUE_LENGTH || [...target].length > 64) return false;
  const parts = String(prepared || '').split(/\s+/).map(cleanToken).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    let acc = '';
    for (let j = i; j < parts.length && (j - i) < 12; j++) {
      acc += parts[j];
      if ([...acc].length > [...target].length) break;
      if (tokenMatches(acc, target)) return true;
    }
  }
  return false;
}

function keySurface(text) {
  return String(text || '').normalize('NFKC').replace(/\p{Cf}/gu, '');
}

function zwFlatten(text) {
  return keySurface(text).replace(/\s+/g, '').toLowerCase();
}

function embeddableSecret(value) {
  const flat = zwFlatten(value);
  if (!flat || FUNCTION_WORDS.has(flat) || STOP.has(flat)) return false;
  if (flat.length >= 8) return true;
  if (/\d/.test(flat) && flat.length >= 4) return true;
  if (/[^\p{L}\p{N}]/u.test(flat) && flat.length >= 4) return true;
  return false;
}

function zwSurface(text) {
  return keySurface(text).toLowerCase();
}

function embeddedAtBoundary(haystack, secret) {
  const flat = zwSurface(haystack);
  const needle = zwFlatten(secret);
  if (!needle || !embeddableSecret(secret)) return false;
  const bound = (ch) => !ch || /[^\p{L}\p{N}]/u.test(ch);
  let from = 0;
  while (from <= flat.length - needle.length) {
    const at = flat.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : flat[at - 1];
    const after = at + needle.length >= flat.length ? '' : flat[at + needle.length];
    if (bound(before) && bound(after)) return true;
    from = at + 1;
  }
  return false;
}

function pushKey(found, seen, value) {
  if (!value || seen.has(value)) return;
  seen.add(value);
  found.push(value);
}

function keyMaterialValues(text) {
  const source = keySurface(text);
  assertScanSize(source);
  const found = [];
  const seen = new Set();
  const sk = /sk-[A-Za-z0-9_-]{8,}/gi;
  let match;
  while ((match = sk.exec(source))) pushKey(found, seen, match[0]);
  const families = [
    /api[\s_-]*key[\s:=\-_]*([A-Za-z0-9._~+/-]{8,})/gi,
    /apikey[\s:=\-_]*([A-Za-z0-9._~+/-]{8,})/gi,
    /bearer[\s:=\-_]*([A-Za-z0-9._~+/-]{12,})/gi,
    /(?:^|[^\p{L}\p{N}])token[\s:=\-_]+([A-Za-z0-9._~+/-]{12,})/giu,
    /(?:^|[^\p{L}\p{N}])secret[\s:=\-_]+([A-Za-z0-9._~+/-]{12,})/giu,
  ];
  for (const re of families) {
    while ((match = re.exec(source))) pushKey(found, seen, match[1] || match[0]);
  }
  return found;
}

function hasKeyMaterial(text) {
  return keyMaterialValues(text).length > 0;
}

function plainPieces(haystack, budget) {
  const raw = String(haystack || '');
  assertScanSize(raw);
  const pieces = [decodeClientMarkup(raw, budget)];
  let i = 0;
  while (i < raw.length) {
    const start = raw.indexOf('<!--', i);
    if (start < 0) break;
    const end = raw.indexOf('-->', start + 4);
    if (end < 0) throw boundsError();
    pieces.push(decodeClientMarkup(raw.slice(start + 4, end), budget));
    i = end + 3;
  }
  const attrRe = /(?:password|passwd|passcode|pwd|pin|otp|secret|token|api[\s_-]*key|apikey|bearer)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  let match;
  while ((match = attrRe.exec(raw))) pieces.push(decodeEntitiesRepeat(match[1] || match[2] || match[3] || '', budget));
  return pieces;
}

function scanPrepared(prepared, secret, depth) {
  const needle = normalizeForMatch(secret);
  if (!needle) return false;
  const parts = String(prepared || '').split(/\s+/);
  for (const part of parts) {
    if (!part) continue;
    if (tokenMatches(part, needle)) return true;
    const decoded = tryBase64(cleanToken(part), 8);
    if (!decoded) continue;
    const decodedNorm = normalizeForMatch(decoded).trim();
    if (decodedNorm.toLowerCase() === needle.toLowerCase()) return true;
    if (depth > 0 && containsSecret(decoded, secret, depth - 1)) return true;
  }
  if ([...needle].length >= SHORT_VALUE_LENGTH && windowHasNeedle(prepared, needle)) return true;
  return false;
}

function containsSecret(haystack, secret, depth) {
  const needle = normalizeForMatch(secret);
  if (!needle || typeof haystack !== 'string') return false;
  assertScanSize(haystack);
  if (zwFlatten(haystack) === zwFlatten(secret) || embeddedAtBoundary(haystack, secret)) return true;
  const limit = depth == null ? 2 : depth;
  if (limit < 0) return false;
  for (const piece of plainPieces(haystack)) {
    if (scanPrepared(prepare(piece), needle, limit)) return true;
    const expanded = expandDecoded(piece, extractionBudget(), 0);
    if (zwFlatten(expanded) === zwFlatten(secret) || embeddedAtBoundary(expanded, secret)) return true;
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
    if (typeof value === 'string' && value && !FUNCTION_WORDS.has(value.toLowerCase()) && value !== '[secret]' && !bag.includes(value)) {
      bag.push(value);
    }
  }
  secretsByConversation.set(id, bag);
}

function rememberClientText(conversationId, text) {
  const raw = String(text == null ? '' : text);
  const decoded = decodeClientMarkup(raw);
  const id = String(conversationId || '');
  rememberValues(id, extractSecrets(raw).map((hit) => hit.value).concat(keyMaterialValues(raw), keyMaterialValues(decoded)));
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
  decisionsByKey.clear();
  opQueue.length = 0;
}

function addSecret(values, value) {
  if (typeof value !== 'string' || !value) return;
  if (FUNCTION_WORDS.has(value.toLowerCase()) || value === '[secret]') return;
  if (!values.includes(value)) values.push(value);
}

function collectSecrets(input) {
  const values = [];
  for (const text of clientTextsFrom(input.history)) {
    for (const hit of extractSecrets(text)) addSecret(values, hit.value);
    for (const key of keyMaterialValues(text)) addSecret(values, key);
  }
  for (const text of input.clientTexts || []) {
    if (typeof text !== 'string') {
      const err = new Error('validation_error');
      err.code = 'validation_error';
      throw err;
    }
    for (const hit of extractSecrets(text)) addSecret(values, hit.value);
    for (const key of keyMaterialValues(text)) addSecret(values, key);
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
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
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

function whitespaceKey(text) {
  return normalizeForMatch(decodeClientMarkup(text)).replace(/\s+/g, ' ').trim();
}

function whitespaceHash(text) {
  return payloadHash(whitespaceKey(text));
}

function isDeliverableSpreadTemplate(body) {
  if (typeof body !== 'string') return false;
  const key = whitespaceKey(body);
  const templateKey = whitespaceKey(SPREAD_TEST_REPLY);
  if (payloadHash(key) === payloadHash(templateKey)) return true;
  const greet = /^(?:Hello|Ciao|Salam)(?: [A-Za-zÀ-ÿ'-]+)?, |^السلام علیکم(?: [A-Za-zÀ-ÿ'-]+)?، /;
  const matched = greet.exec(key);
  if (!matched) return false;
  const rest = key.slice(matched[0].length).trim();
  return payloadHash(rest) === payloadHash(templateKey);
}

function eligibilityText(text) {
  return normalizeForMatch(decodeClientMarkup(text)).toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasNegation(clause) {
  const softened = String(clause || '').replace(/\bno\s+(?:rush|problem|worries|worry|issue|one|longer)\b/giu, ' ');
  return /(?:^|[^\p{L}\p{N}])(?:never|cannot|nahin|nahi|nai|don't|dont|can't|cant|do not|not|no|mat|نہیں|नहीं|لا)(?=$|[^\p{L}\p{N}])/iu.test(softened);
}

function isDefinition(clause) {
  return /\bwhat(?:'s| is| are)\b/.test(clause);
}

function isRequestMood(clause) {
  if (/[?؟]/.test(clause)) return true;
  if (/\b(?:how|what|when|where|why|can|could|would|should|please|want|send|give|share|dena|bhejo|bhejdo)\b/.test(clause)) return true;
  if (/(?:بتائ|طریق|کریں|دیجی|مجھے|मुझे|कृपया|بھیجو)/.test(clause)) return true;
  return false;
}

function isSelfReport(clause) {
  if (isRequestMood(clause)) return false;
  if (/\bi (?:check(?:ed)?|was testing|already test(?:ed)?|tested|sent|send)\b/.test(clause)) return true;
  if (/\bi(?:'m| am) testing\b/.test(clause)) return true;
  return false;
}

function isThirdPartyOnly(clause) {
  if (!/\b(?:him|her|them|his|their)\b/.test(clause)) return false;
  if (/\b(?:me|mujhe|mjhe|humein)\b/.test(clause)) return false;
  if (/(?:^|[^\p{L}\p{N}])(?:لي|مجھے|मुझे)(?=$|[^\p{L}\p{N}])/u.test(clause)) return false;
  return true;
}

function isOwnAccount(clause) {
  return /\b(?:my|mera|meri|apna|own)\s+(?:account|login|credentials|password)\b/.test(clause);
}

function hasExplicitSpreadAsset(clause) {
  if (/\bspread[\s-]*test\s+(?:account|login|credentials|credential|password|details)\b/.test(clause)) return true;
  if (/\bspread[\s-]*demo\s+account\b/.test(clause)) return true;
  if (/حساب\s+اختبار\s+السبريد/.test(clause)) return true;
  if (/स्प्रेड\s+टेस्ट\s+(?:अकाउंट|खाता)/.test(clause)) return true;
  const urduSpread = normalizeForMatch('سپریڈ');
  const urduTest = normalizeForMatch('ٹیسٹ');
  const urduAccount = normalizeForMatch('اکاؤنٹ');
  if (new RegExp(urduSpread + '\\s+' + urduTest + '\\s+' + urduAccount).test(clause)) return true;
  return false;
}

function asksHowToCheckSpreads(clause) {
  if (/\bhow (?:do i|can i|could i|should i|to) (?:check|test) (?:the |your |our )?spreads?\b/.test(clause)) return true;
  if (/\b(?:check|test) (?:the )?spreads? (?:on|with|using) (?:the )?(?:test|demo) account\b/.test(clause)) return true;
  if (/\bkaise\b/.test(clause) && /\b(?:check|test)\b/.test(clause) && /\bspreads?\b/.test(clause)) return true;
  if (/कैसे/.test(clause) && /स्प्रेड/.test(clause) && /(?:चेक|जांच|जाँच|टेस्ट)/.test(clause)) return true;
  if (/کیسے/.test(clause) && /سپریڈ/.test(clause) && /(?:چیک|ٹیسٹ|جانچ)/.test(clause)) return true;
  if (/كيف/.test(clause) && /سبريد/.test(clause)) return true;
  if (/(?:^|[^\p{L}\p{N}])(?:اختبر|افحص|تحقق|فحص)(?=$|[^\p{L}\p{N}])/u.test(clause) && /سبريد/.test(clause) && !/سبريد\s+(?:اختبر|افحص|تحقق|فحص)/.test(clause)) return true;
  if (/\bi want to (?:check|test) (?:the |your |our )?spreads?\b/.test(clause)) return true;
  if (/\bspread[\s-]*test\s+account\b/.test(clause) && /\bdena\b/.test(clause)) return true;
  if (/سپریڈ/.test(clause) && /چیک/.test(clause) && /(?:طریقہ|بتائ)/.test(clause)) return true;
  return false;
}

function hasSpreadObject(clause) {
  if (hasExplicitSpreadAsset(clause)) return true;
  if (/\bdemo\s+account\b/.test(clause) && /\bspreads?\b/.test(clause)) return true;
  if (/\b(?:test|demo)\s+account\b/.test(clause) && /\b(?:to check|for checking)\s+(?:the\s+)?spreads?\b/.test(clause)) return true;
  if (/\bhow (?:do i|can i|to) check (?:the\s+)?spreads?\b/.test(clause) && /\b(?:test|demo)\s+account\b/.test(clause)) return true;
  return false;
}

function hasRequestAct(clause) {
  if (/(?:^|[^\p{L}\p{N}])(?:bhejdo|bhejo|bhej|dena|send|give|share|provide|show|भेजो|भेजिए|भेज|दीजिए|بھیجو|دیں|أرسل|ارسل)(?=$|[^\p{L}\p{N}])/iu.test(clause)) {
    return true;
  }
  if (/\bhow (?:do i|can i|to) check (?:the\s+)?spreads?\b/.test(clause) && /\b(?:test|demo)\s+account\b/.test(clause)) {
    return true;
  }
  if (/\b(?:do not|don't|dont)\b/.test(clause)) return false;
  if (/\bhow do i\b/.test(clause) || /\bwhat do you\b/.test(clause)) return false;
  if (/\bplease do\b/.test(clause) || /\bbhej do\b/.test(clause)) return true;
  return false;
}

function hasActorUs(clause) {
  if (/\b(?:can you|could you|would you|will you|please|mujhe|mjhe|humein|mujhko)\b/.test(clause)) return true;
  if (/\b(?:send|give|share|show|provide) me\b/.test(clause)) return true;
  if (/(?:^|[^\p{L}\p{N}])(?:لي|مجھے|मुझे)(?=$|[^\p{L}\p{N}])/u.test(clause)) return true;
  if (asksHowToCheckSpreads(clause)) return true;
  if (/कृपया/.test(clause)) return true;
  if (/(?:भेजो|भेजिए|भेज|दीजिए|करो|bhejo|bhejdo)\s*$/.test(clause) && hasExplicitSpreadAsset(clause)) return true;
  return false;
}

function startsWithAct(clause) {
  if (/^(?:please\s+)?(?:send|give|share|provide|show|bhejdo|bhejo|bhej|dena)\b/.test(clause)) return true;
  if (/^(?:please\s+)?(?:भेजो|भेज|दीजिए|بھیجو|دیں|أرسل|ارسل)/.test(clause)) return true;
  return false;
}

function clauseQualifies(clause) {
  const t = String(clause || '').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (/\b(?:payouts?|withdrawn|withdrawal|withdraw)\b/.test(t)) return false;
  if (hasNegation(t)) return false;
  if (isDefinition(t)) return false;
  if (isSelfReport(t)) return false;
  if (isThirdPartyOnly(t)) return false;
  if (isOwnAccount(t) && !hasExplicitSpreadAsset(t)) return false;
  if (asksHowToCheckSpreads(t)) return true;
  if (!hasActorUs(t) && !startsWithAct(t)) return false;
  if (!hasRequestAct(t)) return false;
  if (!hasSpreadObject(t)) return false;
  return true;
}

/**
 * Structured intent: actor is us, a request act, a spread-test object,
 * no negation in the clause, and not a definition, self-report, own account,
 * or third party. Default deny.
 */
function isExplicitSpreadTestRequest(text) {
  const t = eligibilityText(text);
  if (!t) return false;
  if (/\bspread some light\b/.test(t)) return false;
  if (/\bproblem spread\b/.test(t)) return false;
  if (/\brisk spread\b/.test(t)) return false;
  if (/\bspreadsheet\b/.test(t) || /\bspread sheet\b/.test(t)) return false;
  if (/\bspread of (?:a |the )?(?:rumor|rumour)\b/.test(t)) return false;
  const clauses = t.split(/[.?!;؟۔\n]+/);
  for (const clause of clauses) {
    if (clauseQualifies(clause)) return true;
  }
  return false;
}

function replaceSplitRun(text, secret) {
  const needle = normalizeForMatch(secret);
  if (!needle || [...needle].length < MIN_VALUE_LENGTH) return String(text);
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

function redactKeys(text) {
  const chars = [...String(text == null ? '' : text)];
  let surface = '';
  const map = [];
  for (let i = 0; i < chars.length; i++) {
    if (/\p{Cf}/u.test(chars[i])) continue;
    const folded = chars[i].normalize('NFKC');
    for (const ch of folded) {
      if (/\p{Cf}/u.test(ch)) continue;
      surface += ch;
      map.push(i);
    }
  }
  const out = chars.slice();
  function blank(re, replacement) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(surface))) {
      if (!match[0].length || match.index >= map.length) continue;
      const start = map[match.index];
      const end = map[Math.min(map.length - 1, match.index + match[0].length - 1)];
      for (let i = start; i <= end; i++) out[i] = '';
      out[start] = replacement;
    }
  }
  blank(/\bsk-[A-Za-z0-9_-]{8,}/gi, '[secret]');
  blank(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}/gi, 'Bearer [secret]');
  return out.join('');
}

function redactText(text, extraSecrets, options) {
  const opts = options || {};
  assertScanSize(text);
  const budget = opts.budget || extractionBudget();
  checkBudget(budget);
  let out = redactKeys(text);
  const values = extractSecrets(out, budget).map((hit) => hit.value).concat(extraSecrets || []);
  if (!opts.keepTemplate) values.push(TEMPLATE_PASSWORD);
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || !value || seen.has(value) || FUNCTION_WORDS.has(value.toLowerCase())) continue;
    if (value === '[secret]') continue;
    if (opts.keepTemplate && sameToken(value, TEMPLATE_PASSWORD)) continue;
    seen.add(value);
    out = flexReplace(out, value);
    out = replaceSplitRun(out, value);
  }
  return out;
}

function redactForConversation(conversationId, text, budget) {
  const state = budget || extractionBudget();
  return redactText(decodeClientMarkup(text, state), secretsFor(conversationId), { budget: state });
}

function redactSystemContent(conversationId, text, budget) {
  const raw = String(text == null ? '' : text);
  const state = budget || extractionBudget();
  checkBudget(state);
  if (raw.length === AUTHORIZED_PROMPT_DISCLOSURE.length && payloadHash(raw) === AUTHORIZED_PROMPT_DISCLOSURE.sha256) {
    return raw;
  }
  let head = '';
  let tail = raw;
  if (raw.length > AUTHORIZED_PROMPT_DISCLOSURE.length) {
    const prefix = raw.slice(0, AUTHORIZED_PROMPT_DISCLOSURE.length);
    if (payloadHash(prefix) === AUTHORIZED_PROMPT_DISCLOSURE.sha256) {
      head = prefix;
      tail = raw.slice(prefix.length);
    }
  }
  const extras = secretsFor(conversationId).filter((value) => !sameToken(value, TEMPLATE_PASSWORD));
  return head + redactText(tail, extras, { keepTemplate: true, budget: state });
}

function scrubContent(conversationId, text, system, budget) {
  if (typeof text !== 'string') return text;
  return system ? redactSystemContent(conversationId, text, budget) : redactForConversation(conversationId, text, budget);
}

function guardModelMessages(conversationId, messages) {
  if (!Array.isArray(messages)) throw boundsError();
  const budget = extractionBudget();
  return messages.map((msg) => {
    checkBudget(budget);
    if (!msg || typeof msg !== 'object') return msg;
    const system = String(msg.role || '') === 'system';
    if (typeof msg.content === 'string') {
      return Object.assign({}, msg, { content: scrubContent(conversationId, msg.content, system, budget) });
    }
    if (Array.isArray(msg.content)) {
      return Object.assign({}, msg, {
        content: msg.content.map((part) => {
          if (!part || typeof part.text !== 'string') return part;
          return Object.assign({}, part, { text: scrubContent(conversationId, part.text, system, budget) });
        }),
      });
    }
    return msg;
  });
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
      || extractSecrets(next).some((hit) => containsSecret(next, hit.value))
      || hasKeyMaterial(next);
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
    if (hasKeyMaterial(next)) return '[redacted]';
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
  return zwFlatten(left) === zwFlatten(right);
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

  const keys = keyMaterialValues(body);
  const draftHits = extractSecrets(body)
    .map((hit) => hit.value)
    .concat(messageType === 'note' ? [] : keys)
    .filter((value) => !sameToken(value, TEMPLATE_PASSWORD));
  if (ctx.conversationId) rememberValues(ctx.conversationId, draftHits.concat(keys));
  const watch = watchList(secrets, draftHits.concat(keys));
  const echoed = secrets.some((value) => containsSecret(body, value));
  const introduced = draftHits.some((value) => containsSecret(body, value));
  const templateHit = containsSecret(body, TEMPLATE_PASSWORD);
  const keyHit = keys.length > 0;
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

function payloadHash(body) {
  return crypto.createHash('sha256').update(String(body), 'utf8').digest('hex');
}

function canonicalBody(body) {
  if (typeof body !== 'string') return '';
  return decodeClientMarkup(body).replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n');
}

function decisionKeysFor(conversationId, body) {
  const id = String(conversationId || '');
  if (typeof body !== 'string') return [];
  return [
    id + '\n' + payloadHash(body),
    id + '\n' + payloadHash(canonicalBody(body)),
  ];
}

function bindDecision(conversationId, inputBody, decision) {
  if (typeof inputBody !== 'string' || !decision) return decision;
  const record = {
    post: !!decision.post,
    action: decision.action,
    reason: decision.reason,
    body: decision.body,
    spreadEligible: !!decision.spreadEligible,
  };
  const seen = new Set();
  function add(text) {
    for (const key of decisionKeysFor(conversationId, text)) {
      if (seen.has(key)) continue;
      seen.add(key);
      decisionsByKey.set(key, record);
    }
  }
  add(inputBody);
  if (typeof decision.body === 'string') add(decision.body);
  decision.payloadHash = payloadHash(typeof decision.body === 'string' ? decision.body : inputBody);
  return decision;
}

function peekDecision(conversationId, body) {
  for (const key of decisionKeysFor(conversationId, body)) {
    if (decisionsByKey.has(key)) return decisionsByKey.get(key);
  }
  return null;
}

function consumeDecision(conversationId, record) {
  if (!record) return;
  const prefix = String(conversationId || '') + '\n';
  for (const [key, value] of decisionsByKey) {
    if (value === record && key.startsWith(prefix)) decisionsByKey.delete(key);
  }
}

function guardSend(input) {
  try {
    const ctx = input || {};
    const decision = decide(ctx);
    if (typeof ctx.body === 'string') bindDecision(ctx.conversationId, ctx.body, decision);
    return decision;
  } catch (_) {
    return blocked('validation_error');
  }
}

function conversationIdFromUrl(url) {
  const match = /conversations\/([^/?#]+)/.exec(String(url || ''));
  if (!match) return '';
  if (match[1] === 'search') return '';
  return match[1];
}

function shipWrite(data, decision) {
  if (!decision.post) {
    return {
      post: false,
      blocked: true,
      posted: false,
      data: null,
      reason: decision.reason,
      spreadEligible: !!decision.spreadEligible,
      payloadHash: decision.payloadHash || null,
      diagnostic: { reason: decision.reason },
    };
  }
  const safe = typeof decision.body === 'string' ? decision.body : data.body;
  let ship = data.body;
  if (typeof data.body === 'string' && typeof safe === 'string') {
    const same = data.body === safe || canonicalBody(data.body) === canonicalBody(safe);
    ship = same ? data.body : safe;
  }
  const next = ship === data.body ? data : Object.assign({}, data, { body: ship });
  return {
    post: true,
    blocked: false,
    posted: false,
    data: next,
    reason: decision.reason,
    spreadEligible: !!decision.spreadEligible,
    payloadHash: payloadHash(typeof ship === 'string' ? ship : ''),
    diagnostic: { reason: decision.reason },
  };
}

function guardOutboundWrite(url, data) {
  try {
    if (!data || typeof data !== 'object' || !Object.prototype.hasOwnProperty.call(data, 'body')) {
      return {
        post: true,
        blocked: false,
        posted: false,
        data: data,
        reason: 'no_public_body',
        spreadEligible: false,
        diagnostic: { reason: 'no_public_body' },
      };
    }
    const conversationId = conversationIdFromUrl(url);
    const prior = peekDecision(conversationId, data.body);
    if (prior) {
      consumeDecision(conversationId, prior);
      return shipWrite(data, prior);
    }
    const decision = guardSend({
      conversationId: conversationId,
      messageType: String(data.message_type || '') === 'note' ? 'note' : 'comment',
      body: data.body,
    });
    consumeDecision(conversationId, peekDecision(conversationId, data.body) || {
      post: decision.post,
      action: decision.action,
      reason: decision.reason,
      body: decision.body,
      spreadEligible: decision.spreadEligible,
    });
    return shipWrite(data, decision);
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
  consumeDecision(ctx.conversationId, peekDecision(ctx.conversationId, ctx.body));
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
    consumeDecision(op.conversationId, peekDecision(op.conversationId, op.body));
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
  MIN_VALUE_LENGTH,
  AUTHORIZED_PROMPT_DISCLOSURE,
  whitespaceHash,
  normalizeForMatch,
  prepare,
  extractSecrets,
  containsSecret,
  keyMaterialValues,
  rememberClientText,
  rememberClientParts,
  secretsFor,
  resetStore,
  redactText,
  redactForConversation,
  redactSystemContent,
  guardModelMessages,
  redactTurnMeta,
  redactDiagnostic,
  isExplicitSpreadTestRequest,
  isExactSpreadTemplate,
  isDeliverableSpreadTemplate,
  carriesCustomerText,
  payloadHash,
  canonicalBody,
  guardSend,
  guardOutboundWrite,
  enqueuePublicOp,
  restoreQueuedOp,
  inspectQueue,
  flushQueue,
  createRecordingTransport,
  createChoke,
};
