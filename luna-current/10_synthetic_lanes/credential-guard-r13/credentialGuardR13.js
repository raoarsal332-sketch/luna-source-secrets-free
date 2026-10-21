'use strict';

/**
 * Credential guard R13 — frozen staging candidate.
 *
 * One fail-closed outbound authorization boundary. Every Intercom write,
 * control-panel send, and model request goes through guardedSend. Raw
 * axios/http/https clients are sealed by a require tripwire and throw
 * unless a one-shot permit is held. Decisions use provenance: inbound
 * credential values are canonicalized and stored as hashes. Fragments,
 * split-turn joins, and other MT5 account numbers beside a credential cue
 * are hashed too. High-entropy spans are a secondary check only.
 *
 * Not wired into the live engine. approved, release, and wired stay false.
 * system-prompt.txt is the owner-authorized public 55188 disclosure. This
 * module does not read or edit that file.
 */

const crypto = require('crypto');
const Module = require('module');
const originalRequire = Module.prototype.require;

const STATUS = Object.freeze({
  candidate: 'credential-guard-r13',
  frozen: true,
  approved: false,
  release: false,
  wired: false,
  silent: false,
});

const FIXED_MESSAGE =
  'Please change that immediately. I will not repeat it back. I am escalating this as a security event for the team.';

const REDACTED_NOTE =
  'Internal note withheld. A credential was removed before this note was saved.';

const SPREAD_TEST_REPLY =
  'TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server\n\n' +
  'Platform: MetaTrader 5\n' +
  'Server: Fundedelite-Server\n' +
  'Account Number: 55188\n' +
  'Password: QBG5FetfozKz7^a?J!\n\n' +
  'Use this account to check spreads.';

const TEMPLATE_PASSWORD = 'QBG5FetfozKz7^a?J!';
const WORKSPACE_ID = 'h2z8cgfr';
const TEMPLATE_HASH = crypto.createHash('sha256').update(SPREAD_TEST_REPLY, 'utf8').digest('hex');
const FIXED_HASH = crypto.createHash('sha256').update(FIXED_MESSAGE, 'utf8').digest('hex');

const AUTHORIZED_PROMPT_DISCLOSURE = Object.freeze({
  path: 'system-prompt.txt',
  sha256: 'bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d',
  length: 77282,
  account: '55188',
  kind: 'owner-authorized-public-template',
});

const MAX_SCAN = 32768;
const SIZE_CAP = 16384;
const GUARD_BUDGET_MS = 200;
const MAX_TAINT = 4000;
const MAX_DECODE = 8;
const MAX_DEPTH = 4;

const AUTHORIZED_HOSTS = [
  'fundedelite.com',
  'confirmo.net',
  'intercom.io',
  'intercom.com',
  'trustpilot.com',
  'propfirmmatch.com',
];

const FILLER = new Set('is are was were be been the a an my your our their his her to of for me it this that and or with on in at from you we'.split(' '));
const INSTRUCTION = new Set((
  'reset instructions instruction change policy policies requirements recovery manager section field form box below above here following page link button process steps guide help support update updated settings option options rules rule information details email number account dashboard trading service fixed cannot changed containing receive important copy sharing ' +
  'review reviews note notes team teammate please hello hi hey thanks thank welcome'
).split(' ').filter(Boolean));

const WORD_CUES = new Set([
  'password', 'passcode', 'passwd', 'pwd', 'pin', 'otp', 'totp', 'secret', 'passphrase', 'passwort',
  'contrasena', 'senha', 'parola', 'clave', 'wachtwoord', 'haslo', 'lozinka', 'geslo', 'salasana',
  'jelszo', 'sifre', 'parol', 'apikey', 'keycode', 'passphrase',
  'пароль', 'пин', 'секрет', '密码', 'パスワード', '비밀번호', 'पासवर्ड', 'पिन', 'ओटीपी', 'پاسورڈ',
  'رمز', 'سر',
]);
const GLUE_CUES = new Set(['password', 'passcode', 'passwd', 'pwd', 'pin', 'otp', 'totp', 'secret', 'pass', 'apikey', 'token', 'key']);
const MULTI_CUES = ['mot de passe', 'palabra clave', 'kata sandi', 'كلمة السر', 'كلمة المرور', 'پاس ورڈ', 'api key', 'api_key', 'one time code', 'one-time code', 'verification code'];

const DICT = new Set((
  'a an the of to and or for is are was were be been being in on at by with from as that this it its if then so not no yes you your we our they them he she his her my me i do did does can could would should will just about into over after before up down out off than too very also only other new one two three four five six seven eight nine ten please change immediately repeat back am escalating security event team hello hi hey ' +
  'password reset instructions account number spread spreads challenge payout payouts site hope pass what use check test demo send give server platform testing details funded elite metatrader dashboard login credentials credential email access after purchasing receive important help set start journey anytime clicking show section monitor statistics track requirements request find view certificates edit settings containing service information cannot changed fixed copy sharing weekend flash activation ' +
  'https http www com net org faq app tech en articles article collections collection how does work instant additional info restricted countries process profit split trading contract signing minimum holding time trades tradable instruments commissions rolling passing hedge hedging latency arbitrage spamming strategy risk limits general documentation required live simulated verification operate under regulation free trial pay payment payments credit debit card cards wire transfers crypto processor affiliate taxes tax independent contractor responsible location applicable laws merge transition ensure personal financial seriously employ industry standard measures protect includes encryption secure processing regular audits evaluation phase phases type specific criteria passing achieve target avoid daily total drawdown complete profitable respect consistency present rules parameters easily monitored updated within maximum seconds custom made checkout website suitable option accept major methods ' +
  'fundedelite confirmo tradelocker metatrader5 mt4 mt5 intercom trustpilot propfirmmatch support client clients message messages ticket tickets review note notes owner teammate sorry thanks thank welcome ok okay sure yes yep yeah alright got understood noted perfect great question questions answer answers policy rule rules country countries kyc identity document documents proof address bank statement utility bill withdrawal deposit bonus promotion promo leverage margin stop loss take profit news economic calendar session sessions market markets pair pairs forex index indices commodity commodities gold silver oil ' +
  'where when who why which while during without within between across per each both same such more most less least many much some any all own here there then once again still already every day days week weeks month months year years hour hours minute minutes next last current open closed pending active inactive available unavailable allowed prohibited restricted violation violations breach fail failed failure success successful pass passed passing retry retries refund refunds fee fees price prices cost costs plan plans step steps lite instant flash standard pro plus premium basic advanced beginner ' +
  'about above across after again against all almost along already also although always among amount amounts another answer any anyone anything around asked asking available away back became because become before began behind being below best better between beyond both bring brought call called calling came cannot case cases certain change changed changes clear close closed come comes coming common company complete completed concern considered could country course current different does doing done during each early either else end ended enough even ever every example fact facts far few final find first follow following form former found four full further gave general get gets getting give given gives go going gone good got great had has have having held help high him himself home however human idea important include including interest into itself just keep kept kind knew know known large later leave left let life light like likely line little long look looked looking made make makes making man may mean means might move much must name named near need needed needs never next night none nor nothing now numbers off often old once only onto open opened order ordered other others out over own part parts people per perhaps person place plan point possible present problem problems program public put rather really right said same saw say says see seem seemed seen set several should show showed shown side since small some something sometimes still such system take taken takes taking tell than their them there these they thing things think third this those though thought three through thus time times today together too took toward turn two under until upon us used using very want wanted way well went were what when where which while who whole whom will within without work worked working would year years yet'
).split(' ').filter(Boolean));

const SPREAD_MARKERS = ['spread', 'spreads', 'سپریڈ', 'اسپریڈ', 'स्प्रेड', 'سبريد', 'السبريد'];
const CHECK_MARKERS = ['check', 'test', 'demo', 'account', 'credentials', 'چیک', 'ٹیسٹ', 'اکاؤنٹ', 'اکاونٹ', 'चेक', 'टेस्ट', 'अकाउंट', 'खाता', 'حساب', 'اختبار', 'أتحقق', 'اختبر', 'افحص', 'تحقق', 'فحص'];
const HOW_MARKERS = ['how', 'kaise', 'कैसे', 'کیسے', 'كيف', 'طریقہ', 'तरीका', 'طريق', 'بتائ', 'बता'];
const SEND_MARKERS = ['send', 'give me', 'bhej', 'dena', 'بھیج', 'भेज', 'أرسل', 'mujhe', 'mjhe', 'مجھے', 'मुझे'];
const GREETINGS = new Set(['hello', 'hi', 'hey', 'ciao', 'salam', 'dear', 'good', 'morning', 'afternoon', 'evening', 'السلام', 'علیکم', 'علیكم']);

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', copy: '(c)', reg: '(r)',
};

const FOLD = new Map();

function addLetterRange(start, letters) {
  for (let i = 0; i < letters.length; i++) FOLD.set(start + i, letters[i]);
}

