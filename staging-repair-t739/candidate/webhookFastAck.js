'use strict';

/**
 * Crash-safe fast acknowledgement for Intercom webhooks.
 *
 * The HTTP handler validates the envelope and durably stores the event
 * (temp file, fsync, exclusive link, directory fsync) before it returns 200.
 * A worker later runs the existing business handler. The kill switch is the
 * file webhook-fastack.mode ("sync" or "fastack") in the install root, read
 * on every request, so it takes effect without a restart. If that file is
 * absent, the mode last read stays in force until process restart — deleting
 * the file does not revert to sync. webhook-fastack.config.json supplies the
 * mode only when the file has never been read in this process. Queued events
 * already accepted keep draining in either mode; new HTTP requests follow the
 * mode just read. Completed, dead-lettered, and quarantined bodies (and aged
 * ledger files) are removed on startup and again every hour, after doneTtlMs
 * (24h). pending/ and inflight/ are never pruned.
 *
 * No new npm dependencies. No Redis. Queue state lives in its own directory.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

const DEFAULTS = Object.freeze({
  mode: 'fastack',
  maxQueueDepth: 500,
  maxConcurrency: 4,
  maxAttempts: 5,
  stalenessMs: 12 * 60 * 1000,
  dedupeTtlMs: 24 * 60 * 60 * 1000,
  dedupeMax: 20000,
  minFreeBytes: 200 * 1024 * 1024,
  backoffBaseMs: 500,
  backoffMaxMs: 60 * 1000,
  doneTtlMs: 24 * 60 * 60 * 1000,
  donePruneIntervalMs: 60 * 60 * 1000,
  workerIntervalMs: 1000,
});

const HANDLED_TOPICS = new Set([
  'conversation.user.created',
  'conversation.user.replied',
  'conversation.admin.noted',
]);

let rootDir = '';
let config = Object.assign({}, DEFAULTS);
let configPath = '';
let configRead = false;
let paths = null;
let inspector = null;
let processor = null;
let workerTimer = null;
let active = 0;
let draining = false;
let kickScheduled = false;
let crashPoint = '';
let freeBytesOverride = null;
let writeFailure = null;
let receiptSeq = 0;
let lastStatusWrite = 0;
let modeStamp = '';
let pendingWatcher = null;
let workerWanted = false;
let lastDonePrune = Date.now();
let claimTail = Promise.resolve();
let workerCrashed = false;
let workerGen = 0;
const publishing = new Set();
let metrics = freshMetrics();

function freshMetrics() {
  return {
    ackMs: [],
    http200: 0,
    http4xx: 0,
    http5xx: 0,
    duplicates: 0,
    failures: 0,
    retries: 0,
    deadLetters: 0,
    lastArrivalAt: 0,
    heartbeatAt: 0,
    processed: 0,
    staleSkips: 0,
    malformed: 0,
    persistFailures: 0,
    queueFull: 0,
    diskBlocked: 0,
    ignoredTopics: 0,
    gateErrors: 0,
    incompleteTurns: 0,
    fsyncMs: [],
    startedAt: Date.now(),
  };
}

function init(opts) {
  opts = opts || {};
  rootDir = opts.rootDir || rootDir || __dirname;
  configPath = opts.configPath
    || process.env.LUNA_WEBHOOK_FASTACK_CONFIG
    || path.join(rootDir, 'webhook-fastack.config.json');
  const queueDir = opts.queueDir
    || process.env.LUNA_WEBHOOK_QUEUE_DIR
    || path.join(rootDir, 'webhook-queue-data');
  paths = {
    root: queueDir,
    pending: path.join(queueDir, 'pending'),
    inflight: path.join(queueDir, 'inflight'),
    done: path.join(queueDir, 'done'),
    dead: path.join(queueDir, 'dead'),
    quarantine: path.join(queueDir, 'quarantine'),
    dedupe: path.join(queueDir, 'dedupe'),
    ledger: path.join(queueDir, 'ledger'),
    status: path.join(queueDir, 'status.json'),
    backlog: path.join(queueDir, 'backlog-review.jsonl'),
  };
  loadConfigOnce();
  if (process.env.LUNA_FASTACK_CRASH_AT) crashPoint = String(process.env.LUNA_FASTACK_CRASH_AT);
  return { config: Object.assign({}, config), queueDir, configPath };
}

function loadConfigOnce() {
  if (configRead) return config;
  configRead = true;
  let file = {};
  try {
    file = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!file || typeof file !== 'object' || Array.isArray(file)) file = {};
  } catch (e) {
    if (e && e.code !== 'ENOENT') {
      console.error('WEBHOOK_FASTACK_CONFIG_UNREADABLE', e && e.message);
    }
    file = {};
  }
  config = Object.assign({}, DEFAULTS);
  const num = (k) => {
    if (file[k] == null || file[k] === '') return;
    const n = Number(file[k]);
    if (Number.isFinite(n) && n >= 0) config[k] = n;
  };
  if (file.mode === 'sync' || file.mode === 'fastack') config.mode = file.mode;
  num('maxQueueDepth');
  num('maxConcurrency');
  num('maxAttempts');
  num('stalenessMs');
  num('dedupeTtlMs');
  num('dedupeMax');
  num('minFreeBytes');
  num('backoffBaseMs');
  num('backoffMaxMs');
  num('doneTtlMs');
  num('donePruneIntervalMs');
  num('workerIntervalMs');
  if (config.maxConcurrency < 1) config.maxConcurrency = 1;
  if (config.maxAttempts < 1) config.maxAttempts = 1;
  console.log('WEBHOOK_FASTACK_CONFIG', JSON.stringify({
    mode: config.mode,
    maxQueueDepth: config.maxQueueDepth,
    maxConcurrency: config.maxConcurrency,
    stalenessMs: config.stalenessMs,
    configPath,
  }));
  return config;
}

function refreshMode() {
  if (!rootDir) return config.mode;
  const modeFile = path.join(rootDir, 'webhook-fastack.mode');
  let stamp = 'missing';
  let raw = '';
  try {
    const st = fs.statSync(modeFile);
    stamp = st.mtimeMs + ':' + st.size;
    raw = fs.readFileSync(modeFile, 'utf8').trim();
  } catch (e) {
    if (!e || e.code !== 'ENOENT') {
      console.error('WEBHOOK_FASTACK_MODE_UNREADABLE', e && e.message);
      return config.mode;
    }
  }
  if (stamp === modeStamp) return config.mode;
  modeStamp = stamp;
  if (raw === 'sync' || raw === 'fastack') {
    if (config.mode !== raw) {
      console.log('WEBHOOK_FASTACK_MODE', JSON.stringify({ mode: raw, source: 'webhook-fastack.mode' }));
    }
    config.mode = raw;
  }
  return config.mode;
}

function mode() {
  if (!configRead) loadConfigOnce();
  return refreshMode();
}

function stalenessMs() {
  return config.stalenessMs;
}

function registerInspector(fn) {
  inspector = typeof fn === 'function' ? fn : null;
}

function setCrashPoint(point) {
  crashPoint = point ? String(point) : '';
}

function setFreeBytesOverride(fn) {
  freeBytesOverride = typeof fn === 'function' ? fn : null;
}

function setWriteFailure(err) {
  writeFailure = err || null;
}

function resetForTests(opts) {
  stopWorker();
  configRead = false;
  config = Object.assign({}, DEFAULTS);
  inspector = null;
  processor = null;
  workerGen += 1;
  active = 0;
  crashPoint = '';
  freeBytesOverride = null;
  writeFailure = null;
  receiptSeq = 0;
  metrics = freshMetrics();
  paths = null;
  modeStamp = '';
  lastDonePrune = Date.now();
  publishing.clear();
  claimTail = Promise.resolve();
  workerCrashed = false;
  if (pendingWatcher) {
    try { pendingWatcher.close(); } catch (_) { /* ignore */ }
    pendingWatcher = null;
  }
  init(opts || {});
  return { config, paths };
}

