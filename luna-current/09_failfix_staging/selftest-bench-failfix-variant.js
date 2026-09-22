'use strict';
/**
 * Regression from luna-reasoning-bench-20260922 none-failures.
 * Isolated copy only — not wired into production.
 */
const assert = require('assert');
const g = require('./challengeVariantGuard');

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

const CLARIFY_RE = /which (challenge|product|plan|version|one|account|variant|option)|do you mean|are you asking about|which (?:one|version|option) (?:do you|would you|are you)/i;

check('R104: 200k Instant max-lot already named Instant — do not Instant-vs-Elite clarify', () => {
  const q = 'What is the official maximum lot size on a 200k Instant?';
  assert.strictEqual(g.shouldClarifyProductVariant(q), false, q);
  const draft = 'FundedElite does not have a general maximum lot size rule.';
  assert.strictEqual(g.clarifyProductVariantReply(q, [], draft, [], 'r104'), draft);
});

check('neighbor: Instant 50k leverage already named — do not Instant-vs-Elite clarify', () => {
  const q = 'What is FX leverage on an Instant 50k?';
  assert.strictEqual(g.shouldClarifyProductVariant(q), false, q);
});

check('R011 neighbor: generic 1-Step explain still names Lite + Free Retry and asks which', () => {
  const q = 'Explain the 1 step challenge to me.';
  assert.strictEqual(g.shouldClarifyProductVariant(q), true, q);
  const out = g.clarifyProductVariantReply(q, [], '1-Step has one phase.', [], 'r011');
  assert.ok(/1[\s-]*step\s+lite/i.test(out) && /free\s*retry/i.test(out), out);
  assert.ok(CLARIFY_RE.test(out), 'must ask which: ' + out);
});

check('generic Instant explain still covers both / asks which (not silent Instant dump)', () => {
  const q = 'Tell me about the Instant Challenge';
  assert.strictEqual(g.shouldClarifyProductVariant(q), true, q);
  const out = g.clarifyProductVariantReply(q, [], 'Instant starts in live phase.', [], 't1');
  assert.ok(/\binstant\b/i.test(out) && /\belite\b/i.test(out), out);
  assert.ok(/\?|which|do you mean|are you/i.test(out), out);
});

check('size catalogue ask still variant-sensitive', () => {
  assert.strictEqual(
    g.shouldClarifyProductVariant('What Instant account sizes are available?'),
    true
  );
});

console.log(process.exitCode === 1 ? `RESULT: FAIL (${passed} passed)` : `ALL PASS ${passed}`);
