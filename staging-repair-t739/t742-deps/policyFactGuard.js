'use strict';

/**
 * Deterministic policy-fact rewrites from approved FAQ / prompt cards only.
 * Instant merge deny: FAQ "Can I Merge my Accounts?" — only standard
 * 1-Step/2-Step + Free Retry live accounts. Instant is not merge-eligible.
 * Payout routing: FAQ "Payouts process and profit split" (updated 2026-09-18) — payouts of 500 USD and
 * above go through Rise (no withdrawal limits; crypto or fiat inside Rise); below 500 USD crypto only.
 * The old "$500 USD gross per payout cycle" crypto cap is retired (FAQ sync 2026-09-27).
 * Do not invent extra numbers or eligibility.
 */

const CRYPTO_CAP_USD = 500;
let tradingStagePolicy = null;
try { tradingStagePolicy = require('./tradingStagePolicy'); } catch (_) { tradingStagePolicy = null; }

const INSTANT_MERGE_DENY =
  'Instant accounts cannot be merged. Only standard 1-Step + Free Retry or 2-Step + Free Retry live accounts can be merged, and only when they match in size and add-ons, have not been traded, and have not used second chance.';

// Name kept for callers/tests; the value is now the official routing fact, not a cap.
const CRYPTO_CAP_DENY =
  'Payouts of 500 USD and above go through Rise, with no withdrawal limits; inside Rise you can choose cryptocurrency or fiat, including bank transfer in your local currency. Payouts below 500 USD are processed exclusively in cryptocurrency.';

function isInstantMergeAsk(text) {
  const t = String(text || '');
  if (!/\bmerge\b/i.test(t)) return false;
  if (!/\binstant\b/i.test(t)) return false;
  return true;
}

function alreadyDeniesInstantMerge(body) {
  const t = String(body || '');
  if (/\byes\b.{0,30}merge.{0,20}instant/i.test(t)) return false;
  return /cannot merge|not (?:able|allowed) to merge|only standard|instant accounts cannot be merged/i.test(t);
}

function extractRequestedUsd(text) {
  const t = String(text || '');
  const found = [];
  for (const m of t.matchAll(/\$\s*(\d{3,6})\b/g)) found.push(Number(m[1]));
  for (const m of t.matchAll(/\b(\d{3,6})\s*(?:usd|usdt|dollars?)\b/gi)) found.push(Number(m[1]));
  for (const m of t.matchAll(/\b(\d{3,6})\b/g)) {
    const n = Number(m[1]);
    if (n >= 200 && n <= 20000) found.push(n);
  }
  return found;
}

function isCryptoPayoutAsk(text) {
  const t = String(text || '');
  if (!/\b(?:usdt|usdc|crypto|bitcoin|\bbtc\b)\b/i.test(t)) return false;
  return /\b(?:payout|withdraw|take|request|cycle|entirely|full)\b/i.test(t);
}

function cryptoOverCapAmount(text) {
  if (!isCryptoPayoutAsk(text)) return null;
  const amounts = extractRequestedUsd(text).filter((n) => n > CRYPTO_CAP_USD && n <= 20000);
  return amounts.length ? amounts[0] : null;
}

function affirmsCryptoOverCap(body, amount) {
  const t = String(body || '');
  if (!t) return false;
  if (/\bno\b.{0,80}500/i.test(t) && !/\byes\b.{0,40}\d{3,5}/i.test(t)) return false;
  const amt = String(amount);
  if (new RegExp('\\byes\\b.{0,60}' + amt, 'i').test(t)) return true;
  if (new RegExp('\\byes\\b.{0,40}(?:full|entirely|all).{0,24}(?:usdt|crypto)', 'i').test(t)) return true;
  if (new RegExp('can (?:request|take|withdraw).{0,40}' + amt, 'i').test(t) && /usdt|crypto/i.test(t)) {
    return true;
  }
  return false;
}

