'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = process.env.LUNA_ROOT || path.resolve(__dirname, '../../..');
const SEALED = process.env.SEALED_CASES || path.join(__dirname, '..', 'sealed', 'cases.json');
const OUT = process.env.REVIEW_OUT || path.join(__dirname, '..', 'results.json');
const POOL = Number(process.env.REVIEW_POOL || 4);
const FILTER = process.env.CASE_FILTER || '';

const LINES = {
  en: 'A teammate now has this conversation.',
  ur: 'یہ گفتگو اب ایک ساتھی کے پاس ہے۔',
  ar: 'هذه المحادثة الآن لدى أحد الزملاء.',
  hi: "यह बातचीत अब एक साथी के पास है।",
};
const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const FIXED = new Set(Object.values(LINES));

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function batches(turns) {
  const groups = [];
  let i = 0;
  while (i < turns.length) {
    const group = [i];
    i += 1;
    while (i < turns.length && turns[i].sameProcess) {
      group.push(i);
      i += 1;
    }
    groups.push(group);
  }
  return groups;
}

function runWorker(dir, caseFile, turnIndexes) {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: process.env.LANG || 'C.UTF-8',
    LUNA_ROOT: ROOT,
    WORK_DIR: dir,
    CASE_FILE: caseFile,
    TURN_INDEXES: turnIndexes.join(','),
    LUNA_CONTROL_STATE_FILE: path.join(dir, 'control.json'),
    LUNA_OP_STORE_FILE: path.join(dir, 'ops.json'),
    TICKET_STATE_FILE: path.join(dir, 'ticket.json'),
    MENTION_ROTATE_FILE: path.join(dir, 'mention.json'),
    LUNA_PROMPT_FILE: path.join(ROOT, 'luna-current', '01_runtime', 'system-prompt.txt'),
    FUNDEDELITE_FAQ_PATH: path.join(ROOT, 'luna-current', '01_runtime', 'fundedelite-faqs.md'),
    OPENAI_API_KEY: 'stub-not-a-secret',
    INTERCOM_ACCESS_TOKEN: 'stub-not-a-secret',
    CALLS_FILE: path.join(dir, 'calls.json'),
  };
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'worker.js')], {
      env,
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (buf) => { out += buf.toString(); });
    child.stderr.on('data', (buf) => { out += buf.toString(); });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 180000);
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.writeFileSync(path.join(dir, 'worker.log'), out.slice(-200000));
      resolve(code);
    });
  });
}

function httpCalls(calls) {
  return (calls || []).filter((c) => c && c.op === 'http');
}

function posts(calls, kind) {
  return httpCalls(calls).filter((c) => {
    const data = c.data || {};
    if (kind === 'assignment') return data.message_type === 'assignment';
    if (kind === 'note') return data.message_type === 'note';
    if (kind === 'comment') return data.message_type === 'comment';
    return false;
  });
}

function ok(call) {
  return call.status >= 200 && call.status < 300;
}

function canonArticle(text) {
  return String(text || '').normalize('NFKC').replace(/\p{Cf}/gu, '').trim();
}

function approvedBody(handoff, question) {
  if (!handoff || typeof handoff.approvedFaqCustomerBody !== 'function') return '';
  try {
    return canonArticle(handoff.approvedFaqCustomerBody(question));
  } catch (_) {
    return '';
  }
}

