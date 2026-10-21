'use strict';

/**
 * Credential guard R11 — frozen staging candidate.
 *
 * Architecture change from R10. Deny by default after one canonicalization,
 * instead of adding another label pattern. The R10 review case file was not
 * read. Not wired into the live engine. approved is false.
 *
 * system-prompt.txt is protected. It is the owner-authorized public 55188
 * disclosure. Exact bytes pass through the system-message path. No other
 * secret may be appended. This module does not read or edit that file.
 */

const crypto = require('crypto');

const STATUS = Object.freeze({
  candidate: 'credential-guard-r11',
  frozen: true,
  approved: false,
  release: false,
  wired: false,
  silent: false,
});

const FIXED_MESSAGE =
  'Please change that immediately. I will not repeat it back. I am escalating this as a security event for the team.';

const SPREAD_TEST_REPLY =
  'TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server\n\n' +
  'Platform: MetaTrader 5\n' +
  'Server: Fundedelite-Server\n' +
  'Account Number: 55188\n' +
  'Password: QBG5FetfozKz7^a?J!\n\n' +
  'Use this account to check spreads.';

const TEMPLATE_PASSWORD = 'QBG5FetfozKz7^a?J!';
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
const GUARD_BUDGET_MS = 200;
const MAX_SECRETS = 200;

const DICT = new Set((
  'a an the of to and or for is are was were be been being in on at by with from as that this it its if then so not no yes you your we our they them he she his her my me i do did does can could would should will just about into over after before up down out off than too very also only other new one two three four five six seven eight nine ten first second third please change immediately will repeat back am escalating security event team hello hi hey ciao salam dear good morning afternoon evening ' +
  'password reset instructions account number spread spreads challenge payout payouts hello team reviewing today site hope pass your what our use check test demo send give server platform testing details funded elite metatrader dashboard login credentials credential email emails access after purchasing receive important help set start journey anytime clicking show section monitor statistics track requirements request find view certificates edit settings containing service information cannot changed fixed copy sharing weekend flash activation ' +
  'https http www com net org faq app tech en articles article collections collection how does the work instant additional info restricted countries process profit split trading contract signing minimum holding time trades tradable instruments commissions rolling passing hedge hedging latency arbitrage spamming strategy risk limits general documentation required live simulated verification operate under regulation free trial pay payment payments credit debit card cards wire transfers crypto processor affiliate taxes tax independent contractor responsible location applicable laws merge transition ensure personal financial seriously employ industry standard measures protect includes encryption secure processing regular audits evaluation phase phases type specific criteria passing achieve target avoid daily total drawdown complete profitable respect consistency present rules parameters easily monitored updated within maximum seconds custom made checkout website suitable option accept major methods ' +
  'fundedelite confirmo tradelocker metatrader5 mt4 mt5 anytime intercom trustpilot propfirmmatch support client clients message messages ticket tickets review reviews note notes owner team teammate sorry thanks thank welcome ok okay sure yes yep yeah alright got understood noted perfect great question questions answer answers policy policies rule rules country countries kyc identity document documents proof address bank statement utility bill withdrawal deposit bonus promotion promo leverage margin stop loss take profit news economic calendar session sessions market markets pair pairs forex crypto index indices commodity commodities gold silver oil eurusd gbpusd usdjpy spread spreadtest ' +
  'where when who why which while during without within between across per each both same such more most less least many much some any all own here there then once again still already every day days week weeks month months year years hour hours minute minutes next last current open closed pending active inactive available unavailable allowed allowed not allowed prohibited restricted violation violations breach fail failed failure success successful pass passed passing retry retries refund refunds fee fees price prices cost costs plan plans step steps lite instant flash standard pro plus premium basic advanced beginner ' +
  'please send me the account to check spreads on our new server platform number password use this details for testing funded elite hello sam ali ' +
  'about above across after again against all almost along already also although always among amount amounts another answer any anyone anything around asked asking available away back became because become before began behind being below best better between beyond both bring brought call called calling came cannot case cases certain change changed changes clear close closed come comes coming common company complete completed concern considered could country course current day days did different does doing done during each early either else end ended enough even ever every example fact facts far few final find first follow following form former found four from full further gave general get gets getting give given gives go going gone good got great had has have having held help her here high him himself his home however human idea if important include including information interest into itself just keep kept kind knew know known large last later least leave left less let life light like likely line little long look looked looking made make makes making man many may mean means might more most move much must name named near need needed needs never new next night none nor nothing now number numbers off often old once one only onto open opened or order ordered other others our out over own part parts people per perhaps person place plan point possible present problem problems program public put rather really right said same saw say says see seem seemed seen set several she should show showed shown side since small so some something sometimes still such system take taken takes taking tell than that their them then there these they thing things think third this those though thought three through thus time times to today together too took toward turn two under until up upon us use used using very want wanted was way we well went were what when where which while who whole whom why will with within without work worked working would year years yet you your'
).split(' ').filter(Boolean));

const CUES = new Set([
  'password', 'pass', 'pwd', 'passwd', 'passcode', 'pin', 'otp', 'secret', 'token', 'bearer', 'apikey', 'login',
]);

const PRODUCT = new Set(['fundedelite', 'confirmo', 'tradelocker', 'metatrader', 'intercom', 'trustpilot', 'propfirmmatch']);

const GREETINGS = new Set([
  'hello', 'hi', 'hey', 'ciao', 'salam', 'dear', 'good', 'morning', 'afternoon', 'evening',
  'السلام', 'علیکم', 'علیكم',
]);

const secretsByConversation = new Map();
const globalSecrets = [];
const lastAskByConversation = new Map();
const decisionsByKey = new Map();
const opQueue = [];

function boundsError() {
  const err = new Error('bounds');
  err.code = 'bounds';
  return err;
}

function budget() {
  return { deadline: Date.now() + GUARD_BUDGET_MS };
}

function checkBudget(state) {
  if (state && state.deadline && Date.now() > state.deadline) throw boundsError();
}

function payloadHash(body) {
  return crypto.createHash('sha256').update(String(body), 'utf8').digest('hex');
}

function isFormat(cp) {
  if (cp === 0x00ad || cp === 0xfeff || cp === 0x180e) return true;
  if (cp >= 0x200b && cp <= 0x200f) return true;
  if (cp >= 0x202a && cp <= 0x202e) return true;
  if (cp >= 0x2060 && cp <= 0x206f) return true;
  if (cp >= 0xfe00 && cp <= 0xfe0f) return true;
  return false;
}

