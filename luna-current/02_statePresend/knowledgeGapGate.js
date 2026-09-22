'use strict';

/**
 * knowledgeGapGate.js - classifies search_knowledge results and finds claims in
 * a draft that neither the approved knowledge nor the conversation supports.
 *
 * Levels: 'supported' | 'partial' | 'conflicting' | 'none'
 */

const T = require('./textUtils');

const DEFAULTS = { supportedScore: 0.6, partialScore: 0.35, conflictScore: 0.5 };

function normalizeResults(results) {
  if (!results) return [];
  const arr = Array.isArray(results) ? results : results.results || results.items || [];
  return arr.map((r, i) => {
    if (typeof r === 'string') return { text: r, score: null, category: null, source: null, id: String(i) };
    return {
      id: String(r.id !== undefined ? r.id : i),
      text: T.stripHtml(r.text || r.answer || r.content || r.body || ''),
      title: r.title || r.question || null,
      score: typeof r.score === 'number' ? r.score : typeof r.similarity === 'number' ? r.similarity : null,
      category: r.category || r.topic || null,
      source: r.source || null,
    };
  }).filter((r) => r.text);
}

// minutes/seconds were missing, so holding-time policy values ("3 minutes", "30 seconds")
// were invisible to every numeric check and a drafted "99 minutes" could not be audited.
const NUMBER_RE = /(?<![\w.])(\d+(?:[.,]\d+)?)\s*(%|percent|minutes?|mins?|seconds?|secs?|days?|hours?|hrs?|business days?|weeks?|months?|usd|\$|€|eur|gbp|pips?|lots?|x)?(?![\w])/gi;

/** Bridges textually-different-but-equivalent units ("%" vs "percent", "$" vs "usd") for the
 * loose support match below. It must never collapse to "any unit" — that would let a stray
 * unit-less number (e.g. "I have 2 accounts") "support" an unrelated drafted "2%" claim. */
function canonUnit(u) {
  const x = String(u || '').toLowerCase();
  if (x === '%' || x === 'percent') return 'pct';
  if (x === '$' || x === 'usd') return 'usd';
  if (x === '€' || x === 'eur') return 'eur';
  if (x === '£' || x === 'gbp') return 'gbp';
  return x;
}

function numericFacts(text) {
  const out = [];
  const t = T.stripHtml(text);
  let m;
  const re = new RegExp(NUMBER_RE.source, 'gi');
  while ((m = re.exec(t)) !== null) {
    const unit = (m[2] || '').toLowerCase().replace(/s$/, '');
    out.push({ raw: m[0].trim(), value: m[1].replace(',', '.'), unit });
  }
  return out;
}

/**
 * Two results conflict if they mention the same unit with different numbers
 * (e.g. "10% profit target" vs "8% profit target").
 */
function detectConflict(results, opts) {
  const o = { ...DEFAULTS, ...(opts || {}) };
  const strong = results.filter((r) => r.score === null || r.score >= o.conflictScore).slice(0, 3);
  for (let i = 0; i < strong.length; i++) {
    for (let j = i + 1; j < strong.length; j++) {
      const a = numericFacts(strong[i].text).filter((x) => x.unit);
      const b = numericFacts(strong[j].text).filter((x) => x.unit);
      for (const fa of a) {
        for (const fb of b) {
          if (fa.unit === fb.unit && fa.value !== fb.value) {
            const sharedTopics = T.extractTopics(strong[i].text).filter((t) => T.extractTopics(strong[j].text).includes(t));
            if (sharedTopics.length) return { conflict: true, detail: `${fa.raw} vs ${fb.raw} (${sharedTopics.join(',')})`, ids: [strong[i].id, strong[j].id] };
          }
        }
      }
    }
  }
  return { conflict: false };
}

/**
 * @returns {{level:string, confidence:number, coverage:number, conflict:object, top:object|null, results:Array}}
 */
function classify(results, query, opts) {
  const o = { ...DEFAULTS, ...(opts || {}) };
  const rs = normalizeResults(results);
  if (!rs.length) return { level: 'none', confidence: 0, coverage: 0, conflict: { conflict: false }, top: null, results: [] };
  const qToks = T.tokens(query || '');
  const scored = rs.map((r) => {
    const cov = qToks.length ? T.overlapRatio(qToks, T.tokens(`${r.title || ''} ${r.text}`)) : 0;
    const score = r.score !== null ? r.score : cov;
    return { ...r, coverage: cov, effective: score };
  }).sort((a, b) => b.effective - a.effective);
  const top = scored[0];
  const conflict = detectConflict(scored, o);
  let level;
  if (conflict.conflict) level = 'conflicting';
  else if (top.effective >= o.supportedScore) level = 'supported';
  else if (top.effective >= o.partialScore) level = 'partial';
  else level = 'none';
  return { level, confidence: Number(top.effective.toFixed(3)), coverage: Number(top.coverage.toFixed(3)), conflict, top, results: scored };
}

