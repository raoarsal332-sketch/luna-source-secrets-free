'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const guard = require('./credentialGuardR11');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS', name);
}

test('status stays unapproved and unwired', () => {
  assert.strictEqual(guard.STATUS.candidate, 'credential-guard-r11');
  assert.strictEqual(guard.STATUS.frozen, true);
  assert.strictEqual(guard.STATUS.approved, false);
  assert.strictEqual(guard.STATUS.release, false);
  assert.strictEqual(guard.STATUS.wired, false);
});

test('deny by default blocks credential values, glued tokens, and spaced passwords', () => {
  guard.resetStore();
  const labeled = guard.guardSend({ messageType: 'comment', body: 'password is Hunt9' });
  assert.strictEqual(labeled.body, guard.FIXED_MESSAGE);
  assert.ok(!labeled.body.includes('Hunt9'));
  const spaced = guard.guardSend({ messageType: 'comment', body: 'password is H u n t 9' });
  assert.strictEqual(spaced.body, guard.FIXED_MESSAGE);
  const glued = guard.guardSend({ messageType: 'comment', body: 'pass=Hunt9' });
  assert.strictEqual(glued.body, guard.FIXED_MESSAGE);
  const homo = guard.guardSend({ messageType: 'comment', body: 'p\u0430ssword is Hunt9' });
  assert.strictEqual(homo.body, guard.FIXED_MESSAGE);
  const key = guard.guardSend({ messageType: 'comment', body: 'api_key sk-abcdefghijklmnop' });
  assert.strictEqual(key.body, guard.FIXED_MESSAGE);
});

test('owner replies without a label use the same rule', () => {
  guard.resetStore();
  const decision = guard.guardSend({
    conversationId: 'owner',
    messageType: 'comment',
    body: 'Use Hunt9 now',
    history: ['password is Hunt9'],
  });
  assert.strictEqual(decision.body, guard.FIXED_MESSAGE);
  assert.ok(!decision.body.includes('Hunt9'));
  const note = guard.guardSend({
    conversationId: 'owner',
    messageType: 'note',
    body: 'resend Hunt9 to the client',
  });
  assert.strictEqual(note.body, guard.FIXED_MESSAGE);
});

test('longer tokens and ordinary wording stay allowed', () => {
  guard.resetStore();
  const longer = guard.guardSend({
    messageType: 'comment',
    body: 'use Hunt99 today',
    history: ['password is Hunt9'],
  });
  assert.strictEqual(longer.action, 'allow');
  assert.strictEqual(longer.body, 'use Hunt99 today');
  const reset = guard.guardSend({ messageType: 'comment', body: 'password reset instructions are on the site' });
  assert.strictEqual(reset.action, 'allow');
  const account = guard.guardSend({ messageType: 'comment', body: 'Your account number is 219876' });
  assert.strictEqual(account.action, 'allow');
  const clean = guard.guardSend({
    messageType: 'comment',
    body: 'Our team is reviewing this.',
    history: ['password is Hunt9'],
  });
  assert.strictEqual(clean.action, 'allow');
});

test('base64 and hex spans are blocked, including a nested base64 value', () => {
  const secret = 'password is Hunt9';
  const once = Buffer.from(secret).toString('base64');
  const twice = Buffer.from(once).toString('base64');
  const hex = Buffer.from('Hunt9xx').toString('hex');
  assert.strictEqual(guard.guardSend({ messageType: 'comment', body: 'see ' + once }).body, guard.FIXED_MESSAGE);
  assert.strictEqual(guard.guardSend({ messageType: 'comment', body: twice }).body, guard.FIXED_MESSAGE);
  assert.strictEqual(guard.guardSend({ messageType: 'comment', body: 'token ' + hex }).body, guard.FIXED_MESSAGE);
});

test('normal FAQ replies are not over-blocked', () => {
  const faq = fs.readFileSync(path.join(__dirname, '../../01_runtime/fundedelite-faqs.md'), 'utf8');
  const parts = faq.split('\n---\n');
  let blocked = 0;
  let checked = 0;
  for (const part of parts) {
    const body = part.split('\n').filter((line) => line.indexOf('URL:') !== 0 && line.indexOf('Index:') !== 0 && line.indexOf('#') !== 0).join('\n').trim();
    if (body.length < 40 || body.length > 30000) continue;
    checked += 1;
    guard.resetStore();
    const decision = guard.guardSend({ messageType: 'comment', body: body });
    if (decision.action !== 'allow' || decision.body !== body) blocked += 1;
  }
  assert.ok(checked > 100);
  assert.strictEqual(blocked, 0);
});

