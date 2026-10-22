'use strict';

/**
 * Load one runtime copy and drive the real exported handleWebhook.
 * The model is a stub. The network is the recording transport.
 * Case JSON is read from argv[2]. Results are written to argv[3].
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const runtimeDir = path.resolve(process.argv[2]);
const casesPath = path.resolve(process.argv[3]);
const outPath = path.resolve(process.argv[4]);
const mode = process.argv[5] || 'patched';

const work = path.join('/tmp/payout-r17-review', 'work-' + mode + '-' + process.pid);
fs.mkdirSync(work, { recursive: true });

process.env.OPENAI_API_KEY = 'sk-review-stub';
process.env.INTERCOM_ACCESS_TOKEN = 'review-stub';
process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';
process.env.LUNA_PRESEND_MODE = 'observe';
process.env.LUNA_PROMPT_FILE = path.join(runtimeDir, 'system-prompt.txt');
process.env.FUNDEDELITE_FAQ_PATH = path.join(runtimeDir, 'fundedelite-faqs.md');
process.env.LUNA_CONTROL_STATE_FILE = path.join(work, 'control.json');
process.env.TICKET_STATE_FILE = path.join(work, 'tickets.json');
process.env.LUNA_OP_STORE_FILE = path.join(work, 'write-ops.json');
process.env.MENTION_ROTATE_FILE = path.join(work, 'mention-rotate.json');
process.env.LUNA_BOT_ADMIN_IDS = '10118526,8052954';

const transport = require('./transport');
transport.install();

const origRequire = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
  if (id === 'openai') {
    function OpenAI() {
      this.chat = {
        completions: {
          create: async () => ({
            id: 'stub',
            choices: [{
              message: {
                role: 'assistant',
                content: global.__REVIEW_MODEL_RAW || '',
              },
            }],
          }),
        },
      };
    }
    return OpenAI;
  }
  return origRequire.apply(this, arguments);
};

const runtime = require(path.join(runtimeDir, 'index.js'));
const handleWebhook = runtime.handleWebhook;
if (typeof handleWebhook !== 'function') {
  throw new Error('handleWebhook was not exported');
}

const CLIENT_NAME = 'Sara';
const USER_ID = 'user-sara';
const JERRY_ID = '8053416';

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function controlState(extra) {
  const aiOff = {};
  if (extra && extra.aiOff) aiOff.__cid = true;
  return {
    paused: !!(extra && extra.paused),
    pausedUntil: null,
    aiOff,
    testMode: false,
    testAllowNames: ['Bot test'],
    testAllowConversationIds: [],
    config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
  };
}

function buildConversation(item, conversationId) {
  const now = Math.floor(Date.now() / 1000);
  const age = Number.isFinite(item.freshSeconds) ? item.freshSeconds : 3600;
  const created = now - age;
  const parts = [];
  const priors = Array.isArray(item.priorClientTexts) ? item.priorClientTexts : [];
  priors.forEach((text, i) => {
    parts.push({
      id: 'prior-' + i,
      part_type: 'comment',
      body: String(text || ''),
      created_at: created + 10 + i,
      author: { id: USER_ID, type: 'user', name: CLIENT_NAME },
    });
  });
  if (item.channel !== 'owner-only' && item.clientText != null) {
    parts.push({
      id: 'user-latest',
      part_type: 'comment',
      body: String(item.clientText || ''),
      created_at: now - 40,
      author: { id: USER_ID, type: 'user', name: CLIENT_NAME },
    });
  }
  if (item.teammateAfter) {
    parts.push({
      id: 'teammate-1',
      part_type: 'comment',
      body: item.teammateBody || 'I am looking at this with you. Please contact our japanese support.',
      created_at: now - 20,
      author: { id: '424242', type: 'admin', name: 'Teammate' },
    });
  }
  if (item.ownerNote) {
    parts.push({
      id: 'owner-note-1',
      part_type: 'note',
      body: String(item.ownerNote),
      created_at: now - 5,
      author: { id: JERRY_ID, type: 'admin', name: 'Jerry' },
    });
  }
  return {
    type: 'conversation',
    id: conversationId,
    created_at: created,
    updated_at: now - 40,
    open: true,
    state: 'open',
    team_assignee_id: null,
    admin_assignee_id: item.assigneeId || null,
    source: {
      type: 'conversation',
      id: 'source-' + conversationId,
      delivered_as: 'customer_initiated',
      body: '',
      author: { type: 'user', id: USER_ID, name: CLIENT_NAME, email: 'sara@example.com' },
    },
    contacts: {
      type: 'contact.list',
      contacts: [{ type: 'contact', id: USER_ID, name: CLIENT_NAME, email: 'sara@example.com' }],
    },
    conversation_parts: { type: 'conversation_part.list', conversation_parts: parts },
  };
}

function fakeRes() {
  return {
    statusCode: 200,
    sendStatus(code) { this.statusCode = code; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function runOne(item, index) {
  const conversationId = String(800000 + index);
  const logs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => { logs.push(args.map(String).join(' ')); };
  console.error = (...args) => { logs.push(args.map(String).join(' ')); };
  const interesting = (line) => /SKIP|PAYOUT_|POSTGATE|WEBHOOK_ERR|TRIPWIRE|FAQ_|AUTH_NOTE|AI_ACTION|fin-wait|PRESEND|statePresend|OWNER_/.test(line);
  try {
    const ctrl = controlState(item.control || null);
    if (item.control && item.control.aiOff) ctrl.aiOff[conversationId] = true;
    writeJson(process.env.LUNA_CONTROL_STATE_FILE, ctrl);
    const ticket = {};
    const state = Object.assign({}, item.state || {});
    if (item.deferredAgeSec != null) {
      state.deferredRelatedReply = {
        at: Math.floor(Date.now() / 1000) - Number(item.deferredAgeSec),
      };
    }
    if (Object.keys(state).length) ticket[conversationId] = state;
    writeJson(process.env.TICKET_STATE_FILE, ticket);
    writeJson(process.env.LUNA_OP_STORE_FILE, {});
    global.__REVIEW_MODEL_RAW = item.modelRaw == null ? '' : String(item.modelRaw);
    const conversation = buildConversation(item, conversationId);
    transport.resetRecord(conversation);
    const topic = item.topic || (item.ownerNote ? 'conversation.admin.noted' : 'conversation.user.replied');
    const req = { body: { topic, data: { item: conversation } }, headers: {} };
    await handleWebhook(req, fakeRes());
    let initialComments = null;
    if (item.replayAfterSend) {
      initialComments = transport.snapshot().publicComments.slice();
      const grafted = JSON.parse(JSON.stringify(conversation));
      const list = grafted.conversation_parts.conversation_parts;
      // The grafted comment is the transport's own recorded send, not a fixture.
      initialComments.forEach((html, i) => {
        list.push({
          id: 'recorded-send-' + i,
          part_type: 'comment',
          body: html,
          created_at: Math.floor(Date.now() / 1000) - 10,
          author: { id: '10118526', type: 'admin', name: 'Arsal' },
        });
      });
      transport.resetRecord(grafted);
      await handleWebhook(req, fakeRes());
    }
    const snap = transport.snapshot();
    return {
      id: item.id,
      mode,
      publicComments: snap.publicComments,
      initialComments,
      notes: snap.notes,
      tripwires: snap.tripwires,
      helpCentre: snap.helpCentre,
      calls: snap.calls.map((c) => ({ method: c.method, path: c.path, messageType: c.body && c.body.message_type })),
      logs: logs.filter(interesting).slice(-40),
    };
  } catch (err) {
    return {
      id: item.id,
      mode,
      error: err && err.stack ? err.stack : String(err),
      publicComments: [],
      notes: [],
      tripwires: transport.snapshot().tripwires,
      logs: logs.filter(interesting).slice(-40),
    };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

async function main() {
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const results = [];
  for (let i = 0; i < cases.length; i += 1) {
    if (i && i % 50 === 0) process.stderr.write(mode + ' ' + i + '/' + cases.length + '\n');
    results.push(await runOne(cases[i], i));
  }
  const help = results.reduce((n, row) => n + ((row.helpCentre && row.helpCentre.length) || 0), 0);
  const trips = results.reduce((n, row) => n + ((row.tripwires && row.tripwires.length) || 0), 0);
  fs.writeFileSync(outPath, JSON.stringify({ mode, count: results.length, helpCentreFetches: help, tripwires: trips, results }, null, 2));
  process.stderr.write(mode + ' done ' + results.length + ' help=' + help + ' tripwires=' + trips + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
