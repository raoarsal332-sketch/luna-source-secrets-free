'use strict';

/**
 * evaluator.js - baseline vs candidate, in isolation.
 *
 * Fixing the reported case is NOT sufficient. A change passes only when the
 * target cases go green AND no previously passing case regresses AND every
 * objective gate holds.
 */

const sandbox = require('./sandbox');
const runner = require('./runner');
const scoring = require('./scoring');
const { sha } = require('./schema');
const { log } = require('./observability');

function createEvaluator(cfg) {
  async function evaluate(proposal) {
    const cases = runner.loadCases([cfg.casesDir, cfg.goldenDir]);
    const targets = new Set(proposal.requiredTests || []);

    // --- baseline: clean copy, no patch
    const sb1 = sandbox.create(cfg.lunaRoot, cfg.sandboxDir ? `${cfg.sandboxDir}-base` : '');
    let baseResults;
    const restore1 = sb1.isolateEnv();
    try { baseResults = await runner.runSuite(sb1.root, cases); } finally { restore1(); sb1.destroy(); }
    const baseline = scoring.aggregate(baseResults);

    // --- candidate: fresh copy + patch
    const sb2 = sandbox.create(cfg.lunaRoot, cfg.sandboxDir ? `${cfg.sandboxDir}-cand` : '');
    const restore2 = sb2.isolateEnv();
    let candResults;
    let applied;
    try {
      applied = sb2.applyPatch(proposal.patch);
      if (applied.ok) candResults = await runner.runSuite(sb2.root, cases);
    } finally { restore2(); sb2.destroy(); }

    if (!applied.ok) {
      const rep = {
        id: `eval_${sha(proposal.id + Date.now())}`, proposalId: proposal.id, at: Date.now(),
        baseline, candidate: baseline, deltas: scoring.deltas(baseline, baseline),
        gateFailures: [applied.detail], fixedTargets: false, newRegressions: [],
        caseResults: baseResults, passed: false, patchApplied: false,
      };
      log('evaluated', { proposalId: proposal.id, passed: false, reason: 'patch_failed' });
      return rep;
    }

    const candidate = scoring.aggregate(candResults);
    const baseById = new Map(baseResults.map((r) => [r.id, r]));
    const newRegressions = candResults
      .filter((r) => !r.passed && baseById.get(r.id) && baseById.get(r.id).passed)
      .map((r) => r.id);
    const fixedTargets = targets.size > 0
      && [...targets].every((t) => candResults.some((r) => r.id === t && r.passed));
    const gateFailures = scoring.gateFailures(cfg, baseline, candidate);

    const rep = {
      id: `eval_${sha(proposal.id + Date.now())}`, proposalId: proposal.id, at: Date.now(),
      baseline, candidate, deltas: scoring.deltas(baseline, candidate),
      gateFailures, fixedTargets, newRegressions, caseResults: candResults,
      patchApplied: true,
      passed: fixedTargets && newRegressions.length <= cfg.gateMaxNewRegressions && gateFailures.length === 0,
    };
    log('evaluated', { proposalId: proposal.id, passed: rep.passed, regressions: newRegressions, gates: gateFailures });
    return rep;
  }

  return { evaluate };
}

module.exports = { createEvaluator };