function crashIf(point) {
  if (!crashPoint || crashPoint !== point) return;
  crashPoint = '';
  const err = new Error('CRASH_INJECTED ' + point);
  err.code = point === 'after-ack-before-process' ? 'CRASH_PROCESS' : 'CRASH_INJECTED';
  err.point = point;
  throw err;
}

function ensureDirs() {
  for (const d of [paths.root, paths.pending, paths.inflight, paths.done, paths.dead, paths.quarantine, paths.dedupe, paths.ledger]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function noteFsync(ms) {
  if (!metrics.fsyncMs) metrics.fsyncMs = [];
  metrics.fsyncMs.push(ms);
  if (metrics.fsyncMs.length > 400) metrics.fsyncMs.splice(0, metrics.fsyncMs.length - 400);
}

function fsyncFd(fd) {
  const t0 = process.hrtime.bigint();
  fs.fsyncSync(fd);
  noteFsync(Number(process.hrtime.bigint() - t0) / 1e6);
}

function fsyncFdAsync(fd) {
  const t0 = process.hrtime.bigint();
  return new Promise((resolve, reject) => {
    fs.fsync(fd, (err) => {
      noteFsync(Number(process.hrtime.bigint() - t0) / 1e6);
      if (err) reject(err);
      else resolve();
    });
  });
}

function fsyncDir(dir) {
  const fd = fs.openSync(dir, 'r');
  try { fsyncFd(fd); } finally { fs.closeSync(fd); }
}

function fsyncDirAsync(dir) {
  return new Promise((resolve, reject) => {
    fs.open(dir, 'r', (openErr, fd) => {
      if (openErr) { reject(openErr); return; }
      fsyncFdAsync(fd).then(() => {
        fs.close(fd, (closeErr) => { if (closeErr) reject(closeErr); else resolve(); });
      }, (err) => {
        fs.close(fd, () => reject(err));
      });
    });
  });
}

function sha(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function eventFileName(notificationId) {
  return sha('evt:' + notificationId) + '.json';
}

function freeBytes() {
  if (freeBytesOverride) return Number(freeBytesOverride());
  try {
    const st = fs.statfsSync(paths.root);
    return Number(st.bavail) * Number(st.bsize);
  } catch (e) {
    console.error('WEBHOOK_DISK_STAT_FAIL', e && e.message);
    return 0;
  }
}

function incomingDir() {
  return path.join(paths.root, 'incoming');
}

// Bytes are fsynced in incoming/ (the worker does not scan that directory) and the
// name is linked into the queue only after that. The queue directory is fsynced
// before the name is allowed to be processed or acknowledged. fsync runs on the
// libuv threadpool so a slow disk does not freeze the event loop.
async function durableWriteNew(dir, name, obj) {
  if (writeFailure) {
    const err = new Error(writeFailure.message || 'injected write failure');
    err.code = writeFailure.code || 'EIO';
    throw err;
  }
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.mkdir(incomingDir(), { recursive: true });
  const finalPath = path.join(dir, name);
  const tmp = path.join(incomingDir(), name + '.tmp-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  const payload = Buffer.from(JSON.stringify(obj));
  const fh = await fs.promises.open(tmp, 'w');
  try {
    await fh.writeFile(payload);
    await fsyncFdAsync(fh.fd);
  } catch (e) {
    try { await fh.close(); } catch (_) { /* ignore */ }
    try { await fs.promises.unlink(tmp); } catch (_) { /* ignore */ }
    throw e;
  }
  await fh.close();
  publishing.add(finalPath);
  try {
    try {
      await fs.promises.link(tmp, finalPath);
    } catch (e) {
      try { await fs.promises.unlink(tmp); } catch (_) { /* ignore */ }
      if (e && e.code === 'EEXIST') return { existed: true, file: finalPath };
      throw e;
    }
    await fsyncDirAsync(dir);
  } finally {
    publishing.delete(finalPath);
  }
  try { await fs.promises.unlink(tmp); } catch (_) { /* leftover temp is quarantined on recovery */ }
  return { existed: false, file: finalPath };
}

async function durableOverwrite(file, obj) {
  const dir = path.dirname(file);
  const name = path.basename(file);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.mkdir(incomingDir(), { recursive: true });
  const tmp = path.join(incomingDir(), name + '.ow-' + process.pid + '-' + Date.now());
  const payload = Buffer.from(JSON.stringify(obj));
  const fh = await fs.promises.open(tmp, 'w');
  try {
    await fh.writeFile(payload);
    await fsyncFdAsync(fh.fd);
  } catch (e) {
    try { await fh.close(); } catch (_) { /* ignore */ }
    try { await fs.promises.unlink(tmp); } catch (_) { /* ignore */ }
    throw e;
  }
  await fh.close();
  publishing.add(file);
  try {
    await fs.promises.rename(tmp, file);
    await fsyncDirAsync(dir);
  } finally {
    publishing.delete(file);
  }
}

function readJson(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const v = JSON.parse(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
  return v;
}

function quarantine(file, reason) {
  try {
    if (!file || !fs.existsSync(file)) return;
    ensureDirs();
    const base = path.basename(file) + '.' + Date.now();
    const dest = path.join(paths.quarantine, base);
    const note = { quarantinedAt: Date.now(), reason: String(reason || 'unknown'), from: path.basename(path.dirname(file)) + '/' + path.basename(file) };
    try {
      const body = fs.readFileSync(file);
      fs.writeFileSync(dest, body);
    } catch (_) { /* unreadable partial */ }
    try { fs.writeFileSync(dest + '.reason.json', JSON.stringify(note)); } catch (_) { /* ignore */ }
    try { fs.unlinkSync(file); } catch (_) { /* ignore */ }
    console.error('WEBHOOK_QUARANTINE', JSON.stringify(note));
  } catch (e) {
    console.error('WEBHOOK_QUARANTINE_FAIL', e && e.message);
  }
}

function countQueueFiles() {
  const n = (dir) => {
    try { return fs.readdirSync(dir).filter((x) => x.endsWith('.json')).length; } catch (_) { return 0; }
  };
  return n(paths.pending) + n(paths.inflight);
}

function dedupeFile(notificationId) {
  const h = sha('dedupe:' + notificationId);
  return path.join(paths.dedupe, h.slice(0, 2), h + '.json');
}

function readDedupe(notificationId) {
  const file = dedupeFile(notificationId);
  try {
    const rec = readJson(file);
    if (rec && rec.exp && Date.now() > rec.exp) {
      try { fs.unlinkSync(file); } catch (_) { /* ignore */ }
      return null;
    }
    return rec;
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    quarantine(file, 'corrupt-dedupe');
    return null;
  }
}

// Dedupe is a hint. The event file is the source of truth (findExistingEvent), so a
// crash that loses this record still will not double-send. It is renamed into place
// for same-process visibility and is not fsynced on the ack path.
function writeDedupe(notificationId) {
  const file = dedupeFile(notificationId);
  const rec = { notificationId, at: Date.now(), exp: Date.now() + config.dedupeTtlMs };
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(rec));
  fs.renameSync(tmp, file);
  return rec;
}

function pruneDedupe() {
  let files = [];
  const walk = (dir) => {
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) { return; }
    for (const n of names) {
      const p = path.join(dir, n);
      let st;
      try { st = fs.statSync(p); } catch (_) { continue; }
      if (st.isDirectory()) walk(p);
      else if (n.endsWith('.json')) files.push({ p, mtime: st.mtimeMs });
    }
  };
  walk(paths.dedupe);
  const now = Date.now();
  const keep = [];
  for (const f of files) {
    try {
      const rec = readJson(f.p);
      if (!rec || !rec.exp || rec.exp < now) fs.unlinkSync(f.p);
      else keep.push(f);
    } catch (_) {
      quarantine(f.p, 'corrupt-dedupe');
    }
  }
  if (keep.length > config.dedupeMax) {
    keep.sort((a, b) => a.mtime - b.mtime);
    const extra = keep.length - config.dedupeMax;
    for (let i = 0; i < extra; i += 1) {
      try { fs.unlinkSync(keep[i].p); } catch (_) { /* ignore */ }
    }
  }
}

function findExistingEvent(notificationId) {
  const name = eventFileName(notificationId);
  for (const dir of [paths.pending, paths.inflight, paths.done]) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return file;
  }
  return '';
}

function latestUserPartAt(item) {
  if (!item || typeof item !== 'object') return 0;
  const parts = (item.conversation_parts && item.conversation_parts.conversation_parts) || [];
  let best = 0;
  for (const p of parts) {
    const a = (p && p.author) || {};
    if (a.type !== 'user' && a.type !== 'lead') continue;
    const at = Number(p.created_at || 0);
    if (at > best) best = at;
  }
  const src = item.source || {};
  const sa = src.author || {};
  if ((sa.type === 'user' || sa.type === 'lead') && Number(src.created_at || item.created_at || 0) > best) {
    // source created_at is often the conversation open, not a later message. Only use it
    // when there are no parts at all.
    if (!parts.length) best = Number(item.created_at || 0);
  }
  return best;
}

function parseEnvelope(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'malformed' };
  const topic = body.topic;
  if (typeof topic !== 'string' || !topic.trim()) return { error: 'missing-topic' };
  if (body.id == null || String(body.id).trim() === '') return { error: 'missing-notification-id' };
  const item = body.data && typeof body.data === 'object' ? body.data.item : null;
  const conversationId = item && item.id != null ? String(item.id) : '';
  const noteAt = Number(body.created_at);
  let createdAtMs;
  if (Number.isFinite(noteAt) && noteAt > 0) createdAtMs = noteAt > 1e12 ? noteAt : noteAt * 1000;
  else createdAtMs = Date.now();
  return {
    ok: true,
    topic: topic.trim(),
    notificationId: String(body.id).trim(),
    conversationId,
    createdAtMs,
    triggerUserPartAt: latestUserPartAt(item),
    handledTopic: HANDLED_TOPICS.has(String(topic).trim()),
    body,
  };
}

function noteHttp(code) {
  const c = Number(code) || 0;
  if (c >= 200 && c < 300) metrics.http200 += 1;
  else if (c >= 400 && c < 500) metrics.http4xx += 1;
  else if (c >= 500) metrics.http5xx += 1;
}

function noteArrival() {
  metrics.lastArrivalAt = Date.now();
}

function pushAck(ms) {
  metrics.ackMs.push(ms);
  if (metrics.ackMs.length > 512) metrics.ackMs.splice(0, metrics.ackMs.length - 512);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function ackStats() {
  const s = metrics.ackMs.slice().sort((a, b) => a - b);
  return {
    n: s.length,
    p50: percentile(s, 50),
    p95: percentile(s, 95),
    p99: percentile(s, 99),
    max: s.length ? s[s.length - 1] : 0,
  };
}

function oldestPendingAgeMs() {
  if (!paths) return 0;
  let oldest = 0;
  try {
    for (const name of fs.readdirSync(paths.pending)) {
      if (!name.endsWith('.json')) continue;
      try {
        const rec = readJson(path.join(paths.pending, name));
        const at = Number(rec.receivedAt || rec.createdAtMs || 0);
        if (at && (oldest === 0 || at < oldest)) oldest = at;
      } catch (_) { /* quarantine happens on the worker pass */ }
    }
  } catch (_) { return 0; }
  return oldest ? Date.now() - oldest : 0;
}

function statusSnapshot() {
  const depth = paths ? countQueueFiles() : 0;
  let dead = 0;
  try { dead = fs.readdirSync(paths.dead).filter((n) => n.endsWith('.json')).length; } catch (_) { dead = metrics.deadLetters; }
  return {
    mode: config.mode,
    ack: ackStats(),
    http: { 200: metrics.http200, '4xx': metrics.http4xx, '5xx': metrics.http5xx },
    queueDepth: depth,
    oldestPendingAgeMs: oldestPendingAgeMs(),
    processingFailures: metrics.failures,
    retries: metrics.retries,
    deadLetters: dead,
    duplicateNotifications: metrics.duplicates,
    workerHeartbeatAt: metrics.heartbeatAt,
    lastWebhookArrivalAt: metrics.lastArrivalAt,
    processed: metrics.processed,
    staleSkips: metrics.staleSkips,
    malformed: metrics.malformed,
    persistFailures: metrics.persistFailures,
    queueFull: metrics.queueFull,
    diskBlocked: metrics.diskBlocked,
    ignoredTopics: metrics.ignoredTopics,
    gateErrors: metrics.gateErrors,
    incompleteTurns: metrics.incompleteTurns,
    fsync: fsyncStats(),
    active,
    stalenessMs: config.stalenessMs,
    maxQueueDepth: config.maxQueueDepth,
    maxConcurrency: config.maxConcurrency,
  };
}

function fsyncStats() {
  const xs = (metrics.fsyncMs || []).slice().sort((a, b) => a - b);
  if (!xs.length) return { n: 0, p50: 0, p95: 0, p99: 0 };
  const at = (q) => xs[Math.min(xs.length - 1, Math.max(0, Math.ceil(q * xs.length) - 1))];
  return { n: xs.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: xs[xs.length - 1] };
}

function writeStatus(force) {
  if (!paths) return;
  const now = Date.now();
  if (!force && now - lastStatusWrite < 1000) return;
  lastStatusWrite = now;
  try {
    ensureDirs();
    const tmp = paths.status + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(statusSnapshot()));
    fs.renameSync(tmp, paths.status);
  } catch (e) {
    console.error('WEBHOOK_STATUS_WRITE_FAIL', e && e.message);
  }
}

function logAck(ms, out) {
  console.log('WEBHOOK_ACK', JSON.stringify({
    ms: Math.round(ms * 1000) / 1000,
    status: out.status,
    topic: out.topic || '',
    enqueued: !!out.enqueued,
    duplicate: !!out.duplicate,
    reason: out.reason || '',
  }));
}

/**
 * Persist one signed webhook. Returns { status, enqueued, duplicate, reason, topic }.
 * Throws on an injected crash after a durable write (caller must not respond 200).
 */
async function persistFromBody(body) {
  if (!paths) init();
  ensureDirs();
  const env = parseEnvelope(body);
  if (env.error) {
    metrics.malformed += 1;
    console.log('WEBHOOK_ENVELOPE_REJECT', JSON.stringify({ reason: env.error }));
    return { status: 200, enqueued: false, reason: env.error, topic: '' };
  }
  if (readDedupe(env.notificationId) || findExistingEvent(env.notificationId)) {
    metrics.duplicates += 1;
    if (!readDedupe(env.notificationId)) {
      try { writeDedupe(env.notificationId); } catch (_) { /* best effort */ }
    }
    console.log('WEBHOOK_DUPLICATE', JSON.stringify({ topic: env.topic, conversationId: env.conversationId }));
    return { status: 200, enqueued: false, duplicate: true, reason: 'duplicate', topic: env.topic };
  }
  const free = freeBytes();
  if (!(free > config.minFreeBytes)) {
    metrics.diskBlocked += 1;
    metrics.persistFailures += 1;
    console.error('WEBHOOK_DISK_GUARD', JSON.stringify({ free, minFreeBytes: config.minFreeBytes }));
    return { status: 503, enqueued: false, reason: 'disk', topic: env.topic };
  }
  if (countQueueFiles() >= config.maxQueueDepth) {
    metrics.queueFull += 1;
    console.error('WEBHOOK_QUEUE_FULL', JSON.stringify({ depth: countQueueFiles(), max: config.maxQueueDepth }));
    return { status: 503, enqueued: false, reason: 'queue-full', topic: env.topic };
  }
  crashIf('before-persist');
  receiptSeq += 1;
  const record = {
    notificationId: env.notificationId,
    topic: env.topic,
    conversationId: env.conversationId,
    createdAtMs: env.createdAtMs,
    triggerUserPartAt: env.triggerUserPartAt,
    handledTopic: env.handledTopic,
    receivedAt: Date.now(),
    receiptSeq,
    attempts: 0,
    notBefore: 0,
    body: env.body,
  };
  let created;
  try {
    created = await durableWriteNew(paths.pending, eventFileName(env.notificationId), record);
  } catch (e) {
    metrics.persistFailures += 1;
    console.error('WEBHOOK_PERSIST_FAIL', e && e.code, e && e.message);
    return { status: 503, enqueued: false, reason: 'persist-failed', topic: env.topic };
  }
  if (created.existed) {
    metrics.duplicates += 1;
    try { writeDedupe(env.notificationId); } catch (_) { /* ignore */ }
    return { status: 200, enqueued: false, duplicate: true, reason: 'duplicate', topic: env.topic };
  }
  try {
    writeDedupe(env.notificationId);
  } catch (e) {
    // The event file is the source of truth. A missing dedupe record is repaired on retry
    // because findExistingEvent sees the pending file. Do not delete the event.
    console.error('WEBHOOK_DEDUPE_WRITE_FAIL', e && e.message);
  }
  if ((receiptSeq % 100) === 0) {
    try { pruneDedupe(); } catch (e) { console.error('WEBHOOK_DEDUPE_PRUNE_FAIL', e && e.message); }
  }
  crashIf('after-persist-before-ack');
  console.log('WEBHOOK_QUEUE', JSON.stringify({ depth: countQueueFiles(), oldestAgeMs: oldestPendingAgeMs() }));
  return { status: 200, enqueued: true, reason: 'accepted', topic: env.topic, notificationId: env.notificationId };
}

async function acceptHttp(req, res, syncHandler) {
  if (!configRead) init();
  refreshMode();
  if (workerWanted && config.mode === 'fastack' && processor && !workerTimer) armWorker();
  const t0 = process.hrtime.bigint();
  if (config.mode === 'sync') {
    const orig = res.sendStatus ? res.sendStatus.bind(res) : null;
    if (orig) {
      res.sendStatus = (code) => {
        noteHttp(code);
        if (Number(code) === 200) noteArrival();
        pushAck(Number(process.hrtime.bigint() - t0) / 1e6);
        writeStatus(false);
        return orig(code);
      };
    }
    return syncHandler(req, res);
  }
  let out;
  try {
    out = await persistFromBody(req && req.body);
  } catch (e) {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    pushAck(ms);
    noteHttp(503);
    metrics.persistFailures += 1;
    writeStatus(false);
    console.error('WEBHOOK_ACK_CRASH', e && e.message);
    if (!res.headersSent) res.sendStatus(503);
    return;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  pushAck(ms);
  noteHttp(out.status);
  if (out.status === 200) noteArrival();
  logAck(ms, out);
  writeStatus(false);
  if (!res.headersSent) res.sendStatus(out.status);
  if (out.enqueued) kick();
}

function listRecords(dir) {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) {
    if (e && e.code === 'ENOENT') return out;
    throw e;
  }
  for (const name of names) {
    const file = path.join(dir, name);
    if (name.includes('.tmp-') || name.startsWith('.')) {
      quarantine(file, 'partial-temp');
      continue;
    }
    if (publishing.has(file)) continue;
    if (!name.endsWith('.json')) continue;
    try {
      const rec = readJson(file);
      rec.__file = file;
      out.push(rec);
    } catch (e) {
      quarantine(file, 'corrupt-json:' + ((e && e.message) || 'parse'));
    }
  }
  return out;
}

async function claim(file) {
  const name = path.basename(file);
  const dest = path.join(paths.inflight, name);
  try {
    await fs.promises.rename(file, dest);
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
  await fsyncDirAsync(paths.pending);
  await fsyncDirAsync(paths.inflight);
  return dest;
}

async function writeRecord(file, rec) {
  const copy = Object.assign({}, rec);
  delete copy.__file;
  await durableOverwrite(file, copy);
}

async function completeFile(file) {
  const name = path.basename(file);
  const dest = path.join(paths.done, name);
  await fs.promises.rename(file, dest);
  await fsyncDirAsync(paths.inflight);
  await fsyncDirAsync(paths.done);
}

async function requeue(file, rec) {
  const name = path.basename(file);
  const dest = path.join(paths.pending, name);
  await writeRecord(dest, rec);
  if (file !== dest) {
    try { await fs.promises.unlink(file); } catch (_) { /* already moved */ }
  }
  await fsyncDirAsync(paths.pending);
  await fsyncDirAsync(paths.inflight);
}

async function deadLetter(file, rec, reason) {
  const name = path.basename(file).replace(/\.json$/, '') + '.json';
  const dest = path.join(paths.dead, name);
  const copy = Object.assign({}, rec, { deadReason: String(reason || 'unknown'), deadAt: Date.now() });
  delete copy.__file;
  await durableOverwrite(dest, copy);
  try { await fs.promises.unlink(file); } catch (_) { /* ignore */ }
  await fsyncDirAsync(paths.dead);
  console.error('WEBHOOK_DEAD', JSON.stringify({
    reason: copy.deadReason,
    attempts: copy.attempts || 0,
    topic: copy.topic || '',
    conversationId: copy.conversationId || '',
  }));
  console.error('WEBHOOK_FASTACK_ALERT', JSON.stringify({
    kind: 'dead-letter',
    reason: copy.deadReason,
    attempts: copy.attempts || 0,
    topic: copy.topic || '',
    conversationId: copy.conversationId || '',
  }));
}

function appendBacklog(rec, age) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    conversationId: rec.conversationId || '',
    notificationId: rec.notificationId || '',
    topic: rec.topic || '',
    ageMs: age,
    action: 'no-auto-reply',
  }) + '\n';
  fs.appendFileSync(paths.backlog, line);
  const fd = fs.openSync(paths.backlog, 'r');
  try { fsyncFd(fd); } finally { fs.closeSync(fd); }
}