// PAYOUT_ROUTING_V1 (FAQ sync 2026-09-27): the retired "$500 USD gross per payout cycle" crypto cap must never
// reach a client. A draft sentence that states such a cap is replaced by the official routing fact; everything
// else in the draft is kept. Amount-based "yes/no" answers are left to the model and the approved evidence.
const CRYPTO_CAP_CLAIM_RE = /[^.!?\n]*(?:\b(?:cap(?:ped)?|maximum|max|limit(?:ed)?)\b[^.!?\n]{0,60}\$?\s?500\b[^.!?\n]{0,40}\b(?:per\s+(?:payout\s+)?cycle|crypto|usdt)\b|\b(?:crypto|usdt)\b[^.!?\n]{0,60}\b(?:cap(?:ped)?|limit(?:ed)?|maximum|max)\b[^.!?\n]{0,30}\$?\s?500\b|\$\s?500\s+(?:usd\s+)?(?:crypto|usdt)\s+(?:cap|limit|maximum)\b)[^.!?\n]*[.!?]?/gi;
// A sentence that negates a limit ("no withdrawal limits") is a correct routing statement, not a cap claim.
const CAP_NEGATED_RE = /\b(?:no|without|unlimited|not\s+(?:capped|limited))\b[^.!?\n]{0,25}\b(?:cap|limit|maximum|max)|\bunlimited\b/i;

function claimsCryptoCap(body) {
  const ms = String(body || '').match(CRYPTO_CAP_CLAIM_RE) || [];
  CRYPTO_CAP_CLAIM_RE.lastIndex = 0;
  return ms.some((m) => !CAP_NEGATED_RE.test(m));
}

function rewriteCryptoCap(latest, body) {
  const t = String(body || '');
  if (!claimsCryptoCap(t)) return body;
  let used = false;
  CRYPTO_CAP_CLAIM_RE.lastIndex = 0;
  const out = t.replace(CRYPTO_CAP_CLAIM_RE, (m) => {
    if (CAP_NEGATED_RE.test(m)) return m;
    const lead = (m.match(/^\s*/) || [''])[0];
    if (used) return '';
    used = true;
    return lead + CRYPTO_CAP_DENY;
  });
  // A bare "No." that only introduced the retired cap would now contradict the routing fact.
  return out.replace(/^\s*(?:no|nope|unfortunately,?\s*no)\s*[.,!]\s*(?=Payouts of 500 USD)/i, '')
    .replace(/[ \t]{2,}/g, ' ').trim();
}

function isGeneralPolicyQuestionExtra(text) {
  const t = String(text || '');
  if (!t) return false;
  if (/\b(?:soft|hard)\s+breach\b/i.test(t) && /\b(?:is|or|just|soft or hard)\b/i.test(t)) return true;
  if (/\b(?:is|does)\b[\s\S]{0,50}\b(?:the\s+)?account\s+(?:dead|closed|terminat)/i.test(t)) return true;
  if (/\bcan i merge\b/i.test(t)) return true;
  if (/\b(?:latency|arbitrage)\b/i.test(t) && /\b(?:soft|hard|breach|allowed|prohibit)/i.test(t)) return true;
  if (isRiskRuleAsk(t) || isScalpingLimitAsk(t) || isScalpingFlagAsk(t) || isIpRuleAsk(t)) return true;
  if (isPaidResetRulesAsk(t) || isPaidResetCountAsk(t)) return true;
  return false;
}

// PAID_RESET_FAQ_V1 (2026-09-29, ticket 215476153533183): after a paid/dashboard ("soft") reset the
// account keeps the same challenge rules; where the reset rule applies, max 3 paid resets. Answerable
// from approved soft-breach reset policy — do not escalate or invent a one-reset limit.
const PAID_RESET_SAME_RULES =
  'After a paid/dashboard reset you receive the same account with the same challenge rules. Where the reset rule applies, you can reset a maximum of 3 times: the first reset is 40% of the challenge fee, the second costs double the first, and the third costs double the second.';

function isPaidResetRulesAsk(text) {
  const t = String(text || '');
  if (!t) return false;
  const reset = /\b(?:paid|soft|dashboard)\s+resets?\b|\bafter\s+(?:a\s+|the\s+)?(?:paid\s+|soft\s+|dashboard\s+)?reset\b|\breset\s+(?:account|fee)\b/i.test(t);
  if (!reset) return false;
  return /\b(?:rule|rules|same|change|changes|differ|different|keep|keeps|continue|still)\b/i.test(t);
}

function isPaidResetCountAsk(text) {
  const t = String(text || '');
  if (!t) return false;
  return /\bhow\s+many\s+(?:paid\s+|soft\s+|dashboard\s+)?resets?\b|\b(?:only\s+)?one\s+reset\b|\b(?:max(?:imum)?|limit(?:ed)?)\s+(?:\w+\s+){0,3}resets?\b|\bresets?\s+(?:per|on\s+(?:each|every|my|the))\s+account\b/i.test(t);
}

function looksLikeSoftResetAlias(text) {
  return /\bsoft\s+reset\b/i.test(String(text || ''));
}

