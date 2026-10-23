'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const axiosMock = path.join(os.tmpdir(), 'luna-r17-axios-' + process.pid + '.js');
fs.writeFileSync(axiosMock, 'module.exports = { get: async function () { return { status: 404, data: "" }; } };\n');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'axios') return axiosMock;
  return resolveFilename.call(this, request, parent, isMain, options);
};

process.env.FUNDEDELITE_FAQ_PATH = path.join(__dirname, '../../01_runtime/fundedelite-faqs.md');
process.env.LUNA_OP_STORE_FILE = path.join(os.tmpdir(), 'luna-r17-ops-' + process.pid + '.json');
try { fs.unlinkSync(process.env.LUNA_OP_STORE_FILE); } catch (_) { /* fresh store */ }

const handoff = require('../../01_runtime/fixedMessageHandoff');
const policy = require('../../02_statePresend/policyEvidence');

const FIXED = handoff.FIXED_MESSAGES.en;
const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const CLARIFIER = 'Please tell me which challenge you mean.';
const OWN = {
  arsalId: 'seat-a',
  eliteAiId: 'seat-e',
  riskTeamId: 'risk-1',
  escalationsTeamId: 'esc-1',
};
const SECRET = 'SuperSecretValue99';

let passed = 0;
const tests = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log('PASS', name);
    });
}

function decide(text, extra) {
  return handoff.decide(Object.assign({
    path: 'welcome',
    latestText: text,
    parts: [],
    full: { admin_assignee_id: 'seat-a', team_assignee_id: '0' },
    botId: 'seat-a',
    ownershipOpts: OWN,
  }, extra || {}));
}

function priorReply() {
  return [{ part_type: 'comment', author: { id: 'seat-a', type: 'admin' }, body: 'I can help with that.' }];
}

function userPart(body, at) {
  return { part_type: 'comment', author: { id: 'user-1', type: 'user' }, body, created_at: at || 1 };
}

function assignmentPart() {
  return {
    part_type: 'assignment',
    created_at: 5,
    author: { id: 'seat-a', type: 'admin' },
    assigned_to: { id: 'human-7' },
    body: '',
  };
}

tests.push(test('a human request after a bot reply posts one locked line in that language', () => {
  const asks = [
    ['مجھے ایجنٹ چاہیے', handoff.FIXED_MESSAGES.en, 'ur'],
    ['أريد التحدث إلى موظف', handoff.FIXED_MESSAGES.en, 'ar'],
    ['मुझे एजेंट से बात करनी है', handoff.FIXED_MESSAGES.en, 'hi'],
    ['mujhe agent chahiye', handoff.FIXED_MESSAGES.en, 'ur'],
  ];
  for (const [text, line, lang] of asks) {
    const welcome = decide(text);
    const later = decide(text, { parts: priorReply(), path: 'main_escalate', force: true });
    assert.strictEqual(welcome.action, 'fixed_message', text);
    assert.strictEqual(welcome.message, line, text);
    assert.strictEqual(later.action, 'fixed_message', text);
    assert.strictEqual(later.message, line, text);
    assert.strictEqual(later.language, 'en', text);
    assert.notStrictEqual(later.message, 'I can help with that.');
  }
  const faq = decide('How does the challenge work?', { parts: priorReply() });
  assert.strictEqual(faq.action, 'route_normal');
  assert.strictEqual(faq.message, null);
  const policyAsk = decide('what is the password policy?', { parts: priorReply() });
  assert.strictEqual(policyAsk.action, 'route_normal');
  const src = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  const guard = src.indexOf('FIXED_HANDOFF human request before model');
  const model = src.indexOf('LUNA_TOOLS_V1:BEGIN:runChat');
  assert.ok(guard > 0 && guard < model);
  assert.ok(src.slice(guard - 400, guard).includes('isHumanAgentRequest'));
}));

tests.push(test('lost-state completion uses the original request, not the latest turn', () => {
  const asks = [
    ['مجھے ایجنٹ چاہیے', handoff.FIXED_MESSAGES.en],
    ['أريد التحدث إلى موظف', handoff.FIXED_MESSAGES.en],
    ['मुझे एजेंट से बात करनी है', handoff.FIXED_MESSAGES.en],
    ['mujhe agent chahiye', handoff.FIXED_MESSAGES.en],
  ];
  for (const [text, line] of asks) {
    const parts = [userPart(text, 1), userPart('hello', 2), assignmentPart()];
    const owed = handoff.activeOwedFixedLine({
      parts,
      botId: 'seat-a',
      latestText: 'hello',
      full: { id: 'c-lost', admin_assignee_id: 'human-7' },
      ownershipOpts: Object.assign({ handoffAssigneeId: 'human-7' }, OWN),
    });
    assert.strictEqual(owed && owed.message, line, text);
    const stripped = parts.filter((p) => {
      const pt = String(p.part_type || '');
      return pt !== 'assignment' && pt !== 'assign';
    });
    const completion = decide(handoff.handoffRequestText(parts), {
      path: 'recovery',
      force: true,
      parts: stripped,
      full: { admin_assignee_id: 'human-7' },
      handoffAssigneeId: 'human-7',
      ownershipOpts: Object.assign({ handoffAssigneeId: 'human-7' }, OWN),
    });
    assert.strictEqual(completion.action, 'fixed_message', text);
    assert.strictEqual(completion.message, line, text);
  }
  const src = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  const requestAt = src.indexOf('handoffRequestText(parts)');
  const lost = src.indexOf('FIXED_HANDOFF lost-state completion');
  assert.ok(requestAt > 0 && requestAt < lost);
}));

