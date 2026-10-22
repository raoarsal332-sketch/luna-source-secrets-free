'use strict';

/**
 * Independent R18 webhook harness.
 * Loads a baseline copy of luna-current/01_runtime and a copy with the
 * public-sends diff applied. No payout-guard shim: the patched index
 * requires the frozen payoutClaimGuard.js itself.
 * The model is stubbed, Intercom is a recording transport, and any other
 * network host is a tripwire. Only the public Help Centre may be fetched.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const ROOT = __dirname;
const CASES_PATH = path.join(ROOT, 'cases.json');
const GUARD = process.env.R18_GUARD || '/tmp/r18-work/luna-current/10_synthetic_lanes/t800-payout-r18/payoutClaimGuard.js';
const BASE_INDEX = process.env.R18_BASE_INDEX || '/tmp/r18-base/luna-current/01_runtime/index.js';
const PATCH_INDEX = process.env.R18_PATCH_INDEX || '/tmp/r18-patched/luna-current/01_runtime/index.js';
const STATE_DIR = process.env.R18_STATE_DIR || '/tmp/r18-state';

fs.mkdirSync(STATE_DIR, { recursive: true });
process.env.LUNA_CONTROL_STATE_FILE = path.join(STATE_DIR, 'bot-control.json');
process.env.TICKET_STATE_FILE = path.join(STATE_DIR, 'tickets.json');
process.env.LUNA_OP_STORE_FILE = path.join(STATE_DIR, 'ops.json');
process.env.LUNA_PROMPT_FILE = '/tmp/r18-base/luna-current/01_runtime/system-prompt.txt';
process.env.FUNDEDELITE_FAQ_PATH = '/tmp/r18-base/luna-current/01_runtime/fundedelite-faqs.md';
process.env.LUNA_PRESEND_MODE = process.env.LUNA_PRESEND_MODE || 'enforce';
process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'stub';
process.env.INTERCOM_ACCESS_TOKEN = 'stub';
process.env.LUNA_TOOLS_ENABLED = process.env.LUNA_TOOLS_ENABLED || '1';

fs.writeFileSync(process.env.LUNA_CONTROL_STATE_FILE, JSON.stringify({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Bot test'],
  testAllowConversationIds: [],
  config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
}, null, 2));
fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}');
fs.writeFileSync(process.env.LUNA_OP_STORE_FILE, '{}');

const trips = [];
const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'openai') {
    function OpenAI() {
      return {
        chat: {
          completions: {
            create: async function () {
              return { choices: [{ message: { content: global.__R18_RAW || '', tool_calls: [] } }] };
            },
          },
        },
      };
    }
    return OpenAI;
  }
  return origRequire.apply(this, arguments);
};

const axios = require('/tmp/r18-base/luna-current/01_runtime/node_modules/axios');
const origRequest = axios.Axios.prototype.request;
function hostOf(url) {
  try { return new URL(String(url), 'https://faq.fundedelite.com').host; } catch (_) { return ''; }
}
function helpAllowed(host) {
  return host === 'faq.fundedelite.com' || host === 'www.faq.fundedelite.com' || host === 'fundedelite.com' || host === 'www.fundedelite.com';
}
function guardRaw(mod) {
  const orig = mod.request;
  mod.request = function (options, callback) {
    const rawHost = typeof options === 'string'
      ? hostOf(options)
      : String((options && (options.hostname || options.host)) || '');
    const host = rawHost.split(':')[0];
    if (host && !helpAllowed(host)) {
      trips.push({ blocked: true, host, url: 'socket:' + host });
      const err = new Error('TRIPWIRE socket ' + host);
      err.code = 'TRIPWIRE';
      const bogus = orig.call(mod, { host: '127.0.0.1', port: 9, method: 'GET', path: '/', timeout: 50 });
      bogus.on('error', () => {});
      process.nextTick(() => bogus.destroy(err));
      if (typeof callback === 'function') bogus.on('error', () => {});
      return bogus;
    }
    return orig.apply(mod, arguments);
  };
}
guardRaw(https);
guardRaw(require('http'));

axios.Axios.prototype.request = async function (config) {
  const cfg = typeof config === 'string' ? { url: config } : (config || {});
  const url = cfg.url || cfg.baseURL || '';
  const host = hostOf(url);
  if (!helpAllowed(host)) {
    trips.push({ blocked: true, host, url: String(url).slice(0, 200) });
    const err = new Error('TRIPWIRE blocked ' + host + ' ' + url);
    err.code = 'TRIPWIRE';
    throw err;
  }
  trips.push({ blocked: false, host, url: String(url).slice(0, 200) });
  cfg.timeout = Math.min(Number(cfg.timeout || 2500), 2500);
  return origRequest.call(this, cfg);
};

function probeHelpCentre() {
  return new Promise((resolve) => {
    const req = https.get('https://faq.fundedelite.com/en/', { timeout: 4000, headers: { 'User-Agent': 'R18Review/1.0', Accept: 'text/html' } }, (res) => {
      res.resume();
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode });
    });
    req.on('error', (err) => resolve({ ok: false, error: err && err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

const spec = require(GUARD);
const bundle = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'));
const cases = bundle.cases;

const baseline = require(BASE_INDEX);
const patched = require(PATCH_INDEX);

const ARSAL = '10118526';
let seq = 0;

function buildConv(row, id) {
  const now = Math.floor(Date.now() / 1000) - 7200;
  const name = 'Sam';
  const user = { type: 'user', id: 'user-' + id, name, email: 'sam.review@example.com' };
  const parts = [{
    id: 'u-' + id,
    part_type: 'comment',
    body: row.client || '',
    created_at: now,
    author: user,
  }];
  if (row.path === 'owner' || row.path === 'owner_send') {
    const noteBody = row.path === 'owner_send'
      ? '@Arsal send this message to the client [' + row.draft + ']'
      : '@Arsal REPLY: ' + (row.draft || '');
    parts.push({
      id: 'n-' + id,
      part_type: 'note',
      body: noteBody,
      created_at: now + 5,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    });
  }
  return {
    id: String(id),
    type: 'conversation',
    created_at: now - 86400,
    updated_at: now,
    state: 'open',
    team_assignee_id: null,
    admin_assignee_id: Number(ARSAL),
    source: { body: row.client || '', created_at: now - 86400, author: user },
    contacts: { contacts: [{ id: user.id, name, email: user.email }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function seed(id, row) {
  const all = {};
  if (row.state) {
    const st = JSON.parse(JSON.stringify(row.state));
    if (st.deferredRelatedReply && st.deferredRelatedReply.at === 'RECENT') {
      st.deferredRelatedReply.at = Math.floor(Date.now() / 1000) - 20;
    }
    all[String(id)] = st;
  }
  fs.writeFileSync(process.env.TICKET_STATE_FILE, JSON.stringify(all));
  fs.writeFileSync(process.env.LUNA_OP_STORE_FILE, '{}');
}

function mockRes() {
  return {
    statusCode: 0,
    sendStatus(code) { this.statusCode = code; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

function bind(mod, box, events) {
  mod.__setTestDoubles({
    async icRequest(method, url, data, tag) {
      events.push({ method: String(method || ''), url: String(url || ''), data: data || null, tag: tag || '' });
      if (String(method || '').toLowerCase() === 'get') {
        return { ok: true, status: 200, data: box.conv };
      }
      return { ok: true, status: 200, data: { type: 'conversation', id: box.conv && box.conv.id } };
    },
    async fetchConversation() {
      return box.conv;
    },
  });
}

async function runOne(mod, row) {
  seq += 1;
  const id = 'r18c' + String(seq);
  const box = { conv: buildConv(row, id) };
  const events = [];
  bind(mod, box, events);
  seed(id, row);
  global.__R18_RAW = row.modelRaw != null
    ? row.modelRaw
    : ('ACTION: REPLY\nKIND: FAQ_CONFIRM\nBODY:\n' + (row.draft == null ? '' : row.draft));
  const topic = (row.path === 'owner' || row.path === 'owner_send')
    ? 'conversation.admin.noted'
    : 'conversation.user.replied';
  const logs = [];
  const orig = console.log;
  console.log = (...args) => {
    const line = args.map((part) => (typeof part === 'string' ? part : '')).join(' ');
    if (/PAYOUT_|POSTGATE_|EMPTY reply|SKIP |presend |AUTH_NOTE|WEBHOOK_ERR|FAQ_RETRIEVE/.test(line)) logs.push(line.slice(0, 240));
  };
  let error = '';
  try {
    await mod.handleWebhook({ body: { topic, data: { item: { id, type: 'conversation' } } } }, mockRes());
  } catch (err) {
    error = err && err.message ? err.message : String(err);
  } finally {
    console.log = orig;
  }
  const comments = events
    .filter((event) => event.data && event.data.message_type === 'comment')
    .map((event) => String(event.data.body || ''));
  return { comments, logs, error, events: events.length };
}

function collapse(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function fromHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function stripOneWelcome(text) {
  const latin = text.match(/^(?:hello|hi|hey|ciao|salve|salam)(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]{0,40})?\s*,\s*/i);
  if (latin) {
    let rest = text.slice(latin[0].length).replace(/^\s+/, '');
    const lower = rest.toLowerCase();
    for (const help of ['how can i help?', 'how can i help']) {
      if (lower.startsWith(help)) {
        rest = rest.slice(help.length).replace(/^\s+/, '');
        break;
      }
    }
    return rest;
  }
  const arabic = text.match(/^(?:السلام\s*علیکم|السلام\s*عليكم|السلام\s*عليکم)(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]{0,40})?\s*[،,]\s*/);
  if (arabic) return text.slice(arabic[0].length).replace(/^\s+/, '');
  return text;
}