// Named so other modules can reuse exactly this pattern instead of depending on the array
// order of PROMISE_RES. Luna's tools are all read-only (get_state, search_knowledge, calc,
// compare_challenges, read_image_facts, list_open_escalation), so a first-person claim to
// have performed one of these actions can never be supported by Luna's own work.
const COMPLETION_VERBS = 'activated|reset|approved|processed|refunded|credited|updated|fixed|unlocked|enabled|completed|confirmed';
const COMPLETION_NOUNS = 'payout|withdrawal|refund|account|kyc|verification|reset|credentials?|challenge';
// Contractions (I've), auxiliaries (I have / I already), simple past (I approved),
// and ordinary passives (your payout has been / was approved). Not a pair of literals.
const COMPLETION_CLAIM_RE = new RegExp(
  String.raw`\b(?:` +
    String.raw`(?:i|we)(?:\s*'\s*ve|\s+have|\s+already)\s+(?:just\s+)?(?:${COMPLETION_VERBS})` +
    String.raw`|` +
    String.raw`(?:i|we)\s+(?:just\s+)?(?:${COMPLETION_VERBS})` +
    String.raw`|` +
    String.raw`(?:your|the)\s+(?:${COMPLETION_NOUNS})\s+(?:has\s+been|have\s+been|was|were|is\s+now|are\s+now)\s+(?:${COMPLETION_VERBS})` +
    String.raw`|` +
    String.raw`(?:it|this|these)\s+(?:has\s+been|have\s+been|was|were)\s+(?:${COMPLETION_VERBS})` +
  String.raw`)\b`,
  'i'
);

const PROMISE_RES = [
  /\bwithin\s+\d+\s*(?:minutes?|hours?|days?|business days?|working days?)\b/i,
  /\b(?:will|would)\s+be\s+(?:approved|activated|processed|paid|refunded|reset|credited|completed|resolved|done)\b/i,
  COMPLETION_CLAIM_RE,
  /\bguarantee(?:d|s)?\b/i,
  /\b(?:by|before)\s+(?:tomorrow|tonight|end of (?:the )?day|eod|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\byou will (?:definitely|certainly|surely) (?:get|receive|pass)\b/i,
];

const FACT_ASSERTION_RE = /\b(?:our policy|the rule is|rules? (?:state|say|require)|you (?:can|cannot|can't|must|need to|are (?:not )?allowed)|is (?:not )?allowed|maximum|minimum|limit is|takes? (?:up to )?\d|fee is|costs?|price is|the (?:profit )?target is|drawdown is)\b/i;

const HEDGE_RE = /\b(?:i(?:'m| am) not (?:100% )?sure|i (?:will|'ll) (?:check|confirm)|let me (?:check|confirm)|our team will confirm|i cannot confirm|i can't confirm|to be confirmed|i don't have that information|i do not have that information)\b/i;

/**
 * Finds numbers/promises in the draft that appear in neither the knowledge
 * results nor the conversation (client, human, note texts).
 */
function findUnsupportedClaims(draft, ctx) {
  ctx = ctx || {};
  const knowledgeText = normalizeResults(ctx.knowledge && ctx.knowledge.results ? ctx.knowledge.results : ctx.knowledge).map((r) => `${r.title || ''} ${r.text}`).join('\n');
  const convoText = (ctx.messages || []).map((m) => m.text || '').join('\n');
  const support = `${knowledgeText}\n${convoText}\n${ctx.extraSupport || ''}`;
  const supportNums = new Set(numericFacts(support).map((f) => `${f.value}|${f.unit}`));
  // Only support numbers that themselves carry a unit can loosely back a drafted claim
  // (matched via canonical unit family); a bare/unit-less support number must never do so.
  const supportNumsLoose = new Set(
    numericFacts(support).filter((f) => f.unit).map((f) => `${f.value}|${canonUnit(f.unit)}`)
  );

  const unsupportedNumbers = [];
  for (const f of numericFacts(draft)) {
    // Only numbers with a unit are treated as factual claims (8%, 14 days, $500).
    // Unit-less numbers are identifiers or counts (account/login numbers, "step 1",
    // "2 questions") and are never audited here; contradiction checks own them.
    if (!f.unit) continue;
    if (supportNums.has(`${f.value}|${f.unit}`) || supportNumsLoose.has(`${f.value}|${canonUnit(f.unit)}`)) continue;
    unsupportedNumbers.push(f.raw);
  }

  const unsupportedPromises = [];
  for (const re of PROMISE_RES) {
    const m = T.stripHtml(draft).match(re);
    if (!m) continue;
    // Supported if the same phrase exists in knowledge or a human message.
    const humanText = (ctx.messages || []).filter((x) => x.role === 'human' || x.role === 'note').map((x) => x.text).join('\n');
    const phraseToks = T.tokens(m[0]);
    const sup = T.overlapRatio(phraseToks, T.tokens(`${knowledgeText}\n${humanText}`));
    if (sup >= 0.99 && phraseToks.length) continue;
    unsupportedPromises.push(m[0]);
  }

  const assertsFacts = FACT_ASSERTION_RE.test(T.stripHtml(draft)) && !HEDGE_RE.test(T.stripHtml(draft));
  return { unsupportedNumbers: T.uniq(unsupportedNumbers), unsupportedPromises: T.uniq(unsupportedPromises), assertsFacts };
}

module.exports = { DEFAULTS, COMPLETION_CLAIM_RE, classify, normalizeResults, numericFacts, detectConflict, findUnsupportedClaims, PROMISE_RES, FACT_ASSERTION_RE, HEDGE_RE };
