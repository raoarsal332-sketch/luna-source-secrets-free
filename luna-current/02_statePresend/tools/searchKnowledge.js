'use strict';

/**
 * tools/searchKnowledge.js - thin, read-only wrapper over the EXISTING FAQ /
 * knowledge retrieval. It does not own a knowledge base.
 *
 * createSearchKnowledge({ retriever, maxResults, maxChars })
 *   retriever: async (query, { limit }) => results  (the live FAQ retrieve function)
 *
 * Returns narrow results plus confidence/coverage/conflict/gap signals from
 * knowledgeGapGate. Also feeds knowledgeGapAnalytics when provided.
 */

const gap = require('../knowledgeGapGate');
const T = require('../textUtils');

function createSearchKnowledge(opts) {
  opts = opts || {};
  const retriever = opts.retriever;
  const maxResults = opts.maxResults || 3;
  const maxChars = opts.maxChars || 600;
  const analytics = opts.knowledgeGapAnalytics || null;

  async function search(query, o) {
    o = o || {};
    const q = T.stripHtml(query);
    if (!q) return { ok: false, error: 'empty query', level: 'none', results: [] };
    if (typeof retriever !== 'function') return { ok: false, error: 'knowledge retriever not wired', level: 'none', results: [], gap: true };
    let raw;
    try { raw = await retriever(q, { limit: o.limit || maxResults }); } catch (e) { return { ok: false, error: `retriever failed: ${e.message}`, level: 'none', results: [] }; }
    const c = gap.classify(raw, q, opts.thresholds);
    const results = c.results.slice(0, o.limit || maxResults).map((r) => ({
      id: r.id, title: r.title || undefined, category: r.category || undefined, source: r.source || undefined,
      score: r.effective !== undefined ? Number(r.effective.toFixed(3)) : undefined,
      text: T.clip(r.text, maxChars),
    }));
    const out = {
      ok: true,
      query: q,
      level: c.level,
      confidence: c.confidence,
      coverage: c.coverage,
      conflict: c.conflict.conflict ? c.conflict.detail : null,
      gap: c.level === 'none' || c.level === 'partial',
      results,
      guidance: guidanceFor(c.level),
    };
    if (analytics && out.gap) { try { analytics.record(q, c.level, o.conversationId); } catch (_) { /* ignore */ } }
    return out;
  }

  return { search, spec };
}

function guidanceFor(level) {
  switch (level) {
    case 'supported': return 'Answer from these results only. Do not add figures that are not in them.';
    case 'partial': return 'Only part of the question is covered. Answer the covered part; for the rest say the team will confirm. Do not invent.';
    case 'conflicting': return 'Sources conflict. Do not pick one figure; say the team will confirm the exact detail.';
    default: return 'No approved knowledge covers this. Do not invent a rule, number or policy. Use the existing unknown/escalation behavior.';
  }
}

const spec = {
  name: 'search_knowledge',
  description: 'Search the approved FundedElite support knowledge. Returns the few most relevant entries with a confidence level (supported, partial, conflicting, none). Use before stating any rule, number or policy.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Short, specific question or topic' }, limit: { type: 'integer', minimum: 1, maximum: 5 } },
    required: ['query'],
  },
};

module.exports = { createSearchKnowledge, guidanceFor, spec };