function clearTurnFlags(rec) {
  if (!rec) return;
  delete rec.turnIncomplete;
  delete rec.gateError;
  delete rec.incompleteReason;
}

function backoffMs(attempt) {
  const base = Number(config.backoffBaseMs) || 0;
  if (base === 0) return 0;
  const exp = Math.min(config.backoffMaxMs, base * Math.pow(2, Math.max(0, attempt - 1)));
  return Math.floor(exp * (0.5 + Math.random() * 0.5));
}

function recover() {
  if (!paths) init();
  ensureDirs();
  for (const dir of [paths.pending, paths.inflight, paths.done, paths.dedupe, paths.ledger, incomingDir()]) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) { continue; }
    for (const name of names) {
      if (name.includes('.tmp-') || name.startsWith('.')) quarantine(path.join(dir, name), 'partial-temp');
    }
  }
  let inflight = [];
  try { inflight = fs.readdirSync(paths.inflight).filter((n) => n.endsWith('.json')); } catch (_) { inflight = []; }
  for (const name of inflight) {
    const from = path.join(paths.inflight, name);
    const to = path.join(paths.pending, name);
    try {
      if (fs.existsSync(to)) fs.unlinkSync(from);
      else fs.renameSync(from, to);
    } catch (e) {
      quarantine(from, 'recover-rename:' + (e && e.message));
    }
  }
  try { fsyncDir(paths.pending); fsyncDir(paths.inflight); } catch (_) { /* ignore */ }
  try { pruneDedupe(); } catch (_) { /* ignore */ }
  try { pruneDone(); } catch (_) { /* ignore */ }
  console.log('WEBHOOK_RECOVER', JSON.stringify({ resumed: inflight.length, pending: countQueueFiles() }));
}

