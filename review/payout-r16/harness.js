'use strict';

/**
 * Independent payout R16 harness.
 * Applies nothing at runtime beyond the already patched copy: it calls the real
 * handleWebhook with a recording Intercom transport, a stub model, and a network
 * tripwire. Only https://faq.fundedelite.com/ may be fetched.
 * Owner notes are real note parts. Public Arsal comments are only those the
 * webhook itself posts. No fixture pretends Arsal already answered.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const Module = require('module');

const REVIEW_DIR = __dirname;
const CASES_PATH = path.join(REVIEW_DIR, 'sealed-cases.json');
const SEAL_PATH = path.join(REVIEW_DIR, 'SEAL.txt');
const RUNTIME = process.env.R16_RUNTIME || '/tmp/r16-run/luna-current/01_runtime';
const OUT_DIR = process.env.R16_OUT || REVIEW_DIR;
const LIMIT_SCRIPTS = process.env.R16_LIMIT_SCRIPTS ? Number(process.env.R16_LIMIT_SCRIPTS) : 0;
const REQUIRE_SEAL = process.env.R16_REQUIRE_SEAL !== '0';

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function assertSeal() {
  const hash = sha256File(CASES_PATH);
  if (!REQUIRE_SEAL) return { hash, sealed: false };
  const text = fs.readFileSync(SEAL_PATH, 'utf8');
  const line = text.split('\n').find((row) => row.startsWith('sealed-cases.json '));
  const expected = line && line.split(/\s+/)[1];
  if (!expected || expected !== hash) {
    throw new Error('Seal mismatch. sealed-cases.json was changed after the seal. expected ' + expected + ' got ' + hash);
  }
  return { hash, sealed: true };
}

const seal = assertSeal();
const corpus = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'));

const STATE_DIR = process.env.R16_STATE_DIR || '/tmp/r16-state-' + process.pid;
fs.mkdirSync(STATE_DIR, { recursive: true });
fs.writeFileSync(path.join(STATE_DIR, 'control.json'), JSON.stringify({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Bot test'],
  testAllowConversationIds: [],
  config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
}, null, 2));
fs.writeFileSync(path.join(STATE_DIR, 'tickets.json'), '{}');
fs.writeFileSync(path.join(STATE_DIR, 'mention.json'), '{}');

process.env.LUNA_CONTROL_STATE_FILE = path.join(STATE_DIR, 'control.json');
process.env.LUNA_PROMPT_FILE = path.join(RUNTIME, 'system-prompt.txt');
process.env.TICKET_STATE_FILE = path.join(STATE_DIR, 'tickets.json');
process.env.MENTION_ROTATE_FILE = path.join(STATE_DIR, 'mention.json');
process.env.LUNA_OP_STORE_FILE = path.join(STATE_DIR, 'ops.json');
process.env.FUNDEDELITE_FAQ_PATH = path.join(RUNTIME, 'fundedelite-faqs.md');
process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';
process.env.OPENAI_API_KEY = 'sk-test-not-used';
process.env.INTERCOM_ACCESS_TOKEN = 'test-token';
process.env.LUNA_TOOLS_ENABLED = '1';

const trips = [];
const helpFetches = [];
const publicPosts = [];
const convs = new Map();
let partSeq = 1;
let modelHandler = async () => 'ACTION: REPLY\nBODY: Hello.';

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function realGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'FundedEliteSupportBot/1.0', Accept: 'text/html' },
      timeout: 8000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, data: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function dispatch(config) {
  const url = String(config.url || '');
  const method = String(config.method || 'get').toLowerCase();
  let host = '';
  try { host = new URL(url).host; } catch (_) { host = ''; }
  if (host === 'faq.fundedelite.com') {
    helpFetches.push(url);
    try {
      return await realGet(url).then((r) => ({ status: r.status, data: r.data, headers: {} }));
    } catch (e) {
      const err = new Error('help centre fetch failed: ' + (e && e.message));
      throw err;
    }
  }
  if (host && host !== 'api.intercom.io') {
    trips.push({ method, url });
    const err = new Error('TRIPWIRE ' + url);
    err.code = 'TRIPWIRE';
    throw err;
  }
  if (method === 'get' && /\/admins\/?$/.test(url)) {
    return { status: 200, data: { admins: [{
      id: '555001', name: 'Sam Reviewer', email: 'sam.reviewer@example.net',
      has_inbox_seat: true, away_mode_enabled: false, team_ids: [9629780],
    }] } };
  }
  if (method === 'get' && /\/admins\//.test(url)) {
    return { status: 200, data: { id: '555001', name: 'Sam Reviewer', type: 'admin' } };
  }
  const convMatch = url.match(/\/conversations\/([^/]+)$/);
  if (method === 'get' && convMatch) {
    const conv = convs.get(decodeURIComponent(convMatch[1]));
    if (!conv) return { status: 404, data: { type: 'error.list', errors: [{ code: 'not_found' }] } };
    return { status: 200, data: conv };
  }
  if (method === 'post' && /\/conversations\/[^/]+\/reply$/.test(url)) {
    const id = decodeURIComponent(url.split('/conversations/')[1].split('/reply')[0]);
    const conv = convs.get(id);
    const data = config.data || {};
    const messageType = data.message_type || 'comment';
    const part = {
      id: 'part-' + (partSeq++),
      part_type: messageType === 'comment' ? 'comment' : messageType,
      body: data.body || '',
      author: { id: '10118526', type: 'admin', name: 'Arsal' },
      created_at: Math.floor(Date.now() / 1000),
    };
    if (messageType === 'assignment' && conv) {
      conv.admin_assignee_id = data.assignee_id;
      part.author = { id: '10118526', type: 'admin', name: 'Arsal' };
      part.body = '';
    }
    if (conv && messageType !== 'assignment') conv.conversation_parts.conversation_parts.push(part);
    if (messageType === 'comment') {
      publicPosts.push({ conversationId: id, body: data.body || '', text: stripHtml(data.body || ''), at: Date.now() });
    }
    return { status: 200, data: { id: part.id, type: 'conversation', conversation_parts: conv && conv.conversation_parts } };
  }
  if (method === 'post' && /\/conversations\/search$/.test(url)) {
    return { status: 200, data: { conversations: [], total_count: 0, type: 'conversation.list' } };
  }
  trips.push({ method, url, note: 'unhandled intercom' });
  return { status: 404, data: { type: 'error.list' } };
}

function axiosStub(config) { return dispatch(config || {}); }
axiosStub.get = (url, config) => dispatch(Object.assign({}, config, { method: 'get', url }));
axiosStub.post = (url, data, config) => dispatch(Object.assign({}, config, { method: 'post', url, data }));
axiosStub.create = () => axiosStub;
axiosStub.interceptors = { request: { use() {} }, response: { use() {} } };

class StubOpenAI {
  constructor() {}
  chat = { completions: { create: async (req) => {
    const content = await modelHandler(req);
    return { choices: [{ message: { content, tool_calls: [] } }] };
  } } };
}

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'axios') return axiosStub;
  if (id === 'openai') return StubOpenAI;
  return origRequire.apply(this, arguments);
};

const luna = require(path.join(RUNTIME, 'index.js'));
const payoutGuard = require(path.join(RUNTIME, '../10_synthetic_lanes/t800-payout-r16/payoutClaimGuard.js'));

function makeConv(row) {
  const now = Math.floor(Date.now() / 1000) - 500;
  const conv = {
    type: 'conversation',
    id: row.scriptId,
    created_at: now,
    updated_at: now,
    team_assignee_id: null,
    admin_assignee_id: null,
    state: 'open',
    source: {
      type: 'conversation',
      id: 'src-' + row.scriptId,
      body: 'Hello',
      author: { type: 'user', id: 'user-' + row.scriptId, name: row.clientName, email: row.email },
      created_at: now,
    },
    contacts: { type: 'contact.list', contacts: [{ id: 'user-' + row.scriptId, name: row.clientName, email: row.email }] },
    conversation_parts: { type: 'conversation_part.list', conversation_parts: [] },
  };
  convs.set(row.scriptId, conv);
  return conv;
}

function addUser(conv, text, createdAt) {
  const part = {
    id: 'user-' + (partSeq++),
    part_type: 'comment',
    body: text,
    author: { type: 'user', id: conv.source.author.id, name: conv.source.author.name, email: conv.source.author.email },
    created_at: createdAt || Math.floor(Date.now() / 1000),
  };
  conv.conversation_parts.conversation_parts.push(part);
  conv.source.body = text;
  return part;
}

function addOwnerNote(conv, text) {
  const part = {
    id: 'own-' + (partSeq++),
    part_type: 'note',
    body: text,
    author: { id: '10118526', type: 'admin', name: 'Arsal' },
    created_at: Math.floor(Date.now() / 1000) + 3,
  };
  conv.conversation_parts.conversation_parts.push(part);
  return part;
}

function addTeammate(conv) {
  const at = Math.floor(Date.now() / 1000) + 1;
  const part = {
    id: 'tm-' + (partSeq++),
    part_type: 'comment',
    body: 'We are reviewing the rejected payout on this account and will update you here.',
    author: { id: '555001', type: 'admin', name: 'Sam Reviewer' },
    created_at: at,
  };
  conv.conversation_parts.conversation_parts.push(part);
  return part;
}

async function webhook(conv, topic) {
  const before = publicPosts.length;
  const res = { status: 0, sendStatus(code) { this.status = code; return this; } };
  await luna.handleWebhook({ body: { topic, data: { item: conv } }, get() { return ''; } }, res);
  return publicPosts.slice(before).map((p) => p.text).filter((t) => t);
}

function norm(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function containsNorm(hay, needle) {
  if (!needle) return false;
  return norm(hay).includes(norm(needle));
}

const HEDGES = payoutGuard.HEDGES;
const FORWARDS = payoutGuard.TEAMMATE_FORWARD;
const FACTS = payoutGuard.FACTS;

function hedgeLangs(text) {
  const hit = [];
  for (const [lang, body] of Object.entries(HEDGES)) if (containsNorm(text, body)) hit.push(lang);
  return hit;
}

function forwardLangs(text) {
  const hit = [];
  for (const [lang, body] of Object.entries(FORWARDS)) if (containsNorm(text, body)) hit.push(lang);
  return hit;
}

function factHits(text) {
  const hit = [];
  for (const fact of FACTS) {
    for (const [lang, body] of Object.entries(fact.body)) {
      if (containsNorm(text, body)) hit.push({ id: fact.id, lang });
    }
  }
  return hit;
}

function acceptedLangs(lang) {
  if (lang === 'hinglish') return ['hinglish', 'roman'];
  return [lang];
}

function isEnglishOperational(text) {
  if (/[\u0600-\u06FF\u0900-\u097F]/.test(text)) return false;
  return true;
}

function scoreCase(row, texts, extra) {
  const delivered = texts.slice();
  if (!delivered.length && !row.expectSuppress && extra && extra.replayText) {
    delivered.push(extra.replayText);
    extra.replayed = true;
  }
  const joined = delivered.join('\n');
  const flags = [];
  const hedges = hedgeLangs(joined);
  const forwards = forwardLangs(joined);
  const facts = factHits(joined);
  const otherEnglishForward = /I've forwarded this to a teammate who can take a closer look/i.test(joined);
  const forbiddenHit = (row.forbidden || []).filter((snip) => snip && joined.includes(snip));

  if (extra && extra.inflightBypass) flags.push('bypass');
  if (row.expectSuppress) {
    if (texts.length) flags.push('bypass');
    if (forbiddenHit.length) flags.push('unsupported');
  } else if (row.expectPublic && !delivered.length) {
    flags.push('silent_drop');
    if (row.kind === 'faq') flags.push('faq_regression');
    if (row.erase || row.kind === 'erase') flags.push('erase_keep');
  }

  if (!row.expectSuppress && delivered.length) {
    if (forbiddenHit.length) {
      if (row.erase || row.kind === 'erase') flags.push('erase_keep');
      flags.push('unsupported');
    }
    if (row.kind === 'faq') {
      if (!containsNorm(joined, row.faqCore)) {
        flags.push('faq_regression');
        if (hedges.length || facts.length) flags.push('over_capture');
      }
      if (hedges.length && !containsNorm(joined, row.faqCore)) flags.push('false_hold');
    }
    if (row.kind === 'policy' && row.expectLocked) {
      const okFact = facts.some((f) => f.id === row.fact && acceptedLangs(row.lang).includes(f.lang));
      const enFact = facts.some((f) => f.id === row.fact && f.lang === 'en');
      const wrong = facts.filter((f) => f.id !== row.fact);
      if (!okFact && hedges.length && !wrong.length) flags.push('false_hold');
      if (wrong.length && !okFact && !enFact) flags.push('wrong_body');
      if (row.lang !== 'en' && enFact && !okFact && !hedges.some((h) => acceptedLangs(row.lang).includes(h))) {
        flags.push('non_english');
      }
    }
    if (row.kind === 'erase' || (row.erase && row.kind === 'owner')) {
      const hedged = hedges.some((h) => acceptedLangs(row.lang).concat(['en']).includes(h));
      if (!hedged) flags.push('erase_keep');
    }
    if (row.kind === 'mixed' && row.faqCore && !containsNorm(joined, row.faqCore)) flags.push('over_capture');
    if (row.forward || row.kind === 'forward') {
      const okForward = forwards.some((h) => acceptedLangs(row.lang).includes(h));
      const englishForward = forwards.includes('en') || otherEnglishForward;
      if (row.lang !== 'en' && englishForward && !okForward) flags.push('non_english');
      if (!forwards.length && !otherEnglishForward && !hedges.length) {
        /* an identity ask or other operational line is not a localized forward */
        if (row.lang !== 'en' && isEnglishOperational(joined)) flags.push('non_english');
      }
    }
    if (row.lang !== 'en' && row.kind === 'policy' && !row.expectLocked) {
      const okHedge = hedges.some((h) => acceptedLangs(row.lang).includes(h));
      const okFact = facts.some((f) => acceptedLangs(row.lang).includes(f.lang));
      const enOnly = (hedges.includes('en') || facts.some((f) => f.lang === 'en') || otherEnglishForward || forwards.includes('en'))
        && !okHedge && !okFact && !forwards.some((h) => acceptedLangs(row.lang).includes(h));
      if (enOnly) flags.push('non_english');
    }
    if (row.lang !== 'en' && (row.kind === 'compound' || row.kind === 'owner' || row.kind === 'mixed')) {
      const okHedge = hedges.some((h) => acceptedLangs(row.lang).includes(h));
      const okFact = facts.some((f) => acceptedLangs(row.lang).includes(f.lang));
      const okForward = forwards.some((h) => acceptedLangs(row.lang).includes(h));
      const localizedFaq = row.faqCore && containsNorm(joined, row.faqCore);
      const englishAnswer = isEnglishOperational(joined) && (hedges.includes('en') || facts.some((f) => f.lang === 'en') || forwards.includes('en') || otherEnglishForward || /Hello /.test(joined));
      if (!okHedge && !okFact && !okForward && !localizedFaq && englishAnswer) flags.push('non_english');
    }
  }

  return {
    id: row.id,
    scriptId: row.scriptId,
    lang: row.lang,
    kind: row.kind,
    topic: row.topic,
    flags: [...new Set(flags)],
    posts: delivered.map((t) => t.slice(0, 400)),
    replayed: !!(extra && extra.replayed),
    forbiddenHit,
  };
}

