'use strict';

/**
 * spreadAskGate.js
 *
 * Strict, intent-first detector for "spread test" requests.
 *
 * The legacy isSpreadCheckAsk() in the engine was keyword-combination based and
 * treated "trading platform + login/password/credentials" as spread intent.
 * That produced SPREAD_TEST_REPLY for a personal-account login/history issue
 * (ticket 215475947533931).
 *
 * This module only says TRUE when the text actually mentions spreads in a
 * pricing/trading sense. No spread term => never TRUE, regardless of how many
 * login/password/credentials/platform words are present.
 *
 * Dependency-free. Deterministic. Safe to require from the engine.
 */

const SPREAD_GATE_VERSION = 'spread-image-fixes-v1';

// The one necessary signal: the word "spread" or "spreads" as a whole word.
// \b prevents matching "spreadsheet".
const SPREAD_TERM_RE = /\bspreads?\b/i;

// "spread" used as a verb of distribution, not as a pricing term.
// e.g. "my positions are spread across two accounts", "spread the word".
const NON_PRICING_SPREAD_RE =
  /\bspread(?:s|ing)?\s+(?:across|over|between|among|through|throughout|out|the\s+word|the\s+news|the\s+risk)\b/i;

// Explicit statement that the message is NOT about spreads.
const NEGATED_SPREAD_RE =
  /\b(?:not|isn'?t|is\s+not|nothing)\s+(?:about|regarding|to\s+do\s+with)\s+(?:the\s+|your\s+)?spreads?\b/i;

// Phrases that make the intent unambiguous. Not required for TRUE (a bare
// "spreads?" is still a spread question) but reported by explain().
const STRONG_SPREAD_PHRASES = [
  /\bgive\s+me\s+(?:a\s+|the\s+)?spread\s+check(?:\s+account)?\b/i,
  /\bspread\s+check\s+account\b/i,
  /\bspread\s+test\b/i,
  /\btest\s+(?:the\s+|your\s+)?spreads?\b/i,
  /\bcheck\s+(?:the\s+|your\s+)?spreads?\b/i,
  /\bspread\s+(?:test\s+)?account\b/i,
  /\bdemo\s+(?:spread|account)\b[^.?!]*\bspreads?\b/i,
  /\bspreads?\b[^.?!]*\bdemo\b/i,
  /\bspread\s+(?:test\s+)?(?:credentials|login|details)\b/i,
  /\bwhat\s+(?:are|is)\s+(?:the\s+|your\s+)?spreads?\b/i,
  /\b(?:see|view|show|look\s+at)\s+(?:the\s+|your\s+)?spreads?\b/i,
];

function normalize(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function hasSpreadTerm(text) {
  return SPREAD_TERM_RE.test(normalize(text));
}

/**
 * Returns a structured explanation, useful for logs and tests.
 * Never throws.
 */
function explain(text) {
  const t = normalize(text);
  const hasTerm = SPREAD_TERM_RE.test(t);
  if (!hasTerm) {
    return { result: false, reason: 'no-spread-term', hasTerm: false };
  }
  if (NEGATED_SPREAD_RE.test(t)) {
    return { result: false, reason: 'negated-spread', hasTerm: true };
  }
  // If every "spread" occurrence is the distribution verb, it is not pricing intent.
  const total = (t.match(new RegExp(SPREAD_TERM_RE.source, 'gi')) || []).length;
  const nonPricing = (t.match(new RegExp(NON_PRICING_SPREAD_RE.source, 'gi')) || []).length;
  if (total > 0 && nonPricing >= total) {
    return { result: false, reason: 'spread-as-distribution-verb', hasTerm: true };
  }
  const strong = STRONG_SPREAD_PHRASES.some((re) => re.test(t));
  /* AUDIT_HARDEN_V1:spreadResidual */
  // Personal login/password/trade-history without strong spread-pricing phrase → not spread check
  const personalLogin = /\b(login|password|credentials?|trade\s+history|open\s+positions?|logged\s+in|cannot\s+log|can'?t\s+log|regenerated\s+(?:my\s+)?password)\b/i.test(t);
  if (personalLogin && !strong && !/\b(what\s+(?:are|is)\s+(?:the\s+|your\s+)?spreads?|check\s+(?:the\s+|your\s+)?spreads?|test\s+(?:the\s+|your\s+)?spreads?|spread\s+test)\b/i.test(t)) {
    return { result: false, reason: 'personal-login-not-spread', hasTerm: true, strong: false };
  }
  return {
    result: true,
    reason: strong ? 'strong-spread-phrase' : 'spread-term',
    hasTerm: true,
    strong,
  };
}

/**
 * Strict detector. TRUE only with explicit spread intent.
 * @param {string} text
 * @returns {boolean}
 */
function isSpreadCheckAsk(text) {
  return explain(text).result === true;
}

/**
 * Picks the message text out of an arbitrary legacy argument list, so the
 * wrapper installed in index.js does not need to know the legacy signature.
 * Accepts: (text), (text, history, ...), ({ text | body | message | content }).
 */
function extractText(args) {
  if (!args || !args.length) return null;
  for (const a of args) {
    if (typeof a === 'string') return a;
  }
  for (const a of args) {
    if (a && typeof a === 'object') {
      for (const k of ['text', 'body', 'message', 'content', 'plain']) {
        if (typeof a[k] === 'string') return a[k];
      }
    }
  }
  return null;
}

let warnedNoText = false;

/**
 * Wrapper used by the patched engine.
 *
 * Mode (env LUNA_SPREAD_GATE_MODE):
 *   strict-and-legacy (default): strict gate must pass AND legacy detector must
 *     agree. This can only remove false positives; anything the legacy detector
 *     already caught as a true spread request still routes to the spread flow.
 *   strict-only: strict gate decides alone; legacy detector is ignored.
 *
 * If no text can be found in the arguments, the legacy result is returned
 * unchanged (behavior-preserving) and a single warning is logged.
 */
function gateLegacy(args, legacyFn) {
  const mode = String(process.env.LUNA_SPREAD_GATE_MODE || 'strict-and-legacy').toLowerCase();
  const text = extractText(args);
  if (text === null) {
    if (!warnedNoText) {
      warnedNoText = true;
      try {
        console.warn('[spreadAskGate] could not find message text in isSpreadCheckAsk arguments; using legacy result');
      } catch (_) { /* ignore */ }
    }
    return typeof legacyFn === 'function' ? !!legacyFn.apply(null, args) : false;
  }
  const strict = isSpreadCheckAsk(text);
  if (!strict) return false;
  if (mode === 'strict-only' || typeof legacyFn !== 'function') return true;
  return !!legacyFn.apply(null, args);
}

module.exports = {
  SPREAD_GATE_VERSION,
  isSpreadCheckAsk,
  hasSpreadTerm,
  explain,
  extractText,
  gateLegacy,
};
