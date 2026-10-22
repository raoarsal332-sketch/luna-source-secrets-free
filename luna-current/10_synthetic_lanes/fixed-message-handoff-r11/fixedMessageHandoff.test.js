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
      KNOWLEDGE_GAP_UNSAFE: 'KNOWLEDGE_GAP_UNSAFE',
    },
    validate(body) {
      const text = String(body || '');
      if (text.includes('UNANSWERED') || /which challenge you mean/i.test(text)) {
        return { ok: false, hardFails: [{ code: 'MISSED_QUESTION' }], correctionInstruction: 'answer the FAQ', softWarnings: [] };
      }
      if (/\d/.test(text)) {
        return { ok: false, hardFails: [{ code: 'UNSUPPORTED_NUMBER' }], correctionInstruction: 'remove the figure', softWarnings: [] };
      }
      return { ok: true, hardFails: [], softWarnings: [] };
    },
  },
};

process.env.LUNA_OP_STORE_FILE = path.join(os.tmpdir(), 'luna-r11-ops-' + process.pid + '.json');
try { fs.unlinkSync(process.env.LUNA_OP_STORE_FILE); } catch (_) { /* fresh store */ }

const handoff = require('../../01_runtime/fixedMessageHandoff');
const gates = require('../../01_runtime/teammateHandoffGates');
const ero = require('../../01_runtime/escalateRelatedOnly');
const store = require('../../01_runtime/writeOpStore');
const targeted = require('../../02_statePresend/targetedRegeneration');

const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
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
  const spec = script || {};
  const ok = { ok: true, status: 200, data: {} };
  return {
    calls,
    postNote: async (html) => {
      calls.push({ op: 'note', body: html });
      return spec.note || ok;
    },
    assign: async (id) => {
      calls.push({ op: 'assign', id });
      const body = spec.assign;
      return typeof body === 'function' ? body(id) : (body || ok);
    },
    postMessage: async (body) => {
      calls.push({ op: 'message', body });
      return spec.message || ok;
    },
  };
}

tests.push(test('status stays the R3 candidate and is not approved', () => {
  assert.strictEqual(handoff.STATUS.candidate, 'fixed-message-handoff-r3');
  assert.strictEqual(handoff.STATUS.approved, false);
  assert.strictEqual(handoff.STATUS.release, false);
}));

tests.push(test('KB FAQ questions are not status pings', () => {
  assert.strictEqual(ero.isClearKbFaqAsk('Is news trading allowed?'), true);
  assert.strictEqual(ero.isClearKbFaqAsk('How long do payouts take?'), true);
  assert.strictEqual(ero.isStatusPing('Is news trading allowed?'), false);
  assert.strictEqual(ero.isStatusPing('How long do payouts take?'), false);
  assert.strictEqual(ero.isStatusPing('I am still waiting on my payout'), true);
  assert.strictEqual(ero.isStatusPing('any update?'), true);

  const news = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'Is news trading allowed?',
    lastEscalateProblem: 'Client asked for a human.',
    lastEscalateTopic: 'general',
  });
  assert.strictEqual(news.action, 'FALLTHROUGH');
  assert.strictEqual(news.clearFaq, true);
  assert.notStrictEqual(news.reason, 'related_to_escalate');

  const payoutFaq = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'How long do payouts take?',
    lastEscalateProblem: 'Client asked for a human.',
    lastEscalateTopic: 'general',
  });
  assert.strictEqual(payoutFaq.action, 'FALLTHROUGH');
  assert.strictEqual(payoutFaq.clearFaq, true);

  const waiting = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'I am still waiting on my payout',
    lastEscalateProblem: 'Payout review for account 189143',
    lastEscalateTopic: 'payout',
  });
  assert.strictEqual(waiting.action, 'STATUS_ONLY');
  const update = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'any update?',
    lastEscalateProblem: 'Payout review for account 189143',
    lastEscalateTopic: 'payout',
  });
  assert.strictEqual(update.action, 'STATUS_ONLY');

  for (const line of ['Is news trading allowed?', 'How long do payouts take?']) {
    const answer = handoff.plainFaqCustomerLine(line);
    assert.ok(answer && answer.trim().length >= 12);
    assert.notStrictEqual(answer, handoff.STATUS_PING_CLARIFY);
    assert.strictEqual(Object.values(handoff.FIXED_MESSAGES).includes(answer), false);
  }

  const fn = fs.readFileSync(path.join(__dirname, '../../01_runtime/escalateRelatedOnly.js'), 'utf8');
  const body = fn.slice(fn.indexOf('function isStatusPing'), fn.indexOf('function isRelatedFollowUpCue'));
  assert.ok(body.includes('isClearKbFaqAsk'));
  assert.ok(body.indexOf('isClearKbFaqAsk') < body.indexOf('any\\s+update'));
  const src = indexSrc();
  assert.ok(src.includes('STATUS_PING clarify no pending case'));
  assert.ok(src.includes('STATUS_PING_CLARIFY'));
  assert.ok(src.includes('hasPendingHandoffCase'));
}));

