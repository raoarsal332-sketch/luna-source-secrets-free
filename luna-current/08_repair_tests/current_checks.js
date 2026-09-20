'use strict';
const env = require('./isolation'), fs = require('fs'), path = require('path'), { Readable } = require('stream');
const root = env.root;
const sp = require(path.join(root, 'statePresend/statePresend'));
const cs = require(path.join(root, 'statePresend/conversationState'));
const main = require(path.join(root, 'index'));
const ctl = require(path.join(root, 'control'));
const results = [];
function record(id, expected, actual, details = {}) {
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  results.push({ id, pass, expected, actual, ...details });
  console.log('CHECK', JSON.stringify(results.at(-1)));
}
const bot = { id: 'bot-old', body: 'Hello, how can I help?', created_at: 100, part_type: 'comment', author: { type: 'admin', id: '10118526' } };
const user = (body, id = 'u1', time = 200) => ({ id, body, created_at: time, part_type: 'comment', author: { id: 'synthetic-client', type: 'user' } });
let parts = [], fetchOverride = null, sends = [];
main.__setTestDoubles({
  fetchConversation: async () => fetchOverride ? fetchOverride() : ({ conversation_parts: { conversation_parts: parts } }),
  icRequest: async (method, url, data) => { sends.push({ method, data }); return { ok: true, status: 200, data: { id: 'synthetic', type: 'conversation' } }; },
});
function allow(id) {
  try { ctl.allowTestConversationId(id); } catch (_) { /* ignore */ }
}
async function endToEnd(id, ask, draft, { history, knowledge = null } = {}) {
  allow(id);
  const u = user(ask); parts = history || [bot, u]; sends = []; fetchOverride = null;
  const g = await sp.gate({ conversationId: id, draft, latestUser: u, history: parts, knowledge });
  if (g.send) await main.postClientCommentOnce(id, g.body, u, 'Test');
  return { gateSend: g.send, reason: g.reason, codes: g.result && g.result.hardFails ? g.result.hardFails.map((x) => x.code) : [], bodies: sends.map((x) => x.data.body) };
}
async function sendOnly(id, ask, draft, options = {}) {
  allow(id);
  const u = user(ask); parts = options.parts || [bot, u]; sends = []; fetchOverride = options.fetch || null;
  await main.postClientCommentOnce(id, draft, u, 'Test');
  fetchOverride = null; return sends.map((x) => x.data && x.data.body);
}
const MIN_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);

