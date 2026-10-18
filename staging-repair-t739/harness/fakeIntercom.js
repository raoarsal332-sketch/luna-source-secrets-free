'use strict';
/**
 * Transport-level recorder: an axios adapter. The real icRequest / icRequestUnguarded / axios call
 * stack runs above it; only the final socket step is replaced. It serves a synthetic Intercom
 * (conversation reads) and records every attempted request exactly as axios would have sent it.
 * Nothing here can reach the network.
 */
const requests = [];
const convs = new Map();
let partSeq = 9000;
let responder = null;
let failNextWrites = [];

function reset() {
  requests.length = 0;
  convs.clear();
  partSeq = 9000;
  responder = null;
  failNextWrites = [];
}

function setConversation(id, conv) {
  convs.set(String(id), conv);
}
function getConversation(id) {
  return convs.get(String(id));
}
function setResponder(fn) {
  responder = fn;
}
function failWrites(...statuses) {
  failNextWrites = statuses.slice();
}

function body(v) {
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch (_) { return v; }
  }
  return v;
}

function authOf(config) {
  try {
    const h = config.headers;
    const v = h && typeof h.get === 'function' ? h.get('Authorization') : h && h.Authorization;
    return /fake-intercom-token-not-real/.test(String(v || '')) ? 'fake-token' : v ? 'OTHER' : 'none';
  } catch (_) { return 'unreadable'; }
}

async function adapter(config) {
  const rec = {
    method: String(config.method || 'get').toLowerCase(),
    url: String(config.url || ''),
    data: body(config.data),
    at: Date.now(),
    auth: authOf(config),
  };
  requests.push(rec);
  const mk = (status, data) => ({ status, statusText: String(status), headers: {}, config, request: {}, data });
  if (responder) {
    const r = responder(rec, { convs });
    if (r) return mk(r.status, r.data);
  }
  const m = rec.url.match(/conversations\/(\d+)(\/reply)?/);
  if (rec.method === 'get') {
    const c = m && convs.get(m[1]);
    return c ? mk(200, JSON.parse(JSON.stringify(c))) : mk(404, { type: 'error.list', errors: [{ code: 'not_found' }] });
  }
  if (failNextWrites.length) {
    const st = failNextWrites.shift();
    return mk(st, { type: 'error.list', errors: [{ code: 'rate_limit_exceeded' }] });
  }
  if (m && m[2] && rec.data) {
    const c = convs.get(m[1]);
    const part = {
      type: 'conversation_part',
      id: String(++partSeq),
      part_type: rec.data.message_type === 'note' ? 'note' : rec.data.message_type === 'close' ? 'close' : 'comment',
      body: rec.data.body || '',
      created_at: Math.floor(Date.now() / 1000),
      author: { type: 'admin', id: String(rec.data.admin_id || '') },
    };
    if (c && c.conversation_parts && Array.isArray(c.conversation_parts.conversation_parts)) {
      c.conversation_parts.conversation_parts.push(part);
    }
    return mk(200, part);
  }
  return mk(200, { id: 'ok', type: 'conversation' });
}

function install(axios) {
  axios.defaults.adapter = adapter;
}

function writes() {
  return requests.filter((r) => r.method !== 'get');
}
function publicWrites() {
  return writes().filter((r) => r.data && r.data.message_type === 'comment');
}
function notes() {
  return writes().filter((r) => r.data && r.data.message_type === 'note');
}

module.exports = { install, reset, requests, writes, publicWrites, notes, setConversation, getConversation, setResponder, failWrites };
