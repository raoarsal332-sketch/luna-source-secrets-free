'use strict';
const assert = require('assert');
const g = require('./identityEscalateGates');

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('PASS', name);
  } catch (e) {
    console.error('FAIL', name, e && e.message);
    process.exitCode = 1;
  }
}

check('1 collectEscalateIds + account_sufficient', () => {
  const ids = g.collectEscalateIds(['My account is 71238, please check']);
  assert.ok(ids.hasAccount || ids.accountNumber === '71238', 'has account');
  assert.ok(ids.accountNumbers.includes('71238'), '71238 in list');
  assert.ok(!ids.hasEmail, 'no email');
  const pick = g.pickAccountEmailAsk({ accountNumber: '71238' });
  assert.strictEqual(pick.ready, true);
  assert.strictEqual(pick.ask, null);
  assert.strictEqual(pick.reason, 'account_sufficient');
});

check('2 both empty → ask account once, then WAIT (no empty-identity escalate)', () => {
  const pick = g.pickAccountEmailAsk({});
  assert.strictEqual(pick.ready, false);
  assert.strictEqual(pick.ask, 'account');
  // Changed 2026-09-19 (identityEscalateGates.js): after the asks are exhausted the gate
  // now HOLDS instead of escalating with an empty identity, because "Not provided
  // (unclear after asks)" escalations were telling clients "sent to teammate" before they
  // had ever shared an account number. Only real details or an explicit decline proceed.
  const again = g.pickAccountEmailAsk({ alreadyAskedAccount: true });
  assert.strictEqual(again.ready, false);
  assert.strictEqual(again.ask, null);
  assert.strictEqual(again.reason, 'awaiting_client_identity_after_asks');
});

check('2b explicit client decline is still the escape hatch (must not hang forever)', () => {
  const declined = g.pickAccountEmailAsk({ alreadyAskedAccount: true, declinedAccount: true });
  assert.strictEqual(declined.ready, true, 'a client who says they have no account must still get escalated');
  assert.strictEqual(declined.ask, null);
});

check('2c real account after the asks proceeds', () => {
  const withAcct = g.pickAccountEmailAsk({ alreadyAskedAccount: true, accountNumber: '71238' });
  assert.strictEqual(withAcct.ready, true);
  assert.strictEqual(withAcct.ask, null);
});

check('3 clientSaidNoAccount + declinedAccount ready', () => {
  assert.strictEqual(g.clientSaidNoAccount("I don't have an account number"), true);
  assert.strictEqual(g.clientSaidNoAccount('I do not have an account'), true);
  const pick = g.pickAccountEmailAsk({ declinedAccount: true });
  assert.strictEqual(pick.ready, true);
  assert.strictEqual(pick.ask, null);
});

check('4 account + declinedEmail → ready, no email ask', () => {
  assert.strictEqual(g.clientSaidNoEmail("I don't have email"), true);
  const pick = g.pickAccountEmailAsk({ accountNumber: '71238', declinedEmail: true });
  assert.strictEqual(pick.ready, true);
  assert.strictEqual(pick.ask, null);
});

check('5 extractAccountNumbersFromText patterns', () => {
  const a = g.extractAccountNumbersFromText('acct 71238 please');
  assert.ok(a.includes('71238'), '71238');
  const b = g.extractAccountNumbersFromText('ID S7376831 ok');
  assert.ok(b.some((x) => /S7376831/i.test(x)), 'S7376831');
  const c = g.extractAccountNumbersFromText('number 1004 386 here');
  assert.ok(c.includes('1004386'), 'spaced→digits');
  assert.ok(g.extractAccountNumbersFromText('71 238').includes('71238'), '71 238');
  assert.ok(g.extractAccountNumbersFromText('7-1-2-3-8').includes('71238'), '7-1-2-3-8');
  assert.ok(g.extractAccountNumbersFromText('FE71238').includes('FE71238'), 'FE71238');
});

check('5b extraction does NOT invent accounts', () => {
  const none = g.extractAccountNumbersFromText('phase 1 2 3 4 5 on 15 09 2026, bought sep2026 for 2024');
  assert.deepStrictEqual(none, [], 'no accounts from lists/dates/month-year: ' + JSON.stringify(none));
  assert.deepStrictEqual(g.extractAccountNumbersFromText('lost $500 on 2 trades'), []);
});

check('6 preSend blocks email ask when account present', () => {
  const r = g.preSendIdentityCheck({ accountNumber: '71238' }, 'Please share your email');
  assert.strictEqual(r.ok, false);
  const r2 = g.preSendIdentityCheck(
    { accountNumber: '71238' },
    'Can you send the registered email linked to that account?'
  );
  assert.strictEqual(r2.ok, false);
});

check('7 preSend blocks account ask when declined / known', () => {
  const r = g.preSendIdentityCheck({ declinedAccount: true }, 'Please share your account number');
  assert.strictEqual(r.ok, false);
  const r2 = g.preSendIdentityCheck(
    { accountNumber: '71238' },
    'Before I pass this to the team, please share your account number.'
  );
  assert.strictEqual(r2.ok, false);
});

