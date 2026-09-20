const softEdges = require('./softEdges');
/**
 * FundedElite - September Promotion Knowledge (Arsal SOT 2026-09-15 promo-scope)
 * Engine: fresh-2026-09-15-promo-scope
 * SOT text: ./fundedelite-promotion-prompt.js → FUNDEDELITE_PROMOTION_PROMPT
 * Do NOT invent discounts, codes, eligibility, expiry, or fee amounts beyond SOT.
 * Bulk: client-facing natural wording - auto-increase with quantity; final % at checkout.
 * Never canned 1=35%/2=40% script. Soft scale illustration OK only when it fits; never invent other tiers.
 * Non-bulk product answers: soft quantity hint only, no bulk % numbers.
 * Conversation context: short follow-ups inherit promo topic; Free Retry+Lite same SEP35 family.
 */

const { FUNDEDELITE_PROMOTION_PROMPT } = require('./fundedelite-promotion-prompt');
// SOT comment anchor (prompt body is source of truth):
// FUNDEDELITE_PROMOTION_PROMPT length used for health/self-check only.
void FUNDEDELITE_PROMOTION_PROMPT;

const FUNDEDELITE_SEPTEMBER_PROMOS = {
 brand: 'FundedElite',
 period: 'September',
 sotVersion: 'promo-scope',
 mainCoupon: 'SEP35',

 coupons: {
 NEW50: {
 code: 'NEW50',
 for: 'new_clients_only',
 firstPurchaseOnly: true,
 expires: false,
 neverSuggestToExistingCustomers: true,
 rule:
 'Only for brand-new clients who have never purchased before. Never expires. Never for existing customers.',
 },
 SEP35: {
 code: 'SEP35',
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
 'Pay $5 for 1 challenge and receive 4 more accounts free (5 total). Free = challenge fees only, not activation. After passing, each account needs a separate activation fee by size. Never invent fee amounts. Never use SEP35 for Flash.',
 },
 },

 instantEliteBySize: {
 '50K': { percentOff: 35, code: 'SEP35' },
 '100K': { percentOff: 35, code: 'SEP35' },
 '200K': { percentOff: 35, code: 'SEP35' },
 '300K': { percentOff: 50, code: 'SEP35' },
 '400K': { percentOff: 50, code: 'SEP35' },
 },

 catalyst: {
 product: 'Catalyst Challenge',
 promoAvailable: false,
 blockedCodes: ['SEP35', 'FLASH5', 'NEW50'],
 },

 supportRules: [
 'Identify product first; do not dump all offers.',
 'Never invent discounts, codes, eligibility, expiry, or fee amounts beyond SOT.',
 'Bulk: may auto-increase with quantity; final % at checkout; natural varied wording - never canned 1=35%/2=40% script; never invent other tiers.',
 'Free Retry and Lite share the same SEP35 promo within a step family - answer both; never ask which; never say rules/features differ for the promo.',
 'Preserve promo topic across short follow-ups (e.g. "2 step", "both", "instant", "300K").',
 'Do not switch to challenge rules unless client explicitly asks rules/features without a promo signal.',
 'Match client language: Roman Urdu/Urdu vs English.',
 'Keep replies short and concise.',
 'Weekly payout addon pre-applied under SEP35 on eligible products.',
 'Never invent FLASH5 activation fee amounts; activation is separate after pass.',
 'Catalyst: no discount; never apply SEP35/FLASH5/NEW50.',
 'NEW50: new clients only; never for existing.',
 'Flash: FLASH5 only - never SEP35.',
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
 if (/\b(sep\s*35|sep35|flash\s*5|flash5|new\s*50|new50)\b/.test(t)) return true;
 if (/\b(promo(?:tion)?s?|discount(?:s)?|coupon(?:s)?|voucher(?:s)?)\b/.test(t)) return true;
 if (/\boffers?\b/.test(t) && !OFFER_AS_VERB_RE.test(t)) return true;
 if (/\b(\d+\s*%\s*off|percent(?:age)?\s*off)\b/.test(t)) return true;
 if (/\bany\s+(?:deals?|sales?|promos?|offers?|discounts?)\b/.test(t)) return true;
 if (/flash\s*activation/.test(t) && /\b(\$\s*5|5\s*dollars?|buy\s*1|get\s*4|bogo|free)\b/.test(t)) return true;
 if (/\bweekly\s*payout\b/.test(t)) return true;
 if (/\b(bulk\s+discount|bulk\s+(?:buy|purchase)|quantity\s+discount|how\s+bulk)\b/.test(t)) return true;
 if (/\bbulk\b/.test(t) && /\b(discount|promo|offer|sep35|challenge|work|works|how)\b/.test(t)) return true;
 if (/kya\s+offer|koi\s+(discount|offer|promo)|offer\s+chal/.test(t)) return true;
 return false;
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
 * bare "1 step" / "2 step" / "both" → family (same SEP35 for Free Retry + Lite).
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
 return /already\s*(purchased|bought)|existing\s*customer|bought\s*before|purchased\s*before|not\s*new|pehle\s*(kharid|purchase|buy)|purana\s*client|existing/.test(
 String(question || '').toLowerCase()
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
 if (isPromoSignal(blob) || /\b(sep35|flash5|new50)\b/i.test(blob)) return true;
 // "Which challenge?" after a bare promo ask (any offer?) - blob may already have promo from assistant
 if (/\b(sep35|flash5|new50|35%|discount|promo|offer|coupon)\b/i.test(blob)) return true;
 // Assistant asked which challenge AND prior user had promo intent
 for (let i = hist.length - 1; i >= 0; i--) {
 if (hist[i].role === 'user' && isPromoSignal(hist[i].text)) return true;
 }
 return false;
 }
 const blob = historyTextBlob(hist);
 if (isPromoSignal(blob)) return true;
 if (/\b(sep35|sep\s*35|flash5|flash\s*5|new50|new\s*50|35%\s*off|50%\s*off|weekly\s*payout\s*(addon|add-on)?\s*(pre-?applied|included))\b/i.test(blob)) {
 return true;
 }
 if (/yes\s*[ - -].*\bsep35\b|instant\s*elite.*sep35|buy\s*1\s*get\s*4/i.test(blob)) return true;
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
 * Flat SEP35 reply - 35% + weekly pre-applied; bulk only as "may increase with quantity"
 * (NO 35/40 example unless includeBulkExample).
 */
function sep35FlatReply(productName, urdu) {
 // Non-bulk product answers: soft quantity hint only - never volunteer bulk % numbers.
 if (urdu) {
 return (
 `Haan - ${productName} pe SEP35 se 35% discount milta hai. ` +
 `Weekly payout addon pehle se apply hota hai (alag se add karne ki zarurat nahi); payout 7 din baad request kar sakte ho (account rules ke mutabiq). ` +
 `Zyada quantity lene pe discount automatically barh sakta hai.`
 );
 }
 return (
 `Yes - ${productName}: 35% off with SEP35. ` +
 `Weekly payout addon is pre-applied (no need to add separately); payout can be requested after 7 days, subject to account rules. ` +
 `Buying more may automatically increase the discount with quantity.`
 );
}

/**
 * Free Retry + Lite same SEP35 - never ask which; never "rules and features differ".
 */
function sep35FamilyReply(stepLabel, urdu) {
 // Family replies: soft quantity hint only - never volunteer bulk % numbers.
 if (urdu) {
 return (
 `Haan - ${stepLabel} Free Retry aur ${stepLabel} Lite dono pe same SEP35 promo: 35% off. ` +
 `Weekly payout addon pehle se apply hota hai (alag add karne ki zarurat nahi); payout 7 din baad request ho sakta hai (account rules ke mutabiq). ` +
 `Zyada quantity pe discount automatically barh sakta hai.`
 );
 }
 return (
 `Yes - both ${stepLabel} Free Retry and ${stepLabel} Lite get the same SEP35 promo: 35% off. ` +
 `Weekly payout addon is pre-applied (no need to add separately); payout can be requested after 7 days, subject to account rules. ` +
 `Buying more may automatically increase the discount with quantity.`
 );
}

function sep35InstantOnly(urdu) {
 if (urdu) {
 return (
 `Instant pe SEP35 se 35% discount milta hai. ` +
 `Weekly payout addon pehle se apply hota hai (alag add karne ki zarurat nahi); payout 7 din baad request ho sakta hai (account rules ke mutabiq).`
 );
 }
 return (
 `Instant: 35% off with SEP35. ` +
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
 'SEP35 pe ek se zyada challenges lene pe discount automatically barh sakta hai. ' +
 'Exact final percentage checkout pe dikhega - hum invent nahi karte ke har quantity pe kitna % hoga.'
 );
 }
 if (asksHow) {
 return (
 'Bulk aise kaam karta hai: SEP35 pe jab aap ek se zyada challenges kharido, discount quantity ke sath automatically scale ho sakta hai. ' +
 'Base single-challenge rate 35% hai, aur zyada lene pe wo further increase ho sakta hai. Final % checkout pe confirm hota hai.'
 );
 }
 return (
 'Haan - SEP35 pe bulk available hai: ek se zyada challenges lene pe discount automatically barh sakta hai. ' +
 'Final percentage checkout pe dikhega.'
 );
 }

 if (asksCheckout) {
 return (
 'With SEP35, buying more than one challenge can automatically increase your discount. ' +
 'The exact final percentage is shown at checkout - we do not invent a fixed % for every quantity.'
 );
 }
 if (asksHow) {
 return (
 'Here is how bulk works under SEP35: when you buy more than one challenge, the discount can scale up automatically with quantity. ' +
 'A single challenge starts at 35% off, and buying additional ones can push that higher. The final percentage is confirmed at checkout.'
 );
 }
 return (
 'Yes - under SEP35, buying more than one challenge can automatically increase the discount. ' +
 'The final percentage is shown at checkout.'
 );
}

