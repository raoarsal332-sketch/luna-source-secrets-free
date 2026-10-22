'use strict';

/**
 * Independent sealed-set generator for fixed-message handoff R20.
 * Expectations come from the review brief and the frozen R18/R19/R20
 * contracts. This file does not load the candidate runtime.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SHA = '0d9af3733d48cd7a59ca20dab8e3a00531e2ca6d';
const LINES = Object.freeze({
  en: 'A teammate now has this conversation.',
  ur: 'یہ گفتگو اب ایک ساتھی کے پاس ہے۔',
  ar: 'هذه المحادثة الآن لدى أحد الزملاء.',
  hi: 'यह बातचीत अब एक साथी के पास है।',
});
const POLICY = 'Which part of the password policy should I explain?';
const CLARIFIER = 'Please tell me which challenge you mean.';
const HEDGE = "I can't confirm that figure from the approved details, so I won't guess a number.";
const FAQ_URL = 'https://faq.fundedelite.com/en/articles/12675113-how-does-the-challenge-evaluation-work';
const ORDER = 'FE10482931';
const ORDER_ALT = 'ORD104829';
const ORDER_NUM = '10482931';
const MT5 = '10023456';
const MT5_SHORT = '55188';
const MT5_MID = '189143';
const LABELED = 'SuperSecretValue99';
const NOISE = 'Zq8LatinNoise88ab';
const HUNTER = 'hunter2';

const PATHS = [
  { id: 'fin', topic: 'conversation.user.created', createdAgo: 5, priorBot: false },
  { id: 'welcome', topic: 'conversation.user.replied', createdAgo: 1000, priorBot: false },
  { id: 'later', topic: 'conversation.user.replied', createdAgo: 1000, priorBot: true },
];

const SECRET_MODES = [
  { id: 'none', suffix: '', secrets: [] },
  { id: 'labeled', suffix: ' password: ' + LABELED, secrets: [LABELED] },
  { id: 'unlabeled', suffix: ' ' + NOISE, secrets: [NOISE] },
  { id: 'both', suffix: ' password: ' + LABELED + ' ' + NOISE, secrets: [LABELED, NOISE] },
];

const PHRASES = [
  ['en', 'en-human', 'please get me a human'],
  ['en', 'en-agent', 'I need to talk to an agent'],
  ['en', 'en-sir', 'sir please connect me to a representative'],
  ['en', 'en-live', 'I want a live person'],
  ['en', 'en-transfer', 'can you transfer me to a teammate'],
  ['en', 'en-supervisor', 'I need a supervisor'],
  ['en', 'en-typo', 'pleese get me a humann agent'],
  ['en', 'en-madam', 'hello madam, I have been trying since yesterday and I still need to speak with a human representative'],
  ['en', 'en-short', 'AGENT please'],
  ['en', 'en-kindly', 'kindly arrange a human for me'],
  ['en', 'en-long', 'hello, I would really appreciate it if you could please connect me to a human representative today'],
  ['hi', 'hi-agent-native', 'मुझे एजेंट से बात करनी है'],
  ['hi', 'hi-insaan', 'मुझे इंसान से बात करनी है'],
  ['hi', 'hi-honorific', 'कृपया मुझे प्रतिनिधि से जोड़ो'],
  ['hi', 'hi-ji', 'जी मुझे एजेंट चाहिए'],
  ['hi', 'hi-aadmi', 'मुझे आदमी से बात करनी है'],
  ['hi', 'hi-long', 'मुझे पिछले कई घंटों से इंतजार है कृपया मुझे एजेंट से बात करनी है'],
  ['hi', 'hi-x-agent', 'मुझे agent से बात करनी है'],
  ['hi', 'hi-x-human', 'मुझे human चाहिए'],
  ['hi', 'hi-x-staff', 'मुझे staff से बात करनी है'],
  ['hi', 'hi-x-banda', 'मुझे banda से बात करनी है'],
  ['hi', 'hi-x-insaan', 'मुझे insaan से बात करनी है'],
  ['hi', 'hi-x-rep', 'मुझे representative से बात करनी है'],
  ['hi', 'hi-x-support', 'मुझे support person से बात करनी है'],
  ['ur', 'ur-agent', 'مجھے ایجنٹ سے بات کرنی ہے'],
  ['ur', 'ur-insaan', 'مجھے انسان چاہیے'],
  ['ur', 'ur-janab', 'جناب مجھے نمائندہ چاہیے'],
  ['ur', 'ur-aadmi', 'مجھے آدمی سے بات کرنی ہے'],
  ['ur', 'ur-x-agent', 'مجھے agent چاہیے'],
  ['ur', 'ur-x-human', 'مجھے human چاہیے'],
  ['ur', 'ur-x-staff', 'مجھے staff چاہیے'],
  ['ur', 'ur-x-banda', 'مجھے banda چاہیے'],
  ['ur', 'ur-x-insaan', 'مجھے insaan چاہیے'],
  ['ur', 'ur-x-rep', 'مجھے representative چاہیے'],
  ['ur', 'ur-x-support', 'مجھے support person چاہیے'],
  ['ar', 'ar-staff', 'أريد التحدث مع موظف'],
  ['ar', 'ar-human', 'أريد انسان'],
  ['ar', 'ar-please', 'من فضلك حولني إلى موظف'],
  ['ar', 'ar-long', 'أريد التحدث إلى ممثل خدمة لأن مشكلتي لم تحل منذ الصباح'],
  ['ar', 'ar-x-agent', 'أريد agent'],
  ['ar', 'ar-x-human', 'أريد human'],
  ['ar', 'ar-x-staff', 'أريد staff'],
  ['ar', 'ar-x-banda', 'أريد banda'],
  ['ar', 'ar-x-insaan', 'أريد insaan'],
  ['ar', 'ar-x-rep', 'أريد representative'],
  ['ar', 'ar-x-support', 'أريد support person'],
  ['ur', 'rom-janab', 'janab mujhe agent chahiye'],
  ['ur', 'rom-baat', 'mujhe insaan se baat karni hai'],
  ['ur', 'rom-bhai', 'bhai mujhe human chahiye'],
  ['ur', 'rom-assalam', 'assalam mujhe banda chahiye'],
  ['ur', 'rom-meherbani', 'meherbani mujhe agent chahiye'],
  ['ur', 'rom-person', 'mujhe person se baat karni hai'],
  ['ur', 'rom-shukriya', 'shukriya mujhe insan chahiye'],
  ['ur', 'rom-long', 'janab mujhe bohot der se masla hai aur mujhe agent se baat karni hai'],
];

function faqArticles() {
  const md = execFileSync('git', ['show', SHA + ':luna-current/01_runtime/fundedelite-faqs.md'], { encoding: 'utf8' });
  const parts = md.split(/\n### /);
  let parentTitle = '';
  let parentUrl = '';
  const out = [];
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const lines = chunk.split('\n');
    const rawTitle = (lines[0] || '').trim();
    let title = rawTitle;
    let url = '';
    const um = chunk.match(/URL:\s*(https:\/\/faq\.fundedelite\.com\/[^\s)]+)/i)
      || chunk.match(/(https:\/\/faq\.fundedelite\.com\/en\/articles\/[a-z0-9-]+)/i);
    if (um) url = um[1].trim();
    if (url) {
      parentTitle = rawTitle;
      parentUrl = url;
    } else if (parentTitle && rawTitle.toLowerCase() !== parentTitle.toLowerCase()) {
      title = parentTitle + ' , ' + rawTitle.replace(/:$/, '');
      url = parentUrl;
    }
    let body = chunk.replace(/^[^\n]*\n/, '').replace(/^URL:.*$/m, '').replace(/\n---[\s\S]*$/, '').trim();
    const bodyLines = body.split('\n');
    while (bodyLines.length && /^\s*-\s+/.test(bodyLines[bodyLines.length - 1]) && bodyLines[bodyLines.length - 1].length < 120) {
      bodyLines.pop();
    }
    body = bodyLines.join('\n').trim();
    if (body.length > 1600) body = body.slice(0, 1600) + '…';
    out.push({ title, url, body });
  }
  return out;
}

function article(arts, title) {
  const hit = arts.find((a) => a.title === title);
  if (!hit) throw new Error('missing article ' + title);
  return hit;
}

function handoffCase(phrase, route, mode) {
  const [lang, pid, text] = phrase;
  const line = LINES[lang];
  const id = 'H-' + pid + '-' + route.id + '-' + mode.id;
  return {
    id,
    class: 'handoff',
    kind: 'single',
    lang,
    path: route.id,
    text: text + mode.suffix,
    topic: route.topic,
    createdAgo: route.createdAgo,
    priorBot: route.priorBot,
    model: 'ACTION: REPLY\nI can help with that.',
    secrets: mode.secrets,
    expect: {
      successComments: 1,
      successNotes: 1,
      successAssigns: 1,
      commentEquals: line,
      secrets: mode.secrets,
    },
  };
}

function passwordCase(ask, route, draftId, draft) {
  const fin = route.id === 'fin';
  const usable = draftId === 'usable' && !fin;
  const id = 'P-' + route.id + '-' + draftId + '-' + crypto.createHash('sha256').update(ask).digest('hex').slice(0, 8);
  const expect = {
    successComments: 1,
    successNotes: 0,
    successAssigns: 0,
    secrets: ask.includes(LABELED) ? [LABELED] : [],
  };
  if (usable) expect.commentIncludes = ['Passwords must include letters and numbers.'];
  else expect.commentEquals = POLICY;
  return {
    id,
    class: 'password',
    kind: 'single',
    path: route.id,
    text: ask,
    topic: route.topic,
    createdAgo: route.createdAgo,
    priorBot: route.priorBot,
    model: draft,
    secrets: expect.secrets,
    expect,
  };
}

const cases = [];

for (const phrase of PHRASES) {
  for (const route of PATHS) {
    for (const mode of SECRET_MODES) cases.push(handoffCase(phrase, route, mode));
  }
}

const PASSWORD_ASKS = [
  'What password criteria do you use?',
  'what is the password policy?',
  'what are the password requirements?',
  'what are the password rules?',
  'what is the password criteria?',
  'what is the password requirement?',
  'what are the password rule?',
  'Can you explain the password policy?',
  'Which password rules apply to the client portal login that I use every morning?',
  'What password criteria do you use? password: ' + LABELED,
];
const DRAFTS = [
  ['empty', 'ACTION: REPLY\n'],
  ['hedge', 'ACTION: REPLY\n' + HEDGE],
  ['usable', 'ACTION: REPLY\nPasswords must include letters and numbers.'],
];
for (const ask of PASSWORD_ASKS) {
  for (const route of PATHS) {
    for (const [draftId, draft] of DRAFTS) cases.push(passwordCase(ask, route, draftId, draft));
  }
}

const arts = faqArticles();
const challenge = article(arts, 'How does the challenge/evaluation work?');
const leverage = article(arts, 'What is the leverage of the challenges we offer?');
if (!challenge.body.includes('\u200b')) throw new Error('challenge article lost U+200B');
if (!leverage.body.includes('\u200b')) throw new Error('leverage article lost U+200B');
if (!challenge.body.includes(FAQ_URL) && !challenge.url.includes('12675113')) {
  /* URL is on the article record; the body must still keep its own links intact */
}
function faqExpect(body) {
  return {
    successComments: 1,
    successNotes: 0,
    successAssigns: 0,
    commentEquals: body,
    zwsp: body.includes('\u200b'),
    bodySha256: crypto.createHash('sha256').update(body, 'utf8').digest('hex'),
    secrets: [],
  };
}

