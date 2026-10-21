'use strict';

/**
 * Independent Credential Guard R11 review harness.
 * Applies proposed-integration.diff with patch -p1, then drives the real
 * handlers through an in-process recording transport. No production network.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { buildCases } = require('./cases');
const preload = require('./preload');

const FROZEN = '643cbd4f39e3645c3e8ed2c33e984e9f74bc7561';
const ROOT = path.resolve(__dirname, '../../..');
const WORK = '/tmp/cred-r11-review/work';
const FLAT = '/tmp/cred-r11-review/flat';
const TMP = '/tmp/cred-r11-review/tmp';
const ARSAL = '10118526';
const ESCALATIONS = '9629759';

const stdoutChunks = [];
const stderrChunks = [];

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeControl() {
  const file = path.join(TMP, 'bot-control.json');
  fs.writeFileSync(file, JSON.stringify({
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: [],
    testAllowConversationIds: [],
    config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
  }, null, 2));
  return file;
}

function prepareTree() {
  rmrf('/tmp/cred-r11-review');
  ensureDir(WORK);
  ensureDir(TMP);
  const archive = spawnSync('git', ['archive', FROZEN], { cwd: ROOT, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  if (archive.status !== 0) throw new Error('git archive failed: ' + archive.stderr.toString());
  fs.writeFileSync(path.join(TMP, 'archive.tar'), archive.stdout);
  const extracted = spawnSync('tar', ['-x', '-f', path.join(TMP, 'archive.tar'), '-C', WORK], { encoding: 'utf8' });
  if (extracted.status !== 0) throw new Error('tar extract failed');
  const manifest = path.join(WORK, 'luna-current/10_synthetic_lanes/credential-guard-r11/CRED_R11_MANIFEST.sha256');
  const check = spawnSync('sha256sum', ['-c', manifest], { cwd: WORK, encoding: 'utf8' });
  const prompt = sha256File(path.join(WORK, 'luna-current/01_runtime/system-prompt.txt'));
  const faqs = sha256File(path.join(WORK, 'luna-current/01_runtime/fundedelite-faqs.md'));
  const faqsDocs = sha256File(path.join(WORK, 'luna-current/04_docs/fundedelite-faqs.md'));
  const diff = path.join(WORK, 'luna-current/10_synthetic_lanes/credential-guard-r11/proposed-integration.diff');
  const patched = spawnSync('patch', ['-p1', '--forward', '--input', diff], { cwd: WORK, encoding: 'utf8' });
  ensureDir(FLAT);
  fs.cpSync(path.join(WORK, 'luna-current/01_runtime'), FLAT, { recursive: true });
  fs.cpSync(path.join(WORK, 'luna-current/02_statePresend'), path.join(FLAT, 'statePresend'), { recursive: true });
  fs.cpSync(path.join(WORK, 'luna-current/03_luna-maintainer'), path.join(FLAT, 'luna-maintainer'), { recursive: true });
  const npm = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: FLAT, encoding: 'utf8', timeout: 180000 });
  return {
    manifestCheck: check.stdout + check.stderr,
    manifestOk: check.status === 0,
    prompt,
    faqs,
    faqsDocs,
    patchStatus: patched.status,
    patchOut: (patched.stdout || '') + (patched.stderr || ''),
    npmStatus: npm.status,
    npmTail: ((npm.stdout || '') + (npm.stderr || '')).split('\n').slice(-8).join('\n'),
  };
}

function installCapture() {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk, enc, cb) => {
    stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    return origOut(chunk, enc, cb);
  };
  process.stderr.write = (chunk, enc, cb) => {
    stderrChunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    return origErr(chunk, enc, cb);
  };
}

function logs() {
  return stdoutChunks.join('') + '\n' + stderrChunks.join('');
}

function clearLogs() {
  stdoutChunks.length = 0;
  stderrChunks.length = 0;
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch (_) { continue; }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      walk(full, out);
    } else if (/\.(js|mjs|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

function chokeScan(files) {
  const sites = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (line.indexOf('chat.completions.create') < 0 && line.indexOf('responses.create') < 0) return;
      const window = lines.slice(Math.max(0, i - 35), i + 1).join('\n');
      const guarded = window.indexOf('guardModelMessages') >= 0 || window.indexOf('__guardedChat') >= 0;
      const rel = file.replace(FLAT + '/', 'flat/').replace(WORK + '/', 'work/');
      const live = /\/(index|lunaToolsRuntime|llm|luna-local-chat)\.js$/.test(file);
      sites.push({ file: rel, line: i + 1, guarded, live, smoke: /smoke_/.test(file) });
    });
  }
  return sites;
}

function conv(opts) {
  const now = Math.floor(Date.now() / 1000);
  const created = now - (opts.createdAgo || 3600);
  const parts = (opts.extra || []).slice();
  (opts.messages || []).forEach((body, i) => {
    parts.push({
      id: opts.id + '-m' + i,
      part_type: 'comment',
      body: body,
      created_at: created + 30 + i,
      author: { type: 'user', id: 'syn-user', name: 'Synthetic' },
    });
  });
  if (opts.text) {
    parts.push({
      id: opts.id + '-u',
      part_type: 'comment',
      body: opts.text,
      created_at: now - 5,
      author: { type: 'user', id: 'syn-user', name: 'Synthetic' },
    });
  }
  if (opts.note) {
    parts.push({
      id: opts.id + '-n',
      part_type: 'note',
      body: opts.note,
      created_at: now,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    });
  }
  return {
    id: opts.id,
    type: 'conversation',
    created_at: created,
    updated_at: now,
    open: true,
    team_assignee_id: opts.team || null,
    admin_assignee_id: opts.admin || null,
    source: {
      body: opts.text || ((opts.messages || [])[0]) || 'hello',
      author: { type: 'user', id: 'syn-user', name: 'Synthetic', email: 'synthetic@example.test' },
    },
    contacts: { contacts: [{ id: 'syn-c-' + opts.id, name: 'Synthetic', email: 'synthetic@example.test' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function postsOf(calls) {
  return (calls || []).filter((c) => c.url.indexOf('/reply') >= 0 && c.data && typeof c.data.body === 'string').map((c) => ({
    type: String(c.data.message_type || ''),
    body: c.data.body,
    url: c.url,
  }));
}

function isTemplate(body, password) {
  const text = String(body || '');
  return text.indexOf(password) >= 0 && text.indexOf('55188') >= 0 && /TEST SPREAD ACCOUNT DETAILS/i.test(text);
}

function isFixed(body) {
  return String(body || '').indexOf('Please change that immediately') >= 0;
}

function redactExcerpt(text, needles, password) {
  let out = String(text || '');
  if (password) out = out.split(password).join('<TEMPLATE_PASSWORD>');
  (needles || []).forEach((n) => { if (n) out = out.split(n).join('<SECRET>'); });
  out = out.replace(/\s+/g, ' ').trim();
  return out.slice(0, 220);
}

function surfaceHits(surfaces, needles, password, prompt) {
  const hits = [];
  for (const surface of surfaces) {
    let hay = surface.text;
    if (surface.allowPrompt && prompt) hay = hay.split(prompt).join('');
    if (surface.allowTemplate && password) {
      const posts = surface.posts || [];
      let stripped = hay;
      posts.forEach((p) => {
        if (isTemplate(p.body, password)) stripped = stripped.split(p.body).join('');
      });
      hay = stripped;
    }
    (needles || []).forEach((needle) => {
      if (needle && hay.indexOf(needle) >= 0) {
        hits.push({ surface: surface.name, excerpt: redactExcerpt(hay, needles, password) });
      }
    });
    if (password && hay.indexOf(password) >= 0) {
      hits.push({ surface: surface.name, excerpt: redactExcerpt(hay, needles, password), templatePassword: true });
    }
  }
  return hits;
}

async function main() {
  const prep = prepareTree();
  const cases = buildCases();
  const caseHash = sha256(fs.readFileSync(path.join(__dirname, 'cases.js')));
  const ids = new Set();
  cases.forEach((c) => { if (ids.has(c.id)) throw new Error('duplicate case ' + c.id); ids.add(c.id); });

  const controlFile = writeControl();
  const ticketFile = path.join(TMP, 'ticket-state.json');
  const mentionFile = path.join(TMP, 'mention.json');
  const opFile = path.join(TMP, 'ops.json');
  const maintainerDir = path.join(TMP, 'maintainer');
  fs.writeFileSync(ticketFile, '{}');
  fs.writeFileSync(mentionFile, '{}');
  fs.writeFileSync(opFile, '{}');
  ensureDir(maintainerDir);
  const promptFile = path.join(FLAT, 'system-prompt.txt');
  const promptText = fs.readFileSync(promptFile, 'utf8');

  process.chdir(TMP);
  Object.assign(process.env, {
    LUNA_PROMPT_FILE: promptFile,
    LUNA_CONTROL_STATE_FILE: controlFile,
    TICKET_STATE_FILE: ticketFile,
    MENTION_ROTATE_FILE: mentionFile,
    LUNA_OP_STORE_FILE: opFile,
    FUNDEDELITE_FAQ_PATH: path.join(FLAT, 'fundedelite-faqs.md'),
    LUNA_ROOT: FLAT,
    MAINTAINER_DATA_DIR: maintainerDir,
    MAINTAINER_ENABLED: 'true',
    MAINTAINER_DRY_RUN: 'true',
    LUNA_TOOLS_ENABLED: '1',
    LUNA_PRESEND_MODE: 'enforce',
    LUNA_WEBHOOK_SIGNATURE_MODE: 'off',
    OPENAI_API_KEY: 'sk-synthetic-r11-not-a-real-key',
    INTERCOM_ACCESS_TOKEN: 'syn-intercom-not-real',
    INTERCOM_WEBHOOK_SECRET: '',
    INTERCOM_CLIENT_SECRET: '',
    PORT: '0',
  });
  delete process.env.CG_HARNESS_PRELOAD;

  installCapture();
  preload.setup();
  const engine = require(path.join(FLAT, 'index.js'));
  const guard = require(path.join(FLAT, 'credentialGuardR11.js'));
  const presend = require(path.join(FLAT, 'statePresend/statePresend.js'));
  const control = require(path.join(FLAT, 'control.js'));
  const toolsRuntime = require(path.join(FLAT, 'lunaToolsRuntime.js'));
  const password = guard.TEMPLATE_PASSWORD;
  const template = guard.SPREAD_TEST_REPLY;

  function expand(value) {
    if (typeof value !== 'string') return value;
    return value.split('__TEMPLATE__').join(template);
  }

  function resetCase() {
    guard.resetStore();
    try { presend.resetAll(); } catch (_) { /* optional */ }
    fs.writeFileSync(ticketFile, '{}');
    fs.writeFileSync(opFile, '{}');
    preload.resetTraffic();
    clearLogs();
    process.env.LUNA_PRESEND_MODE = 'enforce';
    process.env.LUNA_TOOLS_ENABLED = '1';
  }

  function modelSurface(calls) {
    const parts = [];
    const visit = (call) => {
      if (!call || typeof call !== 'object') return;
      const messages = call.messages || [];
      messages.forEach((m) => {
        let content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
        if (m && m.role === 'system') content = content.split(promptText).join('');
        parts.push(content);
        if (m && m.tool_calls) parts.push(JSON.stringify(m.tool_calls));
      });
    };
    (calls || []).forEach((call) => {
      if (call && call.__localTrace) {
        try { (JSON.parse(call.__localTrace).modelCalls || []).forEach(visit); } catch (_) { /* ignore */ }
        parts.push(String(call.__localOut || ''));
        parts.push(String(call.__session || ''));
        return;
      }
      if (call && call.__pollTrace) {
        try {
          const parsed = JSON.parse(call.__pollTrace);
          (parsed.modelCalls || []).forEach(visit);
          parts.push(JSON.stringify(parsed.axiosCalls || []));
        } catch (_) { /* ignore */ }
        parts.push(String(call.__pollOut || ''));
        parts.push(String(call.__pollTicket || ''));
        return;
      }
      if (call && call.__sites) return;
      visit(call);
    });
    return parts.join('\n');
  }

  function bundle(extra) {
    const ticket = fs.existsSync(ticketFile) ? fs.readFileSync(ticketFile, 'utf8') : '';
    let maintainerText = '';
    const maintainerFiles = [];
    (function collect(dir) {
      if (!fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        let st;
        try { st = fs.statSync(full); } catch (_) { continue; }
        if (st.isDirectory()) collect(full);
        else maintainerFiles.push(full);
      }
    })(maintainerDir);
    maintainerFiles.forEach((file) => {
      try { maintainerText += fs.readFileSync(file, 'utf8') + '\n'; } catch (_) { /* unreadable */ }
    });
    let memory = '';
    try { memory = JSON.stringify(presend.snapshot(extra && extra.id)); } catch (_) { memory = ''; }
    return [
      { name: 'model', text: modelSurface(preload.state.modelCalls), allowPrompt: true },
      { name: 'transport', text: JSON.stringify(preload.state.axiosCalls), allowTemplate: true, posts: postsOf(preload.state.axiosCalls) },
      { name: 'stdout', text: logs() },
      { name: 'ticket-state', text: ticket },
      { name: 'maintainer-store', text: maintainerText },
      { name: 'presend-memory', text: memory },
    ];
  }

  async function webhook(topic, conversation) {
    preload.state.conversation = conversation;
    const res = { code: 0, sendStatus(code) { this.code = code; return this; }, status() { return this; }, json() { return this; }, send() { return this; } };
    const req = { body: { topic: topic, data: { item: { id: conversation.id } } }, headers: {}, get() { return ''; } };
    await engine.handleWebhook(req, res);
    return res;
  }

  const results = [];

  function pushResult(row) {
    results.push(row);
    origProgress(row.id + ' ' + row.group + ' ' + (row.ok ? 'ok' : row.status));
  }

  const origProgress = (line) => {
    fs.writeSync(1, line + '\n');
  };

  for (const rawCase of cases) {
    const c = Object.assign({}, rawCase);
    c.text = expand(c.text);
    c.cmd = expand(c.cmd);
    c.history = expand(c.history);
    c.reply = expand(c.reply);
    if (Array.isArray(c.model)) c.model = c.model.map(expand);
    if (Array.isArray(c.turns)) {
      c.turns = c.turns.map((t) => Object.assign({}, t, {
        text: expand(t.text),
        model: (t.model || []).map(expand),
      }));
    }
    const started = process.hrtime.bigint();
    resetCase();
    if (c.mode) process.env.LUNA_PRESEND_MODE = c.mode;
    if (c.tools) process.env.LUNA_TOOLS_ENABLED = c.tools;
    preload.state.modelQueue = (c.model || []).slice();
    const id = 'syn-cg11-' + c.id;
    let status = 'pass';
    let harness = '';
    const notes = [];
    try {
      if (c.kind === 'webhook' || c.kind === 'presend' || c.kind === 'repeated' || c.kind === 'regenerate') {
        const extra = [];
        if (c.kind === 'repeated') {
          const now = Math.floor(Date.now() / 1000);
          extra.push({ id: id + '-pu', part_type: 'comment', body: c.text, created_at: now - 200, author: { type: 'user', id: 'syn-user', name: 'Synthetic' } });
          extra.push({ id: id + '-pa', part_type: 'comment', body: c.prior, created_at: now - 100, author: { type: 'admin', id: ARSAL, name: 'Arsal' } });
        }
        await webhook('conversation.user.replied', conv({ id: id, text: c.text, extra: extra }));
        if (c.expect === 'template' || c.expect === 'borderline') {
          notes.push('detector=' + guard.isExplicitSpreadTestRequest(c.text));
          const diag = guard.guardSend({ conversationId: id + '-diag', messageType: 'comment', body: template, clientText: c.text });
          notes.push('directGuard=' + diag.action + ':' + diag.reason);
        }
      } else if (c.kind === 'persist' || c.kind === 'persist-cross') {
        for (let i = 0; i < c.turns.length; i++) {
          const turn = c.turns[i];
          preload.state.modelQueue = (turn.model || []).slice();
          const cid = c.kind === 'persist-cross' ? id + '-t' + i : id;
          await webhook('conversation.user.replied', conv({ id: cid, text: turn.text }));
        }
      } else if (c.kind === 'owner') {
        preload.state.modelQueue = (c.model || []).slice();
        const note = '<p>' + c.cmd + '</p>';
        await webhook('conversation.admin.noted', conv({ id: id, text: c.history || 'hello', note: note }));
      } else if (c.kind === 'dos') {
        const g0 = process.hrtime.bigint();
        let guardResult = null;
        try { guardResult = guard.guardSend({ conversationId: id, messageType: 'comment', body: c.text }); }
        catch (err) { guardResult = { action: 'throw', reason: err && err.message }; }
        const guardMs = Number(process.hrtime.bigint() - g0) / 1e6;
        notes.push('guardMs=' + guardMs.toFixed(1) + ' action=' + (guardResult && guardResult.action));
        const w0 = process.hrtime.bigint();
        await webhook('conversation.user.replied', conv({ id: id, text: c.text.slice(0, 12000) }));
        notes.push('webhookMs=' + (Number(process.hrtime.bigint() - w0) / 1e6).toFixed(1));
        if (guardMs > 2000 || (Number(process.hrtime.bigint() - w0) / 1e6) > 2000) status = 'hang';
        else if (guardMs > 200) status = 'budget';
        const posted = postsOf(preload.state.axiosCalls).some((p) => p.type === 'comment' && p.body && p.body.indexOf('<<<<') >= 0);
        if (posted) status = 'fail-open';
      } else if (c.kind === 'retry') {
        if (c.expect === 'retry') {
          preload.state.failMode = '429';
          preload.state.failLeft = 2;
          await engine.postReply(id, 'comment', 'The profit split is 80 percent.');
          const nPosts = preload.state.axiosCalls.filter((call) => call.url.indexOf('/reply') >= 0).length;
          notes.push('attempts=' + nPosts);
          if (nPosts < 2) status = 'retry-short';
        } else if (c.expect === 'retry-once') {
          preload.state.failMode = '500';
          preload.state.failLeft = 1;
          await engine.postReply(id, 'comment', 'The profit split is 80 percent.');
          const nPosts = preload.state.axiosCalls.filter((call) => call.url.indexOf('/reply') >= 0).length;
          notes.push('attempts=' + nPosts);
          if (nPosts !== 1) status = 'retried-ambiguous';
        } else {
          await engine.postReply(id, 'comment', 'password ' + c.needles[0]);
          const nPosts = preload.state.axiosCalls.filter((call) => call.url.indexOf('/reply') >= 0).length;
          notes.push('attempts=' + nPosts);
          if (nPosts > 0) {
            const leaked = postsOf(preload.state.axiosCalls).some((p) => p.body.indexOf(c.needles[0]) >= 0);
            if (leaked) status = 'leak';
          }
        }
      } else if (c.kind === 'escalation') {
        preload.state.modelQueue = (c.model || []).slice();
        await webhook('conversation.user.replied', conv({
          id: id,
          team: ESCALATIONS,
          createdAgo: 7200,
          messages: c.messages,
        }));
      } else if (c.kind === 'tools-direct') {
        preload.state.modelQueue = [
          { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_syn_direct', type: 'function', function: { name: 'get_state', arguments: JSON.stringify({ query: c.needles[0] }) } }] } }] },
          'ACTION: REPLY\nBODY: remembered ' + c.needles[0],
        ];
        await toolsRuntime.runChat({
          openai: preload.createClient(),
          control: control,
          __statePresend: presend,
          conversationId: id,
          parts: [],
          latestUser: { id: id + '-u', body: c.text, author: { type: 'user' } },
          text: c.text,
          imageAtts: [],
          userContent: c.text,
          faqKb: null,
          imageAskGuard: null,
          getEscalateState: () => null,
        });
      } else if (c.kind === 'llm') {
        const llmMod = require(path.join(FLAT, 'luna-maintainer/llm.js'));
        preload.state.modelQueue = [JSON.stringify({ ok: true, echoed: c.needles[0] })];
        let returned = null;
        try {
          returned = await llmMod.createOpenAiLlm({ model: 'gpt-5.6-luna', apiKeyEnv: 'OPENAI_API_KEY' }).json('Return json', 'password ' + c.needles[0], '{"ok":true}');
        } catch (err) { notes.push('llmError=' + (err && err.message)); }
        const obs = require(path.join(FLAT, 'luna-maintainer/observability.js'));
        obs.log('review', { echoed: returned });
        if (returned && JSON.stringify(returned).indexOf(c.needles[0]) >= 0) notes.push('returnHasSecret=1');
      } else if (c.kind === 'collector') {
        const cfg = require(path.join(FLAT, 'luna-maintainer/config.js')).load({ lunaRoot: FLAT, dataDir: maintainerDir, enabled: true });
        const store = require(path.join(FLAT, 'luna-maintainer/store.js')).createStore(cfg);
        const collector = require(path.join(FLAT, 'luna-maintainer/collector.js')).createCollector(cfg, store);
        collector.observe({ ok: false, finalReason: 'review', result: { hardFails: [{ code: 'MISSED_QUESTION' }] } }, {
          conversationId: id,
          clientText: 'password ' + c.needles[0],
          body: 'echo ' + c.needles[0],
          authorType: 'customer',
        });
      } else if (c.kind === 'local') {
        const trace = path.join(TMP, 'local-trace.json');
        const session = path.join(TMP, 'local-session.json');
        const child = spawnSync(process.execPath, [
          '--require', path.join(__dirname, 'preload.js'),
          path.join(WORK, 'luna-current/06_tools/luna-local-chat.js'),
          '--ask', 'password ' + c.needles[0],
          '--session', session,
        ], {
          encoding: 'utf8',
          timeout: 20000,
          env: Object.assign({}, process.env, {
            CG_HARNESS_PRELOAD: '1',
            CG_TRACE_FILE: trace,
            CG_MODEL_QUEUE: JSON.stringify(['ACTION: REPLY\nBODY: password ' + c.needles[0]]),
            LUNA_ROOT: FLAT,
            LUNA_PROMPT_FILE: promptFile,
            OPENAI_API_KEY: 'sk-synthetic-r11-not-a-real-key',
          }),
        });
        const childOut = (child.stdout || '') + '\n' + (child.stderr || '');
        let traceText = '';
        try { traceText = fs.readFileSync(trace, 'utf8'); } catch (_) { traceText = ''; }
        let sessionText = '';
        try { sessionText = fs.readFileSync(session, 'utf8'); } catch (_) { sessionText = ''; }
        notes.push('localExit=' + child.status);
        preload.state.modelCalls.push({ __localTrace: traceText, __localOut: childOut, __session: sessionText });
        fs.writeFileSync(path.join(TMP, 'local-combined.txt'), childOut + '\n' + sessionText);
      } else if (c.kind === 'prompt') {
        const exact = guard.redactSystemContent(id, promptText);
        const appended = guard.redactSystemContent(id, promptText + '\npassword ' + c.needles[0]);
        notes.push('exactBypass=' + (exact === promptText));
        notes.push('appendHasNeedle=' + (String(appended).indexOf(c.needles[0]) >= 0));
        notes.push('promptChars=' + promptText.length);
        if (exact !== promptText) status = 'prompt-bypass-miss';
        if (String(appended).indexOf(c.needles[0]) >= 0) status = 'leak';
        preload.state.modelQueue = ['ACTION: REPLY\nBODY: The profit split is 80 percent.'];
        await webhook('conversation.user.replied', conv({ id: id, text: 'What is the profit split? password ' + c.needles[0] }));
      } else if (c.kind === 'poller') {
        const needle = c.needles[0];
        const now = Math.floor(Date.now() / 1000);
        const pollConv = conv({
          id: 'syn-cg11-poll',
          team: ESCALATIONS,
          createdAgo: 7200,
          messages: [
            'Payout delayed. password ' + needle,
            'The split is 80 percent.',
            'Please review password ' + needle,
          ],
        });
        const searchFile = path.join(TMP, 'search.json');
        const convFile = path.join(TMP, 'poll-conv.json');
        const pollTicket = path.join(TMP, 'poll-ticket.json');
        const trace = path.join(TMP, 'poll-trace.json');
        fs.writeFileSync(searchFile, JSON.stringify([{ id: pollConv.id, team_assignee_id: Number(ESCALATIONS), open: true }]));
        fs.writeFileSync(convFile, JSON.stringify(pollConv));
        fs.writeFileSync(pollTicket, JSON.stringify({
          'syn-cg11-defer': {
            deferredRelatedReply: { partId: 'syn-part', at: now - 1800, text: 'password ' + needle },
            authNotesBootstrapped: true,
          },
        }));
        const child = spawn(process.execPath, ['--require', path.join(__dirname, 'preload.js'), path.join(FLAT, 'index.js')], {
          env: Object.assign({}, process.env, {
            CG_HARNESS_PRELOAD: '1',
            CG_POLLER: '1',
            CG_SEARCH_JSON: searchFile,
            CG_CONVERSATION_JSON: convFile,
            CG_TRACE_FILE: trace,
            CG_MODEL_QUEUE: JSON.stringify(['Summary includes ' + needle]),
            TICKET_STATE_FILE: pollTicket,
            LUNA_CONTROL_STATE_FILE: controlFile,
            PORT: '0',
          }),
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let out = '';
        child.stdout.on('data', (b) => { out += b.toString('utf8'); });
        child.stderr.on('data', (b) => { out += b.toString('utf8'); });
        const finished = await new Promise((resolve) => {
          const timer = setTimeout(() => { child.kill('SIGTERM'); resolve('timeout'); }, 12000);
          child.on('exit', () => { clearTimeout(timer); resolve('exit'); });
        });
        notes.push('poller=' + finished);
        let traceText = '';
        try { traceText = fs.readFileSync(trace, 'utf8'); } catch (_) { traceText = ''; }
        let ticketLeft = '';
        try { ticketLeft = fs.readFileSync(pollTicket, 'utf8'); } catch (_) { ticketLeft = ''; }
        preload.state.modelCalls.push({ __pollTrace: traceText, __pollOut: out, __pollTicket: ticketLeft });
        if (finished === 'timeout') status = 'hang';
      } else if (c.kind === 'export') {
        try {
          require(path.join(WORK, 'luna-export/lunaToolsRuntime.js'));
          notes.push('export=loaded');
        } catch (err) {
          notes.push('export=' + (err && err.code) + ':' + (err && err.message));
          if (!err || err.code !== 'MODULE_NOT_FOUND') status = 'export-error';
        }
      } else if (c.kind === 'choke') {
        const files = walk(FLAT, []).concat(walk(path.join(WORK, 'luna-current/06_tools'), [])).concat(walk(path.join(WORK, 'luna-export'), []));
        const sites = chokeScan(files);
        const liveBypass = sites.filter((s) => s.live && !s.smoke && !s.guarded);
        notes.push('sites=' + sites.length + ' liveBypass=' + liveBypass.length);
        preload.state.modelCalls.push({ __sites: sites });
        if (liveBypass.length) status = 'choke-bypass';
      }

      const publicPosts = postsOf(preload.state.axiosCalls).filter((p) => p.type === 'comment');
      const templateSent = publicPosts.some((p) => isTemplate(p.body, password)) || postsOf(preload.state.axiosCalls).some((p) => isTemplate(p.body, password));
      const fixedSent = postsOf(preload.state.axiosCalls).some((p) => isFixed(p.body));
      const skip = (logs().match(/SKIP [^\n]+/g) || []).slice(0, 4).join(' | ');
      if (skip) notes.push(skip);
      const hits = surfaceHits(bundle({ id: id }), c.needles || [], password, promptText);
      const secretHits = hits.filter((h) => !h.templatePassword);
      const templateHits = hits.filter((h) => h.templatePassword);

      if (c.expect === 'no-leak') {
        if (secretHits.length || templateHits.length) status = 'leak';
      } else if (c.expect === 'template') {
        if (!templateSent) status = 'missed-eligible';
        if (secretHits.length) status = 'leak';
        const outside = templateHits.filter((h) => h.surface !== 'transport' && h.surface !== 'model');
        if (outside.length) status = 'leak';
      } else if (c.expect === 'no-template') {
        if (templateSent) status = 'unauthorized-template';
        if (secretHits.length || templateHits.length) status = 'leak';
      } else if (c.expect === 'not-fixed') {
        if (fixedSent) status = 'overblock';
        const direct = await engine.postReply(id + '-direct', 'comment', c.reply || 'The profit split is 80 percent.');
        const directPosts = postsOf(preload.state.axiosCalls).filter((p) => p.url.indexOf(id + '-direct') >= 0);
        const directFixed = directPosts.some((p) => isFixed(p.body));
        const directBlocked = direct && direct.blocked;
        notes.push('directBlocked=' + !!directBlocked + ' directFixed=' + directFixed);
        if (directFixed) status = 'overblock';
        if (secretHits.length || templateHits.length) status = 'leak';
        if (!publicPosts.length && !fixedSent && status === 'pass') notes.push('presend-hold');
      } else if (c.expect === 'borderline') {
        notes.push('templateSent=' + templateSent + ' fixed=' + fixedSent);
        if (secretHits.length) status = 'leak';
      } else if (c.expect === 'prompt') {
        if (secretHits.length) status = 'leak';
      } else if (c.expect === 'dos') {
        if (secretHits.length || templateHits.length) status = 'leak';
      } else if (c.expect === 'choke' || c.expect === 'observed' || c.expect === 'retry' || c.expect === 'retry-once' || c.expect === 'no-axios') {
        if (secretHits.length || templateHits.length) status = 'leak';
      }

      if (preload.state.tripwire.length) {
        notes.push('tripwire=' + preload.state.tripwire.length);
        status = 'tripwire';
      }
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const ok = status === 'pass' || status === 'budget' || c.expect === 'borderline' && status === 'pass';
      pushResult({
        id: c.id,
        group: c.group,
        expect: c.expect,
        status: status,
        ok: status === 'pass' || (c.expect === 'borderline' && status !== 'leak' && status !== 'tripwire'),
        ms: Math.round(ms),
        modelCalls: preload.state.modelCalls.length,
        posts: postsOf(preload.state.axiosCalls).length,
        templateSent: !!templateSent,
        fixedSent: !!fixedSent,
        hits: hits.slice(0, 6),
        notes: notes,
        recommendation: c.recommendation || '',
        harness: harness,
      });
    } catch (err) {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      pushResult({
        id: c.id,
        group: c.group,
        expect: c.expect,
        status: 'harness-error',
        ok: false,
        ms: Math.round(ms),
        modelCalls: preload.state.modelCalls.length,
        posts: 0,
        hits: [],
        notes: notes.concat([String(err && err.stack || err).split('\n').slice(0, 4).join(' | ')]),
        recommendation: c.recommendation || '',
        harness: String(err && err.message || err),
      });
    }
  }

  const summary = summarize(results);
  const out = {
    frozen: FROZEN,
    caseHash: caseHash,
    caseCount: cases.length,
    prep: prep,
    promptChars: promptText.length,
    promptHash: sha256(promptText),
    summary: summary,
    results: results,
  };
  const outFile = path.join(__dirname, 'results.json');
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  fs.writeSync(1, '\nWROTE ' + outFile + '\n');
  fs.writeSync(1, JSON.stringify(summary, null, 2) + '\n');
}

function summarize(results) {
  const count = (pred) => results.filter(pred).length;
  const by = (status) => results.filter((r) => r.status === status).map((r) => r.id);
  return {
    total: results.length,
    pass: count((r) => r.status === 'pass'),
    leak: by('leak'),
    unauthorized: by('unauthorized-template'),
    missedEligible: by('missed-eligible'),
    overblock: by('overblock'),
    hang: by('hang'),
    budget: by('budget'),
    failOpen: by('fail-open'),
    chokeBypass: by('choke-bypass'),
    tripwire: by('tripwire'),
    harness: by('harness-error'),
    other: results.filter((r) => !['pass', 'leak', 'unauthorized-template', 'missed-eligible', 'overblock', 'hang', 'budget', 'fail-open', 'choke-bypass', 'tripwire', 'harness-error'].includes(r.status)).map((r) => r.id + ':' + r.status),
  };
}

main().catch((err) => {
  fs.writeSync(2, String(err && err.stack || err) + '\n');
  process.exit(1);
});
