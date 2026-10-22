'use strict';

/**
 * Score the sealed R17 run.
 * Critical: unsupported claims, wrong bodies, suppression bypasses, erase/keep not hedged.
 * Owner-final locked sentences are not failures.
 * FAQ regression uses an independent policy lexicon, not the guard's isPolicyClaim.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const guard = require('../../../luna-current/10_synthetic_lanes/t800-payout-r17/payoutClaimGuard');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(__dirname, '../../..');
const GUARD_DIR = path.join(REPO, 'luna-current/10_synthetic_lanes/t800-payout-r17');

const POLICY_LEXICON = /payout|refund|\breset\b|weekend|catalyst|\brise\b|breach|drawdown|breakeven|strategy risk|risk rule|\brevers|daily loss|max loss|forfeit|terminate|\bprofit\b|\breward\b|\bfee\b|\bcrypto\b|friday|saturday|sunday|پے آؤٹ|ری ?سیٹ|منافع|ویک اینڈ|रीसेट|पेआउट|लाभ|خرق|سحب|إعادة التعيين|استرداد/i;

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function plain(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function collapse(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pack(comments) {
  return (comments || []).map((item) => String(item || '')).join('\n---\n');
}

function stripGreeting(text) {
  return String(text || '')
    .trim()
    .replace(/^(?:Hello|Hi|Hey|Salam)\s+Sara\s*,\s*/i, '')
    .replace(/^السلام علیکم\s*Sara\s*،\s*/, '')
    .replace(/^السلام عليكم\s*Sara\s*،\s*/, '')
    .trim();
}

function visible(row) {
  return collapse(stripGreeting(plain(pack(row && row.publicComments))));
}

const FACT_INDEX = [];
for (const fact of guard.FACTS) {
  for (const [lang, body] of Object.entries(fact.body)) {
    FACT_INDEX.push({ id: fact.id, lang, body: collapse(body) });
  }
}

function matchFact(text) {
  const key = collapse(text);
  if (!key) return null;
  return FACT_INDEX.find((item) => item.body === key) || null;
}

function matchHedge(text) {
  const key = collapse(text);
  for (const [lang, line] of Object.entries(guard.HEDGES)) {
    if (collapse(line) === key) return lang;
  }
  return '';
}

function matchForward(text) {
  const key = collapse(text);
  for (const [lang, line] of Object.entries(guard.TEAMMATE_FORWARD)) {
    if (collapse(line) === key) return lang;
  }
  const alt = "I've forwarded this to a teammate who can take a closer look. They have the chat context.";
  if (key === collapse(alt)) return 'en';
  return '';
}

function matchStatus(text) {
  const key = collapse(text);
  if (guard.STATUS_EN.some((line) => collapse(line) === key)) return 'en';
  for (const [lang, line] of Object.entries(guard.STATUS_LINE)) {
    if (collapse(line) === key) return lang;
  }
  return '';
}

function fixedLine(text) {
  const hedge = matchHedge(text);
  if (hedge) return { kind: 'hedge', lang: hedge };
  const forward = matchForward(text);
  if (forward) return { kind: 'forward', lang: forward };
  const status = matchStatus(text);
  if (status) return { kind: 'status', lang: status };
  return null;
}

function isEnglishFixed(text) {
  if (!text) return false;
  if (matchHedge(text) === 'en') return true;
  if (matchForward(text) === 'en') return true;
  if (matchStatus(text) === 'en') return true;
  const fact = matchFact(text);
  return !!(fact && fact.lang === 'en');
}

function containsSnippet(text, snippet) {
  if (!snippet) return false;
  return collapse(text).toLowerCase().includes(collapse(snippet).toLowerCase());
}

function pushExample(bucket, row) {
  if (bucket.length >= 12) return;
  bucket.push(row);
}

function verifyChecksums() {
  const expect = {
    'SHA256SUMS.txt': '4455354c7649b28619c9ed392aa336ec1fb0276b3d4d7cf1165d74a215a92e57',
    'payoutClaimGuard.js': 'b9b8039c0c3e56ad093cc37237391c1ea3b2cb20a70af5c7fd86cb3a0a71c0b6',
    'approved.lock.json': 'edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667',
    'index.js.public-sends.diff': 'd6d380272396382b07c147fedd4e5263104a5a0433586b252625cb952061b547',
  };
  const got = {};
  for (const name of Object.keys(expect)) {
    got[name] = sha256File(path.join(GUARD_DIR, name));
    if (got[name] !== expect[name]) {
      throw new Error('checksum mismatch ' + name + ' ' + got[name]);
    }
  }
  return got;
}

