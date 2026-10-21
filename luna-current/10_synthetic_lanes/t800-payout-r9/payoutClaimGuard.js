'use strict';

/**
 * T800 payout claim guard R9 — frozen synthetic candidate. Not approved.
 *
 * Deny-by-default for outcome claims. A sentence that asserts an outcome about
 * Strategy Risk breach consequences, reset eligibility, previous-cycle profit,
 * payout reversal or completion, reset price, or a payout-method amount limit
 * is sent only when it matches an approved statement. Approved statements are
 * the owner-final rules plus the Help Centre facts named for this pass.
 * Anything else in those domains is replaced with the visible hedge, in every
 * language whose topic anchor this module can see.
 *
 * Owner-final (they override the Help Centre where they differ):
 *   - A funded Strategy Risk breach is a soft breach with a reset, never termination.
 *   - A funded reset is allowed only at breakeven or in profit, never in drawdown.
 *   - Previous-cycle profit is not payable after a reset.
 *   - Completed payouts are not reversed.
 *
 * The current official Help Centre (faq.fundedelite.com) is the primary
 * public-policy reference. The repo FAQ file is secondary. Owner-final
 * exceptions still override both where they differ.
 *
 * Help Centre facts used as approved statements, not as a block list:
 *   - 17437398 soft-breach payout still processed at a 30% profit split.
 *   - 17437285 one-instrument risk is 50% of the daily loss limit (1.5% when that is the half).
 *   - 17437410 first reset fee is 40% of the original challenge cost, minimum $10.
 *   - 17437354 how you are paid: Rise is for withdrawals of $500 or more at $40;
 *     crypto (USDC) is any amount, the only method below $500, at 3%.
 *   - Weekend holding is allowed and is not termination. Weekend trading is a different outcome.
 *
 * Still unresolved, so those claims stay hedged:
 *   Catalyst stage-reset, either direction.
 *
 * Not applied to index.js. The proposed hook is index.js.public-sends.diff.
 * 01_runtime/statePresend is absent; this module does not require it.
 */

const STATUS = Object.freeze({
  candidate: 't800-payout-r9',
  frozen: true,
  approved: false,
  release: false,
});

const CLIENT_MESSAGE = "I can't confirm that. Our team will confirm.";

const FALLBACK_HEDGE_RE = /\b(?:i(?:'m| am) not (?:100% )?sure|i (?:will|'ll) (?:check|confirm)|let me (?:check|confirm)|our team will confirm|i cannot confirm|i can't confirm|to be confirmed|i don't have that information|i do not have that information)\b/i;

const APPROVED = Object.freeze({
  strategyRisk: 'soft_breach_with_reset',
  resetCondition: 'breakeven_or_profit',
  previousCycleProfit: 'not_payable',
  completedPayout: 'not_reversed',
  softBreachSplit: '30%',
  halfDailyLoss: '1.5%',
  resetFeePercent: 40,
  resetFeeMinimumUsd: 10,
  riseMinimumUsd: 500,
  riseFeeUsd: 40,
  cryptoFeePercent: 3,
  cryptoOnlyBelowUsd: 500,
  articles: Object.freeze({
    softBreachPayout: '17437398',
    halfDailyLoss: '17437285',
    resetFee: '17437410',
    payoutMethod: '17437354',
  }),
});

function resolveHedgePattern(load) {
  try {
    const gap = load();
    if (gap && gap.HEDGE_RE instanceof RegExp) return { re: gap.HEDGE_RE, source: 'knowledgeGapGate' };
  } catch (e) {
    // statePresend directory is absent, or the module failed to load.
  }
  return { re: FALLBACK_HEDGE_RE, source: 'fallback' };
}

const hedgePattern = resolveHedgePattern(() => require('../../02_statePresend/knowledgeGapGate'));
const HEDGE_RE = hedgePattern.re;

function sentences(text) {
  return String(text || '')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?؟।۔])\s+/))
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function clip(text) {
  return String(text || '').replace(/[.!?؟।۔]+\s*$/g, '').replace(/\s+/g, ' ').trim();
}

function ok(reason, family) {
  return { approved: true, reason, family: family || reason, text: '' };
}

function bad(reason, family, extra) {
  return Object.assign({ approved: false, reason, family: family || reason, text: '', confirmable: false }, extra || {});
}

function isHedgeSentence(sentence) {
  return HEDGE_RE.test(String(sentence || ''));
}

function declaresOutcome(text) {
  return /\b(?:can\s+be\s+reset|cannot\s+be\s+reset|is\s+allowed|is\s+not\s+allowed|was\s+(?:paid|sent|processed|reversed|cancelled|canceled)|were\s+(?:paid|sent|processed)|has\s+been|have\s+been|fee\s+is|minimum\s+is|profit\s+is|will\s+be\s+paid|is\s+payable|is\s+not\s+payable)\b/i.test(text)
    || /\b(?:you|the\s+account|it|reset|payout|profit)\b[^.]{0,48}\b(?:is|are|was|were|will|can)\b/i.test(text);
}

function isPureQuestion(sentence) {
  const s = String(sentence || '').trim();
  const afterMark = s.split(/[?؟]/).slice(1).join(' ').trim();
  if (afterMark && declaresOutcome(afterMark)) return false;
  const interrogative = /[?؟]\s*$/.test(s)
    || /^(?:how|what|when|where|why|which|whose|can|could|may|might|should|would|do|does|did|is|are|was|were|have|has|क्या|کیا|هل|можно|как)\b/i.test(s);
  if (!interrogative) return false;
  if (/^(?:do|does|did)\s+not\b/i.test(s)) return false;
  const tails = s.split(/[,;:]|\b(?:and|but)\b/i).slice(1).join(' ');
  if (tails && declaresOutcome(tails)) return false;
  return true;
}

