'use strict';

/**
 * store.js - persistence the existing analytics layer lacks.
 *
 * statePresend/analytics keeps counters in memory and appends JSONL; both are
 * lost on restart and neither aggregates by root-cause identity. This adds a
 * durable, human-readable JSON store plus an append-only audit log.
 * It never touches Luna's own state files.
 */

const fs = require('fs');
const path = require('path');
const { STATUS, looksHuman } = require('./schema');

function readJson(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return def; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file); // atomic: a crash never leaves a half-written store
}

/**
 * Cross-process mutual exclusion for a read-modify-write cycle on `file`.
 * The maintainer's own process (bot process + occasional CLI invocations) is the
 * only expected concurrent access, so a short spin-wait on an atomic mkdir lock is
 * enough; a lock older than staleMs is assumed to be left by a crashed holder.
 */
function withLock(file, fn) {
  const lockDir = `${file}.lock`;
  const staleMs = 3000;
  const start = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(lockDir).mtimeMs > staleMs) { fs.rmdirSync(lockDir); continue; }
      } catch (_) { /* lock vanished between stat and use; retry */ }
      if (Date.now() - start > staleMs) { try { fs.rmdirSync(lockDir); } catch (_) { /* ignore */ } continue; }
    }
  }
  try {
    return fn();
  } finally {
    try { fs.rmdirSync(lockDir); } catch (_) { /* ignore */ }
  }
}