function isCombining(cp) {
  if (cp >= 0x0300 && cp <= 0x036f) return true;
  if (cp >= 0x0483 && cp <= 0x0489) return true;
  if (cp >= 0x20d0 && cp <= 0x20ff) return true;
  if (cp >= 0x064b && cp <= 0x065f) return true;
  if (cp >= 0x0610 && cp <= 0x061a) return true;
  return false;
}

const FOLD = {
  0x0430: 'a', 0x0435: 'e', 0x043e: 'o', 0x0440: 'p', 0x0441: 'c', 0x0443: 'y', 0x0445: 'x',
  0x0456: 'i', 0x0458: 'j', 0x0455: 's', 0x04bb: 'h', 0x0473: 'v', 0x0451: 'e', 0x0442: 't',
  0x0410: 'a', 0x0415: 'e', 0x041e: 'o', 0x0420: 'p', 0x0421: 'c', 0x0423: 'y', 0x0425: 'x',
  0x0406: 'i', 0x0408: 'j', 0x0405: 's', 0x041d: 'h', 0x0412: 'b', 0x041a: 'k', 0x041c: 'm',
  0x03b1: 'a', 0x03b2: 'b', 0x03b5: 'e', 0x03b9: 'i', 0x03ba: 'k', 0x03bd: 'n', 0x03bf: 'o',
  0x03c1: 'p', 0x03c4: 't', 0x03c5: 'u', 0x03c7: 'x', 0x03b3: 'y', 0x03b7: 'n', 0x03c9: 'w',
  0x0391: 'a', 0x0392: 'b', 0x0395: 'e', 0x0399: 'i', 0x039a: 'k', 0x039d: 'n', 0x039f: 'o',
  0x03a1: 'p', 0x03a4: 't', 0x03a5: 'u', 0x03a7: 'x', 0x0393: 'y',
  0x0131: 'i', 0x0142: 'l', 0x0153: 'o', 0x00f8: 'o', 0x00e6: 'a', 0x0152: 'o', 0x00c6: 'a',
  0x2010: '-', 0x2011: '-', 0x2012: '-', 0x2013: '-', 0x2014: '-', 0x2212: '-',
};

function assertScannable(text) {
  const s = String(text == null ? '' : text);
  if (s.length > MAX_SCAN) throw boundsError();
  let run = 0;
  let prev = 0;
  const limit = s.length;
  for (let i = 0; i < limit; i++) {
    if ((i & 2047) === 0 && i > 0 && run > 32) break;
    const cp = s.charCodeAt(i);
    if (cp === prev && (cp === 60 || cp === 38 || cp === 33)) {
      run += 1;
      if (run > 32) throw boundsError();
    } else {
      prev = cp;
      run = 1;
    }
  }
  return s;
}

function hexValue(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 97 && c <= 102) return c - 87;
  if (c >= 65 && c <= 70) return c - 55;
  return -1;
}

function decodeEntitiesOnce(input, origins) {
  let out = '';
  const next = [];
  const s = input;
  let i = 0;
  while (i < s.length) {
    if (s.charCodeAt(i) !== 38) {
      out += s[i];
      next.push(origins ? origins[i] : i);
      i += 1;
      continue;
    }
    let j = i + 1;
    let closed = -1;
    while (j < s.length && j - i < 16) {
      if (s.charCodeAt(j) === 59) { closed = j; break; }
      j += 1;
    }
    if (closed < 0) {
      out += s[i];
      next.push(origins ? origins[i] : i);
      i += 1;
      continue;
    }
    const body = s.slice(i + 1, closed);
    let ch = '';
    const lower = body.toLowerCase();
    if (lower === 'amp') ch = '&';
    else if (lower === 'lt') ch = '<';
    else if (lower === 'gt') ch = '>';
    else if (lower === 'quot') ch = '"';
    else if (lower === 'apos') ch = "'";
    else if (lower === 'nbsp') ch = ' ';
    else if (body.charCodeAt(0) === 35) {
      let value = 0;
      let ok = false;
      if (body.charCodeAt(1) === 120 || body.charCodeAt(1) === 88) {
        ok = body.length > 2;
        for (let k = 2; k < body.length; k++) {
          const h = hexValue(body[k]);
          if (h < 0) { ok = false; break; }
          value = value * 16 + h;
        }
      } else {
        ok = body.length > 1;
        for (let k = 1; k < body.length; k++) {
          const d = body.charCodeAt(k) - 48;
          if (d < 0 || d > 9) { ok = false; break; }
          value = value * 10 + d;
        }
      }
      if (ok && value > 0 && value <= 0x10ffff && !(value < 32 && value !== 9 && value !== 10 && value !== 13)) {
        ch = String.fromCodePoint(value);
      }
    }
    if (!ch) {
      out += s[i];
      next.push(origins ? origins[i] : i);
      i += 1;
      continue;
    }
    out += ch;
    next.push(origins ? origins[i] : i);
    i = closed + 1;
  }
  return { text: out, origins: next };
}

function decodeEntitiesRepeat(text) {
  let current = String(text || '');
  let origins = null;
  for (let n = 0; n < 4; n++) {
    const decoded = decodeEntitiesOnce(current, origins);
    if (decoded.text === current) return decoded;
    current = decoded.text;
    origins = decoded.origins;
  }
  return { text: current, origins: origins };
}

function canonicalize(text, state) {
  checkBudget(state);
  const bounded = assertScannable(text);
  const decoded = decodeEntitiesRepeat(bounded);
  let canon = '';
  const map = [];
  let plain = '';
  const plainMap = [];
  for (let i = 0; i < decoded.text.length; i++) {
    if ((i & 4095) === 0) checkBudget(state);
    const origin = decoded.origins[i];
    let piece = decoded.text[i];
    if (piece === '\u00a0') piece = ' ';
    const expanded = piece.normalize('NFKC');
    for (const ch of expanded) {
      const cp = ch.codePointAt(0);
      if (isFormat(cp) || isCombining(cp)) continue;
      const folded = Object.prototype.hasOwnProperty.call(FOLD, cp) ? FOLD[cp] : ch.toLowerCase();
      for (const out of folded) {
        canon += out;
        map.push(origin);
        plain += out;
        plainMap.push(origin);
      }
    }
  }
  return { canon: canon, map: map, plain: plain, plainMap: plainMap, original: bounded };
}