cases.push({
  id: 'F-challenge',
  class: 'faq',
  kind: 'single',
  text: 'How does the challenge work?',
  topic: 'conversation.user.replied',
  createdAgo: 1000,
  model: 'ACTION: REPLY\n[secret] should not be here',
  expect: Object.assign(faqExpect(challenge.body), {
    commentIncludes: ['\u200b', challenge.url],
    commentExcludes: ['[secret]', 'Hello'],
  }),
});
cases.push({
  id: 'F-leverage',
  class: 'faq',
  kind: 'single',
  text: 'What is the leverage?',
  topic: 'conversation.user.replied',
  createdAgo: 1000,
  model: 'ACTION: REPLY\nThe leverage is 1:999.',
  expect: Object.assign(faqExpect(leverage.body), {
    commentIncludes: ['\u200b', leverage.url],
    commentExcludes: ['1:999', 'Hello'],
  }),
});
cases.push({
  id: 'F-pay-tie',
  class: 'faq',
  kind: 'single',
  text: 'How can I pay for the challenge?',
  topic: 'conversation.user.replied',
  createdAgo: 1000,
  model: 'ACTION: REPLY\nUse a card.',
  expect: {
    successComments: 1,
    successNotes: 0,
    successAssigns: 0,
    commentEquals: CLARIFIER,
    commentExcludes: ['Hello'],
    secrets: [],
  },
});

