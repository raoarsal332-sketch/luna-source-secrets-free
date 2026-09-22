'use strict';

/**
 * sandbox.js - candidate patches are only ever applied to a COPY.
 *
 * Guarantees enforced in code, not by convention:
 *   - the sandbox root is a fresh temp dir and is asserted to be outside lunaRoot;
 *   - Luna's own state files (bot-control.json, ticket state, prompt file) are
 *     redirected to sandbox copies via env, so a test can never mutate live state;
 *   - the sandbox is removed after the run.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SKIP = new Set(['node_modules', '.git', '.maintainer', 'luna-maintainer']);
// Secrets must never be copied into a sandbox/staging tree, even transiently under backupDir.
const SKIP_SECRET_RE = /^\.env(\..*)?$|credential|secret|^id_rsa(\.pub)?$|^\.ssh$/i;

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || SKIP_SECRET_RE.test(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function create(lunaRoot, baseDir) {
  const real = fs.realpathSync(lunaRoot);
  const parent = baseDir || fs.mkdtempSync(path.join(os.tmpdir(), 'luna-sbx-'));
  fs.mkdirSync(parent, { recursive: true });
  const root = path.join(parent, 'luna');
  if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  copyTree(real, root);

  const resolved = fs.realpathSync(root);
  if (resolved === real || resolved.startsWith(real + path.sep)) {
    throw new Error('refusing to run: sandbox resolves inside the production root');
  }

  /** Redirect Luna's state files at the env level for the duration of a run. */
  function isolateEnv() {
    const saved = {};
    const set = (k, v) => { saved[k] = process.env[k]; process.env[k] = v; };
    set('TICKET_STATE_FILE', path.join(parent, 'bot-ticket-state.json'));
    set('LUNA_TRACE_FILE', path.join(parent, 'trace.jsonl'));
    set('LUNA_ERROR_FILE', path.join(parent, 'errors.jsonl'));
    set('LUNA_KNOWLEDGE_GAP_FILE', path.join(parent, 'gaps.jsonl'));
    set('LUNA_HUMAN_CORRECTION_FILE', path.join(parent, 'corrections.jsonl'));
    return function restore() {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    };
  }

  function applyPatch(patch) {
    const pf = path.join(parent, 'candidate.patch');
    fs.writeFileSync(pf, patch.endsWith('\n') ? patch : `${patch}\n`);
    let last = '';
    for (const cmd of [['git', ['apply', '--whitespace=nowarn', pf]], ['patch', ['-p1', '-i', pf]]]) {
      try {
        execFileSync(cmd[0], cmd[1], { cwd: root, stdio: 'pipe', timeout: 120000 });
        return { ok: true, detail: `applied with ${cmd[0]}` };
      } catch (e) {
        last = String((e.stderr || e.stdout || e.message) || '').slice(0, 600);
      }
    }
    return { ok: false, detail: `patch did not apply: ${last}` };
  }

  function writeFile(rel, content) {
    const dest = path.resolve(root, rel);
    if (!dest.startsWith(path.resolve(root) + path.sep)) throw new Error(`path escapes sandbox: ${rel}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }

  function destroy() {
    if (!baseDir) fs.rmSync(parent, { recursive: true, force: true });
  }

  return { root, parent, applyPatch, writeFile, isolateEnv, destroy };
}

module.exports = { create, copyTree };
