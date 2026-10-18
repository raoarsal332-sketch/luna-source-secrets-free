'use strict';
/**
 * Elite Atom — structured ask resolution (staging t739, isolated).
 *
 * Resolves, in this order and BEFORE any answer is ranked:
 *   1. monetary referent   (fee paid / list price / payout / profit)
 *   2. requested relationship (recovery / split / timing / cap / cost / ...)
 *   3. conditions          (product, payout ordinal, amounts, sizes, options)
 *
 * Money asks are answered only when they positively match a closed frame AND every
 * content word is accounted for by that frame's vocabulary. Absence of risk tokens
 * is never evidence of safety. An amount alone is never price intent.
 *
 * Pure functions. No I/O, no network, no knowledge of answer bodies.
 */

const PRICE_POINT_VALUES = Object.freeze([19, 29, 59, 70, 114, 145, 215, 289, 409, 519]);
const OBSOLETE_PRICE_VALUE = 161;
const MAX_ASK_CHARS = 1200;

const ZERO_WIDTH = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff\u00ad\u180e\u034f]/g;
const ODD_SPACE = /[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\t\r\n]+/g;
const NON_LATIN = /[\u0370-\u03ff\u0400-\u052f\u0530-\u058f\u0590-\u08ff\u0900-\u0dff\u0e00-\u0eff\u0f00-\u0fff\u1100-\u11ff\u1200-\u139f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

const HOMOGLYPH = {
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c', '\u0445': 'x', '\u0443': 'y',
  '\u0456': 'i', '\u0458': 'j', '\u0455': 's', '\u0501': 'd', '\u04bb': 'h', '\u043a': 'k', '\u043c': 'm',
  '\u043d': 'h', '\u0442': 't', '\u0432': 'b', '\u0461': 'w', '\u0261': 'g', '\u0131': 'i', '\u04cf': 'l',
  '\u03bf': 'o', '\u03b1': 'a', '\u03b5': 'e', '\u03b9': 'i', '\u03ba': 'k', '\u03bd': 'v', '\u03c1': 'p',
  '\u03c4': 't', '\u03c5': 'u', '\u03c7': 'x', '\u0391': 'A', '\u0392': 'B', '\u0395': 'E', '\u0397': 'H',
  '\u0399': 'I', '\u039a': 'K', '\u039c': 'M', '\u039d': 'N', '\u039f': 'O', '\u03a1': 'P', '\u03a4': 'T',
  '\u03a7': 'X', '\u0410': 'A', '\u0412': 'B', '\u0415': 'E', '\u041a': 'K', '\u041c': 'M', '\u041d': 'H',
  '\u041e': 'O', '\u0420': 'P', '\u0421': 'C', '\u0422': 'T', '\u0425': 'X',
};
const HOMOGLYPH_RX = new RegExp('[' + Object.keys(HOMOGLYPH).join('') + ']', 'g');

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '|': 'l' };

function leetFold(t) {
  return t
    .split(' ')
    .map((tok) => {
      if (!/[a-z]/.test(tok) || !/[0-9@$!|]/.test(tok)) return tok;
      if (/^[$€£]?\d[\d,.]*(?:k|m|st|nd|rd|th|%|x|d|usd)?$/.test(tok)) return tok;
      if (/^(?:[12]-?step|[12]step|\d+-?(?:step|day|days|k)|\d+[:/]\d+)$/.test(tok)) return tok;
      return tok.replace(/[0-9@$!|]/g, (ch) => LEET[ch] || ch);
    })
    .join(' ');
}

function deobfuscate(t) {
  let d = t.replace(/(?<=[a-z])[.\-_*\u00b7\u2022\u2010-\u2015](?=[a-z])/g, '');
  d = d.replace(/(?:^|\s)((?:[a-z][\s.\-_*]+){3,}[a-z])(?=\s|$)/g, (m, run) => ' ' + run.replace(/[\s.\-_*]+/g, ''));
  return d.replace(/\s+/g, ' ').trim();
}

