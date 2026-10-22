'use strict';

require('./tripwire');

const fs = require('fs');
const path = require('path');
const Module = require('module');

const ARSAL = '10118526';
const ELITE = '8052954';
const JERRY = '8053416';
const HUMAN = '9002002';
const SEAT = '9001001';
const RISK_TEAM = '10675195';
const ESC_TEAM = '9629759';
const RISK_ADMIN = '9378750';
const SUPPORT_TEAM = 9629780;

const FIXED = {
  en: 'A teammate now has this conversation.',
  ur: 'یہ گفتگو اب ایک ساتھی کے پاس ہے۔',
  ar: 'هذه المحادثة الآن لدى أحد الزملاء.',
  hi: 'यह बातचीत अब एक साथी के पास है।',
  it: 'Un collega ha ora questa conversazione.',
};
const ACCOUNT_AR =
  'في MT5، رقم الحساب موجود في البريد الذي أُرسل مع بيانات الدخول. هذه التفاصيل لا تُغيَّر.';
const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const PING =
  "I don't have an open update on this conversation. What would you like me to check?";

function seatId(name) {
  if (name === 'human') return HUMAN;
  if (name === 'jerry') return JERRY;
  if (name === 'elite') return ELITE;
  if (name === 'risk-admin') return RISK_ADMIN;
  if (name === 'empty' || name === 'none') return '0';
  if (name === 'seat') return SEAT;
  return ARSAL;
}