function unlinkOlderThan(dir, cutoff, recursive) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_) { return 0; }
  let removed = 0;
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const file = path.join(dir, name);
    let st;
    try { st = fs.lstatSync(file); } catch (_) { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      if (recursive) {
        removed += unlinkOlderThan(file, cutoff, true);
        try { if (!fs.readdirSync(file).length) fs.rmdirSync(file); } catch (_) { /* ignore */ }
      }
      continue;
    }
    if (st.mtimeMs < cutoff) {
      try { fs.unlinkSync(file); removed += 1; } catch (_) { /* ignore */ }
    }
  }
  return removed;
}

// Bodies live in done/, dead/, and quarantine/. Ledger files are hashes, not
// message text, but they are pruned on the same 24h clock as dedupe so a
// finished turn cannot keep customer-derived metadata forever. pending/ and
// inflight/ are work in progress and are never removed here.
function pruneStoredBodies() {
  if (!paths) return { done: 0, dead: 0, quarantine: 0, ledger: 0 };
  const cutoff = Date.now() - config.doneTtlMs;
  const removed = {
    done: unlinkOlderThan(paths.done, cutoff, false),
    dead: unlinkOlderThan(paths.dead, cutoff, false),
    quarantine: unlinkOlderThan(paths.quarantine, cutoff, false),
    ledger: unlinkOlderThan(paths.ledger, cutoff, true),
  };
  if (removed.done || removed.dead || removed.quarantine || removed.ledger) {
    console.log('WEBHOOK_BODY_PRUNE', JSON.stringify(removed));
  }
  return removed;
}

