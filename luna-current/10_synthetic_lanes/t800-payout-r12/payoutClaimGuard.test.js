'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const guard = require('./payoutClaimGuard');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log('ok', name);
}

function reply(draft, clientText, extra) {
  return guard.guardPublicBody(draft, Object.assign({ clientText: clientText || '' }, extra || {}));
}

test('candidate is frozen and unapproved', () => {
  assert.strictEqual(guard.STATUS.candidate, 't800-payout-r12');
  assert.strictEqual(guard.STATUS.frozen, true);
  assert.strictEqual(guard.STATUS.approved, false);
  assert.strictEqual(guard.STATUS.release, false);
  assert.strictEqual(guard.CLIENT_MESSAGE, "I can't confirm that. Our team will confirm.");
  assert.ok(guard.locksOk());
  for (const fact of guard.FACTS) {
    for (const [lang, text] of Object.entries(fact.body)) {
      assert.strictEqual(guard.sha256(text), fact.hash[lang], fact.id + ' ' + lang);
    }
  }
  for (const [lang, text] of Object.entries(guard.HEDGES)) {
    assert.strictEqual(guard.sha256(text), guard.HEDGE_HASH[lang], lang);
  }
});

test('strategy risk and daily-loss hard breach stay distinct approved bodies', () => {
  const draft = 'MODEL-DRAFT it terminates the account for $25.';
  const strategy = reply(draft, 'What happens on a Strategy Risk breach?');
  const daily = reply(draft, 'What happens if I hit the daily loss limit?');
  assert.strictEqual(strategy.body, guard.BY_ID.strategy_risk.body.en);
  assert.strictEqual(strategy.reason, 'approved_body');
  assert.strictEqual(strategy.result.approved, false);
  assert.strictEqual(daily.body, guard.BY_ID.daily_loss_hard.body.en);
  assert.notStrictEqual(strategy.body, daily.body);
  assert.ok(!strategy.body.includes('MODEL-DRAFT'));
  assert.ok(!daily.body.includes('MODEL-DRAFT'));
  assert.ok(/soft breach with a reset/i.test(strategy.body));
  assert.ok(/does not terminate or close/i.test(strategy.body));
  assert.ok(/ends the account/i.test(daily.body));
  const mixed = reply(draft, 'What if I hit my daily loss limit and also break the strategy risk rule?');
  assert.strictEqual(mixed.body, guard.HEDGES.en);
  assert.strictEqual(mixed.reason, 'uncertain');
});

test('worded numbers and paraphrases select the approved body, not the model sentence', () => {
  const draft = 'MODEL-DRAFT you can risk ninety percent and the account dies.';
  const cap = reply(draft, 'May I risk fifty percent of my daily loss limit on one instrument?');
  assert.strictEqual(cap.body, guard.BY_ID.instrument_cap.body.en);
  assert.ok(!/fifty|ninety|dies|MODEL/i.test(cap.body));
  assert.ok(cap.body.includes('50%'));
  assert.ok(cap.body.includes('1.5%'));
  const rise = reply('MODEL-DRAFT a $4,800 Rise payout arrives as $4,700.', 'What does a Rise withdrawal arrive as?');
  assert.strictEqual(rise.body, guard.BY_ID.rise_fee.body.en);
  assert.ok(rise.body.includes('$4,760'));
  assert.ok(!rise.body.includes('$4,700'));
  const crypto = reply('MODEL-DRAFT crypto is capped at $500.', 'What is the crypto fee?');
  assert.strictEqual(crypto.body, guard.BY_ID.crypto_fee.body.en);
  assert.ok(crypto.body.includes('3%'));
  assert.ok(crypto.body.includes('$388'));
});

