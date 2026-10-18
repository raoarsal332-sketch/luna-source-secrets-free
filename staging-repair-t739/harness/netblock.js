'use strict';
/**
 * In-process egress block. Every attempt is recorded and refused, so a test can assert that no
 * outbound connection was tried. The OS-level block (unshare -rn) is verified separately by
 * isolation_proof.js; this layer exists so a single process also fails loudly when run without it.
 */
const net = require('net');
const dns = require('dns');
const http = require('http');
const https = require('https');
const tls = require('tls');
const child = require('child_process');

const attempts = [];
function refuse(kind, target) {
  attempts.push({ kind, target: String(target || '') });
  const e = new Error('NETWORK_BLOCKED_BY_HARNESS ' + kind);
  e.code = 'NETWORK_BLOCKED';
  throw e;
}

function install() {
  net.connect = net.createConnection = (...a) => refuse('net.connect', JSON.stringify(a[0]));
  net.Socket.prototype.connect = function (...a) { return refuse('socket.connect', JSON.stringify(a[0])); };
  tls.connect = (...a) => refuse('tls.connect', JSON.stringify(a[0]));
  http.request = http.get = (...a) => refuse('http.request', a[0] && (a[0].host || a[0].hostname || a[0]));
  https.request = https.get = (...a) => refuse('https.request', a[0] && (a[0].host || a[0].hostname || a[0]));
  for (const fn of ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny']) {
    dns[fn] = (host, ...rest) => {
      attempts.push({ kind: 'dns.' + fn, target: String(host) });
      const cb = rest.find((x) => typeof x === 'function');
      const err = Object.assign(new Error('NETWORK_BLOCKED_BY_HARNESS dns'), { code: 'NETWORK_BLOCKED' });
      if (cb) return process.nextTick(cb, err);
      throw err;
    };
    if (dns.promises) dns.promises[fn] = async (host) => refuse('dns.promises.' + fn, host);
  }
  global.fetch = async (u) => refuse('fetch', u);
  for (const fn of ['spawn', 'exec', 'execFile', 'fork', 'spawnSync', 'execSync', 'execFileSync']) {
    child[fn] = (...a) => refuse('child_process.' + fn, a[0]);
  }
}

module.exports = { install, attempts };
