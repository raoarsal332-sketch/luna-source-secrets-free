'use strict';
/**
 * contextualFollowUp.js — CONTEXTUAL_FOLLOWUP_V1
 *
 * Global short follow-up / coreference resolver. Runs BEFORE off-topic classification,
 * retrieval query selection, MISSED_QUESTION framing, scope-decline, and escalation.
 *
 * Resolves short deictic / completeness / elaboration follow-ups against the most recent
 * substantive client topic (or the latest bot FAQ answer's subject) when the latest message
 * itself carries no standalone FundedElite ask.
 *
 * Does NOT blindly attach every vague message: greetings, thanks, presence checks, competitor
 * names, and clear new topics stay untouched.
 */

const T = require('./statePresend/textUtils');

/** Completeness / expansion follow-ups on a prior list or answer. */
const COMPLETENESS_FOLLOWUP_RE = /^(?:i\s+mean\s+)?(?:only\s+these(?:\s+(?:differences?|ones?|rules?|things?))?|only\s+those(?:\s+(?:differences?|ones?|rules?|things?))?|only\s+that|is\s+that\s+all|is\s+this\s+all|that\s+all|this\s+all|anything\s+else|any\s+others?|are\s+there\s+more|what\s+else(?:\s+is\s+prohibited)?|what\s+about\s+the\s+others?|and\s+(?:these|those|the\s+others?)|which\s+ones?)\s*\??$/i;

/** Elaboration / why-how follow-ups that need prior topic. */
const ELABORATION_FOLLOWUP_RE = /^(?:i\s+mean\s+)?(?:why|how|then\s+what|what\s+about\s+that|can\s+you\s+explain\s+more|what\s+do\s+you\s+mean|tell\s+me\s+more|explain\s+(?:that|this|more|please)|more\s+details?|go\s+on)\s*\??$/i;

/** Bare demonstrative / anaphoric starters already partly covered by isReferentialFollowUp. */
const DEICTIC_BARE_RE = /^(?:i\s+mean\s+)?(?:those|that|them|these)(?:\s+(?:ones?|accounts?|rules?|things?))?\s*\??$/i;

// A short question about an attribute of the immediately preceding product or rule.
// The optional trailing article covers voice/typing slips such as "customisable a?".
const ATTRIBUTE_FOLLOWUP_RE = /^(?:(?:is|was|are|were)\s+(?:it|that|this|they|those)\s+(?:customi[sz]able|adjustable|changeable|fixed|optional|mandatory|removable|included|allowed)(?:\s+a)?|can\s+(?:it|that|this|they|those)\s+be\s+(?:customi[sz]ed|adjusted|changed|removed|selected)|can\s+i\s+(?:customi[sz]e|adjust|change|remove|select)\s+(?:it|that|this))\??$/i;

function strip(s) {
  return T.stripHtml(String(s || ''))
    .replace(/\u2019/g, "'")
    .replace(/[?!.,\s]+$/g, '')
    .replace(/^[?!.,\s]+/g, '')
    .trim();
}

function normalizeFollowUpKey(s) {
  return strip(s).toLowerCase().replace(/\s+/g, ' ');
}

/**
 * True when the latest client message is a short contextual follow-up that should inherit
 * prior topic — not a greeting, not a new substantive ask, not a competitor name.
 */
function isContextualFollowUp(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (raw.length > 160) return false;
  // Greetings / thanks / presence stay on the smalltalk path.
  if (T.isGreetingOrSmallTalk(raw)) return false;
  if (typeof T.isShortAck === 'function' && T.isShortAck(raw)) return false;
  try {
    if (T.isReferentialFollowUp(raw)) return true;
  } catch (_) {}
  const key = normalizeFollowUpKey(raw);
  if (!key) return false;
  if (COMPLETENESS_FOLLOWUP_RE.test(key) || COMPLETENESS_FOLLOWUP_RE.test(key + '?')) return true;
  if (ELABORATION_FOLLOWUP_RE.test(key) || ELABORATION_FOLLOWUP_RE.test(key + '?')) return true;
  if (DEICTIC_BARE_RE.test(key) || DEICTIC_BARE_RE.test(key + '?')) return true;
  if (ATTRIBUTE_FOLLOWUP_RE.test(key) || ATTRIBUTE_FOLLOWUP_RE.test(key + '?')) return true;
  // "what else is prohibited / restricted / not allowed"
  if (/^what\s+else\b/i.test(key) && key.split(/\s+/).length <= 8) return true;
  // "and these?" / "only these ones?"
  if (/^(?:and\s+)?(?:only\s+)?(?:these|those|that)(?:\s+ones?)?\s*$/i.test(key)) return true;
  return false;
}

function isSubstantiveClientAsk(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (isContextualFollowUp(t)) return false;
  if (T.isGreetingOrSmallTalk(t)) return false;
  if (typeof T.isShortAck === 'function' && T.isShortAck(t)) return false;
  try {
    if (typeof T.isContentlessMessage === 'function' && T.isContentlessMessage(t)) return false;
  } catch (_) {}
  // Very short without topic words is not a useful anchor.
  if (t.length < 8 && !/[?]/.test(t)) return false;
  return true;
}

/**
 * Walk recent conversation parts (newest last) and return the best prior substantive
 * client question to attach a contextual follow-up to.
 */
