'use strict';
/**
 * Remediation cycle 2 regressions (exposed failure classes only).
 * Fixed model stubs test enforcement, not model quality.
 */
const assert = require('assert');
const path = require('path');
const E = require('./env');
const { test, run } = require('./runner');
const { h, T, fake, index, lm, sc, L, P, reset, newConv, surfaces, secretsAbsent } = E;

const heldResult = (r) => r && r.ok === false && r.skipped === true && r.held === true && r.reason === 'credential-hold';
const res = { sendStatus() { return this; }, status() { return this; }, json() { return this; }, send() { return this; } };
function webhookReq(id, user) {
  return { body: { topic: 'conversation.user.replied', data: { item: { id, type: 'conversation', conversation_parts: { conversation_parts: [user] }, source: fake.getConversation(id).source } } }, headers: {} };
}
function ownerNote(text) {
  return sc.notePart('@Arsal ' + text, sc.AUTH_ADMIN);
}
const gate = require(path.join(E.t.dir, 'spreadAskGate'));
const guard = require(path.join(E.t.dir, 'spreadPublicGuard'));
const sel = require(path.join(E.t.dir, 'faqAnswerSelect'));
const detectors = require(path.join(E.t.dir, 'faqModuleDetectors'));
const hold = require(path.join(E.t.dir, 'publicCredentialHold'));

test('r2 language: Portuguese or Spanish with English rule terms is not current-english; payout? stays uncertain; short English is English', () => {
  if (E.which !== 'candidate') { h.say('OBS|r2-lang|baseline'); return; }
  const pt = [
    'Qual e o limite de perda diaria para o 2 step e o stop loss e mandatory?',
    'Para o 2 step the daily loss limit is 5% and stop loss is mandatory',
    'Os spreads aparecem na plataforma e o daily loss limit is 5% for the 2 step',
  ];
  for (const q of pt) {
    const g = sel.languageGate(q, []);
    assert.notStrictEqual(g.lang, 'en', q + ' ' + g.basis);
    assert.notStrictEqual(g.basis, 'current-english', q);
  }
  const es = 'Para la cuenta 2 step the daily loss limit is 5% y el stop loss es mandatory';
  assert.notStrictEqual(sel.languageGate(es, []).lang, 'en');
  assert.strictEqual(sel.languageGate('payout?', []).lang, 'uncertain');
  assert.strictEqual(sel.languageGate('Is stop loss mandatory?', []).lang, 'en');
  assert.strictEqual(sel.languageGate('payout?', ['Is stop loss mandatory?']).lang, 'en');
  assert.strictEqual(sel.languageGate('stop loss?', []).lang, 'uncertain');
});

test('r2 F1 detector: unicode obfuscation and entity terms are claimed; non-module probes are not', () => {
  if (E.which !== 'candidate') { h.say('OBS|r2-f1|baseline'); return; }
  const cyr = '\u0440acks'; // рacks
  const zw = 'elite pa\u200bcks';
  const full = '\uFF45\uFF4C\uFF49\uFF54\uFF45 \uFF50\uFF41\uFF43\uFF4B\uFF53';
  for (const q of [cyr, zw, full, 'I opened my packs yesterday', 'someone asked how packs work', 'opening pack credits', 'what is the rarity of the purple card', 'where is My Packs']) {
    assert.strictEqual(detectors.packsDetect(q), true, q);
  }
  const atomCyr = '\u0430tom challenge';
  const atomZw = 'elite at\u200bom';
  const atomFull = '\uFF41\uFF54\uFF4F\uFF4D';
  for (const q of [atomCyr, atomZw, atomFull, 'What is Elite Atom?']) {
    assert.strictEqual(detectors.atomDetect(q, { priorClientTexts: [] }), true, q);
  }
  for (const q of ['I like to pack my bags', 'my credit card was charged', 'what is anatomy', 'atomic habits', 'Is a stop loss mandatory?', 'What is the daily loss limit for 2 step lite?']) {
    assert.strictEqual(detectors.packsDetect(q), false, 'packs ' + q);
    assert.strictEqual(detectors.atomDetect(q, { priorClientTexts: [] }), false, 'atom ' + q);
  }
  assert.strictEqual(detectors.packsDetect('how many did I open?', { priorClientTexts: ['what are elite packs'] }), true);
  assert.strictEqual(detectors.packsDetect('how many did I open?', { priorClientTexts: [] }), false);
});