addLetterRange(0x1D400, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
addLetterRange(0x1D41A, 'abcdefghijklmnopqrstuvwxyz');
addLetterRange(0x1D434, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
addLetterRange(0x1D44E, 'abcdefg');
addLetterRange(0x1D456, 'ijklmnopqrstuvwxyz');
addLetterRange(0x1D468, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
addLetterRange(0x1D482, 'abcdefghijklmnopqrstuvwxyz');
addLetterRange(0x1D4D0, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
addLetterRange(0x1D4EA, 'abcdefghijklmnopqrstuvwxyz');
addLetterRange(0x1D56C, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
addLetterRange(0x1D586, 'abcdefghijklmnopqrstuvwxyz');
addLetterRange(0x1D5A0, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
addLetterRange(0x1D5BA, 'abcdefghijklmnopqrstuvwxyz');
addLetterRange(0x1D5D4, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
addLetterRange(0x1D5EE, 'abcdefghijklmnopqrstuvwxyz');
addLetterRange(0x1D608, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
addLetterRange(0x1D622, 'abcdefghijklmnopqrstuvwxyz');
addLetterRange(0x1D63C, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
addLetterRange(0x1D656, 'abcdefghijklmnopqrstuvwxyz');
addLetterRange(0x1D670, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
addLetterRange(0x1D68A, 'abcdefghijklmnopqrstuvwxyz');
addLetterRange(0x1D7CE, '0123456789');
addLetterRange(0x1D7D8, '0123456789');
addLetterRange(0x1D7E2, '0123456789');
addLetterRange(0x1D7EC, '0123456789');
addLetterRange(0x1D7F6, '0123456789');

const HOMO = {
  0x210E: 'h', 0x212C: 'B', 0x2130: 'E', 0x2131: 'F', 0x210B: 'H', 0x2110: 'I', 0x2112: 'L', 0x2133: 'M', 0x211B: 'R',
  0x212F: 'e', 0x210A: 'g', 0x2134: 'o', 0x212D: 'C', 0x210C: 'H', 0x2111: 'I', 0x211C: 'R', 0x2102: 'C', 0x210D: 'H',
  0x2115: 'N', 0x2119: 'P', 0x211A: 'Q', 0x211D: 'R', 0x2124: 'Z',
  0x0430: 'a', 0x0435: 'e', 0x043E: 'o', 0x0440: 'p', 0x0441: 'c', 0x0443: 'y', 0x0445: 'x', 0x0456: 'i', 0x0455: 's',
  0x04BB: 'h', 0x043D: 'h', 0x0410: 'A', 0x0415: 'E', 0x041E: 'O', 0x0420: 'P', 0x0421: 'C', 0x0425: 'X', 0x041D: 'H',
  0x0391: 'A', 0x0392: 'B', 0x0395: 'E', 0x0397: 'H', 0x0399: 'I', 0x039A: 'K', 0x039C: 'M', 0x039D: 'N', 0x039F: 'O',
  0x03A1: 'P', 0x03A4: 'T', 0x03A7: 'X', 0x03B1: 'a', 0x03B5: 'e', 0x03B9: 'i', 0x03BA: 'k', 0x03BF: 'o', 0x03C1: 'p',
  0x03C4: 't', 0x03C5: 'u', 0x03C7: 'x', 0x0251: 'a', 0x0259: 'e', 0x0261: 'g',
};

const taintByConversation = new Map();
const recentPieces = new Map();
const secretHashes = new Set();
const templateHashes = new Set();
const borderline = [];
const lastAskByConversation = new Map();
const tickets = new Set();
let ticketSeq = 1;
let permit = null;
let requireHooked = false;

function payloadHash(text) {
  return crypto.createHash('sha256').update(String(text == null ? '' : text), 'utf8').digest('hex');
}

function digest(value) {
  return crypto.createHash('sha256').update('cg13:' + value, 'utf8').digest('hex');
}

function boundsError() {
  const err = new Error('bounds');
  err.code = 'BOUNDS';
  return err;
}

function assertScannable(text) {
  const raw = String(text == null ? '' : text);
  if (raw.length > MAX_SCAN) throw boundsError();
  let runLt = 0;
  let runAmp = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '<') {
      runLt += 1;
      if (runLt > 32) throw boundsError();
    } else runLt = 0;
    if (ch === '&') {
      runAmp += 1;
      if (runAmp > 32) throw boundsError();
    } else runAmp = 0;
  }
  return raw;
}

function isFormat(cp) {
  if (cp === 0xFEFF || cp === 0x180E || cp === 0x200B || cp === 0x200C || cp === 0x200D || cp === 0x2060) return true;
  if (cp >= 0x200E && cp <= 0x200F) return true;
  if (cp >= 0x202A && cp <= 0x202E) return true;
  if (cp >= 0x2066 && cp <= 0x2069) return true;
  if (cp >= 0xFE00 && cp <= 0xFE0F) return true;
  if (cp >= 0x0300 && cp <= 0x036F) return true;
  if (cp >= 0x1AB0 && cp <= 0x1AFF) return true;
  if (cp >= 0x1DC0 && cp <= 0x1DFF) return true;
  if (cp >= 0x20D0 && cp <= 0x20FF) return true;
  return false;
}

function foldCp(cp) {
  if (HOMO[cp]) return HOMO[cp];
  if (FOLD.has(cp)) return FOLD.get(cp);
  return null;
}

function decodeEntities(text) {
  let src = String(text || '');
  for (let round = 0; round < 4; round++) {
    let out = '';
    let changed = false;
    for (let i = 0; i < src.length; i++) {
      if (src[i] !== '&') { out += src[i]; continue; }
      const semi = src.indexOf(';', i + 1);
      if (semi < 0 || semi - i > 12) { out += src[i]; continue; }
      const body = src.slice(i + 1, semi);
      let value = null;
      if (body[0] === '#' && (body[1] === 'x' || body[1] === 'X')) {
        const hex = body.slice(2);
        if (hex && hex.length <= 6) {
          let n = 0;
          let ok = true;
          for (let h = 0; h < hex.length; h++) {
            const c = hex.charCodeAt(h);
            let d = -1;
            if (c >= 48 && c <= 57) d = c - 48;
            else if (c >= 97 && c <= 102) d = c - 87;
            else if (c >= 65 && c <= 70) d = c - 55;
            if (d < 0) { ok = false; break; }
            n = (n * 16) + d;
          }
          if (ok && n > 0 && n <= 0x10FFFF) value = String.fromCodePoint(n);
        }
      } else if (body[0] === '#') {
        const dec = body.slice(1);
        if (dec && dec.length <= 7) {
          let n = 0;
          let ok = true;
          for (let h = 0; h < dec.length; h++) {
            const c = dec.charCodeAt(h);
            if (c < 48 || c > 57) { ok = false; break; }
            n = (n * 10) + (c - 48);
          }
          if (ok && n > 0 && n <= 0x10FFFF) value = String.fromCodePoint(n);
        }
      } else if (NAMED_ENTITIES[body.toLowerCase()]) value = NAMED_ENTITIES[body.toLowerCase()];
      if (value == null) { out += src[i]; continue; }
      out += value;
      i = semi;
      changed = true;
    }
    src = out;
    if (!changed) break;
  }
  return src;
}

function plainText(text) {
  const bounded = assertScannable(text);
  const decoded = decodeEntities(bounded);
  let out = '';
  for (let i = 0; i < decoded.length; i++) {
    if (decoded[i] !== '<') {
      const ch = decoded[i];
      if (ch === '\u00a0') out += ' ';
      else if (ch !== '\r') out += ch;
      continue;
    }
    if (decoded.slice(i, i + 4) === '<!--') {
      const end = decoded.indexOf('-->', i + 4);
      if (end < 0 || end - i > 200) { out += '<'; continue; }
      i = end + 2;
      continue;
    }
    const gt = decoded.indexOf('>', i + 1);
    if (gt < 0 || gt - i > 80) { out += '<'; continue; }
    const tag = decoded.slice(i + 1, gt).toLowerCase();
    let name = '';
    let n = tag[0] === '/' ? 1 : 0;
    let nameOk = true;
    while (n < tag.length) {
      const c = tag[n];
      const code = c.charCodeAt(0);
      const alnum = (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
      if (!alnum) break;
      name += c;
      n += 1;
    }
    if (!name) nameOk = false;
    else if (n < tag.length && tag[n] !== ' ' && tag[n] !== '/' && tag[n] !== '\t') nameOk = false;
    if (!nameOk) { out += '<'; continue; }
    if (name === 'br' || name === 'p' || name === 'div' || name === 'li' || name === 'tr') out += '\n';
    i = gt;
  }
  return out;
}

function skeletonChar(ch) {
  const cp = ch.codePointAt(0);
  if (isFormat(cp)) return '';
  const folded = foldCp(cp);
  const base = folded == null ? ch : folded;
  let out = '';
  const norm = base.normalize ? base.normalize('NFKC') : base;
  for (let i = 0; i < norm.length; i++) {
    const ncp = norm.codePointAt(i);
    const width = ncp > 0xFFFF ? 2 : 1;
    if (!isFormat(ncp)) {
      const again = foldCp(ncp);
      out += (again == null ? String.fromCodePoint(ncp) : again).toLowerCase();
    }
    i += width - 1;
  }
  return out;
}

function skeletonOf(text) {
  const src = String(text || '');
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const cp = src.codePointAt(i);
    const width = cp > 0xFFFF ? 2 : 1;
    out += skeletonChar(String.fromCodePoint(cp));
    i += width - 1;
  }
  return out;
}

function alnumOf(text) {
  const sk = skeletonOf(text);
  let out = '';
  for (let i = 0; i < sk.length; i++) {
    const c = sk.charCodeAt(i);
    if ((c >= 48 && c <= 57) || (c >= 97 && c <= 122)) out += sk[i];
  }
  return out;
}

function collapseSpaces(line) {
  let out = '';
  let space = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t') {
      space = true;
    } else {
      if (space && out) out += ' ';
      space = false;
      out += ch;
    }
  }
  return out.trim();
}

function paragraphKey(text) {
  const plain = plainText(text);
  const lines = [];
  let cur = '';
  for (let i = 0; i < plain.length; i++) {
    if (plain[i] === '\n') {
      const line = collapseSpaces(cur);
      if (line) lines.push(line);
      cur = '';
    } else cur += plain[i];
  }
  const last = collapseSpaces(cur);
  if (last) lines.push(last);
  return lines.join('\n');
}

const TEMPLATE_PARAGRAPHS = paragraphKey(SPREAD_TEST_REPLY);
const CANONICAL_TEMPLATE_HASH = payloadHash(TEMPLATE_PARAGRAPHS);

function rememberHash(set, surface) {
  const alnum = alnumOf(surface);
  const sk = skeletonOf(surface);
  if (alnum.length >= 3) set.add(digest(alnum));
  if (sk.length >= 3) set.add(digest(sk));
}

rememberHash(secretHashes, TEMPLATE_PASSWORD);
rememberHash(templateHashes, TEMPLATE_PASSWORD);

function priceToken(raw) {
  const sk = skeletonOf(raw);
  return sk.indexOf('$') >= 0 || sk.indexOf('€') >= 0 || sk.indexOf('£') >= 0 || sk.indexOf('%') >= 0;
}

function digitsOnly(text) {
  if (!text) return false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

function putHash(conversationId, surface) {
  const alnum = alnumOf(surface);
  const sk = skeletonOf(surface);
  if (alnum.length < 3 && sk.length < 3) return;
  const id = String(conversationId || '');
  if (!taintByConversation.has(id)) taintByConversation.set(id, new Set());
  const set = taintByConversation.get(id);
  if (alnum.length >= 3 && set.size < MAX_TAINT) set.add(digest(alnum));
  if (sk.length >= 3 && sk !== alnum && set.size < MAX_TAINT) set.add(digest(sk));
}

function addFragments(conversationId, alnum) {
  if (!alnum || alnum.length < 4) return;
  if (alnum.length > 48) {
    const edges = [alnum.slice(0, 8), alnum.slice(0, 12), alnum.slice(-8), alnum.slice(-12)];
    for (let i = 0; i < edges.length; i++) {
      if (edges[i].length >= 4 && !DICT.has(edges[i]) && !FILLER.has(edges[i])) putHash(conversationId, edges[i]);
    }
    return;
  }
  if (digitsOnly(alnum) && alnum.length > 8) return;
  let added = 0;
  for (let len = 4; len < alnum.length; len++) {
    for (let i = 0; i + len <= alnum.length; i++) {
      const frag = alnum.slice(i, i + len);
      if (DICT.has(frag) || FILLER.has(frag) || INSTRUCTION.has(frag)) continue;
      putHash(conversationId, frag);
      added += 1;
      if (added >= 96) return;
    }
  }
}

function notePiece(conversationId, surface) {
  const alnum = alnumOf(surface);
  if (!alnum || alnum.length < 2 || alnum.length > 32) return;
  if (DICT.has(alnum) || FILLER.has(alnum) || INSTRUCTION.has(alnum)) return;
  const id = String(conversationId || '');
  if (!recentPieces.has(id)) recentPieces.set(id, []);
  const list = recentPieces.get(id);
  const prev = list.length ? list[list.length - 1] : '';
  list.push(alnum);
  if (list.length > 8) list.shift();
  if (prev && prev !== alnum) {
    const join = prev + alnum;
    if (join.length >= 4 && join.length <= 48) {
      putHash(id, join);
      addFragments(id, join);
    }
  }
}

function addTaint(conversationId, surface) {
  const alnum = alnumOf(surface);
  putHash(conversationId, surface);
  if (alnum.length >= 4) addFragments(conversationId, alnum);
}

function taintValue(conversationId, surface) {
  taintSurface(conversationId, surface);
  notePiece(conversationId, surface);
}

function hashesFor(conversationId) {
  const set = new Set(secretHashes);
  if (conversationId) {
    const local = taintByConversation.get(String(conversationId));
    if (local) for (const hash of local) set.add(hash);
    return set;
  }
  for (const local of taintByConversation.values()) for (const hash of local) set.add(hash);
  return set;
}

function ignoreTemplate(hashes) {
  const set = new Set(hashes);
  for (const hash of templateHashes) set.delete(hash);
  return set;
}

function isAlnumChar(ch) {
  const c = ch.charCodeAt(0);
  return (c >= 48 && c <= 57) || (c >= 97 && c <= 122);
}

function segmentsOf(skeleton) {
  const parts = [];
  let cur = '';
  for (let i = 0; i < skeleton.length; i++) {
    if (isAlnumChar(skeleton[i])) cur += skeleton[i];
    else if (cur) { parts.push(cur); cur = ''; }
  }
  if (cur) parts.push(cur);
  return parts;
}

function shannon(text) {
  if (!text) return 0;
  const counts = Object.create(null);
  for (let i = 0; i < text.length; i++) counts[text[i]] = (counts[text[i]] || 0) + 1;
  let h = 0;
  const keys = Object.keys(counts);
  for (let i = 0; i < keys.length; i++) {
    const p = counts[keys[i]] / text.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function printable(text) {
  if (!text) return false;
  let ok = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 0xD800)) ok += 1;
  }
  return ok / text.length > 0.9;
}

function tryBase64(token) {
  if (!token || token.length < 8 || token.length > 4096 || token.length % 4 !== 0) return null;
  for (let i = 0; i < token.length; i++) {
    const c = token.charCodeAt(i);
    const ok = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47 || c === 61 || c === 45 || c === 95;
    if (!ok) return null;
  }
  const buf = Buffer.from(token, 'base64');
  if (!buf.length || buf.length < 4) return null;
  const text = buf.toString('utf8');
  if (!printable(text)) return null;
  return text;
}

function tryHex(token) {
  if (!token || token.length < 8 || token.length > 4096 || token.length % 2 !== 0) return null;
  for (let i = 0; i < token.length; i++) {
    const c = token.charCodeAt(i);
    const ok = (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
    if (!ok) return null;
  }
  const buf = Buffer.from(token, 'hex');
  if (!buf.length) return null;
  const text = buf.toString('utf8');
  if (!printable(text)) return null;
  return text;
}

function decodedForms(token) {
  const out = [];
  let layer = [token];
  for (let depth = 0; depth < MAX_DEPTH && out.length < MAX_DECODE; depth++) {
    const next = [];
    for (let i = 0; i < layer.length; i++) {
      const b64 = tryBase64(layer[i]);
      const hex = tryHex(layer[i]);
      if (b64 && out.length < MAX_DECODE) { out.push(b64); next.push(b64); }
      if (hex && hex !== b64 && out.length < MAX_DECODE) { out.push(hex); next.push(hex); }
    }
    if (!next.length) break;
    layer = next;
  }
  return out;
}

function whitespaceTokens(text) {
  const tokens = [];
  let cur = '';
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      if (cur) tokens.push({ text: cur, start: start, end: i });
      cur = '';
    } else if (!cur) {
      start = i;
      cur = ch;
    } else cur += ch;
  }
  if (cur) tokens.push({ text: cur, start: start, end: text.length });
  return tokens;
}

function isCueWord(token) {
  return WORD_CUES.has(token);
}

function taintSurface(conversationId, surface) {
  if (!surface) return;
  addTaint(conversationId, surface);
  const sk = skeletonOf(surface);
  const segs = segmentsOf(sk);
  if (segs.length > 1) {
    const joined = segs.join('');
    if (joined.length >= 3) addTaint(conversationId, joined);
  }
  const forms = decodedForms(String(surface));
  for (let i = 0; i < forms.length; i++) {
    addTaint(conversationId, forms[i]);
    const inner = alnumOf(forms[i]);
    if (inner.length >= 3) addTaint(conversationId, inner);
    absorbPlain(conversationId, forms[i]);
  }
}

function valueFromTokens(tokens, index) {
  let i = index;
  let skipped = 0;
  while (i < tokens.length && skipped < 6) {
    const alnum = alnumOf(tokens[i].text);
    if (alnum && !FILLER.has(alnum)) break;
    i += 1;
    skipped += 1;
  }
  if (i >= tokens.length) return;
  const alnum = alnumOf(tokens[i].text);
  if (INSTRUCTION.has(alnum)) return;
  const shorts = [];
  let j = i;
  while (j < tokens.length) {
    const part = alnumOf(tokens[j].text);
    if (!part || part.length > 2 || DICT.has(part)) break;
    shorts.push(part);
    j += 1;
    if (shorts.length >= 12) break;
  }
  if (shorts.length >= 4) return { text: shorts.join(''), index: j - 1 };
  return { text: tokens[i].text, index: i };
}

function followingPiece(tokens, index) {
  const next = tokens[index + 1];
  if (!next) return '';
  const alnum = alnumOf(next.text);
  if (!alnum || alnum.length < 3 || alnum.length > 16) return '';
  if (DICT.has(alnum) || FILLER.has(alnum) || INSTRUCTION.has(alnum) || isCueWord(alnum)) return '';
  return next.text;
}

function taintNearbyAccounts(conversationId, tokens, index) {
  const from = Math.max(0, index - 6);
  const to = Math.min(tokens.length - 1, index + 8);
  for (let j = from; j <= to; j++) {
    const raw = tokens[j].text;
    if (priceToken(raw)) continue;
    const alnum = alnumOf(raw);
    if (!alnum || alnum === '55188' || alnum.length < 4 || alnum.length > 8 || !digitsOnly(alnum)) continue;
    taintValue(conversationId, alnum);
  }
}

function absorbPlain(conversationId, text) {
  let plain;
  try { plain = plainText(String(text || '')); } catch (_) { return; }
  const tokens = whitespaceTokens(plain);
  for (let i = 0; i < tokens.length; i++) {
    const folded = skeletonOf(tokens[i].text);
    const alnum = alnumOf(tokens[i].text);
    const segs = segmentsOf(folded);
    if (segs.length > 1 && (GLUE_CUES.has(segs[0]) || isCueWord(segs[0]))) {
      const rest = segs.slice(1);
      if (rest.length && !INSTRUCTION.has(rest.join('')) && !INSTRUCTION.has(rest[0])) {
        const joined = rest.join('');
        if (joined.length >= 3) taintValue(conversationId, joined);
        if (rest[0].length >= 3) taintValue(conversationId, rest[0]);
        taintNearbyAccounts(conversationId, tokens, i);
      }
    }
    if (isCueWord(alnum) || isCueWord(folded)) {
      const found = valueFromTokens(tokens, i + 1);
      if (found && found.text) {
        taintValue(conversationId, found.text);
        const extra = followingPiece(tokens, found.index);
        if (extra) taintValue(conversationId, extra);
        taintNearbyAccounts(conversationId, tokens, i);
      }
    }
  }
  const foldedText = skeletonOf(plain);
  for (let c = 0; c < MULTI_CUES.length; c++) {
    const cue = MULTI_CUES[c];
    let from = 0;
    while (from < foldedText.length) {
      const at = foldedText.indexOf(cue, from);
      if (at < 0) break;
      const after = plain.slice(at + cue.length);
      const next = whitespaceTokens(after);
      const value = valueFromTokens(next, 0);
      if (value && value.text) {
        taintValue(conversationId, value.text);
        const extra = followingPiece(next, value.index);
        if (extra) taintValue(conversationId, extra);
        taintNearbyAccounts(conversationId, next, 0);
      }
      from = at + cue.length;
    }
  }
}

function rememberInbound(conversationId, input) {
  const src = input || {};
  const id = conversationId || src.conversationId || '';
  const chunks = [];
  if (typeof src === 'string') chunks.push(src);
  if (typeof src.text === 'string') chunks.push(src.text);
  if (typeof src.body === 'string') chunks.push(src.body);
  if (typeof src.ownerText === 'string') chunks.push(src.ownerText);
  if (typeof src.toolOutput === 'string') chunks.push(src.toolOutput);
  const attachments = src.attachments || [];
  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    if (typeof att === 'string') chunks.push(att);
    else if (att) chunks.push(String(att.text || att.body || att.name || ''));
  }
  for (let i = 0; i < chunks.length; i++) {
    if (!chunks[i]) continue;
    absorbPlain(id, chunks[i]);
    lastAskByConversation.set(String(id), chunks[i]);
  }
}

function rememberClientText(conversationId, text) {
  rememberInbound(conversationId, { text: String(text || '') });
}

function rememberClientParts(conversationId, parts) {
  if (!Array.isArray(parts)) return;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const author = part.author || {};
    const body = part.body || part.text || part.content || '';
    if (typeof body === 'string' && body) rememberInbound(conversationId, { text: body, attachments: part.attachments });
    else if (author && body) rememberInbound(conversationId, { text: String(body), attachments: part.attachments });
  }
}

function structural(token) {
  const sk = skeletonOf(token);
  if (!sk) return false;
  if (sk === WORKSPACE_ID) return true;
  if (sk.indexOf('fundedelite') >= 0 || sk.indexOf('confirmo') >= 0 || sk.indexOf('trustpilot') >= 0 || sk.indexOf('propfirmmatch') >= 0) return true;
  if (sk.indexOf('intercom') >= 0) return true;
  if (sk.indexOf('://') >= 0 || sk.indexOf('http') === 0 || sk.indexOf('www.') >= 0) return true;
  for (let i = 0; i < AUTHORIZED_HOSTS.length; i++) if (sk.indexOf(AUTHORIZED_HOSTS[i]) >= 0) return true;
  let digits = 0;
  let other = 0;
  let price = true;
  let started = false;
  for (let i = 0; i < sk.length; i++) {
    const c = sk[i];
    if (!started && (c === '$' || c === '€' || c === '£')) { started = true; continue; }
    started = true;
    if (c >= '0' && c <= '9') digits += 1;
    else if (c === '.' || c === ',' || c === '%') continue;
    else { price = false; other += 1; }
  }
  if (other === 0 && digits >= 1 && sk.indexOf('a') < 0) return true;
  if (price && digits > 0 && other === 0) return true;
  return false;
}

function compoundAllowed(token) {
  const parts = [];
  let cur = '';
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch === '-' || ch === '_' || ch === '.' || ch === '/') {
      if (cur) parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  if (parts.length < 2) return false;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.length <= 2 || DICT.has(part)) continue;
    let digits = true;
    for (let c = 0; c < part.length; c++) if (part.charCodeAt(c) < 48 || part.charCodeAt(c) > 57) digits = false;
    if (digits) continue;
    if (part.length <= 14 && shannon(part) < 3.55) continue;
    return false;
  }
  return true;
}

function mixedHigh(token) {
  if (!token || token.length < 16) return false;
  for (let i = 0; i < token.length; i++) if (token.charCodeAt(i) > 127) return false;
  while (token && !isAlnumChar(token[0])) token = token.slice(1);
  while (token && !isAlnumChar(token[token.length - 1])) token = token.slice(0, -1);
  if (!token || token.length < 16) return false;
  if (structural(token) || DICT.has(token) || compoundAllowed(token)) return false;
  let letters = 0;
  let digits = 0;
  let symbols = 0;
  for (let i = 0; i < token.length; i++) {
    const c = token.charCodeAt(i);
    if (c >= 97 && c <= 122) letters += 1;
    else if (c >= 48 && c <= 57) digits += 1;
    else symbols += 1;
  }
  const entropy = shannon(token);
  if (letters && digits && entropy >= 3.2) return true;
  if (letters && symbols && token.indexOf('-') < 0 && entropy >= 3.4) return true;
  if (symbols && entropy >= 3.5 && token.length >= 16) return true;
  if (!digits && !symbols && token.length >= 20 && entropy >= 3.8) return true;
  if (compoundAllowed(token)) return false;
  if (token.indexOf('-') >= 0 && entropy >= 3.5 && token.length >= 16 && !compoundAllowed(token)) return true;
  return false;
}

function labeledSecret(text) {
  const folded = skeletonOf(plainText(String(text || '')));
  const tokens = whitespaceTokens(folded);
  for (let i = 0; i < tokens.length; i++) {
    const alnum = alnumOf(tokens[i].text);
    const segs = segmentsOf(tokens[i].text);
    if (segs.length > 1 && (GLUE_CUES.has(segs[0]) || isCueWord(segs[0]))) {
      const joined = segs.slice(1).join('');
      if (joined.length >= 3 && !INSTRUCTION.has(joined)) return true;
    }
    if (isCueWord(alnum) || isCueWord(tokens[i].text)) {
      const value = valueFromTokens(tokens, i + 1);
      if (value && value.text && alnumOf(value.text).length >= 3 && !INSTRUCTION.has(alnumOf(value.text))) return true;
    }
  }
  return false;
}

function decodedSecret(token) {
  const forms = decodedForms(token);
  for (let i = 0; i < forms.length; i++) {
    if (labeledSecret(forms[i])) return true;
    const alnum = alnumOf(forms[i]);
    if (alnum.length >= 12 && shannon(alnum) >= 3.6 && !DICT.has(alnum) && !structural(alnum)) return true;
  }
  return false;
}

function hashHit(surface, hashes) {
  if (!surface) return false;
  const alnum = alnumOf(surface);
  const sk = skeletonOf(surface);
  if (alnum.length >= 3 && hashes.has(digest(alnum))) return true;
  if (sk.length >= 3 && hashes.has(digest(sk))) return true;
  const segs = segmentsOf(sk);
  for (let s = 0; s < segs.length; s++) {
    if (segs[s].length >= 3 && hashes.has(digest(segs[s]))) return true;
  }
  if (segs.length > 1) {
    const joined = segs.join('');
    if (joined.length >= 3 && hashes.has(digest(joined))) return true;
    const shorts = [];
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].length <= 2 && !DICT.has(segs[i])) shorts.push(segs[i]);
      else {
        if (shorts.length >= 4 && hashes.has(digest(shorts.join('')))) return true;
        shorts.length = 0;
      }
    }
    if (shorts.length >= 4 && hashes.has(digest(shorts.join('')))) return true;
  }
  return false;
}

