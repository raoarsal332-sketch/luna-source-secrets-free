'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const guard = require('./payoutClaimGuard');
const gap = require('../../02_statePresend/knowledgeGapGate');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS', name);
}

function blocked(result) {
  assert.strictEqual(result.action, 'block');
  assert.strictEqual(result.silent, false);
  assert.notStrictEqual(result.action, 'skip');
  assert.ok(result.reason);
  assert.ok(result.clientMessage && result.clientMessage.length > 0);
  assert.strictEqual(result.clientMessage, guard.CLIENT_MESSAGE);
  assert.strictEqual(result.topicIgnored, true);
  assert.strictEqual(result.approved, false);
}

test('status stays unapproved', () => {
  assert.strictEqual(guard.STATUS.approved, false);
  assert.strictEqual(guard.STATUS.release, false);
  assert.ok(gap.HEDGE_RE.test(guard.CLIENT_MESSAGE));
});

test('topic is not read and reset/restore still blocks', () => {
  const draft = 'I restored your account.';
  const ctx = {
    draft,
    get topic() {
      throw new Error('topic was read');
    },
    get language() {
      throw new Error('language was read');
    },
  };
  const result = guard.evaluateResetRestoreClaim(ctx);
  blocked(result);
  assert.ok(result.claims.some((c) => /restored/i.test(c)));
});

test('same claim blocks on login and on payout', () => {
  const draft = 'Your payout was reset.';
  const login = guard.evaluateResetRestoreClaim({ draft, topic: 'login' });
  const payout = guard.evaluateResetRestoreClaim({ draft, topic: 'payout' });
  blocked(login);
  blocked(payout);
  assert.strictEqual(login.action, payout.action);
  assert.strictEqual(login.clientMessage, payout.clientMessage);
});

test('Arabic reset/restore blocks without a payout topic', () => {
  const result = guard.evaluateResetRestoreClaim({
    draft: 'تمت استعادة الحساب',
    topic: 'kyc',
  });
  blocked(result);
});

test('Arabic payout cues الدفع الدفعة and صرف block a completion', () => {
  for (const draft of ['تم صرف الدفعة', 'تم صرف الدفع', 'صرفت الدفعة']) {
    blocked(guard.evaluateResetRestoreClaim({ draft, topic: 'login' }));
  }
});

test('Arabic payout question is not a completion claim', () => {
  const draft = 'هل تم صرف الدفعة؟';
  const result = guard.evaluateResetRestoreClaim({ draft });
  assert.strictEqual(result.action, 'allow');
  assert.strictEqual(result.reason, 'no_claim');
  assert.strictEqual(result.clientMessage, draft);
});

test('negated Arabic disbursement is not blocked', () => {
  const draft = 'لم يتم صرف الدفعة';
  const result = guard.evaluateResetRestoreClaim({ draft });
  assert.strictEqual(result.action, 'allow');
  assert.strictEqual(result.reason, 'no_claim');
});

test('سحب alone does not arm', () => {
  const draft = 'تم سحب السيولة من السوق';
  assert.strictEqual(guard.sahbArmed(draft), false);
  const result = guard.evaluateResetRestoreClaim({ draft });
  assert.strictEqual(result.action, 'allow');
  assert.strictEqual(result.reason, 'no_claim');
});

test('سحب arms beside a payout word', () => {
  const result = guard.evaluateResetRestoreClaim({ draft: 'تم سحب الدفعة' });
  blocked(result);
});

test('سحب arms beside a loss word', () => {
  const result = guard.evaluateResetRestoreClaim({ draft: 'تم السحب بسبب الخسارة' });
  blocked(result);
});

test('سحب beside loss without a completion marker does not block', () => {
  const draft = 'حد السحب والخسارة مذكور في لوحة الحساب';
  assert.strictEqual(guard.sahbArmed(draft), true);
  const result = guard.evaluateResetRestoreClaim({ draft });
  assert.strictEqual(result.action, 'allow');
  assert.strictEqual(result.clientMessage, draft);
});

test('hedge is kept verbatim', () => {
  const draft = "I can't confirm the payout was reset. Our team will confirm.";
  const result = guard.evaluateResetRestoreClaim({ draft, topic: 'payout' });
  assert.strictEqual(result.action, 'allow');
  assert.strictEqual(result.reason, 'hedge_kept');
  assert.strictEqual(result.hedgeKept, true);
  assert.strictEqual(result.clientMessage, draft);
  assert.strictEqual(result.silent, false);
});

test('block replacement is itself a kept hedge on re-entry', () => {
  const first = guard.evaluateResetRestoreClaim({ draft: 'I reset the account.' });
  blocked(first);
  const second = guard.evaluateResetRestoreClaim({ draft: first.clientMessage });
  assert.strictEqual(second.action, 'allow');
  assert.strictEqual(second.reason, 'hedge_kept');
  assert.strictEqual(second.clientMessage, first.clientMessage);
});

test('human or note confirmation allows the claim', () => {
  const draft = 'Your account was restored.';
  const result = guard.evaluateResetRestoreClaim({
    draft,
    messages: [{ role: 'note', text: 'Teammate: your account was restored.' }],
  });
  assert.strictEqual(result.action, 'allow');
  assert.strictEqual(result.reason, 'human_confirmed');
  assert.strictEqual(result.clientMessage, draft);
});

test('policy explanation is not a completion claim', () => {
  const draft = 'A soft breach resets the payout cycle. That is the published pattern for that stage.';
  const result = guard.evaluateResetRestoreClaim({ draft, topic: 'payout' });
  assert.strictEqual(result.action, 'allow');
  assert.strictEqual(result.reason, 'no_claim');
  assert.strictEqual(result.clientMessage, draft);
});

test('Italian and Hinglish completions block with topic ignored', () => {
  blocked(guard.evaluateResetRestoreClaim({ draft: 'Ho ripristinato il conto.', topic: 'kyc' }));
  blocked(guard.evaluateResetRestoreClaim({ draft: 'Account reset kar diya hai.', topic: 'login' }));
});

test('block message states no payout outcome', () => {
  assert.ok(!/\b(approved|sent|paid|refund|days|%|\$)\b/i.test(guard.CLIENT_MESSAGE));
});

test('there is no silent-block path in the module', () => {
  const src = fs.readFileSync(path.join(__dirname, 'payoutClaimGuard.js'), 'utf8');
  assert.ok(!/action:\s*'skip'/.test(src));
  assert.ok(!/silent:\s*true/.test(src));
  assert.ok(!/require\(['"]fs['"]\)/.test(src));
  assert.ok(!/api\.intercom|process\.env|child_process/.test(src));
});

console.log('t800-payout-r7', passed, 'passed');
