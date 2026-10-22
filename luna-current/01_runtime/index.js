'use strict';
/* LUNA_SPREAD_IMAGE_FIXES_V1:BEGIN:require */
const __spreadAskGate = require('./spreadAskGate');
const __imageAskGuard = require('./imageAskGuard');
const LUNA_SPREAD_IMAGE_FIXES_VERSION = 'spread-image-fixes-v1';
/* LUNA_SPREAD_IMAGE_FIXES_V1:END:require */
/* LUNA_STATE_PRESEND_V1:BEGIN:require */
const __statePresend = require('./statePresend/statePresend')
const { isGreetingOrSmallTalk } = require('./statePresend/textUtils');
const challengeVariantGuard = require('./challengeVariantGuard');
const { isRepeatedClientQuestion, nearCopiedWording, protectedFactsMatch } = require('./repeatedClientQuestion');
const repeatTextUtils = require('./statePresend/textUtils');
const LUNA_STATE_PRESEND_VERSION = 'fresh-2026-09-16-botstop-owner-only-v1';
/* MICHAN_TEAMMATE_HANDOFF_V1:applied */
/* LUNA_STATE_PRESEND_V1:END:require */
/* LUNA_TOOLS_V1:BEGIN:require */
const lunaToolsRuntime = require('./lunaToolsRuntime');
// Reused from luna-codex-staging/webhookSecurity.js (Codex, 2026-09-18) rather than writing a
// second signature implementation. Scheme is Intercom's documented X-Hub-Signature:
// HMAC-SHA1 over the raw JSON body keyed with the app client secret.
const webhookSecurity = require('./webhookSecurity');
/* LUNA_TOOLS_V1:END:require */
/* LUNA_MAINTAINER_V1:BEGIN:require */
// Observation only. Never mutates the reply, never throws, and does nothing
// when MAINTAINER_ENABLED=false. See luna-maintainer/README.md.
let __maintainer = { observe: () => [], sweepAnalytics: () => [] };
try { __maintainer = require('./luna-maintainer').create(); } catch (__e) { console.error('[maintainer] disabled:', __e && __e.message); }
/* LUNA_MAINTAINER_V1:END:require */

/**
 * FRESH Luna engine - fresh-2026-09-16-botstop-owner-only-v1 (audit harden: promo SCOPE reset gate + note email + spread FP + bot-stop + FAQ fallthrough + identity strip)
 * Behavior = system-prompt.txt only (FINAL + Arsal client name).
 * Formatting + scope-decline + escalate note/tag in code; behavior otherwise from system-prompt.txt.
 */
require('dotenv').config();
const fs = require('fs');
const dns = require('dns');
const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');
const control = require('./control');
const writeOpStore = require('./writeOpStore');
let faqKb = null;
try {
  faqKb = require('./faq-kb');
} catch (_) {
  faqKb = null;
}
let septemberPromos = null;
try {
  septemberPromos = require('./september-promos');
} catch (_) {
  septemberPromos = null;
}
const idGates = require('./identityEscalateGates');
const assistantIdentityGuard = require('./assistantIdentityGuard');
const accountNumberPrefer = require('./accountNumberPrefer');
const softEdges = require('./softEdges');
const escalateRelatedOnly = require('./escalateRelatedOnly');
/* MICHAN_TEAMMATE_HANDOFF_V1:BEGIN:require */
const teammateHandoffGates = require('./teammateHandoffGates');
const fixedMessageHandoff = require('./fixedMessageHandoff');
/* MICHAN_TEAMMATE_HANDOFF_V1:END:require */

const app = express();
app.use(express.json({ limit: '2mb', verify: webhookSecurity.captureRawBody }));
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000,
  maxRetries: 2,
});
control.mount(app);

const ARSAL_ID = '10118526';
const ELITE_AI_ID = '8052954';
const ESCALATIONS_TEAM_ID = '9629759';
const RISK_TEAM_ID = '10675195';
const SKIP_TEAM_IDS = new Set(); // Payouts (11195250) allowed to reply , Arsal 2026-09-13
const ESCALATIONS_SILENCE_SEC = 15 * 60; // 15 minutes with no team reply
const ESCALATIONS_MIN_CLIENT_MSGS = 3;
const LONG_MSG_WORD_MIN = 150; // Escalations + Jerry: long client msg summary note
const RISK_SILENCE_SEC = 15 * 60; // Risk: 15m no team reply (no 3-message minimum)

const icHeaders = () => ({
  Authorization: 'Bearer ' + process.env.INTERCOM_ACCESS_TOKEN,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'Intercom-Version': '2.11',
});

const IC_TIMEOUT_MS = 20000;
const IC_MAX_RETRY = 2;