function teamId(name) {
  if (name === 'risk') return RISK_TEAM;
  if (name === 'escalations') return ESC_TEAM;
  return '0';
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function installModel(scripted) {
  const queue = Array.isArray(scripted) ? scripted.slice() : [scripted];
  global.__lunaModel = {
    create: async (req) => {
      const system = ((req.messages || []).find((m) => m.role === 'system') || {}).content || '';
      const user = ((req.messages || []).find((m) => m.role === 'user') || {}).content || '';
      let content = queue.length ? queue.shift() : null;
      if (content == null) {
        if (/INTERNAL Intercom note/i.test(system)) content = 'Client asked for help with this conversation.';
        else if (/OWNER \/ JERRY DIRECT COMMAND/i.test(system)) content = 'ACTION: NOTE\nBODY: Noted.';
        else content = 'ACTION: REPLY\nBODY: Please tell me which challenge you mean.';
      }
      if (content && typeof content === 'object' && content.throw) {
        throw new Error(String(content.throw));
      }
      if (/INTERNAL Intercom note/i.test(system) && typeof content === 'string' && /ACTION:/.test(content)) {
        content = 'Client asked for help with this conversation.';
      }
      void user;
      return { choices: [{ message: { content: String(content == null ? '' : content) } }] };
    },
  };
}

function adminsPayload() {
  return {
    admins: [
      {
        id: SEAT,
        name: 'Seat A',
        email: 'seat-a@example.com',
        has_inbox_seat: true,
        away_mode_enabled: false,
        team_ids: [SUPPORT_TEAM],
      },
      {
        id: HUMAN,
        name: 'Human Seven',
        email: 'human-seven@example.com',
        has_inbox_seat: true,
        away_mode_enabled: true,
        team_ids: [SUPPORT_TEAM],
      },
    ],
  };
}

function responseFor(mode, world, body) {
  const id = world.conversation.id;
  if (mode === 'timeout') {
    const err = new Error('timeout of 20000ms exceeded');
    err.code = 'ECONNABORTED';
    throw err;
  }
  if (mode === '429') return { status: 429, data: { type: 'error.list', errors: [{ code: 'rate_limit', message: 'slow' }] } };
  if (mode === '500') return { status: 500, data: { type: 'error.list', errors: [{ code: 'server', message: 'down' }] } };
  if (mode === '422') {
    return {
      status: 422,
      data: { type: 'error.list', id: 'e-422', errors: [{ code: 'invalid', status: 422, message: 'unprocessable' }] },
    };
  }
  if (mode === 'error_list') {
    return {
      status: 200,
      data: { type: 'error.list', id: 'e-200', errors: [{ code: 'bad', message: 'not applied' }] },
    };
  }
  if (mode === 'data_null') return { status: 200, data: null };
  if (mode === 'unnamed' || mode === 'unnamed_partial') {
    const data = { id: id, type: 'conversation' };
    if (mode === 'unnamed_partial') data.partial = true;
    return { status: 200, data };
  }
  if (mode === 'wrong_seat') {
    return { status: 200, data: { id: id, type: 'conversation', admin_assignee_id: HUMAN } };
  }
  if (mode === 'ok_still_bot') {
    return { status: 200, data: { id: id, type: 'conversation', admin_assignee_id: String((body && body.assignee_id) || SEAT) } };
  }
  return null;
}

function applySuccess(world, body) {
  const conv = world.conversation;
  const now = Math.floor(Date.now() / 1000);
  const parts = conv.conversation_parts.conversation_parts;
  const kind = body && body.message_type;
  if (kind === 'note') {
    parts.push({
      id: 'note-' + (parts.length + 1),
      part_type: 'note',
      body: body.body,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      created_at: now,
    });
  } else if (kind === 'assignment') {
    const seat = String(body.assignee_id);
    conv.admin_assignee_id = seat;
    parts.push({
      id: 'asg-' + (parts.length + 1),
      part_type: 'assignment',
      body: '',
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      assigned_to: { type: 'admin', id: seat },
      assignee_id: seat,
      created_at: now,
    });
  } else if (kind === 'comment') {
    parts.push({
      id: 'cmt-' + (parts.length + 1),
      part_type: 'comment',
      body: body.body,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      created_at: now,
    });
  } else if (kind === 'open') {
    conv.open = true;
    conv.state = 'open';
  } else if (kind === 'close') {
    conv.open = false;
    conv.state = 'closed';
  }
}

function makeAdapter(world, recorded) {
  const axios = world.axios;
  axios.defaults.adapter = async (config) => {
    const method = String(config.method || 'get').toLowerCase();
    const url = String(config.url || '');
    if (!url.includes('://api.intercom.io/')) {
      const err = new Error('NETWORK_TRIPWIRE adapter ' + url);
      err.code = 'NETWORK_TRIPWIRE';
      throw err;
    }
    let data = config.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (_) { data = config.data; }
    }
    const exact = typeof config.data === 'string'
      ? config.data
      : JSON.stringify(config.data === undefined ? null : config.data);
    const messageType = data && data.message_type ? String(data.message_type) : '';
    const rule = takeRule(world, method, url, messageType);
    const rec = {
      method,
      url,
      messageType,
      exact,
      assigneeId: data && data.assignee_id != null ? String(data.assignee_id) : '',
      body: data && data.body != null ? String(data.body) : '',
      mode: rule.mode || 'default',
    };
    recorded.push(rec);
    if (rule.mode === 'timeout') {
      if (rule.landed && messageType === 'assignment') applySuccess(world, data);
      const err = new Error('timeout of 20000ms exceeded');
      err.code = 'ECONNABORTED';
      throw err;
    }
    const scripted = rule.mode ? responseFor(rule.mode, world, data) : null;
    if (scripted) {
      rec.status = scripted.status;
      if (rule.landed && (rule.mode === '500' || rule.mode === 'timeout') && messageType === 'assignment') {
        applySuccess(world, data);
      }
      return { status: scripted.status, data: scripted.data, headers: {}, config };
    }
    if (method === 'get' && /\/admins\/\d+/.test(url)) {
      rec.status = 200;
      return { status: 200, data: { id: SEAT, name: 'Seat A', email: 'seat-a@example.com' }, headers: {}, config };
    }
    if (method === 'get' && url.includes('/admins')) {
      rec.status = 200;
      return { status: 200, data: adminsPayload(), headers: {}, config };
    }
    if (method === 'get' && /\/conversations\/[^/]+$/.test(url)) {
      let conv = clone(world.conversation);
      if (world.live === 'still-bot' && world.assignmentPosted && !world.fetchAfterAssign) {
        world.fetchAfterAssign = true;
        conv.admin_assignee_id = ARSAL;
      } else if (world.live === 'flip-before-comment' && world.assignmentPosted && world.fetchAfterAssign && !world.fetchBeforeComment) {
        world.fetchBeforeComment = true;
        conv.admin_assignee_id = ARSAL;
      }
      if (world.assignmentPosted && world.live !== 'still-bot') world.fetchAfterAssign = true;
      rec.status = 200;
      return { status: 200, data: conv, headers: {}, config };
    }
    if (method === 'post' && url.includes('/reply')) {
      const okBody = data || {};
      if (okBody.message_type === 'assignment') {
        world.assignmentPosted = true;
        const seat = String(okBody.assignee_id);
        applySuccess(world, okBody);
        rec.status = 200;
        return {
          status: 200,
          data: { id: world.conversation.id, type: 'conversation', admin_assignee_id: seat },
          headers: {},
          config,
        };
      }
      applySuccess(world, okBody);
      rec.status = 200;
      const payload = { id: 'part-' + world.conversation.conversation_parts.conversation_parts.length, type: 'conversation' };
      if (okBody.message_type === 'note') payload.part_type = 'note';
      return { status: 200, data: payload, headers: {}, config };
    }
    if (method === 'post' && url.includes('/conversations/search')) {
      rec.status = 200;
      return { status: 200, data: { conversations: [] }, headers: {}, config };
    }
    rec.status = 404;
    rec.unexpected = true;
    return { status: 404, data: { type: 'error.list', errors: [{ code: 'unexpected', message: url }] }, headers: {}, config };
  };
}

