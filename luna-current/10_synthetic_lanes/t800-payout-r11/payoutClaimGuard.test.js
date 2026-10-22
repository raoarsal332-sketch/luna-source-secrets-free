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
  assert.strictEqual(result.topicIgnored, false);
  assert.strictEqual(result.approved, false);
  assert.strictEqual(result.release, false);
  if (reason) assert.strictEqual(result.reason, reason);
}

function allowed(result, reason) {
  assert.strictEqual(result.action, 'allow');
  assert.strictEqual(result.silent, false);
  assert.strictEqual(result.topicIgnored, false);
  assert.strictEqual(result.approved, false);
  assert.strictEqual(result.release, false);
  if (reason) assert.strictEqual(result.reason, reason);
}

function judge(draft, messages) {
  return guard.evaluateResetRestoreClaim({ draft, messages });
}

test('candidate stays unapproved and the hedge is the visible fallback', () => {
  assert.strictEqual(guard.STATUS.candidate, 't800-payout-r11');
  assert.strictEqual(guard.STATUS.frozen, true);
  assert.strictEqual(guard.STATUS.approved, false);
  assert.strictEqual(guard.STATUS.release, false);
  assert.strictEqual(guard.CLIENT_MESSAGE, "I can't confirm that. Our team will confirm.");
  assert.ok(guard.HEDGE_RE.test(guard.CLIENT_MESSAGE));
  assert.ok(guard.FALLBACK_HEDGE_RE.test(guard.CLIENT_MESSAGE));
  assert.ok(!/\b(approved|sent|paid|refund|days|%|\$)\b/i.test(guard.CLIENT_MESSAGE));
  assert.strictEqual(guard.hedgeSource, 'knowledgeGapGate');
  const failed = guard.resolveHedgePattern(() => { throw new Error('absent'); });
  assert.strictEqual(failed.source, 'fallback');
  assert.ok(failed.re.test(guard.CLIENT_MESSAGE));
  const plain = judge('Hello there.');
  allowed(plain, 'no_claim');
  assert.strictEqual(plain.approved, false);
});

test('the fact table names every required article and refuses closure and stage memory', () => {
  const facts = guard.FACTS;
  for (const id of ['17437285', '17437306', '17437215', '17437354', '17437410', '17437398', '17437366']) {
    assert.ok(facts.some((row) => row.source === id), id);
  }
  assert.ok(facts.some((row) => row.source === 'owner_final' && row.subject === 'strategy_risk' && row.value === 'not_closure'));
  assert.ok(facts.some((row) => row.subject === 'strategy_risk' && row.value === 'soft_breach_with_reset'));
  assert.ok(facts.some((row) => row.subject === 'rise' && row.value === '4800>4760' && row.numbers.join() === '4800,4760'));
  assert.ok(facts.some((row) => row.subject === 'crypto' && row.value === '400>388'));
  assert.ok(!facts.some((row) => row.value === 'closure'));
  assert.ok(!facts.some((row) => row.predicate === 'stage_memory'));
  assert.ok(!facts.some((row) => /kept|preserved|erase/.test(row.value)));
});

test('instrument percents match 17437285 and closure stays unapproved', () => {
  allowed(judge('You may not risk more than 50% of your daily loss limit on the same instrument.'), '17437285');
  allowed(judge('50% of the daily loss limit is 1.5%.'), '17437285');
  allowed(judge('A 3% daily loss limit means 1.5% on one instrument.'), '17437285');
  allowed(judge('A 4% daily loss limit means 2% per instrument.'), '17437285');
  allowed(judge('50% of a 5% daily drawdown is 2.5%.'), '17437285');
  allowed(judge('A 2-Step $100,000 account has a $2,500 daily loss limit, and the example trades are $1,000 and $1,500.'), '17437285');
  held(judge('50% of the daily loss limit is 3%.'), 'fact_mismatch');
  held(judge('The daily loss limit example is $2,000.'), 'fact_mismatch');
  held(judge('You may not risk more than 50% of your daily loss limit on the same instrument. Breaking this rule can lead to closure.'), 'fact_mismatch');
  held(judge('How much can I risk on one instrument? Breaking this rule can lead to closure.'), 'fact_mismatch');
  allowed(judge('The split is 3% and 1.5%.'), 'no_claim');
  allowed(judge('Your daily drawdown is 5%.'), 'no_claim');
  allowed(judge('Strategy Risk applies to the funded stage only.'), 'no_claim');
});