function sequence(id, klass, steps, expect) {
  cases.push({ id, class: klass, kind: 'sequence', steps, expect });
}

sequence('F-after-password', 'faq', [
  { text: 'What password criteria do you use?', topic: 'conversation.user.created', createdAgo: 5, model: 'ACTION: REPLY\n' },
  { text: 'How does the challenge work?', topic: 'conversation.user.replied', createdAgo: 1000, model: 'ACTION: REPLY\n[secret] should not be here' },
], {
  successCommentsMin: 2,
  lastComments: 1,
  lastCommentEquals: challenge.body,
  commentIncludes: ['\u200b', challenge.url],
  commentExcludes: ['[secret]', POLICY],
  zwsp: true,
  bodySha256: crypto.createHash('sha256').update(challenge.body, 'utf8').digest('hex'),
  secrets: [],
});

sequence('F-after-secret-reply', 'faq', [
  {
    text: 'what are the trading days? password: ' + LABELED + ' ' + NOISE,
    topic: 'conversation.user.replied',
    createdAgo: 1000,
    priorBot: true,
    model: 'ACTION: REPLY\nTrading days are Monday through Friday.',
  },
  {
    text: 'What is the leverage?',
    topic: 'conversation.user.replied',
    createdAgo: 1000,
    priorBot: true,
    model: 'ACTION: REPLY\n[secret] ' + LABELED,
  },
], {
  successCommentsMin: 2,
  lastComments: 1,
  lastCommentEquals: leverage.body,
  commentIncludes: ['\u200b', leverage.url],
  commentExcludes: ['[secret]', LABELED, NOISE],
  secrets: [LABELED, NOISE],
  zwsp: true,
  bodySha256: crypto.createHash('sha256').update(leverage.body, 'utf8').digest('hex'),
});