function coreAfterWelcome(raw) {
  let text = String(raw || '');
  for (let i = 0; i < 2; i++) {
    const next = stripOneWelcome(text);
    if (next === text) break;
    text = next;
  }
  return text.trim();
}

function hedgeLangOf(text) {
  const c = collapse(text);
  for (const [lang, line] of Object.entries(spec.HEDGES)) {
    if (collapse(line) === c) return lang;
  }
  return '';
}

function matchesLock(text, lockText) {
  if (!lockText) return false;
  const locks = (Array.isArray(lockText) ? lockText : [lockText]).map((item) => collapse(item));
  const core = collapse(coreAfterWelcome(text));
  if (core === collapse(locks.join('\n\n')) || core === collapse(locks.join(' ')) || core === collapse(locks.join('\n'))) return true;
  if (locks.length === 1 && core === locks[0]) return true;
  if (!locks.every((lock) => core.includes(lock))) return false;
  let rest = core;
  for (const lock of locks) rest = rest.split(lock).join(' ');
  return collapse(rest).length === 0;
}

function expectedForward(row) {
  const core = collapse(coreAfterWelcome(row.draft || ''));
  if (row.lang === 'en' && core === collapse("I've forwarded this to a teammate who can take a closer look. They have the chat context.")) {
    return core;
  }
  if (row.lang === 'en' && core === collapse(spec.TEAMMATE_FORWARD.en)) return collapse(spec.TEAMMATE_FORWARD.en);
  return collapse(spec.TEAMMATE_FORWARD[row.lang] || spec.HEDGES[row.lang] || spec.HEDGES.en);
}

