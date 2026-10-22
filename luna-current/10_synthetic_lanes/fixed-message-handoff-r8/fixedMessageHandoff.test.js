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
    },
    validate(body) {
      const text = String(body || '');
      if (/\d/.test(text) && !/I can't confirm that figure/.test(text)) {
        return {
          ok: false,
          hardFails: [{ code: 'UNSUPPORTED_NUMBER' }],
          correctionInstruction: 'remove the figure',
          softWarnings: [],
        };
      }
      return { ok: true, hardFails: [], softWarnings: [] };
    },
  },
};

const handoff = require('../../01_runtime/fixedMessageHandoff');
const sanitizer = require('../../02_statePresend/credentialSanitizer');
const targeted = require('../../02_statePresend/targetedRegeneration');
const guard = require('../../01_runtime/challengeVariantGuard');
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

function transportFor(statusOf) {
  const calls = [];
  const messages = [];
  return {
    calls,
    messages,
    postNote: async () => {
      calls.push('note');
      return { ok: true, status: 200, data: {} };
    },
    assign: async () => {
      calls.push('assign');
      const status = statusOf();
      return { ok: status >= 200 && status < 300, status, data: {} };
    },
    postMessage: async (body) => {
      calls.push('message');
      messages.push(body);
      return { ok: true, status: 200, data: {} };
    },
  };
}

tests.push(test('status stays the R3 candidate and is not approved', () => {
  assert.strictEqual(handoff.STATUS.candidate, 'fixed-message-handoff-r3');
  assert.strictEqual(handoff.STATUS.approved, false);
  assert.strictEqual(handoff.STATUS.release, false);
  const san = fs.readFileSync(path.join(__dirname, '../../02_statePresend/credentialSanitizer.js'), 'utf8');
  assert.ok(san.includes('{1,120}'));
  assert.ok(!san.includes('<.!?,]'));
}));

tests.push(test('a failed assignment stays pending and a note is not an answer', async () => {
  let assignStatus = 422;
  const transport = transportFor(() => assignStatus);
  const note = {
    part_type: 'note',
    body: 'Account: 189143\nProblem: payout rejected',
    author: { id: 'seat-a', type: 'admin' },
  };
  const first = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 189143<br>Problem: payout rejected',
    assigneeId: 'human-7',
    parts: [],
    botId: 'seat-a',
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport,
  });
  assert.strictEqual(first.sent, false);
  assert.strictEqual(first.reason, 'assign_422');
  assert.strictEqual(first.progress.noteConfirmed, true);
  assert.strictEqual(first.progress.assignConfirmed, false);
  assert.strictEqual(first.progress.assignAmbiguous, false);
  assert.strictEqual(first.progress.messageSent, false);
  assert.strictEqual(first.progress.phase, 'assignment-pending');
  assert.deepStrictEqual(transport.calls, ['note', 'assign']);
  assert.strictEqual(handoff.isPublicCustomerReply(note), false);
  assert.strictEqual(handoff.isPublicCustomerReply({ part_type: 'assignment', body: 'assigned', author: { id: 'seat-a' } }), false);
  assert.strictEqual(handoff.isPublicCustomerReply({ part_type: 'comment', body: 'hello there', author: { id: 'seat-a' } }), true);

  assignStatus = 200;
  transport.calls.length = 0;
  const second = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 189143<br>Problem: payout rejected',
    assigneeId: 'human-7',
    parts: [note],
    botId: 'seat-a',
    conversation: { admin_assignee_id: 'seat-a' },
    progress: first.progress,
    transport,
  });
  assert.deepStrictEqual(transport.calls, ['assign', 'message']);
  assert.strictEqual(second.sent, true);
  assert.strictEqual(second.progress.phase, 'completed');
  assert.strictEqual(second.progress.messageSent, true);
  assert.deepStrictEqual(transport.messages, [FIXED]);

  transport.calls.length = 0;
  const third = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 189143<br>Problem: payout rejected',
    assigneeId: 'human-7',
    parts: [note],
    botId: 'seat-a',
    conversation: { admin_assignee_id: 'human-7' },
    progress: second.progress,
    transport,
  });
  assert.deepStrictEqual(transport.calls, []);
  assert.strictEqual(third.reason, 'already_sent');

  const ambiguous = transportFor(() => 500);
  const failed = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 189143<br>Problem: payout rejected',
    assigneeId: 'human-7',
    parts: [],
    botId: 'seat-a',
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport: ambiguous,
  });
  assert.strictEqual(failed.reason, 'assign_500');
  assert.strictEqual(failed.progress.assignAmbiguous, true);
  assert.notStrictEqual(failed.progress.phase, 'assignment-pending');
  assert.deepStrictEqual(ambiguous.calls, ['note', 'assign']);
  ambiguous.calls.length = 0;
  const replay = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 189143<br>Problem: payout rejected',
    assigneeId: 'human-7',
    parts: [note],
    botId: 'seat-a',
    conversation: { admin_assignee_id: 'seat-a' },
    progress: failed.progress,
    transport: ambiguous,
  });
  assert.deepStrictEqual(ambiguous.calls, []);
  assert.strictEqual(replay.reason, 'assign_ambiguous_held');

  const src = indexSrc();
  const replied = src.indexOf('function arsalAlreadyRepliedAfter');
  const skip = src.indexOf('SKIP already replied after user part');
  const recovery = src.indexOf('FIXED_MESSAGE_HANDOFF_R3:recovery');
  assert.ok(replied > 0 && replied < skip && skip < recovery);
  assert.ok(src.slice(replied, src.indexOf('function firstNameFromClient', replied)).includes('isPublicCustomerReply'));
}));

