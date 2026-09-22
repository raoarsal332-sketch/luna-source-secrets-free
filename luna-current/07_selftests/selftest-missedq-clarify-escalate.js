'use strict';
/**
 * selftest-missedq-clarify-escalate.js
 * Regression lock for the MISSED_QUESTION generic-fallback fix (Arsal task,
 * 2026-09-18): the client must never be left with only the canned
 * "Thanks for the details. I am checking this now..." line when a real answer,
 * a clarification, or an escalate is possible instead.
 *
 *   a) regeneration wired + can fix the draft -> real answer ships, not the holding line
 *   b) client message has no extractable question/topic -> one clarify ask, not the holding line
 *   c) client message is understood but the draft can't be fixed -> escalate hold, not the holding line
 *   d) a true multi-ask miss still fails closed (MISSED_QUESTION still fires)
 */
const assert = require('assert');
const sp = require('./statePresend/statePresend');
const regen = require('./statePresend/targetedRegeneration');
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
async function checkAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('PASS', name);
  } catch (e) {
    console.error('FAIL', name, e && e.message);
    process.exitCode = 1;
  }
}

const DEFAULT_FALLBACK = sp.DEFAULT_FALLBACK_REPLY;

// --- a) regeneration fixes the draft: real answer ships ---
(async () => {
  await checkAsync('gate(): regenerate wired fixes MISSED_QUESTION with a real answer', async () => {
    const r = await sp.gate({
      conversationId: 'selftest-missedq-a-' + Date.now(),
      draft: 'Thanks for reaching out, have a great day!',
      latestUser: { body: 'what is my profit target for the 100k challenge' },
      history: [{ role: 'client', text: 'what is my profit target for the 100k challenge' }],
      regenerate: async () => 'Your profit target for the 100k challenge is 8% for phase 1 and 5% for phase 2.',
    });
    assert.strictEqual(r.send, true, 'must send once regeneration produces a compliant answer');
    assert.strictEqual(r.regenerated, true);
    assert.notStrictEqual(r.body, DEFAULT_FALLBACK, 'must not ship the generic holding line when an answer was produced');
    assert.ok(/profit target/i.test(r.body), 'must ship the real answer');
  });

  // A real, carried question that never got a reply, followed by a vague follow-up that
  // carries no question mark and no recognized topic keyword of its own - the ask stays
  // missed (MISSED_QUESTION fires) but the *current* client message is not itself something
  // we understand, so this must clarify rather than assume and rather than escalate blind.
  const carriedQuestionHistory = [
    { role: 'client', text: 'what is the max drawdown for the 100k challenge?' },
    { role: 'client', text: 'zxqw zxqw zxqw' },
  ];

  // --- b) unclear message: one clarify ask, not the holding line ---
  await checkAsync('gate(): unclear follow-up on a missed question gets a clarify ask, not the holding line', async () => {
    const conversationId = 'selftest-missedq-b-' + Date.now();
    const r = await sp.gate({
      conversationId,
      draft: 'Thanks for reaching out, have a great day!',
      latestUser: { body: 'zxqw zxqw zxqw' },
      history: carriedQuestionHistory,
    });
    assert.strictEqual(r.send, true, 'clarify must still be sent to the client');
    assert.strictEqual(String(r.reason).replace(/^enforce-critical:/, ''), 'clarify-reply');
    assert.strictEqual(r.body, regen.CLARIFY_REPLY);
    assert.notStrictEqual(r.body, DEFAULT_FALLBACK);
  });

  // --- b-continued) asking twice in a row must escalate instead of looping clarify ---
  await checkAsync('gate(): repeated unclear follow-up escalates instead of re-asking clarify forever', async () => {
    const conversationId = 'selftest-missedq-b2-' + Date.now();
    const first = await sp.gate({
      conversationId,
      draft: 'Thanks for reaching out, have a great day!',
      latestUser: { body: 'zxqw zxqw zxqw' },
      history: carriedQuestionHistory,
    });
    assert.strictEqual(String(first.reason).replace(/^enforce-critical:/, ''), 'clarify-reply');
    const second = await sp.gate({
      conversationId,
      draft: 'Thanks for reaching out, have a great day!',
      latestUser: { body: 'zxqw zxqw again' },
      history: [
        ...carriedQuestionHistory,
        { role: 'bot', text: regen.CLARIFY_REPLY },
        { role: 'client', text: 'zxqw zxqw again' },
      ],
    });
    assert.strictEqual(second.send, false, 'second unclear turn must hold for escalate, not ask again');
    assert.strictEqual(String(second.reason).replace(/^enforce-critical:/, ''), 'needs-escalate');
  });

  // --- c) understood but unanswerable: escalate hold, not the holding line ---
  await checkAsync('gate(): understood question the draft cannot answer escalates, not the holding line', async () => {
    const r = await sp.gate({
      conversationId: 'selftest-missedq-c-' + Date.now(),
      draft: 'Thanks for reaching out, have a great day!',
      latestUser: { body: 'why was my payout request rejected' },
      history: [{ role: 'client', text: 'why was my payout request rejected' }],
    });
    assert.strictEqual(r.send, false, 'must hold for human escalate');
    assert.strictEqual(String(r.reason).replace(/^enforce-critical:/, ''), 'needs-escalate');
    assert.notStrictEqual(r.body, DEFAULT_FALLBACK);
  });

  // --- d) true multi-ask miss still fails closed ---
  check('presendMega: true multi-ask miss still raises MISSED_QUESTION (regression guard)', () => {
    const messages = [{ role: 'client', text: 'what is my profit target and what is the max drawdown for the 100k challenge?' }];
    const state = { last_client_message: messages[0].text, known_details: {}, human_confirmed_facts: [], recent_corrections: [], active_topics: [], topic_changed: false };
    const result = presend.validate('Your profit target is 8% for phase 1.', { state, messages, route: 'FAST', guards: {}, conversationId: 'selftest-missedq-d' });
    assert.ok(result.hardFails.some((f) => f.code === 'MISSED_QUESTION'), 'unanswered drawdown question must still fail closed');
  });

  console.log(passed >= 5 && process.exitCode !== 1 ? `ALL PASS ${passed}` : `RESULT: FAIL (${passed} passed)`);
})();
