'use strict';

/** approval.js - the human gate. The only path from "proposed" to "deployable". */

const { STATUS, looksHuman } = require('./schema');
const { FAILED_EVAL, REJECTED } = require('./ledger');

const ALLOWED = {
  [STATUS.DRAFT]: [STATUS.EVALUATING, STATUS.REJECTED, STATUS.BLOCKED_BY_LEDGER],
  [STATUS.EVALUATING]: [STATUS.EVALUATED, STATUS.FAILED_EVALUATION],
  [STATUS.EVALUATED]: [STATUS.AWAITING_APPROVAL, STATUS.FAILED_EVALUATION],
  [STATUS.AWAITING_APPROVAL]: [STATUS.APPROVED, STATUS.REJECTED],
  [STATUS.APPROVED]: [STATUS.DEPLOYED, STATUS.REJECTED],
  [STATUS.DEPLOYED]: [STATUS.ROLLED_BACK],
  [STATUS.FAILED_EVALUATION]: [STATUS.REJECTED, STATUS.DRAFT],
  [STATUS.BLOCKED_BY_LEDGER]: [STATUS.REJECTED, STATUS.DRAFT],
  [STATUS.REJECTED]: [],
  [STATUS.ROLLED_BACK]: [],
};

class ApprovalError extends Error {}

function createGate(cfg, store, ledger) {
  function transition(id, to, actor, detail) {
    const p = store.getProposal(id);
    if (!p) throw new ApprovalError(`unknown proposal ${id}`);
    if (!(ALLOWED[p.status] || []).includes(to)) throw new ApprovalError(`illegal transition ${p.status} -> ${to}`);
    return store.setStatus(id, to, actor, detail);
  }

  function submitForApproval(id) {
    const rep = store.latestEval(id);
    if (!rep) throw new ApprovalError('cannot request approval before evaluation');
    const p = store.getProposal(id);
    if (!rep.passed) {
      // record the failure FIRST - this call is about to throw
      ledger.record(p.fingerprint, p.patch, FAILED_EVAL, [...rep.gateFailures, ...rep.newRegressions].join('; ') || 'did not fix target cases');
      if (p.status !== STATUS.FAILED_EVALUATION) transition(id, STATUS.FAILED_EVALUATION, 'evaluator', rep.gateFailures.join('; '));
      throw new ApprovalError('evaluation failed; proposal is not eligible for approval');
    }
    return transition(id, STATUS.AWAITING_APPROVAL, 'maintainer', '');
  }

  const pending = () => store.proposals(STATUS.AWAITING_APPROVAL);

  function approve(id, approver, note) {
    if (!looksHuman(approver)) throw new ApprovalError('approval requires a named human approver');
    return transition(id, STATUS.APPROVED, approver, note || '');
  }

  function reject(id, approver, reason) {
    if (!reason) throw new ApprovalError('rejection requires a reason (it is stored to prevent re-proposal)');
    const p = store.getProposal(id);
    const out = transition(id, STATUS.REJECTED, approver || 'human', reason);
    ledger.record(p.fingerprint, p.patch, REJECTED, reason);
    return out;
  }

  return { transition, submitForApproval, pending, approve, reject, ApprovalError };
}

module.exports = { createGate, ApprovalError, ALLOWED };
