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
    HARD: { MISSED_QUESTION: 'MISSED_QUESTION', UNSUPPORTED_NUMBER: 'UNSUPPORTED_NUMBER' },
    loadGuards() {
      return {};
    },
    validate() {
      return { ok: false, hardFails: [{ code: 'MISSED_QUESTION' }], softWarnings: [], correctionInstruction: 'answer' };
    },
  },
};

process.env.LUNA_OP_STORE_FILE = path.join(os.tmpdir(), 'luna-r12-ops-' + process.pid + '.json');
try { fs.unlinkSync(process.env.LUNA_OP_STORE_FILE); } catch (_) { /* fresh store */ }

const handoff = require('../../01_runtime/fixedMessageHandoff');
const store = require('../../01_runtime/writeOpStore');
const statePresend = require('../../02_statePresend/statePresend');

const FIXED = handoff.FIXED_MESSAGES.en;
const CLARIFIER = 'Please tell me which challenge you mean.';

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

function indexSrc() {
  return fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
}

function handoffSrc() {
  return fs.readFileSync(path.join(__dirname, '../../01_runtime/fixedMessageHandoff.js'), 'utf8');
}

function fixedDecision() {
  return {
    action: 'fixed_message',
    silent: false,
    route: null,
    reason: 'fixed_handoff',
    language: 'en',
    message: FIXED,
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

function welcome(text) {
  return handoff.decide({ path: 'welcome', latestText: text, parts: [], botId: 'seat-a' });
}

tests.push(test('inflected Urdu, Arabic, and Hindi human requests match by stem', () => {
  const src = handoffSrc();
  const ur = src.slice(src.indexOf('ur: {'), src.indexOf('hi: {'));
  const ar = src.slice(src.indexOf('ar: {'), src.indexOf('ur: {'));
  const hi = src.slice(src.indexOf('hi: {'), src.indexOf('en: {'));
  assert.ok(ur.includes('نمائندہ'));
  assert.strictEqual(ur.includes('نمائندے'), false);
  assert.strictEqual(ur.includes('نمائندوں'), false);
  assert.strictEqual(src.includes('نمائندے'), false);
  assert.strictEqual(src.includes('نمائندوں'), false);
  assert.strictEqual(ar.includes('الموظفين'), false);
  assert.strictEqual(hi.includes('प्रतिनिधियों'), false);
  assert.strictEqual(hi.includes('एजेंटों'), false);

  const urdu = [
    'مجھے نمائندے سے بات کرنی ہے',
    'نمائندوں سے بات کرنی ہے',
    'مجھے ایک نمائندہ چاہیے',
    'میں نمایندے سے بات کرنا چاہتا ہوں',
  ];
  for (const text of urdu) {
    const decision = welcome(text);
    assert.strictEqual(handoff.detectLanguage(text), 'ur', text);
    assert.strictEqual(handoff.isStructuralHandoffAsk(text), true, text);
    assert.strictEqual(decision.action, 'fixed_message', text);
    assert.strictEqual(decision.language, 'en', text);
    assert.strictEqual(decision.message, handoff.FIXED_MESSAGES.en, text);
  }

  const arabic = welcome('أريد التحدث مع الموظفين');
  assert.strictEqual(handoff.detectLanguage('أريد التحدث مع الموظفين'), 'ar');
  assert.strictEqual(arabic.action, 'fixed_message');
  assert.strictEqual(arabic.language, 'en');
  assert.strictEqual(arabic.message, handoff.FIXED_MESSAGES.en);

  for (const text of ['मुझे प्रतिनिधियों से बात करनी है', 'मुझे एजेंटों से बात करनी है']) {
    const decision = welcome(text);
    assert.strictEqual(handoff.detectLanguage(text), 'hi', text);
    assert.strictEqual(decision.action, 'fixed_message', text);
    assert.strictEqual(decision.language, 'en', text);
    assert.strictEqual(decision.message, handoff.FIXED_MESSAGES.en, text);
  }

  const withdrawal = welcome('ما هي قواعد السحب؟');
  assert.strictEqual(handoff.isStructuralHandoffAsk('ما هي قواعد السحب؟'), false);
  assert.strictEqual(withdrawal.action, 'route_normal');
  assert.strictEqual(welcome('please get me a human').message, FIXED);
}));

tests.push(test('error list or a wrong assignee is a retryable failure', async () => {
  const request = { message_type: 'assignment', assignee_id: 'human-7', admin_id: 'seat-a', type: 'admin' };
  const withErrors = store.classifyWriteOutcome(
    request,
    { id: 'conv-1', type: 'conversation', admin_assignee_id: 'human-7', errors: [{ code: 'partial' }] },
    200
  );
  assert.strictEqual(withErrors.confirm, false);
  assert.strictEqual(withErrors.unknown, false);
  assert.strictEqual(withErrors.reason, 'errors');
  const errorList = store.classifyWriteOutcome(
    { message_type: 'comment', type: 'admin', admin_id: 'seat-a' },
    { id: 'part-1', type: 'error.list' },
    200
  );
  assert.strictEqual(errorList.confirm, false);
  assert.strictEqual(errorList.unknown, false);
  store.set('errors', { status: 'failed', reason: 'errors', kind: 'assignment', conversationId: 'c1', assigneeId: 'human-7', madeBy: 'seat-a' });
  assert.strictEqual(store.shouldSkipReplay(store.get('errors')), false);
  assert.strictEqual(store.latestHandoffAssignment('c1', 'seat-a'), null);

  const unnamed = store.classifyWriteOutcome(request, { id: 'conv-1', type: 'conversation' }, 200);
  assert.strictEqual(unnamed.confirm, false);
  assert.strictEqual(unnamed.unknown, false);
  assert.strictEqual(unnamed.reason, 'assignee-unconfirmed');
  assert.strictEqual(store.shouldSkipReplay({ status: 'failed', reason: 'assignee-unconfirmed' }), false);

  const wrong = store.classifyWriteOutcome(request, { id: 'conv-1', type: 'conversation', admin_assignee_id: 'human-9' }, 200);
  assert.strictEqual(wrong.confirm, false);
  assert.strictEqual(wrong.unknown, false);
  assert.strictEqual(wrong.reason, 'wrong-assignee');

  const first = transport({
    assign: { ok: true, status: 200, data: { id: 'conv-1', type: 'conversation', admin_assignee_id: 'human-9', errors: [{ code: 'x' }] } },
  });
  const missed = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport: first,
  });
  assert.deepStrictEqual(first.calls.map((c) => c.op), ['note', 'assign']);
  assert.strictEqual(first.calls[1].id, 'human-7');
  assert.strictEqual(missed.sent, false);
  assert.strictEqual(missed.progress.assignConfirmed, false);
  assert.strictEqual(missed.progress.assignAmbiguous, false);
  assert.strictEqual(missed.progress.noteConfirmed, true);

  const second = transport({
    assign: { ok: true, status: 200, data: { admin_assignee_id: 'human-7' } },
  });
  const retried = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: missed.progress,
    transport: second,
  });
  assert.deepStrictEqual(second.calls.map((c) => c.op), ['assign', 'message']);
  assert.strictEqual(second.calls[0].id, 'human-7');
  assert.strictEqual(retried.sent, true);
  assert.strictEqual(second.calls.filter((c) => c.op === 'message').length, 1);
  assert.strictEqual(second.calls[1].body, FIXED);
}));

