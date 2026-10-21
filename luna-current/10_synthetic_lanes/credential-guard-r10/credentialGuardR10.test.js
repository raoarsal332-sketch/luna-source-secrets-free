'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const guard = require('./credentialGuardR10');

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
const ASK = 'please send me the spread-test account';

test('status stays unapproved and unwired', () => {
  assert.strictEqual(guard.STATUS.approved, false);
  assert.strictEqual(guard.STATUS.candidate, 'credential-guard-r10');
  assert.strictEqual(guard.STATUS.frozen, true);
  assert.strictEqual(guard.STATUS.release, false);
  assert.strictEqual(guard.STATUS.wired, false);
});

test('NFKC fullwidth label captures the value', () => {
  assert.deepStrictEqual(values('ｐａｓｓｗｏｒｄ is Hunt9'), ['Hunt9']);
});

test('zero-width characters are separators and still capture the value', () => {
  assert.deepStrictEqual(values('pass\u200Bword is Hunt9'), ['Hunt9']);
  assert.deepStrictEqual(values('password\u200Bis Hunt9'), ['Hunt9']);
  assert.strictEqual(guard.containsSecret('use Hunt\u200B9 today', 'Hunt9'), true);
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
  assert.deepStrictEqual(values('मेरा पास वर्ड है Hunt9'), ['Hunt9']);
});

test('character-split values and bigrams are rejoined', () => {
  assert.deepStrictEqual(values('password is H u n t 9'), ['Hunt9']);
  assert.deepStrictEqual(values('password: Hu nt 9X'), ['Hunt9X']);
  assert.strictEqual(guard.containsSecret('use H u n t 9 today', 'Hunt9'), true);
  assert.strictEqual(guard.containsSecret('use Hu nt 9X today', 'Hunt9X'), true);
  assert.strictEqual(guard.containsSecret('use Hunt99 today', 'Hunt9'), false);
});

test('symbol tokens are captured whole', () => {
  assert.deepStrictEqual(values('password is pa$$w0rd'), ['pa$$w0rd']);
  assert.deepStrictEqual(values('password: $ecretKey1'), ['$ecretKey1']);
});

test('HTML attributes and comments are read before tags are stripped', () => {
  assert.deepStrictEqual(values('<div password="Hunt9">nothing to see</div>'), ['Hunt9']);
  assert.deepStrictEqual(values('<!-- password is Hunt9 -->hello'), ['Hunt9']);
  assert.deepStrictEqual(values('<p>password is &#72;unt9</p>'), ['Hunt9']);
  const attr = guard.guardSend({
    messageType: 'comment',
    body: '<div password="Hunt9">thanks</div>',
  });
  assert.strictEqual(attr.action, 'fixed_message');
  secretFree(attr, 'Hunt9');
});

test('leetspeak labels capture a long value and a short pwd value', () => {
  assert.deepStrictEqual(values('p@ssw0rd is Hunt9'), ['Hunt9']);
  assert.deepStrictEqual(values('pwd: ab'), ['ab']);
  assert.deepStrictEqual(values('passwd is Short1'), ['Short1']);
});

test('labeled short secrets are captured and FAQ wording is not', () => {
  assert.deepStrictEqual(values('mera password hai X'), ['X']);
  assert.deepStrictEqual(values('password is ab'), ['ab']);
  assert.deepStrictEqual(values('pin: 5'), ['5']);
  assert.deepStrictEqual(values('otp: 4491'), ['4491']);
  assert.deepStrictEqual(values('password: reset'), ['reset']);
  assert.deepStrictEqual(values('password: a! b@ c#'), ['a!b@c#']);
  assert.deepStrictEqual(values('pin: 1234'), ['1234']);
  assert.deepStrictEqual(values('stored [secret] already'), []);
  assert.deepStrictEqual(values('password reset instructions are on the site'), []);
  assert.deepStrictEqual(values('password hain Hunt9'), ['Hunt9']);
  const pin = guard.guardSend({ messageType: 'comment', body: 'pin: 5' });
  assert.strictEqual(pin.action, 'fixed_message');
  assert.strictEqual(pin.body, guard.FIXED_MESSAGE);
  assert.ok(!String(pin.body).includes('5'));
  const reset = guard.guardSend({ messageType: 'comment', body: 'password: reset' });
  assert.strictEqual(reset.action, 'fixed_message');
  secretFree(reset, 'reset');
  const faq = guard.guardSend({ messageType: 'comment', body: 'password reset instructions are on the site' });
  assert.strictEqual(faq.action, 'allow');
  assert.strictEqual(faq.body, 'password reset instructions are on the site');
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
  const src = fs.readFileSync(path.join(__dirname, 'credentialGuardR10.js'), 'utf8');
  assert.ok(!src.includes('haystack.includes'));
  assert.ok(!src.includes('.includes(needle)'));
  assert.ok(!src.includes('explicitSpreadTest'));
  assert.ok(!src.includes('check|test|testing'));
});

