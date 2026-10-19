'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('./env');
const { test, run } = require('./runner');
const { h, T, fake, index, lm, fastAck, sc, L, P, VARIANTS, reset, newConv, surfaces, secretsAbsent, settle } = E;
const hold = require(path.join(E.root, 'candidate', 'publicCredentialHold'));

const STAFF_NOTE = (code) => 'Reply held by safety check (reason: ' + code + '). Nothing was sent to the customer.';
const heldResult = (r) => r && r.ok === false && r.skipped === true && r.held === true && r.reason === 'credential-hold';
const noPublic = (label) => {
  const pub = fake.publicWrites();
  assert.strictEqual(pub.length, 0, 'public write reached the transport recorder (' + label + '): ' + JSON.stringify(pub.map((p) => p.data.body)).slice(0, 160));
};
const opStoreEmpty = () => {
  const raw = E.read(h.files.opStore);
  const all = raw ? JSON.parse(raw) : {};
  assert.strictEqual(Object.keys(all).length, 0, 'write-op record exists for a held send: ' + raw.slice(0, 200));
};

test('sanity: harness is isolated (egress attempts so far = 0) and tree identity verified', () => {
  assert.strictEqual(E.h.net.attempts.length, 0, JSON.stringify(E.h.net.attempts));
  assert.ok(E.tc.verifyStripped(E.t.dir, E.t.originalIndexSha));
});

test('control: a clean public reply is sent exactly once, unchanged, and recorded as confirmed', async () => {
  reset();
  const { id } = newConv();
  const r = await index.postReply(id, 'comment', 'The daily loss limit is 5%.');
  assert.ok(r.ok && !r.held);
  assert.strictEqual(fake.publicWrites().length, 1);
  assert.ok(/The daily loss limit is 5%\./.test(fake.publicWrites()[0].data.body));
  const ops = JSON.parse(E.read(h.files.opStore));
  assert.deepStrictEqual(Object.values(ops).map((o) => o.status), ['confirmed']);
});

// ---- R1: postReply (public sender used by every caller) ------------------------------------
for (const [name, payload] of VARIANTS) {
  test(`postReply comment holds: ${name}`, async () => {
    reset();
    const { id } = newConv();
    const r = await index.postReply(id, 'comment', 'Here you go. ' + payload);
    assert.ok(heldResult(r), JSON.stringify(r));
    noPublic(name);
    opStoreEmpty();
    secretsAbsent(surfaces(), name);
  });
}

// ---- R2: postClientCommentOnce (model/FAQ/escalation/identity senders): content changes after the early guard
for (const [name, payload] of VARIANTS) {
  test(`postClientCommentOnce holds (welcome intro etc. added after early check): ${name}`, async () => {
    reset();
    const { id, user } = newConv();
    const r = await index.postClientCommentOnce(id, 'Sure. ' + payload, user, 'Test Client');
    noPublic(name);
    opStoreEmpty();
    secretsAbsent(surfaces(), name);
    assert.ok(!r || heldResult(r) || r.skipped, JSON.stringify(r));
  });
}
test('postClientCommentOnce mixed assembly: a clean answer plus a pair is held whole, nothing partial is sent', async () => {
  reset();
  const { id, user } = newConv();
  await index.postClientCommentOnce(id, 'The daily loss limit is 5%.\n\nAlso, ' + VARIANTS[1][1], user, 'Test Client');
  noPublic('mixed');
  assert.strictEqual(fake.writes().length, 0, 'no write of any kind may happen for an automated hold (F2: silent)');
});

// ---- F2: automated holds are silent --------------------------------------------------------
test('F2 automated hold is silent: no note, no assignment, one body-free log line with code+len+conversation id', async () => {
  reset();
  const { id, user } = newConv();
  await index.postClientCommentOnce(id, 'Sure. ' + VARIANTS[1][1], user, 'Test Client');
  assert.strictEqual(fake.notes().length, 0);
  assert.strictEqual(fake.writes().length, 0);
  const lines = h.logs.map((l) => l.line).filter((l) => /^CREDENTIAL_HOLD /.test(l));
  assert.strictEqual(lines.length, 1, lines.join('|'));
  assert.ok(new RegExp('^CREDENTIAL_HOLD ' + id + ' stage=\\w+ code=[A-Z0-9_]+ len=\\d+$').test(lines[0]), lines[0]);
});