function takeRule(world, method, url, messageType) {
  const queue = world.http || [];
  if (!queue.length) return {};
  const idx = queue.findIndex((rule) => {
    if (rule.op === 'fetch') return method === 'get' && /\/conversations\//.test(url);
    if (rule.op === 'admins') return method === 'get' && url.includes('/admins');
    return method === 'post' && rule.op === messageType;
  });
  if (idx < 0) return {};
  const rule = queue[idx];
  const times = Number(rule.times || 1);
  rule._used = Number(rule._used || 0) + 1;
  if (rule._used >= times) queue.splice(idx, 1);
  return rule;
}

function buildConversation(spec, text) {
  const now = Math.floor(Date.now() / 1000);
  const age = Number(spec.ageSec == null ? 10000 : spec.ageSec);
  const created = now - age;
  const assignee = seatId(spec.assignee || 'bot');
  const parts = [];
  if (spec.finPhrase) {
    parts.push({
      id: 'fin-phrase',
      part_type: 'comment',
      body: "I'm connecting you to a teammate.",
      author: { type: 'admin', id: ELITE, name: 'Elite AI' },
      created_at: now - 20,
    });
  } else if (spec.finElite) {
    parts.push({
      id: 'fin-own',
      part_type: 'comment',
      body: 'Hello, how can I help?',
      author: { type: 'admin', id: ELITE, name: 'Elite AI' },
      created_at: now - 15,
    });
  }
  if (spec.priorBot) {
    parts.push({
      id: 'prior-bot',
      part_type: 'comment',
      body: 'Hello, how can I help with your FundedElite account?',
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      created_at: now - 40,
    });
  }
  if (spec.humanReply) {
    parts.push({
      id: 'human-reply',
      part_type: 'comment',
      body: spec.humanReply === true ? 'I am looking at this for you.' : String(spec.humanReply),
      author: { type: 'admin', id: HUMAN, name: 'Human Seven' },
      created_at: now - 30,
    });
  }
  if (spec.adminBodyNoType) {
    parts.push({
      id: 'admin-nobody',
      body: 'Taking this from here.',
      author: { type: 'admin', id: HUMAN, name: 'Human Seven' },
      created_at: now - 25,
    });
  }
  if (spec.authorTypeTeammate) {
    parts.push({
      id: 'teammate-author',
      part_type: 'comment',
      body: 'I have replied as a teammate.',
      author: { type: 'teammate', id: HUMAN, name: 'Human Seven' },
      created_at: now - 25,
    });
  }
  if (spec.staleAssignment) {
    parts.push({
      id: 'stale-asg',
      part_type: 'assignment',
      body: '',
      author: { type: 'admin', id: ARSAL },
      assigned_to: { id: HUMAN },
      assignee_id: HUMAN,
      created_at: now - 10,
    });
  }
  if (spec.note) {
    parts.push({
      id: spec.note.id || 'owner-note',
      part_type: 'note',
      body: spec.note.body,
      author: spec.note.author,
      created_at: now - 2,
    });
  }
  const userPart = spec.skipUser
    ? null
    : {
        id: spec.userPartId || 'user-1',
        part_type: spec.reopen ? 'open' : 'comment',
        body: text,
        author: { type: 'user', id: 'user-1', name: spec.customerName || 'Reviewer', email: 'reviewer@example.com' },
        created_at: now - 5,
      };
  if (userPart) parts.push(userPart);
  const open = spec.open !== false;
  return {
    id: spec.id,
    created_at: created,
    updated_at: now,
    open,
    state: spec.closedState ? 'closed' : open ? 'open' : 'closed',
    admin_assignee_id: assignee,
    assignee: spec.ambiguousAssignee
      ? { type: 'admin', id: HUMAN }
      : { type: 'admin', id: assignee },
    team_assignee_id: teamId(spec.team),
    team_assignee: spec.teamName ? { name: spec.teamName } : undefined,
    source: {
      type: 'conversation',
      body: text,
      author: { type: 'user', id: 'user-1', name: spec.customerName || 'Reviewer', email: 'reviewer@example.com' },
      delivered_as: 'customer_initiated',
    },
    contacts: {
      contacts: [{ id: 'user-1', name: spec.customerName || 'Reviewer', email: 'reviewer@example.com' }],
    },
    conversation_parts: { conversation_parts: parts },
  };
}