test('unpadded and URL-safe base64 echoes are detected', () => {
  const spaced = 'Hunt9 0';
  const padded = Buffer.from(spaced).toString('base64');
  const unpadded = padded.replace(/=+$/, '');
  assert.notStrictEqual(unpadded, padded);
  assert.strictEqual(guard.containsSecret('see ' + unpadded + ' thanks', spaced), true);
  assert.strictEqual(guard.containsSecret('xxSHVudDk=yy', 'Hunt9'), false);
  const urlSecret = 'subjects?';
  const url = Buffer.from(urlSecret).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.ok(/[-_]/.test(url));
  assert.strictEqual(guard.containsSecret('see ' + url + ' thanks', urlSecret), true);
  const decision = guard.guardSend({
    messageType: 'comment',
    body: 'decoded for you ' + url,
    history: ['password is ' + urlSecret],
  });
  assert.strictEqual(decision.action, 'fixed_message');
  secretFree(decision, urlSecret);
  secretFree(decision, url);
});

test('remembered client parts decode HTML and entities', () => {
  guard.resetStore();
  guard.rememberClientParts('c-html', [
    { role: 'client', body: '<p>password is &#72;unt9</p>' },
  ]);
  const decision = guard.guardSend({
    conversationId: 'c-html',
    messageType: 'comment',
    body: 'I noted Hunt9',
  });
  assert.strictEqual(decision.action, 'fixed_message');
  assert.strictEqual(decision.reason, 'history_echo');
  secretFree(decision, 'Hunt9');
});

test('public comments apply case-insensitive sk- and Bearer token only', () => {
  const key = 'sk-' + 'a'.repeat(20);
  const upper = 'SK-' + 'c'.repeat(20);
  const token = 'b'.repeat(20);
  const bearer = 'Bearer ' + token;
  assert.deepStrictEqual(guard.keyMaterialValues(bearer), [token]);
  const sk = guard.guardSend({ messageType: 'comment', body: 'use ' + key + ' now' });
  assert.strictEqual(sk.action, 'fixed_message');
  assert.strictEqual(sk.reason, 'key_material');
  assert.strictEqual(sk.post, true);
  secretFree(sk, key);
  const upperDecision = guard.guardSend({ messageType: 'comment', body: 'use ' + upper + ' now' });
  assert.strictEqual(upperDecision.action, 'fixed_message');
  assert.strictEqual(upperDecision.reason, 'key_material');
  secretFree(upperDecision, upper);
  const bearerDecision = guard.guardSend({ messageType: 'comment', body: 'header ' + bearer });
  assert.strictEqual(bearerDecision.action, 'fixed_message');
  secretFree(bearerDecision, token);
  const note = guard.guardSend({ messageType: 'note', body: 'stored ' + key });
  assert.strictEqual(note.action, 'redact');
  assert.strictEqual(note.post, true);
  assert.ok(!note.body.includes(key));
  const bearerNote = guard.guardSend({ messageType: 'note', body: 'header ' + bearer });
  assert.strictEqual(bearerNote.action, 'redact');
  assert.ok(bearerNote.body.includes('Bearer [secret]'));
  assert.ok(!bearerNote.body.includes(token));
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
  const split = guard.guardSend({
    messageType: 'comment',
    body: 'use H u n t 9 now',
    history: ['password is Hunt9'],
  });
  assert.strictEqual(split.action, 'fixed_message');
  secretFree(split, 'Hunt9');
});