test('owner strategy risk is a soft breach with a reset and never closure', () => {
  allowed(judge('A Strategy Risk breach is a soft breach with a reset.'), 'owner_final');
  allowed(judge('A Strategy Risk breach does not close the account.'), 'owner_final');
  allowed(judge('A soft breach with a reset at the end is not a termination.'), '17437398');
  held(judge('What happens on a Strategy Risk breach? Hello. It ends the account.'), 'fact_mismatch');
  held(judge('What happens on a Strategy Risk breach? Account band ho jayega.'), 'fact_mismatch');
  held(judge('Que se passe-t-il en cas de risque de stratégie ? Le compte sera fermé.'), 'fact_mismatch');
  held(judge('¿Qué pasa con el riesgo de estrategia? La cuenta se cierra.'), 'fact_mismatch');
  held(judge('रणनीति जोखिम पर क्या होगा? अकाउंट बंद हो जाएगा।'), 'fact_mismatch');
  held(judge('Что будет при стратег риск? Аккаунт закроется.'), 'fact_mismatch');
  held(judge('ماذا يحدث عند مخاطر الاستراتيجية؟ يغلق الحساب.'), 'fact_mismatch');
  held(judge('سٹریٹیجی رسک پر کیا ہوگا؟ اکاؤنٹ بند ہو جائے گا۔'), 'fact_mismatch');
  allowed(judge('Band ho jayega.'), 'no_claim');
});

test('weekend rules allow holding and block termination', () => {
  allowed(judge("Funded weekend trading resets the account and forfeits the current cycle's profit."), '17437306');
  allowed(judge('Weekend trading never terminates the account.'), '17437306');
  allowed(judge('Trading on Saturday without the add-on is not allowed.'), '17437306');
  allowed(judge('Trading on Sunday with the add-on is allowed.'), '17437306');
  allowed(judge('Trading over the weekend is not allowed without the add-on.'), '17437306');
  allowed(judge('You may hold a position over the weekend.'), '17437306');
  allowed(judge('Moving stop loss and take profit over the weekend is allowed.'), '17437306');
  held(judge('Weekend trading terminates the account.'), 'fact_mismatch');
  held(judge('Holding over the weekend is not allowed.'), 'fact_mismatch');
  held(judge('Weekend holding has the same outcome as weekend trading.'), 'fact_mismatch');
});

test('Rise and crypto amounts are the published pairs only', () => {
  allowed(judge('The Rise fee is $40 for withdrawals of $500 or more.'), '17437354');
  allowed(judge('Rise is for $500 or more.'), '17437354');
  allowed(judge('The Rise fee is $40.'), '17437354');
  allowed(judge('A Rise withdrawal of $4,800 arrives as $4,760.'), '17437354');
  allowed(judge('The crypto fee is 3% on any amount.'), '17437354');
  allowed(judge('Crypto is the only method below $500.'), '17437354');
  allowed(judge('A $400 crypto withdrawal arrives as $388.'), '17437354');
  allowed(judge('Approved rewards are paid within 5 business days.'), '17437354');
  allowed(judge('The bank transfer takes 1-3 days.'), '17437354');
  allowed(judge('Review is completed within 30 days.'), '17437354');
  allowed(judge('It can return to the original payment method.'), '17437354');
  held(judge('A Rise withdrawal of $4,800 arrives as $4,700.'), 'fact_mismatch');
  held(judge('A Rise withdrawal of $1,000 arrives as $960.'), 'fact_mismatch');
  held(judge('A $400 crypto withdrawal arrives as $380.'), 'fact_mismatch');
  held(judge('The crypto fee is 5%.'), 'fact_mismatch');
  held(judge('Crypto is capped at 500 USD.'), 'fact_mismatch');
  held(judge('Rise has no withdrawal limit.'), 'fact_mismatch');
  held(judge('The Rise fee is $25.'), 'fact_mismatch');
  held(judge('Any amount is allowed on Rise.'), 'fact_mismatch');
});