function reconstructionHit(tokens, hashes) {
  const parts = [];
  for (let i = 0; i < tokens.length; i++) {
    const alnum = alnumOf(tokens[i].text);
    if (!alnum || alnum.length < 2 || alnum.length > 24 || DICT.has(alnum) || FILLER.has(alnum) || INSTRUCTION.has(alnum)) parts.push(null);
    else parts.push(alnum);
  }
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    let join = '';
    let count = 0;
    for (let j = i; j < parts.length && count < 4; j++) {
      if (!parts[j]) break;
      join += parts[j];
      count += 1;
      if (count >= 2 && join.length >= 4 && hashes.has(digest(join))) return true;
    }
  }
  return false;
}

function mt5ContextHit(plain) {
  const tokens = whitespaceTokens(skeletonOf(plain));
  for (let i = 0; i < tokens.length; i++) {
    const cue = alnumOf(tokens[i].text);
    if (!isCueWord(cue) && !GLUE_CUES.has(cue)) continue;
    const from = Math.max(0, i - 6);
    const to = Math.min(tokens.length - 1, i + 8);
    for (let j = from; j <= to; j++) {
      if (j === i) continue;
      const raw = tokens[j].text;
      if (priceToken(raw)) continue;
      const alnum = alnumOf(raw);
      if (!alnum || alnum === '55188' || alnum.length < 4 || alnum.length > 8 || !digitsOnly(alnum)) continue;
      return true;
    }
  }
  return false;
}

