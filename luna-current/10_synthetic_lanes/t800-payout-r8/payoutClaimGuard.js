'use strict';

/**
 * T800 payout claim guard R8 — frozen synthetic candidate. Not approved.
 *
 * Owner-final outcome rules (they override Help Centre wording where they differ).
 * These are constraints on what a draft may claim. They are not new policy text:
 *   - A funded Strategy Risk breach is a soft breach with a reset, never termination.
 *   - A funded reset is allowed only at breakeven or in profit, never in drawdown.
 *   - Previous-cycle profit is not payable after a reset.
 *   - Completed payouts are not reversed.
 * Soft breach, funded reset, and scalp/weekend reset stay separate outcomes.
 *
 * Unresolved, left held, not decided here:
 *   crypto 500 USD cap vs a live any-amount rule,
 *   FAQ vs Help Centre authority,
 *   Catalyst stage-erasure.
 *
 * Not wired into index.js. The proposed hook is index.js.before-send.diff.
 * 01_runtime/statePresend is absent; this module does not require it.
 * 02_statePresend is optional and used only to reuse the existing hedge pattern.
 * approved is false. release is false. No Intercom, secrets, or network.
 */

const STATUS = Object.freeze({
  candidate: 't800-payout-r8',
  frozen: true,
  approved: false,
  release: false,
});

const CLIENT_MESSAGE = "I can't confirm that. Our team will confirm.";

// Same pattern as 02_statePresend/knowledgeGapGate.js HEDGE_RE. Kept locally so a
// missing statePresend directory does not throw on load.
const FALLBACK_HEDGE_RE = /\b(?:i(?:'m| am) not (?:100% )?sure|i (?:will|'ll) (?:check|confirm)|let me (?:check|confirm)|our team will confirm|i cannot confirm|i can't confirm|to be confirmed|i don't have that information|i do not have that information)\b/i;

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

const RESET_VERBS = 'reset|restored';
const STATUS_VERBS = 'paid|sent|processed|restored|reversed|cancelled|canceled|reset';
const STATUS_NOUNS = 'payouts?|withdrawals?|payments?|refunds?|disbursements?|accounts?|credentials?';

const EN_RESET = new RegExp(
  String.raw`\b(?:` +
    String.raw`(?:i|we)(?:\s*'\s*ve|\s+have|\s+already)\s+(?:just\s+)?(?:${RESET_VERBS})` +
    String.raw`|(?:i|we)\s+(?:just\s+)?(?:${RESET_VERBS})` +
    String.raw`|(?:your|the)\s+(?:account|payout|withdrawal|challenge|balance|cycle|credentials?)\s+(?:has\s+been|have\s+been|was|were|is\s+now|are\s+now)\s+(?:${RESET_VERBS})` +
    String.raw`|(?:it|this)\s+(?:has\s+been|have\s+been|was|were)\s+(?:${RESET_VERBS})` +
    String.raw`|(?:reset|restore)\s+(?:has\s+been|is)\s+(?:done|completed|applied)` +
  String.raw`)\b`,
  'i'
);

const EN_STATUS = new RegExp(
  String.raw`\b(?:` +
    String.raw`(?:i|we)(?:\s*'\s*ve|\s+have|\s+already)\s+(?:just\s+)?(?:${STATUS_VERBS})` +
    String.raw`|(?:i|we)\s+(?:just\s+)?(?:${STATUS_VERBS})` +
    String.raw`|(?:your|the|this)\s+(?:${STATUS_NOUNS})\s+(?:has\s+been|have\s+been|was|were|is\s+now|are\s+now)\s+(?:${STATUS_VERBS})` +
    String.raw`|(?:${STATUS_NOUNS})\s+(?:has\s+been|have\s+been|was|were|is\s+now|are\s+now)\s+(?:${STATUS_VERBS})` +
  String.raw`)\b`,
  'i'
);

const IT_CLAIM = /\b(?:ho|abbiamo)\s+(?:ripristinato|resettato)\b|\b(?:è|e')\s+stato\s+(?:ripristinato|resettato)\b/i;
const AR_RESET = /(?:تم|تمت)\s+إعادة\s+تعيين|(?:تم|تمت)\s+استعادة/;

function sentences(text) {
  return String(text || '')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?؟।۔])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function clip(text) {
  return String(text || '').replace(/[.!?؟।۔]+\s*$/g, '').trim();
}