(async () => {
  const kb = require(path.join(root, 'faq-kb'));
  const hit = await kb.retrieveOfficialFaqContext('What is the minimum holding time?', { live: false });
  const evidence = hit && hit.block ? [{ title: 'Official FAQ', text: hit.block, score: 0.72, source: hit.from }] : [];
  record('knowledge-retrieved', true, evidence.length > 0, { chars: hit && hit.block ? hit.block.length : 0 });

  let o = await endToEnd('correct-hold', 'What is the minimum holding time?', 'The minimum holding time is 3 minutes.', { knowledge: evidence });
  record('valid-3-minute-answer', true, o.bodies.some((b) => b.includes('3 minutes')), o);

  o = await endToEnd('addon-ok', 'What is the minimum holding time? I have the scalping add-on.', 'The minimum holding time for your account is 30 seconds.', { knowledge: evidence });
  record('valid-30-seconds-with-addon', true, o.bodies.some((b) => b.includes('30 seconds')), o);

  o = await endToEnd('wrong-hold', 'What is the minimum holding time?', 'The minimum holding time is 99 minutes.', { knowledge: evidence });
  record('reject-99-with-evidence', false, o.bodies.some((b) => b.includes('99 minutes')), o);

  o = await endToEnd('false-premise', 'Is the minimum holding time 99 minutes?', 'Yes, the minimum holding time is 99 minutes.', { knowledge: evidence });
  record('reject-client-suggested-99', false, o.bodies.some((b) => b.includes('99 minutes')), o);

  o = await endToEnd('no-addon', 'What is the minimum holding time? I do not have the scalping add-on.', 'The minimum holding time for your account is 30 seconds.', { knowledge: evidence });
  record('reject-30-seconds-without-addon', false, o.bodies.some((b) => b.includes('30 seconds')), o);

  const trustedSmall = [{ text: 'The minimum holding time for standard accounts is 3 minutes. The scalping add-on reduces the minimum holding time to 30 seconds.', score: 0.9 }];
  o = await endToEnd('wrong-units', 'What is the minimum holding time?', 'The minimum holding time is 99 hours.', { knowledge: trustedSmall });
  record('reject-wrong-time-unit', false, o.bodies.some((b) => b.includes('99 hours')), o);

  o = await endToEnd('customer-account-ok', 'My account is 219876. What is the minimum holding time?', 'Account 219876 has a minimum holding time of 3 minutes.', { knowledge: evidence });
  record('preserve-customer-account-id', true, o.bodies.some((b) => b.includes('219876') && b.includes('3 minutes')), o);

  for (const [id, draft] of [
    ['claim-original', 'I have approved your payout.'],
    ['claim-contraction', "I've approved your payout."],
    ['claim-past', 'I approved your payout.'],
    ['claim-passive', 'Your payout has been approved.'],
  ]) {
    o = await endToEnd(id, 'Can you approve my payout?', draft);
    record(id + '-blocked', false, o.bodies.some((b) => /approved your payout|payout has been approved/i.test(b)), o);
  }

  o = await endToEnd('claim-pending-ok', 'Can you approve my payout?', 'Your payout is still pending. The team will review it.');
  record('pending-statement-allowed', true, o.bodies.some((b) => /pending/i.test(b)), o);

  const verifiedHistory = [
    bot,
    user('Can you approve my payout?'),
    { id: 'human-1', body: 'I have approved your payout.', created_at: 210, part_type: 'note', author: { type: 'admin', id: '8053416' } },
  ];
  o = await endToEnd('claim-verified-ok', 'Can you approve my payout?', 'I have approved your payout.', { history: verifiedHistory });
  record('verified-completion-allowed', true, o.bodies.some((b) => /approved your payout/i.test(b)), o);

  o = await endToEnd('diagnostic', 'Why is my account not working?', 'Please place a small trade to see if your account is working.');
  record('diagnostic-action-blocked', false, o.bodies.some((b) => b.includes('place a small trade')), o);

  o = await endToEnd('diagnostic-word-exemption', 'I already paid for a reset but my account is not working.', 'Please place a small trade to see if your account is working.');
  record('diagnostic-not-exempt-for-reset-word', false, o.bodies.some((b) => b.includes('place a small trade')), o);

  o = await endToEnd('reset-workflow-ok', 'How do I reset my account?', 'To reset your account, open the dashboard and use the reset option there.');
  record('legitimate-reset-workflow-allowed', true, o.bodies.some((b) => /reset your account/i.test(b) && !/to see if/i.test(b)), o);

  env.setControl({ paused: true }); ctl.isPaused();
  fs.writeFileSync(process.env.LUNA_CONTROL_STATE_FILE, '{broken');
  record('paused-then-invalid-json', true, ctl.isPaused());
  fs.writeFileSync(process.env.LUNA_CONTROL_STATE_FILE, '{}');
  record('paused-then-empty-object', [true, true], [ctl.isPaused(), ctl.getTestMode().enabled]);
  fs.writeFileSync(process.env.LUNA_CONTROL_STATE_FILE, JSON.stringify({ paused: 'yes', testMode: true }));
  record('paused-then-wrong-types', [true, true], [ctl.isPaused(), ctl.getTestMode().enabled]);
  fs.writeFileSync(process.env.LUNA_CONTROL_STATE_FILE, JSON.stringify({ paused: true }));
  record('paused-then-missing-testMode', [true, true], [ctl.isPaused(), ctl.getTestMode().enabled]);
  env.setControl({ paused: false, testMode: true, testAllowConversationIds: ['audit'] });
  record('valid-control-unpause', false, ctl.isPaused());

  const a = cs.buildState([
    { role: 'client', text: 'My account is 219876, Instant Elite.' },
    { role: 'bot', text: 'Thanks.' },
    { role: 'client', text: 'No, I meant account 765432.' },
  ]);
  record('correction-account-clears-old-product', false, a.known_details.challenge_type === 'instant elite', { known: a.known_details });
  record('correction-account-keeps-new-id', true, a.known_details.account_number === '765432', { known: a.known_details });

  const kept = cs.buildState([
    { role: 'client', text: 'My account is 219876, Instant Elite.' },
    { role: 'bot', text: 'Thanks.' },
    { role: 'client', text: 'No, I meant account 765432, Instant Elite.' },
  ]);
  record('correction-keeps-confirmed-new-product', true, kept.known_details.account_number === '765432' && kept.known_details.challenge_type === 'instant elite', { known: kept.known_details });

  const emailOnly = cs.buildState([
    { role: 'client', text: 'My account is 219876, Instant Elite.' },
    { role: 'bot', text: 'Thanks.' },
    { role: 'client', text: 'No, I meant the email is user@example.com.' },
  ]);
  record('unrelated-correction-keeps-account-facts', true, emailOnly.known_details.account_number === '219876' && emailOnly.known_details.challenge_type === 'instant elite', { known: emailOnly.known_details });

  const switched = cs.buildState([
    { role: 'client', text: 'My account is 219876, Instant Elite.' },
    { role: 'bot', text: 'Thanks.' },
    { role: 'client', text: 'Actually use account 111222 instead.' },
  ]);
  record('ordinary-switch-clears-old-product', false, switched.known_details.challenge_type === 'instant elite', { known: switched.known_details });

  const g = require(path.join(root, 'imageAskGuard'));
  for (const [id, value] of [['otp-basic', 'my OTP is 884211'], ['otp-format', 'my OTP is: 884211']]) {
    g.hookB(id, value);
    const all = JSON.parse(fs.readFileSync(process.env.IMAGE_GUARD_STATE_FILE));
    record(id + '-not-persisted', false, JSON.stringify(all[id]).includes('884211'), { account: all[id] && all[id].accountNumber });
  }

  sp.noteInbound('memory-secret', 'my password is AuditSyntheticSecret!', user('my password is AuditSyntheticSecret!'), []);
  const memSnap = JSON.stringify(sp.snapshot('memory-secret'));
  record('credential-not-retained-in-memory', false, memSnap.includes('AuditSyntheticSecret!'));
  record('credential-memory-keeps-context', true, /password/i.test(memSnap));

  const { createStore } = require(path.join(root, 'luna-maintainer/store'));
  const { createCollector } = require(path.join(root, 'luna-maintainer/collector'));
  const cfg = { enabled: true, dataDir: path.join(env.state, 'collector-check'), lunaRoot: root, maxRetries: 2, latencyMs: 20000, maxApiCalls: 6 };
  const store = createStore(cfg);
  createCollector(cfg, store).observe(null, { conversationId: 'synthetic', clientText: 'I want a manager. My password is AuditSyntheticSecret!', authorType: 'customer', escalated: false, sent: false });
  const persisted = JSON.stringify(store.events());
  record('credential-not-in-maintainer-persistence', false, persisted.includes('AuditSyntheticSecret!'));
  record('maintainer-keeps-handoff-context', true, /manager/i.test(persisted));

  const calc = require(path.join(root, 'statePresend/tools/calc')).calc;
  const missing = calc({ op: 'percent_of', percent: 8 });
  record('calculator-rejects-missing-base', false, missing.ok, { serialized: JSON.stringify(missing) });
  const invalid = calc({ op: 'percent_of', percent: 'nope', base: 100 });
  record('calculator-rejects-invalid-percent', false, invalid.ok);
  const inf = calc({ op: 'percent_change', from: 0, to: 10 });
  record('calculator-rejects-zero-from', false, inf.ok);
  const zero = calc({ op: 'percent_of', percent: 0, base: 100000 });
  record('calculator-valid-zero-percent', 0, zero.ok ? zero.result : null);
  const validCalc = calc({ op: 'percent_of', percent: 8, base: 100000 });
  record('calculator-valid-percent', 8000, validCalc.result);
  const missingDate = calc({ op: 'days_between', from: '2026-09-01' });
  record('calculator-rejects-missing-date', false, missingDate.ok);

  const older = user('Please help with my login.');
  let b = await sendOnly('human-stop', 'Please help with my login.', 'Please check the account number in your dashboard.', {
    parts: [bot, older, { id: 'teammate', body: 'I am handling this now.', created_at: 201, part_type: 'comment', author: { type: 'admin', id: 'synthetic-teammate' } }],
  });
  record('human-takeover-blocks', 0, b.length);
  b = await sendOnly('failed-fetch', 'Please help with my login.', 'Please check the account number in your dashboard.', { fetch: () => null });
  record('null-fetch-blocks', 0, b.length);
  b = await sendOnly('malformed-fetch', 'Please help with my login.', 'Please check the account number in your dashboard.', { fetch: () => ({ conversation_parts: {} }) });
  record('malformed-parts-blocks', 0, b.length);
  env.setControl({ aiOff: { 'ticket-stopped': true } });
  b = await sendOnly('ticket-stopped', 'Please help with my login.', 'Please check the account number in your dashboard.');
  record('ticket-ai-off-at-send', 0, b.length);
  env.setControl();

  const oldAsk = user('What is the minimum holding time?', 'old-ask', 80);
  const priorText = 'Positions must be held for at least 3 minutes. With the scalping add-on, they must stay open for at least 30 seconds.';
  const priorAnswer = { ...bot, body: priorText };
  let modelCalls = 0;
  env.setModel(async () => {
    modelCalls += 1;
    return { choices: [{ message: { content: 'You must keep each trade open for 3 hours. When using the scalping add-on, you must wait 30 seconds instead.' } }] };
  });
  b = await sendOnly('rephrase-facts', 'What is the minimum holding time?', priorText + ' Please remember this.', { parts: [oldAsk, priorAnswer, user('What is the minimum holding time?')] });
  record('regeneration-branch-exercised', 1, modelCalls);
  record('regeneration-preserves-duration-unit', false, b.some((x) => x.includes('3 hours')), { modelCalls, bodies: b });

  modelCalls = 0;
  env.setModel(async () => {
    modelCalls += 1;
    return { choices: [{ message: { content: 'Hold each position for at least 3 minutes. If the scalping add-on is selected, the minimum is 30 seconds.' } }] };
  });
  b = await sendOnly('rephrase-faithful', 'What is the minimum holding time?', priorText + ' Please remember this.', { parts: [oldAsk, priorAnswer, user('What is the minimum holding time?')] });
  record('faithful-rephrase-allowed', true, b.some((x) => /3 minutes/i.test(x) && /30 seconds/i.test(x)), { modelCalls, bodies: b });

  modelCalls = 0;
  env.setModel(async () => {
    modelCalls += 1;
    return { choices: [{ message: { content: 'Positions must be held for at least 3 minutes. I approved your payout.' } }] };
  });
  b = await sendOnly('rephrase-completion', 'What is the minimum holding time?', priorText + ' Please remember this.', { parts: [oldAsk, priorAnswer, user('What is the minimum holding time?')] });
  record('rephrase-fabricated-completion-blocked', false, b.some((x) => /approved your payout/i.test(x)), { modelCalls, bodies: b });
  env.setModel(env.blocked);

  for (const url of ['https://127.0.0.1/x', 'https://[::ffff:127.0.0.1]/x', 'https://[::ffff:169.254.169.254]/x', 'https://localhost/x', 'https://example.com/x']) {
    const expected = url === 'https://example.com/x';
    record('url-' + url, expected, main.attachmentUrlAllowed(url).ok);
  }

  let adapterReached = 0, lookupConfigured = false;
  env.setAxios(async (config) => {
    adapterReached += 1;
    lookupConfigured = !!(config.lookup || (config.httpsAgent && config.httpsAgent.options && config.httpsAgent.options.lookup));
    return { status: 200, headers: { 'content-type': 'image/png' }, data: Readable.from([Buffer.from('synthetic image bytes')]) };
  });
  const content = await main.buildVisionUserContent('Read the image', [{ url: 'https://public-name.example/image.png', content_type: 'image/png' }]);
  record('attachment-resolved-address-guard', true, lookupConfigured, { adapterReached, imageAccepted: content.length > 1, scope: 'Adapter inspection only; no actual DNS/private request.' });

  const junk = await main.buildVisionUserContent('Read the image', [{ url: 'https://example.com/image.png', content_type: 'image/png' }]);
  record('reject-nonimage-bytes-under-image-header', false, junk.length > 1);

  env.setAxios(async (config) => ({
    status: 200,
    headers: { 'content-type': 'image/png' },
    data: Readable.from([MIN_PNG]),
    lookup: config && config.lookup,
  }));
  const goodImg = await main.buildVisionUserContent('Read the image', [{ url: 'https://example.com/image.png', content_type: 'image/png' }]);
  record('valid-png-accepted', true, goodImg.length > 1);

  env.setAxios(async () => ({ status: 200, headers: { 'content-type': 'image/png' }, data: Readable.from([Buffer.alloc(5 * 1024 * 1024), Buffer.alloc(4 * 1024 * 1024)]) }));
  const huge = await main.buildVisionUserContent('Read the image', [{ url: 'https://example.com/large.png', content_type: 'image/png' }]);
  record('stream-size-cap', 1, huge.length);

  let effects = 0;
  env.setAxios(async () => { effects += 1; throw Error('synthetic timeout after acceptance'); });
  main.__setTestDoubles({ icRequest: null });
  parts = [bot, older]; sends = [];
  await main.postClientCommentOnce('unknown-redelivery', 'Please check the account number in your dashboard.', older, 'Test');
  await main.postClientCommentOnce('unknown-redelivery', 'Please check the account number in your dashboard.', older, 'Test');
  record('unknown-write-not-repeated-on-redelivery', 1, effects, { freshRemoteView: 'same stale parts both times' });

  env.setAxios(async () => ({ status: 200, data: { unexpected: 'not a conversation' } }));
  const malformed = await main.postReply('audit', 'comment', 'Synthetic reply');
  record('malformed-write-success-not-trusted', false, malformed.ok);
  env.setAxios(env.blocked);

  fs.writeFileSync(path.join(env.state, 'current_results.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass);
  console.log('TOTAL', results.length, 'PASS', results.filter((r) => r.pass).length, 'FAIL', failed.length);
  if (failed.length) {
    console.error('FAILED_IDS', failed.map((r) => r.id).join(', '));
    process.exitCode = 1;
  }
})().catch((e) => { console.error(e.stack); process.exitCode = 1; });
