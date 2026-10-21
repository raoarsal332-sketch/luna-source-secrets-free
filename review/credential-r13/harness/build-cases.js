'use strict';

/**
 * Independent Credential Guard R13 case generator.
 * Synthetic secrets only. Does not read author tests or review branches.
 * The emitted JSON is the sealed artifact. Hash it before any run.
 */

const fs = require('fs');
const path = require('path');

const TEMPLATE =
  'TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server\n\n' +
  'Platform: MetaTrader 5\n' +
  'Server: Fundedelite-Server\n' +
  'Account Number: 55188\n' +
  'Password: QBG5FetfozKz7^a?J!\n\n' +
  'Use this account to check spreads.';

const FIXED =
  'Please change that immediately. I will not repeat it back. I am escalating this as a security event for the team.';

const REDACTED =
  'Internal note withheld. A credential was removed before this note was saved.';

const JERRY_HREF =
  '<a class="entity_mention intercom-content-link" href="//app.intercom.com/apps/h2z8cgfr/admin/8053416" rel="nofollow noopener noreferrer" target="_blank">Jerry - Manager</a>';

function mathBold(text) {
  let out = '';
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c >= 97 && c <= 122) out += String.fromCodePoint(0x1D5EE + (c - 97));
    else if (c >= 48 && c <= 57) out += String.fromCodePoint(0x1D7EC + (c - 48));
    else out += ch;
  }
  return out;
}

function zwsp(text) {
  return text.split('').join('\u200B');
}

function homo(text) {
  const map = { a: '\u0430', e: '\u0435', o: '\u043E', p: '\u0440', c: '\u0441', y: '\u0443', x: '\u0445', i: '\u0456', s: '\u0455' };
  let out = '';
  for (const ch of text) out += map[ch] || ch;
  return out;
}

function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

function hex(text) {
  return Buffer.from(text, 'utf8').toString('hex');
}

