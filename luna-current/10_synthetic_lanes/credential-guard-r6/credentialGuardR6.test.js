'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const guard = require('./credentialGuardR6');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS', name);
}

function values(text) {
  return guard.extractSecrets(text).map((hit) => hit.value);
}

function secretFree(result, secret) {
  assert.strictEqual(JSON.stringify(result).includes(secret), false);
  assert.ok(result.body == null || !String(result.body).includes(secret));
}

const FAQ = 'Our team has already been informed and is reviewing this. We will update you here as soon as there is progress.';

test('status stays unapproved and unwired', () => {
  assert.strictEqual(guard.STATUS.approved, false);
  assert.strictEqual(guard.STATUS.frozen, true);
  assert.strictEqual(guard.STATUS.release, false);
  assert.strictEqual(guard.STATUS.wired, false);
});

test('NFKC fullwidth label captures the value', () => {
  assert.deepStrictEqual(values('ｐａｓｓｗｏｒｄ is Hunt9'), ['Hunt9']);
});

test('zero-width characters inside the label still capture the value', () => {
  assert.deepStrictEqual(values('pass\u200Bword is Hunt9'), ['Hunt9']);
});

test('combining marks on the label still capture the value', () => {
  assert.deepStrictEqual(values('password\u0301 is Hunt9'), ['Hunt9']);
});

test('homoglyph label captures the value', () => {
  const cyrillicA = '\u0430';
  const cyrillicP = '\u0440';
  assert.deepStrictEqual(values(cyrillicP + cyrillicA + 'ssword is Hunt9'), ['Hunt9']);
});

test('spaced and split labels collapse before matching', () => {
  assert.deepStrictEqual(values('p a s s w o r d is Hunt9'), ['Hunt9']);
  assert.deepStrictEqual(values('pass word is Hunt9'), ['Hunt9']);
});

test('leetspeak pwd and passwd labels capture the value', () => {
  assert.deepStrictEqual(values('p@ssw0rd is Hunt9'), ['Hunt9']);
  assert.deepStrictEqual(values('pwd: ab'), ['ab']);
  assert.deepStrictEqual(values('passwd is Short1'), ['Short1']);
});

test('short tokens are captured and hai is not the value', () => {
  assert.deepStrictEqual(values('mera password hai X'), ['X']);
  assert.ok(!values('mera password hai X').includes('hai'));
  assert.deepStrictEqual(values('password is ab'), ['ab']);
});

test('Urdu Arabic Hindi and Hinglish cues capture the value', () => {
  assert.deepStrictEqual(values('میرا پاس ورڈ ہے Hunt9'), ['Hunt9']);
  assert.deepStrictEqual(values('كلمة المرور هي Hunt9'), ['Hunt9']);
  assert.deepStrictEqual(values('मेरा पासवर्ड है Hunt9'), ['Hunt9']);
  assert.deepStrictEqual(values('mera password hai Hunt9'), ['Hunt9']);
});

test('pass the challenge is not a secret and account numbers stay', () => {
  assert.deepStrictEqual(values('I hope I pass the challenge'), []);
  assert.deepStrictEqual(values('My account number is 219876'), []);
  assert.deepStrictEqual(values('password reset instructions are on the site'), []);
  const redacted = guard.redactText('account 219876 and password is Hunt9');
  assert.ok(redacted.includes('219876'));
  assert.ok(redacted.includes('password is'));
  assert.ok(!redacted.includes('Hunt9'));
});

test('detection is whole-token equality, not a substring', () => {
  assert.strictEqual(guard.containsSecret('use Hunt99 today', 'Hunt9'), false);
  assert.strictEqual(guard.containsSecret('testing the login', 'test'), false);
  assert.strictEqual(guard.containsSecret('see abc please', 'ab'), false);
  assert.strictEqual(guard.containsSecret('use Hunt9 today', 'Hunt9'), true);
  assert.strictEqual(guard.containsSecret('use Hunt\u200B9 today', 'Hunt9'), true);
  const fullwidthNine = 'Hunt' + '\uFF19';
  assert.strictEqual(guard.containsSecret('use ' + fullwidthNine + ' today', 'Hunt9'), true);
  const src = fs.readFileSync(path.join(__dirname, 'credentialGuardR6.js'), 'utf8');
  assert.ok(!src.includes('haystack.includes'));
  assert.ok(!src.includes('foldedHay.includes'));
  assert.ok(!src.includes('.includes(needle)'));
  assert.ok(!src.includes('.includes(foldedNeedle)'));
  assert.ok(!src.includes('explicitSpreadTest'));
});

