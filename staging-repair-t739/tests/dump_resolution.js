'use strict';
// Lists how every non-staged require of the candidate was resolved and what harness init touched.
const boot = require('../harness/boot');
const h = boot.boot ? boot.boot({}) : boot({});
const r = h.loader.resolved;
const out = { tree: [...r.tree].sort(), hi: [...r.hi.entries()].sort(), stub: [...r.stub].sort() };
process.stdout.write('RESOLVED ' + JSON.stringify(out, null, 1) + '\n');
const make = require('../harness/stubs/_generic').make;
process.stdout.write('GENERIC_STUB_CALLS_AT_INIT ' + JSON.stringify([...make.called]) + '\n');
process.stdout.write('EGRESS_ATTEMPTS_AT_INIT ' + JSON.stringify(h.net.attempts) + '\n');
process.stdout.write('FAKE_REQUESTS_AT_INIT ' + h.fake.requests.length + '\n');
process.stdout.write('STATE_DIR ' + h.tmp + ' files: ' + require('fs').readdirSync(h.tmp).join(',') + '\n');
process.exit(0);
