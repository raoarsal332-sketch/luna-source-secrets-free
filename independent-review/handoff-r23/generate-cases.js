'use strict';

/**
 * Independent case author for Handoff R23.
 * This file does not import index.js and does not call handleWebhook.
 * Expectations are the product contract, sealed before any webhook run.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..', '..');
const FAQ_PATH = '/tmp/r23-src/luna-current/01_runtime/fundedelite-faqs.md';
const axiosStub = path.join(__dirname, '.axios-stub.js');
fs.writeFileSync(axiosStub, 'module.exports = function axios() { throw new Error("faq-oracle-network"); };\nmodule.exports.get = module.exports;\n');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'axios') return axiosStub;
  return resolveFilename.call(this, request, parent, isMain, options);
};
process.env.FUNDEDELITE_FAQ_PATH = FAQ_PATH;
const faq = require('/tmp/r23-src/luna-current/01_runtime/faq-kb.js');

const EN = 'A teammate now has this conversation.';
const UR = 'یہ گفتگو اب ایک ساتھی کے پاس ہے۔';
const AR = 'هذه المحادثة الآن لدى أحد الزملاء.';
const HI = 'यह बातचीत अब एक साथी के पास है।';
const IT = 'Un collega ha ora questa conversazione.';
const CHECKING = 'Thanks for the details. I am checking this now and will update you here shortly.';
const POLICY = 'Which part of the password policy should I explain?';
const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const ACCOUNT_EN = 'For MT5, the account number is in the email that was sent with the trading login. Those details cannot be changed.';
const IDENTITY_EN = "I'm an AI assistant for FundedElite. I can help with your questions and involve the support team when needed.";
const SPREAD = [
  'TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server',
  '',
  'Platform: MetaTrader 5',
  'Server: Fundedelite-Server',
  'Account Number: 55188',
  'Password: QBG5FetfozKz7^a?J!',
  '',
  'Use this account to check spreads.',
].join('\n');
const CASEY = '424242';
const ARSAL = '10118526';

const cases = [];
const counts = {};

function push(spec) {
  const bucket = spec.bucket;
  counts[bucket] = (counts[bucket] || 0) + 1;
  cases.push(Object.assign({ id: bucket + '-' + String(counts[bucket]).padStart(4, '0') }, spec));
}

function handoffTurns(text, topic, createdAgo) {
  return [{
    text,
    topic: topic || 'conversation.user.created',
    createdAgo: createdAgo == null ? 5 : createdAgo,
    reply: 'ACTION: REPLY\nI can help with that.',
  }];
}

function expectLine(line, opts) {
  const o = opts || {};
  return {
    perTurn: [{
      commentCount: 1,
      noteCount: o.noteCount == null ? 1 : o.noteCount,
      assignCount: o.assignCount == null ? 1 : o.assignCount,
      exactComments: [line],
      commentStatuses: [200],
      excludes: o.excludes || [],
    }],
    fixedLineSuccessMax: 1,
  };
}

function expectSilent() {
  return {
    perTurn: [{ commentCount: 0, noteCount: 0, assignCount: 0 }],
    fixedLineSuccessMax: 0,
  };
}

const handoffs = [
  ['please get me a human', EN, 'kept'],
  ['I need a live agent', EN, 'kept'],
  ['I want a live agent', EN, 'kept'],
  ['agent please', EN, 'kept'],
  ['human please', EN, 'kept'],
  ['talk to a human', EN, 'kept'],
  ['speak with a person', EN, 'kept'],
  ['connect me to an agent', EN, 'kept'],
  ['please connect me with a manager', EN, 'kept'],
  ['I need to speak to a supervisor', EN, 'kept'],
  ['hi please get me a human', EN, 'kept'],
  ['hello sir I need an agent', EN, 'kept'],
  ['please sir talk to a human', EN, 'kept'],
  ['sir please I want a human', EN, 'kept'],
  ['hi I need a live agent', EN, 'kept'],
  ['please get me a human password: hunter2', EN, 'kept'],
  ['kripya mujhe agent chahiye', UR, 'r23'],
  ['kripaya mujhe agent chahiye', UR, 'r23'],
  ['janab please mujhe agent chahiye', UR, 'kept'],
  ['hi sir please mujhe agent se baat karna hai', UR, 'kept'],
  ['please sir hi kripya mujhe agent chahiye', UR, 'r23'],
  ['namaste mujhe agent chahiye', UR, 'r23'],
  ['assalam mujhe agent chahiye', UR, 'kept'],
  ['assalam mujhe kisi se baat karna hai', UR, 'r23'],
  ['assalam alaikum mujhe kisi se baat karna hai', UR, 'r23'],
  ['mujhe kisi se baat karni hai', UR, 'r23'],
  ['janab mujhe kisi se baat karna hai', UR, 'r23'],
  ['shukriya mujhe insaan chahiye', UR, 'kept'],
  ['meherbani banda chahiye', UR, 'kept'],
  ['adaab mujhe human se baat karna hai', UR, 'kept'],
  ['mujhe agent se baat karna hai', UR, 'kept'],
  ['aap mujhe agent se milao', UR, 'kept'],
  ['janab agent chahiye', UR, 'kept'],
  ['janab hi please mujhe insaan chahiye', UR, 'kept'],
  ['mujhe human chahiye', UR, 'kept'],
  ['mujhe insaan se baat karna hai', UR, 'kept'],
  ['assalam mujhe banda se baat karna hai', UR, 'kept'],
  ['kripya mujhe insaan chahiye', UR, 'r23'],
  ['please mujhe agent chahiye', UR, 'r23'],
  ['sir mujhe agent chahiye', UR, 'r23'],
  ['hi mujhe kisi se baat karna hai', UR, 'r23'],
  ['voglio un operatore', IT, 'kept'],
  ['voglio un agente', IT, 'kept'],
  ['parlare con un operatore', IT, 'kept'],
  ['parlare con una persona', IT, 'kept'],
  ['operatore umano', IT, 'kept'],
  ['assistenza umana', IT, 'kept'],
  ['ciao voglio un operatore', IT, 'kept'],
  ['buongiorno voglio un agente', IT, 'kept'],
  ['voglio parlare con un operatore', IT, 'kept'],
  ['salve voglio un operatore', IT, 'kept'],
  ['grazie voglio un agente', IT, 'kept'],
  ['Vorrei parlare con un umano', EN, 'r23'],
  ['vorrei parlare con un umano', EN, 'r23'],
  ['vorrei collegare un collega', EN, 'r23'],
  ['salve vorrei trasferire a un agente', EN, 'r23'],
  ['grazie vorrei un umano', EN, 'r23'],
  ['buongiorno vorrei parlare con un collega', EN, 'r23'],
  ['ciao vorrei collegare un operatore', EN, 'r23'],
  ['vorrei trasferire questa chat a un collega', EN, 'r23'],
  ['مجھے ایجنٹ چاہیے', UR, 'kept'],
  ['مجھے انسان سے بات کرنی ہے', UR, 'kept'],
  ['بندہ چاہیے', UR, 'kept'],
  ['نمائندہ چاہیے', UR, 'kept'],
  ['آدمی چاہیے', UR, 'kept'],
  ['مجھے staff چاہیے', UR, 'kept'],
  ['مجھے human چاہیے', UR, 'kept'],
  ['أريد موظف', AR, 'kept'],
  ['ابغى اتحدث مع وكيل', AR, 'kept'],
  ['اريد انسان', AR, 'kept'],
  ['حولني الى ممثل', AR, 'kept'],
  ['اريد human', AR, 'kept'],
  ['मुझे एजेंट चाहिए', HI, 'kept'],
  ['मुझे इंसान से बात करनी है', HI, 'kept'],
  ['मुझे agent से बात करनी है', HI, 'kept'],
  ['मुझे staff से बात करनी है', HI, 'kept'],
  ['मुझे banda चाहिए', HI, 'kept'],
  ['मुझे insaan से बात करनी है', HI, 'kept'],
  ['मुझे representative चाहिए', HI, 'kept'],
  ['मुझे support person से बात करनी है', HI, 'kept'],
  ['मुझे human से बात करनी है', HI, 'kept'],
  ['je voudrais parler avec un agent', EN, 'kept'],
  ['bonjour je voudrais parler a un humain', EN, 'kept'],
  ['je veux parler avec un conseiller', EN, 'kept'],
  ['bonsoir je voudrais un operateur', EN, 'kept'],
  ['ich moechte mit einem mitarbeiter sprechen', EN, 'kept'],
  ['hallo ich moechte einen menschen sprechen', EN, 'kept'],
  ['bitte mit einem berater sprechen', EN, 'kept'],
  ['danke ich moechte einen agent', EN, 'kept'],
  ['hola quiero hablar con un agente', EN, 'kept'],
  ['hola quiero hablar con un humano', EN, 'kept'],
  ['quiero hablar con un asesor', EN, 'kept'],
  ['gracias quiero hablar con una persona', EN, 'kept'],
  ['ola quero falar com um agente', EN, 'kept'],
  ['ola quero falar com um humano', EN, 'kept'],
  ['quero falar com um atendente', EN, 'kept'],
  ['obrigado quero falar com uma pessoa', EN, 'kept'],
  ['merhaba bir temsilci ile konusmak istiyorum', EN, 'kept'],
  ['lutfen bir operator ile konusmak istiyorum', EN, 'kept'],
  ['tesekkur bir insan ile konusmak istiyorum', EN, 'kept'],
  ['merhaba temsilci istiyorum', EN, 'kept'],
  ['hallo ik wil met een medewerker spreken', EN, 'kept'],
  ['hallo ik wil met een mens spreken', EN, 'kept'],
  ['alstublieft wil ik een agent', EN, 'kept'],
  ['dank ik wil spreken met een persoon', EN, 'kept'],
  ['prosze chce rozmawiac z konsultantem', EN, 'kept'],
  ['dzien dobry chce rozmawiac z agentem', EN, 'kept'],
  ['dziekuje chce czlowieka', EN, 'kept'],
  ['prosze polaczyc mnie z konsultantem', EN, 'kept'],
  ['halo saya ingin bicara dengan agen', EN, 'kept'],
  ['tolong saya ingin bicara dengan manusia', EN, 'kept'],
  ['terima kasih saya ingin petugas', EN, 'kept'],
  ['halo ingin bicara dengan orang', EN, 'kept'],
  ['я хочу говорить с оператором', EN, 'kept'],
  ['хочу человека', EN, 'kept'],
  ['соедините с сотрудником', EN, 'kept'],
  ['переведите на агента', EN, 'kept'],
  ['我要转接人工', EN, 'kept'],
  ['请接客服', EN, 'kept'],
  ['我要人工客服', EN, 'kept'],
  ['转给代理人', EN, 'kept'],
  ['担当者と話したい', EN, 'kept'],
  ['オペレーターにつなぐ', EN, 'kept'],
  ['人間と話したい', EN, 'kept'],
];

for (const row of handoffs) {
  const text = row[0];
  const line = row[1];
  const intent = row[2];
  const secret = /hunter2/.test(text) ? ['hunter2'] : [];
  push({
    bucket: 'multilingual',
    intent,
    gates: ['product-critical'].concat(secret.length ? ['leaks'] : []),
    turns: handoffTurns(text, 'conversation.user.created', 5),
    expect: expectLine(line, { excludes: secret }),
    secretsAbsent: secret,
  });
  push({
    bucket: 'multilingual',
    intent,
    gates: ['product-critical'].concat(secret.length ? ['leaks'] : []),
    turns: handoffTurns(text, 'conversation.user.replied', 5000),
    expect: expectLine(line, { excludes: secret }),
    secretsAbsent: secret,
  });
}

const silentTexts = [
  'hello',
  'hi',
  'hey',
  'ciao',
  'assalam',
  'assalam kisi',
  'kisi',
  'namaste',
  'thanks',
  'what are the trading days?',
];
for (const text of silentTexts) {
  push({
    bucket: 'multilingual',
    intent: 'kept',
    gates: ['product-critical'],
    turns: handoffTurns(text, 'conversation.user.created', 5),
    expect: expectSilent(),
    note: 'user.created without a handoff ask stays in the Fin wait and posts nothing',
  });
}

push({
  bucket: 'multilingual',
  intent: 'kept',
  gates: ['product-critical'],
  turns: handoffTurns('please get me a human', 'conversation.user.replied', 5),
  expect: expectSilent(),
  note: 'fresh user.replied still waits for Fin unless the live-agent phrase matches',
});

const policyAsks = [
  'What password criteria do you use?',
  'what is the password policy?',
  'what are the password requirements?',
  'what are the password rules?',
  'what is the password criteria?',
  'what is the password requirement?',
  'what are the password rule?',
  'Can you explain the password policy?',
  'please explain the password requirements',
  'which password rules apply?',
];
const policyContexts = [
  ['conversation.user.created', 5, 'ACTION: REPLY\n', 'created-fresh'],
  ['conversation.user.replied', 5, 'ACTION: REPLY\n', 'replied-fresh'],
  ['conversation.user.replied', 5000, 'ACTION: REPLY\n', 'replied-old-empty'],
  ['conversation.user.replied', 5000, 'ACTION: REPLY\n' + HEDGE, 'replied-old-hedge'],
];
for (const ask of policyAsks) {
  for (const ctx of policyContexts) {
    push({
      bucket: 'password',
      intent: 'kept',
      gates: ['product-critical'],
      turns: [{ text: ask, topic: ctx[0], createdAgo: ctx[1], reply: ctx[2] }],
      expect: {
        perTurn: [{ commentCount: 1, exactComments: [POLICY], excludes: [EN, CHECKING, HEDGE] }],
        fixedLineSuccessMax: 0,
      },
      note: ctx[3],
    });
  }
  push({
    bucket: 'password',
    intent: 'kept',
    gates: ['product-critical'],
    turns: [{
      text: ask,
      topic: 'conversation.user.replied',
      createdAgo: 5000,
      reply: 'ACTION: REPLY\nUse at least eight characters and a number.',
    }],
    expect: {
      perTurn: [{
        commentCount: 1,
        includes: ['eight characters'],
        excludes: [POLICY, EN, CHECKING],
      }],
      fixedLineSuccessMax: 0,
    },
    note: 'a usable password-policy draft is posted',
  });
}

for (const ask of ['what is your refund policy?', 'how do payouts work?', 'what are the trading days?']) {
  push({
    bucket: 'password',
    intent: 'kept',
    gates: ['product-critical'],
    turns: [{
      text: ask,
      topic: 'conversation.user.replied',
      createdAgo: 5000,
      reply: 'ACTION: REPLY\nPayouts follow the published schedule.',
    }],
    expect: {
      perTurn: [{
        commentCount: 1,
        includes: ['published schedule'],
        excludes: [POLICY, EN],
      }],
      fixedLineSuccessMax: 0,
    },
  });
}

function numberTurn(customer, draft) {
  return [{
    text: customer,
    topic: 'conversation.user.replied',
    createdAgo: 5000,
    reply: 'ACTION: REPLY\nTrading days are Monday through Friday. ' + draft,
  }];
}

const prefixes = [
  ['Login', '11261000'],
  ['login', '11261001'],
  ['LOGIN', '11261002'],
  ['acct', '11261291'],
  ['account', '11261292'],
  ['Account', '11261293'],
  ['MT5', '11261194'],
  ['mt5', '11261195'],
  ['MT4', '11264001'],
  ['mt4', '11264002'],
  ['id', '11265001'],
  ['ID', '11265002'],
  ['user', '11266001'],
  ['User', '11266002'],
  ['no', '11267001'],
  ['NO', '11267002'],
];

for (const pair of prefixes) {
  const token = pair[0] + pair[1];
  const digits = pair[1];
  push({
    bucket: 'numbers',
    intent: 'r23',
    gates: ['product-critical', 'over-redaction'],
    turns: numberTurn('what are the trading days? my login is 50123456', token + ' order FE10482931 https://pay.example/receipts/FE10482931'),
    expect: {
      perTurn: [{
        commentCount: 1,
        includes: [CHECKING],
        excludes: [digits, token, '77889900'],
      }],
    },
    note: 'unstated account-prefix token is replaced by the checking line',
  });
  push({
    bucket: 'numbers',
    intent: 'r23',
    gates: ['product-critical', 'over-redaction'],
    turns: numberTurn(
      'what are the trading days? my login is ' + token,
      token + ' order FE10482931 https://pay.example/receipts/99881122'
    ),
    expect: {
      perTurn: [{
        commentCount: 1,
        includes: [token, 'FE10482931', 'https://pay.example/receipts/99881122'],
        excludes: [CHECKING, '[secret]'],
      }],
    },
    note: 'customer-stated account-prefix token, FE order id, and receipt URL pass',
  });
}

push({
  bucket: 'numbers',
  intent: 'r23',
  gates: ['product-critical', 'over-redaction'],
  turns: numberTurn('what are the trading days? my login is 50123456', 'MT50123456'),
  expect: {
    perTurn: [{ commentCount: 1, includes: ['MT50123456'], excludes: [CHECKING, '[secret]'] }],
  },
  note: 'stated 50123456 covers the MT5-prefixed login',
});

push({
  bucket: 'numbers',
  intent: 'r23',
  gates: ['product-critical'],
  turns: numberTurn('what are the trading days? my login is 11261194', 'MT511261194'),
  expect: {
    perTurn: [{ commentCount: 1, includes: ['11261194'], excludes: [CHECKING] }],
  },
  note: 'stated glued login 11261194 covers MT511261194',
});

push({
  bucket: 'numbers',
  intent: 'r23',
  gates: ['product-critical'],
  turns: numberTurn('what are the trading days? my login is 50123456', 'MT511261194'),
  expect: {
    perTurn: [{ commentCount: 1, includes: [CHECKING], excludes: ['11261194', '511261194', 'MT511261194'] }],
  },
  note: 'a different number does not cover MT511261194',
});

const bareForeign = ['77889900', '66001122', '44556677', '99001122', '123456789', '10000001'];
for (const bare of bareForeign) {
  push({
    bucket: 'numbers',
    intent: 'kept',
    gates: ['product-critical'],
    turns: numberTurn('what are the trading days? my login is 50123456', 'Account ' + bare + '.'),
    expect: {
      perTurn: [{ commentCount: 1, includes: [CHECKING], excludes: [bare] }],
    },
  });
  push({
    bucket: 'numbers',
    intent: 'kept',
    gates: ['product-critical', 'over-redaction'],
    turns: numberTurn('what are the trading days? my login is ' + bare, 'Your login ' + bare + ' is active.'),
    expect: {
      perTurn: [{ commentCount: 1, includes: [bare], excludes: [CHECKING, '[secret]'] }],
    },
  });
}

const orders = ['FE10482931', 'FE-10482931', 'fe10482932', 'FE99887766'];
for (const order of orders) {
  push({
    bucket: 'numbers',
    intent: 'kept',
    gates: ['product-critical', 'over-redaction'],
    turns: numberTurn('what are the trading days? my login is 50123456 order ' + order, 'order ' + order),
    expect: {
      perTurn: [{ commentCount: 1, includes: [order.replace('fe', 'fe'), order], excludes: [CHECKING, '[secret]'] }],
    },
  });
}

const receipts = [
  'https://pay.example/receipts/99881122',
  'http://pay.example/r/445566',
  'https://files.example/invoice/1234567890',
];
for (const url of receipts) {
  push({
    bucket: 'numbers',
    intent: 'kept',
    gates: ['product-critical', 'over-redaction'],
    turns: numberTurn('what are the trading days? my login is 50123456', 'receipt ' + url),
    expect: {
      perTurn: [{ commentCount: 1, includes: [url], excludes: [CHECKING, '[secret]'] }],
    },
  });
}

push({
  bucket: 'numbers',
  intent: 'r23',
  gates: ['product-critical'],
  turns: numberTurn(
    'what are the trading days? my login is 50123456 and FE10482931',
    'Login11261000 MT511261194 acct11261291 order FE10482931 https://pay.example/receipts/FE10482931'
  ),
  expect: {
    perTurn: [{
      commentCount: 1,
      includes: [CHECKING],
      excludes: ['11261000', '11261194', '511261194', '11261291'],
    }],
  },
});

push({
  bucket: 'numbers',
  intent: 'r23',
  gates: ['product-critical', 'over-redaction'],
  turns: numberTurn(
    'what are the trading days? my login is Login11261000 and MT511261194 and acct11261291',
    'Login11261000 MT511261194 acct11261291 order FE10482931 https://pay.example/receipts/FE10482931'
  ),
  expect: {
    perTurn: [{
      commentCount: 1,
      includes: ['Login11261000', 'MT511261194', 'acct11261291', 'FE10482931', 'https://pay.example/receipts/FE10482931'],
      excludes: [CHECKING, '[secret]'],
    }],
  },
});

for (const labeled of ['order id 77889911', 'invoice number 77889912', 'receipt no 77889913']) {
  push({
    bucket: 'numbers',
    intent: 'r23',
    gates: ['product-critical'],
    turns: numberTurn('what are the trading days? my login is 50123456', labeled),
    expect: {
      perTurn: [{ commentCount: 1, includes: [CHECKING], excludes: ['77889911', '77889912', '77889913'] }],
    },
    note: 'a non-FE order label is not an order-id exemption',
  });
}

const labels = ['password', 'passcode', 'passphrase', 'passwd', 'pwd', 'pass', 'otp', 'pin', 'token', 'secret', 'api key', '2fa', 'mfa'];
let secretN = 0;
function nextSecret() {
  secretN += 1;
  return 'FE8' + String(1000000 + secretN);
}
for (const label of labels) {
  const secret = nextSecret();
  const order = 'FE10482931';
  push({
    bucket: 'secrets',
    intent: 'kept',
    gates: ['leaks', 'over-redaction', 'product-critical'],
    turns: [{
      text: 'what are the trading days? login 50123456 order ' + order + ' ' + label + ': ' + secret,
      topic: 'conversation.user.replied',
      createdAgo: 5000,
      reply: 'ACTION: REPLY\nTrading days are Monday through Friday. Login 50123456 order ' + order + ' ref ' + secret + '.',
    }],
    expect: {
      perTurn: [{
        commentCount: 1,
        includes: ['[secret]', order, '50123456'],
        excludes: [secret, CHECKING],
      }],
    },
    secretsAbsent: [secret],
  });
  const zw = label.split('').join('\u200b');
  const secretZ = nextSecret();
  push({
    bucket: 'secrets',
    intent: 'kept',
    gates: ['leaks'],
    turns: [{
      text: 'what are the trading days? ' + zw + ': ' + secretZ,
      topic: 'conversation.user.replied',
      createdAgo: 5000,
      reply: 'ACTION: REPLY\nTrading days are Monday through Friday. Ref ' + secretZ + '.',
    }],
    expect: {
      perTurn: [{ commentCount: 1, includes: ['[secret]'], excludes: [secretZ] }],
    },
    secretsAbsent: [secretZ],
    note: 'ZWSP inside the credential label',
  });
}

const scriptLabels = [
  ['پاس ورڈ', 'urdu-label'],
  ['پاسورڈ', 'urdu-joined'],
  ['पासवर्ड', 'hindi-label'],
  ['كلمة المرور', 'arabic-label'],
  ['गुप्तशब्द', 'hindi-secret-word'],
];
for (const row of scriptLabels) {
  const secret = nextSecret();
  push({
    bucket: 'secrets',
    intent: 'kept',
    gates: ['leaks'],
    turns: [{
      text: 'what are the trading days? ' + row[0] + ': ' + secret,
      topic: 'conversation.user.replied',
      createdAgo: 5000,
      reply: 'ACTION: REPLY\nTrading days are Monday through Friday. Ref ' + secret + '.',
    }],
    expect: {
      perTurn: [{ commentCount: 1, includes: ['[secret]'], excludes: [secret] }],
    },
    secretsAbsent: [secret],
    note: row[1],
  });
}

const fullwidth = nextSecret();
push({
  bucket: 'secrets',
  intent: 'kept',
  gates: ['leaks'],
  turns: [{
    text: 'what are the trading days? \uff50\uff41\uff53\uff53\uff57\uff4f\uff52\uff44: ' + fullwidth,
    topic: 'conversation.user.replied',
    createdAgo: 5000,
    reply: 'ACTION: REPLY\nTrading days are Monday through Friday. Ref ' + fullwidth + '.',
  }],
  expect: {
    perTurn: [{ commentCount: 1, includes: ['[secret]'], excludes: [fullwidth] }],
  },
  secretsAbsent: [fullwidth],
  note: 'fullwidth password label folds under NFKC',
});

const cyr = nextSecret();
push({
  bucket: 'secrets',
  intent: 'kept',
  gates: ['leaks'],
  turns: [{
    text: 'what are the trading days? p\u0430ssword: ' + cyr,
    topic: 'conversation.user.replied',
    createdAgo: 5000,
    reply: 'ACTION: REPLY\nTrading days are Monday through Friday. Ref ' + cyr + '.',
  }],
  expect: {
    perTurn: [{ commentCount: 1, excludes: [cyr] }],
  },
  secretsAbsent: [cyr],
  note: 'Cyrillic homoglyph inside the password label',
});

const zwValue = 'FE81' + '00099';
push({
  bucket: 'secrets',
  intent: 'kept',
  gates: ['leaks', 'over-redaction'],
  turns: [{
    text: 'what are the trading days? pin: FE\u200b81\u200b00099 order FE10482931',
    topic: 'conversation.user.replied',
    createdAgo: 5000,
    reply: 'ACTION: REPLY\nTrading days are Monday through Friday. Ref FE8100099 order FE10482931.',
  }],
  expect: {
    perTurn: [{
      commentCount: 1,
      includes: ['FE10482931'],
      excludes: ['FE8100099', 'FE\u200b81\u200b00099'],
    }],
  },
  secretsAbsent: ['FE8100099'],
  note: 'ZWSP inside a declared pin value',
});

const reused = 'FE81000000';
push({
  bucket: 'secrets',
  intent: 'kept',
  gates: ['leaks', 'over-redaction'],
  turns: [
    {
      id: 'declared-reuse',
      text: 'what are the trading days? login 50123456 order FE10482931 pin: ' + reused,
      topic: 'conversation.user.replied',
      createdAgo: 5000,
      reply: 'ACTION: REPLY\nTrading days are Monday through Friday. Login 50123456 order FE10482931 pin ' + reused + '.',
    },
    {
      id: 'declared-reuse-later',
      text: 'what hours does the market use?',
      topic: 'conversation.user.replied',
      createdAgo: 5000,
      reply: 'ACTION: REPLY\nMarket hours follow the symbol. Ref ' + reused + ' order FE10482931.',
    },
  ],
  expect: {
    perTurn: [
      { commentCount: 1, includes: ['[secret]', 'FE10482931', '50123456'], excludes: [reused, CHECKING] },
      { commentCount: 1, includes: ['[secret]', 'FE10482931'], excludes: [reused, CHECKING] },
    ],
  },
  secretsAbsent: [reused],
});

const restartPin = 'FE82000000';
push({
  bucket: 'secrets',
  intent: 'r23',
  gates: ['leaks', 'over-redaction', 'recovery'],
  mode: 'restart',
  phases: [
    {
      expectExit: 86,
      turns: [{
        id: 'restart-pin',
        text: 'please get me a human pin: ' + restartPin,
        topic: 'conversation.user.created',
        createdAgo: 5,
        reply: 'ACTION: REPLY\nI can help with that.',
        dieOnComment: true,
      }],
    },
    {
      turns: [{
        id: 'restart-pin',
        text: 'any update?',
        topic: 'conversation.user.replied',
        createdAgo: 5000,
        reply: 'ACTION: REPLY\nRef ' + restartPin,
        keepAssignee: true,
        assignee: CASEY,
        sourceBody: 'please get me a human pin: ' + restartPin,
        extraParts: [
          { kind: 'note', ago: 30, body: 'Account: <br>Problem: please get me a human pin: [secret]' },
          { kind: 'assignment', ago: 20, assignee: CASEY },
        ],
      }],
    },
  ],
  expect: {
    phase: 1,
    perTurn: [{
      commentCount: 1,
      exactComments: [EN],
      noteCount: 0,
      assignCount: 0,
      excludes: [restartPin],
    }],
    fixedLineSuccessMax: 1,
  },
  secretsAbsent: [restartPin],
  note: 'subprocess exit then the next process posts the owed line and keeps the pin scrubbed',
});

const restartEcho = 'FE83000000';
push({
  bucket: 'secrets',
  intent: 'r23',
  gates: ['leaks', 'over-redaction'],
  mode: 'restart',
  phases: [
    {
      expectExit: 0,
      turns: [{
        id: 'restart-echo-1',
        text: 'what are the trading days? pin: ' + restartEcho,
        topic: 'conversation.user.replied',
        createdAgo: 5000,
        reply: 'ACTION: REPLY\nTrading days are Monday through Friday.',
      }],
    },
    {
      turns: [{
        id: 'restart-echo-2',
        text: 'what hours does the market use?',
        topic: 'conversation.user.replied',
        createdAgo: 5000,
        reply: 'ACTION: REPLY\nMarket hours follow the symbol. Ref ' + restartEcho + ' order FE10482931.',
      }],
    },
  ],
  expect: {
    phase: 1,
    perTurn: [{
      commentCount: 1,
      includes: ['[secret]', 'FE10482931'],
      excludes: [restartEcho, CHECKING],
    }],
  },
  secretsAbsent: [restartEcho],
  note: 'declared pin stays scrubbed after a new process, unlabeled order id passes',
});

const failStatuses = ['400', '403', '404', '409', '422', '429', '500', 'timeout', '401', '408', '502', '503'];
const followups = ['just checking in', 'any update?', 'still waiting', 'hello again', 'one more'];
const recoveryAsks = [
  ['please get me a human', EN],
  ['kripya mujhe agent chahiye', UR],
  ['voglio un operatore', IT],
  ['Vorrei parlare con un umano', EN],
  ['مجھے ایجنٹ چاہیے', UR],
];

for (const status of failStatuses) {
  for (const follow of followups) {
    for (const ask of recoveryAsks) {
      const statusName = status === 'timeout' ? 'timeout' : Number(status);
      push({
        bucket: 'recovery',
        intent: status === '429' ? 'r23' : 'kept',
        gates: ['recovery', 'duplicates', 'product-critical'],
        turns: [
          {
            text: ask[0],
            topic: 'conversation.user.created',
            createdAgo: 5,
            reply: 'ACTION: REPLY\nI can help with that.',
            failComment: status,
            keepAssignee: true,
          },
          {
            text: follow,
            topic: 'conversation.user.replied',
            createdAgo: 5000,
            reply: 'ACTION: REPLY\nI can help with that.',
            keepAssignee: true,
          },
        ],
        expect: {
          perTurn: [
            {
              commentCount: 1,
              noteCount: 1,
              assignCount: 1,
              commentStatuses: [statusName],
              exactComments: [ask[1]],
            },
            {
              commentCount: 1,
              noteCount: 0,
              assignCount: 0,
              commentStatuses: [200],
              exactComments: [ask[1]],
            },
          ],
          fixedLineSuccessMax: 1,
        },
        note: 'comment ' + status + ' then one owed line',
      });
    }
  }
}

for (const status of ['400', '403', '404', '409', '422', '500', 'timeout', '429']) {
  push({
    bucket: 'recovery',
    intent: 'kept',
    gates: ['recovery', 'duplicates', 'product-critical'],
    turns: [0, 1, 2, 3, 4, 5].map((n) => ({
      text: n === 0 ? 'please get me a human' : 'still waiting ' + n,
      topic: n === 0 ? 'conversation.user.created' : 'conversation.user.replied',
      createdAgo: n === 0 ? 5 : 5000,
      reply: 'ACTION: REPLY\nI can help with that.',
      failComment: n < 5 ? status : '',
      keepAssignee: true,
    })),
    expect: {
      perTurn: [0, 1, 2, 3, 4, 5].map((n) => (n < 5
        ? {
          commentCount: 1,
          noteCount: n === 0 ? 1 : 0,
          assignCount: n === 0 ? 1 : 0,
          commentStatuses: [status === 'timeout' ? 'timeout' : Number(status)],
        }
        : { commentCount: 0, noteCount: 0, assignCount: 0 })),
      fixedLineSuccessMax: 0,
    },
    note: 'five failed comment attempts then the bound posts nothing',
  });
}

for (const status of failStatuses) {
  push({
    bucket: 'recovery',
    intent: 'kept',
    gates: ['recovery', 'duplicates'],
    turns: [
      {
        text: 'please get me a human',
        topic: 'conversation.user.created',
        createdAgo: 5,
        reply: 'ACTION: REPLY\nI can help with that.',
        failComment: status,
        keepAssignee: true,
      },
      {
        text: 'any update?',
        topic: 'conversation.user.replied',
        createdAgo: 5000,
        reply: 'ACTION: REPLY\nI can help with that.',
        keepAssignee: true,
        assignee: CASEY,
        extraParts: [{ kind: 'assignment', ago: 20, assignee: CASEY }],
      },
    ],
    expect: {
      perTurn: [
        { commentCount: 1, noteCount: 1, assignCount: 1 },
        { commentCount: 1, noteCount: 0, assignCount: 0, exactComments: [EN], commentStatuses: [200] },
      ],
      fixedLineSuccessMax: 1,
    },
    note: 'removed note, assignment remains, owed line posts once',
  });
  push({
    bucket: 'recovery',
    intent: 'kept',
    gates: ['recovery', 'duplicates', 'product-critical'],
    turns: [
      {
        text: 'please get me a human',
        topic: 'conversation.user.created',
        createdAgo: 5,
        reply: 'ACTION: REPLY\nI can help with that.',
        failComment: status,
        keepAssignee: true,
      },
      {
        text: 'any update?',
        topic: 'conversation.user.replied',
        createdAgo: 5000,
        reply: 'ACTION: REPLY\nI can help with that.',
        keepAssignee: true,
        assignee: CASEY,
        extraParts: [{ kind: 'human', ago: 12, body: 'I am taking this from here.' }],
      },
    ],
    expect: {
      perTurn: [
        { commentCount: 1 },
        { commentCount: 0, noteCount: 0, assignCount: 0, excludes: [EN] },
      ],
      fixedLineSuccessMax: 0,
    },
    note: 'a human comment during recovery posts no owed line',
  });
}

const wiped = [
  ['please get me a human', EN, 'kept'],
  ['مجھے ایجنٹ چاہیے', UR, 'r23'],
  ['मुझे एजेंट चाहिए', HI, 'kept'],
  ['أريد موظف', AR, 'kept'],
  ['voglio un operatore', IT, 'kept'],
  ['Vorrei parlare con un umano', EN, 'r23'],
  ['kripya mujhe agent chahiye', UR, 'r23'],
  ['assalam mujhe kisi se baat karna hai', UR, 'r23'],
  ['janab please mujhe agent chahiye', UR, 'kept'],
  ['ciao voglio un operatore', IT, 'kept'],
];
for (const row of wiped) {
  push({
    bucket: 'recovery',
    intent: row[2],
    gates: ['recovery', 'product-critical', 'duplicates'],
    turns: [{
      text: 'any update?',
      topic: 'conversation.user.replied',
      createdAgo: 5000,
      reply: 'ACTION: REPLY\nI can help with that.',
      keepAssignee: true,
      assignee: CASEY,
      sourceBody: row[0],
      extraParts: [{ kind: 'assignment', ago: 20, assignee: CASEY }],
    }],
    expect: {
      perTurn: [{
        commentCount: 1,
        noteCount: 0,
        assignCount: 0,
        exactComments: [row[1]],
        commentStatuses: [200],
      }],
      fixedLineSuccessMax: 1,
    },
    note: 'wiped store takes language from the conversation, not the status ping',
  });
}

push({
  bucket: 'recovery',
  intent: 'r23',
  gates: ['recovery', 'duplicates'],
  mode: 'restart',
  phases: [
    {
      expectExit: 86,
      turns: [{
        id: 'restart-owed',
        text: 'please get me a human',
        topic: 'conversation.user.created',
        createdAgo: 5,
        reply: 'ACTION: REPLY\nI can help with that.',
        dieOnComment: true,
        keepAssignee: true,
      }],
    },
    {
      turns: [{
        id: 'restart-owed',
        text: 'any update?',
        topic: 'conversation.user.replied',
        createdAgo: 5000,
        reply: 'ACTION: REPLY\nI can help with that.',
        keepAssignee: true,
        assignee: CASEY,
        sourceBody: 'please get me a human',
        extraParts: [
          { kind: 'note', ago: 30, body: 'Account: <br>Problem: please get me a human' },
          { kind: 'assignment', ago: 20, assignee: CASEY },
        ],
      }],
    },
  ],
  expect: {
    phase: 1,
    perTurn: [{
      commentCount: 1,
      noteCount: 0,
      assignCount: 0,
      exactComments: [EN],
      commentStatuses: [200],
    }],
    fixedLineSuccessMax: 1,
  },
  note: 'a dead process does not swallow the owed reply',
});

for (const follow of followups) {
  push({
    bucket: 'recovery',
    intent: 'kept',
    gates: ['duplicates', 'recovery'],
    turns: [
      {
        text: 'please get me a human',
        topic: 'conversation.user.created',
        createdAgo: 5,
        reply: 'ACTION: REPLY\nI can help with that.',
        keepAssignee: true,
      },
      {
        text: follow,
        topic: 'conversation.user.replied',
        createdAgo: 5000,
        reply: 'ACTION: REPLY\nA teammate now has this conversation.',
        keepAssignee: true,
        assignee: CASEY,
      },
    ],
    expect: {
      perTurn: [
        { commentCount: 1, exactComments: [EN], commentStatuses: [200] },
        { excludes: [] },
      ],
      fixedLineSuccessMax: 1,
    },
    note: 'after the line lands, a later turn does not post it again',
  });
}

const spreadAsks = [
  'can you check the spreads?',
  'what are the spreads?',
  'what is the spread?',
  'I want a spread test account',
  'show me the spreads',
  'give me a spread check account',
  'how do I test the spreads?',
  'please check spreads on MT5',
];
for (const ask of spreadAsks) {
  for (const topic of ['conversation.user.created', 'conversation.user.replied']) {
    push({
      bucket: 'mt5',
      intent: 'kept',
      gates: ['product-critical'],
      turns: [{
        text: ask,
        topic,
        createdAgo: topic === 'conversation.user.created' ? 5 : 5000,
        reply: 'ACTION: REPLY\nI will not send the template.',
      }],
      expect: {
        perTurn: [{
          commentCount: 1,
          exactComments: [SPREAD],
          includes: ['55188', 'Fundedelite-Server', 'QBG5FetfozKz7^a?J!'],
          excludes: [CHECKING, HEDGE, EN],
        }],
      },
    });
  }
}

const spreadBlocked = [
  'what are the trading days?',
  'my positions are spread across two accounts',
  'this is not about the spreads',
  'I cannot log in and my password was regenerated',
  'what is my mt5 login password for account 50123456',
];
for (const ask of spreadBlocked) {
  push({
    bucket: 'mt5',
    intent: 'kept',
    gates: ['product-critical', 'leaks'],
    turns: [{
      text: ask,
      topic: 'conversation.user.replied',
      createdAgo: 5000,
      reply: 'ACTION: REPLY\n' + SPREAD,
    }],
    expect: {
      perTurn: [{
        commentCount: 1,
        includes: [HEDGE],
        excludes: ['55188', 'QBG5FetfozKz7', CHECKING, SPREAD],
      }],
    },
    secretsAbsent: ['QBG5FetfozKz7^a?J!'],
    note: 'ineligible MT5 55188 template is hedged',
  });
}

function faqBody(question) {
  const hit = faq.selectApprovedAnswer(question);
  if (!hit || !hit.body) throw new Error('no faq body for ' + question);
  return String(hit.body).trim();
}

const faqQuestions = [
  'what is the daily loss limit',
  'how does the profit target work',
  'what is the leverage',
  'What is the daily loss limit?',
  'How does the profit target work?',
  'What is the leverage?',
  'How does the challenge work?',
];
for (const question of faqQuestions) {
  const body = faqBody(question);
  push({
    bucket: 'faq',
    intent: 'kept',
    gates: ['product-critical'],
    turns: [{
      text: question,
      topic: 'conversation.user.replied',
      createdAgo: 5000,
      reply: 'ACTION: REPLY\n[secret] should not replace the article',
    }],
    expect: {
      perTurn: [{
        commentCount: 1,
        exactComments: [body],
        excludes: ['[secret]', EN, CHECKING, HEDGE],
      }],
    },
    note: 'faq bytes ' + body.length + ' zwsp ' + body.includes('\u200b'),
  });
}

push({
  bucket: 'faq',
  intent: 'kept',
  gates: ['product-critical'],
  turns: [
    {
      text: 'What password criteria do you use?',
      topic: 'conversation.user.created',
      createdAgo: 5,
      reply: 'ACTION: REPLY\n[secret] should not be here',
    },
    {
      text: 'How does the challenge work?',
      topic: 'conversation.user.replied',
      createdAgo: 5000,
      reply: 'ACTION: REPLY\n[secret] should not be here',
    },
  ],
  expect: {
    perTurn: [
      { exactComments: [POLICY] },
      { exactComments: [faqBody('How does the challenge work?')], excludes: ['[secret]'] },
    ],
  },
  note: 'a password-policy turn does not rewrite the next FAQ article',
});

for (const ask of ['what is my account number?', 'what is my account number', 'which is my account no?']) {
  for (const ctx of [['conversation.user.created', 5], ['conversation.user.replied', 5], ['conversation.user.replied', 5000]]) {
    push({
      bucket: 'account',
      intent: 'kept',
      gates: ['product-critical'],
      turns: [{
        text: ask,
        topic: ctx[0],
        createdAgo: ctx[1],
        reply: 'ACTION: REPLY\n' + EN,
      }],
      expect: {
        perTurn: [{
          commentCount: 1,
          includes: [ACCOUNT_EN],
          excludes: [EN, IT, UR, HI, AR],
          assignCount: 0,
        }],
        fixedLineSuccessMax: 0,
      },
    });
  }
}

for (const ask of ['are you a bot?', 'are you a real human?', 'are you ai or human?']) {
  push({
    bucket: 'account',
    intent: 'kept',
    gates: ['product-critical'],
    turns: [{
      text: ask,
      topic: 'conversation.user.created',
      createdAgo: 5,
      reply: 'ACTION: REPLY\n' + EN,
    }],
    expect: {
      perTurn: [{
        commentCount: 1,
        exactComments: [IDENTITY_EN],
        excludes: [EN],
        assignCount: 0,
        noteCount: 0,
      }],
      fixedLineSuccessMax: 0,
    },
  });
}

push({
  bucket: 'recovery',
  intent: 'r23',
  gates: ['recovery'],
  turns: [{
    text: 'please get me a human',
    topic: 'conversation.user.created',
    createdAgo: 5,
    reply: 'ACTION: REPLY\nI can help with that.',
    read429: true,
  }],
  expect: expectLine(EN),
  note: 'a read 429 may be retried and the handoff still posts',
});

const separators = [': ', ' = ', ' is ', "'s "];
for (const label of labels) {
  for (const sep of separators) {
    const secret = nextSecret();
    push({
      bucket: 'secrets',
      intent: 'kept',
      gates: ['leaks', 'over-redaction'],
      turns: [{
        text: 'what are the trading days? login 50123456 order FE10482931 ' + label + sep + secret,
        topic: 'conversation.user.replied',
        createdAgo: 5000,
        reply: 'ACTION: REPLY\nTrading days are Monday through Friday. Ref ' + secret + ' order FE10482931.',
      }],
      expect: {
        perTurn: [{
          commentCount: 1,
          includes: ['[secret]', 'FE10482931', '50123456'],
          excludes: [secret, CHECKING],
        }],
      },
      secretsAbsent: [secret],
      note: 'label separator ' + JSON.stringify(sep),
    });
  }
}

const lengths = ['10000', '100000', '1000000', '10000000', '100000000', '1000000000'];
for (const digits of lengths) {
  for (const prefix of ['Login', 'acct', 'MT5', 'user', 'mt4', 'id', 'no']) {
    const token = prefix + digits;
    push({
      bucket: 'numbers',
      intent: 'r23',
      gates: ['product-critical'],
      turns: numberTurn('what are the trading days? my login is 50123456', token),
      expect: {
        perTurn: [{ commentCount: 1, includes: [CHECKING], excludes: [digits, token] }],
      },
    });
    push({
      bucket: 'numbers',
      intent: 'r23',
      gates: ['product-critical', 'over-redaction'],
      turns: numberTurn('what are the trading days? my login is ' + token, 'confirmed ' + token),
      expect: {
        perTurn: [{ commentCount: 1, includes: [token], excludes: [CHECKING, '[secret]'] }],
      },
    });
  }
}

const fillerTies = [
  ['please sir hi mujhe agent chahiye', UR],
  ['hi please sir mujhe insaan chahiye', UR],
  ['janab hi sir please agent chahiye', UR],
  ['please get me a human sir', EN],
  ['hi sir please talk to a human', EN],
  ['hello please I need an agent', EN],
  ['sir hi hello I want a human', EN],
  ['kripya please sir mujhe agent chahiye', UR],
  ['assalam hi please mujhe kisi se baat karna hai', UR],
  ['namaste please mujhe agent se baat karna hai', UR],
];
for (const row of fillerTies) {
  push({
    bucket: 'multilingual',
    intent: row[1] === UR ? 'r23' : 'kept',
    gates: ['product-critical'],
    turns: handoffTurns(row[0], 'conversation.user.created', 5),
    expect: expectLine(row[1]),
  });
  push({
    bucket: 'multilingual',
    intent: row[1] === UR ? 'r23' : 'kept',
    gates: ['product-critical'],
    turns: handoffTurns(row[0], 'conversation.user.replied', 5000),
    expect: expectLine(row[1]),
  });
}

for (const status of ['400', '429', '500', 'timeout']) {
  push({
    bucket: 'recovery',
    intent: 'kept',
    gates: ['duplicates', 'recovery'],
    turns: [
      {
        text: 'please get me a human',
        topic: 'conversation.user.created',
        createdAgo: 5,
        reply: 'ACTION: REPLY\nI can help with that.',
        failComment: status,
        keepAssignee: true,
      },
      {
        text: 'just checking in',
        topic: 'conversation.user.replied',
        createdAgo: 5000,
        reply: 'ACTION: REPLY\nI can help with that.',
        keepAssignee: true,
      },
      {
        text: 'any update?',
        topic: 'conversation.user.replied',
        createdAgo: 5000,
        reply: 'ACTION: REPLY\nA teammate now has this conversation.',
        keepAssignee: true,
        assignee: CASEY,
      },
    ],
    expect: {
      perTurn: [
        { commentCount: 1 },
        { commentCount: 1, exactComments: [EN], commentStatuses: [200], noteCount: 0, assignCount: 0 },
        { excludes: [] },
      ],
      fixedLineSuccessMax: 1,
    },
    note: 'owed line posts once and the following turn does not repeat it',
  });
}

const nearSpread = [
  'can you check the spreadsheet?',
  'spread the word about payouts',
  'my trades are spread across two accounts, what are the trading days?',
  'nothing to do with the spreads, what are the trading days?',
];
for (const ask of nearSpread) {
  push({
    bucket: 'mt5',
    intent: 'kept',
    gates: ['product-critical', 'leaks'],
    turns: [{
      text: ask,
      topic: 'conversation.user.replied',
      createdAgo: 5000,
      reply: 'ACTION: REPLY\n' + SPREAD,
    }],
    expect: {
      perTurn: [{
        excludes: ['55188', 'QBG5FetfozKz7'],
      }],
    },
    secretsAbsent: ['QBG5FetfozKz7^a?J!'],
    note: 'near-miss spread wording must not post 55188',
  });
}

const ids = new Set();
for (const c of cases) {
  if (ids.has(c.id)) throw new Error('duplicate id ' + c.id);
  ids.add(c.id);
  if (!c.expect) throw new Error('missing expect ' + c.id);
}
if (cases.length < 950) throw new Error('only ' + cases.length + ' cases');

const out = {
  sealed: true,
  author: 'independent-review-handoff-r23',
  candidate: 'b3398bbeb92149ddd386ccd9c1b1f97cb749573b',
  baselines: ['998e9d5abdf48a35fdd4c4baa4718f20f5d2f217', '49e500757ba0e76ba546217c00275f28f9fee86c'],
  generatedWithoutHandleWebhook: true,
  counts,
  total: cases.length,
  cases,
};
const dest = path.join(__dirname, 'cases.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
fs.unlinkSync(axiosStub);
console.log('wrote', dest, 'total', cases.length);
console.log(JSON.stringify(counts));
