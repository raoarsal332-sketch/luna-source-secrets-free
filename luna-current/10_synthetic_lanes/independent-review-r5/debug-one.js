'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const RUNTIME = '/tmp/r5-run/luna-current/01_runtime';
const ROOT = '/tmp/r5-review/debug-state';
fs.mkdirSync(ROOT, { recursive: true });
for (const [k, v] of Object.entries({
  TICKET_STATE_FILE: ROOT + '/ticket.json',
  LUNA_OP_STORE_FILE: ROOT + '/ops.json',
  LUNA_CONTROL_STATE_FILE: ROOT + '/control.json',
  MENTION_ROTATE_FILE: ROOT + '/mention.json',
  LUNA_PROMPT_FILE: RUNTIME + '/system-prompt.txt',
  FUNDEDELITE_FAQ_PATH: RUNTIME + '/fundedelite-faqs.md',
  LUNA_TOOLS_ENABLED: '0',
  DOTENV_CONFIG_PATH: ROOT + '/empty.env',
  OPENAI_API_KEY: 'synthetic',
  INTERCOM_ACCESS_TOKEN: 'synthetic',
})) process.env[k] = v;
fs.writeFileSync(ROOT + '/empty.env', '');
fs.writeFileSync(ROOT + '/control.json', JSON.stringify({
  paused: false, pausedUntil: null, aiOff: {}, testMode: false,
  testAllowNames: [], testAllowConversationIds: [],
  config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
}));
try { fs.unlinkSync(ROOT + '/ticket.json'); } catch (_) {}
try { fs.unlinkSync(ROOT + '/ops.json'); } catch (_) {}

const world = { conversation: null, calls: [], reply: '' };
async function axiosImpl(config) {
  const method = String((config && config.method) || 'get').toLowerCase();
  const url = String((config && config.url) || '');
  const data = config && config.data;
  if (/faq\.fundedelite\.com/i.test(url)) return { status: 500, data: '' };
  if (/admins/.test(url)) {
    return { status: 200, data: { admins: [{ id: '9000007', name: 'Synthetic Teammate', email: 'synthetic-seat@example.test', has_inbox_seat: true, away_mode_enabled: false, team_ids: [9629780] }] } };
  }
  if (method === 'get' && /conversations\//.test(url)) return { status: 200, data: world.conversation };
  if (method === 'post' && /reply/.test(url)) {
    world.calls.push({ type: data && data.message_type, body: String((data && data.body) || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) });
    return { status: 200, data: { id: 'synth-write', type: 'conversation' } };
  }
  return { status: 599, data: {} };
}
const axios = (c) => axiosImpl(c);
axios.get = (u, c) => axiosImpl(Object.assign({}, c, { method: 'get', url: u }));
axios.post = (u, d, c) => axiosImpl(Object.assign({}, c, { method: 'post', url: u, data: d }));
axios.request = axiosImpl;
axios.create = () => axios;
const OpenAI = class {
  constructor() {
    this.chat = { completions: { create: async (req) => {
      const blob = JSON.stringify(req.messages || []);
      let content = world.reply;
      if (/Rewrite the following INTERNAL/i.test(blob)) content = 'Client asked for a review.';
      else if (/OWNER ACTION format/i.test(blob)) content = 'ACTION: NOTE\nBODY: Noted.';
      else if (/HARD OVERRIDE: This is a general KB/i.test(blob) && world.override) content = world.override;
      return { choices: [{ message: { content } }] };
    } } };
  }
};
const orig = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'axios') return axios;
  if (id === 'openai') return OpenAI;
  return orig.apply(this, arguments);
};
const engine = require(RUNTIME + '/index.js');
const NOW = Math.floor(Date.now() / 1000);

