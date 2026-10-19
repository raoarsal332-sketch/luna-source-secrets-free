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
const ATTRIBUTE_ASK_RE = /\b(?:consistency|drawdown|draw\s*down|daily\s+loss|max(?:imum)?\s+loss|stop[\s-]?loss|stoploss|leverage|profit\s*split|profit\s+target|payout|withdraw\w*|holding\s+time|hold\w*\s+for|scalp\w*|weekend|second\s+chance|free\s*retry|retry|platform|metatrader|mt5|tradelocker|phase|size|sizes|price|cost|fee|fees|news|expert\s+advisor|\bea\b|copy\s+trad\w*|swap|spread|reset|kyc|consistency\s+rule|refund|martingale|lot\s*size)\b/i;
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
      // OFFICIAL_NAME_ORDER_V1 (2026-09-28): the official name is "Lite 2-Step"; a draft using it has both variants.
      return /2[\s-]*step\s+lite|\blite\s+2[\s-]*step/i.test(value) &&
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
      'Both 2-Step Lite and 2-Step + Free Retry have Phase 1, Phase 2, then a live phase. Each evaluation phase requires 3 profitable trading days with at least 0.5% positive P&L per day; Phase 2 has a 5% profit target. The key differences: Lite has a 4% end-of-day daily loss limit and no Second Chance; Free Retry starts with a 5% daily loss limit and has one eligible Second Chance during evaluation, with modified rules on that retry. Both use a static maximum loss limit selected at checkout. Which version would you like to explore further?',
      'Here are both 2-Step versions. 2-Step Lite and 2-Step + Free Retry each require Phase 1 and Phase 2 before live, with 3 profitable days of at least 0.5% in each evaluation phase. Phase 2 targets 5%. Lite has a 4% end-of-day daily loss limit and no free retry. The Free Retry version starts with a 5% daily loss limit and has an eligible Second Chance during evaluation, whose rules change on the retry. The maximum loss limit is static and depends on the checkout selection. Which rule would you like me to detail?',
      '2-Step Lite and 2-Step + Free Retry both run through Phase 1, Phase 2 and live. For each evaluation phase, complete 3 profitable days of at least 0.5% of account size; Phase 2 requires a 5% target. Lite has a 4% end-of-day daily loss limit without Second Chance. Free Retry starts with a 5% daily loss limit and has one eligible evaluation retry with modified rules. Both have a static maximum loss limit chosen at checkout. Would you like the full rules for either version?',
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
      'FundedElite offers two 1-Step versions: 1-Step Lite and 1-Step + Free Retry. Both are Phase 1 → live evaluations. The Free Retry version includes an eligible second chance during evaluation; Lite does not. Which one would you like me to explain in more detail?',
      '1-Step Lite and 1-Step + Free Retry are each a single-phase evaluation (Phase 1, then live). Free Retry includes an eligible second chance during evaluation; Lite does not. Which one would you like me to explain?',
      'We have 1-Step Lite and 1-Step + Free Retry. Same Phase 1 / live structure; the Free Retry version includes an eligible second chance during evaluation, and Lite does not. Which one would you like me to explain next?',
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
    // INSTANT_VARIANTS_OFFICIAL_V2 (Arsal 2026-09-27, official FAQ 12683783 "INSTANT challenge"): the ONE
    // approved difference between Instant Standard and Instant Elite is the Consistency Rule (Standard has
    // the 25% rule, Elite does not). Sizes ($7k-$100k), split 70/80/95% (first payout 70%), payout cycles,
    // 3%/6% trailing drawdown, 4 profitable days of at least 0.5%, no second chance, MT5/TradeLocker,
    // FX leverage 1:30/1:50/1:100 and the scalping/weekend add-ons are shared. (The 2026-09-19 size-only
    // correction, $200k / $300k / $400k, is retired: luna-knowledge/retired-authority.json.)
    // Asking "which variant?" only changes a consistency answer.
    variantSensitiveRe: /\bconsisten(?:cy|t)\b/i,
    usefulDistinctionRe: /\bconsisten(?:cy|t)\b/i,
    usefulStructureRe: /\blive\s+phase\b/i,
    // VARIANT_COMPARISON_COMPLETE_V1: approved knowledge says rules are SHARED except the approved delta.
    onlyApprovedDeltaIsSizes: false,
    approvedDeltaTopic: 'consistency',
    comparisonSharedRules: [
      'Both start directly in the live phase (no evaluation phases) and neither includes a second chance (12683783-instant-challenge).',
      'Same account sizes on both: $7k, $15k, $25k, $50k and $100k (12683783-instant-challenge).',
      'Same trailing drawdown: 3% daily loss limit and 6% max loss (12683783-instant-challenge).',
      'Same profit split options 70%, 80% or 95%; the first payout is always at 70%, then the selected split. First payout requestable after 21 days; payout cycles 3/7/14/21 days (12683783-instant-challenge).',
      'Same payout requirement: at least 4 profitable trading days, each with at least 0.5% of the account size (12683783-instant-challenge).',
      'Same platforms (MetaTrader 5, TradeLocker), selectable FX leverage 1:30, 1:50 or 1:100, and optional scalping and weekend trading add-ons (12683783-instant-challenge).',
    ],
    comparisonSizeDelta: 'Consistency Rule: Instant Standard includes the 25% consistency rule (no single day may exceed 25% of total profit); Instant Elite does NOT have a consistency rule (12683783-instant-challenge). Do not invent other Elite-only rules or sizes.',
    clarificationVariants: [
      'Happy to explain. Are you asking about Instant Standard or Instant Elite? Once you confirm, I’ll walk you through the right version.',
      'FundedElite has Instant Standard and Instant Elite. The main difference is the consistency rule: Standard has it, Elite doesn’t. Which one are you considering?',
      'Just so I give you the correct details, do you mean Instant Standard or Instant Elite?',
      'I can help with that. Which option would you like explained: Instant Standard, or Instant Elite?',
      'The consistency rule differs between the two. Are you looking at Instant Standard, or Instant Elite?',
    ],
    meaningVariants: [
      'Instant Standard and Instant Elite both start directly in the live phase and share the same core rules. The difference is that Standard has a 25% consistency rule and Elite has none. Which one would you like me to explain?',
      'By Instant I mean our live-phase funded products: Instant Standard and Instant Elite. Standard includes a 25% consistency rule, Elite does not. Which version are you asking about?',
      'Both Instant versions skip evaluation phases and start in the live phase with the same core rules. The only difference is the consistency rule, which applies to Standard but not to Elite. Which one should I detail?',
    ],
    bothAnswerVariants: [
      'Instant Standard and Instant Elite both start in the live phase and share their core rules (sizes $7k to $100k, trailing 3%/6% drawdown, 70/80/95% split, first payout after 21 days). The difference is consistency: Standard has a 25% consistency rule, Elite has none. Which one would you like me to explain in more detail?',
      'Instant Standard and Instant Elite are live-phase products with the same core rules. Standard includes a 25% consistency rule, Elite does not. Which one would you like me to explain?',
      'Instant Standard and Instant Elite share the live-phase start and core rules, and the one difference is the consistency rule, which only Standard has. Which one would you like me to explain next?',
    ],
    legacyCanned: [],
  },
  {
    id: 'elite_sense',
    label: 'Elite sense',
    // Bare "elite account" / "elite stage" is ambiguous: Instant Elite product vs
    // FAQ "Elite stage (FUNDED)" after passing an evaluation (bench R014).
    familyRe: /\b(?:an?\s+)?elite\s+(?:account|stage)\b|\bon\s+(?:an?\s+)?elite\b/i,
    specificVariantRe: /\b(?:instant\s+elite|funded\s+elite\s+stage|elite\s+stage\s*\(\s*funded|1[\s-]*step|2[\s-]*step|flash|catalyst)\b/i,
    otherProductRe: /\b(?:instant(?!\s+elite)|1[\s-]*step|2[\s-]*step|flash|catalyst|lite)\b/i,
    supportsBoth: false,
    hasBothVariants(text) {
      const value = String(text || '');
      return /instant\s*elite/i.test(value) &&
        /(?:funded|elite stage|live (?:stage|account) after)/i.test(value);
    },
    botAskedVariant(bot) {
      const t = String(bot || '');
      return /instant\s*elite/i.test(t) && /(?:funded|elite stage)/i.test(t) &&
        /\?|\b(?:which|do you mean|are you (?:asking|looking|considering|interested)|would you like)\b/i.test(t);
    },
    variantSensitiveRe: /\b(?:consistency|drawdown|draw\s*down|daily\s+loss|max(?:imum)?\s+loss|trading\s+days?|profit\s*split|payout)\b/i,
    usefulDistinctionRe: /instant\s*elite|funded|elite stage/i,
    usefulStructureRe: /which|do you mean/i,
    clarificationVariants: [
      'Do you mean Instant Elite, or the Elite (funded/live) stage after passing an evaluation? Consistency depends on which one.',
      'Which account do you mean: Instant Elite, or a funded Elite-stage account after an evaluation? I can give the right consistency once you confirm.',
      'Just so I use the right rule, which one do you mean: Instant Elite, or the Elite stage (funded) after passing?',
    ],
    meaningVariants: [],
    bothAnswerVariants: [],
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

/**
 * SHORT_VARIANT_NAMES_V1 (2026-09-26): "Lite", "+ Free Retry", "lite version", "with free retry",
 * "free retry one" and the full "2-Step Lite" / "2-Step + Free Retry" forms are the same pair.
 * Markdown, case, spacing and light punctuation are ignored. Unrelated words (elite, polite,
 * literally, satellite, quality, slight) are not a variant name.
 */
function flattenVariantText(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\*_`~]+/g, ' ')
    .replace(/[‐‑–—]/g, '-')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasLiteVariantName(text) {
  return /\blite\b/i.test(String(text || ''));
}

function hasFreeRetryVariantName(text) {
  return /(?:(?:\+|plus|with|&)\s*)?free[\s-]*retry\b(?:\s+(?:version|variant|option|one|challenge))?/i.test(String(text || ''));
}

function mentionsBothVariantNames(text, family) {
  if (!family || (family.id !== '2_step' && family.id !== '1_step')) {
    return !!(family && typeof family.hasBothVariants === 'function' && family.hasBothVariants(text));
  }
  const t = flattenVariantText(text);
  if (!hasLiteVariantName(t) || !hasFreeRetryVariantName(t)) return false;
  const step = family.id === '2_step' ? '(?:2[\\s-]*step|two[\\s-]*step)' : '(?:1[\\s-]*step|one[\\s-]*step)';
  const familyRe = new RegExp('\\b' + step + '\\b', 'i');
  const fullLite = new RegExp('(?:\\b' + step + '\\s+lite\\b|\\blite\\s+' + step + '\\b)', 'i');
  if (familyRe.test(t) || fullLite.test(t)) return true;
  // "+ Free Retry" is the product token even when the family word sits only in the client message.
  if (/\+\s*free[\s-]*retry\b/i.test(t)) return true;
  if (/\blite\s+(?:version|variant|option|one)\b/i.test(t)) return true;
  if (/\bwith\s+free[\s-]*retry\b/i.test(t)) return true;
  if (/\bfree[\s-]*retry\s+(?:version|variant|option|one)\b/i.test(t)) return true;
  // "Lite or Free Retry?" is a choice only when the sentence is about a version, not an unrelated "lite".
  return /\blite\b[^.\n]{0,80}(?:\bor\b|\bvs\.?\b|\bversus\b|\/)[^.\n]{0,40}free[\s-]*retry\b|\bfree[\s-]*retry\b[^.\n]{0,80}(?:\bor\b|\bvs\.?\b|\bversus\b|\/)[^.\n]{0,40}\blite\b/i.test(t)
    && /\b(?:which|version|variant|challenge|mean)\b/i.test(t);
}

function clientNamedSingleVariant(client, family) {
  const t = flattenVariantText(client);
  if (!family || !family.specificVariantRe || !family.specificVariantRe.test(t)) return false;
  if ((family.id === '2_step' || family.id === '1_step') && mentionsBothVariantNames(t, family)) return false;
  return true;
}

/**
 * The client named a 2-Step family but not which version, asked about daily loss (the figure that
 * differs: Lite 4%, Free Retry 5%), and the draft states one daily-loss percentage as the answer.
 * Stating both figures, or asking which version and stating neither figure, is not a guess.
 */
function unconfirmedVariantFigure(clientText, draft) {
  const client = normalizeClientText(String(clientText || ''));
  const d = flattenVariantText(draft);
  const family = PRODUCT_FAMILIES.find((f) => f.id === '2_step' && f.familyRe.test(client) && !clientNamedSingleVariant(client, f));
  if (!family || !/\bdaily\s+loss\b/i.test(client)) return false;
  // A percent counts only inside a sentence that is about daily loss, so a Phase 2 "5%" target
  // is not a daily-loss figure. Both 4% and 5% in those sentences, with both version names, is
  // the approved pair (Lite 4%, Free Retry 5%), not a guess.
  const figures = new Set();
  for (const sentence of d.split(/(?<=[.!?])\s+/)) {
    if (!/\bdaily\s+loss\b/i.test(sentence)) continue;
    for (const m of sentence.matchAll(/\b(\d{1,2})\s*%/g)) {
      if (m[1] === '4' || m[1] === '5') figures.add(m[1]);
    }
  }
  if (!figures.size) return false;
  if (figures.has('4') && figures.has('5') && mentionsBothVariantNames(d, family)) return false;
  return true;
}

/**
 * Facts that are identical on both versions of a 1-Step or 2-Step family (Help Center
 * 12683646, 12683226, 12683734, 12683556, 12681763). A topic mention is not the fact.
 */
function payoutScheduleAnswered(text) {
  const t = String(text || '');
  const has = (n) => new RegExp('\\b' + n + '\\b').test(t);
  if (!(has(3) && has(7) && has(14) && has(21))) return false;
  return /first[^.\n]{0,80}21\s*days|21\s*days[^.\n]{0,80}first|requestable after 21|after 21 days/i.test(t);
}
function tradingPlatformsAnswered(text) {
  const t = String(text || '');
  if (/\b(?:match-?trader|c[\s-]?trader|dx[\s-]?trade)\b/i.test(t)) return false;
  return /(?:metatrader\s*5|\bmt5\b)/i.test(t) && /tradelocker/i.test(t);
}
function weekendHoldingAnswered(text) {
  const t = String(text || '');
  const weekendish = /\bweekend\b/i.test(t) || (/\bfriday\b/i.test(t) && /\bmonday\b/i.test(t));
  if (!/\bhold/i.test(t) || !weekendish) return false;
  if (/\b(?:cannot|can't|can not)\s+hold\b/i.test(t)) return false;
  if (/\bhold(?:ing)?\b[^.\n]{0,30}\b(?:not allowed|isn'?t allowed|prohibited)\b/i.test(t)) return false;
  if (/\bweekend holding\b[^.\n]{0,40}\b(?:not allowed|isn'?t allowed|prohibited)\b/i.test(t)) return false;
  return /\b(?:can|may|allowed|yes|permitted)\b/i.test(t);
}
function sharedFactStatus(ask, reply) {
  const a = String(ask || '');
  if (/\bhow\b/i.test(a) && /\bpayouts?\b/i.test(a) && !/\b(?:rejected|denied|pending|stuck|delayed)\b/i.test(a)) {
    return payoutScheduleAnswered(reply) ? 'ok' : 'missing';
  }
  if (/\bplatforms?\b/i.test(a) && /\b(?:which|what|can\s+i\s+use|available|trading)\b/i.test(a)) {
    return tradingPlatformsAnswered(reply) ? 'ok' : 'missing';
  }
  if (/\bweekend\b/i.test(a) && /\bhold/i.test(a)) {
    return weekendHoldingAnswered(reply) ? 'ok' : 'missing';
  }
  return 'n/a';
}
function deniesWeekendHolding(sentence) {
  const s = String(sentence || '');
  if (/\b(?:cannot|can't|can not|not allowed to)\s+hold\b/i.test(s)) return true;
  if (/\bweekend holding\b[^.\n]{0,40}\b(?:not allowed|isn'?t allowed|prohibited)\b/i.test(s)) return true;
  if (/\bhold(?:ing)?\b[^.\n]{0,30}\b(?:not allowed|isn'?t allowed|prohibited)\b/i.test(s)) return true;
  return false;
}
function isSharedFactDeferral(sentence) {
  const s = String(sentence || '').trim();
  if (!s) return false;
  if (/\?\s*$/.test(s) && /\b(?:which|do you mean)\b/i.test(s)) return false;
  if (payoutScheduleAnswered(s) || tradingPlatformsAnswered(s) || weekendHoldingAnswered(s)) return false;
  return /(?:need (?:that|those|this)|depends on (?:the |your )?(?:variant|version)|i want to give you the correct|before i (?:can |give|share)|until you (?:confirm|tell|choose))[^.\n]{0,90}\b(?:payout|platform)\b/i.test(s);
}

/**
 * MIXED_VARIANT_SECTIONS_V1: keep every section that is not an unconfirmed variant figure, and
 * keep (or add) one clarification for the variant-dependent part. Returns '' when there is no
 * validated answer to send, so a clarify-only reply cannot replace a multi-topic answer.
 * Shared facts the draft withheld are added from the approved articles so one ambiguous
 * part cannot drop the parts that do not depend on the variant.
 */
function salvageMixedVariantSections(clientText, draft) {
  const client = normalizeClientText(String(clientText || ''));
  const family = PRODUCT_FAMILIES.find((f) => (f.id === '2_step' || f.id === '1_step') && f.familyRe.test(client) && !clientNamedSingleVariant(client, f));
  if (!family || !(family.variantSensitiveRe && family.variantSensitiveRe.test(client))) return '';
  let multi = (String(client).match(/\?/g) || []).length >= 2 || /\b(?:and|also|plus)\b/i.test(client);
  try {
    const mac = require('./statePresend/multiAskCompleteness');
    const asks = mac.extractAsks([{ role: 'client', text: client }]);
    const n = ((asks && asks.burst) || []).length;
    if (n >= 2) multi = true;
    if (n === 1) multi = false;
  } catch (_) { /* the punctuation check above stands */ }
  if (!multi) return '';
  const raw = String(draft || '').replace(/\r/g, '');
  const blocks = raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const kept = [];
  for (const block of (blocks.length ? blocks : [raw.trim()])) {
    const sents = block.split(/(?<=[.!?])\s+/);
    const ok = sents.filter((s) => !unconfirmedVariantFigure(client, s) && !isSharedFactDeferral(s) && !deniesWeekendHolding(s));
    const piece = ok.join(' ').trim();
    if (piece) kept.push(piece);
  }
  let body = kept.join('\n\n').trim();
  const who = family.id === '1_step' ? '1-Step' : '2-Step';
  if (/\bhow\b/i.test(client) && /\bpayouts?\b/i.test(client) && !payoutScheduleAnswered(body)) {
    body = (body ? body + '\n\n' : '') + 'On both ' + who + ' versions you can choose a payout interval of 3, 7, 14, or 21 days, and the first payout is requestable after 21 days.';
  }
  if (/\bplatforms?\b/i.test(client) && !tradingPlatformsAnswered(body)) {
    body = (body ? body + '\n\n' : '') + 'Both ' + who + ' versions use MetaTrader 5 and TradeLocker.';
  }
  if (/\bweekend\b/i.test(client) && /\bhold/i.test(client) && !weekendHoldingAnswered(body)) {
    body = (body ? body + '\n\n' : '') + 'Yes, weekend holding is allowed: you can hold a position opened before the weekend. Weekend trading is not allowed.';
  }
  body = body.split(/\n\s*\n/).map((block) => block.split(/(?<=[.!?])\s+/).filter((s) => {
    if (!/\b(?:not published|isn['\u2019]?t published|not specified|(?:do|does)(?:\s+not|n['\u2019]?t)\s+specify|can['\u2019]?t confirm|cannot confirm)\b/i.test(s)) return true;
    if (payoutScheduleAnswered(body) && /\bpayout/i.test(s)) return false;
    if (tradingPlatformsAnswered(body) && /\bplatform/i.test(s)) return false;
    if (weekendHoldingAnswered(body) && /\bweekend\b/i.test(s) && /\bhold/i.test(s)) return false;
    return true;
  }).join(' ').trim()).filter(Boolean).join('\n\n');
  const asksVariant = mentionsBothVariantNames(body, family) && /\?/.test(body);
  if (!asksVariant) {
    const q = family.id === '1_step'
      ? 'Which version do you mean, 1-Step Lite or 1-Step + Free Retry?'
      : 'Which version do you mean, 2-Step Lite or 2-Step + Free Retry?';
    body = body ? (body + '\n\n' + q) : q;
  }
  const answers = body.split(/(?<=[.!?])\s+/).filter((s) => !/\?\s*$/.test(String(s).trim()) && String(s).trim().split(/\s+/).length >= 6);
  if (!answers.length) return '';
  return body;
}

function isUsefulClarification(text, family) {
  const value = String(text || '').trim();
  if (!family) {
    return PRODUCT_FAMILIES.some((f) => isUsefulClarification(value, f));
  }
  if (!family.hasBothVariants(value) && !mentionsBothVariantNames(value, family)) return false;
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
    // INSTANT_VARIANTS_OFFICIAL_V2: both variants share the same sizes ($7k-$100k), so a size never
    // picks the variant. An explicit "Instant Standard" / "standard" choice does.
    if (/\b(?:instant\s+)?standard\b/i.test(t) && /\binstant\b|^(?:the\s+)?standard\b/i.test(t) && !/\belite\b/i.test(t)) return true;
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
  // MULTI_QUESTION_NO_COLLAPSE_V1 (2026-09-26): "What is the daily loss limit on the 2-Step? Can I hold trades over the
  // weekend? How do payouts work?" has no "and", so this guard replaced a full multi-topic draft with a canned
  // "Lite or Free Retry?" and dropped the answerable weekend/payout parts. Several questions are a multi-request exactly
  // like "and"/"also": the model answers the clear parts and asks about the variant-dependent part only.
  const multiQuestion = (latest.match(/\?+/g) || []).length >= 2;
  if (family.otherProductRe.test(latest) || COMPARISON_RE.test(latest) ||
      MULTI_REQUEST_RE.test(latest) || multiQuestion || HUMAN_RE.test(latest)) return false;
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

/**
 * BOTH_FAMILY_FROM_CLIENT_V1 (live 215476080792109): when the client explicitly names a
 * product family ("difference between Instant and Instant Elite"), do NOT reuse the prior
 * bot's 2-Step Lite/Free Retry dual context and overwrite a correct Instant draft with a
 * 2-Step canned both-answer.
 */
function familyNamedInClientText(text) {
  const t = String(text || '');
  if (!t.trim()) return null;
  // Prefer the most specific dual-variant naming in the client message itself.
  for (const family of PRODUCT_FAMILIES) {
    if (!family || !family.supportsBoth) continue;
    if (typeof family.hasBothVariants === 'function' && family.hasBothVariants(t)) return family;
  }
  // Single-family mention with a comparison cue (Instant vs Elite / 2-Step difference).
  for (const family of PRODUCT_FAMILIES) {
    if (!family || !family.supportsBoth) continue;
    if (family.familyRe && family.familyRe.test(t) && COMPARISON_RE.test(t)) {
      // If another product family is also named, prefer the one whose BOTH variants appear,
      // else the family token that appears with its specificVariantRe.
      if (family.specificVariantRe && family.specificVariantRe.test(t)) return family;
    }
  }
  for (const family of PRODUCT_FAMILIES) {
    if (!family || !family.supportsBoth) continue;
    if (family.familyRe && family.familyRe.test(t) && COMPARISON_RE.test(t)) return family;
  }
  return null;
}

function isBothVariantsClientReply(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (BOTH_CLIENT_RE.test(t)) return true;
  if (COMPARISON_EXTERNAL_RE.test(t)) return false;
  // Explicit dual-variant naming + difference cue ("how is Instant Elite different from Instant?")
  // is a both-path even when the anaphora-shaped follow-up regex does not match.
  if (COMPARISON_RE.test(t) && familyNamedInClientText(t)) return true;
  // Comparison anaphora: difference / compare / between them / farq / vs / what about the other.
  if (!COMPARISON_FOLLOWUP_RE.test(t)) return false;
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


/**
 * KB_BOTH_ANSWER_V1 (2026-09-24): the answer for "both variants" is the canonical comparison built
 * from the CURRENT KB product articles (productComparison), not a hard-coded paragraph. The canned
 * bothAnswerVariants carried their own product figures (a second factual authority that could drift
 * from the KB, e.g. "trailing 3%/6% drawdown" for a fixed 3% daily limit) and answered a difference
 * question with "Which one would you like me to explain?". They remain only as a last resort.
 */
const FAMILY_PAIRS = { '2_step': '2-Step Lite vs 2-Step + Free Retry', '1_step': '1-Step Lite vs 1-Step + Free Retry', instant: 'Instant vs Instant Elite' };
function kbBothVariantsAnswer(family) {
  try {
    const q = family && FAMILY_PAIRS[family.id];
    if (!q) return null;
    const cmp = require('./productComparison');
    const table = cmp.build(q, require('./faq-kb').getArticles());
    if (!table) return null;
    const out = cmp.render(table);
    return cmp.assess(table, out).ok ? out : null;
  } catch (_) { return null; }
}

function resolveBothVariantsReply(latestText, priorBotTexts = [], draft, conversationId = '') {
  // Only both/compare path forces the dual FAQ template — choice follow-ups inherit
  // scope in index.js but keep the model/clarify draft.
  if (!isBothVariantsClientReply(latestText)) return draft;
  // CROSS_FAMILY_NOT_BOTH_V1 (2026-09-24, real-model replay of Bot-test 215476082100892): "difference
  // between instant elite and catalyst" names two DIFFERENT product families. It is a product
  // comparison, not "both variants of the family you asked about", so the family template must not
  // replace a correct Instant Elite vs Catalyst draft with the stock Instant / Instant Elite answer.
  try {
    const fam = { 'lite-2-step': '2step', '2-step': '2step', 'lite-1-step': '1step', '1-step': '1step', instant: 'instant', catalyst: 'catalyst', flash: 'flash' };
    const named2 = new Set(require('./faq-kb').detectQueryProducts(latestText).map((p) => fam[p] || p));
    if (named2.size >= 2) return draft;
  } catch (_) { /* fall through to the family logic */ }
  const named = familyNamedInClientText(latestText);
  const prior = lastBotAskedFamily(priorBotTexts);
  // Explicit client family wins over stale prior-bot family (topic change).
  const family = named || prior;
  if (!family || !family.supportsBoth) return draft;
  // If client named family A but prior bot was family B, never force B's canned both-answer
  // over a draft that already discusses A's variants.
  if (named && prior && named.id !== prior.id) {
    if (isUsefulBothAnswer(draft, named)) return draft;
    // Draft already names the client's family variants — keep it even if isUsefulBothAnswer
    // is strict (e.g. Instant size-delta coverage left to VARIANT_COMPARISON_COMPLETE_V1).
    if (typeof named.hasBothVariants === 'function' && named.hasBothVariants(draft)) return draft;
    return pickFreshVariant(
      named.bothAnswerVariants,
      priorBotTexts,
      [named.id, conversationId, latestText, draft].join('|')
    );
  }
  const isLegacyCanned = LEGACY_CANNED_REPLIES.has(String(draft || '').trim());
  if (isUsefulBothAnswer(draft, family) && !isLegacyCanned) return draft;
  const kbBoth = kbBothVariantsAnswer(family);
  if (kbBoth && !(named && typeof named.hasBothVariants === 'function' && named.hasBothVariants(String(draft || '')))) return kbBoth;
  // Guard: never replace an Instant(+Elite) draft with a 2-Step canned reply (or vice versa)
  // when the client message names that Instant family.
  if (named && typeof named.hasBothVariants === 'function' && named.hasBothVariants(String(draft || ''))) {
    return draft;
  }
  return pickFreshVariant(
    family.bothAnswerVariants,
    priorBotTexts,
    [family.id, conversationId, latestText, draft].join('|')
  );
}

/**
 * VARIANT_CLARIFY_SCOPE_V1 (2026-09-26): when a reply asks which variant of a family the client means, which asks does
 * that clarification legitimately cover? Only asks whose answer depends on the variant (the family's variantSensitiveRe)
 * or a generic "what is / rules of" ask. A shared attribute (weekend holding, payout process, platform, leverage) is
 * answerable now and must not hide behind the variant question. Returns null when `replyText` is not a variant
 * clarification (callers keep their own logic).
 */
function variantClarificationCoversAsk(askText, replyText) {
  const reply = String(replyText || '');
  const family = PRODUCT_FAMILIES.find((f) =>
    (f.hasBothVariants(reply) || mentionsBothVariantNames(reply, f)) &&
    /\?|\b(?:which|do you mean|are you (?:asking|looking|considering|interested))\b/i.test(reply));
  if (!family) return null;
  const ask = normalizeClientText(String(askText || ''));
  const singular = ask.replace(/\b([a-z]{3,}[^s\W])s\b/gi, '$1');
  const has = (re) => !!re && (re.test(ask) || re.test(singular));
  if (has(family.variantInsensitiveRe)) return false;
  if (!has(ATTRIBUTE_ASK_RE)) return true;
  if (!family.variantSensitiveRe) return true;
  return has(family.variantSensitiveRe);
}

/**
 * VARIANT_CLARIFY_GENUINE_V1 (2026-09-26): the client named a product family without its variant and asked something whose
 * answer depends on the variant (daily loss, price, ...), and the draft asks which variant. That clarification is required
 * by the variant rule, so it must not be flagged UNNECESSARY_CLARIFICATION (the regeneration then either dropped the
 * answered parts or picked a variant for the client).
 */
function isGenuineVariantClarification(clientText, draft) {
  const client = normalizeClientText(String(clientText || ''));
  const d = String(draft || '');
  if (!/\?/.test(d)) return false;
  const family = PRODUCT_FAMILIES.find((f) => f.familyRe.test(client) && !clientNamedSingleVariant(client, f) &&
    (f.hasBothVariants(d) || mentionsBothVariantNames(d, f)));
  if (!family) return false;
  return variantClarificationCoversAsk(client, d) === true;
}

module.exports = {
  mentionsBothVariantNames,
  unconfirmedVariantFigure,
  sharedFactStatus,
  payoutScheduleAnswered,
  tradingPlatformsAnswered,
  weekendHoldingAnswered,
  salvageMixedVariantSections,
  variantClarificationCoversAsk,
  isGenuineVariantClarification,
  PRODUCT_FAMILIES,
  shouldClarifyTwoStep,
  shouldClarifyProductVariant,
  clarifyTwoStepReply,
  clarifyProductVariantReply,
  explainTwoStepFollowup,
  explainVariantFollowup,
  resolveBothVariantsReply,
  familyNamedInClientText,
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
