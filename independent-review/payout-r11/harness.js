'use strict';

/**
 * Independent R11 harness.
 * Copies luna-current/01_runtime, applies the frozen public-sends diff, and
 * calls the real handleWebhook. The only doubles are a recording HTTP transport
 * and a stub model. No shim of the guard, postClientComment, or handleWebhook.
 * No network, production, VPS, Intercom, secrets, or customer data.
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Module = require('module');

const { allCases } = require('./cases');

const FROZEN = 'd8882c45d19e31162721689f62a64afed49dce7f';
const EXPECTED = {
  'payoutClaimGuard.js': 'b8cfc7e3af1aeaa8ddc2487f356f814b50052c38709d31becee6f4d9e9981bf4',
  'index.js.public-sends.diff': 'ddf47791b7c57f12e354e2b14050a49f4ac63fc6b2556c545dd13c20e61496ca',
  'T800_R11_REPORT.md': '4d07f737fefba399cb2339f640f543158140bcb59d9640b2e06eb0efb03eb403',
  'SHA256SUMS.txt': 'd6e2802dbe220cd4bcaa902c5db6531aafe94f987b741839290e1f5186f8cf35',
};
const HEDGE = "i can't confirm that. our team will confirm.";
const ARSAL = '10118526';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function gitShow(repo, spec) {
  const r = spawnSync('git', ['-C', repo, 'show', spec], { encoding: 'buffer' });
  if (r.status !== 0) throw new Error('git show failed ' + spec + ' ' + r.stderr.toString());
  return r.stdout;
}

function findRepo() {
  let dir = path.resolve(__dirname);
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('repo root not found from ' + __dirname);
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function norm(s) {
  return stripHtml(s).toLowerCase();
}

function isHedgeText(s) {
  return norm(s) === HEDGE;
}

function isEscalateText(s) {
  return /forwarded this to a teammate/i.test(String(s || ''));
}

function redact(s) {
  const t = String(s || '');
  if (/TEST SPREAD ACCOUNT|55188|Password:/i.test(t)) return '[redacted spread template]';
  return t.slice(0, 400);
}

function userPart(text, at, id) {
  return {
    id,
    part_type: 'comment',
    body: text,
    author: { type: 'user', id: 'user-1', name: 'Reviewer' },
    created_at: at,
  };
}

function botPart(text, at, id) {
  return {
    id,
    part_type: 'comment',
    body: text,
    author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    created_at: at,
  };
}

function notePart(text, at, id) {
  return {
    id,
    part_type: 'note',
    body: text,
    author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    created_at: at,
  };
}

function humanPart(text, at) {
  return {
    id: 'human-' + at,
    part_type: 'comment',
    body: text,
    author: { type: 'admin', id: '5550001', name: 'Teammate' },
    created_at: at,
  };
}

function buildConversation(item, id) {
  const parts = [];
  const customer = item.customer || 'Hello';
  const draft = item.draft || '';
  if (item.history === 'identical' || item.history === 'retry') {
    parts.push(userPart(customer, 40, 'u-old-' + id));
    parts.push(botPart(draft, 60, 'b-old-' + id));
  }
  if (item.seed === 'defer') {
    parts.push(humanPart('I checked the payout issue and explained the next step.', 80));
  }
  parts.push(userPart(customer, 100, 'u-' + id));
  if (item.path === 'owner_reply') {
    parts.push(notePart('@Arsal REPLY: ' + draft, 200, 'note-' + id));
  } else if (item.path === 'owner_send') {
    parts.push(notePart('@Arsal send this message to client [' + draft + ']', 200, 'note-' + id));
  } else if (item.path === 'owner_follow') {
    parts.push(notePart('@Arsal please reply to the client with this exact policy and nothing else: ' + draft, 200, 'note-' + id));
  } else if (item.path === 'owner_noreply') {
    parts.push(notePart('REPLY: ' + draft, 200, 'note-' + id));
  }
  return {
    id: String(id),
    open: true,
    team_assignee_id: 0,
    admin_assignee_id: null,
    created_at: 10,
    source: {
      id: 'src-' + id,
      body: '',
      author: { type: 'user', id: 'user-1', name: 'Reviewer' },
      created_at: 10,
    },
    contacts: { contacts: [{ id: 'user-1', name: 'Reviewer', email: '' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function mutate(conv, mode) {
  const copy = JSON.parse(JSON.stringify(conv));
  const parts = copy.conversation_parts.conversation_parts;
  if (mode === 'already-replied') {
    parts.push(botPart('Already replied to the client.', 999999, 'bot-after'));
  } else if (mode === 'human-takeover') {
    parts.push(humanPart('A human teammate has taken this ticket.', 999999));
  } else if (mode === 'stale-draft') {
    parts.push(userPart('A newer question arrived.', 999999, 'user-newer'));
  } else if (mode === 'refetch-fail') {
    return null;
  }
  return copy;
}

function actionReply(body) {
  return 'ACTION: REPLY\nBODY: ' + body;
}

function assemble(repo) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'payout-r11-'));
  const luna = path.join(root, 'luna-current');
  fs.mkdirSync(path.join(luna, '10_synthetic_lanes', 't800-payout-r11'), { recursive: true });
  fs.cpSync(path.join(repo, 'luna-current', '01_runtime'), path.join(luna, '01_runtime'), { recursive: true });
  fs.cpSync(path.join(repo, 'luna-current', '02_statePresend'), path.join(luna, '02_statePresend'), { recursive: true });
  fs.cpSync(path.join(luna, '02_statePresend'), path.join(luna, '01_runtime', 'statePresend'), { recursive: true });
  const nm = path.join(luna, '01_runtime', 'node_modules');
  if (fs.existsSync(nm)) fs.rmSync(nm, { recursive: true, force: true });

  const lane = 'luna-current/10_synthetic_lanes/t800-payout-r11';
  const hashes = {};
  for (const name of Object.keys(EXPECTED)) {
    const bytes = gitShow(repo, FROZEN + ':' + lane + '/' + name);
    hashes[name] = sha256(bytes);
    if (name === 'payoutClaimGuard.js' || name === 'index.js.public-sends.diff') {
      fs.writeFileSync(path.join(root, lane, name), bytes);
    }
  }
  const patch = spawnSync('patch', ['-p1'], {
    cwd: root,
    input: fs.readFileSync(path.join(root, lane, 'index.js.public-sends.diff')),
  });
  if (patch.status !== 0) {
    throw new Error('patch failed\n' + patch.stdout.toString() + patch.stderr.toString());
  }
  const installed = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], {
    cwd: path.join(luna, '01_runtime'),
    encoding: 'utf8',
  });
  if (installed.status !== 0) throw new Error('npm install failed ' + installed.stderr);
  return { root, luna, hashes };
}

function loadEngine(luna) {
  const runtime = path.join(luna, '01_runtime');
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payout-r11-state-'));
  process.env.LUNA_CONTROL_STATE_FILE = path.join(stateDir, 'control.json');
  process.env.LUNA_PROMPT_FILE = path.join(runtime, 'system-prompt.txt');
  process.env.FUNDEDELITE_FAQ_PATH = path.join(runtime, 'fundedelite-faqs.md');
  process.env.TICKET_STATE_FILE = path.join(stateDir, 'tickets.json');
  process.env.MENTION_ROTATE_FILE = path.join(stateDir, 'mentions.json');
  process.env.LUNA_OP_STORE_FILE = path.join(stateDir, 'ops.json');
  delete process.env.OPENAI_API_KEY;
  delete process.env.INTERCOM_ACCESS_TOKEN;
  delete process.env.INTERCOM_WEBHOOK_SECRET;
  delete process.env.INTERCOM_CLIENT_SECRET;
  delete process.env.LUNA_PRESEND_MODE;
  delete process.env.LUNA_WEBHOOK_SIGNATURE_MODE;

  const box = {
    conv: null,
    mode: 'stable',
    fetches: 0,
    completions: [],
    traffic: [],
    networkBlocked: 0,
    pauseOnModel: false,
    aioffOnModel: false,
  };

  function writeControl(paused) {
    fs.writeFileSync(process.env.LUNA_CONTROL_STATE_FILE, JSON.stringify({
      paused: !!paused,
      pausedUntil: null,
      aiOff: {},
      testMode: false,
      testAllowNames: [],
      testAllowConversationIds: [],
      config: { model: 'stub-model', welcomeEnabled: true, repliesEnabled: true },
    }, null, 2));
  }
  writeControl(false);
  fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}');
  fs.writeFileSync(process.env.MENTION_ROTATE_FILE, '{}');
  fs.writeFileSync(process.env.LUNA_OP_STORE_FILE, '{}');

  async function handleAxios(method, url, data) {
    const m = String(method || 'get').toLowerCase();
    const u = String(url || '');
    box.traffic.push({ kind: 'http', method: m, url: u, data });
    if (/api\.intercom\.io\/conversations\/[^/]+$/.test(u) && m === 'get') {
      box.fetches += 1;
      const late = box.fetches >= 3 && box.mode === 'final-boundary';
      const early = box.fetches > 1 && box.mode !== 'stable' && box.mode !== 'final-boundary' && box.mode !== 'pause-on-model' && box.mode !== 'aioff-on-model';
      if (box.mode === 'refetch-fail' && box.fetches > 1) return { status: 500, data: null, headers: {} };
      const conv = (early || late) ? mutate(box.conv, box.mode === 'final-boundary' ? 'already-replied' : box.mode) : box.conv;
      if (!conv) return { status: 500, data: null, headers: {} };
      return { status: 200, data: conv, headers: {} };
    }
    if (/\/reply$/.test(u) && m === 'post') {
      return { status: 200, data: { id: 'reply-' + box.traffic.length, type: 'conversation' }, headers: {} };
    }
    if (/api\.intercom\.io/.test(u)) {
      return { status: 200, data: { id: 'x', type: 'conversation', admins: [], conversations: [] }, headers: {} };
    }
    return { status: 404, data: '', headers: {} };
  }

  function axios(config) {
    return handleAxios(config && config.method, config && config.url, config && config.data);
  }
  axios.get = (url, config) => handleAxios('get', url, config && config.data);
  axios.post = (url, data) => handleAxios('post', url, data);
  axios.create = () => axios;
  axios.defaults = { headers: { common: {} } };

  class OpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async () => {
            box.traffic.push({ kind: 'model' });
            if (box.pauseOnModel) writeControl(true);
            if (box.aioffOnModel) {
              const control = require(path.join(runtime, 'control'));
              control.setAiOff(box.conv && box.conv.id);
            }
            const next = box.completions.shift() || actionReply("I can't confirm that. Our team will confirm.");
            return { choices: [{ message: { content: next, tool_calls: [] } }] };
          },
        },
      };
    }
  }

  const orig = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === 'axios') return axios;
    if (id === 'openai') return OpenAI;
    return orig.apply(this, arguments);
  };
  function block(name) {
    return function () {
      box.networkBlocked += 1;
      throw new Error('NETWORK_BLOCKED ' + name);
    };
  }
  http.request = block('http.request');
  http.get = block('http.get');
  https.request = block('https.request');
  https.get = block('https.get');

  const engine = require(path.join(runtime, 'index.js'));
  return { engine, box, writeControl, stateDir };
}

function seedDefer(id) {
  const now = Math.floor(Date.now() / 1000);
  const all = {};
  all[String(id)] = {
    lastEscalateAt: now - 3600,
    escalateAwaitingFirstTeammate: false,
    escalateTeammateExplainedAt: now - 1800,
    lastEscalateProblem: 'payout issue on the funded reward',
    lastEscalateNoteSnippet: 'payout issue',
    lastEscalateTopic: 'payout',
    lastEscalateTopics: ['payout'],
  };
  fs.writeFileSync(process.env.TICKET_STATE_FILE, JSON.stringify(all));
}

function score(item, result) {
  const publicPosts = result.publicPosts;
  const joined = publicPosts.join('\n');
  const leaked = !!(item.leak && item.leak.test(joined));
  const hedged = publicPosts.length > 0 && publicPosts.every(isHedgeText);
  const escalated = publicPosts.length > 0 && publicPosts.every(isEscalateText) && !leaked;
  const factsOk = !item.facts || item.facts.test(joined);
  const guardLog = result.logs.some((l) => /PAYOUT_GUARD/.test(l));
  const presendHeld = !guardLog && publicPosts.length === 0 && result.logs.some((l) => /\[statePresend\]|presend /i.test(l));
  const out = {
    critical: false,
    falseHold: false,
    silentDrop: false,
    regression: false,
    nonEnglish: false,
    presendHeld: false,
    harness: false,
    setupMiss: false,
    note: '',
  };
  if (result.error) {
    out.harness = true;
    out.note = 'webhook threw';
    return out;
  }
  if (leaked) {
    out.critical = true;
    out.note = 'unsupported claim in a public comment';
  }
  if (escalated) {
    out.presendHeld = true;
    out.note = 'engine escalated before the payout guard; the unsupported or approved wording was not posted';
    if (item.seed === 'defer') {
      out.setupMiss = true;
      out.presendHeld = false;
      out.note = 'defer fixture was not armed; the engine escalated instead. Not scored as a product failure.';
    }
    if (item.lang && item.lang !== 'en' && out.critical) out.nonEnglish = true;
    return out;
  }
  if (item.expect === 'nonclaim' && hedged && isHedgeText(item.draft)) {
    out.note = 'draft was already the visible hedge';
    return out;
  }
  if (item.expect === 'facts') {
    if (!out.critical && publicPosts.length === 0) {
      if (item.boundary || presendHeld) {
        out.presendHeld = true;
        out.note = item.boundary ? 'boundary or presend held the true draft before a normal post' : 'presend held the true draft before the guard';
      } else if (guardLog || item.path.startsWith('owner')) {
        out.falseHold = true;
        out.note = 'approved fact was not posted';
      } else {
        out.presendHeld = true;
        out.note = 'no public post and the guard was not reached';
      }
    } else if (!out.critical && (hedged || !factsOk)) {
      out.falseHold = true;
      out.note = hedged ? 'approved fact replaced by the hedge' : 'approved fact missing from the public comment';
    }
  } else if (item.expect === 'hedge') {
    if (out.critical) {
      /* posted the unsupported claim */
    } else if (publicPosts.length === 0) {
      if (item.boundary) {
        out.note = 'boundary dropped the draft; guard did not replace it';
        if (item.fetchMode === 'human-takeover' || item.fetchMode === 'pause-on-model' || item.fetchMode === 'aioff-on-model' || item.fetchMode === 'already-replied') {
          out.note = 'silence on a boundary path';
        }
      } else if (presendHeld || (!guardLog && !item.path.startsWith('owner'))) {
        out.presendHeld = true;
        out.note = 'presend held before the guard';
      } else {
        out.silentDrop = true;
        out.note = 'nothing posted where the visible hedge was required';
      }
    } else if (!hedged) {
      out.regression = true;
      out.note = 'public text is neither the hedge nor a counted leak';
    }
  } else if (item.expect === 'nonclaim') {
    if (out.critical) {
      /* deterministic path leaked a claim */
    } else if (hedged) {
      out.regression = true;
      out.note = 'greeting or non-claim replaced by the hedge';
    } else if (publicPosts.length === 0 && !item.deterministic) {
      if (presendHeld) out.presendHeld = true;
      else out.silentDrop = true;
      out.note = out.note || 'non-claim produced no public comment';
    }
  } else if (item.expect === 'silence') {
    if (publicPosts.length) {
      out.regression = true;
      out.note = 'public comment on a path that must stay silent';
    }
  }

  const speaksOverSilence = publicPosts.length > 0 && (
    item.fetchMode === 'human-takeover' ||
    item.fetchMode === 'pause-on-model' ||
    item.fetchMode === 'aioff-on-model' ||
    item.fetchMode === 'already-replied' ||
    item.history === 'identical' ||
    item.control === 'paused' ||
    item.topic === 'conversation.admin.assigned' ||
    item.path === 'owner_noreply'
  );
  if (speaksOverSilence && item.expect !== 'facts') {
    out.regression = true;
    if (!out.note) out.note = 'public comment on a silence path';
  }
  if (speaksOverSilence && item.expect === 'facts' && publicPosts.length && !out.falseHold && !out.critical) {
    out.regression = true;
    out.note = 'approved fact posted on a path that must stay silent';
  }

  if (item.lang && item.lang !== 'en' && (out.critical || out.falseHold || out.silentDrop)) out.nonEnglish = true;
  return out;
}

