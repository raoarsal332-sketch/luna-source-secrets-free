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
      if (/\d/.test(text)) {
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

function indexSrc() {
  return fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
}

function recordingTransport(script) {
  const calls = [];
  const plan = script || {};
  async function take(op) {
    calls.push(op);
    if (plan[op]) return plan[op];
    return { ok: true, status: 200, data: { id: 'conv-synthetic' } };
  }
  return {
    calls,
    postNote: () => take('note'),
    assign: () => take('assign'),
    postMessage: () => take('message'),
  };
}

function decide(text, pathName, extra) {
  return handoff.decide(Object.assign({
    path: pathName || 'welcome',
    latestText: text,
    parts: [],
    full: { admin_assignee_id: 'seat-a', team_assignee_id: '0' },
    botId: 'seat-a',
    ownershipOpts: OWN,
  }, extra || {}));
}

function fixedDecision() {
  return { action: 'fixed_message', silent: false, language: 'en', message: handoff.FIXED_MESSAGES.en };
}

tests.push(test('status stays the R3 candidate and is not approved', () => {
  assert.strictEqual(handoff.STATUS.candidate, 'fixed-message-handoff-r3');
  assert.strictEqual(handoff.STATUS.approved, false);
  assert.strictEqual(handoff.STATUS.release, false);
  assert.deepStrictEqual(Object.keys(handoff.FIXED_MESSAGES).sort(), ['en']);
}));

tests.push(test('ownership suppression runs before every new public path', () => {
  const src = indexSrc();
  const own = src.indexOf('FIXED_MESSAGE_HANDOFF_R4:ownership_before_hook_a');
  const silent = src.indexOf('if (owned.silent || humanCommented || foreignOwner)', own);
  const identity = src.indexOf('ASSISTANT_IDENTITY answer', silent);
  const fresh = src.indexOf('FIXED_HANDOFF fresh account-question', silent);
  const fin = src.indexOf('if (shouldWaitForFin(full, text, topic))', silent);
  assert.ok(own > 0 && own < silent && silent < identity && identity < fresh && fresh < fin);
  const beforeReturn = src.slice(own, silent);
  assert.ok(beforeReturn.includes('classifyOwnership'));
  assert.strictEqual(beforeReturn.includes('deliverAccountQuestionAnswer'), false);
  assert.strictEqual(beforeReturn.includes('postClientCommentOnce'), false);
  const humanIdentity = decide('are you a bot or a real person?', 'welcome', {
    full: { admin_assignee_id: 'human-1', team_assignee_id: '0' },
    parts: [{ part_type: 'comment', author: { type: 'admin', id: 'human-1' }, body: 'Looking at this now.' }],
  });
  assert.strictEqual(humanIdentity.action, 'silence');
  const botAccount = decide('what is my account number?', 'welcome');
  assert.strictEqual(botAccount.action, 'route_normal');
  assert.strictEqual(botAccount.reason, 'account_number_question');
}));

tests.push(test('a note is confirmed only after a verified write, and lost stores need both parts', async () => {
  const note = {
    part_type: 'note',
    author: { id: 'seat-a', type: 'admin' },
    body: 'Account: 189143<br>Problem: payout',
  };
  const assignment = {
    part_type: 'assignment',
    assignee_id: 'human-7',
    assigned_to: { id: 'human-7' },
    created_at: 10,
  };
  const comment = {
    part_type: 'comment',
    author: { id: 'human-1', type: 'admin' },
    body: 'Account: 189143 Problem: payout',
  };
  assert.strictEqual(handoff.hasVerifiedNotePart([comment]), false);
  assert.strictEqual(handoff.hasVerifiedNotePart([note]), true);
  assert.strictEqual(handoff.hasAssignmentPart([assignment], 'seat-a'), true);
  assert.strictEqual(handoff.hasAssignmentPart([], 'seat-a'), false);
  const handoffSrc = fs.readFileSync(path.join(__dirname, '../../01_runtime/fixedMessageHandoff.js'), 'utf8');
  const assigneeFn = handoffSrc.slice(
    handoffSrc.indexOf('function assigneeFromParts'),
    handoffSrc.indexOf('function fixedLineInParts')
  );
  assert.strictEqual(assigneeFn.includes('admin_assignee_id'), false);

  const failed = recordingTransport({ note: { ok: false, status: 500 } });
  const failedResult = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 189143<br>Problem: payout',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    transport: failed,
  });
  assert.deepStrictEqual(failed.calls, ['note']);
  assert.strictEqual(failedResult.progress.noteConfirmed, false);
  assert.strictEqual(failedResult.progress.noteAmbiguous, true);
  assert.strictEqual(failedResult.sent, false);

  const partial = recordingTransport({ note: { ok: false, status: 200, partial: true } });
  const partialResult = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 189143<br>Problem: payout',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    transport: partial,
  });
  assert.deepStrictEqual(partial.calls, ['note']);
  assert.strictEqual(partialResult.progress.noteConfirmed, false);
  assert.strictEqual(partialResult.reason, 'note_partial');

  const replay = recordingTransport();
  const replayResult = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 189143<br>Problem: payout',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: failedResult.progress,
    transport: replay,
  });
  assert.deepStrictEqual(replay.calls, []);
  assert.strictEqual(replayResult.reason, 'note_ambiguous_held');
  assert.strictEqual(replayResult.progress.noteConfirmed, false);

  const commentOnly = recordingTransport();
  await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 189143<br>Problem: payout',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [comment],
    conversation: { admin_assignee_id: 'seat-a' },
    transport: commentOnly,
  });
  assert.deepStrictEqual(commentOnly.calls, ['note', 'assign', 'message']);

  const owed = recordingTransport();
  const owedResult = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 189143<br>Problem: payout',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [note, assignment],
    conversation: { admin_assignee_id: 'human-7' },
    ownershipOpts: Object.assign({ handoffAssigneeId: 'human-7' }, OWN),
    transport: owed,
  });
  assert.deepStrictEqual(owed.calls, ['message']);
  assert.strictEqual(owedResult.sent, true);
  assert.strictEqual(owedResult.message, handoff.FIXED_MESSAGES.en);

  const src = indexSrc();
  const owe = src.indexOf('const oweFixedLine');
  const oweSlice = src.slice(owe, owe + 600);
  assert.ok(oweSlice.includes('hasVerifiedNotePart'));
  assert.ok(oweSlice.includes('hasAssignmentPart'));
  assert.ok(oweSlice.includes('storesLookLost'));
}));

