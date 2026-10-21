'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const handoff = require('../../01_runtime/fixedMessageHandoff');
const gates = require('../../01_runtime/teammateHandoffGates');

let passed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log('PASS', name);
    });
}

const OK = { ok: true, status: 200, data: { id: 'conv-synthetic', type: 'conversation' } };
const OWN = {
  arsalId: 'seat-a',
  eliteAiId: 'seat-e',
  riskTeamId: 'risk-1',
  escalationsTeamId: 'esc-1',
};

function recordingTransport(script) {
  const calls = [];
  async function take(op, extra) {
    calls.push(Object.assign({ op }, extra));
    const spec = script && Object.prototype.hasOwnProperty.call(script, op) ? script[op] : OK;
    return typeof spec === 'function' ? spec(calls) : spec;
  }
  return {
    calls,
    postNote: (html) => take('note', { html }),
    assign: (assigneeId) => take('assign', { assigneeId }),
    postMessage: (body) => take('message', { body }),
  };
}

function ops(transport) {
  return transport.calls.map((c) => c.op);
}

function fixedDecision(language) {
  return {
    action: 'fixed_message',
    language,
    message: handoff.FIXED_MESSAGES[language],
    reason: 'fixed_handoff',
  };
}

async function runCommit(extra) {
  const transport = extra.transport || recordingTransport(extra.script || {});
  const result = await handoff.commit(
    Object.assign(
      {
        decision: fixedDecision('en'),
        noteHtml: 'Account: 189143<br>Problem: payout held<br>password is hunter2',
        assigneeId: 'human-7',
        botId: 'seat-a',
        parts: [],
        conversation: { admin_assignee_id: 'seat-a' },
        progress: {},
        transport,
      },
      extra.commit || {}
    )
  );
  return { transport, result };
}

const tests = [];

tests.push(test('status is unapproved and is not a release', () => {
  assert.strictEqual(handoff.STATUS.approved, false);
  assert.strictEqual(handoff.STATUS.release, false);
  assert.strictEqual(handoff.STATUS.candidate, 'fixed-message-handoff-r3');
}));

tests.push(test('success posts note, then assignment, then exactly one fixed message', async () => {
  const { transport, result } = await runCommit({});
  assert.deepStrictEqual(ops(transport), ['note', 'assign', 'message']);
  assert.strictEqual(transport.calls[2].body, handoff.FIXED_MESSAGES.en);
  assert.strictEqual(result.sent, true);
  assert.strictEqual(result.setAwaiting, true);
  assert.strictEqual(transport.calls.filter((c) => c.op === 'message').length, 1);
}));

tests.push(test('fixed strings do not invent a promise', () => {
  const banned = /\b(will|review|details|promise|shortly|guarantee|forwarded|closer)\b/i;
  for (const line of Object.values(handoff.FIXED_MESSAGES)) {
    assert.strictEqual(banned.test(line), false, line);
  }
}));

tests.push(test('assignment 500 withholds the message and the awaiting flag', async () => {
  const { transport, result } = await runCommit({
    script: { assign: { ok: false, status: 500, unknown: true } },
  });
  assert.deepStrictEqual(ops(transport), ['note', 'assign']);
  assert.strictEqual(result.sent, false);
  assert.strictEqual(result.setAwaiting, false);
  assert.strictEqual(result.reason, 'assign_500');
  assert.strictEqual(result.progress.assignAmbiguous, true);
}));

tests.push(test('assignment timeout withholds the message and the awaiting flag', async () => {
  const { result, transport } = await runCommit({
    script: { assign: { ok: false, status: 0, unknown: true, reason: 'timeout' } },
  });
  assert.deepStrictEqual(ops(transport), ['note', 'assign']);
  assert.strictEqual(result.setAwaiting, false);
  assert.strictEqual(result.sent, false);
  assert.strictEqual(result.reason, 'assign_timeout');
}));

