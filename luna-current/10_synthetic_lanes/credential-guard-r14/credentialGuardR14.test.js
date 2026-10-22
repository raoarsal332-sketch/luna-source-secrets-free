'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const cp = require('child_process');
const g = require('./credentialGuardR14');

const execFileSync = cp.execFileSync;
const captured = {
  httpRequest: http.request,
  httpGet: http.get,
  httpsRequest: https.request,
  netConnect: net.connect,
  tlsConnect: tls.connect,
  spawn: cp.spawn,
  exec: cp.exec,
  execFile: cp.execFile,
  fork: cp.fork,
  spawnSync: cp.spawnSync,
  execSync: cp.execSync,
  execFileSync: cp.execFileSync,
  fetch: global.fetch,
};

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

function posted(out) {
  return out.record ? out.record.exact : '';
}

test('exact credential tokens are blocked and dictionary substrings are not', function () {
  g.rememberInbound('a', { text: 'password is sunshine' });
  let out = send({ conversationId: 'a', messageType: 'comment', body: 'use sunshine', clientText: 'thanks' });
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);
  assert.ok(!posted(out).includes('sunshine'));
  out = send({ conversationId: 'a', messageType: 'comment', body: 'the shine is bright', clientText: 'ok' });
  assert.strictEqual(out.decision.decision, 'allow');
  assert.strictEqual(posted(out), 'the shine is bright');
  out = send({ conversationId: 'a', messageType: 'comment', body: 'the machine works fine today', clientText: 'ok' });
  assert.strictEqual(posted(out), 'the machine works fine today');

  const messages = [
    { role: 'user', content: 'the shine is not the machine' },
    { role: 'tool', content: 'sunshine', tool_calls: [{ function: { arguments: '{"q":"sunshine"}' } }] },
  ];
  const guarded = g.guardModelMessages('a', messages);
  const blob = JSON.stringify(guarded);
  assert.ok(blob.includes('shine'));
  assert.ok(blob.includes('machine'));
  assert.ok(!blob.includes('sunshine'));

  g.resetStore();
  g.rememberInbound('word', { text: 'the sunshine was nice today' });
  out = send({ conversationId: 'word', messageType: 'comment', body: 'sunshine', clientText: 'ok' });
  assert.strictEqual(out.decision.decision, 'allow');
  assert.strictEqual(posted(out), 'sunshine');

  g.resetStore();
  g.rememberInbound('exact', { text: 'password is shine' });
  out = send({ conversationId: 'exact', messageType: 'comment', body: 'shine', clientText: 'ok' });
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);
  out = send({ conversationId: 'exact', messageType: 'comment', body: 'sunshine', clientText: 'ok' });
  assert.strictEqual(out.decision.decision, 'allow');
  assert.strictEqual(posted(out), 'sunshine');

  g.resetStore();
  g.rememberInbound('sp', { text: 'password is sun' });
  g.rememberInbound('sp', { text: 'password is shine' });
  out = send({ conversationId: 'sp', messageType: 'comment', body: 'try sunshine please', clientText: 'hello' });
  assert.strictEqual(out.decision.decision, 'allow');
  out = send({ conversationId: 'sp', messageType: 'comment', body: 'shine', clientText: 'hello' });
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);
});

