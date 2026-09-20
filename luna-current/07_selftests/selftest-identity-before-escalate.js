'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const idGates = require('./identityEscalateGates');
const ero = require('./escalateRelatedOnly');

const src = fs.readFileSync('./index.js', 'utf8');
const detectorMatch = src.match(/function isClearlyAccountSpecificIssue\(text\) \{[\s\S]*?\n\}/);
assert.ok(detectorMatch, 'account-specific detector found');
const box = {};
vm.createContext(box);
vm.runInContext(detectorMatch[0], box);

assert.strictEqual(box.isClearlyAccountSpecificIssue('My payout says not eligible. Please try again.'), true);
assert.strictEqual(box.isClearlyAccountSpecificIssue("I can't login because the password is wrong"), true);
assert.strictEqual(box.isClearlyAccountSpecificIssue('How do payouts normally work?'), false);

const missing = idGates.pickAccountEmailAsk({ kind: 'ACCOUNT' });
assert.strictEqual(missing.ready, false);
assert.strictEqual(missing.ask, 'account');

const known = idGates.pickAccountEmailAsk({ kind: 'ACCOUNT', accountNumber: '211234' });
assert.strictEqual(known.ready, true);
assert.strictEqual(known.reason, 'account_sufficient');

const declined = idGates.pickAccountEmailAsk({ kind: 'ACCOUNT', declinedAccount: true });
assert.strictEqual(declined.ready, true);

const stale = ero.decideEscalateAwaitingGate({
  awaitingFirstTeammate: true,
  lastEscalateProblem: 'Hello arsal ?',
  userText: 'payout says not eligible on my other account',
});
assert.strictEqual(stale.action, 'FALLTHROUGH');
assert.strictEqual(stale.supersedesAwaiting, true);

assert.ok(src.includes('async function ensureIdentityBeforeAccountEscalate'));
assert.ok((src.match(/ensureIdentityBeforeAccountEscalate\(\{/g) || []).length >= 3);
assert.ok(src.indexOf('IDENTITY_BEFORE_ESCALATE asked missing') < src.indexOf("let clientMsg = postProcessModelReply(\n          \"I've forwarded this to a teammate"));
assert.ok(src.includes('conversation_already_assigned_to_assignee'));
assert.strictEqual((src.match(/await assignToTeammate\(conversationId, built\.assigneeId\)/g) || []).length, 0);

const helperStart = src.indexOf('async function ensureIdentityBeforeAccountEscalate');
const helperEnd = src.indexOf('\nconst TICKET_STATE_FILE', helperStart);
assert.ok(helperStart > 0 && helperEnd > helperStart, 'shared identity gate source found');

(async () => {
  const asks = [];
  const missingBox = {
    console,
    collectEscalateIds: () => ({ account: '', email: '' }),
    resolveIdentityAskDecision: () => ({
      needAccount: true,
      needEmail: false,
      decision: { reason: 'both_missing_ask_account' },
    }),
    fetchConversation: async () => ({ conversation_parts: { conversation_parts: [] } }),
    pickAccountEmailAsk: () => 'Please share your account number.',
    preSendIdentityCheck: () => ({ ok: true }),
    postClientCommentOnce: async (...args) => asks.push(args),
  };
  vm.createContext(missingBox);
  vm.runInContext(src.slice(helperStart, helperEnd), missingBox);
  const asked = await missingBox.ensureIdentityBeforeAccountEscalate({
    conversationId: 'test-a',
    full: {},
    bits: {},
    text: 'payout says not eligible',
    kind: 'ACCOUNT',
    latestUser: {},
    clientName: 'Test',
  });
  assert.strictEqual(asked.ready, false);
  assert.strictEqual(asked.asked, true);
  assert.strictEqual(asks.length, 1);

  let knownAskCount = 0;
  const knownBox = {
    console,
    collectEscalateIds: () => ({ account: '211234', email: '' }),
    resolveIdentityAskDecision: () => ({
      needAccount: false,
      needEmail: false,
      decision: { reason: 'account_sufficient' },
    }),
    fetchConversation: async () => { throw new Error('must not refetch when ready'); },
    pickAccountEmailAsk: () => { throw new Error('must not ask when account is known'); },
    preSendIdentityCheck: () => ({ ok: true }),
    postClientCommentOnce: async () => { knownAskCount += 1; },
  };
  vm.createContext(knownBox);
  vm.runInContext(src.slice(helperStart, helperEnd), knownBox);
  const ready = await knownBox.ensureIdentityBeforeAccountEscalate({
    conversationId: 'test-b',
    full: {},
    bits: {},
    text: 'wrong password',
    kind: 'ACCOUNT',
  });
  assert.strictEqual(ready.ready, true);
  assert.strictEqual(ready.ids.account, '211234');
  assert.strictEqual(knownAskCount, 0);

  console.log('ALL PASS identity-before-escalate');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