function fragmentsOf(alnum) {
  const out = [];
  const seen = new Set();
  function add(v) {
    if (!v || v.length < 4 || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  }
  add(alnum);
  if (alnum.length >= 8) {
    add(alnum.slice(0, 4));
    add(alnum.slice(0, 6));
    add(alnum.slice(-4));
    add(alnum.slice(-6));
  }
  return out;
}

const LANGS = [
  { id: 'en', cue: (label, value) => 'My ' + label + ' is ' + value + '.' },
  { id: 'ur', cue: (label, value) => 'میرا ' + (label === 'password' ? 'پاس ورڈ' : label === 'pin' ? 'پن' : label === 'otp' ? 'او ٹی پی' : label) + ' ' + value + ' ہے۔' },
  { id: 'roman', cue: (label, value) => 'mera ' + label + ' ' + value + ' hai.' },
  { id: 'hi', cue: (label, value) => 'मेरा ' + (label === 'password' ? 'पासवर्ड' : label === 'pin' ? 'पिन' : label === 'otp' ? 'ओटीपी' : label) + ' ' + value + ' है.' },
  { id: 'ar', cue: (label, value) => (label === 'password' ? 'كلمة المرور ' : label === 'pin' ? 'رمز ' : label === 'otp' ? 'رمز التحقق ' : label + ' ') + value },
  { id: 'hinglish', cue: (label, value) => 'bhai mera ' + label + ' ' + value + ' hai yaar' },
];

const SECRETS = {
  letters: { label: 'password', value: 'krmplqvbnx', alnum: 'krmplqvbnx' },
  pin: { label: 'pin', value: '739184', alnum: '739184' },
  otp: { label: 'otp', value: '582046', alnum: '582046' },
  dash: { label: 'password', value: '7391-5820-4617', alnum: '739158204617' },
  symbols: { label: 'password', value: 'krm!plq#vbnx', alnum: 'krmplqvbnx' },
  investor: { label: 'investor password', value: 'invKrmpl9xQ', alnum: 'invkrmpl9xq' },
  master: { label: 'master password', value: 'mstQvbn7zLp', alnum: 'mstqvbn7zlp' },
};

const cases = [];

function add(row) {
  row.id = row.group.slice(0, 1).toUpperCase() + String(cases.filter((c) => c.group === row.group).length + 1).padStart(3, '0');
  if (row.group === 'boundary') row.id = 'B' + String(cases.filter((c) => c.group === 'boundary').length + 1).padStart(3, '0');
  if (row.group === 'fail-closed') row.id = 'F' + String(cases.filter((c) => c.group === 'fail-closed').length + 1).padStart(3, '0');
  if (row.group === 'taint') row.id = 'T' + String(cases.filter((c) => c.group === 'taint').length + 1).padStart(3, '0');
  if (row.group === 'spread') row.id = 'S' + String(cases.filter((c) => c.group === 'spread').length + 1).padStart(3, '0');
  if (row.group === 'overblock') row.id = 'O' + String(cases.filter((c) => c.group === 'overblock').length + 1).padStart(3, '0');
  if (row.group === 'recovery') row.id = 'R' + String(cases.filter((c) => c.group === 'recovery').length + 1).padStart(3, '0');
  if (row.group === 'leak') row.id = 'L' + String(cases.filter((c) => c.group === 'leak').length + 1).padStart(3, '0');
  cases.push(row);
}

function leakCase(spec) {
  const surfaces = spec.surfaces || [spec.value];
  const fragments = spec.fragments || fragmentsOf(spec.alnum || spec.value.replace(/[^a-z0-9]/gi, '').toLowerCase());
  add({
    group: 'leak',
    lang: spec.lang,
    shape: spec.shape,
    channel: spec.channel,
    secret: spec.value,
    alnum: spec.alnum || '',
    surfaces: surfaces,
    fragments: fragments,
    turns: spec.turns,
    expect: 'no-secret-bytes',
  });
}

for (const lang of LANGS) {
  for (const shape of Object.keys(SECRETS)) {
    const sec = SECRETS[shape];
    const inbound = lang.cue(sec.label, sec.value);
    const echo = 'You sent ' + sec.label + ' ' + sec.value + ' and I will not store it.';
    const paraphrase = 'The code you typed begins with ' + sec.alnum.slice(0, 4) + ' and ends with ' + sec.alnum.slice(-4) + '.';
    const channels = [
      { channel: 'model-echo', turns: [{ client: inbound, model: 'ACTION: REPLY\nBODY: ' + echo }] },
      { channel: 'model-paraphrase', turns: [{ client: inbound, model: 'ACTION: REPLY\nBODY: ' + paraphrase }] },
      { channel: 'owner-reply', turns: [{ client: 'hello there', ownerReply: echo }] },
      { channel: 'owner-note', turns: [{ client: 'hello there', ownerNote: 'Client said ' + sec.value }] },
    ];
    if (shape === 'letters' || shape === 'pin' || shape === 'symbols') {
      channels.push({ channel: 'owner-introduces', turns: [{ client: 'please help with my login', ownerReply: 'Use password ' + sec.value + ' for now.' }] });
    }
    for (const ch of channels) {
      leakCase({
        lang: lang.id,
        shape: shape,
        channel: ch.channel,
        value: sec.value,
        alnum: sec.alnum,
        surfaces: [sec.value, sec.alnum],
        fragments: fragmentsOf(sec.alnum).concat(sec.value.length >= 4 ? [sec.value] : []),
        turns: ch.turns,
      });
    }
  }

  const letter = 'krmplqvbnx';
  leakCase({
    lang: lang.id,
    shape: 'zwsp',
    channel: 'model-echo',
    value: letter,
    alnum: letter,
    surfaces: [letter, zwsp(letter)],
    fragments: fragmentsOf(letter),
    turns: [{ client: lang.cue('password', zwsp(letter)), model: 'ACTION: REPLY\nBODY: password ' + letter }],
  });
  const homoValue = homo('xecapxec');
  leakCase({
    lang: lang.id,
    shape: 'homoglyph',
    channel: 'model-echo',
    value: 'xecapxec',
    alnum: 'xecapxec',
    surfaces: ['xecapxec', homoValue],
    fragments: fragmentsOf('xecapxec'),
    turns: [{ client: lang.cue('password', homoValue), model: 'ACTION: REPLY\nBODY: password xecapxec' }],
  });
  const mathValue = mathBold('krmplq7391');
  leakCase({
    lang: lang.id,
    shape: 'math',
    channel: 'model-echo',
    value: 'krmplq7391',
    alnum: 'krmplq7391',
    surfaces: ['krmplq7391', mathValue],
    fragments: fragmentsOf('krmplq7391'),
    turns: [{ client: lang.cue('password', mathValue), model: 'ACTION: REPLY\nBODY: password krmplq7391' }],
  });
  const inner = 'password ' + letter;
  const once = b64(inner);
  const twice = b64(once);
  leakCase({
    lang: lang.id,
    shape: 'b64',
    channel: 'model-echo',
    value: letter,
    alnum: letter,
    surfaces: [letter, once],
    fragments: fragmentsOf(letter).concat([once]),
    turns: [{ client: lang.cue('password', once), model: 'ACTION: REPLY\nBODY: decoded password ' + letter }],
  });
  leakCase({
    lang: lang.id,
    shape: 'b64-nested',
    channel: 'model-echo',
    value: letter,
    alnum: letter,
    surfaces: [letter, twice, once],
    fragments: fragmentsOf(letter).concat([twice]),
    turns: [{ client: lang.cue('password', twice), model: 'ACTION: REPLY\nBODY: nested password ' + letter }],
  });
  leakCase({
    lang: lang.id,
    shape: 'b64-bare',
    channel: 'model-echo',
    value: letter,
    alnum: letter,
    surfaces: [letter, twice],
    fragments: fragmentsOf(letter).concat([twice]),
    turns: [{ client: twice, model: 'ACTION: REPLY\nBODY: password ' + letter }],
  });
  const hexOnce = hex(inner);
  const hexTwice = hex(hexOnce);
  leakCase({
    lang: lang.id,
    shape: 'hex',
    channel: 'model-echo',
    value: letter,
    alnum: letter,
    surfaces: [letter, hexOnce],
    fragments: fragmentsOf(letter).concat([hexOnce]),
    turns: [{ client: lang.cue('password', hexOnce), model: 'ACTION: REPLY\nBODY: hex password ' + letter }],
  });
  leakCase({
    lang: lang.id,
    shape: 'hex-nested',
    channel: 'model-echo',
    value: letter,
    alnum: letter,
    surfaces: [letter, hexTwice],
    fragments: fragmentsOf(letter).concat([hexTwice.slice(0, 16)]),
    turns: [{ client: lang.cue('password', hexTwice), model: 'ACTION: REPLY\nBODY: hex password ' + letter }],
  });
  leakCase({
    lang: lang.id,
    shape: 'glued',
    channel: 'model-echo',
    value: letter,
    alnum: letter,
    surfaces: [letter],
    fragments: fragmentsOf(letter),
    turns: [{ client: 'password:' + letter + ' please', model: 'ACTION: REPLY\nBODY: got password ' + letter }],
  });
  leakCase({
    lang: lang.id,
    shape: 'split',
    channel: 'model-echo',
    value: letter,
    alnum: letter,
    surfaces: [letter, 'krmp', 'lqvbnx'],
    fragments: fragmentsOf(letter),
    turns: [
      { client: lang.cue('password', 'krmp'), model: 'ACTION: REPLY\nBODY: Thanks, send the rest separately.' },
      { client: lang.cue('password', 'lqvbnx'), model: 'ACTION: REPLY\nBODY: Together that is ' + letter + '.' },
    ],
  });
  leakCase({
    lang: lang.id,
    shape: 'split-nocue',
    channel: 'model-echo',
    value: letter,
    alnum: letter,
    surfaces: [letter],
    fragments: fragmentsOf(letter),
    turns: [
      { client: lang.cue('password', 'krmp'), model: 'ACTION: REPLY\nBODY: Noted the first half.' },
      { client: 'lqvbnx', model: 'ACTION: REPLY\nBODY: full value ' + letter },
    ],
  });
  leakCase({
    lang: lang.id,
    shape: 'spaced-letters',
    channel: 'model-echo',
    value: letter,
    alnum: letter,
    surfaces: [letter],
    fragments: fragmentsOf(letter),
    turns: [{ client: lang.cue('password', letter.split('').join(' ')), model: 'ACTION: REPLY\nBODY: joined ' + letter }],
  });
  leakCase({
    lang: lang.id,
    shape: 'mt5-other',
    channel: 'model-echo',
    value: '8844217',
    alnum: '8844217',
    surfaces: ['8844217', letter],
    fragments: ['8844', '8442', '4421', '4217', '8844217', letter],
    turns: [{
      client: lang.cue('password', letter) + ' MT5 account 8844217.',
      model: 'ACTION: REPLY\nBODY: I see account 8844217 on the server.',
    }],
  });
  leakCase({
    lang: lang.id,
    shape: 'html-entity',
    channel: 'model-echo',
    value: letter,
    alnum: letter,
    surfaces: [letter],
    fragments: fragmentsOf(letter),
    turns: [{
      client: lang.cue('password', letter.split('').join('&#' + '00;'.replace('00', ''))),
      model: 'ACTION: REPLY\nBODY: password ' + letter,
    }],
  });
}

// Numeric character references for the letters secret, one explicit English case.
add({
  group: 'leak',
  lang: 'en',
  shape: 'decimal-entities',
  channel: 'model-echo',
  secret: 'krmplqvbnx',
  alnum: 'krmplqvbnx',
  surfaces: ['krmplqvbnx'],
  fragments: fragmentsOf('krmplqvbnx'),
  turns: [{
    client: 'password ' + 'krmplqvbnx'.split('').map((ch) => '&#' + ch.charCodeAt(0) + ';').join(''),
    model: 'ACTION: REPLY\nBODY: password krmplqvbnx',
  }],
  expect: 'no-secret-bytes',
});

// Fix the broken html-entity turns: the generator above used a bad entity string.
// Replace those turns with a real entity encoding of the secret.
for (const row of cases) {
  if (row.shape === 'html-entity') {
    const encoded = 'krmplqvbnx'.split('').map((ch) => '&#' + ch.charCodeAt(0) + ';').join('');
    row.turns = [{
      client: 'password ' + encoded,
      model: 'ACTION: REPLY\nBODY: password krmplqvbnx',
    }];
  }
}

const longSecret = 'krmplqvbnx'.repeat(4);
leakCase({
  lang: 'en',
  shape: 'letters-long',
  channel: 'owner-introduces',
  value: longSecret,
  alnum: longSecret,
  surfaces: [longSecret],
  fragments: fragmentsOf(longSecret.slice(0, 12)).concat([longSecret.slice(0, 8), longSecret.slice(-8)]),
  turns: [{ client: 'hello', ownerReply: 'Temporary password ' + longSecret }],
});

leakCase({
  lang: 'en',
  shape: 'both-passwords',
  channel: 'model-echo',
  value: 'invKrmpl9xQ',
  alnum: 'invkrmpl9xq',
  surfaces: ['invKrmpl9xQ', 'mstQvbn7zLp'],
  fragments: fragmentsOf('invkrmpl9xq').concat(fragmentsOf('mstqvbn7zlp')),
  turns: [{
    client: 'investor password invKrmpl9xQ and master password mstQvbn7zLp',
    model: 'ACTION: REPLY\nBODY: Investor invKrmpl9xQ and master mstQvbn7zLp received.',
  }],
});

leakCase({
  lang: 'en',
  shape: 'fragment-only',
  channel: 'model-echo',
  value: 'krmplqvbnx',
  alnum: 'krmplqvbnx',
  surfaces: ['krmplqvbnx', 'lqvbnx'],
  fragments: fragmentsOf('krmplqvbnx'),
  turns: [{ client: 'my password is krmplqvbnx', model: 'ACTION: REPLY\nBODY: the ending lqvbnx is enough to reset' }],
});

leakCase({
  lang: 'en',
  shape: 'summary-note',
  channel: 'escalation-summary',
  value: 'krmplqvbnx',
  alnum: 'krmplqvbnx',
  surfaces: ['krmplqvbnx'],
  fragments: fragmentsOf('krmplqvbnx'),
  turns: [{
    client: ('I cannot log in. password krmplqvbnx. ' + 'Please review the dashboard history and the last trade. ').repeat(12),
    model: 'ACTION: REPLY\nBODY: A teammate will review this.',
    summary: 'Client cannot log in. password krmplqvbnx.',
    team: 'escalations',
  }],
});

leakCase({
  lang: 'en',
  shape: 'jerry-long-note',
  channel: 'jerry-summary',
  value: '582046',
  alnum: '582046',
  surfaces: ['582046'],
  fragments: ['5820', '8204', '2046', '582046'],
  turns: [{
    client: ('otp 582046 was on the screen. ' + 'I need help with the challenge rules and the dashboard clock. ').repeat(14),
    model: 'ACTION: REPLY\nBODY: Happy to explain the rules.',
    summary: 'Client reported otp 582046.',
    team: 'jerry',
  }],
});

leakCase({
  lang: 'en',
  shape: 'last-escalate',
  channel: 'escalate-memory',
  value: 'krmplqvbnx',
  alnum: 'krmplqvbnx',
  surfaces: ['krmplqvbnx'],
  fragments: fragmentsOf('krmplqvbnx'),
  turns: [{
    client: 'my password is krmplqvbnx and the platform will not open',
    model: 'ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: password krmplqvbnx will not open\nACTION_NEEDED: review login',
  }],
});

// Fail-closed
add({
  group: 'fail-closed',
  shape: 'throwing-read',
  secret: 'krmplqvbnx',
  surfaces: ['krmplqvbnx'],
  fragments: fragmentsOf('krmplqvbnx'),
  expect: 'fixed-only',
  note: 'Inbound body getter throws an Error whose message contains the synthetic secret.',
});
add({
  group: 'fail-closed',
  shape: 'throwing-outbound',
  secret: '739184',
  surfaces: ['739184'],
  fragments: ['7391', '3918', '9184', '739184'],
  expect: 'fixed-only',
  note: 'Control passthrough body getter throws before guardedSend.',
});
add({
  group: 'fail-closed',
  shape: 'oversize-reply',
  secret: 'krmplqvbnx',
  surfaces: ['krmplqvbnx'],
  fragments: fragmentsOf('krmplqvbnx'),
  expect: 'fixed-only',
  filler: 'krmplqvbnx ',
  count: 1200,
  ask: 'what is the profit split?',
});
add({
  group: 'fail-closed',
  shape: 'oversize-inbound',
  secret: '582046',
  surfaces: ['582046'],
  fragments: ['5820', '8204', '2046', '582046'],
  expect: 'fixed-only',
  askPrefix: 'otp 582046 ',
  count: 20000,
});
add({
  group: 'fail-closed',
  shape: 'lt-run',
  secret: 'krmplqvbnx',
  surfaces: ['krmplqvbnx'],
  fragments: fragmentsOf('krmplqvbnx'),
  expect: 'fixed-only',
  body: '<'.repeat(100000) + 'password krmplqvbnx',
});
add({
  group: 'fail-closed',
  shape: 'timeout-scan',
  secret: 'krmplqvbnx',
  surfaces: ['krmplqvbnx'],
  fragments: fragmentsOf('krmplqvbnx'),
  expect: 'fixed-or-timeout',
  note: 'Outbound body is a long token list under the size cap, ending with the secret. Timeout must not emit the raw body.',
});

// Spread 55188
const eligibleAsks = [
  'how do I check spreads',
  'how do I check the spreads',
  'How do I check spreads?',
  'please how do I check spreads',
  'how do I check spreads<br>thanks',
  'how do I check spreads<p>today</p>',
  'give me the test account',
  'send me the test account',
  'please give me the test account',
  'give me the test account<br>now',
];
for (const ask of eligibleAsks) {
  add({
    group: 'spread',
    eligibility: 'eligible',
    ask: ask,
    replyVariant: ask.indexOf('<br>') >= 0 || ask.indexOf('<p>') >= 0 ? 'html' : 'plain',
    expect: 'exact-template',
    templateLength: TEMPLATE.length,
  });
}
add({
  group: 'spread',
  eligibility: 'eligible',
  ask: 'how do I check spreads',
  replyVariant: 'html',
  expect: 'exact-template',
  templateLength: TEMPLATE.length,
  note: 'Model returns a <br> HTML variant of the authorized template.',
});
add({
  group: 'spread',
  eligibility: 'eligible',
  ask: 'give me the test account',
  replyVariant: 'spaced',
  expect: 'exact-template',
  templateLength: TEMPLATE.length,
  note: 'Model returns the template with extra blank lines.',
});
add({
  group: 'spread',
  eligibility: 'eligible',
  ask: 'how do I check spreads',
  replyVariant: 'greeting',
  expect: 'exact-template',
  templateLength: TEMPLATE.length,
  note: 'Model prefixes a short greeting then the template.',
});

const ineligible = [
  ['what is a spread', 'definition'],
  ['what are spreads', 'definition'],
  ['I was testing spreads yesterday', 'self-report'],
  ['do not send me the spread account', 'negation'],
  ["don't check spreads for me", 'negation'],
  ['how do I check my payout', 'payout'],
  ['please send the spreadsheet', 'spreadsheet'],
  ['my positions are spread across two accounts', 'distribution'],
  ['this is not about spreads', 'negation'],
  ['check the spreads for him', 'third-party'],
  ['I check spreads every morning', 'self-report'],
  ['hello there', 'no-spread'],
  ['what is the profit split on the 100k challenge?', 'faq'],
  ['give me the test account for him', 'third-party-account'],
];
for (const [ask, why] of ineligible) {
  add({
    group: 'spread',
    eligibility: 'ineligible',
    ask: ask,
    why: why,
    replyVariant: 'plain',
    expect: 'no-template',
  });
}

const borderline = [
  ['spreads?', 'bare'],
  ['can you check something about spreads', 'weak-shape'],
  ['how do spreads work', 'definition-adjacent'],
  ['tell me about the spread test', 'no-check-verb'],
  ['kaise spread check karun', 'roman-urdu'],
  ['سپریڈ کیسے چیک کروں', 'urdu'],
  ['स्प्रेड कैसे चेक करूं', 'hindi'],
  ['كيف أتحقق من السبريد', 'arabic'],
  ['bhai spreads kaise check karun', 'hinglish'],
  ['how do I check the spread sheet layout', 'spreadsheet-adjacent'],
  ['I want the test account but not for spreads', 'mixed'],
  ['check spreads? just kidding, what is a payout', 'mixed-clause'],
];
for (const [ask, why] of borderline) {
  add({
    group: 'spread',
    eligibility: 'borderline',
    ask: ask,
    why: why,
    replyVariant: 'plain',
    expect: 'no-template',
  });
}

// Over-blocks from the public FAQ, plus the named ordinary strings.
const faqPath = path.join(__dirname, '../../../luna-current/01_runtime/fundedelite-faqs.md');
const faqMd = fs.readFileSync(faqPath, 'utf8');
const faqParts = faqMd.split(/\n### /).slice(1);
const faqChunks = [];
for (const part of faqParts) {
  const lines = part.split('\n');
  const title = lines[0].replace(/\r/g, '').trim();
  if (!title || title.length > 180) continue;
  let body = lines.slice(1).join('\n');
  body = body.replace(/^URL:.*$/gmi, '').replace(/^Index:.*$/gmi, '').trim();
  if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(title + body)) continue;
  const text = (title + '\n\n' + body).replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 40 || text.length > 4000) continue;
  faqChunks.push(text);
  if (faqChunks.length >= 210) break;
}
if (faqChunks.length < 200) {
  const paras = faqMd.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length >= 40 && p.length <= 900 && !/^#/.test(p) && !/[\u3040-\u30ff]/.test(p));
  for (const p of paras) {
    if (faqChunks.length >= 210) break;
    faqChunks.push(p);
  }
}
faqChunks.slice(0, 210).forEach((text, i) => {
  const snippet = text.replace(/\s+/g, ' ').trim().slice(40, 90);
  add({
    group: 'overblock',
    kind: 'faq',
    ask: 'Can you explain this FundedElite rule in plain language?',
    reply: text,
    mustContain: snippet && snippet.length >= 12 ? [snippet] : [text.slice(0, 24)],
    expect: 'deliver',
    faqIndex: i,
  });
});

