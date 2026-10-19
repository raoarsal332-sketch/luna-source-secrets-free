const softEdges = require('./softEdges');
const partnershipIntent = require('./partnershipIntent');
/**
 * FundedElite - September Promotion Knowledge (Arsal SOT 2026-09-15 promo-scope)
 * Engine: fresh-2026-09-15-promo-scope
 * SOT text: ./fundedelite-promotion-prompt.js → FUNDEDELITE_PROMOTION_PROMPT
 * Do NOT invent discounts, codes, eligibility, expiry, or fee amounts beyond SOT.
 * Bulk: client-facing natural wording - auto-increase with quantity; final % at checkout.
 * Never canned 1=35%/2=40% script. Soft scale illustration OK only when it fits; never invent other tiers.
 * Non-bulk product answers: soft quantity hint only, no bulk % numbers.
 * Conversation context: short follow-ups inherit promo topic; Free Retry+Lite same OCT35 family.
 */

const { FUNDEDELITE_PROMOTION_PROMPT } = require('./fundedelite-promotion-prompt');
// SOT comment anchor (prompt body is source of truth):
// FUNDEDELITE_PROMOTION_PROMPT length used for health/self-check only.
void FUNDEDELITE_PROMOTION_PROMPT;

const FUNDEDELITE_SEPTEMBER_PROMOS = {
 brand: 'FundedElite',
 period: 'September',
 sotVersion: 'promo-scope',
 mainCoupon: 'OCT35',

 coupons: {
 NEW50: {
 code: 'NEW50',
 for: 'new_clients_only',
 firstPurchaseOnly: true,
 expires: false,
 percentOff: 50,
 neverSuggestToExistingCustomers: true,
 rule:
 'Only for brand-new clients who have never purchased before. 50% off. Never expires. Never for existing customers.',
 },
 OCT35: {
 code: 'OCT35',
 for: 'september_promotion',
 defaultPercentOff: 35,
 weeklyPayoutPreApplied: true,
 payoutIntervalDays: 7,
 eligibleProducts: [
 '1-Step Free Retry',
 '1-Step Lite',
 '2-Step Free Retry',
 '2-Step Lite',
 'Instant',
 'Instant Elite',
 ],
 bulk: {
 increasesAutomatically: true,
 // INTERNAL teaching only (not a canned client script): qty1~35%, qty2~40% on both, keeps scaling.
 internalTeachingExample: {
 qty1Percent: 35,
 qty2Percent: 40,
 note: 'INTERNAL ONLY - do not copy-paste to clients as fixed script.',
 },
 policy:
 'Client-facing: discount can increase automatically when buying more than one challenge; final % shown at checkout. Prefer natural varied wording. Optional soft illustration of scaling is OK if it fits; never dump a fixed 1=35%/2=40% canned line; never invent other exact tiers (e.g. qty3=45%).',
 },
 },
 FLASH5: {
 code: 'FLASH5',
 for: 'flash_activation_only',
 offer: 'Buy 1 Get 4 Free',
 payUsd: 5,
 freeExtraAccounts: 4,
 totalAccounts: 5,
 freeMeans: 'challenge_fees_only_not_activation',
 rule:
 'Pay $5 for 1 challenge and receive 4 more accounts free (5 total). Free = challenge fees only, not activation. After passing, each account needs a separate activation fee by size. Never invent fee amounts. Never use OCT35 for Flash.',
 },
 },

 instantEliteBySize: {
 '50K': { percentOff: 35, code: 'OCT35' },
 '100K': { percentOff: 35, code: 'OCT35' },
 '200K': { percentOff: 35, code: 'OCT35' },
 '300K': { percentOff: 50, code: 'OCT35' },
 '400K': { percentOff: 50, code: 'OCT35' },
 },

 catalyst: {
 product: 'Catalyst Challenge',
 promoAvailable: false,
 blockedCodes: ['OCT35', 'FLASH5', 'NEW50'],
 },

 supportRules: [
 'Identify product first; do not dump all offers.',
 'Promo overview is a summary, not a catalogue — no automatic $50k/$100k/$200k/$300k/$400k dumps; list exact sizes only when asked.',
 'Never invent discounts, codes, eligibility, expiry, or fee amounts beyond SOT.',
 'Bulk: may auto-increase with quantity; final % at checkout; natural varied wording - never canned 1=35%/2=40% script; never invent other tiers.',
 'Free Retry and Lite share the same OCT35 promo within a step family - answer both; never ask which; never say rules/features differ for the promo.',
 'Preserve promo topic across short follow-ups (e.g. "2 step", "both", "instant", "300K").',
 'Do not switch to challenge rules unless client explicitly asks rules/features without a promo signal.',
 'Match client language: Roman Urdu/Urdu vs English.',
 'Keep replies short and concise.',
 'Weekly payout addon pre-applied under OCT35 on eligible products.',
 'Never invent FLASH5 activation fee amounts; activation is separate after pass.',
 'Catalyst: no discount; never apply OCT35/FLASH5/NEW50.',
 'NEW50: new clients only; never for existing.',
 'Flash: FLASH5 only - never OCT35.',
 ],
};

function prefersRomanUrdu(question) {
 const t = String(question || '').toLowerCase();
 return (
 /\b(kya|chal|rahi|raha|hai|kitna|mujhe|mera|meri|kaunsa|kaunsi|batao|bataein|chahiye|kese|kaise|kaisa|nahi|nhi|haan|karna|krna|doon|dena|lagega|lagta|waly|wali)\b/.test(
 t
 ) &&
 /\b(kya|chal|rahi|raha|hai|kitna|mujhe|mera|meri|kaunsa|kaunsi|batao|chahiye|kese|kaise|nahi|nhi)\b/.test(
 t
 )
 );
}