function isDigit(ch) {
  const c = ch.charCodeAt(0);
  return c >= 48 && c <= 57;
}

function isAsciiLetter(ch) {
  const c = ch.charCodeAt(0);
  return c >= 97 && c <= 122;
}

function isLetter(ch) {
  if (isAsciiLetter(ch)) return true;
  const c = ch.codePointAt(0);
  if (c < 128) return false;
  if (isDigit(ch)) return false;
  if (c <= 32) return false;
  if (c >= 33 && c <= 47) return false;
  if (c >= 58 && c <= 64) return false;
  if (c >= 91 && c <= 96) return false;
  if (c >= 123 && c <= 126) return false;
  return true;
}

function isSepChar(ch) {
  return !isLetter(ch) && !isDigit(ch);
}

function tokenize(canon, map) {
  const tokens = [];
  let i = 0;
  while (i < canon.length) {
    while (i < canon.length && isSepChar(canon[i])) i += 1;
    if (i >= canon.length) break;
    const start = i;
    let skeleton = '';
    while (i < canon.length && !isSepChar(canon[i])) {
      skeleton += canon[i];
      i += 1;
    }
    tokens.push({
      skeleton: skeleton,
      canonStart: start,
      canonEnd: i,
      origStart: map[start],
      origEnd: map[i - 1] + 1,
    });
  }
  return tokens;
}

function isDictionary(skeleton) {
  if (!skeleton) return false;
  if (DICT.has(skeleton) || PRODUCT.has(skeleton)) return true;
  return false;
}

function allDigits(skeleton) {
  if (!skeleton) return false;
  for (let i = 0; i < skeleton.length; i++) if (!isDigit(skeleton[i])) return false;
  return true;
}

function asciiOnly(skeleton) {
  for (let i = 0; i < skeleton.length; i++) if (skeleton.charCodeAt(i) > 127) return false;
  return true;
}

function mixedClass(skeleton) {
  if (!skeleton || skeleton.length < 8 || !asciiOnly(skeleton)) return false;
  let letter = false;
  let digit = false;
  let symbol = false;
  for (let i = 0; i < skeleton.length; i++) {
    const ch = skeleton[i];
    if (isAsciiLetter(ch)) letter = true;
    else if (isDigit(ch)) digit = true;
    else symbol = true;
  }
  return letter && (digit || symbol);
}

function shannon(skeleton) {
  const counts = Object.create(null);
  for (let i = 0; i < skeleton.length; i++) {
    const ch = skeleton[i];
    counts[ch] = (counts[ch] || 0) + 1;
  }
  let h = 0;
  const n = skeleton.length;
  for (const key in counts) {
    const p = counts[key] / n;
    h -= p * Math.log(p) / Math.LN2;
  }
  return h;
}

function fragmentsOf(skeleton) {
  const out = [];
  let cur = '';
  for (let i = 0; i < skeleton.length; i++) {
    const ch = skeleton[i];
    if (isLetter(ch) || isDigit(ch)) cur += ch;
    else if (cur) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}

function hasSeparator(skeleton) {
  for (let i = 0; i < skeleton.length; i++) {
    if (!isLetter(skeleton[i]) && !isDigit(skeleton[i])) return true;
  }
  return false;
}

function marketCode(part) {
  let letters = 0;
  let digits = 0;
  for (let i = 0; i < part.length; i++) {
    if (isAsciiLetter(part[i])) letters += 1;
    else if (isDigit(part[i])) digits += 1;
    else return false;
  }
  if (!letters || digits < 2 || digits > 4) return false;
  return letters <= 8 && part.length <= 10;
}

function ordinaryWord(part) {
  if (!part || part.length > 14) return false;
  for (let i = 0; i < part.length; i++) if (!isLetter(part[i])) return false;
  if (part.length >= 10 && asciiOnly(part) && shannon(part) >= 3.55) return false;
  return true;
}

function compoundAllowed(skeleton) {
  if (!hasSeparator(skeleton)) return false;
  const parts = fragmentsOf(skeleton);
  if (!parts.length) return false;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (allDigits(part) || part.length <= 2) continue;
    if (isDictionary(part) || ordinaryWord(part) || marketCode(part)) continue;
    return false;
  }
  return true;
}

function isApprovedUrl(skeleton) {
  if (skeleton.indexOf('fundedelite.com') >= 0) return true;
  if (skeleton.indexOf('confirmo.net') >= 0) return true;
  if (skeleton.indexOf('intercom.io') >= 0) return true;
  if (skeleton.indexOf('intercom.com') >= 0) return true;
  if (skeleton.indexOf('trustpilot.com') >= 0) return true;
  if (skeleton.indexOf('propfirmmatch.com') >= 0) return true;
  return false;
}

function priceAllowed(skeleton) {
  let letters = 0;
  let digits = 0;
  for (let i = 0; i < skeleton.length; i++) {
    const ch = skeleton[i];
    if (isLetter(ch)) letters += 1;
    else if (isDigit(ch)) digits += 1;
    else if ('$£€%.,:-'.indexOf(ch) < 0) return false;
  }
  return digits > 0 && letters <= 3;
}

function allowlistedToken(skeleton, conversationId) {
  if (!skeleton) return true;
  if (allDigits(skeleton)) return true;
  if (conversationId && skeleton === String(conversationId).toLowerCase()) return true;
  if (priceAllowed(skeleton)) return true;
  if (isApprovedUrl(skeleton) && compoundAllowed(skeleton)) return true;
  if (compoundAllowed(skeleton)) return true;
  if (isDictionary(skeleton)) return true;
  return false;
}

function printable(text) {
  if (!text || text.length < 3) return false;
  let good = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0) return false;
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c > 160) good += 1;
  }
  return good / text.length > 0.85;
}

