'use strict';

/**
 * publicRestatementGuard.js — deterministic public-reply content check.
 *
 * A public reply must answer the customer. It fails when the draft is mainly a
 * paraphrase of the question, a third-person restatement, or an internal-note
 * summary ("Daniel's dashboard…", "the client wants to know…", "you are asking…")
 * and it does not also give a resolution, explanation, required clarification,
 * or next step.
 *
 * Internal notes, escalation summaries, and teammate summaries are a different
 * channel. classifyChannel() accepts those. This module must not be applied to
 * note polish or owner-commanded public text.
 *
 * Formatting stays in publicResponseContract.applyPublicResponseContract.
 * This check does not blank a draft; presend and the send boundary refuse it.
 */

const T = require('./statePresend/textUtils');

const CODE = 'PUBLIC_RESTATEMENT';

const CORRECTION =
  'This draft only restates the client question or describes it in the third person. ' +
  'Answer the client directly in second person: give the resolution, the explanation, the one clarification you need, or the next step. ' +
  'Do not narrate ("the client wants to know", "Daniel says", "the customer is asking", "you are asking"). ' +
  'If you cannot answer from approved knowledge, use ACTION: ESCALATE with CLIENT as a short second-person handoff and BODY as an internal summary that must never be the public reply.';

const NARRATION_RE = new RegExp(
  [
    '\\bthe\\s+(?:client|customer|user)\\b',
    '\\b(?:he|she)\\s+(?:wants|is asking|asked|says|needs|reports)\\b',
    '\\b(?:his|her)\\s+(?:dashboard|account|payout|screenshot|message)\\b',
    '\\bwants to know\\b',
    '\\b(?:client|customer)\\s+(?:reports|is asking|wants|says)\\b',
    '\\bthe customer sent\\b',
    '\\bsent a screenshot\\b',
    "\\byou(?:'re| are) asking\\b",
    '\\byou (?:want|wanted) to know\\b',
    // PUBLIC_RESTATEMENT_V2: plural third-person narration ("They say the account was breached...")
    '\\bthey\\s+(?:say|said|claim|claimed|mention|mentioned|report|reported|state|stated|want|wants|are asking|asked|would like)\\b',
  ].join('|'),
  'i'
);

