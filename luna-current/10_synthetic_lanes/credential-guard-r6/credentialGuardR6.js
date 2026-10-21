'use strict';

/**
 * Credential guard R6 — frozen staging candidate.
 *
 * Fixes the R5 review summaries and the later owner requirements:
 * every public outbound path is checked before posting, detection is
 * normalized token equality, and the 55188 template is a narrow exact-text
 * exception. Not wired into index.js, statePresend, or the maintainer.
 * approved is false until a different agent reviews it.
 *
 * The fixed client message follows the existing credentials rule: do not
 * repeat a pasted secret, tell the client to change it immediately, and
 * escalate it as a security event. It states no account, payout, or lock
 * outcome.
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
  'پاسورڈ', 'پاس\\s*ورڈ', 'كلمة\\s+المرور', 'كلمة\\s+السر', 'الباسورد', 'باسورد', 'पासवर्ड',
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

function isShaped(value) {
  if (/\d/.test(value)) return true;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) return true;
  if (/[^\p{L}\p{N}]/u.test(value)) return true;
  return false;
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
    const hadCopula = !!match[3];
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

function containsSecret(haystack, secret, depth) {
  const needle = normalizeForMatch(secret);
  if (!needle || typeof haystack !== 'string') return false;
  const limit = depth == null ? 2 : depth;
  if (limit < 0) return false;
  const prepared = prepare(haystack);
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
  const id = String(conversationId || '');
  rememberValues(id, extractSecrets(text).map((hit) => hit.value));
  if (id) lastAskByConversation.set(id, String(text == null ? '' : text));
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
  return String(body)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function isExactSpreadTemplate(body) {
  if (typeof body !== 'string') return false;
  if (body === SPREAD_TEST_REPLY) return true;
  return plainFromHtml(body) === SPREAD_TEST_REPLY;
}

function isExplicitSpreadTestRequest(text) {
  const t = normalizeForMatch(text).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (/\bspread some light\b/.test(t)) return false;
  if (/\bproblem spread\b/.test(t)) return false;
  if (/\brisk spread\b/.test(t)) return false;
  if (/\b(?:payouts?|withdrawn|withdrawal|withdraw)\b/.test(t)) return false;
  if (/\b(?:not|never|don't|dont|do not)\s+(?:please\s+)?(?:check|test|testing)\s+(?:(?:the|your|our|my)\s+)?spreads?\b/.test(t)) return false;
  if (/\b(?:not|never|don't|dont|do not)\s+(?:a\s+|the\s+)?spread\s+(?:check|test)\b/.test(t)) return false;
  if (/\b(?:check|test|testing)\s+(?:(?:the|your|our|my)\s+)?spreads?\b/.test(t)) return true;
  if (/\bspread\s+(?:check|test)(?:\s+account)?\b/.test(t)) return true;
  if (/\bspread[\s-]+test\s+account\b/.test(t)) return true;
  if (/\bsend me the spread[\s-]+test account\b/.test(t)) return true;
  if (/\b(?:check|test)\s+karo\s+(?:(?:the|your|our|my)\s+)?spreads?\b/.test(t)) return true;
  if (/\bspreads?\s+(?:check|test)\s+karo\b/.test(t)) return true;
  if (/स्प्रेड\s+(?:चेक|टेस्ट|जांच|जाँच)/.test(t)) return true;
  if (/سپریڈ\s+(?:چیک|ٹیسٹ|جانچ)/.test(t)) return true;
  if (/(?:تحقق|افحص|اختبر|فحص)\s+(?:ال)?سبريد/.test(t)) return true;
  return false;
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
  }
  return out;
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

function decide(ctx) {
  if (typeof ctx.body !== 'string') return blocked('non_string');
  const body = ctx.body;
  const messageType = String(ctx.messageType || 'comment');
  const secrets = collectSecrets(ctx);
  const eligible = isExplicitSpreadTestRequest(latestClientAsk(ctx));
  const exact = isExactSpreadTemplate(body);
  if (exact && eligible) {
    const others = secrets.filter((value) => !sameToken(value, TEMPLATE_PASSWORD));
    if (stillHas(body, others)) return blocked('residual_secret');
    return allowed('spread_template', body, secrets.length);
  }
  if (exact && !eligible) return blocked('spread_not_eligible');

  const draftHits = extractSecrets(body)
    .map((hit) => hit.value)
    .filter((value) => !sameToken(value, TEMPLATE_PASSWORD));
  const watch = watchList(secrets, draftHits);
  const echoed = secrets.some((value) => containsSecret(body, value));
  const introduced = draftHits.some((value) => containsSecret(body, value));
  const templateHit = containsSecret(body, TEMPLATE_PASSWORD);
  if (!echoed && !introduced && !templateHit) return allowed('clean', body, secrets.length);

  let reason = 'draft_secret';
  if (templateHit && !echoed) reason = 'template_password';
  else if (echoed) reason = 'history_echo';

  if (messageType === 'note') {
    const redacted = redactText(body, watch);
    if (stillHas(redacted, watch)) return blocked('residual_secret');
    return Object.assign(baseResult(), {
      action: 'redact',
      reason: reason,
      post: true,
      posted: false,
      blocked: false,
      body: redacted,
      secretsChecked: secrets.length,
      diagnostic: { reason: 'redact' },
    });
  }

  if (stillHas(FIXED_MESSAGE, watch)) return blocked('unsanitizable');
  return Object.assign(baseResult(), {
    action: 'fixed_message',
    reason: reason,
    post: true,
    posted: false,
    blocked: false,
    body: FIXED_MESSAGE,
    secretsChecked: secrets.length,
    diagnostic: { reason: reason },
  });
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
      return { post: false, blocked: true, posted: false, data: null, reason: reason, diagnostic: { reason: reason } };
    }
    return { post: true, blocked: false, posted: false, data: data, reason: decision.reason, diagnostic: { reason: decision.reason } };
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
  redactTurnMeta,
  redactDiagnostic,
  isExplicitSpreadTestRequest,
  isExactSpreadTemplate,
  guardSend,
  guardOutboundWrite,
  enqueuePublicOp,
  restoreQueuedOp,
  inspectQueue,
  flushQueue,
  createRecordingTransport,
  createChoke,
};
