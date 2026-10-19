'use strict';
/**
 * Coverage gate for Packs. A body covers an ask when it states every
 * proposition the ask triggers. Propositions are the frozen catalog facts
 * in packs-propositions.json. Cosine does not decide membership.
 * Concealed spelling (leet inside a token, or a symbol broken through a
 * word) triggers no fact and is not rewritten into a product id.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, 'packs-propositions.json');

function load() {
  const raw = fs.readFileSync(FILE);
  const data = JSON.parse(raw.toString('utf8'));
  if (!data || !Array.isArray(data.facts)) throw new Error('invalid-packs-propositions');
  return { raw, data };
}

function sha256() {
  return crypto.createHash('sha256').update(load().raw).digest('hex');
}

function concealedSpelling(normalized) {
  const s = String(normalized || '');
  if (/[a-z][@^#*~][a-z0-9]|[a-z0-9][@^#*~][a-z]/i.test(s)) return true;
  const toks = s.match(/[\p{L}\p{N}]+/gu) || [];
  for (const tok of toks) {
    if (/[a-z]/i.test(tok) && /\d/.test(tok) && !/^\d+k$/i.test(tok) && !/^x\d+$/i.test(tok)) return true;
  }
  return false;
}

function asked(fact, text) {
  const any = Array.isArray(fact.any) ? fact.any : [];
  const all = Array.isArray(fact.all) ? fact.all : [];
  if (!any.length && !all.length) return false;
  if (any.length && !any.some((phrase) => text.includes(phrase))) return false;
  if (all.length && !all.every((phrase) => text.includes(phrase))) return false;
  return true;
}

function triggeredFacts(normalized) {
  const text = String(normalized || '');
  if (concealedSpelling(text)) return [];
  return load().data.facts.filter((fact) => asked(fact, text));
}

function coversPart(normalized, partId) {
  const facts = triggeredFacts(normalized);
  if (!facts.length) return false;
  return facts.every((fact) => Array.isArray(fact.statedBy) && fact.statedBy.includes(partId));
}

module.exports = {
  FILE,
  sha256,
  concealedSpelling,
  triggeredFacts,
  coversPart,
};
