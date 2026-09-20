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

function clientTextsOf(messages) {
  return (messages || []).filter((m) => m && (m.role === 'client' || m.role === 'user')).map((m) => m.text || '');
}

/**
 * @returns {string[]} raw drafted figures that are not supported by the applicable rule
 */
function unsupportedPolicyNumbers(draft, evidenceText, messages) {
  const ev = String(evidenceText || '').trim();
  if (!ev) return [];
  const clients = clientTextsOf(messages);
  const addon = addonStatus(clients);
  const evidenceFacts = gap.numericFacts(ev)
    .map((f) => ({ ...f, unit: canonUnitName(f.unit), ctx: contextWords(ev, f.raw), win: windowOf(ev, f.raw) }))
    .filter((f) => POLICY_UNITS.has(f.unit));
  if (!evidenceFacts.length) return [];

  const bad = [];
  for (const raw of gap.numericFacts(draft)) {
    const f = { ...raw, unit: canonUnitName(raw.unit) };
    if (!POLICY_UNITS.has(f.unit)) continue;
    if (isCustomerSpecificRestate(f, clients)) continue;

    const ctx = contextWords(draft, f.raw);
    const win = windowOf(draft, f.raw);
    const related = evidenceFacts.filter((e) => {
      if (sharedCount(e.ctx, ctx) >= 2) return true;
      if (isTimeUnit(f.unit) && isTimeUnit(e.unit) && sharedCount(e.ctx, ctx) >= 1) return true;
      return false;
    });
    if (!related.length) {
      if (isTimeUnit(f.unit) && evidenceFacts.some((e) => isTimeUnit(e.unit))) {
        const anyTimeMatch = evidenceFacts.some((e) => isTimeUnit(e.unit) && valuesEquivalent(e, f));
        if (!anyTimeMatch) bad.push(f.raw);
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
  return T.uniq(bad);
}

function isTimeUnit(u) {
  return TIME_SECONDS[canonUnitName(u)] != null;
}

module.exports = {
  unsupportedPolicyNumbers,
  canonUnitName,
  addonStatus,
  POLICY_UNITS,
};