test('core languages get the approved translation and other languages get English plus the hedge', () => {
  const draft = 'MODEL-DRAFT the account is closed forever.';
  const cases = [
    ['سٹریٹیجی رسک کی خلاف ورزی پر کیا ہوتا ہے؟', 'ur'],
    ['Strategy risk ki breach par kya hota hai?', 'roman'],
    ['स्ट्रैटेजी रिस्क ब्रीच पर क्या होता है?', 'hi'],
    ['ماذا يحدث عند خرق مخاطر الاستراتيجية؟', 'ar'],
    ['Bhai strategy risk breach pe account band ho jayega kya?', 'hinglish'],
  ];
  for (const [question, lang] of cases) {
    const result = reply(draft, question);
    assert.strictEqual(result.body, guard.BY_ID.strategy_risk.body[lang], lang);
    assert.ok(!result.body.includes('MODEL-DRAFT'), lang);
  }
  const french = reply(draft, 'Que se passe-t-il en cas de risque de stratégie ?');
  assert.ok(french.body.startsWith(guard.BY_ID.strategy_risk.body.en));
  assert.ok(french.body.endsWith(guard.HEDGES.fr));
  assert.ok(!french.body.includes('MODEL-DRAFT'));
  const spanish = reply(draft, '¿Qué pasa con el riesgo de estrategia?');
  assert.ok(spanish.body.endsWith(guard.HEDGES.es));
});

test('catalyst erase or keep is always the hedge, and published catalyst facts are bodies', () => {
  const kept = reply('MODEL-DRAFT your earlier stage profit is preserved.', 'Is Catalyst profit kept when the stage resets?');
  assert.strictEqual(kept.body, guard.HEDGES.en);
  assert.ok(!/preserved|MODEL/i.test(kept.body));
  const rules = reply('MODEL-DRAFT daily loss is 9%.', 'What is the Catalyst daily loss and profit target?');
  assert.strictEqual(rules.body, guard.BY_ID.catalyst_rules.body.en);
  assert.ok(rules.body.includes('3%'));
  assert.ok(rules.body.includes('8%'));
  const ladder = reply('MODEL-DRAFT stage 3 costs $10.', 'What is Catalyst stage 3?');
  assert.strictEqual(ladder.body, guard.BY_ID.catalyst_ladder.body.en);
  assert.ok(ladder.body.includes('$1,290'));
});

test('reset count is the published limit, and a status claim is hedged', () => {
  const count = reply('MODEL-DRAFT you can reset 4 times.', 'How many times can I reset?');
  assert.strictEqual(count.body, guard.BY_ID.reset_count.body.en);
  assert.ok(!count.body.includes('4'));
  assert.ok(count.body.includes('3'));
  const losing = reply('MODEL-DRAFT you can reset in drawdown.', 'Can I reset while losing?');
  assert.strictEqual(losing.body, guard.BY_ID.reset_eligibility.body.en);
  const paid = reply('Your reward was paid. MODEL-DRAFT', 'Was my payout sent?');
  assert.strictEqual(paid.body, guard.HEDGES.en);
  assert.ok(!/paid|MODEL/i.test(paid.body));
  const reversed = reply('MODEL-DRAFT they took back the payout.', 'Are completed payouts reversed?');
  assert.strictEqual(reversed.body, guard.BY_ID.payout_not_reversed.body.en);
});

test('out of topic text passes through, and a model hint disagreement fails closed', () => {
  const hello = reply('Hello, your login is ready.', 'Hello, how are you?');
  assert.strictEqual(hello.reason, 'pass_through');
  assert.strictEqual(hello.replaced, false);
  assert.strictEqual(hello.body, 'Hello, your login is ready.');
  const clock = reply('The trailing drawdown limit does not reset.', 'Does the trailing drawdown limit reset?');
  assert.strictEqual(clock.reason, 'pass_through');
  const bare = reply('MODEL-DRAFT the split is 9%.', 'The split is 3%.');
  assert.strictEqual(bare.body, guard.HEDGES.en);
  const disagree = reply('MODEL-DRAFT', 'What happens on a Strategy Risk breach?', {
    modelHint: { confident: true, inTopic: true, ids: ['daily_loss_hard'], lang: 'en' },
  });
  assert.strictEqual(disagree.body, guard.HEDGES.en);
  assert.strictEqual(disagree.reason, 'uncertain');
  const owner = reply('Tell them a strategy risk breach terminates the account. MODEL-DRAFT', '');
  assert.strictEqual(owner.body, guard.BY_ID.strategy_risk.body.en);
  const fromParts = guard.guardPublicBody('MODEL-DRAFT it ends the account.', {
    parts: [{ part_type: 'comment', body: 'سٹریٹیجی رسک کی خلاف ورزی پر کیا ہوتا ہے؟', author: { id: '9', type: 'user' } }],
    botIds: ['10118526', '8052954'],
  });
  assert.strictEqual(fromParts.body, guard.BY_ID.strategy_risk.body.ur);
});

