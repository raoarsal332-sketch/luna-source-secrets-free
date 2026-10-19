'use strict';
/**
 * Retrieve plausible catalog rows, filter by applicability, then let cosine rank.
 *
 * Applicability is structural:
 *   - typo-fold question tokens onto the catalog lexicon
 *   - a rare catalog stem in the question is an anchor every applicable body must state
 *   - a content token that no body states is an unstated concept (abstain)
 *   - among bodies that state every anchor, keep those with the highest
 *     question-token recall
 * Phrase surfaces still identify a covering set. They are intersected with the
 * structural set. They do not add a body that misses an anchor, and they are
 * not extended with new trigger strings.
 */

const fs = require('fs');
const path = require('path');

const approved = require('../../../staging-repair-t739/candidate/packs/packsApprovedAnswers');

const REFUSE_ID = 'packs.account-status.refuse.en';
const HANDOFF_ID = 'packs.handoff.unverified.en';
const STOP = new Set(
  'a an the of to in on for and or is are was were be been being do does did how what whats when where which who why can could would should will with from that this it its by at as if not no your you we our their per than then into about just also only once any all have has had but so them they my me i am im there here very really still already plz please yeah yes ok okay than one two plus'.split(/\s+/)
);
const TOPIC = new Set(['pack', 'elite', 'card', 'credit']);
const GENERIC = new Set(
  'number thing things list time mean much many single every always someone asked rough idea picture version screen menu section published live people everybody correct both plus inside where open opens opening someone someoneelse'.split(/\s+/)
);

let cache = null;

function stem(w) {
  const s = String(w || '');
  if (s.endsWith('ing') && s.length > 5) return s.slice(0, -3);
  if (s.endsWith('ed') && s.length > 4) return s.slice(0, -2);
  if (s.endsWith('es') && s.length > 4) return s.slice(0, -2);
  if (s.endsWith('s') && !s.endsWith('ss') && s.length > 3) return s.slice(0, -1);
  return s;
}

function tokens(s) {
  return String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function damerau1(a, b) {
  if (a === b) return true;
  if (!a || !b || a[0] !== b[0] || a.length < 5 || b.length < 5) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    for (let i = 0; i < a.length - 1; i += 1) {
      if (a[i] === b[i]) continue;
      return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
    }
    return false;
  }
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let i = 0;
  let j = 0;
  let skips = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) { i += 1; j += 1; }
    else { skips += 1; j += 1; if (skips > 1) return false; }
  }
  return skips <= 1;
}

