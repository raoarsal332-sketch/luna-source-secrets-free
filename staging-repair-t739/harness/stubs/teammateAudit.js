'use strict';
const records = [];
module.exports = require('./_generic').withFallback({ record: (r) => { records.push(r); }, records }, 'teammateAudit');