test('spread plus check, test, demo, or account intent is eligible in the core languages', () => {
  const accepted = [
    'I want the demo account to check spreads',
    'مجھے سپریڈ ٹیسٹ اکاؤنٹ بھیجیں',
    'स्प्रेड चेक करने का तरीका बताएं',
    'How should I check your spreads?',
    'I want to check the spreads',
    'سپریڈ چیک کرنے کا طریقہ بتائیں',
    'spread test account dena',
    'please send me the spread-test account',
    'how do I check the spreads?',
    'اختبر السبريد',
    'كيف أتحقق من السبريد',
    'स्प्रेड कैसे चेक करें',
    'سپریڈ کیسے چیک کریں',
  ];
  for (const text of accepted) assert.strictEqual(guard.isExplicitSpreadTestRequest(text), true, text);
  const rejected = [
    'please check the spreads',
    'I want a spread test',
    'what are your spreads',
    'I check the spreads every day',
    'I was testing the spreads',
    'No, please send me the spread-test account',
    'please check the spreads for my payout',
    'can you help with spreads',
    'spread check karo',
    'سبريد اختبر',
    'the spread of a rumor',
    'look at this spreadsheet',
  ];
  for (const text of rejected) assert.strictEqual(guard.isExplicitSpreadTestRequest(text), false, text);
});

test('the 55188 template is allowed only for an eligible ask', () => {
  guard.resetStore();
  const ask = 'please send me the spread-test account';
  const allowed = guard.guardSend({
    messageType: 'comment',
    body: guard.SPREAD_TEST_REPLY,
    clientTexts: [ask],
  });
  assert.strictEqual(allowed.action, 'allow');
  assert.strictEqual(allowed.body, guard.SPREAD_TEST_REPLY);
  const greeted = 'Hello Sam,\n\n' + guard.SPREAD_TEST_REPLY;
  assert.strictEqual(guard.isDeliverableSpreadTemplate(greeted), true);
  const ineligible = guard.guardSend({
    messageType: 'comment',
    body: guard.SPREAD_TEST_REPLY,
    clientTexts: ['what are your spreads'],
  });
  assert.strictEqual(ineligible.body, guard.FIXED_MESSAGE);
  assert.ok(!ineligible.body.includes(guard.TEMPLATE_PASSWORD));
});

test('model messages, tool calls, memory, and logs are scrubbed', () => {
  guard.resetStore();
  guard.rememberClientText('m1', 'password is Hunt9');
  const messages = guard.guardModelMessages('m1', [
    { role: 'system', content: 'You are Luna.' },
    { role: 'user', content: 'password is Hunt9' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: '1', type: 'function', function: { name: 'search_knowledge', arguments: '{"q":"Hunt9"}' } }],
    },
    { role: 'tool', tool_call_id: '1', content: 'tool output Hunt9' },
  ]);
  assert.ok(!JSON.stringify(messages).includes('Hunt9'));
  assert.ok(messages[2].tool_calls[0].function.arguments.includes('[redacted]'));
  const memory = guard.redactForConversation('m1', 'noteInbound Hunt9');
  assert.ok(!memory.includes('Hunt9'));
  const logged = guard.scrubLogArgs(['maintainer stdout Hunt9', { body: 'Hunt9' }]);
  assert.ok(!JSON.stringify(logged).includes('Hunt9'));
});

test('the protected system prompt stays and other secrets cannot ride along', () => {
  const prompt = fs.readFileSync(path.join(__dirname, '../../01_runtime/system-prompt.txt'), 'utf8');
  assert.strictEqual(prompt.length, guard.AUTHORIZED_PROMPT_DISCLOSURE.length);
  assert.strictEqual(guard.payloadHash(prompt), guard.AUTHORIZED_PROMPT_DISCLOSURE.sha256);
  assert.strictEqual(guard.redactSystemContent('sys', prompt), prompt);
  const ridden = guard.redactSystemContent('sys', prompt + '\npassword is Hunt9');
  assert.ok(ridden.startsWith(prompt));
  assert.ok(ridden.includes(guard.TEMPLATE_PASSWORD));
  assert.ok(!ridden.slice(prompt.length).includes('Hunt9'));
  const messages = guard.guardModelMessages('sys', [
    { role: 'system', content: prompt },
    { role: 'user', content: 'password is Hunt9' },
  ]);
  assert.strictEqual(messages[0].content, prompt);
  assert.ok(!messages[1].content.includes('Hunt9'));
});

test('a long run of angle brackets fails closed in under 200ms', () => {
  const started = Date.now();
  const decision = guard.guardSend({ messageType: 'comment', body: '<'.repeat(100000) });
  assert.ok(Date.now() - started < 200);
  assert.strictEqual(decision.post, false);
  assert.strictEqual(decision.reason, 'validation_error');
  const startedShort = Date.now();
  const shorter = guard.guardSend({ messageType: 'comment', body: '<'.repeat(20000) });
  assert.ok(Date.now() - startedShort < 200);
  assert.strictEqual(shorter.post, false);
});

