'use strict';
/**
 * typoNormalizer.js — owner rule, 2026-09-21.
 *
 * Customers type "2 stop chollange", "payot", "fund account". The intended meaning is obvious
 * from the FundedElite context, so the bot must answer the intended question instead of saying
 * it does not understand. In live chat 215476023193727 "2 stop chollange" produced the generic
 * "could you tell me a bit more about what you mean?" because no topic matched the garbled text.
 *
 * This module only produces a normalized COPY of the client's text, used for topic matching,
 * knowledge retrieval and as an internal hint to the model. The client's own words are never
 * rewritten back at them and the mistake is never pointed out.
 *
 * It is deliberately conservative: an explicit table first, then a bounded edit-distance match
 * against a small FundedElite vocabulary. A word that is already ordinary English is left alone,
 * so "stop loss" stays "stop loss" while "2 stop" becomes "2 step".
 */

/** Levenshtein distance, abandoned as soon as it exceeds max. */
function editDistance(a, b, max) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = new Array(b.length + 1);
  let prevPrev = new Array(b.length + 1).fill(0);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    const cur = new Array(b.length + 1);
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      // Adjacent transposition ("setp" for "step") is one typo, not two.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prevPrev[j - 2] + 1);
      }
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prevPrev = prev;
    prev = cur;
  }
  return prev[b.length];
}

// Phrase-level fixes. Order matters: these run before per-word matching.
const PHRASE_FIXES = [
  // "2 stop" / "1 stap" / "two step" -> canonical step wording. Only next to the digit or word
  // for 1/2, so a real "stop loss" or "stop out" is untouched.
  // Right after "1"/"2"/"one"/"two", any short token one edit from "step" is the step wording:
  // stop, stap, stip, setp, stepp, sten... Listing spellings would not generalize. A standalone
  // "stop loss" or "stop trading" never matches, because the digit has to be in front.
  [/\b(1|2|one|two)[\s-]*([a-z]{3,5})\b/gi, (m, n, w) => (
    // Already correct ("2-step", "2 steps"): leave the customer's wording exactly as it is.
    /^steps?$/i.test(w) ? m : (editDistance(w.toLowerCase(), 'step', 1) <= 1 ? n + ' step' : m)
  )],
  [/\bfund\s+account\b/gi, 'funded account'],
  [/\bfund\s+stage\b/gi, 'funded stage'],
  [/\bprofit\s+spilt\b/gi, 'profit split'],
  [/\bsecond\s+chanc?e?\b/gi, 'second chance'],
  [/\bfree\s+ret(?:ray|rey|ry|rai)\b/gi, 'free retry'],
  [/\bdaily\s+los\b/gi, 'daily loss'],
  // Compounds customers split or join. These are single FundedElite concepts either way.
  [/\bdraw\s+down\b/gi, 'drawdown'],
  [/\bstoploss\b/gi, 'stop loss'],
  [/\bstop[\s_-]+loss\b/gi, 'stop loss'],
  [/\blot\s*size\b/gi, 'lot size'],
  [/\bprofit\s*split\b/gi, 'profit split'],
  // Phonetic "-shun" for "-tion" ("activashun", "verificashun"). Needs a real stem in front,
  // so the standalone word "shun" is untouched.
  [/\b([a-z]{4,})shun\b/gi, (m, stem) => stem + 'tion'],
  // SMS shorthand. Short forms never reach edit-distance matching (too few letters to be safe),
  // so the common ones are listed. They are ordinary English shorthand, not FundedElite facts.
  // Question words. A closed set of non-word spellings, so nothing real can be caught: a
  // garbled "whaot is 2 stop chollonge" must still read as a "what is ..." product question.
  [/\b(?:wha?o?t|waht|whta|wht|wat)\b/gi, 'what'],
  [/\b(?:hwo|hwow|hoe?w)\b/gi, 'how'],
  [/\b(?:wehn|whne|whn)\b/gi, 'when'],
  // NOT "were": that is an ordinary English word, not a misspelling of "where".
  [/\b(?:wher|whre|wheer)\b/gi, 'where'],
  [/\btym\b/gi, 'time'],
  [/\bacc?nt\b|\bacc\b|\bacct\b/gi, 'account'],
  [/\bamt\b/gi, 'amount'],
  [/\bmsg\b/gi, 'message'],
  [/\bwithdrwl\b/gi, 'withdrawal'],
];

// Words the bot cares about. Edit-distance matching only ever produces one of these.
const VOCAB = [
  'challenge', 'challenges', 'evaluation', 'payout', 'payouts', 'withdrawal', 'withdraw',
  'drawdown', 'consistency', 'leverage', 'funded', 'funding', 'instant', 'retry', 'reset',
  'refund', 'breach', 'breached', 'scalping', 'dashboard', 'verification', 'verify', 'deposit',
  'profit', 'target', 'account', 'platform', 'spread', 'spreads', 'commission', 'affiliate',
  'phase', 'upgrade', 'balance', 'password', 'credentials', 'certificate', 'coupon', 'discount',
  'trading', 'trades', 'lite', 'elite', 'minimum', 'maximum', 'weekend', 'holding', 'martingale',
  'hedging', 'metatrader', 'tradelocker', 'activation', 'subscription', 'invoice', 'stage',
  'split', 'rule', 'rules', 'limit', 'limits', 'scalping', 'payment', 'trailing', 'static',
  // Also correction TARGETS even though the correctly spelled word is protected from being
  // changed itself: "reqest" must still be able to become "request".
  'request', 'requests', 'amount', 'money', 'report',
];
const VOCAB_SET = new Set(VOCAB);

