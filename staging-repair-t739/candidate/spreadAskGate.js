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

const SPREAD_GATE_VERSION = 'spread-image-fixes-v1+t739-r2-routing';

// The one necessary signal: the word "spread" or "spreads" as a whole word.
// \b prevents matching "spreadsheet". Soft typos: spreds / spreadt (staging 2026-10-17).
const SPREAD_TERM_RE = /\b(?:spreads?|spreds|spreadt)\b/i;

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
  // STAGING 2026-10-17: "MT5 demo login for spreads" / login-to-check-spreads
  /\b(?:mt5|metatrader|demo)\b[^.?!]{0,40}\b(?:login|password|credentials?)\b[^.?!]{0,40}\bspreads?\b/i,
  /\b(?:login|credentials?)\b[^.?!]{0,40}\b(?:for|to\s+(?:check|see|view|inspect))\s+(?:the\s+|your\s+)?spreads?\b/i,
];

function normalize(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// T739 r1 (MT5-4): intent-first routing. The spread-test reply (the contained, credential-free
// SAFE_SPREAD_REPLY) must answer only a generic spread / test-access ask. It must not be the answer
// to a customer's own account problem, a payout/KYC question, a spread complaint, or a general
// pricing question that merely contains the word "spread". Cue matching runs on a folded copy
// (leet, separators, zero-width) so an obfuscated "p a s s w o r d" is treated like "password".
function foldForCues(text) {
  let x = String(text === null || text === undefined ? '' : text);
  try { x = x.normalize('NFKD'); } catch (_) { /* keep as is */ }
  x = x.replace(/[\u0300-\u036f\u200b-\u200f\u2060\ufeff]/g, '').toLowerCase();
  x = x.replace(/[a-z0-9@$!|]+/g, (tok) => (/[a-z]/.test(tok)
    ? tok.replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/@/g, 'a').replace(/\$/g, 's')
    : tok));
  x = x.replace(/\b(?:[a-z][\s.\-_*]+){2,}[a-z]\b/g, (m) => m.replace(/[\s.\-_*]+/g, ''));
  return x.replace(/\s+/g, ' ').trim();
}

