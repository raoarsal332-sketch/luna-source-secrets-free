'use strict';
/**
 * FAQ V12 — approved-answer selection only.
 * The model may CLASSIFY/SELECT an answer id; it must not compose FAQ facts.
 * Final send is allowlist-equality against the approved answer set.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const T = require('./statePresend/textUtils');
const units = require('./statePresend/multiAskCompleteness');
const deliveryRecovery = require('./faqDeliveryRecovery');
const outboundSafety = require('./faqOutboundSafety');
const approved = require('./faqApprovedAnswers');
const selectMod = require('./faqAnswerSelect');
const teammateTopicOwnership = require('./teammateTopicOwnership');

const scope = new AsyncLocalStorage();
const backendScope = new AsyncLocalStorage();
const locks = new Map();
const RISK_TEAM_DEFAULT = '10675195';
const ESCALATIONS_TEAM_DEFAULT = '9629759';
const hash = (x) => crypto.createHash('sha256').update(String(x || '')).digest('hex');

/** Let main webhook gates emit SKIP closed-ticket / ownership-intake / continuous-ownership logs. */
const DEFER_TO_MAIN_PATH = new Set([
  'currently-closed',
  'explicit-stop-note',
  'explicit-teammate-silence',
  'stop-in-history',
]);

function shouldDeferToMainPath(reason) {
  return DEFER_TO_MAIN_PATH.has(reason);
}

/** Approved-answer abstain: no plan, but legacy/KB path may still answer (pending catalog rows). */
function approvedSelectAbstainFallthrough(reason) {
  return /^(?:no-confident-match|needs-owner-approval|below-threshold|unknown-answer-id|classifier-empty|classifier-unknown-or-nonsendable|classifier-low-confidence|classifier-timeout|classifier-error|language-uncertain|language-non-en)$/.test(
    String(reason || '')
  );
}

function prepareTerminalReason(reason) {
  if (approvedSelectAbstainFallthrough(reason)) return false;
  return (
    /silence|fail-closed|ownership|stop|closed|control-disabled|aiOff|teammate-answered/i.test(reason) ||
    reason === 'risk-escalations-silence' ||
    reason === 'ownership-ambiguous-fail-closed'
  );
}

function payoutBackendThreadActive(parts) {
  if (!Array.isArray(parts)) return false;
  for (const p of ordered(parts)) {
    if (!p || !p.body) continue;
    const t = plain(p.body);
    if (!t) continue;
    const fromHuman =
      (p.part_type === 'note' && (p.author || {}).type === 'admin') ||
      (p.part_type === 'comment' && (p.author || {}).type === 'admin');
    if (!fromHuman) continue;
    if (/\bpayout\b/i.test(t) && /\b(?:check|checking|pending|finance|waiting|approved|processed|2265672)\b/i.test(t)) return true;
    if (/\bchecking\s+your\s+payout\b/i.test(t)) return true;
  }
  return false;
}

function optionBFaqAllowed(answerId, { humanOwns, payoutThread, backendInTurn }) {
  if (!humanOwns || !payoutThread || backendInTurn) return true;
  const row = approved.get(answerId);
  const tags = new Set((row && row.intentTags) || []);
  if (tags.has('holdingTime') || tags.has('minHolding')) return false;
  return true;
}

