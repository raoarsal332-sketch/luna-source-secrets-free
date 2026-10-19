'use strict';
/**
 * imageEvidence.js - IMAGE_EVIDENCE_V1 (2026-09-28, owner-approved fix; live 215476135544728)
 *
 * Root cause this closes: a client screenshot reached the model as vision input, but NOTHING else in the
 * pipeline knew what the image said. The scope decision ran before the image was recorded, the "vision
 * hint" handed to the validators was the prompt text (never the image), read_image_facts parsed that same
 * prompt text, and the history the model and the follow-up turns saw had no trace of the screenshot. A
 * FundedElite website stats card + "What does that mean? On website can you please explain!" was therefore
 * judged as vague off-topic text, the draft's screenshot figure ("24hrs") failed UNSUPPORTED_NUMBER, and the
 * hold path sent the canned out-of-scope decline.
 *
 * This module is the single owner of "what the client's image shows":
 *   - extract(): ONE gpt-6-luna vision call (central MEDIUM reasoning / HIGH verbosity like every call) that
 *     returns the visible text and figures as JSON. Cached per attachment (upload id + hash), so regenerations,
 *     redelivered webhooks and follow-up turns reuse it. Any failure returns { ok:false } and never throws:
 *     the reply path continues with the image itself as vision input (no refusal is caused by a failed read).
 *   - evidenceText(): the plain evidence handed to the validators (policy-number audit, coverage check) and to
 *     read_image_facts. It contains ONLY what the image shows - never the prompt, history or FAQ text.
 *   - promptBlock(): the current-turn IMAGE EVIDENCE block with the general image-vs-policy rule.
 *   - findRecentImagePart(): the image a text-only follow-up may refer to (last N minutes / client turns).
 *   - historyNote(): a short marker so FULL TICKET HISTORY shows that a screenshot was sent and what it showed.
 * Nothing here writes Intercom or state files; the cache is in memory (re-extracted after a restart).
 */

const CACHE_MAX = 500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map(); // attachment key -> { at, facts }
const inflight = new Map(); // attachment key -> Promise<facts>

const RECENT_MAX_AGE_SEC = 30 * 60;
const RECENT_MAX_CLIENT_TURNS = 3;
// Production default 45s (the vision read at MEDIUM effort usually lands in 8-25s). Tests behind the model-test
// throttle can queue for minutes, so the harness may raise it with LUNA_IMAGE_EXTRACT_TIMEOUT_MS.
const EXTRACT_TIMEOUT_MS = Math.max(5000, Number(process.env.LUNA_IMAGE_EXTRACT_TIMEOUT_MS) || 45000);

