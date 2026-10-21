'use strict';

/**
 * Synthetic corpus, recovery, and rollback runner for Fixed-Message Handoff R10.
 * Recording axios adapter, stub model, network tripwire. No production host.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const REPO = process.env.REPO_ROOT || '/workspace';
const R9 = '9fb86f70d37cc353183703de25e0cc69fcefbcd0';
const NODE_PATH = process.env.LUNA_NODE_PATH || '/tmp/luna-deps/node_modules';
const ARSAL = '10118526';
const ELITE = '8052954';
const JERRY = '8053416';
const HUMAN = '900002';
const SEAT = '900001';
const SUPPORT = 9629780;
const TOKEN = 'synthetic-regression-token';
const FIXED = [
  'A teammate now has this conversation.',
  'یہ گفتگو اب ایک ساتھی کے پاس ہے۔',
  'هذه المحادثة الآن لدى أحد الزملاء.',
  'यह बातचीत अब एक साथी के पास है।',
  'Un collega ha ora questa conversazione.',
];
const CLARIFY = "I don't have an open update on this conversation. What would you like me to check?";
const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const SPREAD_MARK = 'TEST SPREAD ACCOUNT DETAILS';

if (process.argv[2] === '--worker') {
  runWorker().catch((err) => {
    process.stderr.write('WORKER_FATAL ' + (err && err.stack ? err.stack : err) + '\n');
    process.exit(1);
  });
} else {
  main().catch((err) => {
    process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
    process.exit(1);
  });
}

function sha(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function strip(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function preview(body) {
  const text = String(body || '');
  if (text.includes(SPREAD_MARK) || /password\s*:/i.test(text)) return '[redacted-template-or-credential-body]';
  return strip(text).slice(0, 240);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

async function runWorker() {
  const root = process.argv[3];
  const spec = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  const dir = process.argv[5];
  const phase = Number(process.argv[6] || 0);
  const runtime = path.join(root, 'luna-current/01_runtime');
  const convId = 'conv-' + spec.id;

  for (const key of Object.keys(process.env)) {
    if (/INTERCOM|OPENAI|SECRET|TOKEN|PASSWORD|API_KEY/i.test(key)) delete process.env[key];
  }
  process.env.INTERCOM_ACCESS_TOKEN = TOKEN;
  process.env.OPENAI_API_KEY = 'sk-synthetic-regression';
  process.env.LUNA_CONTROL_STATE_FILE = path.join(dir, 'control.json');
  process.env.LUNA_PROMPT_FILE = path.join(runtime, 'system-prompt.txt');
  process.env.LUNA_OP_STORE_FILE = path.join(dir, 'ops.json');
  process.env.TICKET_STATE_FILE = path.join(dir, 'tickets.json');
  process.env.MENTION_ROTATE_FILE = path.join(dir, 'rotate.json');
  process.env.FUNDEDELITE_FAQ_PATH = path.join(runtime, 'fundedelite-faqs.md');
  process.env.LUNA_TOOLS_ENABLED = '0';
  process.env.MAINTAINER_ENABLED = 'false';
  process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';
  process.env.LUNA_PRESEND_MODE = 'enforce';
  // NODE_PATH is set on the spawned process. Do not re-init module paths here.

  if (phase === 0 && !spec.keepState) {
    writeJson(process.env.LUNA_CONTROL_STATE_FILE, {
      paused: false,
      pausedUntil: null,
      aiOff: {},
      testMode: false,
      testAllowNames: ['Casey Client'],
      testAllowConversationIds: [],
      config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
    });
    writeJson(process.env.TICKET_STATE_FILE, {});
    writeJson(process.env.MENTION_ROTATE_FILE, { recent: [] });
    if (fs.existsSync(process.env.LUNA_OP_STORE_FILE)) fs.unlinkSync(process.env.LUNA_OP_STORE_FILE);
  }

  const convo = phase > 0 && fs.existsSync(path.join(dir, 'convo.json'))
    ? readJson(path.join(dir, 'convo.json'), null)
    : buildConversation(spec, convId);
  if (phase > 0 && spec.secondText && !convo.__secondPushed) {
    pushUser(convo, spec.secondText);
    convo.__secondPushed = true;
  }
  writeJson(path.join(dir, 'convo.json'), convo);

  const attempts = Object.create(null);
  const writeLog = readJson(path.join(dir, 'writes.json'), []);
  let seenOps = new Set(Object.keys(readJson(process.env.LUNA_OP_STORE_FILE, {})));
  const records = readJson(path.join(dir, 'records.json'), []);
  let exitAfterWebhook = false;
  let assignBeforeNote = false;

  function persist() {
    writeJson(path.join(dir, 'convo.json'), convo);
    writeJson(path.join(dir, 'writes.json'), writeLog);
    writeJson(path.join(dir, 'records.json'), records);
  }

  function installTripwire() {
    const http = require('http');
    const https = require('https');
    const net = require('net');
    const dns = require('dns');
    function boom(name) {
      return function () {
        const err = new Error('NETWORK_TRIPWIRE ' + name);
        err.code = 'NETWORK_TRIPWIRE';
        throw err;
      };
    }
    http.request = boom('http.request');
    http.get = boom('http.get');
    https.request = boom('https.request');
    https.get = boom('https.get');
    net.connect = boom('net.connect');
    net.createConnection = boom('net.createConnection');
    dns.lookup = function (host, opts, cb) {
      const err = new Error('NETWORK_TRIPWIRE dns ' + host);
      err.code = 'NETWORK_TRIPWIRE';
      if (typeof opts === 'function') return opts(err);
      if (typeof cb === 'function') return cb(err);
      throw err;
    };
    global.fetch = boom('fetch');
    let tripped = false;
    try {
      http.request();
    } catch (err) {
      tripped = !!(err && err.code === 'NETWORK_TRIPWIRE');
    }
    return tripped;
  }

  const tripped = installTripwire();
  const Module = require('module');
  const orig = Module.prototype.require;
  const modelState = { calls: 0 };
  Module.prototype.require = function (id) {
    if (id === 'openai') {
      return class OpenAI {
        constructor() {
          this.chat = {
            completions: {
              create: async () => {
                modelState.calls += 1;
                const next = spec.draft == null ? '' : String(spec.draft);
                return { choices: [{ message: { content: next ? 'ACTION: REPLY\nBODY: ' + next : '' } }] };
              },
            },
          };
        }
      };
    }
    return orig.apply(this, arguments);
  };

  const axios = require('axios');
  axios.defaults.adapter = async function recordingAdapter(config) {
    const method = String(config.method || 'get').toLowerCase();
    const url = String(config.url || '');
    let bytes = '';
    if (config.data == null) bytes = '';
    else if (Buffer.isBuffer(config.data)) bytes = config.data.toString('utf8');
    else bytes = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
    const host = safeHost(url);
    const rec = {
      phase,
      method,
      host,
      messageType: '',
      status: 0,
      threw: false,
      bodySha: '',
      bodyPreview: '',
      unexpectedHost: '',
    };
    if (host && host !== 'api.intercom.io' && host !== 'faq.fundedelite.com') rec.unexpectedHost = host;
    if (method === 'get' && /\/admins\/?$/.test(url)) {
      rec.status = 200;
      records.push(rec);
      const data = {
        admins: [
          {
            id: SEAT,
            name: 'Ada Seat',
            email: 'ada.seat@example.test',
            has_inbox_seat: true,
            away_mode_enabled: false,
            team_ids: [SUPPORT],
          },
        ],
      };
      return { data, status: 200, statusText: 'OK', headers: {}, config };
    }
    if (method === 'get' && /\/admins\//.test(url)) {
      rec.status = 200;
      records.push(rec);
      return { data: { id: HUMAN, name: 'Nia Reviewer', email: 'nia@example.test' }, status: 200, statusText: 'OK', headers: {}, config };
    }
    if (method === 'get' && /\/conversations\//.test(url)) {
      rec.status = 200;
      records.push(rec);
      return { data: convo, status: 200, statusText: 'OK', headers: {}, config };
    }
    if (host === 'faq.fundedelite.com') {
      rec.status = 403;
      records.push(rec);
      return { data: '', status: 403, statusText: 'blocked', headers: {}, config };
    }
    let body = null;
    try {
      body = bytes ? JSON.parse(bytes) : null;
    } catch (_) {
      body = null;
    }
    const messageType = body && body.message_type ? String(body.message_type) : '';
    rec.messageType = messageType;
    rec.bodySha = sha(body && body.body ? body.body : '');
    rec.bodyPreview = preview(body && body.body ? body.body : '');
    const nowKeys = Object.keys(readJson(process.env.LUNA_OP_STORE_FILE, {}));
    const fresh = nowKeys.filter((key) => !seenOps.has(key));
    fresh.forEach((key) => seenOps.add(key));
    const noteDone = writeLog.some((w) => w.messageType === 'note');
    const assignDone = writeLog.some((w) => w.messageType === 'assignment');
    // Kill before this write is sent. Drop the pending op key icRequest just stored
    // so the restarted process can still perform the write.
    if (
      (phase === 0 && spec.crash === 'assign-before-note' && messageType === 'assignment' && !noteDone) ||
      (phase === 0 && spec.crash === 'after-note' && messageType === 'assignment' && noteDone) ||
      (phase === 0 && spec.crash === 'after-assign' && messageType === 'comment' && assignDone)
    ) {
      if (spec.crash === 'assign-before-note') assignBeforeNote = true;
      if (spec.mutateOnCrash === 'drop-note') dropNote(convo, writeLog);
      forgetOps(fresh);
      rec.status = 0;
      rec.bodyPreview = '[killed-before-send]';
      records.push(rec);
      persist();
      process.exit(70);
    }
    if (messageType) writeLog.push({ phase, messageType, keys: fresh });

    const mode = writeMode(spec, messageType, attempts);
    if (mode === 'timeout') {
      rec.threw = true;
      rec.status = 0;
      records.push(rec);
      persist();
      const err = new Error('timeout of 20000ms exceeded');
      err.code = 'ECONNABORTED';
      throw err;
    }
    const scripted = scriptResponse(mode, messageType, body);
    rec.status = scripted.status;
    if (scripted.status >= 200 && scripted.status < 300 && mode === 'ok') {
      mirror(convo, messageType, body, scripted.data);
    }
    records.push(rec);
    persist();
    if (phase === 0 && spec.crash === 'after-line' && messageType === 'comment' && scripted.status >= 200 && scripted.status < 300) {
      exitAfterWebhook = true;
    }
    return { data: scripted.data, status: scripted.status, statusText: 'OK', headers: {}, config };
  };

  process.chdir(runtime);
  const engine = require(path.join(runtime, 'index.js'));
  const deliveries = phase === 0 ? Number(spec.deliveries || 1) : 1;
  let thrown = '';
  for (let i = 0; i < deliveries; i += 1) {
    const topic = spec.topic || 'conversation.user.replied';
    const req = { body: { topic, data: { item: { id: convId, type: 'conversation' } } }, get() { return ''; } };
    const res = {
      statusCode: 0,
      sendStatus(code) {
        this.statusCode = code;
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(v) {
        this.body = v;
        return this;
      },
    };
    try {
      await engine.handleWebhook(req, res);
    } catch (err) {
      thrown = String(err && err.stack ? err.stack : err).slice(0, 800);
      break;
    }
  }
  persist();
  if (phase === 0 && spec.crash === 'after-webhook') process.exit(70);
  if (exitAfterWebhook) process.exit(70);

  const ticket = readJson(process.env.TICKET_STATE_FILE, {});
  const state = (ticket[convId] && ticket[convId].state) || (ticket[convId] || {});
  const judged = judgeRecords(records);
  const result = {
    id: spec.id,
    group: spec.group,
    kind: spec.kind || 'corpus',
    phase,
    done: true,
    tripwire: tripped,
    modelCalls: modelState.calls,
    thrown,
    assignBeforeNote,
    writeOrder: writeLog.map((w) => w.messageType),
    publicSha: judged.publicSha,
    publicPreview: judged.publicPreview,
    comment2xx: judged.comment2xx,
    fixed2xx: judged.fixed2xx,
    verifiedAssignment2xx: judged.verifiedAssignment2xx,
    fixedBeforeVerified: judged.fixedBeforeVerified,
    note2xx: judged.note2xx,
    unexpectedHost: judged.unexpectedHost,
    hold: holdOf(state),
    progress: state.fixedHandoff || null,
  };
  process.stdout.write('RESULT ' + JSON.stringify(result) + '\n');
}

function forgetOps(keys) {
  const opsPath = process.env.LUNA_OP_STORE_FILE;
  const ops = readJson(opsPath, {});
  for (const key of keys || []) delete ops[key];
  writeJson(opsPath, ops);
}

function dropNote(convo, writeLog) {
  const parts = convo.conversation_parts.conversation_parts;
  convo.conversation_parts.conversation_parts = parts.filter((part) => part.part_type !== 'note');
  const opsPath = process.env.LUNA_OP_STORE_FILE;
  const ops = readJson(opsPath, {});
  for (const row of writeLog) {
    if (row.messageType !== 'note') continue;
    for (const key of row.keys || []) delete ops[key];
  }
  writeJson(opsPath, ops);
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch (_) {
    return '';
  }
}

function writeMode(spec, messageType, attempts) {
  const table = spec.writes || {};
  let mode = 'ok';
  if (messageType === 'note') mode = table.note || 'ok';
  else if (messageType === 'assignment') mode = table.assignment || 'ok';
  else if (messageType === 'comment') mode = table.comment || 'ok';
  const key = messageType || 'other';
  attempts[key] = (attempts[key] || 0) + 1;
  if (mode === '429-then-ok') return attempts[key] === 1 ? '429' : 'ok';
  return mode;
}

function scriptResponse(mode, messageType, body) {
  if (mode === '500') return { status: 500, data: { id: 'e500', type: 'conversation' } };
  if (mode === '429') return { status: 429, data: { type: 'error.list', errors: [{ code: 'rate_limit', message: 'slow' }] } };
  if (mode === '422') return { status: 422, data: { type: 'error.list', errors: [{ code: 'invalid', message: 'no' }] } };
  const data = {
    id: 'ok-' + String(messageType || 'x'),
    type: 'conversation',
    conversation_parts: {
      conversation_parts: [
        {
          part_type: messageType === 'note' ? 'note' : messageType === 'assignment' ? 'assignment' : 'comment',
          body: (body && body.body) || '',
          author: { id: ARSAL, type: 'admin' },
        },
      ],
    },
  };
  if (messageType === 'assignment') data.admin_assignee_id = String((body && body.assignee_id) || '');
  return { status: 200, data };
}

function mirror(convo, messageType, body, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  const parts = convo.conversation_parts.conversation_parts;
  const at = Math.floor(Date.now() / 1000);
  if (messageType === 'assignment') {
    convo.admin_assignee_id = data.admin_assignee_id;
    parts.push({
      id: 'mir-asg-' + parts.length,
      part_type: 'assignment',
      body: '',
      created_at: at,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      assigned_to: { id: String(data.admin_assignee_id || ''), type: 'admin' },
    });
    return;
  }
  if (messageType === 'note' || messageType === 'comment') {
    parts.push({
      id: 'mir-' + messageType + '-' + parts.length,
      part_type: messageType,
      body: (body && body.body) || '',
      created_at: at,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    });
  }
}

function buildConversation(spec, convId) {
  const now = Math.floor(Date.now() / 1000);
  const created = now - Number(spec.ageSec == null ? 400 : spec.ageSec);
  const assignee = spec.assignee === 'human' ? HUMAN : spec.assignee === 'jerry' ? JERRY : ARSAL;
  const parts = [
    {
      id: 'part-user-0',
      part_type: 'comment',
      body: spec.text || '',
      created_at: created + 10,
      author: { type: 'user', id: 'user-1', name: 'Casey Client', email: 'casey@example.test' },
    },
  ];
  return {
    type: 'conversation',
    id: convId,
    created_at: created,
    updated_at: now,
    open: true,
    state: 'open',
    admin_assignee_id: assignee,
    team_assignee_id: 0,
    source: {
      body: spec.text || '',
      created_at: created,
      author: { type: 'user', id: 'user-1', name: 'Casey Client', email: 'casey@example.test' },
    },
    contacts: { contacts: [{ id: 'user-1', name: 'Casey Client', email: 'casey@example.test' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function pushUser(convo, text) {
  convo.conversation_parts.conversation_parts.push({
    id: 'part-user-2',
    part_type: 'comment',
    body: text,
    created_at: Math.floor(Date.now() / 1000),
    author: { type: 'user', id: 'user-1', name: 'Casey Client', email: 'casey@example.test' },
  });
}

function judgeRecords(records) {
  const posts = records.filter((r) => r.method === 'post' && r.messageType);
  const comments = posts.filter((r) => r.messageType === 'comment' && r.status >= 200 && r.status < 300 && !r.threw);
  let verified = false;
  let fixedBeforeVerified = false;
  let fixed2xx = 0;
  for (const rec of posts) {
    if (rec.messageType === 'assignment' && rec.status >= 200 && rec.status < 300 && !rec.threw) {
      verified = true;
    }
    if (rec.messageType === 'comment' && rec.status >= 200 && rec.status < 300 && !rec.threw) {
      const plain = rec.bodyPreview;
      if (FIXED.some((line) => plain.includes(line))) {
        fixed2xx += 1;
        if (!verified) fixedBeforeVerified = true;
      }
    }
  }
  const publicPreview = comments.map((r) => r.bodyPreview);
  const publicSha = sha(comments.map((r) => r.bodySha).join('|'));
  return {
    publicSha,
    publicPreview,
    comment2xx: comments.length,
    fixed2xx,
    verifiedAssignment2xx: posts.filter((r) => r.messageType === 'assignment' && r.status >= 200 && r.status < 300).length,
    fixedBeforeVerified,
    note2xx: posts.filter((r) => r.messageType === 'note' && r.status >= 200 && r.status < 300).length,
    unexpectedHost: posts.map((r) => r.unexpectedHost).filter(Boolean),
  };
}

function holdOf(state) {
  const prog = state && state.fixedHandoff;
  if (!prog || typeof prog !== 'object') return false;
  if (prog.noteAmbiguous || prog.assignAmbiguous || prog.messageAmbiguous) return true;
  if (prog.phase === 'assignment-pending' || prog.phase === 'completed') return true;
  if (prog.noteConfirmed && !prog.messageSent) return true;
  if (prog.assignConfirmed && !prog.messageSent) return true;
  return false;
}

function answer(text) {
  return (
    'About "' +
    text.replace(/"/g, "'") +
    '": the FAQ covers this. Please go back to the dashboard if you need help. The team can point you to the right challenge.'
  );
}

function corpusCases() {
  const faq = [
    'What is the daily loss limit?',
    'What is the profit target?',
    'What is the drawdown?',
    'How many trading days are required?',
    'Is an EA allowed?',
    'Is news trading allowed?',
    'What is the catalyst challenge?',
    'What is the leverage?',
    'What is the difference between lite and standard?',
    'What happens if I violate the rules?',
    'What are the general rules?',
    'What is FundedElite?',
    'Can I use an expert advisor?',
    'Where is your company based?',
    'How can I pay for the challenge?',
    'Does FundedElite operate under regulation?',
    'How do I handle my taxes?',
    'What is the refund policy?',
    'Are the accounts swap free?',
    'Am I being funded with real money?',
    'How many accounts can I have with FundedElite?',
    'What time is the dashboard clock based on?',
    'Do you copy trades to live funds?',
    'Are there any hidden rules?',
    'How does the challenge evaluation work?',
    'What documentation is required for verification?',
    'Is Funded Elite a broker?',
    'Can I access a free trial of Funded Elite?',
    'How does Funded Elite ensure the security of my personal and financial information?',
    'What is a Trading Challenge or evaluation?',
    'What is the second chance and how does it work?',
    'Are there restricted countries?',
    'What is the consistency rule?',
    'How does the 2-step challenge work?',
    'How does the 1-step challenge work?',
    'What is the lite challenge?',
    'What is the instant challenge?',
    'What happens after I pass the challenge?',
  ];
  const payout = [
    'How do payouts work?',
    'What is the minimum payout?',
    'How long do payouts take?',
    'What is the payout schedule?',
    'What is the profit split?',
    'Are there payout limitations on different account types?',
    'How are crypto payouts handled?',
    'What is the first profit split on an instant funded account?',
    'What if a payout is rejected?',
    'Can I change my profit split?',
    'When is the first payout?',
    'Is there a withdrawal limit?',
    'Do payouts go through Rise?',
    'What fees apply to a payout?',
    'How do I request a payout?',
    'What happens after I request a payout?',
    'Which payout methods are available?',
    'my payout was rejected',
    'where is my payout',
    'I am still waiting on my payout',
  ];
  const spread = [
    'Can I get the MT5 spread test account?',
    'How do I check spreads on MT5?',
    'What is the spread test server?',
    'Please share the MT5 test login for spreads',
    'I want to compare spreads',
    'spread test account please',
    'How can I see the spreads?',
    'What server do I use to test spreads?',
    'Can you show the spread check account?',
    'I need the metatrader test account for spreads',
    'How do I inspect spreads?',
    'Please give me the spread test',
    'This is not about spreads. What is the daily loss limit?',
    'My positions are spread across two accounts. What is the daily loss limit?',
    'What is the password policy for my own login, not a spread test?',
  ];
  const partnership = [
    'How can I join the Funded Elite Affiliate Program?',
    'Are there any promotional materials available for affiliates?',
    'What advertising methods are prohibited for affiliates?',
    'When are affiliate commissions paid?',
    'How do affiliate commissions work?',
    'Can I promote my affiliate link on social media?',
    'What is the affiliate program?',
    'Are Google Ads allowed for affiliates?',
    'How do I get my affiliate link?',
    'Can I offer a discount as an affiliate?',
    'What are the affiliate rules?',
    'Do affiliates earn commission on challenge purchases?',
    'How do I share my referral link?',
    'Is there an affiliate dashboard?',
    'Can I use a blog to promote FundedElite?',
  ];
  const silence = [
    'What is the daily loss limit?',
    'How do payouts work?',
    'Can I get the MT5 spread test account?',
    'How can I join the Funded Elite Affiliate Program?',
    'I want to speak to a live agent',
    'any update?',
    'hello',
    'my payout was rejected',
    'What is the profit target?',
    'Please check spreads',
    'Are you a bot or a real person?',
    'What are the affiliate rules?',
    'status?',
    'I want to speak to a human',
    'How long do payouts take?',
    'Is news trading allowed?',
    'thanks',
    'Which challenge has a free retry?',
    'What is the leverage?',
    'I am still waiting on my payout',
  ];
  const cases = [];
  function add(group, text, extra) {
    const id = group + '-' + (cases.filter((c) => c.group === group).length + 1);
    cases.push(Object.assign({
      id,
      group,
      kind: 'corpus',
      text,
      draft: extra && Object.prototype.hasOwnProperty.call(extra, 'draft') ? extra.draft : answer(text),
      assignee: extra && extra.assignee ? extra.assignee : 'arsal',
      ageSec: 400,
    }, extra || {}));
  }
  for (const text of faq) add('faq', text);
  for (const text of payout) add('payout', text);
  for (const text of spread) add('spread', text, { draft: 'I can help with that question.' });
  for (const text of partnership) add('partnership', text);
  for (const text of silence) add('silence', text, { assignee: 'human', draft: answer(text) });
  add('faq', 'What is the daily loss limit?', { id: 'faq-empty-model', draft: '' });
  add('faq', 'What is the daily loss limit?', {
    id: 'faq-team-review',
    draft: 'The team will review the daily loss limit and write back.',
  });
  add('payout', 'my payout was rejected', {
    id: 'payout-team-review-personal',
    draft: 'The team will review this payout and write back.',
  });
  add('faq', 'any update?', { id: 'faq-status-ping', draft: answer('any update?') });
  add('faq', 'My password: back. What is the leverage?', {
    id: 'faq-password-back',
    draft: 'You can go back to the dashboard. The leverage depends on the challenge.',
  });
  return cases;
}

function recoveryCases() {
  const handoff = 'I want to speak to a live agent';
  const base = { kind: 'recovery', group: 'recovery', text: handoff, draft: 'A person will join.', assignee: 'arsal', ageSec: 400 };
  const row = (id, extra) => Object.assign({ id }, base, extra);
  return [
    row('rec-crash-after-note', { crash: 'after-note' }),
    row('rec-crash-after-assign', { crash: 'after-assign' }),
    row('rec-crash-after-line', { crash: 'after-line' }),
    row('rec-assign-before-note', { crash: 'assign-before-note' }),
    row('rec-drop-note-keep-assignment', { crash: 'after-assign', mutateOnCrash: 'drop-note' }),
    row('rec-wipe-op-after-assign', { crash: 'after-assign', then: 'wipe-op' }),
    row('rec-corrupt-op-after-assign', { crash: 'after-assign', then: 'corrupt-op' }),
    row('rec-wipe-parts-and-op', { crash: 'after-assign', then: 'wipe-parts-and-op' }),
    row('rec-duplicate-delivery', { deliveries: 2 }),
    row('rec-replay-after-line', { crash: 'after-line' }),
    row('rec-429-note', { writes: { note: '429-then-ok' } }),
    row('rec-429-assign', { writes: { assignment: '429-then-ok' } }),
    row('rec-429-comment', { writes: { comment: '429-then-ok' } }),
    row('rec-429-all', { writes: { note: '429-then-ok', assignment: '429-then-ok', comment: '429-then-ok' } }),
    row('rec-429-exhausted-note', { writes: { note: '429' } }),
    row('rec-500-note', { writes: { note: '500' } }),
    row('rec-500-assign', { writes: { assignment: '500' } }),
    row('rec-500-comment', { writes: { comment: '500' } }),
    row('rec-timeout-note', { writes: { note: 'timeout' } }),
    row('rec-timeout-assign', { writes: { assignment: 'timeout' } }),
    row('rec-timeout-comment', { writes: { comment: 'timeout' } }),
    row('rec-human-silence-restart', {
      crash: 'after-webhook',
      assignee: 'human',
      text: 'What is the daily loss limit?',
      secondText: 'How do payouts work?',
      silence: true,
    }),
    row('rec-human-silence-live-agent', {
      crash: 'after-webhook',
      assignee: 'human',
      text: 'I want to speak to a live agent',
      secondText: 'any update?',
      silence: true,
    }),
  ];
}

function prepareRoot(label, src, restore) {
  const dest = path.join('/tmp/rr-roots', label);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.join(dest, 'luna-current'), { recursive: true });
  fs.cpSync(path.join(src, 'luna-current/01_runtime'), path.join(dest, 'luna-current/01_runtime'), { recursive: true });
  fs.cpSync(path.join(src, 'luna-current/02_statePresend'), path.join(dest, 'luna-current/02_statePresend'), { recursive: true });
  if (restore) {
    for (const rel of [
      'luna-current/01_runtime/fixedMessageHandoff.js',
      'luna-current/01_runtime/index.js',
      'luna-current/02_statePresend/credentialSanitizer.js',
      'luna-current/02_statePresend/targetedRegeneration.js',
    ]) {
      const shown = spawnSync('git', ['show', R9 + ':' + rel], { cwd: REPO, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
      if (shown.status !== 0) throw new Error('git show failed for ' + rel);
      fs.writeFileSync(path.join(dest, rel), shown.stdout);
    }
  }
  fs.cpSync(path.join(dest, 'luna-current/02_statePresend'), path.join(dest, 'luna-current/01_runtime/statePresend'), { recursive: true });
  return dest;
}

function restoreHashes(root) {
  const files = [
    'luna-current/01_runtime/fixedMessageHandoff.js',
    'luna-current/01_runtime/index.js',
    'luna-current/02_statePresend/credentialSanitizer.js',
    'luna-current/02_statePresend/targetedRegeneration.js',
  ];
  return files.map((rel) => {
    const got = sha(fs.readFileSync(path.join(root, rel)));
    const want = sha(fs.readFileSync(path.join('/tmp/trees/r9', rel)));
    return { rel, ok: got === want };
  });
}

function runPhase(root, spec, dir, phase) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [__filename, '--worker', root, path.join(dir, 'spec.json'), dir, String(phase)], {
      env: Object.assign({}, process.env, { NODE_PATH }),
      cwd: '/tmp',
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 90000);
    child.stdout.on('data', (buf) => {
      out += buf.toString();
    });
    child.stderr.on('data', (buf) => {
      err += buf.toString();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const line = out.split(/\n/).filter((row) => row.startsWith('RESULT ')).pop();
      let result = null;
      if (line) {
        try {
          result = JSON.parse(line.slice(7));
        } catch (_) {
          result = null;
        }
      }
      resolve({ code, result, err: err.slice(-1500) });
    });
  });
}

function mutate(dir, kind) {
  const ops = path.join(dir, 'ops.json');
  const convoPath = path.join(dir, 'convo.json');
  if (kind === 'wipe-op') {
    if (fs.existsSync(ops)) fs.unlinkSync(ops);
    return;
  }
  if (kind === 'corrupt-op') {
    fs.writeFileSync(ops, '{{{');
    return;
  }
  if (kind === 'wipe-parts-and-op') {
    if (fs.existsSync(ops)) fs.unlinkSync(ops);
    const convo = readJson(convoPath, null);
    if (!convo) return;
    const parts = convo.conversation_parts.conversation_parts.filter((part) => {
      const author = (part.author || {}).type;
      return author === 'user' || author === 'lead';
    });
    convo.conversation_parts.conversation_parts = parts;
    convo.admin_assignee_id = ARSAL;
    writeJson(convoPath, convo);
  }
}

async function execute(root, spec) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-'));
  writeJson(path.join(dir, 'spec.json'), spec);
  const phases = [];
  let phase = 0;
  while (phase < 4) {
    const run = await runPhase(root, spec, dir, phase);
    phases.push({ phase, code: run.code, err: run.err, result: run.result });
    if (run.code === 70) {
      if (phase === 0 && spec.then) mutate(dir, spec.then);
      phase += 1;
      continue;
    }
    if (run.code === 0 && run.result) {
      run.result.phases = phases.map((row) => ({ phase: row.phase, code: row.code }));
      run.result.workerErr = phases.map((row) => row.err).filter(Boolean).slice(-1)[0] || '';
      return run.result;
    }
    return {
      id: spec.id,
      group: spec.group,
      kind: spec.kind,
      done: false,
      error: 'worker-exit-' + run.code,
      workerErr: run.err,
      phases: phases.map((row) => ({ phase: row.phase, code: row.code })),
    };
  }
  return { id: spec.id, group: spec.group, kind: spec.kind, done: false, error: 'phase-loop', phases };
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function explainR10Only(spec, previews, detectors) {
  const r10 = (previews.r10 || []).join(' | ');
  const r9 = (previews.r9 || []).join(' | ');
  const text = spec.text || '';
  const draft = spec.draft || '';
  const status = detectors.isStatusPing(text);
  const faq = detectors.isClearKbFaqAsk(text);
  const team = detectors.faqTeamReviewBlocked(text, draft);
  if (r10.includes(CLARIFY) && status && !faq) return 'OK: R10 class 3 idle status ping. The customer text matches isStatusPing and is not a clear KB FAQ.';
  if (r10.includes(CLARIFY) && status && faq) {
    return 'UNJUSTIFIED: R10 class 3 status-ping early return also matches this KB FAQ, so the FAQ answer is replaced by the idle clarify line.';
  }
  if (spec.draft === '' && faq && /Which challenge/.test(r10) && !/Which challenge/.test(r9)) {
    return 'OK: R10 class 3 empty model body on a plain KB FAQ posts the FAQ clarifier instead of the presend handoff.';
  }
  if (team && faq && !/\bmy\s+(?:payout|withdrawal)\s+(?:was|is|got)\b/i.test(text) && r10.includes(HEDGE) && !r9.includes(HEDGE)) {
    return 'OK: R10 class 4. A FAQ draft that says the team will review is replaced by the approved number hedge.';
  }
  if (/\bmy\s+payout\s+was\s+rejected\b/i.test(text) && r10.includes(HEDGE) && !r9.includes(HEDGE)) {
    return 'UNJUSTIFIED: R10 hedged a personal payout rejection. The freeze says that case is not the FAQ team-review block.';
  }
  if (spec.id === 'faq-password-back') {
    const r10back = /go back to the dashboard/i.test(r10);
    const baseBack = /go back to the dashboard/i.test((previews.baseline || []).join(' | '));
    if (r10back && !baseBack) return 'OK: R10 class 5. "password: back" does not scrub a later ordinary "back".';
  }
  return 'UNJUSTIFIED: R10 public bytes differ from both the baseline and the R9 freeze, and the diff is not one of the five documented R10 classes.';
}

function judgeCorpus(cases, runs, detectors) {
  return cases.map((spec) => {
    const row = { id: spec.id, group: spec.group, text: spec.text };
    for (const label of ['baseline', 'r9', 'r10', 'rollback']) {
      const got = runs[label].find((item) => item.id === spec.id) || {};
      row[label] = {
        publicSha: got.publicSha || '',
        preview: got.publicPreview || [],
        done: !!got.done,
        error: got.error || '',
        comment2xx: got.comment2xx,
      };
    }
    const sameBase = row.baseline.publicSha && row.baseline.publicSha === row.r10.publicSha;
    const sameR9 = row.r9.publicSha && row.r9.publicSha === row.r10.publicSha;
    const rollbackOk = row.rollback.publicSha === row.r9.publicSha && row.rollback.done && row.r9.done;
    let justification = '';
    let justified = true;
    if (!row.r10.done || !row.baseline.done || !row.r9.done) {
      justified = false;
      justification = 'UNJUSTIFIED: a tree failed to finish the case.';
    } else if (sameBase) {
      justification = 'Byte-identical to the luna-current baseline.';
    } else if (sameR9) {
      justification = 'Identical to the R9 freeze. R10 kept that behavior. Baseline preview: ' + (row.baseline.preview[0] || '[no public comment]') + ' R10 preview: ' + (row.r10.preview[0] || '[no public comment]');
    } else {
      justification = explainR10Only(spec, {
        baseline: row.baseline.preview,
        r9: row.r9.preview,
        r10: row.r10.preview,
      }, detectors);
      justified = justification.startsWith('OK:');
    }
    if (!rollbackOk) justified = false;
    row.sameBase = !!sameBase;
    row.sameR9 = !!sameR9;
    row.rollbackOk = !!rollbackOk;
    row.justified = justified && !!rollbackOk;
    row.justification = justification + (rollbackOk ? '' : ' Rollback did not restore the R9 bytes of this output.');
    return row;
  });
}

function judgeRecovery(results) {
  return results.map((got) => {
    const failures = [];
    if (!got || !got.done) failures.push(got && got.error ? got.error : 'no-result');
    if (got && got.tripwire !== true) failures.push('tripwire-off');
    if (got && got.unexpectedHost && got.unexpectedHost.length) failures.push('unexpected-host');
    if (got && got.fixedBeforeVerified) failures.push('fixed-line-without-verified-assignment');
    if (got && got.fixed2xx > 1) failures.push('duplicate-fixed-line');
    if (got && got.thrown) failures.push('threw');
    if (got && got.silence) {
      if (got.comment2xx !== 0 || got.fixed2xx !== 0 || got.note2xx !== 0) failures.push('human-silence-broken');
    } else if (got && got.done) {
      const completed = got.fixed2xx === 1 && !got.fixedBeforeVerified;
      const held = got.fixed2xx === 0 && got.hold === true;
      if (!completed && !held) failures.push('lost-handoff');
      if (got.id === 'rec-assign-before-note' && got.assignBeforeNote) {
        failures.push('assign-before-note-was-reachable');
      }
    }
    return {
      id: got && got.id,
      ok: failures.length === 0,
      failures,
      fixed2xx: got && got.fixed2xx,
      comment2xx: got && got.comment2xx,
      verifiedAssignment2xx: got && got.verifiedAssignment2xx,
      fixedBeforeVerified: got && got.fixedBeforeVerified,
      hold: got && got.hold,
      progress: got && got.progress,
      writeOrder: got && got.writeOrder,
      assignBeforeNote: got && got.assignBeforeNote,
      phases: got && got.phases,
      preview: got && got.publicPreview,
    };
  });
}

async function main() {
  const limit = Number(process.env.CORPUS_LIMIT || 0);
  const cases = corpusCases();
  const selected = limit > 0 ? cases.slice(0, limit) : cases;
  if (selected.length < 100 && limit === 0) throw new Error('corpus smaller than 100: ' + selected.length);
  process.stderr.write('CORPUS ' + selected.length + '\n');
  process.stderr.write('PREPARE roots\n');
  const roots = {
    baseline: prepareRoot('baseline', '/workspace', false),
    r9: prepareRoot('r9', '/tmp/trees/r9', false),
    r10: prepareRoot('r10', '/tmp/trees/r10', false),
    rollback: prepareRoot('rollback', '/tmp/trees/r10', true),
  };
  const restored = restoreHashes(roots.rollback);
  if (restored.some((row) => !row.ok)) throw new Error('rollback files are not the R9 bytes');
  const labels = ['baseline', 'r9', 'r10', 'rollback'];
  const runs = {};
  for (const label of labels) {
    process.stderr.write('RUN ' + label + '\n');
    runs[label] = await pool(selected, 4, async (spec) => {
      const result = await execute(roots[label], spec);
      process.stderr.write(label + ' ' + spec.id + ' ' + (result.done ? result.publicSha.slice(0, 12) : result.error) + '\n');
      return result;
    });
  }
  fs.writeFileSync('/tmp/corpus-runs.json', JSON.stringify({ selected, runs }));
  const detectors = require('/tmp/trees/r10/luna-current/01_runtime/escalateRelatedOnly');
  const handoff = require('/tmp/trees/r10/luna-current/01_runtime/fixedMessageHandoff');
  const judged = judgeCorpus(selected, runs, {
    isStatusPing: detectors.isStatusPing,
    isClearKbFaqAsk: detectors.isClearKbFaqAsk,
    faqTeamReviewBlocked: handoff.faqTeamReviewBlocked,
  });
  process.stderr.write('RECOVERY\n');
  const recoverySpecs = recoveryCases();
  const recoveryRuns = await pool(recoverySpecs, 3, async (spec) => {
    const result = await execute(roots.r10, spec);
    if (spec.silence) result.silence = true;
    process.stderr.write('recovery ' + spec.id + ' fixed=' + result.fixed2xx + ' hold=' + result.hold + ' err=' + (result.error || '') + '\n');
    return result;
  });
  const recovery = judgeRecovery(recoveryRuns);
  const payload = {
    generatedAt: new Date().toISOString(),
    corpusCount: selected.length,
    restored,
    groups: countGroups(selected),
    corpus: judged,
    recovery,
    identical: judged.filter((row) => row.sameBase).length,
    keptFromR9: judged.filter((row) => !row.sameBase && row.sameR9).length,
    r10Only: judged.filter((row) => row.sameBase === false && row.sameR9 === false).length,
    unjustified: judged.filter((row) => !row.justified).map((row) => row.id),
    rollbackMismatches: judged.filter((row) => !row.rollbackOk).map((row) => row.id),
    recoveryFailures: recovery.filter((row) => !row.ok).map((row) => ({ id: row.id, failures: row.failures })),
  };
  const out = path.join(__dirname, 'corpus-results.json');
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({
    corpusCount: payload.corpusCount,
    identical: payload.identical,
    keptFromR9: payload.keptFromR9,
    r10Only: payload.r10Only,
    unjustified: payload.unjustified,
    rollbackMismatches: payload.rollbackMismatches,
    recoveryFailures: payload.recoveryFailures,
  }, null, 2));
}

function countGroups(cases) {
  const groups = {};
  for (const spec of cases) groups[spec.group] = (groups[spec.group] || 0) + 1;
  return groups;
}