function expectedStatus(row) {
  const core = collapse(coreAfterWelcome(row.draft || ''));
  if (row.lang === 'en') {
    const exact = spec.STATUS_EN.find((line) => collapse(line) === core);
    return collapse(exact || spec.STATUS_LINE.en);
  }
  return collapse(spec.STATUS_LINE[row.lang] || spec.HEDGES[row.lang]);
}

function isEnglishFixed(text) {
  const c = collapse(coreAfterWelcome(text));
  if (c === collapse(spec.HEDGES.en)) return true;
  if (c === collapse(spec.TEAMMATE_FORWARD.en)) return true;
  if (c === collapse("I've forwarded this to a teammate who can take a closer look. They have the chat context.")) return true;
  if (spec.STATUS_EN.some((line) => collapse(line) === c)) return true;
  return false;
}

function hasLeak(text) {
  const latin = String(text || '').toLowerCase();
  if (/system\s+prompt|developer\s+message|hidden\s+instructions|system\s+instructions|internal\s+notes?|developer\s+instructions|follow\s+your\s+instructions/.test(latin)) return true;
  if (/اندرونی نوٹ|ملاحظة داخلية|ملاحظه داخليه|تعليمات النظام|سسٹم پرامپٹ|سیسٹم پرامپٹ|\[bot-ack\]/i.test(text)) return true;
  if (/(?:^|\n)\s*action\s*:/i.test(text)) return true;
  return false;
}

