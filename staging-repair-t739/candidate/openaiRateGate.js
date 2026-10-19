'use strict';
/**
 * openaiRateGate.js — OPENAI_RATE_GATE_V1 (2026-09-29). Transport-only: never looks at, changes or
 * chooses reply content, prompts, routing, validators or business rules. It only decides WHEN an
 * already-built OpenAI request is sent, and whether a rejected one is re-sent.
 *
 * Why (evidence, 2026-09-28 incidents 215476138155708 @14:57Z and 215476139001024 @15:27Z):
 *   - The 429s were "Rate limit reached for gpt-6-luna in organization org-… on tokens per min (TPM):
 *     Limit 200000, Used ~193k". That is an ORGANIZATION, per-model TPM bucket.
 *   - Cached input tokens count toward TPM. Every Luna call carries ~24-30k input tokens, so ~7-8 calls
 *     fill the bucket. At both times 4-5 live conversations were in multi-round FULL episodes; a
 *     token-bucket replay of Luna's OWN logged calls reaches ~200k at exactly those seconds, and the only
 *     test runner active (image-routing replay) was provably parked in MODEL_TEST_GUARD waits.
 *   - The SDK retried each 429 twice, sleeping exactly Retry-After with no jitter while the other live
 *     conversations kept sending into the same full bucket, so all three attempts failed (13-15 s),
 *     then the runtime's recovery calls failed the same way and the turn became a teammate escalation.
 *
 * What this does (production only — see applies()):
 *   1. Local mirror of the org token bucket (capacity = limit, refill = limit/60 s), charged with each
 *      request's estimated tokens at send time and corrected with real usage / rate-limit headers /
 *      the "Used N" figure of a 429. When a send would push the bucket past PACE_THRESHOLD, the call
 *      waits for refill — at most PACE_MAX_WAIT_MS per call (all attempts together), then it is sent
 *      anyway (fail-open). Worst case per call ≈ 8 s pacing + 20 s retry waits.
 *   2. A 429 anywhere sets a process-wide cooldown (Retry-After / "try again in Xs" hint) so the other
 *      conversations stop sending into a full bucket instead of each collecting their own 429.
 *   3. Replaces (does not add to) the SDK's retry: requests go out with maxRetries 0 and are retried
 *      here. 429: at most RL_MAX_ATTEMPTS attempts total (same count as the SDK's 1+2), each wait =
 *      server hint × (1.1..1.3) + 250 ms, never sooner than asked; if the server asks for more than
 *      RL_MAX_WAIT_PER_RETRY_MS, or the total would exceed RL_TOTAL_RETRY_WAIT_MS, stop and surface the
 *      429 so the caller's EXISTING recovery / escalation path runs. insufficient_quota is not retried.
 *      5xx / 408 / 409 / connection / timeout errors keep the SDK's own policy (2 retries, Retry-After
 *      honoured, else 0.5 s·2^n with jitter, max 8 s).
 * Never used for: fake clients (selftests), clients wrapped by modelTestGuard (test traffic never
 * retries a 429), or LUNA_RL_GATE=off (kill switch → exact previous SDK behaviour).
 */

let OpenAIClass = null;
try { const m = require('openai'); OpenAIClass = m.OpenAI || m.default || m; } catch (_) { OpenAIClass = null; }

function num(v, d) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; }
function cfg() {
  const e = process.env;
  return {
    enabled: String(e.LUNA_RL_GATE || 'on').toLowerCase() !== 'off',
    tpmDefault: num(e.LUNA_RL_TPM_DEFAULT, 200000),
    paceThreshold: Math.min(1, Math.max(0.5, num(e.LUNA_RL_PACE_THRESHOLD, 0.92))),
    paceMaxWaitMs: Math.min(15000, num(e.LUNA_RL_PACE_MAX_WAIT_MS, 8000)),
    maxAttempts429: Math.min(4, Math.floor(num(e.LUNA_RL_MAX_ATTEMPTS, 3))),
    maxWaitPerRetryMs: Math.min(30000, num(e.LUNA_RL_MAX_WAIT_PER_RETRY_MS, 15000)),
    totalRetryWaitMs: Math.min(45000, num(e.LUNA_RL_TOTAL_RETRY_WAIT_MS, 20000)),
    maxAttemptsTransient: 3, // SDK default maxRetries 2 → 3 attempts
    imageTokens: 1500,
  };
}