function attKey(att) {
  const url = String((att && att.url) || '');
  const m = url.match(/\/i\/o\/[^/]+\/(\d{3,})\/([0-9a-f]{6,})\//i);
  if (m) return m[1] + '-' + m[2];
  return url.split('?')[0] || String((att && att.name) || '');
}
function keyOf(atts) { return (atts || []).map(attKey).filter(Boolean).join('|'); }

function now() { return Date.now(); }

function remember(key, facts) {
  if (!key || !facts || !facts.ok) return;
  cache.set(key, { at: now(), facts });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}
function cached(key) {
  const e = key && cache.get(key);
  if (!e) return null;
  if (now() - e.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  return e.facts;
}

const EXTRACT_SYSTEM =
  'You read customer-support screenshots for FundedElite (a proprietary trading firm) and report exactly what is visible. ' +
  'Do not answer the customer, do not judge whether anything is correct, and do not add facts that are not visible. ' +
  'Return ONLY one JSON object, no prose, with these keys:\n' +
  '{"visible_text": "all legible text in reading order, one line per visual line (max 1500 chars)",\n' +
  ' "figures": [{"value": "number exactly as shown incl. symbol/unit, e.g. $2.3M, 24hrs, 8%", "label": "the caption or field name it belongs to"}],\n' +
  ' "kind": "short type, e.g. website stats card, dashboard, checkout, email, error message, chart, meme, other",\n' +
  ' "summary": "one neutral sentence describing what the screenshot shows",\n' +
  ' "fundedelite_related": true if it shows FundedElite (its website, dashboard, checkout, emails, rules, trading platform or account) or plausibly prop-trading/FundedElite content, false if clearly unrelated (memes, other companies, personal photos),\n' +
  ' "unreadable": true only if the important text cannot be read}';

function clip(s, n) { const t = String(s == null ? '' : s).replace(/\s+\n/g, '\n').trim(); return t.length > n ? t.slice(0, n) : t; }

function parse(raw) {
  const s = String(raw || '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return { ok: false, why: 'no-json' };
  let j;
  try { j = JSON.parse(s.slice(a, b + 1)); } catch (_) { return { ok: false, why: 'bad-json' }; }
  const figures = (Array.isArray(j.figures) ? j.figures : [])
    .map((f) => ({ value: clip(f && f.value, 40), label: clip(f && f.label, 120) }))
    .filter((f) => f.value)
    .slice(0, 30);
  const visibleText = clip(j.visible_text, 1500);
  if (!visibleText && !figures.length) return { ok: false, why: 'empty' };
  return {
    ok: true,
    visibleText,
    figures,
    kind: clip(j.kind, 60),
    summary: clip(j.summary, 300),
    fundedeliteRelated: j.fundedelite_related === false ? false : (j.fundedelite_related === true ? true : null),
    unreadable: j.unreadable === true,
  };
}

/**
 * @param {object} p { openai, transport, modelConfig, model, conversationId, atts, toDataUrl }
 * @returns {Promise<object>} facts ({ ok:true, ... } or { ok:false, why })
 */
async function extract(p) {
  const atts = (p && p.atts) || [];
  const key = keyOf(atts);
  if (!key) return { ok: false, why: 'no-attachments' };
  // Test-only fault injection for the "read failed" fallback replay; never set in production.
  if (process.env.LUNA_IMAGE_EXTRACT_FORCE_FAIL === '1') { log('IMAGE_EVIDENCE fail', p.conversationId, 'forced-test'); return { ok: false, why: 'forced-test' }; }
  const hit = cached(key);
  if (hit) { log('IMAGE_EVIDENCE cached', p.conversationId, key.slice(0, 60)); return hit; }
  if (inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    const t0 = now();
    try {
      const urls = [];
      for (const att of atts) {
        const u = await p.toDataUrl(att);
        if (u) urls.push(u);
      }
      if (!urls.length) { log('IMAGE_EVIDENCE fail', p.conversationId, 'no-image-loaded'); return { ok: false, why: 'no-image-loaded' }; }
      const content = [{ type: 'text', text: 'Read the attached customer screenshot(s) and return the JSON object.' }]
        .concat(urls.map((u) => ({ type: 'image_url', image_url: { url: u } })));
      const call = p.transport.create(p.openai, {
        model: p.model,
        ...p.modelConfig.answerParams({ tools: false, purpose: 'image.extract', conversationId: p.conversationId, housekeeping: true }),
        conversationId: p.conversationId,
        episode: null,
        messages: [{ role: 'system', content: EXTRACT_SYSTEM }, { role: 'user', content }],
      });
      let timer;
      const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ __timeout: true }), p.timeoutMs || EXTRACT_TIMEOUT_MS); });
      const r = await Promise.race([call, timeout]);
      clearTimeout(timer);
      if (r && r.__timeout) {
        log('IMAGE_EVIDENCE fail', p.conversationId, 'timeout');
        // The read keeps running. A late result is cached and handed to onLate (the caller stores it as the
        // pre-send image evidence), so validators still recognise the screenshot's figures on this turn.
        Promise.resolve(call).then((late) => {
          const lf = parse((((late && late.choices && late.choices[0]) || {}).message || {}).content || '');
          if (!lf.ok) return;
          lf.key = key; lf.at = now(); remember(key, lf);
          log('IMAGE_EVIDENCE late-ok', p.conversationId, 'figures', lf.figures.length, 'ms', now() - t0);
          if (typeof p.onLate === 'function') { try { p.onLate(lf); } catch (_) { /* ignore */ } }
        }).catch(() => {});
        return { ok: false, why: 'timeout' };
      }
      const text = (((r && r.choices && r.choices[0]) || {}).message || {}).content || '';
      const facts = parse(text);
      if (facts.ok) {
        facts.key = key;
        facts.at = now();
        remember(key, facts);
        log('IMAGE_EVIDENCE ok', p.conversationId, 'figures', facts.figures.length, 'chars', facts.visibleText.length,
          'related', String(facts.fundedeliteRelated), 'ms', now() - t0);
      } else {
        log('IMAGE_EVIDENCE fail', p.conversationId, facts.why, 'ms', now() - t0);
      }
      return facts;
    } catch (e) {
      log('IMAGE_EVIDENCE fail', p.conversationId, 'error', e && e.message ? String(e.message).slice(0, 120) : 'unknown');
      return { ok: false, why: 'error' };
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}

function log(...a) { try { console.log(...a); } catch (_) {} }