function pruneDone() {
  return pruneStoredBodies();
}

async function processOne(rec, hooks, alreadyInflight) {
  const inflight = alreadyInflight || await claim(rec.__file);
  if (!inflight) {
    if (hooks && typeof hooks.onReady === 'function') hooks.onReady();
    return;
  }
  if (crashPoint === 'after-ack-before-process') {
    crashIf('after-ack-before-process');
  }
  let current;
  try { current = readJson(inflight); } catch (e) {
    quarantine(inflight, 'corrupt-inflight');
    return;
  }
  try {
    if (!current.handledTopic) {
      metrics.ignoredTopics += 1;
      console.log('WEBHOOK_TOPIC_IGNORED', JSON.stringify({ topic: current.topic }));
      await completeFile(inflight);
      return;
    }
    const age = Date.now() - Number(current.createdAtMs || 0);
    if (current.createdAtMs && age > config.stalenessMs) {
      metrics.staleSkips += 1;
      console.log('WEBHOOK_STALE_SKIPPED', JSON.stringify({
        conversationId: current.conversationId,
        topic: current.topic,
        notificationId: current.notificationId,
        ageMs: age,
        stalenessMs: config.stalenessMs,
      }));
      appendBacklog(current, age);
      await completeFile(inflight);
      return;
    }
    if (typeof processor !== 'function') throw new Error('webhook worker has no processor');
    clearTurnFlags(current);
    const turnStore = { rec: current, inGate: false, writesCompleted: [], gateError: false, finished: false };
    try {
      await als.run(turnStore, async () => {
        // Invoke synchronously up to the processor's first await, then signal
        // ready. The batch runner waits for that signal before starting the
        // next record, so oldest-first start order survives async claim fsyncs.
        const pendingTurn = processor(current);
        if (hooks && typeof hooks.onReady === 'function') hooks.onReady();
        await pendingTurn;
      });
    } finally { turnStore.finished = true; }
    if (current.turnIncomplete || current.gateError) {
      metrics.incompleteTurns += 1;
      const err = new Error(current.incompleteReason || 'turn-incomplete');
      err.code = current.gateError ? 'FASTACK_GATE' : 'TURN_INCOMPLETE';
      throw err;
    }
    crashIf('during-completion');
    await completeFile(inflight);
    metrics.processed += 1;
  } catch (e) {
    if (e && e.code === 'CRASH_PROCESS') throw e;
    metrics.failures += 1;
    clearTurnFlags(current);
    const attempts = Number(current.attempts || 0) + 1;
    current.attempts = attempts;
    current.lastError = String((e && e.message) || e).slice(0, 300);
    console.error('WEBHOOK_PROCESS_FAIL', JSON.stringify({
      attempt: attempts,
      conversationId: current.conversationId,
      error: current.lastError,
    }));
    if (attempts >= config.maxAttempts) {
      await deadLetter(inflight, current, current.lastError);
      metrics.deadLetters += 1;
    } else {
      current.notBefore = Date.now() + backoffMs(attempts);
      metrics.retries += 1;
      await requeue(inflight, current);
      console.log('WEBHOOK_REQUEUE', JSON.stringify({ attempt: attempts, conversationId: current.conversationId, notBefore: current.notBefore }));
    }
  }
}

