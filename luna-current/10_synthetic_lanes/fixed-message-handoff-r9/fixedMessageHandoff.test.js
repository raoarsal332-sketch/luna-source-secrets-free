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
const spreadGate = require('../../01_runtime/spreadAskGate');

const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const FIXED = handoff.FIXED_MESSAGES.en;

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

function transport() {
  const calls = [];
  return {
    calls,
    postNote: async (html) => {
      calls.push({ op: 'note', body: html });
      return { ok: true, status: 200, data: {} };
    },
    assign: async () => {
      calls.push({ op: 'assign' });
      return { ok: true, status: 200, data: {} };
    },
    postMessage: async (body) => {
      calls.push({ op: 'message', body });
      return { ok: true, status: 200, data: {} };
    },
  };
}

tests.push(test('status stays the R3 candidate and is not approved', () => {
  assert.strictEqual(handoff.STATUS.candidate, 'fixed-message-handoff-r3');
  assert.strictEqual(handoff.STATUS.approved, false);
  assert.strictEqual(handoff.STATUS.release, false);
}));

tests.push(test('a symbol secret also scrubs its long alphanumeric runs', () => {
  const secret = 'QBG5FetfozKz7^a?J!';
  const labeled = sanitizer.sanitizeCredentials('password is ' + secret);
  assert.strictEqual(labeled.includes(secret), false);
  assert.strictEqual(labeled.includes('QBG5FetfozKz7'), false);

  const wrapped = [
    'code {QBG5FetfozKz7}',
    'code "QBG5FetfozKz7"',
    "code 'QBG5FetfozKz7'",
    'code QBG5FetfozKz7.',
  ].join('\n');
  const draft = sanitizer.sanitizeCredentials(wrapped);
  assert.strictEqual(draft.includes('QBG5FetfozKz7'), false);
  assert.ok(draft.includes('[secret]'));

  const prompt = handoff.prepareNoteForEnglishPrompt('prompt repeats QBG5FetfozKz7 and {QBG5FetfozKz7}');
  assert.strictEqual(prompt.promptText.includes('QBG5FetfozKz7'), false);
  assert.strictEqual(prompt.text.includes('QBG5FetfozKz7'), false);

  const piece = 'cdefgh';
  sanitizer.sanitizeCredentials('password is ab!' + piece);
  const later = sanitizer.sanitizeCredentials('see {' + piece + '} and "' + piece + '" and ' + piece + 'XX');
  assert.strictEqual(later.includes('{' + piece + '}'), false);
  assert.strictEqual(later.includes('"' + piece + '"'), false);
  assert.strictEqual(later.includes(piece + 'XX'), true);
  assert.strictEqual(sanitizer.sanitizeCredentials(sanitizer.LOCKED_SPREAD_TEST_REPLY), sanitizer.LOCKED_SPREAD_TEST_REPLY);
}));

tests.push(test('owner verbatim reply is allowed on a human-assigned thread and generated text is not', () => {
  const dictated = 'Your payout review is in progress.';
  const allowed = handoff.ownerPublicReplyDecision({
    humanAssigned: true,
    verbatim: true,
    parsable: true,
    body: dictated,
  });
  assert.strictEqual(allowed.post, true);
  assert.strictEqual(allowed.verbatim, true);
  assert.strictEqual(allowed.reason, 'owner-command');
  assert.strictEqual(allowed.body, dictated);

  const generated = handoff.ownerPublicReplyDecision({
    humanAssigned: true,
    verbatim: false,
    parsable: true,
    body: 'A teammate now has this conversation.',
  });
  assert.strictEqual(generated.post, false);
  assert.strictEqual(generated.body, '');
  assert.strictEqual(generated.reason, 'generated-on-human-thread');

  const empty = handoff.ownerPublicReplyDecision({
    humanAssigned: true,
    verbatim: true,
    parsable: false,
    body: '',
  });
  assert.strictEqual(empty.post, false);
  assert.strictEqual(empty.reason, 'owner-body-empty');

  const unparsed = handoff.ownerPublicReplyDecision({
    humanAssigned: true,
    verbatim: true,
    parsable: false,
    body: '   ',
  });
  assert.strictEqual(unparsed.post, false);
  assert.strictEqual(unparsed.body, '');

  const src = indexSrc();
  const auth = src.indexOf("} else if (cmd === 'REPLY')");
  const follow = src.indexOf('AUTH_NOTE FOLLOW->');
  const authSlice = src.slice(auth, follow);
  assert.ok(authSlice.includes('ownerPublicReplyDecision'));
  assert.ok(authSlice.includes('verbatim: true'));
  assert.ok(authSlice.includes('AUTH_NOTE REPLY withheld'));
  const plan = src.indexOf("plan.verbatim = false");
  assert.ok(plan > 0 && plan < follow);
  const post = src.indexOf('async function postReply');
  assert.ok(src.slice(post, post + 700).includes('exactTemplate ? redacted : toHtml(redacted)'));
  assert.ok(src.slice(post, post + 700).includes('opts && opts.verbatim'));
}));