tests.push(test('unsupported numbers hedge, including a holding time and a regenerated figure', async () => {
  const hedge = "I can't confirm that figure from the approved details, so I won't guess a number.";
  assert.strictEqual(targeted.HEDGE_REPLY, hedge);
  assert.strictEqual(/\d/.test(hedge), false);
  assert.strictEqual(/teammate/i.test(hedge), false);
  assert.strictEqual(Object.values(handoff.FIXED_MESSAGES).includes(hedge), false);

  const holding = targeted.safeFallback('the holding time is 99 minutes', {
    hardFails: [{ code: 'UNSUPPORTED_NUMBER' }],
  }, {
    ctx: { assigneeId: 'seat-a', botIds: ['seat-a', 'seat-e'], state: { last_client_message: 'how long is the holding time?' } },
  });
  assert.strictEqual(holding.send, true);
  assert.strictEqual(holding.reason, 'unsupported-number-hedge');
  assert.strictEqual(holding.body, hedge);

  const drawdown = targeted.safeFallback('max daily drawdown is 14%', {
    hardFails: [{ code: 'UNSUPPORTED_NUMBER' }],
  }, {
    ctx: { assigneeId: 'seat-a', botIds: ['seat-a'], state: { last_client_message: 'what is the max daily drawdown?' } },
  });
  assert.strictEqual(drawdown.body, hedge);
  assert.strictEqual(/\d/.test(drawdown.body), false);

  const owned = targeted.safeFallback('max daily drawdown is 14%', {
    hardFails: [{ code: 'UNSUPPORTED_NUMBER' }],
  }, {
    ctx: { assigneeId: 'human-1', botIds: ['seat-a', 'seat-e'], state: { last_client_message: 'what is the max daily drawdown?' } },
  });
  assert.strictEqual(owned.send, false);
  assert.strictEqual(owned.reason, 'unsupported-number-held');

  const stillBad = await targeted.runWithRegeneration({
    draft: 'the holding time is 99 minutes',
    ctx: { assigneeId: 'seat-a', botIds: ['seat-a'], state: { last_client_message: 'how long is the holding time?' } },
    regenerate() { return 'max daily drawdown is 14%'; },
  });
  assert.strictEqual(stillBad.send, true);
  assert.strictEqual(stillBad.finalReason, 'unsupported-number-hedge');
  assert.strictEqual(stillBad.body, hedge);

  const humanAsk = targeted.safeFallback('', { hardFails: [{ code: 'MISSED_ESCALATION' }] }, {
    ctx: { state: { last_client_message: 'please get me a human' } },
  });
  assert.strictEqual(humanAsk.send, false);
  assert.strictEqual(humanAsk.body, '');

  const src = indexSrc();
  const hedgeLog = src.indexOf('PRESEND hedge instead of fixed line');
  const missed = src.indexOf('FIXED_MESSAGE_HANDOFF_R3:missed_escalation');
  assert.ok(hedgeLog > 0 && hedgeLog < missed);
  const empty = src.indexOf('EMPTY faq body escalate');
  const skip = src.indexOf('SKIP empty reply body', empty);
  assert.ok(empty > 0 && empty < skip);
  assert.ok(src.slice(empty, skip).includes('commitFixedMessageHandoff'));
  assert.ok(src.slice(empty - 500, empty).includes('isClearKbFaqAsk'));
  assert.ok(src.slice(empty - 500, empty).includes('isGeneralPolicyQuestion'));
}));

