'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CASES = process.argv[2];
const OUT = process.argv[3];
const only = process.env.ONLY || '';
const filter = process.env.FILTER || '';
const limit = Number(process.env.LIMIT || '0');

const VERSIONS = [
  { name: 'r22', runtime: '/tmp/luna-r22/luna-current/01_runtime', presend: '/tmp/luna-r22/luna-current/02_statePresend' },
  { name: 'r21', runtime: '/tmp/luna-r21/luna-current/01_runtime', presend: '/tmp/luna-r21/luna-current/02_statePresend' },
  { name: 'r20', runtime: '/tmp/luna-r20/luna-current/01_runtime', presend: '/tmp/luna-r20/luna-current/02_statePresend' },
];

const raw = JSON.parse(fs.readFileSync(CASES, 'utf8'));
let cases = raw.cases;
if (only) cases = cases.filter(function (c) { return c.id.indexOf(only) === 0 || c.id === only; });
if (filter) {
  const re = new RegExp(filter);
  cases = cases.filter(function (c) { return re.test(c.id); });
}
if (limit) cases = cases.slice(0, limit);

function startWorker(version, stateDir) {
  const child = spawn(process.execPath, [
    path.join(__dirname, 'worker.js'),
    version.runtime,
    version.presend,
    stateDir,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  const waiters = [];
  child.stdout.on('data', function (chunk) {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      const waiter = waiters.shift();
      if (waiter) waiter(msg);
      else child._ready = msg;
    }
  });
  child.stderr.on('data', function (chunk) {
    fs.appendFileSync(path.join(stateDir, 'stderr.log'), chunk);
  });
  function send(job) {
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        reject(new Error('worker timeout ' + (job && job.id)));
      }, 60000);
      waiters.push(function (msg) {
        clearTimeout(timer);
        resolve(msg);
      });
      child.stdin.write(JSON.stringify(job) + '\n');
    });
  }
  return { child: child, send: send };
}

function stripTurn(t) {
  return {
    text: t.text,
    topic: t.topic,
    createdAgo: t.createdAgo,
    model: t.model,
    failComment: t.failComment,
    failNote: t.failNote,
    failAssign: t.failAssign,
    keepAssignee: t.keepAssignee,
    assignee: t.assignee,
    extraParts: t.extraParts,
    sourceBody: t.sourceBody,
    name: t.name,
  };
}

async function runVersion(version) {
  const stateDir = path.join('/tmp/luna-review-run', version.name + '-' + process.pid);
  fs.mkdirSync(stateDir, { recursive: true });
  const pool = startWorker(version, stateDir);
  const ready = await new Promise(function (resolve, reject) {
    const timer = setTimeout(function () { reject(new Error('ready timeout ' + version.name)); }, 30000);
    const poll = setInterval(function () {
      if (pool.child._ready) {
        clearInterval(poll);
        clearTimeout(timer);
        resolve(pool.child._ready);
      }
    }, 20);
    pool.child.on('exit', function (code) {
      if (!pool.child._ready) reject(new Error('worker exited ' + code));
    });
  });
  if (!ready.ready) throw new Error('worker not ready ' + JSON.stringify(ready));
  const results = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const segments = [];
    let failed = false;
    for (let s = 0; s < c.segments.length; s++) {
      const seg = c.segments[s];
      const job = { id: c.id, turns: seg.turns.map(stripTurn) };
      let msg;
      if (seg.freshProcess) {
        const freshDir = stateDir;
        const one = startWorker(version, freshDir);
        await new Promise(function (resolve, reject) {
          const timer = setTimeout(function () { reject(new Error('fresh ready timeout')); }, 30000);
          const poll = setInterval(function () {
            if (one.child._ready) {
              clearInterval(poll);
              clearTimeout(timer);
              resolve();
            }
          }, 20);
        });
        msg = await one.send(job);
        one.child.stdin.end();
      } else {
        msg = await pool.send(job);
      }
      segments.push(msg.turns || []);
      if (msg.error) failed = true;
    }
    results.push({ id: c.id, bucket: c.bucket, gates: c.gates, target: c.target || '', segments: segments, workerError: failed });
    if ((i + 1) % 50 === 0) process.stderr.write(version.name + ' ' + (i + 1) + '/' + cases.length + '\n');
  }
  pool.child.stdin.end();
  return { version: version.name, count: results.length, results: results };
}

(async function () {
  const started = Date.now();
  const all = await Promise.all(VERSIONS.map(runVersion));
  const compact = all.map(function (version) {
    return {
      version: version.version,
      count: version.count,
      results: version.results.map(function (r) {
        return {
          id: r.id,
          bucket: r.bucket,
          gates: r.gates,
          target: r.target,
          segments: r.segments.map(function (turns) {
            return turns.map(function (t) {
              return {
                status: t.status,
                comments: t.comments,
                commentStatuses: t.commentStatuses,
                notes: t.notes,
                assignCount: (t.assigns || []).length,
                prompts: t.prompts,
                owed: t.owed,
                tripwire: t.tripwire,
                tripwireLast: t.tripwireLast,
                error: t.error,
              };
            });
          }),
        };
      }),
    };
  });
  fs.writeFileSync(OUT, JSON.stringify({ elapsedMs: Date.now() - started, versions: compact }));
  process.stderr.write('wrote ' + OUT + ' in ' + (Date.now() - started) + 'ms\n');
})().catch(function (err) {
  process.stderr.write(String(err && err.stack || err) + '\n');
  process.exit(1);
});
