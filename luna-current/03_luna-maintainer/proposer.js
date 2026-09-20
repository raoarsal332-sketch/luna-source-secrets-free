'use strict';

/**
 * proposer.js - the LLM writes the change; this module enforces the envelope.
 *
 * A proposal is refused outright if it touches a forbidden path, names no
 * affected files, carries no patch, names no required tests, or names no
 * rollback plan. The system prompt carries Luna's full "do not weaken" list.
 */

const path = require('path');
const { STATUS, sha } = require('./schema');

const SYSTEM = `You are the maintainer engineer for Luna, a customer-support bot for FundedElite running on Intercom (Node.js/Express).
You propose ONE minimal, reversible improvement for the given failure and root cause.

Absolute constraints - you MUST NOT remove or weaken any of these existing behaviours:
existing business rules; system prompts (system-prompt.txt, style-master-prompt.txt, promo prompts);
Intercom webhook handling; customer/teammate/bot/admin identity detection; self-message prevention;
moderator/admin note commands; internal notes vs customer replies; assignment and escalation logic
(Escalations team, Risk team, Jerry, Arsal); human handoff and Fin ownership waiting;
account-number extraction and reuse (accountNumberPrefer, identityEscalateGates);
duplicate-question and duplicate-message prevention; loop prevention; conversation state and history
(statePresend/conversationState); tool and backend integrations (statePresend/tools);
pre-send validation (presendMega hard fails); hallucination safeguards (knowledgeGapGate);
existing formatting behaviour (postProcessModelReply, toHtml, spacing rules).

Further rules:
- Prefer the smallest change that fixes the root cause. Additive over destructive.
- Reuse existing modules; never re-implement a guard that already exists.
- Never modify model weights, secrets, credentials, package-lock.json or deployment scripts.
- Every proposal must name the golden-case ids that prove it and a concrete rollback.
- If the change alters risky behaviour, name a feature flag (an env var) that gates it.
- If you cannot propose a safe fix from the evidence, set change_kind="test_addition" and propose
  only an observability or golden-case improvement.`;

const SCHEMA = JSON.stringify({
  detected_problem: 'string',
  change_kind: 'one of: code_patch, prompt_adjustment, business_rule_adjustment, retrieval_improvement, test_addition, state_tool_handling_fix, observability_improvement',
  affected_paths: ['repo-relative paths, e.g. statePresend/presendMega.js'],
  patch: 'unified diff (--- a/path +++ b/path) OR an explicit prompt/rule delta',
  expected_benefit: 'string',
  regression_risk: 'string - what could break',
  required_tests: ['golden case ids that must pass'],
  rollback_plan: 'string',
  feature_flag: 'env var name or empty string',
  notes: 'string',
}, null, 2);

class ProposalError extends Error {}

/**
 * Shared with deploy.js: re-run at deploy time too (not only here at proposal time) so a
 * proposal object created or mutated by any other path still can't ship a forbidden path.
 */
function validatePaths(paths, forbidden) {
  const clean = [];
  for (let p of paths || []) {
    p = String(p).trim().replace(/^\/+/, '');
    if (!p) continue;
    const low = p.toLowerCase();
    if (p.includes('..') || path.isAbsolute(p)) throw new ProposalError(`unsafe path: ${p}`);
    if ((forbidden || []).some((bad) => low.includes(bad))) throw new ProposalError(`proposal touches a forbidden path: ${p}`);
    clean.push(p);
  }
  if (!clean.length) throw new ProposalError('proposal named no affected paths');
  return clean;
}

function createProposer(cfg, llm, ledger) {
  async function propose(bucket, rootCause, opts) {
    opts = opts || {};
    if (rootCause.insufficientEvidence) {
      throw new ProposalError(`insufficient evidence (confidence ${rootCause.confidence.toFixed(2)} < ${cfg.minConfidence}); collecting more signal instead of guessing`);
    }

    const payload = {
      root_cause: rootCause,
      issue: { code: bucket.code, summary: bucket.summary, occurrences: bucket.occurrences, severity: bucket.severity },
      samples: (bucket.samples || []).slice(-5),
      previously_attempted_and_failed: ledger.priorAttempts(bucket.fingerprint).map((r) => ({ outcome: r.outcome, reason: r.reason })),
      repo_context: String(opts.repoContext || '').slice(0, 6000),
      available_golden_cases: opts.caseIds || [],
    };

    let data;
    try { data = await llm.json(SYSTEM, JSON.stringify(payload, null, 2), SCHEMA); } catch (e) {
      throw new ProposalError(`LLM proposal failed: ${e.message}`);
    }

    const patch = String(data.patch || '').trim();
    if (!patch) throw new ProposalError('proposal contained no patch');
    const requiredTests = (data.required_tests || []).map(String).filter(Boolean);
    if (!requiredTests.length) throw new ProposalError('proposal named no required tests; refusing');
    const rollback = String(data.rollback_plan || '').trim();
    if (!rollback) throw new ProposalError('proposal named no rollback plan; refusing');

    const proposal = {
      id: `prop_${sha(bucket.fingerprint + patch + Date.now())}`,
      fingerprint: bucket.fingerprint,
      code: bucket.code,
      detectedProblem: String(data.detected_problem || bucket.summary).slice(0, 1000),
      rootCause,
      changeKind: String(data.change_kind || 'test_addition'),
      affectedPaths: validatePaths(data.affected_paths, cfg.forbidden),
      patch,
      expectedBenefit: String(data.expected_benefit || '').slice(0, 1000),
      regressionRisk: String(data.regression_risk || 'unspecified').slice(0, 1000),
      requiredTests,
      rollbackPlan: rollback.slice(0, 1000),
      featureFlag: String(data.feature_flag || ''),
      notes: String(data.notes || '').slice(0, 1000),
      status: STATUS.DRAFT,
      createdAt: Date.now(),
      author: 'luna-maintainer',
    };

    const b = ledger.blocked(bucket.fingerprint, patch, !!opts.newEvidence);
    if (b.blocked) {
      proposal.status = STATUS.BLOCKED_BY_LEDGER;
      proposal.notes = `${proposal.notes}\n${b.reason}`.trim();
    }
    return proposal;
  }

  return { propose, ProposalError };
}

module.exports = { createProposer, validatePaths, ProposalError, SYSTEM, SCHEMA };
