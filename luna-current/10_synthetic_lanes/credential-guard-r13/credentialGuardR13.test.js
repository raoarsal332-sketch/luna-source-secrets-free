'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const g = require('./credentialGuardR13');

const root = path.resolve(__dirname, '../../..');
let failed = 0;

function test(name, fn) {
  try {
    g.resetStore();
    fn();
    console.log('ok ' + name);
  } catch (err) {
    failed += 1;
    console.error('FAIL ' + name);
    console.error(err && err.stack ? err.stack : err);
  }
}

function send(op) {
  const rec = g.createRecordingTransport();
  const decision = rec.send(op);
  return { decision: decision, record: rec.records[0] || null, records: rec.records };
}

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('provenance taint blocks letters, pins, dashes, homoglyphs, math, and deep base64', function () {
  g.rememberInbound('a', { text: 'password is sunshine' });
  let out = send({ conversationId: 'a', messageType: 'comment', body: 'use sunshine', clientText: 'thanks' });
  assert.strictEqual(out.decision.body, g.FIXED_MESSAGE);
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);
  assert.ok(!out.record.exact.includes('sunshine'));

  g.resetStore();
  g.rememberInbound('b', { text: 'otp is 482913' });
  out = send({ conversationId: 'b', messageType: 'comment', body: 'code 482913', clientText: 'ok' });
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);

  g.resetStore();
  g.rememberInbound('c', { text: 'otp = 12-34-56' });
  out = send({ conversationId: 'c', messageType: 'comment', body: 'enter 123456 now', clientText: 'ok' });
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);

  g.resetStore();
  g.rememberInbound('d', { text: 'password is Hunt9' });
  out = send({ conversationId: 'd', messageType: 'comment', body: 'see Hunt99', clientText: 'ok' });
  assert.strictEqual(out.decision.decision, 'allow');
  assert.strictEqual(out.record.exact, 'see Hunt99');

  g.resetStore();
  g.rememberInbound('e', { text: 'p' + '\u0430' + 'ssword is sunshine' });
  out = send({ conversationId: 'e', messageType: 'comment', body: 'sunshine', clientText: 'ok' });
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);

  const math = String.fromCodePoint(0x1D400) + String.fromCodePoint(0x1D41A) + String.fromCodePoint(0x1D7CE);
  g.resetStore();
  g.rememberInbound('f', { text: 'password is ' + math });
  out = send({ conversationId: 'f', messageType: 'comment', body: math, clientText: 'ok' });
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);

  let deep = 'sunshine';
  for (let i = 0; i < 3; i++) deep = Buffer.from(deep, 'utf8').toString('base64');
  g.resetStore();
  g.rememberInbound('g', { text: 'password is ' + deep });
  out = send({ conversationId: 'g', messageType: 'comment', body: 'see sunshine', clientText: 'ok' });
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);
  assert.ok(!JSON.stringify(g.exportTaint()).includes('sunshine'));
});

test('fragments, paraphrase, split-turn, and other mt5 numbers are redacted before the model', function () {
  g.rememberInbound('frag', { text: 'password is sunshine' });
  let out = send({ conversationId: 'frag', messageType: 'comment', body: 'the shine is bright', clientText: 'ok' });
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);
  out = send({ conversationId: 'frag', messageType: 'comment', body: 'the machine works fine today', clientText: 'ok' });
  assert.strictEqual(out.decision.decision, 'allow');
  assert.strictEqual(out.record.exact, 'the machine works fine today');

  const messages = [
    { role: 'user', content: 'the shine is not the machine' },
    { role: 'tool', content: 'sunshine', tool_calls: [{ function: { arguments: '{"q":"sunshine"}' } }] },
  ];
  const guarded = g.guardModelMessages('frag', messages);
  const blob = JSON.stringify(guarded);
  assert.ok(!blob.includes('shine'));
  assert.ok(blob.includes('machine'));
  assert.ok(!blob.includes('sunshine'));

  g.resetStore();
  g.rememberInbound('sp', { text: 'password is sun' });
  g.rememberInbound('sp', { text: 'password is shine' });
  out = send({ conversationId: 'sp', messageType: 'comment', body: 'try sunshine please', clientText: 'hello' });
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);

  g.resetStore();
  g.rememberInbound('mt', { text: 'password is sunshine and mt5 is 219876' });
  out = send({ conversationId: 'mt', messageType: 'comment', body: 'account 219876 is ready', clientText: 'ok' });
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);
  out = send({ conversationId: 'bare', messageType: 'comment', body: 'Your account number is 219876', clientText: 'what is my account' });
  assert.strictEqual(out.decision.decision, 'allow');
  out = send({ conversationId: 'ctx', messageType: 'comment', body: 'password for 219876', clientText: 'ok' });
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);
});