tests.push(test('the approved number hedge is terminal', async () => {
  const plain = 'The limit is fine.';
  const clarified = guard.clarifyTwoStepReply('explain the 2-step rules', [], plain, [], 'c1');
  assert.notStrictEqual(clarified, plain);
  assert.ok(/2-Step Lite/.test(clarified));
  assert.strictEqual(guard.clarifyTwoStepReply('explain the 2-step rules', [], HEDGE, [], 'c1'), HEDGE);
  const prior = ['We offer 2-Step Lite and 2-Step + Free Retry. Which one?'];
  const explained = guard.explainTwoStepFollowup('what do you mean', prior, plain, 'c1');
  assert.notStrictEqual(explained, plain);
  assert.strictEqual(guard.explainTwoStepFollowup('what do you mean', prior, HEDGE, 'c1'), HEDGE);

  let regenerated = 0;
  const again = await targeted.runWithRegeneration({
    draft: HEDGE,
    ctx: {
      assigneeId: 'seat-a',
      botIds: ['seat-a'],
      state: { last_client_message: 'max daily drawdown is 14%' },
    },
    regenerate: async () => {
      regenerated += 1;
      return 'The max daily drawdown is 5%. A teammate now has this conversation.';
    },
  });
  assert.strictEqual(regenerated, 0);
  assert.strictEqual(again.regenerated, false);
  assert.strictEqual(again.body, HEDGE);
  assert.strictEqual(again.finalReason, 'unsupported-number-hedge');
  assert.notStrictEqual(again.body, FIXED);

  const held = targeted.safeFallback(HEDGE, { hardFails: [{ code: 'MISSED_ESCALATION' }] }, {
    ctx: { assigneeId: 'human-1', botIds: ['seat-a'], state: { last_client_message: 'max daily drawdown is 14%' } },
  });
  assert.strictEqual(held.send, false);
  assert.strictEqual(held.body, '');
  assert.strictEqual(held.reason, 'unsupported-number-held');

  const src = indexSrc();
  const inner = src.indexOf('async function postClientCommentOnceInner');
  const exact = src.indexOf("isExactAllowedTemplate(String(body || ''))", inner);
  const terminal = src.indexOf('isTerminalHedge', exact);
  const welcome = src.indexOf('ensureFirstReplyWelcomeIntro', exact);
  assert.ok(exact < terminal && terminal < welcome);
  const post = src.indexOf('async function postReply');
  assert.ok(src.slice(post, post + 700).includes('exactTemplate ? redacted : toHtml(redacted)'));
  assert.ok(src.slice(post, post + 700).includes('isTerminalHedge'));
  const wrapper = src.indexOf('if (fixedMessageHandoff.isExactAllowedTemplate(raw)) return String(raw);');
  assert.ok(src.slice(wrapper, wrapper + 220).includes('isTerminalHedge'));
}));