function normalizeHistory(conversationHistory) {
 if (!conversationHistory) return [];
 if (typeof conversationHistory === 'string') {
 return conversationHistory
 .split(/\n+/)
 .map((line) => {
 const s = String(line || '').trim();
 if (!s) return null;
 if (/^client\s*:/i.test(s) || /^user\s*:/i.test(s)) {
 return { role: 'user', text: s.replace(/^(client|user)\s*:\s*/i, '') };
 }
 if (/^(agent|assistant|admin|bot|arsal|elite)\s*:/i.test(s)) {
 return { role: 'assistant', text: s.replace(/^(agent|assistant|admin|bot|arsal|elite)\s*:\s*/i, '') };
 }
 return { role: 'unknown', text: s };
 })
 .filter(Boolean);
 }
 if (!Array.isArray(conversationHistory)) return [];
 return conversationHistory
 .map((item) => {
 if (!item) return null;
 if (typeof item === 'string') return { role: 'unknown', text: item };
 const roleRaw = String(item.role || item.author || item.who || '').toLowerCase();
 let role = 'unknown';
 if (roleRaw === 'user' || roleRaw === 'client' || roleRaw === 'lead' || roleRaw === 'customer') {
 role = 'user';
 } else if (
 roleRaw === 'assistant' ||
 roleRaw === 'admin' ||
 roleRaw === 'bot' ||
 roleRaw === 'agent' ||
 roleRaw === 'arsal'
 ) {
 role = 'assistant';
 }
 const text = String(item.text || item.body || item.content || item.message || '').trim();
 if (!text) return null;
 return { role, text };
 })
 .filter(Boolean);
}

function historyTextBlob(history) {
 return normalizeHistory(history)
 .map((h) => h.text)
 .join('\n');
}

// "offer(s)" as a NOUN ("any offers?", "current offer", "special offer") is a real promo
// signal; as a VERB ("what services do you offer", "what do you guys offer") it is a
// generic company-services question and must NOT be treated as a discount ask.
const OFFER_AS_VERB_RE = /\b(?:what|which)\b[^.?!\n]{0,30}\b(?:do|does|did)\b[^.?!\n]{0,15}\b(?:you|they|fundedelite)\b[^.?!\n]{0,10}\boffer/i;

function isPromoSignal(text) {
 const t = String(text || '').toLowerCase();
 if (!t) return false;
 if (/\b(oct\s*3535|oct35|flash\s*5|flash5|new\s*50|new50)\b/.test(t)) return true;
 if (/\b(promo(?:tion)?s?|discount(?:s)?|coupon(?:s)?|voucher(?:s)?)\b/.test(t)) return true;
 if (/\boffers?\b/.test(t) && !OFFER_AS_VERB_RE.test(t)) return true;
 if (/\b(\d+\s*%\s*off|percent(?:age)?\s*off)\b/.test(t)) return true;
 if (/\bany\s+(?:deals?|sales?|promos?|offers?|discounts?)\b/.test(t)) return true;
 if (/flash\s*activation/.test(t) && /\b(\$\s*5|5\s*dollars?|buy\s*1|get\s*4|bogo|free)\b/.test(t)) return true;
 if (/\bweekly\s*payout\b/.test(t)) return true;
 if (/\b(bulk\s+discount|bulk\s+(?:buy|purchase)|quantity\s+discount|how\s+bulk)\b/.test(t)) return true;
 if (/\bbulk\b/.test(t) && /\b(discount|promo|offer|oct35|challenge|work|works|how)\b/.test(t)) return true;
 if (/kya\s+offer|koi\s+(discount|offer|promo)|offer\s+chal/.test(t)) return true;
 try {
  if (partnershipIntent && typeof partnershipIntent.looksLikePublicPromoAsk === 'function' && partnershipIntent.looksLikePublicPromoAsk(text)) return true;
 } catch (_) {}
 return false;
}

/**
 * PROMO_SHAPE_V1: classify detail depth so overview asks never become size/product catalogues.
 */
function wantsPromoSizeList(text) {
 const t = String(text || '');
 if (detectInstantEliteSize(t)) return true;
 return /\b(?:what|which)\b[^?.!\n]{0,50}\b(?:account\s+)?sizes?\b|\b(?:list|all)\s+(?:the\s+)?(?:available\s+)?(?:account\s+)?sizes?\b|\bexact\s+(?:sizes?|discounts?|percentages?)\b|\bwhich\s+sizes?\b|\b(?:discount|off|%)\b[^?.!\n]{0,40}\b(?:for|on|at)\b[^?.!\n]{0,24}\b(?:50|100|200|300|400)\s*k\b|\b(?:50|100|200|300|400)\s*k\b[^?.!\n]{0,40}\b(?:discount|off|promo|%)\b/i.test(t);
}

function namedPromoCodeCount(text) {
 const t = String(text || '');
 let n = 0;
 if (/\boct\s*3535\b|\boct35\b/i.test(t)) n++;
 if (/\bflash\s*5\b|\bflash5\b/i.test(t)) n++;
 if (/\bnew\s*50\b|\bnew50\b/i.test(t)) n++;
 return n;
}

function promoAskKind(text) {
 const t = String(text || '');
 if (!t.trim()) return 'overview';
 if (wantsPromoSizeList(t)) return 'sizes';
 if (
  /\b(?:compare|vs\.?|versus|difference between|which\s+(?:promo|code|offer|discount)\s+(?:is\s+)?better|better\s+(?:promo|code|offer))\b/i.test(t) &&
  isPromoSignal(t)
 ) {
  return 'compare';
 }
 if (namedPromoCodeCount(t) >= 2) return 'compare';
 const product = detectProduct(t);
 if (
  (product === 'new50' || mentionsNew50(t)) &&
  /\b(?:eligib|who\s+can|new\s+client|never\s+purchas|existing|expire|first\s+time)\b/i.test(t)
 ) {
  return 'eligibility';
 }
 if (product === 'new50' && namedPromoCodeCount(t) <= 1) return 'eligibility';
 if (namedPromoCodeCount(t) === 1) return 'one_promo';
 if (product === 'flash' || product === 'catalyst' || product === 'instant_elite' || product === 'instant' ||
     product === '1_step_family' || product === '2_step_family' || product === '1_step_lite' ||
     product === '1_step_free_retry' || product === '2_step_lite' || product === '2_step_free_retry' ||
     product === 'bulk' || product === 'weekly_payout') {
  return 'product';
 }
 return 'overview';
}

function promoShapeGuidance(kind) {
 const k = String(kind || 'overview');
 if (k === 'sizes') {
  return 'PROMO_SHAPE_V1 sizes: list the documented size/% pairs. Do not expand into a full product catalogue.';
 }
 if (k === 'eligibility') {
  return 'PROMO_SHAPE_V1 eligibility: answer who can use the code (NEW50 = brand-new never-purchased clients; does not expire). Do not dump sizes or every product.';
 }
 if (k === 'one_promo' || k === 'product') {
  return 'PROMO_SHAPE_V1 one-promo: one labelled bullet (or equally short) — code, main benefit, one important condition. No nested headings, no mega-paragraphs.';
 }
 if (k === 'compare') {
  return 'PROMO_SHAPE_V1 compare: one labelled bullet per code (benefit + one condition). No size/product catalogue.';
 }
 return 'PROMO_SHAPE_V1 overview: summary not catalogue. One heading Current Promotions, then one labelled bullet per ACTIVE code (OCT35, FLASH5, NEW50). Do not list every Instant Elite account size or every eligible product/tier. Summarize Instant Elite as selected sizes having higher discounts. Bold only code, main discount/value, one critical condition. Then ask which challenge they are looking to purchase.';
}