const CRED_CUE_RE = /\b(?:log[\s._-]?in|log[\s._-]?on|sign[\s._-]?in|pass[\s._-]?(?:word|code|wd|phrase)|passwd|pwd|credentials?|creds?)\b/;
const PROBLEM_RE = /\b(?:can'?t|cannot|can\s+not|couldn'?t|unable|won'?t|doesn'?t|isn'?t|not\s+(?:working|able|letting|accepting)|(?:does|do|did)\s+not|invalid|incorrect|wrong|failed|failing|error|locked|blocked|disabled|suspended|reset|regenerat\w*|forgot(?:ten)?|lost|expired|broken|stuck|issue|problem)\b/;
const OWN_REF_RE = /\b(?:my|our|mine)\s+(?:\w+\s+){0,2}(?:account|acc|login|log\s*in|password|mt5|mt4|metatrader|platform|trades?|orders?|positions?|payouts?|withdrawals?|kyc|challenge|evaluation)\b/;
const OWN_CRED_RE = /\bmy\s+(?:\w+\s+){0,2}(?:log[\s._-]?in|pass[\s._-]?(?:word|code|wd|phrase)|passwd|pwd|credentials?|creds?)\b|\b(?:for|of|on|to|from)\s+my\s+(?:\w+\s+){0,2}(?:account|acc|mt5|mt4)\b/;
// An account id counts only next to an account/login word. A bare lot size or price must not.
// "account 99999001" / "login 99999001". A size such as "100000 account" is not an id.
const ACCOUNT_ID_NEAR_RE = /\b(?:account|acc|acct|login|log\s*in|mt5|mt4|metatrader|server|investor)\b[^\d]{0,30}\d{5,10}(?!\d)|\d{5,10}(?!\d)[^\d]{0,30}\b(?:login|log\s*in|server|investor)\b/;
const PAYOUT_KYC_RE = /\b(?:payouts?|withdrawals?|withdraw|kyc|verification|proof\s+of\s+(?:address|identity)|chargeback|refund)\b/;
// A request whose object is the password itself (including leet and spaced letters, after foldForCues).
const PASSWORD_SEEK_RE = /\b(?:pass(?:word|wd|code|phrase)|passwd|pwd)\b/;
const COMPLAINT_RE = /\b(?:widen(?:ed|ing|s)?|spik(?:ed|ing|es)?|jump(?:ed|ing|s)?|too\s+(?:high|wide|big|large|much)|huge|crazy|insane|terrible|ridiculous|so\s+high|unfair|scam|manipulat\w*)\b/;
const PERSONAL_MARKER_RE = /\b(?:my|i|we|me|got|was|were|had|stopped\s+out|hit|liquidat\w*|lost|slippage)\b/;
const GENERAL_INFO_RE = /\b(?:commissions?|per\s+lot|raw|standard|ecn|vs\.?|versus|compar\w*|differences?|fees?|swaps?|news|rollover|sessions?|overnight|markups?|average|typical|minimum|lowest|how\s+(?:much|do|does)|why)\b/;
const TEST_ACCESS_RE = /\b(?:test|demo|check)\s+account\b|\bspread\s+(?:test|check)\b|\b(?:test|demo)\s+(?:login|credentials?|server)\b|\bcredentials?\b|\blog[\s._-]?in\b|\bpass[\s._-]?word\b|\bpasswd\b|\bpwd\b/;

function hasSpreadTerm(text) {
  return SPREAD_TERM_RE.test(normalize(text));
}

/**
 * The personal-account boolean explain() uses at its line-124 branch, without
 * the hasTerm guard. Callers run this only when spread state is offered.
 * It does not call explain().
 */
function personalAccountCue(text) {
  const f = foldForCues(normalize(text));
  return ACCOUNT_ID_NEAR_RE.test(f)
    || OWN_CRED_RE.test(f)
    || (OWN_REF_RE.test(f) && PROBLEM_RE.test(f))
    || (CRED_CUE_RE.test(f) && PROBLEM_RE.test(f))
    || (/\bmy\b/.test(f) && CRED_CUE_RE.test(f));
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
  const f = foldForCues(t);
  const credCue = CRED_CUE_RE.test(f);
  const problem = PROBLEM_RE.test(f);
  const hasId = ACCOUNT_ID_NEAR_RE.test(f);
  const ownCred = OWN_CRED_RE.test(f);
  const ownRef = OWN_REF_RE.test(f);
  // Personal account/login problems stay off this route even when they also mention spreads.
  if (hasId || ownCred || (ownRef && problem) || (credCue && problem) || (/\bmy\b/.test(f) && credCue)) {
    return { result: false, reason: 'personal-account-not-spread', hasTerm: true, strong };
  }
  // A spread-term ask for the test/investor/demo login or password is the contained template,
  // not a refusal. The password word alone is not disqualifying.
  const wantsCredential = PASSWORD_SEEK_RE.test(f) || /\b(?:log[\s._-]?ins?|credentials?|creds?)\b/.test(f);
  const wantsTestAccess = /\b(?:test|demo|investor|check|see|view|show|send|share|give)\b/.test(f);
  if (wantsCredential && wantsTestAccess && !problem && !ownRef) {
    return { result: true, reason: 'spread-test-credential', hasTerm: true, strong: true };
  }
  if (PAYOUT_KYC_RE.test(f)) {
    return { result: false, reason: 'payout-kyc-not-spread', hasTerm: true, strong };
  }
  if (COMPLAINT_RE.test(f) && (PERSONAL_MARKER_RE.test(f) || !strong)) {
    return { result: false, reason: 'spread-complaint-not-spread-test', hasTerm: true, strong };
  }
  if (GENERAL_INFO_RE.test(f) && !TEST_ACCESS_RE.test(f)) {
    return { result: false, reason: 'general-spread-info-not-test-access', hasTerm: true, strong };
  }
  /* AUDIT_HARDEN_V1:spreadResidual */
  // Personal login/password/trade-history without strong spread-pricing phrase → not spread check
  const personalLogin = /\b(login|password|credentials?|trade\s+history|open\s+positions?|logged\s+in|cannot\s+log|can'?t\s+log|regenerated\s+(?:my\s+)?password)\b/i.test(t) || CRED_CUE_RE.test(f);
  if (personalLogin && !strong && !/\b(what\s+(?:are|is)\s+(?:the\s+|your\s+)?spreads?|check\s+(?:the\s+|your\s+)?spreads?|test\s+(?:the\s+|your\s+)?spreads?|spread\s+test)\b/i.test(t)) {
    return { result: false, reason: 'personal-login-not-spread', hasTerm: true, strong: false };
  }
  // SPREAD_MECHANISM_V1: "If the spread goes high during the trade, is the PNL affected?" is a question
  // about how spreads work, not a request to inspect FundedElite's spreads. Live 215476057708775
  // received the MT5 test-account credentials block instead of an answer. Without an explicit
  // check/test/see-spreads phrase, an effect/mechanism question goes to the normal answer path
  // (which can still offer the test account when useful).
  if (!strong && /\b(?:affect(?:s|ed)?|impact(?:s|ed)?|effect|influence|p\s*&?\s*n\s*l|pnl|p&l|profit|loss(?:es)?|drawdown|equity|float(?:ing)?|margin|stop\s*loss|\bsl\b|slippage|breach|widen(?:s|ing|ed)?|goes?\s+(?:up|high)|increase(?:s|d)?|spike(?:s|d)?|during\s+(?:the\s+)?(?:trade|news)|why\s+(?:is|are|do|does))\b/i.test(t)) {
    return { result: false, reason: 'spread-mechanism-question', hasTerm: true, strong: false };
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
 * True when a spread ask is bundled with another distinct customer question
 * (payout, KYC, rules, etc.). Used so the spread template can be shared without
 * dropping the other question via an early return.
 */
function hasAdditionalNonSpreadAsk(text) {
  const t = normalize(text);
  if (!SPREAD_TERM_RE.test(t)) return false;
  // Second topic cues (keep narrow — only clear non-spread work)
  return /\b(?:payouts?|withdrawals?|kyc|verification|drawdown|profit\s*split|leverage|breach(?:ed|es)?|reset\s+fee|refund|consistency|second\s+chance|news\s+trading|expert\s+advisor|\bea\b|scalping|weekend\s+hold|copy\s+trad|fee[-\s]?back|profit\s+target|daily\s+loss|max(?:imum)?\s+loss)\b/i.test(t);
}

/**
 * Bare follow-ups that only make sense after Luna already shared the spread-test
 * template ("send again", "what's the server"). Without prior-template context
 * these must NOT route to the spread path.
 */
function isBareSpreadFollowUpAsk(text) {
  const t = normalize(text);
  if (!t || SPREAD_TERM_RE.test(t)) return false;
  if (t.length > 180) return false;
  const f = foldForCues(t);
  if (PROBLEM_RE.test(f) || OWN_CRED_RE.test(f) || ACCOUNT_ID_NEAR_RE.test(f) || PAYOUT_KYC_RE.test(f)) return false;
  if (/\bmy\b/.test(f) && CRED_CUE_RE.test(f)) return false;
  const asksAccess = /\b(?:servers?|log[\s._-]?ins?|pass(?:word|wd|code|phrase)|passwd|pwd|credentials?|creds?|investors?)\b/.test(f);
  const asksAgain = /\b(?:again|resend|re-?send)\b/.test(f);
  return asksAccess || asksAgain;
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
 *   strict-and-legacy (default) and strict-only: the strict gate decides.
 *     A strict-false ask is never widened by the legacy detector.
 *     A strict-true ask is never dropped by the legacy detector. The contained
 *     template is the strict decision; legacy keyword vetoes were swallowing it.
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
  // Legacy cannot veto a strict-true ask (t739 r2). Both modes follow the strict decision.
  if (mode !== 'strict-only' && typeof legacyFn === 'function') {
    /* legacy result is not consulted */
  }
  return true;
}

module.exports = {
  SPREAD_GATE_VERSION,
  isSpreadCheckAsk,
  hasSpreadTerm,
  hasAdditionalNonSpreadAsk,
  isBareSpreadFollowUpAsk,
  explain,
  extractText,
  gateLegacy,
  personalAccountCue,
  foldForCues,
  normalize,
};