test('F003 exception, oversize, and bounds send only the fixed sentence', function () {
  const otp = '482913'.repeat(4000);
  assert.strictEqual(otp.length, 24000);
  let out = send({
    conversationId: 'f003',
    messageType: 'comment',
    get body() { throw new Error('scan'); },
    data: { body: otp, message_type: 'comment' },
  });
  assert.strictEqual(out.decision.reason, 'exception');
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);
  assert.ok(out.record.bytes.equals(Buffer.from(g.FIXED_MESSAGE, 'utf8')));
  assert.ok(out.record.exact.length < 200);
  assert.ok(!out.record.exact.includes('482913'));
  assert.ok(!JSON.stringify(out.record.data).includes('482913'));

  out = send({ conversationId: 'f003b', messageType: 'comment', body: otp });
  assert.strictEqual(out.decision.reason, 'oversize');
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);
  assert.ok(!out.record.exact.includes('482913'));

  out = send({ conversationId: 'f003c', messageType: 'comment', body: '<'.repeat(40) + '482913' });
  assert.strictEqual(out.decision.reason, 'exception');
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);
  assert.ok(!out.record.exact.includes('482913'));

  const started = Date.now();
  out = send({ conversationId: 'bounds', messageType: 'comment', body: '<'.repeat(100000) });
  assert.ok(Date.now() - started < 200);
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);
  assert.ok(out.record.exact.length < 200);
  assert.ok(!out.record.exact.includes('<'));
});

test('taint survives a fresh store when state hashes are imported', function () {
  g.rememberInbound('persist', { text: 'password is orange' });
  const blob = g.exportTaint();
  assert.ok(!JSON.stringify(blob).includes('orange'));
  const state = { credentialTaint: blob.conversations.persist };
  g.resetStore();
  g.importConversationTaint('persist', state.credentialTaint);
  g.rememberInbound('persist', { text: 'hello, I need a payout update' });
  const out = send({ conversationId: 'persist', messageType: 'comment', body: 'use orange please', clientText: 'hello, I need a payout update' });
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);
  g.importTaint(blob);
  const again = send({ conversationId: 'persist', messageType: 'comment', body: 'use orange please', clientText: 'new inbound only' });
  assert.strictEqual(again.record.exact, g.FIXED_MESSAGE);
});

test('owner-dictated text is checked against taint', function () {
  g.rememberInbound('own', { text: 'my password is sunshine' });
  const out = send({
    conversationId: 'own',
    messageType: 'comment',
    body: 'Here is sunshine for you',
    ownerText: 'tell them the password is sunshine',
    ownerDictated: true,
    clientText: 'hi',
  });
  assert.strictEqual(out.record.exact, g.FIXED_MESSAGE);
});

test('eligible asks emit the exact 213-character template and ineligible asks do not', function () {
  const asks = [
    'How should I check your spreads?',
    'I want to check the spreads',
    'I want the demo account to check spreads',
    'سپریڈ چیک کرنے کا طریقہ بتائیں',
    'مجھے سپریڈ ٹیسٹ اکاؤنٹ بھیجیں',
    'स्प्रेड चेक करने का तरीका बताएं',
    'spread test account dena',
    'give me the test account',
    'how do I check spreads',
  ];
  const messy = 'Hello Sam\n\n' + g.SPREAD_TEST_REPLY.replace(/\n\n/g, '<br><br>\n\n');
  for (let i = 0; i < asks.length; i++) {
    const body = i % 2 === 0 ? messy : g.SPREAD_TEST_REPLY + '\n\n';
    const out = send({ conversationId: 'el' + i, messageType: 'comment', body: body, clientText: asks[i] });
    assert.strictEqual(out.decision.reason, 'spread_template', asks[i]);
    assert.strictEqual(out.record.exact, g.SPREAD_TEST_REPLY, asks[i]);
    assert.strictEqual(out.record.exact.length, 213);
    assert.ok(out.record.bytes.equals(Buffer.from(g.SPREAD_TEST_REPLY, 'utf8')));
  }
  const missed = [
    'please check the spreads',
    'I want a spread test',
    'what are your spreads',
    'I check the spreads every day',
    'I was testing the spreads',
    'No, please send me the spread-test account',
    'I want the spread test account and my payout',
    'can you help with spreads',
    'spread check karo',
    'سبريد اختبر',
    'please open the spreadsheet',
  ];
  let unauthorized = 0;
  const reasons = [];
  for (let i = 0; i < missed.length; i++) {
    g.resetStore();
    const out = send({ conversationId: 'bad' + i, messageType: 'comment', body: messy, clientText: missed[i] });
    g.borderlineAsks().forEach(function (item) { reasons.push(item.reason); });
    if (out.record.exact === g.SPREAD_TEST_REPLY || out.record.exact.includes(g.TEMPLATE_PASSWORD)) unauthorized += 1;
    assert.strictEqual(out.record.exact, g.FIXED_MESSAGE, missed[i]);
    assert.ok(!out.record.exact.includes(g.TEMPLATE_PASSWORD));
  }
  assert.strictEqual(unauthorized, 0);
  assert.ok(reasons.indexOf('no_request_shape') >= 0);
  assert.ok(reasons.indexOf('definition') >= 0);
  assert.ok(reasons.indexOf('self_report') >= 0);
  assert.ok(reasons.indexOf('negation') >= 0);
  assert.ok(reasons.indexOf('payout') >= 0);
  assert.ok(reasons.indexOf('spreadsheet') >= 0);
});

