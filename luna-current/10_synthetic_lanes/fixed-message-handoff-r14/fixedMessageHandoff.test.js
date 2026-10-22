'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const presendPath = path.resolve(__dirname, '../../02_statePresend/presendMega.js');
require.cache[presendPath] = {
  id: presendPath,
  filename: presendPath,
  loaded: true,
  exports: {
    HARD: {
      MISSED_QUESTION: 'MISSED_QUESTION',
      UNSUPPORTED_NUMBER: 'UNSUPPORTED_NUMBER',
      MISSED_ESCALATION: 'MISSED_ESCALATION',
    },
    loadGuards() {
      return {};
    },
    validate() {
      return { ok: false, hardFails: [{ code: 'MISSED_QUESTION' }], softWarnings: [], correctionInstruction: 'answer' };
    },
  },
};

process.env.LUNA_OP_STORE_FILE = path.join(os.tmpdir(), 'luna-r14-ops-' + process.pid + '.json');
try { fs.unlinkSync(process.env.LUNA_OP_STORE_FILE); } catch (_) { /* fresh store */ }

const handoff = require('../../01_runtime/fixedMessageHandoff');
const store = require('../../01_runtime/writeOpStore');
const regen = require('../../02_statePresend/targetedRegeneration');

const FIXED = handoff.FIXED_MESSAGES.en;
const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const OWN = {
  arsalId: 'seat-a',
  eliteAiId: 'seat-e',
  riskTeamId: 'risk-1',
  escalationsTeamId: 'esc-1',
};
const CLARIFIERS = [
  'Please tell me which challenge you mean.',
  'Which challenge do you mean?',
];
const PASSWORDS = [
  'what is the password policy?',
  'what are the password requirements?',
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

function fixedDecision(message) {
  return {
    action: 'fixed_message',
    silent: false,
    route: null,
    reason: 'fixed_handoff',
    language: 'en',
    message: message || FIXED,
  };
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

function decide(text, extra) {
  return handoff.decide(Object.assign({
    path: 'welcome',
    latestText: text,
    parts: [],
    full: { admin_assignee_id: 'seat-a', team_assignee_id: '0' },
    botId: 'seat-a',
    ownershipOpts: OWN,
  }, extra || {}));
}

function assignmentPart(at, authorId) {
  return {
    part_type: 'assignment',
    created_at: at,
    author: authorId ? { id: authorId, type: 'admin' } : {},
    assigned_to: { id: 'human-7' },
    body: '',
  };
}

function notePart() {
  return {
    part_type: 'note',
    author: { id: 'seat-a', type: 'admin' },
    body: 'Account: 1 Problem: x',
  };
}

tests.push(test('Urdu lexical cues select the Urdu line on Arabic-script text', () => {
  for (const text of ['بات آدمی', 'ملاؤ آدمی']) {
    assert.strictEqual(handoff.detectLanguage(text), 'ur', text);
    const result = decide(text);
    assert.strictEqual(result.action, 'fixed_message', text);
    assert.strictEqual(result.language, 'ur', text);
    assert.strictEqual(result.message, handoff.FIXED_MESSAGES.ur, text);
    assert.notStrictEqual(result.message, handoff.FIXED_MESSAGES.ar, text);
  }
  const arabic = decide('أريد التحدث مع موظف');
  assert.strictEqual(handoff.detectLanguage('أريد التحدث مع موظف'), 'ar');
  assert.strictEqual(arabic.action, 'fixed_message');
  assert.strictEqual(arabic.language, 'ar');
  assert.strictEqual(arabic.message, handoff.FIXED_MESSAGES.ar);
}));

tests.push(test('short Roman agent sentences follow the actual language', () => {
  for (const text of ['agent', 'live agent please', 'agent please', 'please get me a human']) {
    const result = decide(text);
    assert.strictEqual(handoff.detectLanguage(text), 'en', text);
    assert.strictEqual(result.action, 'fixed_message', text);
    assert.strictEqual(result.message, handoff.FIXED_MESSAGES.en, text);
  }
  for (const text of ['agent chahiye', 'agent se baat karo']) {
    const result = decide(text);
    assert.strictEqual(handoff.detectLanguage(text), 'hinglish', text);
    assert.strictEqual(result.action, 'fixed_message', text);
    assert.strictEqual(result.language, 'ur', text);
    assert.strictEqual(result.message, handoff.FIXED_MESSAGES.ur, text);
  }
  const italian = decide('voglio un operatore');
  assert.strictEqual(italian.message, handoff.FIXED_MESSAGES.it);
}));

tests.push(test('a welcome route_normal FAQ is not forced on a non-welcome path', () => {
  for (const pathName of ['welcome', 'main_escalate', 'missed_escalation', 'recovery', 'presend_escalate']) {
    const result = decide('ما هي قواعد السحب؟', { path: pathName, force: pathName !== 'welcome' });
    assert.strictEqual(result.action, 'route_normal', pathName);
    assert.strictEqual(result.reason, 'not_handoff', pathName);
    assert.strictEqual(result.message, null, pathName);
    assert.strictEqual(handoff.isPureLiveAgentAsk('ما هي قواعد السحب؟'), false);
  }
  const hi = decide('hi', {
    path: 'recovery',
    force: true,
    full: { admin_assignee_id: 'human-7' },
    handoffAssigneeId: 'human-7',
    ownershipOpts: Object.assign({ handoffAssigneeId: 'human-7' }, OWN),
  });
  assert.strictEqual(hi.action, 'fixed_message');
  assert.strictEqual(hi.message, FIXED);
  const supplied = decide('my account number is 189143', { path: 'main_escalate', force: true });
  assert.strictEqual(supplied.action, 'fixed_message');
  assert.strictEqual(supplied.message, FIXED);
}));

tests.push(test('clarifiers and password-policy questions are not a hedge or a handoff', () => {
  for (const text of CLARIFIERS.concat(PASSWORDS)) {
    for (const pathName of ['welcome', 'main_escalate', 'missed_escalation']) {
      const result = decide(text, { path: pathName, force: pathName !== 'welcome' });
      assert.strictEqual(result.action, 'route_normal', pathName + ' ' + text);
      assert.strictEqual(result.message, null, text);
    }
    assert.notStrictEqual(text, HEDGE);
    assert.strictEqual(Object.values(handoff.FIXED_MESSAGES).includes(text), false, text);
    assert.strictEqual(handoff.isStructuralHandoffAsk(text), false, text);
    assert.strictEqual(handoff.isTerminalHedge(text), false, text);
  }
  for (const text of CLARIFIERS) {
    assert.strictEqual(handoff.isLegitimateClarification(text), true, text);
    const kept = regen.safeFallback(text, { hardFails: [{ code: 'UNSUPPORTED_NUMBER' }] }, {
      ctx: { assigneeId: 'seat-a', botIds: ['seat-a'], state: { last_client_message: text } },
    });
    assert.strictEqual(kept.body, text);
    assert.strictEqual(kept.reason, 'challenge-clarifier');
    assert.notStrictEqual(kept.body, HEDGE);
    assert.notStrictEqual(kept.body, FIXED);
  }
  for (const text of PASSWORDS) {
    assert.strictEqual(handoff.isPasswordPolicyQuestion(text), true, text);
    const held = regen.safeFallback(text, { hardFails: [{ code: 'MISSED_QUESTION' }] }, {
      ctx: { assigneeId: 'seat-a', botIds: ['seat-a'], state: { last_client_message: text } },
    });
    assert.notStrictEqual(held.body, HEDGE, text);
    assert.notStrictEqual(held.body, FIXED, text);
    assert.strictEqual(Object.values(handoff.FIXED_MESSAGES).includes(held.body), false, text);
  }
}));

tests.push(test('the owed line is stored before assignment and posted once after the seat lands', async () => {
  const first = transport({
    assign() {
      const rec = store.latestOwedFixedLine('c-owed', 'seat-a');
      assert.ok(rec, 'owed record exists before assign returns');
      assert.strictEqual(rec.message, FIXED);
      assert.strictEqual(rec.messageSent, false);
      assert.strictEqual(rec.assigneeId, 'human-7');
      assert.ok(rec.idempotencyKey);
      return { ok: true, status: 200, data: { id: 'c-owed', type: 'conversation', admin_assignee_id: 'human-7' } };
    },
  });
  const started = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: 'c-owed',
    parts: [],
    conversation: { id: 'c-owed', admin_assignee_id: 'seat-a' },
    progress: {},
    transport: first,
  });
  assert.strictEqual(started.sent, true);
  assert.deepStrictEqual(first.calls.map((c) => c.op), ['note', 'assign', 'message']);
  assert.strictEqual(store.latestOwedFixedLine('c-owed', 'seat-a'), null);

  const again = store.rememberOwedFixedLine({
    conversationId: 'c-owed',
    madeBy: 'seat-a',
    assigneeId: 'human-7',
    message: FIXED,
  });
  assert.strictEqual(again.messageSent, true);
}));

