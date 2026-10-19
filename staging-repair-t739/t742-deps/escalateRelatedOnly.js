const { isGreetingOrSmallTalk } = require('./statePresend/textUtils');
/**
 * Luna , escalate awaiting-teammate RELATED-only status hold.
 * Engine target: fresh-2026-09-15-escalate-related-only-v1
 *
 * While escalateAwaitingFirstTeammate is true (before first teammate public reply):
 *  - RELATED follow-ups → STATUS_ONLY (varied holding lines; do not invent decisions)
 *  - Short acks → SKIP (no status spam)
 *  - Unrelated clear FAQ / other unrelated asks → FALLTHROUGH (answer normally;
 *    escalate state itself stays armed)
 *
 * Wire from index.js (see APPLY.md). Additive; does not replace prior locks.
 */

'use strict';

const ENGINE_ID = 'fresh-2026-09-15-escalate-related-only-v1';

// ---------------------------------------------------------------------------
// Normalize / helpers
// ---------------------------------------------------------------------------

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMessageContent(msg) {
  if (!msg) return '';
  if (typeof msg === 'string') return msg;
  return msg.content || msg.body || msg.text || msg.message || '';
}

function wordOverlapScore(a, b) {
  const stop = new Set([
    'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'is', 'it',
    'my', 'me', 'i', 'you', 'your', 'we', 'our', 'this', 'that', 'with', 'at',
    'be', 'as', 'so', 'if', 'can', 'please', 'hi', 'hello', 'hey', 'just',
  ]);
  const tok = (s) =>
    normalizeText(s)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !stop.has(w));
  const A = new Set(tok(a));
  const B = tok(b);
  if (!A.size || !B.length) return 0;
  let hit = 0;
  for (const w of B) if (A.has(w)) hit += 1;
  return hit / Math.max(3, Math.min(A.size, 12));
}

// ---------------------------------------------------------------------------
// Topic detection (from escalate note / Problem text)
// ---------------------------------------------------------------------------

const TOPIC_PATTERNS = [
  {
    topic: 'ip_risk',
    re: /\b(ip\s*(ban|block|mismatch|change|address)?|vpn|vps|proxy|risk\s*team|risk\s*review|flagged|same\s*ip|device\s*fingerprint|colo(cation)?)\b/i,
  },
  {
    topic: 'reset',
    re: /\b(reset|free\s*retry|restart\s*(the\s*)?(challenge|account)|new\s*challenge\s*after\s*fail)\b/i,
  },
  {
    topic: 'payout',
    re: /\b(payout|withdraw(al)?|cash\s*out|profit\s*share|wise|crypto\s*payout|payment\s*method)\b/i,
  },
  {
    topic: 'kyc_proof',
    re: /\b(kyc|proof|verification|verify|id\s*document|passport|utility\s*bill|selfie|poi|poa)\b/i,
  },
  {
    topic: 'breach_rules',
    re: /\b(breach|violat(e|ion)|drawdown|daily\s*loss|max\s*loss|consistency|forbidden|hedging|ea\s*ban)\b/i,
  },
  {
    topic: 'account_access',
    re: /\b(login|password|2fa|cannot\s*log|can'?t\s*log|locked\s*out|dashboard\s*access)\b/i,
  },
  {
    topic: 'billing',
    re: /\b(refund|charge(d|back)?|billing|invoice|payment\s*failed|card\s*declined)\b/i,
  },
  {
    // PROMO_CHECKOUT_FAILURE_V1: named coupon / checkout promo issues
    topic: 'promo_checkout',
    re: /\b(?:new\s*50|new50|oct\s*3535|oct35|flash\s*5|flash5)\b[\s\S]{0,120}\b(?:not\s+apply|doesn'?t\s+apply|can(?:not|'?t)\s+use|won'?t\s+apply|never\s+apply|not\s+working|failed|checkout|dashboard|creating\s+(?:the\s+)?account|24\s*hours?)\b|\b(?:can(?:not|'?t)\s+use|doesn'?t\s+apply|not\s+applying|never\s+apply|anymore)\b[\s\S]{0,60}\b(?:new\s*50|new50|oct\s*3535|oct35|code|coupon|discount)\b|\b(?:promo|discount)\s*code\b[\s\S]{0,80}\b(?:not\s+apply|never\s+apply|checkout|24\s*hours?)\b/i,
  },
];