tests.push(test('a removed note after Luna assignment resumes from the op record once', async () => {
  const op = {
    status: 'confirmed',
    kind: 'assignment',
    conversationId: 'c1',
    assigneeId: 'human-7',
    madeBy: 'seat-a',
  };
  const assignment = {
    part_type: 'assignment',
    body: 'Conversation assigned to human-7',
    author: { type: 'admin', id: 'human-7' },
    assigned_to: { id: 'human-7' },
  };
  const ownOpts = { arsalId: 'seat-a', eliteAiId: 'seat-e', handoffAssigneeId: 'human-7' };
  assert.strictEqual(gates.isHumanTeammatePublicReply(assignment, ownOpts), true);
  const hidden = handoff.partsWithoutOwnAssignment([assignment], 'human-7');
  assert.deepStrictEqual(hidden, []);
  assert.strictEqual(gates.classifyOwnership({ admin_assignee_id: 'human-7' }, hidden, ownOpts).silent, false);
  assert.strictEqual(gates.classifyOwnership({ admin_assignee_id: 'human-7' }, [assignment], { arsalId: 'seat-a', eliteAiId: 'seat-e' }).silent, true);

  const recovered = handoff.resumeLostHandoff({
    progress: {},
    parts: [],
    conversation: { admin_assignee_id: 'human-7' },
    botId: 'seat-a',
    opRecord: op,
  });
  assert.strictEqual(recovered.resume, true);
  assert.strictEqual(recovered.reason, 'op_assignment');
  assert.strictEqual(recovered.handoffAssigneeId, 'human-7');
  assert.strictEqual(handoff.foreignHumanOwns(
    { admin_assignee_id: 'human-7' },
    recovered.handoffAssigneeId,
    'seat-a',
    {}
  ), false);

  const foreign = handoff.resumeLostHandoff({
    progress: {},
    parts: [],
    conversation: { admin_assignee_id: 'human-9' },
    botId: 'seat-a',
    opRecord: op,
  });
  assert.strictEqual(foreign.resume, false);
  assert.strictEqual(foreign.handoffAssigneeId, '');
  assert.strictEqual(foreign.reason, 'foreign_owner');

  const unverified = handoff.resumeLostHandoff({
    progress: {},
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    botId: 'seat-a',
    opRecord: op,
  });
  assert.strictEqual(unverified.resume, true);
  assert.strictEqual(unverified.hold, true);
  assert.strictEqual(unverified.handoffAssigneeId, '');

  const first = transport();
  const done = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: '<!-- ' + handoff.HANDOFF_NOTE_MARKER + ' -->Account: 1<br>Problem: x',
    assigneeId: recovered.assigneeId,
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'human-7' },
    progress: { noteConfirmed: true, assignConfirmed: true, messageSent: false, assigneeId: 'human-7' },
    transport: first,
  });
  assert.deepStrictEqual(first.calls.map((c) => c.op), ['note', 'message']);
  assert.strictEqual(done.sent, true);
  assert.strictEqual(done.progress.messageSent, true);
  assert.strictEqual(first.calls.filter((c) => c.op === 'message').length, 1);
  assert.strictEqual(first.calls[1].body, FIXED);

  const second = transport();
  const again = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [
      { part_type: 'note', author: { id: 'seat-a', type: 'admin' }, body: first.calls[0].body },
      { part_type: 'comment', author: { id: 'seat-a', type: 'admin' }, body: FIXED },
    ],
    conversation: { admin_assignee_id: 'human-7' },
    progress: done.progress,
    transport: second,
  });
  assert.deepStrictEqual(second.calls, []);
  assert.strictEqual(again.reason, 'already_sent');
  assert.strictEqual(again.sent, false);
  const quiet = handoff.resumeLostHandoff({
    progress: done.progress,
    parts: [{ part_type: 'comment', author: { id: 'seat-a' }, body: FIXED }],
    conversation: { admin_assignee_id: 'human-7' },
    botId: 'seat-a',
    opRecord: op,
  });
  assert.strictEqual(quiet.resume, false);
  assert.strictEqual(quiet.reason, 'already_sent');

  const blocked = transport({ assign: { ok: false, status: 422, data: {} } });
  const held = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport: blocked,
  });
  assert.strictEqual(held.sent, false);
  assert.strictEqual(blocked.calls.some((c) => c.op === 'message'), false);

  const src = indexSrc();
  const own = src.indexOf('FIXED_MESSAGE_HANDOFF_R4:ownership_before_hook_a');
  const silent = src.indexOf('if (owned.silent || humanCommented || foreignOwner)', own);
  const early = src.slice(own, silent);
  assert.ok(early.includes('latestHandoffAssignment'));
  assert.ok(early.includes('resumeLostHandoff'));
  assert.ok(early.includes('isStatusPing'));
  assert.ok(early.includes('classifyOwnership'));
  assert.strictEqual(early.includes('postClientCommentOnce'), false);
  assert.strictEqual(early.includes('deliverAccountQuestionAnswer'), false);
}));

