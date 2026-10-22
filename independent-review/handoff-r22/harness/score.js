'use strict';

const fs = require('fs');

const casesPath = process.argv[2];
const resultsPath = process.argv[3];
const outPath = process.argv[4];

const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8')).cases;
const byId = new Map(cases.map(function (c) { return [c.id, c]; }));
const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

function check(exp, got) {
  const fails = [];
  if (!got) return ['missing-turn'];
  if (got.error) fails.push('error');
  if (got.tripwire) fails.push('tripwire');
  if (exp.commentsExact && JSON.stringify(got.comments || []) !== JSON.stringify(exp.commentsExact)) fails.push('commentsExact');
  if (exp.commentCount != null && (got.comments || []).length !== exp.commentCount) fails.push('commentCount');
  if (exp.commentMin != null && (got.comments || []).length < exp.commentMin) fails.push('commentMin');
  if (exp.noteCount != null && (got.notes || []).length !== exp.noteCount) fails.push('noteCount');
  if (exp.noteMin != null && (got.notes || []).length < exp.noteMin) fails.push('noteMin');
  if (exp.assignCount != null && got.assignCount !== exp.assignCount) fails.push('assignCount');
  if (exp.assignMin != null && got.assignCount < exp.assignMin) fails.push('assignMin');
  const comments = (got.comments || []).join('\n');
  const notes = (got.notes || []).join('\n');
  const prompts = (got.prompts || []).join('\n');
  (exp.commentIncludes || []).forEach(function (s) { if (!comments.includes(s)) fails.push('commentIncludes'); });
  (exp.commentExcludes || []).forEach(function (s) { if (s && comments.includes(s)) fails.push('commentExcludes'); });
  (exp.noteIncludes || []).forEach(function (s) { if (!notes.includes(s)) fails.push('noteIncludes'); });
  (exp.noteExcludes || []).forEach(function (s) { if (s && notes.includes(s)) fails.push('noteExcludes'); });
  (exp.promptExcludes || []).forEach(function (s) { if (s && prompts.includes(s)) fails.push('promptExcludes'); });
  if (exp.noDuplicateBodies) {
    const seen = new Set();
    (got.comments || []).forEach(function (body) {
      if (seen.has(body)) fails.push('duplicateBody');
      seen.add(body);
    });
  }
  if (exp.owedEquals != null && (!got.owed || got.owed.message !== exp.owedEquals)) fails.push('owedEquals');
  return fails;
}

function grade(version) {
  const map = new Map();
  version.results.forEach(function (r) {
    const spec = byId.get(r.id);
    const got = (r.segments || []).flat();
    const exp = spec.segments.flatMap(function (s) { return s.turns; });
    const reasons = [];
    exp.forEach(function (turn, i) {
      check(turn.expect, got[i]).forEach(function (reason) {
        reasons.push('t' + i + ':' + reason);
      });
    });
    map.set(r.id, { pass: reasons.length === 0, reasons: reasons, got: got, spec: spec });
  });
  return map;
}

const grades = {};
data.versions.forEach(function (v) { grades[v.version] = grade(v); });

function hasGate(spec, gate) { return (spec.gates || []).indexOf(gate) !== -1; }

const summary = {
  elapsedMs: data.elapsedMs,
  versions: {},
  candidateOnly: [],
  regressionVsR21: [],
  preExisting: [],
  r22Fixes: [],
  tripwire: [],
};

['r22', 'r21', 'r20'].forEach(function (name) {
  const g = grades[name];
  const row = { pass: 0, fail: 0, total: g.size, gates: {} };
  ['product-critical', 'leaks', 'over-redaction', 'duplicates', 'recovery'].forEach(function (gate) {
    row.gates[gate] = { pass: 0, fail: 0 };
  });
  g.forEach(function (item) {
    if (item.pass) row.pass += 1;
    else row.fail += 1;
    ['product-critical', 'leaks', 'over-redaction', 'duplicates', 'recovery'].forEach(function (gate) {
      if (!hasGate(item.spec, gate) && !(gate === 'product-critical' && item.spec.productCritical)) return;
      if (gate === 'product-critical' && !item.spec.productCritical && !hasGate(item.spec, gate)) return;
      if (item.pass) row.gates[gate].pass += 1;
      else row.gates[gate].fail += 1;
    });
    item.got.forEach(function (turn, i) {
      if (turn && turn.tripwire) summary.tripwire.push({ version: name, id: item.spec.id, turn: i, last: turn.tripwireLast });
    });
  });
  summary.versions[name] = row;
});

grades.r22.forEach(function (item, id) {
  const r21 = grades.r21.get(id);
  const r20 = grades.r20.get(id);
  const entry = {
    id: id,
    bucket: item.spec.bucket,
    target: item.spec.target || '',
    gates: item.spec.gates,
    reasons: item.reasons,
    r21Pass: !!(r21 && r21.pass),
    r20Pass: !!(r20 && r20.pass),
  };
  if (!item.pass && r21 && r21.pass && r20 && r20.pass) summary.candidateOnly.push(entry);
  else if (!item.pass && r21 && r21.pass) summary.regressionVsR21.push(entry);
  else if (!item.pass && r21 && !r21.pass) summary.preExisting.push(entry);
  else if (item.pass && r21 && !r21.pass) summary.r22Fixes.push({ id: id, bucket: item.spec.bucket, target: item.spec.target || '' });
});

function example(id) {
  const spec = byId.get(id);
  const out = { id: id, target: spec.target || '', turns: [] };
  ['r22', 'r21', 'r20'].forEach(function (name) {
    const item = grades[name].get(id);
    out[name] = {
      pass: item.pass,
      reasons: item.reasons,
      comments: item.got.map(function (t) { return (t && t.comments) || []; }),
    };
  });
  return out;
}

const exampleIds = []
  .concat(summary.candidateOnly.slice(0, 8).map(function (e) { return e.id; }))
  .concat(summary.r22Fixes.filter(function (e) { return /urdu-tie|fresh-replied|number-gate|declared|bare-foreign/.test(e.target || e.id); }).slice(0, 6).map(function (e) { return e.id; }))
  .concat(summary.preExisting.slice(0, 4).map(function (e) { return e.id; }));

summary.examples = Array.from(new Set(exampleIds)).map(example);
summary.counts = {
  candidateOnly: summary.candidateOnly.length,
  regressionVsR21: summary.regressionVsR21.length,
  preExisting: summary.preExisting.length,
  r22Fixes: summary.r22Fixes.length,
  tripwire: summary.tripwire.length,
};

fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  elapsedMs: summary.elapsedMs,
  versions: summary.versions,
  counts: summary.counts,
  candidateOnlyIds: summary.candidateOnly.map(function (e) { return e.id; }),
}, null, 2));
