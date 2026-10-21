'use strict';

/**
 * Independent review of credential-guard R6.
 * Frozen commit d87a673a056c79ece9866e44765136b752621496.
 * Applies proposed-integration.diff only under a scratch tree.
 * Drives the real webhook handler and the real postReply / postClientCommentOnce
 * functions through an in-process recording transport. No network, no prod,
 * no customer data. Synthetic fixtures only.
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Module = require('module');

const FROZEN = 'd87a673a056c79ece9866e44765136b752621496';
const REPO = '/workspace';
const SCRATCH = '/tmp/cred-r6-scratch';
const OUT_DIR = path.join(REPO, 'reviews/cred-r6');

const S = 'Vx7kQm2p';
const H = 'Hunt9';
const SHORT = 'Xq';
const PIN = '448219';
const LONG = 'Vx7kQm2pVx7kQm2p';
const FAQ = 'Our team has already been informed and is reviewing this. We will update you here as soon as there is progress.';
const REVIEW_BITS = [
  "you don't need to check back manually",
  'no need to keep checking in yourself',
  "you won't need to follow up manually",
];

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function fullwidth(text) {
  return Array.from(text).map((ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 0x21 && code <= 0x7e) return String.fromCharCode(code + 0xfee0);
    return ch;
  }).join('');
}

function splitChars(text) {
  return Array.from(text).join(' ');
}

function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

function html(text) {
  return '<p>' + text + '</p>';
}

function cyrA(word) {
  return word.replace(/a/g, '\u0430').replace(/A/g, '\u0410');
}

const http = [];
const openaiCalls = [];
const logs = [];
let currentFixture = null;
let policy = { mode: 'ok' };
let responder = () => 'ACTION: REPLY\nBODY: ' + FAQ;

function resetChannels() {
  http.length = 0;
  openaiCalls.length = 0;
  logs.length = 0;
  policy = { mode: 'ok' };
  responder = () => 'ACTION: REPLY\nBODY: ' + FAQ;
  process.env.LUNA_PRESEND_MODE = 'observe';
}

function installHooks() {
  const orig = Module.prototype.require;
  Module.prototype.require = function hooked(id) {
    if (id === 'axios') return mockAxios;
    if (id === 'openai') return MockOpenAI;
    return orig.apply(this, arguments);
  };
}

async function handleHttp(method, url, data) {
  const entry = { method: method, url: String(url || ''), data: data || null };
  http.push(entry);
  if (policy.mode === 'throw' && method !== 'get') {
    const err = new Error(policy.errorMessage || 'synthetic transport failure');
    throw err;
  }
  const clean = String(url || '').split('?')[0];
  if (method === 'get' && /\/conversations\/[^/]+$/.test(clean)) {
    return { status: 200, data: currentFixture, headers: {} };
  }
  if (policy.mode === 'status' && method !== 'get') {
    return { status: policy.status || 400, data: policy.responseData || { error: 'synthetic' }, headers: {} };
  }
  if (method === 'get') return { status: 200, data: { admins: [] }, headers: {} };
  return { status: 200, data: { id: 'syn-write-' + http.length, type: 'conversation' }, headers: {} };
}

function mockAxios(config) {
  const cfg = config || {};
  return handleHttp(String(cfg.method || 'get').toLowerCase(), cfg.url, cfg.data);
}
mockAxios.get = (url) => handleHttp('get', url, null);
mockAxios.post = (url, data) => handleHttp('post', url, data);
mockAxios.request = mockAxios;
mockAxios.create = () => mockAxios;

class MockOpenAI {
  constructor() {}
  chat = { completions: { create: async (req) => {
    openaiCalls.push({ messages: (req && req.messages) || [] });
    const content = await responder(req || {});
    return { choices: [{ message: { content: String(content == null ? '' : content) } }] };
  } } };
}

function buildConv(id, turns) {
  let stamp = 1700000000;
  const parts = [];
  for (const turn of turns) {
    stamp += 30;
    const note = turn.role === 'note';
    const user = turn.role === 'user';
    const author = user
      ? { type: 'user', id: 'user-syn', name: 'Synthetic Client' }
      : { type: 'admin', id: '10118526', name: 'Arsal' };
    parts.push({
      id: id + '-' + stamp,
      part_type: note ? 'note' : 'comment',
      body: turn.body,
      created_at: stamp,
      author: author,
    });
  }
  const firstUser = turns.find((turn) => turn.role === 'user');
  return {
    id: id,
    open: true,
    state: 'open',
    created_at: 1600000000,
    team_assignee_id: null,
    admin_assignee_id: null,
    contacts: { contacts: [{ id: 'contact-syn', name: 'Synthetic Client', email: 'synthetic@example.invalid' }] },
    source: {
      body: firstUser ? firstUser.body : '',
      author: { type: 'user', id: 'user-syn', name: 'Synthetic Client' },
      created_at: 1600000000,
    },
    conversation_parts: { conversation_parts: parts },
  };
}

function prior(latestBody) {
  return [
    { role: 'user', body: 'Hello' },
    { role: 'bot', body: 'Hello, how can I help with your account today?' },
    { role: 'user', body: latestBody },
  ];
}

function userPrompt(req) {
  const messages = (req && req.messages) || [];
  return messages.map((m) => String(m.content || '')).join('\n');
}

function setupScratch() {
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  fs.mkdirSync(SCRATCH, { recursive: true });
  const copy = spawnSync('cp', ['-a', path.join(REPO, 'luna-current'), path.join(SCRATCH, 'luna-current')], { encoding: 'utf8' });
  if (copy.status !== 0) throw new Error('copy failed ' + copy.stderr);
  const lane = path.join(SCRATCH, 'luna-current/10_synthetic_lanes/credential-guard-r6');
  fs.mkdirSync(lane, { recursive: true });
  for (const name of ['credentialGuardR6.js', 'credentialGuardR6.test.js', 'proposed-integration.diff', 'CRED_R6_MANIFEST.sha256', 'CRED_R6_REPORT.md']) {
    const show = spawnSync('git', ['-C', REPO, 'show', FROZEN + ':luna-current/10_synthetic_lanes/credential-guard-r6/' + name], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    if (show.status !== 0) throw new Error('git show failed for ' + name + ' ' + show.stderr);
    fs.writeFileSync(path.join(lane, name), show.stdout);
  }
  const head = spawnSync('git', ['-C', REPO, 'rev-parse', 'origin/cursor/credential-guard-r6-c90d'], { encoding: 'utf8' });
  if (head.stdout.trim() !== FROZEN) throw new Error('frozen commit moved: ' + head.stdout.trim());
  const check = spawnSync('sha256sum', ['-c', path.join(lane, 'CRED_R6_MANIFEST.sha256')], { cwd: SCRATCH, encoding: 'utf8' });
  if (check.status !== 0) throw new Error('manifest mismatch\n' + check.stdout + check.stderr);
  const dry = spawnSync('patch', ['--dry-run', '-p1', '--forward', '--batch'], {
    cwd: SCRATCH,
    input: fs.readFileSync(path.join(lane, 'proposed-integration.diff')),
    encoding: 'utf8',
  });
  if (dry.status !== 0) throw new Error('diff dry-run failed\n' + dry.stdout + dry.stderr);
  const applied = spawnSync('patch', ['-p1', '--forward', '--batch'], {
    cwd: SCRATCH,
    input: fs.readFileSync(path.join(lane, 'proposed-integration.diff')),
    encoding: 'utf8',
  });
  if (applied.status !== 0) throw new Error('diff apply failed\n' + applied.stdout + applied.stderr);
  const runtime = path.join(SCRATCH, 'luna-current/01_runtime');
  const root = path.join(SCRATCH, 'luna-current');
  fs.symlinkSync('../02_statePresend', path.join(runtime, 'statePresend'));
  fs.symlinkSync('../03_luna-maintainer', path.join(runtime, 'luna-maintainer'));
  // presendMega resolves these next to the state-presend package. The repo keeps
  // them beside index.js, so the scratch links them without changing the diff.
  fs.symlinkSync('01_runtime/repeatedClientQuestion.js', path.join(root, 'repeatedClientQuestion.js'));
  fs.symlinkSync('01_runtime/assistantIdentityGuard.js', path.join(root, 'assistantIdentityGuard.js'));
  const state = path.join(SCRATCH, 'state');
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(state, 'bot-control.json'), JSON.stringify({
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: ['Bot test'],
    testAllowConversationIds: [],
    config: { model: 'synthetic-review', welcomeEnabled: true, repliesEnabled: true },
  }, null, 2));
  fs.writeFileSync(path.join(state, 'ticket-state.json'), '{}');
  fs.writeFileSync(path.join(state, 'write-ops.json'), '{}');
  fs.copyFileSync(path.join(runtime, 'system-prompt.txt'), path.join(state, 'system-prompt.txt'));
  const npm = spawnSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: runtime, encoding: 'utf8' });
  if (npm.status !== 0) throw new Error('npm ci failed\n' + npm.stdout + npm.stderr);
  return { lane: lane, runtime: runtime, state: state };
}

function scanTree(dir) {
  if (!fs.existsSync(dir)) return '';
  const out = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.size < 2 * 1024 * 1024) out.push(fs.readFileSync(p, 'utf8'));
    }
  };
  walk(dir);
  return out.join('\n');
}

function channelHas(text, needle) {
  const hay = String(text || '');
  const n = String(needle || '');
  if (!n) return false;
  if (n.length >= 6) return hay.includes(n);
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^A-Za-z0-9])' + esc + '([^A-Za-z0-9]|$)').test(hay);
}

function publicBodies() {
  return http.filter((entry) => {
    if (entry.method === 'get') return false;
    if (!entry.data || typeof entry.data.body !== 'string') return false;
    if (!/\/reply/.test(entry.url)) return false;
    return !entry.data.message_type || entry.data.message_type === 'comment';
  });
}

function noteBodies() {
  return http.filter((entry) => entry.data && entry.data.message_type === 'note' && typeof entry.data.body === 'string');
}

function kindOf(body, guard) {
  const plain = guard.isExactSpreadTemplate(body)
    ? guard.SPREAD_TEST_REPLY
    : String(body).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
  if (guard.isExactSpreadTemplate(body)) return 'template';
  if (plain.includes('I will not repeat it back')) return 'fixed';
  if (REVIEW_BITS.some((bit) => plain.includes(bit))) return 'review';
  if (plain.includes('already been informed')) return 'faq';
  if (!plain) return 'empty';
  return 'other';
}

function callGraph(indexSrc) {
  const lines = indexSrc.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    if (/postReply\s*\(/.test(line) || /postClientCommentOnce\s*\(/.test(line) || /axios\.post\s*\(/.test(line) || /icRequest\s*\(/.test(line) || /guardOutboundWrite|guardSend|rememberClient/.test(line)) {
      hits.push({ line: i + 1, text: line.trim().slice(0, 180) });
    }
  });
  return hits;
}

function buildCases() {
  const cases = [];
  const add = (rec) => cases.push(rec);

  const spreadNo = [
    ['spread-some-light', 'can you spread some light on the rules'],
    ['spread-some-light-payout', 'can you spread some light on the payout'],
    ['problem-spread', 'there is a problem spread'],
    ['problem-spread-sentence', 'the problem spread to the other account'],
    ['risk-spread', 'what is the risk spread on this'],
    ['risk-spread-phrase', 'risk spread'],
    ['ordinary-spreads', 'what are your spreads'],
    ['spreads-wide', 'spreads look wide today'],
    ['spread-too-high', 'the spread is too high'],
    ['hello', 'hello'],
    ['payout', 'when is my payout'],
    ['withdrawal', 'my withdrawal is delayed'],
    ['payout-and-check', 'please check the spreads for my payout'],
    ['do-not-check', 'do not check the spreads'],
    ['dont-check', "don't check the spreads"],
    ['never-test', 'never test the spreads'],
    ['not-a-spread-test', 'this is not a spread test'],
    ['not-testing', 'we are not testing spreads'],
    ['check-something', 'check something about the spreads'],
    ['spread-the-news', 'please spread the news about the promo'],
    ['positions-spread', 'my positions are spread across two accounts'],
    ['payout-question', 'how do payouts work here'],
  ];
  for (const [id, text] of spreadNo) {
    add({
      id: 'neg-' + id,
      cls: '55188-negative',
      secrets: [],
      allowTemplate: false,
      expectTemplate: false,
      async run(api) {
        await api.user(prior(text));
      },
    });
  }

  const spreadYes = [
    ['please-check', 'please check the spreads'],
    ['check-spreads', 'check the spreads'],
    ['check-spreads-bare', 'please check spreads'],
    ['test-spreads', 'test the spreads'],
    ['testing-spreads', 'testing the spreads'],
    ['spread-test', 'I want a spread test'],
    ['spread-test-account', 'send me the spread-test account'],
    ['spread-check-account', 'spread check account'],
    ['karo', 'spread check karo'],
    ['karo-the', 'check karo the spreads'],
    ['hindi', 'स्प्रेड चेक करो'],
    ['urdu', 'سپریڈ ٹیسٹ کریں'],
    ['arabic', 'اختبر السبريد'],
    ['fullwidth', fullwidth('check') + ' the ' + fullwidth('spreads')],
    ['zwsp', 'please check the spr\u200Beads'],
    ['homoglyph-check', '\u0441heck the spreads'],
  ];
  for (const [id, text] of spreadYes) {
    add({
      id: 'yes-' + id,
      cls: '55188-positive',
      secrets: [],
      allowTemplate: true,
      expectTemplate: true,
      async run(api) {
        await api.user(prior(text));
      },
    });
  }

  const firstYes = [
    ['first-please', 'please check the spreads'],
    ['first-hindi', 'स्प्रेड चेक करो'],
    ['first-arabic', 'اختبر السبريد'],
    ['first-urdu', 'سپریڈ ٹیسٹ کریں'],
    ['first-karo', 'spread check karo'],
    ['first-html', null, html('please check the spreads')],
    ['first-nbsp', null, '<p>please check the&nbsp;spreads</p>'],
  ];
  for (const [id, text, body] of firstYes) {
    add({
      id: 'first-' + id,
      cls: '55188-first-contact',
      secrets: [],
      allowTemplate: true,
      expectTemplate: true,
      async run(api) {
        await api.user([{ role: 'user', body: body || text }]);
      },
    });
  }

  const falsePos = [
    ['morning', 'I check the spreads every morning'],
    ['yesterday', 'I was testing spreads yesterday'],
    ['no-need', 'no need to check the spreads'],
    ['cannot', 'cannot check the spreads'],
    ['dont-want', "I don't want you to check the spreads"],
    ['spreadsheet', 'please check the spreadsheet for errors'],
    ['spread-sheet', 'please check the spread sheet'],
    ['what-is', 'what is a spread test'],
    ['failed', 'the spread test failed yesterday'],
    ['already-did', 'I already test the spreads myself'],
    ['help-me-understand', 'can you explain what people mean when they check the spreads'],
    ['rumor', 'please check the spread of this rumor'],
  ];
  for (const [id, text] of falsePos) {
    add({
      id: 'fp-' + id,
      cls: '55188-false-positive',
      secrets: [],
      allowTemplate: false,
      expectTemplate: false,
      async run(api) {
        await api.user(prior(text));
      },
    });
  }

  function ownerCase(id, cls, clientBody, dictated, secrets, extra) {
    add(Object.assign({
      id: id,
      cls: cls,
      secrets: secrets,
      allowTemplate: false,
      expectTemplate: false,
      async run(api) {
        await api.owner(clientBody, dictated);
      },
    }, extra || {}));
  }

  ownerCase('own-plain', 'history-echo', 'password is ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-zwsp-label', 'zwsp', 'pass\u200Bword is ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-zwsp-value', 'zwsp', 'password is ' + S.slice(0, 4) + '\u200B' + S.slice(4), 'I noted ' + S + ' on the login.', [S, S.slice(0, 4) + '\u200B' + S.slice(4)]);
  ownerCase('own-zwsp-echo', 'zwsp', 'password is ' + S, 'I noted ' + S.slice(0, 4) + '\u200B' + S.slice(4) + ' on the login.', [S, S.slice(0, 4) + '\u200B' + S.slice(4)]);
  ownerCase('own-combining-label', 'combining', 'password\u0301 is ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-combining-echo', 'combining', 'password is ' + S, 'I noted ' + S + '\u0301 on the login.', [S, S + '\u0301']);
  ownerCase('own-cyr-label', 'homoglyph', cyrA('password') + ' is ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-cyr-echo', 'homoglyph', 'password is ' + H, 'I noted \u041dunt9 on the login.', [H, '\u041dunt9']);
  ownerCase('own-fullwidth-label', 'fullwidth', fullwidth('password') + ' is ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-fullwidth-echo', 'fullwidth', 'password is ' + S, 'I noted ' + fullwidth(S) + ' on the login.', [S, fullwidth(S)]);
  ownerCase('own-spaced-label', 'spaced-label', 'p a s s w o r d is ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-pass-word', 'spaced-label', 'pass word is ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-dotted-label', 'spaced-label', 'p.a.s.s.w.o.r.d is ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-leet-label', 'leetspeak', 'p@ssw0rd is ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-leet-value', 'leetspeak', 'password is Pass9', 'I noted P@ss9 on the login.', ['Pass9', 'P@ss9']);
  ownerCase('own-pwd', 'pwd-passwd', 'pwd: ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-passwd', 'pwd-passwd', 'passwd is ' + SHORT, 'I noted ' + SHORT + ' on the login.', [SHORT]);
  ownerCase('own-short', 'short-token', 'password is ' + SHORT, 'The code is ' + SHORT + ' .', [SHORT]);
  ownerCase('own-short-ab', 'short-token', 'password is ab', 'The code is ab today.', ['ab']);
  ownerCase('own-pin', 'short-token', 'pin is ' + PIN, 'The pin is ' + PIN + ' .', [PIN]);
  ownerCase('own-otp', 'short-token', 'otp is ' + PIN, 'Use otp ' + PIN + ' now.', [PIN]);
  ownerCase('own-hinglish', 'hinglish', 'mera password hai ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-hinglish-x', 'hinglish', 'mera password hai X', 'I noted X on the login.', ['X']);
  ownerCase('own-meri', 'hinglish', 'meri password hai ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-urdu', 'urdu', 'میرا پاس ورڈ ہے ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-arabic', 'arabic', 'كلمة المرور هي ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-hindi', 'hindi', 'मेरा पासवर्ड है ' + S, 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-split-capture', 'char-split', 'p a s s w o r d is ' + splitChars(S), 'I noted ' + S + ' on the login.', [S, splitChars(S)]);
  ownerCase('own-split-echo', 'char-split', 'password is ' + S, 'Your code is ' + splitChars(S) + ' today.', [S, splitChars(S)]);
  ownerCase('own-b64', 'base64', 'password is ' + S, 'see ' + b64(S) + ' thanks', [S, b64(S)]);
  ownerCase('own-b64-unpadded', 'base64', 'password is ' + S, 'see ' + b64(S).replace(/=+$/, '') + ' thanks', [S, b64(S).replace(/=+$/, '')]);
  ownerCase('own-b64-url', 'base64', 'password is ' + S + '+/', 'see ' + b64(S + '+/').replace(/\+/g, '-').replace(/\//g, '_') + ' thanks', [S + '+/', b64(S + '+/')]);
  ownerCase('own-b64-double', 'base64', 'password is ' + S, 'see ' + b64(b64(S)) + ' thanks', [S, b64(S), b64(b64(S))]);
  ownerCase('own-html', 'html-history', html('mera password hai ' + S), 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-html-entity', 'html-history', '<p>password is Vx7kQm2&#112;</p>', 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-dictated-label', 'dictated-draft', 'hello there', 'password is ' + S, [S]);
  ownerCase('own-dictated-repeat', 'dictated-draft', 'pwd: ' + S, 'Please send them ' + S, [S]);
  ownerCase('own-model-repeat', 'model-draft', 'pwd: ' + S, null, [S], {
    async run(api) {
      api.setResponder(() => 'ACTION: REPLY\nBODY: I noted ' + S + ' on the login.');
      await api.ownerFollow('pwd: ' + S, '@Arsal please tell the client the login detail they sent');
    },
  });
  ownerCase('own-quote', 'history-echo', 'password is "' + S + '"', 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-backticks', 'history-echo', 'password is `' + S + '`', 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-parens', 'history-echo', 'password is (' + S + ')', 'I noted ' + S + ' on the login.', [S]);
  ownerCase('own-bearer', 'api-token', 'password is ' + LONG, 'Bearer ' + LONG, [LONG]);
  ownerCase('own-sk', 'api-token', 'hello', 'the key is sk-' + LONG, ['sk-' + LONG]);
  ownerCase('own-sk-history', 'api-token', 'password is sk-' + LONG, 'sk-' + LONG, ['sk-' + LONG]);

  add({
    id: 'pay-template-exact',
    cls: 'payout-template',
    secrets: [],
    allowTemplate: false,
    expectTemplate: false,
    async run(api) {
      await api.owner('when is my payout', api.template);
    },
  });
  add({
    id: 'pay-template-line',
    cls: 'payout-template',
    secrets: [],
    allowTemplate: false,
    expectTemplate: false,
    forbidTemplate: true,
    async run(api) {
      await api.owner('when is my payout', 'Password: ' + api.templatePassword);
    },
  });
  add({
    id: 'pay-template-plus',
    cls: 'payout-template',
    secrets: [],
    allowTemplate: false,
    expectTemplate: false,
    async run(api) {
      await api.owner('how do payouts work', api.template + '\nYour payout is approved.');
    },
  });
  add({
    id: 'pay-ordinary',
    cls: 'payout-template',
    secrets: [],
    allowTemplate: false,
    expectTemplate: false,
    outboundIncludesAny: ['payout'],
    outboundExcludes: ['I will not repeat it back'],
    async run(api) {
      await api.owner('when is my payout', 'Payout timing is confirmed by the team after the review window.');
    },
  });

  add({
    id: 'faq-direct',
    cls: 'approved-faq',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    outboundIncludesAny: ['already been informed'],
    outboundExcludes: ['I will not repeat it back'],
    async run(api) {
      await api.directReply(FAQ, { history: ['password is ' + S], clientTexts: ['any update on the review?'] });
    },
  });
  add({
    id: 'faq-status-2',
    cls: 'approved-faq',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    outboundIncludesAny: ['already has this and is reviewing it'],
    outboundExcludes: ['I will not repeat it back'],
    async run(api) {
      await api.directReply('Thanks for checking in , our team already has this and is reviewing it. We will message you here when there is an update.', {
        history: ['pwd: ' + S],
      });
    },
  });
  add({
    id: 'faq-review-direct',
    cls: 'approved-faq',
    secrets: [],
    allowTemplate: false,
    expectTemplate: false,
    outboundIncludesAny: REVIEW_BITS,
    outboundExcludes: ['I will not repeat it back'],
    async run(api) {
      await api.user(prior('how will I know when the review is done'));
    },
  });
  add({
    id: 'faq-review-after-secret',
    cls: 'approved-faq',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    outboundIncludesAny: REVIEW_BITS,
    outboundExcludes: ['I will not repeat it back'],
    async run(api) {
      await api.user([
        { role: 'user', body: 'password is ' + S },
        { role: 'bot', body: 'Hello, how can I help with your account today?' },
        { role: 'user', body: 'how will I know when the review is done' },
      ]);
    },
  });
  add({
    id: 'faq-review-html-secret',
    cls: 'approved-faq',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    outboundIncludesAny: REVIEW_BITS,
    outboundExcludes: ['I will not repeat it back'],
    async run(api) {
      await api.user([
        { role: 'user', body: html('mera password hai ' + S) },
        { role: 'bot', body: 'Hello, how can I help with your account today?' },
        { role: 'user', body: 'how will I be notified when verification is complete' },
      ]);
    },
  });

  add({
    id: 'over-hunt99',
    cls: 'overblock',
    secrets: [],
    watchOnly: ['Hunt9'],
    allowTemplate: false,
    expectTemplate: false,
    outboundIncludesAny: ['Hunt99'],
    outboundExcludes: ['I will not repeat it back'],
    async run(api) {
      await api.directReply('use Hunt99 today', { history: ['password is Hunt9'] });
    },
  });
  add({
    id: 'over-testing',
    cls: 'overblock',
    secrets: [],
    allowTemplate: false,
    expectTemplate: false,
    outboundIncludesAny: ['testing the login'],
    outboundExcludes: ['I will not repeat it back'],
    async run(api) {
      await api.directReply('testing the login flow now', { history: ['password is test'] });
    },
  });
  add({
    id: 'over-reset',
    cls: 'overblock',
    secrets: [],
    allowTemplate: false,
    expectTemplate: false,
    outboundIncludesAny: ['password reset instructions'],
    outboundExcludes: ['I will not repeat it back'],
    async run(api) {
      await api.directReply('password reset instructions are on the site', {
        clientTexts: ['password reset instructions are on the site'],
      });
    },
  });
  add({
    id: 'over-pass-challenge',
    cls: 'overblock',
    secrets: [],
    allowTemplate: false,
    expectTemplate: false,
    outboundIncludesAny: ['pass the challenge'],
    outboundExcludes: ['I will not repeat it back'],
    async run(api) {
      await api.directReply('I hope you pass the challenge.', { clientTexts: ['I hope I pass the challenge'] });
    },
  });
  add({
    id: 'over-account',
    cls: 'overblock',
    secrets: [],
    allowTemplate: false,
    expectTemplate: false,
    outboundIncludesAny: ['219876'],
    outboundExcludes: ['I will not repeat it back'],
    async run(api) {
      await api.directReply('Your account number 219876 is on the ticket.', { clientTexts: ['My account number is 219876'] });
    },
  });
  add({
    id: 'over-embedded',
    cls: 'overblock',
    secrets: [],
    allowTemplate: false,
    expectTemplate: false,
    outboundIncludesAny: ['pre' + S + 'post'],
    outboundExcludes: ['I will not repeat it back'],
    async run(api) {
      await api.directReply('token pre' + S + 'post stays one word', { history: ['password is ' + S] });
    },
  });

  const skipObs = [
    ['skip-plain', 'password is ' + S, S, [S]],
    ['skip-zwsp', 'pass\u200Bword is ' + S, S, [S]],
    ['skip-cyr', cyrA('password') + ' is ' + S, S, [S]],
    ['skip-full', fullwidth('password') + ' is ' + S, S, [S]],
    ['skip-leet', 'p@ssw0rd is ' + S, S, [S]],
    ['skip-hinglish', 'mera password hai ' + S, S, [S]],
    ['skip-urdu', 'میرا پاس ورڈ ہے ' + S, S, [S]],
    ['skip-split', 'p a s s w o r d is ' + splitChars(S), S, [S, splitChars(S)]],
    ['skip-b64', 'password is ' + S, b64(S), [S, b64(S)]],
  ];
  for (const [id, client, body, secrets] of skipObs) {
    add({
      id: id,
      cls: 'log-skip',
      secrets: secrets,
      allowTemplate: false,
      expectTemplate: false,
      noteInbound: true,
      async run(api) {
        api.setResponder(() => 'ACTION: SKIP\nBODY: ' + body);
        await api.user([{ role: 'user', body: client }]);
      },
    });
  }

  add({
    id: 'log-owner-raw',
    cls: 'log-owner',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    async run(api) {
      api.setResponder(() => 'ACTION: REPLY\nBODY: password is ' + S);
      await api.ownerFollow('password is ' + S, '@Arsal please update the client about the login detail');
    },
  });
  add({
    id: 'log-throw',
    cls: 'log-error',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    async run(api) {
      api.setPolicy({ mode: 'throw', errorMessage: 'connect ' + S });
      await api.directReply(FAQ, {});
    },
  });
  add({
    id: 'log-fail-body',
    cls: 'log-error',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    async run(api) {
      api.setPolicy({ mode: 'status', status: 400, responseData: { message: S, type: 'error' } });
      await api.directReply(FAQ, {});
    },
  });
  add({
    id: 'op-block',
    cls: 'opstore',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    async run(api) {
      await api.directReply('password is ' + S, {});
    },
  });
  add({
    id: 'op-replay-clean',
    cls: 'replay',
    secrets: [],
    allowTemplate: false,
    expectTemplate: false,
    outboundIncludesAny: ['already been informed'],
    async run(api) {
      await api.directReply(FAQ, {});
      await api.directReply(FAQ, {});
    },
  });
  add({
    id: 'note-redact',
    cls: 'note-redact',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    async run(api) {
      await api.directNote('Owner asked to resend ' + S, { history: ['password is ' + S] });
    },
  });
  add({
    id: 'note-owner-cmd',
    cls: 'note-redact',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    async run(api) {
      await api.ownerNote('password is ' + S, '@Arsal NOTE: the client password is ' + S);
    },
  });

  add({
    id: 'helper-retry',
    cls: 'helper-retry',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    pathMarker: 'The client repeated this question',
    async run(api) {
      api.setResponder((req) => {
        const blob = userPrompt(req);
        if (blob.includes('The client repeated this question')) return 'Acknowledging again, the detail ' + S + ' stays with the team.';
        return 'ACTION: REPLY\nBODY: ' + FAQ;
      });
      await api.onceRepeated(FAQ);
    },
  });
  add({
    id: 'repeated-question-retry',
    cls: 'repeated-question',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    pathMarker: 'Your draft copied your previous reply',
    async run(api) {
      process.env.LUNA_PRESEND_MODE = 'enforce';
      api.setResponder((req) => {
        const blob = userPrompt(req);
        if (blob.includes('Your draft copied your previous reply')) {
          return 'ACTION: REPLY\nBODY: Sharing that again in fresh wording, code ' + S + ' .';
        }
        return 'ACTION: REPLY\nBODY: ' + FAQ;
      });
      await api.user([
        { role: 'user', body: 'What is the holding rule?' },
        { role: 'bot', body: FAQ },
        { role: 'user', body: 'What is the holding rule?' },
      ]);
    },
  });
  add({
    id: 'presend-regenerate',
    cls: 'presend-regenerate',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    pathMarker: 'corrected client-facing answer',
    async run(api) {
      process.env.LUNA_PRESEND_MODE = 'enforce';
      api.setResponder((req) => {
        const blob = userPrompt(req);
        if (blob.includes('corrected client-facing') || blob.includes('Return ACTION: REPLY with the corrected')) {
          return 'ACTION: REPLY\nBODY: The holding rule is unchanged. Reference ' + S + ' .';
        }
        return 'ACTION: REPLY\nBODY: OK.';
      });
      await api.user(prior('What is the holding rule?'));
    },
  });
  add({
    id: 'model-webhook-echo',
    cls: 'model-draft',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    noteInbound: true,
    async run(api) {
      api.setResponder(() => 'ACTION: REPLY\nBODY: I noted ' + S + ' on the login.');
      await api.user(prior('password is ' + S));
    },
  });
  add({
    id: 'inbound-memory',
    cls: 'note-inbound',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    noteInbound: true,
    async run(api) {
      api.setResponder(() => 'ACTION: SKIP\nBODY: noted');
      await api.user([{ role: 'user', body: 'mera password hai ' + S }]);
    },
  });
  add({
    id: 'observe-redact',
    cls: 'observe',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    noteInbound: true,
    async run(api) {
      api.setResponder(() => 'ACTION: REPLY\nBODY: ' + FAQ);
      await api.user([{ role: 'user', body: 'password is ' + S + ' and any update on the review?' }]);
    },
  });

  add({
    id: 'eligible-html-prior',
    cls: '55188-positive',
    secrets: [],
    allowTemplate: true,
    expectTemplate: true,
    async run(api) {
      await api.user([
        { role: 'user', body: 'Hello' },
        { role: 'bot', body: 'Hello, how can I help with your account today?' },
        { role: 'user', body: html('please check the spreads') },
      ]);
    },
  });
  add({
    id: 'eligible-nbsp-prior',
    cls: '55188-positive',
    secrets: [],
    allowTemplate: true,
    expectTemplate: true,
    async run(api) {
      await api.user([
        { role: 'user', body: 'Hello' },
        { role: 'bot', body: 'Hello, how can I help with your account today?' },
        { role: 'user', body: '<p>please check the&nbsp;spreads</p>' },
      ]);
    },
  });
  add({
    id: 'direct-template-without-remember',
    cls: '55188-positive',
    secrets: [],
    allowTemplate: true,
    expectTemplate: true,
    async run(api) {
      await api.directReply(api.template, { clientTexts: ['please check the spreads'] });
    },
  });
  add({
    id: 'arabic-harakat',
    cls: 'arabic',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    async run(api) {
      await api.owner('كَلِمَةُ المرور هي ' + S, 'I noted ' + S + ' on the login.');
    },
  });
  add({
    id: 'hindi-spaced',
    cls: 'hindi',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    async run(api) {
      await api.owner('मेरा पास वर्ड है ' + S, 'I noted ' + S + ' on the login.');
    },
  });
  add({
    id: 'urdu-no-space',
    cls: 'urdu',
    secrets: [S],
    allowTemplate: false,
    expectTemplate: false,
    async run(api) {
      await api.owner('میرا پاسورڈ ہے ' + S, 'I noted ' + S + ' on the login.');
    },
  });

  return cases;
}

function evaluate(entry, guard, expect) {
  const secrets = entry.secrets || [];
  const bodies = publicBodies();
  const writes = bodies.map((item) => item.data.body).join('\n');
  const notes = noteBodies().map((item) => item.data.body).join('\n');
  const logText = logs.map((item) => item.text).join('\n');
  const fileText = entry.fileText || '';
  const memoryText = entry.memoryText || '';
  const modelText = openaiCalls.map((call) => JSON.stringify(call.messages)).join('\n');
  const leaks = [];
  const leakLabel = (secret) => (secret === S ? 'primary' : secret === H ? 'hunt9' : secret.length > 20 ? 'long' : 'fixture');
  for (const secret of secrets) {
    for (const item of http) {
      const blob = JSON.stringify(item.data || '');
      if (!channelHas(blob, secret)) continue;
      const exact = item.data && typeof item.data.body === 'string' && guard.isExactSpreadTemplate(item.data.body);
      if (exact && entry.allowTemplate && (secret === guard.TEMPLATE_PASSWORD || secret === '55188')) continue;
      leaks.push({ channel: 'write', label: leakLabel(secret) });
    }
    if (channelHas(logText, secret)) leaks.push({ channel: 'log', label: leakLabel(secret) });
    if (channelHas(fileText, secret)) leaks.push({ channel: 'file', label: leakLabel(secret) });
    if (channelHas(memoryText, secret)) leaks.push({ channel: 'memory', label: leakLabel(secret) });
  }
  for (const item of http) {
    const body = item.data && typeof item.data.body === 'string' ? item.data.body : '';
    if (!body) continue;
    const exact = guard.isExactSpreadTemplate(body);
    const hasTemplate = body.includes(guard.TEMPLATE_PASSWORD) || body.includes('55188');
    if (hasTemplate && !(exact && entry.allowTemplate)) leaks.push({ channel: 'write', label: 'template-password' });
  }
  if (channelHas(logText, guard.TEMPLATE_PASSWORD) || channelHas(logText, '55188')) leaks.push({ channel: 'log', label: 'template-password' });
  if (channelHas(fileText, guard.TEMPLATE_PASSWORD)) leaks.push({ channel: 'file', label: 'template-password' });
  if (channelHas(memoryText, guard.TEMPLATE_PASSWORD)) leaks.push({ channel: 'memory', label: 'template-password' });
  const kinds = bodies.map((item) => kindOf(item.data.body, guard));
  const templateExact = bodies.length === 1 && guard.isExactSpreadTemplate(bodies[0].data.body) && kinds[0] === 'template';
  const problems = [];
  if (leaks.length) problems.push('leak');
  if (entry.expectTemplate === true && !templateExact) problems.push('template-miss');
  if (entry.expectTemplate === false && (kinds.includes('template') || channelHas(writes, guard.TEMPLATE_PASSWORD) || channelHas(writes, '55188'))) {
    problems.push('unauthorized-55188');
  }
  const plainJoined = bodies.map((item) => String(item.data.body).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).join('\n');
  if (entry.outboundIncludesAny && !entry.outboundIncludesAny.some((bit) => plainJoined.includes(bit))) problems.push('missing-approved-text');
  if (entry.outboundExcludes && entry.outboundExcludes.some((bit) => plainJoined.includes(bit))) problems.push('overblock-or-replaced');
  if (entry.noteInbound) {
    if (!memoryText || memoryText === '[]') problems.push('inbound-not-recorded');
    else if (secrets.some((secret) => channelHas(memoryText, secret))) problems.push('inbound-leak');
  }
  const marker = entry.pathMarker;
  const markerHit = marker ? (logText.includes(marker) || modelText.includes(marker)) : null;
  return {
    problems: problems,
    leaks: leaks,
    kinds: kinds,
    templateExact: templateExact,
    publicCount: bodies.length,
    noteCount: noteBodies().length,
    markerHit: markerHit,
    logTags: logs.map((item) => (item.text.match(/^[A-Za-z0-9_.:\[\]-]{3,}/) || [''])[0]).filter(Boolean).slice(0, 40),
  };
}

async function main() {
  const selfHash = sha256File(__filename);
  const setup = setupScratch();
  const manifestHash = sha256File(path.join(setup.lane, 'CRED_R6_MANIFEST.sha256'));
  const identities = {
    frozen: FROZEN,
    manifest: manifestHash,
    guard: sha256File(path.join(setup.lane, 'credentialGuardR6.js')),
    diff: sha256File(path.join(setup.lane, 'proposed-integration.diff')),
    authorTests: sha256File(path.join(setup.lane, 'credentialGuardR6.test.js')),
    report: sha256File(path.join(setup.lane, 'CRED_R6_REPORT.md')),
    reviewSource: selfHash,
  };
  const manifestLines = fs.readFileSync(path.join(setup.lane, 'CRED_R6_MANIFEST.sha256'), 'utf8').trim().split('\n');
  assert.strictEqual(identities.guard, manifestLines[0].split(/\s+/)[0]);
  assert.strictEqual(identities.diff, manifestLines[2].split(/\s+/)[0]);

  for (const key of ['INTERCOM_ACCESS_TOKEN', 'OPENAI_API_KEY', 'INTERCOM_WEBHOOK_SECRET', 'INTERCOM_CLIENT_SECRET', 'CONTROL_SECRET']) {
    delete process.env[key];
  }
  process.env.OPENAI_API_KEY = 'synthetic-openai-key';
  process.env.INTERCOM_ACCESS_TOKEN = 'synthetic-intercom-token';
  process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';
  process.env.LUNA_CONTROL_STATE_FILE = path.join(setup.state, 'bot-control.json');
  process.env.LUNA_PROMPT_FILE = path.join(setup.state, 'system-prompt.txt');
  process.env.TICKET_STATE_FILE = path.join(setup.state, 'ticket-state.json');
  process.env.LUNA_OP_STORE_FILE = path.join(setup.state, 'write-ops.json');
  process.env.MENTION_ROTATE_FILE = path.join(setup.state, 'mention-rotate.json');
  process.env.MAINTAINER_DATA_DIR = path.join(setup.state, 'maintainer');
  process.env.MAINTAINER_ENABLED = 'true';
  process.env.LUNA_ROOT = setup.state;
  process.env.LUNA_TRACE_FILE = path.join(setup.state, 'trace.jsonl');
  process.env.LUNA_ERROR_FILE = path.join(setup.state, 'errors.jsonl');
  process.env.LUNA_PRESEND_MODE = 'observe';
  process.env.LUNA_PRESEND_FALLBACK_REPLY = '';

  installHooks();
  process.chdir(SCRATCH);
  const origLog = console.log;
  const origErr = console.error;
  const origWarn = console.warn;
  const pushLog = (level) => (...args) => {
    logs.push({
      level: level,
      text: args.map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return String(arg.message || '');
        try { return JSON.stringify(arg); } catch (_) { return String(arg); }
      }).join(' '),
    });
  };
  console.log = pushLog('log');
  console.error = pushLog('error');
  console.warn = pushLog('warn');

  const runtime = require(path.join(setup.runtime, 'index.js'));
  const guard = require(path.join(setup.lane, 'credentialGuardR6.js'));
  const presend = require(path.join(SCRATCH, 'luna-current/02_statePresend/statePresend.js'));
  const startupLogs = logs.map((item) => item.text).join('\n');
  const maintainerDisabled = /\[maintainer\] disabled/.test(startupLogs);
  logs.length = 0;

  const indexSrc = fs.readFileSync(path.join(setup.runtime, 'index.js'), 'utf8');
  const graph = callGraph(indexSrc);
  const wired = indexSrc.includes('__credentialGuardR6') && indexSrc.includes('guardOutboundWrite') && indexSrc.includes('isExplicitSpreadTestRequest');
  if (!wired) throw new Error('scratch runtime is not wired');

  let seq = 0;
  const api = {
    template: guard.SPREAD_TEST_REPLY,
    templatePassword: guard.TEMPLATE_PASSWORD,
    setResponder(fn) { responder = fn; },
    setPolicy(next) { policy = next; },
    async user(turns) {
      seq += 1;
      const id = 'syn-u-' + seq;
      const conv = buildConv(id, turns);
      currentFixture = conv;
      const req = { body: { topic: 'conversation.user.replied', data: { item: conv } }, get() { return ''; } };
      const res = { sendStatus() { return this; }, status() { return this; }, json() { return this; } };
      await runtime.handleWebhook(req, res);
      return id;
    },
    async owner(clientBody, dictated) {
      seq += 1;
      const id = 'syn-o-' + seq;
      const conv = buildConv(id, [
        { role: 'user', body: clientBody },
        { role: 'note', body: '@Arsal REPLY: ' + dictated },
      ]);
      currentFixture = conv;
      const req = { body: { topic: 'conversation.admin.noted', data: { item: conv } }, get() { return ''; } };
      const res = { sendStatus() { return this; }, status() { return this; }, json() { return this; } };
      await runtime.handleWebhook(req, res);
      return id;
    },
    async ownerFollow(clientBody, note) {
      seq += 1;
      const id = 'syn-f-' + seq;
      const conv = buildConv(id, [
        { role: 'user', body: clientBody },
        { role: 'note', body: note },
      ]);
      currentFixture = conv;
      const req = { body: { topic: 'conversation.admin.noted', data: { item: conv } }, get() { return ''; } };
      const res = { sendStatus() { return this; }, status() { return this; }, json() { return this; } };
      await runtime.handleWebhook(req, res);
      return id;
    },
    async ownerNote(clientBody, note) {
      seq += 1;
      const id = 'syn-n-' + seq;
      const conv = buildConv(id, [
        { role: 'user', body: clientBody },
        { role: 'note', body: note },
      ]);
      currentFixture = conv;
      const req = { body: { topic: 'conversation.admin.noted', data: { item: conv } }, get() { return ''; } };
      const res = { sendStatus() { return this; }, status() { return this; }, json() { return this; } };
      await runtime.handleWebhook(req, res);
      return id;
    },
    async directReply(body, ctx) {
      seq += 1;
      const id = 'syn-d-' + seq;
      await runtime.postReply(id, 'comment', body, ctx || {});
      return id;
    },
    async directNote(body, ctx) {
      seq += 1;
      const id = 'syn-dn-' + seq;
      await runtime.postReply(id, 'note', body, ctx || {});
      return id;
    },
    async onceRepeated(body) {
      seq += 1;
      const id = 'syn-h-' + seq;
      const conv = buildConv(id, [
        { role: 'user', body: 'What is the holding rule?' },
        { role: 'bot', body: body },
        { role: 'user', body: 'What is the holding rule?' },
      ]);
      currentFixture = conv;
      const parts = conv.conversation_parts.conversation_parts;
      const userPart = parts[parts.length - 1];
      await runtime.postClientCommentOnce(id, body, userPart, 'Synthetic Client');
      return id;
    },
  };

  const cases = buildCases();
  if (cases.length < 100) throw new Error('case count ' + cases.length);
  const endHash = sha256File(__filename);
  if (endHash !== selfHash) throw new Error('review source changed during the run');

  const results = [];
  for (const item of cases) {
    resetChannels();
    guard.resetStore();
    try { presend.resetAll(); } catch (_) { /* ignore */ }
    fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}');
    fs.writeFileSync(process.env.LUNA_OP_STORE_FILE, '{}');
    fs.rmSync(process.env.MAINTAINER_DATA_DIR, { recursive: true, force: true });
    fs.mkdirSync(process.env.MAINTAINER_DATA_DIR, { recursive: true });
    let thrown = null;
    try {
      await item.run(api);
    } catch (err) {
      thrown = String(err && err.message || err);
    }
    let memoryText = '';
    try {
      for (const key of ['syn-u-' + seq, 'syn-o-' + seq, 'syn-f-' + seq, 'syn-n-' + seq, 'syn-d-' + seq, 'syn-h-' + seq, 'syn-dn-' + seq]) {
        const view = presend.snapshot(key);
        if (view && view.memory && view.memory.length) memoryText += JSON.stringify(view.memory);
      }
    } catch (_) {
      memoryText = '';
    }
    const fileText = [
      fs.existsSync(process.env.TICKET_STATE_FILE) ? fs.readFileSync(process.env.TICKET_STATE_FILE, 'utf8') : '',
      fs.existsSync(process.env.LUNA_OP_STORE_FILE) ? fs.readFileSync(process.env.LUNA_OP_STORE_FILE, 'utf8') : '',
      fs.existsSync(process.env.LUNA_TRACE_FILE) ? fs.readFileSync(process.env.LUNA_TRACE_FILE, 'utf8') : '',
      fs.existsSync(process.env.LUNA_ERROR_FILE) ? fs.readFileSync(process.env.LUNA_ERROR_FILE, 'utf8') : '',
      scanTree(process.env.MAINTAINER_DATA_DIR),
    ].join('\n');
    const judged = evaluate({
      secrets: item.secrets,
      allowTemplate: item.allowTemplate,
      expectTemplate: item.expectTemplate,
      forbidTemplate: item.forbidTemplate,
      outboundIncludesAny: item.outboundIncludesAny,
      outboundExcludes: item.outboundExcludes,
      noteInbound: item.noteInbound,
      pathMarker: item.pathMarker,
      fileText: fileText,
      memoryText: memoryText,
    }, guard, item);
    if (thrown) judged.problems.push('threw');
    results.push({
      id: item.id,
      cls: item.cls,
      ok: judged.problems.length === 0,
      problems: judged.problems,
      leaks: judged.leaks,
      kinds: judged.kinds,
      templateExact: judged.templateExact,
      publicCount: judged.publicCount,
      markerHit: judged.markerHit,
      thrown: thrown,
      logTags: judged.logTags,
    });
  }

  console.log = origLog;
  console.error = origErr;
  console.warn = origWarn;

  const failed = results.filter((item) => !item.ok);
  const byClass = {};
  for (const item of results) {
    if (!byClass[item.cls]) byClass[item.cls] = { total: 0, failed: 0 };
    byClass[item.cls].total += 1;
    if (!item.ok) byClass[item.cls].failed += 1;
  }
  const leakFails = failed.filter((item) => item.problems.includes('leak') || item.problems.includes('inbound-leak'));
  const unauthorized = failed.filter((item) => item.problems.includes('unauthorized-55188'));
  const templateMiss = failed.filter((item) => item.problems.includes('template-miss'));
  const regressions = failed.filter((item) => item.problems.includes('missing-approved-text') || item.problems.includes('overblock-or-replaced'));
  const markers = {
    outboundBlocked: results.some((item) => item.logTags.includes('OUTBOUND_BLOCKED')),
    icBlocked: results.some((item) => item.logTags.includes('IC_REQ_BLOCKED')),
    icErr: results.some((item) => item.logTags.includes('IC_REQ_ERR')),
    icFail: results.some((item) => item.logTags.includes('IC_REQ_FAIL')),
    replay: results.some((item) => item.logTags.includes('IC_REQ_REPLAY_SUPPRESSED')),
    spreadLog: results.some((item) => item.logTags.includes('SPREAD_TEST_REPLY')),
    skipModel: results.some((item) => item.logTags.includes('SKIP')),
    ownerRaw: results.some((item) => item.logTags.includes('OWNER_CMD_LLM_RAW')),
    helper: results.some((item) => item.id === 'helper-retry' && item.markerHit),
    regenerate: results.some((item) => item.id === 'presend-regenerate' && item.markerHit),
    repeated: results.some((item) => item.id === 'repeated-question-retry' && item.markerHit),
  };
  const pass = leakFails.length === 0 && unauthorized.length === 0 && regressions.length === 0 && templateMiss.length === 0 && failed.length === 0;
  const verdict = pass ? 'PASS' : 'NEEDS CHANGES';
  const payload = {
    verdict: verdict,
    identities: identities,
    maintainerDisabled: maintainerDisabled,
    caseCount: results.length,
    failedCount: failed.length,
    byClass: byClass,
    markers: markers,
    graphSites: graph.length,
    failed: failed,
    wired: wired,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'RESULTS.json'), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'CALLGRAPH.json'), JSON.stringify(graph, null, 2));
  origLog('VERDICT', verdict);
  origLog('CASES', results.length, 'FAILED', failed.length);
  origLog('LEAKS', leakFails.length, 'UNAUTH', unauthorized.length, 'TEMPLATE_MISS', templateMiss.length, 'REGRESS', regressions.length);
  origLog('MARKERS', JSON.stringify(markers));
  origLog('MAINTAINER_DISABLED', maintainerDisabled);
  for (const item of failed) {
    origLog('FAIL', item.id, item.cls, item.problems.join(','), 'kinds=' + item.kinds.join('|'), 'marker=' + item.markerHit, item.thrown || '');
  }
}

main().catch((err) => {
  const text = 'REVIEW_BLOCKED\n' + (err && err.stack || err) + '\n';
  try { fs.writeFileSync('/tmp/cred-r6-debug.txt', text); } catch (_) { /* ignore */ }
  fs.writeSync(2, text);
  process.exitCode = 2;
});