test('r2 spread: eligible credential asks, follow-ups, and mixed appends deliver SAFE_SPREAD_REPLY and never a credential', async () => {
  if (E.which !== 'candidate') { h.say('OBS|r2-spread|baseline'); return; }
  const asks = [
    'what is the investor password to check spreads',
    'send me the test login for spreads',
    'can I get the password to check the spreads',
  ];
  for (const q of asks) {
    assert.strictEqual(gate.explain(q).result, true, gate.explain(q).reason + ' | ' + q);
    reset();
    const c = newConv(q);
    await index.handleWebhook(webhookReq(c.id, c.user), res);
    const sent = fake.publicWrites().map((p) => p.data.body).join('\n');
    assert.ok(sent.includes('cannot post a test account number or password'), q + ' :: ' + sent.slice(0, 180));
    assert.ok(!sent.includes(L) && !sent.includes(P), q);
  }
  for (const q of ['my password is not working on my mt5, what are the spreads', 'I cannot log in to account 99999001']) {
    assert.strictEqual(gate.explain(q).result, false, q);
  }

  reset();
  // Design lines 608 and 614: only spread-test-credential enters offered.
  const first = newConv('can I get a demo login to check spreads');
  await index.handleWebhook(webhookReq(first.id, first.user), res);
  const followTexts = ["what's the investor password", 'send the login again', 'server?'];
  for (const ft of followTexts) {
    const follow = sc.userPart(ft, Math.floor(Date.now() / 1000) + 30);
    fake.getConversation(first.id).conversation_parts.conversation_parts.push(follow);
    await index.handleWebhook(webhookReq(first.id, follow), res);
  }
  const all = fake.publicWrites().map((p) => p.data.body).join('\n');
  const hits = (all.match(/cannot post a test account number or password/gi) || []).length;
  assert.ok(hits >= 4, 'follow-ups did not resend the contained reply, hits=' + hits);
  assert.ok(!all.includes(L) && !all.includes(P));
  secretsAbsent(surfaces(), 'follow');

  reset();
  const mixed = newConv('what are the spreads and what is the daily loss limit for 2 step lite?');
  lm.state.queue.push('ACTION: REPLY\nBODY: The daily loss limit for 2-Step Lite is 3% of the starting balance.');
  await index.handleWebhook(webhookReq(mixed.id, mixed.user), res);
  const mixedBody = fake.publicWrites().map((p) => p.data.body).join('\n');
  assert.ok(!mixedBody.includes(L) && !mixedBody.includes(P));
  // Design line 151 deletes the in-memory map. Design lines 608 and 614:
  // this mixed strong-spread-phrase ask is not the spread-test-credential entry.
  assert.ok(!T.pendingSpreadTemplateAppend, 'in-memory spread map is still exported');
  const state = require(path.join(E.t.dir, 'spreadTestState'));
  assert.notStrictEqual(state.load(mixed.id).state, 'offered');
});

test('r2 S09 authorized REPLY: a credential that exists only in an href or attachment is held with a code', async () => {
  if (E.which !== 'candidate') { h.say('OBS|r2-s09|baseline'); return; }
  reset();
  const { id } = newConv('please help');
  const href = 'https://example.test/go?u=' + L + '&p=Passw0rd';
  fake.getConversation(id).conversation_parts.conversation_parts.push(
    ownerNote('REPLY: use <a href="' + href + '">this link</a>')
  );
  await T.processAuthorizedNoteCommands(id, fake.getConversation(id));
  assert.strictEqual(fake.publicWrites().length, 0, 'href credential was posted');
  const notes = fake.notes().map((n) => n.data.body).join('\n');
  assert.ok(/Reply held by safety check \(reason: [A-Z0-9_]+\)/.test(notes), notes.slice(0, 240));
  secretsAbsent(surfaces(), 's09');
});

test('r2 false holds: envelope-heavy legitimate replies are not CRED_SECRET_LABELLED, and a credential drop has a hold code', async () => {
  if (E.which !== 'candidate') { h.say('OBS|r2-false|baseline'); return; }
  const bodies = [
    'Your password is case-sensitive and must include a symbol. The access code is read-only for the investor view.',
    'Your password is never shared in this chat. Server build v2.0.1-beta is current.',
    guard.SAFE_SPREAD_REPLY,
  ];
  for (const body of bodies) {
    const r = hold.holdOutgoingPayload('post', {
      message_type: 'comment', type: 'admin', admin_id: '10118526', body,
      attachment_urls: ['https://files.example.test/attachments/report-2024.pdf'],
    });
    assert.strictEqual(r, null, (r && r.code) + ' ' + body.slice(0, 48));
  }
  reset();
  const { id, user } = newConv('hello');
  const leaked = 'Login: ' + L + ' Password: ' + P;
  const r = await index.postClientCommentOnce(id, leaked, user, 'Test');
  assert.ok(heldResult(r), JSON.stringify(r));
  assert.ok(r.holdCode, 'silent drop without a hold code');
  assert.strictEqual(fake.publicWrites().length, 0);
});

test('r2 unlabelled model-plan follow-up is held before send and before the ledger', async () => {
  if (E.which !== 'candidate') { h.say('OBS|r2-s10|baseline'); return; }
  reset();
  const { id } = newConv('please help');
  fake.getConversation(id).conversation_parts.conversation_parts.push(ownerNote('please answer the client'));
  lm.state.queue.push('ACTION: REPLY\nBODY: 99999001 / Passw0rd');
  const ledgerSeen = [];
  fake.setResponder(() => { ledgerSeen.push(E.read(T.AUTH_COMMAND_FILE)); return null; });
  await T.processAuthorizedNoteCommands(id, fake.getConversation(id));
  const blob = ledgerSeen.join('\n') + '\n' + E.read(T.AUTH_COMMAND_FILE);
  assert.strictEqual(fake.publicWrites().length, 0);
  assert.strictEqual(blob.includes('Passw0rd'), false);
  assert.strictEqual(blob.includes(L), false);
  assert.ok(/"held":"[A-Z0-9_]+"/.test(blob), blob.slice(0, 300));
});

run('remediation r2');
