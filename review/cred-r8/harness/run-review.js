'use strict';

/**
 * Independent R8 review harness. Drives the patched real handleWebhook,
 * postReply, and icRequest. No shim modules. Synthetic values only.
 */

const fs = require('fs');
const path = require('path');

const RUNTIME = '/tmp/cred-r8-review/runtime';
const VAR = '/tmp/cred-r8-review/var';
const CONTROL = path.join(VAR, 'control.json');
const TICKET = path.join(VAR, 'ticket-state.json');
const OPS = path.join(VAR, 'write-ops.json');
const MENTION = path.join(VAR, 'mention.json');
const MAINT = path.join(VAR, 'maintainer');

fs.mkdirSync(MAINT, { recursive: true });
fs.writeFileSync(CONTROL, JSON.stringify({
  paused: false,
  pausedUntil: null,
  aiOff: {},
  testMode: false,
  testAllowNames: ['Bot test'],
  testAllowConversationIds: [],
  config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
}, null, 2));
fs.writeFileSync(TICKET, '{}');
fs.writeFileSync(OPS, '{}');
fs.writeFileSync(MENTION, '{}');

process.env.OPENAI_API_KEY = 'synthetic-review-key';
process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-review-token';
process.env.CONTROL_SECRET = 'synthetic-control';
process.env.LUNA_CONTROL_STATE_FILE = CONTROL;
process.env.LUNA_PROMPT_FILE = path.join(RUNTIME, 'system-prompt.txt');
process.env.LUNA_OP_STORE_FILE = OPS;
process.env.TICKET_STATE_FILE = TICKET;
process.env.MENTION_ROTATE_FILE = MENTION;
process.env.MAINTAINER_ENABLED = 'true';
process.env.MAINTAINER_DRY_RUN = 'true';
process.env.MAINTAINER_DATA_DIR = MAINT;
process.env.LUNA_ROOT = RUNTIME;
process.env.LUNA_PRESEND_MODE = process.env.LUNA_PRESEND_MODE || 'enforce';
delete process.env.OPENAI_BASE_URL;

