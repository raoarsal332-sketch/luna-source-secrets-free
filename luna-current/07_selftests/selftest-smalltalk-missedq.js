'use strict';
/**
 * selftest-smalltalk-missedq.js
 * Regression lock for the "what are you doing?" / small-talk MISSED_QUESTION bug
 * (live conv 215475986818995): pure bot-presence chitchat must never trigger
 * MISSED_QUESTION / the generic "checking this now" fallback, while real account/
 * payout/rules questions phrased similarly must still fail closed.
 */
const assert = require('assert');
const T = require('./statePresend/textUtils');
const multi = require('./statePresend/multiAskCompleteness');
const sp = require('./statePresend/statePresend');

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

// --- unit: isGreetingOrSmallTalk ---
const SMALLTALK = [
  'what are you doing ?',
  'what r u doing',
  'are you there',
  'you there ?',
  'anyone there?',
  'who are you',
  'are you a bot',
  'are you human',
  'is this a bot',
  'how atre you ?',
  'i said how are you ?',
  'hi',
  'Arsal ?',
  'Arsal',
  'Elite AI?',
];
for (const t of SMALLTALK) {
  check(`isGreetingOrSmallTalk true: ${JSON.stringify(t)}`, () => {
    assert.strictEqual(T.isGreetingOrSmallTalk(t), true);
  });
}

const REAL_ASKS = [
  'what are you doing with my payout request',
  'are you human enough to fix my account',
  'what is my profit target?',
  'how do I reset my account?',
];
for (const t of REAL_ASKS) {
  check(`isGreetingOrSmallTalk false: ${JSON.stringify(t)}`, () => {
    assert.strictEqual(T.isGreetingOrSmallTalk(t), false);
  });
}

// --- integration: statePresend.gate() ---
(async () => {
  check('gate(): chitchat "what are you doing ?" sends model draft unchanged', async () => {
    const draft = 'Just here to help with FundedElite questions! What can I do for you?';
    const r = await sp.gate({
      conversationId: 'selftest-smalltalk-1',
      draft,
      latestUser: { body: 'what are you doing ?' },
      history: [{ role: 'client', text: 'what are you doing ?' }],
    });
    assert.strictEqual(r.send, true);
    assert.strictEqual(r.reason, 'ok');
    assert.strictEqual(r.body, draft);
  });

  const chitchatChecks = [
    'are you there',
    'who are you',
    'are you a bot',
  ].map((userText) => async () => {
    const draft = 'Sure thing! How can I help you today?';
    const r = await sp.gate({
      conversationId: 'selftest-smalltalk-2-' + userText.replace(/\W+/g, '_'),
      draft,
      latestUser: { body: userText },
      history: [{ role: 'client', text: userText }],
    });
    assert.strictEqual(r.send, true, `send for ${JSON.stringify(userText)}`);
    assert.strictEqual(r.body, draft, `unchanged body for ${JSON.stringify(userText)}`);
  });

  for (const fn of chitchatChecks) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      fn().then(() => { passed += 1; console.log('PASS gate(): chitchat variant'); resolve(); })
        .catch((e) => { console.error('FAIL gate(): chitchat variant', e && e.message); process.exitCode = 1; resolve(); });
    });
  }

  await new Promise((resolve) => {
    (async () => {
      const r = await sp.gate({
        conversationId: 'selftest-smalltalk-trap',
        draft: 'Thanks for reaching out, have a great day!',
        latestUser: { body: 'what are you doing with my payout request' },
        history: [{ role: 'client', text: 'what are you doing with my payout request' }],
      });
      // Real, understood question that the draft never answers and that regeneration
      // (no `regenerate` wired in this test) cannot fix: must escalate to a human, never
      // ship the generic "checking this now" line and never ship the bad draft unchanged.
      assert.strictEqual(r.send, false, 'must hold, not send, when handing off to a human');
      assert.strictEqual(String(r.reason).replace(/^enforce-critical:/, ''), 'needs-escalate', 'must route to the escalate path, not the generic fallback');
      assert.ok(r.result && r.result.hardFails.some((f) => f.code === 'MISSED_QUESTION'), 'real question still fails closed with MISSED_QUESTION');
      assert.notStrictEqual(r.body, 'Thanks for reaching out, have a great day!', 'bad draft must not ship unchanged');
    })().then(() => { passed += 1; console.log('PASS gate(): real question stays fail-closed'); resolve(); })
      .catch((e) => { console.error('FAIL gate(): real question stays fail-closed', e && e.message); process.exitCode = 1; resolve(); });
  });

  // Generic capability question ("what services do you offer") must be considered covered
  // by a substantive, on-topic answer even though it does not literally repeat "services"/
  // "guys" - live conv 215475986818995 kept re-firing MISSED_QUESTION on unrelated later
  // turns (e.g. "Arsal ?") because this carried question was never marked covered.
  check('isCovered(): generic offerings question covered by substantive on-topic reply', () => {
    const covered = multi.isCovered(
      'What services do you guys offer ?',
      'We offer evaluation challenges (1-Step, 2-Step, Instant, Instant Elite) that let you trade a funded account after passing.'
    );
    assert.strictEqual(covered, true);
  });
  check('isCovered(): real specific question still needs real overlap', () => {
    const covered = multi.isCovered('what is my profit target for 100k', 'We are checking on that.');
    assert.strictEqual(covered, false);
  });

  await new Promise((resolve) => {
    (async () => {
      // Exact reported sequence: a good services answer already given, then "Arsal ?" -
      // must pass through with the model's own reply, not the generic fallback.
      const r = await sp.gate({
        conversationId: 'selftest-arsal-after-services',
        draft: "Hi, this is Luna, FundedElite's assistant! How can I help you?",
        latestUser: { body: 'Arsal ?' },
        history: [
          { role: 'client', text: 'What services do you guys offer ?' },
          { role: 'bot', text: 'We offer evaluation challenges (1-Step, 2-Step, Instant, Instant Elite) that let you trade a funded account after passing.' },
          { role: 'client', text: 'Arsal ?' },
        ],
      });
      assert.strictEqual(r.send, true);
      assert.strictEqual(r.reason, 'ok');
    })().then(() => { passed += 1; console.log('PASS gate(): "Arsal ?" after a good services answer sends unchanged'); resolve(); })
      .catch((e) => { console.error('FAIL gate(): "Arsal ?" after a good services answer sends unchanged', e && e.message); process.exitCode = 1; resolve(); });
  });

  console.log(process.exitCode ? 'RESULT: FAIL' : `ALL PASS ${passed}`);
})();
