'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const handoff = require('../../01_runtime/fixedMessageHandoff');
const sanitizer = require('../../02_statePresend/credentialSanitizer');
const softEdges = require('../../01_runtime/softEdges');

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

const B64 = 'dGVzdFNlY3JldFZhbHVlMTIz';
const ONCE = 'abcdefghijklmnopqrstuv';

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

function decide(text, pathName, extra) {
  return handoff.decide(Object.assign({
    path: pathName,
    latestText: text,
    parts: [],
    full: { admin_assignee_id: 'seat-a', team_assignee_id: '0' },
    botId: 'seat-a',
    force: pathName !== 'welcome',
    ownershipOpts: OWN,
  }, extra || {}));
}

function indexSrc() {
  return fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
}

function spreadFromIndex(src) {
  const m = src.match(/const SPREAD_TEST_REPLY\s*=\s*([\s\S]*?);\n\n\/\* LUNA_SPREAD_IMAGE_FIXES_V1:BEGIN:spread \*\//);
  assert.ok(m, 'SPREAD_TEST_REPLY located');
  return Function('return (' + m[1] + ');')();
}

tests.push(test('status stays the R3 candidate and is not approved', () => {
  assert.strictEqual(handoff.STATUS.candidate, 'fixed-message-handoff-r3');
  assert.strictEqual(handoff.STATUS.approved, false);
  assert.strictEqual(handoff.STATUS.release, false);
}));

tests.push(test('the locked spread reply is exempt by hash and a symbol token is not cut', () => {
  const src = indexSrc();
  const spread = spreadFromIndex(src);
  assert.strictEqual(spread, sanitizer.LOCKED_SPREAD_TEST_REPLY);
  assert.strictEqual(sanitizer.isExactAllowedTemplate(spread), true);
  assert.strictEqual(sanitizer.sanitizeCredentials(spread), spread);
  assert.strictEqual(handoff.redactCredentials(spread), spread);
  assert.strictEqual(sanitizer.sha256Text(sanitizer.sanitizeCredentials(spread)), sanitizer.sha256Text(spread));
  assert.strictEqual(spread.includes('QBG5FetfozKz7^a?J!'), true);
  const drifted = spread.replace('55188', '55189');
  assert.strictEqual(sanitizer.isExactAllowedTemplate(drifted), false);
  assert.strictEqual(sanitizer.sanitizeCredentials(drifted).includes('QBG5FetfozKz7^a?J!'), false);
  assert.strictEqual(sanitizer.sanitizeCredentials(drifted).includes('?J!'), false);
  const labeled = sanitizer.sanitizeCredentials('Password: QBG5FetfozKz7^a?J!');
  assert.strictEqual(labeled, 'Password: [secret]');
  const symbols = sanitizer.sanitizeCredentials('token is ab?cd!ef^gh.ij,kl');
  assert.strictEqual(symbols.includes('?'), false);
  assert.strictEqual(symbols.includes('^'), false);
  assert.strictEqual(symbols.includes('!'), false);
  assert.strictEqual(symbols.includes('[secret]'), true);
  const kept = sanitizer.sanitizeCredentials('password is hunter2 and account 189143');
  assert.strictEqual(kept.includes('hunter2'), false);
  assert.strictEqual(kept.includes('189143'), true);
  assert.strictEqual(sanitizer.sanitizeCredentials("password's [secret]"), "password's [secret]");
  const sanitizerSrc = fs.readFileSync(path.join(__dirname, '../../02_statePresend/credentialSanitizer.js'), 'utf8');
  assert.ok(sanitizerSrc.includes('{1,120}'));
  assert.strictEqual(sanitizerSrc.includes('<.!?,]'), false);
  assert.ok(src.includes('isExactAllowedTemplate(raw)'));
}));

tests.push(test('every copy of a repeated base64 value is redacted, including inside a label', () => {
  const alone = 'prefix ' + ONCE + ' suffix';
  assert.strictEqual(sanitizer.sanitizeCredentials(alone).includes(ONCE), true);
  const inside = 'password is hello ' + B64 + ' extra ' + B64 + ' tail';
  const redacted = sanitizer.sanitizeCredentials(inside);
  assert.strictEqual(redacted.includes(B64), false);
  assert.strictEqual(handoff.redactCredentials('again ' + B64 + ' later ' + B64).includes(B64), false);
  assert.strictEqual(sanitizer.sanitizeCredentials(redacted), redacted);
  const fn = fs.readFileSync(path.join(__dirname, '../../02_statePresend/credentialSanitizer.js'), 'utf8');
  const body = fn.slice(fn.indexOf('function sanitizeCredentials'), fn.indexOf('function sanitizeDeep'));
  assert.ok(body.indexOf('isExactAllowedTemplate') < body.indexOf('redactRepeatedBase64'));
  assert.ok(body.indexOf('redactRepeatedBase64') < body.indexOf('CREDENTIAL_VALUE_RE'));
}));

tests.push(test('status-only and the holding post check the fixed line before a second comment', () => {
  const src = indexSrc();
  const holdAt = src.indexOf('async function postEscalateHoldingStatus');
  const holdEnd = src.indexOf('function isRiskAssigned', holdAt);
  const hold = src.slice(holdAt, holdEnd);
  assert.ok(hold.indexOf('fixedLineAlreadyPublic') < hold.indexOf('postClientCommentOnce'));
  assert.ok(hold.includes("reason: 'fixed_line_already_sent'"));
  const statusAt = src.indexOf("} else if (eroDec.action === 'STATUS_ONLY')");
  const statusEnd = src.indexOf('} else if (eroDec.action === \'FALLTHROUGH\'', statusAt);
  const status = src.slice(statusAt, statusEnd);
  assert.ok(status.indexOf('fixedLineAlreadyPublic') < status.indexOf('postClientCommentOnce'));
  assert.ok(status.includes('fetchConversation'));
  assert.strictEqual(handoff.fixedLineAlreadyPublic({ messageSent: true }, []), true);
  assert.strictEqual(
    handoff.fixedLineAlreadyPublic({}, [{ part_type: 'comment', body: handoff.FIXED_MESSAGES.en }]),
    true
  );
  assert.strictEqual(handoff.fixedLineAlreadyPublic({}, []), false);
}));

tests.push(test('lost stores send the one fixed line from parts unless a human replied or owns it', async () => {
  const note = {
    part_type: 'note',
    author: { id: 'seat-a', type: 'admin' },
    body: 'Account: 189143<br>Problem: payout',
  };
  const assignment = {
    part_type: 'assignment',
    assigned_to: { id: 'human-7' },
    author: { id: 'seat-a', type: 'admin' },
    body: 'assigned to the handoff seat',
  };
  const parts = [note, assignment];
  const full = { admin_assignee_id: 'human-7', team_assignee_id: '0' };
  assert.strictEqual(handoff.storesLookLost(null), true);
  assert.strictEqual(handoff.storesLookLost({}), true);
  assert.strictEqual(handoff.storesLookLost({ messageSent: true }), false);
  const recovered = handoff.reconcileFromParts({}, parts, full, '', 'seat-a');
  assert.strictEqual(recovered.noteConfirmed && recovered.assignConfirmed && !recovered.messageSent, true);
  assert.strictEqual(recovered.assigneeId, 'human-7');
  assert.strictEqual(handoff.humanPublicComment(parts, OWN), false);
  assert.strictEqual(handoff.foreignHumanOwns(full, recovered.assigneeId, 'seat-a', OWN), false);
  assert.strictEqual(handoff.foreignHumanOwns({ admin_assignee_id: '0' }, recovered.assigneeId, 'seat-a', OWN), false);
  assert.strictEqual(handoff.foreignHumanOwns({ admin_assignee_id: 'seat-a' }, recovered.assigneeId, 'seat-a', OWN), false);
  assert.strictEqual(handoff.foreignHumanOwns({ admin_assignee_id: 'human-9' }, recovered.assigneeId, 'seat-a', OWN), true);
  const commented = parts.concat([{
    part_type: 'comment',
    author: { id: 'human-7', type: 'admin' },
    body: 'I have this conversation now',
  }]);
  assert.strictEqual(handoff.humanPublicComment(commented, OWN), true);
  const completion = handoff.decide({
    path: 'recovery',
    latestText: 'any update?',
    parts: parts.filter((p) => {
      const pt = String(p.part_type || '');
      return pt !== 'assignment' && pt !== 'assign';
    }),
    full,
    botId: 'seat-a',
    force: true,
    handoffAssigneeId: recovered.assigneeId,
    ownershipOpts: Object.assign({}, OWN, { handoffAssigneeId: recovered.assigneeId }),
  });
  assert.strictEqual(completion.action, 'fixed_message');
  assert.strictEqual(completion.message, handoff.FIXED_MESSAGES.en);
  const transport = recordingTransport();
  const sent = await handoff.commit({
    decision: completion,
    noteHtml: 'Account: 189143<br>Problem: payout',
    assigneeId: recovered.assigneeId,
    botId: 'seat-a',
    parts,
    conversation: full,
    progress: {},
    transport,
  });
  assert.deepStrictEqual(transport.calls.map((c) => c.op), ['message']);
  assert.strictEqual(transport.calls[0].body, handoff.FIXED_MESSAGES.en);
  assert.strictEqual(sent.sent, true);
  const src = indexSrc();
  const defer = src.indexOf('FIXED_MESSAGE_HANDOFF_R4:ownership_before_hook_a');
  const hook = src.indexOf('escalate-related-only-v1: awaiting RELATED-only gate');
  const early = src.slice(defer, hook);
  assert.ok(early.includes('storesLookLost'));
  assert.ok(early.includes('humanPublicComment'));
  assert.ok(early.includes('foreignHumanOwns'));
  assert.ok(early.includes('FIXED_HANDOFF lost-state completion'));
  assert.ok(early.indexOf('storesLookLost') < early.indexOf('commitFixedMessageHandoff'));
}));

tests.push(test('fresh account-number questions are answered, including Italian, before the Fin wait', () => {
  const italian = ['numero di conto', 'qual è il mio numero di conto', 'qual e il numero di conto'];
  for (const text of italian) {
    assert.strictEqual(handoff.isAccountNumberQuestion(text), true, text);
    assert.strictEqual(handoff.detectLanguage(text), 'it', text);
    assert.strictEqual(decide(text, 'welcome').action, 'route_normal');
    assert.strictEqual(handoff.accountQuestionCustomerLine(text, ''), handoff.ACCOUNT_QUESTION_LINES.it);
  }
  for (const text of ['número de cuenta', 'numéro de compte', 'kontonummer', 'rekeningnummer']) {
    assert.strictEqual(handoff.isAccountNumberQuestion(text), true, text);
    const line = handoff.accountQuestionCustomerLine(text, '');
    assert.ok(line && line.length >= 12, text);
    assert.strictEqual(Object.values(handoff.FIXED_MESSAGES).includes(line), false);
  }
  assert.strictEqual(handoff.detectLanguage('my account number'), 'en');
  assert.strictEqual(handoff.isAccountNumberQuestion('my account number is 189143'), false);
  assert.strictEqual(decide('my account number is 189143', 'main_escalate').action, 'fixed_message');
  assert.strictEqual(handoff.isAccountNumberQuestion('il numero di conto è 189143'), false);
  const src = indexSrc();
  const fresh = src.indexOf('FIXED_HANDOFF fresh account-question');
  const fin = src.indexOf('if (shouldWaitForFin(full, text, topic))');
  const block = src.slice(src.lastIndexOf('isAccountNumberQuestion', fresh), fresh);
  assert.ok(fresh > 0 && fresh < fin);
  assert.ok(block.includes("topic === 'conversation.user.created'"));
  assert.ok(block.includes("topic === 'conversation.user.replied'"));
  assert.ok(block.includes('FIN_FRESH_CONV_SEC'));
  assert.ok(src.slice(fresh - 400, fresh).includes('deliverAccountQuestionAnswer'));
}));

tests.push(test('an identity question is answered and is not a live-agent handoff', () => {
  const text = 'are you a bot or a real person?';
  assert.strictEqual(softEdges.clientRequestedLiveAgent(text), false);
  assert.strictEqual(handoff.isAssistantIdentityQuestion(text), true);
  assert.strictEqual(handoff.isPureLiveAgentAsk(text), false);
  const bot = decide(text, 'welcome');
  assert.strictEqual(bot.action, 'route_normal');
  assert.strictEqual(bot.reason, 'assistant_identity_question');
  assert.strictEqual(bot.message, null);
  const human = decide(text, 'welcome', { full: { admin_assignee_id: 'human-1', team_assignee_id: '0' } });
  assert.strictEqual(human.action, 'silence');
  const src = indexSrc();
  const answer = src.indexOf('ASSISTANT_IDENTITY answer');
  const fin = src.indexOf('if (shouldWaitForFin(full, text, topic))');
  assert.ok(answer > 0 && answer < fin);
  assert.ok(src.slice(answer - 500, answer).includes('disclosureFor'));
  assert.ok(src.slice(answer - 500, answer).includes('isDirectIdentityQuestion'));
}));

tests.push(test('a bot-owned status ping or FAQ with an unsupported number hedges instead of handing off', async () => {
  const ctx = {
    assigneeId: 'seat-a',
    botIds: ['seat-a', 'seat-e'],
    state: { last_client_message: 'any update?' },
  };
  const regenerated = await targeted.runWithRegeneration({
    draft: 'the holding time is 99 days',
    ctx,
    regenerate() {
      return 'The approved details do not state that figure.';
    },
  });
  assert.strictEqual(regenerated.send, true);
  assert.strictEqual(regenerated.regenerated, true);
  assert.strictEqual(regenerated.finalReason, 'regenerated-ok');
  assert.strictEqual(/\d/.test(regenerated.body), false);
  assert.strictEqual(Object.values(handoff.FIXED_MESSAGES).includes(regenerated.body), false);

  const hedged = targeted.safeFallback('the holding time is 99 days', { hardFails: [{ code: 'UNSUPPORTED_NUMBER' }] }, { ctx });
  assert.strictEqual(hedged.send, true);
  assert.strictEqual(hedged.reason, 'unsupported-number-hedge');
  assert.strictEqual(hedged.body, targeted.HEDGE_REPLY);
  assert.strictEqual(/\d/.test(hedged.body), false);
  assert.strictEqual(/teammate/i.test(hedged.body), false);

  const faq = targeted.safeFallback('leverage is 1:999', { hardFails: [{ code: 'UNSUPPORTED_NUMBER' }] }, {
    ctx: { assigneeId: '0', botIds: ['seat-a'], state: { last_client_message: 'what is the leverage?' } },
  });
  assert.strictEqual(faq.reason, 'unsupported-number-hedge');
  const owned = targeted.safeFallback('the holding time is 99 days', { hardFails: [{ code: 'UNSUPPORTED_NUMBER' }] }, {
    ctx: { assigneeId: 'human-1', botIds: ['seat-a', 'seat-e'], state: { last_client_message: 'any update?' } },
  });
  assert.strictEqual(owned.send, false);
  assert.strictEqual(owned.reason, 'unsupported-number-held');
  const humanAsk = targeted.safeFallback('', { hardFails: [{ code: 'MISSED_ESCALATION' }] }, {
    ctx: { state: { last_client_message: 'please get me a human' } },
  });
  assert.strictEqual(humanAsk.send, false);
  assert.strictEqual(humanAsk.body, '');
  const account = targeted.safeFallback('', { hardFails: [{ code: 'UNSUPPORTED_NUMBER' }] }, {
    ctx: { assigneeId: 'seat-a', botIds: ['seat-a'], state: { last_client_message: 'what is my account number' } },
  });
  assert.strictEqual(account.send, true);
  assert.strictEqual(account.reason, 'account-question-answer');
  const gateSrc = fs.readFileSync(path.join(__dirname, '../../02_statePresend/statePresend.js'), 'utf8');
  assert.ok(gateSrc.includes('assigneeId: p.assigneeId'));
  assert.ok(gateSrc.includes('botIds: p.botIds'));
  const src = indexSrc();
  assert.ok(src.includes('assigneeId: full && full.admin_assignee_id'));
  assert.ok(src.includes('botIds: [ARSAL_ID, ELITE_AI_ID]'));
}));

tests.push(test('an emptied known-account re-ask escalates, and Italian live-agent gets the Italian line', () => {
  for (const text of ['voglio un operatore', 'voglio parlare con un operatore']) {
    assert.strictEqual(handoff.detectLanguage(text), 'it', text);
    assert.strictEqual(handoff.isPureLiveAgentAsk(text), true, text);
    assert.strictEqual(handoff.isAccountNumberQuestion(text), false, text);
    const welcome = decide(text, 'welcome');
    assert.strictEqual(welcome.action, 'fixed_message');
    assert.strictEqual(welcome.language, 'it');
    assert.strictEqual(welcome.message, handoff.FIXED_MESSAGES.it);
  }
  const src = indexSrc();
  assert.strictEqual(src.includes('SKIP empty after strip'), false);
  const emptyAt = src.indexOf('EMPTY known-account re-ask');
  const empty = src.slice(emptyAt, emptyAt + 1200);
  assert.ok(empty.includes('deliverAccountQuestionAnswer'));
  assert.ok(empty.includes('isDirectIdentityQuestion'));
  assert.ok(empty.includes("path: 'presend_escalate'"));
  assert.ok(empty.includes('commitFixedMessageHandoff'));
  assert.ok(empty.indexOf('deliverAccountQuestionAnswer') < empty.indexOf('commitFixedMessageHandoff'));
  const exempt = src.indexOf('FIXED_HANDOFF main_escalate account-question exemption');
  const live = src.indexOf('isPureLiveAgentAsk', exempt);
  const identity = src.indexOf('ensureIdentityBeforeAccountEscalate', exempt);
  const marker = src.indexOf('FIXED_MESSAGE_HANDOFF_R3:main_escalate', exempt);
  assert.ok(exempt > 0 && exempt < live && live < identity && identity < marker);
  const liveCommit = src.indexOf('FIXED_HANDOFF live-agent without account ask');
  assert.ok(liveCommit > live && liveCommit < marker);
}));

Promise.all(tests)
  .then(() => {
    console.log('OK', passed, 'passed');
  })
  .catch((err) => {
    console.error('FAIL', err && err.stack || err);
    process.exit(1);
  });