test('reset eligibility, prices, doubling, and the dashboard match 17437410', () => {
  allowed(judge('The account can be reset in profit.'), 'owner_final');
  allowed(judge('A reset is allowed only at breakeven or in profit.'), 'owner_final');
  allowed(judge('You cannot reset in a loss.'), 'owner_final');
  allowed(judge('You can reset only at breakeven, not while losing.'), 'owner_final');
  allowed(judge('You can reset from Trading Objectives on your dashboard.'), '17437410');
  allowed(judge('The reset prices are $228, then $456, then $912.'), '17437410');
  allowed(judge('A 1-Step $100,000 bought at $569 resets for $228, then $456, then $912.'), '17437410');
  allowed(judge('The first reset is 40% of the original price, minimum $10.'), '17437410');
  allowed(judge('Later resets double.'), '17437410');
  allowed(judge('The second reset doubles the first.'), '17437410');
  allowed(judge('The third reset doubles the second.'), '17437410');
  allowed(judge('You can use up to 3 resets.'), '17437410');
  allowed(judge('No reset options on this account.'), '17437410');
  allowed(judge('The reset options button sits next to Credentials.'), '17437410');
  allowed(judge('You can reset in profit from the dashboard.'), 'approved_facts');
  allowed(judge('How can I reset?'), 'no_claim');
  allowed(judge('Can I reset while in drawdown?'), 'no_claim');
  allowed(judge('The trailing drawdown limit does not reset.'), 'no_claim');
  held(judge('The account can be reset.'), 'fact_mismatch');
  held(judge('The account can be reset while losing.'), 'fact_mismatch');
  held(judge('You can reset from the dashboard while losing.'), 'fact_mismatch');
  held(judge('How can I reset while losing, the account can be reset?'), 'fact_mismatch');
  held(judge('The reset prices are $569 and $228.'), 'fact_mismatch');
  held(judge('The reset costs 40% of the profit.'), 'fact_mismatch');
  held(judge('You can use 4 resets.'), 'fact_mismatch');
  held(judge('A reset is allowed only at breakeven or in profit, and the account is closed.'), 'fact_mismatch');
  held(judge('अकाउंट को लॉस में रीसेट किया जा सकता है।'), 'fact_mismatch');
});

test('Catalyst publishes its numbers and hedges erase, keep, and preserved', () => {
  allowed(judge('Catalyst daily loss is 3%.'), '17437215');
  allowed(judge('The Catalyst profit target is 8%.'), '17437215');
  allowed(judge('Catalyst consistency is 30%.'), '17437215');
  allowed(judge('Catalyst daily loss is 3% and consistency is 30%.'), '17437215');
  allowed(judge('The Catalyst profit target can be 5%, 8%, or 10%.'), '17437215');
  allowed(judge('The Catalyst stage 2 profit share is 85%.'), '17437215');
  allowed(judge('The Catalyst stage 3 reset price is $1,790.'), '17437215');
  allowed(judge('Each approved Catalyst payout closes your account and opens a fresh one at double the size.'), '17437215');
  allowed(judge('How does Catalyst work? Hello. The profit share is 85%.'), '17437215');
  allowed(judge('I can help with Catalyst.'), 'no_claim');
  held(judge('Catalyst erases the earlier stage profit.'), 'fact_mismatch');
  held(judge('Catalyst profit is kept.'), 'fact_mismatch');
  held(judge('The Catalyst profit is preserved.'), 'fact_mismatch');
  held(judge('The Catalyst share stays 85% and the profit is preserved.'), 'fact_mismatch');
  held(judge('What happens to Catalyst profit? Hello. The profit is kept.'), 'fact_mismatch');
});

test('soft breach is 30 percent and a repeat can reset', () => {
  allowed(judge('A soft-breach payout is 30%.'), '17437398');
  allowed(judge('A soft breach is still processed at a 30% profit split.'), '17437398');
  allowed(judge('A soft breach does not close the account.'), '17437398');
  allowed(judge('If a soft breach happens again, the account can be reset and its profit forfeited.'), '17437398');
  held(judge('A soft breach payout is 20%.'), 'fact_mismatch');
  held(judge('A soft breach closes the account.'), 'fact_mismatch');
});