function tryBase64(token) {
  if (!token || token.length < 12 || token.length > 256) return '';
  let body = '';
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    const c = ch.charCodeAt(0);
    const ok = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || ch === '+' || ch === '/' || ch === '-' || ch === '_' || ch === '=';
    if (!ok) return '';
    if (ch === '=') {
      if (i < token.length - 2) return '';
      continue;
    }
    body += ch === '-' ? '+' : ch === '_' ? '/' : ch;
  }
  if (body.length < 12) return '';
  while (body.length % 4) body += '=';
  let decoded;
  try { decoded = Buffer.from(body, 'base64').toString('utf8'); } catch (_) { return ''; }
  if (!printable(decoded)) return '';
  let round = Buffer.from(decoded, 'utf8').toString('base64');
  let input = body;
  while (round.endsWith('=')) round = round.slice(0, -1);
  while (input.endsWith('=')) input = input.slice(0, -1);
  if (round !== input) return '';
  return decoded;
}

function tryHex(token) {
  if (!token || token.length < 12 || token.length > 256 || token.length % 2 !== 0) return '';
  let letters = false;
  for (let i = 0; i < token.length; i++) {
    if (hexValue(token[i]) < 0) return '';
    const c = token.charCodeAt(i);
    if ((c >= 97 && c <= 102) || (c >= 65 && c <= 70)) letters = true;
  }
  if (!letters) return '';
  let out = '';
  for (let i = 0; i < token.length; i += 2) {
    const value = hexValue(token[i]) * 16 + hexValue(token[i + 1]);
    if (value === 0) return '';
    out += String.fromCharCode(value);
  }
  if (!printable(out)) return '';
  return out;
}

function credentialValue(value) {
  if (!value || isDictionary(value) || allDigits(value)) return false;
  let digit = false;
  let letter = false;
  for (let i = 0; i < value.length; i++) {
    if (isDigit(value[i])) digit = true;
    else if (isLetter(value[i])) letter = true;
  }
  if (digit && letter && value.length >= 4) return true;
  if (!digit && letter && value.length >= 12 && shannon(value) >= 3.4) return true;
  return false;
}

function pushSecret(found, seen, skeleton) {
  if (!skeleton || skeleton.length < 4 || seen.has(skeleton)) return;
  if (skeleton === 'reset' || isDictionary(skeleton)) return;
  seen.add(skeleton);
  found.push(skeleton);
}

function joinedShortRuns(tokens) {
  const spans = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.skeleton.length > 2 || isDictionary(token.skeleton)) { i += 1; continue; }
    let j = i;
    let joined = '';
    while (j < tokens.length && tokens[j].skeleton.length <= 2 && !isDictionary(tokens[j].skeleton) && (j - i) < 16) {
      joined += tokens[j].skeleton;
      j += 1;
    }
    if (j - i >= 3 && joined.length >= 4) {
      spans.push({
        skeleton: joined,
        origStart: tokens[i].origStart,
        origEnd: tokens[j - 1].origEnd,
      });
    }
    i = j > i ? j : i + 1;
  }
  return spans;
}

function symbolGlued(tokens, canon, conversationId) {
  const found = [];
  let i = 0;
  while (i < tokens.length) {
    let j = i;
    while (j + 1 < tokens.length) {
      const between = canon.slice(tokens[j].canonEnd, tokens[j + 1].canonStart);
      if (!between) break;
      let whitespace = false;
      for (let k = 0; k < between.length; k++) {
        const c = between.charCodeAt(k);
        if (c === 32 || c === 10 || c === 9 || c === 13) whitespace = true;
      }
      if (whitespace) break;
      j += 1;
    }
    if (j > i) {
      const skeleton = canon.slice(tokens[i].canonStart, tokens[j].canonEnd);
      if (!allowlistedToken(skeleton, conversationId) && mixedClass(skeleton)) found.push(skeleton);
    }
    i = j + 1;
  }
  return found;
}

function classifyTokens(tokens, canon, conversationId, state) {
  const found = [];
  const seen = new Set();
  checkBudget(state);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const skeleton = token.skeleton;
    const cue = CUES.has(skeleton) || (skeleton === 'api' && tokens[i + 1] && tokens[i + 1].skeleton === 'key');
    if (!cue && allowlistedToken(skeleton, conversationId)) continue;
    if (!cue && mixedClass(skeleton)) pushSecret(found, seen, skeleton);
    const b64 = tryBase64(skeleton);
    if (b64) {
      pushSecret(found, seen, skeleton);
      if (state) state.depth = (state.depth || 0) + 1;
      if (!state || state.depth <= 3) {
        const inner = classifyText(b64, conversationId, state || { depth: 1, deadline: Date.now() + GUARD_BUDGET_MS });
        for (let k = 0; k < inner.length; k++) pushSecret(found, seen, inner[k]);
        if (printable(b64) && b64.length >= 4 && !isDictionary(b64.toLowerCase())) pushSecret(found, seen, skeletonOf(b64));
      }
      if (state) state.depth -= 1;
    }
    const hex = tryHex(skeleton);
    if (hex) pushSecret(found, seen, skeleton);
    if (!cue) continue;
    let cursor = i + 1;
    if (skeleton === 'api' && tokens[cursor] && tokens[cursor].skeleton === 'key') cursor += 1;
    const window = [];
    for (let w = cursor; w < tokens.length && w < cursor + 8; w++) {
      if (isDictionary(tokens[w].skeleton)) {
        if (window.length) break;
        continue;
      }
      window.push(tokens[w]);
      if (tokens[w].skeleton.length > 2 && window.length >= 1) break;
    }
    if (!window.length) continue;
    if (window.length >= 3 && window.every((item) => item.skeleton.length <= 2)) {
      let joined = '';
      for (let n = 0; n < window.length; n++) joined += window[n].skeleton;
      if (joined.length >= 4 && !isDictionary(joined)) pushSecret(found, seen, joined);
    }
    const value = window[window.length - 1].skeleton;
    if (credentialValue(value)) pushSecret(found, seen, value);
  }
  const glued = symbolGlued(tokens, canon || '', conversationId);
  for (let g = 0; g < glued.length; g++) pushSecret(found, seen, glued[g]);
  const runs = joinedShortRuns(tokens);
  for (let r = 0; r < runs.length; r++) {
    if (!isDictionary(runs[r].skeleton) && !allDigits(runs[r].skeleton)) {
      let nearCue = false;
      for (let t = 0; t < tokens.length; t++) {
        if (!CUES.has(tokens[t].skeleton)) continue;
        if (tokens[t].origEnd <= runs[r].origStart && runs[r].origStart - tokens[t].origEnd < 24) nearCue = true;
      }
      if (nearCue) pushSecret(found, seen, runs[r].skeleton);
    }
  }
  return found;
}