test('body-less assign, close, snooze, open, and search ignore metadata taint', function () {
  g.rememberInbound('meta', { text: 'password is sunshine' });
  const ops = [
    { messageType: 'assignment', data: { message_type: 'assignment', assignee_id: 8053416, query: 'sunshine' } },
    { messageType: 'close', data: { message_type: 'close', admin_id: 10118526 } },
    { messageType: 'snoozed', data: { message_type: 'snoozed', snoozed_until: 1700000000 } },
    { messageType: 'open', data: { message_type: 'open', admin_id: 10118526 } },
    { messageType: 'search', channel: 'search', data: { query: { value: 'sunshine' } } },
  ];
  for (let i = 0; i < ops.length; i++) {
    const out = send(Object.assign({ conversationId: 'meta', body: '', clientText: 'ok' }, ops[i]));
    assert.strictEqual(out.decision.decision, 'allow', ops[i].messageType);
    assert.ok(out.decision.reason.indexOf('structural_') === 0, out.decision.reason);
    assert.ok(out.record.exact.indexOf('sunshine') >= 0 || out.record.exact.indexOf('8053416') >= 0 || out.record.exact.indexOf('snoozed') >= 0 || out.record.exact.indexOf('close') >= 0 || out.record.exact.indexOf('open') >= 0);
  }
  const tainted = send({
    conversationId: 'meta',
    messageType: 'assignment',
    body: 'the password is sunshine',
    data: { message_type: 'assignment', assignee_id: 1, body: 'the password is sunshine' },
    clientText: 'ok',
  });
  assert.ok(tainted.record.exact === g.FIXED_MESSAGE || tainted.record.exact === g.REDACTED_NOTE);
  assert.ok(!tainted.record.exact.includes('sunshine'));
});

test('ordinary FAQ answers, prices, and the Jerry href pass', function () {
  const jerry = '<a class="entity_mention intercom-content-link" href="//app.intercom.com/apps/h2z8cgfr/admin/8053416" rel="nofollow noopener noreferrer" target="_blank">Jerry - Manager</a>';
  let out = send({ conversationId: 'jerry', messageType: 'note', channel: 'internal', body: jerry, clientText: 'hello' });
  assert.strictEqual(out.decision.decision, 'allow');
  assert.strictEqual(out.record.exact, jerry);
  out = send({ conversationId: 'price', messageType: 'comment', body: 'The fee is $7.000 this week.', clientText: 'what is the price?' });
  assert.strictEqual(out.record.exact, 'The fee is $7.000 this week.');
  out = send({ conversationId: 'hand', messageType: 'comment', body: "I've forwarded this to a teammate who can help.", clientText: 'please help' });
  assert.strictEqual(out.decision.decision, 'allow');
  const raw = fs.readFileSync(path.join(root, 'luna-current/01_runtime/fundedelite-faqs.md'), 'utf8');
  const paras = raw.split(/\n\n+/).map((s) => s.trim()).filter((s) => s.length >= 40 && s.length <= 4000 && s.indexOf('URL:') !== 0 && s.indexOf('Index:') !== 0 && s.indexOf('#') !== 0);
  assert.ok(paras.length >= 200);
  let blocked = 0;
  for (let i = 0; i < paras.length; i++) {
    g.resetStore();
    const decision = g.authorizeOutbound({ conversationId: 'faq' + i, messageType: 'comment', body: paras[i], clientText: 'can you explain this?' });
    if (decision.decision !== 'allow' || decision.body !== paras[i]) blocked += 1;
  }
  assert.ok(blocked / paras.length <= 0.01, blocked + '/' + paras.length);
});