function conv(id, text, extra) {
  const created = (extra && extra.fresh) ? NOW - 8 : NOW - 5000;
  const parts = [];
  if (!(extra && extra.sourceOnly)) {
    parts.push({
      id: 'user-' + id, part_type: 'comment', body: text,
      author: { type: 'user', id: 'user-synth', name: 'Synthetic Client' },
      created_at: created + 40,
    });
  }
  return {
    id, open: true, state: 'open', created_at: created, updated_at: NOW,
    admin_assignee_id: (extra && extra.assignee) || '10118526',
    team_assignee_id: 0,
    source: { body: (extra && extra.sourceOnly) ? text : '', author: { type: 'user', id: 'user-synth', name: 'Synthetic Client' }, created_at: created },
    contacts: { contacts: [{ id: 'user-synth', name: 'Synthetic Client', email: 'synth-user@example.test' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

async function run(label, text, reply, extra) {
  world.calls = [];
  world.reply = reply;
  world.override = (extra && extra.override) || '';
  world.conversation = conv(label, text, extra);
  const logs = [];
  const pl = console.log;
  const pe = console.error;
  console.log = (...a) => { logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
  console.error = (...a) => { logs.push('E ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
  const topic = (extra && extra.topic) || 'conversation.user.replied';
  await engine.handleWebhook({ body: { topic, data: { item: { id: label } } } }, { sendStatus() { return this; } });
  console.log = pl;
  console.error = pe;
  pl('\n==== ' + label + ' ====');
  pl('WRITES ' + JSON.stringify(world.calls));
  for (const l of logs) {
    if (/FIXED|AI_ACTION|SKIP|FAQ|SPREAD|PRESEND|ESCALATE|IDENTITY|WEBHOOK|FIN_HANDOFF|POSTGATE|REPLY|FORCE|MISSED|preSend|ASSIGN|IN /.test(l)) pl(l.slice(0, 400));
  }
}

(async () => {
  await run(
    'presend',
    'My payout was rejected on account 77011002. Registered email synth77011002@example.test. The dashboard balance is wrong.',
    'ACTION: REPLY\nBODY: Please share your account number.'
  );
  await run(
    'faq-hold-generic',
    'What is the minimum holding time for trades?',
    'ACTION: REPLY\nBODY: There is a minimum holding time for trades. I can explain that rule from the help centre.'
  );
  await run(
    'faq-hold-fact',
    'What is the minimum holding time for trades?',
    'ACTION: REPLY\nBODY: Standard accounts require positions to remain open for at least 3 minutes. Accounts with the scalping addon require at least 30 seconds.'
  );
  await run(
    'faq-loss-escalate',
    'How much can I lose in one day before a breach?',
    'ACTION: ESCALATE\nKIND: FAQ_CONFIRM\nBODY: Daily loss question.'
  );
  await run(
    'status-ping',
    'any update on the payout rules?',
    'ACTION: REPLY\nBODY: Payout requests follow the help centre schedule.'
  );
  await run(
    'it-handoff',
    'Vorrei parlare con un operatore',
    'ACTION: REPLY\nBODY: I can help with your FundedElite account.'
  );
  await run(
    'it-account',
    'qual e il numero di conto',
    'ACTION: REPLY\nBODY: I can help with your FundedElite account.'
  );
  await run(
    'faq-loss-obey',
    'How much can I lose in one day before a breach?',
    'ACTION: ESCALATE\nKIND: FAQ_CONFIRM\nBODY: Daily loss question.',
    { override: 'ACTION: REPLY\nBODY: The 2-Step Challenge has a fixed daily loss limit of 5%. The 1-Step Challenge has a fixed daily loss limit of 3%.' }
  );
  await run(
    'status-fact',
    'any update on the payout rules?',
    'ACTION: REPLY\nBODY: The standard days between payouts are 14. The first payout is requestable after 21 days.'
  );
  await run(
    'presend-mixed',
    'My payout was rejected on account 77011002. Registered email synth77011002@example.test. The dashboard balance is wrong.',
    'ACTION: REPLY\nBODY: Payout reviews follow the published timeline. Please share your account number.'
  );
  await run(
    'replay-a',
    'I want to talk to a human',
    'ACTION: REPLY\nBODY: I can help with your FundedElite account.'
  );
  world.conversation.conversation_parts.conversation_parts.push({
    id: 'bot-fixed', part_type: 'comment', body: 'A teammate now has this conversation.',
    author: { type: 'admin', id: '10118526', name: 'Arsal' }, created_at: NOW,
  });
  const logs = [];
  const pl = console.log;
  console.log = (...a) => { logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
  console.error = console.log;
  world.calls = [];
  await engine.handleWebhook({ body: { topic: 'conversation.user.replied', data: { item: { id: 'replay-a' } } } }, { sendStatus() { return this; } });
  console.log = pl;
  pl('\n==== replay-with-fixed-line-in-parts ====');
  pl('WRITES ' + JSON.stringify(world.calls));
  for (const l of logs) if (/FIXED|SKIP|ESCALATE|FIN_HANDOFF|IN /.test(l)) pl(l.slice(0, 400));
})().catch((e) => { console.error(e); process.exit(1); });
