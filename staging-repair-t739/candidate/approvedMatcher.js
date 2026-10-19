'use strict';
/**
 * Shared matcher. In-process. No paid model. No network. No per-module word list.
 * Score is cosine of IDF-weighted tokens (length >= 2) and overlapping character
 * trigrams. Membership is proposition coverage. Packs feeds the frozen fact
 * list. Atom feeds the frozen body-fact result. Lexical stem containment is
 * not membership for either module. Cosine only ranks the covering set. T is
 * frozen at 0, so it is not a send floor. M is frozen null and is not a
 * parameter. Two covering rows do not abstain by themselves.
 */

const fs = require('fs');
const path = require('path');
const { isWelcomeOrBoilerplate } = require('./faqApprovedAnswers');
const { unresolvedPolicy } = require('./unresolvedPolicy');

const PARAMS_PATH = path.join(__dirname, 'matcher-params.json');

function t742Root() {
  const fromEnv = process.env.LUNA_T742_ROOT;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  return path.join(__dirname, '..', '..', 'staging-repair-t742');
}

function tokens(text) {
  return String(text || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
}

function trigrams(text) {
  const s = String(text || '').toLowerCase();
  const out = [];
  for (let i = 0; i + 3 <= s.length; i += 1) out.push(s.slice(i, i + 3));
  return out;
}

function uniq(list) {
  return [...new Set(list)];
}

function splitCandidateAsks(text) {
  const raw = String(text || '');
  const parts = raw
    .split(/(?<=[?\uFF1F\u061F])\s+|(?<=でしょうか[。．!]*)\s+|(?<=ですか[。．!]*)\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [raw.trim()].filter(Boolean);
}

function substantive(clause) {
  if (isWelcomeOrBoilerplate(clause)) return false;
  return tokens(clause).length >= 2;
}

function buildIdf(rows) {
  const N = rows.length || 1;
  const df = new Map();
  for (const row of rows) {
    const seen = new Set();
    for (const w of uniq(tokens(row.body))) seen.add('t:' + w);
    for (const g of uniq(trigrams(row.body))) seen.add('g:' + g);
    for (const k of seen) df.set(k, (df.get(k) || 0) + 1);
  }
  const idf = new Map();
  for (const [k, d] of df) idf.set(k, Math.log((N + 1) / (d + 1)));
  return { idf, N };
}

function vector(text, model) {
  const v = new Map();
  const fallback = Math.log((model.N + 1) / 1);
  for (const w of uniq(tokens(text))) {
    const k = 't:' + w;
    v.set(k, model.idf.has(k) ? model.idf.get(k) : fallback);
  }
  for (const g of uniq(trigrams(text))) {
    const k = 'g:' + g;
    v.set(k, model.idf.has(k) ? model.idf.get(k) : fallback);
  }
  return v;
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const x of a.values()) na += x * x;
  for (const x of b.values()) nb += x * x;
  if (na === 0 || nb === 0) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [k, x] of small) {
    const y = large.get(k);
    if (y) dot += x * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function factSet(body) {
  const s = String(body || '');
  const out = new Set();
  for (const m of s.matchAll(/\d+\s*:\s*\d+/g)) out.add(m[0].replace(/\s+/g, ''));
  for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) out.add(m[0]);
  return out;
}

function setsOverlap(a, b) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

function isObsolete(row) {
  const tags = row && row.intentTags;
  if (Array.isArray(tags) && tags.includes('obsoleteCorrection')) return true;
  return /\.obsolete\./.test(String(row && row.id || ''));
}

function incompatible(a, b) {
  const fa = factSet(a.body);
  const fb = factSet(b.body);
  if (!fa.size || !fb.size) return false;
  return !setsOverlap(fa, fb);
}

function reduceConflicts(rows) {
  let kept = rows.slice();
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < kept.length; i += 1) {
      for (let j = i + 1; j < kept.length; j += 1) {
        if (!incompatible(kept[i], kept[j])) continue;
        const oi = isObsolete(kept[i]);
        const oj = isObsolete(kept[j]);
        if (oi !== oj) {
          kept = kept.filter((r) => isObsolete(r) === false);
          changed = true;
          break outer;
        }
        return { conflict: true, rows: [] };
      }
    }
  }
  return { conflict: false, rows: kept };
}

