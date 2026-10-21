'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { cases } = require('./sealed-cases');
const guard = require('../t800-payout-r10/payoutClaimGuard');

const HEDGE = guard.CLIENT_MESSAGE;

function postedOf(pub, draft) {
  if (!pub || pub.send !== true || pub.silent !== false || !pub.body) return 'silent';
  if (pub.body === draft) return 'allow';
  if (pub.body === HEDGE) return 'hedge';
  return 'other';
}

const rows = [];
const counts = {
  cases: cases.length,
  allowExpected: 0,
  hedgeExpected: 0,
  correctAllow: 0,
  correctHedge: 0,
  badPosts: 0,
  falseHolds: 0,
  silentDrops: 0,
  other: 0,
};
const byClass = {};

for (const item of cases) {
  const pub = guard.guardPublicBody(item.draft, { messages: item.messages || [] });
  const got = postedOf(pub, item.draft);
  let verdict = 'pass';
  if (got === 'silent') {
    verdict = 'silent_drop';
    counts.silentDrops += 1;
  } else if (got !== item.expect) {
    if (item.expect === 'hedge' && got === 'allow') {
      verdict = 'bad_post';
      counts.badPosts += 1;
    } else if (item.expect === 'allow' && got === 'hedge') {
      verdict = 'false_hold';
      counts.falseHolds += 1;
    } else {
      verdict = 'other';
      counts.other += 1;
    }
  } else if (item.expect === 'allow') counts.correctAllow += 1;
  else counts.correctHedge += 1;
  if (item.expect === 'allow') counts.allowExpected += 1;
  else counts.hedgeExpected += 1;
  const bucket = byClass[item.cls] || (byClass[item.cls] = { cases: 0, badPosts: 0, falseHolds: 0, silentDrops: 0, pass: 0 });
  bucket.cases += 1;
  if (verdict === 'pass') bucket.pass += 1;
  else bucket[verdict === 'bad_post' ? 'badPosts' : verdict === 'false_hold' ? 'falseHolds' : verdict === 'silent_drop' ? 'silentDrops' : 'other'] += 1;
  rows.push({
    id: item.id,
    cls: item.cls,
    lang: item.lang,
    expect: item.expect,
    got,
    verdict,
    reason: pub && pub.reason,
    citation: item.citation,
    draft: item.draft,
  });
}

const ids = new Set(rows.map((r) => r.id));
if (ids.size !== rows.length) throw new Error('duplicate case id');
if (rows.length < 150) throw new Error('fewer than 150 cases: ' + rows.length);

const summary = {
  guardSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../t800-payout-r10/payoutClaimGuard.js'))).digest('hex'),
  casesSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'sealed-cases.js'))).digest('hex'),
  counts,
  byClass,
  failures: rows.filter((r) => r.verdict !== 'pass'),
};
const out = path.join(__dirname, 'sealed-case-results.json');
fs.writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ counts, byClass, failureIds: summary.failures.map((f) => f.id + ' ' + f.verdict + ' ' + f.reason) }, null, 2));
if (counts.badPosts || counts.falseHolds || counts.silentDrops || counts.other) process.exitCode = 2;
