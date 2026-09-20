'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const here = __dirname;
const exportRoot = path.join(here, '..');
const mirror = path.join(here, 'test_mirror');
const state = path.join(here, 'isolated_state');

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

rmrf(mirror);
rmrf(state);
fs.mkdirSync(mirror, { recursive: true });
fs.mkdirSync(state, { recursive: true });

copyDir(path.join(exportRoot, '01_runtime'), mirror);
copyDir(path.join(exportRoot, '02_statePresend'), path.join(mirror, 'statePresend'));
copyDir(path.join(exportRoot, '03_luna-maintainer'), path.join(mirror, 'luna-maintainer'));
for (const f of fs.readdirSync(path.join(exportRoot, '07_selftests'))) {
  copyFile(path.join(exportRoot, '07_selftests', f), path.join(mirror, f));
}

function sha256(file) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const protectedFiles = {
  'system-prompt.txt': 'bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d',
  'fundedelite-faqs.md': '8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92',
};
console.log('PROTECTED_HASHES');
let hashFail = 0;
for (const [name, expected] of Object.entries(protectedFiles)) {
  const actual = sha256(path.join(mirror, name));
  const ok = actual === expected;
  console.log(ok ? 'PASS' : 'FAIL', name, actual);
  if (!ok) hashFail += 1;
}

function walkJs(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJs(p, out);
    else if (ent.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const jsFiles = walkJs(path.join(exportRoot, '01_runtime'), [])
  .concat(walkJs(path.join(exportRoot, '02_statePresend'), []))
  .concat(walkJs(path.join(exportRoot, '03_luna-maintainer'), []))
  .concat(walkJs(path.join(exportRoot, '07_selftests'), []))
  .concat(walkJs(here, []).filter((p) => !p.includes('test_mirror') && !p.includes('isolated_state')));

console.log('\nSYNTAX', jsFiles.length, 'files');
let syntaxFail = 0;
for (const file of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    syntaxFail += 1;
    console.error('SYNTAX_FAIL', file, r.stderr || r.stdout);
  }
}
if (!syntaxFail) console.log('SYNTAX_OK');

const env = {
  ...process.env,
  LUNA_TEST_MIRROR: mirror,
  LUNA_TEST_STATE: state,
};

console.log('\nADVERSARIAL current_checks.js');
const adv = spawnSync(process.execPath, [path.join(here, 'current_checks.js')], {
  encoding: 'utf8',
  env,
  cwd: here,
});
process.stdout.write(adv.stdout || '');
process.stderr.write(adv.stderr || '');

const selftests = fs.readdirSync(mirror).filter((f) => /^(selftest-|test-).+\.js$/.test(f));
console.log('\nSELFTESTS', selftests.length);
const selfResults = [];
for (const name of selftests) {
  const r = spawnSync(process.execPath, ['-r', path.join(here, 'isolation.js'), path.join(mirror, name)], {
    encoding: 'utf8',
    env,
    cwd: mirror,
  });
  const pass = r.status === 0;
  selfResults.push({ name, pass, status: r.status });
  console.log(pass ? 'PASS' : 'FAIL', name);
  if (!pass) {
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
  }
}

const advFail = adv.status !== 0;
const selfFail = selfResults.filter((x) => !x.pass).length;
console.log('\nSUITE hashFail', hashFail, 'syntaxFail', syntaxFail, 'adversarialFail', advFail ? 1 : 0, 'selftestFail', selfFail);
if (hashFail || syntaxFail || advFail || selfFail) process.exit(1);
console.log('SUITE_OK');