test('a symbol secret does not redact the word password in FAQ text', () => {
  const decision = guard.guardSend({
    messageType: 'comment',
    body: 'password reset instructions are on the site',
    history: ['password is pa$$w0rd'],
  });
  assert.strictEqual(decision.action, 'allow');
  assert.strictEqual(decision.body, 'password reset instructions are on the site');
});

test('eligibility negatives stay rejected', () => {
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
    'no need to send the spread-test account',
    'I cannot check the spreads',
    "I don't want a spread test",
    'I check the spreads every day',
    'I was testing the spreads',
    'I already test the spreads',
    'what is a spread test',
    'the test failed',
    'the spread of a rumor',
    'look at this spreadsheet',
    'the spread sheet is attached',
    'please check the spreads',
    'I want a spread test',
    'would you',
    'can you help with spreads',
    'please give me the account to check spreads',
    'spread check karo',
    'check karo the spreads',
    'स्प्रेड चेक करो',
    'سپریڈ ٹیسٹ کریں',
    'No, please send me the spread-test account',
    'please send him the spread-test account',
    'send me my account',
    'nahi bhejo spread test account',
    'لا أرسل لي حساب اختبار السبريد',
  ];
  assert.ok(rejected.length >= 22);
  for (const text of rejected) {
    assert.strictEqual(guard.isExplicitSpreadTestRequest(text), false, text);
  }
});

test('structured spread-test requests qualify and loose how-to requests do not', () => {
  const accepted = [
    'please send me the spread-test account',
    'send me the spread test credentials',
    'can you send the spread-test account?',
    'would you send me the spread test account',
    'how can I check spreads on the test account?',
    'please mujhe spread test account bhejo',
    'أرسل لي حساب اختبار السبريد',
    '<p>please send me the spread-test account</p>',
    'send&nbsp;me the spread-test account',
    'ｐｌｅａｓｅ ｓｅｎｄ ｍｅ ｔｈｅ spread-test account',
    'please send me my spread-test account',
    'The desk is quiet. Please send me the spread-test account.',
    'how do I check the spreads?',
    'how do I test the spreads with the test account',
    'no rush, please send me the spread-test account',
    'How do I check the spreads? When is my payout?',
    'कृपया स्प्रेड टेस्ट अकाउंट भेजो',
    'स्प्रेड कैसे चेक करें',
    'سپریڈ کیسے چیک کریں',
    'spreads kaise check karun',
    'كيف أتحقق من السبريد',
    'مجھے سپریڈ ٹیسٹ اکاؤنٹ بھیجو',
    'مجھے سپریڈ ٹیسٹ اکاونٹ بھیجو',
    'اختبر السبريد',
    'How should I check your spreads?',
    'I want to check the spreads',
    'سپریڈ چیک کرنے کا طریقہ بتائیں',
    'spread test account dena',
  ];
  for (const text of accepted) {
    assert.strictEqual(guard.isExplicitSpreadTestRequest(text), true, text);
  }
});

test('first contact may prefix an allowed greeting and both guards agree', () => {
  guard.resetStore();
  guard.rememberClientText('c-sync', ASK);
  const greeted = 'Hello Sam,\n\n' + guard.SPREAD_TEST_REPLY;
  assert.strictEqual(guard.isDeliverableSpreadTemplate(greeted), true);
  assert.strictEqual(greeted.endsWith(guard.SPREAD_TEST_REPLY), true);
  const html = greeted.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  const first = guard.guardSend({
    conversationId: 'c-sync',
    messageType: 'comment',
    body: greeted,
  });
  const second = guard.guardOutboundWrite(
    'https://api.intercom.io/conversations/c-sync/reply',
    { message_type: 'comment', body: html }
  );
  assert.strictEqual(first.post, true);
  assert.strictEqual(first.action, 'allow');
  assert.strictEqual(first.body, greeted);
  assert.strictEqual(second.post, true);
  assert.strictEqual(second.data.body, html);
  assert.strictEqual(first.spreadEligible, true);
  assert.strictEqual(second.spreadEligible, true);
  assert.strictEqual(first.payloadHash, guard.payloadHash(greeted));
  const prefixes = ['Hello,\n\n', 'Ciao,\n\n', 'Salam Ali,\n\n', 'السلام علیکم،\n\n'];
  for (const prefix of prefixes) {
    assert.strictEqual(guard.isDeliverableSpreadTemplate(prefix + guard.SPREAD_TEST_REPLY), true, prefix);
  }
  assert.strictEqual(guard.isDeliverableSpreadTemplate('Hello there friend,\n\n' + guard.SPREAD_TEST_REPLY), false);
});

