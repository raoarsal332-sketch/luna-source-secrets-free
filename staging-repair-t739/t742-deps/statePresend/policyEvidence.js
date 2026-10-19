'use strict';

/**
 * Policy-number audit against retrieved evidence and conversation context.
 * Customer-suggested figures are not policy authority. An exception that appears
 * in an article is not applicable unless the conversation confirms its condition.
 */

const T = require('./textUtils');
const gap = require('./knowledgeGapGate');

const POLICY_UNITS = new Set(['minute', 'min', 'second', 'sec', 'hour', 'hr', 'day', 'week', 'month', '%', 'percent']);
const TIME_SECONDS = {
  second: 1, sec: 1, minute: 60, min: 60, hour: 3600, hr: 3600,
  day: 86400, week: 604800, month: 2592000,
};

const NON_DISCRIMINATIVE = new Set([
  'free', 'retry', 'challenge', 'challenges', 'step', 'lite', 'instant',
  'flash', 'catalyst', 'elite', 'standard', 'account', 'accounts', 'phase', 'stage', 'live', 'funded',
  'trading', 'trade', 'trades', 'plan', 'size', 'sizes', 'select', 'selected', 'selectable', 'option', 'options',
]);

const POLICY_ASK_RE = /\b(?:is (?:the|it|this)|minimum|maximum|required|rule|policy|holding\s+time|profit\s+split|drawdown|limit|target)\b/i;
const ADDON_RE = /\bscalp(?:ing)?\s+add[-\s]?on\b|\badd[-\s]?on\b/i;
const ADDON_DENY_RE = /\b(?:do not|don't|dont|does not|doesn't|without|no|not)\b[^.?!]{0,48}\b(?:scalp(?:ing)?\s+add[-\s]?on|add[-\s]?on)\b|\b(?:scalp(?:ing)?\s+add[-\s]?on|add[-\s]?on)\b[^.?!]{0,48}\b(?:not|never|don't|do not|wasn't|was not)\b/i;
const ADDON_CONFIRM_RE = /\b(?:i have|we have|i purchased|i bought|i selected|i enabled|with (?:the )?)\b[^.?!]{0,48}\b(?:scalp(?:ing)?\s+add[-\s]?on)\b|\b(?:scalp(?:ing)?\s+add[-\s]?on)\b[^.?!]{0,36}\b(?:selected|enabled|purchased|bought|active|included)\b/i;
const APPLIES_TO_CLIENT_RE = /\b(?:your|this)\s+account\b|\bfor you\b|\b(?:your|the)\s+minimum\b/i;

function canonUnitName(u) {
  const x = String(u || '').toLowerCase().replace(/s$/, '');
  if (x === 'percent') return '%';
  if (x === 'min') return 'minute';
  if (x === 'sec') return 'second';
  if (x === 'hr') return 'hour';
  return x;
}

function toSeconds(value, unit) {
  const n = Number(value);
  const u = canonUnitName(unit);
  if (!Number.isFinite(n) || TIME_SECONDS[u] == null) return null;
  return n * TIME_SECONDS[u];
}

function contextWords(text, raw) {
  const t = String(text || '');
  const idx = t.toLowerCase().indexOf(String(raw || '').toLowerCase());
  if (idx < 0) return new Set();
  const win = t.slice(Math.max(0, idx - 80), Math.min(t.length, idx + String(raw).length + 80));
  return new Set(T.tokens(win).map((w) => T.stem(w)).filter((w) => !NON_DISCRIMINATIVE.has(w)));
}

/**
 * Which FundedElite product a figure is talking about. NON_DISCRIMINATIVE deliberately strips
 * product words from the context comparison, which made "Instant 6% max loss" and "2-Step 8%
 * max loss" look like the same fact stated two different ways: both reduce to {max, loss}. The
 * draft was then reported as contradicting the evidence and the customer got silence. Product
 * identity is read separately here and used only to VETO a relation, never to create one, so a
 * genuine same-product contradiction is still caught.
 */
// PRODUCT_SCOPE_V2 (2026-09-24, live Bot-test 215476082100892): product identity is CONCRETE.
// The old model had separate "lite" / "2step" / "instant" markers and picked the nearest keyword
// before a figure across the WHOLE text. Three failures followed from that, all on correct
// drafts: (1) a Catalyst bullet saying "single-stage instant-funded account" re-attributed every
// later Catalyst figure (80%, 8%, 10%) to Instant; (2) facts in an evidence article whose body
// never names its product inherited the product of the PREVIOUS article in the block; (3)
// "2-Step Lite" produced two different ids depending on word order. The comparison was then held
// as UNSUPPORTED_NUMBER and the customer got silence twice.
//
// Each marker now maps to the set of concrete products it can mean. A family word ("Lite",
// "2-Step", "Free Retry") is compatible with each of its members; two attributions clash only when
// their concrete sets are disjoint. Descriptive uses ("instant-funded", "instant payout") are not
// product names.
const CONCRETE = {
  'lite-2-step': ['L2'], 'lite-1-step': ['L1'], 'fr-2-step': ['F2'], 'fr-1-step': ['F1'],
  lite: ['L1', 'L2'], '2step': ['L2', 'F2'], '1step': ['L1', 'F1'], 'free-retry': ['F1', 'F2'],
  instant: ['I'], flash: ['FL'], catalyst: ['C'],
};
const PRODUCT_MARKERS = [
  ['lite-2-step', /\b(?:(?:2|two)[\s-]*step(?:\s+challenge)?\s+lite|lite\s+(?:(?:2|two)[\s-]*step))\b/i],
  ['lite-1-step', /\b(?:(?:1|one)[\s-]*step(?:\s+challenge)?\s+lite|lite\s+(?:(?:1|one)[\s-]*step))\b/i],
  ['fr-2-step', /\b(?:2|two)[\s-]*step(?:\s+challenge)?\s*(?:\+|with|and|&)?\s*(?:a\s+)?(?:free[\s-]*retry|second\s+chance)\b/i],
  ['fr-1-step', /\b(?:1|one)[\s-]*step(?:\s+challenge)?\s*(?:\+|with|and|&)?\s*(?:a\s+)?(?:free[\s-]*retry|second\s+chance)\b/i],
  ['lite', /\blite\b/i],
  ['2step', /\b(?:2|two)[\s-]*step\b/i],
  ['1step', /\b(?:1|one)[\s-]*step\b/i],
  ['free-retry', /\bfree[\s-]*retry\b/i],
  ['instant', /\binstant\b(?![\s-]*(?:funded|funding|payouts?|withdrawals?|access|activation|approval|delivery)\b)/i],
  ['flash', /\bflash\b/i],
  ['catalyst', /\bcatalyst\b/i],
];
/** Canonical-KB product ids (entry.product / PRODUCT: lines) to marker ids. */
const KB_PRODUCT = {
  'lite-2-step': 'lite-2-step', 'lite-1-step': 'lite-1-step', '2-step': 'fr-2-step', '1-step': 'fr-1-step',
  instant: 'instant', 'instant-elite': 'instant', flash: 'flash', catalyst: 'catalyst',
};

