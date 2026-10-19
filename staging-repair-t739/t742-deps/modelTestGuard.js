'use strict';
/**
 * modelTestGuard.js — MODEL_TEST_GUARD_V1: keeps real-model TEST traffic from eating the
 * production OpenAI rate limit.
 *
 * Why: tests, replays and local chats use the same OpenAI key/organization as the live bot (there
 * is no separate test project or key). On 2026-09-23 18:33 UTC ~150 parallel real-model test
 * episodes pushed the shared org to its 200k TPM limit and live conversation 215476072031655 got
 * four 429s. This module wraps every REAL OpenAI client created outside the production process
 * so that test traffic:
 *   - runs at most MAX_CONCURRENCY calls at once ACROSS ALL test processes (lock files);
 *   - stays inside its own tokens/requests-per-minute budget (shared ledger);
 *   - leaves RESERVE of the org limit to production, minus what production used in the last
 *     minute (read from the production PM2 log), and drops to one call at a time while
 *     production is making model calls;
 *   - waits when OpenAI's own x-ratelimit-remaining-tokens header says headroom is low;
 *   - never retries a 429 by itself (SDK maxRetries 0), backs off ALL test processes on a 429,
 *     and trips a breaker (every test call fails fast) after repeated 429s.
 *
 * Production is never wrapped: guardClient() returns the client unchanged inside the PM2
 * `intercom-bot` process (pm_id set + name=intercom-bot). Offline tests that use fake clients
 * never reach this module, because only `new OpenAI(...)` instances are passed to it.
 *
 * Tunables (env): LUNA_TEST_GUARD_DIR, LUNA_TEST_MAX_CONCURRENCY (default 1, hard cap 3),
 * LUNA_TEST_TPM (default 40000, hard cap 60000), LUNA_TEST_RPM (default 30), LUNA_TEST_ORG_TPM
 * (default 200000, replaced by the x-ratelimit-limit-tokens header once seen), LUNA_TEST_RESERVE
 * (default AND floor 0.7 — tests can never be configured to leave production less than 70% of the
 * org limit), LUNA_TEST_MAX_WAIT_MS (default 900000), LUNA_PROD_LOG.
 *
 * OPENAI_RATE_GATE_V1 (2026-09-29): the safe throttles that used to be passed by hand
 * (LUNA_TEST_MAX_CONCURRENCY=1 LUNA_TEST_TPM=40000 LUNA_TEST_RESERVE=0.7) are now the defaults, so they
 * cannot be forgotten. A production 429 seen in the live PM2 log stands every test process down for
 * PROD_429_COOLDOWN_MS, and a test 429 now cools all tests down for >= 60 s (was 20 s).
 */
const fs = require('fs');
const path = require('path');

const HARD_MAX_CONCURRENCY = 3;
const HARD_MAX_TEST_TPM = 60000;
const MIN_RESERVE = 0.7;
const PROD_429_COOLDOWN_MS = 2 * 60 * 1000;
const WINDOW_MS = 60 * 1000;

function num(v, d) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; }

function cfg() {
  const e = process.env;
  return {
    dir: e.LUNA_TEST_GUARD_DIR || '/home/ubuntu/.luna-test-guard',
    maxConcurrency: Math.min(HARD_MAX_CONCURRENCY, Math.floor(num(e.LUNA_TEST_MAX_CONCURRENCY, 1))),
    testTpm: Math.min(HARD_MAX_TEST_TPM, num(e.LUNA_TEST_TPM, 40000)),
    testRpm: num(e.LUNA_TEST_RPM, 30),
    orgTpmDefault: num(e.LUNA_TEST_ORG_TPM, 200000),
    reserve: Math.min(0.9, Math.max(MIN_RESERVE, num(e.LUNA_TEST_RESERVE, MIN_RESERVE))),
    maxWaitMs: num(e.LUNA_TEST_MAX_WAIT_MS, 15 * 60 * 1000),
    pollMs: num(e.LUNA_TEST_POLL_MS, 1000),
    prodLog: e.LUNA_PROD_LOG || '/home/ubuntu/.pm2/logs/intercom-bot-out-0.log',
    prodActiveMs: num(e.LUNA_TEST_PROD_ACTIVE_MS, 30000),
    breakerCount: 3,
    breakerWindowMs: 10 * 60 * 1000,
    breakerTripMs: 15 * 60 * 1000,
  };
}