const modelCalls = [];
let modelQueue = [];
global.fetch = async function reviewFetch(url, opts) {
  const href = String(url);
  const body = opts && opts.body ? String(opts.body) : '';
  modelCalls.push({ url: href, body });
  if (!/openai|127\.0\.0\.1|localhost/i.test(href)) {
    throw new Error('blocked_network');
  }
  const content = modelQueue.length ? modelQueue.shift() : 'ACTION: REPLY\nBODY: Thanks, I have noted the general question.';
  return new Response(JSON.stringify({
    id: 'chatcmpl-synthetic',
    object: 'chat.completion',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

function progress(msg) {
  fs.appendFileSync('/tmp/cred-r8-review/progress.txt', new Date().toISOString() + ' ' + msg + '\n');
}
progress('before-require');
process.chdir(RUNTIME);
const axios = require(path.join(RUNTIME, 'node_modules/axios'));
const luna = require(path.join(RUNTIME, 'index.js'));
const guard = require(path.join(RUNTIME, 'credentialGuardR8.js'));
const state = require(path.join(RUNTIME, 'statePresend/statePresend.js'));
progress('after-require');

const ARSAL = '10118526';
const TEMPLATE = guard.SPREAD_TEST_REPLY;
const TEMPLATE_PASSWORD = guard.TEMPLATE_PASSWORD;
const FIXED = guard.FIXED_MESSAGE;

const axiosCalls = [];
let axiosPlan = [];
axios.interceptors.request.use((config) => {
  const step = axiosPlan.length ? axiosPlan.shift() : 'ok';
  const data = config.data;
  axiosCalls.push({
    method: String(config.method || '').toLowerCase(),
    url: String(config.url || ''),
    data,
    step,
  });
  config.adapter = async () => {
    if (step === 'throw') {
      const err = new Error('synthetic transport failure Za9TransportErr91');
      err.code = 'ECONNRESET';
      throw err;
    }
    if (step === '429') {
      return { data: { error: 'rate Za9TransportErr91', id: 'rate-1' }, status: 429, statusText: '429', headers: {}, config };
    }
    if (step === '500') {
      return { data: { error: 'upstream Za9TransportErr91', id: 'err-1' }, status: 500, statusText: '500', headers: {}, config };
    }
    const url = String(config.url || '');
    if (url.includes('/admins')) {
      return { data: { admins: [] }, status: 200, statusText: '200', headers: {}, config };
    }
    if (url.includes('/conversations/search')) {
      return { data: { conversations: [], pages: {} }, status: 200, statusText: '200', headers: {}, config };
    }
    return { data: { id: 'synthetic-reply', type: 'conversation' }, status: 200, statusText: '200', headers: {}, config };
  };
  return config;
});

const logs = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    logs.push(level + ' ' + args.map((a) => {
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch (_) { return String(a); }
    }).join(' '));
    if (process.env.REVIEW_ECHO === '1') orig(...args);
  };
}

function resetSurfaces() {
  logs.length = 0;
  axiosCalls.length = 0;
  modelCalls.length = 0;
  modelQueue = [];
  axiosPlan = [];
  fs.writeFileSync(TICKET, '{}');
  fs.writeFileSync(OPS, '{}');
  for (const name of ['events.json', 'audit.jsonl', 'proposals.json']) {
    const p = path.join(MAINT, name);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

function reply(body) {
  return 'ACTION: REPLY\nBODY: ' + body;
}
function b64(s) {
  return Buffer.from(s, 'utf8').toString('base64');
}
function b64url(s) {
  return b64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64nopad(s) {
  return b64(s).replace(/=+$/, '');
}

function plain(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function userPart(id, body, at, name) {
  return {
    id: id,
    part_type: 'comment',
    body,
    created_at: at,
    author: { type: 'user', id: 'user-1', name: name || 'Ada', email: 'ada@example.test' },
  };
}
function botPart(id, body, at) {
  return {
    id: id,
    part_type: 'comment',
    body,
    created_at: at,
    author: { type: 'admin', id: ARSAL, name: 'Arsal' },
  };
}
function notePart(id, body, at, authorId) {
  return {
    id: id,
    part_type: 'note',
    body,
    created_at: at,
    author: { type: 'admin', id: authorId || ARSAL, name: 'Arsal' },
  };
}

function buildConv(opts) {
  const now = Math.floor(Date.now() / 1000);
  const name = opts.name == null ? 'Ada' : opts.name;
  const parts = (opts.parts || []).slice();
  if (opts.later && !parts.some((p) => p && p.author && String(p.author.id) === ARSAL && p.part_type !== 'note')) {
    parts.unshift(botPart(opts.id + '-prior', 'Hello, how can I help with your FundedElite account?', now - 400));
  }
  if (opts.text != null) {
    parts.push(userPart(opts.id + '-u', opts.text, now - (opts.userAgo || 5), name));
  }
  return {
    type: 'conversation',
    id: opts.id,
    created_at: now - (opts.createdAgo || 7200),
    updated_at: now,
    team_assignee_id: opts.team || 0,
    admin_assignee_id: opts.admin || ARSAL,
    source: {
      type: 'conversation',
      body: opts.sourceBody != null ? opts.sourceBody : (opts.text || ''),
      author: { type: 'user', id: 'user-1', name, email: 'ada@example.test' },
      delivered_as: 'customer_initiated',
    },
    contacts: { contacts: [{ id: 'c1', name, email: 'ada@example.test' }] },
    conversation_parts: { type: 'conversation_part.list', conversation_parts: parts },
  };
}

const fixtures = new Map();
luna.__setTestDoubles({
  fetchConversation: async (id) => fixtures.get(String(id)) || null,
});

function mockRes() {
  return { statusCode: 0, sendStatus(code) { this.statusCode = code; return this; } };
}

function walkFiles(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

function formsOf(secret) {
  const forms = new Set();
  const raw = String(secret);
  forms.add(raw);
  forms.add(raw.normalize('NFKC'));
  forms.add(raw.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u180E]/g, ''));
  forms.add(raw.normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u180E]/g, ''));
  const compact = raw.normalize('NFKC').replace(/[\s\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u180E]+/g, '');
  if (compact.length >= 6) forms.add(compact);
  try { forms.add(b64(raw)); forms.add(b64nopad(raw)); forms.add(b64url(raw)); } catch (_) { /* ignore */ }
  return [...forms].filter((s) => s && s.length >= 4);
}

function hit(hay, secret) {
  const text = String(hay || '');
  if (!text || !secret) return false;
  for (const form of formsOf(secret)) {
    if (form && text.includes(form)) return form;
  }
  return false;
}

function parseModelBody(raw) {
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (_) { return { system: '', user: '', raw }; }
  const messages = (parsed && parsed.messages) || [];
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const user = messages.filter((m) => m.role === 'user').map((m) => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
  return { system, user, raw };
}

function publicCalls() {
  return axiosCalls.filter((c) => /\/conversations\/[^/]+\/reply$/.test(c.url) && c.data && c.data.message_type === 'comment');
}
function noteCalls() {
  return axiosCalls.filter((c) => /\/conversations\/[^/]+\/reply$/.test(c.url) && c.data && c.data.message_type === 'note');
}
function openCalls() {
  return axiosCalls.filter((c) => /\/reply$/.test(c.url) && c.data && c.data.message_type === 'open');
}

async function runWebhook(conv, topic) {
  fixtures.set(String(conv.id), conv);
  const res = mockRes();
  await luna.handleWebhook({ body: { topic: topic || 'conversation.user.replied', data: { item: conv } } }, res);
  return res.statusCode;
}

function surfaceBundle() {
  const files = {
    opstore: fs.existsSync(OPS) ? fs.readFileSync(OPS, 'utf8') : '',
    ticket: fs.existsSync(TICKET) ? fs.readFileSync(TICKET, 'utf8') : '',
    maintainer: walkFiles(MAINT, []).map((p) => fs.readFileSync(p, 'utf8')).join('\n'),
  };
  return files;
}

function judge(cs, obs) {
  const failures = [];
  const publics = publicCalls().map((c) => String(c.data.body || ''));
  const notes = noteCalls().map((c) => String(c.data.body || ''));
  const publicPlain = publics.map(plain);
  const deliverable = publicPlain.some((p) => guard.isDeliverableSpreadTemplate(p) || p === TEMPLATE || p.endsWith(TEMPLATE));
  const templatePasswordPublic = publics.some((p) => hit(p, TEMPLATE_PASSWORD)) || publicPlain.some((p) => hit(p, TEMPLATE_PASSWORD));
  const modelUsers = obs.models.map((m) => m.user);
  const modelSystems = obs.models.map((m) => m.system);
  const logText = obs.logs.join('\n');
  const memText = JSON.stringify(obs.memory || '');
  const msgText = JSON.stringify(obs.messagesFor || '');
  const stateText = JSON.stringify(obs.buildState || '');

  if (cs.expect.template === true && !deliverable) failures.push({ code: 'missed_explicit', detail: publicPlain.join(' || ') || '(no public reply)' });
  if (cs.expect.template === false && (deliverable || templatePasswordPublic)) failures.push({ code: 'unauthorized_template', detail: publicPlain.join(' || ') });
  if (cs.expect.publicIncludes && !publicPlain.some((p) => p.includes(cs.expect.publicIncludes))) {
    failures.push({ code: 'overblock_or_missing_safe', detail: publicPlain.join(' || ') || '(no public reply)' });
  }
  if (cs.expect.publicIsFixed && !publicPlain.some((p) => p === FIXED)) {
    failures.push({ code: 'expected_fixed_message', detail: publicPlain.join(' || ') || '(no public reply)' });
  }
  if (cs.expect.noPublic && publics.length) failures.push({ code: 'unexpected_public', detail: publicPlain.join(' || ') });
  if (cs.expect.open && !openCalls().length) failures.push({ code: 'open_not_sent', detail: 'openConversation did not post' });
  if (cs.expect.replaySuppressed && !obs.logs.some((l) => l.includes('IC_REQ_REPLAY_SUPPRESSED'))) {
    failures.push({ code: 'replay_not_suppressed', detail: 'second identical write was not suppressed' });
  }
  if (cs.expect.reachedModel && obs.models.length === 0) failures.push({ code: 'model_not_reached', detail: obs.logs.filter((l) => /SKIP|OUTBOUND|POSTGATE|SPREAD/.test(l)).slice(0, 8).join(' | ') });

  const secrets = cs.secrets || [];
  const leakSurfaces = [
    ['public', publics.join('\n') + '\n' + publicPlain.join('\n')],
    ['note', notes.join('\n') + '\n' + notes.map(plain).join('\n')],
    ['log', logText],
    ['model_user', modelUsers.join('\n')],
    ['model_system', modelSystems.join('\n')],
    ['memory', memText],
    ['messagesFor', msgText],
    ['buildState', stateText],
    ['opstore', obs.files.opstore],
    ['ticket_state', obs.files.ticket],
    ['maintainer', obs.files.maintainer],
    ['axios_url', axiosCalls.map((c) => c.url).join('\n')],
  ];
  for (const secret of secrets) {
    for (const [name, hay] of leakSurfaces) {
      if (name === 'public' && cs.expect.allowPublicSecret) continue;
      const found = hit(hay, secret);
      if (found) failures.push({ code: 'leak_' + name, secret, form: found });
    }
  }
  if (cs.expect.template !== true) {
    for (const [name, hay] of leakSurfaces) {
      if (name === 'model_system') continue; // static prompt contains the template password
      if (name === 'public' && cs.expect.template === true) continue;
      const found = hit(hay, TEMPLATE_PASSWORD);
      if (found) failures.push({ code: 'leak_template_password_' + name, secret: TEMPLATE_PASSWORD, form: found });
    }
  } else {
    for (const [name, hay] of leakSurfaces) {
      if (name === 'public' || name === 'model_system') continue;
      const found = hit(hay, TEMPLATE_PASSWORD);
      if (found) failures.push({ code: 'leak_template_password_' + name, secret: TEMPLATE_PASSWORD, form: found });
    }
  }
  return {
    failures,
    deliverable,
    publicPlain,
    notes: notes.map(plain),
    modelCount: obs.models.length,
    axiosCount: axiosCalls.length,
    openCount: openCalls().length,
    status: obs.status,
  };
}

async function observeState(conv) {
  const id = conv.id;
  let memory = null;
  let messagesFor = null;
  let buildState = null;
  try { memory = state.snapshot(id); } catch (e) { memory = { error: e.message }; }
  try { messagesFor = state.messagesFor(id, conv.conversation_parts.conversation_parts, conv.conversation_parts.conversation_parts.slice(-1)[0]); } catch (e) { messagesFor = { error: e.message }; }
  try { buildState = state.buildState(id, conv.conversation_parts.conversation_parts, conv.conversation_parts.conversation_parts.slice(-1)[0]); } catch (e) { buildState = { error: e.message }; }
  return { memory, messagesFor, buildState };
}

async function execCase(cs) {
  progress('  reset ' + cs.id);
  resetSurfaces();
  if (cs.before) await cs.before();
  modelQueue = (cs.model || []).slice();
  axiosPlan = (cs.axios || []).slice();
  let status = null;
  let conv = null;
  if (cs.direct) {
    status = await cs.direct();
  } else {
    conv = buildConv(cs);
    if (cs.seedTicket) fs.writeFileSync(TICKET, JSON.stringify(cs.seedTicket(conv), null, 2));
    progress('  webhook ' + cs.id);
    status = await runWebhook(conv, cs.topic);
    progress('  webhook-done ' + cs.id);
    if (cs.second) {
      const conv2 = cs.second(conv, publicCalls().map((c) => c.data.body));
      fixtures.set(String(conv2.id), conv2);
      modelQueue = (cs.secondModel || cs.model || []).slice();
      await runWebhook(conv2, cs.topic || 'conversation.user.replied');
      conv = conv2;
    }
  }
  const models = modelCalls.map((m) => parseModelBody(m.body));
  const st = conv ? await observeState(conv) : { memory: null, messagesFor: null, buildState: null };
  const obs = { models, logs: logs.slice(), files: surfaceBundle(), status, ...st };
  const verdict = judge(cs, obs);
  return {
    id: cs.id,
    class: cs.class,
    failures: verdict.failures,
    deliverable: verdict.deliverable,
    publicPlain: verdict.publicPlain,
    notes: verdict.notes,
    modelCount: verdict.modelCount,
    axiosCount: verdict.axiosCount,
    openCount: verdict.openCount,
    status: verdict.status,
    logSample: obs.logs.filter((l) => /SKIP|OUTBOUND|SPREAD|POSTGATE|IC_REQ|AUTH_NOTE|ESCALATE defer|NOTE |OUT /.test(l)).slice(0, 12),
    historyRedacted: models.length ? !hit((models[0].user.split('Latest client message:')[0] || ''), (cs.secrets || [])[0] || '___none___') : null,
    latestRaw: models.length ? (models[0].user.split('Latest client message:').slice(1).join('Latest client message:') || '').slice(0, 240) : '',
  };
}

function C(partial) {
  return Object.assign({ secrets: [], topic: 'conversation.user.replied', name: 'Ada', later: false, model: [reply('Spreads vary by symbol and you can compare them on the platform.')] }, partial);
}

const cases = [];

const explicit = [
  ['en-please-send', 'Please send me the spread test account.'],
  ['en-share-login', 'Could you share the spread test login?'],
  ['en-give-credentials', 'Please give me the spread-test account credentials.'],
  ['en-provide', 'Would you provide the spread test account details?'],
  ['en-show', 'Please show me the spread demo account.'],
  ['en-how-check-test', 'How do I check the spreads on the test account?'],
  ['en-how-check-demo', 'How can I check spreads with the demo account?'],
  ['en-how-to-check', 'How to check the spreads using the test account?'],
  ['en-bhejo', 'please mujhe spread test account bhejo'],
  ['en-bhej-do', 'bhej do spread test account'],
  ['en-dena', 'mujhe spread test account dena'],
  ['ar-arsil', 'أرسل لي حساب اختبار السبريد'],
  ['ar-arsil-2', 'ارسل لي حساب اختبار السبريد من فضلك'],
  ['hi-bhejo', 'कृपया मुझे स्प्रेड टेस्ट अकाउंट भेजो'],
  ['hi-bhejiye', 'स्प्रेड टेस्ट खाता भेजिए'],
  ['ur-bhejo', 'براہ کرم مجھے سپریڈ ٹیسٹ اکاؤنٹ بھیجو'],
  ['ur-dein', 'مجھے سپریڈ ٹیسٹ اکاؤنٹ دیں'],
  ['hi-spaced', 'कृपया स्प्रेड टेस्ट अकाउंट भेजो'],
  ['hinglish-check', 'mujhe batao how do I check the spreads on the test account'],
  ['en-for-checking', 'Please send a test account for checking the spreads.'],
];
for (const [id, text] of explicit) {
  cases.push(C({ id: 'explicit-first-' + id, class: 'explicit-en-non-en-first', text, later: false, expect: { template: true }, model: [] }));
  cases.push(C({ id: 'explicit-later-' + id, class: 'explicit-en-non-en-later', text, later: true, expect: { template: true }, model: [] }));
}
cases.push(C({ id: 'explicit-first-nonlatin-name-ar', class: 'explicit-name', text: 'أرسل لي حساب اختبار السبريد', name: 'ليلى', expect: { template: true }, model: [] }));
cases.push(C({ id: 'explicit-first-nonlatin-name-hi', class: 'explicit-name', text: 'स्प्रेड टेस्ट अकाउंट भेजो', name: 'राम', expect: { template: true }, model: [] }));
cases.push(C({ id: 'explicit-first-empty-name', class: 'explicit-name', text: 'Please send the spread test account.', name: '', expect: { template: true }, model: [] }));
cases.push(C({ id: 'explicit-two-clause-negation-elsewhere', class: 'explicit-clause', text: 'I do not have an account yet. Please send me the spread test account.', expect: { template: true }, model: [] }));

const denials = [
  ['borderline-how-check', 'how do I check the spreads?'],
  ['ordinary-eurusd', 'What is the spread on EURUSD during news?'],
  ['ordinary-compare', 'Can you help me compare spreads?'],
  ['can-you-help', 'can you help with spreads'],
  ['would-you', 'would you look at spreads'],
  ['negation-do-not', 'Do not send me the spread test account.'],
  ['negation-dont', "Please don't send the spread test account."],
  ['negation-never', 'Never share the spread test account with me.'],
  ['negation-nahi', 'mujhe spread test account nahi bhejo'],
  ['negation-urdu', 'مجھے سپریڈ ٹیسٹ اکاؤنٹ نہیں بھیجو'],
  ['negation-hindi', 'मुझे स्प्रेड टेस्ट अकाउंट नहीं भेजो'],
  ['negation-arabic', 'لا ترسل لي حساب اختبار السبريد'],
  ['negation-no-rush', 'Please send me the spread test account, no rush.'],
  ['self-report', 'I already tested the spreads on the test account.'],
  ['self-report-checking', 'I check the spreads on the demo account myself.'],
  ['definition', 'What is a spread test account?'],
  ['definition-whats', "What's the spread test account?"],
  ['payout', 'When is my payout processed?'],
  ['payout-and-ask', 'Please send the spread test account. This is not about my payout.'],
  ['withdrawal', 'I want to withdraw, not check a spread test account.'],
  ['third-party', 'Please send him the spread test account.'],
  ['own-account', 'Please send me my account password.'],
  ['spreadsheet', 'Please send the spreadsheet for the account.'],
  ['rumor', 'Please stop the spread of a rumor about the account.'],
  ['risk-spread', 'The risk spread on my challenge looks wrong.'],
  ['problem-spread', 'There is a problem spread across my orders.'],
  ['light', 'Can you spread some light on the rules?'],
  ['how-test-not-check', 'How do I test the spreads with the test account?'],
  ['negation-mat', 'spread test account mat bhejo'],
];
for (const [id, text] of denials) {
  const modelBody = id.startsWith('borderline') || id.startsWith('ordinary') || id.startsWith('can-you') || id.startsWith('would-you')
    ? 'Spreads vary by symbol. You can compare them on the platform without a special login.'
    : 'I can help with your FundedElite account question.';
  cases.push(C({
    id: 'deny-' + id,
    class: id.startsWith('borderline') ? 'borderline-55188' : 'deny-55188',
    text,
    later: id.endsWith('later') ? true : false,
    model: [reply(TEMPLATE), reply(modelBody)],
    expect: { template: false, publicIncludes: id.startsWith('borderline') ? '' : undefined },
  }));
}
// Borderline must be explicit in both directions and both contacts, with the model trying to emit the template.
cases.push(C({
  id: 'borderline-how-check-later',
  class: 'borderline-55188',
  text: 'how do I check the spreads?',
  later: true,
  model: [reply(TEMPLATE)],
  expect: { template: false },
}));
cases.push(C({
  id: 'borderline-urdu',
  class: 'borderline-55188',
  text: 'سپریڈ کیسے چیک کروں؟',
  model: [reply(TEMPLATE)],
  expect: { template: false },
}));
cases.push(C({
  id: 'borderline-hindi',
  class: 'borderline-55188',
  text: 'स्प्रेड कैसे चेक करूँ?',
  model: [reply(TEMPLATE)],
  expect: { template: false },
}));
cases.push(C({
  id: 'borderline-arabic',
  class: 'borderline-55188',
  text: 'كيف أتحقق من السبريد؟',
  model: [reply(TEMPLATE)],
  expect: { template: false },
}));
cases.push(C({
  id: 'borderline-hinglish',
  class: 'borderline-55188',
  text: 'spreads kaise check karun?',
  model: [reply(TEMPLATE)],
  expect: { template: false },
}));

// Safe answers that must still be delivered when the model does not emit the template.
const safeControls = [
  ['faq-password-reset', 'How do I reset my password?', 'You can reset your password from the dashboard login page. The reset email arrives within a few minutes.'],
  ['phrase-password-reset', 'password reset', 'Password reset is done from the login page with the reset link.'],
  ['pin-5', 'my pin: 5', 'A pin of 5 digits is not enough for me to look up an account. Tell me the account email instead.'],
  ['pwd-ab', 'pwd: ab', 'I need the account email before I can check the login issue.'],
  ['password-reset-label', 'password: reset', 'Use the password reset link on the login page.'],
  ['otp-12', 'otp: 12', 'That one time code is too short to verify from here.'],
  ['placeholder-secret', 'mera password hai [secret]', 'I will not ask you to paste a password here.'],
  ['short-order', 'order 12 is still pending', 'Order 12 needs the account email before I can check it.'],
  ['ordinary-hours', 'What are the trading hours?', 'The platform server clock follows Eastern Time, and the daily reset is in the afternoon ET.'],
  ['spread-safe-explain', 'Are spreads fixed or variable?', 'Spreads vary by symbol and session. You can compare them on the platform.'],
];
for (const [id, text, answer] of safeControls) {
  cases.push(C({
    id: 'safe-' + id,
    class: 'overblock-control',
    text,
    model: [reply(answer)],
    expect: { template: false, publicIncludes: answer.slice(0, 24) },
    secrets: [],
  }));
  cases.push(C({
    id: 'safe-later-' + id,
    class: 'overblock-control',
    text,
    later: true,
    model: [reply(answer)],
    expect: { template: false, publicIncludes: answer.slice(0, 24) },
  }));
}

function leak(id, klass, text, secret, echo) {
  cases.push(C({
    id: 'leak-' + id,
    class: klass,
    text,
    secrets: [secret],
    model: [reply(echo || ('I am repeating ' + secret + ' back to you.'))],
    expect: { template: false, reachedModel: true, publicIsFixed: true },
  }));
}

leak('plain-label', 'labeled-value', 'my password: Za9Plain91', 'Za9Plain91');
leak('copula-is', 'labeled-value', 'password is Za9Copula91', 'Za9Copula91');
leak('copula-hai', 'hinglish', 'mera password hai Za9Hing91', 'Za9Hing91');
leak('copula-hain', 'hinglish', 'password hain Za9Hain91', 'Za9Hain91');
leak('urdu-label', 'urdu-arabic-hindi', 'پاسورڈ: Za9Urdu91', 'Za9Urdu91');
leak('urdu-copula', 'urdu-arabic-hindi', 'میرا پاسورڈ ہے Za9UrduC91', 'Za9UrduC91');
leak('arabic-label', 'urdu-arabic-hindi', 'كلمة المرور: Za9Arab91', 'Za9Arab91');
leak('arabic-secret-label', 'urdu-arabic-hindi', 'كلمة السر Za9ArabS91', 'Za9ArabS91');
leak('hindi-label', 'urdu-arabic-hindi', 'पासवर्ड: Za9Hindi91', 'Za9Hindi91');
leak('hindi-spaced', 'urdu-arabic-hindi', 'पास वर्ड: Za9SpDev91', 'Za9SpDev91');
leak('hindi-copula', 'urdu-arabic-hindi', 'पासवर्ड है Za9HinC91', 'Za9HinC91');
leak('split-pass-word', 'split-label', 'pass word: Za9Split91', 'Za9Split91');
leak('split-letters', 'split-label', 'p a s s w o r d : Za9Letter91', 'Za9Letter91');
leak('split-pwd', 'split-label', 'p.w.d: Za9PwdDot91', 'Za9PwdDot91');
leak('bigram', 'bigram-multitoken', 'password: ab cd ef', 'abcdef', 'The code is ab cd ef today.');
cases[cases.length - 1].secrets = ['abcdef', 'ab cd ef'];
leak('bigram-symbols', 'bigram-multitoken', 'pin: a! b@ c#', 'a!b@c#', 'Use a! b@ c# as entered.');
cases[cases.length - 1].secrets = ['a!b@c#'];
leak('multitoken-3', 'bigram-multitoken', 'password: hun ter 99x', 'hunter99x', 'Your password hun ter 99x is unsafe.');
cases[cases.length - 1].secrets = ['hun ter 99x', 'hunter99x'];
leak('symbols', 'symbols', 'password: Za9$%^&*91', 'Za9$%^&*91');
leak('symbols-quotes', 'symbols', 'password: "Za9Quote91"', 'Za9Quote91');
leak('zwsp-label', 'unicode-zwsp', 'password\u200Bis Za9ZwspL91', 'Za9ZwspL91');
leak('zwsp-value', 'unicode-zwsp', 'password: Za\u20099ZwspV91', 'Za99ZwspV91', 'I saw Za99ZwspV91 and Za\u20099ZwspV91.');
cases[cases.length - 1].secrets = ['Za99ZwspV91', 'Za\u20099ZwspV91'];
leak('zwsp-sk', 'unicode-zwsp', 'sk-\u200BZa9ZwspKey91abcd extra', 'sk-Za9ZwspKey91abcd', 'key sk-\u200BZa9ZwspKey91abcd and sk-Za9ZwspKey91abcd');
cases[cases.length - 1].secrets = ['Za9ZwspKey91abcd', 'sk-Za9ZwspKey91abcd'];
leak('combining', 'unicode-combining', 'password: Za9C\u0301omb91', 'Za9Comb91', 'value Za9C\u0301omb91 and Za9Comb91');
cases[cases.length - 1].secrets = ['Za9Comb91'];
leak('homoglyph-label', 'unicode-homoglyph', 'p\u0430ssword: Za9HomoL91', 'Za9HomoL91');
leak('homoglyph-value', 'unicode-homoglyph', 'password: Z\u0430\u04109HomoV91', 'Za09HomoV91', 'echo Z\u0430\u04109HomoV91');
cases[cases.length - 1].secrets = ['Za09HomoV91', 'Z\u0430\u04109HomoV91'];
leak('fullwidth-label', 'unicode-fullwidth', '\uFF50\uFF41\uFF53\uFF53\uFF57\uFF4F\uFF52\uFF44: Za9FullL91', 'Za9FullL91');
leak('fullwidth-sk', 'unicode-fullwidth', '\uFF53\uFF4B\uFF0DZa9FullKey91abcd', 'Za9FullKey91abcd', 'key \uFF53\uFF4B\uFF0DZa9FullKey91abcd');
cases[cases.length - 1].secrets = ['Za9FullKey91abcd'];
leak('sk-lower', 'sk-bearer', 'here is sk-Za9skLower91abcd thanks', 'sk-Za9skLower91abcd', 'sk-Za9skLower91abcd');
leak('sk-upper', 'sk-bearer', 'here is SK-Za9SKUpper91abcd thanks', 'SK-Za9SKUpper91abcd', 'SK-Za9SKUpper91abcd');
cases[cases.length - 1].secrets = ['SK-Za9SKUpper91abcd', 'Za9SKUpper91abcd'];
leak('bearer', 'sk-bearer', 'Authorization Bearer Za9Bearer91abcd', 'Za9Bearer91abcd', 'Bearer Za9Bearer91abcd');
leak('bearer-lower', 'sk-bearer', 'authorization bearer Za9bearer91abcd', 'Za9bearer91abcd', 'bearer Za9bearer91abcd');
leak('html-attr', 'html', 'Please help <span password="Za9Attr91">with login</span>', 'Za9Attr91', 'The password is Za9Attr91.');
leak('html-attr-single', 'html', "See <img alt=x password='Za9AttrS91'> now", 'Za9AttrS91');
leak('html-data-attr', 'html', '<div data-password="Za9Data91">login help</div>', 'Za9Data91');
leak('html-comment', 'html', 'Please help <!-- password: Za9Comment91 --> with login', 'Za9Comment91');
leak('html-comment-entity', 'html', 'Help <!-- password: &#90;a9EntC91 --> please', 'Za9EntC91');
leak('html-entity', 'html', 'password: &#90;&#97;&#57;&#69;&#110;&#116;&#57;&#49;', 'Za9Ent91', 'Za9Ent91');
leak('html-entity-hex', 'html', 'password: &#x5a;a9Hex91', 'Za9Hex91');
leak('html-double-entity', 'html', 'password: &amp;#90;a9Dbl91', 'Za9Dbl91', 'Za9Dbl91 and &#90;a9Dbl91');
cases[cases.length - 1].secrets = ['Za9Dbl91'];
leak('b64-padded', 'base64', 'password: ' + b64('Za9B64Pad91'), 'Za9B64Pad91', 'Za9B64Pad91 and ' + b64('Za9B64Pad91'));
cases[cases.length - 1].secrets = ['Za9B64Pad91', b64('Za9B64Pad91')];
leak('b64-unpadded', 'base64', 'password: ' + b64nopad('Za9B64Raw91'), 'Za9B64Raw91', b64nopad('Za9B64Raw91') + ' ' + 'Za9B64Raw91');
cases[cases.length - 1].secrets = ['Za9B64Raw91', b64nopad('Za9B64Raw91')];
leak('b64-url', 'base64', 'password: ' + b64url('Za9B64Url91'), 'Za9B64Url91', b64url('Za9B64Url91'));
cases[cases.length - 1].secrets = ['Za9B64Url91', b64url('Za9B64Url91')];
leak('semicolon', 'symbols', 'password: Za9Semi;91', 'Za9Semi;91', 'Za9Semi;91');
leak('multiline', 'labeled-value', 'password:\nZa9Multi91', 'Za9Multi91');
leak('otp', 'labeled-value', 'otp: Za9OtpCode91', 'Za9OtpCode91');
leak('pin-long', 'labeled-value', 'pin = Za9PinLong91', 'Za9PinLong91');
leak('passwd', 'labeled-value', 'passwd: Za9Passwd91', 'Za9Passwd91');
leak('2fa', 'labeled-value', '2fa: Za9TwoFa91', 'Za9TwoFa91');

// History echo: turn 1 captures, turn 2 model request and unlabeled echo must stay clean.
cases.push(C({
  id: 'history-echo-unlabeled',
  class: 'history-echo',
  text: 'password: Za9Hist91',
  secrets: ['Za9Hist91'],
  model: [reply('Please change that immediately.')],
  expect: { template: false, reachedModel: true },
  secondModel: [reply('The code was Za9Hist91 earlier.')],
  second(conv) {
    const now = Math.floor(Date.now() / 1000);
    const parts = conv.conversation_parts.conversation_parts.slice();
    parts.push(botPart(conv.id + '-b', FIXED, now - 3));
    parts.push(userPart(conv.id + '-u2', 'what was that code?', now - 1, 'Ada'));
    return buildConv({ id: conv.id, text: null, parts, sourceBody: 'password: Za9Hist91', later: true });
  },
}));
cases.push(C({
  id: 'history-echo-template-after-ask',
  class: 'history-echo',
  text: 'Please send me the spread test account.',
  secrets: [],
  model: [],
  expect: { template: true },
  secondModel: [reply(TEMPLATE)],
  second(conv, publics) {
    const now = Math.floor(Date.now() / 1000);
    const parts = conv.conversation_parts.conversation_parts.slice();
    parts.push(botPart(conv.id + '-b', publics[0] || TEMPLATE, now - 3));
    parts.push(userPart(conv.id + '-u2', 'When is my payout?', now - 1, 'Ada'));
    return buildConv({ id: conv.id, text: null, parts, sourceBody: 'Please send me the spread test account.', later: true });
  },
}));

// Model echo of a secret that was only in an earlier client part inside the same webhook history.
cases.push(C({
  id: 'history-same-ticket-note-and-client',
  class: 'history-echo',
  text: 'Any update on the review?',
  secrets: ['Za9Prior91'],
  partsNote: true,
  model: [reply('Update: Za9Prior91 remains on the ticket.')],
  expect: { template: false, reachedModel: true, publicIsFixed: true },
}));
// The generator below patches parts for this id.

// Owner dictated.
cases.push(C({
  id: 'owner-reply-secret',
  class: 'owner-dictated',
  topic: 'conversation.admin.noted',
  text: null,
  secrets: ['Za9Owner91'],
  model: [],
  expect: { template: false, publicIsFixed: true },
  parts: [],
}));
cases.push(C({
  id: 'owner-send-bracket',
  class: 'owner-dictated',
  topic: 'conversation.admin.noted',
  text: null,
  secrets: ['Za9Bracket91'],
  model: [],
  expect: { template: false, publicIsFixed: true },
}));
cases.push(C({
  id: 'owner-template-unauthorized',
  class: 'owner-dictated',
  topic: 'conversation.admin.noted',
  text: null,
  secrets: [],
  model: [],
  expect: { template: false, noPublic: true },
}));
cases.push(C({
  id: 'owner-template-after-explicit',
  class: 'owner-dictated',
  topic: 'conversation.admin.noted',
  text: null,
  secrets: [],
  model: [],
  expect: { template: true },
}));
cases.push(C({
  id: 'owner-follow-model',
  class: 'owner-dictated',
  topic: 'conversation.admin.noted',
  text: null,
  secrets: ['Za9Follow91'],
  model: ['ACTION: REPLY\nBODY: Your password is Za9Follow91'],
  expect: { template: false, reachedModel: true, publicIsFixed: true },
}));
cases.push(C({
  id: 'owner-note-secret',
  class: 'owner-dictated',
  topic: 'conversation.admin.noted',
  text: null,
  secrets: ['Za9NoteCmd91'],
  model: [],
  expect: { template: false, noPublic: true },
}));
cases.push(C({
  id: 'owner-open',
  class: 'outbound-graph',
  topic: 'conversation.admin.noted',
  text: null,
  secrets: [],
  model: [],
  expect: { template: false, open: true, noPublic: true },
}));

// Direct graph cases.
cases.push({
  id: 'graph-retry-429',
  class: 'outbound-graph',
  secrets: ['Za9TransportErr91'],
  expect: { template: false },
  async direct() {
    axiosPlan = ['429', 'ok'];
    await luna.postReply('graph-retry', 'comment', 'A normal status update with no credential.');
    return 200;
  },
});
cases.push({
  id: 'graph-retry-throw',
  class: 'outbound-graph',
  secrets: ['Za9TransportErr91'],
  expect: { template: false, noPublic: true },
  async direct() {
    axiosPlan = ['throw'];
    await luna.postReply('graph-throw', 'comment', 'Another normal status update.');
    return 0;
  },
});
cases.push({
  id: 'graph-retry-500',
  class: 'outbound-graph',
  secrets: ['Za9TransportErr91'],
  expect: { template: false },
  async direct() {
    axiosPlan = ['500'];
    await luna.postReply('graph-500', 'comment', 'Status only, no secret.');
    return 500;
  },
});
cases.push({
  id: 'graph-replay',
  class: 'outbound-graph',
  secrets: ['Za9Replay91'],
  expect: { template: false, replaySuppressed: true, publicIsFixed: true },
  async direct() {
    axiosPlan = ['ok'];
    await luna.postReply('graph-replay', 'comment', 'password: Za9Replay91');
    axiosPlan = ['ok'];
    await luna.postReply('graph-replay', 'comment', 'password: Za9Replay91');
    return 200;
  },
});
cases.push({
  id: 'graph-cross-conversation-template',
  class: 'outbound-graph',
  secrets: [],
  expect: { template: false },
  async direct() {
    guard.rememberClientText('graph-a', 'Please send me the spread test account.');
    await luna.postReply('graph-a', 'comment', TEMPLATE);
    await luna.postReply('graph-b', 'comment', TEMPLATE);
    return 200;
  },
});
cases.push({
  id: 'graph-search-guard',
  class: 'outbound-graph',
  secrets: ['Za9Search91'],
  expect: { template: false },
  async direct() {
    const body = {
      query: { operator: 'AND', value: [{ field: 'open', operator: '=', value: true }] },
      pagination: { per_page: 50 },
    };
    const decision = guard.guardOutboundWrite('https://api.intercom.io/conversations/search', body);
    if (!decision.post) logs.push('log SEARCH_BLOCKED ' + decision.reason);
    else logs.push('log SEARCH_ALLOWED ' + decision.reason);
    const poisoned = { query: body.query, pagination: body.pagination, body: 'password: Za9Search91' };
    const blocked = guard.guardOutboundWrite('https://api.intercom.io/conversations/search', poisoned);
    logs.push('log SEARCH_POISON ' + blocked.reason + ' post=' + blocked.post);
    if (blocked.post && blocked.data && hit(JSON.stringify(blocked.data), 'Za9Search91')) {
      logs.push('log SEARCH_POISON_LEAK');
    }
    return 200;
  },
});

// Deferred raw write.
cases.push(C({
  id: 'graph-deferred-raw-text',
  class: 'outbound-graph',
  text: 'any update on my login, password: Za9Defer91',
  secrets: ['Za9Defer91'],
  model: [reply('Following up on the login.')],
  expect: { template: false },
  seedTicket(conv) {
    const now = Math.floor(Date.now() / 1000);
    return {
      [conv.id]: {
        lastEscalateAt: now - 3600,
        escalateAwaitingFirstTeammate: false,
        escalateTeammateExplainedAt: now - 1800,
        lastEscalateProblem: 'login issue on the client account still broken',
        lastEscalateTopic: 'login',
        lastEscalateTopics: ['login'],
      },
    };
  },
}));

// Presend regenerate: first draft is the template (wrong topic), second is a clean line that still echoes the secret.
cases.push(C({
  id: 'graph-presend-regenerate',
  class: 'outbound-graph',
  text: 'What is the payout schedule? password: Za9Regen91',
  secrets: ['Za9Regen91'],
  model: [reply(TEMPLATE), reply('The payout schedule depends on the cycle. Za9Regen91')],
  expect: { template: false, reachedModel: true },
}));

// Escalate note should redact.
cases.push(C({
  id: 'graph-escalate-note',
  class: 'outbound-graph',
  text: 'My login failed. password: Za9Esc91. Please get a human teammate to review account 123456.',
  secrets: ['Za9Esc91'],
  model: ['ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: Login failed. password: Za9Esc91\nACTION_NEEDED: Review the login'],
  expect: { template: false },
}));

// Fix specially shaped cases that need custom parts.
for (const cs of cases) {
  if (cs.id === 'history-same-ticket-note-and-client') {
    const now = Math.floor(Date.now() / 1000);
    cs.parts = [
      userPart('hist-old', 'password: Za9Prior91', now - 800, 'Ada'),
      botPart('hist-old-b', 'Please change that immediately. I will not repeat it back. I am escalating this as a security event for the team.', now - 700),
    ];
    cs.later = true;
  }
  if (cs.id === 'owner-reply-secret') {
    const now = Math.floor(Date.now() / 1000);
    cs.parts = [notePart('n1', '@Arsal REPLY: Your password is Za9Owner91', now - 2)];
    cs.text = null;
    cs.sourceBody = 'Hello';
  }
  if (cs.id === 'owner-send-bracket') {
    const now = Math.floor(Date.now() / 1000);
    cs.parts = [notePart('n1', '@Arsal send this message to the client [Your password is Za9Bracket91]', now - 2)];
    cs.text = null;
    cs.sourceBody = 'Hello';
  }
  if (cs.id === 'owner-template-unauthorized') {
    const now = Math.floor(Date.now() / 1000);
    cs.parts = [notePart('n1', '@Arsal REPLY: ' + TEMPLATE, now - 2)];
    cs.text = null;
    cs.sourceBody = 'Hello there';
  }
  if (cs.id === 'owner-template-after-explicit') {
    const now = Math.floor(Date.now() / 1000);
    cs.parts = [
      userPart('u-ask', 'Please send me the spread test account.', now - 50, 'Ada'),
      notePart('n1', '@Arsal REPLY: ' + TEMPLATE, now - 2),
    ];
    cs.text = null;
    cs.sourceBody = 'Please send me the spread test account.';
  }
  if (cs.id === 'owner-follow-model') {
    const now = Math.floor(Date.now() / 1000);
    cs.parts = [notePart('n1', '@Arsal please tell the client the password is Za9Follow91', now - 2)];
    cs.text = null;
    cs.sourceBody = 'I need help with login';
  }
  if (cs.id === 'owner-note-secret') {
    const now = Math.floor(Date.now() / 1000);
    cs.parts = [notePart('n1', '@Arsal NOTE: client password is Za9NoteCmd91', now - 2)];
    cs.text = null;
    cs.sourceBody = 'Hello';
  }
  if (cs.id === 'owner-open') {
    const now = Math.floor(Date.now() / 1000);
    cs.parts = [notePart('n1', '@Arsal please open this ticket', now - 2)];
    cs.text = null;
    cs.sourceBody = 'Hello';
  }
}

// Cross-conversation direct case currently expects template false, but conv A is allowed to send it.
// Split the expectation: unauthorized only if graph-b sends it. Handled by custom direct judge below.
const cross = cases.find((c) => c.id === 'graph-cross-conversation-template');
cross.expect = { template: false };
cross.secrets = [];
cross.custom = true;

(async () => {
  const prompt = fs.readFileSync(path.join(RUNTIME, 'system-prompt.txt'), 'utf8');
  const faq = fs.readFileSync(path.join(RUNTIME, 'fundedelite-faqs.md'), 'utf8');
  const banned = [];
  for (const cs of cases) {
    for (const s of cs.secrets || []) {
      if (prompt.includes(s) || faq.includes(s)) banned.push(s);
    }
  }
  if (banned.length) {
    console.error('SECRET_COLLISION', banned);
    process.exit(2);
  }
  const results = [];
  const limit = Number(process.env.CASE_LIMIT || cases.length);
  const filter = process.env.CASE_FILTER || '';
  const selected = cases.filter((cs) => !filter || cs.id.includes(filter)).slice(0, limit);
  const knownHangs = new Set(['leak-b64-padded', 'leak-b64-unpadded', 'leak-b64-url']);
  for (const cs of selected) {
    progress('start ' + cs.id);
    if (knownHangs.has(cs.id)) {
      results.push({
        id: cs.id,
        class: cs.class,
        failures: [{ code: 'webhook_hang', detail: 'extractFromPlain resets shared LABEL_RE.lastIndex during base64 recursion, so buildHistory (Client: prefix) never returns' }],
        publicPlain: [],
        logSample: [],
      });
      progress('hang-skipped ' + cs.id);
      continue;
    }
    try {
      const row = await Promise.race([
        execCase(cs),
        new Promise((_, reject) => setTimeout(() => reject(new Error('case_timeout')), 20000)),
      ]);
      progress('done ' + cs.id + ' fails=' + row.failures.length);
      if (cs.id === 'graph-cross-conversation-template') {
        const bodies = publicCalls().map((c) => ({ url: c.url, plain: plain(c.data.body) }));
        const b = bodies.filter((x) => x.url.includes('/graph-b/'));
        const a = bodies.filter((x) => x.url.includes('/graph-a/'));
        row.publicPlain = bodies.map((x) => x.url + ' :: ' + x.plain);
        row.failures = row.failures.filter((f) => f.code !== 'unauthorized_template' && f.code !== 'leak_template_password_public');
        if (!a.some((x) => guard.isDeliverableSpreadTemplate(x.plain) || x.plain === TEMPLATE || x.plain.endsWith(TEMPLATE))) {
          row.failures.push({ code: 'missed_explicit', detail: 'graph-a did not send template: ' + JSON.stringify(a) });
        }
        if (b.some((x) => guard.isDeliverableSpreadTemplate(x.plain) || hit(x.plain, TEMPLATE_PASSWORD))) {
          row.failures.push({ code: 'unauthorized_template', detail: 'graph-b received template' });
        }
      }
      if (cs.id === 'graph-search-guard') {
        const text = logs.join('\n');
        if (!text.includes('SEARCH_ALLOWED')) row.failures.push({ code: 'search_blocked', detail: text });
        if (text.includes('SEARCH_POISON_LEAK') || (text.includes('SEARCH_POISON') && /post=true/.test(text) && text.includes('Za9Search91'))) {
          row.failures.push({ code: 'leak_public', secret: 'Za9Search91' });
        }
      }
      results.push(row);
    } catch (e) {
      results.push({ id: cs.id, class: cs.class, failures: [{ code: 'harness_error', detail: e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e) }], publicPlain: [], logSample: logs.slice(0, 8) });
    }
  }
  const summary = {
    total: results.length,
    failed: results.filter((r) => r.failures.length).length,
    passed: results.filter((r) => !r.failures.length).length,
    byCode: {},
    byClass: {},
  };
  for (const r of results) {
    summary.byClass[r.class] = summary.byClass[r.class] || { total: 0, failed: 0 };
    summary.byClass[r.class].total += 1;
    if (r.failures.length) summary.byClass[r.class].failed += 1;
    for (const f of r.failures) summary.byCode[f.code] = (summary.byCode[f.code] || 0) + 1;
  }
  const out = { summary, results };
  fs.writeFileSync('/tmp/cred-r8-review/results.json', JSON.stringify(out, null, 2));
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  progress('exit');
  process.exit(0);
  const interesting = results.filter((r) => r.failures.length).slice(0, 25);
  process.stdout.write(JSON.stringify(interesting.map((r) => ({ id: r.id, failures: r.failures.slice(0, 4), publicPlain: (r.publicPlain || []).slice(0, 1), logSample: r.logSample, latestRaw: r.latestRaw })), null, 2) + '\n');
})().catch((e) => {
  process.stderr.write(String(e && e.stack || e) + '\n');
  process.exit(1);
});
