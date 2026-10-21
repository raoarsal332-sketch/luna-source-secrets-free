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
  console.log('ok', name);
}

function held(result, reason) {
  assert.strictEqual(result.action, 'hold');
  assert.strictEqual(result.silent, false);
  assert.notStrictEqual(result.action, 'skip');
  assert.strictEqual(result.clientMessage, guard.CLIENT_MESSAGE);
  assert.notStrictEqual(result.clientMessage, '');
  assert.strictEqual(result.topicIgnored, true);
  assert.strictEqual(result.approved, false);
  assert.strictEqual(result.release, false);
  if (reason) assert.strictEqual(result.reason, reason);
}

function allowed(result, reason) {
  assert.strictEqual(result.action, 'allow');
  assert.strictEqual(result.silent, false);
  assert.strictEqual(result.approved, false);
  assert.strictEqual(result.release, false);
  if (reason) assert.strictEqual(result.reason, reason);
}

test('candidate stays unapproved and the hedge is the visible fallback', () => {
  assert.strictEqual(guard.STATUS.candidate, 't800-payout-r10');
  assert.strictEqual(guard.STATUS.frozen, true);
  assert.strictEqual(guard.STATUS.approved, false);
  assert.strictEqual(guard.STATUS.release, false);
  assert.strictEqual(guard.APPROVED.resetFeePercent, 40);
  assert.strictEqual(guard.APPROVED.resetFeeMinimumUsd, 10);
  assert.strictEqual(guard.APPROVED.riseMinimumUsd, 500);
  assert.strictEqual(guard.APPROVED.riseFeeUsd, 40);
  assert.strictEqual(guard.APPROVED.cryptoFeePercent, 3);
  assert.strictEqual(guard.APPROVED.cryptoOnlyBelowUsd, 500);
  assert.strictEqual(guard.APPROVED.articles.resetFee, '17437410');
  assert.strictEqual(guard.APPROVED.articles.payoutMethod, '17437354');
  assert.strictEqual(guard.APPROVED.articles.softBreachPayout, '17437398');
  assert.strictEqual(guard.APPROVED.articles.halfDailyLoss, '17437285');
  assert.strictEqual(guard.APPROVED.articles.weekendTrading, '17437306');
  assert.strictEqual(guard.APPROVED.articles.catalystSharePrice, '17437215');
  assert.ok(guard.HEDGE_RE.test(guard.CLIENT_MESSAGE));
  assert.ok(guard.FALLBACK_HEDGE_RE.test(guard.CLIENT_MESSAGE));
  assert.strictEqual(guard.hedgeSource, 'knowledgeGapGate');
  const missing = guard.resolveHedgePattern(() => {
    throw new Error('statePresend dir absent');
  });
  assert.strictEqual(missing.source, 'fallback');
  assert.ok(missing.re.test(guard.CLIENT_MESSAGE));
});

test('termination synonyms do not match an approved Strategy Risk statement', () => {
  const drafts = [
    'A Strategy Risk breach ends the account.',
    'A Strategy Risk breach will shut down the funded account.',
    'A Strategy Risk breach will kill the account.',
    'After a Strategy Risk breach the account does not continue.',
    'A Strategy Risk breach means account closure.',
    'A Strategy Risk breach closes the funded account.',
    'A Strategy Risk breach may result in funded account closure.',
    'A Strategy Risk breach has no reset.',
    'A Strategy Risk breach abolishes the account.',
    'A Strategy Risk breach will suspend the funded account.',
    'A Strategy Risk breach wipes the account.',
    'Una infracción de Strategy Risk cierra la cuenta.',
    'स्ट्रेटजी रिस्क पर अकाउंट बंद हो जाता है।',
  ];
  for (const draft of drafts) {
    const result = guard.evaluateResetRestoreClaim({ draft });
    held(result, 'strategy_risk_outcome');
    assert.notStrictEqual(result.clientMessage, draft);
  }
});

test('the approved Strategy Risk statement is a soft breach with a reset', () => {
  const result = guard.evaluateResetRestoreClaim({
    draft: 'A Strategy Risk breach is a soft breach with a reset.',
  });
  allowed(result, 'owner_rule');
  assert.strictEqual(result.clientMessage, 'A Strategy Risk breach is a soft breach with a reset.');
  const atEnd = guard.evaluateResetRestoreClaim({
    draft: 'A Strategy Risk breach is a soft breach with a reset at the end.',
  });
  allowed(atEnd, 'owner_rule');
  const scope = guard.evaluateResetRestoreClaim({
    draft: 'Strategy Risk applies to the funded stage only.',
  });
  allowed(scope, 'no_claim');
});