const ordinary = [
  ['price-7000', 'What does the $7.000 price mean?', 'The checkout price shown is $7.000 for that add-on.'],
  ['price-99', 'How much is the reset?', 'A reset on this plan is $99 before the weekend promo.'],
  ['percent', 'What is the profit split?', 'The profit split on that challenge is 80%.'],
  ['order', 'Where is my order?', 'Your order id is ORD-4491832 and it is still pending.'],
  ['ticket', 'Can you see my old ticket?', 'I can see ticket 215475947533931 in the notes, and it was a login history question.'],
  ['workspace', 'Which workspace is this?', 'Notes use workspace h2z8cgfr for teammate mentions.'],
  ['jerry-href', 'Please mention Jerry.', 'Please loop in ' + JERRY_HREF + ' so he can reply.'],
  ['machine', 'Do you use a machine?', 'No machine learning is involved. The dashboard is a normal web app.'],
  ['shine', 'Will the dashboard shine?', 'The dashboard will shine a light on your stats after the next update.'],
  ['password-word', 'How do I reset a password?', 'Password reset instructions are in the dashboard settings. I will not ask you to paste one.'],
  ['account-word', 'Where is the account number field?', 'The account number field is on the challenge card after you start.'],
  ['bare-mt5', 'Here is my account number', 'Thanks. Account 8844217 is a normal MT5 login and not a secret by itself.'],
  ['55188-mention', 'Is 55188 a client account?', '55188 is the public spread-check sample account number, not your personal login.'],
  ['spreadsheet', 'Can you send the spreadsheet?', 'I do not have a spreadsheet to send. The FAQ page lists the challenge rules.'],
  ['email', 'What email do I use?', 'Use the email on your dashboard profile. A sample address is trader@example.test.'],
];
for (const [kind, ask, reply] of ordinary) {
  add({
    group: 'overblock',
    kind: kind,
    ask: ask,
    reply: reply,
    mustContain: [reply.slice(0, Math.min(28, reply.length))],
    expect: 'deliver',
  });
}
add({
  group: 'overblock',
  kind: 'fragment-overlap',
  preInbound: 'my password is sunshine',
  ask: 'How does the dashboard look?',
  reply: 'The dashboard will shine a light on your stats. A machine records nothing secret.',
  mustContain: ['shine', 'machine', 'dashboard'],
  expect: 'deliver',
  secret: 'sunshine',
  surfaces: ['sunshine'],
  fragments: ['sunshine', 'shine'],
});
add({
  group: 'overblock',
  kind: 'fragment-overlap-word',
  preInbound: 'my password is sunshine',
  ask: 'What is a sunshine promo?',
  reply: 'There is no sunshine promo. The weekend flash sale is a separate offer.',
  mustContain: ['sunshine', 'weekend'],
  expect: 'deliver',
  secret: 'sunshine',
  surfaces: ['sunshine'],
  fragments: ['sunshine', 'sunsh', 'unshi'],
});

