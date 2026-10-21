'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, fork } = require('child_process');
const { buildCases } = require('./cases');
const { runOne } = require('./execute');
const { createRuntime } = require('./runtime-loader');

const ROOT = '/tmp/cred-r9-review-build';
const FLAT = '/tmp/cred-r9-review-flat';
const ISO = '/tmp/cred-r9-review-iso';
const COMMIT = '9b5e36d1e2253c2b189e9630c05c8cb5f51c34e8';

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function build() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.rmSync(FLAT, { recursive: true, force: true });
  fs.mkdirSync(ROOT, { recursive: true });
  sh('git -C /workspace archive ' + COMMIT + ' luna-current | tar -x -C ' + ROOT);
  const lane = path.join(ROOT, 'luna-current/10_synthetic_lanes/credential-guard-r9');
  const hashCheck = sh('cd ' + JSON.stringify(lane) + ' && sha256sum -c CRED_R9_MANIFEST.sha256');
  const hashes = sh('cd ' + JSON.stringify(lane) + ' && sha256sum credentialGuardR9.js credentialGuardR9.test.js proposed-integration.diff CRED_R9_REPORT.md CRED_R9_MANIFEST.sha256');
  const patchOut = sh('patch -p1 -f -d ' + JSON.stringify(ROOT) + ' < ' + JSON.stringify(path.join(lane, 'proposed-integration.diff')));
  fs.mkdirSync(FLAT, { recursive: true });
  sh('cp -a ' + JSON.stringify(path.join(ROOT, 'luna-current/01_runtime')) + '/. ' + JSON.stringify(FLAT) + '/');
  sh('cp -a ' + JSON.stringify(path.join(ROOT, 'luna-current/02_statePresend')) + ' ' + JSON.stringify(path.join(FLAT, 'statePresend')));
  sh('cp -a ' + JSON.stringify(path.join(ROOT, 'luna-current/03_luna-maintainer')) + ' ' + JSON.stringify(path.join(FLAT, 'luna-maintainer')));
  sh('cd ' + JSON.stringify(FLAT) + ' && npm install --omit=dev --no-audit --no-fund --ignore-scripts');
  return { hashCheck, hashes, patchOut };
}

function prepareIso() {
  fs.rmSync(ISO, { recursive: true, force: true });
  fs.mkdirSync(path.join(ISO, 'maintainer'), { recursive: true });
  fs.mkdirSync('/tmp/cred-r9-review-home', { recursive: true });
  const control = {
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: [],
    testAllowConversationIds: [],
    config: { model: 'stub-model', welcomeEnabled: true, repliesEnabled: true },
  };
  fs.writeFileSync(path.join(ISO, 'control.json'), JSON.stringify(control));
  fs.writeFileSync(path.join(ISO, 'tickets.json'), '{}');
  fs.writeFileSync(path.join(ISO, 'ops.json'), '{}');
  fs.writeFileSync(path.join(ISO, 'mention.json'), '{}');
  process.env.LUNA_CONTROL_STATE_FILE = path.join(ISO, 'control.json');
  process.env.LUNA_PROMPT_FILE = path.join(FLAT, 'system-prompt.txt');
  process.env.TICKET_STATE_FILE = path.join(ISO, 'tickets.json');
  process.env.LUNA_OP_STORE_FILE = path.join(ISO, 'ops.json');
  process.env.MENTION_ROTATE_FILE = path.join(ISO, 'mention.json');
  process.env.MAINTAINER_DATA_DIR = path.join(ISO, 'maintainer');
  process.env.MAINTAINER_ENABLED = 'true';
  process.env.LUNA_TOOLS_ENABLED = '0';
  process.env.LUNA_PRESEND_MODE = 'enforce';
  process.env.OPENAI_API_KEY = 'synthetic-openai-not-a-real-key';
  process.env.INTERCOM_ACCESS_TOKEN = 'harness-intercom-token';
  process.env.HOME = '/tmp/cred-r9-review-home';
  process.env.CRED_R9_FLAT = FLAT;
  process.chdir(FLAT);
}

function expand(rows) {
  const out = [];
  for (const row of rows) {
    out.push(Object.assign({}, row, { runId: row.id, mode: row.mode || 'enforce' }));
    if (row.alsoObserve) {
      out.push(Object.assign({}, row, {
        id: row.id + 'o',
        runId: row.id + 'o',
        mode: 'observe',
        title: row.title + ' [observe]',
      }));
    }
  }
  return out;
}