tests.push(test('assignment 422 withholds the message and the awaiting flag', async () => {
  const { result, transport } = await runCommit({
    script: {
      assign: {
        ok: false,
        status: 422,
        data: { errors: [{ code: 'conversation_already_assigned_to_assignee' }] },
      },
    },
  });
  assert.deepStrictEqual(ops(transport), ['note', 'assign']);
  assert.strictEqual(result.setAwaiting, false);
  assert.strictEqual(result.reason, 'assign_422');
  assert.strictEqual(transport.calls.some((c) => c.op === 'message'), false);
}));

tests.push(test('partial assignment success withholds the message and the awaiting flag', async () => {
  const { result, transport } = await runCommit({
    script: {
      assign: { ok: true, status: 200, partial: true, data: { id: 'conv-synthetic', errors: [{ code: 'partial' }] } },
    },
  });
  assert.strictEqual(result.setAwaiting, false);
  assert.strictEqual(result.sent, false);
  assert.strictEqual(result.reason, 'assign_partial');
  assert.strictEqual(transport.calls.some((c) => c.op === 'message'), false);
}));

tests.push(test('ambiguous assignment is not replayed and does not send a second message', async () => {
  const first = await runCommit({
    script: { assign: { ok: false, status: 500, unknown: true } },
  });
  const secondTransport = recordingTransport({});
  const second = await handoff.commit({
    decision: fixedDecision('en'),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: first.result.progress,
    transport: secondTransport,
  });
  assert.deepStrictEqual(ops(secondTransport), []);
  assert.strictEqual(second.setAwaiting, false);
  assert.strictEqual(second.reason, 'assign_ambiguous_held');
}));

tests.push(test('recovery after a held assignment sends one message when the seat is observed', async () => {
  const first = await runCommit({
    script: { assign: { ok: false, status: 500, unknown: true } },
  });
  const transport = recordingTransport({});
  const second = await handoff.commit({
    decision: fixedDecision('en'),
    noteHtml: 'Account: 189143<br>Problem: payout',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [
      {
        part_type: 'note',
        author: { id: 'seat-a', type: 'admin' },
        body: 'Account: 189143 Problem: payout',
      },
    ],
    conversation: { admin_assignee_id: 'human-7' },
    progress: first.result.progress,
    transport,
  });
  assert.deepStrictEqual(ops(transport), ['message']);
  assert.strictEqual(second.sent, true);
  assert.strictEqual(second.setAwaiting, true);
  assert.strictEqual(transport.calls[0].body, handoff.FIXED_MESSAGES.en);
}));

tests.push(test('a completed handoff retries without a second note, assignment, or message', async () => {
  const first = await runCommit({});
  const transport = recordingTransport({});
  const second = await handoff.commit({
    decision: fixedDecision('en'),
    noteHtml: 'Account: 189143<br>Problem: payout',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [
      {
        part_type: 'comment',
        author: { id: 'seat-a', type: 'admin' },
        body: handoff.FIXED_MESSAGES.en,
      },
    ],
    conversation: { admin_assignee_id: 'human-7' },
    progress: first.result.progress,
    transport,
  });
  assert.deepStrictEqual(ops(transport), []);
  assert.strictEqual(second.sent, false);
  assert.strictEqual(second.duplicate, true);
  assert.strictEqual(second.setAwaiting, true);
}));

tests.push(test('note failure does not assign or message', async () => {
  const { transport, result } = await runCommit({
    script: { note: { ok: false, status: 422, data: { errors: [{ code: 'invalid' }] } } },
  });
  assert.deepStrictEqual(ops(transport), ['note']);
  assert.strictEqual(result.setAwaiting, false);
  assert.strictEqual(result.progress.noteConfirmed, false);
}));

tests.push(test('credentials are redacted before the note and never enter the customer message', async () => {
  const raw = 'password is hunter2 and otp is 445566 and account 189143';
  const redacted = handoff.redactCredentials(raw);
  assert.strictEqual(redacted.includes('hunter2'), false);
  assert.strictEqual(redacted.includes('445566'), false);
  assert.strictEqual(redacted.includes('189143'), true);
  const { transport } = await runCommit({
    commit: { noteHtml: 'Account: 189143<br>Problem: ' + raw },
  });
  assert.strictEqual(transport.calls[0].html.includes('hunter2'), false);
  assert.strictEqual(transport.calls[0].html.includes('445566'), false);
  assert.strictEqual(transport.calls[2].body.includes('hunter2'), false);
  assert.strictEqual(transport.calls[2].body, handoff.FIXED_MESSAGES.en);
}));

