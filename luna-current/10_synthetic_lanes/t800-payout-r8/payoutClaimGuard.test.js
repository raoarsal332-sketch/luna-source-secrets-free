'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const guard = require('./payoutClaimGuard');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS', name);
}

function blocked(result, reason) {
  assert.strictEqual(result.action, 'block');
  assert.strictEqual(result.silent, false);
  assert.notStrictEqual(result.action, 'skip');
  assert.ok(result.reason);
  assert.strictEqual(result.clientMessage, guard.CLIENT_MESSAGE);
  assert.strictEqual(result.topicIgnored, true);
  assert.strictEqual(result.approved, false);
  assert.strictEqual(result.release, false);
  if (reason) assert.strictEqual(result.reason, reason);
}

function held(result, reason) {
  assert.strictEqual(result.action, 'hold');
  assert.strictEqual(result.silent, false);
  assert.strictEqual(result.clientMessage, guard.CLIENT_MESSAGE);
  assert.notStrictEqual(result.clientMessage, '');
  assert.strictEqual(result.approved, false);
  if (reason) assert.strictEqual(result.reason, reason);
}

test('status stays unapproved and the hedge is the existing pattern', () => {
  assert.strictEqual(guard.STATUS.approved, false);
  assert.strictEqual(guard.STATUS.release, false);
  assert.strictEqual(guard.STATUS.candidate, 't800-payout-r8');
  assert.ok(guard.HEDGE_RE.test(guard.CLIENT_MESSAGE));
  assert.ok(guard.FALLBACK_HEDGE_RE.test(guard.CLIENT_MESSAGE));
  assert.strictEqual(guard.HEDGE_RE.source, guard.FALLBACK_HEDGE_RE.source);
});

test('missing statePresend falls back instead of throwing', () => {
  const resolved = guard.resolveHedgePattern(() => {
    throw new Error('statePresend dir absent');
  });
  assert.strictEqual(resolved.source, 'fallback');
  assert.ok(resolved.re.test(guard.CLIENT_MESSAGE));
  assert.strictEqual(guard.hedgeSource, 'knowledgeGapGate');
});

test('topic and language are not read', () => {
  const result = guard.evaluateResetRestoreClaim({
    draft: 'I restored your account.',
    get topic() { throw new Error('topic was read'); },
    get language() { throw new Error('language was read'); },
  });
  blocked(result, 'reset_restore_or_payout_completion');
});

test('completion statuses block without confirmation', () => {
  for (const draft of [
    'I reset the account.',
    'Your account was restored.',
    'Your payout was paid.',
    'Your payout was sent.',
    'We have processed your payout.',
    'The withdrawal was reversed.',
    'The payment was cancelled.',
    'I sent the payout.',
  ]) {
    blocked(guard.evaluateResetRestoreClaim({ draft }), 'reset_restore_or_payout_completion');
  }
});

test('a question like Can I reset is not a claim', () => {
  for (const draft of [
    'Can I reset my account?',
    'Can I reset my account',
    'Can I reset the account while it is in drawdown?',
    'Please can I reset the funded account.',
  ]) {
    const result = guard.evaluateResetRestoreClaim({ draft });
    assert.strictEqual(result.action, 'allow', draft);
    assert.strictEqual(result.reason, 'no_claim', draft);
    assert.strictEqual(result.clientMessage, draft);
  }
});

test('negated and non-payout sentences are not completion claims', () => {
  for (const draft of [
    'Your payout was not paid.',
    'I have not sent the payout.',
    'I sent the steps to your email.',
  ]) {
    const result = guard.evaluateResetRestoreClaim({ draft });
    assert.strictEqual(result.action, 'allow', draft);
    assert.strictEqual(result.reason, 'no_claim', draft);
  }
});