function claimSurvived(row, text) {
  const draft = collapse(row.draft || '');
  const body = collapse(text);
  if (!draft || draft.length < 24) return draft && body.includes(draft);
  const slice = draft.slice(0, 48);
  return body.includes(slice);
}

function score(row, result, baseResult) {
  const flags = [];
  const texts = result.comments.map(fromHtml);
  const joined = texts.join('\n\n');
  if (row.expect === 'suppress') {
    if (result.comments.length) flags.push('suppression_bypass');
    return flags;
  }
  if (!result.comments.length) {
    flags.push('silent_drop');
    return flags;
  }
  if (texts.some(hasLeak) || hasLeak(joined)) flags.push('leak');

  const hedge = hedgeLangOf(joined) || texts.map(hedgeLangOf).find(Boolean) || '';
  const correctHedge = hedge === row.lang;

  if (row.faq && baseResult) {
    const a = result.comments.join('\n');
    const b = (baseResult.comments || []).join('\n');
    if (a !== b) flags.push('faq_regression');
  }

  if (row.expect === 'pass') {
    if (hedge) flags.push('false_hold');
    else if (row.faq && flags.includes('faq_regression')) {
      /* byte diff is the regression; not a lock miss */
    }
  } else if (row.expect === 'hedge') {
    if (!correctHedge) {
      if (row.erase) flags.push('erase_unhedged');
      if (claimSurvived(row, joined) && !flags.includes('leak')) flags.push('unsupported');
      if (!flags.includes('leak') && !flags.includes('erase_unhedged') && !flags.includes('unsupported')) flags.push('wrong_body');
      if (hedge && hedge !== row.lang) flags.push('wrong_body');
    }
  } else if (row.expect === 'lock') {
    const ok = texts.some((text) => matchesLock(text, row.lockText)) || matchesLock(joined, row.lockText);
    if (!ok && hedge) flags.push('false_hold');
    else if (!ok) flags.push('wrong_body');
  } else if (row.expect === 'forward') {
    const want = expectedForward(row);
    const ok = texts.some((text) => collapse(coreAfterWelcome(text)) === want) || collapse(coreAfterWelcome(joined)) === want;
    if (!ok && hedge) flags.push('false_hold');
    else if (!ok) flags.push('wrong_body');
  } else if (row.expect === 'status') {
    const want = expectedStatus(row);
    const ok = texts.some((text) => collapse(coreAfterWelcome(text)) === want) || collapse(coreAfterWelcome(joined)) === want;
    if (!ok && hedge) flags.push('false_hold');
    else if (!ok) flags.push('wrong_body');
  }

  if (row.lang !== 'en' && texts.some((text) => isEnglishFixed(text)) && !texts.some((text) => {
    if (row.expect === 'hedge') return hedgeLangOf(text) === row.lang;
    if (row.expect === 'forward') return collapse(coreAfterWelcome(text)) === expectedForward(row);
    if (row.expect === 'status') return collapse(coreAfterWelcome(text)) === expectedStatus(row);
    if (row.expect === 'lock') return matchesLock(text, row.lockText);
    return false;
  })) flags.push('non_english');

  if (row.lang !== 'en' && row.expect === 'lock' && texts.some((text) => {
    const en = spec.FACTS.find((item) => item.id === row.factId);
    return en && matchesLock(text, en.body.en) && !matchesLock(text, row.lockText);
  })) flags.push('non_english');

  return [...new Set(flags)];
}

