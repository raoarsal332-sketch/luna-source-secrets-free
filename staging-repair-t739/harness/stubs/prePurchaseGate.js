'use strict';

/**
 * PREPURCHASE_ACCOUNT_V1
 * A pre-purchase or hypothetical policy question is not an existing trading account.
 * Live incidents (breach review, stuck payout, a concrete login) still require one.
 * Does not read knowledge, prompts, or the network.
 */

function norm(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripMoney(text) {
  return norm(text)
    .replace(/(?:USD|EUR|GBP|USDT|\$)\s*[+-]?\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/gi, ' ')
    .replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b/g, ' ')
    .replace(/(?<![A-Za-z0-9])\d{1,6}\.\d{2}(?![0-9])/g, ' ');
}

function hasConcreteTradingAccountId(text) {
  const t = stripMoney(text);
  if (/\b(?:account|acct|acc|login|mt[45])\s*(?:number|no\.?|#|id)?\s*[:#-]?\s*\d{5,12}\b/i.test(t)) return true;
  if (/\b(?:my|this)\s+account\s*(?:is|:)?\s*\d{5,12}\b/i.test(t)) return true;
  return false;
}

function isStaffActionRequest(text) {
  const t = norm(text);
  const verb = '(?:reset|check|review|refund|close|fix|restore|approve|investigate)';
  if (new RegExp('\\b(?:can|could|would|will)\\s+(?:you|u|someone|the\\s+team|your\\s+team)\\b[^.?!]{0,40}\\b' + verb + '\\b', 'i').test(t)) return true;
  if (new RegExp('\\bplease\\b[^.?!]{0,48}\\b' + verb + '\\b', 'i').test(t)) return true;
  if (/\b(?:reset|check|review|investigate)\s+my\s+(?:account|payout|withdrawal|trade)\b/i.test(t)) return true;
  return false;
}

function isAccountStaffAction(text) {
  const t = norm(text);
  if (!isStaffActionRequest(t)) return false;
  if (hasConcreteTradingAccountId(t)) return true;
  return /\b(?:my|this)\s+(?:account|payout|withdrawal|trade|position)\b/i.test(t);
}

/** This client's own account already needs a human to open it. */
function isLiveAccountIncident(text) {
  const t = norm(text);
  if (!t) return false;
  if (isAccountStaffAction(t)) return true;
  if (isPrePurchaseSignal(t) && !hasConcreteTradingAccountId(t) && !reportedIncident(t)) return false;
  return reportedIncident(t) || hasConcreteTradingAccountId(t);
}

/** "If my payout is pending, will the reset forfeit..." is a rule question, not a live payout. */
function isConditionalPolicyStatus(text) {
  const t = norm(text);
  if (!t || isStaffActionRequest(t) || hasConcreteTradingAccountId(t)) return false;
  if (!/\b(?:if|when)\s+my\s+(?:payout|withdrawal)\b/i.test(t)) return false;
  if (!/\b(?:reset|what\s+happens|forfeit|preserved|eligib|affect|phase\s*1|funded\s+status|restart)\b/i.test(t)) return false;
  return true;
}

function reportedIncident(text) {
  const t = norm(text);
  if (!t) return false;
  if (isConditionalPolicyStatus(t)) return false;
  if (/\b(?:i\s+was|i'?ve\s+been|i\s+am|i'?m|got|been)\s+breached\b/i.test(t)) return true;
  if (/\b(?:i\s+)?(?:got|have|had|received)\s+(?:a\s+|an\s+)?(?:soft\s+)?breach\b/i.test(t) &&
      !/\bif\s+i\s+(?:got|have|had|received)\s+(?:a\s+|an\s+)?(?:soft\s+)?breach\b/i.test(t)) return true;
  if (/\bmy\s+(?:account|dashboard)\s+(?:shows|is|was|got|has|have|showed)\s+(?:a\s+|an\s+)?(?:soft\s+)?(?:breach(?:ed)?|disabled|banned|flagged|closed|terminated)\b/i.test(t)) return true;
  if (/\bmy\s+dashboard\s+(?:shows|showed|is\s+showing)\b/i.test(t) && /\bbreach/i.test(t)) return true;
  if (/\b(?:did|does)\s+(?:the|my|this|a)\s+(?:soft\s+)?breach\b/i.test(t)) return true;
  if (/\bmy\s+(?:payout|withdrawal)\s+(?:is|was)?\s*(?:still\s+)?not\s+(?:approved|paid|processed)\b/i.test(t)) return true;
  if (/\bnot\s+eligible\s+for\s+(?:a\s+)?(?:payout|withdrawal)\b/i.test(t) &&
      !/\b(?:if|when)\b[^.]{0,48}\bnot\s+eligible\s+for\s+(?:a\s+)?(?:payout|withdrawal)\b/i.test(t)) return true;
  if (/\bwhy\s+(?:was|is|did)\s+my\b/i.test(t)) return true;
  if (/\bmy\s+(?:payout|withdrawal)\s+(?:was|is|got|has\s+been|have\s+been)?\s*(?:still\s+)?(?:rejected|denied|delayed|stuck|pending|missing|failed)\b/i.test(t)) return true;
  if (/\b(?:payout|withdrawal)\s+(?:is\s+)?(?:stuck|pending|missing|rejected|denied)\b/i.test(t) && /\b(?:my|mine)\b/i.test(t)) return true;
  if (/\b(?:check|review)\s+my\s+(?:account|balance|payout|trade|position)\b/i.test(t) &&
      !/\bhow\s+(?:do|can|should|would)\s+i\b|\bhow\s+to\b/i.test(t)) return true;
  if (/\b(?:can(?:not|'?t)|unable|not\s+able)\b[\s\S]{0,40}\b(?:log\s*in|login|sign\s*in)\b/i.test(t)) return true;
  if (/\b(?:my\s+)?profits?\s+(?:are|were|is)\s+(?:missing|gone)\b/i.test(t)) return true;
  if (/\b(?:already|just)\s+(?:paid\s+for\s+)?(?:a\s+)?reset\b/i.test(t) && /\b(?:missing|gone|wrong|not\s+there|didn'?t)\b/i.test(t)) return true;
  return false;
}

function isPrePurchaseSignal(text) {
  const t = norm(text);
  if (!t) return false;
  if (/\b(?:don'?t|do\s+not|dont)\s+want\s+to\s+(?:buy|purchase)\b/i.test(t) && !/\b(?:before|considering|haven'?t|no\s+account)\b/i.test(t)) return false;
  if (/\b(?:before|prior\s+to)\s+(?:i\s+)?(?:purchas\w*|buy\w*|buying|order\w*)\b/i.test(t)) return true;
  if (/\b(?:considering|thinking\s+(?:about|of)|planning\s+to|looking\s+to|about\s+to)\s+(?:purchas\w*|buy\w*|(?:get(?:ting)?|start(?:ing)?)\s+(?:a|the|your)\s+(?:challenge|account|funded|plan))\b/i.test(t)) return true;
  if (/\b(?:want\s+to|wanna|going\s+to|i\s+want\s+to)\s+(?:purchas\w*|buy\w*)\b/i.test(t)) return true;
  if (/\bi\s+want\s+to\s+buy\b/i.test(t)) return true;
  if (/\b(?:haven'?t|have\s+not|not\s+yet|still\s+haven'?t)\s+(?:purchased|bought|ordered|opened)\b/i.test(t)) return true;
  if (/\b(?:pre[-\s]?purchase|not\s+a\s+customer\s+yet)\b/i.test(t)) return true;
  if (/\bno\s+(?:trading\s+)?account(?:\s+number)?\s+yet\b/i.test(t)) return true;
  if (/\b(?:don'?t|do\s+not|dont)\s+have\s+(?:an?\s+|any\s+)?(?:trading\s+)?account\b/i.test(t)) return true;
  if (/\b(?:don'?t|do\s+not|dont)\s+have\s+(?:one|any)\b/i.test(t) && /\b(?:buy|purchas|account|challenge)\b/i.test(t)) return true;
  // Roman Urdu / Hindi (Latin)
  if (/\b(?:mera|meri|mere)\s+(?:paas\s+)?(?:koi\s+)?(?:trading\s+)?(?:account|akaun?t|khata)\s+(?:number\s+|nambar\s+)?(?:nahi|nahin|nai|nhi)\b/i.test(t)) return true;
  if (/\b(?:account|akaun?t)\s+(?:number\s+|nambar\s+)?(?:nahi|nahin|nai|nhi)\s+hai\b/i.test(t)) return true;
  if (/\b(?:abhi\s+)?(?:nahi|nahin|nai)\s+(?:kharida|khareeda|liya|khareed[ae])\b/i.test(t)) return true;
  if (/\b(?:kharidna|khareedna|khareedne)\b/i.test(t)) return true;
  if (/\bbuy\s+karna\s+hai\b/i.test(t)) return true;
  // Spanish, French, Dutch
  if (/\bno\s+tengo\s+(?:una?\s+|el\s+)?(?:n[uú]mero\s+de\s+)?cuenta\b/i.test(t)) return true;
  if (/\bantes\s+de\s+comprar\b/i.test(t) || /\bquiero\s+comprar\b/i.test(t) || /\btodav[ií]a\s+no\s+(?:compro|he\s+comprado|tengo)\b/i.test(t)) return true;
  if (/\bje\s+n['']?ai\s+pas\s+(?:encore\s+)?(?:de\s+)?(?:compte|num[eé]ro)\b/i.test(t)) return true;
  if (/\bavant\s+d['']?acheter\b/i.test(t) || /\bje\s+veux\s+acheter\b/i.test(t) || /\bpas\s+encore\s+achet/i.test(t)) return true;
  if (/\bik\s+heb\s+(?:nog\s+)?geen\s+(?:account|handelsaccount|rekening)\b/i.test(t)) return true;
  if (/\bvoordat\s+ik\b[^.?!]{0,24}\bkoop\b/i.test(t) || /\bik\s+wil\b[^.?!]{0,24}\bkopen\b/i.test(t)) return true;
  // Arabic, Hindi, Urdu script
  if (/ليس لدي(?:\s+\S+){0,3}\s*حساب|ما عندي حساب|قبل الشراء|قبل أن أشتري|قبل ان اشتري|أريد أن أشتري|اريد ان اشتري|أبي أشتري|ابغى اشتري/.test(t)) return true;
  if (/अकाउंट नहीं|अकाउंट नंबर नहीं|खाता नहीं|खरीदना चाह|खरीदने से पहले|खरीदने वाला/.test(t)) return true;
  if (/اکاؤنٹ نہیں|اکاؤنٹ نمبر نہیں|خریدنے سے پہلے|خریدنا چاہ/.test(t)) return true;
  return false;
}

function clientDeclinedAccount(text) {
  const t = norm(text);
  if (!t) return false;
  if (isPrePurchaseSignal(t)) return true;
  if (/\b(?:don'?t|do\s+not|dont)\s+have\s+one\b/i.test(t)) {
    const words = t.split(/\s+/).filter(Boolean).length;
    if (words <= 12) return true;
  }
  if (/\b(?:no|none)\b/i.test(t) && /\baccount\s*(?:number|no\.?|#)?\b/i.test(t) && t.split(/\s+/).length <= 14) return true;
  return false;
}

function isGeneralProcessQuestion(text) {
  const t = norm(text);
  if (!t || isStaffActionRequest(t) || reportedIncident(t) || hasConcreteTradingAccountId(t)) return false;
  // "is a risk interview necessary, or only in special cases" is not a special-arrangement request.
  if (/\b(?:interview|risk\s+team)\b/i.test(t) && /\b(?:necessary|required|mandatory|special\s+cases?)\b/i.test(t) &&
      !/\bmy\s+(?:interview|payout|account)\b/i.test(t)) return true;
  return false;
}

function isHypotheticalPolicyAsk(text) {
  const t = norm(text);
  if (!t || reportedIncident(t) || hasConcreteTradingAccountId(t) || isStaffActionRequest(t)) return false;
  const question = /\?/.test(t) || /\b(?:what|how|does|do|is|are|will|would|can|could|if)\b/i.test(t);
  if (!question) return false;
  const policy = /\b(?:strategy\s*risk|risk\s+rule|risk\s+limit|soft\s*breach|reset|drawdown|profit\s+target|payout\s+eligibility|funded\s+status|consistency|profit\s+split|phase\s*1)\b/i.test(t);
  if (!policy) return false;
  const frame = /\b(?:if|when|after)\s+i\b/i.test(t) ||
    /\bwhat\s+(?:exactly\s+)?happens\b/i.test(t) ||
    /\b(?:are|is)\s+(?:my|the|they|it)\b/i.test(t) ||
    /\bdoes\s+(?:my|the|a|an|it)\b/i.test(t) ||
    /\bwill\s+(?:the|my|a|an|it|i)\b/i.test(t) ||
    /\b(?:preserved|forfeited|restored|restart)\b/i.test(t) ||
    /\bif\s+i\s+(?:breach|hit|violate|pay|reset)\b/i.test(t);
  return frame;
}

function exemptFromAccountIdentity(text) {
  const t = norm(text);
  if (!t || reportedIncident(t) || hasConcreteTradingAccountId(t) || isAccountStaffAction(t)) return false;
  if (isStaffActionRequest(t) && !isPrePurchaseSignal(t)) return false;
  if (isPrePurchaseSignal(t) && !reportedIncident(t)) return true;
  if (isHypotheticalPolicyAsk(t)) return true;
  if (isGeneralProcessQuestion(t)) return true;
  return false;
}

function threadHasLiveAccountWork(texts) {
  return (Array.isArray(texts) ? texts : []).some((t) => reportedIncident(t) || hasConcreteTradingAccountId(t));
}

function threadIsPrePurchase(texts) {
  const list = Array.isArray(texts) ? texts : [];
  if (threadHasLiveAccountWork(list)) return false;
  return list.some((t) => isPrePurchaseSignal(t) || clientDeclinedAccount(t));
}

/**
 * True when this turn must not ask for, or hold on, a trading account number.
 * A later live incident re-opens the requirement even after an earlier "I have no account".
 */
function skipTradingAccountIdentity(texts, latestText) {
  const list = Array.isArray(texts) ? texts.map(norm).filter(Boolean) : [];
  const latest = norm(latestText || (list.length ? list[list.length - 1] : ''));
  if (!latest && !list.length) return false;
  if (reportedIncident(latest) || hasConcreteTradingAccountId(latest)) return false;
  if (exemptFromAccountIdentity(latest)) return true;
  if (threadIsPrePurchase(list.length ? list : [latest])) return true;
  return false;
}

module.exports = {
  norm,
  hasConcreteTradingAccountId,
  isLiveAccountIncident,
  isPrePurchaseSignal,
  clientDeclinedAccount,
  exemptFromAccountIdentity,
  threadHasLiveAccountWork,
  threadIsPrePurchase,
  skipTradingAccountIdentity,
};
