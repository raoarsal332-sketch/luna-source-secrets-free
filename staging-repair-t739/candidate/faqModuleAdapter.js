'use strict';
/**
 * Interface adapter between the shared language gate (faqAnswerSelect.languageGate) and the
 * Packs / Atom selectors. It changes no selector logic. It only
 *   - converts any gate-like value into ONE canonical shape and fails closed when the value is
 *     absent or malformed, and
 *   - builds the per-module option objects exactly as each module's interface document requires.
 *
 * Canonical gate: { lang:'en'|'non-en'|'uncertain', language:'en'|'non-en'|'unknown',
 *                   confident:boolean, allowsAnswer:boolean, basis:string }
 * It satisfies Packs ({language:'en',confident:true,allowsAnswer:true}) and the Atom reader
 * (lang/language 'en' and no negative flag) at the same time.
 */

const FAIL_CLOSED = Object.freeze({
  lang: 'uncertain',
  language: 'unknown',
  confident: false,
  allowsAnswer: false,
  basis: 'gate-absent-or-malformed',
});

const NEGATIVE_FLAGS = ['mixed', 'multilingual', 'uncertain', 'blocked', 'abstain'];

function failClosed(basis) {
  return Object.freeze({ ...FAIL_CLOSED, basis: basis || FAIL_CLOSED.basis });
}

function isEnglishTag(v) {
  return typeof v === 'string' && /^en(?:[-_][a-z]{2,4})?$/i.test(v.trim());
}

/**
 * Accepts a canonical gate, a Packs-shaped gate or an Atom-shaped object gate. A bare string is
 * rejected (it carries no confidence information). Anything inconsistent fails closed.
 */
function normalizeGate(g) {
  try {
    if (g === undefined || g === null) return failClosed('gate-absent');
    if (typeof g !== 'object' || Array.isArray(g)) return failClosed('gate-malformed');
    const tags = [g.lang, g.language, g.code, g.detected].filter((v) => v !== undefined && v !== null);
    if (!tags.length || tags.some((v) => typeof v !== 'string' || !v)) return failClosed('gate-malformed');
    const english = tags.map(isEnglishTag);
    const allEnglish = english.every(Boolean);
    const anyEnglish = english.some(Boolean);
    if (anyEnglish && !allEnglish) return failClosed('gate-inconsistent-language');
    for (const f of ['confident', 'allowsAnswer', 'ok', 'allowed', 'pass', 'supported', 'reliable']) {
      if (g[f] !== undefined && typeof g[f] !== 'boolean') return failClosed('gate-malformed');
    }
    if (typeof g.status === 'string' && /^(?:unknown|unsupported|blocked|mixed|abstain|fail)/i.test(g.status)) {
      return failClosed('gate-status-negative');
    }
    const negative =
      NEGATIVE_FLAGS.some((f) => g[f] === true) ||
      ['confident', 'allowsAnswer', 'ok', 'allowed', 'pass', 'supported', 'reliable'].some((f) => g[f] === false);
    if (allEnglish) {
      if (negative) return failClosed('gate-english-not-confident');
      if (g.allowsAnswer !== true || g.confident !== true) return failClosed('gate-english-missing-confidence');
      return Object.freeze({ lang: 'en', language: 'en', confident: true, allowsAnswer: true, basis: String(g.basis || 'external') });
    }
    if (g.lang === 'uncertain' || String(g.language).toLowerCase() === 'unknown') return failClosed(String(g.basis || 'uncertain'));
    return Object.freeze({ lang: 'non-en', language: 'non-en', confident: true, allowsAnswer: false, basis: String(g.basis || 'external') });
  } catch (_) {
    return failClosed('gate-normalize-error');
  }
}

/** Options for selectPacksAnswer. Module-default flags are not read here: the caller decides. */
function packsOptions(gate, ctx) {
  const g = normalizeGate(gate);
  return {
    packsEnabled: !!(ctx && ctx.enabled === true),
    languageGate: { language: g.language, confident: g.confident, allowsAnswer: g.allowsAnswer },
    priorClientTexts: Array.isArray(ctx && ctx.priorClientTexts) ? ctx.priorClientTexts : [],
  };
}

/** Options for selectAtomAnswer. */
function atomOptions(gate, ctx) {
  const g = normalizeGate(gate);
  return {
    enabled: !!(ctx && ctx.enabled === true),
    languageGate: { lang: g.lang, language: g.language, confident: g.confident, allowsAnswer: g.allowsAnswer },
    priorClientTexts: Array.isArray(ctx && ctx.priorClientTexts) ? ctx.priorClientTexts : [],
  };
}

module.exports = { FAIL_CLOSED, normalizeGate, packsOptions, atomOptions };
