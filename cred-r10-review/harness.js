'use strict';

/**
 * Independent Credential Guard R10 review harness.
 * Drives the patched handlers. Does not load the author's test file or any review branch.
 *
 * Frozen HEAD: ffbbcafb6fbe0afd73195d501299d7895e0f71dd
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const FROZEN = 'ffbbcafb6fbe0afd73195d501299d7895e0f71dd';
const FLAT = process.env.R10_FLAT || '/tmp/r10-flat';
const SRC = process.env.R10_SRC || '/tmp/r10-src';
const WORK = process.env.R10_WORK || '/tmp/r10-run';
const HERE = __dirname;

const S = {
  api: 'r10sApiKeyVal9',
  api2: 'r10sApiBare99',
  token: 'r10sTokenValue99',
  tokenGlue: 'r10sTokenglued99',
  bearer: 'r10sBearerTok99',
  sec: 'r10sSecretVal99',
  sk: 'sk-r10sAbCdEf12',
  embed: 'r10sEmbed99',
  nest: 'r10sNestB64v9',
  nfkc: 'r10sNfkcVal9',
  homo: 'r10sHomoVal9',
  homo2: 'r10sHomoUnmap9',
  zw: 'r10sZwVal99',
  spaced: 'r10sSpaced9',
  leet: 'r10sLeetVal9',
  multi: 'r10sMultiVal9',
  pin: '4Q',
  otp: '7k3',
  spwd: 'aB3',
  passcode: '9z',
  mfa: '5p8',
  persist: 'r10sPersist9',
  note: 'r10sNoteVal9',
  owner: 'r10sOwnerVal9',
  defer: 'r10sDeferVal9',
  sum: 'r10sSumVal99',
  maint: 'r10sMaintVal9',
  chat: 'r10sChatVal99',
  dos: 'r10sDosVal99',
  retry: 'r10sRetryVal9',
  pre: 'r10sPreVal99',
  tool: 'r10sToolVal99',
  pwd: 'r10s-Hunt9kQ',
};

function sec(name) {
  return [{ name: name, value: S[name] }];
}

function ents(s) {
  return [...String(s)].map((ch) => '&#' + ch.codePointAt(0) + ';').join('');
}

function nestEnt(s, n) {
  let out = String(s);
  for (let i = 0; i < n; i += 1) out = ents(out);
  return out;
}

function b64(s) {
  return Buffer.from(String(s), 'utf8').toString('base64');
}

function nb64(s, n) {
  let out = String(s);
  for (let i = 0; i < n; i += 1) out = b64(out);
  return out;
}

function fullwidth(s) {
  return [...String(s)].map((ch) => {
    const c = ch.codePointAt(0);
    if (c >= 33 && c <= 126) return String.fromCodePoint(c - 33 + 0xff01);
    return ch;
  }).join('');
}

function live(row) {
  return Object.assign({
    kind: 'webhook',
    expect: 'scrub',
    timeoutMs: 12000,
    secrets: [],
  }, row);
}

function buildCases() {
  const cases = [];
  const add = (row) => cases.push(live(row));

  const keys = [
    ['k-api-colon', 'api_key: ' + S.api, 'api'],
    ['k-api-space', 'API key ' + S.api, 'api'],
    ['k-apikey-space', 'apikey ' + S.api, 'api'],
    ['k-apikey-eq', 'apikey=' + S.api, 'api'],
    ['k-api-hyphen', 'api-key: ' + S.api2, 'api2'],
    ['k-api-underscore', 'api_key ' + S.api2, 'api2'],
    ['k-token-colon', 'token: ' + S.token, 'token'],
    ['k-token-space', 'token ' + S.token, 'token'],
    ['k-token-glue', 'token' + S.tokenGlue, 'tokenGlue'],
    ['k-bearer-space', 'bearer ' + S.bearer, 'bearer'],
    ['k-bearer-cap', 'Bearer ' + S.bearer, 'bearer'],
    ['k-secret-colon', 'secret: ' + S.sec, 'sec'],
    ['k-secret-space', 'secret ' + S.sec, 'sec'],
    ['k-sk-bare', 'please look at ' + S.sk, 'sk'],
    ['k-api-copula', 'my api key is ' + S.api, 'api'],
    ['k-token-eq', 'token=' + S.token, 'token'],
    ['k-secret-eq', 'secret=' + S.sec, 'sec'],
    ['k-apikey-glue', 'apikey' + S.api2, 'api2'],
  ];
  for (const [id, text, name] of keys) {
    add({ id: id, group: 'key', text: text, echo: S[name], secrets: sec(name) });
  }

  add({ id: 'e-boundary', group: 'embedded', text: 'password: ' + S.embed, echo: S.embed, secrets: sec('embed') });
  add({ id: 'e-glued', group: 'embedded', text: 'password: ' + S.embed, echo: 'zz' + S.embed + 'zz', secrets: sec('embed') });
  add({ id: 'e-hyphen', group: 'embedded', text: 'password: ' + S.embed, echo: 'pre-' + S.embed + '-post', secrets: sec('embed') });
  add({ id: 'e-paren', group: 'embedded', text: 'password: ' + S.embed, echo: '(' + S.embed + ')', secrets: sec('embed') });
  add({ id: 'e-only-glued', group: 'embedded', text: 'ref zzr10sEmbed99zz thanks', echo: 'zz' + S.embed + 'zz', secrets: sec('embed') });
  add({ id: 'e-copula', group: 'embedded', text: 'the password is ' + S.embed + ' thanks', echo: S.embed, secrets: sec('embed') });
  add({ id: 'e-url', group: 'embedded', text: 'password: ' + S.embed, echo: 'https://example.test/' + S.embed + '/x', secrets: sec('embed') });
  add({ id: 'e-quoted', group: 'embedded', text: 'password: "' + S.embed + '"', echo: S.embed, secrets: sec('embed') });

  const plain = 'password: ' + S.pwd;
  add({ id: 'h-colon-ent', group: 'html', text: 'password&#58; ' + S.pwd, echo: S.pwd, secrets: sec('pwd') });
  add({ id: 'h-full-ent', group: 'html', text: ents(plain), echo: S.pwd, secrets: sec('pwd') });
  add({ id: 'h-nest-2', group: 'html', text: nestEnt(plain, 2), echo: S.pwd, secrets: sec('pwd') });
  add({ id: 'h-nest-3', group: 'html', text: nestEnt(plain, 3), echo: S.pwd, secrets: sec('pwd') });
  add({ id: 'h-nest-4', group: 'html', text: nestEnt(plain, 4), echo: S.pwd, secrets: sec('pwd') });
  add({ id: 'h-comment', group: 'html', text: 'Hello <!-- password: ' + S.pwd + ' --> can you help?', echo: S.pwd, secrets: sec('pwd') });
  add({ id: 'h-attr', group: 'html', text: '<div data-password="' + S.pwd + '">What is the refund policy?</div>', echo: S.pwd, secrets: sec('pwd') });
  add({ id: 'h-attr-pwd', group: 'html', text: '<input password="' + S.pwd + '">How can I pay for the challenge?', echo: S.pwd, secrets: sec('pwd') });
  add({ id: 'h-br', group: 'html', text: 'password:<br>' + S.pwd, echo: S.pwd, secrets: sec('pwd') });
  add({ id: 'h-hex-ent', group: 'html', text: 'password: ' + [...S.pwd].map((ch) => '&#x' + ch.codePointAt(0).toString(16) + ';').join(''), echo: S.pwd, secrets: sec('pwd') });

  add({ id: 'b-raw-1', group: 'base64', text: nb64(plain, 1), echo: S.nest, secrets: [{ name: 'nest', value: S.nest }, { name: 'pwd', value: S.pwd }] });
  add({ id: 'b-raw-2', group: 'base64', text: nb64(plain, 2), echo: S.pwd, secrets: sec('pwd') });
  add({ id: 'b-raw-3', group: 'base64', text: nb64(plain, 3), echo: S.pwd, secrets: sec('pwd') });
  add({ id: 'b-token-1', group: 'base64', text: 'token: ' + nb64(plain, 1), echo: S.pwd, secrets: sec('pwd') });
  add({ id: 'b-token-2', group: 'base64', text: 'token: ' + nb64(plain, 2), echo: S.pwd, secrets: sec('pwd') });
  add({ id: 'b-value', group: 'base64', text: 'password: ' + b64(S.nest), echo: S.nest, secrets: sec('nest') });

  add({ id: 'n-label', group: 'nfkc', text: fullwidth('password: ') + S.nfkc, echo: S.nfkc, secrets: sec('nfkc') });
  add({ id: 'n-value', group: 'nfkc', text: 'password: ' + fullwidth(S.nfkc), echo: S.nfkc, secrets: sec('nfkc') });
  add({ id: 'n-both', group: 'nfkc', text: fullwidth('password: ' + S.nfkc), echo: S.nfkc, secrets: sec('nfkc') });
  add({ id: 'n-compat-space', group: 'nfkc', text: 'password:\u00a0' + S.nfkc, echo: S.nfkc, secrets: sec('nfkc') });

  add({ id: 'o-cyr-a', group: 'homoglyph', text: 'p\u0430ssword: ' + S.homo, echo: S.homo, secrets: sec('homo') });
  add({ id: 'o-cyr-o', group: 'homoglyph', text: 'passw\u043erd: ' + S.homo, echo: S.homo, secrets: sec('homo') });
  add({ id: 'o-greek-o', group: 'homoglyph', text: 'passw\u03bfrd: ' + S.homo, echo: S.homo, secrets: sec('homo') });
  add({ id: 'o-greek-a', group: 'homoglyph', text: 'p\u03b1ssword: ' + S.homo, echo: S.homo, secrets: sec('homo') });
  add({ id: 'o-unmap', group: 'homoglyph', text: 'p\u1d41assword: ' + S.homo2, echo: S.homo2, secrets: sec('homo2') });
  add({ id: 'o-value', group: 'homoglyph', text: 'password: ' + 'r10sH\u043em\u043eVal9', echo: S.homo, secrets: sec('homo') });

  add({ id: 'z-label', group: 'zerowidth', text: 'pass\u200bword: ' + S.zw, echo: S.zw, secrets: sec('zw') });
  add({ id: 'z-value', group: 'zerowidth', text: 'password: ' + S.zw.slice(0, 4) + '\u200b' + S.zw.slice(4), echo: S.zw, secrets: sec('zw') });
  add({ id: 'z-zwj', group: 'zerowidth', text: 'pass\u200dword: ' + S.zw, echo: S.zw, secrets: sec('zw') });
  add({ id: 'z-bom', group: 'zerowidth', text: '\uFEFFpassword: ' + S.zw, echo: S.zw, secrets: sec('zw') });
  add({ id: 'z-wj', group: 'zerowidth', text: 'password\u2060: ' + S.zw, echo: S.zw, secrets: sec('zw') });
  add({ id: 'z-split-label', group: 'zerowidth', text: 'p\u200ba\u200bs\u200bs\u200bword: ' + S.zw, echo: S.zw, secrets: sec('zw') });

  add({ id: 's-spaces', group: 'spaced', text: 'password: ' + S.spaced.split('').join(' '), echo: S.spaced, secrets: sec('spaced') });
  add({ id: 's-hyphen', group: 'spaced', text: 'password: ' + S.spaced.split('').join('-'), echo: S.spaced, secrets: sec('spaced') });
  add({ id: 's-dots', group: 'spaced', text: 'password: ' + S.spaced.split('').join('.'), echo: S.spaced, secrets: sec('spaced') });
  add({ id: 's-label-split', group: 'spaced', text: 'p a s s w o r d : ' + S.spaced, echo: S.spaced, secrets: sec('spaced') });
  add({ id: 's-exact-spaced', group: 'spaced', text: 'password: ' + S.spaced.split('').join(' '), echo: S.spaced.split('').join(' '), secrets: sec('spaced') });
  add({ id: 's-exact-hyphen', group: 'spaced', text: 'password: ' + S.spaced.split('').join('-'), echo: S.spaced.split('').join('-'), secrets: sec('spaced') });
  add({ id: 's-symbols', group: 'spaced', text: 'password: ' + S.spaced.split('').join('*'), echo: S.spaced, secrets: sec('spaced') });
  add({ id: 's-mixed', group: 'spaced', text: 'pwd = ' + S.spaced.split('').join(' / '), echo: S.spaced, secrets: sec('spaced') });

  add({ id: 'l-4', group: 'leet', text: 'p4ssw0rd: ' + S.leet, echo: S.leet, secrets: sec('leet') });
  add({ id: 'l-at', group: 'leet', text: 'p@ssword: ' + S.leet, echo: S.leet, secrets: sec('leet') });
  add({ id: 'l-copula', group: 'leet', text: 'passw0rd is ' + S.leet, echo: S.leet, secrets: sec('leet') });
  add({ id: 'l-token', group: 'leet', text: 't0ken: ' + S.token, echo: S.token, secrets: sec('token') });

  add({ id: 'm-urdu', group: 'multilingual', text: 'پاسورڈ: ' + S.multi, echo: S.multi, secrets: sec('multi') });
  add({ id: 'm-urdu-space', group: 'multilingual', text: 'پاس ورڈ ' + S.multi, echo: S.multi, secrets: sec('multi') });
  add({ id: 'm-ar', group: 'multilingual', text: 'كلمة المرور: ' + S.multi, echo: S.multi, secrets: sec('multi') });
  add({ id: 'm-ar2', group: 'multilingual', text: 'الباسورد: ' + S.multi, echo: S.multi, secrets: sec('multi') });
  add({ id: 'm-hi', group: 'multilingual', text: 'पासवर्ड: ' + S.multi, echo: S.multi, secrets: sec('multi') });
  add({ id: 'm-hai', group: 'multilingual', text: 'password hai ' + S.multi, echo: S.multi, secrets: sec('multi') });
  add({ id: 'm-urdu-copula', group: 'multilingual', text: 'password ہے ' + S.multi, echo: S.multi, secrets: sec('multi') });
  add({ id: 'm-hi-copula', group: 'multilingual', text: 'password है ' + S.multi, echo: S.multi, secrets: sec('multi') });
  add({ id: 'm-roman', group: 'multilingual', text: 'mera password hai ' + S.multi, echo: S.multi, secrets: sec('multi') });
  add({ id: 'm-bas', group: 'multilingual', text: 'باسورد: ' + S.multi, echo: S.multi, secrets: sec('multi') });

  add({ id: 'sh-pin', group: 'short', text: 'pin: ' + S.pin, echo: S.pin, secrets: sec('pin') });
  add({ id: 'sh-otp', group: 'short', text: 'otp: ' + S.otp, echo: S.otp, secrets: sec('otp') });
  add({ id: 'sh-pwd', group: 'short', text: 'pwd: ' + S.spwd, echo: S.spwd, secrets: sec('spwd') });
  add({ id: 'sh-passcode', group: 'short', text: 'passcode: ' + S.passcode, echo: S.passcode, secrets: sec('passcode') });
  add({ id: 'sh-pin-is', group: 'short', text: 'pin is ' + S.pin, echo: S.pin, secrets: sec('pin') });
  add({ id: 'sh-otp-eq', group: 'short', text: 'OTP=' + S.otp, echo: S.otp, secrets: sec('otp') });
  add({ id: 'sh-2fa', group: 'short', text: '2fa: ' + S.mfa, echo: S.mfa, secrets: sec('mfa') });
  add({ id: 'sh-mfa', group: 'short', text: 'mfa: ' + S.mfa, echo: S.mfa, secrets: sec('mfa') });

  add({ id: 'p-turn1', group: 'persist', convId: 'cr10-persist', text: 'password: ' + S.persist, echo: S.persist, secrets: sec('persist') });
  add({ id: 'p-turn2', group: 'persist', convId: 'cr10-persist', keepStore: true, text: 'thanks, please confirm that back to me', echo: S.persist, secrets: sec('persist') });
  add({ id: 'p-note', group: 'persist', kind: 'owner', convId: 'cr10-persist', keepStore: true, text: 'password: ' + S.persist, note: '@Arsal NOTE: the value they sent was ' + S.persist, secrets: sec('persist'), echo: null });
  add({ id: 'p-memory', group: 'persist', convId: 'cr10-persist', keepStore: true, text: 'what is the refund policy?', secrets: sec('persist'), expect: 'faq' });
  add({ id: 'p-state', group: 'persist', convId: 'cr10-persist2', text: 'password: ' + S.note + ' and I need a refund policy', echo: S.note, secrets: sec('note') });
  add({ id: 'p-history', group: 'persist', convId: 'cr10-persist2', keepStore: true, text: 'following up on the refund policy', echo: S.note, secrets: sec('note') });

  const pad = (n, head) => head + 'A'.repeat(n);
  add({ id: 'd-90k', group: 'dos', timeoutMs: 8000, text: pad(90001, 'password: ' + S.dos + '\n'), echo: S.dos, secrets: sec('dos') });
  add({ id: 'd-200k', group: 'dos', timeoutMs: 8000, text: pad(200000, 'password: ' + S.dos + '\n'), echo: S.dos, secrets: sec('dos') });
  add({ id: 'd-unclosed', group: 'dos', timeoutMs: 8000, text: '<!-- password: ' + S.dos + ' ' + 'x'.repeat(40000), echo: S.dos, secrets: sec('dos') });
  add({ id: 'd-angles', group: 'dos', timeoutMs: 8000, text: '<'.repeat(20000) + 'password: ' + S.dos, echo: S.dos, secrets: sec('dos') });
  add({ id: 'd-entities', group: 'dos', timeoutMs: 8000, text: '&#38;'.repeat(15000) + ents('password: ' + S.dos), echo: S.dos, secrets: sec('dos') });
  add({ id: 'd-labels', group: 'dos', timeoutMs: 8000, text: ('password: ' + S.dos + ' ').repeat(2000), echo: S.dos, secrets: sec('dos') });
  add({ id: 'd-aaa', group: 'dos', timeoutMs: 8000, text: 'a'.repeat(80000) + ' password: ' + S.dos, echo: S.dos, secrets: sec('dos') });
  add({ id: 'd-comments', group: 'dos', timeoutMs: 8000, text: ('<!--' + 'z'.repeat(30) + '-->').repeat(1500) + 'password: ' + S.dos, echo: S.dos, secrets: sec('dos') });

  const eligible = [
    ['g-en-how-should', 'How should I check your spreads?'],
    ['g-en-want', 'I want to check the spreads'],
    ['g-en-how-do', 'How do I check the spreads?'],
    ['g-en-how-can', 'How can I check your spreads?'],
    ['g-en-send', 'Can you send me the spread test account?'],
    ['g-en-give', 'Please give me the test account to check spreads'],
    ['g-en-send-imp', 'Send the spread test account'],
    ['g-en-demo', 'I want the demo account to check spreads'],
    ['g-en-share', 'Could you share the spread test account?'],
    ['g-en-how-test', 'How do I test spreads on the test account?'],
    ['g-ur-script', 'سپریڈ چیک کرنے کا طریقہ بتائیں'],
    ['g-ur-send', 'مجھے سپریڈ ٹیسٹ اکاؤنٹ بھیجیں'],
    ['g-ur-how', 'سپریڈ کیسے چیک کریں'],
    ['g-ur-roman', 'spread test account dena'],
    ['g-ur-roman-mujhe', 'mujhe spread test account bhej do'],
    ['g-ur-roman-kaise', 'spreads kaise check karun'],
    ['g-hi-kaise', 'स्प्रेड कैसे चेक करूं'],
    ['g-hi-bhejo', 'मुझे स्प्रेड टेस्ट अकाउंट भेजो'],
    ['g-hi-tarika', 'स्प्रेड चेक करने का तरीका बताएं'],
    ['g-ar-how', 'كيف أتحقق من السبريد'],
    ['g-ar-send', 'أرسل حساب اختبار السبريد'],
    ['g-ar-want', 'أريد أن أفحص السبريد'],
    ['g-hing-dena', 'bhai spread test account dena'],
    ['g-hing-kaise', 'spreads kaise check karun please'],
    ['g-hing-send', 'mujhe apna spread test account send karo'],
  ];
  for (const [id, text] of eligible) add({ id: id, group: 'eligible', expect: 'template', text: text });

  const near = [
    ['n-what-spread', 'What is a spread?'],
    ['n-what-spreads', 'What are spreads?'],
    ['n-checked', 'I checked the spreads already'],
    ['n-dont', 'Do not send the spread test account'],
    ['n-him', 'Send him the spread test account'],
    ['n-my-pass', 'What is my account password?'],
    ['n-sheet', 'Please open the spreadsheet'],
    ['n-light', 'Can you spread some light on the rules?'],
    ['n-problem', 'I have a problem spread across two phases'],
    ['n-risk', 'The risk spread is high on this challenge'],
    ['n-payout', 'How do I check my payout?'],
    ['n-own-login', 'I need a test account for my own login'],
    ['n-rules', 'I want to check the challenge rules'],
    ['n-rumor', 'Please stop the spread of a rumor'],
    ['n-was-testing', 'I was testing the platform yesterday'],
    ['n-email', 'How should I check my email?'],
    ['n-my-password', 'Can you send the password for my account?'],
    ['n-definition', 'What is the spread test account?'],
  ];
  for (const [id, text] of near) add({ id: id, group: 'near', expect: 'near', text: text });

  const faqs = [
    ['f-broker', 'Is Funded Elite a broker?'],
    ['f-refund', 'What is the refund policy?'],
    ['f-pay', 'How can I pay for the challenge?'],
    ['f-eval', 'How does the challenge evaluation work?'],
    ['f-based', 'Where is your company based?'],
    ['f-security', 'How does FundedElite ensure the security of my personal and financial information?'],
    ['f-trial', 'Can I access a free trial of Funded Elite?'],
    ['f-docs', 'What documentation is required for verification?'],
    ['f-tax', 'How do I handle my taxes?'],
    ['f-reg', 'Does FundedElite operate under regulation?'],
    ['f-loss', 'What are the daily and max loss limits?'],
    ['f-reset', 'How do I reset my password?'],
  ];
  for (const [id, text] of faqs) add({ id: id, group: 'faq', expect: 'faq', text: text });

  add({ id: 'o-reply-secret', group: 'owner', kind: 'owner', expect: 'scrub', note: '@Arsal REPLY: Your code is password ' + S.owner + ' keep it safe', text: 'where is my payout?', secrets: sec('owner') });
  add({ id: 'o-reply-clean', group: 'owner', kind: 'owner', expect: 'clean', note: '@Arsal REPLY: Your challenge is still in review.', text: 'where is my payout?' });
  add({ id: 'o-note-secret', group: 'owner', kind: 'owner', expect: 'scrub', note: '@Arsal NOTE: Client password is ' + S.note + ' please review', text: 'hello', secrets: sec('note') });
  add({ id: 'o-note-urdu', group: 'owner', kind: 'owner', expect: 'scrub', note: '@Arsal NOTE: کلائنٹ کا پاسورڈ ' + S.note + ' ہے', text: 'hello', secrets: sec('note') });
  add({ id: 'o-stop', group: 'owner', kind: 'owner', expect: 'clean', note: '@Arsal stop replying on this ticket', text: 'hello' });
  add({ id: 'o-follow-reply', group: 'owner', kind: 'owner', expect: 'scrub', note: '@Arsal please send the client this code ' + S.owner, text: 'hello', secrets: sec('owner'), script: ['ACTION: REPLY\nBODY: the code is ' + S.owner] });
  add({ id: 'o-follow-note', group: 'owner', kind: 'owner', expect: 'scrub', note: '@Arsal please make a note of password ' + S.owner, text: 'hello', secrets: sec('owner'), script: ['ACTION: NOTE\nBODY: password ' + S.owner + ' for the team'] });
  add({ id: 'o-follow-stop', group: 'owner', kind: 'owner', expect: 'clean', note: '@Arsal please stop replying here', text: 'hello', script: ['ACTION: STOP\nBODY: stop'] });
  add({ id: 'o-template-bad', group: 'owner', kind: 'owner', expect: 'no-template', note: '@Arsal REPLY: {{TEMPLATE}}', text: 'where is my payout?' });
  add({ id: 'o-send-bracket', group: 'owner', kind: 'owner', expect: 'scrub', note: '@Arsal send this message to client [your password is ' + S.owner + ']', text: 'hello', secrets: sec('owner') });
  add({ id: 'o-unlabeled', group: 'owner', kind: 'owner', expect: 'scrub', note: '@Arsal REPLY: use ' + S.owner + ' on the form', text: 'hello', secrets: sec('owner') });
  add({ id: 'o-template-ok', group: 'owner', kind: 'owner', expect: 'allow-template', keepStore: true, convId: 'cr10-g-en-how-should', note: '@Arsal REPLY: {{TEMPLATE}}', text: 'How should I check your spreads?' });

  add({ id: 's-auto', group: 'search', kind: 'search', which: 'auto', expect: 'clean' });
  add({ id: 's-team', group: 'search', kind: 'search', which: 'team', expect: 'clean' });
  add({ id: 's-jerry', group: 'search', kind: 'search', which: 'jerry', expect: 'clean' });
  add({ id: 's-autoclosepoll', group: 'search', kind: 'search', which: 'poll', expect: 'clean' });
  add({ id: 's-error-log', group: 'search', kind: 'search', which: 'team', axios: 'search-fail', searchSecret: S.retry, secrets: sec('retry'), expect: 'scrub' });

  add({ id: 'u-batch', group: 'summarizer', kind: 'webhook', expect: 'scrub', echoInput: true, team: '9629759', createdAgo: 1500, sourceBody: 'Hello from the client', userParts: ['first update please', 'second update please', 'password: ' + S.sum], secrets: sec('sum'), text: 'password: ' + S.sum });
  add({ id: 'u-direct', group: 'summarizer', kind: 'summarize-direct', expect: 'scrub', secrets: sec('sum') });

  add({ id: 'defer-webhook', group: 'defer', kind: 'webhook', expect: 'scrub', seedKind: 'escalate-open', text: 'any update on my payout? password: ' + S.defer, echo: S.defer, secrets: sec('defer') });
  add({ id: 'defer-poll', group: 'defer', kind: 'deferpoll', expect: 'scrub', seedKind: 'defer-old', secrets: sec('defer'), text: 'following up' });

  add({ id: 'r-429', group: 'retry', kind: 'webhook', expect: 'scrub', axios: 'retry429', timeoutMs: 20000, text: 'password: ' + S.retry, echo: S.retry, secrets: sec('retry'), throwSecret: S.dos });
  add({ id: 'r-500', group: 'retry', kind: 'webhook', expect: 'scrub', axios: 'fail500', text: 'How can I pay for the challenge?', throwSecret: S.retry, secrets: sec('retry') });
  add({ id: 'r-throw', group: 'retry', kind: 'webhook', expect: 'scrub', axios: 'throw', text: 'How can I pay for the challenge?', throwSecret: S.retry, secrets: sec('retry') });

  add({ id: 'ps-enf-clean', group: 'presend', expect: 'faq', presend: 'enforce', text: 'Is Funded Elite a broker?' });
  add({ id: 'ps-enf-secret', group: 'presend', expect: 'scrub', presend: 'enforce', text: 'password: ' + S.pre, echo: S.pre, secrets: sec('pre') });
  add({ id: 'ps-obs-clean', group: 'presend', expect: 'faq', presend: 'observe', text: 'What is the refund policy?' });
  add({ id: 'ps-obs-secret', group: 'presend', expect: 'scrub', presend: 'observe', text: 'password: ' + S.pre, echo: S.pre, secrets: sec('pre') });
  add({ id: 'ps-obs-template', group: 'presend', expect: 'no-template', presend: 'observe', text: 'What is the refund policy?', script: ['ACTION: REPLY\nKIND: FAQ_CONFIRM\nBODY: {{TEMPLATE}}'] });
  add({ id: 'ps-enf-template', group: 'presend', expect: 'no-template', presend: 'enforce', text: 'What is the refund policy?', script: ['ACTION: REPLY\nKIND: FAQ_CONFIRM\nBODY: {{TEMPLATE}}'] });

  add({ id: 'mt-llm', group: 'maintainer', kind: 'maintainer', which: 'llm', expect: 'scrub', secrets: sec('maint') });
  add({ id: 'mt-badjson', group: 'maintainer', kind: 'maintainer', which: 'badjson', expect: 'scrub', secrets: sec('maint'), alwaysEcho: true });
  add({ id: 'mt-collector', group: 'maintainer', kind: 'maintainer', which: 'collector', expect: 'scrub', secrets: sec('maint') });

  add({ id: 'lc-ask', group: 'localchat', kind: 'localchat', expect: 'scrub', secrets: sec('chat'), text: 'password: ' + S.chat });

  add({ id: 'pr-exact', group: 'prompt', kind: 'prompt', which: 'exact', expect: 'allow-template' });
  add({ id: 'pr-append', group: 'prompt', kind: 'prompt', which: 'append', expect: 'scrub', secrets: sec('pwd') });

  add({ id: 't-full', group: 'tools', kind: 'webhook', tools: true, toolPlan: true, expect: 'scrub', text: 'password: ' + S.tool + ' ' + 'please explain every challenge rule in detail '.repeat(12), echo: S.tool, secrets: sec('tool'), timeoutMs: 15000 });
  add({ id: 't-off', group: 'tools', kind: 'webhook', tools: false, expect: 'scrub', text: 'password: ' + S.tool, echo: S.tool, secrets: sec('tool') });

  add({ id: 'w-urdu', group: 'rewriter', kind: 'rewriter', expect: 'scrub', passId: false, secrets: sec('persist'), text: 'کلائنٹ نے ' + S.persist + ' بھیجا ہے' });
  add({ id: 'w-with-id', group: 'rewriter', kind: 'rewriter', expect: 'scrub', passId: true, secrets: sec('persist'), text: 'کلائنٹ نے ' + S.persist + ' بھیجا ہے براہ کرم نوٹ کریں' });

  add({ id: 'x-hello', group: 'regression', expect: 'faq', text: 'Hello, I have a question about the challenge.' });
  add({ id: 'x-thanks', group: 'regression', expect: 'faq', text: 'Thanks, that helps.' });
  add({ id: 'x-stop-followup', group: 'regression', kind: 'webhook', convId: 'cr10-o-stop', keepStore: true, expect: 'clean', text: 'Are you there?' });

  return cases;
}

function sealOf(cases) {
  const spec = cases.map((c) => ({
    id: c.id,
    group: c.group,
    expect: c.expect,
    kind: c.kind,
    text: c.text && c.text.length > 240 ? ('len' + c.text.length + ':' + c.text.slice(0, 48)) : (c.text || ''),
    note: c.note || '',
    echo: c.echo || '',
  }));
  return crypto.createHash('sha256').update(JSON.stringify(spec)).digest('hex');
}

function shaFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

if (process.argv.includes('--worker')) {
  workerMain();
} else {
  parentMain().catch((err) => {
    console.error(err && err.stack || err);
    process.exit(1);
  });
}

function parentMain() {
  const cases = buildCases();
  if (cases.length < 180) throw new Error('sealed set is ' + cases.length + ', need 180+');
  const seal = sealOf(cases);
  const promptFile = path.join(FLAT, 'system-prompt.txt');
  const faqFile = path.join(FLAT, 'fundedelite-faqs.md');
  const promptText = fs.readFileSync(promptFile, 'utf8');
  const faqText = fs.readFileSync(faqFile, 'utf8');
  for (const [name, value] of Object.entries(S)) {
    if (value.length >= 3 && (promptText.includes(value) || faqText.includes(value))) {
      throw new Error('synthetic secret collides with protected files: ' + name);
    }
  }
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.writeFileSync(path.join(WORK, 'control.json'), JSON.stringify({
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: ['Bot test'],
    testAllowConversationIds: [],
    config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
  }, null, 2));
  fs.writeFileSync(path.join(WORK, 'tickets.json'), '{}');
  const env = Object.assign({}, process.env, {
    LUNA_CONTROL_STATE_FILE: path.join(WORK, 'control.json'),
    LUNA_PROMPT_FILE: promptFile,
    TICKET_STATE_FILE: path.join(WORK, 'tickets.json'),
    MENTION_ROTATE_FILE: path.join(WORK, 'rotate.json'),
    LUNA_OP_STORE_FILE: path.join(WORK, 'ops.json'),
    MAINTAINER_DATA_DIR: path.join(WORK, 'maintainer'),
    OPENAI_API_KEY: 'synthetic-review-openai',
    INTERCOM_ACCESS_TOKEN: 'synthetic-review-intercom',
    LUNA_TOOLS_ENABLED: '0',
    LUNA_PRESEND_MODE: 'enforce',
    R10_FLAT: FLAT,
    R10_SRC: SRC,
    R10_WORK: WORK,
    R10_MODEL_LOG: path.join(WORK, 'local-model.json'),
    R10_TRIP_LOG: path.join(WORK, 'local-trip.txt'),
  });
  delete env.LUNA_ROOT;

  const manifestDir = '/tmp/cred-r10-frozen';
  let manifest = { ok: false, output: '' };
  if (fs.existsSync(path.join(manifestDir, 'luna-current/10_synthetic_lanes/credential-guard-r10/CRED_R10_MANIFEST.sha256'))) {
    const ran = spawnSync('sha256sum', ['-c', 'luna-current/10_synthetic_lanes/credential-guard-r10/CRED_R10_MANIFEST.sha256'], {
      cwd: manifestDir,
      encoding: 'utf8',
    });
    manifest = { ok: ran.status === 0, output: ((ran.stdout || '') + (ran.stderr || '')).trim(), status: ran.status };
  }

  return runParent(cases, seal, env, manifest);
}

function runParent(cases, seal, env, manifest) {
  const judged = [];
  let worker = null;

  function start() {
    const child = spawn(process.execPath, [path.join(HERE, 'harness.js'), '--worker'], {
      cwd: WORK,
      env: env,
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    let buf = '';
    const waiters = [];
    child.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.startsWith('@@')) continue;
        let msg;
        try { msg = JSON.parse(line.slice(2)); } catch (e) { continue; }
        const waiter = waiters.shift();
        if (waiter) waiter(msg);
      }
    });
    function waitFor(timeoutMs) {
      return new Promise((resolve, reject) => {
        const fn = (msg) => {
          clearTimeout(timer);
          resolve(msg);
        };
        const timer = setTimeout(() => {
          const idx = waiters.indexOf(fn);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(new Error('timeout'));
        }, timeoutMs || 12000);
        waiters.push(fn);
      });
    }
    return {
      child: child,
      waitFor: waitFor,
      ask(obj, timeoutMs) {
        const pending = waitFor(timeoutMs);
        child.stdin.write('@@' + JSON.stringify(obj) + '\n');
        return pending;
      },
      kill() {
        try { child.kill('SIGKILL'); } catch (_) {}
      },
    };
  }

  async function ensure() {
    if (worker && worker.child.exitCode == null && !worker.child.killed) return worker;
    worker = start();
    const ready = await worker.waitFor(30000);
    if (!ready || !ready.ready) throw new Error('worker did not become ready: ' + JSON.stringify(ready));
    worker.meta = ready;
    return worker;
  }

  return (async () => {
    const session = await ensure();
    const meta = session.meta;
    for (let i = 0; i < cases.length; i += 1) {
      const cs = cases[i];
      let res;
      try {
        const sessionNow = await ensure();
        res = await sessionNow.ask({ case: cs }, cs.timeoutMs || 12000);
        if (res && res.id && res.id !== cs.id) {
          res = { id: cs.id, harnessMiss: 'protocol-mismatch:' + res.id, secretHits: [], templateSurfaces: [] };
        }
      } catch (err) {
        if (worker) worker.kill();
        worker = null;
        res = { id: cs.id, timeout: true, error: String(err && err.message || err), secretHits: [], templateSurfaces: [], ms: cs.timeoutMs || 12000 };
      }
      const row = judge(cs, res || {});
      judged.push(row);
      if ((i + 1) % 25 === 0 || row.leaks.length || row.unauthorized.length || row.hang || row.missed) {
        process.stderr.write('case ' + (i + 1) + '/' + cases.length + ' ' + cs.id + ' leaks=' + row.leaks.length + ' unauth=' + row.unauthorized.length + ' miss=' + row.missed + ' hang=' + row.hang + '\n');
      }
    }
    if (worker) worker.kill();
    const summary = summarize(judged, cases, seal, meta, manifest);
    const outDir = path.join(HERE);
    fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(summary, null, 2));
    process.stdout.write(JSON.stringify({
      cases: cases.length,
      seal: seal,
      leaks: summary.counts.leakEvents,
      unauthorized: summary.counts.unauthorizedTemplate,
      missed: summary.counts.missedEligible,
      hangs: summary.counts.hangs,
      overblocks: summary.counts.overblocks,
      regressions: summary.counts.regressions,
      harness: summary.counts.harnessMisses,
      verdict: summary.verdict,
    }, null, 2) + '\n');
  })();
}

function judge(cs, res) {
  const row = {
    id: cs.id,
    group: cs.group,
    expect: cs.expect,
    kind: cs.kind || 'webhook',
    ms: res.ms || 0,
    leaks: [],
    unauthorized: [],
    missed: false,
    overblock: false,
    hang: false,
    regression: false,
    harness: false,
    notes: [],
    markers: res.markers || {},
    tripwires: res.tripwires || 0,
    modelCount: res.modelCount || 0,
    transportCount: res.transportCount || 0,
  };
  if (res.timeout) {
    row.hang = true;
    row.notes.push('timeout');
    return row;
  }
  if (res.harnessMiss) {
    row.harness = true;
    row.notes.push(res.harnessMiss);
    return row;
  }
  if (res.error) row.notes.push(String(res.error).slice(0, 240));
  for (const hit of res.secretHits || []) {
    if (hit.surface === 'rewriter' && !(res.secretHits || []).some((h) => h.name === hit.name && h.surface === 'note')) {
      row.notes.push('contained rewriter return ' + hit.name);
      continue;
    }
    row.leaks.push({ surface: hit.surface, name: hit.name });
  }
  const allowTemplate = cs.expect === 'template' || cs.expect === 'allow-template';
  for (const surface of res.templateSurfaces || []) {
    if (surface === 'comment' && allowTemplate) continue;
    if (surface === 'comment') row.unauthorized.push(surface);
    else row.leaks.push({ surface: surface, name: 'template-password' });
  }
  if (cs.expect === 'template' && !res.commentHasTemplate) row.missed = true;
  if ((cs.expect === 'clean' || cs.expect === 'faq' || cs.expect === 'near' || cs.expect === 'no-template') && res.commentHasFixed) {
    row.overblock = true;
  }
  if (cs.expect === 'near' && res.commentHasTemplate) row.unauthorized.push('comment');
  if ((cs.expect === 'faq' || cs.expect === 'clean') && res.commentHasTemplate) row.unauthorized.push('comment');
  if (cs.expect === 'no-template' && res.commentHasTemplate) row.unauthorized.push('comment');
  if ((cs.expect === 'faq' || cs.expect === 'clean') && res.outboundBlocked && !res.commentHasFixed && !res.commentHasTemplate) {
    row.regression = true;
    row.notes.push('clean reply blocked');
  }
  if (res.tripwires) row.notes.push('tripwire ' + res.tripwires);
  if (cs.group === 'dos' && row.ms > 2000 && !row.hang) {
    row.hang = true;
    row.notes.push('slow ' + row.ms + 'ms');
  }
  if (res.logTail) row.notes.push(res.logTail.slice(-4).join(' | ').slice(0, 400));
  return row;
}

function summarize(rows, cases, seal, meta, manifest) {
  const counts = {
    cases: rows.length,
    leakEvents: 0,
    leaksBySurface: {},
    unauthorizedTemplate: 0,
    missedEligible: 0,
    hangs: 0,
    overblocks: 0,
    regressions: 0,
    harnessMisses: 0,
    tripwires: 0,
  };
  const leaks = [];
  const unauthorized = [];
  const missed = [];
  const hangs = [];
  const overblocks = [];
  const regressions = [];
  const harness = [];
  for (const row of rows) {
    counts.tripwires += row.tripwires || 0;
    if (row.harness) {
      counts.harnessMisses += 1;
      harness.push({ id: row.id, notes: row.notes });
      continue;
    }
    for (const hit of row.leaks) {
      counts.leakEvents += 1;
      counts.leaksBySurface[hit.surface] = (counts.leaksBySurface[hit.surface] || 0) + 1;
      leaks.push({ id: row.id, group: row.group, surface: hit.surface, name: hit.name });
    }
    if (row.unauthorized.length) {
      counts.unauthorizedTemplate += row.unauthorized.length;
      unauthorized.push({ id: row.id, group: row.group, surfaces: row.unauthorized });
    }
    if (row.missed) {
      counts.missedEligible += 1;
      missed.push(row.id);
    }
    if (row.hang) {
      counts.hangs += 1;
      hangs.push({ id: row.id, ms: row.ms, notes: row.notes });
    }
    if (row.overblock) {
      counts.overblocks += 1;
      overblocks.push(row.id);
    }
    if (row.regression) {
      counts.regressions += 1;
      regressions.push(row.id);
    }
  }
  let verdict = 'PASS';
  if (counts.leakEvents || counts.unauthorizedTemplate || counts.hangs || counts.tripwires) verdict = 'BLOCKED';
  else if (counts.missedEligible || counts.overblocks || counts.regressions) verdict = 'NEEDS CHANGES';
  return {
    frozen: FROZEN,
    seal: seal,
    manifest: manifest,
    meta: meta || {},
    counts: counts,
    verdict: verdict,
    leaks: leaks,
    unauthorized: unauthorized,
    missed: missed,
    hangs: hangs,
    overblocks: overblocks,
    regressions: regressions,
    harness: harness,
    dosTimes: rows.filter((r) => r.group === 'dos').map((r) => ({ id: r.id, ms: r.ms, hang: r.hang, harness: r.harness })),
    eligible: rows.filter((r) => r.group === 'eligible').map((r) => ({ id: r.id, missed: r.missed, harness: r.harness, leaks: r.leaks.length, notes: r.notes.slice(0, 2) })),
  };
}

function workerMain() {
  const http = require('http');
  const https = require('https');
  const net = require('net');
  const dns = require('dns');
  const tripwire = [];
  function trip(kind, detail) {
    tripwire.push({ kind: kind, detail: String(detail == null ? '' : detail).slice(0, 160) });
    const err = new Error('NETWORK_TRIPWIRE ' + kind);
    err.code = 'TRIPWIRE';
    throw err;
  }
  http.request = function blocked() { trip('http.request', arguments[0] && arguments[0].host); };
  http.get = function blocked() { trip('http.get', arguments[0]); };
  https.request = function blocked() { trip('https.request', arguments[0] && (arguments[0].host || arguments[0].hostname || arguments[0])); };
  https.get = function blocked() { trip('https.get', arguments[0]); };
  net.Socket.prototype.connect = function blocked() { trip('socket.connect', arguments[0]); };
  dns.lookup = function blocked() { trip('dns.lookup', arguments[0]); };
  if (dns.promises) {
    dns.promises.lookup = function blocked() { return Promise.reject(Object.assign(new Error('NETWORK_TRIPWIRE'), { code: 'TRIPWIRE' })); };
  }

  const modelCalls = [];
  const transport = [];
  const logs = [];
  const maintainerNotes = [];
  const fixtures = new Map();
  let forceEcho = null;
  let echoInput = false;
  let alwaysEcho = false;
  let scriptQueue = [];
  let axiosMode = 'ok';
  let throwSecret = '';
  let searchSecret = '';
  let retryCount = 0;
  let toolPlan = false;
  let toolRound = 0;
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => { logs.push(args.map(clipArg).join(' ')); };
  console.error = (...args) => { logs.push(args.map(clipArg).join(' ')); };
  function clipArg(v) {
    if (typeof v === 'string') return v.slice(0, 500);
    try { return JSON.stringify(v).slice(0, 500); } catch (_) { return String(v).slice(0, 500); }
  }

  const Module = require('module');
  const origLoad = Module._load;
  function handleAxios(method, url, data) {
    transport.push({ method: String(method || 'get').toLowerCase(), url: String(url || ''), data: data });
    const m = String(method || 'get').toLowerCase();
    const idMatch = /conversations\/([^/?#]+)/.exec(String(url || ''));
    if (m === 'get' && idMatch && idMatch[1] !== 'search') {
      const conv = fixtures.get(idMatch[1]);
      if (!conv) return { status: 404, data: {} };
      return { status: 200, data: conv };
    }
    if (String(url || '').includes('/conversations/search')) {
      if (axiosMode === 'search-fail') {
        return { status: 500, data: { errors: [{ message: 'upstream ' + searchSecret }] } };
      }
      return { status: 200, data: { conversations: [], pages: {} } };
    }
    if (m === 'post' || m === 'put' || m === 'delete') {
      if (axiosMode === 'throw') {
        const err = new Error('socket down ' + throwSecret);
        err.code = 'ECONNRESET';
        throw err;
      }
      if (axiosMode === 'fail500') return { status: 500, data: { errors: [{ message: 'upstream ' + throwSecret }] } };
      if (axiosMode === 'retry429') {
        retryCount += 1;
        if (retryCount < 3) return { status: 429, data: { message: 'slow ' + throwSecret } };
      }
      return { status: 200, data: { id: 'syn-reply-' + transport.length, type: 'conversation' } };
    }
    return { status: 200, data: { id: 'syn-ok', type: 'admin', name: 'Teammate' } };
  }
  function axiosStub(config) {
    return Promise.resolve(handleAxios(config && config.method, config && config.url, config && config.data));
  }
  axiosStub.post = (url, data) => Promise.resolve(handleAxios('post', url, data));
  axiosStub.get = (url) => Promise.resolve(handleAxios('get', url, null));
  axiosStub.put = (url, data) => Promise.resolve(handleAxios('put', url, data));
  axiosStub.delete = (url, data) => Promise.resolve(handleAxios('delete', url, data));
  axiosStub.request = axiosStub;
  axiosStub.create = () => axiosStub;
  axiosStub.defaults = { headers: { common: {} } };
  axiosStub.interceptors = { request: { use() {} }, response: { use() {} } };

  function OpenAIStub() {
    this.chat = {
      completions: {
        create: async (payload) => {
          modelCalls.push(JSON.parse(JSON.stringify(payload)));
          if (scriptQueue.length) {
            return { choices: [{ message: { content: scriptQueue.shift(), tool_calls: [] } }] };
          }
          if (payload && payload.tools && toolPlan && toolRound === 0) {
            toolRound += 1;
            return {
              choices: [{
                message: {
                  content: null,
                  tool_calls: [{
                    id: 'tc-review-1',
                    type: 'function',
                    function: { name: 'search_knowledge', arguments: JSON.stringify({ query: forceEcho || 'rules' }) },
                  }],
                },
              }],
            };
          }
          if (echoInput) {
            const user = (payload.messages || []).filter((m) => m && m.role !== 'system').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
            return { choices: [{ message: { content: user, tool_calls: [] } }] };
          }
          if (alwaysEcho && forceEcho) {
            return { choices: [{ message: { content: 'not-json ECHO<' + forceEcho + '>' } }] };
          }
          if (forceEcho) {
            return { choices: [{ message: { content: 'ACTION: REPLY\nKIND: FAQ_CONFIRM\nBODY: ECHO<' + forceEcho + '>' } }] };
          }
          return { choices: [{ message: { content: 'ACTION: REPLY\nKIND: FAQ_CONFIRM\nBODY: FundedElite is a proprietary trading firm. You can review the challenge rules on the site.' } }] };
        },
      },
    };
  }

  Module._load = function hooked(request, parent, isMain) {
    if (request === 'openai') return OpenAIStub;
    if (request === 'axios') return axiosStub;
    return origLoad.apply(this, arguments);
  };

  const indexPath = path.join(FLAT, 'index.js');
  const source = fs.readFileSync(indexPath, 'utf8');
  const marker = 'module.exports = {';
  const at = source.lastIndexOf(marker);
  if (at < 0) throw new Error('index export marker missing');
  const injected = source.slice(0, at) +
    'module.exports = {\n  __review: { pollDeferredRelatedReplies, searchOpenConversationsAutoClose, searchOpenTeamConversations, searchOpenJerryConversations, pollAutoCloseSilentTickets, summarizeEscalationsClientBatch, ensureInternalNoteEnglish, executeOwnerActionPlan, processAuthorizedNoteCommands, buildEscalateNoteAndAssignee },\n' +
    source.slice(at + marker.length);
  const compiled = new Module(indexPath);
  compiled.filename = indexPath;
  compiled.paths = Module._nodeModulePaths(path.dirname(indexPath));
  compiled._compile(injected, indexPath);
  const rt = compiled.exports;
  const guard = require(path.join(FLAT, 'credentialGuardR10.js'));
  const presend = require(path.join(FLAT, 'statePresend', 'statePresend.js'));
  const promptText = fs.readFileSync(process.env.LUNA_PROMPT_FILE, 'utf8');
  const TEMPLATE_PASSWORD = guard.TEMPLATE_PASSWORD;
  const FIXED_MESSAGE = guard.FIXED_MESSAGE;

  let flatMaintainer = 'loaded';
  try {
    require(path.join(FLAT, 'luna-maintainer'));
  } catch (err) {
    flatMaintainer = String(err && err.message || err);
  }

  function emit(obj) {
    fs.writeSync(1, '@@' + JSON.stringify(obj) + '\n');
  }

  const readyPayload = {
    ready: true,
    promptSha: crypto.createHash('sha256').update(promptText).digest('hex'),
    promptLength: promptText.length,
    guardStatus: guard.STATUS,
    flatMaintainer: flatMaintainer,
    maintainerLog: logs.filter((l) => /maintainer/i.test(l)).slice(0, 5),
  };

  function expand(text) {
    return String(text == null ? '' : text).split('{{TEMPLATE}}').join(guard.SPREAD_TEST_REPLY);
  }

  function convId(cs) {
    return cs.convId || ('cr10-' + cs.id);
  }

  function begin(cs) {
    logs.length = 0;
    modelCalls.length = 0;
    transport.length = 0;
    tripwire.length = 0;
    maintainerNotes.length = 0;
    forceEcho = cs.echo || null;
    echoInput = !!cs.echoInput;
    alwaysEcho = !!cs.alwaysEcho;
    scriptQueue = Array.isArray(cs.script) ? cs.script.map(expand) : [];
    axiosMode = cs.axios || 'ok';
    throwSecret = cs.throwSecret || '';
    searchSecret = cs.searchSecret || '';
    retryCount = 0;
    toolPlan = !!cs.toolPlan;
    toolRound = 0;
    process.env.LUNA_TOOLS_ENABLED = cs.tools ? '1' : '0';
    process.env.LUNA_PRESEND_MODE = cs.presend || 'enforce';
    if (!cs.keepStore) {
      guard.resetStore();
      try { presend.resetAll(); } catch (_) {}
      fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}');
      fixtures.clear();
    }
    const now = Math.floor(Date.now() / 1000);
    const id = convId(cs);
    if (cs.seedKind === 'escalate-open') {
      const all = JSON.parse(fs.readFileSync(process.env.TICKET_STATE_FILE, 'utf8') || '{}');
      all[id] = {
        lastEscalateAt: now - 3600,
        lastEscalateProblem: 'my payout was not received',
        lastEscalateTopic: 'payout',
        lastEscalateTopics: ['payout'],
        escalateAwaitingFirstTeammate: false,
        escalateTeammateExplainedAt: now - 1800,
      };
      fs.writeFileSync(process.env.TICKET_STATE_FILE, JSON.stringify(all));
    }
    if (cs.seedKind === 'defer-old') {
      const secret = (cs.secrets && cs.secrets[0] && cs.secrets[0].value) || S.defer;
      const all = JSON.parse(fs.readFileSync(process.env.TICKET_STATE_FILE, 'utf8') || '{}');
      all[id] = {
        deferredRelatedReply: { partId: 'old-part', at: now - 11 * 60, text: 'password: ' + secret },
        lastEscalateAt: now - 3600,
        escalateAwaitingFirstTeammate: false,
      };
      fs.writeFileSync(process.env.TICKET_STATE_FILE, JSON.stringify(all));
    }
  }

  function makeConv(cs) {
    const id = convId(cs);
    const now = Math.floor(Date.now() / 1000);
    const text = expand(cs.text || '');
    let parts;
    if (Array.isArray(cs.userParts)) {
      parts = cs.userParts.map((body, i) => ({
        id: id + '-p' + i,
        part_type: 'comment',
        body: expand(body),
        created_at: now - 120 + i,
        author: { type: 'user', id: 'user-' + id, name: 'Sana Q' },
      }));
    } else {
      parts = [{
        id: id + '-u',
        part_type: 'comment',
        body: text,
        created_at: now - 20,
        author: { type: 'user', id: 'user-' + id, name: 'Sana Q' },
      }];
    }
    if (cs.note) {
      parts.push({
        id: id + '-note',
        part_type: 'note',
        body: expand(cs.note),
        created_at: now - 5,
        author: { type: 'admin', id: '10118526', name: 'Arsal' },
      });
    }
    const conv = {
      id: id,
      created_at: now - (cs.createdAgo || 4000),
      team_assignee_id: cs.team || null,
      admin_assignee_id: cs.admin || '0',
      open: true,
      contacts: { contacts: [{ name: 'Sana Q', email: 'sana.synthetic@example.test', id: 'contact-' + id }] },
      source: {
        body: cs.sourceBody != null ? expand(cs.sourceBody) : (Array.isArray(cs.userParts) ? cs.userParts[0] : text),
        author: { type: 'user', id: 'user-' + id, name: 'Sana Q' },
      },
      conversation_parts: { conversation_parts: parts },
    };
    fixtures.set(String(id), conv);
    return conv;
  }

  async function webhook(conv, topic) {
    const req = { body: { topic: topic, data: { item: conv } }, headers: {} };
    const res = { statusCode: 0, sendStatus(code) { this.statusCode = code; return this; } };
    await rt.handleWebhook(req, res);
    return res.statusCode;
  }

  function hasBounded(hay, secret) {
    const text = String(hay || '');
    if (!secret) return false;
    if (secret.length >= 6) return text.includes(secret);
    const esc = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^A-Za-z0-9])' + esc + '($|[^A-Za-z0-9])').test(text);
  }

  function stripPrompt(text) {
    return String(text || '').split(promptText).join('');
  }

  function finish(cs, id, started, extra) {
    const comments = [];
    const notes = [];
    const searches = [];
    const other = [];
    for (const rec of transport) {
      const url = rec.url || '';
      const data = rec.data;
      if (url.includes('/conversations/search')) searches.push(JSON.stringify(data));
      else if (data && data.message_type === 'note') notes.push(String(data.body || ''));
      else if (data && (data.message_type === 'comment' || data.body)) comments.push(String(data.body || ''));
      else other.push(JSON.stringify(data == null ? null : data).slice(0, 500));
    }
    let memory = '';
    try { memory = JSON.stringify(presend.snapshot(id)); } catch (_) { memory = ''; }
    let state = '';
    try { state = fs.readFileSync(process.env.TICKET_STATE_FILE, 'utf8'); } catch (_) { state = ''; }
    const modelPieces = [];
    for (const call of modelCalls) {
      const messages = (call && call.messages) || [];
      for (const msg of messages) {
        let content = '';
        if (msg && typeof msg.content === 'string') content = msg.content;
        else if (msg && msg.content != null) content = JSON.stringify(msg.content);
        if (msg && msg.role === 'system') {
          if (content.startsWith(promptText)) content = content.slice(promptText.length);
          else content = content.split(promptText).join('');
        }
        modelPieces.push(content);
        if (msg && msg.tool_calls) modelPieces.push(JSON.stringify(msg.tool_calls));
      }
    }
    const modelRaw = modelPieces.join('\n');
    const surfaces = {
      comment: comments.join('\n'),
      note: notes.join('\n'),
      model: modelRaw,
      search: searches.join('\n'),
      state: state,
      memory: memory,
      log: logs.join('\n'),
      other: other.join('\n'),
      maintainer: maintainerNotes.join('\n'),
      rewriter: (extra && extra.rewriter) || '',
      error: (extra && extra.error) || '',
    };
    const secretHits = [];
    for (const item of cs.secrets || []) {
      for (const [surface, text] of Object.entries(surfaces)) {
        const scanned = surface === 'model' ? text : text;
        if (hasBounded(scanned, item.value)) secretHits.push({ surface: surface, name: item.name });
      }
    }
    const templateSurfaces = [];
    for (const [surface, text] of Object.entries(surfaces)) {
      if (String(text || '').includes(TEMPLATE_PASSWORD)) templateSurfaces.push(surface);
    }
    const logText = surfaces.log;
    let harnessMiss = null;
    const skippable = !cs.kind || cs.kind === 'webhook' || cs.kind === 'owner';
    if (skippable) {
      if (/SKIP fin-wait/.test(logText)) harnessMiss = 'fin-wait';
      else if (/SKIP paused/.test(logText)) harnessMiss = 'paused';
      else if (/SKIP test-mode/.test(logText)) harnessMiss = 'test-mode';
      else if (/SKIP no user part/.test(logText)) harnessMiss = 'no-user-part';
      else if (/SKIP inflight/.test(logText)) harnessMiss = 'inflight';
      else if (/SKIP repliesEnabled/.test(logText)) harnessMiss = 'replies-off';
    }
    if (cs.kind === 'owner' && !/AUTH_NOTE/.test(logText) && !harnessMiss) harnessMiss = 'owner-not-handled';
    return {
      id: cs.id,
      ms: Date.now() - started,
      secretHits: secretHits,
      templateSurfaces: templateSurfaces,
      commentHasTemplate: surfaces.comment.includes(TEMPLATE_PASSWORD),
      commentHasFixed: surfaces.comment.includes(FIXED_MESSAGE),
      outboundBlocked: /OUTBOUND_BLOCKED/.test(logText),
      harnessMiss: harnessMiss,
      tripwires: tripwire.length,
      modelCount: modelCalls.length,
      transportCount: transport.length,
      markers: {
        spread: /SPREAD_TEST_REPLY/.test(logText),
        defer: /ESCALATE defer/.test(logText),
        summary: /ESCALATIONS note-only/.test(logText),
        auth: (logText.match(/AUTH_NOTE[^\n]*/g) || []).slice(0, 3),
        webhookErr: /WEBHOOK_ERR/.test(logText),
        postgate: /POSTGATE_SUPPRESSED/.test(logText),
      },
      logTail: logs.slice(-8).map((l) => l.slice(0, 220)),
      error: extra && extra.error ? String(extra.error).slice(0, 300) : undefined,
    };
  }

  async function runCase(cs) {
    const started = Date.now();
    begin(cs);
    const id = convId(cs);
    const kind = cs.kind || 'webhook';
    try {
      if (kind === 'webhook' || kind === 'owner') {
        const conv = makeConv(cs);
        await webhook(conv, kind === 'owner' ? 'conversation.admin.noted' : 'conversation.user.replied');
        return finish(cs, id, started);
      }
      if (kind === 'search') {
        if (cs.which === 'auto') await rt.__review.searchOpenConversationsAutoClose();
        else if (cs.which === 'team') await rt.__review.searchOpenTeamConversations('9629759');
        else if (cs.which === 'jerry') await rt.__review.searchOpenJerryConversations();
        else await rt.__review.pollAutoCloseSilentTickets();
        return finish(cs, id, started);
      }
      if (kind === 'deferpoll') {
        makeConv(cs);
        await rt.__review.pollDeferredRelatedReplies();
        return finish(cs, id, started);
      }
      if (kind === 'summarize-direct') {
        const secret = S.sum;
        guard.rememberClientText(id, 'password: ' + secret);
        const summary = await rt.__review.summarizeEscalationsClientBatch([
          { body: 'please review my payout' },
          { body: 'still waiting' },
          { body: 'password: ' + secret },
        ], id);
        maintainerNotes.push(String(summary || ''));
        await rt.postReply(id, 'note', summary);
        return finish(cs, id, started);
      }
      if (kind === 'rewriter') {
        const secret = S.persist;
        guard.rememberClientText(id, 'password: ' + secret);
        const text = expand(cs.text || '');
        const rewritten = await rt.__review.ensureInternalNoteEnglish(text, 'review', cs.passId ? id : undefined);
        const built = await rt.__review.buildEscalateNoteAndAssignee({
          problem: text,
          actionNeeded: 'Review the pasted value ' + secret,
          account: '100200300',
          email: 'sana.synthetic@example.test',
        });
        const html = (built && built.html) || String(rewritten || '');
        await rt.postReply(id, 'note', html);
        return finish(cs, id, started, { rewriter: String(rewritten || '') + '\n' + html });
      }
      if (kind === 'maintainer') {
        const llm = require(path.join(SRC, 'luna-current/03_luna-maintainer/llm.js'));
        const secret = S.maint;
        if (cs.which === 'llm' || cs.which === 'badjson') {
          forceEcho = secret;
          alwaysEcho = cs.which === 'badjson';
          try {
            await llm.createOpenAiLlm({ apiKeyEnv: 'OPENAI_API_KEY', model: 'stub-review' }).json(
              'You are a maintainer. Never repeat secrets.',
              'password: ' + secret,
              '{"ok":true}'
            );
          } catch (err) {
            maintainerNotes.push(String(err && err.message || err));
          }
        } else {
          const collector = require(path.join(SRC, 'luna-current/03_luna-maintainer/collector.js'));
          const saved = [];
          const col = collector.createCollector({ enabled: true, lunaRoot: WORK }, {
            recordEvent(ev) { saved.push(ev); return ev; },
          });
          col.observe({ send: false, reason: 'review' }, {
            conversationId: id,
            clientText: 'password: ' + secret,
            body: 'password: ' + secret,
          });
          maintainerNotes.push(JSON.stringify(saved));
        }
        return finish(cs, id, started);
      }
      if (kind === 'localchat') {
        const secret = S.chat;
        const modelLog = process.env.R10_MODEL_LOG;
        const tripLog = process.env.R10_TRIP_LOG;
        try { fs.unlinkSync(modelLog); } catch (_) {}
        try { fs.unlinkSync(tripLog); } catch (_) {}
        const ran = spawnSync(process.execPath, [
          '-r', path.join(HERE, 'preload.js'),
          path.join(SRC, 'luna-current/06_tools/luna-local-chat.js'),
          '--ask', expand(cs.text || ''),
        ], {
          cwd: WORK,
          env: Object.assign({}, process.env, {
            LUNA_ROOT: FLAT,
            R10_SECRET: secret,
            OPENAI_API_KEY: 'synthetic-review-openai',
          }),
          encoding: 'utf8',
          timeout: 15000,
        });
        let parsedCalls = [];
        try { parsedCalls = JSON.parse(fs.readFileSync(modelLog, 'utf8')); } catch (_) { parsedCalls = []; }
        for (const call of parsedCalls) modelCalls.push(call);
        maintainerNotes.push(String(ran.stdout || '') + '\n' + String(ran.stderr || ''));
        if (fs.existsSync(tripLog) && fs.readFileSync(tripLog, 'utf8').trim()) tripwire.push({ kind: 'localchat' });
        if (ran.error) maintainerNotes.push(String(ran.error.message || ran.error));
        return finish(cs, id, started);
      }
      if (kind === 'prompt') {
        if (cs.which === 'exact') {
          const out = guard.guardModelMessages('prompt-exact', [
            { role: 'system', content: promptText },
            { role: 'user', content: 'How should I check your spreads?' },
          ]);
          modelCalls.push({ messages: out });
        } else {
          const out = guard.guardModelMessages('prompt-append', [
            { role: 'system', content: promptText + '\npassword: ' + S.pwd },
            { role: 'user', content: 'password: ' + S.pwd },
          ]);
          modelCalls.push({ messages: out });
        }
        return finish(cs, id, started);
      }
      return finish(cs, id, started, { error: 'unknown kind ' + kind });
    } catch (err) {
      return finish(cs, id, started, { error: err && err.stack || err });
    }
  }

  let buf = '';
  const queue = [];
  let running = false;
  async function pump() {
    if (running) return;
    running = true;
    while (queue.length) {
      const cs = queue.shift();
      if (!cs || !cs.case) continue;
      try {
        const res = await runCase(cs.case || cs);
        emit(res);
      } catch (err) {
        emit({ id: cs && cs.case && cs.case.id, error: String(err && err.stack || err), secretHits: [], templateSurfaces: [] });
      }
    }
    running = false;
  }
  process.stdin.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.startsWith('@@')) continue;
      try { queue.push(JSON.parse(line.slice(2))); } catch (e) { continue; }
      pump();
    }
  });
  emit(readyPayload);
}
