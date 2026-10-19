'use strict';
/**
 * coversAllIntents: every substantive intent must be stated in that body.
 * Intents are splitCandidateAsks (question mark / newline) plus a
 * coordinating "and" or semicolon, because two intents joined that way
 * are uncovered unless one body states both.
 *
 * A catalog fact is a content stem that already occurs in the sendable
 * pool. The body states a clause when it contains every such fact.
 * Words that occur in no approved body are paraphrase glue and are not
 * required. Concealed spelling (a letter/digit mix that is not an
 * account-size like 50k, or a symbol broken through a word) is not
 * deobfuscated: no body covers.
 */

const { splitIntents } = require('./packsAccount');

const STOP = new Set(
  'a an the of to and or is are do does did what which who how when where that this for with on in as be it its from by if then than not no yes can may will should would could i my me you your we our they them their there about into over after before only also just so but at am was were been being any all has have had per rather whether still than'.split(
    /\s+/
  )
);

const NUMBER_WORD = Object.freeze({
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  fifteen: '15',
  twenty: '20',
  sixty: '60',
  eighty: '80',
  ninety: '90',
});

function rawTokens(s) {
  return String(s || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
}

function stem(w) {
  if (NUMBER_WORD[w]) return NUMBER_WORD[w];
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

function hasConcealedSpelling(normalized) {
  const s = String(normalized || '');
  if (/[a-z][^a-z0-9\s'][a-z0-9]|[a-z0-9][^a-z0-9\s'][a-z]/i.test(s)) return true;
  const toks = s.match(/[\p{L}\p{N}]+/gu) || [];
  for (const tok of toks) {
    if (/[a-z]/i.test(tok) && /\d/.test(tok) && !/^\d+k$/i.test(tok) && !/^x\d+$/i.test(tok)) return true;
  }
  return false;
}

function isSubstantive(clause) {
  if (rawTokens(clause).length < 2) return false;
  if (/^(?:hi|hello|hey|thanks|thank you|good morning|good afternoon)\b/.test(clause)) return false;
  return true;
}

function catalogStemSet(rows) {
  const set = new Set();
  for (const row of rows) {
    for (const tok of rawTokens(row.body)) set.add(stem(tok));
  }
  return set;
}

function clauseFacts(clause, catalog) {
  const facts = [];
  const seen = new Set();
  for (const tok of rawTokens(clause)) {
    const s = stem(tok);
    if (STOP.has(s) || STOP.has(tok)) continue;
    if (!/^\d+$/.test(s) && s.length < 4) continue;
    if (!catalog.has(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    facts.push(s);
  }
  return facts;
}

function coversAllIntents(normalized, body, catalog) {
  if (hasConcealedSpelling(normalized)) return false;
  const clauses = splitIntents(normalized).filter(isSubstantive);
  if (!clauses.length) return false;
  const bodyStems = new Set(rawTokens(body).map(stem));
  let sawFact = false;
  for (const clause of clauses) {
    const facts = clauseFacts(clause, catalog);
    if (!facts.length) return false;
    sawFact = true;
    for (const fact of facts) {
      if (!bodyStems.has(fact)) return false;
    }
  }
  return sawFact;
}

module.exports = {
  coversAllIntents,
  hasConcealedSpelling,
  catalogStemSet,
  rawTokens,
  stem,
};