test('Arabic, Urdu, Hindi, Hinglish, Russian, and Italian completions block by structure', () => {
  const drafts = [
    ['arabic reset', 'تمت استعادة الحساب'],
    ['arabic paid', 'تم صرف الدفعة'],
    ['arabic paid short', 'صرفت الدفعة'],
    ['arabic cancelled', 'تم إلغاء الدفعة'],
    ['urdu paid', 'ادائیگی ہو گئی ہے'],
    ['hindi paid', 'भुगतान हो गया है'],
    ['hinglish reset', 'Account reset kar diya hai.'],
    ['hinglish sent', 'Payout sent ho gaya hai.'],
    ['russian sent', 'Выплата отправлена.'],
    ['russian restored', 'Счёт был восстановлен.'],
    ['italian restored', 'Ho ripristinato il conto.'],
  ];
  for (const [name, draft] of drafts) {
    blocked(guard.evaluateResetRestoreClaim({ draft, topic: 'login' }), 'reset_restore_or_payout_completion');
    assert.ok(guard.findClaims(draft).length > 0, name);
  }
});

test('questions and negations in those languages are not claims', () => {
  for (const draft of [
    'هل تم صرف الدفعة؟',
    'لم يتم صرف الدفعة',
    'کیا ادائیگی ہو گئی ہے؟',
    'ادائیگی نہیں ہوئی',
    'क्या भुगतान हो गया?',
    'भुगतान नहीं हुआ',
    'Payout nahi ho gaya.',
    'Выплата не отправлена.',
    'Можно сбросить счёт?',
  ]) {
    const result = guard.evaluateResetRestoreClaim({ draft });
    assert.strictEqual(result.action, 'allow', draft);
    assert.notStrictEqual(result.reason, 'reset_restore_or_payout_completion', draft);
  }
});

test('سحب arms only beside loss or payout and still needs a completion marker', () => {
  assert.strictEqual(guard.sahbArmed('تم سحب السيولة من السوق'), false);
  assert.strictEqual(guard.evaluateResetRestoreClaim({ draft: 'تم سحب السيولة من السوق' }).action, 'allow');
  blocked(guard.evaluateResetRestoreClaim({ draft: 'تم سحب الدفعة' }));
  blocked(guard.evaluateResetRestoreClaim({ draft: 'تم السحب بسبب الخسارة' }));
  assert.strictEqual(guard.sahbArmed('حد السحب والخسارة مذكور في لوحة الحساب'), true);
  assert.strictEqual(guard.evaluateResetRestoreClaim({ draft: 'حد السحب والخسارة مذكور في لوحة الحساب' }).action, 'allow');
});

test('a hedge does not short-circuit later sentences', () => {
  const mixed = "I can't confirm the login issue. A Strategy Risk breach terminates the funded account and there is no reset.";
  const result = guard.evaluateResetRestoreClaim({ draft: mixed });
  blocked(result, 'strategy_risk_termination');
  assert.notStrictEqual(result.reason, 'hedge_kept');
  assert.ok(result.families.includes('soft_breach'));

  const laterPaid = "I can't confirm the login. Your payout was paid.";
  blocked(guard.evaluateResetRestoreClaim({ draft: laterPaid }), 'reset_restore_or_payout_completion');

  const sameSentence = "I can't confirm that, but a Strategy Risk breach terminates the funded account.";
  blocked(guard.evaluateResetRestoreClaim({ draft: sameSentence }), 'strategy_risk_termination');
});

test('a pure hedge is kept and re-entry stays a hedge', () => {
  const draft = "I can't confirm the payout was reset. Our team will confirm.";
  const result = guard.evaluateResetRestoreClaim({ draft });
  assert.strictEqual(result.action, 'allow');
  assert.strictEqual(result.reason, 'hedge_kept');
  assert.strictEqual(result.hedgeKept, true);
  assert.strictEqual(result.clientMessage, draft);
  const again = guard.evaluateResetRestoreClaim({ draft: guard.CLIENT_MESSAGE });
  assert.strictEqual(again.action, 'allow');
  assert.strictEqual(again.reason, 'hedge_kept');
  assert.strictEqual(again.clientMessage, guard.CLIENT_MESSAGE);
});

test('a note that says not to tell the client is not confirmation', () => {
  const draft = 'Your payout was paid.';
  const hidden = guard.evaluateResetRestoreClaim({
    draft,
    messages: [{ role: 'note', text: 'Do not tell the client that your payout was paid.' }],
  });
  blocked(hidden, 'reset_restore_or_payout_completion');
  assert.strictEqual(guard.withholdNote('Do not tell the client that your payout was paid.'), true);

  const told = guard.evaluateResetRestoreClaim({
    draft,
    messages: [
      { role: 'note', text: 'Do not tell the client about the internal flag.' },
      { role: 'human', text: 'Confirmed for the client: your payout was paid.' },
    ],
  });
  assert.strictEqual(told.action, 'allow');
  assert.strictEqual(told.reason, 'human_confirmed');
  assert.strictEqual(told.clientMessage, draft);
});

