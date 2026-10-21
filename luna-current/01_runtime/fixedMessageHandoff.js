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
 * Account-number questions are exempt on every path, including recovery and
 * missed escalation, and they are decided before ownership silence. Credential
 * values are removed from the original text, including after ' and ’, before a
 * note or a translation prompt is built.
 *
 * approved is false. This module does not deploy, call Intercom, or read secrets.
 */

const softEdges = require('./softEdges');
const teammateHandoffGates = require('./teammateHandoffGates');

let assistantIdentityGuard = null;
try {
  assistantIdentityGuard = require('./assistantIdentityGuard');
} catch (_) {
  assistantIdentityGuard = null;
}

let credentialSanitizer = null;
try {
  credentialSanitizer = require('../02_statePresend/credentialSanitizer');
} catch (_) {
  credentialSanitizer = null;
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
  it: ['ciao', 'buongiorno', 'salve', 'grazie', 'vorrei', 'perche', 'voglio', 'parlare', 'operatore', 'assistenza', 'umano', 'umana', 'conto', 'numero', 'qual', 'mio', 'sono', 'della'],
  fr: ['bonjour', 'bonsoir', 'merci', 'voudrais', 'parler', 'conseiller', 'compte', 'numero', 'quel', 'quelle', 'je', 'vous'],
  de: ['hallo', 'danke', 'bitte', 'moechte', 'sprechen', 'kontonummer', 'konto', 'mein', 'wie', 'ich'],
  nl: ['hallo', 'dank', 'alstublieft', 'graag', 'spreken', 'rekeningnummer', 'rekening', 'mijn', 'hoe'],
  es: ['hola', 'gracias', 'quiero', 'hablar', 'cuenta', 'numero', 'cual', 'mi', 'por'],
  pt: ['ola', 'obrigado', 'obrigada', 'quero', 'falar', 'conta', 'numero', 'qual', 'meu', 'minha'],
  tr: ['merhaba', 'tesekkur', 'lutfen', 'istiyorum', 'konusmak', 'hesap', 'hesab', 'numara', 'nedir', 'benim', 'misiniz'],
  pl: ['dzien', 'dziekuje', 'prosze', 'chce', 'rozmawiac', 'konta', 'numer', 'moj', 'jak'],
  id: ['halo', 'terima', 'kasih', 'tolong', 'ingin', 'bicara', 'nomor', 'rekening', 'akun', 'saya'],
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
  // Roman Urdu/Hindi. The approved customer line stays Urdu script.
  hinglish: {
    roles: ['insaan', 'insan', 'banda', 'agent', 'human', 'person'],
    acts: ['chahiye', 'chahie', 'baat', 'milao', 'jodo'],
  },
});

function stripHtml(s) {
  return teammateHandoffGates.stripHtml(s);
}

function redactCredentials(text) {
  // The only label list is the shared sanitizer. It runs on the original text.
  const original = String(text == null ? '' : text);
  if (credentialSanitizer && typeof credentialSanitizer.isExactAllowedTemplate === 'function') {
    if (credentialSanitizer.isExactAllowedTemplate(original)) return original;
  }
  if (credentialSanitizer && typeof credentialSanitizer.sanitizeCredentials === 'function') {
    return credentialSanitizer.sanitizeCredentials(original);
  }
  return original;
}

function isExactAllowedTemplate(text) {
  return !!(
    credentialSanitizer &&
    typeof credentialSanitizer.isExactAllowedTemplate === 'function' &&
    credentialSanitizer.isExactAllowedTemplate(text)
  );
}

// The spread template, or a near-miss of it, is not a handoff promise. It is
// sent only when the customer's own message is an eligible spread ask.
function isSpreadTemplateDraft(text) {
  const raw = String(text || '');
  if (!raw.trim()) return false;
  if (isExactAllowedTemplate(raw)) return true;
  if (raw.includes('QBG5FetfozKz7')) return true;
  if (/TEST SPREAD ACCOUNT DETAILS/i.test(raw)) return true;
  if (/Fundedelite-Server/i.test(raw) && /55188/.test(raw)) return true;
  let hits = 0;
  if (/MetaTrader 5/i.test(raw)) hits += 1;
  if (/Fundedelite-Server/i.test(raw)) hits += 1;
  if (/Account Number:\s*55188/.test(raw)) hits += 1;
  if (/check spreads/i.test(raw)) hits += 1;
  return hits >= 3;
}

function prepareNoteForEnglishPrompt(text) {
  const original = String(text == null ? '' : text);
  const redacted = redactCredentials(original);
  return {
    text: redacted,
    promptText: redacted,
    devanagari: /[\u0900-\u097F]/.test(original),
  };
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
  const t = String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  let n = 0;
  for (const w of words) {
    const re = new RegExp('(?:^|[^a-z])' + w + '(?:[^a-z]|$)', 'i');
    if (re.test(t)) n += 1;
  }
  return n;
}