test('base64 echo of a client secret is detected', () => {
  const secret = 'Hunt9';
  const encoded = Buffer.from(secret).toString('base64');
  assert.strictEqual(guard.containsSecret('see ' + encoded + ' thanks', secret), true);
  assert.strictEqual(guard.containsSecret('xx' + encoded + 'yy', secret), false);
  const decision = guard.guardSend({
    messageType: 'comment',
    body: 'decoded for you ' + encoded,
    history: ['password is ' + secret],
  });
  assert.strictEqual(decision.action, 'fixed_message');
  assert.strictEqual(decision.post, true);
  secretFree(decision, secret);
  secretFree(decision, encoded);
});

test('outbound draft is checked against earlier client secrets', () => {
  const decision = guard.guardSend({
    messageType: 'comment',
    body: 'Thanks, I noted Hunt9 on the login.',
    history: [
      { role: 'client', text: 'mera password hai Hunt9' },
      { role: 'client', text: 'any update?' },
    ],
    clientTexts: ['any update?'],
  });
  assert.strictEqual(decision.action, 'fixed_message');
  assert.strictEqual(decision.reason, 'history_echo');
  assert.strictEqual(decision.body, guard.FIXED_MESSAGE);
  assert.strictEqual(decision.post, true);
  secretFree(decision, 'Hunt9');
});

test('a model or dictated draft that introduces a secret is caught', () => {
  const model = guard.guardSend({
    messageType: 'comment',
    body: 'password is Hunt9',
    history: [],
  });
  assert.strictEqual(model.action, 'fixed_message');
  assert.strictEqual(model.reason, 'draft_secret');
  secretFree(model, 'Hunt9');
  const dictated = guard.guardSend({
    messageType: 'comment',
    body: 'Please send them Hunt9',
    history: ['pwd: Hunt9'],
  });
  assert.strictEqual(dictated.action, 'fixed_message');
  assert.strictEqual(dictated.reason, 'history_echo');
  secretFree(dictated, 'Hunt9');
});

test('a clean draft is allowed even when history has a secret', () => {
  const decision = guard.guardSend({
    messageType: 'comment',
    body: 'Our team is reviewing this.',
    history: ['password is Hunt9'],
  });
  assert.strictEqual(decision.action, 'allow');
  assert.strictEqual(decision.post, true);
  assert.strictEqual(decision.body, 'Our team is reviewing this.');
});

test('spread idioms, ordinary talk, payout, and unrelated text do not qualify', () => {
  const rejected = [
    'can you spread some light on the payout',
    'the problem spread to the other account',
    'what is the risk spread on this',
    'what are your spreads',
    'spreads look wide',
    'the spread is too high',
    'check something about the spreads',
    'hello',
    'when is my payout',
    'please check the spreads for my payout',
    'do not check the spreads',
    'چیک کریں اور سپریڈ کا مسئلہ',
    'سبريد اختبر',
  ];
  for (const text of rejected) {
    assert.strictEqual(guard.isExplicitSpreadTestRequest(text), false, text);
  }
});

test('explicit spread check or test requests qualify, including non-English', () => {
  assert.strictEqual(guard.isExplicitSpreadTestRequest('please check the spreads'), true);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('I want a spread test'), true);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('send me the spread-test account'), true);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('spread check karo'), true);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('check karo the spreads'), true);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('स्प्रेड चेक करो'), true);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('سپریڈ ٹیسٹ کریں'), true);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('اختبر السبريد'), true);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('ｃｈｅｃｋ the ｓｐｒｅａｄｓ'), true);
});