// Case-sensitive so ordinary words are not treated as a customer's name.
const NAME_NARRATION_RE = /\b(?!FundedElite\b|Intercom\b|Arsal\b)[A-Z][a-z]+(?:'s|’s)\s+(?:dashboard|account|payout|screenshot)\b/;

const META_RE = /\byou(?:'re| are) asking\b|\byou (?:want|wanted) to know\b/i;

const EMBEDDED_QUESTION_RE = /\b(?:wants to know|is asking|asked whether|asked if|wondering)\b/i;

const RESOLUTION_RE = new RegExp(
  [
    "\\byou(?:'ll|\\s+will|\\s+can|\\s+may|\\s+should|\\s+need|\\s+must|\\s+are able|\\s+cannot|\\s+can't)\\b",
    '\\b(?:please|kindly)\\s+(?:submit|send|open|go|share|request|complete|use|wait|check)\\b',
    '\\b(?:after|once)\\s+you\\b',
    '\\bif (?:the |all (?:the )?)?(?:eligibility )?requirements are met\\b',
    '\\b(?:this|that) means\\b',
    '\\bmeans that\\b',
    '\\bthe (?:risk\\s+)?(?:rule|limit|policy|requirements?) (?:is|are|means)\\b',
    '\\bwill be (?:checked|completed|processed|reviewed|available)\\b',
    '\\btakes place\\b',
    '\\b(?:is|are) (?:allowed|not allowed|required)\\b',
    '^(?:please\\s+)?(?:open|submit|send|go|check|use|wait|request|complete|copy|log)\\b',
  ].join('|'),
  'i'
);

const POLICY_STATEMENT_RE = /\b(?:there is no|there isn't|there are no|is static|is trailing|is adjustable|are independent|is independent|depends on the)\b/i;

function prep(s) {
  return T.stripHtml(s).replace(/[\u2018\u2019\u2032]/g, "'");
}

function isNarration(s) {
  return NARRATION_RE.test(s) || NAME_NARRATION_RE.test(s);
}

function isBarePolarity(s) {
  return /^(?:yes|no|yeah|yep|nope)[.!]?\s*$/i.test(String(s || '').trim());
}

function hasCustomerFacingNegation(s) {
  return /\b(?:does not|do not|doesn't|don't|will not|won't)\b/i.test(s) && /\b(?:you|your)\b/i.test(s);
}

function hasDirectResolution(s) {
  if (META_RE.test(s) || EMBEDDED_QUESTION_RE.test(s)) return false;
  return RESOLUTION_RE.test(s) || hasCustomerFacingNegation(s);
}

function isCustomerClarification(s) {
  if (!/\?\s*$/.test(String(s || '').trim())) return false;
  if (META_RE.test(s) || EMBEDDED_QUESTION_RE.test(s)) return false;
  if (isNarration(s) && !/\b(?:you|your)\b/i.test(s)) return false;
  return true;
}

function tokenList(s) {
  return T.tokens(s).map((t) => T.stem(t));
}

function tokenSet(s) {
  return new Set(tokenList(s));
}

function containmentRatio(draftTokens, clientSet) {
  if (!draftTokens.length) return 0;
  let hit = 0;
  for (const t of draftTokens) if (clientSet.has(t)) hit += 1;
  return hit / draftTokens.length;
}

function hasNewFigure(sentence, clientText) {
  const figs = String(sentence || '').match(/\b\d+(?:[.,]\d+)?%?/g) || [];
  const client = String(clientText || '');
  return figs.some((f) => {
    if (!/%/.test(f) && f.length < 2) return false;
    return !client.includes(f);
  });
}

function isNewInformation(s, clientSet) {
  if (isNarration(s) || META_RE.test(s)) return false;
  const toks = tokenList(s);
  if (toks.length < 5) return false;
  return containmentRatio(toks, clientSet) < 0.45;
}

// HANDOFF_DONE_IS_ANSWER_V1 (2026-09-26, live 215476097914090): "I've forwarded your request for a human review by
// the affiliate team." answers "Please forward to a human from the affiliate team" by doing it. It shares most of the
// client's words, so the containment test called it a restatement, the send was blocked after the note was written,
// and the client got nothing. A first-person COMPLETED handoff is the answer. (Paths that write no note strip handoff
// claims separately: HANDOFF_CLAIM_STRIP_V1 in index.js.)
const HANDOFF_DONE_RE = /\b(?:i(?:'|\u2019)ve|i\s+have|i|we(?:'|\u2019)ve|we\s+have)\s+(?:just\s+|now\s+|already\s+)?(?:forwarded|passed|escalated|sent|handed|raised|shared|referred)\b[^.?!]{0,90}\b(?:team|teammate|human|colleague|agent|specialist|department|manager)s?\b/i;

function sentenceIsAnswer(s, clientText, clientSet) {
  if (isBarePolarity(s)) return false;
  if (HANDOFF_DONE_RE.test(s)) return true;
  if (isCustomerClarification(s)) return true;
  const narr = isNarration(s);
  const resolved = hasDirectResolution(s);
  if (narr && !resolved) return false;
  if (resolved) return true;
  if (!narr && POLICY_STATEMENT_RE.test(s)) return true;
  if (!narr && hasNewFigure(s, clientText)) return true;
  if (!narr && isNewInformation(s, clientSet)) return true;
  return false;
}

/**
 * @param {string} draft
 * @param {string} clientText
 * @returns {{ fail: boolean, code: string|null, reason?: string, correction?: string, contain?: number }}
 */
function assess(draft, clientText) {
  const d = prep(draft);
  const c = prep(clientText || '');
  if (!d) return { fail: false, code: null };
  if (T.isShortAck(d)) return { fail: false, code: null };
  if (isBarePolarity(d)) return { fail: false, code: null };

  const pieces = T.sentences(d);
  const sents = pieces.length ? pieces : [d];
  const clientSet = tokenSet(c);
  const answers = [];
  let narr = false;
  let meta = false;
  for (const s of sents) {
    if (isNarration(s)) narr = true;
    if (META_RE.test(s)) meta = true;
    if (sentenceIsAnswer(s, c, clientSet)) answers.push(s);
  }
  const contain = containmentRatio(tokenList(d), clientSet);
  // PUBLIC_RESTATEMENT_V2: a draft that narrates the client and never addresses them is note text,
  // whatever else it contains. Live 215476067497045 shipped "The client wants account 000000
  // checked ... They say the account was breached when it was near $750" because "$750" (from an
  // earlier message) counted as new information.
  if (narr && !/\b(?:you|your|you're|you'll|you've|yours)\b/i.test(d)) {
    return {
      fail: true,
      code: CODE,
      reason: 'Public reply narrates the client in the third person and never addresses them.',
      correction: CORRECTION,
      contain,
    };
  }
  if (answers.length) return { fail: false, code: null, contain };

  const draftToks = tokenList(d);
  const clientToks = tokenList(c);
  if (narr || meta) {
    return {
      fail: true,
      code: CODE,
      reason: 'Public reply restates the client in the third person or only describes the question.',
      correction: CORRECTION,
      contain,
    };
  }
  if (clientToks.length >= 2 && draftToks.length >= 4 && contain >= 0.62) {
    return {
      fail: true,
      code: CODE,
      reason: 'Public reply paraphrases the client question and does not answer it.',
      correction: CORRECTION,
      contain,
    };
  }
  return { fail: false, code: null, contain };
}

/**
 * Internal-note / escalation / teammate summaries are valid in their own channel.
 * @param {string} text
 * @param {string} clientText
 * @param {string} channel 'public' | 'internal-note' | 'note' | 'escalation-summary' | 'teammate-summary'
 */
function classifyChannel(text, clientText, channel) {
  const ch = String(channel || 'public').toLowerCase();
  if (ch === 'internal-note' || ch === 'internal' || ch === 'note' || ch === 'escalation-summary' || ch === 'teammate-summary') {
    return { ok: true, channel: ch, code: null };
  }
  const result = assess(text, clientText);
  return {
    ok: !result.fail,
    channel: 'public',
    code: result.fail ? CODE : null,
    reason: result.reason || '',
  };
}

function clientTextFrom(state, messages) {
  const direct = state && state.last_client_message;
  if (direct && String(direct).trim()) return String(direct);
  const msgs = Array.isArray(messages) ? messages : [];
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i] || {};
    const role = String(m.role || m.author_type || m.from || '').toLowerCase();
    if (role !== 'client' && role !== 'user' && role !== 'customer') continue;
    const t = m.text || m.body || '';
    if (String(t).trim()) return String(t);
  }
  return '';
}

/**
 * FAST → FULL only when the draft is a public restatement AND the ask is one
 * approved knowledge can answer. Account-specific asks stay on the human path.
 * @param {string} rawDraft
 * @param {string} clientText
 * @param {{ parseAction?: Function, isKnowledgeAnswerable?: Function }} hooks
 * @returns {boolean}
 */
function shouldPromoteRestatement(rawDraft, clientText, hooks) {
  hooks = hooks || {};
  if (typeof hooks.parseAction !== 'function' || typeof hooks.isKnowledgeAnswerable !== 'function') return false;
  let parsed = null;
  try { parsed = hooks.parseAction(rawDraft); } catch (_) { return false; }
  if (!parsed || parsed.action !== 'REPLY') return false;
  const result = assess(parsed.body || '', clientText);
  if (!result.fail) return false;
  try { return !!hooks.isKnowledgeAnswerable(clientText); } catch (_) { return false; }
}

module.exports = {
  CODE,
  CORRECTION,
  assess,
  classifyChannel,
  clientTextFrom,
  shouldPromoteRestatement,
  isNarration,
  sentenceIsAnswer,
};
