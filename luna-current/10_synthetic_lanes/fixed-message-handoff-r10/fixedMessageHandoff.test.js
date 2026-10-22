'use strict';

const assert = require('assert');
const fs = require('fs');
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
      if (text.includes('UNANSWERED')) {
        return { ok: false, hardFails: [{ code: 'MISSED_QUESTION' }], correctionInstruction: 'answer the FAQ', softWarnings: [] };
      }
      if (/\d/.test(text)) {
        return { ok: false, hardFails: [{ code: 'UNSUPPORTED_NUMBER' }], correctionInstruction: 'remove the figure', softWarnings: [] };
      }
      return { ok: true, hardFails: [], softWarnings: [] };
    },
  },
};

const handoff = require('../../01_runtime/fixedMessageHandoff');
const sanitizer = require('../../02_statePresend/credentialSanitizer');
const targeted = require('../../02_statePresend/targetedRegeneration');

const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const FIXED = handoff.FIXED_MESSAGES.en;
const OWNER = 'owner-admin';

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
    assign: async () => {
      calls.push({ op: 'assign' });
      return spec.assign || ok;
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

tests.push(test('owner commands require admin type, owner id, and an internal note', () => {
  const opts = { ownerAdminIds: [OWNER] };
  const dictated = 'Your payout review is in progress.';
  const spoofs = [
    { author: { type: 'user', id: OWNER, name: 'Arsal', email: 'owner@example.com' }, part_type: 'note' },
    { author: { type: 'user', id: OWNER, name: 'Jerry', email: 'jerry@example.com' }, part_type: 'note' },
    { author: { type: 'lead', id: OWNER, name: 'Arsal', email: 'owner@example.com' }, part_type: 'note' },
    { author: { type: 'admin', id: 'other-admin', name: 'Arsal', email: 'owner@example.com' }, part_type: 'note' },
    { author: { type: 'admin', id: '', name: 'Arsal', email: 'owner@example.com' }, part_type: 'note' },
    { author: { type: 'admin', id: OWNER, name: 'Customer', email: 'customer@example.com' }, part_type: 'comment' },
    { author: { id: OWNER, name: 'Arsal', email: 'owner@example.com' }, part_type: 'note' },
  ];
  for (const part of spoofs) {
    const auth = handoff.authenticatedOwnerCommand(part, opts);
    assert.strictEqual(auth.ok, false, JSON.stringify(part.author) + ' ' + part.part_type);
    assert.notStrictEqual(auth.reason, 'owner-command');
    const decision = handoff.ownerPublicReplyDecision({
      humanAssigned: true,
      verbatim: true,
      parsable: true,
      authenticated: false,
      body: dictated,
    });
    assert.strictEqual(decision.post, false);
    assert.strictEqual(decision.body, '');
    assert.strictEqual(decision.reason, 'owner-auth-failed');
  }
  const userType = handoff.authenticatedOwnerCommand(spoofs[0], opts);
  assert.strictEqual(userType.reason, 'owner-auth-type');
  const wrongId = handoff.authenticatedOwnerCommand(spoofs[3], opts);
  assert.strictEqual(wrongId.reason, 'owner-auth-id');
  const comment = handoff.authenticatedOwnerCommand(spoofs[5], opts);
  assert.strictEqual(comment.reason, 'owner-auth-channel');

  const owner = handoff.authenticatedOwnerCommand(
    { part_type: 'note', author: { type: 'admin', id: OWNER, name: 'Not Used', email: 'not-used@example.com' }, body: 'REPLY: ' + dictated },
    opts
  );
  assert.strictEqual(owner.ok, true);
  assert.strictEqual(owner.reason, 'owner-command');
  const posted = handoff.ownerPublicReplyDecision({
    humanAssigned: true,
    verbatim: true,
    parsable: true,
    authenticated: true,
    body: dictated,
  });
  assert.strictEqual(posted.post, true);
  assert.strictEqual(posted.verbatim, true);
  assert.strictEqual(posted.body, dictated);
  assert.strictEqual(posted.reason, 'owner-command');

  const src = indexSrc();
  const gate = src.indexOf('authenticatedOwnerCommand');
  const reply = src.indexOf("} else if (cmd === 'REPLY')");
  assert.ok(gate > 0 && gate < reply);
  assert.ok(src.includes('AUTH_NOTE withheld'));
  assert.ok(src.slice(gate, reply).includes("ownerAdminIds: [ARSAL_ID, JERRY_ID]"));
}));

tests.push(test('a 200 with errors or a null body is not a confirmed write', async () => {
  const errorList = transport({
    note: { ok: true, status: 200, data: { type: 'error.list' } },
  });
  const failed = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport: errorList,
  });
  assert.deepStrictEqual(errorList.calls.map((c) => c.op), ['note']);
  assert.strictEqual(failed.sent, false);
  assert.strictEqual(failed.progress.noteConfirmed, false);
  assert.strictEqual(failed.reason, 'note_failed');

  const emptyBody = transport({
    note: { ok: true, status: 200, data: null },
  });
  const ambiguous = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport: emptyBody,
  });
  assert.deepStrictEqual(emptyBody.calls.map((c) => c.op), ['note']);
  assert.strictEqual(ambiguous.sent, false);
  assert.strictEqual(ambiguous.progress.noteConfirmed, false);
  assert.strictEqual(ambiguous.progress.noteAmbiguous, true);

  const mismatch = transport({
    assign: { ok: true, status: 200, data: { admin_assignee_id: 'human-9' } },
  });
  const missedSeat = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport: mismatch,
  });
  assert.deepStrictEqual(mismatch.calls.map((c) => c.op), ['note', 'assign']);
  assert.strictEqual(missedSeat.sent, false);
  assert.strictEqual(missedSeat.progress.assignConfirmed, false);
  assert.strictEqual(missedSeat.progress.noteConfirmed, true);

  const commentOnly = transport({
    note: { ok: true, status: 200, data: { conversation_parts: [{ part_type: 'comment', body: 'hi' }] } },
  });
  const noNote = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport: commentOnly,
  });
  assert.strictEqual(noNote.progress.noteConfirmed, false);
  assert.strictEqual(noNote.sent, false);

  const matched = transport({
    note: { ok: true, status: 200, data: { conversation_parts: [{ part_type: 'note', body: 'Account: 1' }] } },
    assign: { ok: true, status: 200, data: { admin_assignee_id: 'human-7' } },
  });
  const done = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport: matched,
  });
  assert.deepStrictEqual(matched.calls.map((c) => c.op), ['note', 'assign', 'message']);
  assert.strictEqual(done.sent, true);
  assert.strictEqual(done.progress.noteConfirmed, true);
  assert.strictEqual(done.progress.assignConfirmed, true);
  assert.strictEqual(matched.calls[2].body, FIXED);
}));

