'use strict';

/**
 * Credential guard R6 — frozen staging candidate.
 *
 * Fixes the R5 review (NEEDS CHANGES / NO-GO) from the written summaries only.
 * The reviewer's case file was not read. Not wired into index.js, statePresend,
 * or the maintainer. Not a release. approved is false until a different agent
 * reviews it.
 *
 * The fixed client message follows the existing credentials rule: do not repeat
 * a pasted secret, tell the client to change it immediately, and escalate it as
 * a security event. It states no account, payout, or lock outcome.
 */

const STATUS = Object.freeze({
  candidate: 'credential-guard-r6',
  frozen: true,
  approved: false,
  release: false,
  wired: false,
});

const FIXED_MESSAGE =
  'Please change that immediately. I will not repeat it back. I am escalating this as a security event for the team.';

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
  'پاسورڈ', 'پاس\\s*ورڈ', 'كلمة\\s+المرور', 'كلمة\\s+السر', 'الباسورد', 'باسورد', 'पासवर्ड',
].join('|');

const COPULA_SRC = 'hai|hain|he|ho|is|was|है|ہے|هي|هو';

const LABEL_RE = new RegExp(
  '(?:^|[^\\p{L}\\p{N}])((?:' + LABEL_SRC + '))([\\s:=\\-]*)(?:(' + COPULA_SRC + ')[\\s:=\\-]*)?',
  'giu'
);

const secretsByConversation = new Map();

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

function tryBase64(token, minLen) {
  const t = String(token || '').trim();
  const min = minLen == null ? 12 : minLen;
  if (t.length < min || t.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(t)) return null;
  let decoded;
  try {
    decoded = Buffer.from(t, 'base64').toString('utf8');
  } catch (_) {
    return null;
  }
  if (!decoded || /[\u0000-\u0008]/.test(decoded)) return null;
  if (!/^[\u0009\u000a\u000d\u0020-\u007e\u00a0-\u024f\u0600-\u06ff\u0900-\u097f]+$/.test(decoded)) return null;
  const round = Buffer.from(decoded, 'utf8').toString('base64').replace(/=+$/, '');
  if (round !== t.replace(/=+$/, '')) return null;
  return decoded;
}

function acceptValue(label, token, explicitSep) {
  const value = cleanToken(token);
  if (!value || value.length > 128) return null;
  const lower = value.toLowerCase();
  if (!explicitSep && STOP.has(lower)) return null;
  if (label.toLowerCase() === 'pass') {
    const shaped = /\d/.test(value) || /[A-Z]/.test(value) || value.length >= 4;
    const short = value.length >= 1 && value.length <= 3 && !STOP.has(lower);
    if (!explicitSep && !shaped && !short) return null;
    if (STOP.has(lower)) return null;
  }
  return value;
}

/**
 * Secrets introduced by a credential label. Values are taken after a copula,
 * so "mera password hai X" captures X.
 * @returns {{value: string, label: string}[]}
 */
