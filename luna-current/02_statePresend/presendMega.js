'use strict';

/**
 * presendMega.js - Phase 2. One orchestrated pre-send quality gate.
 *
 * validate(draft, ctx) -> { ok, hardFails[], softWarnings[], correctionInstruction, route }
 *
 * ctx = {
 *   state,            // conversationState.buildState() output
 *   messages,         // normalised messages (for support text)
 *   knowledge,        // knowledgeGapGate.classify() output or raw results (optional)
 *   route,            // 'FAST' | 'FULL' (FAST runs the cheap subset)
 *   guards,           // { imageAskGuard, spreadAskGate } existing live modules (reused, never re-implemented)
 *   conversationId,
 *   forbiddenPatterns // extra RegExp[] (e.g. existing MT5/platform lock) applied to new drafts
 * }
 *
 * Hard fails block/regenerate. Soft warnings never block.
 */

const T = require('./textUtils');
const gap = require('./knowledgeGapGate');
const clarify = require('./clarificationNeedTighten');
const multiAsk = require('./multiAskCompleteness');
const policyEvidence = require('./policyEvidence');
const { isRepeatedClientQuestion, nearCopiedWording } = require('../repeatedClientQuestion');

const HARD = {
  REPEATED_QUESTION: 'REPEATED_QUESTION',
  ALREADY_COLLECTED_INFO_REQUEST: 'ALREADY_COLLECTED_INFO_REQUEST',
  DUPLICATE_REPLY: 'DUPLICATE_REPLY',
  SEMANTIC_REPEAT: 'SEMANTIC_REPEAT',
  MISSED_QUESTION: 'MISSED_QUESTION',
  UNSUPPORTED_FACT: 'UNSUPPORTED_FACT',
  UNSUPPORTED_NUMBER: 'UNSUPPORTED_NUMBER',
  UNSUPPORTED_PROMISE: 'UNSUPPORTED_PROMISE',
  HUMAN_CONTRADICTION: 'HUMAN_CONTRADICTION',
  CONVERSATION_CONTRADICTION: 'CONVERSATION_CONTRADICTION',
  INTERNAL_INFO_LEAK: 'INTERNAL_INFO_LEAK',
  WRONG_TOPIC: 'WRONG_TOPIC',
  UNNECESSARY_ESCALATION: 'UNNECESSARY_ESCALATION',
  UNNECESSARY_CLARIFICATION: 'UNNECESSARY_CLARIFICATION',
  KNOWLEDGE_GAP_UNSAFE: 'KNOWLEDGE_GAP_UNSAFE',
  FORBIDDEN_FORMAT_OR_CONTENT: 'FORBIDDEN_FORMAT_OR_CONTENT',
  FORBIDDEN_DIAGNOSTIC_ACTION: 'FORBIDDEN_DIAGNOSTIC_ACTION',
  REPEATED_IMAGE_ASK: 'REPEATED_IMAGE_ASK',
  MISSED_ESCALATION: 'MISSED_ESCALATION',
  IMAGE_UNAVAILABLE_CLAIM: 'IMAGE_UNAVAILABLE_CLAIM',
  EMPTY_REPLY: 'EMPTY_REPLY',
};

const SOFT = {
  TOO_LONG: 'TOO_LONG',
  GENERIC_WORDING: 'GENERIC_WORDING',
  MINOR_REDUNDANCY: 'MINOR_REDUNDANCY',
  FORMATTING: 'FORMATTING',
  TONE: 'TONE',
  MANY_QUESTIONS: 'MANY_QUESTIONS',
  UNAUDITED_FACTS: 'UNAUDITED_FACTS',
};