test('provenance taint blocks letters, pins, dashes, homoglyphs, math, and deep base64', function () {
  g.rememberInbound('b', { text: 'otp is 482913' });
  let out = send({ conversationId: 'b', messageType: 'comment', body: 'code 482913', clientText: 'ok' });
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);

  g.resetStore();
  g.rememberInbound('c', { text: 'otp = 12-34-56' });
  out = send({ conversationId: 'c', messageType: 'comment', body: 'enter 123456 now', clientText: 'ok' });
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);

  g.resetStore();
  g.rememberInbound('d', { text: 'password is Hunt9' });
  out = send({ conversationId: 'd', messageType: 'comment', body: 'see Hunt99', clientText: 'ok' });
  assert.strictEqual(out.decision.decision, 'allow');
  assert.strictEqual(posted(out), 'see Hunt99');

  g.resetStore();
  g.rememberInbound('e', { text: 'p' + '\u0430' + 'ssword is sunshine' });
  out = send({ conversationId: 'e', messageType: 'comment', body: 'sunshine', clientText: 'ok' });
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);

  const math = String.fromCodePoint(0x1D400) + String.fromCodePoint(0x1D41A) + String.fromCodePoint(0x1D7CE);
  g.resetStore();
  g.rememberInbound('f', { text: 'password is ' + math });
  out = send({ conversationId: 'f', messageType: 'comment', body: math, clientText: 'ok' });
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);

  let deep = 'sunshine';
  for (let i = 0; i < 3; i++) deep = Buffer.from(deep, 'utf8').toString('base64');
  g.resetStore();
  g.rememberInbound('g', { text: 'password is ' + deep });
  out = send({ conversationId: 'g', messageType: 'comment', body: 'see sunshine', clientText: 'ok' });
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);
  assert.ok(!JSON.stringify(g.exportTaint()).includes('sunshine'));
});

test('other mt5 numbers beside a credential cue are tainted and a bare account number is not', function () {
  g.rememberInbound('mt', { text: 'password is sunshine and mt5 is 219876' });
  let out = send({ conversationId: 'mt', messageType: 'comment', body: 'account 219876 is ready', clientText: 'ok' });
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);
  out = send({ conversationId: 'bare', messageType: 'comment', body: 'Your account number is 219876', clientText: 'what is my account' });
  assert.strictEqual(out.decision.decision, 'allow');
  out = send({ conversationId: 'ctx', messageType: 'comment', body: 'password for 219876', clientText: 'ok' });
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);
});

test('F003 exception, oversize, timeout, and bounds send only the fixed sentence', function () {
  const otp = '482913'.repeat(4000);
  assert.strictEqual(otp.length, 24000);
  let reads = 0;
  let out = send({
    conversationId: 'f003',
    messageType: 'comment',
    channel: 'public',
    get body() { reads += 1; throw new Error('scan ' + otp); },
    data: { body: otp, message_type: 'comment' },
  });
  assert.strictEqual(out.decision.reason, 'exception');
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);
  assert.ok(out.record.bytes.equals(Buffer.from(g.FIXED_MESSAGE, 'utf8')));
  assert.ok(!posted(out).includes('482913'));
  assert.ok(!JSON.stringify(out.record.data).includes('482913'));

  out = send({ conversationId: 'f003b', messageType: 'comment', body: otp });
  assert.strictEqual(out.decision.reason, 'oversize');
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);
  assert.ok(!posted(out).includes('482913'));

  out = send({ conversationId: 'f003c', messageType: 'comment', body: '<'.repeat(40) + '482913' });
  assert.strictEqual(out.decision.reason, 'exception');
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);
  assert.ok(!posted(out).includes('482913'));

  const started = Date.now();
  out = send({ conversationId: 'bounds', messageType: 'comment', body: '<'.repeat(100000) });
  assert.ok(Date.now() - started < 200);
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);
  assert.ok(!posted(out).includes('<'));

  reads = 0;
  const raw = 'timeout body sunshine ' + 'x'.repeat(400);
  out = send({
    conversationId: 'timeout',
    messageType: 'comment',
    channel: 'public',
    budgetMs: 0,
    get body() { reads += 1; return raw; },
    data: { body: raw, message_type: 'comment' },
  });
  assert.strictEqual(reads, 0);
  assert.strictEqual(out.decision.reason, 'timeout');
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);
  assert.ok(!posted(out).includes('sunshine'));
  assert.ok(!JSON.stringify(out.record).includes('sunshine'));
});