function judge(entry, calls, handoff, faq, markdown) {
  const expect = entry.expect || {};
  const reasons = [];
  const comments = posts(calls, 'comment');
  const notes = posts(calls, 'note');
  const assignments = posts(calls, 'assignment');
  const commentOk = comments.filter(ok);
  const bodies = commentOk.map((c) => String((c.data && c.data.body) || ''));
  const lastTurn = entry.turns.length - 1;
  const onTurn = (list, turn) => list.filter((c) => c.turn === turn);

  if ((readJson(path.join(entry._dir, 'tripwire.json'), []) || []).length) {
    reasons.push('network tripwire fired');
  }
  if (fs.existsSync(path.join(entry._dir, 'worker-error.txt'))) {
    reasons.push('worker error: ' + fs.readFileSync(path.join(entry._dir, 'worker-error.txt'), 'utf8').split('\n')[0]);
  }

  const successCount = assignments.filter((c) => ok(c) && String(c.responseAssignee || '') === '424242').length;
  const handoffNoteCount = notes.filter((c) => String((c.data && c.data.body) || '').includes('LUNA_HANDOFF_NOTE')).length;

  function eqCount(name, actual, expected) {
    if (expected == null) return;
    if (actual !== expected) reasons.push(name + ' ' + actual + ' != ' + expected);
  }
  function maxCount(name, actual, expected) {
    if (expected == null) return;
    if (actual > expected) reasons.push(name + ' ' + actual + ' > ' + expected);
  }

  eqCount('customerCount', commentOk.length, expect.customerCount);
  maxCount('customerCount', commentOk.length, expect.customerCountMax);
  eqCount('assignmentSuccess', successCount, expect.assignmentSuccess);
  maxCount('assignmentSuccess', successCount, expect.assignmentSuccessMax);
  eqCount('assignmentPosts', assignments.length, expect.assignmentPosts);
  eqCount('handoffNotes', handoffNoteCount, expect.handoffNotes);
  if (expect.noteMin != null && notes.filter(ok).length < expect.noteMin) {
    reasons.push('noteMin ' + notes.filter(ok).length + ' < ' + expect.noteMin);
  }
  if (expect.lastTurnAssignmentPosts != null && onTurn(assignments, lastTurn).length !== expect.lastTurnAssignmentPosts) {
    reasons.push('lastTurnAssignmentPosts ' + onTurn(assignments, lastTurn).length + ' != ' + expect.lastTurnAssignmentPosts);
  }
  if (expect.lastTurnCustomer != null && onTurn(commentOk, lastTurn).length !== expect.lastTurnCustomer) {
    reasons.push('lastTurnCustomer ' + onTurn(commentOk, lastTurn).length + ' != ' + expect.lastTurnCustomer);
  }

  if (expect.byteExact) {
    const want = LINES[expect.line];
    if (bodies.length !== 1 || bodies[0] !== want) {
      reasons.push('byte-exact ' + expect.line + ' got ' + JSON.stringify(bodies).slice(0, 240));
    }
  }
  if (expect.noFixedLine) {
    const hit = bodies.filter((b) => FIXED.has(b) || Object.values(LINES).some((line) => b.includes(line)));
    if (hit.length) reasons.push('fixed line posted ' + JSON.stringify(hit).slice(0, 180));
  }
  if (expect.notHedge && bodies.some((b) => b.replace(/\s+/g, ' ').trim() === HEDGE)) {
    reasons.push('bare number hedge');
  }
  if (expect.hedge) {
    const trimmed = bodies.map((b) => b.replace(/\s+/g, ' ').trim());
    if (trimmed.length !== 1 || trimmed[0] !== HEDGE) {
      reasons.push('expected hedge got ' + JSON.stringify(trimmed).slice(0, 240));
    }
  }
  if (expect.articleFor) {
    const approved = approvedBody(handoff, expect.articleFor);
    const got = bodies.map((b) => canonArticle(b));
    if (!approved || approved.length < 40) reasons.push('approved article empty');
    else if (got.length !== 1 || got[0] !== approved) reasons.push('article mismatch ' + JSON.stringify(got).slice(0, 180));
    else if (approved === HEDGE) reasons.push('article is the hedge');
    else {
      const slice = approved.replace(/\s+/g, ' ').slice(0, 80);
      const flat = markdown.normalize('NFKC').replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ');
      if (!flat.includes(slice)) reasons.push('article body not in synced FAQ');
    }
  }
  if (expect.lineOnce) {
    const want = LINES[expect.lineOnce];
    const hits = bodies.filter((b) => b === want);
    if (hits.length !== 1) reasons.push('locked line count ' + hits.length);
  }
  if (expect.laterArticle) {
    const approved = approvedBody(handoff, expect.laterArticle);
    if (!bodies.some((b) => canonArticle(b) === approved)) reasons.push('later article missing');
  }
  if (expect.contains) {
    const blob = bodies.join('\n');
    for (const piece of expect.contains) {
      if (piece && !blob.includes(piece)) reasons.push('missing text ' + piece.slice(0, 80));
    }
  }
  if (expect.noWrongLine) {
    for (const body of bodies) {
      for (const line of FIXED) {
        if (body.includes(line) && body !== line) reasons.push('locked line was wrapped');
      }
    }
  }
  if (expect.forbid) {
    const posted = httpCalls(calls).map((c) => String((c.data && c.data.body) || '')).join('\n');
    const prompts = [];
    for (const call of calls) {
      if (!call || call.op !== 'model') continue;
      for (const message of call.messages || []) {
        if (message && message.role !== 'system') prompts.push(String(message.content || ''));
      }
    }
    const promptBlob = prompts.join('\n');
    for (const secret of expect.forbid) {
      if (!secret) continue;
      if (posted.includes(secret)) reasons.push('forbidden posted text ' + secret.slice(0, 60));
      if (secret.includes('CanarySecret') && promptBlob.includes(secret)) reasons.push('canary reached the model prompt');
    }
  }
  const duplicateCustomers = commentOk.length > 1 && bodies.length > 1 && bodies.every((b) => b === bodies[0]);
  if (duplicateCustomers && expect.customerCount !== bodies.length && !expect.laterArticle) {
    reasons.push('duplicate identical customer posts');
  }
  return {
    id: entry.id,
    class: entry.class,
    critical: !!entry.critical,
    recovery: entry.recovery || '',
    pass: reasons.length === 0,
    reasons,
    bodies: bodies.map((b) => b.slice(0, 180)),
    assignmentPosts: assignments.length,
    assignmentSuccess: successCount,
    comments: commentOk.length,
    notes: handoffNoteCount,
    tripwires: (readJson(path.join(entry._dir, 'tripwire.json'), []) || []).length,
  };
}

