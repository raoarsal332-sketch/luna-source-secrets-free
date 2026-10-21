'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { scanTree } = require('./static-scan');

const ROOT = path.resolve(__dirname, '../../..');
const SEAL_FILE = path.join(ROOT, 'review/credential-r13/cases/sealed-cases.json');
const SEAL_MD = path.join(ROOT, 'review/credential-r13/SEAL.md');
const WORKER = path.join(__dirname, 'worker.js');
const SANDBOX = '/tmp/r13-review-sandbox';
const RUNTIME = path.join(SANDBOX, 'luna-current/01_runtime');
const DIFF = '/tmp/r13-src/proposed-integration.diff';
const EXPECTED = '5b3fc28f6ef56fbfe8de92e72a8dd29a6d0b86bd7585ea34db3ea2ca1ed3dafb';

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function verifySeal() {
  const hash = hashFile(SEAL_FILE);
  const md = fs.readFileSync(SEAL_MD, 'utf8');
  if (hash !== EXPECTED || md.indexOf(EXPECTED) < 0) {
    throw new Error('seal mismatch ' + hash);
  }
  return hash;
}

function copyTree(src, dest) {
  fs.cpSync(src, dest, { recursive: true, dereference: false });
}

function prepareSandbox() {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.mkdirSync(SANDBOX, { recursive: true });
  copyTree(path.join(ROOT, 'luna-current'), path.join(SANDBOX, 'luna-current'));
  copyTree(path.join(ROOT, 'luna-export'), path.join(SANDBOX, 'luna-export'));
  const diff = fs.existsSync(DIFF)
    ? DIFF
    : path.join(SANDBOX, 'proposed-integration.diff');
  if (!fs.existsSync(diff)) {
    throw new Error('integration diff missing');
  }
  const { execFileSync } = require('child_process');
  execFileSync('patch', ['-p1', '--forward', '--input', diff], { cwd: SANDBOX, stdio: 'inherit' });
  const link = (name, target) => {
    const at = path.join(RUNTIME, name);
    if (fs.existsSync(at)) fs.rmSync(at, { recursive: true, force: true });
    fs.symlinkSync(target, at);
  };
  link('statePresend', path.join(SANDBOX, 'luna-current/02_statePresend'));
  link('luna-maintainer', path.join(SANDBOX, 'luna-current/03_luna-maintainer'));
  execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: RUNTIME, stdio: 'inherit' });
}

function cleanEnv(extra) {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME || '/tmp',
    LANG: 'C',
    NODE_NO_WARNINGS: '1',
  };
  return Object.assign(env, extra);
}

function runWorker(extra, outFile, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [WORKER], {
      cwd: RUNTIME,
      env: cleanEnv(Object.assign({
        R13_RUNTIME: RUNTIME,
        R13_CASES: SEAL_FILE,
        R13_OUT: outFile,
      }, extra)),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (buf) => {
      stderr += buf.toString('utf8');
      if (stderr.length > 200000) stderr = stderr.slice(-100000);
      process.stderr.write(buf);
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      let parsed = null;
      if (fs.existsSync(outFile)) {
        try { parsed = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (_) { parsed = null; }
      }
      resolve({ code: code, signal: signal, stderr: stderr.slice(-4000), parsed: parsed });
    });
  });
}

function tally(results) {
  const rows = [];
  for (const bucket of results) {
    if (bucket && bucket.results) rows.push(...bucket.results);
  }
  const byId = new Map();
  for (const row of rows) byId.set(row.id + ':' + (row.phase || ''), row);
  return rows;
}

function summarize(rows, scan) {
  const leaks = rows.filter((r) => r.group === 'leak' || r.group === 'taint' || r.group === 'recovery');
  const leakFails = leaks.filter((r) => r.verdict !== 'pass');
  const secretBytes = leaks.reduce((n, r) => n + ((r.secretBytes && r.secretBytes.total) || 0), 0);
  const spread = rows.filter((r) => r.group === 'spread');
  const eligible = spread.filter((r) => r.expect === 'exact-template');
  const eligibleMiss = eligible.filter((r) => r.verdict !== 'pass');
  const ineligible = spread.filter((r) => r.shape === 'ineligible' || (r.expect === 'no-template' && r.shape !== 'borderline' && r.shape !== 'eligible'));
  const unauthorized = rows.filter((r) => (r.unauthorizedTemplate || 0) > 0 || ((r.exactTemplateSends || 0) > 0 && r.expect === 'no-template'));
  const borderline = spread.filter((r) => r.shape === 'borderline');
  const over = rows.filter((r) => r.group === 'overblock' || r.verdict === 'overblock');
  const overCases = rows.filter((r) => r.group === 'overblock');
  const overFails = overCases.filter((r) => r.verdict === 'overblock');
  const overHeld = overCases.filter((r) => r.verdict === 'held-other');
  const overDenom = overCases.length - overHeld.length;
  const overRate = overDenom ? overFails.length / overDenom : 1;
  const failClosed = rows.filter((r) => r.group === 'fail-closed');
  const rawException = failClosed.filter((r) => r.verdict !== 'pass');
  const boundary = rows.filter((r) => r.group === 'boundary');
  const bypasses = boundary.filter((r) => r.verdict === 'bypass');
  const productUnguarded = (scan.unguarded || []).filter((f) => {
    return !/smoke_|07_selftests|08_repair|09_failfix|06_tools\/bin|test\//.test(f.file);
  });
  const pass = secretBytes === 0
    && leakFails.length === 0
    && eligibleMiss.length === 0
    && unauthorized.length === 0
    && bypasses.length === 0
    && productUnguarded.length === 0
    && rawException.length === 0
    && eligible.length > 0
    && overRate <= 0.01;
  return {
    verdict: pass ? 'PASS' : 'NEEDS CHANGES',
    secretBytes: secretBytes,
    leakCases: leaks.length,
    leakFails: leakFails.length,
    eligible: eligible.length,
    eligibleMiss: eligibleMiss.length,
    unauthorizedTemplate: unauthorized.length,
    borderline: borderline.map((r) => ({ id: r.id, verdict: r.verdict, writes: r.writes, borderline: r.borderline })),
    overCases: overCases.length,
    overFails: overFails.length,
    overHeld: overHeld.length,
    overDenom: overDenom,
    overRate: overRate,
    failClosedFails: rawException.length,
    runtimeBypasses: bypasses.map((r) => r.id + ':' + (r.probe || r.shape)),
    staticUnguardedProduct: productUnguarded,
    staticUnguardedAll: scan.unguarded || [],
    staticFiles: scan.files,
  };
}

