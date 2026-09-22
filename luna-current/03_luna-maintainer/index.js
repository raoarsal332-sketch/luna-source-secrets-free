'use strict';

/**
 * luna-maintainer - observe, analyse, propose, test, score, then STOP for a human.
 *
 * Production integration is ONE line in index.js after the existing Hook P:
 *
 *   const __maintainer = require('./luna-maintainer').create();
 *   ...
 *   const __presend = await __statePresend.gate({ ... });
 *   __maintainer.observe(__presend, { conversationId, messageId, clientText: text, ... });
 *
 * observe() never throws, never blocks and never changes the reply.
 * Nothing in this package modifies Luna without an explicit human approval.
 */

const { load } = require('./config');
const { createStore } = require('./store');
const { createCollector } = require('./collector');
const { createLedger } = require('./ledger');
const { createAnalyzer } = require('./analyzer');
const { createProposer, ProposalError } = require('./proposer');
const { createEvaluator } = require('./evaluator');
const { createGate } = require('./approval');
const { createDeployer } = require('./deploy');
const { createOpenAiLlm, createStubLlm } = require('./llm');
const runner = require('./runner');
const scoring = require('./scoring');
const { STATUS } = require('./schema');
const { log } = require('./observability');

function create(opts) {
  opts = opts || {};
  const cfg = load(opts.config);
  const store = opts.store || createStore(cfg);
  const llm = opts.llm || createOpenAiLlm(cfg);
  const ledger = createLedger(store);
  const collector = createCollector(cfg, store);
  const analyzer = createAnalyzer(cfg, llm);
  const proposer = createProposer(cfg, llm, ledger);
  const evaluator = createEvaluator(cfg);
  const gate = createGate(cfg, store, ledger);
  const deployer = createDeployer(cfg, store, ledger);

  /** Steps 1-3: detect -> analyse -> propose. Stops early rather than guessing. */
  async function processIssue(fingerprint, opts2) {
    opts2 = opts2 || {};
    const bucket = store.getEvent(fingerprint);
    if (!bucket) return { status: 'no_events' };

    const rootCause = await analyzer.analyze(bucket, opts2.context);
    log('root_cause', { fingerprint, category: rootCause.category, confidence: rootCause.confidence, insufficient: rootCause.insufficientEvidence });
    if (rootCause.insufficientEvidence) return { status: 'insufficient_evidence', rootCause };

    let proposal;
    try {
      proposal = await proposer.propose(bucket, rootCause, {
        repoContext: opts2.repoContext,
        newEvidence: opts2.newEvidence,
        caseIds: runner.loadCases([cfg.casesDir, cfg.goldenDir]).map((c) => c.id),
      });
    } catch (e) {
      if (e instanceof ProposalError || e.name === 'ProposalError') {
        log('proposal_refused', { fingerprint, reason: e.message });
        return { status: 'no_proposal', reason: e.message };
      }
      throw e;
    }

    store.saveProposal(proposal);
    if (proposal.status === STATUS.BLOCKED_BY_LEDGER) {
      log('proposal_blocked', { proposalId: proposal.id, note: proposal.notes });
      return { status: 'blocked_by_ledger', proposal };
    }
    log('proposal_created', { proposalId: proposal.id, changeKind: proposal.changeKind, paths: proposal.affectedPaths });
    return { status: 'proposed', proposal };
  }

  /** Steps 4-5: isolated sandbox test + objective scoring. */
  async function evaluate(proposalId) {
    const p = store.getProposal(proposalId);
    if (!p) throw new Error(`unknown proposal ${proposalId}`);
    if (p.status === STATUS.DRAFT) store.setStatus(proposalId, STATUS.EVALUATING, 'evaluator');
    const rep = await evaluator.evaluate(p);
    store.saveEval(rep);
    try { store.setStatus(proposalId, rep.passed ? STATUS.EVALUATED : STATUS.FAILED_EVALUATION, 'evaluator'); } catch (_) { /* terminal */ }
    return rep;
  }

  /** Step 6: the gate. Nothing past this point happens without a named human. */
  const requestApproval = (id) => gate.submitForApproval(id);
  async function approveAndDeploy(id, approver, note) {
    gate.approve(id, approver, note);
    return deployer.deploy(id, approver);
  }

  /** Run the golden suite against production as a standalone self-test. */
  async function selfTest() {
    const cases = runner.loadCases([cfg.casesDir, cfg.goldenDir]);
    const results = await runner.runSuite(cfg.lunaRoot, cases);
    return { results, summary: scoring.aggregate(results) };
  }

  return {
    cfg, store, ledger, gate, deployer, collector, runner, scoring,
    observe: collector.observe,
    sweepAnalytics: collector.sweepAnalytics,
    actionable: collector.actionable,
    processIssue, evaluate, requestApproval, approveAndDeploy, selfTest,
    history: store.history,
  };
}

module.exports = { create, createStubLlm, STATUS };