test('client text and the bot do not confirm a completion', () => {
  const draft = 'Your account was restored.';
  const fromClient = guard.evaluateResetRestoreClaim({
    draft,
    messages: guard.partsToMessages([
      { part_type: 'comment', body: 'Your account was restored.', author: { type: 'user', id: 'u1' } },
    ], ['10118526']),
  });
  blocked(fromClient);

  const fromBot = guard.evaluateResetRestoreClaim({
    draft,
    messages: guard.partsToMessages([
      { part_type: 'comment', body: 'Your account was restored.', author: { type: 'admin', id: '10118526' } },
    ], ['10118526']),
  });
  blocked(fromBot);

  const fromTeammate = guard.evaluateResetRestoreClaim({
    draft,
    messages: guard.partsToMessages([
      { part_type: 'comment', body: 'Your account was restored.', author: { type: 'admin', id: '55' } },
    ], ['10118526']),
  });
  assert.strictEqual(fromTeammate.action, 'allow');
  assert.strictEqual(fromTeammate.reason, 'human_confirmed');
});

test('owner-final contradictions block and the aligned forms do not', () => {
  blocked(guard.evaluateResetRestoreClaim({
    draft: 'A Strategy Risk breach terminates the funded account and there is no reset.',
  }), 'strategy_risk_termination');
  blocked(guard.evaluateResetRestoreClaim({
    draft: 'Strategy Risk may result in funded account closure.',
  }), 'strategy_risk_termination');
  const near = guard.evaluateResetRestoreClaim({
    draft: 'Strategy Risk is close to the daily loss limit.',
  });
  assert.notStrictEqual(near.reason, 'strategy_risk_termination');
  const fee = guard.evaluateResetRestoreClaim({
    draft: 'Strategy Risk has no reset fee.',
  });
  assert.notStrictEqual(fee.action, 'block');

  const alignedRisk = guard.evaluateResetRestoreClaim({
    draft: 'A funded Strategy Risk breach is a soft breach and the account can be reset.',
  });
  assert.strictEqual(alignedRisk.action, 'allow');
  assert.strictEqual(alignedRisk.reason, 'owner_rule');
  assert.ok(!alignedRisk.families.includes('scalp_weekend'));

  blocked(guard.evaluateResetRestoreClaim({
    draft: 'You can reset the account while it is in drawdown.',
  }), 'funded_reset_in_drawdown');
  const alignedReset = guard.evaluateResetRestoreClaim({
    draft: 'A funded reset is allowed only at breakeven or in profit.',
  });
  assert.strictEqual(alignedReset.action, 'allow');
  assert.strictEqual(alignedReset.reason, 'owner_rule');
  const deniedReset = guard.evaluateResetRestoreClaim({
    draft: 'You cannot reset the account in drawdown.',
  });
  assert.strictEqual(deniedReset.action, 'allow');
  assert.strictEqual(deniedReset.reason, 'owner_rule');

  blocked(guard.evaluateResetRestoreClaim({
    draft: 'Previous-cycle profit is still payable after the reset.',
  }), 'previous_cycle_profit_payable');
  const alignedProfit = guard.evaluateResetRestoreClaim({
    draft: 'Previous-cycle profit is not payable after a reset.',
  });
  assert.strictEqual(alignedProfit.action, 'allow');
  assert.strictEqual(alignedProfit.reason, 'owner_rule');

  const reversed = guard.evaluateResetRestoreClaim({
    draft: 'We reversed the completed payout.',
    messages: [{ role: 'note', text: 'We reversed the completed payout.' }],
  });
  blocked(reversed, 'completed_payout_reversed');
  const alignedDone = guard.evaluateResetRestoreClaim({
    draft: 'Completed payouts are not reversed.',
  });
  assert.strictEqual(alignedDone.action, 'allow');
  assert.strictEqual(alignedDone.reason, 'owner_rule');
});