/* --------------------------------------------------------------- shared state (one per process) */
const S = { limit: null, used: 0, at: Date.now(), cooldownUntil: 0, last429: null, stats: { paced: 0, retried429: 0, exhausted429: 0 } };
function nowMs() { return Date.now(); }
function limitOf(c) { return S.limit || c.tpmDefault; }
function usedAt(c, t) { const lim = limitOf(c); return Math.max(0, S.used - Math.max(0, t - S.at) * (lim / 60000)); }
function setUsed(c, v, t) { S.used = Math.max(0, v); S.at = t; }
function charge(c, n, t) { setUsed(c, usedAt(c, t) + n, t); }

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
function jitter(ms) { return Math.floor(Math.random() * ms); }

/* ------------------------------------------------------------------------- helpers */
function header(h, k) {
  if (!h) return null;
  try { if (typeof h.get === 'function') { const v = h.get(k); return v == null ? null : String(v); } } catch (_) {}
  const v = h[k] != null ? h[k] : h[String(k).toLowerCase()];
  return v == null ? null : String(v);
}

/** "6m0s" / "1.5s" / "250ms" / "7.083s" → ms */
function parseDuration(v) {
  const t = String(v || '').trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 1000);
  let ms = 0; let matched = false; const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g; let m;
  while ((m = re.exec(t))) { matched = true; const n = Number(m[1]); ms += m[2] === 'h' ? n * 3600000 : m[2] === 'm' ? n * 60000 : m[2] === 's' ? n * 1000 : n; }
  return matched ? Math.round(ms) : null;
}

/** Server-requested delay for a 429/503, in ms, or null. Max of all hints (never retry sooner). */
function serverDelayMs(e) {
  const h = e && e.headers;
  const hints = [];
  const rams = header(h, 'retry-after-ms'); if (rams && Number.isFinite(parseFloat(rams))) hints.push(parseFloat(rams));
  const ra = header(h, 'retry-after');
  if (ra) { const s = parseFloat(ra); if (Number.isFinite(s)) hints.push(s * 1000); else { const d = Date.parse(ra) - nowMs(); if (Number.isFinite(d)) hints.push(d); } }
  const msg = String((e && e.message) || '');
  const m = msg.match(/try again in\s+([\d.]+\s*(?:ms|s|m)(?:[\d.]+\s*(?:ms|s))?)/i);
  if (m) { const d = parseDuration(m[1].replace(/\s+/g, '')); if (d != null) hints.push(d); }
  const good = hints.filter((x) => Number.isFinite(x) && x >= 0);
  return good.length ? Math.max(...good) : null;
}

/** Parse "Limit 200000, Used 193696, Requested 29914" from a 429 message. */
function parseTpmMessage(msg) {
  const m = String(msg || '').match(/Limit\s+(\d+),\s*Used\s+(\d+),\s*Requested\s+(\d+)/i);
  return m ? { limit: Number(m[1]), used: Number(m[2]), requested: Number(m[3]) } : null;
}

function statusOf(e) { return (e && (e.status || e.statusCode || (e.response && e.response.status))) || 0; }
function isQuotaError(e) {
  const code = String((e && (e.code || (e.error && e.error.code) || (e.error && e.error.type))) || '');
  return /insufficient_quota|billing/i.test(code) || /insufficient_quota|exceeded your current quota|billing/i.test(String((e && e.message) || ''));
}

/** 'rate_limit' | 'transient' | null — mirrors the SDK's shouldRetry() plus connection errors. */
function retryKind(e) {
  const st = statusOf(e);
  const xs = header(e && e.headers, 'x-should-retry');
  if (xs === 'false') return null;
  if (st === 429) return isQuotaError(e) ? null : 'rate_limit';
  if (xs === 'true') return 'transient';
  if (st === 408 || st === 409 || st >= 500) return 'transient';
  if (!st) {
    const name = String((e && e.constructor && e.constructor.name) || (e && e.name) || '');
    if (/APIConnection(Timeout)?Error/.test(name)) return 'transient';
  }
  return null;
}

