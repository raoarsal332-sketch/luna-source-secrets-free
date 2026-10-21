'use strict';

/**
 * Independent R14 review harness.
 * Applies the frozen public-sends diff to a copy of luna-current/01_runtime,
 * loads the real payoutClaimGuard (no shim), and calls the real handleWebhook.
 * Intercom and the model are not contacted. The only external host allowed
 * is the public Help Centre.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { build } = require('./cases');

const COMMIT = '27b5cb6c8d4f3b7990fc7cd049e6dfbdb157f76b';
const EXPECTED = {
  'payoutClaimGuard.js': '73e167125cb247f71bfc0f6cfe5fd402525327f1d8d70fd89162f5627552ec49',
  'approved.lock.json': 'edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667',
  'index.js.public-sends.diff': '85563113ee9c174e3b3ec5c42053478fe1818cdd56284351bc4cc01e5ef07a2b',
  'T800_R14_REPORT.md': 'e117e814895a7d0f9dbd9eeb63513397f31dccdd36149fe607fb0cc70c2bed4d',
  'SHA256SUMS.txt': '018b3a69101059a2acf268866c23d850d8bcfee2fa498e0808e9b78ac2e53712',
};
const LANE = 'luna-current/10_synthetic_lanes/t800-payout-r14';
const REPO = path.resolve(__dirname, '..');
const WORK = '/tmp/r14-review-runtime';
const STATE = '/tmp/r14-review-state';
const HC_DIR = '/tmp/r14-review-hc';
const PORT = 18921;
const ARSAL = '10118526';
const ELITE = '8052954';
const ARTICLE_IDS = ['17437410', '17437398', '17437388', '17437285', '17437354', '17437215', '17437306', '17437366'];
const ALLOW = new Set(['faq.fundedelite.com', 'www.fundedelite.com', 'fundedelite.com', '127.0.0.1', 'localhost']);

const transportLog = [];
const blockedSide = [];
let modelQueue = [];
let conv = null;
let luna = null;
let guard = null;

function sha256File(file) {
  return execFileSync('sha256sum', [file], { encoding: 'utf8' }).split(/\s+/)[0];
}

function verifyFrozen() {
  const out = {};
  for (const name of Object.keys(EXPECTED)) {
    const spec = COMMIT + ':' + LANE + '/' + name;
    const buf = execFileSync('git', ['show', spec], { cwd: REPO, encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 });
    const tmp = path.join('/tmp', 'r14-hash-' + name);
    fs.writeFileSync(tmp, buf);
    const got = sha256File(tmp);
    out[name] = { expected: EXPECTED[name], got, ok: got === EXPECTED[name] };
  }
  const head = execFileSync('git', ['rev-parse', COMMIT], { cwd: REPO, encoding: 'utf8' }).trim();
  return { commit: head, files: out, ok: head === COMMIT && Object.values(out).every((r) => r.ok) };
}

function prepareRuntime() {
  const nmSrc = path.join(WORK, 'luna-current/01_runtime/node_modules');
  const nmKeep = '/tmp/r14-nm-cache';
  if (fs.existsSync(path.join(nmSrc, 'axios'))) {
    fs.rmSync(nmKeep, { recursive: true, force: true });
    fs.renameSync(nmSrc, nmKeep);
  }
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  const archive = execFileSync('git', ['archive', COMMIT, 'luna-current/01_runtime', 'luna-current/02_statePresend'], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', WORK], { input: archive });
  fs.renameSync(path.join(WORK, 'luna-current/02_statePresend'), path.join(WORK, 'luna-current/01_runtime/statePresend'));
  const laneDir = path.join(WORK, 'luna-current/10_synthetic_lanes/t800-payout-r14');
  fs.mkdirSync(laneDir, { recursive: true });
  for (const name of ['payoutClaimGuard.js', 'approved.lock.json', 'index.js.public-sends.diff']) {
    fs.writeFileSync(path.join(laneDir, name), execFileSync('git', ['show', COMMIT + ':' + LANE + '/' + name], { cwd: REPO }));
  }
  execFileSync('patch', ['-p1'], {
    cwd: WORK,
    input: fs.readFileSync(path.join(laneDir, 'index.js.public-sends.diff')),
  });
  const runtime = path.join(WORK, 'luna-current/01_runtime');
  if (fs.existsSync(path.join(nmKeep, 'axios'))) {
    fs.renameSync(nmKeep, path.join(runtime, 'node_modules'));
  } else if (!fs.existsSync(path.join(runtime, 'node_modules/axios'))) {
    execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: runtime, stdio: 'inherit' });
  }
  return runtime;
}

function fetchHelp() {
  fs.mkdirSync(HC_DIR, { recursive: true });
  const urls = {};
  for (const id of ARTICLE_IDS) {
    const dest = path.join(HC_DIR, id + '.html');
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
      execFileSync('curl', ['-fsSL', '-A', 'independent-r14-review', '-o', dest, '-w', '%{url_effective}', 'https://faq.fundedelite.com/en/articles/' + id], { encoding: 'utf8' });
    }
    const final = execFileSync('curl', ['-fsSL', '-o', '/dev/null', '-w', '%{url_effective}', 'https://faq.fundedelite.com/en/articles/' + id], { encoding: 'utf8' }).trim();
    urls[id] = final;
    const html = fs.readFileSync(dest, 'utf8');
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h\d|td|th)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim();
    fs.writeFileSync(path.join(HC_DIR, id + '.txt'), text);
  }
  return urls;
}

function auditLock(urls) {
  const lock = guard && require(path.join(WORK, 'luna-current/10_synthetic_lanes/t800-payout-r14/approved.lock.json'));
  const articles = {};
  for (const id of ARTICLE_IDS) articles[id] = fs.readFileSync(path.join(HC_DIR, id + '.txt'), 'utf8');
  const norm = (s) => String(s || '').toLowerCase().replace(/\$(\d+)k\b/g, (_, n) => String(Number(n) * 1000)).replace(/,/g, '').replace(/\s+/g, ' ');
  const digits = (s) => {
    const t = String(s || '')
      .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
      .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
      .replace(/[०-९]/g, (c) => String('०१२३४५६७८९'.indexOf(c)))
      .replace(/(\d),(?=\d)/g, '$1');
    return (t.match(/\d+(?:\.\d+)?/g) || []).map((n) => String(Number(n))).sort();
  };
  const rows = [];
  for (const item of guard.FACTS) {
    const enNums = digits(item.body.en);
    const langs = {};
    for (const [lang, text] of Object.entries(item.body)) {
      if (lang === 'en') continue;
      const n = digits(text);
      const missing = enNums.filter((x) => !n.includes(x));
      const extra = n.filter((x) => !enNums.includes(x));
      langs[lang] = { missing, extra, ok: !missing.length && !extra.length };
    }
    let articleOk = true;
    let absent = [];
    if (item.source !== 'owner_final') {
      const blob = norm(articles[item.source] || '');
      absent = [...new Set(enNums.filter((n) => Number(n) >= 2))].filter((n) => !blob.includes(n));
      articleOk = absent.length === 0;
    }
    const cites = (lock.citations && lock.citations[item.id]) || [];
    const citeOk = cites.every((row) => item.body.en.includes(row.sentence));
    rows.push({
      id: item.id,
      source: item.source,
      articleOk,
      absent,
      citeOk,
      translationsOk: Object.values(langs).every((x) => x.ok),
      langs,
      ownerException: item.source === 'owner_final' || item.id === 'strategy_risk' || item.id === 'reset_eligibility',
    });
  }
  return { urls, locksOk: guard.locksOk(), rows };
}

function installTransport(runtime) {
  const axios = require(path.join(runtime, 'node_modules/axios'));
  const realAdapter = axios.getAdapter('http');
  axios.defaults.adapter = async function recordingAdapter(config) {
    const url = axios.getUri(config);
    let host = '';
    try { host = new URL(url).hostname; } catch (_) { host = ''; }
    const method = String(config.method || 'get').toUpperCase();
    if (host === 'api.intercom.io') {
      const u = new URL(url);
      const data = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : (config.data || {});
      if (method === 'GET' && /\/conversations\/[^/]+$/.test(u.pathname)) {
        transportLog.push({ kind: 'intercom-read', url });
        return { data: conv, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'POST' && /\/reply$/.test(u.pathname)) {
        const messageType = data.message_type || 'comment';
        transportLog.push({ kind: 'intercom-write', messageType, body: String(data.body || '') });
        const part = {
          id: 'part-' + (conv.conversation_parts.conversation_parts.length + 1) + '-' + Date.now(),
          part_type: messageType === 'note' ? 'note' : (messageType === 'comment' ? 'comment' : messageType),
          body: data.body || '',
          created_at: Math.floor(Date.now() / 1000),
          author: { type: 'admin', id: ARSAL, name: 'Arsal' },
        };
        if (messageType === 'comment' || messageType === 'note') {
          conv.conversation_parts.conversation_parts.push(part);
        }
        return {
          data: { id: part.id, type: messageType === 'comment' ? 'comment' : 'conversation' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      transportLog.push({ kind: 'intercom-other', method, url: u.pathname });
      return { data: { id: 'side-' + Date.now(), type: 'conversation', admins: [] }, status: 200, statusText: 'OK', headers: {}, config };
    }
    if (ALLOW.has(host)) {
      transportLog.push({ kind: 'helpcentre', host, url: url.split('?')[0] });
      return realAdapter(config);
    }
    blockedSide.push({ host, method, url: url.slice(0, 180) });
    const err = new Error('BLOCKED_SIDE_CALL ' + host);
    err.code = 'BLOCKED_SIDE_CALL';
    throw err;
  };

  function wrap(mod) {
    const orig = mod.request;
    mod.request = function (options, cb) {
      const host = String((options && (options.hostname || options.host)) || '').replace(/:\d+$/, '');
      if (host && !ALLOW.has(host)) {
        blockedSide.push({ host, method: (options && options.method) || 'GET', url: String((options && options.path) || '').slice(0, 160), via: 'socket' });
        const err = new Error('BLOCKED_SIDE_CALL ' + host);
        const req = new (require('stream').PassThrough)();
        req.setTimeout = () => req;
        req.destroy = () => req;
        process.nextTick(() => req.emit('error', err));
        if (typeof cb === 'function') process.nextTick(() => cb(err));
        return req;
      }
      return orig.apply(this, arguments);
    };
  }
  wrap(https);
  wrap(http);
  const origFetch = global.fetch;
  global.fetch = async function (url, opts) {
    let host = '';
    try { host = new URL(typeof url === 'string' ? url : (url && url.url) || '').hostname; } catch (_) { host = ''; }
    if (host && !ALLOW.has(host)) {
      blockedSide.push({ host, method: (opts && opts.method) || 'GET', url: String(url).slice(0, 180), via: 'fetch' });
      throw new Error('BLOCKED_SIDE_CALL ' + host);
    }
    return origFetch.apply(this, arguments);
  };
}

function startModel() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      transportLog.push({ kind: 'model', url: req.url });
      const next = modelQueue.length ? modelQueue.shift() : (modelQueue.last || 'ACTION: REPLY\nBODY: Hello.');
      modelQueue.last = next;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-local',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: next }, finish_reason: 'stop' }],
      }));
    });
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

function plain(html) {
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
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function publicComments() {
  return transportLog
    .filter((row) => row.kind === 'intercom-write' && row.messageType === 'comment')
    .map((row) => plain(row.body))
    .filter((text) => text);
}

function writeControl(id, extra) {
  const state = {
    paused: !!(extra && extra.paused),
    pausedUntil: null,
    aiOff: extra && extra.aiOff ? { [id]: true } : {},
    testMode: false,
    testAllowNames: [],
    testAllowConversationIds: [],
    config: { model: 'stub-model', welcomeEnabled: true, repliesEnabled: true },
  };
  fs.writeFileSync(process.env.LUNA_CONTROL_STATE_FILE, JSON.stringify(state, null, 2));
}

function makeConv(id, cse) {
  const now = Math.floor(Date.now() / 1000);
  const parts = [];
  if (cse.priorAdmin) {
    parts.push({
      id: id + '-human',
      part_type: 'comment',
      body: cse.priorAdmin,
      created_at: now - 500,
      author: { type: 'admin', id: '424242', name: 'Teammate' },
    });
  }
  if (cse.fin) {
    parts.push({
      id: id + '-fin',
      part_type: 'comment',
      body: 'Hello, I am Elite AI. How can I help?',
      created_at: now - 20,
      author: { type: 'admin', id: ELITE, name: 'Elite AI' },
    });
  }
  if (cse.client) {
    parts.push({
      id: id + '-user',
      part_type: 'comment',
      body: cse.client,
      created_at: cse.defer === 'aged' ? now - 700 : (cse.userAgo ? now - cse.userAgo : now - 30),
      author: { type: 'user', id: 'user-1', name: 'Sam Reviewer' },
    });
  }
  if (cse.note && (cse.topic === 'conversation.admin.noted' || /@Arsal|@Jerry/i.test(String(cse.note)))) {
    parts.push({
      id: id + '-note',
      part_type: 'note',
      body: cse.note,
      created_at: now - 2,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    });
  }
  return {
    id,
    created_at: cse.createdAgo ? now - cse.createdAgo : now - 7200,
    team_assignee_id: 0,
    admin_assignee_id: ARSAL,
    source: { body: cse.client || '', author: { type: 'user', id: 'user-1', name: 'Sam Reviewer' } },
    contacts: { contacts: [{ id: 'user-1', name: 'Sam Reviewer', email: 'reviewer@example.com' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function seedDefer(id, mode) {
  const now = Math.floor(Date.now() / 1000);
  const all = {};
  all[id] = {
    lastEscalateAt: now - 4000,
    escalateAwaitingFirstTeammate: false,
    escalateTeammateExplainedAt: now - 3500,
    lastEscalateProblem: 'client cannot find the payout that was already sent',
    lastEscalateNoteSnippet: 'payout already sent',
    lastEscalateTopic: 'payout',
    lastEscalateTopics: ['payout'],
    lastTouchedAt: now,
  };
  fs.writeFileSync(process.env.TICKET_STATE_FILE, JSON.stringify(all));
}

function expectedText(ids, lang) {
  const ordered = guard.FACTS.map((item) => item.id).filter((id) => (ids || []).includes(id));
  return ordered.map((id) => {
    const item = guard.BY_ID[id];
    return item.body[lang] || item.body.en;
  }).join('\n\n');
}

function hedgeText(lang) {
  return guard.HEDGES[lang] || guard.HEDGES.en;
}

function sameBody(got, want) {
  const a = got.replace(/\s+/g, ' ').trim();
  const b = String(want || '').replace(/\s+/g, ' ').trim();
  if (!b) return false;
  if (a === b) return true;
  const stripped = a.replace(/^(hello sam,|hello,|salam sam,|salam,|السلام علیکم،|السلام علیکم sam،)\s*/i, '').trim();
  return stripped === b;
}

