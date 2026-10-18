'use strict';
/**
 * V12 answer selection — CLASSIFY / SELECT only.
 * Returns an approved answer id + confidence, or abstain.
 * Never returns customer-facing factual prose to send.
 */
const approved = require('./faqApprovedAnswers');

const CONFIDENCE_THRESHOLD = Number(process.env.LUNA_FAQ_SELECT_THRESHOLD || 0.72);

function hasNonLatin(text) {
  return /[^\u0000-\u007f]/.test(String(text || ''));
}

const ES_CUE_RE = /\b(?:el|la|los|las|qué|que|cuál|cual|límite|limite|pérdida|perdida|días|dias|apalancamiento)\b/i;
// 'please' is ordinary English and is deliberately not a Roman Urdu cue.
const UR_LATN_CUE_RE = /\b(?:hai|hain|mein|kitna|kya|nahi|nahin|bhai|ka|ki|ke|ho\s+gaya|aap|aapki|aap\s*ka)\b/i;

function detectLangHint(text) {
  const t = String(text || '');
  if (/[\u0600-\u06ff]/.test(t) && /[\u0600-\u06ff]{3,}/.test(t)) {
    // Arabic vs Urdu script: Arabic FAQs use Arabic answers; Urdu script still maps via tags.
    if (/(?:حد|الخسارة|اليومية|هل|ما\s+هو)/.test(t)) return 'ar';
    return 'ur';
  }
  if (/[\u0900-\u097f]/.test(t)) return 'hi';
  if (ES_CUE_RE.test(t)) return 'es';
  if (UR_LATN_CUE_RE.test(t)) return 'ur-latn';
  return 'en';
}

const EN_FUNCTION_WORDS = new Set(
  'a an the is are was were am be been do does did can could will would should may might i me my we our you your it its this that these those what when where which who whom why how to of in on at for from with without about and or but if so not no yes as by than then there here have has had get got need want please thanks thank hello hi'.split(
    ' '
  )
);

