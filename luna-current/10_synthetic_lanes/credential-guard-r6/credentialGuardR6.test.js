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
  assert.strictEqual(String(result.body).includes(secret), false);
}

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
  const redacted = guard.redactText('account 219876 and password is Hunt9');
  assert.ok(redacted.includes('219876'));
  assert.ok(!redacted.includes('Hunt9'));
});

test('base64 echo of a client secret is detected', () => {
  const secret = 'Hunt9';
  const encoded = Buffer.from(secret).toString('base64');
  assert.strictEqual(guard.containsSecret('see ' + encoded + ' thanks', secret), true);
  const decision = guard.guardSend({
    messageType: 'comment',
    body: 'decoded for you ' + encoded,
    history: ['password is ' + secret],
  });
  assert.strictEqual(decision.action, 'fixed_message');
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
  secretFree(decision, 'Hunt9');
});

test('a clean draft is allowed even when history has a secret', () => {
  const decision = guard.guardSend({
    messageType: 'comment',
    body: 'Our team is reviewing this.',
    history: ['password is Hunt9'],
  });
  assert.strictEqual(decision.action, 'allow');
  assert.strictEqual(decision.body, 'Our team is reviewing this.');
});

test('spread idioms do not request the 55188 template', () => {
  assert.strictEqual(guard.isExplicitSpreadTestRequest('can you spread some light on the payout'), false);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('the problem spread to the other account'), false);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('what is the risk spread on this'), false);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('what are your spreads'), false);
});

test('explicit spread check or test requests qualify, including non-English', () => {
  assert.strictEqual(guard.isExplicitSpreadTestRequest('please check the spreads'), true);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('I want a spread test'), true);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('spread check karo'), true);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('स्प्रेड चेक करो'), true);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('سپریڈ ٹیسٹ کریں'), true);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('اختبر السبريد'), true);
  assert.strictEqual(guard.isExplicitSpreadTestRequest('ｃｈｅｃｋ the ｓｐｒｅａｄｓ'), true);
});

test('template password is blocked in a non-spread draft and allowed on an explicit request', () => {
  const blocked = guard.guardSend({
    messageType: 'comment',
    body: 'Password: ' + guard.TEMPLATE_PASSWORD,
    explicitSpreadTest: false,
  });
  assert.strictEqual(blocked.action, 'fixed_message');
  assert.strictEqual(blocked.reason, 'template_password');
  secretFree(blocked, guard.TEMPLATE_PASSWORD);
  const allowed = guard.guardSend({
    messageType: 'comment',
    body: 'Password: ' + guard.TEMPLATE_PASSWORD,
    explicitSpreadTest: true,
  });
  assert.strictEqual(allowed.action, 'allow');
  assert.ok(allowed.body.includes(guard.TEMPLATE_PASSWORD));
});

test('notes are redacted instead of replaced with the client fixed message', () => {
  const decision = guard.guardSend({
    messageType: 'note',
    body: 'Owner asked me to resend Hunt9',
    history: ['password is Hunt9'],
  });
  assert.strictEqual(decision.action, 'redact');
  assert.ok(decision.body.includes('[secret]'));
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
});

test('single choke covers owner reply, auth reply, retries, and replay', () => {
  guard.resetStore();
  const sent = [];
  const choke = guard.createChoke({
    postReply(id, type, body) {
      sent.push({ via: 'postReply', id, type, body });
      return { ok: true, status: 200 };
    },
    postClientCommentOnce(id, body) {
      sent.push({ via: 'postClientCommentOnce', id, body });
      return { ok: true };
    },
  });
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
    sent.length = 0;
    run();
    assert.strictEqual(sent.length, 1, name);
    assert.strictEqual(sent[0].body, guard.FIXED_MESSAGE, name);
    assert.ok(!sent[0].body.includes('Hunt9'), name);
  }
  sent.length = 0;
  choke.postClientCommentOnce('c1', 'Password: ' + guard.TEMPLATE_PASSWORD, null, 'A', {
    explicitSpreadTest: true,
  });
  assert.ok(sent[0].body.includes(guard.TEMPLATE_PASSWORD));
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
  ];
  for (const marker of required) assert.ok(diff.includes(marker), marker);
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