function writeControl(file, spec) {
  const aiOff = {};
  if (spec.aiOff) aiOff[spec.id] = true;
  const state = {
    paused: !!spec.paused,
    pausedUntil: spec.pausedUntil || null,
    aiOff,
    testMode: false,
    testAllowNames: ['Bot test'],
    testAllowConversationIds: [],
    config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: spec.repliesEnabled !== false },
  };
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

function loadIndex(runtime) {
  const stubPath = path.resolve(__dirname, 'openai-stub.js');
  const original = Module.prototype.require;
  Module.prototype.require = function patched(id) {
    if (id === 'openai') return original.call(this, stubPath);
    return original.apply(this, arguments);
  };
  const index = original.call(module, path.join(runtime, 'index.js'));
  Module.prototype.require = original;
  return index;
}

function classifySignature(recorded) {
  const comments = recorded.filter((r) => r.messageType === 'comment' && r.status >= 200 && r.status < 300);
  const publics = comments.map((r) => r.body);
  const assigns = recorded.filter((r) => r.messageType === 'assignment' && r.status >= 200 && r.status < 300).length;
  const joined = publics.join('\n');
  let cls = 'silent';
  let fixedExact = null;
  if (publics.length) {
    const only = publics.length === 1 ? publics[0] : null;
    const fixedLang = Object.keys(FIXED).find((lang) => publics.some((b) => b === FIXED[lang] || strip(b) === FIXED[lang]));
    if (fixedLang && publics.filter((b) => strip(b) === FIXED[fixedLang] || b === FIXED[fixedLang]).length) {
      cls = 'fixed';
      fixedExact = FIXED[fixedLang];
    } else if (joined.includes(ACCOUNT_AR) || /account number is in the email/i.test(joined) || /اکاؤنٹ نمبر اس ای میل/.test(joined)) {
      cls = 'account';
    } else if (publics.some((b) => strip(b) === HEDGE)) cls = 'hedge';
    else if (publics.some((b) => strip(b) === PING || b === PING)) cls = 'ping';
    else if (/which challenge/i.test(joined) || /please tell me which challenge you mean/i.test(joined)) cls = 'clarify';
    else cls = 'other';
  }
  const secretLeak = recorded.some((r) => /S3cretHorse!|QBG5FetfozKz7/.test(r.exact || '') && !(r.messageType === 'comment' && r.body && r.body.includes('TEST SPREAD ACCOUNT DETAILS')));
  return { class: cls, publics, assigns, fixedExact, secretLeak, calls: recorded.length };
}