test('an eligible template in one conversation does not authorize another', () => {
  guard.resetStore();
  const yes = guard.guardSend({
    conversationId: 'c-yes',
    messageType: 'comment',
    body: guard.SPREAD_TEST_REPLY,
    clientTexts: [ASK],
  });
  assert.strictEqual(yes.post, true);
  const no = guard.guardOutboundWrite(
    'https://api.intercom.io/conversations/c-no/reply',
    { message_type: 'comment', body: guard.SPREAD_TEST_REPLY }
  );
  assert.strictEqual(no.post, false);
  assert.strictEqual(no.data, null);
  secretFree(no, guard.TEMPLATE_PASSWORD);
});

test('template password is blocked unless the ask is eligible and the body is the template', () => {
  const blocked = guard.guardSend({
    messageType: 'comment',
    body: 'Password: ' + guard.TEMPLATE_PASSWORD,
    clientTexts: [ASK],
  });
  assert.strictEqual(blocked.action, 'fixed_message');
  assert.strictEqual(blocked.reason, 'template_password');
  secretFree(blocked, guard.TEMPLATE_PASSWORD);
  const ineligible = guard.guardSend({
    messageType: 'comment',
    body: 'Hello Sam,\n\n' + guard.SPREAD_TEST_REPLY,
    clientTexts: ['what is a spread test'],
  });
  assert.strictEqual(ineligible.post, false);
  assert.strictEqual(ineligible.body, null);
  secretFree(ineligible, guard.TEMPLATE_PASSWORD);
  const allowed = guard.guardSend({
    messageType: 'comment',
    body: guard.SPREAD_TEST_REPLY,
    clientTexts: [ASK],
  });
  assert.strictEqual(allowed.post, true);
  assert.strictEqual(allowed.body, guard.SPREAD_TEST_REPLY);
});

test('notes are redacted instead of replaced with the client fixed message', () => {
  const decision = guard.guardSend({
    messageType: 'note',
    body: 'Owner asked me to resend H u n t 9',
    history: ['password is Hunt9'],
  });
  assert.strictEqual(decision.action, 'redact');
  assert.ok(decision.body.includes('[secret]'));
  assert.ok(!decision.body.includes('Hunt9'));
  assert.notStrictEqual(decision.body, guard.FIXED_MESSAGE);
});

test('the second choke ships redacted notes and the fixed message', () => {
  guard.resetStore();
  guard.rememberClientText('n1', 'password is Hunt9');
  const note = guard.guardOutboundWrite(
    'https://api.intercom.io/conversations/n1/reply',
    { message_type: 'note', body: 'keep Hunt9 safe' }
  );
  assert.strictEqual(note.post, true);
  assert.ok(note.data.body.includes('[secret]'));
  assert.ok(!note.data.body.includes('Hunt9'));
  secretFree(note, 'Hunt9');
  const replay = guard.guardOutboundWrite(
    'https://api.intercom.io/conversations/n1/reply',
    { message_type: 'note', body: note.data.body }
  );
  assert.strictEqual(replay.post, true);
  assert.strictEqual(replay.data.body, note.data.body);

  guard.resetStore();
  const pub = guard.guardOutboundWrite(
    'https://api.intercom.io/conversations/p1/reply',
    { message_type: 'comment', body: 'password is Hunt9' }
  );
  assert.strictEqual(pub.post, true);
  assert.strictEqual(pub.data.body, guard.FIXED_MESSAGE);
  secretFree(pub, 'Hunt9');
  const again = guard.guardOutboundWrite(
    'https://api.intercom.io/conversations/p1/reply',
    { message_type: 'comment', body: guard.FIXED_MESSAGE }
  );
  assert.strictEqual(again.post, true);
  assert.strictEqual(again.data.body, guard.FIXED_MESSAGE);

  guard.resetStore();
  const placeholder = guard.guardSend({
    conversationId: 'ph',
    messageType: 'note',
    body: 'stored [secret] already',
  });
  assert.strictEqual(placeholder.action, 'allow');
  const placeholderWrite = guard.guardOutboundWrite(
    'https://api.intercom.io/conversations/ph/reply',
    { message_type: 'note', body: 'stored [secret] already' }
  );
  assert.strictEqual(placeholderWrite.post, true);
  assert.strictEqual(placeholderWrite.data.body, 'stored [secret] already');
});

