'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

const casesFile = arg('--cases');
const runtime = arg('--runtime');
const outDir = arg('--out');
const only = arg('--group', '');
if (!casesFile || !runtime || !outDir) {
  console.error('usage: run-sealed.js --cases --runtime --out [--group]');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
const doc = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
const groups = [...new Set(doc.cases.map((item) => item.group))];
const selected = only ? groups.filter((group) => group === only) : groups;
const harness = path.join(__dirname, 'harness.js');
const summaries = [];
for (const group of selected) {
  const out = path.join(outDir, group + '.json');
  const started = Date.now();
  const run = spawnSync(process.execPath, [harness, '--cases', casesFile, '--group', group, '--runtime', runtime, '--out', out], {
    encoding: 'utf8',
    timeout: 30 * 60 * 1000,
    maxBuffer: 20 * 1024 * 1024,
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  if (run.status !== 0 || !fs.existsSync(out)) {
    console.error('GROUP FAIL', group, 'exit', run.status, 'seconds', seconds);
    console.error((run.stderr || '').slice(-2000));
    console.error((run.stdout || '').slice(-2000));
    summaries.push({ group, error: true, status: run.status, seconds });
    continue;
  }
  const summary = JSON.parse(fs.readFileSync(out, 'utf8'));
  summaries.push({ group, cases: summary.cases, passed: summary.passed, failed: summary.failed, sockets: summary.sockets, seconds });
  console.log('GROUP', group, summary.passed + '/' + summary.cases, 'fail', summary.failed, 'sockets', summary.sockets, 'seconds', seconds);
}
fs.writeFileSync(path.join(outDir, 'groups.json'), JSON.stringify(summaries, null, 2));