tests.push(test('a spread template or near-miss does not hand off a payout ask', () => {
  const spread = sanitizer.LOCKED_SPREAD_TEST_REPLY;
  const near = 'TEST SPREAD ACCOUNT DETAILS\nPlatform: MetaTrader 5\nServer: Fundedelite-Server\nPassword: QBG5FetfozKz7^a?J!';
  assert.strictEqual(handoff.isSpreadTemplateDraft(spread), true);
  assert.strictEqual(handoff.isExactAllowedTemplate(spread), true);
  assert.strictEqual(handoff.isSpreadTemplateDraft(near), true);
  assert.strictEqual(handoff.isExactAllowedTemplate(near), false);

  const payout = {
    ctx: { assigneeId: 'seat-a', botIds: ['seat-a'], state: { last_client_message: 'what is my payout?' } },
  };
  const exact = targeted.safeFallback(spread, { hardFails: [{ code: 'UNSUPPORTED_NUMBER' }] }, payout);
  assert.strictEqual(exact.send, true);
  assert.strictEqual(exact.reason, 'spread-template-not-asked');
  assert.strictEqual(exact.body, targeted.HEDGE_REPLY);
  assert.strictEqual(exact.body.includes('QBG5'), false);
  assert.strictEqual(Object.values(handoff.FIXED_MESSAGES).includes(exact.body), false);

  const missed = targeted.safeFallback(near, { hardFails: [{ code: 'WRONG_TOPIC' }] }, payout);
  assert.strictEqual(missed.reason, 'spread-template-not-asked');
  assert.strictEqual(missed.body, targeted.HEDGE_REPLY);

  const owned = targeted.safeFallback(spread, { hardFails: [{ code: 'UNSUPPORTED_NUMBER' }] }, {
    ctx: { assigneeId: 'human-1', botIds: ['seat-a'], state: { last_client_message: 'what is my payout?' } },
  });
  assert.strictEqual(owned.send, false);
  assert.strictEqual(owned.reason, 'spread-template-held');

  const fact = handoff.accountQuestionCustomerLine('what is my account number?', spread);
  assert.strictEqual(fact, handoff.ACCOUNT_QUESTION_LINES.en);
  assert.strictEqual(fact.includes('QBG5'), false);
  assert.strictEqual(fact.includes('55188'), false);

  const src = indexSrc();
  const block = src.indexOf('SPREAD_TEMPLATE not a handoff');
  const marker = src.indexOf('FIXED_MESSAGE_HANDOFF_R3:main_escalate');
  assert.ok(block > 0 && block < marker);
  assert.ok(src.slice(block - 400, block).includes('isAccountNumberQuestion'));
}));