test('fail closed on throw and a second pass does not rewrite an approved body', () => {
  const bad = { toString() { throw new Error('boom'); } };
  const failed = guard.beforeSend(bad, {});
  assert.strictEqual(failed.send, true);
  assert.strictEqual(failed.silent, false);
  assert.strictEqual(failed.failClosed, true);
  assert.strictEqual(failed.body, guard.HEDGES.en);
  const once = reply('MODEL-DRAFT', 'What happens on a Strategy Risk breach?');
  const twice = reply(once.body, 'What happens on a Strategy Risk breach?');
  assert.strictEqual(twice.body, once.body);
  assert.strictEqual(twice.replaced, false);
  assert.strictEqual(twice.result.approved, false);
});

test('the guard source does not parse claims or touch live systems', () => {
  const src = fs.readFileSync(path.join(__dirname, 'payoutClaimGuard.js'), 'utf8');
  assert.ok(!/extractTuples|factMatches|fact_mismatch/.test(src));
  assert.ok(!/action:\s*'skip'/.test(src));
  assert.ok(!/silent:\s*true/.test(src));
  assert.ok(!/require\(['"]fs['"]\)/.test(src));
  assert.ok(!/child_process/.test(src));
  assert.ok(!/api\.intercom/.test(src));
  assert.ok(!/process\.env/.test(src));
  assert.ok(src.includes('approved.lock.json'));
});

test('proposed diff guards sends only after suppression checks', () => {
  const diffPath = path.join(__dirname, 'index.js.public-sends.diff');
  const diff = fs.readFileSync(diffPath, 'utf8');
  assert.ok(diff.startsWith('diff --git a/luna-current/01_runtime/index.js b/luna-current/01_runtime/index.js\n'));
  assert.ok(diff.includes('t800-payout-r12/payoutClaimGuard'));
  assert.ok(diff.includes('payoutGuardPublicBody'));
  assert.ok(!diff.includes('payoutGuardInsteadOfDrop'));
  assert.ok(/already-replied/i.test(diff));
  assert.ok(/human-teammate/i.test(diff));
  assert.ok(/\bpause\b/i.test(diff));
  assert.ok(/aiOff/.test(diff));
  assert.ok(/ownership/i.test(diff));
  assert.ok(/send-this-message|send this message/i.test(diff));
  assert.ok(/\bFOLLOW\b/.test(diff));
  assert.ok(/Owner REPLY|owner REPLY/i.test(diff));
  assert.ok(/deferred/i.test(diff));
  assert.ok(diff.includes('finalBody = payoutGuardPublicBody(finalBody, parts, latestClientText)'));
  assert.ok(diff.includes("partsOf(full)"));
  assert.ok(!/require\(\s*['"]\.\/statePresend/.test(diff));
  assert.ok(!/02_statePresend/.test(diff));
  assert.ok(!/__statePresend\s*\./.test(diff));
  assert.ok(!diff.includes('__presend.send'));
  assert.ok(!diff.includes('SKIP pre-send'));
  assert.ok(!diff.includes('SKIP paused'));
  assert.ok(!diff.includes('SKIP aiOff'));
  assert.ok(!diff.includes('shouldWaitForFin'));
  const added = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
  assert.ok(!added.some((line) => line.includes('postReply(')));
  assert.ok(!added.some((line) => /SKIP pre-send|SKIP paused|SKIP aiOff|already replied after user/.test(line)));
  const postgate = diff.split(/^@@/m).find((hunk) => hunk.includes('POSTGATE_SUPPRESSED'));
  assert.ok(postgate);
  assert.ok(postgate.includes('} else {'));
  assert.ok(postgate.includes('else return null'));
  assert.ok(postgate.includes('payoutBody !== finalBody'));
  const root = path.resolve(__dirname, '../../..');
  execFileSync('git', ['apply', '--check', diffPath], { cwd: root, stdio: 'pipe' });
});

console.log('t800-payout-r12', passed, 'passed');