function detectEscalateTopics(text) {
  const q = String(text || '');
  const topics = [];
  for (const row of TOPIC_PATTERNS) {
    if (row.re.test(q)) topics.push(row.topic);
  }
  return topics;
}

function primaryEscalateTopic(text) {
  const topics = detectEscalateTopics(text);
  return topics[0] || 'general';
}

/**
 * Build context snapshot to store on escalate (additive state fields).
 * Safe to call with partial note / problem strings.
 */
function buildEscalateContext({ problem, noteBody, clientTexts, topic } = {}) {
  const problemText = String(problem || '').trim();
  const note = String(noteBody || '').trim();
  const joinedClients = Array.isArray(clientTexts)
    ? clientTexts.filter(Boolean).slice(-8).join(' | ')
    : String(clientTexts || '');
  const blob = [problemText, note, joinedClients].filter(Boolean).join('\n');
  const detected = topic || primaryEscalateTopic(blob);
  return {
    lastEscalateProblem: (problemText || joinedClients || note).slice(0, 1200),
    lastEscalateNoteSnippet: note.slice(0, 800),
    lastEscalateTopic: detected,
    lastEscalateTopics: detectEscalateTopics(blob),
  };
}

// ---------------------------------------------------------------------------
// Short-ack lock (no status spam)
// ---------------------------------------------------------------------------