function welcome(text, extra) {
  return handoff.decide(
    Object.assign(
      {
        path: 'welcome',
        latestText: text,
        parts: [],
        full: { admin_assignee_id: 'seat-a', team_assignee_id: '0' },
        botId: 'seat-a',
        finHandoff: false,
        liveAgent: false,
        ownershipOpts: OWN,
      },
      extra || {}
    )
  );
}

tests.push(test('Arabic handoff ask is detected from script and gets Arabic fixed text', () => {
  const result = welcome('أريد التحدث مع موظف');
  assert.strictEqual(handoff.detectLanguage('أريد التحدث مع موظف'), 'ar');
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.language, 'ar');
  assert.strictEqual(result.message, handoff.FIXED_MESSAGES.ar);
  assert.notStrictEqual(result.message, handoff.FIXED_MESSAGES.ur);
  assert.notStrictEqual(result.message, handoff.FIXED_MESSAGES.en);
}));

tests.push(test('Urdu handoff ask is detected from Urdu letters and gets Urdu fixed text', () => {
  const text = 'مجھے ایک انسان سے بات کرنی ہے';
  const result = welcome(text);
  assert.strictEqual(handoff.detectLanguage(text), 'ur');
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.language, 'ur');
  assert.strictEqual(result.message, handoff.FIXED_MESSAGES.ur);
  assert.notStrictEqual(result.message, handoff.FIXED_MESSAGES.en);
}));

tests.push(test('Hindi handoff ask is detected from Devanagari and gets Hindi fixed text', () => {
  const text = 'मुझे एक इंसान से बात करनी है';
  const result = welcome(text);
  assert.strictEqual(handoff.detectLanguage(text), 'hi');
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.language, 'hi');
  assert.strictEqual(result.message, handoff.FIXED_MESSAGES.hi);
}));

tests.push(test('English live-agent ask still gets the English fixed line', () => {
  const result = welcome('live agent please');
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.message, handoff.FIXED_MESSAGES.en);
}));

tests.push(test('Fin handoff plus hi gets one English fixed line', () => {
  const result = welcome('hi', { finHandoff: true });
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.message, handoff.FIXED_MESSAGES.en);
}));

tests.push(test('an Arabic account-number question is not swallowed by the welcome', () => {
  const result = welcome('ما هو رقم حسابي؟', { finHandoff: true, liveAgent: true });
  assert.strictEqual(result.action, 'route_normal');
  assert.strictEqual(result.reason, 'account_number_question');
  assert.strictEqual(result.message, null);
}));

tests.push(test('an Urdu account-number question is not swallowed by the welcome', () => {
  const result = welcome('میرا اکاؤنٹ نمبر کیا ہے؟', { finHandoff: true });
  assert.strictEqual(result.route, 'normal');
  assert.strictEqual(result.reason, 'account_number_question');
}));

tests.push(test('a Hindi account-number question is not swallowed by the welcome', () => {
  const result = welcome('मेरा खाता नंबर क्या है?', { finHandoff: true });
  assert.strictEqual(result.route, 'normal');
  assert.strictEqual(result.reason, 'account_number_question');
}));

tests.push(test('an English account-number question is not swallowed by the welcome', () => {
  const result = welcome('live agent please what is my account number?', { finHandoff: true, liveAgent: true });
  assert.strictEqual(result.route, 'normal');
  assert.strictEqual(result.reason, 'account_number_question');
}));

tests.push(test('a substantive Arabic question is not treated as a handoff welcome', () => {
  const result = welcome('ما هي قواعد السحب؟', { finHandoff: true });
  assert.strictEqual(result.action, 'route_normal');
  assert.notStrictEqual(result.reason, 'fixed_handoff');
}));