// ---- R3: postDeterministicFlowReply ----------------------------------------------------------
for (const [name, payload] of VARIANTS.slice(0, 3)) {
  test(`postDeterministicFlowReply holds: ${name}`, async () => {
    reset();
    const { id, user } = newConv();
    const r = await T.postDeterministicFlowReply(id, 'Noted. ' + payload, user, 'Test Client');
    assert.ok(heldResult(r) || (r && r.ok === false), JSON.stringify(r));
    noPublic(name);
    opStoreEmpty();
  });
}

// ---- R4: FAQ deps.send --------------------------------------------------------------------
test('FAQ deps.send is the same boundary: a pair is held, a clean body is sent', async () => {
  reset();
  const { id } = newConv();
  const d = T.faqAssistanceDeps();
  const r = await d.send(id, 'Take this: ' + VARIANTS[1][1], 'faq:test');
  assert.ok(heldResult(r), JSON.stringify(r));
  noPublic('faq');
  const ok = await d.send(id, 'The daily loss limit is 5%.', 'faq:test2');
  assert.ok(ok.ok);
  assert.strictEqual(fake.publicWrites().length, 1);
});

// ---- R5/R6: transport-level layers B and C ---------------------------------------------------
for (const [name, payload] of VARIANTS.slice(0, 3)) {
  test(`icRequest layer B: nothing credential-bearing reaches webhookFastAck.prepareCustomerWrite or the transport: ${name}`, async () => {
    reset();
    const { id } = newConv();
    fastAck.state.store = { turn: 't1' };
    const r = await T.icRequest('post', 'https://api.intercom.io/conversations/' + id + '/reply', { message_type: 'comment', type: 'admin', admin_id: sc.ARSAL, body: '<p>' + payload + '</p>' }, 'OUT');
    fastAck.state.store = null;
    assert.ok(heldResult(r), JSON.stringify(r));
    assert.strictEqual(fastAck.state.prepared.length, 0, 'payload reached prepareCustomerWrite (persistable fast-ack store)');
    noPublic(name);
    opStoreEmpty();
    secretsAbsent({ prepared: JSON.stringify(fastAck.state.prepared), ...surfaces() }, name);
  });
  test(`icRequestUnguarded layer C: no write-op record and no transport call: ${name}`, async () => {
    reset();
    const { id } = newConv();
    const r = await T.icRequestUnguarded('post', 'https://api.intercom.io/conversations/' + id + '/reply', { message_type: 'comment', type: 'admin', admin_id: sc.ARSAL, body: payload }, 'OUT');
    assert.ok(heldResult(r), JSON.stringify(r));
    assert.strictEqual(fake.writes().length, 0);
    opStoreEmpty();
  });
}
test('icRequest does not touch non-public writes: an internal note carrying the same text is not held (design: notes are staff-only)', async () => {
  reset();
  const { id } = newConv();
  const r = await T.icRequest('post', 'https://api.intercom.io/conversations/' + id + '/reply', { message_type: 'note', type: 'admin', admin_id: sc.ARSAL, body: VARIANTS[0][1] }, 'NOTE');
  assert.ok(r.ok);
  assert.strictEqual(fake.notes().length, 1);
});
test('icRequest GET with a pair-like query is never held', async () => {
  reset();
  const { id } = newConv();
  const r = await T.icRequest('get', 'https://api.intercom.io/conversations/' + id + '?x=' + L, undefined, 'FETCH');
  assert.ok(r.ok);
});