test('soft breach, funded reset, and scalp/weekend reset stay separate', () => {
  const scalp = guard.evaluateResetRestoreClaim({
    draft: 'If the scalp limit is exceeded the funded account is reset.',
  });
  held(scalp, 'unsupported_program_fact');
  assert.ok(scalp.families.includes('scalp_weekend'));
  assert.ok(!scalp.families.includes('soft_breach'));
  assert.notStrictEqual(scalp.reason, 'strategy_risk_termination');

  const weekend = guard.evaluateResetRestoreClaim({
    draft: 'Weekend trading resets the funded account.',
  });
  held(weekend, 'unsupported_program_fact');
  assert.ok(weekend.families.includes('scalp_weekend'));
  assert.notStrictEqual(weekend.reason, 'funded_reset_in_drawdown');

  const conflated = guard.evaluateResetRestoreClaim({
    draft: 'A weekend reset is the same outcome as a Strategy Risk soft breach.',
  });
  blocked(conflated, 'outcomes_conflated');

  const separated = guard.evaluateResetRestoreClaim({
    draft: 'A Strategy Risk soft breach and a weekend reset are not the same outcome.',
  });
  assert.strictEqual(separated.action, 'allow');
  assert.strictEqual(separated.reason, 'owner_rule');
});

test('program and drawdown facts without authority are held', () => {
  const bare = guard.evaluateResetRestoreClaim({ draft: 'Your daily drawdown is 5%.' });
  held(bare, 'unsupported_program_fact');
  assert.strictEqual(bare.clientMessage, guard.CLIENT_MESSAGE);

  const fromClient = guard.evaluateResetRestoreClaim({
    draft: 'Your daily drawdown is 5%.',
    messages: [{ role: 'client', text: 'My daily drawdown is 5%.' }],
  });
  held(fromClient, 'unsupported_program_fact');

  const line = guard.evaluateResetRestoreClaim({
    draft: 'The trailing drawdown limit does not reset when equity falls.',
  });
  held(line, 'unsupported_program_fact');
  assert.notStrictEqual(line.reason, 'funded_reset_in_drawdown');

  const supported = guard.evaluateResetRestoreClaim({
    draft: 'Your daily drawdown is 5%.',
    knowledge: [{ title: 'Rules', text: 'The daily drawdown is 5% on this program.' }],
  });
  assert.strictEqual(supported.action, 'allow');
  assert.strictEqual(supported.clientMessage, 'Your daily drawdown is 5%.');

  const cycle = guard.evaluateResetRestoreClaim({
    draft: 'A soft breach resets the payout cycle.',
  });
  held(cycle, 'unsupported_program_fact');
  assert.ok(cycle.families.includes('soft_breach'));
  const cycleSupported = guard.evaluateResetRestoreClaim({
    draft: 'A soft breach resets the payout cycle.',
    authority: 'A soft breach resets the payout cycle after the warning.',
  });
  assert.strictEqual(cycleSupported.action, 'allow');

  const conflict = guard.evaluateResetRestoreClaim({
    draft: 'The daily drawdown is 5%.',
    knowledge: [
      { text: 'The daily drawdown is 5%.' },
      { text: 'The daily drawdown is 3%.' },
    ],
  });
  held(conflict, 'unsupported_program_fact');
});

test('unresolved conflicts are held and not decided', () => {
  const cap = guard.evaluateResetRestoreClaim({
    draft: 'Crypto payouts are capped at 500 USD.',
    knowledge: [{ text: 'Crypto payouts have a maximum request of 500 USD gross per payout cycle.' }],
  });
  held(cap, 'unresolved_crypto_cap');

  const anyAmount = guard.evaluateResetRestoreClaim({
    draft: 'A crypto payout can be any amount.',
  });
  held(anyAmount, 'unresolved_crypto_cap');

  const rise = guard.evaluateResetRestoreClaim({ draft: 'Rise has no withdrawal limit.' });
  assert.strictEqual(rise.action, 'allow');
  assert.notStrictEqual(rise.reason, 'unresolved_crypto_cap');

  held(guard.evaluateResetRestoreClaim({
    draft: 'The FAQ overrides the Help Centre on this rule.',
  }), 'unresolved_source_authority');

  held(guard.evaluateResetRestoreClaim({
    draft: 'A Catalyst reset erases earlier stages.',
    knowledge: [{ text: 'Each new Catalyst account is a clean slate and earlier stages are erased.' }],
  }), 'unresolved_catalyst_stage');

  held(guard.evaluateResetRestoreClaim({
    draft: 'On Catalyst your earlier stage wins stay won.',
  }), 'unresolved_catalyst_stage');
});