tests.push(test('a landed owed seat is not treated as human-owned', () => {
  const parts = [
    { part_type: 'comment', author: { type: 'user', id: 'u' }, body: 'بات آدمی', created_at: 1 },
    assignmentPart(2, 'seat-a'),
  ];
  const faq = decide('ما هي قواعد السحب؟', {
    path: 'main_escalate',
    force: true,
    parts,
    full: { id: 'c-landed', admin_assignee_id: 'human-7' },
    conversationId: 'c-landed',
  });
  assert.strictEqual(faq.action, 'fixed_message');
  assert.notStrictEqual(faq.reason, 'human_assignee');
  assert.strictEqual(faq.message, handoff.FIXED_MESSAGES.ur);
  const human = parts.concat([{
    part_type: 'comment',
    created_at: 3,
    author: { id: 'human-1', type: 'admin' },
    body: 'I have this conversation now',
  }]);
  const quiet = decide('thanks', {
    parts: human,
    full: { admin_assignee_id: 'human-7' },
  });
  assert.strictEqual(quiet.action, 'silence');
}));

tests.push(test('a wiped op store still owes the line from parts, including a removed note', async () => {
  const parts = [assignmentPart(4, 'seat-a')];
  const derived = handoff.owedFixedLineFromParts(parts, 'seat-a', OWN);
  assert.strictEqual(derived.owed, true);
  assert.strictEqual(derived.assigneeId, 'human-7');
  assert.strictEqual(derived.humanSince, false);
  const missingAuthor = handoff.owedFixedLineFromParts([assignmentPart(4, '')], 'seat-a', OWN);
  assert.strictEqual(missingAuthor.owed, true);
  const t = transport();
  const sent = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: 'c-wiped',
    parts,
    conversation: { id: 'c-wiped', admin_assignee_id: 'human-7' },
    progress: {},
    transport: t,
  });
  assert.strictEqual(sent.sent, true);
  assert.ok(t.calls.some((c) => c.op === 'message' && c.body === FIXED));
  assert.strictEqual(t.calls.filter((c) => c.op === 'message').length, 1);

  const removed = transport();
  const resumed = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: 'c-removed-note',
    parts: [assignmentPart(4, 'seat-a')],
    conversation: { id: 'c-removed-note', admin_assignee_id: 'human-7' },
    progress: { noteConfirmed: true, assignConfirmed: true, assigneeId: 'human-7', messageSent: false },
    transport: removed,
  });
  assert.strictEqual(resumed.sent, true);
  assert.deepStrictEqual(removed.calls.map((c) => c.op), ['note', 'message']);
  assert.strictEqual(removed.calls[1].body, FIXED);
}));