function detectLatinLanguage(text) {
  const scores = {};
  for (const lang of Object.keys(LATIN_MARKERS)) scores[lang] = scoreWords(text, LATIN_MARKERS[lang]);
  const south = scoreWords(text, SHARED_SOUTH_ASIAN);
  let best = 'en';
  let bestScore = scores.en || 0;
  for (const lang of Object.keys(scores)) {
    if (lang === 'en') continue;
    const score = scores[lang] || 0;
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  if (best !== 'en' && bestScore > (scores.en || 0)) return best;
  // Latin South Asian without Devanagari or Urdu-only letters is Hinglish.
  // The handoff line stays the approved Urdu line unless a Roman one is approved.
  if (south > 0 && (scores.hi || 0) === 0 && (scores.ur || 0) === 0) return 'hinglish';
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
  const kana = (s.match(/[\u3040-\u30FF]/g) || []).length;
  const han = (s.match(/[\u4E00-\u9FFF]/g) || []).length;
  const cyr = (s.match(/[\u0400-\u04FF]/g) || []).length;
  if (kana > 0 && kana + han >= latin) return 'ja';
  if (han > 0 && han >= latin && han >= cyr) return 'zh';
  if (cyr > 0 && cyr >= latin) return 'ru';
  return detectLatinLanguage(s);
}

function containsToken(text, token, lang) {
  const raw = lang === 'ar' ? normalizeArabic(text) : String(text || '');
  const needle = lang === 'ar' ? normalizeArabic(token) : String(token || '');
  if (!needle) return false;
  if (lang === 'en') {
    return new RegExp('(?:^|[^a-z])' + needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[^a-z]|$)', 'i').test(raw);
  }
  if (lang === 'ar') return raw.indexOf(needle) !== -1;
  // Latin, Cyrillic, and CJK grammar is structural. Fold case and accents so
  // "Menschen" and "möchte" still match the role and the act.
  const fold = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return fold(raw).indexOf(fold(needle)) !== -1;
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

function isAssistantIdentityQuestion(text) {
  return !!(
    assistantIdentityGuard &&
    typeof assistantIdentityGuard.isDirectIdentityQuestion === 'function' &&
    assistantIdentityGuard.isDirectIdentityQuestion(text)
  );
}

function isStructuralHandoffAsk(text, lang) {
  const detected = lang || detectLanguage(text);
  const grammarLang = detected === 'hinglish' ? 'hinglish' : detected;
  if (GRAMMAR[grammarLang] && grammarHit(text, grammarLang).hit) return true;
  if (detected === 'hinglish' && grammarHit(text, 'ur').hit) return true;
  if (grammarLang !== 'en' && grammarHit(text, 'en').hit) return true;
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

function isPureLiveAgentAsk(text) {
  if (isAccountNumberQuestion(text) || isAssistantIdentityQuestion(text)) return false;
  const lang = detectLanguage(text);
  if (!isStructuralHandoffAsk(text, lang) && !softEdges.clientRequestedLiveAgent(text)) return false;
  return String(text || '').trim().length > 0 && String(text || '').trim().length <= 160;
}

function isPureHandoff(text, lang) {
  const detected = lang || detectLanguage(text);
  // A non-English live-agent request is a handoff. The customer line is the
  // approved translation when one exists, otherwise the English line.
  if (detected !== 'en' && isPureLiveAgentAsk(text)) return true;
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
  if (/(?:खाता|अकाउंट|अकाउण्ट|एकाउंट|अकाउन्ट)\s*(?:संख्या|नंबर|नम्बर)/.test(s)) return true;
  if (/\b(account|acct)\b/i.test(s) && /(?<!\d)\d{5,12}(?!\d)/.test(s)) return true;
  // Number-word plus account-word, with up to three words between them
  // ("numero di conto", "número de cuenta", "numéro de compte").
  if (
    /\b(?:numer[oa]|num[eé]ro|n[uú]mero|nummer|numaras[ıi]|numer|nomor|kontonummer|rekeningnummer)\b(?:\s+\S+){0,3}\s+\b(?:conto|cuenta|compte|conta|konto|konta|account|hesap|akun|rekening|akaun)\b/i.test(
      s
    )
  ) {
    return true;
  }
  if (/\b(?:conto|cuenta|compte|conta|hesap|akun|rekening)\s+(?:numer[oa]|num[eé]ro|n[uú]mero|nummer|numaras[ıi]|numer|nomor)\b/i.test(s)) return true;
  if (/\b(?:kontonummer|rekeningnummer|hesap\s+numaras[ıi]|numer\s+konta|nomor\s+(?:akun|rekening))\b/i.test(s)) return true;
  // Turkish attaches suffixes: "hesap numaram", "hesabımın numarası".
  if (/\bhesa[bp]\p{L}{0,8}\s+(?:\S+\s+){0,3}numara/iu.test(s)) return true;
  if (/\bnumara\p{L}{0,8}\s+(?:\S+\s+){0,3}hesa[bp]/iu.test(s)) return true;
  if (/номер\s+сч[её]та|номер\s+аккаунта/.test(s)) return true;
  if (/账号|帳戶|账户|賬號/.test(s)) return true;
  if (/口座番号|アカウント番号/.test(s)) return true;
  return false;
}

// Interrogatives that mark an account reference as a question. "is" alone is
// not one: "my account number is 189143" supplies an identity, it does not ask.
const DEVANAGARI_INTERROGATIVE = /(?:^|[^\u0900-\u097F])(?:क्या|कैसे|कहाँ|कहां|कब|क्यों|कौन|किस|बताओ|बताइए|बताएं|बताना)(?:[^\u0900-\u097F]|$)/;
const HINGLISH_INTERROGATIVE = /(?:^|[^a-z0-9])(?:kya|kaise|kahan|kab|kyun|kyon|kaun|kis|batao|bataiye|bataye|batana)(?:[^a-z0-9]|$)/i;

function hasInterrogative(text) {
  const s = String(text || '');
  if (/[?؟？]/.test(s)) return true;
  if (DEVANAGARI_INTERROGATIVE.test(s)) return true;
  if (HINGLISH_INTERROGATIVE.test(s)) return true;
  if (/(?:کیا|کیسے|کہاں|کب|کیوں|کون|بتاؤ|بتائیں|بتانا)/.test(s)) return true;
  const ar = normalizeArabic(s);
  if (/(?:^|\s)(?:ما|هل|كيف|اين|متى|لماذا|اخبر|قول)(?:\s|$)/.test(ar)) return true;
  if (/\b(?:what|how|when|where|why|which|who|whose|whom)\b/i.test(s)) return true;
  if (/\b(?:qual[ei]?|quale|come|dove|quando|perch[eé]|cosa)\b/i.test(s)) return true;
  if (/\b(?:quel(?:le|s)?|comment|o[uù]|wie|wo|welche|cu[aá]l|c[oó]mo|d[oó]nde|onde|nedir|nas[ıi]l|jaki|gdzie|czy|apakah|berapa|bagaimana)\b/i.test(s)) return true;
  if (/(?:что|как|где|какой|какая|какие)/.test(s)) return true;
  if (/什么|什麼|哪|吗|嗎/.test(s)) return true;
  if (/ですか|ますか|何|どこ/.test(s)) return true;
  if (/^(?:can|could|would|will|is|are|do|does|did|should|may)\b/i.test(s.trim())) return true;
  return false;
}

function isIdentitySupply(text) {
  const s = String(text || '');
  if (!/(?<!\d)\d{5,12}(?!\d)/.test(s)) return false;
  if (/[?؟？]/.test(s) || hasInterrogative(s)) return false;
  return hasAccountNumberReference(s);
}

function isBareAccountAsk(text) {
  const s = String(text || '').trim();
  if (!s || s.length > 60) return false;
  if (/(?<!\d)\d{5,12}(?!\d)/.test(s)) return false;
  return hasAccountNumberReference(s);
}

function isAccountNumberQuestion(text) {
  if (!hasAccountNumberReference(text)) return false;
  if (isIdentitySupply(text)) return false;
  if (hasInterrogative(text)) return true;
  return isBareAccountAsk(text);
}

// Same fact as the MT5 FAQ: the account number arrives in the login email and
// is not changed in chat. No extra ask, no handoff promise.
const ACCOUNT_QUESTION_LINES = Object.freeze({
  en: 'For MT5, the account number is in the email that was sent with the trading login. Those details cannot be changed.',
  ur: 'MT5 پر اکاؤنٹ نمبر اس ای میل میں ہے جو ٹریڈنگ لاگ اِن کے ساتھ بھیجی گئی تھی۔ یہ تفصیلات تبدیل نہیں ہوتیں۔',
  ar: 'في MT5، رقم الحساب موجود في البريد الذي أُرسل مع بيانات الدخول. هذه التفاصيل لا تُغيَّر.',
  hi: 'MT5 पर खाता नंबर उस ईमेल में है जो ट्रेडिंग लॉगिन के साथ भेजी गई थी। ये विवरण बदले नहीं जाते।',
  it: "Su MT5 il numero di conto è nell'email inviata con i dati di accesso. Questi dati non si cambiano.",
  hinglish: 'MT5 par account number us email mein hai jo trading login ke sath bheji gayi thi. Yeh details change nahi hoti.',
});

function looksLikePromiseOrAsk(plain) {
  const s = String(plain || '');
  if (!s.trim()) return true;
  if (Object.values(FIXED_MESSAGES).includes(s.replace(/\s+/g, ' ').trim())) return true;
  if (/\b(i['’]?ll|i will|we['’]?ll|we will)\s+(pass|forward|send|escalate)\b/i.test(s)) return true;
  if (/\b(pass|forward)\b[^.?!]{0,40}\b(teammate|team)\b/i.test(s)) return true;
  if (/\b(please\s+share|can you send|before i pass)\b/i.test(s)) return true;
  if (/\b(share|send)\b[^.?!]{0,40}\b(account\s*number|registered\s+email)\b/i.test(s)) return true;
  return false;
}

function accountQuestionCustomerLine(text, draft) {
  const lang = detectLanguage(text);
  const plain = stripHtml(draft || '').replace(/\s+/g, ' ').trim();
  // A spread-template draft is not an account-number answer, even when the
  // customer asked for the account number in the same turn.
  if (plain.length >= 12 && !looksLikePromiseOrAsk(plain) && !isSpreadTemplateDraft(plain)) return plain;
  if (Object.prototype.hasOwnProperty.call(ACCOUNT_QUESTION_LINES, lang)) return ACCOUNT_QUESTION_LINES[lang];
  return ACCOUNT_QUESTION_LINES.en;
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
  if (lang === 'hinglish') {
    if (Object.prototype.hasOwnProperty.call(FIXED_MESSAGES, 'hinglish')) return FIXED_MESSAGES.hinglish;
    return FIXED_MESSAGES.ur;
  }
  if (Object.prototype.hasOwnProperty.call(FIXED_MESSAGES, lang)) return FIXED_MESSAGES[lang];
  return FIXED_MESSAGES.en;
}

function decide(input) {
  const src = input || {};
  const text = String(src.latestText || '');
  const parts = src.parts || [];
  const path = src.path || 'welcome';
  const lang = detectLanguage(text);
  // An account-number question is answered on the normal path. This is before
  // ownership silence and before the force flag, so recovery, missed
  // escalation, and a human assignee cannot turn it into the fixed line or
  // into silence.
  if (isAccountNumberQuestion(text)) {
    return {
      action: 'route_normal',
      route: 'normal',
      silent: false,
      reason: 'account_number_question',
      message: null,
      language: lang,
    };
  }
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
  // "Are you a bot or a real person?" asks who is replying. It is not a request
  // to be handed to a live agent.
  if (isAssistantIdentityQuestion(text)) {
    return {
      action: 'route_normal',
      route: 'normal',
      silent: false,
      reason: 'assistant_identity_question',
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
  const message = fixedMessageFor(lang);
  const language =
    lang === 'hinglish' && message === FIXED_MESSAGES.ur
      ? 'ur'
      : Object.prototype.hasOwnProperty.call(FIXED_MESSAGES, lang)
        ? lang
        : 'en';
  return {
    action: 'fixed_message',
    silent: false,
    route: null,
    reason: 'fixed_handoff',
    language,
    message,
  };
}

function responseHasErrorList(result) {
  const blobs = [];
  if (result && typeof result === 'object') blobs.push(result);
  if (result && result.data && typeof result.data === 'object') blobs.push(result.data);
  for (const blob of blobs) {
    if (String(blob.type || '') === 'error.list') return true;
    if (Array.isArray(blob.errors) && blob.errors.length) return true;
  }
  return false;
}

function resourcePartList(data) {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data.conversation_parts)) return data.conversation_parts;
  if (data.conversation_parts && Array.isArray(data.conversation_parts.conversation_parts)) {
    return data.conversation_parts.conversation_parts;
  }
  if (Array.isArray(data.parts)) return data.parts;
  return null;
}

function resourceAssigneeId(data) {
  if (!data || typeof data !== 'object') return '';
  if (data.admin_assignee_id != null && String(data.admin_assignee_id) !== '' && String(data.admin_assignee_id) !== '0') {
    return String(data.admin_assignee_id);
  }
  if (data.assignee_id != null && String(data.assignee_id) !== '' && String(data.assignee_id) !== '0') {
    return String(data.assignee_id);
  }
  const assigned = data.assigned_to || data.assignee;
  if (assigned && assigned.id != null && String(assigned.id) !== '' && String(assigned.id) !== '0') {
    return String(assigned.id);
  }
  return '';
}

// Legacy synthetic transports return an empty object or a conversation shell
// with no parts and no assignee. Those stay successful. A body that names the
// resource must actually contain it: a note part, or the expected assignee.
function expectedResourcePresent(data, expect) {
  if (!expect || !expect.kind) return true;
  if (!data || typeof data !== 'object') return true;
  if (expect.kind === 'note') {
    if (data.part_type) return String(data.part_type) === 'note';
    const list = resourcePartList(data);
    if (!list) return true;
    return list.some((part) => part && String(part.part_type || '') === 'note');
  }
  if (expect.kind === 'assignment') {
    const id = resourceAssigneeId(data);
    if (!id) return true;
    return id === String(expect.assigneeId || '');
  }
  return true;
}

function classifyAssignment(result, expect) {
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
  // HTTP 200 with an error list is a failed write. data null is ambiguous.
  // Neither is a confirmed note, assignment, or message.
  if (responseHasErrorList(result)) return { ok: false, reason: 'failed' };
  if (Object.prototype.hasOwnProperty.call(result, 'data') && result.data == null) {
    return { ok: false, reason: 'partial' };
  }
  if (expect && expectedResourcePresent(result.data, expect) === false) {
    return { ok: false, reason: 'failed' };
  }
  return { ok: true, reason: 'assigned' };
}

// Written into our escalate note. A human note with the same Account/Problem
// shape does not carry it, and does not count unless its author is this bot.
const HANDOFF_NOTE_MARKER = 'LUNA_HANDOFF_NOTE';

function noteShapeOrMarker(part) {
  if (!part || String(part.part_type || '') !== 'note') return false;
  const raw = String(part.body || '');
  if (raw.includes(HANDOFF_NOTE_MARKER)) return true;
  const body = stripHtml(raw);
  return /\bAccount\s*:/i.test(body) && /\bProblem\s*:/i.test(body);
}

// botId empty keeps the one-argument shape check used by older suites.
// When the bot id is known, the author must be that bot. A human-authored
// note with the same shape never counts; the opstore flag is separate.
function noteWrittenByThisBot(part, botId) {
  if (!noteShapeOrMarker(part)) return false;
  const id = String(botId || '');
  if (!id) return true;
  return String((part.author || {}).id || '') === id;
}

function noteAlreadyPresent(parts, botId) {
  for (const p of parts || []) {
    if (noteWrittenByThisBot(p, botId)) return true;
  }
  return false;
}

function noteInParts(parts, botId) {
  return noteAlreadyPresent(parts, botId);
}

function hasVerifiedNotePart(parts, botId) {
  return noteInParts(parts, botId);
}

function hasAssignmentPart(parts, botId) {
  return !!assigneeFromParts(parts, {}, botId);
}

function assigneeFromParts(parts, conversation, botId) {
  const bot = String(botId || '');
  let bestAt = -1;
  let bestId = '';
  for (const part of parts || []) {
    if (!part) continue;
    const pt = String(part.part_type || '');
    if (pt !== 'assignment' && pt !== 'assign') continue;
    const assigned = part.assigned_to || part.assignee || {};
    const id = String((assigned && assigned.id) || part.assignee_id || '');
    if (!id || id === '0' || id === bot) continue;
    const at = Number(part.created_at || 0);
    if (at >= bestAt) {
      bestAt = at;
      bestId = id;
    }
  }
  if (bestId) return bestId;
  void conversation;
  void bot;
  return '';
}

function fixedLineInParts(parts, message) {
  const wanted = new Set(Object.values(FIXED_MESSAGES));
  const one = String(message || '').replace(/\s+/g, ' ').trim();
  if (one) wanted.add(one);
  for (const p of parts || []) {
    if (!p || String(p.part_type || '') === 'note') continue;
    const body = stripHtml(p.body || '').replace(/\s+/g, ' ').trim();
    if (wanted.has(body)) return true;
  }
  return false;
}

/**
 * Ticket state and the write op store can both be empty on a retry. The
 * conversation parts are the record of the note, the assignment, and the one
 * customer line. A completed sequence is not run again.
 */
function reconcileFromParts(progress, parts, conversation, message, botId) {
  const out = Object.assign(blankProgress(), progress || {});
  // Only this bot's note, or an opstore record of our own write, confirms the note.
  if (progress && progress.noteConfirmed === true) {
    out.noteConfirmed = true;
    out.noteAmbiguous = false;
  } else if (noteInParts(parts, botId)) {
    out.noteConfirmed = true;
    out.noteAmbiguous = false;
  }
  const assignee = assigneeFromParts(parts, conversation, botId);
  if (assignee) {
    out.assignConfirmed = true;
    out.assignAmbiguous = false;
    if (!out.assigneeId) out.assigneeId = assignee;
  }
  if (fixedLineInParts(parts, message) || messageAlreadyPresent(parts, message, '')) {
    out.messageSent = true;
    out.messageAmbiguous = false;
  }
  return out;
}

function storesLookLost(saved) {
  if (!saved || typeof saved !== 'object') return true;
  return (
    !saved.noteConfirmed &&
    !saved.assignConfirmed &&
    !saved.messageSent &&
    !saved.noteAmbiguous &&
    !saved.assignAmbiguous &&
    !saved.messageAmbiguous
  );
}

function humanPublicComment(parts, opts) {
  for (const part of parts || []) {
    if (!part || String(part.part_type || '') !== 'comment') continue;
    if (teammateHandoffGates.isHumanTeammatePublicReply(part, opts)) return true;
  }
  return false;
}

function foreignHumanOwns(conversation, handoffAssigneeId, botId, opts) {
  const id = conversation && conversation.admin_assignee_id != null ? String(conversation.admin_assignee_id) : '';
  if (!id || id === '0') return false;
  if (botId && id === String(botId)) return false;
  if (opts && (id === String(opts.arsalId || '') || id === String(opts.eliteAiId || ''))) return false;
  if (handoffAssigneeId && id === String(handoffAssigneeId)) return false;
  return true;
}

function fixedLineAlreadyPublic(progress, parts) {
  if (progress && progress.messageSent) return true;
  return fixedLineInParts(parts, '');
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
    phase: '',
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
  Object.assign(
    progress,
    reconcileFromParts(progress, src.parts, src.conversation, message, src.botId)
  );
  // A stored "confirmed" flag is not enough after the conversation parts are
  // gone. Replay rewrites the note and the assignment, then posts the fixed
  // line only when those writes validate. An ambiguous hold is left alone.
  const expectedAssignee = String(src.assigneeId || progress.assigneeId || '');
  const partsNote = noteInParts(src.parts, src.botId);
  const partsAssignee = assigneeFromParts(src.parts, src.conversation, src.botId);
  const partsAssignOk = !!(expectedAssignee && partsAssignee && partsAssignee === expectedAssignee);
  const seatHeld = assignmentAlreadyHeld(src.conversation, expectedAssignee);
  if (
    progress.noteConfirmed === true &&
    progress.assignConfirmed === true &&
    !progress.messageSent &&
    !progress.noteAmbiguous &&
    !progress.assignAmbiguous &&
    !progress.messageAmbiguous &&
    !partsNote &&
    !partsAssignOk &&
    !seatHeld
  ) {
    progress.noteConfirmed = false;
    progress.assignConfirmed = false;
    progress.phase = '';
  }
  // The note part was removed after the assignment stuck. The stored flag is
  // not the note. Rewrite it, then post the fixed line once. An assignment that
  // is not on the seat yet keeps the flag so a pending retry does not add a
  // second note, and an ambiguous hold still makes no calls.
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
    progress.phase = 'completed';
    progress.assigneeId = String(src.assigneeId || progress.assigneeId || '');
    return finish({
      ok: true,
      reason: 'already_sent',
      setAwaiting: true,
      duplicate: true,
      progress,
    });
  }

  // A note is confirmed only after this write succeeds, or when a real note
  // part is already in the conversation. A partial or failed write is never
  // stored as confirmed. A comment that mentions Account and Problem is not a note.
  const verifiedNote = noteInParts(src.parts, src.botId) || noteAlreadyPresent(src.parts, src.botId);
  if (
    !verifiedNote &&
    progress.noteConfirmed === true &&
    !progress.noteAmbiguous &&
    !progress.assignAmbiguous &&
    !progress.messageAmbiguous &&
    (partsAssignOk || assignmentAlreadyHeld(src.conversation, src.assigneeId || progress.assigneeId))
  ) {
    progress.noteConfirmed = false;
  }
  let noteOk = verifiedNote || progress.noteConfirmed === true;
  let wroteNote = false;
  let wroteAssign = false;
  if (!verifiedNote && !progress.noteConfirmed) {
    if (progress.noteAmbiguous) {
      progress.noteConfirmed = false;
      return finish({ reason: 'note_ambiguous_held', withhold: true, progress });
    }
    const noteRes = await transport.postNote(redactCredentials(src.noteHtml || ''));
    const noteClass = classifyAssignment(noteRes, { kind: 'note' });
    if (!noteClass.ok) {
      progress.noteConfirmed = false;
      if (ambiguousWrite(noteClass.reason)) progress.noteAmbiguous = true;
      return finish({ reason: 'note_' + noteClass.reason, withhold: true, progress });
    }
    noteOk = true;
    wroteNote = true;
  }
  if (!noteOk) {
    progress.noteConfirmed = false;
    return finish({ reason: 'note_unverified', withhold: true, progress });
  }
  progress.noteConfirmed = true;
  progress.noteAmbiguous = false;
  progress.assigneeId = String(src.assigneeId || progress.assigneeId || '');

  // Stored assignment confirmation without the assignment part, and without the
  // seat already on the conversation, is not confirmed. Write it again.
  if (
    progress.assignConfirmed === true &&
    !partsAssignOk &&
    !assignmentAlreadyHeld(src.conversation, progress.assigneeId) &&
    !progress.assignAmbiguous
  ) {
    progress.assignConfirmed = false;
  }

  if (!progress.assignConfirmed && !assignmentAlreadyHeld(src.conversation, progress.assigneeId)) {
    // A 422 is definite and is retried. An ambiguous 500/timeout/partial is not.
    if (progress.assignAmbiguous) {
      return finish({ reason: 'assign_ambiguous_held', withhold: true, progress });
    }
    const asgRes = await transport.assign(progress.assigneeId);
    const asgClass = classifyAssignment(asgRes, { kind: 'assignment', assigneeId: progress.assigneeId });
    if (!asgClass.ok) {
      if (ambiguousWrite(asgClass.reason)) progress.assignAmbiguous = true;
      else progress.phase = 'assignment-pending';
      return finish({ reason: 'assign_' + asgClass.reason, withhold: true, progress });
    }
    wroteAssign = true;
  }
  progress.assignConfirmed = true;
  progress.assignAmbiguous = false;
  if (progress.phase === 'assignment-pending') progress.phase = '';

  if (progress.messageAmbiguous && !messageAlreadyPresent(src.parts, message, src.botId)) {
    return finish({ reason: 'message_ambiguous_held', withhold: true, progress });
  }
  // The fixed line is posted only when the note and the assignment are in the
  // parts, were just written and validated, or the seat is already held.
  const noteVerified = partsNote || wroteNote || progress.noteConfirmed === true;
  const assignVerified =
    partsAssignOk || wroteAssign || assignmentAlreadyHeld(src.conversation, progress.assigneeId);
  if (!noteVerified || !assignVerified) {
    progress.messageSent = false;
    return finish({ reason: 'unverified_before_message', withhold: true, progress });
  }
  const msgRes = await transport.postMessage(message);
  const msgClass = classifyAssignment(msgRes, { kind: 'message' });
  if (!msgClass.ok) {
    if (ambiguousWrite(msgClass.reason)) progress.messageAmbiguous = true;
    return finish({ reason: 'message_' + msgClass.reason, withhold: true, progress });
  }
  progress.messageSent = true;
  progress.phase = 'completed';
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

const APPROVED_NUMBER_HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";

function isTerminalHedge(text) {
  return String(text || '').replace(/\s+/g, ' ').trim() === APPROVED_NUMBER_HEDGE;
}

// An internal note is not an answer. Only a public customer-facing reply is.
/**
 * Public reply on a human-assigned thread.
 * The authenticated owner's verbatim dictated body may be posted as an owner
 * command. Luna-generated or templated text must not be posted. An empty or
 * unparsable owner body posts nothing.
 */
function ownerAdminIdSet(opts) {
  const o = opts || {};
  const ids = new Set();
  const list = Array.isArray(o.ownerAdminIds) ? o.ownerAdminIds.slice() : [];
  if (o.ownerAdminId != null) list.push(o.ownerAdminId);
  for (const id of list) {
    if (id != null && String(id) !== '') ids.add(String(id));
  }
  return ids;
}

/**
 * An owner command is an internal note whose author.type is admin and whose
 * author.id is a configured owner admin id. A customer (author.type user),
 * a matching name, or a matching email is not the owner. Fail closed.
 */
function authenticatedOwnerCommand(part, opts) {
  const author = (part && part.author) || {};
  const authorType = String(author.type || (part && part.author_type) || '').toLowerCase();
  const authorId = String(author.id || '');
  const partType = String((part && part.part_type) || '');
  const typeOk = authorType === 'admin';
  const idOk = !!authorId && ownerAdminIdSet(opts).has(authorId);
  const channelOk = partType === 'note';
  const ok = typeOk && idOk && channelOk;
  let reason = 'owner-command';
  if (!typeOk) reason = 'owner-auth-type';
  else if (!idOk) reason = 'owner-auth-id';
  else if (!channelOk) reason = 'owner-auth-channel';
  return { ok, post: ok, reason, authorType, authorId };
}

const STATUS_PING_CLARIFY = "I don't have an open update on this conversation. What would you like me to check?";

function hasPendingHandoffCase(state) {
  const st = state || {};
  if (st.escalateAwaitingFirstTeammate) return true;
  if (st.lastEscalateAt) return true;
  const prog = st.fixedHandoff;
  if (!prog || typeof prog !== 'object') return false;
  if (prog.phase === 'assignment-pending') return true;
  if (prog.noteConfirmed && !prog.messageSent) return true;
  if (prog.assignAmbiguous || prog.noteAmbiguous || prog.messageAmbiguous) return true;
  return false;
}

function plainFaqCustomerLine(text) {
  const q = String(text || '');
  let title = '';
  try {
    const faq = require('./faq-kb');
    const articles = faq && typeof faq.getArticles === 'function' ? faq.getArticles() : [];
    const tokens = q.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
    let best = 0;
    for (const article of articles) {
      const hay = String((article && article.title) || '').toLowerCase();
      let score = 0;
      for (const token of tokens) if (hay.includes(token)) score += 1;
      if (score > best) {
        best = score;
        title = String(article.title || '').split(' , ')[0].trim();
      }
    }
    if (best < 2) title = '';
  } catch (_) {
    title = '';
  }
  if (title && !/team will review/i.test(title) && !Object.values(FIXED_MESSAGES).includes(title)) {
    return 'The FAQ article "' + title + '" covers this. Which challenge is the question about?';
  }
  return 'Which challenge is this question about? I can quote that rule from the FAQ.';
}

function promisesTeamReview(text) {
  return /\b(?:our\s+|the\s+)?team\s+will\s+review\b/i.test(String(text || ''));
}

function faqTeamReviewBlocked(clientText, draft) {
  if (!promisesTeamReview(draft)) return false;
  const client = String(clientText || '');
  if (isPureLiveAgentAsk(client) || isStructuralHandoffAsk(client)) return false;
  if (/\bmy\s+(?:payout|withdrawal)\s+(?:was|is|got)\b/i.test(client)) return false;
  try {
    const ero = require('./escalateRelatedOnly');
    if (ero && typeof ero.isClearKbFaqAsk === 'function' && ero.isClearKbFaqAsk(client)) return true;
  } catch (_) {
    /* FAQ detector unavailable */
  }
  return /\b(?:daily\s+loss|drawdown|profit\s+target|leverage)\b/i.test(client) && /\b(?:what|how|is|are)\b/i.test(client);
}

function ownerPublicReplyDecision(opts) {
  const o = opts || {};
  const body = String(o.body == null ? '' : o.body).replace(/\s+/g, ' ').trim();
  if (o.humanAssigned && o.authenticated === false) {
    return { applies: true, post: false, verbatim: false, body: '', reason: 'owner-auth-failed' };
  }
  if (!o.humanAssigned) {
    return { applies: false, post: true, verbatim: false, body, reason: 'not-human-assigned' };
  }
  if (o.parsable === false || !body) {
    return { applies: true, post: false, verbatim: false, body: '', reason: 'owner-body-empty' };
  }
  if (!o.verbatim) {
    return { applies: true, post: false, verbatim: false, body: '', reason: 'generated-on-human-thread' };
  }
  return { applies: true, post: true, verbatim: true, body, reason: 'owner-command' };
}

function isLegitimateClarification(text) {
  const q = String(text || '').replace(/\s+/g, ' ').trim();
  if (!q || q.length > 220) return false;
  if (/\d/.test(q)) return false;
  if (/\bteam\s+will\s+review\b/i.test(q)) return false;
  if (q === APPROVED_NUMBER_HEDGE) return false;
  return /\bplease tell me which challenge you mean\b/i.test(q)
    || /\bwhich challenge (?:do )?you mean\b/i.test(q);
}

function partsWithoutOwnAssignment(parts, assigneeId) {
  const id = String(assigneeId || '');
  if (!id) return parts || [];
  return (parts || []).filter((part) => {
    if (!part) return false;
    const pt = String(part.part_type || '');
    if (pt !== 'assignment' && pt !== 'assign') return true;
    const assigned = part.assigned_to || part.assignee || {};
    const target = String((assigned && assigned.id) || part.assignee_id || '');
    return target !== id;
  });
}

/**
 * The note is gone and the ticket progress may be gone, but the op record says
 * Luna assigned this handoff. That seat is not a human owner. Resume when the
 * assignment is still the current seat, or hold when it is not verified.
 * A different human, an ambiguous write, or a line that is already public does
 * not resume and does not post again.
 */
function resumeLostHandoff(opts) {
  const o = opts || {};
  const progress = Object.assign(blankProgress(), o.progress || {});
  const op = o.opRecord || null;
  const botId = String(o.botId || '');
  const parts = o.parts || [];
  const conversation = o.conversation || {};
  const empty = { resume: false, hold: false, reason: '', assigneeId: '', handoffAssigneeId: '' };
  if (progress.messageSent || fixedLineAlreadyPublic(progress, parts)) {
    return Object.assign({}, empty, { reason: 'already_sent' });
  }
  if (progress.assignAmbiguous || progress.noteAmbiguous || progress.messageAmbiguous) {
    return Object.assign({}, empty, { reason: 'ambiguous_held' });
  }
  const opAssignee = op && op.status === 'confirmed' && op.kind === 'assignment' && String(op.madeBy || '') === botId
    ? String(op.assigneeId || '')
    : '';
  const assigneeId = opAssignee || String(progress.assigneeId || '');
  if (!assigneeId) return Object.assign({}, empty, { reason: 'no_op_record' });
  const notePresent = noteInParts(parts, botId);
  if (notePresent && progress.noteConfirmed === true) {
    return {
      resume: false,
      hold: false,
      reason: 'note_still_present',
      assigneeId,
      handoffAssigneeId: assigneeId,
    };
  }
  const current = conversation.admin_assignee_id != null ? String(conversation.admin_assignee_id) : '';
  const partsAssignee = assigneeFromParts(parts, conversation, botId);
  const verified = current === assigneeId || partsAssignee === assigneeId;
  if (!verified) {
    const otherHuman = current && current !== '0' && current !== botId && current !== assigneeId;
    if (otherHuman) return Object.assign({}, empty, { reason: 'foreign_owner' });
    return {
      resume: true,
      hold: true,
      reason: 'assignment_unverified',
      assigneeId,
      handoffAssigneeId: '',
    };
  }
  return {
    resume: true,
    hold: false,
    reason: 'op_assignment',
    assigneeId,
    handoffAssigneeId: assigneeId,
  };
}

function isPublicCustomerReply(part) {
  if (!part) return false;
  const pt = String(part.part_type || '');
  if (pt === 'note' || pt === 'assignment' || pt === 'assign' || pt === 'open' || pt === 'close') return false;
  return !!stripHtml(part.body || '');
}

module.exports = {
  STATUS,
  FIXED_MESSAGES,
  redactCredentials,
  prepareNoteForEnglishPrompt,
  detectLanguage,
  isStructuralHandoffAsk,
  isAccountNumberQuestion,
  isAssistantIdentityQuestion,
  isPureLiveAgentAsk,
  isExactAllowedTemplate,
  isTerminalHedge,
  isLegitimateClarification,
  isPublicCustomerReply,
  partsWithoutOwnAssignment,
  resumeLostHandoff,
  isSpreadTemplateDraft,
  HANDOFF_NOTE_MARKER,
  hasVerifiedNotePart,
  noteWrittenByThisBot,
  authenticatedOwnerCommand,
  ownerPublicReplyDecision,
  STATUS_PING_CLARIFY,
  hasPendingHandoffCase,
  plainFaqCustomerLine,
  faqTeamReviewBlocked,
  hasAssignmentPart,
  fixedMessageFor,
  accountQuestionCustomerLine,
  ACCOUNT_QUESTION_LINES,
  reconcileFromParts,
  storesLookLost,
  humanPublicComment,
  foreignHumanOwns,
  fixedLineAlreadyPublic,
  decide,
  classifyAssignment,
  progressForTurn,
  commit,
};