function isQuestion(sentence) {
  const s = String(sentence || '').trim();
  if (/[?؟]\s*$/.test(s)) return true;
  if (/^(?:do|does|did)\s+not\b/i.test(s)) return false;
  if (/^(?:can|could|may|might|should|would|will|shall|do|does|did|is|are|was|were|how|what|when|where|why|which|whose)\b/i.test(s)) return true;
  if (/^(?:have|has)\s+(?:i|we|you|they|the|a|your)\b/i.test(s)) return true;
  if (/\b(?:can|could|may|might|should)\s+(?:i|we|you)\b/i.test(s) && !/\b(?:cannot|can't|can\s+not)\b/i.test(s)) return true;
  if (/^(?:هل|أ)/.test(s)) return true;
  if (/^(?:کیا|کيا)\b/.test(s)) return true;
  if (/^क्या\b/.test(s)) return true;
  if (/^(?:можно|как|что|когда|где|почему)\b/i.test(s)) return true;
  return false;
}

function isHedgeSentence(sentence) {
  return HEDGE_RE.test(String(sentence || ''));
}

function withholdNote(text) {
  const t = String(text || '');
  if (/\b(?:do\s+not|don't|never|must\s+not|not\s+to)\b[\s\S]{0,48}\b(?:tell|inform|notify|mention|share|disclose|say)\b[\s\S]{0,40}\b(?:the\s+)?(?:clients?|customers?|traders?|users?|them|him|her)\b/i.test(t)) return true;
  if (/\b(?:clients?|customers?|traders?)\b[\s\S]{0,32}\b(?:must\s+not|should\s+not|is\s+not\s+to)\s+be\s+(?:told|informed|notified)\b/i.test(t)) return true;
  if (/\b(?:do\s+not|don't|never)\s+(?:tell|inform|notify|mention|disclose)\b/i.test(t) && /\b(?:clients?|customers?|traders?)\b/i.test(t)) return true;
  return false;
}

function hasArabicWord(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    '(?:^|[^\\p{Script=Arabic}\\p{L}\\p{N}])[\\p{Script=Arabic}]?(?:ال)?' +
      escaped +
      '(?:$|[^\\p{Script=Arabic}\\p{L}\\p{N}])',
    'u'
  );
  return re.test(String(text || ''));
}

function hasSarfCue(text) {
  return /(?:^|[^\p{Script=Arabic}\p{L}\p{N}])صرف[\p{Script=Arabic}]{0,3}(?=$|[^\p{Script=Arabic}\p{L}\p{N}])/u.test(
    String(text || '')
  );
}

function hasPayoutCue(text) {
  return hasArabicWord(text, 'الدفعة') || hasArabicWord(text, 'الدفع') || hasSarfCue(text);
}

function hasSahb(text) {
  return /(?:^|[^\p{Script=Arabic}\p{L}\p{N}])[\p{Script=Arabic}]?(?:ال)?سحب(?=$|[^\p{Script=Arabic}\p{L}\p{N}])/u.test(
    String(text || '')
  );
}

function hasLossWord(text) {
  return (
    hasArabicWord(text, 'خسارة') ||
    hasArabicWord(text, 'خسائر') ||
    /\bloss\b/i.test(text) ||
    /\bdrawdown\b/i.test(text)
  );
}

function sahbArmed(sentence) {
  if (!hasSahb(sentence)) return false;
  return hasLossWord(sentence) || hasPayoutCue(sentence) || /\bpayout\b/i.test(sentence) || /\bwithdraw(?:al)?\b/i.test(sentence);
}

function arabicNegated(sentence) {
  return /لم\s*(?:ي|ت)?تم|لن\s*(?:ي|ت)?تم|ليس/.test(sentence);
}

function completionMarked(sentence) {
  return /تم|تمت|صُرف|صرفت|صرفنا|أُرسلت|ارسلت|أرسلت|أُلغي|ألغي|الغيت|عُكس/.test(sentence);
}

function englishStatusNeedsNoun(span, sentence) {
  if (/\b(?:reset|restored)\b/i.test(span) && EN_RESET.test(sentence)) return false;
  return !new RegExp(String.raw`\b(?:${STATUS_NOUNS})\b`, 'i').test(sentence);
}

function englishCompletion(sentence) {
  let rest = String(sentence || '').replace(
    /\b(?:has|have|was|were|is|are)\s+not\s+(?:been\s+)?(?:just\s+)?(?:paid|sent|processed|restored|reversed|cancelled|canceled|reset)\b/ig,
    ' '
  );
  rest = rest.replace(
    /\b(?:i|we)\s+(?:did\s+not|didn't|have\s+not|haven't|never)\s+(?:just\s+)?(?:paid|sent|processed|restored|reversed|cancelled|canceled|reset)\b/ig,
    ' '
  );
  const reset = rest.match(EN_RESET);
  if (reset) return reset[0];
  const status = rest.match(EN_STATUS);
  if (!status) return null;
  if (englishStatusNeedsNoun(status[0], rest)) return null;
  return status[0];
}

function italianCompletion(sentence) {
  if (/\bnon\s+(?:ho|abbiamo|è|e')\b/i.test(sentence)) return null;
  const m = sentence.match(IT_CLAIM);
  return m ? m[0] : null;
}

function hinglishCompletion(sentence) {
  if (/\b(?:nahi|nahin|nai|mat)\b/i.test(sentence)) return null;
  const aux = sentence.match(/\b(?:ho\s+gay[ai](?:\s+hai)?|ho\s+chuk[ai](?:\s+hai)?|kar\s+diy[ae](?:\s+hai)?|kiya\s+gay[ae](?:\s+hai)?|bhej\s+diy[ae](?:\s+hai)?|hua|hui)\b/i);
  if (!aux) return null;
  if (!/\b(?:reset|restore|restored|paid|sent|processed|reversed|cancelled|canceled|payout|withdrawal|payment)\b/i.test(sentence)) return null;
  return aux[0];
}

function urduCompletion(sentence) {
  if (!/[\u0600-\u06FF]/.test(sentence)) return null;
  if (/(?:نہیں|نهیں|نہيں)/.test(sentence) || /(?:^|\s)(?:نا|مت)(?:\s|$)/.test(sentence)) return null;
  const aux = /(?:گیا|گئی|گئے|چکا|چکی|چکے|دیا|دیے|ہوئی|ہوا|ہوئے)/.test(sentence);
  const stem = /(?:ادائیگی|ادا|بھیج|بحال|منسوخ|ریورس|ری\s?سیٹ|واپس)/.test(sentence);
  if (!aux || !stem) return null;
  return clip(sentence);
}

function hindiCompletion(sentence) {
  if (!/[\u0900-\u097F]/.test(sentence)) return null;
  if (/(?:नहीं|मत)/.test(sentence)) return null;
  const aux = /(?:गया|गई|गये|चुका|चुकी|दिया|दी|दिए|किया|हुआ|हुई)/.test(sentence);
  const stem = /(?:भुगतान|पेआउट|रीसेट|रिस्टोर|रद्द|वापस|बहाल|भेज)/.test(sentence);
  if (!aux || !stem) return null;
  return clip(sentence);
}

function russianCompletion(sentence) {
  const re = /(оплач|отправ|обработ|восстанов|отмен|аннулир|сброш|выплач|возвращ)[а-яё]{1,8}/gi;
  let m;
  while ((m = re.exec(sentence))) {
    const before = sentence.slice(Math.max(0, m.index - 16), m.index);
    if (/(?:^|\s)не\s*$/i.test(before)) continue;
    const stem = m[1].toLowerCase();
    const paymentStem = stem === 'оплач' || stem === 'выплач' || stem === 'аннулир';
    const noun = /(выплат|платеж|платёж|счет|счёт|аккаунт|вывод)/i.test(sentence);
    if (!paymentStem && !noun) continue;
    return m[0];
  }
  return null;
}

function arabicCompletion(sentence) {
  if (arabicNegated(sentence)) return null;
  const reset = sentence.match(AR_RESET);
  if (reset) return reset[0];
  if ((hasPayoutCue(sentence) && completionMarked(sentence)) || (sahbArmed(sentence) && /تم|تمت/.test(sentence))) {
    return clip(sentence);
  }
  if (/تم|تمت|لقد/.test(sentence) && /إلغ|الغ|ملغ|عكس|استرجاع|استعاد|استعادة|إعادة/.test(sentence)) {
    return clip(sentence);
  }
  return null;
}

function findCompletionSpans(sentence) {
  const spans = [];
  function add(value) {
    const text = clip(String(value || '').replace(/\s+/g, ' '));
    if (text && !spans.includes(text)) spans.push(text);
  }
  add(englishCompletion(sentence));
  add(italianCompletion(sentence));
  add(hinglishCompletion(sentence));
  add(urduCompletion(sentence));
  add(hindiCompletion(sentence));
  add(russianCompletion(sentence));
  add(arabicCompletion(sentence));
  return spans;
}

function findClaims(draft) {
  const claims = [];
  for (const sentence of sentences(draft)) {
    if (isQuestion(sentence) || isHedgeSentence(sentence)) continue;
    for (const span of findCompletionSpans(sentence)) {
      if (!claims.includes(span)) claims.push(span);
    }
  }
  return claims;
}

function inDrawdown(sentence) {
  return /\b(?:in|into|during|under)\s+(?:a\s+)?drawdown\b/i.test(sentence)
    || /\bwhile\s+(?:\w+\s+){0,3}in\s+(?:a\s+)?drawdown\b/i.test(sentence)
    || /\bbelow\s+break\s*even\b/i.test(sentence)
    || /\bbelow\s+breakeven\b/i.test(sentence)
    || /\bat\s+a\s+loss\b/i.test(sentence);
}

function deniesDrawdownReset(sentence) {
  return /\b(?:cannot|can't|won't|will\s+not|never|do\s+not|don't|not\s+allowed\s+to)\s+reset\b/i.test(sentence)
    || /\bnot\s+(?:in|during)\s+drawdown\b/i.test(sentence)
    || /\bnever\s+in\s+drawdown\b/i.test(sentence)
    || /\bonly\s+(?:at|when|once)\s+(?:break\s*even|breakeven|profit)\b/i.test(sentence);
}

function fundedResetInDrawdown(sentence) {
  if (!/\breset\b/i.test(sentence) || !inDrawdown(sentence)) return false;
  if (/\bdrawdown\b/i.test(sentence) && /\b(?:limit|line|level|clock)\b/i.test(sentence) && !/\baccount\b/i.test(sentence)) return false;
  if (deniesDrawdownReset(sentence)) return false;
  return /\b(?:can|may|allowed\s+to|able\s+to|free\s+to|will)\s+reset\b/i.test(sentence)
    || /\breset\s+(?:is|are)\s+(?:allowed|possible|available|permitted)\b/i.test(sentence);
}

function strategyRiskContradiction(sentence) {
  if (!/\bstrategy\s+risk\b/i.test(sentence)) return false;
  const termination = /\b(?:terminat\w*|account\s+closure|hard\s+breach|clos(?:e|ed|ing)\s+the\s+(?:funded\s+)?account|(?:the\s+)?(?:funded\s+)?account\s+(?:is\s+|was\s+|will\s+be\s+|gets\s+)?clos(?:e|ed|ing|ure))\b/i.test(sentence);
  const noReset = /\b(?:no\s+reset(?!\s+fee)|without\s+(?:a\s+)?reset|cannot\s+be\s+reset|can't\s+be\s+reset|will\s+not\s+be\s+reset|(?<!can\s)not\s+be\s+reset)\b/i.test(sentence);
  if (!termination && !noReset) return false;
  const terminationDenied = /\b(?:not|never|no|n't|without)\b(?:\s+\w+){0,6}\s+(?:a\s+)?(?:termination|account\s+closure|hard\s+breach|clos(?:e|ed|ing|ure)|terminat\w*)\b/i.test(sentence)
    || /\b(?:does\s+not|do\s+not|will\s+not|won't|never|cannot|can't)\s+(?:\w+\s+){0,4}?(?:terminate\w*|close\w*)\b/i.test(sentence);
  const noResetDenied = /\b(?:not|never)\b(?:\s+\w+){0,5}\s+(?:a\s+case\s+of\s+)?no\s+reset\b/i.test(sentence);
  if (termination && !terminationDenied) return true;
  if (noReset && !noResetDenied) return true;
  return false;
}

function mentionsPreviousCycleProfit(sentence) {
  return /\b(?:previous|prior|last|earlier)[-\s]cycle\b/i.test(sentence) && /\bprofits?\b/i.test(sentence);
}

function grantsPreviousProfit(sentence) {
  if (/\b(?:not|never|no\s+longer)\b(?:\s+\w+){0,5}\s+(?:payable|paid|withdrawn?|requestable|included|sent|owed)\b/i.test(sentence)) return false;
  if (/\b(?:will\s+not|won't|cannot|can't)\s+be\s+(?:paid|withdrawn|sent|included|requested)\b/i.test(sentence)) return false;
  if (/\bforfeit/i.test(sentence)) return false;
  return /\b(?:payable|paid|withdraw|request|included|sent|owed|keep|kept)\b/i.test(sentence);
}

function completedPayoutReversed(sentence) {
  if (!/\bpayouts?|withdrawals?|payments?\b/i.test(sentence)) return false;
  if (!/\b(?:completed|already\s+paid|already\s+sent|disbursed|that\s+was\s+paid|that\s+was\s+sent)\b/i.test(sentence)) return false;
  if (!/\b(?:revers(?:e|ed|al|ing)|cancel(?:led|ed|lation|ing)?)\b/i.test(sentence)) return false;
  if (/\b(?:not|never|cannot|can't|won't|will\s+not)\b(?:\s+\w+){0,6}\s+(?:revers|cancel)/i.test(sentence)) return false;
  if (/\b(?:revers\w*|cancel\w*)\b(?:\s+\w+){0,3}\s+(?:not|never)\b/i.test(sentence)) return false;
  return true;
}

function conflatesOutcomes(sentence) {
  const equiv = /\b(?:same\s+(?:as|outcome)|identical\s+to|no\s+difference|equivalent\s+to|works\s+the\s+same)\b/i.test(sentence);
  if (!equiv) return false;
  if (/\b(?:not|never|no)\b(?:\s+\w+){0,5}\s+(?:the\s+)?same\b/i.test(sentence)) return false;
  if (/\bnot\s+(?:identical|equivalent)\b/i.test(sentence)) return false;
  const soft = /\bstrategy\s+risk\b|\bsoft\s+breach\b/i.test(sentence);
  const scalp = /\bscalp|\bweekend\b/i.test(sentence);
  const funded = /\bfunded\s+reset\b/i.test(sentence);
  return [soft, scalp, funded].filter(Boolean).length >= 2;
}

function separatesOutcomes(sentence) {
  const separated = /\b(?:not|never)\b(?:\s+\w+){0,6}\s+(?:the\s+)?same\b/i.test(sentence)
    || /\b(?:different|separate)\s+outcomes?\b/i.test(sentence);
  if (!separated) return false;
  const soft = /\bstrategy\s+risk\b|\bsoft\s+breach\b/i.test(sentence);
  const scalp = /\bscalp|\bweekend\b/i.test(sentence);
  const funded = /\bfunded\s+reset\b/i.test(sentence);
  return [soft, scalp, funded].filter(Boolean).length >= 2;
}

function ownerAligned(sentence) {
  if (separatesOutcomes(sentence)) return true;
  if (/\bstrategy\s+risk\b/i.test(sentence) && /\bsoft\s+breach\b/i.test(sentence) && !strategyRiskContradiction(sentence)) return true;
  if (/\bstrategy\s+risk\b/i.test(sentence) && /\breset\b/i.test(sentence) && !strategyRiskContradiction(sentence)) return true;
  if (/\breset\b/i.test(sentence) && deniesDrawdownReset(sentence) && (inDrawdown(sentence) || /\b(?:break\s*even|breakeven|profit)\b/i.test(sentence))) return true;
  if (/\breset\b/i.test(sentence) && /\bonly\b/i.test(sentence) && /\b(?:break\s*even|breakeven|in\s+profit)\b/i.test(sentence) && !fundedResetInDrawdown(sentence)) return true;
  if (mentionsPreviousCycleProfit(sentence) && !grantsPreviousProfit(sentence) && /\b(?:not|never|forfeit|won't|cannot|can't|will\s+not)\b/i.test(sentence)) return true;
  if (/\bpayouts?\b/i.test(sentence) && /\b(?:completed|already\s+(?:paid|sent))\b/i.test(sentence) && /\b(?:not|never)\b/i.test(sentence) && /\b(?:revers\w*|cancel\w*)/i.test(sentence) && !completedPayoutReversed(sentence)) return true;
  return false;
}

function ownerIssues(sentence) {
  const issues = [];
  if (strategyRiskContradiction(sentence)) {
    issues.push({ kind: 'block', reason: 'strategy_risk_termination', family: 'soft_breach', text: clip(sentence) });
  }
  if (fundedResetInDrawdown(sentence)) {
    issues.push({ kind: 'block', reason: 'funded_reset_in_drawdown', family: 'funded_reset', text: clip(sentence) });
  }
  if (mentionsPreviousCycleProfit(sentence) && grantsPreviousProfit(sentence)) {
    issues.push({ kind: 'block', reason: 'previous_cycle_profit_payable', family: 'previous_cycle', text: clip(sentence) });
  }
  if (completedPayoutReversed(sentence)) {
    issues.push({ kind: 'block', reason: 'completed_payout_reversed', family: 'completed_payout', text: clip(sentence) });
  }
  if (conflatesOutcomes(sentence)) {
    issues.push({ kind: 'block', reason: 'outcomes_conflated', family: 'separate_outcomes', text: clip(sentence) });
  }
  return issues;
}

function unresolvedIssue(sentence) {
  if (/\bcrypto\b/i.test(sentence) && /\b(?:payouts?|withdrawals?|payments?|withdraw)\b/i.test(sentence)
    && /\b500\b|\bany\s+amount\b|\bno\s+(?:withdrawal\s+)?limit\b|\bunlimited\b|\bno\s+cap\b|\bcapped\b|\bmaximum\b|\bup\s+to\b/i.test(sentence)) {
    return { kind: 'hold', reason: 'unresolved_crypto_cap', family: 'unresolved', text: clip(sentence) };
  }
  if (/\bfaq\b/i.test(sentence) && /\bhelp\s*cent(?:re|er)\b/i.test(sentence)
    && /\b(?:overrides?|outranks?|supersed\w*|instead\s+of|rather\s+than|authorit\w*|source\s+of\s+truth|wins|prevails|ignore\s+the)\b/i.test(sentence)) {
    return { kind: 'hold', reason: 'unresolved_source_authority', family: 'unresolved', text: clip(sentence) };
  }
  if (/\bcatalyst\b/i.test(sentence)
    && /\b(?:eras\w*|wip(?:e|ed|es|ing)|delet\w*|clean\s+slate|stay\s+won|stages?\s+(?:are\s+)?(?:kept|lost|preserved|erased)|previous\s+stages?|earlier\s+stages?|wins\s+stay)\b/i.test(sentence)) {
    return { kind: 'hold', reason: 'unresolved_catalyst_stage', family: 'unresolved', text: clip(sentence) };
  }
  return null;
}

const PROGRAM_TOPIC_RE = /\b(?:drawdowns?|daily\s+loss|max(?:imum)?\s+loss|\bdll\b|\bmll\b|profit\s*splits?|profit\s*targets?|consistency(?:\s+rule)?|loss\s+limits?|payout\s+cycles?|holding\s+time|scalp(?:ing)?(?:\s+limit)?|soft\s+breach|hard\s+breach|weekend\s+(?:trading|holding)|strategy\s+risk|funded\s+reset)\b/i;
const PROGRAM_ASSERT_RE = /\b(?:is|are|equals?|set\s+to|limited\s+to|capped\s+at|remains?|stands\s+at|applies?|means|results?|counts?\s+as|must|cannot|can't|allowed|forfeit\w*|resets?|terminates?|closes?)\b/i;

function programTopics(sentence) {
  const found = String(sentence || '').match(new RegExp(PROGRAM_TOPIC_RE.source, 'gi')) || [];
  const out = [];
  for (const item of found) {
    const key = item.toLowerCase().replace(/\s+/g, ' ');
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

function programFamily(sentence) {
  if (/\bscalp|\bweekend\b/i.test(sentence)) return 'scalp_weekend';
  if (/\bstrategy\s+risk\b|\bsoft\s+breach\b/i.test(sentence)) return 'soft_breach';
  if (/\bfunded\s+reset\b/i.test(sentence)) return 'funded_reset';
  return 'program';
}

function isProgramFactSentence(sentence) {
  return PROGRAM_TOPIC_RE.test(sentence) && (PROGRAM_ASSERT_RE.test(sentence) || unitNumbers(sentence).length > 0);
}

function canonUnit(unit) {
  const x = String(unit || '').toLowerCase();
  if (x === '%' || x === 'percent') return 'pct';
  if (x === '$' || x === 'usd') return 'usd';
  if (x === '€' || x === 'eur') return 'eur';
  return x.replace(/s$/, '');
}

function unitNumbers(text) {
  const out = [];
  const re = /(?<![\w.])(\d+(?:[.,]\d+)?)\s*(%|percent|usd|\$|€|eur|days?|minutes?|mins?|seconds?|secs?)(?![\w])/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    out.push({ value: m[1].replace(',', '.'), unit: canonUnit(m[2]) });
  }
  return out;
}

function authorityBlob(ctx) {
  const chunks = [];
  const knowledge = ctx && ctx.knowledge;
  const rows = Array.isArray(knowledge) ? knowledge : (knowledge && (knowledge.results || knowledge.items)) || [];
  for (const row of rows) {
    if (!row) continue;
    if (typeof row === 'string') chunks.push(row);
    else chunks.push(`${row.title || ''} ${row.text || row.answer || row.content || row.body || ''}`);
  }
  if (ctx && typeof ctx.authority === 'string') chunks.push(ctx.authority);
  if (ctx && Array.isArray(ctx.authority)) {
    for (const item of ctx.authority) chunks.push(typeof item === 'string' ? item : (item && item.text) || '');
  }
  return chunks.join('\n');
}

function programSupport(sentence, ctx) {
  const topics = programTopics(sentence);
  const blob = authorityBlob(ctx);
  if (!topics.length || !blob.trim()) return 'missing';
  const lower = blob.toLowerCase();
  if (!topics.every((topic) => lower.includes(topic))) return 'missing';
  const nums = unitNumbers(sentence);
  if (!nums.length) return 'ok';
  const valuesByUnit = new Map();
  for (const row of sentences(blob)) {
    const rowLower = row.toLowerCase();
    if (!topics.some((topic) => rowLower.includes(topic))) continue;
    for (const n of unitNumbers(row)) {
      if (!valuesByUnit.has(n.unit)) valuesByUnit.set(n.unit, new Set());
      valuesByUnit.get(n.unit).add(n.value);
    }
  }
  for (const n of nums) {
    const values = valuesByUnit.get(n.unit);
    if (!values || !values.has(n.value)) return 'missing';
    if (values.size > 1) return 'conflict';
  }
  return 'ok';
}

function confirmCorpus(messages) {
  return (messages || [])
    .filter((m) => m && (m.role === 'human' || m.role === 'note') && !withholdNote(m.text || ''))
    .map((m) => normalize(m.text))
    .join('\n');
}

function claimConfirmed(claim, messages) {
  const needle = normalize(claim);
  if (!needle) return false;
  return confirmCorpus(messages).includes(needle);
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
    const id = String(author.id || '');
    if (bots.has(id)) return { role: 'bot', text };
    if (String(author.type || '') === 'admin') return { role: 'human', text };
    return { role: 'client', text };
  });
}

function finish(action, reason, extra) {
  const draft = extra.draft;
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
    clientMessage: action === 'allow' ? draft : CLIENT_MESSAGE,
    hedgeKept: !!extra.hedgeKept,
  };
}

/**
 * @param {object} ctx
 * @param {string} [ctx.draft]
 * @param {Array<{role: string, text: string}>} [ctx.messages]
 * @param {Array|object} [ctx.knowledge]
 * @param {string|Array} [ctx.authority]
 * @returns {object}
 */
function evaluateResetRestoreClaim(ctx) {
  const input = ctx || {};
  const draft = String(input.draft == null ? '' : input.draft);
  if (!draft.trim()) {
    return finish('allow', 'no_claim', { draft, claims: [], holds: [], families: [], reasons: ['no_claim'] });
  }

  const blocks = [];
  const holds = [];
  const completions = [];
  let sawHedge = false;
  let sawAligned = false;

  for (const sentence of sentences(draft)) {
    if (isQuestion(sentence)) continue;
    const hedged = isHedgeSentence(sentence);
    if (hedged) sawHedge = true;
    const owners = ownerIssues(sentence);
    for (const issue of owners) blocks.push(issue);
    if (hedged) continue;
    if (!owners.length && ownerAligned(sentence)) {
      sawAligned = true;
      continue;
    }
    const unresolved = unresolvedIssue(sentence);
    if (unresolved) holds.push(unresolved);
    const spans = findCompletionSpans(sentence);
    for (const span of spans) {
      completions.push({ kind: 'completion', reason: 'reset_restore_or_payout_completion', family: 'completion', text: span });
    }
    if (!unresolved && !spans.length && !owners.length && isProgramFactSentence(sentence)) {
      const support = programSupport(sentence, input);
      if (support !== 'ok') {
        holds.push({
          kind: 'hold',
          reason: 'unsupported_program_fact',
          family: programFamily(sentence),
          text: clip(sentence),
          support,
        });
      }
    }
  }

  const claims = completions.map((item) => item.text);
  for (const item of completions) {
    if (!claimConfirmed(item.text, input.messages)) blocks.push(item);
  }

  const reasons = [];
  const families = [];
  function take(item) {
    if (!reasons.includes(item.reason)) reasons.push(item.reason);
    if (item.family && !families.includes(item.family)) families.push(item.family);
  }
  blocks.forEach(take);
  holds.forEach(take);

  if (blocks.length) {
    return finish('block', blocks[0].reason, { draft, claims, holds: holds.map((h) => h.text), families, reasons });
  }
  if (holds.length) {
    return finish('hold', holds[0].reason, { draft, claims, holds: holds.map((h) => h.text), families, reasons });
  }
  if (completions.length) {
    return finish('allow', 'human_confirmed', { draft, claims, families, reasons: ['human_confirmed'] });
  }
  if (sawAligned) {
    return finish('allow', 'owner_rule', { draft, claims: [], families, reasons: ['owner_rule'] });
  }
  if (sawHedge) {
    return finish('allow', 'hedge_kept', { draft, claims: [], hedgeKept: true, reasons: ['hedge_kept'] });
  }
  return finish('allow', 'no_claim', { draft, claims: [], families, reasons: ['no_claim'] });
}

function beforeSend(draft, ctx) {
  try {
    const result = evaluateResetRestoreClaim(Object.assign({}, ctx || {}, { draft }));
    const usable = result
      && result.silent === false
      && result.clientMessage
      && (result.action === 'allow' || result.action === 'block' || result.action === 'hold');
    if (!usable) {
      return {
        send: true,
        body: CLIENT_MESSAGE,
        replaced: true,
        silent: false,
        failClosed: true,
        reason: 'guard-error-fail-closed',
        result,
      };
    }
    if (result.action === 'allow') {
      return {
        send: true,
        body: String(draft == null ? '' : draft),
        replaced: false,
        silent: false,
        failClosed: false,
        reason: result.reason,
        result,
      };
    }
    return {
      send: true,
      body: result.clientMessage,
      replaced: true,
      silent: false,
      failClosed: false,
      reason: result.reason,
      result,
    };
  } catch (e) {
    return {
      send: true,
      body: CLIENT_MESSAGE,
      replaced: true,
      silent: false,
      failClosed: true,
      reason: 'guard-error-fail-closed',
      error: e && e.message,
    };
  }
}

module.exports = {
  STATUS,
  CLIENT_MESSAGE,
  FALLBACK_HEDGE_RE,
  HEDGE_RE,
  hedgeSource: hedgePattern.source,
  resolveHedgePattern,
  findClaims,
  sahbArmed,
  hasPayoutCue,
  withholdNote,
  partsToMessages,
  evaluateResetRestoreClaim,
  beforeSend,
};