test('every sentence is checked and a greeting is left alone', () => {
  blocked(guard.evaluateResetRestoreClaim({
    draft: 'The login page is slow. Your payout was processed. Have a good day.',
  }), 'reset_restore_or_payout_completion');
  const hello = guard.evaluateResetRestoreClaim({ draft: 'Hello, how can I help today?' });
  assert.strictEqual(hello.action, 'allow');
  assert.strictEqual(hello.reason, 'no_claim');
});

test('beforeSend fail-closes to a visible hedge and never drops', () => {
  const bad = { toString() { throw new Error('boom'); } };
  const failed = guard.beforeSend(bad, {});
  assert.strictEqual(failed.send, true);
  assert.strictEqual(failed.silent, false);
  assert.strictEqual(failed.failClosed, true);
  assert.strictEqual(failed.body, guard.CLIENT_MESSAGE);
  assert.strictEqual(failed.replaced, true);

  const blockedSend = guard.beforeSend('Your payout was paid.', {});
  assert.strictEqual(blockedSend.send, true);
  assert.strictEqual(blockedSend.replaced, true);
  assert.strictEqual(blockedSend.body, guard.CLIENT_MESSAGE);
  assert.notStrictEqual(blockedSend.body, 'Your payout was paid.');

  const heldSend = guard.beforeSend('Your daily drawdown is 5%.', {});
  assert.strictEqual(heldSend.send, true);
  assert.strictEqual(heldSend.body, guard.CLIENT_MESSAGE);
  assert.strictEqual(heldSend.result.action, 'hold');

  const allowed = guard.beforeSend('Hello there.', {});
  assert.strictEqual(allowed.send, true);
  assert.strictEqual(allowed.replaced, false);
  assert.strictEqual(allowed.body, 'Hello there.');
});

test('proposed diff runs before postClientCommentOnce and does not use statePresend', () => {
  const diffPath = path.join(__dirname, 'index.js.before-send.diff');
  const diff = fs.readFileSync(diffPath, 'utf8');
  assert.ok(!/require\(\s*['"]\.\/statePresend/.test(diff));
  assert.ok(!/02_statePresend/.test(diff));
  assert.ok(!/__statePresend\s*\./.test(diff));
  assert.ok(diff.includes('payoutClaimGuard'));
  assert.ok(diff.includes('beforeSend'));
  assert.ok(diff.includes("I can't confirm that. Our team will confirm."));
  const added = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
  const postAt = added.findIndex((line) => line.includes('postClientCommentOnce'));
  const guardAt = added.findIndex((line) => line.includes('beforeSend'));
  assert.ok(guardAt >= 0 && postAt > guardAt);
  assert.ok(added.some((line) => line.includes('__payoutBody')));
  assert.ok(!added.some((line) => /return\s+res\.sendStatus/.test(line) && added.indexOf(line) < postAt));
  const root = path.resolve(__dirname, '../../..');
  execFileSync('git', ['apply', '--check', diffPath], { cwd: root, stdio: 'pipe' });
});

test('the module has no silent path, phrase list, or live side effects', () => {
  const src = fs.readFileSync(path.join(__dirname, 'payoutClaimGuard.js'), 'utf8');
  assert.ok(!/action:\s*'skip'/.test(src));
  assert.ok(!/silent:\s*true/.test(src));
  assert.ok(!/require\(['"]fs['"]\)/.test(src));
  assert.ok(!/child_process|api\.intercom|process\.env/.test(src));
  assert.ok(!/PHRASE_LIST|URDU_SENTENCES|HINDI_SENTENCES|ARABIC_SENTENCES/.test(src));
  assert.ok(!/\b(approved|sent|paid|refund|days|%|\$)\b/i.test(guard.CLIENT_MESSAGE));
});

console.log('t800-payout-r8', passed, 'passed');
