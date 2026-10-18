'use strict';
module.exports = require('./_generic').withFallback({ applyPublicResponseContract: (x) => x }, 'publicResponseContract');
