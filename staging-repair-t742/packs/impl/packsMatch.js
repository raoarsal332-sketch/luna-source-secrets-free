'use strict';
/**
 * Local stand-in for candidate/approvedMatcher.js matchApproved.
 * Used only when that shared module is absent. Algorithm is design (g)
 * at 46efb63b. M is not a parameter. T is passed in params and is not
 * written to matcher-params.json.
 *
 * Returns score candidates at or above T. It does not apply policy names.
 * Coverage is applied by decide, because the shared signature has no
 * coverage callback and the integration owner owns the shared file.
 */

const fs = require('fs');
const path = require('path');

const T_GRID = Object.freeze([0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6]);

const SHARED_MATCHER_CANDIDATES = [
  path.join(__dirname, '../../../staging-repair-t739/candidate/approvedMatcher.js'),
  path.join(__dirname, '../../../../candidate/approvedMatcher.js'),
];

const SHARED_PARAMS_CANDIDATES = [
  path.join(__dirname, '../../../staging-repair-t739/candidate/matcher-params.json'),
  path.join(__dirname, '../../../../candidate/matcher-params.json'),
];

function tokensOf(s) {
  return String(s || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
}

function trigramsOf(s) {
  const grams = [];
  const runs = String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  for (const run of runs) {
    if (run.length < 3) continue;
    for (let i = 0; i + 3 <= run.length; i += 1) grams.push(run.slice(i, i + 3));
  }
  return grams;
}

function buildIndex(rows) {
  const n = rows.length;
  const tokenDf = new Map();
  const triDf = new Map();
  for (const row of rows) {
    for (const w of new Set(tokensOf(row.body))) tokenDf.set(w, (tokenDf.get(w) || 0) + 1);
    for (const g of new Set(trigramsOf(row.body))) triDf.set(g, (triDf.get(g) || 0) + 1);
  }
  const idf = (df) => Math.log((n + 1) / ((df || 0) + 1));
  function vector(text) {
    const m = new Map();
    for (const w of new Set(tokensOf(text))) m.set('t:' + w, idf(tokenDf.get(w)));
    for (const g of new Set(trigramsOf(text))) m.set('g:' + g, idf(triDf.get(g)));
    return m;
  }
  const bodyVec = new Map(rows.map((row) => [row.id, vector(row.body)]));
  return { n, vector, bodyVec };
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, v] of a) na += v * v;
  for (const [, v] of b) nb += v * v;
  const small = a.size <= b.size ? a : b;
  const big = a.size <= b.size ? b : a;
  for (const [k, v] of small) {
    if (big.has(k)) dot += v * big.get(k);
  }
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

function localMatchApproved({ normalized, rows, params }) {
  const t = params && typeof params.T === 'number' ? params.T : null;
  if (!(t > 0)) throw new Error('match-approved-missing-T');
  const index = buildIndex(rows);
  const q = index.vector(normalized);
  const candidates = [];
  for (const row of rows) {
    const score = cosine(q, index.bodyVec.get(row.id));
    if (score >= t) candidates.push({ partId: row.id, score, contentHash: row.contentHash });
  }
  candidates.sort((a, b) => b.score - a.score || a.partId.localeCompare(b.partId));
  return { candidates, source: 'packs-local-stand-in', N: index.n };
}

function loadSharedMatcher() {
  for (const file of SHARED_MATCHER_CANDIDATES) {
    if (!fs.existsSync(file)) continue;
    try {
      const mod = require(file);
      if (mod && typeof mod.matchApproved === 'function') {
        return { matchApproved: mod.matchApproved, file, source: 'shared' };
      }
    } catch (err) {
      return { error: String(err && err.message ? err.message : err), file, source: 'shared-load-failed' };
    }
  }
  return { matchApproved: null, source: 'absent' };
}

function loadSharedParams() {
  for (const file of SHARED_PARAMS_CANDIDATES) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { file, params: raw };
    } catch (err) {
      return { file, error: String(err && err.message ? err.message : err) };
    }
  }
  return null;
}

function matchApproved(input) {
  const shared = loadSharedMatcher();
  if (shared.matchApproved) {
    const out = shared.matchApproved(input);
    return { ...normalizeShared(out), source: 'shared', file: shared.file };
  }
  return localMatchApproved(input);
}

function normalizeShared(out) {
  if (Array.isArray(out)) return { candidates: out };
  if (out && Array.isArray(out.candidates)) return out;
  return { candidates: [], unrecognized: true };
}

module.exports = {
  T_GRID,
  tokensOf,
  trigramsOf,
  localMatchApproved,
  matchApproved,
  loadSharedMatcher,
  loadSharedParams,
};