test('reset is allowed only at breakeven or in profit', () => {
  const blocked = [
    'You can reset while the account is losing.',
    'The account can be reset when the balance is negative.',
    'You can reset with an open loss.',
    'The account can be reset below the starting balance.',
    'The account can be reset.',
    'You may reset while in drawdown.',
    'The account is eligible for a reset.',
    'A reset is offered.',
    'अकाउंट को लॉस में रीसेट किया जा सकता है।',
  ];
  for (const draft of blocked) held(guard.evaluateResetRestoreClaim({ draft }), 'reset_condition');

  allowed(guard.evaluateResetRestoreClaim({
    draft: 'A funded reset is allowed only at breakeven or in profit.',
  }), 'owner_rule');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'You cannot reset while the account is in drawdown.',
  }), 'owner_rule');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'You can reset only at breakeven, not while losing.',
  }), 'owner_rule');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'The account can be reset in profit.',
  }), 'owner_rule');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'You cannot reset in a loss.',
  }), 'owner_rule');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'The trailing drawdown limit does not reset.',
  }), 'no_claim');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'The daily loss limit does not reset.',
  }), 'no_claim');
});

test('a how-question does not skip a later declarative sentence', () => {
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'How can I reset the account?',
  }), 'no_claim');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Can I reset the account while it is in drawdown?',
  }), 'no_claim');
  assert.strictEqual(guard.isPureQuestion('Can I reset the account while it is in drawdown?'), true);
  assert.strictEqual(guard.isPureQuestion('How can I reset the account?'), true);

  held(guard.evaluateResetRestoreClaim({
    draft: 'How can I reset? The account can be reset while losing.',
  }), 'reset_condition');
  held(guard.evaluateResetRestoreClaim({
    draft: 'How can I reset while losing, the account can be reset?',
  }), 'reset_condition');
  assert.strictEqual(guard.isPureQuestion('How can I reset while losing, the account can be reset?'), false);
});

test('previous-cycle profit is held unless the denial is on that predicate', () => {
  const payable = [
    'Pichla cycle ka profit payable hai.',
    'Purana profit mil jayega.',
    'पिछले चक्र का लाभ देय है।',
    'پچھلے منافع ملے گا۔',
    'الربح السابق مستحق.',
    'Previous-cycle profit is payable after a reset.',
    'Pehle cycle ka munafa milega.',
    'El beneficio del ciclo anterior es pagadero.',
    'Прибыль предыдущего цикла выплачивается.',
    'Previous profit is payable, the fee नहीं.',
  ];
  for (const draft of payable) held(guard.evaluateResetRestoreClaim({ draft }), 'previous_cycle_profit');

  const denied = [
    'Pichla cycle ka profit payable nahi hai.',
    'पिछले चक्र का लाभ देय नहीं है।',
    'پچھلے منافع نہیں ملے گا۔',
    'الربح السابق غير قابل للدفع.',
    'Previous-cycle profit is not payable after a reset.',
    "Le profit du cycle précédent n'est pas payable.",
    'Прибыль предыдущего цикла не выплачивается.',
  ];
  for (const draft of denied) allowed(guard.evaluateResetRestoreClaim({ draft }), 'owner_rule');
});

test('take-back wording and completion nouns are not approved reversals', () => {
  for (const draft of [
    'Finance took back the payout.',
    'The payout was undone.',
    'The reward was clawed back.',
    'They pull back the funds.',
    'The payout was cancelled.',
    'They retracted the reward.',
    'The settlement was recouped.',
  ]) {
    held(guard.evaluateResetRestoreClaim({ draft }), 'payout_reversal');
  }
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Completed payouts are not reversed.',
  }), 'owner_rule');
  const noted = guard.evaluateResetRestoreClaim({
    draft: 'Finance took back the payout.',
    messages: [{ role: 'note', text: 'I confirmed Finance took back the payout.' }],
  });
  held(noted, 'payout_reversal');
});