function strategyRiskDomain(sentence) {
  return /\bstrategy\s+risk\b/i.test(sentence)
    || /riesgo\s+de\s+estrategia|risque\s+de\s+strat[eé]gie|rischio\s+di\s+strategia|стратег\w*\s+риск/i.test(sentence)
    || /स्ट्र(?:ै|े)टजी\s*रिस्क|रणनीति\s*जोखिम/.test(sentence)
    || /سٹریٹیجی\s*رسک|مخاطر\s+الاستراتيج/.test(sentence);
}

function stripNegatedEndings(sentence) {
  return String(sentence || '')
    .replace(/\bend\s+of\s+(?:the\s+)?(?:day|week|month|cycle|payout)\b/ig, ' ')
    .replace(/\b(?:at|in)\s+the\s+end\b/ig, ' ')
    .replace(/\b(?:does\s+not|do\s+not|did\s+not|will\s+not|won't|cannot|can't|never|not|n't)\s+(?:\w+\s+){0,4}?(?:terminat\w*|clos(?:e|es|ed|ing|ure)|end(?:s|ed|ing)?|kill\w*|shut(?:ting)?\s+down|stop(?:s|ped)?|discontinu\w*)\b/ig, ' ')
    .replace(/\b(?:not|never|no|without)\s+(?:being\s+)?(?:a\s+)?(?:termination|closure|ending|shutdown)\b/ig, ' ')
    .replace(/\b(?:is|are|was|were)\s+not\s+(?:being\s+)?(?:a\s+)?(?:termination|closure)\b/ig, ' ');
}

function affirmsAccountEnd(sentence) {
  const stripped = stripNegatedEndings(sentence);
  if (/\b(?:terminat\w*|account\s+closure|closure|shut(?:s|ting)?\s+down|shutdown|kills?|killed|killing|discontinu\w*)\b/i.test(stripped)) return true;
  if (/\bclos(?:e|es|ed|ing)\s+(?:the\s+|your\s+|a\s+)?(?:funded\s+)?account\b/i.test(stripped)) return true;
  if (/\b(?:funded\s+)?account\s+(?:is|was|will\s+be|gets?|get)\s+clos(?:e|ed|ing|ure)\b/i.test(stripped)) return true;
  if (/\b(?:ends|ended|ending)\s+(?:the\s+|your\s+|a\s+)?(?:funded\s+)?account\b/i.test(stripped)) return true;
  if (/\b(?:ends|ended)\s+(?:it|this)\b/i.test(stripped)) return true;
  if (/\b(?:funded\s+)?account\s+(?:ends|ended)\b/i.test(stripped)) return true;
  if (/\b(?:it|this)\s+ends\b/i.test(stripped)) return true;
  if (/\b(?:does\s+not|do\s+not|will\s+not|won't|no\s+longer)\s+continues?\b/i.test(stripped)) return true;
  if (/\b(?:abolish\w*|suspend\w*|deactivat\w*|liquidat\w*|wipes?|wiped)\s+(?:the\s+|your\s+|a\s+)?(?:funded\s+)?(?:account|trading)\b/i.test(stripped)) return true;
  if (strategyRiskDomain(sentence) && /बंद|समाप्त|खत्म|ختم|بند|إغلاق|اغلاق|ينتهي|cierra|cierre|ferme|chiude|encerra|fecha|закрыва|прекращ|ликвида/i.test(stripped)) return true;
  return false;
}

function deniesAccountEnd(sentence) {
  return /\b(?:does\s+not|do\s+not|will\s+not|won't|cannot|can't|never|not|n't)\s+(?:\w+\s+){0,4}?(?:terminat\w*|clos(?:e|es|ed|ing|ure)|end(?:s|ed|ing)?|kill\w*|shut\s+down|stop)\b/i.test(sentence)
    || /\b(?:not|never|no|without)\s+(?:being\s+)?(?:a\s+)?(?:termination|closure|ending|shutdown)\b/i.test(sentence)
    || /\b(?:is|are|was|were)\s+not\s+(?:being\s+)?(?:a\s+)?(?:termination|closure)\b/i.test(sentence)
    || /\baccount\s+(?:stays|remains)\s+open\b/i.test(sentence)
    || /\b(?:continues?|stays)\s+open\b/i.test(sentence);
}

function resetDenied(sentence) {
  return /\b(?:no|without)\s+(?:a\s+)?reset\b(?!\s+fee)/i.test(sentence)
    || /\b(?:cannot|can't|will\s+not|won't)\s+(?:be\s+)?reset\b/i.test(sentence)
    || /\bnot\s+be\s+reset\b/i.test(sentence);
}

function approvedStrategyRisk(sentence) {
  if (affirmsAccountEnd(sentence) || resetDenied(sentence)) return false;
  const soft = /\bsoft\s+breach\b/i.test(sentence) || /सॉफ्ट\s*ब्रीच|سوفٹ\s*بریچ/.test(sentence);
  const resetWord = /\breset\b/i.test(sentence) || /रीसेट|ری\s?سيٹ|ری\s?سیٹ|إعادة\s+تعيين/.test(sentence);
  if (soft && !resetDenied(sentence)) return true;
  if (deniesAccountEnd(sentence)) return true;
  if (resetWord && (soft || deniesAccountEnd(sentence))) return true;
  return false;
}

function assertsStrategyConsequence(sentence) {
  if (affirmsAccountEnd(sentence) || resetDenied(sentence)) return true;
  if (/\bhard\s+breach\b/i.test(sentence)) return true;
  if (/\b(?:result\w*|caus\w*|means?|leads?\s+to|outcome|consequence|happens?)\b/i.test(sentence)) return true;
  if (/\b(?:will|won't|cannot|can't|may|might)\b/i.test(sentence) && /\b(?:account|funded|trader|reset|payout|closure|termination)\b/i.test(sentence)) return true;
  if (/\b(?:soft|hard)\s+breach\b/i.test(sentence) || /\breset\b/i.test(sentence)) return true;
  return false;
}

function judgeStrategyRisk(sentence) {
  if (!strategyRiskDomain(sentence)) return null;
  if (affirmsAccountEnd(sentence) || resetDenied(sentence)) return bad('strategy_risk_outcome', 'soft_breach');
  if (matchesHalfDailyLoss(sentence)) return ok('help_centre_17437285', 'strategy_risk');
  if (isResetPriceSentence(sentence) && approvedResetPrice(sentence)) return null;
  if (matchesSoftBreachPayout(sentence)) return null;
  if (approvedResetCondition(sentence)) return ok('owner_rule', 'funded_reset');
  if (approvedStrategyRisk(sentence)) return ok('owner_rule', 'soft_breach');
  if (assertsStrategyConsequence(sentence)) return bad('strategy_risk_outcome', 'soft_breach');
  return null;
}

function percentValues(sentence) {
  const values = [];
  const re = /(\d+(?:\.\d+)?)\s*(?:%|percent\b)/gi;
  let match;
  while ((match = re.exec(sentence))) values.push(Number(match[1]));
  return values;
}

function mentionsHalfOfDailyLoss(sentence) {
  const half = /\b50\s*%|\b50\s*percent\b|\bhalf\b/i.test(sentence);
  const daily = /\bdaily\s+(?:loss|drawdown)\b|\bdll\b/i.test(sentence);
  return half && daily;
}

function matchesHalfDailyLoss(sentence) {
  if (!mentionsHalfOfDailyLoss(sentence)) return false;
  if (affirmsAccountEnd(sentence) && strategyRiskDomain(sentence)) return false;
  const extras = percentValues(sentence).filter((n) => n !== 50);
  if (extras.length === 1 && extras[0] === 1.5) return true;
  if (extras.includes(5) && extras.includes(2.5) && extras.every((n) => n === 5 || n === 2.5)) return true;
  if (extras.length === 0 && /\b(?:cannot|can't|must\s+not|no\s+more\s+than|not\s+more\s+than|limited\s+to|at\s+most|prohibited|maximum)\b/i.test(sentence)) return true;
  return false;
}

function judgeHalfDailyLoss(sentence) {
  if (!mentionsHalfOfDailyLoss(sentence)) return null;
  if (strategyRiskDomain(sentence) && affirmsAccountEnd(sentence)) return bad('strategy_risk_outcome', 'strategy_risk');
  if (matchesHalfDailyLoss(sentence)) return ok('help_centre_17437285', 'strategy_risk');
  return bad('strategy_risk_outcome', 'strategy_risk');
}

function matchesSoftBreachPayout(sentence) {
  if (!/\bsoft\s+breach\b/i.test(sentence)) return false;
  if (affirmsAccountEnd(sentence)) return false;
  const thirty = /\b30\s*%|\b30\s*percent\b/i.test(sentence);
  const payout = /\b(?:profit\s*)?split\b|\bpayout\b/i.test(sentence);
  return thirty && payout;
}

function isDrawdownClock(sentence) {
  return /\b(?:drawdown|loss)\s+limit\b|\b(?:trailing|static)\s+drawdown\b/i.test(sentence)
    && /\breset\b/i.test(sentence)
    && !/\b(?:can|may|allowed|able|eligible)\b/i.test(sentence)
    && !/\baccount\s+(?:can|cannot|can't)\b/i.test(sentence);
}

function lossCondition(sentence) {
  return /\b(?:los(?:e|ing|es|t)|losses|negative|open\s+loss|below\s+(?:the\s+)?(?:starting|initial)\s+balance|in\s+(?:a\s+)?drawdown|under\s*water|in\s+the\s+red|at\s+a\s+loss|deficit|in\s+minus)\b/i.test(sentence)
    || /p[eé]rdid[ao]|en\s+p[eé]rdida|pierde|perte|perdita|perda|убыт/i.test(sentence)
    || /घाट|नुकसान|नकारात्मक|लॉस|نقصان|گھاٹا|خسار/.test(sentence);
}

function grantsReset(sentence) {
  if (/\b(?:cannot|can't|won't|will\s+not|never|do\s+not|don't|not\s+allowed(?:\s+to)?|unable\s+to)\s+(?:be\s+)?reset\b/i.test(sentence)) return false;
  if (/\bnot\s+be\s+reset\b/i.test(sentence)) return false;
  return /\b(?:can|may|allowed\s+to|able\s+to|eligible\s+to)\s+(?:be\s+)?reset\b/i.test(sentence)
    || /\bcan\s+be\s+reset\b/i.test(sentence)
    || /\bbe\s+reset\b/i.test(sentence)
    || /\beligible\s+for\s+(?:a\s+)?reset\b/i.test(sentence)
    || /\breset(?:table)?\b/i.test(sentence) && /\b(?:offered|granted)\b/i.test(sentence)
    || /\breset\s+(?:is|are|gets)\s+(?:allowed|possible|available|eligible|offered|granted)\b/i.test(sentence)
    || ((/\breset\w*/i.test(sentence) || /रीसेट|ری\s?سیٹ|إعادة\s+تعيين|сброс/.test(sentence))
      && /सकता|सकती|يمكن|можно|pued(?:e|es|en)|puoi|pouvez/i.test(sentence));
}

function lossIsNegated(sentence) {
  return /\b(?:not|never|except|unless)\b(?:\s+\w+){0,4}\s+(?:los(?:e|ing|es|t)|losses|negative|open\s+loss|below\s+(?:the\s+)?(?:starting|initial)\s+balance|in\s+(?:a\s+)?drawdown|under\s*water|in\s+the\s+red|at\s+a\s+loss)\b/i.test(sentence);
}

function approvedResetCondition(sentence) {
  const good = /\b(?:only\s+)?(?:at|when|once|if)\s+(?:break\s*even|breakeven|profit)\b/i.test(sentence)
    || /\b(?:break\s*even|breakeven)\s+or\s+(?:in\s+)?profit\b/i.test(sentence)
    || /\bin\s+profit\s+or\s+(?:at\s+)?(?:break\s*even|breakeven)\b/i.test(sentence)
    || /\bonly\s+(?:at|when|in)\s+(?:break\s*even|breakeven|profit)\b/i.test(sentence)
    || /\b(?:break\s*even|breakeven|in\s+profit)\s+only\b/i.test(sentence);
  const denies = /\b(?:cannot|can't|won't|will\s+not|never|do\s+not|don't|not\s+allowed|unable)\b/i.test(sentence)
    || /\bnot\s+be\s+reset\b/i.test(sentence);
  if (grantsReset(sentence) && lossCondition(sentence) && !lossIsNegated(sentence)) return false;
  if (good && (!lossCondition(sentence) || lossIsNegated(sentence))) return true;
  if (denies && lossCondition(sentence) && !grantsReset(sentence)) return true;
  return false;
}

function isResetEligibilitySentence(sentence) {
  if (isDrawdownClock(sentence)) return false;
  const reset = /\breset\w*/i.test(sentence) || /रीसेट|ری\s?سیٹ|إعادة\s+تعيين|сброس/.test(sentence);
  if (!reset) return false;
  return grantsReset(sentence)
    || /\b(?:cannot|can't|not\s+allowed|eligible|eligibility)\b/i.test(sentence)
    || lossCondition(sentence)
    || /\b(?:break\s*even|breakeven|in\s+profit)\b/i.test(sentence);
}

function judgeResetEligibility(sentence) {
  if (!isResetEligibilitySentence(sentence)) return null;
  if (approvedResetCondition(sentence)) return ok('owner_rule', 'funded_reset');
  return bad('reset_condition', 'funded_reset');
}

function previousProfitDomain(sentence) {
  const latin = /\b(?:previous|prior|last|earlier|pichl[ae]|puran[ae]|pehle|anterior|previo|pr[eé]c[eé]dent|precedente|vorherig)\b/i.test(sentence)
    && /\b(?:profits?|munafa|nafa|beneficios?|b[eé]n[eé]fices?|guadagn\w*|lucros?)\b/i.test(sentence);
  const cyrillic = /предыдущ|прошл/i.test(sentence) && /прибыл|профит/i.test(sentence);
  const hindi = /पिछल[ेाा]|पूर्व/.test(sentence) && /लाभ|प्रॉफिट|मुनाफा|नफा/.test(sentence);
  const urdu = /پچھل[ےا]|سابقہ/.test(sentence) && /منافع|نفع|پرافٹ/.test(sentence);
  const arabic = /السابق(?:ة)?/.test(sentence) && /(?:ربح|أرباح|ارباح)/.test(sentence);
  return latin || cyrillic || hindi || urdu || arabic;
}

function previousProfitDenied(sentence) {
  if (/\bforfeit/i.test(sentence)) return true;
  if (/\b(?:not|never|no\s+longer)\s+(?:be\s+)?(?:payable|paid|a\s+payout|owed|due|withdrawn|included|counted|available|eligible)\b/i.test(sentence)) return true;
  if (/\b(?:won't|will\s+not|cannot|can't|is\s+not|are\s+not)\s+(?:be\s+)?(?:paid|payable|withdrawn|included|available)\b/i.test(sentence)) return true;
  if (/\b(?:profits?|munafa|nafa)\s+(?:is|are|hai)?\s*(?:not|nahi|nahin|nai)\b/i.test(sentence)) return true;
  if (/\b(?:nahi|nahin|nai)\s+(?:hai|he|payable|paid|milega|milta|milti)\b/i.test(sentence)) return true;
  if (/नहीं|نہیں|نهیں/.test(sentence)) return true;
  if (/(?:غير|ليس|لن|(?:^|[\s،])لا(?:[\s،]|$))/.test(sentence) && /(?:ربح|أرباح|ارباح)/.test(sentence)) return true;
  if (/\b(?:n'est\s+pas|ne\s+sont\s+pas|no\s+es|no\s+se\s+paga|non\s+[eè]\s+pagabile|n[aã]o\s+[eé])\b/i.test(sentence)) return true;
  if (/(?:^|\s)не(?:\s|$)/i.test(sentence) && /прибыл|профит/i.test(sentence)) return true;
  return false;
}

function judgePreviousProfit(sentence) {
  if (!previousProfitDomain(sentence)) return null;
  if (previousProfitDenied(sentence)) return ok('owner_rule', 'previous_cycle');
  return bad('previous_cycle_profit', 'previous_cycle');
}

function hasStatusNoun(sentence) {
  return /\b(?:payouts?|withdrawals?|payments?|refunds?|rewards?|funds?|disbursements?|remittances?|settlements?)\b/i.test(sentence)
    || /भुगतान|पेआउट|इनाम|ادائیگی|انعام|выплат|вознагражден/i.test(sentence);
}

function hasTakeBack(sentence) {
  return /\b(?:revers\w*|cancel(?:led|ed|lation|ing)?|took\s+back|taken\s+back|take\s+back|undone|\bundo\b|claw(?:ed)?\s*back|clawback|pull(?:ed)?\s+back|retract\w*|recoup\w*|storn\w*|annull\w*)\b/i.test(sentence)
    || /वापस|واپس|استرجع|استرداد|отмен|аннулир/i.test(sentence);
}

function reversalNegated(sentence) {
  return /\b(?:not|never|cannot|can't|won't|will\s+not|no)\b(?:\s+\w+){0,6}\s+(?:be\s+)?(?:revers|cancel|taken\s+back|took\s+back|clawed\s+back|pulled\s+back|undone)\b/i.test(sentence)
    || /\b(?:revers\w*|cancel\w*|take\s+backs?|claw\s+backs?)\b(?:\s+\w+){0,3}\s+(?:not|never)\b/i.test(sentence)
    || /\bare\s+not\s+reversed\b/i.test(sentence)
    || /\bnot\s+reversed\b/i.test(sentence);
}

function negatedCompletion(sentence) {
  return /\b(?:was|were|is|are|has|have)\s+not\s+(?:been\s+)?(?:just\s+)?(?:paid|sent|processed|restored|reversed|cancelled|canceled)\b/i.test(sentence)
    || /\b(?:didn't|did\s+not|haven't|have\s+not|never)\s+(?:just\s+)?(?:pay|paid|send|sent|process|processed)\b/i.test(sentence)
    || /\b(?:nahi|nahin)\b/i.test(sentence)
    || /نहीं|نہیں|не\s+/i.test(sentence);
}

function englishCompletion(sentence) {
  if (negatedCompletion(sentence) || reversalNegated(sentence)) return null;
  if (!hasStatusNoun(sentence) && !/\b(?:account|credentials?)\s+(?:was|were|has\s+been|have\s+been)\s+(?:reset|restored)\b/i.test(sentence)) {
    // still allow bare I/we reset from the older completion shape
  }
  const perfect = sentence.match(/\b(?:was|were|has\s+been|have\s+been|had\s+been|is\s+now|got)\s+(?:just\s+)?(?:paid|sent|processed|restored|reversed|cancelled|canceled|undone|reset)\b/i);
  if (perfect && (hasStatusNoun(sentence) || /\b(?:account|credentials?)\b/i.test(sentence) || /\b(?:reset|restored)\b/i.test(perfect[0]))) {
    if (/\b(?:reset|restored)\b/i.test(perfect[0]) || hasStatusNoun(sentence)) return perfect[0];
  }
  const agent = sentence.match(/\b(?:i|we|finance|payments?\s+team|the\s+team)\s+(?:have\s+|has\s+|just\s+)?(?:paid|sent|processed|restored|reversed|cancelled|canceled|took\s+back|pulled\s+back|clawed\s+back)\b/i);
  if (agent && (hasStatusNoun(sentence) || /\b(?:reset|restored)\b/i.test(agent[0]))) return agent[0];
  const resetRe = /\b(?:i|we)(?:\s*'\s*ve|\s+have|\s+already)?\s+(?:just\s+)?(?:reset|restored)\b/ig;
  let reset;
  while ((reset = resetRe.exec(sentence))) {
    const before = sentence.slice(Math.max(0, reset.index - 24), reset.index);
    if (/\b(?:how|can|could|may|might|should|would|do|does|did)\s*$/i.test(before)) continue;
    return reset[0];
  }
  return null;
}

function multilingualCompletion(sentence) {
  if (/\b(?:nahi|nahin|nai|mat)\b/i.test(sentence) || /نहीं|نہیں|не\s+/i.test(sentence) || /لم\s*(?:ي|ت)?تم|لن\s*(?:ي|ت)?تم/.test(sentence)) {
    return null;
  }
  if (/\b(?:ho|abbiamo)\s+(?:ripristinato|resettato)\b|\b(?:è|e')\s+stato\s+(?:ripristinato|resettato)\b/i.test(sentence)) {
    return sentence.match(/\b(?:ho|abbiamo)\s+(?:ripristinato|resettato)\b|\b(?:è|e')\s+stato\s+(?:ripristinato|resettato)\b/i)[0];
  }
  if (/\b(?:reset|restore|restored|paid|sent|processed|payout|withdrawal|payment)\b/i.test(sentence)
    && /\b(?:ho\s+gay[ai](?:\s+hai)?|ho\s+chuk[ai](?:\s+hai)?|kar\s+diy[ae](?:\s+hai)?|kiya\s+gay[ae](?:\s+hai)?)\b/i.test(sentence)) {
    return 'hinglish-completion';
  }
  if (/[\u0600-\u06FF]/.test(sentence) && /(?:گیا|گئی|گئے|چکا|چکی|دیا|ہوا|ہوئی)/.test(sentence) && /(?:ادائیگی|ادا|بھیج|بحال|منسوخ|ریورس|ری\s?سیٹ|واپس)/.test(sentence)) {
    return clip(sentence);
  }
  if (/[\u0900-\u097F]/.test(sentence) && !/सकता|सकती|सकते|नहीं/.test(sentence) && /(?:गया|गई|चुका|दिया|हुआ|हुई)/.test(sentence) && /(?:भुगतान|पेआउट|रीसेट|रद्द|वापस|बहाल|भेज)/.test(sentence)) {
    return clip(sentence);
  }
  if (/(оплач|отправ|обработ|восстанов|отмен|аннулир|выплач)[а-яё]{1,8}/i.test(sentence)
    && !/(?:^|\s)не\s+/i.test(sentence.slice(0, Math.max(0, sentence.search(/(оплач|отправ|обработ|восстанов|отмен|аннулир|выплач)/i))))) {
    if (/(выплат|платеж|платёж|счет|счёт|аккаунт|вывод)/i.test(sentence) || /(оплач|выплач|аннулир)/i.test(sentence)) {
      return sentence.match(/(оплач|отправ|обработ|восстанов|отмен|аннулир|выплач)[а-яё]{1,8}/i)[0];
    }
  }
  if (/تم|تمت/.test(sentence) && /دفع|صرف|استعاد|استعادة|إعادة|إلغ|عكس|سحب/.test(sentence) && !/لم|لن/.test(sentence)) {
    return clip(sentence);
  }
  return null;
}

function completionSpan(sentence) {
  return englishCompletion(sentence) || multilingualCompletion(sentence);
}

function judgeReversalOrCompletion(sentence) {
  if (hasStatusNoun(sentence) && hasTakeBack(sentence)) {
    if (reversalNegated(sentence)) return ok('owner_rule', 'completed_payout');
    return bad('payout_reversal', 'completed_payout', { text: clip(sentence) });
  }
  const span = completionSpan(sentence);
  if (!span) return null;
  if (/\bsoft\s+breach\b/i.test(sentence) && /\b30\s*%/.test(sentence)) return null;
  return bad('payout_completion', 'completion', { text: span, confirmable: true });
}

function feeNumbers(sentence) {
  const percents = [];
  const usd = [];
  const percentRe = /(\d+(?:\.\d+)?)\s*(?:%|percent\b)/gi;
  const usdRe = /(?:\$|usd)\s*(\d+(?:\.\d+)?)|\b(\d+(?:\.\d+)?)\s*usd\b/gi;
  let m;
  while ((m = percentRe.exec(sentence))) percents.push(Number(m[1]));
  while ((m = usdRe.exec(sentence))) usd.push(Number(m[1] || m[2]));
  return { percents, usd };
}

function isResetPriceSentence(sentence) {
  return (/\breset\w*/i.test(sentence) || /रीसेट|ری\s?سیٹ|إعادة\s+تعيين/.test(sentence))
    && (/\b(?:fee|fees|cost|price|charge|charges|tarifa|precio|frais|tassa|percent|usd)\b|%|\$|फीस|فیس|رسوم/i.test(sentence));
}

function approvedResetPrice(sentence) {
  const nums = feeNumbers(sentence);
  if (nums.percents.some((n) => n !== APPROVED.resetFeePercent)) return false;
  if (nums.usd.some((n) => n !== APPROVED.resetFeeMinimumUsd)) return false;
  if (/\b40\s*%|\b40\s*percent\b/i.test(sentence) && /\b(?:of|on)\s+(?:the\s+)?(?:profit|payout|balance|drawdown)\b/i.test(sentence)) return false;
  const hasApprovedFigure = nums.percents.includes(40) || nums.usd.includes(10);
  const ladder = /\b(?:second|third)\s+reset\b/i.test(sentence)
    && (/\b(?:2|two)\s+times\b/i.test(sentence) || /\btwice\b/i.test(sentence));
  if (ladder && nums.percents.length === 0 && nums.usd.length === 0) return true;
  if (!hasApprovedFigure) return false;
  if (nums.percents.includes(40) && /\b(?:of|on)\s+(?:the\s+)?(?:profit|payout)\b/i.test(sentence)) return false;
  return true;
}

function judgeResetPrice(sentence) {
  if (!isResetPriceSentence(sentence)) return null;
  if (approvedResetPrice(sentence)) return ok('help_centre_17437410', 'reset_price');
  return bad('reset_price', 'reset_price');
}

function mentionsCrypto(sentence) {
  return /\bcrypto(?:currency)?\b|\busdc\b|क्रिप्टो|کریپٹو|крипто/i.test(sentence);
}

function mentionsRise(sentence) {
  return /\brise\b/i.test(sentence);
}

function moneyValues(sentence) {
  const values = [];
  const re = /(?:\$|usd\s*)(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*usd\b/gi;
  let match;
  while ((match = re.exec(sentence))) values.push(Number((match[1] || match[2]).replace(/,/g, '')));
  return values;
}

function pairDiffersBy(values, gap) {
  for (let i = 0; i < values.length; i += 1) {
    for (let j = 0; j < values.length; j += 1) {
      if (values[i] - values[j] === gap) return true;
    }
  }
  return false;
}

function cryptoNetMatches(sentence) {
  const values = moneyValues(sentence).filter((n) => n > 0);
  for (let i = 0; i < values.length; i += 1) {
    for (let j = 0; j < values.length; j += 1) {
      if (values[i] > values[j] && Math.abs(values[j] / values[i] - 0.97) < 0.001) return true;
    }
  }
  return false;
}

function cryptoContradicts(sentence) {
  if (/\b(?:cap(?:ped|s)?|maximum|max|up\s+to|no\s+more\s+than|limited\s+to)\b/i.test(sentence) && /\b500\b/.test(sentence)) return true;
  if (percentValues(sentence).some((n) => n !== APPROVED.cryptoFeePercent)) return true;
  return false;
}

function approvedCryptoRule(sentence) {
  if (cryptoContradicts(sentence)) return false;
  const anyAmount = /\bany\s+amount\b|\bnot\s+capped\b|\buncapped\b|\bno\s+(?:maximum|cap)\b/i.test(sentence);
  const onlyBelow = /\b(?:only|exclusiv\w*)\b/i.test(sentence)
    && /\b(?:below|under)\b/i.test(sentence)
    && /\b500\b/.test(sentence);
  const fee = percentValues(sentence).includes(APPROVED.cryptoFeePercent);
  return anyAmount || onlyBelow || fee || cryptoNetMatches(sentence);
}

function riseContradicts(sentence) {
  if (/\b(?:maximum|max|up\s+to|no\s+more\s+than|any\s+amount|no\s+(?:withdrawal\s+)?limit|unlimited)\b/i.test(sentence)) return true;
  if (/\b(?:below|under)\s+\$?\s*500\b/i.test(sentence) && /\brise\b/i.test(sentence) && !mentionsCrypto(sentence)) return true;
  return false;
}

function approvedRiseRule(sentence) {
  if (riseContradicts(sentence)) return false;
  const minimum = /\b500\b/.test(sentence)
    && /\b(?:or\s+more|and\s+above|or\s+above|at\s+least|minimum|or\s+higher|and\s+over)\b/i.test(sentence);
  const amounts = moneyValues(sentence);
  const fee = amounts.includes(APPROVED.riseFeeUsd)
    && amounts.every((n) => n === APPROVED.riseFeeUsd || n === APPROVED.riseMinimumUsd)
    && /\b(?:fee|fees|deduct\w*|charge\w*)\b/i.test(sentence);
  const net = pairDiffersBy(amounts, APPROVED.riseFeeUsd) && amounts.some((n) => n > APPROVED.riseFeeUsd);
  if (amounts.some((n) => n !== APPROVED.riseFeeUsd && n !== APPROVED.riseMinimumUsd) && !net) return false;
  return minimum || fee || net;
}

function judgePayoutMethod(sentence) {
  const crypto = mentionsCrypto(sentence);
  const rise = mentionsRise(sentence);
  if (!crypto && !rise) return null;
  const ruleTalk = /\b(?:fee|fees|limit|cap(?:ped|s)?|maximum|minimum|any\s+amount|only\s+method|exclusiv\w*|or\s+more|at\s+least|below|under)\b|%|percent\b/i.test(sentence)
    || cryptoNetMatches(sentence)
    || (rise && pairDiffersBy(moneyValues(sentence), APPROVED.riseFeeUsd));
  if (!ruleTalk) return null;
  if (crypto && !approvedCryptoRule(sentence)) return bad('payout_method_amount', 'payout_method');
  if (rise && !approvedRiseRule(sentence)) return bad('payout_method_amount', 'payout_method');
  return ok('help_centre_17437354', 'payout_method');
}

function judgeWeekend(sentence) {
  const holding = /\bweekend\s+hold(?:ing)?\b/i.test(sentence)
    || /\bhold(?:ing)?\s+(?:a\s+|the\s+)?positions?\s+(?:over|through)\s+(?:the\s+)?weekend\b/i.test(sentence);
  const trading = /\bweekend\s+trad(?:e|ing|es)\b/i.test(sentence);
  if (holding && trading && /\b(?:same\s+(?:as|outcome)|identical|equivalent)\b/i.test(sentence)) {
    return bad('outcomes_conflated', 'separate_outcomes');
  }
  if (holding && !trading) {
    const allowed = /\b(?:allowed|permitted|fine|okay)\b/i.test(sentence)
      || deniesAccountEnd(sentence)
      || /\bnot\s+(?:being\s+)?(?:a\s+)?(?:termination|breach)\b/i.test(sentence);
    if (allowed && !affirmsAccountEnd(sentence)) return ok('help_centre_weekend_holding', 'scalp_weekend');
    if (affirmsAccountEnd(sentence)) return bad('weekend_holding_outcome', 'scalp_weekend');
    return null;
  }
  if (trading && !holding && affirmsAccountEnd(sentence) && !/\bstrategy\s+risk\b/i.test(sentence)) {
    return ok('help_centre_weekend_trading', 'scalp_weekend');
  }
  return null;
}

function judgeSourceAuthority(sentence) {
  const help = /\bhelp\s*cent(?:re|er)\b|faq\.fundedelite\.com/i.test(sentence);
  const faq = /\bfaq\b/i.test(sentence);
  if (!help || !faq) return null;
  const faqPrimary = /\bfaq\b[\s\S]{0,48}\b(?:overrides?|outranks?|supersed\w*|primary|source\s+of\s+truth|wins|prevails)\b/i.test(sentence);
  const helpPrimary = /\bhelp\s*cent(?:re|er)\b[\s\S]{0,64}\b(?:primary|source\s+of\s+truth|outranks?|overrides?)\b/i.test(sentence)
    || /faq\.fundedelite\.com/i.test(sentence) && /\bprimary\b/i.test(sentence)
    || /\bfaq\b[\s\S]{0,40}\bsecondary\b/i.test(sentence);
  if (helpPrimary && !faqPrimary) return ok('help_centre_primary', 'source_authority');
  return bad('source_authority', 'source_authority');
}

function judgeUnresolved(sentence) {
  const authority = judgeSourceAuthority(sentence);
  if (authority) return authority;
  if (/\bcatalyst\b/i.test(sentence)
    && /\b(?:stage|reset|eras\w*|wip(?:e|ed|es|ing)|clean\s+slate|stay\s+won|earlier\s+stages?|previous\s+stages?|kept|lost|preserved)\b/i.test(sentence)) {
    return bad('unresolved_catalyst_stage', 'unresolved');
  }
  return null;
}

function judgeSoftBreach(sentence) {
  if (!/\bsoft\s+breach\b/i.test(sentence)) return null;
  if (affirmsAccountEnd(sentence)) return bad('soft_breach_outcome', 'soft_breach');
  if (matchesSoftBreachPayout(sentence)) return ok('help_centre_17437398', 'soft_breach');
  if (/\breset\b/i.test(sentence) && !resetDenied(sentence)) return ok('owner_rule', 'soft_breach');
  if (deniesAccountEnd(sentence)) return ok('owner_rule', 'soft_breach');
  if (/\b\d+(?:\.\d+)?\s*(?:%|percent)\b/i.test(sentence)) return bad('soft_breach_outcome', 'soft_breach');
  return null;
}

function judgeSentence(sentence) {
  if (isPureQuestion(sentence)) return null;
  const checks = [
    judgeUnresolved,
    judgePayoutMethod,
    judgeResetPrice,
    judgePreviousProfit,
    judgeReversalOrCompletion,
    judgeResetEligibility,
    judgeHalfDailyLoss,
    judgeWeekend,
    judgeSoftBreach,
    judgeStrategyRisk,
  ];
  if (isHedgeSentence(sentence)) {
    for (const check of checks) {
      const result = check(sentence);
      if (result && !result.approved && !result.confirmable) {
        result.text = result.text || clip(sentence);
        return result;
      }
    }
    return null;
  }
  let approvedHit = null;
  for (const check of checks) {
    const result = check(sentence);
    if (!result) continue;
    result.text = result.text || clip(sentence);
    if (!result.approved) return result;
    approvedHit = result;
  }
  return approvedHit;
}

function withholdNote(text) {
  const t = String(text || '');
  if (/\b(?:do\s+not|don't|never|must\s+not|not\s+to)\b[\s\S]{0,48}\b(?:tell|inform|notify|mention|share|disclose|say)\b[\s\S]{0,40}\b(?:the\s+)?(?:clients?|customers?|traders?|users?|them|him|her)\b/i.test(t)) return true;
  if (/\b(?:clients?|customers?|traders?)\b[\s\S]{0,32}\b(?:must\s+not|should\s+not|is\s+not\s+to)\s+be\s+(?:told|informed|notified)\b/i.test(t)) return true;
  return false;
}

function noteDenies(text, span) {
  const hay = normalize(text);
  const needle = normalize(span);
  if (/\b(?:is\s+not\s+true|not\s+correct|do\s+not\s+confirm|don't\s+confirm|cannot\s+confirm|can't\s+confirm|did\s+not\s+happen|never\s+happened)\b/i.test(hay)) return true;
  if (/\b(?:not|never|n't|did\s+not|was\s+not|were\s+not|has\s+not|have\s+not|no)\b(?:\s+\w+){0,5}\s+(?:confirm\w*|verif\w*|approv\w*|attest\w*|true|correct)\b/i.test(text)) return true;
  if (needle && hay.includes(needle) && /नहीं|نہیں|نهیں|(?:^|\s)لا(?:\s|$)|(?:^|\s)не(?:\s|$)|不是|ない/.test(text)) return true;
  if (!needle || !hay.includes(needle)) return false;
  const at = hay.indexOf(needle);
  const before = hay.slice(Math.max(0, at - 48), at);
  return /\b(?:not|never|n't|did\s+not|was\s+not|were\s+not|has\s+not|have\s+not|no)\s*$/i.test(before);
}

function attestationResidue(text, span) {
  let hay = normalize(text);
  const needle = normalize(span);
  if (needle) hay = hay.split(needle).join(' ');
  hay = hay.replace(/\b(?:teammate|note|internal|client|the|a|an|that|this|was|were|is|to|of|and|for)\b/g, ' ');
  hay = hay.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return hay;
}

function claimConfirmed(span, messages) {
  const needle = normalize(span);
  if (!needle) return false;
  for (const message of messages || []) {
    if (!message || (message.role !== 'human' && message.role !== 'note')) continue;
    const text = String(message.text || '');
    if (withholdNote(text)) continue;
    const hay = normalize(text);
    if (!hay.includes(needle)) continue;
    if (noteDenies(text, span)) continue;
    const residue = attestationResidue(text, span);
    if (!residue) continue;
    if (/\b(?:confirm\w*|verif\w*|approv\w*|attest\w*|checked)\b/i.test(residue)) return true;
  }
  return false;
}

function partsToMessages(parts, botIds) {
  const bots = new Set((botIds || []).map((id) => String(id)));
  return (parts || []).filter(Boolean).map((part) => {
    if (part.role === 'human' || part.role === 'note' || part.role === 'client' || part.role === 'bot') {
      return { role: part.role, text: String(part.text || part.body || '') };
    }
    const text = String(part.body || part.text || '');
    if (String(part.part_type || '') === 'note') return { role: 'note', text };
    const author = part.author || {};
    if (bots.has(String(author.id || ''))) return { role: 'bot', text };
    if (String(author.type || '') === 'admin') return { role: 'human', text };
    return { role: 'client', text };
  });
}

function finish(action, reason, extra) {
  return {
    version: STATUS.candidate,
    frozen: true,
    approved: false,
    release: false,
    silent: false,
    topicIgnored: true,
    action,
    reason,
    reasons: extra.reasons || [reason],
    claims: extra.claims || [],
    holds: extra.holds || [],
    families: extra.families || [],
    clientMessage: action === 'allow' ? extra.draft : CLIENT_MESSAGE,
    hedgeKept: !!extra.hedgeKept,
  };
}

function evaluateResetRestoreClaim(ctx) {
  const input = ctx || {};
  const draft = String(input.draft == null ? '' : input.draft);
  if (!draft.trim()) return finish('allow', 'no_claim', { draft, reasons: ['no_claim'] });

  const problems = [];
  const confirmable = [];
  let sawHedge = false;
  let sawApproved = false;
  let allowReason = null;
  for (const sentence of sentences(draft)) {
    if (isHedgeSentence(sentence)) sawHedge = true;
    if (isPureQuestion(sentence)) continue;
    const judged = judgeSentence(sentence);
    if (!judged) continue;
    if (judged.approved) {
      sawApproved = true;
      allowReason = judged.reason;
      continue;
    }
    if (judged.confirmable) confirmable.push(judged);
    else problems.push(judged);
  }

  for (const item of confirmable) {
    if (!claimConfirmed(item.text, input.messages)) problems.push(item);
  }

  const reasons = [];
  const families = [];
  const claims = [];
  for (const item of problems) {
    if (!reasons.includes(item.reason)) reasons.push(item.reason);
    if (item.family && !families.includes(item.family)) families.push(item.family);
    if (item.text && !claims.includes(item.text)) claims.push(item.text);
  }
  if (problems.length) {
    return finish('hold', problems[0].reason, { draft, reasons, families, claims, holds: claims });
  }
  if (confirmable.length) {
    return finish('allow', 'human_confirmed', { draft, claims: confirmable.map((item) => item.text), reasons: ['human_confirmed'] });
  }
  if (sawApproved) return finish('allow', allowReason || 'owner_rule', { draft, reasons: [allowReason || 'owner_rule'] });
  if (sawHedge && sentences(draft).every((sentence) => isHedgeSentence(sentence) || isPureQuestion(sentence))) {
    return finish('allow', 'hedge_kept', { draft, hedgeKept: true, reasons: ['hedge_kept'] });
  }
  return finish('allow', 'no_claim', { draft, reasons: ['no_claim'] });
}

function guardPublicBody(body, ctx) {
  try {
    const result = evaluateResetRestoreClaim(Object.assign({}, ctx || {}, { draft: body }));
    const usable = result && result.silent === false && result.clientMessage
      && (result.action === 'allow' || result.action === 'hold' || result.action === 'block');
    if (!usable) {
      return { send: true, body: CLIENT_MESSAGE, replaced: true, silent: false, failClosed: true, reason: 'guard-error-fail-closed', result };
    }
    if (result.action === 'allow') {
      return { send: true, body: String(body == null ? '' : body), replaced: false, silent: false, failClosed: false, reason: result.reason, result };
    }
    return { send: true, body: result.clientMessage, replaced: true, silent: false, failClosed: false, reason: result.reason, result };
  } catch (e) {
    return { send: true, body: CLIENT_MESSAGE, replaced: true, silent: false, failClosed: true, reason: 'guard-error-fail-closed', error: e && e.message };
  }
}

function beforeSend(draft, ctx) {
  return guardPublicBody(draft, ctx);
}

module.exports = {
  STATUS,
  APPROVED,
  CLIENT_MESSAGE,
  FALLBACK_HEDGE_RE,
  HEDGE_RE,
  hedgeSource: hedgePattern.source,
  resolveHedgePattern,
  isPureQuestion,
  judgeSentence,
  withholdNote,
  claimConfirmed,
  partsToMessages,
  evaluateResetRestoreClaim,
  guardPublicBody,
  beforeSend,
};
