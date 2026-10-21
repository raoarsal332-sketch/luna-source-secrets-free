'use strict';

/**
 * Existing-suite runner for the R10 regression check.
 * Synthetic only. Does not open a socket. Does not read review branches.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TREES = {
  baseline: process.env.BASELINE_ROOT || '/workspace',
  r9: process.env.R9_ROOT || '/tmp/trees/r9',
  r10: process.env.R10_ROOT || '/tmp/trees/r10',
};

const REPORT_SHA = 'a7a84a7b90ad2aeae6b8179567be42d9feebb9f4ad6fc06253b4caa8af16867a';
const OUT = process.env.SUITE_OUT || path.join(__dirname, 'suite-results.json');

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function parseReportHashes(reportText) {
  const expected = {};
  const re = /^\| `([^`]+)` \| `([0-9a-f]{64})` \|$/gm;
  let m;
  while ((m = re.exec(reportText))) expected[m[1]] = m[2];
  return expected;
}

function verifyHashes() {
  const root = TREES.r10;
  const reportRel = 'luna-current/10_synthetic_lanes/fixed-message-handoff-r10/FM_R10_REPORT.md';
  const reportPath = path.join(root, reportRel);
  const reportSha = sha256File(reportPath);
  const expected = parseReportHashes(fs.readFileSync(reportPath, 'utf8'));
  const files = [];
  let mismatches = 0;
  for (const [rel, want] of Object.entries(expected)) {
    const got = sha256File(path.join(root, rel));
    const ok = got === want;
    if (!ok) mismatches += 1;
    files.push({ rel, want, got, ok });
  }
  const r9Root = TREES.r9;
  const unchanged = [
    'luna-current/01_runtime/challengeVariantGuard.js',
    'luna-current/01_runtime/softEdges.js',
    'luna-current/01_runtime/imageAskGuard.js',
    'luna-current/01_runtime/escalateRelatedOnly.js',
    'luna-current/01_runtime/teammateHandoffGates.js',
    'luna-current/02_statePresend/statePresend.js',
    'luna-current/02_statePresend/textUtils.js',
    'luna-current/10_synthetic_lanes/fixed-message-handoff-r4/fixedMessageHandoff.test.js',
    'luna-current/10_synthetic_lanes/fixed-message-handoff-r5/fixedMessageHandoff.test.js',
    'luna-current/10_synthetic_lanes/fixed-message-handoff-r6/fixedMessageHandoff.test.js',
    'luna-current/10_synthetic_lanes/fixed-message-handoff-r7/fixedMessageHandoff.test.js',
    'luna-current/10_synthetic_lanes/fixed-message-handoff-r8/fixedMessageHandoff.test.js',
    'luna-current/10_synthetic_lanes/fixed-message-handoff-r9/fixedMessageHandoff.test.js',
  ];
  const r9match = unchanged.map((rel) => {
    const a = sha256File(path.join(root, rel));
    const b = sha256File(path.join(r9Root, rel));
    return { rel, ok: a === b, r10: a, r9: b };
  });
  return {
    reportRel,
    reportSha,
    reportShaExpected: REPORT_SHA,
    reportOk: reportSha === REPORT_SHA,
    fileCount: files.length,
    mismatches,
    files,
    r9UnchangedMismatches: r9match.filter((row) => !row.ok),
    r9UnchangedOk: r9match.every((row) => row.ok),
  };
}

function listSuites(root) {
  const suites = [];
  const repair = path.join(root, 'luna-current/08_repair_tests/run-suite.js');
  if (fs.existsSync(repair)) {
    suites.push({
      id: '08_repair_tests/run-suite.js',
      script: repair,
      cwd: path.dirname(repair),
      env: {},
    });
  }
  const failDir = path.join(root, 'luna-current/09_failfix_staging');
  if (fs.existsSync(failDir)) {
    for (const name of fs.readdirSync(failDir).filter((n) => /^selftest-.*\.js$/.test(n)).sort()) {
      suites.push({
        id: '09_failfix_staging/' + name,
        script: path.join(failDir, name),
        cwd: failDir,
        env: {},
      });
    }
  }
  const lane = path.join(root, 'luna-current/10_synthetic_lanes');
  if (fs.existsSync(lane)) {
    for (const dir of fs.readdirSync(lane).sort()) {
      const script = path.join(lane, dir, 'fixedMessageHandoff.test.js');
      if (fs.existsSync(script)) {
        suites.push({
          id: '10_synthetic_lanes/' + dir + '/fixedMessageHandoff.test.js',
          script,
          cwd: root,
          env: {},
        });
      }
    }
  }
  const maint = path.join(root, 'luna-current/03_luna-maintainer/test/run-tests.js');
  if (fs.existsSync(maint)) {
    suites.push({
      id: '03_luna-maintainer/test/run-tests.js',
      script: maint,
      cwd: path.dirname(maint),
      env: { LUNA_ROOT: path.join(root, 'luna-export') },
    });
  }
  const selfDir = path.join(root, 'luna-current/07_selftests');
  const selftests = fs.existsSync(selfDir)
    ? fs.readdirSync(selfDir).filter((n) => /^(selftest-|test-).+\.js$/.test(n)).sort()
    : [];
  const smokes = fs.existsSync(path.join(root, 'luna-current/01_runtime'))
    ? fs.readdirSync(path.join(root, 'luna-current/01_runtime')).filter((n) => /^smoke_.*\.js$/.test(n)).sort()
    : [];
  return { suites, selftests, smokes };
}

function runOne(spec, root) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, spec.env);
    for (const key of Object.keys(env)) {
      if (/^(INTERCOM_|OPENAI_|SECRET|TOKEN|PASSWORD|API_KEY)/.test(key) && key !== 'LUNA_ROOT') delete env[key];
    }
    env.INTERCOM_ACCESS_TOKEN = 'synthetic-suite-token';
    env.OPENAI_API_KEY = 'sk-synthetic-suite';
    env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';
    env.MAINTAINER_ENABLED = 'false';
    const child = spawn(process.execPath, [spec.script], { cwd: spec.cwd, env });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 180000);
    child.stdout.on('data', (b) => {
      out += b.toString();
    });
    child.stderr.on('data', (b) => {
      err += b.toString();
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve(summarize(spec.id, code, signal, out, err));
    });
  });
}

function summarize(id, code, signal, out, err) {
  const passNames = [];
  const failNames = [];
  const lines = (out + '\n' + err).split(/\n/);
  for (const line of lines) {
    const pf = line.match(/^(PASS|FAIL)\s+(\S+)/);
    if (pf) {
      if (pf[1] === 'PASS') passNames.push(pf[2]);
      else failNames.push(pf[2]);
    }
  }
  const total = out.match(/TOTAL\s+(\d+)\s+PASS\s+(\d+)\s+FAIL\s+(\d+)/);
  const okLine = out.match(/\bOK\s+(\d+)\s+passed/);
  const suiteLine = out.match(/SUITE hashFail\s+(\d+)\s+syntaxFail\s+(\d+)\s+adversarialFail\s+(\d+)\s+selftestFail\s+(\d+)/);
  const maintOk = (out.match(/^\s*ok\s+/gm) || []).length;
  const maintFail = (out.match(/^FAIL\s+/gm) || []).length;
  let passCount = passNames.length;
  let failCount = failNames.length;
  if (total) {
    passCount = Number(total[2]);
    failCount = Number(total[3]);
  } else if (okLine && id.includes('fixedMessageHandoff')) {
    passCount = Number(okLine[1]);
    failCount = code === 0 ? 0 : Math.max(failCount, 1);
  } else if (id.includes('run-tests.js')) {
    passCount = maintOk;
    failCount = maintFail;
  } else if (id.includes('09_failfix') && code === 0 && passCount === 0) {
    passCount = 1;
    failCount = 0;
  }
  return {
    id,
    exit: code,
    signal: signal || '',
    ok: code === 0,
    passCount,
    failCount,
    passNames,
    failNames,
    suiteLine: suiteLine ? suiteLine[0] : '',
    tail: (out + '\n' + err).slice(-2500),
  };
}

async function runTree(name, root) {
  const listed = listSuites(root);
  const results = [];
  for (const spec of listed.suites) {
    process.stderr.write('SUITE ' + name + ' ' + spec.id + '\n');
    const row = await runOne(spec, root);
    results.push(row);
    process.stderr.write(
      (row.ok ? 'PASS' : 'FAIL') + ' ' + name + ' ' + spec.id + ' pass=' + row.passCount + ' fail=' + row.failCount + '\n'
    );
  }
  return {
    tree: name,
    root,
    selftestFiles: listed.selftests,
    smokeExcluded: listed.smokes,
    suites: results,
  };
}

function candidateOnly(byTree) {
  const ids = new Set();
  for (const tree of Object.values(byTree)) for (const row of tree.suites) ids.add(row.id);
  const regressions = [];
  for (const id of ids) {
    const r10 = (byTree.r10.suites.find((s) => s.id === id) || {}).ok;
    const presentEarlier = ['baseline', 'r9'].filter((name) => byTree[name].suites.some((s) => s.id === id));
    const earlierPass = presentEarlier.filter((name) => byTree[name].suites.find((s) => s.id === id).ok);
    if (r10 === false && (presentEarlier.length === 0 || earlierPass.length === presentEarlier.length)) {
      regressions.push({
        id,
        presentEarlier,
        r10: byTree.r10.suites.find((s) => s.id === id),
      });
    }
  }
  return regressions;
}

async function main() {
  const hashes = verifyHashes();
  const byTree = {};
  for (const [name, root] of Object.entries(TREES)) {
    byTree[name] = await runTree(name, root);
  }
  const regressions = candidateOnly(byTree);
  const payload = {
    generatedAt: new Date().toISOString(),
    hashes,
    trees: byTree,
    candidateOnlyFailures: regressions.map((r) => r.id),
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(
    JSON.stringify(
      {
        reportOk: hashes.reportOk,
        hashMismatches: hashes.mismatches,
        r9UnchangedOk: hashes.r9UnchangedOk,
        candidateOnlyFailures: payload.candidateOnlyFailures,
        counts: Object.fromEntries(
          Object.entries(byTree).map(([name, tree]) => [
            name,
            {
              suites: tree.suites.length,
              pass: tree.suites.filter((s) => s.ok).length,
              fail: tree.suites.filter((s) => !s.ok).length,
            },
          ])
        ),
      },
      null,
      2
    )
  );
  if (!hashes.reportOk || hashes.mismatches || !hashes.r9UnchangedOk || regressions.length) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
