'use strict';

/**
 * Recording transport + network tripwire for the R17 review.
 * Real TCP is allowed only for the public Help Centre (faq.fundedelite.com).
 * Intercom is answered locally and recorded. Every other host throws.
 */

const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');
const { Readable } = require('stream');

const origHttp = http.request;
const origHttps = https.request;

const state = {
  calls: [],
  publicComments: [],
  notes: [],
  otherWrites: [],
  helpCentre: [],
  tripwires: [],
  conversation: null,
};

function resetRecord(conversation) {
  state.calls = [];
  state.publicComments = [];
  state.notes = [];
  state.otherWrites = [];
  state.helpCentre = [];
  state.tripwires = [];
  state.conversation = conversation || null;
}

function hostOf(options) {
  if (!options) return '';
  if (typeof options === 'string') {
    try { return new URL(options).hostname; } catch (_) { return ''; }
  }
  const raw = options.hostname || options.host || '';
  return String(raw).replace(/:\d+$/, '').toLowerCase();
}

function pathOf(options) {
  if (!options || typeof options === 'string') return String(options || '');
  return String(options.path || options.pathname || '');
}

function jsonResponse(statusCode, obj) {
  const payload = Buffer.from(JSON.stringify(obj));
  const stream = Readable.from([payload]);
  stream.statusCode = statusCode;
  stream.statusMessage = statusCode === 200 ? 'OK' : 'ERR';
  stream.httpVersion = '1.1';
  stream.headers = {
    'content-type': 'application/json',
    'content-length': String(payload.length),
  };
  stream.rawHeaders = ['Content-Type', 'application/json'];
  return stream;
}

function FakeRequest(onEnd) {
  const req = new EventEmitter();
  const chunks = [];
  req.finished = false;
  req.destroyed = false;
  req.writable = true;
  req.write = (data, enc, cb) => {
    if (data) {
      const encoding = typeof enc === 'string' ? enc : 'utf8';
      chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data), encoding));
    }
    const done = typeof enc === 'function' ? enc : cb;
    if (typeof done === 'function') done();
    return true;
  };
  req.end = (data, enc, cb) => {
    if (data) req.write(data, enc, cb);
    req.finished = true;
    const body = Buffer.concat(chunks).toString('utf8');
    process.nextTick(() => onEnd(req, body));
    return req;
  };
  req.setTimeout = () => req;
  req.setHeader = () => {};
  req.getHeader = () => undefined;
  req.abort = () => req.destroy();
  req.destroy = (err) => {
    req.destroyed = true;
    if (err) req.emit('error', err);
    return req;
  };
  return req;
}

function answerIntercom(options, callback) {
  const method = String((options && options.method) || 'GET').toUpperCase();
  const path = pathOf(options);
  const req = new FakeRequest((request, rawBody) => {
    let parsed = null;
    if (rawBody) {
      try { parsed = JSON.parse(rawBody); } catch (_) { parsed = { raw: rawBody }; }
    }
    const call = { host: 'api.intercom.io', method, path, body: parsed };
    state.calls.push(call);
    let data;
    if (method === 'GET' && /\/conversations\/[^/]+$/.test(path)) {
      data = state.conversation || { id: 'missing', conversation_parts: { conversation_parts: [] } };
    } else if (method === 'GET' && /\/admins/.test(path)) {
      data = { type: 'admin.list', admins: [] };
    } else if (method === 'POST' && /\/reply$/.test(path)) {
      const messageType = parsed && parsed.message_type;
      const body = parsed && parsed.body;
      if (messageType === 'comment') state.publicComments.push(String(body || ''));
      else if (messageType === 'note') state.notes.push(String(body || ''));
      else state.otherWrites.push(call);
      data = { type: 'conversation', id: 'reply-' + state.calls.length };
    } else if (method === 'POST' && /\/conversations\/search/.test(path)) {
      data = { conversations: [], pages: {} };
    } else {
      data = { type: 'conversation', id: 'op-' + state.calls.length };
      state.otherWrites.push(call);
    }
    const res = jsonResponse(200, data);
    res.req = request;
    if (typeof callback === 'function') callback(res);
  });
  return req;
}

function blocked(host, path, callback) {
  const hit = { host, path: String(path || '') };
  state.tripwires.push(hit);
  const req = new FakeRequest(() => {
    const err = new Error('TRIPWIRE blocked network host ' + host + ' ' + path);
    err.code = 'TRIPWIRE';
    req.emit('error', err);
  });
  return req;
}

function install() {
  function wrap(orig) {
    return function patchedRequest(input, options, callback) {
      let opts = input;
      let cb = options;
      if (typeof options === 'function') {
        cb = options;
        opts = input;
      } else if (options && typeof callback === 'function') {
        cb = callback;
        opts = Object.assign({}, typeof input === 'object' ? input : {}, options);
      }
      if (typeof input === 'string' || (typeof URL !== 'undefined' && input instanceof URL)) {
        const u = new URL(String(input));
        opts = Object.assign({ protocol: u.protocol, hostname: u.hostname, path: u.pathname + u.search }, options || {});
        if (typeof options === 'function') cb = options;
      }
      const host = hostOf(opts);
      const path = pathOf(opts);
      if (host === 'faq.fundedelite.com') {
        state.helpCentre.push({ host, path });
        return orig.apply(this, arguments);
      }
      if (host === 'api.intercom.io') return answerIntercom(opts, cb);
      return blocked(host, path, cb);
    };
  }
  http.request = wrap(origHttp);
  https.request = wrap(origHttps);

  if (typeof global.fetch === 'function') {
    const origFetch = global.fetch;
    global.fetch = function patchedFetch(url, init) {
      let host = '';
      try { host = new URL(String(url), 'https://example.invalid').hostname; } catch (_) { host = ''; }
      if (host === 'faq.fundedelite.com') {
        state.helpCentre.push({ host, path: String(url), via: 'fetch' });
        return origFetch(url, init);
      }
      state.tripwires.push({ host: host || String(url), path: String(url), via: 'fetch' });
      return Promise.reject(new Error('TRIPWIRE blocked fetch ' + url));
    };
  }
}

function snapshot() {
  return {
    publicComments: state.publicComments.slice(),
    notes: state.notes.slice(),
    calls: state.calls.slice(),
    otherWrites: state.otherWrites.slice(),
    helpCentre: state.helpCentre.slice(),
    tripwires: state.tripwires.slice(),
  };
}

module.exports = { install, resetRecord, snapshot, state };