test('the queue refuses a secret and an unchanged FAQ shares one hash', () => {
  guard.resetStore();
  const transport = guard.createRecordingTransport();
  const dirty = guard.enqueuePublicOp({ conversationId: 'q', messageType: 'comment', body: 'password is Hunt9' });
  assert.strictEqual(dirty.queued, false);
  guard.flushQueue(transport);
  assert.strictEqual(transport.records.length, 0);
  guard.resetStore();
  const faq = 'Our team is reviewing this.';
  const first = guard.guardSend({ conversationId: 'faq', messageType: 'comment', body: faq });
  const second = guard.guardOutboundWrite('https://api.intercom.io/conversations/faq/reply', { message_type: 'comment', body: faq });
  assert.strictEqual(first.post, true);
  assert.strictEqual(second.post, true);
  assert.strictEqual(second.data.body, faq);
  assert.strictEqual(first.payloadHash, second.payloadHash);
  const openData = { message_type: 'open' };
  assert.strictEqual(guard.carriesCustomerText(openData), false);
  const search = guard.guardOutboundWrite('https://api.intercom.io/conversations/search', { query: { field: 'open' } });
  assert.strictEqual(search.reason, 'no_public_body');
});

test('runtime files are not wired and the protected files are unchanged', () => {
  const root = path.join(__dirname, '../../..');
  const prompt = fs.readFileSync(path.join(root, 'luna-current/01_runtime/system-prompt.txt'));
  const faqs = fs.readFileSync(path.join(root, 'luna-current/01_runtime/fundedelite-faqs.md'));
  assert.strictEqual(require('crypto').createHash('sha256').update(prompt).digest('hex'), guard.AUTHORIZED_PROMPT_DISCLOSURE.sha256);
  assert.strictEqual(require('crypto').createHash('sha256').update(faqs).digest('hex'), '8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92');
  const index = fs.readFileSync(path.join(root, 'luna-current/01_runtime/index.js'), 'utf8');
  assert.ok(!index.includes('credentialGuardR11'));
});

test('proposed integration diff stays unapplied and names the choke', () => {
  const diff = fs.readFileSync(path.join(__dirname, 'proposed-integration.diff'), 'utf8');
  const required = [
    'postReply',
    'postClientCommentOnce',
    '__guardedChat',
    'guardModelMessages',
    'tool_calls',
    'summarizeEscalationsClientBatch',
    'ensureInternalNoteEnglish',
    'lunaToolsRuntime',
    'luna-export/lunaToolsRuntime.js',
    'owner-dictated',
    'installProcessScrub',
    'redactForConversation',
    'noteInbound',
    'messagesFor',
    'guardOutboundWrite',
    "require('./credentialGuardR11')",
    "'./credentialGuardR11'",
    'observability',
    'stdout',
  ];
  for (const marker of required) assert.ok(diff.includes(marker), marker);
  const lane = fs.readFileSync(path.join(__dirname, 'credentialGuardR11.js'), 'utf8');
  const marker = 'diff --git a/luna-current/01_runtime/credentialGuardR11.js b/luna-current/01_runtime/credentialGuardR11.js';
  const fileStart = diff.indexOf(marker);
  assert.ok(fileStart !== -1);
  const next = diff.indexOf('\ndiff --git ', fileStart + marker.length);
  const fileHunk = diff.slice(fileStart, next === -1 ? diff.length : next);
  const body = [];
  let inHunk = false;
  for (const line of fileHunk.split('\n')) {
    if (line.startsWith('+++')) { inHunk = true; continue; }
    if (!inHunk || line.startsWith('@@')) continue;
    if (line.startsWith('+')) body.push(line.slice(1));
  }
  assert.strictEqual(body.join('\n') + '\n', lane.endsWith('\n') ? lane : lane + '\n');
  const dry = spawnSync('patch', ['--dry-run', '-p1', '--forward', '--batch', '--silent'], {
    cwd: path.join(__dirname, '../../..'),
    input: diff,
    encoding: 'utf8',
  });
  assert.strictEqual(dry.status, 0, dry.stdout + '\n' + dry.stderr);
});

test('module stays synthetic', () => {
  const src = fs.readFileSync(path.join(__dirname, 'credentialGuardR11.js'), 'utf8');
  assert.ok(!src.includes('api.intercom.io'));
  assert.ok(!src.includes('process.env'));
  assert.ok(src.includes('approved: false'));
});

console.log('credential-guard-r11', passed, 'passed');
