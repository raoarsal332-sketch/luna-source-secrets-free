'use strict';
/**
 * selftest-identity-question-not-human-request.js
 * Regression lock for the MISSED_ESCALATION false positive found by the QA audit
 * (2026-09-19, luna-qa scenario ID-01-are-you-ai).
 *
 * presendMega's CLIENT_WANTS_HUMAN_RE carries a bare `real\s*(?:person|human|agent)`
 * alternative, so "Are you a real person or a bot?" was read as a request for a human
 * teammate. Luna's draft was the honest, policy-mandated answer ("I'm an AI assistant
 * for FundedElite support"), but MISSED_ESCALATION fired, the answer was discarded and
 * the client was handed to a teammate instead.
 *
 * Asking WHAT Luna is must be answered; asking FOR a human must still escalate.
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

function missedEscalation(draft, clientText) {
  const messages = [{ role: 'client', text: clientText }];
  const state = {
    last_client_message: clientText,
    known_details: {},
    human_confirmed_facts: [],
    recent_corrections: [],
    active_topics: [],
    topic_changed: false,
  };
  const result = presend.validate(draft, {
    state,
    messages,
    route: 'FAST',
    guards: {},
    conversationId: 'selftest-identity-question-not-human-request',
  });
  return (result.hardFails || []).some((f) => f.code === presend.HARD.MISSED_ESCALATION);
}

const AI_ANSWER = "I'm an AI assistant for FundedElite support. How can I help you today?";

// --- identity questions: answer them, do not escalate ---
check('"are you a real person or a bot?" -> honest AI answer must not raise MISSED_ESCALATION', () => {
  assert.strictEqual(missedEscalation(AI_ANSWER, 'Are you a real person or a bot?'), false);
});

check('"are you a real person?" -> honest AI answer must not raise MISSED_ESCALATION', () => {
  assert.strictEqual(missedEscalation(AI_ANSWER, 'are you a real person?'), false);
});

check('"is this a real human or AI?" -> honest AI answer must not raise MISSED_ESCALATION', () => {
  assert.strictEqual(missedEscalation(AI_ANSWER, 'Is this a real human or AI?'), false);
});

// --- genuine handoff requests: must still fail closed ---
check('"I want to speak to a real person" -> FAQ draft must still raise MISSED_ESCALATION', () => {
  assert.strictEqual(
    missedEscalation('The profit target for the 100k challenge is 8% in phase 1.', 'I want to speak to a real person'),
    true
  );
});

check('"can I talk to a real agent please" -> FAQ draft must still raise MISSED_ESCALATION', () => {
  assert.strictEqual(
    missedEscalation('The daily loss limit is 5% of the account size.', 'can I talk to a real agent please'),
    true
  );
});

check('"connect me to a live agent" -> FAQ draft must still raise MISSED_ESCALATION', () => {
  assert.strictEqual(
    missedEscalation('Your payouts are processed through Rise.', 'connect me to a live agent'),
    true
  );
});

check('identity question still escalates when the draft ignores it and the client also wants a manager', () => {
  assert.strictEqual(
    missedEscalation('The profit split is 80%.', 'are you a bot? I want a manager please'),
    true
  );
});

console.log(passed === 7 && process.exitCode !== 1 ? `ALL PASS ${passed}` : `RESULT: FAIL (${passed} passed)`);