function spanHits(text, hashes) {
  let plain;
  try { plain = plainText(text); } catch (err) { throw err; }
  const tokens = whitespaceTokens(plain);
  const shorts = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].text;
    const folded = skeletonOf(token);
    const ownedByTemplate = hashHit(token, templateHashes);
    if (hashHit(token, hashes)) return true;
    const forms = decodedForms(token);
    for (let d = 0; d < forms.length; d++) {
      if (hashHit(forms[d], hashes)) return true;
    }
    if (!ownedByTemplate && !structural(folded) && mixedHigh(folded)) return true;
    const alnum = alnumOf(token);
    if (alnum && alnum.length <= 2 && !DICT.has(alnum)) shorts.push(alnum);
    else {
      if (shorts.length >= 4 && hashes.has(digest(shorts.join('')))) return true;
      shorts.length = 0;
    }
  }
  if (shorts.length >= 4 && hashes.has(digest(shorts.join('')))) return true;
  if (reconstructionHit(tokens, hashes)) return true;
  if (mt5ContextHit(plain)) return true;
  return false;
}

function safeHits(text, conversationId) {
  try { return spanHits(text, hashesFor(conversationId)); } catch (_) { return true; }
}

function channelOf(op) {
  if (op && op.kind === 'model-request') return 'model';
  if (op && op.channel) return op.channel;
  const mt = String((op && op.messageType) || '');
  if (mt === 'note') return 'internal';
  if (mt === 'search') return 'search';
  if (mt === 'comment' || mt === '') return 'public';
  return 'internal';
}