function silence(full, parts, text) {
  return handoff.decide({
    path: 'welcome',
    latestText: text,
    parts,
    full,
    botId: 'seat-a',
    finHandoff: true,
    liveAgent: true,
    ownershipOpts: OWN,
  });
}

tests.push(test('a human assignee is silence in Arabic, Urdu, and Hindi', () => {
  const full = { admin_assignee_id: 'human-1', team_assignee_id: '0' };
  for (const text of ['أريد التحدث مع موظف', 'مجھے ایک انسان سے بات کرنی ہے', 'मुझे एक इंसान से बात करनी है']) {
    const result = silence(full, [], text);
    assert.strictEqual(result.action, 'silence', text);
    assert.strictEqual(result.reason, 'human_assignee');
    assert.strictEqual(result.message, null);
  }
}));

tests.push(test('an admin body without part_type is silence', () => {
  const result = silence(
    { admin_assignee_id: 'seat-a' },
    [{ author: { id: 'human-1', type: 'admin', name: 'Sam' }, body: 'میں دیکھ رہا ہوں' }],
    'hi'
  );
  assert.strictEqual(result.reason, 'admin_body_without_part_type');
  assert.strictEqual(gates.isHumanTeammatePublicReply(
    { author: { id: 'human-1', type: 'admin', name: 'Sam' }, body: 'میں دیکھ رہا ہوں' },
    OWN
  ), true);
}));

tests.push(test('author type teammate is silence', () => {
  const part = {
    part_type: 'comment',
    author: { id: 'human-1', type: 'teammate', name: 'Sam' },
    body: 'هذه محادثتي',
  };
  const result = silence({ admin_assignee_id: 'seat-a' }, [part], 'hello');
  assert.strictEqual(result.reason, 'author_type_teammate');
  assert.strictEqual(gates.isHumanTeammatePublicReply(part, OWN), true);
}));

tests.push(test('Risk and Escalations teams are silence', () => {
  const risk = silence({ admin_assignee_id: 'seat-a', team_assignee_id: 'risk-1' }, [], 'मुझे एक इंसान से बात करनी है');
  const esc = silence(
    { admin_assignee_id: 'seat-a', team_assignee_id: '0', team_assignee: { name: 'Escalations' } },
    [],
    'أريد التحدث مع موظف'
  );
  assert.strictEqual(risk.reason, 'risk_team');
  assert.strictEqual(esc.reason, 'escalations_team');
}));

tests.push(test('ambiguous and stale ownership are silence', () => {
  const ambiguous = silence({ admin_assignee_id: '0', assignee: { type: 'admin' } }, [], 'hi');
  const stale = silence(
    { admin_assignee_id: 'seat-a' },
    [{ part_type: 'assignment', assignee_id: 'human-9', created_at: 50, author: { id: 'seat-a', type: 'admin' } }],
    'hi'
  );
  assert.strictEqual(ambiguous.reason, 'ambiguous_ownership');
  assert.strictEqual(stale.reason, 'stale_ownership');
}));

tests.push(test('defer gate fails closed for the same ownership cases', () => {
  const human = gates.shouldDeferToHumanTeammate(
    { admin_assignee_id: 'human-1' },
    [],
    'أريد التحدث مع موظف',
    OWN
  );
  const teammate = gates.shouldDeferToHumanTeammate(
    { admin_assignee_id: 'seat-a' },
    [{ part_type: 'comment', author: { id: 'human-1', type: 'teammate' }, body: 'ये रहा' }],
    'what is the payout rule?',
    OWN
  );
  const open = gates.shouldDeferToHumanTeammate(
    { admin_assignee_id: 'seat-a', team_assignee_id: '0' },
    [],
    'hi',
    OWN
  );
  assert.strictEqual(human.skip, true);
  assert.strictEqual(human.reason, 'human_assignee');
  assert.strictEqual(teammate.skip, true);
  assert.strictEqual(open.skip, false);
}));

tests.push(test('silence does not touch the transport', async () => {
  const transport = recordingTransport({});
  const result = await handoff.commit({
    decision: silence({ admin_assignee_id: 'human-1' }, [], 'live agent please'),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    transport,
    parts: [],
    progress: {},
  });
  assert.deepStrictEqual(ops(transport), []);
  assert.strictEqual(result.setAwaiting, false);
}));