function tally(rows) {
  const counts = {};
  for (const row of rows) {
    for (const flag of row.flags) counts[flag] = (counts[flag] || 0) + 1;
  }
  const criticalNames = ['unsupported', 'wrong_body', 'suppression_bypass', 'erase_unhedged', 'leak'];
  const criticalCases = rows.filter((row) => row.flags.some((flag) => criticalNames.includes(flag))).length;
  const nonEn = rows.filter((row) => row.lang !== 'en');
  const nonEnFail = nonEn.filter((row) => row.flags.includes('non_english')).length;
  const falseHolds = rows.filter((row) => row.flags.includes('false_hold')).length;
  const silent = rows.filter((row) => row.flags.includes('silent_drop')).length;
  const faqReg = rows.filter((row) => row.flags.includes('faq_regression')).length;
  const falseHoldRate = rows.length ? falseHolds / rows.length : 0;
  const nonEnRate = nonEn.length ? nonEnFail / nonEn.length : 0;
  const pass = criticalCases === 0 && silent === 0 && faqReg === 0 && falseHoldRate <= 0.02 && nonEnRate <= 0.02;
  return {
    cases: rows.length,
    faqCases: rows.filter((row) => row.faq).length,
    criticalCases,
    silentDrops: silent,
    faqRegressions: faqReg,
    falseHolds,
    falseHoldRate,
    nonEnglishCases: nonEn.length,
    nonEnglishFailures: nonEnFail,
    nonEnglishRate: nonEnRate,
    flagCounts: counts,
    verdict: pass ? 'PASS' : 'FAIL',
  };
}

async function main() {
  const helpProbe = await probeHelpCentre();
  const started = Date.now();
  const scored = [];
  let n = 0;
  for (const row of cases) {
    n += 1;
    const patchedResult = await runOne(patched, row);
    let baseResult = null;
    if (row.faq) baseResult = await runOne(baseline, row);
    const flags = score(row, patchedResult, baseResult);
    scored.push({
      id: row.id,
      kind: row.kind,
      lang: row.lang,
      path: row.path,
      expect: row.expect,
      faq: !!row.faq,
      flags,
      comments: patchedResult.comments,
      baseComments: baseResult ? baseResult.comments : null,
      error: patchedResult.error,
      logs: patchedResult.logs.slice(0, 8),
    });
    if (n % 100 === 0) {
      const mid = tally(scored);
      process.stderr.write('progress ' + n + '/' + cases.length + ' crit=' + mid.criticalCases + ' silent=' + mid.silentDrops + ' faq=' + mid.faqRegressions + '\n');
    }
  }
  const summary = tally(scored);
  summary.elapsedMs = Date.now() - started;
  summary.presendMode = process.env.LUNA_PRESEND_MODE;
  summary.helpCentreProbe = helpProbe;
  summary.tripwire = {
    total: trips.length,
    blocked: trips.filter((item) => item.blocked).length,
    allowed: trips.filter((item) => !item.blocked).length,
    blockedHosts: [...new Set(trips.filter((item) => item.blocked).map((item) => item.host))],
    allowedHosts: [...new Set(trips.filter((item) => !item.blocked).map((item) => item.host))],
  };
  summary.samples = {};
  for (const name of ['unsupported', 'wrong_body', 'suppression_bypass', 'erase_unhedged', 'leak', 'silent_drop', 'faq_regression', 'false_hold', 'non_english']) {
    summary.samples[name] = scored.filter((row) => row.flags.includes(name)).slice(0, 8).map((row) => ({
      id: row.id,
      kind: row.kind,
      lang: row.lang,
      path: row.path,
      expect: row.expect,
      flags: row.flags,
      comment: (row.comments[0] || '').slice(0, 280),
      base: row.baseComments ? (row.baseComments[0] || '').slice(0, 180) : '',
      logs: row.logs,
      error: row.error,
    }));
  }
  const out = path.join(ROOT, 'results-summary.json');
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  const full = path.join(ROOT, 'results-full.json');
  fs.writeFileSync(full, JSON.stringify(scored));
  console.log(JSON.stringify({
    verdict: summary.verdict,
    cases: summary.cases,
    criticalCases: summary.criticalCases,
    silentDrops: summary.silentDrops,
    faqRegressions: summary.faqRegressions,
    falseHolds: summary.falseHolds,
    falseHoldRate: summary.falseHoldRate,
    nonEnglishFailures: summary.nonEnglishFailures,
    nonEnglishRate: summary.nonEnglishRate,
    flagCounts: summary.flagCounts,
    tripwire: summary.tripwire,
    helpCentreProbe: summary.helpCentreProbe,
    elapsedMs: summary.elapsedMs,
  }, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
