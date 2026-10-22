/**
 * Luna soft-edges v1 — additive helpers for residual soft edges.
 * Engine target: fresh-2026-09-15-soft-edges-v1
 *
 * Wire from index.js / september-promos.js (see APPLY.md). Do not replace
 * prior locks; only call these from existing pipelines.
 */

'use strict';

const ENGINE_ID = 'fresh-2026-09-15-soft-edges-v1';

// ---------------------------------------------------------------------------
// Soft edge 1 — mixed promo + plan-difference
// ---------------------------------------------------------------------------

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getMessageContent(msg) {
  if (!msg) return '';
  if (typeof msg === 'string') return msg;
  return msg.content || msg.body || msg.text || msg.message || '';
}

function flattenHistory(conversationHistory) {
  if (!Array.isArray(conversationHistory)) return [];
  return conversationHistory
    .map((m) => String(getMessageContent(m) || '').trim())
    .filter(Boolean);
}

/** Lite vs Standard (or Free Retry vs Lite) feature/rule difference asks. */
function isPlanDifferenceOrFeaturesAsk(text) {
  const q = normalizeText(text);
  if (!q) return false;
  const mentionsPlans =
    /\b(lite|standard|free\s*retry|free-retry)\b/.test(q) &&
    /\b(lite|standard|free\s*retry|free-retry|1[\s-]*step|2[\s-]*step)\b/.test(q);
  const diffCue =
    /\b(difference|different|differ|vs\.?|versus|compare|comparison|which\s+is\s+better|features?|rules?|profit\s*target|drawdown|daily\s*loss|max(?:imum)?\s*loss|trading\s*days?|leverage)\b/.test(
      q
    ) || /\blite\b.+\bstandard\b|\bstandard\b.+\blite\b/.test(q);
  // "difference between lite and standard"
  if (/\bdifference\b/.test(q) && /\blite\b/.test(q) && /\bstandard\b/.test(q)) {
    return true;
  }
  if (mentionsPlans && diffCue) return true;
  if (/\b(lite|standard)\b/.test(q) && /\b(features?|rules?)\b/.test(q)) return true;
  return false;
}

function historyLooksLikePlanDifference(history) {
  return flattenHistory(history)
    .slice(-6)
    .some((t) => isPlanDifferenceOrFeaturesAsk(t));
}


/* AUDIT_HARDEN_V1:resetDiscount */
/**
 * Reset-fee / soft-breach reset / "discount on reset" — NEVER SEP35 suite.
 * Explicit promo codes (SEP35/FLASH5/NEW50/coupon code) still allowed by caller.
 */
function isResetFeeOrAccountDiscountAsk(text) {
  const q = normalizeText(text);
  if (!q) return false;
  if (/\b(sep35|flash5|new50|promo\s*code|coupon\s*code)\b/.test(q)) return false;
  if (/\bdiscount\s+on\s+(the\s+)?reset\b/.test(q)) return true;
  if (/\b(reset\s+fee|fee\s+for\s+(a\s+)?reset|reset\s+discount)\b/.test(q)) return true;
  if (/\b(soft[\s-]?breach)\b/.test(q) && /\b(reset|discount|fee|price|cost)\b/.test(q)) return true;
  if (/\b(reset)\b/.test(q) && /\b(discount|%\s*off|percent|cheaper|how\s+much|cost|price|fee)\b/.test(q)) return true;
  return false;
}

function historyLooksLikeResetFeeContext(history) {
  return flattenHistory(history)
    .slice(-8)
    .some((t) => {
      const q = normalizeText(t);
      return (
        /\b(reset|soft[\s-]?breach|breach(?:ed)?|failed\s+(?:the\s+)?challenge)\b/.test(q) &&
        /\b(fee|discount|cost|price|pay|reset|breach)\b/.test(q)
      );
    });
}

function isBareDiscountAsk(text) {
  const q = normalizeText(text);
  if (!q) return false;
  if (/\b(sep35|flash5|new50|coupon|promo\s*code|%\s*off|percent)\b/.test(q)) return false;
  if (/\b(1[\s-]*step|2[\s-]*step|lite|instant|flash|catalyst|challenge|bulk)\b/.test(q)) return false;
  return (
    /\b(can\s+i\s+have\s+(a\s+)?discount|any\s+discount|discount\s*\??|do\s+you\s+have\s+(a\s+)?discount|give\s+me\s+(a\s+)?discount)\b/.test(
      q
    ) || /^discount\??$/.test(q)
  );
}