function skeletonOf(text) {
  const view = canonicalize(text, budget());
  let out = '';
  for (let i = 0; i < view.canon.length; i++) {
    const c = view.canon.charCodeAt(i);
    if ((c >= 48 && c <= 57) || (c >= 97 && c <= 122) || c > 127) out += view.canon[i];
  }
  return out;
}

function classifyText(text, conversationId, state) {
  const view = canonicalize(text, state);
  const tokens = tokenize(view.canon, view.map);
  return classifyTokens(tokens, view.canon, conversationId, state);
}

function rememberValues(conversationId, values) {
  const id = String(conversationId || '');
  const bag = id ? (secretsByConversation.get(id) || []) : [];
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!value || bag.indexOf(value) >= 0) continue;
    if (bag.length >= MAX_SECRETS) break;
    bag.push(value);
    if (globalSecrets.indexOf(value) < 0 && globalSecrets.length < 500) globalSecrets.push(value);
  }
  if (id) secretsByConversation.set(id, bag);
}

function rememberClientText(conversationId, text) {
  const raw = String(text == null ? '' : text);
  if (!raw) return;
  if (raw.length > MAX_SCAN) return;
  let hits = [];
  try { hits = classifyText(raw, conversationId, budget()); } catch (_) { return; }
  rememberValues(conversationId, hits);
  const id = String(conversationId || '');
  if (id) {
    try { lastAskByConversation.set(id, plainText(raw)); } catch (_) { lastAskByConversation.set(id, raw); }
  }
}

function rememberClientParts(conversationId, parts) {
  for (const part of parts || []) {
    if (!part) continue;
    const role = String(part.role || (part.author && part.author.type) || '');
    if (role && role.indexOf('user') < 0 && role.indexOf('lead') < 0 && role.indexOf('client') < 0 && role.indexOf('customer') < 0) continue;
    rememberClientText(conversationId, part.body || part.text || '');
  }
}

function secretsFor(conversationId) {
  const local = secretsByConversation.get(String(conversationId || '')) || [];
  const out = local.slice();
  for (let i = 0; i < globalSecrets.length; i++) {
    if (out.indexOf(globalSecrets[i]) < 0) out.push(globalSecrets[i]);
  }
  return out;
}

function resetStore() {
  secretsByConversation.clear();
  globalSecrets.length = 0;
  lastAskByConversation.clear();
  decisionsByKey.clear();
  opQueue.length = 0;
}

function plainText(text) {
  const bounded = String(text || '');
  if (bounded.length > MAX_SCAN) throw boundsError();
  let s = bounded;
  let i = 0;
  let out = '';
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { out += s.slice(i); break; }
    out += s.slice(i, lt);
    if (s.indexOf('<!--', lt) === lt) {
      const end = s.indexOf('-->', lt + 4);
      if (end < 0) throw boundsError();
      i = end + 3;
      continue;
    }
    const gt = s.indexOf('>', lt + 1);
    if (gt < 0 || gt - lt > 200) throw boundsError();
    const tag = s.slice(lt + 1, gt).toLowerCase();
    if (tag.indexOf('br') === 0 || tag.indexOf('/p') === 0 || tag.indexOf('p') === 0 || tag.indexOf('/div') === 0) out += '\n';
    i = gt + 1;
  }
  const decoded = decodeEntitiesRepeat(out).text;
  let plain = '';
  for (let n = 0; n < decoded.length; n++) {
    const ch = decoded[n];
    if (ch === '\u00a0') plain += ' ';
    else if (ch === '\r') continue;
    else plain += ch;
  }
  return plain;
}

function containsSpan(haystack, needle) {
  if (!needle || needle.length < 4) return false;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : haystack[at - 1];
    const after = at + needle.length >= haystack.length ? '' : haystack[at + needle.length];
    const bound = (ch) => !ch || isSepChar(ch);
    if (bound(before) && bound(after)) return true;
    if (needle.length >= 6 && at >= 0) return true;
    from = at + 1;
  }
  return false;
}

function textHasSecret(text, secrets, conversationId, includeOwn) {
  let view;
  try { view = canonicalize(text, budget()); } catch (err) { throw err; }
  const tokens = tokenize(view.canon, view.map);
  const own = includeOwn === false ? [] : classifyTokens(tokens, view.canon, conversationId, budget());
  if (own.length) return true;
  const joined = view.canon;
  for (let i = 0; i < secrets.length; i++) {
    if (containsSpan(joined, secrets[i])) return true;
    for (let t = 0; t < tokens.length; t++) {
      if (tokens[t].skeleton === secrets[i]) return true;
      if (secrets[i].length >= 6 && tokens[t].skeleton.indexOf(secrets[i]) >= 0) return true;
    }
  }
  return false;
}

function rangesForSecrets(text, secrets, conversationId) {
  const view = canonicalize(text, budget());
  const tokens = tokenize(view.canon, view.map);
  const own = classifyTokens(tokens, view.canon, conversationId, budget());
  const wanted = secrets.slice();
  for (let i = 0; i < own.length; i++) if (wanted.indexOf(own[i]) < 0) wanted.push(own[i]);
  const ranges = [];
  const runs = joinedShortRuns(tokens);
  const pieces = tokens.concat(runs);
  for (let p = 0; p < pieces.length; p++) {
    const piece = pieces[p];
    let hit = false;
    for (let s = 0; s < wanted.length; s++) {
      if (piece.skeleton === wanted[s]) hit = true;
      else if (wanted[s].length >= 6 && piece.skeleton.indexOf(wanted[s]) >= 0) hit = true;
    }
    if (hit) ranges.push({ start: piece.origStart, end: piece.origEnd });
  }
  ranges.sort((a, b) => b.start - a.start);
  return ranges;
}

function scrubText(text, conversationId) {
  const raw = String(text == null ? '' : text);
  if (!raw) return raw;
  if (raw.length > MAX_SCAN) return '[redacted]';
  if (payloadHash(raw) === AUTHORIZED_PROMPT_DISCLOSURE.sha256 && raw.length === AUTHORIZED_PROMPT_DISCLOSURE.length) return raw;
  let ranges;
  try { ranges = rangesForSecrets(raw, secretsFor(conversationId), conversationId); } catch (_) { return '[redacted]'; }
  if (!ranges.length) return raw;
  let out = raw;
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (range.start < 0 || range.end > out.length || range.start >= range.end) continue;
    out = out.slice(0, range.start) + '[redacted]' + out.slice(range.end);
  }
  return out;
}

