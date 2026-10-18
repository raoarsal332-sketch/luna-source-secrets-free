'use strict';
/** [ME] minimal JSON file helper: same call shapes index.js uses (readJsonSafe/writeJsonAtomic). */
const fs = require('fs');
const path = require('path');
function readJsonSafe(file, opts) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return opts && 'fallback' in opts ? opts.fallback : null; }
}
function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}
module.exports = require('./_generic').withFallback({ readJsonSafe, writeJsonAtomic }, 'atomicJsonFile');