function createStore(cfg) {
  const dir = cfg.dataDir;
  const F = {
    events: path.join(dir, 'events.json'),
    proposals: path.join(dir, 'proposals.json'),
    evaluations: path.join(dir, 'evaluations.json'),
    deployments: path.join(dir, 'deployments.json'),
    ledger: path.join(dir, 'ledger.json'),
    audit: path.join(dir, 'audit.jsonl'),
  };
  fs.mkdirSync(dir, { recursive: true });

  function audit(actor, action, subject, detail) {
    try {
      fs.appendFileSync(F.audit, `${JSON.stringify({ at: Date.now(), actor, action, subject, detail: detail || '' })}\n`);
    } catch (_) { /* audit must never break the caller */ }
  }
  function auditTrail(limit) {
    try {
      const lines = fs.readFileSync(F.audit, 'utf8').trim().split('\n').filter(Boolean);
      return lines.slice(-(limit || 100)).map((l) => JSON.parse(l)).reverse();
    } catch (_) { return []; }
  }

  // ---- events (aggregated by fingerprint) ----
  function recordEvent(ev) {
    return withLock(F.events, () => {
      const all = readJson(F.events, {});
      const cur = all[ev.fingerprint];
      if (cur) {
        cur.occurrences += 1;
        cur.lastAt = ev.at;
        cur.samples.push({ conversationId: ev.conversationId, messageId: ev.messageId, evidence: ev.evidence, at: ev.at });
        if (cur.samples.length > 10) cur.samples.shift();
      } else {
        all[ev.fingerprint] = {
          fingerprint: ev.fingerprint, code: ev.code, detector: ev.detector, severity: ev.severity,
          category: ev.category, summary: ev.summary, signature: ev.signature, engine: ev.engine,
          occurrences: 1, firstAt: ev.at, lastAt: ev.at,
          samples: [{ conversationId: ev.conversationId, messageId: ev.messageId, evidence: ev.evidence, at: ev.at }],
        };
        audit('collector', 'event_new', ev.fingerprint, ev.code);
      }
      writeJson(F.events, all);
      return all[ev.fingerprint];
    });
  }
  const events = () => Object.values(readJson(F.events, {})).sort((a, b) => b.occurrences - a.occurrences);
  const getEvent = (fp) => readJson(F.events, {})[fp] || null;

  // ---- proposals ----
  function saveProposal(p) {
    return withLock(F.proposals, () => {
      const all = readJson(F.proposals, {});
      all[p.id] = p;
      writeJson(F.proposals, all);
      audit('maintainer', 'proposal_saved', p.id, p.status);
      return p;
    });
  }
  const getProposal = (id) => readJson(F.proposals, {})[id] || null;
  const proposals = (status) => Object.values(readJson(F.proposals, {}))
    .filter((p) => !status || p.status === status).sort((a, b) => b.createdAt - a.createdAt);
  function setStatus(id, status, actor, detail) {
    // Defense in depth: the intended path to APPROVED is approval.js's approve(), which
    // already requires a named human actor. This repeats the check here so a caller that
    // holds a direct reference to the store (bypassing the gate) cannot self-approve.
    if (status === STATUS.APPROVED && !looksHuman(actor)) {
      throw new Error('setStatus: approved status requires a named human actor');
    }
    return withLock(F.proposals, () => {
      const all = readJson(F.proposals, {});
      if (!all[id]) throw new Error(`unknown proposal ${id}`);
      all[id].status = status;
      all[id].statusDetail = detail || '';
      writeJson(F.proposals, all);
      audit(actor || 'maintainer', `status:${status}`, id, detail || '');
      return all[id];
    });
  }

  // ---- evaluations ----
  function saveEval(rep) {
    return withLock(F.evaluations, () => {
      const all = readJson(F.evaluations, {});
      all[rep.id] = rep;
      writeJson(F.evaluations, all);
      audit('evaluator', 'evaluation_saved', rep.proposalId, `passed=${rep.passed}`);
      return rep;
    });
  }
  function latestEval(proposalId) {
    return Object.values(readJson(F.evaluations, {}))
      .filter((r) => r.proposalId === proposalId).sort((a, b) => b.at - a.at)[0] || null;
  }

  // ---- deployments ----
  function saveDeployment(d) {
    return withLock(F.deployments, () => {
      const all = readJson(F.deployments, {});
      all[d.id] = Object.assign(all[d.id] || {}, d);
      writeJson(F.deployments, all);
      audit('deployer', `deploy:${d.status}`, d.proposalId, d.detail || '');
      return all[d.id];
    });
  }
  const getDeployment = (id) => readJson(F.deployments, {})[id] || null;
  const deployments = () => Object.values(readJson(F.deployments, {})).sort((a, b) => b.at - a.at);

  // ---- ledger ----
  function ledgerAdd(fingerprint, hash, outcome, reason) {
    withLock(F.ledger, () => {
      const all = readJson(F.ledger, {});
      all[`${fingerprint}:${hash}`] = { fingerprint, hash, outcome, reason, at: Date.now() };
      writeJson(F.ledger, all);
    });
  }
  const ledgerGet = (fingerprint, hash) => readJson(F.ledger, {})[`${fingerprint}:${hash}`] || null;
  const ledgerFor = (fingerprint) => Object.values(readJson(F.ledger, {})).filter((r) => r.fingerprint === fingerprint);

  // ---- improvement history ----
  function history() {
    return proposals().map((p) => {
      const ev = latestEval(p.id);
      const dep = deployments().find((d) => d.proposalId === p.id) || null;
      return {
        issueId: p.fingerprint, proposalId: p.id, symptoms: p.detectedProblem,
        rootCause: p.rootCause && p.rootCause.category, changeKind: p.changeKind,
        status: p.status, tests: p.requiredTests,
        evaluationPassed: ev ? ev.passed : null,
        deployedVersion: dep ? dep.version : null,
        outcome: dep ? dep.status : null,
        rollback: dep && dep.status === 'rolled_back' ? dep.detail : null,
      };
    });
  }

  return {
    files: F, audit, auditTrail,
    recordEvent, events, getEvent,
    saveProposal, getProposal, proposals, setStatus,
    saveEval, latestEval,
    saveDeployment, getDeployment, deployments,
    ledgerAdd, ledgerGet, ledgerFor,
    history,
  };
}

module.exports = { createStore };
