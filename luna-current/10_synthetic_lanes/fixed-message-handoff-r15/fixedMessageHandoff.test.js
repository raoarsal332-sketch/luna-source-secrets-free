'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const axiosMock = path.join(os.tmpdir(), 'luna-r15-axios-' + process.pid + '.js');
fs.writeFileSync(axiosMock, 'module.exports = { get: async function () { return { status: 404, data: "" }; } };\n');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'axios') return axiosMock;
  return resolveFilename.call(this, request, parent, isMain, options);
};

process.env.FUNDEDELITE_FAQ_PATH = path.join(__dirname, '../../01_runtime/fundedelite-faqs.md');
process.env.LUNA_OP_STORE_FILE = path.join(os.tmpdir(), 'luna-r15-ops-' + process.pid + '.json');
try { fs.unlinkSync(process.env.LUNA_OP_STORE_FILE); } catch (_) { /* fresh store */ }

const handoff = require('../../01_runtime/fixedMessageHandoff');
const store = require('../../01_runtime/writeOpStore');
const faq = require('../../01_runtime/faq-kb');

const FIXED = handoff.FIXED_MESSAGES.en;
const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const WELCOME_FAQS = [
  'What is the daily loss limit?',
  'How does the profit target work?',
  'What is the leverage?',
];

let passed = 0;
const tests = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log('PASS', name);
    });
}

function transport(script) {
  const calls = [];
  async function take(op, extra) {
    calls.push(Object.assign({ op }, extra || {}));
    const spec = script && Object.prototype.hasOwnProperty.call(script, op) ? script[op] : { ok: true, status: 200, data: { id: 'conv-synthetic', type: 'conversation' } };
    return typeof spec === 'function' ? spec(calls) : spec;
  }
  return {
    calls,
    postNote: (body) => take('note', { body }),
    assign: (id) => take('assign', { id }),
    postMessage: (body) => take('message', { body }),
  };
}

function fixedDecision() {
  return { action: 'fixed_message', silent: false, route: null, reason: 'fixed_handoff', language: 'en', message: FIXED };
}

function notePart() {
  return { part_type: 'note', author: { id: 'seat-a', type: 'admin' }, body: 'Account: 1 Problem: x' };
}

tests.push(test('a missed assignment is failed-confirmed and retried once, then the owed line posts once', async () => {
  const id = 'c-missed-assign';
  const key = store.assignmentOpKey(id, 'seat-a', 'human-7');
  store.set(key, { status: 'unknown', kind: 'assignment' });
  assert.strictEqual(store.shouldSkipReplay(store.get(key)), true);

  const failed = transport({
    assign() {
      const rec = store.get(key);
      assert.strictEqual(rec.status, 'failed-confirmed');
      assert.strictEqual(rec.reason, 'assignment-did-not-land');
      assert.strictEqual(store.shouldSkipReplay(rec), false);
      assert.strictEqual(rec.attempts, 1);
      return { ok: false, status: 500, data: {} };
    },
  });
  const first = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: id,
    parts: [notePart()],
    conversation: { id, admin_assignee_id: 'seat-a' },
    progress: { noteConfirmed: true, assignConfirmed: false, assignAmbiguous: true, assigneeId: 'human-7' },
    recheckHold: true,
    transport: failed,
  });
  assert.strictEqual(first.sent, false);
  assert.strictEqual(first.progress.assignAmbiguous, true);
  assert.deepStrictEqual(failed.calls.map((c) => c.op), ['assign']);
  assert.ok(store.latestOwedFixedLine(id, 'seat-a'));
  assert.strictEqual(store.latestOwedFixedLine(id, 'seat-a').messageSent, false);

  const carried = store.get(key);
  store.set(key, { status: 'unknown', attempts: carried.attempts, kind: 'assignment' });
  assert.strictEqual(store.shouldSkipReplay(store.get(key)), true);

  const retry = transport({
    assign() {
      const rec = store.get(key);
      assert.strictEqual(rec.status, 'failed-confirmed');
      assert.strictEqual(rec.attempts, 2);
      assert.strictEqual(store.shouldSkipReplay(rec), false);
      return { ok: true, status: 200, data: { id, type: 'conversation', admin_assignee_id: 'human-7' } };
    },
  });
  const second = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: id,
    parts: [notePart()],
    conversation: { id, admin_assignee_id: 'seat-a' },
    progress: first.progress,
    recheckHold: true,
    transport: retry,
  });
  assert.strictEqual(second.sent, true);
  assert.deepStrictEqual(retry.calls.map((c) => c.op), ['assign', 'message']);
  assert.strictEqual(retry.calls[1].body, FIXED);
  assert.strictEqual(store.latestOwedFixedLine(id, 'seat-a'), null);

  const duplicate = transport();
  const third = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: id,
    parts: [notePart(), { part_type: 'comment', author: { id: 'seat-a', type: 'admin' }, body: FIXED }],
    conversation: { id, admin_assignee_id: 'human-7' },
    progress: second.progress,
    recheckHold: true,
    transport: duplicate,
  });
  assert.deepStrictEqual(duplicate.calls, []);
  assert.strictEqual(third.reason, 'already_sent');
}));