tests.push(test('a wiped stored confirmation is re-verified against parts before the fixed line', async () => {
  const wiped = transport();
  const result = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: '<!-- ' + handoff.HANDOFF_NOTE_MARKER + ' -->Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: { noteConfirmed: true, assignConfirmed: true, messageSent: false, assigneeId: 'human-7' },
    transport: wiped,
  });
  assert.deepStrictEqual(wiped.calls.map((c) => c.op), ['note', 'assign', 'message']);
  assert.strictEqual(result.sent, true);
  assert.notStrictEqual(wiped.calls.map((c) => c.op).join(','), 'message');
  assert.ok(String(wiped.calls[0].body).includes(handoff.HANDOFF_NOTE_MARKER));

  const blocked = transport({
    note: { ok: true, status: 200, data: null },
  });
  const held = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: { noteConfirmed: true, assignConfirmed: true, messageSent: false, assigneeId: 'human-7' },
    transport: blocked,
  });
  assert.deepStrictEqual(blocked.calls.map((c) => c.op), ['note']);
  assert.strictEqual(held.sent, false);
  assert.strictEqual(held.progress.noteConfirmed, false);
  assert.strictEqual(held.progress.messageSent, false);
}));

tests.push(test('an empty KB FAQ and a bot-owned status ping do not hand off', () => {
  const line = handoff.plainFaqCustomerLine('What is the daily loss limit?');
  assert.ok(line && line.trim().length >= 12);
  assert.strictEqual(Object.values(handoff.FIXED_MESSAGES).includes(line), false);
  assert.strictEqual(/team will review/i.test(line), false);
  assert.strictEqual(/teammate now has/i.test(line), false);

  assert.strictEqual(handoff.hasPendingHandoffCase({}), false);
  assert.strictEqual(handoff.hasPendingHandoffCase({ escalateAwaitingFirstTeammate: true }), true);
  assert.strictEqual(handoff.hasPendingHandoffCase({ lastEscalateAt: 10 }), true);
  assert.strictEqual(handoff.hasPendingHandoffCase({ fixedHandoff: { phase: 'assignment-pending' } }), true);
  assert.strictEqual(/teammate/i.test(handoff.STATUS_PING_CLARIFY), false);
  assert.strictEqual(Object.values(handoff.FIXED_MESSAGES).includes(handoff.STATUS_PING_CLARIFY), false);

  const src = indexSrc();
  const answer = src.indexOf('EMPTY faq body answer');
  const escalate = src.indexOf('EMPTY faq body escalate');
  const presend = src.indexOf('EMPTY escalation body presend_escalate');
  assert.ok(answer > 0 && answer < escalate && escalate < presend);
  const answerSlice = src.slice(answer, escalate);
  assert.ok(answerSlice.includes('plainFaqCustomerLine'));
  assert.ok(answerSlice.includes('postClientCommentOnce'));
  assert.strictEqual(answerSlice.includes('commitFixedMessageHandoff'), false);
  assert.ok(src.slice(escalate, presend).includes("path: 'main_escalate'"));
  assert.ok(src.includes('STATUS_PING clarify no pending case'));
  assert.ok(src.includes('hasPendingHandoffCase'));
  assert.ok(src.includes('STATUS_PING_CLARIFY'));
}));

