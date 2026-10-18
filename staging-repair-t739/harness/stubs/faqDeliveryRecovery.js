'use strict';
/** [ME] delivery reconciliation stand-in: nothing is ever found or in conflict. */
module.exports = require('./_generic').withFallback({ examine: (r) => ({ status: r.status }), conflicts: () => false }, 'faqDeliveryRecovery');
