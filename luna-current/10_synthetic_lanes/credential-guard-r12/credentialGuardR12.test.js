'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const guard = require('./credentialGuardR12');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS', name);
}

function mathBold(text) {
  let out = '';
  for (const ch of text) {
    if (ch >= 'a' && ch <= 'z') out += String.fromCodePoint(0x1D41A + (ch.charCodeAt(0) - 97));
    else if (ch >= 'A' && ch <= 'Z') out += String.fromCodePoint(0x1D400 + (ch.charCodeAt(0) - 65));
    else if (ch >= '0' && ch <= '9') out += String.fromCodePoint(0x1D7CE + (ch.charCodeAt(0) - 48));
    else out += ch;
  }
  return out;
}

function send(op) {
  const rec = guard.createRecordingTransport();
  const decision = guard.authorizeOutbound(op);
  if (decision.send) rec.send(decision);
  return { decision: decision, records: rec.records, transport: rec.transport };
}

test('status stays unapproved and unwired', () => {
  assert.strictEqual(guard.STATUS.candidate, 'credential-guard-r12');
  assert.strictEqual(guard.STATUS.frozen, true);
  assert.strictEqual(guard.STATUS.approved, false);
  assert.strictEqual(guard.STATUS.release, false);
  assert.strictEqual(guard.STATUS.wired, false);
});

test('letters-only, numeric, and symbol-separated values are tainted and the transport records the safe bytes', () => {
  guard.resetStore();
  guard.rememberInbound('c1', { text: 'my password is sunshine', role: 'customer' });
  guard.rememberInbound('c1', { text: 'PIN is 482913', role: 'customer' });
  guard.rememberInbound('c1', { ownerText: 'otp = 12-34-56' });
  guard.rememberInbound('c1', { text: 'password is h-u-n-t-9' });
  const letter = send({ kind: 'intercom-write', conversationId: 'c1', messageType: 'comment', channel: 'public', body: 'use sunshine today' });
  assert.strictEqual(letter.decision.body, guard.FIXED_MESSAGE);
  assert.strictEqual(letter.records.length, 1);
  assert.strictEqual(letter.records[0].exact, guard.FIXED_MESSAGE);
  assert.deepStrictEqual(letter.records[0].bytes, Buffer.from(guard.FIXED_MESSAGE, 'utf8'));
  assert.ok(!letter.records[0].exact.includes('sunshine'));
  const pin = send({ kind: 'intercom-write', conversationId: 'c1', messageType: 'comment', channel: 'public', body: 'the code is 482913' });
  assert.strictEqual(pin.records[0].exact, guard.FIXED_MESSAGE);
  const otp = send({ kind: 'intercom-write', conversationId: 'c1', messageType: 'comment', channel: 'public', body: 'enter 123456 now' });
  assert.strictEqual(otp.records[0].exact, guard.FIXED_MESSAGE);
  const symbols = send({ kind: 'intercom-write', conversationId: 'c1', messageType: 'comment', channel: 'public', body: 'value h.u.n.t.9' });
  assert.strictEqual(symbols.records[0].exact, guard.FIXED_MESSAGE);
  const note = send({ kind: 'intercom-write', conversationId: 'c1', messageType: 'note', channel: 'internal', body: 'resend sunshine to the client' });
  assert.strictEqual(note.records[0].exact, guard.REDACTED_NOTE);
  assert.notStrictEqual(note.records[0].exact, guard.FIXED_MESSAGE);
  assert.ok(!note.records[0].exact.includes('sunshine'));
  const longer = send({ kind: 'intercom-write', conversationId: 'c1', messageType: 'comment', channel: 'public', body: 'use Hunt99 today' });
  assert.strictEqual(longer.decision.action, 'allow');
  assert.strictEqual(longer.records[0].exact, 'use Hunt99 today');
});