tests.push(test('credentials survive NFKC, format characters, spaced labels, symbols, and normalized echoes', () => {
  const spread = sanitizer.LOCKED_SPREAD_TEST_REPLY;
  assert.strictEqual(sanitizer.sanitizeCredentials(spread), spread);

  const symbols = sanitizer.sanitizeCredentials('password is a?b!c^d');
  assert.strictEqual(symbols, 'password is [secret]');
  assert.strictEqual(symbols.includes('?'), false);
  assert.strictEqual(symbols.includes('!'), false);

  const spacedLabel = sanitizer.sanitizeCredentials('p a s s w o r d is hunter2');
  assert.strictEqual(spacedLabel.includes('hunter2'), false);
  assert.strictEqual(spacedLabel.includes('[secret]'), true);

  const zwsp = sanitizer.sanitizeCredentials('p\u200ba\u200bs\u200bs\u200bw\u200bo\u200br\u200bd is zwspSecret');
  assert.strictEqual(zwsp.includes('zwspSecret'), false);

  const chunks = sanitizer.sanitizeCredentials('password: a b c d e f g h i j k');
  assert.strictEqual(chunks, 'password: [secret]');

  const fullwidth = sanitizer.sanitizeCredentials('\uff50\uff41\uff53\uff53\uff57\uff4f\uff52\uff44 is secret99');
  assert.strictEqual(fullwidth.includes('secret99'), false);
  assert.strictEqual(fullwidth.includes('[secret]'), true);

  const echoed = sanitizer.sanitizeCredentials('please use s e c r e t 9 9 today');
  assert.strictEqual(echoed, 'please use [secret] today');
  const wideEcho = sanitizer.sanitizeCredentials('code \uff53\uff45\uff43\uff52\uff45\uff54\uff19\uff19 end');
  assert.strictEqual(wideEcho, 'code [secret] end');

  const kept = sanitizer.sanitizeCredentials('password is hunter2 and account 189143');
  assert.strictEqual(kept.includes('189143'), true);
  assert.strictEqual(kept.includes('hunter2'), false);
  assert.strictEqual(sanitizer.sanitizeCredentials("password's [secret]"), "password's [secret]");
}));

tests.push(test('the locked spread reply is byte-exact on the first message', () => {
  const src = indexSrc();
  const inner = src.indexOf('async function postClientCommentOnceInner');
  const exact = src.indexOf("isExactAllowedTemplate(String(body || ''))", inner);
  const welcome = src.indexOf('ensureFirstReplyWelcomeIntro', exact);
  assert.ok(inner > 0 && exact > inner && exact < welcome);
  assert.ok(src.slice(exact, welcome).includes('return postReply'));
  const post = src.indexOf('async function postReply');
  const postSlice = src.slice(post, post + 700);
  assert.ok(postSlice.includes('exactTemplate ? redacted : toHtml(redacted)'));
  const intro = src.indexOf('function ensureFirstReplyWelcomeIntro');
  const introSlice = src.slice(intro, intro + 1600);
  const exactIntro = introSlice.indexOf('isExactAllowedTemplate');
  const hello = introSlice.indexOf("'Hello,'");
  assert.ok(exactIntro > 0 && hello > exactIntro);
  assert.ok(introSlice.slice(exactIntro, hello).includes('return text'));
  const spread = sanitizer.LOCKED_SPREAD_TEST_REPLY;
  assert.strictEqual(handoff.redactCredentials(spread), spread);
  assert.strictEqual(spread.startsWith('TEST SPREAD ACCOUNT DETAILS'), true);
  assert.strictEqual(spread.includes('Hello'), false);
}));

