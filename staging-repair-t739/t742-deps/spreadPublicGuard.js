'use strict';

/**
 * MT5_CONTAINMENT_V1
 * Independently deployable. Stops a public reply from carrying an MT5 test
 * login together with a password. Does not rotate credentials and does not
 * read or change the knowledge base.
 *
 * A pair is an account/login number (5–8 digits) plus a password value.
 * "password reset", a server name, or an account number on its own is not a pair.
 */

const SAFE_SPREAD_REPLY = [
  'Spreads on the FundedElite MetaTrader 5 server are shown in the platform while the market is open. I do not have a fixed spread figure I can quote from here.',
  'I cannot post a test account number or password in this chat. If you need a test login, a teammate can share that access privately.',
].join('\n\n');

const SECRET_WORD = /^(?:reset|resets|recovery|help|change|changes|the|your|you|is|a|an|please|link|email|page|dashboard|button|option|instructions?)$/i;

function passwordValue(text) {
  const raw = String(text || '');
  const labelled = raw.match(/\bpassword\s*[:=]\s*([^\s<]{6,})/i);
  const isValue = raw.match(/\bpassword\s+is\s+([^\s<]{6,})/i);
  const m = labelled || isValue;
  if (!m) return '';
  return String(m[1] || '').replace(/[.,;]+$/g, '');
}

function looksLikeSecret(value) {
  const secret = String(value || '');
  if (secret.length < 6 || SECRET_WORD.test(secret)) return false;
  if (!/[A-Za-z]/.test(secret)) return false;
  return /\d/.test(secret) || /[^A-Za-z0-9]/.test(secret);
}

function hasAccountNumber(text) {
  const raw = String(text || '');
  if (!/\b\d{5,8}\b/.test(raw)) return false;
  return /\b(?:account(?:\s+number)?|login|mt5|metatrader)\b/i.test(raw);
}

function blocksPublicCredentialPair(text) {
  const raw = String(text || '');
  if (!raw.trim()) return false;
  if (!looksLikeSecret(passwordValue(raw))) return false;
  return hasAccountNumber(raw);
}

module.exports = {
  SAFE_SPREAD_REPLY,
  blocksPublicCredentialPair,
};