test('homoglyph labels and math alphanumeric values share one taint hash', () => {
  guard.resetStore();
  guard.rememberInbound('h', { text: 'p\u0430ssword is ' + mathBold('Hunt9') });
  const plain = send({ kind: 'intercom-write', conversationId: 'h', messageType: 'comment', channel: 'public', body: 'Hunter left Hunt9 on the desk' });
  assert.strictEqual(plain.records[0].exact, guard.FIXED_MESSAGE);
  assert.ok(!plain.records[0].exact.includes('Hunt9'));
  const math = send({ kind: 'intercom-write', conversationId: 'h', messageType: 'comment', channel: 'public', body: 'code ' + mathBold('Hunt9') });
  assert.strictEqual(math.records[0].exact, guard.FIXED_MESSAGE);
  const dumped = JSON.stringify(guard.exportTaint());
  assert.ok(!dumped.includes('Hunt9'));
  assert.ok(!dumped.includes('hunt9'));
});

test('deep base64 is tainted at every layer and denied on the way out', () => {
  guard.resetStore();
  let encoded = 'sunshine';
  const layers = [encoded];
  for (let i = 0; i < 3; i++) {
    encoded = Buffer.from(encoded).toString('base64');
    layers.push(encoded);
  }
  guard.rememberInbound('b', { text: 'password is ' + encoded });
  for (const layer of layers) {
    const sent = send({ kind: 'intercom-write', conversationId: 'b', messageType: 'comment', channel: 'public', body: 'see ' + layer });
    assert.strictEqual(sent.records[0].exact, guard.FIXED_MESSAGE, layer);
    assert.ok(!sent.records[0].exact.includes(layer));
  }
});

test('taint persists across turns and across a restart', () => {
  guard.resetStore();
  guard.rememberInbound('p', { text: 'password is orange' });
  const later = send({ kind: 'intercom-write', conversationId: 'p', messageType: 'comment', channel: 'public', body: 'Your orange is ready.' });
  assert.strictEqual(later.records[0].exact, guard.FIXED_MESSAGE);
  const saved = guard.exportTaint();
  assert.ok(!JSON.stringify(saved).includes('orange'));
  guard.resetStore();
  const forgotten = send({ kind: 'intercom-write', conversationId: 'p', messageType: 'comment', channel: 'public', body: 'Your orange is ready.' });
  assert.strictEqual(forgotten.records[0].exact, 'Your orange is ready.');
  guard.importTaint(saved);
  const restored = send({ kind: 'intercom-write', conversationId: 'p', messageType: 'comment', channel: 'public', body: 'Your orange is ready.' });
  assert.strictEqual(restored.records[0].exact, guard.FIXED_MESSAGE);
});

test('a denied write retries as the safe payload and never the raw secret', () => {
  guard.resetStore();
  guard.rememberInbound('r', { text: 'password is sunshine' });
  const first = send({ kind: 'intercom-write', conversationId: 'r', messageType: 'comment', channel: 'public', body: 'sunshine' });
  const second = send({ kind: 'intercom-write', conversationId: 'r', messageType: 'comment', channel: 'public', body: 'sunshine' });
  assert.strictEqual(first.records[0].exact, guard.FIXED_MESSAGE);
  assert.strictEqual(second.records[0].exact, guard.FIXED_MESSAGE);
  assert.deepStrictEqual(first.records[0].bytes, second.records[0].bytes);
});

