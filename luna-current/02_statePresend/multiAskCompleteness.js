'use strict';

/**
 * multiAskCompleteness.js - collects every relevant unanswered client ask from
 * the recent message burst (not just the last message) and checks whether a
 * draft covers them.
 */

const { stripHtml, extractQuestions, tokens, overlapRatio, extractTopics, isShortAck, isGreetingOrSmallTalk, uniq, stem } = require('./textUtils');

// The shared stem() only strips (ing|ed|es|s|e), so it cannot join the domain
// word-pairs a client's question and a correct answer routinely swap: "lose" vs
// "loss", "day" vs "daily", "withdraw" vs "withdrawal". Coverage is a recall
// problem here — a missed match reports an already-answered question as missed,
// which fails the draft closed and escalates it to a human — so map these known
// variants onto one concept before measuring overlap. The 0.45 threshold below is
// deliberately unchanged: this raises recall without accepting a draft that never
// states an answer.
const CONCEPT_EQUIV = new Map(Object.entries({
  lose: 'loss', loses: 'loss', losing: 'loss', lost: 'loss', loss: 'loss', losses: 'loss',
  day: 'day', days: 'day', daily: 'day',
  breach: 'breach', breaches: 'breach', breached: 'breach', breaching: 'breach',
  withdraw: 'withdraw', withdraws: 'withdraw', withdrawal: 'withdraw', withdrawals: 'withdraw', withdrawing: 'withdraw',
  payout: 'payout', payouts: 'payout',
  profit: 'profit', profits: 'profit', profitable: 'profit', profitability: 'profit',
  trade: 'trade', trades: 'trade', trading: 'trade', trader: 'trade',
  hold: 'hold', holds: 'hold', holding: 'hold', held: 'hold',
  pass: 'pass', passes: 'pass', passed: 'pass', passing: 'pass',
  fail: 'fail', fails: 'fail', failed: 'fail', failing: 'fail', failure: 'fail',
  limit: 'limit', limits: 'limit', limited: 'limit',
  reset: 'reset', resets: 'reset', resetting: 'reset',
  allow: 'allow', allows: 'allow', allowed: 'allow', allowance: 'allow',
  drawdown: 'drawdown', drawdowns: 'drawdown',
  max: 'max', maximum: 'max', min: 'min', minimum: 'min', least: 'min', most: 'max',
}));

// A "how much / how many / how long / how often" ask requests a figure. Concept
// overlap alone cannot tell a real answer ("the daily loss limit is 5% ... $2,500")
// from a topic echo that states nothing ("thanks for asking about your daily loss,
// let me look into it") — both share the same words. Requiring a figure in the
// reply keeps the gate closed on the echo while the equivalence map above lets the
// real answer through. This tightens coverage; it never accepts more.
// A holding line shares the ask's words but answers nothing, so it must never satisfy the
// relaxed weak-word path below.
const HOLDING_REPLY_RE = /\b(?:let me (?:check|confirm|look|see)|i(?:'ll| will) (?:check|confirm|look|find out|get back)|looking into|i am checking|checking this now|our team will (?:check|confirm|review|look)|(?:has|have) been (?:received|noted|logged|forwarded)|we(?:'ve| have) received|thanks for (?:your|the) (?:question|message|details))\b/i;

const WEAK_ASK_WORDS = new Set(['anything', 'something', 'different', 'differences', 'difference', 'special', 'else', 'extra', 'about', 'regarding', 'concerning', 'thing', 'things']);

