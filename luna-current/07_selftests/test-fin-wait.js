'use strict';
/**
 * Fin / Elite wait gate selftest (soft-edges v1).
 * Tests softEdges reference gate + phrase expanders.
 * On VPS, after wiring, live shouldWaitForFin should match these outcomes.
 */
const assert = require('assert');
const se = require('./softEdges');

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

const now = Date.now();
function elitePart(body, ageSec = 30) {
  return {
    author: { name: 'Elite AI', type: 'bot' },
    body,
    created_at: Math.floor((now - ageSec * 1000) / 1000),
    elite: true,
  };
}
function userPart(body) {
  return { author: { type: 'user', name: 'Client' }, body, created_at: Math.floor(now / 1000) };
}

check('user.created → wait', () => {
  const r = se.shouldWaitForFin({ topic: 'conversation.user.created', parts: [] });
  assert.strictEqual(r.wait, true);
  assert.strictEqual(r.reason, 'user_created');
});

check('Elite owns, no live-agent → wait', () => {
  const r = se.shouldWaitForFin({
    topic: 'conversation.user.replied',
    latestUserText: 'What is the profit target?',
    parts: [elitePart('The phase 1 profit target is 8%.')],
  });
  assert.strictEqual(r.wait, true);
  assert.strictEqual(r.reason, 'elite_owns_no_handoff');
});

check('client "No, I need a live agent" → do not wait', () => {
  const r = se.shouldWaitForFin({
    topic: 'conversation.user.replied',
    latestUserText: 'No, I need a live agent',
    parts: [elitePart('Can I help with anything else?')],
  });
  assert.strictEqual(r.wait, false);
  assert.strictEqual(r.reason, 'client_requested_live_agent');
});

check('Italian live-agent ask → do not wait', () => {
  const r = se.shouldWaitForFin({
    topic: 'conversation.user.replied',
    latestUserText: 'Vorrei parlare con un operatore umano',
    parts: [elitePart('Ciao! Come posso aiutarti?')],
  });
  assert.strictEqual(r.wait, false);
  assert.strictEqual(r.reason, 'client_requested_live_agent');
});

check('Fin handoff phrase in history → do not wait', () => {
  const r = se.shouldWaitForFin({
    topic: 'conversation.user.replied',
    latestUserText: 'ok thanks',
    parts: [
      elitePart("I'm connecting you with a teammate who can help."),
      userPart('ok thanks'),
    ],
  });
  assert.strictEqual(r.wait, false);
  assert.ok(
    r.reason === 'fin_handoff_phrase' || r.reason === 'no_wait',
    'expected handoff clear, got ' + r.reason
  );
});

check('Arsal assigned but Elite still owning, no handoff → still wait', () => {
  const r = se.shouldWaitForFin({
    topic: 'conversation.user.replied',
    latestUserText: 'any update?',
    arsalAssigned: true,
    parts: [elitePart('We are still checking your account.')],
  });
  assert.strictEqual(r.wait, true);
  assert.ok(
    r.reason === 'elite_owns_no_handoff' || r.reason === 'arsal_assigned_but_elite_owns',
    r.reason
  );
});

if (process.exitCode) {
  console.error('FIN-WAIT SELFTEST FAILED', passed, 'passed before failure');
  process.exit(1);
}
console.log('ALL PASS', passed);