function productOf(n) {
  if (/\b(?:nobody named|without picking|no variant|product unspecified|product not (?:said|stated|named)|variant not named|variant missing|did not name|have not picked|did not say trailing or static or a variant|no 1-step or 2-step|no product named)\b/.test(n)) {
    return null;
  }
  const oneRe = /\b(?:1\s*-\s*step|1\s+step|one\s*-\s*step|one\s+step)\b/;
  const twoRe = /\b(?:2\s*-\s*step|2\s+step|two\s*-\s*step|two\s+step)\b/;
  const one = oneRe.test(n);
  const two = twoRe.test(n);
  if (one && two) {
    if (/\b(?:compar\w*|both variants|together with|and also|versus)\b/.test(n)) return 'both';
    const i1 = n.search(oneRe);
    const i2 = n.search(twoRe);
    return i1 >= 0 && (i2 < 0 || i1 < i2) ? '1' : '2';
  }
  if (one) return '1';
  if (two) return '2';
  return null;
}

function negatedTrail(n) {
  return /\b(?:did not say|without saying|not say) trailing\b/.test(n);
}

function asksTrail(n) {
  if (negatedTrail(n)) return false;
  return /\btrailing\b/.test(n) || /\btrail\b/.test(n);
}

/**
 * Frozen 2-Step trailing veto. The literal word "trailing" is not required:
 * "trail" counts, a negated trail does not, and a drawdown that moves with
 * the peak counts. The product must be 2-Step, and "together with" does not.
 */
function twoStepTrailing(normalized) {
  const n = String(normalized || '');
  if (productOf(n) !== '2') return false;
  if (/\btogether with\b/.test(n)) return false;
  const trail = asksTrail(n);
  const lossTopic = /\b(?:max(?:imum)?\s+(?:loss|drawdown)|drawdown|floor|overall\s+loss|equity stop)\b/.test(n);
  if (trail && (lossTopic || /\b(?:lock|mechanism|follow|open profit)\b/.test(n) || /\btrail\b/.test(n))) return true;
  if (/\bdrawdown\b/.test(n) && /\b(?:moves with|peak)\b/.test(n)) return true;
  return false;
}

const STOP = new Set(
  'a an the of to and or is are do does did what which who how when where that this for with on in as be it its from by if then than not no yes can may will should would could i my me you your we our they them their there about into over after before only also just so but at am was were been being any all has have had per rather whether still please tell explain'.split(/\s+/)
);
const NUMBER_WORD = Object.freeze({
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  fifteen: '15', twenty: '20', sixty: '60', eighty: '80', ninety: '90',
});