function strip(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function fixedCount(recorded) {
  const lines = new Set(Object.values(FIXED));
  return recorded.filter((r) => r.messageType === 'comment' && lines.has(r.body)).length;
}

function checkExpect(spec, recorded, signature) {
  const failures = [];
  const expect = spec.expect || {};
  const comments = recorded.filter((r) => r.messageType === 'comment');
  const okComments = comments.filter((r) => r.status >= 200 && r.status < 300);
  if (expect.publicCount != null && okComments.length !== expect.publicCount) {
    failures.push({
      code: 'public-count',
      class: spec.onFail || 'defect',
      detail: 'public comments ' + okComments.length + ' wanted ' + expect.publicCount,
    });
  }
  if (Array.isArray(expect.publicExact)) {
    const got = okComments.map((r) => r.body);
    const want = expect.publicExact;
    if (got.length !== want.length || got.some((b, i) => b !== want[i])) {
      failures.push({
        code: 'public-exact',
        class: spec.onFail || 'defect',
        detail: 'exact public ' + JSON.stringify(got) + ' wanted ' + JSON.stringify(want),
      });
    }
  }
  if (expect.fixed === false) {
    if (signature.fixedExact) {
      failures.push({
        code: 'unexpected-fixed',
        class: spec.onFail || 'unnecessary handoff',
        detail: 'fixed line ' + signature.fixedExact,
      });
    }
  }
  if (typeof expect.fixed === 'string') {
    const want = FIXED[expect.fixed] || expect.fixed;
    if (signature.fixedExact !== want && !(okComments.length === 1 && okComments[0].body === want)) {
      failures.push({
        code: 'missing-fixed',
        class: spec.onFail || 'product-critical',
        detail: 'wanted fixed ' + want + ' got ' + JSON.stringify(okComments.map((r) => r.body)),
      });
    }
  }
  if (expect.assigns != null) {
    const n = recorded.filter((r) => r.messageType === 'assignment').length;
    if (n !== expect.assigns) {
      failures.push({
        code: 'assign-count',
        class: spec.onFail || 'defect',
        detail: 'assignment calls ' + n + ' wanted ' + expect.assigns,
      });
    }
  }
  if (Array.isArray(expect.contains)) {
    const blob = okComments.map((r) => r.body).join('\n');
    for (const piece of expect.contains) {
      if (!blob.includes(piece)) {
        failures.push({
          code: 'missing-text',
          class: spec.onFail || 'defect',
          detail: 'public text missing ' + piece,
        });
      }
    }
  }
  if (Array.isArray(expect.excludes)) {
    const blob = recorded.map((r) => r.exact).join('\n');
    for (const piece of expect.excludes) {
      if (piece && blob.includes(piece)) {
        failures.push({
          code: 'forbidden-text',
          class: spec.onFail || 'product-critical',
          detail: 'outbound contained ' + piece,
        });
      }
    }
  }
  if (expect.noCalls && recorded.length) {
    failures.push({
      code: 'unexpected-call',
      class: spec.onFail || 'product-critical',
      detail: 'calls ' + recorded.length,
    });
  }
  if (expect.class && signature.class !== expect.class) {
    failures.push({
      code: 'class',
      class: spec.onFail || 'defect',
      detail: 'class ' + signature.class + ' wanted ' + expect.class,
    });
  }
  if (Array.isArray(expect.notClasses) && expect.notClasses.includes(signature.class)) {
    failures.push({
      code: 'class-forbidden',
      class: spec.onFail || 'defect',
      detail: 'class ' + signature.class + ' is forbidden',
    });
  }
  if (expect.accountKept) {
    const blob = recorded.map((r) => r.exact).join('\n');
    if (!blob.includes(expect.accountKept)) {
      failures.push({
        code: 'account-redacted',
        class: spec.onFail || 'over-block',
        detail: 'account ' + expect.accountKept + ' was removed from outbound bytes',
      });
    }
  }
  for (const rec of recorded) {
    if (rec.unexpected) {
      failures.push({ code: 'unexpected-url', class: 'defect', detail: rec.url });
    }
  }
  if (signature.secretLeak) {
    failures.push({ code: 'secret-leak', class: 'product-critical', detail: 'credential bytes left the process' });
  }
  const lines = Object.values(FIXED);
  let seenFixed = 0;
  let assignedOk = false;
  let liveSeat = seatId((spec.setup && spec.setup.assignee) || 'bot');
  for (const rec of recorded) {
    if (rec.messageType === 'assignment' && rec.status >= 200 && rec.status < 300 && rec.mode === 'default') {
      assignedOk = true;
      liveSeat = rec.assigneeId;
    }
    if (rec.messageType === 'comment' && lines.includes(rec.body)) {
      seenFixed += 1;
      const preexisting = spec.setup && spec.setup.assignee === 'seat';
      if (!assignedOk && !preexisting && rec.status >= 200 && rec.status < 300) {
        failures.push({
          code: 'fixed-without-assignment',
          class: 'product-critical',
          detail: 'fixed line with no verified assignment in this turn',
        });
      }
      void liveSeat;
    }
  }
  if (seenFixed > 1) {
    failures.push({ code: 'duplicate-fixed', class: 'product-critical', detail: 'fixed lines ' + seenFixed });
  }
  return failures;
}

async function runStep(index, stateDir, spec) {
  const controlFile = path.join(stateDir, 'control.json');
  const worldFile = path.join(stateDir, 'world.json');
  const setup = Object.assign({ id: spec.convId || spec.id }, spec.setup || {});
  setup.id = spec.convId || spec.id;
  let world;
  if (spec.stepIndex > 0 && fs.existsSync(worldFile)) {
    world = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
  } else {
    world = {
      conversation: buildConversation(setup, spec.text || ''),
      http: [],
      live: (spec.setup && spec.setup.live) || 'follow',
      assignmentPosted: false,
    };
  }
  if (spec.mutate === 'remove-note') {
    const parts = world.conversation.conversation_parts.conversation_parts;
    world.conversation.conversation_parts.conversation_parts = parts.filter((p) => p.part_type !== 'note');
  }
  if (spec.mutate === 'append-user') {
    const now = Math.floor(Date.now() / 1000);
    world.conversation.conversation_parts.conversation_parts.push({
      id: 'user-' + now + '-' + Math.floor(Math.random() * 1000),
      part_type: spec.reopen ? 'open' : 'comment',
      body: spec.text || '',
      author: { type: 'user', id: 'user-1', name: 'Reviewer', email: 'reviewer@example.com' },
      created_at: now,
    });
    world.conversation.source.body = spec.text || '';
  }
  if (spec.mutate === 'land-seat') {
    world.conversation.admin_assignee_id = SEAT;
  }
  if (spec.mutate === 'clear-assignee') {
    world.conversation.admin_assignee_id = ARSAL;
  }
  if (spec.mutate === 'add-human-reply') {
    const now = Math.floor(Date.now() / 1000);
    world.conversation.admin_assignee_id = HUMAN;
    world.conversation.conversation_parts.conversation_parts.push({
      id: 'human-late-' + now,
      part_type: 'comment',
      body: 'I am looking at this for you.',
      author: { type: 'admin', id: HUMAN, name: 'Human Seven' },
      created_at: now - 1,
    });
  }
  world.http = clone(spec.http || []);
  world.live = spec.live || world.live || 'follow';
  world.assignmentPosted = false;
  world.fetchAfterAssign = false;
  world.fetchBeforeComment = false;
  world.axios = null;
  writeControl(controlFile, Object.assign({}, setup, { paused: spec.paused, aiOff: spec.aiOff }));
  installModel(spec.model);
  const runtime = process.env.LUNA_RUNTIME;
  const axios = require(require.resolve('axios', { paths: [runtime] }));
  world.axios = axios;
  const recorded = [];
  makeAdapter(world, recorded);
  const topic = spec.topic || (setup.topic || 'conversation.user.replied');
  const req = { body: { topic, data: { item: clone(world.conversation) } } };
  const res = { statusCode: 0, sendStatus(code) { this.statusCode = code; return this; } };
  let error = null;
  try {
    await index.handleWebhook(req, res);
  } catch (e) {
    error = e && e.message;
    if (e && e.code === 'NETWORK_TRIPWIRE') {
      recorded.push({ method: 'TRIP', url: error, messageType: 'tripwire', exact: error, body: '', status: 0 });
    }
  }
  fs.writeFileSync(worldFile, JSON.stringify({
    conversation: world.conversation,
    live: world.live,
  }));
  const signature = classifySignature(recorded);
  const failures = checkExpect(spec, recorded, signature);
  if (error && (!failures.length || !/NETWORK_TRIPWIRE/.test(error))) {
    failures.push({ code: 'throw', class: 'defect', detail: error });
  }
  if (error && /NETWORK_TRIPWIRE/.test(error)) {
    failures.push({ code: 'tripwire', class: 'product-critical', detail: error });
  }
  return {
    id: spec.id,
    step: spec.stepIndex || 0,
    status: res.statusCode,
    error,
    signature,
    failures,
    fixedCount: fixedCount(recorded),
    recorded: recorded.map((r) => ({
      method: r.method,
      url: r.url.replace(/https:\/\/api\.intercom\.io/, ''),
      messageType: r.messageType,
      status: r.status,
      mode: r.mode,
      assigneeId: r.assigneeId,
      body: r.messageType === 'note' ? String(r.body || '').slice(0, 180) : r.body,
    })),
  };
}

async function main() {
  const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const runtime = job.runtime;
  process.env.LUNA_RUNTIME = runtime;
  process.env.LUNA_CONTROL_STATE_FILE = path.join(job.stateDir, 'control.json');
  process.env.TICKET_STATE_FILE = path.join(job.stateDir, 'tickets.json');
  process.env.LUNA_OP_STORE_FILE = path.join(job.stateDir, 'ops.json');
  process.env.MENTION_ROTATE_FILE = path.join(job.stateDir, 'mention.json');
  process.env.LUNA_PROMPT_FILE = path.join(runtime, 'system-prompt.txt');
  process.env.DOTENV_CONFIG_PATH = path.join(job.stateDir, 'empty.env');
  process.env.OPENAI_API_KEY = '';
  process.env.INTERCOM_ACCESS_TOKEN = '';
  process.env.CONTROL_SECRET = '';
  process.env.MAINTAINER_ENABLED = 'false';
  fs.mkdirSync(job.stateDir, { recursive: true });
  fs.writeFileSync(process.env.DOTENV_CONFIG_PATH, '');
  fs.writeFileSync(path.join(job.stateDir, 'runtime-link.js'), 'module.exports = {};\n');
  if (job.reset) {
    for (const name of ['tickets.json', 'ops.json', 'mention.json', 'world.json']) {
      const p = path.join(job.stateDir, name);
      if (fs.existsSync(p)) fs.rmSync(p);
    }
  }
  if (job.wipeOp && fs.existsSync(process.env.LUNA_OP_STORE_FILE)) fs.rmSync(process.env.LUNA_OP_STORE_FILE);
  if (job.corruptOp) fs.writeFileSync(process.env.LUNA_OP_STORE_FILE, '{');
  const index = loadIndex(runtime);
  const results = [];
  for (const spec of job.steps) {
    if (spec.resetState) {
      for (const name of ['tickets.json', 'ops.json', 'world.json', 'mention.json']) {
        const p = path.join(job.stateDir, name);
        if (fs.existsSync(p)) fs.rmSync(p);
      }
    }
    results.push(await runStep(index, job.stateDir, spec));
  }
  fs.writeFileSync(job.outFile, JSON.stringify({ results }, null, 2));
}

main().catch((e) => {
  console.error(e && e.stack || e);
  process.exit(1);
});