function pickWork() {
  const inflight = listRecords(paths.inflight);
  const busy = new Set();
  for (const r of inflight) busy.add(r.conversationId || ('notif:' + r.notificationId));
  const now = Date.now();
  const pending = listRecords(paths.pending).filter((r) => Number(r.notBefore || 0) <= now);
  pending.sort((a, b) => (a.createdAtMs - b.createdAtMs) || (a.receivedAt - b.receivedAt) || ((a.receiptSeq || 0) - (b.receiptSeq || 0)));
  const chosen = [];
  const seen = new Set();
  for (const r of pending) {
    const key = r.conversationId || ('notif:' + r.notificationId);
    if (busy.has(key) || seen.has(key)) continue;
    seen.add(key);
    chosen.push(r);
    if (active + chosen.length >= config.maxConcurrency) break;
  }
  return chosen;
}

// Claims are serialized. Turns are not. A slow conversation occupies one
// concurrency slot and does not delay claiming an unrelated conversation.
function enqueueClaim(fn) {
  const run = claimTail.then(fn, fn);
  claimTail = run.then(() => {}, () => {});
  return run;
}

function maybePrune() {
  const pruneEvery = Number(config.donePruneIntervalMs);
  if (!Number.isFinite(pruneEvery) || Date.now() - lastDonePrune < pruneEvery) return;
  lastDonePrune = Date.now();
  try { pruneStoredBodies(); } catch (e) { console.error('WEBHOOK_DONE_PRUNE_FAIL', e && e.message); }
}

async function startOne(rec) {
  const gen = workerGen;
  const inflight = await claim(rec.__file);
  // A reset during the claim belongs to the previous test generation. Do not
  // count that turn against the new cap, and do not let its completion
  // decrement the new counter (that is how a slow neighbor used to open an
  // extra slot).
  if (gen !== workerGen || !inflight) return false;
  active += 1;
  // The turn promise is not awaited here. Invoking it runs the processor up to
  // its first await (so oldest-first start order is preserved) and then yields
  // the claim lock while the turn is still in flight.
  const job = (async () => {
    try {
      if (gen !== workerGen) return;
      await processOne(rec, null, inflight);
    } catch (e) {
      if (gen !== workerGen) return;
      if (e && e.code === 'CRASH_PROCESS') {
        workerCrashed = true;
        console.error('WEBHOOK_WORKER_CRASH', e.message);
        return;
      }
      console.error('WEBHOOK_WORKER_ERR', e && e.message);
    } finally {
      if (gen !== workerGen) return;
      active -= 1;
      if (!workerCrashed && processor) kick();
    }
  })();
  void job;
  return true;
}

