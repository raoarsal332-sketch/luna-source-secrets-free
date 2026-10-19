'use strict';
/**
 * accountCheckRequest.js — ACCOUNT_CHECK_REQUEST_V1
 *
 * "212062 can you please check this account." is a request for a teammate to open THIS client's
 * account. Live conversation 215476067497045 (2026-09-23): the backend predicates did not know the
 * verbs check / look into / verify, and only recognised an account number written AFTER the word
 * "account", so the ask scored as knowledge-answerable. Luna sent internal-note text publicly, never
 * escalated, and later told the client the case was "already with the team" (it was not).
 *
 * A request counts only when BOTH hold:
 *   1. it is addressed to staff ("can you / could you / please / kindly ... check|verify|look into|
 *      review|investigate|inspect|confirm", or starts with such an imperative), and
 *   2. it names a concrete account: an account-style identifier, or "my/this/that/the account",
 *      or "my payout/withdrawal/kyc/breach/dashboard/challenge".
 * "How do I check my account?" (self-service how-to) is excluded, and so is anything with no
 * account reference ("can you check the scalping rules?").
 */

const STAFF_VERB =
  String.raw`(?:check|re-?check|look\s+(?:into|at|over)|verify|review|investigate|inspect|confirm|see\s+(?:what|why)|find\s+out)`;
const STAFF_DIRECTED_RE = new RegExp(
  String.raw`\b(?:can|could|would|will|pls|plz|please|kindly)\s+(?:you\s+|u\s+|ya\s+|someone\s+|somebody\s+|anyone\s+|the\s+team\s+|your\s+team\s+)?(?:please\s+|pls\s+|plz\s+|kindly\s+|just\s+|quickly\s+)?${STAFF_VERB}\b` +
  String.raw`|^\s*(?:\d{5,12}\s*[,.:-]?\s*)?(?:please\s+|pls\s+|plz\s+|kindly\s+)?${STAFF_VERB}\b` +
  String.raw`|\b(?:need|want)\s+(?:you|someone|the\s+team)\s+to\s+${STAFF_VERB}\b`,
  'i'
);
const HOW_TO_RE = /\bhow\s+(?:do|can|should|would)\s+i\b|\bhow\s+to\b|\bwhere\s+(?:do|can)\s+i\b/i;
const ACCOUNT_ID_RE =
  /\b(?:account|acc|acct|login|mt[45])\s*(?:number|no\.?|#|id)?\s*[:#-]?\s*[a-z]{0,3}#?\d{5,12}\b|\bd#\s?\d{5,12}\b|\bcha\d{5,12}\b|(?:^|\s)\d{6,9}(?=\s|[.,!?]|$)/i;
const OWN_ACCOUNT_RE =
  /\b(?:my|this|that|the)\s+(?:account|acc|acct|trading\s+account|funded\s+account|challenge\s+account)\b|\bmy\s+(?:payout|withdrawal|kyc|verification|breach|dashboard|challenge|funded|balance|equity|drawdown)\b/i;
// Private trade/order records are backend data even when the client omits the
// word "account". A general rule about IP changes has no staff-check verb.
const OWN_RECORD_RE = /\b(?:my|our)\s+(?:\w+\s+){0,2}(?:trade|order|transaction|execution|position|recorded\s+ip|ip\s+address)\b|\b(?:ip\s+address|location)\s+recorded\s+for\s+(?:my|our)\s+(?:\w+\s+){0,2}(?:trade|order|account)\b/i;
const REFERRED_RECORD_RE = /\b(?:that|this)\s+(?:trade|order|transaction|execution|position)\b/i;

function isExplicitAccountCheckRequest(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 600) return false;
  if (HOW_TO_RE.test(t)) return false;
  if (!STAFF_DIRECTED_RE.test(t)) return false;
  return ACCOUNT_ID_RE.test(t) || OWN_ACCOUNT_RE.test(t) || OWN_RECORD_RE.test(t) ||
    (REFERRED_RECORD_RE.test(t) && /\b(?:i|my|we|our)\b/i.test(t));
}

module.exports = { isExplicitAccountCheckRequest };