tests.push(test('a live bot assignee does not get the fixed line', async () => {
  const note = {
    part_type: 'note',
    author: { id: 'seat-a', type: 'admin' },
    body: 'Account: 1<br>Problem: x',
  };
  const assignment = {
    part_type: 'assignment',
    assigned_to: { id: 'human-7' },
    author: { id: 'seat-a', type: 'admin' },
    body: '',
  };
  const blocked = transport({
    assign: { ok: true, status: 200, data: { id: 'c', type: 'conversation', admin_assignee_id: 'seat-a' } },
  });
  const withheld = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [note, assignment],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport: blocked,
  });
  assert.deepStrictEqual(blocked.calls.map((c) => c.op), ['assign']);
  assert.strictEqual(blocked.calls.some((c) => c.op === 'message'), false);
  assert.strictEqual(withheld.sent, false);
  assert.strictEqual(withheld.progress.messageSent, false);
  assert.strictEqual(withheld.progress.assignConfirmed, false);
  assert.strictEqual(withheld.progress.assignAmbiguous, false);

  const verified = transport({
    assign: { ok: true, status: 200, data: { id: 'c', type: 'conversation', admin_assignee_id: 'human-7' } },
  });
  const posted = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [note, assignment],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: withheld.progress,
    transport: verified,
  });
  assert.strictEqual(posted.sent, true);
  assert.strictEqual(verified.calls.filter((c) => c.op === 'message').length, 1);
  assert.strictEqual(verified.calls.find((c) => c.op === 'message').body, FIXED);

  const strict = transport();
  const stillBot = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    botIds: ['seat-a', 'seat-e'],
    requireLiveAssignee: true,
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport: strict,
  });
  assert.deepStrictEqual(strict.calls.map((c) => c.op), ['note', 'assign']);
  assert.strictEqual(stillBot.sent, false);
  assert.strictEqual(stillBot.reason, 'assignee_still_bot');
  assert.strictEqual(stillBot.progress.assignConfirmed, false);
  assert.strictEqual(stillBot.progress.messageAmbiguous, false);

  const held = transport();
  const finished = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    requireLiveAssignee: true,
    parts: [],
    conversation: { admin_assignee_id: 'human-7' },
    progress: stillBot.progress,
    transport: held,
  });
  assert.deepStrictEqual(held.calls.map((c) => c.op), ['note', 'message']);
  assert.strictEqual(finished.sent, true);
  assert.strictEqual(held.calls.filter((c) => c.op === 'message').length, 1);
  assert.strictEqual(held.calls[1].body, FIXED);

  const fn = indexSrc();
  const commitAt = fn.indexOf('async function commitFixedMessageHandoff');
  const webhookAt = fn.indexOf('const handleWebhook');
  const body = fn.slice(commitAt, webhookAt);
  assert.ok(body.includes('requireLiveAssignee: true'));
  assert.ok(body.includes('fetchConversation'));
  assert.ok(body.includes('assignee_still_bot'));
  assert.ok(body.includes('invalidateHandoffAssignment'));
  const own = fn.indexOf('FIXED_MESSAGE_HANDOFF_R4:ownership_before_hook_a');
  const silent = fn.indexOf('if (owned.silent || humanCommented || foreignOwner)', own);
  const early = fn.slice(own, silent);
  assert.strictEqual(early.includes('postClientCommentOnce'), false);
  assert.strictEqual(early.includes('deliverAccountQuestionAnswer'), false);
}));