function concreteOf(id) { return CONCRETE[id] || []; }
function compatible(a, b) {
  const A = concreteOf(a);
  const B = concreteOf(b);
  if (!A.length || !B.length) return true;
  return A.some((x) => B.indexOf(x) !== -1);
}

/** Every product marker occurrence; a match inside a longer match ("Lite" in "2-Step Lite") is dropped. */
function productMatches(text) {
  const t = String(text || '');
  const all = [];
  for (const [id, re] of PRODUCT_MARKERS) {
    const rx = new RegExp(re.source, 'gi');
    let m;
    while ((m = rx.exec(t)) !== null) {
      all.push({ id, pos: m.index, end: m.index + m[0].length });
      if (m.index === rx.lastIndex) rx.lastIndex += 1;
    }
  }
  return all.filter((a) => !all.some((b) => b !== a && b.pos <= a.pos && b.end >= a.end && (b.end - b.pos) > (a.end - a.pos)))
    .sort((a, b) => a.pos - b.pos);
}

function productsIn(text) {
  return new Set(productMatches(text).map((m) => m.id));
}

/**
 * Structured attribution for a figure: which product and which stage it belongs to.
 *
 * Attribution reads the nearest product/stage marker appearing BEFORE the figure, but never
 * across an article boundary. Evidence arrives as articles ("TITLE: ..." lines, optionally with a
 * "PRODUCT: <kb id>" line). Inside an article whose product is known from its metadata or its
 * title, every figure belongs to that product - body wording ("instant funded", "Instant Elite
 * additionally offers") cannot move it. Text with no TITLE lines (a draft) is one segment.
 */
const STAGE_MARKERS = [
  ['phase1', /\bphase\s*1\b|\bfirst\s+phase\b/i],
  ['phase2', /\bphase\s*2\b|\bsecond\s+phase\b/i],
  ['live', /\blive\s+(?:phase|stage|account)\b|\bfunded\s+(?:phase|stage|account)\b/i],
  ['evaluation', /\bevaluation\s+(?:phase|stage)\b/i],
];

function segmentsOf(text) {
  const t = String(text || '');
  const rx = /^[ \t]*TITLE:[ \t]*(.*)$/gm;
  const segs = [];
  let m;
  while ((m = rx.exec(t)) !== null) segs.push({ start: m.index, title: m[1] });
  if (!segs.length || segs[0].start > 0) segs.unshift({ start: 0, title: '' });
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    s.end = i + 1 < segs.length ? segs[i + 1].start : t.length;
    const head = t.slice(s.start, Math.min(s.end, s.start + 600));
    const pm = s.title ? head.match(/^[ \t]*PRODUCT:[ \t]*([a-z0-9-]+)/im) : null;
    let product = pm ? (KB_PRODUCT[pm[1].toLowerCase()] || null) : null;
    if (!product && s.title) {
      const ids = [...productsIn(s.title)];
      if (ids.length === 1) product = ids[0];
    }
    s.product = product;
  }
  return segs;
}

// Marker positions are computed once per text and reused: a figure like "6%" can occur many
// times in a multi-article evidence block, and each occurrence needs its own attribution.
const _markerCache = new Map();

function markerPositions(text) {
  const hit = _markerCache.get(text);
  if (hit) return hit;
  const stages = [];
  for (const [id, re] of STAGE_MARKERS) {
    const rx = new RegExp(re.source, 'gi');
    let m;
    while ((m = rx.exec(text)) !== null) {
      stages.push({ id, pos: m.index });
      if (m.index === rx.lastIndex) rx.lastIndex += 1;
    }
  }
  stages.sort((a, b) => a.pos - b.pos);
  const value = { products: productMatches(text), stages, segments: segmentsOf(text) };
  if (_markerCache.size > 8) _markerCache.clear();
  _markerCache.set(text, value);
  return value;
}

function lastBefore(list, idx, from) {
  let best = null;
  for (const entry of list) {
    if (entry.pos > idx) break;
    if (from != null && entry.pos < from) continue;
    best = entry.id;
  }
  return best;
}

/**
 * Attribution for EVERY occurrence of a value in the text.
 *
 * Attributing by the first occurrence alone was wrong: the approved knowledge states "6%" under
 * several products, so the correct Instant figure inherited the attribution of an unrelated
 * earlier "6%" and a correct answer was reported unsupported. A value counts as being about a
 * product when ANY of its occurrences sits under that product.
 */
