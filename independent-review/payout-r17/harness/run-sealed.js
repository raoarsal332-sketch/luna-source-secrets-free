'use strict';

/**
 * Run the already sealed case file through baseline and patched handleWebhook.
 * Refuses to start if SEALED_CASES.json does not match SEAL.sha256.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const HARNESS = __dirname;
const ROOT = path.resolve(HARNESS, '..');
const CASES = path.join(ROOT, 'SEALED_CASES.json');
const SEAL = path.join(ROOT, 'SEAL.sha256');
const BASE = '/tmp/payout-r17-review';

function assertSeal() {
  const file = fs.readFileSync(CASES);
  const hash = crypto.createHash('sha256').update(file).digest('hex');
  const seal = fs.readFileSync(SEAL, 'utf8').trim().split(/\s+/)[0];
  if (hash !== seal) throw new Error('seal mismatch ' + hash + ' != ' + seal);
  console.log('seal', hash, 'cases', JSON.parse(file.toString('utf8')).length);
}

function run(mode) {
  const runtime = path.join(BASE, mode, 'luna-current/01_runtime');
  const out = path.join(BASE, 'out-' + mode + '.json');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(HARNESS, 'child.js'),
      runtime,
      CASES,
      out,
      mode,
    ], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(mode + ' exited ' + code));
    });
  });
}

async function main() {
  assertSeal();
  const outs = await Promise.all([run('baseline'), run('patched')]);
  const score = spawn(process.execPath, [path.join(HARNESS, 'score.js'), outs[0], outs[1]], { stdio: 'inherit' });
  score.on('exit', (code) => process.exit(code || 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
