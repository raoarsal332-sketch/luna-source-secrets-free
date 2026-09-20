'use strict';

/**
 * run-tests.js - the maintainer's own self-tests. No test framework, no network.
 *
 * The LLM is stubbed and every filesystem write happens in a temp copy of Luna,
 * so running this can never touch production.
 *
 *   LUNA_ROOT=/path/to/luna node luna-maintainer/test/run-tests.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const M = require('../index');
const { createStore } = require('../store');
const { createLedger } = require('../ledger');
const { createGate } = require('../approval');
const { createAnalyzer } = require('../analyzer');
const { createProposer } = require('../proposer');
const { createStubLlm } = require('../llm');
const { load } = require('../config');
const { makeEvent, STATUS } = require('../schema');
const detectors = require('../detectors');
const sandbox = require('../sandbox');
const { copyTree } = require('../sandbox');

const REAL_LUNA = process.env.LUNA_ROOT || path.resolve(__dirname, '../../luna-export');
const PATCH = fs.readFileSync(path.join(__dirname, 'fixture-greeting.patch'), 'utf8');

let pass = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); pass += 1; console.log(`  ok  ${name}`); }
  catch (e) { failures.push(`${name}: ${e.message}`); console.log(`FAIL  ${name}: ${e.message}`); }
}

function tmpdir(tag) { return fs.mkdtempSync(path.join(os.tmpdir(), `lm-${tag}-`)); }

function freshEnv(tag, over) {
  const dir = tmpdir(tag);
  const cfg = load(Object.assign({
    lunaRoot: REAL_LUNA, dataDir: dir, backupDir: path.join(dir, 'backups'),
    casesDir: path.join(__dirname, 'e2e-cases'), goldenDir: path.join(dir, 'golden'),
    dryRun: false, minOccurrences: 2,
  }, over || {}));
  return { cfg, dir };
}

const rcOk = () => ({ category: 'business_rule', explanation: 'Greeting list has no Roman Urdu variants, so the handoff skip gate misses them.', confidence: 0.84, evidence_refs: ['clientText'], suspected_components: ['teammateHandoffGates.isGreetingOnlyClientMsg'], insufficient_evidence: false });
const propOk = (patch) => ({
  detected_problem: 'Roman Urdu greetings are not treated as greeting-only.',
  change_kind: 'business_rule_adjustment',
  affected_paths: ['teammateHandoffGates.js'],
  patch: patch || PATCH,
  expected_benefit: 'Greeting-only Roman Urdu messages stop re-triggering the bot after a teammate handoff.',
  regression_risk: 'A longer message starting with salam could be misread as a greeting.',
  required_tests: ['greeting-romanurdu-salam', 'greeting-romanurdu-assalam', 'greeting-romanurdu-aoa'],
  rollback_plan: 'Restore the backup tarball; revert teammateHandoffGates.js.',
  feature_flag: '',
  notes: '',
});

(async () => {
  console.log(`luna-maintainer self-tests (LUNA_ROOT=${REAL_LUNA})\n`);
  assert(fs.existsSync(REAL_LUNA), `Luna root not found: ${REAL_LUNA}`);

  // ---------------- schema / store ----------------
  await test('fingerprint ignores conversation id, so one systemic failure is one bucket', () => {
    const a = makeEvent({ code: 'DUPLICATE_REPLY', conversationId: '1', signature: 'DUPLICATE_REPLY' });
    const b = makeEvent({ code: 'DUPLICATE_REPLY', conversationId: '999', signature: 'DUPLICATE_REPLY' });
    assert.strictEqual(a.fingerprint, b.fingerprint);
  });

  await test('store aggregates repeats and keeps bounded samples', () => {
    const { cfg } = freshEnv('store');
    const store = createStore(cfg);
    for (let i = 0; i < 15; i += 1) store.recordEvent(makeEvent({ code: 'DUPLICATE_REPLY', conversationId: String(i) }));
    const b = store.events()[0];
    assert.strictEqual(b.occurrences, 15);
    assert.ok(b.samples.length <= 10, 'samples must stay bounded');
  });

  // ---------------- detectors ----------------
  await test('presend hard fails are imported verbatim, not re-detected', () => {
    const gateResult = { result: { ok: false, hardFails: [{ code: 'ALREADY_COLLECTED_INFO_REQUEST', detail: 'account' }], softWarnings: [] }, send: true, reason: 'fallback-reply', version: 'v1' };
    const evs = detectors.fromPresend(gateResult, { conversationId: '7' });
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].code, 'ALREADY_COLLECTED_INFO_REQUEST');
    assert.strictEqual(evs[0].detector, 'presendMega');
  });

  await test('turn detectors cover what presend structurally cannot see', () => {
    const cfg = load({ maxRetries: 2, latencyMs: 20000, maxApiCalls: 6 });
    const evs = detectors.fromTurn({
      conversationId: '9', authorType: 'customer', clientText: 'i want to talk to a human',
      escalated: false, toolFailures: ['searchKnowledge'], retries: 5, latencyMs: 45000,
      apiCalls: 9, expectedNote: true, isNote: false, historyTruncated: true,
    }, cfg).map((e) => e.code);
    for (const code of ['TOOL_FAILURE', 'LOOP_RETRY', 'LATENCY_ANOMALY', 'API_USAGE_ANOMALY', 'REPLY_NOTE_MISTAKE', 'MISSED_ESCALATION', 'STATE_HISTORY_ERROR']) {
      assert.ok(evs.includes(code), `missing ${code} (got ${evs.join(',')})`);
    }
  });

  await test('teammate corrections come from the existing humanCorrectionCapture shape', () => {
    const evs = detectors.fromCorrection({ conversation_id: '3', kind: 'explicit-correction', bot_reply: 'x', human_reply: 'actually it is y', client_context: 'q' });
    assert.strictEqual(evs[0].code, 'TEAMMATE_CORRECTION');
  });

  await test('observe() never throws on malformed input', () => {
    const { cfg } = freshEnv('observe');
    const m = M.create({ config: cfg, llm: createStubLlm([]) });
    assert.deepStrictEqual(m.observe(null, null), []);
    assert.deepStrictEqual(m.observe({ result: 'not an object' }, { conversationId: 1 }), []);
  });

  // ---------------- analyzer ----------------
  await test('low confidence is forced to insufficient evidence', async () => {
    const cfg = load({ minConfidence: 0.6 });
    const a = createAnalyzer(cfg, createStubLlm([Object.assign(rcOk(), { confidence: 0.2 })]));
    const rc = await a.analyze({ fingerprint: 'f', code: 'X', occurrences: 3, samples: [] });
    assert.strictEqual(rc.insufficientEvidence, true);
  });

  await test('an LLM failure degrades safely instead of guessing', async () => {
    const a = createAnalyzer(load({}), createStubLlm([]));
    const rc = await a.analyze({ fingerprint: 'f', code: 'X', occurrences: 3, samples: [] });
    assert.strictEqual(rc.category, 'unknown');
    assert.strictEqual(rc.insufficientEvidence, true);
  });

  // ---------------- proposer envelope ----------------
  const bucket = { fingerprint: 'fp1', code: 'X', summary: 's', occurrences: 3, severity: 'high', samples: [] };
  const goodRc = { category: 'business_rule', explanation: 'x', confidence: 0.9, insufficientEvidence: false };

  for (const [name, mutate] of [
    ['forbidden paths are refused', (p) => { p.affected_paths = ['.env']; }],
    ['a proposal with no tests is refused', (p) => { p.required_tests = []; }],
    ['a proposal with no rollback is refused', (p) => { p.rollback_plan = ''; }],
    ['an empty patch is refused', (p) => { p.patch = ''; }],
    ['a path escape is refused', (p) => { p.affected_paths = ['../../etc/passwd']; }],
  ]) {
    await test(name, async () => {
      const { cfg } = freshEnv('prop');
      const body = propOk(); mutate(body);
      const pr = createProposer(cfg, createStubLlm([body]), createLedger(createStore(cfg)));
      await assert.rejects(() => pr.propose(bucket, goodRc), /refus|forbidden|no patch|unsafe|no affected/i);
    });
  }

  await test('insufficient evidence blocks proposal generation entirely', async () => {
    const { cfg } = freshEnv('prop2');
    const pr = createProposer(cfg, createStubLlm([propOk()]), createLedger(createStore(cfg)));
    await assert.rejects(() => pr.propose(bucket, { category: 'unknown', confidence: 0.1, insufficientEvidence: true }), /insufficient evidence/i);
  });

  await test('the ledger blocks a repeat and new evidence unblocks it', async () => {
    const { cfg } = freshEnv('ledger');
    const store = createStore(cfg);
    const ledger = createLedger(store);
    ledger.record('fp1', PATCH, 'rejected', 'we want a prompt-level fix instead');
    const pr = createProposer(cfg, createStubLlm([propOk(), propOk()]), ledger);
    const blocked = await pr.propose(bucket, goodRc);
    assert.strictEqual(blocked.status, STATUS.BLOCKED_BY_LEDGER);
    const allowed = await pr.propose(bucket, goodRc, { newEvidence: true });
    assert.strictEqual(allowed.status, STATUS.DRAFT);
  });

  // ---------------- sandbox isolation ----------------
  await test('sandbox lives outside the production root', () => {
    const sb = sandbox.create(REAL_LUNA);
    try {
      assert.ok(!fs.realpathSync(sb.root).startsWith(fs.realpathSync(REAL_LUNA) + path.sep));
      assert.ok(fs.existsSync(path.join(sb.root, 'statePresend/statePresend.js')));
    } finally { sb.destroy(); }
  });

  await test('patching in the sandbox leaves the production file byte-identical', () => {
    const target = path.join(REAL_LUNA, 'teammateHandoffGates.js');
    const before = fs.readFileSync(target, 'utf8');
    const sb = sandbox.create(REAL_LUNA);
    try {
      const r = sb.applyPatch(PATCH);
      assert.ok(r.ok, r.detail);
      assert.ok(fs.readFileSync(path.join(sb.root, 'teammateHandoffGates.js'), 'utf8').includes('assalam'));
    } finally { sb.destroy(); }
    assert.strictEqual(fs.readFileSync(target, 'utf8'), before, 'production file was modified during sandbox testing');
  });

  await test('sandbox refuses a path escape and redirects Luna state files', () => {
    const sb = sandbox.create(REAL_LUNA);
    try {
      assert.throws(() => sb.writeFile('../escaped.js', 'x'), /escapes sandbox/);
      const restore = sb.isolateEnv();
      assert.ok(process.env.TICKET_STATE_FILE.startsWith(sb.parent), 'ticket state not redirected');
      restore();
    } finally { sb.destroy(); }
  });

  // ---------------- golden runner against the real Luna ----------------
  await test('the golden suite passes against the shipped Luna source', async () => {
    const runner = require('../runner');
    const cases = runner.loadCases([path.resolve(__dirname, '../cases')]);
    assert.ok(cases.length >= 20, `expected a real case pack, got ${cases.length}`);
    const res = await runner.runSuite(REAL_LUNA, cases);
    const bad = res.filter((r) => !r.passed);
    assert.strictEqual(bad.length, 0, bad.map((b) => `${b.id}: ${b.failures.join('; ')}`).join(' | '));
  });

  // ---------------- end to end ----------------
  async function proposed(patch) {
    const { cfg } = freshEnv('e2e');
    const m = M.create({ config: cfg, llm: createStubLlm([rcOk(), propOk(patch)]) });
    for (let i = 0; i < 3; i += 1) {
      m.collector.record([makeEvent({ code: 'MISSED_ESCALATION', detector: 'turn', conversationId: String(i), signature: 'greeting_romanurdu', summary: 'Roman Urdu greeting restarted the bot after handoff' })]);
    }
    const act = m.actionable();
    assert.ok(act.length, 'no actionable issue bucket');
    const res = await m.processIssue(act[0].fingerprint);
    assert.strictEqual(res.status, 'proposed', JSON.stringify(res));
    return { m, id: res.proposal.id, cfg };
  }

  await test('a good patch fixes the targets, causes no regressions and needs approval', async () => {
    const { m, id } = await proposed();
    const rep = await m.evaluate(id);
    assert.ok(rep.patchApplied, 'patch did not apply');
    assert.ok(rep.baseline.passRate < 1, `baseline should fail the target cases, got ${rep.baseline.passRate}`);
    assert.strictEqual(rep.candidate.passRate, 1, require('../scoring').renderReport(rep));
    assert.strictEqual(rep.fixedTargets, true);
    assert.deepStrictEqual(rep.newRegressions, []);
    assert.deepStrictEqual(rep.gateFailures, []);
    assert.strictEqual(rep.passed, true);
    m.requestApproval(id);
    assert.strictEqual(m.store.getProposal(id).status, STATUS.AWAITING_APPROVAL);
    await assert.rejects(() => m.deployer.deploy(id, 'arsal'), /not approved/i);
  });

  await test('a regressing patch fails evaluation and is remembered by the ledger', async () => {
    const bad = PATCH.replace('|salam|salaam|salam\\s*alaikum|assalam\\s*o?\\s*alaikum|assalamu\\s*alaikum|aoa', '|salam|salaam|aoa|.*');
    const { m, id } = await proposed(bad);
    const rep = await m.evaluate(id);
    assert.strictEqual(rep.passed, false);
    assert.ok(rep.newRegressions.length > 0 || rep.gateFailures.length > 0, 'a catch-all greeting regex must be caught');
    assert.throws(() => m.requestApproval(id), /not eligible/i);
    assert.strictEqual(m.ledger.blocked(m.store.getProposal(id).fingerprint, bad).blocked, true);
  });

  await test('the AI cannot approve its own patch', async () => {
    const { m, id } = await proposed();
    await m.evaluate(id);
    m.requestApproval(id);
    for (const who of ['', 'luna-maintainer', 'ai', 'system', 'bot']) {
      assert.throws(() => m.gate.approve(id, who), /named human approver/i);
    }
  });

  await test('an unevaluated proposal cannot be approved', async () => {
    const { m, id } = await proposed();
    assert.throws(() => m.gate.approve(id, 'arsal'), /illegal transition/i);
  });

  await test('dry run writes nothing to Luna', async () => {
    const { cfg } = freshEnv('dry', { dryRun: true });
    const m = M.create({ config: cfg, llm: createStubLlm([rcOk(), propOk()]) });
    m.collector.record([makeEvent({ code: 'MISSED_ESCALATION', signature: 'greeting_romanurdu', severity: 'critical' })]);
    const res = await m.processIssue(m.actionable()[0].fingerprint);
    await m.evaluate(res.proposal.id);
    m.requestApproval(res.proposal.id);
    const before = fs.readFileSync(path.join(REAL_LUNA, 'teammateHandoffGates.js'), 'utf8');
    const out = await m.approveAndDeploy(res.proposal.id, 'arsal', 'reviewed');
    assert.strictEqual(out.status, 'dry_run');
    assert.strictEqual(fs.readFileSync(path.join(REAL_LUNA, 'teammateHandoffGates.js'), 'utf8'), before);
  });

  await test('approved deploy backs up, applies, health-checks and rolls back cleanly', async () => {
    const copy = path.join(tmpdir('deploy'), 'luna');
    copyTree(REAL_LUNA, copy);
    const { cfg } = freshEnv('deploy2', { lunaRoot: copy, dryRun: false });
    const m = M.create({ config: cfg, llm: createStubLlm([rcOk(), propOk()]) });
    m.collector.record([makeEvent({ code: 'MISSED_ESCALATION', signature: 'greeting_romanurdu', severity: 'critical' })]);
    const res = await m.processIssue(m.actionable()[0].fingerprint);
    await m.evaluate(res.proposal.id);
    m.requestApproval(res.proposal.id);

    const out = await m.approveAndDeploy(res.proposal.id, 'arsal', 'reviewed the diff');
    assert.strictEqual(out.status, 'deployed', JSON.stringify(out));
    assert.ok(fs.existsSync(out.backup), 'no backup written');
    assert.ok(fs.readFileSync(path.join(copy, 'teammateHandoffGates.js'), 'utf8').includes('assalam'));

    const rb = m.deployer.rollback(out.deployId, 'operator requested');
    assert.strictEqual(rb.status, 'rolled_back');
    assert.ok(!fs.readFileSync(path.join(copy, 'teammateHandoffGates.js'), 'utf8').includes('assalam'), 'rollback did not restore the file');
    assert.strictEqual(m.store.getProposal(res.proposal.id).status, STATUS.ROLLED_BACK);
  });

  await test('post-deploy monitoring auto-rolls back on a threshold breach', async () => {
    const copy = path.join(tmpdir('mon'), 'luna');
    copyTree(REAL_LUNA, copy);
    const { cfg } = freshEnv('mon2', { lunaRoot: copy, dryRun: false });
    const m = M.create({ config: cfg, llm: createStubLlm([rcOk(), propOk()]) });
    m.collector.record([makeEvent({ code: 'MISSED_ESCALATION', signature: 'greeting_romanurdu', severity: 'critical' })]);
    const res = await m.processIssue(m.actionable()[0].fingerprint);
    await m.evaluate(res.proposal.id);
    m.requestApproval(res.proposal.id);
    const out = await m.approveAndDeploy(res.proposal.id, 'arsal');
    const mon = m.deployer.monitor(out.deployId, new Array(4).fill({ severity: 'critical', code: 'REGRESSION_AFTER_CHANGE' }), 10);
    assert.strictEqual(mon.status, 'rolled_back');
    assert.ok(!fs.readFileSync(path.join(copy, 'teammateHandoffGates.js'), 'utf8').includes('assalam'));
  });

  await test('history and audit trail record the whole decision chain', async () => {
    const { m, id } = await proposed();
    await m.evaluate(id);
    m.requestApproval(id);
    m.gate.reject(id, 'arsal', 'prefer a prompt-level fix');
    const h = m.history();
    assert.strictEqual(h[0].status, STATUS.REJECTED);
    assert.strictEqual(h[0].evaluationPassed, true);
    assert.ok(m.store.auditTrail(50).some((a) => a.action === 'status:rejected'));
  });

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) { for (const f of failures) console.log(` - ${f}`); process.exit(1); }
})();
