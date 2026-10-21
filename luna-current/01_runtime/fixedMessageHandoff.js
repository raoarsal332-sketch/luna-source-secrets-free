'use strict';

/**
 * Fixed-message handoff R3.
 *
 * Every handoff path posts a successful internal note, then a successful assignment,
 * then exactly one fixed customer message. Assignment HTTP 500, timeout, 422, or a
 * partial success withholds the message and does not ask the caller to set
 * escalateAwaitingFirstTeammate. Ownership fails closed. Account-number questions
 * are not a welcome. Handoff asks in Urdu, Arabic, and Hindi are chosen by script
 * and language, and the fixed lines state only the assignment that just succeeded.
 *
 * approved is false. This module does not deploy, call Intercom, or read secrets.
 */

const softEdges = require('./softEdges');
const teammateHandoffGates = require('./teammateHandoffGates');

let sharedRedact = null;
try {
  sharedRedact = require('../02_statePresend/credentialSanitizer').sanitizeCredentials;
} catch (_) {
  sharedRedact = null;
}

const STATUS = Object.freeze({
  candidate: 'fixed-message-handoff-r3',
  approved: false,
  release: false,
});

const FIXED_MESSAGES = Object.freeze({
  en: 'A teammate now has this conversation.',
  ur: 'یہ گفتگو اب ایک ساتھی کے پاس ہے۔',
  ar: 'هذه المحادثة الآن لدى أحد الزملاء.',
  hi: 'यह बातचीत अब एक साथी के पास है।',
  it: 'Un collega ha ora questa conversazione.',
});

const URDU_ONLY = /[\u0679\u0688\u0691\u06BA\u06BE\u06C1\u06C2\u06C3\u06D2\u067E\u0686\u0698\u06AF\u06A9]/g;
const ARABIC_ONLY = /[\u0629\u0649\u0643]/g;

const LATIN_MARKERS = Object.freeze({
  hi: ['kripya', 'kripaya', 'namaste', 'dhanyavaad', 'dhanyavad', 'aapko'],
  ur: ['assalam', 'assalamu', 'adaab', 'shukriya', 'meherbani', 'janab'],
  it: ['ciao', 'buongiorno', 'salve', 'grazie', 'vorrei', 'perche'],
  en: ['the', 'please', 'what', 'how', 'my', 'your', 'hello', 'help'],
});

const SHARED_SOUTH_ASIAN = ['mujhe', 'kya', 'chahiye', 'aap', 'mera', 'meri', 'nahi', 'nahin'];

const GRAMMAR = Object.freeze({
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
});

function stripHtml(s) {
  return teammateHandoffGates.stripHtml(s);
}

function redactCredentials(text) {
  let t = String(text == null ? '' : text);
  if (typeof sharedRedact === 'function') t = sharedRedact(t);
  else {
    t = t
      .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, '[secret]')
      .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer [secret]')
      .replace(
        /\b(password|passcode|pass|otp|pin|2fa|mfa|token|secret)\b([\s:=-]*(?:is|was|:|=)?[\s:=-]*)(\S+)/gi,
        (_, label, sep) => label + sep + '[secret]'
      );
  }
  t = t.replace(
    /\b(pwd|passwd|passphrase)\b([\s:=-]*(?:is|was|:|=)?[\s:=-]*)(\S+)/gi,
    (_, label, sep) => label + sep + '[secret]'
  );
  return t;
}

