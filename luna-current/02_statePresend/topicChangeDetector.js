'use strict';

/**
 * topicChangeDetector.js - decides whether the latest client message starts a
 * genuinely new topic relative to the topics active so far.
 *
 * Conservative by design: providing a requested detail (account number, email),
 * short acknowledgments and corrections are never topic changes.
 */

const { stripHtml, extractTopics, isShortAck, extractAccountNumbers, extractEmail, tokens } = require('./textUtils');
const correction = require('./correctionDetector');

const EXPLICIT_MARKERS = [
  /\b(?:another|one more|a different|a separate|a new|second|unrelated)\s+(?:question|issue|thing|problem|topic|matter|request)\b/i,
  /\b(?:also|additionally|besides that|apart from that|on another note|separately|by the way|btw)\b[,:]?\s+/i,
  /\bforget (?:about )?(?:that|it|the previous)\b/i,
  /\bnever ?mind\b/i,
  /\bnew (?:issue|problem|question)\b/i,
];

const RELATED_TOPIC_GROUPS = [
  ['login', 'platform', 'screenshot', 'account_status'],
  ['challenge', 'rules', 'reset_retry', 'scaling'],
  ['payout', 'kyc', 'account_status'],
  ['promo', 'pricing', 'refund'],
];

function related(a, b) {
  if (a === b) return true;
  return RELATED_TOPIC_GROUPS.some((g) => g.includes(a) && g.includes(b));
}

/**
 * @param {string} text latest client message
 * @param {string[]} previousTopics topics active before this message
 * @param {{minTokens?: number}} [opts]
 * @returns {{changed:boolean, explicit:boolean, newTopics:string[], reason:string}}
 */
function detect(text, previousTopics, opts) {
  const t = stripHtml(text);
  const prev = Array.isArray(previousTopics) ? previousTopics : [];
  const minTokens = (opts && opts.minTokens) || 3;
  const base = { changed: false, explicit: false, newTopics: [], reason: 'none' };
  if (!t) return base;
  if (isShortAck(t)) return { ...base, reason: 'short-ack' };
  if (correction.detect(t).isCorrection) return { ...base, reason: 'correction' };

  const toks = tokens(t);
  // Only a requested detail (account number / email) with no other content.
  const detailOnly = (extractAccountNumbers(t).length || extractEmail(t)) && toks.filter((x) => !/^\d+$/.test(x) && !x.includes('@')).length <= 2;
  if (detailOnly) return { ...base, reason: 'detail-only' };

  const topics = extractTopics(t);
  const explicit = EXPLICIT_MARKERS.some((re) => re.test(t));
  const newTopics = topics.filter((x) => !prev.some((p) => related(p, x)));

  if (!prev.length) return { ...base, explicit, newTopics: topics, reason: 'first-topic' };
  if (explicit && (newTopics.length || toks.length >= minTokens)) {
    return { changed: true, explicit: true, newTopics: newTopics.length ? newTopics : topics, reason: 'explicit-marker' };
  }
  if (newTopics.length && !topics.some((x) => prev.some((p) => related(p, x))) && toks.length >= minTokens) {
    return { changed: true, explicit: false, newTopics, reason: 'disjoint-topics' };
  }
  return { ...base, newTopics, reason: newTopics.length ? 'mixed-topics' : 'same-topic' };
}

module.exports = { detect, related, EXPLICIT_MARKERS };