/** Evidence text for validators / read_image_facts: ONLY what the image shows. */
function evidenceText(facts) {
  if (!facts || !facts.ok) return '';
  const lines = [];
  if (facts.figures.length) lines.push(facts.figures.map((f) => (f.label ? f.value + ' - ' + f.label : f.value)).join('\n'));
  if (facts.visibleText) lines.push(facts.visibleText);
  return lines.join('\n').trim();
}

function shortSummary(facts, max) {
  if (!facts || !facts.ok) return '';
  const figs = facts.figures.slice(0, 8).map((f) => (f.label ? f.value + ' ' + f.label : f.value)).join('; ');
  return clip((facts.summary ? facts.summary + (figs ? ' ' : '') : '') + (figs ? '(' + figs + ')' : ''), max || 400);
}

/**
 * Current-turn IMAGE EVIDENCE block for the model, with the general image-vs-policy rule.
 * @param {object} facts
 * @param {object} o { recent: bool (image came with an earlier client message), minutesAgo, payoutGuidance: string }
 */
function promptBlock(facts, o) {
  o = o || {};
  if (!facts || !facts.ok) {
    return '\n\nIMAGE EVIDENCE: the automatic read of the screenshot failed. ' +
      (o.recent ? 'The screenshot the client sent in an earlier message is attached again here; the latest text-only message most likely refers to it. ' : '') +
      'You still see the image itself: read it and answer from what is visible. Never refuse or decline only because the screenshot content is not in the knowledge base, and do not say you cannot read it when it is visible.';
  }
  const where = o.recent
    ? 'the screenshot the client sent in an earlier message' + (o.minutesAgo != null ? ' (' + o.minutesAgo + ' min ago)' : '') + '; the latest text-only message most likely refers to it'
    : 'the screenshot attached to the latest client message';
  let s = '\n\nIMAGE EVIDENCE (what ' + where + ' visibly shows; display evidence, not approved policy):\n' +
    (facts.summary ? 'Summary: ' + facts.summary + '\n' : '') +
    (facts.figures.length ? 'Figures:\n' + facts.figures.map((f) => '- ' + f.value + (f.label ? ' = ' + f.label : '')).join('\n') + '\n' : '') +
    (facts.visibleText ? 'Visible text:\n' + facts.visibleText + '\n' : '');
  s += 'HOW TO USE THE IMAGE EVIDENCE:\n' +
    '- Vague words in the client\'s message ("this", "that", "it", "what does that mean", "explain", "it is on the website") refer to this screenshot first, not to an older topic in the conversation.\n' +
    '- Explain what each visible item means in plain words. A figure shown in the screenshot may be restated as what the screenshot/website shows (say so, e.g. "the website shows ..."). Such a figure being absent from the knowledge base is not a reason to refuse, decline or escalate.\n' +
    '- If a figure in the screenshot differs from current support guidance (OFFICIAL FAQ CONTEXT or the approved facts), do NOT call the screenshot or website false, wrong or incorrect, and do NOT answer with a scope decline. Describe the screenshot figure as what it is (for example a website statistic or an average), then give the current support guidance, and present neither figure as a guaranteed deadline.\n' +
    (facts.fundedeliteRelated === false
      ? '- The automatic read judged this image unrelated to FundedElite. If that is clearly right, the normal FundedElite-only boundary applies.\n'
      : '- A screenshot of FundedElite (its website, dashboard, checkout, emails, rules) is FundedElite support content: answer it.\n');
  if (o.payoutGuidance) s += o.payoutGuidance + '\n';
  return s;
}

/** Owner-approved payout-processing guidance, added only when the image shows a payout-time figure. */
const PAYOUT_TIME_IMAGE_RE = /\bpayouts?\b[^\n]{0,60}\b(?:processing|time|speed|hours?|hrs?|days?)\b|\b(?:processing|payout)\s+time\b|\b\d+\s*(?:hrs?|hours?)\b[^\n]{0,60}\bpayouts?\b/i;
function payoutGuidanceFor(facts) {
  if (!facts || !facts.ok) return '';
  const ev = evidenceText(facts);
  if (!PAYOUT_TIME_IMAGE_RE.test(ev)) return '';
  return 'APPROVED PAYOUT-PROCESSING GUIDANCE (owner rule): a payout request takes on average around 72 business hours (roughly 3 business days) to be processed, and a manual Risk Team review can take longer. It is an average, never a guaranteed deadline. A different payout-time figure on the screenshot (e.g. a website "average payout processing time" statistic) is what that page displays: explain it as the displayed statistic/average, then give this current support guidance. Never call the website figure false and never promise either figure.';
}

