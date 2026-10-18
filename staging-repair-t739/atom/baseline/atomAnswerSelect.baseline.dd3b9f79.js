'use strict';
/**
 * Atom answer selection — CLASSIFY / SELECT only (V12 contract).
 * Never returns free-text facts; only answer_id or abstain.
 *
 * C-ARCH-1: needs_owner_decision / provisional / non-sendable rows never
 * return as sendable answerIds — fail closed to handoff.
 */
const approved = require('./atomApprovedAnswers');

const CONFIDENCE_THRESHOLD = Number(process.env.LUNA_ATOM_SELECT_THRESHOLD || 0.72);

function detectLangHint(text) {
  const t = String(text || '');
  if (/[\u0600-\u06ff]{3,}/.test(t)) return 'ur';
  if (/[\u0900-\u097f]/.test(t)) return 'hi';
  if (/\b(?:el|la|los|las|qué|que|cuál|cual|límite|limite|pérdida|perdida|apalancamiento|recompensa)\b/i.test(t)) {
    return 'es';
  }
  if (/\b(?:o|a|os|as|qual|quais|limite|perda|alavancagem|recompensa|saque)\b/i.test(t) && /\b(?:atom|elite)\b/i.test(t)) {
    return 'pt';
  }
  if (/\b(?:hai|hain|mein|kitna|kya|nahi|nahin|bhai|ka|ki|ke|aap|phase|target)\b/i.test(t)) {
    return 'ur-latn';
  }
  return 'en';
}

function atomProductHint(text) {
  const t = String(text || '').toLowerCase();
  const isAtom = /\belite\s*atom\b|\batom\b/.test(t);
  if (!isAtom) return '';
  if (/1\s*-?\s*step|one\s*-?\s*step|1step/.test(t)) return 'atom-1step';
  if (/2\s*-?\s*step|two\s*-?\s*step|2step/.test(t)) return 'atom-2step';
  return 'atom';
}

/**
 * D3 STRUCTURAL gate (deny-by-default) — NOT a refund-synonym lexicon.
 *
 * Zone A: fee / price / cost / payment terms (EN + ES/PT + UR/HI/AR scripts + Roman Urdu).
 * Zone B: payout timing/context OR money-recovery/compensation context
 *         (return/back/credit/cashback/reimburse/rebate/compensat/recover/…).
 *
 * A ∩ B → fee-policy risk → ABSTAIN unless a narrow POSITIVE allow-list says the
 * ask is a known-general payout (or pure price-list) question the KB answers exactly.
 * Unknown → abstain.
 */
function normAsk(text) {
  const raw = String(text || '');
  const t = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return { raw, t };
}

function hasAtomFeeMoneyTerm(raw, t) {
  // Zone A: fee / price / cost / payment terms (any language/script). Not "profit" alone.
  if (
    /\bfees?\b/.test(t) ||
    /\bchallenge\s*fees?\b/.test(t) ||
    /\b(?:entry|activation|purchase|challenge)\s*(?:fees?|price|cost|payment)\b/.test(t) ||
    /\b(?:price|prices|pricing|cost|costs|payment|payments|charge|charges)\b/.test(t) ||
    /\b(?:cuota|cuotas|tarifa|tarifas|precio|precios|costo|coste|pago\s+del\s+desaf)/.test(t) ||
    /\b(?:taxa|taxas|preco|preços|precos|custo|custos)\b/.test(t) ||
    /\b(?:qeemat|keemat|qimat|fees?)\b/.test(t) ||
    /فیس|قیمت|رسوم|تكلفة|سعر|शुल्क|फीस|कीमत|ادائیگی\s*فیس/.test(raw)
  ) {
    return true;
  }
  return false;
}