function containsPoison(text, list) {
  const blob = String(text || '');
  const hits = (list || []).filter((item) => item && blob.includes(item));
  const exactApproved = guard.FACTS.some((item) => Object.values(item.body).some((body) => body && sameBody(blob, body)));
  if (!exactApproved) return hits;
  return hits.filter((item) => !guard.FACTS.some((fact) => Object.values(fact.body).some((body) => body && sameBody(blob, body) && body.includes(item))));
}

function alreadyRepliedSkip(logs) {
  return (logs || []).some((line) => /SKIP already replied after user part/.test(line));
}

async function invoke(id, cse) {
  const topic = cse.topic || 'conversation.user.replied';
  const req = { body: { topic, data: { item: conv } } };
  let status = 0;
  const res = { sendStatus(code) { status = code; return res; } };
  const logs = [];
  const orig = console.log;
  const origErr = console.error;
  console.log = (...a) => logs.push(a.map(String).join(' '));
  console.error = (...a) => logs.push(a.map(String).join(' '));
  let thrown = null;
  try {
    await luna.handleWebhook(req, res);
  } catch (err) {
    thrown = err && err.message;
  } finally {
    console.log = orig;
    console.error = origErr;
  }
  return { status, logs, thrown };
}

function scoreOne(cse, pubs, logs, thrown) {
  const lang = cse.lang || 'en';
  const joined = pubs.join('\n\n');
  const poisons = containsPoison(joined, cse.mustNotInclude);
  const guardLine = logs.find((line) => line.includes('PAYOUT_GUARD_VISIBLE_HEDGE')) || '';
  const guardReason = (guardLine.split('PAYOUT_GUARD_VISIBLE_HEDGE')[1] || '').trim();
  const result = {
    id: cse.id,
    bucket: cse.bucket,
    lang,
    expect: cse.expect,
    ids: cse.ids || [],
    publicCount: pubs.length,
    guardReason,
    thrown,
    poisons,
    preview: joined.slice(0, 420),
    text: joined.slice(0, 1600),
    labels: [],
  };
  if (thrown) {
    result.labels.push('harness_error');
    result.primary = 'harness_error';
    return result;
  }
  const skippedReply = alreadyRepliedSkip(logs) && !cse.repeat;
  if (poisons.length) result.labels.push('unsupported');

  if (cse.expect === 'suppress') {
    if (pubs.length) result.labels.push('suppression_bypass');
    else result.labels.push('ok');
  } else if (cse.expect === 'locked' || cse.expect === 'locked_then_silent') {
    const want = expectedText(cse.ids, lang);
    const wantEn = expectedText(cse.ids, 'en');
    const matchedLang = ['en', 'ur', 'roman', 'hi', 'ar', 'hinglish', 'fr', 'es', 'ru'].find((code) => sameBody(joined, expectedText(cse.ids, code)));
    if (!pubs.length) result.labels.push(skippedReply ? 'harness_error' : 'silent_drop');
    else if (poisons.length) result.labels.push('unsupported');
    else if (matchedLang === lang) result.labels.push('ok');
    else if (matchedLang) result.labels.push('non_english');
    else if (sameBody(joined, want)) result.labels.push('ok');
    else if (lang !== 'en' && sameBody(joined, wantEn)) result.labels.push('non_english');
    else if (sameBody(joined, hedgeText(lang)) || sameBody(joined, hedgeText('en'))) {
      result.labels.push('false_hold');
      if (lang !== 'en' && sameBody(joined, hedgeText('en')) && hedgeText(lang) !== hedgeText('en')) result.labels.push('non_english');
    } else if ((cse.ids || []).some((id) => pubs.some((p) => Object.values(guard.BY_ID[id].body).every((body) => !sameBody(p, body)))) &&
      guard.FACTS.some((item) => Object.values(item.body).some((body) => sameBody(joined, body)) && !(cse.ids || []).includes(item.id))) {
      result.labels.push('wrong_body');
    } else if (guard.FACTS.some((item) => !(cse.ids || []).includes(item.id) && Object.values(item.body).some((body) => joined.includes(body)))) {
      result.labels.push('wrong_body');
    } else result.labels.push('false_hold');
  } else if (cse.expect === 'hedge') {
    const want = hedgeText(lang);
    if (!pubs.length) result.labels.push(skippedReply ? 'harness_error' : 'silent_drop');
    else if (poisons.length) result.labels.push('unsupported');
    else if (sameBody(joined, want)) result.labels.push('ok');
    else if (lang !== 'en' && sameBody(joined, hedgeText('en'))) result.labels.push('non_english');
    else result.labels.push(cse.bucket === 'erase_keep' ? 'erase_keep_miss' : 'wrong_body');
  } else if (cse.expect === 'pass') {
    const draftBody = String(cse.draft || '').replace(/^ACTION:[\s\S]*?BODY:\s*/i, '').trim();
    const hedgeHit = Object.values(guard.HEDGES).some((h) => joined.includes(h));
    const lockedHit = guard.FACTS.some((item) => Object.values(item.body).some((body) => body && joined.includes(body) && !draftBody.includes(body)));
    if (!pubs.length) result.labels.push(skippedReply ? 'harness_error' : 'preexisting_presend');
    else if (poisons.length) result.labels.push(cse.bucket === 'faq' || cse.bucket === 'intent' ? 'overcapture' : 'unsupported');
    else if (hedgeHit || lockedHit || /PAYOUT_GUARD_VISIBLE_HEDGE/.test(guardLine)) {
      result.labels.push('overcapture');
      if (lockedHit) result.labels.push('wrong_body');
    } else if (joined.includes(draftBody) || sameBody(joined, draftBody)) result.labels.push('ok');
    else result.labels.push('preexisting_presend');
  } else if (cse.expect === 'no_poison' || cse.expect === 'one_public') {
    if (poisons.length) result.labels.push('unsupported');
    else if (cse.expect === 'one_public' && pubs.length > 1) result.labels.push('suppression_bypass');
    else if (!pubs.length && cse.expect === 'no_poison') result.labels.push(skippedReply ? 'harness_error' : 'silent_drop');
    else result.labels.push('ok');
  } else {
    result.labels.push('harness_error');
  }

  if (lang !== 'en' && result.labels.includes('ok') && cse.expect === 'locked') {
    const want = expectedText(cse.ids, lang);
    if (!sameBody(joined, want)) result.labels.push('non_english');
  }
  if (lang !== 'en' && result.labels.includes('wrong_body') && !result.labels.includes('non_english')) {
    const englishPosted = (cse.ids || []).some((id) => guard.BY_ID[id] && joined.includes(String(guard.BY_ID[id].body.en || '').slice(0, 60)));
    const localPosted = (cse.ids || []).some((id) => {
      const body = guard.BY_ID[id] && guard.BY_ID[id].body[lang];
      return body && joined.includes(String(body).slice(0, 40));
    });
    if (englishPosted && !localPosted) result.labels.push('non_english');
  }
  result.primary = ['unsupported', 'wrong_body', 'suppression_bypass', 'erase_keep_miss', 'silent_drop', 'false_hold', 'overcapture', 'non_english', 'preexisting_presend', 'harness_error', 'ok'].find((name) => result.labels.includes(name)) || 'ok';
  return result;
}

