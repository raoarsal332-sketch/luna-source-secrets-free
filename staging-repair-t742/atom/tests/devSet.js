'use strict';

/**
 * Isolated Atom dev-set test. Reads staging-repair-t742/atom/atom_dev_set.json only.
 * Does not load held-out, sealed, or reviewer files.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const atom = require('../atomModule');

const DEV_PATH = path.join(__dirname, '..', 'atom_dev_set.json');
const SKELETON_PATH = path.join(__dirname, 'skeleton-nonascii.tsv');

function loadSkeleton() {
  const map = new Map();
  for (const line of fs.readFileSync(SKELETON_PATH, 'utf8').split('\n')) {
    if (!line) continue;
    const [src, dst] = line.split('\t');
    const s = String.fromCodePoint(parseInt(src, 16));
    const d = String.fromCodePoint(...dst.split(' ').map((h) => parseInt(h, 16)));
    map.set(s, d);
  }
  return map;
}

const SKELETON = loadSkeleton();

function normalizeForRoute(raw) {
  let s = String(raw == null ? '' : raw).normalize('NFKC');
  s = s.replace(/\p{Cf}/gu, '');
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    const latin = (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a);
    const digit = cp >= 0x30 && cp <= 0x39;
    if (!latin && !digit && SKELETON.has(ch)) out += SKELETON.get(ch);
    else out += ch;
  }
  out = out.toLowerCase();
  out = out.replace(/(?<![a-z0-9'])(?:[a-z][ .\-_*·]){2,}[a-z](?![a-z0-9'])/g, (m) => m.replace(/[ .\-_*·]/g, ''));
  return out;
}

function sameSpans(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].start !== b[i].start || a[i].end !== b[i].end) return false;
  }
  return true;
}

function goldDecision(row) {
  if (!row.decide) return null;
  if (row.decide.action === 'SEND') return { action: 'SEND', partId: row.decide.partId };
  return { action: 'ABSTAIN', code: row.decide.code, policy: row.decide.policy == null ? null : row.decide.policy };
}

function matches(got, gold) {
  if (!gold) return got.action !== 'SEND';
  if (got.action !== gold.action) return false;
  if (gold.action === 'SEND') return got.partId === gold.partId;
  return got.code === gold.code && (got.policy || null) === (gold.policy || null);
}

function main() {
  const dev = JSON.parse(fs.readFileSync(DEV_PATH, 'utf8'));
  const devSha = crypto.createHash('sha256').update(fs.readFileSync(DEV_PATH)).digest('hex');
  const catalog = atom.verifyCatalog();
  const exclusive = [];
  const claimMiss = [];
  const mismatches = [];
  let personal = { n: 0, exact: 0 };
  let mixed = { n: 0, exact: 0 };
  let correct = 0;
  let wrong = 0;
  let abstain = 0;
  let fr = 0;
  let goldSend = 0;
  let noneCalledSend = 0;

  for (const row of dev.rows) {
    const normalized = normalizeForRoute(row.text);
    const gotClaim = atom.claim({ text: row.text, normalized, prior: null });
    if (gotClaim.kind !== row.claim.kind || gotClaim.entity !== row.claim.entity || !sameSpans(gotClaim.evidenceSpans, row.claim.evidenceSpans)) {
      claimMiss.push({ id: row.id, got: gotClaim, gold: row.claim, normalized });
    }
    if (row.claim.kind !== 'exclusive') {
      const stray = atom.decide({ text: row.text, normalized, prior: null, claim: gotClaim });
      if (stray.action === 'SEND') noneCalledSend += 1;
      continue;
    }
    exclusive.push(row);
    const got = atom.decide({ text: row.text, normalized, prior: null, gate: { lang: 'en' }, claim: gotClaim });
    const gold = goldDecision(row);
    const ok = matches(got, gold);
    if (ok) correct += 1;
    else {
      wrong += 1;
      if (mismatches.length < 80) {
        mismatches.push({
          id: row.id,
          gold: gold.action === 'SEND' ? gold.partId : gold.code + (gold.policy ? ' ' + gold.policy : ''),
          got: got.action === 'SEND' ? got.partId : got.code + (got.policy ? ' ' + got.policy : ''),
          explain: atom.explain(normalized),
          text: row.text,
        });
      }
    }
    if (got.action === 'ABSTAIN') abstain += 1;
    if (gold.action === 'SEND') {
      goldSend += 1;
      if (!ok) fr += 1;
    }
    if (row.ask === 'personal') {
      personal.n += 1;
      if (got.action === 'SEND' && got.partId === atom.REFUSE_ID) personal.exact += 1;
    }
    if (row.ask === 'mixed') {
      mixed.n += 1;
      if (got.action === 'SEND' && got.partId === atom.REFUSE_ID) mixed.exact += 1;
    }
  }

  const report = {
    devSha256: devSha,
    rows: dev.rows.length,
    catalog,
    shared: atom.sharedStatus(),
    claimMiss: claimMiss.length,
    exclusive: exclusive.length,
    correct: correct + '/' + exclusive.length,
    wrong: wrong + '/' + exclusive.length,
    abstain: abstain + '/' + exclusive.length,
    falseRefusals: fr + '/' + goldSend,
    personalExact: personal.exact + '/' + personal.n,
    mixedExact: mixed.exact + '/' + mixed.n,
    noneOrSharedSent: noneCalledSend,
  };
  const grid = [];
  for (const T of [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6]) {
    let gCorrect = 0;
    let gFr = 0;
    let gSend = 0;
    for (const row of exclusive) {
      const normalized = normalizeForRoute(row.text);
      const gotClaim = atom.claim({ text: row.text, normalized, prior: null });
      const got = atom.decide({ normalized, gate: { lang: 'en' }, claim: gotClaim, params: { T } });
      const gold = goldDecision(row);
      const ok = matches(got, gold);
      if (ok) gCorrect += 1;
      if (gold.action === 'SEND') {
        gSend += 1;
        if (!ok) gFr += 1;
      }
    }
    const qualifies = gCorrect / exclusive.length >= 0.95 && gSend > 0 && gFr / gSend <= 0.05;
    grid.push({ T, correct: gCorrect + '/' + exclusive.length, falseRefusals: gFr + '/' + gSend, qualifies });
  }
  report.designGrid = grid;
  report.designGridQualifies = grid.some((row) => row.qualifies);

  console.log(JSON.stringify(report, null, 2));
  if (claimMiss.length) {
    console.log('CLAIM_MISS');
    for (const m of claimMiss.slice(0, 15)) console.log(m.id, JSON.stringify(m.got), JSON.stringify(m.gold), JSON.stringify(m.normalized));
  }
  console.log('MISMATCHES', mismatches.length);
  for (const m of mismatches) {
    console.log('---', m.id);
    console.log(' gold', m.gold);
    console.log(' got ', m.got);
    console.log(' exp ', JSON.stringify(m.explain));
    console.log(' text', m.text);
  }
  if (!catalog.baseOk || !catalog.sendableOk) process.exitCode = 1;
  if (claimMiss.length || wrong || noneCalledSend) process.exitCode = 1;
  if (personal.exact !== personal.n || mixed.exact !== mixed.n) process.exitCode = 1;
}

main();
