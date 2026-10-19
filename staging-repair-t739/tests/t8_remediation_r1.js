'use strict';
/**
 * Remediation cycle 1 regressions (exposed failures only).
 * Fixed model stubs test enforcement, not model quality.
 */
const assert = require('assert');
const path = require('path');
const E = require('./env');
const { test, run } = require('./runner');
const { h, T, fake, index, lm, sc, L, P, reset, newConv, surfaces, secretsAbsent } = E;

const heldResult = (r) => r && r.ok === false && r.skipped === true && r.held === true && r.reason === 'credential-hold';
const noPublic = (label) => {
  assert.strictEqual(fake.publicWrites().length, 0, label + ' public writes ' + fake.publicWrites().length);
};
const res = { sendStatus() { return this; }, status() { return this; }, json() { return this; }, send() { return this; } };
function webhookReq(id, user) {
  return { body: { topic: 'conversation.user.replied', data: { item: { id, type: 'conversation', conversation_parts: { conversation_parts: [user] }, source: fake.getConversation(id).source } } }, headers: {} };
}
function ownerNote(text) {
  return sc.notePart('@Arsal ' + text, sc.AUTH_ADMIN);
}

const gate = require(path.join(E.t.dir, 'spreadAskGate'));
const guardPath = path.join(E.t.dir, 'spreadPublicGuard.js');
let guard = null;
try { guard = require(guardPath); } catch (_) { guard = null; }

test('MT5-4 spread-test route is only a generic spread or test-access ask', () => {
  const no = [
    "I can't log in to my MT5, password not working, what are the spreads",
    'my account 99999001 is not logging in, check the spreads',
    'check spreads on my account 99999001',
    'how do I get my payout, also what are the spreads',
    'KYC verification pending and what are the spreads?',
    'my spreads widened and my trade got stopped out',
    'what is the commission per lot and the spread on raw',
    'raw vs standard spreads?',
    'does spread widen during news?',
  ];
  const yes = [
    'what are the spreads?',
    'give me a spread check account',
    'can I get a demo login to check spreads',
    'what is the spread on EURUSD',
    'what is the p a s s w o r d for the spread test login',
    'send me the passw0rd and login for spreads',
    'what is the investor password to check spreads',
  ];
  if (E.which !== 'candidate') {
    h.say('OBS|baseline-spread-gate|' + JSON.stringify({
      personal: gate.explain(no[0]).result,
      general: gate.explain(no[7]).result,
      plain: gate.explain(yes[0]).result,
    }));
    return;
  }
  for (const q of no) assert.strictEqual(gate.explain(q).result, false, gate.explain(q).reason + ' | ' + q);
  for (const q of yes) assert.strictEqual(gate.explain(q).result, true, q);
  assert.strictEqual(guard.SAFE_SPREAD_REPLY.includes(L), false);
  assert.strictEqual(guard.SAFE_SPREAD_REPLY.includes(P), false);
  assert.strictEqual(guard.SAFE_SPREAD_REPLY.includes('password'), true);
});

test('MT5-1 safe replies are delivered through postClientCommentOnce -> icRequest', async () => {
  if (!guard) return;
  const approved = require(path.join(E.t.dir, 'faqApprovedAnswers'));
  const broker = approved.get('faq.is-broker.en').body;
  let refuse = '';
  const packsMod = path.join(E.t.dir, 'packs', 'packsApprovedAnswers.js');
  if (require('fs').existsSync(packsMod)) {
    const packs = require(packsMod);
    const row = packs.get('packs.account-status.refuse.en');
    refuse = row && (row.body || row.text || '');
  }
  // Design line 608: the spread template is the approved send. A catalog body
  // is added only when coversAllIntents is true. Customer text "hello" does
  // not cover faq.is-broker.en or a Packs refuse row (design line 273).
  // t745: these sentences name spreads, so the MT5 detector keeps them denied.
  const expectSend = [guard.SAFE_SPREAD_REPLY];
  const expectCoverage = [broker];
  if (refuse) expectCoverage.push(refuse);
  const expectModel = ['Los spreads se muestran en la plataforma.', 'Os spreads aparecem na plataforma.'];
  const check = async (body, pred) => {
    reset();
    const { id, user } = newConv('hello');
    const r = await index.postClientCommentOnce(id, body, user, 'Test Client');
    if (E.which !== 'candidate') {
      h.say('OBS|baseline-deliver|' + JSON.stringify({ held: !!(r && r.held), writes: fake.publicWrites().length, head: body.slice(0, 24) }));
      return;
    }
    pred(r, id, body);
    assert.ok(!fake.publicWrites().some((p) => String(p.data.body).includes(P) || String(p.data.body).includes(L)));
  };
  for (const body of expectSend) {
    await check(body, (r) => {
      assert.ok(r && r.ok && !r.held, JSON.stringify(r) + ' ' + body.slice(0, 40));
      assert.strictEqual(fake.publicWrites().length, 1, body.slice(0, 40));
      assert.strictEqual(fake.publicWrites()[0].data.admin_id, sc.ARSAL);
    });
  }
  if (E.which === 'candidate') {
    for (const body of expectCoverage) {
      await check(body, (r) => {
        assert.strictEqual(r && r.holdCode, 'COVERAGE_DENIED', JSON.stringify(r));
        assert.strictEqual(fake.publicWrites().length, 0);
      });
    }
    for (const body of expectModel) {
      await check(body, (r) => {
        assert.strictEqual(r && r.holdCode, 'NOT_APPROVED_OUTPUT', JSON.stringify(r));
        assert.strictEqual(fake.publicWrites().length, 0);
      });
    }
  }
});