test('taint survives a fresh store when state hashes are imported', function () {
  g.rememberInbound('persist', { text: 'password is orange' });
  const blob = g.exportTaint();
  assert.ok(!JSON.stringify(blob).includes('orange'));
  g.resetStore();
  g.importConversationTaint('persist', blob.conversations.persist);
  g.rememberInbound('persist', { text: 'hello, I need a payout update' });
  const out = send({ conversationId: 'persist', messageType: 'comment', body: 'use orange please', clientText: 'hello, I need a payout update' });
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);
  g.importTaint(blob);
  const again = send({ conversationId: 'persist', messageType: 'comment', body: 'use orange please', clientText: 'new inbound only' });
  assert.strictEqual(posted(again), g.FIXED_MESSAGE);
});

test('owner REPLY and NOTE are checked in every language and inbound is remembered first', function () {
  let out = send({
    conversationId: 'same',
    messageType: 'comment',
    channel: 'public',
    inboundText: 'password is violet',
    body: 'your violet code',
    clientText: 'hi',
  });
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);
  assert.ok(!posted(out).includes('violet'));

  g.resetStore();
  g.rememberInbound('own', { text: 'my password is sunshine' });
  out = send({
    conversationId: 'own',
    messageType: 'comment',
    channel: 'public',
    body: 'ACTION: REPLY\nBODY: Here is sunshine for you',
    ownerText: 'REPLY: tell them the password is sunshine',
    ownerDictated: true,
    clientText: 'hi',
  });
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);

  g.resetStore();
  g.rememberInbound('ur', { text: 'password is Nk4violet' });
  out = send({
    conversationId: 'ur',
    messageType: 'comment',
    channel: 'public',
    ownerText: 'REPLY: پاسورڈ Nk4violet بھیج دو',
    body: 'پاسورڈ Nk4violet بھیج دو',
    clientText: 'hi',
  });
  assert.strictEqual(posted(out), g.FIXED_MESSAGE);
  assert.ok(!posted(out).includes('Nk4violet'));

  g.resetStore();
  g.rememberInbound('ar', { text: 'password is Nk4violet' });
  out = send({
    conversationId: 'ar',
    messageType: 'note',
    channel: 'internal',
    ownerText: 'NOTE: أرسل Nk4violet للعميل',
    body: 'أرسل Nk4violet للعميل',
    clientText: 'hi',
  });
  assert.strictEqual(posted(out), g.REDACTED_NOTE);
  assert.ok(!posted(out).includes('Nk4violet'));
});

test('structural control paths allow clean metadata and deny a tainted token', function () {
  g.rememberInbound('meta', { text: 'password is sunshine' });
  const clean = [
    { messageType: 'close', data: { message_type: 'close', admin_id: 10118526 } },
    { messageType: 'snoozed', data: { message_type: 'snoozed', snoozed_until: 1700000000 } },
    { messageType: 'open', data: { message_type: 'open', admin_id: 10118526 } },
    { messageType: 'assignment', data: { message_type: 'assignment', assignee_id: 8053416 } },
  ];
  for (let i = 0; i < clean.length; i++) {
    const out = send(Object.assign({ conversationId: 'meta', body: '', channel: 'public', clientText: 'ok' }, clean[i]));
    assert.strictEqual(out.decision.decision, 'allow', clean[i].messageType);
    assert.ok(out.decision.reason.indexOf('structural_') === 0, out.decision.reason);
    assert.ok(!posted(out).includes('sunshine'));
  }
  const dirty = send({
    conversationId: 'meta',
    messageType: 'snoozed',
    channel: 'public',
    body: '',
    data: { message_type: 'snoozed', snoozed_until: 1, note: 'sunshine' },
    clientText: 'ok',
  });
  assert.strictEqual(posted(dirty), g.FIXED_MESSAGE);
  assert.ok(!posted(dirty).includes('sunshine'));
  const passthrough = send({
    conversationId: 'meta',
    kind: 'intercom-write',
    method: 'post',
    messageType: 'comment',
    channel: 'public',
    ownerDictated: true,
    inboundText: 'password is sunshine',
    ownerText: 'REPLY: sunshine',
    body: 'sunshine',
    data: { message_type: 'comment', body: 'sunshine', client_text: 'password is sunshine' },
    clientText: 'ok',
  });
  assert.strictEqual(posted(passthrough), g.FIXED_MESSAGE);
  assert.ok(!JSON.stringify(passthrough.record).includes('sunshine'));
});