function replacementBody(op) {
  return channelOf(op) === 'internal' ? REDACTED_NOTE : FIXED_MESSAGE;
}

function withData(op, body) {
  if (op && op.data && typeof op.data === 'object') return Object.assign({}, op.data, { body: body });
  return { body: body };
}

function deny(op, reason) {
  const channel = channelOf(op || {});
  if (channel === 'model' || channel === 'search') {
    return { send: false, decision: 'deny', action: 'block', reason: reason, body: null, data: null, payload: null, messageType: channel };
  }
  const body = replacementBody(op || {});
  if (safeHits(body, op && op.conversationId)) {
    return { send: false, decision: 'deny', action: 'block', reason: 'unsanitizable', body: null, data: null, payload: null };
  }
  const data = { body: body };
  return {
    send: true,
    decision: 'deny',
    action: channel === 'internal' ? 'redacted_note' : 'fixed_message',
    reason: reason,
    body: body,
    data: data,
    payload: { body: body, data: data },
    messageType: channel === 'internal' ? 'note' : 'comment',
  };
}

function allow(reason, body, data) {
  const payloadData = data || { body: body };
  return {
    send: true,
    decision: 'allow',
    action: 'allow',
    reason: reason,
    body: body,
    data: payloadData,
    payload: { body: body, data: payloadData },
  };
}

function hasMarker(text, markers) {
  for (let i = 0; i < markers.length; i++) if (text.indexOf(markers[i]) >= 0) return true;
  return false;
}

function clauseList(text) {
  const src = String(text || '').toLowerCase();
  const out = [];
  let cur = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '.' || ch === '?' || ch === '!' || ch === '؟') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function negated(clause) {
  const phrases = ['do not', "don't", 'dont', 'cannot', "can't", 'cant', 'no need', 'no,', 'nahi', 'nahin', 'nai ', 'نہیں', 'नहीं', "i don't", 'i dont', 'i cannot'];
  for (let i = 0; i < phrases.length; i++) if (clause.indexOf(phrases[i]) >= 0) return true;
  if (clause.indexOf('لا') === 0) return true;
  return false;
}

function defined(clause) {
  return clause.indexOf('what is') >= 0 || clause.indexOf('what are') >= 0 || clause.indexOf("what's") >= 0;
}

function selfReport(clause) {
  if (clause.indexOf('i was testing') >= 0) return true;
  if (clause.indexOf('i already test') >= 0) return true;
  if (clause.indexOf('i am testing') >= 0 || clause.indexOf("i'm testing") >= 0) return true;
  if (clause.indexOf('i check') >= 0 && clause.indexOf('how') < 0 && clause.indexOf('want') < 0) return true;
  return false;
}

function requestShape(clause) {
  if (hasMarker(clause, HOW_MARKERS)) return true;
  if (clause.indexOf('i want to') >= 0 || clause.indexOf('want to') >= 0) return true;
  if (clause.indexOf('i want') >= 0 && (clause.indexOf('demo') >= 0 || clause.indexOf('account') >= 0 || clause.indexOf('اکاؤنٹ') >= 0 || clause.indexOf('अकाउंट') >= 0 || clause.indexOf('حساب') >= 0)) return true;
  if (hasMarker(clause, SEND_MARKERS)) return true;
  const verb = clause.indexOf('اختبر');
  const spread = clause.indexOf('سبريد');
  if (verb >= 0 && spread > verb) return true;
  return false;
}

function thirdParty(clause) {
  const others = [' him', ' her', ' them', ' his ', ' their '];
  let hit = false;
  for (let i = 0; i < others.length; i++) if (clause.indexOf(others[i]) >= 0) hit = true;
  if (!hit) return false;
  if (clause.indexOf(' me') >= 0 || clause.indexOf('mujhe') >= 0 || clause.indexOf('مجھے') >= 0 || clause.indexOf('मुझे') >= 0) return false;
  return true;
}

function recordBorderline(text, reason) {
  if (borderline.length >= 100) return;
  borderline.push({ text: String(text || '').slice(0, 240), reason: reason });
}

function isTestAccountHandoff(plain) {
  const clauses = clauseList(plain);
  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    if (clause.indexOf('spreadsheet') >= 0 || clause.indexOf('spread sheet') >= 0) continue;
    if (negated(clause) || clause.indexOf('payout') >= 0) continue;
    if (clause.indexOf('give me the test account') >= 0) return true;
    if (clause.indexOf('send me the test account') >= 0) return true;
  }
  return false;
}