// ---- R7: retries ---------------------------------------------------------------------------
test('retry (429): the retried POST carries byte-identical content to the first attempt; no content change between attempts', async () => {
  reset();
  const { id } = newConv();
  fake.failWrites(429);
  const slow = setTimeout(() => {}, 0);
  const r = await index.postReply(id, 'comment', 'The daily loss limit is 5%.');
  clearTimeout(slow);
  const pub = fake.publicWrites();
  assert.strictEqual(pub.length, 2);
  assert.strictEqual(pub[0].data.body, pub[1].data.body);
  assert.ok(r.ok);
});
test('a held send is not retried and not queued: zero transport calls, zero op records, repeat call is held again', async () => {
  reset();
  const { id } = newConv();
  for (let i = 0; i < 3; i++) {
    const r = await index.postReply(id, 'comment', VARIANTS[1][1]);
    assert.ok(heldResult(r));
  }
  assert.strictEqual(fake.writes().length, 0);
  opStoreEmpty();
});
test('retry permission is re-checked: a teammate public reply that appears between attempts stops the retry (existing behaviour preserved)', async () => {
  reset();
  const { id, full } = newConv();
  let posts = 0;
  fake.setResponder((rec) => {
    if (rec.method === 'post') {
      posts += 1;
      if (posts === 1) {
        full.conversation_parts.conversation_parts.push({ id: 'h1', type: 'conversation_part', part_type: 'comment', body: '<p>Hi, I am taking this one. Please send me the screenshot of the dashboard.</p>', created_at: Math.floor(Date.now() / 1000), author: { type: 'admin', id: '555111', name: 'Human Teammate' } });
        return { status: 429, data: { type: 'error.list', errors: [{ code: 'rate_limit_exceeded' }] } };
      }
    }
    return null;
  });
  await index.postReply(id, 'comment', 'The daily loss limit is 5%.');
  assert.strictEqual(posts, 1, 'retry went out after human takeover');
});

