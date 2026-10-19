'use strict';

/**
 * Canonical trading-policy concepts for Luna (ticket 215476261979405).
 *
 * Authority: official FAQ, then explicit owner rules, then approved-internal facts.
 * Stages are distinct and must not inherit each other's rules:
 *   evaluation     — challenge / eval phase
 *   funded         — simulated funded phase (product cards call this "Live")
 *   real-capital   — invitation-only real-capital Live Account
 *
 * Standard 1-Step + Free Retry, 2-Step + Free Retry, Lite 1-Step and Lite 2-Step
 * have no consistency rule. The $300k+ 60% overlay, Instant, Catalyst, Flash and
 * Custom stay explicit exceptions and never prove the standard rule.
 */

const OFFICIAL_PRODUCTS = [
  { id: '1-step', name: '1-Step + Free Retry' },
  { id: '2-step', name: '2-Step + Free Retry' },
  { id: 'lite-1-step', name: 'Lite 1-Step' },
  { id: 'lite-2-step', name: 'Lite 2-Step' },
  { id: 'instant-standard', name: 'Instant Standard' },
  { id: 'instant-elite', name: 'Instant Elite' },
  { id: 'flash', name: 'Flash Activation' },
  { id: 'catalyst', name: 'Catalyst' },
  { id: 'custom', name: 'Custom' },
];

const NO_CONSISTENCY = new Set(['1-step', '2-step', 'lite-1-step', 'lite-2-step']);
const CHALLENGE_LEVERAGE_FAMILIES = new Set(['1-step', '2-step', 'lite-1-step', 'lite-2-step', 'flash', 'instant-standard', 'instant-elite', 'instant']);
const ACCOUNT_SIZES_K = new Set([5, 7, 10, 15, 25, 50, 100, 200, 300, 400]);

const PRODUCT_PHRASE = {
  'lite-2-step': 'lite 2-step',
  'lite-1-step': 'lite 1-step',
  '2-step': '2-step free retry',
  '1-step': '1-step free retry',
  instant: 'instant',
  'instant-standard': 'instant standard',
  'instant-elite': 'instant elite',
  catalyst: 'catalyst',
  flash: 'flash activation',
  custom: 'custom',
};

const DISPLAY = {};
for (const p of OFFICIAL_PRODUCTS) DISPLAY[p.id] = p.name;
DISPLAY.instant = 'Instant';

const EVAL_HOLDING =
  'In the evaluation phase, a trade closed under the minimum holding time is still a violation, including when it hits stop loss. If it is an isolated case and the profit from those flagged trades does not exceed the scalp limit on your dashboard, it is a soft breach and the team can reset the account. If that profit exceeds the scalp limit and the violations run through the challenge, it can be treated as a hard breach. That is separate from the funded-stage outcome.';

const FUNDED_FLAG =
  'Even one live/funded trade closed under the minimum holding time can create a scalping flag. That does not automatically require a reset. The Risk Team reviews the case and may adjust the profit split for the current payout cycle as low as 30%.';

const FUNDED_LIMIT_RESET =
  'A Scalping Limit breach on the funded account (qualifying profit from under-minimum-hold trades at or over the dashboard scalping limit) is a soft breach, not immediate termination. You must reset the account to continue; the reset option appears on your dashboard (maximum 3 resets). First reset is 40% of the challenge fee. The second reset costs double the first, and the third costs double the second. While flagged-trade profit stays under that limit, the payout can still be processed at a reduced split and the payout cycle resets. Reaching the limit is not the 30% split outcome.';

const FUNDED_UNDER_OVERVIEW =
  'I can\'t advise how to manage your trades. On a funded account, a stop loss that closes a trade under the minimum holding time can still count. While the profit from those trades stays under the scalp limit, the payout can be processed at a reduced split (as low as 30%) and the payout cycle resets. If that profit reaches the scalp limit, you reset the account from the dashboard to continue (maximum 3 resets). The first reset is 40% of the challenge fee, then each later reset costs double the one before it. The Scalping Add-on changes the minimum holding time to 30 seconds when it is on the account.';