tests.push(test('our own pending assignee can still complete the one message', () => {
  const result = handoff.decide({
    path: 'recovery',
    latestText: 'hi',
    parts: [],
    full: { admin_assignee_id: 'human-7' },
    botId: 'seat-a',
    force: true,
    handoffAssigneeId: 'human-7',
    ownershipOpts: Object.assign({ handoffAssigneeId: 'human-7' }, OWN),
  });
  assert.strictEqual(result.action, 'fixed_message');
}));

tests.push(test('escalate paths use the fixed line in the customer language', () => {
  const result = handoff.decide({
    path: 'main_escalate',
    latestText: 'मुझे एक इंसान से बात करनी है',
    parts: [],
    full: { admin_assignee_id: 'seat-a' },
    botId: 'seat-a',
    ownershipOpts: OWN,
  });
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.message, handoff.FIXED_MESSAGES.hi);
}));

tests.push(test('a new customer turn can send one new message and the same turn cannot', async () => {
  const done = {
    noteConfirmed: true,
    assignConfirmed: true,
    assigneeId: 'human-7',
    messageSent: true,
    turnId: 'part-1',
  };
  const same = handoff.progressForTurn(done, 'part-1', 'main_escalate');
  assert.strictEqual(same.messageSent, true);
  const next = handoff.progressForTurn(done, 'part-2', 'main_escalate');
  assert.strictEqual(next.messageSent, false);
  assert.strictEqual(next.turnId, 'part-2');
  const recovery = handoff.progressForTurn(
    { noteConfirmed: true, assignConfirmed: false, messageSent: false, assigneeId: 'human-7', turnId: 'part-1' },
    'part-2',
    'recovery'
  );
  assert.strictEqual(recovery.noteConfirmed, true);
  assert.strictEqual(recovery.assigneeId, 'human-7');
  assert.strictEqual(recovery.messageSent, false);
}));

tests.push(test('runtime wires every handoff path through the shared sequence', () => {
  const indexSrc = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  for (const marker of [
    'FIXED_MESSAGE_HANDOFF_R3:welcome',
    'FIXED_MESSAGE_HANDOFF_R3:identity_recovery',
    'FIXED_MESSAGE_HANDOFF_R3:main_escalate',
    'FIXED_MESSAGE_HANDOFF_R3:presend_escalate',
    'FIXED_MESSAGE_HANDOFF_R3:missed_escalation',
  ]) {
    assert.ok(indexSrc.includes(marker), marker);
    const at = indexSrc.indexOf(marker);
    const window = indexSrc.slice(at, at + 700);
    assert.ok(window.includes('commitFixedMessageHandoff'), marker);
  }
  assert.strictEqual(indexSrc.includes('They have your account details'), false);
  assert.strictEqual(indexSrc.includes('They have the chat context'), false);
  const fn = indexSrc.slice(
    indexSrc.indexOf('function sanitizeEscalateProblem'),
    indexSrc.indexOf('function looksNonEnglishNote')
  );
  const redactAt = fn.indexOf('fixedMessageHandoff.redactCredentials');
  const rewriteAt = fn.indexOf('rewriteBareNumberOrderLabels');
  assert.ok(redactAt > 0 && redactAt < rewriteAt);
  const helper = indexSrc.slice(
    indexSrc.indexOf('async function commitFixedMessageHandoff'),
    indexSrc.indexOf('const handleWebhook')
  );
  assert.ok(helper.includes('escalateAwaitingFirstTeammate = true'));
  assert.ok(helper.indexOf('if (result.setAwaiting)') < helper.indexOf('escalateAwaitingFirstTeammate = true'));
  const outside = indexSrc.replace(helper, '');
  assert.strictEqual(outside.includes('escalateAwaitingFirstTeammate = true'), false);
}));

Promise.all(tests)
  .then(() => {
    console.log('OK', passed, 'passed');
  })
  .catch((err) => {
    console.error('FAIL', err && err.stack || err);
    process.exit(1);
  });