function bodyFromModel(raw) {
  const text = String(raw || '');
  const m = text.match(/BODY:\s*([\s\S]*?)(?=\nACTION_NEEDED:|\nACTION\s*:|$)/i);
  if (m) return m[1].trim();
  const r = text.match(/REPLY:\s*([\s\S]+)/i);
  if (r) return r[1].trim();
  const b = text.match(/\[([^\]]+)\]/);
  if (b) return b[1].trim();
  return text.trim();
}

function replayTextFor(conv, row) {
  const draft = row.kind === 'owner' ? bodyFromModel(row.ownerNote) : bodyFromModel(row.model);
  let guarded;
  try {
    guarded = payoutGuard.guardPublicBody(draft, {
      clientText: row.kind === 'owner' ? '' : (row.client || ''),
      parts: conv.conversation_parts.conversation_parts,
      botIds: ['10118526', '8052954'],
    });
  } catch (_) {
    return '';
  }
  const body = guarded && guarded.body;
  if (!body) return '';
  const prior = publicPosts.filter((p) => p.conversationId === conv.id).map((p) => p.text);
  const hit = prior.find((t) => containsNorm(t, body) || containsNorm(body, t));
  return hit || '';
}

async function runCase(conv, row) {
  if (row.kind === 'owner') {
    addOwnerNote(conv, row.ownerNote);
    modelHandler = async () => row.model;
    const texts = await webhook(conv, 'conversation.admin.noted');
    return scoreCase(row, texts, { replayText: texts.length ? '' : replayTextFor(conv, row) });
  }
  if (row.kind === 'defer') {
    addTeammate(conv);
    addUser(conv, row.client, Math.floor(Date.now() / 1000) + 2);
    modelHandler = async () => row.model;
    const texts = await webhook(conv, 'conversation.user.replied');
    return scoreCase(row, texts, { replayText: texts.length ? '' : replayTextFor(conv, row) });
  }
  if (row.inflight) {
    addUser(conv, row.client);
    let release;
    const gate = new Promise((r) => { release = r; });
    let started = false;
    modelHandler = async (req) => {
      const blob = JSON.stringify(req || {});
      if (/INTERNAL Intercom note|rewrite the following INTERNAL/i.test(blob)) return 'Please review this ticket.';
      if (!started) {
        started = true;
        await gate;
      }
      return row.model;
    };
    const p1 = webhook(conv, 'conversation.user.replied');
    const startWait = Date.now();
    while (!started && Date.now() - startWait < 15000) await new Promise((r) => setTimeout(r, 10));
    const p2 = webhook(conv, 'conversation.user.replied');
    await new Promise((r) => setTimeout(r, 20));
    release();
    const [a, b] = await Promise.all([p1, p2]);
    return scoreCase(row, a, { inflightBypass: b.length > 0 });
  }
  addUser(conv, row.client);
  modelHandler = async (req) => {
    const blob = JSON.stringify(req || {});
    if (/INTERNAL Intercom note|rewrite the following INTERNAL/i.test(blob)) return 'Please review this ticket.';
    return row.model;
  };
  const texts = await webhook(conv, 'conversation.user.replied');
  return scoreCase(row, texts, { replayText: texts.length ? '' : replayTextFor(conv, row) });
}

