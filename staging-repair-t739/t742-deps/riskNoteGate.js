'use strict';

/**
 * GENERAL Risk Team internal-note anti-spam gate (FundedElite Luna).
 *
 * Rules:
 * 1) Note ONLY for meaningful NEW problem/update Risk must act on, and only if
 *    Risk has not yet replied to that pending issue.
 * 2) Note body must be a short useful summary — never client paste, never empty
 *    "waiting for requested information" spam.
 * 3) After one Risk note for a pending issue → no more Risk notes until Risk replies.
 * 4) After Risk replies, cycle resets; a later NEW meaningful unanswered issue → at most one note.
 * 5) No notes for low-value nudges (where are you / I'm waiting / any update / hello / repeats).
 * 6) History checks before note (fingerprint + awaiting + Risk reply).
 * 7) After first Risk note: block ALL further Risk notes until Risk Team publicly replies;
 *    then a genuinely new backlog issue may note once (anti-spam content rules still apply).
 */

const crypto = require('crypto');

const WAITING_SUMMARY_RE =
  /\b(?:client\s+is\s+)?wait(?:ing)?\s+for\s+(?:the\s+)?(?:requested\s+)?(?:information|info|update|reply|response|answer|news)\b|\b(?:no|without)\s+(?:new\s+)?(?:details|information|info)\b|\b(?:status\s+)?(?:check[- ]?in|follow[- ]?up)\s+only\b|\b(?:ping|nudge)\b/i;