const REFERENTIAL_RE = /\b(?:this|that|these|those|it|here|above|mean|means|meaning|explain|explanation|website|web\s?site|site|page|screenshot|screen\s?shot|image|picture|pic|photo|written|shown|showing|says|stats?|statistics?|figures?|numbers?)\b/i;
function isReferentialImageAsk(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 300) return false;
  return REFERENTIAL_RE.test(t);
}

function userPartHasImage(p, collect) {
  if (!p || !['user', 'lead'].includes((p.author || {}).type)) return false;
  try { return collect(p).length > 0; } catch (_) { return false; }
}

/**
 * The client part with image(s) that a text-only latest message may refer to: within RECENT_MAX_AGE_SEC and
 * at most RECENT_MAX_CLIENT_TURNS client messages back, before the latest message.
 */
function findRecentImagePart(parts, latestUser, collect, opt) {
  const o = Object.assign({ maxAgeSec: RECENT_MAX_AGE_SEC, maxClientTurns: RECENT_MAX_CLIENT_TURNS }, opt || {});
  const list = (parts || []).filter((p) => p && p.part_type !== 'note');
  const latestId = String((latestUser && latestUser.id) || '');
  const latestAt = Number((latestUser && latestUser.created_at) || Math.floor(now() / 1000));
  let turns = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (!['user', 'lead'].includes((p.author || {}).type)) continue;
    if (latestId && String(p.id || '') === latestId) continue;
    turns += 1;
    if (turns > o.maxClientTurns) return null;
    if (latestAt - Number(p.created_at || 0) > o.maxAgeSec) return null;
    if (userPartHasImage(p, collect)) return p;
  }
  return null;
}

/** Marker for FULL TICKET HISTORY on a client part that carried image(s). Sync; uses the cache only. */
function historyNote(part, collect) {
  let atts = [];
  try { atts = collect(part) || []; } catch (_) { atts = []; }
  if (!atts.length) return '';
  const facts = cached(keyOf(atts));
  const s = facts ? shortSummary(facts, 360) : '';
  return ' [client attached ' + (atts.length > 1 ? atts.length + ' screenshots' : 'a screenshot') + (s ? ': ' + s : '') + ']';
}

/** Anchors (figures / distinctive label words) of the image evidence found in a draft. */
/**
 * Fallback only (the extraction call failed and the model itself was given the screenshot): the model's own reading,
 * i.e. the sentences / bullets of its draft that present something AS what the screenshot / website shows. Figures
 * in sentences without that attribution are not taken, so policy numbers are still audited as before.
 */
const MODEL_READING_ATTR_RE = /\b(?:screenshots?|image|picture|websites?|site|web\s?page|card|banner|panel|dashboard|shows?|shown|showing|displays?|displayed|listed|says|reads)\b/i;
function modelReadingEvidence(draftBody) {
  const t = String(draftBody || '').replace(/<[^>]+>/g, ' ').replace(/\*\*/g, '');
  const units = t.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  const keep = units.filter((u) => MODEL_READING_ATTR_RE.test(u) && /\d/.test(u)).slice(0, 12);
  return keep.length ? clip(keep.join('\n'), 1200) : '';
}

function anchorsInDraft(draft, evText) {
  const d = String(draft || '').toLowerCase();
  const ev = String(evText || '');
  if (!d || !ev) return 0;
  let n = 0;
  const seen = new Set();
  for (const m of ev.matchAll(/\$?\d[\d,.]*\s*(?:[kmb]\b|%|hrs?\b|hours?\b|days?\b)?/gi)) {
    const core = m[0].toLowerCase().replace(/\s+/g, '');
    const digits = core.replace(/[^\d]/g, '');
    if (!digits || digits.length < 2 || seen.has(digits)) continue;
    seen.add(digits);
    if (d.replace(/\s+/g, '').includes(core) || d.replace(/[^\d]/g, ' ').split(/\s+/).includes(digits)) n += 1;
  }
  const STOP = new Set(['there', 'their', 'about', 'which', 'would', 'could', 'should', 'these', 'those', 'where', 'while', 'other']);
  const words = new Set((ev.toLowerCase().match(/[a-z]{5,}/g) || []).filter((w) => !STOP.has(w)));
  let w = 0;
  for (const x of words) if (d.includes(x)) w += 1;
  return n + Math.floor(w / 2);
}

function reset() { cache.clear(); inflight.clear(); }

module.exports = {
  modelReadingEvidence,
  extract, parse, evidenceText, promptBlock, payoutGuidanceFor, shortSummary, isReferentialImageAsk,
  findRecentImagePart, historyNote, anchorsInDraft, keyOf, attKey, cached, remember, reset,
  RECENT_MAX_AGE_SEC, RECENT_MAX_CLIENT_TURNS,
};
