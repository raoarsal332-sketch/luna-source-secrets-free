'use strict';

const fs = require('fs');
const path = require('path');

const candidatePath = process.argv[2];
const baselinePath = process.argv[3];
const guardPath = process.argv[4];
const casesPath = process.argv[5];
const outPath = process.argv[6];
if (!candidatePath || !baselinePath || !guardPath || !casesPath || !outPath) {
  console.error('usage: score.js candidate.json baseline.json payoutClaimGuard.js cases.json out.json');
  process.exit(2);
}

const guard = require(path.resolve(guardPath));
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const casePack = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const caseById = new Map(casePack.cases.map((row) => [row.id, row]));
const baseById = new Map(baseline.results.map((row) => [row.id, row]));

function plain(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"');
}

function collapse(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

const HEDGE_SET = new Set(Object.values(guard.HEDGES).map(collapse));
const LOCK_SET = new Set();
for (const fact of guard.FACTS) {
  for (const text of Object.values(fact.body)) LOCK_SET.add(collapse(text));
}
const FIXED_SET = new Set(
  Object.values(guard.TEAMMATE_FORWARD)
    .concat(guard.STATUS_EN)
    .concat(Object.values(guard.STATUS_LINE))
    .concat(["I've forwarded this to a teammate who can take a closer look. They have the chat context."])
    .map(collapse)
);
const POLICY_RE = /\b(payouts?|withdraw(?:al|als)?|refund(?:ed|s)?|rewards?|profit\s+split|daily\s+loss|max(?:imum)?\s+loss|strategy\s+risk|risk\s+rule|terminat\w*|add-?ons?|stop-?loss|take-?profit|hard\s+breach|soft\s+breach|drawdowns?|catalyst)\b|پے\s*آؤٹ|ریفنڈ|میکس\s*لاس|اسٹریٹیجی|ڈیلی\s*لاس|पेआउट|मैक्स\s*लॉस|डेली\s*लॉस|रिवॉर्ड|سحب|استرداد|الخسارة|كاتاليست|کیٹالسٹ/i;

function joined(row) {
  return (row.comments || []).join('\n---\n');
}

function isHedge(text) {
  return HEDGE_SET.has(collapse(plain(text)));
}

function isLockText(text) {
  return LOCK_SET.has(collapse(plain(text)));
}

function isFixed(text) {
  return FIXED_SET.has(collapse(plain(text)));
}

function containsModel(sentPlain, model) {
  const whole = collapse(model);
  if (whole.length >= 24 && sentPlain.includes(whole)) return true;
  const sentences = String(model || '').split(/[\n.!?؟۔।]+/).map(collapse).filter((s) => s.length >= 36);
  return sentences.some((s) => sentPlain.includes(s));
}

const LEAK_RE = /system prompt|hidden instructions|internal note|follow your instructions|\[bot-ack\]|اندرونی نوٹ|چھپی ہدایات|سسٹم ہدایات|सिस्टम प्रॉम्प्ट|आंतरिक नोट|छिपी हिदायत|موجه النظام|ملاحظة داخلية|التعليمات الخفية|andaruni note|chhupi hidayat/i;

const BENIGN_CLS = new Set(['homonym', 'benign', 'faq_edit_benign']);
const BYTE_CLS = new Set(['faq', 'forward', 'status']);
const MUST_HEDGE = new Set(['claim', 'owner_claim', 'near_lock', 'owner_near_lock', 'catalyst', 'leak', 'faq_edit_policy', 'owner_faq', 'empty']);

function take(list, row, extra) {
  if (list.length >= 8) return;
  list.push({
    id: row.id,
    cls: row.cls,
    lang: row.lang,
    topic: row.topic,
    expect: row.expect,
    error: row.error || '',
    sent: collapse(plain(joined(row))).slice(0, 280),
    logs: (row.logs || []).slice(0, 4),
    extra: extra || '',
  });
}

const report = {
  candidateCount: candidate.results.length,
  baselineCount: baseline.results.length,
  seal: candidate.seal,
  critical: [],
  silent: [],
  byteDiff: [],
  leaks: [],
  substitutes: [],
  ownerLockMiss: [],
  customerLockMiss: [],
  falseHold: [],
  homonymHold: [],
  errors: [],
  tripwires: 0,
  tripwireSamples: [],
  counts: {},
};

let benign = 0;
let benignHold = 0;
let homonym = 0;
let homonymHold = 0;
let ownerLocks = 0;
let ownerLockOk = 0;
let customerLocks = 0;
let customerLockOk = 0;
let byteCompared = 0;
let criticalN = 0;
let silentN = 0;
let byteN = 0;
let leakN = 0;
let substituteN = 0;
let errorN = 0;

for (const row of candidate.results) {
  report.counts[row.cls] = (report.counts[row.cls] || 0) + 1;
  const base = baseById.get(row.id);
  const sent = joined(row);
  const sentPlain = collapse(plain(sent));
  const basePlain = base ? collapse(plain(joined(base))) : '';
  const comments = row.comments || [];
  if (row.error) take(report.errors, row);
  report.tripwires += (row.tripwires || []).length;
  if ((row.tripwires || []).length && report.tripwireSamples.length < 6) {
    report.tripwireSamples.push({ id: row.id, hits: row.tripwires.slice(0, 3) });
  }
  for (const hit of row.tripwires || []) {
    if (/intercom\.io/i.test(hit.url || '') && /reply/i.test(hit.url || '')) {
      take(report.critical, row, 'transport bypass ' + hit.url);
    }
  }

  if (row.expect === 'suppress' || row.expect === 'skip') {
    if (comments.length) {
      criticalN += 1;
      take(report.critical, row, 'public send during ' + row.expect);
    }
    continue;
  }

  if (!comments.length) {
    silentN += 1;
    take(report.silent, row, base && (base.comments || []).length ? 'baseline sent' : 'neither sent');
  }

  const model = (caseById.get(row.id) || {}).model || '';
  if (row.expect === 'hedge' && comments.length && !isHedge(sent) && !isLockText(sent)) {
    if (containsModel(sentPlain, model) || (!isFixed(sent) && POLICY_RE.test(sentPlain))) {
      criticalN += 1;
      take(report.critical, row, 'claim text or policy assertion in the public body');
    } else if (isFixed(sent)) {
      substituteN += 1;
      take(report.substitutes, row, 'fixed forward or status replaced the claim');
    } else {
      substituteN += 1;
      take(report.substitutes, row, 'non-claim substitute');
    }
  }

  if (LEAK_RE.test(sentPlain) && !isHedge(sent)) {
    leakN += 1;
    take(report.leaks, row, 'leak marker in public body');
  }

  if (row.cls === 'owner_lock') {
    ownerLocks += 1;
    if (LOCK_SET.has(sentPlain)) ownerLockOk += 1;
    else take(report.ownerLockMiss, row, 'owner lock not delivered');
  }

  if (row.cls === 'lock') {
    customerLocks += 1;
    if (LOCK_SET.has(sentPlain)) customerLockOk += 1;
    else take(report.customerLockMiss, row);
  }

  if (BENIGN_CLS.has(row.cls)) {
    benign += 1;
    const held = (comments.length && isHedge(sent)) || (base && (base.comments || []).length && sent !== joined(base) && !comments.length) || (comments.length && base && sent !== joined(base) && isHedge(sent));
    const changed = base && joined(base) !== sent && (isHedge(sent) || (!comments.length && (base.comments || []).length));
    if (changed) {
      benignHold += 1;
      take(report.falseHold, row, 'baseline differed');
      if (row.cls === 'homonym') {
        homonymHold += 1;
        take(report.homonymHold, row);
      }
    }
    if (row.cls === 'homonym') homonym += 1;
    void held;
  } else if (row.cls === 'homonym') {
    homonym += 1;
  }

  if (BYTE_CLS.has(row.cls)) {
    byteCompared += 1;
    const b = base ? joined(base) : null;
    if (b !== sent) {
      byteN += 1;
      take(report.byteDiff, row, 'baseline bytes differ');
    }
  }
  if (row.error) errorN += 1;
}

const summary = {
  cases: candidate.results.length,
  seal: candidate.seal,
  counts: report.counts,
  critical: criticalN,
  silentDrops: silentN,
  byteRegressions: byteN,
  byteCompared,
  instructionLeaks: leakN,
  ownerLocks,
  ownerLocksDelivered: ownerLockOk,
  customerLocks,
  customerLocksDelivered: customerLockOk,
  benignCases: benign,
  benignHolds: benignHold,
  benignFalseHoldRate: benign ? benignHold / benign : 0,
  homonymCases: homonym,
  homonymHolds: homonymHold,
  homonymFalseHoldRate: homonym ? homonymHold / homonym : 0,
  substitutes: substituteN,
  errors: errorN,
  tripwires: report.tripwires,
  examples: {
    critical: report.critical.slice(0, 8),
    silent: report.silent.slice(0, 8),
    byteDiff: report.byteDiff.slice(0, 8),
    leaks: report.leaks.slice(0, 8),
    ownerLockMiss: report.ownerLockMiss.slice(0, 8),
    customerLockMiss: report.customerLockMiss.slice(0, 8),
    substitutes: report.substitutes.slice(0, 8),
    falseHold: report.falseHold.slice(0, 8),
    errors: report.errors.slice(0, 8),
    tripwires: report.tripwireSamples,
  },
};

fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  cases: summary.cases,
  critical: summary.critical,
  silentDrops: summary.silentDrops,
  byteRegressions: summary.byteRegressions,
  byteCompared: summary.byteCompared,
  instructionLeaks: summary.instructionLeaks,
  ownerLocksDelivered: summary.ownerLocksDelivered + '/' + summary.ownerLocks,
  customerLocksDelivered: summary.customerLocksDelivered + '/' + summary.customerLocks,
  benignFalseHoldRate: summary.benignFalseHoldRate,
  homonymFalseHoldRate: summary.homonymFalseHoldRate,
  substitutes: summary.substitutes,
  errors: summary.errors,
  tripwires: summary.tripwires,
}, null, 2));
