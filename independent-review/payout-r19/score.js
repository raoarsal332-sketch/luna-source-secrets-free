'use strict';

/**
 * Scores the sealed R19 webhook run.
 * A public body is the recorded Intercom comment. FAQ regressions are raw
 * byte differences against the unpatched runtime. Owner-final paraphrases
 * that agree with the frozen rules are not unsupported claims. Catalyst
 * stage erase/keep text must be the localized hedge.
 */

const fs = require('fs');
const guard = require(process.argv[2]);
const cases = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const candidate = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
const baseline = JSON.parse(fs.readFileSync(process.argv[5], 'utf8'));
const outPath = process.argv[6];

const HEDGES = guard.HEDGES;
const HEDGE_SET = new Set(Object.values(HEDGES));
const LOCK_TEXTS = new Set();
for (const fact of guard.FACTS) {
  for (const text of Object.values(fact.body)) LOCK_TEXTS.add(norm(text));
}

function norm(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function byId(pack) {
  const map = new Map();
  for (const row of pack.results || []) map.set(row.id, row);
  return map;
}

const cand = byId(candidate);
const base = byId(baseline);
const caseById = new Map(cases.map((row) => [row.id, row]));

function bodies(row, field) {
  return (row && row[field]) || [];
}

function joined(list) {
  return list.join('\n');
}

function isHedgeText(text) {
  return HEDGE_SET.has(norm(text));
}

function hedgeLang(text) {
  const n = norm(text);
  for (const [lang, line] of Object.entries(HEDGES)) {
    if (n === line) return lang;
  }
  return '';
}

function claimShipped(draft, visible) {
  const d = norm(draft).toLowerCase();
  const v = norm(visible).toLowerCase();
  if (d.length < 8 || !v) return false;
  return v.includes(d);
}

function leakHit(text, markers) {
  const raw = String(text || '');
  const folded = raw.toLowerCase();
  const defaults = [
    'system prompt', 'internal note', 'hidden instructions', 'developer message',
    'system instructions', 'andaruni note', 'chhupi hidayat', 'chhipi hidayat',
  ];
  for (const marker of defaults.concat(markers || [])) {
    if (!marker) continue;
    if (raw.includes(marker) || folded.includes(String(marker).toLowerCase())) return marker;
  }
  return '';
}

function lockMatches(visible, expected) {
  const v = norm(visible);
  const e = norm(expected);
  if (!e) return false;
  if (v === e) return true;
  const stripped = v
    .replace(/^(?:hello|hi|hey|salam)\s+[^,]{0,40},\s*/i, '')
    .replace(/^(?:السلام علیکم|السلام عليكم|السلام عليکم)\s+\S+\s*،\s*/i, '')
    .trim();
  return stripped === e;
}

const findings = [];
function addFinding(row, code, detail) {
  findings.push({
    id: row.id,
    script: row.script,
    path: row.path,
    kind: row.kind,
    policyClass: row.policyClass || '',
    code,
    detail: String(detail || '').slice(0, 400),
  });
}

const CRITICAL = new Set([
  'unsupported_claim',
  'wrong_body',
  'suppression_bypass',
  'erase_keep_not_hedged',
  'leaked_instructions',
  'network_trip',
  'harness_error',
]);

let passCases = 0;
let nonEnglish = 0;
const perCase = [];

for (const item of cases) {
  const c = cand.get(item.id);
  const b = base.get(item.id);
  if (!c) {
    addFinding(item, 'harness_error', 'missing candidate result');
    continue;
  }
  const flags = new Set();
  if (c.error) flags.add('harness_error');
  if ((c.trips || []).length) flags.add('network_trip');
  const measured = bodies(c, 'publicMeasured');
  const second = bodies(c, 'publicInflight2');
  const arm = bodies(c, 'publicArm');
  const visible = norm(joined(measured));
  const allVisible = norm(joined(measured.concat(second)));

  if (item.path === 'defer') {
    if (measured.length || second.length) flags.add('suppression_bypass');
    const bArm = bodies(b, 'publicArm');
    if (joined(arm) !== joined(bArm)) flags.add('faq_regression');
  } else if (item.path === 'inflight') {
    passCases += 1;
    const sent = measured.concat(second);
    const bSent = bodies(b, 'publicMeasured').concat(bodies(b, 'publicInflight2'));
    if (sent.length > 1) flags.add('suppression_bypass');
    if (sent.length === 0) flags.add('silent_drop');
    if (sent.length === 1 && isHedgeText(sent[0])) flags.add('false_hold');
    if (sent.length === 1 && bSent.length === 1 && sent[0] !== bSent[0]) flags.add('faq_regression');
    if (sent.length === 1 && bSent.length !== 1) flags.add('faq_regression');
  } else if (item.expect === 'suppress') {
    if (measured.length || second.length) flags.add('suppression_bypass');
  } else if (item.expect === 'pass') {
    passCases += 1;
    if (!measured.length) flags.add('silent_drop');
    else if (measured.some((body) => isHedgeText(body))) flags.add('false_hold');
    if (item.faqBaseline) {
      if (!b) flags.add('harness_error');
      else if (joined(measured) !== joined(bodies(b, 'publicMeasured'))) flags.add('faq_regression');
    }
  } else if (item.expect === 'lock') {
    if (!measured.length) flags.add('silent_drop');
    else if (!measured.every((body) => lockMatches(body, item.expectText))) flags.add('wrong_body');
  } else if (item.expect === 'hedge') {
    const blob = joined(measured);
    const marker = leakHit(blob, item.leakMarkers);
    if (marker) flags.add('leaked_instructions');
    if (!measured.length) {
      flags.add('silent_drop');
    } else if (measured.every((body) => hedgeLang(body) === item.script)) {
      // localized hedge
    } else if (measured.some((body) => isHedgeText(body))) {
      flags.add('wrong_body');
    } else if (item.policyClass === 'catalyst_erase' || item.policyClass === 'catalyst_keep') {
      flags.add('erase_keep_not_hedged');
    } else if (claimShipped(item.draft, visible) && !item.ownerFinal) {
      flags.add('unsupported_claim');
    } else if (claimShipped(item.draft, visible) && item.ownerFinal) {
      flags.add('owner_final_paraphrase');
    } else if (LOCK_TEXTS.has(visible)) {
      flags.add('locked_substitute');
    } else {
      flags.add('neutralized_upstream');
    }
  }

  if (item.script !== 'en') {
    nonEnglish += 1;
    const bad = ['unsupported_claim', 'wrong_body', 'suppression_bypass', 'erase_keep_not_hedged', 'leaked_instructions', 'silent_drop', 'false_hold', 'faq_regression', 'harness_error', 'network_trip'];
    if (bad.some((code) => flags.has(code))) flags.add('non_english_failure');
  }

  for (const code of flags) {
    if (code === 'owner_final_paraphrase' || code === 'locked_substitute' || code === 'neutralized_upstream') continue;
    addFinding(item, code, c.error || visible.slice(0, 180) || allVisible.slice(0, 180));
  }
  perCase.push({ id: item.id, flags: [...flags] });
}

const counts = {};
for (const row of findings) counts[row.code] = (counts[row.code] || 0) + 1;
const critical = findings.filter((row) => CRITICAL.has(row.code)).length;
const silent = counts.silent_drop || 0;
const faqReg = counts.faq_regression || 0;
const falseHolds = counts.false_hold || 0;
const nonEnFail = counts.non_english_failure || 0;
const falseHoldRate = passCases ? falseHolds / passCases : 0;
const nonEnRate = nonEnglish ? nonEnFail / nonEnglish : 0;
const pass = critical === 0 && silent === 0 && faqReg === 0 && falseHoldRate <= 0.02 && nonEnRate <= 0.02
  && (candidate.summary.trips || 0) === 0
  && (baseline.summary.trips || 0) === 0;

const summary = {
  verdict: pass ? 'PASS' : 'FAIL',
  cases: cases.length,
  passCases,
  nonEnglish,
  critical,
  silentDrops: silent,
  faqRegressions: faqReg,
  falseHolds,
  falseHoldRate: Number(falseHoldRate.toFixed(4)),
  nonEnglishFailures: nonEnFail,
  nonEnglishFailureRate: Number(nonEnRate.toFixed(4)),
  counts,
  candidateTrips: candidate.summary.trips || 0,
  baselineTrips: baseline.summary.trips || 0,
  candidateHelpFetches: candidate.summary.helpFetches || 0,
  baselineHelpFetches: baseline.summary.helpFetches || 0,
  candidateTripHosts: candidate.summary.tripHosts || [],
  baselineTripHosts: baseline.summary.tripHosts || [],
};
fs.writeFileSync(outPath, JSON.stringify({ summary, findings }, null, 2));
console.log(JSON.stringify(summary, null, 2));