// EXAMPLE_NOT_RULE_V1: an occurrence inside an illustration ("For example, if your account has a 5% daily drawdown").
const EXAMPLE_CLAUSE_RE = /\bfor\s+example\b|\bfor\s+instance\b|\be\.g\.|\bexample\s*:|\bsuppose\b|\bimagine\b|\blet'?s\s+say\b/i;
function attributionsOf(text, raw) {
  const t = String(text || '');
  const needle = String(raw || '').toLowerCase().trim();
  if (!needle) return [{ product: null, stage: null }];
  const { products, stages, segments } = markerPositions(t);
  const lower = t.toLowerCase();
  const out = [];
  let from = 0;
  while (out.length < 40) {
    const idx = lower.indexOf(needle, from);
    if (idx < 0) break;
    const seg = segments.find((s) => idx >= s.start && idx < s.end) || { start: 0, product: null };
    // A stage qualifier applies to its own clause (sentence, or list item plus the list header),
    // never to later lines: "Phase 2 target: no Phase 2" must not make the next bullet a Phase 2 fact.
    const cb = clauseBounds(t, idx);
    let stage = lastBefore(stages, idx, Math.max(seg.start, cb.bullet ? cb.itemStart : cb.start));
    if (!stage && cb.bullet && cb.headerStart >= seg.start) stage = lastBefore(stages, cb.headerEnd, cb.headerStart);
    const example = EXAMPLE_CLAUSE_RE.test(t.slice(cb.bullet ? cb.headerStart : cb.start, cb.end));
    out.push({ product: seg.product || lastBefore(products, idx, seg.start), stage, metric: metricAt(t, idx, raw), example });
    from = idx + needle.length;
  }
  return out.length ? out : [{ product: null, stage: null }];
}

// METRIC_SCOPE_V1 (2026-09-24): a figure is only evidence about the SAME metric. Without this,
// "2-Step Lite has a 5% daily loss limit" (KB: 4%) was "supported" by Lite's 5% Phase 2 target,
// "Instant requires 7 profitable days" (KB: 4) by Instant's 7-day payout-interval option, and a
// 8% Phase 2 target by an 8% max-loss option - and, the other way round, figures of two different
// metrics that happened to share context words were reported as contradicting each other.
// A figure's metric is the closest metric term inside its own clause: its sentence, or for a list
// item the whole list including the list's header line. Unknown stays unknown (no veto).
const METRIC_TERMS = [
  // METRIC_ATTACH_MODIFIER_V1 (2026-09-28): "0.5% profit per day" is the daily P&L threshold (the FAQ says
  // "positive P&L of at least 0,5%"); without this term the nearest term was "profitable days" (minDays).
  ['dailyPnl', /\bP\s*(?:&amp;|&)\s*L\b|\bPnL\b|\bpositive\s+(?:p|profit)\b|\b(?:profit|gain)s?\s+(?:per|each|every|on\s+each|a)\s+(?:profitable\s+|trading\s+)?day\b|\bdaily\s+(?:profit|gain)\b|\bper[- ]day\s+(?:profit|gain)\b/gi],
  // LITE1_MLL_V1 (2026-09-28): "The daily limit is fixed at 3%, and the max loss limit is 6%" gave 3% the metric
  // maxLoss (nearest term after) -> false UNSUPPORTED_NUMBER. "daily limit" names the daily loss limit.
  ['dailyLoss', /\bdaily\s+(?:loss|drawdown)\b|\bDLL\b|\bdaily\s+limits?\b/gi],
  ['maxLoss', /\bmax(?:imum)?\s+(?:loss|drawdown)\b|\bMLL\b|\b(?:overall|total)\s+(?:loss|drawdown)\b|\btrailing\s+drawdown\b/gi],
  ['profitTarget', /\bprofit\s+targets?\b|\btargets?\b/gi],
  ['profitSplit', /\bprofit\s+split\b|\bsplits?\b/gi],
  ['consistency', /\bconsisten\w*/gi],
  ['payoutCadence', /\bbetween\s+payouts\b|\bpayout\s+(?:cycle|interval|frequency|cadence)\b|\brequestable\s+after\b|\brequested\s+after\b|\bevery\s+\d+\s+days\b/gi],
  // Plural only: "complete a trading day" names the unit a P&L threshold applies to, not a count.
  ['minDays', /\b(?:profitable|trading)\s+(?:trading\s+)?days\b|\bdays\s+of\s+trading\b|\bminimum\s+(?:number\s+of\s+)?(?:trading\s+)?days\b/gi],
  ['holdingTime', /\bholding\s+time\b|\bheld\s+for\b|\bhold\s+(?:a\s+)?(?:trade|position)s?\b/gi],
  ['riskLimit', /\brisk\s+limits?\b|\bsingle\s+instrument\b|\bone\s+instrument\b/gi],
  // SOFT_BREACH_RESET_FEE_V1 (2026-09-29): reset-fee ladder (40% then double) must not share a
  // metric with Strategy Risk's "50% of daily loss" threshold — otherwise a correct 50% draft was
  // related to evidence 40% via shared context words and silenced as UNSUPPORTED_NUMBER.
  ['resetFee', /\bchallenge\s+(?:fee|cost)\b|\breset\s+fee\b|\boriginal\s+challenge\s+cost\b|\bfirst\s+reset\b|\bsecond\s+reset\b|\bthird\s+reset\b|\breset\s+costs?\b|\breset\s+will\s+incur\b/gi],
];
const PCT_METRICS = new Set(['dailyPnl', 'dailyLoss', 'maxLoss', 'profitTarget', 'profitSplit', 'consistency', 'riskLimit', 'resetFee']);
const TIME_METRICS = new Set(['payoutCadence', 'minDays', 'holdingTime']);
const BULLET_LINE_RE = /^\s*(?:[-*•]|\d+[.)])\s+/;

function clauseBounds(text, idx) {
  const t = String(text || '');
  const lineStart = t.lastIndexOf('\n', idx - 1) + 1;
  let lineEnd = t.indexOf('\n', idx);
  if (lineEnd < 0) lineEnd = t.length;
  const line = t.slice(lineStart, lineEnd);
  if (BULLET_LINE_RE.test(line)) {
    // A bare list item ("- 6%") belongs to the list header above it.
    let s = lineStart;
    while (s > 0) {
      const prevStart = t.lastIndexOf('\n', s - 2) + 1;
      const prev = t.slice(prevStart, s - 1);
      s = prevStart;
      if (!prev.trim() || !BULLET_LINE_RE.test(prev)) break;
    }
    // s is now the start of the list header line (the first non-item line above the list).
    const headerEnd = t.indexOf('\n', s);
    return { start: s, end: lineEnd, bullet: true, itemStart: lineStart, headerStart: s, headerEnd: headerEnd < 0 ? t.length : headerEnd };
  }
  // Plain prose: the sentence around the figure, within the line.
  const before = t.slice(lineStart, idx);
  const sb = Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '), before.lastIndexOf('; '));
  const start = sb >= 0 ? lineStart + sb + 2 : lineStart;
  const after = t.slice(idx, lineEnd);
  const se = after.search(/[.!?;](?:\s|$)/);
  return { start, end: se >= 0 ? idx + se + 1 : lineEnd, bullet: false };
}