const LEAK_RES = [
  /\b(?:internal note|system prompt|as an ai|language model|my instructions|presend|pre-send|reason code|hard fail|soft warning|state machine|IMAGE_IN|SPREAD_TEST_REPLY|escalateRelatedOnly|identityEscalateGates|softEdges|imageAskGuard|spreadAskGate|get_state|search_knowledge)\b/i,
  /```/,
  /"(?:active_issue|known_details|pending_questions|hardFails)"\s*:/,
  /\b(?:admin portal|backend shows|according to our database|our crm)\b/i,
];

const GENERIC_RES = [
  /\bthank you for reaching out\b/i,
  /\bwe apologize for any inconvenience\b/i,
  /\bplease do not hesitate to\b/i,
  /\bi understand your (?:concern|frustration)\b/i,
  /\bas per our policy\b/i,
  /\bwe value your (?:business|patience)\b/i,
];

const CLIENT_WANTS_HUMAN_RE = /\b(?:speak\s+(?:to|with)\s+(?:a\s+|an\s+|my\s+)?(?:human|agent|person|advisor|manager|supervisor)|(?:talk|chat)\s+(?:to|with)\s+(?:a\s+|an\s+|my\s+)?(?:human|agent|person|manager|supervisor)|live\s*agent|real\s*(?:person|human|agent)|connect(?:\s+me)?\s+(?:to|with)\s+(?:a\s+|an\s+|my\s+)?(?:human|agent|person|manager|supervisor)|(?:need|want)\s+(?:a\s+)?(?:live\s*)?(?:agent|human)|(?:manager|supervisor)\s+please|human\s+support|agent\s+please|chargeback|\blegal\b|\bcomplaint\b)\b/i;

// Same as CLIENT_WANTS_HUMAN_RE minus the bare `real (person|human|agent)`
// alternative, which also fires on "are you a real person?" — a question about what
// Luna IS, not a request for a teammate. Used below to tell the two apart.
const EXPLICIT_HUMAN_REQUEST_RE = /\b(?:speak\s+(?:to|with)\s+(?:a\s+|an\s+|my\s+)?(?:human|agent|person|advisor|manager|supervisor)|(?:talk|chat)\s+(?:to|with)\s+(?:a\s+|an\s+|my\s+)?(?:human|agent|person|manager|supervisor)|live\s*agent|connect(?:\s+me)?\s+(?:to|with)\s+(?:a\s+|an\s+|my\s+)?(?:human|agent|person|manager|supervisor)|(?:need|want)\s+(?:a\s+)?(?:live\s*)?(?:agent|human)|(?:manager|supervisor)\s+please|human\s+support|agent\s+please|chargeback|\blegal\b|\bcomplaint\b)\b/i;

// Reuse the live identity guard rather than a second copy of its patterns. Loaded
// defensively so statePresend keeps working standalone if it is ever used without
// the root modules.
let __identityGuard = null;
try { __identityGuard = require('../assistantIdentityGuard'); } catch (_) { __identityGuard = null; }
function isIdentityQuestion(text) {
  try {
    return !!(__identityGuard && __identityGuard.isDirectIdentityQuestion(text));
  } catch (_) {
    return false;
  }
}

const ESCALATION_DRAFT_RE = /\b(?:i(?:'ve| have)? (?:passed|forwarded|escalated|raised) (?:this|it|your (?:case|request|issue))|our team will (?:review|check|look into|get back)|escalat(?:e|ed|ing) (?:this|it|your)|handing (?:this )?over to (?:the )?team)\b/i;
const DRAFT_HANDOFF_RE = /\b(?:i(?:'ve| have)? (?:passed|forwarded|escalated|raised|assigned|transferred)|(?:connecting|transferr?ing) you|a (?:teammate|human|specialist|manager|supervisor) will|hand(?:ing)? (?:this |you )?over|escalat(?:e|ed|ing)|assigned (?:this |your )?(?:case|ticket)?\s*to|our (?:team|teammate) will)\b/i;

const CONTRADICTION_PAIRS = [
  { fact: 'account_active', re: /\b(?:still|not yet|isn't|is not|remains)\s+(?:pending|awaiting activation|inactive|not active|to be activated|under review)\b|\bawaiting activation\b|\bnot (?:been )?activated (?:yet)?\b/i },
  { fact: 'account_reset', re: /\b(?:not|hasn't|has not|isn't) (?:been )?reset\b|\breset (?:is )?(?:still )?pending\b/i },
  { fact: 'payout_processed', re: /\bpayout (?:is )?(?:still )?(?:pending|under review|not (?:yet )?processed)\b/i },
  { fact: 'kyc_approved', re: /\b(?:kyc|verification) (?:is )?(?:still )?(?:pending|under review|not (?:yet )?(?:approved|completed))\b/i },
  { fact: 'refund_processed', re: /\brefund (?:is )?(?:still )?(?:pending|under review|not (?:yet )?processed)\b/i },
  { fact: 'credentials_sent', re: /\bcredentials (?:have not|haven't|were not|are not) (?:been )?sent\b/i },
];

function loadGuards(ctxGuards) {
  const g = { imageAskGuard: null, spreadAskGate: null, ...(ctxGuards || {}) };
  for (const name of ['imageAskGuard', 'spreadAskGate']) {
    if (g[name]) continue;
    // Installed beside index.js (../ when this pack lives in <indexDir>/statePresend/), or the sibling pack in the workspace.
    for (const p of [`./${name}`, `../${name}`, `../luna-spread-image-fixes/${name}`]) {
      try { g[name] = require(p); break; } catch (_) { /* optional */ }
    }
  }
  return g;
}

function fail(code, detail, correction, extra) {
  return { code, detail, correction, ...(extra || {}) };
}

function warn(code, detail) {
  return { code, detail };
}

// Digit runs that are not a second trading account. A real order id is an
// FE-prefixed token. Digits inside a receipt URL are part of that URL.
// login / acct / account / mt5 / mt4 / id / user / no glued to digits are
// account numbers, including MT511261194 (the 5 belongs to the prefix).
// Those stay foreign unless the customer stated that exact digit run.
const ACCOUNT_LABEL_RE = /\b(?:login|account|acct|mt5|mt4|user|id|no)(\d{4,12})\b/gi;

function accountLabeledDigits(text) {
  const out = [];
  const s = String(text || '');
  const re = new RegExp(ACCOUNT_LABEL_RE.source, 'gi');
  let m;
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}

// Digits glued to an account prefix are account numbers. MT50123456 is the
// login 50123456 with the platform prefix, so a stated 50123456 covers that
// token. MT511261194 is not covered by a different number.
function uncoveredAccountLabels(draft, stated) {
  const out = [];
  const re = new RegExp(ACCOUNT_LABEL_RE.source, 'gi');
  let m;
  while ((m = re.exec(String(draft || '')))) {
    const glued = m[1];
    const token = m[0];
    const fullRun = (token.match(/(\d{4,12})$/) || [])[1] || glued;
    const exact = stated.has(glued) || stated.has(fullRun) || stated.has(token);
    const sameLogin = [...stated].some((n) => token.toLowerCase().endsWith(String(n).toLowerCase()));
    if (exact || sameLogin) continue;
    out.push(glued);
    if (fullRun !== glued) out.push(fullRun);
  }
  return out;
}

function collectOrderShapeRuns(text, into) {
  const s = String(text || '');
  let m;
  const feRe = /\bFE-?(\d{5,12})\b/gi;
  while ((m = feRe.exec(s))) into.add(m[1]);
  const urlRe = /https?:\/\/[^\s<>"')]+/gi;
  while ((m = urlRe.exec(s))) {
    const runs = m[0].match(/\d{5,12}/g) || [];
    for (const n of runs) into.add(n);
  }
}

function exemptStructuralNumberRuns(draft, clientTexts) {
  const out = new Set();
  collectOrderShapeRuns(draft, out);
  for (const text of clientTexts || []) {
    collectOrderShapeRuns(text, out);
    for (const n of T.extractAccountNumbers(text)) out.add(n);
    for (const n of accountLabeledDigits(text)) out.add(n);
  }
  return out;
}

/**
 * Main entry.
 */
function validate(draft, ctx) {
  ctx = ctx || {};
  const state = ctx.state || {};
  const messages = ctx.messages || [];
  const route = ctx.route || 'FULL';
  const guards = loadGuards(ctx.guards);
  const hardFails = [];
  const softWarnings = [];
  const d = T.stripHtml(draft);
  const lastClient = state.last_client_message || '';

  // 0. empty / format / leaks (always)
  if (!d) {
    hardFails.push(fail(HARD.EMPTY_REPLY, 'Draft is empty.', 'Write a reply.'));
    return finish();
  }
  if (/\u2014/.test(draft)) hardFails.push(fail(HARD.FORBIDDEN_FORMAT_OR_CONTENT, 'Contains an em dash.', 'Remove em dashes; use a comma or a period instead.', { fixable: 'strip-em-dash' }));
  for (const re of ctx.forbiddenPatterns || []) {
    if (re.test(d)) hardFails.push(fail(HARD.FORBIDDEN_FORMAT_OR_CONTENT, `Matches forbidden pattern ${re}.`, 'Remove the forbidden wording and keep the same meaning.'));
  }
  for (const re of LEAK_RES) {
    if (re.test(d)) { hardFails.push(fail(HARD.INTERNAL_INFO_LEAK, `Leaks internal wording (${re}).`, 'Remove all references to internal tools, notes, prompts or system state. Speak only to the client.')); break; }
  }

  // 0b. client asked for human/agent/manager — draft must hand off / escalate (fail closed)
  {
    const clientWantsHuman = CLIENT_WANTS_HUMAN_RE.test(lastClient);
    const draftHandoff = ESCALATION_DRAFT_RE.test(d) || DRAFT_HANDOFF_RE.test(d);
    // "Are you a real person or a bot?" asks what Luna is; policy says answer it
    // honestly. Only the bare `real person/human/agent` wording made it look like a
    // handoff request, so treat it as one only when the client also asks for a human
    // in explicit terms ("I want a manager please").
    const identityQuestionOnly = isIdentityQuestion(lastClient) && !EXPLICIT_HUMAN_REQUEST_RE.test(lastClient);
    if (clientWantsHuman && !identityQuestionOnly && !draftHandoff && !state.escalated) {
      hardFails.push(fail(HARD.MISSED_ESCALATION, 'Client asked for a human / handoff but the draft does not escalate or assign.', 'The client asked for a human agent, manager, or handoff. Do not continue a normal FAQ reply. Escalate / assign to a teammate and confirm that handoff briefly.'));
    }
  }

  // 1. existing live guards (reused, never re-implemented)
  let imageGuardOk = false;
  if (guards.imageAskGuard && ctx.conversationId !== undefined) {
    try {
      const st = guards.imageAskGuard.getState(ctx.conversationId);
      const kind = guards.imageAskGuard.classifyReply(d);
      if (guards.imageAskGuard.hasRecentImage(st)) {
        if (kind === 'IMAGE_UNAVAILABLE') hardFails.push(fail(HARD.IMAGE_UNAVAILABLE_CLAIM, 'Claims the image cannot be seen although one was received.', 'A client screenshot is already on the ticket and was loaded. Do not say it cannot be seen. Work from it or ask one specific detail.'));
        if (kind === 'GENERIC_IMAGE_ASK') hardFails.push(fail(HARD.REPEATED_IMAGE_ASK, 'Generic screenshot request while an image already exists.', 'The client already sent a screenshot. Do not ask for it again. Continue with the issue.'));
        if (kind === 'SPECIFIC_IMAGE_ASK' && !guards.imageAskGuard.decideImageAsk(st, { specific: true }).allow) {
          // hookD runs before gate and increments clarificationsAsked when it allows the
          // one clarification. Avoid treating that same draft as a second ask.
          const maxC = (guards.imageAskGuard.DEFAULTS && guards.imageAskGuard.DEFAULTS.maxClarifications) || 1;
          const priorTexts = []
            .concat(Array.isArray(state.last_bot_replies) ? state.last_bot_replies : [])
            .concat(state.last_bot_reply ? [state.last_bot_reply] : []);
          const priorBotImageAsk = priorTexts.some((t) => {
            try {
              const k = guards.imageAskGuard.classifyReply(t);
              return k === 'GENERIC_IMAGE_ASK' || k === 'SPECIFIC_IMAGE_ASK';
            } catch (_) { return false; }
          });
          const overCap = Number(st.clarificationsAsked || 0) > maxC;
          const repeatAfterAllowed = Number(st.clarificationsAsked || 0) >= maxC && priorBotImageAsk;
          const blockedForOtherReason = Number(st.clarificationsAsked || 0) < maxC;
          if (overCap || repeatAfterAllowed || blockedForOtherReason) {
            hardFails.push(fail(HARD.REPEATED_IMAGE_ASK, 'Second image clarification for the same issue.', 'One clarification was already requested. Do not ask for another image; use what was provided or escalate with the images attached.'));
          }
        }
      }
      imageGuardOk = true;
    } catch (_) { /* guard threw — fall through to the cheap fail-closed heuristic below instead of skipping the check */ }
  }
  if (!imageGuardOk && state.images && state.images.received > 0) {
    const asks = T.detectAsks(d);
    if (asks.includes('screenshot')) hardFails.push(fail(HARD.REPEATED_IMAGE_ASK, 'Screenshot request while an image already exists in the conversation.', 'The client already sent a screenshot. Do not ask for it again.'));
  }
  if (guards.spreadAskGate) {
    const looksLikeSpreadReply = /\bspreads?\b/i.test(d) && /\b(?:login|password|server|test account|demo account)\b/i.test(d) && /\d{4,}/.test(d);
    if (looksLikeSpreadReply && lastClient && !guards.spreadAskGate.isSpreadCheckAsk(lastClient) && !T.extractTopics(messages.filter((m) => m.role === 'client').map((m) => m.text).join(' ')).includes('spreads')) {
      hardFails.push(fail(HARD.WRONG_TOPIC, 'Spread-test credentials drafted although the client never asked about spreads.', 'The client did not ask about spreads. Answer the actual issue and do not include spread test credentials.'));
    }
  }

  // 2. duplicates (always; cheap)
  const prev = state.last_bot_replies || (state.last_bot_reply ? [state.last_bot_reply] : []);
  const priorClientTexts = messages.filter((m) => m.role === 'client').map((m) => m.text).slice(0, -1);
  const clientAskedRepeat = isRepeatedClientQuestion(lastClient, priorClientTexts);
  const clientSmallTalk = T.isGreetingOrSmallTalk(lastClient);
  if (prev.length) {
    const dn = T.normalize(d);
    if (prev.some((p) => T.normalize(p) === dn || (clientAskedRepeat && nearCopiedWording(p, d)))) {
      hardFails.push(fail(HARD.DUPLICATE_REPLY, 'Identical to a previous reply.', clientAskedRepeat
        ? 'The client asked again. Acknowledge briefly and explain the same answer in different words. Keep all facts, numbers, eligibility, and policy unchanged.'
        : 'Your draft repeats your previous message word for word. Say something new that moves the conversation forward, or acknowledge briefly.', { fixable: 'skip-send' }));
    } else if (!T.isShortAck(d) && T.tokens(d).length >= 4) {
      const best = Math.max(...prev.slice(-2).map((p) => T.similarity(p, d)));
      if (best >= 0.8 && !clientAskedRepeat && !clientSmallTalk) hardFails.push(fail(HARD.SEMANTIC_REPEAT, `Near-duplicate of a recent reply (similarity ${best.toFixed(2)}).`, 'Your draft restates your previous answer. Do not repeat it; address what is still open or acknowledge in one short line.', { fixable: 'skip-send' }));
      else if (best >= 0.6) softWarnings.push(warn(SOFT.MINOR_REDUNDANCY, `Overlaps a recent reply (similarity ${best.toFixed(2)}).`));
    }
  }

  // 3. already collected / repeated asks (always; cheap)
  const knowledge = ctx.knowledge && ctx.knowledge.level ? ctx.knowledge : ctx.knowledge ? gap.classify(ctx.knowledge, lastClient) : null;
  const cl = clarify.evaluate(d, state, knowledge);
  for (const issue of cl.issues) {
    const known = state.known_details || {};
    if (issue.code === 'ALREADY_COLLECTED_INFO_REQUEST') {
      hardFails.push(fail(HARD.ALREADY_COLLECTED_INFO_REQUEST, issue.detail, `The client already provided the ${issue.item.replace('_', ' ')} ${known[issue.item]} earlier in this conversation. Do not request it again. Continue from the unresolved issue.`, { fixable: 'strip-ask', item: issue.item }));
    } else if (issue.code === 'REPEATED_QUESTION') {
      hardFails.push(fail(HARD.REPEATED_QUESTION, issue.detail, `You already asked for the ${issue.item.replace('_', ' ')}. Do not ask the same question again; either work with what the client said or explain briefly why the detail is still needed.`, { fixable: 'strip-ask', item: issue.item }));
    } else if (issue.code === 'UNNECESSARY_CLARIFICATION') {
      hardFails.push(fail(HARD.UNNECESSARY_CLARIFICATION, issue.detail, 'Approved knowledge answers this question. Answer it directly instead of asking for clarification.'));
    }
  }

  // 4. human authority / conversation contradictions (always; cheap)
  for (const f of state.human_confirmed_facts || []) {
    const pair = CONTRADICTION_PAIRS.find((p) => p.fact === f.fact);
    if (pair && pair.re.test(d)) hardFails.push(fail(HARD.HUMAN_CONTRADICTION, `Contradicts teammate confirmation "${T.clip(f.text, 80)}".`, `A teammate already confirmed: "${T.clip(f.text, 120)}". Do not contradict this. Build your reply on the confirmed information.`));
  }
  const known = state.known_details || {};
  if (known.account_number) {
    const clientTexts = messages.filter((m) => m.role === 'client').map((m) => m.text);
    const supported = new Set(
      T.extractAccountNumbers(messages.map((m) => m.text).join(' '))
        .concat(clientTexts.flatMap((text) => accountLabeledDigits(text)))
    );
    const nums = [...new Set(
      T.extractAccountNumbers(d)
        .concat(uncoveredAccountLabels(d, supported))
        .filter((n) => n !== known.account_number && !supported.has(n))
    )];
    // FE order ids and receipt-URL digit runs are not other accounts.
    // Account-prefix digits and any other number count only when the customer
    // stated that exact run. A bare or glued account the customer never stated
    // is still a foreign account.
    const exempt = exemptStructuralNumberRuns(d, clientTexts);
    const foreign = nums.filter((n) => !supported.has(n) && !exempt.has(n));
    if (foreign.length) hardFails.push(fail(HARD.CONVERSATION_CONTRADICTION, `Mentions account ${foreign.join(', ')} but the client's account is ${known.account_number}.`, `The client's account number is ${known.account_number}. Do not mention any other account number.`));
  }
  for (const c of state.recent_corrections || []) {
    if (c.field === 'challenge_type' && c.from && c.to && c.from !== c.to) {
      const mentionsOld = new RegExp(`\\b${c.from.replace(/[-\s]/g, '[-\\s]?')}\\b(?![-\\s]?elite)`, 'i').test(d) && !new RegExp(`\\b${c.to.replace(/[-\s]/g, '[-\\s]?')}\\b`, 'i').test(d);
      if (mentionsOld) hardFails.push(fail(HARD.CONVERSATION_CONTRADICTION, `Uses superseded "${c.from}" after the client corrected to "${c.to}".`, `The client corrected the challenge type to "${c.to}" (not "${c.from}"). Answer for "${c.to}" only.`));
    }
    if (c.field === 'account_number' && c.from && new RegExp(`(?<!\\d)${c.from}(?!\\d)`).test(d)) {
      hardFails.push(fail(HARD.CONVERSATION_CONTRADICTION, `Uses superseded account ${c.from}; corrected value is ${c.to}.`, `The client corrected the account number to ${c.to}. Do not use ${c.from}.`));
    }
  }

  // 5a. MISSED_QUESTION / WRONG_TOPIC are mandated fail-closed codes (see CLAUDE.md) and
  // must run on every route, not only FULL — otherwise a single unanswered client question
  // (which alone never forces router.decide() to FULL) skips the check entirely.
  {
    // multi-ask completeness
    const asks = multiAsk.extractAsks(messages);
    const questionAsks = [...asks.burst, ...asks.carried].filter((a) => a.kind === 'question');
    // Fail closed on any unanswered explicit client question (was >= 2 only).
    if (questionAsks.length >= 1) {
      const cov = multiAsk.checkCoverage(d, questionAsks);
      if (cov.missed.length && !ESCALATION_DRAFT_RE.test(d)) {
        hardFails.push(fail(HARD.MISSED_QUESTION, `Draft leaves ${cov.missed.length} of ${cov.total} client questions unanswered.`, `The client asked ${cov.total} unresolved questions. Your draft answered ${cov.covered.length}. Also answer: ${cov.missed.map((m) => `"${T.clip(m.text, 120)}"`).join('; ')}. Do not repeat already-covered information.`));
      }
    }

    // topic relevance
    if (state.topic_changed && state.active_topics && state.active_topics.length) {
      const draftTopics = T.extractTopics(d);
      const lastTopics = T.extractTopics(lastClient);
      if (draftTopics.length && lastTopics.length && !draftTopics.some((t) => lastTopics.includes(t)) && !T.isShortAck(d)) {
        hardFails.push(fail(HARD.WRONG_TOPIC, `Client moved to ${lastTopics.join(', ')} but the draft is about ${draftTopics.join(', ')}.`, `The client changed topic to: "${T.clip(lastClient, 160)}". Answer that. Do not continue the previous topic unless the client asks.`));
      }
    }
    // Hard payout intent must not get a reset/retry (or promo-reset) draft even if
    // topic_changed was not flagged (mixed history / related-group edge cases).
    {
      const lastTopics = T.extractTopics(lastClient);
      const draftTopics = T.extractTopics(d);
      const clientOnPayout = lastTopics.includes('payout') || /\b(?:payout|withdraw(?:al)?|cash ?out)\b/i.test(lastClient);
      const draftOnReset = draftTopics.includes('reset_retry') || /\b(?:reset|retry|free retry|restart(?:ing)? (?:your )?account)\b/i.test(d);
      const draftMentionsPayout = draftTopics.includes('payout') || /\b(?:payout|withdraw(?:al)?)\b/i.test(d);
      // The client can raise reset/retry themselves ("I got a free retry, does my 80%
      // split stay?"). Then a draft covering both topics is on-topic by definition, and
      // blocking it sends a correct FAQ answer to a teammate instead of the client.
      // This rule is only for a pure payout ask answered with a reset/retry push.
      const clientOnReset = lastTopics.includes('reset_retry') || /\b(?:reset|retry|second chance|restart)\b/i.test(lastClient);
      if (clientOnPayout && draftOnReset && !clientOnReset && !T.isShortAck(d) && !ESCALATION_DRAFT_RE.test(d)) {
        // Fail even when the draft lightly name-checks payout while still pushing reset/retry.
        hardFails.push(fail(HARD.WRONG_TOPIC, 'Client moved to payout but the draft is about reset_retry.', `The client is asking about payout/withdrawal: "${T.clip(lastClient, 160)}". Answer the payout question (or escalate payout). Do not talk about reset/retry.`));
      }
    }
  }

  // 5a-bis. First-person completion claims are route- and knowledge-independent.
  // Every Luna tool is read-only, so "I have approved / processed / reset / refunded ..."
  // can only be true if a human said so in this conversation. Previously this was audited
  // only inside the `if (knowledge)` branch below, and index.js passes knowledge: null on
  // every live reply, so the claim degraded to a soft UNAUDITED_FACTS warning and shipped.
  // Reuses gap.COMPLETION_CLAIM_RE - the same regex object PROMISE_RES already uses.
  {
    const m = T.stripHtml(d).match(gap.COMPLETION_CLAIM_RE);
    if (m) {
      const humanText = (messages || [])
        .filter((x) => x.role === 'human' || x.role === 'note')
        .map((x) => x.text || '')
        .join('\n');
      const support = `${(state.human_confirmed_facts || []).join(' ')}\n${humanText}`;
      const phraseToks = T.tokens(m[0]);
      const sup = phraseToks.length ? T.overlapRatio(phraseToks, T.tokens(support)) : 0;
      if (sup < 0.99) {
        hardFails.push(fail(
          HARD.UNSUPPORTED_PROMISE,
          `Claims a completed action Luna cannot perform: "${m[0]}".`,
          `Do not tell the client you have ${m[0].replace(/^\s*(?:i|we)\s+/i, '')}. Luna has no tool that performs account, payout, KYC or refund actions. Say what will actually happen (the team will handle it) instead of claiming it is done.`
        ));
      }
    }
  }

  // 5a-ter. Troubleshooting safeguard (Final v3 §8): never ask a customer to place a trade,
  // pay again, buy another challenge or reset an account merely to PRODUCE diagnostic
  // evidence. A lone word such as "reset" in the customer's message is not an approved
  // diagnostic workflow. Legitimate purchase/reset answers without diagnostic framing
  // do not match DIAGNOSTIC_FRAMING_RE and are left alone. Distinct from style/format checks.
  {
    const DIAGNOSTIC_ACTION_RE = /\b(?:place|open|make|execute|put on|take)\s+(?:a|another|one)?\s*(?:small\s+|test\s+|demo\s+)?trade\b|\b(?:pay|purchase|buy)\s+(?:again|another|a new|once more)\b|\bre-?purchase\b|\breset\s+(?:your|the)\s+account\b/i;
    const DIAGNOSTIC_FRAMING_RE = /\b(?:to\s+(?:see|test|check|confirm|verify|find out|determine)|so\s+(?:we|i)\s+can\s+(?:see|test|check|confirm|verify)|as\s+a\s+test|just\s+to\s+(?:test|check|see)|and\s+(?:let|tell)\s+(?:me|us)\s+know\s+if)\b/i;
    if (DIAGNOSTIC_ACTION_RE.test(d) && DIAGNOSTIC_FRAMING_RE.test(d)) {
      hardFails.push(fail(
        HARD.FORBIDDEN_DIAGNOSTIC_ACTION,
        'Asks the client to trade, pay or reset purely to produce diagnostic evidence.',
        'Do not ask the client to place a trade, pay again or reset an account just to test something. Use information you already have, ask a question, or escalate to the team.'
      ));
    }
  }

  // 5a-quater. POLICY-VALUE CHECK (Final v3 F4 acceptance).
  // A customer's proposed number is not policy authority. An exception in the article is
  // not applicable unless conversation context confirms the condition. Time claims are
  // compared by duration, so a wrong unit (minutes vs hours) is a failure.
  if (knowledge) {
    const evidenceText = gap.normalizeResults(knowledge.results ? knowledge.results : knowledge)
      .map((r) => `${r.title || ''} ${r.text}`).join('\n');
    const bad = policyEvidence.unsupportedPolicyNumbers(d, evidenceText, messages);
    if (bad.length && !ESCALATION_DRAFT_RE.test(d)) {
      hardFails.push(fail(
        HARD.UNSUPPORTED_NUMBER,
        `States ${bad.join(', ')} although the approved evidence for this point gives a different value.`,
        `Do not state ${bad.join(', ')}. Use the value the approved FAQ gives for this product and stage, or say the team will confirm.`
      ));
    }
  }

  // 5b. FULL-only checks (need the tool-provided knowledge lookup, or are soft-severity
  // business heuristics rather than the mandated fail-closed codes above).
  if (route === 'FULL') {
    // unsupported numbers / promises. Only when the engine wired knowledge
    // results in: without them there is nothing to audit against, and
    // blocking every figure would break legitimate FAQ answers.
    if (knowledge) {
      const claims = gap.findUnsupportedClaims(d, { knowledge, messages });
      // This blanket rule ("every drafted number must appear verbatim in the retrieved text")
      // was dormant while knowledge was always null. Once real evidence is wired in it
      // rejects correct answers whenever retrieval returns neighbouring articles - a correct
      // "50% profit split" was blocked because the retrieved block covered loss limits. The
      // hard verdict now belongs to the SAME-FACT check above, which compares a figure only
      // against evidence about the same point. Keep this as a signal, not a block.
      if (claims.unsupportedNumbers.length) softWarnings.push(warn(SOFT.UNAUDITED_FACTS, `Numbers not found verbatim in the retrieved evidence: ${claims.unsupportedNumbers.join(', ')}.`));
      if (claims.unsupportedPromises.length) hardFails.push(fail(HARD.UNSUPPORTED_PROMISE, `Unsupported promise/timeline: ${claims.unsupportedPromises.join('; ')}.`, `Do not promise outcomes or timelines that are not confirmed by approved knowledge or a teammate (${claims.unsupportedPromises.join('; ')}). State only what is confirmed.`));
      if (knowledge.level === 'none' && claims.assertsFacts && !ESCALATION_DRAFT_RE.test(d)) {
        hardFails.push(fail(HARD.KNOWLEDGE_GAP_UNSAFE, 'Asserts policy facts although no knowledge supports the question.', 'No approved knowledge covers this question. Do not invent a rule, number or policy. Say you will confirm with the team, using the existing unknown/escalation behavior.'));
      }
      if (knowledge.level === 'conflicting' && claims.assertsFacts) {
        hardFails.push(fail(HARD.UNSUPPORTED_FACT, `Knowledge sources conflict (${knowledge.conflict && knowledge.conflict.detail}).`, 'The knowledge base has conflicting entries for this point. Do not pick one; say the team will confirm the exact figure.'));
      }
    } else if (gap.numericFacts(d).some((f) => f.unit) || gap.PROMISE_RES.some((re) => re.test(d))) {
      softWarnings.push(warn(SOFT.UNAUDITED_FACTS, 'Draft contains figures or timelines but no knowledge results were provided to audit them.'));
    }

    // unnecessary escalation
    if (ESCALATION_DRAFT_RE.test(d) && knowledge && knowledge.level === 'supported' && !state.escalated && !(state.human_confirmed_facts || []).length && !/\b(?:identity|someone else|not my account|hacked|fraud|complain|legal|refund)\b/i.test(lastClient)) {
      hardFails.push(fail(HARD.UNNECESSARY_ESCALATION, 'Escalates although approved knowledge answers the question.', 'Approved knowledge answers this question. Answer it directly; do not escalate.'));
    }
  }

  // 6. soft warnings (never block)
  if (d.length > 900 || T.sentences(d).length > 9) softWarnings.push(warn(SOFT.TOO_LONG, `${d.length} chars / ${T.sentences(d).length} sentences.`));
  if (GENERIC_RES.some((re) => re.test(d))) softWarnings.push(warn(SOFT.GENERIC_WORDING, 'Contains canned support phrasing.'));
  if (/\n{3,}/.test(draft) || /^#{1,6}\s/m.test(draft)) softWarnings.push(warn(SOFT.FORMATTING, 'Excess blank lines or markdown headers.'));
  if (/[A-Z]{6,}/.test(d.replace(/\b(?:KYC|MT5|MT4|USD|EUR|GBP|FAQ|ID)\b/g, ''))) softWarnings.push(warn(SOFT.TONE, 'Shouting/all-caps words.'));
  if (T.extractQuestions(d).length > 2) softWarnings.push(warn(SOFT.MANY_QUESTIONS, 'More than two questions in one reply.'));

  return finish();

  function finish() {
    const seen = new Set();
    const hf = hardFails.filter((f) => { const k = f.code + '|' + f.detail; if (seen.has(k)) return false; seen.add(k); return true; });
    return {
      ok: hf.length === 0,
      hardFails: hf,
      softWarnings,
      route,
      correctionInstruction: hf.length ? buildCorrectionInstruction(hf, state) : null,
    };
  }
}

function buildCorrectionInstruction(hardFails, state) {
  const lines = ['Revise your reply. Keep everything that was correct. Fix only the following:'];
  hardFails.forEach((f, i) => lines.push(`${i + 1}. [${f.code}] ${f.correction}`));
  const known = (state && state.known_details) || {};
  const facts = Object.entries(known).map(([k, v]) => `${k.replace('_', ' ')}: ${v}`);
  if (facts.length) lines.push(`Known client details: ${facts.join('; ')}.`);
  if (state && state.pending_questions && state.pending_questions.length) lines.push(`Open client questions: ${state.pending_questions.map((q) => `"${T.clip(q.text, 100)}"`).join('; ')}.`);
  lines.push('Do not add new claims, numbers or promises. Keep the reply short and natural, no em dash.');
  return lines.join('\n');
}

/**
 * Cheap subset for FAST route: format, leaks, live guards, duplicates, already-collected.
 */
function validateFast(draft, ctx) {
  return validate(draft, { ...(ctx || {}), route: 'FAST' });
}

module.exports = { HARD, SOFT, validate, validateFast, buildCorrectionInstruction, loadGuards, LEAK_RES, CONTRADICTION_PAIRS, ESCALATION_DRAFT_RE, CLIENT_WANTS_HUMAN_RE, DRAFT_HANDOFF_RE };