test('both chokes share one payload hash for an unchanged body', () => {
  guard.resetStore();
  const first = guard.guardSend({
    conversationId: 'faq1',
    messageType: 'comment',
    body: FAQ,
  });
  const second = guard.guardOutboundWrite(
    'https://api.intercom.io/conversations/faq1/reply',
    { message_type: 'comment', body: FAQ }
  );
  assert.strictEqual(first.post, true);
  assert.strictEqual(second.post, true);
  assert.strictEqual(second.data.body, FAQ);
  assert.strictEqual(first.payloadHash, second.payloadHash);
  assert.strictEqual(first.payloadHash, guard.payloadHash(FAQ));
});

test('redact helpers cover remembered secrets for logs', () => {
  guard.resetStore();
  guard.rememberClientText('c-log', 'password is Hunt9');
  const outbound = guard.redactForConversation('c-log', 'noteOutbound repeated Hunt9');
  const skip = guard.redactForConversation('c-log', 'SKIP model says Hunt9');
  const history = guard.redactForConversation('c-log', 'Client: password is Hunt9');
  assert.ok(!outbound.includes('Hunt9'));
  assert.ok(!skip.includes('Hunt9'));
  assert.ok(!history.includes('Hunt9'));
  const diagnostic = guard.redactDiagnostic({
    body: 'password is Hunt9',
    message: 'failed because Hunt9',
    status: 500,
  });
  secretFree(diagnostic, 'Hunt9');
  assert.strictEqual(diagnostic.status, 500);
});

test('fail closed when the body is not text, validation throws, or the replacement still contains the secret', () => {
  const secret = 'Hunt9';
  const nonString = guard.guardSend({ messageType: 'comment', body: { toString() { throw new Error(secret); } } });
  assert.strictEqual(nonString.post, false);
  assert.strictEqual(nonString.reason, 'non_string');
  secretFree(nonString, secret);
  const validation = guard.guardSend({
    messageType: 'comment',
    body: 'hello',
    get history() { throw new Error('password is ' + secret); },
  });
  assert.strictEqual(validation.post, false);
  assert.strictEqual(validation.reason, 'validation_error');
  secretFree(validation, secret);
  const residual = guard.guardSend({
    messageType: 'comment',
    body: 'password is immediately',
    history: ['password is immediately'],
  });
  assert.strictEqual(residual.post, false);
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
  secretFree(flushed, 'Hunt9');
  const inspected = guard.inspectQueue();
  assert.ok(Array.isArray(inspected));
});

