'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const axiosMock = path.join(os.tmpdir(), 'luna-r18-axios-' + process.pid + '.js');
fs.writeFileSync(axiosMock, 'module.exports = { get: async function () { return { status: 404, data: "" }; } };\n');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'axios') return axiosMock;
  return resolveFilename.call(this, request, parent, isMain, options);
};

process.env.FUNDEDELITE_FAQ_PATH = path.join(__dirname, '../../01_runtime/fundedelite-faqs.md');
process.env.LUNA_OP_STORE_FILE = path.join(os.tmpdir(), 'luna-r18-ops-' + process.pid + '.json');
try { fs.unlinkSync(process.env.LUNA_OP_STORE_FILE); } catch (_) { /* fresh store */ }

const handoff = require('../../01_runtime/fixedMessageHandoff');

const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const OWN = {
  arsalId: 'seat-a',
  eliteAiId: 'seat-e',
  riskTeamId: 'risk-1',
  escalationsTeamId: 'esc-1',
};
const SECRET = 'SuperSecretValue99';
const PASSING = [
  'what is the password policy?',
  'what are the password requirements?',
  'what are the password rules?',
  'what is the password criteria?',
  'what is the password requirement?',
  'what are the password rule?',
];

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

tests.push(test('a Hindi live-agent request with a Latin password is still the Hindi line', () => {
  const labeled = 'मुझे एजेंट से बात करनी है password: ' + SECRET.repeat(8);
  const unlabeled = 'मुझे एजेंट से बात करनी है ' + SECRET.repeat(8);
  for (const text of [labeled, unlabeled]) {
    assert.strictEqual(handoff.isPureLiveAgentAsk(text), false, text.slice(0, 40));
    assert.strictEqual(handoff.isHumanAgentRequest(text), true, text.slice(0, 40));
    const result = decide(text);
    assert.strictEqual(result.action, 'fixed_message', text.slice(0, 40));
    assert.strictEqual(result.language, 'hi', text.slice(0, 40));
    assert.strictEqual(result.message, handoff.FIXED_MESSAGES.hi, text.slice(0, 40));
    assert.strictEqual(String(result.message).includes(SECRET), false);
  }
  const src = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  const fn = src.indexOf('function shouldWaitForFin');
  const created = src.indexOf("topic === 'conversation.user.created'", fn);
  const live = src.indexOf('FIN_WAIT bypass live-agent user.created', created);
  const skip = src.indexOf('SKIP fin-wait user.created', live);
  assert.ok(created > 0 && created < live && live < skip);
  assert.ok(src.slice(created, live).includes('isHumanAgentRequest'));
  assert.ok(src.slice(created, live).includes('isPureLiveAgentAsk'));
}));

tests.push(test('a general password-policy question gets a line and the other wordings stay normal', () => {
  const explain = 'Can you explain the password policy?';
  const explained = decide(explain, { path: 'missed_escalation', force: true });
  assert.strictEqual(explained.action, 'route_normal');
  assert.strictEqual(explained.message, null);
  assert.strictEqual(handoff.isPasswordPolicyQuestion(explain), true);
  assert.strictEqual(handoff.isHumanAgentRequest(explain), false);
  assert.strictEqual(handoff.uniqueRankedFaqArticle(explain), '');
  assert.strictEqual(handoff.approvedFaqCustomerBody(explain), '');
  const clarifier = handoff.passwordPolicyPublicLine(explain, '');
  assert.ok(clarifier);
  assert.notStrictEqual(clarifier, '');
  assert.notStrictEqual(clarifier, HEDGE);
  assert.strictEqual(Object.values(handoff.FIXED_MESSAGES).includes(clarifier), false);
  assert.strictEqual(
    handoff.passwordPolicyPublicLine(explain, 'Passwords must include letters and numbers.'),
    'Passwords must include letters and numbers.'
  );
  assert.strictEqual(handoff.passwordPolicyPublicLine(explain, HEDGE), clarifier);
  for (const text of PASSING) {
    for (const pathName of ['welcome', 'missed_escalation']) {
      const result = decide(text, { path: pathName, force: pathName !== 'welcome' });
      assert.strictEqual(result.action, 'route_normal', pathName + ' ' + text);
      assert.strictEqual(result.message, null, text);
    }
    assert.strictEqual(handoff.isPasswordPolicyQuestion(text), true, text);
    assert.strictEqual(handoff.isTerminalHedge(text), false, text);
    assert.strictEqual(handoff.isHumanAgentRequest(text), false, text);
    assert.notStrictEqual(handoff.passwordPolicyPublicLine(text, ''), '');
  }
  const src = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  const skip = src.indexOf('PRESEND skip clarifier or password policy');
  assert.ok(skip > 0);
  assert.ok(src.slice(skip - 700, skip).includes('passwordPolicyPublicLine'));
  assert.ok(src.slice(skip - 700, skip).includes('__originalDraft'));
}));

tests.push(test('a supported figure posts as itself and a wrong figure does not', () => {
  const knowledge = [{ title: 'Rules', text: 'DLL 5%/3%, MLL 8%.', score: 0.9 }];
  assert.strictEqual(handoff.supportedFigureDraft('The DLL is 5%.', '', knowledge), 'The DLL is 5%.');
  assert.strictEqual(handoff.supportedFigureDraft('', 'The DLL is 5%.', knowledge), 'The DLL is 5%.');
  assert.strictEqual(handoff.supportedFigureDraft('The MLL is 8%.', '', knowledge), 'The MLL is 8%.');
  assert.strictEqual(handoff.supportedFigureDraft('The DLL is 99%.', '', knowledge), '');
  assert.strictEqual(handoff.supportedFigureDraft('The daily drawdown is 8%.', '', knowledge), '');
  assert.strictEqual(handoff.supportedFigureDraft('A teammate can help with that.', '', knowledge), '');
  assert.strictEqual(handoff.supportedFigureDraft('The DLL is 5%.', '', null), '');
  const src = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  const marker = src.indexOf('FIXED_MESSAGE_HANDOFF_R3:missed_escalation');
  const commit = src.indexOf('commitFixedMessageHandoff', marker);
  const hedge = src.lastIndexOf('UNSUPPORTED_NUMBER_HEDGE', marker);
  assert.ok(hedge > 0 && hedge < marker && marker < commit);
  const window = src.slice(marker, commit);
  assert.ok(window.includes('ensureIdentityBeforeAccountEscalate'));
  assert.ok(window.includes('__postFig'));
  assert.ok(window.indexOf('isAccountNumberQuestion') < window.indexOf('ensureIdentityBeforeAccountEscalate'));
  assert.ok(src.slice(marker - 2100, marker).includes('supportedFigureDraft'));
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
