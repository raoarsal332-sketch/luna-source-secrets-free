'use strict';

/**
 * tools/compareChallenges.js - read-only FAQ comparison of two challenge/product names.
 * Uses the existing knowledge retriever only. Never invents product numbers.
 */

const T = require('../textUtils');
const gap = require('../knowledgeGapGate');

function createCompareChallenges(opts) {
  opts = opts || {};
  const retriever = opts.retriever;
  const maxChars = opts.maxChars || 500;
  const maxResults = opts.maxResults || 6;

  async function retrieveOne(q) {
    if (typeof retriever !== 'function') return [];
    try {
      const raw = await retriever(q, { limit: 3 });
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      if (Array.isArray(raw.results)) return raw.results;
      if (raw.block || raw.text) return [raw];
      return [];
    } catch (_) {
      return [];
    }
  }

  async function compare(a, b) {
    const A = T.stripHtml(a);
    const B = T.stripHtml(b);
    if (!A || !B) {
      return {
        ok: false,
        error: 'need a and b',
        a: A || '',
        b: B || '',
        results: [],
        same: [],
        different: [],
        guidance: 'Provide two challenge/product names to compare.',
        gap: true,
      };
    }

    if (typeof retriever !== 'function') {
      return {
        ok: false,
        error: 'knowledge retriever not wired',
        a: A,
        b: B,
        results: [],
        same: [],
        different: [],
        guidance: 'No approved FAQ available. Escalate or FAQ_CONFIRM. Do not invent figures.',
        gap: true,
      };
    }

    const queries = [A, B, `difference between ${A} and ${B}`, `${A} vs ${B}`];
    const seen = new Set();
    const results = [];
    for (const q of queries) {
      const hits = await retrieveOne(q);
      for (const r of hits) {
        const text = T.clip(T.stripHtml(r.text || r.block || r.answer || r.content || r.body || ''), maxChars);
        if (!text) continue;
        const title = r.title || r.question || 'Official FAQ';
        const key = `${title}|${text.slice(0, 100)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const score =
          typeof r.score === 'number'
            ? Number(r.score.toFixed(3))
            : typeof r.effective === 'number'
              ? Number(r.effective.toFixed(3))
              : typeof r.similarity === 'number'
                ? Number(r.similarity.toFixed(3))
                : undefined;
        results.push({ title, text, score });
        if (results.length >= maxResults) break;
      }
      if (results.length >= maxResults) break;
    }

    const classified = gap.classify(
      results.map((r) => ({ text: r.text, title: r.title, score: r.score != null ? r.score : 0.5 })),
      `${A} vs ${B}`
    );

    const same = [];
    const different = [];
    const aLow = A.toLowerCase();
    const bLow = B.toLowerCase();
    for (const r of results) {
      for (const s of T.sentences(r.text)) {
        const low = s.toLowerCase();
        const mentionsA = low.includes(aLow);
        const mentionsB = low.includes(bLow);
        if (!(mentionsA && mentionsB)) continue;
        const clipped = T.clip(s, 220);
        if (/\b(both|same|similar|also|as well|shared|identical|alike)\b/i.test(s)) same.push(clipped);
        else if (/\b(vs|versus|unlike|whereas|while|differ|difference|compared|instead|but|however)\b/i.test(s)) {
          different.push(clipped);
        } else {
          different.push(clipped);
        }
      }
    }
    const uniq = (arr) => [...new Set(arr)].slice(0, 6);

    const thin = !results.length || classified.level === 'none' || classified.level === 'partial';
    let guidance;
    if (!results.length) {
      guidance = 'No approved FAQ covers this comparison. Do not invent figures. Escalate or FAQ_CONFIRM.';
    } else if (thin) {
      guidance =
        'KB coverage is thin for this comparison. Answer only from returned FAQ text; escalate or FAQ_CONFIRM for missing numbers.';
    } else {
      guidance = 'Compare only using returned FAQ text. Do not invent product numbers or rules not present.';
    }

    return {
      ok: true,
      a: A,
      b: B,
      results,
      same: uniq(same),
      different: uniq(different),
      guidance,
      gap: thin,
    };
  }

  return { compare, spec };
}

const spec = {
  name: 'compare_challenges',
  description:
    'Compare two FundedElite challenge/product names using approved FAQ only (e.g. Lite vs Standard, 1-Step vs 2-Step, Instant vs Flash). Returns FAQ snippets plus same/different lines. Never invents numbers.',
  parameters: {
    type: 'object',
    properties: {
      a: { type: 'string', description: 'First challenge/product name' },
      b: { type: 'string', description: 'Second challenge/product name' },
    },
    required: ['a', 'b'],
  },
};

module.exports = { createCompareChallenges, spec };