function hasAtomPayoutContext(raw, t) {
  // Zone B branch: payout / withdrawal / reward-request timing context (multilingual).
  return (
    /\bpayouts?\b/.test(t) ||
    /\bpay[\s-]?outs?\b/.test(t) ||
    /\bthird\s+payout\b/.test(t) ||
    /\b3(?:rd)?\s*payout\b/.test(t) ||
    /\bpayout\s*#?\s*3\b/.test(t) ||
    /\bwithdrawals?\b/.test(t) ||
    /\breward\s*requests?\b/.test(t) ||
    /\b(?:saque|retiro|retirada)\b/.test(t) ||
    /ادائیگی|पेआउट|دفعة|الدفعة/.test(raw)
  );
}

function hasAtomMoneyRecoveryContext(raw, t) {
  // Zone B branch: money/value recovery / compensation / return-back class.
  // Stem/class detectors — deny-by-default with fee terms; NOT a closed "refund" synonym patch list.
  return (
    /refund/.test(t) || // refund, refunded, refundable, …
    /reembols/.test(t) ||
    /devoluc/.test(t) ||
    /restitui/.test(t) ||
    /reimburs/.test(t) ||
    /rebate/.test(t) ||
    /compensat/.test(t) ||
    /recover/.test(t) ||
    /repay|repaid|repayment/.test(t) ||
    /cash\s*back/.test(t) ||
    /money\s+back/.test(t) ||
    /fee\s+back/.test(t) ||
    /pay\s*back/.test(t) ||
    /give\s*(?:\w+\s+){0,3}back/.test(t) ||
    /get(?:ting)?\s*(?:\w+\s+){0,4}back/.test(t) ||
    /got\s*(?:\w+\s+){0,4}back/.test(t) ||
    /come\s*back/.test(t) ||
    /kick\s*back/.test(t) ||
    /claw\s*back/.test(t) ||
    /\breturned\b/.test(t) ||
    /\breturning\b/.test(t) ||
    /\breturns?\b/.test(t) ||
    // "credit back" / fee-linked credit — not pack/bundle account credits.
    /\bcredit(?:s|ed)?\s+backs?\b/.test(t) ||
    (/\bcredits?\b/.test(t) &&
      /\b(?:fees?|challenge|refund|reimburs|return)/.test(t) &&
      !/\b(?:pack|bundle|market\s*maker)\b/.test(t)) ||
    /\bwapas(?:i|y|a)?\b/.test(t) ||
    /واپس|ریفنڈ|استرداد|रिफंड|वापस|वापसी|वापस[ीि]?/.test(raw)
  );
}

function isAllowlistedPurePriceAsk(raw, t) {
  // Known KB: atom.prices.list — list price / how much, no recovery, no payout#.
  if (hasAtomMoneyRecoveryContext(raw, t) || hasAtomPayoutContext(raw, t)) return false;
  return (
    /(?:how\s*much|list\s*price|price\s*list|\$19|\$59|\$114|\$215|\$289|\$409|\$519|7k|25k|50k|100k|200k)/.test(t) ||
    (/\b(?:price|cost|prices|costs)\b/.test(t) && /(?:atom|challenge|account|plan)/.test(t) && !/\bfees?\b/.test(t))
  );
}

function isAllowlistedGeneralPayoutAsk(raw, t) {
  // Known KB: atom.payouts.general — timing/caps only. Never when fee-money ∩ recovery/payout-fee mix.
  if (hasAtomFeeMoneyTerm(raw, t)) return false;
  if (hasAtomMoneyRecoveryContext(raw, t)) return false;
  if (/first\s+(?:payout|withdrawal|withdraw)/.test(t) && /(?:21|when|how\s*long|after|days)/.test(t)) return true;
  if (/(?:payout\s+interval|every\s+\d+|subsequent\s+payout|next\s+payout|between\s+payouts)/.test(t)) return true;
  if (/14\s*days/.test(t) && /\bpayout/.test(t)) return true;
  if (/21\s*days/.test(t) && /\bpayout/.test(t)) return true;
  if (/3\s*%/.test(t) && /(?:cap|max|maximum|of\s+(?:starting|balance|account)|payout)/.test(t)) return true;
  if (/1\.5\s*%/.test(t) && /(?:risk|instrument|day|per)/.test(t)) return true;
  if (/(?:how\s+(?:do|does)|what\s+(?:are|is))\s+(?:the\s+)?(?:atom\s+)?payouts?\s+(?:work|rules|policy|schedule)?/.test(t)) {
    return true;
  }
  if (/\bpayout\s+(?:rules|policy|schedule|timing|structure)\b/.test(t)) return true;
  return false;
}