function isShortAck(text) {
  const q = normalizeText(text);
  if (!q) return true;
  // Waiting ack while escalate-awaiting (215476045133527)
  // Also 215476169761054: "Okay Ill wait till that" / "I'll wait until then".
  if (/^(ok(ay)?\s+)?(i(('|\u2019)?(m|ll)|\s+am|\s+will)\s+)?(just\s+)?wait(ing)?(\s+(for|till|until)(\s+(\w+\s+){0,3}(update|reply|answer|news|it|you|that|then|the team))?)?[.!\s]*$/i.test(q)) {
    return true;
  }
  try {
    if (require('./statePresend/textUtils').isWaitingOrStatusAck(text)) return true;
  } catch (_) { /* optional */ }
  // Very short thank-you / ok / emoji-ish
  if (q.length <= 24) {
    if (
      /^(ok(ay)?|k|kk|thanks?( you)?|thx|ty|thank\s*u|got\s*it|alright|all\s*right|sure|cool|great|perfect|fine|noted|understood|roger|👍|🙏|👌|💯)([.!\s]*)$/i.test(
        q
      )
    ) {
      return true;
    }
  }
  if (
    /^(ok(ay)?|thanks?( you)?|thx|ty|got\s*it)([,!]?\s+(thanks?( you)?|ok(ay)?|thx))?([.!\s]*)$/i.test(
      q
    )
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Clear KB / general FAQ (unrelated → answer normally)
// ---------------------------------------------------------------------------


/** PROMO_CHECKOUT_FAILURE_V1 — shared failure shape (must stay aligned with september-promos). */
function isPromoCheckoutFailureText(text) {
  const q = normalizeText(text);
  if (!q) return false;
  const named =
    /\b(?:new\s*50|new50|oct\s*3535|oct35|flash\s*5|flash5)\b/.test(q) ||
    /\b(?:promo|discount|coupon|voucher)\s*codes?\b/.test(q) ||
    /\b(?:the|my|this|that)\s+(?:code|coupon|discount|promo)\b/.test(q);
  if (!named) return false;
  return (
    /\b(?:can(?:not|'?t)|unable\s+to|won'?t|does\s*n(?:ot|')t|did\s*n(?:ot|')t|not|never)\s+(?:\w+\s+){0,4}(?:apply|applied|work|working|use|using|accept|accepted)\b/.test(q) ||
    /\b(?:code|coupon|discount|promo)\b[^.?!\n]{0,60}\b(?:not\s+(?:apply|working|accepted)|does\s*n(?:ot|')t\s+apply|won'?t\s+apply|never\s+apply|failed|invalid)\b/.test(q) ||
    /\b(?:just\s+)?(?:does\s*n(?:ot|')t|doesnt|won't|wont|never)\s+applys?\b/.test(q) ||
    /\beven\s+(?:in|on)\s+(?:the\s+)?dashboard\b/.test(q) ||
    /\bbefore\s+creating\s+(?:the\s+)?account\b/.test(q) ||
    /\bafter\s+creating\s+(?:the\s+)?account\b/.test(q) ||
    /\b24\s*hours?\b[^.?!\n]{0,80}\b(?:appl|expir)/.test(q) ||
    /\banymore\b/.test(q)
  );
}

function isClearKbFaqAsk(text) {
  // Read obvious typos through first. Otherwise a garbled but perfectly clear FAQ question
  // ("okay whaot is 2 stop chollonge ?") stays locked out while a teammate is awaited, which is
  // exactly the case the awaiting-lock exception exists for (owner rule 2026-09-21).
  let raw = String(text || '');
  try { raw = require('./statePresend/typoNormalizer').normalizeText(raw); } catch (_) {}
  const q = normalizeText(raw);
  if (!q || isShortAck(q)) return false;

  // Catalyst Challenge
  if (/\bcatalyst(\s+challenge)?\b/.test(q)) return true;

  // Promo codes / SEP offers (general eligibility / what-is questions ONLY).
  // PROMO_CHECKOUT_FAILURE_V1: "NEW50 does not apply / I can't use the code" is NOT a clear
  // FAQ — it is related follow-up on an escalated checkout failure (live 215476080634453).
  if (/\b(oct35|flash5|new50|september\s+(promo|offer)|promo\s*code)\b/.test(q)) {
    if (!isPromoCheckoutFailureText(q)) return true;
  }

  // Leverage (general product)
  if (/\bleverage\b/.test(q) && !/\b(my|account|ticket|case|escalat)/.test(q)) {
    return true;
  }

  // Lite vs Standard / plan features
  if (
    (/\blite\b/.test(q) && /\bstandard\b/.test(q)) ||
    (/\b(lite|standard|free\s*retry)\b/.test(q) &&
      /\b(difference|different|vs\.?|versus|compare|features?|rules?)\b/.test(q))
  ) {
    return true;
  }

  // General payout minimum / schedule FAQ (not "where is MY payout")
  if (
    /\b(payout\s*min(imum)?|minimum\s*payout|how\s+(much|long).{0,40}payout|payout\s*(time|schedule|policy))\b/.test(
      q
    ) &&
    !/\b(my\s+payout|where\s+is\s+my|still\s+waiting\s+on\s+my)\b/.test(q)
  ) {
    return true;
  }

  // Classic challenge FAQ
  if (
    /\b(profit\s*target|drawdown|daily\s*loss|trading\s*days?|news\s*trading|ea\s*allowed|expert\s*advisor)\b/.test(
      q
    ) &&
    /\b(what|how|is|are|can|does|do|which)\b/.test(q)
  ) {
    return true;
  }

  // "what is X" product questions
  if (
    /\bwhat\s+is\b/.test(q) &&
    /\b(catalyst|challenge|lite|standard|oct35|flash5|fundedelite|free\s*retry)\b/.test(q)
  ) {
    return true;
  }


  /* AUDIT_HARDEN_V1:faqPolicy */
  // General policy FAQ (not personal "MY payout was rejected" case)
  if (
    /\b(what\s+happens\s+if\s+i\s+violat|if\s+i\s+violat|what\s+if\s+i\s+(break|breach|violat)|policy\s+on\s+violat|breach\s+polic|rules?\s+violat)/.test(
      q
    ) &&
    !/\b(my\s+account|i\s+was\s+breach|my\s+breach|this\s+ticket)\b/.test(q)
  ) {
    return true;
  }
  if (
    /\b(payout\s+reject|what\s+if\s+(a\s+)?payout\s+(is\s+)?reject|why\s+(are|do)\s+payouts?\s+get\s+reject|payout\s+rejection\s+polic)/.test(
      q
    ) &&
    !/\b(my\s+payout|where\s+is\s+my|still\s+waiting\s+on\s+my)\b/.test(q)
  ) {
    return true;
  }
  if (
    /\b(what\s+(are|is)\s+the\s+(rules?|polic(y|ies))|general\s+(rules?|polic)|how\s+do\s+(resets?|payouts?)\s+work)\b/.test(
      q
    ) &&
    !/\b(my\s+account|my\s+payout|this\s+case|my\s+ticket)\b/.test(q)
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// RELATED to escalated problem
// ---------------------------------------------------------------------------

function isStatusPing(text) {
  const q = normalizeText(text);
  if (!q) return false;
  return (
    /\b(any\s+update|updates?|news\??|how\s+long|still\s+waiting|waiting\s+for|eta|when\s+will|when\s+can|status|progress|heard\s+back|follow\s*up|following\s*up|checking\s+in|check\s*in)\b/.test(
      q
    ) ||
    /^(update|status|news)\??$/.test(q) ||
    /\bis\s+(there|my)\s+(any\s+)?(update|news|progress)\b/.test(q)
  );
}

function isRelatedFollowUpCue(text) {
  const q = normalizeText(text);
  return (
    /\b(is\s+my\s+proof\s+enough|proof\s+enough|can\s+i\s+reset(\s+now)?|reset\s+now|did\s+you\s+(get|receive)|have\s+you\s+(got|received|seen)|same\s+(issue|problem)|about\s+(my|the)\s+(ip|risk|payout|reset|kyc|proof|review))\b/.test(
      q
    ) ||
    /\b(please\s+)?(check|review|look\s+at)\s+(my|the)\s+(proof|documents?|ip|account)\b/.test(q)
  );
}

function isHandoffOnlyEscalateProblem(ctx = {}) {
  const problem = String(
    ctx.escalateProblem ||
      ctx.lastEscalateProblem ||
      ctx.problem ||
      ''
  );
  const note = String(
    ctx.escalateNote ||
      ctx.lastEscalateNoteSnippet ||
      ctx.noteBody ||
      ''
  );
  const blob = normalizeText(problem + ' ' + note);
  if (!blob || detectEscalateTopics(blob).length) return false;
  return (
    /\b(arsal|live\s*agent|human\s*agent|real\s*(person|human)|talk\s+to|speak\s+to|connect\s+me|handoff|hand\s*off|teammate)\b/.test(blob) ||
    /^(hi|hello|hey)\s+arsal\b/.test(blob)
  );
}

/**
 * True when the client message is about the same escalated problem.
 * Uses escalate note / Problem text + topic , not vague "any follow-up".
 */
function isRelatedToEscalatedProblem(userText, ctx = {}) {
  const q = normalizeText(userText);
  if (!q || isShortAck(q)) return false;

  // Clear general FAQ is never "related" even if escalate was about something else
  if (isClearKbFaqAsk(q)) return false;

  // PROMO_CHECKOUT_FAILURE_V1: named-code apply failure while an open escalate mentions the
  // same code / promo checkout is the same case (live 215476080634453).
  if (isPromoCheckoutFailureText(q)) {
    const blobEarly = String(
      (ctx && (ctx.escalateProblem || ctx.lastEscalateProblem || ctx.problem)) || ''
    ) + '\n' + String((ctx && (ctx.escalateNote || ctx.lastEscalateNoteSnippet || ctx.noteBody)) || '');
    const topicsEarly = Array.isArray(ctx.lastEscalateTopics)
      ? ctx.lastEscalateTopics
      : detectEscalateTopics(blobEarly);
    if (topicsEarly.includes('promo_checkout') || /\b(?:new\s*50|new50|oct\s*3535|oct35|flash\s*5|flash5|promo|coupon|discount\s*code)\b/i.test(blobEarly)) {
      const codeHit =
        (/\bnew\s*50\b|\bnew50\b/i.test(q) && /\bnew\s*50\b|\bnew50\b/i.test(blobEarly)) ||
        (/\boct\s*3535\b|\boct35\b/i.test(q) && /\boct\s*3535\b|\boct35\b/i.test(blobEarly)) ||
        (/\bflash\s*5\b|\bflash5\b/i.test(q) && /\bflash\s*5\b|\bflash5\b/i.test(blobEarly)) ||
        /\b(?:promo|coupon|discount\s*code|checkout)\b/i.test(blobEarly);
      if (codeHit) return true;
    }
  }

  const problem = String(
    ctx.escalateProblem ||
      ctx.lastEscalateProblem ||
      ctx.problem ||
      ''
  );
  const note = String(
    ctx.escalateNote ||
      ctx.lastEscalateNoteSnippet ||
      ctx.noteBody ||
      ''
  );
  const topic =
    ctx.escalateTopic ||
    ctx.lastEscalateTopic ||
    primaryEscalateTopic(problem + '\n' + note);
  const topics = Array.isArray(ctx.lastEscalateTopics)
    ? ctx.lastEscalateTopics
    : detectEscalateTopics(problem + '\n' + note);
  if (topic && topic !== 'general' && !topics.includes(topic)) {
    topics.push(topic);
  }

  const userTopics = detectEscalateTopics(q);
  const topicOverlap =
    userTopics.length > 0 &&
    topics.length > 0 &&
    userTopics.some((t) => topics.includes(t));

  // A status-shaped sentence can still name a clearly different issue. For example,
  // "any update on my payout?" must not be attached to an older IP review, and a
  // bare Arsal/live-agent handoff must never absorb a later real support topic.
  if (isStatusPing(q)) {
    if (userTopics.length && topics.length && !topicOverlap) return false;
    if (userTopics.length && !topics.length && isHandoffOnlyEscalateProblem(ctx)) return false;
    return true;
  }

  // Explicit same-problem follow-ups (proof enough / reset now / did you get…)
  // while awaiting , treat as RELATED even if the client does not repeat the
  // original IP/risk tokens (bug ticket pattern).
  if (isRelatedFollowUpCue(q)) return true;

  // Topic overlap with escalated problem
  if (userTopics.length && topics.length) {
    if (topicOverlap) return true;
  }

  // Lexical overlap against stored problem/note (meaningful tokens)
  const overlap = Math.max(
    wordOverlapScore(problem, q),
    wordOverlapScore(note, q),
    wordOverlapScore(problem + ' ' + note, q)
  );
  if (overlap >= 0.34 && !isClearKbFaqAsk(q)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Decision gate
// ---------------------------------------------------------------------------

/**
 * Per-message gate while awaiting first teammate public reply.
 *
 * @returns {{
 *   action: 'STATUS_ONLY'|'SKIP'|'FALLTHROUGH',
 *   reason: string,
 *   related: boolean,
 *   clearFaq: boolean,
 *   supersedesAwaiting: boolean,
 *   log: string
 * }}
 */
function decideEscalateAwaitingGate(input = {}) {
  const awaiting = !!(
    input.awaitingFirstTeammate ??
    input.escalateAwaitingFirstTeammate ??
    input.awaiting
  );
  const userText = String(input.userText || input.text || input.message || '');

  if (!awaiting) {
    return {
      action: 'FALLTHROUGH',
      reason: 'not_awaiting',
      related: false,
      clearFaq: false,
      supersedesAwaiting: false,
      log: 'ESCALATE gate skip (not awaiting teammate)',
    };
  }

  if (isShortAck(userText)) {
    return {
      action: 'SKIP',
      reason: 'short_ack',
      related: false,
      clearFaq: false,
      supersedesAwaiting: false,
      log: 'ESCALATE short-ack SKIP (awaiting teammate first)',
    };
  }

  // IMAGE_ONLY_AWAITING_V1: bare "[Image]" / attachment placeholders while awaiting are
  // follow-ups on the open case (client sent proof), not unrelated FAQ fallthrough.
  const bareMedia =
    /^(?:\[\s*(?:image|attachment|video|file|screenshot|photo)s?\s*\]|\(image\)|<image>)$/i.test(
      String(userText || '').trim()
    ) ||
    (!String(userText || '').replace(/\[[^\]]*\]/g, '').trim() &&
      /\[\s*(?:image|attachment|video|file|screenshot|photo)/i.test(String(userText || '')));
  if (bareMedia || (input.hasAttachments && !String(userText || '').replace(/\[[^\]]*\]/g, '').trim())) {
    return {
      action: 'STATUS_ONLY',
      reason: 'related_media_while_awaiting',
      related: true,
      clearFaq: false,
      supersedesAwaiting: false,
      log: 'ESCALATE status-only (awaiting teammate first, related media)',
    };
  }

  // Pure greeting / how-are-you while awaiting → normal reply, not status-hold
  // and not another "forwarded to a teammate" line.
  if (isGreetingOrSmallTalk(userText)) {
    return {
      action: 'FALLTHROUGH',
      reason: 'greeting_smalltalk',
      related: false,
      clearFaq: false,
      supersedesAwaiting: false,
      log: 'ESCALATE fallthrough greeting/smalltalk (awaiting teammate first)',
    };
  }

  const ctx = {
    escalateProblem: input.escalateProblem || input.lastEscalateProblem,
    escalateNote: input.escalateNote || input.lastEscalateNoteSnippet,
    escalateTopic: input.escalateTopic || input.lastEscalateTopic,
    lastEscalateTopics: input.lastEscalateTopics,
    problem: input.problem,
    noteBody: input.noteBody,
  };

  const clearFaq = isClearKbFaqAsk(userText);
  const related = isRelatedToEscalatedProblem(userText, ctx);

  // GENERAL_QUESTION_NOT_STATUS_V1 (2026-09-23): sharing a TOPIC with the escalated case does not
  // make a new general question a follow-up on it. "What is the payout split on Instant?" while a
  // payout-eligibility case is escalated is answerable from approved knowledge and must be answered,
  // not met with "our team is reviewing this". Status pings ("any update?") and explicit
  // same-problem cues ("did you get my proof?") keep STATUS_ONLY. The caller supplies the single
  // "knowledge-answerable, not account work" predicate (index.js isKnowledgeAnswerableAsk).
  if (
    related &&
    typeof input.isGeneralAnswerable === 'function' &&
    !isStatusPing(userText) &&
    !isRelatedFollowUpCue(userText) &&
    input.isGeneralAnswerable(userText)
  ) {
    return {
      action: 'FALLTHROUGH',
      reason: 'related_topic_general_question',
      related: false,
      clearFaq: true,
      supersedesAwaiting: false,
      log: 'ESCALATE fallthrough general question on escalated topic (awaiting teammate first)',
    };
  }

  if (related) {
    return {
      action: 'STATUS_ONLY',
      reason: 'related_to_escalate',
      related: true,
      clearFaq: false,
      supersedesAwaiting: false,
      log: 'ESCALATE status-only (awaiting teammate first, related)',
    };
  }

  if (clearFaq) {
    return {
      action: 'FALLTHROUGH',
      reason: 'unrelated_clear_faq',
      related: false,
      clearFaq: true,
      supersedesAwaiting: false,
      log: 'ESCALATE fallthrough unrelated FAQ (awaiting teammate first)',
    };
  }

  // Unrelated / not answerable as clear FAQ → still fall through so normal
  // clarify / escalate / FAQ paths can run. Do NOT send holding status.
  //
  // NOTE (bugfix audit 2026-09-17): a candidate "fail closed to STATUS_ONLY here" change was
  // tried and reverted — selftest-escalate-related-only.js's "6b unrelated non-FAQ still
  // FALLTHROUGH" case is a deliberate regression lock (e.g. the client asking to change an
  // unrelated detail like their phone number while awaiting update on a separate escalated
  // issue must be answered normally, not held with a generic "team is reviewing" reply). This
  // is confirmed intentional design, not a MISSED_ESCALATION-style fail-open bug.
  return {
    action: 'FALLTHROUGH',
    reason: 'unrelated_other',
    related: false,
    clearFaq: false,
    supersedesAwaiting: true,
    log: 'ESCALATE fallthrough unrelated (awaiting teammate first)',
  };
}

// ---------------------------------------------------------------------------
// Status-only reply bank (varied; no invented teammate decisions)
// ---------------------------------------------------------------------------

const STATUS_ONLY_REPLIES = [
  'Our team has already been informed and is reviewing this. We will update you here as soon as there is progress.',
  'Thanks for checking in. Our team already has this and is reviewing it. We will message you here when there is an update.',
  'This is already with our team for review. Please hang tight; we will follow up as soon as there is news.',
  'Our team has your case and is looking into it. No need to resend the same details. We will update you here.',
  'We have already passed this to the team. They are reviewing it and will reply here when ready.',
];

function pickEscalateStatusReply(seed) {
  const n = STATUS_ONLY_REPLIES.length;
  let idx = 0;
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    idx = Math.abs(Math.floor(seed)) % n;
  } else {
    const s = String(seed || Date.now());
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    idx = h % n;
  }
  return STATUS_ONLY_REPLIES[idx];
}

// ---------------------------------------------------------------------------
// Clear awaiting after first teammate public reply
// ---------------------------------------------------------------------------

/**
 * Detect whether a non-Luna teammate already posted a public reply after escalate.
 * parts: array of conversation parts with created_at / author fields when available.
 */
function teammatePublicRepliedAfterEscalate(parts, state = {}, ids = {}) {
  const since = Number(state.lastEscalateAt || 0);
  if (!since) return false;
  const arsalId = String(ids.arsalId || ids.ARSAL_ID || '');
  const eliteId = String(ids.eliteAiId || ids.ELITE_AI_ID || '');
  const lunaIds = new Set(
    [arsalId, eliteId].filter(Boolean).map(String)
  );

  if (!Array.isArray(parts)) return false;
  for (const p of parts) {
    if (!p) continue;
    const created = Number(p.created_at || p.createdAt || 0);
    if (created && created < since) continue;

    const partType = String(p.part_type || p.type || '').toLowerCase();
    // Public comments / assignments with body , not notes
    if (partType.includes('note')) continue;
    if (
      partType &&
      !/(comment|assignment|open|close)/.test(partType) &&
      partType !== 'comment'
    ) {
      // allow generic admin messages without part_type
      if (p.body == null && !p.message) continue;
    }

    const author = p.author || p.admin || {};
    const authorType = String(author.type || p.author_type || '').toLowerCase();
    const authorId = String(author.id || p.author_id || p.admin_id || '');
    const isAdmin =
      authorType === 'admin' ||
      authorType === 'teammate' ||
      // Only treat an unlabeled part as admin when it actually HAS a non-client author type;
      // an empty/missing authorType (malformed or partial webhook part) must not clear the
      // escalation hold (fail closed — see CLAUDE.md MISSED_ESCALATION requirement).
      (!!authorId && !!authorType && !/user|lead|contact/.test(authorType));

    if (!isAdmin) continue;
    if (authorId && lunaIds.has(authorId)) continue;

    // Must look like a client-visible reply
    const body = String(p.body || p.message || '').trim();
    if (!body && partType !== 'comment') continue;
    return true;
  }
  return false;
}

function shouldClearAwaitingFirstTeammate(parts, state, ids) {
  if (!state || !state.escalateAwaitingFirstTeammate) return false;
  return teammatePublicRepliedAfterEscalate(parts, state, ids);
}

function applyTeammateReplyClear(state, parts, ids) {
  if (!state) return { cleared: false, state };
  if (shouldClearAwaitingFirstTeammate(parts, state, ids)) {
    state.escalateAwaitingFirstTeammate = false;
    if (!state.escalateTeammateExplainedAt) {
      state.escalateTeammateExplainedAt = Math.floor(Date.now() / 1000);
    }
    return { cleared: true, state };
  }
  return { cleared: false, state };
}

// ---------------------------------------------------------------------------
// Convenience: one-shot evaluate from ticket state + user text
// ---------------------------------------------------------------------------

function evaluateFromConvState(state, userText, parts, ids, opts) {
  const st = state || {};
  // Clear first if teammate already replied
  const cleared = applyTeammateReplyClear(st, parts, ids);
  if (cleared.cleared) {
    return {
      action: 'FALLTHROUGH',
      reason: 'teammate_replied_gate_cleared',
      related: false,
      clearFaq: false,
      log: 'ESCALATE gate cleared (teammate public reply)',
      state: st,
      cleared: true,
    };
  }
  const decision = decideEscalateAwaitingGate({
    awaitingFirstTeammate: !!st.escalateAwaitingFirstTeammate,
    userText,
    lastEscalateProblem: st.lastEscalateProblem,
    lastEscalateNoteSnippet: st.lastEscalateNoteSnippet,
    lastEscalateTopic: st.lastEscalateTopic,
    lastEscalateTopics: st.lastEscalateTopics,
    isGeneralAnswerable: opts && opts.isGeneralAnswerable, /* GENERAL_QUESTION_NOT_STATUS_V1 */
    hasAttachments: !!(opts && opts.hasAttachments), /* IMAGE_ONLY_AWAITING_V1 */
  });
  decision.state = st;
  decision.cleared = false;
  return decision;
}

module.exports = {
  ENGINE_ID,
  normalizeText,
  detectEscalateTopics,
  primaryEscalateTopic,
  buildEscalateContext,
  isShortAck,
  isClearKbFaqAsk,
  isPromoCheckoutFailureText,
  isStatusPing,
  isRelatedFollowUpCue,
  isHandoffOnlyEscalateProblem,
  isRelatedToEscalatedProblem,
  decideEscalateAwaitingGate,
  pickEscalateStatusReply,
  STATUS_ONLY_REPLIES,
  teammatePublicRepliedAfterEscalate,
  shouldClearAwaitingFirstTeammate,
  applyTeammateReplyClear,
  evaluateFromConvState,
  getMessageContent,
};
