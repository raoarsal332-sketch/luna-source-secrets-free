'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const handoff = require('../../01_runtime/fixedMessageHandoff');
const gates = require('../../01_runtime/teammateHandoffGates');
const ero = require('../../01_runtime/escalateRelatedOnly');
const sanitizer = require('../../02_statePresend/credentialSanitizer');
const textUtils = require('../../02_statePresend/textUtils');
const { extractAsks } = require('../../02_statePresend/multiAskCompleteness');

let passed = 0;

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
const HINDI = 'मेरा खाता नंबर क्या है?';
const HINDI_VARIANT = 'मेरा अकाउण्ट नम्बर क्या है';
const HINGLISH = 'mera account number kya hai?';

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

function decide(text, path, extra) {
  return handoff.decide(
    Object.assign(
      {
        path: path || 'welcome',
        latestText: text,
        parts: [],
        full: { admin_assignee_id: 'human-1', team_assignee_id: '0' },
        botId: 'seat-a',
        force: path !== 'welcome',
        ownershipOpts: OWN,
      },
      extra || {}
    )
  );
}

function assertAccountQuestion(text, path) {
  const result = decide(text, path);
  assert.strictEqual(result.action, 'route_normal', path + ' ' + text);
  assert.strictEqual(result.route, 'normal', path + ' ' + text);
  assert.strictEqual(result.reason, 'account_number_question', path + ' ' + text);
  assert.strictEqual(result.silent, false, path + ' ' + text);
  assert.strictEqual(result.message, null, path + ' ' + text);
  for (const line of Object.values(handoff.FIXED_MESSAGES)) {
    assert.notStrictEqual(result.message, line);
  }
}

function assertNoCanary(label, value) {
  assert.strictEqual(String(value).includes(CANARY), false, label);
}

const tests = [];

tests.push(test('status stays unapproved', () => {
  assert.strictEqual(handoff.STATUS.approved, false);
  assert.strictEqual(handoff.STATUS.release, false);
  assert.strictEqual(handoff.STATUS.candidate, 'fixed-message-handoff-r3');
}));

tests.push(test('Hindi and Hinglish account questions route normal on welcome, recovery, and missed escalation', () => {
  for (const text of [HINDI, HINDI_VARIANT, 'मेरा खाता संख्या क्या है?', HINGLISH, 'mera account number kya hai']) {
    for (const path of ['welcome', 'recovery', 'missed_escalation', 'main_escalate']) {
      assertAccountQuestion(text, path);
    }
  }
}));

tests.push(test('a supplied account number is still a handoff, not a question', () => {
  const result = decide('my account number is 189143', 'main_escalate', {
    full: { admin_assignee_id: 'seat-a' },
  });
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.message, handoff.FIXED_MESSAGES.en);
}));

tests.push(test('a human-owned handoff ask stays silent', () => {
  const result = decide('मुझे एक इंसान से बात करनी है', 'welcome');
  assert.strictEqual(result.action, 'silence');
  assert.strictEqual(result.reason, 'human_assignee');
}));

tests.push(test('our pending assignee can still finish the one fixed message', () => {
  const result = decide('hi', 'recovery', {
    full: { admin_assignee_id: 'human-7' },
    handoffAssigneeId: 'human-7',
    ownershipOpts: Object.assign({ handoffAssigneeId: 'human-7' }, OWN),
  });
  assert.strictEqual(result.action, 'fixed_message');
}));

tests.push(test('an account question does not touch the transport', async () => {
  const transport = recordingTransport();
  const decision = decide(HINGLISH, 'recovery');
  const result = await handoff.commit({
    decision,
    noteHtml: 'Account: 189143<br>Problem: ' + HINGLISH,
    assigneeId: 'human-7',
    transport,
    parts: [],
    progress: { noteConfirmed: true, assignConfirmed: false, assignAmbiguous: false, messageSent: false },
  });
  assert.strictEqual(result.sent, false);
  assert.strictEqual(result.setAwaiting, false);
  assert.deepStrictEqual(transport.calls, []);
}));