test('MT5-2 lone password, cue-free secret, and cross-message split are held at the send boundary', async () => {
  const samples = [
    'Here is the investor password you requested: ' + P,
    'Here is what you requested: ' + P,
    'The password for that login is ' + P + '.',
  ];
  for (const body of samples) {
    reset();
    const { id, user } = newConv('Please help');
    fake.getConversation(id).conversation_parts.conversation_parts.push(
      sc.userPart('My login is ' + L + ' on Fake-Server.')
    );
    const layerA = await index.postReply(id, 'comment', body);
    if (E.which !== 'candidate') {
      h.say('OBS|baseline-layerA|' + JSON.stringify({ held: !!(layerA && layerA.held), writes: fake.publicWrites().length }));
      continue;
    }
    assert.ok(heldResult(layerA), JSON.stringify(layerA));
    noPublic('layerA');
    const layerB = await T.icRequest('post', 'https://api.intercom.io/conversations/' + id + '/reply', {
      message_type: 'comment', type: 'admin', admin_id: '10118526', body,
    }, 'OUT');
    assert.ok(heldResult(layerB), JSON.stringify(layerB));
    secretsAbsent(surfaces(), 'mt5-2');
  }
});

test('MT5-2 S10 FOLLOW does not persist the plaintext password', async () => {
  reset();
  const { id } = newConv('Please help');
  fake.getConversation(id).conversation_parts.conversation_parts.push({
    id: 'prior-bot', type: 'conversation_part', part_type: 'comment',
    body: '<p>Login ' + L + ' server Fake-Server.</p>',
    created_at: Math.floor(Date.now() / 1000) - 15,
    author: { type: 'admin', id: sc.ARSAL, name: 'Luna' },
  });
  fake.getConversation(id).conversation_parts.conversation_parts.push(ownerNote('please tell the client what they asked about'));
  lm.state.queue.push('ACTION: REPLY\nBODY: The password for that login is ' + P + '.');
  const ledgerSeen = [];
  fake.setResponder(() => { ledgerSeen.push(E.read(T.AUTH_COMMAND_FILE)); return null; });
  await T.processAuthorizedNoteCommands(id, fake.getConversation(id));
  const blob = ledgerSeen.join('\n') + '\n' + E.read(T.AUTH_COMMAND_FILE);
  if (E.which !== 'candidate') {
    h.say('OBS|baseline-s10|' + JSON.stringify({ leaked: blob.includes(P), publicWrites: fake.publicWrites().length }));
    return;
  }
  assert.strictEqual(blob.includes(P), false, 'password persisted');
  assert.strictEqual(blob.includes(L), false, 'login persisted');
  noPublic('s10');
  assert.ok(/"held":"[A-Z0-9_]+"/.test(blob), 'held marker missing');
});

test('MT5-3 persisted spread state replaces the map, and a credential-class ask does not disclose credentials', async () => {
  if (E.which !== 'candidate') {
    h.say('OBS|baseline-pending|skipped');
    return;
  }
  // Design line 151: the in-memory map is not the state machine.
  assert.ok(!T.pendingSpreadTemplateAppend, 'in-memory spread map is still exported');
  const state = require(path.join(E.t.dir, 'spreadTestState'));
  reset();
  const plain = newConv('hello, I have a general question about the platform');
  await index.handleWebhook(webhookReq(plain.id, plain.user), res);
  assert.notStrictEqual(state.load(plain.id).state, 'offered');

  // Design lines 608 and 614: idle to offered only when explain() reason is
  // spread-test-credential. "what are the spreads?" is strong-spread-phrase.
  reset();
  const general = newConv('what are the spreads?');
  await index.handleWebhook(webhookReq(general.id, general.user), res);
  assert.notStrictEqual(state.load(general.id).state, 'offered', 'strong-spread-phrase must not enter offered');

  reset();
  const first = newConv('can I get a demo login to check spreads');
  await index.handleWebhook(webhookReq(first.id, first.user), res);
  assert.strictEqual(state.load(first.id).state, 'offered');
  const pubs = fake.publicWrites();
  assert.ok(pubs.length >= 1, 'spread-test-credential ask produced no public reply');
  const sent = pubs.map((p) => p.data.body).join('\n');
  assert.ok(/cannot post a test account number or password/i.test(sent), sent.slice(0, 240));
  assert.ok(!sent.includes(P) && !sent.includes(L));

  // Design line 610: a later non-personal turn. The part must be newer than the
  // first public reply, or arsalAlreadyRepliedAfter treats it as a stale event.
  const follow = sc.userPart("what's the server", Math.floor(Date.now() / 1000) + 5);
  fake.getConversation(first.id).conversation_parts.conversation_parts.push(follow);
  await index.handleWebhook(webhookReq(first.id, follow), res);
  const all = fake.publicWrites().map((p) => p.data.body).join('\n');
  const hits = (all.match(/cannot post a test account number or password/gi) || []).length;
  assert.ok(hits >= 2, 'later non-personal offered turn omitted the template, hits=' + hits);
  assert.ok(!all.includes(P) && !all.includes(L), 'bare follow-up disclosed a credential');
  secretsAbsent(surfaces(), 'spread-follow');
});