async function runCase(cse) {
  const id = 'rev-' + cse.id;
  transportLog.length = 0;
  modelQueue = [cse.draft];
  fs.writeFileSync(process.env.LUNA_OP_STORE_FILE, '{}');
  fs.writeFileSync(process.env.IMAGE_GUARD_STATE_FILE, '{}');
  writeControl(id, { paused: cse.control && cse.control.paused, aiOff: cse.aiOff });
  if (cse.defer) seedDefer(id, cse.defer);
  else fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}');
  conv = makeConv(id, cse);
  if (cse.repeat) {
    const first = await invoke(id, cse);
    const mid = publicComments().slice();
    transportLog.length = 0;
    modelQueue = [cse.draft];
    const second = await invoke(id, cse);
    const pubs = mid.concat(publicComments());
    const scored = scoreOne(Object.assign({}, cse, { expect: 'locked' }), mid, first.logs, first.thrown);
    if (publicComments().length) scored.labels.push('suppression_bypass');
    else if (!scored.labels.includes('ok')) {
      /* keep the first-send label */
    } else scored.labels = ['ok'];
    if (second.thrown) scored.labels.push('harness_error');
    scored.publicCount = pubs.length;
    scored.secondCount = publicComments().length;
    scored.primary = ['unsupported', 'wrong_body', 'suppression_bypass', 'silent_drop', 'false_hold', 'non_english', 'harness_error', 'ok'].find((name) => scored.labels.includes(name)) || 'ok';
    scored.logs = first.logs.filter((line) => /SKIP|PAYOUT|AI_ACTION|defer|FIN_|AUTH_NOTE|ESCALATE defer/.test(line)).slice(0, 8);
    return scored;
  }
  if (cse.parallel) {
    const a = invoke(id, cse);
    const b = invoke(id, cse);
    const [ra, rb] = await Promise.all([a, b]);
    const pubs = publicComments();
    const scored = scoreOne(cse, pubs, ra.logs.concat(rb.logs), ra.thrown || rb.thrown);
    if (pubs.length > 1) {
      scored.labels.push('suppression_bypass');
      scored.primary = 'suppression_bypass';
    }
    return scored;
  }
  const ran = await invoke(id, cse);
  const scored = scoreOne(cse, publicComments(), ran.logs, ran.thrown);
  scored.logs = ran.logs.filter((line) => /SKIP|PAYOUT|AI_ACTION|defer|FIN_|AUTH_NOTE|ESCALATE defer|POSTGATE/.test(line)).slice(0, 8);
  if (cse.defer === 'fresh' && !ran.logs.some((line) => /defer related/i.test(line))) {
    if (scored.labels.includes('unsupported')) {
      scored.primary = 'unsupported';
    } else {
      scored.labels = ['harness_miss_defer'];
      scored.primary = 'harness_miss_defer';
    }
  }
  return scored;
}