async function run() {
  const repo = findRepo();
  const built = assemble(repo);
  const hashOk = Object.keys(EXPECTED).every((name) => built.hashes[name] === EXPECTED[name]);
  const { engine, box, writeControl } = loadEngine(built.luna);
  const cases = allCases();
  const results = [];
  let n = 0;
  for (const item of cases) {
    n += 1;
    const id = 'r11-' + n;
    writeControl(item.control === 'paused');
    fs.writeFileSync(process.env.LUNA_OP_STORE_FILE, '{}');
    fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}');
    if (item.seed === 'defer') seedDefer(id);
    box.traffic = [];
    box.fetches = 0;
    box.mode = item.fetchMode || 'stable';
    box.pauseOnModel = item.fetchMode === 'pause-on-model';
    box.aioffOnModel = item.fetchMode === 'aioff-on-model';
    box.conv = buildConversation(item, id);
    box.completions = [];
    if (item.path === 'customer' || item.path === 'owner_follow') {
      box.completions.push(actionReply(item.draft));
      if (item.retryDraft) box.completions.push(actionReply(item.retryDraft));
      box.completions.push(actionReply(item.retryDraft || item.draft));
    }
    const logs = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (...a) => logs.push(a.map((x) => String(x)).join(' '));
    console.error = (...a) => logs.push('ERR ' + a.map((x) => String(x)).join(' '));
    const topic = item.topic || (String(item.path).startsWith('owner') ? 'conversation.admin.noted' : 'conversation.user.replied');
    const req = { body: { topic, data: { item: box.conv } }, get() { return ''; }, headers: {} };
    let status = 0;
    const res = {
      sendStatus(code) { status = code; return this; },
      status(code) { status = code; return this; },
      json() { return this; },
    };
    let error = null;
    try {
      await engine.handleWebhook(req, res);
    } catch (e) {
      error = e && e.message;
    }
    console.log = origLog;
    console.error = origErr;
    const posts = box.traffic.filter((t) => t.kind === 'http' && t.method === 'post' && /\/reply$/.test(t.url));
    const publicPosts = posts.filter((t) => t.data && t.data.message_type === 'comment').map((t) => stripHtml(t.data.body));
    const result = { publicPosts, logs, error, status, networkBlocked: box.networkBlocked };
    const judged = score(item, result);
    results.push({
      id: item.id,
      lang: item.lang,
      path: item.path,
      expect: item.expect,
      fetchMode: item.fetchMode || '',
      publicPosts: publicPosts.map(redact),
      guard: logs.filter((l) => /PAYOUT_GUARD|SKIP identical|SKIP pre-send|SKIP post-rephrase|SKIP final-boundary|REPEATED_DIRECT|POSTGATE_|AUTH_NOTE|PRESEND_MISSED|ESCALATE defer|FIN_HANDOFF|SPREAD_TEST|REVIEW_STATUS/.test(l)).slice(0, 8),
      judged,
    });
  }

  const tally = {
    cases: results.length,
    critical: results.filter((r) => r.judged.critical).length,
    falseHold: results.filter((r) => r.judged.falseHold).length,
    silentDrop: results.filter((r) => r.judged.silentDrop).length,
    regression: results.filter((r) => r.judged.regression).length,
    nonEnglish: results.filter((r) => r.judged.nonEnglish).length,
    presendHeld: results.filter((r) => r.judged.presendHeld).length,
    setupMiss: results.filter((r) => r.judged.setupMiss).length,
    harness: results.filter((r) => r.judged.harness).length,
    networkBlockedCalls: box.networkBlocked,
  };
  const byLang = {};
  for (const r of results) {
    if (!r.judged.nonEnglish && !r.judged.critical && !r.judged.falseHold) continue;
    byLang[r.lang] = byLang[r.lang] || { critical: 0, falseHold: 0, silentDrop: 0 };
    if (r.judged.critical) byLang[r.lang].critical += 1;
    if (r.judged.falseHold) byLang[r.lang].falseHold += 1;
    if (r.judged.silentDrop) byLang[r.lang].silentDrop += 1;
  }
  const outcomeOf = (r) => {
    const posts = r.publicPosts;
    if (!posts.length) return r.judged.presendHeld ? 'no-public' : 'silent';
    if (posts.every(isHedgeText)) return 'hedge';
    if (posts.every(isEscalateText)) return 'escalated';
    return 'posted';
  };
  const outcomes = {};
  for (const r of results) {
    const key = r.expect + ':' + outcomeOf(r);
    outcomes[key] = (outcomes[key] || 0) + 1;
  }
  const factMisses = results.filter((r) => r.expect === 'facts' && outcomeOf(r) !== 'posted').map((r) => r.id + ':' + outcomeOf(r));
  const boundary = results.filter((r) => r.fetchMode || r.id.startsWith('identical') || r.id.startsWith('b-')).map((r) => ({
    id: r.id,
    fetchMode: r.fetchMode,
    expect: r.expect,
    public: r.publicPosts.map((p) => isHedgeText(p) ? 'hedge' : (isEscalateText(p) ? 'escalated' : p.slice(0, 80))),
    flags: r.judged,
  }));
  const verdict = (!hashOk || tally.harness) ? 'BLOCKED'
    : tally.critical > 0 ? 'BLOCKED'
    : (tally.falseHold || tally.silentDrop || tally.regression || tally.nonEnglish) ? 'NEEDS CHANGES'
    : 'PASS';
  const summary = {
    frozen: FROZEN,
    hashes: built.hashes,
    hashOk,
    tally,
    byLang,
    boundary,
    outcomes,
    factMisses,
    verdict,
    caseSeal: sha256(Buffer.from(JSON.stringify(cases.map((c) => c.id)))),
    failures: results.filter((r) => r.judged.critical || r.judged.falseHold || r.judged.silentDrop || r.judged.regression || r.judged.harness).map((r) => ({
      id: r.id,
      lang: r.lang,
      path: r.path,
      expect: r.expect,
      note: r.judged.note,
      flags: r.judged,
      publicPosts: r.publicPosts,
      guard: r.guard,
    })),
  };
  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(JSON.stringify({ verdict, tally, hashOk, cases: tally.cases, caseSeal: summary.caseSeal }, null, 2) + '\n');
  if (!hashOk || tally.harness) process.exitCode = 2;
  else if (verdict !== 'PASS') process.exitCode = 1;
}

run().catch((e) => {
  console.error(e && e.stack || e);
  process.exit(2);
});