/** Fee-policy risk: fee/price/cost/payment ∩ (payout ∨ money-recovery). */
function isAtomFeePolicyRiskAsk(text) {
  const { raw, t } = normAsk(text);
  if (!hasAtomFeeMoneyTerm(raw, t)) return false;
  if (isAllowlistedPurePriceAsk(raw, t)) return false;
  if (isAllowlistedGeneralPayoutAsk(raw, t)) return false;
  return hasAtomPayoutContext(raw, t) || hasAtomMoneyRecoveryContext(raw, t);
}

/** @deprecated name kept as alias for call sites / tests during transition */
function isAtomFeeRefundPolicyAsk(text) {
  return isAtomFeePolicyRiskAsk(text);
}

function accountStatusAsk(text) {
  const t = String(text || '');
  // Fee-policy risk asks are D3 (abstain), not personal account-status refuse.
  if (isAtomFeePolicyRiskAsk(t)) return false;
  if (/\b(?:my|our)\b.{0,40}\b(?:kyc|payout|withdrawal|refund|breach|account\s+status|verification|approval)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:did|has|have)\s+(?:my|i|we)\b.{0,40}\b(?:breach|pass(?:ed)?|fail(?:ed)?|approv|verif)/i.test(t)) {
    return true;
  }
  if (/\b(?:is|was|has)\s+my\b.{0,40}\b(?:approved|verified|closed|breached|paid|sent|eligible)\b/i.test(t)) {
    return true;
  }
  if (/\bcheck\s+my\b.{0,40}\b(?:account|payout|kyc|status|breach)\b/i.test(t)) return true;
  if (/\b(?:am i|can i get)\b.{0,40}\b(?:payout|paid|eligible)\b/i.test(t) && /\b(?:my|account|now)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:meri|mera|hamari)\b.{0,40}\b(?:kyc|payout|breach|account)\b/i.test(t)) return true;
  if (/\b(?:mi|su)\s+(?:cuenta|pago|verificaci[oó]n|retiro)\b/i.test(t) && /\b(?:aprob|verific|envi|cerr|eleg)/i.test(t)) {
    return true;
  }
  return false;
}

function isAtom2(prod, t) {
  return prod === 'atom-2step' || (/atom/.test(t) && /2\s*-?\s*step/.test(t));
}
function isAtom1(prod, t) {
  return prod === 'atom-1step' || (/atom/.test(t) && /1\s*-?\s*step/.test(t));
}