tests.push(test('DLL and MLL abbreviations bind to the same concepts as the spelled-out labels', () => {
  const evidence = [
    'DLL 5%/3%, MLL 8%.',
    'fixed daily loss limit of 5% and customizable max loss limit of 8%',
    '5% daily loss limit and 8% max loss limit',
  ];
  const allowed = [
    'The DLL is 5%.',
    'The MLL is 8%.',
    'The daily loss limit is 5%.',
    'The max loss limit is 8%.',
    'The daily drawdown is 5%.',
    'The max drawdown is 8%.',
  ];
  for (const ev of evidence) {
    for (const draft of allowed) {
      assert.deepStrictEqual(policy.unsupportedPublicFigures(draft, ev), [], draft + ' || ' + ev);
    }
    assert.deepStrictEqual(policy.unsupportedPublicFigures('The daily drawdown is 99%.', ev), ['99%']);
    assert.deepStrictEqual(policy.unsupportedPublicFigures('The daily drawdown is 8%.', ev), ['8%']);
  }
  assert.deepStrictEqual(policy.unsupportedPublicFigures('The daily drawdown is 3%.', 'DLL 5%/3%, MLL 8%.'), []);
  assert.ok(policy.unsupportedPolicyNumbers('The DLL is 5%.', 'DLL 5%/3%, MLL 8%.', []).length === 0);
  const src = fs.readFileSync(path.join(__dirname, '../../02_statePresend/policyEvidence.js'), 'utf8');
  assert.ok(src.includes('daily loss limit'));
  assert.ok(src.includes('max loss limit'));
}));

tests.push(test('a unique-rank FAQ posts its article and a tie still clarifies', () => {
  const article = handoff.uniqueRankedFaqArticle('How does the challenge work?');
  assert.ok(article.includes('To participate in the Funded Elite Trading Challenge'));
  assert.notStrictEqual(article, HEDGE);
  assert.notStrictEqual(article, '');
  assert.strictEqual(handoff.ambiguousChallengeClarifier('How does the challenge work?'), '');
  assert.strictEqual(handoff.uniqueRankedFaqArticle('How can I pay for the challenge?'), '');
  assert.strictEqual(handoff.ambiguousChallengeClarifier('How can I pay for the challenge?'), CLARIFIER);
  assert.strictEqual(handoff.uniqueRankedFaqArticle('what is the password policy?'), '');
  assert.strictEqual(handoff.uniqueRankedFaqArticle('What is the daily loss limit?'), '');
  assert.notStrictEqual(handoff.approvedFaqCustomerBody('What is the daily loss limit?'), '');
  assert.strictEqual(handoff.isUniqueFaqArticle('How does the challenge work?', article), true);
  const src = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  const welcomeAt = src.indexOf('FIXED_MESSAGE_HANDOFF_R3:welcome');
  const spread = src.indexOf('if (isSpreadCheckAsk(text))', welcomeAt);
  const between = src.slice(welcomeAt, spread);
  assert.ok(between.includes('uniqueRankedFaqArticle'));
  assert.ok(between.includes('ambiguousChallengeClarifier'));
  assert.ok(between.includes('approvedFaqCustomerBody'));
  const empty = src.indexOf('SKIP empty reply body');
  assert.ok(src.slice(empty - 500, empty).includes('uniqueRankedFaqArticle'));
  const tail = src.lastIndexOf('return res.sendStatus(200);');
  assert.ok(src.slice(tail - 700, tail).includes('uniqueRankedFaqArticle'));
}));

tests.push(test('an Arabic human request with a password hands off in Arabic and the secret stays out', async () => {
  const text = 'أريد التحدث إلى موظف password: ' + SECRET.repeat(4);
  assert.strictEqual(handoff.detectLanguage(text), 'en');
  assert.strictEqual(handoff.isHumanAgentRequest(text), true);
  const result = decide(text, { parts: priorReply() });
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.language, 'en');
  assert.strictEqual(result.message, handoff.FIXED_MESSAGES.en);
  assert.strictEqual(String(result.message).includes(SECRET), false);
  assert.notStrictEqual(result.message, 'I can help with that.');
  const calls = [];
  const sent = await handoff.commit({
    decision: result,
    noteHtml: 'Problem: ' + text,
    assigneeId: 'human-7',
    botId: 'seat-a',
    conversationId: 'c-ar-secret',
    parts: priorReply(),
    conversation: { id: 'c-ar-secret', admin_assignee_id: 'seat-a' },
    progress: {},
    transport: {
      postNote: async (body) => {
        calls.push({ op: 'note', body });
        return { ok: true, status: 200, data: { id: 'c-ar-secret', type: 'conversation' } };
      },
      assign: async (id) => {
        calls.push({ op: 'assign', id });
        return { ok: true, status: 200, data: { id: 'c-ar-secret', type: 'conversation', admin_assignee_id: 'human-7' } };
      },
      postMessage: async (body) => {
        calls.push({ op: 'message', body });
        return { ok: true, status: 200, data: { id: 'c-ar-secret', type: 'conversation' } };
      },
    },
  });
  assert.strictEqual(sent.sent, true);
  assert.strictEqual(calls.find((c) => c.op === 'message').body, handoff.FIXED_MESSAGES.en);
  const payload = JSON.stringify(calls);
  assert.strictEqual(payload.includes(SECRET), false);
  assert.ok(payload.includes('[secret]'));
}));

Promise.all(tests)
  .then(() => {
    try { fs.unlinkSync(process.env.LUNA_OP_STORE_FILE); } catch (_) { /* temp store */ }
    try { fs.unlinkSync(axiosMock); } catch (_) { /* temp mock */ }
    console.log('OK', passed, 'passed');
  })
  .catch((err) => {
    console.error('FAIL', err && err.stack || err);
    process.exit(1);
  });