/** True only inside the live PM2 bot process. */
function isProductionProcess(env) {
  const e = env || process.env;
  return e.pm_id !== undefined && e.pm_id !== '' && String(e.name || '') === 'intercom-bot';
}

class TestGuardError extends Error {
  constructor(message, kind) { super(message); this.name = 'TestGuardError'; this.kind = kind; this.status = 0; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ensureDir(d) { fs.mkdirSync(d, { recursive: true, mode: 0o700 }); fs.mkdirSync(path.join(d, 'slots'), { recursive: true, mode: 0o700 }); }
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return d; } }
function writeJson(f, v) { const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(v), { mode: 0o600 }); fs.renameSync(t, f); }
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

/** Tiny cross-process mutex for read-modify-write of the shared state files. */
async function withLock(c, fn) {
  const lock = path.join(c.dir, 'state.lock');
  const t0 = Date.now();
  for (;;) {
    try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 }); break; } catch (_) {
      const holder = Number(readRaw(lock));
      if (!holder || !pidAlive(holder) || Date.now() - t0 > 5000) { try { fs.unlinkSync(lock); } catch (_) {} continue; }
      await sleep(20);
    }
  }
  try { return fn(); } finally { try { fs.unlinkSync(lock); } catch (_) {} }
}
function readRaw(f) { try { return fs.readFileSync(f, 'utf8'); } catch (_) { return ''; } }

/* ------------------------------------------------------------- shared state */

function statePath(c) { return path.join(c.dir, 'state.json'); }
function emptyState() { return { test: [], prod: [], prodLog: null, orgTpm: null, headroom: null, cooldownUntil: 0, rateLimits: [], trippedUntil: 0, reservations: {} }; }
function prune(s, now) {
  s.test = (s.test || []).filter((x) => now - x.ts < WINDOW_MS);
  s.prod = (s.prod || []).filter((x) => now - x.ts < WINDOW_MS);
  s.rateLimits = (s.rateLimits || []).filter((ts) => now - ts < cfg().breakerWindowMs);
  const res = s.reservations || {};
  for (const k of Object.keys(res)) if (!pidAlive(res[k].pid) || now - res[k].ts > 10 * 60 * 1000) delete res[k];
  s.reservations = res;
  return s;
}

