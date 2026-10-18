'use strict';
const Module = require('module');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function loadBaseline() {
  process.env.LUNA_ATOM_APPROVED_ANSWERS = path.join(ROOT, 'faq-approved-answers-atom-v1.json');
  const file = path.join(ROOT, 'baseline', 'atomAnswerSelect.baseline.dd3b9f79.js');
  const src = fs.readFileSync(file, 'utf8').replace("require('./atomApprovedAnswers')", "require(" + JSON.stringify(path.join(ROOT, 'atomApprovedAnswers')) + ")");
  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src, file);
  return m.exports;
}
module.exports = { loadBaseline };