function isPromoSignal(text) {
  const q = normalizeText(text);
  return (
    /\b(promo(tion)?s?|offers?|discount(s)?|coupon(s)?|promo\s*code|sale|sep35|flash5|new50|september\s+offer|bulk\s+discount|%|\bpercent\b|price|pricing|how\s+much|cost)\b/.test(
      q
    ) || /\b(sep35|flash5|new50)\b/.test(q)
  );
}

/**
 * Classify promo vs plan-diff for one message (+ optional history).
 * Returns how the short-circuit path should behave.
 */
function classifyPromoPlanMix(userMessage, conversationHistory = []) {
  const latest = String(userMessage || '');
  const planDiffNow = isPlanDifferenceOrFeaturesAsk(latest);
  const promoNow = isPromoSignal(latest);
  const planDiffHist = historyLooksLikePlanDifference(conversationHistory);
  const promoHist = flattenHistory(conversationHistory)
    .slice(-6)
    .some((t) => isPromoSignal(t));

  // Short follow-up after plan-diff ("2 step" / "1 step") stays features.
  const shortStepFollowUp =
    /^(1|2|one|two)[\s-]*step\b/i.test(latest.trim()) &&
    latest.trim().split(/\s+/).length <= 4;
  if (shortStepFollowUp && planDiffHist && !promoNow) {
    return {
      planDiff: true,
      promoSignal: false,
      mixed: false,
      shortCircuit: null,
      reason: 'short_step_followup_after_plan_diff',
      systemHint: null,
    };
  }
  // Short follow-up after promo stays promo.
  if (shortStepFollowUp && promoHist && !planDiffNow) {
    return {
      planDiff: false,
      promoSignal: true,
      mixed: false,
      shortCircuit: 'promo',
      reason: 'short_step_followup_after_promo',
      systemHint: null,
    };
  }

  if (planDiffNow && promoNow) {
    return {
      planDiff: true,
      promoSignal: true,
      mixed: true,
      shortCircuit: null, // do NOT let promo alone own the reply
      reason: 'mixed_plan_diff_and_promo',
      systemHint:
        'MIXED ASK: client wants BOTH plan/feature differences AND pricing/discount. ' +
        'Answer features from FAQ/rules only (never invent Lite vs Standard diffs from promo SOT). ' +
        'Answer discount/coupon only for the pricing part (SEP35/FLASH5/NEW50). ' +
        'Never paste canned bulk 1=35%/2=40% script.',
    };
  }

  if (planDiffNow && !promoNow) {
    return {
      planDiff: true,
      promoSignal: false,
      mixed: false,
      shortCircuit: null,
      reason: 'plan_diff_only',
      systemHint: null,
    };
  }

  if (promoNow && !planDiffNow) {
    return {
      planDiff: false,
      promoSignal: true,
      mixed: false,
      shortCircuit: 'promo',
      reason: 'promo_only',
      systemHint: null,
    };
  }

  if (planDiffHist && !promoNow && shortStepFollowUp) {
    return {
      planDiff: true,
      promoSignal: false,
      mixed: false,
      shortCircuit: null,
      reason: 'history_plan_diff',
      systemHint: null,
    };
  }

  return {
    planDiff: false,
    promoSignal: promoNow || promoHist,
    mixed: false,
    shortCircuit: promoNow ? 'promo' : null,
    reason: 'default',
    systemHint: null,
  };
}

/**
 * Guard for resolvePromoReply / handleCustomerMessage:
 * If plan-diff (alone or mixed), return null short-circuit so FAQ/AI path runs.
 * Optionally attach systemHint on the result object for the model path.
 */
function shouldBypassPromoShortCircuit(userMessage, conversationHistory = []) {
  const c = classifyPromoPlanMix(userMessage, conversationHistory);
  if (c.planDiff || c.mixed) {
    return { bypass: true, classification: c };
  }
  /* AUDIT_HARDEN_V1:resetDiscountGate */
  if (isResetFeeOrAccountDiscountAsk(userMessage)) {
    return {
      bypass: true,
      classification: Object.assign({}, c, {
        shortCircuit: null,
        reason: "reset_fee_discount",
        systemHint:
          "RESET/ACCOUNT FEE ASK: client wants reset-fee or soft-breach reset discount/policy — " +
          "answer reset policy or forward team. NEVER paste SEP35/FLASH5/NEW50 suite.",
      }),
    };
  }
  if (
    isBareDiscountAsk(userMessage) &&
    historyLooksLikeResetFeeContext(conversationHistory)
  ) {
    return {
      bypass: true,
      classification: Object.assign({}, c, {
        shortCircuit: null,
        reason: "bare_discount_after_reset_context",
        systemHint:
          "Bare discount ask after reset/breach context — answer reset policy / forward team. NEVER SEP35 suite.",
      }),
    };
  }
  return { bypass: false, classification: c };
}

