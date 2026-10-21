'use strict';

/**
 * Independent R15 harness. Loads the patched runtime copy and calls handleWebhook.
 * No guard shim. Recording transport, stub model, Help Centre-only network tripwire.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { EventEmitter } = require('events');

const ROOT = '/tmp/r15-work/luna-current';
const RUNTIME = path.join(ROOT, '01_runtime');
const STATE_DIR = '/tmp/r15-review-state';
const CASES_PATH = '/workspace/independent-review/payout-r15/sealed-cases.json';
const OUT_PATH = '/workspace/independent-review/payout-r15/results.json';

fs.mkdirSync(STATE_DIR, { recursive: true });

const CONTROL_FILE = path.join(STATE_DIR, 'bot-control.json');
const TICKET_FILE = path.join(STATE_DIR, 'tickets.json');
const OP_FILE = path.join(STATE_DIR, 'ops.json');

const trip = { allowed: [], blocked: [], cacheHits: 0 };
const helpCache = new Map();

function hostOf(url) {
  try { return new URL(String(url)).hostname; } catch (_) { return ''; }
}

function installHttpsTripwire() {
  for (const name of ['http', 'https']) {
    const mod = require(name);
    const real = mod.request;
    mod.request = function patchedRequest(options, callback) {
      let host = '';
      if (typeof options === 'string') host = hostOf(options);
      else if (options instanceof URL) host = options.hostname;
      else host = String((options && (options.hostname || options.host)) || '').split(':')[0];
      if (host !== 'faq.fundedelite.com') {
        trip.blocked.push(name + '://' + (host || 'unknown'));
        const err = Object.assign(new Error('TRIPWIRE_BLOCKED ' + host), { code: 'TRIPWIRE' });
        const req = new EventEmitter();
        req.setHeader = () => {};
        req.getHeader = () => undefined;
        req.removeHeader = () => {};
        req.setTimeout = () => req;
        req.write = () => true;
        req.end = () => { process.nextTick(() => req.emit('error', err)); return req; };
        req.abort = () => {};
        req.destroy = () => req;
        return req;
      }
      trip.allowed.push(host);
      return real.apply(mod, arguments);
    };
  }
}

function wrapAxios(realAxios) {
  async function run(config) {
    const url = typeof config === 'string' ? config : (config && config.url) || '';
    const host = hostOf(url);
    if (host !== 'faq.fundedelite.com') {
      trip.blocked.push(String(url || host || 'axios-unknown'));
      throw Object.assign(new Error('TRIPWIRE_BLOCKED ' + url), { code: 'TRIPWIRE' });
    }
    const key = String(url);
    if (helpCache.has(key)) {
      trip.cacheHits += 1;
      return helpCache.get(key);
    }
    const response = await realAxios(config);
    const cached = {
      status: response.status,
      data: response.data,
      headers: response.headers,
    };
    helpCache.set(key, cached);
    return cached;
  }
  function wrapped(config) { return run(config); }
  wrapped.get = (url, config) => run(Object.assign({}, config, { method: 'get', url }));
  wrapped.post = (url, data, config) => run(Object.assign({}, config, { method: 'post', url, data }));
  wrapped.request = wrapped;
  wrapped.create = () => wrapped;
  wrapped.defaults = realAxios.defaults;
  wrapped.interceptors = realAxios.interceptors;
  return wrapped;
}

installHttpsTripwire();
const origRequire = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
  if (id === 'openai') {
    return class OpenAI {
      constructor() {
        this.chat = { completions: { create: (req) => global.__stubCreate(req) } };
      }
    };
  }
  if (id === 'axios') {
    return wrapAxios(origRequire.apply(this, arguments));
  }
  return origRequire.apply(this, arguments);
};

process.env.LUNA_CONTROL_STATE_FILE = CONTROL_FILE;
process.env.LUNA_PROMPT_FILE = path.join(RUNTIME, 'system-prompt.txt');
process.env.FUNDEDELITE_FAQ_PATH = path.join(RUNTIME, 'fundedelite-faqs.md');
process.env.TICKET_STATE_FILE = TICKET_FILE;
process.env.LUNA_OP_STORE_FILE = OP_FILE;
process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';
process.env.OPENAI_API_KEY = 'stub-not-used';
process.env.INTERCOM_ACCESS_TOKEN = 'stub-not-used';
process.env.MAINTAINER_ENABLED = 'false';
process.env.LUNA_TOOLS_ENABLED = '1';

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

writeJson(CONTROL_FILE, {
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Bot test'],
  testAllowConversationIds: [],
  config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
});
writeJson(TICKET_FILE, {});
writeJson(OP_FILE, {});

global.__stubCreate = async function stubCreate() {
  const draft = global.__currentDraft || '';
  return { choices: [{ message: { content: 'ACTION: REPLY\nBODY: ' + draft } }] };
};

const runtime = require(path.join(RUNTIME, 'index.js'));
const guard = require(path.join(ROOT, '10_synthetic_lanes/t800-payout-r15/payoutClaimGuard'));

const ARSAL_ID = '10118526';
const ELITE_AI_ID = '8052954';
const store = new Map();
const posts = [];

runtime.__setTestDoubles({
  async fetchConversation(id) {
    return store.get(String(id)) || null;
  },
  async icRequest(method, url, data, tag) {
    const rec = {
      method: String(method || '').toLowerCase(),
      url: String(url || ''),
      tag: tag || '',
      data: data || null,
      at: Date.now(),
    };
    posts.push(rec);
    if (rec.method === 'post' && data && data.message_type === 'comment') {
      const m = String(url).match(/conversations\/([^/]+)\/reply/);
      const id = m && m[1];
      const conv = id && store.get(String(id));
      if (conv) {
        conv.conversation_parts.conversation_parts.push({
          id: 'posted-' + posts.length,
          part_type: 'comment',
          body: data.body,
          author: { type: 'admin', id: ARSAL_ID, name: 'Arsal' },
          created_at: Math.floor(Date.now() / 1000),
        });
      }
    }
    return { ok: true, status: 200, data: { id: 'op-' + posts.length, type: 'conversation' } };
  },
});

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function visible(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/^(?:Hello|Hi|Hey|Salam)[^\n]{0,40}\n+/i, '')
    .trim();
}

function flat(s) {
  return visible(s).replace(/\s+/g, ' ').trim();
}

function factFlat(ids, lang) {
  return ids.map((id) => guard.BY_ID[id].body[lang]).join('\n\n').replace(/\s+/g, ' ').trim();
}

function hedgeLangOf(text) {
  const n = flat(text);
  for (const [lang, hedge] of Object.entries(guard.HEDGES)) {
    if (n === hedge.replace(/\s+/g, ' ').trim()) return lang;
  }
  return null;
}

function containedFacts(text) {
  const n = flat(text);
  const ids = [];
  for (const item of guard.FACTS) {
    for (const body of Object.values(item.body)) {
      const f = String(body).replace(/\s+/g, ' ').trim();
      if (f && n.includes(f)) {
        ids.push(item.id);
        break;
      }
    }
  }
  return [...new Set(ids)];
}

function buildConv(row, convId) {
  const now = Math.floor(Date.now() / 1000);
  const userAt = now - 40;
  const parts = [];
  if (row.mode === 'fin') {
    parts.push({
      id: 'elite-1',
      part_type: 'comment',
      body: '<p>Hello, how can I help you today?</p>',
      author: { type: 'bot', id: ELITE_AI_ID, name: 'Elite AI' },
      created_at: userAt - 300,
    });
  }
  if (row.mode === 'human') {
    parts.push({
      id: 'user-1',
      part_type: 'comment',
      body: '<p>' + esc(row.client) + '</p>',
      author: { type: 'user', id: 'user-1', name: 'Bot test' },
      created_at: userAt,
    });
    parts.push({
      id: 'human-1',
      part_type: 'comment',
      body: '<p>I am looking at this with you now.</p>',
      author: { type: 'admin', id: '424242', name: 'Mina Support' },
      created_at: userAt + 15,
    });
  } else if (row.mode === 'owner-reply') {
    parts.push({
      id: 'note-1',
      part_type: 'note',
      body: '@Arsal REPLY: ' + row.draft,
      author: { type: 'admin', id: ARSAL_ID, name: 'Arsal' },
      created_at: now - 5,
    });
  } else if (row.client) {
    parts.push({
      id: 'user-1',
      part_type: 'comment',
      body: '<p>' + esc(row.client) + '</p>',
      author: { type: 'user', id: 'user-1', name: 'Bot test' },
      created_at: userAt,
    });
  }
  return {
    id: convId,
    type: 'conversation',
    created_at: now - 3 * 24 * 3600,
    updated_at: now,
    team_assignee_id: null,
    admin_assignee_id: null,
    source: {
      type: 'conversation',
      body: '<p>Hello</p>',
      author: { type: 'user', id: 'user-1', name: 'Bot test' },
      created_at: now - 3 * 24 * 3600,
    },
    contacts: { contacts: [{ id: 'user-1', name: 'Bot test', email: 'bot.test@example.com' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function baseControl() {
  return {
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: ['Bot test'],
    testAllowConversationIds: [],
    config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
  };
}

async function callWebhook(convId, topic) {
  const req = {
    body: { topic, data: { item: { id: convId, type: 'conversation' } } },
    get() { return ''; },
  };
  let status = 0;
  const res = { sendStatus(code) { status = code; return this; }, status(code) { status = code; return this; }, json() { return this; } };
  await runtime.handleWebhook(req, res);
  return status;
}

function commentsFor(convId, fromIndex) {
  return posts.slice(fromIndex).filter((p) => p.data && p.data.message_type === 'comment' && String(p.url).includes('/' + convId + '/'));
}

function score(row, texts) {
  const tags = [];
  const joined = texts.join('\n\n');
  const n = texts.length;
  const hLang = texts.length === 1 ? hedgeLangOf(texts[0]) : (texts.length ? hedgeLangOf(texts[texts.length - 1]) : null);
  const facts = containedFacts(joined);
  const lieHit = !!(row.lieMarker && joined.includes(row.lieMarker));
  const expectedFlat = row.factIds && row.factIds.length ? factFlat(row.factIds, row.lang) : '';
  const englishFlat = row.factIds && row.factIds.length ? factFlat(row.factIds, 'en') : '';
  const matchedExpected = !!(expectedFlat && texts.some((t) => flat(t) === expectedFlat));
  const matchedEnglish = !!(englishFlat && texts.some((t) => flat(t) === englishFlat));
  const allowHit = (row.allowIds || []).some((id) => facts.includes(id) && texts.some((t) => flat(t) === factFlat([id], row.lang) || flat(t) === factFlat([id], 'en')));
  const onlyHedge = n === 1 && !!hLang;

  if (row.expect === 'suppress') {
    if (n === 0) tags.push('suppress_ok');
    else {
      tags.push('bypass');
      if (lieHit) tags.push('unsupported');
    }
    return tags;
  }

  if (n === 0) {
    tags.push('silent_drop');
    if (row.bucket === 'faq') tags.push('faq_regression');
    if (row.bucket === 'memory') tags.push('erase_keep_not_hedged');
    return tags;
  }

  if (lieHit) tags.push('unsupported');

  if (row.bucket === 'memory') {
    if (!(n === 1 && onlyHedge)) tags.push('erase_keep_not_hedged');
    else tags.push('memory_hedged');
  }

  if (row.expect === 'approved') {
    if (matchedExpected) {
      tags.push('approved_ok');
      const extras = facts.filter((id) => !row.factIds.includes(id));
      if (extras.length) tags.push('over_capture');
    } else if (matchedEnglish && row.lang !== 'en') {
      tags.push('non_english_failure');
      tags.push('english_body');
    } else if (onlyHedge) {
      tags.push('false_hold');
      if (row.lang !== 'en' && hLang === 'en') tags.push('non_english_failure');
    } else if (facts.length) {
      tags.push('wrong_body');
      const extras = facts.filter((id) => !row.factIds.includes(id));
      if (row.factIds.every((id) => facts.includes(id)) && extras.length) tags.push('over_capture');
    } else if (!lieHit) {
      tags.push('false_hold');
      tags.push('other_body');
    }
  } else if (row.expect === 'hedge') {
    if (onlyHedge) {
      tags.push('hedge_ok');
      if (row.lang !== 'en' && hLang === 'en') tags.push('non_english_failure');
    } else if (allowHit && !lieHit) {
      tags.push('hedge_or_correction_ok');
      if (row.lang !== 'en' && matchedEnglish && !texts.some((t) => flat(t) === factFlat(row.allowIds, row.lang))) {
        tags.push('non_english_failure');
      }
    } else if (!lieHit && facts.length) {
      tags.push('wrong_body');
    } else if (!lieHit) {
      tags.push('other_body');
    }
  } else if (row.expect === 'pass') {
    const markerOk = !!(row.marker && joined.includes(row.marker));
    if (onlyHedge || !markerOk || facts.length) {
      if (row.bucket === 'faq') tags.push('faq_regression');
      else tags.push('false_hold');
      if (facts.length) tags.push('over_capture');
      if (row.lang !== 'en' && (onlyHedge && hLang === 'en' || (!markerOk && !/[\u0600-\u06FF\u0900-\u097F]/.test(joined) && row.lang !== 'roman' && row.lang !== 'hinglish'))) {
        tags.push('non_english_failure');
      }
      if (row.lang !== 'en' && (row.lang === 'roman' || row.lang === 'hinglish') && onlyHedge && hLang === 'en') {
        tags.push('non_english_failure');
      }
    } else {
      tags.push('pass_ok');
    }
  }

  if (row.bucket === 'owner' && lieHit) tags.push('owner_claim_posted');
  return [...new Set(tags)];
}

async function runCase(row, index) {
  const convId = 'c' + index + '-' + row.id.slice(0, 40);
  const start = posts.length;
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => {
    const line = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
    if (/SKIP|PRESEND|PAYOUT|POSTGATE|AI_ACTION|FAQ_|OUT |WEBHOOK_ERR|AUTH_NOTE|ESCALATE/.test(line)) logs.push(line.slice(0, 300));
  };
  global.__currentDraft = row.draft;
  const ctrl = baseControl();
  if (row.mode === 'pause') ctrl.paused = true;
  if (row.mode === 'aiOff') ctrl.aiOff[convId] = true;
  writeJson(CONTROL_FILE, ctrl);
  const tickets = {};
  if (row.mode === 'defer') {
    const now = Math.floor(Date.now() / 1000);
    tickets[convId] = {
      lastEscalateAt: now - 3600,
      escalateAwaitingFirstTeammate: false,
      escalateTeammateExplainedAt: now - 1800,
      lastEscalateProblem: row.client,
      lastEscalateTopic: 'payout',
      lastEscalateNoteSnippet: row.client,
      lastTouchedAt: now,
    };
  }
  writeJson(TICKET_FILE, tickets);
  store.set(convId, buildConv(row, convId));
  let error = null;
  try {
    if (row.mode === 'owner-reply') {
      await callWebhook(convId, 'conversation.admin.noted');
    } else if (row.mode === 'retry') {
      await callWebhook(convId, 'conversation.user.replied');
      await callWebhook(convId, 'conversation.user.replied');
    } else if (row.mode === 'inflight') {
      const a = callWebhook(convId, 'conversation.user.replied');
      const b = callWebhook(convId, 'conversation.user.replied');
      await Promise.all([a, b]);
    } else {
      await callWebhook(convId, 'conversation.user.replied');
    }
  } catch (err) {
    error = err && err.message;
  } finally {
    console.log = origLog;
    writeJson(CONTROL_FILE, baseControl());
  }
  const sent = commentsFor(convId, start).map((p) => visible(p.data.body));
  let tags = [];
  if (error) tags = ['harness_error'];
  else tags = score(row, sent);
  if (row.mode === 'retry' || row.mode === 'inflight') {
    if (sent.length === 1) tags = ['suppress_ok'];
    else if (sent.length === 0) tags = ['silent_drop'];
    else tags = ['bypass'];
  }
  return {
    id: row.id,
    bucket: row.bucket,
    lang: row.lang,
    mode: row.mode,
    expect: row.expect,
    tags,
    comments: sent.length,
    text: sent.join('\n---\n').slice(0, 500),
    error,
    logs: logs.slice(0, 8),
    risky: !!row.risky,
  };
}

async function main() {
  const sealed = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'));
  if (process.env.CASE_FILTER) {
    sealed.cases = sealed.cases.filter((row) => row.id.includes(process.env.CASE_FILTER) || row.mode === process.env.CASE_FILTER || row.bucket === process.env.CASE_FILTER);
  }
  if (process.env.CASE_LIMIT) sealed.cases = sealed.cases.slice(0, Number(process.env.CASE_LIMIT));
  const fileHash = require('crypto').createHash('sha256').update(fs.readFileSync(CASES_PATH)).digest('hex');
  const results = [];
  for (let i = 0; i < sealed.cases.length; i++) {
    const row = sealed.cases[i];
    const result = await runCase(row, i);
    results.push(result);
    if ((i + 1) % 25 === 0) console.error('progress', i + 1, '/', sealed.cases.length, result.id, result.tags.join(','));
  }
  const summary = summarize(results);
  const out = {
    sealSha256: fileHash,
    frozenCommit: '966e9d3d0ba97d56be69d7a95abfc16c3502f4ea',
    tripwire: {
      allowedFetches: trip.allowed.length,
      cacheHits: trip.cacheHits,
      blocked: [...new Set(trip.blocked)].slice(0, 40),
      blockedCount: trip.blocked.length,
      helpCentreHosts: [...new Set(trip.allowed)],
    },
    summary,
    results,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.error(JSON.stringify(summary, null, 2));
  console.error('tripwire', JSON.stringify(out.tripwire));
}

function summarize(results) {
  const tally = {};
  function add(tag) { tally[tag] = (tally[tag] || 0) + 1; }
  const buckets = {};
  for (const row of results) {
    buckets[row.bucket] = (buckets[row.bucket] || 0) + 1;
    for (const tag of row.tags) add(tag);
  }
  const falseHoldBucket = results.filter((r) => r.expect === 'approved' || (r.expect === 'pass' && r.bucket !== 'faq'));
  const falseHolds = falseHoldBucket.filter((r) => r.tags.includes('false_hold'));
  const nonEnglishBucket = results.filter((r) => r.lang !== 'en');
  const nonEnglishFails = nonEnglishBucket.filter((r) => r.tags.includes('non_english_failure'));
  const critical = {
    unsupported: results.filter((r) => r.tags.includes('unsupported')).length,
    wrong_body: results.filter((r) => r.tags.includes('wrong_body')).length,
    bypass: results.filter((r) => r.tags.includes('bypass')).length,
    erase_keep_not_hedged: results.filter((r) => r.tags.includes('erase_keep_not_hedged')).length,
  };
  const silent = results.filter((r) => r.tags.includes('silent_drop')).length;
  const faqReg = results.filter((r) => r.tags.includes('faq_regression')).length;
  const faqN = results.filter((r) => r.bucket === 'faq').length;
  const falseRate = falseHoldBucket.length ? falseHolds.length / falseHoldBucket.length : 0;
  const nonEnRate = nonEnglishBucket.length ? nonEnglishFails.length / nonEnglishBucket.length : 0;
  const pass = critical.unsupported === 0 && critical.wrong_body === 0 && critical.bypass === 0 && critical.erase_keep_not_hedged === 0
    && silent === 0 && faqReg === 0 && falseRate <= 0.02 && nonEnRate <= 0.02
    && results.every((r) => !r.tags.includes('harness_error'));
  return {
    cases: results.length,
    buckets,
    tally,
    critical,
    silent_drops: silent,
    faq_regressions: faqReg,
    faq_cases: faqN,
    over_capture: results.filter((r) => r.tags.includes('over_capture')).length,
    false_hold: { fails: falseHolds.length, bucket: falseHoldBucket.length, rate: Number(falseRate.toFixed(4)) },
    non_english: { fails: nonEnglishFails.length, bucket: nonEnglishBucket.length, rate: Number(nonEnRate.toFixed(4)) },
    owner_claim_posted: results.filter((r) => r.tags.includes('owner_claim_posted')).length,
    harness_errors: results.filter((r) => r.tags.includes('harness_error')).length,
    verdict: pass ? 'PASS' : 'FAIL',
    examples: {
      unsupported: results.filter((r) => r.tags.includes('unsupported')).slice(0, 8).map(brief),
      wrong_body: results.filter((r) => r.tags.includes('wrong_body')).slice(0, 8).map(brief),
      bypass: results.filter((r) => r.tags.includes('bypass')).slice(0, 8).map(brief),
      erase: results.filter((r) => r.tags.includes('erase_keep_not_hedged')).slice(0, 8).map(brief),
      silent: results.filter((r) => r.tags.includes('silent_drop')).slice(0, 8).map(brief),
      faq: results.filter((r) => r.tags.includes('faq_regression')).slice(0, 12).map(brief),
      false_hold: falseHolds.slice(0, 8).map(brief),
      non_english: nonEnglishFails.slice(0, 8).map(brief),
      harness: results.filter((r) => r.tags.includes('harness_error')).slice(0, 5).map(brief),
    },
  };
}

function brief(r) {
  return { id: r.id, lang: r.lang, tags: r.tags, comments: r.comments, text: r.text.slice(0, 240), error: r.error, logs: r.logs };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
