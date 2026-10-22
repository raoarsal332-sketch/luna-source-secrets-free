'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const handoff = require('../../01_runtime/fixedMessageHandoff');
const sanitizer = require('../../02_statePresend/credentialSanitizer');

const presendPath = path.resolve(__dirname, '../../02_statePresend/presendMega.js');
require.cache[presendPath] = {
  id: presendPath,
  filename: presendPath,
  loaded: true,
  exports: {
    HARD: {
      DUPLICATE_REPLY: 'DUPLICATE_REPLY',
      SEMANTIC_REPEAT: 'SEMANTIC_REPEAT',
      REPEATED_IMAGE_ASK: 'REPEATED_IMAGE_ASK',
      IMAGE_UNAVAILABLE_CLAIM: 'IMAGE_UNAVAILABLE_CLAIM',
      MISSED_ESCALATION: 'MISSED_ESCALATION',
      MISSED_QUESTION: 'MISSED_QUESTION',
      WRONG_TOPIC: 'WRONG_TOPIC',
      UNSUPPORTED_NUMBER: 'UNSUPPORTED_NUMBER',
      FORBIDDEN_DIAGNOSTIC_ACTION: 'FORBIDDEN_DIAGNOSTIC_ACTION',
      UNSUPPORTED_PROMISE: 'UNSUPPORTED_PROMISE',
    },
    validate() {
      return { ok: false, hardFails: [] };
    },
  },
};
const targeted = require('../../02_statePresend/targetedRegeneration');

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

const OWN = {
  arsalId: 'seat-a',
  eliteAiId: 'seat-e',
  riskTeamId: 'risk-1',
  escalationsTeamId: 'esc-1',
};

const CANARY = 'ZzCanary9';
const B64 = 'dGVzdFNlY3JldFZhbHVlMTIz';

function recordingTransport() {
  const calls = [];
  async function take(op, extra) {
    calls.push(Object.assign({ op }, extra));
    return { ok: true, status: 200, data: { id: 'conv-synthetic', type: 'conversation' } };
  }
  return {
    calls,
    postNote: (html) => take('note', { html }),
    assign: (assigneeId) => take('assign', { assigneeId }),
    postMessage: (body) => take('message', { body }),
  };
}

function fixedDecision() {
  return {
    action: 'fixed_message',
    language: 'en',
    message: handoff.FIXED_MESSAGES.en,
    reason: 'fixed_handoff',
  };
}

function decide(text, pathName) {
  return handoff.decide({
    path: pathName,
    latestText: text,
    parts: [],
    full: { admin_assignee_id: 'seat-a', team_assignee_id: '0' },
    botId: 'seat-a',
    force: pathName !== 'welcome',
    ownershipOpts: OWN,
  });
}