test('template password is blocked unless the ask is eligible and the body is the exact template', () => {
  const blocked = guard.guardSend({
    messageType: 'comment',
    body: 'Password: ' + guard.TEMPLATE_PASSWORD,
    clientTexts: ['please check the spreads'],
  });
  assert.strictEqual(blocked.action, 'fixed_message');
  assert.strictEqual(blocked.reason, 'template_password');
  assert.notStrictEqual(blocked.body, guard.SPREAD_TEST_REPLY);
  secretFree(blocked, guard.TEMPLATE_PASSWORD);

  const widened = guard.guardSend({
    messageType: 'comment',
    body: guard.SPREAD_TEST_REPLY,
    explicitSpreadTest: true,
    clientTexts: ['what is my payout and please check the spreads'],
  });
  assert.strictEqual(widened.post, false);
  assert.strictEqual(widened.posted, false);
  assert.strictEqual(widened.body, null);
  assert.strictEqual(widened.reason, 'spread_not_eligible');
  secretFree(widened, guard.TEMPLATE_PASSWORD);

  const flagOnly = guard.guardSend({
    messageType: 'comment',
    body: guard.SPREAD_TEST_REPLY,
    explicitSpreadTest: true,
  });
  assert.strictEqual(flagOnly.post, false);
  assert.strictEqual(flagOnly.body, null);
  secretFree(flagOnly, guard.TEMPLATE_PASSWORD);

  const allowed = guard.guardSend({
    messageType: 'comment',
    body: guard.SPREAD_TEST_REPLY,
    clientTexts: ['please check the spreads'],
  });
  assert.strictEqual(allowed.action, 'allow');
  assert.strictEqual(allowed.post, true);
  assert.strictEqual(allowed.body, guard.SPREAD_TEST_REPLY);
  assert.ok(allowed.body.includes('55188'));
  assert.ok(allowed.body.includes('Use this account to check spreads.'));
});

test('notes are redacted instead of replaced with the client fixed message', () => {
  const decision = guard.guardSend({
    messageType: 'note',
    body: 'Owner asked me to resend Hunt9',
    history: ['password is Hunt9'],
  });
  assert.strictEqual(decision.action, 'redact');
  assert.strictEqual(decision.post, true);
  assert.ok(decision.body.includes('[secret]'));
  assert.ok(decision.body.includes('Owner asked me to resend'));
  assert.ok(!decision.body.includes('Hunt9'));
  assert.notStrictEqual(decision.body, guard.FIXED_MESSAGE);
});

test('redact helpers cover noteInbound, observe, and log lines', () => {
  const inbound = guard.redactText('mera password hai Hunt9');
  assert.ok(inbound.includes('[secret]'));
  assert.ok(!inbound.includes('Hunt9'));
  const meta = guard.redactTurnMeta({
    clientText: 'password is Hunt9',
    body: 'I will use Hunt9',
  });
  assert.ok(!meta.clientText.includes('Hunt9'));
  assert.ok(!meta.body.includes('Hunt9'));
  const ownerLog = guard.redactText('ACTION: REPLY\nBODY: password is Hunt9', ['Hunt9']).slice(0, 240);
  const skipLog = guard.redactText('skip because Hunt9 was pasted', ['Hunt9']);
  assert.ok(!ownerLog.includes('Hunt9'));
  assert.ok(!skipLog.includes('Hunt9'));
  const diagnostic = guard.redactDiagnostic({
    body: 'password is Hunt9',
    message: 'failed because Hunt9',
    status: 500,
    nested: { clientText: 'Hunt9', code: 'x' },
  });
  secretFree(diagnostic, 'Hunt9');
  assert.strictEqual(diagnostic.status, 500);
  assert.strictEqual(diagnostic.nested.code, 'x');
  assert.ok(!Object.prototype.hasOwnProperty.call(diagnostic, 'body'));
  assert.ok(!Object.prototype.hasOwnProperty.call(diagnostic.nested, 'clientText'));
});

test('fail closed when the body is not text, validation throws, or the replacement still contains the secret', () => {
  const secret = 'Hunt9';
  const weird = { toString() { throw new Error(secret); } };
  const nonString = guard.guardSend({ messageType: 'comment', body: weird });
  assert.strictEqual(nonString.post, false);
  assert.strictEqual(nonString.posted, false);
  assert.strictEqual(nonString.body, null);
  assert.strictEqual(nonString.reason, 'non_string');
  secretFree(nonString, secret);

  const throwing = {
    messageType: 'comment',
    body: 'hello',
    get history() { throw new Error('password is ' + secret); },
  };
  const validation = guard.guardSend(throwing);
  assert.strictEqual(validation.post, false);
  assert.strictEqual(validation.reason, 'validation_error');
  assert.strictEqual(validation.body, null);
  secretFree(validation, secret);

  const residual = guard.guardSend({
    messageType: 'comment',
    body: 'password is immediately',
    history: ['password is immediately'],
  });
  assert.strictEqual(residual.post, false);
  assert.strictEqual(residual.body, null);
  assert.strictEqual(residual.reason, 'unsanitizable');
  secretFree(residual, 'immediately');
});