/** Rough token estimate of a built request (chars/4; images at a fixed cost, never their base64). */
function estimateTokens(built, c) {
  const cc = c || cfg();
  let chars = 0; let images = 0;
  const walk = (v, key) => {
    if (v == null) return;
    if (typeof v === 'string') {
      if (key === 'image_url' || key === 'url' || /^data:image\//.test(v)) { if (/^data:image\/|^https?:\/\//.test(v)) { images += 1; return; } }
      chars += v.length; return;
    }
    if (typeof v === 'number' || typeof v === 'boolean') { chars += 4; return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, key); return; }
    if (typeof v === 'object') { for (const k of Object.keys(v)) { if (k === 'model' || k === 'store' || k === 'reasoning' || k === 'text' && typeof v[k] === 'object' && v[k] && v[k].verbosity) continue; walk(v[k], k); } }
  };
  try { walk({ instructions: built.instructions, input: built.input, messages: built.messages, tools: built.tools }); } catch (_) { chars = 80000; }
  return Math.ceil(chars / 4) + images * cc.imageTokens;
}

/* ------------------------------------------------------------------------- policy */
function applies(openai) {
  const c = cfg();
  if (!c.enabled || !openai) return false;
  if (openai.__lunaTestGuard) return false; // test traffic: modelTestGuard owns it, never retries a 429
  return !!(OpenAIClass && typeof OpenAIClass === 'function' && openai instanceof OpenAIClass);
}

/** Pacing before a send. Returns ms waited. Charge happens synchronously after the last check. */
async function acquire(c, est, ctx, budgetMs) {
  const t0 = nowMs();
  const cap = Math.max(0, budgetMs == null ? c.paceMaxWaitMs : budgetMs);
  let logged = false;
  for (;;) {
    const t = nowMs();
    const lim = limitOf(c);
    const used = usedAt(c, t);
    let need = 0; let why = '';
    if (S.cooldownUntil > t) { need = S.cooldownUntil - t; why = 'cooldown-after-429'; }
    else if (used > 0 && used + est > lim * c.paceThreshold) { need = Math.ceil((used + est - lim * c.paceThreshold) / (lim / 60000)); why = 'bucket-near-limit'; }
    if (need <= 0) break;
    const left = cap - (t - t0);
    if (left <= 0) { try { console.log('OPENAI_RATE_GATE pace-cap ' + JSON.stringify({ purpose: ctx.purpose, cid: ctx.cid, waitedMs: t - t0, why })); } catch (_) {} break; }
    if (!logged) { logged = true; S.stats.paced += 1; try { console.log('OPENAI_RATE_GATE pace ' + JSON.stringify({ purpose: ctx.purpose, cid: ctx.cid, why, estTokens: est, bucketUsed: Math.round(used), limit: lim, needMs: need })); } catch (_) {} }
    await sleep(Math.min(need + 50 + jitter(250), left, 2000));
  }
  charge(c, est, nowMs());
  return logged ? nowMs() - t0 : 0;
}

function learnFromSuccess(c, est, data, headers) {
  const t = nowMs();
  const lim = Number(header(headers, 'x-ratelimit-limit-tokens'));
  if (lim > 0) S.limit = lim;
  const u = data && data.usage;
  const actual = u ? (Number(u.total_tokens) || (Number(u.input_tokens || u.prompt_tokens || 0) + Number(u.output_tokens || u.completion_tokens || 0))) : 0;
  if (actual > 0) charge(c, actual - est, t);
  const rem = Number(header(headers, 'x-ratelimit-remaining-tokens'));
  if (lim > 0 && Number.isFinite(rem) && rem >= 0 && rem <= lim) {
    const hdrUsed = lim - rem;
    if (hdrUsed > usedAt(c, t)) setUsed(c, hdrUsed, t); // only ever raises the estimate (conservative)
  }
}