tests.push(test('credential canaries never reach the note, the prompt, or the customer line', async () => {
  const originals = [
    "password's " + CANARY,
    'password’s ' + CANARY,
    'كلمة المرور ' + CANARY,
    'پاس ورڈ: ' + CANARY,
    'पासवर्ड ' + CANARY,
    'otp is 445566 and account 189143 password ' + CANARY,
  ];
  for (const raw of originals) {
    assertNoCanary('handoff', handoff.redactCredentials(raw));
    assertNoCanary('shared', sanitizer.sanitizeCredentials(raw));
    const prepared = handoff.prepareNoteForEnglishPrompt(raw);
    assertNoCanary('note', prepared.text);
    assertNoCanary('prompt', prepared.promptText);
  }
  const dev = handoff.prepareNoteForEnglishPrompt('पासवर्ड ' + CANARY + ' है');
  assert.strictEqual(dev.devanagari, true);
  assertNoCanary('devanagari prompt', dev.promptText);
  assert.strictEqual(handoff.redactCredentials('otp is 445566 and account 189143').includes('189143'), true);

  const transport = recordingTransport();
  const noteHtml =
    'Account: 189143<br>Problem: password\'s ' +
    CANARY +
    ' पासवर्ड ' +
    CANARY +
    ' كلمة المرور ' +
    CANARY;
  await handoff.commit({
    decision: {
      action: 'fixed_message',
      language: 'en',
      message: handoff.FIXED_MESSAGES.en,
      reason: 'fixed_handoff',
    },
    noteHtml,
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport,
  });
  assert.strictEqual(transport.calls.map((c) => c.op).join(','), 'note,assign,message');
  assertNoCanary('posted note', transport.calls[0].html);
  assertNoCanary('customer line', transport.calls[2].body);
  assert.strictEqual(transport.calls[2].body, handoff.FIXED_MESSAGES.en);
}));

tests.push(test('question detection and ask completeness see Devanagari and Hinglish', () => {
  assert.strictEqual(textUtils.isQuestionSentence('मेरा खाता नंबर क्या है'), true);
  assert.strictEqual(textUtils.isQuestionSentence('mera account number kya hai'), true);
  assert.strictEqual(textUtils.isQuestionSentence('my account number is 189143'), false);
  assert.ok(textUtils.detectAsks(HINDI).includes('account_number'));
  assert.ok(textUtils.detectAsks(HINGLISH).includes('account_number'));
  const hindi = extractAsks([{ role: 'client', text: 'मेरा खाता नंबर क्या है और पेआउट कैसे होगा?' }]);
  const hinglish = extractAsks([{ role: 'client', text: 'mera account number kya hai aur payout kaise hoga?' }]);
  assert.ok(hindi.burst.length >= 2, hindi.burst.map((a) => a.text).join(' | '));
  assert.ok(hinglish.burst.length >= 2, hinglish.burst.map((a) => a.text).join(' | '));
  const english = extractAsks([{ role: 'client', text: 'what is the payout rule and how do resets work?' }]);
  assert.ok(english.burst.length >= 2);
  const split = textUtils.sentences('खाता नंबर क्या है। पेआउट कैसे होगा।');
  assert.ok(split.length >= 2);
}));

tests.push(test('a status ping stays silent when a human or another assignee owns the conversation', () => {
  const awaiting = {
    escalateAwaitingFirstTeammate: true,
    lastEscalateProblem: 'Client IP mismatch. Account 12345.',
    lastEscalateTopic: 'ip_risk',
  };
  const human = ero.evaluateFromConvState(Object.assign({}, awaiting), 'any update?', [], {
    arsalId: 'seat-a',
    eliteAiId: 'seat-e',
    assigneeId: 'human-1',
  });
  assert.strictEqual(human.action, 'SKIP');
  assert.strictEqual(human.reason, 'assignee_owns_status_ping');
  const fromConv = ero.evaluateFromConvState(Object.assign({}, awaiting), 'any update?', [], {
    arsalId: 'seat-a',
    eliteAiId: 'seat-e',
    conversation: { admin_assignee_id: 'human-7' },
  });
  assert.strictEqual(fromConv.action, 'SKIP');
  assert.strictEqual(fromConv.reason, 'assignee_owns_status_ping');
  const bot = ero.evaluateFromConvState(Object.assign({}, awaiting), 'any update?', [], {
    arsalId: 'seat-a',
    eliteAiId: 'seat-e',
    assigneeId: 'seat-a',
  });
  assert.strictEqual(bot.action, 'STATUS_ONLY');
  const omitted = ero.evaluateFromConvState(
    Object.assign({}, awaiting),
    'any update on my IP?',
    [{ part_type: 'comment', created_at: 2000, author: { type: 'admin', id: 'seat-a' }, body: 'Our team has already been informed...' }],
    { arsalId: 'seat-a', eliteAiId: 'seat-e' }
  );
  assert.strictEqual(omitted.action, 'STATUS_ONLY');
  const cleared = ero.evaluateFromConvState(
    Object.assign({}, awaiting, { lastEscalateAt: 1000 }),
    'any update?',
    [{ part_type: 'comment', created_at: 2000, author: { type: 'admin', id: 'human-9' }, body: 'Hi, we are checking the IP with Risk now.' }],
    { arsalId: 'seat-a', eliteAiId: 'seat-e', assigneeId: 'human-9' }
  );
  assert.strictEqual(cleared.action, 'FALLTHROUGH');
  assert.strictEqual(cleared.reason, 'teammate_replied_gate_cleared');
  const account = ero.evaluateFromConvState(Object.assign({}, awaiting), HINGLISH, [], {
    arsalId: 'seat-a',
    eliteAiId: 'seat-e',
    assigneeId: 'human-1',
    conversation: { admin_assignee_id: 'human-1' },
  });
  assert.strictEqual(account.action, 'FALLTHROUGH');
  assert.strictEqual(account.reason, 'account_number_question');
}));