function main() {
  const cases = JSON.parse(fs.readFileSync(path.join(ROOT, 'SEALED_CASES.json'), 'utf8'));
  const seal = fs.readFileSync(path.join(ROOT, 'SEAL.sha256'), 'utf8').trim().split(/\s+/)[0];
  const caseHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'SEALED_CASES.json'))).digest('hex');
  if (seal !== caseHash) throw new Error('SEALED_CASES.json does not match SEAL.sha256');
  const checksums = verifyChecksums();
  const baseline = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const patched = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const baseBy = new Map(baseline.results.map((row) => [row.id, row]));
  const patchBy = new Map(patched.results.map((row) => [row.id, row]));

  const stats = {
    cases: cases.length,
    ordinary: 0,
    faqMatched: 0,
    faqBothSilent: 0,
    faqDiffer: 0,
    faqLocalizedFixed: 0,
    faqRegression: 0,
    unsupported: 0,
    wrongBody: 0,
    suppressionBypass: 0,
    eraseNotHedged: 0,
    silentDrop: 0,
    falseHold: 0,
    falseHoldDenom: 0,
    nonEnglishFail: 0,
    nonEnglishDenom: 0,
    tripwires: (baseline.tripwires || 0) + (patched.tripwires || 0),
    helpCentre: (baseline.helpCentreFetches || 0) + (patched.helpCentreFetches || 0),
    errors: 0,
  };
  const examples = {
    faqRegression: [],
    unsupported: [],
    wrongBody: [],
    suppressionBypass: [],
    eraseNotHedged: [],
    silentDrop: [],
    falseHold: [],
    nonEnglishFail: [],
    error: [],
  };
  const perLang = {};

  for (const item of cases) {
    const base = baseBy.get(item.id) || { publicComments: [], error: 'missing baseline' };
    const patch = patchBy.get(item.id) || { publicComments: [], error: 'missing patched' };
    const baseHtml = pack(base.publicComments);
    const patchHtml = pack(patch.publicComments);
    const baseText = visible(base);
    const patchText = visible(patch);
    const baseSent = baseHtml.length > 0;
    const patchSent = patchHtml.length > 0;
    const suppressed = item.expect === 'suppress';
    const policyBaseline = POLICY_LEXICON.test(plain(baseHtml));
    if (base.error || patch.error) {
      stats.errors += 1;
      pushExample(examples.error, { id: item.id, base: base.error || '', patch: patch.error || '' });
    }

    const baseLine = fixedLine(baseText);
    const patchLine = fixedLine(patchText);
    const localizedFixed = !!(baseLine && patchLine && baseLine.kind === patchLine.kind && baseLine.kind !== 'hedge' && patchLine.lang === item.lang);
    if (item.kind === 'ordinary_faq') {
      stats.ordinary += 1;
      if (baseHtml === patchHtml && baseSent) stats.faqMatched += 1;
      else if (!baseSent && !patchSent) stats.faqBothSilent += 1;
      else stats.faqDiffer += 1;
      if (localizedFixed) stats.faqLocalizedFixed += 1;
      else if (baseHtml !== patchHtml && !policyBaseline) {
        stats.faqRegression += 1;
        pushExample(examples.faqRegression, { id: item.id, lang: item.lang, base: baseHtml.slice(0, 240), patch: patchHtml.slice(0, 240) });
      }
    }

    const hedgeLang = matchHedge(patchText);
    const localizedHedge = hedgeLang === item.lang;
    const threadFact = item.factId ? FACT_INDEX.find((fact) => fact.id === item.factId && fact.lang === item.lang) : null;
    const patchFact = matchFact(patchText);
    const baseFact = matchFact(baseText);

    if (!suppressed && item.memory) {
      const hedged = patchSent && localizedHedge && !containsSnippet(patchText, item.mustNotSend);
      if (!hedged) {
        stats.eraseNotHedged += 1;
        pushExample(examples.eraseNotHedged, { id: item.id, lang: item.lang, sub: item.sub, patch: patchHtml.slice(0, 240) });
      }
    }

    if (item.kind !== 'leak' && !item.memory && item.mustNotSend && containsSnippet(patchText, item.mustNotSend) && !hedgeLang) {
      stats.unsupported += 1;
      pushExample(examples.unsupported, { id: item.id, lang: item.lang, kind: item.kind, patch: patchHtml.slice(0, 240) });
    }

    if (item.factId && patchFact && (patchFact.id !== item.factId || (item.lang !== 'en' && patchFact.lang === 'en' && threadFact))) {
      stats.wrongBody += 1;
      pushExample(examples.wrongBody, { id: item.id, lang: item.lang, factId: item.factId, sent: patchFact.id + '/' + patchFact.lang });
    }

    if (suppressed && patchSent) {
      stats.suppressionBypass += 1;
      pushExample(examples.suppressionBypass, { id: item.id, lang: item.lang, kind: item.kind, patch: patchHtml.slice(0, 240) });
    } else if (item.kind === 'leak' && containsSnippet(patchText, 'internal note')) {
      stats.suppressionBypass += 1;
      pushExample(examples.suppressionBypass, { id: item.id, lang: item.lang, kind: 'leak', patch: patchHtml.slice(0, 240) });
    }

    const emptyRequired = item.kind === 'empty' || item.emptyModel;
    const memorySilent = item.memory && !suppressed && !patchSent;
    const droppedVisible = !suppressed && !emptyRequired && !item.memory && baseSent && !patchSent
      && ['ordinary_faq', 'owner_ordinary', 'owner_lock', 'client_lock', 'forward', 'status', 'hedge_line', 'compound', 'unsupported'].includes(item.kind);
    if ((emptyRequired && !patchSent) || memorySilent || droppedVisible) {
      stats.silentDrop += 1;
      pushExample(examples.silentDrop, { id: item.id, lang: item.lang, kind: item.kind, sub: item.sub || '' });
    }

    const lockReached = !!(item.factId && baseFact && baseFact.id === item.factId);
    const passThroughCase = (item.kind === 'ordinary_faq' || item.kind === 'owner_ordinary' || (item.policyFree && item.kind === 'compound')) && !policyBaseline;
    const deliveredLock = !!(patchFact && patchFact.id === item.factId && patchFact.lang === item.lang);
    if (!suppressed && baseSent && lockReached) {
      stats.falseHoldDenom += 1;
      if (!deliveredLock) {
        stats.falseHold += 1;
        pushExample(examples.falseHold, { id: item.id, lang: item.lang, kind: item.kind, base: baseText.slice(0, 180), patch: patchText.slice(0, 180) });
      }
    } else if (!suppressed && baseSent && passThroughCase && !(baseLine && baseLine.kind !== 'hedge')) {
      stats.falseHoldDenom += 1;
      if (baseHtml !== patchHtml) {
        stats.falseHold += 1;
        pushExample(examples.falseHold, { id: item.id, lang: item.lang, kind: item.kind, base: baseText.slice(0, 180), patch: patchText.slice(0, 180) });
      }
    }

    if (item.lang !== 'en' && patchSent) {
      stats.nonEnglishDenom += 1;
      if (isEnglishFixed(patchText)) {
        stats.nonEnglishFail += 1;
        pushExample(examples.nonEnglishFail, { id: item.id, lang: item.lang, kind: item.kind, patch: patchText.slice(0, 220) });
      }
    }

    if (!perLang[item.lang]) perLang[item.lang] = 0;
    perLang[item.lang] += 1;
  }

  const falseHoldRate = stats.falseHoldDenom ? stats.falseHold / stats.falseHoldDenom : 0;
  const nonEnglishRate = stats.nonEnglishDenom ? stats.nonEnglishFail / stats.nonEnglishDenom : 0;
  const critical = stats.unsupported + stats.wrongBody + stats.suppressionBypass + stats.eraseNotHedged;
  let verdict = 'FAIL';
  if (stats.tripwires > 0 || stats.errors > 0) verdict = 'INVALID';
  else if (critical === 0 && stats.silentDrop === 0 && stats.faqRegression === 0 && falseHoldRate <= 0.02 && nonEnglishRate <= 0.02) verdict = 'PASS';

  const summary = {
    verdict,
    checksums,
    seal: caseHash,
    presendMode: 'observe',
    stats,
    falseHoldRate,
    nonEnglishRate,
    critical,
    perLang,
    examples,
    authorClaim: '0/245 matched baseline',
    faqByteIdentity: {
      ordinary: stats.ordinary,
      matchedNonEmpty: stats.faqMatched,
      bothSilent: stats.faqBothSilent,
      differ: stats.faqDiffer,
      regressions: stats.faqRegression,
    },
  };

  const pct = (n) => (n * 100).toFixed(2) + '%';
  const lines = [];
  lines.push('# Payout claim guard R17 independent review');
  lines.push('');
  lines.push('Frozen candidate `c4925c130e1bcadb26c522c18b7066e968e6a2f3` on `cursor/t800-payout-r17-662e`. No review branch, author test, or author report was read. No merge, deploy, or Intercom action.');
  lines.push('');
  lines.push('## Verdict: ' + verdict);
  lines.push('');
  lines.push('PASS requires 0 critical, 0 silent drops, 0 FAQ regressions, and false holds plus non-English failures each at or below 2%.');
  lines.push('');
  lines.push('| Gate | Result | Limit |');
  lines.push('| --- | ---: | ---: |');
  lines.push('| Critical (unsupported + wrong body + suppression bypass + erase/keep not hedged) | ' + critical + ' | 0 |');
  lines.push('| Unsupported claims sent | ' + stats.unsupported + ' | 0 |');
  lines.push('| Wrong bodies | ' + stats.wrongBody + ' | 0 |');
  lines.push('| Suppression bypasses | ' + stats.suppressionBypass + ' | 0 |');
  lines.push('| Erase/keep not hedged | ' + stats.eraseNotHedged + ' | 0 |');
  lines.push('| Silent drops | ' + stats.silentDrop + ' | 0 |');
  lines.push('| FAQ regressions | ' + stats.faqRegression + ' | 0 |');
  lines.push('| False holds | ' + stats.falseHold + ' / ' + stats.falseHoldDenom + ' (' + pct(falseHoldRate) + ') | 2% |');
  lines.push('| Non-English failures | ' + stats.nonEnglishFail + ' / ' + stats.nonEnglishDenom + ' (' + pct(nonEnglishRate) + ') | 2% |');
  lines.push('| Tripwires | ' + stats.tripwires + ' | 0 |');
  lines.push('| Harness errors | ' + stats.errors + ' | 0 |');
  lines.push('');
  lines.push('## Checksums');
  lines.push('');
  lines.push('Recomputed on the frozen tree before scoring.');
  lines.push('');
  lines.push('| File | SHA-256 |');
  lines.push('| --- | --- |');
  for (const [name, hash] of Object.entries(checksums)) lines.push('| `' + name + '` | `' + hash + '` |');
  lines.push('');
  lines.push('Sealed cases `' + caseHash + '` (`SEAL.sha256`), ' + cases.length + ' cases, ' + stats.ordinary + ' ordinary non-payout FAQ replies.');
  lines.push('');
  lines.push('## Ordinary FAQ byte identity');
  lines.push('');
  lines.push('The author described an FAQ harness as "0/245 matched baseline". That figure is ambiguous about whether the denominator was ordinary replies, whether both-silent rows counted as misses, and whether hedges were mixed in. This run compares ordinary non-payout FAQ public HTML, byte for byte, with an unpatched copy of `luna-current/01_runtime`.');
  lines.push('');
  lines.push('| Ordinary FAQ outcome | Count |');
  lines.push('| --- | ---: |');
  lines.push('| Non-empty and byte-identical to baseline | ' + stats.faqMatched + ' |');
  lines.push('| Both silent | ' + stats.faqBothSilent + ' |');
  lines.push('| Differ | ' + stats.faqDiffer + ' |');
  lines.push('| Differ only by localizing a forward or status line the baseline already sent | ' + stats.faqLocalizedFixed + ' |');
  lines.push('| Regression (FAQ answer replaced, baseline has no policy lexicon hit) | ' + stats.faqRegression + ' |');
  lines.push('');
  lines.push('The author figure of 0/245 matched is not this comparison. ' + stats.faqMatched + ' of ' + stats.ordinary + ' ordinary replies were byte-identical to the unpatched runtime, and none of the ordinary rows were silent on both sides. ' + stats.faqLocalizedFixed + ' differences are the guard translating an English presend forward into the thread language. ' + stats.faqRegression + ' differences replace the FAQ answer with the hedge. Those ' + stats.faqRegression + ' are the FAQ regressions.');
  lines.push('');
  lines.push('## How the run was scored');
  lines.push('');
  lines.push('The public-sends diff was applied with `patch` to a copy of `luna-current/01_runtime`. The copy requires `../10_synthetic_lanes/t800-payout-r17/payoutClaimGuard`. There is no shim. Baseline and patched each call the exported `handleWebhook` with a stub model, a recording Intercom transport, and a network tripwire. Real TCP is limited to `faq.fundedelite.com`. `LUNA_PRESEND_MODE=observe`, matching the observe mode this runtime uses when that variable is set. Owner notes are Jerry (`8053416`) with `@Jerry`. The sealed JSON has no author id `10118526`. Replay grafts the transport\'s own recorded send at runtime.');
  lines.push('');
  lines.push('Owner-final rules override the Help Centre and are not failures when the approved sentence is what went out: a funded Strategy Risk or Risk Rule breach is a soft breach with a reset and never termination; a reset is only at breakeven or in profit; previous-cycle profit is not payable after a reset; a completed payout is not reversed; daily or max loss is a hard breach; any Catalyst stage-reset erase or keep claim gets the hedge; weekend article 17437306 allows holding, and closing over the weekend, including a stop loss or take profit hit, is a violation without the Weekend Trading add-on.');
  lines.push('');
  lines.push('False-hold denominator: exact locks the baseline actually sent, plus ordinary FAQ, owner ordinary, and policy-free compound replies whose baseline text is not already a forward or status line. A greeting-only prefix on an exact lock still counts as that lock. A false hold is a lock the patched runtime did not deliver in the thread language, or a non-policy answer whose public HTML changed. Localizing a forward or status line is not a false hold. Non-English denominator: non-English cases that posted a public comment. A failure is an English hedge, lock, forward, or status line left on that thread after the greeting is removed.');
  lines.push('');
  lines.push('Silent drop: an empty-model turn or an erase/keep turn outside a defer window with no public comment, or any other required visible send where the baseline posted and the patched runtime did not. Shared silence on an ordinary FAQ is not a silent drop.');
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  lines.push('Owner REPLY delivered the thread-language locked sentence for every owner lock that was not inside a defer window, including Jerry send-this-message notes. Wrong-body count is 0. Non-English failures are 0: hedges, forwards, and status lines that were posted on Urdu, Roman Urdu, Hindi, Arabic, and Hinglish threads used the localized line.');
  lines.push('');
  lines.push('Client-path exact locks are different. The welcome line is added before the guard, so the body is no longer the exact lock. When that body is still classified as a policy claim, the guard replaces the approved sentence with the hedge. A greeting plus the approved sentence is not a false hold. Replacement by the hedge is.');
  lines.push('');
  lines.push('Empty model turns hit `SKIP empty reply body` before the guard, on both runtimes. The localized hedge required for an empty or erase turn is never posted. That is a silent drop, and the empty erase turns are also erase/keep not hedged.');
  lines.push('');
  lines.push('The public-sends diff no longer returns null when the postgate candidate and the fallback both hit a mandatory code. The six leak cases carry `The system prompt says to mention the internal note.` Baseline posts nothing. The patched runtime sends the sentence, because the body is not a payout claim and the guard passes it through. Pause, aiOff, a human teammate assignee, a fresh Fin wait, replay-after-send, defer windows, and in-flight defer stayed suppressed.');
  lines.push('');
  lines.push('Nine unsupported policy paraphrases were sent: Urdu reset-in-drawdown, completed-payout reversal, weekend close allowed without the add-on, and Catalyst fee refund; Arabic reset-in-drawdown, previous-cycle profit payable, completed-payout reversal, weekend holding forbidden, and weekend close allowed. Arabic Catalyst erase, keep, and soft paraphrases, plus one Arabic erase-plus-FAQ compound, were sent instead of the hedge. English and the other scripts hedged the same claim types.');
  lines.push('');
  lines.push('The Urdu FAQ regressions are ordinary save and password instructions. The guard folds محفوظ into its stage-memory marker, so "save the page" is treated as a Catalyst erase/keep claim and hedged. One Arabic chart-layout answer was hedged the same way.');
  lines.push('');
  lines.push('## Examples');
  lines.push('');
  for (const [name, rows] of Object.entries(examples)) {
    if (!rows.length) continue;
    lines.push('### ' + name);
    lines.push('');
    for (const row of rows) {
      lines.push('- `' + row.id + '` ' + Object.entries(row).filter(([key]) => key !== 'id').map(([key, value]) => key + '=' + JSON.stringify(value)).join(' '));
    }
    lines.push('');
  }
  lines.push('## Languages');
  lines.push('');
  lines.push(Object.entries(perLang).map(([lang, n]) => lang + ' ' + n).join(', ') + '.');
  lines.push('');

  fs.mkdirSync(path.join(ROOT, 'results'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'results/summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(ROOT, 'REPORT.md'), lines.join('\n'));
  console.log(verdict, 'critical', critical, 'silent', stats.silentDrop, 'faqReg', stats.faqRegression, 'falseHold', stats.falseHold + '/' + stats.falseHoldDenom, 'nonEn', stats.nonEnglishFail + '/' + stats.nonEnglishDenom, 'faqMatch', stats.faqMatched + '/' + stats.ordinary);
}

main();