async function icRequest(method, url, data, tag) {
  // Reads and consequential writes need different retry policies. The old loop retried a
  // POST after a timeout or a 5xx, but in both cases the remote side may already have
  // ACCEPTED it, so a retry could post a second reply/note/assignment. Intercom documents no
  // idempotency key for these endpoints, so an ambiguous write is reported as unknown rather
  // than repeated. A 429 is a rejection (nothing was applied), so it stays retryable.
  const isWrite = !['get', 'head', 'options'].includes(String(method || 'get').toLowerCase());
  let last = { status: 0, data: null };
  let ambiguous = false;
  let opId = null;

  if (isWrite) {
    opId = writeOpStore.opKey(method, url, data);
    const prev = writeOpStore.get(opId);
    if (writeOpStore.shouldSkipReplay(prev)) {
      console.error('IC_REQ_REPLAY_SUPPRESSED', tag, url, prev && prev.status);
      return {
        ok: prev.status === 'confirmed',
        unknown: prev.status !== 'confirmed',
        skipped: true,
        status: prev.status === 'confirmed' ? 200 : 0,
        data: null,
      };
    }
    // failed-confirmed is a live miss. Carry its attempt count through the one retry.
    writeOpStore.set(opId, {
      status: 'pending',
      attempts: prev && Number(prev.attempts) ? Number(prev.attempts) : 0,
      kind: (prev && prev.kind) || (data && data.message_type) || '',
    });
  }

  for (let attempt = 0; attempt <= IC_MAX_RETRY; attempt += 1) {
    try {
      const r = await axios({
        method,
        url,
        data,
        headers: icHeaders(),
        timeout: IC_TIMEOUT_MS,
        validateStatus: () => true,
      });
      last = r;
      if (r.status < 400) {
        if (isWrite) {
          const verdict = writeOpStore.classifyWriteOutcome(data, r.data, r.status);
          if (!verdict.confirm) {
            if (opId) {
              writeOpStore.set(opId, {
                status: verdict.unknown ? 'unknown' : 'failed',
                reason: verdict.reason,
              });
            }
            return {
              ok: false,
              unknown: !!verdict.unknown,
              status: r.status,
              data: r.data,
              reason: verdict.reason,
            };
          }
          if (opId) {
            const saved = Object.assign({}, verdict.record || { status: 'confirmed' });
            if (saved.kind === 'assignment') saved.conversationId = writeOpStore.conversationIdFromUrl(url);
            writeOpStore.set(opId, saved);
          }
        }
        return { ok: true, status: r.status, data: r.data };
      }
      if (r.status === 429) {
        // Rejected outright: nothing was applied, so retrying is safe for reads and writes.
      } else if (r.status >= 500) {
        if (isWrite) { ambiguous = true; break; } // may have been applied server-side
      } else {
        break; // 4xx client error: never retryable
      }
    } catch (e) {
      // No response at all: for a write the outcome is genuinely unknown.
      last = { status: 0, data: null, message: e && e.message };
      console.error('IC_REQ_ERR', tag, url, e && e.message);
      if (isWrite) { ambiguous = true; break; }
    }
    if (attempt < IC_MAX_RETRY) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  if (ambiguous) {
    if (opId) {
      const prior = writeOpStore.get(opId) || {};
      writeOpStore.set(opId, {
        status: 'unknown',
        attempts: Number(prior.attempts) || 0,
        kind: prior.kind || (data && data.message_type) || '',
      });
    }
    console.error('IC_REQ_UNKNOWN', tag, url, 'write outcome unknown , not retried');
    return { ok: false, unknown: true, status: last.status || 0, data: last.data };
  }
  if (opId) writeOpStore.set(opId, { status: 'failed' });
  console.error('IC_REQ_FAIL', tag, url, last.status, JSON.stringify(last.data || '').slice(0, 300));
  return { ok: false, status: last.status, data: last.data };
}

function stripHtml(s) {
  return String(s || '')
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

const JERRY_ID = '8053416';
const RISK_TEAM_ADMIN_ID = '9378750';
const SUPPORT_TEAM_ID = 9629780;
const MENTION_ROTATE_FILE = process.env.MENTION_ROTATE_FILE || '/home/ubuntu/bot-mention-rotate.json';
const NEVER_MENTION_IDS = new Set([
  JERRY_ID,
  ARSAL_ID,
  ELITE_AI_ID,
  RISK_TEAM_ADMIN_ID,
  '8052557',
  '11128310',
  '11370955',
  '8089069',
  '9379207',
]);
const NEVER_MENTION_NAME_RE = /^(jerry(\s*-?\s*manager)?|arsal|elite ai|risk team|fundedelite|teamfutureselite|saqii|brian)\b/i;
const EXTRA_NEVER_EMAIL_RE = /supportjp@|teamfutureselite@|affiliate@fundedelite\.com/i;
const UNSOLVED_JERRY_LINE = 'please mention jerry & assign ticket to him';

function adminMentionHtml(admin) {
  const id = String(admin.id);
  const name = String(admin.name || 'teammate');
  return (
    '<a class="entity_mention intercom-content-link" href="//app.intercom.com/apps/h2z8cgfr/admin/' +
    id +
    '" rel="nofollow noopener noreferrer" target="_blank">' +
    name +
    '</a>'
  );
}

function jerryMentionHtml() {
  return (
    '<a class="entity_mention intercom-content-link" href="//app.intercom.com/apps/h2z8cgfr/admin/' +
    JERRY_ID +
    '" rel="nofollow noopener noreferrer" target="_blank">Jerry - Manager</a>'
  );
}

/** Escape plain text for Intercom note HTML (mentions inserted separately). */
function escapeNoteText(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

let _adminsMentionCache = { at: 0, list: null };

/** Broader admin list for owner @mention resolution (includes Away; still skips forbidden seats). */
async function fetchAdminsForMentionResolve() {
  const now = Date.now();
  if (_adminsMentionCache.list && now - _adminsMentionCache.at < 60_000) {
    return _adminsMentionCache.list;
  }
  const r = await axios.get('https://api.intercom.io/admins', {
    headers: icHeaders(),
    timeout: IC_TIMEOUT_MS,
    validateStatus: () => true,
  });
  if (r.status >= 400) {
    console.log('admins mention-resolve fetch fail', r.status);
    return _adminsMentionCache.list || [];
  }
  const admins = (r.data && r.data.admins) || [];
  const out = [];
  for (const a of admins) {
    if (!a || a.has_inbox_seat !== true) continue;
    const id = String(a.id || '');
    if (!id || NEVER_MENTION_IDS.has(id)) continue;
    const name = String(a.name || '').trim();
    const email = String(a.email || '');
    if (!name) continue;
    if (NEVER_MENTION_NAME_RE.test(name)) continue;
    if (/@intercom\.io$/i.test(email)) continue;
    if (EXTRA_NEVER_EMAIL_RE.test(email)) continue;
    out.push({ id, name, email });
  }
  _adminsMentionCache = { at: now, list: out };
  return out;
}

function adminMatchesMentionToken(admin, token) {
  const t = String(token || '').trim().toLowerCase().replace(/^@/, '');
  if (!t) return false;
  const name = String(admin.name || '').trim().toLowerCase();
  if (!name) return false;
  if (name === t) return true;
  const first = name.split(/\s+/)[0];
  if (first && first === t) return true;
  const compact = name.replace(/[^a-z0-9]/g, '');
  if (compact && compact === t.replace(/[^a-z0-9]/g, '')) return true;
  return false;
}

function resolveAdminByMentionToken(admins, token) {
  const t = String(token || '').trim().replace(/^@/, '');
  if (!t) return null;
  const ranked = admins.slice().sort((a, b) => String(b.name || '').length - String(a.name || '').length);
  for (const a of ranked) {
    if (adminMatchesMentionToken(a, t)) return a;
  }
  return null;
}

/**
 * Turn "@anjsha Please reply" (and similar) into real Intercom entity_mention HTML.
 * Escapes non-mention text; does not HTML-escape the mention anchors.
 * Respects NEVER_MENTION_* (those @tokens stay plain escaped text).
 */
async function enrichNoteMentionsHtml(body) {
  const raw = String(body || '');
  if (!raw.trim()) return escapeNoteText(raw);
  let admins = [];
  try {
    admins = await fetchAdminsForMentionResolve();
  } catch (e) {
    console.log('enrichNoteMentionsHtml admins fail', e && e.message);
  }
  const atRe = /@([A-Za-z][A-Za-z0-9_.-]{0,60})/g;
  const parts = [];
  let last = 0;
  let m;
  while ((m = atRe.exec(raw)) !== null) {
    const token = m[1];
    const admin = resolveAdminByMentionToken(admins, token);
    parts.push(escapeNoteText(raw.slice(last, m.index)));
    if (admin) {
      parts.push(adminMentionHtml(admin));
    } else {
      parts.push(escapeNoteText(m[0]));
    }
    last = m.index + m[0].length;
  }
  parts.push(escapeNoteText(raw.slice(last)));
  return parts.join('');
}

/** Deterministic: "mention X and ask them to reply" → NOTE body with @Name. */
function extractOwnerMentionAskReplyBody(plain) {
  const t = String(plain || '');
  const stripped = typeof stripOwnerMentionPrefix === 'function' ? stripOwnerMentionPrefix(t) : t;
  const hay = stripped + '\n' + t;
  let m = hay.match(
    /\bmention\s+@?([A-Za-z][A-Za-z0-9_.-]{1,40})\b(?:\s+and)?\s+(?:ask\s+(?:him|her|them)\s+to\s+)?(?:ask\s+to\s+)?reply\b/i
  );
  if (!m) {
    m = hay.match(/\bmention\s+@?([A-Za-z][A-Za-z0-9_.-]{1,40})\b.{0,40}\breply\b/i);
  }
  if (!m) return null;
  const name = String(m[1] || '').trim();
  if (!name) return null;
  if (NEVER_MENTION_NAME_RE.test(name)) return null;
  if (/^(arsal|jerry|elite|risk|saqii|brian)$/i.test(name)) return null;
  return '@' + name + ' Please reply on this ticket.';
}

function boldNoteLabel(label) {
  return '<b>' + label + '</b>';
}

function loadMentionRotate() {
  try {
    return JSON.parse(fs.readFileSync(MENTION_ROTATE_FILE, 'utf8'));
  } catch (_) {
    return { recent: [] };
  }
}

function saveMentionRotate(state) {
  fs.writeFileSync(MENTION_ROTATE_FILE, JSON.stringify(state));
}

async function fetchActiveTeammatesForMention() {
  // Intercom has no live green-dot API , "online" ≈ Away mode OFF + Support Team seat.
  const r = await axios.get('https://api.intercom.io/admins', {
    headers: icHeaders(),
    timeout: IC_TIMEOUT_MS,
    validateStatus: () => true,
  });
  if (r.status >= 400) {
    console.log('admins fetch fail', r.status);
    return [];
  }
  const admins = (r.data && r.data.admins) || [];
  const out = [];
  for (const a of admins) {
    if (!a || a.has_inbox_seat !== true) continue;
    const id = String(a.id || '');
    if (!id || NEVER_MENTION_IDS.has(id)) continue;
    if (a.away_mode_enabled !== false) continue;
    const name = String(a.name || '');
    const email = String(a.email || '');
    if (NEVER_MENTION_NAME_RE.test(name)) continue;
    if (/@intercom\.io$/i.test(email)) continue;
    if (EXTRA_NEVER_EMAIL_RE.test(email)) continue;
    const teams = (a.team_ids || []).map(Number);
    if (!teams.includes(SUPPORT_TEAM_ID)) continue;
    out.push({ id, name, email, away: a.away_mode_enabled });
  }
  out.sort((x, y) => x.name.localeCompare(y.name));
  console.log('ACTIVE_FOR_TAG', out.map((x) => x.name + '(' + x.id + ')').join(', ') || '(none)');
  return out;
}

function pickOneActiveTeammate(actives, preferId) {
  if (!actives.length) return null;
  if (preferId) {
    const pref = actives.find((a) => String(a.id) === String(preferId));
    if (pref) return pref;
  }
  const state = loadMentionRotate();
  const recent = Array.isArray(state.recent) ? state.recent.map(String) : [];
  const fresh = actives.filter((a) => !recent.includes(String(a.id)));
  const pool = fresh.length ? fresh : actives;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  saveMentionRotate({
    recent: recent.concat([String(pick.id)]).slice(-8),
    lastId: String(pick.id),
    at: Date.now(),
  });
  return pick;
}

async function assignToTeammate(conversationId, teammateId) {
  if (!teammateId) return { ok: false, status: 0 };
  const r = await icRequest(
    'post',
    'https://api.intercom.io/conversations/' + conversationId + '/reply',
    writeOpStore.assignmentRequestData(ARSAL_ID, teammateId),
    'ASSIGN'
  );
  console.log('ASSIGN', conversationId, teammateId, r.status, r.ok ? 'ok' : 'FAIL');
  return r;
}

async function assignToTeammateIfNeeded(conversation, conversationId, teammateId) {
  if (!teammateId) return { ok: false, status: 0, reason: 'missing_assignee' };
  const current = conversation && conversation.admin_assignee_id != null
    ? String(conversation.admin_assignee_id)
    : '';
  if (current && current === String(teammateId)) {
    return { ok: true, status: 200, skipped: true, reason: 'already_assigned' };
  }
  const result = await assignToTeammate(conversationId, teammateId);
  const errors = result && result.data && Array.isArray(result.data.errors) ? result.data.errors : [];
  if (
    result &&
    result.status === 422 &&
    errors.some((e) => e && e.code === 'conversation_already_assigned_to_assignee')
  ) {
    console.log('ASSIGN skip already-assigned 422', conversationId, teammateId);
    return { ok: true, status: 200, skipped: true, reason: 'already_assigned_422' };
  }
  return result;
}

function extractEmailsFromText(text) {
  const out = [];
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let m;
  const s = String(text || '');
  while ((m = re.exec(s))) {
    const e = m[0];
    if (!out.find((x) => x.toLowerCase() === e.toLowerCase())) out.push(e);
  }
  return out;
}

function extractAccountNumbersFromText(text) {
  // Merged: idGates patterns (letter+digit / spaced digits / 5-12) + live year/repeat/size/IP filters.
  const original = String(text || '');
  const s = accountNumberPrefer.stripIpv4(original);
  const raw = idGates.extractAccountNumbersFromText(original);
  const out = [];
  const push = (v) => {
    const x = String(v || '').replace(/\s+/g, '');
    if (!x || out.includes(x)) return;
    if (/^(19|20)\d{2}$/.test(x)) return;
    if (/^(\d)\1+$/.test(x)) return;
    if (accountNumberPrefer.isBlockedNoise(x, original)) return;
    out.push(x);
  };
  for (const v of raw) push(v);
  // Preserve live letter+digit / spaced fallbacks if idGates missed a form
  for (const m of s.matchAll(/\b[A-Za-z]\d{5,}\b/g)) push(m[0]);
  for (const m of s.matchAll(/\b\d{5,12}\b/g)) push(m[0]);
  for (const m of s.matchAll(/\b\d{3,4}\s+\d{3,5}\b/g)) push(m[0]);
  const ranked = accountNumberPrefer.rankAccountCandidates(out, original);
  return ranked.all.length ? ranked.all : out.filter((t) => !accountNumberPrefer.isBlockedNoise(t, original));
}

function collectClientMessageTexts(conversation) {
  const out = [];
  const src = (conversation && conversation.source) || {};
  if (src.body && src.author && (src.author.type === 'user' || src.author.type === 'lead')) {
    out.push(stripHtml(src.body));
  }
  const parts = partsOf(conversation);
  for (const p of parts) {
    const a = p.author || {};
    if (a.type !== 'user' && a.type !== 'lead') continue;
    if (p.part_type === 'note') continue;
    const body = stripHtml(p.body || '');
    if (body) out.push(body);
  }
  return out;
}

function isUsableClientEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !e.includes('@')) return false;
  // Never treat Intercom/company/support addresses as "client-provided" note email.
  if (/@intercom\.io$/i.test(e)) return false;
  // *@intercom-mail.com and *@*.intercom-mail.com (e.g. fundedelite.intercom-mail.com)
  if (/intercom-mail\.com$/i.test(e)) return false;
  if (/@(fundedelite\.com|fundedelitetraders\.com)$/i.test(e)) return false;
  if (/^(support|noreply|no-reply|hello|info)@/i.test(e)) return false;
  return true;
}

function collectEscalateIds(conversation, bits, modelBody) {
  // Account + Email for notes: ONLY from what the CLIENT wrote in chat.
  // Never auto-fill Intercom contact email (bits.email) , Arsal lock: note email
  // is only what we asked the client for and they provided.
  void bits;
  void modelBody;
  const clientTexts = collectClientMessageTexts(conversation);
  const blob = clientTexts.join('\n');
  const accounts = extractAccountNumbersFromText(blob);
  const ranked = accountNumberPrefer.rankAccountCandidates(accounts, blob, {
    messageTexts: clientTexts,
  });
  const rankedAll = ranked.all && ranked.all.length ? ranked.all : [];
  const emails = extractEmailsFromText(blob).filter(isUsableClientEmail);
  let ids = {
    account: accountNumberPrefer.formatAccountField(rankedAll) || ranked.primary || '',
    email: emails[0] || '',
    accounts: rankedAll,
    emails,
  };
  // Contextual pending ask: if last bot public reply requested account/email,
  // treat the latest client reply's account-like / email token as that field.
  ids = applyContextualPendingIds(conversation, ids);
  return ids;
}

function nlToBr(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br>');
}

function rewriteBareNumberOrderLabels(text, account) {
  let t = String(text || '');
  const acct = String(account || '').trim();
  if (!acct) return t;
  const esc = acct.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // "order 131324" / "order ID 131324" / "order/challenge ID: 131324" -> account
  t = t.replace(new RegExp('\\border\\s*(?:/\\s*challenge\\s*)?(?:id|#)?\\s*[:=]?\\s*' + esc + '\\b', 'gi'), 'account ' + acct);
  t = t.replace(new RegExp('\\bchallenge\\s*(?:/\\s*order\\s*)?(?:id|#)?\\s*[:=]?\\s*' + esc + '\\b', 'gi'), 'account ' + acct);
  return t;
}

function sanitizeEscalateProblem(text, account, email) {
  // Credentials are removed before any note field or customer line is built.
  let t = fixedMessageHandoff.redactCredentials(String(text || ''));
  t = rewriteBareNumberOrderLabels(t.replace(/\r\n/g, '\n').trim(), account);
  // Drop structured fields the note already has above Problem
  t = t.replace(/^\s*(Account|Email|Order(?:\/challenge)?(?:\s*ID)?|Action needed|KIND|BODY|CLIENT|ACTION_NEEDED)\s*:.*$/gim, '');
  t = t.replace(/\bRegistered email\s*:?\s*/gi, '');
  t = t.replace(/\bOrder\/challenge ID\s*:?\s*/gi, '');
  t = t.replace(/\bchallenge\/order ID\s*:?\s*/gi, '');
  t = t.replace(/\b(account|order|challenge)\s*(number|id|#)?\s*[:=]\s*[A-Za-z0-9\-]+/gi, '');
  if (email) {
    const re = new RegExp(String(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    t = t.replace(re, '');
  }
  if (account) {
    const re = new RegExp('\\b' + String(account).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    t = t.replace(re, '');
  }
  t = fixedMessageHandoff.redactUnlabeledSecrets(t);
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');
  t = t.replace(/\(\s*\)/g, '');
  t = t.replace(/\s+([,.;])/g, '$1');
  t = t.replace(/([,.;]){2,}/g, '$1');
  t = t.replace(/^[,.\s]+|[,.\s]+$/g, '').trim();
  return t || 'Client needs backend / verification review.';
}

/** Arsal lock: internal notes always English (never Roman Urdu / Urdu / Italian / Hindi for notes). */
function looksNonEnglishNote(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  // Devanagari (Hindi). Detected before any translation prompt is built.
  if (/[\u0900-\u097F]/.test(t)) return true;
  // Urdu/Arabic script
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(t)) return true;
  // Common Roman Urdu / Urdu-Latin markers (word-ish)
  if (/\b(mujhe|mujhay|krna|karna|kriye|kijiye|nahi|nahin|acha|theek|please\s+check\s+kardo|account\s+check\s+karo|yeh|ye|hai\s+kya|kya\s+hai|bhai|sahab|janab|shukriya|meherbani)\b/i.test(t)) {
    return true;
  }
  // Italian note markers (common support phrasing)
  if (/\b(il\s+cliente|per\s+favore|grazie|non\s+riesco|verificare|conto\s+trading|mi\s+serve|vorrei|potete|prego)\b/i.test(t)) {
    return true;
  }
  return false;
}

async function ensureInternalNoteEnglish(text, label) {
  // Redact the original before the translation prompt, and redact the model
  // output before it can enter the note. A canary must not reach either.
  const original = String(text || '').trim();
  const raw = fixedMessageHandoff.redactCredentials(original);
  if (!raw) return raw;
  if (!looksNonEnglishNote(raw)) return raw;
  const promptText = raw;
  try {
    const ai = await openai.chat.completions.create({
      model: control.getModel(),
      messages: [
        {
          role: 'system',
          content:
            'Rewrite the following INTERNAL Intercom note field into clear English only. Keep meaning, names, numbers, emails, @mentions, and account IDs. No Roman Urdu, Urdu, Italian, Hindi, or other languages. No greeting. Output only the rewritten note text.',
        },
        { role: 'user', content: (label ? '[' + label + ']\n' : '') + promptText },
      ],
    });
    const out = fixedMessageHandoff.redactCredentials(
      (((ai.choices[0] || {}).message || {}).content || '').trim()
    );
    if (out) return out;
  } catch (e) {
    console.error('NOTE_EN_OVERLAY fail', label || '', e && e.message);
  }
  return raw;
}

async function buildEscalateNoteAndAssignee({ problem, actionNeeded, account, email, preferAssigneeId }) {
  let actives = await fetchActiveTeammatesForMention();
  actives = await fetchActiveTeammatesForMention();
  const one = pickOneActiveTeammate(actives, preferAssigneeId);
  if (one) console.log('TAG_PICK', one.name, one.id);

  const acct = account || 'Not provided';
  /* AUDIT_HARDEN_V1:noteEmail */
  // Final note Email: must pass isUsableClientEmail; intercom-mail / support -> Not provided
  let em = email || '';
  if (!em || /^not provided/i.test(String(em)) || !isUsableClientEmail(em)) {
    em = 'Not provided';
  }
  let problemText = sanitizeEscalateProblem(problem, account, email);
  let task = fixedMessageHandoff.redactCredentials(
    String(actionNeeded || 'Please review this case and guide the client.').trim()
  );
  problemText = await ensureInternalNoteEnglish(problemText, 'Problem');
  task = await ensureInternalNoteEnglish(task, 'Action needed');

  let actionHtml;
  let assigneeId = null;
  if (one) {
    actionHtml = adminMentionHtml(one) + ' ' + nlToBr(task);
    assigneeId = one.id;
  } else {
    // No Away-off Support teammate , Jerry path per Arsal lock
    actionHtml = jerryMentionHtml() + ' ' + UNSOLVED_JERRY_LINE;
    assigneeId = JERRY_ID;
  }

  const html =
    '<!-- ' + fixedMessageHandoff.HANDOFF_NOTE_MARKER + ' -->' +
    boldNoteLabel('Account:') +
    ' ' +
    acct +
    '<br>' +
    boldNoteLabel('Email:') +
    ' ' +
    em +
    '<br><br>' +
    boldNoteLabel('Problem:') +
    '<br>' +
    nlToBr(problemText) +
    '<br><br>' +
    boldNoteLabel('Action needed:') +
    '<br>' +
    actionHtml +
    '<br><br>' +
    boldNoteLabel('If remains unsolved:') +
    '<br>' +
    UNSOLVED_JERRY_LINE;

  return { html, teammate: one, assigneeId, problemText };
}

function isClearlyAccountSpecificIssue(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (
    /\b(why\s+(was|is|did)\s+my|my\s+(payout|withdrawal)\s+(was|is|got)\s+(rejected|denied|delayed|stuck)|my\s+account\s+(shows|is|was|got)\s+(breach|disabled|banned|flagged)|check\s+my\s+(account|balance|payout)|i\s+was\s+breached|my\s+dashboard\s+shows)\b/i.test(t)
  ) {
    return true;
  }
  if (/\b(not\s+eligible\s+for\s+(a\s+)?payout|payout\s+(is\s+)?not\s+eligible|payout[^.?!\n]{0,50}please\s+try\s+again)\b/i.test(t)) {
    return true;
  }
  if (/\b(i\s+can(?:not|'?t)|unable\s+to|won'?t\s+let\s+me)\b[^.?!\n]{0,45}\b(log\s*in|login|access\s+(my\s+)?account|sign\s*in)\b/i.test(t)) {
    return true;
  }
  if (/\b(wrong|invalid|incorrect|not\s+working|doesn'?t\s+work)\b[^.?!\n]{0,30}\b(password|credentials?|login)\b|\b(password|credentials?|login)\b[^.?!\n]{0,30}\b(wrong|invalid|incorrect|not\s+working|doesn'?t\s+work)\b/i.test(t)) {
    return true;
  }
  return /\b(my|mine|i|we)\b[^.?!\n]{0,70}\b(kyc|verification|balance|credentials?|account|payout|withdrawal|dashboard)\b[^.?!\n]{0,70}\b(stuck|pending|failed|rejected|denied|disabled|breached|flagged|wrong|missing|not\s+working|not\s+eligible|can(?:not|'?t)|unable)\b/i.test(t);
}

function looksLikeMixedNonPromoQuestion(text) {
  const t = String(text || '');
  return /\b(drawdown|daily\s+loss|max(?:imum)?\s+loss|consistency|profit\s+target|leverage|kyc|breach|payout\s+status|second\s+chance|restricted|news\s+trading|expert\s+advisor|\bea\b|weekend\s+hold|copy\s+trad|scalping|reset\s+fee)\b/i.test(t);
}

function isPromotionQuestion(text) {
  const t = String(text || '');
  if (!t || isClearlyAccountSpecificIssue(t)) return false;
  // PLAN_DIFF_GATE: never treat plan-difference / features compares as promo
  if (
    septemberPromos &&
    typeof septemberPromos.isPlanDifferenceOrFeaturesAsk === 'function' &&
    septemberPromos.isPlanDifferenceOrFeaturesAsk(t) &&
    !(
      /\b(discount|promo(?:tion)?s?|coupon|offer|sep\s*35|sep35|%\s*off|price)\b/i.test(t)
    )
  ) {
    return false;
  }
  if (/\b(sep\s*35|sep35|flash\s*5|flash5|new\s*50|new50)\b/i.test(t)) return true;
  if (/\b(promo(?:tion)?s?|discount(?:s)?|coupon(?:s)?|offer(?:s)?|voucher(?:s)?)\b/i.test(t)) return true;
  if (/\b(\d+\s*%\s*off|percent(?:age)?\s*off)\b/i.test(t)) return true;
  if (/\bany\s+(?:deals?|sales?|promos?|offers?|discounts?)\b/i.test(t)) return true;
  if (/flash\s*activation/i.test(t) && /\b(\$\s*5|5\s*dollars?|buy\s*1|get\s*4|bogo|free)\b/i.test(t)) return true;
  if (/\bweekly\s*payout\b/i.test(t)) return true;
  if (/\b(bulk\s+discount|bulk\s+(?:buy|purchase)|quantity\s+discount)\b/i.test(t)) return true;
  if (/\bbulk\b/i.test(t) && /\b(discount|promo|offer|sep35|challenge)\b/i.test(t)) return true;
  if (/instant\s*elite/i.test(t) && /(50|100|200|300|400)\s*k\b/i.test(t) && !looksLikeMixedNonPromoQuestion(t)) return true;
  return false;
}

/** Build recent public user+admin/bot comments for promo conversation context (last N). */
function buildPromoConversationHistory(conv, maxN) {
  const out = [];
  const srcMsg = (conv && conv.source) || {};
  if (srcMsg.body) {
    const a = srcMsg.author || {};
    const role = a.type === 'user' || a.type === 'lead' ? 'user' : 'assistant';
    const text = stripHtml(srcMsg.body || '').trim();
    if (text) out.push({ role, text });
  }
  const parts = partsOf(conv || {});
  for (const p of parts) {
    if (!p) continue;
    if (String(p.part_type || '') !== 'comment') continue;
    const a = p.author || {};
    const text = stripHtml(p.body || '').trim();
    if (!text) continue;
    if (a.type === 'user' || a.type === 'lead') out.push({ role: 'user', text });
    else if (a.type === 'admin' || a.type === 'bot') out.push({ role: 'assistant', text });
  }
  const n = Math.max(4, Math.min(Number(maxN) || 16, 20));
  return out.slice(-n);
}

/**
 * Promo short-circuit resolver with conversation history.
 * Returns { reply } to send, or null to fall through to FAQ/AI (rules / mixed / no promo).
 */
function resolvePromoReply(text, conv) {
  if (!septemberPromos) return null;
  if (isClearlyAccountSpecificIssue(text)) return null;
  const history = buildPromoConversationHistory(conv, 18);
  {
    const __mix = softEdges.shouldBypassPromoShortCircuit(text, history);
    if (__mix.bypass) {
      if (__mix.classification && __mix.classification.systemHint && typeof global !== 'undefined') {
        global.__lunaSoftEdgePromoHint = __mix.classification.systemHint;
      }
      return null;
    }
  }
  /* AUDIT_HARDEN_V1:promoScopeGate */
  if (typeof softEdges.isResetFeeOrAccountDiscountAsk === 'function' && softEdges.isResetFeeOrAccountDiscountAsk(text)) {
    return null;
  }
  if (
    typeof softEdges.isBareDiscountAsk === 'function' &&
    softEdges.isBareDiscountAsk(text) &&
    typeof softEdges.historyLooksLikeResetFeeContext === 'function' &&
    softEdges.historyLooksLikeResetFeeContext(history)
  ) {
    return null;
  }
  const planDiffNow =
    typeof septemberPromos.isPlanDifferenceOrFeaturesAsk === 'function' &&
    septemberPromos.isPlanDifferenceOrFeaturesAsk(text);
  const featuresCtx =
    typeof septemberPromos.historyLooksLikePlanDifference === 'function' &&
    septemberPromos.historyLooksLikePlanDifference(history);
  const promoSigNow =
    typeof septemberPromos.isPromoSignal === 'function'
      ? septemberPromos.isPromoSignal(text)
      : /\b(discount|promo|coupon|offer|sep35|%\s*off)\b/i.test(String(text || ''));
  // Plan-difference / features topic (incl. short "2 step" follow-up) → NEVER promo short-circuit
  if ((planDiffNow || featuresCtx) && !promoSigNow) return null;
  const histLooks =
    typeof septemberPromos.historyLooksLikePromotions === 'function' &&
    septemberPromos.historyLooksLikePromotions(history);
  const shortFollow =
    typeof septemberPromos.isShortPromoFollowUp === 'function' &&
    septemberPromos.isShortPromoFollowUp(text, history);
  const gate =
    isPromotionQuestion(text) ||
    histLooks ||
    shortFollow;
  if (!gate) return null;
  // Mixed rules+non-promo on a fresh (no promo history) ask → fall through
  if (looksLikeMixedNonPromoQuestion(text) && !histLooks && !shortFollow) return null;

  let result = null;
  try {
    if (typeof septemberPromos.handleCustomerMessage === 'function') {
      result = septemberPromos.handleCustomerMessage(text, history);
    } else if (typeof septemberPromos.answerPromotionQuestion === 'function') {
      result = septemberPromos.answerPromotionQuestion(text, history);
    }
  } catch (e) {
    console.error('PROMO_RESOLVE_FAIL', e && e.message);
    return null;
  }
  if (result == null) return null;
  if (typeof result === 'object' && result.useExistingRulesFlow) return null;
  const reply = typeof result === 'string' ? result : result && result.reply;
  if (!reply || !String(reply).trim()) return null;
  const product =
    typeof septemberPromos.detectProduct === 'function' ? septemberPromos.detectProduct(text) : '';
  return { reply: String(reply).trim(), product, historyLen: history.length };
}

function isPromotionQuestionWithHistory(text, conv) {
  if (isPromotionQuestion(text)) return true;
  if (!septemberPromos || !conv) return false;
  const history = buildPromoConversationHistory(conv, 18);
  if (
    typeof septemberPromos.historyLooksLikePromotions === 'function' &&
    septemberPromos.historyLooksLikePromotions(history)
  ) {
    return true;
  }
  if (
    typeof septemberPromos.isShortPromoFollowUp === 'function' &&
    septemberPromos.isShortPromoFollowUp(text, history)
  ) {
    return true;
  }
  return false;
}

function isGeneralPolicyQuestion(text) {
  const t = String(text || '');
  if (isClearlyAccountSpecificIssue(t)) return false;
  if (typeof isReviewNotificationProcessAsk === 'function' && isReviewNotificationProcessAsk(t)) return true;
  if (isPromotionQuestion(t)) return true;
  // "is the consistency rule in the account" / "does my account have X rule"
  if (/\b(is|does|do)\b[\s\S]{0,40}\b(consistency|profit\s*split|drawdown|daily\s+loss|max(?:imum)?\s+loss|leverage|payout\s+schedule|minimum\s+(?:payout|withdrawal)|reset|second\s+chance|scalping|news\s+trading|ea|expert\s+advisor|weekend\s+hold(?:ing)?|fee[ -]?back|profit\s+target)\b/i.test(t)) {
    return true;
  }
  if (/\b(what\s+is|what'?s|how\s+does|how\s+do|explain|tell\s+me\s+about)\b[\s\S]{0,60}\b(consistency|profit\s*split|drawdown|leverage|payout|reset|rule|policy|kyc|withdrawal|minimum)\b/i.test(t)) {
    return true;
  }
  if (/\b(don'?t|do\s+not)\s+pass\b/i.test(t) && /\b(rule|consistency|policy)\b/i.test(t)) return true;
  return false;
}

function isIdentityAskBody(text) {
  const t = String(text || '');
  // Matches our gate asks (full or missing-field-only variants)
  if (!/(account\s*number|account\s*#|registered\s+email|fundedelite\s+email)/i.test(t)) return false;
  return /(please\s+share|can\s+you\s+send|before\s+i\s+pass|forward|teammate|team)/i.test(t);
}

function hasArsalEscalateNote(parts) {
  for (const p of parts || []) {
    if (String(p.part_type || '') !== 'note') continue;
    if (String((p.author || {}).id || '') !== ARSAL_ID) continue;
    if (isEscalateOrSystemNote(stripHtml(p.body || ''))) return true;
  }
  return false;
}

function isPendingIdentityAsk(parts) {
  let last = '';
  for (const p of parts || []) {
    const a = p.author || {};
    if (String(a.id || '') !== ARSAL_ID) continue;
    if (String(p.part_type || '') === 'note') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    last = body;
  }
  return isIdentityAskBody(last);
}

// --- Identity recall (merged from client-info-recall concepts; live path stays index.js) ---
const IDENTITY_REQUEST_HINT =
  /(please\s+)?(share|provide|send|confirm|give|enter|drop|type)\b|\bwhat\s+is\s+your\b|\bneed\s+your\b|\bcan\s+you\s+(share|send|provide)\b|\bbefore\s+i\s+pass\b|\bforward\b|\bteammate\b/i;

const MAX_IDENTITY_ASKS_PER_FIELD = 2; // 1 clear ask + 1 clarification max

/** Real identity only — placeholders / empty must not unlock ACCOUNT escalate. */
function isUsableEscalateAccount(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  if (/^not provided\b/i.test(s)) return false;
  if (/unclear after asks/i.test(s)) return false;
  return true;
}
function isUsableEscalateEmail(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  if (/^not provided\b/i.test(s)) return false;
  if (/unclear after asks/i.test(s)) return false;
  return s.includes('@');
}
function hasUsableEscalateIdentity(ids, declinedAccount, declinedEmail) {
  if (declinedAccount || declinedEmail) return true;
  return isUsableEscalateAccount(ids && ids.account) || isUsableEscalateEmail(ids && ids.email);
}


function detectIdentityAskFields(text) {
  const t = String(text || '');
  if (!t) return { account: false, email: false };
  // Shared tight detector: request verb / question in the SAME sentence as the field noun.
  // Bare mentions ("your account is under review", "we'll email you", "they have your
  // account details") are NOT asks , previously they were, which blocked normal replies
  // and forced spurious escalations / inflated ask counts.
  const out = idGates.detectIdentityAskFields(t);
  if (isIdentityAskBody(t)) {
    // Our own gate ask variants always count.
    if (/account\s*(number|#)/i.test(t) && !/e-?mail[\s\S]{0,40}account\s+\d{5,12}/i.test(t)) out.account = true;
    if (/(registered|fundedelite)\s+e-?mail/i.test(t)) out.email = true;
  }
  // Explicit MT5 login/ID request counts as an account ask (never client-visible by lock).
  if (/\bmt5\s*(login|account|id)\b/i.test(t) && IDENTITY_REQUEST_HINT.test(t)) out.account = true;
  return out;
}

function lastBotPublicIdentityPending(parts) {
  for (let i = (parts || []).length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!p) continue;
    const a = p.author || {};
    if (String(p.part_type || '') === 'note') continue;
    if (String(a.id || '') !== ARSAL_ID && a.type !== 'bot') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    const fields = detectIdentityAskFields(body);
    if (fields.account || fields.email) {
      return { account: fields.account, email: fields.email, body };
    }
    // Stop at last bot public comment even if it wasn't an ask
    return null;
  }
  return null;
}

function countIdentityFieldAsks(parts, field) {
  let n = 0;
  for (const p of parts || []) {
    const a = p.author || {};
    if (String(p.part_type || '') === 'note') continue;
    if (String(a.id || '') !== ARSAL_ID && a.type !== 'bot') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    const f = detectIdentityAskFields(body);
    if (field === 'account' && f.account) n += 1;
    if (field === 'email' && f.email) n += 1;
  }
  return n;
}

function extractAccountsFromPendingReply(text) {
  // Contextual: after an account ask, accept 5-12 / letter+digit / spaced from the reply.
  const s = String(text || '');
  const out = extractAccountNumbersFromText(s);
  if (out.length) return out;
  // Bare token in a longer sentence already covered by \d{5,12}; keep letter+digit fallback
  for (const m of s.matchAll(/\b[A-Za-z]\d{4,}\b/g)) {
    const x = m[0];
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

function applyContextualPendingIds(conversation, ids) {
  const parts = partsOf(conversation);
  const pending = lastBotPublicIdentityPending(parts);
  if (!pending) return ids;
  const clientTexts = collectClientMessageTexts(conversation);
  const latest = clientTexts.length ? clientTexts[clientTexts.length - 1] : '';
  if (!latest) return ids;
  const next = { ...ids, accounts: (ids.accounts || []).slice(), emails: (ids.emails || []).slice() };
  if (pending.account && !next.account) {
    const found = extractAccountsFromPendingReply(latest).filter(
      (t) => !accountNumberPrefer.isBlockedNoise(t, latest)
    );
    if (found.length) {
      for (let i = found.length - 1; i >= 0; i--) {
        if (!next.accounts.includes(found[i])) next.accounts.unshift(found[i]);
      }
      next.account = accountNumberPrefer.formatAccountField(found) || found[0];
    }
  }
  if (pending.email && !next.email) {
    const emails = extractEmailsFromText(latest).filter(isUsableClientEmail);
    if (emails[0]) {
      next.email = emails[0];
      if (!next.emails.find((e) => e.toLowerCase() === emails[0].toLowerCase())) {
        next.emails.unshift(emails[0]);
      }
    }
  }
  return next;
}

function draftAsksIdentityFields(draft) {
  return detectIdentityAskFields(draft);
}

/** Pre-send gate: block re-asks of known OR declined identity; block email ask when account enough. */
function preSendIdentityCheck(conversation, draftMessage) {
  const draft = String(draftMessage || '').trim();
  if (!draft) return { ok: false, reason: 'empty draft', known: null, asks: null };
  let ids = collectEscalateIds(conversation, {}, '');
  ids = applyContextualPendingIds(conversation, ids);
  const declinedAccount = clientSaidNoAccount(conversation);
  const declinedEmail = clientSaidNoEmail(conversation);
  const asks = draftAsksIdentityFields(draft);
  const gateIds = {
    accountNumber: ids.account || null,
    email: ids.email || null,
    declinedAccount,
    declinedEmail,
  };
  const gated = idGates.preSendIdentityCheck(gateIds, draft);
  if (!gated.ok) {
    return { ok: false, reason: gated.reason, known: ids, asks };
  }
  if (asks.account && ids.account) {
    return {
      ok: false,
      reason: 'account already known (' + ids.account + ') , do not re-ask',
      known: ids,
      asks,
    };
  }
  if (asks.account && declinedAccount) {
    return {
      ok: false,
      reason: 'client declined account , do not re-ask',
      known: ids,
      asks,
    };
  }
  if (asks.email && ids.email) {
    return {
      ok: false,
      reason: 'email already known (' + ids.email + ') , do not re-ask',
      known: ids,
      asks,
    };
  }
  if (asks.email && declinedEmail) {
    return {
      ok: false,
      reason: 'client declined email , do not re-ask',
      known: ids,
      asks,
    };
  }
  if (asks.email && ids.account) {
    return {
      ok: false,
      reason: 'account ' + ids.account + ' already enough for escalate , do not ask email',
      known: ids,
      asks,
    };
  }
  return { ok: true, reason: null, known: ids, asks };
}

/** Map live ids + declines through idGates.pickAccountEmailAsk decision. */
function resolveIdentityAskDecision(conversation, ids, kind) {
  const partsGate = partsOf(conversation);
  const declinedAccount = clientSaidNoAccount(conversation);
  const declinedEmail = clientSaidNoEmail(conversation);
  const acctAsks = countIdentityFieldAsks(partsGate, 'account');
  const emailAsks = countIdentityFieldAsks(partsGate, 'email');
  const decision = idGates.pickAccountEmailAsk({
    accountNumber: ids.account || null,
    email: ids.email || null,
    declinedAccount,
    declinedEmail,
    kind: kind === 'EMAIL_REQUIRED' ? 'EMAIL_REQUIRED' : 'ACCOUNT',
    alreadyAskedAccount: acctAsks >= MAX_IDENTITY_ASKS_PER_FIELD,
    alreadyAskedEmail: emailAsks >= MAX_IDENTITY_ASKS_PER_FIELD,
  });
  if (declinedAccount && !ids.account) {
    ids.account = 'Not provided (client has no account / not purchased)';
  }
  if (declinedEmail && !ids.email) {
    ids.email = 'Not provided (client has no email)';
  }
  // Never invent "Not provided (unclear after asks)" — that unlocked empty escalations
  // and public "sent to teammate" replies before the client shared an account number.
  // Exhausted asks => wait (gates return ready:false awaiting_client_identity_after_asks).
  let needAccount = decision.ask === 'account';
  let needEmail = decision.ask === 'email';
  let readyOut = !!decision.ready;
  // Fail closed: exhausted/ready without a real account/email (and no decline) is NOT ready.
  if (readyOut && !hasUsableEscalateIdentity(ids, declinedAccount, declinedEmail)) {
    readyOut = false;
    if (!needAccount && !needEmail) {
      // Keep waiting for client rather than unlocking empty escalate.
      needAccount = !ids.account && !declinedAccount;
      needEmail = false;
    }
  }
  return {
    decision,
    needAccount,
    needEmail,
    ready: readyOut,
    declinedAccount,
    declinedEmail,
    noteExtraLines: idGates
      .identityEscalationNoteExtras({
        accountNumber:
          ids.account && !String(ids.account).startsWith('Not provided') ? ids.account : null,
        email: ids.email && !String(ids.email).startsWith('Not provided') ? ids.email : null,
        declinedAccount,
        declinedEmail,
      })
      .filter((l) => String(l).startsWith('Note:')),
  };
}

function pickAccountEmailAsk(needAccount, needEmail) {
  const wantAcct = needAccount !== false;
  const wantEmail = needEmail !== false;
  // Ask only for the missing field. Do not promise a teammate handoff here.
  // That sentence is allowed only after the handoff has actually succeeded.
  if (wantAcct && !wantEmail) {
    const variants = [
      'Please share your account number.',
      'Can you send the account number linked to this issue?',
      'Which account number is this about?',
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }
  if (!wantAcct && wantEmail) {
    const variants = [
      'Please share the registered FundedElite email for this account.',
      'Can you send the registered email linked to that account?',
      'Which registered email is on your FundedElite account?',
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }
  const variants = [
    'Please share your account number and the email registered on your FundedElite account.',
    'Can you send your account number and registered email?',
    'Please share your account number and registered FundedElite email.',
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

/**
 * Shared fail-closed identity gate for every account-specific escalation path.
 * Returns ready=false after asking once, so callers must stop before any public
 * "forwarded" message, internal note, or assignment is created.
 */
async function ensureIdentityBeforeAccountEscalate({
  conversationId,
  full,
  bits,
  text,
  kind,
  latestUser,
  clientName,
  modelBody,
  modelClient,
}) {
  let currentFull = full;
  let ids = collectEscalateIds(currentFull, bits, String(modelBody || '') + '\n' + String(modelClient || ''));
  let resolvedId = resolveIdentityAskDecision(currentFull, ids, kind || 'ACCOUNT');
  let needAccount = resolvedId.needAccount;
  let needEmail = resolvedId.needEmail;

  if (needAccount || needEmail) {
    try {
      const freshGate = await fetchConversation(conversationId);
      if (freshGate) {
        currentFull = freshGate;
        ids = collectEscalateIds(currentFull, bits, String(modelBody || '') + '\n' + String(modelClient || ''));
        resolvedId = resolveIdentityAskDecision(currentFull, ids, kind || 'ACCOUNT');
        needAccount = resolvedId.needAccount;
        needEmail = resolvedId.needEmail;
      }
    } catch (e) {
      console.error('IDENTITY_BEFORE_ESCALATE refetch fail', conversationId, e && e.message);
    }
  }

  if (!(needAccount || needEmail)) {
    return { ready: true, full: currentFull, ids, resolvedId };
  }

  const ask = pickAccountEmailAsk(needAccount, needEmail);
  const pre = preSendIdentityCheck(currentFull, ask);
  if (pre.ok) {
    await postClientCommentOnce(conversationId, ask, latestUser, clientName);
    console.log('IDENTITY_BEFORE_ESCALATE asked missing', conversationId, {
      needAccount,
      needEmail,
      kind: kind || 'ACCOUNT',
      decision: resolvedId.decision.reason,
    });
    return { ready: false, asked: true, full: currentFull, ids, resolvedId };
  }

  if (pre.known) {
    if (pre.known.account) ids.account = pre.known.account;
    if (pre.known.email) ids.email = pre.known.email;
  }
  resolvedId = resolveIdentityAskDecision(currentFull, ids, kind || 'ACCOUNT');
  needAccount = resolvedId.needAccount;
  needEmail = resolvedId.needEmail;
  if (!(needAccount || needEmail)) {
    return { ready: true, full: currentFull, ids, resolvedId };
  }

  const retryAsk = pickAccountEmailAsk(needAccount, needEmail);
  const retryPre = preSendIdentityCheck(currentFull, retryAsk);
  if (retryPre.ok) {
    await postClientCommentOnce(conversationId, retryAsk, latestUser, clientName);
    console.log('IDENTITY_BEFORE_ESCALATE asked missing after refresh', conversationId, {
      needAccount,
      needEmail,
      kind: kind || 'ACCOUNT',
    });
    return { ready: false, asked: true, full: currentFull, ids, resolvedId };
  }

  console.error('IDENTITY_BEFORE_ESCALATE blocked empty-identity escalation', conversationId, {
    needAccount,
    needEmail,
    reason: retryPre.reason || pre.reason,
    text: String(text || '').slice(0, 160),
  });
  return { ready: false, asked: false, blocked: true, full: currentFull, ids, resolvedId };
}

const TICKET_STATE_FILE = process.env.TICKET_STATE_FILE || '/home/ubuntu/bot-ticket-state.json';
const TICKET_STATE_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

// First out-of-scope ask in a conversation , fresh decline lines.
const SCOPE_DECLINE_VARIANTS_FIRST = [
  "That's outside what I can help with , I only handle FundedElite here. Anything on your account I can help with?",
  "I can't get into that one, that's a different company. What can I help you with on your FundedElite account?",
  "That's not something I can help with, I'm afraid. Is there something on your account I can look into?",
  "Outside what I cover, unfortunately. Anything I can help with on the FundedElite side?",
  "I'll have to pass on that one. What can I help you with on your account or challenge?",
];

// Second+ ask in the same conversation , reference the earlier boundary naturally.
const SCOPE_DECLINE_VARIANTS_REPEAT = [
  "Same as before , that's a different company, not something I can get into here.",
  "Like I mentioned, I only handle FundedElite questions.",
  "Same deal as last time , outside what I can help with here.",
  "As I said, that one's not something I can help with , just FundedElite stuff on my end.",
  "Again, that's not one I can speak to , happy to help with anything on your account though.",
];

function isEscalationsTeambox(conversation) {
  const team = conversation && conversation.team_assignee_id != null ? String(conversation.team_assignee_id) : '0';
  return team === ESCALATIONS_TEAM_ID;
}

function isHumanTeamPublicReply(part) {
  const a = (part && part.author) || {};
  if (!part || part.part_type === 'note') return false;
  if (a.type !== 'admin' && a.type !== 'bot') return false;
  const id = String(a.id || '');
  // Luna/Arsal bot + Elite AI/Fin do not count as Escalations/Risk "team" replies.
  if (id === ARSAL_ID || id === ELITE_AI_ID) return false;
  // Only real public comment text counts , never assignment/close/snooze/open/empty.
  if (String(part.part_type || '') !== 'comment') return false;
  const body = stripHtml(part.body || '');
  if (!body) return false;
  return true;
}

function lastHumanTeamReplyUnix(parts) {
  let t = 0;
  for (const p of parts || []) {
    if (!isHumanTeamPublicReply(p)) continue;
    const at = Number(p.created_at || 0);
    if (at > t) t = at;
  }
  return t;
}

function clientMessagesAfter(parts, afterUnix, conversation) {
  const out = [];
  const floor = Number(afterUnix || 0);
  const seen = new Set();

  // Email/first message often lives only on conversation.source, not in parts
  const src = (conversation && conversation.source) || {};
  if (src.author && src.author.type === 'user' && src.body) {
    const at = Number((conversation && conversation.created_at) || 0);
    const body = stripHtml(src.body);
    if (body && (!floor || at > floor)) {
      const id = 'source-' + at;
      seen.add(id);
      out.push({ id, at, body });
    }
  }

  for (const p of parts || []) {
    const a = p.author || {};
    if (a.type !== 'user') continue;
    if (p.part_type === 'note') continue;
    // Client reopen-with-text comes as part_type "open"
    const pt = String(p.part_type || '');
    if (pt && pt !== 'comment' && pt !== 'open') continue;
    const at = Number(p.created_at || 0);
    if (floor && at <= floor) continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    const id = String(p.id || at);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, at, body });
  }
  return out;
}

async function summarizeEscalationsClientBatch(messages) {
  const joined = (messages || []).map((m, i) => (i + 1) + '. ' + m.body).join('\n');
  try {
    const ai = await openai.chat.completions.create({
      model: control.getModel(),
      messages: [
        {
          role: 'system',
          content:
            'Summarize the client messages into one short English-only internal note paragraph for a teammate. Always English , never Roman Urdu, Urdu, or Italian in notes (even if the client wrote in those languages). Start with the client ask only. No greeting, no ACTION labels, no client-facing tone. Max ~3 sentences.',
        },
        { role: 'user', content: joined },
      ],
    });
    const out = (((ai.choices[0] || {}).message || {}).content || '').trim();
    if (out) {
      const cleaned = out.replace(/^Problem:\s*/i, '').trim();
      return await ensureInternalNoteEnglish(cleaned, 'Escalations summary');
    }
  } catch (e) {
    console.error('ESCALATIONS summarize fail', e && e.message);
  }
  const fallback = (messages || []).map((m) => m.body).join(' | ');
  return await ensureInternalNoteEnglish(fallback, 'Escalations summary fallback');
}

async function buildEscalationsWatchNote(full, messages) {
  const summary = await summarizeEscalationsClientBatch(messages);
  const assigneeId =
    full.admin_assignee_id != null && String(full.admin_assignee_id) !== '0'
      ? String(full.admin_assignee_id)
      : '';
  let mention = '';
  if (assigneeId && assigneeId !== ARSAL_ID && assigneeId !== ELITE_AI_ID && !NEVER_MENTION_IDS.has(assigneeId)) {
    let name = 'teammate';
    try {
      const r = await axios.get('https://api.intercom.io/admins/' + assigneeId, {
        headers: icHeaders(),
        timeout: IC_TIMEOUT_MS,
        validateStatus: () => true,
      });
      if (r.status < 400 && r.data && r.data.name) name = String(r.data.name);
    } catch (_) {}
    mention = adminMentionHtml({ id: assigneeId, name }) + '<br><br>';
  }
  return (
    mention +
    '<b>Problem:</b><br>' +
    nlToBr(summary)
  );
}

function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function pendingLongMessages(pending) {
  return (pending || []).filter((m) => countWords(m && m.body) >= LONG_MSG_WORD_MIN);
}

function isJerryAssigned(conversation) {
  const admin = conversation && conversation.admin_assignee_id != null ? String(conversation.admin_assignee_id) : '0';
  return admin === JERRY_ID;
}

async function handleEscalationsSilentNoteOnly(conversationId, full) {
  // NEVER client-reply on Escalations teambox. Note-only under strict gates.
  // Gates (either path, both need 15m team silence):
  //  A) ≥3 NEW pending client msgs since last Escalations note (not already covered)
  //  B) any single NEW pending client msg ≥150 words
  // Do NOT re-note when one extra short message arrives after a batch was already noted.
  const parts = partsOf(full);
  const lastTeamAt = lastHumanTeamReplyUnix(parts);
  const pending = clientMessagesAfter(parts, lastTeamAt, full);
  const { state, id } = getConvState(conversationId);
  const covered = new Set(
    String(state.escalationsNotedMsgIds || '')
      .split(',')
      .map((x) => String(x || '').trim())
      .filter(Boolean)
  );
  const freshPending = pending.filter((m) => !covered.has(String(m.id)));
  const longMsgs = pendingLongMessages(freshPending);
  const batchReady = freshPending.length >= ESCALATIONS_MIN_CLIENT_MSGS;
  const longReady = longMsgs.length > 0;

  if (!batchReady && !longReady) {
    console.log(
      'ESCALATIONS wait , fresh client msgs',
      conversationId,
      freshPending.length,
      '<',
      ESCALATIONS_MIN_CLIENT_MSGS,
      '(pending',
      pending.length,
      'covered',
      covered.size,
      ', no new 150+ word msg)'
    );
    return { noted: false, reason: 'need_3_fresh_client_msgs', count: freshPending.length };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const anchor = lastTeamAt || Number(full.created_at || 0) || nowSec;
  const silence = nowSec - anchor;
  if (silence < ESCALATIONS_SILENCE_SEC) {
    console.log('ESCALATIONS wait , silence', conversationId, silence, '<', ESCALATIONS_SILENCE_SEC);
    return { noted: false, reason: 'under_15m', silence };
  }

  const noteMessages = batchReady ? freshPending : longMsgs;
  const path = batchReady ? 'batch3' : 'long150';
  const sig = path + ':' + noteMessages.map((m) => m.id).join(',');
  if (state.escalationsNoteSig === sig) {
    console.log('ESCALATIONS skip duplicate note batch', conversationId);
    return { noted: false, reason: 'duplicate_batch' };
  }

  const html = await buildEscalationsWatchNote(full, noteMessages);
  await postReply(conversationId, 'note', html);
  state.escalationsNoteSig = sig;
  state.escalationsNoteAt = Date.now();
  // Mark all pending (incl. ones in this note) as covered so +1 short follow-up cannot re-fire
  for (const m of pending) covered.add(String(m.id));
  state.escalationsNotedMsgIds = Array.from(covered).slice(-80).join(',');
  saveConvState(id, state);
  console.log(
    'ESCALATIONS note-only',
    conversationId,
    'path',
    path,
    'msgs',
    noteMessages.length,
    'silence',
    silence
  );
  return { noted: true, count: noteMessages.length, silence, path };
}

async function handleJerryOrEscalationsLongMessageNote(conversationId, full) {
  // Escalations teambox OR Jerry-assigned: 15m team silence + ≥150-word client msg → summary note.
  // Escalations tickets are handled fully by handleEscalationsSilentNoteOnly (includes this path).
  // This function is for Jerry-assigned tickets outside Escalations/Risk silent flows.
  if (isEscalationsTeambox(full) || isRiskTeambox(full)) {
    return { noted: false, reason: 'owned_by_teambox_handler' };
  }
  if (!isJerryAssigned(full)) {
    return { noted: false, reason: 'not_jerry' };
  }

  const parts = partsOf(full);
  const lastTeamAt = lastHumanTeamReplyUnix(parts);
  const pending = clientMessagesAfter(parts, lastTeamAt, full);
  const longMsgs = pendingLongMessages(pending);
  if (!longMsgs.length) {
    return { noted: false, reason: 'no_long_msg' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const anchor = lastTeamAt || Number(full.created_at || 0) || nowSec;
  const silence = nowSec - anchor;
  if (silence < ESCALATIONS_SILENCE_SEC) {
    console.log('JERRY_LONG wait , silence', conversationId, silence, '<', ESCALATIONS_SILENCE_SEC);
    return { noted: false, reason: 'under_15m', silence };
  }

  const sig = 'long:' + longMsgs.map((m) => m.id).join(',');
  const { state, id } = getConvState(conversationId);
  if (state.longMsgNoteSig === sig) {
    console.log('JERRY_LONG skip duplicate', conversationId);
    return { noted: false, reason: 'duplicate_batch' };
  }

  const html = await buildEscalationsWatchNote(full, longMsgs);
  await postReply(conversationId, 'note', html);
  state.longMsgNoteSig = sig;
  state.longMsgNoteAt = Date.now();
  saveConvState(id, state);
  console.log('JERRY_LONG note', conversationId, 'msgs', longMsgs.length, 'silence', silence);
  return { noted: true, count: longMsgs.length, silence };
}

function isRiskTeambox(conversation) {
  const team = conversation && conversation.team_assignee_id != null ? String(conversation.team_assignee_id) : '0';
  return team === RISK_TEAM_ID;
}

async function handleRiskSilentNoteOnly(conversationId, full) {
  // NEVER client-reply on Risk Team teambox. Note-only after 15m silence.
  const parts = partsOf(full);
  const lastTeamAt = lastHumanTeamReplyUnix(parts);
  const pending = clientMessagesAfter(parts, lastTeamAt, full);
  if (!pending.length) {
    console.log('RISK wait , no client msgs since team reply', conversationId);
    return { noted: false, reason: 'no_client_msgs' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const anchor = lastTeamAt || Number(full.created_at || 0) || nowSec;
  const silence = nowSec - anchor;
  if (silence < RISK_SILENCE_SEC) {
    console.log('RISK wait , silence', conversationId, silence, '<', RISK_SILENCE_SEC);
    return { noted: false, reason: 'under_15m', silence };
  }

  const sig = pending.map((m) => m.id).join(',');
  const { state, id } = getConvState(conversationId);
  if (state.riskNoteSig === sig) {
    console.log('RISK skip duplicate note batch', conversationId);
    return { noted: false, reason: 'duplicate_batch' };
  }

  const html = await buildEscalationsWatchNote(full, pending);
  await postReply(conversationId, 'note', html);
  state.riskNoteSig = sig;
  state.riskNoteAt = Date.now();
  saveConvState(id, state);
  console.log('RISK note-only', conversationId, 'msgs', pending.length, 'silence', silence);
  return { noted: true, count: pending.length, silence };
}

function loadTicketState() {
  try {
    return JSON.parse(fs.readFileSync(TICKET_STATE_FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function saveTicketState(all) {
  fs.writeFileSync(TICKET_STATE_FILE, JSON.stringify(all, null, 2));
}

/**
 * Fresh-read-merge-write for a single conversation. getConvState() snapshots the whole
 * ticket-state file at call time; a caller that then `await`s a network call before saving
 * (postReply/assignToTeammate/etc.) can have its later `saveTicketState(all)` overwrite
 * changes another concurrent handler (a different webhook event, or one of the 60s poll
 * loops) wrote to a DIFFERENT conversation's entry in the meantime. Re-reading immediately
 * before writing and only touching this one conversation's key avoids that cross-conversation
 * lost-update. Prefer this over `all[id] = state; saveTicketState(all);` at any call site that
 * awaits between getConvState() and the save.
 */
function saveConvState(id, state) {
  const fresh = loadTicketState();
  fresh[String(id || '')] = state;
  saveTicketState(fresh);
}

function getConvState(conversationId) {
  const all = loadTicketState();
  const id = String(conversationId || '');
  if (!all[id] || typeof all[id] !== 'object') all[id] = {};
  all[id].lastTouchedAt = Math.floor(Date.now() / 1000);
  return { all, state: all[id], id };
}

function pruneTicketState() {
  try {
    const all = loadTicketState();
    const now = Math.floor(Date.now() / 1000);
    let removed = 0;
    for (const [cid, st] of Object.entries(all || {})) {
      const touched = Number(
        (st && (st.lastTouchedAt || st.lastEscalateAt)) || 0
      );
      if (touched && now - touched > TICKET_STATE_TTL_SEC) {
        delete all[cid];
        removed += 1;
      }
    }
    if (removed) {
      saveTicketState(all);
      console.log('TICKET_STATE_PRUNE removed', removed);
    }
  } catch (e) {
    console.error('TICKET_STATE_PRUNE_ERR', e && e.message);
  }
}

function pickScopeDeclineLine(conversationId) {
  const { all, state, id } = getConvState(conversationId);
  const count = (Number.isInteger(state.scopeDeclineCount) ? state.scopeDeclineCount : 0) + 1;
  state.scopeDeclineCount = count;

  const pool = count === 1 ? SCOPE_DECLINE_VARIANTS_FIRST : SCOPE_DECLINE_VARIANTS_REPEAT;
  const lastIndex = Number.isInteger(state.lastScopeDeclineIndex) ? state.lastScopeDeclineIndex : -1;
  let index = Math.floor(Math.random() * pool.length);
  if (pool.length > 1) {
    let guard = 0;
    while (index === lastIndex && guard < 8) {
      index = Math.floor(Math.random() * pool.length);
      guard += 1;
    }
  }
  state.lastScopeDeclineIndex = index;
  all[id] = state;
  saveTicketState(all);
  return pool[index];
}


function ensureCustomerReplySpacing(text) {
  // HARD RULE: exactly one blank line between paragraphs / separate points.
  // Do not jam paragraphs; do not leave huge gaps. Keep bullet runs tight.
  let t = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!t) return t;
  const lines = t.split('\n');
  const out = [];
  const isBullet = (line) => /^\s*(?:[•●▪\-\*]|\d+[.)])\s+/.test(line);
  const isBlank = (line) => !String(line || '').trim();
  const isHeading = (line) => /^\s*<b>[^<]+<\/b>\s*$/i.test(line) || /^\s*\[\[.+?\]\]\s*$/.test(line);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const blank = isBlank(line);
    if (blank) {
      // collapse multiple blanks to a single pending blank
      if (out.length && !isBlank(out[out.length - 1])) out.push('');
      continue;
    }
    if (out.length) {
      const prev = out[out.length - 1];
      const prevBlank = isBlank(prev);
      const prevBullet = isBullet(prev);
      const curBullet = isBullet(line);
      // Between two non-blank non-bullet prose/heading lines: require exactly one blank
      if (!prevBlank && !(prevBullet && curBullet)) {
        // already have content on previous line , insert blank unless both bullets
        out.push('');
      } else if (prevBlank) {
        // already exactly one blank (collapsed)
      }
    }
    out.push(line);
  }
  // trim leading/trailing blanks; collapse any accidental double blanks
  while (out.length && isBlank(out[0])) out.shift();
  while (out.length && isBlank(out[out.length - 1])) out.pop();
  const compact = [];
  for (const line of out) {
    if (isBlank(line) && compact.length && isBlank(compact[compact.length - 1])) continue;
    compact.push(line);
  }
  return compact.join('\n');
}

function ensureSectionGaps(text) {
  // One blank line before each <b>heading</b> block (except the first) so Intercom
  // shows a visible gap between sections , model often emits only a single \n.
  const lines = String(text || '').split('\n');
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = /^<b>[^<]+<\/b>$/i.test(trimmed);
    if (isHeading && out.length) {
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      if (out.length) out.push('');
    }
    out.push(line);
  }
  return out.join('\n');
}

function postProcessModelReply(rawText, conversationId) {
  let text = String(rawText || '');

  // 1) Scope-decline tag → code-picked variant (never back-to-back same index)
  if (text.includes('[[SCOPE_DECLINE]]')) {
    const line = pickScopeDeclineLine(conversationId);
    text = text.split('[[SCOPE_DECLINE]]').join(line).trim();
  }

  // 2) [[Heading]] → <b>Heading</b> (do not touch SCOPE_DECLINE leftover)
  text = text.replace(/\[\[(.+?)\]\]/g, '<b>$1</b>');

  // 3) CUSTOMER REPLY SPACING , HARD RULE (all paragraphs / separate points)
  text = ensureCustomerReplySpacing(text);
  // 3b) Enforce one blank-line gap between heading sections
  text = ensureSectionGaps(text);

  // 4) Never send em/en dashes to clients (Arsal lock)
  text = text.replace(/\u2014/g, ',').replace(/\u2013/g, '-');

  // 4a) Never send semicolons to clients (Arsal lock) — preserve HTML entities (&nbsp; etc.)
  text = text.replace(/&([a-zA-Z0-9#]+);/g, '\0ENT$1\0');
  text = text.replace(/;/g, ',');
  text = text.replace(/\0ENT([a-zA-Z0-9#]+)\0/g, '&$1;');

  // 4b) Never say MT5 / MetaTrader 5 to clients , exception: locked spread-test template only
  if (!/TEST SPREAD ACCOUNT DETAILS/i.test(text)) {
    text = text.replace(/MetaTrader\s*5/gi, 'the trading platform');
    text = text.replace(/\bMT5\b/gi, 'the trading platform');
    /* AUDIT_HARDEN_V1:mt5Italian */
    text = text.replace(/\bMeta\s*Trader\s*5\b/gi, 'the trading platform');
    text = text.replace(/\bMT\s*5\b/gi, 'the trading platform');
    text = text.replace(/\bconto\s+MT5\b/gi, 'conto sulla piattaforma di trading');
  }

  // 5) Review asks: readable Intercom spacing (exactly one blank line between segments)
  if (/trustpilot\.com\/review\/fundedelite\.com/i.test(text) && /propfirmmatch\.com\/prop-firms\/fundedelite/i.test(text)) {
    text = normalizeReviewSpacing(text);
  }

  // 6) Never leak ACTION/BODY parser labels to clients
  text = stripActionLeak(text);

  return text.trim();
}

/* AUDIT_HARDEN_V1:applied */
/* soft-edges v1: strip orphan Cyrillic/CJK junk before Intercom send */
postProcessModelReply = (function (origPostProcessModelReply) {
  return function postProcessModelReply() {
    const raw = arguments[0];
    if (fixedMessageHandoff.isExactAllowedTemplate(raw)) return String(raw);
    if (fixedMessageHandoff.isTerminalHedge(raw)) return String(raw).replace(/\s+/g, ' ').trim();
    const out = origPostProcessModelReply.apply(this, arguments);
    const cleaned = softEdges.postProcessStripJunk(out);
    if (cleaned === null) {
      console.warn('[softEdges] skip send: nothing useful after junk strip');
      return '';
    }
    return cleaned;
  };
})(postProcessModelReply);


function normalizeReviewSpacing(text) {
  let t = String(text || '').replace(/\r\n/g, '\n').trim();
  // Never put Arsal/teammate name in review asks (Arsal lock)
  t = t.replace(/\bfor me,\s*Arsal\b/gi, '').replace(/\bme,\s*Arsal\b/gi, '');
  t = t.replace(/\bquick review for me,?\s*/gi, 'quick review ');
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/\bquick review\s+\./gi, 'quick review.');
  t = t.replace(/ +([.,!?])/g, '$1');
  t = t.replace(/\n{3,}/g, '\n\n');
  t = t.replace(/\n*Trustpilot:\s*\n*/i, '\n\nTrustpilot:\n');
  t = t.replace(/\n*PropFirmMatch:\s*\n*/i, '\n\nPropFirmMatch:\n');
  t = t.replace(/\n*Thank you for choosing FundedElite!?\s*/i, '\n\nThank you for choosing FundedElite!');
  t = t.replace(/FundedElite!([^\s\n])/g, 'FundedElite! $1');
  // Blank line after first opener line if the next line is not already blank
  t = t.replace(/^([^\n]{1,100})\n(?!\n)/, '$1\n\n');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

function toHtml(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  // Convert any leftover [[Heading]] markers, preserve <b>, escape the rest.
  let s = t.replace(/\[\[(.+?)\]\]/g, '<b>$1</b>');
  const slots = [];
  s = s.replace(/<\/?b>/gi, (m) => {
    const tag = m.toLowerCase() === '</b>' ? '</b>' : '<b>';
    slots.push(tag);
    return '\0B' + (slots.length - 1) + '\0';
  });
  s = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/\0B(\d+)\0/g, (_, i) => slots[Number(i)]);

  // Unicode • lines → real Intercom <ul><li> (thicker native bullets). Prompt unchanged.
  const lines = s.split('\n');
  const chunks = [];
  let items = [];
  const flushList = () => {
    if (!items.length) return;
    chunks.push('<ul>' + items.map((item) => '<li>' + item + '</li>').join('') + '</ul>');
    items = [];
  };
  for (const line of lines) {
    const m = line.match(/^\s*[•●▪]\s+(.*)$/);
    if (m) {
      items.push(m[1]);
    } else {
      flushList();
      chunks.push(line);
    }
  }
  flushList();

  const isReviewHtml =
    /trustpilot\.com\/review\/fundedelite\.com/i.test(s) &&
    /propfirmmatch\.com\/prop-firms\/fundedelite/i.test(s);

  let html = '';
  let pendingBlank = false;
  for (let i = 0; i < chunks.length; i++) {
    const cur = chunks[i];
    if (cur === '') {
      // CUSTOMER REPLY SPACING , HARD RULE: exactly one blank line between
      // paragraphs for every client-facing reply (not review-only).
      pendingBlank = true;
      continue;
    }

    if (cur.startsWith('<ul>')) {
      if (html) {
        // One blank line before a list that follows prose/heading
        if (!html.endsWith('</ul>')) {
          while (html.endsWith('<br>')) html = html.slice(0, -4);
          html += '<br><br>';
        } else {
          html += '<br>';
        }
      }
      html += cur;
      pendingBlank = true; // one blank line after list before next paragraph
      continue;
    }

    const isHeading = /^<b>[^<]+<\/b>$/i.test(cur.trim());
    if (!html) {
      html = cur;
      pendingBlank = false;
      continue;
    }
    if (isHeading) {
      html += '<br><br>' + cur;
    } else if (pendingBlank) {
      html += '<br><br>' + cur;
    } else {
      html += '<br>' + cur;
    }
    pendingBlank = false;
  }
  return html;
}

function contactBits(conv) {
  const contacts = (conv.contacts && conv.contacts.contacts) || [];
  const c0 = contacts[0] || {};
  const src = conv.source || {};
  const author = src.author || {};
  return {
    name: c0.name || author.name || '',
    email: c0.email || author.email || '',
    id: c0.id || author.id || '',
  };
}

function partsOf(conv) {
  return (conv.conversation_parts && conv.conversation_parts.conversation_parts) || [];
}

function authoritativeConversationParts(conv) {
  if (!conv || typeof conv !== 'object') return null;
  const box = conv.conversation_parts;
  if (!box || typeof box !== 'object' || Array.isArray(box)) return null;
  if (!Array.isArray(box.conversation_parts)) return null;
  return box.conversation_parts;
}

async function checkSendBoundary(conversationId, userPart, clientName) {
  try {
    if (control.isPaused()) return { ok: false, why: 'paused' };
  } catch (_) {
    return { ok: false, why: 'control-unavailable' };
  }
  try {
    if (control.isAiOff && control.isAiOff(conversationId)) return { ok: false, why: 'ticket-ai-off' };
  } catch (_) {
    return { ok: false, why: 'control-unavailable' };
  }
  try {
    if (typeof control.isTestAllowed === 'function' && !control.isTestAllowed(conversationId, clientName)) {
      return { ok: false, why: 'test-allowlist' };
    }
  } catch (_) {
    return { ok: false, why: 'control-unavailable' };
  }

  const fresh = await fetchConversation(conversationId);
  const parts = authoritativeConversationParts(fresh);
  if (!parts) return { ok: false, why: 'refetch-unavailable' };

  if (userPart) {
    if (arsalAlreadyRepliedAfter(parts, userPart)) return { ok: false, why: 'already-replied' };
    const answeredAt = Number(userPart.created_at || 0);
    for (const p of parts) {
      if (Number(p.created_at || 0) <= answeredAt) continue;
      if (isHumanTeammatePublicReply(p)) return { ok: false, why: 'human-takeover' };
    }
    for (const p of parts) {
      const a = p.author || {};
      if (a.type !== 'user') continue;
      if (String(p.id || '') === String(userPart.id || '')) continue;
      if (Number(p.created_at || 0) > answeredAt && stripHtml(p.body || '')) {
        return { ok: false, why: 'stale-draft' };
      }
    }
  }
  return { ok: true, parts, fresh };
}

function collectImageAttachments(part) {
  const atts = (part && part.attachments) || [];
  const out = [];
  for (const a of atts) {
    if (!a) continue;
    const url = String(a.url || '');
    if (!url) continue;
    const ct = String(a.content_type || a.contentType || '').toLowerCase();
    const name = String(a.name || '');
    const isImg =
      /^image\//i.test(ct) ||
      /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(url) ||
      /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
    if (!isImg) continue;
    const size = Number(a.filesize || a.file_size || 0);
    if (size && size > 8 * 1024 * 1024) continue; // skip huge files
    out.push({
      url,
      content_type: ct || 'image/png',
      name,
      filesize: size,
    });
  }
  return out.slice(0, 4); // cap
}

// Attachment fetch hardening (Final v3 §13). The previous version followed any URL axios
// accepted, followed redirects implicitly, and only checked the size AFTER buffering the
// whole body. That allowed a large download to be held in memory and allowed a redirect to
// reach an internal address. No host allowlist is hardcoded: no real attachment host could
// be derived from live data, and guessing one would break legitimate Intercom attachments.
// Set LUNA_ATTACHMENT_HOSTS (comma separated) to narrow it once the real hosts are known.
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MAX_REDIRECTS = 2;
const IMAGE_FETCH_TIMEOUT_MS = 25000;

function unwrapMappedIp(hostname) {
  let h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  const dotted = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted) return dotted[1];
  const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }
  const compat = h.match(/^::(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (compat) return compat[1];
  return h;
}

function isPrivateHost(hostname) {
  const h = unwrapMappedIp(hostname);
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(h) || /^fe80:/i.test(h)) return true; // unique-local / link-local v6
  const m4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m4) {
    const [a, b] = [Number(m4[1]), Number(m4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;            // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT
    if (a >= 224) return true;                          // multicast / reserved
  }
  return false;
}

function attachmentDnsLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (isPrivateHost(hostname)) {
    return callback(Object.assign(new Error('ATTACHMENT_BLOCKED_RESOLVED_DESTINATION'), { code: 'ENOTFOUND' }));
  }
  const opts = { all: true, verbatim: true };
  if (options && options.family) opts.family = options.family;
  dns.lookup(String(hostname || ''), opts, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: 4 }];
    for (const row of list) {
      const addr = typeof row === 'string' ? row : row.address;
      if (isPrivateHost(addr)) {
        return callback(Object.assign(new Error('ATTACHMENT_BLOCKED_RESOLVED_DESTINATION'), { code: 'ENOTFOUND' }));
      }
    }
    const first = list[0];
    const addr = typeof first === 'string' ? first : first.address;
    const family = typeof first === 'string' ? 4 : first.family;
    if (options && options.all) return callback(null, list);
    callback(null, addr, family);
  });
}

function detectImageMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function attachmentUrlAllowed(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl || '')); } catch (_) { return { ok: false, why: 'unparseable' }; }
  if (u.protocol !== 'https:') return { ok: false, why: 'scheme ' + u.protocol };
  if (isPrivateHost(u.hostname)) return { ok: false, why: 'private or local destination' };
  const allow = String(process.env.LUNA_ATTACHMENT_HOSTS || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (allow.length && !allow.some((a) => u.hostname === a || u.hostname.endsWith('.' + a))) {
    return { ok: false, why: 'host not in LUNA_ATTACHMENT_HOSTS' };
  }
  return { ok: true, url: u };
}

async function imageAttachmentToDataUrl(att) {
  try {
    let target = String((att && att.url) || '');
    let contentType = '';
    let buf = null;

    for (let hop = 0; hop <= IMAGE_MAX_REDIRECTS; hop += 1) {
      const check = attachmentUrlAllowed(target);
      if (!check.ok) {
        console.log('IMAGE_FETCH_BLOCKED', check.why, (att && att.name) || '');
        return null;
      }
      const r = await axios.get(target, {
        responseType: 'stream',
        timeout: IMAGE_FETCH_TIMEOUT_MS,
        maxRedirects: 0,               // every hop is re-validated by us, never followed blindly
        validateStatus: () => true,
        headers: { Accept: 'image/*' },
        lookup: attachmentDnsLookup,
      });

      if (r.status >= 300 && r.status < 400 && r.headers && r.headers.location) {
        if (r.data && typeof r.data.destroy === 'function') r.data.destroy();
        target = new URL(r.headers.location, target).toString();
        continue;
      }
      if (r.status >= 400) {
        if (r.data && typeof r.data.destroy === 'function') r.data.destroy();
        console.log('IMAGE_FETCH_FAIL', r.status, (att && att.name) || '');
        return null;
      }

      contentType = String((r.headers && r.headers['content-type']) || '').split(';')[0].trim();
      if (contentType && !/^image\//i.test(contentType)) {
        if (r.data && typeof r.data.destroy === 'function') r.data.destroy();
        console.log('IMAGE_FETCH_BLOCKED not-an-image', contentType, (att && att.name) || '');
        return null;
      }
      const declared = Number((r.headers && r.headers['content-length']) || 0);
      if (declared && declared > IMAGE_MAX_BYTES) {
        if (r.data && typeof r.data.destroy === 'function') r.data.destroy();
        console.log('IMAGE_FETCH_BLOCKED too-large-declared', declared);
        return null;
      }

      // Enforce the cap WHILE streaming so an oversized body is never fully buffered.
      buf = await new Promise((resolve) => {
        const chunks = [];
        let total = 0;
        const stream = r.data;
        if (!stream || typeof stream.on !== 'function') { resolve(Buffer.isBuffer(stream) ? stream : null); return; }
        stream.on('data', (c) => {
          total += c.length;
          if (total > IMAGE_MAX_BYTES) {
            console.log('IMAGE_FETCH_BLOCKED too-large-stream', total);
            try { stream.destroy(); } catch (_) {}
            resolve(null);
            return;
          }
          chunks.push(c);
        });
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', () => resolve(null));
      });
      break;
    }

    if (!buf || !buf.length) return null;
    const detected = detectImageMime(buf);
    if (!detected) {
      console.log('IMAGE_FETCH_BLOCKED not-an-image-bytes', (att && att.name) || '');
      return null;
    }
    return 'data:' + detected + ';base64,' + buf.toString('base64');
  } catch (e) {
    console.error('IMAGE_FETCH_ERR', e && e.message);
    return null;
  }
}


async function buildVisionUserContent(textPrompt, imageAtts) {
  const content = [{ type: 'text', text: textPrompt }];
  for (const att of imageAtts || []) {
    const dataUrl = await imageAttachmentToDataUrl(att);
    if (!dataUrl) continue;
    content.push({
      type: 'image_url',
      image_url: { url: dataUrl },
    });
  }
  return content;
}

function isShortClientAck(text) {
  /* MICHAN_TEAMMATE_HANDOFF_V1: short-ack includes Thankyou / thank you */
  if (teammateHandoffGates.isShortClientAckExpanded(text)) return true;
  const t = String(text || '').trim();
  if (!t || t.length > 120) return false;
  // Pure / near-pure acknowledgements , no new question
  if (/[?]/.test(t)) return false;
  if (/\b(but|however|also|what|how|why|when|where|can i|could i|please (check|look|help|review)|account|email|payout|kyc|breach)\b/i.test(t)) {
    // allow pure thanks that mention nothing else
    if (!/^(ok(ay)?|sure|thanks?|thank you|thx|ty|got it|will do|alright|perfect|great|awesome|noted|understood|yes|yep|yeah)([.!,\s]*(sure|will do|thank(?:s| you)?|thx|ty|got it|ok(ay)?|alright))*[.!]*$/i.test(t)) {
      return false;
    }
  }
  return /^(ok(ay)?|sure|thanks?|thank you|thx|ty|got it|will do|alright|perfect|great|awesome|noted|understood|yes|yep|yeah)(\s|,|!|\.|$)/i.test(t) &&
    /^(?:ok(?:ay)?|sure|thanks?|thank you|thx|ty|got it|will do|alright|perfect|great|awesome|noted|understood|yes|yep|yeah|[,\s.!]|will do|thank(?:s| you)?)+$/i.test(t);
}

const UNSUPPORTED_NUMBER_HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const SPREAD_TEST_REPLY =
  'TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server\n\n' +
  'Platform: MetaTrader 5\n' +
  'Server: Fundedelite-Server\n' +
  'Account Number: 55188\n' +
  'Password: QBG5FetfozKz7^a?J!\n\n' +
  'Use this account to check spreads.';

/* LUNA_SPREAD_IMAGE_FIXES_V1:BEGIN:spread */
function isSpreadCheckAsk(...__args) {
  // Strict spread intent is required; legacy detector can only confirm, never widen.
  return __spreadAskGate.gateLegacy(__args, isSpreadCheckAsk__legacy);
}
/* LUNA_SPREAD_IMAGE_FIXES_V1:END:spread */
function isSpreadCheckAsk__legacy(text) {
  const t = String(text || '');
  if (!/\b(spread|spreads)\b/i.test(t) && !(/\b(mt5|metatrader)\b/i.test(t) && /\b(login|password|server|demo|test)\b/i.test(t))) {
    return false;
  }
  return /\b(spread|spreads|check|compare|inspect|see|show|what|how|login|password|server|demo|test account)\b/i.test(t);
}

/** True when client wants THEIR specific case status checked (not general notify process). */
function isClearlyPersonalReviewStatusCheck(text) {
  const t = String(text || '');
  if (!t) return false;
  if (/\b(check|what'?s|what\s+is|any\s+update|give\s+me)\b[\s\S]{0,50}\b(status|update|progress)\b[\s\S]{0,40}\b(my|our)\b[\s\S]{0,40}\b(review|kyc|verification)\b/i.test(t)) {
    return true;
  }
  if (/\b(status|update|progress)\s+of\s+(my|our)\s+(kyc|review|verification)\b/i.test(t)) return true;
  if (/\b(my|our)\s+(kyc|review|verification)\s+(status|update|progress)\b/i.test(t)) return true;
  if (/\bcheck\s+(my|our|the\s+status\s+of\s+my)\b[\s\S]{0,40}\b(review|kyc|verification)\b/i.test(t)) return true;
  if (/\baccount\s*(?:number|#|no\.?)?\s*:?\s*\d{5,12}\b/i.test(t) && /\b(review|kyc|verification|status)\b/i.test(t)) {
    return true;
  }
  if (/\b(has|have)\s+my\s+(kyc|review|verification)\s+(been\s+)?(done|completed|approved|finished)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * General PROCESS ask: how they will know when review/verification is done / whether they get notified.
 * NOT a personal case-status check. Code-enforced Arsal lock , answer directly, never escalate.
 */
function isReviewNotificationProcessAsk(text) {
  const t = String(text || '');
  if (!t) return false;
  if (isClearlyPersonalReviewStatusCheck(t)) return false;

  const aboutReview =
    /\b(review|verification|verif(?:y|ied|ying)|kyc|under\s+review|being\s+reviewed)\b/i.test(t) ||
    /\b(once|when|if)\s+(it|this|the\s+(?:review|verification|kyc))\s+(is\s+)?(done|complete|completed|finished)\b/i.test(t);
  if (!aboutReview) return false;

  const processNotify =
    /\bhow\s+(will|do|can)\s+(i|we)\s+(know|find\s+out|be\s+(?:told|notified|informed|updated))\b/i.test(t) ||
    /\bhow\s+will\s+(i|we)\s+know\s+(if|when|that)\b/i.test(t) ||
    /\bwill\s+(i|we)\s+(get|receive|be\s+(sent|given))\s+(an?\s+)?(email|notification|notif(?:ied)?|update|message)\b/i.test(t) ||
    /\bwill\s+(i|we)\s+be\s+(notified|informed|updated|told|emailed)\b/i.test(t) ||
    /\bwill\s+(you|they|the\s+team)\s+(tell|notify|email|update|inform|message|send)\s+(me|us)\b/i.test(t) ||
    /\bwill\s+(they|you)\s+send\s+(me\s+)?(an?\s+)?(email|message|notification)\b/i.test(t) ||
    /\bdo\s+(i|we)\s+(get|receive)\s+(an?\s+)?(email|notification)\b/i.test(t) ||
    /\bhow\s+(am\s+i|are\s+we)\s+(notified|informed|updated)\b/i.test(t) ||
    /\b(should|do)\s+i\s+(check\s+back|keep\s+checking|follow\s+up)\b/i.test(t) ||
    (/\b(email|notif(?:y|ication|ied)|intercom)\b/i.test(t) &&
      /\b(when|once|if|after)\b[\s\S]{0,40}\b(done|complete|completed|finished|result)\b/i.test(t));

  if (!processNotify) return false;
  // Mixed: if primary intent is notification method, prefer process answer (already excluded clear case-status).
  return true;
}

const REVIEW_STATUS_DIRECT_REPLIES = [
  "Once your review is complete, our team will update you on Intercom or via email, you don't need to check back manually.",
  "When the review finishes, we'll reach out on Intercom or by email - no need to keep checking in yourself.",
  "You'll get an update from our team on Intercom or email once the review is done, you won't need to follow up manually.",
];

function pickReviewStatusDirectReply() {
  const opts = REVIEW_STATUS_DIRECT_REPLIES;
  return opts[Math.floor(Math.random() * opts.length)];
}

function clientSaidNoAccount(conversation) {
  const texts = collectClientMessageTexts(conversation);
  return texts.some((t) =>
    idGates.clientSaidNoAccount(t) ||
    /\b(don'?t|do\s+not|dont)\s+have\b[\s\S]{0,40}\baccount(\s+number)?\b/i.test(t) ||
    /\bno\s+account\s+number\b/i.test(t) ||
    /\b(haven'?t|have\s+not)\s+(purchased|bought|got|opened)\b/i.test(t) ||
    /\b(not|never)\s+(purchased|bought)\b[\s\S]{0,30}\baccount\b/i.test(t) ||
    /\bno\s+trading\s+account\b/i.test(t) ||
    /\bi\s+don'?t\s+have\s+(a\s+)?(trading\s+)?account\b/i.test(t) ||
    /\bstill\s+haven'?t\s+bought\b/i.test(t)
  );
}

function clientSaidNoEmail(conversation) {
  const texts = collectClientMessageTexts(conversation);
  return texts.some((t) => idGates.clientSaidNoEmail(t));
}

function normalizePublicBotBody(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bodiesNearlyIdentical(a, b) {
  const na = normalizePublicBotBody(a);
  const nb = normalizePublicBotBody(b);
  if (!na || !nb) return false;
  return na === nb;
}

function getLastArsalPublicCommentBody(parts) {
  let last = '';
  for (const p of parts || []) {
    const a = p.author || {};
    if (String(a.id || '') !== ARSAL_ID) continue;
    if (String(p.part_type || '') === 'note') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    last = body;
  }
  return last;
}

function rememberEscalateStatusBody(conversationId, body) {
  const { all, state, id } = getConvState(conversationId);
  state.lastEscalateStatusBody = String(body || '');
  all[id] = state;
  saveTicketState(all);
}

function pickEscalateStatusReply(seed) {
  const bank = Array.isArray(escalateRelatedOnly.STATUS_ONLY_REPLIES)
    ? escalateRelatedOnly.STATUS_ONLY_REPLIES
    : [];
  if (Array.isArray(seed)) {
    const available = bank.filter((r) => !seed.some((ex) => bodiesNearlyIdentical(r, ex)));
    return available.length ? available[0] : null;
  }
  return escalateRelatedOnly.pickEscalateStatusReply(seed);
}

/** Holding-line while escalateAwaitingFirstTeammate. Short ack → SKIP. Never repeat last public/status body. */
async function postEscalateHoldingStatus(conversationId, text, latestUser, clientName, escState, logTag) {
  if (isShortClientAck(text)) {
    console.log(logTag + ' short-ack SKIP (awaiting teammate)', conversationId);
    return { skipped: true, reason: 'short_ack' };
  }
  const fresh = await fetchConversation(conversationId);
  const parts = fresh ? partsOf(fresh) : [];
  const stHold = getConvState(conversationId);
  const progHold = stHold && stHold.state && stHold.state.fixedHandoff;
  if (fixedMessageHandoff.fixedLineAlreadyPublic(progHold, parts)) {
    console.log(logTag + ' SKIP fixed line already sent', conversationId);
    return { skipped: true, reason: 'fixed_line_already_sent' };
  }
  const excludes = [];
  if (escState && escState.lastEscalateStatusBody) excludes.push(escState.lastEscalateStatusBody);
  const lastPublic = getLastArsalPublicCommentBody(parts);
  if (lastPublic) excludes.push(lastPublic);
  const status = pickEscalateStatusReply(excludes);
  if (!status) {
    console.log(logTag + ' SKIP (all status variants match last)', conversationId);
    return { skipped: true, reason: 'duplicate_all' };
  }
  // Belt-and-suspenders: if somehow still identical to last public, skip
  if (lastPublic && bodiesNearlyIdentical(status, lastPublic)) {
    console.log(logTag + ' SKIP (picked body ~identical last public)', conversationId);
    return { skipped: true, reason: 'identical_last' };
  }
  const statusOut = postProcessModelReply(status, conversationId);
  const posted = await postClientCommentOnce(conversationId, statusOut, latestUser, clientName);
  if (posted != null) {
    rememberEscalateStatusBody(conversationId, statusOut);
    console.log(logTag, conversationId);
  }
  return { skipped: false, status, posted };
}

function isHumanTeammatePublicReply(part) {
  /* MICHAN_TEAMMATE_HANDOFF_V1: align with teammateHandoffGates (comment + assignment/open body) */
  return teammateHandoffGates.isHumanTeammatePublicReply(part, {
    arsalId: ARSAL_ID,
    eliteAiId: ELITE_AI_ID,
  });
}

// --- Fin / Elite AI wait gate (hard code-enforce; do not race Fin) ---
const FIN_RECENT_OWNING_SEC = 90;
const FIN_FRESH_CONV_SEC = 120;

function clientRequestedLiveAgent(text) {
  return softEdges.clientRequestedLiveAgent(text);
}

/** True when the client is asking for a real human / manager (not just Fin→Arsal takeover). */
function clientWantsHumanTeammate(text) {
  if (clientRequestedLiveAgent(text)) return true;
  const t = String(text || '');
  if (/\b(chargeback|legal\s+action|file\s+a\s+complaint|speak\s+to\s+(?:a\s+|an\s+|my\s+)?supervisor)\b/i.test(t)) return true;
  return false;
}

function finHandoffPhrase(text) {
  return softEdges.finHandoffPhrase(text);
}

function finHandoffInHistory(parts) {
  for (const part of parts || []) {
    if (!part || part.part_type === 'note') continue;
    const a = part.author || {};
    const id = String(a.id || '');
    const body = stripHtml(part.body || '');
    if (!body || !finHandoffPhrase(body)) continue;
    if (id === ELITE_AI_ID) return true;
    if (a.type === 'bot') return true;
    if (/elite\s*ai|\bfin\b/i.test(String(a.name || ''))) return true;
    // System / Fin-equivalent handoff copy from non-Arsal admin/bot
    if ((a.type === 'admin' || a.type === 'bot') && id !== ARSAL_ID) return true;
  }
  return false;
}

function eliteAiHasParticipated(parts) {
  for (const part of parts || []) {
    if (!part || part.part_type === 'note') continue;
    if (String((part.author || {}).id || '') !== ELITE_AI_ID) continue;
    if (String(part.part_type || '') !== 'comment') continue;
    if (stripHtml(part.body || '')) return true;
  }
  return false;
}

function lastEliteAiCommentUnix(parts) {
  let t = 0;
  for (const part of parts || []) {
    if (!part || part.part_type === 'note') continue;
    if (String((part.author || {}).id || '') !== ELITE_AI_ID) continue;
    if (String(part.part_type || '') !== 'comment') continue;
    if (!stripHtml(part.body || '')) continue;
    const at = Number(part.created_at || 0);
    if (at > t) t = at;
  }
  return t;
}

function clientRequestedLiveAgentAfterLastElite(parts) {
  const lastElite = lastEliteAiCommentUnix(parts);
  for (const part of parts || []) {
    if (!part) continue;
    const a = part.author || {};
    if (a.type !== 'user' && a.type !== 'lead') continue;
    const at = Number(part.created_at || 0);
    if (lastElite && at <= lastElite) continue;
    if (clientRequestedLiveAgent(stripHtml(part.body || ''))) return true;
  }
  return false;
}

function humanTeammateAlreadyRepliedPublic(parts) {
  for (const part of parts || []) {
    if (isHumanTeammatePublicReply(part)) return true;
  }
  return false;
}

function latestPublicAdminCommentAuthorId(parts) {
  let bestAt = -1;
  let bestId = '';
  for (const part of parts || []) {
    if (!part || String(part.part_type || '') !== 'comment') continue;
    const a = part.author || {};
    if (a.type !== 'admin' && a.type !== 'bot') continue;
    if (!stripHtml(part.body || '')) continue;
    const at = Number(part.created_at || 0);
    if (at >= bestAt) {
      bestAt = at;
      bestId = String(a.id || '');
    }
  }
  return bestId;
}

function conversationAgeSec(full) {
  const created = Number((full && full.created_at) || 0);
  if (!created) return -1;
  return Math.floor(Date.now() / 1000) - created;
}

function eliteAiStillOwning(full) {
  const parts = partsOf(full);
  if (finHandoffInHistory(parts)) return false;
  if (humanTeammateAlreadyRepliedPublic(parts)) return false;

  // Latest public bot/admin comment is from Elite AI
  if (latestPublicAdminCommentAuthorId(parts) === ELITE_AI_ID) return true;

  // Elite AI commented in last ~90s and no handoff yet
  const lastElite = lastEliteAiCommentUnix(parts);
  const now = Math.floor(Date.now() / 1000);
  if (lastElite && now - lastElite <= FIN_RECENT_OWNING_SEC) return true;

  // Fresh conversation: Elite AI + client only so far, no live-agent ask
  const age = conversationAgeSec(full);
  if (age >= 0 && age < FIN_FRESH_CONV_SEC) {
    if (eliteAiHasParticipated(parts) && !clientRequestedLiveAgentAfterLastElite(parts)) return true;
  }
  return false;
}

/**
 * true => SKIP public Arsal reply (Fin/Elite still owns the thread).
 * Escalations/Risk silent notes + auth-note paths never call this.
 * Assignment to Arsal alone is NOT treated as handoff.
 */
function shouldWaitForFin(full, latestUserText, topic) {
  const conversationId = full && full.id != null ? String(full.id) : '';
  const parts = partsOf(full);
  const text = String(latestUserText || '');

  // Bot-test allowlist: Luna owns these tickets — do not yield to Fin/Elite wait.
  try {
    const tm = control.getTestMode && control.getTestMode();
    const bits = typeof contactBits === 'function' ? contactBits(full) : { name: '' };
    const cName = (bits && bits.name) || '';
    if (tm && tm.enabled && typeof control.isTestAllowed === 'function' && control.isTestAllowed(conversationId, cName)) {
      return false;
    }
  } catch (e) {
    console.error('testMode fin-wait check failed', e && e.message);
  }

  // Fresh tickets: always let Fin take the first shot (source-fallback must not race).
  // A live-agent request is the exception, and only after ownership has already
  // declined to post. That check runs before this function is called.
    if (topic === 'conversation.user.created') {
      if (clientRequestedLiveAgent(text) || fixedMessageHandoff.isPureLiveAgentAsk(text) || fixedMessageHandoff.isHumanAgentRequest(text)) {
        console.log('FIN_WAIT bypass live-agent user.created', conversationId);
        return false;
      }
    // An eligible spread ask is the same kind of exception: ownership has already
    // run, and the locked reply is posted by the spread path below.
    if (typeof isSpreadCheckAsk === 'function' && isSpreadCheckAsk(text)) {
      console.log('FIN_WAIT bypass spread user.created', conversationId);
      return false;
    }
    console.log('SKIP fin-wait user.created', conversationId);
    return true;
  }

  // Client asked for live agent (latest OR any client msg after last Elite AI comment)
  if (clientRequestedLiveAgent(text) || clientRequestedLiveAgentAfterLastElite(parts)) {
    return false;
  }

  // Fin/Elite (or system) already announced live-agent handoff
  if (finHandoffInHistory(parts)) {
    return false;
  }

  // Real human teammate already in the public thread
  if (humanTeammateAlreadyRepliedPublic(parts)) {
    return false;
  }

  // Elite AI has participated and no handoff / live-agent yet
  if (eliteAiHasParticipated(parts)) {
    console.log('SKIP fin-wait elite-participated', conversationId);
    return true;
  }

  if (eliteAiStillOwning(full)) {
    console.log('SKIP fin-wait elite-owning', conversationId);
    return true;
  }

  // Fresh ticket, Fin has not spoken yet , brief wait (do not race first Fin reply)
  const age = conversationAgeSec(full);
  if (
    age >= 0 &&
    age < FIN_FRESH_CONV_SEC &&
    !eliteAiHasParticipated(parts) &&
    !arsalHasPublicClientReply(parts)
  ) {
    console.log('SKIP fin-wait fresh-no-elite', conversationId);
    return true;
  }

  return false;
}

function isVagueOrLiveAgentOnlyAsk(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (clientRequestedLiveAgent(t) && t.length < 140) {
    // Strip live-agent phrasing , if little substance remains, treat as vague takeover
    const rest = t
      .replace(/\b((live\s*agent)|(real\s+(person|human|agent))|(talk\s+to\s+(a\s+|an\s+)?(human|person|agent|someone))|(speak\s+(to|with)\s+(a\s+|an\s+)?(human|person|agent|someone))|(connect(\s+me)?\s+to\s+(a\s+|an\s+)?(agent|human|person|someone|support))|(need\s+(a\s+)?(live\s+)?(agent|human))|(want\s+(a\s+)?(live\s+)?(agent|human))|(human\s+support)|(agent\s+please)|(chat\s+with\s+(a\s+)?(person|human|agent|someone))|(transfer\s+(me\s+)?to\s+(a\s+)?(human|agent|person))|(put\s+me\s+through\s+to))\b/gi, ' ')
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (rest.length < 28) return true;
  }
  if (/^(hi|hello|hey|yo|hola|ciao)[.!?\s]*$/i.test(t)) return true;
  if (/^(i\s+have\s+)?another\s+question[.!?\s]*$/i.test(t)) return true;
  if (/^(i\s+need\s+help|help\s+please|can\s+you\s+help)[.!?\s]*$/i.test(t)) return true;
  return false;
}

function lockedFinHandoffWelcome(clientName, latestClientText = '') {
  const first = firstNameFromClient(clientName);
  const name = first ? (' ' + first) : '';
  if (/[\u0600-\u06ff]/.test(String(latestClientText || ''))) return 'السلام علیکم' + name + '، میں آپ کی کیا مدد کر سکتا ہوں؟';
  if (/\b(?:ciao|buongiorno|salve|aiuto|aiutarmi)\b/i.test(String(latestClientText || ''))) return 'Ciao' + name + ', come posso aiutarti?';
  if (/\b(?:kya|aap|ap|tum|mujhe|madad|salam)\b/i.test(String(latestClientText || ''))) return 'Salam' + name + ', main aap ki kis cheez mein madad kar sakta hoon?';
  return 'Hello' + name + ', how can I help?';
}

function syncEscalateTeammateFirstState(conversationId, full) {
  const { all, state, id } = getConvState(conversationId);
  if (!state.escalateAwaitingFirstTeammate || !state.lastEscalateAt) {
    return state;
  }
  const parts = partsOf(full);
  const after = Number(state.lastEscalateAt || 0);
  for (const part of parts) {
    if (!isHumanTeammatePublicReply(part)) continue;
    const at = Number(part.created_at || 0);
    if (at <= after) continue;
    state.escalateAwaitingFirstTeammate = false;
    state.escalateTeammateExplainedAt = at;
    all[id] = state;
    saveTicketState(all);
    console.log('ESCALATE teammate first explanation seen', conversationId, at);
    break;
  }
  return state;
}

function hasOpenEscalation(state) {
  return !!(state && state.lastEscalateAt);
}

/**
 * Decide whether a new escalation attempt is the same pending case or a different issue.
 * A different account issue replaces the stale awaiting lock so identity collection and a
 * real escalation can proceed. Clear FAQ fallthrough intentionally leaves the old lock armed.
 */
function evaluateAwaitingEscalationAttempt(conversationId, text, escState) {
  const state = escState || {};
  const decision = escalateRelatedOnly.decideEscalateAwaitingGate({
    awaitingFirstTeammate: !!state.escalateAwaitingFirstTeammate,
    userText: text,
    lastEscalateProblem: state.lastEscalateProblem,
    lastEscalateNoteSnippet: state.lastEscalateNoteSnippet,
    lastEscalateTopic: state.lastEscalateTopic,
    lastEscalateTopics: state.lastEscalateTopics,
  });
  if (!decision.supersedesAwaiting) {
    return { decision, state, superseded: false };
  }

  const stPack = getConvState(conversationId);
  stPack.state.escalateAwaitingFirstTeammate = false;
  stPack.state.deferredRelatedReply = null;
  saveConvState(stPack.id, stPack.state);
  console.log(
    'ESCALATE awaiting superseded by different issue',
    conversationId,
    decision.reason || 'unrelated_other'
  );
  return { decision, state: stPack.state, superseded: true };
}

function sourceAsUserPart(conv) {
  // Fresh tickets often have the opening client message only on conversation.source
  // (not yet duplicated into conversation_parts). Treat that as the latest user part.
  const src = (conv && conv.source) || {};
  const a = src.author || {};
  if (a.type !== 'user' && a.type !== 'lead') return null;
  const hasImg = collectImageAttachments(src).length > 0;
  if (!src.body && !hasImg) return null;
  return {
    id: 'source:' + String((conv && conv.id) || ''),
    part_type: 'comment',
    body: src.body || '',
    attachments: src.attachments || [],
    author: a,
    created_at: Number(src.created_at || (conv && conv.created_at) || 0) || 0,
    __fromSource: true,
  };
}

function findLatestUserPart(parts, conv) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    const a = p.author || {};
    if (a.type !== 'user' && a.type !== 'lead') continue;
    const hasImg = collectImageAttachments(p).length > 0;
    if (p.body || p.part_type === 'comment' || p.part_type === 'open' || hasImg) return p;
  }
  // Fallback: opening message living only on source (conversation.user.created)
  if (conv) return sourceAsUserPart(conv);
  return null;
}

function buildHistory(conv, maxParts) {
  const parts = partsOf(conv);
  const lines = [];
  const src = conv.source || {};
  if (src.body) {
    const who = (src.author && src.author.type === 'user' ? 'Client' : 'Other') + ': ';
    lines.push(who + stripHtml(src.body));
  }
  const slice = parts.slice(-(maxParts || 40));
  for (const p of slice) {
    const a = p.author || {};
    const body = stripHtml(p.body || '');
    if (!body) continue;
    if (p.part_type === 'note') {
      lines.push('[internal note] ' + (a.name || 'admin') + ': ' + body);
      continue;
    }
    if (a.type === 'user') lines.push('Client: ' + body);
    else if (a.type === 'admin' || a.type === 'bot') lines.push((a.name || 'Agent') + ': ' + body);
  }
  return lines.join('\n');
}

function stripActionLeak(text) {
  let t = String(text || '');
  // Cut at first leaked second ACTION block inside body
  t = t.replace(/\n\s*ACTION\s*:\s*(?:REPLY|ESCALATE|CLOSE|SKIP)\b[\s\S]*$/i, '');
  // Drop leftover parser label lines
  t = t.replace(/^\s*(?:ACTION|BODY|KIND|CLIENT|ACTION_NEEDED)\s*:\s*.*$/gim, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

function parseAction(raw) {
  const text = String(raw || '').trim();
  const m = text.match(/ACTION:\s*(REPLY|ESCALATE|CLOSE|SKIP)\s*[\r\n]+([\s\S]*)/i);
  if (m) {
    const action = m[1].toUpperCase();
    let rest = (m[2] || '').trim();
    let kind = '';
    const km = rest.match(/^KIND:\s*([^\r\n]+)\s*/i);
    if (km) {
      kind = String(km[1] || '').trim().toUpperCase();
      rest = rest.slice(km[0].length).trim();
    }
    let client = '';
    const cm = rest.match(/^CLIENT:\s*([\s\S]*?)(?=\nBODY:|\nKIND:|\nACTION:|$)/i);
    if (cm) {
      client = (cm[1] || '').trim();
      rest = rest.slice(cm[0].length).trim();
    }
    if (!kind) {
      const km2 = rest.match(/^KIND:\s*([^\r\n]+)\s*/i);
      if (km2) {
        kind = String(km2[1] || '').trim().toUpperCase();
        rest = rest.slice(km2[0].length).trim();
      }
    }
    // Stop BODY at next ACTION / ACTION_NEEDED so leaked CLOSE blocks never enter client text
    const bm = rest.match(/^BODY:\s*([\s\S]*?)(?=\nACTION_NEEDED:|\nACTION\s*:|$)/i);
    let body = bm ? String(bm[1] || '').trim() : rest.replace(/^BODY:\s*/i, '').trim();
    const am = rest.match(/\nACTION_NEEDED:\s*([\s\S]*)$/i);
    const actionNeeded = am ? String(am[1] || '').trim() : '';
    if (am && bm) body = String(bm[1] || '').trim();
    if (!kind && /FAQ[_ ]?CONFIRM/i.test(client + '\n' + body)) kind = 'FAQ_CONFIRM';
    if (!kind && /PLATFORM|DELETE|GDPR/i.test(client + '\n' + body)) kind = 'PLATFORM';
    if (!kind) kind = 'ACCOUNT';
    if (/FAQ/.test(kind)) kind = 'FAQ_CONFIRM';
    else if (/PLATFORM|DELETE|GDPR|DATA/.test(kind)) kind = 'PLATFORM';
    else kind = 'ACCOUNT';
    body = stripActionLeak(body);
    client = stripActionLeak(client);
    return { action, client, body, kind, actionNeeded };
  }
  // If model forgot ACTION, treat as REPLY but strip labels
  const cleaned = stripActionLeak(text.replace(/^ACTION:\s*\w+\s*/i, '').replace(/^BODY:\s*/i, '').trim());
  return { action: 'REPLY', body: cleaned, client: '', kind: 'ACCOUNT', actionNeeded: '' };
}

async function fetchConversation(id) {
  const r = await icRequest(
    'get',
    'https://api.intercom.io/conversations/' + id,
    undefined,
    'FETCH'
  );
  if (!r.ok) {
    console.log('fetchConversation fail', id, r.status);
    return null;
  }
  return r.data;
}

async function postReply(conversationId, messageType, body, opts) {
  // Notes are already Intercom HTML (mentions, <b>, <br>). Never run toHtml on them ,
  // escaping turns <br>/<a> into visible code and breaks teammate @mentions.
  // Redact before either shape is sent so a canary cannot leave in a note or a comment.
  const redacted = fixedMessageHandoff.redactCredentials(String(body || ''));
  const exactTemplate = messageType !== 'note' && fixedMessageHandoff.isExactAllowedTemplate(redacted);
  let finalBody = messageType === 'note' || (opts && opts.verbatim) || fixedMessageHandoff.isTerminalHedge(redacted) ? redacted : (exactTemplate ? redacted : toHtml(redacted));
  if(opts&&opts.keepApprovedBytes&&messageType!=='note'&&(''+body).replace(/\p{Cf}/gu,'')===redacted)finalBody=body;
  if (opts && opts.owedFixedLine && messageType !== 'note') {
    writeOpStore.releaseUnknownReply(conversationId, messageType, finalBody, ARSAL_ID);
  }
  const r = await icRequest(
    'post',
    'https://api.intercom.io/conversations/' + conversationId + '/reply',
    { message_type: messageType, type: 'admin', admin_id: ARSAL_ID, body: finalBody },
    messageType === 'note' ? 'NOTE' : 'OUT'
  );
  console.log(messageType === 'note' ? 'NOTE' : 'OUT', conversationId, r.status, r.ok ? 'ok' : 'FAIL');
  return r;
}

async function closeConversation(conversationId) {
  return icRequest(
    'post',
    'https://api.intercom.io/conversations/' + conversationId + '/reply',
    { message_type: 'close', type: 'admin', admin_id: ARSAL_ID },
    'CLOSE'
  );
}

function arsalAlreadyRepliedAfter(parts, userPart) {
  if (!userPart) return false;
  const after = Number(userPart.created_at || 0);
  for (const p of parts) {
    const a = p.author || {};
    if (String(a.id || '') !== ARSAL_ID) continue;
    // Our own internal note is not an answer. Only a public customer-facing reply is.
    if (!fixedMessageHandoff.isPublicCustomerReply(p)) continue;
    if (Number(p.created_at || 0) > after) return true;
  }
  return false;
}

// Prevent double client replies when Intercom delivers the same webhook twice in parallel
const clientReplyInflight = new Map();

function firstNameFromClient(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  // Drop junk placeholders (never greet as "Bot test")
  if (/^bot\s*test$/i.test(n)) return '';
  const part = n.split(/\s+/)[0];
  return part.replace(/[^A-Za-zÀ-ÿ'\-]/g, '') || '';
}

function arsalHasPublicClientReply(parts) {
  for (const p of parts || []) {
    const a = p.author || {};
    if (String(a.id || '') !== ARSAL_ID) continue;
    if (p.part_type === 'note') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    // assignment/close with no real client text already skipped by empty body
    return true;
  }
  return false;
}

function ensureFirstReplyWelcomeIntro(body, clientName, parts, latestClientText = '') {
  let text = String(body || '').trim();
  if (!text) return text;
  if (fixedMessageHandoff.isExactAllowedTemplate(text)) return text;
  if (arsalHasPublicClientReply(parts)) return text;
  /* MICHAN_TEAMMATE_HANDOFF_V1: never inject a welcome after human teammate public reply */
  if (
    teammateHandoffGates.shouldSkipWelcomeIntro(parts, {
      arsalId: ARSAL_ID,
      eliteAiId: ELITE_AI_ID,
    })
  ) {
    return text;
  }
  text = assistantIdentityGuard.stripPersonalAlias(text);
  const first = firstNameFromClient(clientName);
  const clientText = String(latestClientText || '');
  const hasGreeting = /^(?:hello|hi|hey|ciao|salve|salam|assalam|السلام)/i.test(text);
  if (hasGreeting) return text;
  const italian = /\b(ciao|sono|aiutarti|per favore)\b/i.test(text) || /\b(?:ciao|buongiorno|salve|aiuto|aiutarmi)\b/i.test(clientText);
  if (italian) {
    const greet = first ? ('Ciao ' + first + ',') : 'Ciao,';
    return greet + '\n\n' + text.replace(/^(ciao[,\s]+)+/i, '').trim();
  }
  if (/[\u0600-\u06ff]/.test(clientText)) return (first ? ('السلام علیکم ' + first + '،') : 'السلام علیکم،') + '\n\n' + text;
  if (/\b(?:kya|aap|ap|tum|mujhe|madad|salam)\b/i.test(clientText)) return (first ? ('Salam ' + first + ',') : 'Salam,') + '\n\n' + text;
  const greet = first ? ('Hello ' + first + ',') : 'Hello,';
  let rest = text.replace(/^(hello|hi|hey)[,\s]+[A-Za-zÀ-ÿ'\-]*[,\s]*/i, '').trim();
  if (!rest) rest = text;
  return greet + '\n\n' + rest;
}

// Per-conversation send serialization. The already-replied check inside re-fetches the
// conversation, but two CONCURRENT callers both fetch before either sends, so neither sees
// the other's reply and both post (demonstrated by selftest-replay-sideeffects.js:3).
// clientReplyInflight only guards the webhook entry point, so a poller racing a webhook was
// unprotected. Serializing per conversation makes the second caller re-fetch AFTER the first
// send, so the existing dedupe does its job. Legitimate retries still run - they are
// serialized, not dropped.
const clientSendLocks = new Map();

async function postClientCommentOnce(conversationId, body, userPart, clientName, figureKnowledge) {
  const lockKey = String(conversationId);
  const prev = clientSendLocks.get(lockKey) || Promise.resolve();
  const run = prev
    .catch(() => {})
    .then(() => postClientCommentOnceInner(conversationId, body, userPart, clientName, figureKnowledge));
  const settled = run.then(() => {}, () => {});
  clientSendLocks.set(lockKey, settled);
  settled.then(() => {
    if (clientSendLocks.get(lockKey) === settled) clientSendLocks.delete(lockKey);
  });
  return run;
}

async function postClientCommentOnceInner(conversationId, body, userPart, clientName, figureKnowledge) {
  let gate = await checkSendBoundary(conversationId, userPart, clientName);
  if (!gate.ok) {
    console.log('SKIP pre-send', gate.why, conversationId);
    return null;
  }
  let parts = gate.parts;
  // The locked spread reply is posted byte for byte, including on the first
  // message: no welcome prefix, no redaction, no later edit.
  if (fixedMessageHandoff.isExactAllowedTemplate(String(body || ''))) {
    return postReply(conversationId, 'comment', String(body));
  }
  // The approved number hedge is terminal: no welcome, no 2-step clarifier, no rephrase.
  if (fixedMessageHandoff.isTerminalHedge(String(body || ''))) {
    return postReply(conversationId, 'comment', String(body || '').replace(/\s+/g, ' ').trim());
  }
  // A welcome KB answer is the selected article, posted as stored. It is not a hedge.
  {
    const asked = userPart ? stripHtml(userPart.body || '') : '';
    if (fixedMessageHandoff.isApprovedFaqAnswer(asked, body)) {
      return postReply(conversationId, 'comment', fixedMessageHandoff.approvedFaqCustomerBody(asked), { verbatim: true, keepApprovedBytes: true });
    }
    if (fixedMessageHandoff.isUniqueFaqArticle(asked, body)) {
      return postReply(conversationId, 'comment', fixedMessageHandoff.uniqueRankedFaqArticle(asked), { verbatim: true, keepApprovedBytes: true });
    }
    if (figureKnowledge && fixedMessageHandoff.supportedFigureDraft(body, '', figureKnowledge) === String(body || '').replace(/\s+/g, ' ').trim()) {
      return postReply(conversationId, 'comment', String(body || '').replace(/\s+/g, ' ').trim(), { verbatim: true });
    }
  }
  // Soft dedupe: never post the same public bot body twice in a row (identity asks etc.)
  try {
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const want = norm(body);
    if (want) {
      for (let i = (parts || []).length - 1; i >= 0; i--) {
        const p = parts[i];
        if (!p || String(p.part_type || '') === 'note') continue;
        const a = p.author || {};
        if (String(a.id || '') !== ARSAL_ID && a.type !== 'bot') continue;
        const last = norm(stripHtml(p.body || ''));
        if (!last) continue;
        if (last === want) {
          console.log('SKIP identical last public body', conversationId);
          return null;
        }
        break;
      }
    }
  } catch (e) {
    console.error('identical-body dedupe fail', conversationId, e && e.message);
  }
  const __exactClarifier = String(body || '').replace(/\s+/g, ' ').trim();
  if (__exactClarifier === fixedMessageHandoff.CHALLENGE_CLARIFIER || __exactClarifier === fixedMessageHandoff.PASSWORD_POLICY_CLARIFIER) {
    return postReply(conversationId, 'comment', __exactClarifier, { verbatim: true });
  }
  const priorClientTexts = userPart ? parts
    .filter((p) => String((p.author || {}).id || '') === String((userPart.author || {}).id || '') &&
      Number(p.created_at || 0) < Number(userPart.created_at || 0))
    .map((p) => stripHtml(p.body || '')) : [];
  const priorBotTexts = userPart ? parts
    .filter((p) => String((p.author || {}).id || '') === ARSAL_ID && p.part_type !== 'note' &&
      Number(p.created_at || 0) < Number(userPart.created_at || 0))
    .map((p) => stripHtml(p.body || '')) : [];
  const latestClientText = userPart ? stripHtml(userPart.body || '') : '';
  const identitySafeBody = assistantIdentityGuard.enforceAssistantIdentityReply(
    latestClientText, body, conversationId, priorBotTexts
  );
  if (identitySafeBody !== body) console.log('ASSISTANT_IDENTITY_GUARD', conversationId);
  const guardedBody = challengeVariantGuard.clarifyTwoStepReply(
    latestClientText, priorClientTexts, identitySafeBody, priorBotTexts, conversationId
  );
  if (guardedBody !== identitySafeBody) console.log('2-STEP_VARIANT_CLARIFICATION', conversationId);
  let finalBody = ensureFirstReplyWelcomeIntro(guardedBody, clientName, parts, latestClientText);
  const previousBot = priorBotTexts.slice(-1)[0] || '';
  const repeatedQuestion = userPart && isRepeatedClientQuestion(stripHtml(userPart.body || ''), priorClientTexts);
  if (repeatedQuestion && guardedBody === body && previousBot &&
      (repeatTextUtils.normalize(previousBot) === repeatTextUtils.normalize(finalBody) ||
       nearCopiedWording(previousBot, finalBody))) {
    try {
      const ai = await openai.chat.completions.create({
        model: control.getModel(),
        messages: [
          { role: 'system', content: control.getPrompt() },
          { role: 'user', content: 'The client repeated this question: ' + stripHtml(userPart.body || '') +
            '\n\nApproved answer to preserve exactly in meaning, facts, numbers, eligibility, and policy:\n' + finalBody +
            '\n\nBriefly acknowledge and explain it in new natural wording. Do not add or remove any rule or next step. Output only the client-facing reply.' },
        ],
      });
      const raw = ((((ai.choices[0] || {}).message || {}).content) || '').trim();
      const parsed = parseAction(raw);
      const candidate = postProcessModelReply(/^\s*ACTION\s*:/i.test(raw) ? (parsed.action === 'REPLY' ? parsed.body : '') : raw, conversationId);
      if (candidate && protectedFactsMatch(finalBody, candidate) &&
          repeatTextUtils.normalize(previousBot) !== repeatTextUtils.normalize(candidate) &&
          !nearCopiedWording(previousBot, candidate)) finalBody = candidate;
      else { console.log('REPEATED_DIRECT_REPLY_HELD', conversationId); return null; }
    } catch (e) { console.error('REPEATED_DIRECT_REPLY_RETRY_FAILED', conversationId, e && e.message); return null; }
    gate = await checkSendBoundary(conversationId, userPart, clientName);
    if (!gate.ok) {
      console.log('SKIP post-rephrase', gate.why, conversationId);
      return null;
    }
    parts = gate.parts;
  }
  // MANDATORY FINAL-PAYLOAD VALIDATION.
  // Re-check the exact customer bytes with FAQ evidence retained. Facts, conditions,
  // action truth and privacy stay mandatory after any later model call.
  {
    const MANDATORY = new Set([
      'INTERNAL_INFO_LEAK', 'UNSUPPORTED_PROMISE', 'EMPTY_REPLY',
      'UNSUPPORTED_NUMBER', 'UNSUPPORTED_FACT', 'FORBIDDEN_DIAGNOSTIC_ACTION',
      'KNOWLEDGE_GAP_UNSAFE',
    ]);
    const verdict = async (text) => {
      try {
        const built = __statePresend.buildState(conversationId, parts, userPart);
        let knowledge = null;
        if (faqKb && typeof faqKb.retrieveOfficialFaqContext === 'function' && latestClientText) {
          try {
            const hit = await faqKb.retrieveOfficialFaqContext(latestClientText, { live: false });
            if (hit && hit.block) {
              knowledge = __statePresend.modules.gapGate.classify(
                [{ title: 'Official FAQ', text: hit.block, score: 0.72, source: hit.from || 'faq-kb' }],
                latestClientText
              );
            }
          } catch (_) { /* local evidence only; fail the content checks we can still run */ }
        }
        const res = __statePresend.modules.presend.validate(text, {
          state: built.state,
          messages: built.messages,
          knowledge,
          route: 'FULL',
          guards: __statePresend.guards,
          conversationId,
        });
        return (res.hardFails || []).filter((f) => f && MANDATORY.has(f.code)).map((f) => f.code);
      } catch (e) {
        console.error('POSTGATE_REVALIDATE_ERROR', conversationId, e && e.message);
        return ['REVALIDATE_ERROR'];
      }
    };

    const hits = await verdict(finalBody);
    if (hits.length) {
      const fallback = identitySafeBody;
      const fbHits = fallback && fallback !== finalBody ? await verdict(fallback) : hits;
      if (fbHits.length) {
        console.log('POSTGATE_SUPPRESSED', conversationId, 'candidate=' + hits.join(',') + ' fallback=' + fbHits.join(','));
        return null;
      }
      console.log('POSTGATE_REVALIDATE_FELLBACK', conversationId, hits.join(','));
      finalBody = fallback;
    }
  }

  gate = await checkSendBoundary(conversationId, userPart, clientName);
  if (!gate.ok) {
    console.log('SKIP final-boundary', gate.why, conversationId);
    return null;
  }

  finalBody = fixedMessageHandoff.redactCredentials(finalBody);
  return postReply(conversationId, 'comment', finalBody);
}

const AUTHORIZED_NOTE_ADMIN_IDS = new Set([ARSAL_ID, JERRY_ID]);

function noteBodyMentionsAuthorized(htmlOrText) {
  const s = String(htmlOrText || '');
  if (/admin\/(?:10118526|8053416)\b/i.test(s)) return true;
  if (/entity_mention[^>]*>\s*[^<]*(Arsal|Jerry)/i.test(s)) return true;
  const plain = stripHtml(s);
  if (/(^|[^a-z])@(?:arsal|jerry)\b/i.test(plain)) return true;
  if (/\b(?:arsal|jerry(?:\s*-?\s*manager)?)\b/i.test(plain) && /@/.test(plain)) return true;
  return false;
}

const AUTH_ACK_MARK = '[bot-ack] ';

function isEscalateOrSystemNote(plain) {
  const t = String(plain || '');
  // Bot-built escalate notes (posted as Arsal) must never become FOLLOW commands
  if (/\bAccount\s*:/i.test(t) && /\bEmail\s*:/i.test(t) && /\bProblem\s*:/i.test(t)) return true;
  if (/\bAction needed\s*:/i.test(t) && /\bIf remains unsolved\s*:/i.test(t)) return true;
  if (/\bProblem:\s*<b>/i.test(t) && /Account:/i.test(t)) return true;
  return false;
}

function isBotAuthConfirmNote(plain) {
  const t = String(plain || '').trim();
  if (!t) return true;
  if (/^\[bot-ack\]/i.test(t)) return true;
  if (/^sent to client\b/i.test(t)) return true;
  if (/^✓\s/u.test(t)) return true;
  // Any of our ack openers , never re-handle (stops note loops)
  if (/^(okay|understood|got it|noted|sure|done|yes)\b/i.test(t)) return true;
  if (/^here\b/i.test(t)) return true;
  if (/\bi'?ll\s+(follow|continue|stop|pause|resume|keep|act)\b/i.test(t)) return true;
  if (/\bi'?m\s+(back|here|on it)\b/i.test(t)) return true;
  return false;
}

function stripOwnerMentionPrefix(plain) {
  return String(plain || '')
    .replace(/^(?:\s*(?:@\S+|arsal|jerry(?:\s*-?\s*manager)?))+\s*/i, '')
    .trim();
}

/** Owner "send this message to client [ ... ]" , deterministic REPLY body (exact bracket/quote text, light trim). */
function polishOwnerDictatedClientBody(s) {
  let t = String(s || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}

function extractOwnerSendToClientBody(plain, opts) {
  const raw = String(plain || '');
  const stripped = typeof stripOwnerMentionPrefix === 'function' ? stripOwnerMentionPrefix(raw) : raw;
  const hay = stripped + '\n' + raw;
  if (!/send\s+(?:this\s+)?(?:message|reply|this)\s+to\s+(?:the\s+)?client/i.test(hay)) {
    return null;
  }
  let m = raw.match(/\[([^\]]+)\]/);
  if (!(m && String(m[1] || '').trim())) {
    m = raw.match(/["\u201C]([^"\u201D]+)["\u201D]/) || raw.match(/'([^']+)'/);
  }
  const inner = m && String(m[1] || '').trim();
  if (!inner) return null;
  // On a human-assigned thread the owner body is posted verbatim, not polished.
  if (opts && opts.verbatim) return inner;
  return polishOwnerDictatedClientBody(inner);
}

function parseAuthorizedNoteCommand(plain, opts) {
  const raw = String(plain || '').trim();
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t || isBotAuthConfirmNote(t)) return null;
  if (isEscalateOrSystemNote(t)) return null;

  // Structured REPLY: / NOTE: (after optional @mentions) , prefer before soft RESUME "reply now"
  const stripped = stripOwnerMentionPrefix(raw);
  let sm = stripped.match(/^REPLY\s*[:\-]\s*([\s\S]*)$/i);
  if (sm) {
    const body = String(sm[1] || '').trim();
    // Empty or unparsable owner text is still a REPLY command, and it posts nothing.
    return { cmd: 'REPLY', body, verbatim: true, parsable: !!body };
  }
  sm = stripped.match(/^NOTE\s*[:\-]\s*([\s\S]+)/i);
  if (sm && String(sm[1] || '').trim()) {
    return { cmd: 'NOTE', body: String(sm[1]).trim() };
  }
  // Deterministic: send this message to client [ ... ] / quotes → REPLY (before please→FOLLOW)
  const sendBody = extractOwnerSendToClientBody(raw, { verbatim: !!(opts && opts.verbatim) });
  if (sendBody) {
    return { cmd: 'REPLY', body: sendBody, verbatim: true, parsable: true };
  }
  if (/^(?:SKIP)\b/i.test(stripped) || /\bskip\s+(this|the)\s+(ticket|one|message|chat)\b/i.test(t)) {
    return { cmd: 'SKIP', body: '' };
  }
  if (
    /\b(re-?open|open)\b.+\b(ticket|chat|conversation)\b/i.test(t) ||
    /\b(re-?open|open)\s+(this|it)\b/i.test(t)
  ) {
    return { cmd: 'OPEN', body: '' };
  }

  if (
    /\b(resume|unpause|bot\s*on|ai\s*on|start\s+replying|keep\s+replying|re-?enable\s+replies)\b/i.test(t) ||
    /\byou\s+can\s+reply\s+now\b/i.test(t) ||
    /\b(please\s+)?reply\s+now\b/i.test(t) ||
    /\byou\s+may\s+reply\b/i.test(t) ||
    /\bcontinue\s+replying\b/i.test(t) ||
    /\bcontinue\s+to\s+assist\b/i.test(t) ||
    /\b(can|may)\s+continue\s+to\s+assist\b/i.test(t) ||
    /\bassist\s+this\s+client\b/i.test(t) ||
    /\bkeep\s+(helping|assisting)\b/i.test(t) ||
    /\bturn\s+(the\s+)?(bot|ai|replies)\s+on\b/i.test(t) ||
    /\bunmute\b/i.test(t)
  ) {
    return { cmd: 'RESUME', body: '' };
  }
  if (/\b(close)\b.+\b(ticket|chat|conversation)\b/i.test(t) || /\bclose\s+(this|it)\b/i.test(t)) {
    return { cmd: 'CLOSE', body: '' };
  }
  if (
    /\b(stop|pause|don'?t|do\s+not|never)\b.+\b(reply|replies|respond|responses|answering)\b/i.test(t) ||
    /\b(bot\s*off|ai\s*off|stay\s+silent|go\s+silent|silence\s+here|no\s+more\s+replies)\b/i.test(t) ||
    /\b(stop\s+replying|pause\s+responses?|don'?t\s+reply)\b/i.test(t) ||
    /* AUDIT_HARDEN_V1:botStop */
    /\bbot\s+please\s+stop\b/i.test(t) ||
    /\bplease\s+stop\s+(the\s+)?(bot|ai|replies|replying)\b/i.test(t) ||
    /\b(stop|pause)\s+(the\s+)?(bot|ai)\b/i.test(t) ||
    /\b(arsal|jerry)\s+stop\b/i.test(t) ||
    /\bbot\s+stop\b/i.test(t) ||
    /^(?:STOP|OFF)\b/i.test(stripped)
  ) {
    return { cmd: 'STOP', body: '' };
  }
  if (/\bare\s+you\s+there\b/i.test(t) || /\byou\s+there\??/i.test(t) || /\bping\b/i.test(t)) {
    return { cmd: 'PING', body: '' };
  }
  // Explicit instruction tone → flexible owner command
  if (
    /\b(please|pls)\b/i.test(t) ||
    /\b(make\s+sure|prioritize|assign|snooze|tag|forward|escalate)\b/i.test(t) ||
    /\byou\s+(should|must|need\s+to)\b/i.test(t)
  ) {
    return { cmd: 'FOLLOW', body: '' };
  }
  // FOLLOW only when the note @mentions Arsal/Jerry (or entity mention) AND has substance.
  // Casual Arsal/Jerry notes WITHOUT a mention must be ignored (no auto "Okay, noted").
  const mentioned = opts && opts.mentionsAuthorized;
  if (mentioned && t.length >= 8) {
    let rest = t
      .replace(/@(?:arsal|jerry)\b/gi, ' ')
      .replace(/\b(?:arsal|jerry)(?:\s*-?\s*manager)?\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (rest.length >= 6 && !/^(ok|okay|thanks|thank you|noted|yes|no)\.?$/i.test(rest)) {
      return { cmd: 'FOLLOW', body: '' };
    }
  }
  return null;
}

const OWNER_CMD_ACTION_RE =
  /ACTION:\s*(REPLY|NOTE|CLOSE|OPEN|SKIP|STOP|RESUME|NOOP|CLARIFY)\b/i;

function parseOwnerCommandAction(raw) {
  const text = String(raw || '').trim();
  const m = text.match(/ACTION:\s*(REPLY|NOTE|CLOSE|OPEN|SKIP|STOP|RESUME|NOOP|CLARIFY)\s*[\r\n]+([\s\S]*)/i);
  if (m) {
    const action = String(m[1] || '').toUpperCase();
    let rest = String(m[2] || '').trim();
    const bm = rest.match(/^BODY:\s*([\s\S]*?)(?=\nACTION\s*:|$)/i);
    let body = bm ? String(bm[1] || '').trim() : rest.replace(/^BODY:\s*/i, '').trim();
    body = stripActionLeak(body);
    return { action, body };
  }
  const cleaned = stripActionLeak(
    text.replace(/^ACTION:\s*\w+\s*/i, '').replace(/^BODY:\s*/i, '').trim()
  );
  return { action: 'NOTE', body: cleaned || 'Okay, noted.' };
}

async function openConversation(conversationId) {
  return axios.post(
    'https://api.intercom.io/conversations/' + conversationId + '/reply',
    { message_type: 'open', type: 'admin', admin_id: ARSAL_ID },
    { headers: icHeaders(), timeout: IC_TIMEOUT_MS, validateStatus: () => true }
  );
}

const OWNER_CMD_SYSTEM_OVERLAY = [
  'OWNER / JERRY DIRECT COMMAND , HIGHEST PRIORITY',
  'You are executing a direct instruction from Arsal (owner) or Jerry on this Intercom ticket.',
  'Understand intent (not exact phrases). me/my/I/Arsal/owner = the owner when context is clear.',
  'Latest direct owner/Jerry instruction overrides older workflow for this situation.',
  'Still never invent FundedElite facts. Do not @mention forbidden seats in notes.',
  'Do not use client-visible MT5 wording unless the locked spread-test template applies, or the owner explicitly demands that wording.',
  'Escalations/Risk are normally silent note-only; if the owner explicitly orders a public client reply on THIS ticket, honor it.',
  'INTERNAL NOTES ALWAYS ENGLISH: NOTE / CLARIFY / auth-confirm style BODY text must be English only , never Roman Urdu, Urdu, or Italian for notes. Client REPLY language still follows existing client-language locks.',
  'Choose exactly one ACTION. Prefer NOTE for internal-only asks (summarize, analyze, explain to owner). Prefer REPLY only when they want the client messaged.',
  'When the owner asks to mention a teammate and have them reply (e.g. "mention Anjsha and ask him to reply"), prefer ACTION: NOTE with BODY that starts with @TeammateName so the bot can post a real Intercom entity_mention (example BODY: "@Anjsha Please reply on this ticket."). Do not @mention forbidden seats (Jerry escalate rules / supportjp / teamfutureselite / SAQII / Arsal / Elite AI / Risk).',
  'Output format (nothing before ACTION):',
  'ACTION: REPLY|NOTE|CLOSE|OPEN|SKIP|STOP|RESUME|NOOP|CLARIFY',
  'BODY: <message or short reason>',
  'CLARIFY = short internal note asking what they meant. NOOP = nothing to do (brief reason in BODY).',
].join('\n');

async function interpretOwnerCommandViaLlm(conversationId, full, plain, authorId) {
  const bits = contactBits(full);
  const history = fixedMessageHandoff.redactCredentials(buildHistory(full, 50));
  const who = authorId === ARSAL_ID ? 'Arsal (owner)' : authorId === JERRY_ID ? 'Jerry' : 'authorized admin';
  const userMsg =
    'DIRECT COMMAND from ' +
    who +
    ':\n' +
    fixedMessageHandoff.redactCredentials(String(plain || '').trim()) +
    '\n\nClient name: ' +
    (bits.name || '') +
    '\nClient email: ' +
    (bits.email || '') +
    '\nConversation id: ' +
    conversationId +
    '\n\nFULL TICKET HISTORY:\n' +
    history +
    '\n\nInterpret the direct command and respond with OWNER ACTION format only.';
  const ai = await openai.chat.completions.create({
    model: control.getModel(),
    messages: [
      { role: 'system', content: control.getPrompt() + '\n\n' + OWNER_CMD_SYSTEM_OVERLAY },
      { role: 'user', content: userMsg },
    ],
  });
  const rawOut = ((ai.choices[0] && ai.choices[0].message && ai.choices[0].message.content) || '').trim();
  console.log('OWNER_CMD_LLM_RAW', conversationId, rawOut.slice(0, 240));
  return parseOwnerCommandAction(rawOut);
}

function humanAssignedThread(full) {
  if (teammateHandoffGates.isAssignedToHumanTeammate(full, handoffOwnershipOpts())) return true;
  const team = full && full.team_assignee_id != null ? String(full.team_assignee_id) : '';
  return !!(team && team !== '0' && (team === String(RISK_TEAM_ID) || team === String(ESCALATIONS_TEAM_ID)));
}

async function executeOwnerActionPlan(conversationId, full, plan, plain) {
  const action = String((plan && plan.action) || 'NOOP').toUpperCase();
  let body = String((plan && plan.body) || '').trim();
  if (action === 'STOP') {
    control.setAiOff(conversationId);
    await postReply(conversationId, 'note', authConfirmText('STOP', plain));
    return 'STOP';
  }
  if (action === 'RESUME') {
    control.clearAiOff(conversationId);
    await postReply(conversationId, 'note', authConfirmText('RESUME', plain));
    return 'RESUME';
  }
  if (action === 'CLOSE') {
    control.setAiOff(conversationId);
    await postReply(conversationId, 'note', authConfirmText('CLOSE', plain));
    await closeConversation(conversationId);
    return 'CLOSE';
  }
  if (action === 'OPEN') {
    control.clearAiOff(conversationId);
    await openConversation(conversationId);
    await postReply(conversationId, 'note', 'Okay, reopening this ticket.');
    return 'OPEN';
  }
  if (action === 'SKIP' || action === 'NOOP') {
    await postReply(conversationId, 'note', body ? ('Okay, noted. ' + body).slice(0, 500) : 'Okay, noted.');
    return action;
  }
  if (action === 'CLARIFY') {
    let noteBody = body || 'Could you clarify what you want me to do on this ticket?';
    noteBody = await ensureInternalNoteEnglish(noteBody, 'Owner CLARIFY');
    await postReply(conversationId, 'note', noteBody);
    return 'CLARIFY';
  }
  if (action === 'NOTE') {
    if (!body) body = 'Okay, noted.';
    body = await ensureInternalNoteEnglish(body, 'Owner NOTE');
    // Owner notes: enrich @Name → Intercom entity_mention (escape other text carefully)
    const html = await enrichNoteMentionsHtml(body);
    await postReply(conversationId, 'note', html);
    return 'NOTE';
  }
  if (action === 'REPLY') {
    const decision = fixedMessageHandoff.ownerPublicReplyDecision({
      humanAssigned: humanAssignedThread(full),
      verbatim: !!(plan && plan.verbatim),
      parsable: !(plan && plan.parsable === false) && !!body,
      authenticated: !(plan && plan.authenticated === false),
      body,
    });
    // Human-assigned: only the owner's verbatim body is posted. Generated or
    // empty text posts nothing. Bot-assigned keeps the existing draft path.
    if (decision.applies) {
      if (!decision.post) {
        console.log('OWNER_REPLY withheld', decision.reason, conversationId);
        return 'WITHHELD';
      }
      control.clearAiOff(conversationId);
      const r = await postReply(conversationId, 'comment', decision.body, { verbatim: true });
      if (r && r.status >= 200 && r.status < 300) {
        await postReply(conversationId, 'note', 'Sent to client.');
      } else {
        console.log('OWNER_REPLY_FAIL', conversationId, r && r.status);
        await postReply(conversationId, 'note', 'Tried to send your message to the client but Intercom returned an error.');
      }
      return 'REPLY';
    }
    if (!body) {
      console.log('OWNER_REPLY withheld owner-body-empty', conversationId);
      return 'WITHHELD';
    }
    control.clearAiOff(conversationId);
    // Owner-dictated public REPLY: never welcome-intro, never already-replied skip (Escalations often have prior Arsal notes).
    let out = postProcessModelReply(body, conversationId);
    const r = await postReply(conversationId, 'comment', out);
    if (r && r.status >= 200 && r.status < 300) {
      await postReply(conversationId, 'note', 'Sent to client.');
    } else {
      console.log('OWNER_REPLY_FAIL', conversationId, r && r.status);
      await postReply(conversationId, 'note', 'Tried to send your message to the client but Intercom returned an error.');
    }
    return 'REPLY';
  }
  await postReply(conversationId, 'note', 'Okay, noted.');
  return 'NOOP';
}

function authConfirmText(cmd, plain) {
  if (cmd === 'STOP') {
    const opts = [
      "Okay, I'll stop replying to this ticket as requested.",
      "Understood, I'll pause responses here.",
      "Got it - no more replies on this ticket from me.",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  if (cmd === 'RESUME') {
    const opts = [
      "Understood, I'll resume replies on this ticket.",
      "Okay, I'm back on this ticket.",
      "Got it - I'll continue assisting this client.",
      "Okay, I'll keep helping if the client asks further questions.",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  if (cmd === 'CLOSE') {
    const opts = [
      "Okay, closing this ticket as requested.",
      "Understood, I'll close this conversation.",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  if (cmd === 'PING') {
    const opts = [
      "Yes, I'm here on this ticket.",
      "Here - watching this ticket.",
      "Yes, I'm on it.",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  if (cmd === 'FOLLOW') {
    const opts = [
      "Okay, noted - I'll follow that on this ticket.",
      "Understood - I'll act on that here.",
      "Got it - I'll follow your instruction on this ticket.",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  return "Okay, noted.";
}

const authNoteInflight = new Map();

async function processAuthorizedNoteCommands(conversationId, full) {
  const idKey = String(conversationId || '');
  if (!idKey) return null;
  if (authNoteInflight.has(idKey)) {
    console.log('AUTH_NOTE skip inflight', idKey);
    return null;
  }
  authNoteInflight.set(idKey, Date.now());
  try {
  const parts = partsOf(full);
  const { all, state, id } = getConvState(conversationId);
  if (!Array.isArray(state.handledAuthNoteIds)) state.handledAuthNoteIds = [];
  const handled = new Set(state.handledAuthNoteIds.map(String));
  let acted = null;

  // First seen ticket: seed older notes so history never auto-fires,
  // but leave the newest note free (covers admin.noted on first sight).
  if (!state.authNotesBootstrapped) {
    const noteParts = parts.filter((p) => p && p.part_type === 'note');
    let newestId = '';
    let newestAt = -1;
    for (const p of noteParts) {
      const at = Number(p.created_at || 0);
      if (at >= newestAt) {
        newestAt = at;
        newestId = String(p.id || p.created_at || '');
      }
    }
    for (const part of noteParts) {
      const partId = String(part.id || part.created_at || '');
      if (!partId || partId === newestId) continue;
      handled.add(partId);
    }
    state.authNotesBootstrapped = true;
  }

  // Only the newest note can fire per wake , prevents history re-fire / confirm loops
  const notePartsNewestFirst = parts
    .filter((p) => p && p.part_type === 'note')
    .slice()
    .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));

  for (const part of notePartsNewestFirst.slice(0, 1)) {
    if (!part || part.part_type !== 'note') continue;
    const partId = String(part.id || part.created_at || '');
    if (!partId || handled.has(partId)) continue;
    const author = part.author || {};
    const authorId = String(author.id || '');
    // Owner commands require author.type admin, a configured owner admin id,
    // and this internal note. A customer spoofing the id, name, or email is
    // not the owner. On a human-assigned thread that posts nothing.
    const ownerAuth = fixedMessageHandoff.authenticatedOwnerCommand(part, {
      ownerAdminIds: [ARSAL_ID, JERRY_ID],
    });
    if (!ownerAuth.ok) {
      handled.add(partId);
      if (humanAssignedThread(full)) {
        console.log('AUTH_NOTE withheld', ownerAuth.reason, conversationId);
      } else {
        console.log('AUTH_NOTE skip', ownerAuth.reason, conversationId, authorId, partId);
      }
      continue;
    }
    const rawBody = String(part.body || '');
    const plain = stripHtml(rawBody);
    if (isBotAuthConfirmNote(plain) || isEscalateOrSystemNote(plain)) {
      handled.add(partId);
      continue;
    }
    const mentionsAuthorized = noteBodyMentionsAuthorized(rawBody);
    // HARD: every actionable note must @mention Arsal or Jerry (self-mention counts).
    // Plain notes from Arsal/Jerry with no mention are ignored , no auto replies.
    if (!mentionsAuthorized) {
      handled.add(partId);
      console.log('AUTH_NOTE skip , no @Arsal/@Jerry mention', conversationId, authorId, partId);
      continue;
    }
    // HARD: only Arsal (self @mention) or Jerry (@mention command) may control the bot.
    // Other teammates (AUGUST, etc.) cannot STOP/RESUME/CLOSE even if they @Arsal.
    const isOwnerAuthor = authorId === ARSAL_ID || authorId === JERRY_ID;
    if (!isOwnerAuthor) {
      handled.add(partId);
      console.log('AUTH_NOTE skip , teammate cannot command bot', conversationId, authorId, partId);
      continue;
    }
    const parsedCmd = parseAuthorizedNoteCommand(plain, {
      fromAuthorizedAuthor: true,
      mentionsAuthorized,
      verbatim: humanAssignedThread(full),
    });
    if (!parsedCmd || !parsedCmd.cmd) {
      handled.add(partId);
      continue;
    }
    const cmd = parsedCmd.cmd;
    const cmdBody = String(parsedCmd.body || '').trim();
    // Claim + persist BEFORE any await so parallel admin.noted cannot re-run same note
    handled.add(partId);
    state.handledAuthNoteIds = Array.from(handled).slice(-500);
    all[id] = state;
    saveTicketState(all);

    if (cmd === 'STOP' || cmd === 'RESUME' || cmd === 'CLOSE' || cmd === 'PING') {
      // Confirm first, then apply (no [bot-ack] prefix)
      const confirm = authConfirmText(cmd, plain);
      await postReply(conversationId, 'note', confirm);
      if (cmd === 'STOP') {
        control.setAiOff(conversationId);
        console.log('AUTH_NOTE STOP', conversationId, authorId, partId);
      } else if (cmd === 'RESUME') {
        control.clearAiOff(conversationId);
        console.log('AUTH_NOTE RESUME', conversationId, authorId, partId);
      } else if (cmd === 'CLOSE') {
        control.setAiOff(conversationId);
        await closeConversation(conversationId);
        console.log('AUTH_NOTE CLOSE', conversationId, authorId, partId);
      } else {
        console.log('AUTH_NOTE PING', conversationId, authorId, partId);
      }
      acted = cmd;
    } else if (cmd === 'REPLY') {
      const replyDecision = fixedMessageHandoff.ownerPublicReplyDecision({
        humanAssigned: humanAssignedThread(full),
        verbatim: parsedCmd.verbatim !== false,
        parsable: parsedCmd.parsable !== false,
        authenticated: ownerAuth.ok,
        body: cmdBody,
      });
      if (replyDecision.applies) {
        if (!replyDecision.post) {
          console.log('AUTH_NOTE REPLY withheld', replyDecision.reason, conversationId);
          acted = 'WITHHELD';
        } else {
          control.clearAiOff(conversationId);
          const r = await postReply(conversationId, 'comment', replyDecision.body, { verbatim: true });
          if (r && r.status >= 200 && r.status < 300) {
            await postReply(conversationId, 'note', 'Sent to client.');
          } else {
            console.log('AUTH_NOTE REPLY_FAIL', conversationId, r && r.status);
            await postReply(conversationId, 'note', 'Tried to send your message to the client but Intercom returned an error.');
          }
          console.log('AUTH_NOTE REPLY', conversationId, authorId, partId);
          acted = 'REPLY';
        }
      } else if (!cmdBody) {
        console.log('AUTH_NOTE REPLY withheld owner-body-empty', conversationId);
        acted = 'WITHHELD';
      } else {
      control.clearAiOff(conversationId);
      // Auth-note REPLY (incl. send-this-message brackets): bypass already-replied / welcome-intro
      let out = postProcessModelReply(cmdBody, conversationId);
      const r = await postReply(conversationId, 'comment', out);
      if (r && r.status >= 200 && r.status < 300) {
        await postReply(conversationId, 'note', 'Sent to client.');
      } else {
        console.log('AUTH_NOTE REPLY_FAIL', conversationId, r && r.status);
        await postReply(conversationId, 'note', 'Tried to send your message to the client but Intercom returned an error.');
      }
      console.log('AUTH_NOTE REPLY', conversationId, authorId, partId);
      acted = 'REPLY';
      }
    } else if (cmd === 'NOTE') {
      const enBody = await ensureInternalNoteEnglish(cmdBody, 'AUTH_NOTE NOTE');
      const html = await enrichNoteMentionsHtml(enBody);
      await postReply(conversationId, 'note', html);
      console.log('AUTH_NOTE NOTE', conversationId, authorId, partId);
      acted = 'NOTE';
    } else if (cmd === 'OPEN') {
      control.clearAiOff(conversationId);
      await openConversation(conversationId);
      await postReply(conversationId, 'note', 'Okay, reopening this ticket.');
      console.log('AUTH_NOTE OPEN', conversationId, authorId, partId);
      acted = 'OPEN';
    } else if (cmd === 'SKIP') {
      await postReply(conversationId, 'note', 'Okay, skipping as requested.');
      console.log('AUTH_NOTE SKIP', conversationId, authorId, partId);
      acted = 'SKIP';
    } else if (cmd === 'FOLLOW') {
      // Flexible owner/Jerry command , interpret via model and execute allowed actions
      control.clearAiOff(conversationId);
      try {
        const exactSend = extractOwnerSendToClientBody(plain, { verbatim: humanAssignedThread(full) });
        const mentionNote = extractOwnerMentionAskReplyBody(plain);
        const plan = exactSend
          ? { action: 'REPLY', body: exactSend, verbatim: true, parsable: true }
          : mentionNote
            ? { action: 'NOTE', body: mentionNote }
            : await interpretOwnerCommandViaLlm(conversationId, full, plain, authorId);
        if (plan && String(plan.action || '').toUpperCase() === 'REPLY' && !exactSend) {
          plan.verbatim = false;
          plan.parsable = !!String(plan.body || '').trim();
        }
        const done = await executeOwnerActionPlan(conversationId, full, plan, plain);
        console.log('AUTH_NOTE FOLLOW->', done, conversationId, authorId, partId);
        acted = 'FOLLOW:' + done;
      } catch (e) {
        console.error('OWNER_CMD_FAIL', conversationId, e && e.message);
        await postReply(
          conversationId,
          'note',
          "Got it , I'll follow that on this ticket (could not auto-execute just now)."
        );
        acted = 'FOLLOW';
      }
    }
  }

  state.handledAuthNoteIds = Array.from(handled).slice(-500);
  all[id] = state;
  saveTicketState(all);
  return acted;
  } finally {
    authNoteInflight.delete(idKey);
  }
}

function handoffOwnershipOpts(extra) {
  return Object.assign(
    {
      arsalId: ARSAL_ID,
      eliteAiId: ELITE_AI_ID,
      jerryId: JERRY_ID,
      riskTeamId: RISK_TEAM_ID,
      escalationsTeamId: ESCALATIONS_TEAM_ID,
    },
    extra || {}
  );
}

function preferredEscalateAssigneeId(full) {
  const existing = full && full.admin_assignee_id != null ? String(full.admin_assignee_id) : '';
  if (
    existing &&
    existing !== '0' &&
    existing !== ARSAL_ID &&
    existing !== ELITE_AI_ID
  ) {
    return existing;
  }
  return '';
}

async function deliverAccountQuestionAnswer(conversationId, text, draft, latestUser, clientName) {
  const line = fixedMessageHandoff.accountQuestionCustomerLine(text, draft);
  if (!line || !String(line).trim()) return false;
  await postClientCommentOnce(conversationId, line, latestUser, clientName);
  return true;
}

/**
 * Shared sequence for welcome, identity recovery, main escalate, pre-send escalate,
 * and missed escalation: successful note, successful assignment, one fixed message.
 * Assignment 500 / timeout / 422 / partial success does not set escalateAwaitingFirstTeammate.
 */
async function commitFixedMessageHandoff(opts) {
  const o = opts || {};
  const conversationId = o.conversationId;
  const full = o.full || {};
  const parts = o.parts || partsOf(full);
  const text = String(o.text || '');
  const stPack = getConvState(conversationId);
  const turnId = String(
    (o.latestUser && (o.latestUser.id || o.latestUser.created_at)) || o.turnId || ''
  );
  const savedHandoff = stPack.state && stPack.state.fixedHandoff;
  const progress = fixedMessageHandoff.progressForTurn(
    savedHandoff,
    turnId,
    o.path
  );
  const reconciledAssignee = fixedMessageHandoff.reconcileFromParts(progress, parts, full, '', ARSAL_ID).assigneeId;
  const owedNow = fixedMessageHandoff.activeOwedFixedLine({
    conversationId,
    botId: ARSAL_ID,
    parts,
    full,
    latestText: text,
    progress,
    ownershipOpts: handoffOwnershipOpts(),
  });
  const handoffAssigneeId = String(
    o.handoffAssigneeId || progress.assigneeId || reconciledAssignee || (owedNow && owedNow.assigneeId) || ''
  );
  let decision =
    o.decision ||
    fixedMessageHandoff.decide({
      path: o.path,
      latestText: text,
      parts,
      full,
      botId: ARSAL_ID,
      conversationId,
      finHandoff: !!o.finHandoff,
      liveAgent: !!o.liveAgent,
      force: o.path !== 'welcome',
      handoffAssigneeId,
      ownershipOpts: handoffOwnershipOpts({ handoffAssigneeId }),
    });
  if (
    owedNow &&
    owedNow.message &&
    !fixedMessageHandoff.isAccountNumberQuestion(text) &&
    decision.action !== 'silence' &&
    !decision.silent
  ) {
    decision = {
      action: 'fixed_message',
      silent: false,
      route: null,
      reason: 'owed_fixed_line',
      message: owedNow.message,
    };
  }
  if (decision.route === 'normal' || decision.action === 'silence' || decision.silent) {
    return Object.assign({ sent: false, setAwaiting: false }, decision);
  }

  const prefer = progress.assigneeId || o.preferAssigneeId || preferredEscalateAssigneeId(full);
  const built = await buildEscalateNoteAndAssignee({
    problem: o.problem != null ? o.problem : text,
    actionNeeded: o.actionNeeded || 'Please take this conversation.',
    account: o.account || '',
    email: o.email || '',
    preferAssigneeId: prefer,
  });
  const assigneeId = progress.assigneeId || o.handoffAssigneeId || o.preferAssigneeId || built.assigneeId;
  const result = await fixedMessageHandoff.commit({
    conversationId,
    decision,
    noteHtml: built.html,
    assigneeId,
    parts,
    botId: ARSAL_ID,
    botIds: [ARSAL_ID, ELITE_AI_ID],
    conversation: full,
    progress,
    requireLiveAssignee: true,
    recheckHold: o.path === 'recovery' || o.recheckHold === true || !!(savedHandoff && (savedHandoff.assignAmbiguous || savedHandoff.noteAmbiguous)),
    transport: o.transport || {
      postNote: (html) => postReply(conversationId, 'note', html),
      assign: async (id) => {
        const assigned = await assignToTeammate(conversationId, id);
        if (!assigned || !assigned.ok) return assigned;
        const fresh = await fetchConversation(conversationId);
        const live = fresh && fresh.admin_assignee_id != null ? String(fresh.admin_assignee_id) : '';
        if (!live) return assigned;
        full.admin_assignee_id = live;
        if (live !== String(id)) {
          writeOpStore.invalidateHandoffAssignment(conversationId, ARSAL_ID, id);
          return {
            ok: false,
            status: assigned.status || 200,
            reason: 'assignee_still_bot',
            data: Object.assign({}, assigned.data || {}, { admin_assignee_id: live }),
          };
        }
        if (assigned.data && typeof assigned.data === 'object' && !Array.isArray(assigned.data)) {
          assigned.data = Object.assign({}, assigned.data, { admin_assignee_id: live });
        }
        return assigned;
      },
      postMessage: async (body) => {
        const fresh = await fetchConversation(conversationId);
        const live = fresh && fresh.admin_assignee_id != null ? String(fresh.admin_assignee_id) : '';
        const bots = new Set([String(ARSAL_ID), String(ELITE_AI_ID), '0', '']);
        if (!fresh || bots.has(live) || (assigneeId && live !== String(assigneeId))) {
          if (live) full.admin_assignee_id = live;
          writeOpStore.invalidateHandoffAssignment(conversationId, ARSAL_ID, assigneeId);
          return { ok: false, status: 409, reason: 'assignee_still_bot', data: { admin_assignee_id: live } };
        }
        full.admin_assignee_id = live;
        const freshParts = partsOf(fresh);
        if (fixedMessageHandoff.fixedLineAlreadyPublic(null, freshParts)) {
          writeOpStore.markOwedFixedLineSent(conversationId, ARSAL_ID);
          return { ok: true, status: 200, data: { id: String(conversationId), type: 'conversation' } };
        }
        return postReply(conversationId, 'comment', body, { owedFixedLine: true });
      },
    },
  });
  stPack.state.fixedHandoff = result.progress;
  if (result.setAwaiting) {
    stPack.state.escalateAwaitingFirstTeammate = true;
    stPack.state.lastEscalateAt = Math.floor(Date.now() / 1000);
    stPack.state.lastEscalateAssigneeId = (result.progress && result.progress.assigneeId) || assigneeId || '';
    stPack.state.escalateTeammateExplainedAt = 0;
    stPack.state.deferredRelatedReply = null;
    const ctx = escalateRelatedOnly.buildEscalateContext({
      problem: o.problem != null ? o.problem : text,
      noteBody: built.problemText || '',
      clientTexts: collectClientMessageTexts(full),
    });
    stPack.state.lastEscalateProblem = ctx.lastEscalateProblem;
    stPack.state.lastEscalateNoteSnippet = ctx.lastEscalateNoteSnippet;
    stPack.state.lastEscalateTopic = ctx.lastEscalateTopic;
    stPack.state.lastEscalateTopics = ctx.lastEscalateTopics;
    console.log('FIXED_HANDOFF sent', o.path, conversationId, stPack.state.lastEscalateAssigneeId);
  } else {
    console.log('FIXED_HANDOFF withheld', result.reason, conversationId);
  }
  saveConvState(stPack.id, stPack.state);
  return result;
}

const handleWebhook = async (req, res) => {
  const topic = (req.body && req.body.topic) || 'none';
  const conversation = req.body && req.body.data && req.body.data.item;
  const conversationId = conversation && conversation.id;
  console.log('IN', topic, conversationId);

  try {
    // Authorized note commands (Arsal/Jerry only) , even when globally paused
    if (topic === 'conversation.admin.noted') {
      if (!conversationId) return res.sendStatus(200);
      const fullNoted = (await fetchConversation(conversationId)) || conversation;
      await processAuthorizedNoteCommands(conversationId, fullNoted);
      return res.sendStatus(200);
    }

    if (control.isPaused()) {
      console.log('SKIP paused');
      return res.sendStatus(200);
    }
    if (topic !== 'conversation.user.created' && topic !== 'conversation.user.replied') {
      return res.sendStatus(200);
    }
    if (!conversationId) return res.sendStatus(200);

    const inflightKey = String(conversationId);
    const inflightAt = clientReplyInflight.get(inflightKey);
    if (inflightAt && Date.now() - inflightAt < 3 * 60 * 1000) {
      console.log('SKIP inflight', conversationId);
      return res.sendStatus(200);
    }
    clientReplyInflight.set(inflightKey, Date.now());

    try {
    const cfg = control.getConfig();
    if (cfg.repliesEnabled === false) {
      console.log('SKIP repliesEnabled=false');
      return res.sendStatus(200);
    }

    let full = (await fetchConversation(conversationId)) || conversation;
    // Auth note commands run only on conversation.admin.noted (avoids note storms on user.replied)
    if (control.isAiOff(conversationId)) {
      console.log('SKIP aiOff', conversationId);
      return res.sendStatus(200);
    }

    const bits = contactBits(full);
    const clientName = bits.name || '';

    if (typeof control.isTestAllowed === 'function' && !control.isTestAllowed(conversationId, clientName)) {
      console.log('SKIP test-mode , not allowlisted', conversationId, clientName);
      return res.sendStatus(200);
    }

    const team = full.team_assignee_id != null ? String(full.team_assignee_id) : '0';
    // Escalations teambox: NEVER client-reply. Optional consolidated teammate note only.
    if (team === ESCALATIONS_TEAM_ID || isEscalationsTeambox(full)) {
      await handleEscalationsSilentNoteOnly(conversationId, full);
      return res.sendStatus(200);
    }
    // Risk Team teambox: NEVER client-reply. Note-only after 15m with no team reply.
    if (team === RISK_TEAM_ID || isRiskTeambox(full)) {
      await handleRiskSilentNoteOnly(conversationId, full);
      return res.sendStatus(200);
    }
    // Jerry-assigned (non-Escalations/Risk): optional long-message summary note; replies continue
    if (isJerryAssigned(full)) {
      await handleJerryOrEscalationsLongMessageNote(conversationId, full);
    }
    if (SKIP_TEAM_IDS.has(team)) {
      console.log('SKIP team inbox', conversationId, team);
      return res.sendStatus(200);
    }

    const parts = partsOf(full);
    const latestUser = findLatestUserPart(parts, full);
    if (!latestUser) {
      console.log('SKIP no user part', conversationId);
      return res.sendStatus(200);
    }
    if (latestUser.__fromSource) {
      console.log('USER_PART_FROM_SOURCE', conversationId);
    }

    /* FIXED_MESSAGE_HANDOFF_R4:ownership_before_hook_a */
    // Ownership runs before Hook A and before every later public path. `text`
    // is declared later, so this uses the latest user body. A human owner, a
    // human assignee, or a human reply suppresses the turn. No account-number
    // answer, identity answer, or other new path posts on that thread.
    {
      const ownText = stripHtml(
        (latestUser && (latestUser.body || latestUser.text || latestUser.message)) || ''
      );
      const stPackOwn = getConvState(conversationId);
      const progOwn = stPackOwn && stPackOwn.state && stPackOwn.state.fixedHandoff;
      const recoveredOwn = fixedMessageHandoff.reconcileFromParts({}, parts, full, '', ARSAL_ID);
      const oweFixedLine =
        fixedMessageHandoff.storesLookLost(progOwn) &&
        fixedMessageHandoff.hasVerifiedNotePart(parts, ARSAL_ID) &&
        fixedMessageHandoff.hasAssignmentPart(parts, ARSAL_ID) &&
        !recoveredOwn.messageSent &&
        !fixedMessageHandoff.fixedLineAlreadyPublic(progOwn, parts);
      const opAssign = writeOpStore.latestHandoffAssignment(conversationId, ARSAL_ID);
      const lost = fixedMessageHandoff.resumeLostHandoff({
        progress: progOwn,
        parts,
        conversation: full,
        botId: ARSAL_ID,
        opRecord: opAssign,
      });
      const owedNow = fixedMessageHandoff.activeOwedFixedLine({
        conversationId,
        botId: ARSAL_ID,
        parts,
        full,
        latestText: ownText,
        progress: progOwn,
        ownershipOpts: handoffOwnershipOpts(),
      });
      const pendingAssignee = String(
        (progOwn && progOwn.noteConfirmed && !progOwn.messageSent && progOwn.assigneeId) || ''
      );
      const handoffAssigneeId = String(
        pendingAssignee ||
          (progOwn && !progOwn.messageSent && progOwn.assigneeId) ||
          lost.handoffAssigneeId ||
          (oweFixedLine ? recoveredOwn.assigneeId : '') ||
          (owedNow && owedNow.assigneeId) ||
          ''
      );
      const pendingHandoff = !!(oweFixedLine || pendingAssignee || lost.handoffAssigneeId || owedNow);
      const stripSeat = lost.handoffAssigneeId || (owedNow && owedNow.assigneeId) || '';
      const ownershipParts = stripSeat
        ? fixedMessageHandoff.partsWithoutOwnAssignment(parts, stripSeat)
        : parts;
      const owned = teammateHandoffGates.classifyOwnership(
        full,
        ownershipParts,
        handoffOwnershipOpts(pendingHandoff ? { handoffAssigneeId } : {})
      );
      if (escalateRelatedOnly.isStatusPing(ownText) && owned.silent && !oweFixedLine) {
        console.log('SKIP status-ping owned', owned.reason, conversationId);
        return res.sendStatus(200);
      }
      const humanCommented = fixedMessageHandoff.humanPublicComment(ownershipParts, handoffOwnershipOpts());
      const foreignOwner = fixedMessageHandoff.foreignHumanOwns(
        full,
        pendingAssignee || lost.handoffAssigneeId || recoveredOwn.assigneeId,
        ARSAL_ID,
        handoffOwnershipOpts(pendingHandoff ? { handoffAssigneeId } : {})
      );
      if (
        (oweFixedLine || lost.resume || owedNow) &&
        !owned.silent &&
        !humanCommented &&
        !foreignOwner &&
        !fixedMessageHandoff.isAccountNumberQuestion(ownText)
      ) {
        const seat = String((owedNow && owedNow.assigneeId) || lost.assigneeId || recoveredOwn.assigneeId || handoffAssigneeId || '');
        const requestText = fixedMessageHandoff.handoffRequestText(parts);
        const completion = owedNow && owedNow.message
          ? {
              action: 'fixed_message',
              silent: false,
              route: null,
              reason: 'owed_fixed_line',
              message: owedNow.message,
            }
          : fixedMessageHandoff.decide({
          path: 'recovery',
          latestText: requestText || ownText,
          parts: (parts || []).filter((p) => {
            const pt = String((p && p.part_type) || '');
            return pt !== 'assignment' && pt !== 'assign';
          }),
          full,
          botId: ARSAL_ID,
          force: true,
          handoffAssigneeId: seat,
          ownershipOpts: handoffOwnershipOpts({ handoffAssigneeId: seat }),
        });
        await commitFixedMessageHandoff({
          path: 'recovery',
          decision: completion,
          conversationId,
          full,
          parts,
          latestUser,
          text: ownText,
          problem: ownText,
          clientName,
          handoffAssigneeId: seat,
          preferAssigneeId: seat,
        });
        console.log('FIXED_HANDOFF lost-state completion', conversationId);
        return res.sendStatus(200);
      }
      if (owned.silent || humanCommented || foreignOwner) {
        console.log('SKIP teammate-handoff', owned.reason || 'human_owned', conversationId);
        return res.sendStatus(200);
      }
    }

        /* escalate-related-only-v1: awaiting RELATED-only gate */
    {
      const stPackEro = (typeof stPack !== 'undefined' && stPack) || getConvState(conversationId);
      const stEro = stPackEro && stPackEro.state;
      if (stEro) {
        /* escalate-related-only-v1: Hook A text TDZ fix */
        // Do NOT read `text` here , let text is declared later (TDZ → WEBHOOK_ERR).
        const eroText =
          (typeof latestUser !== 'undefined' && latestUser && (latestUser.body || latestUser.text || latestUser.message)) ||
          '';
        const eroDec = escalateRelatedOnly.evaluateFromConvState(
          stEro,
          eroText,
          typeof parts !== 'undefined' ? parts : (typeof partsOf === 'function' ? partsOf(full) : []),
          {
            arsalId: typeof ARSAL_ID !== 'undefined' ? ARSAL_ID : '',
            eliteAiId: typeof ELITE_AI_ID !== 'undefined' ? ELITE_AI_ID : '',
            assigneeId: full && full.admin_assignee_id != null ? String(full.admin_assignee_id) : '',
            conversation: full,
          }
        );
        if (eroDec.cleared) {
          stPackEro.state = eroDec.state;
          stPackEro.all[stPackEro.id] = stPackEro.state;
          saveTicketState(stPackEro.all);
          console.log(eroDec.log, conversationId);
        } else if (eroDec.action === 'SKIP') {
          console.log(eroDec.log, conversationId);
          return res.sendStatus(200);
        } else if (eroDec.action === 'STATUS_ONLY') {
          const freshHold = await fetchConversation(conversationId);
          const holdParts = freshHold ? partsOf(freshHold) : parts;
          const stHold = getConvState(conversationId);
          if (fixedMessageHandoff.fixedLineAlreadyPublic(stHold && stHold.state && stHold.state.fixedHandoff, holdParts)) {
            console.log('SKIP status-only fixed line already sent', conversationId);
            return res.sendStatus(200);
          }
          const hold =
            typeof pickEscalateStatusReply === 'function'
              ? pickEscalateStatusReply(conversationId)
              : escalateRelatedOnly.pickEscalateStatusReply(conversationId);
          const holdBody =
            typeof postProcessModelReply === 'function'
              ? postProcessModelReply(hold, conversationId)
              : hold;
          const bitsEro = typeof contactBits === 'function' ? contactBits(full) : null;
          const nameEro = (bitsEro && bitsEro.name) || '';
          await postClientCommentOnce(conversationId, holdBody, latestUser, nameEro);
          console.log(eroDec.log, conversationId);
          return res.sendStatus(200);
        } else if (eroDec.action === 'FALLTHROUGH' && eroDec.reason !== 'not_awaiting') {
          // Unrelated FAQ/other , answer normally; escalateAwaiting flag stays.
          console.log(eroDec.log, conversationId);
        }
      }
    }
    if (
      arsalAlreadyRepliedAfter(parts, latestUser) &&
      !fixedMessageHandoff.isAccountNumberQuestion(stripHtml((latestUser && latestUser.body) || ''))
    ) {
      // Race recovery: we asked for account/email, client already supplied both (possibly
      // across messages / while AI was running), but the ask landed after their message so
      // the normal skip would leave them stuck. Escalate instead of re-asking.
      const recIds = collectEscalateIds(full, {}, '');
      if (isPendingIdentityAsk(parts) && !hasArsalEscalateNote(parts)) {
        let resolvedRec = resolveIdentityAskDecision(full, recIds, 'ACCOUNT');
        let needAccountRec = resolvedRec.needAccount;
        let needEmailRec = resolvedRec.needEmail;
        if (needAccountRec || needEmailRec) {
          // Pending identity ask already public (isPendingIdentityAsk). Wait for the
          // client — never re-send the same ask (parallel-webhook race with
          // IDENTITY_BEFORE_ESCALATE was posting the identical account-number ask twice).
          console.log('IDENTITY_RECOVERY wait pending ask', conversationId, {
            needAccountRec,
            needEmailRec,
            account: recIds.account || null,
            email: recIds.email || null,
            reason: resolvedRec.decision.reason,
          });
          return res.sendStatus(200);
        }
        if (!hasUsableEscalateIdentity(recIds, resolvedRec.declinedAccount, resolvedRec.declinedEmail)) {
          console.log('IDENTITY_RECOVERY block empty identity', conversationId, {
            account: recIds.account || null,
            email: recIds.email || null,
            ready: !!resolvedRec.ready,
            reason: resolvedRec.decision && resolvedRec.decision.reason,
          });
          return res.sendStatus(200);
        }
        // Account alone is enough , do not require email for recovery escalate.
        // HARD BLOCK: never escalate / never send "sent to teammate" with empty or placeholder identity.
        if (!needAccountRec && !needEmailRec && hasUsableEscalateIdentity(recIds, resolvedRec.declinedAccount, resolvedRec.declinedEmail)) {
        console.log('IDENTITY_RECOVERY escalate', conversationId, recIds.account, recIds.email);
        const clientTexts = collectClientMessageTexts(full);
        const problemRec =
          clientTexts.slice(-6).filter(Boolean).join(' | ') ||
          'Client provided account and email after identity ask. Please review.';
        /* FIXED_MESSAGE_HANDOFF_R3:identity_recovery */
        await commitFixedMessageHandoff({
          path: 'identity_recovery',
          conversationId,
          full,
          parts,
          latestUser,
          text: problemRec,
          problem: [problemRec, ...(resolvedRec.noteExtraLines || [])].filter(Boolean).join('\n'),
          account: recIds.account,
          email: recIds.email,
          actionNeeded: 'Please take this conversation.',
        });
        return res.sendStatus(200);
        }
      }
      console.log('SKIP already replied after user part', conversationId);
      return res.sendStatus(200);
    }

    /* LUNA_SPREAD_IMAGE_FIXES_V1:BEGIN:hookA */
    // Hook A runs before text is initialised and must never reference it.
    try { __imageAskGuard.hookA(conversationId); } catch (__e) { console.error('[imageAskGuard.hookA] guard hook failed', __e && __e.message); }
    /* LUNA_SPREAD_IMAGE_FIXES_V1:END:hookA */
    let text = stripHtml(latestUser.body || '');
    let __originalDraft = '';
    const repeatedClientQuestion = isRepeatedClientQuestion(text, collectClientMessageTexts(full).slice(0, -1));
    /* LUNA_SPREAD_IMAGE_FIXES_V1:BEGIN:hookB */
    try { __imageAskGuard.hookB(conversationId, text); } catch (__e) { console.error('[imageAskGuard.hookB] guard hook failed', __e && __e.message); }
    /* LUNA_SPREAD_IMAGE_FIXES_V1:END:hookB */
    /* LUNA_STATE_PRESEND_V1:BEGIN:hookT */
    try { __statePresend.noteInbound(conversationId, text, latestUser); } catch (__e) { console.error('[statePresend.hookT] failed', __e && __e.message); }
    /* LUNA_STATE_PRESEND_V1:END:hookT */
    const imageAtts = collectImageAttachments(latestUser);
    if (!text && !imageAtts.length) {
      console.log('SKIP empty user text', conversationId);
      return res.sendStatus(200);
    }
    if (!text && imageAtts.length) {
      text = '(Client sent an image/screenshot with no accompanying text.)';
    }

    if (escalateRelatedOnly.isStatusPing(text)) {
      const __stPing = getConvState(conversationId);
      if (!fixedMessageHandoff.hasPendingHandoffCase(__stPing && __stPing.state)) {
        console.log('STATUS_PING clarify no pending case', conversationId);
        await postClientCommentOnce(conversationId, fixedMessageHandoff.STATUS_PING_CLARIFY, latestUser, clientName);
        return res.sendStatus(200);
      }
    }

    if (assistantIdentityGuard.isDirectIdentityQuestion(text)) {
      await postClientCommentOnce(conversationId, assistantIdentityGuard.disclosureFor(text), latestUser, clientName);
      console.log('ASSISTANT_IDENTITY answer', conversationId);
      return res.sendStatus(200);
    }
    if (
      fixedMessageHandoff.isAccountNumberQuestion(text) &&
      (topic === 'conversation.user.created' ||
        (topic === 'conversation.user.replied' &&
          conversationAgeSec(full) >= 0 &&
          conversationAgeSec(full) < FIN_FRESH_CONV_SEC))
    ) {
      await deliverAccountQuestionAnswer(conversationId, text, '', latestUser, clientName);
      console.log('FIXED_HANDOFF fresh account-question', conversationId, topic);
      return res.sendStatus(200);
    }

    let accountQuestionAnswered = false;
    {
      const stPackH = getConvState(conversationId);
      const prog = stPackH.state && stPackH.state.fixedHandoff;
      if (
        prog &&
        !prog.messageSent &&
        (prog.noteConfirmed || prog.noteAmbiguous || prog.assignAmbiguous || prog.phase === 'assignment-pending')
      ) {
        /* FIXED_MESSAGE_HANDOFF_R3:recovery */
        if (fixedMessageHandoff.isAccountNumberQuestion(text)) {
          console.log('FIXED_HANDOFF recovery account-question exemption', conversationId, {
            failure422: prog.assignConfirmed !== true,
            failure500: prog.assignAmbiguous === true,
          });
          await deliverAccountQuestionAnswer(conversationId, text, '', latestUser, clientName);
          accountQuestionAnswered = true;
        } else {
          await commitFixedMessageHandoff({
            path: 'recovery',
            conversationId,
            full,
            parts,
            text,
            problem: text,
            clientName,
            latestUser,
            actionNeeded: 'Please take this conversation.',
            preferAssigneeId: prog.assigneeId || '',
          });
          console.log('FIXED_HANDOFF recovery', conversationId);
          return res.sendStatus(200);
        }
      }
    }
    if (accountQuestionAnswered) return res.sendStatus(200);

    // Fin / Elite AI wait , hard gate before FAQ/AI/deterministic public replies
    if (shouldWaitForFin(full, text, topic)) {
      return res.sendStatus(200);
    }


    /* MICHAN_TEAMMATE_HANDOFF_V1:BEGIN:deferGate */
    {
      const handoffOpts = handoffOwnershipOpts();
      const defer = teammateHandoffGates.shouldDeferToHumanTeammate(full, parts, text, handoffOpts);
      if (defer.skip) {
        console.log('SKIP teammate-handoff', defer.reason, conversationId);
        return res.sendStatus(200);
      }
    }
    /* MICHAN_TEAMMATE_HANDOFF_V1:END:deferGate */

    // After Fin handoff / live-agent ask: note, then assignment, then one fixed message.
    // Account-number questions fall through to the normal answer / escalation path.
    /* FIXED_MESSAGE_HANDOFF_R3:welcome */
    {
      const welcomeDecision = fixedMessageHandoff.decide({
        path: 'welcome',
        latestText: text,
        parts,
        full,
        botId: ARSAL_ID,
        finHandoff: finHandoffInHistory(parts),
        liveAgent: clientRequestedLiveAgent(text) || clientRequestedLiveAgentAfterLastElite(parts),
        ownershipOpts: handoffOwnershipOpts(),
      });
      if (welcomeDecision.action === 'silence') {
        console.log('FIN_HANDOFF_WELCOME silence', welcomeDecision.reason, conversationId);
        return res.sendStatus(200);
      }
      if (welcomeDecision.action === 'fixed_message') {
        await commitFixedMessageHandoff({
          path: 'welcome',
          decision: welcomeDecision,
          conversationId,
          full,
          parts,
          text,
          problem: text,
          clientName,
          latestUser,
          actionNeeded: 'Please take this conversation.',
        });
        console.log('FIN_HANDOFF_WELCOME', conversationId);
        return res.sendStatus(200);
      }
      if (welcomeDecision.reason === 'account_number_question') {
        console.log('FIN_HANDOFF_WELCOME route account-number', conversationId);
        await deliverAccountQuestionAnswer(conversationId, text, '', latestUser, clientName);
        return res.sendStatus(200);
      }
    }

    // Welcome KB asks use the same article ranking as the later FAQ retrieval.
    // The number hedge stays for a model figure the article does not contain.
    {
      const approvedFaqBody = fixedMessageHandoff.approvedFaqCustomerBody(text);
      if (approvedFaqBody) {
        console.log('WELCOME_FAQ kb answer', conversationId);
        await postClientCommentOnce(conversationId, approvedFaqBody, latestUser, clientName);
        return res.sendStatus(200);
      }
      const challengeClarifier = fixedMessageHandoff.ambiguousChallengeClarifier(text);
      if (challengeClarifier) {
        console.log('WELCOME_FAQ clarifier', conversationId);
        await postClientCommentOnce(conversationId, challengeClarifier, latestUser, clientName);
        return res.sendStatus(200);
      }
      const uniqueFaqBody = fixedMessageHandoff.uniqueRankedFaqArticle(text);
      if (uniqueFaqBody) {
        console.log('WELCOME_FAQ kb answer', conversationId);
        await postClientCommentOnce(conversationId, uniqueFaqBody, latestUser, clientName);
        return res.sendStatus(200);
      }
    }

    // Behavior locks v2: spread test account (direct reply, no escalate)
    if (isSpreadCheckAsk(text)) {
      await postClientCommentOnce(conversationId, postProcessModelReply(SPREAD_TEST_REPLY, conversationId), latestUser, clientName);
      console.log('SPREAD_TEST_REPLY', conversationId);
      return res.sendStatus(200);
    }

    // Review/verification notification PROCESS ask , direct reply, never escalate (Arsal lock)
    if (isReviewNotificationProcessAsk(text)) {
      const body = postProcessModelReply(pickReviewStatusDirectReply(), conversationId);
      await postClientCommentOnce(conversationId, body, latestUser, clientName);
      console.log('REVIEW_STATUS_DIRECT', conversationId);
      return res.sendStatus(200);
    }

    // September 2026 promotions: keep deterministic facts, but let the normal AI reply
    // path express them naturally in the client's context. Sending the SOT string here
    // verbatim made every broad discount question receive the same canned sentence.
    {
      const promoResolved = resolvePromoReply(text, full);
      if (promoResolved && promoResolved.reply) {
        console.log(
          'PROMO_CONTEXTUAL_AI',
          conversationId,
          promoResolved.product || '',
          'hist',
          promoResolved.historyLen || 0
        );
      }
    }

    // Sync escalate teammate-first state
    let escState = syncEscalateTeammateFirstState(conversationId, full);
    const relatedToOpenEsc =
      hasOpenEscalation(escState) &&
      !isGeneralPolicyQuestion(text) &&
      !isSpreadCheckAsk(text) &&
      !isReviewNotificationProcessAsk(text) &&
      !escalateRelatedOnly.isClearKbFaqAsk(text) &&
      escalateRelatedOnly.isRelatedToEscalatedProblem(text, escState);

    /* escalate-related-only-v1: legacy awaiting blanket neutralized */
    // Hook A (early RELATED-only gate) already handled awaiting; do not re-hold here.
    // relatedToOpenEsc is now true only for truly related follow-ups (see above).
    if (relatedToOpenEsc && escState.escalateAwaitingFirstTeammate) {
      const eroLate = escalateRelatedOnly.decideEscalateAwaitingGate({
        awaitingFirstTeammate: true,
        userText: text,
        lastEscalateProblem: escState.lastEscalateProblem,
        lastEscalateNoteSnippet: escState.lastEscalateNoteSnippet,
        lastEscalateTopic: escState.lastEscalateTopic,
        lastEscalateTopics: escState.lastEscalateTopics,
      });
      if (eroLate.action === 'SKIP') {
        console.log(eroLate.log || 'ESCALATE related-only SKIP (late)', conversationId);
        return res.sendStatus(200);
      }
      if (eroLate.action === 'STATUS_ONLY') {
        await postEscalateHoldingStatus(
          conversationId,
          text,
          latestUser,
          clientName,
          escState,
          eroLate.log || 'ESCALATE status-only (awaiting teammate first)'
        );
        return res.sendStatus(200);
      }
      console.log(eroLate.log || 'ESCALATE related-only FALLTHROUGH (late)', conversationId);
    }

    // After teammate first explanation: related follow-up → 10-minute defer for teammate
    if (
      relatedToOpenEsc &&
      !escState.escalateAwaitingFirstTeammate &&
      escState.escalateTeammateExplainedAt
    ) {
      const userAt = Number(latestUser.created_at || 0) || Math.floor(Date.now() / 1000);
      const partsNow = partsOf(full);
      let teammateAfterUser = false;
      for (const part of partsNow) {
        if (!isHumanTeammatePublicReply(part)) continue;
        if (Number(part.created_at || 0) > userAt) {
          teammateAfterUser = true;
          break;
        }
      }
      if (!teammateAfterUser) {
        const age = Math.floor(Date.now() / 1000) - userAt;
        const allowUntil = Number(escState.allowBotRelatedAnswerUntil || 0);
        if (allowUntil && Math.floor(Date.now() / 1000) < allowUntil) {
          console.log('ESCALATE allow bot related (defer matured)', conversationId);
          // fall through to AI
        } else if (age < 10 * 60) {
          const stPack = getConvState(conversationId);
          stPack.state.deferredRelatedReply = {
            partId: String(latestUser.id || latestUser.created_at || userAt),
            at: userAt,
            text: text.slice(0, 2000),
          };
          stPack.all[stPack.id] = stPack.state;
          saveTicketState(stPack.all);
          console.log('ESCALATE defer related 10m', conversationId, 'age', age);
          return res.sendStatus(200);
        }
        // age >= 10m: fall through to normal AI answer
        console.log('ESCALATE defer elapsed , bot may answer related', conversationId);
      }
    }

    // Simple FAQ slice (retrieval layer) , optional
    let officialFaqBlock = '';
    let __presendKnowledge = null;
    const promoOnly = !!(
      resolvePromoReply(text, full) &&
      !isClearlyAccountSpecificIssue(text)
    );
    if (!promoOnly && faqKb && typeof faqKb.retrieveOfficialFaqContext === 'function') {
      try {
        const hit = await faqKb.retrieveOfficialFaqContext(text);
        if (hit && hit.block) {
          officialFaqBlock = '\n\nOFFICIAL FAQ CONTEXT:\n' + hit.block + '\n';
          // Same evidence the model was given is handed to the presend gate, so factual
          // checks audit against approved sources instead of always receiving null.
          __presendKnowledge = [{ title: 'Official FAQ', text: hit.block, score: 0.72, source: hit.from || 'faq-kb' }];
          console.log('FAQ_RETRIEVE', conversationId, hit.count || 0);
        }
      } catch (e) {
        console.error('FAQ_RETRIEVE_FAIL', e && e.message);
      }
    }

    const history = fixedMessageHandoff.redactCredentials(buildHistory(full, 50));
    const latestForPrompt = fixedMessageHandoff.redactCredentials(text);
    let userMsg =
      'Client name: ' +
      (bits.name || '') +
      '\nClient email: ' +
      (bits.email || '') +
      '\nConversation id: ' +
      conversationId +
      '\n\nFULL TICKET HISTORY:\n' +
      history +
      '\n\nLatest client message:\n' +
      latestForPrompt +
      officialFaqBlock;
    if (septemberPromos && !isClearlyAccountSpecificIssue(text)) {
      try {
        const promoResolved = resolvePromoReply(text, full);
        if (promoResolved && promoResolved.reply) {
          userMsg +=
            '\n\nHARD SEPTEMBER 2026 PROMOTION FACT (authoritative factual payload, not client-facing copy; do not invent %, codes, eligibility, bulk, or activation-fee claims beyond this):\n' +
            promoResolved.reply +
            '\nUse these facts, but write the answer yourself in natural language matched to the client and conversation. Never paste the factual payload verbatim or use a compressed parenthetical list of every code. Answer what was asked, briefly explain the relevant option(s), and ask only one useful challenge/eligibility question when needed. If the client repeated the question, acknowledge that and explain it from a different angle instead of repeating the prior wording. Do NOT ask for account number or email. Do NOT escalate a general promo FAQ. Preserve promo topic across short follow-ups; Free Retry+Lite same SEP35 , do not ask which; bulk = natural wording, auto-increase, final % at checkout , never canned 1=35%/2=40% script.';
          console.log('PROMO_INJECT', conversationId, promoResolved.product || '');
        }
      } catch (e) {
        console.error('PROMO_INJECT_FAIL', e && e.message);
      }
    }
    if (imageAtts.length) {
      userMsg +=
        '\n\nIMAGE NOTE: ' +
        imageAtts.length +
        ' image(s) attached to the latest client message. Read them carefully. If unclear/uncertain, ESCALATE , do not guess.';
    }
    if (isShortClientAck(text)) {
      /* MICHAN_TEAMMATE_HANDOFF_V1: short-ack after teammate must not You're-welcome / restart */
      if (
        teammateHandoffGates.humanTeammateAlreadyRepliedPublic(parts, {
          arsalId: ARSAL_ID,
          eliteAiId: ELITE_AI_ID,
        })
      ) {
        console.log('SKIP short-ack after teammate (no youre-welcome)', conversationId);
        return res.sendStatus(200);
      }
      userMsg +=
        '\n\nHARD OVERRIDE , SHORT CLIENT ACK: The client only acknowledged your last message (sure/okay/thanks/got it/will do). Reply with a brief warm acknowledgment only (e.g. You\'re welcome, [Name]!). Do NOT repeat any instruction, reminder, or next-step you already gave. That point is closed unless they ask a new question.';
      console.log('SHORT_ACK_OVERRIDE', conversationId);
    }
    if (repeatedClientQuestion) {
      userMsg += '\n\nREPEATED CLIENT QUESTION: The client still needs the answer. Briefly acknowledge that, then explain the same verified answer more clearly in fresh wording or from another angle. Preserve every fact, number, eligibility condition, and policy. Do not paste the previous reply or change the answer for variety.';
    }
    userMsg += '\n\nRespond with ACTION format only. Do not invent or use a personal support-agent identity. Mention being an AI assistant ONLY if the client directly asks whether you are an AI, a bot, or a human. Do NOT say you are an AI for personal questions (wife, father, mother, family, age, etc.). For those, briefly decline without an AI disclosure and redirect to FundedElite support.';

    const userContent = imageAtts.length
      ? await buildVisionUserContent(userMsg, imageAtts)
      : userMsg;
    if (imageAtts.length) {
      const imgParts = Array.isArray(userContent) ? userContent.filter((c) => c && c.type === 'image_url').length : 0;
      console.log('IMAGE_IN', conversationId, 'atts', imageAtts.length, 'loaded', imgParts);
      /* LUNA_SPREAD_IMAGE_FIXES_V1:BEGIN:hookC */
      try { __imageAskGuard.hookC(conversationId, imgParts, imageAtts.length); } catch (__e) { console.error('[imageAskGuard.hookC] guard hook failed', __e && __e.message); }
      /* LUNA_SPREAD_IMAGE_FIXES_V1:END:hookC */
      if (!imgParts) {
        console.log('IMAGE_LOAD_NONE , escalate path preferred if model unsure', conversationId);
      }
    }

    if (fixedMessageHandoff.isHumanAgentRequest(text)) {
      await commitFixedMessageHandoff({
        path: 'welcome',
        conversationId,
        full,
        parts,
        latestUser,
        text,
        problem: text,
        clientName,
        liveAgent: true,
        actionNeeded: 'Please take this conversation.',
      });
      console.log('FIXED_HANDOFF human request before model', conversationId);
      return res.sendStatus(200);
    }

    /* LUNA_TOOLS_V1:BEGIN:runChat */
    const __lunaChat = await lunaToolsRuntime.runChat({
      openai,
      control,
      __statePresend,
      conversationId,
      parts,
      latestUser,
      text,
      imageAtts,
      userContent,
      faqKb,
      imageAskGuard: __imageAskGuard,
      getEscalateState: (cid) => getConvState(cid).state,
    });
    const rawOut = __lunaChat.rawOut;
    /* LUNA_TOOLS_V1:END:runChat */
    const parsed = parseAction(rawOut);
    __originalDraft = String((parsed && parsed.body) || '');
    console.log('AI_ACTION', conversationId, parsed.action, parsed.kind || '');

    // Client asked for human/manager: do not keep REPLY-ing. Escalate (fail closed).
    // Vague first Fin→Arsal takeover already returned via FIN_HANDOFF_WELCOME above.
    if (
      parsed.action === 'REPLY' &&
      clientWantsHumanTeammate(text) &&
      (arsalHasPublicClientReply(parts) || !isVagueOrLiveAgentOnlyAsk(text))
    ) {
      parsed.action = 'ESCALATE';
      if (!parsed.kind) parsed.kind = 'ACCOUNT';
      if (!parsed.problem) parsed.problem = text;
      if (!parsed.actionNeeded) {
        parsed.actionNeeded = 'Client requested a human teammate / manager / live agent. Please take over.';
      }
      console.log('FORCE_ESCALATE client_wants_human', conversationId);
    }

    if (parsed.action === 'SKIP') {
      const skipBody = String(parsed.body || '');
      // Out-of-scope must be a client-facing decline, not silence.
      if (/scope|unrelated|off[ -]?topic|outside|not fundedelit/i.test(skipBody)) {
        parsed.action = 'REPLY';
        parsed.body = '[[SCOPE_DECLINE]]';
        console.log('SKIP->REPLY scope_decline', conversationId);
      } else {
        console.log('SKIP model', conversationId, parsed.body);
        return res.sendStatus(200);
      }
    }

    if (parsed.action === 'CLOSE') {
      await closeConversation(conversationId);
      console.log('CLOSED', conversationId);
      return res.sendStatus(200);
    }

    if (parsed.action === 'ESCALATE') {
      if (
        assistantIdentityGuard.isAssistantPersonalQuestion(text) &&
        !/\b(?:fundedelite|account|payout|challenge|login|kyc)\b/i.test(String(text || ''))
      ) {
        console.log('ESCALATE blocked personal-question', conversationId);
        const personalBody = assistantIdentityGuard.enforceAssistantIdentityReply(
          text,
          parsed.body || '',
          conversationId,
          []
        );
        await postClientCommentOnce(conversationId, personalBody, latestUser, clientName);
        return res.sendStatus(200);
      }
      /* MICHAN_TEAMMATE_HANDOFF_V1:BEGIN:escalateBlock */
      {
        const escBlock = teammateHandoffGates.shouldBlockEscalateForTeammateHandoff(parts, full, {
          arsalId: ARSAL_ID,
          eliteAiId: ELITE_AI_ID,
          jerryId: JERRY_ID,
          hasArsalEscalateNote,
        });
        if (escBlock.block) {
          console.log('SKIP escalate teammate-handoff', escBlock.reason, conversationId);
          return res.sendStatus(200);
        }
      }
      /* MICHAN_TEAMMATE_HANDOFF_V1:END:escalateBlock */
      escState = syncEscalateTeammateFirstState(conversationId, full);
      if (escState.escalateAwaitingFirstTeammate) {
        const awaitingAttempt = evaluateAwaitingEscalationAttempt(conversationId, text, escState);
        escState = awaitingAttempt.state;
        if (awaitingAttempt.decision.action === 'SKIP') {
          console.log(awaitingAttempt.decision.log, conversationId);
          return res.sendStatus(200);
        }
        if (awaitingAttempt.decision.action === 'STATUS_ONLY') {
          await postEscalateHoldingStatus(
            conversationId,
            text,
            latestUser,
            clientName,
            escState,
            'ESCALATE blocked duplicate , awaiting teammate first'
          );
          return res.sendStatus(200);
        }
      }
      let kind = String(parsed.kind || 'ACCOUNT').toUpperCase();
      // Never treat a KB/policy question as ACCOUNT just because the model said ESCALATE
      if (isGeneralPolicyQuestion(text) && !isClearlyAccountSpecificIssue(text)) {
        kind = 'FAQ_CONFIRM';
        parsed.kind = 'FAQ_CONFIRM';
      }

      // If FAQ context is already retrieved for a general/policy ask, answer instead of gating
      if (
        (kind === 'FAQ_CONFIRM' || isGeneralPolicyQuestion(text)) &&
        !isClearlyAccountSpecificIssue(text) &&
        officialFaqBlock
      ) {
        try {
          const force = await openai.chat.completions.create({
            model: control.getModel(),
            messages: [
              { role: 'system', content: control.getPrompt() },
              {
                role: 'user',
                content:
                  userMsg +
                  '\n\nHARD OVERRIDE: This is a general KB/policy question. You MUST reply with ACTION: REPLY only. Answer from OFFICIAL FAQ CONTEXT. Do NOT escalate. Do NOT ask for account number or email. Do NOT say you will pass this to the team.',
              },
            ],
          });
          const forcedRaw = (((force.choices[0] || {}).message || {}).content) || '';
          const forced = parseAction(forcedRaw);
          if (forced.action === 'REPLY' && forced.body) {
            parsed.action = 'REPLY';
            parsed.body = forced.body;
            console.log('ESCALATE->REPLY general+FAQ', conversationId);
          }
        } catch (e) {
          console.error('ESCALATE->REPLY force fail', e && e.message);
        }
      }

      if (parsed.action === 'ESCALATE' && septemberPromos && !isClearlyAccountSpecificIssue(text)) {
        const promoResolved = resolvePromoReply(text, full);
        if (promoResolved && promoResolved.reply) {
          parsed.action = 'REPLY';
          parsed.body = promoResolved.reply;
          console.log('ESCALATE->REPLY promo-sot', conversationId, promoResolved.product || '');
        }
      }
      if (parsed.action === 'ESCALATE' && isReviewNotificationProcessAsk(text)) {
        parsed.action = 'REPLY';
        parsed.body = pickReviewStatusDirectReply();
        console.log('ESCALATE->REPLY review-status-direct', conversationId);
      }

      if (
        (fixedMessageHandoff.isSpreadTemplateDraft(__originalDraft) || fixedMessageHandoff.isSpreadTemplateDraft(parsed.body || '')) &&
        !isSpreadCheckAsk(text) &&
        !fixedMessageHandoff.isAccountNumberQuestion(text)
      ) {
        console.log('SPREAD_TEMPLATE not a handoff', conversationId);
        if (fixedMessageHandoff.isPureLiveAgentAsk(text) || clientWantsHumanTeammate(text)) {
          await commitFixedMessageHandoff({
            path: 'main_escalate',
            conversationId,
            full,
            parts,
            latestUser,
            text,
            problem: text,
            liveAgent: true,
            actionNeeded: 'Please take this conversation.',
          });
        } else {
          await postClientCommentOnce(conversationId, UNSUPPORTED_NUMBER_HEDGE, latestUser, clientName);
        }
        return res.sendStatus(200);
      }

      if (parsed.action === 'ESCALATE') {
      if (fixedMessageHandoff.isAccountNumberQuestion(text)) {
        console.log('FIXED_HANDOFF main_escalate account-question exemption', conversationId);
        await deliverAccountQuestionAnswer(conversationId, text, parsed.body || '', latestUser, clientName);
        return res.sendStatus(200);
      }
      if (fixedMessageHandoff.isPureLiveAgentAsk(text)) {
        await commitFixedMessageHandoff({
          path: 'main_escalate',
          conversationId,
          full,
          parts,
          latestUser,
          text,
          problem: text,
          liveAgent: true,
          actionNeeded: parsed.actionNeeded || 'Please take this conversation.',
        });
        console.log('FIXED_HANDOFF live-agent without account ask', conversationId);
        return res.sendStatus(200);
      }
      const mustGateIdentity =
        kind === 'ACCOUNT' ||
        kind === 'EMAIL_REQUIRED' ||
        isClearlyAccountSpecificIssue(text);
      if (mustGateIdentity) {
        const identityGate = await ensureIdentityBeforeAccountEscalate({
          conversationId,
          full,
          bits,
          text,
          kind: kind === 'EMAIL_REQUIRED' ? 'EMAIL_REQUIRED' : 'ACCOUNT',
          latestUser,
          clientName,
          modelBody: parsed.body,
          modelClient: parsed.client,
        });
        full = identityGate.full || full;
        if (!identityGate.ready) return res.sendStatus(200);
      }
      let ids = collectEscalateIds(full, bits, (parsed.body || '') + '\n' + (parsed.client || ''));
      // FAQ_CONFIRM / general policy: NEVER ask account/email ("before I pass this to the team...")
      const skipIdentityGate =
        kind === 'FAQ_CONFIRM' ||
        (isGeneralPolicyQuestion(text) && !isClearlyAccountSpecificIssue(text));
      let resolvedId = resolveIdentityAskDecision(full, ids, kind);
      let needAccount = resolvedId.needAccount;
      let needEmail = resolvedId.needEmail;
      if (resolvedId.declinedAccount) {
        console.log('ESCALATE no-account , skip account ask', conversationId);
      }
      if (resolvedId.declinedEmail) {
        console.log('ESCALATE no-email , skip email ask', conversationId);
      }
      if (!skipIdentityGate && (needAccount || needEmail)) {
        // Re-fetch: client may have sent the other field while the model was running
        try {
          const freshGate = await fetchConversation(conversationId);
          if (freshGate) {
            full = freshGate;
            ids = collectEscalateIds(freshGate, bits, (parsed.body || '') + '\n' + (parsed.client || ''));
            resolvedId = resolveIdentityAskDecision(full, ids, kind);
            needAccount = resolvedId.needAccount;
            needEmail = resolvedId.needEmail;
          }
        } catch (e) {
          console.error('identity re-fetch fail', e && e.message);
        }
      }
      if (!skipIdentityGate && (needAccount || needEmail)) {
        // Hard no-reask: only ask for genuinely missing fields (account preferred; account alone enough).
        const ask = pickAccountEmailAsk(needAccount, needEmail);
        const pre = preSendIdentityCheck(full, ask);
        if (!pre.ok) {
          if (pre.asks && pre.asks.account && pre.known && pre.known.account) {
            needAccount = false;
            ids.account = pre.known.account;
          }
          if (pre.asks && pre.asks.email && pre.known && pre.known.email) {
            needEmail = false;
            ids.email = pre.known.email;
          }
          resolvedId = resolveIdentityAskDecision(full, ids, kind);
          needAccount = resolvedId.needAccount;
          needEmail = resolvedId.needEmail;
          console.log('ESCALATE preSend blocked identity ask', conversationId, pre.reason, {
            needAccount,
            needEmail,
            decision: resolvedId.decision.reason,
          });
          if (needAccount || needEmail) {
            const ask2 = pickAccountEmailAsk(needAccount, needEmail);
            const pre2 = preSendIdentityCheck(full, ask2);
            if (pre2.ok) {
              await postClientCommentOnce(conversationId, ask2, latestUser, clientName);
              console.log('ESCALATE gated , asked missing only', conversationId, { needAccount, needEmail, kind });
              return res.sendStatus(200);
            }
            console.log('ESCALATE preSend , falling through with known ids', conversationId);
          }
        } else {
          await postClientCommentOnce(conversationId, ask, latestUser, clientName);
          console.log('ESCALATE gated , asked account/email', conversationId, {
            needAccount,
            needEmail,
            kind,
            decision: resolvedId.decision.reason,
          });
          return res.sendStatus(200);
        }
      }
      if (skipIdentityGate && (needAccount || needEmail)) {
        console.log('ESCALATE FAQ_CONFIRM , identity gate skipped', conversationId, { kind });
      }

      const problemWithExtras = [parsed.body || text, ...(resolvedId.noteExtraLines || [])]
        .filter(Boolean)
        .join('\n');
      /* FIXED_MESSAGE_HANDOFF_R3:main_escalate */
      await commitFixedMessageHandoff({
        path: 'main_escalate',
        conversationId,
        full,
        parts,
        latestUser,
        text,
        problem: problemWithExtras,
        account: ids.account,
        email: ids.email,
        actionNeeded: parsed.actionNeeded || 'Please take this conversation.',
      });
      return res.sendStatus(200);
      } // end remaining ESCALATE after possible ESCALATE->REPLY conversion
    }

    // REPLY
    const __isScopeDecline = String(parsed.body || '').trim() === '[[SCOPE_DECLINE]]';
    let body = postProcessModelReply(parsed.body || '', conversationId);
    if (fixedMessageHandoff.isSpreadTemplateDraft(__originalDraft || body) && !isSpreadCheckAsk(text)) {
      if (fixedMessageHandoff.isAccountNumberQuestion(text)) {
        body = fixedMessageHandoff.accountQuestionCustomerLine(text, '');
      } else if (fixedMessageHandoff.isPureLiveAgentAsk(text) || clientWantsHumanTeammate(text)) {
        await commitFixedMessageHandoff({
          path: 'main_escalate',
          conversationId,
          full,
          parts,
          latestUser,
          text,
          problem: text,
          liveAgent: true,
          actionNeeded: 'Please take this conversation.',
        });
        return res.sendStatus(200);
      } else {
        console.log('SPREAD_TEMPLATE hedge terminal', conversationId);
        await postClientCommentOnce(conversationId, UNSUPPORTED_NUMBER_HEDGE, latestUser, clientName);
        return res.sendStatus(200);
      }
    }
    if (fixedMessageHandoff.isPasswordPolicyQuestion(text) && (!String(body || '').trim() || fixedMessageHandoff.isTerminalHedge(body))) {
      const policyLine = fixedMessageHandoff.passwordPolicyPublicLine(text, __originalDraft || body);
      console.log('PASSWORD_POLICY clarifier', conversationId);
      await postClientCommentOnce(conversationId, policyLine, latestUser, clientName);
      return res.sendStatus(200);
    }
    if (fixedMessageHandoff.isTerminalHedge(body)) {
      const approvedFaqBody = fixedMessageHandoff.approvedFaqCustomerBody(text);
      console.log(approvedFaqBody ? 'WELCOME_FAQ kb answer' : 'HEDGE terminal', conversationId);
      await postClientCommentOnce(conversationId, approvedFaqBody || UNSUPPORTED_NUMBER_HEDGE, latestUser, clientName);
      return res.sendStatus(200);
    }
    if (!body) {
      const __plainFaq =
        typeof escalateRelatedOnly.isClearKbFaqAsk === 'function' &&
        escalateRelatedOnly.isClearKbFaqAsk(text) &&
        !isClearlyAccountSpecificIssue(text) &&
        !fixedMessageHandoff.isPureLiveAgentAsk(text);
      if (__plainFaq) {
        console.log('EMPTY faq body answer', conversationId);
        await postClientCommentOnce(conversationId, fixedMessageHandoff.plainFaqCustomerLine(text), latestUser, clientName);
        return res.sendStatus(200);
      }
      if (
        ((typeof escalateRelatedOnly.isClearKbFaqAsk === 'function' && escalateRelatedOnly.isClearKbFaqAsk(text)) ||
          (typeof isGeneralPolicyQuestion === 'function' && isGeneralPolicyQuestion(text))) &&
        !__plainFaq
      ) {
        console.log('EMPTY faq body escalate', conversationId);
        await commitFixedMessageHandoff({
          path: 'main_escalate',
          conversationId,
          full,
          parts,
          latestUser,
          text,
          problem: text,
          actionNeeded: 'Please take this conversation.',
        });
        return res.sendStatus(200);
      }
      if (isClearlyAccountSpecificIssue(text) && !fixedMessageHandoff.isAccountNumberQuestion(text)) {
        console.log('EMPTY escalation body presend_escalate', conversationId);
        await commitFixedMessageHandoff({
          path: 'presend_escalate',
          conversationId,
          full,
          parts,
          latestUser,
          text,
          problem: text,
          actionNeeded: 'Please take this conversation.',
        });
        return res.sendStatus(200);
      }
      const emptyClarifier = fixedMessageHandoff.ambiguousChallengeClarifier(text);
      if (emptyClarifier) {
        console.log('WELCOME_FAQ clarifier', conversationId);
        await postClientCommentOnce(conversationId, emptyClarifier, latestUser, clientName);
        return res.sendStatus(200);
      }
      const emptyFaq = fixedMessageHandoff.uniqueRankedFaqArticle(text);
      if (emptyFaq) {
        console.log('WELCOME_FAQ kb answer', conversationId);
        await postClientCommentOnce(conversationId, emptyFaq, latestUser, clientName);
        return res.sendStatus(200);
      }
      console.log('SKIP empty reply body', conversationId);
      return res.sendStatus(200);
    }

    /* AUDIT_HARDEN_V1:stripKnownAccountAsk */
    {
      const __knownIds = collectEscalateIds(full, bits, '');
      if (__knownIds && __knownIds.account) {
        const __before = body;
        body = body.replace(
          /(?:^|[.\n])[^.\n]*(?:please\s+share|can\s+you\s+send|before\s+i\s+pass)[^.\n]*(?:account\s*number|account\s*#|registered\s+email)[^.\n]*[.!?]?/gi,
          (m) => (m.startsWith('.') || m.startsWith('\n') ? m[0] : '')
        );
        body = body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        if (body !== __before) {
          console.log('STRIP known-account re-ask from model reply', conversationId, __knownIds.account);
        }
        if (!body) {
          console.log('EMPTY known-account re-ask', conversationId);
          if (fixedMessageHandoff.isAccountNumberQuestion(text)) {
            await deliverAccountQuestionAnswer(conversationId, text, '', latestUser, clientName);
            return res.sendStatus(200);
          }
          if (assistantIdentityGuard.isDirectIdentityQuestion(text)) {
            await postClientCommentOnce(conversationId, assistantIdentityGuard.disclosureFor(text), latestUser, clientName);
            return res.sendStatus(200);
          }
          await commitFixedMessageHandoff({
            path: 'presend_escalate',
            conversationId,
            full,
            parts,
            latestUser,
            text,
            problem: text,
            account: __knownIds.account || '',
            email: __knownIds.email || '',
            liveAgent: fixedMessageHandoff.isPureLiveAgentAsk(text),
            actionNeeded: 'Please take this conversation.',
          });
          return res.sendStatus(200);
        }
      }
    }
    // Pre-send identity recall: never send a draft that re-asks account/email already in history.
    // Higher priority than generic escalate/ask scripts.
    {
      const preReply = preSendIdentityCheck(full, body);
      if (!preReply.ok) {
        console.log('REPLY preSend blocked re-ask', conversationId, preReply.reason);
        const known = preReply.known || collectEscalateIds(full, bits, '');
        const replyDecision = resolveIdentityAskDecision(full, {
          account: known.account || '',
          email: known.email || '',
          accounts: known.accounts || [],
          emails: known.emails || [],
        }, 'ACCOUNT');
        const stillNeedAccount = replyDecision.needAccount;
        const stillNeedEmail = replyDecision.needEmail;
        if (stillNeedAccount || stillNeedEmail) {
          const askOnly = pickAccountEmailAsk(stillNeedAccount, stillNeedEmail);
          const preAsk = preSendIdentityCheck(full, askOnly);
          if (preAsk.ok) {
            await postClientCommentOnce(conversationId, askOnly, latestUser, clientName);
            console.log('REPLY->ask missing only after preSend block', conversationId, {
              stillNeedAccount,
              stillNeedEmail,
            });
            return res.sendStatus(200);
          }
        }
        // Both known (or ask also blocked): do not send the re-ask; escalate with what we have.
        if (known.account || known.email) {
          parsed.action = 'ESCALATE';
          /* FIXED_MESSAGE_HANDOFF_R3:presend_escalate */
          if (fixedMessageHandoff.isAccountNumberQuestion(text)) {
            console.log('FIXED_HANDOFF presend account-question exemption', conversationId);
            await deliverAccountQuestionAnswer(conversationId, text, body || '', latestUser, clientName);
          } else {
            await commitFixedMessageHandoff({
              path: 'presend_escalate',
              conversationId,
              full,
              parts,
              latestUser,
              text,
              problem: text,
              account: known.account || '',
              email: known.email || '',
              actionNeeded: 'Please take this conversation.',
            });
          }
          return res.sendStatus(200);
        }
        // Nothing known and blocked , strip is unsafe; skip send rather than re-ask
        console.log('REPLY preSend , skip send (would re-ask, nothing to escalate)', conversationId);
        return res.sendStatus(200);
      }
    }
    /* LUNA_SPREAD_IMAGE_FIXES_V1:BEGIN:hookD */
    try { body = __imageAskGuard.hookD(conversationId, body); } catch (__e) { console.error('[imageAskGuard.hookD] guard hook failed', __e && __e.message); }
    /* LUNA_SPREAD_IMAGE_FIXES_V1:END:hookD */
    /* LUNA_STATE_PRESEND_V1:BEGIN:hookP */
    body = challengeVariantGuard.explainTwoStepFollowup(
      text,
      parts.filter((p) => String((p.author || {}).id || '') === ARSAL_ID && p.part_type !== 'note' && p.body)
        .map((p) => stripHtml(p.body || '')),
      body,
      conversationId
    );
    // Fail-closed default: if gate() throws before returning, hold the send rather than
    // shipping the un-gated draft (MISSED_QUESTION/WRONG_TOPIC/REPEATED_IMAGE_ASK/MISSED_ESCALATION
    // must never be silently bypassed — see CLAUDE.md).
    let __presend = { body: body, send: false, reason: 'gate-init-fail-closed' };
    // Gives the presend gate one real chance to fix a MISSED_QUESTION/WRONG_TOPIC draft with
    // the model before falling to clarify/escalate/generic-fallback. Same one-shot correction
    // pattern as the REPEATED_QUESTION retry just below; no new tool-calling, same userMsg.
    const __presendRegenerate = async (correctionInstruction) => {
      try {
        const retry = await openai.chat.completions.create({
          model: control.getModel(),
          messages: [
            { role: 'system', content: control.getPrompt() },
            { role: 'user', content: userMsg + '\n\n' + correctionInstruction + '\n\nReturn ACTION: REPLY with the corrected client-facing answer only.' },
          ],
        });
        const retryParsed = parseAction((((retry.choices[0] || {}).message || {}).content) || '');
        if (retryParsed.action === 'REPLY' && retryParsed.body) return postProcessModelReply(retryParsed.body, conversationId);
      } catch (e) { console.error('PRESEND_REGENERATE_FAILED', conversationId, e && e.message); }
      return null;
    };
    try { __presend = await __statePresend.gate({ conversationId: conversationId, draft: body, latestUser: latestUser, clientName: clientName, history: parts, knowledge: __presendKnowledge, regenerate: __presendRegenerate, scopeDecline: __isScopeDecline, assigneeId: full && full.admin_assignee_id, botIds: [ARSAL_ID, ELITE_AI_ID] }); body = __presend.body; } catch (__e) { console.error('[statePresend.hookP] gate threw — fail-closed (holding send)', __e && __e.message); __presend = { body: body, send: false, reason: 'gate-error-fail-closed' }; }
    if (repeatedClientQuestion && !__presend.send && __presend.result &&
        __presend.result.hardFails.length > 0 &&
        __presend.result.hardFails.every((f) => f.code === 'DUPLICATE_REPLY')) {
      const priorReply = parts.slice().reverse().find((p) =>
        String((p.author || {}).id || '') === ARSAL_ID && p.part_type !== 'note' && p.body);
      if (priorReply) {
        try {
          const previous = stripHtml(priorReply.body);
          const retry = await openai.chat.completions.create({
            model: control.getModel(),
            messages: [
              { role: 'system', content: control.getPrompt() },
              { role: 'user', content: userMsg + '\n\nYour draft copied your previous reply. Retry once: answer the client in fresh, natural wording. Keep the previous verified answer\'s facts, numbers, eligibility, and policy unchanged. Previous reply:\n' + previous + '\n\nReturn ACTION: REPLY with the revised client-facing answer only.' },
            ],
          });
          const retryParsed = parseAction((((retry.choices[0] || {}).message || {}).content) || '');
          if (retryParsed.action === 'REPLY' && retryParsed.body) {
            const candidate = postProcessModelReply(retryParsed.body, conversationId);
            if (protectedFactsMatch(previous, candidate)) {
              const retryGate = await __statePresend.gate({ conversationId, draft: candidate, latestUser, clientName, history: parts, knowledge: __presendKnowledge });
              if (retryGate.send && retryGate.result && retryGate.result.ok &&
                  protectedFactsMatch(previous, retryGate.body)) {
                __presend = retryGate;
                body = retryGate.body;
                console.log('REPEATED_QUESTION_REPHRASED', conversationId);
              }
            } else console.log('REPEATED_QUESTION_FACT_MISMATCH_HELD', conversationId);
          }
        } catch (e) { console.error('REPEATED_QUESTION_RETRY_FAILED', conversationId, e && e.message); }
      }
    }
    /* LUNA_STATE_PRESEND_V1:END:hookP */
    /* LUNA_MAINTAINER_V1:BEGIN:observe */
    try {
      __maintainer.observe(__presend, {
        conversationId: conversationId,
        messageId: latestUser && latestUser.id,
        clientText: text,
        authorType: 'customer',
        isNote: false,
        sent: !!(__presend && __presend.send),
        body: body,
        escalated: !!(typeof escalateRequested !== 'undefined' && escalateRequested),
        assignedToId: (full && full.admin_assignee_id) || '',
        retries: (__presend && __presend.attempts) || 0,
        engine: LUNA_STATE_PRESEND_VERSION,
      });
    } catch (__e) { /* observation must never affect the reply */ }
    /* LUNA_MAINTAINER_V1:END:observe */
    if (fixedMessageHandoff.faqTeamReviewBlocked(text, body)) {
      const approvedFaqBody = fixedMessageHandoff.approvedFaqCustomerBody(text);
      if (approvedFaqBody) {
        console.log('WELCOME_FAQ kb answer', conversationId);
        body = approvedFaqBody;
      } else {
        console.log('FAQ team-review hedge', conversationId);
        body = UNSUPPORTED_NUMBER_HEDGE;
      }
      if (__presend) __presend.send = true;
    }
    if (fixedMessageHandoff.isPasswordPolicyQuestion(text) && (!String(body || '').trim() || fixedMessageHandoff.isTerminalHedge(body))) {
      const policyLine = fixedMessageHandoff.passwordPolicyPublicLine(text, __originalDraft || body);
      if (policyLine) {
        body = policyLine;
        if (__presend) __presend.send = true;
      }
    }
    if (!fixedMessageHandoff.isAccountNumberQuestion(text)) {
      const __figEarly = fixedMessageHandoff.supportedFigureDraft(__originalDraft, body, __presendKnowledge);
      if (__figEarly) {
        await postClientCommentOnce(conversationId, __figEarly, latestUser, clientName, __presendKnowledge);
        return res.sendStatus(200);
      }
    }
    if (__presend.send) {
      await postClientCommentOnce(conversationId, body, latestUser, clientName); /* LUNA_STATE_PRESEND_V1:guardSend */
      return res.sendStatus(200);
    }
    // Fail-closed hold for missed human handoff: perform escalate instead of silence.
    // 'needs-escalate' is the same hold, reached instead when the client's own last message
    // (not an explicit "get me a human" ask) is understood but the bot has no compliant
    // answer for it (MISSED_QUESTION/WRONG_TOPIC unfixable) - reuses this same escalate path
    // rather than shipping the generic "checking this now" line.
    if (
      __presend &&
      (__presend.reason === 'missed-escalation-held' ||
        __presend.reason === 'enforce-critical:missed-escalation-held' ||
        __presend.reason === 'needs-escalate' ||
        __presend.reason === 'enforce-critical:needs-escalate' ||
        (__presend.result &&
          Array.isArray(__presend.result.hardFails) &&
          __presend.result.hardFails.some((f) => f && f.code === 'MISSED_ESCALATION')))
    ) {
      try {
        console.log('PRESEND_MISSED_ESCALATION_ESCALATE', conversationId, __presend.reason || '');
        if (
          fixedMessageHandoff.isLegitimateClarification(text) ||
          fixedMessageHandoff.isLegitimateClarification(body) ||
          fixedMessageHandoff.isPasswordPolicyQuestion(text)
        ) {
          const keep = fixedMessageHandoff.isLegitimateClarification(body) ? String(body).trim() : '';
          if (keep && !fixedMessageHandoff.isTerminalHedge(keep)) {
            await postClientCommentOnce(conversationId, keep, latestUser, clientName);
          } else if (fixedMessageHandoff.isPasswordPolicyQuestion(text)) {
            const policyLine = fixedMessageHandoff.passwordPolicyPublicLine(text, __originalDraft || body);
            if (policyLine) await postClientCommentOnce(conversationId, policyLine, latestUser, clientName);
          }
          console.log('PRESEND skip clarifier or password policy', conversationId);
          return res.sendStatus(200);
        }
        // Greetings / small-talk must NEVER force a teammate handoff. Live bug:
        // "Hello arsal how are you ?" → MISSED_QUESTION → forwarded-to-teammate.
        const __greet =
          (typeof isGreetingOrSmallTalk === 'function' && isGreetingOrSmallTalk(text)) ||
          (typeof isGreetingOrSmallTalkMsg === 'function' && isGreetingOrSmallTalkMsg(text));
        if (__greet) {
          console.log('PRESEND_MISSED_ESCALATION skip smalltalk', conversationId, __presend.reason || '');
          const greetBody =
            (body && String(body).trim()) ||
            "Hey — I'm doing well, thanks for asking. How can I help with your FundedElite account today?";
          await postClientCommentOnce(conversationId, greetBody, latestUser, clientName);
          return res.sendStatus(200);
        }
        // Personal questions must never force teammate escalate via MISSED_QUESTION hold.
        if (
          assistantIdentityGuard.isAssistantPersonalQuestion(text) &&
          !/\b(?:fundedelite|account|payout|challenge|login|kyc)\b/i.test(String(text || ''))
        ) {
          console.log('PRESEND_MISSED_ESCALATION skip personal', conversationId, __presend.reason || '');
          const personalBody = assistantIdentityGuard.enforceAssistantIdentityReply(
            text,
            body || '',
            conversationId,
            []
          );
          await postClientCommentOnce(conversationId, personalBody, latestUser, clientName);
          return res.sendStatus(200);
        }
        escState = syncEscalateTeammateFirstState(conversationId, full);
        if (escState.escalateAwaitingFirstTeammate) {
          const awaitingAttempt = evaluateAwaitingEscalationAttempt(conversationId, text, escState);
          escState = awaitingAttempt.state;
          if (awaitingAttempt.decision.action === 'SKIP') {
            console.log(awaitingAttempt.decision.log, conversationId);
            return res.sendStatus(200);
          }
          if (awaitingAttempt.decision.action === 'STATUS_ONLY') {
            await postEscalateHoldingStatus(
              conversationId,
              text,
              latestUser,
              clientName,
              escState,
              'ESCALATE holding after missed-escalation presend'
            );
            return res.sendStatus(200);
          }
        }
        let idsHeld = collectEscalateIds(full, bits, text) || {};
        const __heldFails = (__presend && __presend.result && __presend.result.hardFails) || [];
        const __unsupportedNumber = __heldFails.some((f) => f && f.code === 'UNSUPPORTED_NUMBER');
        const __missedHuman = __heldFails.some((f) => f && f.code === 'MISSED_ESCALATION');
        const __originalSpread =
          fixedMessageHandoff.isSpreadTemplateDraft(__originalDraft) && !isSpreadCheckAsk(text);
        const __postFig = async () => {
          const __fig = fixedMessageHandoff.supportedFigureDraft(__originalDraft, body, __presendKnowledge);
          if (!__fig) return false;
          await postClientCommentOnce(conversationId, __fig, latestUser, clientName, __presendKnowledge);
          return true;
        };
        const __faqMiss = typeof escalateRelatedOnly.isClearKbFaqAsk === 'function' && escalateRelatedOnly.isClearKbFaqAsk(text) && !isClearlyAccountSpecificIssue(text);
        const __spreadNegated = __spreadAskGate.explain(text).reason === 'negated-spread' && !isClearlyAccountSpecificIssue(text);
        if(await __postFig())return res.sendStatus(200);
        if (
          !fixedMessageHandoff.isAccountNumberQuestion(text) &&
          !fixedMessageHandoff.isLegitimateClarification(text) &&
          !fixedMessageHandoff.isLegitimateClarification(body) &&
          !fixedMessageHandoff.isPasswordPolicyQuestion(text) &&
          ((__unsupportedNumber && !__missedHuman) || __originalSpread || (fixedMessageHandoff.isSpreadTemplateDraft(body) && !isSpreadCheckAsk(text)) || fixedMessageHandoff.isTerminalHedge(body) || fixedMessageHandoff.isTerminalHedge(__originalDraft) || __faqMiss || __spreadNegated)
        ) {
          const __approvedFaq = fixedMessageHandoff.approvedFaqCustomerBody(text);
          const __figureHedge = (__unsupportedNumber && !__missedHuman) || __originalSpread || __spreadNegated || (fixedMessageHandoff.isSpreadTemplateDraft(body) && !isSpreadCheckAsk(text));
          if (__approvedFaq && !__figureHedge) {
            console.log('WELCOME_FAQ kb answer', conversationId);
            await postClientCommentOnce(conversationId, __approvedFaq, latestUser, clientName);
            return res.sendStatus(200);
          }
          console.log('PRESEND hedge instead of fixed line', conversationId);
          await postClientCommentOnce(conversationId, UNSUPPORTED_NUMBER_HEDGE, latestUser, clientName);
          return res.sendStatus(200);
        }
        /* FIXED_MESSAGE_HANDOFF_R3:missed_escalation */
        if (fixedMessageHandoff.isAccountNumberQuestion(text)) {
          await postClientCommentOnce(conversationId, fixedMessageHandoff.accountQuestionCustomerLine(text, body||''), latestUser, clientName);
          return res.sendStatus(200);
        }
        if(isClearlyAccountSpecificIssue(text)){const g=await ensureIdentityBeforeAccountEscalate({conversationId,full,bits,text,kind:'ACCOUNT',latestUser,clientName,modelBody:text});full=g.full||full;idsHeld=g.ids||idsHeld;if(!g.ready)return res.sendStatus(200);}
        if(await __postFig())return res.sendStatus(200);
        await commitFixedMessageHandoff({
          path: 'missed_escalation',
          conversationId,
          full,
          parts,
          latestUser,
          text,
          problem: text,
          account: idsHeld.account || '',
          email: idsHeld.email || '',
          actionNeeded: 'Please take this conversation.',
        });
      } catch (e) {
        console.error('PRESEND_MISSED_ESCALATION_ESCALATE_ERR', e && e.message);
      }
      return res.sendStatus(200);
    }
    {
      if (fixedMessageHandoff.isPasswordPolicyQuestion(text) && (!String(body || '').trim() || fixedMessageHandoff.isTerminalHedge(body))) {
        const policyLine = fixedMessageHandoff.passwordPolicyPublicLine(text, __originalDraft || body);
        if (policyLine) {
          console.log('PASSWORD_POLICY clarifier', conversationId);
          await postClientCommentOnce(conversationId, policyLine, latestUser, clientName);
          return res.sendStatus(200);
        }
      }
      const heldClarifier = fixedMessageHandoff.ambiguousChallengeClarifier(text);
      if (heldClarifier) {
        console.log('WELCOME_FAQ clarifier', conversationId);
        await postClientCommentOnce(conversationId, heldClarifier, latestUser, clientName);
      } else {
        const heldFaq = fixedMessageHandoff.uniqueRankedFaqArticle(text);
        if (heldFaq) {
          console.log('WELCOME_FAQ kb answer', conversationId);
          await postClientCommentOnce(conversationId, heldFaq, latestUser, clientName);
        }
      }
    }
    return res.sendStatus(200);
    } finally {
      clientReplyInflight.delete(inflightKey);
    }
  } catch (e) {
    console.error('WEBHOOK_ERR', e && e.message, e && e.stack);
    return res.sendStatus(200);
  }
};
app.post('/webhook', webhookSecurity.middleware(), handleWebhook);

const AUTO_CLOSE_SILENCE_SEC = 10 * 60; // 10 minutes after last team public reply

function isRiskAssigned(conversation) {
  const admin = conversation && conversation.admin_assignee_id != null ? String(conversation.admin_assignee_id) : '0';
  return admin === RISK_TEAM_ADMIN_ID;
}

function isAutoCloseExcluded(conversation) {
  // Risk teambox OR Risk assignee; Escalations teambox; Jerry assignee
  if (isRiskTeambox(conversation) || isRiskAssigned(conversation)) return true;
  if (isEscalationsTeambox(conversation)) return true;
  if (isJerryAssigned(conversation)) return true;
  return false;
}

function lastTeamSidePublicReplyUnix(parts) {
  // Any admin/bot public comment counts as "team replied" (includes Arsal / Elite AI / humans).
  let t = 0;
  for (const p of parts || []) {
    const a = (p && p.author) || {};
    if (String(p.part_type || '') !== 'comment') continue;
    if (a.type !== 'admin' && a.type !== 'bot') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    const at = Number(p.created_at || 0);
    if (at > t) t = at;
  }
  return t;
}

function lastClientPublicReplyUnix(parts, conversation) {
  let t = 0;
  const src = (conversation && conversation.source) || {};
  if (src.body && src.author && (src.author.type === 'user' || src.author.type === 'lead')) {
    const at = Number(src.created_at || conversation.created_at || 0);
    if (at > t) t = at;
  }
  for (const p of parts || []) {
    const a = (p && p.author) || {};
    if (a.type !== 'user' && a.type !== 'lead') continue;
    if (String(p.part_type || '') === 'note') continue;
    const body = stripHtml(p.body || '');
    const hasImg = typeof collectImageAttachments === 'function' && collectImageAttachments(p).length > 0;
    if (!body && !hasImg) continue;
    const at = Number(p.created_at || 0);
    if (at > t) t = at;
  }
  return t;
}

function shouldAutoCloseConversation(full) {
  if (!full || isAutoCloseExcluded(full)) {
    return { close: false, reason: 'excluded' };
  }
  // Only open tickets
  if (full.open === false || String(full.state || '').toLowerCase() === 'closed') {
    return { close: false, reason: 'already_closed' };
  }
  const parts = partsOf(full);
  const lastTeamAt = lastTeamSidePublicReplyUnix(parts);
  if (!lastTeamAt) return { close: false, reason: 'no_team_reply' };
  const lastClientAt = lastClientPublicReplyUnix(parts, full);
  if (lastClientAt >= lastTeamAt) {
    return { close: false, reason: 'client_replied_after_team', lastTeamAt, lastClientAt };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const silence = nowSec - lastTeamAt;
  if (silence < AUTO_CLOSE_SILENCE_SEC) {
    return { close: false, reason: 'under_10m', silence, lastTeamAt };
  }
  return { close: true, reason: 'silent_10m', silence, lastTeamAt, lastClientAt };
}

async function handleAutoCloseIfDue(conversationId, full) {
  const check = shouldAutoCloseConversation(full);
  if (!check.close) return check;
  const { all, state, id } = getConvState(conversationId);
  if (state.autoClosedAt && state.autoCloseTeamReplyAt === check.lastTeamAt) {
    return { close: false, reason: 'already_auto_closed_sig' };
  }
  await closeConversation(conversationId);
  state.autoClosedAt = Date.now();
  state.autoCloseTeamReplyAt = check.lastTeamAt;
  state.autoCloseSilence = check.silence;
  all[id] = state;
  saveTicketState(all);
  console.log('AUTO_CLOSE', conversationId, 'silence', check.silence, 'lastTeamAt', check.lastTeamAt);
  return { close: true, ...check };
}

async function searchOpenConversationsAutoClose() {
  const out = [];
  let startingAfter = null;
  for (let page = 0; page < 15; page++) {
    const body = {
      query: {
        operator: 'AND',
        value: [{ field: 'open', operator: '=', value: true }],
      },
      pagination: { per_page: 50 },
    };
    if (startingAfter) body.pagination.starting_after = startingAfter;
    const r = await axios.post('https://api.intercom.io/conversations/search', body, {
      headers: icHeaders(),
      timeout: IC_TIMEOUT_MS,
      validateStatus: () => true,
    });
    if (r.status >= 400) {
      console.log('AUTO_CLOSE_SEARCH_FAIL', r.status);
      break;
    }
    const batch = (r.data && r.data.conversations) || [];
    out.push(...batch);
    const next = r.data && r.data.pages && r.data.pages.next && r.data.pages.next.starting_after;
    if (!next || !batch.length) break;
    startingAfter = next;
  }
  return out;
}

let autoClosePollRunning = false;
let deferPollRunning = false;

async function pollDeferredRelatedReplies() {
  if (deferPollRunning) return;
  deferPollRunning = true;
  try {
    const all = loadTicketState();
    const now = Math.floor(Date.now() / 1000);
    for (const [cid, state] of Object.entries(all || {})) {
      const def = state && state.deferredRelatedReply;
      if (!def || !def.at) continue;
      if (now - Number(def.at) < 10 * 60) continue;
      try {
        const full = await fetchConversation(cid);
        if (!full) continue;
        syncEscalateTeammateFirstState(cid, full);
        const parts = partsOf(full);
        const userAt = Number(def.at);
        let teammateAfter = false;
        let arsalAfter = false;
        for (const part of parts) {
          const at = Number(part.created_at || 0);
          if (at <= userAt) continue;
          if (isHumanTeammatePublicReply(part)) teammateAfter = true;
          const a = part.author || {};
          if (String(a.id || '') === ARSAL_ID && String(part.part_type || '') === 'comment' && stripHtml(part.body || '')) {
            arsalAfter = true;
          }
        }
        if (teammateAfter || arsalAfter) {
          state.deferredRelatedReply = null;
          const cur = loadTicketState();
          cur[cid] = { ...(cur[cid] || {}), ...state };
          saveTicketState(cur);
          continue;
        }
        // Still unanswered , post a short consistent assist nudge via AI would be heavy;
        // clear defer and let next client webhook answer, OR post status that team was given time.
        // Prefer: clear defer flag so a synthetic wake isn't needed , store allowBotRelatedAnswer
        state.deferredRelatedReply = null;
        state.allowBotRelatedAnswerUntil = now + 30 * 60;
        const cur = loadTicketState();
        cur[cid] = { ...(cur[cid] || {}), ...state };
        saveTicketState(cur);
        console.log('ESCALATE defer matured , allow bot related answer', cid);
      } catch (e) {
        console.error('DEFER_POLL_ITEM', cid, e && e.message);
      }
    }
  } catch (e) {
    console.error('DEFER_POLL_ERR', e && e.message);
  } finally {
    deferPollRunning = false;
  }
}

async function pollAutoCloseSilentTickets() {
  if (autoClosePollRunning) return;
  if (control.isPaused && control.isPaused()) return;
  autoClosePollRunning = true;
  try {
    let list = [];
    try {
      list = await searchOpenConversationsAutoClose();
    } catch (e) {
      console.error('AUTO_CLOSE_SEARCH_ERR', e && e.message);
      return;
    }
    console.log('AUTO_CLOSE_POLL open', list.length);
    let closed = 0;
    for (const c of list) {
      const id = c && c.id;
      if (!id) continue;
      try {
        // Cheap exclude from search hit fields when present
        const team = c.team_assignee_id != null ? String(c.team_assignee_id) : '0';
        const admin = c.admin_assignee_id != null ? String(c.admin_assignee_id) : '0';
        if (team === ESCALATIONS_TEAM_ID || team === RISK_TEAM_ID) continue;
        if (admin === JERRY_ID || admin === RISK_TEAM_ADMIN_ID) continue;
        const full = (await fetchConversation(id)) || c;
        const res = await handleAutoCloseIfDue(String(id), full);
        if (res && res.close) closed++;
      } catch (e) {
        console.error('AUTO_CLOSE_ITEM_ERR', id, e && e.message);
      }
    }
    if (closed) console.log('AUTO_CLOSE_POLL closed', closed);
  } finally {
    autoClosePollRunning = false;
  }
}

const TEAMBOX_POLL_MS = 60 * 1000; // wake Escalations/Risk note gates after 15m without a new client webhook

async function searchOpenTeamConversations(teamId) {
  const out = [];
  let startingAfter = null;
  for (let page = 0; page < 10; page++) {
    const body = {
      query: {
        operator: 'AND',
        value: [
          { field: 'team_assignee_id', operator: '=', value: Number(teamId) },
          { field: 'open', operator: '=', value: true },
        ],
      },
      pagination: { per_page: 50 },
    };
    if (startingAfter) body.pagination.starting_after = startingAfter;
    const r = await axios.post('https://api.intercom.io/conversations/search', body, {
      headers: icHeaders(),
      timeout: IC_TIMEOUT_MS,
      validateStatus: () => true,
    });
    if (r.status >= 400) {
      console.log('TEAMBOX_SEARCH_FAIL', teamId, r.status, r.data && r.data.errors);
      break;
    }
    const batch = (r.data && r.data.conversations) || [];
    out.push(...batch);
    const next = r.data && r.data.pages && r.data.pages.next && r.data.pages.next.starting_after;
    if (!next || !batch.length) break;
    startingAfter = next;
  }
  return out;
}

let teamboxPollRunning = false;
async function searchOpenJerryConversations() {
  const out = [];
  let startingAfter = null;
  for (let page = 0; page < 10; page++) {
    const body = {
      query: {
        operator: 'AND',
        value: [
          { field: 'admin_assignee_id', operator: '=', value: Number(JERRY_ID) },
          { field: 'open', operator: '=', value: true },
        ],
      },
      pagination: { per_page: 50 },
    };
    if (startingAfter) body.pagination.starting_after = startingAfter;
    const r = await axios.post('https://api.intercom.io/conversations/search', body, {
      headers: icHeaders(),
      timeout: IC_TIMEOUT_MS,
      validateStatus: () => true,
    });
    if (r.status >= 400) {
      console.log('JERRY_SEARCH_FAIL', r.status, r.data && r.data.errors);
      break;
    }
    const batch = (r.data && r.data.conversations) || [];
    out.push(...batch);
    const next = r.data && r.data.pages && r.data.pages.next && r.data.pages.next.starting_after;
    if (!next || !batch.length) break;
    startingAfter = next;
  }
  return out;
}

async function pollSilentTeamboxNotes() {
  if (teamboxPollRunning) return;
  if (control.isPaused && control.isPaused()) return;
  teamboxPollRunning = true;
  try {
    const jobs = [
      { teamId: ESCALATIONS_TEAM_ID, label: 'ESCALATIONS', run: handleEscalationsSilentNoteOnly },
      { teamId: RISK_TEAM_ID, label: 'RISK', run: handleRiskSilentNoteOnly },
    ];
    for (const job of jobs) {
      let list = [];
      try {
        list = await searchOpenTeamConversations(job.teamId);
      } catch (e) {
        console.error('TEAMBOX_SEARCH_ERR', job.label, e && e.message);
        continue;
      }
      console.log('TEAMBOX_POLL', job.label, 'open', list.length);
      for (const c of list) {
        const id = c && c.id;
        if (!id) continue;
        try {
          const full = (await fetchConversation(id)) || c;
          await job.run(String(id), full);
        } catch (e) {
          console.error('TEAMBOX_POLL_ITEM_ERR', job.label, id, e && e.message);
        }
      }
    }
    // Jerry-assigned open tickets: long (150+ word) pending client msg + 15m → summary note
    let jerryList = [];
    try {
      jerryList = await searchOpenJerryConversations();
    } catch (e) {
      console.error('JERRY_SEARCH_ERR', e && e.message);
      jerryList = [];
    }
    console.log('TEAMBOX_POLL JERRY open', jerryList.length);
    for (const c of jerryList) {
      const id = c && c.id;
      if (!id) continue;
      try {
        const full = (await fetchConversation(id)) || c;
        // Escalations/Risk Jerry tickets already handled above
        if (isEscalationsTeambox(full) || isRiskTeambox(full)) continue;
        await handleJerryOrEscalationsLongMessageNote(String(id), full);
      } catch (e) {
        console.error('TEAMBOX_POLL_ITEM_ERR', 'JERRY', id, e && e.message);
      }
    }
  } finally {
    teamboxPollRunning = false;
  }
}

app.get('/health', (req, res) => res.json({ ok: true, engine: 'fresh-2026-09-16-botstop-owner-only-v1' }));

// TESTABILITY SEAM: binding the port and starting the pollers only happens when this file
// is run as the entry point (`node index.js`, which is what pm2 runs). Requiring index.js
// from a test therefore loads the same handlers without opening a port, starting the
// teambox/auto-close/defer pollers, or the prune interval. Startup behavior is unchanged.
if (require.main === module) {
  app.listen(process.env.PORT || 3000, () => {
    console.log('Bot running (fresh engine)');
    // Catch Escalations/Risk tickets that already passed the 15m gate but got no new webhook
    setTimeout(() => {
      pollSilentTeamboxNotes().catch((e) => console.error('TEAMBOX_POLL_START_ERR', e && e.message));
      pollAutoCloseSilentTickets().catch((e) => console.error('AUTO_CLOSE_START_ERR', e && e.message));
      pollDeferredRelatedReplies().catch((e) => console.error('DEFER_START_ERR', e && e.message));
    }, 8000);
    let ticketStatePruneTicks = 0;
    setInterval(() => {
      pollSilentTeamboxNotes().catch((e) => console.error('TEAMBOX_POLL_ERR', e && e.message));
      pollAutoCloseSilentTickets().catch((e) => console.error('AUTO_CLOSE_POLL_ERR', e && e.message));
      pollDeferredRelatedReplies().catch((e) => console.error('DEFER_POLL_ERR', e && e.message));
      ticketStatePruneTicks += 1;
      if (ticketStatePruneTicks >= 60) {
        ticketStatePruneTicks = 0;
        pruneTicketState();
      }
    }, TEAMBOX_POLL_MS);
  });
}

// Exported for isolated tests only. Nothing here changes runtime behavior.
// __setTestDoubles lets a test replace the two functions that reach Intercom, so a test
// can exercise failure/timeout/dedup paths and still cannot send a real message.
// Captured before any test double can replace them.
const __realIcRequest = icRequest;
const __realFetchConversation = fetchConversation;

module.exports = {
  app,
  handleWebhook,
  webhookSecurity,
  buildVisionUserContent,
  attachmentUrlAllowed,
  isPrivateHost,
  postReply,
  postClientCommentOnce,
  assignToTeammateIfNeeded,
  closeConversation,
  arsalAlreadyRepliedAfter,
  getConvState,
  parseAction,
  isShortClientAck,
  __setTestDoubles(doubles) {
    doubles = doubles || {};
    // Passing null restores the real implementation, so a test can exercise icRequest's own
    // retry/reconciliation behavior after having stubbed it earlier in the same process.
    if (doubles.icRequest !== undefined) icRequest = doubles.icRequest || __realIcRequest;
    if (doubles.fetchConversation !== undefined) fetchConversation = doubles.fetchConversation || __realFetchConversation;
  },
};
