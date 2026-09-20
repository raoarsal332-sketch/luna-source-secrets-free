'use strict';
/**
 * selftest-wrongtopic-client-raised-reset.js
 * Regression lock for the WRONG_TOPIC false positive found by the QA audit
 * (2026-09-19, luna-qa scenario POLICY-13-second-chance-split).
 *
 * presendMega's "hard payout intent must not get a reset/retry draft" rule fired
 * whenever the client message carried the payout topic and the draft mentioned
 * reset/retry — without checking whether the CLIENT had raised reset/retry in the
 * same message. So a correct answer to "I got a free retry, does my 80% split stay?"
 * ("the split becomes 50%") was blocked as off-topic and escalated to a human,
 * although its topics matched the client's exactly.
 *
 *   a) client raises BOTH payout and free retry -> on-topic draft must pass
 *   b) client raises ONLY payout, draft pushes reset/retry -> must still fail closed
 */
const assert = require('assert');
const presend = require('./statePresend/presendMega');

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

function validate(draft, clientText) {
  const messages = [{ role: 'client', text: clientText }];
  const state = {
    last_client_message: clientText,
    known_details: {},
    human_confirmed_facts: [],
    recent_corrections: [],
    active_topics: [],
    topic_changed: false,
  };
  return presend.validate(draft, {
    state,
    messages,
    route: 'FULL',
    guards: {},
    conversationId: 'selftest-wrongtopic-client-raised-reset',
  });
}

function wrongTopicFails(result) {
  return (result.hardFails || []).filter((f) => f.code === presend.HARD.WRONG_TOPIC);
}

// --- a) the false positive: client raised the free retry themselves ---
check('client raised free retry + payout split -> on-topic answer must NOT be WRONG_TOPIC', () => {
  const clientText = 'I got a free retry after breaching. Does my 80% profit split stay the same?';
  const draft =
    'No. Once you use the free retry, the profit split becomes **50% on all future payouts**, even if your original split was 80%.';
  const fails = wrongTopicFails(validate(draft, clientText));
  assert.strictEqual(
    fails.length,
    0,
    'draft answers the client\'s own payout+free-retry question; got: ' + fails.map((f) => f.why || f.message).join(' | ')
  );
});

check('client asked about second chance split in other wording -> still not WRONG_TOPIC', () => {
  const clientText = 'after my second chance reset, what profit split do I get on withdrawals?';
  const draft = 'Second chance accounts are capped at a 50% profit split on all future payouts.';
  const fails = wrongTopicFails(validate(draft, clientText));
  assert.strictEqual(fails.length, 0, 'client raised the reset topic themselves');
});

// --- b) the real defect the rule exists for must still fail closed ---
check('client asked ONLY about payout, draft pushes reset/retry -> must still fail closed', () => {
  const clientText = 'Where is my payout? I requested it 5 days ago and nothing arrived.';
  const draft =
    'You can reset your account from the dashboard and start a free retry whenever you are ready.';
  const fails = wrongTopicFails(validate(draft, clientText));
  assert.ok(fails.length >= 1, 'off-topic reset/retry draft on a pure payout question must fail closed');
});

check('client asked ONLY about withdrawal, draft name-checks payout but pushes retry -> still fail closed', () => {
  const clientText = 'my withdrawal is still pending, can you check it';
  const draft =
    'Your payout is noted. In the meantime you can restart your account with a retry and keep trading.';
  const fails = wrongTopicFails(validate(draft, clientText));
  assert.ok(fails.length >= 1, 'lightly name-checking payout must not excuse a reset/retry push');
});

console.log(passed === 4 && process.exitCode !== 1 ? `ALL PASS ${passed}` : `RESULT: FAIL (${passed} passed)`);
