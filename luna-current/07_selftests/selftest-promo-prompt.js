'use strict';
const fs = require('fs');
const p = require('./september-promos.js');
let fail = 0;
function assert(name, cond, detail) {
  if (!cond) {
    console.log('FAIL', name, detail || '');
    fail++;
  } else {
    console.log('PASS', name);
  }
}

/** soft-edges: plan-diff may return null OR { useExistingRulesFlow:true, reply:null } */
function isRulesBypass(r) {
  if (r == null) return true;
  if (typeof r === 'object' && r.useExistingRulesFlow === true && (r.reply == null || r.reply === '')) return true;
  return false;
}

{
  const r = p.answerPromotionQuestion('discount on 1 step free retry');
  assert('1step-has-35', /35%/.test(r) && /SEP35/i.test(r), r);
  assert('1step-weekly', /weekly/i.test(r), r);
  assert('1step-no-40', !/40%/.test(r), r);
  assert('1step-no-canned', !/2 challenges\s*=\s*40%/i.test(r), r);
}
{
  const r1 = p.answerPromotionQuestion('how does bulk discount work');
  const r2 = p.answerPromotionQuestion('bulk discount');
  assert('bulk-how-auto', /automatically|scale|increase/i.test(r1) && /checkout/i.test(r1), r1);
  assert('bulk-no-canned-required', !/2 challenges\s*=\s*40%/i.test(r1), r1);
  assert('bulk-generic', /increase|checkout/i.test(r2), r2);
  assert('bulk-no-canned-2', !/2 challenges\s*=\s*40%/i.test(r2), r2);
  assert('bulk-no-invented-tiers', !/45%|3 challenges\s*=/i.test(r1 + r2), r1 + r2);
}
{
  const r = p.answerPromotionQuestion('instant elite 300k discount');
  assert('ie-300k-50', /50%/.test(r) && !/40%/.test(r), r);
}
{
  const r = p.answerPromotionQuestion('FLASH5 flash activation offer');
  assert('flash5', /FLASH5/i.test(r) && /activation/i.test(r) && /separate/i.test(r), r);
}
{
  const r = p.answerPromotionQuestion(
    'can I use NEW50 as existing customer who already purchased'
  );
  assert(
    'new50-existing',
    /not apply|not eligible|does not apply|existing/i.test(r) && /NEW50/i.test(r),
    r
  );
}
{
  const r = p.answerPromotionQuestion('catalyst discount?');
  assert('catalyst-no', /no (promotional )?discount/i.test(r) || /not currently/i.test(r), r);
}
{
  const hist = [
    { role: 'user', text: 'any promo?' },
    {
      role: 'assistant',
      text: 'Yes — SEP35, FLASH5, NEW50. Which challenge are you asking about?',
    },
  ];
  const r2 = p.handleCustomerMessage('2 step', hist);
  assert(
    'hist-2step-family',
    /Free Retry/i.test(r2) && /Lite/i.test(r2) && /SEP35/i.test(r2) && /35%/.test(r2),
    r2
  );
  assert('hist-2step-no-40', !/40%/.test(r2), r2);
}

const idx = fs.readFileSync('./index.js', 'utf8');
assert('wired-require', idx.includes("require('./september-promos')"));
assert('wired-resolve', idx.includes('function resolvePromoReply'));
assert('wired-contextual-ai', idx.includes('PROMO_CONTEXTUAL_AI'));
assert('no-canned-direct-send', !idx.includes("postProcessModelReply(promoResolved.reply, conversationId)"));
assert('wired-engine', /fresh-2026-09-16-/.test(idx) || /fresh-2026-09-15-(promo-scope|soft-edges-v1)/.test(idx));
assert('wired-prompt-module', fs.existsSync('./fundedelite-promotion-prompt.js'));
const promptMod = require('./fundedelite-promotion-prompt.js');
assert('prompt-export', typeof promptMod.FUNDEDELITE_PROMOTION_PROMPT === 'string' && /SEP35/.test(promptMod.FUNDEDELITE_PROMOTION_PROMPT));
assert('promos-exports-prompt', typeof p.FUNDEDELITE_PROMOTION_PROMPT === 'string');
const sp = fs.readFileSync('./system-prompt.txt', 'utf8');
assert('prompt-hard-rule', sp.includes('HARD RULE — SEPTEMBER 2026 PROMOTIONS'));
assert(
  'prompt-bulk-natural',
  /final % at checkout|final percentage is shown at checkout/i.test(sp)
);
assert(
  'prompt-no-wipe',
  sp.includes('HARD RULE — NEVER GATE KB/POLICY') &&
    sp.includes('HARD RULE — CATALYST MAX LOSS')
);
assert('prompt-promo-no-template', /not as a reply template/i.test(sp) && /Never paste a compressed canned list/i.test(sp));


