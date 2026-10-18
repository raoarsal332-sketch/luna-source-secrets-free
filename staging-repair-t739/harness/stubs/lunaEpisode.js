'use strict';
/** [ME] episode registry stand-in. begin/end are recorded so a test can see them balanced. */
const open = new Map();
const calls = [];
module.exports = require('./_generic').withFallback({
  begin: (cid, meta) => { calls.push(['begin', String(cid)]); const e = { cid: String(cid), meta }; open.set(String(cid), e); return e; },
  end: (cid) => { calls.push(['end', String(cid)]); open.delete(String(cid)); },
  get: (cid) => open.get(String(cid)) || null,
  current: (cid) => open.get(String(cid)) || null,
  canRegenerate: () => false,
  noteRegeneration() {},
  calls,
}, 'lunaEpisode');