sequence('F-after-secret-challenge', 'faq', [
  {
    text: 'what are the trading days? ' + NOISE,
    topic: 'conversation.user.replied',
    createdAgo: 1000,
    model: 'ACTION: REPLY\nTrading days are Monday through Friday. ' + NOISE,
  },
  {
    text: 'How does the challenge work?',
    topic: 'conversation.user.replied',
    createdAgo: 1000,
    model: 'ACTION: REPLY\n[secret]',
  },
], {
  lastCommentEquals: challenge.body,
  commentExcludes: [NOISE, '[secret]'],
  secrets: [NOISE],
  zwsp: true,
  successCommentsMin: 1,
});

const SUPPORTED = [
  'The DLL is 5%.',
  'The MLL is 8%.',
  'DLL is 5%.',
  'MLL is 8%.',
  'The daily loss limit is 5%.',
  'The maximum loss limit is 8%.',
  'The daily drawdown is 3%.',
];
const INVENTED = ['The DLL is 99%.', 'The daily drawdown is 8%.'];
for (const draft of SUPPORTED) {
  for (const route of [PATHS[1], PATHS[2]]) {
    cases.push({
      id: 'G-ok-' + route.id + '-' + crypto.createHash('sha256').update(draft).digest('hex').slice(0, 6),
      class: 'figure',
      kind: 'single',
      path: route.id,
      text: 'what are the trading days?',
      topic: route.topic,
      createdAgo: route.createdAgo,
      priorBot: route.priorBot,
      model: 'ACTION: REPLY\n' + draft,
      figureEvidence: 'DLL 5%/3%, MLL 8%.',
      expect: {
        successComments: 1,
        successNotes: 0,
        successAssigns: 0,
        commentEquals: draft,
        commentExcludes: [HEDGE],
        secrets: [],
      },
    });
  }
}
for (const draft of INVENTED) {
  for (const route of [PATHS[1], PATHS[2]]) {
    cases.push({
      id: 'G-bad-' + route.id + '-' + crypto.createHash('sha256').update(draft).digest('hex').slice(0, 6),
      class: 'figure',
      kind: 'single',
      path: route.id,
      text: 'what are the trading days?',
      topic: route.topic,
      createdAgo: route.createdAgo,
      priorBot: route.priorBot,
      model: 'ACTION: REPLY\n' + draft,
      figureEvidence: 'DLL 5%/3%, MLL 8%.',
      expect: {
        successCommentsMax: 1,
        successNotes: 0,
        successAssigns: 0,
        commentExcludes: [draft, draft.match(/\d+%/)[0]],
        secrets: [],
      },
    });
  }
}
sequence('G-after-password', 'figure', [
  { text: 'What password criteria do you use?', topic: 'conversation.user.created', createdAgo: 5, model: 'ACTION: REPLY\n' },
  { text: 'what are the trading days?', topic: 'conversation.user.replied', createdAgo: 1000, priorBot: true, model: 'ACTION: REPLY\nThe DLL is 5%.', figureEvidence: 'DLL 5%/3%, MLL 8%.' },
], {
  lastCommentEquals: 'The DLL is 5%.',
  commentExcludes: [POLICY, HEDGE],
  secrets: [],
  successCommentsMin: 1,
});
sequence('G-after-secret', 'figure', [
  { text: 'what are the trading days? password: ' + LABELED, topic: 'conversation.user.replied', createdAgo: 1000, priorBot: true, model: 'ACTION: REPLY\nTrading days are Monday through Friday.' },
  { text: 'what are the trading days?', topic: 'conversation.user.replied', createdAgo: 1000, priorBot: true, model: 'ACTION: REPLY\nThe MLL is 8%.', figureEvidence: 'DLL 5%/3%, MLL 8%.' },
], {
  lastCommentEquals: 'The MLL is 8%.',
  commentExcludes: [LABELED, HEDGE],
  secrets: [LABELED],
});

