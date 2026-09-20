'use strict';
/**
 * Unit: escalate short-ack SKIP + no-repeat status (fresh-2026-09-15-escalate-ack-norepeat)
 * Extracts pure helpers from live index.js so tests track production.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcPath = [
  process.env.LUNA_ROOT && path.join(process.env.LUNA_ROOT, 'index.js'),
  '/home/ubuntu/index.js',
  path.join(__dirname, '..', '01_runtime', 'index.js'),
  path.join(__dirname, 'index.js'),
].filter(Boolean).find((p) => {
  try { return fs.existsSync(p); } catch (_) { return false; }
});
if (!srcPath) throw new Error('index.js not found for escalate-ack fixture');
const src = fs.readFileSync(srcPath, 'utf8');
let teammateHandoffGates;
try {
  teammateHandoffGates = require(path.join(path.dirname(srcPath), 'teammateHandoffGates'));
} catch (_) {
  teammateHandoffGates = { isShortClientAckExpanded: () => false };
}
let escalateRelatedOnly;
try {
  escalateRelatedOnly = require(path.join(path.dirname(srcPath), 'escalateRelatedOnly'));
} catch (_) {
  escalateRelatedOnly = { pickEscalateStatusReply: () => null };
}

function extractFn(name) {
  const re = new RegExp(
    'function\\s+' + name + '\\s*\\([\\s\\S]*?\\n\\}\\n(?=\\n|function\\s|async\\s+function\\s|const\\s|let\\s|var\\s|\\/\\*|\\/\\/|module\\.exports|app\\.)'
  );
  const m = src.match(re);
  if (!m) throw new Error('extract fail: ' + name);
  return m[0];
}

const ARSAL_ID = '10118526';
const sandbox = {
  ARSAL_ID,
  teammateHandoffGates,
  escalateRelatedOnly,
  console,
  stripHtml(s) {
    return String(s || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  },
  getConvState() {
    return { all: {}, state: {}, id: 't' };
  },
  saveTicketState() {},
};
vm.createContext(sandbox);

for (const name of [
  'isShortClientAck',
  'normalizePublicBotBody',
  'bodiesNearlyIdentical',
  'getLastArsalPublicCommentBody',
  'pickEscalateStatusReply',
]) {
  vm.runInContext(extractFn(name), sandbox);
}

let failed = 0;
function check(label, cond) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', label);
  } else {
    console.log('PASS', label);
  }
}

check('isShortClientAck("ok, thank you")', sandbox.isShortClientAck('ok, thank you') === true);
check('isShortClientAck("Okay, thanks!")', sandbox.isShortClientAck('Okay, thanks!') === true);
check('isShortClientAck("thank you")', sandbox.isShortClientAck('thank you') === true);
check(
  'isShortClientAck long question false',
  sandbox.isShortClientAck(
    'Okay, I have the credentials now. Do you think this submission might take a while?'
  ) === false
);

function simulateAwaitingPath(text, escState, lastPublicBody) {
  const relatedToOpenEsc = true;
  const escalateAwaitingFirstTeammate = !!(escState && escState.escalateAwaitingFirstTeammate);
  if (!(relatedToOpenEsc && escalateAwaitingFirstTeammate)) {
    return { posted: false, reason: 'not_awaiting' };
  }
  if (sandbox.isShortClientAck(text)) {
    return { posted: false, reason: 'short_ack' };
  }
  const excludes = [];
  if (escState.lastEscalateStatusBody) excludes.push(escState.lastEscalateStatusBody);
  if (lastPublicBody) excludes.push(lastPublicBody);
  const status = sandbox.pickEscalateStatusReply(excludes);
  if (!status) return { posted: false, reason: 'duplicate_all' };
  if (lastPublicBody && sandbox.bodiesNearlyIdentical(status, lastPublicBody)) {
    return { posted: false, reason: 'identical_last' };
  }
  return { posted: true, status, reason: 'status' };
}

const lastStatus =
  "Our team has already been informed about this issue. Please allow them to review the account, and you'll receive an update shortly.";

const sim = simulateAwaitingPath(
  'ok, thank you',
  { escalateAwaitingFirstTeammate: true, lastEscalateStatusBody: lastStatus },
  lastStatus
);
check('related+awaiting+shortAck → no status post', sim.posted === false && sim.reason === 'short_ack');

const simQ = simulateAwaitingPath(
  'Okay, I have the credentials now. Do you think this submission might take a while?',
  { escalateAwaitingFirstTeammate: true },
  null
);
check('related+awaiting+real question → may post status', simQ.posted === true && !!simQ.status);

const picked = sandbox.pickEscalateStatusReply([lastStatus]);
check('pick excludes last status variant', picked !== null && !sandbox.bodiesNearlyIdentical(picked, lastStatus));

const all = [
  'Your request has already been forwarded to our team. They are reviewing it and will update you as soon as possible.',
  "Our team has already been informed about this issue. Please allow them to review the account, and you'll receive an update shortly.",
  "This is already with our team for review. They'll update you as soon as they have checked it.",
];
const none = sandbox.pickEscalateStatusReply(all);
check('all variants excluded → null (SKIP)', none === null);

check(
  'normalize near-identical',
  sandbox.normalizePublicBotBody(lastStatus + '!!!') === sandbox.normalizePublicBotBody(lastStatus)
);
check(
  'bodiesNearlyIdentical ignores punct',
  sandbox.bodiesNearlyIdentical(lastStatus, lastStatus.replace(/\./g, '!')) === true
);

const dupSim = simulateAwaitingPath(
  'Any update on my account review please?',
  { escalateAwaitingFirstTeammate: true, lastEscalateStatusBody: lastStatus },
  lastStatus
);
check(
  'normalize duplicate of last → different or skip (not same)',
  dupSim.posted === false ||
    (dupSim.posted && !sandbox.bodiesNearlyIdentical(dupSim.status, lastStatus))
);

check(
  'engine tag in source',
  /fresh-2026-09-15-(escalate-ack-norepeat|soft-edges-v1)/.test(src) && /postEscalateHoldingStatus/.test(src)
);

if (failed) {
  console.error('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nAll escalate-ack-norepeat unit checks passed');