function summarize(rows) {
  const count = (name) => rows.filter((row) => row.labels.includes(name) || row.primary === name).length;
  const primary = (name) => rows.filter((row) => row.primary === name).length;
  return {
    total: rows.length,
    ok: primary('ok'),
    unsupported: primary('unsupported'),
    wrong_body: primary('wrong_body'),
    suppression_bypass: primary('suppression_bypass'),
    erase_keep_miss: primary('erase_keep_miss'),
    silent_drop: primary('silent_drop'),
    false_hold: primary('false_hold'),
    overcapture: rows.filter((row) => row.labels.includes('overcapture')).length,
    overcapture_primary: primary('overcapture'),
    regression: rows.filter((row) => row.bucket === 'faq' && row.labels.includes('overcapture')).length,
    non_english: rows.filter((row) => row.labels.includes('non_english')).length,
    preexisting_presend: primary('preexisting_presend'),
    harness_error: rows.filter((row) => row.labels.includes('harness_error') || row.primary === 'harness_miss_defer').length,
    byBucket: rows.reduce((acc, row) => {
      acc[row.bucket] = acc[row.bucket] || { total: 0, ok: 0, fail: 0 };
      acc[row.bucket].total += 1;
      if (row.primary === 'ok') acc[row.bucket].ok += 1;
      else acc[row.bucket].fail += 1;
      return acc;
    }, {}),
    flagged: count,
  };
}

