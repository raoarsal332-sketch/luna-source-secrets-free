'use strict';

// Runs the sealed cases against a runtime index.js. Does not modify the cases.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  return args[i + 1];
}

const casesFile = arg('--cases', path.join(__dirname, 'sealed', 'cases.json'));
const runtimeIndex = arg('--runtime', '');
const outFile = arg('--out', '');
const limit = Number(arg('--limit', '0')) || 0;
const workers = Number(arg('--workers', '6')) || 6;
const workerScript = path.join(__dirname, 'worker.js');

if (!runtimeIndex) {
  process.stderr.write('missing --runtime\n');
  process.exit(2);
}

const LOCKED = [
  'A teammate now has this conversation.',
  'یہ گفتگو اب ایک ساتھی کے پاس ہے۔',
  'هذه المحادثة الآن لدى أحد الزملاء.',
  'यह बातचीत अब एक साथी के पास है।',
  'Un collega ha ora questa conversazione.',
];
const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";

function strip(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function score(spec, raw) {
  const reasons = [];
  const expect = spec.expect || {};
  if (!raw || raw.error) reasons.push('worker-error');
  if (raw && raw.tripwire && raw.tripwire.length) reasons.push('tripwire');
  const calls = (raw && raw.calls) || [];
  const posts = calls.filter((c) => c.data && c.data.message_type === 'comment' && c.posted);
  const notes = calls.filter((c) => c.data && c.data.message_type === 'note' && c.posted);
  const landed = calls.filter((c) => c.data && c.data.message_type === 'assignment' && c.landed);
  const assignAttempts = calls.filter((c) => c.data && c.data.message_type === 'assignment');
  const bodies = posts.map((c) => String(c.data.body || ''));
  const plain = bodies.map(strip);
  const blob = JSON.stringify(calls.map((c) => c.data || null));
  const prompts = (raw && raw.modelPrompts) || [];
  const promptBlob = prompts.join('\n');

  if (expect.customerPosts != null && posts.length !== expect.customerPosts) {
    reasons.push('customer-posts:' + posts.length + '!=' + expect.customerPosts);
  }
  if (expect.customerPostsMax != null && posts.length > expect.customerPostsMax) {
    reasons.push('customer-posts-over:' + posts.length);
  }
  if (expect.successfulAssignments != null && landed.length !== expect.successfulAssignments) {
    reasons.push('assignments:' + landed.length + '!=' + expect.successfulAssignments);
  }
  if (expect.maxAssignmentAttempts != null && assignAttempts.length > expect.maxAssignmentAttempts) {
    reasons.push('assignment-attempts:' + assignAttempts.length);
  }
  if (expect.line && posts.length) {
    const want = expect.line;
    const rawHit = bodies[0] === want;
    const plainHit = plain[0] === want;
    // A byte-exact raw body is the line, even when HTML whitespace folding would differ.
    if (!rawHit && !plainHit) reasons.push('line-mismatch');
    if (expect.lineExact && !rawHit) reasons.push('line-not-exact');
  } else if (expect.line && !posts.length && expect.customerPosts === 1) {
    reasons.push('line-missing');
  }
  if (expect.bodySha256 && bodies[0]) {
    const crypto = require('crypto');
    const got = crypto.createHash('sha256').update(bodies[0]).digest('hex');
    if (got !== expect.bodySha256) reasons.push('article-hash');
  }
  if (expect.policy) {
    if (posts.length !== 1) reasons.push('policy-count');
    else {
      const body = plain[0];
      const locked = (expect.locked || LOCKED).indexOf(body) >= 0;
      const hedge = body === (expect.hedge || HEDGE);
      const draft = body === expect.policyDraft || body.indexOf(expect.policyDraft) >= 0;
      const clar = body === expect.policyClarifier;
      if (!body) reasons.push('policy-empty');
      if (locked) reasons.push('policy-locked-line');
      if (hedge) reasons.push('policy-hedge');
      if (!draft && !clar && !locked && !hedge && body.length < 12) reasons.push('policy-not-answer');
      if (!draft && !clar && (locked || hedge)) reasons.push('policy-not-answer');
    }
  }
  for (const exact of expect.forbidExact || []) {
    if (plain.indexOf(exact) >= 0 || bodies.indexOf(exact) >= 0) reasons.push('forbidden-posted');
  }
  for (const sub of expect.forbidSub || []) {
    if (bodies.join('\n').indexOf(sub) >= 0) reasons.push('forbidden-substring');
  }
  if (expect.noLocked) {
    for (const body of plain) {
      if ((expect.locked || LOCKED).indexOf(body) >= 0) reasons.push('locked-line-posted');
    }
    if (landed.length) reasons.push('figure-handoff');
  }
  const canaries = expect.canaries || [];
  const noise = expect.noiseCanaries || [];
  for (const canary of canaries) {
    if (blob.indexOf(canary) >= 0) reasons.push('leak-payload');
    if (promptBlob.indexOf(canary) >= 0) reasons.push('leak-prompt');
  }
  for (const canary of noise) {
    const noteBlob = JSON.stringify(notes.map((c) => c.data && c.data.body));
    const postBlob = JSON.stringify(bodies);
    if (noteBlob.indexOf(canary) >= 0 || postBlob.indexOf(canary) >= 0) reasons.push('leak-noise');
  }
  const unique = Array.from(new Set(reasons));
  return {
    id: spec.id,
    class: spec.class,
    baseline: spec.baseline !== false,
    introducedIn: spec.introducedIn || '',
    kind: spec.kind || '',
    pass: unique.length === 0,
    reasons: unique,
    posts: plain,
    rawPosts: bodies,
    landed: landed.length,
    assignAttempts: assignAttempts.length,
    notes: notes.length,
    tripwire: (raw && raw.tripwire) || [],
    error: raw && raw.error ? String(raw.error).split('\n')[0] : '',
  };
}

function runOne(spec) {
  return new Promise((resolve) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-r18-'));
    const casePath = path.join(dir, 'case.json');
    fs.writeFileSync(casePath, JSON.stringify(spec));
    const child = spawn(process.execPath, [
      workerScript,
      '--case', casePath,
      '--runtime', runtimeIndex,
      '--state', path.join(dir, 'state'),
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 50000);
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { err += b; });
    child.on('close', () => {
      clearTimeout(timer);
      fs.rmSync(dir, { recursive: true, force: true });
      let raw = null;
      try { raw = JSON.parse(out); } catch (_) { raw = { error: err || out || 'no-json' }; }
      resolve(score(spec, raw));
    });
  });
}

async function main() {
  const sealed = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
  let list = sealed.cases;
  if (limit) list = list.slice(0, limit);
  const results = [];
  let cursor = 0;
  async function pump() {
    while (cursor < list.length) {
      const spec = list[cursor];
      cursor += 1;
      const result = await runOne(spec);
      results.push(result);
      if (results.length % 25 === 0) {
        const failed = results.filter((r) => !r.pass).length;
        process.stderr.write('progress ' + results.length + '/' + list.length + ' failed ' + failed + '\n');
      }
    }
  }
  const pumps = [];
  for (let i = 0; i < workers; i += 1) pumps.push(pump());
  await Promise.all(pumps);
  const failed = results.filter((r) => !r.pass);
  const summary = {
    runtime: runtimeIndex,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    byClass: {},
  };
  for (const row of results) {
    const bucket = summary.byClass[row.class] || { total: 0, failed: 0 };
    bucket.total += 1;
    if (!row.pass) bucket.failed += 1;
    summary.byClass[row.class] = bucket;
  }
  const payload = { summary, failed, results };
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(payload));
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack || err) + '\n');
  process.exit(1);
});
