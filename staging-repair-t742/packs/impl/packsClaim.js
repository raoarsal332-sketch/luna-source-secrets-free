'use strict';
/**
 * Packs claim. Reads the host-normalized string. Does not fold again,
 * does not call normalizeForDetect, and does not use packsProductHint.
 *
 * exclusive: Packs entity present and Atom entity absent.
 * both entities: kind none, spans empty.
 * shared: a selector word and no Packs entity. Atom alone is not a selector.
 * none: no entity and no selector word.
 * Evidence spans are offsets into `normalized`, and only on exclusive.
 */

const PACK_ENTITY = /\belite packs?\b|\bpacks?\b/gi;
const ATOM_ENTITY = /\batom\b/i;
const SELECTOR = /\b(?:discounts?|subscriptions?|refunds?|dashboard|elite|cards?|credits?|checkout|simulated)\b/i;

function packSpans(normalized) {
  const text = String(normalized || '');
  const spans = [];
  for (const m of text.matchAll(new RegExp(PACK_ENTITY.source, 'gi'))) {
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

function hasAtom(normalized) {
  return ATOM_ENTITY.test(String(normalized || ''));
}

function hasSelector(normalized) {
  return SELECTOR.test(String(normalized || ''));
}

function sameLetters(a, b) {
  return a.length === b.length && a.split('').sort().join('') === b.split('').sort().join('');
}

function packTypoSpans(host) {
  const spans = [];
  const re = /\b[a-z]{4,6}\b/g;
  for (const m of String(host || '').matchAll(re)) {
    const tok = m[0];
    if (tok === 'pack' || tok === 'packs') continue;
    if (/^(?:packet|package|packages|backpack|backpacks)$/.test(tok)) continue;
    const hit = sameLetters(tok, 'pack') || sameLetters(tok, 'packs');
    if (!hit) continue;
    spans.push({ start: m.index, end: m.index + tok.length });
  }
  return spans;
}

function claim({ text, normalized, prior }) {
  void text;
  const host = String(normalized || '');
  const spans = packSpans(host).concat(packTypoSpans(host));
  const atom = hasAtom(host);
  if (spans.length && atom) {
    return { kind: 'none', entity: null, evidenceSpans: [] };
  }
  if (spans.length) {
    return { kind: 'exclusive', entity: 'packs', evidenceSpans: spans };
  }
  const prev = Array.isArray(prior) ? prior.map((t) => String(t || '')).join('\n') : '';
  const anaphora = /\b(?:it|that|this|one|they|them)\b/.test(host) || /^\s*(?:and|also)\b/.test(host);
  if (!atom && prev && packSpans(prev).length && !hasAtom(prev) && anaphora) {
    return { kind: 'exclusive', entity: 'packs', evidenceSpans: [] };
  }
  if (hasSelector(host)) {
    return { kind: 'shared', entity: null, evidenceSpans: [] };
  }
  return { kind: 'none', entity: null, evidenceSpans: [] };
}

module.exports = {
  claim,
};
