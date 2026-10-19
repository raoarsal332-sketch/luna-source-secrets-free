'use strict';
/** [ME] Tool registry is absent from this tree. FAST replies do not call these. */
module.exports = require('./_generic').withFallback({
  createTools() { return {}; },
}, 'tools');