test('internal notes use the redacted note and a later clean send still works', function () {
  g.rememberInbound('note', { text: 'password is sunshine' });
  let out = send({ conversationId: 'note', messageType: 'note', channel: 'internal', body: 'password sunshine', clientText: 'ok' });
  assert.strictEqual(out.record.exact, g.REDACTED_NOTE);
  out = send({ conversationId: 'note', messageType: 'comment', body: 'Our team is reviewing this.', clientText: 'ok' });
  assert.strictEqual(out.record.exact, 'Our team is reviewing this.');
});

test('an unpermitted write throws and records nothing', function () {
  const rec = g.createRecordingTransport();
  const transport = g.createGuardedTransport(function () { return { status: 200 }; });
  assert.throws(function () { transport({ method: 'post', data: { body: 'secret' } }); }, function (err) { return err.code === 'UNAUTHORIZED_WRITE'; });
  assert.strictEqual(rec.records.length, 0);
});

test('runtime tripwire throws on a non-guarded http request', function () {
  g.installRequireTripwire();
  const http = require('http');
  assert.throws(function () { http.request({ host: '127.0.0.1', port: 9 }); }, function (err) { return err.code === 'UNGUARDED_HTTP'; });
  assert.throws(function () { http.get('http://127.0.0.1:9/'); }, function (err) { return err.code === 'UNGUARDED_HTTP'; });
});

test('static scan, protected files, and the unapplied diff', function () {
  const bad = g.scanTransportBypasses([{ name: 'control.js', source: "const axios = require('axios');\naxios({ method: 'post' });\nhttp.request();\n" }]);
  assert.ok(bad.length >= 2);
  const good = g.scanTransportBypasses([{
    name: 'index.js',
    source: 'authorizeOutbound(op);\ndispatchAuthorized(decision, function () {\n  return openai.chat.completions.create(decision.payload);\n});\n',
  }]);
  assert.strictEqual(good.length, 0);
  const src = fs.readFileSync(path.join(__dirname, 'credentialGuardR13.js'), 'utf8');
  assert.ok(!src.includes('process.env'));
  assert.ok(!src.includes('api.intercom.io'));
  assert.strictEqual(g.STATUS.approved, false);
  assert.strictEqual(g.STATUS.release, false);
  assert.strictEqual(g.STATUS.wired, false);
  assert.strictEqual(g.STATUS.candidate, 'credential-guard-r13');
  const prompt = path.join(root, 'luna-current/01_runtime/system-prompt.txt');
  const faqA = path.join(root, 'luna-current/01_runtime/fundedelite-faqs.md');
  const faqB = path.join(root, 'luna-current/04_docs/fundedelite-faqs.md');
  assert.strictEqual(sha(prompt), g.AUTHORIZED_PROMPT_DISCLOSURE.sha256);
  assert.strictEqual(fs.readFileSync(prompt, 'utf8').length, g.AUTHORIZED_PROMPT_DISCLOSURE.length);
  assert.strictEqual(sha(faqA), '8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92');
  assert.strictEqual(sha(faqB), sha(faqA));
  const live = fs.readFileSync(path.join(root, 'luna-current/01_runtime/index.js'), 'utf8');
  assert.ok(!live.includes('credentialGuardR13'));
  const diffPath = path.join(__dirname, 'proposed-integration.diff');
  const diff = fs.readFileSync(diffPath, 'utf8');
  assert.ok(diff.includes('installRequireTripwire'));
  assert.ok(diff.includes('exportTaint'));
  assert.ok(diff.includes('importConversationTaint'));
  assert.ok(diff.includes('credentialTaint'));
  assert.ok(diff.includes('control.js'));
  assert.ok(diff.includes('guardedSend'));
  const marker = '+++ b/luna-current/01_runtime/credentialGuardR13.js\n';
  const start = diff.indexOf(marker);
  const next = diff.indexOf('\ndiff --git ', start);
  const section = diff.slice(start + marker.length, next);
  const extracted = section.split('\n').filter(function (line) { return line.startsWith('+') && !line.startsWith('+++'); }).map(function (line) { return line.slice(1); }).join('\n') + '\n';
  assert.strictEqual(extracted, src);
  execSync('patch --dry-run -p1 < ' + JSON.stringify(diffPath), { cwd: root, stdio: 'pipe' });
});

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('all passed');
