'use strict';

/**
 * deploy.js - backup -> stage -> swap -> health -> monitor -> rollback.
 *
 * Nothing here runs unless the proposal status is exactly "approved".
 * Production is never patched in place: the patch is applied to a staging copy
 * and only the declared files are swapped in. Luna's own control.js kill switch
 * (pause / aiOff / testMode) stays the operator's emergency brake.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sandbox = require('./sandbox');
const bridge = require('./bridge');
const { STATUS, sha, looksHuman } = require('./schema');
const { ROLLED_BACK, SUCCEEDED } = require('./ledger');
const { log } = require('./observability');
const { validatePaths } = require('./proposer');

class DeployError extends Error {}

function createDeployer(cfg, store, ledger) {
  function backup(tag) {
    fs.mkdirSync(cfg.backupDir, { recursive: true });
    if (!fs.existsSync(cfg.lunaRoot)) throw new DeployError(`lunaRoot missing: ${cfg.lunaRoot}`);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(cfg.backupDir, `luna_${tag}_${stamp}.tar.gz`);
    execFileSync('tar', ['-czf', file, '--exclude=node_modules', '--exclude=.git', '--exclude=luna-maintainer', '-C', cfg.lunaRoot, '.'], { stdio: 'pipe' });
    return file;
  }

  function healthCheck() {
    // Loads Luna's own modules from production and asks control.js for its state.
    let sp;
    try {
      sp = bridge.statePresend(cfg.lunaRoot);
    } catch (e) {
      return { ok: false, detail: `statePresend failed to load after deploy: ${e.message}` };
    }
    if (typeof sp.gate !== 'function') return { ok: false, detail: 'statePresend.gate missing after deploy' };

    // control.js pulls in axios; when node_modules is absent (a bare checkout or
    // a test host) that is not a deploy failure, so it is reported, not fatal.
    let controlNote = 'control.js ok';
    try {
      const c = bridge.control(cfg.lunaRoot);
      if (typeof c.isPaused !== 'function') return { ok: false, detail: 'control.js loaded but isPaused is missing' };
    } catch (e) {
      if (!/Cannot find module '(axios|express|openai|dotenv|body-parser)'/.test(e.message)) {
        return { ok: false, detail: `control.js failed to load after deploy: ${e.message}` };
      }
      controlNote = 'control.js not verified (node_modules absent on this host)';
    }
    return { ok: true, detail: `statePresend ${sp.STATE_PRESEND_VERSION} loaded; ${controlNote}` };
  }

  async function deploy(proposalId, approver) {
    const p = store.getProposal(proposalId);
    if (!p) throw new DeployError(`unknown proposal ${proposalId}`);
    if (p.status !== STATUS.APPROVED) throw new DeployError(`refusing to deploy: status is '${p.status}', not approved`);
    // Re-verify the approver is a named human at deploy time too, not just at approve time:
    // status alone ('approved') says nothing about how it got there if a caller ever bypassed
    // approval.js's gate (e.g. by writing to the store directly).
    if (cfg.requireApproval && !looksHuman(approver)) throw new DeployError('no named human approver recorded');

    if (cfg.dryRun) {
      log('deploy_dry_run', { proposalId });
      return { status: 'dry_run', proposalId, detail: 'MAINTAINER_DRY_RUN=true - nothing was written to production.' };
    }

    // Re-validate affectedPaths against the forbidden-path list right before copying to
    // production, not only at proposal time: a proposal object reaching here by any path
    // other than proposer.propose() must still be unable to ship e.g. `.env`.
    let affectedPaths;
    try {
      affectedPaths = validatePaths(p.affectedPaths, cfg.forbidden);
    } catch (e) {
      throw new DeployError(`refusing to deploy: ${e.message}`);
    }

    const deployId = `dep_${sha(proposalId + Date.now())}`;
    const backupPath = backup(deployId);
    const version = `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}-${proposalId}`;

    const stagingParent = path.join(cfg.backupDir, `staging_${deployId}`);
    const sb = sandbox.create(cfg.lunaRoot, stagingParent);
    const applied = sb.applyPatch(p.patch);
    if (!applied.ok) {
      fs.rmSync(stagingParent, { recursive: true, force: true });
      store.saveDeployment({ id: deployId, proposalId, version, backupPath, featureFlag: p.featureFlag, status: 'failed', detail: applied.detail, at: Date.now() });
      throw new DeployError(`patch failed on staging: ${applied.detail}`);
    }

    for (const rel of affectedPaths) {
      const src = path.join(sb.root, rel);
      const dst = path.join(cfg.lunaRoot, rel);
      if (!fs.existsSync(src)) continue;
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
    fs.rmSync(stagingParent, { recursive: true, force: true });

    const health = healthCheck();
    store.saveDeployment({ id: deployId, proposalId, version, backupPath, featureFlag: p.featureFlag, status: health.ok ? 'deployed' : 'unhealthy', detail: health.detail, at: Date.now() });
    store.setStatus(proposalId, STATUS.DEPLOYED, approver, `deployId=${deployId}`);
    log('deployed', { proposalId, deployId, healthy: health.ok });

    if (!health.ok) return Object.assign(rollback(deployId, `health check failed: ${health.detail}`), { healthDetail: health.detail });

    let detail = health.detail;
    if (p.featureFlag) detail += ` | risky behaviour is gated by ${p.featureFlag}; set it to 'true' to enable.`;
    return { status: 'deployed', deployId, version, backup: backupPath, featureFlag: p.featureFlag, detail };
  }

  function rollback(deployId, reason) {
    const dep = store.getDeployment(deployId);
    if (!dep) throw new DeployError(`unknown deployment ${deployId}`);
    if (!dep.backupPath || !fs.existsSync(dep.backupPath)) throw new DeployError(`backup missing for ${deployId}; manual restore required`);
    execFileSync('tar', ['-xzf', dep.backupPath, '-C', cfg.lunaRoot], { stdio: 'pipe' });
    store.saveDeployment({ id: deployId, proposalId: dep.proposalId, version: dep.version, backupPath: dep.backupPath, featureFlag: dep.featureFlag, status: 'rolled_back', detail: reason, at: Date.now() });
    try { store.setStatus(dep.proposalId, STATUS.ROLLED_BACK, 'deployer', reason); } catch (_) { /* already terminal */ }
    const p = store.getProposal(dep.proposalId);
    if (p) ledger.record(p.fingerprint, p.patch, ROLLED_BACK, reason);
    log('rolled_back', { deployId, reason });
    return { status: 'rolled_back', deployId, reason };
  }

  /** Objective auto-rollback: thresholds, not opinions. */
  function monitor(deployId, windowEvents, messagesSeen) {
    const dep = store.getDeployment(deployId);
    if (!dep) throw new DeployError(`unknown deployment ${deployId}`);
    const critical = (windowEvents || []).filter((e) => e.severity === 'critical' || e.severity === 'high');
    const regressions = (windowEvents || []).filter((e) => e.code === 'REGRESSION_AFTER_CHANGE');
    const errorRate = messagesSeen ? critical.length / messagesSeen : 0;

    const breaches = [];
    if (errorRate > cfg.rollbackErrorRate) breaches.push(`error rate ${errorRate.toFixed(3)} > ${cfg.rollbackErrorRate}`);
    if (regressions.length >= cfg.rollbackEvents) breaches.push(`${regressions.length} regression events`);

    if (breaches.length) return Object.assign(rollback(deployId, breaches.join('; ')), { breaches });

    const p = store.getProposal(dep.proposalId);
    if (p && dep.status === 'deployed') ledger.record(p.fingerprint, p.patch, SUCCEEDED, `stable over ${cfg.monitorMinutes}m window`);
    return { status: 'stable', deployId, errorRate };
  }

  return { backup, deploy, rollback, monitor, healthCheck, DeployError };
}

module.exports = { createDeployer, DeployError };
