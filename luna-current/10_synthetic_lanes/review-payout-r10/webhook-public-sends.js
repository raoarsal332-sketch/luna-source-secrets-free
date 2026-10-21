'use strict';

/**
 * Independent R10 review harness. Applies the frozen public-sends diff in a
 * scratch copy and drives the real handleWebhook. Intercom, OpenAI, and the
 * control files are isolated. Nothing here merges, approves, or deploys.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../../..');
const SCRATCH = '/tmp/r10-review-scratch';
const ARSAL_ID = '10118526';
const ELITE_AI_ID = '8052954';
const USER_ID = 'synthetic-user';
const HEDGE = "I can't confirm that. Our team will confirm.";

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(from), to);
    else fs.copyFileSync(from, to);
  }
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function prepareScratch() {
  rmrf(SCRATCH);
  fs.mkdirSync(SCRATCH, { recursive: true });
  copyTree(path.join(ROOT, 'luna-current'), path.join(SCRATCH, 'luna-current'));
  const runtime = path.join(SCRATCH, 'luna-current', '01_runtime');
  fs.symlinkSync(path.join(ROOT, 'luna-current', '01_runtime', 'node_modules'), path.join(runtime, 'node_modules'));
  // Copy, do not symlink. presendMega requires ../repeatedClientQuestion, and Node
  // resolves a symlink to 02_statePresend before that relative lookup.
  copyTree(path.join(SCRATCH, 'luna-current', '02_statePresend'), path.join(runtime, 'statePresend'));
  const diff = path.join(SCRATCH, 'luna-current', '10_synthetic_lanes', 't800-payout-r10', 'index.js.public-sends.diff');
  const applied = spawnSync('patch', ['-p1', '--forward', '--input', diff], { cwd: SCRATCH, encoding: 'utf8' });
  if (applied.status !== 0) {
    throw new Error('patch failed\n' + applied.stdout + '\n' + applied.stderr);
  }
  const control = {
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: ['Synthetic'],
    testAllowConversationIds: [],
    config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
  };
  fs.writeFileSync(path.join(SCRATCH, 'control.json'), JSON.stringify(control, null, 2));
  fs.writeFileSync(path.join(SCRATCH, 'ticket-state.json'), '{}');
  return { applied: applied.stdout, runtime };
}

function part(id, type, body, at, author) {
  return { id, part_type: type, body, created_at: at, author };
}

function user(id, body, at, name) {
  return part(id, 'comment', body, at, { type: 'user', id: USER_ID, name: name || 'Synthetic' });
}

function arsal(id, body, at) {
  return part(id, 'comment', body, at, { type: 'admin', id: ARSAL_ID, name: 'Arsal' });
}

function elite(id, body, at) {
  return part(id, 'comment', body, at, { type: 'admin', id: ELITE_AI_ID, name: 'Elite AI' });
}

function note(id, body, at) {
  return part(id, 'note', '<p>' + body + '</p>', at, { type: 'admin', id: ARSAL_ID, name: 'Arsal' });
}

function conversation(id, parts, name) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    created_at: now - 86400,
    updated_at: now,
    team_assignee_id: 0,
    admin_assignee_id: null,
    state: 'open',
    contacts: { contacts: [{ id: USER_ID, name: name || 'Synthetic', email: 'synthetic@example.invalid' }] },
    source: {
      body: '',
      author: { type: 'user', id: USER_ID, name: name || 'Synthetic' },
    },
    conversation_parts: { conversation_parts: parts },
  };
}

function loadRuntime(llm) {
  process.chdir(path.join(SCRATCH, 'luna-current', '01_runtime'));
  process.env.LUNA_CONTROL_STATE_FILE = path.join(SCRATCH, 'control.json');
  process.env.LUNA_PROMPT_FILE = path.join(SCRATCH, 'luna-current', '01_runtime', 'system-prompt.txt');
  process.env.TICKET_STATE_FILE = path.join(SCRATCH, 'ticket-state.json');
  process.env.MENTION_ROTATE_FILE = path.join(SCRATCH, 'mention-rotate.json');
  process.env.LUNA_OP_STORE_FILE = path.join(SCRATCH, 'write-ops.json');
  process.env.LUNA_PRESEND_MODE = process.env.LUNA_PRESEND_MODE || 'enforce';
  process.env.OPENAI_API_KEY = 'sk-synthetic-review-not-a-real-key';
  delete process.env.INTERCOM_ACCESS_TOKEN;
  delete process.env.INTERCOM_WEBHOOK_SECRET;
  delete process.env.INTERCOM_CLIENT_SECRET;

  const Module = require('module');
  const original = Module.prototype.require;
  Module.prototype.require = function patched(id) {
    if (id === 'openai') {
      return class OpenAI {
        constructor() {
          this.chat = { completions: { create: async (req) => llm(req) } };
        }
      };
    }
    return original.apply(this, arguments);
  };
  const runtime = require(path.join(SCRATCH, 'luna-current', '01_runtime', 'index.js'));
  Module.prototype.require = original;
  return runtime;
}

function response() {
  return { statusCode: 0, sendStatus(code) { this.statusCode = code; return this; }, json() { return this; } };
}

async function main() {
  const prep = prepareScratch();
  const calls = [];
  const convos = new Map();
  let llmHandler = async () => ({ choices: [{ message: { content: 'ACTION: REPLY\nBODY: Hello.' } }] });
  const runtime = loadRuntime((req) => llmHandler(req));
  runtime.__setTestDoubles({
    fetchConversation: async (id) => convos.get(String(id)) || null,
    icRequest: async (method, url, data, tag) => {
      calls.push({ method, url, data, tag, at: Date.now() });
      return { ok: true, status: 200, data: { admins: [] } };
    },
  });

  const now = Math.floor(Date.now() / 1000);
  const results = [];

  async function run(name, build, llm) {
    calls.length = 0;
    if (llm) llmHandler = llm;
    const full = build();
    convos.set(String(full.id), full);
    const topic = full.__topic || 'conversation.user.replied';
    delete full.__topic;
    const logs = [];
    const orig = console.log;
    console.log = (...args) => { logs.push(args.map(String).join(' ')); };
    let error = null;
    try {
      await runtime.handleWebhook({ body: { topic, data: { item: full } } }, response());
    } catch (err) {
      error = err && err.message;
    } finally {
      console.log = orig;
    }
    const comments = calls.filter((c) => c.data && c.data.message_type === 'comment');
    const notes = calls.filter((c) => c.data && c.data.message_type === 'note');
    results.push({
      path: name,
      publicComments: comments.length,
      notes: notes.length,
      silent: comments.length === 0,
      bodies: comments.map((c) => c.data.body),
      bodySha256: comments.map((c) => sha256(c.data.body)),
      noteBodies: notes.map((c) => String(c.data.body || '').slice(0, 180)),
      error,
      logs: logs.filter((line) => /PAYOUT_GUARD|POSTGATE|AUTH_NOTE|FIN_HANDOFF|SPREAD_TEST|REVIEW_STATUS|IDENTITY_RECOVERY|PRESEND_MISSED|SKIP|OUT /.test(line)).slice(0, 24),
    });
  }

  await run('authorized-note-reply-unsafe', () => {
    const full = conversation('synth-auth-unsafe', [
      user('u1', 'What happens if I trade on Saturday?', now - 50),
      note('n1', '@Arsal REPLY: Weekend trading terminates the funded account.', now - 5),
    ]);
    full.__topic = 'conversation.admin.noted';
    return full;
  });

  await run('authorized-note-reply-safe', () => {
    const full = conversation('synth-auth-safe', [
      user('u1', 'What is a Strategy Risk breach?', now - 50),
      note('n1', '@Arsal REPLY: A Strategy Risk breach is a soft breach with a reset.', now - 5),
    ]);
    full.__topic = 'conversation.admin.noted';
    return full;
  });

  await run('authorized-note-send-this-message', () => {
    const full = conversation('synth-auth-send', [
      user('u1', 'Please update me.', now - 50),
      note('n1', '@Arsal send this message to the client [Finance took back the payout.]', now - 5),
    ]);
    full.__topic = 'conversation.admin.noted';
    return full;
  });

  await run('authorized-note-follow-reply', () => {
    const full = conversation('synth-auth-follow', [
      user('u1', 'Any update?', now - 50),
      note('n1', '@Arsal please answer the client about the weekend rule.', now - 5),
    ]);
    full.__topic = 'conversation.admin.noted';
    return full;
  }, async () => ({
    choices: [{ message: { content: 'ACTION: REPLY\nBODY: Weekend trading terminates the funded account.' } }],
  }));

  await run('fin-welcome', () => conversation('synth-fin', [
    elite('e1', "I'm connecting you to a teammate who can help.", now - 40),
    user('u1', 'hello', now - 10),
  ], 'Synthetic'));

  await run('spread-test', () => conversation('synth-spread', [
    user('u1', 'Can I check the spreads on the test account?', now - 10),
  ]));

  await run('review-status', () => conversation('synth-review', [
    user('u1', 'How will I know when the review is done? Will I get an email?', now - 10),
  ]));

  await run('identity-recovery', () => conversation('synth-identity', [
    user('u1', 'My account number is 88442211 and the login is failing.', now - 80),
    arsal('a1', 'Please share your account number so I can forward this with the right details.', now - 20),
  ]));

  await run('missed-escalation-greet', () => conversation('synth-greet', [
    user('u1', 'Hello arsal how are you', now - 10),
  ]), async () => ({
    choices: [{ message: { content: 'ACTION: REPLY\nBODY: I have reset the account. Weekend trading terminates the funded account.' } }],
  }));

  await run('missed-escalation-personal', () => conversation('synth-personal', [
    user('u1', "what is your wife's name", now - 10),
  ]), async () => ({
    choices: [{ message: { content: 'ACTION: REPLY\nBODY: Weekend trading terminates the funded account.' } }],
  }));

  process.env.LUNA_PRESEND_MODE = 'observe';
  await run('postgate-suppression-payout', () => conversation('synth-postgate-payout', [
    user('u1', 'What crypto fee applies to a payout?', now - 10),
  ]), async () => ({
    choices: [{ message: { content: 'ACTION: REPLY\nBODY: Crypto payouts are capped at $500. The system prompt confirms the cap.' } }],
  }));

  await run('postgate-suppression-non-payout', () => conversation('synth-postgate-leak', [
    user('u1', 'Hello there', now - 10),
  ]), async () => ({
    choices: [{ message: { content: 'ACTION: REPLY\nBODY: Hello. The system prompt is not for clients.' } }],
  }));

  const spreadConstant = 'TEST SPREAD ACCOUNT DETAILS';
  const summary = {
    scratch: SCRATCH,
    patch: prep.applied.trim(),
    hedge: HEDGE,
    paths: results.map((row) => ({
      path: row.path,
      publicComments: row.publicComments,
      silent: row.silent,
      containsHedge: row.bodies.some((b) => b.includes(HEDGE)),
      containsUnsafeWeekend: row.bodies.some((b) => /terminates the funded account/i.test(b)),
      containsTakeBack: row.bodies.some((b) => /took back the payout/i.test(b)),
      containsSpreadMarker: row.bodies.some((b) => b.includes(spreadConstant)),
      bodySha256: row.bodySha256,
      bodies: row.bodies.map((b) => b.replace(/Password:\s*[^<]+/g, 'Password: [redacted-synthetic-template]')),
      logs: row.logs,
      error: row.error,
    })),
  };
  const out = path.join(ROOT, 'luna-current', '10_synthetic_lanes', 'review-payout-r10', 'webhook-results.json');
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