function redactForConversation(conversationId, text) {
  return scrubText(text, conversationId);
}

function redactText(text, extra) {
  if (extra && extra.length) rememberValues('', extra.map((item) => skeletonOf(String(item || ''))));
  return scrubText(text, '');
}

function redactSystemContent(conversationId, text) {
  const raw = String(text == null ? '' : text);
  if (raw.length === AUTHORIZED_PROMPT_DISCLOSURE.length && payloadHash(raw) === AUTHORIZED_PROMPT_DISCLOSURE.sha256) return raw;
  if (raw.length > AUTHORIZED_PROMPT_DISCLOSURE.length) {
    const prefix = raw.slice(0, AUTHORIZED_PROMPT_DISCLOSURE.length);
    if (payloadHash(prefix) === AUTHORIZED_PROMPT_DISCLOSURE.sha256) {
      return prefix + scrubText(raw.slice(prefix.length), conversationId);
    }
  }
  return scrubText(raw, conversationId);
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
    if (key === 'tool_calls' || key === 'function' || key === 'arguments' || key === 'content' || key === 'text' || key === 'body') {
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
  if (!sink || sink.__credGuardR11) return sink;
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
  sink.__credGuardR11 = true;
  return sink;
}

function indexOfMarker(text, marker) {
  return text.indexOf(marker);
}

function hasMarker(text, markers) {
  for (let i = 0; i < markers.length; i++) if (text.indexOf(markers[i]) >= 0) return true;
  return false;
}

const SPREAD_MARKERS = ['spread', 'spreads', 'سپریڈ', 'اسپریڈ', 'स्प्रेड', 'سبريد', 'السبريد'];
const CHECK_MARKERS = ['check', 'test', 'demo', 'account', 'credentials', 'چیک', 'ٹیسٹ', 'اکاؤنٹ', 'اکاونٹ', 'चेक', 'टेस्ट', 'अकाउंट', 'खाता', 'حساب', 'اختبار', 'أتحقق', 'اختبر', 'افحص', 'تحقق', 'فحص'];
const HOW_MARKERS = ['how', 'kaise', 'कैसे', 'کیسے', 'كيف', 'طریقہ', 'तरीका', 'طريق', 'بتائ', 'बता'];
const SEND_MARKERS = ['send', 'give me', 'bhej', 'dena', 'بھیج', 'भेज', 'أرسل', 'mujhe', 'mjhe', 'مجھے', 'मुझे'];

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

function isExplicitSpreadTestRequest(text) {
  let plain;
  try { plain = plainText(text).toLowerCase(); } catch (_) { return false; }
  if (plain.indexOf('spreadsheet') >= 0 || plain.indexOf('spread sheet') >= 0) return false;
  const clauses = clauseList(plain);
  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    if (clause.indexOf('payout') >= 0) continue;
    if (negated(clause) || defined(clause) || selfReport(clause) || thirdParty(clause)) continue;
    if (!hasMarker(clause, SPREAD_MARKERS)) continue;
    if (!hasMarker(clause, CHECK_MARKERS)) continue;
    if (!requestShape(clause)) continue;
    return true;
  }
  return false;
}

function greetingPrefixOk(prefix) {
  const trimmed = prefix.trim();
  if (!trimmed) return true;
  const lines = trimmed.split('\n');
  const line = lines[lines.length - 1].trim();
  let token = '';
  const tokens = [];
  const source = line.toLowerCase();
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (isLetter(ch)) token += ch;
    else if (token) { tokens.push(token); token = ''; }
  }
  if (token) tokens.push(token);
  if (!tokens.length || tokens.length > 4) return false;
  let unknown = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (GREETINGS.has(tokens[i]) || isDictionary(tokens[i])) continue;
    unknown += 1;
    if (tokens[i].length > 16) return false;
  }
  return unknown <= 1 && (GREETINGS.has(tokens[0]) || tokens[0].indexOf('السلام') >= 0);
}

function isDeliverableSpreadTemplate(body) {
  let plain;
  try {
    const rawPlain = plainText(body).trim();
    let collapsed = '';
    let newlines = 0;
    for (let i = 0; i < rawPlain.length; i++) {
      if (rawPlain[i] === '\n') {
        newlines += 1;
        if (newlines <= 2) collapsed += '\n';
      } else {
        newlines = 0;
        collapsed += rawPlain[i];
      }
    }
    plain = collapsed.trim();
  } catch (_) { return false; }
  if (plain === SPREAD_TEST_REPLY) return true;
  const at = plain.indexOf(SPREAD_TEST_REPLY);
  if (at < 0) return false;
  if (plain.slice(at) !== SPREAD_TEST_REPLY) return false;
  return greetingPrefixOk(plain.slice(0, at));
}

function isExactSpreadTemplate(body) {
  try { return plainText(body).trim() === SPREAD_TEST_REPLY; } catch (_) { return false; }
}

function latestClientAsk(ctx) {
  const texts = [];
  const history = ctx.history || [];
  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    if (typeof item === 'string') texts.push(item);
    else if (item) texts.push(String(item.text || item.body || ''));
  }
  const clientTexts = ctx.clientTexts || [];
  for (let i = 0; i < clientTexts.length; i++) if (typeof clientTexts[i] === 'string') texts.push(clientTexts[i]);
  if (typeof ctx.clientText === 'string') texts.push(ctx.clientText);
  if (texts.length) return texts[texts.length - 1];
  if (ctx.conversationId && lastAskByConversation.has(String(ctx.conversationId))) return lastAskByConversation.get(String(ctx.conversationId)) || '';
  return '';
}

function baseResult() {
  return { version: STATUS.candidate, frozen: true, approved: false, release: false, wired: false, silent: false };
}

function blocked(reason) {
  return Object.assign(baseResult(), {
    action: 'block', reason: reason, post: false, posted: false, blocked: true, body: null, diagnostic: { reason: reason },
  });
}

