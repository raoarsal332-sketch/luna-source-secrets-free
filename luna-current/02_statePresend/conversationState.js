'use strict';

/**
 * conversationState.js - Phase 1. Deterministic structured conversation state.
 *
 * buildState(messages, opts) -> stable schema (see SCHEMA_VERSION / emptyState()).
 *
 * Input messages may be Intercom conversation parts or generic
 * {role, text, ts, attachments} objects; normalizeMessages() handles both.
 * Roles: 'client' | 'bot' | 'human' (teammate, public) | 'note' (internal).
 */

const T = require('./textUtils');
const correction = require('./correctionDetector');
const topicChange = require('./topicChangeDetector');
const multiAsk = require('./multiAskCompleteness');
const { sanitizeCredentials } = require('./credentialSanitizer');

const SCHEMA_VERSION = 'state-presend-v1';

function emptyState() {
  return {
    schema_version: SCHEMA_VERSION,
    active_issue: null,
    active_topics: [],
    known_details: {},
    asked_items: [],
    answered_items: [],
    pending_questions: [],
    resolved_items: [],
    pending_items: [],
    human_active: false,
    latest_human_instruction: null,
    latest_human_action: null,
    human_confirmed_facts: [],
    escalated: false,
    escalation_target: null,
    waiting_for: null,
    current_stage: null,
    recent_corrections: [],
    topic_changed: false,
    images: { received: 0, loaded: 0 },
    last_bot_reply: null,
    last_bot_replies: [],
    client_burst: [],
    counts: { total: 0, client: 0, bot: 0, human: 0, note: 0 },
    last_client_message: null,
    last_client_is_short_ack: false,
  };
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

function roleOf(part, opts) {
  if (!part) return null;
  if (part.role) {
    const r = String(part.role).toLowerCase();
    if (['client', 'user', 'lead', 'customer', 'contact'].includes(r)) return 'client';
    if (['bot', 'assistant', 'luna', 'ai'].includes(r)) return 'bot';
    if (['human', 'admin', 'agent', 'teammate', 'team'].includes(r)) return 'human';
    if (['note', 'internal', 'system'].includes(r)) return 'note';
  }
  const pt = String(part.part_type || part.type || '').toLowerCase();
  if (pt === 'note' || pt === 'internal_note') return 'note';
  const a = part.author || {};
  const at = String(a.type || '').toLowerCase();
  if (at === 'user' || at === 'lead' || at === 'contact') return 'client';
  if (at === 'bot') return 'bot';
  if (at === 'admin' || at === 'team') {
    const botName = opts && opts.botName ? String(opts.botName).toLowerCase() : 'luna';
    const botIds = (opts && opts.botAdminIds) || [];
    if (botIds.map(String).includes(String(a.id))) return 'bot';
    if (a.name && String(a.name).toLowerCase().includes(botName)) return 'bot';
    return 'human';
  }
  return null;
}

function normalizeMessages(input, opts) {
  const arr = Array.isArray(input) ? input : (input && input.conversation_parts && input.conversation_parts.conversation_parts) || [];
  const out = [];
  for (const p of arr) {
    if (!p) continue;
    if (typeof p === 'string') { out.push({ role: 'client', text: T.stripHtml(p), ts: 0, attachments: [] }); continue; }
    const role = roleOf(p, opts);
    if (!role) continue;
    const text = sanitizeCredentials(T.stripHtml(p.text !== undefined ? p.text : p.body !== undefined ? p.body : p.content || ''));
    const ts = Number(p.ts || p.created_at || p.timestamp || 0) || 0;
    const attachments = Array.isArray(p.attachments) ? p.attachments : [];
    if (!text && !attachments.length) continue;
    out.push({ role, text, ts, attachments });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Detectors used by the builder
// ---------------------------------------------------------------------------

const ESCALATION_RE = [
  /\b(?:passed|forwarded|escalated|raised|sent)\s+(?:this|it|your (?:case|request|issue|ticket))\s+(?:to|with)\s+(?:the\s+)?(?:team|relevant team|support team|technical team|risk team|payments? team|management)\b/i,
  /\bour (?:team|technical team|risk team|payments? team) (?:will|is going to|are going to) (?:review|check|look into|get back)\b/i,
  /\bescalat(?:e|ed|ing|ion)\b/i,
  /\bhanded (?:this )?over to\b/i,
];

const HUMAN_CONFIRMATIONS = [
  { fact: 'account_active', re: /\b(?:account|it)\s+(?:is|has been|was|is now)\s+(?:activated|active|enabled|live)\b|\bactivated (?:your|the) account\b/i },
  { fact: 'account_reset', re: /\b(?:account|it|challenge)\s+(?:has been|was|is)\s+reset\b|\breset (?:has been|is) (?:done|completed|applied)\b/i },
  { fact: 'payout_processed', re: /\bpayout\s+(?:has been|was|is)\s+(?:processed|sent|paid|approved)\b|\bsent (?:your|the) payout\b/i },
  { fact: 'kyc_approved', re: /\b(?:kyc|verification)\s+(?:has been|was|is)\s+(?:approved|completed|verified|passed)\b/i },
  { fact: 'refund_processed', re: /\brefund\s+(?:has been|was|is)\s+(?:processed|issued|sent)\b/i },
  { fact: 'credentials_sent', re: /\b(?:credentials|login details)\s+(?:have been|were|are)\s+(?:sent|emailed|shared)\b/i },
];

const RESOLVED_RE = /\b(?:resolved|fixed|sorted|working now|it works now|all good now|issue is solved|solved|thank you it works)\b/i;

const WAIT_FOR_CLIENT_RE = /\b(?:let (?:me|us) know|once you (?:have|send|confirm|do)|please (?:confirm|try|check) (?:and|then) let|waiting for your|as soon as you)\b/i;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * @param {Array} rawMessages Intercom parts or {role,text,ts,attachments}
 * @param {object} [opts] { botName, botAdminIds, images:{received,loaded}, humanActiveWindowMs, now }
 */
// Facts that are only meaningful for a specific account. Cleared on an explicit switch
// or an account-number correction — both paths must use the same invalidation.
const ACCOUNT_DEPENDENT_FIELDS = ['challenge_type', 'account_size', 'phase', 'addons', 'purchase_version', 'stage'];

function applyAccountChange(s, knownAt, i, newAccount, sameMessageText) {
  const prev = s.known_details.account_number;
  const changed = !!(prev && String(newAccount) !== String(prev));
  s.known_details.account_number = newAccount;
  knownAt.account_number = i;
  if (!changed) return false;
  for (const dependent of ACCOUNT_DEPENDENT_FIELDS) {
    if (dependent in s.known_details) delete s.known_details[dependent];
    delete knownAt[dependent];
  }
  s.account_switched_at = i;
  const ct = correction.findChallengeType(sameMessageText || '');
  if (ct) {
    s.known_details.challenge_type = ct;
    knownAt.challenge_type = i;
  }
  return true;
}

function buildState(rawMessages, opts) {
  opts = opts || {};
  const s = emptyState();
  const msgs = normalizeMessages(rawMessages, opts);
  s.counts.total = msgs.length;
  for (const m of msgs) s.counts[m.role] = (s.counts[m.role] || 0) + 1;

  const now = opts.now || Date.now();
  const knownAt = {}; // field -> index at which value became known

  let lastBotIdx = -1;
  let lastHumanIdx = -1;
  let lastClientIdx = -1;
  const topicsSoFar = [];

  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const text = m.text;

    if (m.role === 'client') {
      lastClientIdx = i;
      // corrections first so superseded values never win
      const c = correction.detect(text);
      if (c.isCorrection) {
        s.recent_corrections.push({ index: i, type: c.type, field: c.field, from: c.from, to: c.to, text: T.clip(text, 200) });
        const correctionAccts = T.extractAccountNumbers(text);
        if (c.field === 'account_number' && c.to) {
          applyAccountChange(s, knownAt, i, c.to, text);
        } else if (correctionAccts.length) {
          applyAccountChange(s, knownAt, i, correctionAccts[correctionAccts.length - 1], text);
        }
        if (c.field && c.field !== 'account_number' && c.to) {
          s.known_details[c.field] = c.to;
          knownAt[c.field] = i;
        }
      } else {
        const accts = T.extractAccountNumbers(text);
        const email = T.extractEmail(text);
        if (email) { s.known_details.email = email; knownAt.email = i; }
        const ct = correction.findChallengeType(text);
        // Product/stage facts belong to the account they were stated for. Corrections and
        // ordinary switches share applyAccountChange so dependents cannot survive a new id.
        let switchedAccount = false;
        if (accts.length) switchedAccount = applyAccountChange(s, knownAt, i, accts[accts.length - 1], text);
        if (ct && (switchedAccount || !s.known_details.challenge_type)) { s.known_details.challenge_type = ct; knownAt.challenge_type = i; }
      }
      const imgs = m.attachments.filter((a) => /^image\//i.test((a && (a.content_type || a.contentType || a.type)) || '') || /\.(png|jpe?g|gif|webp)(\?|$)/i.test((a && (a.url || a.name)) || '')).length;
      if (imgs) { s.images.received += imgs; knownAt.screenshot = i; }
      if (RESOLVED_RE.test(text) && s.active_issue) s.resolved_items.push({ item: s.active_issue, index: i });

      // topics
      const tc = topicChange.detect(text, topicsSoFar);
      const newTopics = T.extractTopics(text);
      if (tc.changed) {
        s.active_topics = T.uniq(tc.newTopics.length ? tc.newTopics : newTopics);
      } else if (newTopics.length) {
        s.active_topics = T.uniq([...s.active_topics, ...newTopics]).slice(-6);
      }
      topicsSoFar.splice(0, topicsSoFar.length, ...T.uniq([...topicsSoFar, ...newTopics]));
      if (i === msgs.length - 1 || msgs.slice(i + 1).every((x) => x.role === 'client')) s.topic_changed = s.topic_changed || tc.changed;
    }

    if (m.role === 'bot') {
      lastBotIdx = i;
      for (const item of T.detectAsks(text)) s.asked_items.push({ item, index: i, answered: false });
      if (ESCALATION_RE.some((re) => re.test(text))) { s.escalated = true; s.escalation_target = s.escalation_target || 'team'; }
    }

    if (m.role === 'human') {
      lastHumanIdx = i;
      s.latest_human_instruction = T.clip(text, 400);
      for (const hc of HUMAN_CONFIRMATIONS) {
        if (hc.re.test(text)) {
          s.human_confirmed_facts.push({ fact: hc.fact, index: i, text: T.clip(text, 200) });
          s.latest_human_action = hc.fact;
        }
      }
      if (ESCALATION_RE.some((re) => re.test(text))) { s.escalated = true; s.escalation_target = s.escalation_target || 'team'; }
    }

    if (m.role === 'note') {
      if (/escalat|forward(?:ed)? to|assign(?:ed)? to/i.test(text)) { s.escalated = true; s.escalation_target = s.escalation_target || 'team'; }
      const noteAccts = T.extractAccountNumbers(text);
      if (noteAccts.length && !s.known_details.account_number) { s.known_details.account_number = noteAccts[0]; knownAt.account_number = i; }
    }
  }

  // answered items: asked before the client provided the value
  for (const a of s.asked_items) {
    const field = a.item === 'screenshot' ? 'screenshot' : a.item;
    const have = field === 'screenshot' ? (s.images.received > 0 || (opts.images && opts.images.received > 0)) : s.known_details[field] !== undefined;
    // Known anywhere in the conversation counts: if it was known before the ask,
    // the ask itself was redundant and must not be repeated.
    if (have) a.answered = true;
  }
  s.answered_items = s.asked_items.filter((a) => a.answered).map((a) => a.item);
  s.answered_items = T.uniq(s.answered_items);

  if (opts.images) {
    s.images.received = Math.max(s.images.received, Number(opts.images.received) || 0);
    s.images.loaded = Math.max(s.images.loaded, Number(opts.images.loaded) || 0);
  }

  // pending questions (burst + carried)
  const asks = multiAsk.extractAsks(msgs);
  s.pending_questions = [...asks.burst, ...asks.carried].map((a) => ({ text: T.clip(a.text, 240), kind: a.kind, carried: !!a.carried }));
  s.client_burst = msgs.slice(Math.max(lastBotIdx, lastHumanIdx) + 1).filter((m) => m.role === 'client').map((m) => T.clip(m.text, 300));

  // pending items: unanswered asks + unresolved questions
  const unansweredAsks = T.uniq(s.asked_items.filter((a) => !a.answered).map((a) => a.item));
  s.pending_items = [...unansweredAsks.map((x) => ({ type: 'detail', item: x })), ...s.pending_questions.map((q) => ({ type: 'question', item: q.text }))];

  // waiting_for: last bot ask not yet answered and no client message since that answered it
  if (lastBotIdx >= 0) {
    const lastBot = msgs[lastBotIdx];
    const lastAsks = T.detectAsks(lastBot.text).filter((item) => !s.asked_items.find((a) => a.index === lastBotIdx && a.item === item && a.answered));
    if (lastAsks.length && lastClientIdx < lastBotIdx) s.waiting_for = lastAsks[0];
    else if (lastClientIdx < lastBotIdx && WAIT_FOR_CLIENT_RE.test(lastBot.text)) s.waiting_for = 'client_confirmation';
  }

  // human activity
  const windowMs = opts.humanActiveWindowMs || 6 * 60 * 60 * 1000;
  if (lastHumanIdx >= 0) {
    const h = msgs[lastHumanIdx];
    const recentByOrder = lastHumanIdx >= msgs.length - 4 || lastHumanIdx > lastBotIdx;
    const recentByTime = h.ts ? (now - (h.ts > 1e12 ? h.ts : h.ts * 1000)) <= windowMs : false;
    s.human_active = recentByOrder || recentByTime;
  }

  // active issue
  s.active_issue = s.active_topics.length ? s.active_topics[s.active_topics.length - 1] : null;
  if (s.resolved_items.some((r) => r.item === s.active_issue) && !s.pending_questions.length) s.active_issue = null;

  // stage
  if (s.human_active && lastHumanIdx > lastBotIdx) s.current_stage = 'human_handling';
  else if (s.escalated) s.current_stage = 'escalated';
  else if (s.waiting_for) s.current_stage = 'awaiting_client';
  else if (unansweredAsks.length) s.current_stage = 'collecting_details';
  else if (!s.active_issue && s.resolved_items.length) s.current_stage = 'resolved';
  else s.current_stage = 'answering';

  s.last_bot_reply = lastBotIdx >= 0 ? msgs[lastBotIdx].text : null;
  s.last_bot_replies = msgs.filter((m) => m.role === 'bot').slice(-3).map((m) => m.text);
  s.last_client_message = lastClientIdx >= 0 ? msgs[lastClientIdx].text : null;
  s.last_client_is_short_ack = lastClientIdx >= 0 ? T.isShortAck(msgs[lastClientIdx].text) : false;
  s.recent_corrections = s.recent_corrections.slice(-3);
  s.human_confirmed_facts = s.human_confirmed_facts.slice(-5);
  return s;
}

/**
 * Luna-facing view: drops raw text fields that are not needed by the model and
 * clips the rest. No secrets or internals.
 */
function publicView(state) {
  const s = state || emptyState();
  return {
    active_issue: s.active_issue,
    active_topics: s.active_topics,
    known_details: s.known_details,
    asked_items: T.uniq(s.asked_items.map((a) => a.item)),
    answered_items: s.answered_items,
    pending_questions: s.pending_questions.map((q) => q.text),
    resolved_items: T.uniq(s.resolved_items.map((r) => r.item)),
    pending_items: s.pending_items.map((p) => p.item),
    human_active: s.human_active,
    latest_human_instruction: s.latest_human_instruction,
    latest_human_action: s.latest_human_action,
    escalated: s.escalated,
    escalation_target: s.escalation_target,
    waiting_for: s.waiting_for,
    current_stage: s.current_stage,
    recent_corrections: s.recent_corrections.map((c) => ({ field: c.field, from: c.from, to: c.to })),
    topic_changed: s.topic_changed,
    images_received: s.images.received,
  };
}

module.exports = { SCHEMA_VERSION, emptyState, buildState, normalizeMessages, publicView, HUMAN_CONFIRMATIONS, ESCALATION_RE };
