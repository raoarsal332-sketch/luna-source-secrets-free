'use strict';
/** [ME] Absent from this tree. Identity: do not drop a draft that names a credential. */
module.exports = require('./_generic').withFallback({
  compactAccountChallengeSizes: (text) => String(text == null ? '' : text),
}, 'accountSizeFormat');
