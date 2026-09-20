'use strict';

/** ledger.js - memory of rejected / failed / rolled-back fixes.
 *  A patch that already failed cannot be re-proposed without new evidence. */

const { patchHash } = require('./schema');

const REJECTED = 'rejected';
const FAILED_EVAL = 'failed_evaluation';
const ROLLED_BACK = 'rolled_back';
const SUCCEEDED = 'succeeded';

function createLedger(store) {
  function record(fingerprint, patch, outcome, reason) {
    store.ledgerAdd(fingerprint, patchHash(patch), outcome, String(reason || '').slice(0, 400));
  }
  function blocked(fingerprint, patch, newEvidence) {
    const row = store.ledgerGet(fingerprint, patchHash(patch));
    if (!row) return { blocked: false, reason: '' };
    if (row.outcome === SUCCEEDED) return { blocked: true, reason: 'This exact change was already deployed successfully.' };
    if (newEvidence) return { blocked: false, reason: '' };
    return { blocked: true, reason: `Previously ${row.outcome}: ${row.reason} - blocked until new evidence is attached.` };
  }
  const priorAttempts = (fingerprint) => store.ledgerFor(fingerprint);
  return { record, blocked, priorAttempts, REJECTED, FAILED_EVAL, ROLLED_BACK, SUCCEEDED };
}

module.exports = { createLedger, REJECTED, FAILED_EVAL, ROLLED_BACK, SUCCEEDED };