test('false-hold measurement is separate from leak holds', () => {
  let hold;
  try { hold = require(path.join(E.t.dir, 'publicCredentialHold')); } catch (_) { hold = null; }
  if (!hold || !guard) {
    h.say('OBS|false-holds|no-module');
    return;
  }
  const approved = require(path.join(E.t.dir, 'faqApprovedAnswers'));
  const texts = approved.list().filter((r) => /\.en$/.test(r.id)).map((r) => r.body);
  texts.push(guard.SAFE_SPREAD_REPLY);
  texts.push('What is the commission per lot, and how do raw and standard spreads compare?');
  texts.push('Spreads can widen during news. That is market pricing, not a fixed quote.');
  texts.push('Los spreads se muestran en la plataforma con el mercado abierto.');
  texts.push('Os spreads aparecem na plataforma enquanto o mercado está aberto.');
  let holds = 0;
  const codes = [];
  for (const body of texts) {
    const r = hold.holdOutgoingPayload('post', { message_type: 'comment', type: 'admin', admin_id: '10118526', body });
    if (r && r.hold) { holds += 1; codes.push(r.code); }
  }
  h.say('OBS|false-holds|' + JSON.stringify({ holds, of: texts.length, codes }));
  if (E.which === 'candidate') assert.strictEqual(holds, 0, codes.join(','));
});

test('spread silence rows emit no public text, and an older offered follow-up still sends the template', async () => {
  if (E.which !== 'candidate') return;
  const fs = require('fs');
  const state = require(path.join(E.t.dir, 'spreadTestState'));
  const atomic = require(path.join(E.t.dir, 'atomicJsonFile'));
  const future = new Date(Date.now() + 3600000).toISOString();
  const past = new Date(Date.now() - 3600000).toISOString();
  const baseRec = (id, extra) => Object.assign({
    v: 1, conversationId: id, eventId: 'seed', state: 'offered',
    templateId: 'tpl.spread.safe-reply', templateHash: state.templateHash(),
    offeredAt: past, expiresAt: future, eventAt: Math.floor(Date.now() / 1000), acted: false,
  }, extra);
  const cases = [
    (id) => ({ rec: { v: 9, conversationId: id, state: 'offered' }, label: 'corrupt' }),
    (id) => ({ rec: baseRec('other-conv'), label: 'binding' }),
    (id) => ({ rec: baseRec(id, { expiresAt: past }), label: 'expiry' }),
    (id) => ({ rec: baseRec(id, { expiresAt: '' }), label: 'missing-expires' }),
    (id) => ({ rec: baseRec(id, { acted: true, eventId: 'restart-event' }), label: 'restart', eventId: 'restart-event' }),
  ];
  for (const build of cases) {
    reset();
    const c = newConv('hello there');
    const built = build(c.id);
    if (built.eventId) c.user.id = built.eventId;
    const map = {};
    map[c.id] = built.rec;
    atomic.writeJsonAtomic(state.filePath(), map);
    await index.handleWebhook(webhookReq(c.id, c.user), res);
    assert.strictEqual(fake.publicWrites().length, 0, built.label + ' posted public text');
    const blob = h.logs.map((l) => l.line).join('\n');
    assert.ok(!blob.includes('Thanks for the details. I am checking this now'), built.label + ' fallback');
  }
  try { fs.unlinkSync(state.filePath()); } catch (_) {}

  reset();
  const first = newConv('can I get a demo login to check spreads');
  await index.handleWebhook(webhookReq(first.id, first.user), res);
  assert.strictEqual(state.load(first.id).state, 'offered');
  const follow = sc.userPart('thanks, that helps', Math.floor(Date.now() / 1000) + 30);
  fake.getConversation(first.id).conversation_parts.conversation_parts.push(follow);
  await index.handleWebhook(webhookReq(first.id, follow), res);
  const hits = (fake.publicWrites().map((p) => p.data.body).join('\n').match(/cannot post a test account number or password/gi) || []).length;
  assert.ok(hits >= 2, 'older non-personal offered turn omitted the template, hits=' + hits);
});

run('remediation r1 (' + E.which + ')');