test('fee refund follows 17437366', () => {
  allowed(judge('A fee refund is paid on the third payout for a 2-Step account that passed on the first attempt, was never reset, and had no soft breach.'), '17437366');
  allowed(judge('Catalyst has no fee refund.'), '17437366');
  allowed(judge('Instant Elite has no fee refund.'), '17437366');
  allowed(judge('Flash has no fee refund.'), '17437366');
  held(judge('Instant gets a fee refund.'), 'fact_mismatch');
  held(judge('Instant and 2-Step have no fee refund.'), 'fact_mismatch');
  held(judge('A fee refund is always paid.'), 'fact_mismatch');
});

test('previous profit, reversals, and source authority', () => {
  allowed(judge('Previous-cycle profit is not payable after a reset.'), 'owner_final');
  allowed(judge('Pichla munafa nahi milega.'), 'owner_final');
  allowed(judge('पिछला मुनाफा देय नहीं है।'), 'owner_final');
  allowed(judge("Le bénéfice précédent n'est pas payable."), 'owner_final');
  allowed(judge('El beneficio anterior no es pagadero.'), 'owner_final');
  allowed(judge('Предыдущая прибыль не выплачивается.'), 'owner_final');
  allowed(judge('Completed payouts are not reversed.'), 'owner_final');
  allowed(judge('The payout was not reversed.'), 'owner_final');
  allowed(judge('The Help Centre is primary and the repo FAQ is secondary.'), 'owner_final');
  held(judge('Previous-cycle profit is payable after a reset.'), 'fact_mismatch');
  held(judge('Previous profit is payable, fee नहीं.'), 'fact_mismatch');
  held(judge('The FAQ overrides the Help Centre.'), 'fact_mismatch');
  held(judge('Pichla munafa milega.'), 'fact_mismatch');
});

test('completions and hedges do not post the claim, and notes are scoped', () => {
  held(judge('Your reward was paid.'), 'fact_mismatch');
  held(judge('Your reward was paid, fee नहीं.'), 'fact_mismatch');
  held(judge('आपका भुगतान भेज दिया गया है।'), 'fact_mismatch');
  held(judge('Payout ho gaya hai.'), 'fact_mismatch');
  held(judge('Finance processed the withdrawal.'), 'fact_mismatch');
  held(judge('They took back the payout.'), 'fact_mismatch');
  const hedgePaid = guard.guardPublicBody("I can't confirm the payout was paid.", {});
  assert.strictEqual(hedgePaid.body, guard.CLIENT_MESSAGE);
  assert.ok(!/paid/i.test(hedgePaid.body));
  const hedgeTook = guard.guardPublicBody("I can't confirm they took back the payout.", {});
  assert.strictEqual(hedgeTook.body, guard.CLIENT_MESSAGE);
  assert.ok(!/took back/i.test(hedgeTook.body));
  held(judge("I can't confirm that. A Strategy Risk breach ends the account."), 'fact_mismatch');
  allowed(judge("I can't confirm that. Our team will confirm."), 'hedge_kept');

  allowed(judge('Your reward was paid, fee नहीं.', [
    { role: 'note', text: 'I confirmed your reward was paid. Fee नहीं' },
  ]), 'human_confirmed');
  held(judge('Your reward was paid.', [
    { role: 'note', text: 'I confirm the opposite: your reward was paid.' },
  ]), 'fact_mismatch');
  held(judge('Your reward was paid.', [
    { role: 'note', text: 'Do not tell the client your reward was paid.' },
  ]), 'fact_mismatch');
  held(judge('Your reward was paid.', [
    { role: 'note', text: 'Your reward was paid is not true.' },
  ]), 'fact_mismatch');
  held(judge('Your reward was paid.', [
    { role: 'note', text: 'I did not verify your reward was paid.' },
  ]), 'fact_mismatch');
  held(judge('Your reward was paid.', [
    { role: 'note', text: 'your reward was paid' },
  ]), 'fact_mismatch');
  held(judge('Your reward was paid.', [
    { role: 'client', text: 'I confirmed your reward was paid.' },
  ]), 'fact_mismatch');
  held(judge('They took back the payout.', [
    { role: 'note', text: 'I confirmed they took back the payout.' },
  ]), 'fact_mismatch');
});