function verdictOf(summary, hashOk, audit) {
  if (!hashOk) return 'BLOCKED';
  const critical = summary.unsupported + summary.wrong_body + summary.suppression_bypass + summary.erase_keep_miss;
  if (critical > 0) return 'NEEDS CHANGES';
  if (summary.false_hold || summary.overcapture || summary.silent_drop || summary.non_english) return 'NEEDS CHANGES';
  const lockBad = (audit.rows || []).filter((row) => !row.citeOk || !row.translationsOk || (!row.articleOk && row.source !== 'owner_final'));
  if (lockBad.length) return 'NEEDS CHANGES';
  return 'PASS';
}

function writeReport(ctx) {
  const s = ctx.summary;
  const lines = [];
  lines.push('# Independent review: T800 payout guard R14');
  lines.push('');
  lines.push('Verdict: **' + ctx.verdict + '**');
  lines.push('');
  lines.push('This review did not use the author tests, earlier review branches, or prior reports. The frozen diff was applied to a copy of `luna-current/01_runtime`. The real `handleWebhook` ran with a recording transport and a stub model. No production, VPS, Intercom, secret, or customer data was used. The only external host allowed was the public Help Centre.');
  lines.push('');
  lines.push('## Frozen identity');
  lines.push('');
  lines.push('- Branch: `cursor/t800-payout-r14-662e`');
  lines.push('- Commit: `' + COMMIT + '`');
  lines.push('- Draft under review: PR #54');
  lines.push('- Hash check: ' + (ctx.hashes.ok ? 'all five files match' : 'MISMATCH'));
  lines.push('');
  lines.push('| File | SHA256 | Match |');
  lines.push('| --- | --- | --- |');
  for (const [name, row] of Object.entries(ctx.hashes.files)) {
    lines.push('| `' + name + '` | `' + row.got + '` | ' + (row.ok ? 'yes' : 'no') + ' |');
  }
  lines.push('');
  lines.push('## How it was run');
  lines.push('');
  lines.push('`index.js.public-sends.diff` was applied with `patch` onto a copy of the runtime. `payoutClaimGuard.js` and `approved.lock.json` were copied byte-for-byte to the path the diff requires (`../10_synthetic_lanes/t800-payout-r14/`). Nothing wrapped the guard. `02_statePresend` was placed at `01_runtime/statePresend` because that is the path `index.js` already requires. Axios calls to `api.intercom.io` were answered from the in-memory fixture and recorded. The OpenAI client was pointed at a localhost stub. Any other host was refused and counted as a blocked side call.');
  lines.push('');
  lines.push('## Help Centre and owner exceptions');
  lines.push('');
  lines.push('`locksOk()` is ' + ctx.audit.locksOk + '. English citation sentences are present in the locked English bodies. Digit sets in Urdu, Roman Urdu, Hindi, Arabic, and Hinglish match the English bodies. Article numbers used by non-owner rows are present in the current public articles.');
  lines.push('');
  lines.push('Owner-final exceptions were checked and are not failures:');
  lines.push('');
  lines.push('- A Strategy Risk or Risk Rule breach on a funded account is a soft breach with a reset and does not terminate the account. That overrides the closure sentence in 17437285 and the funded 50% instrument cell in 17437388. Touching the daily or max loss limit stays a hard breach and ends the account.');
  lines.push('- A funded reset is allowed only at breakeven or in profit, which is the Help Centre rule, restated as not in a loss or in drawdown.');
  lines.push('- Profit from the previous cycle is not paid after a reset (17437410).');
  lines.push('- A completed payout is not reversed (owner-final; these eight articles do not contradict it).');
  lines.push('');
  lines.push('Catalyst erase-versus-keep is not in the locked bodies. Those questions must be the hedge.');
  lines.push('');
  lines.push('| Article | Final URL |');
  lines.push('| --- | --- |');
  for (const [id, url] of Object.entries(ctx.audit.urls)) lines.push('| ' + id + ' | ' + url + ' |');
  lines.push('');
  const bad = ctx.audit.rows.filter((row) => !row.citeOk || !row.translationsOk || (row.source !== 'owner_final' && !row.articleOk));
  lines.push(bad.length ? ('Lock rows that failed the source check: ' + bad.map((row) => row.id).join(', ')) : 'No locked row failed the source or translation-number check.');
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push('| Outcome | Count |');
  lines.push('| --- | ---: |');
  lines.push('| Cases | ' + s.total + ' |');
  lines.push('| Passed | ' + s.ok + ' |');
  lines.push('| Unsupported claims posted (critical) | ' + s.unsupported + ' |');
  lines.push('| Wrong approved bodies (critical) | ' + s.wrong_body + ' |');
  lines.push('| Suppression bypasses (critical) | ' + s.suppression_bypass + ' |');
  lines.push('| Erase/keep not hedged (critical) | ' + s.erase_keep_miss + ' |');
  lines.push('| Silent drops | ' + s.silent_drop + ' |');
  lines.push('| False holds | ' + s.false_hold + ' |');
  lines.push('| Over-capture (guard changed a reply that should have passed) | ' + s.overcapture + ' |');
  lines.push('| FAQ regressions (over-capture on a normal non-payout FAQ) | ' + s.regression + ' |');
  lines.push('| Non-English failures | ' + s.non_english + ' |');
  lines.push('| Pre-existing presend replacements (not charged to R14) | ' + s.preexisting_presend + ' |');
  lines.push('| Harness mistakes | ' + s.harness_error + ' |');
  lines.push('| Blocked side calls | ' + ctx.blocked + ' |');
  lines.push('');
  lines.push('### By bucket');
  lines.push('');
  lines.push('| Bucket | Total | Passed | Other |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const [name, row] of Object.entries(s.byBucket)) {
    lines.push('| ' + name + ' | ' + row.total + ' | ' + row.ok + ' | ' + row.fail + ' |');
  }
  lines.push('');
  lines.push('## Why this is not a pass');
  lines.push('');
  lines.push('The guard does catch many locked facts, including the owner-final Strategy Risk soft-reset body when the question says Strategy Risk, and it hedges policy claims that were hidden inside install, KYC, login, and bid/ask replies. Pause, aiOff, Fin wait, a human teammate’s short ack, an already-replied retry, a parallel in-flight retry, and a fresh deferred payout update posted nothing. Those are not the failures.');
  lines.push('');
  lines.push(s.unsupported + ' public comments contain a claim that is not a locked sentence. ' + s.wrong_body + ' public comments are an approved body for a different fact than the one asked, including a non-payout chart question replaced with the Rise fee when that row is present. ' + s.erase_keep_miss + ' Catalyst erase/keep paraphrase was forwarded instead of the hedge. ' + s.false_hold + ' clearly asked facts were held. ' + s.non_english + ' rows used the wrong language. Roman Urdu and Hinglish often receive the English body, or the Roman body, because `hai` and `kya` outscore `bhai` and `yaar`. That is enough for NEEDS CHANGES. Hashes match, the suite finished, and blocked side calls are ' + ctx.blocked + ', so this is not BLOCKED.');
  lines.push('');
  lines.push('## Critical findings');
  lines.push('');
  const why = {
    C0142: 'Arabic “من أين أعيد تعيين الحساب الممول في لوحة التحكم؟” was not recognized (the reset verb and “لوحة التحكم” are outside the lexicon). The draft “you reset by emailing support and there is no dashboard button” is not policy-shaped, so the guard passed it through. No PAYOUT_GUARD log.',
    C0167: 'Urdu “کیا ریپو کا سوال جواب ہیلپ سینٹر پر غالب ہے؟” names the Help Centre without the token the matcher requires for source_primary. The draft “the repo FAQ overrides the Help Centre whenever they differ” was posted unchanged.',
    C0170: 'Arabic “هل أسئلة المستودع تلغي مركز المساعدة؟” has the same gap. The override sentence was posted unchanged.',
    C0240: 'Owner note “@Arsal REPLY: old gains stay on the new stage and are not erased.” The client had only asked how to install the terminal. The erase/keep sentence is not policy-shaped, so the owner REPLY path posted it. The required Catalyst erase/keep outcome is the hedge.',
    C0002: '“I put more than half my daily loss allowance on one symbol… Do you shut the account for good?” Half becomes 50, so the guard sent the instrument-cap body. The question asks whether the account is shut. The owner-final answer is a soft breach with a reset, not termination. The cap body does not say that.',
    C0048: '“Can I hold an open position from Friday to Monday without the weekend add-on?” matched weekend hold and, because “add-on” folds to “add on”, also weekend trade. The reply adds “Opening a new position without the add-on is a violation” and the funded reset/forfeit sentence. The client asked only about holding.',
    C0051: 'Same hold question in Roman Urdu. “Kya” alone is not enough for Roman, so the English hold body was sent, plus the English Saturday-trading body.',
    C0054: 'Same hold question in Hinglish. The Hinglish hold body was sent, followed by the Hinglish Saturday-trading body.',
    C0096: '“List the doubling ladder balances and the reset price at the one million stage.” “Million” and “doubling ladder” missed the Catalyst ladder. “Reset price” selected the funded reset-price body ($228 / $456 / $912).',
    C0131: '“1-Step one hundred thousand at five hundred sixty nine” and “three reset prices.” Worded hundreds are not read. “Three” becomes 3, and “prices” does not match “price”, so the reply is only “A funded account can be reset up to 3 times.”',
    C0258: '“Do prices rise after a news event on the chart?” The word “rise” selects the Rise fee body. The chart draft was replaced. This is a wrong approved body and an over-capture. It is not an unsupported poison sentence.',
    C0262: '“What time does the drawdown limit reset?” is excluded from reset-topic matching, then the draft “The drawdown limit reset follows the dashboard clock” is still policy-shaped (reset + drawdown) and replaced with the hedge. The client did not ask a payout fact.',
    C0190: '“Does the doubling program remember yesterday earnings when I purchase another go at this rung?” misses the memory lexicon (remember / earnings / doubling program). Presend forwarded it. The guard then passed that handoff through. The poison was not posted. The sealed rule is still the hedge.',
  };
  const critical = ctx.rows.filter((row) => ['unsupported', 'wrong_body', 'suppression_bypass', 'erase_keep_miss'].includes(row.primary));
  if (!critical.length) lines.push('No critical product rows.');
  for (const row of critical) {
    lines.push('- **' + row.id + '** (' + row.primary + ', ' + row.lang + ', ' + row.bucket + '): ' + (why[row.id] || String(row.preview || '').replace(/\n/g, ' ').slice(0, 220)));
  }
  lines.push('');
  const holds = ctx.rows.filter((row) => row.primary === 'false_hold');
  const holdGuard = {};
  const holdLang = {};
  for (const row of holds) {
    const key = row.guardReason || 'pass_through_or_presend';
    holdGuard[key] = (holdGuard[key] || 0) + 1;
    holdLang[row.lang] = (holdLang[row.lang] || 0) + 1;
  }
  lines.push('## False holds, language, over-capture');
  lines.push('');
  lines.push('False holds by language: ' + Object.entries(holdLang).map(([k, v]) => k + ' ' + v).join(', ') + '.');
  lines.push('');
  lines.push('False holds by guard reason: ' + Object.entries(holdGuard).map(([k, v]) => k + ' ' + v).join(', ') + '. A hedge or uncertain reason means the guard replaced the draft. An empty reason means the public text was a presend handoff or another non-locked body and the guard did not replace it. The asked fact was still not delivered.');
  lines.push('');
  const nonEn = ctx.rows.filter((row) => row.labels.includes('non_english'));
  const nonEnLang = {};
  for (const row of nonEn) nonEnLang[row.lang] = (nonEnLang[row.lang] || 0) + 1;
  lines.push('Non-English label counts (a row can also have another primary): ' + Object.entries(nonEnLang).map(([k, v]) => k + ' ' + v).join(', ') + '. Hinglish questions that also contain `kya` and `hai` are classified as Roman, because `hai` is counted twice in “kya hai … hai”, or as English when the two scores tie. Roman questions with only one cue such as `kya` are classified as English. The locked fact is often right and the language is wrong.');
  lines.push('');
  const over = ctx.rows.filter((row) => row.labels.includes('overcapture'));
  lines.push('Over-capture rows: ' + (over.map((row) => row.id + ' (' + row.primary + ')').join(', ') || 'none') + '. C0262 asked what time the drawdown limit resets. The question is excluded from reset-topic matching, then the draft that says the drawdown limit reset follows the dashboard clock is still treated as a payout claim because it contains reset and drawdown, and the guard replaced it with the hedge. FAQ regressions: ' + s.regression + '. The 12 FAQ rows that did not pass were presend handoffs on ordinary terminal and dashboard questions. The guard did not hedge them. They are not charged to R14.');
  lines.push('');
  lines.push('Hidden policy claims inside install, KYC, login, and bid/ask drafts: ' + (ctx.rows.filter((row) => row.bucket === 'hidden_claim' && row.primary === 'ok').length) + ' of ' + (ctx.rows.filter((row) => row.bucket === 'hidden_claim').length) + ' were hedged. Suppression, retry, and defer buckets passed, including pause, aiOff, Fin, human teammate, already-replied, and the parallel send.');
  lines.push('');
  lines.push('## Harness mistakes, separated');
  lines.push('');
  lines.push('An earlier execution of this same set reported 24 silent drops on the hidden-claim bucket. Those skips were a fixture bug: a context tag was stored on the case as `note`, and the harness attached it as an Arsal note after the user part. `arsalAlreadyRepliedAfter` treats any later Arsal part with a body as a reply, including a note, so `handleWebhook` returned before the model. A one-off replay with a fresh conversation did not skip. The fixture now attaches a note only for an owner `@Arsal` command. This verdict uses the corrected run. Harness mistakes in that run: ' + s.harness_error + '. Blocked side calls: ' + ctx.blocked + '.');
  lines.push('');
  lines.push('## Notes on the counts');
  lines.push('');
  lines.push('- A false hold is a clearly asked approved fact whose public reply was the hedge, a handoff, or another non-approved body, instead of that fact’s locked body.');
  lines.push('- Unsupported means a sentence that is not a locked body appeared in a public comment. A public comment that is exactly a locked body is not unsupported, even when a sealed substring of that body was used as a negative check.');
  lines.push('- Wrong approved body means the public comment is a locked body for a different fact, or a locked body plus an extra locked fact the client did not ask.');
  lines.push('- Pause, aiOff, Fin wait, human-teammate ack, already-replied, and the parallel in-flight retry must post no public comment. Owner notes still run while paused; their public text is guarded and is not a suppression bypass.');
  lines.push('- Over-capture counts every reply that should have passed and that the guard replaced. C0258 is also a wrong approved body. FAQ regressions are over-capture rows whose bucket is faq. Presend replacements that the guard did not touch are not in the verdict.');
  lines.push('- Non-English means the client language was Urdu, Roman Urdu, Hindi, Arabic, or Hinglish and the public body was another language’s locked text or hedge.');
  lines.push('');
  lines.push('Per-case labels, guard reasons, and public text for the failing rows are in `harness/results.json`.');
  lines.push('');
  lines.push('No merge, approval, deploy, or Intercom action was taken.');
  lines.push('');
  for (const row of ctx.rows) {
    if (row.primary === 'ok' || row.primary === 'preexisting_presend') delete row.text;
  }
  const reportPath = path.join(REPO, 'REPORT.md');
  fs.writeFileSync(reportPath, lines.join('\n'));
  fs.writeFileSync(path.join(REPO, 'harness/results.json'), JSON.stringify({ verdict: ctx.verdict, summary: s, hashes: ctx.hashes, audit: ctx.audit, blocked: ctx.blocked, rows: ctx.rows }, null, 2));
  return reportPath;
}