function normalize(input) {
  const raw = typeof input === 'string' ? input : '';
  let s = raw.normalize('NFKC').replace(ZERO_WIDTH, '').replace(ODD_SPACE, ' ');
  let homoglyphFolded = false;
  s = s
    .split(' ')
    .map((tok) => {
      if (/[A-Za-z]/.test(tok) && /[\u0370-\u03ff\u0400-\u04ff\u0500-\u052f\u0131\u0261]/.test(tok)) {
        homoglyphFolded = true;
        return tok.replace(HOMOGLYPH_RX, (ch) => HOMOGLYPH[ch] || ch);
      }
      return tok;
    })
    .join(' ');
  const nonLatinScript = NON_LATIN.test(s);
  const t = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const tDeob = deobfuscate(t);
  return { raw, t, tDeob, tLeet: leetFold(tDeob), nonLatinScript, homoglyphFolded };
}

// ---------------------------------------------------------------------------
// Local English fail-closed check (NARROWS only; never widens the shared gate).
// ---------------------------------------------------------------------------
const FOREIGN_MARKERS = new Set(
  (
    'el la los las una uno unos cual cuales cuanto cuanta cuantos como donde cuando porque pago pagos retiro retiros ' +
    'cuenta reembolso reembolsos devolucion devolver mi mis su sus tengo puedo quiero precio precios cuota perdida ' +
    'limite diario recompensa apalancamiento ' +
    'os as qual quais quanto saque saques conta reembolsar devolucao preco precos taxa meu minha voce ' +
    'hai hain hoon kya kitna kitni kitne nahi nahin mein main bhai wapas paisa paisay paise aap apka apki mera meri ' +
    'mujhe kab kaise kyun kyu karo karna milega milay milta ka ki ke se ko tak abhi bata batao btao ' +
    'le les des quel quelle combien remboursement compte mon ma mes prix ' +
    'der die das wie viel kosten auszahlung konto erstattung preis ' +
    'qeemat keemat qimat'
  ).split(' ')
);
const ENGLISH_FUNCTION = new Set(
  (
    'the is are was were be do does did can could will would should have has had of for on in at to from by with about ' +
    'what which who where when why how whether this that these those it its and or but if i me my we our you your ' +
    'not no yes any some all per than then there also still just only'
  ).split(' ')
);

function foreignScore(t) {
  const words = t.match(/[a-z]+/g) || [];
  let foreign = 0;
  let english = 0;
  for (const w of words) {
    if (FOREIGN_MARKERS.has(w)) foreign++;
    else if (ENGLISH_FUNCTION.has(w)) english++;
  }
  return { foreign, english };
}

function looksNonEnglish(n) {
  if (n.nonLatinScript) return true;
  const { foreign, english } = foreignScore(n.t);
  if (foreign >= 2) return true;
  if (foreign >= 1 && english <= foreign) return true;
  return false;
}

/**
 * Accepts the SHARED language gate result. Absent / non-English / low-confidence
 * / blocked => not ok (caller fails closed). Accepted shapes (ASSUMED, to be
 * confirmed against the shared gate): the string 'en', or an object with
 * lang|language|code|detected === 'en' / 'en-*' and no negative flag.
 */
function readLanguageGate(gate) {
  if (gate === undefined || gate === null) return { ok: false, reason: 'language-gate-missing' };
  let lang = null;
  let neg = false;
  if (typeof gate === 'string') {
    lang = gate;
  } else if (typeof gate === 'object') {
    lang = gate.lang || gate.language || gate.code || gate.detected || null;
    if (gate.ok === false || gate.allowed === false || gate.pass === false || gate.supported === false) neg = true;
    if (gate.confident === false || gate.reliable === false || gate.blocked === true || gate.abstain === true) neg = true;
    if (typeof gate.status === 'string' && /^(?:unknown|unsupported|blocked|mixed|abstain|fail)/i.test(gate.status)) neg = true;
    if (gate.mixed === true || gate.multilingual === true) neg = true;
  } else {
    return { ok: false, reason: 'language-gate-malformed' };
  }
  if (typeof lang !== 'string' || !lang) return { ok: false, reason: 'language-gate-malformed' };
  if (!/^en(?:[-_][a-z]{2,4})?$/i.test(lang.trim())) return { ok: false, reason: 'language-gate-not-english', lang };
  if (neg) return { ok: false, reason: 'language-gate-not-confident', lang };
  return { ok: true, lang: 'en' };
}

