'use strict';
/**
 * V12 final outbound gate — APPROVED SENDABLE ALLOWLIST only.
 *
 * Why a V11-style semantic claim denylist is not restored here:
 *   1. execute() builds the customer body only from buildApprovedBody() /
 *      sendable catalog rows (never model prose).
 *   2. preparedDraft free text is ignored unless it already equals an
 *      allowlisted composition.
 *   3. assertAllowlistedFinal admits only sendable answer bodies, allowlisted
 *      caveat templates, and an exact pure-greeting set (no claim-bearing
 *      Hello/Hi/Thanks chunks).
 * Therefore any free-text claim (KYC/payout/breach/…) cannot pass this gate
 * unless it is byte-identical to an owner-approved answer — which those claims
 * are not. See author tests: welcome-claim-bypass + free-text-cannot-reach-send.
 */
const approved = require('./faqApprovedAnswers');

/**
 * @param {string} body
 * @param {object} [opts]
 * @param {string[]} [opts.answerIds]
 * @param {string} [opts.answersPath]
 * @returns {Promise<{ok:boolean, body:string, removed:number, blocked:object[], reason:string}>}
 */
async function gateFinalOutbound(body, opts) {
  opts = opts || {};
  const text = String(body || '');
  const ids = opts.answerIds || opts.planAnswerIds || [];
  if (!ids.length) {
    return { ok: false, body: '', removed: 0, blocked: [], reason: 'missing-answer-ids' };
  }
  // Pending / provisional ids are not in the sendable map → reject.
  for (const id of ids) {
    if (!approved.get(id, opts.answersPath)) {
      return {
        ok: false,
        body: '',
        removed: 1,
        blocked: [{ reason: 'nonsendable-or-unknown-answer-id', answerId: id }],
        reason: 'nonsendable-or-unknown-answer-id',
      };
    }
  }
  const check = approved.assertAllowlistedFinal(text, ids, opts.answersPath);
  if (!check.ok) {
    return {
      ok: false,
      body: '',
      removed: 1,
      blocked: [{ reason: check.reason }],
      reason: check.reason,
    };
  }
  return {
    ok: true,
    body: text,
    removed: 0,
    blocked: [],
    reason: check.reason,
    answerIds: check.answerIds,
    coreHashes: check.coreHashes,
  };
}

/** @deprecated V11 API — denylist removed; structural scan is a no-op. */
function structuralScan(body) {
  return { body: String(body || ''), removed: 0, blocked: [] };
}

function sentenceVerdict() {
  return null;
}

module.exports = {
  gateFinalOutbound,
  structuralScan,
  sentenceVerdict,
  assertAllowlistedFinal: approved.assertAllowlistedFinal,
};
