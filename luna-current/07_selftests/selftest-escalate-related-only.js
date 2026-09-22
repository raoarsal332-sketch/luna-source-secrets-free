'use strict';

const assert = require('assert');
const ero = require('./escalateRelatedOnly');

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

const IP_PROBLEM =
  'Client IP mismatch / possible VPN — Risk review needed before reset. Account 12345.';

// --- Related → status-only ---
check('1a awaiting + any update on IP review → STATUS_ONLY', () => {
  const d = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'any update on my IP review?',
    lastEscalateProblem: IP_PROBLEM,
    lastEscalateTopic: 'ip_risk',
  });
  assert.strictEqual(d.action, 'STATUS_ONLY');
  assert.strictEqual(d.related, true);
  assert.ok(/status-only/i.test(d.log));
});

check('1b awaiting + how long / is my proof enough / reset now → STATUS_ONLY', () => {
  const cases = [
    'how long will this take?',
    'is my proof enough?',
    'can I reset now?',
  ];
  for (const userText of cases) {
    const d = ero.decideEscalateAwaitingGate({
      awaitingFirstTeammate: true,
      userText,
      lastEscalateProblem: IP_PROBLEM,
      lastEscalateTopic: 'ip_risk',
    });
    assert.strictEqual(d.action, 'STATUS_ONLY', userText);
  }
});

// --- Short ack → SKIP ---
check('2a awaiting + ok thanks → SKIP', () => {
  const d = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'ok thanks',
    lastEscalateProblem: IP_PROBLEM,
    lastEscalateTopic: 'ip_risk',
  });
  assert.strictEqual(d.action, 'SKIP');
  assert.ok(/short-ack/i.test(d.log));
});

check('2b awaiting + thanks / got it → SKIP', () => {
  assert.strictEqual(
    ero.decideEscalateAwaitingGate({
      awaitingFirstTeammate: true,
      userText: 'thanks',
      lastEscalateProblem: IP_PROBLEM,
    }).action,
    'SKIP'
  );
  assert.strictEqual(
    ero.decideEscalateAwaitingGate({
      awaitingFirstTeammate: true,
      userText: 'got it',
      lastEscalateProblem: IP_PROBLEM,
    }).action,
    'SKIP'
  );
});

// --- Unrelated clear FAQ → NOT status-only ---
check('3a awaiting + what is catalyst challenge? → FALLTHROUGH (not status-only)', () => {
  const d = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'what is catalyst challenge?',
    lastEscalateProblem: IP_PROBLEM,
    lastEscalateTopic: 'ip_risk',
  });
  assert.strictEqual(d.action, 'FALLTHROUGH');
  assert.strictEqual(d.clearFaq, true);
  assert.strictEqual(d.related, false);
  assert.ok(!/status-only/i.test(d.log) || /fallthrough/i.test(d.log));
});

check('3b awaiting + what is SEP35? → FALLTHROUGH', () => {
  const d = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'what is SEP35?',
    lastEscalateProblem: IP_PROBLEM,
    lastEscalateTopic: 'ip_risk',
  });
  assert.strictEqual(d.action, 'FALLTHROUGH');
  assert.strictEqual(d.clearFaq, true);
});

check('3c awaiting + lite vs standard features → FALLTHROUGH', () => {
  const d = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'difference between lite and standard features?',
    lastEscalateProblem: IP_PROBLEM,
    lastEscalateTopic: 'ip_risk',
  });
  assert.strictEqual(d.action, 'FALLTHROUGH');
  assert.ok(ero.isClearKbFaqAsk('difference between lite and standard features?'));
});

check('3d awaiting + general leverage ask → FALLTHROUGH', () => {
  const d = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'what leverage do you offer?',
    lastEscalateProblem: IP_PROBLEM,
    lastEscalateTopic: 'ip_risk',
  });
  assert.strictEqual(d.action, 'FALLTHROUGH');
});

// --- Not awaiting / gate clear ---
check('4a not awaiting → FALLTHROUGH', () => {
  const d = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: false,
    userText: 'any update on my IP review?',
    lastEscalateProblem: IP_PROBLEM,
  });
  assert.strictEqual(d.action, 'FALLTHROUGH');
  assert.strictEqual(d.reason, 'not_awaiting');
});