// ---------------------------------------------------------------------------
// Canonicalisation: pull typed slots out of the text, leave only words.
// ---------------------------------------------------------------------------
const ORD_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function parseAmount(s) {
  const m = String(s).match(/(\d[\d,]*(?:\.\d+)?)\s*(k|m)?/i);
  if (!m) return null;
  let v = Number(m[1].replace(/,/g, ''));
  if (m[2] && /k/i.test(m[2])) v *= 1000;
  if (m[2] && /m/i.test(m[2])) v *= 1000000;
  return Number.isFinite(v) ? v : null;
}

function canon(t) {
  let c = ' ' + t + ' ';
  const slots = { amounts: [], pcts: [], ratios: [], sizes: [], ords: [], prods: new Set(), nums: [] };

  c = c.replace(/(\w)'s\b/g, '$1').replace(/n't\b/g, ' not').replace(/['’`]/g, '');

  c = c.replace(
    /(?:us\s*)?[$€£]\s*\d[\d,]*(?:\.\d+)?\s*(?:k|m)?(?![a-z0-9])|\b\d[\d,]*(?:\.\d+)?\s*(?:k\s*)?(?:usd|us\s*dollars?|dollars?|bucks|euros?|gbp|eur)\b|\busd\s*\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s*[$€£]/g,
    (m) => {
      slots.amounts.push({ value: parseAmount(m), raw: m.trim(), marked: true });
      return ' AMT ';
    }
  );
  c = c.replace(/\b\d+(?:\.\d+)?\s*(?:%|percent|pct|per\s*cent)(?![a-z])/g, (m) => {
    slots.pcts.push(parseAmount(m));
    return ' PCT ';
  });
  c = c.replace(/\b\d{1,3}\s*[:/]\s*\d{1,3}\b/g, (m) => {
    slots.ratios.push(m.replace(/\s+/g, ''));
    return ' RATIO ';
  });
  c = c.replace(/\b(?:1|one)\s*-?\s*step\b|\b1step\b/g, () => {
    slots.prods.add('atom-1step');
    return ' PROD ';
  });
  c = c.replace(/\b(?:2|two)\s*-?\s*step\b|\b2step\b/g, () => {
    slots.prods.add('atom-2step');
    return ' PROD ';
  });
  c = c.replace(/\b(\d{1,3})\s*k\b|\b(\d{1,3})[,.]?000\b/g, (m, a, b) => {
    slots.sizes.push(Number(a || b));
    return ' SIZE ';
  });
  c = c.replace(/\bpayouts?\s*#?\s*(\d+)\b/g, (m, n) => {
    slots.ords.push(Number(n));
    return ' PAYOUT ORD ';
  });
  c = c.replace(/\b(\d+)(?:st|nd|rd|th)\b/g, (m, n) => {
    slots.ords.push(Number(n));
    return ' ORD ';
  });
  c = c.replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/g, (m, w) => {
    slots.ords.push(ORD_WORDS[w]);
    return ' ORD ';
  });
  c = c.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(times?|payouts?|withdrawals?|cash\s*-?\s*outs?|settlements?)\b/g, (m, n, w) => {
    const v = ORD_WORDS[n] || Number(n);
    slots.ords.push(v);
    return /^time/.test(w) ? ' ORD times ' : ' ORD ' + w + ' ';
  });
  c = c.replace(/\badd\s*-?\s*ons?\b/g, ' addon ');
  c = c.replace(/\bcheck\s*-?\s*out\b/g, ' checkout ');
  c = c.replace(/\b(?:real|live)\s+(?:money|capital|funds|trading\s+capital|accounts?)\b/g, ' REALCAPITAL ');
  c = c.replace(/\b(?:before|without|excluding|ignoring)\s+(?:any\s+)?(?:coupons?|codes?|discounts?)\b/g, ' PRELIST ');
  c = c.replace(
    /\b(?:pay\s*-?\s*outs?|payouts?|withdrawals?|withdraw(?:s|ing|n)?|cash\s*-?\s*outs?|(?:get|gets|getting|got|am|are|is|be|been|being|was|were)\s+paid(?:\s+out)?|paid\s+out|pay(?:ing|s)?\s+out|reward\s+requests?)\b/g,
    ' PAYOUT '
  );
  c = c.replace(/\b(?:elite\s*atom|atom)\b/g, ' ATOM ');
  c = c.replace(/\b\d[\d,]*(?:\.\d+)?\b/g, (m) => {
    const v = parseAmount(m);
    if (v !== null && v >= 100 && (PRICE_POINT_VALUES.includes(v) || v === OBSOLETE_PRICE_VALUE)) {
      slots.amounts.push({ value: v, raw: m, marked: false });
      return ' AMT ';
    }
    slots.nums.push(v);
    return ' NUM ';
  });
  c = c.replace(/[^A-Za-z0-9\s]+/g, ' ');
  return { c: c.replace(/\s+/g, ' ').trim(), slots };
}

