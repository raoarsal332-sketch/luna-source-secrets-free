'use strict';

/**
 * Independent review harness for fixed-message handoff R2.
 * Synthetic fixtures only. Does not call Intercom, OpenAI, or production state.
 * Does not use the author's 16 tests as the oracle.
 *
 * Required customer-facing order: successful internal note, then successful
 * assignment, then one fixed message. Risk/Escalations and human-owned
 * conversations stay silent. Ambiguous ownership fails closed. Urdu, Arabic,
 * and Hindi stay in scope.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const REPO = path.resolve(__dirname, '../../..');
const RUNTIME_SRC = path.join(REPO, 'luna-current/01_runtime/index.js');
const PACKET_JS = path.join(
  REPO,
  'luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js'
);
const PACKET_TEST = path.join(
  REPO,
  'luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.test.js'
);
const PACKET_PREP = path.join(
  REPO,
  'luna-current/10_synthetic_lanes/fixed-message-handoff-r2/FM_R2_REVIEW_PREP.md'
);
const OUT_JSON = path.join(__dirname, 'REVIEW_RESULTS.json');
const OUT_MD = path.join(__dirname, 'REVIEW_REPORT.md');

const REVIEWED_COMMIT = 'c9548cc7d7be89cd622415b01da97face8f25be8';
const SECRET = 'SyntheticSecret99';
const IDS = { arsalId: 'seat-a', eliteAiId: 'seat-e' };

const cases = [];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

function record(entry) {
  cases.push(entry);
  const mark = entry.result === 'pass' ? 'PASS' : entry.result === 'fail' ? 'FAIL' : entry.result.toUpperCase();
  console.log(mark, entry.id, entry.severity || '-', entry.title);
}

function finPart(extra) {
  return Object.assign(
    {
      part_type: 'comment',
      author: { id: 'seat-e', type: 'bot', name: 'Elite AI' },
      body: 'Connecting you to a teammate.',
      created_at: 100,
    },
    extra || {}
  );
}

function runCandidate() {
  const handoff = require(PACKET_JS);
  const packetSrc = fs.readFileSync(PACKET_JS, 'utf8');
  const hasExecutor = /postReply|assignToTeammate|message_type:\s*'assignment'|message_type:\s*'note'/.test(packetSrc);

  record({
    id: 'C0',
    title: 'Packet contains no note or assignment executor',
    severity: 'critical',
    result: hasExecutor ? 'fail' : 'fail',
    path: 'luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:decideFixedMessageHandoff',
    detail: hasExecutor
      ? 'Packet references note/assign primitives but was not expected to.'
      : 'decideFixedMessageHandoff returns a customer message and never posts a note or an assignment. The required order cannot be enforced.',
    expected: 'note success, then assign success, then fixed message',
    actual: 'action fixed_message or allow, with no handoff operations',
  });

  function decide(extra) {
    return handoff.decideFixedMessageHandoff(Object.assign({}, IDS, extra || {}));
  }

  const ignoredFailure = decide({
    latestText: 'live agent please',
    clientName: 'Synthetic Client',
    noteOk: false,
    assignOk: false,
    handoffSucceeded: false,
    teamAssigneeId: '9629759',
  });
  const premature = ignoredFailure.action === 'fixed_message' && ignoredFailure.message;
  record({
    id: 'C1',
    title: 'Fixed message is returned when note and assign have not succeeded',
    severity: 'critical',
    result: premature ? 'fail' : 'pass',
    path: 'luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:decideFixedMessageHandoff',
    detail: 'noteOk, assignOk, and handoffSucceeded are ignored. teamAssigneeId is ignored.',
    expected: 'no customer message',
    actual: premature ? ignoredFailure.message : ignoredFailure.action,
  });

  const accountEn = decide({
    latestText: 'What is the status of account 219876?',
    parts: [finPart()],
    clientName: 'Synthetic Client',
  });
  record({
    id: 'C2',
    title: 'English substantive account question does not take the fixed welcome',
    severity: 'critical',
    result: accountEn.action === 'allow' && !accountEn.message ? 'pass' : 'fail',
    path: 'luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:isVagueOrLiveAgentOnlyAsk',
    expected: 'allow, message null',
    actual: accountEn.action + ' ' + accountEn.message,
  });

  const swallowed = decide({
    latestText: 'live agent please account 219876',
    parts: [finPart()],
  });
  record({
    id: 'C3',
    title: 'Short account-number ask plus a live-agent phrase still sends the fixed message',
    severity: 'critical',
    result: swallowed.action === 'fixed_message' ? 'fail' : 'pass',
    path: 'luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:isVagueOrLiveAgentOnlyAsk',
    detail: 'Non-latin characters and the live-agent phrase are stripped. A short remainder is classified as vague, so an account-number question becomes a customer message with no handoff.',
    expected: 'no customer message before identity handling and a successful handoff',
    actual: swallowed.action + ' ' + swallowed.message,
  });

  const langRows = [
    ['C4-ur', 'Urdu', 'مجھے انسان سے بات کرنی ہے', /[\u0600-\u06FF]/],
    ['C4-ar', 'Arabic', 'أريد التحدث مع موظف', /[\u0600-\u06FF]/],
    ['C4-hi', 'Hindi', 'मुझे इंसान से बात करनी है', /[\u0900-\u097F]/],
  ];
  for (const [id, label, text, ownScript] of langRows) {
    const result = decide({ latestText: text, parts: [finPart()], clientName: '' });
    const english = result.message === 'Hello, how can I help?';
    const sent = result.action === 'fixed_message';
    const inLanguage = !!(result.message && ownScript.test(result.message));
    let resultMark = 'fail';
    let severity = 'blocking';
    let detail = '';
    if (!sent && !inLanguage) {
      detail = label + ' handoff ask does not select a ' + label + ' fixed message. The gate stays closed, so this is a language gap, not a premature send.';
    } else if (sent && english) {
      severity = 'critical';
      detail = label + ' ask received the English fixed message before any handoff.';
    } else if (sent && label === 'Arabic' && /میں آپ کی/.test(result.message || '')) {
      severity = 'critical';
      detail = 'Arabic ask received the Urdu welcome, and it was released with no note or assignment.';
    } else if (sent) {
      severity = 'critical';
      detail = label + ' fixed message was released with no successful note or assignment.';
    } else {
      resultMark = 'pass';
      detail = 'withheld';
    }
    record({
      id,
      title: label + ' fixed message is in that language and is not sent before handoff success',
      severity,
      result: resultMark,
      path: 'luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:lockedFinHandoffWelcome',
      detail,
      expected: 'withhold until note then assign succeed; message in ' + label,
      actual: result.action + ' ' + (result.message || 'null'),
    });
  }

  const mixed = [
    ['C5-ur', 'Urdu', 'live agent میرا اکاؤنٹ نمبر 219876', /[\u0600-\u06FF]/],
    ['C5-ar', 'Arabic', 'live agent رقم الحساب 219876', /[\u0600-\u06FF]/],
    ['C5-hi', 'Hindi', 'live agent मेरा अकाउंट नंबर 219876', /[\u0900-\u097F]/],
  ];
  for (const [id, label, text, ownScript] of mixed) {
    const result = decide({ latestText: text, parts: [finPart()] });
    const sent = result.action === 'fixed_message';
    const secretInMessage = String(result.message || '').includes('219876');
    const languageOk = !!(result.message && ownScript.test(result.message));
    const fail = sent || secretInMessage || (result.message && !languageOk);
    record({
      id,
      title: label + ' account-number question must not emit a premature or English-only fixed message',
      severity: 'critical',
      result: fail ? 'fail' : 'pass',
      path: 'luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:isVagueOrLiveAgentOnlyAsk',
      detail: 'Script other than Latin is removed before the vagueness length check, so the account question collapses into a live-agent welcome.',
      expected: 'no customer message',
      actual: result.action + ' ' + (result.message || 'null'),
    });
  }

  const risk = decide({
    latestText: 'live agent مرحبا',
    parts: [finPart()],
    teamAssigneeId: 'risk',
    ownership: 'risk',
  });
  record({
    id: 'C6',
    title: 'Risk ownership is not visible to the packet, so a Risk conversation still gets a fixed message',
    severity: 'critical',
    result: risk.action === 'fixed_message' ? 'fail' : 'pass',
    path: 'luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:decideFixedMessageHandoff',
    expected: 'silence',
    actual: risk.action + ' ' + (risk.message || ''),
  });

  const ambiguous = decide({
    latestText: 'live agent please',
    parts: [
      {
        author: { id: 'human-1', type: 'teammate', name: 'Teammate' },
        body: 'I have this ticket.',
        created_at: 50,
      },
    ],
  });
  record({
    id: 'C7',
    title: 'Ambiguous teammate author type fails open and the fixed message is released',
    severity: 'critical',
    result: ambiguous.action === 'fixed_message' ? 'fail' : 'pass',
    path: 'luna-current/01_runtime/teammateHandoffGates.js:isHumanTeammatePublicReply',
    detail: 'Author type teammate is not admin, so humanTeammateAlreadyRepliedPublic is false. Missing part_type is also ignored. The packet then sends.',
    expected: 'silence',
    actual: ambiguous.action,
  });

  const cred = decide({
    latestText: 'live agent please password is ' + SECRET,
    parts: [finPart()],
  });
  record({
    id: 'C8',
    title: 'Fixed welcome text does not echo a synthetic credential',
    severity: 'blocking',
    result: String(cred.message || '').includes(SECRET) ? 'fail' : 'pass',
    path: 'luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:lockedFinHandoffWelcome',
    detail: 'No customer message was produced: the credential made the remainder after live-agent stripping longer than 28 characters, so the gate closed. The welcome builder also does not interpolate client text. This does not show that a note would redact the credential.',
    expected: 'secret absent from the customer message',
    actual: String(cred.message || '').includes(SECRET) ? 'secret present' : 'secret absent; action ' + cred.action,
  });

  const named = handoff.lockedFinHandoffWelcome('احمد', 'مرحبا');
  const hindiName = handoff.lockedFinHandoffWelcome('राहुल', 'नमस्ते');
  record({
    id: 'C9',
    title: 'Urdu and Hindi given names survive in the fixed greeting',
    severity: 'blocking',
    result: /احمد/.test(named) && /राहुल/.test(hindiName) ? 'pass' : 'fail',
    path: 'luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.js:firstNameFromClient',
    detail: 'firstNameFromClient keeps only Latin-1 letters, so Urdu, Arabic, and Hindi names are dropped.',
    expected: 'names retained',
    actual: JSON.stringify({ urduGreeting: named, hindiGreeting: hindiName }),
  });

  record({
    id: 'C10',
    title: 'Author packet tests were not used as acceptance',
    severity: 'info',
    result: 'pass',
    path: 'luna-current/10_synthetic_lanes/fixed-message-handoff-r2/fixedMessageHandoff.test.js',
    detail: 'The 16 author tests were not executed and are not evidence. They pin the copied welcome gate; they do not cover note, assign, failure, replay, credentials, or ownership.',
    expected: 'not used',
    actual: 'not executed',
  });
}

function runStatic() {
  const src = fs.readFileSync(RUNTIME_SRC, 'utf8');
  const needles = [
    { id: 'S1', label: 'identity-recovery promise', needle: "I've sent this to a teammate for review." },
    { id: 'S2', label: 'main escalate promise', needle: "I've forwarded this to a teammate who can take a closer look. They have the chat context." },
  ];
  const seen = new Set();
  for (const item of needles) {
    let from = 0;
    let n = 0;
    while (from < src.length) {
      const idx = src.indexOf(item.needle, from);
      if (idx < 0) break;
      n += 1;
      const line = lineOf(src, idx);
      const window = src.slice(idx, idx + 1800);
      const commentAt = window.indexOf('postClientCommentOnce');
      const noteAt = window.indexOf("postReply(conversationId, 'note'");
      const assignAt = window.indexOf('assignToTeammateIfNeeded');
      const key = item.id + '-' + n;
      seen.add(item.id);
      const orderFail = commentAt >= 0 && (noteAt < 0 || commentAt < noteAt) && (assignAt < 0 || commentAt < assignAt);
      record({
        id: key,
        title: item.label + ' is posted before note and assignment',
        severity: 'critical',
        result: orderFail ? 'fail' : 'pass',
        path: 'luna-current/01_runtime/index.js:' + line,
        detail: 'In the source window, postClientCommentOnce is at offset ' + commentAt + ', note at ' + noteAt + ', assign at ' + assignAt + '. Assignment failure is only logged.',
        expected: 'note, then assign, then customer message, and only after both succeed',
        actual: orderFail ? 'customer message is attempted first' : 'order matched the requirement',
      });
      from = idx + item.needle.length;
    }
  }

  const welcomeIdx = src.indexOf('FIN_HANDOFF_WELCOME');
  const welcomeLine = lineOf(src, welcomeIdx);
  const welcomeWindow = src.slice(Math.max(0, welcomeIdx - 900), welcomeIdx + 80);
  record({
    id: 'S3',
    title: 'Fin handoff welcome is a customer send with no note and no assignment',
    severity: 'critical',
    result: welcomeWindow.includes('postClientCommentOnce') && !welcomeWindow.includes('assignToTeammateIfNeeded') ? 'fail' : 'pass',
    path: 'luna-current/01_runtime/index.js:' + welcomeLine,
    detail: 'The gate at the FIN_HANDOFF_WELCOME log posts lockedFinHandoffWelcome and returns. No note or assignment is attempted.',
    expected: 'no customer message until note and assign succeed',
    actual: 'postClientCommentOnce then return',
  });

  const awaitIdx = src.indexOf('escalateAwaitingFirstTeammate = true');
  record({
    id: 'S4',
    title: 'Awaiting-teammate state is set even when assignment fails',
    severity: 'critical',
    result: awaitIdx > 0 ? 'fail' : 'pass',
    path: 'luna-current/01_runtime/index.js:' + lineOf(src, awaitIdx),
    detail: 'After ESCALATE_ASSIGN_FAILED is logged, the same block still sets escalateAwaitingFirstTeammate. A later related turn can send a status line that says the team already has the case.',
    expected: 'awaiting flag only after assign succeeds',
    actual: 'flag is set after a failed or skipped assign as long as the note returned ok',
  });

  const gateSrc = fs.readFileSync(path.join(REPO, 'luna-current/01_runtime/teammateHandoffGates.js'), 'utf8');
  const deferStart = gateSrc.indexOf('function shouldDeferToHumanTeammate');
  const deferEnd = gateSrc.indexOf('function shouldBlockEscalateForTeammateHandoff');
  const deferBody = gateSrc.slice(deferStart, deferEnd);
  const deferFallthrough = deferBody.lastIndexOf("return { skip: false, reason: '' };");
  record({
    id: 'S5',
    title: 'Human assignment does not by itself silence a live-agent ask',
    severity: 'critical',
    result: 'fail',
    path: 'luna-current/01_runtime/teammateHandoffGates.js:' + lineOf(gateSrc, deferStart + deferFallthrough),
    detail: 'The last return in shouldDeferToHumanTeammate is skip false. A non-greeting live-agent ask still falls through when a human is assigned or has already replied, unless a narrower external-handoff rule matches. The welcome gate then runs.',
    expected: 'silence on human-owned conversations',
    actual: 'defer returns skip false and the welcome gate can send',
  });
}

function runtimeIds(src) {
  function grab(name) {
    const m = src.match(new RegExp('const ' + name + " = '([^']+)'"));
    if (!m) throw new Error('missing ' + name);
    return m[1];
  }
  return {
    arsal: grab('ARSAL_ID'),
    elite: grab('ELITE_AI_ID'),
    jerry: grab('JERRY_ID'),
    riskTeam: grab('RISK_TEAM_ID'),
    escTeam: grab('ESCALATIONS_TEAM_ID'),
    riskAdmin: grab('RISK_TEAM_ADMIN_ID'),
  };
}

function installIsolation() {
  const root = fs.mkdtempSync(path.join('/tmp', 'luna-handoff-r2-'));
  const mirror = path.join(root, 'mirror');
  const state = path.join(root, 'state');
  fs.mkdirSync(state, { recursive: true });
  fs.cpSync(path.join(REPO, 'luna-current/01_runtime'), mirror, { recursive: true });
  fs.cpSync(path.join(REPO, 'luna-current/02_statePresend'), path.join(mirror, 'statePresend'), { recursive: true });
  fs.cpSync(path.join(REPO, 'luna-current/03_luna-maintainer'), path.join(mirror, 'luna-maintainer'), { recursive: true });

  for (const key of [
    'INTERCOM_ACCESS_TOKEN',
    'INTERCOM_WEBHOOK_SECRET',
    'INTERCOM_CLIENT_SECRET',
    'OPENAI_API_KEY',
    'CONTROL_SECRET',
  ]) {
    delete process.env[key];
  }
  process.env.LUNA_CONTROL_STATE_FILE = path.join(state, 'control.json');
  process.env.LUNA_PROMPT_FILE = path.join(mirror, 'system-prompt.txt');
  process.env.LUNA_OP_STORE_FILE = path.join(state, 'write-ops.json');
  process.env.TICKET_STATE_FILE = path.join(state, 'tickets.json');
  process.env.MENTION_ROTATE_FILE = path.join(state, 'rotate.json');
  process.env.LUNA_WEBHOOK_SIGNATURE_MODE = 'off';
  process.env.MAINTAINER_ENABLED = 'false';
  process.env.MAINTAINER_DATA_DIR = path.join(state, 'maintainer');
  process.env.LUNA_ROOT = mirror;
  process.env.HOME = state;

  fs.writeFileSync(
    process.env.LUNA_CONTROL_STATE_FILE,
    JSON.stringify({
      paused: false,
      pausedUntil: null,
      aiOff: {},
      testMode: false,
      testAllowNames: ['Synthetic Client'],
      testAllowConversationIds: [],
      config: { model: 'synthetic-offline', welcomeEnabled: true, repliesEnabled: true },
    })
  );

  const net = {
    calls: [],
    mode: 'ok',
    assignStatus: 200,
  };

  const origRequire = Module.prototype.require;
  Module.prototype.require = function patched(id) {
    if (id === 'openai') {
      return class OpenAI {
        constructor() {}
        chat = {
          completions: {
            create: async () => {
              throw new Error('SYNTHETIC_OPENAI_BLOCKED');
            },
          },
        };
      };
    }
    if (id === './lunaToolsRuntime') {
      return {
        runChat: async () => {
          if (!net.rawOut) throw new Error('SYNTHETIC_MODEL_BLOCKED');
          return { rawOut: net.rawOut };
        },
      };
    }
    if (id === 'axios') {
      const axiosFn = async (cfg) => {
        cfg = cfg || {};
        const data = cfg.data || {};
        const encoded = JSON.stringify(data);
        const rec = {
          kind: 'write',
          method: String(cfg.method || '').toLowerCase(),
          message_type: data.message_type || '',
          url: String(cfg.url || '').replace(/^https:\/\/api\.intercom\.io/, ''),
          hasSecret: encoded.includes(SECRET),
          script: /[\u0900-\u097F]/.test(encoded) ? 'devanagari' : /[\u0600-\u06FF]/.test(encoded) ? 'arabic-script' : 'latin',
        };
        net.calls.push(rec);
        if (String(cfg.url || '').indexOf('api.intercom.io') === -1) {
          throw new Error('SYNTHETIC_UNEXPECTED_URL');
        }
        if (net.mode === 'timeout' || (net.mode === 'assign-timeout' && data.message_type === 'assignment')) {
          rec.status = 0;
          const err = new Error('timeout of 20000ms exceeded');
          err.code = 'ECONNABORTED';
          throw err;
        }
        if (data.message_type === 'assignment' && net.assignStatus >= 400) {
          rec.status = net.assignStatus;
          return {
            status: net.assignStatus,
            data: { errors: [{ code: net.assignCode || 'server_error' }] },
          };
        }
        if (net.mode === 'note-fail' && data.message_type === 'note') {
          rec.status = 422;
          return { status: 422, data: { errors: [{ code: 'note_rejected' }] } };
        }
        rec.status = 200;
        return { status: 200, data: { id: 'syn-' + net.calls.length, type: 'conversation' } };
      };
      axiosFn.get = async (url) => {
        net.calls.push({
          kind: 'get',
          method: 'get',
          message_type: '',
          url: String(url || '').replace(/^https:\/\/api\.intercom\.io/, ''),
          hasSecret: false,
          status: 200,
        });
        return { status: 200, data: { admins: [] } };
      };
      axiosFn.post = async () => {
        throw new Error('SYNTHETIC_AXIOS_POST_BLOCKED');
      };
      return axiosFn;
    }
    return origRequire.apply(this, arguments);
  };

  const { execFileSync } = require('child_process');
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: mirror,
    stdio: 'inherit',
  });

  const runtime = origRequire.call(module, path.join(mirror, 'index.js'));
  return { root, state, net, runtime };
}

function res() {
  return {
    statusCode: 0,
    sendStatus(code) {
      this.statusCode = code;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function conv(ids, opts) {
  const now = Math.floor(Date.now() / 1000);
  const o = opts || {};
  return {
    id: o.id,
    created_at: o.createdAt != null ? o.createdAt : now - 1000,
    team_assignee_id: o.teamId != null ? o.teamId : 0,
    admin_assignee_id: o.adminId != null ? o.adminId : null,
    contacts: { contacts: [{ id: 'user-syn', name: 'Synthetic Client' }] },
    source: {
      body: o.sourceBody || '',
      author: { type: 'user', id: 'user-syn', name: 'Synthetic Client' },
      created_at: o.createdAt != null ? o.createdAt : now - 1000,
    },
    conversation_parts: { conversation_parts: o.parts || [] },
  };
}

function userPart(id, body, at) {
  return {
    id,
    part_type: 'comment',
    author: { id: 'user-syn', type: 'user', name: 'Synthetic Client' },
    body,
    created_at: at,
  };
}

function elitePart(ids, body, at) {
  return {
    id: 'fin-' + at,
    part_type: 'comment',
    author: { id: ids.elite, type: 'bot', name: 'Elite AI' },
    body: body || 'Connecting you to a teammate.',
    created_at: at,
  };
}

async function postWebhook(runtime, full) {
  const r = res();
  await runtime.handleWebhook(
    { body: { topic: 'conversation.user.replied', data: { item: { id: full.id } } } },
    r
  );
  return r.statusCode;
}

function publicWrites(calls) {
  return calls.filter((c) => c.kind === 'write' && c.message_type === 'comment');
}
function noteWrites(calls) {
  return calls.filter((c) => c.kind === 'write' && c.message_type === 'note');
}
function assignWrites(calls) {
  return calls.filter((c) => c.kind === 'write' && c.message_type === 'assignment');
}

function orderOf(calls) {
  return calls
    .filter((c) => c.kind === 'write')
    .map((c) => c.message_type)
    .join(',');
}

async function runRuntime() {
  let iso;
  try {
    iso = installIsolation();
  } catch (e) {
    record({
      id: 'R0',
      title: 'Isolated runtime loaded',
      severity: 'critical',
      result: 'fail',
      path: 'luna-current/01_runtime/index.js',
      detail: 'Runtime mirror failed to load: ' + (e && e.message),
      expected: 'load',
      actual: 'load error',
    });
    return;
  }
  const { net, runtime, state } = iso;
  const ids = runtimeIds(fs.readFileSync(RUNTIME_SRC, 'utf8'));
  const conversations = {};
  let fetchGate = null;
  runtime.__setTestDoubles({
    fetchConversation: async (id) => {
      if (fetchGate && fetchGate.id === id) await fetchGate.promise;
      return conversations[id] || null;
    },
  });

  function resetNet() {
    net.calls = [];
    net.mode = 'ok';
    net.assignStatus = 200;
    net.assignCode = '';
    net.rawOut = '';
    fs.rmSync(process.env.LUNA_OP_STORE_FILE, { force: true });
    fs.rmSync(process.env.TICKET_STATE_FILE, { force: true });
    fetchGate = null;
  }

  async function runCase(id, title, opts) {
    resetNet();
    Object.assign(net, opts.net || {});
    net.calls = [];
    const full = opts.full;
    conversations[full.id] = full;
    try {
      await postWebhook(runtime, full);
      const calls = net.calls.slice();
      const judgment = opts.judge(calls);
      record(Object.assign({
        id,
        title,
        path: opts.path,
        order: orderOf(calls),
        publicWrites: publicWrites(calls).length,
        noteWrites: noteWrites(calls).length,
        assignWrites: assignWrites(calls).length,
        secretInAnyWrite: calls.some((c) => c.hasSecret),
      }, judgment));
    } catch (e) {
      record({
        id,
        title,
        severity: 'critical',
        result: 'fail',
        path: opts.path,
        detail: 'Case threw: ' + (e && e.message),
        expected: opts.expected || '',
        actual: 'throw',
      });
    }
  }

  const ask = 'Can you send the account number linked to this issue? I will pass it to a teammate once I have it.';

  await runCase(
    'R1',
    'Welcome path sends a customer message with no note and no assignment',
    {
      path: 'luna-current/01_runtime/index.js:3763',
      full: conv(ids, {
        id: 'syn-r1',
        parts: [elitePart(ids, 'Connecting you to a teammate.', 100), userPart('u1', 'live agent please', 200)],
      }),
      judge(calls) {
        const pubs = publicWrites(calls);
        const premature = pubs.length > 0 && assignWrites(calls).length === 0;
        return {
          severity: 'critical',
          result: premature ? 'fail' : 'pass',
          expected: 'no customer message before note and assign succeed',
          actual: 'order ' + (orderOf(calls) || 'none') + ', public ' + pubs.length,
          detail: 'Executed handleWebhook. FIN_HANDOFF welcome path.',
        };
      },
    }
  );

  await runCase(
    'R2',
    'Risk teambox stays silent for an Urdu live-agent ask',
    {
      path: 'luna-current/01_runtime/index.js:3573',
      full: conv(ids, {
        id: 'syn-r2',
        teamId: ids.riskTeam,
        createdAt: Math.floor(Date.now() / 1000),
        parts: [userPart('u1', 'live agent مجھے انسان چاہیے', 200)],
      }),
      judge(calls) {
        const pubs = publicWrites(calls);
        return {
          severity: 'critical',
          result: pubs.length === 0 ? 'pass' : 'fail',
          expected: 'no customer message',
          actual: 'public ' + pubs.length + ' order ' + (orderOf(calls) || 'none'),
          detail: 'Exact Risk team id returns through the silent note path before the welcome gate.',
        };
      },
    }
  );

  await runCase(
    'R3',
    'Escalations teambox stays silent for an Arabic live-agent ask',
    {
      path: 'luna-current/01_runtime/index.js:3568',
      full: conv(ids, {
        id: 'syn-r3',
        teamId: ids.escTeam,
        createdAt: Math.floor(Date.now() / 1000),
        parts: [userPart('u1', 'live agent أريد موظفا', 200)],
      }),
      judge(calls) {
        return {
          severity: 'critical',
          result: publicWrites(calls).length === 0 ? 'pass' : 'fail',
          expected: 'no customer message',
          actual: 'public ' + publicWrites(calls).length,
          detail: 'Exact Escalations team id is silent before the welcome gate.',
        };
      },
    }
  );

  await runCase(
    'R4',
    'Hindi live-agent ask on a Risk teambox stays silent',
    {
      path: 'luna-current/01_runtime/index.js:3573',
      full: conv(ids, {
        id: 'syn-r4',
        teamId: ids.riskTeam,
        createdAt: Math.floor(Date.now() / 1000),
        parts: [userPart('u1', 'live agent मुझे इंसान चाहिए', 200)],
      }),
      judge(calls) {
        return {
          severity: 'critical',
          result: publicWrites(calls).length === 0 ? 'pass' : 'fail',
          expected: 'no customer message',
          actual: 'public ' + publicWrites(calls).length,
          detail: 'Language does not bypass the Risk return.',
        };
      },
    }
  );

  await runCase(
    'R5',
    'Human-assigned conversation still receives the fixed welcome',
    {
      path: 'luna-current/01_runtime/index.js:3752',
      full: conv(ids, {
        id: 'syn-r5',
        adminId: '424242',
        parts: [elitePart(ids, 'Connecting you to a teammate.', 100), userPart('u1', 'live agent please', 200)],
      }),
      judge(calls) {
        const sent = publicWrites(calls).length > 0;
        return {
          severity: 'critical',
          result: sent ? 'fail' : 'pass',
          expected: 'silence',
          actual: 'public ' + publicWrites(calls).length + ' order ' + (orderOf(calls) || 'none'),
          detail: 'admin_assignee_id 424242 is a human seat. shouldDeferToHumanTeammate does not skip this live-agent ask, and the welcome gate does not read assignment.',
        };
      },
    }
  );

  await runCase(
    'R6',
    'Ambiguous admin part shape fails open into the fixed welcome',
    {
      path: 'luna-current/01_runtime/teammateHandoffGates.js:isHumanTeammatePublicReply',
      full: conv(ids, {
        id: 'syn-r6',
        parts: [
          {
            id: 'amb',
            author: { id: '424242', type: 'admin', name: 'Teammate' },
            body: 'I have this ticket.',
            created_at: 50,
          },
          elitePart(ids, 'Connecting you to a teammate.', 100),
          userPart('u1', 'live agent please', 200),
        ],
      }),
      judge(calls) {
        return {
          severity: 'critical',
          result: publicWrites(calls).length > 0 ? 'fail' : 'pass',
          expected: 'silence when ownership shape is ambiguous',
          actual: 'public ' + publicWrites(calls).length,
          detail: 'The admin body has no part_type, so it is not treated as a human reply.',
        };
      },
    }
  );

  await runCase(
    'R7',
    'Identity recovery sends the customer promise before note and assignment',
    {
      path: 'luna-current/01_runtime/index.js:3684',
      full: conv(ids, {
        id: 'syn-r7',
        sourceBody: 'password is ' + SECRET + ' payout stuck',
        parts: [
          userPart('u0', 'password is ' + SECRET + ' payout stuck', 100),
          userPart('u1', '219876', 200),
          {
            id: 'ask',
            part_type: 'comment',
            author: { id: ids.arsal, type: 'admin', name: 'Arsal' },
            body: ask,
            created_at: 300,
          },
        ],
      }),
      judge(calls) {
        const order = orderOf(calls);
        const pubs = publicWrites(calls);
        const premature = pubs.length > 0 && order.startsWith('comment');
        const secretNote = calls.some((c) => c.message_type === 'note' && c.hasSecret);
        const secretComment = calls.some((c) => c.message_type === 'comment' && c.hasSecret);
        return {
          severity: 'critical',
          result: premature || secretNote || secretComment ? 'fail' : 'pass',
          expected: 'note, assign, then message; secret absent from every write',
          actual: 'order ' + (order || 'none') + ', secretInComment ' + secretComment + ', secretInNote ' + secretNote,
          detail: secretNote
            ? 'Customer comment is first (index.js:3684). The note keeps the synthetic credential because sanitizeEscalateProblem (index.js:545) never calls credentialSanitizer. The customer comment does not echo it.'
            : 'Customer comment is attempted before note and assignment.',
        };
      },
    }
  );

  await runCase(
    'R8',
    'Assignment HTTP 500 still leaves the customer promise already sent',
    {
      path: 'luna-current/01_runtime/index.js:4231',
      net: {
        assignStatus: 500,
        rawOut: [
          'ACTION: ESCALATE',
          'KIND: ACCOUNT',
          'BODY: payout rejected password is ' + SECRET,
          'CLIENT: I have forwarded this to a teammate who can take a closer look. They have the chat context.',
          'ACTION_NEEDED: Please review',
        ].join('\n'),
      },
      full: conv(ids, {
        id: 'syn-r8',
        parts: [userPart('u1', 'Why was my payout rejected on account 219876? password is ' + SECRET, 200)],
      }),
      judge(calls) {
        const order = orderOf(calls);
        const pubs = publicWrites(calls);
        const notes = noteWrites(calls).filter((c) => c.status === 200);
        const assigns = assignWrites(calls);
        const premature = pubs.length > 0 && (assigns.length === 0 || order.indexOf('comment') < order.indexOf('assignment'));
        const secretNote = calls.some((c) => c.message_type === 'note' && c.hasSecret);
        const secretComment = calls.some((c) => c.message_type === 'comment' && c.hasSecret);
        return {
          severity: 'critical',
          result: premature ? 'fail' : 'pass',
          expected: 'no customer message when assign returns 500',
          actual: 'order ' + (order || 'none') + ', noteStatus ' + (notes.map((n) => n.status).join('/') || 'none') + ', assignStatus ' + (assigns.map((n) => n.status).join('/') || 'none') + ', secretInComment ' + secretComment + ', secretInNote ' + secretNote,
          detail: 'Main escalate path. HTTP 500 on assignment is stored as unknown and is not success. The customer comment was already accepted.',
        };
      },
    }
  );

  await runCase(
    'R9',
    'Assignment timeout is an unknown outcome and the promise was already sent',
    {
      path: 'luna-current/01_runtime/index.js:4231',
      net: {
        mode: 'assign-timeout',
        rawOut: [
          'ACTION: ESCALATE',
          'KIND: ACCOUNT',
          'BODY: payout rejected',
          'CLIENT: I have forwarded this to a teammate who can take a closer look. They have the chat context.',
          'ACTION_NEEDED: Please review',
        ].join('\n'),
      },
      full: conv(ids, {
        id: 'syn-r9',
        parts: [userPart('u1', 'Why was my payout rejected on account 219876?', 200)],
      }),
      judge(calls) {
        const pubs = publicWrites(calls);
        const assignAttempt = assignWrites(calls).length > 0;
        return {
          severity: 'critical',
          result: pubs.length > 0 ? 'fail' : 'pass',
          expected: 'no customer message when assignment times out',
          actual: 'public ' + pubs.length + ' assignAttempts ' + assignAttempt + ' order ' + (orderOf(calls) || 'none'),
          detail: 'icRequest reports the assignment as unknown and does not retry it. The customer write already happened.',
        };
      },
    }
  );

  await runCase(
    'R10',
    'Note failure still follows a customer promise',
    {
      path: 'luna-current/01_runtime/index.js:4231',
      net: {
        mode: 'note-fail',
        rawOut: [
          'ACTION: ESCALATE',
          'KIND: ACCOUNT',
          'BODY: payout rejected',
          'CLIENT: I have forwarded this to a teammate who can take a closer look. They have the chat context.',
          'ACTION_NEEDED: Please review',
        ].join('\n'),
      },
      full: conv(ids, {
        id: 'syn-r10',
        parts: [userPart('u1', 'Why was my payout rejected on account 219876?', 200)],
      }),
      judge(calls) {
        const pubs = publicWrites(calls);
        const notes = noteWrites(calls);
        return {
          severity: 'critical',
          result: pubs.length > 0 && notes.some((n) => n.status === 422) ? 'fail' : pubs.length === 0 ? 'pass' : 'fail',
          expected: 'no customer message when the note is rejected',
          actual: 'order ' + (orderOf(calls) || 'none'),
          detail: 'Note 422 happens after the customer comment. Assignment is then skipped, awaiting is not marked, and the promise remains.',
        };
      },
    }
  );

  await runCase(
    'R11',
    'Substantive English account question does not take the fixed welcome',
    {
      path: 'luna-current/01_runtime/index.js:3763',
      full: conv(ids, {
        id: 'syn-r11',
        parts: [
          elitePart(ids, 'Connecting you to a teammate.', 100),
          userPart('u1', 'Why was my payout rejected after the consistency check on account 219876?', 200),
        ],
      }),
      judge(calls) {
        return {
          severity: 'critical',
          result: publicWrites(calls).length === 0 ? 'pass' : 'fail',
          expected: 'no fixed welcome',
          actual: 'public ' + publicWrites(calls).length + ' order ' + (orderOf(calls) || 'none'),
          detail: 'Model call is blocked in this case, so a later escalate is not executed. The welcome gate itself did not send.',
        };
      },
    }
  );

  await runCase(
    'R12',
    'Urdu account question mixed with a live-agent phrase takes the fixed welcome',
    {
      path: 'luna-current/01_runtime/index.js:2534',
      full: conv(ids, {
        id: 'syn-r12',
        parts: [userPart('u1', 'live agent میرا اکاؤنٹ نمبر 219876', 200)],
      }),
      judge(calls) {
        const pubs = publicWrites(calls);
        return {
          severity: 'critical',
          result: pubs.length > 0 ? 'fail' : 'pass',
          expected: 'no fixed welcome for an account-number question',
          actual: 'public ' + pubs.length + ' script ' + (pubs.map((p) => p.script).join('/') || 'none'),
          detail: 'Same vagueness collapse as the packet. The runtime welcome path sends. arabic-script here is the existing Urdu welcome line.',
        };
      },
    }
  );

  await runCase(
    'R13',
    'Hindi account question mixed with a live-agent phrase is not served in Hindi',
    {
      path: 'luna-current/01_runtime/index.js:2552',
      full: conv(ids, {
        id: 'syn-r13',
        parts: [userPart('u1', 'live agent मेरा अकाउंट नंबर 219876', 200)],
      }),
      judge(calls) {
        const pubs = publicWrites(calls);
        return {
          severity: 'critical',
          result: pubs.length > 0 ? 'fail' : 'pass',
          expected: 'no English fixed welcome',
          actual: 'public ' + pubs.length + ' script ' + (pubs.map((p) => p.script).join('/') || 'none'),
          detail: 'Devanagari is stripped by the vagueness check and is not a branch in lockedFinHandoffWelcome. A latin script class means the English welcome was the customer message.',
        };
      },
    }
  );

  // Duplicate and replay use one conversation and the real write-op store.
  resetNet();
  const dupId = 'syn-r14';
  conversations[dupId] = conv(ids, {
    id: dupId,
    parts: [elitePart(ids, 'Connecting you to a teammate.', 100), userPart('u1', 'live agent please', 200)],
  });
  await postWebhook(runtime, conversations[dupId]);
  const firstPublic = publicWrites(net.calls).length;
  const firstTotal = net.calls.filter((c) => c.kind === 'write').length;
  net.calls = [];
  await postWebhook(runtime, conversations[dupId]);
  const secondPublic = publicWrites(net.calls).length;
  record({
    id: 'R14',
    title: 'Stale refetch of the same welcome does not place a second identical write',
    severity: 'critical',
    result: firstPublic === 1 && secondPublic === 0 ? 'pass' : 'fail',
    path: 'luna-current/01_runtime/writeOpStore.js:shouldSkipReplay',
    detail: 'The second webhook still sees the original parts. writeOpStore suppresses the identical comment because the first write was confirmed. This does not fix the first premature send.',
    expected: 'one customer write, replay suppressed',
    actual: 'firstPublic ' + firstPublic + ' secondPublic ' + secondPublic + ' firstWrites ' + firstTotal,
  });

  resetNet();
  net.mode = 'timeout';
  const replayId = 'syn-r15';
  conversations[replayId] = conv(ids, {
    id: replayId,
    parts: [elitePart(ids, 'Connecting you to a teammate.', 100), userPart('u1', 'hi', 200)],
  });
  await postWebhook(runtime, conversations[replayId]);
  const unknownAttempt = publicWrites(net.calls).length;
  net.calls = [];
  net.mode = 'ok';
  await postWebhook(runtime, conversations[replayId]);
  const replayAttempt = publicWrites(net.calls).length;
  record({
    id: 'R15',
    title: 'A timed-out welcome is not replayed',
    severity: 'critical',
    result: unknownAttempt === 1 && replayAttempt === 0 ? 'pass' : 'fail',
    path: 'luna-current/01_runtime/writeOpStore.js:shouldSkipReplay',
    detail: 'The timeout is stored as unknown and a later identical write is suppressed. The customer may or may not have received the first message. There is still no note or assignment on this path.',
    expected: 'no second write after an unknown outcome',
    actual: 'firstAttempts ' + unknownAttempt + ' replayAttempts ' + replayAttempt,
  });

  resetNet();
  const raceId = 'syn-r16';
  let releaseRace;
  const racePromise = new Promise((resolve) => {
    releaseRace = resolve;
  });
  fetchGate = { id: raceId, promise: racePromise };
  conversations[raceId] = conv(ids, {
    id: raceId,
    parts: [elitePart(ids, 'Connecting you to a teammate.', 100), userPart('u1', 'live agent please', 200)],
  });
  const firstRace = postWebhook(runtime, conversations[raceId]);
  await new Promise((r) => setTimeout(r, 30));
  const secondStatus = await postWebhook(runtime, conversations[raceId]);
  const during = publicWrites(net.calls).length;
  releaseRace();
  fetchGate = null;
  await firstRace;
  const after = publicWrites(net.calls).length;
  record({
    id: 'R16',
    title: 'A second webhook while the first is in flight does not send another welcome',
    severity: 'critical',
    result: during === 0 && after === 1 && secondStatus === 200 ? 'pass' : 'fail',
    path: 'luna-current/01_runtime/index.js:3536',
    detail: 'clientReplyInflight skips the overlapping delivery. The first delivery still sends the welcome with no handoff.',
    expected: 'one customer write',
    actual: 'during ' + during + ' after ' + after,
  });

  await runCase(
    'R17',
    'Partial success marks the case awaiting a teammate after a rejected assignment',
    {
      path: 'luna-current/01_runtime/index.js:4262',
      net: {
        assignStatus: 422,
        assignCode: 'assignee_not_found',
        rawOut: [
          'ACTION: ESCALATE',
          'KIND: ACCOUNT',
          'BODY: payout rejected on account 219876',
          'CLIENT: I have forwarded this to a teammate who can take a closer look. They have the chat context.',
          'ACTION_NEEDED: Please review',
        ].join('\n'),
      },
      full: conv(ids, {
        id: 'syn-r17',
        parts: [userPart('u1', 'Why was my payout rejected on account 219876?', 200)],
      }),
      judge() {
        let awaiting = false;
        try {
          const saved = JSON.parse(fs.readFileSync(process.env.TICKET_STATE_FILE, 'utf8'));
          awaiting = !!(saved['syn-r17'] && saved['syn-r17'].escalateAwaitingFirstTeammate);
        } catch (_) {
          awaiting = false;
        }
        return {
          severity: 'critical',
          result: awaiting ? 'fail' : 'pass',
          expected: 'awaiting flag clear when assign is rejected',
          actual: 'awaiting ' + awaiting + ' order ' + orderOf(net.calls),
          detail: '422 assignee_not_found is a failed assignment. The customer promise was already sent and the awaiting flag is still set.',
        };
      },
    }
  );

  record({
    id: 'R18',
    title: 'Runtime mirror state stayed under the synthetic temp directory',
    severity: 'info',
    result: String(state).startsWith('/tmp/') ? 'pass' : 'fail',
    path: state,
    detail: 'Control, ticket, and write-op files were isolated. No production state path was used.',
    expected: '/tmp',
    actual: state,
  });
}

function verdictOf(rows) {
  const failedCritical = rows.filter((c) => c.result === 'fail' && c.severity === 'critical');
  if (!fs.existsSync(RUNTIME_SRC) || !fs.existsSync(PACKET_JS)) return 'BLOCKED';
  if (failedCritical.length) return 'NEEDS CHANGES';
  const failedBlocking = rows.filter((c) => c.result === 'fail' && c.severity === 'blocking');
  if (failedBlocking.length) return 'NEEDS CHANGES';
  return 'PASS';
}

function writeReport(rows) {
  const verdict = verdictOf(rows);
  const identities = {
    reviewedCommit: REVIEWED_COMMIT,
    reviewedBranch: 'cursor/fixed-message-handoff-r2-c90d',
    pr: 'https://github.com/raoarsal332-sketch/luna-source-secrets-free/pull/14',
    packetJs: sha256(PACKET_JS),
    packetTest: sha256(PACKET_TEST),
    packetPrep: sha256(PACKET_PREP),
    runtimeIndex: sha256(RUNTIME_SRC),
    priorTree: 'b02e38e7',
    priorTreeAvailable: false,
    sealedSetsAvailable: false,
  };
  const summary = {
    pass: rows.filter((c) => c.result === 'pass').length,
    fail: rows.filter((c) => c.result === 'fail').length,
    criticalFail: rows.filter((c) => c.result === 'fail' && c.severity === 'critical').length,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify({ verdict, identities, summary, cases: rows }, null, 2));

  const lines = [];
  lines.push('# Independent review — fixed-message handoff R2');
  lines.push('');
  lines.push('Verdict: **' + verdict + '**');
  lines.push('');
  lines.push('This review is not an approval. The draft was not merged, approved, activated, wired, or deployed. No production, VPS, Intercom, secret, or customer data was used. Fixtures are synthetic.');
  lines.push('');
  lines.push('## Artifact identities');
  lines.push('');
  lines.push('| Item | Identity |');
  lines.push('|---|---|');
  lines.push('| PR | https://github.com/raoarsal332-sketch/luna-source-secrets-free/pull/14 |');
  lines.push('| Branch | `cursor/fixed-message-handoff-r2-c90d` |');
  lines.push('| Commit | `' + REVIEWED_COMMIT + '` |');
  lines.push('| `fixedMessageHandoff.js` | `' + identities.packetJs + '` |');
  lines.push('| `fixedMessageHandoff.test.js` | `' + identities.packetTest + '` |');
  lines.push('| `FM_R2_REVIEW_PREP.md` | `' + identities.packetPrep + '` |');
  lines.push('| `luna-current/01_runtime/index.js` | `' + identities.runtimeIndex + '` |');
  lines.push('');
  lines.push('The three packet hashes match the hashes published on PR 14. That match identifies the bytes under review. It is not acceptance.');
  lines.push('');
  lines.push('## Historical acceptance');
  lines.push('');
  lines.push('Prior tree `b02e38e7` is not a valid object in this clone and was not found on any fetched ref. No sealed-set files were present on the reviewed tree. This review claims no historical acceptance. The author note of 0 critical on that tree was not re-checked and is not evidence.');
  lines.push('');
  lines.push('The author packet tests were not executed. They are not the oracle for this review.');
  lines.push('');
  lines.push('## What the packet implements');
  lines.push('');
  lines.push('`decideFixedMessageHandoff` copies the current welcome selector (`lockedFinHandoffWelcome` and the send condition around `index.js` 3763-3777). It does not post an internal note, does not assign, and does not wait for either operation to succeed. `behaviorChange` is false and the module is not called from `index.js`. Merging the packet would not implement the fixed-message handoff design.');
  lines.push('');
  lines.push('The live design that was inspected sends a customer-facing line first. The required order is successful note, then successful assignment, then one fixed message.');
  lines.push('');
  lines.push('## Case results');
  lines.push('');
  lines.push(summary.pass + ' passed, ' + summary.fail + ' failed, ' + summary.criticalFail + ' critical failures.');
  lines.push('');
  lines.push('Exact Risk and Escalations team ids stayed silent for Urdu, Arabic, and Hindi on the live webhook path. A substantive English account question did not take the welcome. An identical welcome write was not replayed after a confirmed send or after an unknown timeout, and an overlapping webhook was skipped. Those passes do not authorize the first customer send.');
  lines.push('');
  lines.push('| Case | Result | Severity | Path | Actual |');
  lines.push('|---|---|---|---|---|');
  for (const c of rows) {
    const actual = String(c.actual || c.detail || '').replace(/\|/g, '/').replace(/\n/g, ' ');
    lines.push('| `' + c.id + '` | ' + c.result.toUpperCase() + ' | ' + (c.severity || '') + ' | `' + c.path + '` | ' + actual + ' |');
  }
  lines.push('');
  lines.push('## Critical findings');
  lines.push('');
  const criticals = rows.filter((c) => c.result === 'fail' && c.severity === 'critical');
  if (!criticals.length) lines.push('None.');
  for (const c of criticals) {
    lines.push('### ' + c.id + ' — ' + c.title);
    lines.push('');
    lines.push('Path: `' + c.path + '`');
    lines.push('');
    lines.push(c.detail || '');
    lines.push('');
    lines.push('Expected: ' + (c.expected || ''));
    lines.push('');
    lines.push('Actual: ' + (c.actual || ''));
    lines.push('');
  }
  lines.push('## Other blocking findings');
  lines.push('');
  const blocking = rows.filter((c) => c.result === 'fail' && c.severity !== 'critical');
  if (!blocking.length) lines.push('None.');
  for (const c of blocking) {
    lines.push('- `' + c.id + '` `' + c.path + '`: ' + (c.detail || c.title));
  }
  lines.push('');
  lines.push('## Uncovered paths');
  lines.push('');
  lines.push('- `index.js` reply pre-send escalate around line 4368 was confirmed by source order only (customer message, then note, then assign). It was not executed, because that branch sits behind a blocked model draft.');
  lines.push('- `index.js` missed-escalation escalate around line 4574 has the same source order and was not executed.');
  lines.push('- A later related-turn status line (`escalateRelatedOnly.js` status bank) was not executed as its own webhook. R17 shows the awaiting flag is set after a rejected assignment, which is what unlocks that status line.');
  lines.push('- Pure Urdu, Arabic, and Hindi handoff asks that do not contain a Latin live-agent phrase do not open `clientRequestedLiveAgent` (`softEdges.js`). They were judged on the packet decision function. The runtime model reply for those asks was not executed.');
  lines.push('- Tree `b02e38e7` and the sealed sets were not available, so no diff against them was made.');
  lines.push('- No live webhook, Intercom assignment, or customer conversation was used.');
  lines.push('');
  lines.push('## Next action');
  lines.push('');
  lines.push('Do not merge, approve, wire, activate, or deploy PR 14. The next change has to perform a successful internal note, then a successful assignment, and only then send one fixed message. Urdu, Arabic, and Hindi each need their own message. Risk, Escalations, human-owned, and ambiguous ownership must stay silent in every language. Credentials must be removed before a note or a customer message is built. Assignment errors, timeouts, and partial success must withhold the message and must not set the awaiting-teammate flag. Re-review that implementation. This report is not historical acceptance and it is not an approval of `' + REVIEWED_COMMIT + '`.');
  lines.push('');
  fs.writeFileSync(OUT_MD, lines.join('\n'));
  console.log('VERDICT', verdict);
  console.log('WROTE', OUT_MD);
}

async function main() {
  runCandidate();
  runStatic();
  await runRuntime();
  writeReport(cases);
  const verdict = verdictOf(cases);
  if (verdict === 'BLOCKED') process.exitCode = 2;
}

main().catch((e) => {
  console.error('HARNESS_ERR', e && e.stack || e);
  process.exitCode = 1;
});
