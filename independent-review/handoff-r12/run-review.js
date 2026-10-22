'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { evaluate, signature } = require('./evaluate');
const { applyMutation } = require('./mutate');

const here = path.join(__dirname);
const worker = path.join(here, 'worker.js');
const casesPath = path.join(here, 'cases.json');
const sealPath = path.join(here, 'SEAL.sha256');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function assertSeal() {
  const body = fs.readFileSync(casesPath);
  const hash = sha256(body);
  const seal = fs.readFileSync(sealPath, 'utf8').trim().split(/\s+/)[0];
  if (hash !== seal) {
    console.error('SEAL MISMATCH', hash, seal);
    process.exit(2);
  }
  const cases = JSON.parse(body.toString('utf8'));
  if (cases.length < 250) {
    console.error('SEALED SET SHORT', cases.length);
    process.exit(2);
  }
  return { cases, hash };
}

function envFor(stateDir, runtimeRoot) {
  return Object.assign({}, process.env, {
    LUNA_CONTROL_STATE_FILE: path.join(stateDir, 'control.json'),
    LUNA_OP_STORE_FILE: path.join(stateDir, 'ops.json'),
    TICKET_STATE_FILE: path.join(stateDir, 'tickets.json'),
    MENTION_ROTATE_FILE: path.join(stateDir, 'rotate.json'),
    LUNA_PROMPT_FILE: path.join(runtimeRoot, 'system-prompt.txt'),
    OPENAI_API_KEY: 'synthetic-review-not-a-secret',
    INTERCOM_ACCESS_TOKEN: 'synthetic-review-not-a-secret',
    CONTROL_SECRET: '',
    MAINTAINER_ENABLED: 'false',
  });
}

function runWorker(messages, stateDir, runtimeRoot, timeoutMs) {
  fs.mkdirSync(stateDir, { recursive: true });
  const res = spawnSync(process.execPath, [worker], {
    input: messages.map((m) => JSON.stringify(m)).join('\n') + '\n',
    encoding: 'utf8',
    env: envFor(stateDir, runtimeRoot),
    timeout: timeoutMs || 300000,
    maxBuffer: 128 * 1024 * 1024,
    cwd: runtimeRoot,
  });
  if (res.error) throw res.error;
  if (res.status !== 0 && !String(res.stdout || '').trim()) {
    throw new Error('worker exit ' + res.status + '\n' + String(res.stderr || '').slice(0, 2000));
  }
  const lines = String(res.stdout || '').split('\n').filter((l) => l.trim());
  return lines.map((l) => JSON.parse(l));
}

function gapActions(between, index) {
  const raw = between && between[index];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function runIsolated(cse, runtimeRoot, stateDir) {
  const turns = cse.turns || [];
  const merged = { id: cse.id, threw: null, statusCodes: [], writes: [], publicBodies: [], noteBodies: [], leaks: [], tripwires: [], webhookErr: false, logTail: [], aiOff: null };
  for (let i = 0; i < turns.length; i += 1) {
    if (i > 0) {
      for (const action of gapActions(cse.between, i - 1)) {
        if (action !== 'restart') applyMutation(stateDir, action);
      }
    }
    const out = runWorker([
      {
        case: cse,
        onlyTurn: i,
        resume: i > 0,
        stateDir,
        runtimeRoot,
      },
    ], stateDir, runtimeRoot, 120000);
    const one = out[0];
    if (!one || one.threw && one.id === 'worker-error') {
      merged.threw = (one && one.threw) || 'missing worker result';
      break;
    }
    merged.writes.push(...(one.writes || []));
    merged.publicBodies.push(...(one.publicBodies || []));
    merged.noteBodies.push(...(one.noteBodies || []));
    merged.leaks.push(...(one.leaks || []));
    merged.tripwires.push(...(one.tripwires || []));
    merged.statusCodes.push(...(one.statusCodes || []));
    merged.webhookErr = merged.webhookErr || !!one.webhookErr;
    merged.logTail = one.logTail || [];
    merged.aiOff = one.aiOff;
    if (one.threw) merged.threw = one.threw;
  }
  return merged;
}

function runShared(list, runtimeRoot, stateDir) {
  const messages = list.map((cse) => ({ case: cse, stateDir, runtimeRoot, resume: false }));
  const outs = runWorker(messages, stateDir, runtimeRoot, 300000);
  const byId = new Map();
  for (const row of outs) byId.set(row.id, row);
  return byId;
}

function main() {
  const runtimeRoot = process.argv[2];
  const outFile = process.argv[3];
  if (!runtimeRoot || !outFile) {
    console.error('usage: node run-review.js <runtimeRoot> <outFile>');
    process.exit(2);
  }
  const { cases, hash } = assertSeal();
  const runtimeTag = sha256(runtimeRoot).slice(0, 12);
  const sharedDir = path.join('/tmp', 'r12-review-shared-' + runtimeTag);
  fs.rmSync(sharedDir, { recursive: true, force: true });
  fs.mkdirSync(sharedDir, { recursive: true });
  const shared = cases.filter((c) => !c.isolate);
  const isolated = cases.filter((c) => c.isolate);
  console.log('shared', shared.length, 'isolated', isolated.length);
  const sharedResults = runShared(shared, runtimeRoot, sharedDir);
  const results = [];
  for (const cse of cases) {
    let raw;
    if (cse.isolate) {
      const dir = path.join('/tmp', 'r12-review-iso-' + runtimeTag + '-' + cse.id);
      fs.rmSync(dir, { recursive: true, force: true });
      raw = runIsolated(cse, runtimeRoot, dir);
    } else {
      raw = sharedResults.get(cse.id);
      if (!raw) raw = { id: cse.id, threw: 'missing shared result', writes: [], publicBodies: [], noteBodies: [], leaks: [], tripwires: [] };
    }
    const judged = evaluate(cse, raw);
    results.push({
      id: cse.id,
      group: cse.group,
      title: cse.title,
      corpus: !!cse.corpus,
      r11Diff: cse.r11Diff || 'same',
      pass: judged.pass,
      classes: judged.classes,
      failures: judged.failures,
      fixedCount: judged.fixedCount,
      publicCount: judged.publicCount,
      noteCount: judged.noteCount,
      aiOff: judged.aiOff,
      leaks: judged.leaks,
      tripwires: judged.tripwires,
      signature: signature(raw),
      publicBodies: raw.publicBodies || [],
      replyBodies: (raw.writes || []).filter((w) => w.method === 'post').map((w) => ({ url: w.url, status: w.status, applied: w.applied, body: w.body })),
    });
    if (!judged.pass) console.log('FAIL', cse.id, cse.group, judged.failures.map((f) => f.class + ':' + f.detail).join(' || '));
  }
  const summary = {
    seal: hash,
    runtimeRoot,
    cases: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    byClass: {},
  };
  for (const r of results) {
    for (const cls of r.classes) summary.byClass[cls] = (summary.byClass[cls] || 0) + 1;
  }
  fs.writeFileSync(outFile, JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main();