function assertAnswer(text) {
  const line = handoff.accountQuestionCustomerLine(text, '');
  assert.ok(line && String(line).trim().length >= 12, text);
  assert.strictEqual(Object.values(handoff.FIXED_MESSAGES).includes(line), false);
  assert.strictEqual(/\b(please\s+share|can you send|i['’]?ll\s+pass|pass it to a teammate)\b/i.test(line), false);
  assert.strictEqual(decide(text, 'welcome').action, 'route_normal');
  assert.strictEqual(decide(text, 'recovery').action, 'route_normal');
  assert.strictEqual(decide(text, 'main_escalate').action, 'route_normal');
  assert.strictEqual(decide(text, 'presend_escalate').action, 'route_normal');
  assert.strictEqual(decide(text, 'missed_escalation').action, 'route_normal');
}

tests.push(test('status stays the R3 candidate and is not approved', () => {
  assert.strictEqual(handoff.STATUS.candidate, 'fixed-message-handoff-r3');
  assert.strictEqual(handoff.STATUS.approved, false);
  assert.strictEqual(handoff.STATUS.release, false);
}));

tests.push(test('one sanitizer redacts multi-token, markup, Hindi labels, and repeated base64', () => {
  const samples = [
    "password's " + CANARY,
    'password’s ' + CANARY,
    'password is correct horse battery staple',
    'password is {correct horse}',
    'password&#58;<b>' + CANARY + '</b>',
    'पास वर्ड ' + CANARY,
    'गुप्तशब्द ' + CANARY,
    'कूटशब्द ' + CANARY,
    'संकेत शब्द ' + CANARY,
    'كلمة المرور ' + CANARY,
    'پاس ورڈ: ' + CANARY,
    'password is hunter2 and account 189143',
  ];
  for (const raw of samples) {
    const viaHandoff = handoff.redactCredentials(raw);
    const viaShared = sanitizer.sanitizeCredentials(raw);
    assert.strictEqual(viaHandoff, viaShared);
    assert.strictEqual(viaShared.includes(CANARY), false, raw);
    assert.strictEqual(viaShared.includes('hunter2'), false);
    assert.strictEqual(viaShared.includes('correct horse'), false);
    assert.strictEqual(sanitizer.sanitizeCredentials(viaShared), viaShared);
  }
  assert.strictEqual(handoff.redactCredentials('password is hunter2 and account 189143').includes('189143'), true);
  const repeated = sanitizer.sanitizeCredentials('see ' + B64 + ' and again ' + B64);
  assert.strictEqual(repeated.includes(B64), false);
  const once = 'prefix ' + B64 + ' suffix';
  assert.strictEqual(sanitizer.sanitizeCredentials(once).includes(B64), false);
  assert.strictEqual(handoff.redactCredentials('notes and comments use ' + CANARY).includes(CANARY), false);
}));

tests.push(test('a remembered secret is echo-blocked without a second label', () => {
  sanitizer.sanitizeCredentials('api key ' + CANARY);
  const echoed = handoff.redactCredentials('the value was ' + CANARY + ' in the reply');
  assert.strictEqual(echoed.includes(CANARY), false);
  assert.strictEqual(echoed.includes('189143'), false);
  const account = handoff.redactCredentials('account 189143 is unchanged');
  assert.strictEqual(account.includes('189143'), true);
}));

tests.push(test('account-number questions stay non-empty in every language, with or without a question mark', () => {
  const questions = [
    'what is my account number',
    'my account number?',
    'account number',
    'mera account number kya hai',
    'mera account number batao',
    'मेरा खाता नंबर क्या है',
    'मेरा खाता नंबर बताओ',
    'ما هو رقم الحساب',
    'رقم الحساب؟',
    'میرا اکاؤنٹ نمبر کیا ہے',
    'میرا اکاؤنٹ نمبر بتاؤ',
  ];
  for (const text of questions) assertAnswer(text);
  const supplied = decide('my account number is 189143', 'main_escalate');
  assert.strictEqual(supplied.action, 'fixed_message');
  assert.strictEqual(supplied.message, handoff.FIXED_MESSAGES.en);
  const usable = handoff.accountQuestionCustomerLine(
    'what is my account number',
    'The MT5 account number is in the login email. Those details cannot be changed.'
  );
  assert.strictEqual(usable.includes('login email'), true);
  const promise = handoff.accountQuestionCustomerLine(
    'what is my account number',
    "I'll pass it to a teammate once I have the account number."
  );
  assert.strictEqual(/pass it to a teammate/i.test(promise), false);
}));

tests.push(test('a cleared presend draft still answers an account-number question', () => {
  const answered = targeted.safeFallback('', { hardFails: [{ code: 'MISSED_ESCALATION' }] }, {
    ctx: { state: { last_client_message: 'mera account number kya hai' } },
  });
  assert.strictEqual(answered.send, true);
  assert.ok(answered.body && answered.body.trim());
  assert.strictEqual(Object.values(handoff.FIXED_MESSAGES).includes(answered.body), false);
  assert.strictEqual(/\b(please\s+share|i['’]?ll\s+pass)\b/i.test(answered.body), false);
  const needs = targeted.safeFallback('', { hardFails: [{ code: 'MISSED_QUESTION' }] }, {
    ctx: { state: { last_client_message: 'मेरा खाता नंबर बताओ' } },
  });
  assert.strictEqual(needs.send, true);
  assert.ok(needs.body.trim());
  assert.notStrictEqual(needs.body, targeted.CLARIFY_REPLY);
  assert.strictEqual(/\bcould you tell me\b/i.test(needs.body), false);
  const held = targeted.safeFallback('', { hardFails: [{ code: 'MISSED_ESCALATION' }] }, {
    ctx: { state: { last_client_message: 'please get me a human' } },
  });
  assert.strictEqual(held.send, false);
  assert.strictEqual(held.body, '');
}));

tests.push(test('Hinglish uses the approved Urdu handoff line', () => {
  const text = 'mujhe ek insaan chahiye';
  assert.strictEqual(handoff.detectLanguage(text), 'hinglish');
  const result = decide(text, 'main_escalate');
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.message, handoff.FIXED_MESSAGES.ur);
  assert.strictEqual(result.language, 'ur');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(handoff.FIXED_MESSAGES, 'hinglish'), false);
  const ask = handoff.accountQuestionCustomerLine('mera account number kya hai', '');
  assert.ok(/account number/i.test(ask));
  assert.strictEqual(ask, handoff.ACCOUNT_QUESTION_LINES.hinglish);
}));

tests.push(test('lost ticket state and opstore reconcile from conversation parts', async () => {
  const done = recordingTransport();
  const completed = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 189143<br>Problem: payout',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [
      { part_type: 'note', author: { id: 'seat-a', type: 'admin' }, body: 'Account: 189143<br>Problem: payout' },
      { part_type: 'assignment', assigned_to: { type: 'admin', id: 'human-7' }, author: { id: 'seat-a', type: 'admin' }, body: '' },
      { part_type: 'comment', author: { id: 'seat-a', type: 'admin' }, body: handoff.FIXED_MESSAGES.en },
    ],
    conversation: { admin_assignee_id: '0' },
    progress: {},
    transport: done,
  });
  assert.deepStrictEqual(done.calls, []);
  assert.strictEqual(completed.sent, false);
  assert.strictEqual(completed.duplicate, true);
  assert.strictEqual(completed.progress.noteConfirmed, true);
  assert.strictEqual(completed.progress.assignConfirmed, true);
  assert.strictEqual(completed.progress.messageSent, true);

  const partial = recordingTransport();
  const missingMessage = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 189143<br>Problem: payout',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [
      { part_type: 'note', author: { id: 'seat-a', type: 'admin' }, body: 'Account: 189143<br>Problem: payout' },
      { part_type: 'assignment', assigned_to: { id: 'human-7' }, body: '' },
    ],
    conversation: {},
    progress: {},
    transport: partial,
  });
  assert.deepStrictEqual(partial.calls.map((c) => c.op), ['message']);
  assert.strictEqual(missingMessage.sent, true);
  assert.strictEqual(partial.calls[0].body, handoff.FIXED_MESSAGES.en);

  const botSeat = recordingTransport();
  const notHeld = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [{ part_type: 'assignment', assigned_to: { id: 'seat-a' }, body: '' }],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport: botSeat,
  });
  assert.deepStrictEqual(botSeat.calls.map((c) => c.op), ['note', 'assign', 'message']);
  assert.strictEqual(notHeld.sent, true);
}));