function englishEvidence(text) {
  const words = String(text || '')
    .toLowerCase()
    .match(/[a-z']+/g);
  if (!words || words.length < 3) return false;
  const seen = new Set(words.filter((w) => EN_FUNCTION_WORDS.has(w)));
  seen.delete('please');
  seen.delete('thanks');
  seen.delete('thank');
  seen.delete('hello');
  seen.delete('hi');
  return seen.size >= 2;
}

function nonEnglishEvidence(text) {
  const t = String(text || '');
  return hasNonLatin(t) || ES_CUE_RE.test(t) || UR_LATN_CUE_RE.test(t);
}

/**
 * Tri-state language gate. A short catalog term ("payout?") is not English evidence: English
 * needs function-word evidence in the current text or in prior customer messages. Language
 * never establishes intent; this only decides whether the model-classifier route may run.
 * 'non-en' is returned unchanged for the existing non-English route.
 */
function languageGate(text, priorTexts) {
  const cur = String(text || '');
  if (nonEnglishEvidence(cur)) return { lang: 'non-en', basis: 'current-non-english' };
  if (englishEvidence(cur)) return { lang: 'en', basis: 'current-english' };
  const prior = (Array.isArray(priorTexts) ? priorTexts : []).map((x) => String(x || '')).filter(Boolean);
  if (prior.some(nonEnglishEvidence)) return { lang: 'non-en', basis: 'prior-non-english' };
  if (prior.some(englishEvidence)) return { lang: 'en', basis: 'prior-english' };
  return { lang: 'uncertain', basis: 'no-reliable-evidence' };
}

function productHint(text) {
  const t = String(text || '').toLowerCase();
  if (/2\s*-?\s*step\s*lite|lite\s*2\s*-?\s*step|2step\s*lite/.test(t)) return '2step-lite';
  if (/1\s*-?\s*step\s*lite|lite\s*1\s*-?\s*step/.test(t)) return '1step-lite';
  if (/2\s*-?\s*step/.test(t)) return '2step';
  if (/1\s*-?\s*step/.test(t)) return '1step';
  if (/\binstant\b/.test(t)) return 'instant';
  return '';
}

function accountStatusAsk(text) {
  const t = String(text || '');
  // Customer-specific status / KYC / payout / breach / transaction — never FAQ-select.
  if (/\b(?:my|our)\b.{0,40}\b(?:kyc|payout|withdrawal|refund|breach|account\s+status|verification|approval)\b/i.test(t)) return true;
  if (/\b(?:did|has|have)\s+(?:my|i|we)\b.{0,40}\b(?:breach|pass(?:ed)?|fail(?:ed)?|approv|verif)/i.test(t)) return true;
  if (/\b(?:is|was|has)\s+my\b.{0,40}\b(?:approved|verified|closed|breached|paid|sent)\b/i.test(t)) return true;
  if (/\bcheck\s+my\b.{0,40}\b(?:account|payout|kyc|status)\b/i.test(t)) return true;
  if (/\b(?:meri|mera|hamari|aap\s*ne\s*mera)\b.{0,40}\b(?:kyc|payout|breach|account)\b/i.test(t)) return true;
  if (/\b(?:mi|su)\s+(?:cuenta|pago|verificaci[oó]n|retiro)\b.{0,40}\b(?:aprob|verific|envi|cerr)/i.test(t)) return true;
  if (/\b(?:partial|partials)\b/i.test(t) && /\b(?:close|closed|count|profit|profitable|0\.5\s*%)/i.test(t)) return true;
  if (/\b(?:my|i'?m|i am)\b.{0,48}\b(?:trade|position|account)\b/i.test(t) && /\b(?:partial|fully closed|count toward|dosent count|doesn'?t count)/i.test(t)) {
    return true;
  }
  return false;
}

function payoutConsistencyAsk(q) {
  const t = String(q || '');
  return /\bpayouts?\b/i.test(t) && /\b(?:held|hold|holding|consistenc|review|normal|delay|pending|check|stuck|wait)/i.test(t);
}

const SELECTORS = [
  {
    id: 'faq.stop-loss-mandatory.en',
    conf: 0.95,
    test: (t, tok) =>
      /stop\s*-?\s*loss/i.test(t) &&
      /(?:mandatory|required|necessary|compulsory|need|optional|zoruri|lazim|obligator)/i.test(t),
  },
  {
    id: 'faq.2step-lite.daily-loss.en',
    conf: 0.93,
    test: (t) =>
      /(?:daily|day).{0,24}(?:loss|lim+it)|(?:loss|lim+it).{0,24}(?:daily|day)|perdida\s*diaria|خسار|الحد\s*ال?يوم|kitna.*loss|loss.*kitna/i.test(
        t
      ) &&
      /2\s*-?\s*step\s*lite|lite\s*2\s*-?\s*step|2step\s*lite/i.test(t),
  },
  {
    id: 'faq.2step.daily-loss.en',
    conf: 0.9,
    test: (t, _tok, prod) =>
      /(?:daily|day).{0,24}(?:loss|lim+it)|(?:loss|lim+it).{0,24}(?:daily|day)/i.test(t) &&
      prod === '2step',
  },
  {
    id: 'faq.1step.daily-loss.en',
    conf: 0.9,
    test: (t, _tok, prod) =>
      /(?:daily|day).{0,24}(?:loss|lim+it)/i.test(t) && prod === '1step',
  },
  {
    id: 'faq.daily-loss.generic.en',
    conf: 0.8,
    test: (t) => /(?:daily|day).{0,24}(?:loss|lim+it)|perdida\s*diaria|خسار|الحد\s*ال?يوم|daily\s*loss|day\s*loss/i.test(t),
  },
  {
    id: 'faq.2step-lite.min-trading-days.en',
    conf: 0.9,
    test: (t) =>
      /min(?:imum)?\s*trad(?:e|ing)\s*days?|trading\s*days?\s*(?:required|minimum)|días\s*de\s*trading/i.test(t) &&
      /lite|2\s*-?\s*step/i.test(t),
  },
  {
    id: 'faq.min-holding-time.en',
    conf: 0.9,
    test: (t) =>
      /min(?:imum)?\s+(?:trade\s+)?(?:hold(?:ing)?|duration)|holding\s*time|minimum\s*trade\s*duration|tiempo\s*m[ií]nimo/i.test(
        t
      ),
  },
  {
    id: 'faq.soft-breach.en',
    conf: 0.88,
    test: (t) => /soft\s*-?\s*breach|ソフト.?ブリーチ/i.test(t),
  },
  {
    id: 'faq.travel-trade.en',
    conf: 0.88,
    test: (t) =>
      /(?:travel|viaj|سفر|safar).{0,40}(?:trade|trad|ip)|(?:ip).{0,40}(?:travel|chang|location)|different\s+ip/i.test(t),
  },
  {
    id: 'faq.2step-lite.leverage.en',
    conf: 0.88,
    test: (t) => /leverage|apalancamiento|رافعة|レバレッジ/i.test(t) && /lite|2\s*-?\s*step/i.test(t),
  },
  {
    id: 'faq.profit-split.en',
    conf: 0.85,
    test: (t) => /profit\s*split|reparto\s*de\s*beneficio|نسبة\s*الربح/i.test(t),
  },
  {
    id: 'faq.payout-request-timing.en',
    conf: 0.9,
    test: (t) =>
      /\b(?:when|how)\b.{0,32}\b(?:can|could|do)\b.{0,32}\b(?:request|withdraw|get)\b.{0,24}\b(?:the\s+)?payout\b/i.test(t) ||
      /\bwhen\s+can\s+i\s+request\b.{0,24}\bpayout\b/i.test(t),
  },
  {
    id: 'faq.is-broker.en',
    conf: 0.9,
    test: (t) => /\b(?:are\s+you|is\s+funded\s*elite)\s+a\s+broker\b|\bbroker\b/i.test(t) && /funded|elite|you/i.test(t),
  },
  {
    id: 'faq.free-trial.en',
    conf: 0.9,
    test: (t) => /free\s*trial|trial\s*account/i.test(t),
  },
];

function preferLocale(answerId, lang) {
  if (!lang || lang === 'en') return answerId;
  const base = String(answerId).replace(/\.en$/, '');
  const mapped = {
    'ur-latn': base + '.ur-latn',
    ur: base + '.ur-latn',
    hi: base + '.ur-latn',
    es: base + '.es',
    ar: base + '.ar',
  }[lang];
  // approved.get only returns sendable (owner-approved) rows.
  if (mapped && approved.get(mapped)) return mapped;
  return answerId;
}

function sendableOrNull(answerId) {
  if (!answerId) return null;
  return approved.get(answerId) || null;
}

/**
 * Deterministic + optional modelClassify. Model may return {answerId,confidence} only.
 * Timeout / error / low confidence / unknown or non-sendable id → fail closed for that
 * path (never invent prose). Deterministic cues may still select a sendable id.
 * requireOwnerApproved defaults true: pending/provisional ids abstain.
 */
async function selectApprovedAnswer(text, opts) {
  opts = opts || {};
  const requireOwner = opts.requireOwnerApproved !== false;
  const raw = String(text || '').trim();
  if (!raw) return { abstain: true, reason: 'empty' };
  if (accountStatusAsk(raw)) return { abstain: true, reason: 'account-status-boundary' };
  if (opts.humanOwns && payoutConsistencyAsk(raw)) return { abstain: true, reason: 'backend-adjacent-payout' };

  const lang = opts.langHint || detectLangHint(raw);
  const prod = productHint(raw);
  const surface = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  let best = null;
  for (const s of SELECTORS) {
    if (!s.test(raw, surface, prod) && !s.test(surface, surface, prod)) continue;
    if (!sendableOrNull(s.id)) continue; // skip cues that only map to pending catalog rows
    if (!best || s.conf > best.conf) best = { answerId: s.id, confidence: s.conf, reason: 'deterministic-cue' };
  }

  // Contextual follow-up: "and the daily loss for that?" with product in history.
  if (!best && opts.priorClientTexts && /^(?:and|also)\b/i.test(raw) && /daily|loss|limit/i.test(raw)) {
    const hist = (opts.priorClientTexts || []).join('\n');
    const hp = productHint(hist) || productHint(raw);
    if (/daily|loss|limit/i.test(raw)) {
      let cid = null;
      if (hp === '2step-lite') cid = 'faq.2step-lite.daily-loss.en';
      else if (hp === '2step') cid = 'faq.2step.daily-loss.en';
      else cid = 'faq.daily-loss.generic.en';
      if (sendableOrNull(cid)) best = { answerId: cid, confidence: 0.84, reason: 'contextual-followup' };
      // else leave best null → abstain (generic pending must not ship)
    }
  }

  const gateInputs = [raw, opts.priorClientTexts];
  let languageDropped = false;
  if (typeof opts.modelClassify === 'function') {
    let modelOutcome = null;
    if (languageGate(...gateInputs).lang === 'uncertain') {
      languageDropped = true;
      modelOutcome = { abstain: true, reason: 'language-uncertain' };
    } else
    try {
      const ms = Math.max(50, Number(opts.classifyTimeoutMs) || 1200);
      const classified = await Promise.race([
        Promise.resolve(opts.modelClassify(raw, { lang, prod, sendableIds: approved.list().map((a) => a.id) })),
        new Promise((_, rej) => setTimeout(() => rej(new Error('select-timeout')), ms)),
      ]);
      if (!classified || !classified.answerId) {
        modelOutcome = { abstain: true, reason: 'classifier-empty' };
      } else if (!sendableOrNull(classified.answerId)) {
        // Unknown id OR pending/non-sendable — fail closed for model path.
        modelOutcome = { abstain: true, reason: 'classifier-unknown-or-nonsendable', answerId: classified.answerId };
      } else {
        const conf = Number(classified.confidence);
        if (!Number.isFinite(conf) || conf < CONFIDENCE_THRESHOLD) {
          modelOutcome = { abstain: true, reason: 'classifier-low-confidence', answerId: classified.answerId, confidence: conf };
        } else {
          modelOutcome = {
            abstain: false,
            answerId: classified.answerId,
            confidence: conf,
            reason: 'model-classify',
          };
        }
      }
    } catch (e) {
      modelOutcome = {
        abstain: true,
        reason: String(e && e.message) === 'select-timeout' ? 'classifier-timeout' : 'classifier-error',
      };
    }
    if (modelOutcome && !modelOutcome.abstain && languageGate(...gateInputs).lang === 'uncertain') {
      languageDropped = true;
      modelOutcome = { abstain: true, reason: 'language-uncertain' };
    }
    if (modelOutcome && !modelOutcome.abstain) {
      if (!best || modelOutcome.confidence >= best.confidence) {
        best = modelOutcome;
      }
    }
    // Model fail-closed never invents prose; deterministic sendable cue may remain.
    if (opts.modelRequired && modelOutcome && modelOutcome.abstain && !best) {
      return { abstain: true, reason: modelOutcome.reason, lang };
    }
  }

  if (best && best.reason === 'model-classify' && languageGate(...gateInputs).lang === 'uncertain') {
    return { abstain: true, reason: 'language-uncertain', lang };
  }
  if (!best) return { abstain: true, reason: languageDropped ? 'language-uncertain' : 'no-confident-match', lang };
  if (best.confidence < CONFIDENCE_THRESHOLD) {
    return { abstain: true, reason: 'below-threshold', lang, confidence: best.confidence, answerId: best.answerId };
  }

  const answerId = preferLocale(best.answerId, lang);
  const row = sendableOrNull(answerId);
  if (!row) {
    // Pending / provisional / unknown → abstain (handoff / silence).
    const any = approved.getAny(answerId);
    if (any && !approved.isSendableRow(any)) {
      return { abstain: true, reason: 'needs-owner-approval', answerId };
    }
    return { abstain: true, reason: 'unknown-answer-id', answerId };
  }
  if (requireOwner && !approved.isSendableRow(row)) {
    return { abstain: true, reason: 'needs-owner-approval', answerId };
  }
  return {
    abstain: false,
    answerId,
    confidence: best.confidence,
    reason: best.reason,
    lang,
    contentHash: row.contentHash,
    intentTags: row.intentTags.slice(),
  };
}

module.exports = {
  CONFIDENCE_THRESHOLD,
  detectLangHint,
  languageGate,
  productHint,
  accountStatusAsk,
  payoutConsistencyAsk,
  selectApprovedAnswer,
  preferLocale,
};
