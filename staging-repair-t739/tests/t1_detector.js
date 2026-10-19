'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { test, run } = require('./runner');
const root = path.resolve(__dirname, '..');
const d = require(path.join(root, 'candidate', 'publicCredentialHold'));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const L = '99999001', P = 'Fake#Pass1';
const hit = (name, text, codePrefix) => test('HOLD  ' + name, () => {
  const r = d.inspect(text);
  assert.strictEqual(r.hold, true, 'expected hold for: ' + name);
  if (codePrefix) assert.ok(String(r.code).startsWith(codePrefix), 'code ' + r.code);
});
const pass = (name, text) => test('PASS  ' + name, () => {
  const r = d.inspect(text);
  assert.strictEqual(r.hold, false, 'unexpected hold (' + r.code + ') for: ' + name);
});

test('guard 2158c43f copy is byte-identical to the approved file', () => {
  assert.strictEqual(sha(path.join(root, 'candidate', 'spreadPublicGuard.js')), '2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c');
  assert.strictEqual(sha(path.join(root, 'base', 'spreadPublicGuard.2158c43f.js')), '2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c');
});
test('no guard with prefix 846c225f exists anywhere in the work tree', () => {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      if (!/\.(js|json)$/.test(e.name)) continue;
      assert.notStrictEqual(sha(p).slice(0, 8), '846c225f', p);
    }
  }
});

hit('labelled login+password', `Login: ${L} Password: ${P}`);
hit('labelled, html wrapped', `<b>Login:</b> ${L}<br><b>Password:</b> ${P}`);
hit('labelled, html wrapped value tags', `<p>Account <strong>${L}</strong> password <em>${P}</em></p>`);
hit('weak label "pass"', `your account ${L} pass ${P}`);
hit('unlabelled slash pair', `${L} / ${P}`);
hit('unlabelled colon pair', `${L}:${P}`);
hit('unlabelled two lines', `${L}\n${P}`);
hit('worded digits login + labelled pw', `nine nine nine nine nine zero zero one and the pw is ${P}`);
hit('spaced digits login', `Login: 9 9 9 9 9 0 0 1 Password: ${P}`);
hit('dashed digits login', `Login: 9999-9001 Password: ${P}`);
hit('Spanish labels', `Usuario ${L} Contraseña: ${P}`);
hit('German labels', `Benutzer ${L} Passwort: ${P}`);
hit('French labels', `Identifiant ${L} Mot de passe: ${P}`);
hit('Italian labels', `Utente ${L} parola d'ordine: ${P}`);
hit('Roman Urdu labels', `login ${L} password hai ${P}`);
hit('Arabic label, login first', `رقم الحساب ${L} كلمة المرور: ${P}`);
hit('URL query pair', `open https://example.test/login?login=${L}&password=${encodeURIComponent(P)}`);
hit('URL userinfo', `https://${L}:${encodeURIComponent(P)}@example.test/`);
hit('zero-width space inside label', `Pa\u200Bssword: ${P} login ${L}`);
hit('ZWJ inside label', `Pass\u200Dword: ${P} login ${L}`);
hit('ZWNJ inside value digits', `login ${L.slice(0, 4)}\u200C${L.slice(4)} password: ${P}`);
hit('Arabic label, password first', `كلمة المرور: ${P} رقم الحساب ${L}`);
hit('Russian labels', `логин ${L} пароль: ${P}`);
hit('Cyrillic homoglyph label', `Login: ${L} P\u0430ssword: ${P}`);
hit('fullwidth digits', `Login: \uFF19\uFF19\uFF19\uFF19\uFF19\uFF10\uFF10\uFF11 Password: ${P}`);
hit('Arabic-Indic digits', `Login: \u0669\u0669\u0669\u0669\u0669\u0660\u0660\u0661 Password: ${P}`);
hit('HTML entity encoded colon', `Password&#58; ${P} Login&#58; ${L}`);
hit('percent encoded text', encodeURIComponent(`Login: ${L} Password: ${P}`));
hit('rot13 label', `Ybtva: ${L} Cnffjbeq: ${P}`.replace(/./g, (c) => c));
hit('split over lines with labels apart', `Password:\n${P}\n\nLogin:\n${L}`);
test('HOLD  lone labelled password with no login id (MT5-2)', () => {
  const r = d.inspect(`Here is the investor password you requested: ${P}`);
  assert.strictEqual(r.hold, true, r.code);
  assert.strictEqual(r.code, 'CRED_SECRET_LABELLED');
  assert.strictEqual(d.inspect(`Your password: ${P}`).hold, true);
});
test('HOLD  cue-free strong-shaped secret with no login id (MT5-2)', () => {
  const r = d.inspect(`Here is what you requested: ${P}`);
  assert.strictEqual(r.hold, true, r.code);
  assert.strictEqual(r.code, 'CRED_SECRET_SHAPED');
});
test('HOLD  password split from an earlier login (MT5-2 context)', () => {
  d.rememberConversationContext('mt5-2', [`Login ${L} on Fake-Server. Use that server.`]);
  const r = d.holdFinalPublic({
    screened: `The password for that login is ${P}.`,
    rendered: `<p>The password for that login is ${P}.</p>`,
    conversationId: 'mt5-2',
  });
  assert.ok(r && r.hold, 'split pair was not held');
  const plan = d.holdPlanForPersistence({ action: 'REPLY', body: `The password for that login is ${P}.` }, { conversationId: 'mt5-2' });
  assert.ok(plan && plan.hold, 'plan persistence did not see the split');
});
test('PASS  envelope admin_id is not a credential (MT5-1)', () => {
  const guard = require(path.join(root, 'candidate', 'spreadPublicGuard'));
  const broker = require(path.join(root, 'candidate', 'faqApprovedAnswers')).get('faq.is-broker.en').body;
  for (const body of [guard.SAFE_SPREAD_REPLY, broker, 'Los spreads se ven en la plataforma.', 'Os spreads aparecem na plataforma.']) {
    const r = d.holdOutgoingPayload('post', { message_type: 'comment', type: 'admin', admin_id: '10118526', body });
    assert.strictEqual(r, null, body.slice(0, 40));
  }
  const joined = d.holdOutgoingPayload('post', { message_type: 'comment', type: 'admin', admin_id: '10118526', body: 'Your account is a demo account on the server.' });
  assert.strictEqual(joined, null);
});