function currentContent(value) {
  const source = String(value || '');
  let out = '',
    last = 0,
    stack = [],
    quoted = 0;
  const tags = /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi;
  let m;
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  while ((m = tags.exec(source))) {
    if (!quoted) out += source.slice(last, m.index);
    const name = m[2].toLowerCase(),
      closing = !!m[1],
      isQuote =
        name === 'blockquote' ||
        /\btype\s*=\s*["']?cite\b/i.test(m[3]) ||
        /\b(?:class|id)\s*=\s*["'][^"']*(?:gmail_quote|yahoo_quoted|protonmail_quote|moz-cite-prefix|divRplyFwdMsg)/i.test(m[3]);
    if (closing) {
      const i = stack.map((x) => x.name).lastIndexOf(name);
      if (i >= 0) {
        const removed = stack.splice(i);
        quoted -= removed.filter((x) => x.quote).length;
      } else if (name === 'blockquote') return '';
    } else if (!voidTags.has(name) && !m[3].trim().endsWith('/')) {
      stack.push({ name, quote: isQuote });
      if (isQuote) quoted++;
    }
    if (!quoted && !isQuote) out += m[0];
    last = tags.lastIndex;
  }
  if (quoted) return '';
  out += source.slice(last);
  return T.stripHtml(T.stripQuotedHistory(out)).replace(/\s+/g, ' ').trim();
}
const plain = currentContent;

const file = () =>
  process.env.LUNA_FAQ_ASSIST_STATE_FILE ||
  (process.env.TICKET_STATE_FILE
    ? process.env.TICKET_STATE_FILE + '.faq-assistance.json'
    : path.join(__dirname, 'faq-assistance-state.json'));

function load() {
  try {
    const v = JSON.parse(fs.readFileSync(file(), 'utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('invalid faq ledger');
    return v;
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}
function save(key, value) {
  const all = load();
  for (const [k, r] of Object.entries(all))
    if (['confirmed', 'rejected'].includes(r.status) && Date.now() - Date.parse(r.atUTC) > 30 * 86400000) delete all[k];
  if (!all[key] && Object.keys(all).length >= 4000) throw Error('FAQ_LEDGER_CAPACITY');
  all[key] = { ...value, atUTC: new Date().toISOString() };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = file() + '.tmp-' + process.pid;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(all));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file());
  try {
    const dir = fs.openSync(path.dirname(file()), 'r');
    try {
      fs.fsyncSync(dir);
    } finally {
      fs.closeSync(dir);
    }
  } catch (_) {}
}
function log(cid, reason, extra = {}) {
  console.log('FAQ_ASSIST ' + JSON.stringify({ cid: String(cid), utc: new Date().toISOString(), action: 'public-informational-faq', reason, ...extra }));
}
function current(cid) {
  const s = scope.getStore();
  return s && s.plan.cid === String(cid) ? s : null;
}
function recoveryActive(cid) {
  return false;
}
function privilegedVeto(cid, kind) {
  const b = backendScope.getStore();
  const faqScope = current(cid);
  if (faqScope && kind !== 'comment') {
    return { ok: false, skipped: true, reason: 'faq-scope-does-not-authorize-' + kind };
  }
  if (b && b.plan.cid === String(cid) && !['note', 'assignment'].includes(kind)) {
    return { ok: false, skipped: true, reason: 'backend-scope-does-not-authorize-' + kind };
  }
  if (faqScope && faqScope.plan && faqScope.plan.ownership && faqScope.plan.ownership.blocked && kind === 'close') {
    return { ok: false, skipped: true, reason: 'faq-scope-does-not-authorize-close' };
  }
  return null;
}
function ordered(parts) {
  return parts
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(a.p.created_at) - Number(b.p.created_at) || a.i - b.i)
    .map((x) => x.p);
}
function latest(full, parts) {
  const user = ordered(parts)
    .filter((p) => ['user', 'lead'].includes((p.author || {}).type) && ['comment', 'open'].includes(p.part_type) && p.body)
    .pop();
  if (user) return user;
  const source = full && full.source;
  return source && source.id && ['user', 'lead'].includes((source.author || {}).type) && Number(source.created_at || full.created_at) > 0
    ? source
    : null;
}
function controls(cid, full, d) {
  try {
    if (d.control.isPaused() || d.control.isAiOff(cid) || d.control.getConfig().repliesEnabled === false || !d.control.isTestAllowed(cid, d.clientName(full)))
      return 'control-disabled';
  } catch (_) {
    return 'control-unavailable';
  }
  return '';
}
function historyCheck(full, parts, d) {
  if (!full || !Array.isArray(parts)) return 'authoritative-history-unavailable';
  if (parts.length >= 500) return 'incomplete-history';
  const metaCount = Number((full.conversation_parts || {}).total_count);
  // Authoritative parts may include a newer close/reply than stale total_count (race refetch).
  if (metaCount && parts.length < metaCount) return 'incomplete-history';
  if (full.state === 'closed' || full.open === false) return 'currently-closed';
  if (parts.some((p) => !p.id || !Number.isFinite(Number(p.created_at)) || Number(p.created_at) <= 0)) return 'event-order-unavailable';
  let o;
  try {
    o = d.ownership(full, parts);
  } catch (_) {
    return 'ownership-evidence-unavailable';
  }
  if (o.reason === 'stop-in-history') return 'stop-in-history';
  if (['ownership-history-limited', 'ownership-unavailable'].includes(o.reason)) return o.reason;
  if (d.silence(parts).silenced) return 'explicit-teammate-silence';
  const userForTeammate = latest(full, parts);
  if (userForTeammate) {
    try {
      const opts = typeof d.teammateScopeOpts === 'function' ? d.teammateScopeOpts() : d.teammateScopeOpts || {};
      if (typeof teammateTopicOwnership.teammateAnsweredPendingClient === 'function'
        && teammateTopicOwnership.teammateAnsweredPendingClient(parts, userForTeammate, opts)) return 'teammate-answered-latest';
    } catch (_) {
      return 'teammate-reply-check-unavailable';
    }
  }
  if (typeof d.endedLeaseMute === 'function') {
    const user = latest(full, parts);
    const mute = d.endedLeaseMute(full, parts, user);
    if (mute && mute.mute && mute.reason === 'explicit-stop') return 'explicit-stop-note';
  }
  let restriction = -1,
    resume = -1;
  for (const [i, p] of ordered(parts).entries())
    if (p.part_type === 'note' && (p.author || {}).type === 'admin' && !d.isOwn(full.id, p)) {
      if (d.stop(p.body) || negativeAutomationInstruction(plain(p.body))) restriction = i;
      else if (d.isGrant(p)) resume = i;
    }
  if (restriction >= 0 && restriction >= resume) return 'explicit-stop-note';
  return '';
}

/**
 * Owner V12: Risk/Escalations complete silence; ambiguous/missing/stale fail closed.
 * Clear ordinary human admin (non-protected) remains Option B for approved FAQ
 * (frozen STATE: human ownership alone is not an FAQ veto).
 */
function ownershipFailClosed(full, parts, d) {
  const risk = String((d && d.riskTeamId) || RISK_TEAM_DEFAULT);
  const esc = String((d && d.escalationsTeamId) || ESCALATIONS_TEAM_DEFAULT);
  const teamRaw = full && full.team_assignee_id;
  const team = teamRaw != null && teamRaw !== '' ? String(teamRaw) : '';
  const adminRaw = full && full.admin_assignee_id;
  const admin = adminRaw != null && adminRaw !== '' ? String(adminRaw) : '';

  if (team && team !== '0' && (team === risk || team === esc)) return 'risk-escalations-silence';
  if (d && typeof d.isProtectedTeam === 'function') {
    try {
      if (d.isProtectedTeam(full)) return 'risk-escalations-silence';
    } catch (_) {
      return 'risk-escalations-silence';
    }
  }

  let o;
  try {
    o = d.ownership(full, parts);
  } catch (_) {
    return 'ownership-evidence-unavailable';
  }
  if (['ownership-history-limited', 'ownership-unavailable'].includes(o.reason)) return o.reason;

  // Ambiguous: blocked without assignee metadata, unless thread history alone shows human
  // activity (Option B — human ownership alone is not an approved-FAQ veto).
  if (o.blocked && (!team || team === '0') && (!admin || admin === '0')) {
    const threadHumanOnly = o.reason === 'human-history-owned' || o.reason === 'human-outbound-source';
    if (!threadHumanOnly) return 'ownership-ambiguous-fail-closed';
  }
  // Explicit empty-string team (not null / not '0') is treated as missing/corrupt field.
  if (teamRaw === '') return 'ownership-ambiguous-fail-closed';

  if (d && typeof d.ownershipStale === 'function') {
    try {
      if (d.ownershipStale(full, parts)) return 'ownership-stale-fail-closed';
    } catch (_) {
      return 'ownership-stale-fail-closed';
    }
  }
  return '';
}

function publicRecordKinds(r) {
  return !r.kind || ['faq', 'comment', 'public-informational-faq'].includes(r.kind);
}

function ledgerAnswerHit(cid, answerId, exceptOperationId) {
  const all = load();
  return Object.values(all).some((r) => {
    if (String(r.cid) !== String(cid) || !publicRecordKinds(r)) return false;
    if (!['pending', 'unknown', 'confirmed'].includes(r.status)) return false;
    if (!(r.answerId === answerId || (Array.isArray(r.answerIds) && r.answerIds.includes(answerId)))) return false;
    // Same in-flight operation may recheck before the ledger row is finalized.
    if (exceptOperationId && String(r.operationId || '') === String(exceptOperationId) && r.status === 'pending') return false;
    return true;
  });
}

function priorPublicCoversAnswer(parts, answerId) {
  const row = approved.get(answerId);
  if (!row || !Array.isArray(parts)) return false;
  const tags = new Set(row.intentTags || []);
  const target = approved.normalizeBody(row.body);
  for (const p of ordered(parts)) {
    if (!['admin', 'bot'].includes((p.author || {}).type) || !['comment', 'open'].includes(p.part_type)) continue;
    const b = approved.normalizeBody(plain(p.body));
    if (!b) continue;
    if (b.includes(target) || (target.includes(b) && b.length >= 24)) return true;
    if (tags.has('stopLossMandatory') && /stop\s*-?\s*loss/i.test(b) && /not\s+mandatory/i.test(b)) return true;
    if (tags.has('holdingTime') && /(?:3\s*minutes?|30\s*seconds?)/i.test(b) && /hold/i.test(b)) return true;
    if (tags.has('dailyLoss') && /daily\s*loss/i.test(b) && /\d+(?:\.\d+)?\s*%/.test(b)) return true;
  }
  return false;
}

function bodyAlreadySent(cid, contentHash, parts, answerId) {
  const all = load();
  if (
    Object.values(all).some(
      (r) =>
        String(r.cid) === String(cid) &&
        publicRecordKinds(r) &&
        ['pending', 'unknown', 'confirmed'].includes(r.status) &&
        (r.contentHash === contentHash ||
          r.bodyHash === contentHash ||
          (r.coreHashes || []).includes(contentHash) ||
          r.answerId === answerId ||
          (Array.isArray(r.answerIds) && r.answerIds.includes(answerId)))
    )
  )
    return true;
  return priorPublicCoversAnswer(parts, answerId);
}

async function reconcile(cid, full, parts, d) {
  const all = load();
  let changed = false;
  for (const [key, r] of Object.entries(all)) {
    if (String(r.cid) !== String(cid) || !publicRecordKinds(r) || !['pending', 'unknown'].includes(r.status)) continue;
    const found = deliveryRecovery.examine(r, full, parts, d);
    if (found.status !== r.status || found.receiptIds) {
      save(key, { ...r, ...found, reconciledUTC: new Date().toISOString() });
      changed = true;
    }
  }
  return changed;
}

function linkReceipt(cid, kind, body, added) {
  if (kind !== 'comment' || !added || !added.length) return;
  const s = current(cid);
  if (!s || !s.plan) return;
  const rec = load()[s.plan.key];
  if (!rec) return;
  const ids = added.map((p) => String(p.id)).filter(Boolean);
  if (!ids.length) return;
  const transportBodyHash = hash(body);
  save(s.plan.key, {
    ...rec,
    receiptIds: ids,
    receiptProof: { operationId: s.plan.key, bodyHash: transportBodyHash, transportBodyHash, receiptId: ids[0] },
    transportBodyHash,
  });
}

function isQuestionLike(s) {
  const t = String(s || '');
  return (
    /[?]/.test(t) ||
    /\uFF1F|\u061F|\u00BF/.test(t) ||
    /でしょうか|ですか|ますか/.test(t) ||
    /^(?:what|how|why|when|where|which|who|can|could|do|does|did|is|are|am|will|would|should|may|might)\b/i.test(t.trim()) ||
    /\b(?:please\s+)?(?:confirm|clarify|explain|tell\s+me)\b/i.test(t)
  );
}
function splitCandidateAsks(text) {
  const raw = String(text || '');
  const parts = raw
    .split(/(?<=[?\uFF1F\u061F])\s+|(?<=でしょうか[。．!]*)\s+|(?<=ですか[。．!]*)\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [raw.trim()].filter(Boolean);
}
function hasNonLatin(text) {
  return /[^\u0000-\u007f]/.test(String(text || ''));
}

function moduleGateList(d) {
  const g = typeof d.moduleGates === 'function' ? d.moduleGates() : d.moduleGates;
  return Array.isArray(g) ? g : [];
}

function safeBool(fn, onThrow) {
  try {
    return !!fn();
  } catch (_) {
    return onThrow;
  }
}

/**
 * Module scope (Packs / Atom). Runs for an unowned conversation, after the ownership, control,
 * fin-wait and human-request checks and BEFORE intent classification, the selection probe, the
 * mixed-turn route and every later fallback, so none of them can answer a module-specific ask.
 *
 * A turn is module-specific when the whole text or any clause is claimed by a module detector
 * (a detector that throws counts as a claim). The claiming clause must itself be English:
 *   - clause English  -> OFF module: terminal silent 'module-off-fail-closed' (also for a mixed turn:
 *                        a general or backend clause in the same turn is not answered separately);
 *                        ON module (isolated test config only): the module's own selector is
 *                        consulted with the shared gate; delivery of a module answer is not wired
 *                        (extra-catalog loading is blocked), so the turn is terminal silent as well.
 *   - clause uncertain + module OFF -> terminal silent 'language-uncertain-module-off'.
 *     OWNER-REVIEWABLE DEFAULT (t739 r1, F1-8): when a detector claims the turn and its flag is
 *     OFF, missing English evidence must not fall through to the main LLM. A bare module term
 *     ("Elite Packs?", "Atom funded profitable days requirement?") stays uncertain. A short
 *     question that is clearly English ("Are Elite Packs refundable?") is English and takes
 *     the module-off path instead.
 *   - clause uncertain + module ON -> non-terminal 'language-uncertain-module-off' (the flag is
 *     on; this default does not apply).
 *   - clause non-English -> not claimed (non-English main route unchanged).
 */
async function modulePlan(full, user, d, text, row, topic, entity) {
  const cid = String((full && full.id) || '');
  const answerIds = [row.id];
  const contentHashes = [row.contentHash];
  const questionHash = hash(text);
  const intentKey = hash(row.id);
  const turnId = String((user && user.id) || 'source');
  const key = hash(cid + '\n' + turnId + '\n' + hash(user && user.body) + '\n' + questionHash + '\n' + intentKey);
  let ownedNow = { blocked: false };
  try { ownedNow = d.ownership(full, d.parts(full)); } catch (_) { ownedNow = { blocked: false }; }
  return {
    plan: Object.freeze({
      cid,
      turnId,
      rawHash: hash(user && user.body),
      questionHash,
      intentKey,
      key,
      faq: Object.freeze([text]),
      answerIds: Object.freeze(answerIds),
      contentHashes: Object.freeze(contentHashes),
      selections: Object.freeze([Object.freeze({ answerId: row.id, contentHash: row.contentHash, confidence: 1, query: text })]),
      backend: Object.freeze([]),
      user,
      ownership: ownedNow,
      team: full.team_assignee_id || null,
      admin: full.admin_assignee_id || null,
      expiresAt: Date.now() + 120000,
      topic: topic || 'conversation.user.replied',
    }),
    reason: 'module-send',
    terminal: true,
    module: entity || null,
  };
}

async function moduleScope(text, parts, d, full, user, topic) {
  let router;
  try {
    router = require('./publicRouter');
  } catch (_) {
    return { reason: 'module-select-unavailable', terminal: true };
  }
  const routed = await router.route({
    text,
    prior: priorClientTexts(parts),
    conversationId: full && full.id,
    eventId: user && user.id,
  });
  if (!routed || (routed.mainRoute && !routed.terminal)) return null;
  if (routed.send && routed.decide && routed.decide.action === 'SEND' && routed.decide.partId) {
    const row = approved.get(routed.decide.partId);
    if (!row || row.sendable === false) return { reason: 'NON_SENDABLE', terminal: true, module: routed.entity || null };
    return modulePlan(full, user, d, text, row, topic, routed.entity || null);
  }
  return { reason: routed.reason || 'module-off-fail-closed', terminal: !!routed.terminal, module: routed.entity || null };
}

async function prepare(full, parts, topic, d) {
  const cid = String((full && full.id) || '');
  let reason = ownershipFailClosed(full, parts, d) || controls(cid, full, d) || historyCheck(full, parts, d);
  if (reason) return { reason, terminal: prepareTerminalReason(reason) };

  const user = latest(full, parts);
  if (!user || !user.body || !user.id) return { reason: 'no-customer-turn', terminal: true };
  const text = plain(user.body);
  if (!text) return { reason: 'no-current-customer-text', terminal: true };
  if (d.finWait(full, text, topic)) return { reason: 'fin-wait' };
  if (d.humanRequest(text)) return { reason: 'customer-human-request' };

  const ownedNow = d.ownership(full, parts);
  const humanOwns = !!(ownedNow.blocked || (full.team_assignee_id && String(full.team_assignee_id) !== '0'));
  if (!humanOwns) {
    const scoped = await moduleScope(text, parts, d, full, user, topic);
    if (scoped) return scoped;
  }

  const decision = typeof d.intent === 'function' ? d.intent(text, parts) : null;
  if (!decision) return { reason: 'intent-unavailable' };
  const asciiOnly = !hasNonLatin(text);
  if (asciiOnly && ['smalltalk', 'support-meta', 'personal', 'contentless', 'out-of-scope', 'human-request'].includes(decision.kind))
    return { reason: 'not-current-faq-intent' };

  const extracted = units.extractAsks([{ role: 'client', text }]);
  if (asciiOnly && decision.accountContext && !(extracted.burst || []).some((a) => a.kind === 'question' && !d.backend(a.text) && d.general(a.text)))
    return { reason: 'active-account-follow-up' };

  const clauses = splitCandidateAsks(text);
  const explicit = (extracted.burst || []).filter((a) => a.kind === 'question').map((a) => a.text);
  const askPool = [
    ...new Set([...explicit, ...(!explicit.length ? clauses.filter(isQuestionLike) : []), ...(!explicit.length && !hasNonLatin(text) ? decision.asks || [] : [])]),
  ];

  const payoutThread = payoutBackendThreadActive(parts);
  const isBackendAsk = (q) => d.backend(q) || (humanOwns && selectMod.payoutConsistencyAsk(q)) || selectMod.accountStatusAsk(q);

  let faq = askPool.filter((q) => !isBackendAsk(q) && (d.general(q) || !asciiOnly));
  let backend = [...new Set([...askPool, ...clauses].filter((q) => isBackendAsk(q)))];

  // MIXED_AWAITING_ANSWER_V1: on an unowned open escalation, a turn that mixes a general FAQ
  // ask with a backend follow-up must use the legacy mixed route (general slice only). FAQ V12
  // must not short-circuit that path with an approved-answer send.
  if (backend.length > 0 && faq.length > 0 && !humanOwns) {
    return { reason: 'mixed-unowned-escalation', terminal: false };
  }

  const requireOwnerApproved = d.requireOwnerApprovedAnswers !== false;
  const selectOptsBase = {
    humanOwns,
    priorClientTexts: priorClientTexts(parts),
    turnText: text,
    requireOwnerApproved,
    modelClassify: d.selectAnswer || d.modelClassifyAnswer,
    classifyTimeoutMs: d.selectAnswerTimeoutMs,
  };

  // Multilingual / short asks: still allow selection even when general() is false.
  if (!faq.length && !backend.length) {
    const selProbe = await selectMod.selectApprovedAnswer(text, selectOptsBase);
    if (!selProbe.abstain) faq = [text];
  }
  if (!faq.length && askPool.length && !backend.length) {
    // Keep original ask text for selector when general() filtered everything but cues exist.
    const selProbe = await selectMod.selectApprovedAnswer(text, selectOptsBase);
    if (!selProbe.abstain) faq = [text];
  }
  if (!faq.length) {
    let terminal = false;
    try {
      const f1 = require('./f1AbstainMark');
      const boundary = require('./publicWriteBoundary');
      const turn = boundary.currentTurn() || {};
      if (f1.blocksConversation(cid) || turn.publicSilence || turn.inboundCredential) terminal = true;
      else {
        const routed = await require('./publicRouter').route({
          text, prior: priorClientTexts(parts), conversationId: cid, eventId: user && user.id,
        });
        terminal = !!(routed && routed.f1 && routed.terminal && !routed.send);
      }
    } catch (_) {
      terminal = false;
    }
    return { reason: 'no-isolatable-faq', terminal };
  }

  if (!ownedNow.blocked && (!full.team_assignee_id || String(full.team_assignee_id) === '0') && !backend.length)
    return { reason: 'existing-unowned-faq-path' };

  const priorTexts = priorClientTexts(parts);
  const selections = [];
  for (const q of faq) {
    if (selectMod.accountStatusAsk(q)) return { reason: 'account-status-boundary', terminal: true };
    const sel = await selectMod.selectApprovedAnswer(q, {
      ...selectOptsBase,
      priorClientTexts: priorTexts,
    });
    if (sel.abstain) {
      // If mixed with backend, still allow backend coordination without FAQ.
      if (backend.length) continue;
      const abstainReason = sel.reason || 'unsupported-question-scope';
      return { reason: abstainReason, terminal: prepareTerminalReason(abstainReason) };
    }
    if (!optionBFaqAllowed(sel.answerId, { humanOwns, payoutThread, backendInTurn: backend.length > 0 })) {
      if (backend.length) continue;
      return { reason: 'backend-adjacent-faq-silence', terminal: false };
    }
    if (ledgerAnswerHit(cid, sel.answerId) || bodyAlreadySent(cid, sel.contentHash, parts, sel.answerId)) {
      continue; // semantic duplicate by approved answer id
    }
    selections.push({ query: q, ...sel });
  }
  if (!selections.length) return { reason: 'current-faq-already-answered', terminal: backend.length === 0 };

  const answerIds = selections.map((s) => s.answerId);
  const contentHashes = selections.map((s) => s.contentHash);
  const questionHash = hash(selections.map((s) => s.query).join('\n'));
  const intentKey = hash(answerIds.slice().sort().join('\n'));
  const turnId = String(user.id || 'source');
  const key = hash(cid + '\n' + turnId + '\n' + hash(user.body) + '\n' + questionHash + '\n' + intentKey);

  await reconcile(cid, full, parts, d);
  const records = load(),
    prior = records[key];
  const planProbe = { turnId, questionHash, intentKey, faq: selections.map((s) => s.query), answerIds };
  if (
    Object.values(records).some(
      (r) =>
        r.cid === cid &&
        publicRecordKinds(r) &&
        ['pending', 'unknown'].includes(r.status) &&
        (deliveryRecovery.conflicts(r, planProbe) || (r.answerIds || []).some((id) => answerIds.includes(id)))
    )
  )
    return { reason: 'durable-unresolved-question', terminal: true };
  if (prior && ['pending', 'unknown', 'confirmed'].includes(prior.status)) return { reason: 'durable-' + prior.status, terminal: true };

  return {
    plan: Object.freeze({
      cid,
      turnId,
      rawHash: hash(user.body),
      questionHash,
      intentKey,
      key,
      faq: Object.freeze(selections.map((s) => s.query)),
      answerIds: Object.freeze(answerIds),
      contentHashes: Object.freeze(contentHashes),
      selections: Object.freeze(selections.map((s) => Object.freeze({ answerId: s.answerId, contentHash: s.contentHash, confidence: s.confidence, query: s.query }))),
      backend: Object.freeze(backend),
      user,
      ownership: ownedNow,
      team: full.team_assignee_id || null,
      admin: full.admin_assignee_id || null,
      expiresAt: Date.now() + 120000,
      topic,
    }),
    reason: 'eligible-informational-faq',
  };
}

function priorClientTexts(parts) {
  return ordered(parts || [])
    .filter((p) => ['user', 'lead'].includes((p.author || {}).type) && plain(p.body))
    .map((p) => plain(p.body));
}

async function recheck(s, d) {
  let full;
  try {
    full = await d.fetch(s.plan.cid);
  } catch (_) {
    return { reason: 'fresh-get-failed' };
  }
  const parts = full && d.parts(full);
  let reason = ownershipFailClosed(full, parts, d) || controls(s.plan.cid, full, d) || historyCheck(full, parts, d);
  if (reason) return { reason };
  const user = latest(full, parts);
  if (!user || String(user.id || 'source') !== s.plan.turnId || hash(user.body) !== s.plan.rawHash) return { reason: 'superseded-customer-turn' };
  if (typeof d.consequentialFreshnessBlock === 'function') {
    try {
      const blk = d.consequentialFreshnessBlock(full, parts, s.plan, user);
      if (blk && blk.block) return { reason: blk.reason || 'stale-teammate-takeover' };
    } catch (_) {
      return { reason: 'freshness-check-unavailable' };
    }
  }
  if (Date.now() > s.plan.expiresAt) return { reason: 'faq-permit-expired' };
  if (d.finWait(full, plain(user.body), s.plan.topic)) return { reason: 'fin-wait' };
  // Duplicate by answer id since plan was built.
  for (const id of s.plan.answerIds) {
    if (ledgerAnswerHit(s.plan.cid, id, s.plan.key)) return { reason: 'newer-answer-to-current-faq' };
  }
  return { full, parts };
}

async function publicPermission(cid, body, d, snapshot) {
  const s = current(cid);
  if (!s) return null;
  if (hash(body) !== s.approvedBodyHash) return { ok: false, skipped: true, reason: 'faq-body-not-validator-approved' };
  const check = await recheck(s, d);
  if (check.reason) {
    recover(check.reason, d);
    log(cid, check.reason);
    return { ok: false, skipped: true, reason: check.reason };
  }
  const gated = await outboundSafety.gateFinalOutbound(body, { answerIds: s.plan.answerIds });
  if (!gated.ok) {
    log(cid, 'outbound-allowlist-blocked', { reason: gated.reason });
    return { ok: false, skipped: true, reason: 'outbound-allowlist-blocked' };
  }
  if (hash(gated.body) !== s.approvedBodyHash) {
    log(cid, 'outbound-allowlist-body-changed');
    return { ok: false, skipped: true, reason: 'outbound-allowlist-body-changed' };
  }
  s.previousIds = check.parts.map((p) => String(p.id));
  if (snapshot) snapshot.parts = check.parts;
  return { allowed: true };
}

/** V12: no free-text scope strip — identity/escalation promises simply fail allowlist. */
function faqBodyScope(body) {
  return { body: String(body || ''), removed: 0 };
}

function buildApprovedBody(plan, d, backend) {
  const chunks = [];
  for (const id of plan.answerIds) {
    const row = approved.get(id);
    if (!row) return null;
    chunks.push(row.body);
  }
  let body = chunks.join('\n\n');
  const caveat = plan.backend.length ? d.backendCaveat(backend) : '';
  if (caveat) {
    // Caveat must be one of the allowlisted templates.
    const templates = [
      approved.template('backendCaveatExistingHuman'),
      approved.template('backendCaveatConfirmed'),
      approved.template('backendCaveatIdentity'),
      approved.template('backendCaveatDefault'),
    ];
    const ok = templates.some((t) => approved.normalizeBody(t) === approved.normalizeBody(caveat));
    if (!ok) {
      // Fall back to default allowlisted caveat rather than shipping free text.
      body += '\n\n' + approved.template('backendCaveatDefault');
    } else body += '\n\n' + caveat;
  }
  return body;
}

async function execute(plan, full, parts, d, preparedDraft, validationProof, recovery = 0) {
  const s = { plan, approvedBodyHash: null, outcome: null, episode: d.begin(plan.cid, plan.turnId) };
  return scope.run(s, async () => {
    // SELECT-ONLY: ignore model free-text drafts for factual content.
    // preparedDraft is accepted only when it allowlist-equals the approved composition.
    let backend = { status: 'not-needed' };
    if (plan.backend.length) {
      backend = await scope.exit(async () => {
        const key = 'backend:' + plan.key,
          all = load(),
          prior = all[key];
        if (d.ownership(full, parts).blocked || (full.team_assignee_id && String(full.team_assignee_id) !== '0')) return { status: 'existing-human' };
        if (Object.values(all).some((r) => r.cid === plan.cid && r.kind === 'backend' && ['pending', 'unknown'].includes(r.status))) return { status: 'unknown' };
        if (prior && prior.status === 'confirmed') return { status: 'confirmed' };
        return backendScope.run({ plan, d, key }, async () => {
          const result = await d.coordinateBackend(plan, full, parts);
          if (load()[key] || ['unknown', 'confirmed', 'note-only'].includes(result.status))
            save(key, {
              status: ['unknown', 'note-only'].includes(result.status) ? 'unknown' : result.status === 'confirmed' ? 'confirmed' : 'rejected',
              cid: plan.cid,
              turnId: plan.turnId,
              questionHash: plan.questionHash,
              kind: 'backend',
            });
          return result;
        });
      });
    }

    let core = buildApprovedBody(plan, d, backend);
    if (!core) {
      log(plan.cid, 'approved-answer-missing');
      return { handled: true, reason: 'approved-answer-missing' };
    }

    if (preparedDraft) {
      const draftNorm = approved.normalizeBody(plain(preparedDraft));
      const coreNorm = approved.normalizeBody(core);
      // Adopt only when draft is already an allowlisted composition (no new facts).
      const adoptCheck = approved.assertAllowlistedFinal(draftNorm, plan.answerIds);
      if (adoptCheck.ok && (draftNorm === coreNorm || draftNorm.includes(approved.get(plan.answerIds[0]).body))) {
        log(plan.cid, 'adopt-validation', { passed: true, mode: 'allowlist' });
      } else {
        log(plan.cid, 'adopt-ignored-free-text', { passed: false });
        // Keep approved core; do not use free-text draft.
      }
    }

    const check = await recheck(s, d);
    if (check.reason) {
      recover(check.reason, d);
      if (check.reason === 'currently-closed') {
        console.log('SKIP send-boundary closed-during-send', plan.cid);
      }
      log(plan.cid, check.reason);
      return { handled: true, reason: check.reason };
    }

    // V12: approved bodies must not pass postProcessModelReply (mutates allowlisted caveat punctuation).
    // An exact catalog body is already the approved text. Screening it can drop a
    // sentence and then fail the allowlist. Only non-exact compositions are screened.
    const exactBody = approved.assertAllowlistedFinal(approved.normalizeBody(core), plan.answerIds);
    const screened = exactBody.ok && exactBody.reason === 'exact'
      ? { ok: true, body: core, removed: [] }
      : d.screen(core);
    if (!screened.ok || !screened.body) {
      log(plan.cid, 'final-public-screen-held');
      return { handled: true, reason: 'final-public-screen-held' };
    }

    const gated = await outboundSafety.gateFinalOutbound(screened.body, { answerIds: plan.answerIds });
    if (!gated.ok || !gated.body) {
      log(plan.cid, 'outbound-allowlist-blocked', { reason: gated.reason });
      return { handled: true, reason: 'outbound-allowlist-blocked' };
    }

    const body = gated.body;
    s.approvedBodyHash = hash(body);
    s.approvedBody = body;
    const previousIds = (check.parts || parts).map((p) => String(p.id));
    const transportBody = d.publicHtml ? d.publicHtml(body) : body;
    save(plan.key, {
      status: 'pending',
      cid: plan.cid,
      turnId: plan.turnId,
      questionHash: plan.questionHash,
      intentKey: plan.intentKey,
      answerId: plan.answerIds[0],
      answerIds: plan.answerIds.slice(),
      contentHash: plan.contentHashes[0],
      coreHashes: plan.contentHashes.slice(),
      bodyHash: hash(body),
      transportBodyHash: hash(transportBody),
      body,
      operationId: plan.key,
      faqQueries: plan.faq.slice(),
      previousIds,
      attemptedAtSec: Math.floor(Date.now() / 1000),
      kind: 'faq',
    });
    try {
      const boundary = require('./publicWriteBoundary');
      const { normalizeForRoute } = require('./routeNormalizer');
      const q = (plan.faq && plan.faq[0]) || '';
      const cur = boundary.currentTurn();
      if (!cur || !cur.normalized) {
        boundary.bindTurn({
          ...(cur || {}),
          normalized: normalizeForRoute(q),
          text: q,
          conversationId: String(plan.cid || ''),
        });
      }
    } catch (_) {}
    try {
      const routed = await require('./publicRouter').route({
        text: (plan.faq && plan.faq[0]) || '',
        prior: [],
        conversationId: plan.cid,
        eventId: plan.turnId,
      });
      if (routed && (routed.f1 || routed.suppressPublicComposition || (routed.terminal && !routed.send))) {
        log(plan.cid, routed.reason || 'protected-abstain');
        return { handled: true, reason: routed.reason || 'protected-abstain' };
      }
    } catch (_) {
      let protectedLook = false;
      try {
        const boundary = require('./publicWriteBoundary');
        const sample = (plan.faq && plan.faq[0]) || '';
        protectedLook = boundary.moduleTurnProtected(sample) || !!(boundary.currentTurn() && (boundary.currentTurn().inboundCredential || boundary.currentTurn().publicSilence));
      } catch (_) { protectedLook = true; }
      if (protectedLook) {
        log(plan.cid, 'protected-abstain-unavailable');
        return { handled: true, reason: 'protected-abstain-unavailable' };
      }
    }
    const result = await d.send(plan.cid, body, 'faq:' + plan.turnId + ':' + plan.questionHash);
    const confirmed = result && result.ok && !result.skipped && !result.unknown ? d.confirmed(result, body, previousIds) : [];
    const status =
      confirmed.length === 1
        ? 'confirmed'
        : result && (result.unknown || (result.ok && !result.skipped))
          ? 'unknown'
          : result && result.skipped && ['fresh-get-failed', 'control-unavailable', 'evidence-retrieval-failed'].includes(result.reason)
            ? 'rejected'
            : 'rejected';
    save(plan.key, {
      ...load()[plan.key],
      status,
      cid: plan.cid,
      turnId: plan.turnId,
      questionHash: plan.questionHash,
      intentKey: plan.intentKey,
      answerId: plan.answerIds[0],
      answerIds: plan.answerIds.slice(),
      bodyHash: hash(body),
      receiptIds: confirmed.map((p) => p.id),
      reason: (result && result.reason) || '',
      backendStatus: backend.status,
      kind: 'faq',
    });
    log(plan.cid, status, {
      turnId: plan.turnId,
      questionHash: plan.questionHash,
      intentKey: plan.intentKey,
      answerIds: plan.answerIds,
      receiptIds: confirmed.map((p) => p.id),
      backendStatus: backend.status,
    });
    if (status === 'unknown') {
      let fresh;
      try {
        fresh = await d.fetch(plan.cid);
      } catch (_) {
        fresh = null;
      }
      if (fresh) await scope.exit(() => reconcile(plan.cid, fresh, d.parts(fresh), d));
    }
    return { handled: true, reason: status, result, backend };
  });
}

async function adopt(full, parts, user, body, d, validationProof) {
  const p = await prepare(full, parts, 'conversation.user.replied', d);
  if (!p.plan || p.plan.turnId !== String((user && user.id) || 'source') || p.plan.rawHash !== hash(user && user.body))
    return { handled: true, reason: p.reason || 'draft-turn-mismatch' };
  return execute(p.plan, full, parts, d, body, validationProof);
}

function finishPrepareWithoutPlan(cid, p, d) {
  recover(p.reason, d);
  if (p.reason === 'currently-closed') {
    console.log('SKIP send-boundary closed-during-send', cid);
  }
  log(cid, p.reason);
  if (!p.terminal) return null;
  if (shouldDeferToMainPath(p.reason)) return null;
  return { handled: true, reason: p.reason };
}

async function offer(full, parts, topic, d, opts) {
  opts = opts || {};
  const cid = String(full.id),
    before = locks.get(cid) || Promise.resolve();
  const work = before.catch(() => {}).then(async () => {
    try {
      const p = await prepare(full, parts, topic, d);
      if (!p.plan) {
        const out = finishPrepareWithoutPlan(cid, p, d);
        if (
          !out &&
          opts.deferExecuteIfHumanOwned &&
          approvedSelectAbstainFallthrough(p.reason)
        ) {
          let owned;
          try {
            owned = d.ownership(full, parts);
          } catch (_) {
            owned = null;
          }
          if (owned && owned.blocked && owned.reason === 'human-history-owned') {
            const scope = typeof d.teammateScopeOpts === 'function' ? d.teammateScopeOpts() : d.teammateScopeOpts || {};
            const arsalId = String(scope.arsalId || '');
            const admin = full.admin_assignee_id != null ? String(full.admin_assignee_id) : '';
            const lunaSeat = !admin || admin === '0' || (arsalId && admin === arsalId);
            if (lunaSeat) {
              return { handled: false, allowPastOwnershipForLegacyFaq: true, reason: p.reason };
            }
          }
        }
        return out;
      }
      if (opts.deferExecuteIfHumanOwned) {
        let owned;
        try {
          owned = d.ownership(full, parts);
        } catch (_) {
          return finishPrepareWithoutPlan(cid, { reason: 'ownership-evidence-unavailable', terminal: true }, d);
        }
        if (owned.blocked) return { handled: false, deferred: true, prepare: p, reason: 'deferred-human-owned-faq' };
      }
      return await execute(p.plan, full, parts, d);
    } catch (e) {
      log(cid, 'faq-fail-closed', { errorClass: e.name });
      return { handled: true, reason: 'faq-fail-closed' };
    } finally {
      d.end(cid);
    }
  });
  const settled = work.then(
    () => {},
    () => {}
  );
  locks.set(cid, settled);
  settled.then(() => {
    if (locks.get(cid) === settled) locks.delete(cid);
  });
  return work;
}

function recover(reason, d) {
  if (
    ['fresh-get-failed', 'evidence-retrieval-failed', 'faq-evidence-unavailable', 'authoritative-history-unavailable', 'ownership-evidence-unavailable', 'control-unavailable', 'partially-answered-faq'].includes(
      reason
    ) &&
    d.recover
  )
    d.recover(reason);
}

function negativeAutomationInstruction(text) {
  const words =
    String(text)
      .toLowerCase()
      .replace(/[’']/g, "'")
      .match(/[a-z]+(?:'[a-z]+)?/g) || [];
  const neg = new Set(['not', "don't", 'never', 'no', 'stop', 'pause', 'disable']),
    act = new Set(['reply', 'replies', 'respond', 'response', 'responses', 'answer', 'answers', 'send', 'post', 'write', 'automation', 'automated']);
  const targeted = words.some((w) => ['luna', 'bot', 'ai', 'automatic', 'automated', 'automation'].includes(w));
  return words.some(
    (w, i) =>
      neg.has(w) &&
      words.slice(i + 1, i + 6).some((a) => act.has(a)) &&
      (targeted || words.slice(i + 1, i + 3).some((a) => ['reply', 'replies', 'respond', 'responses'].includes(a)))
  );
}

async function backendPermission(cid, kind) {
  const b = backendScope.getStore();
  if (!b || b.plan.cid !== String(cid)) return null;
  const veto = privilegedVeto(cid, kind);
  if (veto) return veto;
  const d = b.d;
  let full;
  try {
    full = await d.fetch(cid);
  } catch (_) {
    return { ok: false, skipped: true, reason: 'backend-source-unavailable' };
  }
  const parts = full && d.parts(full),
    reason = controls(cid, full, d) || historyCheck(full, parts, d) || ownershipFailClosed(full, parts, d);
  if (reason) return { ok: false, skipped: true, reason };
  const u = latest(full, parts);
  if (!u || String(u.id || 'source') !== b.plan.turnId || hash(u.body) !== b.plan.rawHash) return { ok: false, skipped: true, reason: 'backend-turn-superseded' };
  if (d.ownership(full, parts).blocked || (full.team_assignee_id && String(full.team_assignee_id) !== '0'))
    return { ok: false, skipped: true, reason: 'backend-now-human-owned' };
  if (Date.now() > b.plan.expiresAt) return { ok: false, skipped: true, reason: 'backend-authorization-expired' };
  save(b.key, { status: 'pending', cid: b.plan.cid, turnId: b.plan.turnId, questionHash: b.plan.questionHash, kind: 'backend' });
  return null;
}

// Compatibility shims for older tests / probes.
function concepts() {
  return [];
}
function grounded() {
  return true;
}
function answered() {
  return false;
}
function bridgeTopics() {
  return { faq: [], assurances: [] };
}
function intentKeyFor(q) {
  return hash(String(q || ''));
}
function riskEscalationsBlock(full, d) {
  return ownershipFailClosed(full, [], d);
}

module.exports = {
  faqBodyScope,
  currentContent,
  concepts,
  grounded,
  answered,
  adopt,
  offer,
  current,
  publicPermission,
  privilegedVeto,
  hash,
  load,
  prepare,
  execute,
  recheck,
  backendPermission,
  reconcile,
  recoveryActive,
  linkReceipt,
  bridgeTopics,
  intentKeyFor,
  riskEscalationsBlock,
  ownershipFailClosed,
  outboundSafety,
  approved,
  selectMod,
  shouldDeferToMainPath,
  finishPrepareWithoutPlan,
  payoutBackendThreadActive,
  optionBFaqAllowed,
};