tests.push(test('a 200 naming the wrong assignee is retried for the intended seat', async () => {
  const request = { message_type: 'assignment', assignee_id: 'human-7', admin_id: 'seat-a', type: 'admin' };
  const wrong = store.classifyWriteOutcome(request, { id: 'conv-1', type: 'conversation', admin_assignee_id: 'human-9' }, 200);
  assert.strictEqual(wrong.confirm, false);
  assert.strictEqual(wrong.unknown, false);
  assert.strictEqual(wrong.reason, 'wrong-assignee');
  store.set('wrong', {
    status: 'failed',
    reason: 'wrong-assignee',
    kind: 'assignment',
    conversationId: 'c1',
    assigneeId: 'human-7',
    madeBy: 'seat-a',
  });
  assert.strictEqual(store.shouldSkipReplay(store.get('wrong')), false);
  assert.strictEqual(store.latestHandoffAssignment('c1', 'seat-a'), null);

  const right = store.classifyWriteOutcome(request, { id: 'conv-1', type: 'conversation', admin_assignee_id: 'human-7' }, 200);
  assert.strictEqual(right.confirm, true);
  assert.strictEqual(right.record.assigneeId, 'human-7');
  assert.strictEqual(right.record.madeBy, 'seat-a');
  store.set('right', Object.assign({ conversationId: 'c1' }, right.record));
  const found = store.latestHandoffAssignment('c1', 'seat-a');
  assert.ok(found);
  assert.strictEqual(found.status, 'confirmed');
  assert.strictEqual(String(found.assigneeId), 'human-7');
  assert.strictEqual(store.shouldSkipReplay(found), true);

  const malformed = store.classifyWriteOutcome(
    { message_type: 'comment', type: 'admin', admin_id: 'seat-a' },
    { unexpected: 'not a conversation' },
    200
  );
  assert.strictEqual(malformed.confirm, false);
  assert.strictEqual(malformed.unknown, true);
  assert.strictEqual(malformed.reason, 'malformed-success');

  let named = 'human-9';
  const firstTransport = transport({
    assign: () => ({ ok: true, status: 200, data: { admin_assignee_id: named } }),
  });
  const missed = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport: firstTransport,
  });
  assert.deepStrictEqual(firstTransport.calls.map((c) => c.op), ['note', 'assign']);
  assert.strictEqual(firstTransport.calls[1].id, 'human-7');
  assert.strictEqual(missed.sent, false);
  assert.strictEqual(missed.progress.assignConfirmed, false);
  assert.strictEqual(missed.progress.noteConfirmed, true);
  assert.strictEqual(missed.progress.assignAmbiguous, false);

  named = 'human-7';
  const secondTransport = transport({
    assign: () => ({ ok: true, status: 200, data: { admin_assignee_id: named } }),
  });
  const retried = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: missed.progress,
    transport: secondTransport,
  });
  assert.deepStrictEqual(secondTransport.calls.map((c) => c.op), ['assign', 'message']);
  assert.strictEqual(secondTransport.calls[0].id, 'human-7');
  assert.strictEqual(retried.sent, true);
  assert.strictEqual(retried.progress.assignConfirmed, true);
  assert.strictEqual(secondTransport.calls[1].body, FIXED);
  assert.strictEqual(secondTransport.calls.filter((c) => c.op === 'message').length, 1);
}));

