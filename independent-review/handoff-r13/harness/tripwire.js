'use strict';

/**
 * Blocks every outbound socket, DNS lookup, and HTTP client call.
 * Localhost is not special: this review never opens a socket.
 * The recording axios adapter must be installed before any Intercom call.
 */

const net = require('net');
const dns = require('dns');
const http = require('http');
const https = require('https');

function trip(kind, target) {
  const err = new Error('NETWORK_TRIPWIRE ' + kind + ' ' + String(target || ''));
  err.code = 'NETWORK_TRIPWIRE';
  throw err;
}

function wrap(obj, name) {
  if (!obj || typeof obj[name] !== 'function') return;
  obj[name] = function tripwired() {
    trip(name, arguments[0] && (arguments[0].host || arguments[0].hostname || arguments[0].href || arguments[0]));
  };
}

net.Socket.prototype.connect = function tripConnect() {
  trip('socket.connect', arguments[0]);
};
if (typeof net.connect === 'function') {
  net.connect = function tripNetConnect() {
    trip('net.connect', arguments[0]);
  };
}
wrap(dns, 'lookup');
wrap(dns, 'lookupService');
wrap(dns, 'resolve');
wrap(dns, 'resolve4');
wrap(dns, 'resolve6');
wrap(dns.promises, 'lookup');
wrap(dns.promises, 'resolve');
wrap(http, 'request');
wrap(http, 'get');
wrap(https, 'request');
wrap(https, 'get');
if (typeof global.fetch === 'function') {
  global.fetch = function tripFetch(url) {
    trip('fetch', url);
  };
}

module.exports = { trip };