tests.push(test('a 422 on the customer comment resumes after the note is removed', async () => {
  const opRecord = {
    status: 'confirmed',
    kind: 'assignment',
    conversationId: 'c1',
    assigneeId: 'human-7',
    madeBy: 'seat-a',
  };
  store.set('seat', opRecord);
  const rejected = transport({
    message: { ok: false, data: { type: 'error.list', errors: [{ code: 'parameter_invalid', status: 422 }] } },
  });
  const first = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'human-7' },
    progress: {},
    transport: rejected,
  });
  assert.deepStrictEqual(rejected.calls.map((c) => c.op), ['note', 'message']);
  assert.strictEqual(first.sent, false);
  assert.strictEqual(first.reason, 'message_422');
  assert.strictEqual(first.progress.commentRejected, '422');
  assert.strictEqual(first.progress.messageAmbiguous, false);
  assert.strictEqual(first.progress.messageSent, false);
  assert.strictEqual(first.progress.assignConfirmed, true);
  assert.strictEqual(first.progress.noteConfirmed, true);

  const stuck = Object.assign({}, first.progress, { messageAmbiguous: true });
  const resumed = handoff.resumeLostHandoff({
    progress: stuck,
    parts: [],
    conversation: { admin_assignee_id: 'human-7' },
    botId: 'seat-a',
    opRecord: store.latestHandoffAssignment('c1', 'seat-a'),
  });
  assert.strictEqual(resumed.resume, true);
  assert.strictEqual(resumed.hold, false);
  assert.strictEqual(resumed.reason, 'op_assignment');
  assert.strictEqual(resumed.assigneeId, 'human-7');
  assert.notStrictEqual(resumed.reason, 'ambiguous_held');

  const held = handoff.resumeLostHandoff({
    progress: stuck,
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    botId: 'seat-a',
    opRecord,
  });
  assert.strictEqual(held.resume, true);
  assert.strictEqual(held.hold, true);
  assert.strictEqual(held.reason, 'assignment_unverified');
  assert.strictEqual(held.assigneeId, 'human-7');

  const again = transport();
  const done = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'human-7' },
    progress: first.progress,
    transport: again,
  });
  assert.deepStrictEqual(again.calls.map((c) => c.op), ['note', 'message']);
  assert.strictEqual(done.sent, true);
  assert.strictEqual(again.calls.filter((c) => c.op === 'message').length, 1);
  assert.strictEqual(again.calls[1].body, FIXED);

  const quiet = transport();
  const duplicate = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [{ part_type: 'comment', author: { id: 'seat-a', type: 'admin' }, body: FIXED }],
    conversation: { admin_assignee_id: 'human-7' },
    progress: done.progress,
    transport: quiet,
  });
  assert.deepStrictEqual(quiet.calls, []);
  assert.strictEqual(duplicate.reason, 'already_sent');
  assert.strictEqual(duplicate.sent, false);
}));