function findPriorSubstantiveClientAsk(parts, latestText) {
  const list = Array.isArray(parts) ? parts : [];
  const latestNorm = normalizeFollowUpKey(latestText);
  let skippedLatest = false;
  let bareSameRules = '';
  let bestProductAsk = '';
  for (let i = list.length - 1, seen = 0; i >= 0 && seen < 30; i -= 1, seen += 1) {
    const p = list[i];
    if (!p || String(p.part_type || '') === 'note') continue;
    const a = (p && p.author) || {};
    if (a.type !== 'user' && a.type !== 'lead') continue;
    const body = T.stripHtml(p.body || '').trim();
    if (!body) continue;
    if (!skippedLatest && normalizeFollowUpKey(body) === latestNorm) {
      skippedLatest = true;
      continue;
    }
    if (!isSubstantiveClientAsk(body)) continue;
    // Prefer a named Instant vs Instant Elite (or other product) ask over a bare
    // "are the rules the same?" turn that itself depended on prior product context.
    const bare =
      /^(?:are\s+(?:the\s+)?rules\s+the\s+same|what(?:'s|\s+is)\s+(?:the\s+)?(?:main\s+)?difference)\s*\??$/i.test(
        normalizeFollowUpKey(body)
      );
    if (bare) {
      if (!bareSameRules) bareSameRules = body;
      continue;
    }
    // Anchor to the nearest substantive question. A distant comparison must never
    // override the Flash target (or any other new topic) immediately before "is it...?".
    if (!bestProductAsk) bestProductAsk = body;
    break;
  }
  return bestProductAsk || bareSameRules || '';
}

/**
 * If the prior client ask is weak but the bot just gave a FAQ-style answer, use a
 * synthetic topic hint from keywords in that bot reply (for retrieval only).
 */
function topicHintFromBotReply(botText) {
  const t = T.stripHtml(String(botText || ''));
  if (!t || t.length < 40) return '';
  const hints = [];
  if (/\b(?:prohibited|restricted|not\s+allowed|must\s+not)\b/i.test(t)) hints.push('prohibited strategies and restricted trading practices');
  if (/\b(?:account\s+sharing|passing\s+service)\b/i.test(t)) hints.push('account sharing and passing services');
  if (/\b(?:expert\s+advisor|\bEAs?\b|martingale|grid\s+system)/i.test(t)) hints.push('EA and automated trading rules');
  if (/\b(?:hedg(?:e|ing)|latency|server\s+spam|account\s+rolling)\b/i.test(t)) hints.push('prohibited trading practices');
  if (/\b(?:payout|withdraw)/i.test(t)) hints.push('payout rules');
  if (/\b(?:soft\s+breach|hard\s+breach)\b/i.test(t)) hints.push('soft breach rules');
  return hints[0] || '';
}

function lastBotPublicText(parts) {
  const list = Array.isArray(parts) ? parts : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    if (!p || String(p.part_type || '') !== 'comment') continue;
    const a = (p && p.author) || {};
    if (a.type !== 'admin' && a.type !== 'bot') continue;
    const body = T.stripHtml(p.body || '').trim();
    if (body) return body;
  }
  return '';
}

/**
 * @returns {{ isFollowUp:boolean, resolvedText:string, priorAsk:string, reason:string }}
 */
function resolveContextualFollowUp(opts) {
  const latestText = String((opts && opts.latestText) || '').trim();
  const parts = (opts && opts.parts) || [];
  if (!isContextualFollowUp(latestText)) {
    return { isFollowUp: false, resolvedText: latestText, priorAsk: '', reason: 'not-followup' };
  }
  const priorAsk = findPriorSubstantiveClientAsk(parts, latestText);
  if (priorAsk) {
    if (ATTRIBUTE_FOLLOWUP_RE.test(normalizeFollowUpKey(latestText))) {
      return { isFollowUp: true, resolvedText: priorAsk + '\n\nClient follow-up: ' + latestText,
        priorAsk, reason: 'attribute-followup' };
    }
    // Completeness follow-ups: ask to expand the prior topic.
    if (COMPLETENESS_FOLLOWUP_RE.test(normalizeFollowUpKey(latestText)) || /^what\s+else\b/i.test(latestText)) {
      const resolved = priorAsk + '\n\n[Client follow-up: ' + latestText + ' — confirm whether the prior answer covered everything material, and add any remaining official prohibited/restricted items or related conditions that belong with that topic. Do not invent rules.]';
      return { isFollowUp: true, resolvedText: resolved, priorAsk, reason: 'completeness-expand' };
    }
    const resolved = priorAsk + '\n\n[Client follow-up referring to the above: ' + latestText + ']';
    return { isFollowUp: true, resolvedText: resolved, priorAsk, reason: 'prior-client-ask' };
  }
  const bot = lastBotPublicText(parts);
  const hint = topicHintFromBotReply(bot);
  if (hint) {
    return {
      isFollowUp: true,
      resolvedText: hint + '\n\n[Client follow-up: ' + latestText + ' — continue from the previous FundedElite answer; expand with any remaining official facts on this topic.]',
      priorAsk: hint,
      reason: 'prior-bot-topic',
    };
  }
  // Follow-up shape but nothing to attach to — leave as-is (may clarify later).
  return { isFollowUp: true, resolvedText: latestText, priorAsk: '', reason: 'followup-no-anchor' };
}

module.exports = {
  isContextualFollowUp,
  resolveContextualFollowUp,
  findPriorSubstantiveClientAsk,
  COMPLETENESS_FOLLOWUP_RE,
  ELABORATION_FOLLOWUP_RE,
  ATTRIBUTE_FOLLOWUP_RE,
};
