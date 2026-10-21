'use strict';

/**
 * Independent review cases for credential-guard R5 (commit e3c1c9c).
 *
 * Synthetic data only. This file does not start the server, does not call
 * Intercom, and does not approve, merge, or wire the candidate.
 *
 * The security bar is zero credential leakage. A case fails when the outbound
 * text, the spread-test gate, or a log/retention record still carries a secret.
 * Exit code 1 means that bar failed. The author's own tests are not consulted.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PINNED = path.join(__dirname, 'pinned', 'credentialGuard.js');
const EXPECTED_COMMIT = 'e3c1c9c6eb04741c764e803819f521598f7741da';
const EXPECTED_GUARD_SHA = '2e9cd341955ded1bbb1ea512731d30d0a26b05023f70849353cb4316474ac8c8';
const SECRET = 'SYN7pass';
const ZWSP = '\u200b';
const CYRILLIC_O = '\u043e';

const indexSrc = fs.readFileSync(path.join(ROOT, 'luna-current/01_runtime/index.js'), 'utf8');
const spread = require(path.join(ROOT, 'luna-current/01_runtime/spreadAskGate'));
const sanitizer = require(path.join(ROOT, 'luna-current/02_statePresend/credentialSanitizer'));
const softEdges = require(path.join(ROOT, 'luna-current/01_runtime/softEdges'));
const guard = require(PINNED);

const results = [];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function lineOf(src, needle) {
  const at = src.indexOf(needle);
  if (at < 0) return null;
  return src.slice(0, at).split('\n').length;
}

function record(row) {
  const safe = JSON.parse(JSON.stringify(row));
  const blob = JSON.stringify(safe);
  if (blob.includes(SECRET) || (templatePw && blob.includes(templatePw))) {
    throw new Error('result record contained a secret: ' + row.id);
  }
  results.push(safe);
  const mark = row.ok ? 'PASS' : 'FAIL';
  console.log(mark, row.id, row.severity || '', row.path || '');
}

function fail(id, pathName, detail, extra) {
  record(Object.assign({
    id,
    ok: false,
    severity: 'CRITICAL',
    path: pathName,
    detail,
  }, extra || {}));
}

function pass(id, pathName, detail) {
  record({ id, ok: true, severity: 'none', path: pathName, detail });
}

function legacySpreadAsk(text) {
  const t = String(text || '');
  if (!/\b(spread|spreads)\b/i.test(t) && !(/\b(mt5|metatrader)\b/i.test(t) && /\b(login|password|server|demo|test)\b/i.test(t))) {
    return false;
  }
  return /\b(spread|spreads|check|compare|inspect|see|show|what|how|login|password|server|demo|test account)\b/i.test(t);
}

function extractTemplate() {
  const m = indexSrc.match(/const SPREAD_TEST_REPLY =\n([\s\S]*?\n {2}'Use this account to check spreads\.';)/);
  if (!m) throw new Error('SPREAD_TEST_REPLY literal not found');
  const template = eval(m[1].replace(/;\s*$/, ''));
  const pw = (String(template).match(/Password: (\S+)/) || [])[1];
  if (!pw || pw.length < 8) throw new Error('locked template password field missing');
  if (!template.includes('Fundedelite-Server') || !template.includes('55188')) {
    throw new Error('locked template identity fields missing');
  }
  return { template, pw };
}

const { template, pw: templatePw } = extractTemplate();

function postProcessTemplate(text) {
  let t = String(text || '');
  t = t.replace(/\u2014/g, ',').replace(/\u2013/g, '-');
  t = t.replace(/&([a-zA-Z0-9#]+);/g, '\0ENT$1\0');
  t = t.replace(/;/g, ',');
  t = t.replace(/\0ENT([a-zA-Z0-9#]+)\0/g, '&$1;');
  if (!/TEST SPREAD ACCOUNT DETAILS/i.test(t)) {
    t = t.replace(/MetaTrader\s*5/gi, 'the trading platform');
    t = t.replace(/\bMT5\b/gi, 'the trading platform');
  }
  t = t.trim();
  const cleaned = softEdges.postProcessStripJunk(t);
  return cleaned == null ? '' : cleaned;
}

const processedTemplate = postProcessTemplate(template);

function decide(clientText, draft, extra) {
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.map(String).join(' '));
  let result;
  try {
    result = guard.decideCredentialGuard(Object.assign({
      clientText,
      draft: draft == null ? '' : draft,
    }, extra || {}));
  } finally {
    console.log = orig;
  }
  return { result, logs: logs.join('\n') };
}

function outboundHasSecret(result, secret) {
  const message = result && result.message == null ? '' : String(result.message);
  return message.includes(secret);
}

function requireBlocked(id, pathName, clientText, draft, extra) {
  const { result, logs } = decide(clientText, draft, extra);
  const leaked = outboundHasSecret(result, SECRET) || logs.includes(SECRET);
  if (result.action !== 'fixed_message' || leaked || result.message !== guard.FIXED_MESSAGE) {
    fail(id, pathName, 'outbound was not replaced with the fixed security message');
    return;
  }
  pass(id, pathName, 'fixed message, secret absent from the decision and from console');
}

function requireNoLeak(id, pathName, clientText, draft, extra) {
  const { result, logs } = decide(clientText, draft, extra);
  const leaked = outboundHasSecret(result, SECRET) || logs.includes(SECRET);
  if (leaked || result.action !== 'fixed_message') {
    fail(id, pathName, 'candidate returned the draft and the synthetic secret is still in the outbound message');
    return;
  }
  pass(id, pathName, 'secret absent from the outbound message');
}

function loadPresend() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-r5-layout-'));
  fs.cpSync(path.join(ROOT, 'luna-current/02_statePresend'), path.join(tmp, 'statePresend'), { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, 'luna-current/01_runtime/repeatedClientQuestion.js'),
    path.join(tmp, 'repeatedClientQuestion.js')
  );
  return require(path.join(tmp, 'statePresend/presendMega.js'));
}

const presend = loadPresend();

function presendOk(client, draft) {
  const res = presend.validate(draft, {
    state: { last_client_message: client },
    messages: [{ role: 'client', text: client }],
    guards: { spreadAskGate: spread },
    route: 'FULL',
  });
  return { ok: res.ok, codes: (res.hardFails || []).map((f) => f.code) };
}

function sliceAround(src, needle, before, after) {
  const at = src.indexOf(needle);
  if (at < 0) return '';
  return src.slice(Math.max(0, at - before), at + needle.length + after);
}

const guardSha = sha256(fs.readFileSync(PINNED));
if (guardSha !== EXPECTED_GUARD_SHA) {
  throw new Error('pinned candidate hash mismatch');
}
let gitSha = null;
try {
  const fromGit = execFileSync('git', [
    'show',
    EXPECTED_COMMIT + ':luna-current/10_synthetic_lanes/credential-guard-r5/credentialGuard.js',
  ], { cwd: ROOT });
  gitSha = sha256(fromGit);
} catch (_) {
  gitSha = null;
}
if (gitSha && gitSha !== guardSha) {
  throw new Error('pinned bytes differ from commit ' + EXPECTED_COMMIT);
}

pass(
  'artifact-pin',
  'reviews/cred-r5/pinned/credentialGuard.js',
  'sha256 matches the reviewed commit'
);

const guardSrc = fs.readFileSync(PINNED, 'utf8');
if (/console\.|process\.stdout|require\(/.test(guardSrc)) {
  fail('module-has-no-logger-or-io', 'credentialGuard.js', 'candidate writes logs or loads a dependency');
} else {
  pass('module-has-no-logger-or-io', 'credentialGuard.js', 'no console, stdout, or require');
}

requireBlocked(
  'ctrl-labeled-echo',
  'model reply via decideCredentialGuard',
  'password is ' + SECRET,
  'Your password is ' + SECRET
);
requireBlocked(
  'ctrl-label-casing',
  'model reply via decideCredentialGuard',
  'PASSWORD IS ' + SECRET,
  'echo ' + SECRET
);
requireBlocked(
  'ctrl-pass-colon',
  'model reply via decideCredentialGuard',
  'pass: ' + SECRET,
  'echo ' + SECRET
);
requireBlocked(
  'ctrl-typed',
  'model reply via decideCredentialGuard',
  'I typed ' + SECRET,
  'echo ' + SECRET
);
requireBlocked(
  'ctrl-here',
  'model reply via decideCredentialGuard',
  'here it is: ' + SECRET,
  'echo ' + SECRET
);
requireBlocked(
  'ctrl-hinglish-colon',
  'model reply via decideCredentialGuard',
  'mera password: ' + SECRET + ' hai',
  'echo ' + SECRET
);
requireBlocked(
  'ctrl-arabic-with-english-label',
  'model reply via decideCredentialGuard',
  'كلمة المرور password is ' + SECRET,
  'echo ' + SECRET
);
requireBlocked(
  'ctrl-urdu-with-english-label',
  'model reply via decideCredentialGuard',
  'پاس ورڈ password is ' + SECRET,
  'echo ' + SECRET
);
requireBlocked(
  'ctrl-hindi-with-english-label',
  'model reply via decideCredentialGuard',
  'पासवर्ड password is ' + SECRET,
  'echo ' + SECRET
);
requireBlocked(
  'ctrl-long-tail-pass',
  'model reply via decideCredentialGuard',
  'note '.repeat(400) + 'pass ' + SECRET,
  'echo ' + SECRET
);
requireBlocked(
  'ctrl-newline-label',
  'model reply via decideCredentialGuard',
  'password:\n' + SECRET,
  'echo ' + SECRET
);
requireBlocked(
  'ctrl-team-assign-skip',
  'model reply after Luna team assign',
  'password is ' + SECRET,
  'echo ' + SECRET,
  { wouldSkip: true, lunaAssignedTo: 'team' }
);
{
  const { result } = decide('password is ' + SECRET, 'echo ' + SECRET, {
    wouldSkip: true,
    lunaAssignedTo: 'escalation',
  });
  if (result.action === 'fixed_message' && result.overridesSkip === true && !String(result.message).includes(SECRET)) {
    pass('ctrl-escalation-assign-skip', 'model reply after Luna escalation assign', 'skip overridden, secret absent');
  } else {
    fail('ctrl-escalation-assign-skip', 'model reply after Luna escalation assign', 'escalation assign did not force a secret-free fixed message');
  }
}
{
  const { result, logs } = decide('I hope I pass the challenge tomorrow.', 'You can still pass the challenge.', {
    wouldSkip: true,
    lunaAssignedTo: 'team',
  });
  if (result.action === 'allow' && result.overridesSkip === false && !logs.includes(SECRET)) {
    pass('ctrl-pass-the-challenge', 'model reply via decideCredentialGuard', 'ordinary challenge wording stays allowed');
  } else {
    fail('ctrl-pass-the-challenge', 'model reply via decideCredentialGuard', 'ordinary challenge wording was treated as a disclosure');
  }
}
{
  const { result } = decide('password is ' + SECRET, 'S Y N 7 p a s s');
  if (result.action === 'fixed_message' && !String(result.message).includes(SECRET)) {
    pass('ctrl-detected-secret-blocks-spaced-echo', 'model reply via decideCredentialGuard', 'a detected disclosure replaces the whole draft');
  } else {
    fail('ctrl-detected-secret-blocks-spaced-echo', 'model reply via decideCredentialGuard', 'spaced echo of a detected secret was not replaced');
  }
}
{
  const { result } = decide('password is ' + SECRET, 'echo ' + SECRET);
  const pub = JSON.stringify(result);
  if (!pub.includes(SECRET)) {
    pass('ctrl-decision-json-omits-secret', 'decideCredentialGuard return value', 'blocked decision JSON does not contain the secret');
  } else {
    fail('ctrl-decision-json-omits-secret', 'decideCredentialGuard return value', 'blocked decision JSON contains the secret');
  }
}

const leakCases = [
  ['zwsp-between-pass-and-word', 'pass' + ZWSP + 'word is ' + SECRET],
  ['zwsp-inside-password', 'p' + ZWSP + 'assword is ' + SECRET],
  ['zwsp-after-label', 'password' + ZWSP + ' is ' + SECRET],
  ['homoglyph-cyrillic-o', 'passw' + CYRILLIC_O + 'rd is ' + SECRET],
  ['combining-mark-label', 'passwor\u0301d is ' + SECRET],
  ['spaced-label', 'pass word is ' + SECRET],
  ['leet-at', 'p@ssword is ' + SECRET],
  ['leet-zero', 'passw0rd is ' + SECRET],
  ['fullwidth-label', 'ｐａｓｓｗｏｒｄ is ' + SECRET],
  ['fullwidth-colon-here', 'here it is\uFF1A ' + SECRET],
  ['pwd-alias', 'pwd is ' + SECRET],
  ['passwd-alias', 'passwd: ' + SECRET],
  ['split-short-first-token', 'password is ab ' + SECRET],
  ['spaced-character-secret', 'password is S Y N 7 p a s s'],
  ['split-second-half', 'word is ' + SECRET],
  ['base64-message', Buffer.from('password is ' + SECRET, 'utf8').toString('base64')],
  ['urdu-label', 'میرا پاس ورڈ ' + SECRET + ' ہے'],
  ['arabic-label', 'كلمة المرور ' + SECRET],
  ['hindi-label', 'मेरा पासवर्ड ' + SECRET + ' है'],
  ['hinglish-hai', 'mera password hai ' + SECRET],
  ['hinglish-pass-hai', 'mera pass hai ' + SECRET],
  ['urdu-otp', 'او ٹی پی ' + SECRET],
];

for (const [id, client] of leakCases) {
  const draft = id === 'spaced-character-secret'
    ? 'joined form ' + SECRET
    : (id === 'base64-message' ? 'decoded echo ' + SECRET : 'echo ' + SECRET);
  requireNoLeak(id, 'model reply via decideCredentialGuard → would send at index.js postClientCommentOnce', client, draft);
}

requireNoLeak(
  'model-history-echo',
  'model reply: current client text has no disclosure, draft repeats an earlier secret. Send site index.js:4489',
  'Any update on the payout review?',
  'The password from your earlier message was ' + SECRET
);
requireNoLeak(
  'owner-dictated-body',
  'owner-dictated reply. executeOwnerActionPlan posts this body at index.js postReply comment without calling the guard',
  'What is the payout processing time?',
  'Password: ' + SECRET
);

const spreadSendLine = lineOf(indexSrc, 'if (isSpreadCheckAsk(text))');
const spreadPath = '01_runtime/index.js:' + spreadSendLine + ' isSpreadCheckAsk → postClientCommentOnce(SPREAD_TEST_REPLY)';
const early = sliceAround(indexSrc, 'if (isSpreadCheckAsk(text))', 0, 280);
if (!early.includes('postProcessModelReply(SPREAD_TEST_REPLY, conversationId)')) {
  fail('spread-send-is-constant', spreadPath, 'spread early return does not send the locked constant');
} else if (!processedTemplate.includes(templatePw) || processedTemplate.includes(SECRET)) {
  fail('spread-send-is-constant', spreadPath, 'post-process dropped the locked template or added a client secret');
} else if (!processedTemplate.includes('Fundedelite-Server') || !processedTemplate.includes('55188')) {
  fail('spread-send-is-constant', spreadPath, 'post-process dropped the server or account identity');
} else {
  pass('spread-send-is-constant', spreadPath, 'early return sends only the post-processed locked template');
}

const spreadCases = [
  ['spread-explicit-test', 'please run a spread test on MT5', true],
  ['spread-check', 'can you check the spreads?', true],
  ['spread-what-are', 'what are your spreads', true],
  ['spread-bare', 'spreads?', true],
  ['spread-hinglish-explicit', 'bhai spread test chahiye', true],
  ['spread-credentials-phrase', 'send the spread test credentials', true],
  ['spread-eurusd', 'how wide is the EURUSD spread right now?', true],
  ['spread-mt5-password-only', 'mt5 login password server demo', false],
  ['spread-investor-password-ask', 'what is my investor password?', false],
  ['spread-spreadsheet', 'send the spreadsheet of fees', false],
  ['spread-negated', 'this is not about the spreads, send my login', false],
  ['spread-the-word', 'please spread the word about the promo', false],
  ['spread-across-accounts', 'my positions are spread across two accounts and I need the password', false],
  ['spread-widespread', 'there is a widespread payout delay', false],
  ['spread-personal-login', 'my password is wrong and the issue spread to phase 2', false],
  ['spread-idiom-some-light', 'can you spread some light on the payout rules?', false],
  ['spread-idiom-spread-to', 'the problem spread to my second account', false],
  ['spread-idiom-risk', 'how is the risk spread?', false],
];

for (const [id, text, explicit] of spreadCases) {
  const send = spread.gateLegacy([text], legacySpreadAsk);
  const explain = spread.explain(text);
  if (send !== explicit) {
    fail(
      id,
      spreadPath + ' via spreadAskGate.explain reason ' + explain.reason,
      explicit
        ? 'explicit spread-test request did not send the locked template'
        : 'locked investor template would be sent without an explicit spread-test request'
    );
  } else if (send && (processedTemplate.includes(SECRET) || !processedTemplate.includes('55188'))) {
    fail(id, spreadPath, 'template send included something other than the locked template');
  } else {
    pass(id, '01_runtime/spreadAskGate.js explain + index.js early return', explicit ? 'explicit request sends the locked template only' : 'no template send');
  }
}

{
  const mixed = 'please run a spread test. my password is ' + SECRET;
  const send = spread.gateLegacy([mixed], legacySpreadAsk);
  const body = send ? processedTemplate : '';
  if (!send) {
    fail('spread-mixed-client-secret-not-appended', spreadPath, 'explicit spread-test request was dropped');
  } else if (body.includes(SECRET) || !body.includes('55188') || !body.includes('Fundedelite-Server')) {
    fail('spread-mixed-client-secret-not-appended', spreadPath, 'client secret was appended to the locked template');
  } else {
    pass('spread-mixed-client-secret-not-appended', spreadPath, 'explicit request sends the template and not the pasted client secret');
  }
}

{
  const client = 'When can I request a payout?';
  const draft = 'You can request a payout from the dashboard once the published requirements for that account are met. Password: ' + SECRET;
  const held = presendOk(client, draft);
  const { result } = decide(client, draft);
  if (held.ok && outboundHasSecret(result, SECRET)) {
    fail(
      'model-payout-answer-appends-secret',
      '02_statePresend/presendMega.js validate then index.js:4489. Guard is not consulted and presend ok=' + held.ok,
      'a normal answer that appends a password is allowed by both the candidate and the presend gate'
    );
  } else if (outboundHasSecret(result, SECRET)) {
    fail('model-payout-answer-appends-secret', 'decideCredentialGuard', 'candidate allows the appended password');
  } else {
    pass('model-payout-answer-appends-secret', 'presend + decideCredentialGuard', 'appended password blocked');
  }
}

{
  const client = 'When can I request a payout?';
  const draft = 'You can request a payout from the dashboard once the published requirements for that account are met. '
    + 'Server: Fundedelite-Server. Account Number: 55188. Password: ' + templatePw;
  const held = presendOk(client, draft);
  const { result } = decide(client, draft);
  const msg = String(result.message || '');
  if (msg.includes(templatePw) && held.ok) {
    fail(
      'model-shares-template-password-off-request',
      'presendMega.js spread check requires the word spread (lines 208-212); decideCredentialGuard does not scan the draft. Send site index.js:4489',
      'investor template secret is allowed on a payout question that never asked for a spread test'
    );
  } else if (msg.includes(templatePw)) {
    fail('model-shares-template-password-off-request', 'decideCredentialGuard', 'candidate allows the template password outside a spread-test request');
  } else {
    pass('model-shares-template-password-off-request', 'presend + decideCredentialGuard', 'template password held');
  }
}

function requireSourceGap(id, needle, detail) {
  const line = lineOf(indexSrc, needle);
  const around = sliceAround(indexSrc, needle, 0, 500);
  if (!line) {
    fail(id, '01_runtime/index.js', 'expected send site not found: ' + needle);
    return;
  }
  if (/decideCredentialGuard|credential-guard-r5|credentialGuard/.test(around) || /decideCredentialGuard|credentialGuard/.test(indexSrc)) {
    pass(id, '01_runtime/index.js:' + line, 'guard is referenced');
    return;
  }
  fail(id, '01_runtime/index.js:' + line + ' ' + detail, 'this send or rewrite never calls decideCredentialGuard');
}

if (/decideCredentialGuard|credential-guard-r5|credentialGuard/.test(indexSrc)) {
  pass('runtime-references-guard', '01_runtime/index.js', 'runtime references the candidate');
} else {
  fail('runtime-references-guard', '01_runtime/index.js', 'no reference to the candidate anywhere on the outbound path');
}
requireSourceGap(
  'owner-plan-bypasses-guard',
  'Owner-dictated public REPLY',
  'executeOwnerActionPlan REPLY → postReply comment'
);
requireSourceGap(
  'owner-note-bypasses-guard',
  'Auth-note REPLY (incl. send-this-message brackets)',
  'processAuthorizedNoteCommands REPLY → postReply comment'
);
requireSourceGap(
  'inner-retry-bypasses-guard',
  'REPEATED_DIRECT_REPLY_HELD',
  'postClientCommentOnceInner replaces finalBody with a new model draft'
);
requireSourceGap(
  'presend-regenerate-bypasses-guard',
  'PRESEND_REGENERATE_FAILED',
  '__presendRegenerate returns a new client body'
);
requireSourceGap(
  'repeated-question-retry-bypasses-guard',
  'REPEATED_QUESTION_REPHRASED',
  'repeated-question retry assigns body from a second model call'
);

const skipLine = lineOf(indexSrc, "console.log('SKIP model', conversationId, parsed.body)");
const ownerLogLine = lineOf(indexSrc, "console.log('OWNER_CMD_LLM_RAW', conversationId, rawOut.slice(0, 240))");
if (!skipLine) {
  fail('skip-logs-model-body', '01_runtime/index.js', 'SKIP model log site missing');
} else {
  fail('skip-logs-model-body', '01_runtime/index.js:' + skipLine, 'SKIP model logs parsed.body before any credential guard');
}
if (!ownerLogLine) {
  fail('owner-logs-raw-model', '01_runtime/index.js', 'OWNER_CMD_LLM_RAW log site missing');
} else {
  fail('owner-logs-raw-model', '01_runtime/index.js:' + ownerLogLine, 'owner command logs the raw model text, which can contain a dictated secret');
}

function requireRedacted(id, text) {
  const out = sanitizer.sanitizeCredentials(text);
  let encodedLeft = false;
  if (id === 'log-base64-retained') {
    try {
      encodedLeft = Buffer.from(out, 'base64').toString('utf8').includes(SECRET);
    } catch (_) {
      encodedLeft = false;
    }
  }
  if (out.includes(SECRET) || encodedLeft) {
    fail(id, '02_statePresend/statePresend.js noteInbound and 03_luna-maintainer/collector.js observe → credentialSanitizer.sanitizeCredentials', 'sanitized retention text still carries the secret');
    return;
  }
  pass(id, 'credentialSanitizer.sanitizeCredentials', 'secret removed before retention');
}

requireRedacted('log-plain-redacted', 'password is ' + SECRET);
requireRedacted('log-hinglish-hai', 'mera password hai ' + SECRET);
requireRedacted('log-zwsp', 'pass' + ZWSP + 'word is ' + SECRET);
requireRedacted('log-leet', 'p@ssword is ' + SECRET);
requireRedacted('log-urdu', 'میرا پاس ورڈ ' + SECRET);
requireRedacted('log-arabic', 'كلمة المرور ' + SECRET);
requireRedacted('log-hindi', 'मेरा पासवर्ड ' + SECRET);
requireRedacted('log-homoglyph', 'passw' + CYRILLIC_O + 'rd is ' + SECRET);
requireRedacted('log-spaced-label', 'pass word is ' + SECRET);
requireRedacted('log-base64-retained', Buffer.from('password is ' + SECRET, 'utf8').toString('base64'));

const failed = results.filter((r) => !r.ok);
const critical = failed.filter((r) => r.severity === 'CRITICAL');
const summary = {
  verdict: critical.length ? 'NEEDS CHANGES' : 'PASS',
  commit: EXPECTED_COMMIT,
  guardSha256: guardSha,
  gitObjectMatchesPin: gitSha === guardSha,
  total: results.length,
  passed: results.filter((r) => r.ok).length,
  failed: failed.length,
  critical: critical.length,
  r4TreePresent: false,
  authorTestsUsed: false,
};
const output = {
  summary,
  hashes: {
    commit: EXPECTED_COMMIT,
    credentialGuardJs: guardSha,
    indexJs: sha256(indexSrc),
    spreadAskGateJs: sha256(fs.readFileSync(path.join(ROOT, 'luna-current/01_runtime/spreadAskGate.js'))),
    credentialSanitizerJs: sha256(fs.readFileSync(path.join(ROOT, 'luna-current/02_statePresend/credentialSanitizer.js'))),
  },
  results,
};
const outPath = path.join(__dirname, 'RESULTS.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
console.log('SUMMARY', summary.verdict, summary.passed + '/' + summary.total, 'critical', summary.critical);
process.exit(critical.length ? 1 : 0);
