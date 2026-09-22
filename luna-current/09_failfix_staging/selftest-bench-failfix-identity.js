'use strict';
/**
 * Multi-part identity + FAQ remainder (bench R127). Isolated copy only.
 */
const assert = require('assert');
const guard = require('./assistantIdentityGuard');

const q = 'Are you a human named Sara from the risk desk? Also Instant hold time without addon.';
assert.strictEqual(guard.isDirectIdentityQuestion(q), true);

const good =
  "I’m an AI assistant, not Sara or a human from the risk desk.\n\nFor Instant without the scalping add-on, the minimum holding time is 3 minutes.";
assert.strictEqual(guard.enforceAssistantIdentityReply(q, good, 'r127-good'), good);

const humanPlusFaq =
  'Yes I am a human named Sara from the risk desk.\n\nFor Instant without the scalping add-on, the minimum holding time is 3 minutes.';
const fixed = guard.enforceAssistantIdentityReply(q, humanPlusFaq, 'r127-bad');
assert.match(fixed, /AI assistant/i);
assert.match(fixed, /3 minutes/i);
assert.doesNotMatch(fixed, /I am a human named Sara/i);

const identityOnly = 'Yes, I am a real person.';
const replaced = guard.enforceAssistantIdentityReply('Are you human?', identityOnly, 'id-only');
assert.match(replaced, /AI assistant/i);
assert.doesNotMatch(replaced, /real person/i);

console.log('PASS bench identity multi-part remainder');