function extractSecrets(text) {
  const prepared = prepare(text);
  const folded = leetFold(prepared);
  const found = [];
  const seen = new Set();
  LABEL_RE.lastIndex = 0;
  let match;
  while ((match = LABEL_RE.exec(folded))) {
    const label = String(match[1] || '');
    const sep = String(match[2] || '') + String(match[3] || '');
    const explicitSep = /[:=]/.test(sep);
    let cursor = match.index + match[0].length;
    let token = readToken(prepared, cursor);
    if (token && !explicitSep && STOP.has(token.raw.toLowerCase())) {
      cursor = token.end;
      token = readToken(prepared, cursor);
    }
    if (!token) {
      if (match.index === LABEL_RE.lastIndex) LABEL_RE.lastIndex += 1;
      continue;
    }
    const value = acceptValue(label, token.raw, explicitSep);
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

function escapeReg(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function boundedIncludes(haystack, secret) {
  const needle = String(secret || '');
  if (!needle) return false;
  if (needle.length >= 4) return haystack.includes(needle);
  const re = new RegExp('(?:^|[^\\p{L}\\p{N}])' + escapeReg(needle) + '(?:$|[^\\p{L}\\p{N}])', 'iu');
  return re.test(haystack);
}

function containsSecret(haystack, secret) {
  const needle = normalizeForMatch(secret);
  if (!needle) return false;
  const prepared = prepare(haystack);
  if (boundedIncludes(prepared, needle) || boundedIncludes(prepared.toLowerCase(), needle.toLowerCase())) return true;
  if (needle.length >= 4) {
    const foldedHay = leetFold(prepared).toLowerCase();
    const foldedNeedle = leetFold(needle).toLowerCase();
    if (foldedHay.includes(foldedNeedle)) return true;
    const b64 = Buffer.from(needle).toString('base64');
    if (b64.length >= 8 && String(haystack).includes(b64)) return true;
  }
  const tokens = String(haystack).match(/[A-Za-z0-9+/]{8,}={0,2}/g) || [];
  for (const token of tokens) {
    const decoded = tryBase64(token, 8);
    if (!decoded) continue;
    const decodedNorm = normalizeForMatch(decoded);
    if (boundedIncludes(decodedNorm, needle) || boundedIncludes(decodedNorm.toLowerCase(), needle.toLowerCase())) return true;
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
    if (value && !bag.includes(value)) bag.push(value);
  }
  secretsByConversation.set(id, bag);
}

function rememberClientText(conversationId, text) {
  rememberValues(conversationId, extractSecrets(text).map((hit) => hit.value));
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
}

function collectSecrets(input) {
  const values = [];
  function add(value) {
    if (value && !values.includes(value)) values.push(value);
  }
  for (const text of clientTextsFrom(input.history)) {
    for (const hit of extractSecrets(text)) add(hit.value);
  }
  for (const text of input.clientTexts || []) {
    for (const hit of extractSecrets(text)) add(hit.value);
  }
  for (const value of input.knownSecrets || []) add(value);
  for (const value of secretsFor(input.conversationId)) add(value);
  return values;
}

function flexReplace(text, secret) {
  const chars = [...String(secret || '')];
  if (!chars.length) return text;
  const body = chars.map(escapeReg).join('[\\u200B-\\u200F\\uFEFF]*');
  const pattern = chars.length >= 4 ? body : '(?:^|[^\\p{L}\\p{N}])(?:' + body + ')(?=$|[^\\p{L}\\p{N}])';
  const re = new RegExp(pattern, 'giu');
  return String(text).replace(re, (m) => (chars.length >= 4 ? '[secret]' : m.replace(new RegExp(body, 'iu'), '[secret]')));
}

function redactText(text, extraSecrets) {
  let out = String(text == null ? '' : text);
  out = out.replace(/\bsk-[A-Za-z0-9_-]{16,}/g, '[secret]');
  out = out.replace(/\bBearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer [secret]');
  const values = extractSecrets(out).map((hit) => hit.value).concat(extraSecrets || [], [TEMPLATE_PASSWORD]);
  const seen = new Set();
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out = flexReplace(out, value);
    if (value.length >= 4) {
      const b64 = Buffer.from(value).toString('base64');
      if (b64.length >= 12) out = out.split(b64).join('[secret]');
    }
  }
  return out;
}

function redactTurnMeta(meta) {
  const copy = Object.assign({}, meta || {});
  const fromClient = extractSecrets(copy.clientText || '').map((hit) => hit.value);
  if (copy.clientText) copy.clientText = redactText(copy.clientText);
  if (copy.body) copy.body = redactText(copy.body, fromClient);
  return copy;
}

function isExplicitSpreadTestRequest(text) {
  const t = normalizeForMatch(text).toLowerCase();
  if (!t.trim()) return false;
  if (/\bspread some light\b/.test(t)) return false;
  if (/\bproblem spread\b/.test(t)) return false;
  if (/\brisk spread\b/.test(t)) return false;
  if (/\b(?:check|test|testing)\b[\s\S]{0,48}\bspreads?\b|\bspreads?\b[\s\S]{0,48}\b(?:check|test|testing)\b|\bspread[\s-]*(?:check|test)\b/.test(t)) {
    return true;
  }
  if (/\bspreads?\b[\s\S]{0,40}\b(?:check|test)\b[\s\S]{0,24}\b(?:karo|kar\s*do|karna|karni|chahiye)\b/.test(t)) return true;
  if (/\b(?:check|test)\b[\s\S]{0,24}\b(?:karo|kar\s*do|karna|karni|chahiye)\b[\s\S]{0,40}\bspreads?\b/.test(t)) return true;
  if (/स्प्रेड/.test(t) && /(?:चेक|टेस्ट|जांच|जाँच|परीक्षण)/.test(t)) return true;
  if (/سپریڈ/.test(t) && /(?:چیک|ٹیسٹ|جانچ)/.test(t)) return true;
  if (/(?:السبريد|سبريد)/.test(t) && /(?:تحقق|افحص|اختبر|فحص|اختبار)/.test(t)) return true;
  return false;
}

/**
 * Scan an outbound body against every client secret in history, plus the
 * spread-template password unless this send is an explicit spread test.
 */
function guardSend(input) {
  const ctx = input || {};
  const messageType = String(ctx.messageType || 'comment');
  const body = String(ctx.body == null ? '' : ctx.body);
  const secrets = collectSecrets(ctx);
  const explicit = !!ctx.explicitSpreadTest;
  const echoed = secrets.filter((value) => containsSecret(body, value));
  const templateHit = containsSecret(body, TEMPLATE_PASSWORD);
  const base = {
    version: STATUS.candidate,
    frozen: true,
    approved: false,
    release: false,
    wired: false,
    silent: false,
    secretsChecked: secrets.length,
  };
  if (templateHit && !explicit) {
    if (messageType === 'note') {
      return Object.assign(base, {
        action: 'redact',
        reason: 'template_password',
        body: redactText(body, secrets),
      });
    }
    return Object.assign(base, {
      action: 'fixed_message',
      reason: 'template_password',
      body: FIXED_MESSAGE,
    });
  }
  if (echoed.length) {
    if (messageType === 'note') {
      return Object.assign(base, {
        action: 'redact',
        reason: 'history_echo',
        body: redactText(body, secrets),
      });
    }
    return Object.assign(base, {
      action: 'fixed_message',
      reason: 'history_echo',
      body: FIXED_MESSAGE,
    });
  }
  return Object.assign(base, { action: 'allow', reason: 'clean', body });
}

function createChoke(raw) {
  const post = raw && raw.postReply;
  const once = raw && raw.postClientCommentOnce;
  if (typeof post !== 'function' || typeof once !== 'function') {
    throw new Error('createChoke requires postReply and postClientCommentOnce');
  }
  return {
    postReply(conversationId, messageType, body, guardCtx) {
      const decision = guardSend(Object.assign({ conversationId, messageType, body }, guardCtx || {}));
      return post(conversationId, messageType, decision.body, guardCtx);
    },
    postClientCommentOnce(conversationId, body, userPart, clientName, guardCtx) {
      const ctx = guardCtx || {};
      if (ctx.parts) rememberClientParts(conversationId, ctx.parts);
      if (userPart) rememberClientParts(conversationId, [userPart]);
      const decision = guardSend({
        conversationId,
        messageType: 'comment',
        body,
        history: ctx.history,
        clientTexts: ctx.clientTexts,
        explicitSpreadTest: !!ctx.explicitSpreadTest,
      });
      return once(conversationId, decision.body, userPart, clientName, ctx);
    },
  };
}

module.exports = {
  STATUS,
  FIXED_MESSAGE,
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
  redactTurnMeta,
  isExplicitSpreadTestRequest,
  guardSend,
  createChoke,
};
