'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const dir = '/tmp/cred-r7-search-state';
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(path.join(dir, 'maintainer'), { recursive: true });
process.env.LUNA_CONTROL_STATE_FILE = path.join(dir, 'bot-control.json');
process.env.LUNA_PROMPT_FILE = '/tmp/cred-r7-scratch/luna-current/01_runtime/system-prompt.txt';
process.env.LUNA_OP_STORE_FILE = path.join(dir, 'ops.json');
process.env.TICKET_STATE_FILE = path.join(dir, 'tickets.json');
process.env.MENTION_ROTATE_FILE = path.join(dir, 'mention.json');
process.env.IMAGE_GUARD_STATE_FILE = path.join(dir, 'image.json');
process.env.MAINTAINER_DATA_DIR = path.join(dir, 'maintainer');
process.env.MAINTAINER_ENABLED = 'false';
process.env.OPENAI_API_KEY = 'synthetic-review-key';
process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-review-token';
process.env.HOME = '/tmp/cred-r7-home';
process.env.PORT = '18991';
fs.writeFileSync(process.env.LUNA_CONTROL_STATE_FILE, JSON.stringify({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: [],
  testAllowConversationIds: [],
  config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
}));

const records = [];
function finish(why) {
  fs.writeFileSync(path.join(dir, 'search.json'), JSON.stringify({ why: why, records: records }, null, 2));
  process.exit(0);
}
async function axiosImpl(config) {
  const cfg = config || {};
  const method = String(cfg.method || 'get').toLowerCase();
  const url = String(cfg.url || '');
  records.push({ method: method, url: url, data: cfg.data || null });
  const searches = records.filter((r) => r.url.indexOf('/conversations/search') !== -1);
  if (searches.length >= 3) setTimeout(() => finish('three-searches'), 20);
  if (url.indexOf('/conversations/search') !== -1) {
    return { status: 200, data: { conversations: [], pages: {} }, headers: {} };
  }
  if (method === 'get') return { status: 200, data: { id: 'none', conversation_parts: { conversation_parts: [] } }, headers: {} };
  return { status: 200, data: { type: 'conversation', id: 'synthetic-ok' }, headers: {} };
}
axiosImpl.post = function post(url, data, config) {
  return axiosImpl(Object.assign({}, config || {}, { method: 'post', url: url, data: data }));
};
axiosImpl.get = function get(url, config) {
  return axiosImpl(Object.assign({}, config || {}, { method: 'get', url: url }));
};
class OpenAI { constructor() {} }
OpenAI.prototype.chat = { completions: { create: async function create() { return { choices: [{ message: { content: 'ACTION: SKIP\nBODY: noop' } }] }; } } };
const orig = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'axios') return axiosImpl;
  if (request === 'openai') return OpenAI;
  return orig.apply(this, arguments);
};
setTimeout(() => finish('timeout'), 14000);