function allowed(reason, body) {
  return Object.assign(baseResult(), {
    action: 'allow', reason: reason, post: true, posted: false, blocked: false, body: body, diagnostic: { reason: reason },
  });
}

function fixedResult(reason) {
  return Object.assign(baseResult(), {
    action: 'fixed_message', reason: reason, post: true, posted: false, blocked: false, body: FIXED_MESSAGE, diagnostic: { reason: reason },
  });
}

function finish(result, eligible) {
  result.spreadEligible = !!eligible;
  return result;
}

function explainHits(body, conversationId) {
  const view = canonicalize(body, budget());
  const tokens = tokenize(view.canon, view.map);
  return classifyTokens(tokens, view.canon, conversationId, budget());
}

function decide(ctx) {
  if (typeof ctx.body !== 'string') return blocked('non_string');
  const body = ctx.body;
  if (body.length > MAX_SCAN) throw boundsError();
  assertScannable(body);
  const history = ctx.history || [];
  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    const text = typeof item === 'string' ? item : (item && (item.text || item.body)) || '';
    rememberClientText(ctx.conversationId, text);
  }
  const clientTexts = ctx.clientTexts || [];
  for (let i = 0; i < clientTexts.length; i++) rememberClientText(ctx.conversationId, clientTexts[i]);
  if (typeof ctx.clientText === 'string') rememberClientText(ctx.conversationId, ctx.clientText);
  const eligible = isExplicitSpreadTestRequest(latestClientAsk(ctx));
  if (body === FIXED_MESSAGE || payloadHash(body) === FIXED_HASH) return finish(allowed('fixed_echo', body), eligible);
  if (isDeliverableSpreadTemplate(body)) {
    if (!eligible) return finish(fixedResult('spread_not_eligible'), eligible);
    const passwordSkeleton = skeletonOf(TEMPLATE_PASSWORD);
    const secrets = secretsFor(ctx.conversationId).filter((value) => value !== passwordSkeleton);
    if (textHasSecret(body, secrets, ctx.conversationId, false)) return finish(fixedResult('residual_secret'), eligible);
    return finish(allowed('spread_template', body), eligible);
  }
  const secrets = secretsFor(ctx.conversationId);
  if (!textHasSecret(body, secrets, ctx.conversationId)) return finish(allowed('clean', body), eligible);
  if (textHasSecret(FIXED_MESSAGE, secrets, ctx.conversationId)) return finish(blocked('unsanitizable'), eligible);
  return finish(fixedResult('deny_default'), eligible);
}

function guardSend(input) {
  try {
    const ctx = input || {};
    const decision = decide(ctx);
    if (typeof ctx.body === 'string') bindDecision(ctx.conversationId, ctx.body, decision);
    return decision;
  } catch (_) {
    return blocked('validation_error');
  }
}

function canonicalBody(body) {
  try { return plainText(body); } catch (_) { return ''; }
}

function decisionKeysFor(conversationId, body) {
  const id = String(conversationId || '');
  if (typeof body !== 'string') return [];
  return [id + '\n' + payloadHash(body), id + '\n' + payloadHash(canonicalBody(body))];
}

function bindDecision(conversationId, inputBody, decision) {
  if (typeof inputBody !== 'string' || !decision) return decision;
  const record = {
    post: !!decision.post,
    action: decision.action,
    reason: decision.reason,
    body: decision.body,
    spreadEligible: !!decision.spreadEligible,
  };
  const keys = decisionKeysFor(conversationId, inputBody).concat(typeof decision.body === 'string' ? decisionKeysFor(conversationId, decision.body) : []);
  for (let i = 0; i < keys.length; i++) decisionsByKey.set(keys[i], record);
  decision.payloadHash = payloadHash(typeof decision.body === 'string' ? decision.body : inputBody);
  return decision;
}

function peekDecision(conversationId, body) {
  const keys = decisionKeysFor(conversationId, body);
  for (let i = 0; i < keys.length; i++) if (decisionsByKey.has(keys[i])) return decisionsByKey.get(keys[i]);
  return null;
}

function consumeDecision(conversationId, record) {
  if (!record) return;
  const prefix = String(conversationId || '') + '\n';
  for (const [key, value] of decisionsByKey) {
    if (value === record && key.indexOf(prefix) === 0) decisionsByKey.delete(key);
  }
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

function shipWrite(data, decision) {
  if (!decision.post) {
    return {
      post: false, blocked: true, posted: false, data: null, reason: decision.reason,
      spreadEligible: !!decision.spreadEligible, payloadHash: decision.payloadHash || null,
      diagnostic: { reason: decision.reason },
    };
  }
  const safe = typeof decision.body === 'string' ? decision.body : data.body;
  let ship = data.body;
  if (typeof data.body === 'string' && typeof safe === 'string') {
    const same = data.body === safe || canonicalBody(data.body) === canonicalBody(safe);
    ship = same ? data.body : safe;
  }
  const next = ship === data.body ? data : Object.assign({}, data, { body: ship });
  return {
    post: true, blocked: false, posted: false, data: next, reason: decision.reason,
    spreadEligible: !!decision.spreadEligible,
    payloadHash: payloadHash(typeof ship === 'string' ? ship : ''),
    diagnostic: { reason: decision.reason },
  };
}

function guardOutboundWrite(url, data) {
  try {
    if (!data || typeof data !== 'object' || !Object.prototype.hasOwnProperty.call(data, 'body')) {
      return { post: true, blocked: false, posted: false, data: data, reason: 'no_public_body', spreadEligible: false, diagnostic: { reason: 'no_public_body' } };
    }
    const conversationId = conversationIdFromUrl(url);
    const prior = peekDecision(conversationId, data.body);
    if (prior) {
      consumeDecision(conversationId, prior);
      return shipWrite(data, prior);
    }
    const decision = guardSend({
      conversationId: conversationId,
      messageType: String(data.message_type || '') === 'note' ? 'note' : 'comment',
      body: data.body,
    });
    consumeDecision(conversationId, peekDecision(conversationId, data.body) || decision);
    return shipWrite(data, decision);
  } catch (_) {
    return { post: false, blocked: true, posted: false, data: null, reason: 'validation_error', diagnostic: { reason: 'validation_error' } };
  }
}

function carriesCustomerText(data) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.body === 'string' && data.body.trim()) return true;
  if (typeof data.text === 'string' && data.text.trim()) return true;
  if (typeof data.clientText === 'string' && data.clientText.trim()) return true;
  return false;
}

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function enqueuePublicOp(input) {
  const ctx = input || {};
  const decision = guardSend(ctx);
  consumeDecision(ctx.conversationId, peekDecision(ctx.conversationId, ctx.body));
  if (!decision.post || decision.action !== 'allow' || decision.body !== ctx.body) {
    return { ok: false, queued: false, posted: false, post: false, blocked: true, reason: decision.reason || 'blocked', diagnostic: { reason: decision.reason || 'blocked' } };
  }
  const rec = { id: 'op-' + (opQueue.length + 1), conversationId: String(ctx.conversationId || ''), messageType: String(ctx.messageType || 'comment'), body: decision.body };
  opQueue.push(rec);
  return { ok: true, queued: true, posted: false, post: false, blocked: false, id: rec.id, reason: 'queued', diagnostic: { reason: 'queued' } };
}

