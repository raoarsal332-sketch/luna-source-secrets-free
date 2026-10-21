'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const guard = require('./credentialGuard');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS', name);
}

function secretFree(result, secret) {
  const pub = JSON.stringify(result);
  assert.strictEqual(pub.includes(secret), false, 'public result contains the secret');
  assert.strictEqual(result.message.includes(secret), false);
}

test('status stays unapproved', () => {
  assert.strictEqual(guard.STATUS.approved, false);
  assert.strictEqual(guard.STATUS.frozen, true);
  assert.strictEqual(guard.STATUS.release, false);
});

test('AF02 fixed message after Luna team assign overrides skip', () => {
  const secret = 'Nigh7fall';
  const result = guard.decideCredentialGuard({
    clientText: 'pass: ' + secret,
    draft: 'Thanks, I stored ' + secret,
    wouldSkip: true,
    lunaAssignedTo: 'team',
    lunaIds: ['luna-seat'],
  });
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.message, guard.FIXED_MESSAGE);
  assert.strictEqual(result.silent, false);
  assert.strictEqual(result.overridesSkip, true);
  assert.ok(result.reasons.includes('AF02'));
  assert.strictEqual(result.treatedAsHumanHandoff, false);
  secretFree(result, secret);
});

test('NT03 fixed message after Luna escalation assign', () => {
  const secret = 'R-4401';
  const result = guard.decideCredentialGuard({
    clientText: 'typed ' + secret,
    wouldSkip: true,
    lunaAssignedTo: 'escalation',
    lunaIds: ['luna-seat'],
  });
  assert.strictEqual(result.action, 'fixed_message');
  assert.ok(result.reasons.includes('NT03'));
  assert.ok(!result.reasons.includes('AF02'));
  assert.strictEqual(result.overridesSkip, true);
  assert.strictEqual(result.message, guard.FIXED_MESSAGE);
  secretFree(result, secret);
});

test('NC01 fixed message after Luna assignment part', () => {
  const secret = 'Blue-heron-9';
  const result = guard.decideCredentialGuard({
    clientText: 'password is ' + secret,
    wouldSkip: true,
    lunaIds: ['luna-seat'],
    teamAssigneeId: 'team-queue',
    parts: [
      {
        part_type: 'assignment',
        author: { id: 'luna-seat', type: 'admin' },
        assignee_id: 'team-queue',
        target: 'team',
      },
    ],
  });
  assert.ok(result.reasons.includes('NC01'));
  assert.ok(result.reasons.includes('AF02'));
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.treatedAsHumanHandoff, false);
  secretFree(result, secret);
});

test('human assignment does not count as Luna AF02/NC01', () => {
  const secret = 'Other-seat-4';
  const result = guard.decideCredentialGuard({
    clientText: 'password is ' + secret,
    wouldSkip: true,
    lunaIds: ['luna-seat'],
    parts: [
      {
        part_type: 'assignment',
        author: { id: 'human-9', type: 'admin' },
        target: 'team',
        team: true,
      },
    ],
  });
  assert.strictEqual(result.action, 'fixed_message');
  assert.deepStrictEqual(result.reasons, ['credential_disclosure']);
  secretFree(result, secret);
});

test('pass X is found at the far end of a long message', () => {
  const secret = 'hunter2';
  const clientText = 'I hope I pass the challenge. ' + 'note '.repeat(3000) + 'pass ' + secret;
  assert.ok(clientText.length > 8000);
  const hits = guard.findDisclosures(clientText);
  assert.ok(hits.some((hit) => hit.kind === 'pass' && hit.value === secret));
  assert.ok(!hits.some((hit) => hit.value === 'the' || hit.value === 'challenge'));
  const result = guard.decideCredentialGuard({ clientText, lunaAssignedTo: 'team' });
  assert.strictEqual(result.matchMode, 'contains');
  assert.ok(result.reasons.includes('OH07'));
  assert.ok(result.kinds.includes('pass'));
  secretFree(result, secret);
});