function rewritePaidResetFaq(latest, body, actionIn) {
  const rulesAsk = isPaidResetRulesAsk(latest);
  const countAsk = isPaidResetCountAsk(latest);
  if (!rulesAsk && !countAsk) return null;
  const t = String(body || '');
  const hasSameRules = /\bsame\b[^.!?]{0,40}\brules?\b|\brules?\b[^.!?]{0,40}\bsame\b/i.test(t);
  const hasMax3 = /\b(?:maximum|max(?:imum)?\s+of|up\s+to)\s+3\s+resets?\b|\b3\s+resets?\b/i.test(t);
  const wrongOneOnly = /\b(?:limited|limit(?:ed)?)\s+to\s+one\b|\bonly\s+one\s+reset\b|\bcan(?:'|\u2019)?t\s+confirm\b[^.!?]{0,80}\b(?:paid\s+)?resets?\b/i.test(t);
  const escalated = String(actionIn || '').toUpperCase() === 'ESCALATE';
  const reviewing =
    /\b(?:team|teammate|support)\s+(?:is\s+)?(?:reviewing|checking|looking)\b|\bi(?:'ve|\s+have)\s+forwarded\b|\bwill\s+update\s+you\b/i.test(t);
  if (escalated || wrongOneOnly || reviewing || (rulesAsk && !hasSameRules) || (countAsk && !hasMax3)) {
    return PAID_RESET_SAME_RULES;
  }
  return null;
}

function is300kOverlayAsk(text) {
  const t = String(text || '');
  const size = /\$?\s*(?:300|350|400)\s*k\b|accounts?\s+above\s+\$?\s*300|300\s*k\s+plus/i.test(t);
  if (!size) return false;
  return /\b(?:consistenc|overlay|trading\s+days?|min(?:imum)?\s+(?:trading\s+)?days?|extra|stricter)\b/i.test(t);
}

const OVERLAY_300K =
  'For $300k and larger accounts there is an extra overlay: 60% consistency, and 5 minimum trading days instead of the standard 3.';

function rewrite300kOverlay(latest, body) {
  if (!is300kOverlayAsk(latest)) return body;
  const t = String(body || '');
  const has60 = /60\s*%/.test(t);
  const has5days = /(?:\b5\b.{0,24}(?:trading\s+)?days?|(?:trading\s+)?days?.{0,24}\b5\b)/i.test(t);
  const daysAsk = /trading\s+days?|min(?:imum)?\s+(?:trading\s+)?days?/i.test(latest);
  const consAsk = /consistenc|overlay|25/i.test(latest);
  if (consAsk && !has60) return OVERLAY_300K;
  if (daysAsk && !has5days) return OVERLAY_300K;
  return body;
}


// SOFT_BREACH_RESET_V1 (owner 2026-09-29): funded Strategy Risk / Risk Rule and Scalping Limit are soft
// breaches requiring dashboard reset (max 3; first 40% of challenge fee, then double, then double).
// Stale Help Center "closure and forfeiture" wording must not be served for these two topics.
const RISK_RULE_RESET =
  'A Strategy Risk Limits (Risk Rule) breach on the funded/live stage is a soft breach, not immediate termination. You must reset the account to continue; the reset option appears on your dashboard (maximum 3 resets). First reset is 40% of the challenge fee. The second reset costs double the first, and the third costs double the second.';

const SCALPING_LIMIT_RESET =
  'A Scalping Limit breach on the funded/live account (qualifying profit from under-min-hold trades at or over the dashboard scalping limit) is a soft breach, not immediate termination. You must reset the account to continue; the reset option appears on your dashboard (maximum 3 resets). First reset is 40% of the challenge fee. The second reset costs double the first, and the third costs double the second. That is different from a single scalping flag.';

const SCALPING_FLAG_REVIEW =
  'Even one live/funded trade closed under the minimum holding time can create a scalping flag. That does not automatically require a reset. The Risk Team reviews the case and may adjust the profit split for the current payout cycle as low as 30%.';

const IP_REVIEW_OPTIONS =
  'An IP rule violation is reviewed by the Risk Team. They may decide on an account reset or a reduced profit split (as low as 30%) for the relevant payout. There is not one automatic outcome for every IP case.';

function isRiskRuleAsk(text) {
  const t = String(text || '');
  if (/\brisk\s+rule\b/i.test(t)) return true;
  if (/strategy\s+risk\s+limits?/i.test(t)) return true;
  if (/\b50\s*%\b/.test(t) && /\b(?:daily\s+loss|instrument|pair)\b/i.test(t) && /\b(?:breach|violat|consequence|happen|reset)\b/i.test(t)) return true;
  return false;
}

function isScalpingLimitAsk(text) {
  const t = String(text || '');
  if (/scalping\s+limit|scalp\s+limit|490\s*\/\s*500|500\s*\/\s*500/i.test(t)) return true;
  if (/\$?\s*490\b/.test(t) && /\$?\s*500\b/.test(t) && /scalp/i.test(t)) return true;
  return false;
}

function isScalpingFlagAsk(text) {
  const t = String(text || '');
  if (/scalping\s+flag/i.test(t)) return true;
  if (/\b(?:one|single|a)\s+trade\b/i.test(t) && /\b(?:under|below|less than)\b/i.test(t) && /\b(?:3\s*min|three\s*min|30\s*sec)/i.test(t)) return true;
  if (/closed?.{0,40}(?:under|below|less than).{0,20}(?:3\s*min|30\s*sec)/i.test(t) && !isScalpingLimitAsk(t)) return true;
  return false;
}

function isIpRuleAsk(text) {
  const t = String(text || '');
  return /\bip\b/i.test(t) && /\b(?:rule|violat\w*|flag|sharing|vpn|vps)\b/i.test(t) && /\b(?:happen\w*|consequence|reset|split|review|breach)\b/i.test(t);
}

function claimsClosureForfeit(body) {
  const t = String(body || '');
  return /account\s+closure|close(?:d|s)?\s+the\s+account|terminat/i.test(t) && /forfeit|accumulated\s+profits?/i.test(t);
}

function claimsPayoutSplitOnly(body) {
  const t = String(body || '');
  return /30\s*%/.test(t) && /(?:profit\s+)?split|payout/i.test(t) && !/reset/i.test(t);
}

function claimsAutoReset(body) {
  const t = String(body || '');
  return /\b(?:must|need to|required to|have to)\s+reset\b|account\s+reset\s+is\s+required|soft\s+breach\s+reset/i.test(t) ||
    (/\breset\b/i.test(t) && /\b(?:automatic|automatically|always)\b/i.test(t));
}

// SOFT_BREACH_RESET_V1 (owner 2026-09-29): correct ONLY funded Strategy Risk / Scalping Limit
// consequence drafts when they claim closure/forfeiture, 30%-split-only, or termination.
// IP soft breach and Scalping Flag keep their existing consequences (never inherit the reset rule).
// Does not rewrite the general Soft Breach article answers.
function rewriteBreachConsequences(latest, body, ctx) {
  let out = String(body || '');
  const stage = tradingStagePolicy ? tradingStagePolicy.detectStage(latest, ctx) : 'unknown';
  if (isRiskRuleAsk(latest)) {
    const wrong =
      claimsClosureForfeit(out) ||
      claimsPayoutSplitOnly(out) ||
      (/\b(?:immediate\s+)?(?:terminat|hard\s+breach)\b/i.test(out) && !/soft\s+breach/i.test(out)) ||
      (!/\breset\b/i.test(out) && /\b(?:consequence|happen|breach|violat|what\s+if|close|forfeit|split)\b/i.test(latest));
    if (wrong && (/\b(?:consequence|happen|breach|violat|what\s+if|reset|close|forfeit|split|terminat)\b/i.test(latest) || claimsClosureForfeit(out) || claimsPayoutSplitOnly(out))) {
      out = RISK_RULE_RESET;
    }
  }
  if (isScalpingLimitAsk(latest)) {
    if (claimsPayoutSplitOnly(out) || claimsClosureForfeit(out) || (/flag/i.test(out) && !/limit/i.test(out) && /30\s*%/.test(out)) || (!/\breset\b/i.test(out) && /\b(?:consequence|happen|breach|violat)\b/i.test(latest))) {
      out = SCALPING_LIMIT_RESET;
    }
  }
  if (isScalpingFlagAsk(latest) && !isScalpingLimitAsk(latest)) {
    const evalAsk = stage === 'evaluation' || (tradingStagePolicy && /\beval/i.test(String(latest || '')));
    const wrongFlag =
      claimsAutoReset(out) ||
      claimsClosureForfeit(out) ||
      (/scalping\s+limit\s+breach/i.test(out) && /reset/i.test(out) && !/flag/i.test(out)) ||
      (evalAsk && /live\/funded trade|as low as 30%/i.test(out));
    if (wrongFlag) out = evalAsk && tradingStagePolicy ? tradingStagePolicy.EVAL_HOLDING : SCALPING_FLAG_REVIEW;
  }
  if (tradingStagePolicy) {
    const shaped = tradingStagePolicy.rewriteScalping(latest, out, ctx);
    if (shaped && shaped !== out) out = shaped;
  }
  if (isIpRuleAsk(latest)) {
    const onlyReset = /\breset\b/i.test(out) && !/30\s*%|profit\s+split|reduced\s+split/i.test(out) && /\balways\b|\bonly\b|\bmust\b/i.test(out);
    const onlySplit = /30\s*%|profit\s+split/i.test(out) && !/\breset\b/i.test(out) && /\balways\b|\bonly\b|\bmust\b/i.test(out);
    if (onlyReset || onlySplit || claimsClosureForfeit(out)) out = IP_REVIEW_OPTIONS;
  }
  return out;
}

function applyPolicyFacts(latest, parsed, ctx) {
  const actionIn = String((parsed && parsed.action) || 'REPLY').toUpperCase();
  let body = (parsed && parsed.body) != null ? String(parsed.body) : '';
  let action = actionIn;
  let reason = '';
  ctx = ctx || {};

  if (isInstantMergeAsk(latest)) {
    if (!alreadyDeniesInstantMerge(body) || action === 'ESCALATE') {
      body = alreadyDeniesInstantMerge(body) ? body : INSTANT_MERGE_DENY;
      if (action === 'ESCALATE') action = 'REPLY';
      reason = 'instant-merge-deny';
    }
  }

  const cryptoBody = rewriteCryptoCap(latest, body);
  if (cryptoBody !== body) {
    body = cryptoBody;
    if (action === 'ESCALATE') action = 'REPLY';
    reason = reason ? reason + '+crypto-cap' : 'crypto-cap';
  }

  const overlayBody = rewrite300kOverlay(latest, body);
  if (overlayBody !== body) {
    body = overlayBody;
    if (action === 'ESCALATE') action = 'REPLY';
    reason = reason ? reason + '+300k-overlay' : '300k-overlay';
  }

  const breachBody = rewriteBreachConsequences(latest, body, ctx);
  if (breachBody !== body) {
    body = breachBody;
    if (action === 'ESCALATE') action = 'REPLY';
    reason = reason ? reason + '+breach-consequence' : 'breach-consequence';
  }

  const paidResetBody = rewritePaidResetFaq(latest, body, action);
  if (paidResetBody) {
    body = paidResetBody;
    if (action === 'ESCALATE') action = 'REPLY';
    reason = reason ? reason + '+paid-reset-faq' : 'paid-reset-faq';
  }

  if (tradingStagePolicy) {
    const shaped = tradingStagePolicy.shapeReply(latest, body, ctx);
    if (shaped && shaped.body && shaped.body !== body) {
      body = shaped.body;
      if (action === 'ESCALATE' && shaped.reason) action = 'REPLY';
      reason = reason ? reason + '+' + shaped.reason : shaped.reason;
    }
    const direct = action === 'ESCALATE' && !/\b\d{5,}\b/.test(String(latest || '')) && !/\bwhy (?:is|was) my\b/i.test(String(latest || ''))
      ? tradingStagePolicy.directAnswer(latest, ctx) : '';
    if (direct) {
      body = direct;
      action = 'REPLY';
      reason = reason ? reason + '+documented-direct' : 'documented-direct';
    }
  }

  return { action, body, reason };
}

module.exports = {
  claimsCryptoCap,
  CRYPTO_CAP_USD,
  INSTANT_MERGE_DENY,
  CRYPTO_CAP_DENY,
  isInstantMergeAsk,
  alreadyDeniesInstantMerge,
  isCryptoPayoutAsk,
  cryptoOverCapAmount,
  rewriteCryptoCap,
  is300kOverlayAsk,
  rewrite300kOverlay,
  isGeneralPolicyQuestionExtra,
  isRiskRuleAsk,
  isScalpingLimitAsk,
  isScalpingFlagAsk,
  isIpRuleAsk,
  isPaidResetRulesAsk,
  isPaidResetCountAsk,
  looksLikeSoftResetAlias,
  rewritePaidResetFaq,
  rewriteBreachConsequences,
  RISK_RULE_RESET,
  SCALPING_LIMIT_RESET,
  SCALPING_FLAG_REVIEW,
  IP_REVIEW_OPTIONS,
  PAID_RESET_SAME_RULES,
  applyPolicyFacts,
};