// Taint persistence and retry after deny
add({
  group: 'taint',
  shape: 'restart-fresh-inbound',
  secret: 'krmplqvbnx',
  surfaces: ['krmplqvbnx'],
  fragments: fragmentsOf('krmplqvbnx'),
  firstAsk: 'my password is krmplqvbnx',
  firstModel: 'ACTION: REPLY\nBODY: password krmplqvbnx noted',
  secondAsk: 'what is the profit split on the 100k challenge?',
  secondModel: 'ACTION: REPLY\nBODY: I still have password krmplqvbnx from before.',
  expect: 'no-secret-bytes',
});
add({
  group: 'taint',
  shape: 'retry-after-deny',
  secret: '739184',
  surfaces: ['739184'],
  fragments: ['7391', '3918', '9184', '739184'],
  ask: 'the pin is 739184',
  model: 'ACTION: REPLY\nBODY: pin 739184 received',
  expect: 'no-secret-bytes',
});
add({
  group: 'taint',
  shape: 'state-file-hashes-only',
  secret: 'mstQvbn7zLp',
  surfaces: ['mstQvbn7zLp'],
  fragments: fragmentsOf('mstqvbn7zlp'),
  ask: 'master password mstQvbn7zLp',
  model: 'ACTION: REPLY\nBODY: Thanks, a teammate will check the login issue.',
  expect: 'no-secret-bytes',
});

