'use strict';

/**
 * bridge.js - the ONLY place that reaches into the Luna codebase.
 *
 * It resolves Luna's own modules from a given root (production for reading,
 * a sandbox copy for testing). Nothing is re-implemented: the maintainer uses
 * statePresend, presendMega and their analytics exactly as production does.
 */

const path = require('path');

function fresh(root, rel) {
  const p = path.join(root, rel);
  delete require.cache[require.resolve(p)];
  return require(p);
}

/** statePresend facade, loaded from `root` (sandbox-safe: no Intercom, no network). */
function statePresend(root) { return fresh(root, 'statePresend/statePresend.js'); }
function presendMega(root) { return fresh(root, 'statePresend/presendMega.js'); }
function analyticsMod(root) { return fresh(root, 'statePresend/analytics/index.js'); }
function control(root) { return fresh(root, 'control.js'); }

/** presendMega code -> category map, reused for event categorisation. */
function categoryOf(root) {
  try { return analyticsMod(root || process.env.LUNA_ROOT || '/home/ubuntu').CATEGORY_OF; } catch (_) { return {}; }
}

/** Load an arbitrary exported Luna module by name, for module-level golden cases. */
function loadModule(root, name) {
  const rel = name.includes('/') ? `${name}.js` : `${name}.js`;
  return fresh(root, rel);
}

module.exports = { statePresend, presendMega, analyticsMod, control, categoryOf, loadModule, fresh };