const SELECTORS = [
  {
    id: 'atom.obsolete.10pct-1step.en',
    conf: 0.96,
    test: (t, prod) =>
      /atom/.test(t) &&
      /1\s*-?\s*step|one\s*-?\s*step|atom-1step/.test(prod + ' ' + t) &&
      /(?:10\s*%|ten\s*percent)/.test(t) &&
      /(?:target|profit|pass|phase)/.test(t),
  },
  {
    // A11 / obsolete 14-day first wait — payout OR withdrawal paraphrases
    id: 'atom.obsolete.first-payout-14.en',
    conf: 0.96,
    test: (t) =>
      /atom/.test(t) &&
      /(?:first\s+)?(?:payout|withdrawal|withdraw|reward\s*request)/.test(t) &&
      /(?:14\s*days|two\s*weeks|2\s*weeks)/.test(t),
  },
  {
    id: 'atom.obsolete.leverage-150-default.en',
    conf: 0.95,
    test: (t) => /atom/.test(t) && /leverage|apalanc/.test(t) && /1\s*:\s*50|1\/50/.test(t),
  },
  {
    id: 'atom.obsolete.price-161-permanent.en',
    conf: 0.97,
    test: (t) => /atom/.test(t) && /\$?\s*161\b|161\s*(?:usd|dollars)?/.test(t),
  },
  {
    id: 'atom.obsolete.sizes-5k-10k.en',
    conf: 0.94,
    test: (t) => /atom/.test(t) && /(?:5\s*k|10\s*k|5,000|10,000|5000|10000)/.test(t) && /(?:size|account|plan|challenge|buy|price)/.test(t),
  },
  // Consistency BEFORE phases (C-ROUTE-1 / D7) — higher conf; phases must not steal "challenge phases"
  {
    id: 'atom.2step.consistency.en',
    conf: 0.97,
    test: (t, prod) => /consistenc/.test(t) && isAtom2(prod, t),
  },
  {
    id: 'atom.1step.consistency.en',
    conf: 0.97,
    test: (t, prod) => /consistenc/.test(t) && isAtom1(prod, t),
  },
  // Reward options BEFORE generic payouts (M-SEL-1 / D7)
  {
    id: 'atom.1step.reward.en',
    conf: 0.96,
    test: (t, prod) =>
      isAtom1(prod, t) &&
      /(?:reward\s*share|profit\s*split|keep\s*(?:up\s*to\s*)?\d|options?)/.test(t) &&
      /(?:reward|split|share|70|80|100)/.test(t),
  },
  {
    id: 'atom.2step.reward.en',
    conf: 0.96,
    test: (t, prod) =>
      isAtom2(prod, t) &&
      /(?:reward\s*share|profit\s*split|keep\s*(?:up\s*to\s*)?\d|options?)/.test(t) &&
      /(?:reward|split|share|60|70|80|95)/.test(t),
  },
  // Funded profitable days — also when ask contrasts evaluation vs funded (A19 / M-SEL-3)
  {
    id: 'atom.1step.funded-profitable-days.en',
    conf: 0.96,
    test: (t, prod) =>
      isAtom1(prod, t) &&
      /(?:profitable\s*days|0\.5\s*%|five\s*days|5\s*days)/.test(t) &&
      /(?:funded|payout|evaluation|challenge|require|minimum|before)/.test(t),
  },
  {
    id: 'atom.2step.phases.en',
    conf: 0.93,
    test: (t, prod) =>
      isAtom2(prod, t) &&
      !/consistenc/.test(t) &&
      /(?:profit\s*target|phase\s*1|phase\s*2|targets?|8\s*%|5\s*%)/.test(t) &&
      !/(?:daily|max(?:imum)?\s*loss|drawdown)/.test(t),
  },
  {
    id: 'atom.1step.phases.en',
    conf: 0.93,
    test: (t, prod) =>
      isAtom1(prod, t) &&
      !/consistenc/.test(t) &&
      /(?:profit\s*target|target|8\s*%|phase)/.test(t) &&
      !/(?:daily|max(?:imum)?\s*loss|drawdown|0\.5\s*%|profitable\s*days)/.test(t),
  },
  {
    id: 'atom.2step.daily-loss.en',
    conf: 0.94,
    test: (t, prod) =>
      /(?:daily|day).{0,24}(?:loss|limit)|(?:loss|limit).{0,24}(?:daily|day)|روزانہ|نقصان|خسار|दैनिक|हानि|pérdida\s*diaria|perda\s*di[aá]ria|kitna.*loss|loss.*kitna/.test(
        t
      ) &&
      isAtom2(prod, t),
  },
  {
    id: 'atom.1step.daily-loss.en',
    conf: 0.94,
    test: (t, prod) =>
      /(?:daily|day).{0,24}(?:loss|limit)|روزانہ|نقصان|خسار|दैनिक|हानि|pérdida\s*diaria|perda\s*di[aá]ria|kitna.*loss|loss.*kitna/.test(
        t
      ) &&
      isAtom1(prod, t),
  },
  {
    id: 'atom.2step.max-loss.en',
    conf: 0.94,
    test: (t, prod) =>
      /(?:max(?:imum)?\s*loss|drawdown|static|floor|90,?000)/.test(t) && isAtom2(prod, t),
  },
  {
    id: 'atom.1step.max-loss.en',
    conf: 0.94,
    test: (t, prod) =>
      /(?:max(?:imum)?\s*loss|drawdown|trailing|floor|94,?000)/.test(t) && isAtom1(prod, t),
  },
  {
    id: 'atom.2step.min-days.en',
    conf: 0.9,
    test: (t, prod) =>
      /(?:min(?:imum)?\s*(?:trading\s*)?days|time\s*limit|deadline|no\s*minimum)/.test(t) &&
      isAtom2(prod, t) &&
      !/0\.5\s*%|profitable\s*days/.test(t),
  },
  {
    id: 'atom.1step.min-days.en',
    conf: 0.9,
    test: (t, prod) =>
      /(?:min(?:imum)?\s*(?:trading\s*)?days|time\s*limit|deadline|no\s*minimum)/.test(t) &&
      isAtom1(prod, t) &&
      !/0\.5\s*%|profitable\s*days|five\s*days|5\s*days/.test(t),
  },
  {
    id: 'atom.2step.news.en',
    conf: 0.91,
    test: (t, prod) => /news/.test(t) && isAtom2(prod, t) && !/(?:minute|window|instrument)/.test(t),
  },
  {
    id: 'atom.1step.news.en',
    conf: 0.91,
    test: (t, prod) => /news/.test(t) && isAtom1(prod, t) && !/(?:minute|window|instrument)/.test(t),
  },
  // Disputed cues still classified for logging, but select path fail-closes (C-ARCH-1).
  {
    id: 'atom.consistency.boundary.en',
    conf: 0.9,
    test: (t) => /atom/.test(t) && /consistenc/.test(t) && /(?:exact(?:ly)?\s*50|50\s*%\s*exact|equal(?:s|ity)?|boundary|edge)/.test(t),
  },
  {
    id: 'atom.news.minutes.unverified.en',
    conf: 0.93,
    test: (t) => /atom/.test(t) && /news/.test(t) && /(?:minute|window|5\s*min|before\/after|instrument)/.test(t),
  },
  {
    // POSITIVE allow-list only — bare /payout/ must never select this (D3 deny-by-default).
    id: 'atom.payouts.general.en',
    conf: 0.88,
    test: (t) => /atom/.test(t) && isAllowlistedGeneralPayoutAsk(t, t) && !/(?:14\s*days|two\s*weeks|2\s*weeks)/.test(t),
  },
  {
    id: 'atom.prices.list.en',
    conf: 0.93,
    test: (t) => {
      const { raw } = normAsk(t);
      return (
        /atom/.test(t) &&
        isAllowlistedPurePriceAsk(raw, t) &&
        !/\$?\s*161\b/.test(t)
      );
    },
  },
  {
    id: 'atom.checkout.options.en',
    conf: 0.9,
    test: (t) => /atom/.test(t) && /(?:checkout|customis|customiz|add-?on|weekend\s*hold|scalping\s*add)/.test(t),
  },
  {
    id: 'atom.bundles.en',
    conf: 0.93,
    test: (t) =>
      /atom/.test(t) &&
      /(?:bundle|pack\s*credit|market\s*maker|6,?000\s*credit|25%\s*off|second\s*account|3\s*accounts)/.test(t),
  },
  {
    id: 'atom.2step.leverage.en',
    conf: 0.9,
    test: (t, prod) => /leverage|apalanc/.test(t) && isAtom2(prod, t) && !/1\s*:\s*50|1\/50/.test(t),
  },
  {
    id: 'atom.1step.leverage.en',
    conf: 0.9,
    test: (t, prod) => /leverage|apalanc/.test(t) && isAtom1(prod, t) && !/1\s*:\s*50|1\/50/.test(t),
  },
  {
    id: 'atom.house.eas-copy.en',
    conf: 0.9,
    test: (t) => /atom/.test(t) && /(?:\bea\b|expert\s*advisor|copier|copy\s*trad)/.test(t),
  },
  {
    id: 'atom.house.simulated.en',
    conf: 0.9,
    test: (t) => /atom/.test(t) && /(?:simulated|real\s*capital|guaranteed\s*reward|live\s*funds)/.test(t),
  },
  {
    id: 'atom.overview.en',
    conf: 0.8,
    test: (t) =>
      /(?:what\s+is|tell\s+me\s+about|explain)\s+(?:the\s+)?(?:elite\s*)?atom\b|\belite\s*atom\s+overview\b|^elite\s*atom\??$|^what\s+is\s+atom\b/.test(
        t
      ) && !/1\s*-?\s*step|2\s*-?\s*step|refund|payout|price|loss|leverage|news|bundle/.test(t),
  },
];