/** Read what production logged since the last look and record its model-token usage. */
function sampleProduction(c, s, now) {
  let st;
  try { st = fs.statSync(c.prodLog); } catch (_) { return s; }
  const prev = s.prodLog;
  if (!prev || prev.ino !== st.ino || st.size < prev.offset) { s.prodLog = { ino: st.ino, offset: st.size }; return s; }
  if (st.size === prev.offset) return s;
  const start = Math.max(prev.offset, st.size - 512 * 1024);
  const fd = fs.openSync(c.prodLog, 'r');
  try {
    const buf = Buffer.alloc(st.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    let tokens = 0; let calls = 0; let prod429 = false;
    for (const line of buf.toString('utf8').split('\n')) {
      // Production is being rate limited right now: every test process stands down.
      if (line.startsWith('OPENAI_RATE_GATE 429') || (line.startsWith('LUNA_MODEL_CALL ') && /"status":429/.test(line))) prod429 = true;
      if (!line.startsWith('LUNA_MODEL_CALL ')) continue;
      calls += 1;
      const m = line.match(/"totalTokens":(\d+)/);
      tokens += m ? Number(m[1]) : 0;
    }
    if (calls) s.prod.push({ ts: now, tokens, calls });
    if (prod429) { s.cooldownUntil = Math.max(s.cooldownUntil || 0, now + PROD_429_COOLDOWN_MS); s.prod429At = now; }
  } finally { fs.closeSync(fd); }
  s.prodLog = { ino: st.ino, offset: st.size };
  return s;
}

function sum(list, k) { return (list || []).reduce((a, x) => a + (Number(x[k]) || 0), 0); }

/**
 * Decide whether a test call of `est` tokens may start now. Pure function of the state, so the
 * policy is unit-testable. Returns { ok, reason, waitMs }.
 */
function admission(c, s, est, now) {
  if (s.trippedUntil > now) return { ok: false, fatal: true, reason: 'breaker-tripped', waitMs: s.trippedUntil - now };
  if (s.cooldownUntil > now) return { ok: false, reason: (s.prod429At && now - s.prod429At < PROD_429_COOLDOWN_MS) ? 'production-429-cooldown' : 'rate-limit-cooldown', waitMs: s.cooldownUntil - now };
  const orgTpm = s.orgTpm || c.orgTpmDefault;
  const prodTokens = sum(s.prod, 'tokens');
  const prodActive = (s.prod || []).some((x) => now - x.ts < c.prodActiveMs);
  const reserved = Object.values(s.reservations || {});
  const inflightTokens = sum(reserved, 'est');
  const testTokens = sum(s.test, 'tokens') + inflightTokens;
  const testReqs = (s.test || []).length + reserved.length;
  // Production always keeps RESERVE of the org limit plus whatever it actually used this minute.
  const testCeiling = Math.min(c.testTpm, Math.max(0, orgTpm * (1 - c.reserve) - prodTokens));
  const conc = prodActive ? 1 : c.maxConcurrency;
  if (reserved.length >= conc) return { ok: false, reason: prodActive ? 'production-active:concurrency-1' : 'concurrency', waitMs: c.pollMs };
  if (testReqs + 1 > c.testRpm) return { ok: false, reason: 'test-rpm', waitMs: c.pollMs };
  if (testTokens + est > testCeiling && !(testTokens === 0 && est > testCeiling && testCeiling >= c.testTpm * 0.5)) {
    return { ok: false, reason: prodTokens > 0 ? 'test-tpm(production-used ' + prodTokens + ')' : 'test-tpm', waitMs: c.pollMs };
  }
  const h = s.headroom;
  if (h && now - h.ts < WINDOW_MS && h.limit > 0 && h.remaining / h.limit < c.reserve) {
    return { ok: false, reason: 'provider-headroom-low', waitMs: Math.max(c.pollMs, Math.min(h.resetMs || c.pollMs, 30000)) };
  }
  return { ok: true, reason: 'ok', waitMs: 0 };
}

async function acquire(c, est, label) {
  ensureDir(c.dir);
  const t0 = Date.now();
  let lastReason = '';
  for (;;) {
    const now = Date.now();
    const got = await withLock(c, () => {
      const s = prune(Object.assign(emptyState(), readJson(statePath(c), {})), now);
      sampleProduction(c, s, now);
      const a = admission(c, s, est, now);
      if (a.ok) {
        const id = process.pid + '-' + now + '-' + Math.random().toString(36).slice(2, 8);
        s.reservations[id] = { pid: process.pid, est, ts: now };
        writeJson(statePath(c), s);
        return { id };
      }
      writeJson(statePath(c), s);
      return { wait: a };
    });
    if (got.id) return got.id;
    const a = got.wait;
    if (a.fatal) throw new TestGuardError('MODEL_TEST_GUARD breaker tripped after repeated 429s; test model calls refused for ' + Math.ceil(a.waitMs / 1000) + 's', 'breaker');
    if (a.reason !== lastReason) { lastReason = a.reason; try { process.stderr.write('MODEL_TEST_GUARD wait ' + a.reason + (label ? ' (' + label + ')' : '') + '\n'); } catch (_) {} }
    if (Date.now() - t0 > c.maxWaitMs) throw new TestGuardError('MODEL_TEST_GUARD waited too long (' + a.reason + ')', 'timeout');
    // never sleep past the caller's max wait (a 2-minute production-429 cooldown must still end in a clean abort)
    await sleep(Math.max(c.pollMs, Math.min(a.waitMs || c.pollMs, c.maxWaitMs - (Date.now() - t0) + c.pollMs)));
  }
}

async function release(c, id, outcome) {
  const now = Date.now();
  await withLock(c, () => {
    const s = prune(Object.assign(emptyState(), readJson(statePath(c), {})), now);
    const r = s.reservations[id];
    delete s.reservations[id];
    const tokens = outcome.tokens != null ? outcome.tokens : (r ? r.est : 0);
    s.test.push({ ts: now, tokens });
    if (outcome.headers) {
      const lim = Number(outcome.headers.limit);
      const rem = Number(outcome.headers.remaining);
      if (lim > 0) { s.orgTpm = lim; if (Number.isFinite(rem)) s.headroom = { ts: now, limit: lim, remaining: rem, resetMs: parseReset(outcome.headers.reset) }; }
    }
    if (outcome.rateLimited) {
      s.rateLimits.push(now);
      const n = s.rateLimits.length;
      s.cooldownUntil = now + Math.min(5 * 60 * 1000, 60000 * Math.pow(2, n - 1));
      if (n >= c.breakerCount) s.trippedUntil = now + c.breakerTripMs;
    }
    writeJson(statePath(c), s);
  });
}

/** "6m0s" / "1.5s" / "250ms" → ms */
function parseReset(v) {
  const t = String(v || '');
  if (!t) return 0;
  let ms = 0; let matched = false;
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g; let m;
  while ((m = re.exec(t))) { matched = true; const n = Number(m[1]); ms += m[2] === 'h' ? n * 3600000 : m[2] === 'm' ? n * 60000 : m[2] === 's' ? n * 1000 : n; }
  return matched ? Math.round(ms) : 0;
}

function estimateTokens(body) {
  let chars = 0;
  try { chars = JSON.stringify((body && (body.input || body.messages)) || '').length; } catch (_) { chars = 20000; }
  const out = Number((body && (body.max_output_tokens || body.max_completion_tokens)) || 0) || 2000;
  return Math.ceil(chars / 4) + Math.min(out, 4000);
}

function usageTokens(r) {
  const u = (r && r.usage) || {};
  const t = Number(u.total_tokens || 0) || (Number(u.input_tokens || u.prompt_tokens || 0) + Number(u.output_tokens || u.completion_tokens || 0));
  return t > 0 ? t : null;
}

function wrapCreate(c, target, label) {
  const orig = target.create.bind(target);
  target.create = async function guardedCreate(body, options) {
    const est = estimateTokens(body);
    const id = await acquire(c, est, label);
    let outcome = { tokens: null };
    try {
      const p = orig(body, Object.assign({}, options || {}, { maxRetries: 0 }));
      let data; let headers = null;
      if (p && typeof p.withResponse === 'function') {
        const wr = await p.withResponse();
        data = wr.data;
        const h = wr.response && wr.response.headers;
        if (h && typeof h.get === 'function') headers = { limit: h.get('x-ratelimit-limit-tokens'), remaining: h.get('x-ratelimit-remaining-tokens'), reset: h.get('x-ratelimit-reset-tokens') };
      } else {
        data = await p;
      }
      outcome = { tokens: usageTokens(data), headers };
      return data;
    } catch (e) {
      const status = (e && (e.status || (e.response && e.response.status))) || 0;
      outcome = { tokens: null, rateLimited: status === 429 };
      if (status === 429) { try { process.stderr.write('MODEL_TEST_GUARD 429 received: all test processes back off\n'); } catch (_) {} }
      throw e;
    } finally {
      await release(c, id, outcome);
    }
  };
}

/**
 * Wrap a real OpenAI client for test traffic. Returns the SAME object unchanged in production.
 * `opts.env` / `opts.force` exist for the self-test only.
 */
function guardClient(client, opts) {
  const o = opts || {};
  if (!client) return client;
  if (!o.force && isProductionProcess(o.env)) return client;
  if (client.__lunaTestGuard) return client;
  const c = Object.assign(cfg(), o.config || {});
  if (client.responses && typeof client.responses.create === 'function') wrapCreate(c, client.responses, o.label);
  if (client.chat && client.chat.completions && typeof client.chat.completions.create === 'function') wrapCreate(c, client.chat.completions, o.label);
  Object.defineProperty(client, '__lunaTestGuard', { value: true, enumerable: false });
  return client;
}

module.exports = { guardClient, isProductionProcess, admission, parseReset, estimateTokens, cfg, TestGuardError, HARD_MAX_CONCURRENCY, HARD_MAX_TEST_TPM, MIN_RESERVE, PROD_429_COOLDOWN_MS, sampleProduction, emptyState };