check('8 preSend does NOT block normal replies that merely mention account/email', () => {
  const ids = { accountNumber: '71238', email: null, declinedEmail: true };
  const fine = [
    'Your account is currently under review by the team. Is there anything else I can help with?',
    'Once the review is done you will get an update on Intercom or by email. Anything else?',
    "I've forwarded this to a teammate. They have your account details and the chat context.",
    'We will send you an email once the payout is processed.',
    'Which platform are you trading on? Could you describe the error you see?',
  ];
  for (const d of fine) {
    const r = g.preSendIdentityCheck(ids, d);
    assert.strictEqual(r.ok, true, 'wrongly blocked: ' + d + ' :: ' + r.reason);
  }
});

check('9 detectIdentityAskFields recognises live ask variants', () => {
  const acct = [
    'Please share your account number so I can forward this with the right details.',
    'Can you send the account number linked to this issue? I’ll pass it to a teammate once I have it.',
    'Before I pass this to the team, please share your account number.',
  ];
  for (const t of acct) {
    const f = g.detectIdentityAskFields(t);
    assert.strictEqual(f.account, true, 'account ask missed: ' + t);
    assert.strictEqual(f.email, false, 'false email on: ' + t);
  }
  const email = [
    'Please share the registered FundedElite email for this account so I can forward it to a teammate.',
    'Can you send the registered email linked to that account? I’ll pass this on once I have it.',
    'Before I pass this to the team, please share the registered email on your FundedElite account.',
    'Thank you. Please also share the registered email linked to account 71238.',
  ];
  for (const t of email) {
    const f = g.detectIdentityAskFields(t);
    assert.strictEqual(f.email, true, 'email ask missed: ' + t);
    assert.strictEqual(f.account, false, 'false account on: ' + t);
  }
  const both = g.detectIdentityAskFields(
    'Before I pass this to the team, please share your account number and the email registered on your FundedElite account.'
  );
  assert.deepStrictEqual(both, { account: true, email: true });
});

check('10 soft-edge ask variants + multi-line + non-asks', () => {
  const notAsk = g.detectIdentityAskFields(
    "Your account is under review. We'll email you."
  );
  assert.deepStrictEqual(notAsk, { account: false, email: false });

  assert.strictEqual(
    g.detectIdentityAskFields('Please share your account number').account,
    true
  );
  assert.strictEqual(
    g.detectIdentityAskFields('Please share your login id').account,
    true
  );
  assert.strictEqual(
    g.detectIdentityAskFields('Please share your trading account number').account,
    true
  );
  assert.strictEqual(
    g.detectIdentityAskFields('registered email address please').email,
    true
  );

  const multi = g.detectIdentityAskFields(
    'Thanks for waiting.\nPlease share your login id\nso I can check.'
  );
  assert.strictEqual(multi.account, true, 'multi-line login id ask');

  const blocked = g.preSendIdentityCheck(
    { accountNumber: '71238' },
    'Please share your registered email address please'
  );
  assert.strictEqual(blocked.ok, false, 'preSend blocks email re-ask when account known');
});


check('11 challenge size must not beat real accounts (Sebastian)', () => {
  const ids = g.collectEscalateIds([
    'I just bought 5 100.000 1-step accounts',
    'I have the following accounts: 211031 211030 211029 211028 211027',
  ]);
  assert.ok(!String(ids.accountNumber || '').includes('100000'), 'must not use 100000: ' + ids.accountNumber);
  assert.ok(!(ids.accountNumbers || []).includes('100000'), '100000 not in list');
  assert.ok((ids.accountNumbers || []).includes('211031'), 'must include 211031');
  assert.ok(
    String(ids.accountNumber || '').includes('211031') || ids.accountNumber === '211031',
    'primary/field includes 211031: ' + ids.accountNumber
  );
});

check('12 IPv4 digits must not beat explicit account (Aryan)', () => {
  const ids = g.collectEscalateIds([
    'My VPS IP is 172.216.251.61',
    '204610 is my account number',
  ]);
  assert.strictEqual(ids.accountNumber, '204610', 'primary 204610 got ' + ids.accountNumber);
  assert.ok(!(ids.accountNumbers || []).includes('172216251'), 'no ip-derived');
  assert.ok(!(ids.accountNumbers || []).includes('17221625161'), 'no full ip-derived');
});

check('13 latest bare account beats earlier unlabeled number (Preston)', () => {
  const ids = g.collectEscalateIds(['24952 scalp', '209975']);
  assert.strictEqual(ids.accountNumber, '209975', 'prefer latest bare account got ' + ids.accountNumber);
  assert.ok((ids.accountNumbers || []).includes('209975'), '209975 in list');
});

check('14 extractAccountNumbersFromText strips IP and sizes', () => {
  const a = g.extractAccountNumbersFromText('bought 100.000 then account 211031');
  assert.ok(!a.includes('100000'), 'no challenge size: ' + JSON.stringify(a));
  assert.ok(a.includes('211031'), 'has real account');
  const b = g.extractAccountNumbersFromText('server 172.216.251.61 login ok');
  assert.ok(!b.includes('172216251') && !b.includes('17221625161'), 'no ip tokens: ' + JSON.stringify(b));
});

if (process.exitCode) {
  console.error('SELFTEST FAILED', passed, 'passed before failure');
  process.exit(1);
}
console.log('ALL PASS', passed);
