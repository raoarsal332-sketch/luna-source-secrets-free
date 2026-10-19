'use strict';
/**
 * statePathGuard.js — STATE_PATH_GUARD_V1 (pure; no env reads at load time).
 * The production entry point calls applyDeclaredStatePaths(process.env, <ecosystem env>) before any
 * other module reads these variables, so a launching shell's exported test paths can never again
 * point the live bot at throwaway state (incident 2026-09-23 13:46–14:37 UTC).
 */
const STATE_PATH_KEYS = ['LUNA_PROMPT_FILE', 'LUNA_CONTROL_STATE_FILE', 'TICKET_STATE_FILE', 'IMAGE_GUARD_STATE_FILE', 'MENTION_ROTATE_FILE', 'LUNA_OP_STORE_FILE'];

/** Mutates `env`; returns [{key, had, now}] for every key it had to correct. */
function applyDeclaredStatePaths(env, declared) {
  const changed = [];
  if (!env || !declared) return changed;
  for (const k of STATE_PATH_KEYS) {
    const want = declared[k];
    if (!want || env[k] === want) continue;
    changed.push({ key: k, had: env[k] === undefined ? null : env[k], now: want });
    env[k] = want;
  }
  return changed;
}

/**
 * STATE_PATH_GUARD_V2 — a declared path is only acceptable if, after resolving '..' and every
 * symlink (for a file that does not exist yet: its directory), it lands inside an allowed production
 * location. Blocks /tmp, staging trees, traversal and symlink escapes.
 * @returns {{ ok: boolean, problems: string[] }}
 */
const fs = require('fs');
const path = require('path');
const ALLOWED_STATE_DIRS = ['/home/ubuntu/luna-brain-upgrade'];
const ALLOWED_PROMPT_TARGETS = ['/home/ubuntu/system-prompt.txt'];

function resolveReal(p) {
  const abs = path.resolve(String(p || ''));
  try { return fs.realpathSync(abs); } catch (_) {
    try { return path.join(fs.realpathSync(path.dirname(abs)), path.basename(abs)); } catch (__) { return abs; }
  }
}

function validateDeclaredPaths(declared, opts) {
  opts = opts || {};
  const allowedDirs = opts.allowedStateDirs || ALLOWED_STATE_DIRS;
  const allowedPrompts = opts.allowedPromptTargets || ALLOWED_PROMPT_TARGETS;
  const problems = [];
  if (!declared) return { ok: false, problems: ['no declared env'] };
  for (const k of STATE_PATH_KEYS) {
    const v = declared[k];
    if (!v) { problems.push(k + ' is not declared'); continue; }
    if (!path.isAbsolute(v)) { problems.push(k + ' is not absolute'); continue; }
    if (/(^|\/)\.\.(\/|$)/.test(v)) { problems.push(k + ' contains ..'); continue; }
    const real = resolveReal(v);
    if (k === 'LUNA_PROMPT_FILE') {
      if (!allowedPrompts.includes(real)) problems.push(k + ' resolves to ' + real + ' (allowed: ' + allowedPrompts.join(', ') + ')');
      continue;
    }
    if (!allowedDirs.some((d) => real === d || real.startsWith(d + '/'))) {
      problems.push(k + ' resolves to ' + real + ' (outside ' + allowedDirs.join(', ') + ')');
    }
  }
  return { ok: problems.length === 0, problems };
}

/* FAQ_FALLBACK_AUTHORITY_V1: FUNDEDELITE_FAQ_PATH feeds faq-kb's markdown fallback (used when the
 * canonical knowledge store cannot load) and is the first markdown candidate of a knowledge sync run
 * with the bot's environment. It must be the ONE maintained markdown (the file the cron sync reads),
 * not a separate copy: a copy under luna-brain-upgrade/ silently fell 29 lines behind (2026-09-19 →
 * 2026-09-23). The declared path may be that file or a symlink resolving to it, and must not carry a
 * retired owner block. `retired` is luna-knowledge/lib/retired.js (injected so this stays pure). */
const FAQ_MARKDOWN_TARGET = '/home/ubuntu/fundedelite-faqs.md';
function validateFaqFallback(declared, opts) {
  const o = opts || {};
  const fs = o.fs || require('fs');
  const target = o.target || FAQ_MARKDOWN_TARGET;
  const problems = [];
  const p = declared && declared.FUNDEDELITE_FAQ_PATH;
  if (!p) return { ok: true, problems, note: 'unset: faq-kb falls back to ' + target };
  let real = '';
  try { real = fs.realpathSync(p); } catch (e) { problems.push('FUNDEDELITE_FAQ_PATH ' + p + ' does not resolve (' + e.code + ')'); }
  let realTarget = target;
  try { realTarget = fs.realpathSync(target); } catch (_) {}
  if (real && real !== realTarget) problems.push('FUNDEDELITE_FAQ_PATH ' + p + ' resolves to ' + real + ', not the maintained markdown ' + target + ' (a separate copy drifts)');
  if (real && o.retired) {
    try { if (o.retired.hasRetired(fs.readFileSync(real, 'utf8'))) problems.push('FAQ markdown ' + real + ' contains a retired owner block'); } catch (_) {}
  }
  return { ok: problems.length === 0, problems };
}

module.exports = { STATE_PATH_KEYS, applyDeclaredStatePaths, validateDeclaredPaths, ALLOWED_STATE_DIRS, ALLOWED_PROMPT_TARGETS, validateFaqFallback, FAQ_MARKDOWN_TARGET };