tests.push(test('comment 422, 429, 500, and timeout still post the owed line once', async () => {
  for (const reason of ['422', '429', '500', 'timeout']) {
    const id = 'c-comment-' + reason;
    const failSpec = reason === 'timeout'
      ? { ok: false, status: 0, timedOut: true }
      : { ok: false, status: Number(reason), data: {} };
    const failed = transport({ message: failSpec });
    const first = await handoff.commit({
      decision: fixedDecision(),
      noteHtml: 'Account: 1<br>Problem: x',
      assigneeId: 'human-7',
      botId: 'seat-a',
      conversationId: id,
      parts: [notePart()],
      conversation: { id, admin_assignee_id: 'human-7' },
      progress: { noteConfirmed: true, assignConfirmed: true, assigneeId: 'human-7' },
      transport: failed,
    });
    assert.strictEqual(first.sent, false, reason);
    assert.strictEqual(first.reason, 'message_' + reason, reason);
    assert.strictEqual(first.progress.messageAmbiguous, false, reason);
    assert.strictEqual(first.progress.commentRejected, reason, reason);
    assert.deepStrictEqual(failed.calls.map((c) => c.op), ['message'], reason);
    const owed = store.latestOwedFixedLine(id, 'seat-a');
    assert.ok(owed && owed.message === FIXED && owed.messageSent === false, reason);

    const retry = transport();
    const second = await handoff.commit({
      decision: fixedDecision(),
      noteHtml: 'Account: 1<br>Problem: x',
      assigneeId: 'human-7',
      botId: 'seat-a',
      conversationId: id,
      parts: [notePart()],
      conversation: { id, admin_assignee_id: 'human-7' },
      progress: first.progress,
      recheckHold: true,
      transport: retry,
    });
    assert.strictEqual(second.sent, true, reason);
    assert.deepStrictEqual(retry.calls.map((c) => c.op), ['message'], reason);
    assert.strictEqual(retry.calls[0].body, FIXED, reason);
    assert.strictEqual(store.latestOwedFixedLine(id, 'seat-a'), null, reason);

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
      transport: duplicate,
    });
    assert.deepStrictEqual(duplicate.calls, [], reason);
    assert.strictEqual(third.reason, 'already_sent', reason);
  }
}));