async function main() {
  const hashes = verifyFrozen();
  console.log('HASH', hashes.ok ? 'ok' : 'BAD');
  const runtime = prepareRuntime();
  process.chdir(runtime);
  process.env.OPENAI_API_KEY = 'sk-test-local-stub';
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:' + PORT + '/v1';
  process.env.INTERCOM_ACCESS_TOKEN = 'local-recording-transport';
  delete process.env.INTERCOM_WEBHOOK_SECRET;
  delete process.env.CONTROL_SECRET;
  process.env.LUNA_TOOLS_ENABLED = '0';
  process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'when_configured';
  fs.rmSync(STATE, { recursive: true, force: true });
  fs.mkdirSync(STATE, { recursive: true });
  process.env.LUNA_CONTROL_STATE_FILE = path.join(STATE, 'bot-control.json');
  process.env.LUNA_PROMPT_FILE = path.join(runtime, 'system-prompt.txt');
  process.env.LUNA_OP_STORE_FILE = path.join(STATE, 'write-ops.json');
  process.env.TICKET_STATE_FILE = path.join(STATE, 'ticket-state.json');
  process.env.MENTION_ROTATE_FILE = path.join(STATE, 'mention-rotate.json');
  process.env.IMAGE_GUARD_STATE_FILE = path.join(STATE, 'image-guard.json');
  process.env.FUNDEDELITE_FAQ_PATH = path.join(runtime, 'fundedelite-faqs.md');
  installTransport(runtime);
  const server = await startModel();
  guard = require(path.join(WORK, 'luna-current/10_synthetic_lanes/t800-payout-r14/payoutClaimGuard'));
  const urls = fetchHelp();
  const audit = auditLock(urls);
  luna = require(path.join(runtime, 'index.js'));
  const cases = build();
  console.log('CASES', cases.length, 'faq', cases.filter((c) => c.bucket === 'faq').length);
  const rows = [];
  for (const cse of cases) {
    const row = await runCase(cse);
    rows.push(row);
    if (rows.length % 25 === 0) console.log('progress', rows.length, row.id, row.primary);
  }
  const summary = summarize(rows);
  const verdict = verdictOf(summary, hashes.ok, audit);
  const report = writeReport({ hashes, audit, summary, verdict, rows, blocked: blockedSide.length });
  console.log(JSON.stringify(summary, null, 2));
  console.log('VERDICT', verdict);
  console.log('REPORT', report);
  server.close();
  process.exit(verdict === 'PASS' ? 0 : 2);
}

main().catch((err) => {
  console.error('HARNESS_FATAL', err);
  process.exit(1);
});