function overviewFactsReply(urdu) {
 // Customer facts only. Shape instructions stay in promoShapeGuidance(), never in this string.
 if (urdu) {
  return (
   'Current Promotions:\n' +
   '• OCT35: eligible challenges pe 35% off, weekly payout add-on shamil hai. Multi-account checkout pe discount automatically barh sakta hai.\n' +
   '• FLASH5: 1 Flash Activation account $5 + 4 additional accounts free. Pass ke baad har account ki apni activation fee.\n' +
   '• NEW50: brand-new clients (pehle kabhi purchase nahi) ke liye 50% off. Yeh code expire nahi hota. NEW50 aur OCT35 alag offers hain.\n' +
   'Aap kaunsi challenge kharidna chahte hain?\n' +
   'Selected Instant Elite sizes pe higher discount ho sakta hai.'
  );
 }
 return (
  'Current Promotions:\n' +
  '• OCT35: 35% off eligible challenges, and it includes the weekly payout add-on. Multi-account purchases may receive a higher automatic discount at checkout.\n' +
  '• FLASH5: Get 1 Flash Activation account for $5 + 4 additional accounts free. Each passed account has its own activation fee.\n' +
  '• NEW50: 50% off for brand-new clients who have never purchased before. This code does not expire. NEW50 is separate from OCT35.\n' +
  'Which challenge are you looking to purchase?\n' +
  'Selected Instant Elite sizes have a higher discount.'
 );
}

