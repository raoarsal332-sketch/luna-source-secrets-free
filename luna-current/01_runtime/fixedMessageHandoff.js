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

const fs = require('fs');
const path = require('path');
const softEdges = require('./softEdges');
const teammateHandoffGates = require('./teammateHandoffGates');
const writeOpStore = require('./writeOpStore');

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

const SHARED_SOUTH_ASIAN = ['mujhe', 'kya', 'chahiye', 'chahie', 'aap', 'mera', 'meri', 'nahi', 'nahin', 'baat', 'karo', 'karna', 'milao', 'jodo'];

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
  it: {
    roles: ['operatore', 'agente', 'umano', 'umana', 'persona', 'collega'],
    acts: ['parlare', 'voglio', 'vorrei', 'collegare', 'trasferire'],
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
  const plain = original.replace(/\s+/g, ' ').trim();
  if (plain === PASSWORD_POLICY_CLARIFIER || plain === CHALLENGE_CLARIFIER) return plain;
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

const MORPH_LANGS = new Set(['ur', 'ar', 'hi']);

function scriptWords(text) {
  return String(text || '').match(/[\p{L}\p{M}]+/gu) || [];
}

// Suffix stem for Urdu and Arabic. Inflections such as the Urdu oblique and
// plural of a role share one stem with the lexicon form. The lexicon itself
// stays the base form; inflected spellings are not added to it.
function stemArabicScript(word, lang) {
  let s = normalizeArabic(word);
  if (!s) return '';
  s = s.replace(/\u06BA/g, '\u0646');
  if (lang === 'ar' && s.startsWith('\u0627\u0644') && s.length - 2 >= 3) s = s.slice(2);
  const suffixes = ['\u0648\u0646', '\u064A\u0646', '\u0627\u062A', '\u0627\u0646', '\u06D2', '\u06C1', '\u06BE', '\u0647'];
  for (let n = 0; n < 4; n += 1) {
    let stripped = false;
    for (const suf of suffixes) {
      if (s.endsWith(suf) && s.length - suf.length >= 3) {
        s = s.slice(0, -suf.length);
        stripped = true;
        break;
      }
    }
    if (!stripped) break;
  }
  s = s.replace(/[\u0626\u06CC\u06D2]/g, '\u064A');
  if (lang === 'ar') {
    // Object clitics and the accusative alef left after tanween is removed.
    // The lexicon stays the base noun; these endings are not added to it.
    const clitics = ['\u0646\u064A', '\u0646\u0627', '\u0643\u0645', '\u0643\u0646', '\u0647\u0627', '\u0647\u0645', '\u0647\u0646'];
    for (const cl of clitics) {
      if (s.endsWith(cl) && s.length - cl.length >= 3) {
        s = s.slice(0, -cl.length);
        break;
      }
    }
    if ((s.endsWith('\u0643') || s.endsWith('\u0647')) && s.length - 1 >= 3) s = s.slice(0, -1);
    if (s.endsWith('\u0627') && s.length - 1 >= 3) s = s.slice(0, -1);
  }
  return s;
}

function stemHindi(word) {
  let s = String(word || '');
  if (!s) return '';
  // यों / याँ are the plural endings added after the stem, including after a
  // vowel sign that belongs to the lexicon form. ों and ें are the shorter ones.
  const suffixes = ['\u092F\u094B\u0902', '\u092F\u093E\u0902', '\u092F\u093E\u0901', '\u094B\u0902', '\u0947\u0902', '\u094B', '\u0947'];
  for (let n = 0; n < 3; n += 1) {
    let stripped = false;
    for (const suf of suffixes) {
      if (s.endsWith(suf) && s.length - suf.length >= 3) {
        s = s.slice(0, -suf.length);
        stripped = true;
        break;
      }
    }
    if (!stripped) break;
  }
  return s;
}

function stemFor(word, lang) {
  if (lang === 'hi') return stemHindi(word);
  if (lang === 'ur' || lang === 'ar') return stemArabicScript(word, lang);
  return String(word || '');
}

function stemKeys(word, lang) {
  const stem = stemFor(word, lang);
  if (!stem) return [];
  const keys = [stem];
  if (lang !== 'ar') return keys;
  // اوصل and وصل share one key once a single leading alef is set aside.
  if (stem.charAt(0) === '\u0627' && stem.length - 1 >= 3) keys.push(stem.slice(1));
  // A broken plural such as the hamza form of شخص keeps an internal alef.
  const bare = stem.replace(/\u0627/g, '');
  if (bare.length >= 3 && bare !== stem) keys.push(bare);
  return keys;
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

// Roman Urdu function words. These outweigh English fillers (please, sir, hi)
// so a mixed line such as "janab please mujhe agent chahiye" stays Urdu.
const ROMAN_URDU_CUES = ['mujhe', 'chahiye', 'hai', 'karna', 'baat', 'kisi', 'se', 'ko', 'ka'];
const ENGLISH_FILLER = ['please', 'sir', 'hi'];

function detectLatinLanguage(text) {
  const scores = {};
  for (const lang of Object.keys(LATIN_MARKERS)) scores[lang] = scoreWords(text, LATIN_MARKERS[lang]);
  const south = scoreWords(text, SHARED_SOUTH_ASIAN);
  if (scoreWords(text, ROMAN_URDU_CUES) > 0) {
    scores.en = Math.max(0, (scores.en || 0) - scoreWords(text, ENGLISH_FILLER));
  }
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
  // A Hindi courtesy word in Latin script (kripya) does not select the Hindi
  // line when Roman Urdu grammar is present. Devanagari is what selects Hindi.
  // The locked line stays the Roman Urdu / Hinglish line.
  if (best === 'hi' && scoreWords(text, ROMAN_URDU_CUES) > 0 && (scores.ur || 0) === 0) return 'hinglish';
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
    // Urdu words such as بات and آدمی share the Arabic script and have no
    // Urdu-only letter. Those lexical cues select the Urdu line.
    if (hasUrduLexicalCue(s)) return 'ur';
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

// R11 floor. Arabic is normalized substring. Urdu, Hindi, and the other
// non-English grammars are folded substring. English stays a whole word.
// Stem matching is added on top of this. It does not replace it.
function legacyContainsToken(text, token, lang) {
  const raw = lang === 'ar' ? normalizeArabic(text) : String(text || '');
  const needle = lang === 'ar' ? normalizeArabic(token) : String(token || '');
  if (!needle) return false;
  if (lang === 'en') {
    return new RegExp('(?:^|[^a-z])' + needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[^a-z]|$)', 'i').test(raw);
  }
  if (lang === 'ar') return raw.indexOf(needle) !== -1;
  const fold = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return fold(raw).indexOf(fold(needle)) !== -1;
}

function stemContainsToken(text, token, lang) {
  if (!MORPH_LANGS.has(lang)) return false;
  const needles = stemKeys(token, lang);
  if (!needles.length) return false;
  const raw = lang === 'ar' ? normalizeArabic(text) : String(text || '');
  const set = new Set(needles);
  for (const word of scriptWords(raw)) {
    for (const key of stemKeys(word, lang)) {
      if (set.has(key)) return true;
    }
  }
  return false;
}

function containsToken(text, token, lang) {
  if (legacyContainsToken(text, token, lang)) return true;
  return stemContainsToken(text, token, lang);
}

const URDU_LEXICAL = Object.freeze(['ایجنٹ', 'بندہ', 'نمائندہ', 'آدمی', 'چاہیے', 'چاہتا', 'چاہتی', 'بات', 'ملاؤ', 'جوڑو', 'منتقل']);

function hasUrduLexicalCue(text) {
  for (const word of URDU_LEXICAL) {
    if (containsToken(text, word, 'ur')) return true;
  }
  return false;
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
  // A role word is enough. A trailing secret used to push the ask past 24
  // characters and hide it. Detection runs on the text with that secret removed.
  const shortRole = roles > 0 && compact.length > 0;
  return { hit: (roles > 0 && acts > 0) || shortRole, roles, acts };
}

function isAssistantIdentityQuestion(text) {
  return !!(
    assistantIdentityGuard &&
    typeof assistantIdentityGuard.isDirectIdentityQuestion === 'function' &&
    assistantIdentityGuard.isDirectIdentityQuestion(text)
  );
}

function arabicScriptGrammarHit(text) {
  const ur = grammarHit(text, 'ur');
  const ar = grammarHit(text, 'ar');
  const roles = ur.roles + ar.roles;
  const acts = ur.acts + ar.acts;
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  const shortRole = roles > 0 && compact.length > 0;
  return (roles > 0 && acts > 0) || shortRole;
}

// Latin role words written inside Devanagari or Arabic script. The locked-line
// language comes from that script, not from the Latin word.
const LATIN_EMBEDDED_ROLE = /\b(?:agent|human|staff|banda|insaan|representative)\b|\bsupport\s+person\b/i;

function embeddedLatinRole(text) {
  const s = String(text || '');
  if (!/[\u0900-\u097F\u0600-\u06FF]/.test(s)) return false;
  return LATIN_EMBEDDED_ROLE.test(s);
}

function scriptOf(text) {
  const s = String(text || '');
  const deva = (s.match(/[\u0900-\u097F]/g) || []).length;
  const arab = (s.match(/[\u0600-\u06FF]/g) || []).length;
  if (deva === 0 && arab === 0) return '';
  if (deva > 0 && deva >= arab) return 'hi';
  if (countMatches(URDU_ONLY, s) > 0 && countMatches(URDU_ONLY, s) >= countMatches(ARABIC_ONLY, s)) return 'ur';
  if (hasUrduLexicalCue(s)) return 'ur';
  return 'ar';
}

// "kisi" is an indefinite person, not a short role. It is a handoff only
// together with the talk act "baat" (kisi se baat). A bare "kisi" is not.
function romanSomeoneTalk(text) {
  const s = String(text || '');
  if (/[\u0900-\u097F\u0600-\u06FF]/.test(s)) return false;
  const someone = /(?:^|[^a-z])kisi(?:[^a-z]|$)/i.test(s);
  const talk = /(?:^|[^a-z])baat(?:[^a-z]|$)/i.test(s);
  return someone && talk;
}

function romanHinglishHandoff(text) {
  const s = String(text || '');
  if (/[\u0900-\u097F\u0600-\u06FF]/.test(s)) return false;
  const g = grammarHit(s, 'hinglish');
  if (g.roles > 0 && g.acts > 0) return true;
  return romanSomeoneTalk(s);
}

function isStructuralHandoffAsk(text, lang) {
  const detected = lang || detectLanguage(text);
  const grammarLang = detected === 'hinglish' ? 'hinglish' : detected;
  if (/[\u0600-\u06FF]/.test(String(text || '')) && arabicScriptGrammarHit(text)) return true;
  if (embeddedLatinRole(text) || romanHinglishHandoff(text)) return true;
  if (GRAMMAR[grammarLang] && grammarHit(text, grammarLang).hit) return true;
  if (detected === 'hinglish' && grammarHit(text, 'ur').hit) return true;
  if (grammarLang !== 'en' && grammarHit(text, 'en').hit) return true;
  return softEdges.clientRequestedLiveAgent(text) || softEdges.finHandoffPhrase(text);
}

function stripHandoffTokens(text, lang) {
  let t = String(text || '');
  const g = GRAMMAR[lang] || GRAMMAR.en;
  const pool = g.roles.concat(g.acts);
  if (MORPH_LANGS.has(lang)) {
    const stems = new Set();
    for (const item of pool) {
      for (const key of stemKeys(item, lang)) stems.add(key);
    }
    const kept = [];
    for (const word of scriptWords(t)) {
      const keys = stemKeys(word, lang);
      if (keys.some((key) => stems.has(key))) continue;
      if (pool.some((item) => legacyContainsToken(word, item, lang))) continue;
      kept.push(word);
    }
    t = kept.join(' ');
    if (lang === 'ar') {
      let norm = normalizeArabic(t);
      for (const w of pool) {
        const needle = normalizeArabic(w);
        if (needle) norm = norm.split(needle).join(' ');
      }
      t = norm;
    } else {
      for (const w of pool) {
        if (w) t = t.split(w).join(' ');
      }
    }
  } else {
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

// A long Latin token beside Devanagari or Arabic is noise (an unlabeled
// secret, a mixed-case value). Ordinary short words such as "agent" stay,
// so a Hindi request can still name the role in Latin letters.
function stripLatinNoise(text) {
  const s = String(text || '');
  if (!/[\u0900-\u097F\u0600-\u06FF]/.test(s)) return s;
  return s.replace(/[A-Za-z0-9][A-Za-z0-9._%+-]{5,}/g, (token) => {
    const letters = token.replace(/[^A-Za-z]/g, '');
    const hasDigit = /\d/.test(token);
    const mixed = /[A-Z]/.test(token) && /[a-z]/.test(token);
    if ((hasDigit && token.length >= 6) || (mixed && token.length >= 8) || letters.length >= 12) return ' ';
    return token;
  });
}

// Credential text is not part of the ask. A password attached to a human
// request must not turn the request into a normal model reply.
function stripUnlabeledSecretTokens(text) {
  return String(text || '').replace(/[A-Za-z0-9]{8,}/g, (token) => {
    if (/[A-Za-z]/.test(token) && /\d/.test(token)) return ' ';
    return token;
  });
}

// Order ids (FE10482931), MT5 logins, and account-prefixed logins are not secrets.
// A token is structural when it is digits, an MT5 login, an account prefix
// (login, acct, account, mt5, mt4, id, user, no) of any length plus the digits
// glued to it, or a short letter prefix followed by a digit run. High-entropy
// secrets mix a letter into the digit run, or use a longer prefix that is not
// an account label.
function isStructuralId(token) {
  const t = String(token || '');
  if (/^\d{4,}$/.test(t)) return true;
  if (/^MT5\d{4,}$/i.test(t)) return true;
  if (/^(?:login|account|acct|mt5|mt4|user|id|no)\d+$/i.test(t)) return true;
  if (/^[A-Za-z]{1,6}\d{5,}$/.test(t)) return true;
  return false;
}

function isUnlabeledSecret(token) {
  const t = String(token || '');
  if (!/^[A-Za-z0-9]{8,}$/.test(t)) return false;
  if (!/[A-Za-z]/.test(t) || !/\d/.test(t)) return false;
  if (isStructuralId(t)) return false;
  return true;
}

// Exact secret values seen in customer inbound text. Outbound bodies replace
// these strings and nothing chosen by shape. The set is values only.
const inboundSecretValues = new Set();

function rememberExactValue(raw) {
  let v = String(raw || '').trim();
  if (v.startsWith('{') && v.endsWith('}')) v = v.slice(1, -1).trim();
  const tagged = v.match(/^<b>\s*([\s\S]*?)\s*<\/b>$/i);
  if (tagged) v = tagged[1].trim();
  v = v.replace(/^[`"'\u2018\u2019\u201C\u201D]+|[`"'\u2018\u2019\u201C\u201D]+$/g, '').trim();
  v = v.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
  if (!v || v.length < 4 || v.length > 120 || /^\[secret\]$/i.test(v)) return;
  if (isStructuralId(v) || /^\d{4,}$/.test(v)) return;
  if (/\s/.test(v)) {
    if (!/\d/.test(v) && !/[^\p{L}\p{N}\s]/u.test(v)) return;
  } else if (!/\d/.test(v) && !/[^\p{L}\p{N}]/u.test(v)) {
    const mixed = /[A-Z]/.test(v) && /[a-z]/.test(v);
    if (!(mixed && v.length >= 8) && v.length < 16) return;
  }
  inboundSecretValues.add(v);
}

function declaredSecretPath() {
  if (process.env.LUNA_DECLARED_SECRET_FILE) return process.env.LUNA_DECLARED_SECRET_FILE;
  if (process.env.LUNA_OP_STORE_FILE) {
    return path.join(path.dirname(process.env.LUNA_OP_STORE_FILE), 'luna-declared-secrets.json');
  }
  if (process.env.LUNA_CONTROL_STATE_FILE) {
    return path.join(path.dirname(process.env.LUNA_CONTROL_STATE_FILE), 'luna-declared-secrets.json');
  }
  return path.join('/tmp', 'luna-declared-secrets.json');
}

function cleanDeclaredValue(raw) {
  let v = String(raw || '').trim();
  if (v.startsWith('{') && v.endsWith('}')) v = v.slice(1, -1).trim();
  const tagged = v.match(/^<b>\s*([\s\S]*?)\s*<\/b>$/i);
  if (tagged) v = tagged[1].trim();
  v = v.replace(/^[`"'\u2018\u2019\u201C\u201D]+|[`"'\u2018\u2019\u201C\u201D]+$/g, '').trim();
  v = v.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
  if (!v || v.length < 4 || v.length > 120 || /^\[secret\]$/i.test(v)) return '';
  return v;
}

function readDeclaredSecrets() {
  try {
    const parsed = JSON.parse(fs.readFileSync(declaredSecretPath(), 'utf8'));
    const labeled = Array.isArray(parsed && parsed.labeled) ? parsed.labeled.map((v) => String(v)) : [];
    const unlabeled = Array.isArray(parsed && parsed.unlabeled) ? parsed.unlabeled.map((v) => String(v)) : [];
    return { labeled, unlabeled };
  } catch (_) {
    return { labeled: [], unlabeled: [] };
  }
}

function writeDeclaredSecrets(data) {
  const file = declaredSecretPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify({
    labeled: [...new Set(data.labeled || [])],
    unlabeled: [...new Set(data.unlabeled || [])],
  }));
  fs.renameSync(tmp, file);
}

// A labeled secret, including one that looks like an order id, has to survive
// a process restart. The shared sanitizer's memory does not. Unlabeled
// structural ids are not stored.
function persistDeclaredValue(kind, raw) {
  const value = cleanDeclaredValue(raw);
  if (!value) return;
  if (kind === 'unlabeled' && (isStructuralId(value) || !isUnlabeledSecret(value))) return;
  const data = readDeclaredSecrets();
  const bucket = kind === 'labeled' ? data.labeled : data.unlabeled;
  if (bucket.includes(value)) return;
  bucket.push(value);
  writeDeclaredSecrets(data);
}

function hydrateDeclaredSecrets() {
  const data = readDeclaredSecrets();
  for (const value of data.labeled) {
    if (!cleanDeclaredValue(value)) continue;
    if (credentialSanitizer && typeof credentialSanitizer.sanitizeCredentials === 'function') {
      credentialSanitizer.sanitizeCredentials('pin: ' + value);
    }
  }
  for (const value of data.unlabeled) {
    if (!value || isStructuralId(value)) continue;
    inboundSecretValues.add(value);
  }
}

// Labeled values use the shared sanitizer's one regex. Unlabeled values are
// high-entropy letter-and-digit tokens from this customer text. Structural ids
// are never stored, so a later exact replacement cannot eat an order id.
function rememberInboundSecrets(text) {
  const original = String(text == null ? '' : text);
  if (!original) return;
  if (credentialSanitizer && typeof credentialSanitizer.labeledCredentialValues === 'function') {
    for (const value of credentialSanitizer.labeledCredentialValues(original)) {
      rememberExactValue(value);
      persistDeclaredValue('labeled', value);
    }
  } else if (credentialSanitizer && credentialSanitizer.CREDENTIAL_VALUE_RE) {
    const re = new RegExp(credentialSanitizer.CREDENTIAL_VALUE_RE.source, 'giu');
    let labeled;
    while ((labeled = re.exec(original))) {
      rememberExactValue(labeled[3]);
      persistDeclaredValue('labeled', labeled[3]);
    }
  }
  const tokens = original.match(/[A-Za-z0-9]{8,}/g) || [];
  for (const token of tokens) {
    if (isUnlabeledSecret(token)) {
      inboundSecretValues.add(token);
      persistDeclaredValue('unlabeled', token);
    }
  }
}

function replaceExactSecretValues(text) {
  const original = String(text == null ? '' : text);
  if (isExactAllowedTemplate(original)) return original;
  const secrets = [...inboundSecretValues].filter((s) => s && s.length >= 4 && !isStructuralId(s));
  secrets.sort((a, b) => b.length - a.length);
  let out = original;
  for (const secret of secrets) {
    if (out.includes(secret)) out = out.split(secret).join('[secret]');
  }
  return out;
}

// Prompt-side sanitizer for customer text only. Shape matching stays here, and
// it skips order ids, receipt-url tokens, and MT5 logins.
function redactUnlabeledSecrets(text) {
  const original = String(text == null ? '' : text);
  if (isExactAllowedTemplate(original)) return original;
  rememberInboundSecrets(original);
  return original.replace(/[A-Za-z0-9]{8,}/g, (token) => (isUnlabeledSecret(token) ? '[secret]' : token));
}

// One history line at a time. The shared sanitizer treats a receipt path that
// appears twice in one string as a repeated token and then remembers the order
// id. A path on its own line is not a secret. Customer lines still get the
// prompt-side unlabeled scrub. Other lines lose only exact customer values.
function scrubPromptHistory(raw, keptCredentialLine) {
  // keptCredentialLine is the shared sanitizer applied to one history line.
  // The call stays at the prompt site. The line is already covered below.
  void keptCredentialLine;
  return String(raw == null ? '' : raw)
    .split('\n')
    .map((line) => {
      if (line.startsWith('Client:')) {
        const body = line.slice('Client:'.length);
        rememberInboundSecrets(body);
        return 'Client:' + redactUnlabeledSecrets(redactCredentials(body));
      }
      return replaceExactSecretValues(redactCredentials(line));
    })
    .join('\n');
}

// Outbound comments and notes. Exact customer secret values only. Never a
// shape rule. FAQ article bytes never come here. href and src values stay so
// a mention id is not treated as a secret.
function scrubPublic(text) {
  const original = String(text == null ? '' : text);
  const plain = original.replace(/\s+/g, ' ').trim();
  if (plain === PASSWORD_POLICY_CLARIFIER || plain === CHALLENGE_CLARIFIER) return plain;
  if (isExactAllowedTemplate(original)) return original;
  const holds = [];
  const shielded = original.replace(/\b(?:href|src)\s*=\s*"[^"]*"/gi, (attr) => {
    const token = 'URLHOLD' + 'A'.repeat(holds.length + 1);
    holds.push(attr);
    return token;
  });
  let out = replaceExactSecretValues(shielded);
  for (let i = 0; i < holds.length; i++) out = out.split('URLHOLD' + 'A'.repeat(i + 1)).join(holds[i]);
  return out;
}

function handoffDetectionText(text) {
  return stripUnlabeledSecretTokens(stripLatinNoise(
    redactCredentials(text)
      .replace(/\b(?:password|passcode|passphrase|passwd|pwd|pass|otp|pin|token|secret)\b\s*[:=]?\s*\S+/gi, ' ')
      .replace(/\b(?:password|passcode|passphrase|passwd|pwd|pass|otp|pin|token|secret)\b/gi, ' ')
      .replace(/\[secret\]/gi, ' ')
  ))
    .replace(/\s+/g, ' ')
    .trim();
}

function handoffLanguage(text) {
  const detected = handoffDetectionText(text);
  return scriptOf(detected) || scriptOf(text) || detectLanguage(detected || text);
}

function isHumanAgentRequest(text) {
  const raw = String(text || '').trim();
  if (!raw || isAccountNumberQuestion(raw) || isAssistantIdentityQuestion(raw)) return false;
  if (isPasswordPolicyQuestion(raw) || isLegitimateClarification(raw)) return false;
  const detected = handoffDetectionText(raw);
  const lang = scriptOf(detected) || scriptOf(raw) || detectLanguage(detected || raw);
  if (!detected) return false;
  if (isPureHandoff(detected, lang) || isPureLiveAgentAsk(detected)) return true;
  if (isPureHandoff(raw, lang) || isPureLiveAgentAsk(raw)) return true;
  if (!(isStructuralHandoffAsk(detected, lang) || isStructuralHandoffAsk(raw, lang))) return false;
  return stripHandoffTokens(detected, lang).length < 28;
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
  ar: 'في MT5، رقم الحساب موجود في البريد الذي أُرسل مع بيانات الدخول. هذه التفاصيل لا تُغيَّر.',
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

// Italian has an approved line only for the existing live-agent phrases.
// Any other Italian handoff uses the English line instead of staying silent.
function handoffLineLanguage(text, detected) {
  const lang = detected || detectLanguage(text);
  if (lang === 'it' && !softEdges.clientRequestedLiveAgent(text)) return 'en';
  return lang;
}

function isKnowledgeQuestion(text) {
  const raw = String(text || '').trim();
  if (!raw || isIdentitySupply(raw) || isVagueEnglish(raw) || isAccountNumberQuestion(raw)) return false;
  if (isStructuralHandoffAsk(raw) || isPureLiveAgentAsk(raw)) return false;
  if (!hasInterrogative(raw)) return false;
  if (/\b(?:my|our)\s+(?:payout|withdrawal|account|kyc|login|ticket|case)\b/i.test(raw)) return false;
  // "any update?" is a status ping. Force still completes a handoff for it.
  // A knowledge question such as a withdrawal FAQ does not.
  try {
    const ero = require('./escalateRelatedOnly');
    if (ero && typeof ero.isStatusPing === 'function' && ero.isStatusPing(raw)) return false;
  } catch (_) {
    /* status detector unavailable */
  }
  return true;
}

function decide(input) {
  const src = input || {};
  const text = String(src.latestText || '');
  const parts = src.parts || [];
  const path = src.path || 'welcome';
  // A password is not the language. Detect the request after the secret is removed.
  const humanRequest = isHumanAgentRequest(text);
  const lang = (humanRequest && handoffLanguage(text)) || detectLanguage((humanRequest && handoffDetectionText(text)) || text);
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
  const owedNow = activeOwedFixedLine(src);
  const ownershipOpts = Object.assign({}, src.ownershipOpts, {
    handoffAssigneeId:
      src.handoffAssigneeId ||
      (src.ownershipOpts && src.ownershipOpts.handoffAssigneeId) ||
      (owedNow && owedNow.assigneeId) ||
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
  // The assignment already landed and the customer line is still owed. The new
  // text does not choose a different line and does not route as a fresh FAQ.
  if (owedNow && owedNow.message) {
    return {
      action: 'fixed_message',
      silent: false,
      route: null,
      reason: 'owed_fixed_line',
      language: languageForFixedMessage(owedNow.message),
      message: owedNow.message,
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
  // A non-welcome path used to force every sentence into the fixed line.
  // A knowledge question that welcome would route normally stays on that path.
  // Vague text, an identity supply, and a real handoff ask still follow force.
  const requestedForce = !!src.force || path !== 'welcome';
  const force = requestedForce && !isKnowledgeQuestion(text);
  // A human-agent request is a handoff on every turn, including after a prior
  // bot reply. The locked line is chosen from this request, before any model reply.
  if (!force && !isHumanAgentRequest(text)) {
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
  const lineLang = handoffLineLanguage(text, lang);
  const message = fixedMessageFor(lineLang);
  const language =
    lineLang === 'hinglish' && message === FIXED_MESSAGES.ur
      ? 'ur'
      : Object.prototype.hasOwnProperty.call(FIXED_MESSAGES, lineLang)
        ? lineLang
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
  if (!result || typeof result !== 'object') return false;
  if (writeOpStore.hasErrorPayload(result)) return true;
  if (result.data && writeOpStore.hasErrorPayload(result.data)) return true;
  return false;
}

function responseStatus(result) {
  const top = Number(result && result.status || 0);
  if (top) return top;
  const data = result && result.data;
  if (!data || typeof data !== 'object') return 0;
  const nested = Number(data.status || 0);
  if (nested) return nested;
  const errors = Array.isArray(data.errors) ? data.errors : [];
  for (const err of errors) {
    const code = Number(err && err.status || 0);
    if (code) return code;
  }
  return 0;
}

function assigneeFieldPresent(data) {
  if (!data || typeof data !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(data, 'admin_assignee_id')) return true;
  if (Object.prototype.hasOwnProperty.call(data, 'assignee_id')) return true;
  if (data.assigned_to) return true;
  if (data.assignee) return true;
  return false;
}

function liveAdminAssignee(conversation) {
  if (!conversation || conversation.admin_assignee_id == null) return '';
  const id = String(conversation.admin_assignee_id);
  if (!id || id === '0') return '';
  return id;
}

function isLiveBotSeat(id, src) {
  const seat = String(id || '');
  if (!seat) return false;
  const o = src || {};
  if (o.botId && seat === String(o.botId)) return true;
  const ids = [];
  if (o.arsalId) ids.push(o.arsalId);
  if (o.eliteAiId) ids.push(o.eliteAiId);
  if (Array.isArray(o.botIds)) ids.push(...o.botIds);
  return ids.some((item) => item != null && String(item) === seat);
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
  if (result.reason === 'assignee_still_bot') return { ok: false, reason: 'assignee_still_bot' };
  const status = responseStatus(result);
  if (status === 422 || status === 429) return { ok: false, reason: String(status) };
  if (status >= 500) return { ok: false, reason: '500' };
  const blob = String(result.message || result.reason || '');
  if (status === 0 || /timeout|etimedout|econnaborted/i.test(blob)) return { ok: false, reason: 'timeout' };
  // The failed-assignment verdict is read before any ambiguous partial or
  // unknown hold. A 2xx that names the wrong seat, names no seat on an
  // otherwise incomplete body, or is an unnamed partial is retryable.
  // A clean synthetic shell with no assignee field, no errors, and no
  // partial or unknown flag stays successful for the older transports.
  if (expect && expect.kind === 'assignment') {
    const http = status >= 200 && status < 300 ? status : 200;
    if (!(status >= 300)) {
      const verdict = writeOpStore.classifyWriteOutcome(
        { message_type: 'assignment', assignee_id: expect.assigneeId, admin_id: '' },
        result.data,
        http
      );
      if (verdict.confirm) return { ok: true, reason: 'assigned' };
      if (!verdict.confirm && !verdict.unknown) {
        const cleanLegacy =
          verdict.reason === 'assignee-unconfirmed' &&
          result.data &&
          typeof result.data === 'object' &&
          !assigneeFieldPresent(result.data) &&
          result.partial !== true &&
          result.unknown !== true &&
          result.ok === true &&
          !responseHasErrorList(result);
        if (!cleanLegacy) return { ok: false, reason: 'failed' };
      }
    }
  }
  if (result.partial === true) return { ok: false, reason: 'partial' };
  if (responseHasErrorList(result)) return { ok: false, reason: 'failed' };
  if (result.unknown || result.ok !== true) return { ok: false, reason: 'partial' };
  if (status < 200 || status >= 300) return { ok: false, reason: 'partial' };
  // HTTP 200 with an error list is a failed write. data null is ambiguous.
  // Neither is a confirmed note, assignment, or message.
  if (Object.prototype.hasOwnProperty.call(result, 'data') && result.data == null) {
    return { ok: false, reason: 'partial' };
  }
  if (expect && expect.kind === 'assignment') {
    const verdict = writeOpStore.classifyWriteOutcome(
      { message_type: 'assignment', assignee_id: expect.assigneeId, admin_id: '' },
      result.data,
      status || 200
    );
    // Older synthetic transports return a conversation shell with no assignee
    // field and no errors. That body stays successful. A named seat must match.
    if (!verdict.confirm && !(verdict.reason === 'assignee-unconfirmed' && !assigneeFieldPresent(result.data))) {
      return { ok: false, reason: 'failed' };
    }
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
    commentRejected: '',
  };
}

function ambiguousWrite(reason) {
  return reason === '500' || reason === 'timeout' || reason === 'partial';
}

// A customer comment that did not land: 4xx, 5xx, or a timeout. The owed line
// stays owed. The reason string is the stored commentRejected value.
function isCommentMiss(progress) {
  return !!(progress && String(progress.commentRejected || ''));
}

function releaseStaleNoteHold(progress, src) {
  if (!progress || progress.noteAmbiguous !== true) return;
  const parts = src && src.parts;
  const botId = src && src.botId;
  if (noteInParts(parts, botId) || noteAlreadyPresent(parts, botId)) {
    progress.noteAmbiguous = false;
    progress.noteConfirmed = true;
    return;
  }
  // The parts still have no note, so the timeout or HTTP 500 did not land.
  // failed-confirmed lets the same note body be tried once. The customer
  // line, when one is already owed, stays the body stored at owe-time.
  progress.noteAmbiguous = false;
  progress.noteConfirmed = false;
  if (src && src.conversationId && src.botId) {
    writeOpStore.confirmNoteDidNotLand({
      conversationId: src.conversationId,
      madeBy: src.botId,
      body: redactCredentials(src.noteHtml || ''),
    });
  }
}

function releaseStaleAssignmentHold(progress, src) {
  if (!progress || progress.assignAmbiguous !== true) return;
  const wanted = String((src && src.assigneeId) || progress.assigneeId || '');
  const live = liveAdminAssignee(src && src.conversation);
  if (wanted && live === wanted) {
    progress.assignAmbiguous = false;
    progress.assignConfirmed = true;
    if (!progress.assigneeId) progress.assigneeId = wanted;
    return;
  }
  if (!live || isLiveBotSeat(live, src)) {
    progress.assignAmbiguous = false;
    progress.assignConfirmed = false;
  }
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
  let message = redactCredentials(decision.message || '');
  const priorOwed = src.conversationId && src.botId ? writeOpStore.latestOwedFixedLine(src.conversationId, src.botId) : null;
  const priorAssignOp = src.conversationId && src.botId ? writeOpStore.latestHandoffAssignment(src.conversationId, src.botId) : null;
  const enteredNoteConfirmed = progress.noteConfirmed === true;
  const owedParts = owedFixedLineFromParts(src.parts, src.botId, src.ownershipOpts || {});
  if (src.conversationId && src.botId) {
    const storedLine = writeOpStore.latestOwedFixedLine(src.conversationId, src.botId);
    if (storedLine && Object.values(FIXED_MESSAGES).includes(String(storedLine.message || ''))) {
      message = String(storedLine.message);
    }
  }
  if (!message || !Object.values(FIXED_MESSAGES).includes(message)) {
    return finish({ reason: 'no_fixed_message', withhold: true, progress });
  }
  if (src.conversationId && src.botId) {
    writeOpStore.rememberOwedFixedLine({
      conversationId: src.conversationId,
      madeBy: src.botId,
      assigneeId: String(src.assigneeId || progress.assigneeId || ''),
      message,
      language: languageForFixedMessage(message),
    });
  }
  Object.assign(
    progress,
    reconcileFromParts(progress, src.parts, src.conversation, message, src.botId)
  );
  // Any non-2xx or timeout on the customer comment is retried. It is not an
  // ambiguous hold. After the assignment retry bound, the line stays owed and
  // this turn posts nothing.
  if (isCommentMiss(progress)) {
    progress.messageAmbiguous = false;
    if (Number(progress.commentAttempts || 0) >= writeOpStore.ASSIGNMENT_RETRY_BOUND) {
      return finish({ reason: 'message_retry_bound', withhold: true, progress });
    }
  }
  // A timeout or 5xx hold stored on the ticket is not permanent. The next
  // message, a restart, or an op-store wipe passes recheckHold and the live
  // assignee is read again. Applied: post once. Still the bot or empty: retry.
  // A same-turn replay without that signal keeps the hold.
  if (src.recheckHold) {
    releaseStaleAssignmentHold(progress, src);
    releaseStaleNoteHold(progress, src);
  }
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
    if (src.conversationId && src.botId) writeOpStore.markOwedFixedLineSent(src.conversationId, src.botId);
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
  const commentMiss = isCommentMiss(progress);
  const storeHasLine = !!(priorOwed && Object.values(FIXED_MESSAGES).includes(String(priorOwed.message || '')));
  const assignmentLanded = !!(partsAssignOk || seatHeld || owedParts.owed || (progress.assignConfirmed && progress.assigneeId));
  // The customer comment missed and the note is gone. The owed line is the
  // op-store body. Rewriting the note is not required and a replay of the
  // confirmed note must not drop the line.
  if (commentMiss && storeHasLine && assignmentLanded && !verifiedNote) {
    message = String(priorOwed.message);
    progress.noteConfirmed = true;
    progress.noteAmbiguous = false;
    if (!progress.assigneeId) progress.assigneeId = String(priorOwed.assigneeId || owedParts.assigneeId || '');
  }
  // The op store is gone and our assignment part is already in the conversation.
  // Do not open a second handoff. The line is re-derived from that part's request.
  if (!storeHasLine && !priorAssignOp && owedParts.owed && !enteredNoteConfirmed && !progress.noteAmbiguous) {
    const source = conversationLanguageSource({
      parts: src.parts,
      full: src.conversation,
      priorText: owedParts.priorText,
    });
    if (source) {
      const derived = fixedMessageFor(handoffLineLanguage(source, scriptOf(source) || detectLanguage(source)));
      if (Object.values(FIXED_MESSAGES).includes(derived)) message = derived;
    }
    progress.noteConfirmed = true;
    progress.noteAmbiguous = false;
    progress.assignConfirmed = true;
    progress.assignAmbiguous = false;
    if (!progress.assigneeId) progress.assigneeId = String(owedParts.assigneeId || '');
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
  // A parts record also does not count while the live assignee is still the bot.
  const liveIsBot = isLiveBotSeat(liveAdminAssignee(src.conversation), src);
  if (
    progress.assignConfirmed === true &&
    !progress.assignAmbiguous &&
    !assignmentAlreadyHeld(src.conversation, progress.assigneeId) &&
    (!partsAssignOk || liveIsBot)
  ) {
    progress.assignConfirmed = false;
  }

  let lastAssignResult = null;
  if (src.conversationId && src.botId && !progress.messageSent) {
    writeOpStore.rememberOwedFixedLine({
      conversationId: src.conversationId,
      madeBy: src.botId,
      assigneeId: progress.assigneeId,
      message,
      language: languageForFixedMessage(message),
    });
  }
  if (!progress.assignConfirmed && !assignmentAlreadyHeld(src.conversation, progress.assigneeId)) {
    // A 422 is definite and is retried. A 500/timeout hold stays put on a
    // same-turn replay. recheckHold already cleared that flag for a later turn.
    if (progress.assignAmbiguous) {
      return finish({ reason: 'assign_ambiguous_held', withhold: true, progress });
    }
    // The seat is still the bot, so the unknown assignment did not land.
    // failed-confirmed lets the same idempotency key be tried once.
    if (src.recheckHold && src.conversationId && src.botId) {
      writeOpStore.confirmAssignmentDidNotLand({
        conversationId: src.conversationId,
        madeBy: src.botId,
        assigneeId: progress.assigneeId,
      });
    }
    const asgRes = await transport.assign(progress.assigneeId);
    lastAssignResult = asgRes;
    const asgClass = classifyAssignment(asgRes, { kind: 'assignment', assigneeId: progress.assigneeId });
    if (!asgClass.ok) {
      if (ambiguousWrite(asgClass.reason)) progress.assignAmbiguous = true;
      else progress.phase = 'assignment-pending';
      progress.assignConfirmed = false;
      return finish({ reason: 'assign_' + asgClass.reason, withhold: true, progress });
    }
    wroteAssign = true;
  }
  progress.assignConfirmed = true;
  progress.assignAmbiguous = false;
  if (progress.phase === 'assignment-pending') progress.phase = '';

  if (
    progress.messageAmbiguous &&
    (assignmentAlreadyHeld(src.conversation, progress.assigneeId) || src.recheckHold)
  ) {
    progress.messageAmbiguous = false;
  }
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
  const namedSeat = wroteAssign ? resourceAssigneeId(lastAssignResult && lastAssignResult.data) : '';
  const responseConfirms = !!(namedSeat && namedSeat === String(progress.assigneeId || ''));
  const stillBot = isLiveBotSeat(liveAdminAssignee(src.conversation), src);
  const legacyUnnamed =
    wroteAssign &&
    !assigneeFieldPresent(lastAssignResult && lastAssignResult.data) &&
    !responseHasErrorList(lastAssignResult || {});
  // The fixed line is not posted while the live assignee is still the bot,
  // unless this turn's assignment response named the intended seat. A legacy
  // unnamed synthetic success stays postable so older transports keep working.
  // The runtime sets requireLiveAssignee and refetches before it will post.
  if (stillBot && !responseConfirms && !assignmentAlreadyHeld(src.conversation, progress.assigneeId)) {
    if (src.requireLiveAssignee || !legacyUnnamed) {
      progress.assignConfirmed = false;
      progress.messageSent = false;
      progress.messageAmbiguous = false;
      progress.phase = 'assignment-pending';
      return finish({ reason: 'assignee_still_bot', withhold: true, progress });
    }
  }
  const msgRes = await transport.postMessage(message);
  const msgClass = classifyAssignment(msgRes, { kind: 'message' });
  if (!msgClass.ok) {
    progress.messageSent = false;
    if (msgClass.reason === 'assignee_still_bot') {
      progress.messageAmbiguous = false;
      progress.assignConfirmed = false;
      progress.phase = 'assignment-pending';
      return finish({ reason: 'message_assignee_still_bot', withhold: true, progress });
    }
    const status = responseStatus(msgRes);
    const labeledMiss =
      msgClass.reason === '422' ||
      msgClass.reason === '429' ||
      msgClass.reason === '500' ||
      msgClass.reason === 'timeout';
    // Every non-2xx and every timeout keeps the owed line. 422, 429, 500, and
    // timeout keep those reason strings. Other HTTP statuses store the code.
    if (labeledMiss || (status >= 400 && status < 600)) {
      progress.messageAmbiguous = false;
      progress.commentRejected = labeledMiss ? msgClass.reason : String(status);
      progress.commentAttempts = Number(progress.commentAttempts || 0) + 1;
      return finish({ reason: 'message_' + progress.commentRejected, withhold: true, progress });
    }
    if (ambiguousWrite(msgClass.reason)) progress.messageAmbiguous = true;
    return finish({ reason: 'message_' + msgClass.reason, withhold: true, progress });
  }
  progress.messageSent = true;
  progress.commentRejected = '';
  if (src.conversationId && src.botId) writeOpStore.markOwedFixedLineSent(src.conversationId, src.botId);
  progress.messageAmbiguous = false;
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

function normalizeFaqAsk(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, '')
    .trim();
}

// These welcome asks were replaced by the number hedge. They are KB questions.
// The locked line language is not involved. The answer is the selected article.
function isWelcomeKbFigureQuestion(text) {
  const q = normalizeFaqAsk(text);
  return q === 'what is the daily loss limit'
    || q === 'how does the profit target work'
    || q === 'what is the leverage';
}

const CHALLENGE_CLARIFIER = 'Please tell me which challenge you mean.';

// A welcome ask that does not name a product, and whose FAQ ranking is empty
// or tied, gets the challenge clarifier. A tied rank is not an answer and it
// is not silence.
function ambiguousChallengeClarifier(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw || isLegitimateClarification(raw) || isPasswordPolicyQuestion(raw)) return '';
  if (isWelcomeKbFigureQuestion(raw)) return '';
  if (!/\bchallenge\b/i.test(raw)) return '';
  if (/\b(?:catalyst|instant|flash|lite|1[\s-]*step|2[\s-]*step|one[\s-]*step|two[\s-]*step|free\s*retry)\b/i.test(raw)) return '';
  let ranked = [];
  try {
    const faq = require('./faq-kb');
    ranked = faq && typeof faq.rankArticles === 'function' ? faq.rankArticles(raw) : [];
  } catch (_) {
    ranked = [];
  }
  const top = ranked[0];
  const second = ranked[1];
  const empty = !top;
  const ambiguous = !!(top && second && Number(second.score) === Number(top.score));
  if (!empty && !ambiguous) return '';
  return CHALLENGE_CLARIFIER;
}

// A unique FAQ rank is the article. A tie stays the clarifier. Silence is not
// an answer on the welcome path or on a later turn.
function uniqueRankedFaqArticle(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw || isHumanAgentRequest(raw) || isAccountNumberQuestion(raw)) return '';
  if (isPasswordPolicyQuestion(raw) || isLegitimateClarification(raw) || isWelcomeKbFigureQuestion(raw)) return '';
  if (ambiguousChallengeClarifier(raw)) return '';
  if (!hasInterrogative(raw)) return '';
  try {
    const faq = require('./faq-kb');
    if (!faq || typeof faq.rankArticles !== 'function' || typeof faq.selectApprovedAnswer !== 'function') return '';
    const ranked = faq.rankArticles(raw);
    const top = ranked[0];
    const second = ranked[1];
    if (!top) return '';
    if (second && Number(second.score) === Number(top.score)) return '';
    const hit = faq.selectApprovedAnswer(raw);
    return hit && hit.body ? String(hit.body).trim() : '';
  } catch (_) {
    return '';
  }
}

function isUniqueFaqArticle(question, body) {
  const article = uniqueRankedFaqArticle(question);
  if (!article) return false;
  return String(body || '').replace(/\s+/g, ' ').trim() === article.replace(/\s+/g, ' ').trim();
}

function approvedFaqCustomerBody(text) {
  if (!isWelcomeKbFigureQuestion(text)) return '';
  try {
    const faq = require('./faq-kb');
    if (!faq || typeof faq.selectApprovedAnswer !== 'function') return '';
    const hit = faq.selectApprovedAnswer(text);
    return hit && hit.body ? String(hit.body).trim() : '';
  } catch (_) {
    return '';
  }
}

function isApprovedFaqAnswer(question, body) {
  const approved = approvedFaqCustomerBody(question);
  if (!approved) return false;
  return String(body || '').replace(/\s+/g, ' ').trim() === approved.replace(/\s+/g, ' ').trim();
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

function isPasswordPolicyQuestion(text) {
  const q = String(text || '').replace(/\s+/g, ' ').trim();
  if (!q || !/\bpassword\b/i.test(q)) return false;
  return /\b(?:policy|requirements?|rules?|criteria)\b/i.test(q);
}

const PASSWORD_POLICY_CLARIFIER = 'Which part of the password policy should I explain?';

// A general password-policy question is not a handoff and not silence. Post
// the usable draft, then an approved FAQ line. Otherwise ask which part.
function passwordPolicyPublicLine(text, draft) {
  if (!isPasswordPolicyQuestion(text)) return '';
  const plain = String(draft || '').replace(/\s+/g, ' ').trim();
  if (
    plain &&
    !isTerminalHedge(plain) &&
    !isSpreadTemplateDraft(plain) &&
    !isLegitimateClarification(plain) &&
    !Object.values(FIXED_MESSAGES).includes(plain) &&
    !looksLikePromiseOrAsk(plain)
  ) {
    return plain;
  }
  const approved = approvedFaqCustomerBody(text);
  if (approved) return approved;
  return PASSWORD_POLICY_CLARIFIER;
}

function draftHasPublicFigure(text) {
  const s = String(text || '');
  if (/(?<![\w.])\d+(?:[.,]\d+)?\s*(?:%|percent)(?!\w)/i.test(s)) return true;
  if (/(?<![\w.])(?:[$€£]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:usd|eur|gbp)\b)/i.test(s)) return true;
  if (/(?<![\w.])\d+\s*:\s*\d+\b/.test(s)) return true;
  return false;
}

function evidenceTextFromKnowledge(knowledge) {
  let gap = null;
  try {
    gap = require('../02_statePresend/knowledgeGapGate');
  } catch (_) {
    return '';
  }
  if (!gap || typeof gap.normalizeResults !== 'function') return '';
  return gap
    .normalizeResults(knowledge && knowledge.results ? knowledge.results : knowledge)
    .map((row) => (row.title || '') + ' ' + row.text)
    .join('\n')
    .trim();
}

// The same binding check presend uses. A draft with no public figure is not
// this path. A figure posts only when every percent, amount, and ratio is in
// the evidence and bound to the same concept.
function supportedFigureLine(draft, knowledge) {
  const plain = String(draft || '').replace(/\s+/g, ' ').trim();
  if (!plain || !draftHasPublicFigure(plain)) return '';
  let policy = null;
  try {
    policy = require('../02_statePresend/policyEvidence');
  } catch (_) {
    return '';
  }
  if (!policy || typeof policy.unsupportedPublicFigures !== 'function') return '';
  const evidence = evidenceTextFromKnowledge(knowledge);
  if (!evidence) return '';
  if (policy.unsupportedPublicFigures(plain, evidence).length) return '';
  return plain;
}

function supportedFigureDraft(original, current, knowledge) {
  return supportedFigureLine(original, knowledge) || supportedFigureLine(current, knowledge);
}

function languageForFixedMessage(message) {
  const line = String(message || '');
  for (const lang of Object.keys(FIXED_MESSAGES)) {
    if (FIXED_MESSAGES[lang] === line) return lang;
  }
  return 'en';
}

function botIdSet(botId, opts) {
  const ids = new Set();
  const add = (value) => {
    const id = String(value || '');
    if (id && id !== '0') ids.add(id);
  };
  add(botId);
  const o = opts || {};
  add(o.arsalId);
  add(o.eliteAiId);
  add(o.botId);
  if (Array.isArray(o.botIds)) o.botIds.forEach(add);
  return ids;
}

function partIsAfter(part, index, anchor, anchorIndex) {
  const anchorAt = anchor && anchor.created_at != null && anchor.created_at !== '' ? Number(anchor.created_at) : NaN;
  const partAt = part && part.created_at != null && part.created_at !== '' ? Number(part.created_at) : NaN;
  if (Number.isFinite(anchorAt) && Number.isFinite(partAt)) return partAt > anchorAt;
  return index > anchorIndex;
}

function assignmentIsOurs(part, botId, opts) {
  if (!part) return false;
  const pt = String(part.part_type || '');
  if (pt !== 'assignment' && pt !== 'assign') return false;
  const assigned = part.assigned_to || part.assignee || {};
  const target = String((assigned && assigned.id) || part.assignee_id || '');
  const bots = botIdSet(botId, opts);
  if (!target || target === '0' || bots.has(target)) return false;
  const authorId = String((part.author || {}).id || '');
  if (!authorId) return true;
  const elite = String((opts && opts.eliteAiId) || '');
  if (elite && authorId === elite && authorId !== String(botId || '')) return false;
  return bots.has(authorId);
}

function ourPublicComment(part, botId, opts) {
  if (!isPublicCustomerReply(part)) return false;
  const authorId = String((part.author || {}).id || '');
  if (!authorId) return false;
  return botIdSet(botId, opts).has(authorId);
}

function customerBody(part) {
  if (!part) return '';
  const type = String((part.author || {}).type || '');
  if (type !== 'user' && type !== 'lead' && type !== 'contact') return '';
  return stripHtml(part.body || '').replace(/\s+/g, ' ').trim();
}

function statusPingText(text) {
  try {
    const ero = require('./escalateRelatedOnly');
    return !!(ero && typeof ero.isStatusPing === 'function' && ero.isStatusPing(text));
  } catch (_) {
    return false;
  }
}

// Language comes from the conversation, not from a later status ping.
// source.body and earlier customer text outrank "any update?".
function conversationLanguageSource(src) {
  const o = src || {};
  const parts = o.parts || [];
  const samples = [];
  const push = (raw) => {
    const said = stripHtml(raw || '').replace(/\s+/g, ' ').trim();
    if (!said || statusPingText(said)) return;
    samples.push(said);
  };
  const source = o.full && o.full.source;
  if (source) push(source.body || source.subject || '');
  for (const part of parts) push(customerBody(part));
  if (o.priorText) push(o.priorText);
  for (const said of samples) {
    if (isHumanAgentRequest(said)) return handoffDetectionText(said) || said;
  }
  if (samples.length) return samples[samples.length - 1];
  const requestText = handoffRequestText(parts);
  if (requestText) return handoffDetectionText(requestText) || requestText;
  return String(o.latestText || '');
}

// The original human-agent request, not a later turn. Lost-state completion
// re-detects the locked line from this text after the op store is gone.
function handoffRequestText(parts) {
  const list = Array.isArray(parts) ? parts : [];
  for (const part of list) {
    const said = customerBody(part);
    if (!said || isAccountNumberQuestion(said)) continue;
    if (isHumanAgentRequest(said)) return said;
  }
  return '';
}

/**
 * The op store can be gone. Our assignment part, with no later comment from us
 * and no later human comment, still owes the fixed line. The internal note is
 * not required.
 */
function owedFixedLineFromParts(parts, botId, opts) {
  const list = Array.isArray(parts) ? parts : [];
  const empty = { owed: false, humanSince: false, ourCommentAfter: false, assigneeId: '', priorText: '' };
  let anchor = null;
  let anchorIndex = -1;
  for (let i = 0; i < list.length; i++) {
    if (!assignmentIsOurs(list[i], botId, opts)) continue;
    if (!anchor || partIsAfter(list[i], i, anchor, anchorIndex)) {
      anchor = list[i];
      anchorIndex = i;
    }
  }
  if (!anchor) return empty;
  const assigned = anchor.assigned_to || anchor.assignee || {};
  const assigneeId = String((assigned && assigned.id) || anchor.assignee_id || '');
  let humanSince = false;
  let ourCommentAfter = false;
  let priorText = '';
  for (let i = 0; i < list.length; i++) {
    const part = list[i];
    if (!part || i === anchorIndex) continue;
    if (partIsAfter(part, i, anchor, anchorIndex)) {
      if (ourPublicComment(part, botId, opts)) ourCommentAfter = true;
      if (teammateHandoffGates.isHumanTeammatePublicReply(part, opts)) humanSince = true;
      continue;
    }
    const said = customerBody(part);
    if (said) priorText = said;
  }
  const linePublic = fixedLineInParts(list, '');
  const owed = !humanSince && !ourCommentAfter && !linePublic;
  return { owed, humanSince, ourCommentAfter, assigneeId, priorText };
}

function closeOwedFixedLine(conversationId, botId) {
  if (conversationId && botId) writeOpStore.markOwedFixedLineSent(conversationId, botId);
}

function activeOwedFixedLine(src) {
  const o = src || {};
  const parts = o.parts || [];
  const botId = String(o.botId || '');
  const opts = o.ownershipOpts || {};
  const fromParts = owedFixedLineFromParts(parts, botId, opts);
  const convId = String(o.conversationId || (o.full && o.full.id) || '');
  if (o.progress && o.progress.messageSent) {
    closeOwedFixedLine(convId, botId);
    return null;
  }
  if (fromParts.humanSince || fromParts.ourCommentAfter || fixedLineAlreadyPublic(o.progress, parts)) {
    closeOwedFixedLine(convId, botId);
    return null;
  }
  const rec = convId && botId ? writeOpStore.latestOwedFixedLine(convId, botId) : null;
  const assigneeId = String((rec && rec.assigneeId) || fromParts.assigneeId || '');
  // The body stored at owe-time is the line, including when the assignment has
  // not landed yet. The retry turn's text does not choose a different line.
  const stored = rec && Object.values(FIXED_MESSAGES).includes(String(rec.message || '')) ? String(rec.message) : '';
  if (stored) {
    return { message: stored, assigneeId, priorText: fromParts.priorText || '' };
  }
  const live = liveAdminAssignee(o.full);
  const landed = fromParts.owed || (!!assigneeId && live === assigneeId && !!rec);
  if (!landed || (!rec && !fromParts.owed)) return null;
  const languageSource = conversationLanguageSource({
    parts,
    full: o.full,
    latestText: o.latestText,
    priorText: fromParts.priorText,
  });
  const message = fixedMessageFor(handoffLineLanguage(languageSource, scriptOf(languageSource) || detectLanguage(languageSource)));
  if (!Object.values(FIXED_MESSAGES).includes(message)) return null;
  return { message, assigneeId, priorText: fromParts.priorText || '' };
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
  // A non-2xx or timeout on the customer comment is a definite miss. Note
  // removal must still resume from the assignment op record.
  if (isCommentMiss(progress)) progress.messageAmbiguous = false;
  // A note or customer-comment ambiguous write still holds. An assignment
  // timeout or 5xx does not: the live seat below is the record, not the flag.
  const staleAssignmentHold = progress.assignAmbiguous === true;
  const commentMiss = isCommentMiss(progress);
  // A removed note does not cancel a comment that is still owed. The op store
  // holds the line. A note that never landed, with no rejected comment, still holds.
  if (progress.noteAmbiguous && !noteInParts(parts, botId) && !commentMiss) {
    return Object.assign({}, empty, { reason: 'ambiguous_held' });
  }
  progress.messageAmbiguous = false;
  const opAssignee = op && op.status === 'confirmed' && op.kind === 'assignment' && String(op.madeBy || '') === botId
    ? String(op.assigneeId || '')
    : '';
  const assigneeId = opAssignee || String(progress.assigneeId || '');
  if (!assigneeId) return Object.assign({}, empty, { reason: 'no_op_record' });
  const notePresent = noteInParts(parts, botId);
  if (notePresent && progress.noteConfirmed === true && !staleAssignmentHold) {
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

hydrateDeclaredSecrets();

module.exports = {
  STATUS,
  FIXED_MESSAGES,
  redactCredentials,
  redactUnlabeledSecrets,
  rememberInboundSecrets,
  replaceExactSecretValues,
  scrubPromptHistory,
  scrubPublic,
  prepareNoteForEnglishPrompt,
  detectLanguage,
  isStructuralHandoffAsk,
  isAccountNumberQuestion,
  isAssistantIdentityQuestion,
  isPureLiveAgentAsk,
  isHumanAgentRequest,
  handoffRequestText,
  isExactAllowedTemplate,
  isTerminalHedge,
  isLegitimateClarification,
  isPasswordPolicyQuestion,
  passwordPolicyPublicLine,
  PASSWORD_POLICY_CLARIFIER,
  supportedFigureDraft,
  isPublicCustomerReply,
  owedFixedLineFromParts,
  activeOwedFixedLine,
  fixedLineAlreadyPublic,
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
  isWelcomeKbFigureQuestion,
  ambiguousChallengeClarifier,
  uniqueRankedFaqArticle,
  isUniqueFaqArticle,
  CHALLENGE_CLARIFIER,
  approvedFaqCustomerBody,
  isApprovedFaqAnswer,
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
