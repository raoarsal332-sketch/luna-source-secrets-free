'use strict';
/**
 * Shared outbound contract. Constructed turns only. No sealed text.
 */
const assert = require('assert');
const path = require('path');
const E = require('./env');
const { test, run } = require('./runner');
const { h, fake, lm, reset, newConv, index } = E;

if (E.which !== 'candidate') {
  test('contract checks are candidate-only', () => {});
  run('contract (baseline)');
  return;
}

const matcher = require(path.join(E.t.dir, 'approvedMatcher'));
const boundary = require(path.join(E.t.dir, 'publicWriteBoundary'));
const dev = require(path.join(E.root, '..', 'staging-repair-t742', 'packs', 'devset', 'packs-dev-t742.json'));
const FALLBACK = 'Thanks for the details. I am checking this now and will update you here shortly.';
const res = { sendStatus() { return this; }, status() { return this; }, json() { return this; }, send() { return this; } };

function webhookReq(id, user) {
  const conv = fake.getConversation(id);
  return {
    body: {
      topic: 'conversation.user.replied',
      data: { item: { id, type: 'conversation', conversation_parts: conv.conversation_parts, source: conv.source } },
    },
    headers: {},
  };
}

test('approved refusal stays eligible when the module predicate says personal or mixed', async () => {
  const params = matcher.loadParams();
  const rows = boundary.loadIndex().rows;
  const sends = dev.rows.filter((r) => r.claim && r.claim.kind === 'exclusive' && r.flagOn && r.flagOn.result === 'SEND');
  let deny = 0;
  for (const row of sends) {
    if (!matcher.coversAllIntents(row.normalized, row.flagOn.partId, rows, params)) deny += 1;
  }
  assert.strictEqual(deny, 0, 'gold sends still denied by coversAllIntents: ' + deny);
  process.env.LUNA_PACKS_ENABLED = '1';
  const row = sends.find((r) => r.flagOn.partId === 'packs.account-status.refuse.en');
  assert.ok(row, 'no personal refuse gold row');
  reset();
  boundary.bindTurn(null);
  const c = newConv(row.text);
  lm.state.queue.push('ACTION: REPLY\nBODY: A scripted paragraph that must not replace the refusal.');
  await index.handleWebhook(webhookReq(c.id, c.user), res);
  assert.strictEqual(fake.publicWrites().length, 1, 'personal refuse was not delivered');
  assert.strictEqual(lm.state.calls.length, 0);
  delete process.env.LUNA_PACKS_ENABLED;
});

test('flag-off exclusive does not send the canned fallback, including a direct send with no prior bind', async () => {
  delete process.env.LUNA_PACKS_ENABLED;
  delete process.env.LUNA_ATOM_SELECTOR_ENABLED;
  reset();
  boundary.bindTurn(null);
  const c = newConv('How many cards are in one Elite Pack?');
  const posted = await index.postClientCommentOnce(c.id, FALLBACK, c.user, 'Test Client');
  assert.strictEqual(fake.publicWrites().length, 0);
  assert.strictEqual(posted && posted.holdCode, 'NOT_APPROVED_OUTPUT');
  reset();
  boundary.bindTurn(null);
  const wh = newConv('How many cards are in one Elite Pack?');
  lm.state.queue.push('ACTION: REPLY\nBODY: ' + FALLBACK);
  await index.handleWebhook(webhookReq(wh.id, wh.user), res);
  assert.strictEqual(fake.publicWrites().length, 0);
  assert.strictEqual(lm.state.calls.length, 0);
});

test('an armed ownership lock stops the scripted paragraph', async () => {
  delete process.env.LUNA_PACKS_ENABLED;
  reset();
  boundary.bindTurn(null);
  const c = newConv('Do you offer a student discount?');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const holder = index.t742Hooks.withOwnershipWriteLock(c.id, () => gate);
  lm.state.queue.push('ACTION: REPLY\nBODY: Yes, we offer a student discount on the challenge fee.');
  await index.handleWebhook(webhookReq(c.id, c.user), res);
  assert.strictEqual(fake.publicWrites().length, 0, 'paragraph posted while the lock was armed');
  assert.strictEqual(lm.state.calls.length, 0, 'model ran while the lock was armed');
  release();
  await holder;
  assert.strictEqual(fake.publicWrites().length, 0, 'paragraph posted after the armed lock released');
  assert.ok(h.logs.some((l) => l.line.indexOf('SKIP ownership-lock-armed') === 0));
});

test('PD-072 class exact catalog body is not stripped before the allowlist', async () => {
  process.env.LUNA_PACKS_ENABLED = '1';
  const row = dev.rows.find((r) => r.id === 'PD-072');
  assert.ok(row && row.flagOn && row.flagOn.partId === 'packs.my-packs-keys.en');
  reset();
  boundary.bindTurn(null);
  const c = newConv(row.text);
  lm.state.queue.push('ACTION: REPLY\nBODY: A scripted paragraph that must not replace the catalog body.');
  await index.handleWebhook(webhookReq(c.id, c.user), res);
  assert.strictEqual(fake.publicWrites().length, 1, h.logs.map((l) => l.line).filter((l) => /FAQ_ASSIST|PUBLIC_WRITE/.test(l)).join('\n'));
  assert.strictEqual(lm.state.calls.length, 0);
  delete process.env.LUNA_PACKS_ENABLED;
});

test('control comment path uses the same authorization', () => {
  delete process.env.LUNA_PACKS_ENABLED;
  reset();
  const control = require(path.join(E.t.dir, 'control'));
  const c = newConv('How many cards are in one Elite Pack?');
  boundary.bindTurn({
    text: 'How many cards are in one Elite Pack?',
    normalized: 'how many cards are in one elite pack?',
    conversationId: c.id,
  });
  const denied = control.authorizeControlComment(c.id, { message_type: 'comment', body: FALLBACK });
  assert.strictEqual(denied && denied.reason, 'NOT_APPROVED_OUTPUT');
  assert.strictEqual(fake.publicWrites().length, 0);
  boundary.bindTurn(null);
});

run('outbound contract (' + E.which + ')');