function preferLocale(answerId, lang) {
  if (!lang || lang === 'en') return answerId;
  const base = String(answerId).replace(/\.en$/, '');
  const mapped = {
    'ur-latn': base + '.ur-latn',
    ur: base + '.ur',
    hi: base + '.hi',
    es: base + '.es',
    pt: base + '.pt',
  }[lang];
  if (mapped && approved.get(mapped)) {
    const row = approved.get(mapped);
    // Never prefer a non-sendable locale row (provisional / needs_owner).
    if (!approved.isSendable(row)) return answerId;
    if (row.translationStatus === 'unverified' && process.env.LUNA_FAQ_ALLOW_UNVERIFIED_TRANSLATIONS !== '1') {
      return answerId;
    }
    return mapped;
  }
  return answerId;
}

/**
 * Resolve to a sendable answer id, or null → caller abstains (fail closed).
 */
function resolveSendable(answerId, lang) {
  let id = preferLocale(answerId, lang);
  let row = approved.get(id);
  if (row && approved.isSendable(row)) return { answerId: id, row };
  // Locale mapped to provisional → fall back to EN if sendable.
  if (id !== answerId) {
    row = approved.get(answerId);
    if (row && approved.isSendable(row)) return { answerId, row };
  }
  // Explicit EN fallback when preferred id is non-sendable.
  const enId = String(answerId).replace(/\.(ur-latn|ur|hi|es|pt)$/, '.en');
  const enRow = approved.get(enId);
  if (enRow && approved.isSendable(enRow)) return { answerId: enId, row: enRow };
  return null;
}

