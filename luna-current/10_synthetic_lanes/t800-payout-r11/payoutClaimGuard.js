'use strict';

/**
 * T800 payout claim guard R11 — frozen synthetic candidate. Not approved.
 *
 * An in-topic sentence is parsed into claim tuples (subject, predicate, value).
 * It is posted only when every tuple matches a row in the approved fact table.
 * Numbers match the published value exactly. Anything else becomes the visible
 * hedge. Normalization folds other languages into those tuples; the table, not
 * a phrase list, decides.
 *
 * Owner-final rows override the Help Centre where they differ. Catalyst
 * erase-versus-keep and "profit kept/preserved" have no row, so they hedge.
 *
 * Not applied to index.js. The proposed hook is index.js.public-sends.diff.
 * 01_runtime/statePresend is absent; this module does not require it.
 */

const STATUS = Object.freeze({
  candidate: 't800-payout-r11',
  frozen: true,
  approved: false,
  release: false,
});

const CLIENT_MESSAGE = "I can't confirm that. Our team will confirm.";

const FALLBACK_HEDGE_RE = /\b(?:i(?:'m| am) not (?:100% )?sure|i (?:will|'ll) (?:check|confirm)|let me (?:check|confirm)|our team will confirm|i cannot confirm|i can't confirm|to be confirmed|i don't have that information|i do not have that information)\b/i;

function row(source, subject, predicate, value, numbers) {
  return {
    source,
    subject,
    predicate,
    value: String(value),
    numbers: (numbers || []).map(Number),
  };
}

const FACTS = Object.freeze([
  row('owner_final', 'strategy_risk', 'outcome', 'soft_breach_with_reset'),
  row('owner_final', 'strategy_risk', 'outcome', 'not_closure'),
  row('owner_final', 'reset', 'eligibility', 'breakeven_or_profit'),
  row('owner_final', 'reset', 'eligibility', 'in_profit'),
  row('owner_final', 'reset', 'eligibility', 'not_in_loss'),
  row('owner_final', 'previous_profit', 'payable', 'no'),
  row('owner_final', 'payout', 'reversal', 'no'),
  row('owner_final', 'source', 'authority', 'help_centre_primary'),

  row('17437285', 'instrument_risk', 'cap', 'half_daily_loss'),
  row('17437285', 'instrument_risk', 'table', '3>1.5'),
  row('17437285', 'instrument_risk', 'table', '4>2'),
  row('17437285', 'instrument_risk', 'table', '5>2.5'),
  row('17437285', 'instrument_risk', 'derived', '1.5', [1.5]),
  row('17437285', 'instrument_risk', 'derived', '2', [2]),
  row('17437285', 'instrument_risk', 'derived', '2.5', [2.5]),
  row('17437285', 'instrument_risk', 'example', 'published', [100000, 2500, 1500, 1000]),
  row('17437285', 'instrument_risk', 'example_limit', '2500', [2500]),
  row('17437285', 'instrument_risk', 'example_limit', '100000_2500', [100000, 2500]),

  row('17437306', 'weekend_holding', 'permission', 'allowed'),
  row('17437306', 'weekend_holding', 'action', 'move_sl_tp_allowed'),
  row('17437306', 'weekend_trading', 'outcome', 'reset_and_forfeit'),
  row('17437306', 'weekend_trading', 'outcome', 'not_closure'),
  row('17437306', 'weekend_trading', 'permission', 'not_allowed_without_addon'),
  row('17437306', 'weekend_trading', 'permission', 'allowed_with_addon'),
  row('17437306', 'weekend_trading', 'evaluation', 'reset_or_reinstate'),

  row('17437215', 'catalyst', 'daily_loss', '3', [3]),
  row('17437215', 'catalyst', 'target', '8', [8]),
  row('17437215', 'catalyst', 'target', '5', [5]),
  row('17437215', 'catalyst', 'target', '10', [10]),
  row('17437215', 'catalyst', 'target_options', '5_8_10', [5, 8, 10]),
  row('17437215', 'catalyst', 'consistency', '30', [30]),
  row('17437215', 'catalyst', 'share', '80', [80]),
  row('17437215', 'catalyst', 'share', '85', [85]),
  row('17437215', 'catalyst', 'share', '90', [90]),
  row('17437215', 'catalyst', 'share', '95', [95]),
  row('17437215', 'catalyst', 'reset_price', '890', [890]),
  row('17437215', 'catalyst', 'reset_price', '1290', [1290]),
  row('17437215', 'catalyst', 'reset_price', '1790', [1790]),
  row('17437215', 'catalyst', 'reset_price', '2490', [2490]),
  row('17437215', 'catalyst', 'reset_price', '3390', [3390]),
  row('17437215', 'catalyst', 'reset_price', '4790', [4790]),
  row('17437215', 'catalyst', 'stage1_reset', 'none'),
  row('17437215', 'catalyst', 'size', '25000', [25000]),
  row('17437215', 'catalyst', 'size', '50000', [50000]),
  row('17437215', 'catalyst', 'size', '100000', [100000]),
  row('17437215', 'catalyst', 'size', '200000', [200000]),
  row('17437215', 'catalyst', 'size', '400000', [400000]),
  row('17437215', 'catalyst', 'size', '800000', [800000]),
  row('17437215', 'catalyst', 'size', '1000000', [1000000]),
  row('17437215', 'catalyst', 'min_pnl', '150', [150]),
  row('17437215', 'catalyst', 'min_pnl', '250', [250]),
  row('17437215', 'catalyst', 'min_pnl', '350', [350]),
  row('17437215', 'catalyst', 'min_pnl', '450', [450]),
  row('17437215', 'catalyst', 'min_pnl', '650', [650]),
  row('17437215', 'catalyst', 'min_pnl', '850', [850]),
  row('17437215', 'catalyst', 'min_pnl', '1000', [1000]),
  row('17437215', 'catalyst', 'max_loss', '6_on_25k', [6, 25000]),
  row('17437215', 'catalyst', 'max_loss', '5_from_50k', [5, 50000]),
  row('17437215', 'catalyst', 'profitable_days', '5', [5]),
  row('17437215', 'catalyst', 'weekend', 'not_allowed'),
  row('17437215', 'catalyst', 'payout_days', '14_then_7_14_21', [14, 7, 21]),
  row('17437215', 'catalyst', 'start_50k', 'stage2_80_rising_5_to_95', [50000, 80, 5, 95]),
  row('17437215', 'catalyst', 'ladder', 'doubles_to_cap', [1000000, 95]),
  row('17437215', 'catalyst', 'ladder', 'doubles_to_1000000', [1000000]),
  row('17437215', 'catalyst', 'ladder', 'doubles_to_95', [95]),
  row('17437215', 'catalyst', 'ladder', 'reopens_double'),

  row('17437354', 'rise', 'minimum', '500', [500]),
  row('17437354', 'rise', 'fee', '40', [40]),
  row('17437354', 'rise', 'fee_and_minimum', '40_for_500', [40, 500]),
  row('17437354', 'rise', 'arrival', '4800>4760', [4800, 4760]),
  row('17437354', 'crypto', 'fee', '3', [3]),
  row('17437354', 'crypto', 'amount', 'any'),
  row('17437354', 'crypto', 'amount', 'only_below_500', [500]),
  row('17437354', 'crypto', 'arrival', '400>388', [400, 388]),
  row('17437354', 'payout', 'timing', '5_business_days', [5]),
  row('17437354', 'payout', 'bank_timing', '1_to_3', [1, 3]),
  row('17437354', 'payout', 'review', '30_days', [30]),
  row('17437354', 'payout', 'route', 'original_method'),

  row('17437410', 'reset', 'price', '40', [40]),
  row('17437410', 'reset', 'price', 'minimum_10', [10]),
  row('17437410', 'reset', 'price', '40_and_10', [40, 10]),
  row('17437410', 'reset', 'ladder', 'second_doubles'),
  row('17437410', 'reset', 'ladder', 'third_doubles'),
  row('17437410', 'reset', 'ladder', 'doubles'),
  row('17437410', 'reset', 'cap', '3', [3]),
  row('17437410', 'reset', 'price_example', '228_456_912', [228, 456, 912]),
  row('17437410', 'reset', 'price_example', '569_228_456_912', [569, 228, 456, 912]),
  row('17437410', 'reset', 'price_example', '100000_569_228_456_912', [100000, 569, 228, 456, 912]),
  row('17437410', 'reset', 'channel', 'dashboard'),
  row('17437410', 'reset', 'channel', 'trading_objectives'),
  row('17437410', 'reset', 'button', 'next_to_credentials'),
  row('17437410', 'reset', 'availability', 'none'),

  row('17437398', 'soft_breach', 'outcome', 'not_closure'),
  row('17437398', 'soft_breach', 'outcome', 'with_reset'),
  row('17437398', 'soft_breach', 'split', '30', [30]),
  row('17437398', 'soft_breach', 'cycle', 'restarts'),
  row('17437398', 'soft_breach', 'repeat', 'reset_and_forfeit'),
  row('17437398', 'soft_breach', 'evaluation', 'free_retry'),

  row('17437366', 'fee_refund', 'when', 'third_payout'),
  row('17437366', 'fee_refund', 'condition', 'first_attempt'),
  row('17437366', 'fee_refund', 'condition', 'never_reset'),
  row('17437366', 'fee_refund', 'condition', 'no_soft_breach'),
  row('17437366', 'fee_refund', 'restart', 'three_more'),
  row('17437366', 'fee_refund', 'included', '1-step'),
  row('17437366', 'fee_refund', 'included', '2-step'),
  row('17437366', 'fee_refund', 'included', 'lite-1-step'),
  row('17437366', 'fee_refund', 'included', 'lite-2-step'),
  row('17437366', 'fee_refund', 'excluded', 'instant'),
  row('17437366', 'fee_refund', 'excluded', 'instant-elite'),
  row('17437366', 'fee_refund', 'excluded', 'flash'),
  row('17437366', 'fee_refund', 'excluded', 'catalyst'),
]);