function isExplicitSpreadTestRequest(text) {
  let plain;
  try { plain = plainText(text).toLowerCase(); } catch (_) { return false; }
  if (isTestAccountHandoff(plain)) return true;
  if (plain.indexOf('spreadsheet') >= 0 || plain.indexOf('spread sheet') >= 0) {
    recordBorderline(text, 'spreadsheet');
    return false;
  }
  const clauses = clauseList(plain);
  let sawSpread = false;
  let reason = '';
  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    if (!hasMarker(clause, SPREAD_MARKERS)) continue;
    sawSpread = true;
    if (clause.indexOf('payout') >= 0) { reason = 'payout'; continue; }
    if (negated(clause)) { reason = 'negation'; continue; }
    if (defined(clause)) { reason = 'definition'; continue; }
    if (selfReport(clause)) { reason = 'self_report'; continue; }
    if (thirdParty(clause)) { reason = 'third_party'; continue; }
    if (!hasMarker(clause, CHECK_MARKERS)) { reason = 'no_check_intent'; continue; }
    if (!requestShape(clause)) { reason = 'no_request_shape'; continue; }
    return true;
  }
  if (sawSpread) recordBorderline(text, reason || 'borderline');
  return false;
}

function greetingPrefixOk(prefix) {
  const trimmed = String(prefix || '').trim();
  if (!trimmed) return true;
  const lines = trimmed.split('\n');
  const line = lines[lines.length - 1].trim().toLowerCase();
  let token = '';
  const tokens = [];
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const c = ch.charCodeAt(0);
    if ((c >= 97 && c <= 122) || c > 127) token += ch;
    else if (token) { tokens.push(token); token = ''; }
  }
  if (token) tokens.push(token);
  if (!tokens.length || tokens.length > 4) return false;
  let unknown = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (GREETINGS.has(tokens[i]) || DICT.has(tokens[i])) continue;
    unknown += 1;
    if (tokens[i].length > 16) return false;
  }
  return unknown <= 1 && (GREETINGS.has(tokens[0]) || tokens[0].indexOf('السلام') >= 0);
}

function isDeliverableSpreadTemplate(body) {
  let key;
  try { key = paragraphKey(body); } catch (_) { return false; }
  if (key === TEMPLATE_PARAGRAPHS) return true;
  const lines = key.split('\n');
  const templateLines = TEMPLATE_PARAGRAPHS.split('\n');
  if (lines.length < templateLines.length) return false;
  const start = lines.length - templateLines.length;
  for (let i = 0; i < templateLines.length; i++) if (lines[start + i] !== templateLines[i]) return false;
  return greetingPrefixOk(lines.slice(0, start).join('\n'));
}

function isExactSpreadTemplate(body) {
  try { return plainText(body).trim() === SPREAD_TEST_REPLY; } catch (_) { return false; }
}

function latestClientAsk(ctx) {
  const texts = [];
  const history = (ctx && ctx.history) || [];
  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    if (typeof item === 'string') texts.push(item);
    else if (item) texts.push(String(item.text || item.body || ''));
  }
  const clientTexts = (ctx && ctx.clientTexts) || [];
  for (let i = 0; i < clientTexts.length; i++) if (typeof clientTexts[i] === 'string') texts.push(clientTexts[i]);
  if (ctx && typeof ctx.clientText === 'string') texts.push(ctx.clientText);
  if (texts.length) return texts[texts.length - 1];
  if (ctx && ctx.conversationId && lastAskByConversation.has(String(ctx.conversationId))) return lastAskByConversation.get(String(ctx.conversationId)) || '';
  return '';
}

function rememberFromOp(op) {
  const ctx = op || {};
  const history = ctx.history || [];
  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    const text = typeof item === 'string' ? item : (item && (item.text || item.body)) || '';
    if (text) rememberClientText(ctx.conversationId, text);
  }
  const clientTexts = ctx.clientTexts || [];
  for (let i = 0; i < clientTexts.length; i++) rememberClientText(ctx.conversationId, clientTexts[i]);
  if (typeof ctx.clientText === 'string') rememberClientText(ctx.conversationId, ctx.clientText);
  if (typeof ctx.ownerText === 'string') rememberInbound(ctx.conversationId, { ownerText: ctx.ownerText });
  if (typeof ctx.toolOutput === 'string') rememberInbound(ctx.conversationId, { toolOutput: ctx.toolOutput });
  if (ctx.attachments) rememberInbound(ctx.conversationId, { attachments: ctx.attachments });
  if (Array.isArray(ctx.messages)) {
    for (let i = 0; i < ctx.messages.length; i++) {
      const msg = ctx.messages[i];
      if (!msg || typeof msg !== 'object') continue;
      if (String(msg.role || '') === 'system') continue;
      if (typeof msg.content === 'string') rememberInbound(ctx.conversationId, { text: msg.content });
      if (msg.role === 'tool' && typeof msg.content === 'string') rememberInbound(ctx.conversationId, { toolOutput: msg.content });
    }
  }
}

function bodyOf(op) {
  if (!op) return '';
  if (typeof op.body === 'string') return op.body;
  if (op.data && typeof op.data.body === 'string') return op.data.body;
  return '';
}

function messageTypeOf(ctx) {
  const direct = String((ctx && ctx.messageType) || '').toLowerCase();
  if (direct) return direct;
  const nested = ctx && ctx.data && ctx.data.message_type;
  return String(nested || '').toLowerCase();
}

function structuralKind(ctx) {
  const mt = messageTypeOf(ctx);
  const known = {
    assignment: true, assign: true, close: true, snoozed: true, snooze: true, open: true,
    search: true, unassign: true, priority: true, tag: true, untag: true, read: true,
  };
  if (known[mt]) return mt;
  if (ctx && (ctx.channel === 'search' || ctx.kind === 'search')) return 'search';
  const method = String((ctx && ctx.method) || '').toLowerCase();
  if (method === 'get' || method === 'head' || method === 'options') return 'read';
  if ((method === 'put' || method === 'patch') && !bodyOf(ctx)) return method;
  return '';
}

function decide(op) {
  const ctx = op || {};
  rememberFromOp(ctx);
  if (typeof ctx.ownerText === 'string' && ctx.ownerText) rememberInbound(ctx.conversationId, { ownerText: ctx.ownerText });
  if (ctx.kind === 'model-request') {
    const messages = guardModelMessages(ctx.conversationId, ctx.messages || (ctx.payload && ctx.payload.messages) || []);
    const payload = Object.assign({}, ctx.payload || {}, { messages: messages });
    return {
      send: true,
      decision: 'allow',
      action: 'allow',
      reason: 'model',
      body: null,
      data: payload,
      payload: payload,
      messages: messages,
      messageType: 'model',
    };
  }
  const body = bodyOf(ctx);
  const kind = structuralKind(ctx);
  if (kind && !body) return allow('structural_' + kind, '', ctx.data || {});
  if (typeof ctx.ownerText === 'string' && ctx.ownerText && spanHits(ctx.ownerText, hashesFor(ctx.conversationId))) return deny(ctx, 'tainted');
  if (typeof body !== 'string') return deny(ctx, 'non_string');
  assertScannable(body);
  const eligible = isExplicitSpreadTestRequest(latestClientAsk(ctx));
  if (body === FIXED_MESSAGE || payloadHash(body) === FIXED_HASH || body === REDACTED_NOTE) return allow('safe_replacement', body, { body: body });
  if (isDeliverableSpreadTemplate(body)) {
    if (!eligible) return deny(ctx, 'spread_not_eligible');
    if (spanHits(body, ignoreTemplate(hashesFor(ctx.conversationId)))) return deny(ctx, 'residual_secret');
    const exact = SPREAD_TEST_REPLY;
    const data = { body: exact };
    const allowed = allow('spread_template', exact, data);
    allowed.spreadEligible = true;
    return allowed;
  }
  if (spanHits(body, hashesFor(ctx.conversationId))) return deny(ctx, 'tainted');
  const data = withData(ctx, body);
  const allowed = allow('clean', body, data);
  allowed.spreadEligible = !!eligible;
  return allowed;
}

function stamp(decision) {
  decision.version = STATUS.candidate;
  decision.frozen = true;
  decision.approved = false;
  decision.release = false;
  decision.wired = false;
  decision.silent = false;
  decision.post = !!decision.send;
  decision.posted = false;
  decision.blocked = !decision.send;
  decision.spreadEligible = !!decision.spreadEligible;
  if (decision.send) {
    const ticket = 'cg13-' + String(ticketSeq);
    ticketSeq += 1;
    decision.ticket = ticket;
    tickets.add(ticket);
  } else decision.ticket = null;
  decision.payloadHash = payloadHash(typeof decision.body === 'string' ? decision.body : '');
  decision.diagnostic = { reason: decision.reason };
  return decision;
}

