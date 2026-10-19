'use strict';
/**
 * REVIEW_REQUEST_FLOW_V1
 * Deterministic 2-step close from system-prompt Section G.
 * The model may still see Section G, but a resolved satisfaction does not depend on it.
 *
 * Durable per-conversation fields (bot-ticket-state, same key as the conversation id):
 *   reviewRequested                  Trustpilot + PropFirmMatch ask already sent
 *   reviewRequestedAt                ms timestamp of that send
 *   reviewRequestedForClientPartId   client part the ask answered
 *   reviewStep1Done                  closing check already done
 *   reviewStep1By                    'luna' (we sent it) or 'human' (teammate message counted)
 *   reviewStep1At                    ms timestamp
 *   reviewStep1ForClientPartId       client part Luna answered with the closing check
 *   reviewStep1SupportPartId         support part that was the closing check
 *   reviewClaimAction                in-flight SEND_REVIEW or SEND_CLOSING_CHECK
 *   reviewClaimPartId                client part id of that claim
 *   reviewClaimAt                    ms timestamp of the claim
 * A claim blocks a second webhook for the same part until it is committed or released.
 * History that already contains both review links counts as reviewRequested.
 */

const handoff = require('./teammateHandoffGates');

const CLOSING_CHECK_TEXT = 'Is there anything else I can help you with?';

const REVIEW_REQUEST_TEXT = [
  "That's wonderful to hear! 😊",
  '',
  "If you're happy with the support you received, we'd truly appreciate a quick review. Your feedback means a lot and helps us keep improving.",
  '',
  'Trustpilot:',
  'https://www.trustpilot.com/review/fundedelite.com',
  '',
  'PropFirmMatch:',
  'https://propfirmmatch.com/prop-firms/fundedelite',
  '',
  'Thank you for choosing FundedElite! ❤️',
].join('\n');

const TRUSTPILOT_URL = 'https://www.trustpilot.com/review/fundedelite.com';
const PROPFIRMMATCH_URL = 'https://propfirmmatch.com/prop-firms/fundedelite';
const CLAIM_WINDOW_MS = 3 * 60 * 1000;

const SATISFACTION_PHRASES = new Set([
  'thanks',
  'thank you',
  'thankyou',
  'thx',
  'ty',
  'thanks so much',
  'thank you so much',
  'thanks a lot',
  'thank you very much',
  'thanks for your help',
  'thank you for your help',
  'thanks for the help',
  'thank you for the help',
  'thanks for everything',
  'thank you for everything',
  'thanks for the support',
  'thank you for the support',
  'no thanks',
  'no thank you',
  'nope thanks',
  'nah thanks',
  'all good',
  'all good thanks',
  'all good thank you',
  'all set',
  'resolved',
  'perfect',
  'perfect thanks',
  'perfect thank you',
  'brilliant',
  'brilliant thank you',
  'brilliant thanks',
  'thats all',
  'that is all',
  'no thats all',
  'no that is all',
  'appreciate it',
  'appreciated',
  'much appreciated',
  'nothing else',
  'nothing more',
  'nothing else thanks',
  'im good',
  'all sorted',
  'cheers',
  'wonderful',
  'awesome',
  'sounds good',
  'no all good',
  'no problem',
  'ok thanks',
  'okay thanks',
  'ok thank you',
  'okay thank you',
  'sure thanks',
  'sure thank you',
]);

const handoffClaimGate = require('./handoffClaimGate');

const PENDING_RE = [
  /\b(?:i am|i'm|we are|we're)\s+check(?:ing)?\b/i,
  /\b(?:i'll|i will|we will|we'll)\s+(?:check|look|review|investigate|escalate|forward|update|ask|verify|confirm)\b/i,
  /\blet me (?:check|look|ask|escalate|confirm|verify)\b/i,
  /\blooking into\b/i,
  /\bwith the (?:finance|payout|kyc|risk|backend|verification|support) team\b/i,
  /\bget back to you\b/i,
  /\bunder review\b/i,
  /\binvestigat(?:e|ing|ion)\b/i,
  /\bescalat(?:e|ed|ing)\b/i,
  /\bforwarded (?:this |it )?(?:to|on)\b/i,
  /\b(?:asked|asking)\s+(?:a\s+)?(?:support\s+)?(?:teammate|team\s+member|colleague)\b/i,
  /\b(?:support\s+)?(?:teammate|team\s+member)\s+(?:to\s+)?(?:verify|confirm|check|review)\b/i,
  /\bplease wait\b/i,
  /\bworking on (?:this|it|your)\b/i,
  /\bstill (?:reviewing|checking|looking|processing)\b/i,
  /\bin progress\b/i,
  /\bbeing processed\b/i,
  /\bprocessing your\b/i,
  /\bwaiting (?:for|on) (?:the )?(?:team|finance|backend|approval|verification|support|teammate)\b/i,
  /\bonce (?:the team|we|finance|they|support|a teammate) (?:confirm|reply|finish|complete|verify)\b/i,
  /\bwill soon be here\b/i,
  /\bteam member will\b/i,
];