test('typed X is found at any message length', () => {
  const secret = 'Keystone9';
  const clientText = 'x'.repeat(5000) + ' I typed ' + secret + ' ' + 'y'.repeat(5000);
  const result = guard.decideCredentialGuard({ clientText });
  assert.ok(result.kinds.includes('typed'));
  assert.strictEqual(result.matchMode, 'contains');
  assert.strictEqual(result.action, 'fixed_message');
  secretFree(result, secret);
});

test('here it is: X is found at any message length', () => {
  const secret = 'Quartz-88';
  const clientText = 'context '.repeat(800) + 'here it is: ' + secret + ' thanks';
  const hits = guard.findDisclosures(clientText);
  assert.ok(hits.some((hit) => hit.kind === 'here_it_is' && hit.value === secret));
});

test('OH07 contains: draft echo is replaced, match mode is contains', () => {
  const secret = 'Quartz-88';
  const clientText = 'Thanks for waiting. here it is: ' + secret + ' and the rest of the note stays here.';
  const draft = 'I can see ' + secret + ' on that login.';
  const result = guard.decideCredentialGuard({ clientText, draft });
  assert.strictEqual(result.matchMode, 'contains');
  assert.ok(result.reasons.includes('OH07'));
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.message, guard.FIXED_MESSAGE);
  assert.notStrictEqual(result.message, draft);
  secretFree(result, secret);
});

test('exact full-message disclosure is not marked OH07', () => {
  const secret = 'Nigh7fall';
  const result = guard.decideCredentialGuard({ clientText: 'pass: ' + secret });
  assert.strictEqual(result.matchMode, 'exact');
  assert.ok(!result.reasons.includes('OH07'));
  assert.ok(result.reasons.includes('credential_disclosure'));
});

test('ordinary pass-the-challenge wording is not a secret', () => {
  const clientText = 'I hope I pass the challenge tomorrow if I pass phase 1.';
  const result = guard.decideCredentialGuard({
    clientText,
    draft: 'Passing the challenge depends on the published target for that product.',
    lunaAssignedTo: 'team',
    wouldSkip: true,
  });
  assert.strictEqual(result.action, 'allow');
  assert.strictEqual(result.overridesSkip, false);
  assert.deepStrictEqual(result.reasons, []);
});

test('typed the wrong email is not a secret', () => {
  const result = guard.decideCredentialGuard({
    clientText: 'I typed the wrong email on the form.',
  });
  assert.strictEqual(result.action, 'allow');
});

test('here it is without a value is not a secret', () => {
  const result = guard.decideCredentialGuard({ clientText: 'here it is' });
  assert.strictEqual(result.action, 'allow');
});

test('account number alone is kept and not treated as a secret', () => {
  const result = guard.decideCredentialGuard({
    clientText: 'My account number is 219876.',
    draft: 'I will use account 219876.',
    lunaAssignedTo: 'escalation',
  });
  assert.strictEqual(result.action, 'allow');
  assert.strictEqual(result.message, 'I will use account 219876.');
});

test('Luna team assign without a secret does not force the fixed message', () => {
  const draft = 'Our team has already been informed and is reviewing this.';
  const result = guard.decideCredentialGuard({
    clientText: 'Any update on the review?',
    draft,
    wouldSkip: true,
    lunaAssignedTo: 'team',
  });
  assert.strictEqual(result.action, 'allow');
  assert.strictEqual(result.overridesSkip, false);
  assert.strictEqual(result.message, draft);
});

test('fixed message does not invent an account outcome', () => {
  assert.ok(!/\b(approved|sent|locked|disabled|refund|payout date|reset fee)\b/i.test(guard.FIXED_MESSAGE));
  assert.ok(/change that immediately/i.test(guard.FIXED_MESSAGE));
  assert.ok(/not repeat it back/i.test(guard.FIXED_MESSAGE));
  assert.ok(/security event/i.test(guard.FIXED_MESSAGE));
});

test('module stays synthetic', () => {
  const src = fs.readFileSync(path.join(__dirname, 'credentialGuard.js'), 'utf8');
  assert.ok(!/require\(['"]fs['"]\)/.test(src));
  assert.ok(!/require\(['"]https?['"]\)/.test(src));
  assert.ok(!/child_process|api\.intercom|process\.env|\.env/.test(src));
});

console.log('credential-guard-r5', passed, 'passed');