function metricAt(text, idx, raw) {
  const r = String(raw || '');
  for (const [id, re] of METRIC_TERMS) if (new RegExp(re.source, 'i').test(r)) return id;
  const t = String(text || '');
  const b = clauseBounds(t, idx);
  // Own list item first ("- Phase 2: 5% target"), then the whole clause (header included).
  // A list item sees itself, then its list header - never its sibling items.
  const isPct = /%|percent/i.test(r);
  const isTime = /\b(?:minute|min|second|sec|hour|hr|day|week|month)s?\b/i.test(r);
  // RISK_OF_DLL_V1 (2026-09-29): "N% of the/your daily loss limit" with risk/instrument context is the
  // Strategy Risk threshold (riskLimit), not the daily-loss figure itself. Drafts often tag riskLimit
  // ("one instrument" before the figure) while the approved-internal card tagged dailyLoss (DLL phrase
  // nearer after) — attributionClash then let evidence 40% falsely contradict the correct 50%.
  const fullClause = t.slice(b.bullet ? b.headerStart : b.start, b.end);
  if (
    isPct &&
    /\bof\s+(?:the\s+|your\s+|a\s+)?daily\s+(?:loss|drawdown)\b/i.test(fullClause) &&
    /\b(?:risk(?:ing)?|instrument|pair|symbol)\b/i.test(fullClause)
  ) {
    return 'riskLimit';
  }
  const scopes = b.bullet ? [[b.itemStart, b.end], [b.headerStart, b.headerEnd]] : [[b.start, b.end]];
  for (const [s, e] of scopes) {
    const win = t.slice(s, e);
    // For the header scope the figure lies after the window: every term there counts as "before".
    const at = Math.min(idx, e) - s;
    const figEnd = at + r.length;
    // 1) a term attached right after the figure ("5% target", "25% consistency", "0.5% positive P&L");
    // 2) otherwise the nearest term before it in the clause ("daily loss limit of 5%");
    // 3) otherwise the nearest term after it in the clause.
    let attached = null, before = null, after = null;
    for (const [id, re] of METRIC_TERMS) {
      // METRIC_UNIT_COMPAT_V1 (2026-09-28): a day/time figure can't be a percentage metric and a % figure can't
      // be a day-count metric. "The first payout uses a 70% split and can be requested after 21 days" gave
      // 21 days the metric profitSplit (nearest term) -> clash with the FAQ -> false UNSUPPORTED_NUMBER.
      if (isPct ? TIME_METRICS.has(id) : (isTime && PCT_METRICS.has(id))) continue;
      const rx = new RegExp(re.source, 'gi');
      let m;
      while ((m = rx.exec(win)) !== null) {
        const mEnd = m.index + m[0].length;
        if (m.index < figEnd && mEnd > at) continue; // overlaps the figure itself
        if (mEnd <= at) {
          if (!before || at - mEnd < before.dist) before = { id, dist: at - mEnd };
        } else {
          const gapText = win.slice(figEnd, m.index);
          // A value series shares its trailing metric: in "6%, 8%, or 10% max loss" every value is max loss.
          // METRIC_ATTACH_MODIFIER_V1 (2026-09-28, Instant comparison false positive): "6% trailing max loss" /
          // "3% fixed daily loss" - one or two plain modifier words between the figure and its metric noun still
          // attach it. Without this, "a 3% daily loss limit and 6% trailing max loss" gave 6% the metric of the
          // PRECEDING clause (dailyLoss), clashed with the FAQ's 6% max loss and was reported UNSUPPORTED_NUMBER.
          const modifierGap = /^[\s*_]*(?:(?!(?:and|or|with|of|for|to|the|a|an|in|on|at|than|per|each|is|are|but|while)\b)[a-z][a-z-]{1,13}[\s*_]+){1,2}$/i.test(gapText);
          if (/^[\s*_]*$/.test(gapText) || /^(?:[\s*_]*,?\s*(?:or|and)?\s*[\s*_]*\d+(?:[.,]\d+)?\s*%[\s*_]*)+$/i.test(gapText)) attached = { id };
          else if (modifierGap && !attached) attached = { id };
          else if (!after || m.index - figEnd < after.dist) after = { id, dist: m.index - figEnd };
        }
      }
    }
    const best = attached || before || after;
    if (best) return best.id;
  }
  return null;
}

/** Metric for every occurrence of a value (parallel to attributionsOf). */
function metricsOf(text, raw) {
  const t = String(text || '');
  const needle = String(raw || '').toLowerCase().trim();
  const out = [];
  if (!needle) return out;
  const lower = t.toLowerCase();
  let from = 0;
  while (out.length < 40) {
    const idx = lower.indexOf(needle, from);
    if (idx < 0) break;
    out.push(metricAt(t, idx, raw));
    from = idx + needle.length;
  }
  return out;
}

// Only an explicit phase genuinely changes a policy value (Phase 1 target vs Phase 2 target).
// "live phase" and "evaluation" are usually descriptive prose - "Instant is composed only of a
// live phase, with a 3% daily loss limit" - and treating them as a stage qualifier excluded the
// correct Instant evidence and flagged a correct figure.
const PHASE_STAGES = new Set(['phase1', 'phase2']);

function pairClashes(a, b) {
  if (a.metric && b.metric && a.metric !== b.metric) return true;
  if (a.product && b.product && !compatible(a.product, b.product)) return true;
  if (a.stage && b.stage && a.stage !== b.stage &&
      PHASE_STAGES.has(a.stage) && PHASE_STAGES.has(b.stage)) return true;
  return false;
}

/** Clash only when NO occurrence on either side could be talking about the same thing. */
function attributionClash(aList, bList) {
  for (const a of aList) for (const b of bList) if (!pairClashes(a, b)) return false;
  return true;
}

/** True only when both sides name products and none of them can be the same concrete product. */
function productsConflict(aWin, bWin) {
  const a = [...productsIn(aWin)];
  const b = [...productsIn(bWin)];
  if (!a.length || !b.length) return false;
  return !a.some((x) => b.some((y) => compatible(x, y)));
}