const STAGE_CLARIFY =
  'That outcome depends on the stage. Are you asking about the evaluation, the funded phase, or an invitation-only real-capital Live Account?';

const CATALYST_LEVERAGE =
  'Catalyst leverage is not in the published challenge leverage table, so I cannot state a Catalyst ratio. The table covers 1-Step + Free Retry, 2-Step + Free Retry, Lite, Flash Activation and Instant.';

function norm(s) {
  return String(s || '').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
}

function blobOf(latest, ctx) {
  const prior = (ctx && ctx.priorClientTexts) || [];
  return norm([].concat(prior, latest).join('\n'));
}

function productsInText(q) {
  const t = String(q || '').toLowerCase();
  const found = [];
  const lite2 = /\b(?:lite[\s-]*(?:2|two)[\s-]*step|(?:2|two)[\s-]*step[\s-]*(?:challenge[\s-]*)?lite)\b/;
  const lite1 = /\b(?:lite[\s-]*(?:1|one)[\s-]*step|(?:1|one)[\s-]*step[\s-]*(?:challenge[\s-]*)?lite)\b/;
  if (lite2.test(t)) found.push('lite-2-step');
  if (lite1.test(t)) found.push('lite-1-step');
  if (!lite2.test(t) && /\b(?:2|two)[\s-]*step\b/.test(t)) found.push('2-step');
  if (!lite1.test(t) && /\b(?:1|one)[\s-]*step\b/.test(t)) found.push('1-step');
  if (/\binstant\s+elite\b/.test(t)) found.push('instant-elite');
  else if (/\binstant\s+standard\b/.test(t)) found.push('instant-standard');
  else if (/\binstant\b/.test(t)) found.push('instant');
  if (/\bcatalyst\b/.test(t)) found.push('catalyst');
  if (/\bflash\b/.test(t)) found.push('flash');
  if (/\bcustom\b/.test(t) && /\b(?:challenge|account|checkout)\b/.test(t)) found.push('custom');
  return found;
}

function isComparisonAsk(text) {
  return /\b(?:compare|comparison|differ\w*|versus|\bvs\.?\b|other challenges|different leverage)\b/i.test(String(text || ''));
}

function isLiteFamilyOnly(text) {
  const t = String(text || '');
  if (!/\blite\b/i.test(t)) return false;
  return productsInText(t).length === 0;
}

function resolveProduct(latest, ctx) {
  const named = productsInText(latest);
  if (named.length === 1) return named[0];
  if (named.length > 1) return '';
  if (isLiteFamilyOnly(latest) && !historyProduct(ctx)) return 'lite-family';
  return historyProduct(ctx) || (isLiteFamilyOnly(latest) ? 'lite-family' : '');
}

function historyProduct(ctx) {
  const prior = ((ctx && ctx.priorClientTexts) || []).slice().reverse();
  for (const raw of prior) {
    const t = String(raw || '');
    if (isLiteFamilyOnly(t)) return 'lite-family';
    const found = productsInText(t);
    if (found.length === 1) return found[0];
  }
  return '';
}

function productPhraseFromHistory(latest, priorTexts) {
  if (isComparisonAsk(latest)) return '';
  if (productsInText(latest).length || isLiteFamilyOnly(latest)) return '';
  const id = historyProduct({ priorClientTexts: priorTexts || [] });
  if (!id || id === 'lite-family') return id === 'lite-family' ? 'lite' : '';
  return PRODUCT_PHRASE[id] || '';
}

