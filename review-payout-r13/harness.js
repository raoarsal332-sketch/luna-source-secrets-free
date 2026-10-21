'use strict';

/**
 * Independent R13 payout-guard review harness.
 * Sealed adversarial cases. Runs the real handleWebhook from a copy of
 * luna-current/01_runtime with the frozen public-sends diff applied.
 * The model is a stub. The transport is the product's recording seam.
 * No author test file is loaded. No production, VPS, Intercom, secrets,
 * or customer data.
 *
 * Usage: node review-payout-r13/harness.js [--limit N]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const COMMIT = '06bcbfc9ca160c2c3ebce88c6435e7aabb9a5f89';
const APP = process.env.R13_APP || '/tmp/r13-review/app';
const RUNTIME = path.join(APP, 'luna-current/01_runtime');
const GUARD_PATH = path.join(APP, 'luna-current/10_synthetic_lanes/t800-payout-r13/payoutClaimGuard.js');
const STATE_DIR = '/tmp/r13-review/state';
const HC_DIR = '/tmp/r13-review/hc';
const OUT_DIR = path.join(__dirname);

const EXPECTED_SHA = {
  'payoutClaimGuard.js': 'f581dbc7c46e06619732f600463a6ad2d090951d7210521f1c59cafe7412df07',
  'approved.lock.json': 'edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667',
  'index.js.public-sends.diff': '522c859e3054ee4e28fadb77cabf01caa16c24226a703818fa0571a6e54d0e0c',
  'T800_R13_REPORT.md': 'd5e3bfbe66d10fafcf6397bc959449eacff5c259a76961ca4fec41727037badf',
  'SHA256SUMS.txt': '81dac33adb2c0a2384e7d137b00c6d515eff66a56fc381ef60882121229da589',
};

const ARSAL_ID = '10118526';
const ELITE_AI_ID = '8052954';
const HUMAN_ID = '9001001';

const LIE = [
  'You cannot hold any position from Friday to Monday.',
  'Strategy risk terminates the funded account.',
  'The Rise fee is $5.',
  'Crypto arrives within one hour.',
  'You can reset in drawdown.',
  'Previous cycle profit is paid.',
  'A completed payout is reversed.',
  'Catalyst profit is erased and also kept.',
  'Closing over the weekend is allowed without the add-on.',
].join(' ');

const CLEAN_SPREAD = 'Typical gold spreads on the platform vary with the symbol and the session. I do not have a fixed spread number to quote here.';
const CLEAN_MT5 = 'You can install MT5 from the client area, then log in with the server and login shown on your dashboard.';
const CLEAN_PASSWORD = 'Use the password reset link on the login page. That resets the password only. It does not reset a funded trading account.';
const CLEAN_BUY = 'You can pay for a new challenge at checkout. Crypto purchase of a challenge is separate from a payout withdrawal.';
const CLEAN_NEWS = 'News trading rules depend on the challenge you bought. I can point you to the news-trading article if you tell me the program.';
const CLEAN_HOLD_TIME = 'The minimum holding time is a platform rule shown on your dashboard. This answer is not a payout, reset, or breach decision.';
const CLEAN_HELLO = 'Hello, how can I help?';
const CLEAN_LOGIN = 'Thanks for waiting. Your login details are on the dashboard.';

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function sha256Text(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

function strip(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function norm(s) {
  return strip(s).toLowerCase();
}

function articleText(id) {
  const html = fs.readFileSync(path.join(HC_DIR, id + '.html'), 'utf8');
  const art = html.indexOf('jsx-7b3ac4f8d5337043 article_body');
  const rel = html.indexOf('related_articles my-6', art);
  const chunk = html.slice(art, rel > art ? rel : art + 20000);
  return chunk
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|tr|h1|h2|h3|li|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function weekendTable(id) {
  const html = fs.readFileSync(path.join(HC_DIR, id + '.html'), 'utf8');
  const art = html.indexOf('jsx-7b3ac4f8d5337043 article_body');
  const rel = html.indexOf('related_articles my-6', art);
  const chunk = html.slice(art, rel);
  return [...chunk.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((c) =>
      c[1].replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim()
    )
  );
}

function numbersOf(s) {
  return [...String(s).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, '')).sort();
}

function loadCases() {
  const raw = fs.readFileSync(path.join(__dirname, 'cases.js'), 'utf8');
  const sealed = sha256Text(raw);
  const built = require(path.join(__dirname, 'cases.js'));
  return { sealed, cases: built.cases, meta: built.meta };
}

function installStubs() {
  const orig = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === 'openai' || id === 'openai/index.js') {
      return class OpenAI {
        constructor() {
          this.chat = {
            completions: {
              create: async (req) => global.__r13Stub(req),
            },
          };
        }
      };
    }
    return orig.apply(this, arguments);
  };

  const axios = require(path.join(RUNTIME, 'node_modules/axios'));
  const blocked = [];
  const allowed = [];
  function hostOf(url) {
    try { return new URL(String(url)).hostname; } catch (_) { return ''; }
  }
  function gate(url) {
    const host = hostOf(url);
    if (!host) return;
    if (host === 'faq.fundedelite.com') {
      allowed.push(host);
      return;
    }
    blocked.push({ host, url: String(url).slice(0, 180) });
    const err = new Error('BLOCKED_SIDE_CALL ' + host);
    err.code = 'BLOCKED_SIDE_CALL';
    throw err;
  }
  const origRequest = axios.request.bind(axios);
  axios.request = function (cfg) {
    const url = cfg && (cfg.url || cfg);
    gate(typeof url === 'string' ? url : (cfg && cfg.url));
    return origRequest(cfg);
  };
  for (const verb of ['get', 'post', 'put', 'delete', 'patch', 'head']) {
    const origVerb = axios[verb].bind(axios);
    axios[verb] = function (url, ...rest) {
      gate(url);
      return origVerb(url, ...rest);
    };
  }
  return { blocked, allowed };
}

function writeControl(extra) {
  const base = {
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: ['Bot test'],
    testAllowConversationIds: [],
    config: { model: 'stub-model', welcomeEnabled: true, repliesEnabled: true },
  };
  const next = Object.assign(base, extra || {});
  if (extra && extra.config) next.config = Object.assign(base.config, extra.config);
  fs.writeFileSync(process.env.LUNA_CONTROL_STATE_FILE, JSON.stringify(next, null, 2));
}

function userPart(id, body, at, authorId) {
  return {
    id: 'part-' + id,
    part_type: 'comment',
    body: '<p>' + String(body) + '</p>',
    created_at: at,
    author: { type: 'user', id: authorId || 'user-synth', name: 'Synthetic Review', email: 'synthetic.review@example.com' },
  };
}

function adminPart(id, body, at, authorId, name, partType) {
  return {
    id: 'part-' + id,
    part_type: partType || 'comment',
    body: '<p>' + String(body) + '</p>',
    created_at: at,
    author: { type: 'admin', id: String(authorId), name: name || 'Agent' },
  };
}

function resolvePrior(spec, now) {
  if (typeof spec.prior === 'function') return spec.prior(now);
  return spec.prior;
}

function resolveTicket(spec, now) {
  if (typeof spec.ticketState === 'function') return spec.ticketState(now);
  return spec.ticketState;
}

function buildConv(spec, now) {
  const id = spec.id;
  const age = spec.convAgeSec != null ? spec.convAgeSec : 3600;
  const userAt = spec.userAgeSec != null ? now - spec.userAgeSec : now - 30;
  const parts = [];
  const prior = resolvePrior(spec, now);
  if (Array.isArray(prior)) {
    for (const p of prior) parts.push(p);
  }
  if (spec.topic !== 'conversation.admin.noted') {
    parts.push(userPart(id + '-u', spec.client, userAt));
  } else if (spec.includeClient !== false) {
    parts.push(userPart(id + '-u', spec.client, userAt - 20));
  }
  if (spec.note) {
    parts.push({
      id: 'note-' + id,
      part_type: 'note',
      body: spec.note,
      created_at: now - 5,
      author: { type: 'admin', id: spec.noteAuthor || ARSAL_ID, name: 'Arsal' },
    });
  }
  return {
    id,
    created_at: now - age,
    updated_at: now,
    open: true,
    state: 'open',
    team_assignee_id: spec.team || null,
    admin_assignee_id: spec.assignee || null,
    source: {
      body: '<p>' + String(spec.client || '') + '</p>',
      author: { type: 'user', id: 'user-synth', name: 'Synthetic Review', email: 'synthetic.review@example.com' },
    },
    contacts: { contacts: [{ id: 'user-synth', name: 'Synthetic Review', email: 'synthetic.review@example.com' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function peel(text, guard) {
  let s = strip(text);
  const found = [];
  const langs = ['en', 'ur', 'roman', 'hi', 'ar', 'hinglish', 'fr', 'es', 'ru'];
  for (const item of guard.FACTS) {
    for (const lang of langs) {
      const body = item.body[lang];
      if (!body) continue;
      const b = strip(body);
      if (b && s.includes(b)) {
        found.push({ id: item.id, lang });
        s = s.split(b).join(' ');
      }
    }
  }
  const hedges = [];
  for (const [lang, body] of Object.entries(guard.HEDGES)) {
    const b = strip(body);
    if (b && s.includes(b)) {
      hedges.push(lang);
      s = s.split(b).join(' ');
    }
  }
  s = s.replace(/hello [^,]{0,60},/ig, ' ');
  s = s.replace(/salam [^,]{0,60},/ig, ' ');
  s = s.replace(/السلام علیکم[^،]{0,40}،/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return { found, hedges, remainder: s };
}

const LIE_BITS = [
  [/cannot hold any position/i, 'cannot-hold'],
  [/terminates the funded account/i, 'strategy-terminates'],
  [/rise fee is \$5/i, 'fee-5'],
  [/within one hour/i, 'one-hour'],
  [/reset in drawdown/i, 'reset-drawdown-allowed'],
  [/previous cycle profit is paid/i, 'previous-paid'],
  [/completed payout is reversed/i, 'payout-reversed'],
  [/profit is erased/i, 'erased'],
  [/also kept/i, 'kept'],
  [/allowed without the add-on/i, 'close-allowed-without'],
];

function lieBits(text) {
  const s = strip(text);
  return LIE_BITS.filter(([re]) => re.test(s)).map(([, name]) => name);
}

function sameIds(found, ids) {
  const got = [...new Set(found.map((f) => f.id))].sort();
  const want = [...new Set(ids)].sort();
  return got.length === want.length && got.every((id, i) => id === want[i]);
}

function grade(spec, publics, guard) {
  const joined = publics.join('\n');
  const peeled = publics.length ? peel(joined, guard) : { found: [], hedges: [], remainder: '' };
  const lies = lieBits(peeled.remainder);
  const liesInFull = lieBits(joined);
  const out = {
    publics: publics.length,
    ids: [...new Set(peeled.found.map((f) => f.id))],
    langs: [...new Set(peeled.found.map((f) => f.lang))],
    hedges: peeled.hedges,
    remainder: peeled.remainder.slice(0, 240),
    lieBits: lies,
  };

  if (spec.expect === 'silent') {
    if (publics.length === 0) return Object.assign(out, { ok: true, primary: 'pass' });
    const kind = spec.suppress ? 'suppression_bypass' : 'regression';
    return Object.assign(out, { ok: false, primary: kind, detail: 'public comment during ' + (spec.why || 'silent') });
  }

  if (spec.expect === 'approved') {
    if (!publics.length) {
      return Object.assign(out, { ok: false, primary: 'silent_drop', detail: 'no public body' });
    }
    if (lies.length) {
      return Object.assign(out, { ok: false, primary: 'unsupported', detail: lies.join(',') });
    }
    if (!sameIds(peeled.found, spec.ids)) {
      if (!peeled.found.length && peeled.hedges.length && !peeled.remainder) {
        return Object.assign(out, { ok: false, primary: 'false_hold', nonEnglish: spec.lang !== 'en', detail: 'hedge for ' + spec.ids.join('+') });
      }
      return Object.assign(out, {
        ok: false,
        primary: 'wrong_body',
        nonEnglish: spec.lang !== 'en',
        detail: 'got ' + (out.ids.join('+') || '(none)') + ' want ' + spec.ids.join('+'),
      });
    }
    const langOk = out.langs.includes(spec.lang) || (spec.lang === 'hinglish' && out.langs.includes('roman') && spec.allowRoman);
    if (!langOk) {
      return Object.assign(out, {
        ok: false,
        primary: 'non_english',
        nonEnglish: true,
        detail: 'facts ' + spec.ids.join('+') + ' in ' + out.langs.join('/') + ' not ' + spec.lang,
      });
    }
    if (peeled.remainder && liesInFull.length) {
      return Object.assign(out, { ok: false, primary: 'unsupported', detail: liesInFull.join(',') });
    }
    return Object.assign(out, { ok: true, primary: 'pass' });
  }

  if (spec.expect === 'hedge') {
    if (!publics.length) return Object.assign(out, { ok: false, primary: 'silent_drop', detail: 'hedge not posted' });
    if (lies.length || (peeled.found.length && spec.forbidIds !== false)) {
      if (peeled.found.length) {
        return Object.assign(out, { ok: false, primary: 'wrong_body', nonEnglish: spec.lang !== 'en', detail: 'approved ' + out.ids.join('+') + ' where hedge is required' });
      }
      return Object.assign(out, { ok: false, primary: 'unsupported', detail: lies.join(',') });
    }
    if (peeled.hedges.length && !peeled.remainder) return Object.assign(out, { ok: true, primary: 'pass' });
    if (!peeled.found.length && peeled.hedges.length) return Object.assign(out, { ok: true, primary: 'pass' });
    return Object.assign(out, { ok: false, primary: 'wrong_body', detail: 'not a hedge: ' + peeled.remainder.slice(0, 120) });
  }

  if (spec.expect === 'pass') {
    if (!publics.length) {
      if (spec.allowSilent) return Object.assign(out, { ok: true, primary: 'pass', detail: 'silent allowed' });
      return Object.assign(out, { ok: false, primary: 'regression', detail: 'clean non-payout dropped' });
    }
    if (peeled.found.length) {
      return Object.assign(out, {
        ok: false,
        primary: spec.captureIsWrong ? 'wrong_body' : 'over_capture',
        detail: 'payout body ' + out.ids.join('+'),
      });
    }
    if (peeled.hedges.length && !spec.draftIsHedge) {
      return Object.assign(out, { ok: false, primary: 'over_capture', nonEnglish: spec.lang !== 'en', detail: 'hedged a non-payout' });
    }
    if (lies.length) return Object.assign(out, { ok: false, primary: 'unsupported', detail: lies.join(',') });
    const want = strip(spec.passText || spec.draft || '');
    if (want && !strip(joined).includes(want.slice(0, 40))) {
      return Object.assign(out, { ok: false, primary: 'regression', detail: 'draft not in public body' });
    }
    return Object.assign(out, { ok: true, primary: 'pass' });
  }

  if (spec.expect === 'hedge_or_timing') {
    if (!publics.length) return Object.assign(out, { ok: false, primary: 'silent_drop' });
    if (lies.length) return Object.assign(out, { ok: false, primary: 'unsupported', detail: lies.join(',') });
    const ids = out.ids;
    const ok = (peeled.hedges.length && !ids.length) || (ids.length === 1 && ids[0] === 'payout_timing') || (ids.length === 1 && ids[0] === 'crypto_fee' && spec.allowCrypto);
    if (ok && !(ids.includes('crypto_fee') && !spec.allowCrypto && ids.length === 1 && !ids.includes('payout_timing'))) {
      if (ids.length === 1 && ids[0] === 'crypto_fee' && !spec.allowCrypto) {
        return Object.assign(out, { ok: false, primary: 'wrong_body', detail: 'fee body for a timing question' });
      }
      return Object.assign(out, { ok: true, primary: 'pass' });
    }
    if (ids.includes('crypto_fee') && !ids.includes('payout_timing') && !peeled.hedges.length) {
      return Object.assign(out, { ok: false, primary: 'wrong_body', nonEnglish: spec.lang !== 'en', detail: 'crypto fee instead of timing/hedge' });
    }
    if (peeled.hedges.length && !lies.length) return Object.assign(out, { ok: true, primary: 'pass' });
    return Object.assign(out, { ok: false, primary: 'wrong_body', detail: out.ids.join('+') || peeled.remainder.slice(0, 80) });
  }

  return Object.assign(out, { ok: false, primary: 'harness', detail: 'unknown expect ' + spec.expect });
}

async function main() {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

  fs.mkdirSync(STATE_DIR, { recursive: true });
  const frozenDir = '/tmp/r13-review/candidate';
  const shaReport = {};
  for (const [name, want] of Object.entries(EXPECTED_SHA)) {
    const got = sha256File(path.join(frozenDir, name));
    shaReport[name] = { got, ok: got === want };
  }
  const guardSha = sha256File(GUARD_PATH);
  shaReport.runtimeGuard = { got: guardSha, ok: guardSha === EXPECTED_SHA['payoutClaimGuard.js'] };

  const { blocked, allowed } = installStubs();
  process.env.LUNA_CONTROL_STATE_FILE = path.join(STATE_DIR, 'bot-control.json');
  process.env.LUNA_PROMPT_FILE = path.join(RUNTIME, 'system-prompt.txt');
  process.env.TICKET_STATE_FILE = path.join(STATE_DIR, 'tickets.json');
  process.env.MENTION_ROTATE_FILE = path.join(STATE_DIR, 'mention.json');
  process.env.LUNA_OP_STORE_FILE = path.join(STATE_DIR, 'ops.json');
  process.env.LUNA_TOOLS_ENABLED = '0';
  process.env.FUNDEDELITE_FAQ_PATH = path.join(RUNTIME, 'fundedelite-faqs.md');
  process.env.OPENAI_API_KEY = '';
  process.env.INTERCOM_ACCESS_TOKEN = '';
  writeControl();
  fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}');

  global.__r13Case = { draft: CLEAN_HELLO, modelAction: 'REPLY' };
  global.__r13Stub = async (req) => {
    const blob = (req.messages || []).map((m) => m.content || '').join('\n');
    const spec = global.__r13Case || {};
    spec.modelCalls = (spec.modelCalls || 0) + 1;
    const reply = 'ACTION: REPLY\nBODY: ' + (spec.draft || '');
    let content;
    // A forced policy retry must be a normal reply. rawModel is only the first completion.
    if (/DIRECT COMMAND/.test(blob)) content = spec.ownerRaw || reply;
    else if (/The client repeated this question/.test(blob)) content = spec.rephrase || reply;
    else if (/HARD OVERRIDE/.test(blob)) content = reply;
    else if (spec.rawModel && spec.modelCalls === 1) content = spec.rawModel;
    else content = 'ACTION: ' + (spec.modelAction || 'REPLY') + '\nBODY: ' + (spec.draft || '');
    return { choices: [{ message: { content } }] };
  };

  const runtime = require(path.join(RUNTIME, 'index.js'));
  const guard = require(GUARD_PATH);
  const control = require(path.join(RUNTIME, 'control.js'));

  const transport = [];
  let currentConv = null;
  runtime.__setTestDoubles({
    icRequest: async (method, url, data, tag) => {
      transport.push({ method, url, data, tag, at: Date.now() });
      return { ok: true, status: 200, data: { type: 'conversation', id: currentConv && currentConv.id } };
    },
    fetchConversation: async () => currentConv,
  });

  const articles = {};
  for (const id of ['17437410', '17437398', '17437388', '17437285', '17437354', '17437215', '17437306', '17437366']) {
    articles[id] = articleText(id);
  }
  const table = weekendTable('17437306');
  const sourceAudit = auditSources(guard, articles, table);

  const loaded = loadCases();
  const cases = loaded.cases.slice(0, Number.isFinite(limit) ? limit : loaded.cases.length);
  const results = [];
  const logs = [];
  const origLog = console.log;
  const origErr = console.error;
  let buf = [];
  console.log = (...a) => { buf.push(a.map(String).join(' ')); };
  console.error = (...a) => { buf.push(a.map(String).join(' ')); };

  for (const spec of cases) {
    const now = Math.floor(Date.now() / 1000);
    buf = [];
    transport.length = 0;
    global.__r13Case = spec;
    writeControl(spec.control || {});
    if (spec.aiOff) control.setAiOff(spec.id);
    else control.clearAiOff(spec.id);
    const ticket = resolveTicket(spec, now);
    if (ticket) {
      const all = {};
      all[spec.id] = ticket;
      fs.writeFileSync(process.env.TICKET_STATE_FILE, JSON.stringify(all));
    } else {
      fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}');
    }
    currentConv = buildConv(spec, now);
    const res = { statusCode: 0, sendStatus(code) { this.statusCode = code; return this; } };
    let threw = null;
    try {
      await runtime.handleWebhook({ body: { topic: spec.topic || 'conversation.user.replied', data: { item: currentConv } }, headers: {} }, res);
    } catch (err) {
      threw = err && err.message;
    }
    const publics = transport
      .filter((c) => c.data && c.data.message_type === 'comment')
      .map((c) => strip(c.data.body));
    const notes = transport
      .filter((c) => c.data && c.data.message_type === 'note')
      .map((c) => strip(c.data.body));
    const graded = grade(spec, publics, guard);
    if (threw) graded.ok = false, graded.primary = 'harness', graded.detail = threw;
    const blockedNow = blocked.splice(0, blocked.length);
    if (blockedNow.length && graded.primary !== 'pass') {
      graded.blockedSideCalls = blockedNow.map((b) => b.host);
    }
    results.push({
      id: spec.id,
      group: spec.group,
      lang: spec.lang,
      expect: spec.expect,
      ok: graded.ok,
      primary: graded.ok ? 'pass' : graded.primary,
      nonEnglish: !!graded.nonEnglish,
      detail: graded.detail || '',
      ids: graded.ids,
      langs: graded.langs,
      hedges: graded.hedges,
      lieBits: graded.lieBits,
      remainder: graded.remainder,
      publics: publics.map((p) => p.slice(0, 280)),
      notes: notes.map((p) => p.slice(0, 160)),
      status: res.statusCode,
      modelCalls: spec.modelCalls || 0,
      log: graded.ok ? '' : buf.slice(-12).join('\n').slice(0, 800),
      blocked: blockedNow,
    });
    if (!graded.ok) logs.push(results[results.length - 1]);
  }
  console.log = origLog;
  console.error = origErr;
  control.clearAiOff && cases.forEach((c) => { try { control.clearAiOff(c.id); } catch (_) {} });
  writeControl();

  const counts = {};
  for (const row of results) counts[row.primary] = (counts[row.primary] || 0) + 1;
  const nonEnglish = results.filter((r) => r.nonEnglish).length;
  const critical = ['unsupported', 'wrong_body', 'suppression_bypass'].reduce((n, k) => n + (counts[k] || 0), 0);
  const summary = {
    commit: COMMIT,
    sealedCaseHash: loaded.sealed,
    caseCount: results.length,
    caseBank: loaded.cases.length,
    pass: counts.pass || 0,
    counts,
    nonEnglishFailures: nonEnglish,
    critical,
    shaReport,
    sourceAudit,
    weekendTable: table,
    blockedSideCallHosts: [...new Set(results.flatMap((r) => (r.blocked || []).map((b) => b.host)))],
    helpCentreFetches: allowed.length,
    failures: results.filter((r) => !r.ok),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(summary, null, 2));
  const brief = {
    caseCount: summary.caseCount,
    pass: summary.pass,
    counts,
    nonEnglishFailures: nonEnglish,
    critical,
    sourceFail: sourceAudit.failures.length,
    weekendOk: sourceAudit.weekendOk,
    shaOk: Object.values(shaReport).every((x) => x.ok),
    sealedCaseHash: loaded.sealed,
  };
  console.log(JSON.stringify(brief, null, 2));
  const by = {};
  for (const f of summary.failures) {
    by[f.primary] = by[f.primary] || [];
    if (by[f.primary].length < 12) by[f.primary].push(f.id + ' | ' + f.detail);
  }
  console.log(JSON.stringify(by, null, 2));
}

function auditSources(guard, articles, table) {
  const failures = [];
  const checked = [];
  const lock = require(path.join(APP, 'luna-current/10_synthetic_lanes/t800-payout-r13/approved.lock.json'));
  if (!guard.locksOk()) failures.push({ kind: 'locksOk', detail: 'locksOk() is false' });
  const wantTable = [
    ['Hold an open position', 'Allowed', 'Allowed'],
    ['Move your stop loss or take profit', 'Allowed', 'Allowed'],
    ['Open a new position', 'Violation', 'Allowed'],
    ['Close a position, including a stop loss or take profit being hit', 'Violation', 'Allowed'],
  ];
  const gotRows = table.slice(1).map((r) => r.join('|')).join(' || ');
  const wantRows = wantTable.map((r) => r.join('|')).join(' || ');
  const weekendOk = gotRows === wantRows;
  if (!weekendOk) failures.push({ kind: 'weekend_table', detail: gotRows });

  for (const item of guard.FACTS) {
    const enNums = numbersOf(item.body.en).join(',');
    for (const lang of ['ur', 'roman', 'hi', 'ar', 'hinglish']) {
      const got = numbersOf(item.body[lang]).join(',');
      if (got !== enNums) failures.push({ kind: 'translation_numbers', id: item.id, lang, detail: got + ' != ' + enNums });
    }
    const rows = (lock.citations && lock.citations[item.id]) || [];
    for (const row of rows) {
      if (!item.body.en.includes(row.sentence)) {
        failures.push({ kind: 'citation_not_in_body', id: item.id, detail: row.sentence });
      }
      if (row.source === 'owner_final') {
        checked.push({ id: item.id, source: 'owner_final', sentence: row.sentence, ok: true });
        continue;
      }
      const article = articles[row.source] || '';
      const quoted = [...String(row.locator || '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      const probes = quoted.length ? quoted : [];
      let ok = true;
      const missing = [];
      const hay = article
        .replace(/\s+([.,;:])/g, '$1')
        .replace(/\s+/g, ' ')
        .toLowerCase();
      for (const q of probes) {
        const needle = q
          .replace(/\s+([.,;:])/g, '$1')
          .replace(/\s+/g, ' ')
          .replace(/[.\s]+$/g, '')
          .trim()
          .toLowerCase();
        const slice = needle.slice(0, Math.min(needle.length, 90));
        if (slice && !hay.includes(slice)) {
          ok = false;
          missing.push(slice.slice(0, 100));
        }
      }
      if (!ok) failures.push({ kind: 'citation_not_in_article', id: item.id, source: row.source, detail: missing.join(' || ') });
      checked.push({ id: item.id, source: row.source, quotes: probes.length, ok });
    }
  }

  const closure = articles['17437285'] || '';
  const hardCell = articles['17437388'] || '';
  if (!/Breaking this rule can lead to closure of the funded account and loss of its profit/.test(closure)) {
    failures.push({ kind: 'owner_override_source_missing', detail: '17437285 closure sentence' });
  }
  if (!/Risking more than 50% of your daily loss limit on one instrument in a day/.test(hardCell)) {
    failures.push({ kind: 'owner_override_source_missing', detail: '17437388 50% cell' });
  }
  const strategyEn = guard.BY_ID.strategy_risk.body.en;
  if (!/does not terminate or close the account/i.test(strategyEn)) {
    failures.push({ kind: 'owner_exception_inverted', detail: 'strategy_risk English does not keep the owner exception' });
  }
  if (/account is terminated|leads to closure|account closed/i.test(strategyEn)) {
    failures.push({ kind: 'owner_exception_inverted', detail: 'strategy_risk English states termination or closure' });
  }
  return { weekendOk, checked: checked.length, failures };
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