const LOW_VALUE_NUDGE_RE =
  /^(?:hi+|hey+|hello+|hola|yo|salam|please\s*)?[.!\s]*(?:(?:is\s+there\s+)?(?:any|an)?\s*(?:update|news|reply|response|answer|progress)|(?:where\s+are\s+you|you\s+there|are\s+you\s+(?:there|here|online))|(?:i(?:(?:'|\u2019)?m|\s+am)\s+)?(?:still\s+)?wait(?:ing)?(?:\s+(?:for\s+(?:(?:an?\s+)?(?:update|reply|answer|news|response|info(?:rmation)?|you|the\s+team))?))?|(?:please\s+)?(?:help|reply|respond|update\s+me)|(?:following\s*up|checking\s+in|check[- ]?in)|(?:any\s+word)|(?:hello+\s*)?(?:team|risk|support))[.!?\s]*$/i;

const STRONG_ISSUE_RE =
  /\b(?:breach(?:ed)?|payout|withdraw\w*|refund|kyc|verif\w*|login|password|credentials?|chargeback|disabled|banned|flagged|drawdown|profit\s+split|account\s+\d{4,}|\b\d{5,12}\b|mt5|metatrader|tradelocker|dashboard|ip\s*(?:address|ban|breach)|rule\s+violation|evidence|screenshot|attached|slip|invoice|transaction|txid|paid|payment)\b/i;

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text) {
  return stripHtml(text)
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeForFingerprint(text) {
  return stripHtml(text)
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(?:please|pls|plz|hello|hi|hey|just|really|still|again|team|risk|support|sir|madam)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLowValueRiskNudge(text) {
  const t = stripHtml(text);
  if (!t) return true;
  if (t.length > 220) return false;
  const compact = t.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
  if (STRONG_ISSUE_RE.test(compact) && countWords(compact) >= 8) return false;
  if (LOW_VALUE_NUDGE_RE.test(compact)) return true;
  // Short status pings with a question mark
  if (
    compact.length <= 80 &&
    /^(?:any\s+(?:update|news|reply|response|word)|updates?|status|eta|progress)\b/i.test(compact)
  ) {
    return true;
  }
  if (
    compact.length <= 100 &&
    /\b(?:i(?:'|\u2019)?m|i\s+am)\s+(?:still\s+)?wait/i.test(compact) &&
    !STRONG_ISSUE_RE.test(compact)
  ) {
    return true;
  }
  if (
    compact.length <= 60 &&
    /^(?:where\s+are\s+you|are\s+you\s+(?:there|here)|you\s+there|hello+|hi+|hey+)\b/i.test(compact)
  ) {
    return true;
  }
  return false;
}

function isMeaningfulRiskUpdate(text) {
  const t = stripHtml(text);
  if (!t || isLowValueRiskNudge(t)) return false;
  if (STRONG_ISSUE_RE.test(t)) return true;
  if (countWords(t) >= 12) return true;
  // Short but concrete (e.g. "account 12345 breached")
  if (countWords(t) >= 4 && /\b(?:account|breach|payout|login|kyc|refund|paid)\b/i.test(t)) return true;
  return false;
}

function isMaterialNewEvidence(text) {
  const t = stripHtml(text);
  if (!t || isLowValueRiskNudge(t)) return false;
  // New identifiers, attachments cues, concrete facts Risk must see
  if (/\b(?:account\s*(?:number|#|id)?\s*[:#]?\s*\d{4,}|\b\d{5,12}\b|txid|transaction|invoice|slip|screenshot|attached|attachment|evidence|proof|email\s*:\s*\S+@\S+)/i.test(t)) {
    return true;
  }
  if (STRONG_ISSUE_RE.test(t) && countWords(t) >= 10 && !/\bwait(?:ing)?\b/i.test(t)) return true;
  return false;
}

function fingerprintPendingIssue(messages) {
  const parts = (messages || [])
    .map((m) => normalizeForFingerprint((m && m.body) || m))
    .filter(Boolean)
    .filter((t) => !isLowValueRiskNudge(t));
  if (!parts.length) return '';
  // Prefer strong-issue sentences; fall back to all meaningful text
  const strong = parts.filter((t) => STRONG_ISSUE_RE.test(t));
  const basis = (strong.length ? strong : parts).join(' | ').slice(0, 500);
  return crypto.createHash('sha1').update(basis).digest('hex').slice(0, 16);
}

function isEmptyOrWaitingSpamSummary(summary) {
  const t = stripHtml(summary);
  if (!t) return true;
  if (t.length < 24) return true;
  if (WAITING_SUMMARY_RE.test(t) && !STRONG_ISSUE_RE.test(t)) return true;
  // Pure waiting / no actionable content
  if (
    /^(?:client\s+)?(?:is\s+)?wait(?:ing)?\b/i.test(t) &&
    !STRONG_ISSUE_RE.test(t) &&
    countWords(t) <= 16
  ) {
    return true;
  }
  return false;
}

function buildFallbackProblemSummary(messages) {
  const meaningful = (messages || [])
    .map((m) => stripHtml((m && m.body) || m))
    .filter((t) => t && isMeaningfulRiskUpdate(t));
  if (!meaningful.length) return '';
  const joined = meaningful.join(' ').replace(/\s+/g, ' ').trim().slice(0, 320);
  if (/\bbreach/i.test(joined)) {
    return 'Client reports an account breach / rule issue and needs Risk review.';
  }
  if (/\bpayout|withdraw/i.test(joined)) {
    return 'Client needs Risk help with a payout / withdrawal on their account.';
  }
  if (/\blogin|password|credentials?/i.test(joined)) {
    return 'Client needs Risk help with account access / credentials.';
  }
  if (/\bkyc|verif/i.test(joined)) {
    return 'Client needs Risk help with KYC / verification.';
  }
  return 'Client needs Risk review: ' + joined.slice(0, 240);
}

/**
 * Pure decision for Risk silent / Risk-owned note path.
 * @returns {{
 *   action: 'NOTE'|'NOTE_MATERIAL'|'SKIP'|'ABSORB'|'CLEAR_AWAITING',
 *   reason: string,
 *   noteMessages?: Array,
 *   issueKey?: string,
 *   coverMsgIds?: string[],
 *   statePatch?: object,
 *   log?: string
 * }}
 */
function decideRiskNote(input) {
  const freshPending = Array.isArray(input && input.freshPending) ? input.freshPending : [];
  const pending = Array.isArray(input && input.pending) ? input.pending : freshPending;
  const lastTeamAt = Number((input && input.lastTeamAt) || 0);
  const silenceSec = Number((input && input.silenceSec) || 0);
  const silenceRequired = Number((input && input.silenceRequired) || 15 * 60);
  const minClientMsgs = Number((input && input.minClientMsgs) || 3);
  const longWordMin = Number((input && input.longWordMin) || 150);
  const state = (input && input.state) || {};
  const nowMs = Number((input && input.nowMs) || Date.now());

  const coverIds = (msgs) =>
    (msgs || []).map((m) => String((m && m.id) || '')).filter(Boolean);

  const noteAtSec = state.riskNoteAt ? Math.floor(Number(state.riskNoteAt) / 1000) : 0;
  const awaiting = !!(state.riskAwaitingTeam && state.riskNoteAt);

  // Risk (human team) replied after our note → reset cycle
  if (awaiting && lastTeamAt && lastTeamAt > noteAtSec) {
    const coverUntilReply = pending.filter((m) => Number(m.at || 0) <= lastTeamAt);
    return {
      action: 'CLEAR_AWAITING',
      reason: 'risk_replied_reset_cycle',
      coverMsgIds: coverIds(coverUntilReply),
      statePatch: {
        riskAwaitingTeam: false,
        lastRiskReplyAt: lastTeamAt,
        // Keep lastRiskNoteIssueKey cleared so a NEW issue can note once
        lastRiskNoteIssueKey: '',
        pendingIssueFingerprint: '',
        riskMaterialNoteKey: '',
      },
      log: 'RISK awaiting cleared , teammate replied',
    };
  }

  const meaningful = freshPending.filter((m) => isMeaningfulRiskUpdate(m && m.body));
  const nudgesOnly = freshPending.filter((m) => isLowValueRiskNudge(m && m.body));
  const material = freshPending.filter((m) => isMaterialNewEvidence(m && m.body));
  const issueKey = fingerprintPendingIssue(meaningful.length ? meaningful : freshPending);

  // ---- While awaiting Risk reply: ABSORB everything until Risk public-replies ----
  // Standing rule (Arsal): after ONE Risk note, do NOT write another Risk note until
  // Risk Team has messaged the client. No material/supplemental exception.
  if (awaiting) {
    if (!freshPending.length) {
      return {
        action: 'SKIP',
        reason: 'awaiting_team_after_note',
        log: 'RISK skip , awaiting team after note',
      };
    }
    return {
      action: 'ABSORB',
      reason: 'awaiting_absorb_until_risk_public_reply',
      coverMsgIds: coverIds(freshPending),
      statePatch: { riskAwaitingTeam: true },
      log: 'RISK absorb all client msgs while awaiting Risk public reply',
    };
  }

  // ---- Not awaiting: only note meaningful new unanswered issues ----
  if (!meaningful.length) {
    if (freshPending.length) {
      return {
        action: 'ABSORB',
        reason: 'low_value_nudges_only',
        coverMsgIds: coverIds(freshPending),
        log: 'RISK skip , low-value nudges only (no meaningful problem)',
      };
    }
    return {
      action: 'SKIP',
      reason: 'no_fresh_client_msgs',
      log: 'RISK wait , no fresh client msgs',
    };
  }

  // Same pending issue already noted and Risk has not replied since
  const priorKey = String(state.lastRiskNoteIssueKey || state.pendingIssueFingerprint || '');
  const lastReply = Number(state.lastRiskReplyAt || 0);
  const notedAt = noteAtSec;
  const riskRepliedSinceNote = lastReply && notedAt && lastReply > notedAt;
  if (priorKey && issueKey && priorKey === issueKey && !riskRepliedSinceNote && state.riskNoteAt) {
    return {
      action: 'ABSORB',
      reason: 'same_pending_issue_already_noted',
      coverMsgIds: coverIds(freshPending),
      statePatch: { riskAwaitingTeam: true },
      log: 'RISK skip , same pending issue already noted (awaiting Risk reply)',
    };
  }

  const longMeaningful = meaningful.filter((m) => countWords(m && m.body) >= longWordMin);
  const batchReady = meaningful.length >= Math.min(minClientMsgs, 2) || meaningful.length >= 3;
  // One strong concrete update is enough (after silence); avoid requiring 3 "I'm waiting"s.
  const strongReady =
    meaningful.some((m) => STRONG_ISSUE_RE.test(String(m.body || ''))) && meaningful.length >= 1;
  const longReady = longMeaningful.length > 0;
  if (!batchReady && !longReady && !strongReady) {
    return {
      action: 'SKIP',
      reason: 'need_meaningful_substance',
      log:
        'RISK wait , meaningful msgs ' +
        meaningful.length +
        ' (nudges ' +
        nudgesOnly.length +
        ')',
    };
  }

  if (silenceSec < silenceRequired) {
    return {
      action: 'SKIP',
      reason: 'under_silence',
      log: 'RISK wait , silence ' + silenceSec + ' < ' + silenceRequired,
    };
  }

  const noteMessages = longReady && !batchReady && !strongReady ? longMeaningful : meaningful;
  const path = longReady && noteMessages === longMeaningful ? 'long150' : strongReady ? 'meaningful' : 'batch';

  return {
    action: 'NOTE',
    reason: 'meaningful_new_unanswered_issue',
    noteMessages,
    issueKey: issueKey || fingerprintPendingIssue(noteMessages),
    coverMsgIds: coverIds(pending),
    path,
    statePatch: {
      riskAwaitingTeam: true,
      lastRiskNoteIssueKey: issueKey || fingerprintPendingIssue(noteMessages),
      pendingIssueFingerprint: issueKey || fingerprintPendingIssue(noteMessages),
      riskMaterialNoteKey: '',
    },
    log: 'RISK note-only',
  };
}

/** Whether escalate/risk notes should be blocked because Risk owns / is actively handling. */
function shouldBlockRiskOwnedNoteSpam(opts) {
  const o = opts || {};
  if (o.isRiskTeambox || o.isRiskAssigned) {
    if (o.riskAwaitingTeam) {
      return { block: true, reason: 'risk_awaiting_after_note' };
    }
    if (o.riskActivelyHandling) {
      return { block: true, reason: 'risk_actively_handling' };
    }
  }
  if (o.riskActivelyHandling && o.riskAwaitingTeam) {
    return { block: true, reason: 'risk_actively_handling_awaiting' };
  }
  return { block: false, reason: '' };
}

function polishRiskNoteSummary(summary, messages) {
  const raw = stripHtml(summary);
  if (!isEmptyOrWaitingSpamSummary(raw) && STRONG_ISSUE_RE.test(raw)) {
    return { summary: raw, rejected: false };
  }
  if (!isEmptyOrWaitingSpamSummary(raw) && countWords(raw) >= 10) {
    // Accept non-waiting summaries even without strong keywords
    if (!WAITING_SUMMARY_RE.test(raw)) return { summary: raw, rejected: false };
  }
  const fallback = buildFallbackProblemSummary(messages);
  if (fallback && !isEmptyOrWaitingSpamSummary(fallback)) {
    return { summary: fallback, rejected: !!raw, reason: 'replaced_waiting_spam' };
  }
  return { summary: '', rejected: true, reason: 'empty_or_waiting_spam' };
}

module.exports = {
  stripHtml,
  countWords,
  isLowValueRiskNudge,
  isMeaningfulRiskUpdate,
  isMaterialNewEvidence,
  fingerprintPendingIssue,
  isEmptyOrWaitingSpamSummary,
  buildFallbackProblemSummary,
  decideRiskNote,
  shouldBlockRiskOwnedNoteSpam,
  polishRiskNoteSummary,
  WAITING_SUMMARY_RE,
  LOW_VALUE_NUDGE_RE,
  STRONG_ISSUE_RE,
};