test('reward, funds, and Finance processed are completions until a real attestation', () => {
  const drafts = [
    'Your reward was paid.',
    'Your funds were sent.',
    'Finance processed the withdrawal.',
    'The settlement was paid.',
    'Your reward was paid, fee नहीं.',
  ];
  for (const draft of drafts) held(guard.evaluateResetRestoreClaim({ draft }), 'payout_completion');

  const draft = 'Your reward was paid.';
  held(guard.evaluateResetRestoreClaim({
    draft,
    messages: [{ role: 'note', text: draft }],
  }), 'payout_completion');
  held(guard.evaluateResetRestoreClaim({
    draft,
    messages: [{ role: 'note', text: 'was paid' }],
  }), 'payout_completion');
  held(guard.evaluateResetRestoreClaim({
    draft,
    messages: [{ role: 'note', text: 'Your reward was paid is not true.' }],
  }), 'payout_completion');
  held(guard.evaluateResetRestoreClaim({
    draft,
    messages: [{ role: 'human', text: 'I did not verify that your reward was paid.' }],
  }), 'payout_completion');
  held(guard.evaluateResetRestoreClaim({
    draft,
    messages: [{ role: 'note', text: 'Do not tell the client. I confirmed your reward was paid.' }],
  }), 'payout_completion');
  held(guard.evaluateResetRestoreClaim({
    draft,
    messages: [{ role: 'client', text: 'I confirmed your reward was paid.' }],
  }), 'payout_completion');
  held(guard.evaluateResetRestoreClaim({
    draft,
    messages: [{ role: 'note', text: 'I confirm the opposite: your reward was paid.' }],
  }), 'payout_completion');
  held(guard.evaluateResetRestoreClaim({
    draft,
    messages: [{ role: 'note', text: 'I confirm the contrary.' }],
  }), 'payout_completion');

  const confirmed = guard.evaluateResetRestoreClaim({
    draft,
    messages: [{ role: 'note', text: 'I confirmed your reward was paid.' }],
  });
  allowed(confirmed, 'human_confirmed');
  assert.strictEqual(confirmed.clientMessage, draft);

  const stray = guard.evaluateResetRestoreClaim({
    draft,
    messages: [{ role: 'note', text: 'I confirmed your reward was paid. Fee नहीं.' }],
  });
  allowed(stray, 'human_confirmed');
});

test('reset price must be 40 percent with a 10 USD minimum, and later fees double', () => {
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'The first reset fee is 40% of the original challenge cost, with a minimum of $10.',
  }), 'help_centre_17437410');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'The second reset fee is 2 times the first reset fee.',
  }), 'help_centre_17437410');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Later reset fees double.',
  }), 'help_centre_17437410');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'The third reset fee is double the second.',
  }), 'help_centre_17437410');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Subsequent reset fees are 2x.',
  }), 'help_centre_17437410');
  for (const draft of [
    'The reset fee is 25%.',
    'The reset fee is 15%.',
    'The reset fee is 25% with a minimum of $10.',
    'The reset fee is $50.',
    'The reset fee is $7.',
    'The reset fee is 40% of the profit.',
    'La tarifa de reset es 15%.',
  ]) {
    held(guard.evaluateResetRestoreClaim({ draft }), 'reset_price');
  }
});

test('payout method matches the published fee, not a difference between amounts', () => {
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Rise is for $500 or more only.',
  }), 'help_centre_17437354');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'The Rise fee is $40 per withdrawal.',
  }), 'help_centre_17437354');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'A crypto payout can be any amount.',
  }), 'help_centre_17437354');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Crypto is the only method below $500.',
  }), 'help_centre_17437354');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'The crypto fee is 3%.',
  }), 'help_centre_17437354');
  held(guard.evaluateResetRestoreClaim({
    draft: 'A $4,800 reward through Rise arrives as $4,760.',
  }), 'payout_method_amount');
  held(guard.evaluateResetRestoreClaim({
    draft: 'A $400 crypto reward arrives as $388.',
  }), 'payout_method_amount');
  held(guard.evaluateResetRestoreClaim({
    draft: 'Crypto payouts are capped at 500 USD.',
    knowledge: [{ text: 'Crypto payouts have a maximum request of 500 USD gross per payout cycle.' }],
  }), 'payout_method_amount');
  held(guard.evaluateResetRestoreClaim({ draft: 'The crypto fee is 5%.' }), 'payout_method_amount');
  held(guard.evaluateResetRestoreClaim({ draft: 'Rise has no withdrawal limit.' }), 'payout_method_amount');
  held(guard.evaluateResetRestoreClaim({ draft: 'Rise has a maximum of $500.' }), 'payout_method_amount');
  held(guard.evaluateResetRestoreClaim({ draft: 'You can withdraw any amount on Rise.' }), 'payout_method_amount');
  held(guard.evaluateResetRestoreClaim({ draft: 'The Rise fee is $25.' }), 'payout_method_amount');
});