async function runCase(entry, handoff, faq, markdown) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r15-' + entry.id.slice(0, 24) + '-'));
  const caseFile = path.join(dir, 'case.json');
  fs.writeFileSync(caseFile, JSON.stringify(entry));
  entry._dir = dir;
  let code = 0;
  for (const group of batches(entry.turns)) {
    const status = await runWorker(dir, caseFile, group);
    if (status !== 0) code = status;
  }
  const calls = readJson(path.join(dir, 'calls.json'), []);
  let result;
  try {
    result = judge(entry, calls, handoff, faq, markdown);
  } catch (err) {
    result = {
      id: entry.id,
      class: entry.class,
      critical: !!entry.critical,
      recovery: entry.recovery || '',
      pass: false,
      reasons: ['judge threw ' + (err && err.message)],
      bodies: [],
      assignmentPosts: 0,
      assignmentSuccess: 0,
      comments: 0,
      notes: 0,
      tripwires: 0,
    };
  }
  result.workerCode = code;
  if (code !== 0 && result.pass) {
    result.pass = false;
    result.reasons.push('worker exit ' + code);
  }
  return result;
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function main() {
  const doc = readJson(SEALED, null);
  if (!doc || !Array.isArray(doc.cases)) {
    console.error('missing sealed cases');
    process.exit(2);
  }
  const runtimeFaq = path.join(ROOT, 'luna-current', '01_runtime');
  const handoff = require(path.join(runtimeFaq, 'fixedMessageHandoff.js'));
  const faq = require(path.join(runtimeFaq, 'faq-kb.js'));
  const markdown = fs.readFileSync(path.join(runtimeFaq, 'fundedelite-faqs.md'), 'utf8');
  let list = doc.cases;
  if (FILTER) {
    const re = new RegExp(FILTER);
    list = list.filter((c) => re.test(c.id) || re.test(c.class));
  }
  console.log('running', list.length, 'cases against', ROOT);
  const started = Date.now();
  let done = 0;
  const results = await pool(list, POOL, async (entry) => {
    const result = await runCase(entry, handoff, faq, markdown);
    done += 1;
    if (done % 10 === 0 || !result.pass) {
      console.log((result.pass ? 'PASS' : 'FAIL'), result.id, result.pass ? '' : result.reasons[0]);
    }
    return result;
  });
  const failed = results.filter((r) => !r.pass);
  const critical = failed.filter((r) => r.critical);
  const summary = {
    root: ROOT,
    sealed: SEALED,
    cases: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    criticalFailed: critical.length,
    recoveryFailed: failed.filter((r) => r.class === 'recovery').length,
    elapsedMs: Date.now() - started,
    byClass: {},
    failures: failed.map((r) => ({
      id: r.id,
      class: r.class,
      critical: r.critical,
      recovery: r.recovery,
      reasons: r.reasons,
      bodies: r.bodies,
      assignmentPosts: r.assignmentPosts,
      comments: r.comments,
    })),
  };
  for (const r of results) {
    if (!summary.byClass[r.class]) summary.byClass[r.class] = { pass: 0, fail: 0 };
    summary.byClass[r.class][r.pass ? 'pass' : 'fail'] += 1;
  }
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    passed: summary.passed,
    failed: summary.failed,
    criticalFailed: summary.criticalFailed,
    recoveryFailed: summary.recoveryFailed,
    out: OUT,
  }));
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(2);
});