test('over-block controls stay allowed', () => {
  const reset = guard.guardSend({ messageType: 'comment', body: 'password reset instructions are on the site' });
  assert.strictEqual(reset.action, 'allow');
  assert.strictEqual(reset.body, 'password reset instructions are on the site');
  const challenge = guard.guardSend({ messageType: 'comment', body: 'I hope I pass the challenge' });
  assert.strictEqual(challenge.action, 'allow');
  assert.strictEqual(challenge.body, 'I hope I pass the challenge');
  const account = guard.guardSend({ messageType: 'comment', body: 'Your account number is 219876' });
  assert.strictEqual(account.action, 'allow');
  assert.strictEqual(account.body, 'Your account number is 219876');
  const longer = guard.guardSend({
    messageType: 'comment',
    body: 'use Hunt99 today',
    history: ['password is Hunt9'],
  });
  assert.strictEqual(longer.action, 'allow');
  assert.strictEqual(longer.body, 'use Hunt99 today');
  const clean = guard.guardSend({
    messageType: 'comment',
    body: 'Our team is reviewing this.',
    history: ['password is Hunt9'],
  });
  assert.strictEqual(clean.action, 'allow');
  assert.strictEqual(clean.body, 'Our team is reviewing this.');
  const ordinary = guard.guardSend({
    messageType: 'comment',
    body: 'what are your spreads',
    clientTexts: ['what are your spreads'],
  });
  assert.strictEqual(ordinary.action, 'allow');
  assert.strictEqual(ordinary.spreadEligible, false);
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
  guard.resetStore();
  guard.rememberClientText('c-spread', ASK);
  const greeted = 'Hello,\n\n' + guard.SPREAD_TEST_REPLY;
  const spreadTransport = guard.createRecordingTransport();
  const spreadChoke = guard.createChoke(spreadTransport);
  spreadChoke.postReply('c-spread', 'comment', greeted, {});
  assert.strictEqual(spreadTransport.records.length, 1);
  assert.strictEqual(spreadTransport.records[0].body, greeted);
  assert.ok(spreadTransport.records[0].body.endsWith(guard.SPREAD_TEST_REPLY));
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
  }
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

test('open and search payloads carry no customer text and a secret comment is replaced', () => {
  const openData = { message_type: 'open', type: 'admin', admin_id: 'seat' };
  const searchData = {
    query: { operator: 'AND', value: [{ field: 'open', operator: '=', value: true }] },
    pagination: { per_page: 50 },
  };
  assert.strictEqual(guard.carriesCustomerText(openData), false);
  assert.strictEqual(guard.carriesCustomerText(searchData), false);
  const openDecision = guard.guardOutboundWrite('https://api.intercom.io/conversations/c1/reply', openData);
  const searchDecision = guard.guardOutboundWrite('https://api.intercom.io/conversations/search', searchData);
  assert.strictEqual(openDecision.post, true);
  assert.strictEqual(searchDecision.post, true);
  const secretWrite = guard.guardOutboundWrite(
    'https://api.intercom.io/conversations/c1/reply',
    { message_type: 'comment', body: 'password is Hunt9' }
  );
  assert.strictEqual(secretWrite.post, true);
  assert.strictEqual(secretWrite.data.body, guard.FIXED_MESSAGE);
  secretFree(secretWrite, 'Hunt9');
});

test('runtime files are not wired to R10', () => {
  const root = path.join(__dirname, '../../..');
  const files = [
    'luna-current/01_runtime/index.js',
    'luna-current/02_statePresend/statePresend.js',
    'luna-current/03_luna-maintainer/collector.js',
  ];
  for (const file of files) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!src.includes('credentialGuardR10'), file);
    assert.ok(!src.includes('credential-guard-r10'), file);
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
    'noteOutbound',
    'messagesFor',
    'redactForConversation',
    'redactTurnMeta',
    'isExplicitSpreadTestRequest',
    'SPREAD_TEST_REPLY',
    'guardOutboundWrite',
    'writeOpStore',
    'IC_REQ_BLOCKED',
    'OUTBOUND_BLOCKED',
    'response_withheld',
    'request_error',
    'openConversation',
    'conversations/search',
    'buildHistory',
    'postProcessModelReply',
    "require('./credentialGuardR10')",
    "'../credentialGuardR10'",
    "'../01_runtime/credentialGuardR10'",
    'Latest client message',
    'pollDeferredRelatedReplies',
    'whitespace',
    '__searchBody',
    '__observed',
    'getLastVisionHint, messagesFor',
    '__guardedChat',
    'guardModelMessages',
    'summarizeEscalationsClientBatch',
    'ensureInternalNoteEnglish',
    'lunaToolsRuntime',
    'redactSystemContent',
    'AUTHORIZED_PROMPT_DISCLOSURE',
    'owner-dictated',
  ];
  for (const marker of required) assert.ok(diff.includes(marker), marker);
  assert.ok(!diff.includes('explicitSpreadTest'));
  assert.ok(!diff.includes('10_synthetic_lanes'));
  const postStart = diff.indexOf('async function postReply');
  const postEnd = diff.indexOf('async function closeConversation');
  const postHunk = diff.slice(postStart, postEnd);
  assert.ok(postHunk.includes('postProcessModelReply'));
  assert.ok(postHunk.indexOf('toHtml(') !== -1 && postHunk.indexOf('toHtml(') < postHunk.indexOf('guardSend'));
  const icStart = diff.indexOf('if (isWrite)');
  const icEnd = diff.indexOf('opId = writeOpStore.opKey');
  assert.ok(icStart !== -1 && icEnd > icStart);
  const icHunk = diff.slice(icStart, icEnd);
  assert.ok(icHunk.includes('guardOutboundWrite'));
  assert.ok(icHunk.includes('__writeDecision.data'));
  const lane = fs.readFileSync(path.join(__dirname, 'credentialGuardR10.js'), 'utf8');
  const marker = 'diff --git a/luna-current/01_runtime/credentialGuardR10.js b/luna-current/01_runtime/credentialGuardR10.js';
  const fileStart = diff.indexOf(marker);
  assert.ok(fileStart !== -1);
  const next = diff.indexOf('\ndiff --git ', fileStart + marker.length);
  const fileHunk = diff.slice(fileStart, next === -1 ? diff.length : next);
  assert.ok(fileHunk.includes('--- /dev/null'));
  const body = [];
  let inHunk = false;
  for (const line of fileHunk.split('\n')) {
    if (line.startsWith('+++')) { inHunk = true; continue; }
    if (!inHunk || line.startsWith('@@')) continue;
    if (line.startsWith('+')) body.push(line.slice(1));
  }
  const rebuilt = body.join('\n') + '\n';
  assert.strictEqual(rebuilt, lane);
  const root = path.join(__dirname, '../../..');
  const dry = spawnSync('patch', ['--dry-run', '-p1', '--forward', '--batch', '--silent'], {
    cwd: root,
    input: diff,
    encoding: 'utf8',
  });
  assert.strictEqual(dry.status, 0, dry.stdout + '\n' + dry.stderr);
  const indexSrc = fs.readFileSync(path.join(root, 'luna-current/01_runtime/index.js'), 'utf8');
  assert.ok(!indexSrc.includes('credentialGuardR10'));
});