test('weekend trading resets and forfeits, and it never terminates', () => {
  allowed(guard.evaluateResetRestoreClaim({
    draft: "Weekend trading resets the account and forfeits the current cycle's profit.",
  }), 'help_centre_17437306');
  held(guard.evaluateResetRestoreClaim({
    draft: 'Weekend trading terminates the account.',
  }), 'weekend_trading_outcome');
  held(guard.evaluateResetRestoreClaim({
    draft: 'Weekend trading shuts down the funded account.',
  }), 'weekend_trading_outcome');
  held(guard.evaluateResetRestoreClaim({
    draft: 'Weekend trading resets the account.',
  }), 'weekend_trading_outcome');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Weekend holding is allowed and is not a termination.',
  }), 'help_centre_weekend_holding');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Weekend holding is not being a termination.',
  }), 'help_centre_weekend_holding');
  held(guard.evaluateResetRestoreClaim({
    draft: 'Weekend holding terminates the account.',
  }), 'weekend_holding_outcome');
  held(guard.evaluateResetRestoreClaim({
    draft: 'Weekend holding is the same outcome as weekend trading.',
  }), 'outcomes_conflated');
});

test('a supported clause does not approve a sentence that also closes the account', () => {
  held(guard.evaluateResetRestoreClaim({
    draft: '50% of the daily loss limit is 1.5%, and the account will be closed.',
  }), 'strategy_risk_outcome');
  held(guard.evaluateResetRestoreClaim({
    draft: 'A soft-breach payout is 30%, but the account will be terminated.',
  }), 'soft_breach_outcome');
  held(guard.evaluateResetRestoreClaim({
    draft: 'The Rise fee is $40 and the account will be closed.',
  }), 'closure_or_termination');
  held(guard.evaluateResetRestoreClaim({
    draft: 'The first reset fee is 40% of the original challenge cost, but the account is closed.',
  }), 'closure_or_termination');
});

test('trailing percent, half daily loss rows, and catalyst facts are not false holds', () => {
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'A soft-breach payout is 30%.',
  }), 'help_centre_17437398');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'A soft breach payout is still processed at a 30% profit split.',
  }), 'help_centre_17437398');
  held(guard.evaluateResetRestoreClaim({
    draft: 'A soft breach payout is 20%.',
  }), 'soft_breach_outcome');
  allowed(guard.evaluateResetRestoreClaim({
    draft: '50% of the daily loss limit is 1.5%.',
  }), 'help_centre_17437285');
  allowed(guard.evaluateResetRestoreClaim({
    draft: '50% of a 5% daily drawdown is 2.5%.',
  }), 'help_centre_17437285');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'You cannot risk more than 50% of your daily loss limit.',
  }), 'help_centre_17437285');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'You may not risk more than 50% of your daily loss limit on the same instrument.',
  }), 'help_centre_17437285');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'A 3% daily loss limit means 1.5% on one instrument.',
  }), 'help_centre_17437285');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'A 4% daily loss limit means 2% on one instrument.',
  }), 'help_centre_17437285');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'A 5% daily loss limit means 2.5% on one instrument.',
  }), 'help_centre_17437285');
  held(guard.evaluateResetRestoreClaim({
    draft: '50% of the daily loss limit is 3%.',
  }), 'strategy_risk_outcome');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Your daily drawdown is 5%.',
  }), 'no_claim');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'The split is 3% and 1.5%.',
  }), 'no_claim');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Catalyst stage 2 profit share is 85%.',
  }), 'help_centre_17437215');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Catalyst stage 4 reset price is $1,790.',
  }), 'help_centre_17437215');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Catalyst stage 1 reset price is no reset.',
  }), 'help_centre_17437215');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Starting from $50,000, Catalyst stage 2 begins with an 80% share.',
  }), 'help_centre_17437215');
  held(guard.evaluateResetRestoreClaim({
    draft: 'A Catalyst reset erases earlier stages.',
  }), 'unresolved_catalyst_stage');
  held(guard.evaluateResetRestoreClaim({
    draft: 'A Catalyst reset keeps the earlier stage.',
  }), 'unresolved_catalyst_stage');
  held(guard.evaluateResetRestoreClaim({
    draft: 'Catalyst stage 2 share is 85% and the reset erases earlier stages.',
  }), 'unresolved_catalyst_stage');
  held(guard.evaluateResetRestoreClaim({
    draft: 'Catalyst stage 2 share is 70%.',
  }), 'catalyst_fact');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Hello, how can I help today?',
  }), 'no_claim');
});