function authorizeOutbound(op) {
  const started = Date.now();
  let decision;
  try {
    decision = decide(op || {});
    if (Date.now() - started > GUARD_BUDGET_MS) decision = deny(op || {}, 'timeout');
  } catch (_) {
    decision = deny(op || {}, 'exception');
  }
  return stamp(decision);
}

function denyOutbound(op) {
  return stamp(deny(op || {}, (op && op.reason) || 'exception'));
}

function transportPermitted() {
  return permit != null;
}

function dispatchAuthorized(decision, send) {
  if (!decision || decision.send !== true || !decision.ticket || !tickets.has(decision.ticket)) {
    const err = new Error('unauthorized write');
    err.code = 'UNAUTHORIZED_WRITE';
    throw err;
  }
  tickets.delete(decision.ticket);
  const previous = permit;
  permit = decision.ticket;
  try {
    return send(decision.payload);
  } finally {
    permit = previous;
  }
}

function createGuardedTransport(rawSend) {
  if (typeof rawSend !== 'function') throw new Error('transport required');
  return function guarded(config) {
    const method = String((config && config.method) || 'get').toLowerCase();
    const write = method !== 'get' && method !== 'head' && method !== 'options';
    if (write && permit == null) {
      const err = new Error('unauthorized write');
      err.code = 'UNAUTHORIZED_WRITE';
      throw err;
    }
    return rawSend(config);
  };
}

function stripLineComment(line) {
  const mark = line.indexOf('//');
  if (mark < 0) return line;
  return line.slice(0, mark);
}

function scanTransportBypasses(files) {
  const findings = [];
  const axiosCall = 'axios' + '(';
  const httpReq = 'http' + '.request';
  const httpsReq = 'https' + '.request';
  const methods = ['post', 'put', 'patch', 'delete', 'get'];
  const requires = ["require('axios')", 'require("axios")', "require('http')", 'require("http")', "require('https')", 'require("https")'];
  for (let f = 0; f < (files || []).length; f++) {
    const file = files[f] || {};
    const name = String(file.name || '');
    const source = String(file.source || '');
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const code = stripLineComment(lines[i]);
      for (let m = 0; m < methods.length; m++) {
        if (code.indexOf('axios.' + methods[m]) >= 0) findings.push({ file: name, line: i + 1, kind: 'axios-write' });
      }
      if (code.indexOf(axiosCall) >= 0) findings.push({ file: name, line: i + 1, kind: 'axios-call' });
      if (code.indexOf(httpReq) >= 0 || code.indexOf(httpsReq) >= 0) findings.push({ file: name, line: i + 1, kind: 'http-request' });
      for (let r = 0; r < requires.length; r++) {
        if (code.indexOf(requires[r]) >= 0) findings.push({ file: name, line: i + 1, kind: 'raw-require' });
      }
    }
    let from = 0;
    while (from < source.length) {
      const at = source.indexOf('chat.completions.create', from);
      if (at < 0) break;
      const window = source.slice(Math.max(0, at - 1600), at);
      if (window.indexOf('authorizeOutbound') < 0 || window.indexOf('dispatchAuthorized') < 0) {
        findings.push({ file: name, kind: 'model-bypass' });
      }
      from = at + 24;
    }
  }
  return findings;
}

function startupSelfCheck(files) {
  const findings = scanTransportBypasses(files || []);
  return { ok: findings.length === 0, findings: findings };
}

function exactPayload(config) {
  const data = config && config.data;
  const direct = config && typeof config.body === 'string' ? config.body : '';
  if (direct) return direct;
  if (data && typeof data.body === 'string' && data.body) return data.body;
  return JSON.stringify(data == null ? null : data);
}

function createRecordingTransport() {
  const records = [];
  function raw(config) {
    const exact = exactPayload(config);
    records.push({
      exact: exact,
      bytes: Buffer.from(exact, 'utf8'),
      body: config && typeof config.body === 'string' ? config.body : null,
      data: config && config.data,
      method: config && config.method,
      url: config && config.url,
    });
    return { status: 200, data: { id: 'recorded' }, ok: true };
  }
  return { records: records, transport: raw, send: function (op) { return guardedSend(op, raw); } };
}

function assertPermit() {
  if (permit == null) {
    const err = new Error('unguarded http');
    err.code = 'UNGUARDED_HTTP';
    throw err;
  }
}

function sealAxios(real) {
  if (!real || real.__credGuardR13Sealed) return real;
  function guarded(config) {
    assertPermit();
    return real.apply(real, arguments);
  }
  const names = ['request', 'get', 'delete', 'head', 'options', 'post', 'put', 'patch'];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (typeof real[name] !== 'function') continue;
    guarded[name] = function () {
      assertPermit();
      return real[name].apply(real, arguments);
    };
  }
  if (typeof real.create === 'function') {
    guarded.create = function () {
      return sealAxios(real.create.apply(real, arguments));
    };
  }
  guarded.__credGuardR13Sealed = true;
  return guarded;
}

function sealHttp(mod) {
  if (!mod || mod.__credGuardR13Sealed || typeof mod.request !== 'function') return mod;
  const origRequest = mod.request;
  const origGet = mod.get;
  mod.request = function () {
    assertPermit();
    return origRequest.apply(mod, arguments);
  };
  if (typeof origGet === 'function') {
    mod.get = function () {
      assertPermit();
      return origGet.apply(mod, arguments);
    };
  }
  mod.__credGuardR13Sealed = true;
  return mod;
}

function installRequireTripwire() {
  if (requireHooked) return;
  requireHooked = true;
  const axiosName = 'axios';
  const httpName = 'http';
  const httpsName = 'https';
  function hooked(request) {
    const loaded = originalRequire.apply(this, arguments);
    if (request === axiosName) return sealAxios(loaded);
    if (request === httpName || request === httpsName) return sealHttp(loaded);
    return loaded;
  }
  hooked.__credGuardR13 = true;
  Module.prototype.require = hooked;
}

function injectedClient() {
  return sealAxios(originalRequire.call(module, 'axios'));
}

function measure(op) {
  if (!op || typeof op !== 'object') return 0;
  let n = 0;
  if (typeof op.body === 'string') n = op.body.length;
  if (op.data && typeof op.data.body === 'string' && op.data.body.length > n) n = op.data.body.length;
  const messages = op.messages || (op.payload && op.payload.messages);
  if (messages) {
    const blob = JSON.stringify(messages);
    if (blob.length > n) n = blob.length;
  }
  return n;
}

function channelHint(op) {
  try {
    return { messageType: op && op.messageType, channel: op && op.channel, kind: op && op.kind };
  } catch (_) {
    return {};
  }
}

function guardedSend(op, transport) {
  if (typeof transport !== 'function') throw new Error('transport required');
  const started = Date.now();
  const hint = channelHint(op);
  let decision;
  try {
    if (measure(op) > SIZE_CAP) decision = stamp(deny(hint, 'oversize'));
    else {
      decision = authorizeOutbound(op);
      if (Date.now() - started > GUARD_BUDGET_MS) decision = stamp(deny(hint, 'timeout'));
    }
  } catch (_) {
    decision = stamp(deny(hint, 'exception'));
  }
  if (!decision || decision.send !== true) return decision;
  const body = typeof decision.body === 'string' ? decision.body : '';
  const data = decision.data;
  decision.result = dispatchAuthorized(decision, function () {
    return transport({ method: 'post', body: body, data: data });
  });
  decision.posted = true;
  return decision;
}

function rangesFor(raw, conversationId) {
  const decoded = decodeEntities(raw);
  const folded = skeletonOf(decoded);
  const hashes = hashesFor(conversationId);
  const tokens = whitespaceTokens(folded);
  const ranges = [];
  function push(start, end) {
    if (end > start) ranges.push({ start: start, end: end });
  }
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let hit = hashHit(token.text, hashes) || (!structural(token.text) && mixedHigh(token.text));
    if (!hit) {
      const forms = decodedForms(token.text);
      for (let d = 0; d < forms.length; d++) if (hashHit(forms[d], hashes)) hit = true;
    }
    if (hit) push(token.start, token.end);
  }
  const parts = [];
  for (let i = 0; i < tokens.length; i++) {
    const alnum = alnumOf(tokens[i].text);
    if (!alnum || alnum.length < 2 || alnum.length > 24 || DICT.has(alnum) || FILLER.has(alnum) || INSTRUCTION.has(alnum)) parts.push(null);
    else parts.push(tokens[i]);
  }
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    let join = '';
    let count = 0;
    let last = i;
    for (let j = i; j < parts.length && count < 4; j++) {
      if (!parts[j]) break;
      join += alnumOf(parts[j].text);
      count += 1;
      last = j;
      if (count >= 2 && join.length >= 4 && hashes.has(digest(join))) push(parts[i].start, parts[last].end);
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    const cue = alnumOf(tokens[i].text);
    if (!isCueWord(cue) && !GLUE_CUES.has(cue)) continue;
    const fromIdx = Math.max(0, i - 6);
    const toIdx = Math.min(tokens.length - 1, i + 8);
    for (let j = fromIdx; j <= toIdx; j++) {
      if (j === i) continue;
      if (priceToken(tokens[j].text)) continue;
      const alnum = alnumOf(tokens[j].text);
      if (!alnum || alnum === '55188' || alnum.length < 4 || alnum.length > 8 || !digitsOnly(alnum)) continue;
      push(tokens[j].start, tokens[j].end);
    }
  }
  const shorts = [];
  for (let i = 0; i < tokens.length; i++) {
    const alnum = alnumOf(tokens[i].text);
    if (alnum && alnum.length <= 2 && !DICT.has(alnum)) shorts.push(tokens[i]);
    else {
      if (shorts.length >= 4 && hashes.has(digest(shorts.map((item) => alnumOf(item.text)).join('')))) {
        push(shorts[0].start, shorts[shorts.length - 1].end);
      }
      shorts.length = 0;
    }
  }
  if (shorts.length >= 4 && hashes.has(digest(shorts.map((item) => alnumOf(item.text)).join('')))) {
    push(shorts[0].start, shorts[shorts.length - 1].end);
  }
  return ranges;
}