function sameKnownMetric(aList, bList) {
  return aList.some((a) => a.metric && a.product && bList.some((b) => b.metric === a.metric && b.product && compatible(a.product, b.product)));
}

function sharedCount(a, b) {
  let n = 0;
  for (const w of a) if (b.has(w)) n += 1;
  return n;
}

function windowOf(text, raw) {
  const t = String(text || '');
  const idx = t.toLowerCase().indexOf(String(raw || '').toLowerCase());
  if (idx < 0) return t;
  return t.slice(Math.max(0, idx - 90), Math.min(t.length, idx + String(raw).length + 90));
}

// IMAGE_EVIDENCE_V1: the sentence (or bullet line) of the draft that carries a figure.
function sentenceOf(text, raw) {
  const t = String(text || '');
  const idx = t.toLowerCase().indexOf(String(raw || '').toLowerCase());
  if (idx < 0) return t;
  const before = t.slice(0, idx);
  const startCut = Math.max(before.lastIndexOf('. '), before.lastIndexOf('\n'), before.lastIndexOf('! '), before.lastIndexOf('? '));
  const rest = t.slice(idx);
  const m = rest.search(/[.!?](?:\s|$)|\n/);
  return t.slice(startCut >= 0 ? startCut + 1 : 0, m >= 0 ? idx + m + 1 : t.length).trim();
}

function addonStatus(clientTexts) {
  const blob = (clientTexts || []).join('\n');
  if (ADDON_DENY_RE.test(blob)) return 'denied';
  if (ADDON_CONFIRM_RE.test(blob)) return 'confirmed';
  return 'unknown';
}

function isExceptionWindow(win) {
  return ADDON_RE.test(win);
}

function valuesEquivalent(a, b) {
  if (String(a.value) === String(b.value) && a.unit === b.unit) return true;
  const as = toSeconds(a.value, a.unit);
  const bs = toSeconds(b.value, b.unit);
  if (as != null && bs != null) return as === bs;
  return false;
}


/**
 * Numbers visibly shown on a client screenshot (promo price, selected profit
 * target, daily loss option, etc.) are DISPLAY evidence, not invented policy.
 * Restating them while explaining the screenshot must not trip UNSUPPORTED_NUMBER.
 * They are still not treated as universal FundedElite policy.
 */
function isImageDisplayRestate(fact, imageEvidenceText, sentence) {
  const ev = String(imageEvidenceText || '').trim();
  if (!ev) return false;
  const unitC = canonUnitName(fact.unit);
  if (!POLICY_UNITS.has(fact.unit) && !POLICY_UNITS.has(unitC)) return false;
  const raw = String(fact.raw || '');
  const val = String(fact.value);
  // Require the same figure (raw or value+unit) to appear in the image evidence text.
  let inImage = !!(raw && ev.toLowerCase().includes(raw.toLowerCase()));
  if (!inImage) {
    const unit = canonUnitName(fact.unit);
    const unitAlt = unit === '%' ? '(?:%|percent)' : unit;
    const re = new RegExp('(?<!\\d)' + val.replace('.', '\\.') + '\\s*' + unitAlt + 's?\\b', 'i');
    inImage = re.test(ev);
  }
  // IMAGE_EVIDENCE_V1 (2026-09-28, live 215476135544728): the screenshot said "24hrs", the draft said "24 hours";
  // neither the raw text nor "24\s*hours?" matched, so the image figure failed UNSUPPORTED_NUMBER. Compare by value and
  // canonical unit (hrs/hours/hour, mins/minutes, percent/%) using the same parser as the evidence.
  if (!inImage) {
    const f = { ...fact, unit: unitC };
    inImage = policyFacts(ev).some((e) => valuesEquivalent({ ...e, unit: canonUnitName(e.unit) }, f));
  }
  if (!inImage) return false;
  // Legacy callers (no sentence) keep the old contract. With a sentence, the figure must be presented AS what the
  // image / website shows ("the website shows 24hrs"), so an image figure can never pass as flat policy
  // ("payouts are processed in 24 hours") and numbers that are not in the image are never relaxed.
  if (sentence === undefined || sentence === null) return true;
  return IMAGE_ATTRIBUTION_RE.test(String(sentence));
}

const IMAGE_ATTRIBUTION_RE = /\b(?:screenshots?|screen\s?shots?|images?|pictures?|photos?|websites?|web\s?site|site|web\s?page|pages?|homepage|card|banner|dashboard|shows?|shown|showing|displays?|displayed|displaying|listed|lists|says|reads|stat(?:istic)?s?|statistical|advertised|mentioned|highlights?|headline|figure\s+(?:on|from|in))\b/i;

