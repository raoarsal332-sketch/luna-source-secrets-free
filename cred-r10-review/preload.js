'use strict';

/**
 * Isolated recording transport for the local-chat child.
 * Replaces the OpenAI SDK and refuses every socket before the script loads.
 */
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const dns = require('dns');

function trip(kind) {
  const err = new Error('NETWORK_TRIPWIRE ' + kind);
  err.code = 'TRIPWIRE';
  fs.appendFileSync(process.env.R10_TRIP_LOG || '/tmp/r10-local-trip.txt', kind + '\n');
  throw err;
}

http.request = function blockedHttp() { trip('http.request'); };
https.request = function blockedHttps() { trip('https.request'); };
https.get = function blockedHttpsGet() { trip('https.get'); };
http.get = function blockedHttpGet() { trip('http.get'); };
net.Socket.prototype.connect = function blockedConnect() { trip('socket.connect'); };
dns.lookup = function blockedLookup() { trip('dns.lookup'); };
if (dns.promises) dns.promises.lookup = function blockedLookupP() { return Promise.reject(Object.assign(new Error('NETWORK_TRIPWIRE dns'), { code: 'TRIPWIRE' })); };

const Module = require('module');
const orig = Module._load;
const calls = [];

Module._load = function load(request, parent, isMain) {
  if (request === 'openai') {
    function OpenAI() {
      this.chat = {
        completions: {
          create: async (payload) => {
            calls.push(payload);
            fs.writeFileSync(process.env.R10_MODEL_LOG || '/tmp/r10-local-model.json', JSON.stringify(calls));
            const secret = process.env.R10_SECRET || '';
            const blob = JSON.stringify(payload && payload.messages);
            const echo = secret && blob.includes(secret);
            const content = echo
              ? 'ACTION: REPLY\nKIND: FAQ_CONFIRM\nBODY: ECHO<' + secret + '>'
              : 'ACTION: REPLY\nKIND: FAQ_CONFIRM\nBODY: FundedElite is a proprietary trading firm.';
            return { choices: [{ message: { content: content } }] };
          },
        },
      };
    }
    return OpenAI;
  }
  return orig.apply(this, arguments);
};