function runHang(row) {
  return new Promise((resolve) => {
    const child = fork(path.join(__dirname, 'hang-child.js'), [], {
      cwd: FLAT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let timer = null;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch (_) { /* already gone */ }
      resolve(result);
    };
    child.on('message', (msg) => {
      if (msg && msg.ready) {
        timer = setTimeout(() => {
          finish({
            id: row.id,
            runId: row.runId,
            group: 'hang',
            kind: 'hang',
            mode: row.mode || 'enforce',
            title: row.title,
            ms: 3000,
            pathMiss: '',
            killed: true,
            hits: [],
            product: ['hang'],
            templateSent: false,
            fixedSent: false,
            modelCalls: 0,
            posts: 0,
            notes: 0,
            thrown: 'watchdog',
            logHint: '',
          });
        }, 3000);
        child.send({ id: row.id, runId: row.runId, mode: row.mode });
        return;
      }
      if (msg && msg.result) finish(msg.result);
      else finish({
        id: row.id,
        group: 'hang',
        kind: 'hang',
        mode: row.mode || 'enforce',
        title: row.title,
        ms: 0,
        pathMiss: '',
        hits: [],
        product: ['threw'],
        thrown: (msg && msg.error) || 'no-result',
        templateSent: false,
        logHint: '',
      });
    });
    child.on('exit', (code) => {
      if (!settled) {
        finish({
          id: row.id,
          group: 'hang',
          kind: 'hang',
          mode: row.mode || 'enforce',
          title: row.title,
          ms: 3000,
          pathMiss: '',
          killed: code !== 0,
          hits: [],
          product: code === 0 ? ['threw'] : ['hang'],
          thrown: 'exit ' + code,
          templateSent: false,
          logHint: '',
        });
      }
    });
  });
}

function summarize(results) {
  const counted = results.filter((r) => !r.pathMiss);
  const mistakes = results.filter((r) => r.pathMiss);
  const leakRows = [];
  const bySurface = {};
  for (const row of counted) {
    for (const tag of row.product || []) {
      if (!tag.startsWith('leak:')) continue;
      const surface = tag.split(':')[1];
      bySurface[surface] = (bySurface[surface] || 0) + 1;
      leakRows.push({ id: row.id, surface, kind: tag.split(':')[2], title: row.title, mode: row.mode });
    }
  }
  const ids = (pred) => counted.filter(pred).map((r) => r.id);
  return {
    cases: results.length,
    counted: counted.length,
    harnessMistakes: mistakes.map((r) => ({ id: r.id, pathMiss: r.pathMiss, hint: r.logHint })),
    leaksBySurface: bySurface,
    leakEvents: leakRows.length,
    leakCases: [...new Set(leakRows.map((r) => r.id))],
    unauthorized: ids((r) => (r.product || []).includes('unauthorized-template')),
    missedEligible: ids((r) => (r.product || []).includes('missed-eligible')),
    hangs: ids((r) => (r.product || []).includes('hang')),
    overblocks: ids((r) => (r.product || []).includes('overblock')),
    regressions: ids((r) => (r.product || []).some((p) => p.startsWith('regression'))),
    throws: counted.filter((r) => (r.product || []).includes('threw') || (r.product || []).includes('network-attempt')).map((r) => ({ id: r.id, thrown: r.thrown, product: r.product })),
    timings: counted.map((r) => ({ id: r.id, ms: r.ms, kind: r.kind })),
  };
}

async function main() {
  const built = build();
  prepareIso();
  const prompt = fs.readFileSync(process.env.LUNA_PROMPT_FILE, 'utf8');
  const rows = expand(buildCases());
  if (rows.length < 170) throw new Error('sealed set is ' + rows.length + ', need 170+');
  const collisions = [];
  for (const row of rows) {
    for (const secret of row.secrets || []) {
      if (secret && prompt.includes(secret)) collisions.push(row.id + ':' + secret);
    }
  }
  const rt = createRuntime(FLAT);
  const paths = {
    ticket: process.env.TICKET_STATE_FILE,
    ops: process.env.LUNA_OP_STORE_FILE,
    maintainer: process.env.MAINTAINER_DATA_DIR,
  };
  const results = [];
  const normal = rows.filter((r) => r.kind !== 'hang');
  const hangs = rows.filter((r) => r.kind === 'hang');
  for (const row of normal) {
    process.stderr.write('case ' + row.id + '\n');
    results.push(await runOne(rt, row, paths, prompt));
  }
  for (const row of hangs) {
    process.stderr.write('hang ' + row.id + '\n');
    results.push(await runHang(row));
  }
  const summary = summarize(results);
  const out = {
    commit: COMMIT,
    flat: FLAT,
    hashCheck: built.hashCheck.trim(),
    hashes: built.hashes.trim(),
    patch: built.patchOut.trim(),
    promptCollisions: collisions,
    caseCount: rows.length,
    summary,
    results,
  };
  const dest = path.join('/workspace/cred-r9-review/harness/results.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.stdout.write('WROTE ' + dest + '\n');
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