test('opstore rejects a dirty body and a tampered queued body posts nothing', () => {
  guard.resetStore();
  const transport = guard.createRecordingTransport();
  const dirty = guard.enqueuePublicOp({
    conversationId: 'c-dirty',
    messageType: 'comment',
    body: 'password is Hunt9',
  });
  assert.strictEqual(dirty.queued, false);
  assert.strictEqual(dirty.posted, false);
  assert.strictEqual(dirty.post, false);
  secretFree(dirty, 'Hunt9');
  guard.flushQueue(transport);
  assert.strictEqual(transport.records.length, 0);

  guard.resetStore();
  guard.restoreQueuedOp({
    id: 'tampered',
    conversationId: 'c-tamper',
    messageType: 'comment',
    body: 'password is Hunt9',
  });
  const flushed = guard.flushQueue(transport);
  assert.strictEqual(transport.records.length, 0);
  assert.strictEqual(flushed.posted.length, 0);
  assert.ok(flushed.blocked.length >= 1);
  assert.strictEqual(flushed.blocked[0].posted, false);
  secretFree(flushed, 'Hunt9');
  assert.ok(!JSON.stringify(guard.inspectQueue()).includes('Hunt9'));
});

test('ordinary approved FAQ and the eligible template post their exact payloads', () => {
  guard.resetStore();
  const root = path.join(__dirname, '../../..');
  const faqSrc = fs.readFileSync(path.join(root, 'luna-current/01_runtime/escalateRelatedOnly.js'), 'utf8');
  assert.ok(faqSrc.includes(FAQ));
  const transport = guard.createRecordingTransport();
  const choke = guard.createChoke(transport);
  choke.postReply('c-faq', 'comment', FAQ, { clientTexts: ['any update on the review?'] });
  assert.strictEqual(transport.records.length, 1);
  assert.strictEqual(transport.records[0].body, FAQ);
  assert.strictEqual(transport.records[0].via, 'postReply');

  const queued = guard.enqueuePublicOp({
    conversationId: 'c-faq',
    messageType: 'comment',
    body: FAQ,
    clientTexts: ['any update on the review?'],
  });
  assert.strictEqual(queued.queued, true);
  const queueTransport = guard.createRecordingTransport();
  const flushed = guard.flushQueue(queueTransport);
  assert.strictEqual(queueTransport.records.length, 1);
  assert.strictEqual(queueTransport.records[0].body, FAQ);
  assert.strictEqual(flushed.posted[0].body, FAQ);

  guard.resetStore();
  guard.rememberClientText('c-spread', 'please check the spreads');
  const templateQueue = guard.enqueuePublicOp({
    conversationId: 'c-spread',
    messageType: 'comment',
    body: guard.SPREAD_TEST_REPLY,
  });
  assert.strictEqual(templateQueue.queued, true);
  const templateTransport = guard.createRecordingTransport();
  guard.flushQueue(templateTransport);
  assert.strictEqual(templateTransport.records.length, 1);
  assert.strictEqual(templateTransport.records[0].body, guard.SPREAD_TEST_REPLY);

  const direct = guard.createRecordingTransport();
  const directChoke = guard.createChoke(direct);
  directChoke.postClientCommentOnce('c-spread', guard.SPREAD_TEST_REPLY, { role: 'client', body: 'please check the spreads' }, 'A', {});
  assert.strictEqual(direct.records.length, 1);
  assert.strictEqual(direct.records[0].body, guard.SPREAD_TEST_REPLY);
});

