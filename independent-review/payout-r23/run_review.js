'use strict';

/**
 * Independent R23 runner. Loads the already-sealed case file and drives the
 * candidate's real handleWebhook. It does not rewrite the sealed cases.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SEAL_PATH = path.join(__dirname, 'sealed-cases.json');
const SEAL_HASH_PATH = path.join(__dirname, 'SEALED.sha256');
const CANDIDATE = '96485a938cfdbeacd3ed6d5a62d630041675a80f';
const TREE = process.env.R23_TREE || '/tmp/r23-run';
const RUNTIME = path.join(TREE, 'luna-current/01_runtime');
const GUARD_PATH = path.join(TREE, 'luna-current/10_synthetic_lanes/t800-payout-r23/payoutClaimGuard.js');
const LIMIT = process.env.R23_LIMIT ? Number(process.env.R23_LIMIT) : 0;
const OUT = process.env.R23_OUT || path.join(__dirname, 'run-results.json');

const EN_HEDGE = "I can't confirm that. Our team will confirm.";
const FALLBACK_LINE = 'Thanks for the details. I am checking this now and will update you here shortly.';
const ARSAL_ID = '10118526';

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

function norm(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function extractFunction(src, name) {
  const sig = 'function ' + name + '(';
  const start = src.indexOf(sig);
  if (start < 0) throw new Error('missing function ' + name);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const code = src.slice(start, i + 1);
        return new Function('return (' + code + ');')();
      }
    }
  }
  throw new Error('unclosed function ' + name);
}

function articlesOf(md) {
  const parts = String(md).split(/\n### /);
  const articles = [];
  for (let i = 1; i < parts.length; i++) {
    const title = parts[i].split('\n', 1)[0].trim();
    let body = parts[i].replace(/^[^\n]*\n/, '');
    body = body.replace(/^URL:.*$/gm, '');
    body = body.replace(/\n---[\s\S]*$/, '').trim();
    const lines = body.split('\n');
    while (lines.length && /^\s*-\s+/.test(lines[lines.length - 1]) && lines[lines.length - 1].length < 120) {
      lines.pop();
    }
    body = lines.join('\n').trim();
    if (body.length >= 40) articles.push({ title, body, sha256: sha256(body) });
  }
  return articles;
}

function installTripwire() {
  const http = require('http');
  const https = require('https');
  const net = require('net');
  const dns = require('dns');
  const hits = [];
  function boom(label) {
    return function tripwire() {
      const err = new Error('NETWORK_TRIPWIRE ' + label);
      err.code = 'TRIPWIRE';
      hits.push(label);
      throw err;
    };
  }
  http.request = boom('http.request');
  http.get = boom('http.get');
  https.request = boom('https.request');
  https.get = boom('https.get');
  net.connect = boom('net.connect');
  net.createConnection = boom('net.createConnection');
  dns.lookup = function tripwireLookup(host, opts, cb) {
    const err = new Error('NETWORK_TRIPWIRE dns ' + host);
    err.code = 'TRIPWIRE';
    hits.push('dns:' + host);
    if (typeof opts === 'function') return opts(err);
    if (typeof cb === 'function') return cb(err);
    return Promise.reject(err);
  };
  if (dns.promises) {
    dns.promises.lookup = async function tripwireLookupPromise(host) {
      hits.push('dns:' + host);
      throw new Error('NETWORK_TRIPWIRE dns ' + host);
    };
  }
  global.fetch = boom('fetch');
  return hits;
}

function stubOpenAI(current) {
  const Module = require('module');
  const original = Module.prototype.require;
  Module.prototype.require = function patchedRequire(id) {
    if (id === 'openai') {
      const Real = original.apply(this, arguments);
      const Base = Real.OpenAI || Real;
      function Wrapped(config) {
        const client = new Base(config);
        client.chat.completions.create = async function stubCreate() {
          current.modelCalls += 1;
          return { choices: [{ message: { content: current.modelText } }] };
        };
        return client;
      }
      Object.assign(Wrapped, Real);
      Wrapped.OpenAI = Wrapped;
      return Wrapped;
    }
    return original.apply(this, arguments);
  };
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u00a0/g, ' ')
    .trim();
}

function buildConversation(item, draft) {
  const id = 'rev-' + item.id;
  const now = 1_700_100_000;
  const parts = [];
  const user = { type: 'user', id: 'user-1', name: 'Review Client' };
  const arsal = { type: 'admin', id: ARSAL_ID, name: 'Arsal' };
  let clock = now - 50;
  const push = (part) => {
    part.created_at = clock;
    clock += 1;
    parts.push(part);
  };
  if (item.path === 'retry' || item.path === 'fallback') {
    push({
      id: id + '-old-user',
      part_type: 'comment',
      body: '<p>' + item.client + '</p>',
      author: user,
    });
  }
  if (item.path === 'fallback') {
    push({
      id: id + '-old-bot',
      part_type: 'comment',
      body: '<p>' + FALLBACK_LINE + '</p>',
      author: arsal,
    });
  } else if (item.path === 'retry') {
    push({
      id: id + '-old-bot',
      part_type: 'comment',
      body: '<p>' + draft + '</p>',
      author: arsal,
    });
  } else if (item.path === 'customer' && item.expect === 'bytes') {
    push({
      id: id + '-hello',
      part_type: 'comment',
      body: '<p>Hello.</p>',
      author: arsal,
    });
  }
  if (item.path !== 'owner' && item.path !== 'missing') {
    push({
      id: id + '-user',
      part_type: 'comment',
      body: '<p>' + item.client + '</p>',
      author: user,
    });
  } else {
    push({
      id: id + '-user',
      part_type: 'comment',
      body: '<p>' + (item.client || 'Please send this.') + '</p>',
      author: user,
    });
    push({
      id: id + '-note',
      part_type: 'note',
      // The live auth-note gate ignores an owner command that does not @mention
      // Arsal or Jerry. The mention is transport, not a change to the sealed draft.
      body: '@Arsal REPLY: ' + draft,
      author: arsal,
    });
  }
  return {
    id,
    open: true,
    state: 'open',
    created_at: now - 86400,
    updated_at: now,
    team_assignee_id: 0,
    admin_assignee_id: ARSAL_ID,
    source: {
      type: 'conversation',
      body: '<p>' + (item.client || 'Please send this.') + '</p>',
      author: user,
      created_at: now - 80,
    },
    contacts: {
      contacts: [{ id: 'user-1', name: 'Review Client', email: 'review.client@example.com' }],
    },
    conversation_parts: { conversation_parts: parts },
  };
}

function fakeRes() {
  const res = {
    statusCode: 200,
    sendStatus(code) {
      this.statusCode = code;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
    send() {
      return this;
    },
  };
  return res;
}

async function main() {
  const sealRaw = fs.readFileSync(SEAL_PATH, 'utf8');
  const sealDigest = sha256(sealRaw);
  const recorded = fs.readFileSync(SEAL_HASH_PATH, 'utf8').trim().split(/\s+/)[0];
  if (sealDigest !== recorded) {
    throw new Error('sealed file hash drifted before the run: ' + sealDigest + ' vs ' + recorded);
  }
  const sealed = JSON.parse(sealRaw);
  if (sealed.candidate !== CANDIDATE) throw new Error('sealed candidate mismatch');
  if (sealed.caseCount < 1400) throw new Error('sealed set smaller than 1400');

  const freeze = {
    'SHA256SUMS.txt': 'ad6e412c5c5ea02e3786836775287ce863b911d2d70afeafe7405f154d8a87e3',
    'payoutClaimGuard.js': 'c2da4b37d6743f255a5a63f16fb8a383ccb944ee6facb4a12b66414b1f9a0634',
    'index.js.public-sends.diff': '74f20b02803276597b2ade4d696fa189a5581d0b55ffd8b876d554f7e188c5ba',
    'faqAllowlist.json': '9f051040460d4be968957f3877186a85bce86d0242f66db034dcf813769fa404',
    'approved.lock.json': 'edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667',
    'T800_R23_REPORT.md': '26db242766e64eedd894f033b5bc8cde6b1639ed3eeaa1fce3a5d8f668a24abd',
  };
  const lane = path.join(TREE, 'luna-current/10_synthetic_lanes/t800-payout-r23');
  const freezeOk = {};
  for (const [name, expected] of Object.entries(freeze)) {
    const got = sha256File(path.join(lane, name));
    freezeOk[name] = got === expected;
    if (got !== expected) throw new Error('freeze mismatch ' + name + ' ' + got);
  }
  const articles = articlesOf(fs.readFileSync(path.join(RUNTIME, 'fundedelite-faqs.md'), 'utf8'));
  const indexSrc = fs.readFileSync(path.join(RUNTIME, 'index.js'), 'utf8');
  if (!indexSrc.includes('R23_PUBLIC_SEND_START')) throw new Error('public send diff not applied');
  const toHtml = extractFunction(indexSrc, 'toHtml');

  const stateDir = fs.mkdtempSync(path.join('/tmp', 'r23-state-'));
  const controlFile = path.join(stateDir, 'control.json');
  const ticketFile = path.join(stateDir, 'tickets.json');
  fs.writeFileSync(controlFile, JSON.stringify({
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: ['Bot test'],
    testAllowConversationIds: [],
    config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
  }));
  fs.writeFileSync(ticketFile, '{}');
  // index.js calls dotenv.config() from the process cwd. Stay in an empty
  // directory so a workspace .env cannot supply tokens.
  process.chdir(stateDir);
  process.env.LUNA_CONTROL_STATE_FILE = controlFile;
  process.env.LUNA_PROMPT_FILE = path.join(RUNTIME, 'system-prompt.txt');
  process.env.TICKET_STATE_FILE = ticketFile;
  process.env.FUNDEDELITE_FAQ_PATH = path.join(RUNTIME, 'fundedelite-faqs.md');
  process.env.LUNA_TOOLS_ENABLED = '0';
  process.env.OPENAI_API_KEY = 'sk-review-not-a-real-key';
  delete process.env.INTERCOM_ACCESS_TOKEN;
  delete process.env.INTERCOM_WEBHOOK_SECRET;
  delete process.env.INTERCOM_CLIENT_SECRET;
  process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';

  const current = { modelText: 'ACTION: REPLY\nBODY: Hello.', modelCalls: 0, faqBody: null };
  const tripwire = installTripwire();
  stubOpenAI(current);

  const guard = require(GUARD_PATH);
  const hedges = Object.values(guard.HEDGES);
  const hedgeNorm = new Set(hedges.map(norm));
  const runtime = require(path.join(RUNTIME, 'index.js'));
  const faqKb = require(path.join(RUNTIME, 'faq-kb.js'));
  faqKb.retrieveOfficialFaqContext = async function stubRetrieve() {
    if (!current.faqBody) return null;
    return { block: current.faqBody, from: 'review-stub', title: 'Official FAQ' };
  };

  const sent = [];
  let activeConv = null;
  runtime.__setTestDoubles({
    fetchConversation: async () => activeConv,
    icRequest: async (method, url, payload, tag) => {
      const host = String(url || '');
      if (!/api\.intercom\.io/.test(host)) {
        tripwire.push('icRequest:' + host);
        throw new Error('NETWORK_TRIPWIRE icRequest ' + host);
      }
      if (String(method).toLowerCase() === 'get') {
        return { ok: true, status: 200, data: activeConv };
      }
      const record = {
        method,
        url,
        tag,
        payload: payload || null,
      };
      sent.push(record);
      return { ok: true, status: 200, data: { id: 'comment-' + sent.length } };
    },
  });

  let cases = sealed.cases;
  if (process.env.R23_SMOKE === '1') {
    const seen = new Set();
    cases = sealed.cases.filter((item) => {
      const key = item.bucket + ':' + item.path + ':' + item.expect;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } else if (LIMIT) {
    cases = sealed.cases.slice(0, LIMIT);
  }
  const results = [];
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => {
    logs.push(args.map((part) => String(part)).join(' ').slice(0, 400));
    if (logs.length > 40) logs.shift();
  };

  function publicComments() {
    return sent.filter((row) => row.payload && row.payload.message_type === 'comment');
  }

  for (const item of cases) {
    sent.length = 0;
    logs.length = 0;
    current.modelCalls = 0;
    current.faqBody = null;
    let draft = item.draft;
    if (item.faqIndex != null) {
      const article = articles[item.faqIndex];
      if (!article || article.sha256 !== item.faqSha256) {
        results.push({ id: item.id, error: 'faq seal mismatch' });
        continue;
      }
      draft = article.body;
      if (item.path === 'customer') current.faqBody = article.body;
    }
    current.modelText = 'ACTION: REPLY\nBODY: ' + draft;
    if (item.path === 'defer') {
      const state = {};
      state['rev-' + item.id] = {
        escalateAwaitingFirstTeammate: true,
        lastEscalateAt: 1_700_000_000,
        lastEscalateTopic: 'payout',
        lastEscalateProblem: 'Payout is not eligible and says please try again.',
        authNotesBootstrapped: true,
        handledAuthNoteIds: [],
      };
      fs.writeFileSync(ticketFile, JSON.stringify(state));
    } else {
      fs.writeFileSync(ticketFile, '{}');
    }
    const conv = buildConversation(item, draft);
    activeConv = conv;
    const topic = item.path === 'owner' || item.path === 'missing' ? 'conversation.admin.noted' : 'conversation.user.replied';
    let error = '';
    const guardAside = GUARD_PATH + '.aside';
    const hideGuard = item.path === 'missing';
    if (hideGuard) {
      const resolved = require.resolve(GUARD_PATH);
      delete require.cache[resolved];
      fs.renameSync(GUARD_PATH, guardAside);
    }
    try {
      await Promise.race([
        runtime.handleWebhook({ body: { topic, data: { item: conv } }, get() { return ''; }, headers: {} }, fakeRes()),
        new Promise((_, reject) => setTimeout(() => reject(new Error('case timeout')), 20000)),
      ]);
    } catch (err) {
      error = err && err.message ? err.message : String(err);
    } finally {
      if (hideGuard && fs.existsSync(guardAside)) {
        fs.renameSync(guardAside, GUARD_PATH);
        try { delete require.cache[require.resolve(GUARD_PATH)]; } catch (_) { /* reloaded next time */ }
      }
    }
    const comments = publicComments().map((row) => ({
      body: row.payload.body,
      text: htmlToText(row.payload.body),
    }));
    const texts = comments.map((row) => row.text);
    const joined = texts.join('\n');
    const needle = item.needle || '';
    const containsNeedle = needle && norm(joined).includes(norm(needle));
    const exactHtml = comments.some((row) => row.body === toHtml(draft));
    const textMatch = texts.some((text) => norm(text) === norm(draft));
    const hedgePosted = texts.some((text) => hedgeNorm.has(norm(text)));
    const row = {
      id: item.id,
      bucket: item.bucket,
      path: item.path,
      expect: item.expect,
      lang: item.lang,
      rule: item.rule,
      falseHoldPool: !!item.falseHoldPool,
      homonym: !!item.homonym,
      byteGate: item.expect === 'bytes' && (item.bucket === 'faq' || item.bucket === 'forward' || (item.bucket === 'status' && item.rule === 'status')),
      leak: !!item.leak,
      comments: comments.length,
      exactHtml,
      textMatch,
      hedgePosted,
      containsNeedle,
      error,
      sample: texts[0] ? texts[0].slice(0, 240) : '',
      log: logs.filter((line) => /SKIP|PAYOUT|FALLBACK|RETRY|duplicate|POSTGATE|WEBHOOK_ERR|fin-wait|ESCALAT|EMPTY|presend|AUTH_NOTE|FAQ_RETRIEVE/i.test(line)).slice(-6),
    };
    results.push(row);
    if (results.length % 100 === 0) origLog('progress', results.length, '/', cases.length);
  }
  console.log = origLog;

  const suites = [];
  const laneNames = process.env.R23_SKIP_SUITES === '1' ? [] : ['t800-payout-r13', 't800-payout-r14', 't800-payout-r15', 't800-payout-r16', 't800-payout-r17', 't800-payout-r18', 't800-payout-r19', 't800-payout-r20', 't800-payout-r21', 't800-payout-r22'];
  for (const laneName of laneNames) {
    const file = path.join(TREE, 'luna-current/10_synthetic_lanes', laneName, 'payoutClaimGuard.test.js');
    try {
      execFileSync(process.execPath, [file], { stdio: 'pipe', timeout: 180000 });
      suites.push({ lane: laneName, pass: true });
      console.log('suite pass', laneName);
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString().slice(-800) : '';
      const stdout = err.stdout ? err.stdout.toString().slice(-800) : '';
      suites.push({ lane: laneName, pass: false, error: (err.message || '').slice(0, 300), stderr, stdout });
      console.log('suite FAIL', laneName);
    }
  }

  const summary = summarize(results, { sealDigest, freezeOk, suites, tripwire, hedges: hedges.length, cases: cases.length });
  fs.writeFileSync(OUT, JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

function summarize(results, meta) {
  const count = (pred) => results.filter(pred).length;
  const examples = (pred, n) => results.filter(pred).slice(0, n).map((row) => ({
    id: row.id,
    path: row.path,
    lang: row.lang,
    rule: row.rule,
    bucket: row.bucket,
    sample: row.sample,
    error: row.error,
    log: row.log,
    comments: row.comments,
    hedgePosted: row.hedgePosted,
    containsNeedle: row.containsNeedle,
    exactHtml: row.exactHtml,
    textMatch: row.textMatch,
  }));

  const critical = (row) => {
    if (row.expect === 'hedge' || row.expect === 'missing_hedge' || row.leak) {
      return row.containsNeedle || (row.textMatch && row.expect !== 'bytes');
    }
    if (row.expect === 'suppress') return row.containsNeedle;
    return false;
  };
  const silent = (row) => {
    if (row.expect === 'suppress' || row.expect === 'record') return false;
    return row.comments === 0;
  };
  const byteReg = (row) => row.byteGate && !(row.exactHtml || row.textMatch);
  const falseHold = (row) => row.falseHoldPool && row.comments > 0 && !row.textMatch && !row.exactHtml;
  const leak = (row) => row.leak && (row.containsNeedle || (!row.hedgePosted && row.comments > 0 && !row.expect));
  const leakFail = (row) => row.leak && row.containsNeedle;
  const lockFail = (row) => row.expect === 'lock' && !(row.textMatch || row.exactHtml);
  const deferBypass = (row) => row.expect === 'suppress' && row.comments > 0;
  const missingFail = (row) => row.expect === 'missing_hedge' && !(row.hedgePosted && !row.containsNeedle);

  const postedKind = (row) => {
    if (!row.comments) return 'none';
    if (row.hedgePosted) return 'hedge';
    if (row.exactHtml || row.textMatch) return 'exact';
    if (/forwarded this to a teammate|sent this to a teammate|ساتھی کے پاس|teammate ke paas|साथी के पास|زميل للمراجعة/i.test(row.sample || '')) return 'forward';
    return 'other';
  };
  const byPath = {};
  for (const row of results) {
    const key = row.path || 'unknown';
    if (!byPath[key]) byPath[key] = { cases: 0, comments: 0, hedge: 0, exact: 0, forward: 0, other: 0, none: 0, critical: 0, silent: 0 };
    const slot = byPath[key];
    slot.cases += 1;
    if (row.comments) slot.comments += 1;
    slot[postedKind(row)] += 1;
    if (critical(row)) slot.critical += 1;
    if (silent(row)) slot.silent += 1;
  }

  const pool = results.filter((row) => row.falseHoldPool);
  const hom = pool.filter((row) => row.homonym);
  const held = pool.filter(falseHold);
  const homHeld = hom.filter(falseHold);
  const rate = (num, den) => (den ? num / den : 0);

  return {
    sealSha256: meta.sealDigest,
    cases: results.length,
    freezeOk: meta.freezeOk,
    tripwireHits: meta.tripwire,
    suites: meta.suites,
    critical: count(critical),
    silentDrops: count(silent),
    byteRegressions: count(byteReg),
    falseHolds: held.length,
    falseHoldPool: pool.length,
    falseHoldRate: rate(held.length, pool.length),
    homonymPool: hom.length,
    homonymHolds: homHeld.length,
    homonymHoldRate: rate(homHeld.length, hom.length),
    instructionLeaks: count(leakFail),
    ownerLocks: count((row) => row.expect === 'lock'),
    ownerLocksDelivered: count((row) => row.expect === 'lock' && (row.textMatch || row.exactHtml)),
    ownerLockFailures: count(lockFail),
    deferCases: count((row) => row.expect === 'suppress'),
    deferBypasses: count(deferBypass),
    missingCases: count((row) => row.expect === 'missing_hedge'),
    missingFailures: count(missingFail),
    hedgePostedOnClaims: count((row) => row.expect === 'hedge' && row.hedgePosted),
    claimCases: count((row) => row.expect === 'hedge'),
    errors: count((row) => row.error && !/PAYOUT_GUARD_MISSING_VERDICT/.test(row.error)),
    byPath,
    examples: {
      critical: examples(critical, 8),
      silent: examples(silent, 8),
      byte: examples(byteReg, 6),
      falseHold: examples(falseHold, 8),
      homonymHold: examples((row) => row.homonym && falseHold(row), 6),
      leak: examples(leakFail, 4),
      lock: examples(lockFail, 4),
      defer: examples(deferBypass, 4),
      missing: examples(missingFail, 4),
    },
  };
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