async function dispatchClaims() {
  if (!paths || !processor || workerCrashed) return;
  refreshMode();
  metrics.heartbeatAt = Date.now();
  maybePrune();
  writeStatus(false);
  while (!workerCrashed && active < config.maxConcurrency) {
    const batch = pickWork();
    if (!batch.length) return;
    await startOne(batch[0]);
  }
}

function tick() {
  return enqueueClaim(() => dispatchClaims());
}

function kick() {
  if (kickScheduled || !processor) return;
  kickScheduled = true;
  setImmediate(() => {
    kickScheduled = false;
    tick().catch((e) => console.error('WEBHOOK_WORKER_ERR', e && e.message));
  });
}

function armWorker() {
  if (!paths || !processor || workerTimer) return;
  refreshMode();
  recover();
  workerTimer = setInterval(() => {
    tick().catch((e) => console.error('WEBHOOK_WORKER_ERR', e && e.message));
  }, Math.max(250, config.workerIntervalMs || 1000));
  if (workerTimer.unref) workerTimer.unref();
  try {
    if (pendingWatcher) pendingWatcher.close();
    pendingWatcher = fs.watch(paths.pending, { persistent: false }, () => kick());
    pendingWatcher.on('error', (err) => console.error('WEBHOOK_WATCH_FAIL', err && err.message));
    if (pendingWatcher.unref) pendingWatcher.unref();
  } catch (e) {
    console.error('WEBHOOK_WATCH_FAIL', e && e.message);
  }
  metrics.heartbeatAt = Date.now();
  kick();
}

function startWorker(processFn) {
  if (!paths) init();
  workerWanted = true;
  processor = processFn;
  refreshMode();
  if (config.mode !== 'fastack') {
    // Still arm the worker so events left in the queue drain in sync mode.
    console.log('WEBHOOK_WORKER_SYNC_MODE_DRAIN_ONLY', config.mode);
  }
  armWorker();
}

function stopWorker() {
  workerWanted = false;
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
  if (pendingWatcher) {
    try { pendingWatcher.close(); } catch (_) { /* ignore */ }
    pendingWatcher = null;
  }
  processor = null;
}

async function drain(opts) {
  opts = opts || {};
  const timeoutMs = opts.timeoutMs == null ? 5000 : opts.timeoutMs;
  const t0 = Date.now();
  if (opts.processor) processor = opts.processor;
  if (!paths) init();
  ensureDirs();
  workerCrashed = false;
  while (Date.now() - t0 < timeoutMs) {
    await enqueueClaim(() => dispatchClaims());
    if (workerCrashed) return statusSnapshot();
    metrics.heartbeatAt = Date.now();
    const waiting = listRecords(paths.pending).some((r) => Number(r.notBefore || 0) <= Date.now());
    const inflight = listRecords(paths.inflight);
    if (!waiting && !inflight.length && active === 0) return statusSnapshot();
    await new Promise((r) => setTimeout(r, 5));
  }
  const err = new Error('WEBHOOK_DRAIN_TIMEOUT');
  err.code = 'DRAIN_TIMEOUT';
  throw err;
}

function classifyWrite(data) {
  if (!data || typeof data !== 'object') return '';
  if (data.message_type === 'comment') return 'reply';
  if (data.message_type === 'note') return 'note';
  if (data.message_type === 'assignment') return 'assignment';
  if (data.message_type === 'close') return 'close';
  return '';
}

function ledgerPath(notificationId, kind, bodyHash) {
  const dir = path.join(paths.ledger, sha(notificationId).slice(0, 24));
  return path.join(dir, kind + '-' + bodyHash.slice(0, 24) + '.json');
}

function readLedger(notificationId, kind, bodyHash) {
  const file = ledgerPath(notificationId, kind, bodyHash);
  try { return readJson(file); } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    quarantine(file, 'corrupt-ledger');
    return null;
  }
}

async function writeLedger(notificationId, kind, bodyHash, phase, extra) {
  const file = ledgerPath(notificationId, kind, bodyHash);
  const prev = readLedger(notificationId, kind, bodyHash) || {};
  const rec = Object.assign({}, prev, extra || {}, { phase, kind, bodyHash, at: Date.now(), notificationId });
  await durableOverwrite(file, rec);
  return rec;
}