{
  const r = p.handleCustomerMessage('What is difference between lite and standard?', []);
  assert('diff-lite-standard-null', isRulesBypass(r), r);
  assert('diff-is-plan', p.isPlanDifferenceOrFeaturesAsk('What is difference between lite and standard?') === true);
}
{
  const r = p.handleCustomerMessage('lite vs free retry differences', []);
  assert('lite-vs-freeretry-null', isRulesBypass(r), r);
}
{
  const r = p.handleCustomerMessage('any discount on 2 step lite?', []);
  assert('discount-2step-lite-promo', /SEP35/i.test(r) && /35%/.test(r), r);
}
{
  const hist = [
    { role: 'user', text: 'any promo?' },
    {
      role: 'assistant',
      text: 'Yes — SEP35, FLASH5, NEW50. Which challenge are you asking about?',
    },
  ];
  const r2 = p.handleCustomerMessage('2 step', hist);
  assert(
    'hist-promo-2step-still-promo',
    /Free Retry/i.test(r2) && /Lite/i.test(r2) && /SEP35/i.test(r2),
    r2
  );
}
{
  const r = p.handleCustomerMessage('what is daily loss on Lite', []);
  assert('daily-loss-lite-null', isRulesBypass(r), r);
}
{
  // Exact Arsal 3-turn bug repro
  const hist = [
    { role: 'user', text: 'what is difference between lite and standard?' },
    {
      role: 'assistant',
      text: 'Which challenge are you interested in — 1-Step or 2-Step?',
    },
  ];
  assert('hist-features', p.historyLooksLikePlanDifference(hist) === true);
  assert('hist-not-promo', p.historyLooksLikePromotions(hist) === false);
  const intent = p.resolveConversationIntent('2 step', hist);
  assert('diff-followup-topic-rules', intent && intent.topic === 'rules' && intent.useExistingRulesFlow === true, JSON.stringify(intent));
  const r = p.handleCustomerMessage('2 step', hist);
  assert('diff-followup-2step-null', isRulesBypass(r), r);
  assert('diff-followup-no-sep35', isRulesBypass(r) || (typeof r === 'string' && !/SEP35/i.test(r)));
}
{
  const prompt = p.FUNDEDELITE_PROMOTION_PROMPT;
  assert('scope-control-in-prompt', /SCOPE CONTROL — READ BEFORE ANSWERING/.test(prompt));
  assert('scope-before-sep35', prompt.indexOf('SCOPE CONTROL') < prompt.indexOf('SEP35'));
}
{
  const sp = fs.readFileSync('./system-prompt.txt', 'utf8');
  assert('scope-in-system-prompt', /SCOPE CONTROL — READ BEFORE ANSWERING/.test(sp));
  const hard = sp.indexOf('HARD RULE — SEPTEMBER 2026 PROMOTIONS');
  const scope = sp.indexOf('SCOPE CONTROL — READ BEFORE ANSWERING');
  assert('scope-under-sept-hard-rule', hard >= 0 && scope > hard && scope < hard + 800, 'hard=' + hard + ' scope=' + scope);
}
{
  assert('exports-plan-diff', typeof p.isPlanDifferenceOrFeaturesAsk === 'function');
  assert('exports-hist-features', typeof p.historyLooksLikePlanDifference === 'function');
}
{
  // Regression lock: "offer" used as a VERB ("what services/do you offer") is a generic
  // company-services question, not a promo/discount ask, and must bypass to the normal
  // FAQ/rules flow (null) instead of the canned SEP35/FLASH5/NEW50 pitch (live conv
  // 215475986818995: client asked "What services do you guys offer?" after "what is
  // fundedelite" and got the wrong promo pitch back).
  const hist = [
    { role: 'user', text: 'what is fundedelite' },
    { role: 'assistant', text: 'FundedElite is a proprietary trading firm.' },
  ];
  assert('offer-verb-services-null', isRulesBypass(p.handleCustomerMessage('What services do you guys offer ?', hist)));
  assert('offer-verb-do-you-offer-null', isRulesBypass(p.handleCustomerMessage('what do you guys offer', [])));
  assert('offer-verb-does-fundedelite-null', isRulesBypass(p.handleCustomerMessage('what does fundedelite offer', [])));
  // "offer" as a NOUN must still be treated as a real promo signal.
  const r1 = p.handleCustomerMessage('any offers running?', []);
  assert('offer-noun-any-offers-promo', typeof r1 === 'string' && /SEP35/i.test(r1), r1);
  const r2 = p.handleCustomerMessage('is there a special offer', []);
  assert('offer-noun-special-offer-promo', typeof r2 === 'string' && /SEP35/i.test(r2), r2);
}

console.log(fail === 0 ? 'ALL_PASS' : 'FAILURES=' + fail);
process.exit(fail === 0 ? 0 : 1);