// ---- R8: owner commands ---------------------------------------------------------------------
const ownerNote = (text) => sc.notePart('@Arsal ' + text, sc.AUTH_ADMIN);
for (const [name, payload] of VARIANTS.slice(0, 4)) {
  test(`owner REPLY: (direct exact send) held; fixed body-free staff note; ledger never holds the body: ${name}`, async () => {
    reset();
    const { id, user } = newConv('Please help', []);
    const note = ownerNote('REPLY: ' + payload);
    fake.getConversation(id).conversation_parts.conversation_parts.push(note);
    const ledgerSeen = [];
    fake.setResponder(() => { ledgerSeen.push(E.read(T.AUTH_COMMAND_FILE)); return null; });
    const acted = await T.processAuthorizedNoteCommands(id, fake.getConversation(id));
    assert.strictEqual(acted, 'REPLY');
    noPublic(name);
    const notes = fake.notes().map((n) => n.data.body);
    assert.ok(notes.some((b) => /^Reply held by safety check \(reason: [A-Z0-9_]+\)\. Nothing was sent to the customer\.$/.test(b)), JSON.stringify(notes));
    assert.ok(!notes.some((b) => /Intercom returned an error/.test(b)), 'misleading Intercom-error note was posted');
    secretsAbsent({ ...surfaces(), ledgerSeen: ledgerSeen.join('\n') }, name);
  });
}
test('owner REPLY: unmatched customer prose is protected staff content and is not sent (t745)', async () => {
  reset();
  const { id } = newConv('Please help');
  fake.getConversation(id).conversation_parts.conversation_parts.push(ownerNote('REPLY: The daily loss limit is 5%.'));
  await T.processAuthorizedNoteCommands(id, fake.getConversation(id));
  assert.strictEqual(fake.publicWrites().length, 0);
  assert.ok(fake.notes().some((n) => n.data.body === STAFF_NOTE('NOT_APPROVED_OUTPUT')), JSON.stringify(fake.notes().map((n) => n.data.body)));
});
for (const [name, payload] of VARIANTS.slice(0, 3)) {
  test(`owner FOLLOW exact "send this message to client [..]": held, ledger body-free: ${name}`, async () => {
    reset();
    const { id } = newConv('Please help');
    fake.getConversation(id).conversation_parts.conversation_parts.push(ownerNote('please send this message to client [' + payload + ']'));
    const ledgerSeen = [];
    fake.setResponder(() => { ledgerSeen.push(E.read(T.AUTH_COMMAND_FILE)); return null; });
    await T.processAuthorizedNoteCommands(id, fake.getConversation(id));
    noPublic(name);
    secretsAbsent({ ...surfaces(), ledgerSeen: ledgerSeen.join('\n') }, name);
    assert.ok(fake.notes().some((n) => /^Reply held by safety check \(reason: /.test(n.data.body)), JSON.stringify(fake.notes().map((n) => n.data.body)));
  });
}
for (const [name, payload] of VARIANTS.slice(0, 3)) {
  test(`owner FOLLOW via model plan (fixed model stub): plan with a pair is never persisted or executed; staff note only: ${name}`, async () => {
    reset();
    const { id } = newConv('Please help');
    fake.getConversation(id).conversation_parts.conversation_parts.push(ownerNote('please tell the client what they asked about'));
    lm.state.queue.push('ACTION: REPLY\nBODY: Of course. ' + payload);
    const ledgerSeen = [];
    fake.setResponder(() => { ledgerSeen.push(E.read(T.AUTH_COMMAND_FILE)); return null; });
    await T.processAuthorizedNoteCommands(id, fake.getConversation(id));
    noPublic(name);
    const sawMarker = ledgerSeen.some((l) => /"held":"[A-Z0-9_]+"/.test(l));
    assert.ok(sawMarker, 'expected a body-free held marker in the ledger');
    secretsAbsent({ ...surfaces(), ledgerSeen: ledgerSeen.join('\n') }, name);
    assert.ok(fake.notes().some((n) => /^Reply held by safety check \(reason: /.test(n.data.body)));
  });
}
test('owner FOLLOW via model plan: unmatched customer prose is protected staff content and is not sent (t745)', async () => {
  reset();
  const { id } = newConv('Please help');
  fake.getConversation(id).conversation_parts.conversation_parts.push(ownerNote('please tell the client about the daily loss limit'));
  lm.state.queue.push('ACTION: REPLY\nBODY: The daily loss limit is 5%.');
  const ledgerSeen = [];
  fake.setResponder(() => { ledgerSeen.push(E.read(T.AUTH_COMMAND_FILE)); return null; });
  await T.processAuthorizedNoteCommands(id, fake.getConversation(id));
  assert.strictEqual(fake.publicWrites().length, 0);
  assert.ok(fake.notes().some((n) => n.data.body === STAFF_NOTE('NOT_APPROVED_OUTPUT')), JSON.stringify(fake.notes().map((n) => n.data.body)));
  assert.ok(!E.read(T.AUTH_COMMAND_FILE).includes('daily loss limit'), 'plan body must be deleted after the hold');
  assert.ok(ledgerSeen.every((l) => !/password|99999001/.test(l)));
});
test('persisted/retryable plan written by an older version (body with a pair, phase pending) is held on retry and the body is removed at completion', async () => {
  reset();
  const { id } = newConv('Please help');
  const note = ownerNote('please tell the client what they asked about');
  fake.getConversation(id).conversation_parts.conversation_parts.push(note);
  const ledger = {};
  ledger[id + ':' + note.id] = { conversationId: id, partId: note.id, at: Date.now(), record: { cmd: 'FOLLOW', phase: 'pending', startedAt: Date.now(), steps: {}, plan: { action: 'REPLY', body: 'Sure. ' + VARIANTS[1][1] } } };
  fs.writeFileSync(T.AUTH_COMMAND_FILE, JSON.stringify(ledger));
  await T.processAuthorizedNoteCommands(id, fake.getConversation(id));
  noPublic('seeded');
  assert.ok(!E.read(T.AUTH_COMMAND_FILE).includes(P));
  assert.ok(!E.read(T.AUTH_COMMAND_FILE).includes(L));
});

// ---- R9: full handleWebhook FAST path (model-generated text), burst rerun, auth replay -----------
function webhookReq(id, user) {
  return { body: { topic: 'conversation.user.replied', data: { item: { id, type: 'conversation', conversation_parts: { conversation_parts: [user] }, source: fake.getConversation(id).source } } }, headers: {} };
}
const res = { sendStatus() { return this; }, status() { return this; }, json() { return this; }, send() { return this; } };
const MODEL_PAIR = 'ACTION: REPLY\nBODY: Yes, we offer a student discount on the challenge fee. ' + VARIANTS[1][1];
const ASK = 'Do you offer a student discount for the challenge?';
test('handleWebhook (generated text, FAST route): model output with a pair is held; no public write; silent', async () => {
  reset();
  const { id, user } = newConv(ASK);
  lm.state.queue.push(MODEL_PAIR);
  await index.handleWebhook(webhookReq(id, user), res);
  noPublic('webhook');
  assert.strictEqual(fake.notes().length, 0);
  assert.ok(h.logs.some((l) => /^CREDENTIAL_HOLD /.test(l.line)), 'hold not reached on this route');
  secretsAbsent(surfaces());
});
test('handleWebhook control: a clean generated answer on the same route is sent', async () => {
  reset();
  const { id, user } = newConv(ASK);
  lm.state.queue.push('ACTION: REPLY\nBODY: Yes, we offer a student discount on the challenge fee.');
  await index.handleWebhook(webhookReq(id, user), res);
  assert.strictEqual(fake.publicWrites().length, 1);
});
test('auth replay re-enters handleWebhook: pair is held on replay too', async () => {
  reset();
  const { id } = newConv(ASK);
  T.deferForAuth(id);
  lm.state.queue.push(MODEL_PAIR, MODEL_PAIR);
  const out = await T.replayAuthDeferred('test');
  assert.ok(out && out.replayed >= 1, JSON.stringify(out));
  noPublic('auth replay');
  secretsAbsent(surfaces());
});
test('burst rerun re-enters handleWebhook: pair is held on the re-run too', async () => {
  reset();
  const { id, user } = newConv(ASK);
  lm.state.queue.push(MODEL_PAIR, MODEL_PAIR, MODEL_PAIR);
  T.burstRerunPending.add(id);
  T.scheduleBurstRerun(id);
  await settle(600);
  assert.ok(h.logs.some((l) => l.line.startsWith('BURST_RERUN ' + id)), 'burst rerun did not run');
  noPublic('burst rerun');
  secretsAbsent(surfaces());
});

// ---- ownership / context change ---------------------------------------------------------------
test('ownership change: human teammate reply before send blocks with the ownership reason (hold does not mask or replace it)', async () => {
  reset();
  const { id } = newConv('hello', [{ id: 'hx', type: 'conversation_part', part_type: 'comment', body: '<p>Hi, I am handling this. Please send me the screenshot.</p>', created_at: Math.floor(Date.now() / 1000) - 5, author: { type: 'admin', id: '555111', name: 'Human Teammate' } }]);
  const r = await index.postReply(id, 'comment', VARIANTS[1][1]);
  assert.ok(r.skipped);
  assert.ok(!r.held, 'ownership precedes the credential hold: ' + JSON.stringify(r));
  noPublic('owned');
});
test('aiOff and paused still block (preserved)', async () => {
  reset();
  const { id } = newConv();
  h.setControl({ aiOff: { [id]: true } });
  assert.strictEqual((await index.postReply(id, 'comment', 'The limit is 5%.')).reason, 'ticket-ai-off');
  h.setControl({ aiOff: {}, paused: true });
  assert.strictEqual((await index.postReply(id, 'comment', 'The limit is 5%.')).reason, 'paused');
  noPublic('control');
});

// ---- failed checks fail closed ---------------------------------------------------------------
test('failed check: a detector exception holds (never passes)', () => {
  const boom = { toString() { throw new Error('x'); } };
  assert.strictEqual(hold.inspect(boom).hold, true);
  assert.strictEqual(hold.inspect(boom).code, 'CRED_DETECTOR_ERROR');
  const bad = new Proxy({}, { get() { throw new Error('x'); }, ownKeys() { throw new Error('x'); } });
  const r = hold.holdOutgoingPayload('post', { message_type: 'comment', get body() { throw new Error('x'); } });
  assert.ok(r && r.hold);
  assert.ok(bad);
});

test('t745 protected free text stays denied: Packs, Atom, spread, offered state, and retry', async () => {
  const boundary = require(path.join(E.t.dir, 'publicWriteBoundary'));
  const spreadState = require(path.join(E.t.dir, 'spreadTestState'));
  const norm = require(path.join(E.t.dir, 'routeNormalizer'));
  const denied = async (label, body, turn) => {
    reset();
    const { id } = newConv(turn || 'Please help');
    if (turn) {
      boundary.bindTurn({ text: turn, normalized: norm.normalizeForRoute(turn), conversationId: id });
    } else {
      boundary.bindTurn(null);
    }
    const r = await index.postReply(id, 'comment', body);
    assert.strictEqual(r && r.holdCode, 'NOT_APPROVED_OUTPUT', label + ' ' + JSON.stringify(r));
    noPublic(label);
    opStoreEmpty();
    boundary.bindTurn(null);
  };
  await denied('packs-body', 'Elite Packs profit split is eighty percent in this sentence.');
  await denied('atom-body', 'Elite Atom profit split is eighty percent in this sentence.');
  await denied('spread-body', 'The spreads on the MetaTrader 5 server are the thing to inspect.');
  await denied('packs-turn', 'Here is a sentence that is not a catalog row.', 'What is Elite Packs?');
  await denied('both-entities', 'Here is a sentence that is not a catalog row.', 'How do Elite Packs and Elite Atom differ?');
  reset();
  const offered = newConv('Can you send the test login so I can check the spreads?');
  const entered = spreadState.onTurn({
    conversationId: offered.id,
    eventId: 'e-spread',
    text: 'Can you send the test login so I can check the spreads?',
  });
  assert.strictEqual(entered.state, 'offered', JSON.stringify(entered));
  boundary.bindTurn(null);
  const held = await index.postReply(offered.id, 'comment', 'The daily loss limit is 5%.');
  assert.strictEqual(held && held.holdCode, 'NOT_APPROVED_OUTPUT', JSON.stringify(held));
  noPublic('offered');
  spreadState.clear(offered.id, 'test');
  boundary.bindTurn(null);
  reset();
  const retry = newConv();
  fake.failWrites(429, 429);
  boundary.bindTurn(null);
  const rr = await index.postReply(retry.id, 'comment', 'Elite Atom profit split is eighty percent in this sentence.');
  assert.strictEqual(rr && rr.holdCode, 'NOT_APPROVED_OUTPUT', JSON.stringify(rr));
  assert.strictEqual(fake.publicWrites().length, 0);
  assert.ok(!fake.requests.some((q) => q.method === 'post' && /\/reply$/.test(q.url)), 'protected retry reached axios');
  boundary.bindTurn(null);
});
test('t745 staff REPLY of Packs free text is denied on the command path', async () => {
  reset();
  const { id } = newConv('Please help');
  fake.getConversation(id).conversation_parts.conversation_parts.push(ownerNote('REPLY: Elite Packs profit split is eighty percent in this sentence.'));
  await T.processAuthorizedNoteCommands(id, fake.getConversation(id));
  noPublic('staff-packs');
  assert.ok(fake.notes().some((n) => n.data.body === STAFF_NOTE('NOT_APPROVED_OUTPUT')), JSON.stringify(fake.notes().map((n) => n.data.body)));
});
test('t745 queued webhook still denies Packs free text', async () => {
  reset();
  const { id, user } = newConv('What is Elite Packs?');
  lm.state.queue.push('ACTION: REPLY\nBODY: Elite Packs profit split is eighty percent in this sentence.');
  const req = { body: { topic: 'conversation.user.replied', data: { item: { id, type: 'conversation', conversation_parts: { conversation_parts: [user] }, source: fake.getConversation(id).source } } }, headers: {}, __queuedWebhook: true };
  const res = { sendStatus() { return this; }, status() { return this; }, json() { return this; }, send() { return this; } };
  await index.handleWebhook(req, res);
  noPublic('queued-packs');
});

test('no generic stub other than the inert startup ones was called during the run', () => {
  const called = [...E.generic.make.called].sort();
  const allowed = ['generalAccountAskGuard.assessDraft', 'logRedact.install', 'luna-maintainer.create'];
  const extra = called.filter((c) => !allowed.includes(c));
  assert.deepStrictEqual(extra, [], 'unexpected generic stub calls (write an explicit stub): ' + extra.join(', '));
});
test('no egress attempt was made in this process', () => {
  assert.strictEqual(E.h.net.attempts.length, 0, JSON.stringify(E.h.net.attempts));
});

run('transport (' + E.which + ')');
