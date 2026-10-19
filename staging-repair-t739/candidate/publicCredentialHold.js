'use strict';
/**
 * PUBLIC_CREDENTIAL_HOLD_V1 (t739 staging)
 *
 * Final credential hold for the public-content boundary (between rendering and transport) and for
 * persistence of owner-command plan bodies.
 *
 * Contract
 *  - HOLD or PASS only. This module never rewrites, strips, repairs or "fixes" a message. The text
 *    that is later sent is exactly the text that was checked.
 *  - Normalised views (entity/percent/escape decoding, tag stripping, NFKC, invisible-character and
 *    homoglyph folding, digit-script folding, worded digits) exist ONLY inside detection. They are
 *    never returned to the caller.
 *  - The approved MT5 containment guard (spreadPublicGuard, sha256 2158c43f...) is called unchanged,
 *    on the screened text and on the rendered payload. This module is an ADDITIONAL detector for the
 *    shapes that guard cannot see (see KNOWN_GAPS).
 *  - Results are body-free: a fixed reason code, the tier/view name that fired, and the length.
 *    A matched login or password value is never placed in a result, log line or note.
 *  - Detection failure (exception, oversize input) holds. It never passes.
 */

const guard = require('./spreadPublicGuard');

const VERSION = 'PUBLIC_CREDENTIAL_HOLD_V1+t739-r2';
const MAX_SCAN_CHARS = 200000;

const CODES = Object.freeze({
  GUARD: 'MT5_GUARD_2158C43F_PAIR',
  LABELLED: 'CRED_PAIR_LABELLED',
  UNLABELLED: 'CRED_PAIR_UNLABELLED',
  SPLIT: 'CRED_PAIR_SPLIT_UNLABELLED',
  SECRET_LABELLED: 'CRED_SECRET_LABELLED',
  SECRET_SHAPED: 'CRED_SECRET_SHAPED',
  CONTEXT: 'CRED_PAIR_CONTEXT',
  URL: 'CRED_PAIR_URL',
  ENCODED: 'CRED_PAIR_ENCODED',
  TOO_LARGE: 'CRED_SCAN_TOO_LARGE',
  ERROR: 'CRED_DETECTOR_ERROR',
});

/** Gaps that remain after this module. Reported verbatim; they stay release blockers. */
const KNOWN_GAPS = Object.freeze([
  'Cross-message pairs are held only from the recent texts the caller registered for that conversation (last 8 public bodies, 4000 characters). A pair older than that window, or whose id half has no login/account/server cue, is not held.',
  'Password supplied only as spaced, worded or per-letter characters (login digits are folded, password characters are not).',
  'Paraphrased secret with no label word and no adjacency or strong-token shape (for example a short dictionary-word secret).',
  'Purely alphabetic labelled secret without an internal capital (cannot be told apart from ordinary words such as "password: required").',
  'Reversed, shifted (other than ROT13), compressed, encrypted or steganographic encodings; base64/hex only one level deep.',
  'Languages and scripts whose password/login label is not in the built-in label lists.',
  'A login or password that appears only inside an image. Link targets and attachment URLs that are fields of the outgoing payload are scanned; pixels are not.',
  'A login id with no secret in the current customer-visible text or the registered recent context is not a hold.',
]);

const INVISIBLE_RE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]|\uDB40[\uDC00-\uDFFF]/g;

const HOMOGLYPHS = (() => {
  const pairs = {
    // Cyrillic
    '\u0430': 'a', '\u0432': 'b', '\u0441': 'c', '\u0435': 'e', '\u04BB': 'h', '\u0456': 'i', '\u0458': 'j', '\u043A': 'k',
    '\u043C': 'm', '\u043D': 'h', '\u043E': 'o', '\u0440': 'p', '\u0455': 's', '\u0442': 't', '\u0443': 'y', '\u0445': 'x',
    '\u0410': 'A', '\u0412': 'B', '\u0421': 'C', '\u0415': 'E', '\u041D': 'H', '\u0406': 'I', '\u0408': 'J', '\u041A': 'K',
    '\u041C': 'M', '\u041E': 'O', '\u0420': 'P', '\u0405': 'S', '\u0422': 'T', '\u0425': 'X', '\u0423': 'Y', '\u0417': '3',
    '\u0431': '6',
    // Greek
    '\u03B1': 'a', '\u03B2': 'b', '\u03B5': 'e', '\u03B9': 'i', '\u03BA': 'k', '\u03BD': 'v', '\u03BF': 'o', '\u03C1': 'p',
    '\u03C4': 't', '\u03C5': 'u', '\u03C7': 'x', '\u0391': 'A', '\u0392': 'B', '\u0395': 'E', '\u0396': 'Z', '\u0397': 'H',
    '\u0399': 'I', '\u039A': 'K', '\u039C': 'M', '\u039D': 'N', '\u039F': 'O', '\u03A1': 'P', '\u03A4': 'T', '\u03A5': 'Y',
    '\u03A7': 'X',
    // Latin look-alikes outside NFKC
    '\u0131': 'i', '\u0269': 'i', '\u026A': 'i', '\u0261': 'g', '\u0251': 'a', '\u1D00': 'a', '\u1D04': 'c', '\u1D07': 'e',
    '\u1D0F': 'o', '\u1D18': 'p', '\u1D1B': 't', '\u1D20': 'v', '\u1D21': 'w', '\u1D22': 'z', '\u0299': 'b', '\u029F': 'l',
    '\u0280': 'r', '\u0262': 'g', '\u0274': 'n', '\u028F': 'y', '\u01C0': 'l', '\u2223': 'l', '\u05C0': 'l', '\u0627': 'l',
    '\u2160': 'I', '\u217C': 'l', '\u2024': '.', '\u2027': '.', '\u2212': '-', '\u2010': '-', '\u2011': '-', '\u2012': '-',
    '\u2013': '-', '\u2014': '-', '\u2015': '-', '\uFE63': '-', '\u2022': '.', '\u00B7': '.',
  };
  const map = new Map(Object.entries(pairs));
  const digitBases = [0x0660, 0x06F0, 0x07C0, 0x0966, 0x09E6, 0x0A66, 0x0AE6, 0x0B66, 0x0BE6, 0x0C66, 0x0CE6, 0x0D66, 0x0E50, 0x0ED0, 0x0F20, 0x1040, 0x17E0, 0x1810, 0xFF10];
  for (const base of digitBases) for (let i = 0; i < 10; i++) map.set(String.fromCharCode(base + i), String(i));
  for (let i = 0; i < 10; i++) {
    map.set(String.fromCharCode(0x2776 + i), String((i + 1) % 10));
    map.set(String.fromCharCode(0x2780 + i), String((i + 1) % 10));
    map.set(String.fromCharCode(0x278A + i), String((i + 1) % 10));
  }
  return map;
})();