function detectStage(latest, ctx) {
  const t = norm(latest);
  if (/\b(?:invitation[-\s]?only|real[-\s]?capital|transition to live|real brokerage)\b/i.test(t)) return 'real-capital';
  if (/\b(?:eval(?:uation)?|challenge phase|during the challenge|in (?:my |the )?eval)\b/i.test(t)) return 'evaluation';
  if (/\bphase\s*[12]\b/i.test(t) && !/\b(?:funded|after (?:i |you )?pass)\b/i.test(t)) return 'evaluation';
  if (/\b(?:after (?:i |you )?pass(?:ed|ing)?|once funded|funded (?:phase|stage|account)|simulated funded|when funded)\b/i.test(t)) return 'funded';
  if (/\b(?:on a live|live phase|live account|my live)\b/i.test(t)) return 'funded';
  const prior = norm(((ctx && ctx.priorClientTexts) || []).slice(-6).join('\n'));
  if (!prior) return 'unknown';
  if (/\b(?:eval(?:uation)?|challenge phase|in (?:my |the )?eval)\b/i.test(prior) && !/\b(?:funded|live)\b/i.test(t)) return 'evaluation';
  if (/\b(?:on a live|live phase|funded)\b/i.test(prior) && !/\beval/i.test(t)) return 'funded';
  return 'unknown';
}

function accountSizeK(latest, ctx) {
  const text = blobOf(latest, ctx);
  const found = [];
  for (const m of text.matchAll(/\$?\s*(\d{2,3})\s*k\b/gi)) {
    const n = Number(m[1]);
    if (ACCOUNT_SIZES_K.has(n)) found.push(n);
  }
  return found.length ? found[found.length - 1] : null;
}

function isConsistencyAsk(text) {
  return /\bconsist(?:ency|ent)\b/i.test(String(text || ''));
}

function isLeverageAsk(text) {
  return /\bleverage\b/i.test(String(text || '')) || /\b(?:nas\s*100|nasdaq|nq\b|us30|ger40|indici?es)\b/i.test(String(text || ''));
}

function isGenericRulesAsk(text) {
  const t = norm(text);
  return /^(?:what are the rules|what are your rules|rules\??|what are the trading rules)\??$/i.test(t) ||
    /\bwhat are the rules\b/i.test(t) && t.split(/\s+/).length <= 8;
}

function isHoldingOrScalpAsk(text) {
  const t = String(text || '');
  return /\b(?:scalp\w*|holding time|under \d|less than \d|3\s*min|minimum hold)\b/i.test(t);
}

function assetClass(text) {
  const t = String(text || '');
  if (/\b(?:nas\s*100|nasdaq|\bnq\b|us30|ger40|us100|indici?es|index)\b/i.test(t)) return 'indices';
  if (/\b(?:xau|xag|gold|silver|metals?)\b/i.test(t)) return 'metals';
  if (/\b(?:forex|\bfx\b|eurusd|gbpusd)\b/i.test(t)) return 'fx';
  if (/\b(?:oil|ukoil|usoil|brent|wti)\b/i.test(t)) return 'oil';
  if (/\b(?:ngas|natural gas)\b/i.test(t)) return 'ngas';
  return '';
}