const BULK_CANNED_RE = /\b1\s*=\s*35\s*%\s*\/?\s*2\s*=\s*40\s*%/i;

function stripCannedBulkScript(text) {
  return String(text || '')
    .replace(BULK_CANNED_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Soft edge 2 — Fin / Elite wait: live-agent + Fin handoff phrase expand
// ---------------------------------------------------------------------------

const FIN_RECENT_OWNING_SEC = 180;
const FIN_FRESH_CONV_SEC = 120;

function clientRequestedLiveAgent(text) {
  let guard = null;
  try {
    guard = require('./assistantIdentityGuard');
  } catch (_) {
    guard = null;
  }
  if (guard && typeof guard.isDirectIdentityQuestion === 'function' && guard.isDirectIdentityQuestion(text)) {
    return false;
  }
  const t = normalizeText(text);
  if (!t) return false;

  // English (existing + short UI + manager/supervisor handoff)
  if (
    /\b(live\s*agent|human\s*agent|real\s*(person|human|agent)|speak\s+(to|with)\s+(a\s+|an\s+|my\s+)?(human|person|agent|manager|supervisor)|talk\s+to\s+(a\s+|an\s+|my\s+)?(human|person|agent|manager|supervisor)|agent\s+please|human\s+please|need\s+(a\s+)?(live\s*)?agent|want\s+(a\s+)?(live\s*)?agent|connect(?:\s+me)?\s+(to|with)\s+(a\s+|an\s+|my\s+)?(human|agent|person|manager|supervisor)|manager\s+please|supervisor\s+please)\b/.test(
      t
    )
  ) {
    return true;
  }
  // Bare manager/supervisor ask (keep phrase-ish to limit FP on "risk management")
  if (/\b(connect(?:\s+me)?\s+(?:to|with)|speak\s+(?:to|with)|talk\s+to|want\s+(?:to\s+)?(?:speak|talk)\s+to)\b[\s\S]{0,40}\b(manager|supervisor)\b/.test(t)) {
    return true;
  }
  // Bare short UI-ish (keep tight — whole message mostly the phrase)
  if (/^(live\s*agent|human|real\s*person|agent\s*please|human\s*please)[.!?]?$/i.test(t)) {
    return true;
  }
  if (/\bno[,.]?\s+i\s+need\s+a\s+live\s+agent\b/.test(t)) return true;

  // Ask for Arsal / named handoff (Bot-test + common client phrasing)
  if (/\b(talk\s+(to|with)\s+arsal|speak\s+(to|with)\s+arsal|want\s+to\s+talk\s+(to|with)\s+arsal|chat\s+with\s+arsal|arsal\s+are\s+you\s+there)\b/.test(t)) {
    return true;
  }
  if (/^arsal\s*[?!.]*$/i.test(String(text || '').trim())) return true;


  // Italian
  if (
    /\b(agente\s+live|parlare\s+con\s+(un\s+)?operatore|operatore\s+umano|assistenza\s+umana|operatore\s+live|voglio\s+(un\s+)?(operatore|agente)|parlare\s+con\s+(una\s+)?persona)\b/.test(
      t
    )
  ) {
    return true;
  }

  // Hinglish (light)
  if (
    /\b(live\s*agent\s*chahiye|human\s*se\s*baat|agent\s*se\s*baat|real\s*person\s*chahiye|insaan\s*se\s*baat)\b/.test(
      t
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Fin handoff paraphrases — keep false-positive low (do not treat normal FAQ as handoff).
 */
function finHandoffPhrase(text) {
  const t = normalizeText(text);
  if (!t) return false;
  if (
    /\b(i('m| am)\s+(going\s+to\s+)?(connect|transfer|hand\s*you\s*off|escalate)|connecting\s+you\s+(to|with)|transferr?ing\s+you|handing\s+(you\s+)?off|a\s+(teammate|human|specialist|agent)\s+will\s+(take|continue|help)|let\s+me\s+(get|bring)\s+(a|an)\s+(human|teammate|agent)|i('ll| will)\s+(bring|get)\s+a\s+(human|teammate)|passing\s+(this|you)\s+to\s+(a\s+)?(teammate|human|agent))\b/.test(
      t
    )
  ) {
    return true;
  }
  // Italian Fin-ish
  if (
    /\b(ti\s+metto\s+in\s+contatto|ti\s+trasferisco|passo\s+(la\s+chat|la\s+conversazione)|un\s+operatore\s+(ti\s+)?(risponder|aiuter)|collegamento\s+con\s+(un\s+)?operatore)\b/.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

function eliteAiStillOwning(parts, opts = {}) {
  const recentSec = opts.recentSec != null ? opts.recentSec : FIN_RECENT_OWNING_SEC;
  const nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  const eliteNames = opts.eliteNames || [/elite/i, /luna/i, /gpt-5\.6-luna/i];
  const list = Array.isArray(parts) ? parts : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i] || {};
    const author = p.author || {};
    const name = String(author.name || p.author_name || '');
    const body = String(p.body || p.text || '');
    const created =
      (p.created_at != null ? Number(p.created_at) * (String(p.created_at).length < 12 ? 1000 : 1) : null) ||
      (p.createdAt != null ? Number(p.createdAt) : null);
    const isElite =
      eliteNames.some((re) => re.test(name)) ||
      /elite|luna/i.test(String(author.type || '')) ||
      p.elite === true;
    if (!isElite) continue;
    if (created && nowMs - created > recentSec * 1000) continue;
    if (finHandoffPhrase(body)) return false;
    return true;
  }
  return false;
}

/**
 * Reference Fin-wait gate for tests + optional index wiring.
 * Hard rules preserved: wait on user.created; Elite owns + no handoff → wait;
 * Arsal assignment alone ≠ handoff; live-agent request → do not wait.
 *
 * @param {object} ctx
 * @param {string} [ctx.topic] conversation topic e.g. conversation.user.created
 * @param {string} [ctx.latestUserText]
 * @param {Array}  [ctx.parts] conversation parts
 * @param {boolean} [ctx.arsalAssigned]
 * @param {number} [ctx.conversationAgeSec]
 * @param {boolean} [ctx.finParticipatedRecently]
 */
function shouldWaitForFin(ctx = {}) {
  const topic = String(ctx.topic || ctx.eventTopic || '');
  if (/conversation\.user\.created|user\.created/i.test(topic)) {
    return { wait: true, reason: 'user_created' };
  }
  const latest = String(ctx.latestUserText || ctx.userText || '');
  if (clientRequestedLiveAgent(latest)) {
    return { wait: false, reason: 'client_requested_live_agent' };
  }
  const parts = ctx.parts || ctx.conversationParts || [];
  const histText = parts.map((p) => String(p.body || p.text || '')).join('\n');
  if (finHandoffPhrase(histText) || parts.some((p) => finHandoffPhrase(p.body || p.text || ''))) {
    return { wait: false, reason: 'fin_handoff_phrase' };
  }
  if (eliteAiStillOwning(parts, ctx)) {
    // Arsal assignment alone does not clear wait
    return { wait: true, reason: 'elite_owns_no_handoff' };
  }
  if (ctx.finParticipatedRecently && !clientRequestedLiveAgent(latest)) {
    const age = ctx.conversationAgeSec;
    if (age == null || age <= FIN_FRESH_CONV_SEC) {
      return { wait: true, reason: 'fin_recent_fresh_conv' };
    }
  }
  if (ctx.arsalAssigned && eliteAiStillOwning(parts, ctx)) {
    return { wait: true, reason: 'arsal_assigned_but_elite_owns' };
  }
  return { wait: false, reason: 'no_wait' };
}

// ---------------------------------------------------------------------------
// Soft edge 4 — Unicode / junk tail strip
// ---------------------------------------------------------------------------

const CYR = /[\u0400-\u04FF]/;
const CJK = /[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf]/;
const ARABIC = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]/;

function scriptCounts(s) {
  let cyr = 0;
  let cjk = 0;
  let arab = 0;
  let lat = 0;
  for (const ch of s) {
    if (CYR.test(ch)) cyr++;
    else if (CJK.test(ch)) cjk++;
    else if (ARABIC.test(ch)) arab++;
    else if (LATIN.test(ch)) lat++;
  }
  return { cyr, cjk, arab, lat, total: s.length };
}

function isJunkMixedToken(token) {
  const t = String(token || '').trim();
  if (!t || t.length > 40) return false;
  // Preserve known review / affiliate URLs and HTML
  if (/trustpilot|propfirmmatch|https?:\/\//i.test(t)) return false;
  if (/<\/?[a-z][\s\S]*>/i.test(t)) return false;
  // Cyrillic + CJK, or CJK mixed with random latin alnum like pk赛车
  if (CYR.test(t) && CJK.test(t)) return true;
  if (CJK.test(t) && /[a-z]{2,}\d*/i.test(t) && t.length <= 40) return true;
  if (CYR.test(t) && /[a-z]{2,}\d*/i.test(t) && CJK.test(t)) return true;
  if (/[а-яА-ЯёЁ]{2,}.*[\u4e00-\u9fff]|[\u4e00-\u9fff].*[a-z]{2,}\d*/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Strip trailing / orphan script junk after a primarily EN/IT/JA reply.
 * Prefer strip-trailing over deleting the whole message.
 * @returns {{ text: string, stripped: boolean, skipSend: boolean, reason: string|null }}
 */
function stripOrphanScriptJunk(reply) {
  let text = String(reply || '');
  if (!text.trim()) {
    return { text: '', stripped: false, skipSend: true, reason: 'empty_reply' };
  }

  // Never touch Trustpilot / PropFirmMatch URL lines or <b> headings content wholesale —
  // only strip junk segments.
  const protectedKeep = [];
  text = text.replace(/(https?:\/\/[^\s<]+(?:trustpilot|propfirmmatch)[^\s<]*)/gi, (m) => {
    protectedKeep.push(m);
    return `__PROT${protectedKeep.length - 1}__`;
  });

  const counts = scriptCounts(text);
  const primaryIsLatin = counts.lat >= counts.cjk && counts.lat >= counts.cyr && counts.lat >= counts.arab;
  const primaryIsJapanese = counts.cjk > counts.lat * 2 && counts.cjk >= 8;
  const primaryIsItalianOrEn = primaryIsLatin;

  let stripped = false;
  let reason = null;

  // Trailing junk after punctuation/newline, short segment
  const trailRe =
    /([.!?。！？]|[\n\r])\s*([^\n\r]{1,40})$/;
  const m = text.match(trailRe);
  if (m) {
    const tail = m[2].trim();
    if (isJunkMixedToken(tail) || (CYR.test(tail) && CJK.test(tail))) {
      if (primaryIsLatin || primaryIsJapanese || primaryIsItalianOrEn) {
        // If primary is JA, only strip when tail mixes Cyrillic + nonsense (not more JA)
        if (primaryIsJapanese && !CYR.test(tail) && !/[a-z]{2,}\d*/i.test(tail)) {
          // keep pure JA tail
        } else {
          text = text.slice(0, m.index + m[1].length).trimEnd();
          stripped = true;
          reason = 'stripped_trailing_mixed_script_junk';
        }
      }
    }
  }

  // Also strip isolated mid/end tokens matching the junk pattern when clearly appended
  text = text.replace(
    /(?:\n|\s{2,})([а-яА-ЯёЁ]{2,}[^\n]{0,20}[\u4e00-\u9fff][^\n]{0,15}|[\u4e00-\u9fff]{1,8}[a-z]{2,}\d*)\s*$/i,
    (full, junk) => {
      if (junk && junk.length <= 40) {
        stripped = true;
        reason = reason || 'stripped_orphan_junk_token';
        return '';
      }
      return full;
    }
  );

  // Restore protected URLs
  text = text.replace(/__PROT(\d+)__/g, (_, i) => protectedKeep[Number(i)] || '');

  text = text.replace(/[ \t]+\n/g, '\n').trim();

  if (!text.trim()) {
    return {
      text: '',
      stripped: true,
      skipSend: true,
      reason: 'nothing_useful_after_junk_strip',
    };
  }

  return { text, stripped, skipSend: false, reason };
}

/**
 * Convenience for postProcessModelReply: returns cleaned string, or null if skip send.
 */
function postProcessStripJunk(reply) {
  const r = stripOrphanScriptJunk(reply);
  if (r.skipSend) return null;
  return r.text;
}

module.exports = {
  ENGINE_ID,
  // promo / plan
  isPlanDifferenceOrFeaturesAsk,
  historyLooksLikePlanDifference,
  isPromoSignal,
  isResetFeeOrAccountDiscountAsk,
  historyLooksLikeResetFeeContext,
  isBareDiscountAsk,
  classifyPromoPlanMix,
  shouldBypassPromoShortCircuit,
  stripCannedBulkScript,
  BULK_CANNED_RE,
  // fin wait
  FIN_RECENT_OWNING_SEC,
  FIN_FRESH_CONV_SEC,
  clientRequestedLiveAgent,
  finHandoffPhrase,
  eliteAiStillOwning,
  shouldWaitForFin,
  // junk
  stripOrphanScriptJunk,
  postProcessStripJunk,
  isJunkMixedToken,
};