tests.push(test('runtime source closes recovery, missed escalation, ownership, and the translation prompt', () => {
  const indexSrc = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  const hook = indexSrc.indexOf('escalate-related-only-v1: awaiting RELATED-only gate');
  const defer = indexSrc.indexOf('FIXED_MESSAGE_HANDOFF_R4:ownership_before_hook_a');
  assert.ok(defer > 0 && defer < hook);
  const early = indexSrc.slice(defer, hook);
  assert.ok(early.includes('isAccountNumberQuestion'));
  assert.ok(early.includes('isStatusPing'));
  assert.ok(early.includes('classifyOwnership'));
  const eroCall = indexSrc.slice(hook, hook + 1200);
  assert.ok(eroCall.includes('assigneeId'));
  assert.ok(eroCall.includes('admin_assignee_id'));

  const recAt = indexSrc.indexOf('FIXED_MESSAGE_HANDOFF_R3:recovery');
  const rec = indexSrc.slice(recAt, recAt + 1400);
  const q = rec.indexOf('isAccountNumberQuestion');
  const commit = rec.indexOf('commitFixedMessageHandoff');
  const ret = rec.indexOf('return res.sendStatus(200)');
  assert.ok(q > 0 && q < commit && commit < ret);
  assert.ok(rec.includes('failure422'));
  assert.ok(rec.includes('failure500'));

  const missedAt = indexSrc.indexOf('FIXED_MESSAGE_HANDOFF_R3:missed_escalation');
  const missed = indexSrc.slice(missedAt, missedAt + 900);
  assert.ok(missed.indexOf('isAccountNumberQuestion') < missed.indexOf('commitFixedMessageHandoff'));
  assert.ok(missed.includes('postClientCommentOnce'));

  const note = indexSrc.slice(
    indexSrc.indexOf('function looksNonEnglishNote'),
    indexSrc.indexOf('async function ensureInternalNoteEnglish')
  );
  assert.ok(note.includes('\\u0900-\\u097F'));
  const prompt = indexSrc.slice(
    indexSrc.indexOf('async function ensureInternalNoteEnglish'),
    indexSrc.indexOf('async function buildEscalateNoteAndAssignee')
  );
  const firstRedact = prompt.indexOf('redactCredentials');
  const create = prompt.indexOf('chat.completions.create');
  const secondRedact = prompt.indexOf('redactCredentials', firstRedact + 1);
  assert.ok(firstRedact > 0 && firstRedact < create);
  assert.ok(prompt.includes('promptText'));
  assert.ok(secondRedact > create);

  const handoffSrc = fs.readFileSync(path.join(__dirname, '../../01_runtime/fixedMessageHandoff.js'), 'utf8');
  const decideSrc = handoffSrc.slice(handoffSrc.indexOf('function decide'), handoffSrc.indexOf('function classifyAssignment'));
  assert.ok(decideSrc.indexOf('isAccountNumberQuestion') < decideSrc.indexOf('classifyOwnership'));
  assert.ok(handoffSrc.includes('كلمة المرور'));
  assert.ok(handoffSrc.includes('پاس ورڈ'));
  assert.ok(handoffSrc.includes('पासवर्ड'));
  assert.ok(handoffSrc.includes('\\u2019'));

  const gatesStill = gates.shouldDeferToHumanTeammate(
    { admin_assignee_id: 'human-1' },
    [],
    'any update?',
    OWN
  );
  assert.strictEqual(gatesStill.skip, true);
  assert.strictEqual(gatesStill.reason, 'human_assignee');
}));

Promise.all(tests)
  .then(() => {
    console.log('OK', passed, 'passed');
  })
  .catch((err) => {
    console.error('FAIL', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  });