function stem(w) {
  if (NUMBER_WORD[w]) return NUMBER_WORD[w];
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

function catalogStemSet(rows) {
  const set = new Set();
  for (const row of rows) for (const tok of tokens(row.body)) set.add(stem(tok));
  return set;
}

function clauseFacts(clause, catalog) {
  const facts = [];
  const seen = new Set();
  for (const tok of tokens(clause)) {
    const s = stem(tok);
    if (STOP.has(s) || STOP.has(tok)) continue;
    if (!/^\d+$/.test(s) && s.length < 4) continue;
    if (!catalog.has(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    facts.push(s);
  }
  return facts;
}

function concealedSpelling(normalized) {
  const s = String(normalized || '');
  if (/[a-z][^a-z0-9\s'][a-z0-9]|[a-z0-9][^a-z0-9\s'][a-z]/i.test(s)) return true;
  for (const tok of s.match(/[\p{L}\p{N}]+/gu) || []) {
    if (/[a-z]/i.test(tok) && /\d/.test(tok) && !/^\d+k$/i.test(tok) && !/^x\d+$/i.test(tok)) return true;
  }
  return false;
}

const PACKS_FACTS_PATH = path.join(t742Root(), 'packs', 'impl', 'packs-propositions.json');
const ATOM_MODULE_PATH = path.join(t742Root(), 'atom', 'atomModule.js');

let packsFactsCache = null;
const atomCoverCache = new Map();

function loadPacksFacts() {
  if (packsFactsCache) return packsFactsCache;
  try {
    const data = JSON.parse(fs.readFileSync(PACKS_FACTS_PATH, 'utf8'));
    if (!data || !Array.isArray(data.facts)) return null;
    packsFactsCache = data;
    return data;
  } catch (_) {
    return null;
  }
}

function packsConcealed(normalized) {
  const s = String(normalized || '');
  if (/[a-z][@^#*~][a-z0-9]|[a-z0-9][@^#*~][a-z]/i.test(s)) return true;
  for (const tok of s.match(/[\p{L}\p{N}]+/gu) || []) {
    if (/[a-z]/i.test(tok) && /\d/.test(tok) && !/^\d+k$/i.test(tok) && !/^x\d+$/i.test(tok)) return true;
  }
  return false;
}

function factTriggered(fact, text) {
  const any = Array.isArray(fact.any) ? fact.any : [];
  const all = Array.isArray(fact.all) ? fact.all : [];
  if (!any.length && !all.length) return false;
  if (any.length && !any.some((phrase) => text.includes(phrase))) return false;
  if (all.length && !all.every((phrase) => text.includes(phrase))) return false;
  return true;
}

function coversByFacts(normalized, partId, facts) {
  const text = String(normalized || '');
  if (packsConcealed(text)) return false;
  const triggered = (facts || []).filter((fact) => factTriggered(fact, text));
  if (!triggered.length) return false;
  return triggered.every((fact) => Array.isArray(fact.statedBy) && fact.statedBy.includes(partId));
}

function packsPropositionCovers(normalized, partId) {
  const data = loadPacksFacts();
  if (!data) return false;
  return coversByFacts(normalized, partId, data.facts);
}

function atomCoveredIds(normalized) {
  const key = String(normalized || '');
  if (atomCoverCache.has(key)) return atomCoverCache.get(key);
  let set = null;
  try {
    const mod = require(ATOM_MODULE_PATH);
    if (mod && typeof mod.explain === 'function') {
      const explained = mod.explain(key);
      set = new Set((explained && explained.covered) || []);
    }
  } catch (_) {
    set = null;
  }
  atomCoverCache.set(key, set);
  return set;
}

function atomPropositionCovers(normalized, partId) {
  const covered = atomCoveredIds(normalized);
  if (!covered) return false;
  return covered.has(partId);
}

function propositionFeed(feed) {
  if (typeof feed === 'function') return feed;
  if (feed && typeof feed.covers === 'function') {
    return (normalized, row) => feed.covers(normalized, row);
  }
  if (Array.isArray(feed)) {
    return (normalized, row) => coversByFacts(normalized, row && row.id, feed);
  }
  if (feed && Array.isArray(feed.facts)) {
    return (normalized, row) => coversByFacts(normalized, row && row.id, feed.facts);
  }
  return null;
}

function stemCovers(normalized, row, catalog) {
  if (concealedSpelling(normalized)) return false;
  const clauses = splitCandidateAsks(normalized).filter(substantive);
  if (!clauses.length) return false;
  const bodyStems = new Set(tokens(row.body).map(stem));
  let saw = false;
  for (const clause of clauses) {
    const facts = clauseFacts(clause, catalog);
    if (!facts.length) return false;
    saw = true;
    for (const fact of facts) if (!bodyStems.has(fact)) return false;
  }
  return saw;
}

/**
 * Proposition membership. A feed is a covers(normalized, row) function, an
 * object with that method, or a fact list ({id, any, all, statedBy}). With
 * no feed, packs.* reads the frozen Packs fact file and atom.* reads the
 * frozen Atom body-fact result. Neither falls back to lexical stems.
 * A non-module catalog row (V12) still uses stem containment when a stem
 * catalog Set is passed, because that catalog has no proposition file.
 */
function statementCovers(normalized, row, feed) {
  if (!row || typeof row.body !== 'string') return false;
  const fed = propositionFeed(feed);
  if (fed) return !!fed(normalized, row);
  const id = String(row.id || '');
  if (id.startsWith('packs.')) return packsPropositionCovers(normalized, id);
  if (id.startsWith('atom.')) return atomPropositionCovers(normalized, id);
  if (feed && typeof feed.has === 'function') return stemCovers(normalized, row, feed);
  return false;
}

function loadParams(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file || PARAMS_PATH, 'utf8'));
    if (!raw || raw.status !== 'frozen' || typeof raw.T !== 'number' || !(raw.T >= 0)) return null;
    if (raw.M != null) return null;
    return raw;
  } catch (_) {
    return null;
  }
}

function asCandidates(scored) {
  return scored
    .slice()
    .sort((a, b) => {
      const ds = b.score - a.score;
      if (ds) return ds;
      return String(a.row.id) < String(b.row.id) ? -1 : String(a.row.id) > String(b.row.id) ? 1 : 0;
    })
    .map((s) => ({ partId: s.row.id, score: s.score, contentHash: s.row.contentHash || null }));
}

function matchApproved({ normalized, rows, params, clarify }) {
  const T = params && typeof params.T === 'number' ? params.T : null;
  const pool = (rows || []).filter((r) => r && r.id && typeof r.body === 'string');
  const model = buildIdf(pool);
  const scored = pool.map((row) => ({
    row,
    score: cosine(vector(normalized, model), vector(row.body, model)),
  }));
  const candidates = asCandidates(scored);
  const empty = { policy: null, acceptableSet: [], partId: null, candidates };
  if (T == null || !(T >= 0)) {
    return { action: 'ABSTAIN', code: 'calibration-blocked', ...empty, candidates: [] };
  }
  const policy = unresolvedPolicy(normalized);
  if (policy) return { action: 'ABSTAIN', code: 'unresolved-policy', ...empty, policy };
  if (clarify) return { action: 'ABSTAIN', code: 'atom-clarification', ...empty };
  if (twoStepTrailing(normalized)) {
    return { action: 'ABSTAIN', code: 'atom-2step-trailing', ...empty };
  }
  const catalog = catalogStemSet(pool);
  // T is not a send floor. T=0 keeps every non-negative cosine in the rank
  // pool. Membership is statement coverage, then conflict reduction.
  const covered = scored.filter((s) => s.score >= T && statementCovers(normalized, s.row, catalog));
  if (!covered.length) {
    return { action: 'ABSTAIN', code: 'COVERAGE_DENIED', ...empty };
  }
  const reduced = reduceConflicts(covered.map((s) => s.row));
  if (reduced.conflict || !reduced.rows.length) {
    return { action: 'ABSTAIN', code: 'COVERAGE_DENIED', ...empty };
  }
  const scoreOf = new Map(covered.map((s) => [s.row.id, s.score]));
  const acceptableSet = reduced.rows.map((r) => r.id).sort();
  const ranked = reduced.rows.slice().sort((a, b) => {
    const ds = (scoreOf.get(b.id) || 0) - (scoreOf.get(a.id) || 0);
    if (ds) return ds;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  });
  const pick = ranked[0];
  return {
    action: 'SEND',
    code: null,
    policy: null,
    partId: pick.id,
    contentHash: pick.contentHash,
    score: scoreOf.get(pick.id) || 0,
    acceptableSet,
    candidates,
  };
}

const PACKS_REFUSE_ID = 'packs.account-status.refuse.en';
const ATOM_REFUSE_ID = 'atom.account-status.refuse.en';

/**
 * The module sends this id before proposition coverage and before the
 * unresolved-policy veto. The boundary must accept that same approved refusal.
 * Any other id still needs statement coverage.
 */
function approvedRefusalEligible(normalized, candidateId) {
  if (candidateId === PACKS_REFUSE_ID) {
    try {
      const mod = require(path.join(t742Root(), 'packs', 'impl', 'packsAccount'));
      return !!(mod && mod.isPersonalOrMixed && mod.isPersonalOrMixed(normalized));
    } catch (_) {
      return false;
    }
  }
  if (candidateId === ATOM_REFUSE_ID) {
    try {
      const mod = require(ATOM_MODULE_PATH);
      if (!mod || typeof mod.explain !== 'function') return false;
      return mod.explain(normalized).personal === true;
    } catch (_) {
      return false;
    }
  }
  return false;
}

function coversAllIntents(normalized, candidateId, rows, params) {
  const T = params && typeof params.T === 'number' ? params.T : null;
  if (T == null || !(T >= 0) || !candidateId) return false;
  const row = (rows || []).find((r) => r.id === candidateId);
  if (!row) return false;
  if (approvedRefusalEligible(normalized, candidateId)) return true;
  if (unresolvedPolicy(normalized)) return false;
  if (twoStepTrailing(normalized)) return false;
  return statementCovers(normalized, row, catalogStemSet(rows || []));
}

module.exports = {
  matchApproved,
  coversAllIntents,
  approvedRefusalEligible,
  statementCovers,
  loadParams,
  twoStepTrailing,
  splitCandidateAsks,
  tokens,
  PARAMS_PATH,
};