const PRESERVE_MODELS = [
  'Your order ID is ' + ORDER + ' and your MT5 login is ' + MT5 + '.',
  'Order ' + ORDER_ALT + ' is open. MT5 login ' + MT5_SHORT + '.',
  'The numeric order is ' + ORDER_NUM + ' and the MT5 login is ' + MT5_MID + '.',
  'Track it at ' + FAQ_URL + ' using order ' + ORDER + '.',
  'Receipt https://files.example.com/orders/' + ORDER + '/receipt and MT5 ' + MT5 + '.',
];
for (let i = 0; i < PRESERVE_MODELS.length; i++) {
  const model = PRESERVE_MODELS[i];
  cases.push({
    id: 'K-model-' + i,
    class: 'preserve',
    kind: 'single',
    text: 'what are the trading days?',
    topic: 'conversation.user.replied',
    createdAgo: 1000,
    priorBot: true,
    model: 'ACTION: REPLY\n' + model,
    expect: {
      successComments: 1,
      commentIncludes: [ORDER, ORDER_ALT, ORDER_NUM, MT5, MT5_SHORT, MT5_MID, FAQ_URL].filter((tok) => model.includes(tok)),
      secrets: [],
    },
  });
  cases.push({
    id: 'K-customer-' + i,
    class: 'preserve',
    kind: 'single',
    text: 'what are the trading days? my order id is ' + ORDER + ' and my MT5 login is ' + MT5 + ' ' + FAQ_URL,
    topic: 'conversation.user.replied',
    createdAgo: 1000,
    priorBot: true,
    model: 'ACTION: REPLY\n' + model,
    expect: {
      successComments: 1,
      commentIncludes: [ORDER, MT5, FAQ_URL].filter((tok) => model.includes(tok) || true).filter((tok) => model.includes(tok)),
      promptMustInclude: [ORDER, MT5, FAQ_URL],
      secrets: [],
    },
  });
}

cases.push({
  id: 'K-labeled-order-is-secret',
  class: 'reply-secret',
  kind: 'single',
  text: 'what are the trading days? password: ' + ORDER,
  topic: 'conversation.user.replied',
  createdAgo: 1000,
  priorBot: true,
  model: 'ACTION: REPLY\nTrading days are Monday through Friday. password ' + ORDER,
  secrets: [ORDER],
  expect: {
    successComments: 1,
    commentIncludes: ['Monday'],
    commentExcludes: [ORDER],
    promptMustExclude: [ORDER],
    secrets: [ORDER],
  },
});