tests.push(test('an empty clarifier result is posted and does not throw', async () => {
  const out = await statePresend.gate({
    conversationId: 'c-r12',
    draft: CLARIFIER,
    latestUser: { id: 'u1', body: 'What is the daily loss limit?' },
    history: [],
  });
  assert.strictEqual(out.send, true);
  assert.strictEqual(out.body, CLARIFIER);
  assert.notStrictEqual(out.reason, 'error-fail-closed');
  assert.notStrictEqual(out.body, "I can't confirm that figure from the approved details, so I won't guess a number.");
  assert.notStrictEqual(out.body, FIXED);
}));

tests.push(test('the only approved customer lines are the English bytes', () => {
  const fixedHex = '41207465616d6d617465206e6f7720686173207468697320636f6e766572736174696f6e2e';
  const accountHex = '466f72204d54352c20746865206163636f756e74206e756d62657220697320696e2074686520656d61696c2074686174207761732073656e742077697468207468652074726164696e67206c6f67696e2e2054686f73652064657461696c732063616e6e6f74206265206368616e6765642e';
  assert.deepStrictEqual(Object.keys(handoff.FIXED_MESSAGES), ['en']);
  assert.deepStrictEqual(Object.keys(handoff.ACCOUNT_QUESTION_LINES), ['en']);
  assert.strictEqual(Buffer.compare(Buffer.from(handoff.FIXED_MESSAGES.en), Buffer.from(fixedHex, 'hex')), 0);
  assert.strictEqual(Buffer.compare(Buffer.from(handoff.ACCOUNT_QUESTION_LINES.en), Buffer.from(accountHex, 'hex')), 0);
  assert.strictEqual(handoff.fixedMessageFor('ur'), handoff.FIXED_MESSAGES.en);
  assert.strictEqual(handoff.fixedMessageFor('ar'), handoff.FIXED_MESSAGES.en);
  assert.strictEqual(handoff.fixedMessageFor('hi'), handoff.FIXED_MESSAGES.en);
  assert.strictEqual(handoff.fixedMessageFor('it'), handoff.FIXED_MESSAGES.en);
  assert.strictEqual(handoff.fixedMessageFor('hinglish'), handoff.FIXED_MESSAGES.en);
  assert.strictEqual(handoff.accountQuestionCustomerLine('مجھے اکاؤنٹ نمبر چاہیے', ''), handoff.ACCOUNT_QUESTION_LINES.en);
  assert.strictEqual(handoff.accountQuestionCustomerLine('numero di conto', ''), handoff.ACCOUNT_QUESTION_LINES.en);
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