test('hex is removed from the model request, memory, and lastEscalateProblem', () => {
  guard.resetStore();
  guard.rememberInbound('m', { text: 'password is sunshine', toolOutput: 'tool says sunshine', attachments: ['file password is sunshine'] });
  const hex = Buffer.from('sunshine').toString('hex');
  const decision = guard.authorizeOutbound({
    kind: 'model-request',
    conversationId: 'm',
    messages: [
      { role: 'system', content: 'You are Luna.' },
      { role: 'user', content: 'see ' + hex },
      { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'search_knowledge', arguments: '{"q":"sunshine"}' } }] },
      { role: 'tool', tool_call_id: '1', content: 'tool output ' + hex },
    ],
    payload: { model: 'test' },
  });
  const rec = guard.createRecordingTransport();
  const payload = decision.payload;
  rec.send({ send: true, ticket: decision.ticket, payload: { data: { body: JSON.stringify(payload.messages) } } });
  const wire = rec.records[0].exact;
  assert.ok(!wire.includes(hex));
  assert.ok(!wire.includes('sunshine'));
  assert.ok(wire.includes('[redacted]'));
  const memory = guard.redactForConversation('m', 'noteInbound ' + hex + ' sunshine');
  assert.ok(!memory.includes(hex));
  assert.ok(!memory.includes('sunshine'));
  const problem = guard.scrubEscalateProblem('m', 'client password sunshine and ' + hex);
  assert.ok(!problem.includes('sunshine'));
  assert.ok(!problem.includes(hex));
  const logged = guard.scrubLogArgs(['maintainer stdout sunshine', { lastEscalateProblem: 'sunshine' }]);
  assert.ok(!JSON.stringify(logged).includes('sunshine'));
});

test('the canonical 55188 template survives blank lines and br tags only when the ask is eligible', () => {
  guard.resetStore();
  const html = guard.SPREAD_TEST_REPLY.replace(/\n\n/g, '<br><br>\n\n');
  assert.notStrictEqual(html, guard.SPREAD_TEST_REPLY);
  assert.strictEqual(guard.isDeliverableSpreadTemplate(html), true);
  const allowed = send({
    kind: 'intercom-write',
    conversationId: 's',
    messageType: 'comment',
    channel: 'public',
    body: html,
    clientTexts: ['please send me the spread-test account'],
  });
  assert.strictEqual(allowed.decision.action, 'allow');
  assert.strictEqual(allowed.records[0].exact, html);
  assert.strictEqual(allowed.records[0].exact.includes(guard.TEMPLATE_PASSWORD), true);
  const ineligible = send({
    kind: 'intercom-write',
    conversationId: 's2',
    messageType: 'comment',
    channel: 'public',
    body: html,
    clientTexts: ['what are your spreads'],
  });
  assert.strictEqual(ineligible.records[0].exact, guard.FIXED_MESSAGE);
  assert.ok(!ineligible.records[0].exact.includes(guard.TEMPLATE_PASSWORD));
  const greeted = 'Hello Sam,\n\n' + guard.SPREAD_TEST_REPLY;
  assert.strictEqual(guard.isDeliverableSpreadTemplate(greeted), true);
});

test('eligibility stays on the t691 boundary and borderline asks are recorded', () => {
  guard.resetStore();
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
  const reasons = guard.borderlineAsks().map((item) => item.reason);
  assert.ok(reasons.includes('no_request_shape'));
  assert.ok(reasons.includes('definition'));
  assert.ok(reasons.includes('self_report'));
  assert.ok(reasons.includes('negation'));
  assert.ok(reasons.includes('payout'));
});

