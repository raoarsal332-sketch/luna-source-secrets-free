#!/usr/bin/env node
'use strict';

/** cli.js - operator commands. Nothing deploys without an explicit approve. */

const m = require('./index');
const { renderReport } = require('./scoring');

async function main(argv) {
  const [cmd, ...rest] = argv;
  const arg = (name, def) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : def;
  };
  const M = m.create();

  switch (cmd) {
    case 'self-test': {
      const { results, summary } = await M.selfTest();
      for (const r of results.filter((x) => !x.passed)) console.log(`FAIL [${r.pack}] ${r.id}: ${r.failures.join('; ')}`);
      console.log(`${summary.passed}/${summary.cases} golden cases passed against ${M.cfg.lunaRoot}`);
      return summary.failed ? 1 : 0;
    }
    case 'events':
      console.log(JSON.stringify(M.actionable().map((e) => ({ fingerprint: e.fingerprint, code: e.code, severity: e.severity, occurrences: e.occurrences, summary: e.summary })), null, 2));
      return 0;
    case 'analyze':
      console.log(JSON.stringify(await M.processIssue(rest[0]), null, 2));
      return 0;
    case 'evaluate':
      console.log(renderReport(await M.evaluate(rest[0])));
      return 0;
    case 'request-approval':
      M.requestApproval(rest[0]);
      console.log('awaiting human approval');
      return 0;
    case 'pending':
      console.log(JSON.stringify(M.gate.pending().map((p) => ({ id: p.id, problem: p.detectedProblem, kind: p.changeKind, paths: p.affectedPaths, flag: p.featureFlag })), null, 2));
      return 0;
    case 'show': {
      const p = M.store.getProposal(rest[0]);
      if (!p) { console.error('not found'); return 1; }
      console.log(JSON.stringify(p, null, 2));
      return 0;
    }
    case 'approve':
      M.gate.approve(rest[0], arg('approver'), arg('note', ''));
      console.log(`approved by ${arg('approver')}; run \`deploy\` to ship it`);
      return 0;
    case 'reject':
      M.gate.reject(rest[0], arg('approver'), arg('reason'));
      console.log('rejected and recorded in the ledger');
      return 0;
    case 'deploy':
      console.log(JSON.stringify(await M.deployer.deploy(rest[0], arg('approver')), null, 2));
      return 0;
    case 'rollback':
      console.log(JSON.stringify(M.deployer.rollback(rest[0], arg('reason', 'operator requested')), null, 2));
      return 0;
    case 'history':
      console.log(JSON.stringify(M.history(), null, 2));
      return 0;
    case 'audit':
      console.log(JSON.stringify(M.store.auditTrail(50), null, 2));
      return 0;
    default:
      console.log(`luna-maintainer
  self-test                          run the golden suite against LUNA_ROOT
  events                             actionable issue buckets, most frequent first
  analyze <fingerprint>              root cause + proposed fix
  evaluate <proposalId>              sandbox baseline-vs-candidate report
  request-approval <proposalId>      only succeeds if the evaluation passed
  pending                            your review queue
  show <proposalId>                  full proposal incl. patch
  approve <id> --approver <name> [--note ..]
  reject  <id> --approver <name> --reason "..."
  deploy  <id> --approver <name>
  rollback <deployId> --reason "..."
  history | audit`);
      return 0;
  }
}

main(process.argv.slice(2)).then((c) => process.exit(c || 0)).catch((e) => { console.error(e.message); process.exit(1); });