function isCustomerSpecificRestate(fact, clientTexts) {
  if (!POLICY_UNITS.has(fact.unit)) return true;
  const valRe = new RegExp(`(?<!\\d)${String(fact.value).replace('.', '\\.')}\\s*${fact.unit.replace('%', '%')}s?\\b`, 'i');
  for (const t of clientTexts || []) {
    if (!valRe.test(t) && !String(t).includes(fact.raw)) continue;
    if (POLICY_ASK_RE.test(t)) continue;
    if (/\b(?:i|we|my|our|i've|i have)\b/i.test(t)) return true;
  }
  return false;
}

// "4 profitable days", "5 profitable trading days", "3 calendar days": the generic NUMBER_RE
// needs the unit right after the number, so every qualified day count was invisible to this audit
// on BOTH sides (an invented "7 profitable days" passed, and the evidence's own figure was never
// seen). Up to two qualifier words may sit between the number and the unit.
const QUALIFIED_COUNT_RE = /(?<![\w.])(\d+)\s+((?:(?:profitable|trading|calendar|business|working|positive|consecutive|winning|qualifying|separate|full|valid)\s+){1,2})(days?|weeks?)\b/gi;
function policyFacts(text) {
  // STAGE_LABEL_NOT_COUNT_V1 (2026-09-28, REPLY_DESIGN_V1 replays): "Phase 1" / "Stage 2" is a stage NAME, not a
  // quantity. "Phase 1 profitable days require 1%" was read as "1 profitable days" and "each qualifying Phase 1 day"
  // as "1 day", both reported UNSUPPORTED_NUMBER on a correct draft (silence + "not published" regen). Only the stage
  // label is masked; every real count ("Phase 1 requires 4 profitable days") is still extracted and audited.
  const t = String(text || '').replace(/\b(phase|stage)\s+([1-3])\b(?![.,]?\d|\s*%)/gi, (m0, w, d) => w + ' ' + ['', 'I', 'II', 'III'][Number(d)]);
  const out = gap.numericFacts(t).slice();
  let m;
  const rx = new RegExp(QUALIFIED_COUNT_RE.source, 'gi');
  while ((m = rx.exec(t)) !== null) out.push({ raw: m[0], value: m[1], unit: m[3].toLowerCase().replace(/s$/, '') });
  return out;
}

function clientTextsOf(messages) {
  return (messages || []).filter((m) => m && (m.role === 'client' || m.role === 'user')).map((m) => m.text || '');
}

// LITE1_MLL_V1 (2026-09-28, owner rule): owner-approved max-loss DEFAULTS per product, read from the
// approved-internal rules (luna-knowledge/approved-internal.json, "default Maximum Loss Limit is N%") with a
// built-in fallback. Only Lite 1-Step has one (6%). The Lite 1-Step FAQ sentence "customizable max loss limit
// of 8%" is an owner-confirmed typo; 8% stays a valid SELECTABLE Lite 1-Step option, so the number audit alone
// accepts it. What must never pass is a draft that calls another value the DEFAULT (or standard / fixed) max
// loss of that product. This adds one check; nothing else in the audit is relaxed.
const OWNER_MAXLOSS_RULES = { 'ai-defaults-lite-1-step': 'lite-1-step' };
const OWNER_MAXLOSS_FALLBACK = { 'lite-1-step': 6 };
let _mlDefaults = null;
let _mlDefaultsKey = '';
function ownerMaxLossDefaults() {
  const fs = require('fs');
  const path = require('path');
  const file = process.env.LUNA_KNOWLEDGE_ROOT ? path.join(process.env.LUNA_KNOWLEDGE_ROOT, 'approved-internal.json')
    : [path.join(__dirname, '..', 'luna-knowledge', 'approved-internal.json'), '/home/ubuntu/luna-knowledge/approved-internal.json'].find((f) => { try { return fs.existsSync(f); } catch (_) { return false; } });
  try {
    const key = file + ':' + fs.statSync(file).mtimeMs;
    if (_mlDefaults && key === _mlDefaultsKey) return _mlDefaults;
    const out = Object.assign({}, OWNER_MAXLOSS_FALLBACK);
    for (const r of (JSON.parse(fs.readFileSync(file, 'utf8')).rules || [])) {
      const prod = OWNER_MAXLOSS_RULES[r && r.ruleId];
      const m = prod && String(r.body || '').match(/default\s+Maximum\s+Loss\s+Limit\s+is\s+(\d+(?:[.,]\d+)?)\s*%/i);
      if (m) out[prod] = Number(m[1].replace(',', '.'));
    }
    _mlDefaults = out; _mlDefaultsKey = key;
    return out;
  } catch (_) {
    return _mlDefaults || Object.assign({}, OWNER_MAXLOSS_FALLBACK);
  }
}

const DEFAULT_WORD_RE = /\b(?:default|standard|fixed|usual|typical|base)\b/i;
const DEFAULT_AFTER_RE = /^[\s*_)]*(?:\(\s*(?:the\s+)?(?:default|standard)\s*\)|by\s+default|as\s+(?:the\s+|a\s+)?(?:default|standard)|(?:is|as|being)\s+(?:the\s+|a\s+)?(?:default|standard|fixed)|(?:default|standard)\b)/i;
const NEGATION_RE = /\b(?:not|never|no|isn't|isn’t|aren't|instead\s+of|rather\s+than)\b/i;

/**
 * Figures a draft presents as the DEFAULT / standard / fixed max loss of a product whose owner-approved
 * default is a different value ("Lite 1-Step max loss: default 8%", "8% is the standard max loss").
 * A figure listed as one of the options ("default 6%, or choose 5%, 7%, 8% or 10%") is not a default claim.
 * @returns {string[]} raw figures
 */
function wrongDefaultClaims(draft, evidenceText) {
  const defaults = ownerMaxLossDefaults();
  const text = String(draft || '').replace(/<[^>]{1,40}>/g, ' ').replace(/\*\*|__/g, '').replace(/&nbsp;/g, ' ');
  if (!/%/.test(text) || !/\bmax(?:imum)?\s+(?:loss|drawdown)\b|\bMLL\b/i.test(text)) return [];
  const products = productMatches(text);
  const draftProducts = new Set(products.map((p) => p.id));
  const evProducts = new Set(segmentsOf(String(evidenceText || '')).map((s) => s.product).filter(Boolean));
  const soleEvidence = evProducts.size === 1 ? [...evProducts][0] : null;
  const concreteOnly = (id) => { const c = concreteOf(id); return c.length === 1 ? c[0] : null; };
  const out = [];
  const pctRe = /(?<![\d.,])(\d+(?:[.,]\d+)?)\s*%/g;
  const all = [];
  let m;
  while ((m = pctRe.exec(text)) !== null) all.push({ raw: m[0], value: Number(m[1].replace(',', '.')), idx: m.index, end: m.index + m[0].length });
  for (let i = 0; i < all.length; i++) {
    const f = all[i];
    if (metricAt(text, f.idx, f.raw) !== 'maxLoss') continue;
    // The figure must be tied to a max-loss term in its OWN clause: a max-loss term before it with no other
    // metric (or "daily") in between, or one attached right after it ("8% max loss"). metricAt's "nearest term
    // after" fallback is not enough here: "The daily limit is fixed at 3%, and the max loss limit is 6%" would
    // make 3% a max-loss figure.
    {
      const cb0 = clauseBounds(text, f.idx);
      const c0 = cb0.bullet ? cb0.headerStart : cb0.start;
      const before = text.slice(c0, f.idx);
      const ML = /\bmax(?:imum)?\s+(?:loss|drawdown)\b|\bMLL\b/gi;
      let mm, lastMl = null;
      while ((mm = ML.exec(before)) !== null) lastMl = mm;
      const gapTxt = lastMl ? before.slice(lastMl.index + lastMl[0].length) : '';
      const tiedBefore = !!lastMl && !/\bdaily\b/i.test(gapTxt) &&
        !METRIC_TERMS.some(([id, re]) => id !== 'maxLoss' && new RegExp(re.source, 'i').test(gapTxt));
      const tiedAfter = /^[\s*_]*(?:[a-z-]{2,14}\s+){0,3}(?:max(?:imum)?\s+(?:loss|drawdown)\b|MLL\b)/i.test(text.slice(f.end, f.end + 40));
      if (!tiedBefore && !tiedAfter) continue;
    }
    // Which product is this figure about: the nearest product name before it, else the only product the
    // draft names, else the only product the evidence is about. A family word ("Lite", "1-Step") counts only
    // when the draft/evidence context pins it to one concrete product.
    let prod = lastBefore(products, f.idx, 0);
    if (!prod && draftProducts.size === 1) prod = [...draftProducts][0];
    if (prod && !concreteOnly(prod)) {
      const ctx = [...draftProducts].map(concreteOnly).filter(Boolean).concat(soleEvidence ? [concreteOnly(soleEvidence)] : []);
      const pinned = [...new Set(ctx)].filter((c) => concreteOf(prod).includes(c));
      prod = pinned.length === 1 ? Object.keys(CONCRETE).find((k) => CONCRETE[k].length === 1 && CONCRETE[k][0] === pinned[0]) : null;
    }
    if (!prod && !draftProducts.size) prod = soleEvidence;
    const approved = prod ? defaults[prod] : undefined;
    if (approved == null || Math.abs(approved - f.value) < 1e-9) continue;
    const cb = clauseBounds(text, f.idx);
    const cStart = cb.bullet ? cb.itemStart : cb.start;
    const prevEnd = i > 0 && all[i - 1].end > cStart ? all[i - 1].end : cStart;
    const nextStart = i + 1 < all.length && all[i + 1].idx < cb.end ? all[i + 1].idx : cb.end;
    let pre = text.slice(prevEnd, f.idx);
    // "6% by default, and you can change it to 5%": the default word belongs to the PREVIOUS figure.
    if (prevEnd > cStart) { const am = pre.match(DEFAULT_AFTER_RE); if (am) pre = pre.slice(am[0].length); }
    const post = text.slice(f.end, nextStart);
    // The default word must qualify THIS figure: the last one before it, within 60 characters, with no other
    // metric ("fixed daily loss limit and a max loss of 8%" is not a fixed-8% claim) and no negation between.
    let claimBefore = false;
    {
      const rx = new RegExp(DEFAULT_WORD_RE.source, 'gi');
      let dm, last = null;
      while ((dm = rx.exec(pre)) !== null) last = dm;
      if (last) {
        const between = pre.slice(last.index + last[0].length);
        const otherMetric = METRIC_TERMS.some(([id, re]) => id !== 'maxLoss' && new RegExp(re.source, 'i').test(between));
        const newClause = /\b(?:and|but|or|while|then|options?|choose|pick|select|change|switch|customi[sz]\w*|between|from)\b|[,;]/i.test(between);
        claimBefore = between.length <= 45 && !otherMetric && !newClause && !NEGATION_RE.test(pre.slice(Math.max(0, last.index - 12)));
      }
    }
    const claimAfter = DEFAULT_AFTER_RE.test(post) && !NEGATION_RE.test(post.slice(0, 40));
    if (claimBefore || claimAfter) out.push(f.raw);
  }
  return T.uniq(out);
}

/**
 * @returns {string[]} raw drafted figures that are not supported by the applicable rule
 */
function unsupportedPolicyNumbers(draft, evidenceText, messages, opts) {
  // strictProducts: a policy figure attributed to a named product must be backed by the
  // approved evidence for THAT product. Without it an invented figure slipped through whenever
  // the retrieved slice happened to contain nothing comparable ("Instant needs a 99% profit
  // target" was not flagged because no evidence fact shared enough context words with it).
  // Only applies when the figure names a product AND the evidence actually covers that product,
  // so a genuinely unretrieved article cannot turn every number into a failure.
  const strictProducts = !!(opts && opts.strictProducts);
  const ev = String(evidenceText || '').trim();
  // LITE1_MLL_V1: a wrong DEFAULT max-loss claim is flagged even when the figure itself is a valid option
  // and even when the client mentioned it (a client's "is 8% the default?" is not authority).
  const wrongDefaults = wrongDefaultClaims(draft, ev);
  if (!ev) return wrongDefaults;
  const clients = clientTextsOf(messages);
  const addon = addonStatus(clients);
  // EXAMPLE_NOT_RULE_V1 (2026-09-25, live 215476101110604): "For example, if your account has a 5% daily
  // drawdown, you cannot risk more than 2.5%" illustrates a rule; its 5% is not the daily loss of any product.
  // It was used to "contradict" Lite 2-Step's real 4% daily loss. Example figures may SUPPORT a draft that
  // repeats the example but never CONTRADICT a draft.
  const evidenceFacts = policyFacts(ev)
    .map((f) => { const attrAll = attributionsOf(ev, f.raw); const ruleAttr = attrAll.filter((a) => !a.example);
      return { ...f, unit: canonUnitName(f.unit), ctx: contextWords(ev, f.raw), win: windowOf(ev, f.raw), attr: attrAll, ruleAttr }; })
    .filter((f) => POLICY_UNITS.has(f.unit));
  if (!evidenceFacts.length) return wrongDefaults;
  // DERIVED_PERCENT_V1: "50% of the 4% daily loss limit ... works out to 2%" derives a figure the FAQ does
  // not state verbatim. A percentage equal to the product of two OTHER percentages in the draft that the
  // evidence directly supports is a calculation from approved figures, not an invented number.
  const draftPct = policyFacts(draft).map((x) => ({ ...x, unit: canonUnitName(x.unit) })).filter((x) => x.unit === '%');
  const pctSupported = (x) => evidenceFacts.some((e) => e.unit === '%' && valuesEquivalent(e, x));
  const supportedPct = draftPct.filter(pctSupported).map((x) => Number(String(x.value).replace(',', '.')));
  // SOFT_BREACH_RESET_FEE_V1: owner card states first reset 40% of challenge fee, then double, then double.
  // Prefer that wording; also accept the derived 80%/160% ladder when the card is in evidence.
  const softBreachResetEv =
    /\b40\s*%\s+of\s+the\s+(?:challenge|original\s+challenge)\s+(?:fee|cost)\b/i.test(ev) &&
    /\bdouble\b|\b2\s*times\b|\b2x\b/i.test(ev);
  const derivedPct = (v) => {
    const n = Number(String(v).replace(',', '.'));
    for (let i = 0; i < supportedPct.length; i++) for (let j = 0; j < supportedPct.length; j++) {
      if (i === j) continue;
      if (Math.abs(supportedPct[i] * supportedPct[j] / 100 - n) < 0.011) return true;
    }
    return false;
  };
  const derivedSoftBreachResetPct = (v, win) => {
    if (!softBreachResetEv || !/\b(?:reset|challenge\s+(?:fee|cost)|double|2\s*times|2x)\b/i.test(win)) return false;
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n)) return false;
    if (n === 40 || n === 80 || n === 160) return true;
    const bases = supportedPct.length ? supportedPct : [40];
    for (const s of bases) {
      if (Math.abs(s * 2 - n) < 0.011 || Math.abs(s * 4 - n) < 0.011) return true;
    }
    return false;
  };

  const bad = [];
  for (const raw of policyFacts(draft)) {
    const f = { ...raw, unit: canonUnitName(raw.unit) };
    if (!POLICY_UNITS.has(f.unit)) continue;
    if (isCustomerSpecificRestate(f, clients)) continue;
    if (isImageDisplayRestate(f, (opts && opts.imageEvidenceText) || '', sentenceOf(draft, f.raw))) continue;

    const ctx = contextWords(draft, f.raw);
    const win = windowOf(draft, f.raw);
    const attr = attributionsOf(draft, f.raw);
    // Direct support: the approved evidence states this very value, with the same unit, under a
    // product/stage this figure could be about. Context-word overlap is a proxy for "same fact"
    // and it misses correct restatements ("Instant has a 3% daily loss limit" vs "The INSTANT
    // challenge has a fixed daily loss limit of 3%"), which is how a correct comparison ended up
    // reported as unsupported. A wrong-product or wrong-stage claim still fails this test,
    // because its attribution clashes with every occurrence of the value.
    // An example figure only supports a draft that is itself giving an example (EXAMPLE_NOT_RULE_V1).
    const draftIsExample = /\bfor\s+example\b|\bfor\s+instance\b|\be\.g\.|\bexample\b|\bif\s+your\s+account\s+has\b/i.test(win);
    const directlySupported = evidenceFacts.some((e) => {
      const occ = draftIsExample ? e.attr : e.ruleAttr;
      return occ.length && !attributionClash(attr, occ) && valuesEquivalent(e, f);
    });
    if (directlySupported) continue;

    if (f.unit === '%' && derivedPct(f.value)) continue;
    if (f.unit === '%' && derivedSoftBreachResetPct(f.value, win)) continue;
    const related = evidenceFacts.filter((e) => {
      if (!e.ruleAttr.length) return false; // only illustrated, never stated as a rule
      // A figure about a different product or a different stage is not evidence about this one.
      if (attributionClash(attr, e.ruleAttr)) return false;
      // Different product entirely: it cannot contradict this figure.
      if (productsConflict(win, e.win)) return false;
      // Same product/stage/metric (attributionClash already vetoed any disagreement): the two
      // figures are about the same rule even when they are worded differently.
      if (sameKnownMetric(attr, e.attr)) return true;
      if (sharedCount(e.ctx, ctx) >= 2) return true;
      if (isTimeUnit(f.unit) && isTimeUnit(e.unit) && sharedCount(e.ctx, ctx) >= 1) return true;
      return false;
    });
    if (!related.length) {
      if (isTimeUnit(f.unit) && evidenceFacts.some((e) => isTimeUnit(e.unit))) {
        const anyTimeMatch = evidenceFacts.some((e) => isTimeUnit(e.unit) && valuesEquivalent(e, f));
        if (!anyTimeMatch) bad.push(f.raw);
      } else if (strictProducts) {
        const claimed = attr.map((a) => a.product).filter(Boolean);
        if (claimed.length) {
          // Does the evidence describe this product with the same kind of unit at all? If it
          // does, the figure is a claim about a product we DO have evidence for, and nothing in
          // that evidence supports it. If it does not, stay silent rather than guess.
          const covered = evidenceFacts.some((e) =>
            e.unit === f.unit && e.attr.some((a) => a.product && claimed.some((c) => compatible(c, a.product))));
          if (covered) bad.push(f.raw);
        }
      }
      continue;
    }

    const equivalent = related.filter((e) => valuesEquivalent(e, f));
    if (!equivalent.length) {
      bad.push(f.raw);
      continue;
    }

    const onlyException = equivalent.length && equivalent.every((e) => isExceptionWindow(e.win));
    const draftStatesCondition = isExceptionWindow(win);
    const appliesToThisClient = APPLIES_TO_CLIENT_RE.test(win) || APPLIES_TO_CLIENT_RE.test(draft);
    if (onlyException && !draftStatesCondition && (addon === 'denied' || (addon !== 'confirmed' && appliesToThisClient))) {
      bad.push(f.raw);
    }
  }
  return T.uniq(bad.concat(wrongDefaults));
}

function isTimeUnit(u) {
  return TIME_SECONDS[canonUnitName(u)] != null;
}

module.exports = {
  unsupportedPolicyNumbers,
  wrongDefaultClaims,
  ownerMaxLossDefaults,
  isImageDisplayRestate,
  IMAGE_ATTRIBUTION_RE,
  sentenceOf,
  productsIn,
  segmentsOf,
  compatible,
  policyFacts,
  metricsOf,
  productsConflict,
  attributionsOf,
  attributionClash,
  canonUnitName,
  addonStatus,
  POLICY_UNITS,
};