test('Jerry mention hrefs, payout replies, handoff replies, and FAQ sections are not over-blocked', () => {
  guard.resetStore();
  const jerry = '<a class="entity_mention intercom-content-link" href="//app.intercom.com/apps/h2z8cgfr/admin/8053416" rel="nofollow noopener noreferrer" target="_blank">Jerry - Manager</a> please mention jerry & assign ticket to him';
  const note = send({ kind: 'intercom-write', conversationId: 'j', messageType: 'note', channel: 'internal', body: jerry });
  assert.strictEqual(note.decision.action, 'allow');
  assert.strictEqual(note.records[0].exact, jerry);
  assert.ok(note.records[0].exact.includes('h2z8cgfr'));
  const samples = [
    'Your payout is in review. Once the team finishes the check, you will see the result in the dashboard.',
    "I've forwarded this to a teammate who can take a closer look. They have the chat context.",
    'password reset instructions are on the site',
    'Your account number is 219876',
    'Our team is reviewing this.',
    'Prices start at $7.000 on https://faq.fundedelite.com/en/articles/12675091-how-can-i-pay-for-the-challenge',
  ];
  for (const body of samples) {
    guard.resetStore();
    const sent = send({ kind: 'intercom-write', conversationId: 'faq', messageType: 'comment', channel: 'public', body: body });
    assert.strictEqual(sent.decision.action, 'allow', body);
    assert.strictEqual(sent.records[0].exact, body);
  }
  const faq = fs.readFileSync(path.join(__dirname, '../../01_runtime/fundedelite-faqs.md'), 'utf8');
  const parts = faq.split('\n---\n');
  let blocked = 0;
  let checked = 0;
  const blockedSample = [];
  for (const part of parts) {
    const body = part.split('\n').filter((line) => line.indexOf('URL:') !== 0 && line.indexOf('Index:') !== 0 && line.indexOf('#') !== 0).join('\n').trim();
    if (body.length < 40 || body.length > 30000) continue;
    checked += 1;
    guard.resetStore();
    const decision = guard.authorizeOutbound({ kind: 'intercom-write', messageType: 'comment', channel: 'public', body: body });
    if (decision.action !== 'allow' || decision.body !== body) {
      blocked += 1;
      if (blockedSample.length < 3) blockedSample.push(body.slice(0, 180));
    }
  }
  assert.ok(checked > 100);
  assert.strictEqual(blocked, 0, blockedSample.join('\n---\n'));
});

test('secondary entropy still stops an unlabeled high-entropy token', () => {
  guard.resetStore();
  const sent = send({ kind: 'intercom-write', conversationId: 'e', messageType: 'comment', channel: 'public', body: 'api_key sk-abcdefghijklmnop' });
  assert.strictEqual(sent.records[0].exact, guard.FIXED_MESSAGE);
  assert.ok(!sent.records[0].exact.includes('abcdefghijklmnop'));
});

test('the runtime wrapper rejects an unauthorized write and a bounds failure sends the fixed message', () => {
  guard.resetStore();
  const rec = guard.createRecordingTransport();
  assert.throws(() => rec.transport({ method: 'post', url: 'conversations/x/reply', data: { body: 'raw secret sunshine' } }), (err) => err.code === 'UNAUTHORIZED_WRITE');
  assert.strictEqual(rec.records.length, 0);
  rec.transport({ method: 'get', url: 'conversations/x' });
  const started = Date.now();
  const decision = guard.authorizeOutbound({ kind: 'intercom-write', messageType: 'comment', channel: 'public', body: '<'.repeat(100000) });
  assert.ok(Date.now() - started < 200);
  assert.strictEqual(decision.body, guard.FIXED_MESSAGE);
  assert.strictEqual(decision.reason, 'exception');
  rec.send(decision);
  assert.strictEqual(rec.records[rec.records.length - 1].exact, guard.FIXED_MESSAGE);
  assert.ok(rec.records[rec.records.length - 1].exact.length < 200);
  const bad = guard.scanTransportBypasses([{ name: 'bad.js', source: 'axios.post(url, data)' }]);
  assert.ok(bad.some((item) => item.kind === 'axios-write'));
  const model = guard.scanTransportBypasses([{ name: 'bad.js', source: 'openai.chat.completions.create(payload)' }]);
  assert.ok(model.some((item) => item.kind === 'model-bypass'));
});

test('the protected system prompt stays and other secrets cannot ride along', () => {
  const prompt = fs.readFileSync(path.join(__dirname, '../../01_runtime/system-prompt.txt'), 'utf8');
  assert.strictEqual(prompt.length, guard.AUTHORIZED_PROMPT_DISCLOSURE.length);
  assert.strictEqual(guard.payloadHash(prompt), guard.AUTHORIZED_PROMPT_DISCLOSURE.sha256);
  assert.strictEqual(guard.redactSystemContent('sys', prompt), prompt);
  guard.resetStore();
  guard.rememberInbound('sys', { text: 'password is sunshine' });
  const ridden = guard.redactSystemContent('sys', prompt + '\npassword is sunshine');
  assert.ok(ridden.startsWith(prompt));
  assert.ok(ridden.includes(guard.TEMPLATE_PASSWORD));
  assert.ok(!ridden.slice(prompt.length).includes('sunshine'));
});