test('module stays synthetic', () => {
  const src = fs.readFileSync(path.join(__dirname, 'credentialGuardR10.js'), 'utf8');
  assert.ok(!/require\(['"]fs['"]\)/.test(src));
  assert.ok(!/api\.intercom|process\.env|child_process/.test(src));
  assert.ok(!/\b(approved|refund|payout date|locked)\b/i.test(guard.FIXED_MESSAGE));
  assert.strictEqual(guard.MIN_VALUE_LENGTH, 4);
});

test('base64 after a label finishes and a match flood fails closed', () => {
  function timed(fn) {
    const started = Date.now();
    const result = fn();
    assert.ok(Date.now() - started < 1000);
    return result;
  }
  const padded = Buffer.from('Hunt9value').toString('base64');
  assert.ok(timed(() => values('password: ' + padded)).includes('Hunt9value'));
  const unpadded = padded.replace(/=+$/, '');
  assert.notStrictEqual(unpadded, padded);
  assert.ok(timed(() => values('password: ' + unpadded)).includes('Hunt9value'));
  const url = Buffer.from('subjects? ok').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.ok(/[-_]/.test(url));
  assert.ok(timed(() => values('password: ' + url)).includes('subjects? ok'));
  const many = Array.from({ length: 80 }, () => 'password: Hunt9').join('\n');
  const flooded = timed(() => guard.guardSend({ messageType: 'comment', body: many }));
  assert.strictEqual(flooded.post, false);
  assert.strictEqual(flooded.reason, 'validation_error');
  secretFree(flooded, 'Hunt9');
});

test('fullwidth keys, 12-character bearers, and spaced templates are recognized', () => {
  const full = 'ｓｋ－' + 'ａ'.repeat(20);
  const key = guard.guardSend({ messageType: 'comment', body: 'use ' + full + ' now' });
  assert.strictEqual(key.reason, 'key_material');
  assert.strictEqual(key.action, 'fixed_message');
  secretFree(key, 'sk-' + 'a'.repeat(20));
  const token = 'd'.repeat(12);
  assert.deepStrictEqual(guard.keyMaterialValues('Bearer ' + token), [token]);
  assert.deepStrictEqual(guard.keyMaterialValues('Bearer ' + 'd'.repeat(11)), []);
  const spaced = guard.SPREAD_TEST_REPLY.split('\n').filter((line) => line.trim()).join('\n\n');
  assert.notStrictEqual(spaced, guard.SPREAD_TEST_REPLY);
  assert.strictEqual(guard.whitespaceHash(spaced), guard.whitespaceHash(guard.SPREAD_TEST_REPLY));
  assert.strictEqual(guard.isDeliverableSpreadTemplate(spaced), true);
  guard.resetStore();
  const allowed = guard.guardSend({
    messageType: 'comment',
    body: spaced,
    clientTexts: ['how do I check the spreads?'],
  });
  assert.strictEqual(allowed.post, true);
  assert.strictEqual(allowed.body, spaced);
  assert.strictEqual(guard.normalizeForMatch('اکاؤنٹ'), guard.normalizeForMatch('اکاونٹ'));
});

test('key families, nested encodings, and embedded secrets are detected', () => {
  assert.ok(values('API key: Hunt9abcd').includes('Hunt9abcd'));
  assert.ok(values('apikey=Hunt9abcd').includes('Hunt9abcd'));
  assert.ok(guard.keyMaterialValues('Bearer ' + 'd'.repeat(12)).includes('d'.repeat(12)));
  assert.ok(guard.keyMaterialValues('xxsk-' + 'a'.repeat(12)).some((item) => item.indexOf('sk-') === 0));
  const encoded = 'password: ' + Array.from('Hunt9').map((ch) => '&#' + ch.charCodeAt(0) + ';').join('');
  const nested = encoded.replace(/&/g, '&amp;');
  assert.ok(values(nested).includes('Hunt9'));
  guard.resetStore();
  guard.rememberClientText('embed', 'password is Hunt9');
  assert.strictEqual(guard.containsSecret('see pass=Hunt9 please', 'Hunt9'), true);
  assert.strictEqual(guard.containsSecret('use Hunt99 today', 'Hunt9'), false);
  assert.strictEqual(guard.containsSecret('Hun\u200bt9', 'Hunt9'), true);
  const faq = guard.guardSend({ messageType: 'comment', body: 'password reset instructions are on the site' });
  assert.strictEqual(faq.action, 'allow');
});

test('an unclosed comment of 100k characters fails closed within 200ms', () => {
  const started = Date.now();
  const decision = guard.guardSend({ messageType: 'comment', body: '<!--' + 'a'.repeat(100000) + ' password is Hunt9' });
  assert.ok(Date.now() - started < 200);
  assert.strictEqual(decision.post, false);
  assert.strictEqual(decision.reason, 'validation_error');
  secretFree(decision, 'Hunt9');
});

test('the protected system prompt disclosure stays and other secrets cannot ride along', () => {
  const prompt = fs.readFileSync(path.join(__dirname, '../../01_runtime/system-prompt.txt'), 'utf8');
  assert.strictEqual(prompt.length, guard.AUTHORIZED_PROMPT_DISCLOSURE.length);
  assert.strictEqual(guard.payloadHash(prompt), guard.AUTHORIZED_PROMPT_DISCLOSURE.sha256);
  assert.ok(prompt.includes('55188'));
  assert.ok(prompt.includes(guard.TEMPLATE_PASSWORD));
  const exact = guard.redactSystemContent('sys', prompt);
  assert.strictEqual(exact, prompt);
  const ridden = guard.redactSystemContent('sys', prompt + '\npassword is Hunt9');
  assert.ok(ridden.startsWith(prompt));
  assert.ok(ridden.includes(guard.TEMPLATE_PASSWORD));
  assert.ok(!ridden.includes('Hunt9'));
  const messages = guard.guardModelMessages('sys', [
    { role: 'system', content: prompt },
    { role: 'user', content: 'password is Hunt9' },
  ]);
  assert.strictEqual(messages[0].content, prompt);
  assert.ok(!messages[1].content.includes('Hunt9'));
});

console.log('credential-guard-r10', passed, 'passed');
