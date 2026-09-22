'use strict';

/**
 * challengeVariantGuard.js — generic FundedElite product-family variant awareness.
 *
 * When a client asks generally about a product that has multiple approved variants
 * (e.g. Instant vs Instant Elite, 2-Step Lite vs 2-Step + Free Retry), Luna must not
 * silently assume one variant. Prefer a brief dual distinguish + ask, or a concise
 * clarification, using ONLY approved FAQ distinctions.
 *
 * Explicitly named variants skip clarification. "both" / difference / compare / between
 * them / farq / vs after a pending ask OR recent dual-variant bot reply uses the family's
 * both-path (never SCOPE_DECLINE). Typos via statePresend/typoNormalizer when present.
 *
 * Extends the former 2-Step-only guard; exports keep legacy names for index.js hooks.
 */

const EXPLAIN_RE = /\b(?:what(?:'s| is| are)|tell me(?:\s+about)?|explain|describe|details?(?:\s+(?:of|about|for))?|rules?(?:\s+(?:of|for|about))?|how does|how do|info(?:rmation)?(?:\s+(?:on|about|for))?|interested (?:in|about))\b/i;
const GENERAL_PRODUCT_ASK_RE = /\b(?:challenge|funding|program|product|plan|account\s+sizes?|rules?|info|details?)\b/i;
const ACCOUNT_SPECIFIC_RE = /\b(?:my\s+account|account\s*#|order\s*#|breach(?:ed)?|payout|withdraw(?:al)?|login|password|credential|ticket|invoice)\b/i;

// "which rules are DIFFERENT between X and Y" is a comparison just as much as "difference".
const COMPARISON_RE = /\b(?:differen(?:ce|ces|t|tly)|differ|compare|comparison|versus|vs\.?|both|all challenges)\b/i;

/**
 * Attributes a client can ask about. Used to decide whether a variant clarification would
 * actually change the answer (see variantSensitiveRe on each family).
 */
const ATTRIBUTE_ASK_RE = /\b(?:consistency|drawdown|draw\s*down|daily\s+loss|max(?:imum)?\s+loss|leverage|profit\s*split|profit\s+target|payout|withdraw\w*|holding\s+time|hold\w*\s+for|scalp\w*|weekend|second\s+chance|free\s*retry|retry|platform|metatrader|mt5|tradelocker|phase|size|sizes|price|cost|fee|fees|news|expert\s+advisor|\bea\b|copy\s+trad\w*|swap|spread|reset|kyc|consistency\s+rule|refund|martingale|lot\s*size)\b/i;
const MULTI_REQUEST_RE = /\b(?:and|also|plus)\b/i;
const HUMAN_RE = /\b(?:live agent|human agent|real person|speak to (?:an? )?agent|talk to (?:an? )?agent)\b/i;

const BOTH_CLIENT_RE = /(?:^(?:about\s+)?both(?:\s+of\s+them)?[.!?]*$)|(?:\b(?:talk(?:ing)?|ask(?:ing)?|mean(?:ing)?|referr(?:ing)?)\s+(?:about\s+|for\s+)?both\b)|(?:\b(?:i\s+)?(?:want|need|mean)\s+both\b)|(?:\bboth\s+(?:of\s+them|please|pls)\b)|(?:\b(?:dono|donon)\b)/i;

// Anaphoric comparison follow-ups after a pending/recent product-family dual context.
// "Tell me main difference between them" / "Difference between both" / "compare" / "farq" / "vs"
// must NOT become SCOPE_DECLINE when Luna just asked Instant vs Instant Elite (etc.).
const COMPARISON_FOLLOWUP_RE = /(?:\b(?:main\s+)?differences?\b|\b(?:compare|comparison|versus)\b|\bvs\.?\b|\bbetween\s+(?:them|both(?:\s+of\s+them)?|the\s+two)\b|\b(?:dono|donon|farq|farak)\b|\bwhat about (?:the\s+)?(?:other|second|first)\b)/i;

// Short choice / deixis follow-ups after a variant ask ("the first one", "elite", "yes that",
// "uska", "woh", "that one") — inherit FundedElite FAQ scope; do NOT force BOTH template.
const VARIANT_CHOICE_FOLLOWUP_RE = /^(?:(?:the\s+)?(?:first|second|other|latter|former)(?:\s+one)?|(?:yes(?:\s*,?\s*that)?|yeah(?:\s*,?\s*that)?|yep|that\s+one|this\s+one|uska|usska|woh|wo|wahi)|(?:the\s+)?(?:lite|elite|standard|free\s*retry)(?:\s+one)?)[.!?]*$/i;

// External subjects that must never ride the comparison/anaphora path.
const COMPARISON_EXTERNAL_RE = /\b(?:bitcoin|btc|ethereum|eth|dogecoin|weather|football|cricket|soccer|movie|film|recipe|politic\w*|election)\b/i;

const MEANING_RE = /^(?:w?hat\s+do\s+you\s+mean|what\s+does\s+that\s+mean|can\s+you\s+explain\s+what\s+you\s+mean)\s*[?.!]*$/i;

/**
 * Data-driven product families. Distinctions are sourced from approved FAQ /
 * Arsal corrections only — never invent numbers or rules here.
 */
const PRODUCT_FAMILIES = [
  {
    id: '2_step',
    label: '2-Step',
    familyRe: /\b(?:2[\s-]*step|two[\s-]*step)\b/i,
    // Named variant tokens that mean the client already picked one.
    specificVariantRe: /\b(?:lite|standard|free[\s-]*retry|second chance)\b/i,
    otherProductRe: /\b(?:1[\s-]*step|one[\s-]*step|instant|catalyst|flash)\b/i,
    supportsBoth: true,
    // Must appear together in a useful dual reply.
    hasBothVariants(text) {
      const value = String(text || '');
      return /2[\s-]*step\s+lite/i.test(value) &&
        (/2[\s-]*step[^.?!\n]*free[\s-]*retry/i.test(value) || /free[\s-]*retry/i.test(value));
    },
    botAskedVariant(bot) {
      const t = String(bot || '');
      return /2[\s-]*step/i.test(t) && /\blite\b/i.test(t) && /free\s*retry/i.test(t) &&
        /\?|\b(?:which|do you mean|are you (?:asking|looking|considering|interested)|would you like)\b/i.test(t);
    },
    // Lite versus + Free Retry differ in the second chance and in the stricter Lite drawdown
    // limits and price (FAQ "LITE Challenge (NO SECOND CHANCE)"), so those asks DO need the
    // variant. Shared attributes (leverage, platform, payout cadence) do not.
    variantSensitiveRe: /\b(?:second\s+chance|free\s*retry|retry|drawdown|draw\s*down|daily\s+loss|max(?:imum)?\s+loss|price|cost|fee|fees|target)\b/i,
    // Phase 2 "reduces to 5%" in BOTH 2-Step articles, so a phase-2 target ask needs no variant.
    variantInsensitiveRe: /\bphase\s*2\b/i,
    usefulDistinctionRe: /\bsecond chance\b/i,
    usefulStructureRe: /\bphase\s*1\b/i,
    clarificationVariants: [
      'Happy to explain it. Are you asking about 2-Step Lite or 2-Step + Free Retry? Once you confirm, I’ll walk you through the right version.',
      'FundedElite has two versions of the 2-Step challenge: 2-Step Lite and 2-Step + Free Retry. Which one are you considering?',
      'Just so I give you the correct details, do you mean 2-Step Lite or 2-Step + Free Retry?',
      'I can help with that. Which option would you like explained: 2-Step Lite or 2-Step + Free Retry?',
      'The rules differ between our two versions. Are you looking at 2-Step Lite, or 2-Step + Free Retry?',
    ],
    meaningVariants: [
      'A 2-Step challenge means you complete Phase 1 and Phase 2 before moving to the live phase. We offer 2-Step Lite and 2-Step + Free Retry, so which version would you like me to explain?',
      'By 2-Step, I mean an evaluation with Phase 1 and Phase 2 before the live phase. The available versions are 2-Step Lite and 2-Step + Free Retry. Which one are you asking about?',
      'It is a two-phase evaluation: you pass Phase 1 and then Phase 2 before reaching the live phase. Would you like the details for 2-Step Lite or 2-Step + Free Retry?',
    ],
    bothAnswerVariants: [
      'Got it — covering both. FundedElite offers two 2-Step versions: 2-Step Lite and 2-Step + Free Retry. Both are Phase 1 → Phase 2 → live evaluations. The Free Retry version includes an eligible second chance during evaluation; Lite does not. Which one would you like me to explain in more detail?',
      'Understood — both versions. 2-Step Lite and 2-Step + Free Retry are each a two-phase evaluation (Phase 1, then Phase 2, then live). Free Retry includes an eligible second chance during evaluation; Lite does not. Which one would you like me to explain?',
      'Sure — answering for both. We have 2-Step Lite and 2-Step + Free Retry. Same Phase 1 / Phase 2 / live structure; the Free Retry version includes an eligible second chance during evaluation, and Lite does not. Which one would you like me to explain next?',
    ],
    legacyCanned: [
      'We have two 2-Step challenges: 2-Step Lite and 2-Step + Free Retry. Which one would you like me to explain?',
      'A 2-Step challenge has Phase 1 and Phase 2 before the live phase. We offer two versions: 2-Step Lite and 2-Step + Free Retry. Which version are you asking about?',
      'I mean that a 2-Step challenge has two evaluation phases before the live phase. FundedElite offers 2-Step Lite and 2-Step + Free Retry. The Free Retry version includes an eligible second chance during evaluation; Lite does not. Which version would you like the rules for?',
    ],
  },
  {
    id: '1_step',
    label: '1-Step',
    familyRe: /\b(?:1[\s-]*step|one[\s-]*step)\b/i,
    specificVariantRe: /\b(?:lite|standard|free[\s-]*retry|second chance)\b/i,
    otherProductRe: /\b(?:2[\s-]*step|two[\s-]*step|instant|catalyst|flash)\b/i,
    supportsBoth: true,
    hasBothVariants(text) {
      const value = String(text || '');
      return (/1[\s-]*step\s+lite|lite\s+1[\s-]*step/i.test(value)) &&
        (/1[\s-]*step[^.?!\n]*free[\s-]*retry/i.test(value) || /free[\s-]*retry/i.test(value));
    },
    botAskedVariant(bot) {
      const t = String(bot || '');
      return /1[\s-]*step|one[\s-]*step/i.test(t) && /\blite\b/i.test(t) && /free\s*retry/i.test(t) &&
        /\?|\b(?:which|do you mean|are you (?:asking|looking|considering|interested)|would you like)\b/i.test(t);
    },
    // Lite versus + Free Retry differ in the second chance and in the stricter Lite drawdown
    // limits and price (FAQ "LITE Challenge (NO SECOND CHANCE)"), so those asks DO need the
    // variant. Shared attributes (leverage, platform, payout cadence) do not.
    variantSensitiveRe: /\b(?:second\s+chance|free\s*retry|retry|drawdown|draw\s*down|daily\s+loss|max(?:imum)?\s+loss|price|cost|fee|fees|target)\b/i,
    // Phase 2 "reduces to 5%" in BOTH 2-Step articles, so a phase-2 target ask needs no variant.
    variantInsensitiveRe: /\bphase\s*2\b/i,
    usefulDistinctionRe: /\bsecond chance\b/i,
    usefulStructureRe: /\bphase\s*1\b/i,
    clarificationVariants: [
      'Happy to explain it. Are you asking about 1-Step Lite or 1-Step + Free Retry? Once you confirm, I’ll walk you through the right version.',
      'FundedElite has two versions of the 1-Step challenge: 1-Step Lite and 1-Step + Free Retry. Which one are you considering?',
      'Just so I give you the correct details, do you mean 1-Step Lite or 1-Step + Free Retry?',
      'I can help with that. Which option would you like explained: 1-Step Lite or 1-Step + Free Retry?',
      'The rules differ between our two versions. Are you looking at 1-Step Lite, or 1-Step + Free Retry?',
    ],
    meaningVariants: [
      'A 1-Step challenge means you complete Phase 1 before moving to the live phase. We offer 1-Step Lite and 1-Step + Free Retry, so which version would you like me to explain?',
      'By 1-Step, I mean a single evaluation phase before the live phase. The available versions are 1-Step Lite and 1-Step + Free Retry. Which one are you asking about?',
      'It is a one-phase evaluation: you pass Phase 1 before reaching the live phase. Would you like the details for 1-Step Lite or 1-Step + Free Retry?',
    ],
    bothAnswerVariants: [
      'Got it — covering both. FundedElite offers two 1-Step versions: 1-Step Lite and 1-Step + Free Retry. Both are Phase 1 → live evaluations. The Free Retry version includes an eligible second chance during evaluation; Lite does not. Which one would you like me to explain in more detail?',
      'Understood — both versions. 1-Step Lite and 1-Step + Free Retry are each a single-phase evaluation (Phase 1, then live). Free Retry includes an eligible second chance during evaluation; Lite does not. Which one would you like me to explain?',
      'Sure — answering for both. We have 1-Step Lite and 1-Step + Free Retry. Same Phase 1 / live structure; the Free Retry version includes an eligible second chance during evaluation, and Lite does not. Which one would you like me to explain next?',
    ],
    legacyCanned: [],
  },
  {
    id: 'instant',
    label: 'Instant',
    // Family mention: Instant / Instant Challenge. Typo forms covered after normalizeText.
    familyRe: /\binstant\b/i,
    // Exact variant already named → Instant Elite (or short "elite" follow-up).
    specificVariantRe: /\belite\b/i,
    otherProductRe: /\b(?:1[\s-]*step|one[\s-]*step|2[\s-]*step|two[\s-]*step|catalyst|flash)\b/i,
    supportsBoth: true,
    hasBothVariants(text) {
      const value = String(text || '');
      const hasElite = /instant\s*elite/i.test(value);
      // "Instant" as its own product (not only as the start of "Instant Elite").
      const hasInstantAlone = /\binstant\b(?!\s*elite)/i.test(value);
      return hasElite && hasInstantAlone;
    },
    botAskedVariant(bot) {
      const t = String(bot || '');
      return /\binstant\b/i.test(t) && /\belite\b/i.test(t) &&
        /\?|\b(?:which|do you mean|are you (?:asking|looking|considering|interested)|would you like)\b/i.test(t);
    },
    // Approved knowledge records exactly ONE difference between Instant and Instant Elite:
    // the account sizes (FAQ "ARSAL CORRECTION"). Every other rule - consistency, drawdown,
    // leverage, profit split, second chance, holding time, phases, lot size - is shared, so
    // asking which variant is meant would not change those answers.
    // Do NOT treat bare 200/300/400 as variant-sensitive: "200k Instant max lot" already
    // named a standard Instant size (bench R104). Size asks still match size|sizes|...
    variantSensitiveRe: /\b(?:size|sizes|account\s+size|how\s+(?:big|large|much)|capital|balance|price|cost|fee|fees)\b/i,
    // Approved distinction (FAQ Arsal correction): Instant up to $200k; Instant Elite also $300k/$400k.
    usefulDistinctionRe: /\$?\s*200(?:,000|\s*k)|\$?\s*300(?:,000|\s*k)|\$?\s*400(?:,000|\s*k)/i,
    usefulStructureRe: /\blive\s+phase\b/i,
    clarificationVariants: [
      'Happy to explain. Are you asking about Instant or Instant Elite? Once you confirm, I’ll walk you through the right version.',
      'FundedElite has Instant and Instant Elite. Instant sizes go up to $200,000; Instant Elite additionally offers $300,000 and $400,000 accounts. Which one are you considering?',
      'Just so I give you the correct details, do you mean Instant or Instant Elite?',
      'I can help with that. Which option would you like explained: Instant, or Instant Elite?',
      'The available sizes differ between the two. Are you looking at Instant, or Instant Elite?',
    ],
    meaningVariants: [
      'Instant and Instant Elite both start directly in the live phase. Instant sizes go up to $200,000; Instant Elite additionally offers $300,000 and $400,000 accounts. Which one would you like me to explain?',
      'By Instant I mean our live-phase funded products: Instant and Instant Elite. Instant goes up to $200,000; Instant Elite also has $300,000 and $400,000. Which version are you asking about?',
      'Both Instant and Instant Elite skip evaluation phases and start in the live phase. The main approved size difference: Instant up to $200,000; Instant Elite also offers $300,000 and $400,000. Which one should I detail?',
    ],
    bothAnswerVariants: [
      'Got it — covering both. FundedElite offers Instant and Instant Elite. Both start directly in the live phase. Instant sizes go up to $200,000; Instant Elite additionally offers $300,000 and $400,000 accounts. Which one would you like me to explain in more detail?',
      'Understood — both. Instant and Instant Elite are live-phase products. Instant goes up to $200,000; Instant Elite also offers $300,000 and $400,000. Which one would you like me to explain?',
      'Sure — answering for both. We have Instant and Instant Elite. Same live-phase start; Instant sizes go up to $200,000, and Instant Elite additionally offers $300,000 and $400,000 accounts. Which one would you like me to explain next?',
    ],
    legacyCanned: [],
  },
];

const LEGACY_CANNED_REPLIES = new Set(
  PRODUCT_FAMILIES.flatMap((f) => f.legacyCanned || [])
);

// Backward-compatible aliases used by older selftests / index logs.
const CLARIFICATION_VARIANTS = PRODUCT_FAMILIES.find((f) => f.id === '2_step').clarificationVariants;
const CLARIFICATION = CLARIFICATION_VARIANTS[0];
const CLARIFICATION_AGAIN = CLARIFICATION_VARIANTS[1];
const MEANING_VARIANTS = PRODUCT_FAMILIES.find((f) => f.id === '2_step').meaningVariants;
const MEANING_REPLY = MEANING_VARIANTS[0];
const BOTH_ANSWER_VARIANTS = PRODUCT_FAMILIES.find((f) => f.id === '2_step').bothAnswerVariants;

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeClientText(text) {
  const raw = String(text || '');
  try {
    const typo = require('./statePresend/typoNormalizer');
    if (typo && typeof typo.normalizeText === 'function') return typo.normalizeText(raw);
  } catch (_) { /* optional */ }
  return raw;
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

function isUsefulClarification(text, family) {
  const value = String(text || '').trim();
  if (!family) {
    return PRODUCT_FAMILIES.some((f) => isUsefulClarification(value, f));
  }
  if (!family.hasBothVariants(value)) return false;
  return /\?|\b(?:which|do you mean|are you (?:asking|looking|interested)|would you like)\b/i.test(value);
}

function isUsefulMeaningReply(text, family) {
  const value = String(text || '').trim();
  if (!family) {
    return PRODUCT_FAMILIES.some((f) => isUsefulMeaningReply(value, f));
  }
  if (!family.hasBothVariants(value)) return false;
  if (family.usefulStructureRe && !family.usefulStructureRe.test(value)) return false;
  return true;
}

function isUsefulBothAnswer(text, family) {
  const value = String(text || '').trim();
  if (!family) {
    return PRODUCT_FAMILIES.some((f) => isUsefulBothAnswer(value, f));
  }
  if (!family.hasBothVariants(value)) return false;
  // Must cover the FAQ distinction, not merely re-ask which variant.
  if (/\b(?:which|do you mean|are you (?:asking|looking|considering|interested))\b/i.test(value) &&
      !(family.usefulDistinctionRe && family.usefulDistinctionRe.test(value))) {
    return false;
  }
  if (family.usefulDistinctionRe && family.usefulDistinctionRe.test(value)) return true;
  if (family.usefulStructureRe && family.usefulStructureRe.test(value)) return true;
  return false;
}

/**
 * Bare "Instant" / "the Instant one" after an Instant-vs-Elite ask counts as choosing
 * the Instant (non-Elite) variant — do not re-clarify.
 */
function namedExactVariantChoice(text, family, opts = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t || !family) return false;
  if (family.specificVariantRe.test(t)) return true;
  if (family.id === 'instant') {
    // Explicit Instant (non-Elite) with qualifier words.
    if (/\b(?:regular|standard|normal|basic)\s+instant\b/i.test(t) && !/\belite\b/i.test(t)) {
      return true;
    }
    // A named Instant size already picks the variant. Standard Instant: 7/15/25/50/100/200k.
    // Instant Elite additionally: 300k/400k (350k is not a listed size; treat as Elite-range).
    const eliteSize = /\$?\s*(?:3(?:00|50)|400)\s*(?:[,.]?000\b|k\b)/i.test(t);
    const standardSize = /\$?\s*(?:7|15|25|50|100|200)\s*(?:[,.]?000\b|k\b)/i.test(t);
    if (/\binstant\b/i.test(t) && eliteSize) return true;
    if (/\binstant\b/i.test(t) && standardSize && !/\belite\b/i.test(t)) return true;
    // Bare "Instant" / "Instant challenge" is a CHOICE only after Luna already asked
    // Instant vs Instant Elite (cold "Instant challenge" must still clarify, not silent-dump).
    if (opts.allowBareInstantChoice) {
      if (/^(?:the\s+)?instant(?:\s+challenge)?[.!?]*$/i.test(t)) return true;
    }
  }
  return false;
}

function isGeneralFamilyAsk(latest, family) {
  // Explain-style asks, OR short product-noun asks ("Instant challenge", "Instant funding",
  // "Instant challenge rules") that would otherwise silently dump a single variant.
  if (EXPLAIN_RE.test(latest)) return true;
  if (!GENERAL_PRODUCT_ASK_RE.test(latest)) return false;
  if (ACCOUNT_SPECIFIC_RE.test(latest)) return false;
  // Keep to short general asks — long account narratives should not force clarify.
  if (latest.split(/\s+/).filter(Boolean).length > 14) return false;
  return family.familyRe.test(latest);
}

function botAlreadyAskedFamily(family, priorBotTexts = []) {
  return (priorBotTexts || []).slice(-6).some((bot) => family.botAskedVariant(bot));
}

function shouldClarifyFamily(family, latestText, priorClientTexts = [], priorBotTexts = []) {
  const latestRaw = String(latestText || '').trim();
  const latest = normalizeClientText(latestRaw);
  if (!family.familyRe.test(latest) || !isGeneralFamilyAsk(latest, family)) return false;
  // A clarification is only worth asking when the answer would genuinely change. When the
  // client asks about a specific attribute that is identical across this family's variants
  // (Instant and Instant Elite differ only in account sizes), asking "which one?" replaces the
  // answer with a catalogue detail the client did not ask for - exactly the reported defect:
  // "can I remove the consistency rule on Instant?" was answered with the $200k/$300k sizes.
  if (family.variantSensitiveRe && ATTRIBUTE_ASK_RE.test(latest) && !family.variantSensitiveRe.test(latest)) {
    return false;
  }
  // Some attributes look variant-sensitive but are identical across the variants in approved
  // knowledge: both 2-Step versions reduce to the same Phase 2 profit target, so asking which
  // version is meant would not change that answer.
  if (family.variantInsensitiveRe && family.variantInsensitiveRe.test(latest)) return false;
  // After Luna asked Instant vs Elite, bare "Instant" / "Instant challenge" is a choice.
  const allowBare = botAlreadyAskedFamily(family, priorBotTexts);
  if (namedExactVariantChoice(latest, family, { allowBareInstantChoice: allowBare })) return false;
  if (family.otherProductRe.test(latest) || COMPARISON_RE.test(latest) ||
      MULTI_REQUEST_RE.test(latest) || HUMAN_RE.test(latest)) return false;
  // A recent explicit choice carries over to the next product question.
  return !priorClientTexts.slice(-3).some((text) =>
    namedExactVariantChoice(normalizeClientText(text), family, { allowBareInstantChoice: true })
  );
}

function findFamilyToClarify(latestText, priorClientTexts = [], priorBotTexts = []) {
  for (const family of PRODUCT_FAMILIES) {
    if (shouldClarifyFamily(family, latestText, priorClientTexts, priorBotTexts)) return family;
  }
  return null;
}

function shouldClarifyTwoStep(latestText, priorClientTexts = [], priorBotTexts = []) {
  const family = PRODUCT_FAMILIES.find((f) => f.id === '2_step');
  return shouldClarifyFamily(family, latestText, priorClientTexts, priorBotTexts);
}

function shouldClarifyProductVariant(latestText, priorClientTexts = [], priorBotTexts = []) {
  return !!findFamilyToClarify(latestText, priorClientTexts, priorBotTexts);
}

function clarifyProductVariantReply(latestText, priorClientTexts, draft, priorBotTexts = [], conversationId = '') {
  const family = findFamilyToClarify(latestText, priorClientTexts, priorBotTexts);
  if (!family) return draft;
  const isLegacyCanned = LEGACY_CANNED_REPLIES.has(String(draft || '').trim());
  if (isUsefulClarification(draft, family) && !isLegacyCanned) return draft;
  // A plain "what is X / tell me about X" is answerable for the whole family: the variants share
  // everything except a catalogue attribute, so asking which one replaces the answer with a
  // question the client cannot usefully answer yet. Cover BOTH instead - that still never
  // silently assumes a single variant, and it actually answers. A question about a
  // variant-sensitive attribute is unaffected and still asks (shouldClarifyFamily decides that).
  if (family.supportsBoth && Array.isArray(family.bothAnswerVariants) && family.bothAnswerVariants.length &&
      EXPLAIN_RE.test(normalizeClientText(String(latestText || ''))) &&
      !ATTRIBUTE_ASK_RE.test(normalizeClientText(String(latestText || '')))) {
    return pickFreshVariant(
      family.bothAnswerVariants,
      priorBotTexts,
      [family.id, conversationId, latestText, draft].join('|')
    );
  }
  return pickFreshVariant(
    family.clarificationVariants,
    priorBotTexts,
    [family.id, conversationId, latestText, priorClientTexts.slice(-3).join('|'), draft].join('|')
  );
}

/** Legacy name — now routes through generic multi-family clarify. */
function clarifyTwoStepReply(latestText, priorClientTexts, draft, priorBotTexts = [], conversationId = '') {
  return clarifyProductVariantReply(latestText, priorClientTexts, draft, priorBotTexts, conversationId);
}

function lastBotAskedFamily(priorBotTexts) {
  const recent = (priorBotTexts || []).slice(-6);
  // Prefer an explicit Instant-vs-Elite / Lite-vs-Free-Retry (etc.) clarify ask.
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const bot = String(recent[i] || '');
    for (const family of PRODUCT_FAMILIES) {
      if (family.botAskedVariant(bot)) return family;
    }
  }
  // Else: recent bot already discussed that family's two variants (dual overview /
  // meaning reply). Short follow-ups like "main difference between them" still belong
  // to that family — do not lose context and SCOPE_DECLINE.
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const bot = String(recent[i] || '');
    for (const family of PRODUCT_FAMILIES) {
      if (family.supportsBoth && family.hasBothVariants(bot)) return family;
    }
  }
  return null;
}

function lastBotAskedTwoStepVariant(priorBotTexts) {
  return !!lastBotAskedFamily(priorBotTexts);
}

function lastBotAskedProductVariant(priorBotTexts) {
  return lastBotAskedFamily(priorBotTexts);
}

function explainVariantFollowup(latestText, priorBotTexts = [], draft, conversationId = '') {
  if (!MEANING_RE.test(String(latestText || '').trim())) return draft;
  const family = lastBotAskedFamily(priorBotTexts);
  if (!family) return draft;
  const isLegacyCanned = LEGACY_CANNED_REPLIES.has(String(draft || '').trim());
  if (isUsefulMeaningReply(draft, family) && !isLegacyCanned) return draft;
  return pickFreshVariant(
    family.meaningVariants,
    priorBotTexts,
    [family.id, conversationId, latestText, draft].join('|')
  );
}

function explainTwoStepFollowup(latestText, priorBotTexts = [], draft, conversationId = '') {
  return explainVariantFollowup(latestText, priorBotTexts, draft, conversationId);
}

function isBothVariantsClientReply(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (BOTH_CLIENT_RE.test(t)) return true;
  // Comparison anaphora: difference / compare / between them / farq / vs / what about the other.
  if (!COMPARISON_FOLLOWUP_RE.test(t)) return false;
  if (COMPARISON_EXTERNAL_RE.test(t)) return false;
  return true;
}

function isVariantChoiceFollowup(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t || COMPARISON_EXTERNAL_RE.test(t)) return false;
  return VARIANT_CHOICE_FOLLOWUP_RE.test(t);
}