// "what is the minimum/maximum X?" requests a value just as much as "how long?" does, so it
// carries the same requirement that the reply actually state a figure. This TIGHTENS the
// check: a reply that only echoes the ask's words ("let me check the minimum holding time")
// is still reported missed.
const QUANTITY_ASK_RE = /\bhow\s+(?:much|many|long|often)\b|\bwhat(?:'s| is|\s+are)?\s+(?:the\s+)?(?:minimum|maximum|max|min)\b/i;
// A bare digit is not an answer: the "2" in "2-Step" satisfied the old check, so
// "On the 2-Step challenge, holding time depends on your add-ons" counted as a duration.
// A quantity ask must be answered with a figure carrying a unit (or an explicit "no limit").
const FIGURE_RE = /(?:\$\s?\d|\d[\d,.]*\s*(?:%|percent|minutes?|mins?\b|seconds?|secs?\b|hours?|hrs?\b|days?|weeks?|months?|years?|usd|eur|gbp|k\b|pips?)|\b\d[\d,]*\s*(?:,\d{3})+)|\b(?:unlimited|no\s+limit|none)\b/i;

// "Are you a real person or a bot?" is answered by disclosing what Luna is, and that
// disclosure shares no vocabulary with the question, so word overlap scores 0 and the
// honest answer gets reported as an unanswered question. Reuse the live identity guard
// for the ask side; the reply still has to actually disclose.
let __identityGuard = null;
try { __identityGuard = require('../assistantIdentityGuard'); } catch (_) { __identityGuard = null; }
const AI_DISCLOSURE_RE = /\b(?:a[in]\s+(?:ai|assistant|bot)|artificial intelligence|automated|virtual assistant|ai assistant|not a human|i'?m an ai|i am an ai)\b/i;
function isIdentityAsk(text) {
  try {
    return !!(__identityGuard && __identityGuard.isDirectIdentityQuestion(text));
  } catch (_) {
    return false;
  }
}

// Clients write "200k"; answers write "$200,000" or "$200K". normalize() also splits on the
// comma, so "200,000" became two tokens and the size never matched at all. Fold every form to
// a bare number before tokenizing so they compare equal. Sizes are the whole point of many
// asks, so a mismatch here reports an answered question as unanswered.
// In this domain "hold a position" and "keep / stay / remain open" are the same concept, but
// they share no vocabulary, so a correct holding-time answer ("positions must remain open for
// at least 3 minutes") scored below the threshold against an ask about "holding time" and was
// escalated. Normalize the phrase before tokenizing. Narrow and domain-grounded; the figure
// requirement and the remaining token matches still apply.
function normalizeDomainPhrases(s) {
  return String(s || '')
    .replace(/\b(?:stay|stays|stayed|staying|remain|remains|remained|remaining|keep|keeps|kept|keeping)\s+(?:it\s+|them\s+|the\s+(?:trade|position)s?\s+)?open\b/gi, 'hold')
    .replace(/\b(?:open|hold)\s+(?:a\s+|the\s+)?(?:trade|position)s?\s+for\b/gi, 'hold for');
}

function normalizeSizes(s) {
  return String(s || '')
    .replace(/\$\s?(?=\d)/g, '')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\b(\d+(?:\.\d+)?)\s?k\b/gi, (m, n) => String(Math.round(parseFloat(n) * 1000)));
}

function conceptToken(t) {
  const direct = CONCEPT_EQUIV.get(t);
  if (direct) return direct;
  const s = stem(t);
  return CONCEPT_EQUIV.get(s) || s;
}

/** fraction of the ask's concept tokens present in the reply's concept tokens */
// Product names are written "1 step" by clients and "1-Step" in answers; tokens() keeps the
// hyphen, so "1-step" never matched "1" + "step". Split hyphenated tokens before comparing.
const splitHyphen = (toks) => toks.flatMap((t) => (/[a-z0-9]-[a-z0-9]/.test(t) ? t.split('-').filter(Boolean) : [t]));

// Product-name words appear in almost every answer about that product, so matching only on
// them ("Lite 1-Step ... profit split") must not count as answering a different question
// about that product ("max drawdown on the lite 1 step"). At least one non-product word of
// the ask has to be present in the reply as well. This only ever tightens coverage.
const PRODUCT_WORDS = new Set(['lite', 'step', '1', '2', 'instant', 'flash', 'catalyst', 'challenge', 'challenges', 'elite', 'standard', 'free', 'retry', 'activation']);

function conceptOverlap(askToks, replyToks) {
  const H = new Set(splitHyphen(replyToks).map(conceptToken));
  const N = [...new Set(splitHyphen(askToks).map(conceptToken))];
  if (!N.length) return 0;
  let hit = 0;
  for (const t of N) if (H.has(t)) hit += 1;
  const topical = N.filter((t) => !PRODUCT_WORDS.has(t));
  if (topical.length && !topical.some((t) => H.has(t))) return 0;
  return hit / N.length;
}

// "What services/products/things do you offer/have/provide?" - a generic capability
// question, not a request for a specific fact. See isCovered() below for why this needs a
// looser coverage check than the strict word-overlap ratio.
const GENERIC_OFFERINGS_ASK_RE = /^what\s+(?:services?|products?|things?|programs?|options?|packages?)\s+do\s+you\s+(?:guys\s+)?(?:offer|have|provide)\s*\??$|^what\s+do\s+you\s+(?:guys\s+)?(?:offer|have|provide)\s*\??$/i;
const GENERIC_TWO_STEP_ASK_RE = /^(?:what\s+is|what'?s|tell\s+me\s+about|explain)\s+(?:the\s+)?2[\s-]*step\s+challenge\s*\??$/i;
const MEANING_FOLLOWUP_RE = /^(?:w?hat\s+do\s+you\s+mean|what\s+does\s+that\s+mean|can\s+you\s+explain\s+what\s+you\s+mean)\s*\??$/i;
const BOTH_TWO_STEP_VARIANTS_RE = /\b2[\s-]*step\b[\s\S]*\blite\b[\s\S]*\bfree\s*retry\b|\b2[\s-]*step\b[\s\S]*\bfree\s*retry\b[\s\S]*\blite\b/i;

/**
 * Extract asks from an ordered list of normalised messages
 * ({role:'client'|'bot'|'human', text}). Only client messages after the last
 * bot/human reply form the current burst; earlier client questions that were
 * never answered are included as `carried`.
 */
function extractAsks(messages, opts) {
  const maxCarried = (opts && opts.maxCarried) || 3;
  const msgs = Array.isArray(messages) ? messages : [];
  let lastReplyIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'bot' || msgs[i].role === 'human') { lastReplyIdx = i; break; }

  const burst = [];
  for (let i = lastReplyIdx + 1; i < msgs.length; i++) {
    if (msgs[i].role !== 'client') continue;
    const text = stripHtml(msgs[i].text);
    if (!text || isShortAck(text)) continue;
    const qsAll = extractQuestions(text);
    // Pure greeting / small-talk ("how are you", incl. typos like "how atre you") is not a
    // real information request; do not require the draft to answer it (MISSED_QUESTION must
    // stay fail-closed for actual unanswered questions, so only these are dropped here).
    const qs = qsAll.filter((q) => !isGreetingOrSmallTalk(q));
    if (qs.length) qs.forEach((q) => burst.push({ text: q, source: i, kind: 'question' }));
    else if (!qsAll.length && tokens(text).length >= 3) burst.push({ text, source: i, kind: 'statement' });
  }

  // Carried: client questions before lastReplyIdx that no later bot/human reply covered.
  const carried = [];
  const latestClient = [...msgs].reverse().find((m) => m.role === 'client');
  // A standalone greeting is a presence check, not a request to reopen every
  // older question that the word-overlap coverage heuristic may have missed.
  const onlyGreetingNow = burst.length === 0 && latestClient && isGreetingOrSmallTalk(latestClient.text);
  for (let i = 0; !onlyGreetingNow && i < lastReplyIdx; i++) {
    if (msgs[i].role !== 'client') continue;
    for (const q of extractQuestions(msgs[i].text)) {
      if (isGreetingOrSmallTalk(q)) continue;
      const later = msgs.slice(i + 1).filter((m) => m.role === 'bot' || m.role === 'human').map((m) => m.text).join(' ');
      if (!isCovered(q, later)) carried.push({ text: q, source: i, kind: 'question', carried: true });
    }
  }

  const dedupe = (arr) => {
    const out = [];
    for (const a of arr) if (!out.some((b) => overlapRatio(tokens(a.text), tokens(b.text)) >= 0.8)) out.push(a);
    return out;
  };
  return { burst: dedupe(burst), carried: dedupe(carried).slice(-maxCarried), clientMessagesInBurst: msgs.slice(lastReplyIdx + 1).filter((m) => m.role === 'client').length };
}

function isCovered(ask, replyText, opts) {
  // 0.34 let a reply that merely echoes ~a third of the question's vocabulary count as
  // "answered" without actually addressing it (e.g. reusing "profit"/"target"/"challenge"
  // while never stating a number). Raised to require overlap on most of the ask's content
  // words; still a token-overlap heuristic, not semantic understanding, so this is a
  // deliberately moderate increase rather than an aggressive one that could start blocking
  // real, differently-worded answers.
  const threshold = (opts && opts.threshold) || 0.45;
  const askToks = tokens(normalizeSizes(normalizeDomainPhrases(ask)));
  const replyToks = tokens(normalizeSizes(normalizeDomainPhrases(replyText)));
  if (!askToks.length) return true;
  // The generic 2-Step question is answered by naming both available versions.
  // Word overlap alone misses "2-step" and "challenges" as variants of
  // "2 step challenge", causing an already answered ask to be carried forever.
  if (GENERIC_TWO_STEP_ASK_RE.test(String(ask || '').trim()) && BOTH_TWO_STEP_VARIANTS_RE.test(replyText)) return true;
  // "What do you mean?" refers to the preceding explanation. Its words have
  // no topic overlap, so require a concrete answer naming both variants.
  if (MEANING_FOLLOWUP_RE.test(String(ask || '').trim())) return BOTH_TWO_STEP_VARIANTS_RE.test(replyText);
  if (isIdentityAsk(ask) && AI_DISCLOSURE_RE.test(String(replyText || ''))) return true;
  // A value-asking question must be answered with a figure. This hard requirement runs
  // BEFORE the relaxation below, so a contentless reply can never pass by word overlap.
  if (QUANTITY_ASK_RE.test(String(ask || '')) && !FIGURE_RE.test(String(replyText || ''))) return false;

  // Words like "anything / different / else" carry no discriminative content, but they sit in
  // the denominator and drag a correct answer below the threshold when the reply names the
  // same thing differently ("300K challenges" for "300k accounts"). Drop them from the ask
  // side only. The remaining tokens must still match, so a wrong-product or contentless
  // reply is still reported missed.
  {
    const concrete = askToks.filter((t) => !WEAK_ASK_WORDS.has(t));
    if (concrete.length && concrete.length < askToks.length &&
        !HOLDING_REPLY_RE.test(String(replyText || '')) &&
        conceptOverlap(concrete, replyToks) >= threshold) return true;
  }
  if (conceptOverlap(askToks, replyToks) >= threshold) return true;
  // "What services/products do you offer?" is a generic capability question - a good answer
  // describes concrete offerings in different words ("we offer evaluation challenges...") and
  // will rarely repeat the literal words "services"/"products"/"guys", so it fails the word
  // -overlap check above even when it fully answers the question. Treat any substantive,
  // on-topic reply as covering this specific generic-ask pattern instead of requiring literal
  // overlap (narrowly scoped to this phrasing - a real "what is my profit target" style
  // question still needs real word/topic overlap below).
  if (GENERIC_OFFERINGS_ASK_RE.test(String(ask || '').trim())) {
    if (extractTopics(replyText).length || tokens(replyText).length >= 8) return true;
  }
  // topic-level coverage only for very short asks ("how about payouts?") where
  // token overlap is meaningless; longer asks must overlap on content.
  if (askToks.length > 1) return false;
  const askTopics = extractTopics(ask);
  const replyTopics = extractTopics(replyText);
  return askTopics.length > 0 && askTopics.every((t) => replyTopics.includes(t));
}

/**
 * @returns {{asks:Array, covered:Array, missed:Array, total:number}}
 */
function checkCoverage(draft, asks, opts) {
  const list = Array.isArray(asks) ? asks : [...(asks.burst || []), ...(asks.carried || [])];
  const covered = [];
  const missed = [];
  for (const a of list) (isCovered(a.text, draft, opts) ? covered : missed).push(a);
  return { asks: list, covered, missed, total: list.length };
}

function summarize(asks) {
  return uniq([...(asks.burst || []), ...(asks.carried || [])].map((a) => a.text));
}

module.exports = { extractAsks, checkCoverage, isCovered, summarize };