test('eligible asks emit the exact template and ineligible asks including not-for-spreads do not', function () {
  const asks = [
    'How should I check your spreads?',
    'I want to check the spreads',
    'I want the demo account to check spreads',
    'سپریڈ چیک کرنے کا طریقہ بتائیں',
    'مجھے سپریڈ ٹیسٹ اکاؤنٹ بھیجیں',
    'स्प्रेड चेक करने का तरीका बताएं',
    'spread test account dena',
    'give me the test account',
    'give me the<br>test account',
    'give<br>me the test account',
    'give me the test account<br>',
    'give me the &lt;br&gt; test account',
    'how do I check spreads',
    'how do I check<br>spreads',
  ];
  const messy = 'Hello Sam\n\n' + g.SPREAD_TEST_REPLY.replace(/\n\n/g, '<br><br>\n\n');
  for (let i = 0; i < asks.length; i++) {
    assert.strictEqual(g.isAuthorizedTemplateTopic(asks[i]), true, asks[i]);
    const body = i % 2 === 0 ? messy : g.SPREAD_TEST_REPLY + '\n\n';
    const out = send({ conversationId: 'el' + i, messageType: 'comment', body: body, clientText: asks[i] });
    assert.strictEqual(out.decision.reason, 'spread_template', asks[i]);
    assert.strictEqual(posted(out), g.SPREAD_TEST_REPLY, asks[i]);
    assert.strictEqual(posted(out).length, 213);
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
    'I want the test account but not for spreads',
  ];
  let unauthorized = 0;
  const reasons = [];
  for (let i = 0; i < missed.length; i++) {
    g.resetStore();
    assert.strictEqual(g.isAuthorizedTemplateTopic(missed[i]), false, missed[i]);
    const out = send({ conversationId: 'bad' + i, messageType: 'comment', body: messy, clientText: missed[i] });
    g.borderlineAsks().forEach(function (item) { reasons.push(item.reason); });
    if (posted(out) === g.SPREAD_TEST_REPLY || posted(out).includes(g.TEMPLATE_PASSWORD)) unauthorized += 1;
    assert.strictEqual(posted(out), g.FIXED_MESSAGE, missed[i]);
    assert.ok(!posted(out).includes(g.TEMPLATE_PASSWORD));
  }
  assert.strictEqual(unauthorized, 0);
  assert.ok(reasons.indexOf('no_request_shape') >= 0);
  assert.ok(reasons.indexOf('definition') >= 0);
  assert.ok(reasons.indexOf('self_report') >= 0);
  assert.ok(reasons.indexOf('negation') >= 0);
  assert.ok(reasons.indexOf('payout') >= 0);
  assert.ok(reasons.indexOf('spreadsheet') >= 0);
  assert.ok(reasons.indexOf('not_for_spreads') >= 0);
});