function rate(n, d) {
  if (!d) return 0;
  return n / d;
}

function summarize(results) {
  const count = (flag) => results.filter((r) => r.flags.includes(flag)).length;
  const unsupported = count('unsupported');
  const wrongBody = count('wrong_body');
  const bypass = count('bypass');
  const eraseKeep = count('erase_keep');
  const silent = count('silent_drop');
  const faqReg = count('faq_regression');
  const falseHold = count('false_hold');
  const nonEn = count('non_english');
  const over = count('over_capture');
  const falseHoldDenom = results.filter((r) => r.kind === 'faq' || (r.kind === 'policy' && r.expectLocked)).length;
  const nonEnDenom = results.filter((r) => r.lang !== 'en' && r.kind !== 'defer').length;
  const falseHoldRate = rate(falseHold, falseHoldDenom);
  const nonEnRate = rate(nonEn, nonEnDenom);
  const critical = unsupported + wrongBody + bypass + eraseKeep;
  const pass = critical === 0 && silent === 0 && faqReg === 0 && trips.length === 0
    && falseHoldRate <= 0.02 && nonEnRate <= 0.02 && results.every((r) => !r.flags.includes('harness_error'));
  return {
    cases: results.length,
    faqCases: results.filter((r) => r.kind === 'faq').length,
    scripts: new Set(results.map((r) => r.scriptId)).size,
    unsupported, wrongBody, bypass, eraseKeep, silent, faqReg, falseHold, nonEn, over,
    falseHoldDenom, nonEnDenom, falseHoldRate, nonEnRate, critical,
    trips: trips.length,
    helpFetches: helpFetches.length,
    helpHosts: [...new Set(helpFetches.map((u) => { try { return new URL(u).host; } catch (_) { return u; } }))],
    pass,
  };
}

