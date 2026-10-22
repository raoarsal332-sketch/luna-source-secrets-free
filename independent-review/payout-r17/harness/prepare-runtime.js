'use strict';

/**
 * Build two runnable copies of luna-current/01_runtime.
 * The patched copy gets index.js.public-sends.diff applied with the system
 * patch tool. No shim is inserted in front of payoutClaimGuard.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '../../..');
const RUNTIME_SRC = path.join(REPO, 'luna-current/01_runtime');
const PRESEND_SRC = path.join(REPO, 'luna-current/02_statePresend');
const GUARD_SRC = path.join(REPO, 'luna-current/10_synthetic_lanes/t800-payout-r17');
const DIFF = path.join(GUARD_SRC, 'index.js.public-sends.diff');
const NODE_MODULES = '/tmp/r17-npm/node_modules';

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(from), to);
    else fs.copyFileSync(from, to);
  }
}

function prepare(root, { patched }) {
  fs.rmSync(root, { recursive: true, force: true });
  const luna = path.join(root, 'luna-current');
  copyDir(RUNTIME_SRC, path.join(luna, '01_runtime'));
  copyDir(PRESEND_SRC, path.join(luna, '01_runtime/statePresend'));
  copyDir(PRESEND_SRC, path.join(luna, 'statePresend'));
  fs.symlinkSync(NODE_MODULES, path.join(luna, '01_runtime/node_modules'));
  if (patched) {
    copyDir(GUARD_SRC, path.join(luna, '10_synthetic_lanes/t800-payout-r17'));
    execFileSync('patch', ['-p1', '--forward', '--input', DIFF], {
      cwd: root,
      stdio: 'pipe',
    });
    const indexPath = path.join(luna, '01_runtime/index.js');
    const index = fs.readFileSync(indexPath, 'utf8');
    if (!index.includes("require('../10_synthetic_lanes/t800-payout-r17/payoutClaimGuard')")) {
      throw new Error('public-sends diff did not install the real guard require');
    }
    if (index.includes('payoutGuardShim') || index.includes('review-shim')) {
      throw new Error('shim marker found in patched index');
    }
  }
  return path.join(luna, '01_runtime');
}

module.exports = { prepare, REPO, GUARD_SRC, DIFF };

if (require.main === module) {
  const which = process.argv[2] || 'both';
  const base = process.argv[3] || '/tmp/payout-r17-review';
  if (which === 'baseline' || which === 'both') {
    const dir = prepare(path.join(base, 'baseline'), { patched: false });
    console.log('baseline', dir);
  }
  if (which === 'patched' || which === 'both') {
    const dir = prepare(path.join(base, 'patched'), { patched: true });
    console.log('patched', dir);
  }
}
