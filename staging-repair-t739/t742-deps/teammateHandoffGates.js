'use strict';
/**
 * MICHAN_TEAMMATE_HANDOFF_V1
 * Code gates: do not steal/restart tickets already handled by a human teammate.
 * Pure helpers (no I/O) so selftests can require this module directly.
 */

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

// SMALLTALK_COURTESY_V1: one source of truth for "does this courtesy line also ask for support".
let __tu = null;
function supportIntent(t) {
  try { if (!__tu) __tu = require('./statePresend/textUtils'); return __tu.hasSupportIntent(t); } catch (_) { return false; }
}

function normalizeAckText(text) {
  return String(text || '')
    .trim()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Short client ack including Thankyou (no space) and similar. */
function isShortClientAckExpanded(text) {
  const t = normalizeAckText(text);
  if (!t || t.length > 160) return false;
  if (/[?]/.test(t)) return false;
  // Wait-ack while teammate/escalation pending (215476169761054: "Okay Ill wait till that").
  try {
    if (require('./statePresend/textUtils').isWaitingOrStatusAck(text)) return true;
  } catch (_) { /* optional */ }
  if (/^(ok+(ay)?|alright|sure)[,.\s]+(?:i(?:'|\u2019)?ll|ill|i\s+will)\s+wait(?:ing)?(?:\s+(?:till|until|for)\s+(?:that|then|it|you))?[.!\s]*$/i.test(t)) {
    return true;
  }
  // Pure acks: thankyou / thx / ok / thanks / thank you / got it / will do / agree / ...
  if (
    /^(ok+(ay)?|sure|thanks?|thank\s*you|thx|ty|got\s*it|will\s*do|alright|perfect|great|awesome|noted|understood|yes|yep|yeah|agree|agreed)([.!,\s]*(sure|will\s*do|thank(?:s|\s*you)?|thx|ty|got\s*it|ok+(ay)?|alright|agree|agreed))*[.!]*$/i.test(
      t
    )
  ) {
    return true;
  }
  if (isOneEditShortAck(t)) return true;
  // Closing thanks with polite extras ("thank you sir", "more power for the team")
  // — still not a product question, so do not treat as out-of-scope.
  if (
    /^(?:thanks?|thank\s*you|thankyou|thx|ty)\b/i.test(t) &&
    !/\b(?:how|what|when|where|why|can i|could i|please (?:check|help|review|look)|account|payout|login|kyc|breach|withdraw)\b/i.test(t) &&
    !supportIntent(t) // "Thanks, but I still need help" is a support turn, not a closing ack
  ) {
    return true;
  }
  if (
    /\b(?:appreciate(?:\s+it)?|grateful|god\s*bless|more\s+power(?:\s+(?:to|for)\s+(?:the\s+)?team)?|keep\s+(?:it\s+)?up)\b/i.test(t) &&
    !/\b(?:how|what|when|where|why|account|payout|login|kyc|breach)\b/i.test(t) &&
    !supportIntent(t) &&
    t.split(/\s+/).length <= 18
  ) {
    return true;
  }
  return false;
}

/**
 * One insertion, deletion, or substitution against a short ack word.
 * The whole message must be a single 4–8 letter token. A shared stem of 4
 * letters (or the ack word as a prefix) keeps "agent", "argue", and "green" out.
 */
function isOneEditShortAck(text) {
  const t = String(text || '').replace(/[.!,]+$/g, '').trim();
  if (!/^[A-Za-z]{4,8}$/.test(t)) return false;
  const low = t.toLowerCase();
  const dict = ['thanks', 'thank', 'alright', 'perfect', 'great', 'awesome', 'noted', 'understood', 'agree', 'agreed', 'thankyou', 'yeah'];
  for (const word of dict) {
    if (word.length > 8) continue;
    if (!editDistanceAtMost1(low, word)) continue;
    if (ackStem(low, word)) return true;
  }
  return false;
}

function ackStem(a, b) {
  let n = 0;
  const m = Math.min(a.length, b.length);
  while (n < m && a[n] === b[n]) n += 1;
  if (n >= 4) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 4 && longer.startsWith(shorter) && longer.length - shorter.length === 1;
}

function editDistanceAtMost1(a, b) {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (la > lb) i += 1;
    else if (lb > la) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  if (i < la || j < lb) edits += 1;
  return edits <= 1;
}

function isGreetingOnlyClientMsg(text) {
  const t = normalizeAckText(text);
  if (!t || t.length > 40) return false;
  return /^(hi|hello|hey|yo|hola|ciao|good\s*(morning|afternoon|evening)|sup)[.!?\s]*$/i.test(t);
}

function isEmojiOnlyClientMsg(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 24) return false;
  const stripped = normalizeAckText(raw);
  return !stripped;
}

/**
 * Human teammate public reply (not Arsal bot seat, not Elite AI).
 * Counts comment bodies; also assignment/open with substantive body (Intercom quirk).
 */
function isHumanTeammatePublicReply(part, opts) {
  const arsalId = String((opts && opts.arsalId) || '');
  const eliteAiId = String((opts && opts.eliteAiId) || '');
  const a = (part && part.author) || {};
  if (!part) return false;
  const pt = String(part.part_type || '');
  if (pt !== 'comment' && pt !== 'assignment' && pt !== 'open') return false;
  // Real human teammates (and Arsal's admin seat) post as Intercom author type 'admin'.
  // 'bot' is any bot/workflow author (Luna's own Elite AI seat, Fin, Operator, or a third-party
  // automation) and must never count as a "human teammate already replied" (fail closed).
  if (a.type !== 'admin') return false;
  const id = String(a.id || '');
  if (id && (id === arsalId || id === eliteAiId)) return false;
  // Elite AI / Fin by name even if id missing in fixtures
  if (/elite\s*ai|\bfin\b/i.test(String(a.name || ''))) return false;
  const body = stripHtml(part.body || '');
  if (!body) return false;
  // Ignore empty assignment stubs
  if (pt !== 'comment' && body.length < 3) return false;
  return true;
}

function humanTeammateAlreadyRepliedPublic(parts, opts) {
  for (const part of parts || []) {
    if (isHumanTeammatePublicReply(part, opts)) return true;
  }
  return false;
}

function collectHumanTeammatePublicBodies(parts, opts) {
  const out = [];
  for (const part of parts || []) {
    if (!isHumanTeammatePublicReply(part, opts)) continue;
    out.push(stripHtml(part.body || ''));
  }
  return out;
}

/** Teammate directed client to Japanese / external support or similar handoff. */
function teammateDirectedExternalOrHandled(parts, opts) {
  const bodies = collectHumanTeammatePublicBodies(parts, opts);
  for (const b of bodies) {
    if (
      /support@fundedelite\.jp/i.test(b) ||
      /japanese\s+support/i.test(b) ||
      /japan\s+support/i.test(b) ||
      /contact\s+(our\s+)?(japanese|japan)\b/i.test(b) ||
      /please\s+(send\s+an?\s+)?email\s+to\s+our\s+japan/i.test(b) ||
      /please\s+contact\s+our\s+japanese/i.test(b)
    ) {
      return true;
    }
    // Generic "handled / already resolved by teammate" closers
    if (
      /\b(already\s+(handled|resolved|fixed)|we('ve| have)\s+(handled|resolved|fixed)\s+this)\b/i.test(b)
    ) {
      return true;
    }
  }
  return false;
}

function isAssignedToHumanTeammate(full, opts) {
  const arsalId = String((opts && opts.arsalId) || '');
  const eliteAiId = String((opts && opts.eliteAiId) || '');
  const jerryId = String((opts && opts.jerryId) || '');
  const admin =
    full && full.admin_assignee_id != null && String(full.admin_assignee_id) !== '0'
      ? String(full.admin_assignee_id)
      : '';
  if (!admin) return false;
  if (admin === arsalId || admin === eliteAiId) return false;
  // Jerry is a real human teammate (see AUTHORIZED_NOTE_ADMIN_IDS in index.js) and is treated
  // the same as any other non-Arsal/non-Elite-AI admin here; his ticket-lifecycle differences
  // (e.g. auto-close exclusion) are handled separately by isJerryAssigned() in index.js.
  void jerryId; // kept in the signature for callers that already pass it; not special-cased here
  return true;
}

/** Escalations / Risk team inboxes — never unsolicited Luna public replies. */
function isAssignedToProtectedTeam(full, opts) {
  const team =
    full && full.team_assignee_id != null && String(full.team_assignee_id) !== '0'
      ? String(full.team_assignee_id)
      : '';
  if (!team) return false;
  const protectedIds = new Set(
    [
      (opts && opts.escalationsTeamId) || '9629759',
      (opts && opts.riskTeamId) || '10675195',
      (opts && opts.riskTeamAdminId) || '11128191',
    ].map(String)
  );
  return protectedIds.has(team);
}

/**
 * Outbound email / first message authored by a human teammate lives on conversation.source
 * and is often NOT duplicated into conversation_parts (live 215476244301144: Jerry's
 * "Dear Sahli…" opener). Treat that source as a public teammate opener for ownership.
 */
function humanTeammateSourceOpener(full, opts) {
  const src = full && full.source;
  if (!src || !src.author) return false;
  const a = src.author;
  const arsalId = String((opts && opts.arsalId) || '');
  const eliteAiId = String((opts && opts.eliteAiId) || '');
  const id = String(a.id || '');
  if (String(a.type || '') !== 'admin') return false;
  if (id && (id === arsalId || id === eliteAiId)) return false;
  if (/elite\s*ai|\bfin\b/i.test(String(a.name || ''))) return false;
  return !!stripHtml(src.body || '');
}

function tokenizeIssue(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9@.\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !/^(please|could|would|this|that|with|have|from|your|account|number|email|thank|thanks|okay|hello|what|when|where|which|about|they|them|will|into|been|after|before)$/i.test(w));
}

function collectPriorClientTexts(parts) {
  const out = [];
  for (const part of parts || []) {
    const a = (part && part.author) || {};
    if (a.type !== 'user' && a.type !== 'lead') continue;
    const body = stripHtml(part.body || '');
    if (body) out.push(body);
  }
  return out;
}

/**
 * Client restating prior issue (high token overlap with an earlier substantial client msg).
 */
function looksLikeSameIssueRestatement(text, parts) {
  const t = String(text || '').trim();
  if (!t || t.length < 40) return false;
  const tokens = new Set(tokenizeIssue(t));
  if (tokens.size < 4) return false;
  const priors = collectPriorClientTexts(parts);
  // Compare against earlier messages only (exclude exact latest duplicate if last equals t)
  for (let i = 0; i < priors.length - 1; i++) {
    const prev = priors[i];
    if (!prev || prev.length < 40) continue;
    const pt = new Set(tokenizeIssue(prev));
    if (pt.size < 4) continue;
    let overlap = 0;
    for (const w of tokens) if (pt.has(w)) overlap += 1;
    const ratio = overlap / Math.min(tokens.size, pt.size);
    if (overlap >= 4 && ratio >= 0.55) return true;
    // Near-exact paste
    const na = t.toLowerCase().replace(/\s+/g, ' ');
    const nb = prev.toLowerCase().replace(/\s+/g, ' ');
    if (na === nb || (na.length > 60 && (na.includes(nb.slice(0, 80)) || nb.includes(na.slice(0, 80))))) {
      return true;
    }
  }
  return false;
}

/**
 * New substantive ask that is NOT a same-issue restatement (e.g. JP reply timeframe).
 */
function isNewMetaQuestionAfterHandoff(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (
    /\b(when|how\s+long|expect|timeframe|how\s+soon|eta|reply\s+from|hear\s+back)\b/i.test(t) &&
    /\b(japan|japanese|support|email|them|they)\b/i.test(t)
  ) {
    return true;
  }
  if (/\b(how\s+(do|can)\s+i\s+(email|contact|reach))\b/i.test(t)) return true;
  return false;
}


/**
 * COURTESY_VS_SUBSTANTIVE_V1 (2026-10-05, ticket 215476246024547).
 * A teammate public reply is courtesy when it is only a social close
 * (you're/your welcome, no problem, glad we could help, thanks) with no
 * handling, investigation, policy answer, info request, or account action.
 * Anything else a teammate says in public is substantive (fail closed).
 * Detection is structural: safe phrases plus signals, not an exact-only list.
 * Returns 'courtesy' | 'closing' | 'substantive' | 'empty'.
 */
function classifyTeammatePublicReply(body) {
  const raw = stripHtml(body);
  if (!raw) return 'empty';
  if (isPureTeammateClosingCheck(raw)) return 'closing';
  if (hasSubstantiveTeammateSignal(raw)) return 'substantive';
  if (isCourtesyOnlyTeammateReply(raw)) return 'courtesy';
  return 'substantive';
}

function isPureTeammateClosingCheck(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 320) return false;
  if (/\b\d{5,}\b/.test(t) || /%|\$\s?\d/.test(t)) return false;
  if (/\b(?:payout|withdraw|kyc|breach|refund|account\s*number|i(?:'|’)ll|let me)\b/i.test(t)) return false;
  if (/\banything else\b/i.test(t)) return true;
  if (/\b(?:is there )?anything more (?:we|i) can (?:help|do|assist)\b/i.test(t)) return true;
  if (/\bany other (?:questions|concerns|issues)\b/i.test(t)) return true;
  if (/\bif you need (?:any )?(?:further|more) assistance\b/i.test(t)) return true;
  if (/\blet (?:me|us) know if\b/i.test(t) && /\b(?:anything else|you need anything|further assistance)\b/i.test(t)) return true;
  return false;
}

function hasSubstantiveTeammateSignal(text) {
  const t = String(text || '');
  if (/\?/.test(t)) return true;
  if (/\b\d{4,}\b/.test(t) || /%/.test(t) || /\$\s?\d/.test(t)) return true;
  const res = [
    /\b(?:i(?:'|’)?ll|i will|let me|i(?:'|’)?m|i am|we(?:'|’)?ll|we will)\s+(?:handle|take(?:\s+(?:it|this|over|care))?|look(?:\s+into)?|check|review|investigate|sort|fix|escalate|forward)\b/i,
    /\b(?:leave|leaving)\s+(?:it|this)\s+with\s+me\b/i,
    /\btak(?:e|ing)\s+(?:this|it)\s+over\b/i,
    /\b(?:handle|take|taking)\b[^.?!]{0,48}\bfrom here\b/i,
    /\b(?:look(?:ing)? into|checking(?:\s+(?:on|this|your|the|it))?|investigat\w*|reviewing your|on it|will do)\b/i,
    /\b(?:please|pls|kindly)\s+(?:send|share|provide|confirm|upload|reply|forward)\b/i,
    /\b(?:can|could|would)\s+you\s+(?:please\s+)?(?:send|share|provide|confirm|reply|upload|forward|check)\b/i,
    /\b(?:what(?:'|’)?s|what is|which is)\s+your\s+(?:account|email|login|order)\b/i,
    /\bneed your\s+(?:account|email|login|screenshot|id|number)\b/i,
    /\b(?:payout|withdrawal|kyc|breach|refund|escalat\w*|password reset)\b/i,
    /\b(?:approved|rejected|processed|forwarded|disabled|enabled)\b/i,
    /\b(?:the rule|you (?:need|must|should)|policy|drawdown|consistency|not allowed|you(?:'|’)re required)\b/i,
  ];
  return res.some((re) => re.test(t));
}

function courtesyClauseText(clause) {
  return String(clause || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/^(?:hi|hello|hey|dear)\b[,!]?\s*/i, '')
    .replace(/\b(?:max|anjsha|jerry|huzafa|august|shahid|blank|ayan|michan|alessandro|ezinne|robor|jeffery|jeffrey|sir|mate|buddy|team)\b/gi, '')
    .replace(/[!.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCourtesyClause(clause) {
  const t = courtesyClauseText(clause);
  if (!t) return true;
  if (t.length > 90) return false;
  return (
    /^(?:you(?:'re|re)|your|ur)\s+(?:very\s+)?welcome(?:\s+(?:very\s+much|so\s+much|again))?$/.test(t) ||
    /^welcome$/.test(t) ||
    /^(?:no problem(?:\s+at\s+all)?|no worries|no prob|np|all good)$/.test(t) ||
    /^(?:my pleasure|with pleasure|the pleasure is mine|pleasure)$/.test(t) ||
    /^glad (?:we|i) could help(?: you(?: today| with that)?)?$/.test(t) ||
    /^happy to (?:help|assist)(?: you)?$/.test(t) ||
    /^glad to (?:help|assist|be of help)$/.test(t) ||
    /^(?:thanks?|thank you|thankyou|thx|ty)(?: so much| a lot| for (?:your|the) (?:patience|time|understanding|reaching out))?$/.test(t) ||
    /^(?:anytime|of course|sure thing|you bet|absolutely|sure|ok|okay|alright|got it|noted|perfect|great|awesome|cool|yep|yeah|yes)$/.test(t) ||
    /^have a (?:great|good|nice|wonderful|lovely) (?:day|one|evening|night|weekend)$/.test(t) ||
    /^(?:take care|all the best|best regards|cheers|you(?:'re|re) all set)$/.test(t)
  );
}

function isCourtesyOnlyTeammateReply(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return false;
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length > 40) return false;
  const clauses = raw.split(/\s*(?:[.!?]+|\n+|—|–|;)\s*|\s+-\s+|,\s+/).map((s) => s.trim()).filter(Boolean);
  if (!clauses.length) return false;
  return clauses.every(isCourtesyClause);
}

function partTimeMs(part) {
  const ca = Number(part && part.created_at || 0);
  return ca > 1e12 ? ca : ca * 1000;
}

/** Last substantive (not courtesy / not a pure closing check) human public reply, or -1. */
function lastSubstantiveHumanIndex(parts, opts) {
  const list = parts || [];
  let idx = -1;
  for (let i = 0; i < list.length; i++) {
    if (!isHumanTeammatePublicReply(list[i], opts)) continue;
    if (classifyTeammatePublicReply(list[i].body) !== 'substantive') continue;
    idx = i;
  }
  return idx;
}

/**
 * A close after that reply, then a later open or client comment, ends the handling episode.
 * The old substantive line is then historical and must not keep owning a reopened ticket.
 */
const REOPEN_CONTINUE_MS = 10 * 60 * 1000;

function substantiveEpisodeClosedAfter(parts, humanIdx) {
  const list = parts || [];
  const mate = list[humanIdx];
  if (!mate) return false;
  const t0 = partTimeMs(mate);
  let sawClose = false;
  let closeAt = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p || i === humanIdx || partTimeMs(p) < t0) continue;
    const pt = String(p.part_type || '');
    if (pt === 'close') {
      sawClose = true;
      closeAt = partTimeMs(p);
      continue;
    }
    if (!sawClose) continue;
    if (pt === 'open') {
      const author = p.author || {};
      const type = String(author.type || '').toLowerCase();
      const clientOpen = type === 'user' || type === 'lead';
      const dt = partTimeMs(p) - closeAt;
      // A teammate or system reopen inside the window is still the same human episode.
      if (!clientOpen && dt >= 0 && dt <= REOPEN_CONTINUE_MS) continue;
      return true;
    }
    const a = p.author || {};
    if ((a.type === 'user' || a.type === 'lead') && pt === 'comment' && stripHtml(p.body || '')) {
      const body = stripHtml(p.body || '');
      const dt = partTimeMs(p) - closeAt;
      const ack = isShortClientAckExpanded(body) || isGreetingOnlyClientMsg(body) || isEmojiOnlyClientMsg(body);
      if (ack && dt >= 0 && dt <= REOPEN_CONTINUE_MS) continue;
      return true;
    }
  }
  return false;
}

/**
 * Human teammate (non-bot admin) recently replied and is actively handling.
 * Used to SKIP overlapping client-facing Luna replies while they own the thread.
 * Courtesy-only acks do not count. A closed-then-reopened episode does not either.
 */
function isHumanTeammateActivelyHandling(parts, opts) {
  const list = parts || [];
  const lastHumanIdx = lastSubstantiveHumanIndex(list, opts);
  if (lastHumanIdx < 0) return false;
  if (substantiveEpisodeClosedAfter(list, lastHumanIdx)) return false;
  let lastHumanTs = 0;
  const ca = list[lastHumanIdx].created_at;
  if (ca) lastHumanTs = ca > 1e12 ? ca : ca * 1000;

  const arsalId = String((opts && opts.arsalId) || '');
  const eliteAiId = String((opts && opts.eliteAiId) || '');
  let lastLunaIdx = -1;
  for (let i = 0; i < list.length; i++) {
    const part = list[i];
    if (!part || String(part.part_type || '') === 'note') continue;
    const a = part.author || {};
    const id = String(a.id || '');
    const isLunaSeat =
      (id && (id === arsalId || id === eliteAiId)) ||
      a.type === 'bot' ||
      /elite\s*ai|\bfin\b/i.test(String(a.name || ''));
    if (!isLunaSeat) continue;
    if (!stripHtml(part.body || '')) continue;
    if (String(part.part_type || '') !== 'comment' && String(part.part_type || '') !== 'assignment' && String(part.part_type || '') !== 'open') continue;
    lastLunaIdx = i;
  }

  const windowMs = (opts && opts.activeWindowMs) || 6 * 60 * 60 * 1000;
  const humanOwnsThread = lastHumanIdx > lastLunaIdx;
  const recentByOrder = lastHumanIdx >= list.length - 6;
  const recentByTime = lastHumanTs ? Date.now() - lastHumanTs <= windowMs : false;
  return humanOwnsThread || recentByOrder || recentByTime;
}


/* REOPEN_HUMAN_OWNERSHIP_V1 (2026-10-12, ticket 215476349592456):
 * Owner policy: a conversation a human already handled stays human-owned. A human close
 * followed by a customer reopen must NOT hand the conversation back to Luna, and a team
 * routing set by a human teammate keeps the conversation with that team even when the
 * admin assignee is empty (Intercom clears it on team assignment / close). Luna replying
 * as the Arsal seat on such a conversation also makes Intercom auto-assign it to 10118526.
 * Only an explicit human hand-back (a human assigns it to the Luna/Arsal seat after the
 * close) or the sanctioned ticket-reply-allowed / continuous-ownership bypass reopens it. */
const REOPEN_HUMAN_OWN_MS = Number(process.env.LUNA_REOPEN_HUMAN_OWN_MS || 0) || 7 * 24 * 60 * 60 * 1000;

function isHumanAdminAuthor(part, opts) {
  const a = (part && part.author) || {};
  if (a.type !== 'admin') return false;
  const id = String(a.id || '');
  const arsalId = String((opts && opts.arsalId) || '');
  const eliteAiId = String((opts && opts.eliteAiId) || '');
  if (id && (id === arsalId || id === eliteAiId)) return false;
  if (/elite\s*ai|\bfin\b/i.test(String(a.name || ''))) return false;
  return true;
}

function humanReopenOwnership(full, parts, opts) {
  const list = parts || [];
  const arsalId = String((opts && opts.arsalId) || '');
  const eliteAiId = String((opts && opts.eliteAiId) || '');
  const now = (opts && opts.nowMs) || Date.now();
  const windowMs = (opts && opts.reopenOwnMs) || REOPEN_HUMAN_OWN_MS;
  let firstHumanReply = -1;
  for (let i = 0; i < list.length; i++) {
    if (isHumanTeammatePublicReply(list[i], opts)) { firstHumanReply = i; break; }
  }
  // (B, checked first: no human reply needed) current team assignee was set by a human teammate (not a bot/workflow/Luna), recently.
  const team = full && full.team_assignee_id != null && String(full.team_assignee_id) !== '0'
    ? String(full.team_assignee_id) : '';
  if (team) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (!p || String(p.part_type || '') !== 'assignment') continue;
      const to = String((p.assigned_to && p.assigned_to.id) || '');
      if (to !== team) continue;
      if (isHumanAdminAuthor(p, opts) && now - partTimeMs(p) <= windowMs) return { owned: true, why: 'human_routed_team' };
      break;
    }
  }
  if (firstHumanReply < 0) return { owned: false, why: '' };
  // (A) last close was by a human, after a human public reply, recent, not handed back.
  let lastClose = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i] && String(list[i].part_type || '') === 'close') lastClose = i;
  }
  if (lastClose > firstHumanReply && isHumanAdminAuthor(list[lastClose], opts) &&
      now - partTimeMs(list[lastClose]) <= windowMs) {
    let handedBack = false;
    for (let i = lastClose + 1; i < list.length; i++) {
      const p = list[i];
      if (!p || String(p.part_type || '') !== 'assignment' || !isHumanAdminAuthor(p, opts)) continue;
      const to = String((p.assigned_to && p.assigned_to.id) || '');
      if (to && (to === arsalId || to === eliteAiId)) handedBack = true;
    }
    if (!handedBack) return { owned: true, why: 'human_close_then_reopen' };
  }
  if (team) {
    // (C) any team assignee + a human teammate public reply inside the window.
    for (let i = list.length - 1; i >= 0; i--) {
      if (isHumanTeammatePublicReply(list[i], opts) && now - partTimeMs(list[i]) <= windowMs) {
        return { owned: true, why: 'team_with_recent_human_reply' };
      }
    }
  }
  return { owned: false, why: '' };
}

function resolutionClosureClient(text) {
  try { return require('./reviewRequestFlow').isResolutionClosure(text); } catch (_) { return false; }
}

/** Teammate closing check or rating prompt. Not Luna's Trustpilot review state. */
function isTeammateClosingOrRating(body) {
  if (classifyTeammatePublicReply(body) === 'closing') return true;
  const t = stripHtml(body);
  return /\brate your (?:conversation|experience|chat|support)\b/i.test(t);
}

/** A human already resolved, closed, or sent a closing/rating line. */
function humanResolutionEvidence(parts, opts) {
  if (lastSubstantiveHumanIndex(parts, opts) >= 0) return true;
  for (const p of parts || []) {
    if (!p) continue;
    if (String(p.part_type || '') === 'close') return true;
    if (isHumanTeammatePublicReply(p, opts) && isTeammateClosingOrRating(p.body)) return true;
  }
  return false;
}

/**
 * Main public-reply deferral gate.
 * skip=true => do not send public Arsal reply (and caller should not escalate).
 */
function shouldDeferToHumanTeammate(full, parts, text, opts) {
  const teammateReplied =
    humanTeammateAlreadyRepliedPublic(parts, opts) || humanTeammateSourceOpener(full, opts);
  const assigneeHuman = isAssignedToHumanTeammate(full, opts);
  const protectedTeam = isAssignedToProtectedTeam(full, opts);
  if (!teammateReplied && !assigneeHuman && !protectedTeam) {
    return { skip: false, reason: '' };
  }

  const t = String(text || '').trim();
  if (isShortClientAckExpanded(t) || isGreetingOnlyClientMsg(t) || isEmojiOnlyClientMsg(t)) {
    return {
      skip: true,
      reason: 'teammate_handoff_short_ack_or_greeting',
    };
  }

  // RESOLVED_CLOSURE_V1 (2026-10-06, ticket 215476262789309): a reopen, a close, or the
  // end of a handling episode is not a new support ask. Closure after a human resolution
  // stays silent. A later real question does not match and still reevaluates (r72).
  if (resolutionClosureClient(t) && humanResolutionEvidence(parts, opts)) {
    return { skip: true, reason: 'resolved_closure_no_new_ask' };
  }

  // REOPEN_HUMAN_OWNERSHIP_V1: human close + customer reopen, or human team routing,
  // keeps the human owner. Plain skip (no subset answer, no escalate, no self-assign).
  if (!assigneeHuman && !protectedTeam) {
    const __reo = humanReopenOwnership(full, parts, opts);
    if (__reo.owned) return { skip: true, reason: 'human_reopen_owned', detail: __reo.why };
  }

  // TEAMMATE_ASSIGNEE_OWNERSHIP_V3 (2026-10-05, ticket 215476244301144):
  // Assigned to Jerry / another human teammate, or Escalations/Risk team inbox, means the
  // human owns the ticket — even when their opener is only on conversation.source (outbound
  // email) and never appears as a conversation_parts comment. No unsolicited public replies.
  // A human-authored conversation.source opener is treated the same way.
  // Authorized resume paths (ticket-reply-allowed / continuous ownership) bypass this in index.js.
  if (assigneeHuman || protectedTeam || humanTeammateSourceOpener(full, opts)) {
    return {
      skip: true,
      reason: 'teammate_actively_handling',
    };
  }

  // Teammate actively handling (recent public reply / owns thread): never overlap with
  // client-facing Luna replies. Internal escalate notes remain gated separately.
  if (teammateReplied && isHumanTeammateActivelyHandling(parts, opts)) {
    // Mild: waiting / "any update" pings while human owns the ticket → skip status spam too.
    return {
      skip: true,
      reason: 'teammate_actively_handling',
    };
  }

  // If a human already publicly guided (esp. JP/external), do not restart same issue.
  if (teammateReplied && teammateDirectedExternalOrHandled(parts, opts)) {
    if (isNewMetaQuestionAfterHandoff(t)) {
      return { skip: false, reason: 'allow_meta_after_jp_handoff' };
    }
    if (looksLikeSameIssueRestatement(t, parts)) {
      return { skip: true, reason: 'teammate_already_handled_same_issue' };
    }
    // Account-number-only / identity dump after teammate already handled → don't re-own
    // Normalize ideographic/fullwidth spaces (seen live: "My account number is　000000")
    const tNorm = t.replace(/[\u3000\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^\d{5,12}$/.test(tNorm) || /^my\s+account\s+number\s+is\s+\d{5,12}\.?$/i.test(tNorm)) {
      return { skip: true, reason: 'teammate_handled_identity_only' };
    }
    // Default: teammate owns thread after external handoff — don't steal with guidance/escalation.
    // Allow fallthrough only for clear new unrelated questions (has ? and not same issue).
    if (/[?]/.test(t) && !looksLikeSameIssueRestatement(t, parts) && t.length > 25) {
      return { skip: false, reason: 'allow_new_question_after_handoff' };
    }
    // Soft: if assignee is human teammate and message is short-ish without new ?, defer
    if (assigneeHuman && t.length < 180 && !/[?]/.test(t) && !isNewMetaQuestionAfterHandoff(t)) {
      return { skip: true, reason: 'teammate_owned_pending_no_new_ask' };
    }
  }

  // Teammate replied (guidance) but not necessarily JP — still never restart on short/greeting (already handled).
  // If assignee is human and latest is only continuing without ?, prefer defer when teammate spoke last publicly.
  return { skip: false, reason: '' };
}

/**
 * Block duplicate escalate/note/assign when teammate already handled or prior escalate note exists.
 */
function shouldBlockEscalateForTeammateHandoff(parts, full, opts) {
  if (opts && resolutionClosureClient(opts.latestText)) {
    return { block: true, reason: 'resolved_closure_no_new_ask' };
  }
  if (teammateDirectedExternalOrHandled(parts, opts)) {
    return { block: true, reason: 'teammate_directed_external_support' };
  }
  if (opts && opts.hasArsalEscalateNote && opts.hasArsalEscalateNote(parts)) {
    if (humanTeammateAlreadyRepliedPublic(parts, opts)) {
      return { block: true, reason: 'prior_escalate_note_and_teammate_replied' };
    }
  }
  // Assigned to human teammate who already publicly replied → don't steal via escalate
  if (
    isAssignedToHumanTeammate(full, opts) &&
    humanTeammateAlreadyRepliedPublic(parts, opts)
  ) {
    return { block: true, reason: 'teammate_assignee_already_replied' };
  }
  // Client-reply skip may already fire via shouldDeferToHumanTeammate, but escalate/note
  // paths (esp. MISSED_ESCALATION / Backend-account-check notes) can still post. While a
  // human recently owns public replies, do not spam another escalate note for the same
  // open ask (ticket 215476045133527 / Blank actively handling).
  if (
    humanTeammateAlreadyRepliedPublic(parts, opts) &&
    isHumanTeammateActivelyHandling(parts, opts)
  ) {
    return { block: true, reason: 'teammate_actively_handling_no_note' };
  }
  return { block: false, reason: '' };
}

/**
 * Immediately before a note, assignment, or public handoff.
 * Cancel when the conversation closed, a teammate resolved/rated/took over after the
 * client turn, or the turn itself is only a resolution closure.
 */
function consequentialEscalationBlock(parts, full, opts) {
  const o = opts || {};
  const conv = full || {};
  if (conv.open === false || String(conv.state || '').toLowerCase() === 'closed') {
    return { block: true, reason: 'conversation_closed' };
  }
  const sinceRaw = Number(o.sinceCreatedAt || 0);
  if (sinceRaw) {
    const since = partTimeMs({ created_at: sinceRaw });
    for (const p of parts || []) {
      if (!p || partTimeMs(p) <= since) continue;
      const pt = String(p.part_type || '');
      if (pt === 'close') return { block: true, reason: 'closed_after_client_turn' };
      if (pt === 'note' && typeof o.isStopInstruction === 'function' && o.isStopInstruction(p.body)) {
        return { block: true, reason: 'explicit_stop' };
      }
      if (isHumanTeammatePublicReply(p, o)) {
        if (classifyTeammatePublicReply(p.body) === 'substantive') {
          return { block: true, reason: 'newer_substantive_teammate' };
        }
        if (isTeammateClosingOrRating(p.body)) {
          return { block: true, reason: 'teammate_closing_or_rating' };
        }
      }
      const a = p.author || {};
      if ((a.type === 'user' || a.type === 'lead') && pt === 'comment' && stripHtml(p.body || '')) {
        return { block: true, reason: 'newer_client_turn' };
      }
    }
  }
  if (resolutionClosureClient(o.latestText)) {
    return { block: true, reason: 'resolved_closure_no_new_ask' };
  }
  return { block: false, reason: '' };
}

/** A note that both says the issue is solved and asks for investigation, on a closure turn. */
function escalationNoteContradictsResolution(latestText, notePlain) {
  if (!resolutionClosureClient(latestText)) return false;
  const n = stripHtml(notePlain);
  const saysResolved = /\b(?:resolved|solved|all clear|no longer an issue)\b/i.test(n);
  const asksWork = /\b(?:check|investigate|review|look into|action needed)\b/i.test(n);
  return saysResolved && asksWork;
}

/** Welcome intro must never run after a human teammate public reply. */
function shouldSkipWelcomeIntro(parts, opts) {
  return humanTeammateAlreadyRepliedPublic(parts, opts);
}

/**
 * Known staff first names that must never be greeted in a client-facing reply unless the
 * client themselves is that person (live 215476244301144: "Hello Jerry," while client=SAHLI).
 * Keep this list of first names only — matching is case-insensitive on the greeting token.
 */
const STAFF_CLIENT_GREETING_NAMES = Object.freeze([
  'Jerry', 'Arsal', 'Anjsha', 'Huzafa', 'Ezinne', 'August', 'Max', 'Shahid',
  'Robor', 'Jeffery', 'Jeffrey', 'Blank', 'Ayan', 'Michan', 'Alessandro',
]);

/**
 * Strip / rewrite openings like "Hello Jerry," when the client is not that person.
 * opts.assigneeFirstName: when clientName's first token equals the human assignee's first
 * name (contactBits contamination from admin source.author), treat clientName as untrusted
 * and rewrite staff greetings to a neutral "Hello,".
 * Returns { text, rewritten }.
 */
function scrubWrongAudienceStaffGreeting(body, clientName, opts) {
  const raw = String(body || '');
  if (!raw.trim()) return { text: raw, rewritten: false };
  const clientFirst = String(clientName || '')
    .trim()
    .split(/\s+/)[0]
    .replace(/[^A-Za-z'-]/g, '');
  const assigneeFirst = String((opts && opts.assigneeFirstName) || '')
    .trim()
    .split(/\s+/)[0]
    .replace(/[^A-Za-z'-]/g, '');
  const staff = new Set(STAFF_CLIENT_GREETING_NAMES.map((n) => n.toLowerCase()));
  const clientContaminatedByAssignee = !!(
    clientFirst &&
    assigneeFirst &&
    clientFirst.toLowerCase() === assigneeFirst.toLowerCase() &&
    staff.has(clientFirst.toLowerCase())
  );
  const re = /^(?:\s*)((?:hello|hi|hey|dear)\s+)([A-Za-z][A-Za-z'-]{1,30})(\s*[,!\u2013\u2014-]?\s+)/i;
  const m = raw.match(re);
  if (!m) return { text: raw, rewritten: false };
  const greeted = m[2];
  if (!staff.has(greeted.toLowerCase())) return { text: raw, rewritten: false };
  if (
    clientFirst &&
    greeted.toLowerCase() === clientFirst.toLowerCase() &&
    !clientContaminatedByAssignee
  ) {
    return { text: raw, rewritten: false };
  }
  let replacement;
  if (clientFirst && /^[A-Za-z]/.test(clientFirst) && !clientContaminatedByAssignee) {
    replacement = m[1] + clientFirst + (/,/.test(m[3]) ? ', ' : ' ');
  } else {
    replacement = 'Hello, ';
  }
  return { text: raw.replace(re, replacement), rewritten: true };
}

module.exports = {
  stripHtml,
  isShortClientAckExpanded,
  isGreetingOnlyClientMsg,
  isEmojiOnlyClientMsg,
  isHumanTeammatePublicReply,
  humanTeammateAlreadyRepliedPublic,
  classifyTeammatePublicReply,
  lastSubstantiveHumanIndex,
  substantiveEpisodeClosedAfter,
  isHumanTeammateActivelyHandling,
  teammateDirectedExternalOrHandled,
  isAssignedToHumanTeammate,
  isAssignedToProtectedTeam,
  humanTeammateSourceOpener,
  looksLikeSameIssueRestatement,
  isNewMetaQuestionAfterHandoff,
  shouldDeferToHumanTeammate,
  humanReopenOwnership,
  REOPEN_HUMAN_OWNERSHIP_VERSION: 'REOPEN_HUMAN_OWNERSHIP_V1',
  shouldBlockEscalateForTeammateHandoff,
  isTeammateClosingOrRating,
  humanResolutionEvidence,
  consequentialEscalationBlock,
  escalationNoteContradictsResolution,
  shouldSkipWelcomeIntro,
  scrubWrongAudienceStaffGreeting,
  STAFF_CLIENT_GREETING_NAMES,
  MICHAN_TEAMMATE_HANDOFF_VERSION: 'MICHAN_TEAMMATE_HANDOFF_V1',
};
