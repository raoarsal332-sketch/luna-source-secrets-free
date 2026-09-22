'use strict';

/**
 * config.js - every setting is env-overridable and every default is the safe one.
 * Nothing here points at production unless LUNA_ROOT is set explicitly.
 */

const path = require('path');

function b(name, def) {
  const v = process.env[name];
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
}
function n(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : def;
}

function load(over) {
  const dataDir = process.env.MAINTAINER_DATA_DIR || path.join(process.env.HOME || '.', '.luna-maintainer');
  const cfg = {
    lunaRoot: process.env.LUNA_ROOT || '/home/ubuntu',
    dataDir,
    backupDir: process.env.MAINTAINER_BACKUP_DIR || path.join(dataDir, 'backups'),
    sandboxDir: process.env.MAINTAINER_SANDBOX_DIR || '',
    casesDir: process.env.MAINTAINER_CASES_DIR || path.join(__dirname, 'cases'),
    goldenDir: process.env.MAINTAINER_GOLDEN_DIR || path.join(dataDir, 'golden'),

    // master switches - all default to the safe setting
    enabled: b('MAINTAINER_ENABLED', true),
    dryRun: b('MAINTAINER_DRY_RUN', true),
    requireApproval: b('MAINTAINER_REQUIRE_APPROVAL', true),

    // LLM (reuses the openai dependency Luna already has)
    model: process.env.MAINTAINER_LLM_MODEL || 'gpt-4o-mini',
    apiKeyEnv: process.env.MAINTAINER_LLM_KEY_ENV || 'OPENAI_API_KEY',
    minConfidence: n('MAINTAINER_MIN_CONFIDENCE', 0.6),
    minOccurrences: n('MAINTAINER_MIN_OCCURRENCES', 2),

    // detection thresholds for the signals presendMega does NOT cover
    latencyMs: n('MAINTAINER_LATENCY_MS', 20000),
    maxApiCalls: n('MAINTAINER_MAX_API_CALLS', 6),
    maxRetries: n('MAINTAINER_MAX_RETRIES', 2),

    // evaluation gates
    gateMinPassRate: n('MAINTAINER_GATE_MIN_PASS_RATE', 1.0),
    gateMaxNewRegressions: 0,
    gateMaxLatencyPct: n('MAINTAINER_GATE_LATENCY_PCT', 15),
    // a percentage gate on sub-millisecond case timings is noise, not signal
    gateLatencyFloorMs: n('MAINTAINER_GATE_LATENCY_FLOOR_MS', 50),

    // post-deploy auto rollback
    rollbackErrorRate: n('MAINTAINER_ROLLBACK_ERROR_RATE', 0.05),
    rollbackEvents: n('MAINTAINER_ROLLBACK_EVENTS', 3),
    monitorMinutes: n('MAINTAINER_MONITOR_MINUTES', 60),

    // paths inside Luna the maintainer is allowed to propose changes to
    forbidden: ['.env', 'secrets', 'credentials', 'id_rsa', '.git/', 'package-lock.json', 'node_modules'],
  };
  return Object.assign(cfg, over || {});
}

module.exports = { load };
