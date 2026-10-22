'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const axiosMock = path.join(os.tmpdir(), 'luna-r16-axios-' + process.pid + '.js');
fs.writeFileSync(axiosMock, 'module.exports = { get: async function () { return { status: 404, data: "" }; } };\n');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'axios') return axiosMock;
  return resolveFilename.call(this, request, parent, isMain, options);
};

process.env.FUNDEDELITE_FAQ_PATH = path.join(__dirname, '../../01_runtime/fundedelite-faqs.md');
process.env.LUNA_OP_STORE_FILE = path.join(os.tmpdir(), 'luna-r16-ops-' + process.pid + '.json');
try { fs.unlinkSync(process.env.LUNA_OP_STORE_FILE); } catch (_) { /* fresh store */ }

const handoff = require('../../01_runtime/fixedMessageHandoff');
const store = require('../../01_runtime/writeOpStore');
const policy = require('../../02_statePresend/policyEvidence');

const FIXED = handoff.FIXED_MESSAGES.en;
const URDU = handoff.FIXED_MESSAGES.ur;
const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const CLARIFIER = 'Please tell me which challenge you mean.';
const EVIDENCE = 'DLL 5%/3%, MLL 8%.';

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

function decision(message) {
  return { action: 'fixed_message', silent: false, route: null, reason: 'fixed_handoff', language: 'ur', message };
}

function notePart() {
  return { part_type: 'note', author: { id: 'seat-a', type: 'admin' }, body: 'Account: 1 Problem: x' };
}

tests.push(test('an ambiguous or empty challenge rank posts the clarifier and does not go silent', () => {
  assert.strictEqual(handoff.ambiguousChallengeClarifier('How can I pay for the challenge?'), CLARIFIER);
  assert.strictEqual(handoff.ambiguousChallengeClarifier('what is the password policy?'), '');
  assert.strictEqual(handoff.ambiguousChallengeClarifier('what are the password requirements?'), '');
  assert.strictEqual(handoff.ambiguousChallengeClarifier('What is the daily loss limit?'), '');
  assert.strictEqual(handoff.ambiguousChallengeClarifier('How does the profit target work?'), '');
  assert.strictEqual(handoff.ambiguousChallengeClarifier('What is the leverage?'), '');
  assert.strictEqual(handoff.ambiguousChallengeClarifier('How can I pay for the catalyst challenge?'), '');
  assert.notStrictEqual(handoff.approvedFaqCustomerBody('What is the daily loss limit?'), '');
  assert.notStrictEqual(handoff.approvedFaqCustomerBody('What is the daily loss limit?'), HEDGE);
  const src = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  const welcomeAt = src.indexOf('FIXED_MESSAGE_HANDOFF_R3:welcome');
  const spread = src.indexOf('if (isSpreadCheckAsk(text))', welcomeAt);
  const between = src.slice(welcomeAt, spread);
  assert.ok(between.includes('ambiguousChallengeClarifier'));
  assert.ok(between.includes('approvedFaqCustomerBody'));
  assert.ok(src.includes('WELCOME_FAQ clarifier'));
}));

tests.push(test('an unlanded assignment retry posts the owed body, not the retry text language', async () => {
  const id = 'c-retry-lang';
  const first = transport({ assign: { ok: false, status: 500, data: {} } });
  const turn0 = await handoff.commit({
    decision: decision(URDU),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: id,
    parts: [],
    conversation: { id, admin_assignee_id: 'seat-a' },
    progress: {},
    transport: first,
  });
  assert.strictEqual(turn0.sent, false);
  assert.strictEqual(turn0.progress.assignAmbiguous, true);
  assert.deepStrictEqual(first.calls.map((c) => c.op), ['note', 'assign']);
  const owed = store.latestOwedFixedLine(id, 'seat-a');
  assert.strictEqual(owed.message, URDU);
  assert.strictEqual(owed.language, 'ur');
  assert.strictEqual(owed.messageSent, false);

  const retry = transport({
    assign: { ok: true, status: 200, data: { id, type: 'conversation', admin_assignee_id: 'human-7' } },
  });
  const turn1 = await handoff.commit({
    decision: { action: 'fixed_message', message: FIXED, language: 'en' },
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: id,
    parts: [notePart()],
    conversation: { id, admin_assignee_id: 'seat-a' },
    progress: turn0.progress,
    recheckHold: true,
    transport: retry,
  });
  assert.strictEqual(turn1.sent, true);
  assert.strictEqual(retry.calls.filter((c) => c.op === 'message').length, 1);
  assert.strictEqual(retry.calls.find((c) => c.op === 'message').body, URDU);
  assert.strictEqual(store.latestOwedFixedLine(id, 'seat-a'), null);

  const again = transport();
  const turn2 = await handoff.commit({
    decision: { action: 'fixed_message', message: FIXED, language: 'en' },
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: id,
    parts: [notePart(), { part_type: 'comment', author: { id: 'seat-a', type: 'admin' }, body: URDU, created_at: 9 }],
    conversation: { id, admin_assignee_id: 'human-7' },
    progress: turn1.progress,
    recheckHold: true,
    transport: again,
  });
  assert.strictEqual(turn2.sent, false);
  assert.deepStrictEqual(again.calls, []);
}));