test('ordinary FAQ answers, prices, and the Jerry href pass', function () {
  const jerry = '<a class="entity_mention intercom-content-link" href="//app.intercom.com/apps/h2z8cgfr/admin/8053416" rel="nofollow noopener noreferrer" target="_blank">Jerry - Manager</a>';
  let out = send({ conversationId: 'jerry', messageType: 'note', channel: 'internal', body: jerry, clientText: 'hello' });
  assert.strictEqual(out.decision.decision, 'allow');
  assert.strictEqual(posted(out), jerry);
  out = send({ conversationId: 'price', messageType: 'comment', body: 'The fee is $7.000 this week.', clientText: 'what is the price?' });
  assert.strictEqual(posted(out), 'The fee is $7.000 this week.');
  out = send({ conversationId: 'hand', messageType: 'comment', body: "I've forwarded this to a teammate who can help.", clientText: 'please help' });
  assert.strictEqual(out.decision.decision, 'allow');
  const raw = fs.readFileSync(path.join(root, 'luna-current/01_runtime/fundedelite-faqs.md'), 'utf8');
  const paras = raw.split(/\n\n+/).map(function (s) { return s.trim(); }).filter(function (s) {
    return s.length >= 40 && s.length <= 4000 && s.indexOf('URL:') !== 0 && s.indexOf('Index:') !== 0 && s.indexOf('#') !== 0;
  });
  assert.ok(paras.length >= 200, String(paras.length));
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
  assert.strictEqual(posted(out), g.REDACTED_NOTE);
  out = send({ conversationId: 'note', messageType: 'comment', body: 'Our team is reviewing this.', clientText: 'ok' });
  assert.strictEqual(posted(out), 'Our team is reviewing this.');
});

test('an unpermitted write throws and records nothing', function () {
  const transport = g.createGuardedTransport(function () { return { status: 200 }; });
  assert.throws(function () { transport({ method: 'post', data: { body: 'secret' } }); }, function (err) { return err.code === 'UNAUTHORIZED_WRITE'; });
});

test('the redacting logger drops bodies, error text, and stacks', function () {
  const lines = [];
  const sink = {
    log: function () { lines.push(Array.prototype.join.call(arguments, ' ')); },
    error: function () { lines.push(Array.prototype.join.call(arguments, ' ')); },
  };
  g.installProcessScrub(sink);
  const err = new Error('password is sunshine');
  err.stack = 'Error: password is sunshine\n    at webhook';
  sink.error('WEBHOOK_ERR', err.message, err.stack, err, { body: 'sunshine', text: 'violet code', message: err.message });
  sink.log('inbound', 'the client said sunshine');
  const flat = lines.join('\n');
  assert.ok(flat.indexOf('WEBHOOK_ERR') >= 0);
  assert.ok(flat.indexOf('sunshine') < 0);
  assert.ok(flat.indexOf('violet') < 0);
  assert.ok(flat.indexOf('password is') < 0);
  const orig = console.log;
  let got = '';
  console.log = function () { got += Array.prototype.join.call(arguments, ' '); };
  try {
    g.logEvent('WEBHOOK_ERR');
    g.logEvent('password is sunshine');
  } finally {
    console.log = orig;
  }
  assert.ok(got.indexOf('WEBHOOK_ERR') >= 0);
  assert.ok(got.indexOf('sunshine') < 0);
  assert.ok(got.indexOf('password') < 0);
});