tests.push(test('missed escalation uses the original draft, not the post-hedge body', () => {
  const payout = {
    ctx: {
      assigneeId: 'seat-a',
      botIds: ['seat-a'],
      state: { last_client_message: 'my payout was rejected' },
    },
  };
  const spread = sanitizer.LOCKED_SPREAD_TEST_REPLY;
  const hedged = targeted.safeFallback(spread, { hardFails: [{ code: 'MISSED_ESCALATION' }, { code: 'UNSUPPORTED_NUMBER' }] }, payout);
  assert.strictEqual(hedged.send, true);
  assert.strictEqual(hedged.body, HEDGE);
  assert.strictEqual(hedged.reason, 'spread-template-not-asked');
  assert.notStrictEqual(hedged.body, FIXED);
  const near = targeted.safeFallback(
    'Platform: MetaTrader 5\nServer: Fundedelite-Server\nAccount Number: 55188\nUse this account to check spreads.',
    { hardFails: [{ code: 'MISSED_ESCALATION' }] },
    payout
  );
  assert.strictEqual(near.body, HEDGE);
  assert.strictEqual(spreadGate.isSpreadCheckAsk('my payout was rejected'), false);
  assert.strictEqual(spreadGate.isSpreadCheckAsk('can you check the spreads'), true);

  const src = indexSrc();
  const captured = src.indexOf('__originalDraft = String((parsed && parsed.body) || \'\')');
  const notHandoff = src.indexOf('SPREAD_TEMPLATE not a handoff');
  const main = src.indexOf('FIXED_MESSAGE_HANDOFF_R3:main_escalate');
  const missed = src.indexOf('FIXED_MESSAGE_HANDOFF_R3:missed_escalation');
  assert.ok(captured > 0 && captured < notHandoff && notHandoff < main && main < missed);
  assert.ok(src.slice(notHandoff - 400, notHandoff).includes('__originalDraft'));
  assert.ok(src.slice(notHandoff - 400, notHandoff).includes('isAccountNumberQuestion'));
  const beforeMissed = src.slice(missed - 1400, missed);
  assert.ok(beforeMissed.includes('__originalDraft'));
  assert.ok(beforeMissed.includes('isSpreadCheckAsk(text)'));
  assert.ok(beforeMissed.includes('PRESEND hedge instead of fixed line'));
  assert.ok(beforeMissed.includes('isTerminalHedge(__originalDraft)'));
  const replyHedge = src.indexOf('SPREAD_TEMPLATE hedge terminal');
  const explain = src.indexOf('body = challengeVariantGuard.explainTwoStepFollowup');
  assert.ok(replyHedge > 0 && replyHedge < explain);
  assert.ok(!src.slice(notHandoff, main).includes(FIXED));
}));

tests.push(test('echoes of a redacted secret are scrubbed in every normalized form', () => {
  const sk = 'sk-Aa1Bb2Cc3Dd4Ee5Ff6';
  const bearer = 'Zz9Yy8Xx7Ww6Vv5Uu4Tt3';
  const symbol = 'p@ss!w0rd^zz';
  const word = 'quill9pen';
  const customer = [
    'password is ' + word + '!',
    'token is ' + symbol,
    'key ' + sk + '.',
    'Authorization: Bearer ' + bearer + '.',
  ].join('\n');
  const redactedCustomer = sanitizer.sanitizeCredentials(customer);
  assert.strictEqual(redactedCustomer.includes(word), false);
  assert.strictEqual(redactedCustomer.includes(symbol), false);
  assert.strictEqual(redactedCustomer.includes(sk), false);
  assert.strictEqual(redactedCustomer.includes(bearer), false);
  assert.ok(redactedCustomer.includes('[secret]'));
  assert.strictEqual(redactedCustomer.includes('Bearer [secret]'), true);

  const wide = Array.from(word).map((ch) => ch.normalize('NFKC')).join('');
  const fullwidth = Array.from(word).map((ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0)).join('');
  const spacedSymbol = Array.from(symbol).join(' ');
  const draft = [
    'use ' + word + '.',
    '(' + word + ')',
    '.' + word,
    word + '\u200b' + '',
    'code ' + word.slice(0, 5) + '\u200b' + word.slice(5),
    fullwidth,
    wide,
    symbol,
    spacedSymbol,
    '(' + symbol + ').',
    sk + '.',
    sk,
    'Bearer ' + bearer + '.',
    bearer,
    'account 189143 stays',
    'quill9penextra stays',
    'xquill9pen stays',
  ].join('\n');
  // The zero-width case above inserts the mark between the two halves.
  const publicReply = sanitizer.sanitizeCredentials(draft);
  const lines = publicReply.split('\n');
  const kept = lines.filter((line) => /189143|quill9penextra|xquill9pen/.test(line));
  const scrubbed = lines.filter((line) => !/189143|quill9penextra|xquill9pen/.test(line));
  for (const line of scrubbed) {
    assert.strictEqual(line.includes(word), false, line);
    assert.strictEqual(line.includes(symbol), false, line);
    assert.strictEqual(line.includes(sk), false, line);
    assert.strictEqual(line.includes(bearer), false, line);
    assert.strictEqual(line.includes(fullwidth), false, line);
    assert.ok(line.includes('[secret]'), line);
  }
  assert.strictEqual(kept.join('\n').includes('189143'), true);
  assert.strictEqual(kept.join('\n').includes('quill9penextra'), true);
  assert.strictEqual(kept.join('\n').includes('xquill9pen'), true);

  const note = handoff.redactCredentials('Note body repeats ' + word + '. and ' + sk + '.');
  assert.strictEqual(note.includes(word), false);
  assert.strictEqual(note.includes(sk), false);
  const prompt = handoff.prepareNoteForEnglishPrompt('prompt has ' + symbol + ' and ' + bearer + '.');
  assert.strictEqual(prompt.promptText.includes(symbol), false);
  assert.strictEqual(prompt.promptText.includes(bearer), false);
  assert.strictEqual(prompt.text.includes(symbol), false);
  const again = sanitizer.sanitizeCredentials(publicReply);
  assert.strictEqual(again, publicReply);
}));

