'use strict';

/**
 * Independent R19 review worker.
 * Loads a copy of luna-current/01_runtime (baseline or the public-sends diff)
 * and drives the real handleWebhook. Intercom is a recording transport.
 * The model is a stub. Any host other than the public Help Centre trips.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { Readable } = require('stream');
const { AsyncLocalStorage } = require('async_hooks');

const phaseStore = new AsyncLocalStorage();

const runtimeDir = path.resolve(process.argv[2]);
const casesPath = path.resolve(process.argv[3]);
const outPath = path.resolve(process.argv[4]);
const mode = process.argv[5] || 'candidate';

const stateDir = path.join('/tmp/r19-work/state', mode + '-' + process.pid);
fs.mkdirSync(stateDir, { recursive: true });
fs.writeFileSync(path.join(stateDir, 'bot-control.json'), JSON.stringify({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Bot test'],
  testAllowConversationIds: [],
  config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
}, null, 2));
fs.writeFileSync(path.join(stateDir, 'bot-mention-rotate.json'), JSON.stringify({ recent: [] }));
fs.writeFileSync(path.join(stateDir, 'bot-ticket-state.json'), '{}');

process.env.LUNA_CONTROL_STATE_FILE = path.join(stateDir, 'bot-control.json');
process.env.TICKET_STATE_FILE = path.join(stateDir, 'bot-ticket-state.json');
process.env.MENTION_ROTATE_FILE = path.join(stateDir, 'bot-mention-rotate.json');
process.env.LUNA_PROMPT_FILE = path.join(runtimeDir, 'system-prompt.txt');
process.env.OPENAI_API_KEY = 'sk-review-stub';
process.env.INTERCOM_ACCESS_TOKEN = 'review-stub-token';
process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';
process.env.LUNA_TOOLS_ENABLED = process.env.LUNA_TOOLS_ENABLED || '1';

const trips = [];
const helpFetches = [];
let current = null;
let hold = null;
let openaiCalls = 0;

function hostOf(input) {
  try {
    if (typeof input === 'string') return new URL(input).hostname;
    if (input instanceof URL) return input.hostname;
    if (input && typeof input === 'object') {
      if (input.href) return new URL(input.href).hostname;
      if (input.hostname) return String(input.hostname);
      if (input.host) return String(input.host).split(':')[0];
    }
  } catch (_) {}
  return '';
}

function isHelp(host) {
  return host === 'faq.fundedelite.com' || host === 'www.faq.fundedelite.com';
}

function noteTrip(host, via) {
  trips.push({ host: host || 'unknown', via, caseId: current && current.id, at: Date.now() });
  const err = new Error('NETWORK_TRIPWIRE ' + (host || 'unknown') + ' via ' + via);
  err.code = 'NETWORK_TRIPWIRE';
  return err;
}

function stubHttpRequest(status, data, cb) {
  const chunks = [];
  const handlers = {};
  const req = {
    destroyed: false,
    writable: true,
    write(chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return true;
    },
    end(chunk) {
      if (chunk) req.write(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch (_) { parsed = { raw }; }
      req._body = parsed;
      const payload = Buffer.from(JSON.stringify(data));
      const res = new Readable({ read() {} });
      res.statusCode = status;
      res.headers = { 'content-type': 'application/json', 'content-length': String(payload.length) };
      process.nextTick(() => {
        if (typeof cb === 'function') cb(res);
        res.push(payload);
        res.push(null);
      });
    },
    on(ev, fn) {
      (handlers[ev] = handlers[ev] || []).push(fn);
      return req;
    },
    once(ev, fn) { return req.on(ev, fn); },
    off() { return req; },
    removeListener() { return req; },
    emit(ev, ...args) {
      for (const fn of handlers[ev] || []) fn(...args);
      return true;
    },
    abort() { req.destroyed = true; },
    destroy() { req.destroyed = true; return req; },
    setTimeout() { return req; },
    setHeader() {},
    getHeader() { return undefined; },
    removeHeader() {},
  };
  return req;
}

function recordIntercom(method, urlStr, body) {
  if (!current) return;
  const rec = current.recordings;
  rec.push({
    phase: phaseStore.getStore() || current.phase || 'measured',
    method: String(method || 'GET').toUpperCase(),
    url: urlStr,
    messageType: body && body.message_type || '',
    body: body && body.body != null ? String(body.body) : '',
    at: Date.now(),
  });
}

function intercomResponse(method, urlStr, body) {
  const u = new URL(urlStr);
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET' && /\/conversations\/[^/]+$/.test(u.pathname)) {
    const id = decodeURIComponent(u.pathname.split('/').pop());
    return current && current.conversations.get(id) || { id, type: 'conversation', conversation_parts: { conversation_parts: [] } };
  }
  if (m === 'GET' && /\/admins\/?$/.test(u.pathname)) return { type: 'admin.list', admins: [] };
  if (m === 'GET' && /\/admins\//.test(u.pathname)) return { type: 'admin', id: u.pathname.split('/').pop(), name: 'Teammate' };
  recordIntercom(m, urlStr, body);
  return { id: 'rec-' + (current ? current.recordings.length : 0), type: 'conversation' };
}

function wrapTransport(orig) {
  return function patchedRequest(urlOrOpts, opts, cb) {
    let options = urlOrOpts;
    let callback = cb;
    if (typeof urlOrOpts === 'string' || urlOrOpts instanceof URL) {
      options = Object.assign({}, opts, { href: String(urlOrOpts) });
      callback = cb;
    } else if (typeof opts === 'function') {
      callback = opts;
    }
    const host = hostOf(options);
    const method = (options && options.method) || 'GET';
    let urlStr = '';
    try {
      if (options && options.href && /^https?:/i.test(options.href)) urlStr = options.href;
      else {
        const proto = (options.protocol || 'https:').replace(/:$/, '');
        const pathName = options.path || options.pathname || '/';
        urlStr = proto + '://' + (host || 'unknown') + pathName;
      }
    } catch (_) { urlStr = String(host || ''); }
    if (isHelp(host)) {
      helpFetches.push({ url: urlStr, caseId: current && current.id });
      return orig.apply(this, arguments);
    }
    if (host === 'api.intercom.io') {
      const req = stubHttpRequest(200, {}, callback);
      const origEnd = req.end.bind(req);
      req.end = function (chunk) {
        if (chunk) req.write(chunk);
        const data = intercomResponse(method, urlStr, req._bodyWait ? null : null);
        // body is assembled inside end via write; recompute
        return origEnd.call(req);
      };
      // Rebuild end so the response uses the parsed body.
      req.end = function (chunk) {
        if (chunk) req.write(chunk);
        const raw = Buffer.concat(req._chunks || []).toString('utf8');
        // chunks were stored by write into closure of stubHttpRequest, not exposed.
        // Use a second pass: monkeypatch already captured in write. Re-parse from a side channel.
        return origEnd.call(req, chunk);
      };
      // The stub's end already parses chunks. Wrap write/end by replacing the whole request
      // after we know we cannot easily intercept the internal chunks. Instead, patch below.
      return buildIntercomRequest(method, urlStr, callback);
    }
    const err = noteTrip(host, 'https');
    const req = stubHttpRequest(599, { error: 'tripwire' }, callback);
    process.nextTick(() => req.emit('error', err));
    return req;
  };
}

function buildIntercomRequest(method, urlStr, callback) {
  const chunks = [];
  const handlers = {};
  const req = {
    destroyed: false,
    writable: true,
    write(chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return true;
    },
    end(chunk) {
      if (chunk) req.write(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch (_) { parsed = null; }
      const data = intercomResponse(method, urlStr, parsed);
      const payload = Buffer.from(JSON.stringify(data));
      const res = new Readable({ read() {} });
      res.statusCode = 200;
      res.headers = { 'content-type': 'application/json', 'content-length': String(payload.length) };
      process.nextTick(() => {
        if (typeof callback === 'function') callback(res);
        res.push(payload);
        res.push(null);
      });
    },
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return req; },
    once(ev, fn) { return req.on(ev, fn); },
    off() { return req; },
    removeListener() { return req; },
    emit(ev, ...args) { for (const fn of handlers[ev] || []) fn(...args); return true; },
    abort() { req.destroyed = true; },
    destroy() { req.destroyed = true; return req; },
    setTimeout() { return req; },
    setHeader() {},
    getHeader() { return undefined; },
    removeHeader() {},
  };
  return req;
}

const origHttps = https.request;
const origHttp = http.request;
https.request = wrapTransport(origHttps);
http.request = wrapTransport(origHttp);
https.get = function (url, opts, cb) { return https.request(url, opts, cb).end ? https.request(url, Object.assign({}, typeof opts === 'object' ? opts : {}, { method: 'GET' }), typeof opts === 'function' ? opts : cb) : null; };

const origFetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : null;
globalThis.fetch = async function patchedFetch(url, init) {
  const host = hostOf(typeof url === 'string' ? url : (url && url.url) || url);
  const href = typeof url === 'string' ? url : (url && url.url) || String(url);
  if (isHelp(host)) {
    helpFetches.push({ url: href, caseId: current && current.id, via: 'fetch' });
    if (!origFetch) throw noteTrip(host, 'fetch-missing');
    return origFetch(url, init);
  }
  if (host === 'api.openai.com') {
    openaiCalls += 1;
    if (hold) {
      const gate = hold;
      hold = null;
      await gate;
    }
    const content = scriptModelContent();
    const json = {
      id: 'chatcmpl-review-stub',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-5.6-luna',
      choices: [{
        index: 0,
        message: { role: 'assistant', content, refusal: null },
        finish_reason: 'stop',
      }],
    };
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (host === 'api.intercom.io') {
    let parsed = null;
    try { parsed = init && init.body ? JSON.parse(init.body) : null; } catch (_) { parsed = null; }
    const data = intercomResponse((init && init.method) || 'GET', href, parsed);
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw noteTrip(host, 'fetch');
};

function scriptModelContent() {
  const c = current && current.case;
  if (!c) return 'ACTION: REPLY\nBODY:\nOkay.';
  if (c._noteEnglish) {
    c._noteEnglish = false;
    return 'The client needs a platform check.';
  }
  const action = c._turnAction || c.modelAction;
  if (action === 'EMPTY') return 'ACTION: REPLY\nBODY:';
  if (action === 'SPACE') return 'ACTION: REPLY\nBODY:   ';
  if (action === 'NEWLINES') return 'ACTION: REPLY\nBODY:\n\n\n';
  if (action === 'ESCALATE') {
    return [
      'ACTION: ESCALATE',
      'KIND: ACCOUNT',
      'CLIENT: I\'ve forwarded this to a teammate who can take a closer look. They have the chat context.',
      'BODY: Please review the platform login issue.',
      'ACTION_NEEDED: Please review this case and guide the client.',
    ].join('\n');
  }
  return 'ACTION: REPLY\nBODY:\n' + String(c.draft);
}

// The note-english detector is applied by peeking at the request body inside fetch.
const fetchImpl = globalThis.fetch;
globalThis.fetch = async function peekFetch(url, init) {
  try {
    const host = hostOf(typeof url === 'string' ? url : (url && url.url) || url);
    if (host === 'api.openai.com' && init && init.body && current && current.case) {
      const raw = typeof init.body === 'string' ? init.body : '';
      if (/INTERNAL Intercom note field|Rewrite the following INTERNAL/i.test(raw)) current.case._noteEnglish = true;
      if (/OWNER \/ JERRY DIRECT COMMAND/i.test(raw)) current.case._ownerLlm = true;
    }
  } catch (_) {}
  return fetchImpl(url, init);
};

function htmlEscape(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function conversationFor(item, clientText, extraParts) {
  const now = Math.floor(Date.now() / 1000);
  const name = item.name || 'Sara';
  const email = item.email || 'sara.khan@example.com';
  const userId = 'user-' + item.id;
  const parts = [];
  if (extraParts) parts.push(...extraParts);
  if (clientText) {
    parts.push({
      type: 'conversation_part',
      id: 'user-' + item.id + '-' + parts.length,
      part_type: 'comment',
      body: '<p>' + htmlEscape(clientText) + '</p>',
      created_at: now - 30,
      author: { type: 'user', id: userId, name, email },
    });
  }
  return {
    type: 'conversation',
    id: String(item.convId),
    created_at: now - 7200,
    updated_at: now - 20,
    state: 'open',
    open: true,
    admin_assignee_id: null,
    team_assignee_id: null,
    source: {
      type: 'conversation',
      id: 'src-' + item.convId,
      delivered_as: 'customer_initiated',
      body: '<p>Hello, I am on the trading platform.</p>',
      created_at: now - 7000,
      author: { type: 'user', id: userId, name, email },
    },
    contacts: { type: 'contact.list', contacts: [{ type: 'contact', id: userId, name, email }] },
    conversation_parts: { type: 'conversation_part.list', conversation_parts: parts },
  };
}

function ownerConversation(item) {
  const now = Math.floor(Date.now() / 1000);
  const conv = conversationFor(item, item.client, []);
  conv.conversation_parts.conversation_parts.push({
    type: 'conversation_part',
    id: 'note-' + item.id,
    part_type: 'note',
    body: '<p>' + htmlEscape(item.ownerForm === 'bracket'
      ? ('@Jerry send this message to client [' + String(item.draft || '') + ']')
      : ('@Jerry REPLY: ' + String(item.draft || ''))) + '</p>',
    created_at: now - 5,
    author: { type: 'admin', id: '8053416', name: 'Jerry' },
  });
  return conv;
}

function fakeRes() {
  const res = {
    statusCode: 200,
    headersSent: false,
    sendStatus(code) { res.statusCode = code; return res; },
    status(code) { res.statusCode = code; return res; },
    json() { return res; },
    send() { return res; },
    end() { return res; },
    setHeader() { return res; },
    getHeader() { return undefined; },
    set() { return res; },
  };
  return res;
}

const logs = [];
const origLog = console.log;
const origErr = console.error;
console.warn = (...args) => {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  logs.push('WARN ' + line.slice(0, 300));
};
console.log = (...args) => {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  if (/PAYOUT_|SKIP |OUT |EMPTY |ESCALAT|AI_ACTION|POSTGATE|WEBHOOK_ERR|AUTH_NOTE|fin-wait|PRESEND|statePresend|NETWORK|FAQ_/.test(line)) {
    logs.push(line.slice(0, 500));
  }
};
console.error = (...args) => {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  logs.push('ERR ' + line.slice(0, 500));
};

const luna = require(path.join(runtimeDir, 'index.js'));

function publicComments(recordings, phase) {
  return recordings.filter((r) => r.phase === phase && r.messageType === 'comment').map((r) => r.body);
}

async function invoke(conv, topic, phase) {
  const req = { body: { topic, id: 'evt-' + conv.id + '-' + phase, data: { item: conv } }, headers: {}, get() { return ''; } };
  const res = fakeRes();
  await phaseStore.run(phase, () => luna.handleWebhook(req, res));
  return res.statusCode;
}

async function runCase(item) {
  const convId = 'c' + String(item.n).padStart(5, '0');
  const caseView = Object.assign({}, item, { convId, _noteEnglish: false });
  const recordings = [];
  const conversations = new Map();
  current = { id: item.id, case: caseView, recordings, conversations, phase: 'measured' };
  const logStart = logs.length;
  const tripStart = trips.length;
  const helpStart = helpFetches.length;
  let error = '';
  const timer = new Promise((_, reject) => {
    const t = setTimeout(() => reject(new Error('case-timeout')), 30000);
    if (t.unref) t.unref();
  });
  try {
    await Promise.race([timer, (async () => {
    if (item.path === 'owner') {
      const conv = ownerConversation(caseView);
      conversations.set(convId, conv);
      await invoke(conv, 'conversation.admin.noted', 'measured');
    } else if (item.path === 'defer') {
      caseView._turnAction = 'ESCALATE';
      const armConv = conversationFor(caseView, item.armClient, []);
      conversations.set(convId, armConv);
      await invoke(armConv, 'conversation.user.replied', 'arm');
      caseView._turnAction = item.modelAction || 'REPLY';
      const follow = conversationFor(caseView, item.client, armConv.conversation_parts.conversation_parts.slice());
      const last = follow.conversation_parts.conversation_parts[follow.conversation_parts.conversation_parts.length - 1];
      if (last) last.created_at = Math.floor(Date.now() / 1000) - 5;
      conversations.set(convId, follow);
      await invoke(follow, 'conversation.user.replied', 'measured');
    } else if (item.path === 'inflight') {
      const conv = conversationFor(caseView, item.client, []);
      conversations.set(convId, conv);
      let release;
      const gate = new Promise((r) => { release = r; });
      hold = gate;
      caseView._turnAction = item.modelAction || 'REPLY';
      const first = invoke(conv, 'conversation.user.replied', 'measured');
      await new Promise((r) => setTimeout(r, 40));
      const conv2 = conversationFor(caseView, item.inflightClient || item.client, []);
      conv2.id = convId;
      conversations.set(convId, conv2);
      const second = invoke(conv2, 'conversation.user.replied', 'inflight-2');
      release();
      await Promise.all([first, second]);
    } else {
      caseView._turnAction = item.modelAction || 'REPLY';
      const conv = conversationFor(caseView, item.client, []);
      conversations.set(convId, conv);
      await invoke(conv, 'conversation.user.replied', 'measured');
    }
    })()]);
  } catch (err) {
    error = err && err.stack ? err.stack.slice(0, 800) : String(err);
  }
  const mine = recordings.slice();
  return {
    id: item.id,
    script: item.script,
    path: item.path,
    kind: item.kind,
    policyClass: item.policyClass || '',
    expect: item.expect,
    lockId: item.lockId || '',
    faqBaseline: !!item.faqBaseline,
    publicMeasured: publicComments(mine, 'measured'),
    publicArm: publicComments(mine, 'arm'),
    publicInflight2: publicComments(mine, 'inflight-2'),
    trips: trips.slice(tripStart),
    helpFetches: helpFetches.slice(helpStart).length,
    error,
    logs: logs.slice(logStart, logStart + 40),
  };
}

async function main() {
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const results = [];
  let i = 0;
  for (const item of cases) {
    item.n = i + 1;
    const row = await runCase(item);
    results.push(row);
    i += 1;
    if (i % 50 === 0) process.stderr.write(mode + ' ' + i + '/' + cases.length + '\n');
  }
  const summary = {
    mode,
    runtimeDir,
    cases: cases.length,
    openaiCalls,
    trips: trips.length,
    helpFetches: helpFetches.length,
    tripHosts: [...new Set(trips.map((t) => t.host))],
  };
  fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));
  process.stderr.write(mode + ' done ' + cases.length + ' trips=' + trips.length + ' help=' + helpFetches.length + '\n');
  console.log = origLog;
  console.error = origErr;
}

main().catch((err) => {
  console.log = origLog;
  console.error = origErr;
  console.error(err);
  process.exit(1);
});
