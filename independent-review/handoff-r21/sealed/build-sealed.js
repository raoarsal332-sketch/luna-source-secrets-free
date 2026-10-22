'use strict';

/**
 * Builds the independent sealed case file. This does not call handleWebhook.
 * FAQ bodies are copied from the synced markdown via faq-kb's reader so the
 * expected bytes, including U+200B, are frozen before any candidate run.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const LINES = Object.freeze({
  en: 'A teammate now has this conversation.',
  ur: 'یہ گفتگو اب ایک ساتھی کے پاس ہے۔',
  ar: 'هذه المحادثة الآن لدى أحد الزملاء.',
  hi: 'यह बातचीत अब एक साथी के पास है।',
});

const POLICY = 'Which part of the password policy should I explain?';
const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const USABLE_POLICY = 'Passwords must include letters and numbers.';
const SAFE = 'Trading days are Monday through Friday.';

const PHRASES = {
  en: [
    ['please get me a human', 'en'],
    ['I need to talk to a real person', 'en'],
    ['can you connect me to an agent', 'en'],
    ['Sir, please connect me to a human', 'en'],
    ['Dear support, I would like to speak with a representative', 'en'],
    ['pleese get me a human', 'en'],
    ['i wnat to speak to an agent', 'en'],
    ['kindly conect me with a human please', 'en'],
    ['Hello, I have been waiting and I really need to speak to a human agent about this, thank you', 'en'],
    ['manager please', 'en'],
    ['I want a live agent', 'en'],
    ['please transfer me to a human', 'en'],
    ['Respected sir, I need a real person', 'en'],
    ['supervisor please', 'en'],
    ['could you get me a human agent now', 'en'],
    ['I would like to speak to a representative please', 'en'],
  ],
  roman: [
    ['janab mujhe agent chahiye', 'ur'],
    ['assalam mujhe insaan se baat karni hai', 'ur'],
    ['adaab mujhe banda chahiye', 'ur'],
    ['shukriya janab mujhe human se baat karna hai', 'ur'],
    ['meherbani mujhe agent milao', 'ur'],
    ['janab please mujhe agent chahiye', 'ur'],
    ['assalam mujhe person se baat karni hai', 'ur'],
    ['adaab mujhe human chahiye', 'ur'],
    ['janab mujhe insaan jodo', 'ur'],
    ['assalam alaikum janab mujhe agent chahiye', 'ur'],
    ['meherbani janab mujhe banda se baat karo', 'ur'],
    ['janab mujhe agent chahiyee', 'ur'],
  ],
  hinglish: [
    ['mujhe agent chahiye', 'ur'],
    ['mujhe insaan se baat karni hai', 'ur'],
    ['mujhe banda milao', 'ur'],
    ['sir mujhe human chahiye', 'ur'],
    ['bhai mujhe agent se baat karo', 'ur'],
    ['mujhe person jodo', 'ur'],
    ['please mujhe agent chahiye', 'ur'],
    ['mujhe agent chahiyee', 'ur'],
    ['mujhe insaan se baat karna hai please', 'ur'],
    ['yaar mujhe human se baat karni hai', 'ur'],
    ['mujhe banda chahiye abhi', 'ur'],
    ['sir please mujhe agent milao', 'ur'],
  ],
  ur: [
    ['مجھے ایجنٹ چاہیے', 'ur'],
    ['براہ کرم مجھے بندہ سے بات کرنی ہے', 'ur'],
    ['جناب مجھے نمائندہ چاہیے', 'ur'],
    ['مجھے انسان سے بات کرنی ہے', 'ur'],
    ['مجھے آدمی چاہیے', 'ur'],
    ['جناب مہربانی مجھے ایجنٹ سے بات کرنی ہے', 'ur'],
    ['مجھے ایجنٹ ملاؤ', 'ur'],
    ['سر مجھے نمائندہ جوڑو', 'ur'],
    ['براہ مہربانی مجھے بندہ چاہیے', 'ur'],
    ['جناب مجھے ایجنٹ سے بات کرنی ہے پلیز', 'ur'],
  ],
  ar: [
    ['أريد التحدث مع موظف', 'ar'],
    ['من فضلك حولني إلى وكيل', 'ar'],
    ['يا أستاذ أريد موظفا', 'ar'],
    ['أبغى أتحدث مع ممثل', 'ar'],
    ['أود تحويل المحادثة إلى وكيل', 'ar'],
    ['كلمني مع موظف من فضلك', 'ar'],
    ['أحتاج إلى موظف بشري الآن', 'ar'],
    ['من فضلك أريد أن أتحدث مع وكيل اليوم', 'ar'],
    ['يا سيدي أريد موظفا للحديث', 'ar'],
    ['حولني رجاء إلى ممثل', 'ar'],
  ],
  hi: [
    ['मुझे एजेंट से बात करनी है', 'hi'],
    ['कृपया मुझे इंसान से जोड़ दो', 'hi'],
    ['सर मुझे प्रतिनिधि चाहिए', 'hi'],
    ['मुझे आदमी से बात करनी है', 'hi'],
    ['मुझे व्यक्ति चाहिए', 'hi'],
    ['सर मुझे एजेंट मिलाओ', 'hi'],
    ['मुझे एजेंट चाहिए', 'hi'],
    ['कृपया सर मुझे इंसान से बात करनी है', 'hi'],
    ['मुझे प्रतिनिधि से बात करनी है अभी', 'hi'],
    ['आदरणीय सर मुझे एजेंट से जोड़ दो', 'hi'],
    ['मुझे human से बात करनी है', 'hi'],
    ['मुझे staff से बात करनी है', 'hi'],
    ['मुझे representative चाहिए', 'hi'],
    ['मुझे support person से बात करनी है', 'hi'],
  ],
  'mix-ar': [
    ['أريد human', 'ar'],
    ['أريد staff', 'ar'],
    ['أريد representative', 'ar'],
    ['أريد support person', 'ar'],
    ['أريد agent', 'ar'],
    ['أريد insaan', 'ar'],
  ],
  'mix-ur': [
    ['مجھے staff چاہیے', 'ur'],
    ['مجھے agent چاہیے', 'ur'],
    ['مجھے human چاہیے', 'ur'],
    ['مجھے representative چاہیے', 'ur'],
    ['مجھے support person چاہیے', 'ur'],
    ['مجھے banda چاہیے', 'ur'],
    ['مجھے insaan چاہیے', 'ur'],
  ],
};

const STAGES = {
  finwait: { topic: 'conversation.user.created', createdAgo: 5, priorBot: false },
  welcome: { topic: 'conversation.user.replied', createdAgo: 400, priorBot: false },
  later: { topic: 'conversation.user.replied', createdAgo: 1000, priorBot: true },
};

const PASSWORD = [
  'What password criteria do you use?',
  'what is the password policy?',
  'what are the password requirements?',
  'what are the password rules?',
  'what is the password criteria?',
  'what is the password requirement?',
  'Can you explain the password policy?',
  'please explain the password rules',
  'I need the password requirements',
  'wht is the password policy?',
  'password criteria?',
  'Sir, can you explain the password policy in simple words?',
];

const LABELS = ['password', 'passcode', 'passphrase', 'passwd', 'pwd', 'pass', 'otp', 'pin', 'token', 'secret'];
const STATUSES = ['400', '401', '403', '404', '409', '422', '429', '500', '502', '503', 'timeout'];
const RECOVERY_LANGS = [
  ['en', 'please get me a human', 'en'],
  ['ur', 'مجھے ایجنٹ چاہیے', 'ur'],
  ['ar', 'أريد التحدث مع موظف', 'ar'],
  ['hi', 'मुझे एजेंट से बात करनी है', 'hi'],
  ['roman', 'janab mujhe agent chahiye', 'ur'],
  ['hinglish', 'mujhe agent chahiye', 'ur'],
];

const SUPPORTED = [
  'The DLL is 5%.',
  'The MLL is 8%.',
  'The daily loss limit is 5%.',
  'The max loss limit is 8%.',
  'DLL is 5%.',
  'The maximum loss is 8%.',
  'Daily loss limit is 5%.',
  'Max loss limit is 8%.',
  'The daily drawdown is 5%.',
  'The max drawdown is 8%.',
];
const INVENTED = [
  'The DLL is 99%.',
  'The daily drawdown is 8%.',
  'The MLL is 5%.',
  'Your profit split is 90%.',
  'The fee is $50.',
  'Leverage is 1:100.',
];
const FIGURE_EVIDENCE = 'DLL 5%/3%, MLL 8%. Daily loss limit 5%. Max loss limit 8%.';

const FAQ_ASKS = [
  'How does the challenge work?',
  'What is the leverage?',
  'Is Funded Elite a broker?',
  'Does FundedElite operate under regulation?',
  'What is the refund policy?',
  'What are the trading credentials?',
  'Do you copy trades to live funds?',
];

function pad(n, width) {
  return String(n).padStart(width, '0');
}

function secretToken(n) {
  return 'Z9kQ' + pad(n, 8);
}

function noiseToken(n) {
  return 'N8pL' + pad(n, 8);
}

function handoffExpect(line, opts) {
  const o = opts || {};
  return {
    comments: 1,
    commentEquals: LINES[line],
    notes: 1,
    assigns: 1,
    commentGate: 'critical',
    extraGate: 'duplicate',
    noteGate: 'duplicate',
    assignGate: 'duplicate',
    equalsGate: 'critical',
    secrets: o.secrets || [],
    keep: o.keep || [],
    keepIn: o.keepIn || [],
    owedAbsent: true,
  };
}

function cases() {
  const out = [];
  let n = 0;
  function add(c) {
    n += 1;
    c.n = n;
    out.push(c);
  }

  for (const [variety, rows] of Object.entries(PHRASES)) {
    for (const [text, line] of rows) {
      for (const [stage, spec] of Object.entries(STAGES)) {
        add({
          id: 'h-' + variety + '-' + stage + '-' + pad(out.length, 4),
          group: 'handoff-' + variety,
          kind: 'handoff',
          variety,
          stage,
          turns: [{
            text,
            topic: spec.topic,
            createdAgo: spec.createdAgo,
            priorBot: spec.priorBot,
            model: 'ACTION: REPLY\nI can help with that.',
            expect: handoffExpect(line),
          }],
        });
      }
    }
  }

  for (const [variety, rows] of Object.entries(PHRASES)) {
    for (const [text, line] of rows) {
      for (const stage of ['finwait', 'later']) {
        const spec = STAGES[stage];
        const sec = secretToken(100000 + out.length);
        const noise = noiseToken(100000 + out.length);
        add({
          id: 'hs-' + variety + '-' + stage + '-' + pad(out.length, 4),
          group: 'handoff-secret-' + variety,
          kind: 'secret',
          variety,
          stage,
          turns: [{
            text: text + ' password: ' + sec + ' ' + noise,
            topic: spec.topic,
            createdAgo: spec.createdAgo,
            priorBot: spec.priorBot,
            model: 'ACTION: REPLY\nI can help with that.',
            expect: handoffExpect(line, {
              secrets: [sec, noise],
              keepIn: ['prompt', 'note', 'assign', 'public'],
            }),
          }],
        });
      }
    }
  }

  LABELS.forEach((label, i) => {
    const sec = secretToken(200000 + i);
    add({
      id: 'sec-label-' + label,
      group: 'secrets-public',
      kind: 'secret',
      turns: [{
        text: 'what are the trading days? ' + label + ': ' + sec,
        topic: 'conversation.user.replied',
        createdAgo: 1000,
        priorBot: true,
        model: 'ACTION: REPLY\n' + SAFE + ' Ref ' + sec,
        expect: {
          comments: 1,
          commentContains: [SAFE],
          secrets: [sec],
          keep: [SAFE],
          keepIn: ['public'],
          promptContains: ['trading days'],
          commentGate: 'critical',
          extraGate: 'duplicate',
        },
      }],
    });
  });

  for (let i = 0; i < 20; i++) {
    const noise = noiseToken(210000 + i);
    add({
      id: 'sec-plain-' + pad(i, 2),
      group: 'secrets-public',
      kind: 'secret',
      turns: [{
        text: 'what are the trading days? ref ' + noise,
        topic: 'conversation.user.replied',
        createdAgo: 1000,
        priorBot: true,
        model: 'ACTION: REPLY\n' + SAFE + ' Ref ' + noise,
        expect: {
          comments: 1,
          commentContains: [SAFE],
          secrets: [noise],
          keep: [SAFE],
          keepIn: ['public'],
          promptContains: ['trading days'],
          commentGate: 'critical',
          extraGate: 'duplicate',
        },
      }],
    });
  }

  for (let i = 0; i < 24; i++) {
    const order = 'FE' + pad(30000000 + i, 8);
    const numeric = pad(40000000 + i, 8);
    const mt5 = pad(50000000 + i, 8);
    const mt5p = 'MT5' + pad(6000000 + i, 7);
    const ticket = 'TKT' + pad(700000 + i, 6);
    const receipt = 'https://pay.example/receipts/' + order;
    const lookalike = 'FE' + pad(80000000 + i, 8);
    const sec = secretToken(300000 + i);
    const noise = noiseToken(300000 + i);
    const kb = 'KbKeep' + pad(i, 4) + 'x7';
    const echoed = [SAFE, 'order', order, 'numeric', numeric, 'receipt', receipt, 'mt5', mt5, mt5p, 'ticket', ticket, 'pin', lookalike, 'kb', kb, 'ref', sec, noise].join(' ');
    add({
      id: 'over-public-' + pad(i, 2),
      group: 'over-redaction',
      kind: 'over',
      turns: [{
        text: 'what are the trading days? order ' + order + ' numeric ' + numeric + ' receipt ' + receipt + ' mt5 ' + mt5 + ' ' + mt5p + ' ticket ' + ticket + ' pin: ' + lookalike + ' password: ' + sec + ' ' + noise,
        topic: 'conversation.user.replied',
        createdAgo: 1000,
        priorBot: true,
        model: 'ACTION: REPLY\n' + echoed,
        expect: {
          comments: 1,
          secrets: [sec, noise],
          keep: [order, numeric, receipt, mt5, mt5p, ticket, lookalike, kb, SAFE],
          keepIn: ['public', 'prompt'],
          commentGate: 'critical',
          extraGate: 'duplicate',
        },
      }],
    });
  }

  for (let i = 0; i < 12; i++) {
    const order = 'FE' + pad(31000000 + i, 8);
    const numeric = pad(41000000 + i, 8);
    const receipt = 'https://pay.example/receipts/' + order;
    const mt5 = pad(51000000 + i, 8);
    const lookalike = 'FE' + pad(81000000 + i, 8);
    const sec = secretToken(310000 + i);
    const noise = noiseToken(310000 + i);
    add({
      id: 'over-note-' + pad(i, 2),
      group: 'over-redaction',
      kind: 'over',
      turns: [{
        text: 'please get me a human order ' + order + ' numeric ' + numeric + ' receipt ' + receipt + ' mt5 ' + mt5 + ' pin: ' + lookalike + ' password: ' + sec + ' ' + noise,
        topic: 'conversation.user.created',
        createdAgo: 5,
        model: 'ACTION: REPLY\nI can help with that.',
        expect: handoffExpect('en', {
          secrets: [sec, noise],
          keep: [order, numeric, receipt, mt5, lookalike],
          keepIn: ['note', 'prompt'],
        }),
      }],
    });
  }

  // Same process later reuses a lookalike that was labeled on the previous case shape.
  add({
    id: 'over-lookalike-then-order',
    group: 'over-redaction',
    kind: 'over',
    turns: [{
      text: 'what are the trading days? pin: FE55443322',
      topic: 'conversation.user.replied',
      createdAgo: 1000,
      priorBot: true,
      model: 'ACTION: REPLY\n' + SAFE + ' pin FE55443322',
      expect: {
        comments: 1,
        keep: ['FE55443322', SAFE],
        keepIn: ['public', 'prompt'],
        secrets: [],
        commentGate: 'critical',
        extraGate: 'duplicate',
      },
    }],
  });
  add({
    id: 'over-lookalike-reused-as-order',
    group: 'over-redaction',
    kind: 'over',
    turns: [{
      text: 'what are the trading days? order FE55443322',
      topic: 'conversation.user.replied',
      createdAgo: 1000,
      priorBot: true,
      model: 'ACTION: REPLY\n' + SAFE + ' order FE55443322',
      expect: {
        comments: 1,
        keep: ['FE55443322', SAFE],
        keepIn: ['public', 'prompt'],
        secrets: [],
        commentGate: 'critical',
        extraGate: 'duplicate',
      },
    }],
  });

  for (const ask of PASSWORD) {
    for (const [stage, spec] of Object.entries(STAGES)) {
      add({
        id: 'pw-' + stage + '-' + pad(out.length, 4),
        group: 'password-' + stage,
        kind: 'password',
        stage,
        turns: [{
          text: ask,
          topic: spec.topic,
          createdAgo: spec.createdAgo,
          priorBot: spec.priorBot,
          model: 'ACTION: REPLY\n',
          expect: {
            comments: 1,
            commentEquals: POLICY,
            notes: 0,
            assigns: 0,
            commentGate: 'critical',
            extraGate: 'duplicate',
            noteGate: 'duplicate',
            assignGate: 'duplicate',
            equalsGate: 'critical',
          },
        }],
      });
      add({
        id: 'pw-hedge-' + stage + '-' + pad(out.length, 4),
        group: 'password-' + stage,
        kind: 'password',
        stage,
        turns: [{
          text: ask,
          topic: spec.topic,
          createdAgo: spec.createdAgo,
          priorBot: spec.priorBot,
          model: 'ACTION: REPLY\n' + HEDGE,
          expect: {
            comments: 1,
            commentEquals: stage === 'finwait' ? POLICY : POLICY,
            notes: 0,
            assigns: 0,
            commentGate: 'critical',
            extraGate: 'duplicate',
            noteGate: 'duplicate',
            assignGate: 'duplicate',
            equalsGate: 'critical',
          },
        }],
      });
    }
    add({
      id: 'pw-usable-later-' + pad(out.length, 4),
      group: 'password-later',
      kind: 'password',
      stage: 'later',
      turns: [{
        text: ask,
        topic: 'conversation.user.replied',
        createdAgo: 1000,
        priorBot: true,
        model: 'ACTION: REPLY\n' + USABLE_POLICY,
        expect: {
          comments: 1,
          commentContains: [USABLE_POLICY],
          commentExcludes: [HEDGE],
          notes: 0,
          assigns: 0,
          commentGate: 'critical',
          extraGate: 'duplicate',
          noteGate: 'duplicate',
          assignGate: 'duplicate',
        },
      }],
    });
    add({
      id: 'pw-fresh-reply-' + pad(out.length, 4),
      group: 'password-fresh',
      kind: 'password',
      stage: 'fresh-reply',
      turns: [{
        text: ask,
        topic: 'conversation.user.replied',
        createdAgo: 5,
        priorBot: false,
        model: 'ACTION: REPLY\n',
        expect: {
          comments: 1,
          commentEquals: POLICY,
          notes: 0,
          assigns: 0,
          commentGate: 'critical',
          extraGate: 'duplicate',
          noteGate: 'duplicate',
          assignGate: 'duplicate',
          equalsGate: 'critical',
        },
      }],
    });
  }

  function recoveryTurns(text, line, status, scenario) {
    const lineText = LINES[line];
    const first = {
      text,
      topic: 'conversation.user.created',
      createdAgo: 5,
      model: 'ACTION: REPLY\nI can help with that.',
      fail: status,
      expect: {
        comments: status === '429' ? '429' : 1,
        commentEquals: lineText,
        notes: 1,
        assigns: 1,
        commentGate: 'recovery',
        extraGate: 'recovery',
        noteGate: 'recovery',
        assignGate: 'recovery',
        equalsGate: 'recovery',
        owed: lineText,
      },
    };
    const second = {
      text: 'still waiting',
      topic: 'conversation.user.replied',
      model: 'ACTION: REPLY\nI can help with that.',
      dropNotes: scenario === 'removed',
      wipeStore: scenario === 'wiped',
      human: scenario === 'human',
      restart: scenario === 'restart',
      expect: scenario === 'human'
        ? {
          comments: 0,
          notes: 0,
          assigns: 0,
          commentGate: 'recovery',
          noteGate: 'recovery',
          assignGate: 'recovery',
          extraGate: 'recovery',
        }
        : {
          comments: 1,
          commentEquals: lineText,
          notes: 0,
          assigns: 0,
          commentGate: 'recovery',
          extraGate: 'duplicate',
          noteGate: 'recovery',
          assignGate: 'recovery',
          equalsGate: 'recovery',
          owedAbsent: true,
        },
    };
    return [first, second];
  }

  for (const [variety, text, line] of RECOVERY_LANGS) {
    for (const status of STATUSES) {
      const scenarios = status === '429' ? ['retry', 'removed'] : ['retry', 'removed', 'wiped', 'human'];
      for (const scenario of scenarios) {
        add({
          id: 'rec-' + variety + '-' + status + '-' + scenario,
          group: 'recovery-' + variety,
          kind: 'recovery',
          variety,
          status,
          scenario,
          turns: recoveryTurns(text, line, status, scenario),
        });
      }
    }
  }

  for (const [variety, text, line] of RECOVERY_LANGS.filter((row) => row[0] === 'en' || row[0] === 'hi')) {
    for (const status of STATUSES) {
      add({
        id: 'rec-restart-' + variety + '-' + status,
        group: 'recovery-restart',
        kind: 'recovery',
        variety,
        status,
        scenario: 'restart',
        turns: recoveryTurns(text, line, status, 'restart'),
      });
    }
  }

  for (const [variety, text, line] of RECOVERY_LANGS.filter((row) => row[0] === 'en' || row[0] === 'ur')) {
    for (const status of STATUSES) {
      const turns = [];
      for (let i = 0; i < 5; i++) {
        turns.push({
          text: i === 0 ? text : 'still waiting ' + (i + 1),
          topic: i === 0 ? 'conversation.user.created' : 'conversation.user.replied',
          createdAgo: i === 0 ? 5 : 1000,
          model: 'ACTION: REPLY\nI can help with that.',
          fail: status,
          expect: {
            comments: status === '429' ? '429' : 1,
            commentEquals: LINES[line],
            notes: i === 0 ? 1 : 0,
            assigns: i === 0 ? 1 : 0,
            commentGate: 'recovery',
            extraGate: 'recovery',
            noteGate: 'recovery',
            assignGate: 'recovery',
            equalsGate: 'recovery',
            owed: LINES[line],
          },
        });
      }
      turns.push({
        text: 'one more check',
        topic: 'conversation.user.replied',
        model: 'ACTION: REPLY\nI can help with that.',
        fail: status,
        expect: {
          comments: 0,
          notes: 0,
          assigns: 0,
          commentGate: 'recovery',
          noteGate: 'recovery',
          assignGate: 'recovery',
          extraGate: 'recovery',
          owed: LINES[line],
        },
      });
      add({
        id: 'rec-bound-' + variety + '-' + status,
        group: 'recovery-bound-' + variety,
        kind: 'recovery',
        variety,
        status,
        scenario: 'bound',
        turns,
      });
    }
  }

  for (const [variety, text, line] of RECOVERY_LANGS) {
    for (const [stage, spec] of Object.entries(STAGES)) {
      add({
        id: 'dup-' + variety + '-' + stage,
        group: 'duplicates',
        kind: 'duplicate',
        variety,
        stage,
        turns: [
          {
            text,
            topic: spec.topic,
            createdAgo: spec.createdAgo,
            priorBot: spec.priorBot,
            model: 'ACTION: REPLY\nI can help with that.',
            expect: handoffExpect(line),
          },
          {
            text,
            topic: 'conversation.user.replied',
            model: 'ACTION: REPLY\nI can help with that.',
            expect: {
              comments: 0,
              notes: 0,
              assigns: 0,
              commentGate: 'duplicate',
              noteGate: 'duplicate',
              assignGate: 'duplicate',
              extraGate: 'duplicate',
            },
          },
        ],
      });
    }
  }

  return out;
}

function loadFaq() {
  const root = process.env.CANDIDATE_FAQ_ROOT;
  if (!root) throw new Error('CANDIDATE_FAQ_ROOT is required');
  const mock = path.join('/tmp', 'sealed-axios-mock.js');
  fs.writeFileSync(mock, 'module.exports={get(){return Promise.resolve({status:599,data:""});}};\n');
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'axios') return mock;
    return orig.call(this, request, parent, isMain, options);
  };
  process.env.FUNDEDELITE_FAQ_PATH = path.join(root, 'fundedelite-faqs.md');
  const faq = require(path.join(root, 'faq-kb.js'));
  const md = fs.readFileSync(process.env.FUNDEDELITE_FAQ_PATH, 'utf8');
  const bodies = {};
  for (const ask of FAQ_ASKS) {
    const hit = faq.selectApprovedAnswer(ask);
    if (!hit || !hit.body) throw new Error('no FAQ body for ' + ask);
    if (!hit.body.includes('\u200b')) throw new Error('FAQ body missing U+200B for ' + ask);
    if (!md.includes(hit.body)) throw new Error('FAQ body is not a markdown substring for ' + ask);
    bodies[ask] = hit.body;
  }
  return bodies;
}

function attachFaq(list, bodies) {
  FAQ_ASKS.forEach((ask, i) => {
    const body = bodies[ask];
    const sec = secretToken(900000 + i);
    list.push({
      id: 'faq-' + pad(i, 2),
      group: 'faq',
      kind: 'faq',
      n: list.length + 1,
      turns: [{
        text: ask,
        topic: 'conversation.user.replied',
        createdAgo: 1000,
        priorBot: true,
        model: 'ACTION: REPLY\nI will guess.',
        expect: {
          comments: 1,
          commentEquals: body,
          commentContains: ['\u200b'],
          notes: 0,
          assigns: 0,
          commentGate: 'critical',
          extraGate: 'duplicate',
          noteGate: 'duplicate',
          assignGate: 'duplicate',
          equalsGate: 'critical',
        },
      }],
    });
    list.push({
      id: 'faq-after-secret-' + pad(i, 2),
      group: 'faq',
      kind: 'faq',
      n: list.length + 1,
      turns: [
        {
          text: 'what are the trading days? password: ' + sec,
          topic: 'conversation.user.replied',
          createdAgo: 1000,
          priorBot: true,
          model: 'ACTION: REPLY\n' + SAFE + ' ' + sec,
          expect: {
            comments: 1,
            secrets: [sec],
            keep: [SAFE],
            keepIn: ['public'],
            commentGate: 'critical',
            extraGate: 'duplicate',
          },
        },
        {
          text: ask,
          topic: 'conversation.user.replied',
          model: 'ACTION: REPLY\n[secret] should not be here',
          expect: {
            comments: 1,
            commentEquals: body,
            commentContains: ['\u200b'],
            secrets: [sec],
            commentExcludes: ['[secret]'],
            notes: 0,
            assigns: 0,
            commentGate: 'critical',
            extraGate: 'duplicate',
            noteGate: 'duplicate',
            assignGate: 'duplicate',
            equalsGate: 'critical',
          },
        },
      ],
    });
  });
}

function attachFigures(list) {
  SUPPORTED.forEach((draft, i) => {
    list.push({
      id: 'fig-ok-' + pad(i, 2),
      group: 'figures',
      kind: 'figure',
      n: list.length + 1,
      turns: [{
        text: 'what are the trading days?',
        topic: 'conversation.user.replied',
        createdAgo: 1000,
        priorBot: true,
        model: 'ACTION: REPLY\n' + draft,
        faqBlock: FIGURE_EVIDENCE,
        expect: {
          comments: 1,
          commentEquals: draft,
          notes: 0,
          assigns: 0,
          commentGate: 'critical',
          extraGate: 'duplicate',
          noteGate: 'duplicate',
          assignGate: 'duplicate',
          equalsGate: 'critical',
        },
      }],
    });
  });
  INVENTED.forEach((draft, i) => {
    const banned = [draft];
    if (draft.includes('99%')) banned.push('99%');
    if (draft.includes('$50')) banned.push('$50');
    if (draft.includes('90%')) banned.push('90%');
    if (draft.includes('1:100')) banned.push('1:100');
    list.push({
      id: 'fig-no-' + pad(i, 2),
      group: 'figures',
      kind: 'figure',
      n: list.length + 1,
      turns: [{
        text: 'what are the trading days?',
        topic: 'conversation.user.replied',
        createdAgo: 1000,
        priorBot: true,
        model: 'ACTION: REPLY\n' + draft,
        faqBlock: FIGURE_EVIDENCE,
        expect: {
          commentExcludes: banned,
          notes: 0,
          assigns: 0,
          commentGate: 'critical',
          extraGate: 'duplicate',
          noteGate: 'duplicate',
          assignGate: 'duplicate',
          equalsGate: 'critical',
        },
      }],
    });
  });
}

function main() {
  const bodies = loadFaq();
  const list = cases();
  attachFaq(list, bodies);
  attachFigures(list);
  const recovery = list.filter((c) => c.kind === 'recovery').length;
  const doc = {
    seal: 'independent-handoff-r21',
    reviewer: 'independent',
    candidateNotRun: true,
    lines: LINES,
    policy: POLICY,
    counts: {
      total: list.length,
      recovery,
      byKind: list.reduce((m, c) => {
        m[c.kind] = (m[c.kind] || 0) + 1;
        return m;
      }, {}),
    },
    cases: list,
  };
  if (doc.counts.total < 900) throw new Error('sealed set has ' + doc.counts.total + ' cases');
  if (recovery < 250) throw new Error('sealed set has ' + recovery + ' recovery cases');
  const file = path.join(__dirname, 'cases.json');
  fs.writeFileSync(file, JSON.stringify(doc));
  console.log(JSON.stringify(doc.counts));
}

main();