tests.push(test('assignment and note timeouts stay unknown and a landed write continues', async () => {
  const assignKey = store.opKey('post', 'https://api.intercom.io/conversations/c-unknown/reply', {
    message_type: 'assignment',
    type: 'admin',
    admin_id: 'seat-a',
    assignee_id: 7,
  });
  store.set(assignKey, { status: 'unknown', kind: 'assignment' });
  assert.strictEqual(store.shouldSkipReplay(store.get(assignKey)), true);
  const commentKey = store.opKey('post', 'https://api.intercom.io/conversations/c-unknown/reply', {
    message_type: 'comment',
    type: 'admin',
    admin_id: 'seat-a',
    body: FIXED,
  });
  store.set(commentKey, { status: 'unknown' });
  assert.strictEqual(store.releaseUnknownReply('c-unknown', 'comment', FIXED, 'seat-a'), true);
  assert.strictEqual(store.get(commentKey), null);
  assert.strictEqual(store.get(assignKey).status, 'unknown');
  assert.strictEqual(store.releaseUnknownReply('c-unknown', 'note', 'Account: 1', 'seat-a'), false);

  const timed = transport({ assign: { ok: false, status: 0, timedOut: true } });
  const first = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: 'c-assign-timeout',
    parts: [],
    conversation: { id: 'c-assign-timeout', admin_assignee_id: 'seat-a' },
    progress: {},
    transport: timed,
  });
  assert.strictEqual(first.sent, false);
  assert.strictEqual(first.progress.assignAmbiguous, true);
  assert.notStrictEqual(first.progress.phase, 'assignment-pending');
  assert.ok(store.latestOwedFixedLine('c-assign-timeout', 'seat-a'));

  const held = transport();
  const replay = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: 'c-assign-timeout',
    parts: [notePart()],
    conversation: { id: 'c-assign-timeout', admin_assignee_id: 'seat-a' },
    progress: first.progress,
    transport: held,
  });
  assert.deepStrictEqual(held.calls, []);
  assert.strictEqual(replay.reason, 'assign_ambiguous_held');

  const landed = transport();
  const posted = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: 'c-assign-timeout',
    parts: [notePart(), assignmentPart(8, 'seat-a')],
    conversation: { id: 'c-assign-timeout', admin_assignee_id: 'human-7' },
    progress: first.progress,
    recheckHold: true,
    transport: landed,
  });
  assert.deepStrictEqual(landed.calls.map((c) => c.op), ['message']);
  assert.strictEqual(posted.sent, true);
  assert.strictEqual(landed.calls[0].body, FIXED);

  const noteHeld = transport();
  const noteTimeout = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: 'c-note-timeout',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: { noteAmbiguous: true },
    transport: noteHeld,
  });
  assert.deepStrictEqual(noteTimeout && noteHeld.calls, []);
  assert.strictEqual(noteTimeout.reason, 'note_ambiguous_held');

  const noteLanded = transport({ assign: { ok: true, status: 200, data: { admin_assignee_id: 'human-7' } } });
  const continued = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: 'c-note-landed',
    parts: [notePart()],
    conversation: { id: 'c-note-landed', admin_assignee_id: 'seat-a' },
    progress: { noteAmbiguous: true, assigneeId: 'human-7' },
    recheckHold: true,
    transport: noteLanded,
  });
  assert.strictEqual(continued.sent, true);
  assert.ok(noteLanded.calls.some((c) => c.op === 'message'));
  assert.strictEqual(noteLanded.calls.filter((c) => c.op === 'note').length, 0);
}));