test('beforeSend fails closed and a note can attest a completion', () => {
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
  assert.strictEqual(heldSend.body, guard.CLIENT_MESSAGE);

  const allowedSend = guard.guardPublicBody('Hello there.', {});
  assert.strictEqual(allowedSend.send, true);
  assert.strictEqual(allowedSend.replaced, false);
  assert.strictEqual(allowedSend.body, 'Hello there.');

  const messages = guard.partsToMessages([
    { part_type: 'comment', body: 'I confirmed your funds were sent.', author: { id: '1', type: 'user' } },
    { part_type: 'comment', body: 'I confirmed your funds were sent.', author: { id: '10118526', type: 'admin' } },
    { part_type: 'note', body: 'Checked: your funds were sent.', author: { id: '55', type: 'admin' } },
  ], ['10118526', '8052954']);
  assert.deepStrictEqual(messages.map((item) => item.role), ['client', 'bot', 'note']);
  allowed(judge('Your funds were sent.', messages), 'human_confirmed');
});

test('proposed diff braces the postgate branch and guards early returns', () => {
  const diffPath = path.join(__dirname, 'index.js.public-sends.diff');
  const diff = fs.readFileSync(diffPath, 'utf8');
  assert.ok(diff.startsWith('diff --git a/luna-current/01_runtime/index.js b/luna-current/01_runtime/index.js\n'));
  assert.ok(diff.includes('t800-payout-r11/payoutClaimGuard'));
  assert.ok(diff.includes('guardPublicBody'));
  assert.ok(diff.includes('payoutGuardPublicBody'));
  assert.ok(diff.includes('payoutGuardInsteadOfDrop'));
  assert.ok(diff.includes("I can't confirm that. Our team will confirm."));
  assert.ok(/identity recovery/i.test(diff));
  assert.ok(/Fin welcome/i.test(diff));
  assert.ok(/review-status/i.test(diff));
  assert.ok(/authorized-note/i.test(diff));
  assert.ok(/Auth-note REPLY/.test(diff));
  assert.ok(/greetBody/.test(diff));
  assert.ok(/personalBody/.test(diff));
  assert.ok(diff.includes('finalBody = payoutGuardPublicBody(finalBody, parts)'));
  assert.ok(diff.includes('partsOf(full)'));
  assert.ok(!/require\(\s*['"]\.\/statePresend/.test(diff));
  assert.ok(!/02_statePresend/.test(diff));
  assert.ok(!/__statePresend\s*\./.test(diff));
  assert.ok(!diff.includes('__presend.send'));
  const added = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
  const returns = added.filter((line) => /return\s+null/.test(line));
  assert.strictEqual(returns.length, 1);
  assert.ok(returns[0].includes('return null'));
  const posts = added.filter((line) => line.includes("postReply(conversationId, 'comment'"));
  assert.strictEqual(posts.length, 1);
  assert.ok(posts[0].includes('payoutGuardInsteadOfDrop') || diff.includes('function payoutGuardInsteadOfDrop'));
  assert.ok(added.filter((line) => line.includes('payoutGuardInsteadOfDrop(')).length >= 7);
  for (const marker of [
    'SKIP pre-send',
    'SKIP identical last public body',
    'REPEATED_DIRECT_REPLY_HELD',
    'REPEATED_DIRECT_REPLY_RETRY_FAILED',
    'SKIP post-rephrase',
    'SKIP final-boundary',
  ]) {
    const at = diff.indexOf(marker);
    assert.ok(at >= 0, marker);
    assert.ok(diff.slice(at, at + 400).includes('payoutGuardInsteadOfDrop'), marker);
  }
  const postgate = diff.split(/^@@/m).find((hunk) => hunk.includes('POSTGATE_SUPPRESSED'));
  assert.ok(postgate);
  assert.ok(postgate.includes('} else {'));
  assert.ok(!postgate.split('\n').some((line) => line.startsWith('+') && /return\s+null/.test(line)));
  assert.ok(postgate.includes('finalBody = payoutGuardPublicBody(finalBody, parts)'));
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
  assert.strictEqual(guard.evaluateResetRestoreClaim({ draft: 'Hello' }).approved, false);
});

console.log('t800-payout-r11', passed, 'passed');
