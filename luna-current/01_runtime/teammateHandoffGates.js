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
  if (!t || t.length > 120) return false;
  if (/[?]/.test(t)) return false;
  // thankyou / thx / ok / okay / thanks / thank you / got it / will do / ...
  if (
    /^(ok(ay)?|sure|thanks?|thank\s*you|thx|ty|got\s*it|will\s*do|alright|perfect|great|awesome|noted|understood|yes|yep|yeah)([.!,\s]*(sure|will\s*do|thank(?:s|\s*you)?|thx|ty|got\s*it|ok(ay)?|alright))*[.!]*$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
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
 * Main public-reply deferral gate.
 * skip=true => do not send public Arsal reply (and caller should not escalate).
 */
function shouldDeferToHumanTeammate(full, parts, text, opts) {
  const teammateReplied = humanTeammateAlreadyRepliedPublic(parts, opts);
  const assigneeHuman = isAssignedToHumanTeammate(full, opts);
  if (!teammateReplied && !assigneeHuman) {
    return { skip: false, reason: '' };
  }

  const t = String(text || '').trim();
  if (isShortClientAckExpanded(t) || isGreetingOnlyClientMsg(t) || isEmojiOnlyClientMsg(t)) {
    return {
      skip: true,
      reason: 'teammate_handoff_short_ack_or_greeting',
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
    // Normalize ideographic/fullwidth spaces (seen live: "My account number is　211080")
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
  return { block: false, reason: '' };
}

/** Welcome intro must never run after a human teammate public reply. */
function shouldSkipWelcomeIntro(parts, opts) {
  return humanTeammateAlreadyRepliedPublic(parts, opts);
}

module.exports = {
  stripHtml,
  isShortClientAckExpanded,
  isGreetingOnlyClientMsg,
  isEmojiOnlyClientMsg,
  isHumanTeammatePublicReply,
  humanTeammateAlreadyRepliedPublic,
  teammateDirectedExternalOrHandled,
  isAssignedToHumanTeammate,
  looksLikeSameIssueRestatement,
  isNewMetaQuestionAfterHandoff,
  shouldDeferToHumanTeammate,
  shouldBlockEscalateForTeammateHandoff,
  shouldSkipWelcomeIntro,
  MICHAN_TEAMMATE_HANDOFF_VERSION: 'MICHAN_TEAMMATE_HANDOFF_V1',
};