// Narrow guard for promo auto-replies. Drops instruction-voice sentences only.
// Does not rewrite eligibility, prices, or the checkout CLIENT REPORT payload
// unless that payload is itself being prepared as customer text.
const PROMO_INSTRUCTION_LEAK_RE = /(?:not a catalogue|catalogue nahi|do not list every|don't list every|then ask which challenge|poochein kaunsi|list exact sizes only when asked|overview pe har instant elite|sizes tab list karein|do not dump|client report\s*:|internal instruction|model instruction)/i;

function hasPromoInstructionLeak(text) {
 return PROMO_INSTRUCTION_LEAK_RE.test(String(text || ''));
}

function isCheckoutReportResidue(part) {
 const p = String(part || '');
 return /client report\s*:/i.test(p) ||
  /eligibility facts are above/i.test(p) ||
  /apply-failure is backend/i.test(p) ||
  /do not dismiss it as a general promo faq/i.test(p) ||
  /do not invent a product restriction/i.test(p) ||
  /escalate for teammate review when the client says the code will not apply/i.test(p) ||
  /named promo\/coupon checkout pe apply nahi/i.test(p) ||
  /general promo faq ki tarah dismiss/i.test(p);
}

function isInstructionStyleOnly(part) {
 const p = String(part || '').trim();
 if (!p) return false;
 if (isCheckoutReportResidue(p)) return true;
 if (/^\s*then ask\b/i.test(p)) return true;
 if (/^\s*(?:do not|don't|never)\s+(?:list|dump|paste|copy-paste|copy|output|include every|mention every|ask which|invent a|write a catalogue|catalogue)\b/i.test(p)) return true;
 if (PROMO_INSTRUCTION_LEAK_RE.test(p) && !/\b(?:OCT35|FLASH5|NEW50|\d+\s*%)\b/i.test(p)) return true;
 return false;
}

function stripCheckoutReportForCustomer(text) {
 const raw = String(text || '');
 if (!raw.trim()) return raw;
 if (!isCheckoutReportResidue(raw)) return raw;
 const kept = [];
 for (const line of raw.split('\n')) {
  const parts = String(line).split(/(?<=[.!?])\s+/);
  const good = [];
  for (const part of parts) {
   if (isCheckoutReportResidue(part)) continue;
   if (String(part || '').trim()) good.push(String(part).trim());
  }
  if (good.length) kept.push(good.join(' '));
 }
 return kept.join('\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function sanitizePromoCustomerText(text) {
 let raw = String(text || '');
 raw = raw.replace(/\((?:[^)]*(?:not a catalogue|catalogue nahi|do not list every|summary, not)[^)]*)\)/gi, '');
 const hasFact = (s) => /\b(?:OCT35|FLASH5|NEW50|\d+\s*%)\b/i.test(s);
 const kept = [];
 for (const line of raw.split('\n')) {
  const parts = String(line).split(/(?<=[.!?])\s+/);
  const good = [];
  for (let part of parts) {
   if (isCheckoutReportResidue(part)) continue;
   if (PROMO_INSTRUCTION_LEAK_RE.test(part)) {
    if (!hasFact(part)) continue;
    part = part
     .replace(/\b(?:do not list every|don't list every|then ask which challenge|poochein kaunsi|list exact sizes only when asked|do not dump|client report\s*:)[^.?!]*/gi, '')
     .replace(/\bnot a catalogue\b/gi, '')
     .replace(/\bcatalogue nahi\b/gi, '');
   }
   if (isInstructionStyleOnly(part)) continue;
   if (PROMO_INSTRUCTION_LEAK_RE.test(part) && !hasFact(part)) continue;
   if (String(part || '').trim()) good.push(String(part).trim());
  }
  if (good.length) kept.push(good.join(' '));
 }
 return stripCheckoutReportForCustomer(kept.join('\n').replace(/[ \t]{2,}/g, ' ').replace(/\(\s*\)/g, '').trim());
}

function hasPromoSizeDump(text) {
 const t = String(text || '');
 // A "do not dump 50k/100k/200k" instruction is not a client-facing size catalogue.
 const cleaned = t.replace(/do not dump[^.?\n]{0,120}/gi, '');
 return /50k[\s/,]+100k[\s/,]+200k/i.test(cleaned) ||
  /\$50k[\s/,]+\$100k[\s/,]+\$200k/i.test(cleaned) ||
  /50k[\s/,]+100k[\s/,]+200k[\s/,]+300k[\s/,]+400k/i.test(cleaned);
}

/**
 * Plan / feature difference asks - NEVER promo, even with short "1 step"/"2 step" follow-ups.
 */
function isPlanDifferenceOrFeaturesAsk(text) {
 return softEdges.isPlanDifferenceOrFeaturesAsk(text);
}

function isExplicitRulesRequest(text) {
 const t = String(text || '').toLowerCase();
 if (!t) return false;
 if (isPlanDifferenceOrFeaturesAsk(t)) return true;
 if (
 /\b(daily\s+loss|max(?:imum)?\s+loss|drawdown|consistency|profit\s+target|leverage|news\s+trading|expert\s+advisor|\bea\b|weekend\s+hold|scalping|reset\s+fee|rules?\s+and\s+features|challenge\s+rules?|account\s+rules?|what\s+are\s+the\s+rules|tell\s+me\s+the\s+rules|requirements?)\b/.test(
 t
 )
 ) {
 return true;
 }
 if (/\b(what\s+is|what'?s|how\s+does|how\s+do|explain)\b[\s\S]{0,40}\b(daily\s+loss|drawdown|consistency|profit\s+target|leverage|rule|feature|requirement)\b/.test(t)) {
 return true;
 }
 return false;
}

function wantsBulkExample(question) {
 const t = String(question || '').toLowerCase();
 if (!t) return false;
 if (/\bhow\s+(?:does\s+)?(?:the\s+)?bulk\b/.test(t)) return true;
 if (/\bbulk\b[\s\S]{0,40}\b(work|works|example|scale|scaling|increase|increases)\b/.test(t)) return true;
 if (/\b(explain|tell\s+me)\b[\s\S]{0,30}\bbulk\b/.test(t)) return true;
 if (/bulk\s+(discount|rule|promo|offer)/.test(t)) return true;
 if (/\bquantity\s+discount\b/.test(t)) return true;
 if (/zyada\s*(quantity|accounts?).*(discount|kitna)|bulk\s*(kaise|kese|ka\s*am)/.test(t)) return true;
 return false;
}

function detectInstantEliteSize(text) {
 const t = String(text || '')
 .toUpperCase()
 .replace(/[$,\s]/g, '');
 const map = {
 '50K': '50K',
 '100K': '100K',
 '200K': '200K',
 '300K': '300K',
 '400K': '400K',
 '50000': '50K',
 '100000': '100K',
 '200000': '200K',
 '300000': '300K',
 '400000': '400K',
 };
 for (const key of Object.keys(map)) {
 if (t.includes(key)) return map[key];
 }
 return null;
}

/**
 * Product detection. Prefer specific Lite / Free Retry when named;
 * bare "1 step" / "2 step" / "both" → family (same OCT35 for Free Retry + Lite).
 */
function detectProduct(question) {
 const q = String(question || '').toLowerCase();
 if (/\bcatalyst\b/.test(q)) return 'catalyst';
 if (/flash\s*5|flash5|flash\s*activation/.test(q)) return 'flash';
 if (/instant\s*elite/.test(q)) return 'instant_elite';
 if (/\binstant\b/.test(q)) return 'instant';

 const hasLite = /\blite\b/.test(q);
 const hasFreeRetry = /free\s*retry|freeretry/.test(q);
 const is1 = /1[\s-]*step|one[\s-]*step/.test(q);
 const is2 = /2[\s-]*step|two[\s-]*step/.test(q);

 if (is1 && hasLite && !hasFreeRetry) return '1_step_lite';
 if (is1 && hasFreeRetry && !hasLite) return '1_step_free_retry';
 if (is2 && hasLite && !hasFreeRetry) return '2_step_lite';
 if (is2 && hasFreeRetry && !hasLite) return '2_step_free_retry';
 if (is1) return '1_step_family';
 if (is2) return '2_step_family';

 if (/\bboth\b/.test(q)) return 'family_both';
 if (/new\s*50|new50/.test(q)) return 'new50';
 if (/weekly\s*payout/.test(q)) return 'weekly_payout';
 if (wantsBulkExample(q) || /\bbulk\b|quantity\s+discount|multiple\s+challenges?|zyada\s*accounts?/.test(q)) {
 return 'bulk';
 }
 return 'general';
}

function isExistingCustomer(question) {
 // NEW50_NEVER_PURCHASED_V1: "I have never purchased before" must NOT match
 // "purchased before" / "bought before". Negated first-purchase phrases are new clients.
 const t = String(question || '').toLowerCase();
 if (!t) return false;
 if (
 /\b(?:never|haven'?t|have\s+not|had\s+not|did\s+not|didn'?t)\s+(?:\w+\s+){0,3}(?:purchased|bought|purchase|buy)\b/.test(t) ||
 /\b(?:no|not\s+a)\s+(?:prior|previous|past)\s+purchase\b/.test(t) ||
 /\bbrand[\s-]*new\s+client\b/.test(t) ||
 /\bfirst\s+time\s+(?:buyer|purchase|client|customer)\b/.test(t)
 ) {
 return false;
 }
 return /already\s*(purchased|bought)|existing\s*customer|bought\s*before|purchased\s*before|not\s*new|pehle\s*(kharid|purchase|buy)|purana\s*client|existing/.test(
 t
 );
}


/**
 * NEW50_PRODUCT_COEXIST_V1: NEW50 is a new-client code, not product-bound (except Catalyst).
 * When the client names NEW50 together with a challenge, both facts must be available —
 * never invent "NEW50 is not the listed code for this offer".
 */
function mentionsNew50(text) {
 return /\bnew\s*50\b|\bnew50\b/i.test(String(text || ''));
}

/**
 * PROMO_CHECKOUT_FAILURE_V1: client reports a named promo/coupon fails to apply at
 * checkout/dashboard. That is backend/account work, not a general promo FAQ.
 */
function isPromoCodeFailureAsk(text) {
 const t = String(text || '').toLowerCase();
 if (!t) return false;
 const named =
 /\b(?:new\s*50|new50|oct\s*3535|oct35|flash\s*5|flash5)\b/.test(t) ||
 /\b(?:promo|discount|coupon|voucher)\s*codes?\b/.test(t) ||
 /\b(?:the|my|this|that)\s+(?:code|coupon|discount|promo)\b/.test(t);
 if (!named) return false;
 return (
 /\b(?:can(?:not|'?t)|unable\s+to|won'?t|does\s*n(?:ot|')t|did\s*n(?:ot|')t|not|never)\s+(?:\w+\s+){0,4}(?:apply|applied|work|working|use|using|accept|accepted|go\s*through)\b/.test(t) ||
 /\b(?:code|coupon|discount|promo)\b[^.?!\n]{0,60}\b(?:not\s+(?:apply|working|accepted)|does\s*n(?:ot|')t\s+apply|won'?t\s+apply|never\s+apply|failed|error|invalid)\b/.test(t) ||
 /\b(?:just\s+)?(?:does\s*n(?:ot|')t|doesnt|won't|wont|never)\s+applys?\b/.test(t) ||
 /\bbefore\s+creating\s+(?:the\s+)?account\b/.test(t) ||
 /\bafter\s+creating\s+(?:the\s+)?account\b[^.?!\n]{0,80}\b(?:can(?:not|'?t)|couldn'?t|anymore|not)\b/.test(t) ||
 /\b24\s*hours?\b[^.?!\n]{0,60}\b(?:appl|expir)/.test(t)
 );
}

// PROMO_PUBLIC_TEXT_V1 (2026-09-25, live 215476097914090): customer-facing promo replies must carry
// facts only. Two returned strings contained instructions to Luna ("we do not invent fee amounts",
// "Never use OCT35 for Flash", "Do not say NEW50 is not listed") and were sent to customers verbatim.
function new50EligibilityReply(urdu) {
 return urdu
 ? 'NEW50 sirf brand-new clients ke liye hai (pehle kabhi purchase na kiya ho) — 50% off. Ye expire nahi hota. Catalyst ke ilawa product-bound nahi — eligible new client kisi bhi non-Catalyst challenge pe use kar sakta hai.'
 : 'NEW50 is 50% off for brand-new clients who have never purchased before. It never expires. It is not product-bound (except Catalyst, where no promo applies) — an eligible new client can use it on any non-Catalyst challenge.';
}

function oct35AndNew50CombinedReply(productName, urdu) {
 const sep = oct35FlatReply(productName, urdu);
 const neu = new50EligibilityReply(urdu);
 if (urdu) {
 return (
 neu +
 ' Alag offer: ' +
 sep +
 ' NEW50 ki eligibility sirf new client hone par depend karti hai, jo OCT35 September product promo se alag hai.'
 );
 }
 return (
 neu +
 ' Separately, ' +
 sep +
 ' NEW50 eligibility depends only on being a new client, separately from the OCT35 product promo.'
 );
}

function assistantAskedWhichChallenge(history) {
 const hist = normalizeHistory(history);
 for (let i = hist.length - 1; i >= 0; i--) {
 const h = hist[i];
 if (h.role !== 'assistant') continue;
 const t = h.text.toLowerCase();
 if (
 /which\s+challenge|kaunsi\s+challenge|kaunsa\s+challenge|which\s+(one|product|account\s+size)|interested\s+in\?|looking\s+at\?/.test(
 t
 )
 ) {
 return true;
 }
 break;
 }
 const recent = hist.slice(-8);
 return recent.some(
 (h) =>
 h.role === 'assistant' &&
 /which\s+challenge|kaunsi\s+challenge|kaunsa\s+challenge|which\s+(one|product|account\s+size)/i.test(
 h.text
 )
 );
}

/**
 * Active topic: last meaningful USER ask was plan-difference / features (not pricing).
 * Short "1 step"/"2 step"/"both" clarifications stay on FEATURES - never promo.
 */
function historyLooksLikePlanDifference(conversationHistory) {
 return softEdges.historyLooksLikePlanDifference(conversationHistory);
}

function historyLooksLikePromotions(conversationHistory) {
 const hist = normalizeHistory(conversationHistory);
 if (!hist.length) return false;
 // Plan-difference / features topic wins over "which challenge?" clarifiers
 if (historyLooksLikePlanDifference(hist)) return false;
 if (assistantAskedWhichChallenge(hist)) {
 // Only treat as promo if there is also a promo signal somewhere, OR no plan-diff in history
 const blob = historyTextBlob(hist);
 if (isPromoSignal(blob) || /\b(oct35|flash5|new50)\b/i.test(blob)) return true;
 // "Which challenge?" after a bare promo ask (any offer?) - blob may already have promo from assistant
 if (/\b(oct35|flash5|new50|35%|discount|promo|offer|coupon)\b/i.test(blob)) return true;
 // Assistant asked which challenge AND prior user had promo intent
 for (let i = hist.length - 1; i >= 0; i--) {
 if (hist[i].role === 'user' && isPromoSignal(hist[i].text)) return true;
 }
 return false;
 }
 const blob = historyTextBlob(hist);
 if (isPromoSignal(blob)) return true;
 if (/\b(oct35|oct\s*3535|flash5|flash\s*5|new50|new\s*50|35%\s*off|50%\s*off|weekly\s*payout\s*(addon|add-on)?\s*(pre-?applied|included))\b/i.test(blob)) {
 return true;
 }
 if (/yes\s*[ - -].*\boct35\b|instant\s*elite.*oct35|buy\s*1\s*get\s*4/i.test(blob)) return true;
 return false;
}

function isShortPromoFollowUp(text, conversationHistory) {
 const t = String(text || '').trim();
 if (!t || t.length > 80) return false;
 if (historyLooksLikePlanDifference(conversationHistory)) return false;
 if (isPlanDifferenceOrFeaturesAsk(t) || (isExplicitRulesRequest(t) && !isPromoSignal(t))) return false;
 if (!historyLooksLikePromotions(conversationHistory)) return false;
 const q = t.toLowerCase();
 if (/^(1|2)[\s-]*step(\s*(free\s*retry|lite|both))?[.!?]*$/i.test(t)) return true;
 if (/^(one|two)[\s-]*step[.!?]*$/i.test(t)) return true;
 if (/^(both|instant|instant\s*elite|flash|catalyst|lite|free\s*retry)[.!?]*$/i.test(t)) return true;
 if (/^(50|100|200|300|400)\s*k[.!?]*$/i.test(t)) return true;
 if (/^\(?\s*\$?\s*(50|100|200|300|400)\s*,?\s*000\s*\)?[.!?]*$/i.test(t)) return true;
 if (detectProduct(t) !== 'general' && !isExplicitRulesRequest(t)) return true;
 if (detectInstantEliteSize(t) && !isExplicitRulesRequest(t)) return true;
 if (/^(1|2)\s*step\b/i.test(q) && q.length < 40) return true;
 return false;
}

function inferProductFromHistory(conversationHistory) {
 const hist = normalizeHistory(conversationHistory);
 for (let i = hist.length - 1; i >= 0; i--) {
 const p = detectProduct(hist[i].text);
 if (p && p !== 'general' && p !== 'family_both' && p !== 'bulk' && p !== 'weekly_payout' && p !== 'new50') {
 return p;
 }
 if (/instant\s*elite/i.test(hist[i].text)) return 'instant_elite';
 }
 return null;
}

function inferStepFamilyFromHistory(conversationHistory) {
 const hist = normalizeHistory(conversationHistory);
 for (let i = hist.length - 1; i >= 0; i--) {
 const t = hist[i].text.toLowerCase();
 if (/1[\s-]*step|one[\s-]*step/.test(t)) return '1_step_family';
 if (/2[\s-]*step|two[\s-]*step/.test(t)) return '2_step_family';
 }
 return null;
}

/**
 * Flat OCT35 reply - 35% + weekly pre-applied; bulk only as "may increase with quantity"
 * (NO 35/40 example unless includeBulkExample).
 */
function oct35FlatReply(productName, urdu) {
 // Non-bulk product answers: soft quantity hint only - never volunteer bulk % numbers.
 if (urdu) {
 return (
 `Haan - ${productName} pe OCT35 se 35% discount milta hai. ` +
 `Weekly payout addon pehle se apply hota hai (alag se add karne ki zarurat nahi); payout 7 din baad request kar sakte ho (account rules ke mutabiq). ` +
 `Zyada quantity lene pe discount automatically barh sakta hai.`
 );
 }
 return (
 `Yes - ${productName}: 35% off with OCT35. ` +
 `Weekly payout addon is pre-applied (no need to add separately); payout can be requested after 7 days, subject to account rules. ` +
 `Buying more may automatically increase the discount with quantity.`
 );
}

/**
 * Free Retry + Lite same OCT35 - never ask which; never "rules and features differ".
 */
function oct35FamilyReply(stepLabel, urdu) {
 // Family replies: soft quantity hint only - never volunteer bulk % numbers.
 if (urdu) {
 return (
 `Haan - ${stepLabel} Free Retry aur ${stepLabel} Lite dono pe same OCT35 promo: 35% off. ` +
 `Weekly payout addon pehle se apply hota hai (alag add karne ki zarurat nahi); payout 7 din baad request ho sakta hai (account rules ke mutabiq). ` +
 `Zyada quantity pe discount automatically barh sakta hai.`
 );
 }
 return (
 `Yes - both ${stepLabel} Free Retry and ${stepLabel} Lite get the same OCT35 promo: 35% off. ` +
 `Weekly payout addon is pre-applied (no need to add separately); payout can be requested after 7 days, subject to account rules. ` +
 `Buying more may automatically increase the discount with quantity.`
 );
}

function oct35InstantOnly(urdu) {
 if (urdu) {
 return (
 `Instant pe OCT35 se 35% discount milta hai. ` +
 `Weekly payout addon pehle se apply hota hai (alag add karne ki zarurat nahi); payout 7 din baad request ho sakta hai (account rules ke mutabiq).`
 );
 }
 return (
 `Instant: 35% off with OCT35. ` +
 `Weekly payout addon is pre-applied (you do not need to add it separately); payout can be requested after 7 days, subject to account rules.`
 );
}

/**
 * Natural bulk reply - vary wording by question; never dump a fixed 1=35%/2=40% script.
 * Internal teaching (35→40 scaling) may softly inform tone but must not be copy-pasted as canned.
 * Never invent other exact tiers (qty3=45% etc.).
 */
function bulkNaturalReply(question, urdu) {
 const t = String(question || '').toLowerCase();
 const asksHow = /\bhow\b|\bkaise\b|\bkese\b|\bexplain\b|\bwork/.test(t);
 const asksCheckout = /checkout|final|exact|kitna\s*%|what\s*%|percentage/.test(t);

 if (urdu) {
 if (asksCheckout) {
 return (
 'OCT35 pe ek se zyada challenges lene pe discount automatically barh sakta hai. ' +
 'Exact final percentage checkout pe dikhega - hum invent nahi karte ke har quantity pe kitna % hoga.'
 );
 }
 if (asksHow) {
 return (
 'Bulk aise kaam karta hai: OCT35 pe jab aap ek se zyada challenges kharido, discount quantity ke sath automatically scale ho sakta hai. ' +
 'Base single-challenge rate 35% hai, aur zyada lene pe wo further increase ho sakta hai. Final % checkout pe confirm hota hai.'
 );
 }
 return (
 'Haan - OCT35 pe bulk available hai: ek se zyada challenges lene pe discount automatically barh sakta hai. ' +
 'Final percentage checkout pe dikhega.'
 );
 }

 if (asksCheckout) {
 return (
 'With OCT35, buying more than one challenge can automatically increase your discount. ' +
 'The exact final percentage is shown at checkout - we do not invent a fixed % for every quantity.'
 );
 }
 if (asksHow) {
 return (
 'Here is how bulk works under OCT35: when you buy more than one challenge, the discount can scale up automatically with quantity. ' +
 'A single challenge starts at 35% off, and buying additional ones can push that higher. The final percentage is confirmed at checkout.'
 );
 }
 return (
 'Yes - under OCT35, buying more than one challenge can automatically increase the discount. ' +
 'The final percentage is shown at checkout.'
 );
}

function replyForProduct(product, question, urdu) {
 if (product === 'catalyst') {
 return urdu
 ? 'Catalyst Challenge pe abhi koi promotional discount active nahi hai. OCT35, FLASH5, ya NEW50 is pe apply nahi hote.'
 : 'No promotional discount is currently active on the Catalyst Challenge. OCT35, FLASH5, and NEW50 do not apply.';
 }

 if (product === 'flash') {
 return urdu
 ? 'FLASH5 (sirf Flash Activation): Buy 1 Get 4 Free. $5 mein 1 challenge lo, 4 accounts free - total 5. Free = challenge fees, activation nahi. Pass ke baad har account ki alag activation fee hoti hai, jo account size par depend karti hai. OCT35 Flash par apply nahi hota.'
 : 'FLASH5 (Flash Activation only): Buy 1 Get 4 Free. Pay $5 for 1 challenge and get 4 more free (5 total). Free covers challenge fees, not activation. After passing, each account needs a separate activation fee, which depends on the account size. OCT35 does not apply to Flash.';
 }

 if (product === 'instant_elite') {
 const size = detectInstantEliteSize(question);
 if (wantsPromoSizeList(question) && !size) {
  return urdu
   ? 'Instant Elite OCT35 sizes: 50k/100k/200k = 35% off; 300k/400k = 50% off. Weekly payout addon sab sizes pe pre-applied.'
   : 'Instant Elite OCT35 sizes: 50k/100k/200k = 35% off; 300k/400k = 50% off. Weekly payout addon is pre-applied on all sizes.';
 }
 if (!size) {
  return urdu
   ? 'Instant Elite pe OCT35: eligible sizes pe 35% off; selected Instant Elite sizes pe higher discount. Weekly payout addon pre-applied. Kaunsa size chahiye?'
   : 'Instant Elite with OCT35: 35% off eligible sizes; selected Instant Elite sizes have higher discounts. Weekly payout addon is pre-applied. Which size are you looking at?';
 }
 const pct = FUNDEDELITE_SEPTEMBER_PROMOS.instantEliteBySize[size].percentOff;
 return urdu
  ? `Instant Elite ${size}: OCT35 se ${pct}% discount + weekly payout addon (pre-applied).`
  : `Instant Elite ${size}: ${pct}% off with OCT35 + weekly payout addon (pre-applied).`;
 }

 if (product === '1_step_family') return oct35FamilyReply('1-Step', urdu);
 if (product === '2_step_family') return oct35FamilyReply('2-Step', urdu);
 if (product === 'family_both') {
 return oct35FamilyReply('2-Step', urdu);
 }

 if (product === '1_step_free_retry') {
 if (mentionsNew50(question)) return oct35AndNew50CombinedReply('1-Step Free Retry', urdu);
 return oct35FlatReply('1-Step Free Retry', urdu);
 }
 if (product === '1_step_lite') {
 if (mentionsNew50(question)) return oct35AndNew50CombinedReply('1-Step Lite', urdu);
 return oct35FlatReply('1-Step Lite', urdu);
 }
 if (product === '2_step_free_retry') {
 if (mentionsNew50(question)) return oct35AndNew50CombinedReply('2-Step Free Retry', urdu);
 return oct35FlatReply('2-Step Free Retry', urdu);
 }
 if (product === '2_step_lite') {
 if (mentionsNew50(question)) return oct35AndNew50CombinedReply('2-Step Lite', urdu);
 return oct35FlatReply('2-Step Lite', urdu);
 }
 if (product === 'instant') {
 if (mentionsNew50(question)) {
 const base = oct35InstantOnly(urdu);
 return new50EligibilityReply(urdu) + ' Separately, ' + base + (urdu ? ' NEW50 Instant par bhi use ho sakta hai (sirf Catalyst par koi promo nahi).' : ' NEW50 can also be used on Instant (only Catalyst has no promo).'); // PROMO_PUBLIC_TEXT_V1: facts only
 }
 return oct35InstantOnly(urdu);
 }

 if (product === 'new50') {
 if (isExistingCustomer(question)) {
 return urdu
 ? 'NEW50 sirf brand-new clients ke liye hai jo pehle kabhi purchase nahi kiye - existing customers ke liye apply nahi hota.'
 : 'NEW50 is only for brand-new clients who have never purchased before - it does not apply to existing customers.';
 }
 return new50EligibilityReply(urdu);
 }

 if (product === 'weekly_payout') {
 return urdu
 ? 'OCT35 wali eligible challenges pe weekly payout addon pehle se apply hota hai; payout 7 din baad request kar sakte ho (account rules ke mutabiq). Alag se add karne ki zarurat nahi.'
 : 'On OCT35-eligible challenges, the weekly payout addon is pre-applied; payout can be requested after 7 days, subject to account rules. You do not need to add it separately.';
 }

 if (product === 'bulk') {
 return bulkNaturalReply(question, urdu);
 }

 return overviewFactsReply(urdu);
}

/**
 * Resolve whether this turn is promotions vs rules, and which product - using history.
 */
function resolveConversationIntent(question, conversationHistory) {
 const q = String(question || '').trim();
 const hist = normalizeHistory(conversationHistory);
 const urdu =
 prefersRomanUrdu(q) ||
 hist.some((h) => h.role === 'user' && prefersRomanUrdu(h.text));
 const promoCtx = historyLooksLikePromotions(hist);
 const featuresCtx = historyLooksLikePlanDifference(hist);
 const promoSig = isPromoSignal(q);
 const planDiffAsk = isPlanDifferenceOrFeaturesAsk(q);
 const rulesAsk = isExplicitRulesRequest(q);
 const sizeOnly = detectInstantEliteSize(q);
 const productNow = detectProduct(q);
 const shortStepClarifier =
 /^(1|2)[\s-]*step(\s*(free\s*retry|lite|both|standard))?[.!?]*$/i.test(q) ||
 /^(one|two)[\s-]*step[.!?]*$/i.test(q) ||
 /^(both)[.!?]*$/i.test(q);

 // Plan difference / features (no explicit price ask) → ALWAYS rules flow
 if ((planDiffAsk || (rulesAsk && !promoSig)) && !promoSig) {
 return {
 topic: 'rules',
 product: null,
 useExistingRulesFlow: true,
 urdu,
 };
 }

 // Active features topic: short "1 step"/"2 step"/"both" stay on features - NEVER promo
 if (featuresCtx && !promoSig && (shortStepClarifier || (productNow !== 'general' && !promoSig))) {
 if (shortStepClarifier || planDiffAsk || (rulesAsk && !promoSig)) {
 return {
 topic: 'rules',
 product: null,
 useExistingRulesFlow: true,
 urdu,
 };
 }
 }

 if (promoCtx && !rulesAsk && !featuresCtx) {
 if (productNow === 'family_both' || /^both[.!?]*$/i.test(q)) {
 const fam = inferStepFamilyFromHistory(hist) || '2_step_family';
 return { topic: 'promotions', product: fam, urdu };
 }

 if (sizeOnly && (inferProductFromHistory(hist) === 'instant_elite' || /instant\s*elite/i.test(historyTextBlob(hist)))) {
 return {
 topic: 'promotions',
 product: 'instant_elite',
 size: sizeOnly,
 questionForReply: q + ' Instant Elite',
 urdu,
 };
 }

 if (productNow !== 'general') {
 return { topic: 'promotions', product: productNow, urdu };
 }

 if (isShortPromoFollowUp(q, hist) && productNow === 'general' && sizeOnly) {
 return {
 topic: 'promotions',
 product: 'instant_elite',
 size: sizeOnly,
 questionForReply: q + ' Instant Elite',
 urdu,
 };
 }
 }

 // "Which challenge?" clarifier only continues PROMO when promo context (not features)
 if (assistantAskedWhichChallenge(hist) && productNow !== 'general' && promoCtx && !featuresCtx && !planDiffAsk) {
 return { topic: 'promotions', product: productNow, urdu };
 }

 if (promoSig || (productNow !== 'general' && promoSig)) {
 return { topic: 'promotions', product: productNow, urdu };
 }

 if (
 productNow === 'flash' ||
 productNow === 'catalyst' ||
 productNow === 'new50' ||
 productNow === 'weekly_payout' ||
 productNow === 'bulk' ||
 productNow === 'instant_elite' ||
 productNow === 'instant' ||
 productNow === '1_step_family' ||
 productNow === '2_step_family' ||
 productNow === '1_step_lite' ||
 productNow === '1_step_free_retry' ||
 productNow === '2_step_lite' ||
 productNow === '2_step_free_retry'
 ) {
 if (featuresCtx && !promoSig) {
 return {
 topic: 'rules',
 product: null,
 useExistingRulesFlow: true,
 urdu,
 };
 }
 if (
 promoSig ||
 promoCtx ||
 productNow === 'flash' ||
 productNow === 'catalyst' ||
 productNow === 'new50' ||
 productNow === 'bulk' ||
 productNow === 'weekly_payout' ||
 productNow === 'instant_elite' ||
 ((productNow.startsWith('1_step') || productNow.startsWith('2_step') || productNow === 'instant') &&
 /\b(discount|promo|offer|coupon|code|sep|%|off|price|kitna|lagta)\b/i.test(q))
 ) {
 return { topic: 'promotions', product: productNow, urdu };
 }
 }

 // (was a duplicate inline "offer|discount|promo|..." regex independent of isPromoSignal -
 // removed so the "offer" verb-vs-noun fix above cannot be bypassed via this second path)
 if (promoSig) {
 return { topic: 'promotions', product: productNow || 'general', urdu };
 }

 return {
 topic: 'rules',
 product: null,
 useExistingRulesFlow: true,
 urdu,
 };
}

/**
 * Main customer-facing entry with conversation history.
 * Returns reply string, or null when caller should use existing rules/FAQ flow.
 */
function handleCustomerMessage(question, conversationHistory) {
 {
 const __user = typeof userMessage !== 'undefined' ? userMessage : arguments[0];
 const __hist = typeof conversationHistory !== 'undefined' ? conversationHistory : (arguments[1] || []);
 const __mix = softEdges.shouldBypassPromoShortCircuit(__user, __hist);
 if (__mix.bypass) {
 return {
 topic: 'rules',
 reply: null,
 intent: __mix.classification,
 useExistingRulesFlow: true,
 systemHint: __mix.classification.systemHint || null,
 };
 }
 }
 const intent = resolveConversationIntent(question, conversationHistory);
 if (!intent || intent.topic === 'rules' || intent.useExistingRulesFlow) {
 return null;
 }

 const urdu = !!intent.urdu;
 let product = intent.product || 'general';
 const qForReply = intent.questionForReply || question;

 if (product === 'family_both') {
 product = inferStepFamilyFromHistory(conversationHistory) || '2_step_family';
 }

 if (product === 'instant_elite' && intent.size) {
 const pct = FUNDEDELITE_SEPTEMBER_PROMOS.instantEliteBySize[intent.size].percentOff;
 return urdu
 ? `Instant Elite ${intent.size}: OCT35 se ${pct}% discount + weekly payout addon (pre-applied).`
 : `Instant Elite ${intent.size}: ${pct}% off with OCT35 + weekly payout addon (pre-applied).`;
 }

 let reply = replyForProduct(product, qForReply, urdu);
 const kind = promoAskKind(qForReply) === 'overview' || promoAskKind(question) === 'overview'
  ? 'overview'
  : promoAskKind(qForReply);
 if (kind === 'overview' || kind === 'compare') {
  reply = overviewFactsReply(urdu);
 }
 // When the client reports a named code failing at checkout, keep eligibility facts but
 // mark that this is checkout/backend work — caller must not treat it as answerable FAQ only.
 if (isPromoCodeFailureAsk(question) || isPromoCodeFailureAsk(qForReply)) {
 const failNote = urdu
 ? ' CLIENT REPORT: named promo/coupon checkout pe apply nahi ho raha. Eligibility facts upar hain; apply-failure backend/account work hai — general promo FAQ ki tarah dismiss mat karo; escalate/teammate review chahiye jab client kehti hai code apply nahi hota despite eligibility.'
 : ' CLIENT REPORT: a named promo/coupon is not applying at checkout. Eligibility facts are above; an apply-failure is backend/account work — do not dismiss it as a general promo FAQ, and do not invent a product restriction. Escalate for teammate review when the client says the code will not apply despite meeting eligibility.';
 reply = String(reply || '') + failNote;
 }
 return reply;
}

/**
 * Backward-compatible entry. With history, delegates to handleCustomerMessage.
 */
function answerPromotionQuestion(question, conversationHistory) {
 if (conversationHistory !== undefined && conversationHistory !== null) {
 return handleCustomerMessage(question, conversationHistory);
 }
 const urdu = prefersRomanUrdu(question);
 const product = detectProduct(question);
 if ((isExplicitRulesRequest(question) || isPlanDifferenceOrFeaturesAsk(question)) && !isPromoSignal(question)) {
 return null;
 }
 return replyForProduct(product, question, urdu);
}

if (typeof module !== 'undefined' && module.exports) {
 module.exports = {
 FUNDEDELITE_PROMOTION_PROMPT,
 FUNDEDELITE_SEPTEMBER_PROMOS,
 answerPromotionQuestion,
 handleCustomerMessage,
 resolveConversationIntent,
 detectProduct,
 isExistingCustomer,
 mentionsNew50,
 isPromoCodeFailureAsk,
 new50EligibilityReply,
 detectInstantEliteSize,
 isPromoSignal,
 promoAskKind,
 wantsPromoSizeList,
 promoShapeGuidance,
 overviewFactsReply,
 sanitizePromoCustomerText,
 stripCheckoutReportForCustomer,
 hasPromoInstructionLeak,
 hasPromoSizeDump,
 isExplicitRulesRequest,
 isPlanDifferenceOrFeaturesAsk,
 historyLooksLikePlanDifference,
 historyLooksLikePromotions,
 isShortPromoFollowUp,
 oct35FamilyReply,
 oct35FlatReply,
 bulkNaturalReply,
 wantsBulkExample,
 prefersRomanUrdu,
 };
}