test('a hedge does not carry a completion, and a question topic reaches the next sentence', () => {
  const pure = guard.evaluateResetRestoreClaim({
    draft: "I can't confirm that. Our team will confirm.",
  });
  allowed(pure, 'hedge_kept');
  assert.strictEqual(pure.hedgeKept, true);
  assert.strictEqual(pure.clientMessage, "I can't confirm that. Our team will confirm.");

  const carried = guard.evaluateResetRestoreClaim({
    draft: "I can't confirm the payout was paid.",
  });
  held(carried, 'payout_completion');
  assert.ok(!/\bpaid\b/i.test(carried.clientMessage));
  const took = guard.evaluateResetRestoreClaim({
    draft: "I can't confirm they took back the payout.",
  });
  held(took, 'payout_reversal');
  assert.ok(!/took\s+back/i.test(took.clientMessage));

  held(guard.evaluateResetRestoreClaim({
    draft: "I can't confirm that. A Strategy Risk breach ends the account.",
  }), 'strategy_risk_outcome');
  held(guard.evaluateResetRestoreClaim({
    draft: "I can't confirm a Strategy Risk breach ends the account.",
  }), 'strategy_risk_outcome');

  held(guard.evaluateResetRestoreClaim({
    draft: 'What happens on a Strategy Risk breach? It ends the account.',
  }), 'strategy_risk_outcome');
  held(guard.evaluateResetRestoreClaim({
    draft: 'What happens on a Strategy Risk breach? Band ho jayega.',
  }), 'strategy_risk_outcome');
  held(guard.evaluateResetRestoreClaim({
    draft: 'What about weekend trading? It terminates the account.',
  }), 'weekend_trading_outcome');
  held(guard.evaluateResetRestoreClaim({
    draft: 'Que se passe-t-il pour le risque de stratégie? Le compte est fermé.',
  }), 'strategy_risk_outcome');
  held(guard.evaluateResetRestoreClaim({
    draft: '¿Qué pasa con el riesgo de estrategia? La cuenta se cierra.',
  }), 'strategy_risk_outcome');
  held(guard.evaluateResetRestoreClaim({
    draft: 'При стратегическом риске аккаунт закроется.',
  }), 'strategy_risk_outcome');
  held(guard.evaluateResetRestoreClaim({
    draft: 'مخاطر الاستراتيجية يغلق الحساب.',
  }), 'strategy_risk_outcome');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'Band ho jayega.',
  }), 'no_claim');
  held(guard.evaluateResetRestoreClaim({
    draft: 'What is the crypto fee? It is 5%.',
  }), 'payout_method_amount');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'What is the crypto fee? It is 3%.',
  }), 'help_centre_17437354');
});

test('Help Centre is primary, and Catalyst erase-versus-keep stays hedged', () => {
  held(guard.evaluateResetRestoreClaim({
    draft: 'The FAQ overrides the Help Centre on this rule.',
  }), 'source_authority');
  held(guard.evaluateResetRestoreClaim({
    draft: 'The repo FAQ is the source of truth over the Help Centre.',
  }), 'source_authority');
  allowed(guard.evaluateResetRestoreClaim({
    draft: 'The official Help Centre is the primary reference and the repo FAQ is secondary.',
  }), 'help_centre_primary');
  held(guard.evaluateResetRestoreClaim({
    draft: 'Payout ho gaya hai.',
  }), 'payout_completion');
});