tests.push(test('a human note does not satisfy the handoff sequence', async () => {
  const human = {
    part_type: 'note',
    author: { id: 'human-1', type: 'admin' },
    body: 'Account: 189143<br>Problem: payout',
  };
  const bot = {
    part_type: 'note',
    author: { id: 'seat-a', type: 'admin' },
    body: 'Account: 189143<br>Problem: payout',
  };
  assert.strictEqual(handoff.noteWrittenByThisBot(human, 'seat-a'), false);
  assert.strictEqual(handoff.noteWrittenByThisBot(bot, 'seat-a'), true);
  assert.strictEqual(handoff.hasVerifiedNotePart([human], 'seat-a'), false);
  assert.strictEqual(handoff.hasVerifiedNotePart([bot], 'seat-a'), true);
  assert.strictEqual(handoff.hasVerifiedNotePart([bot]), true);

  const fresh = transport();
  const written = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: '<!-- ' + handoff.HANDOFF_NOTE_MARKER + ' -->Account: 189143<br>Problem: payout',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [human],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport: fresh,
  });
  assert.deepStrictEqual(fresh.calls.map((c) => c.op), ['note', 'assign', 'message']);
  assert.strictEqual(written.sent, true);
  assert.ok(String(fresh.calls[0].body).includes(handoff.HANDOFF_NOTE_MARKER));
  assert.strictEqual(fresh.calls[2].body, FIXED);

  const stored = transport();
  const resumed = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 189143<br>Problem: payout',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [human],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: { noteConfirmed: true, assigneeId: 'human-7', phase: 'assignment-pending' },
    transport: stored,
  });
  assert.deepStrictEqual(stored.calls.map((c) => c.op), ['assign', 'message']);
  assert.strictEqual(resumed.sent, true);

  const src = indexSrc();
  assert.ok(src.includes('hasVerifiedNotePart(parts, ARSAL_ID)'));
  assert.ok(src.includes(handoff.HANDOFF_NOTE_MARKER) || src.includes('HANDOFF_NOTE_MARKER'));
}));

tests.push(test('a missed FAQ hedges or regenerates and a negated spread does not hand off', async () => {
  const ctx = (text, extra) => ({
    ctx: Object.assign({
      assigneeId: 'seat-a',
      botIds: ['seat-a'],
      state: { last_client_message: text },
    }, extra || {}),
  });
  const faq = targeted.safeFallback('UNANSWERED draft', { hardFails: [{ code: 'MISSED_QUESTION' }] }, ctx('what is the daily drawdown?'));
  assert.strictEqual(faq.send, true);
  assert.strictEqual(faq.reason, 'faq-miss-hedge');
  assert.strictEqual(faq.body, HEDGE);
  assert.notStrictEqual(faq.body, FIXED);

  const gap = targeted.safeFallback('UNANSWERED draft', { hardFails: [{ code: 'MISSED_QUESTION' }] }, ctx('what is the daily drawdown?', { knowledge: { level: 'none' } }));
  assert.strictEqual(gap.send, false);
  assert.strictEqual(gap.reason, 'needs-escalate');
  assert.notStrictEqual(gap.body, FIXED);

  const negatedText = 'this is not about the spread, what is the daily loss limit?';
  assert.strictEqual(spreadGate.explain(negatedText).reason, 'negated-spread');
  assert.strictEqual(spreadGate.isSpreadCheckAsk(negatedText), false);
  const negated = targeted.safeFallback('UNANSWERED spread reply', { hardFails: [{ code: 'MISSED_QUESTION' }] }, ctx(negatedText));
  assert.strictEqual(negated.send, true);
  assert.strictEqual(negated.body, HEDGE);
  assert.notStrictEqual(negated.body, FIXED);

  const own = targeted.safeFallback('UNANSWERED case', { hardFails: [{ code: 'MISSED_QUESTION' }] }, ctx('my payout was rejected'));
  assert.strictEqual(own.send, false);
  assert.strictEqual(own.reason, 'needs-escalate');

  let regenerated = 0;
  const fixedLine = await targeted.runWithRegeneration({
    draft: 'UNANSWERED',
    ctx: { assigneeId: 'seat-a', botIds: ['seat-a'], state: { last_client_message: 'what is the daily drawdown?' } },
    regenerate: async () => {
      regenerated += 1;
      return 'The daily loss limit is stated in the challenge rules.';
    },
  });
  assert.strictEqual(regenerated, 1);
  assert.strictEqual(fixedLine.send, true);
  assert.strictEqual(fixedLine.regenerated, true);
  assert.notStrictEqual(fixedLine.body, FIXED);
  assert.ok(fixedLine.body.includes('daily loss limit'));

  const src = indexSrc();
  const missed = src.indexOf('FIXED_MESSAGE_HANDOFF_R3:missed_escalation');
  const before = src.slice(missed - 1600, missed);
  assert.ok(before.includes('__faqMiss'));
  assert.ok(before.includes('__spreadNegated'));
  assert.ok(before.includes("reason === 'negated-spread'"));
}));

Promise.all(tests)
  .then(() => {
    console.log('OK', passed, 'passed');
  })
  .catch((err) => {
    console.error('FAIL', err);
    process.exit(1);
  });