const COMPLAINT_RE = /\b(?:not solved|not resolved|isn'?t resolved|is not resolved|still not|still broken|still waiting|doesn'?t work|does not work|didn'?t work|did not work|unhappy|disappointed|terrible|awful|\bworst\b|scam|chargeback|\bcomplaint\b|\bdispute\b|\bangry\b|frustrated|useless|waste of time|this is wrong|haven'?t answered|didn'?t answer|did not answer|never fixed|never resolved|problem is not|issue is not|not happy|ridiculous|unacceptable|not fixed)\b/i;

const INFO_REQUEST_RE = /\b(?:please (?:send|share|provide|confirm)|(?:share|send) (?:me )?(?:your )?(?:account|email|screenshot)|what(?:'s| is) your (?:account|email)|can you (?:send|share|provide)|your account number)\b/i;

const CLIENT_QUESTION_RE = /\b(?:how|what|when|where|why|can you|could you|would you|please (?:check|help|look|tell|explain)|i (?:need|want) to know)\b/i;

function stripHtml(text) {
  return handoff.stripHtml(text);
}

function flat(text) {
  return stripHtml(text)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUtterance(text) {
  return flat(text)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/['']/g, '')
    .replace(/[!?.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isClientPart(part) {
  const t = String((part && part.author && part.author.type) || '');
  return t === 'user' || t === 'lead';
}

function isNote(part) {
  return String((part && part.part_type) || '') === 'note';
}

function partBody(part) {
  return stripHtml(part && part.body);
}

function isLunaPublic(part, opts) {
  if (!part || isNote(part)) return false;
  const pt = String(part.part_type || '');
  if (pt !== 'comment' && pt !== 'assignment' && pt !== 'open') return false;
  const a = part.author || {};
  const id = String(a.id || '');
  const arsalId = String((opts && opts.arsalId) || '');
  const eliteAiId = String((opts && opts.eliteAiId) || '');
  const luna =
    (id && (id === arsalId || id === eliteAiId)) ||
    a.type === 'bot' ||
    /elite\s*ai|\bfin\b/i.test(String(a.name || ''));
  if (!luna) return false;
  return !!partBody(part);
}

function isSupportPublic(part, opts) {
  if (!part || isNote(part)) return false;
  if (isLunaPublic(part, opts)) return true;
  return handoff.isHumanTeammatePublicReply(part, opts || {});
}

function isStopNote(text) {
  const t = flat(text);
  if (!t) return false;
  return (
    /\b(?:stop|pause|don'?t|do not|never)\b.+\b(?:reply|replies|respond|responses|answering)\b/i.test(t) ||
    /\b(?:bot\s*off|ai\s*off|stay\s+silent|go\s+silent|silence\s+here|no\s+more\s+replies|stop\s+replying|don'?t\s+reply|do\s+not\s+reply)\b/i.test(t)
  );
}

/* REVIEW_CONTROL_STATE_V2 (2026-09-28, live 215476132844454).
 * The review flow used to guess silence from the WHOLE history with its own tiny phrase list
 * (explicitSilenceFromNotes): any old stop note silenced the ticket forever unless a later note
 * matched a handful of exact resume phrases. On 215476132844454 an old "do not reply" was
 * followed by an authorized "@Arsal reply him" (the owner-command reader executed it as REPLY)
 * and ~20 Luna public replies, yet the review turn still returned explicit_silence and swallowed
 * the client's next message.
 *
 * The CURRENT control state is now reconstructed as an ordered state machine:
 *   STOP --(authorized resume/reply command | Luna public reply)--> ACTIVE
 * Only the latest control event matters. Commands are understood with the SAME parser and the
 * SAME authorization the owner-command reader (AUTH_NOTE) uses, injected by index.js as deps:
 *   isAuthorizedAdmin(id)        teammateAdmins (verified Intercom admin ids)
 *   mentionsLuna(rawBody)        the note @mentions Arsal/Luna
 *   parseCommand(plain, opts)    parseAuthorizedNoteCommand (STOP/RESUME/REPLY/FOLLOW/...)
 *   isStopInstruction(body)      the silence directive the pre-send boundary uses
 * Authority is not loosened: only an authorized teammate who addresses Luna can RESUME. A stop
 * phrase in any admin note still counts as STOP (fail toward silence, same as the pre-send gate).
 * Without deps (isolated unit use) no note can resume; only a later Luna public reply can make a
 * stop stale. */
const LUNA_STOP_CONFIRM_RE = /\b(?:i'?ll\s+stop\s+replying\s+to\s+this\s+ticket|i'?ll\s+pause\s+responses\s+here|no\s+more\s+replies\s+on\s+this\s+ticket\s+from\s+me|closing\s+this\s+ticket\s+as\s+requested|i'?ll\s+close\s+this\s+conversation)\b/i;
const LUNA_RESUME_CONFIRM_RE = /\b(?:i'?ll\s+resume\s+replies\s+on\s+this\s+ticket|i'?m\s+back\s+on\s+this\s+ticket|i'?ll\s+continue\s+assisting\s+this\s+client|i'?ll\s+keep\s+helping\s+if\s+the\s+client\s+asks|reopening\s+this\s+ticket)\b/i;
// Natural resume/reply intent inside a FOLLOW command (the owner reader clears aiOff for every
// FOLLOW and lets the model pick the action; these phrasings are an unambiguous reply/resume).
const RESUME_INTENT_RE = /\b(?:resume|resumed|unpause|unmute|bot\s*on|ai\s*on|re-?enable\s+repl\w*|turn\s+(?:the\s+)?(?:bot|ai|replies)\s+(?:back\s+)?on|(?:start|keep|continue|go\s+on|carry\s+on)\s+(?:replying|responding|answering|helping|assisting)(?:\s+again)?|(?:you\s+(?:can|may)|go\s+ahead\s+and|please|pls|kindly|now)\s+(?:reply|respond|answer|continue|help|assist)|(?:reply|respond|answer)\s+(?:now|again|him|her|them|the\s+client|the\s+customer|to\s+(?:him|her|them|the\s+client|the\s+customer|this|it))|(?:reply|answer)\s+(?:his|her|their)\b|back\s+on\s+(?:this|it))\b/i;
const RESUME_COMMANDS = new Set(['RESUME', 'OPEN', 'ASSIST', 'REPLY']);
const STOP_COMMANDS = new Set(['STOP', 'CLOSE']);

function tsOf(part) {
  const n = Number((part && part.created_at) || 0);
  return n > 1e12 ? Math.floor(n / 1000) : n;
}

function isLunaSeatPublic(part, opts) {
  // Luna's own public reply (the Arsal seat). Fin/Elite AI replies are a different bot and do not
  // make a teammate stop stale.
  if (!part || isNote(part)) return false;
  const pt = String(part.part_type || '');
  if (pt !== 'comment' && pt !== 'assignment' && pt !== 'open') return false;
  const id = String((part.author && part.author.id) || '');
  const arsalId = String((opts && opts.arsalId) || '');
  if (!arsalId || id !== arsalId) return false;
  return !!partBody(part);
}

function classifyControlNote(part, opts, deps) {
  const a = part.author || {};
  if (a.type !== 'admin') return null;
  const raw = String(part.body || '');
  const plain = partBody(part);
  if (!plain) return null;
  const id = String(a.id || '');
  const d = deps || {};
  const stopFn = typeof d.isStopInstruction === 'function' ? d.isStopInstruction : isStopNote;
  const arsalId = String((opts && opts.arsalId) || '');
  if (arsalId && id === arsalId) {
    // Luna's own confirmation notes record what the owner-command reader actually executed
    // (including model-interpreted FOLLOW commands).
    if (LUNA_STOP_CONFIRM_RE.test(plain)) return { kind: 'STOP', via: 'luna_confirm' };
    if (LUNA_RESUME_CONFIRM_RE.test(plain)) return { kind: 'RESUME', via: 'luna_confirm' };
    return null;
  }
  const authorized = typeof d.isAuthorizedAdmin === 'function' && d.isAuthorizedAdmin(id);
  const addressed = authorized && typeof d.mentionsLuna === 'function' && d.mentionsLuna(raw);
  if (addressed && typeof d.parseCommand === 'function') {
    let parsed = null;
    try { parsed = d.parseCommand(plain, { fromAuthorizedAuthor: true, mentionsAuthorized: true }); } catch (_) { parsed = null; }
    const cmd = String((parsed && parsed.cmd) || '');
    if (STOP_COMMANDS.has(cmd)) return { kind: 'STOP', via: 'command_' + cmd.toLowerCase() };
    if (RESUME_COMMANDS.has(cmd)) return { kind: 'RESUME', via: 'command_' + cmd.toLowerCase() };
    if (cmd === 'FOLLOW' && RESUME_INTENT_RE.test(plain) && !stopFn(raw)) return { kind: 'RESUME', via: 'command_follow_resume' };
  }
  if (stopFn(raw)) return { kind: 'STOP', via: authorized ? 'stop_note' : 'stop_note_unauthorized' };
  return null;
}

function resolveControlState(parts, opts, deps) {
  const list = (parts || []).map((p, i) => ({ p, i }))
    .sort((x, y) => tsOf(x.p) - tsOf(y.p) || x.i - y.i);
  let state = 'ACTIVE';
  let stop = null;
  let lastResume = null;
  let lastLunaPublicId = '';
  const stale = [];
  for (const { p } of list) {
    if (!p) continue;
    if (isNote(p)) {
      const ev = classifyControlNote(p, opts, deps);
      if (!ev) continue;
      if (ev.kind === 'STOP') {
        state = 'STOP';
        stop = { partId: String(p.id || ''), authorId: String((p.author && p.author.id) || ''), at: tsOf(p), via: ev.via, text: partBody(p).slice(0, 120) };
      } else if (ev.kind === 'RESUME') {
        if (state === 'STOP' && stop) stale.push(Object.assign({}, stop, { staleBy: 'resume:' + ev.via, staleByPartId: String(p.id || '') }));
        state = 'ACTIVE';
        stop = null;
        lastResume = { partId: String(p.id || ''), authorId: String((p.author && p.author.id) || ''), at: tsOf(p), via: ev.via };
      }
      continue;
    }
    if (isLunaSeatPublic(p, opts)) {
      lastLunaPublicId = String(p.id || '');
      if (state === 'STOP' && stop) {
        stale.push(Object.assign({}, stop, { staleBy: 'luna_public_reply', staleByPartId: lastLunaPublicId }));
        state = 'ACTIVE';
        stop = null;
      }
    }
  }
  return { state, stop, lastResume, lastLunaPublicId, stale };
}

// Kept for callers/tests that import it: "is there an ACTIVE stop right now" (current state,
// not "was there ever a stop").
function explicitSilenceFromNotes(parts, opts, deps) {
  return resolveControlState(parts, opts, deps).state === 'STOP';
}

function isPendingWork(text) {
  const t = flat(text);
  if (!t) return false;
  if (handoffClaimGate.isPendingHandoffLanguage(t)) return true;
  return PENDING_RE.some((re) => re.test(t));
}

/**
 * REVIEW_OPEN_ISSUE_V1 (2026-09-29, ticket 215476138018591):
 * Block review when the conversation still has pending support/handoff state — including
 * Luna's own earlier "I've asked a teammate" claims, client "I'll come back / check with
 * support", unanswered clarifications, or unresolved platform/timezone issues.
 * Does NOT require an escalateAwaiting internal note. Scans recent context, not a flat
 * phrase allowlist of review blockers.
 */
function conversationHasOpenSupportWork(parts, opts, latestIdx) {
  const list = parts || [];
  const end = latestIdx >= 0 ? latestIdx : list.length - 1;
  if (end < 0) return false;
  const start = Math.max(0, end - 24);

  let pendingClaimIdx = -1;
  let clientDeferredIdx = -1;
  let unansweredQuestion = false;
  let clearResolutionAfterPending = false;

  for (let i = start; i <= end; i++) {
    const p = list[i];
    if (!p || isNote(p)) continue;
    const body = partBody(p);
    if (!body) continue;
    if (isClientPart(p)) {
      if (handoffClaimGate.clientDeferredToSupport(body)) clientDeferredIdx = i;
      if (isClearSatisfactionClosure(body, { afterClosingCheck: true })) continue;
      if (isClientQuestion(body)) {
        // Mark open until a later non-pending support answer covers it.
        unansweredQuestion = true;
      }
      continue;
    }
    if (isSupportPublic(p, opts)) {
      if (isPendingWork(body) || handoffClaimGate.lunaLeftIssueOpen(body)) {
        pendingClaimIdx = i;
        clearResolutionAfterPending = false;
        unansweredQuestion = false; // superseded by explicit pending/open support state
        continue;
      }
      if (isClosingCheck(body) || isHandoffPlaceholder(body)) continue;
      if (!isLunaPublic(p, opts) && handoff.isHumanTeammatePublicReply(p, opts || {})) {
        // Courtesy-only ack ("Your welcome") does not clear an open case and does not
        // count as the teammate taking the ticket (COURTESY_VS_SUBSTANTIVE_V1).
        if (handoff.classifyTeammatePublicReply(body) === 'courtesy') continue;
        // Human teammate reply clears prior Luna pending-claim / deferral.
        pendingClaimIdx = -1;
        clientDeferredIdx = -1;
        unansweredQuestion = false;
        continue;
      }
      // Non-pending Luna/support answer.
      if (unansweredQuestion) unansweredQuestion = false;
      if (pendingClaimIdx >= 0) {
        // A later FAQ answer does NOT clear a false "asked a teammate" claim or an
        // admitted open verification — only a real teammate reply does.
        // But a pure knowledge resolution with no open issue language can clear
        // lunaLeftIssueOpen hedges that were not handoff claims.
        if (!handoffClaimGate.hasHandoffClaim(partBody(list[pendingClaimIdx])) &&
            !isPendingWork(partBody(list[pendingClaimIdx]))) {
          pendingClaimIdx = -1;
          clearResolutionAfterPending = true;
        }
      } else {
        clearResolutionAfterPending = true;
      }
    }
  }

  if (clientDeferredIdx >= 0) return true;
  if (pendingClaimIdx >= 0) return true;
  if (unansweredQuestion) return true;
  return false;
}

function isProblemProbe(text) {
  const t = flat(text);
  return (
    /\banything else (?:wrong|broken|missing|happened|you can tell)\b/i.test(t) ||
    /\bwhat else (?:happened|went wrong|is wrong)\b/i.test(t)
  );
}

function isClosingCheck(text) {
  const t = flat(text);
  if (!t || t.length > 600) return false;
  if (isPendingWork(t) || isProblemProbe(t)) return false;
  if (/^\s*how (?:may|can) (?:we|i) (?:be of )?help\b/i.test(t) && !/\banything else\b/i.test(t)) return false;
  if (/\banything else\b/i.test(t)) return true;
  if (/\b(?:is there )?anything more (?:we|i) can (?:help|do|assist)\b/i.test(t)) return true;
  if (/\bany other (?:questions|concerns|issues)\b/i.test(t)) return true;
  if (/\bif you need (?:any )?(?:further|more) assistance\b/i.test(t)) return true;
  if (/\bfeel free to reach out\b/i.test(t)) return true;
  if (/\blet (?:me|us) know if\b/i.test(t) && /\b(?:anything else|you need anything|further assistance|need anything else)\b/i.test(t)) {
    return true;
  }
  if (/\bbefore we wrap up\b/i.test(t)) return true;
  return false;
}

function isOpeningOffer(text) {
  return /^\s*how (?:may|can) (?:we|i) (?:be of )?help\b/i.test(flat(text));
}

function isHandoffPlaceholder(text) {
  return /\b(?:will soon be here|team member will|connecting you)\b/i.test(flat(text));
}

function asksClientForMore(text) {
  if (isClosingCheck(text)) return false;
  return INFO_REQUEST_RE.test(flat(text));
}

function isComplaintOrNegative(text) {
  return COMPLAINT_RE.test(flat(text));
}

function isSatisfactionPhrase(text) {
  let t = normalizeUtterance(text);
  if (!t || t.length > 140) return false;
  if (/\d{5,}/.test(t)) return false;
  for (let i = 0; i < 4; i++) {
    if (SATISFACTION_PHRASES.has(t)) return true;
    const next = t.replace(
      /\s+(?:so much|very much|a lot|for your help|for the help|for everything|for the support|team|sir|mate|luna)$/i,
      ''
    );
    if (next === t) break;
    t = next;
  }
  return false;
}

/* SATISFACTION_SEMANTIC_V2 (2026-09-28, live 215476132844454).
 * The exact-phrase list above missed "Thank you very much arsal am happy you assit me".
 * A closure is now recognised by meaning: a gratitude or resolution signal, with NO open
 * signal anywhere in the message (question mark, contrast word, follow-up request,
 * negation/complaint, pending action, account number). Deterministic on purpose: when
 * any open signal is present it is NOT a closure (fail toward "answer normally"), and
 * the review flow then never sends and never holds. Names/typos are tolerated because
 * unknown words are neutral; only the listed signals decide. */
const GRATITUDE_TOKEN_RE = /^(?:th?[ae]?n+[kq]\w{0,6}|tahnk\w*|thnak\w*|thanx|thnx|thx|tnx|tx|ty|tysm|tyvm|tq|thnq|appreciat\w*|apreciat\w*|appriciat\w*|grateful|greatful|cheers|merci|gracias|grazie|shukriya|shukria|dhanyavad)$/;
const STRONG_RESOLVED_RE = /\b(?:solved|resolved|fixed|sorted|(?:it|that|this|everything)\s+(?:works|worked|helped|helps)|works\s+now|working\s+now|all\s+good|all\s+set|all\s+clear|all\s+sorted|that'?s\s+all|thats\s+all|that\s+is\s+all|nothing\s+else|nothing\s+more|no\s+(?:more|other|further)\s+questions?|got\s+it|understood|makes\s+sense|(?:is|are|it'?s|its|everything'?s|everything\s+is)\s+clear(?:\s+now)?|clear\s+now|crystal\s+clear|perfect|awesome|brilliant|excellent|wonderful|great|fantastic|amazing|helpful|very\s+helpful|much\s+appreciated|good\s+job|well\s+done|you'?re\s+the\s+best|youre\s+the\s+best|love\s+it)\b/i;
const WEAK_POSITIVE_RE = /\b(?:happy|glad|satisfied|pleased|clear|noted|good|nice|cool|okay|ok|alright|fine)\b/i;
const HAPPY_WITH_HELP_RE = /\b(?:i\s+am|i'?m|im|am|so|very|really|truly)\s+(?:happy|glad|satisfied|pleased)\s+(?:with|that|you|about|for|to\s+(?:hear|know))\b/i;
const OPEN_SIGNAL_RES = [
  /\b(?:but|however|although|though|except|whereas|yet|still|unless|anyway)\b/i,
  /\b(?:one|a|another|some|few|couple(?:\s+of)?)\s+(?:more\s+)?(?:question|questions|thing|things|doubt|query|queries)\b/i,
  /\b(?:question|questions|query|queries|doubt|doubts)\b/i,
  /\b(?:what|how|when|where|why|which|who|whom|whose)\b/i,
  /\b(?:can|could|would|will|should|shall|may|do|does|did|is|are)\s+(?:you|u|i|we|it|they|this|that|there|my)\b/i,
  /\b(?:please|pls|plz|kindly)\b/i,
  /\b(?:also|additionally|besides|another|again\s+(?:about|on|with)|one\s+more)\b/i,
  /\b(?:need|needs|needed|want|wanna|wish|require)\b/i,
  /\b(?:help\s+me|assist\s+me|tell\s+me|explain|clarify|let\s+me\s+know|check|confirm)\b/i,
  /\b(?:i'?ll|i\s+will|will\s+(?:try|check|test|see)|going\s+to|gonna|get\s+back|come\s+back|wait|waiting|pending)\b/i,
  /\b(?:not|no\s+longer|never|nothing\s+(?:works|changed|happened)|didn'?t|doesn'?t|don'?t|isn'?t|wasn'?t|aren'?t|haven'?t|hasn'?t|can'?t|cannot|won'?t|wouldn'?t|couldn'?t|dont|didnt|doesnt|isnt|cant|wont)\b/i,
  /\b(?:issue|problem|error|wrong|confus\w*|unclear|stuck|fail\w*|broken|missing|declin\w*|reject\w*|delay\w*)\b/i,
  /\b(?:payout|withdraw\w*|refund|kyc|verification|account|login|password|breach\w*|violation)\b/i,
];

function stripClosureIdioms(t) {
  // Idioms whose words would otherwise read as open signals ("no problem", "problem solved",
  // "no more questions", "nothing else", "not at all"). Removed before the open-signal scan.
  return t
    .replace(/\b(?:no|nope|nah)\s+(?:more|other|further)\s+(?:questions?|queries|doubts)\b/g, ' ')
    .replace(/\b(?:no|not\s+a)\s+(?:problem|issue|worries)\b/g, ' ')
    .replace(/\b(?:problem|issue|question|payout|account|it|everything)\s+(?:is\s+|was\s+|has\s+been\s+|got\s+)?(?:solved|resolved|fixed|sorted|clear|answered|done|received|approved|working|works)\b/g, ' resolved ')
    .replace(/\b(?:got|received)\s+(?:my|the)\s+(?:payout|withdrawal|refund|account|credentials|certificate)\b/g, ' resolved ')
    .replace(/\bnot\s+at\s+all\b/g, ' ')
    .replace(/\bthank\w*\s+(?:you\s+)?(?:again|once\s+again)\b/g, ' thanks ')
    .replace(/\s+/g, ' ')
    .trim();
}

function satisfactionSignals(text) {
  const raw = String(text || '');
  const t0 = normalizeUtterance(raw);
  const words = t0 ? t0.split(' ') : [];
  const gratitude = words.some((w) => GRATITUDE_TOKEN_RE.test(w)) || /\bthank\s*(?:you|u|yu|yo)\b/.test(t0);
  const t = stripClosureIdioms(t0);
  const strong = STRONG_RESOLVED_RE.test(t) || /\bresolved\b/.test(t);
  const happy = HAPPY_WITH_HELP_RE.test(t0);
  const weak = WEAK_POSITIVE_RE.test(t);
  const openSignals = [];
  if (/\?/.test(raw)) openSignals.push('question_mark');
  if (/\d{5,}/.test(t0)) openSignals.push('account_number');
  if (isComplaintOrNegative(raw)) openSignals.push('complaint');
  OPEN_SIGNAL_RES.forEach((re, i) => { if (re.test(t)) openSignals.push('open_' + i); });
  return { text: t0, words: words.length, gratitude, strong, happy, weak, openSignals };
}

function isClearSatisfactionClosure(text, opts) {
  const raw = String(text || '');
  if (!flat(raw)) return false;
  if (/\?/.test(raw)) return false;
  if (isComplaintOrNegative(raw)) return false;
  const t = normalizeUtterance(raw);
  if (!t || t.length > 240) return false;
  if (/^(?:no|nope|nah)$/.test(t)) return !!(opts && opts.afterClosingCheck);
  const sig = satisfactionSignals(raw);
  if (sig.openSignals.length) return false;
  if (isSatisfactionPhrase(raw)) return true;
  if (sig.words > 30) return false;
  if (sig.gratitude) return true;
  if (sig.strong && sig.words <= 12) return true;
  if (sig.happy && sig.words <= 12) return true;
  return false;
}

/* RESOLVED_CLOSURE_V1 (2026-10-06, live 215476262789309).
 * Resolved / understood / all-clear / thanks-after-resolution stays a closure even when
 * the sentence names a domain thing (reset, payout, account, risk, challenge, rule).
 * A real new ask in the same message is not a closure. Bare yes/no is not a closure.
 * Kept separate from isClearSatisfactionClosure, which still treats those domain words
 * as open signals so the existing review state machine does not change shape. */
function hasGenuineNewSupportAsk(text) {
  const raw = String(text || '');
  if (/\?/.test(raw)) return true;
  const t = normalizeUtterance(raw);
  if (!t) return false;
  if (/^(?:what|how|when|where|why|which|can|could|would)\b/.test(t)) return true;
  if (/\b(?:one|another|\d+)\s+more\s+questions?\b/.test(t)) return true;
  if (/\b(?:i\s+have|i'?ve\s+got|got)\s+(?:a|one|another|some|\d+)\s+(?:more\s+)?(?:questions?|queries|doubts)\b/.test(t)) return true;
  if (/\b(?:can|could|would)\s+you\b/.test(t)) return true;
  if (/\b(?:what|how|when|where|why|which)\s+(?:can|could|do|does|did|should|will|would|is|are)\s+(?:i|you|we|my|the|it)\b/.test(t)) return true;
  if (/\b(?:please|pls|kindly)\s+(?:check|look|help|reset|review|investigate|explain|tell|confirm)\b/.test(t)) return true;
  if (/\b(?:i\s+)?(?:need|want)\s+(?:help|assistance|you\s+to)\b/.test(t)) return true;
  if (/\b(?:but|however)\b/.test(t) && /\b(?:still|pending|rejected|failed|problem|issue|wrong|help)\b/.test(t)) return true;
  return false;
}

function expressesResolution(text) {
  const t = normalizeUtterance(text);
  if (!t) return false;
  if (/\b(?:don'?t|do not|didn'?t|cannot|can'?t)\s+understand\b/.test(t)) return false;
  if (/\b(?:not|never|isn'?t|still)\s+clear\b/.test(t)) return false;
  if (/\b(?:i\s+)?(?:understand|understood)\b/.test(t)) return true;
  if (/\b(?:get it|got it|makes?\s+sense)\b/.test(t)) return true;
  if (/\b(?:all\s+clear|clear\s+now|crystal\s+clear|all\s+good|all\s+set|all\s+sorted|that'?s\s+all|thats\s+all|that\s+is\s+all|nothing\s+else|nothing\s+more|no\s+more|sorted|resolved|fixed)\b/.test(t)) return true;
  if (/\bperfect\b/.test(t) && /\b(?:now|understand|clear|thanks|thank)\b/.test(t)) return true;
  if (/\b(?:thanks|thank\s+you|thankyou|thx)\b/.test(t) && /\b(?:understand|clear|sense|resolved|sorted|fixed|helped)\b/.test(t)) return true;
  return false;
}

function isResolutionClosure(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 320) return false;
  if (/\?/.test(raw)) return false;
  if (isComplaintOrNegative(raw)) return false;
  const t = normalizeUtterance(raw);
  if (!t || t.length > 280) return false;
  if (/^(?:no|nope|nah|yes|yep|yeah|yup)$/.test(t)) return false;
  if (hasGenuineNewSupportAsk(raw)) return false;
  return expressesResolution(t);
}

function isClientQuestion(text) {
  if (isClearSatisfactionClosure(text, { afterClosingCheck: true })) return false;
  const raw = String(text || '');
  if (/\?/.test(raw)) return true;
  return CLIENT_QUESTION_RE.test(flat(raw));
}

function historyHasReviewRequest(parts) {
  for (const part of parts || []) {
    if (!part || isNote(part)) continue;
    const body = partBody(part);
    if (/trustpilot\.com\/review\/fundedelite\.com/i.test(body) && /propfirmmatch\.com\/prop-firms\/fundedelite/i.test(body)) {
      return true;
    }
  }
  return false;
}

function findLatestClientIndex(parts, latestPartId) {
  const want = String(latestPartId || '');
  if (want) {
    for (let i = (parts || []).length - 1; i >= 0; i--) {
      if (String((parts[i] && parts[i].id) || '') === want) return i;
    }
  }
  for (let i = (parts || []).length - 1; i >= 0; i--) {
    if (isClientPart(parts[i]) && partBody(parts[i])) return i;
  }
  return -1;
}

function lastSupportBefore(parts, latestIdx, opts) {
  for (let i = latestIdx - 1; i >= 0; i--) {
    if (!isSupportPublic(parts[i], opts)) continue;
    // A courtesy teammate ack must not hide Luna's resolution or block the closing check.
    if (!isLunaPublic(parts[i], opts) && handoff.classifyTeammatePublicReply(partBody(parts[i])) === 'courtesy') {
      continue;
    }
    return { index: i, body: partBody(parts[i]), id: String(parts[i].id || '') };
  }
  return null;
}

function classifySupport(body) {
  if (!body) return 'none';
  if (isPendingWork(body)) return 'pending';
  if (isClosingCheck(body)) return 'closing';
  if (asksClientForMore(body) || isOpeningOffer(body) || isHandoffPlaceholder(body)) return 'open';
  if (/\?/.test(body)) return 'open';
  const words = flat(body).split(/\s+/).filter(Boolean);
  if (words.length >= 6 && flat(body).length >= 20) return 'resolution';
  return 'open';
}

function hasUnansweredClientQuestion(parts, lastSupportIdx, latestIdx) {
  for (let i = lastSupportIdx + 1; i < latestIdx; i++) {
    if (!isClientPart(parts[i])) continue;
    if (isClientQuestion(partBody(parts[i]))) return true;
  }
  return false;
}

function hasUnresolvedComplaint(parts, lastSupportIdx, latestIdx) {
  if (latestIdx >= 0 && isComplaintOrNegative(partBody(parts[latestIdx]))) return true;
  for (let i = lastSupportIdx + 1; i < latestIdx; i++) {
    if (!isClientPart(parts[i])) continue;
    if (isComplaintOrNegative(partBody(parts[i]))) return true;
  }
  return false;
}

function none(reason, extra) {
  return Object.assign({ action: 'NONE', reason, body: '', suppress: false, satisfaction: false }, extra || {});
}

/* REVIEW_ELIGIBILITY_V2 (2026-09-28). Ask only when ALL hold: clear satisfaction/closure, no
 * unanswered client question or open complaint, no escalation/backend work pending, no active
 * teammate ownership, no CURRENT stop, and no review already asked in this conversation.
 *
 * `suppress: true` means "end this turn without a normal reply". It is allowed ONLY for a pure
 * closure message (isClearSatisfactionClosure: no question, contrast or request) in states where
 * no reply is due: the review was already asked, the closing check was already sent for this very
 * part, or a CURRENT stop is in force. Every other NONE passes through to the normal reply path,
 * which keeps its own silence/teammate/escalation gates unchanged. */
function decideReviewFlow(input) {
  const ctx = input || {};
  const parts = ctx.parts || [];
  const opts = ctx.opts || {};
  const flags = ctx.flags || {};
  const state = ctx.state || {};
  const latestText = ctx.latestText || '';
  const latestPartId = String(ctx.latestPartId || '');
  const latestIdx = findLatestClientIndex(parts, latestPartId);
  const support = latestIdx >= 0 ? lastSupportBefore(parts, latestIdx, opts) : null;
  const supportKind = support ? classifySupport(support.body) : 'none';
  const afterClosingCheck = supportKind === 'closing';
  const satisfaction = isClearSatisfactionClosure(latestText, { afterClosingCheck }) || isResolutionClosure(latestText);
  const control = resolveControlState(parts, opts, ctx.controlDeps);
  const controlInfo = {
    controlState: control.state,
    activeStop: control.stop,
    staleStops: control.stale.length,
  };
  const x = (extra) => Object.assign({}, controlInfo, extra || {});

  if (flags.aiOff || flags.explicitSilence) {
    return none('explicit_silence', x({ suppress: !!satisfaction, satisfaction }));
  }
  if (control.state === 'STOP') {
    // A stop AFTER Luna's latest public reply is current: no review, and a pure closure needs no
    // reply. Anything else goes to the normal path (its pre-send stop gate is unchanged).
    return none('active_stop', x({ suppress: !!satisfaction, satisfaction }));
  }
  if (flags.riskOwned || flags.escalationsOwned) {
    return none('backend_pending', x({ satisfaction }));
  }
  if (!satisfaction) return none('not_satisfaction', x());

  if (state.reviewRequested || historyHasReviewRequest(parts)) {
    return none('review_already_requested', x({ suppress: true, satisfaction: true }));
  }
  if (
    state.reviewStep1Done &&
    state.reviewStep1By === 'luna' &&
    latestPartId &&
    String(state.reviewStep1ForClientPartId || '') === latestPartId
  ) {
    return none('closing_check_already_sent_for_part', x({ suppress: true, satisfaction: true }));
  }
  if (hasUnresolvedComplaint(parts, support ? support.index : -1, latestIdx)) {
    return none('complaint_unresolved', x({ satisfaction: true }));
  }
  if (hasUnansweredClientQuestion(parts, support ? support.index : -1, latestIdx)) {
    return none('unanswered_question', x({ satisfaction: true }));
  }
  if (flags.escalateAwaiting || flags.riskAwaiting) {
    return none('backend_pending', x({ satisfaction: true }));
  }
  if (supportKind === 'pending') return none('human_work_pending', x({ satisfaction: true }));
  // Pending handoff / open issue anywhere in recent context — not only the last support line,
  // and not only when an internal escalateAwaiting note exists.
  if (conversationHasOpenSupportWork(parts, opts, latestIdx)) {
    return none('open_support_work', x({ satisfaction: true }));
  }
  if (flags.teammateSilence) return none('teammate_silence', x({ satisfaction: true }));
  // Active teammate ownership: a human teammate spoke last and has not closed the loop. Luna does
  // not step into a teammate's case with its own closing check. A teammate's OWN closing check
  // (step 1 done by the human) still lets Luna send the one review ask (existing policy, case B).
  if (support && supportKind !== 'closing' && !isLunaPublic(parts[support.index], opts)) {
    return none('teammate_owned', x({ satisfaction: true }));
  }
  if (supportKind === 'closing') {
    return Object.assign(x(), {
      action: 'SEND_REVIEW',
      reason: 'satisfaction_after_closing_check',
      body: REVIEW_REQUEST_TEXT,
      suppress: false,
      satisfaction: true,
      closingCheckBy: isLunaPublic(parts[support.index], opts) ? 'luna' : 'human',
      closingCheckPartId: support.id,
    });
  }
  if (supportKind === 'resolution') {
    return Object.assign(x(), {
      action: 'SEND_CLOSING_CHECK',
      reason: 'need_closing_check',
      body: CLOSING_CHECK_TEXT,
      suppress: false,
      satisfaction: true,
      closingCheckBy: '',
      closingCheckPartId: '',
    });
  }
  return none('not_resolved', x({ satisfaction: true }));
}

// The ONLY states in which the review flow may end a turn without the normal reply path.
const HOLD_REASONS = new Set(['review_already_requested', 'closing_check_already_sent_for_part', 'active_stop', 'explicit_silence']);

function mayEndTurnWithoutReply(decision, latestText) {
  if (!decision || !decision.suppress || !decision.satisfaction) return false;
  if (!HOLD_REASONS.has(decision.reason)) return false;
  // Re-check the message itself: a hold is only for a pure closure (no question/contrast/request).
  return isClearSatisfactionClosure(latestText, { afterClosingCheck: true });
}

function bypassesTeammateDefer(decision) {
  return !!(decision && (decision.action === 'SEND_REVIEW' || decision.action === 'SEND_CLOSING_CHECK'));
}

function claimSend(state, action, partId, now) {
  const st = state || {};
  const at = Number(now || Date.now());
  const part = String(partId || '');
  if (action !== 'SEND_REVIEW' && action !== 'SEND_CLOSING_CHECK') {
    return { ok: false, reason: 'not_a_send' };
  }
  if (action === 'SEND_REVIEW' && st.reviewRequested) {
    return { ok: false, reason: 'review_already_requested' };
  }
  if (
    action === 'SEND_CLOSING_CHECK' &&
    st.reviewStep1Done &&
    st.reviewStep1By === 'luna' &&
    part &&
    String(st.reviewStep1ForClientPartId || '') === part
  ) {
    return { ok: false, reason: 'closing_check_already_sent' };
  }
  if (
    st.reviewClaimAction === action &&
    String(st.reviewClaimPartId || '') === part &&
    st.reviewClaimAt &&
    at - Number(st.reviewClaimAt) < CLAIM_WINDOW_MS
  ) {
    return { ok: false, reason: 'send_in_flight' };
  }
  st.reviewClaimAction = action;
  st.reviewClaimPartId = part;
  st.reviewClaimAt = at;
  return { ok: true };
}

function commitSend(state, action, partId, now, meta) {
  const st = state || {};
  const at = Number(now || Date.now());
  const info = meta || {};
  st.reviewClaimAction = '';
  st.reviewClaimPartId = '';
  st.reviewClaimAt = 0;
  if (action === 'SEND_CLOSING_CHECK') {
    st.reviewStep1Done = true;
    st.reviewStep1By = 'luna';
    st.reviewStep1At = at;
    st.reviewStep1ForClientPartId = String(partId || '');
    return st;
  }
  if (action === 'SEND_REVIEW') {
    st.reviewRequested = true;
    st.reviewRequestedAt = at;
    st.reviewRequestedForClientPartId = String(partId || '');
    if (!st.reviewStep1Done && info.step1By) {
      st.reviewStep1Done = true;
      st.reviewStep1By = info.step1By;
      st.reviewStep1At = at;
      st.reviewStep1SupportPartId = String(info.step1SupportPartId || '');
    }
  }
  return st;
}

function releaseClaim(state) {
  const st = state || {};
  st.reviewClaimAction = '';
  st.reviewClaimPartId = '';
  st.reviewClaimAt = 0;
  return st;
}

// REVIEW_ASK_WHOLE_SENTENCE_V1 (2026-09-26, live 215476113653496).
// Review-request sentences written by the model itself (Section G wording and
// close variants). Only the deterministic review flow may send a review ask, so
// a model-written ask is removed as whole sentences / whole link blocks — never
// cut mid-sentence (a partial cut once shipped "…we'd appreciate a").
const REVIEW_URL_RE = /https?:\/\/(?:www\.)?(?:trustpilot\.com|propfirmmatch\.com)\/\S*/i;
const REVIEW_PLATFORM_RE = /\b(?:trust\s?pilot|prop\s?firm\s?match)\b/i;
const REVIEW_NOUN_RE = /\b(?:reviews?|ratings?|testimonials?|feedback|stars?)\b/i;
const REVIEW_ASK_RES = [
  // "leave/share/write/drop/give/post us a quick review"
  /\b(?:leave|leaving|share|sharing|write|writing|drop|dropping|give|giving|post|posting|submit|submitting)\s+(?:us\s+)?(?:a|an|your)?\s*(?:quick|short|brief|honest|positive|good|kind|(?:5|five)[- ]star)?\s*(?:review|rating|testimonial)\b/i,
  // "we'd appreciate a quick review / your feedback", "appreciate it if you could leave …"
  /\bappreciate\s+(?:(?:a|an|your)\s+(?:quick\s+|short\s+|brief\s+|honest\s+)?(?:review|rating|feedback|testimonial)|it\s+if\s+you\b)/i,
  /\b(?:review|rate)\s+us\b/i,
  /\brate\s+(?:your\s+)?(?:experience|support)\b/i,
];
// Conditional lead-ins that only ever introduce a review ask in this bot:
// "If you're / you are / you were / you've been happy|satisfied|pleased …".
const REVIEW_LEADIN_RE = /\bif\s+you\s*(?:'re|’re|\s+are|\s+were|'ve\s+been|’ve\s+been|\s+have\s+been|\s+felt)\s+(?:happy|satisfied|pleased)\b/i;
const REVIEW_ASK_NOUN_RE = /\b(?:a|an|your|quick|short|brief)\s+(?:review|rating|feedback|testimonial)\b/i;
const REVIEW_TAIL_RES = [
  /^(?:that|this)(?:'|’)s\s+(?:wonderful|great|lovely|so\s+good)\s+to\s+hear\b/i,
  /\bthank\s+you\s+for\s+choosing\s+fundedelite\b/i,
  /\byour\s+feedback\s+(?:means|helps|matters)\b/i,
];

function splitSentences(line) {
  // Sentence units that keep their trailing whitespace, so joining kept units
  // reproduces the original spacing. A Latin terminator ends a sentence only when
  // followed by whitespace/end (URLs and decimals stay intact); CJK terminators
  // end a sentence directly.
  const out = [];
  const re = /(?:[.!?]+["')\]]*(?=\s|$)|[。！？]+["')\]」』]*)\s*/g;
  let last = 0;
  let m;
  while ((m = re.exec(line))) {
    const end = m.index + m[0].length;
    if (end > last) out.push(line.slice(last, end));
    last = end;
    if (m[0] === '') re.lastIndex++;
  }
  if (last < line.length) out.push(line.slice(last));
  return out.length ? out : [line];
}

function isReviewAskSentence(s) {
  const t = String(s || '');
  if (!t.trim()) return false;
  if (REVIEW_URL_RE.test(t)) return true;
  if (/^\s*(?:trust\s?pilot|prop\s?firm\s?match)\s*:?\s*$/i.test(t)) return true;
  if (REVIEW_ASK_RES.some((re) => re.test(t))) return true;
  if (REVIEW_LEADIN_RE.test(t) && (/\bappreciate\b/i.test(t) || REVIEW_PLATFORM_RE.test(t) || REVIEW_ASK_NOUN_RE.test(t))) return true;
  if (REVIEW_PLATFORM_RE.test(t) && REVIEW_NOUN_RE.test(t)) return true;
  if (/\breview\s+(?:links?|pages?)\b/i.test(t)) return true;
  return false;
}

// The client asked about reviews themselves ("where can I leave a review?", "I posted on Trustpilot"):
// an answer about reviews is then solicited and is not stripped.
const CLIENT_REVIEW_TOPIC_RE = /\b(?:trust\s?pilot|prop\s?firm\s?match)\b|\b(?:leave|write|post|give|share|submit|left|wrote|posted|gave)\s+(?:you\s+|u\s+)?(?:a|an|my|the)?\s*(?:\S+\s+)?(?:review|rating)s?\b|\breviews?\s+(?:link|page|site)\b/i;

function stripUnsolicitedReviewAsk(text, clientText) {
  const src = String(text || '');
  if (!src.trim()) return src;
  if (clientText && CLIENT_REVIEW_TOPIC_RE.test(String(clientText))) return src;
  const lines = src.split('\n');
  const units = lines.map((line) => splitSentences(line).map((s) => ({ s, drop: false })));
  let found = false;
  for (const lineUnits of units) {
    for (const u of lineUnits) {
      if (isReviewAskSentence(u.s)) { u.drop = true; found = true; }
    }
  }
  if (!found) return src;
  // Template companions of a review ask (opener, "your feedback means a lot",
  // "thank you for choosing FundedElite") go with it; on their own they are kept.
  for (const lineUnits of units) {
    for (const u of lineUnits) {
      const t = u.s.replace(/^[\s\p{Extended_Pictographic}\uFE0F\u200D]+/u, '');
      if (!u.drop && REVIEW_TAIL_RES.some((re) => re.test(t))) u.drop = true;
    }
  }
  // An introducer left ending in ":" ("Here are the links:", "You can leave it here:") whose following content was
  // removed would dangle; it goes too. Kept content after it keeps it.
  const flat = [].concat(...units);
  for (let i = 0; i < flat.length; i++) {
    const u = flat[i];
    if (u.drop || !/:\s*$/.test(u.s)) continue;
    const next = flat.slice(i + 1).find((v) => v.s.trim());
    if (!next || next.drop) u.drop = true;
  }
  const outLines = units.map((lineUnits) => {
    // A dropped sentence's leading emoji ("… know! 😊 If you were happy …") stays with the kept text.
    const kept = lineUnits.map((u) => {
      if (!u.drop) return u.s;
      const lead = (u.s.match(/^[\s\p{Extended_Pictographic}\uFE0F\u200D]+/u) || [''])[0];
      return /\p{Extended_Pictographic}/u.test(lead) ? lead.trimEnd() : '';
    }).join('');
    return kept.replace(/[ \t]+$/g, '').replace(/^[ \t]+/, (w) => w);
  });
  let out = outLines
    .map((l) => (/^[\s\p{Extended_Pictographic}\uFE0F\u200D:.,;!-]*$/u.test(l) ? '' : l))
    .join('\n');
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = {
  CLOSING_CHECK_TEXT,
  REVIEW_REQUEST_TEXT,
  TRUSTPILOT_URL,
  PROPFIRMMATCH_URL,
  CLAIM_WINDOW_MS,
  isClosingCheck,
  isPendingWork,
  conversationHasOpenSupportWork,
  isClearSatisfactionClosure,
  isResolutionClosure,
  isComplaintOrNegative,
  decideReviewFlow,
  bypassesTeammateDefer,
  claimSend,
  commitSend,
  releaseClaim,
  stripUnsolicitedReviewAsk,
  isReviewAskSentence,
  historyHasReviewRequest,
  explicitSilenceFromNotes,
  resolveControlState,
  classifyControlNote,
  mayEndTurnWithoutReply,
  satisfactionSignals,
  RESUME_INTENT_RE,
};