function learnFrom429(c, est, e) {
  const t = nowMs();
  charge(c, -est, t); // the rejected request was not admitted
  const p = parseTpmMessage(e && e.message);
  if (p) { S.limit = p.limit; if (p.used > usedAt(c, t)) setUsed(c, p.used, t); }
  const hint = serverDelayMs(e);
  const until = t + (hint != null ? hint : 1000) + jitter(250);
  if (until > S.cooldownUntil) S.cooldownUntil = until;
  S.last429 = { at: t, hintMs: hint, used: p ? p.used : null };
  return hint;
}

function transientDelay(e, attempt) {
  const hint = serverDelayMs(e);
  if (hint != null && hint >= 0 && hint <= 60000) return hint;
  const sleepS = Math.min(0.5 * Math.pow(2, attempt - 1), 8);
  return sleepS * (1 - Math.random() * 0.25) * 1000;
}

/**
 * Send one already-built request. `send(opts)` must perform the SDK call with the given per-request
 * options and resolve { data, headers }. `stats` (optional object) receives attempts / waits.
 */
async function run(openai, built, send, ctx, stats) {
  const c = cfg();
  const st = stats || {};
  st.attempts = 0; st.paceWaitMs = 0; st.retryWaitMs = 0;
  const est = estimateTokens(built, c);
  let retryWait = 0;
  for (;;) {
    st.attempts += 1;
    // Pacing budget is per CALL (all attempts together), so a saturated bucket can delay one call by at
    // most PACE_MAX_WAIT_MS on top of its bounded retry waits.
    st.paceWaitMs += await acquire(c, est, ctx || {}, c.paceMaxWaitMs - st.paceWaitMs);
    try {
      const out = await send({ maxRetries: 0 });
      learnFromSuccess(c, est, out && out.data, out && out.headers);
      return out && out.data;
    } catch (e) {
      const kind = retryKind(e);
      if (kind === 'rate_limit') {
        const hint = learnFrom429(c, est, e);
        const wait = Math.ceil((hint != null ? hint : 1000 * Math.pow(2, st.attempts - 1)) * (1.1 + Math.random() * 0.2) + 250);
        const stop = st.attempts >= c.maxAttempts429 ? 'max-attempts'
          : (hint != null && hint > c.maxWaitPerRetryMs) ? 'server-delay-too-long'
            : (retryWait + wait > c.totalRetryWaitMs) ? 'retry-budget' : null;
        try { console.log('OPENAI_RATE_GATE 429 ' + JSON.stringify({ purpose: ctx && ctx.purpose, cid: ctx && ctx.cid, attempt: st.attempts, hintMs: hint, waitMs: stop ? 0 : wait, stop, used: S.last429 && S.last429.used })); } catch (_) {}
        if (stop) { S.stats.exhausted429 += 1; st.exhausted = stop; throw e; }
        S.stats.retried429 += 1;
        retryWait += wait; st.retryWaitMs += wait;
        await sleep(wait);
        continue;
      }
      if (kind === 'transient' && st.attempts < c.maxAttemptsTransient) {
        charge(c, -est, nowMs());
        const wait = transientDelay(e, st.attempts);
        try { console.log('OPENAI_RATE_GATE retry ' + JSON.stringify({ purpose: ctx && ctx.purpose, cid: ctx && ctx.cid, attempt: st.attempts, status: statusOf(e) || null, waitMs: Math.round(wait) })); } catch (_) {}
        st.retryWaitMs += wait;
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
}

function snapshot() { const c = cfg(); return { limit: limitOf(c), bucketUsed: Math.round(usedAt(c, nowMs())), cooldownMs: Math.max(0, S.cooldownUntil - nowMs()), last429: S.last429, stats: { ...S.stats } }; }
function _reset() { S.limit = null; S.used = 0; S.at = nowMs(); S.cooldownUntil = 0; S.last429 = null; S.stats = { paced: 0, retried429: 0, exhausted429: 0 }; }

module.exports = { applies, run, estimateTokens, serverDelayMs, parseTpmMessage, parseDuration, retryKind, snapshot, cfg, _reset, _state: S };
