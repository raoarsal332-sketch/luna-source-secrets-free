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
    assert.strictEqual(decision.language, 'ur', text);
    assert.strictEqual(decision.message, handoff.FIXED_MESSAGES.ur, text);
  }

  const arabic = welcome('أريد التحدث مع الموظفين');
  assert.strictEqual(handoff.detectLanguage('أريد التحدث مع الموظفين'), 'ar');
  assert.strictEqual(arabic.action, 'fixed_message');
  assert.strictEqual(arabic.language, 'ar');
  assert.strictEqual(arabic.message, handoff.FIXED_MESSAGES.ar);

  for (const text of ['मुझे प्रतिनिधियों से बात करनी है', 'मुझे एजेंटों से बात करनी है']) {
    const decision = welcome(text);
    assert.strictEqual(handoff.detectLanguage(text), 'hi', text);
    assert.strictEqual(decision.action, 'fixed_message', text);
    assert.strictEqual(decision.language, 'hi', text);
    assert.strictEqual(decision.message, handoff.FIXED_MESSAGES.hi, text);
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

tests.push(test('every fixed line matches its approved bytes', () => {
  const fixedHex = {
    en: '41207465616d6d617465206e6f7720686173207468697320636f6e766572736174696f6e2e',
    ur: 'db8cdb8120daafd981d8aadaafd98820d8a7d8a820d8a7db8cdaa920d8b3d8a7d8aadabedb8c20daa9db9220d9bed8a7d8b320db81db92db94',
    ar: 'd987d8b0d98720d8a7d984d985d8add8a7d8afd8abd8a920d8a7d984d8a2d98620d984d8afd98920d8a3d8add8af20d8a7d984d8b2d985d984d8a7d8a12e',
    hi: 'e0a4afe0a4b920e0a4ace0a4bee0a4a4e0a49ae0a580e0a4a420e0a485e0a4ac20e0a48fe0a49520e0a4b8e0a4bee0a4a5e0a58020e0a495e0a58720e0a4aae0a4bee0a4b820e0a4b9e0a588e0a5a4',
    it: '556e20636f6c6c656761206861206f72612071756573746120636f6e76657273617a696f6e652e',
  };
  for (const lang of Object.keys(fixedHex)) {
    const actual = Buffer.from(handoff.FIXED_MESSAGES[lang]);
    const expected = Buffer.from(fixedHex[lang], 'hex');
    assert.strictEqual(Buffer.compare(actual, expected), 0, lang);
  }
  const accountHex = {
    en: '466f72204d54352c20746865206163636f756e74206e756d62657220697320696e2074686520656d61696c2074686174207761732073656e742077697468207468652074726164696e67206c6f67696e2e2054686f73652064657461696c732063616e6e6f74206265206368616e6765642e',
    ur: '4d543520d9bed8b120d8a7daa9d8a7d8a4d986d9b920d986d985d8a8d8b120d8a7d8b320d8a7db8c20d985db8cd98420d985db8cdaba20db81db9220d8acd98820d9b9d8b1db8cda88d986daaf20d984d8a7daaf20d8a7d990d98620daa9db9220d8b3d8a7d8aadabe20d8a8dabedb8cd8acdb8c20daafd8a6db8c20d8aadabedb8cdb9420db8cdb8120d8aad981d8b5db8cd984d8a7d8aa20d8aad8a8d8afdb8cd98420d986db81db8cdaba20db81d988d8aadb8cdabadb94',
    ar: 'd981d98a204d5435d88c20d8b1d982d98520d8a7d984d8add8b3d8a7d8a820d985d988d8acd988d8af20d981d98a20d8a7d984d8a8d8b1d98ad8af20d8a7d984d8b0d98a20d8a3d98fd8b1d8b3d98420d985d8b920d8a8d98ad8a7d986d8a7d8aa20d8a7d984d8afd8aed988d9842e20d987d8b0d98720d8a7d984d8aad981d8a7d8b5d98ad98420d984d8a720d8aad98fd8bad98ad98ed991d8b12e',
    hi: '4d543520e0a4aae0a4b020e0a496e0a4bee0a4a4e0a4be20e0a4a8e0a482e0a4ace0a4b020e0a489e0a4b820e0a488e0a4aee0a587e0a4b220e0a4aee0a587e0a48220e0a4b9e0a58820e0a49ce0a58b20e0a49fe0a58de0a4b0e0a587e0a4a1e0a4bfe0a482e0a49720e0a4b2e0a589e0a497e0a4bfe0a4a820e0a495e0a58720e0a4b8e0a4bee0a4a520e0a4ade0a587e0a49ce0a58020e0a497e0a48820e0a4a5e0a580e0a5a420e0a4afe0a58720e0a4b5e0a4bfe0a4b5e0a4b0e0a4a320e0a4ace0a4a6e0a4b2e0a58720e0a4a8e0a4b9e0a580e0a48220e0a49ce0a4bee0a4a4e0a587e0a5a4',
    it: '5375204d543520696c206e756d65726f20646920636f6e746f20c3a8206e656c6c27656d61696c20696e766961746120636f6e20692064617469206469206163636573736f2e205175657374692064617469206e6f6e2073692063616d6269616e6f2e',
    hinglish: '4d543520706172206163636f756e74206e756d62657220757320656d61696c206d65696e20686169206a6f2074726164696e67206c6f67696e206b652073617468206268656a692067617969207468692e205965682064657461696c73206368616e6765206e61686920686f74692e',
  };
  for (const lang of Object.keys(accountHex)) {
    const actual = Buffer.from(handoff.ACCOUNT_QUESTION_LINES[lang]);
    const expected = Buffer.from(accountHex[lang], 'hex');
    assert.strictEqual(Buffer.compare(actual, expected), 0, lang);
  }
  const built = 'في MT5، رقم الحساب موجود في البريد الذي أُرسل مع بيانات الدخول. هذه التفاصيل لا تُغي' + '\u064E\u0651' + 'ر.';
  const oldOrder = 'في MT5، رقم الحساب موجود في البريد الذي أُرسل مع بيانات الدخول. هذه التفاصيل لا تُغي' + '\u0651\u064E' + 'ر.';
  assert.strictEqual(Buffer.compare(Buffer.from(handoff.ACCOUNT_QUESTION_LINES.ar), Buffer.from(built)), 0);
  assert.notStrictEqual(Buffer.compare(Buffer.from(handoff.ACCOUNT_QUESTION_LINES.ar), Buffer.from(oldOrder)), 0);
  assert.strictEqual(handoff.ACCOUNT_QUESTION_LINES.ar.normalize('NFC'), handoff.ACCOUNT_QUESTION_LINES.ar);
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
