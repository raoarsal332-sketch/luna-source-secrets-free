'use strict';
/**
 * One-shot held-out scorer. Exits 2 on overlap with dev or the T795 tests
 * and does not print scores in that case.
 */
const fs = require('fs');
const path = require('path');
const G = require('./handoffClaimGate.js');
const HELD = require('./heldout_set.js');
const DEV = require('./dev_set.js');

function norm(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function quotedStrings(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1] != null ? m[1] : m[2]);
  return out;
}

const banned = new Set();
for (const item of DEV.positive.concat(DEV.negative)) banned.add(norm(item.text));
for (const s of quotedStrings(path.join(__dirname, 'test_t795_claim_gate.js'))) {
  if (s.length > 12) banned.add(norm(s));
}

const overlap = [];
for (const item of HELD.positive.concat(HELD.negative)) {
  if (banned.has(norm(item.text))) overlap.push(item.text);
}
if (overlap.length) {
  console.log('OVERLAP ' + overlap.length);
  overlap.forEach((s) => console.log(' -', s));
  process.exit(2);
}

const langs = ['en', 'ru', 'ur', 'hi', 'ar', 'fr'];
function score(items, want) {
  const rows = items.map((item) => ({ ...item, got: G.hasHandoffClaim(item.text) }));
  const bad = rows.filter((r) => r.got !== want);
  return { rows, bad, n: rows.length, hit: rows.length - bad.length };
}

const pos = score(HELD.positive, true);
const neg = score(HELD.negative, false);
const recall = pos.hit / pos.n;
const overblock = neg.bad.length / neg.n;

function byLang(items, want) {
  const out = {};
  for (const lang of langs) {
    const subset = items.filter((x) => x.lang === lang);
    const hit = subset.filter((x) => G.hasHandoffClaim(x.text) === want).length;
    out[lang] = { n: subset.length, hit, miss: subset.length - hit };
  }
  return out;
}

const report = {
  positive: pos.n,
  caught: pos.hit,
  missed: pos.bad.length,
  recall,
  negative: neg.n,
  falsePositives: neg.bad.length,
  overblock,
  posByLang: byLang(HELD.positive, true),
  negByLang: byLang(HELD.negative, false),
  misses: pos.bad.map((r) => ({ lang: r.lang, text: r.text })),
  overblocks: neg.bad.map((r) => ({ lang: r.lang, text: r.text })),
};
console.log(JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(__dirname, 'heldout_eval.json'), JSON.stringify(report, null, 2));