tests.push(test('runtime redacts prompts and comments, answers account questions, and gates identity after that', () => {
  const indexSrc = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  const mainAt = indexSrc.indexOf('Latest client message:');
  const around = indexSrc.slice(mainAt - 700, mainAt + 80);
  assert.ok(around.includes('redactCredentials(buildHistory'));
  assert.ok(around.indexOf('latestForPrompt') < around.indexOf('Latest client message:'));
  const finalAt = indexSrc.lastIndexOf('finalBody = fixedMessageHandoff.redactCredentials(finalBody)');
  assert.ok(finalAt > 0);
  assert.ok(indexSrc.indexOf('return postReply', finalAt) > finalAt);

  const askFn = indexSrc.slice(
    indexSrc.indexOf('function pickAccountEmailAsk'),
    indexSrc.indexOf('async function ensureIdentityBeforeAccountEscalate')
  );
  assert.strictEqual(/pass it to a teammate/i.test(askFn), false);
  assert.strictEqual(/before I pass/i.test(askFn), false);

  const mainExempt = indexSrc.indexOf('FIXED_HANDOFF main_escalate account-question exemption');
  const mainIdentity = indexSrc.indexOf('ensureIdentityBeforeAccountEscalate', mainExempt);
  const mainMarker = indexSrc.indexOf('FIXED_MESSAGE_HANDOFF_R3:main_escalate', mainExempt);
  assert.ok(mainExempt > 0 && mainExempt < mainIdentity && mainIdentity < mainMarker);

  const missedAt = indexSrc.indexOf('FIXED_MESSAGE_HANDOFF_R3:missed_escalation');
  const missed = indexSrc.slice(missedAt, missedAt + 900);
  const q = missed.indexOf('isAccountNumberQuestion');
  const post = missed.indexOf('postClientCommentOnce');
  const identity = missed.indexOf('ensureIdentityBeforeAccountEscalate');
  const commit = missed.indexOf('commitFixedMessageHandoff');
  assert.ok(q > 0 && q < post && post < identity && identity < commit);
  assert.ok(indexSrc.slice(missedAt, missedAt + 700).includes('commitFixedMessageHandoff'));

  const welcomeAt = indexSrc.indexOf('FIXED_MESSAGE_HANDOFF_R3:welcome');
  const welcome = indexSrc.slice(welcomeAt, welcomeAt + 1400);
  assert.ok(welcome.includes("reason === 'account_number_question'"));
  assert.ok(welcome.includes('deliverAccountQuestionAnswer'));
  for (const marker of ['recovery', 'presend_escalate']) {
    const at = indexSrc.indexOf('FIXED_MESSAGE_HANDOFF_R3:' + marker);
    const window = indexSrc.slice(at, at + 1400);
    assert.ok(window.includes('isAccountNumberQuestion'), marker);
    assert.ok(window.includes('deliverAccountQuestionAnswer'), marker);
  }

  const guard = fs.readFileSync(path.join(__dirname, '../../01_runtime/imageAskGuard.js'), 'utf8');
  assert.ok(guard.includes('../02_statePresend/credentialSanitizer'));
  const handoffSrc = fs.readFileSync(path.join(__dirname, '../../01_runtime/fixedMessageHandoff.js'), 'utf8');
  assert.strictEqual(handoffSrc.includes('كلمة المرور'), false);
  assert.ok(handoffSrc.includes('sanitizeCredentials'));
}));

Promise.all(tests)
  .then(() => {
    console.log('OK', passed, 'passed');
  })
  .catch((err) => {
    console.error('FAIL', err && err.stack || err);
    process.exit(1);
  });