function normalizeArabic(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

function countMatches(re, text) {
  const m = String(text || '').match(re);
  return m ? m.length : 0;
}

function scoreWords(text, words) {
  const t = String(text || '').toLowerCase();
  let n = 0;
  for (const w of words) {
    const re = new RegExp('(?:^|[^a-z])' + w + '(?:[^a-z]|$)', 'i');
    if (re.test(t)) n += 1;
  }
  return n;
}

function detectLatinLanguage(text) {
  const hi = scoreWords(text, LATIN_MARKERS.hi);
  const ur = scoreWords(text, LATIN_MARKERS.ur);
  const it = scoreWords(text, LATIN_MARKERS.it);
  const en = scoreWords(text, LATIN_MARKERS.en);
  const south = scoreWords(text, SHARED_SOUTH_ASIAN);
  if (hi > ur && hi >= it) return 'hi';
  if (ur > hi && ur >= it) return 'ur';
  if (it > en && it >= hi && it >= ur) return 'it';
  if (south > 0 && hi === 0 && ur === 0) return 'ur';
  return 'en';
}

/**
 * Script first, then letters that separate Urdu from Arabic, then Latin function words.
 * Handoff lexicons are selected only after this returns. They are not appended to the
 * English live-agent expression.
 */
function detectLanguage(text) {
  const s = String(text || '');
  const deva = (s.match(/[\u0900-\u097F]/g) || []).length;
  const arab = (s.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  if (deva > 0 && deva >= arab && deva >= latin) return 'hi';
  if (arab > 0 && arab >= latin && arab >= deva) {
    const urdu = countMatches(URDU_ONLY, s);
    const arOnly = countMatches(ARABIC_ONLY, s);
    if (urdu > 0 && urdu >= arOnly) return 'ur';
    return 'ar';
  }
  return detectLatinLanguage(s);
}

function containsToken(text, token, lang) {
  const raw = lang === 'ar' ? normalizeArabic(text) : String(text || '');
  const needle = lang === 'ar' ? normalizeArabic(token) : String(token || '');
  if (!needle) return false;
  if (lang === 'en') {
    return new RegExp('(?:^|[^a-z])' + needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[^a-z]|$)', 'i').test(raw);
  }
  return raw.indexOf(needle) !== -1;
}

function grammarHit(text, lang) {
  const g = GRAMMAR[lang];
  if (!g) return { hit: false, roles: 0, acts: 0 };
  let roles = 0;
  let acts = 0;
  for (const w of g.roles) if (containsToken(text, w, lang)) roles += 1;
  for (const w of g.acts) if (containsToken(text, w, lang)) acts += 1;
  const compact = String(lang === 'ar' ? normalizeArabic(text) : text || '')
    .replace(/\s+/g, ' ')
    .trim();
  const shortRole = roles > 0 && compact.length > 0 && compact.length <= 24;
  return { hit: (roles > 0 && acts > 0) || shortRole, roles, acts };
}

function isStructuralHandoffAsk(text, lang) {
  const detected = lang || detectLanguage(text);
  if (detected === 'ar' || detected === 'ur' || detected === 'hi') {
    return grammarHit(text, detected).hit;
  }
  if (grammarHit(text, 'en').hit) return true;
  return softEdges.clientRequestedLiveAgent(text) || softEdges.finHandoffPhrase(text);
}

function stripHandoffTokens(text, lang) {
  let t = String(text || '');
  const g = GRAMMAR[lang] || GRAMMAR.en;
  const pool = g.roles.concat(g.acts);
  for (const w of pool) {
    if (!w) continue;
    if (lang === 'en') {
      t = t.replace(new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), ' ');
    } else if (lang === 'ar') {
      t = normalizeArabic(t).split(normalizeArabic(w)).join(' ');
    } else {
      t = t.split(w).join(' ');
    }
  }
  return t
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPureHandoff(text, lang) {
  if (!isStructuralHandoffAsk(text, lang)) return false;
  return stripHandoffTokens(text, lang).length < 28;
}

function isVagueEnglish(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (softEdges.clientRequestedLiveAgent(t) && t.length < 140) {
    const rest = stripHandoffTokens(t, 'en');
    if (rest.length < 28) return true;
  }
  if (/^(hi|hello|hey|yo|hola|ciao)[.!?\s]*$/i.test(t)) return true;
  if (/^(i\s+have\s+)?another\s+question[.!?\s]*$/i.test(t)) return true;
  if (/^(i\s+need\s+help|help\s+please|can\s+you\s+help)[.!?\s]*$/i.test(t)) return true;
  return false;
}

function hasAccountNumberReference(text) {
  const s = String(text || '');
  if (/\b(account\s*(number|no\.?|#)|a\/?c\s*no\.?|acct\s*(number|no\.?))\b/i.test(s)) return true;
  if (/رقم\s*(?:ال)?حساب/.test(normalizeArabic(s))) return true;
  if (/اکاؤنٹ\s*نمبر|اکاونٹ\s*نمبر/.test(s)) return true;
  if (/खाता\s*(संख्या|नंबर)|अकाउंट\s*नंबर/.test(s)) return true;
  if (/\b(account|acct)\b/i.test(s) && /(?<!\d)\d{5,12}(?!\d)/.test(s)) return true;
  return false;
}

function isAccountNumberQuestion(text) {
  return hasAccountNumberReference(text);
}

function arsalSpoke(parts, botId) {
  const id = String(botId || '');
  if (!id) return false;
  for (const p of parts || []) {
    if (!p) continue;
    if (String((p.author || {}).id || '') !== id) continue;
    if (String(p.part_type || '') === 'note') continue;
    if (stripHtml(p.body || '')) return true;
  }
  return false;
}

function fixedMessageFor(lang) {
  if (Object.prototype.hasOwnProperty.call(FIXED_MESSAGES, lang)) return FIXED_MESSAGES[lang];
  return FIXED_MESSAGES.en;
}

function decide(input) {
  const src = input || {};
  const text = String(src.latestText || '');
  const parts = src.parts || [];
  const path = src.path || 'welcome';
  const lang = detectLanguage(text);
  const ownershipOpts = Object.assign({}, src.ownershipOpts, {
    handoffAssigneeId:
      src.handoffAssigneeId ||
      (src.ownershipOpts && src.ownershipOpts.handoffAssigneeId) ||
      '',
  });
  const ownership = teammateHandoffGates.classifyOwnership(src.full, parts, ownershipOpts);
  if (ownership.silent) {
    return {
      action: 'silence',
      silent: true,
      route: null,
      reason: ownership.reason,
      message: null,
      language: lang,
    };
  }
  if (path === 'welcome' && isAccountNumberQuestion(text)) {
    return {
      action: 'route_normal',
      route: 'normal',
      silent: false,
      reason: 'account_number_question',
      message: null,
      language: lang,
    };
  }
  const structural = isStructuralHandoffAsk(text, lang);
  const live =
    !!src.liveAgent ||
    structural ||
    ((lang !== 'ar' && lang !== 'ur' && lang !== 'hi') && softEdges.clientRequestedLiveAgent(text));
  const fin = !!src.finHandoff;
  const force = !!src.force || path !== 'welcome';
  if (!force) {
    if (arsalSpoke(parts, src.botId)) {
      return {
        action: 'route_normal',
        route: 'normal',
        silent: false,
        reason: 'arsal_already_replied',
        message: null,
        language: lang,
      };
    }
    if (!(fin || live || structural)) {
      return {
        action: 'route_normal',
        route: 'normal',
        silent: false,
        reason: 'not_handoff',
        message: null,
        language: lang,
      };
    }
    if (!(isVagueEnglish(text) || isPureHandoff(text, lang))) {
      return {
        action: 'route_normal',
        route: 'normal',
        silent: false,
        reason: 'substantive',
        message: null,
        language: lang,
      };
    }
  }
  const messageLang = fixedMessageFor(lang) === FIXED_MESSAGES[lang] ? lang : 'en';
  return {
    action: 'fixed_message',
    silent: false,
    route: null,
    reason: 'fixed_handoff',
    language: Object.prototype.hasOwnProperty.call(FIXED_MESSAGES, lang) ? lang : messageLang,
    message: fixedMessageFor(lang),
  };
}

function classifyAssignment(result) {
  if (!result || typeof result !== 'object') return { ok: false, reason: 'timeout' };
  if (result.timedOut || result.timeout) return { ok: false, reason: 'timeout' };
  const status = Number(result.status || 0);
  if (status === 422) return { ok: false, reason: '422' };
  if (status >= 500) return { ok: false, reason: '500' };
  const blob = String(result.message || result.reason || '');
  if (status === 0 || /timeout|etimedout|econnaborted/i.test(blob)) return { ok: false, reason: 'timeout' };
  const errors = result.data && Array.isArray(result.data.errors) ? result.data.errors : [];
  if (errors.length) return { ok: false, reason: 'partial' };
  if (result.unknown || result.partial || result.ok !== true) return { ok: false, reason: 'partial' };
  if (status < 200 || status >= 300) return { ok: false, reason: 'partial' };
  return { ok: true, reason: 'assigned' };
}

function noteAlreadyPresent(parts, botId) {
  const id = String(botId || '');
  for (const p of parts || []) {
    if (!p || String(p.part_type || '') !== 'note') continue;
    if (id && String((p.author || {}).id || '') !== id) continue;
    const body = stripHtml(p.body || '');
    if (/\bAccount\s*:/i.test(body) && /\bProblem\s*:/i.test(body)) return true;
  }
  return false;
}

function messageAlreadyPresent(parts, message, botId) {
  const want = String(message || '').replace(/\s+/g, ' ').trim();
  if (!want) return false;
  const id = String(botId || '');
  for (const p of parts || []) {
    if (!p || String(p.part_type || '') === 'note') continue;
    if (id && String((p.author || {}).id || '') !== id) continue;
    const body = stripHtml(p.body || '').replace(/\s+/g, ' ').trim();
    if (body === want) return true;
  }
  return false;
}

function assignmentAlreadyHeld(conversation, assigneeId) {
  if (!conversation || assigneeId == null || assigneeId === '') return false;
  const current =
    conversation.admin_assignee_id != null ? String(conversation.admin_assignee_id) : '';
  return current !== '' && current !== '0' && current === String(assigneeId);
}

function blankProgress() {
  return {
    noteConfirmed: false,
    noteAmbiguous: false,
    assignConfirmed: false,
    assignAmbiguous: false,
    assigneeId: '',
    messageSent: false,
    messageAmbiguous: false,
  };
}

function ambiguousWrite(reason) {
  return reason === '500' || reason === 'timeout' || reason === 'partial';
}

function progressForTurn(saved, turnId, path) {
  let progress = Object.assign(blankProgress(), saved || {});
  const id = String(turnId || '');
  if (
    path !== 'recovery' &&
    progress.messageSent &&
    id &&
    progress.turnId &&
    progress.turnId !== id
  ) {
    progress = blankProgress();
  }
  if (path !== 'recovery' && id) progress.turnId = id;
  return progress;
}

function finish(extra) {
  return Object.assign(
    {
      ok: false,
      sent: false,
      setAwaiting: false,
      withhold: false,
      duplicate: false,
      reason: '',
      progress: blankProgress(),
    },
    extra
  );
}

/**
 * Note, then assignment, then one message.
 * The transport is injected. Tests pass a recording transport. The runtime passes
 * postReply / assignToTeammate. This function does not open a socket.
 */
async function commit(ctx) {
  const src = ctx || {};
  const decision = src.decision || decide(src);
  const progress = Object.assign(blankProgress(), src.progress || {});
  if (decision.action === 'silence' || decision.silent) {
    return finish({ reason: decision.reason || 'silence', withhold: true, progress });
  }
  if (decision.route === 'normal' || decision.action === 'route_normal') {
    return finish({ reason: decision.reason || 'route_normal', route: 'normal', progress });
  }
  const message = redactCredentials(decision.message || '');
  if (!message || !Object.values(FIXED_MESSAGES).includes(message)) {
    return finish({ reason: 'no_fixed_message', withhold: true, progress });
  }
  const transport = src.transport;
  if (!transport || typeof transport.postNote !== 'function' || typeof transport.assign !== 'function' || typeof transport.postMessage !== 'function') {
    return finish({ reason: 'no_transport', withhold: true, progress });
  }

  const alreadyMessaged = progress.messageSent || messageAlreadyPresent(src.parts, message, src.botId);
  if (alreadyMessaged) {
    progress.messageSent = true;
    if (!progress.assignConfirmed && !assignmentAlreadyHeld(src.conversation, src.assigneeId || progress.assigneeId)) {
      return finish({
        reason: 'message_without_assignment',
        withhold: true,
        duplicate: true,
        progress,
      });
    }
    progress.assignConfirmed = true;
    progress.assigneeId = String(src.assigneeId || progress.assigneeId || '');
    return finish({
      ok: true,
      reason: 'already_sent',
      setAwaiting: true,
      duplicate: true,
      progress,
    });
  }

  if (!progress.noteConfirmed && !noteAlreadyPresent(src.parts, src.botId)) {
    if (progress.noteAmbiguous) {
      return finish({ reason: 'note_ambiguous_held', withhold: true, progress });
    }
    const noteRes = await transport.postNote(redactCredentials(src.noteHtml || ''));
    const noteClass = classifyAssignment(noteRes);
    if (!noteClass.ok) {
      if (ambiguousWrite(noteClass.reason)) progress.noteAmbiguous = true;
      return finish({ reason: 'note_' + noteClass.reason, withhold: true, progress });
    }
  }
  progress.noteConfirmed = true;
  progress.noteAmbiguous = false;
  progress.assigneeId = String(src.assigneeId || progress.assigneeId || '');

  if (!progress.assignConfirmed && !assignmentAlreadyHeld(src.conversation, progress.assigneeId)) {
    if (progress.assignAmbiguous) {
      return finish({ reason: 'assign_ambiguous_held', withhold: true, progress });
    }
    const asgRes = await transport.assign(progress.assigneeId);
    const asgClass = classifyAssignment(asgRes);
    if (!asgClass.ok) {
      if (ambiguousWrite(asgClass.reason)) progress.assignAmbiguous = true;
      return finish({ reason: 'assign_' + asgClass.reason, withhold: true, progress });
    }
  }
  progress.assignConfirmed = true;
  progress.assignAmbiguous = false;

  if (progress.messageAmbiguous && !messageAlreadyPresent(src.parts, message, src.botId)) {
    return finish({ reason: 'message_ambiguous_held', withhold: true, progress });
  }
  const msgRes = await transport.postMessage(message);
  const msgClass = classifyAssignment(msgRes);
  if (!msgClass.ok) {
    if (ambiguousWrite(msgClass.reason)) progress.messageAmbiguous = true;
    return finish({ reason: 'message_' + msgClass.reason, withhold: true, progress });
  }
  progress.messageSent = true;
  return finish({
    ok: true,
    sent: true,
    setAwaiting: true,
    reason: 'completed',
    language: decision.language,
    message,
    progress,
  });
}

module.exports = {
  STATUS,
  FIXED_MESSAGES,
  redactCredentials,
  detectLanguage,
  isStructuralHandoffAsk,
  isAccountNumberQuestion,
  decide,
  classifyAssignment,
  progressForTurn,
  commit,
};
