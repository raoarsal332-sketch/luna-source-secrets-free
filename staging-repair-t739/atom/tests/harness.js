'use strict';
const path = require('path');
const sel = require('../atomAnswerSelect');

const GATE_EN = Object.freeze({ lang: 'en' });

function run(text, extra) {
  return sel.selectAtomAnswer(text, Object.assign({ enabled: true, languageGate: GATE_EN }, extra || {}));
}

/** Returns { pass, why }. Never treats a sendable answer on a noAnswer case as pass. */
function check(expect, r) {
  if (expect.answer) {
    if (r.abstain) return { pass: false, why: 'abstained:' + r.reason };
    if (r.answerId !== expect.answer) return { pass: false, why: 'answered:' + r.answerId };
    return { pass: true };
  }
  if (expect.notAnswerIds) {
    if (!r.abstain && expect.notAnswerIds.includes(r.answerId)) return { pass: false, why: 'forbidden-answer:' + r.answerId };
    return { pass: true };
  }
  if (expect.noAnswer || expect.action) {
    if (!r.abstain) return { pass: false, why: 'LEAK:answered:' + r.answerId };
    if (r.answerId !== undefined) return { pass: false, why: 'abstain-carries-answerId' };
    if (expect.action && r.action !== expect.action) return { pass: false, why: 'action:' + r.action };
    if (expect.reason) {
      const rs = [].concat(expect.reason);
      if (!rs.some((x) => String(r.reason).startsWith(x) || String(r.reason).startsWith('inherited:' + x))) return { pass: false, why: 'reason:' + r.reason };
    }
    return { pass: true };
  }
  return { pass: false, why: 'bad-expectation' };
}

module.exports = { run, check, sel, GATE_EN, ROOT: path.join(__dirname, '..') };
