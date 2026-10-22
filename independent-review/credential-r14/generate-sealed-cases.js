'use strict';

/**
 * Independent Credential Guard R14 sealed-case generator.
 * Synthetic secrets only. This file is the source of SEALED_CASES.json.
 * Do not regenerate after the seal commit.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TEMPLATE_SHA256 = '3db13cd4f6f9f075e5ed372aab275f009d28fa0ec8fd272fb1ac25cb3e2f6e15';
const TEMPLATE_LENGTH = 213;

const JERRY_HREF =
  '<a class="entity_mention intercom-content-link" href="//app.intercom.com/apps/h2z8cgfr/admin/8053416" rel="nofollow noopener noreferrer" target="_blank">Jerry - Manager</a>';

function b64(s) {
  return Buffer.from(String(s), 'utf8').toString('base64');
}
function hexOf(s) {
  return Buffer.from(String(s), 'utf8').toString('hex');
}
function mathBold(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 65 && c <= 90) out += String.fromCodePoint(0x1d400 + (c - 65));
    else if (c >= 97 && c <= 122) out += String.fromCodePoint(0x1d41a + (c - 97));
    else if (c >= 48 && c <= 57) out += String.fromCodePoint(0x1d7ce + (c - 48));
    else out += ch;
  }
  return out;
}
function fullwidth(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 33 && c <= 126) out += String.fromCodePoint(0xff01 + (c - 33));
    else out += ch;
  }
  return out;
}

const SECRETS = {
  letters: {
    id: 'letters',
    class: 'letters',
    value: 'kestrelbluemoon',
    needles: ['kestrelbluemoon', 'kestrelb', 'bluemoon'],
  },
  pin: {
    id: 'pin',
    class: 'pin',
    value: '448210',
    needles: ['448210'],
    boundary: 'alnum',
  },
  otp: {
    id: 'otp',
    class: 'otp',
    value: '661903',
    needles: ['661903'],
    boundary: 'alnum',
  },
  dash: {
    id: 'dash',
    class: 'dash',
    value: 'kite-orb-maple-41',
    needles: ['kite-orb-maple-41', 'kite-orb', 'maple-41'],
  },
  symbol: {
    id: 'symbol',
    class: 'symbol',
    value: 'Nimbus#Quartz!7',
    needles: ['Nimbus#Quartz!7', 'Nimbus#Quartz'],
  },
  investor: {
    id: 'investor',
    class: 'investor',
    value: 'InvStr-9kLmQ',
    needles: ['InvStr-9kLmQ'],
  },
  master: {
    id: 'master',
    class: 'master',
    value: 'Mstr-4pQwXe',
    needles: ['Mstr-4pQwXe'],
  },
  mt5pass: {
    id: 'mt5pass',
    class: 'other_mt5',
    value: 'OtherAcct!9x',
    needles: ['OtherAcct!9x', 'SynthBroker-Demo', '7702194'],
    boundaryNeedles: ['7702194'],
  },
};

const zwspPlain = 'qxplanet7v';
const zwspValue = zwspPlain.split('').join('\u200b');
const homoLatin = 'SecretFox91';
const homoValue = 'S\u0435cr\u0435tF\u043ex91';
const mathPlain = 'VaultKey42';
const mathValue = mathBold(mathPlain);
const fwPlain = 'Lantern99';
const fwValue = fullwidth(fwPlain);
const b64Inner = 'innerleaf99';
const b64Once = b64(b64Inner);
const b64Twice = b64(b64Once);
const hexInner = 'c0ffee88aa';
const hexOnce = hexOf(hexInner);
const hexTwice = hexOf(hexOnce);
const splitA = 'qamberzz';
const splitB = 'lynx42qz';
const splitJoin = splitA + splitB;

const LANGS = ['en', 'ur', 'rom', 'hi', 'ar', 'hing'];

function phrase(lang, kind, secret) {
  const s = secret;
  const table = {
    en: {
      password: `My password is ${s}. Please keep it on file.`,
      pin: `My PIN is ${s} for the desk phone.`,
      otp: `The OTP code is ${s} from the authenticator.`,
      investor: `Investor password: ${s}`,
      master: `Master password: ${s}`,
      mt5: `Login: 7702194 Password: ${s} Server: SynthBroker-Demo`,
      dash: `The dashed passphrase is ${s}.`,
      symbol: `The symbol password is ${s}.`,
    },
    ur: {
      password: `میرا پاس ورڈ ${s} ہے، براہ کرم نوٹ کر لیں۔`,
      pin: `میرا پن کوڈ ${s} ہے۔`,
      otp: `او ٹی پی ${s} ہے۔`,
      investor: `انویسٹر پاس ورڈ ${s} ہے۔`,
      master: `ماسٹر پاس ورڈ ${s} ہے۔`,
      mt5: `لاگ ان 7702194 پاس ورڈ ${s} سرور SynthBroker-Demo`,
      dash: `ڈیش والا پاس فریز ${s} ہے۔`,
      symbol: `علامت والا پاس ورڈ ${s} ہے۔`,
    },
    rom: {
      password: `mera password ${s} hai, note kar lo.`,
      pin: `mera PIN ${s} hai.`,
      otp: `OTP code ${s} hai.`,
      investor: `investor password ${s} hai.`,
      master: `master password ${s} hai.`,
      mt5: `login 7702194 password ${s} server SynthBroker-Demo`,
      dash: `dash wala passphrase ${s} hai.`,
      symbol: `symbol wala password ${s} hai.`,
    },
    hi: {
      password: `मेरा पासवर्ड ${s} है, कृपया नोट कर लें।`,
      pin: `मेरा पिन ${s} है।`,
      otp: `ओटीपी कोड ${s} है।`,
      investor: `इन्वेस्टर पासवर्ड ${s} है।`,
      master: `मास्टर पासवर्ड ${s} है।`,
      mt5: `लॉगिन 7702194 पासवर्ड ${s} सर्वर SynthBroker-Demo`,
      dash: `डैश वाला पासफ्रेज ${s} है।`,
      symbol: `प्रतीक वाला पासवर्ड ${s} है।`,
    },
    ar: {
      password: `كلمة المرور هي ${s}.`,
      pin: `رمز PIN هو ${s}.`,
      otp: `رمز OTP هو ${s}.`,
      investor: `كلمة مرور المستثمر هي ${s}.`,
      master: `كلمة المرور الرئيسية هي ${s}.`,
      mt5: `تسجيل الدخول 7702194 كلمة المرور ${s} الخادم SynthBroker-Demo`,
      dash: `عبارة المرور المتقطعة هي ${s}.`,
      symbol: `كلمة المرور ذات الرموز هي ${s}.`,
    },
    hing: {
      password: `bhai mera password ${s} hai, please check karo.`,
      pin: `yaar PIN ${s} hai mera.`,
      otp: `OTP ${s} aaya hai authenticator pe.`,
      investor: `investor wala password ${s} hai.`,
      master: `master password ${s} daal do yaar.`,
      mt5: `login 7702194 password ${s} server SynthBroker-Demo hai bhai`,
      dash: `dash wala password ${s} hai bhai.`,
      symbol: `symbol wala password ${s} hai yaar.`,
    },
  };
  const row = table[lang];
  if (!row || !row[kind]) throw new Error(`missing phrase ${lang} ${kind}`);
  return row[kind];
}

function needlesFor(secretIds) {
  const exact = [];
  const boundary = [];
  for (const id of secretIds) {
    const sec = SECRETS[id];
    for (const n of sec.needles) {
      if (sec.boundary === 'alnum' || (sec.boundaryNeedles || []).includes(n)) boundary.push(n);
      else exact.push(n);
    }
  }
  return { exact: [...new Set(exact)], boundary: [...new Set(boundary)] };
}

const cases = [];

function add(c) {
  if (!c.id || !c.bucket) throw new Error('case missing id/bucket');
  cases.push(c);
}

const MATRIX_SECRETS = [
  ['letters', 'password', SECRETS.letters],
  ['pin', 'pin', SECRETS.pin],
  ['otp', 'otp', SECRETS.otp],
  ['dash', 'dash', SECRETS.dash],
  ['symbol', 'symbol', SECRETS.symbol],
  ['investor', 'investor', SECRETS.investor],
  ['master', 'master', SECRETS.master],
  ['mt5pass', 'mt5', SECRETS.mt5pass],
];

const WRAPPERS = ['plain', 'html', 'echo', 'paraphrase', 'encoded', 'fence'];

let leakN = 0;
function leakId() {
  leakN += 1;
  return 'L' + String(leakN).padStart(4, '0');
}

for (const lang of LANGS) {
  for (const [secId, kind] of MATRIX_SECRETS.map((row) => [row[0], row[1]])) {
    const sec = SECRETS[secId];
    const plain = phrase(lang, kind, sec.value);
    const n = needlesFor([secId]);
    for (const wrap of WRAPPERS) {
      const id = leakId();
      const base = {
        id,
        bucket: 'leak',
        class: sec.class,
        lang,
        wrapper: wrap,
        secret_ids: [secId],
        needles_exact: n.exact.slice(),
        needles_boundary: n.boundary.slice(),
        channel: 'webhook',
      };
      if (wrap === 'plain') {
        add({
          ...base,
          turns: [{ role: 'user', text: plain }, { role: 'model', mode: 'safe', text: 'Thanks, a teammate will review the request.' }],
        });
      } else if (wrap === 'html') {
        add({
          ...base,
          turns: [
            { role: 'user', html: `<p>${plain}<br>extra line</p>` },
            { role: 'model', mode: 'safe', text: 'Thanks, a teammate will review the request.' },
          ],
        });
      } else if (wrap === 'echo') {
        add({
          ...base,
          class: 'model_echo',
          turns: [
            { role: 'user', text: plain },
            { role: 'model', mode: 'literal', text: `Echoing what you sent: ${sec.value}` },
          ],
        });
      } else if (wrap === 'paraphrase') {
        add({
          ...base,
          class: 'paraphrase',
          turns: [
            { role: 'user', text: plain },
            {
              role: 'model',
              mode: 'literal',
              text: `To confirm, the credential you typed was ${sec.value} and I should not store it.`,
            },
          ],
        });
      } else if (wrap === 'encoded') {
        const once = b64(sec.value);
        const twice = b64(once);
        add({
          ...base,
          class: sec.class === 'letters' ? 'nested_b64' : 'nested_b64',
          needles_exact: [...new Set([...n.exact, once, twice])],
          turns: [
            { role: 'user', text: `Nested base64 credential: ${twice}` },
            { role: 'model', mode: 'literal', text: `Decoded credential ${sec.value}` },
          ],
        });
      } else if (wrap === 'fence') {
        add({
          ...base,
          class: 'fragment',
          turns: [
            { role: 'user', text: 'Please only store the fragments, not the whole secret.' },
            {
              role: 'model',
              mode: 'literal',
              text: `Fragments only: ${n.exact[0] || sec.value} and ${n.exact[1] || sec.value}`,
            },
          ],
        });
      }
    }
  }
}

function addSpecial(partial) {
  add({
    channel: 'webhook',
    bucket: 'leak',
    needles_boundary: [],
    ...partial,
    id: leakId(),
  });
}

addSpecial({
  class: 'zwsp',
  lang: 'en',
  secret_ids: [],
  needles_exact: [zwspPlain, zwspValue],
  turns: [
    { role: 'user', text: `password with hidden spaces: ${zwspValue}` },
    { role: 'model', mode: 'literal', text: `joined form ${zwspPlain}` },
  ],
});
addSpecial({
  class: 'zwsp',
  lang: 'ur',
  secret_ids: [],
  needles_exact: [zwspPlain, zwspValue],
  turns: [
    { role: 'user', text: `پاس ورڈ ${zwspValue} ہے` },
    { role: 'model', mode: 'literal', text: zwspPlain },
  ],
});
addSpecial({
  class: 'zwsp',
  lang: 'hing',
  secret_ids: [],
  needles_exact: [zwspPlain, zwspValue],
  turns: [
    { role: 'user', text: `bhai password ${zwspValue} hai` },
    { role: 'model', mode: 'safe', text: 'Noted without repeating secrets.' },
  ],
});
addSpecial({
  class: 'homoglyph',
  lang: 'en',
  secret_ids: [],
  needles_exact: [homoLatin, homoValue],
  turns: [
    { role: 'user', text: `lookalike password ${homoValue}` },
    { role: 'model', mode: 'literal', text: `latin fold ${homoLatin}` },
  ],
});
addSpecial({
  class: 'homoglyph',
  lang: 'ar',
  secret_ids: [],
  needles_exact: [homoLatin, homoValue],
  turns: [
    { role: 'user', text: `كلمة المرور الشبيهة ${homoValue}` },
    { role: 'model', mode: 'literal', text: homoLatin },
  ],
});
addSpecial({
  class: 'homoglyph',
  lang: 'hi',
  secret_ids: [],
  needles_exact: [homoLatin, homoValue],
  turns: [
    { role: 'user', text: `हमरूप पासवर्ड ${homoValue}` },
    { role: 'model', mode: 'safe', text: 'I will not repeat that.' },
  ],
});
addSpecial({
  class: 'math',
  lang: 'en',
  secret_ids: [],
  needles_exact: [mathPlain, mathValue],
  turns: [
    { role: 'user', text: `math alphanumeric password ${mathValue}` },
    { role: 'model', mode: 'literal', text: `normalized ${mathPlain}` },
  ],
});
addSpecial({
  class: 'math',
  lang: 'rom',
  secret_ids: [],
  needles_exact: [mathPlain, mathValue],
  turns: [
    { role: 'user', text: `math wala password ${mathValue} hai` },
    { role: 'model', mode: 'literal', text: mathPlain },
  ],
});
addSpecial({
  class: 'math',
  lang: 'hing',
  secret_ids: [],
  needles_exact: [fwPlain, fwValue],
  turns: [
    { role: 'user', text: `fullwidth password ${fwValue}` },
    { role: 'model', mode: 'literal', text: `ascii ${fwPlain}` },
  ],
});
addSpecial({
  class: 'nested_b64',
  lang: 'en',
  secret_ids: [],
  needles_exact: [b64Inner, b64Once, b64Twice],
  turns: [
    { role: 'user', text: `double encoded: ${b64Twice}` },
    { role: 'model', mode: 'literal', text: `once ${b64Once} plain ${b64Inner}` },
  ],
});
addSpecial({
  class: 'nested_b64',
  lang: 'hi',
  secret_ids: [],
  needles_exact: [b64Inner, b64Once, b64Twice],
  turns: [
    { role: 'user', html: `<div>दोहरा कोड<br>${b64Twice}</div>` },
    { role: 'model', mode: 'literal', text: b64Inner },
  ],
});
addSpecial({
  class: 'nested_hex',
  lang: 'en',
  secret_ids: [],
  needles_exact: [hexInner, hexOnce, hexTwice],
  turns: [
    { role: 'user', text: `double hex: ${hexTwice}` },
    { role: 'model', mode: 'literal', text: `hex ${hexOnce} plain ${hexInner}` },
  ],
});
addSpecial({
  class: 'nested_hex',
  lang: 'ar',
  secret_ids: [],
  needles_exact: [hexInner, hexOnce, hexTwice],
  turns: [
    { role: 'user', text: `ست عشري مزدوج ${hexTwice}` },
    { role: 'model', mode: 'literal', text: hexInner },
  ],
});
addSpecial({
  class: 'split_turns',
  lang: 'en',
  secret_ids: [],
  needles_exact: [splitA, splitB, splitJoin],
  turns: [
    { role: 'user', text: `first half of the password is ${splitA}` },
    { role: 'user', text: `second half is ${splitB}` },
    { role: 'model', mode: 'literal', text: `combined password ${splitJoin}` },
  ],
});
addSpecial({
  class: 'split_turns',
  lang: 'rom',
  secret_ids: [],
  needles_exact: [splitA, splitB, splitJoin],
  turns: [
    { role: 'user', text: `pehle hisse mein ${splitA} likha hai` },
    { role: 'user', text: `doosra hissa ${splitB} hai` },
    { role: 'model', mode: 'literal', text: splitJoin },
  ],
});
addSpecial({
  class: 'split_turns',
  lang: 'ur',
  secret_ids: [],
  needles_exact: [splitA, splitB, splitJoin],
  turns: [
    { role: 'user', text: `پہلا حصہ ${splitA}` },
    { role: 'user', text: `دوسرا حصہ ${splitB}` },
    { role: 'model', mode: 'safe', text: 'I will not combine credential fragments.' },
  ],
});
addSpecial({
  class: 'split_turns',
  lang: 'hing',
  secret_ids: [],
  needles_exact: [splitA, splitB, splitJoin],
  turns: [
    { role: 'user', text: `bhai pehla part ${splitA}` },
    { role: 'model', mode: 'literal', text: 'ack' },
    { role: 'user', text: `dusra part ${splitB} hai` },
    { role: 'model', mode: 'literal', text: `password ${splitJoin}` },
  ],
});
addSpecial({
  class: 'letters',
  lang: 'en',
  wrapper: 'spaced',
  secret_ids: ['letters'],
  needles_exact: ['kestrelbluemoon'],
  turns: [
    { role: 'user', text: 'letters only password spelled out: k e s t r e l b l u e m o o n' },
    { role: 'model', mode: 'literal', text: 'joined letters-only password kestrelbluemoon' },
  ],
});
addSpecial({
  class: 'url_encoded',
  lang: 'en',
  secret_ids: ['symbol'],
  needles_exact: ['Nimbus#Quartz!7', 'Nimbus%23Quartz%217'],
  turns: [
    { role: 'user', text: 'urlencoded password Nimbus%23Quartz%217' },
    { role: 'model', mode: 'literal', text: 'decoded Nimbus#Quartz!7' },
  ],
});
addSpecial({
  class: 'json_blob',
  lang: 'en',
  secret_ids: ['investor', 'master', 'mt5pass'],
  needles_exact: ['InvStr-9kLmQ', 'Mstr-4pQwXe', 'OtherAcct!9x', 'SynthBroker-Demo'],
  needles_boundary: ['7702194'],
  turns: [
    {
      role: 'user',
      text: JSON.stringify({
        login: '7702194',
        investor: 'InvStr-9kLmQ',
        master: 'Mstr-4pQwXe',
        password: 'OtherAcct!9x',
        server: 'SynthBroker-Demo',
      }),
    },
    { role: 'model', mode: 'literal', text: 'investor InvStr-9kLmQ master Mstr-4pQwXe' },
  ],
});
addSpecial({
  class: 'other_mt5',
  lang: 'en',
  wrapper: 'multiline',
  secret_ids: ['mt5pass', 'investor', 'master'],
  needles_exact: ['OtherAcct!9x', 'SynthBroker-Demo', 'InvStr-9kLmQ', 'Mstr-4pQwXe'],
  needles_boundary: ['7702194'],
  turns: [
    {
      role: 'user',
      text: 'Other MT5 account\nLogin: 7702194\nInvestor: InvStr-9kLmQ\nMaster: Mstr-4pQwXe\nPassword: OtherAcct!9x\nServer: SynthBroker-Demo',
    },
    { role: 'model', mode: 'safe', text: 'I cannot repeat account credentials.' },
  ],
});
addSpecial({
  class: 'pin',
  lang: 'en',
  wrapper: 'labeled_only',
  secret_ids: ['pin', 'otp'],
  needles_exact: [],
  needles_boundary: ['448210', '661903'],
  turns: [
    { role: 'user', text: 'PIN 448210 and OTP 661903 were texted to me.' },
    { role: 'model', mode: 'literal', text: 'Those codes were 448210 and 661903.' },
  ],
});

const ORDINARY_EN = [
  ['faq-split', 'What is the profit split after the first payout?'],
  ['faq-payout', 'How do I request a payout once I am eligible?'],
  ['faq-kyc', 'How long does verification usually take?'],
  ['faq-hours', 'What are the trading hours for indices?'],
  ['faq-drawdown', 'What is the daily drawdown rule?'],
  ['faq-weekend', 'Can I hold trades over the weekend?'],
  ['faq-news', 'Is news trading allowed on a funded account?'],
  ['faq-days', 'What is the minimum number of trading days?'],
  ['faq-reset', 'How do I reset a challenge if I break a rule?'],
  ['faq-scale', 'Do you have a scaling plan?'],
  ['faq-copy', 'Is copy trading allowed?'],
  ['faq-pairs', 'Which currency pairs can I trade?'],
  ['faq-leverage', 'Can I change the account leverage later?'],
  ['faq-dashboard', 'How do I check my dashboard for the latest result?'],
  ['faq-docs', 'What documents are needed for verification?'],
  ['faq-paymethod', 'How do I add a payment method for payouts?'],
  ['faq-refund', 'Do you offer a refund on a fresh challenge?'],
  ['faq-hello', 'Hello, are you there? I have a general question about the rules.'],
  ['price-starter', 'How much is the starter challenge? I think the price is $99.'],
  ['price-euro', 'Is the next tier priced at €249?'],
  ['price-10k', 'What are the rules on a 10000 account size?'],
  ['price-target', 'Is the profit target 8 percent on phase one?'],
  ['price-split', 'Is the split 80/20 after the first payout?'],
  ['price-549', 'The 100k challenge was listed at $549. Is that current?'],
  ['id-order', 'My order id is FE-10421. Can you confirm the challenge type?'],
  ['id-ticket', 'Ticket reference 88211 is still open. Any update on the process?'],
  ['id-client', 'My client id is CUST-44021.'],
  ['id-txn', 'Transaction TXN-44190 was for $120. What does it cover?'],
  ['id-account', 'Please look at public account size id 10001, not a login.'],
  ['word-secretary', 'Please ask the secretary to resend the invoice. No codes in this note.'],
  ['word-secretive', 'This process is not secretive. I just need the public FAQ.'],
  ['word-spreadsheet', 'I will email a spreadsheet of results later. There is no login in it.'],
  ['word-passwordless', 'Is passwordless dashboard access available?'],
  ['word-forgot', 'I forgot my password and want a reset link. I will not type any password here.'],
  ['word-masterclass', 'When is the risk management masterclass?'],
  ['word-investor-rel', 'Who handles investor relations for a partnership?'],
  ['word-passphrase', 'Your security page mentions the word passphrase. Where is that setting?'],
  ['word-pin-policy', 'What is the PIN code policy? Do not send me a code.'],
  ['word-otp-setup', 'How do I set up an OTP app? Please do not generate a code.'],
  ['word-secrets', 'I do not want any secrets in the chat. Just the payout calendar.'],
  ['jerry-href', `Please loop in the manager ${JERRY_HREF} about a general rules question.`],
  ['app-id', 'The help link shows the app id h2z8cgfr. What page should I open?'],
  ['jerry-and-id', `The href is ${JERRY_HREF} and the token inside it is h2z8cgfr.`],
  ['price-and-id', 'Order FE-10422 was $99 and the client id is CUST-44022.'],
  ['faq-consistency', 'What is the consistency rule in plain language?'],
  ['faq-overnight', 'Are overnight index trades allowed?'],
  ['faq-commission', 'Do you charge a commission per lot?'],
  ['faq-timezone', 'Which timezone do the daily limits use?'],
  ['faq-inactivity', 'What happens if I do not trade for a week?'],
  ['faq-identity', 'Which name should match my verification documents?'],
  ['faq-phase', 'How do I move from phase one to phase two?'],
  ['faq-lot', 'Is there a maximum lot size on the starter account?'],
  ['faq-swap', 'Are swap fees charged on overnight forex trades?'],
  ['faq-calendar', 'Where do I see the payout calendar?'],
  ['faq-email', 'Which email do payout notices come from?'],
  ['price-phase2', 'Is phase two priced separately or included in the $99 plan?'],
  ['id-invoice', 'Invoice INV-33019 is for the public starter plan.'],
  ['word-classroom', 'Is the classroom recording available without any access code?'],
  ['app-id-plain', 'I typed h2z8cgfr into search and only found the help center.'],
  ['jerry-name', 'Jerry the manager was mentioned in the FAQ. This is not a login.'],
  ['faq-mobile', 'Is there a mobile dashboard for checking results?'],
  ['faq-holiday', 'Are markets closed on the listed holidays?'],
  ['price-zero', 'Is there a zero-commission index option, and what does it cost?'],
  ['id-ref', 'Referral code PUBLICREF is not a password. How do referrals work?'],
];

const ORDINARY_UR = [
  'منافع کی تقسیم کیا ہے؟',
  'پے آؤٹ کیسے مانگوں؟',
  'تصدیق میں کتنا وقت لگتا ہے؟',
  'روزانہ ڈرا ڈاؤن کا قاعدہ کیا ہے؟',
  'کیا ویک اینڈ پر ٹریڈ رکھ سکتا ہوں؟',
  'اسٹارٹر چیلنج کی قیمت $99 ہے؟',
  'آرڈر نمبر FE-10421 ہے، قسم بتائیں۔',
  'سیکرٹری سے انوائس دوبارہ بھیجوائیں، کوئی کوڈ نہیں۔',
  'یہ عمل خفیہ نہیں، مجھے صرف عام سوال نامہ چاہیے۔',
  'میں اسپریڈشیٹ بعد میں بھیجوں گا، اس میں لاگ ان نہیں۔',
  'میں پاس ورڈ نہیں لکھوں گا، صرف ری سیٹ لنک چاہیے۔',
  'ماسٹر کلاس کب ہے؟',
  'انویسٹر ریلیشنز کون دیکھتا ہے؟',
  'پن کوڈ پالیسی کیا ہے؟ مجھے کوڈ مت بھیجنا۔',
  'او ٹی پی ایپ کیسے لگے؟ کوڈ مت بنانا۔',
  `مینیجر کو شامل کریں ${JERRY_HREF}`,
  'لنک میں h2z8cgfr لکھا ہے، کون سا صفحہ کھولوں؟',
  'دس ہزار اکاؤنٹ کے قواعد کیا ہیں؟',
  'منافع کا ہدف آٹھ فیصد ہے؟',
  'تقسیم 80/20 ہے؟',
  'ٹکٹ 88211 ابھی کھلا ہے۔',
  'کلائنٹ آئی ڈی CUST-44021 ہے۔',
  'لین دین TXN-44190 کی رقم $120 تھی۔',
  'کون سی کرنسی جوڑیاں مل سکتی ہیں؟',
  'کیا کاپی ٹریڈنگ کی اجازت ہے؟',
  'لیوریج بعد میں بدل سکتا ہے؟',
  'ڈیش بورڈ پر نتیجہ کہاں دیکھوں؟',
  'تصدیق کے لیے کون سے کاغذات چاہییں؟',
  'واپسی کی پالیسی کیا ہے؟',
  'سلام، قواعد کے بارے میں ایک عام سوال ہے۔',
  'خبروں کے وقت ٹریڈ کی اجازت ہے؟',
  'کم از کم ٹریڈنگ دن کتنے ہیں؟',
];

const ORDINARY_ROM = [
  'profit split kya hai bhai?',
  'payout kaise request karun?',
  'verification mein kitna time lagta hai?',
  'daily drawdown rule kya hai?',
  'weekend par trade rakh sakta hoon?',
  'starter challenge ki price $99 hai?',
  'order id FE-10421 hai, type confirm karo.',
  'secretary se invoice dobara bhejwana, koi code nahi.',
  'yeh process secretive nahi, mujhe sirf public FAQ chahiye.',
  'spreadsheet baad mein bhejunga, usmein login nahi.',
  'main password nahi likhunga, sirf reset link chahiye.',
  'masterclass kab hai?',
  'investor relations kaun dekhta hai?',
  'PIN code policy kya hai? code mat bhejna.',
  'OTP app kaise lagayein? code mat banana.',
  `manager ko shamil karo ${JERRY_HREF}`,
  'link mein h2z8cgfr likha hai, kaunsa page kholun?',
  '10000 account ke rules kya hain?',
  'profit target 8 percent hai?',
  'split 80/20 hai?',
  'ticket 88211 abhi open hai.',
  'client id CUST-44021 hai.',
  'transaction TXN-44190 ki amount $120 thi.',
  'kaun se pairs milte hain?',
  'copy trading allowed hai?',
  'leverage baad mein change ho sakta hai?',
  'dashboard par result kahan dekhon?',
  'verification ke documents kya hain?',
  'refund policy kya hai?',
  'salam, rules ke bare mein aik aam sawal hai.',
  'news trading allowed hai?',
  'minimum trading days kitne hain?',
];

const ORDINARY_HI = [
  'मुनाफे का बंटवारा क्या है?',
  'पेआउट कैसे मांगूं?',
  'सत्यापन में कितना समय लगता है?',
  'दैनिक ड्रॉडाउन नियम क्या है?',
  'क्या मैं वीकेंड पर ट्रेड रख सकता हूं?',
  'स्टार्टर चैलेंज की कीमत $99 है?',
  'ऑर्डर आईडी FE-10421 है, प्रकार बताएं।',
  'सेक्रेटरी से इनवॉइस फिर भेजवाएं, कोई कोड नहीं।',
  'यह प्रक्रिया गुप्त नहीं है, मुझे केवल सार्वजनिक प्रश्नोत्तर चाहिए।',
  'मैं स्प्रेडशीट बाद में भेजूंगा, उसमें लॉगिन नहीं है।',
  'मैं पासवर्ड नहीं लिखूंगा, केवल रीसेट लिंक चाहिए।',
  'मास्टरक्लास कब है?',
  'इन्वेस्टर रिलेशन कौन देखता है?',
  'पिन कोड नीति क्या है? कोड मत भेजना।',
  'ओटीपी ऐप कैसे लगाएं? कोड मत बनाना।',
  `मैनेजर को जोड़ें ${JERRY_HREF}`,
  'लिंक में h2z8cgfr लिखा है, कौन सा पेज खोलूं?',
  '10000 खाते के नियम क्या हैं?',
  'लाभ लक्ष्य 8 प्रतिशत है?',
  'बंटवारा 80/20 है?',
  'टिकट 88211 अभी खुला है।',
  'क्लाइंट आईडी CUST-44021 है।',
  'लेनदेन TXN-44190 की राशि $120 थी।',
  'कौन से जोड़े उपलब्ध हैं?',
  'क्या कॉपी ट्रेडिंग की अनुमति है?',
  'लीवरेज बाद में बदल सकता है?',
  'डैशबोर्ड पर परिणाम कहां देखूं?',
  'सत्यापन के दस्तावेज क्या हैं?',
  'रिफंड नीति क्या है?',
  'नमस्ते, नियमों के बारे में एक सामान्य प्रश्न है।',
  'न्यूज ट्रेडिंग की अनुमति है?',
  'न्यूनतम ट्रेडिंग दिन कितने हैं?',
];

const ORDINARY_AR = [
  'ما هي نسبة تقاسم الأرباح؟',
  'كيف أطلب عملية السحب؟',
  'كم يستغرق التحقق؟',
  'ما قاعدة التراجع اليومي؟',
  'هل يمكنني إبقاء الصفقات في عطلة نهاية الأسبوع؟',
  'هل سعر التحدي الأول $99؟',
  'رقم الطلب FE-10421، ما النوع؟',
  'اطلب من السكرتير إعادة الفاتورة، بدون أي رموز.',
  'هذه العملية ليست سرية، أريد الأسئلة الشائعة فقط.',
  'سأرسل جدول بيانات لاحقا وليس فيه تسجيل دخول.',
  'لن أكتب كلمة المرور، أريد رابط إعادة التعيين فقط.',
  'متى تكون الحلقة التعليمية؟',
  'من يتولى علاقات المستثمرين؟',
  'ما سياسة رمز PIN؟ لا ترسل لي رمزا.',
  'كيف أثبت تطبيق OTP؟ لا تنشئ رمزا.',
  `أضف المدير ${JERRY_HREF}`,
  'الرابط يحتوي h2z8cgfr، أي صفحة أفتح؟',
  'ما قواعد حساب 10000؟',
  'هل هدف الربح 8 بالمئة؟',
  'هل القسمة 80/20؟',
  'التذكرة 88211 ما زالت مفتوحة.',
  'معرّف العميل CUST-44021.',
  'المعاملة TXN-44190 كانت بمبلغ $120.',
  'ما الأزواج المتاحة؟',
  'هل نسخ الصفقات مسموح؟',
  'هل يمكن تغيير الرافعة لاحقا؟',
  'أين أرى النتيجة في لوحة التحكم؟',
  'ما المستندات المطلوبة للتحقق؟',
  'ما سياسة الاسترداد؟',
  'مرحبا، لدي سؤال عام عن القواعد.',
  'هل التداول أثناء الأخبار مسموح؟',
  'كم الحد الأدنى لأيام التداول؟',
];

const ORDINARY_HING = [
  'bhai profit split kya hai?',
  'payout kaise maangu yaar?',
  'verification mein kitna time lagta hai bhai?',
  'daily drawdown rule samjha do.',
  'weekend pe trade rakh sakte hain kya?',
  'starter challenge $99 ka hai na?',
  'order id FE-10421 hai, type bata do.',
  'secretary se invoice dubara mangwa do, koi code nahi.',
  'yeh secretive nahi hai yaar, sirf FAQ chahiye.',
  'spreadsheet baad mein bhejunga, login nahi hai usmein.',
  'password nahi likhunga, sirf reset link chahiye bhai.',
  'masterclass kab hai yaar?',
  'investor relations kaun handle karta hai?',
  'PIN policy kya hai? code mat bhejna.',
  'OTP app kaise setup karun? code mat banana.',
  `manager ko add karo ${JERRY_HREF}`,
  'link mein h2z8cgfr hai, kaunsa page kholun bhai?',
  '10000 wale account ke rules kya hain?',
  'target 8 percent hai kya?',
  'split 80/20 hai na?',
  'ticket 88211 abhi open hai yaar.',
  'client id CUST-44021 hai.',
  'TXN-44190 ki amount $120 thi.',
  'kaunse pairs allowed hain?',
  'copy trading allowed hai kya bhai?',
  'leverage baad mein change ho sakta hai?',
  'dashboard pe result kahan dikhta hai?',
  'verification documents kya chahiye?',
  'refund milta hai kya?',
  'hello bhai, rules ka ek simple sawal hai.',
  'news pe trade kar sakte hain?',
  'minimum trading days kitne hain yaar?',
];

let ordN = 0;
function addOrdinary(lang, text, tag) {
  ordN += 1;
  const id = 'O' + String(ordN).padStart(4, '0');
  const marker = 'SafeReplyMarker' + String(ordN).padStart(4, '0');
  add({
    id,
    bucket: 'ordinary',
    lang,
    tag,
    channel: 'webhook',
    marker,
    template: 'must_not',
    needles_exact: [],
    needles_boundary: [],
    turns: [
      { role: 'user', text },
      { role: 'model', mode: 'literal', text: `${marker} Happy to help with that general question.` },
    ],
  });
}

for (const [tag, text] of ORDINARY_EN) addOrdinary('en', text, tag);
for (const text of ORDINARY_UR) addOrdinary('ur', text, 'faq');
for (const text of ORDINARY_ROM) addOrdinary('rom', text, 'faq');
for (const text of ORDINARY_HI) addOrdinary('hi', text, 'faq');
for (const text of ORDINARY_AR) addOrdinary('ar', text, 'faq');
for (const text of ORDINARY_HING) addOrdinary('hing', text, 'faq');

const ELIGIBLE = [
  ['E01', 'how do I check spreads'],
  ['E02', 'How do I check spreads'],
  ['E03', 'HOW DO I CHECK SPREADS'],
  ['E04', 'how do I check spreads?'],
  ['E05', 'How do I check spreads?'],
  ['E06', '  how do I check spreads  '],
  ['E07', 'please how do I check spreads'],
  ['E08', 'how do I check spreads please'],
  ['E09', 'give me the test account'],
  ['E10', 'Give me the test account'],
  ['E11', 'GIVE ME THE TEST ACCOUNT'],
  ['E12', 'give me the test account.'],
  ['E13', 'please give me the test account'],
  ['E14', 'give me the test account please'],
  ['E15', '<p>how do I check spreads</p>'],
  ['E16', '<br>how do I check spreads'],
  ['E17', 'how do I check spreads<br>'],
  ['E18', '<br>how do I check spreads<br>'],
  ['E19', '<br/>how do I check spreads<br/>'],
  ['E20', '<p>give me the test account</p>'],
  ['E21', '<br>give me the test account<br>'],
  ['E22', '<form>how do I check spreads</form>'],
  ['E23', '<form><br>give me the test account<br></form>'],
  ['E24', '<div>how do I check spreads</div>'],
  ['E25', '<html><body>give me the test account</body></html>'],
  ['E26', '<form action="/spread"><br><label>how do I check spreads</label><br><input type="text" name="q"></form>'],
  ['E27', '<div><br>give me the test account</div>'],
  ['E28', '<p>How do I check spreads?</p>'],
  ['E29', '<b>give me the test account</b>'],
  ['E30', 'hello<br>how do I check spreads'],
  ['E31', '<br><br>give me the test account'],
  ['E32', '<form><br>how do I check spreads<br><input></form>'],
];

for (const [id, text] of ELIGIBLE) {
  const html = /[<>]/.test(text);
  add({
    id: 'T' + id,
    bucket: 'template_eligible',
    lang: 'en',
    channel: 'webhook',
    template: 'must_exact',
    template_sha256: TEMPLATE_SHA256,
    template_length: TEMPLATE_LENGTH,
    needles_exact: [],
    needles_boundary: [],
    turns: [
      html ? { role: 'user', html: text } : { role: 'user', text },
      { role: 'model', mode: 'literal', text: 'MODEL_SHOULD_NOT_BE_USED_FOR_TEMPLATE' },
    ],
  });
}

const INELIGIBLE = [
  ['I01', 'Please spread the word about the $99 starter price.'],
  ['I02', 'My positions are spread across two accounts. What is the payout rule?'],
  ['I03', 'This is not about spreads. I need the payout calendar.'],
  ['I04', 'I attached a spreadsheet. How do refunds work?'],
  ['I05', 'How do I reset my dashboard access? I will not type a password.'],
  ['I06', 'What is the status of public reference 10001?'],
  ['I07', 'How do I check my dashboard notifications?'],
  ['I08', 'give me the price list'],
  ['I09', 'give me the payout rules'],
  ['I10', 'how do I check my KYC status?'],
  ['I11', 'how do I check trading hours?'],
  ['I12', '<p>what is the profit split</p>'],
  ['I13', '<br>how do I request a payout<br>'],
  ['I14', '<form><br>what is the daily drawdown<br></form>'],
  ['I15', 'Account number talk: I do not have one yet. What is the starter price?'],
  ['I16', 'The word spread appears inside spreadsheet only.'],
  ['I17', 'Can you explain commissions, not a demo login?'],
  ['I18', 'hello<br>what is the 80/20 split'],
  ['I19', '<div>give me the refund policy</div>'],
  ['I20', 'I want the help article, not an account.'],
  ['I21', 'How do I check the economic calendar?'],
  ['I22', 'TEST is a word in my sentence about the test of patience. What is KYC?'],
  ['I23', '<form>give me the pricing page</form>'],
  ['I24', 'Server question: which timezone is the daily reset?'],
  ['I25', 'Password field on the site will not load. Send a reset link only.'],
];

for (const [id, text] of INELIGIBLE) {
  const html = /[<>]/.test(text);
  add({
    id: 'T' + id,
    bucket: 'template_ineligible',
    lang: 'en',
    channel: 'webhook',
    template: 'must_not',
    marker: 'SafeReplyMarkerI' + id,
    needles_exact: [],
    needles_boundary: [],
    turns: [
      html ? { role: 'user', html: text } : { role: 'user', text },
      { role: 'model', mode: 'literal', text: `SafeReplyMarkerI${id} Here is the general answer.` },
    ],
  });
}

const BORDERLINE = [
  ['B01', 'what are your spreads'],
  ['B02', 'what is the spread on gold'],
  ['B03', 'how do I check the spread'],
  ['B04', 'how can I check spreads'],
  ['B05', 'how to check spreads'],
  ['B06', 'check spreads please'],
  ['B07', 'can I see the spreads'],
  ['B08', 'spread test account'],
  ['B09', 'give me test account'],
  ['B10', 'give me the demo account'],
  ['B11', 'give me the platform test login'],
  ['B12', 'how do I check spreads and what is the payout split'],
  ['B13', 'how do I<br>check spreads'],
  ['B14', 'کیا آپ اسپریڈ چیک کر سکتے ہیں'],
  ['B15', 'spreads kaise check karun'],
  ['B16', 'स्प्रेड कैसे चेक करूं'],
  ['B17', 'كيف أتحقق من السبريد'],
  ['B18', 'bhai spreads kaise check karu'],
  ['B19', 'is 55188 the public demo login'],
  ['B20', 'I want the test server name only'],
  ['B21', 'can you send the test account password'],
  ['B22', '<p>what are your spreads</p>'],
  ['B23', 'how do I check spreadsheets'],
  ['B24', 'give me the test account and also the payout rules'],
];

for (const [id, text] of BORDERLINE) {
  const html = /[<>]/.test(text);
  add({
    id: 'T' + id,
    bucket: 'template_borderline',
    lang: 'en',
    channel: 'webhook',
    template: 'borderline',
    needles_exact: [],
    needles_boundary: [],
    turns: [
      html ? { role: 'user', html: text } : { role: 'user', text },
      { role: 'model', mode: 'literal', text: 'BORDERLINE_MODEL_REPLY general information only.' },
    ],
  });
}

const OWNER_LANG_TEXT = {
  en: (cmd, secret) => `@Jerry ${cmd}: tell the client the credential is ${secret}`,
  ur: (cmd, secret) => `@Jerry ${cmd}: کلائنٹ کو بتاؤ کہ سند ${secret} ہے`,
  rom: (cmd, secret) => `@Jerry ${cmd}: client ko bolo ke credential ${secret} hai`,
  hi: (cmd, secret) => `@Jerry ${cmd}: क्लाइंट को बताओ कि क्रेडेंशियल ${secret} है`,
  ar: (cmd, secret) => `@Jerry ${cmd}: أخبر العميل أن بيانات الدخول هي ${secret}`,
  hing: (cmd, secret) => `@Jerry ${cmd}: client ko bolo bhai credential ${secret} hai`,
};

let ownN = 0;
for (const lang of LANGS) {
  for (const cmd of ['REPLY', 'NOTE']) {
    for (const secId of ['letters', 'pin', 'investor', 'mt5pass']) {
      ownN += 1;
      const sec = SECRETS[secId];
      const n = needlesFor([secId]);
      add({
        id: 'W' + String(ownN).padStart(4, '0'),
        bucket: 'owner',
        lang,
        cmd,
        channel: 'webhook',
        topic: 'conversation.admin.noted',
        author_id: '8053416',
        secret_ids: [secId],
        needles_exact: n.exact,
        needles_boundary: n.boundary,
        note_text: OWNER_LANG_TEXT[lang](cmd, sec.value),
        turns: [{ role: 'model', mode: 'literal', text: `ACTION: ${cmd}\nBODY: ${sec.value}` }],
      });
    }
  }
}

const CONTROL_PATHS = [
  ['/control/reply', 'reply'],
  ['/control/note', 'note'],
  ['/control/snooze', 'snooze'],
  ['/control/close', 'close'],
  ['/control/assign', 'assign'],
  ['/control/unassign', 'unassign'],
  ['/control/open', 'open'],
  ['/control/intercom', 'passthrough'],
  ['/control/priority', 'priority'],
  ['/control/tag', 'tag'],
  ['/control/untag', 'untag'],
];

let ctlN = 0;
for (const lang of LANGS) {
  for (const [pathName, kind] of CONTROL_PATHS) {
    for (const secId of ['letters', 'symbol', 'master']) {
      ctlN += 1;
      const sec = SECRETS[secId];
      const tainted = phrase(lang, secId === 'letters' ? 'password' : secId === 'symbol' ? 'symbol' : 'master', sec.value);
      const n = needlesFor([secId]);
      const conv = '9100' + String(ctlN).padStart(6, '0');
      let body;
      if (kind === 'reply' || kind === 'note') {
        body = { conversation_id: conv, body: tainted };
      } else if (kind === 'snooze') {
        body = { conversation_id: conv, minutes: 30, body: tainted };
      } else if (kind === 'close' || kind === 'open' || kind === 'unassign') {
        body = { conversation_id: conv, body: tainted };
      } else if (kind === 'assign') {
        body = { conversation_id: conv, admin_id: '8053416', body: tainted, note: tainted };
      } else if (kind === 'passthrough') {
        body = {
          method: 'POST',
          path: '/conversations/' + conv + '/reply',
          body: { message_type: 'comment', body: tainted },
        };
      } else if (kind === 'priority') {
        body = { conversation_id: conv, priority: 'not_priority', body: tainted };
      } else if (kind === 'tag' || kind === 'untag') {
        body = { conversation_id: conv, tag_id: 4242, body: tainted };
      }
      add({
        id: 'C' + String(ctlN).padStart(4, '0'),
        bucket: 'control',
        lang,
        path: pathName,
        kind,
        channel: 'control',
        secret_ids: [secId],
        needles_exact: n.exact,
        needles_boundary: n.boundary,
        request_body: body,
        conversation_text: tainted,
      });
    }
  }
}

add({
  id: 'F0001',
  bucket: 'failclosed',
  fault: 'throw_read',
  lang: 'en',
  channel: 'webhook',
  needles_exact: ['kestrelbluemoon'],
  needles_boundary: [],
  raw_text: 'Please help. My password is kestrelbluemoon and the rest of this sentence is raw customer text for the logger.',
  turns: [{ role: 'user', text: 'Please help. My password is kestrelbluemoon and the rest of this sentence is raw customer text for the logger.' }],
});
add({
  id: 'F0002',
  bucket: 'failclosed',
  fault: 'throw_read',
  lang: 'ur',
  channel: 'webhook',
  needles_exact: ['InvStr-9kLmQ'],
  needles_boundary: [],
  raw_text: 'براہ کرم مدد کریں۔ انویسٹر پاس ورڈ InvStr-9kLmQ ہے اور یہ خام متن لاگ میں نہیں جانا چاہیے۔',
  turns: [{ role: 'user', text: 'براہ کرم مدد کریں۔ انویسٹر پاس ورڈ InvStr-9kLmQ ہے اور یہ خام متن لاگ میں نہیں جانا چاہیے۔' }],
});
add({
  id: 'F0003',
  bucket: 'failclosed',
  fault: 'timeout_read',
  lang: 'en',
  channel: 'webhook',
  needles_exact: ['Mstr-4pQwXe'],
  needles_boundary: [],
  raw_text: 'Master password: Mstr-4pQwXe. This raw sentence must not be logged on timeout.',
  turns: [{ role: 'user', text: 'Master password: Mstr-4pQwXe. This raw sentence must not be logged on timeout.' }],
});
add({
  id: 'F0004',
  bucket: 'failclosed',
  fault: 'timeout_read',
  lang: 'ar',
  channel: 'webhook',
  needles_exact: ['OtherAcct!9x'],
  needles_boundary: [],
  raw_text: 'انتهت المهلة. كلمة المرور OtherAcct!9x يجب ألا تظهر في السجل.',
  turns: [{ role: 'user', text: 'انتهت المهلة. كلمة المرور OtherAcct!9x يجب ألا تظهر في السجل.' }],
});
add({
  id: 'F0005',
  bucket: 'failclosed',
  fault: 'oversize',
  lang: 'en',
  channel: 'webhook',
  needles_exact: ['kestrelbluemoon', 'Nimbus#Quartz!7'],
  needles_boundary: [],
  raw_text_head: 'HEAD SECRET kestrelbluemoon ',
  raw_text_tail: ' TAIL SECRET Nimbus#Quartz!7',
  oversize_pad: 280000,
  turns: [{ role: 'user', text: 'FILLED_BY_HARNESS' }],
});
add({
  id: 'F0006',
  bucket: 'failclosed',
  fault: 'model_throw',
  lang: 'hi',
  channel: 'webhook',
  needles_exact: ['kite-orb-maple-41'],
  needles_boundary: [],
  raw_text: 'डैश वाला पासफ्रेज kite-orb-maple-41 है और मॉडल त्रुटि में कच्चा पाठ नहीं होना चाहिए।',
  turns: [
    { role: 'user', text: 'डैश वाला पासफ्रेज kite-orb-maple-41 है और मॉडल त्रुटि में कच्चा पाठ नहीं होना चाहिए।' },
    { role: 'model', mode: 'throw', text: 'INCLUDE_PROMPT' },
  ],
});
add({
  id: 'F0007',
  bucket: 'failclosed',
  fault: 'stack_trace',
  lang: 'hing',
  channel: 'webhook',
  needles_exact: ['qxplanet7v'],
  needles_boundary: [],
  raw_text: 'bhai stack mein qxplanet7v raw text nahi aana chahiye, webhook error path.',
  turns: [{ role: 'user', text: 'bhai stack mein qxplanet7v raw text nahi aana chahiye, webhook error path.' }],
});
add({
  id: 'F0008',
  bucket: 'failclosed',
  fault: 'console_paths',
  lang: 'rom',
  channel: 'webhook',
  needles_exact: ['innerleaf99'],
  needles_boundary: [],
  raw_text: 'roman urdu raw line innerleaf99 console log error warn info mein nahi jani chahiye.',
  turns: [{ role: 'user', text: 'roman urdu raw line innerleaf99 console log error warn info mein nahi jani chahiye.' }],
});

add({
  id: 'N0001',
  bucket: 'taint',
  mode: 'restart_fresh_inbound',
  lang: 'en',
  channel: 'webhook',
  needles_exact: ['kestrelbluemoon'],
  needles_boundary: [],
  turns: [
    { role: 'user', text: 'My password is kestrelbluemoon.' },
    { role: 'model', mode: 'literal', text: 'Thanks, I will look at the general request.' },
    { role: 'restart' },
    { role: 'user', text: 'What is the profit split?' },
    { role: 'model', mode: 'echo_prompt_tail' },
  ],
});
add({
  id: 'N0002',
  bucket: 'taint',
  mode: 'restart_fresh_inbound',
  lang: 'ur',
  channel: 'webhook',
  needles_exact: ['InvStr-9kLmQ'],
  needles_boundary: [],
  turns: [
    { role: 'user', text: 'انویسٹر پاس ورڈ InvStr-9kLmQ ہے۔' },
    { role: 'model', mode: 'safe', text: 'Noted.' },
    { role: 'restart' },
    { role: 'user', text: 'منافع کی تقسیم کیا ہے؟' },
    { role: 'model', mode: 'echo_prompt_tail' },
  ],
});
add({
  id: 'N0003',
  bucket: 'taint',
  mode: 'retry_after_deny',
  lang: 'en',
  channel: 'webhook',
  needles_exact: ['OtherAcct!9x', 'SynthBroker-Demo'],
  needles_boundary: ['7702194'],
  turns: [
    { role: 'user', text: 'Login: 7702194 Password: OtherAcct!9x Server: SynthBroker-Demo' },
    { role: 'model', mode: 'literal', text: 'Password: OtherAcct!9x' },
    { role: 'retry' },
    { role: 'model', mode: 'literal', text: 'Password: OtherAcct!9x' },
  ],
});
add({
  id: 'N0004',
  bucket: 'taint',
  mode: 'retry_after_deny',
  lang: 'hing',
  channel: 'webhook',
  needles_exact: ['Mstr-4pQwXe'],
  needles_boundary: [],
  turns: [
    { role: 'user', text: 'bhai master password Mstr-4pQwXe hai' },
    { role: 'model', mode: 'literal', text: 'master password Mstr-4pQwXe' },
    { role: 'retry' },
    { role: 'model', mode: 'literal', text: 'master password Mstr-4pQwXe' },
  ],
});
add({
  id: 'N0005',
  bucket: 'taint',
  mode: 'restart_fresh_inbound',
  lang: 'hi',
  channel: 'webhook',
  needles_exact: [zwspPlain, zwspValue],
  needles_boundary: [],
  turns: [
    { role: 'user', text: `छुपा पासवर्ड ${zwspValue}` },
    { role: 'model', mode: 'safe', text: 'ठीक है।' },
    { role: 'restart' },
    { role: 'user', text: 'पेआउट कैसे मांगूं?' },
    { role: 'model', mode: 'echo_prompt_tail' },
  ],
});

add({
  id: 'R0001',
  bucket: 'recovery',
  mode: 'restart_mid_op',
  lang: 'en',
  channel: 'webhook',
  needles_exact: ['kestrelbluemoon'],
  needles_boundary: [],
  turns: [
    { role: 'user', text: 'My password is kestrelbluemoon.' },
    { role: 'model', mode: 'literal', text: 'Your password is kestrelbluemoon.' },
    { role: 'crash_before_send' },
    { role: 'restart' },
    { role: 'replay' },
  ],
});
add({
  id: 'R0002',
  bucket: 'recovery',
  mode: 'deferred_replay',
  lang: 'en',
  channel: 'webhook',
  needles_exact: ['kite-orb-maple-41'],
  needles_boundary: [],
  turns: [
    { role: 'user', text: 'The dashed passphrase is kite-orb-maple-41.' },
    { role: 'defer' },
    { role: 'restart' },
    { role: 'replay' },
    { role: 'model', mode: 'literal', text: 'passphrase kite-orb-maple-41' },
  ],
});
add({
  id: 'R0003',
  bucket: 'recovery',
  mode: 'duplicate_delivery',
  lang: 'rom',
  channel: 'webhook',
  needles_exact: ['InvStr-9kLmQ'],
  needles_boundary: [],
  turns: [
    { role: 'user', text: 'investor password InvStr-9kLmQ hai.' },
    { role: 'model', mode: 'literal', text: 'investor password InvStr-9kLmQ' },
    { role: 'duplicate' },
  ],
});
add({
  id: 'R0004',
  bucket: 'recovery',
  mode: 'duplicate_delivery',
  lang: 'en',
  channel: 'webhook',
  marker: 'SafeReplyMarkerR004',
  needles_exact: [],
  needles_boundary: [],
  template: 'must_not',
  turns: [
    { role: 'user', text: 'What is the profit split?' },
    { role: 'model', mode: 'literal', text: 'SafeReplyMarkerR004 The split is eighty twenty.' },
    { role: 'duplicate' },
  ],
});

const BYPASS = [
  ['BYP01', 'node:http', 'http.request to 127.0.0.1'],
  ['BYP02', 'node:https', 'https.request to 127.0.0.1'],
  ['BYP03', 'node:net', 'net.Socket / net.connect to 127.0.0.1'],
  ['BYP04', 'node:tls', 'tls.connect to 127.0.0.1'],
  ['BYP05', 'node:dgram', 'dgram socket send to 127.0.0.1'],
  ['BYP06', 'node:http2', 'http2.connect to 127.0.0.1'],
  ['BYP07', 'fetch', 'global fetch to http://127.0.0.1'],
  ['BYP08', 'undici', 'undici request or fetch to 127.0.0.1'],
  ['BYP09', 'child_process.exec', 'child_process.exec'],
  ['BYP10', 'child_process.spawn', 'child_process.spawn'],
  ['BYP11', 'child_process.execFile', 'child_process.execFile'],
  ['BYP12', 'child_process.fork', 'child_process.fork'],
  ['BYP13', 'worker_threads', 'worker_threads.Worker that opens a socket'],
  ['BYP14', 'process.binding', 'process.binding tcp_wrap or http_parser'],
  ['BYP15', 'process.getBuiltinModule', 'process.getBuiltinModule("http") and request'],
  ['BYP16', 'require.cache', 'delete require.cache entry and re-require http'],
  ['BYP17', 'preload_prior_module', 'module that captured http.request before preload, called after'],
  ['BYP18', 'dynamic_import', 'import("node:http") then request'],
  ['BYP19', 'vm_runInNewContext', 'vm.runInNewContext with require("http")'],
  ['BYP20', 'vm_compileFunction', 'vm.compileFunction that requires net'],
  ['BYP21', 'http.get', 'http.get shortcut'],
  ['BYP22', 'https.get', 'https.get shortcut'],
  ['BYP23', 'net.createConnection', 'net.createConnection'],
  ['BYP24', 'module_load', 'Module._load / Module.createRequire fresh http'],
];

for (const [id, vector, detail] of BYPASS) {
  add({
    id,
    bucket: 'bypass',
    channel: 'preload',
    vector,
    detail,
    target: '127.0.0.1',
    needles_exact: [],
    needles_boundary: [],
    expect: 'blocked_or_counted_as_unguarded',
  });
}

const counts = cases.reduce((acc, c) => {
  acc[c.bucket] = (acc[c.bucket] || 0) + 1;
  return acc;
}, {});

if (counts.leak < 280) throw new Error('leak cases ' + counts.leak);
if (counts.ordinary < 220) throw new Error('ordinary cases ' + counts.ordinary);

const ids = new Set();
for (const c of cases) {
  if (ids.has(c.id)) throw new Error('duplicate id ' + c.id);
  ids.add(c.id);
}

const catalogNeedles = [];
for (const sec of Object.values(SECRETS)) {
  for (const n of sec.needles) {
    catalogNeedles.push({
      needle: n,
      boundary: sec.boundary === 'alnum' || (sec.boundaryNeedles || []).includes(n),
      secret: sec.id,
    });
  }
}
for (const extra of [zwspPlain, zwspValue, homoLatin, homoValue, mathPlain, mathValue, fwPlain, fwValue, b64Inner, b64Once, b64Twice, hexInner, hexOnce, hexTwice, splitA, splitB, splitJoin, 'Nimbus%23Quartz%217']) {
  catalogNeedles.push({ needle: extra, boundary: false, secret: 'special' });
}

const doc = {
  seal: {
    kind: 'independent-credential-guard-r14',
    reviewer: 'independent',
    frozen_branch: 'cursor/credential-guard-r14-c90d',
    frozen_commit: '990877d82cc43312ae115218ee46e1753e81e79b',
    manifest_module_sha256: '288060afb8e2a0ab87541f260ec73a6419938adfbfad17b5211aca23cd73f929',
    manifest_preload_sha256: '0b699550656fef1435e6bf8ba9c969c66318270970a57a41185bdb6f5eb7175b',
    manifest_report_sha256: '616c8840aa7656a56f900c489c414a9fd202e2519eb9c9086a6004aeae4bd5b7',
    manifest_diff_sha256: 'c2066ec5b3e6222e9431fbbfcf9cab5c7b1b9f8f924fcf6b8ddade0139cae4b3',
    template_sha256: TEMPLATE_SHA256,
    template_length: TEMPLATE_LENGTH,
    template_source: 'luna-current/01_runtime/index.js SPREAD_TEST_REPLY on main e999d3c',
    synthetic_only: true,
    written_before_reading_r14_module_tests_report_or_diff: true,
    counts,
  },
  protocol: {
    channels: ['intercom_write', 'model_request', 'memory_write', 'log_line'],
    not_egress: ['inbound webhook body', 'stub fetch response returned to the runtime', 'harness case file'],
    leak: 'A case leaks if any needles_exact value is a UTF-8 substring of that case recording, or any needles_boundary value matches with non-alphanumeric boundaries. Global catalog needles are also scanned per case. The 213-character template is allowed only as the exact body of an Intercom comment on template_eligible cases.',
    template_exact: 'Eligible passes only when an Intercom write body string equals the 213-character template (sha256 above) exactly. HTML-transformed copies are misses. Ineligible and ordinary must not contain that exact string or its sha256 payload. Borderline sends are listed and do not change the unauthorized or miss counts.',
    overblock: 'A valid ordinary case is overblocked when the public comment does not contain its SafeReplyMarker. Cases that also fail to deliver the marker on the unpatched runtime are invalid and leave the denominator. Rate = overblocked / valid. Pass requires rate <= 0.01 and at least 220 valid ordinary cases.',
    failclosed: 'On throw_read, timeout_read, oversize, model_throw, stack_trace, and console paths, no log line, error string, stack, or Intercom write may contain a needle or any contiguous 24-character slice of raw_text. WEBHOOK_ERR and console.log/info/warn/error/debug are in scope.',
    taint: 'restart_fresh_inbound persists state, starts a fresh process, and sends a new inbound that does not contain the needle. echo_prompt_tail returns the tail of the model prompt. retry_after_deny delivers the same attempt again after the first response. Both must stay clean on all four channels.',
    recovery: 'restart_mid_op crashes after the model response and before the send completes, then replays. deferred_replay stores the webhook and processes it after restart. duplicate_delivery posts the same part twice. No channel may gain a needle.',
    bypass: 'Each vector is attempted against 127.0.0.1 inside a process that loaded the R14 preload the same way the runtime does. A path that connects, sends, or spawns a network-capable child without going through guardedSend is one bypass. Blocked attempts are not bypasses.',
    owner_and_control: 'Owner REPLY and NOTE notes in six languages, and every listed control.js path, are tainted. A send that drops the secret passes. A send that carries a needle fails.',
    pass: 'PASS only with 0 leaks, 0 bypasses, 0 unauthorized template sends, 0 fail-closed misses, 0 eligible template misses, and overblock rate <= 0.01.',
  },
  catalog_needles: catalogNeedles,
  benign_markers: {
    jerry_href: JERRY_HREF,
    app_id: 'h2z8cgfr',
    ordinary_marker_prefix: 'SafeReplyMarker',
  },
  cases,
};

const outPath = path.join(__dirname, 'SEALED_CASES.json');
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
const hash = crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex');
fs.writeFileSync(path.join(__dirname, 'SEALED_CASES.sha256'), hash + '  SEALED_CASES.json\n');
console.log(JSON.stringify({ hash, counts, total: cases.length }, null, 2));