async function main() {
  const hash = verifySeal();
  process.stderr.write('seal ok ' + hash + '\n');
  prepareSandbox();
  const scan = scanTree(SANDBOX);
  const outDir = path.join(ROOT, 'review/credential-r13/results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'static-scan.json'), JSON.stringify({
    files: scan.files,
    findingCount: scan.findings,
    unguarded: scan.unguarded,
  }, null, 2));

  const jobs = [
    ['boot', { R13_GROUPS: 'boundary,fail-closed,spread', R13_STATE: '/tmp/r13-state-boot' }, 180000],
    ['overblock', { R13_GROUPS: 'overblock', R13_STATE: '/tmp/r13-state-over' }, 600000],
    ['leak', { R13_GROUPS: 'leak', R13_STATE: '/tmp/r13-state-leak' }, 900000],
    ['rest', { R13_GROUPS: 'taint,recovery', R13_STATE: '/tmp/r13-state-rest' }, 180000],
  ];
  const parsed = [];
  for (const [name, env, timeout] of jobs) {
    fs.mkdirSync(env.R13_STATE, { recursive: true });
    const outFile = path.join(outDir, name + '.json');
    process.stderr.write('job ' + name + '\n');
    const result = await runWorker(env, outFile, timeout);
    parsed.push({ name: name, code: result.code, signal: result.signal, parsed: result.parsed, stderr: result.stderr });
    if (!result.parsed) {
      fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({
        verdict: 'BLOCKED',
        failedJob: name,
        code: result.code,
        signal: result.signal,
        stderr: result.stderr,
      }, null, 2));
      process.stderr.write('BLOCKED at ' + name + '\n');
      return;
    }
  }

  const taintState = '/tmp/r13-state-taint';
  fs.rmSync(taintState, { recursive: true, force: true });
  fs.mkdirSync(taintState, { recursive: true });
  const seed = await runWorker({
    R13_PHASE: 'seed',
    R13_ID: 'T001',
    R13_STATE: taintState,
  }, path.join(outDir, 'taint-seed.json'), 120000);
  const check = await runWorker({
    R13_PHASE: 'check',
    R13_ID: 'T001',
    R13_STATE: taintState,
  }, path.join(outDir, 'taint-check.json'), 120000);

  const hangState = '/tmp/r13-state-hang';
  fs.rmSync(hangState, { recursive: true, force: true });
  fs.mkdirSync(hangState, { recursive: true });
  const hangLog = path.join(hangState, 'http.jsonl');
  const hang = await runWorker({
    R13_PHASE: 'hang',
    R13_ID: 'R001',
    R13_HANG: '1',
    R13_STATE: hangState,
    R13_HTTP_LOG: hangLog,
  }, path.join(outDir, 'hang.json'), 20000);
  const resume = await runWorker({
    R13_PHASE: 'resume',
    R13_ID: 'R001',
    R13_STATE: hangState,
    R13_HTTP_LOG: path.join(hangState, 'http-resume.jsonl'),
  }, path.join(outDir, 'resume.json'), 120000);

  const rows = [];
  for (const job of parsed) {
    if (job.parsed && job.parsed.results) {
      for (const row of job.parsed.results) rows.push(row);
    }
  }
  if (check.parsed && check.parsed.results) {
    for (const row of check.parsed.results) rows.push(Object.assign({}, row, { id: 'T001-restart', shape: 'restart-fresh-inbound' }));
  }
  if (resume.parsed && resume.parsed.results) {
    for (const row of resume.parsed.results) rows.push(Object.assign({}, row, { id: 'R001-resume', shape: 'restart-mid-op' }));
  }
  const summary = summarize(rows, scan);
  summary.seal = hash;
  summary.frozenCommit = '7c8b66858cb7c2a12abc2d3a80c18ad730e0f607';
  summary.jobs = parsed.map((j) => ({ name: j.name, code: j.code, signal: j.signal, cases: j.parsed && j.parsed.results ? j.parsed.results.length : 0 }));
  summary.taintSeed = seed.parsed ? seed.parsed.results : { code: seed.code, stderr: seed.stderr };
  summary.hang = { code: hang.code, signal: hang.signal, httpLogBytes: fs.existsSync(hangLog) ? fs.statSync(hangLog).size : 0 };
  summary.resume = resume.parsed ? resume.parsed.results : { code: resume.code, stderr: resume.stderr };
  summary.failures = rows.filter((r) => r.verdict && r.verdict !== 'pass' && r.verdict !== 'held-other');
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outDir, 'cases.json'), JSON.stringify(rows));
  process.stderr.write('VERDICT ' + summary.verdict + ' failures ' + summary.failures.length + '\n');
}

main().catch((err) => {
  process.stderr.write('RUN_FAIL ' + (err && err.stack || err) + '\n');
  process.exit(1);
});