/** Any short product-thread anaphora (both/compare OR choice/deixis). */
function isProductThreadFollowup(text) {
  return isBothVariantsClientReply(text) || isVariantChoiceFollowup(text);
}

/**
 * Shared gate helper: recent product-family clarify/dual context + short anaphoric
 * follow-up ⇒ inherit FundedElite FAQ scope (never SCOPE_DECLINE / off-topic).
 */
function shouldInheritProductFaqScope(text, priorBotTexts = []) {
  if (!isProductThreadFollowup(text)) return false;
  return !!lastBotAskedFamily(priorBotTexts);
}

function resolveBothVariantsReply(latestText, priorBotTexts = [], draft, conversationId = '') {
  // Only both/compare path forces the dual FAQ template — choice follow-ups inherit
  // scope in index.js but keep the model/clarify draft.
  if (!isBothVariantsClientReply(latestText)) return draft;
  const family = lastBotAskedFamily(priorBotTexts);
  if (!family || !family.supportsBoth) return draft;
  const isLegacyCanned = LEGACY_CANNED_REPLIES.has(String(draft || '').trim());
  if (isUsefulBothAnswer(draft, family) && !isLegacyCanned) return draft;
  return pickFreshVariant(
    family.bothAnswerVariants,
    priorBotTexts,
    [family.id, conversationId, latestText, draft].join('|')
  );
}

module.exports = {
  PRODUCT_FAMILIES,
  shouldClarifyTwoStep,
  shouldClarifyProductVariant,
  clarifyTwoStepReply,
  clarifyProductVariantReply,
  explainTwoStepFollowup,
  explainVariantFollowup,
  resolveBothVariantsReply,
  isBothVariantsClientReply,
  isVariantChoiceFollowup,
  isProductThreadFollowup,
  shouldInheritProductFaqScope,
  lastBotAskedTwoStepVariant,
  lastBotAskedProductVariant,
  isUsefulClarification: (text, family) => isUsefulClarification(text, family),
  isUsefulMeaningReply: (text, family) => isUsefulMeaningReply(text, family),
  isUsefulBothAnswer: (text, family) => isUsefulBothAnswer(text, family),
  CLARIFICATION,
  CLARIFICATION_AGAIN,
  MEANING_REPLY,
  CLARIFICATION_VARIANTS,
  MEANING_VARIANTS,
  BOTH_ANSWER_VARIANTS,
};