function tokensOf(c) {
  return c.match(/[A-Z]+|[a-z]+/g) || [];
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------
const RX = {
  strongRecovery:
    /refund|reimburs|rebate|recoup|repay|repaid|compensat|restitut|reclaim|charge\s*-?\s*back|chargeback|cash\s*-?\s*back|money\s*-?\s*back|pay\s*-?\s*back|give\s*-?\s*back|fee\s*-?\s*back|make\s+(?:me\s+)?whole|reversal|reversed|claw\s*-?\s*back|kick\s*-?\s*back|credited\s+(?:to|back)|credit\s+(?:it\s+)?back|\bmoney\s+return|made\s+whole/,
  weakRecovery: /\bback\b|\breturn(?:s|ed|ing)?\b|\brecover(?:s|ed|ing|y)?\b|\breverse[ds]?\b|\bcredited\b/,
  transferVerb:
    /\b(?:get|gets|getting|got|give|gives|gave|given|giving|receive|receives|received|receiving|send|sends|sent|sending|come|comes|coming|came|go|goes|going|went|credit|credits|credited|deposit|deposited|hand|handed|transfer|transferred|wire|wired|pay|pays|paid|paying|release|released|return|returned|refund|refunded|owed|owe)\b/,
  moneyGeneric: /\b(?:money|cash|funds?|dollars?|usd|bucks|capital|payments?|deposits?|investment|invested|earnings)\b/,
  priceWord: /\b(?:price|prices|pricing|priced|cost|costs|costing|fee|fees|charge|charges|cheap|cheaper|cheapest|expensive)\b/,
  spend:
    /\b(?:paid|payed|spent|spend|spending|bought|purchased|deposited|billed|charged|invested|put\s+(?:down|in)|forked|shelled|coughed|handed|wired|transferred|sent|gave|dropped|laid\s+out)\b/,
  firstPerson: /\b(?:i|im|ive|id|ill|we|my|our|mine|me|us)\b/,
  possessiveFee: /\b(?:my|our)\s+(?:\w+\s+){0,2}(?:fee|fees|payment|purchase|order|deposit|investment|money|cash|funds|spend)\b/,
  profitWord: /\b(?:profit|profits|reward|rewards|earned|gains?)\b/,
  splitWord: /\b(?:splits?|share|shares|sharing|keep|kept|cut|percentage)\b|PCT\s+of\s+(?:the\s+|my\s+)?(?:profit|reward)/,
  optionWord: /\b(?:options?|choices?|choose|chosen|choosing|default|defaults|available|available)\b/,
  timing:
    /\b(?:when|how\s+long|how\s+often|how\s+soon|how\s+fast|how\s+many\s+(?:days|weeks|times)|intervals?|schedules?|frequency|frequent|frequently|every|wait|waiting|timeline|timing|long|soon|often|days|weeks|day|week)\b/,
  timingStrong:
    /\b(?:when|how\s+long|how\s+often|how\s+soon|how\s+fast|how\s+many\s+(?:days|weeks|times)|intervals?|schedules?|frequency|frequent|frequently|every|wait|waiting|timeline|timing|long|soon|often)\b/,
  cap: /\b(?:cap|capped|caps|maximum|max|limit|limits|ceiling|biggest|largest|highest)\b|\bup\s+to\b/,
  rules: /\b(?:rules?|policy|policies|work|works|working|process|structure|terms|explain|details)\b/,
  change: /\b(?:increase|increases|increased|decrease|change|changes|changed|changing|goes?\s+up|go\s+up|improve|improves|raise|raised|lower|lowered|reduce|reduced|scale|scales|scaling|grow|grows|upgrade|upgraded|bump|boost|higher|bigger)\b/,
  calc: /\b(?:calculate|calculation|compute|total|sum|exact\s+date|what\s+date|which\s+date|by\s+when|worked\s+out|work\s+out|math|equals?|equal\s+to)\b/,
  howMuch: /\b(?:how\s+much|what\s+amount|how\s+many\s+dollars)\b/,
  couponStack: /\b(?:coupons?|codes?|voucher|vouchers|stack|stacks|stacked|stacking|combine|combined|combining)\b/,
  selection:
    /\b(?:should\s+(?:i|we)|recommend\w*|suggest\w*|advice|advise|best|better|worth|ideal|cheapest|most\s+popular|sku)\b|\bwhich\s+(?:one|size|plan|account|option|package)s?\b.{0,20}\b(?:buy|get|pick|choose|take|go|better|best|right)\b/,
  translation: /\btranslat|\b(?:in|into)\s+(?:urdu|hindi|spanish|arabic|portuguese|french|german|chinese|russian|turkish|bengali|farsi|persian|italian|roman\s+urdu)\b/,
  equality: /\b(?:exact(?:ly)?|equal(?:s|ity|led)?|boundary|edge|borderline|right\s+at|precisely|hits?)\b/,
  minutes: /\b(?:minutes?|mins?|window|windows|instruments?|before\s*\/?\s*after|seconds?|hours?)\b/,
  addon: /\b(?:add\s*-?\s*ons?|addons?|weekend|scalping|holding|hold)\b/,
  checkoutCue: /\b(?:checkout|check\s*-?\s*out|customi[sz]e|customi[sz]ation|configure|configuration|configurations|add\s*-?\s*ons?|addons?|options?)\b/,
  bundleCue: /\b(?:bundles?|multiple|several|second\s+account|market\s+maker|packs?|ORD\s+account|accounts\s+at\s+once|same\s+order)\b/,
  otherProduct: /\b(?:elite\s+packs?|packs\b|mt5|spread\s+test|elite\s+pro|instant\s+funding|stellar)\b/,
};

function evidenceFrom(c, slots, n) {
  const e = {};
  const has = (rx) => rx.test(c);
  e.payout = /\bPAYOUT\b/.test(c);
  e.ord = slots.ords.length > 0 || /\bORD\b/.test(c);
  e.amountMarked = slots.amounts.some((a) => a.marked);
  e.priceAmount = slots.amounts.some(
    (a) => a.value !== null && (PRICE_POINT_VALUES.includes(a.value) || a.value === OBSOLETE_PRICE_VALUE)
  );
  e.amountAny = slots.amounts.length > 0;
  e.firstPerson = has(RX.firstPerson);
  e.spendVerb = has(RX.spend);
  e.priceWord = has(RX.priceWord);
  e.moneyGeneric = has(RX.moneyGeneric);
  e.strongRecovery = has(RX.strongRecovery);
  e.weakRecovery = has(RX.weakRecovery);
  e.transfer = has(RX.transferVerb);
  e.profit = has(RX.profitWord);
  e.splitWord = has(RX.splitWord);
  e.timing = has(RX.timing) || slots.nums.length > 0 && /\b(?:days|weeks)\b/.test(c);
  const splitCoreEarly = /\b(?:splits?|share|shares|sharing|keep|kept|cut)\b/.test(c) || /PCT\s+of\s+(?:the\s+|my\s+)?(?:profit|reward)/.test(c);
  e.cap = has(RX.cap) || (e.payout && /\bPCT\b/.test(c) && !splitCoreEarly);
  e.rules = has(RX.rules);
  e.change = has(RX.change);
  e.calc = has(RX.calc);
  e.howMuch = has(RX.howMuch);
  e.couponStack = has(RX.couponStack);
  e.selection = has(RX.selection);
  e.translation = RX.translation.test(n.t);
  e.equality = has(RX.equality);
  e.minutes = has(RX.minutes);
  e.addon = has(RX.addon);
  e.otherProduct = RX.otherProduct.test(n.t);
  e.preList = /\bPRELIST\b/.test(c);
  e.realCapital = /\bREALCAPITAL\b/.test(c);

  e.feePaidStrong =
    (e.spendVerb && e.firstPerson &&
      (e.amountAny || e.priceWord || e.moneyGeneric || e.payout || e.ord || e.strongRecovery || e.weakRecovery)) ||
    has(RX.possessiveFee) ||
    (e.priceAmount && e.firstPerson && (e.payout || e.ord));
  e.feePaidWeak = e.spendVerb && e.firstPerson;
  e.rewardWord = /\b(?:reward|rewards)\b/.test(c);
  e.profitRef = e.profit || e.payout;
  const targetCtx = /\b(?:targets?|phases?)\b/.test(c);
  const splitCore = /\b(?:splits?|share|shares|sharing|keep|kept|cut)\b/.test(c) || /PCT\s+of\s+(?:the\s+|my\s+)?(?:profit|reward)/.test(c);
  e.timingStrong = has(RX.timingStrong);
  e.splitEv =
    (splitCore && e.profitRef) ||
    (/\bpercentage\b/.test(c) && e.profit && !targetCtx) ||
    (e.rewardWord && !targetCtx && (has(RX.optionWord) || /\bPCT\b/.test(c) || /\bpercent\b/.test(c))) ||
    /\bsplits?\b/.test(c);
  return e;
}

function productFrom(slots) {
  if (slots.prods.size === 0) return { product: null };
  if (slots.prods.size > 1) return { product: 'both' };
  return { product: [...slots.prods][0] };
}

const RISK_FLAGS = [
  'strongRecovery', 'weakRecovery', 'priceWord', 'moneyGeneric', 'feePaidStrong', 'feePaidWeak', 'spendVerb',
  'translation', 'transfer', 'firstPerson', 'couponStack', 'selection',
];

function analyze(input) {
  const n = normalize(input);
  const a = canon(n.t);
  const e = evidenceFrom(a.c, a.slots, n);
  const variants = [];
  if (n.tDeob !== n.t) variants.push(n.tDeob);
  if (n.tLeet !== n.tDeob && n.tLeet !== n.t) variants.push(n.tLeet);
  for (const v of variants) {
    const b = canon(v);
    const e2 = evidenceFrom(b.c, b.slots, n);
    for (const k of RISK_FLAGS) e[k] = e[k] || e2[k];
    if (b.slots.amounts.length && !a.slots.amounts.length) {
      e.amountAny = true;
      e.priceAmount = e.priceAmount || e2.priceAmount;
    }
    n.obfuscationVariant = true;
  }
  const tokens = tokensOf(a.c);
  return {
    n,
    c: a.c,
    slots: a.slots,
    tokens,
    e,
    product: productFrom(a.slots).product,
  };
}

module.exports = {
  deobfuscate,
  PRICE_POINT_VALUES,
  OBSOLETE_PRICE_VALUE,
  MAX_ASK_CHARS,
  RX,
  normalize,
  looksNonEnglish,
  readLanguageGate,
  canon,
  tokensOf,
  analyze,
  foreignScore,
};