for (const route of [PATHS[1], PATHS[2]]) {
  for (const mode of SECRET_MODES) {
    if (mode.id === 'none') continue;
    cases.push({
      id: 'R-' + route.id + '-' + mode.id,
      class: 'reply-secret',
      kind: 'single',
      path: route.id,
      text: 'what are the trading days?' + mode.suffix,
      topic: route.topic,
      createdAgo: route.createdAgo,
      priorBot: route.priorBot,
      model: 'ACTION: REPLY\nTrading days are Monday through Friday. Ref ' + mode.secrets.join(' ') + ' Order ' + ORDER + ' MT5 ' + MT5,
      secrets: mode.secrets,
      expect: {
        successComments: 1,
        successNotes: 0,
        successAssigns: 0,
        commentIncludes: ['Monday', ORDER, MT5],
        commentExcludes: mode.secrets,
        promptMustExclude: mode.secrets,
        promptMustInclude: [ORDER, MT5],
        secrets: mode.secrets,
      },
    });
  }
}

const RECOVERY_LANGS = [
  ['en', 'please get me a human', LINES.en],
  ['hi', 'मुझे agent से बात करनी है', LINES.hi],
  ['ur', 'مجھے staff چاہیے', LINES.ur],
  ['ar', 'أريد human', LINES.ar],
  ['rom', 'janab mujhe agent chahiye', LINES.ur],
];
const FAILS = ['400', '403', '404', '409', '422', '500', '502', '503', 'timeout'];
for (const [lang, text, line] of RECOVERY_LANGS) {
  for (const route of PATHS) {
    for (const fail of FAILS) {
      cases.push({
        id: 'C-' + lang + '-' + route.id + '-' + fail,
        class: 'recovery',
        kind: 'comment-miss',
        lang,
        path: route.id,
        text: text + ' password: ' + LABELED + ' ' + NOISE,
        followup: 'just checking in',
        topic: route.topic,
        createdAgo: route.createdAgo,
        priorBot: route.priorBot,
        fail,
        secrets: [LABELED, NOISE],
        expect: {
          line,
          successComments: 1,
          successAssigns: 1,
          lastComments: 1,
          lastNotes: 0,
          lastAssigns: 0,
          lastCommentEquals: line,
          commentAttemptMax: 1,
          secrets: [LABELED, NOISE],
        },
      });
    }
  }
}
for (const [lang, text, line] of RECOVERY_LANGS) {
  for (const followup of ['hello again', 'any update?']) {
    cases.push({
      id: 'W-' + lang + '-' + (followup === 'hello again' ? 'hello' : 'update'),
      class: 'recovery',
      kind: 'wiped-store',
      lang,
      text,
      followup,
      secrets: [],
      expect: {
        line,
        successComments: 1,
        successNotes: 0,
        successAssigns: 0,
        commentEquals: line,
        secrets: [],
      },
    });
  }
  cases.push({
    id: 'W-' + lang + '-secret',
    class: 'recovery',
    kind: 'wiped-store',
    lang,
    text: text + ' password: ' + HUNTER,
    followup: 'hello again',
    secrets: [HUNTER],
    expect: {
      line,
      successComments: 1,
      successNotes: 0,
      successAssigns: 0,
      commentEquals: line,
      secrets: [HUNTER],
    },
  });
}
for (const [lang, text, line] of RECOVERY_LANGS) {
  for (const route of PATHS) {
    cases.push({
      id: 'U-' + lang + '-' + route.id,
      class: 'recovery',
      kind: 'human',
      lang,
      path: route.id,
      text,
      followup: 'just checking in',
      topic: route.topic,
      createdAgo: route.createdAgo,
      priorBot: route.priorBot,
      fail: '500',
      secrets: [],
      expect: {
        successComments: 0,
        lastComments: 0,
        lastNotes: 0,
        lastAssigns: 0,
        secrets: [],
      },
    });
    cases.push({
      id: 'D-' + lang + '-' + route.id,
      class: 'recovery',
      kind: 'duplicate',
      lang,
      path: route.id,
      text,
      topic: route.topic,
      createdAgo: route.createdAgo,
      priorBot: route.priorBot,
      secrets: [],
      expect: {
        line,
        successComments: 1,
        successAssigns: 1,
        lastComments: 0,
        lastNotes: 0,
        lastAssigns: 0,
        secrets: [],
      },
    });
  }
}
for (const [lang, text, line] of RECOVERY_LANGS) {
  for (const route of [PATHS[0], PATHS[2]]) {
    cases.push({
      id: 'S-' + lang + '-' + route.id,
      class: 'recovery',
      kind: 'restart',
      lang,
      path: route.id,
      text,
      followup: 'just checking in',
      topic: route.topic,
      createdAgo: route.createdAgo,
      priorBot: route.priorBot,
      fail: 'timeout',
      secrets: [],
      expect: {
        line,
        successComments: 1,
        lastComments: 1,
        lastNotes: 0,
        lastAssigns: 0,
        lastCommentEquals: line,
        secrets: [],
      },
    });
  }
}
for (const fail of ['422', '500', 'timeout', '429']) {
  for (const route of [PATHS[0], PATHS[2]]) {
    cases.push({
      id: 'B-en-' + route.id + '-' + fail,
      class: 'recovery',
      kind: 'bounded',
      lang: 'en',
      path: route.id,
      text: 'please get me a human',
      followup: 'hello again',
      topic: route.topic,
      createdAgo: route.createdAgo,
      priorBot: route.priorBot,
      fail,
      secrets: [],
      expect: {
        line: LINES.en,
        commentAttemptMax: fail === '429' ? 3 : 1,
        lastComments: 1,
        lastNotes: 0,
        lastAssigns: 0,
        lastCommentEquals: LINES.en,
        successAssignsMax: 1,
        secrets: [],
      },
    });
  }
}
for (const langPack of [RECOVERY_LANGS[1], RECOVERY_LANGS[3]]) {
  cases.push({
    id: 'B-' + langPack[0] + '-429',
    class: 'recovery',
    kind: 'bounded',
    lang: langPack[0],
    path: 'fin',
    text: langPack[1],
    followup: 'hello again',
    topic: 'conversation.user.created',
    createdAgo: 5,
    fail: '429',
    secrets: [],
    expect: {
      line: langPack[2],
      commentAttemptMax: 3,
      lastCommentEquals: langPack[2],
      lastNotes: 0,
      lastAssigns: 0,
      successAssignsMax: 1,
      secrets: [],
    },
  });
}