test('runtime files are not wired and the protected files are unchanged', () => {
  const root = path.join(__dirname, '../../..');
  const prompt = fs.readFileSync(path.join(root, 'luna-current/01_runtime/system-prompt.txt'));
  const faqs = fs.readFileSync(path.join(root, 'luna-current/01_runtime/fundedelite-faqs.md'));
  const faqsDoc = fs.readFileSync(path.join(root, 'luna-current/04_docs/fundedelite-faqs.md'));
  assert.strictEqual(require('crypto').createHash('sha256').update(prompt).digest('hex'), guard.AUTHORIZED_PROMPT_DISCLOSURE.sha256);
  assert.strictEqual(require('crypto').createHash('sha256').update(faqs).digest('hex'), '8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92');
  assert.strictEqual(require('crypto').createHash('sha256').update(faqsDoc).digest('hex'), '8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92');
  const index = fs.readFileSync(path.join(root, 'luna-current/01_runtime/index.js'), 'utf8');
  assert.ok(!index.includes('credentialGuardR12'));
});

test('proposed integration diff stays unapplied and has one transport', () => {
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
    'authorizeOutbound',
    'dispatchAuthorized',
    'createGuardedTransport',
    'startupSelfCheck',
    'lastEscalateProblem',
    'observability',
    'stdout',
    "require('./credentialGuardR12')",
    "'./credentialGuardR12'",
  ];
  for (const marker of required) assert.ok(diff.includes(marker), marker);
  const lane = fs.readFileSync(path.join(__dirname, 'credentialGuardR12.js'), 'utf8');
  const marker = 'diff --git a/luna-current/01_runtime/credentialGuardR12.js b/luna-current/01_runtime/credentialGuardR12.js';
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
  const applied = '/tmp/r12-applied';
  fs.rmSync(applied, { recursive: true, force: true });
  fs.mkdirSync(applied, { recursive: true });
  const names = [
    'luna-current/01_runtime/index.js',
    'luna-current/01_runtime/lunaToolsRuntime.js',
    'luna-current/01_runtime/escalateRelatedOnly.js',
    'luna-current/02_statePresend/statePresend.js',
    'luna-current/03_luna-maintainer/collector.js',
    'luna-current/03_luna-maintainer/llm.js',
    'luna-current/03_luna-maintainer/observability.js',
    'luna-current/06_tools/luna-local-chat.js',
    'luna-export/lunaToolsRuntime.js',
  ];
  for (const name of names) {
    const dest = path.join(applied, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(__dirname, '../../..', name), dest);
  }
  const live = spawnSync('patch', ['-p1', '--forward', '--batch', '--silent'], {
    cwd: applied,
    input: diff,
    encoding: 'utf8',
  });
  assert.strictEqual(live.status, 0, live.stdout + '\n' + live.stderr);
  const scan = guard.startupSelfCheck(names.map((name) => ({
    name: name,
    source: fs.readFileSync(path.join(applied, name), 'utf8'),
  })));
  assert.strictEqual(scan.ok, true, JSON.stringify(scan.findings));
  const liveIndex = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  assert.ok(!liveIndex.includes('credentialGuardR12'));
});

test('module stays synthetic', () => {
  const src = fs.readFileSync(path.join(__dirname, 'credentialGuardR12.js'), 'utf8');
  assert.ok(!src.includes('api.intercom.io'));
  assert.ok(!src.includes('process.env'));
  assert.ok(src.includes('approved: false'));
  assert.ok(src.includes('authorizeOutbound'));
});

console.log('credential-guard-r12', passed, 'passed');