tests.push(test('an empty escalation body routes to presend_escalate', () => {
  const src = indexSrc();
  const fnMatch = src.match(/function isClearlyAccountSpecificIssue\(text\) \{[\s\S]*?\n\}/);
  assert.ok(fnMatch);
  const isClearlyAccountSpecificIssue = new Function(
    'text',
    fnMatch[0] + '\nreturn isClearlyAccountSpecificIssue(text);'
  );
  assert.strictEqual(isClearlyAccountSpecificIssue('my payout was rejected'), true);
  assert.strictEqual(isClearlyAccountSpecificIssue('what is the spread?'), false);

  const empty = src.indexOf('EMPTY escalation body presend_escalate');
  const skip = src.indexOf('SKIP empty reply body');
  const faq = src.indexOf('EMPTY faq body escalate');
  assert.ok(faq > 0 && faq < empty && empty < skip);
  const window = src.slice(empty - 500, skip);
  assert.ok(window.includes('isClearlyAccountSpecificIssue'));
  assert.ok(window.includes("path: 'presend_escalate'"));
  assert.ok(window.includes('commitFixedMessageHandoff'));
  assert.ok(src.slice(faq, empty).includes("path: 'main_escalate'"));
}));

tests.push(test('an eligible spread ask on user.created bypasses the Fin wait after ownership', () => {
  const src = indexSrc();
  const own = src.indexOf('if (owned.silent || humanCommented || foreignOwner)');
  const finCall = src.indexOf('if (shouldWaitForFin(full, text, topic))');
  assert.ok(own > 0 && own < finCall);
  const ownBlock = src.slice(src.indexOf('FIXED_MESSAGE_HANDOFF_R4:ownership_before_hook_a'), own);
  assert.ok(ownBlock.includes('classifyOwnership'));
  assert.ok(ownBlock.includes('pendingAssignee'));
  assert.ok(!ownBlock.includes('deliverAccountQuestionAnswer'));
  assert.ok(!ownBlock.includes('postClientCommentOnce'));
  const fn = src.indexOf('function shouldWaitForFin');
  const created = src.indexOf("topic === 'conversation.user.created'", fn);
  const live = src.indexOf('FIN_WAIT bypass live-agent user.created', created);
  const spread = src.indexOf('FIN_WAIT bypass spread user.created', live);
  const wait = src.indexOf('SKIP fin-wait user.created', spread);
  assert.ok(created < live && live < spread && spread < wait);
  assert.ok(src.slice(created, live).includes('clientRequestedLiveAgent'));
  assert.ok(src.slice(created, live).includes('isPureLiveAgentAsk'));
  assert.ok(src.slice(live, spread).includes('isSpreadCheckAsk'));
  assert.strictEqual(handoff.isPureLiveAgentAsk('are you a bot or a real person?'), false);
  assert.strictEqual(handoff.isAccountNumberQuestion('what is my account number?'), true);
  assert.strictEqual(sanitizer.sanitizeCredentials(sanitizer.LOCKED_SPREAD_TEST_REPLY), sanitizer.LOCKED_SPREAD_TEST_REPLY);
}));

Promise.all(tests)
  .then(() => {
    console.log('OK', passed, 'passed');
  })
  .catch((err) => {
    console.error('FAIL', err);
    process.exit(1);
  });