async function selectAtomAnswer(text, opts) {
  opts = opts || {};
  const raw = String(text || '').trim();
  if (!raw) return { abstain: true, reason: 'empty' };

  if (opts.paused) return { abstain: true, reason: 'global-pause' };
  if (opts.aiOff) return { abstain: true, reason: 'aiOff' };
  if (opts.stop) return { abstain: true, reason: 'STOP' };
  if (opts.finWait) return { abstain: true, reason: 'fin-wait' };
  if (opts.protectedTeam) return { abstain: true, reason: 'protected-team-silence' };

  // D3 structural deny-by-default: before account-status and before any selector.
  if (isAtomFeePolicyRiskAsk(raw)) {
    return {
      abstain: true,
      reason: 'atom-fee-policy-owner-decision',
      failClosed: true,
      handoff: true,
    };
  }

  if (accountStatusAsk(raw)) {
    const resolved = resolveSendable('atom.account-status.refuse.en', opts.langHint || detectLangHint(raw));
    if (!resolved) return { abstain: true, reason: 'account-status-boundary-unsendable', failClosed: true };
    return {
      abstain: false,
      answerId: resolved.answerId,
      confidence: 0.99,
      reason: 'account-status-boundary',
      contentHash: resolved.row.contentHash,
      boundary: true,
      status: resolved.row.status,
    };
  }

  if (!/\batom\b|\belite\s*atom\b/i.test(raw) && !(opts.priorClientTexts || []).some((x) => /\batom\b/i.test(x))) {
    return { abstain: true, reason: 'not-atom-scope' };
  }

  const lang = opts.langHint || detectLangHint(raw);
  let prod = atomProductHint(raw);
  if (!prod || prod === 'atom') {
    const hist = (opts.priorClientTexts || []).join('\n');
    prod = atomProductHint(hist + '\n' + raw) || prod;
  }
  const surface = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  let best = null;
  for (const s of SELECTORS) {
    if (!s.test(surface, prod) && !s.test(raw.toLowerCase(), prod)) continue;
    if (!best || s.conf > best.conf) best = { answerId: s.id, confidence: s.conf, reason: 'deterministic-cue' };
  }

  if (!best && opts.priorClientTexts && /^(?:and|also|what about)\b/i.test(raw)) {
    const histProd = atomProductHint((opts.priorClientTexts || []).join('\n'));
    if (/daily|loss|limit/i.test(raw)) {
      if (histProd === 'atom-2step') {
        best = { answerId: 'atom.2step.daily-loss.en', confidence: 0.86, reason: 'contextual-followup' };
      } else if (histProd === 'atom-1step') {
        best = { answerId: 'atom.1step.daily-loss.en', confidence: 0.86, reason: 'contextual-followup' };
      }
    }
  }

  if (!best) {
    return { abstain: true, reason: 'no-exact-approved-answer', lang, failClosed: true };
  }
  if (best.confidence < CONFIDENCE_THRESHOLD) {
    return { abstain: true, reason: 'below-threshold', failClosed: true, answerId: best.answerId };
  }

  // C-ARCH-1: disputed / provisional never send — abstain to handoff.
  const matched = approved.get(best.answerId);
  if (matched && !approved.isSendable(matched)) {
    return {
      abstain: true,
      reason: 'non-sendable-status-fail-closed',
      failClosed: true,
      answerId: best.answerId,
      status: matched.status,
      handoff: true,
    };
  }

  const resolved = resolveSendable(best.answerId, lang);
  if (!resolved) {
    return {
      abstain: true,
      reason: 'non-sendable-status-fail-closed',
      failClosed: true,
      answerId: best.answerId,
      handoff: true,
    };
  }

  if (opts.requireOwnerApproved && resolved.row.approval !== 'owner-approved') {
    // Legacy flag: no rows are owner-approved yet (D8); treat as fail-closed unless source-verified allowed.
    if (resolved.row.approval !== 'source-verified') {
      return { abstain: true, reason: 'needs-owner-approval', answerId: resolved.answerId, failClosed: true };
    }
  }

  return {
    abstain: false,
    answerId: resolved.answerId,
    confidence: best.confidence,
    reason: best.reason,
    lang,
    contentHash: resolved.row.contentHash,
    intentTags: resolved.row.intentTags.slice(),
    status: resolved.row.status,
    approval: resolved.row.approval,
    sendable: true,
  };
}

module.exports = {
  CONFIDENCE_THRESHOLD,
  detectLangHint,
  atomProductHint,
  accountStatusAsk,
  isAtomFeePolicyRiskAsk,
  isAtomFeeRefundPolicyAsk, // alias
  isAllowlistedGeneralPayoutAsk,
  isAllowlistedPurePriceAsk,
  hasAtomFeeMoneyTerm,
  hasAtomPayoutContext,
  hasAtomMoneyRecoveryContext,
  selectAtomAnswer,
  preferLocale,
  resolveSendable,
};
