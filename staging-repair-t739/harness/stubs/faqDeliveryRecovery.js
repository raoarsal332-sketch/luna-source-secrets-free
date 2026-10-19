'use strict';
// UNKNOWN is a delivery outcome, not proof of non-execution. Never expire into a blind resend.
const T = require('./statePresend/textUtils');
const text = (s) => T.normalize(T.stripHtml(s));

/**
 * Authoritative receipt reconciliation for a pending/unknown public FAQ write.
 * Confirmed only with an operation-linked conversation_part receipt that matches
 * conversation, body and attempt window. Shared-seat body matches are visible
 * answers only — authorship stays unresolved (no blind duplicate send).
 */
function examine(record, full, parts, d) {
  const cid = String(record.cid || '');
  if (!full || String(full.id) !== cid || !Array.isArray(parts)) {
    return { status: record.status || 'unknown', authorship: 'unresolved', reason: 'history-unavailable' };
  }
  const own = new Set(
    (d.known ? d.known(cid) : [])
      .filter((p) => p.kind === 'comment')
      .map((p) => String(p.id))
  );
  const linked = (record.receiptIds || []).map(String).filter(Boolean);
  const body = record.body || '';
  const since = Number(record.attemptedAtSec || 0);
  const exact = parts.filter(
    (p) =>
      linked.includes(String(p.id)) &&
      own.has(String(p.id)) &&
      p.part_type === 'comment' &&
      text(p.body) === text(body) &&
      Number(p.created_at) >= since
  );
  if (
    record.receiptProof &&
    record.receiptProof.operationId === record.operationId &&
    record.receiptProof.bodyHash === record.transportBodyHash &&
    linked.length === 1 &&
    record.receiptProof.receiptId === linked[0] &&
    exact.length === 1
  ) {
    return { status: 'confirmed', receiptIds: linked, authorship: 'luna-linked-receipt' };
  }
  if (linked.length === 1 && exact.length === 1 && own.has(linked[0])) {
    return { status: 'confirmed', receiptIds: linked, authorship: 'luna-linked-receipt' };
  }
  const before = new Set((record.previousIds || []).map(String));
  const visible = parts.filter(
    (p) =>
      p.part_type === 'comment' &&
      !before.has(String(p.id)) &&
      text(p.body) === text(body) &&
      Number(p.created_at) >= since
  );
  return {
    status: 'unknown',
    visibleAnswerIds: visible.map((p) => String(p.id)),
    authorship: 'unresolved',
  };
}

/**
 * Quarantine is per turn / question / approved-answer id — not an indefinite CID-wide FAQ veto.
 * Legacy unresolved rows without turn/question/answer metadata stay fail-closed for that CID.
 */
function conflicts(record, plan) {
  if (!record || !plan) return true;
  if (record.turnId && record.turnId === plan.turnId) return true;
  if (record.questionHash && record.questionHash === plan.questionHash) return true;
  if (record.intentKey && plan.intentKey && record.intentKey === plan.intentKey) return true;
  // V12: same approved answer id already pending/unknown/confirmed in flight → conflict.
  if (record.answerId && plan.answerIds && plan.answerIds.includes(record.answerId)) return true;
  if (record.answerIds && plan.answerIds) {
    if (record.answerIds.some((id) => plan.answerIds.includes(id))) return true;
  }
  if (Array.isArray(record.faqQueries) && Array.isArray(plan.faq) && record.faqQueries.length) {
    const old = new Set(record.faqQueries.map((q) => text(q)));
    if (plan.faq.some((q) => old.has(text(q)))) return true;
  }
  if (!record.turnId && !record.questionHash && !record.answerId && !(record.answerIds || []).length) return true;
  return false;
}

module.exports = { examine, conflicts };