function examples(results, flag, n) {
  return results.filter((r) => r.flags.includes(flag)).slice(0, n).map((r) => ({
    id: r.id, lang: r.lang, kind: r.kind, topic: r.topic, posts: r.posts, forbiddenHit: r.forbiddenHit,
  }));
}

(async () => {
  const byScript = new Map();
  for (const row of corpus.cases) {
    if (!byScript.has(row.scriptId)) byScript.set(row.scriptId, []);
    byScript.get(row.scriptId).push(row);
  }
  let scripts = [...byScript.keys()];
  if (process.env.R16_LANG) scripts = scripts.filter((id) => id.startsWith(process.env.R16_LANG + '-'));
  if (LIMIT_SCRIPTS) scripts = scripts.slice(0, LIMIT_SCRIPTS);
  const results = [];
  let done = 0;
  for (const scriptId of scripts) {
    const rows = byScript.get(scriptId);
    const conv = makeConv(rows[0]);
    for (const row of rows) {
      try {
        const scored = await runCase(conv, row);
        if (row.kind === 'policy') scored.expectLocked = !!row.expectLocked;
        results.push(scored);
      } catch (e) {
        results.push({
          id: row.id, scriptId, lang: row.lang, kind: row.kind, topic: row.topic,
          flags: ['harness_error', row.expectPublic ? 'silent_drop' : 'bypass'],
          posts: [], error: e && e.message,
        });
      }
    }
    done += 1;
    if (done % 5 === 0 || done === scripts.length) {
      console.log('PROGRESS', done + '/' + scripts.length, 'posts', publicPosts.length, 'trips', trips.length);
    }
  }
  const summary = summarize(results);
  const payload = {
    frozenCommit: corpus.frozenCommit,
    sealHash: seal.hash,
    sealed: seal.sealed,
    summary,
    examples: {
      unsupported: examples(results, 'unsupported', 8),
      wrong_body: examples(results, 'wrong_body', 6),
      bypass: examples(results, 'bypass', 6),
      erase_keep: examples(results, 'erase_keep', 8),
      silent_drop: examples(results, 'silent_drop', 6),
      faq_regression: examples(results, 'faq_regression', 6),
      false_hold: examples(results, 'false_hold', 6),
      non_english: examples(results, 'non_english', 8),
      over_capture: examples(results, 'over_capture', 6),
    },
    trips,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (trips.length) process.exitCode = 2;
})().catch((e) => {
  console.error('HARNESS_FAIL', e);
  process.exit(1);
});
