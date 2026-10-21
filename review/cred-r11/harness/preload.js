'use strict';

/**
 * Isolated recording transport, stub model, and network tripwire.
 * Loaded before the product. Never opens a production connection.
 */

const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');

const state = {
  modelCalls: [],
  axiosCalls: [],
  tripwire: [],
  modelQueue: [],
  conversation: null,
  searchHits: null,
  failMode: null,
  failLeft: 0,
  installed: false,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function textResponse(content) {
  return {
    id: 'syn-chat',
    choices: [{ index: 0, message: { role: 'assistant', content: String(content || ''), tool_calls: undefined }, finish_reason: 'stop' }],
  };
}

function takeModel(req) {
  state.modelCalls.push(clone(req));
  const next = state.modelQueue.length ? state.modelQueue.shift() : null;
  if (next && next.__throw) {
    const err = new Error(String(next.__throw));
    err.status = next.status || 500;
    throw err;
  }
  if (!next) return textResponse('ACTION: REPLY\nBODY: The profit split is 80 percent after a payout is approved.');
  if (typeof next === 'string') return textResponse(next);
  return next;
}

class StubOpenAI {
  constructor() {
    this.chat = { completions: { create: async (req) => takeModel(req) } };
  }
}

function recordAxios(config) {
  const entry = {
    method: String((config && config.method) || 'get').toLowerCase(),
    url: String((config && config.url) || ''),
    data: config && Object.prototype.hasOwnProperty.call(config, 'data') ? clone(config.data) : null,
  };
  state.axiosCalls.push(entry);
  return entry;
}

function axiosResult(entry) {
  const url = entry.url;
  const method = entry.method;
  if (state.failMode === '429' && method === 'post' && url.indexOf('/reply') >= 0 && state.failLeft > 0) {
    state.failLeft -= 1;
    return { status: 429, data: { error: 'synthetic-rate-limit' } };
  }
  if (state.failMode === '500' && method === 'post' && url.indexOf('/reply') >= 0 && state.failLeft > 0) {
    state.failLeft -= 1;
    return { status: 500, data: { error: 'synthetic-upstream' } };
  }
  if (url.indexOf('/conversations/search') >= 0) {
    const hits = state.searchHits || [];
    return {
      status: 200,
      data: { conversations: hits, pages: { next: null }, type: 'conversation.list' },
    };
  }
  if (method === 'get' && /\/conversations\/[^/]+$/.test(url)) {
    return { status: 200, data: state.conversation || { id: 'syn-missing', type: 'conversation', conversation_parts: { conversation_parts: [] } } };
  }
  if (url.indexOf('/admins') >= 0) {
    return { status: 200, data: { type: 'admin.list', admins: [] } };
  }
  if (method === 'post' && url.indexOf('/reply') >= 0) {
    return { status: 200, data: { id: 'syn-reply-' + state.axiosCalls.length, type: 'admin_reply' } };
  }
  return { status: 200, data: { id: 'syn-ok-' + state.axiosCalls.length, type: 'conversation' } };
}

function axios(config) {
  const entry = recordAxios(config || {});
  return Promise.resolve(axiosResult(entry));
}
axios.post = (url, data, config) => axios(Object.assign({}, config || {}, { method: 'post', url, data }));
axios.get = (url, config) => axios(Object.assign({}, config || {}, { method: 'get', url }));
axios.request = axios;
axios.create = () => axios;

function trip(kind, detail) {
  const err = new Error('NETWORK_TRIPWIRE ' + kind + ' ' + (detail || ''));
  state.tripwire.push({ kind, detail: String(detail || ''), stack: err.stack });
  return err;
}

function installTripwire() {
  http.request = function () { throw trip('http.request', arguments[0] && (arguments[0].host || arguments[0].hostname || arguments[0])); };
  http.get = function () { throw trip('http.get', ''); };
  https.request = function () { throw trip('https.request', arguments[0] && (arguments[0].host || arguments[0].hostname || arguments[0])); };
  https.get = function () { throw trip('https.get', ''); };
  global.fetch = function (url) { throw trip('fetch', url); };
  const origLookup = dns.lookup.bind(dns);
  dns.lookup = function (host, opts, cb) {
    const hostname = String(host || '');
    const callback = typeof opts === 'function' ? opts : cb;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return origLookup(host, opts, cb);
    }
    const err = trip('dns.lookup', hostname);
    if (typeof callback === 'function') return callback(err);
    throw err;
  };
  if (dns.promises && dns.promises.lookup) {
    dns.promises.lookup = async function (host) {
      const hostname = String(host || '');
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return { address: '127.0.0.1', family: 4 };
      throw trip('dns.promises.lookup', hostname);
    };
  }
  const origConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (options) {
    const host = options && typeof options === 'object' ? (options.host || options.hostname || '') : '';
    const port = options && typeof options === 'object' ? options.port : options;
    const local = host === '' || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
    if (!local) throw trip('socket.connect', host + ':' + port);
    return origConnect.apply(this, arguments);
  };
}

function installRequireHook() {
  const Module = require('module');
  if (Module.prototype.__credR11ReviewHook) return;
  const orig = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === 'axios') return axios;
    if (id === 'openai') return StubOpenAI;
    return orig.apply(this, arguments);
  };
  Module.prototype.__credR11ReviewHook = true;
}

function setup() {
  if (!state.installed) {
    installTripwire();
    installRequireHook();
    state.installed = true;
  }
  if (process.env.CG_MODEL_QUEUE && !state.modelQueue.length) {
    try { state.modelQueue = JSON.parse(process.env.CG_MODEL_QUEUE); } catch (_) { state.modelQueue = []; }
  }
  if (process.env.CG_SEARCH_JSON) {
    try { state.searchHits = JSON.parse(require('fs').readFileSync(process.env.CG_SEARCH_JSON, 'utf8')); } catch (_) { state.searchHits = []; }
  }
  if (process.env.CG_CONVERSATION_JSON) {
    try { state.conversation = JSON.parse(require('fs').readFileSync(process.env.CG_CONVERSATION_JSON, 'utf8')); } catch (_) { state.conversation = null; }
  }
  if (process.env.CG_POLLER === '1' && !state.pollerArmed) {
    state.pollerArmed = true;
    const origSetTimeout = global.setTimeout;
    global.setTimeout = function (fn, ms) {
      const wait = ms === 8000 ? 30 : ms;
      return origSetTimeout.apply(this, [fn, wait].concat([].slice.call(arguments, 2)));
    };
    origSetTimeout(function () {
      writeTrace();
      process.exit(0);
    }, 3500);
  }
  return state;
}

function writeTrace() {
  if (!process.env.CG_TRACE_FILE) return;
  try {
    require('fs').writeFileSync(process.env.CG_TRACE_FILE, JSON.stringify({
      modelCalls: state.modelCalls,
      axiosCalls: state.axiosCalls,
      tripwire: state.tripwire,
    }));
  } catch (_) { /* trace is best-effort */ }
}

function createClient() {
  return new StubOpenAI();
}

function resetTraffic() {
  state.modelCalls.length = 0;
  state.axiosCalls.length = 0;
  state.modelQueue = [];
  state.failMode = null;
  state.failLeft = 0;
  state.searchHits = null;
}

if (process.env.CG_HARNESS_PRELOAD === '1') setup();

module.exports = { setup, state, resetTraffic, clone, textResponse, createClient, writeTrace };