const ids = new Set();
for (const c of cases) {
  if (ids.has(c.id)) throw new Error('duplicate id ' + c.id);
  ids.add(c.id);
}
const byClass = {};
for (const c of cases) byClass[c.class] = (byClass[c.class] || 0) + 1;
const doc = {
  seal: 'independent-handoff-r20',
  reviewer: 'independent',
  candidate: SHA,
  notAuthorSuite: true,
  counts: {
    total: cases.length,
    recovery: byClass.recovery || 0,
    byClass,
  },
  lines: LINES,
  policy: POLICY,
  clarifier: CLARIFIER,
  hedge: HEDGE,
  faq: {
    challenge: { url: challenge.url, sha256: crypto.createHash('sha256').update(challenge.body, 'utf8').digest('hex'), zwsp: challenge.body.includes('\u200b') },
    leverage: { url: leverage.url, sha256: crypto.createHash('sha256').update(leverage.body, 'utf8').digest('hex'), zwsp: leverage.body.includes('\u200b') },
  },
  cases,
};
const outPath = path.join(__dirname, 'cases.json');
const json = JSON.stringify(doc);
fs.writeFileSync(outPath, json);
const hash = crypto.createHash('sha256').update(json).digest('hex');
fs.writeFileSync(path.join(__dirname, 'SEAL.txt'), [
  'sealed-set: independent-review/handoff-r20/sealed/cases.json',
  'sha256: ' + hash,
  'bytes: ' + Buffer.byteLength(json),
  'cases: ' + cases.length,
  'recovery: ' + (byClass.recovery || 0),
  'byClass: ' + JSON.stringify(byClass),
  'candidate-under-test: ' + SHA,
  'built-before-execution: true',
  '',
].join('\n'));
console.log(hash);
console.log(JSON.stringify({ total: cases.length, recovery: byClass.recovery, byClass }, null, 2));