tests.push(test('a challenge clarification is not replaced by the number hedge', async () => {
  assert.strictEqual(handoff.isLegitimateClarification(CLARIFIER), true);
  assert.strictEqual(handoff.isLegitimateClarification(HEDGE), false);
  assert.strictEqual(handoff.isLegitimateClarification('The team will review the daily loss limit.'), false);
  const ctx = {
    assigneeId: 'seat-a',
    botIds: ['seat-a'],
    state: { last_client_message: 'What is the daily loss limit?' },
  };
  const kept = targeted.safeFallback(CLARIFIER, { hardFails: [{ code: 'MISSED_QUESTION' }] }, { ctx });
  assert.strictEqual(kept.send, true);
  assert.strictEqual(kept.body, CLARIFIER);
  assert.strictEqual(kept.reason, 'challenge-clarifier');
  assert.notStrictEqual(kept.body, HEDGE);
  assert.notStrictEqual(kept.body, FIXED);

  const ran = await targeted.runWithRegeneration({
    draft: CLARIFIER,
    ctx,
    regenerate() {
      return HEDGE;
    },
  });
  assert.strictEqual(ran.send, true);
  assert.strictEqual(ran.body, CLARIFIER);
  assert.strictEqual(ran.finalReason, 'challenge-clarifier');

  const produced = await targeted.runWithRegeneration({
    draft: 'UNANSWERED daily loss limit',
    ctx,
    regenerate() {
      return CLARIFIER;
    },
  });
  assert.strictEqual(produced.send, true);
  assert.strictEqual(produced.body, CLARIFIER);
  assert.notStrictEqual(produced.body, HEDGE);

  const hedged = await targeted.runWithRegeneration({
    draft: 'The team will review the daily loss limit.',
    ctx,
    regenerate() {
      return 'Our team will review that question.';
    },
  });
  assert.strictEqual(hedged.body, HEDGE);
  assert.strictEqual(hedged.finalReason, 'faq-team-review-hedge');
}));

Promise.all(tests)
  .then(() => {
    try { fs.unlinkSync(process.env.LUNA_OP_STORE_FILE); } catch (_) { /* temp store */ }
    console.log('OK', passed, 'passed');
  })
  .catch((err) => {
    console.error('FAIL', err);
    process.exit(1);
  });