// Recovery
add({
  group: 'recovery',
  shape: 'restart-mid-op',
  secret: 'krmplqvbnx',
  surfaces: ['krmplqvbnx'],
  fragments: fragmentsOf('krmplqvbnx'),
  ask: 'my password is krmplqvbnx and the platform froze',
  model: 'ACTION: REPLY\nBODY: I can help with a frozen platform. Do not send the password again.',
  expect: 'no-secret-bytes',
});
add({
  group: 'recovery',
  shape: 'deferred-replay',
  secret: 'krmplqvbnx',
  surfaces: ['krmplqvbnx'],
  fragments: fragmentsOf('krmplqvbnx'),
  ask: 'can I reset now? the temporary password is krmplqvbnx',
  model: 'ACTION: REPLY\nBODY: You can reset from the dashboard.',
  expect: 'no-secret-bytes',
});
add({
  group: 'recovery',
  shape: 'duplicate-delivery',
  secret: '582046',
  surfaces: ['582046'],
  fragments: ['5820', '8204', '2046', '582046'],
  ask: 'otp 582046 just arrived',
  model: 'ACTION: REPLY\nBODY: I will not repeat a one time code.',
  expect: 'no-secret-bytes',
});
add({
  group: 'recovery',
  shape: 'retry-429',
  secret: 'krmplqvbnx',
  surfaces: ['krmplqvbnx'],
  fragments: fragmentsOf('krmplqvbnx'),
  ask: 'my password is krmplqvbnx',
  model: 'ACTION: REPLY\nBODY: Please change it in the dashboard settings.',
  expect: 'no-secret-bytes',
});

