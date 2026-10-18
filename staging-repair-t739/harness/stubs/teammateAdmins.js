'use strict';
/** [ME] authorized note-command admins. Synthetic ids only; override with FAKE_AUTHORIZED_ADMINS. */
function ids() { return new Set(String(process.env.FAKE_AUTHORIZED_ADMINS || '777001,777002').split(',')); }
module.exports = require('./_generic').withFallback({
  isAuthorizedAdminId: (id) => ids().has(String(id)),
  size: () => ids().size,
  validateAtStartup() {},
}, 'teammateAdmins');
