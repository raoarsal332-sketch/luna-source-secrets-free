'use strict';

const fs = require('fs');
const path = require('path');

const runtime = process.env.RUNTIME || '/tmp/cg-r14/luna-current/01_runtime';
const stateDir = process.env.STATE_DIR || '/tmp/cg-r14-state';
fs.mkdirSync(stateDir, { recursive: true });
fs.writeFileSync(path.join(stateDir, 'control.json'), JSON.stringify({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Synthetic Client'],
  testAllowConversationIds: [],
  config: { model: 'stub-model', welcomeEnabled: true, repliesEnabled: true },
}));
fs.writeFileSync(path.join(stateDir, 'tickets.json'), '{}');
fs.copyFileSync(path.join(runtime, 'system-prompt.txt'), path.join(stateDir, 'prompt.txt'));

process.env.LUNA_CONTROL_STATE_FILE = path.join(stateDir, 'control.json');
process.env.TICKET_STATE_FILE = path.join(stateDir, 'tickets.json');
process.env.LUNA_OP_STORE_FILE = path.join(stateDir, 'ops.json');
process.env.LUNA_PROMPT_FILE = path.join(stateDir, 'prompt.txt');
process.env.FUNDEDELITE_FAQ_PATH = path.join(runtime, 'fundedelite-faqs.md');
process.env.MENTION_ROTATE_FILE = path.join(stateDir, 'mention.json');
process.env.OPENAI_API_KEY = 'sk-synthetic-review-not-a-real-key';
process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1';
process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-intercom-token-not-real';
process.env.CONTROL_SECRET = 'synthetic-control-secret';
process.env.LUNA_PRESEND_MODE = process.env.LUNA_PRESEND_MODE || 'observe';
process.env.MAINTAINER_ENABLED = 'false';
process.chdir(stateDir);

const axios = require(path.join(runtime, 'node_modules/axios'));
axios.defaults.adapter = async function adapter(config) {
  return { data: { id: 'boot', type: 'conversation' }, status: 200, statusText: 'OK', headers: {}, config };
};

const logs = [];
for (const name of ['log', 'error', 'warn', 'info', 'debug']) {
  const orig = console[name].bind(console);
  console[name] = function () {
    logs.push(name + ' ' + Array.from(arguments).map((x) => {
      try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (_) { return String(x); }
    }).join(' '));
    return orig.apply(null, arguments);
  };
}

try {
  const engine = require(path.join(runtime, 'index.js'));
  fs.writeFileSync(path.join(stateDir, 'boot.json'), JSON.stringify({ ok: true, webhook: typeof engine.handleWebhook, logs: logs.slice(0, 40) }));
} catch (e) {
  fs.writeFileSync(path.join(stateDir, 'boot.json'), JSON.stringify({
    ok: false,
    name: e && e.name,
    message: e && e.message,
    stack: String(e && e.stack || '').split('\n').slice(0, 40),
    logs: logs.slice(0, 40),
  }, null, 2));
  process.exit(1);
}
