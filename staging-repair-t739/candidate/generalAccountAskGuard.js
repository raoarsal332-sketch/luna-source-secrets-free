'use strict';
/**
 * generalAccountAskGuard.js — GENERAL_ACCOUNT_ASK_GUARD_V1.
 *
 * Owner rule: Luna may ask for an account number / email only when a teammate has to open THIS
 * client's account. A question the approved knowledge answers (rules, payouts, profitable days,
 * soft breach, stop loss, products, dashboard options) must be answered, never met with
 * "please share your account number".
 *
 * Live 2026-09-23 (215476072310759): a multi-rule general question ("any CID rule? max lot size?
 * hedging? stop loss? hidden rules?") → model ESCALATE → ESCALATE→REPLY force (prompt says "Do NOT
 * ask for account number") → the forced REPLY body was "Can you send the account number linked to
 * this issue? I'll pass it to a teammate once I have it." and was SENT: nothing checked the forced
 * body, and the presend gate has no rule against identity asks on general questions. The only such
 * check (teammateTopicOwnership.scopedBodyViolation) runs in teammate-scoped mode only.
 *
 * Legitimate identity collection is untouched: the escalation path asks through
 * ensureIdentityBeforeAccountEscalate() (posted directly, never through a REPLY draft), and this
 * guard stands down whenever any unanswered client message is account work, the latest bot
 * message is already collecting identity, or the draft is not a general answer.
 * Pure functions only; the handler supplies the predicates (isKnowledgeAnswerableAsk,
 * presendNeedsBackendLook) so the definition of "general" stays single-sourced in index.js.
 */

// "share/send/provide/confirm your account number", "what is your registered email", "account ID",
// "MT5 login", "the email linked to your account".
const IDENTITY_ASK_RE = new RegExp([
  String.raw`\b(?:share|send|provide|confirm|give|tell|drop|post|include|need|require|want)\b[^.?!\n]{0,70}\b(?:account\s*(?:number|no\.?|#|id|login)|(?:mt[45]|platform|trading)\s+login|login\s+(?:id|number)|registered\s+e-?mail|e-?mail\s+(?:address|linked|associated|used|on\s+(?:your|the)\s+account)|your\s+e-?mail)\b`,
  String.raw`\b(?:what|which)\s+(?:is|was)\s+your\s+(?:account\s*(?:number|id|login)|registered\s+e-?mail|e-?mail(?:\s+address)?|login\s+id)\b`,
  String.raw`\b(?:your|the)\s+account\s*(?:number|id)\s+(?:linked|related|associated)\b`,
].join('|'), 'i');

// "I'll pass it to a teammate", "Before I pass this to the team", "I've forwarded this".
const HANDOFF_PROMISE_RE = /\b(?:i(?:'ll|\s+will|'ve|\s+have)?\s+(?:pass|forward|escalate|hand|send|flag)\w*\s+(?:it|this|that|your\s+\w+)?\s*(?:on\s+)?(?:to|over\s+to|with)\s+(?:a|the|our)\s+(?:support\s+)?(?:teammate|team|colleague|agent|specialist)|before\s+i\s+(?:pass|forward|escalate|hand)\b|once\s+i\s+have\s+it\b)/i;

function asksForIdentity(body) {
  return IDENTITY_ASK_RE.test(String(body || ''));
}

function splitSentences(text) {
  const out = [];
  for (const para of String(text || '').split(/(\n+)/)) {
    if (/^\n+$/.test(para)) { out.push(para); continue; }
    const bits = para.match(/[^.?!]+(?:[.?!]+|$)\s*/g) || [para];
    for (const b of bits) out.push(b);
  }
  return out;
}

/** Remove every sentence that asks for identity or promises a teammate handoff. */
function stripIdentityAsks(body) {
  const kept = splitSentences(body).filter((s) => /^\n+$/.test(s) || !(IDENTITY_ASK_RE.test(s) || HANDOFF_PROMISE_RE.test(s)));
  return kept.join('').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
}

/** Enough left to be an answer (not a stub like "Sure." or a lone heading). */
function isSubstantiveAnswer(text) {
  const t = String(text || '').trim();
  if (t.length < 60) return false;
  return (t.match(/[a-z]{3,}/gi) || []).length >= 10;
}

/**
 * Should an identity ask in this REPLY draft be treated as a violation?
 * @param {object} a
 * @param {string} a.draft                 final reply body about to be sent
 * @param {string[]} a.pendingClientTexts  unanswered client messages since the last public reply
 *                                         (newest last; contentless nudges already resolved to the
 *                                         question they point at)
 * @param {string} [a.lastBotText]         latest public bot/teammate message
 * @param {(t:string)=>boolean} a.isGeneralAsk      knowledge-answerable, not account work
 * @param {(t:string)=>boolean} a.isAccountWork     needs a teammate to open this account
 * @returns {{violation:boolean, reason:string}}
 */
function assessDraft(a) {
  const draft = String((a && a.draft) || '');
  if (!asksForIdentity(draft)) return { violation: false, reason: 'no_identity_ask' };
  const pending = ((a && a.pendingClientTexts) || []).map((t) => String(t || '').trim()).filter(Boolean);
  if (!pending.length) return { violation: false, reason: 'no_pending_ask' };
  if (a.lastBotText && asksForIdentity(a.lastBotText)) return { violation: false, reason: 'identity_collection_in_progress' };
  if (pending.some((t) => a.isAccountWork(t))) return { violation: false, reason: 'account_work_pending' };
  // An account problem raised earlier in the thread (already answered once) still makes identity
  // collection legitimate for the follow-ups about it.
  if ((a.recentClientTexts || []).some((t) => a.isAccountWork(String(t || '')))) return { violation: false, reason: 'account_work_in_thread' };
  if (!pending.some((t) => a.isGeneralAsk(t))) return { violation: false, reason: 'not_general' };
  return { violation: true, reason: 'identity_ask_on_general_question' };
}

module.exports = { IDENTITY_ASK_RE, HANDOFF_PROMISE_RE, asksForIdentity, stripIdentityAsks, isSubstantiveAnswer, assessDraft, splitSentences };