tests.push(test('a team-will-review sentence in a FAQ answer regenerates or hedges', async () => {
  const ctx = {
    assigneeId: 'seat-a',
    botIds: ['seat-a'],
    state: { last_client_message: 'What is the daily loss limit?' },
  };
  assert.strictEqual(handoff.faqTeamReviewBlocked(ctx.state.last_client_message, 'The team will review this.'), true);
  assert.strictEqual(handoff.faqTeamReviewBlocked('my payout was rejected', 'The team will review this.'), false);

  let regenerated = 0;
  const answered = await targeted.runWithRegeneration({
    draft: 'The daily loss limit is described in the rules. The team will review.',
    ctx,
    regenerate() {
      regenerated += 1;
      return 'The daily loss limit is described in the challenge rules for that account type.';
    },
  });
  assert.strictEqual(regenerated, 1);
  assert.strictEqual(answered.send, true);
  assert.strictEqual(/team will review/i.test(answered.body), false);
  assert.notStrictEqual(answered.body, FIXED);
  assert.ok(answered.body.includes('daily loss'));

  const hedged = await targeted.runWithRegeneration({
    draft: 'The team will review the daily loss limit.',
    ctx,
    regenerate() {
      return 'Our team will review that question.';
    },
  });
  assert.strictEqual(hedged.send, true);
  assert.strictEqual(hedged.body, HEDGE);
  assert.strictEqual(hedged.finalReason, 'faq-team-review-hedge');
  assert.notStrictEqual(hedged.body, FIXED);

  const src = indexSrc();
  const hedge = src.indexOf('FAQ team-review hedge');
  const send = src.indexOf('if (__presend.send)');
  assert.ok(hedge > 0 && hedge < send);
}));

tests.push(test('ordinary words in password-back phrases are not stored as secrets', () => {
  sanitizer.sanitizeCredentials('password is correct horse');
  const echoed = sanitizer.sanitizeCredentials('use correct horse today');
  assert.strictEqual(echoed.includes('correct horse'), false);
  const labeled = sanitizer.sanitizeCredentials('password back');
  assert.strictEqual(labeled, 'password [secret]');
  const later = sanitizer.sanitizeCredentials('I will be back soon');
  assert.strictEqual(later.includes('back'), true);
  assert.strictEqual(later.includes('[secret]'), false);
  const neighbor = sanitizer.sanitizeCredentials('the correct answer is fine');
  assert.strictEqual(neighbor.includes('correct'), true);
  assert.strictEqual(sanitizer.sanitizeCredentials(sanitizer.LOCKED_SPREAD_TEST_REPLY), sanitizer.LOCKED_SPREAD_TEST_REPLY);
  const src = fs.readFileSync(path.join(__dirname, '../../02_statePresend/credentialSanitizer.js'), 'utf8');
  assert.ok(src.includes('{1,120}'));
  assert.strictEqual(src.includes('<.!?,]'), false);
}));

Promise.all(tests)
  .then(() => {
    console.log('OK', passed, 'passed');
  })
  .catch((err) => {
    console.error('FAIL', err);
    process.exit(1);
  });
