'use strict';

const fs = require('fs');
const path = require('path');

const SEND_PATTERNS = [
  { kind: 'axios-call', re: /\baxios\s*\(/ },
  { kind: 'axios-method', re: /\baxios\s*\.\s*(?:request|get|post|put|patch|delete|head)\s*\(/ },
  { kind: 'http-request', re: /\bhttps?\s*\.\s*(?:request|get)\s*\(/ },
  { kind: 'fetch', re: /\bfetch\s*\(/ },
  { kind: 'undici', re: /\bundici\b/ },
  { kind: 'node-fetch', re: /\bnode-fetch\b/ },
  { kind: 'got', re: /\bgot\s*\(/ },
  { kind: 'net-connect', re: /\bnet\s*\.\s*(?:connect|createConnection)\s*\(/ },
  { kind: 'child-process', re: /\b(?:child_process|cp)\s*\.\s*(?:exec|execFile|spawn|fork|execSync|spawnSync)\s*\(/ },
  { kind: 'model-create', re: /chat\s*\.\s*completions\s*\.\s*create\s*\(/ },
  { kind: 'raw-require-axios', re: /require\s*\(\s*['"]axios['"]\s*\)/ },
  { kind: 'raw-require-http', re: /require\s*\(\s*['"]node:(?:http|https)['"]\s*\)|require\s*\(\s*['"]https?['"]\s*\)/ },
  { kind: 'dynamic-require', re: /require\s*\(\s*[^'"\s]/ },
  { kind: 'getBuiltinModule', re: /getBuiltinModule\s*\(/ },
  { kind: 'new-function', re: /\bnew\s+Function\s*\(/ },
  { kind: 'vm', re: /\bvm\s*\.\s*(?:runInNewContext|runInThisContext|compileFunction)\s*\(/ },
];

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function scanFile(file, root) {
  const source = fs.readFileSync(file, 'utf8');
  const code = stripComments(source);
  const lines = code.split('\n');
  const findings = [];
  const rel = path.relative(root, file);
  const boundaryImpl = rel.endsWith('credentialGuardR13.js');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of SEND_PATTERNS) {
      if (!pattern.re.test(line)) continue;
      const start = Math.max(0, i - 40);
      const window = lines.slice(start, i + 1).join('\n');
      const guarded = /authorizeOutbound|guardedSend|dispatchAuthorized|createGuardedTransport|installRequireTripwire|sealAxios|sealHttp/.test(window);
      findings.push({
        file: rel,
        line: i + 1,
        kind: pattern.kind,
        guardedNearby: guarded,
        boundaryImpl: boundaryImpl,
        text: line.trim().slice(0, 180),
      });
    }
  }
  return findings;
}

function scanTree(root) {
  const files = [];
  walk(root, files);
  const findings = [];
  for (const file of files) findings.push(...scanFile(file, root));
  const product = findings.filter((f) => !f.boundaryImpl && !f.guardedNearby);
  return {
    files: files.length,
    findings: findings.length,
    unguarded: product,
    all: findings,
  };
}

module.exports = { scanTree, scanFile };

if (require.main === module) {
  const root = process.argv[2];
  if (!root) {
    console.error('usage: static-scan.js <root>');
    process.exit(2);
  }
  const result = scanTree(root);
  process.stdout.write(JSON.stringify({ files: result.files, findings: result.findings, unguarded: result.unguarded }, null, 2));
}
