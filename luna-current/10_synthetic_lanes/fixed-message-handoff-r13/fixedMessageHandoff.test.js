'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.LUNA_OP_STORE_FILE = path.join(os.tmpdir(), 'luna-r13-ops-' + process.pid + '.json');
try { fs.unlinkSync(process.env.LUNA_OP_STORE_FILE); } catch (_) { /* fresh store */ }

const handoff = require('../../01_runtime/fixedMessageHandoff');
const softEdges = require('../../01_runtime/softEdges');

const FIXED = handoff.FIXED_MESSAGES.en;
const OWN = {
  arsalId: 'seat-a',
  eliteAiId: 'seat-e',
  riskTeamId: 'risk-1',
  escalationsTeamId: 'esc-1',
};

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

function indexSrc() {
  return fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
}

function fixedDecision() {
  return {
    action: 'fixed_message',
    silent: false,
    route: null,
    reason: 'fixed_handoff',
    language: 'en',
    message: FIXED,
  };
}

function transport(script) {
  const calls = [];
  async function take(op, extra) {
    calls.push(Object.assign({ op }, extra || {}));
    const spec = script && Object.prototype.hasOwnProperty.call(script, op) ? script[op] : { ok: true, status: 200, data: { id: 'conv-synthetic', type: 'conversation' } };
    return typeof spec === 'function' ? spec(calls) : spec;
  }
  return {
    calls,
    postNote: (body) => take('note', { body }),
    assign: (id) => take('assign', { id }),
    postMessage: (body) => take('message', { body }),
  };
}

function welcome(text, extra) {
  return handoff.decide(Object.assign({
    path: 'welcome',
    latestText: text,
    parts: [],
    full: { admin_assignee_id: 'seat-a', team_assignee_id: '0' },
    botId: 'seat-a',
    ownershipOpts: OWN,
  }, extra || {}));
}

const note = {
  part_type: 'note',
  author: { id: 'seat-a', type: 'admin' },
  body: 'Account: 1 Problem: x',
};

function heldProgress(first) {
  return Object.assign({}, first.progress);
}

async function failAssign(spec) {
  const failed = transport({ assign: spec });
  const first = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    botIds: ['seat-a', 'seat-e'],
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    progress: {},
    transport: failed,
  });
  return { failed, first };
}