tests.push(test('a note timeout stays held on the same turn and the next turn posts only the owed line', async () => {
  const id = 'c-note-retry';
  const held = transport();
  const sameTurn = await handoff.commit({
    decision: decision(URDU),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: id,
    parts: [],
    conversation: { id, admin_assignee_id: 'seat-a' },
    progress: { noteAmbiguous: true },
    transport: held,
  });
  assert.strictEqual(sameTurn.reason, 'note_ambiguous_held');
  assert.deepStrictEqual(held.calls, []);

  const missed = transport({ note: { ok: false, status: 500, data: {} } });
  const turn0 = await handoff.commit({
    decision: decision(handoff.FIXED_MESSAGES.ar),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: 'c-note-land',
    parts: [],
    conversation: { id: 'c-note-land', admin_assignee_id: 'seat-a' },
    progress: {},
    transport: missed,
  });
  assert.strictEqual(turn0.sent, false);
  assert.strictEqual(turn0.progress.noteAmbiguous, true);
  assert.strictEqual(store.latestOwedFixedLine('c-note-land', 'seat-a').message, handoff.FIXED_MESSAGES.ar);
  assert.deepStrictEqual(missed.calls.map((c) => c.op), ['note']);

  const next = transport({
    assign: { ok: true, status: 200, data: { id: 'c-note-land', type: 'conversation', admin_assignee_id: 'human-7' } },
  });
  const turn1 = await handoff.commit({
    decision: { action: 'fixed_message', message: FIXED, language: 'en' },
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: 'c-note-land',
    parts: [],
    conversation: { id: 'c-note-land', admin_assignee_id: 'seat-a' },
    progress: turn0.progress,
    recheckHold: true,
    transport: next,
  });
  assert.strictEqual(turn1.sent, true);
  assert.deepStrictEqual(next.calls.map((c) => c.op), ['note', 'assign', 'message']);
  assert.strictEqual(next.calls.find((c) => c.op === 'message').body, handoff.FIXED_MESSAGES.ar);
  assert.notStrictEqual(next.calls.find((c) => c.op === 'message').body, 'A teammate can help with that.');

  const src = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  const recovery = src.indexOf('FIXED_MESSAGE_HANDOFF_R3:recovery');
  const window = src.slice(recovery - 400, recovery + 200);
  assert.ok(window.includes('noteAmbiguous'));
}));

tests.push(test('a public percent must be verbatim in evidence and bound to the same concept', () => {
  assert.deepStrictEqual(policy.unsupportedPublicFigures('The daily drawdown is 99%.', EVIDENCE), ['99%']);
  assert.deepStrictEqual(policy.unsupportedPublicFigures('The daily drawdown is 5%.', EVIDENCE), []);
  assert.deepStrictEqual(policy.unsupportedPublicFigures('The daily drawdown is 3%.', EVIDENCE), []);
  assert.deepStrictEqual(policy.unsupportedPublicFigures('The daily drawdown is 8%.', EVIDENCE), ['8%']);
  assert.deepStrictEqual(policy.unsupportedPublicFigures('The max drawdown is 8%.', EVIDENCE), []);
  assert.ok(policy.unsupportedPolicyNumbers('The daily drawdown is 99%.', EVIDENCE, []).includes('99%'));
  const src = fs.readFileSync(path.join(__dirname, '../../02_statePresend/policyEvidence.js'), 'utf8');
  assert.ok(src.includes('daily drawdown'));
  assert.ok(src.includes('unsupportedPublicFigures'));
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