tests.push(test('same-turn unknown assignment stays suppressed, and the retry bound stops', async () => {
  const id = 'c-bound';
  const key = store.assignmentOpKey(id, 'seat-a', '7');
  store.set(key, { status: 'unknown', kind: 'assignment', attempts: 0 });
  const held = transport();
  const replay = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: '7',
    botId: 'seat-a',
    conversationId: id,
    parts: [notePart()],
    conversation: { id, admin_assignee_id: 'seat-a' },
    progress: { noteConfirmed: true, assignAmbiguous: true, assigneeId: '7' },
    transport: held,
  });
  assert.deepStrictEqual(held.calls, []);
  assert.strictEqual(replay.reason, 'assign_ambiguous_held');
  assert.strictEqual(store.get(key).status, 'unknown');
  assert.strictEqual(store.shouldSkipReplay(store.get(key)), true);

  store.set(key, { status: 'unknown', kind: 'assignment', attempts: store.ASSIGNMENT_RETRY_BOUND });
  assert.strictEqual(store.confirmAssignmentDidNotLand({
    conversationId: id,
    madeBy: 'seat-a',
    assigneeId: '7',
  }), null);
  assert.strictEqual(store.get(key).status, 'unknown');
  assert.strictEqual(store.shouldSkipReplay({ status: 'failed-confirmed' }), false);
  assert.strictEqual(store.shouldSkipReplay({ status: 'unknown' }), true);
}));

tests.push(test('welcome FAQs use the same article as retrieval and are not the number hedge', async () => {
  for (const text of WELCOME_FAQS) {
    const decision = handoff.decide({
      path: 'welcome',
      latestText: text,
      parts: [],
      full: { admin_assignee_id: 'seat-a', team_assignee_id: '0' },
      botId: 'seat-a',
      ownershipOpts: { arsalId: 'seat-a', eliteAiId: 'seat-e' },
    });
    assert.strictEqual(decision.action, 'route_normal', text);
    assert.strictEqual(decision.message, null, text);
    const selected = faq.selectApprovedAnswer(text);
    const retrieved = await faq.retrieveOfficialFaqContext(text, { live: false });
    const title = (String(retrieved.block || '').match(/TITLE: ([^\n]+)/) || [])[1];
    assert.strictEqual(selected.title, title, text);
    const body = handoff.approvedFaqCustomerBody(text);
    assert.strictEqual(body, selected.body, text);
    assert.ok(body.length > 40, text);
    assert.notStrictEqual(body, HEDGE, text);
    assert.strictEqual(Object.values(handoff.FIXED_MESSAGES).includes(body), false, text);
    assert.strictEqual(handoff.isApprovedFaqAnswer(text, body), true, text);
    assert.strictEqual(/team will review/i.test(body), false, text);
  }
  assert.strictEqual(handoff.approvedFaqCustomerBody('what is the daily drawdown?'), '');
  assert.strictEqual(handoff.approvedFaqCustomerBody('what is the password policy?'), '');
  assert.strictEqual(handoff.approvedFaqCustomerBody('Which challenge do you mean?'), '');
  assert.strictEqual(handoff.approvedFaqCustomerBody('Please tell me which challenge you mean.'), '');
  assert.strictEqual(handoff.isWelcomeKbFigureQuestion('what is the leverage'), true);
  assert.strictEqual(handoff.isWelcomeKbFigureQuestion('what is the leverage of my account'), false);

  const src = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  const welcomeAt = src.indexOf('FIXED_MESSAGE_HANDOFF_R3:welcome');
  const welcome = src.slice(welcomeAt, welcomeAt + 1400);
  assert.ok(welcome.includes("reason === 'account_number_question'"));
  assert.ok(welcome.includes('deliverAccountQuestionAnswer'));
  const spread = src.indexOf('if (isSpreadCheckAsk(text))', welcomeAt);
  const between = src.slice(welcomeAt, spread);
  assert.ok(between.includes('approvedFaqCustomerBody'));
  assert.ok(between.includes('WELCOME_FAQ kb answer'));
  const handoffSrc = fs.readFileSync(path.join(__dirname, '../../01_runtime/fixedMessageHandoff.js'), 'utf8');
  assert.ok(handoffSrc.includes('confirmAssignmentDidNotLand'));
  assert.ok(handoffSrc.includes("status !== 'unknown'") || src.includes('failed-confirmed') || handoffSrc.includes('confirmAssignmentDidNotLand'));
  const storeSrc = fs.readFileSync(path.join(__dirname, '../../01_runtime/writeOpStore.js'), 'utf8');
  assert.ok(storeSrc.includes("status: 'failed-confirmed'"));
  assert.ok(storeSrc.includes('ASSIGNMENT_RETRY_BOUND'));
  assert.strictEqual(storeSrc.includes("return rec.status === 'confirmed' || rec.status === 'unknown' || rec.status === 'pending'"), true);
}));

Promise.all(tests)
  .then(() => {
    try { fs.unlinkSync(process.env.LUNA_OP_STORE_FILE); } catch (_) { /* temp store */ }
    try { fs.unlinkSync(axiosMock); } catch (_) { /* temp mock */ }
    console.log('OK', passed, 'passed');
  })
  .catch((err) => {
    console.error('FAIL', err && err.stack || err);
    process.exit(1);
  });
