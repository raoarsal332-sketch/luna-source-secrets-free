'use strict';

/**
 * One process invocation of the real handleWebhook.
 * Axios and the model SDK are replaced. http/https/net cannot leave the process.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const http = require('http');
const https = require('https');
const net = require('net');
const dns = require('dns');

const ROOT = process.env.LUNA_ROOT;
const WORK = process.env.WORK_DIR;
const CASE = JSON.parse(fs.readFileSync(process.env.CASE_FILE, 'utf8'));
const TURNS = String(process.env.TURN_INDEXES || '0').split(',').map((n) => Number(n));

const ARSAL = '10118526';
const ELITE = '8052954';
const HUMAN = '777001';
const SEAT = '424242';
const RISK = '10675195';
const ESC = '9629759';

const callsPath = path.join(WORK, 'calls.json');
const convPath = path.join(WORK, 'conversation.json');
const tripPath = path.join(WORK, 'tripwire.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

const trips = readJson(tripPath, []);
let conv = readJson(convPath, null);
const live = { faults: {}, turnIndex: 0 };

function record(entry) {
  const disk = readJson(callsPath, []);
  disk.push(entry);
  writeJson(callsPath, disk);
}
function trip(kind, detail) {
  trips.push({ kind, detail: String(detail || ''), at: Date.now() });
  writeJson(tripPath, trips);
  const err = new Error('NETWORK_TRIPWIRE ' + kind + ' ' + (detail || ''));
  err.code = 'NETWORK_TRIPWIRE';
  return err;
}

http.request = function () { throw trip('http.request'); };
http.get = function () { throw trip('http.get'); };
https.request = function () { throw trip('https.request'); };
https.get = function () { throw trip('https.get'); };
net.Socket.prototype.connect = function () { throw trip('net.connect'); };
const lookup = function (host, opts, cb) {
  if (typeof opts === 'function') cb = opts;
  const err = trip('dns.lookup', host);
  if (typeof cb === 'function') cb(err);
  else throw err;
};
dns.lookup = lookup;
if (dns.promises && typeof dns.promises.lookup === 'function') {
  dns.promises.lookup = async function (host) { throw trip('dns.promises.lookup', host); };
}

function modelText(kind) {
  if (kind === 'invent-leverage') return 'ACTION: REPLY\nBODY: The leverage is 1:999.';
  if (kind === 'invent-holding') return 'ACTION: REPLY\nBODY: The minimum holding time is 99 minutes.';
  if (kind === 'invent-drawdown') return 'ACTION: REPLY\nBODY: The daily drawdown is 99%.';
  if (kind === 'policy') return 'ACTION: REPLY\nBODY: A password is private to you. This chat does not set or reveal one.';
  if (kind === 'plain-help') return 'ACTION: REPLY\nBODY: I can help with your FundedElite account from here.';
  if (kind === 'echo-danger') return 'ACTION: REPLY\nBODY: I will not repeat a password or an api key.';
  if (kind === 'note-en') return 'ACTION: REPLY\nBODY: A teammate can help with that.';
  return 'ACTION: REPLY\nBODY: Please tell me which challenge you mean';
}

const axiosPath = path.join(WORK, 'axios-mock.js');
const openaiPath = path.join(WORK, 'openai-mock.js');

fs.writeFileSync(openaiPath, [
  "'use strict';",
  'const fs = require("fs");',
  'class OpenAI {',
  '  constructor() {}',
  '  chat = { completions: { create: async (req) => {',
  '    const messages = (req && req.messages) || [];',
  '    const blob = messages.map((m) => String(m && m.content || "")).join("\\n");',
  '    const kind = process.env.TURN_MODEL || "clarifier";',
  '    let content;',
  '    if (/INTERNAL Intercom note/i.test(blob)) content = "The client asked to speak with a human teammate.";',
  '    else if (kind === "invent-leverage") content = "ACTION: REPLY\\nBODY: The leverage is 1:999.";',
  '    else if (kind === "invent-holding") content = "ACTION: REPLY\\nBODY: The minimum holding time is 99 minutes.";',
  '    else if (kind === "invent-drawdown") content = "ACTION: REPLY\\nBODY: The daily drawdown is 99%.";',
  '    else if (kind === "policy") content = "ACTION: REPLY\\nBODY: A password is private to you. This chat does not set or reveal one.";',
  '    else if (kind === "plain-help") content = "ACTION: REPLY\\nBODY: I can help with your FundedElite account from here.";',
    '    else if (kind === "echo-danger") content = "ACTION: REPLY\\nBODY: I will not repeat a password or an api key.";',
    '    else if (kind === "note-en") content = "ACTION: REPLY\\nBODY: A teammate can help with that.";',
    '    else if (kind === "grounded") {',
    '      let grounded = "Please tell me which challenge you mean";',
    '      try {',
    '        const faq = require(process.env.LUNA_FAQ_MODULE);',
    '        const user = messages.filter((m) => m && m.role === "user").map((m) => String(m.content || "")).join("\\n");',
    '        const marker = user.split("Latest client message:");',
    '        const q = (marker.length > 1 ? marker[1] : user).split("\\n").map((s) => s.trim()).filter(Boolean)[0] || "";',
    '        const hit = faq.selectApprovedAnswer(q);',
    '        if (hit && hit.body) grounded = String(hit.body).trim().slice(0, 900);',
    '      } catch (err) {}',
    '      content = "ACTION: REPLY\\nBODY: " + grounded;',
    '    }',
    '    else content = "ACTION: REPLY\\nBODY: Please tell me which challenge you mean";',
  '    const callsFile = process.env.CALLS_FILE;',
  '    const calls = JSON.parse(fs.readFileSync(callsFile, "utf8"));',
  '    calls.push({ op: "model", turn: Number(process.env.TURN_INDEX || 0), messages, content });',
  '    fs.writeFileSync(callsFile, JSON.stringify(calls, null, 2));',
  '    return { choices: [{ message: { content } }] };',
  '  } } };',
  '}',
  'module.exports = OpenAI;',
  '',
].join('\n'));

fs.writeFileSync(axiosPath, "'use strict';\nmodule.exports = async function axios() { throw new Error('axios mock not installed'); };\n");

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'axios') return axiosPath;
  if (request === 'openai') return openaiPath;
  return resolveFilename.call(this, request, parent, isMain, options);
};

function blankConv(turn) {
  const now = Math.floor(Date.now() / 1000);
  const id = 'c-' + String(CASE.id).replace(/[^a-z0-9-]+/gi, '-').slice(0, 48);
  const created = now - Number(turn.ageSec == null ? 400 : turn.ageSec);
  return {
    id,
    type: 'conversation',
    created_at: created,
    updated_at: created,
    admin_assignee_id: ARSAL,
    team_assignee_id: '0',
    contacts: { contacts: [{ id: 'contact-1', name: 'Review Client', email: 'review.client@example.com', type: 'user' }] },
    source: {
      body: '',
      author: { type: 'user', id: 'user-1', name: 'Review Client' },
      created_at: created,
    },
    conversation_parts: { conversation_parts: [] },
  };
}

function parts() {
  return conv.conversation_parts.conversation_parts;
}

function applyScene(turn) {
  if (!conv) conv = blankConv(turn);
  const now = Math.floor(Date.now() / 1000);
  if (turn.assignee === 'human') conv.admin_assignee_id = HUMAN;
  else if (turn.assignee === 'bot') conv.admin_assignee_id = ARSAL;
  if (turn.team === 'risk') conv.team_assignee_id = RISK;
  else if (turn.team === 'escalations') conv.team_assignee_id = ESC;
  else if (turn.team === 'none') conv.team_assignee_id = '0';
  if (turn.ambiguous) {
    conv.admin_assignee_id = '0';
    conv.assignee = { type: 'admin' };
  }
  if (turn.finHandoff && !parts().some((p) => p && p.id === 'fin-handoff')) {
    parts().push({
      id: 'fin-handoff',
      part_type: 'comment',
      author: { id: ELITE, type: 'admin', name: 'Elite AI' },
      body: "I'm connecting you to a teammate",
      created_at: now - 50,
    });
  }
  if (turn.humanReply) {
    parts().push({
      id: 'human-' + now,
      part_type: 'comment',
      author: { id: HUMAN, type: 'admin', name: 'Casey Human' },
      body: 'I have this ticket.',
      created_at: now - 5,
    });
  }
  if (turn.addHumanReply) {
    parts().push({
      id: 'human-add-' + now,
      part_type: 'comment',
      author: { id: HUMAN, type: 'admin', name: 'Casey Human' },
      body: 'I am taking this from here.',
      created_at: now - 3,
    });
  }
  if (turn.adminBody) {
    parts().push({
      id: 'admin-body-' + now,
      author: { id: HUMAN, type: 'admin', name: 'Casey Human' },
      body: 'Looking at this now.',
      created_at: now - 4,
    });
  }
  if (turn.teammateAuthor) {
    parts().push({
      id: 'tm-' + now,
      part_type: 'comment',
      author: { id: HUMAN, type: 'teammate', name: 'Casey Human' },
      body: 'I am here.',
      created_at: now - 4,
    });
  }
  if (turn.stale) {
    conv.admin_assignee_id = ARSAL;
    parts().push({
      id: 'stale-asg-' + now,
      part_type: 'assignment',
      author: { id: ARSAL, type: 'admin' },
      assigned_to: { id: HUMAN, type: 'admin' },
      created_at: now - 20,
    });
  }
  if (turn.removeNote) {
    conv.conversation_parts.conversation_parts = parts().filter((p) => !p || p.part_type !== 'note');
  }
  if (turn.ownerNote) {
    const note = turn.ownerNote;
    parts().push({
      id: 'owner-note-' + now,
      part_type: 'note',
      author: {
        id: String(note.authorId || ''),
        type: note.authorType || 'user',
        name: note.authorName || 'Arsal',
        email: note.authorEmail || 'spoof@example.com',
      },
      body: note.body || '',
      created_at: now,
    });
  }
  if (!turn.redeliver && turn.topic !== 'conversation.admin.noted') {
    const createdAt = now - 2;
    const text = String(turn.text || '');
    conv.source.body = text;
    conv.source.author = { type: 'user', id: 'user-1', name: 'Review Client' };
    parts().push({
      id: 'user-' + CASE.id + '-' + process.env.TURN_INDEX,
      part_type: 'comment',
      author: { id: 'user-1', type: 'user', name: 'Review Client' },
      body: text,
      created_at: createdAt,
    });
  }
  if (turn.topicOverrideCreated) {
    turn.topic = 'conversation.user.created';
    conv.created_at = now - 30;
  }
  writeJson(convPath, conv);
}

function wipe(turn) {
  const ticket = process.env.TICKET_STATE_FILE;
  const ops = process.env.LUNA_OP_STORE_FILE;
  if (turn.wipe === 'ticket' || turn.wipe === 'ticket+ops') writeJson(ticket, {});
  if (turn.wipe === 'ops' || turn.wipe === 'ticket+ops') writeJson(ops, {});
}

function successBody(kind) {
  if (kind === 'assignment') {
    conv.admin_assignee_id = SEAT;
    parts().push({
      id: 'asg-' + parts().length,
      part_type: 'assignment',
      author: { id: ARSAL, type: 'admin' },
      assigned_to: { id: SEAT, type: 'admin' },
      assignee_id: SEAT,
      created_at: Math.floor(Date.now() / 1000),
    });
    return { id: conv.id, type: 'conversation', admin_assignee_id: SEAT };
  }
  return { id: conv.id, type: 'conversation' };
}

function installAxios() {
  async function axios(config) {
    const faults = live.faults || {};
    const cfg = config || {};
    const method = String(cfg.method || 'get').toLowerCase();
    const url = String(cfg.url || '');
    const data = cfg.data;
    let host = '';
    try { host = new URL(url).host; } catch (_) { host = ''; }
    const entry = {
      op: 'http',
      turn: live.turnIndex,
      method,
      url,
      data,
      status: 0,
    };
    if (host && host !== 'api.intercom.io') {
      if (host === 'faq.fundedelite.com') {
        entry.blocked = true;
        entry.status = 204;
        record(entry);
        return { status: 204, data: '' };
      }
      record(entry);
      throw trip('axios', method + ' ' + url);
    }
    if (/\/admins\/?$/.test(url) && method === 'get') {
      entry.status = 200;
      record(entry);
      return {
        status: 200,
        data: {
          admins: [{
            id: SEAT,
            name: 'Casey Review',
            email: 'casey.review@example.com',
            has_inbox_seat: true,
            away_mode_enabled: false,
            team_ids: [9629780],
          }],
        },
      };
    }
    if (method === 'get' && /\/conversations\/[^/]+$/.test(url)) {
      entry.status = 200;
      record(entry);
      return { status: 200, data: conv };
    }
    if (method === 'post' && /\/conversations\/[^/]+\/reply$/.test(url)) {
      const messageType = data && data.message_type;
      const kind = messageType === 'assignment' ? 'assignment' : messageType === 'note' ? 'note' : messageType === 'comment' ? 'comment' : messageType || 'post';
      const fault = faults[kind] || 'ok';
      entry.kind = kind;
      if (fault === 'timeout') {
        entry.status = 0;
        entry.fault = fault;
        record(entry);
        const err = new Error('timeout of 20000ms exceeded');
        err.code = 'ECONNABORTED';
        throw err;
      }
      if (fault === '500' || fault === '422' || fault === '429') {
        const status = Number(fault);
        entry.status = status;
        entry.fault = fault;
        record(entry);
        return { status, data: { type: 'error.list', errors: [{ status, code: 'synthetic', message: fault }] } };
      }
      if (fault === 'wrong-seat' || fault === 'bot-seat') {
        const seat = fault === 'bot-seat' ? ARSAL : '111111';
        entry.status = 200;
        entry.fault = fault;
        record(entry);
        return { status: 200, data: { id: conv.id, type: 'conversation', admin_assignee_id: seat } };
      }
      if (fault === 'error-list') {
        entry.status = 200;
        entry.fault = fault;
        record(entry);
        return { status: 200, data: { id: conv.id, type: 'error.list', errors: [{ code: 'bad', message: 'no' }] } };
      }
      if (fault === 'no-assignee') {
        entry.status = 200;
        entry.fault = fault;
        record(entry);
        return { status: 200, data: { id: conv.id, type: 'conversation' } };
      }
      if (fault === 'null-data') {
        entry.status = 200;
        entry.fault = fault;
        record(entry);
        return { status: 200, data: null };
      }
      if (fault === 'partial') {
        entry.status = 200;
        entry.fault = fault;
        record(entry);
        return { status: 200, data: { type: 'conversation' } };
      }
      const body = successBody(kind);
      entry.responseAssignee = body && body.admin_assignee_id ? String(body.admin_assignee_id) : '';
      if (kind === 'note' || kind === 'comment') {
        parts().push({
          id: kind + '-' + parts().length,
          part_type: kind === 'note' ? 'note' : 'comment',
          author: { id: ARSAL, type: 'admin', name: 'Arsal' },
          body: data && data.body,
          created_at: Math.floor(Date.now() / 1000),
        });
      }
      entry.status = 200;
      entry.fault = 'ok';
      record(entry);
      writeJson(convPath, conv);
      return { status: 200, data: body };
    }
    record(entry);
    throw trip('axios-unhandled', method + ' ' + url);
  }
  axios.get = (url, cfg) => axios(Object.assign({}, cfg, { url, method: 'get' }));
  axios.post = (url, data, cfg) => axios(Object.assign({}, cfg, { url, data, method: 'post' }));
  axios.request = axios;
  require.cache[axiosPath] = {
    id: axiosPath,
    filename: axiosPath,
    loaded: true,
    exports: axios,
  };
}

function prepareFiles() {
  const control = {
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: ['Bot test'],
    testAllowConversationIds: [],
    config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
  };
  if (!fs.existsSync(process.env.LUNA_CONTROL_STATE_FILE)) writeJson(process.env.LUNA_CONTROL_STATE_FILE, control);
  if (!fs.existsSync(process.env.LUNA_OP_STORE_FILE)) writeJson(process.env.LUNA_OP_STORE_FILE, {});
  if (!fs.existsSync(process.env.TICKET_STATE_FILE)) writeJson(process.env.TICKET_STATE_FILE, {});
  if (!fs.existsSync(process.env.MENTION_ROTATE_FILE)) writeJson(process.env.MENTION_ROTATE_FILE, { recent: [] });
  if (!fs.existsSync(callsPath)) writeJson(callsPath, []);
}

async function main() {
  prepareFiles();
  process.chdir(WORK);
  process.env.CALLS_FILE = callsPath;
  process.env.LUNA_FAQ_MODULE = path.join(ROOT, 'luna-current', '01_runtime', 'faq-kb.js');
  installAxios();
  const runtime = path.join(ROOT, 'luna-current', '01_runtime', 'index.js');
  const index = require(runtime);
  for (const turnIndex of TURNS) {
    const turn = CASE.turns[turnIndex];
    process.env.TURN_INDEX = String(turnIndex);
    process.env.TURN_MODEL = turn.model || 'clarifier';
    live.turnIndex = turnIndex;
    live.faults = turn.faults || {};
    wipe(turn);
    applyScene(turn);
    const topic = turn.topic || 'conversation.user.replied';
    const res = { statusCode: 0, sendStatus(code) { this.statusCode = code; return this; } };
    await index.handleWebhook({
      body: { topic, data: { item: { id: conv.id, type: 'conversation' } } },
    }, res);
    writeJson(convPath, conv);
    writeJson(path.join(WORK, 'turn-' + turnIndex + '.json'), { statusCode: res.statusCode });
  }
  writeJson(path.join(WORK, 'worker-done.json'), { ok: true, turns: TURNS });
}

main().catch((err) => {
  fs.writeFileSync(path.join(WORK, 'worker-error.txt'), (err && err.stack) || String(err));
  process.exit(1);
});