function thresholdState(text) {
  const t = String(text || '');
  if (/\b(?:does not|doesn't|do not|not)\s+reach|\bnot (?:met|reached|exceeded)\b|\bbelow the\b|\bunder the (?:scalp|threshold|limit)\b|\bstays? under\b/i.test(t)) return 'not-met';
  if (/\b(?:reach(?:es|ed|ing)?|exceed(?:s|ed|ing)?|hits?|met|over|above)\b[\s\S]{0,40}\b(?:threshold|scalp(?:ing)?\s+limit|scalp limit)\b/i.test(t)) return 'met';
  if (/\b(?:threshold|scalp(?:ing)?\s+limit)\b[\s\S]{0,40}\b(?:reach(?:es|ed)?|exceed(?:s|ed)?|met)\b/i.test(t)) return 'met';
  return 'unknown';
}

function consistencySentence(product, sizeK) {
  const name = DISPLAY[product] || 'this challenge';
  let line = 'No, the standard ' + name + ' does not have a consistency rule.';
  if (sizeK != null && sizeK >= 300) {
    line += ' This size also has the separate $300k overlay: a 60% consistency rule (most profitable day at or under 60% of total profit) and 5 minimum trading days.';
  } else if (sizeK == null) {
    line += ' Accounts of $300k and larger have a separate 60% consistency overlay on top of the challenge.';
  }
  return line;
}

function indicesLeverageSentence(stage, product) {
  const name = (product && DISPLAY[product] && product !== 'lite-family') ? DISPLAY[product] : 'Lite 2-Step';
  if (stage === 'real-capital') {
    return 'An invitation-only real-capital Live Account uses 1:100 on Forex, Indices and Metals. That leverage does not apply to the evaluation or the funded phase of a challenge. On ' + name + ', NAS100/NQ stays 1:10 in both the evaluation and the funded phase.';
  }
  if (stage === 'evaluation') {
    return 'On ' + name + ', NAS100/NQ is an index. Indices use 1:10 during the evaluation, and that same 1:10 stays after you pass into the funded phase. 1:100 on indices applies only to an invitation-only real-capital Live Account, not to the funded phase.';
  }
  return 'On a funded ' + name + ' account, NAS100/NQ is an index and stays at 1:10. It does not move to 1:100 after you pass. 1:100 on indices applies only to an invitation-only real-capital Live Account.';
}

function knownProductRulesLine(product) {
  const name = DISPLAY[product];
  if (!name || !NO_CONSISTENCY.has(product)) return '';
  return 'On ' + name + ', the standard version has no consistency rule. Indices stay at 1:10 in the evaluation and in the funded phase. The minimum holding time is 3 minutes, or 30 seconds with the scalping add-on.';
}

function rulesOverviewReply(product) {
  if (product === 'lite-family') {
    return 'Lite is two products, Lite 1-Step and Lite 2-Step. Both use the published challenge leverage table, and the standard versions have no consistency rule. Profit target, daily loss and the payout schedule differ between them. Which one is your account, Lite 1-Step or Lite 2-Step?';
  }
  const names = OFFICIAL_PRODUCTS.map((p) => p.name).join(', ');
  return 'Exact limits depend on the challenge. One rule that applies across products is the minimum holding time: 3 minutes, or 30 seconds with the scalping add-on. Profit target, loss limits and the payout schedule are set per product. Which product is it: ' + names + '?';
}

function asksWhichProduct(sentence) {
  return /\b(?:which|what)\s+(?:product|version|challenge)\b|\bsuch as\b|\bLite has two\b|\bwhich one is your\b/i.test(String(sentence || ''));
}

function listIsIncomplete(body) {
  const t = String(body || '');
  if (!asksWhichProduct(t)) return false;
  const required = ['1-Step + Free Retry', '2-Step + Free Retry', 'Lite 1-Step', 'Lite 2-Step', 'Instant Standard', 'Instant Elite', 'Flash Activation', 'Catalyst', 'Custom'];
  // A Lite-only follow-up is complete when both Lite names are present and it is not offering a catalog.
  if (/\blite 1-step\b/i.test(t) && /\blite 2-step\b/i.test(t) && !/\b1-step \+ free retry\b/i.test(t) && /\blite has two\b/i.test(t)) return false;
  return required.some((name) => !t.includes(name));
}

function isTradingRuleDuration(sentence, match) {
  const s = norm(sentence);
  const m = norm(match);
  if (!m || !/\b(?:within|after|at least|under|less than)\b/i.test(s) && !/\bwithin\b/i.test(m)) {
    if (!/\b(?:minutes?|hours?|days?)\b/i.test(m)) return false;
  }
  if (/\b(?:we|i|our team|support)\b/i.test(s) && /\b(?:will|ll|reply|respond|get back|fix|resolve|update you)\b/i.test(s)) return false;
  if (/\b(?:reply|respond|get back to you)\b/i.test(s) && /\bwithin\b/i.test(m + ' ' + s)) return false;
  if (/\byour (?:issue|ticket|case|request)\b/i.test(s) && /\b(?:will be|fixed|resolved|done)\b/i.test(s)) return false;
  if (/\b(?:trade|trades|position|positions|holding|hold|stop[- ]?loss|\bsl\b|scalp|remain open|open for|closed|minimum)\b/i.test(s)) return true;
  if (/\b(?:eligible|eligibility|add-?on)\b/i.test(s) && /\b(?:after|within)\b/i.test(s)) return true;
  if (/\b(?:payout|withdrawal)\b/i.test(s) && /\b(?:period|cycle|interval|window|every)\b/i.test(s) && !/\bwill be (?:paid|processed|approved)\b/i.test(s)) return true;
  return false;
}

function isPurePublicHedge(body) {
  const t = norm(body);
  if (!/\b(?:cannot confirm|can't confirm|unable to confirm|check your dashboard)\b/i.test(t)) return false;
  if (/\b(?:1:\d{2,3}|does not have a consistency|no consistency rule|30%|40% of the challenge fee)\b/i.test(t)) return false;
  return true;
}

function isNonActionableTeammateNote(plain) {
  const raw = norm(plain);
  if (!raw) return true;
  if (/\b(?:please|pls|can you|could you|need you to|reply|respond|stop|pause|resume|close|escalate|assign|check|summar(?:y|ise|ize)?|explain|send|tell the client|ask|confirm|mention|forward|assist|don't|do not|ignore|look at|review|fix|update|open this|skip)\b/i.test(raw)) return false;
  const rest = raw
    .replace(/@(?:arsal|jerry|luna)\b/gi, ' ')
    .replace(/\b(?:arsal|jerry)(?:\s*-\s*manager)?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!rest) return true;
  if (/^(?:in this (?:chat|ticket|conversation)|here|fyi|for your (?:info|information)|heads up|just (?:an )?fyi)[.!]?$/i.test(rest)) return true;
  if (/^in this (?:chat|ticket|conversation)\b/i.test(rest)) return true;
  if (/^(?:fyi|for your info|heads up|just so you know)\b/i.test(rest)) return true;
  return false;
}

function retrievalScope(clientText, priorTexts) {
  const latest = String(clientText || '');
  const ctx = { priorClientTexts: priorTexts || [] };
  const comparison = isComparisonAsk(latest);
  let ids = productsInText(latest);
  let family = '';
  let inherited = false;
  if (!ids.length && isLiteFamilyOnly(latest)) family = 'lite';
  if (!comparison && !ids.length && !family) {
    const hist = historyProduct(ctx);
    if (hist === 'lite-family') family = 'lite';
    else if (hist) {
      ids = [hist];
      inherited = true;
    }
  }
  const topic = isConsistencyAsk(latest) ? 'consistency'
    : (isLeverageAsk(latest) ? 'leverage'
      : (isHoldingOrScalpAsk(latest) ? 'scalping' : ''));
  const stage = detectStage(latest, ctx);
  return {
    strict: !comparison && ids.length === 1 ? ids[0] : '',
    family: family,
    comparison,
    inherited,
    topic,
    stage,
    realCapitalAsk: /\b(?:invitation|real[-\s]?capital|transition to live)\b/i.test(latest),
  };
}

function articleExcluded(articleProduct, scope) {
  if (!scope || scope.comparison) return false;
  const p = articleProduct || '';
  if (!p) return false;
  if (scope.strict) {
    if (p === scope.strict) return false;
    if ((scope.strict === 'instant' || scope.strict === 'instant-standard' || scope.strict === 'instant-elite') && p === 'instant') return false;
    return true;
  }
  if (scope.family === 'lite') return p !== 'lite-1-step' && p !== 'lite-2-step';
  return false;
}

function forcePromptSupplement(toolKnowledge) {
  const rows = Array.isArray(toolKnowledge) ? toolKnowledge : [];
  const chunks = [];
  for (const k of rows) {
    if (!k || !k.text) continue;
    chunks.push('TITLE: ' + String(k.title || 'Approved article') + '\n' + String(k.text).slice(0, 2500));
  }
  if (!chunks.length) return '';
  return '\n\nTOOL RETRIEVED EVIDENCE (approved articles already retrieved for this turn; use them together with OFFICIAL FAQ CONTEXT; do not answer as if this evidence was missing):\n' +
    chunks.join('\n---\n').slice(0, 12000);
}

function hedgeSentences(body) {
  return String(body || '').split(/(?<=[.!?])\s+/).filter((s) =>
    /\b(?:cannot confirm|can't confirm|unable to confirm|check your dashboard before)\b/i.test(s));
}

function withoutHedgeSentences(body) {
  return String(body || '').split(/(?<=[.!?])\s+/).filter((s) =>
    !/\b(?:cannot confirm|can't confirm|unable to confirm|check your dashboard before)\b/i.test(s)).join(' ').trim();
}

function shapeReply(latest, body, ctx) {
  ctx = ctx || {};
  let out = String(body || '');
  const reasons = [];
  const product = resolveProduct(latest, ctx);
  const stage = detectStage(latest, ctx);
  const sizeK = accountSizeK(latest, ctx);

  if (isConsistencyAsk(latest) && NO_CONSISTENCY.has(product) && !/\b(?:rejected|why was my|account\s*(?:number|#)\s*\d{4,})\b/i.test(latest)) {
    const fact = consistencySentence(product, sizeK);
    const rest = withoutHedgeSentences(out).replace(/[^.!?]*\bcatalyst\b[^.!?]*[.!?]?/gi, '').trim();
    if (hedgeSentences(out).length || !/does not have a consistency rule|no consistency rule/i.test(out)) {
      out = /does not have a consistency rule|no consistency rule/i.test(rest) ? rest : (fact + (rest ? ' ' + rest : '')).trim();
      reasons.push('consistency-direct');
    }
  }

  if (isLeverageAsk(latest) && product === 'catalyst' && !isComparisonAsk(latest) && /\b1\s*:\s*\d+/.test(out)) {
    out = CATALYST_LEVERAGE;
    reasons.push('leverage-catalyst-undocumented');
  } else if (isLeverageAsk(latest) && assetClass(latest + ' ' + out) === 'indices' && product !== 'catalyst') {
    const wrongFunded = /1\s*:\s*100/.test(out) && stage !== 'real-capital';
    const missingRealCapital = stage === 'real-capital' && !/1\s*:\s*100/.test(out);
    if (wrongFunded || missingRealCapital) {
      const useStage = stage === 'evaluation' ? 'evaluation' : (stage === 'real-capital' ? 'real-capital' : 'funded');
      out = indicesLeverageSentence(useStage, product);
      reasons.push('leverage-stage');
    }
  }

  if (isHoldingOrScalpAsk(latest) || thresholdState(latest + ' ' + out) !== 'unknown') {
    const next = rewriteScalping(latest, out, ctx);
    if (next !== out) {
      out = next;
      reasons.push('scalping-stage');
    }
  }

  if (isGenericRulesAsk(latest)) {
    const knownExact = NO_CONSISTENCY.has(product) || product === 'catalyst' || product === 'flash' || product === 'instant-standard' || product === 'instant-elite';
    if (knownExact && (listIsIncomplete(out) || asksWhichProduct(out))) {
      const hint = knownProductRulesLine(product);
      if (hint) {
        out = hint;
        reasons.push('rules-known-product');
      }
    } else if (!knownExact && (listIsIncomplete(out) || asksWhichProduct(out) || !out.trim())) {
      out = rulesOverviewReply(product === 'lite-family' ? 'lite-family' : '');
      reasons.push('rules-overview');
    }
  }
  if (product && product !== 'lite-family' && asksWhichProduct(out)) {
    const kept = out.split(/(?<=[.!?])\s+/).filter((s) => !asksWhichProduct(s)).join(' ').trim();
    if (kept && kept !== out) {
      out = kept;
      reasons.push('product-already-known');
    } else if (!kept) {
      const hint = knownProductRulesLine(product);
      if (hint) {
        out = hint;
        reasons.push('product-already-known');
      }
    }
  }

  out = out.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.!?])/g, '$1').trim();
  return { body: out, reason: reasons.join('+') };
}

function rewriteScalping(latest, body, ctx) {
  let out = String(body || '');
  const stage = detectStage(latest, ctx);
  const state = thresholdState(latest + '\n' + out);
  const fundedFlagLanguage = /live\/funded trade|as low as 30%|current payout cycle/i.test(out);
  const forfeiture = /won'?t be processed|will not be processed|profits? (?:will be |are )?forfeit/i.test(out);
  const invertedMet = state === 'met' && /30\s*%/.test(out) && /(?:split|payout)/i.test(out) &&
    /reach|exceed|threshold|limit/i.test(latest + ' ' + out);
  const invertedNot = state === 'not-met' && /\b(?:must|have to|required to)\s+reset\b/i.test(out) &&
    !(/\b(?:does not|do not|doesn't)\s+automatically\b/i.test(out) || /\bnot automatically require\b/i.test(out));

  if (stage === 'evaluation') {
    if (fundedFlagLanguage || forfeiture || /1\s*:\s*100/.test(out)) {
      return state === 'met' ? EVAL_HOLDING : EVAL_HOLDING;
    }
    if (/\b(?:must|have to)\s+reset\b/i.test(out) && /as low as 30%|live\/funded/.test(out)) return EVAL_HOLDING;
    return out;
  }

  if (invertedMet && stage !== 'evaluation') return FUNDED_LIMIT_RESET;
  if (invertedNot) return FUNDED_FLAG;
  if (forfeiture && isHoldingOrScalpAsk(latest)) {
    if (state === 'met' || /scalp limit|scalping limit/i.test(latest + ' ' + out)) return FUNDED_LIMIT_RESET;
    return FUNDED_UNDER_OVERVIEW;
  }
  if (stage === 'unknown' && fundedFlagLanguage && /\beval/i.test(blobOf(latest, ctx))) return EVAL_HOLDING;
  if (stage === 'unknown' && isHoldingOrScalpAsk(latest) && !/scalping\s+flag/i.test(latest) && fundedFlagLanguage && /\beval/i.test(latest)) {
    return EVAL_HOLDING;
  }
  return out;
}

function directAnswer(latest, ctx) {
  ctx = ctx || {};
  const product = resolveProduct(latest, ctx);
  const stage = detectStage(latest, ctx);
  if (isConsistencyAsk(latest) && NO_CONSISTENCY.has(product) && !/\b(?:80\s*%|\$\s*\d|\bpayout\b|\bprofit\b)/i.test(latest)) {
    return consistencySentence(product, accountSizeK(latest, ctx));
  }
  if (isLeverageAsk(latest) && product === 'catalyst' && !isComparisonAsk(latest)) {
    return CATALYST_LEVERAGE;
  }
  if (isLeverageAsk(latest) && assetClass(latest) === 'indices' && product !== 'catalyst' && !isComparisonAsk(latest)) {
    if (product === 'lite-2-step' || product === 'lite-1-step' || product === 'lite-family' || CHALLENGE_LEVERAGE_FAMILIES.has(product) || stage !== 'unknown') {
      return indicesLeverageSentence(stage === 'evaluation' ? 'evaluation' : (stage === 'real-capital' ? 'real-capital' : 'funded'), product);
    }
  }
  if (isGenericRulesAsk(latest) && !NO_CONSISTENCY.has(product) && product !== 'catalyst' && product !== 'flash') {
    return rulesOverviewReply(product === 'lite-family' ? 'lite-family' : '');
  }
  return '';
}

module.exports = {
  OFFICIAL_PRODUCTS,
  NO_CONSISTENCY,
  EVAL_HOLDING,
  FUNDED_FLAG,
  FUNDED_LIMIT_RESET,
  FUNDED_UNDER_OVERVIEW,
  STAGE_CLARIFY,
  productsInText,
  resolveProduct,
  productPhraseFromHistory,
  detectStage,
  accountSizeK,
  isConsistencyAsk,
  isLeverageAsk,
  isGenericRulesAsk,
  isHoldingOrScalpAsk,
  assetClass,
  thresholdState,
  consistencySentence,
  indicesLeverageSentence,
  rulesOverviewReply,
  listIsIncomplete,
  isTradingRuleDuration,
  isPurePublicHedge,
  isNonActionableTeammateNote,
  retrievalScope,
  articleExcluded,
  forcePromptSupplement,
  shapeReply,
  rewriteScalping,
  directAnswer,
  isComparisonAsk,
};