tests.push(test('runtime source keeps the owed line on the recovery path', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  const own = src.indexOf('FIXED_MESSAGE_HANDOFF_R4:ownership_before_hook_a');
  const silent = src.indexOf('if (owned.silent || humanCommented || foreignOwner)', own);
  const early = src.slice(own, silent);
  assert.ok(early.includes('activeOwedFixedLine'));
  assert.ok(early.includes('latestHandoffAssignment'));
  assert.ok(early.includes('resumeLostHandoff'));
  assert.strictEqual(early.includes('postClientCommentOnce'), false);
  assert.strictEqual(early.includes('deliverAccountQuestionAnswer'), false);
  const commitFn = src.slice(src.indexOf('async function commitFixedMessageHandoff'), src.indexOf('const handleWebhook'));
  assert.ok(commitFn.includes('conversationId,'));
  assert.ok(commitFn.includes('owedFixedLine: true'));
  assert.ok(commitFn.includes('requireLiveAssignee: true'));
  const post = src.slice(src.indexOf('async function postReply'), src.indexOf('async function postReply') + 900);
  assert.ok(post.includes('releaseUnknownReply'));
  const handoffSrc = fs.readFileSync(path.join(__dirname, '../../01_runtime/fixedMessageHandoff.js'), 'utf8');
  assert.ok(handoffSrc.includes('rememberOwedFixedLine'));
  assert.strictEqual(handoffSrc.includes('نمائندے'), false);
  assert.strictEqual(handoffSrc.includes('نمائندوں'), false);
}));

Promise.all(tests)
  .then(() => {
    try { fs.unlinkSync(process.env.LUNA_OP_STORE_FILE); } catch (_) { /* temp store */ }
    console.log('OK', passed, 'passed');
  })
  .catch((err) => {
    console.error('FAIL', err && err.stack || err);
    process.exit(1);
  });