const APPROVED = Object.freeze({
  facts: FACTS.length,
  articles: Object.freeze({
    instrumentRisk: '17437285',
    weekend: '17437306',
    catalyst: '17437215',
    payoutMethod: '17437354',
    reset: '17437410',
    softBreach: '17437398',
    feeRefund: '17437366',
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

function fold(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
}

function normalize(text) {
  let s = fold(text);
  const maps = [
    [/risque de strategie|riesgo de estrategia|rischio di strategia/g, ' strategy risk '],
    [/стратег\S{0,16}\s+риск\S{0,12}/g, ' strategy risk '],
    [/स्ट्रेटजी\s*रिस्क|रणनीति\s*जोखिम|سٹریٹیجی\s*رسک|مخاطر\s+الاستراتيج\S*/g, ' strategy risk '],
    [/band ho j(?:aa?yega|aa?yegi|aegi)/g, ' account closure '],
    [/بند\s*ہو\s*جا\S*/g, ' account closure '],
    [/يغلق\s+الحساب|اغلاق\s+الحساب|إغلاق\s+الحساب/g, ' account closure '],
    [/compte[^.]{0,40}ferm\w*|ferm\w*[^.]{0,24}compte/g, ' account closure '],
    [/cuenta[^.]{0,40}cierr\w*|cierr\w*[^.]{0,24}cuenta/g, ' account closure '],
    [/termin\w*[^.]{0,24}(?:compte|cuenta)|(?:compte|cuenta)[^.]{0,24}termin\w*/g, ' account closure '],
    [/(?:аккаунт|счет|счёт)[^.]{0,40}закр\S*|закр\S*[^.]{0,24}(?:аккаунт|счет|счёт)/g, ' account closure '],
    [/बंद|समाप्त|खत्म/g, ' account closure '],
    [/पिछल\S*|پچھل\S*|سابق\S*|السابق\S*|предыдущ\S*|прошл\S*/g, ' previous '],
    [/\b(?:anterior|previo|precedent\w*|precedente)\b/g, ' previous '],
    [/लाभ|मुनाफा|प्रॉफिट|منافع|نفع|پرافٹ|ربح|ارباح|أرباح|прибыл\S*|профит/g, ' profit '],
    [/\b(?:beneficio|benefice|guadagn\w*|lucros?)\b/g, ' profit '],
    [/n['’]est pas payable|ne sont pas payables|no es pagadero|no se paga/g, ' not payable '],
    [/देय|مستحق|pagadero|payable/g, ' payable '],
    [/नहीं|نہیں|نهیں/g, ' not '],
    [/ري\s?سیٹ|रीसेट|сброс|إعادة تعيين/g, ' reset '],
    [/लॉस|خسار\S*|نقصان|گھاٹ\S*/g, ' loss '],
    [/सकता|सकती|सकते/g, ' can '],
    [/गया|गई|चुका|चुकी|हुआ|हुई/g, ' ho gaya '],
    [/ہو\s*گی[اا]|ہوگیا|چکا|چکی/g, ' ho gaya '],
    [/تم\s+(?:دفع|ارسال|إرسال|تحويل)/g, ' was paid '],
    [/भुगतान|पेआउट|ادائیگی|انعام/g, ' payout '],
    [/क्रिप्टो|کریپٹو|крипто/g, ' crypto '],
    [/не\s+выплач\S*/g, ' not payable '],
    [/выплач\S*/g, ' payable '],
    [/\b(pichl\w*|puran\w*|pehle)\b/g, ' previous '],
    [/\b(munafa|nafa)\b/g, ' profit '],
    [/\b(nahi|nahin|nai)\b/g, ' not '],
    [/\bmilega\b/g, ' payable '],
    [/n['’]est pas payable|no es payable/g, ' not payable '],
    [/غير|ليس/g, ' not '],
    [/(?:^|\s)не(?:\s|$)/g, ' not '],
    [/(?:^|\s)لا(?:\s|$)/g, ' not '],
  ];
  for (const [re, to] of maps) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}

function sentences(text) {
  return String(text || '')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?؟।۔])\s+/))
    .map((part) => part.trim())
    .filter(Boolean);
}

function clausesOf(text) {
  return String(text || '')
    .split(/\s*(?:;|,|،|\bbut\b|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function clip(text) {
  return String(text || '').replace(/[.!?؟।۔]+\s*$/g, '').replace(/\s+/g, ' ').trim();
}

function isHedgeSentence(sentence) {
  return HEDGE_RE.test(String(sentence || ''));
}

function percents(text) {
  const values = [];
  const re = /(\d+(?:\.\d+)?)\s*(?:%|percent\b)/gi;
  let match;
  while ((match = re.exec(text))) values.push(Number(match[1]));
  return values;
}

function moneys(text) {
  const values = [];
  const re = /(?:\$|usd\s*)(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*usd\b/gi;
  let match;
  while ((match = re.exec(text))) values.push(Number((match[1] || match[2]).replace(/,/g, '')));
  return values;
}

function sameNumbers(a, b) {
  const left = (a || []).map(Number).sort((x, y) => x - y);
  const right = (b || []).map(Number).sort((x, y) => x - y);
  if (left.length !== right.length) return false;
  return left.every((n, i) => n === right[i]);
}

function factMatches(tuple) {
  return FACTS.some((fact) => fact.subject === tuple.subject
    && fact.predicate === tuple.predicate
    && fact.value === tuple.value
    && sameNumbers(fact.numbers, tuple.numbers || []));
}

function matchedSource(tuple) {
  const fact = FACTS.find((item) => item.subject === tuple.subject
    && item.predicate === tuple.predicate
    && item.value === tuple.value
    && sameNumbers(item.numbers, tuple.numbers || []));
  return fact ? fact.source : null;
}

function closureText(text) {
  return String(text || '')
    .replace(/\b(?:does not|do not|did not|will not|won't|cannot|can't|never|not|n't)\s+(?:\w+\s+){0,5}?(?:terminat\w*|clos\w*|end(?:s|ed|ing)?|kill\w*|shut\w*|account closure)\b/g, ' ')
    .replace(/\b(?:not|never|no|without)\s+(?:being\s+)?(?:a\s+)?(?:termination|closure|account closure)\b/g, ' ')
    .replace(/\bnot\s+account closure\b/g, ' ');
}

function hasClosure(text) {
  const s = closureText(text);
  return /\baccount closure\b|\bterminat\w*|\bshut(?:s|ting)? down\b|\bclosure\b|\bkills? the account\b|\baccount (?:is|was|will be|gets) clos|\bclos(?:e|es|ed|ing) the account\b|\bend(?:s|ed|ing)? the account\b|\baccount ends\b|\bdoes not continue\b|\b(?:wipes?|wiped|abolish\w*|suspend\w*|liquidat\w*) (?:the |a )?(?:funded )?account\b/.test(s);
}

function deniesClosure(text) {
  return /\b(?:does not|do not|will not|won't|cannot|can't|never|not)\s+(?:\w+\s+){0,5}?(?:terminat\w*|clos\w*|end(?:s|ed|ing)?|kill\w*|shut\w*)\b/.test(text)
    || /\b(?:not|never|no|without)\s+(?:being\s+)?(?:a\s+)?(?:termination|closure)\b/.test(text)
    || /\bnot account closure\b/.test(text)
    || /\bstays open\b|\bremains open\b/.test(text);
}

function tuple(subject, predicate, value, numbers, extra) {
  return Object.assign({
    subject,
    predicate,
    value: String(value),
    numbers: numbers || [],
    confirmable: false,
  }, extra || {});
}

function pushClosure(list, subject, text) {
  if (hasClosure(text)) list.push(tuple(subject, 'outcome', 'closure'));
}

function lossNegated(text) {
  return /\b(?:not|never|except|unless)\b(?:\s+\w+){0,4}\s+(?:los(?:e|ing|es|t)|losses|loss|negative|open loss|drawdown|below)\b/.test(text);
}

function hasLoss(text) {
  const s = String(text || '')
    .replace(/\bdaily loss\b/g, ' ')
    .replace(/\bloss limit\b/g, ' ')
    .replace(/\bmax(?:imum)? loss\b/g, ' ');
  return /\b(?:los(?:e|ing|es|t)|losses|loss|negative|open loss|below the (?:starting|initial) balance|in (?:a )?drawdown|under water|in the red|at a loss)\b/.test(s);
}

function grantsReset(text) {
  if (/\b(?:cannot|can't|won't|will not|never|not allowed|unable)\s+(?:be\s+)?reset\b/.test(text)) return false;
  if (/\bnot be reset\b/.test(text)) return false;
  return /\b(?:can|may|allowed to|able to|eligible to)\s+(?:be\s+)?reset\b/.test(text)
    || /\b(?:can|may)\s+reset\b/.test(text)
    || /\bcan be reset\b/.test(text)
    || /\bbe reset\b/.test(text)
    || /\breset is allowed\b/.test(text)
    || /\beligible for (?:a )?reset\b/.test(text)
    || (/\breset\b/.test(text) && /\b(?:offered|granted)\b/.test(text))
    || (/\breset\b/.test(text) && /\bcan\b/.test(text));
}

function isDrawdownClock(text) {
  return /(?:drawdown|loss) limit|trailing drawdown/.test(text)
    && /\breset\b/.test(text)
    && !/\b(?:can|cannot|can't|eligible|breakeven|in profit|fee|dashboard)\b/.test(text)
    && !/%|\$/.test(text);
}

function subsetOf(values, allowed) {
  return values.length > 0 && values.every((n) => allowed.includes(n));
}

function extractInstrument(text, topic, list) {
  if ((topic === 'catalyst' || /\bcatalyst\b/.test(text)) && !/per instrument|same instrument|instrument risk|strategy risk|50\s*%|half/.test(text)) return;
  const about = topic === 'strategy_risk' || topic === 'instrument'
    || /daily loss|per instrument|same instrument|instrument risk|strategy risk/.test(text)
    || (/\b(?:50\s*%|half)(?!\w)/.test(text) && /daily/.test(text));
  if (!about) return;
  pushClosure(list, 'strategy_risk', text);
  const found = percents(text);
  const pairs = [[3, 1.5, '3>1.5'], [4, 2, '4>2'], [5, 2.5, '5>2.5']];
  const used = new Set();
  if (found.includes(50) || /\bhalf\b/.test(text) || /no more than|not more than|may not risk|cannot risk|must not risk/.test(text)) {
    list.push(tuple('instrument_risk', 'cap', 'half_daily_loss'));
    used.add(50);
  }
  for (const [hi, lo, label] of pairs) {
    if (found.includes(hi) && found.includes(lo)) {
      list.push(tuple('instrument_risk', 'table', label));
      used.add(hi);
      used.add(lo);
    }
  }
  const derived = new Set([1.5, 2, 2.5]);
  const derivedContext = used.has(50) || found.includes(50) || topic === 'strategy_risk' || /daily loss|instrument/.test(text);
  for (const n of found) {
    if (used.has(n)) continue;
    if (derivedContext && derived.has(n)) {
      list.push(tuple('instrument_risk', 'derived', String(n), [n]));
      continue;
    }
    list.push(tuple('instrument_risk', 'percent', String(n), [n]));
  }
  const money = moneys(text);
  const fullExample = [100000, 2500, 1500, 1000];
  if (sameNumbers(money, fullExample)) list.push(tuple('instrument_risk', 'example', 'published', fullExample));
  else if (sameNumbers(money, [100000, 2500])) list.push(tuple('instrument_risk', 'example_limit', '100000_2500', [100000, 2500]));
  else if (sameNumbers(money, [2500])) list.push(tuple('instrument_risk', 'example_limit', '2500', [2500]));
  else if (money.length) list.push(tuple('instrument_risk', 'money', 'other', money));
}

function extractWeekend(text, topic, list) {
  const holding = topic === 'weekend_holding'
    || /weekend hold|hold(?:ing)? (?:a |the )?positions? (?:over|through) (?:the )?weekend|friday to monday/.test(text)
    || (/over the weekend|through the weekend/.test(text) && !/\btrad|new position|open a/.test(text));
  const trading = topic === 'weekend_trading' || /weekend trad/.test(text) || /saturday|sunday/.test(text)
    || (/\btrad/.test(text) && /weekend/.test(text));
  if (!holding && !trading && !/weekend/.test(text)) return;
  if (holding && trading && /same (?:as|outcome)|identical|equivalent/.test(text)) {
    list.push(tuple('weekend_trading', 'outcome', 'conflated'));
    return;
  }
  if (holding) {
    pushClosure(list, 'weekend_holding', text);
    if (/cannot hold|can't hold|not allowed to hold|holding is not allowed|hold(?:ing)? is (?:not allowed|prohibited)/.test(text)) {
      list.push(tuple('weekend_holding', 'permission', 'denied'));
    } else if (!hasClosure(text) && (/(?<!not )allowed|(?<!not )permitted|\bfine\b|\bokay\b|may hold|can hold|may keep|can keep/.test(text) || deniesClosure(text))) {
      list.push(tuple('weekend_holding', 'permission', 'allowed'));
    }
    if (/stop loss|take profit/.test(text) && /allowed|permitted/.test(text) && !hasClosure(text)) {
      list.push(tuple('weekend_holding', 'action', 'move_sl_tp_allowed'));
    }
  }
  if (trading || topic === 'weekend_trading') {
    pushClosure(list, 'weekend_trading', text);
    const reset = /\bresets?\b/.test(text);
    const forfeits = /forfeit/.test(text) && /profit/.test(text) && /current cycle|this cycle/.test(text);
    if (reset && forfeits && !hasClosure(text)) list.push(tuple('weekend_trading', 'outcome', 'reset_and_forfeit'));
    else if ((reset || /forfeit/.test(text)) && !hasClosure(text)) list.push(tuple('weekend_trading', 'outcome', 'partial'));
    if (!hasClosure(text) && deniesClosure(text)) list.push(tuple('weekend_trading', 'outcome', 'not_closure'));
    const addon = /add on|addon/.test(text);
    const weekendDay = /saturday|sunday|weekend trad/.test(text) || (/\btrad/.test(text) && /weekend/.test(text));
    const lacksAddon = /without|no add|not have the add|do not have the add|don't have the add|lacking the add|missing the add/.test(text);
    if (weekendDay && addon && lacksAddon && /not allowed|violation|cannot|can't|prohibited/.test(text)) {
      list.push(tuple('weekend_trading', 'permission', 'not_allowed_without_addon'));
    }
    if (weekendDay && addon && /with the add|with add/.test(text) && /allowed|permitted/.test(text) && !/without/.test(text)) {
      list.push(tuple('weekend_trading', 'permission', 'allowed_with_addon'));
    }
    if (/evaluation/.test(text) && /free retry|reinstat/.test(text)) {
      list.push(tuple('weekend_trading', 'evaluation', 'reset_or_reinstate'));
    }
  }
}

function extractReset(text, topic, list) {
  if (isDrawdownClock(text)) return;
  if ((/\bcatalyst\b/.test(text) || topic === 'catalyst') && !/dashboard|trading objectives|breakeven|original price|challenge price/.test(text)) return;
  const about = topic === 'reset' || /\bresets?\b/.test(text);
  if (!about) return;
  pushClosure(list, 'reset', text);
  const money = moneys(text);
  const pct = percents(text);
  const exampleSet = [100000, 569, 228, 456, 912];
  const exampleHit = money.filter((n) => [228, 456, 912, 569].includes(n));
  if (exampleHit.length && subsetOf(money, exampleSet)) {
    const present = exampleSet.filter((n) => money.includes(n));
    const key = present.join('_');
    list.push(tuple('reset', 'price_example', key, present));
  } else if (pct.length || money.length) {
    const badProfit = pct.includes(40) && /of (?:the )?(?:profit|payout|balance|drawdown)/.test(text);
    const onlyRule = !pct.some((n) => n !== 40) && !money.some((n) => n !== 10);
    if (badProfit) list.push(tuple('reset', 'price', 'of_profit', pct.concat(money)));
    else if (onlyRule && pct.includes(40) && money.includes(10)) list.push(tuple('reset', 'price', '40_and_10', [40, 10]));
    else if (onlyRule && pct.includes(40)) list.push(tuple('reset', 'price', '40', [40]));
    else if (onlyRule && money.includes(10)) list.push(tuple('reset', 'price', 'minimum_10', [10]));
    else list.push(tuple('reset', 'price', 'other', pct.concat(money)));
  }
  const doubles = /double|twice|2 times|2x/.test(text);
  if (/\bsecond reset\b/.test(text) && doubles && !pct.length && !money.length) list.push(tuple('reset', 'ladder', 'second_doubles'));
  if (/\bthird reset\b/.test(text) && doubles && !pct.length && !money.length) list.push(tuple('reset', 'ladder', 'third_doubles'));
  if (/\b(?:later|subsequent|next) resets?\b/.test(text) && doubles && !pct.length && !money.length) list.push(tuple('reset', 'ladder', 'doubles'));
  if (/\b(?:up to )?3 resets\b|\bthree resets\b/.test(text)) list.push(tuple('reset', 'cap', '3', [3]));
  else if (/\b([4-9]|[1-9]\d) resets\b/.test(text)) list.push(tuple('reset', 'cap', 'other', [Number(text.match(/\b([4-9]|[1-9]\d) resets\b/)[1])]));
  if (/trading objectives/.test(text)) list.push(tuple('reset', 'channel', 'trading_objectives'));
  if (/dashboard/.test(text)) list.push(tuple('reset', 'channel', 'dashboard'));
  if (/next to credentials/.test(text)) list.push(tuple('reset', 'button', 'next_to_credentials'));
  if (/no reset options/.test(text)) list.push(tuple('reset', 'availability', 'none'));
  const already = list.some((item) => item.subject === 'reset' && item.predicate !== 'outcome');
  if (grantsReset(text) && hasLoss(text) && !lossNegated(text)) list.push(tuple('reset', 'eligibility', 'in_loss'));
  else if (/\b(?:cannot|can't|won't|not)\b/.test(text) && hasLoss(text) && !grantsReset(text)) list.push(tuple('reset', 'eligibility', 'not_in_loss'));
  else if (grantsReset(text) && /breakeven|break even/.test(text) && /\bprofit\b/.test(text) && (!hasLoss(text) || lossNegated(text))) {
    list.push(tuple('reset', 'eligibility', 'breakeven_or_profit'));
  } else if (grantsReset(text) && (/\bin profit\b/.test(text) || /breakeven|break even/.test(text)) && (!hasLoss(text) || lossNegated(text))) {
    list.push(tuple('reset', 'eligibility', /\bin profit\b/.test(text) && !/breakeven|break even/.test(text) ? 'in_profit' : 'breakeven_or_profit'));
  } else if (!already && !(/soft breach/.test(text) && /\bresets?\b/.test(text)) && (grantsReset(text) || (topic === 'reset' && (hasLoss(text) || /\bcan\b/.test(text))))) {
    list.push(tuple('reset', 'eligibility', 'unspecified'));
  }
}

function extractPreviousProfit(text, topic, list) {
  const about = topic === 'previous_profit' || (/previous/.test(text) && /profit/.test(text));
  if (!about) return;
  const relevant = clausesOf(text).filter((part) => /previous/.test(part) && /profit|payable|paid/.test(part));
  if (!relevant.length) return;
  for (const part of relevant) {
    const denied = /not payable|payable not|profit not|not paid|forfeit/.test(part)
      || (/ not /.test(` ${part} `) && /payable|paid|profit/.test(part));
    const affirms = /payable|paid|owed|due/.test(part);
    if (denied) list.push(tuple('previous_profit', 'payable', 'no'));
    else if (affirms) list.push(tuple('previous_profit', 'payable', 'yes'));
  }
}

function extractArrival(text, subject, from, to, list) {
  if (!/arriv|receive|you get|lands as|comes to/.test(text)) return false;
  const money = moneys(text);
  if (money.length !== 2) {
    if (money.length) list.push(tuple(subject, 'arrival', 'other', money));
    return true;
  }
  const value = `${money[0]}>${money[1]}`;
  if (money[0] === from && money[1] === to) list.push(tuple(subject, 'arrival', `${from}>${to}`, [from, to]));
  else list.push(tuple(subject, 'arrival', value, money));
  return true;
}

function extractPayoutMethod(text, topic, list) {
  const crypto = topic === 'crypto' || /\bcrypto\b|\busdc\b/.test(text);
  const rise = topic === 'rise' || /\brise\b/.test(text);
  if (!crypto && !rise) return;
  const rule = /fee|limit|cap|maximum|minimum|any amount|only method|or more|at least|below|under|arriv|%|percent/.test(text);
  if (!rule && !moneys(text).length && !percents(text).length) return;
  if (rise) {
    if (/maximum|max\b|up to|no more than|any amount|no (?:withdrawal )?limit|unlimited/.test(text)) {
      list.push(tuple('rise', 'limit', 'unrestricted'));
    }
    if (extractArrival(text, 'rise', 4800, 4760, list)) {
      /* arrival owns the amounts */
    } else {
      const money = moneys(text);
      const pct = percents(text);
      if (money.includes(500) && /or more|and above|or above|at least|minimum|or higher|and over/.test(text) && money.includes(40)) {
        list.push(tuple('rise', 'fee_and_minimum', '40_for_500', [40, 500]));
      } else if (money.includes(500) && /or more|and above|or above|at least|minimum|or higher|and over/.test(text)) {
        list.push(tuple('rise', 'minimum', '500', [500]));
      }
      if (/fee|charge|deduct/.test(text) && money.includes(40) && money.every((n) => n === 40 || n === 500)) {
        if (!(money.includes(500) && money.includes(40))) list.push(tuple('rise', 'fee', '40', [40]));
      } else if (/fee|charge/.test(text) && money.some((n) => n !== 40 && n !== 500)) {
        list.push(tuple('rise', 'fee', 'other', money));
      }
      if (pct.length) list.push(tuple('rise', 'percent', String(pct[0]), pct));
    }
  }
  if (crypto) {
    if (/cap|maximum|max\b|up to|no more than|limited to/.test(text) && /\b500\b/.test(text)) {
      list.push(tuple('crypto', 'cap', '500', [500]));
    }
    if (extractArrival(text, 'crypto', 400, 388, list)) {
      /* arrival owns the amounts */
    } else {
      const pct = percents(text);
      if (pct.includes(3) && pct.every((n) => n === 3)) list.push(tuple('crypto', 'fee', '3', [3]));
      else if (pct.length) list.push(tuple('crypto', 'fee', String(pct[0]), pct));
      if (/any amount|not capped|uncapped|no (?:maximum|cap)/.test(text)) list.push(tuple('crypto', 'amount', 'any'));
      if (/only|exclusiv/.test(text) && /below|under/.test(text) && /\b500\b/.test(text)) {
        list.push(tuple('crypto', 'amount', 'only_below_500', [500]));
      }
    }
  }
}

function catalystMemory(text) {
  return /eras|wipe|clean slate|stay won|earlier stage|previous stage/.test(text)
    || (/profit/.test(text) && /kept|preserved|preserve|keep the/.test(text))
    || (/stage/.test(text) && /kept|preserved|preserve/.test(text));
}

function extractCatalyst(text, topic, list) {
  if (topic !== 'catalyst' && !/\bcatalyst\b/.test(text)) return;
  if (catalystMemory(text)) list.push(tuple('catalyst', 'stage_memory', 'unresolved'));
  if (/opens a fresh|double the size/.test(text)) list.push(tuple('catalyst', 'ladder', 'reopens_double'));
  else pushClosure(list, 'catalyst', text);
  const pct = percents(text);
  const money = moneys(text);
  const takePct = (label, accept) => {
    const at = text.indexOf(label);
    if (at >= 0) {
      const match = text.slice(at, at + 80).match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/);
      if (match) return Number(match[1]);
    }
    return pct.find((n) => accept.includes(n));
  };
  if (/daily loss/.test(text)) {
    const n = takePct('daily loss', [3]);
    list.push(tuple('catalyst', 'daily_loss', n === 3 ? '3' : 'other', n == null ? [] : [n]));
  }
  if (/consistency/.test(text)) {
    const n = takePct('consistency', [30]);
    list.push(tuple('catalyst', 'consistency', n === 30 ? '30' : 'other', n == null ? [] : [n]));
  }
  if (/target/.test(text)) {
    const options = [5, 8, 10];
    const at = text.indexOf('target');
    const local = percents(at >= 0 ? text.slice(at, at + 80) : text);
    if (options.every((n) => local.includes(n))) list.push(tuple('catalyst', 'target_options', '5_8_10', options));
    else if (local.length === 1 && options.includes(local[0])) list.push(tuple('catalyst', 'target', String(local[0]), local));
    else if (local.length) list.push(tuple('catalyst', 'target', 'other', local));
  }
  if (/share|split/.test(text)) {
    const shares = pct.filter((n) => [80, 85, 90, 95].includes(n));
    const bad = pct.filter((n) => ![80, 85, 90, 95, 5, 8, 10, 3, 30, 6].includes(n));
    for (const n of shares) list.push(tuple('catalyst', 'share', String(n), [n]));
    for (const n of bad) list.push(tuple('catalyst', 'share', 'other', [n]));
    if (!shares.length && !bad.length && pct.length === 1) list.push(tuple('catalyst', 'share', 'other', pct));
  }
  const prices = [890, 1290, 1790, 2490, 3390, 4790];
  const sizes = [25000, 50000, 100000, 200000, 400000, 800000, 1000000];
  const pnls = [150, 250, 350, 450, 650, 850, 1000];
  for (const n of money) {
    if (prices.includes(n)) list.push(tuple('catalyst', 'reset_price', String(n), [n]));
    else if (sizes.includes(n)) list.push(tuple('catalyst', 'size', String(n), [n]));
    else if (pnls.includes(n) && /p&l|pnl|profitable day|minimum/.test(text)) list.push(tuple('catalyst', 'min_pnl', String(n), [n]));
    else list.push(tuple('catalyst', 'money', 'other', [n]));
  }
  if (/no reset/.test(text) && /stage|price|first/.test(text)) list.push(tuple('catalyst', 'stage1_reset', 'none'));
  if (/max loss|trailing/.test(text) && pct.includes(6) && money.includes(25000)) list.push(tuple('catalyst', 'max_loss', '6_on_25k', [6, 25000]));
  if (/max loss|trailing/.test(text) && pct.includes(5) && /50/.test(text)) list.push(tuple('catalyst', 'max_loss', '5_from_50k', [5, 50000]));
  if (/5 profitable days|five profitable days/.test(text)) list.push(tuple('catalyst', 'profitable_days', '5', [5]));
  if (/weekend/.test(text) && /not allowed|cannot|can't|prohibited/.test(text)) list.push(tuple('catalyst', 'weekend', 'not_allowed'));
  if (/14 days/.test(text) && /7/.test(text) && /21/.test(text)) list.push(tuple('catalyst', 'payout_days', '14_then_7_14_21', [14, 7, 21]));
  if (money.includes(50000) && pct.includes(80) && pct.includes(95) && /\b5\b/.test(text)) {
    list.push(tuple('catalyst', 'start_50k', 'stage2_80_rising_5_to_95', [50000, 80, 5, 95]));
  }
  if (/double/.test(text) && money.includes(1000000) && pct.includes(95)) {
    list.push(tuple('catalyst', 'ladder', 'doubles_to_cap', [1000000, 95]));
  } else if (/double/.test(text) && money.includes(1000000)) {
    list.push(tuple('catalyst', 'ladder', 'doubles_to_1000000', [1000000]));
  } else if (/double/.test(text) && pct.includes(95)) {
    list.push(tuple('catalyst', 'ladder', 'doubles_to_95', [95]));
  }
}

function extractSoftBreach(text, list) {
  if (!/soft breach/.test(text)) return;
  pushClosure(list, 'soft_breach', text);
  if (!hasClosure(text) && deniesClosure(text)) list.push(tuple('soft_breach', 'outcome', 'not_closure'));
  const pct = percents(text);
  if (pct.includes(30) && /payout|split|share|processed/.test(text) && pct.every((n) => n === 30)) {
    list.push(tuple('soft_breach', 'split', '30', [30]));
  } else if (pct.length) list.push(tuple('soft_breach', 'split', 'other', pct));
  if (/again|repeat|another|after the warning|second soft/.test(text) && /reset/.test(text) && /forfeit|profit/.test(text)) {
    list.push(tuple('soft_breach', 'repeat', 'reset_and_forfeit'));
  } else if (/\breset\b/.test(text) && !/no reset|never reset/.test(text) && !hasClosure(text) && !/strategy risk/.test(text)) {
    list.push(tuple('soft_breach', 'outcome', 'with_reset'));
  }
  if (/cycle/.test(text) && /restart|starts again|from payout 1/.test(text)) list.push(tuple('soft_breach', 'cycle', 'restarts'));
  if (/evaluation/.test(text) && /free retry/.test(text)) list.push(tuple('soft_breach', 'evaluation', 'free_retry'));
}

function extractStrategy(text, topic, list) {
  const about = topic === 'strategy_risk' || topic === 'soft_breach' || /strategy risk/.test(text);
  if (!about) return;
  pushClosure(list, 'strategy_risk', text);
  if (/no reset|without (?:a )?reset/.test(text) && !/no reset fee|no reset options/.test(text)) {
    list.push(tuple('strategy_risk', 'reset', 'none'));
  }
  if (!hasClosure(text) && /soft breach/.test(text) && /\breset\b/.test(text)) {
    list.push(tuple('strategy_risk', 'outcome', 'soft_breach_with_reset'));
  } else if (!hasClosure(text) && deniesClosure(text)) {
    list.push(tuple('strategy_risk', 'outcome', 'not_closure'));
  } else if (hasClosure(text)) {
    /* closure tuple already recorded */
  } else if (topic === 'strategy_risk' && /account closure|terminat|ends the account|shut/.test(closureText(text))) {
    list.push(tuple('strategy_risk', 'outcome', 'closure'));
  }
}

function programNames(text) {
  const names = [];
  if (/lite 2 step|lite2/.test(text)) names.push('lite-2-step');
  if (/lite 1 step|lite1/.test(text)) names.push('lite-1-step');
  if (/instant elite/.test(text)) names.push('instant-elite');
  if (/flash/.test(text)) names.push('flash');
  if (/catalyst/.test(text)) names.push('catalyst');
  if (/\binstant\b/.test(text.replace(/instant elite/g, ' '))) names.push('instant');
  if (/\b2 step\b|two step/.test(text) && !/lite 2 step|lite2/.test(text)) names.push('2-step');
  if (/\b1 step\b|one step/.test(text) && !/lite 1 step|lite1/.test(text)) names.push('1-step');
  return names;
}

function extractFeeRefund(text, list) {
  if (!/fee refund|challenge fee|fee back|fees? back/.test(text)) return;
  if (/third payout/.test(text)) list.push(tuple('fee_refund', 'when', 'third_payout'));
  if (/first attempt|no free retry|without (?:a |the )?free retry/.test(text)) list.push(tuple('fee_refund', 'condition', 'first_attempt'));
  if (/never reset|no reset/.test(text)) list.push(tuple('fee_refund', 'condition', 'never_reset'));
  if (/no soft breach/.test(text)) list.push(tuple('fee_refund', 'condition', 'no_soft_breach'));
  if (/soft breach/.test(text) && /restart|three more|3 more/.test(text)) list.push(tuple('fee_refund', 'restart', 'three_more'));
  const names = programNames(text);
  const deniesRefund = /no fee refund|not refund|no refund|have no fee|has no fee|do not get (?:a |the )?fee|don't get (?:a |the )?fee/.test(text);
  for (const name of names) {
    if (deniesRefund) list.push(tuple('fee_refund', 'excluded', name));
    else if (/refund|fee back|get the fee|get your|gets a fee/.test(text)) list.push(tuple('fee_refund', 'included', name));
  }
  if (/always/.test(text) && /refund/.test(text)) list.push(tuple('fee_refund', 'when', 'always'));
}

function completionSpan(text) {
  const parts = String(text || '').split(/\s*(?:,|;|\bbut\b|\band\b)\s*/i);
  const hit = parts.find((part) => /paid|sent|processed|ho gaya|was paid|took back|clawed back|reversed/.test(part));
  return clip(hit || text);
}

function extractCompletion(text, list) {
  if (/soft breach/.test(text) && percents(text).includes(30) && !/\b(?:reward|funds|settlement)\b/.test(text)) return;
  const noun = /\b(?:payouts?|withdrawals?|payments?|refunds?|rewards?|funds?|settlements?|disbursements?)\b/.test(text);
  const take = /\b(?:revers\w*|cancel\w*|took back|taken back|take back|undone|undo|claw(?:ed)? back|pull(?:ed)? back|retract\w*|recoup\w*)\b/.test(text);
  if (noun && take) {
    if (/\bnot reversed\b|\bare not reversed\b|\b(?:not|never)\s+(?:be\s+)?(?:revers|taken back|clawed back)\b/.test(text)) {
      list.push(tuple('payout', 'reversal', 'no'));
    } else list.push(tuple('payout', 'reversal', 'yes', [], { text: completionSpan(text) }));
    return;
  }
  const asked = /\b(?:how|can|could|may|might|should|would|do|does|did)\s+(?:i|we)\b/.test(text);
  const done = (noun && /\b(?:was|were|has been|have been|is now|got)\s+(?:just\s+)?(?:paid|sent|processed|restored|reversed|cancelled|canceled)\b/.test(text))
    || (noun && !asked && /\b(?:i|we|finance|the team)\s+(?:have |has |just )?(?:paid|sent|processed|reversed|took back|clawed back)\b/.test(text))
    || (/payout|reward|fund/.test(text) && /ho gaya|was paid/.test(text) && !/\bnot\b/.test(text));
  if (!done) return;
  if (/\b(?:was|were|has|have) not\b/.test(text)) return;
  list.push(tuple('payout', 'completion', 'paid', [], { confirmable: true, text: completionSpan(text) }));
}

function extractSource(text, list) {
  const help = /help cent|faq\.fundedelite\.com/.test(text);
  const faq = /\bfaq\b/.test(text);
  if (!help || !faq) return;
  const faqPrimary = /\bfaq\b[\s\S]{0,48}\b(?:overrides?|outranks?|supersed\w*|primary|source of truth|wins|prevails)\b/.test(text);
  const helpPrimary = /help cent[\s\S]{0,64}\b(?:primary|source of truth|outranks?|overrides?)\b/.test(text)
    || (/faq\.fundedelite\.com/.test(text) && /\bprimary\b/.test(text))
    || (/\bfaq\b[\s\S]{0,40}\bsecondary\b/.test(text));
  if (helpPrimary && !faqPrimary) list.push(tuple('source', 'authority', 'help_centre_primary'));
  else list.push(tuple('source', 'authority', 'faq_primary'));
}

function extractTiming(text, list) {
  if (/business days?/.test(text) && percents(text).length === 0) {
    const n = (text.match(/\b(\d+)\s+business days?/) || [])[1];
    if (n) list.push(tuple('payout', 'timing', n === '5' ? '5_business_days' : 'other', [Number(n)]));
  }
  if (/1\s*[-–]?\s*3\s+days|1\s+to\s+3\s+days/.test(text)) list.push(tuple('payout', 'bank_timing', '1_to_3', [1, 3]));
  if (/30 days/.test(text) && /review/.test(text)) list.push(tuple('payout', 'review', '30_days', [30]));
  if (/original payment method|same card/.test(text)) list.push(tuple('payout', 'route', 'original_method'));
}

function topicSubject(topic) {
  if (topic === 'strategy_risk' || topic === 'soft_breach') return 'strategy_risk';
  if (topic === 'weekend_trading') return 'weekend_trading';
  if (topic === 'weekend_holding') return 'weekend_holding';
  if (topic === 'reset') return 'reset';
  if (topic === 'previous_profit') return 'previous_profit';
  if (topic === 'crypto') return 'crypto';
  if (topic === 'rise') return 'rise';
  if (topic === 'catalyst') return 'catalyst';
  if (topic === 'payout') return 'payout';
  return topic || 'payout';
}

function claimShaped(text) {
  return hasClosure(text)
    || percents(text).length > 0
    || moneys(text).length > 0
    || /\b(?:forfeit|payable|refund|arriv\w*|reversed|not allowed|prohibited|terminat|closure|account closure)\b/.test(text)
    || grantsReset(text)
    || (/\b(?:paid|sent|processed)\b/.test(text) && /\b(?:payout|reward|fund|withdrawal)\b/.test(text));
}

function uncoveredMoney(text, list) {
  const found = moneys(text);
  if (!found.length || !list.length) return;
  const covered = list.flatMap((item) => item.numbers || []);
  const rest = found.slice();
  for (const n of covered) {
    const at = rest.indexOf(n);
    if (at >= 0) rest.splice(at, 1);
  }
  if (rest.length) list.push(tuple(list[0].subject, 'money', 'leftover', rest));
}

function extractTuples(sentence, topic) {
  const text = normalize(sentence);
  const list = [];
  extractSource(text, list);
  extractInstrument(text, topic, list);
  extractWeekend(text, topic, list);
  extractCatalyst(text, topic, list);
  extractSoftBreach(text, list);
  extractStrategy(text, topic, list);
  extractReset(text, topic, list);
  extractPreviousProfit(text, topic, list);
  extractPayoutMethod(text, topic, list);
  extractFeeRefund(text, list);
  extractTiming(text, list);
  extractCompletion(text, list);
  uncoveredMoney(text, list);
  if (!list.length && !isDrawdownClock(text)) {
    const guarded = !!topic || /strategy risk|soft breach|weekend|catalyst|fee refund|previous profit|\brise\b|\bcrypto\b|daily loss|per instrument|same instrument|instrument risk/.test(text);
    if (guarded && hasClosure(text)) list.push(tuple(topicSubject(topic), 'outcome', 'closure'));
    else if (guarded && claimShaped(text)) list.push(tuple(topicSubject(topic), 'unparsed', 'unparsed'));
  }
  return list;
}

function isGreeting(sentence) {
  const s = normalize(sentence);
  return /^(?:hello|hi|hey|thanks|thank you|good morning|good evening)\b/.test(s)
    && !/strategy risk|soft breach|weekend|catalyst|reset|payout|rise|crypto|fee|%|\$/.test(s);
}

function declaresOutcome(text) {
  const s = normalize(text);
  return hasClosure(s) || /\b(?:can be reset|is allowed|was paid|fee is|is payable|arrives|forfeit)\b/.test(s);
}

function isPureQuestion(sentence) {
  const s = String(sentence || '').trim();
  const after = s.split(/[?؟]/).slice(1).join(' ').trim();
  if (after && declaresOutcome(after)) return false;
  const interrogative = /[?؟]\s*$/.test(s)
    || /^(?:how|what|when|where|why|which|whose|can|could|may|might|should|would|do|does|did|is|are|was|were|have|has)\b/i.test(s);
  if (!interrogative) return false;
  if (/^(?:do|does|did)\s+not\b/i.test(s)) return false;
  const tails = s.split(/[,;:]|\b(?:and|but)\b/i).slice(1);
  if (tails.some((tail) => declaresOutcome(tail))) return false;
  return true;
}

function questionTopic(sentence) {
  const s = normalize(sentence);
  if (/strategy risk/.test(s)) return 'strategy_risk';
  if (/soft breach/.test(s)) return 'soft_breach';
  if (/weekend trad/.test(s)) return 'weekend_trading';
  if (/weekend hold/.test(s)) return 'weekend_holding';
  if (/catalyst/.test(s)) return 'catalyst';
  if (/crypto/.test(s) && !/rise/.test(s)) return 'crypto';
  if (/rise/.test(s) && !/crypto/.test(s)) return 'rise';
  if (/fee refund|challenge fee/.test(s)) return 'fee_refund';
  if (/previous/.test(s) && /profit/.test(s)) return 'previous_profit';
  if (/daily loss|one instrument|per instrument|same instrument|instrument risk/.test(s)) return 'strategy_risk';
  if (/reset/.test(s)) return 'reset';
  if (/payout|withdrawal|reward/.test(s)) return 'payout';
  return null;
}

function judgeSentence(sentence, topic) {
  if (isPureQuestion(sentence)) return null;
  const tuples = extractTuples(sentence, topic);
  if (!tuples.length) return null;
  const hedge = isHedgeSentence(sentence);
  const unmatched = tuples.filter((item) => !factMatches(item));
  if (unmatched.length) {
    const item = unmatched[0];
    return {
      approved: false,
      reason: 'fact_mismatch',
      source: null,
      text: item.text || clip(sentence),
      confirmable: hedge ? false : !!item.confirmable && unmatched.every((rowItem) => rowItem.confirmable),
      tuple: item,
    };
  }
  const sources = tuples.map(matchedSource).filter(Boolean);
  const source = sources.every((item) => item === sources[0]) ? sources[0] : 'approved_facts';
  return { approved: true, reason: source, source, text: clip(sentence), confirmable: false };
}

function withholdNote(text) {
  const t = String(text || '');
  if (/\b(?:do\s+not|don't|never|must\s+not|not\s+to)\b[\s\S]{0,48}\b(?:tell|inform|notify|mention|share|disclose|say)\b[\s\S]{0,40}\b(?:the\s+)?(?:clients?|customers?|traders?|users?|them|him|her)\b/i.test(t)) return true;
  if (/\b(?:clients?|customers?|traders?)\b[\s\S]{0,32}\b(?:must\s+not|should\s+not|is\s+not\s+to)\s+be\s+(?:told|informed|notified)\b/i.test(t)) return true;
  return false;
}

function oppositeConfirmation(text) {
  return /\b(?:confirm\w*|verif\w*|approv\w*|attest\w*|checked)\b[\s\S]{0,48}\b(?:opposite|contrary|otherwise)\b/i.test(text)
    || /\b(?:opposite|contrary|otherwise)\b[\s\S]{0,48}\b(?:confirm\w*|verif\w*|approv\w*|attest\w*|checked)\b/i.test(text);
}

function sameClause(sentence, leftRe, rightRe) {
  return String(sentence || '')
    .split(/[,;،।۔.!?؟]/)
    .some((part) => leftRe.test(part) && rightRe.test(part));
}

function noteDenies(text, span) {
  const hay = fold(text);
  const needle = fold(span);
  if (/\b(?:is not true|not correct|do not confirm|don't confirm|cannot confirm|can't confirm|did not happen|never happened)\b/.test(hay)) return true;
  if (/\b(?:not|never|n't|did not|was not|were not|has not|have not|no)\b(?:\s+\w+){0,5}\s+(?:confirm\w*|verif\w*|approv\w*|attest\w*|true|correct)\b/i.test(text)) return true;
  if (needle) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (sameClause(text, /नहीं|نہیں|نهیں|(?:^|\s)لا(?:\s|$)|(?:^|\s)не(?:\s|$)|不是|ない/, new RegExp(escaped, 'i'))) return true;
  }
  if (!needle || !hay.includes(needle)) return false;
  const at = hay.indexOf(needle);
  return /\b(?:not|never|n't|did not|was not|were not|no)\s*$/.test(hay.slice(Math.max(0, at - 48), at));
}

function claimConfirmed(span, messages) {
  const needle = fold(span);
  if (!needle) return false;
  for (const message of messages || []) {
    if (!message || (message.role !== 'human' && message.role !== 'note')) continue;
    const text = String(message.text || '');
    if (withholdNote(text) || oppositeConfirmation(text)) continue;
    if (!fold(text).includes(needle)) continue;
    if (noteDenies(text, span)) continue;
    let residue = fold(text).split(needle).join(' ');
    residue = residue.replace(/[^a-z0-9]+/g, ' ');
    if (/\b(?:confirm\w*|verif\w*|approv\w*|attest\w*|checked)\b/.test(residue)) return true;
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
    topicIgnored: false,
    action,
    reason,
    reasons: extra.reasons || [reason],
    claims: extra.claims || [],
    holds: extra.holds || [],
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
  let topic = null;
  for (const sentence of sentences(draft)) {
    if (isHedgeSentence(sentence)) sawHedge = true;
    if (isPureQuestion(sentence)) {
      const next = questionTopic(sentence);
      if (next) topic = next;
      continue;
    }
    if (isGreeting(sentence)) continue;
    const judged = judgeSentence(sentence, topic);
    topic = questionTopic(sentence);
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
  if (problems.length) {
    return finish('hold', problems[0].reason, {
      draft,
      reasons: problems.map((item) => item.reason),
      claims: problems.map((item) => item.text).filter(Boolean),
      holds: problems.map((item) => item.text).filter(Boolean),
    });
  }
  if (confirmable.length) return finish('allow', 'human_confirmed', { draft, reasons: ['human_confirmed'] });
  if (sawApproved) return finish('allow', allowReason || 'approved_facts', { draft, reasons: [allowReason || 'approved_facts'] });
  if (sawHedge && sentences(draft).every((sentence) => isHedgeSentence(sentence) || isPureQuestion(sentence) || isGreeting(sentence))) {
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
  FACTS,
  CLIENT_MESSAGE,
  FALLBACK_HEDGE_RE,
  HEDGE_RE,
  hedgeSource: hedgePattern.source,
  resolveHedgePattern,
  normalize,
  isPureQuestion,
  extractTuples,
  factMatches,
  judgeSentence,
  withholdNote,
  claimConfirmed,
  partsToMessages,
  evaluateResetRestoreClaim,
  guardPublicBody,
  beforeSend,
};
