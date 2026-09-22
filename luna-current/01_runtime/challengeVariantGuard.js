'use strict';

const TWO_STEP_RE = /\b(?:2[\s-]*step|two[\s-]*step)\b/i;
const EXPLAIN_RE = /\b(?:what(?:'s| is| are)|tell me about|explain|describe|details? (?:of|about|for)|rules? (?:of|for|about))\b/i;
const SPECIFIC_VARIANT_RE = /\b(?:lite|standard|free[\s-]*retry|second chance)\b/i;
const OTHER_PRODUCT_RE = /\b(?:1[\s-]*step|one[\s-]*step|instant|catalyst|flash)\b/i;
const COMPARISON_RE = /\b(?:difference|compare|versus|vs\.?|both|all challenges)\b/i;
const MULTI_REQUEST_RE = /\b(?:and|also|plus)\b/i;
const HUMAN_RE = /\b(?:live agent|human agent|real person|speak to (?:an? )?agent|talk to (?:an? )?agent)\b/i;

// These are factual safety fallbacks, not scripts. A valid model-written reply is
// preserved so Luna can respond naturally from the full conversation context.
const CLARIFICATION_VARIANTS = [
  'Happy to explain it. Are you asking about 2-Step Lite or 2-Step + Free Retry? Once you confirm, I’ll walk you through the right version.',
  'FundedElite has two versions of the 2-Step challenge: 2-Step Lite and 2-Step + Free Retry. Which one are you considering?',
  'Just so I give you the correct details, do you mean 2-Step Lite or 2-Step + Free Retry?',
  'I can help with that. Which option would you like explained: 2-Step Lite or 2-Step + Free Retry?',
  'The rules differ between our two versions. Are you looking at 2-Step Lite, or 2-Step + Free Retry?',
];
const CLARIFICATION = CLARIFICATION_VARIANTS[0];
const CLARIFICATION_AGAIN = CLARIFICATION_VARIANTS[1];
const MEANING_RE = /^(?:w?hat\s+do\s+you\s+mean|what\s+does\s+that\s+mean|can\s+you\s+explain\s+what\s+you\s+mean)\s*[?.!]*$/i;
const MEANING_VARIANTS = [
  'A 2-Step challenge means you complete Phase 1 and Phase 2 before moving to the live phase. We offer 2-Step Lite and 2-Step + Free Retry, so which version would you like me to explain?',
  'By 2-Step, I mean an evaluation with Phase 1 and Phase 2 before the live phase. The available versions are 2-Step Lite and 2-Step + Free Retry. Which one are you asking about?',
  'It is a two-phase evaluation: you pass Phase 1 and then Phase 2 before reaching the live phase. Would you like the details for 2-Step Lite or 2-Step + Free Retry?',
];
const MEANING_REPLY = MEANING_VARIANTS[0];
const LEGACY_CANNED_REPLIES = new Set([
  'We have two 2-Step challenges: 2-Step Lite and 2-Step + Free Retry. Which one would you like me to explain?',
  'A 2-Step challenge has Phase 1 and Phase 2 before the live phase. We offer two versions: 2-Step Lite and 2-Step + Free Retry. Which version are you asking about?',
  'I mean that a 2-Step challenge has two evaluation phases before the live phase. FundedElite offers 2-Step Lite and 2-Step + Free Retry. The Free Retry version includes an eligible second chance during evaluation; Lite does not. Which version would you like the rules for?',
]);

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function hasBothVariants(text) {
  const value = String(text || '');
  return /2[\s-]*step\s+lite/i.test(value) && /2[\s-]*step[^.?!\n]*free[\s-]*retry|free[\s-]*retry/i.test(value);
}

function isUsefulClarification(text) {
  const value = String(text || '').trim();
  return hasBothVariants(value) && /\?|\b(?:which|do you mean|are you (?:asking|looking|interested)|would you like)\b/i.test(value);
}

function isUsefulMeaningReply(text) {
  const value = String(text || '').trim();
  return hasBothVariants(value) && /\bphase\s*1\b/i.test(value) && /\bphase\s*2\b/i.test(value);
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickFreshVariant(variants, priorBotTexts, seed) {
  const previous = new Set((priorBotTexts || []).slice(-12).map(normalize));
  const available = variants.filter((variant) => !previous.has(normalize(variant)));
  const choices = available.length ? available : variants;
  return choices[hashSeed(seed) % choices.length];
}

function shouldClarifyTwoStep(latestText, priorClientTexts = []) {
  const latest = String(latestText || '').trim();
  if (!TWO_STEP_RE.test(latest) || !EXPLAIN_RE.test(latest)) return false;
  if (SPECIFIC_VARIANT_RE.test(latest) || OTHER_PRODUCT_RE.test(latest) || COMPARISON_RE.test(latest) ||
      MULTI_REQUEST_RE.test(latest) || HUMAN_RE.test(latest)) return false;
  // A recent explicit choice carries over to the next product question.
  return !priorClientTexts.slice(-3).some((text) =>
    SPECIFIC_VARIANT_RE.test(String(text || ''))
  );
}

function clarifyTwoStepReply(latestText, priorClientTexts, draft, priorBotTexts = [], conversationId = '') {
  if (!shouldClarifyTwoStep(latestText, priorClientTexts)) return draft;
  const isLegacyCanned = LEGACY_CANNED_REPLIES.has(String(draft || '').trim());
  if (isUsefulClarification(draft) && !isLegacyCanned) return draft;
  return pickFreshVariant(
    CLARIFICATION_VARIANTS,
    priorBotTexts,
    [conversationId, latestText, priorClientTexts.slice(-3).join('|'), draft].join('|')
  );
}

function explainTwoStepFollowup(latestText, priorBotTexts = [], draft, conversationId = '') {
  if (!MEANING_RE.test(String(latestText || '').trim())) return draft;
  const lastBot = String(priorBotTexts.slice(-1)[0] || '');
  if (!/2[\s-]*step/i.test(lastBot) || !/lite/i.test(lastBot) || !/free\s*retry/i.test(lastBot)) return draft;
  const isLegacyCanned = LEGACY_CANNED_REPLIES.has(String(draft || '').trim());
  if (isUsefulMeaningReply(draft) && !isLegacyCanned) return draft;
  return pickFreshVariant(MEANING_VARIANTS, priorBotTexts, [conversationId, latestText, draft].join('|'));
}

module.exports = {
  shouldClarifyTwoStep,
  clarifyTwoStepReply,
  explainTwoStepFollowup,
  isUsefulClarification,
  isUsefulMeaningReply,
  CLARIFICATION,
  CLARIFICATION_AGAIN,
  MEANING_REPLY,
  CLARIFICATION_VARIANTS,
  MEANING_VARIANTS,
};