function replyForProduct(product, question, urdu) {
 if (product === 'catalyst') {
 return urdu
 ? 'Catalyst Challenge pe abhi koi promotional discount active nahi hai. SEP35, FLASH5, ya NEW50 is pe apply nahi hote.'
 : 'No promotional discount is currently active on the Catalyst Challenge. SEP35, FLASH5, and NEW50 do not apply.';
 }

 if (product === 'flash') {
 return urdu
 ? 'FLASH5 (sirf Flash Activation): Buy 1 Get 4 Free. $5 mein 1 challenge lo, 4 accounts free - total 5. Free = challenge fees, activation nahi. Pass ke baad har account ki alag activation fee size ke hisaab se deni hoti hai (exact fee invent nahi). Flash pe SEP35 use mat karo.'
 : 'FLASH5 (Flash Activation only): Buy 1 Get 4 Free. Pay $5 for 1 challenge and get 4 more free (5 total). Free covers challenge fees, not activation. After passing, each account needs a separate activation fee by size (we do not invent fee amounts). Never use SEP35 for Flash.';
 }

 if (product === 'instant_elite') {
 const size = detectInstantEliteSize(question);
 if (!size) {
 return urdu
 ? 'Instant Elite pe SEP35: 50k/100k/200k = 35% off, 300k/400k = 50% off. Weekly payout addon sab sizes pe pre-applied. Kaunsa size chahiye?'
 : 'Instant Elite with SEP35: 50k/100k/200k = 35% off; 300k/400k = 50% off. Weekly payout addon is pre-applied on all sizes. Which size are you looking at?';
 }
 const pct = FUNDEDELITE_SEPTEMBER_PROMOS.instantEliteBySize[size].percentOff;
 return urdu
 ? `Instant Elite ${size}: SEP35 se ${pct}% discount + weekly payout addon (pre-applied).`
 : `Instant Elite ${size}: ${pct}% off with SEP35 + weekly payout addon (pre-applied).`;
 }

 if (product === '1_step_family') return sep35FamilyReply('1-Step', urdu);
 if (product === '2_step_family') return sep35FamilyReply('2-Step', urdu);
 if (product === 'family_both') {
 return sep35FamilyReply('2-Step', urdu);
 }

 if (product === '1_step_free_retry') return sep35FlatReply('1-Step Free Retry', urdu);
 if (product === '1_step_lite') return sep35FlatReply('1-Step Lite', urdu);
 if (product === '2_step_free_retry') return sep35FlatReply('2-Step Free Retry', urdu);
 if (product === '2_step_lite') return sep35FlatReply('2-Step Lite', urdu);
 if (product === 'instant') return sep35InstantOnly(urdu);

 if (product === 'new50') {
 if (isExistingCustomer(question)) {
 return urdu
 ? 'NEW50 sirf brand-new clients ke liye hai jo pehle kabhi purchase nahi kiye - existing customers ke liye apply nahi hota.'
 : 'NEW50 is only for brand-new clients who have never purchased before - it does not apply to existing customers.';
 }
 return urdu
 ? 'NEW50 sirf brand-new clients ke liye hai (pehle kabhi purchase na kiya ho). Ye expire nahi hota.'
 : 'NEW50 is only for brand-new clients who have never purchased before. It never expires.';
 }

 if (product === 'weekly_payout') {
 return urdu
 ? 'SEP35 wali eligible challenges pe weekly payout addon pehle se apply hota hai; payout 7 din baad request kar sakte ho (account rules ke mutabiq). Alag se add karne ki zarurat nahi.'
 : 'On SEP35-eligible challenges, the weekly payout addon is pre-applied; payout can be requested after 7 days, subject to account rules. You do not need to add it separately.';
 }

 if (product === 'bulk') {
 return bulkNaturalReply(question, urdu);
 }

 return urdu
 ? 'Haan - SEP35 (eligible challenges pe discount + weekly payout), FLASH5 (Flash Activation), NEW50 (sirf brand-new clients). Kaunsi challenge pooch rahe ho?'
 : 'Yes - SEP35 (discount + weekly payout on eligible challenges), FLASH5 (Flash Activation), NEW50 (brand-new clients only). Which challenge are you asking about?';
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
 ? `Instant Elite ${intent.size}: SEP35 se ${pct}% discount + weekly payout addon (pre-applied).`
 : `Instant Elite ${intent.size}: ${pct}% off with SEP35 + weekly payout addon (pre-applied).`;
 }

 return replyForProduct(product, qForReply, urdu);
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
 detectInstantEliteSize,
 isPromoSignal,
 isExplicitRulesRequest,
 isPlanDifferenceOrFeaturesAsk,
 historyLooksLikePlanDifference,
 historyLooksLikePromotions,
 isShortPromoFollowUp,
 sep35FamilyReply,
 sep35FlatReply,
 bulkNaturalReply,
 wantsBulkExample,
 prefersRomanUrdu,
 };
}