const DIGIT_WORDS = (() => {
  const d = {
    zero: 0, oh: 0, nought: 0, naught: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    cero: 0, uno: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
    zro: 0, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9,
    null: 0, eins: 1, zwei: 2, drei: 3, vier: 4, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
    due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9,
    um: 1, dois: 2, quatro: 4, oito: 8,
    sifar: 0, aik: 1, ek: 1, do: 2, teen: 3, char: 4, paanch: 5, panch: 5, chhe: 6, cheh: 6, chay: 6, saat: 7, sat: 7, aath: 8, ath: 8, nau: 9,
    sifir: 0, bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9,
    ноль: 0, один: 1, два: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9,
    صفر: 0, واحد: 1, اثنان: 2, اثنين: 2, ثلاثة: 3, اربعة: 4, أربعة: 4, خمسة: 5, ستة: 6, سبعة: 7, ثمانية: 8, تسعة: 9,
    '零': 0, '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  };
  return new Map(Object.entries(d));
})();
const MULTIPLIERS = new Map([['double', 2], ['triple', 3], ['dubble', 2], ['dbl', 2]]);

function leetClass(ch) {
  switch (ch) {
    case 'a': return '[a@4]';
    case 'e': return '[e3]';
    case 'i': return '[i1!|]';
    case 'l': return '[l1|]';
    case 'o': return '[o0]';
    case 's': return '[s$5]';
    case 't': return '[t7]';
    default: return ch;
  }
}
/** Letters of a word with leet substitutes and up to two separator characters between letters. */
function spacedLeet(word) {
  return word.split('').map((c) => leetClass(c) + '{1,3}').join('[\\W_]{0,2}');
}

const STRONG_PASS_LABELS = [
  spacedLeet('password'), spacedLeet('passwrd'), spacedLeet('pasword'), spacedLeet('passwd'), spacedLeet('paswrd'), spacedLeet('passwort'),
  spacedLeet('passcode'), spacedLeet('passphrase'), spacedLeet('passkey'), spacedLeet('kennwort'), spacedLeet('wachtwoord'),
  '(?:access|secret|login|investor|master|trading)[\\W_]{0,2}(?:code|key|phrase|word)',
  'contrase(?:n|\u00F1)a', 'clave(?:\\s+de\\s+acceso)?', 'mot\\s+de\\s+passe', 'motdepasse', 'senha', 'palavra[-\\s]?passe', 'parola\\s+(?:d\'ordine|chiave|segreta)',
  'hasło', 'haslo', 'kata\\s+sandi', 'şifre', 'sifre', 'parola', 'm\u1EADt\\s+kh\u1EA9u',
  '\u043F\u0430\u0440\u043E\u043B[\u044C\u044F\u0435\u0438]?', '\u5BC6\u7801', '\u5BC6\u78BC', '\u53E3\u4EE4', '\u30D1\u30B9\u30EF\u30FC\u30C9', '\u30D1\u30B9\u30EF\u30FC\u30C9', '\uBE44\uBC00\uBC88\uD638', '\uD328\uC2A4\uC6CC\uB4DC',
  '\u0643\u0644\u0645\u0629\\s*(?:\u0627\u0644)?(?:\u0645\u0631\u0648\u0631|\u0627\u0644\u0633\u0631|\u0633\u0631)', '\u0643\u0644\u0645\u0647\\s*(?:\u0627\u0644)?(?:\u0645\u0631\u0648\u0631|\u0627\u0644\u0633\u0631|\u0633\u0631)', '\u0628\u0627\u0633\u0648\u0631\u062F', '\u0631\u0645\u0632\\s*(?:\u0627\u0644)?(?:\u0645\u0631\u0648\u0631|\u0633\u0631\u064A|\u0639\u0628\u0648\u0631)',
  '\u067E\u0627\u0633\\s*\u0648\u0631\u0688', '\u067E\u0627\u0633\u0648\u0631\u0688', '\u062E\u0641\u06CC\u06C1\\s*(?:\u0644\u0641\u0638|\u06A9\u0648\u0688)', '\u067E\u0633\u0648\u0631\u062F', '\u0631\u0645\u0632\\s*\u0639\u0628\u0648\u0631',
  '\u092A\u093E\u0938\u0935\u0930\u094D\u0921', '\u0915\u0942\u091F\u0936\u092C\u094D\u0926', '\u092A\u093E\u0938\u0935\u0930\u094D\u0921', '\u09AA\u09BE\u09B8\u0993\u09AF\u09BC\u09BE\u09B0\u09CD\u09A1', '\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19',
];
const WEAK_PASS_LABELS = [
  'p[a@4]{1,2}s{1,3}', 'pwd', 'pw', 'pswd', 'psw', 'mdp', 'pin', 'secret',
];
const LOGIN_CUE_PARTS = [
  'log[\\W_]{0,2}in', 'login', 'logon', 'sign[\\W_]{0,2}in', 'account', 'acct', 'a\\/c', 'acc', 'mt[\\W_]?[45]', 'metatrader', 'meta\\s*trader', 'investor', 'username', 'user\\s*(?:name|id)',
  'server', 'trading\\s*id', 'credentials?', 'demo', 'access',
  'cuenta', 'usuario', 'compte', 'identifiant', 'konto', 'benutzer', 'conta', 'utente', 'account\\s*number',
  '\u043B\u043E\u0433\u0438\u043D', '\u0430\u043A\u043A\u0430\u0443\u043D\u0442', '\u0441\u0447\u0435\u0442', '\u8D26\u53F7', '\u8D26\u6237', '\u5E10\u53F7', '\u5E33\u865F', '\u30A2\u30AB\u30A6\u30F3\u30C8', '\u30ED\u30B0\u30A4\u30F3', '\uACC4\uC815', '\uB85C\uADF8\uC778',
  '\u062D\u0633\u0627\u0628', '\u0627\u06A9\u0627\u0624\u0646\u0679', '\u0644\u0627\u06AF\\s*\u0627\u0646', '\u062A\u0633\u062C\u064A\u0644\\s*\u0627\u0644\u062F\u062E\u0648\u0644', '\u0916\u093E\u0924\u093E', '\u0932\u0949\u0917\u093F\u0928', '\u0905\u0915\u093E\u0909\u0902\u091F',
];

const STRONG_LABEL_RE = new RegExp('(?<![A-Za-z0-9])(?:' + STRONG_PASS_LABELS.join('|') + ')', 'giu');
const WEAK_LABEL_RE = new RegExp('(?<![A-Za-z0-9])(?:' + WEAK_PASS_LABELS.join('|') + ')(?![A-Za-z0-9])', 'giu');
const LOGIN_CUE_RE = new RegExp('(?<![A-Za-z0-9])(?:' + LOGIN_CUE_PARTS.join('|') + ')', 'iu');

const FILLER = new Set([
  'is', 'are', 'was', 'be', 'to', 'for', 'of', 'the', 'your', 'my', 'our', 'a', 'an', 'it', 'that', 'this', 'as', 'on', 'in', 'at', 'with', 'and', 'or',
  'mt5', 'mt4', 'account', 'login', 'investor', 'test', 'demo', 'new', 'old', 'here', 'below', 'above', 'now', 'again', 'also', 'then', 'follows',
  'es', 'est', 'ist', 'sind', 'e', 'er', 'het', 'jest', 'lo', 'el', 'la', 'le', 'der', 'die', 'das', 'de', 'du', 'des', 'para', 'por', 'pour', 'fur', 'fuer',
  '\u0647\u0648', '\u0647\u064A', '\u0627\u0644\u062E\u0627\u0635', '\u06C1\u06D2', '\u06C1\u06CC\u06BA', '\u06A9\u0627', '\u06A9\u06CC', '\u0939\u0948', '\u0915\u093E', '\u0915\u0940', '\u662F', '\u306F', '\u3067\u3059',
  'hai', 'hain', 'ka', 'ki', 'ke', 'ye', 'yeh', 'woh', 'hamara', 'aapka', 'apka', 'mera', 'meri', 'tumhara',
]);
const SECRET_STOP = new Set([
  'reset', 'resets', 'recovery', 'help', 'change', 'changes', 'changed', 'link', 'email', 'page', 'dashboard', 'button', 'option', 'instruction', 'instructions',
  'forgot', 'forgotten', 'incorrect', 'wrong', 'invalid', 'expired', 'required', 'protected', 'manager', 'management', 'policy', 'rules', 'requirements',
  'strength', 'security', 'please', 'when', 'will', 'can', 'must', 'should', 'not', 'never', 'always', 'only', 'hidden', 'masked', 'sent', 'shared', 'provided',
  'same', 'current', 'correct', 'valid', 'strong', 'weak', 'secure', 'safe', 'private', 'confidential', 'used', 'use', 'set', 'setup', 'created', 'creation',
  'needs', 'contains', 'include', 'including', 'least', 'minimum', 'characters', 'letters', 'numbers', 'digits', 'symbols', 'special', 'uppercase', 'lowercase',
  'capital', 'sensitive', 'unchanged', 'confirmed', 'optional', 'mandatory', 'unavailable', 'attached', 'omitted', 'redacted', 'hash', 'hashed', 'encrypted',
]);

function decodeLayers(input) {
  let s = String(input);
  for (let pass = 0; pass < 3; pass++) {
    const before = s;
    if (/&(?:#x?[0-9a-f]+|[a-z]{2,8});/i.test(s)) {
      s = s.replace(/&#x([0-9a-f]{1,6});/gi, (m, h) => safeCodePoint(parseInt(h, 16), m))
        .replace(/&#(\d{1,7});/g, (m, d) => safeCodePoint(parseInt(d, 10), m))
        .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
        .replace(/&amp;/gi, '&');
    }
    if (/\\u[0-9a-f]{4}|\\x[0-9a-f]{2}|\\u\{[0-9a-f]+\}/i.test(s)) {
      s = s.replace(/\\u\{([0-9a-f]{1,6})\}/gi, (m, h) => safeCodePoint(parseInt(h, 16), m))
        .replace(/\\u([0-9a-f]{4})/gi, (m, h) => safeCodePoint(parseInt(h, 16), m))
        .replace(/\\x([0-9a-f]{2})/gi, (m, h) => safeCodePoint(parseInt(h, 16), m));
    }
    if (/%[0-9a-f]{2}/i.test(s)) {
      s = s.replace(/(?:%[0-9a-f]{2})+/gi, (m) => {
        try { return decodeURIComponent(m); } catch (_) { return m; }
      });
    }
    if (s === before) break;
  }
  return s;
}
function safeCodePoint(cp, fallback) {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return fallback;
  return String.fromCodePoint(cp);
}

function foldChars(s, keepCase, keepScripts) {
  let out = String(s).replace(INVISIBLE_RE, '');
  try { out = out.normalize('NFKC'); } catch (_) { /* keep */ }
  let mapped = '';
  for (const ch of out) mapped += !keepScripts && HOMOGLYPHS.has(ch) ? HOMOGLYPHS.get(ch) : ch;
  mapped = mapped.replace(INVISIBLE_RE, '');
  return keepCase ? mapped : mapped.toLowerCase();
}

function stripTags(s, replacement) {
  return String(s)
    .replace(/<\s*(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]{0,2000}>/g, replacement);
}

function accentless(s) {
  try { return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch (_) { return s; }
}

/** Convert runs of >=5 digits that include at least one worded digit into plain digits. */
function foldWordedDigits(text) {
  const parts = text.split(/([\s,\-\u2013\u2014_.;|\/]+)/);
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const digits = run.map((r) => r.digits).join('');
    if (run.some((r) => r.worded) && digits.length >= 5) out.push(digits, run[run.length - 1].sep);
    else for (const r of run) out.push(r.raw, r.sep);
    run = [];
  };
  const digitOf = (tok) => {
    if (/^\d{1,10}$/.test(tok)) return { digits: tok, worded: false };
    const key = accentless(tok.toLowerCase());
    if (DIGIT_WORDS.has(key)) return { digits: String(DIGIT_WORDS.get(key)), worded: true };
    return null;
  };
  for (let i = 0; i < parts.length; i += 2) {
    const raw = parts[i];
    const sep = parts[i + 1] || '';
    let hit = digitOf(raw);
    if (!hit && MULTIPLIERS.has(accentless(raw.toLowerCase())) && i + 2 < parts.length) {
      const next = digitOf(parts[i + 2]);
      if (next && next.digits.length === 1) {
        hit = { digits: next.digits.repeat(MULTIPLIERS.get(accentless(raw.toLowerCase()))), worded: true };
        run.push({ raw: raw + sep + parts[i + 2], digits: hit.digits, worded: true, sep: parts[i + 3] || '' });
        i += 2;
        continue;
      }
    }
    if (!hit) {
      flush();
      out.push(raw, sep);
    } else run.push({ raw, digits: hit.digits, worded: hit.worded, sep });
  }
  flush();
  return out.join('');
}

/** Candidate login ids: 5-10 digits, optionally written with single separators between digits. */
function extractIds(view) {
  const ids = [];
  const re = /(?<![A-Za-z0-9])\d(?:[ \u00A0.\-\u2013_\u2009\u202F]?\d){4,13}(?![A-Za-z0-9])/g;
  let m;
  while ((m = re.exec(view))) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 5 && digits.length <= 10) ids.push({ digits, start: m.index, end: m.index + m[0].length });
  }
  return ids;
}

function hasUpper(t) { return /[A-Z]/.test(t); }
function hasLower(t) { return /[a-z]/.test(t); }
function hasDigit(t) { return /\d/.test(t); }
function hasSymbol(t) { return /[^A-Za-z0-9\s]/.test(t); }

function trimToken(tok) {
  return String(tok)
    .replace(/^[\p{P}("'`*_\[<{]+/u, '')
    .replace(/[\p{P})"'\u201D\u2019`*_\]>}.,;:!?]+$/u, '');
}

function looksLikeUrlOrMail(tok) {
  return /^(?:https?:|www\.|mailto:|ftp:)/i.test(tok) || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(tok) || /^[\w.-]+\.(?:com|net|org|io|co|app)(?:\/|$)/i.test(tok);
}

function isVersionToken(t) {
  return /^v?\d+(?:[._-]\d+)+(?:[._-][a-z0-9]+)?$/i.test(String(t || ''));
}
/** case-sensitive, read-only, self-service: ordinary words, not secret values. */
function isOrdinaryHyphenWord(t) {
  return /^[a-z]+(?:-[a-z]+)+$/i.test(String(t || ''));
}
/**
 * Letters+digits token that can be a password half of an unlabelled pair or a URL value.
 * Not a version, a filename, a short product code (MT5, v12), or a hyphenated English word.
 */
function isCredentialishMixed(tok) {
  const t = trimToken(tok);
  if (t.length < 8 || t.length > 64) return false;
  if (looksLikeUrlOrMail(t) || /[\/\\]/.test(t) || /^[?#]/.test(t)) return false;
  if (isVersionToken(t) || isOrdinaryHyphenWord(t)) return false;
  if (SECRET_STOP.has(t.toLowerCase()) || FILLER.has(t.toLowerCase())) return false;
  if (!/[A-Za-z]/.test(t) || !/\d/.test(t)) return false;
  if (/^\d+[a-z]{1,4}$/i.test(t)) return false;
  if (/^[a-z]{1,6}\d{1,3}$/i.test(t)) return false;
  if (/^[a-z]+-\d{2,4}$/i.test(t)) return false;
  if (/\.(?:html?|pdf|png|jpe?g|gif|webp|css|js|svg|txt|zip)$/i.test(t)) return false;
  return true;
}

function acceptLabelledSecret(rawTok, strongLabel, explicit) {
  const tok = trimToken(rawTok);
  if (tok.length < 6 || tok.length > 128) return false;
  if (looksLikeUrlOrMail(tok)) return false;
  if (isOrdinaryHyphenWord(tok) || isVersionToken(tok)) return false;
  if (/^[?\/#]/.test(tok)) return false;
  if (SECRET_STOP.has(tok.toLowerCase()) || FILLER.has(tok.toLowerCase())) return false;
  if (!/[\p{L}\p{N}]/u.test(tok)) return false;
  if (/^(.)\1+$/.test(tok)) return false;
  const letters = /[A-Za-z]/.test(tok);
  const digits = hasDigit(tok);
  const symbol = hasSymbol(tok);
  if (!strongLabel) return (letters && digits && tok.length >= 8) || (letters && symbol && digits) || (explicit && letters && (digits || symbol) && tok.length >= 6);
  if (letters && (digits || symbol)) return true;
  if (!letters && digits && tok.length >= 6) return true;
  if (letters && /[a-z][A-Z]/.test(tok) && tok.length >= 8) return true;
  if (!/[A-Za-z]/.test(tok) && /[\p{L}]/u.test(tok) && (digits || symbol)) return true;
  return false;
}

function labelledSecrets(view) {
  const found = [];
  const scan = (re, strong) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(view))) {
      const end = m.index + m[0].length;
      if (view[end] === '?' || view[end] === '/') continue;
      let i = end;
      // Assignment is only ":" or "=". A copula ("password is …") does not open an
      // 8-token window: only the immediate next token can be the value, and only when
      // that token itself is secret-shaped. "password is case-sensitive" is not a hold.
      let assignment = false;
      let bridges = 0;
      let expectImmediate = false;
      for (let hops = 0; hops < 8; hops++) {
        const sepMatch = /^[\s:=\-\u2013\u2014>\[\]()"'\u201C\u201D\u2018\u2019*_`~|\\.,;]*/.exec(view.slice(i, i + 80));
        const sep = sepMatch ? sepMatch[0] : '';
        if (/[:=]/.test(sep)) assignment = true;
        i += sep.length;
        const tm = /^[^\s"'\u201C\u201D\u2018\u2019<>`]+/.exec(view.slice(i, i + 256));
        if (!tm) break;
        let tok = tm[0].split(/&(?=[a-z_]+=)/i)[0];
        if (/[:=]$/.test(tok)) {
          assignment = true;
          tok = tok.replace(/[:=]+$/, '');
        }
        const low = trimToken(tok).toLowerCase();
        if (/^(?:is|are|was|es|est|ist)$/.test(low)) {
          if (!assignment) expectImmediate = true;
          i += tm[0].length;
          continue;
        }
        const immediate = expectImmediate && !assignment && (isStrongToken(tok) || isCredentialishMixed(tok));
        const assigned = (assignment || bridges === 0) && acceptLabelledSecret(tok, strong, assignment || bridges === 0);
        if (immediate || assigned) {
          found.push({ start: i, end: i + tok.length, strong: !!(strong || immediate) });
          break;
        }
        if (expectImmediate && !assignment) break;
        const bridge = (FILLER.has(low) || SECRET_STOP.has(low) || /^[a-z][a-z']{0,14}$/.test(low));
        if (bridge && bridges < 6) {
          bridges += 1;
          i += tm[0].length;
          continue;
        }
        break;
      }
    }
  };
  scan(STRONG_LABEL_RE, true);
  scan(WEAK_LABEL_RE, false);
  return found;
}

function isStrongToken(tok) {
  const t = trimToken(tok);
  if (t.length < 8 || t.length > 32) return false;
  if (looksLikeUrlOrMail(t) || /[\/\\]/.test(t) || /^[?#]/.test(t)) return false;
  if (!(hasUpper(t) && hasLower(t) && hasDigit(t) && hasSymbol(t))) return false;
  if (/^[0-9a-f]{16,}$/i.test(t)) return false;
  return true;
}
function isMixedToken(tok) {
  const t = trimToken(tok);
  if (t.length < 6 || t.length > 64) return false;
  if (looksLikeUrlOrMail(t) || /^[?#\/]/.test(t)) return false;
  if (SECRET_STOP.has(t.toLowerCase()) || FILLER.has(t.toLowerCase())) return false;
  return /[A-Za-z]/.test(t) && (hasDigit(t) || hasSymbol(t)) && !/^\d+[a-z]{1,3}$/i.test(t);
}

function adjacentSecret(view, id, cueAnywhere) {
  const after = /^[\s\/|:;,\u2013\u2014\-\u2192>=&+]{1,6}(?:(?:and|with|pass|pw|\u0627\u0648\u0631)\s+)?(\S{6,64})/i.exec(view.slice(id.end, id.end + 90));
  if (after) {
    const tok = after[1];
    if (isStrongToken(tok) || isCredentialishMixed(tok) || (cueAnywhere && isMixedToken(tok))) return true;
  }
  const head = view.slice(Math.max(0, id.start - 90), id.start);
  const before = /(\S{6,64})[\s\/|:;,\u2013\u2014\-\u2192>=&+]{1,6}$/.exec(head);
  if (before) {
    const tok = before[1];
    if (isStrongToken(tok) || isCredentialishMixed(tok) || (cueAnywhere && isMixedToken(tok))) return true;
  }
  return false;
}

function strongTokenAnywhere(view) {
  for (const raw of view.split(/[\s]+/)) if (raw && isStrongToken(raw)) return true;
  return false;
}

function viewSignals(view) {
  const secrets = labelledSecrets(view);
  return {
    secrets,
    shaped: strongTokenAnywhere(view),
    ids: extractIds(view).filter((id) => !secrets.some((s) => id.start >= s.start && id.end <= s.end)),
    cue: LOGIN_CUE_RE.test(view),
  };
}

/** Pair inside one view. A labelled or strong-shaped secret is a hold even when no login id is present. */
function detectInView(view) {
  const sig = viewSignals(view);
  if (sig.ids.length) {
    if (sig.secrets.length) {
      const near = sig.ids.some((id) => sig.secrets.some((s) => Math.abs(s.start - id.end) <= 80 || Math.abs(id.start - s.end) <= 80));
      if (sig.cue || near) return CODES.LABELLED;
    }
    if (sig.ids.some((id) => adjacentSecret(view, id, sig.cue))) return CODES.UNLABELLED;
    if (sig.cue && sig.shaped) return CODES.SPLIT;
  }
  // A weak label ("pass", "pw") is not enough on its own: "Pack Pass: credit-purchased" is
  // ordinary catalog text. Only a strong password-label, or a strong-shaped token, holds with no id.
  if (sig.secrets.some((s) => s.strong)) return CODES.SECRET_LABELLED;
  if (sig.shaped) return CODES.SECRET_SHAPED;
  return null;
}

/**
 * A pair split across the current customer-visible text and recent turns.
 * Holds only when the current text itself supplies one half (a secret, or an id with a login cue)
 * and the context supplies the other half. An innocent reply is not held just because history
 * already contained a pair.
 */
function detectContextSplit(view, contextViews) {
  if (!contextViews || !contextViews.length) return null;
  const cur = viewSignals(view);
  const curSecret = cur.secrets.some((s) => s.strong) || cur.shaped;
  const curId = cur.ids.length > 0 && cur.cue;
  if (!curSecret && !curId) return null;
  for (const cv of contextViews) {
    const ctx = viewSignals(cv.text);
    const ctxSecret = ctx.secrets.some((s) => s.strong) || ctx.shaped;
    const ctxId = ctx.ids.length > 0 && ctx.cue;
    if ((curSecret && ctxId) || (curId && ctxSecret)) return CODES.CONTEXT;
  }
  return null;
}

const PASSWORD_QUERY_KEY = /^(?:p|pass|password|passwd|pwd|pw|passcode|secret|investorpassword|investor_password)$/;
const LOGIN_QUERY_KEY = /^(?:login|account|acct|accountid|account_id|user|username|userid|user_id|investor|mt5|mt5login|id|u)$/;

function componentSecret(value, passwordKey) {
  const dec = safeDecode(value);
  const folded = foldChars(dec, true);
  if (isStrongToken(dec) || isStrongToken(folded)) return 'strong';
  if (isCredentialishMixed(dec) || isCredentialishMixed(folded)) return 'mixed';
  if (passwordKey && acceptLabelledSecret(dec, true, true)) return 'labelled';
  return '';
}

/** One URL. A login id alone is not a hold. A secret in the query, userinfo, fragment, or beside an id in the path is. */
function oneUrlHasCredential(raw) {
  let u = safeDecode(String(raw || '')).replace(/[),.;]+$/g, '');
  if (!u) return false;
  const ids = [];
  const secrets = [];
  const noteId = (v) => {
    const digits = foldChars(safeDecode(v), false).replace(/\D/g, '');
    if (/^\d{5,10}$/.test(foldChars(safeDecode(v), false)) && digits.length >= 5 && digits.length <= 10) ids.push(digits);
  };
  const noteSecret = (v, passwordKey) => {
    const kind = componentSecret(v, passwordKey);
    if (kind) secrets.push(kind);
  };
  const info = /\/\/([^\/\s@]+)@/.exec(u);
  if (info && info[1].includes(':')) {
    const parts = safeDecode(info[1]).split(':');
    const user = parts[0] || '';
    const pw = parts.slice(1).join(':');
    noteId(user);
    if (pw) noteSecret(pw, true);
  }
  let rest = u;
  const hash = rest.indexOf('#');
  const frag = hash >= 0 ? rest.slice(hash + 1) : '';
  if (hash >= 0) rest = rest.slice(0, hash);
  const qi = rest.indexOf('?');
  const query = qi >= 0 ? rest.slice(qi + 1) : '';
  const path = qi >= 0 ? rest.slice(0, qi) : rest;
  if (query) {
    for (const pair of query.split(/[&;]/)) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      if (eq < 0) { noteId(pair); noteSecret(pair, false); continue; }
      const k = foldChars(safeDecode(pair.slice(0, eq)), false);
      const v = pair.slice(eq + 1);
      if (LOGIN_QUERY_KEY.test(k)) noteId(v);
      noteSecret(v, PASSWORD_QUERY_KEY.test(k));
      if (!LOGIN_QUERY_KEY.test(k)) noteId(v);
    }
  }
  if (frag) {
    for (const bit of frag.split(/[:;&\/?=]/)) {
      if (!bit) continue;
      noteId(bit);
      noteSecret(bit, false);
    }
  }
  let pathId = false;
  let pathSecret = false;
  for (const seg of path.split('/')) {
    if (!seg) continue;
    const dec = safeDecode(seg);
    if (/^\d{5,10}$/.test(foldChars(dec, false))) { pathId = true; ids.push(dec); }
    if (isStrongToken(dec) || isCredentialishMixed(dec)) pathSecret = true;
  }
  if (pathId && pathSecret) return true;
  if (ids.length && secrets.length) return true;
  // A secret-shaped or password-like value in the query, fragment, or userinfo holds
  // even without a login id. A path filename does not.
  if (secrets.length && (query || frag || (info && info[1].includes(':')))) return true;
  return false;
}

function urlParamPair(decoded) {
  const text = String(decoded || '');
  const found = text.match(/https?:\/\/[^\s"'<>]{4,2000}|www\.[^\s"'<>]{4,2000}/gi) || [];
  const whole = text.trim();
  if (/^(?:https?:\/\/|www\.)/i.test(whole) && !found.includes(whole)) found.push(whole);
  for (const u of found) if (oneUrlHasCredential(u)) return true;
  return false;
}
function safeDecode(s) {
  try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); } catch (_) { return String(s); }
}

function rot13(s) {
  return s.replace(/[a-z]/gi, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function decodedSegments(text) {
  const out = [];
  for (const m of text.matchAll(/(?<![A-Za-z0-9+\/])[A-Za-z0-9+\/]{20,}={0,2}(?![A-Za-z0-9+\/])/g)) {
    try {
      const buf = Buffer.from(m[0], 'base64');
      const str = buf.toString('utf8');
      if (str.length >= 8 && /^[\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]+$/.test(str) && !/\uFFFD/.test(str)) out.push(str);
    } catch (_) { /* not base64 */ }
  }
  for (const m of text.matchAll(/(?<![0-9a-fA-F])(?:[0-9a-fA-F]{2}){10,}(?![0-9a-fA-F])/g)) {
    try {
      const str = Buffer.from(m[0], 'hex').toString('utf8');
      if (str.length >= 8 && /^[\x09\x0A\x0D\x20-\x7E]+$/.test(str)) out.push(str);
    } catch (_) { /* not hex */ }
  }
  return out;
}

function buildViews(text) {
  const decoded = decodeLayers(text);
  const views = [];
  const add = (name, t) => { if (t && !views.some((v) => v.text === t)) views.push({ name, text: t }); };
  const noTagsJoin = stripTags(decoded, '');
  const noTagsSpace = stripTags(decoded, ' ');
  for (const [name, base] of [['plain', noTagsJoin], ['spaced', noTagsSpace]]) {
    const folded = foldChars(base, true);
    add(name, folded);
    add(name + '+worded', foldWordedDigits(folded));
    // Look-alike folding turns genuine Arabic/Cyrillic/Greek label letters into Latin ones, so the
    // unfolded-script view is checked as well.
    const native = foldChars(base, true, true);
    add(name + '+native', native);
    add(name + '+native+worded', foldWordedDigits(native));
  }
  add('rot13', rot13(foldChars(noTagsJoin, true)));
  return { views, decoded };
}

function contextViewsOf(contextText) {
  if (!contextText || !String(contextText).trim()) return [];
  try {
    return buildViews(String(contextText)).views;
  } catch (_) {
    return [];
  }
}

function inspect(input, contextText) {
  let raw = '';
  const result = { hold: false, code: '', tier: '', view: '', len: 0 };
  try {
    raw = input === undefined || input === null ? '' : String(input);
  } catch (_) {
    return { ...result, hold: true, code: CODES.ERROR, tier: 'error' };
  }
  const len = raw.length;
  result.len = len;
  if (!raw.trim()) return result;
  try {
    if (len > MAX_SCAN_CHARS) return { ...result, hold: true, code: CODES.TOO_LARGE, tier: 'size' };
    const { views, decoded } = buildViews(raw);
    const ctxViews = contextViewsOf(contextText);
    // Approved containment guard, unchanged, on the screened/rendered text and on tag-stripped text.
    const guardInputs = [['raw', raw], ['decoded', decoded], ...views.filter((v) => v.name === 'plain' || v.name === 'spaced').map((v) => [v.name, v.text])];
    for (const [name, t] of guardInputs) {
      if (guard.blocksPublicCredentialPair(t)) return { ...result, hold: true, code: CODES.GUARD, tier: 'guard', view: name };
    }
    for (const v of views) {
      const code = detectInView(v.text) || detectContextSplit(v.text, ctxViews);
      if (code) return { ...result, hold: true, code, tier: 'detector', view: v.name };
    }
    if (urlParamPair(decoded)) return { ...result, hold: true, code: CODES.URL, tier: 'url', view: 'decoded' };
    for (const seg of decodedSegments(raw).concat(decodedSegments(decoded))) {
      const sub = buildViews(seg);
      if (guard.blocksPublicCredentialPair(seg)) return { ...result, hold: true, code: CODES.ENCODED, tier: 'encoded', view: 'segment' };
      for (const v of sub.views) {
        if (detectInView(v.text) || detectContextSplit(v.text, ctxViews)) return { ...result, hold: true, code: CODES.ENCODED, tier: 'encoded', view: 'segment:' + v.name };
      }
    }
    return result;
  } catch (_) {
    return { ...result, hold: true, code: CODES.ERROR, tier: 'error' };
  }
}

/**
 * Customer-visible content only. Object keys and envelope ids (admin_id, message_type, type, …)
 * are never inspected. Known content fields and link/attachment URL fields are collected by name;
 * HTML bodies also contribute their visible text and href/src targets.
 */
const CONTENT_FIELDS = new Set(['body', 'html', 'text', 'plain_text', 'message', 'content']);
const URL_FIELDS = new Set(['url', 'href', 'src', 'attachment_url', 'content_url', 'download_url', 'link']);

function isContentKey(key) {
  return CONTENT_FIELDS.has(key);
}
function isUrlKey(key) {
  return URL_FIELDS.has(key) || /(?:^|_)(?:url|href|src)$/.test(key) || /_urls$/.test(key);
}

function hrefsInHtml(html) {
  const urls = [];
  const re = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const u = m[1] || m[2] || m[3] || '';
    if (u) urls.push(u);
  }
  return urls;
}

function pushVisibleString(out, parentKey, value) {
  if (typeof value !== 'string' || !value) return;
  if (isContentKey(parentKey)) {
    const text = stripTags(value, ' ');
    if (text.trim()) out.push(text);
    for (const u of hrefsInHtml(value)) out.push(u);
  } else if (isUrlKey(parentKey)) {
    out.push(value);
  }
}

function collectVisible(value, out, depth, parentKey) {
  if (depth > 6 || out.length > 200 || value == null) return out;
  if (typeof value === 'string') {
    pushVisibleString(out, parentKey, value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && isUrlKey(parentKey)) out.push(item);
      else collectVisible(item, out, depth + 1, parentKey);
    }
    return out;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collectVisible(v, out, depth + 1, String(k).toLowerCase());
  }
  return out;
}

const contextByConv = new Map();
const MAX_CONTEXT_TEXTS = 8;
const MAX_CONTEXT_CHARS = 4000;

/** Recent public customer and outgoing bodies for one conversation. Detection only; not logged. */
function rememberConversationContext(conversationId, texts) {
  const id = String(conversationId || '');
  if (!id) return;
  const kept = [];
  let budget = MAX_CONTEXT_CHARS;
  const arr = Array.isArray(texts) ? texts : [];
  for (let i = arr.length - 1; i >= 0 && kept.length < MAX_CONTEXT_TEXTS; i--) {
    let t = '';
    try { t = String(arr[i] == null ? '' : arr[i]).slice(0, 2000); } catch (_) { t = ''; }
    if (!t.trim() || t.length > budget) continue;
    budget -= t.length;
    kept.push(t);
  }
  contextByConv.set(id, kept.reverse());
}

function contextFor(conversationId) {
  const list = contextByConv.get(String(conversationId || ''));
  return list && list.length ? list.join('\n') : '';
}

/**
 * Hold decision for text that is about to leave as a public customer message.
 * `screened` is the text after publicReplyBoundary.screen; `rendered` is the payload body after
 * toHtml. Both are inspected, and so is their concatenation (a pair assembled across them).
 */
function holdFinalPublic({ screened, rendered, conversationId } = {}) {
  const ctx = contextFor(conversationId);
  const views = [['screened', screened], ['rendered', rendered]];
  for (const [stage, text] of views) {
    const r = inspect(text, ctx);
    if (r.hold) return { ...r, stage };
  }
  const joined = inspect(String(screened || '') + '\n' + String(rendered || ''), ctx);
  if (joined.hold) return { ...joined, stage: 'joined' };
  return null;
}

/**
 * Hold decision on the actual transport payload of an Intercom write. Any write whose
 * message_type is not an internal note is treated as customer-visible. Only customer-visible
 * content is inspected (body text, rendered HTML text, href/src, attachment URLs). Envelope
 * keys and ids are not.
 */
const ERROR_HOLD = (stage) => ({ hold: true, code: CODES.ERROR, tier: 'error', view: '', len: 0, stage });

function holdOutgoingPayload(method, data, opts) {
  try {
    const m = String(method || 'get').toLowerCase();
    if (['get', 'head', 'options'].includes(m)) return null;
    if (!data || typeof data !== 'object') return null;
    if (String(data.message_type || '') === 'note') return null;
    const cid = opts && opts.conversationId;
    return holdStrings(collectVisible(data, [], 0, ''), 'payload', contextFor(cid));
  } catch (_) {
    return ERROR_HOLD('payload');
  }
}

function isStandaloneUrl(s) {
  const t = String(s || '').trim();
  return !!t && !/\s/.test(t) && /^(?:https?:\/\/|www\.|mailto:)/i.test(t);
}

/** URL fields are judged by the URL rule only. They are not joined into prose, so a word like "password" cannot consume a later link token. */
function holdStrings(all, stage, contextText) {
  const strings = all.filter((s) => s && s.length);
  const prose = [];
  const urls = [];
  for (const s of strings) (isStandaloneUrl(s) ? urls : prose).push(s);
  for (const s of prose) {
    const r = inspect(s, contextText);
    if (r.hold) return { ...r, stage };
  }
  for (const s of urls) {
    try {
      const decoded = decodeLayers(s);
      if (guard.blocksPublicCredentialPair(s) || guard.blocksPublicCredentialPair(decoded)) {
        return { hold: true, code: CODES.GUARD, tier: 'guard', view: 'url', len: s.length, stage: stage + '-url' };
      }
      if (urlParamPair(decoded) || urlParamPair(s)) {
        return { hold: true, code: CODES.URL, tier: 'url', view: 'url', len: s.length, stage: stage + '-url' };
      }
    } catch (_) {
      return ERROR_HOLD(stage + '-url');
    }
  }
  if (prose.length > 1) {
    const r = inspect(prose.join('\n'), contextText);
    if (r.hold) return { ...r, stage: stage + '-joined' };
  }
  return null;
}

/** Plan bodies persisted by the owner-command ledger: hold before anything reaches disk. */
function holdPlanForPersistence(plan, opts) {
  try {
    if (!plan || typeof plan !== 'object') return null;
    const cid = opts && opts.conversationId;
    return holdStrings(collectVisible(plan, [], 0, ''), 'plan', contextFor(cid));
  } catch (_) {
    return ERROR_HOLD('plan');
  }
}

function holdResult(hold) {
  return {
    ok: false,
    skipped: true,
    held: true,
    reason: 'credential-hold',
    holdCode: hold.code,
  };
}

const STAFF_NOTE_CODES = new Set([
  'NOT_APPROVED_OUTPUT',
  'ATTACHMENT_DENIED',
  'URL_DENIED',
  'NON_SENDABLE',
  'MULTI_BODY_DENIED',
  'COVERAGE_DENIED',
  'NAME_SLOT_DENIED',
]);

function safeCode(code) {
  return /^[A-Z0-9_]{1,48}$/.test(String(code || '')) ? String(code) : 'CRED_HOLD';
}

/** Fixed staff note. Only the seven public-write deny codes. CRED_* posts nothing. */
function staffHoldNote(code) {
  const c = String(code || '');
  if (!STAFF_NOTE_CODES.has(c)) return null;
  return 'Reply held by safety check (reason: ' + c + '). Nothing was sent to the customer.';
}

function logLine(conversationId, hold) {
  return ['CREDENTIAL_HOLD', String(conversationId || ''), 'stage=' + (hold.stage || ''), 'code=' + safeCode(hold.code), 'len=' + Number(hold.len || 0)];
}

module.exports = {
  VERSION,
  CODES,
  KNOWN_GAPS,
  MAX_SCAN_CHARS,
  inspect,
  rememberConversationContext,
  holdFinalPublic,
  holdOutgoingPayload,
  holdPlanForPersistence,
  holdResult,
  staffHoldNote,
  logLine,
  safeCode,
};