const probes = [
  'axios-post', 'axios-get', 'axios-create', 'axios-cache', 'http-request', 'https-request',
  'node:http', 'node:https', 'fetch', 'child-process', 'dynamic-require', 'getBuiltinModule',
  'vm', 'function-constructor', 'control-snooze', 'control-snooze-tainted', 'control-assign',
  'control-close', 'control-open', 'control-search', 'control-note-jerry', 'control-reply-clean',
];
for (const probe of probes) {
  add({
    group: 'boundary',
    probe: probe,
    secret: probe.indexOf('tainted') >= 0 ? 'krmplqvbnx' : '',
    surfaces: probe.indexOf('tainted') >= 0 ? ['krmplqvbnx'] : [],
    fragments: probe.indexOf('tainted') >= 0 ? fragmentsOf('krmplqvbnx') : [],
    expect: 'no-bypass',
  });
}

const doc = {
  version: 1,
  review: 'credential-guard-r13-independent',
  frozenCommit: '7c8b66858cb7c2a12abc2d3a80c18ad730e0f607',
  frozenBranch: 'cursor/credential-guard-r13-c90d',
  syntheticOnly: true,
  networkTripwire: true,
  constants: {
    template: TEMPLATE,
    templateLength: TEMPLATE.length,
    fixed: FIXED,
    fixedLength: FIXED.length,
    redactedNote: REDACTED,
    jerryHref: JERRY_HREF,
    workspaceId: 'h2z8cgfr',
  },
  counts: {},
  cases: cases,
};
const counts = {};
for (const row of cases) counts[row.group] = (counts[row.group] || 0) + 1;
doc.counts = counts;

const out = path.join(__dirname, '../cases/sealed-cases.json');
fs.writeFileSync(out, JSON.stringify(doc, null, 2));
console.log(JSON.stringify(counts));
console.log('total', cases.length);
console.log('wrote', out);
