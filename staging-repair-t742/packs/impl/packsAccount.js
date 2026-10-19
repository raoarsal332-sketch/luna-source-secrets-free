'use strict';
/**
 * Account-state boundary for exclusive personal and mixed asks.
 * This is not packsProductHint and it does not set exclusive.
 *
 * A clause is account-state when it asks for the speaker's own current
 * account fact. A clause that opens with "if" is a hypothetical rule,
 * not that fact. The product title "my packs" (the tab that stores
 * unopened packs) is not possession. "My Packs tab", "in my packs",
 * and "on my packs" are.
 */

function splitIntents(normalized) {
  const parts = String(normalized || '')
    .split(/(?<=[?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const part of parts.length ? parts : [String(normalized || '').trim()]) {
    const bits = part.split(/\s*;\s+|\s*,\s+and\s+|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
    out.push(...(bits.length ? bits : [part]));
  }
  return out.filter(Boolean);
}

function clauseIsAccountState(clause) {
  if (/^\s*if\b/.test(clause)) return false;
  // A how-to and a speaker who is only naming the rule are not account state.
  if (/\bhow do i\b/.test(clause)) return false;
  if (/\bi am asking\b/.test(clause) || /\bi'm asking\b/.test(clause)) return false;
  if (/\bi might\b/.test(clause)) return false;
  if (/\bi have a question\b/.test(clause)) return false;
  const stripped = clause
    .replace(/\bmy packs tab\b/g, 'MYTAB')
    .replace(/\b(?:in|on) my packs\b/g, 'INPACKS')
    .replace(/\bmy my packs\b/g, 'MYMY')
    .replace(/\bmy packs\b/g, '');
  if (/\bmy\b|MYTAB|INPACKS|MYMY/.test(stripped)) return true;
  if (/\bmine\b/.test(clause)) return true;
  if (/\b(?:did|have|am|was|has) i\b/.test(clause)) return true;
  if (/\bi (?:submitted|opened|bought|paid|sent|typed|funded|pulled|own|just|already|have|had|got|received|redeemed|purchased|was|were|used|applied|claimed|cancelled|canceled)\b/.test(clause)) return true;
  if (/\bi've\b/.test(clause)) return true;
  if (/\bi'm\b/.test(clause)) return true;
  if (/\bof mine\b/.test(clause)) return true;
  if (/\bi have left\b/.test(clause)) return true;
  if (/\b(?:we|our)\b/.test(clause) && /\b(?:account|balance|order|login|pack)\b/.test(clause)) return true;
  return false;
}

function isPersonalOrMixed(normalized) {
  return splitIntents(normalized).some(clauseIsAccountState);
}

module.exports = {
  splitIntents,
  isPersonalOrMixed,
};