check('4b after teammate public reply → gate clears', () => {
  const state = {
    escalateAwaitingFirstTeammate: true,
    lastEscalateAt: 1000,
    lastEscalateProblem: IP_PROBLEM,
    lastEscalateTopic: 'ip_risk',
  };
  const parts = [
    {
      part_type: 'comment',
      created_at: 2000,
      author: { type: 'admin', id: '999888' },
      body: 'Hi, we are checking the IP with Risk now.',
    },
  ];
  const d = ero.evaluateFromConvState(state, 'any update?', parts, {
    arsalId: '111',
    eliteAiId: '222',
  });
  assert.strictEqual(d.cleared, true);
  assert.strictEqual(state.escalateAwaitingFirstTeammate, false);
  assert.strictEqual(d.action, 'FALLTHROUGH');
  assert.strictEqual(d.reason, 'teammate_replied_gate_cleared');
});

check('4c Luna/Arsal reply does NOT clear awaiting', () => {
  const state = {
    escalateAwaitingFirstTeammate: true,
    lastEscalateAt: 1000,
    lastEscalateProblem: IP_PROBLEM,
  };
  const parts = [
    {
      part_type: 'comment',
      created_at: 2000,
      author: { type: 'admin', id: '111' },
      body: 'Our team has already been informed...',
    },
  ];
  const d = ero.evaluateFromConvState(state, 'any update on my IP?', parts, {
    arsalId: '111',
    eliteAiId: '222',
  });
  assert.strictEqual(d.cleared, false);
  assert.strictEqual(state.escalateAwaitingFirstTeammate, true);
  assert.strictEqual(d.action, 'STATUS_ONLY');
});

// --- Status reply bank ---
check('5a pickEscalateStatusReply varies and never invents outcomes', () => {
  const a = ero.pickEscalateStatusReply(0);
  const b = ero.pickEscalateStatusReply(1);
  assert.ok(a && b);
  assert.notStrictEqual(a, b);
  for (const line of ero.STATUS_ONLY_REPLIES) {
    assert.ok(!/approved|rejected|reset completed|risk cleared/i.test(line));
    assert.ok(/team|reviewing|review|update/i.test(line));
  }
});

// --- Context builder ---
check('6a buildEscalateContext detects ip_risk topic', () => {
  const ctx = ero.buildEscalateContext({
    problem: IP_PROBLEM,
    noteBody: 'ESCALATE to Risk — IP mismatch',
  });
  assert.strictEqual(ctx.lastEscalateTopic, 'ip_risk');
  assert.ok(ctx.lastEscalateProblem.includes('IP'));
});

check('6b unrelated non-FAQ still FALLTHROUGH (not status-only)', () => {
  const d = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'can you also change my registered phone number?',
    lastEscalateProblem: IP_PROBLEM,
    lastEscalateTopic: 'ip_risk',
  });
  assert.strictEqual(d.action, 'FALLTHROUGH');
  assert.strictEqual(d.reason, 'unrelated_other');
  assert.strictEqual(d.supersedesAwaiting, true);
});

check('6c handoff-only Arsal lock + payout issue supersedes awaiting', () => {
  const d = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'My payout says not eligible. Please try again.',
    lastEscalateProblem: 'Hello arsal ?',
  });
  assert.strictEqual(d.action, 'FALLTHROUGH');
  assert.strictEqual(d.related, false);
  assert.strictEqual(d.supersedesAwaiting, true);
});

check('6d status wording naming a different topic supersedes awaiting', () => {
  const d = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'Any update on why my payout is not eligible?',
    lastEscalateProblem: IP_PROBLEM,
    lastEscalateTopic: 'ip_risk',
  });
  assert.strictEqual(d.action, 'FALLTHROUGH');
  assert.strictEqual(d.related, false);
  assert.strictEqual(d.supersedesAwaiting, true);
});

check('6e same payout follow-up remains STATUS_ONLY', () => {
  const d = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'Any update on why my payout is not eligible?',
    lastEscalateProblem: 'Payout is not eligible and says please try again.',
    lastEscalateTopic: 'payout',
  });
  assert.strictEqual(d.action, 'STATUS_ONLY');
  assert.strictEqual(d.related, true);
  assert.strictEqual(d.supersedesAwaiting, false);
});

check('6f unrelated clear FAQ keeps prior awaiting lock armed', () => {
  const d = ero.decideEscalateAwaitingGate({
    awaitingFirstTeammate: true,
    userText: 'What is SEP35?',
    lastEscalateProblem: IP_PROBLEM,
    lastEscalateTopic: 'ip_risk',
  });
  assert.strictEqual(d.action, 'FALLTHROUGH');
  assert.strictEqual(d.clearFaq, true);
  assert.strictEqual(d.supersedesAwaiting, false);
});

check('7 engine id tag present', () => {
  assert.ok(/escalate-related-only-v1/.test(ero.ENGINE_ID));
});

if (!process.exitCode) {
  console.log('ALL PASS', passed);
} else {
  console.error('FAILED; passed=', passed);
  process.exit(1);
}