function scrubText(text, conversationId) {
  const raw = String(text == null ? '' : text);
  if (!raw) return raw;
  if (raw.length >= AUTHORIZED_PROMPT_DISCLOSURE.length) {
    const prefix = raw.slice(0, AUTHORIZED_PROMPT_DISCLOSURE.length);
    if (payloadHash(prefix) === AUTHORIZED_PROMPT_DISCLOSURE.sha256) {
      if (raw.length === prefix.length) return raw;
      return prefix + scrubText(raw.slice(prefix.length), conversationId);
    }
  }
  if (raw.length > MAX_SCAN) return '[redacted]';
  let ranges;
  try { ranges = rangesFor(raw, conversationId); } catch (_) { return '[redacted]'; }
  if (!ranges.length) return raw;
  ranges.sort((a, b) => b.start - a.start);
  let out = raw;
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (range.start < 0 || range.end > out.length || range.start >= range.end) continue;
    out = out.slice(0, range.start) + '[redacted]' + out.slice(range.end);
  }
  return out;
}

function redactForConversation(conversationId, text) {
  return scrubText(text, conversationId || '');
}

function redactText(text, extra) {
  if (extra && extra.length) {
    for (let i = 0; i < extra.length; i++) addTaint('', String(extra[i] || ''));
  }
  return scrubText(text, '');
}

function redactSystemContent(conversationId, text) {
  return scrubText(text, conversationId);
}

function scrubAny(value, conversationId, seen) {
  if (typeof value === 'string') return scrubText(value, conversationId);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[redacted]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => scrubAny(item, conversationId, seen));
  const out = {};
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === 'tool_calls' || key === 'function' || key === 'arguments' || key === 'content' || key === 'text' || key === 'body' || key === 'lastEscalateProblem') {
      out[key] = scrubAny(value[key], conversationId, seen);
    } else if (typeof value[key] === 'string') out[key] = scrubText(value[key], conversationId);
    else out[key] = value[key];
  }
  return out;
}

function guardModelMessages(conversationId, messages) {
  if (!Array.isArray(messages)) throw boundsError();
  return messages.map((msg) => {
    if (!msg || typeof msg !== 'object') return msg;
    const next = {};
    const keys = Object.keys(msg);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = msg[key];
      if (key === 'content' && typeof value === 'string') {
        next[key] = String(msg.role || '') === 'system' ? redactSystemContent(conversationId, value) : scrubText(value, conversationId);
      } else if (key === 'content' && Array.isArray(value)) {
        next[key] = value.map((part) => scrubAny(part, conversationId, new Set()));
      } else if (key === 'tool_calls' || key === 'function_call') {
        next[key] = scrubAny(value, conversationId, new Set());
      } else next[key] = value;
    }
    return next;
  });
}

function scrubEscalateProblem(conversationId, text) {
  return redactForConversation(conversationId, String(text || '')).slice(0, 500);
}

function redactDiagnostic(value) {
  return scrubAny(value, '', new Set());
}

function redactTurnMeta(meta) {
  return scrubAny(meta || {}, '', new Set());
}

function scrubLogArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    try {
      if (typeof arg === 'string') out.push(scrubText(arg, ''));
      else if (arg && typeof arg === 'object') out.push(redactDiagnostic(arg));
      else out.push(arg);
    } catch (_) {
      out.push('[redacted]');
    }
  }
  return out;
}

function installProcessScrub(target) {
  const sink = target || console;
  if (!sink || sink.__credGuardR13) return sink;
  const log = sink.log ? sink.log.bind(sink) : null;
  const err = sink.error ? sink.error.bind(sink) : null;
  if (log) sink.log = function () { return log.apply(sink, scrubLogArgs(arguments)); };
  if (err) sink.error = function () { return err.apply(sink, scrubLogArgs(arguments)); };
  if (typeof sink.write === 'function') {
    const write = sink.write.bind(sink);
    sink.write = function (chunk, encoding, cb) {
      let safe = chunk;
      if (typeof chunk === 'string') {
        try { safe = scrubText(chunk, ''); } catch (_) { safe = '[redacted]'; }
      }
      return write(safe, encoding, cb);
    };
  }
  sink.__credGuardR13 = true;
  return sink;
}

function conversationIdFromUrl(url) {
  const s = String(url || '');
  const key = 'conversations/';
  const at = s.indexOf(key);
  if (at < 0) return '';
  let i = at + key.length;
  let id = '';
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c === 47 || c === 63 || c === 35) break;
    id += s[i];
    i += 1;
  }
  if (id === 'search') return '';
  return id;
}

function exportTaint() {
  const conversations = {};
  for (const [id, set] of taintByConversation) conversations[id] = Array.from(set);
  return { version: 1, conversations: conversations };
}

function hashesOnly(list) {
  const set = new Set();
  const items = Array.isArray(list) ? list : [];
  for (let i = 0; i < items.length && set.size < MAX_TAINT; i++) {
    if (typeof items[i] === 'string' && items[i].length === 64) set.add(items[i]);
  }
  return set;
}

function importTaint(blob) {
  taintByConversation.clear();
  recentPieces.clear();
  const conversations = (blob && blob.conversations) || {};
  const ids = Object.keys(conversations);
  for (let i = 0; i < ids.length; i++) taintByConversation.set(ids[i], hashesOnly(conversations[ids[i]]));
}

function importConversationTaint(conversationId, hashes) {
  taintByConversation.set(String(conversationId || ''), hashesOnly(hashes));
}

function resetStore() {
  taintByConversation.clear();
  recentPieces.clear();
  borderline.length = 0;
  lastAskByConversation.clear();
  tickets.clear();
  permit = null;
}

function borderlineAsks() {
  return borderline.map((item) => ({ text: item.text, reason: item.reason }));
}

function taintHashes(conversationId) {
  const local = taintByConversation.get(String(conversationId || ''));
  return local ? Array.from(local) : [];
}

function loadCredentialGuard() {
  const names = ['./credentialGuardR13', '../credentialGuardR13', '../01_runtime/credentialGuardR13'];
  for (let i = 0; i < names.length; i++) {
    try { return require(names[i]); } catch (err) {
      if (!err || err.code !== 'MODULE_NOT_FOUND') throw err;
    }
  }
  return null;
}

function guardSend(input) {
  return authorizeOutbound(input || {});
}

module.exports = {
  STATUS,
  FIXED_MESSAGE,
  REDACTED_NOTE,
  SPREAD_TEST_REPLY,
  TEMPLATE_PASSWORD,
  TEMPLATE_HASH,
  CANONICAL_TEMPLATE_HASH,
  WORKSPACE_ID,
  AUTHORIZED_PROMPT_DISCLOSURE,
  payloadHash,
  rememberInbound,
  rememberClientText,
  rememberClientParts,
  resetStore,
  exportTaint,
  importTaint,
  importConversationTaint,
  taintHashes,
  borderlineAsks,
  redactText,
  redactForConversation,
  redactSystemContent,
  guardModelMessages,
  scrubEscalateProblem,
  redactDiagnostic,
  redactTurnMeta,
  scrubLogArgs,
  installProcessScrub,
  loadCredentialGuard,
  isExplicitSpreadTestRequest,
  isExactSpreadTemplate,
  isDeliverableSpreadTemplate,
  conversationIdFromUrl,
  authorizeOutbound,
  denyOutbound,
  dispatchAuthorized,
  transportPermitted,
  createGuardedTransport,
  createRecordingTransport,
  guardedSend,
  installRequireTripwire,
  injectedClient,
  scanTransportBypasses,
  startupSelfCheck,
  guardSend,
  SIZE_CAP,
};