tests.push(test('a live-agent request on user.created bypasses the Fin wait after ownership', () => {
  const src = indexSrc();
  const own = src.indexOf('if (owned.silent || humanCommented || foreignOwner)');
  const finCall = src.indexOf('if (shouldWaitForFin(full, text, topic))');
  assert.ok(own > 0 && own < finCall);
  const fn = src.indexOf('function shouldWaitForFin');
  const created = src.indexOf("topic === 'conversation.user.created'", fn);
  const bypass = src.indexOf('FIN_WAIT bypass live-agent user.created', created);
  const wait = src.indexOf('SKIP fin-wait user.created', bypass);
  assert.ok(fn > 0 && created < bypass && bypass < wait);
  const gate = src.slice(created, bypass);
  assert.ok(gate.includes('clientRequestedLiveAgent'));
  assert.ok(gate.includes('isPureLiveAgentAsk'));
  assert.strictEqual(handoff.isPureLiveAgentAsk('je veux parler à un agent'), true);
  assert.strictEqual(handoff.isPureLiveAgentAsk('are you a bot or a real person?'), false);
  assert.strictEqual(handoff.isPureLiveAgentAsk('what is my account number?'), false);
  assert.strictEqual(handoff.isPureLiveAgentAsk('ما هي قواعد السحب؟'), false);
}));

tests.push(test('new languages use structure and the English line when no translation is approved', () => {
  const accounts = [
    ['fr', 'quel est mon numéro de compte'],
    ['de', 'wie lautet meine kontonummer'],
    ['nl', 'wat is mijn rekeningnummer'],
    ['es', 'cuál es mi número de cuenta'],
    ['pt', 'qual é o meu número da conta'],
    ['tr', 'hesap numaram nedir'],
    ['pl', 'jaki jest mój numer konta'],
    ['id', 'berapa nomor rekening saya'],
    ['ru', 'какой мой номер счета'],
    ['zh', '我的账号是什么'],
    ['ja', '口座番号は何ですか'],
  ];
  for (const [lang, text] of accounts) {
    assert.strictEqual(handoff.detectLanguage(text), lang, text);
    assert.strictEqual(handoff.isAccountNumberQuestion(text), true, text);
    const line = handoff.accountQuestionCustomerLine(text, '');
    assert.strictEqual(line, handoff.ACCOUNT_QUESTION_LINES.en, text);
  }
  const agents = [
    ['fr', 'je veux parler à un agent'],
    ['de', 'ich möchte mit einem Menschen sprechen'],
    ['nl', 'ik wil graag met een medewerker spreken'],
    ['es', 'quiero hablar con un agente'],
    ['pt', 'quero falar com um agente'],
    ['tr', 'bir insanla konuşmak istiyorum'],
    ['pl', 'chcę rozmawiać z człowiekiem'],
    ['id', 'saya ingin bicara dengan agen'],
    ['ru', 'хочу говорить с оператором'],
    ['zh', '我要转接人工'],
    ['ja', '担当者にお願いします'],
  ];
  for (const [lang, text] of agents) {
    const result = decide(text, 'welcome');
    assert.strictEqual(handoff.detectLanguage(text), lang, text);
    assert.strictEqual(result.action, 'fixed_message', text);
    assert.strictEqual(result.language, 'en', text);
    assert.strictEqual(result.message, handoff.FIXED_MESSAGES.en, text);
  }
  const italian = decide('voglio un operatore', 'welcome');
  assert.strictEqual(italian.message, handoff.FIXED_MESSAGES.en);
  const hinglish = decide('mujhe ek insaan chahiye', 'main_escalate');
  assert.strictEqual(handoff.detectLanguage('mujhe ek insaan chahiye'), 'hinglish');
  assert.strictEqual(hinglish.message, handoff.FIXED_MESSAGES.en);
  assert.strictEqual(hinglish.language, 'en');
  const arabic = decide('ما هي قواعد السحب؟', 'welcome', { finHandoff: true });
  assert.strictEqual(arabic.action, 'route_normal');
  assert.strictEqual(handoff.isAccountNumberQuestion('numero di conto'), true);
  assert.strictEqual(handoff.accountQuestionCustomerLine('numero di conto', ''), handoff.ACCOUNT_QUESTION_LINES.en);
  assert.strictEqual(handoff.isAccountNumberQuestion('my account number is 189143'), false);
  assert.strictEqual(decide('my account number is 189143', 'main_escalate').action, 'fixed_message');
}));

Promise.all(tests)
  .then(() => {
    console.log('OK', passed, 'passed');
  })
  .catch((err) => {
    console.error('FAIL', err);
    process.exit(1);
  });