function restoreQueuedOp(record) {
  const src = record || {};
  opQueue.push({
    id: String(src.id || ('op-restored-' + (opQueue.length + 1))),
    conversationId: String(src.conversationId || ''),
    messageType: String(src.messageType || 'comment'),
    body: src.body,
  });
  return { restored: true, posted: false, id: opQueue[opQueue.length - 1].id };
}

function inspectQueue() {
  return opQueue.map((op) => ({ id: op.id, bytes: typeof op.body === 'string' ? op.body.length : -1 }));
}

function flushQueue(transport) {
  const posted = [];
  const blockedItems = [];
  const pending = opQueue.splice(0);
  const deliver = transport && typeof transport.record === 'function' ? transport.record.bind(transport) : null;
  for (let i = 0; i < pending.length; i++) {
    const op = pending[i];
    const decision = guardSend({ conversationId: op.conversationId, messageType: op.messageType, body: op.body });
    consumeDecision(op.conversationId, peekDecision(op.conversationId, op.body));
    if (!decision.post || decision.action !== 'allow' || decision.body !== op.body) {
      blockedItems.push({ id: op.id, reason: decision.reason || 'blocked', posted: false });
      continue;
    }
    const payload = { conversationId: op.conversationId, messageType: op.messageType, body: decision.body };
    if (deliver) deliver(snapshot(payload));
    posted.push(snapshot(payload));
  }
  return { posted: posted, blocked: blockedItems };
}

function createRecordingTransport() {
  const records = [];
  function push(entry) {
    records.push(snapshot(entry));
    return { ok: true, posted: true };
  }
  return {
    records: records,
    postReply(conversationId, messageType, body) {
      return push({ via: 'postReply', conversationId: conversationId, messageType: messageType, body: body });
    },
    postClientCommentOnce(conversationId, body, userPart, clientName) {
      return push({ via: 'postClientCommentOnce', conversationId: conversationId, body: body, userPart: userPart || null, clientName: clientName || '' });
    },
    record(payload) { return push(payload); },
  };
}

function closedChokeResult() {
  return { ok: false, blocked: true, posted: false, post: false, reason: 'validation_error', body: null, diagnostic: { reason: 'validation_error' } };
}

function createChoke(raw) {
  const post = raw && raw.postReply;
  const once = raw && raw.postClientCommentOnce;
  if (typeof post !== 'function' || typeof once !== 'function') throw new Error('createChoke requires postReply and postClientCommentOnce');
  return {
    postReply(conversationId, messageType, body, guardCtx) {
      let decision;
      try { decision = guardSend(Object.assign({ conversationId: conversationId, messageType: messageType, body: body }, guardCtx || {})); }
      catch (_) { return closedChokeResult(); }
      if (!decision.post) return { ok: false, blocked: true, posted: false, post: false, reason: decision.reason, body: null, diagnostic: { reason: decision.reason } };
      return post(conversationId, messageType, decision.body, guardCtx);
    },
    postClientCommentOnce(conversationId, body, userPart, clientName, guardCtx) {
      let decision;
      try {
        const ctx = guardCtx || {};
        if (ctx.parts) rememberClientParts(conversationId, ctx.parts);
        if (userPart) rememberClientParts(conversationId, [userPart]);
        const clientTexts = Array.isArray(ctx.clientTexts) ? ctx.clientTexts.slice() : [];
        if (userPart) clientTexts.push(String(userPart.body || userPart.text || ''));
        decision = guardSend({ conversationId: conversationId, messageType: 'comment', body: body, history: ctx.history, clientTexts: clientTexts, clientText: ctx.clientText });
      } catch (_) { return closedChokeResult(); }
      if (!decision.post) return { ok: false, blocked: true, posted: false, post: false, reason: decision.reason, body: null, diagnostic: { reason: decision.reason } };
      return once(conversationId, decision.body, userPart, clientName, guardCtx || {});
    },
  };
}

function redactDiagnostic(value) {
  return scrubAny(value, '', new Set());
}

function redactTurnMeta(meta) {
  return scrubAny(meta || {}, '', new Set());
}

function loadCredentialGuard() {
  const names = ['./credentialGuardR11', '../credentialGuardR11', '../01_runtime/credentialGuardR11'];
  for (let i = 0; i < names.length; i++) {
    try { return require(names[i]); } catch (err) {
      if (!err || err.code !== 'MODULE_NOT_FOUND') throw err;
    }
  }
  return null;
}

module.exports = {
  STATUS,
  FIXED_MESSAGE,
  SPREAD_TEST_REPLY,
  TEMPLATE_PASSWORD,
  TEMPLATE_HASH,
  AUTHORIZED_PROMPT_DISCLOSURE,
  payloadHash,
  rememberClientText,
  rememberClientParts,
  secretsFor,
  resetStore,
  redactText,
  redactForConversation,
  redactSystemContent,
  guardModelMessages,
  redactDiagnostic,
  redactTurnMeta,
  scrubLogArgs,
  installProcessScrub,
  loadCredentialGuard,
  isExplicitSpreadTestRequest,
  isExactSpreadTemplate,
  isDeliverableSpreadTemplate,
  carriesCustomerText,
  canonicalBody,
  guardSend,
  guardOutboundWrite,
  enqueuePublicOp,
  restoreQueuedOp,
  inspectQueue,
  flushQueue,
  createRecordingTransport,
  createChoke,
  explainHits,
};