/**
 * Any word the approved knowledge already uses is a real word and must never be "corrected".
 * Without this, "live account" became "lite account" and "trailing drawdown" became "trading
 * drawdown" - both are separate FundedElite concepts, so the correction changed the question.
 * The FAQ file is the dictionary because it is exactly this product's vocabulary.
 */
const KNOWN_WORDS = (() => {
  const set = new Set();
  try {
    const fs = require('fs');
    const path = require('path');
    const text = fs.readFileSync(path.join(__dirname, '..', 'fundedelite-faqs.md'), 'utf8');
    for (const w of text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []) set.add(w);
  } catch (_) { /* fall back to PROTECTED_WORDS only */ }
  return set;
})();

// Ordinary words that are close to a vocabulary word and must never be "corrected".
// "stop"->"step", "trade"->"trades", "fund"->"funded" would all change the meaning.
const PROTECTED_WORDS = new Set([
  'stop', 'stops', 'top', 'step', 'steps', 'trade', 'trader', 'traded', 'fund', 'funds',
  'count', 'amount', 'about', 'phone', 'place', 'please', 'balance', 'change', 'charge',
  'chance', 'stage', 'page', 'pay', 'paid', 'pair', 'part', 'past', 'last', 'list', 'lost',
  'loss', 'lots', 'lot', 'rest', 'best', 'test', 'text', 'next', 'need', 'read', 'real',
  'reply', 'refer', 'refund', 'result', 'report', 'request', 'target', 'market', 'money',
]);

/** Closest vocabulary word within the allowed edit budget, or '' when nothing is close enough. */
function closestVocab(word) {
  const w = word.toLowerCase();
  // 1- and 2-letter tokens carry no signal; 3-letter ones are matched but only against short
  // vocabulary words and only at distance 1 ("rul" -> "rule"), which the checks below enforce.
  if (w.length < 3) return '';
  if (VOCAB_SET.has(w) || PROTECTED_WORDS.has(w) || KNOWN_WORDS.has(w)) return '';
  // A normal inflection of a real word is not a typo: "splits" must not become "split",
  // "breaches" must not become "breach". Only the stem needs to be known.
  for (const suffix of ['s', 'es', 'ed', 'ing', "'s"]) {
    if (!w.endsWith(suffix)) continue;
    const stem = w.slice(0, -suffix.length);
    if (stem.length >= 3 && (VOCAB_SET.has(stem) || KNOWN_WORDS.has(stem) || PROTECTED_WORDS.has(stem))) return '';
  }
  // Short words get one edit, longer ones two: "payot" -> "payout", "chollange" -> "challenge".
  const budget = w.length >= 8 ? 2 : 1;
  let best = ''; let bestD = budget + 1;
  for (const cand of VOCAB) {
    // A 3-letter token may only become a short word; "rub" must not reach "refund".
    if (w.length === 3 && cand.length > 5) continue;
    // A typo keeps the first letter; without this "live" reaches "lite" and "sale" reaches "stage".
    if (cand[0] !== w[0]) continue;
    const d = editDistance(w, cand, budget);
    if (d < bestD) { bestD = d; best = cand; }
  }
  return bestD <= budget ? best : '';
}

/**
 * @returns {{text: string, changed: boolean, changes: Array<[string,string]>}}
 *          the normalized copy plus what was reinterpreted.
 */
function normalize(text) {
  const original = String(text || '');
  if (!original.trim()) return { text: original, changed: false, changes: [] };
  const changes = [];
  let out = original;
  for (const [re, to] of PHRASE_FIXES) {
    out = out.replace(re, (...args) => {
      const match = args[0];
      const replaced = typeof to === 'function' ? to(...args) : to;
      if (replaced.toLowerCase() !== match.toLowerCase()) changes.push([match, replaced]);
      return replaced;
    });
  }
  out = out.replace(/[A-Za-z][A-Za-z'-]*/g, (word) => {
    const fixed = closestVocab(word);
    if (!fixed) return word;
    changes.push([word, fixed]);
    return word[0] === word[0].toUpperCase() ? fixed[0].toUpperCase() + fixed.slice(1) : fixed;
  });
  return { text: out, changed: changes.length > 0, changes };
}

/** Convenience: the normalized string only. */
function normalizeText(text) { return normalize(text).text; }

module.exports = { normalize, normalizeText, editDistance, closestVocab, VOCAB, PHRASE_FIXES };
