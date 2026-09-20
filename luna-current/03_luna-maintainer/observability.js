'use strict';

/** Structured JSON logging for every maintainer decision. Mirrors the
 *  `[statePresend] ...` style already used by Luna so logs stay greppable. */
function log(stage, fields) {
  try { console.log(`[maintainer] ${JSON.stringify(Object.assign({ at: Date.now(), stage }, fields || {}))}`); } catch (_) { /* ignore */ }
}
module.exports = { log };
