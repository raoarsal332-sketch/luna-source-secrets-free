'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('./env');
const { test, run } = require('./runner');
const { h, T, fake, lm, sc, reset, newConv, index } = E;

const S = 'ZQSENTINELCUSTOMERTEXTQZ';
const TAGS = ['IC_REQ_FAIL', 'PROBLEM_SUMMARY_REPAIRED', 'PROBLEM_SUMMARY_POLISHED', 'PROBLEM_PRE_REPAIR', 'ESCALATE_HANDOFF_SOFTENED', 'POSTGATE_FAIL_DETAIL', 'OWNER_CMD_LLM_RAW', 'SKIP model', 'PARTIAL_ANSWER_UNITS'];
const leaks = () => h.logs.map((l) => l.line).filter((l) => l.includes(S));
const res = { sendStatus() { return this; }, status() { return this; }, json() { return this; }, send() { return this; } };

test('F4 IC_REQ_FAIL: a rejected write that echoes customer text logs codes and length only', async () => {
  reset();
  const { id } = newConv();
  fake.setResponder((rec) => (rec.method === 'post' ? { status: 400, data: { type: 'error.list', errors: [{ code: 'parameter_invalid', message: 'bad body ' + S }] } } : null));
  // t745: this sentence is unprotected, so it reaches axios. The rejection log
  // is codes and length. The sentinel stays out of every log line.
  await index.postReply(id, 'comment', 'The daily loss limit is 5%. ' + S);
  const lines = h.logs.map((l) => l.line).filter((l) => l.startsWith('IC_REQ_FAIL'));
  assert.strictEqual(lines.length, 1, h.logs.slice(-8).map((l) => l.line).join('|'));
  assert.ok(!lines[0].includes(S), lines[0]);
  assert.ok(/codes=parameter_invalid/.test(lines[0]) && /\[redacted len=\d+\]/.test(lines[0]), lines[0]);
  assert.deepStrictEqual(leaks(), []);
  if (E.which !== 'candidate') return;
  // Protected spread prose is denied before axios. The deny line has no sentinel.
  h.logs.length = 0;
  await index.postReply(id, 'comment', 'The spreads on the MetaTrader 5 server are the thing to inspect. ' + S);
  const deny = h.logs.map((l) => l.line).filter((l) => l.includes('PUBLIC_WRITE'));
  assert.ok(deny.length >= 1, 'deny line not reached');
  assert.ok(deny.every((l) => !l.includes(S) && /NOT_APPROVED_OUTPUT/.test(l)), deny.join('|'));
  assert.deepStrictEqual(leaks(), []);
});
test('F4 OWNER_CMD_LLM_RAW: raw model output is not logged, only its length', async () => {
  reset();
  const { id } = newConv('Please help');
  fake.getConversation(id).conversation_parts.conversation_parts.push(sc.notePart('@Arsal please tell the client about it', sc.AUTH_ADMIN));
  lm.state.queue.push('ACTION: NOTE\nBODY: ' + S);
  await T.processAuthorizedNoteCommands(id, fake.getConversation(id));
  const lines = h.logs.map((l) => l.line).filter((l) => l.startsWith('OWNER_CMD_LLM_RAW'));
  assert.strictEqual(lines.length, 1);
  assert.ok(!lines[0].includes(S) && /\[redacted len=\d+\]/.test(lines[0]), lines[0]);
});
test('F4 SKIP model: a model SKIP body is not logged', async () => {
  reset();
  const { id, user } = newConv('Do you offer a student discount for the challenge?');
  lm.state.queue.push('ACTION: SKIP\nBODY: ' + S);
  const req = { body: { topic: 'conversation.user.replied', data: { item: { id, type: 'conversation', conversation_parts: { conversation_parts: [user] }, source: fake.getConversation(id).source } } }, headers: {} };
  await index.handleWebhook(req, res);
  const skip = h.logs.map((l) => l.line).filter((l) => l.startsWith('SKIP model') || l.startsWith('SKIP empty reply body') || l.startsWith('TOOL_BUDGET_EMPTY_FALLBACK') || l.includes('PUBLIC_WRITE'));
  assert.ok(skip.length >= 1, 'no skip or deny line on this route: ' + h.logs.slice(-8).map((l) => l.line).join('|'));
  assert.ok(h.logs.every((l) => !l.line.includes(S)), 'sentinel in ' + leaks().join('|'));
});
test('F4 none of the nine redacted tags carries the sentinel on any exercised route', () => {
  const bad = leaks().filter((l) => TAGS.some((t) => l.startsWith(t)));
  assert.deepStrictEqual(bad, []);
});
test('F4 static: the nine historical sites no longer interpolate raw text (diff against base)', () => {
  const read = (p) => fs.readFileSync(p, 'utf8').split('\n');
  const cand = read(path.join(E.root, 'candidate', 'index.js')).join('\n');
  const base = read(path.join(E.root, 'base', 'index.js')).join('\n');
  const find = (src, tag) => src.split('\n').filter((l) => l.includes("'" + tag + "'") && /console\.(log|error)/.test(l));
  for (const tag of TAGS) {
    const b = find(base, tag), c = find(cand, tag);
    assert.ok(b.length >= 1 && c.length >= 1, tag);
    assert.ok(c.every((l) => /logLen\(/.test(l)), 'candidate line does not use logLen: ' + tag);
    assert.ok(b.every((l) => !/logLen\(/.test(l)), 'baseline unexpectedly redacted: ' + tag);
  }
});
test('F4 residual: log lines (all routes in this process) that still contain the customer sentinel are listed for the report', () => {
  const rest = leaks();
  process.stdout.write('RESIDUAL_LOG_LINES ' + rest.length + '\n' + rest.slice(0, 20).map((l) => '  ' + l.slice(0, 120)).join('\n') + '\n');
});
run('log redaction (' + E.which + ')');
