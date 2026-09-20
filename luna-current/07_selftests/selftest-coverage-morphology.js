'use strict';
/**
 * selftest-coverage-morphology.js
 * Regression lock for the MISSED_QUESTION false positive found by the QA audit
 * (2026-09-19, luna-qa scenario CALC-02-2step-dll-dollars).
 *
 * multiAskCompleteness.isCovered() decides whether a draft answers a client ask by
 * word overlap at a 0.45 threshold. The shared stemmer only strips (ing|ed|es|s|e),
 * so it cannot join the domain word-pairs clients and answers routinely swap:
 * "lose" vs "loss", "day" vs "daily", "withdraw" vs "withdrawal". A draft that
 * fully answered "how much can I lose in one day before I breach?" with
 * "the daily loss limit is 5% ... that is $2,500" scored 0.25 and was reported as
 * an unanswered question, so the correct answer was blocked and escalated to a
 * human instead of being sent.
 *
 * The repair must raise recall WITHOUT weakening the gate: a draft that only
 * echoes the topic and states no answer must still count as missed.
 */
const assert = require('assert');
const multiAsk = require('./statePresend/multiAskCompleteness');

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

// --- must now be COVERED (the false positives) ---
check('daily loss answer covers a "how much can I lose in one day" ask', () => {
  const ask = 'How much can I lose in one day before I breach?';
  const draft =
    'On a 2-Step account, the daily loss limit is 5% of the account size. For a $50,000 account, that is $2,500. The limit is based on the higher of your end-of-day equity or balance, and breaching it even slightly can fail the account.';
  assert.strictEqual(multiAsk.isCovered(ask, draft), true);
});

check('withdrawal answer covers a "when can I withdraw" ask', () => {
  const ask = 'When can I withdraw my profits?';
  const draft =
    'Your first withdrawal is requestable 21 days after the account is funded, and later payouts follow the cycle you selected at checkout.';
  assert.strictEqual(multiAsk.isCovered(ask, draft), true);
});

check('holding-time answer covers a "how long must I hold" ask', () => {
  const ask = 'How long do I need to hold a trade?';
  const draft =
    'The minimum holding time is 3 minutes per trade, or 30 seconds if you purchased the scalping add-on.';
  assert.strictEqual(multiAsk.isCovered(ask, draft), true);
});

check('an AI disclosure covers an "are you a real person or a bot?" ask', () => {
  const ask = 'Are you a real person or a bot?';
  const draft = "I'm an AI assistant for FundedElite support. How can I help you today?";
  assert.strictEqual(multiAsk.isCovered(ask, draft), true);
});

check('hyphenated product name + max/maximum: "lite 1 step" ask is covered by "Lite 1-Step ... maximum"', () => {
  const ask = 'what is the max drawdown on the lite 1 step?';
  const draft = 'The **Lite 1-Step** challenge has a selectable maximum drawdown of **5%, 6%, 7%, 8%, or 10%**. It is static, based on the original account balance.';
  assert.strictEqual(multiAsk.isCovered(ask, draft), true);
});

check('account-size wording: "200k" ask is covered by a "$200,000" answer', () => {
  assert.strictEqual(multiAsk.isCovered('Do you have a 200k Instant account?', 'Yes, FundedElite offers a **$200,000 Instant account**.'), true);
});

check('account-size wording: "200k" ask is covered by a "$200K" answer', () => {
  assert.strictEqual(multiAsk.isCovered('Do you have a 200k Instant account?', 'Yes, the $200K Instant is available.'), true);
});

// --- must still be MISSED (the gate must not be weakened) ---
check('a different account size is still missed', () => {
  assert.strictEqual(multiAsk.isCovered('Do you have a 200k Instant account?', 'Yes, we have a $100,000 Instant account.'), false);
});

check('same hyphen/max vocabulary but a different question is still missed', () => {
  const ask = 'what is the max drawdown on the lite 1 step?';
  const draft = 'The Lite 1-Step challenge has a profit split of 80% and pays out every 14 days.';
  assert.strictEqual(multiAsk.isCovered(ask, draft), false);
});

check('identity ask with no disclosure at all is still missed', () => {
  const ask = 'Are you a real person or a bot?';
  const draft = 'The profit target for the 100k challenge is 8% in phase 1.';
  assert.strictEqual(multiAsk.isCovered(ask, draft), false);
});

check('topic echo with no answer is still missed', () => {
  const ask = 'How much can I lose in one day before I breach?';
  const draft = 'Thanks for asking about your daily loss. Let me look into your account.';
  assert.strictEqual(multiAsk.isCovered(ask, draft), false);
});

check('answer to a different question is still missed', () => {
  const ask = 'What is the maximum drawdown on the 100k challenge?';
  const draft = 'The profit split on the Flash Activation live account is 80%.';
  assert.strictEqual(multiAsk.isCovered(ask, draft), false);
});

check('multi-ask: one answered, the other still missed', () => {
  const messages = [
    { role: 'client', text: 'what is my profit target and what is the max drawdown for the 100k challenge?' },
  ];
  const asks = multiAsk.extractAsks(messages);
  const questionAsks = [...asks.burst, ...asks.carried].filter((a) => a.kind === 'question');
  const cov = multiAsk.checkCoverage('Your profit target is 8% for phase 1.', questionAsks);
  assert.ok(cov.missed.length >= 1, 'the unanswered drawdown ask must still be reported missed');
});

console.log(passed === 13 && process.exitCode !== 1 ? `ALL PASS ${passed}` : `RESULT: FAIL (${passed} passed)`);