test('static scan, protected files, and the unapplied diff', function () {
  const bad = g.scanTransportBypasses([{ name: 'control.js', source: "const axios = require('axios');\naxios({ method: 'post' });\nhttp.request();\n" }]);
  assert.ok(bad.length >= 2);
  const good = g.scanTransportBypasses([{
    name: 'index.js',
    source: 'authorizeOutbound(op);\ndispatchAuthorized(decision, function () {\n  return openai.chat.completions.create(decision.payload);\n});\n',
  }]);
  assert.strictEqual(good.length, 0);
  const src = fs.readFileSync(path.join(__dirname, 'credentialGuardR14.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, 'credentialGuardR14-preload.js'), 'utf8');
  assert.ok(!src.includes('process.env'));
  assert.ok(!src.includes('api.intercom.io'));
  assert.ok(preload.indexOf('installNetworkSeal') >= 0);
  assert.strictEqual(g.STATUS.approved, false);
  assert.strictEqual(g.STATUS.release, false);
  assert.strictEqual(g.STATUS.wired, false);
  assert.strictEqual(g.STATUS.candidate, 'credential-guard-r14');
  assert.strictEqual(g.SPREAD_TEST_REPLY.length, 213);
  const prompt = path.join(root, 'luna-current/01_runtime/system-prompt.txt');
  const faqA = path.join(root, 'luna-current/01_runtime/fundedelite-faqs.md');
  const faqB = path.join(root, 'luna-current/04_docs/fundedelite-faqs.md');
  assert.strictEqual(sha(prompt), g.AUTHORIZED_PROMPT_DISCLOSURE.sha256);
  assert.strictEqual(fs.readFileSync(prompt, 'utf8').length, g.AUTHORIZED_PROMPT_DISCLOSURE.length);
  const promptText = fs.readFileSync(prompt, 'utf8');
  assert.strictEqual(g.redactSystemContent('prompt', promptText), promptText);
  g.rememberInbound('prompt', { text: 'password is sunshine' });
  const appended = g.redactSystemContent('prompt', promptText + ' sunshine');
  assert.ok(appended.indexOf(promptText) === 0);
  assert.ok(appended.indexOf('[redacted]') >= 0);
  assert.ok(appended.slice(promptText.length).indexOf('sunshine') < 0);
  assert.strictEqual(sha(faqA), '8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92');
  assert.strictEqual(sha(faqB), sha(faqA));
  const live = fs.readFileSync(path.join(root, 'luna-current/01_runtime/index.js'), 'utf8');
  assert.ok(!live.includes('credentialGuardR14'));
  const diffPath = path.join(__dirname, 'proposed-integration.diff');
  const diff = fs.readFileSync(diffPath, 'utf8');
  assert.ok(diff.includes("require('./credentialGuardR14-preload')"));
  assert.ok(diff.includes('rememberInbound'));
  assert.ok(diff.includes('rememberControl'));
  assert.ok(diff.includes("logEvent('WEBHOOK_ERR')"));
  assert.ok(diff.includes('isAuthorizedTemplateTopic'));
  assert.ok(diff.includes('installNetworkSeal'));
  assert.ok(diff.includes('exportTaint'));
  assert.ok(diff.includes('importConversationTaint'));
  function added(rel) {
    const marker = '+++ b/' + rel + '\n';
    const start = diff.indexOf(marker);
    assert.ok(start >= 0, rel);
    const next = diff.indexOf('\ndiff --git ', start);
    const section = diff.slice(start + marker.length, next);
    return section.split('\n').filter(function (line) { return line.startsWith('+') && !line.startsWith('+++'); }).map(function (line) { return line.slice(1); }).join('\n') + '\n';
  }
  assert.strictEqual(added('luna-current/01_runtime/credentialGuardR14.js'), src);
  assert.strictEqual(added('luna-current/01_runtime/credentialGuardR14-preload.js'), preload);
  execFileSync('patch', ['--dry-run', '-p1', '-i', diffPath, '-d', root], { stdio: 'pipe' });
});

function assertCode(name, err) {
  assert.ok(err && err.code === 'UNGUARDED_EGRESS', name + ' ' + (err && err.code));
}

async function main() {
  const required = [
    'http.request', 'node:http.request', 'http.get', 'https.request', 'node:https.request', 'https.get',
    'net.connect', 'node:net.connect', 'net.createConnection', 'tls.connect', 'node:tls.connect', 'fetch',
    'child_process.spawn', 'child_process.exec', 'child_process.execFile', 'child_process.fork',
    'child_process.spawnSync', 'child_process.execSync', 'child_process.execFileSync',
    'process.binding', 'process.binding.spawn_sync', 'process.binding.process_wrap',
    'getBuiltinModule', 'getBuiltinModule.net',
  ];
  try {
    const preload = path.join(__dirname, 'credentialGuardR14-preload.js');
    const script = path.join(__dirname, 'credentialGuardR14.test.js');
    const probeFile = path.join(require('os').tmpdir(), 'cg14-seal-probe.js');
    fs.writeFileSync(probeFile, [
      "'use strict';",
      'const g = require(' + JSON.stringify(path.join(__dirname, 'credentialGuardR14.js')) + ');',
      'const probes = g.egressProbes();',
      'const need = ' + JSON.stringify(required) + ';',
      'const names = probes.map(function (p) { return p.name; });',
      'let bad = [];',
      'for (let i = 0; i < need.length; i++) if (names.indexOf(need[i]) < 0) bad.push("missing " + need[i]);',
      'for (let i = 0; i < probes.length; i++) {',
      '  try { probes[i].run(); bad.push(probes[i].name + ":no-throw"); }',
      '  catch (e) { if (!e || e.code !== "UNGUARDED_EGRESS") bad.push(probes[i].name + ":" + (e && e.code)); }',
      '}',
      'if (bad.length) { console.log(bad.join("\\n")); process.exit(1); }',
      'console.log("probes " + probes.length);',
    ].join('\n'));
    const out = execFileSync(process.execPath, ['--require', preload, probeFile], { encoding: 'utf8', timeout: 8000 });
    assert.ok(out.indexOf('probes ') >= 0, out);
    console.log('ok preload seals every egress probe');
  } catch (err) {
    failed += 1;
    console.error('FAIL preload seals every egress probe');
    console.error(err && err.stderr ? err.stderr.toString() : (err && err.stack ? err.stack : err));
  }

  try {
    g.resetStore();
    const decision = g.authorizeOutbound({ conversationId: 'permit', messageType: 'comment', body: 'hello', clientText: 'hi' });
    assert.strictEqual(decision.send, true);
    g.installNetworkSeal();
    const probes = g.egressProbes();
    const names = probes.map(function (p) { return p.name; });
    for (let i = 0; i < required.length; i++) assert.ok(names.indexOf(required[i]) >= 0, required[i]);
    for (let i = 0; i < probes.length; i++) {
      let err = null;
      try { probes[i].run(); } catch (e) { err = e; }
      assertCode(probes[i].name, err);
    }
    const pre = [
      ['captured http.request', function () { return captured.httpRequest({ hostname: '127.0.0.1', port: 9 }); }],
      ['captured http.get', function () { return captured.httpGet({ hostname: '127.0.0.1', port: 9 }); }],
      ['captured https.request', function () { return captured.httpsRequest({ hostname: '127.0.0.1', port: 9 }); }],
      ['captured net.connect', function () { return captured.netConnect({ host: '127.0.0.1', port: 9 }); }],
      ['captured tls.connect', function () { return captured.tlsConnect({ host: '127.0.0.1', port: 9 }); }],
      ['captured spawn', function () { return captured.spawn('true'); }],
      ['captured exec', function () { return captured.exec('true'); }],
      ['captured execFile', function () { return captured.execFile('true'); }],
      ['captured fork', function () { return captured.fork('true'); }],
      ['captured spawnSync', function () { return captured.spawnSync('true'); }],
      ['captured execSync', function () { return captured.execSync('true'); }],
      ['captured execFileSync', function () { return captured.execFileSync('true'); }],
    ];
    for (let i = 0; i < pre.length; i++) {
      let err = null;
      try { pre[i][1](); } catch (e) { err = e; }
      assertCode(pre[i][0], err);
    }
    g.dispatchAuthorized(decision, function () {
      assert.strictEqual(g.assertEgressPermitted(), true);
    });
    assert.throws(function () { g.assertEgressPermitted(); }, function (err) { return err.code === 'UNGUARDED_EGRESS'; });
    console.log('ok in-process seal blocks every captured bypass');
    const fetchErr = await captured.fetch('http://127.0.0.1:59999/').then(function () { return null; }, function (err) { return err; });
    const fetchCode = fetchErr && (fetchErr.code || (fetchErr.cause && fetchErr.cause.code));
    assert.strictEqual(fetchCode, 'UNGUARDED_EGRESS');
    console.log('ok pre-captured fetch is sealed');
  } catch (err) {
    failed += 1;
    console.error('FAIL in-process network seal');
    console.error(err && err.stack ? err.stack : err);
  }

  if (failed) {
    console.error(failed + ' failed');
    process.exit(1);
  }
  console.log('all passed');
}

main();
