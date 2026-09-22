'use strict';

/**
 * scoring.js - objective before/after measurement and hard gates.
 *
 * The Maintainer AI is never allowed to declare its own patch successful:
 * `passed` is computed here from measured case outcomes only. There is no
 * field the model can set to pass itself.
 */

function aggregate(results) {
  const n = results.length || 1;
  const sum = (k) => results.reduce((a, r) => a + ((r.metrics && r.metrics[k]) || 0), 0);
  const passed = results.filter((r) => r.passed).length;
  return {
    cases: results.length,
    passed,
    failed: results.length - passed,
    passRate: passed / n,
    answerCorrectness: sum('correct') / n,
    unsupportedClaimRate: sum('unsupported') / n,
    duplicateRate: sum('duplicate') / n,
    escalationErrorRate: sum('escalationErr') / n,
    hardFailsTotal: sum('hardFails'),
    softWarningsTotal: sum('softWarnings'),
    avgLatencyMs: sum('latencyMs') / n,
  };
}

function deltas(base, cand) {
  const out = {};
  for (const k of Object.keys(base)) out[k] = Number((cand[k] - base[k]).toFixed(6));
  return out;
}

function pctIncrease(base, cand) {
  if (base <= 0) return cand <= base ? 0 : 100;
  return ((cand - base) / base) * 100;
}

function gateFailures(cfg, base, cand) {
  const f = [];
  if (cand.passRate < cfg.gateMinPassRate) f.push(`passRate ${cand.passRate.toFixed(3)} < required ${cfg.gateMinPassRate}`);
  if (cand.passRate < base.passRate) f.push('passRate decreased vs baseline');
  if (cand.unsupportedClaimRate > base.unsupportedClaimRate) f.push('unsupported-claim rate increased');
  if (cand.duplicateRate > base.duplicateRate) f.push('duplicate rate increased');
  if (cand.escalationErrorRate > base.escalationErrorRate) f.push('escalation error rate increased');
  // Only gate on latency once the baseline is large enough for the percentage
  // to mean something; below the floor the measurement is scheduler noise.
  if (base.avgLatencyMs >= (cfg.gateLatencyFloorMs || 0)) {
    const lat = pctIncrease(base.avgLatencyMs, cand.avgLatencyMs);
    if (lat > cfg.gateMaxLatencyPct) f.push(`latency +${lat.toFixed(1)}% > ${cfg.gateMaxLatencyPct}%`);
  }
  return f;
}

function renderReport(rep) {
  const L = [];
  L.push(`EVALUATION REPORT ${rep.id}  (proposal ${rep.proposalId})`);
  L.push(`time: ${new Date(rep.at).toISOString()}`);
  L.push(`RESULT: ${rep.passed ? 'PASS' : 'FAIL'}`);
  L.push('');
  L.push(`${'metric'.padEnd(24)}${'baseline'.padStart(12)}${'candidate'.padStart(12)}${'delta'.padStart(12)}`);
  for (const k of Object.keys(rep.baseline)) {
    const b = Number(rep.baseline[k]).toFixed(3);
    const c = Number(rep.candidate[k]).toFixed(3);
    const d = (rep.deltas[k] >= 0 ? '+' : '') + Number(rep.deltas[k]).toFixed(3);
    L.push(`${k.padEnd(24)}${b.padStart(12)}${c.padStart(12)}${d.padStart(12)}`);
  }
  L.push('');
  L.push(`target cases fixed : ${rep.fixedTargets}`);
  L.push(`new regressions    : ${rep.newRegressions.length ? rep.newRegressions.join(', ') : 'none'}`);
  L.push(`gate failures      : ${rep.gateFailures.length ? rep.gateFailures.join('; ') : 'none'}`);
  const failed = (rep.caseResults || []).filter((r) => !r.passed);
  if (failed.length) {
    L.push('');
    L.push('failing cases:');
    for (const r of failed) L.push(`  - [${r.pack}] ${r.id}: ${r.failures.join('; ')}`);
  }
  return L.join('\n');
}

module.exports = { aggregate, deltas, gateFailures, renderReport, pctIncrease };
