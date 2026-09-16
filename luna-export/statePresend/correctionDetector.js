'use strict';

const { stripHtml } = require('./textUtils');
const MARKERS = [
  /^\s*no[,.!]?
+i\s+(?:meant|mean|said|was asking|am asking|asked)\b/i,
  /\bthat(?:'s| is)\s+not\s+what\s+i\s+(?:asked|meant|said|need)\b/i,
  /\bi\s+(?:meant|mean)\s+(?!to\b)/i,
  /\bsorry[,.]?\s+i\s+(?:meant|mean)\b/i,
  /\bactually[,]?\s+(?:it(?:'s| is)|i\s+(?:meant|mean)|the)\b/i,
  /\bnot\s+\S+[^.?!]{0,30},?\s*(?:but|it(?:'s| is))\b/i,
  /\bi(?:'m| am)\s+(?:talking|asking)\s+about\b[^.?!]{0,60}\bnot\b/i,
  /\b(?:wrong|incorrect)\s+(?:account|number|email|challenge|type)\b/i,
  /\bcorrection\b/i,
  /\bi\s+(?:mistyped|typed it wrong|made a typo|wrote it wrong)\b/i,
];
const CHALLENGE_TYPES = ['instant elite', 'instant', 'elite', '1-step', '1 step', 'one step', '2-step', '2 step', 'two step', 'evaluation', 'phase 1', 'phase 2', 'funded'];
function findChallengeType(s) { const t = s.toLowerCase(); for (const ct of [...CHALLENGE_TYPES].sort((a, b) => b.length - a.length)) { if (new RegExp(`\\b${ct.replace(/[-\s]/g, '[-\\s]?')}\\b`, 'i').test(t)) return ct.replace(/\s/g, ' '); } return null; }
function detect(text) {
  const t = stripHtml(text); const base = { isCorrection: false, type: null, field: null, from: null, to: null, text: t }; if (!t) return base;
  let m = t.match(/(?<!\d)(\d{5,7})(?!\d)[^.?!\d]{0,25}?\bnot\b[^\d]{0,15}(?<!\d)(\d{5,7})(?!\d)/i);
  if (m) return { ...base, isCorrection: true, type: 'value', field: 'account_number', from: m[2], to: m[1] };
  m = t.match(/\bnot\b[^\d]{0,15}(?<!\d)(\d{5,7})(?!\d)[^.?!\d]{0,25}?(?<!\d)(\d{5,7})(?!\d)/i);
  if (m) return { ...base, isCorrection: true, type: 'value', field: 'account_number', from: m[1], to: m[2] };
  m = t.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})[^.?!@]{0,25}?\bnot\b[^@]{0,15}([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  if (m) return { ...base, isCorrection: true, type: 'value', field: 'email', from: m[2].toLowerCase(), to: m[1].toLowerCase() };
  const notSplit = t.split(/\bnot\b/i);
  if (notSplit.length >= 2) { const left = findChallengeType(notSplit[0]); const right = findChallengeType(notSplit.slice(1).join(' not ')); if (left && right && left !== right) return { ...base, isCorrection: true, type: 'value', field: 'challenge_type', from: right, to: left }; }
  const marked = MARKERS.some((re) => re.test(t)); if (!marked) return base;
  const ct = findChallengeType(t); if (ct) return { ...base, isCorrection: true, type: 'value', field: 'challenge_type', from: null, to: ct };
  const acct = t.match(/(?<!\d)(\d{5,7})(?!\d)/); if (acct) return { ...base, isCorrection: true, type: 'value', field: 'account_number', from: null, to: acct[1] };
  const email = t.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i); if (email) return { ...base, isCorrection: true, type: 'value', field: 'email', from: null, to: email[0].toLowerCase() };
  return { ...base, isCorrection: true, type: 'meaning' };
}
module.exports = { detect, findChallengeType, CHALLENGE_TYPES, MARKERS };