function stripLoose(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function effectVisible(fresh, kind, data) {
  if (!fresh || typeof fresh !== 'object') return false;
  if (kind === 'assignment') {
    const want = data && data.assignee_id != null ? String(data.assignee_id) : '';
    return !!want && String(fresh.admin_assignee_id || '') === want;
  }
  if (kind === 'close') {
    return fresh.open === false || String(fresh.state || '').toLowerCase() === 'closed';
  }
  const parts = (fresh.conversation_parts && fresh.conversation_parts.conversation_parts) || [];
  const want = stripLoose(data && data.body);
  if (!want) return false;
  for (const p of parts) {
    if (!p) continue;
    if (kind === 'reply' && p.part_type !== 'comment') continue;
    if (kind === 'note' && p.part_type !== 'note') continue;
    if (stripLoose(p.body) === want) return true;
  }
  return false;
}

function currentStore() {
  return als.getStore() || null;
}

async function prepareCustomerWrite(info) {
  info = info || {};
  const store = currentStore();
  if (!store || store.inGate) return null;
  // setImmediate re-entries (BURST_RERUN, ASSIST kick, AUTH_REPLAY) inherit this
  // AsyncLocalStorage store. Once the queued turn has finished they are no longer
  // part of it, so they run ungated exactly as in sync mode.
  if (store.finished) return null;
  const kind = classifyWrite(info.data);
  if (!kind) return null;
  const ev = store.rec;
  // Only gate writes to the conversation this event belongs to. A write to another
  // conversation (AUTH_REPLAY of deferred conversations) must not be inspected
  // against, or ledger-deduplicated under, this event.
  const urlConv = (/\/conversations\/([^/?#]+)/.exec(String(info.url || '')) || [])[1] || '';
  if (urlConv && ev && ev.conversationId && String(urlConv) !== String(ev.conversationId)) return null;
  const point = kind === 'reply' ? 'public-reply' : kind;
  crashIf('before-' + point);
  const bodyHash = sha(kind + '\n' + urlConv + '\n' + JSON.stringify(info.data || null));
  const existing = readLedger(ev.notificationId, kind, bodyHash);
  if (existing && existing.phase === 'complete') {
    return {
      shortCircuit: true,
      result: { ok: true, skipped: true, status: 200, reason: 'ledger-complete', data: null },
    };
  }
  if (existing && existing.phase === 'intent') {
    let fresh = null;
    store.inGate = true;
    try {
      if (typeof info.fetchConversation === 'function') fresh = await info.fetchConversation(ev.conversationId);
    } finally { store.inGate = false; }
    if (effectVisible(fresh, kind, info.data)) {
      await writeLedger(ev.notificationId, kind, bodyHash, 'complete', { reason: 'visible-on-recovery' });
      return {
        shortCircuit: true,
        result: { ok: true, skipped: true, status: 200, reason: 'ledger-visible', data: null },
      };
    }
    return {
      shortCircuit: true,
      result: { ok: false, skipped: true, unknown: true, status: 0, reason: 'ledger-intent-ambiguous', data: null },
    };
  }
  if (inspector && (kind === 'reply' || kind === 'note' || kind === 'assignment' || kind === 'close')) {
    store.inGate = true;
    let decision = null;
    try {
      decision = await inspector(ev, kind, info);
    } catch (e) {
      console.error('WEBHOOK_INSPECT_FAIL', e && e.message);
      if (kind === 'reply') {
        return { shortCircuit: true, result: { ok: false, skipped: true, status: 0, reason: 'inspect-failed', data: null } };
      }
    } finally { store.inGate = false; }
    if (decision && decision.skip) {
      console.log('WEBHOOK_SKIP_PREACTION', JSON.stringify({ kind, reason: decision.reason, conversationId: ev.conversationId }));
      return {
        shortCircuit: true,
        result: { ok: false, skipped: true, status: 200, reason: decision.reason || 'skipped', data: null },
      };
    }
  }
  await writeLedger(ev.notificationId, kind, bodyHash, 'intent', { topic: ev.topic });
  return { token: { notificationId: ev.notificationId, kind, bodyHash, point } };
}

function rememberWrite(token) {
  const store = currentStore();
  if (!store || !token) return;
  store.writesCompleted = store.writesCompleted || [];
  if (store.writesCompleted.indexOf(token.kind) === -1) store.writesCompleted.push(token.kind);
}

// crashIf runs before the returned promise so a crash injection still throws into
// the caller that does not await. The in-memory write flag is set before the ledger
// fsync so a same-turn exception sees the reply. The promise resolves only after
// the ledger is durable.
function finishCustomerWrite(token, result) {
  if (!token) return Promise.resolve();
  crashIf('after-' + token.point);
  const ok = result && (result.ok || result.skipped) && !result.unknown;
  if (ok) rememberWrite(token);
  return finishCustomerWriteDurable(token, result, ok);
}

async function finishCustomerWriteDurable(token, result, ok) {
  if (result && result.unknown) {
    await writeLedger(token.notificationId, token.kind, token.bodyHash, 'intent', { reason: 'write-unknown' });
    return;
  }
  if (ok) {
    await writeLedger(token.notificationId, token.kind, token.bodyHash, 'complete', { status: result.status || 0 });
  } else {
    await writeLedger(token.notificationId, token.kind, token.bodyHash, 'failed', { status: result && result.status || 0 });
  }
}

function markGateError(err) {
  const store = currentStore();
  metrics.gateErrors += 1;
  console.error('WEBHOOK_FASTACK_GATE_ERR', err && err.message);
  console.error('WEBHOOK_FASTACK_ALERT', JSON.stringify({
    kind: 'gate-error',
    conversationId: store && store.rec ? store.rec.conversationId : '',
    error: String((err && err.message) || err).slice(0, 200),
  }));
  if (!store || !store.rec) return;
  store.gateError = true;
  store.rec.gateError = true;
  store.rec.turnIncomplete = true;
  store.rec.incompleteReason = 'gate-error';
}

function noteSwallowedError(err) {
  const store = currentStore();
  if (!store || !store.rec) return;
  const wrote = store.writesCompleted || [];
  if (!(store.gateError || store.rec.gateError || wrote.length)) return;
  store.rec.turnIncomplete = true;
  if (!store.rec.incompleteReason) {
    store.rec.incompleteReason = (store.gateError || store.rec.gateError) ? 'gate-error' : 'exception-after-write';
  }
  if (wrote.length && !(store.gateError || store.rec.gateError)) {
    console.error('WEBHOOK_FASTACK_ALERT', JSON.stringify({
      kind: 'exception-after-write',
      wrote,
      conversationId: store.rec.conversationId || '',
      error: String((err && err.message) || err).slice(0, 200),
    }));
  }
}

function directLoopback(req) {
  const addr = (req && req.socket && req.socket.remoteAddress) || '';
  const loop = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  if (!loop) return false;
  const h = (req && req.headers) || {};
  if (h['x-forwarded-for'] || h['x-real-ip'] || h.forwarded) return false;
  return true;
}

function mountHead(app) {
  app.head('/webhook', function headWebhook(_req, res) {
    res.status(200).end();
  });
}

function mountStatus(app) {
  app.get('/webhook-status', (req, res) => {
    if (!directLoopback(req)) {
      res.status(404).end();
      return;
    }
    res.json(statusSnapshot());
  });
  mountHead(app);
}

module.exports = {
  HANDLED_TOPICS,
  DEFAULTS,
  init,
  mode,
  stalenessMs,
  registerInspector,
  setCrashPoint,
  setFreeBytesOverride,
  setWriteFailure,
  resetForTests,
  acceptHttp,
  persistFromBody,
  startWorker,
  stopWorker,
  drain,
  recover,
  pruneStoredBodies,
  kick,
  statusSnapshot,
  writeStatus,
  prepareCustomerWrite,
  finishCustomerWrite,
  markGateError,
  noteSwallowedError,
  directLoopback,
  mountHead,
  mountStatus,
  currentStore,
  parseEnvelope,
  effectVisible,
  paths: () => paths,
  metrics: () => metrics,
};