test('single choke covers owner reply, auth reply, retries, and replay', () => {
  guard.resetStore();
  const transport = guard.createRecordingTransport();
  const choke = guard.createChoke(transport);
  const history = [{ role: 'client', text: 'mera password hai Hunt9' }];
  const paths = [
    ['owner-reply', () => choke.postReply('c1', 'comment', 'Use Hunt9 now', { history })],
    ['auth-note-reply', () => choke.postReply('c1', 'comment', 'Sending Hunt9 as asked', { history })],
    ['helper-retry', () => choke.postClientCommentOnce('c1', 'retried Hunt9', null, 'A', { history })],
    ['presend-regenerate', () => choke.postClientCommentOnce('c1', 'regenerated Hunt9', null, 'A', { history })],
    ['repeated-question-retry', () => choke.postClientCommentOnce('c1', 'reworded Hunt9', null, 'A', { history })],
    ['replay', () => choke.postClientCommentOnce('c1', 'replay Hunt9', null, 'A', { history })],
  ];
  for (const [name, run] of paths) {
    transport.records.length = 0;
    run();
    assert.strictEqual(transport.records.length, 1, name);
    assert.strictEqual(transport.records[0].body, guard.FIXED_MESSAGE, name);
    assert.ok(!transport.records[0].body.includes('Hunt9'), name);
  }
  transport.records.length = 0;
  const held = choke.postClientCommentOnce('c1', guard.SPREAD_TEST_REPLY, null, 'A', {
    explicitSpreadTest: true,
    clientTexts: ['hello'],
  });
  assert.strictEqual(transport.records.length, 0);
  assert.strictEqual(held.posted, false);
  secretFree(held, guard.TEMPLATE_PASSWORD);

  let calls = 0;
  const counting = guard.createChoke({
    postReply() { calls += 1; return { ok: true }; },
    postClientCommentOnce() { calls += 1; return { ok: true }; },
  });
  const thrown = counting.postReply('c1', 'comment', 'hello', {
    get history() { throw new Error('password is Hunt9'); },
  });
  assert.strictEqual(calls, 0);
  assert.strictEqual(thrown.posted, false);
  secretFree(thrown, 'Hunt9');
});

test('a direct write of a secret is not stored or posted', () => {
  const decision = guard.guardOutboundWrite(
    'https://api.intercom.io/conversations/c1/reply',
    { message_type: 'comment', body: 'password is Hunt9' }
  );
  assert.strictEqual(decision.post, false);
  assert.strictEqual(decision.data, null);
  secretFree(decision, 'Hunt9');
  const closeWrite = guard.guardOutboundWrite(
    'https://api.intercom.io/conversations/c1/reply',
    { message_type: 'close', type: 'admin' }
  );
  assert.strictEqual(closeWrite.post, true);
});

test('runtime files are not wired to R6', () => {
  const root = path.join(__dirname, '../../..');
  const files = [
    'luna-current/01_runtime/index.js',
    'luna-current/02_statePresend/statePresend.js',
    'luna-current/03_luna-maintainer/collector.js',
  ];
  for (const file of files) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!src.includes('credentialGuardR6'), file);
    assert.ok(!src.includes('credential-guard-r6'), file);
  }
});

test('proposed integration diff stays unapplied and names every required site', () => {
  const diffPath = path.join(__dirname, 'proposed-integration.diff');
  const diff = fs.readFileSync(diffPath, 'utf8');
  const required = [
    'postReply',
    'postClientCommentOnce',
    'executeOwnerActionPlan',
    'processAuthorizedNoteCommands',
    'rememberClientParts',
    '__presendRegenerate',
    'REPEATED_QUESTION',
    'OWNER_CMD_LLM_RAW',
    'SKIP model',
    'noteInbound',
    'redactTurnMeta',
    'isExplicitSpreadTestRequest',
    'SPREAD_TEST_REPLY',
    'guardOutboundWrite',
    'writeOpStore',
    'IC_REQ_BLOCKED',
    'OUTBOUND_BLOCKED',
    'response_withheld',
    'request_error',
  ];
  for (const marker of required) assert.ok(diff.includes(marker), marker);
  assert.ok(!diff.includes('explicitSpreadTest'));
  const root = path.join(__dirname, '../../..');
  const dry = spawnSync('patch', ['--dry-run', '-p1', '--forward', '--batch', '--silent'], {
    cwd: root,
    input: diff,
    encoding: 'utf8',
  });
  assert.strictEqual(dry.status, 0, dry.stdout + dry.stderr);
  const indexSrc = fs.readFileSync(path.join(root, 'luna-current/01_runtime/index.js'), 'utf8');
  assert.ok(!indexSrc.includes('credentialGuardR6'));
});

test('module stays synthetic', () => {
  const src = fs.readFileSync(path.join(__dirname, 'credentialGuardR6.js'), 'utf8');
  assert.ok(!/require\(['"]fs['"]\)/.test(src));
  assert.ok(!/api\.intercom|process\.env|child_process/.test(src));
  assert.ok(!/\b(approved|refund|payout date|locked)\b/i.test(guard.FIXED_MESSAGE));
});

console.log('credential-guard-r6', passed, 'passed');