// R11 floor, copied from the R11 matcher. Stem hits are allowed on top.
// A sentence this function calls structural must stay structural.
function r11NormalizeArabic(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

const R11_GRAMMAR = Object.freeze({
  ar: {
    roles: ['موظف', 'وكيل', 'انسان', 'شخص', 'بشري', 'ممثل', 'ايجنت', 'اجنت'],
    acts: ['اريد', 'ابغى', 'ابي', 'اود', 'تحويل', 'اوصل', 'تحدث', 'اتحدث', 'تكلم', 'كلم'],
  },
  ur: {
    roles: ['ایجنٹ', 'انسان', 'بندہ', 'نمائندہ', 'شخص', 'آدمی'],
    acts: ['چاہیے', 'چاہتا', 'چاہتی', 'بات', 'ملاؤ', 'جوڑو', 'منتقل'],
  },
  hi: {
    roles: ['एजेंट', 'इंसान', 'व्यक्ति', 'प्रतिनिधि', 'आदमी'],
    acts: ['चाहिए', 'बात', 'मिलाओ', 'जोड़ो', 'स्थानांतर'],
  },
  en: {
    roles: ['agent', 'human', 'person', 'manager', 'supervisor', 'teammate', 'representative'],
    acts: ['talk', 'speak', 'connect', 'transfer', 'live', 'want', 'need'],
  },
  fr: {
    roles: ['agent', 'humain', 'humaine', 'personne', 'conseiller', 'conseillère', 'operateur', 'opérateur'],
    acts: ['parler', 'veux', 'voudrais', 'joindre', 'transfert', 'transfert'],
  },
  de: {
    roles: ['mitarbeiter', 'mensch', 'person', 'berater', 'agent'],
    acts: ['sprechen', 'moechte', 'möchte', 'verbinden', 'weiterleiten'],
  },
  nl: {
    roles: ['medewerker', 'mens', 'persoon', 'agent'],
    acts: ['spreken', 'wil', 'doorverbinden', 'verbinden'],
  },
  es: {
    roles: ['agente', 'humano', 'persona', 'asesor'],
    acts: ['hablar', 'quiero', 'conectar', 'transferir'],
  },
  pt: {
    roles: ['agente', 'humano', 'pessoa', 'atendente'],
    acts: ['falar', 'quero', 'ligar', 'transferir'],
  },
  tr: {
    roles: ['temsilci', 'insan', 'operatör', 'operator'],
    acts: ['konusmak', 'konuşmak', 'istiyorum', 'bagla', 'bağla'],
  },
  pl: {
    roles: ['czlowiek', 'człowiek', 'konsultant', 'agent'],
    acts: ['rozmawiac', 'rozmawiać', 'chce', 'chcę', 'polaczyc', 'połączyć'],
  },
  id: {
    roles: ['agen', 'manusia', 'petugas', 'orang'],
    acts: ['bicara', 'ingin', 'hubungkan', 'transfer'],
  },
  ru: {
    roles: ['оператор', 'человек', 'сотрудник', 'агент'],
    acts: ['хочу', 'говорить', 'соедините', 'переведите'],
  },
  zh: {
    roles: ['人工', '客服', '代理人'],
    acts: ['转接', '转给', '我要', '请接'],
  },
  ja: {
    roles: ['担当者', 'オペレーター', '人間'],
    acts: ['つなぐ', '代わり', '話したい', 'お願いします'],
  },
  hinglish: {
    roles: ['insaan', 'insan', 'banda', 'agent', 'human', 'person'],
    acts: ['chahiye', 'chahie', 'baat', 'milao', 'jodo'],
  },
});

function r11Contains(text, token, lang) {
  const raw = lang === 'ar' ? r11NormalizeArabic(text) : String(text || '');
  const needle = lang === 'ar' ? r11NormalizeArabic(token) : String(token || '');
  if (!needle) return false;
  if (lang === 'en') {
    return new RegExp('(?:^|[^a-z])' + needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[^a-z]|$)', 'i').test(raw);
  }
  if (lang === 'ar') return raw.indexOf(needle) !== -1;
  const fold = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return fold(raw).indexOf(fold(needle)) !== -1;
}

function r11Hit(text, lang) {
  const g = R11_GRAMMAR[lang];
  if (!g) return { hit: false };
  let roles = 0;
  let acts = 0;
  for (const w of g.roles) if (r11Contains(text, w, lang)) roles += 1;
  for (const w of g.acts) if (r11Contains(text, w, lang)) acts += 1;
  const compact = String(lang === 'ar' ? r11NormalizeArabic(text) : text || '').replace(/\s+/g, ' ').trim();
  const shortRole = roles > 0 && compact.length > 0 && compact.length <= 24;
  return { hit: (roles > 0 && acts > 0) || shortRole };
}

function r11Structural(text) {
  const detected = handoff.detectLanguage(text);
  const grammarLang = detected === 'hinglish' ? 'hinglish' : detected;
  if (R11_GRAMMAR[grammarLang] && r11Hit(text, grammarLang).hit) return true;
  if (detected === 'hinglish' && r11Hit(text, 'ur').hit) return true;
  if (grammarLang !== 'en' && r11Hit(text, 'en').hit) return true;
  return softEdges.clientRequestedLiveAgent(text) || softEdges.finHandoffPhrase(text);
}

tests.push(test('R11 handoffs stay handoffs, and Arabic stems are added on top', () => {
  const handoffs = [
    ['ar', 'أريد التحدث مع موظف', handoff.FIXED_MESSAGES.en],
    ['ur', 'مجھے ایک انسان سے بات کرنی ہے', handoff.FIXED_MESSAGES.en],
    ['hi', 'मुझे एक इंसान से बात करनी है', handoff.FIXED_MESSAGES.en],
    ['en', 'live agent please', handoff.FIXED_MESSAGES.en],
    ['en', 'please get me a human', handoff.FIXED_MESSAGES.en],
    ['ur', 'مجھے نمائندے سے بات کرنی ہے', handoff.FIXED_MESSAGES.en],
    ['ur', 'نمائندوں سے بات کرنی ہے', handoff.FIXED_MESSAGES.en],
    ['ur', 'مجھے ایک نمائندہ چاہیے', handoff.FIXED_MESSAGES.en],
    ['ur', 'میں نمایندے سے بات کرنا چاہتا ہوں', handoff.FIXED_MESSAGES.en],
    ['ar', 'أريد التحدث مع الموظفين', handoff.FIXED_MESSAGES.en],
    ['hi', 'मुझे प्रतिनिधियों से बात करनी है', handoff.FIXED_MESSAGES.en],
    ['hi', 'मुझे एजेंटों से बात करनी है', handoff.FIXED_MESSAGES.en],
    ['en', 'je veux parler à un agent', handoff.FIXED_MESSAGES.en],
    ['en', 'ich möchte mit einem Menschen sprechen', handoff.FIXED_MESSAGES.en],
    ['en', 'ik wil graag met een medewerker spreken', handoff.FIXED_MESSAGES.en],
    ['en', 'quiero hablar con un agente', handoff.FIXED_MESSAGES.en],
    ['en', 'quero falar com um agente', handoff.FIXED_MESSAGES.en],
    ['en', 'bir insanla konuşmak istiyorum', handoff.FIXED_MESSAGES.en],
    ['en', 'chcę rozmawiać z człowiekiem', handoff.FIXED_MESSAGES.en],
    ['en', 'saya ingin bicara dengan agen', handoff.FIXED_MESSAGES.en],
    ['en', 'хочу говорить с оператором', handoff.FIXED_MESSAGES.en],
    ['en', '我要转接人工', handoff.FIXED_MESSAGES.en],
    ['en', '担当者にお願いします', handoff.FIXED_MESSAGES.en],
    ['it', 'voglio un operatore', handoff.FIXED_MESSAGES.en],
    ['ur', 'mujhe ek insaan chahiye', handoff.FIXED_MESSAGES.en],
  ];
  const r11Only = new Set([
    'أريد التحدث مع موظف',
    'مجھے ایک انسان سے بات کرنی ہے',
    'मुझे एक इंसान से बात करनी है',
    'live agent please',
    'please get me a human',
    'je veux parler à un agent',
    'ich möchte mit einem Menschen sprechen',
    'ik wil graag met een medewerker spreken',
    'quiero hablar con un agente',
    'quero falar com um agente',
    'bir insanla konuşmak istiyorum',
    'chcę rozmawiać z człowiekiem',
    'saya ingin bicara dengan agen',
    'хочу говорить с оператором',
    '我要转接人工',
    '担当者にお願いします',
    'voglio un operatore',
    'mujhe ek insaan chahiye',
  ]);
  for (const [language, text, message] of handoffs) {
    if (r11Only.has(text)) assert.strictEqual(r11Structural(text), true, text);
    assert.strictEqual(handoff.isStructuralHandoffAsk(text), true, text);
    const decision = welcome(text, text.indexOf('mujhe') === 0 ? { path: 'main_escalate', force: true } : {});
    assert.strictEqual(decision.action, 'fixed_message', text);
    assert.strictEqual(decision.language, 'en', text);
    assert.strictEqual(decision.message, message, text);
  }

  const generated = [];
  for (const lang of Object.keys(R11_GRAMMAR)) {
    const g = R11_GRAMMAR[lang];
    for (const role of g.roles) {
      generated.push(role);
      for (const act of g.acts) generated.push(act + ' ' + role);
    }
  }
  generated.push(
    'live agent please',
    'please get me a human',
    'je veux parler à un agent',
    'voglio un operatore',
    'mujhe ek insaan chahiye'
  );
  let floor = 0;
  for (const text of generated) {
    if (!r11Structural(text)) continue;
    floor += 1;
    assert.strictEqual(handoff.isStructuralHandoffAsk(text), true, 'narrower than R11: ' + text);
  }
  assert.ok(floor > 40);

  const tail = ' بخصوص هذه المسألة والموضوع الذي أرسلته اليوم';
  const added = [
    'أريد التحدث مع موظف',
    'اريد التحدث مع موظف',
    'أريد التحدث مع موظفاً',
    'أريد التحدث مع موظفة',
    'أريد التحدث مع الموظفين',
    'أريد التحدث مع موظفون',
    'أريد التحدث مع وكيلاً',
    'أريد التحدث مع وكيلة',
    'أريد التحدث مع شخصاً',
    'أريد التحدث مع أشخاص',
    'أريد التحدث مع شخصٌ',
    'اوصلني مع موظف',
    'وصلني مع شخص',
    'وصلني مع وكيل',
  ];
  for (const text of added) {
    const long = text + tail;
    assert.ok(long.length > 24 && long.length <= 160, text);
    const decision = welcome(long);
    assert.strictEqual(handoff.detectLanguage(long), 'ar', text);
    assert.strictEqual(handoff.isStructuralHandoffAsk(long), true, text);
    assert.strictEqual(decision.action, 'fixed_message', text);
    assert.strictEqual(decision.language, 'en', text);
    assert.strictEqual(decision.message, handoff.FIXED_MESSAGES.en, text);
  }

  const withdrawal = welcome('ما هي قواعد السحب؟');
  assert.strictEqual(r11Structural('ما هي قواعد السحب؟'), false);
  assert.strictEqual(handoff.isStructuralHandoffAsk('ما هي قواعد السحب؟'), false);
  assert.strictEqual(handoff.isPureLiveAgentAsk('ما هي قواعد السحب؟'), false);
  assert.strictEqual(withdrawal.action, 'route_normal');
}));

tests.push(test('a definite assignment miss is retryable and not an ambiguous hold', () => {
  const unnamedPartial = handoff.classifyAssignment(
    { ok: true, status: 200, partial: true, data: { id: 'conv-synthetic', errors: [{ code: 'partial' }] } },
    { kind: 'assignment', assigneeId: 'human-7' }
  );
  assert.strictEqual(unnamedPartial.ok, false);
  assert.strictEqual(unnamedPartial.reason, 'failed');

  const noSeat = handoff.classifyAssignment(
    { ok: true, status: 200, data: { id: 'conv-1', type: 'conversation' }, unknown: true },
    { kind: 'assignment', assigneeId: 'human-7' }
  );
  assert.strictEqual(noSeat.ok, false);
  assert.strictEqual(noSeat.reason, 'failed');

  const emptySeat = handoff.classifyAssignment(
    { ok: true, status: 200, data: { id: 'conv-1', type: 'conversation', admin_assignee_id: '0' } },
    { kind: 'assignment', assigneeId: 'human-7' }
  );
  assert.strictEqual(emptySeat.reason, 'failed');

  const wrong = handoff.classifyAssignment(
    { ok: true, status: 200, partial: true, data: { id: 'conv-1', admin_assignee_id: 'human-9' } },
    { kind: 'assignment', assigneeId: 'human-7' }
  );
  assert.strictEqual(wrong.reason, 'failed');

  const legacy = handoff.classifyAssignment(
    { ok: true, status: 200, data: { id: 'conv-synthetic', type: 'conversation' } },
    { kind: 'assignment', assigneeId: 'human-7' }
  );
  assert.strictEqual(legacy.ok, true);

  const named = handoff.classifyAssignment(
    { ok: true, status: 200, data: { admin_assignee_id: 'human-7' } },
    { kind: 'assignment', assigneeId: 'human-7' }
  );
  assert.strictEqual(named.ok, true);
}));

tests.push(test('timeout and 5xx holds are rechecked on the next turn, restart, or wipe', async () => {
  for (const spec of [
    { ok: false, status: 0, unknown: true, reason: 'timeout' },
    { ok: false, status: 500, unknown: true },
  ]) {
    const { first } = await failAssign(spec);
    assert.strictEqual(first.sent, false);
    assert.strictEqual(first.progress.assignAmbiguous, true);
    assert.notStrictEqual(first.progress.phase, 'assignment-pending');
    assert.strictEqual(first.progress.assigneeId, 'human-7');

    const stuck = transport({ assign: { ok: true, status: 200, data: { admin_assignee_id: 'human-7' } } });
    const replay = await handoff.commit({
      decision: fixedDecision(),
      noteHtml: 'Account: 1<br>Problem: x',
      assigneeId: 'human-7',
      botId: 'seat-a',
      parts: [note],
      conversation: { admin_assignee_id: 'seat-a' },
      progress: heldProgress(first),
      transport: stuck,
    });
    assert.deepStrictEqual(stuck.calls.map((c) => c.op), []);
    assert.strictEqual(replay.reason, 'assign_ambiguous_held');

    const wiped = handoff.resumeLostHandoff({
      progress: heldProgress(first),
      parts: [],
      conversation: { admin_assignee_id: 'seat-a' },
      botId: 'seat-a',
      opRecord: null,
    });
    assert.strictEqual(wiped.resume, true);
    assert.strictEqual(wiped.hold, true);
    assert.strictEqual(wiped.reason, 'assignment_unverified');
    assert.notStrictEqual(wiped.reason, 'ambiguous_held');
    assert.strictEqual(wiped.assigneeId, 'human-7');

    const retried = transport({ assign: { ok: true, status: 200, data: { admin_assignee_id: 'human-7' } } });
    const again = await handoff.commit({
      decision: fixedDecision(),
      noteHtml: 'Account: 1<br>Problem: x',
      assigneeId: 'human-7',
      botId: 'seat-a',
      botIds: ['seat-a', 'seat-e'],
      parts: [note],
      conversation: { admin_assignee_id: 'seat-a' },
      progress: heldProgress(first),
      recheckHold: true,
      transport: retried,
    });
    assert.deepStrictEqual(retried.calls.map((c) => c.op), ['assign', 'message']);
    assert.strictEqual(again.sent, true);
    assert.strictEqual(again.progress.assignAmbiguous, false);
    assert.strictEqual(again.progress.messageSent, true);
    assert.strictEqual(retried.calls.find((c) => c.op === 'message').body, FIXED);

    const quiet = transport();
    const duplicate = await handoff.commit({
      decision: fixedDecision(),
      noteHtml: 'Account: 1<br>Problem: x',
      assigneeId: 'human-7',
      botId: 'seat-a',
      parts: [note, { part_type: 'comment', author: { id: 'seat-a', type: 'admin' }, body: FIXED }],
      conversation: { admin_assignee_id: 'human-7' },
      progress: again.progress,
      recheckHold: true,
      transport: quiet,
    });
    assert.deepStrictEqual(quiet.calls.map((c) => c.op), []);
    assert.strictEqual(duplicate.reason, 'already_sent');
  }

  const { first } = await failAssign({ ok: false, status: 500, unknown: true });
  const landed = handoff.resumeLostHandoff({
    progress: heldProgress(first),
    parts: [note],
    conversation: { admin_assignee_id: 'human-7' },
    botId: 'seat-a',
    opRecord: null,
  });
  assert.strictEqual(landed.resume, true);
  assert.strictEqual(landed.hold, false);
  assert.strictEqual(landed.reason, 'op_assignment');
  assert.strictEqual(landed.handoffAssigneeId, 'human-7');

  const once = transport();
  const posted = await handoff.commit({
    decision: fixedDecision(),
    noteHtml: 'Account: 1<br>Problem: x',
    assigneeId: 'human-7',
    botId: 'seat-a',
    parts: [note],
    conversation: { admin_assignee_id: 'human-7' },
    progress: heldProgress(first),
    recheckHold: true,
    transport: once,
  });
  assert.deepStrictEqual(once.calls.map((c) => c.op), ['message']);
  assert.strictEqual(posted.sent, true);
  assert.strictEqual(posted.progress.assignAmbiguous, false);
  assert.strictEqual(once.calls[0].body, FIXED);

  const noteHold = handoff.resumeLostHandoff({
    progress: { noteAmbiguous: true, noteConfirmed: false, assigneeId: 'human-7' },
    parts: [],
    conversation: { admin_assignee_id: 'seat-a' },
    botId: 'seat-a',
    opRecord: null,
  });
  assert.strictEqual(noteHold.resume, false);
  assert.strictEqual(noteHold.reason, 'ambiguous_held');

  const fn = indexSrc();
  const commitAt = fn.indexOf('async function commitFixedMessageHandoff');
  const webhookAt = fn.indexOf('const handleWebhook');
  const body = fn.slice(commitAt, webhookAt);
  assert.ok(body.includes('recheckHold'));
  assert.ok(body.includes('assignAmbiguous'));
  assert.ok(body.includes('requireLiveAssignee: true'));
}));

Promise.all(tests)
  .then(() => {
    console.log('OK', passed, 'passed');
  })
  .catch((err) => {
    console.error('FAIL', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  });