pass('FAQ-style answer', 'The daily loss limit for 2-Step accounts is 5% of the initial balance.');
pass('reset-password instructions', 'To reset your password, use the Forgot password link on the login page. Never share it with anyone.');
pass('asking customer for account number', 'Could you please share your account number so we can check?');
pass('mentions passwords generally', 'We will never ask for your password or login details.');
pass('account number alone', `Your account number is ${L}.`);
pass('price and percent text', 'Profit split is 80/20 and the fee is $155 for the 100000 account.');
pass('date and phone-like digits', 'Your payout was requested on 2026-10-18 at 14:05 UTC.');
pass('empty', '');

test('all 12 approved V12 answers pass the hold', () => {
  const a = require(path.join(root, 'candidate', 'faq-approved-answers-v12.json'));
  const rows = (Array.isArray(a) ? a : a.answers || a.rows || Object.values(a)).filter((r) => r && typeof r === 'object');
  const sendable = rows.filter((r) => /\.en$/.test(String(r.id)) && (r.body || r.answer || r.text));
  assert.ok(sendable.length >= 12, 'found ' + sendable.length);
  for (const r of sendable) {
    const text = r.body || r.answer || r.text;
    assert.strictEqual(d.inspect(text).hold, false, r.id);
  }
});

test('oversize input fails closed', () => {
  const r = d.inspect('a '.repeat(d.MAX_SCAN_CHARS));
  assert.strictEqual(r.hold, true);
  assert.strictEqual(r.code, d.CODES.TOO_LARGE || 'CRED_SCAN_TOO_LARGE');
});
test('non-string input does not throw and is not a hold', () => {
  for (const v of [null, undefined, 0, {}, []]) assert.doesNotThrow(() => d.inspect(v));
});
test('adversarial input finishes quickly (no catastrophic backtracking)', () => {
  const samples = [
    'password' + ' :'.repeat(4000), 'login ' + '9 '.repeat(5000), 'p\u200b'.repeat(5000),
    'a'.repeat(30000) + ':', ('Password: ' + 'x'.repeat(200) + ' ').repeat(100), '<b>'.repeat(5000) + 'password',
  ];
  for (const s of samples) {
    const t0 = Date.now();
    d.inspect(s);
    assert.ok(Date.now() - t0 < 1500, 'slow: ' + (Date.now() - t0) + 'ms for sample length ' + s.length);
  }
});
test('detection never alters its input (hold-not-rewrite)', () => {
  const src = `<b>Login:</b> ${L}<br>Password: ${P}\u200B`;
  const copy = String(src);
  d.inspect(src);
  assert.strictEqual(src, copy);
});
test('holdPlanForPersistence flags a plan whose body has a pair, ignores a clean plan', () => {
  assert.ok(d.holdPlanForPersistence({ action: 'REPLY', body: `Login: ${L} Password: ${P}` }));
  assert.strictEqual(d.holdPlanForPersistence({ action: 'REPLY', body: 'The limit is 5%.' }), null);
});
test('holdOutgoingPayload ignores GET and internal notes, holds comment', () => {
  assert.strictEqual(d.holdOutgoingPayload('get', { body: `Login: ${L} Password: ${P}` }), null);
  assert.strictEqual(d.holdOutgoingPayload('post', { message_type: 'note', body: `Login: ${L} Password: ${P}` }), null);
  assert.ok(d.holdOutgoingPayload('post', { message_type: 'comment', body: `Login: ${L} Password: ${P}` }));
});
test('holdOutgoingPayload scans nested payload strings (attachments / extra fields)', () => {
  assert.ok(d.holdOutgoingPayload('post', { message_type: 'comment', body: 'see attached', attachment_urls: [`https://x.test/?login=${L}&password=${encodeURIComponent(P)}`] }));
});
test('hold result and log line are body-free', () => {
  const h = d.inspect(`Login: ${L} Password: ${P}`);
  const res = JSON.stringify(d.holdResult(h)) + d.logLine('123', h).join(' ') + d.staffHoldNote(h.code);
  assert.ok(!res.includes(L) && !res.includes(P));
  assert.strictEqual(d.staffHoldNote('X_1'), null);
  assert.strictEqual(d.staffHoldNote('CRED_PAIR_UNLABELLED'), null);
  assert.strictEqual(d.staffHoldNote('NOT_APPROVED_OUTPUT'), 'Reply held by safety check (reason: NOT_APPROVED_OUTPUT). Nothing was sent to the customer.');
});
test('HOLD  unlabelled letter-digit pair with no cue word (S01 shape)', () => {
  const r = d.inspect('99999001 / Passw0rd');
  assert.strictEqual(r.hold, true, r.code);
  assert.strictEqual(r.code, 'CRED_PAIR_UNLABELLED');
});
test('HOLD  credential in a nonstandard link, path, fragment, or attachment url', () => {
  const samples = [
    'open https://example.test/go?u=99999001&p=Passw0rd',
    'https://example.test/99999001/Passw0rd',
    'https://example.test/reset#99999001:Fake%23Pass1',
    '<a href="https://example.test/go?u=99999001&p=Passw0rd">here</a>',
  ];
  for (const s of samples) assert.strictEqual(d.inspect(s).hold, true, s);
  const attached = d.holdOutgoingPayload('post', {
    message_type: 'comment', type: 'admin', admin_id: '10118526', body: 'see attached',
    attachment_urls: ['https://files.example.test/a?p=Passw0rd'],
  });
  assert.ok(attached && attached.hold, 'attachment url');
  assert.strictEqual(attached.code, 'CRED_PAIR_URL');
});
test('PASS  login id alone in a url, password-reset link, and ordinary labelled prose', () => {
  const samples = [
    'https://example.test/account/99999001',
    'To reset your password, open https://help.example.test/password/reset',
    'Your password is case-sensitive and must include a symbol. The access code is read-only.',
    'Your password is never shared in this chat. Server build v2.0.1-beta is current.',
    'https://files.example.test/attachments/report-2024.pdf',
  ];
  for (const s of samples) {
    const r = d.inspect(s);
    assert.strictEqual(r.hold, false, s + ' ' + r.code);
  }
  const envelope = d.holdOutgoingPayload('post', {
    message_type: 'comment', type: 'admin', admin_id: '10118526',
    body: '<p>Your password is never shared. The access code is read-only. See <a href="https://help.example.test/password/reset">reset</a>.</p>',
    attachment_urls: ['https://files.example.test/attachments/report-2024.pdf'],
  });
  assert.strictEqual(envelope, null, envelope && envelope.code);
});
test('PASS  a password word is not joined onto a following url token', () => {
  const r = d.holdOutgoingPayload('post', {
    message_type: 'comment', body: 'Use the password reset page.',
    attachment_urls: ['https://cdn.example.test/files/AbC12xYz.pdf'],
  });
  assert.strictEqual(r, null, r && r.code);
});

run('detector');