test('beforeSend and guardPublicBody fail closed to a visible hedge', () => {
  const bad = { toString() { throw new Error('boom'); } };
  const failed = guard.beforeSend(bad, {});
  assert.strictEqual(failed.send, true);
  assert.strictEqual(failed.silent, false);
  assert.strictEqual(failed.failClosed, true);
  assert.strictEqual(failed.replaced, true);
  assert.strictEqual(failed.body, guard.CLIENT_MESSAGE);

  const heldSend = guard.guardPublicBody('Your reward was paid.', {});
  assert.strictEqual(heldSend.send, true);
  assert.strictEqual(heldSend.replaced, true);
  assert.strictEqual(heldSend.silent, false);
  assert.strictEqual(heldSend.body, guard.CLIENT_MESSAGE);
  assert.notStrictEqual(heldSend.body, 'Your reward was paid.');

  const allowedSend = guard.guardPublicBody('Hello there.', {});
  assert.strictEqual(allowedSend.send, true);
  assert.strictEqual(allowedSend.replaced, false);
  assert.strictEqual(allowedSend.failClosed, false);
  assert.strictEqual(allowedSend.body, 'Hello there.');
});

test('parts from a note can attest, and a bot or client cannot', () => {
  const draft = 'Your funds were sent.';
  const messages = guard.partsToMessages([
    { part_type: 'comment', body: 'I confirmed your funds were sent.', author: { id: '1', type: 'user' } },
    { part_type: 'comment', body: 'I confirmed your funds were sent.', author: { id: '10118526', type: 'admin' } },
    { part_type: 'note', body: 'Checked: your funds were sent.', author: { id: '55', type: 'admin' } },
  ], ['10118526', '8052954']);
  assert.deepStrictEqual(messages.map((m) => m.role), ['client', 'bot', 'note']);
  const result = guard.evaluateResetRestoreClaim({ draft, messages });
  allowed(result, 'human_confirmed');
});

test('proposed diff guards suppression, greet, and personal arms without statePresend', () => {
  const diffPath = path.join(__dirname, 'index.js.public-sends.diff');
  const diff = fs.readFileSync(diffPath, 'utf8');
  assert.ok(diff.includes('t800-payout-r10/payoutClaimGuard'));
  assert.ok(diff.includes('guardPublicBody'));
  assert.ok(diff.includes('payoutGuardPublicBody'));
  assert.ok(diff.includes("I can't confirm that. Our team will confirm."));
  assert.ok(/identity recovery/i.test(diff));
  assert.ok(/Fin welcome/i.test(diff));
  assert.ok(/review-status/i.test(diff));
  assert.ok(/authorized-note/i.test(diff));
  assert.ok(/Auth-note REPLY/.test(diff));
  assert.ok(/POSTGATE_SUPPRESSED/.test(diff));
  assert.ok(/greetBody/.test(diff));
  assert.ok(/personalBody/.test(diff));
  assert.ok(diff.includes('finalBody = payoutGuardPublicBody(finalBody, parts)'));
  assert.ok(diff.includes('partsOf(full)'));
  assert.ok(!/require\(\s*['"]\.\/statePresend/.test(diff));
  assert.ok(!/02_statePresend/.test(diff));
  assert.ok(!/__statePresend\s*\./.test(diff));
  assert.ok(!diff.includes('__presend.send'));
  const added = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
  const posts = added.filter((line) => line.includes("postReply(conversationId, 'comment'"));
  assert.strictEqual(posts.length, 0);
  assert.ok(added.filter((line) => line.includes('payoutGuardPublicBody(')).length >= 4);
  assert.ok(!added.some((line) => /return\s+null/.test(line)));
  const root = path.resolve(__dirname, '../../..');
  execFileSync('git', ['apply', '--check', diffPath], { cwd: root, stdio: 'pipe' });
});

test('the guard has no silent path and no live side effects', () => {
  const src = fs.readFileSync(path.join(__dirname, 'payoutClaimGuard.js'), 'utf8');
  assert.ok(!/action:\s*'skip'/.test(src));
  assert.ok(!/silent:\s*true/.test(src));
  assert.ok(!/require\(['"]fs['"]\)/.test(src));
  assert.ok(!/child_process/.test(src));
  assert.ok(!/api\.intercom/.test(src));
  assert.ok(!/process\.env/.test(src));
  assert.ok(!/cryptoNetMatches|pairDiffersBy/.test(src));
  assert.ok(!/\b(approved|sent|paid|refund|days|%|\$)\b/i.test(guard.CLIENT_MESSAGE));
});

console.log('t800-payout-r10', passed, 'passed');
