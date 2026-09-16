'use strict';

const T = require('./textUtils');
function toMs(v) { if (!v) return null; if (typeof v === 'number') return v > 1e12 ? v : v * 1000; const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
function normalizeItem(raw, i) {
  if (!raw) return null;
  if (typeof raw === 'string') return { id: String(i), title: null, text: T.stripHtml(raw), code: null, starts_at: null, ends_at: null, active: true };
  const code = raw.code || raw.coupon || raw.promo_code || null;
  const text = T.stripHtml(raw.text || raw.body || raw.description || raw.message || raw.details || '');
  return { id: String(raw.id || raw.key || raw.slug || i), title: raw.title || raw.name || null, text, code: code ? String(code) : null, discount: raw.discount || raw.percent || raw.value || null, starts_at: toMs(raw.starts_at || raw.start || raw.from || raw.valid_from), ends_at: toMs(raw.ends_at || raw.end || raw.to || raw.valid_until || raw.expires_at), active: raw.active !== undefined ? !!raw.active : raw.enabled !== undefined ? !!raw.enabled : true, raw_keys: Object.keys(raw) };
}
function createPromoFeed(opts) {
  opts = opts || {};
  async function load() { let src = opts.source; if (typeof src === 'function') src = await src(); if (!src) return { items: [], sot_missing: true }; const arr = Array.isArray(src) ? src : Object.entries(src).map(([k, v]) => (v && typeof v === 'object' ? { id: k, ...v } : { id: k, text: String(v) })); return { items: arr.map(normalizeItem).filter(Boolean), sot_missing: false }; }
  async function getActive(now) { const t = now || Date.now(); const { items, sot_missing } = await load(); return { active: items.filter((p) => p.active && (!p.starts_at || p.starts_at <= t) && (!p.ends_at || p.ends_at >= t)), expired: items.filter((p) => p.ends_at && p.ends_at < t), sot_missing }; }
  async function find(query, now) { const { active, sot_missing } = await getActive(now); const q = T.tokens(query || ''); const scored = active.map((p) => ({ ...p, score: q.length ? T.overlapRatio(q, T.tokens(`${p.title || ''} ${p.text} ${p.code || ''}`)) : 1 })).sort((a, b) => b.score - a.score); return { matches: scored.filter((p) => p.score > 0), sot_missing }; }
  async function supportText(now) { const { active } = await getActive(now); return active.map((p) => `${p.title || ''} ${p.text} ${p.code ? `code ${p.code}` : ''} ${p.discount ? `${p.discount}` : ''}`).join('\n'); }
  return { load, getActive, find, supportText };
}
module.exports = { createPromoFeed, normalizeItem };
