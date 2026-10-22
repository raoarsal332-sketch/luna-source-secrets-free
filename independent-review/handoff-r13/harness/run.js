'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SEAL = JSON.parse(fs.readFileSync(path.join(ROOT, 'SEAL.json'), 'utf8'));
const casesBuf = fs.readFileSync(path.join(ROOT, 'cases.json'));
const actual = crypto.createHash('sha256').update(casesBuf).digest('hex');
if (actual !== SEAL.sha256) {
  console.error('SEAL MISMATCH', actual, SEAL.sha256);
  process.exit(2);
}
const PACK = JSON.parse(casesBuf.toString('utf8'));
const WORKER = path.join(__dirname, 'worker.js');

function stepFrom(row, extra) {
  const setup = Object.assign({ assignee: 'bot', ageSec: 10000 }, row.setup || {}, extra && extra.setup || {});
  return Object.assign({
    id: row.id,
    convId: row.convId || row.id,
    stepIndex: 0,
    text: row.text || '',
    topic: row.topic || (setup.topic || 'conversation.user.replied'),
    setup,
    http: row.http || [],
    model: row.model,
    live: setup.live || 'follow',
    paused: !!setup.paused,
    aiOff: !!setup.aiOff,
    expect: row.expect || {},
    onFail: row.onFail || 'defect',
    resetState: true,
  }, extra || {});
}

function runJob(runtime, stateDir, steps, extra) {
  fs.mkdirSync(stateDir, { recursive: true });
  const jobFile = path.join(stateDir, 'job.json');
  const outFile = path.join(stateDir, 'out.json');
  const job = Object.assign({
    runtime,
    stateDir,
    outFile,
    reset: true,
    steps,
  }, extra || {});
  fs.writeFileSync(jobFile, JSON.stringify(job));
  const r = spawnSync(process.execPath, [WORKER, jobFile], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: Object.assign({}, process.env, {
      OPENAI_API_KEY: '',
      INTERCOM_ACCESS_TOKEN: '',
      CONTROL_SECRET: '',
    }),
  });
  if (!fs.existsSync(outFile)) {
    return {
      results: steps.map((s) => ({
        id: s.id,
        failures: [{ code: 'worker-crash', class: 'defect', detail: (r.stderr || r.stdout || '').slice(-1500) }],
        signature: { class: 'crash', publics: [], assigns: 0, fixedExact: null, secretLeak: false },
        recorded: [],
      })),
      crash: (r.stderr || '').slice(-2000),
      status: r.status,
    };
  }
  return JSON.parse(fs.readFileSync(outFile, 'utf8'));
}

function sig(result) {
  const s = result.signature || {};
  return JSON.stringify({
    class: s.class || 'crash',
    fixedExact: s.fixedExact || null,
    assigns: s.assigns || 0,
    secretLeak: !!s.secretLeak,
  });
}

function main() {
  const mode = process.argv[2];
  const runtime = process.argv[3];
  const outPath = process.argv[4];
  if (!mode || !runtime || !outPath) {
    console.error('usage: run.js part-a|corpus|recovery <runtime> <out.json>');
    process.exit(2);
  }
  const stateRoot = path.join('/tmp/handoff-r13-review', mode + '-' + path.basename(path.dirname(runtime)));
  fs.rmSync(stateRoot, { recursive: true, force: true });
  fs.mkdirSync(stateRoot, { recursive: true });

  if (mode === 'part-a' || mode === 'corpus') {
    const selected = PACK.cases.filter((c) => (mode === 'part-a' ? !c.recovery : c.corpus));
    const steps = selected.map((row) => stepFrom(row));
    const began = Date.now();
    const job = runJob(runtime, path.join(stateRoot, 'batch'), steps);
    const byId = new Map((job.results || []).map((r) => [r.id, r]));
    const rows = selected.map((row) => {
      const result = byId.get(row.id) || { failures: [{ code: 'missing', class: 'defect', detail: 'no result' }], signature: { class: 'missing' } };
      return {
        id: row.id,
        group: row.group,
        onFail: row.onFail,
        justify: row.justify || {},
        corpus: !!row.corpus,
        ok: !(result.failures || []).length,
        failures: result.failures || [],
        signature: result.signature || {},
        recorded: result.recorded || [],
      };
    });
    fs.writeFileSync(outPath, JSON.stringify({
      mode,
      runtime,
      elapsedMs: Date.now() - began,
      crash: job.crash || null,
      rows,
    }));
    const bad = rows.filter((r) => !r.ok).length;
    console.log(mode, 'rows', rows.length, 'failures', bad, 'elapsed', Date.now() - began);
    return;
  }

  if (mode === 'recovery') {
    const selected = PACK.cases.filter((c) => c.recovery);
    const rows = [];
    const began = Date.now();
    for (const row of selected) {
      const dir = path.join(stateRoot, row.id);
      fs.mkdirSync(dir, { recursive: true });
      const signatures = [];
      const failures = [];
      let fixedPosts = 0;
      (row.steps || []).forEach((step, index) => {
        const spec = stepFrom(row, {
          stepIndex: index,
          text: step.text,
          http: step.http || [],
          model: step.model,
          expect: step.expect || {},
          mutate: step.mutate,
          resetState: index === 0,
          restart: true,
        });
        spec.convId = row.id;
        spec.resetState = index === 0;
        const job = runJob(runtime, dir, [spec], {
          reset: index === 0,
          wipeOp: !!step.wipeOp,
          corruptOp: !!step.corruptOp,
        });
        const result = (job.results || [])[0] || { failures: [{ code: 'missing', class: 'defect', detail: job.crash || 'no result' }], signature: {} };
        fixedPosts += Number(result.fixedCount || 0);
        signatures.push(result.signature || {});
        for (const f of result.failures || []) failures.push(Object.assign({ step: index }, f));
        if (result.signature && result.signature.secretLeak) {
          failures.push({ code: 'secret-leak', class: 'product-critical', step: index, detail: 'leak' });
        }
      });
      if (fixedPosts > 1) {
        failures.push({ code: 'duplicate-fixed', class: 'product-critical', detail: 'fixed posts ' + fixedPosts });
      }
      const wantsFixed = (row.steps || []).some((s) => s.expect && s.expect.fixed && s.expect.fixed !== false);
      const wantsSilence = (row.steps || []).every((s) => !s.expect || s.expect.fixed === false || s.expect.publicCount === 0);
      if (wantsFixed && fixedPosts !== 1) {
        failures.push({ code: 'lost-or-dup-handoff', class: 'product-critical', detail: 'fixed posts ' + fixedPosts });
      }
      if (row.id === 'rec-human-silence-during-recovery' && fixedPosts !== 0) {
        failures.push({ code: 'human-silence-broken', class: 'product-critical', detail: 'fixed posts ' + fixedPosts });
      }
      void wantsSilence;
      rows.push({
        id: row.id,
        group: row.group,
        onFail: 'product-critical',
        justify: row.justify || {},
        ok: failures.length === 0,
        failures,
        fixedPosts,
        signatures,
      });
      console.log(row.id, failures.length ? 'FAIL' : 'ok', 'fixed', fixedPosts);
    }
    fs.writeFileSync(outPath, JSON.stringify({ mode, runtime, elapsedMs: Date.now() - began, rows }));
    console.log('recovery failures', rows.filter((r) => !r.ok).length, 'of', rows.length);
    return;
  }

  console.error('unknown mode');
  process.exit(2);
}

main();