function concealed(text) {
  const s = String(text || '');
  if (/[a-z][@^#*~][a-z0-9]|[a-z0-9][@^#*~][a-z]/i.test(s)) return true;
  for (const tok of s.match(/[\p{L}\p{N}]+/gu) || []) {
    if (/[a-z]/i.test(tok) && /\d/.test(tok) && !/^\d+k$/i.test(tok) && !/^x\d+$/i.test(tok)) return true;
  }
  return false;
}

function contentStems(text, fold) {
  const out = [];
  for (const tok of tokens(text)) {
    let s = stem(tok);
    if (fold) s = fold(s, tok);
    if (!s || s.length < 3 || STOP.has(s) || GENERIC.has(s)) continue;
    out.push(s);
  }
  return out;
}

function productRows() {
  return approved.load().all.filter((row) => {
    if (!row.sendable) return false;
    if (row.id === REFUSE_ID || row.id === HANDOFF_ID) return false;
    const tags = row.intentTags || [];
    if (tags.includes('accountStatusBoundary') || tags.includes('handoff')) return false;
    return true;
  });
}

function loadFacts() {
  const file = path.join(__dirname, 'packs-propositions.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(data.facts) ? data.facts : [];
}

function phraseStems(phrase) {
  return contentStems(phrase, null);
}

function build() {
  if (cache) return cache;
  const df = new Map();
  const bodies = new Map();
  const rows = productRows();
  for (const row of rows) {
    const stems = new Set(contentStems(row.body, null));
    bodies.set(row.id, stems);
    for (const t of stems) df.set(t, (df.get(t) || 0) + 1);
  }
  const vocab = [...df.keys()];
  const facts = loadFacts();
  cache = { df, bodies, vocab, facts, rows };
  return cache;
}

function foldStem(s) {
  const { df, vocab } = build();
  if (df.has(s)) return s;
  if (s.length < 5) return s;
  let best = null;
  for (const v of vocab) {
    if (v[0] !== s[0]) continue;
    if (!damerau1(s, v)) continue;
    if (best) return s;
    best = v;
  }
  return best || s;
}

function tokensNear(text, need, window) {
  const seq = contentStems(text, (s) => foldStem(s));
  const want = [...new Set(need)];
  for (let i = 0; i < seq.length; i += 1) {
    const got = new Set();
    for (let j = i; j < seq.length && j < i + window; j += 1) {
      if (want.includes(seq[j])) got.add(seq[j]);
    }
    if (got.size === want.length) return true;
  }
  return false;
}

function factTriggered(fact, text, qset, mode) {
  const any = Array.isArray(fact.any) ? fact.any : [];
  const all = Array.isArray(fact.all) ? fact.all : [];
  if (mode !== 'soft') {
    if (any.length && any.some((phrase) => text.includes(phrase))) {
      if (!all.length || all.every((phrase) => text.includes(phrase))) return true;
    }
    if (mode === 'substring') return false;
  }
  if (!qset || !qset.size) return false;
  const anyOk = any.some((phrase) => {
    const need = phraseStems(phrase);
    const distinctive = need.filter((t) => !TOPIC.has(t));
    if (need.length < 2 || distinctive.length < 1) return false;
    if (!need.every((t) => qset.has(t))) return false;
    return tokensNear(text, need, need.length + 3);
  });
  if (!anyOk && any.length) return false;
  if (all.length && !all.every((phrase) => phraseStems(phrase).every((t) => qset.has(t)))) return false;
  return anyOk || (!any.length && all.length);
}

function phraseCovered(text, qset, bodies, mode) {
  const { facts } = build();
  const triggered = facts.filter((fact) => factTriggered(fact, text, qset, mode));
  if (!triggered.length) return new Set();
  const ids = new Set();
  for (const id of bodies.keys()) {
    if (triggered.every((fact) => Array.isArray(fact.statedBy) && fact.statedBy.includes(id))) ids.add(id);
  }
  return ids;
}

function analyze(normalized) {
  const text = String(normalized || '');
  const empty = { ids: new Set(), anchors: [], ungrounded: [], anchorMiss: false };
  if (concealed(text)) return empty;
  const { df, bodies } = build();
  const stems = [...new Set(contentStems(text, (s) => foldStem(s)))];
  const ungrounded = stems.filter((t) => !df.has(t) && t.length >= 4);
  const grounded = stems.filter((t) => df.has(t));
  const anchors = grounded.filter((t) => (df.get(t) || 0) <= 3);
  let pool = [...bodies.keys()];
  if (anchors.length) pool = pool.filter((id) => anchors.every((a) => bodies.get(id).has(a)));
  if (anchors.length && !pool.length) return { ids: new Set(), anchors, ungrounded, anchorMiss: true };
  const recall = (id) => {
    const b = bodies.get(id);
    let n = 0;
    for (const t of grounded) if (b.has(t)) n += 1;
    return n;
  };
  if (!pool.length) return empty;
  const best = Math.max(...pool.map(recall));
  if (!anchors.length && best < 2) return { ids: new Set(), anchors, ungrounded, anchorMiss: false };
  if (best < 1) return { ids: new Set(), anchors, ungrounded, anchorMiss: false };
  return {
    ids: new Set(pool.filter((id) => recall(id) === best)),
    anchors,
    ungrounded,
    anchorMiss: false,
  };
}

function applicableIds(normalized) {
  const text = String(normalized || '');
  if (concealed(text)) return new Set();
  const { bodies } = build();
  const qset = new Set(contentStems(text, (s) => foldStem(s)));
  const structural = analyze(text);
  const substringIds = phraseCovered(text, qset, bodies, 'substring');
  if (substringIds.size) return substringIds;
  if (structural.ungrounded.length >= 2 || structural.anchorMiss) return new Set();
  const softIds = phraseCovered(text, qset, bodies, 'soft');
  if (softIds.size) return softIds;
  if (structural.anchors.length && structural.ids.size === 1 && structural.ungrounded.length <= 1) return structural.ids;
  return new Set();
}

function bodyCovers(normalized, partId) {
  return applicableIds(normalized).has(partId);
}

function clearCache() {
  cache = null;
}

module.exports = {
  bodyCovers,
  applicableIds,
  analyze,
  clearCache,
  stem,
  damerau1,
};
