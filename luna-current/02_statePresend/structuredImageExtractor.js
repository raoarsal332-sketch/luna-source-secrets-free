'use strict';

/**
 * structuredImageExtractor.js - pulls support-relevant structured fields out
 * of text already produced by the existing vision step (OCR / description).
 *
 * It never requests images and never talks to a vision API itself: the live
 * image handling stays as is (imageAskGuard preserved). shouldExtract() gates
 * usage so it is not forced on every image.
 */

const T = require('./textUtils');

const ERROR_CODE_RE = /\b(?:error|err|code)[\s:#-]*([A-Z]{0,4}[-_]?\d{2,6})\b/i;
const ERROR_MSG_RE = /\b(invalid account|invalid password|wrong password|no connection|common error|account disabled|trade disabled|not enough money|insufficient (?:funds|margin)|market (?:is )?closed|authorization failed|login failed|connection (?:lost|failed)|invalid credentials|old version|too many requests|order (?:is )?locked|off quotes|requote|trade context busy)\b/i;
const STATUS_RE = /\b(active|inactive|pending|passed|failed|breached|violated|disabled|enabled|suspended|under review|approved|rejected|funded|in progress|completed|awaiting)\b/i;
const DATE_RE = /\b(\d{4}[-/.]\d{2}[-/.]\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)\b/;
const TIME_RE = /\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?)\b/i;
const BALANCE_RE = /\b(?:balance|equity)[\s:]*\$?\s*(-?\d[\d,]*(?:\.\d+)?)/i;
const SERVER_RE = /\b(?:server)[\s:]*([A-Za-z0-9-]+(?:-[A-Za-z0-9]+)*)/i;

/**
 * @param {string} visionText text produced by the existing vision/OCR step
 * @returns {{fields:object, found:string[], empty:boolean}}
 */
function extract(visionText) {
  const t = T.stripHtml(visionText);
  const fields = {};
  if (!t) return { fields, found: [], empty: true };
  const accts = T.extractAccountNumbers(t);
  if (accts.length) fields.account_number = accts[0];
  let m = t.match(ERROR_CODE_RE); if (m) fields.error_code = m[1].toUpperCase();
  m = t.match(ERROR_MSG_RE); if (m) fields.error_message = m[1];
  m = t.match(STATUS_RE); if (m) fields.status = m[1].toLowerCase();
  m = t.match(DATE_RE); if (m) fields.date = m[1];
  m = t.match(TIME_RE); if (m && !fields.date) fields.time = m[1];
  m = t.match(BALANCE_RE); if (m) fields.balance = m[1].replace(/,/g, '');
  m = t.match(SERVER_RE); if (m) fields.server = m[1];
  const email = T.extractEmail(t); if (email) fields.email = email;
  const found = Object.keys(fields);
  return { fields, found, empty: found.length === 0 };
}

const EXTRACT_TOPICS = new Set(['login', 'platform', 'account_status', 'payout', 'kyc', 'refund', 'reset_retry']);

/**
 * Only extract when structured fields are actually useful.
 */
function shouldExtract(ctx) {
  ctx = ctx || {};
  const s = ctx.state || {};
  const hasImage = (ctx.imageCount || 0) > 0 || (s.images && s.images.received > 0);
  if (!hasImage) return { extract: false, reason: 'no-image' };
  if (s.last_client_is_short_ack && ctx.imageCount === 0) return { extract: false, reason: 'short-ack' };
  const topics = new Set([...(s.active_topics || []), ...T.extractTopics(ctx.text || s.last_client_message || '')]);
  const needsAccount = !(s.known_details && s.known_details.account_number);
  const topical = [...topics].some((t) => EXTRACT_TOPICS.has(t));
  if (topical || needsAccount) return { extract: true, reason: topical ? 'support-relevant-topic' : 'account-number-missing' };
  return { extract: false, reason: 'no-structured-need' };
}

/**
 * Merge extracted fields into known_details without overriding client-stated values.
 */
function mergeIntoState(state, extracted) {
  if (!state || !extracted || extracted.empty) return state;
  state.known_details = state.known_details || {};
  state.image_fields = { ...(state.image_fields || {}), ...extracted.fields };
  if (extracted.fields.account_number && !state.known_details.account_number) state.known_details.account_number = extracted.fields.account_number;
  if (extracted.fields.email && !state.known_details.email) state.known_details.email = extracted.fields.email;
  return state;
}

module.exports = { extract, shouldExtract, mergeIntoState, EXTRACT_TOPICS };
