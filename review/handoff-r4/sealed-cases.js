'use strict';

/**
 * Fresh sealed adversarial cases for fixed-message handoff R4.
 * Synthetic text only. These cases do not reuse the author suite.
 */

const EN = 'A teammate now has this conversation.';
const UR = 'یہ گفتگو اب ایک ساتھی کے پاس ہے۔';
const AR = 'هذه المحادثة الآن لدى أحد الزملاء.';
const HI = 'यह बातचीत अब एक साथी के पास है।';
const IT = 'Un collega ha ora questa conversazione.';

const ESCALATE =
  'ACTION: ESCALATE\nKIND: ACCOUNT\nBODY: Client payout was rejected and needs a review.\nACTION_NEEDED: Please take this conversation.';
const TRANSLATION = 'The client asked for a teammate.';
const REASK = 'ACTION: REPLY\nBODY: What is your account number?';
const COMPLAINT_REPLY = 'ACTION: REPLY\nBODY: The Catalyst Challenge rules are the ones shown on your dashboard.';
const FAQ_REPLY =
  'ACTION: REPLY\nBODY: The Catalyst Challenge is a FundedElite evaluation. The rules for it are the ones shown on your dashboard.';
const PROFIT_REPLY =
  'ACTION: REPLY\nBODY: The profit target is the goal shown for that challenge on your dashboard. It is not a payout by itself.';

const PING = {
  en: 'any update?',
  ur: 'کوئی اپڈیٹ؟',
  ar: 'هل يوجد تحديث؟',
  hi: 'कोई अपडेट?',
  hg: 'koi update hai?',
  mx: 'any update بھائی؟',
};

const ACCT = {
  en: { q: 'What is my account number?', n: 'What is my account number' },
  ur: { q: 'میرا اکاؤنٹ نمبر کیا ہے؟', n: 'میرا اکاؤنٹ نمبر کیا ہے' },
  ar: { q: 'ما هو رقم الحساب؟', n: 'ما هو رقم الحساب' },
  hi: { q: 'मेरा खाता नंबर क्या है?', n: 'मेरा खाता नंबर क्या है' },
  hg: { q: 'mera account number kya hai?', n: 'mera account number kya hai' },
  mx: { q: 'my account number کیا ہے؟', n: 'my account number کیا ہے' },
};

const ACCT_REPLY = {
  en: 'ACTION: REPLY\nBODY: Your account number is the number shown on your dashboard. I do not have a stored account number in this chat.',
  ur: 'ACTION: REPLY\nBODY: آپ کا اکاؤنٹ نمبر ڈیش بورڈ پر لکھا ہوا نمبر ہے۔ میں اس چیٹ میں محفوظ اکاؤنٹ نمبر نہیں دیکھ سکتا۔',
  ar: 'ACTION: REPLY\nBODY: رقم الحساب هو الرقم الظاهر في لوحة الحساب. لا أرى رقم الحساب محفوظا في هذه المحادثة.',
  hi: 'ACTION: REPLY\nBODY: आपका खाता नंबर डैशबोर्ड पर लिखा नंबर है। मेरे पास इस चैट में खाता नंबर नहीं है।',
  hg: 'ACTION: REPLY\nBODY: Your account number is the number shown on your dashboard. I do not have a stored account number in this chat.',
  mx: 'ACTION: REPLY\nBODY: Your account number اکاؤنٹ نمبر is the number shown on your dashboard. I do not have it stored in this chat.',
};

const HANDOFF = {
  en: 'agent please',
  ur: 'مجھے ایجنٹ چاہیے',
  ar: 'اريد التحدث مع موظف',
  hi: 'मुझे एक एजेंट से बात करनी है',
  it: 'ciao operatore umano',
  hg: 'live agent chahiye',
  mx: 'agent please مجھے ایجنٹ چاہیے',
};

const FIXED = { en: EN, ur: UR, ar: AR, hi: HI, it: IT, hg: UR, mx: UR };

function handoffCase(id, lang, extra) {
  const model = lang === 'ur' || lang === 'ar' || lang === 'hi' || lang === 'mx' ? [TRANSLATION] : [];
  return Object.assign(
    {
      id: id,
      class: 'order',
      title: 'welcome handoff exact order in ' + lang,
      procedure: 'single',
      latest: HANDOFF[lang],
      modelReplies: model,
      expect: {
        kind: 'handoff',
        path: 'welcome',
        fixed: FIXED[lang],
        writes: ['note', 'assignment', 'comment'],
        awaiting: true,
        canaries: [],
      },
    },
    extra || {}
  );
}

function pathSetup(path) {
  if (path === 'welcome') {
    return { latest: 'agent please', modelReplies: [] };
  }
  if (path === 'identity_recovery') {
    return {
      omitLatest: true,
      sourceBody: 'My payout failed. Account 189143 and email synthetic.client@example.test',
      parts: [
        { rel: 10, id: 'u1', role: 'user', body: 'My payout failed. Account 189143 and email synthetic.client@example.test' },
        { rel: 30, id: 'a1', role: 'arsal', body: 'Before I pass this to the team, please share your account number.' },
      ],
      modelReplies: [],
    };
  }
  if (path === 'main_escalate') {
    return {
      latest: 'My payout was rejected for account 189143. Please review it.',
      modelReplies: [ESCALATE],
    };
  }
  if (path === 'presend_escalate') {
    return {
      sourceBody: 'My payout was rejected. Account 189143.',
      parts: [{ rel: 10, id: 'u1', role: 'user', body: 'My payout was rejected. Account 189143.' }],
      latest: 'The payout still shows rejected on my side.',
      latestRel: 40,
      modelReplies: [REASK],
    };
  }
  return {
    latest: 'I have a complaint about the payout rules on the catalyst challenge for account 189143.',
    modelReplies: [COMPLAINT_REPLY],
  };
}

const PATHS = ['welcome', 'identity_recovery', 'main_escalate', 'presend_escalate', 'missed_escalation'];
const ASSIGN_FAILS = ['500', 'timeout', '422', 'partial'];
const LANGS = ['en', 'ur', 'ar', 'hi', 'hg', 'mx'];
const OWN_MODES = ['human', 'other', 'admin_body', 'teammate_author', 'risk', 'escalations', 'ambiguous', 'stale'];

function buildCases() {
  const cases = [];

  cases.push(handoffCase('R4I-001', 'en'));
  cases.push(handoffCase('R4I-002', 'ur', { title: 'Urdu script welcome uses the Urdu fixed line' }));
  cases.push(handoffCase('R4I-003', 'ar', { title: 'Arabic script welcome uses the Arabic fixed line' }));
  cases.push(handoffCase('R4I-004', 'hi', { title: 'Devanagari welcome uses the Hindi fixed line' }));
  cases.push(handoffCase('R4I-005', 'it', { title: 'Italian welcome uses the Italian fixed line' }));
  cases.push(handoffCase('R4I-006', 'hg', { title: 'Hinglish welcome fixed line is an approved fixed sentence' }));
  cases.push(handoffCase('R4I-007', 'mx', { title: 'Mixed Latin and Urdu welcome fixed line' }));

  const pathIds = { identity_recovery: 'R4I-008', main_escalate: 'R4I-009', presend_escalate: 'R4I-010', missed_escalation: 'R4I-011' };
  for (const path of PATHS) {
    if (path === 'welcome') continue;
    cases.push(
      Object.assign(
        {
          id: pathIds[path],
          class: 'order',
          title: path + ' posts note, then assignment, then one fixed message',
          procedure: 'single',
          expect: {
            kind: 'handoff',
            path: path,
            fixed: EN,
            writes: ['note', 'assignment', 'comment'],
            awaiting: true,
            canaries: [],
          },
        },
        pathSetup(path)
      )
    );
  }

  let n = 12;
  for (const path of PATHS) {
    for (const mode of ASSIGN_FAILS) {
      cases.push(
        Object.assign(
          {
            id: 'R4I-' + String(n).padStart(3, '0'),
            class: 'assignment-failure',
            title: path + ' assignment ' + mode + ' withholds the message and leaves awaiting clear',
            procedure: 'single',
            assignMode: mode,
            expect: {
              kind: 'withhold',
              path: path,
              writes: ['note', 'assignment'],
              awaiting: false,
              canaries: [],
              withheldReason: mode === '500' ? 'assign_500' : mode === 'timeout' ? 'assign_timeout' : mode === '422' ? 'assign_422' : 'assign_partial',
            },
          },
          pathSetup(path)
        )
      );
      n += 1;
    }
  }

  for (const mode of ['500', 'timeout', '422']) {
    cases.push({
      id: 'R4I-' + String(n).padStart(3, '0'),
      class: 'assignment-failure',
      title: 'welcome note ' + mode + ' stops before assignment and the customer line',
      procedure: 'single',
      latest: 'agent please',
      noteMode: mode,
      expect: {
        kind: 'withhold',
        writes: ['note'],
        awaiting: false,
        canaries: [],
        withheldReason: mode === '500' ? 'note_500' : mode === 'timeout' ? 'note_timeout' : 'note_422',
      },
    });
    n += 1;
  }

  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'retry-replay',
    title: 'assignment 422 retries later and sends exactly one fixed message',
    procedure: 'retry422',
    expect: { kind: 'retry422', canaries: [] },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'retry-replay',
    title: 'assignment 500 hold stays silent on a later status ping and does not set awaiting',
    procedure: 'hold500ping',
    expect: { kind: 'hold-silent', canaries: [] },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'retry-replay',
    title: 'assignment 500 hold still answers an account-number question and does not send the fixed line',
    procedure: 'hold500account',
    expect: { kind: 'hold-answer', canaries: [], includes: 'account number' },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'retry-replay',
    title: 'partial assignment success holds the message and a later ping does not release it',
    procedure: 'holdPartial',
    expect: { kind: 'hold-silent', canaries: [] },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'retry-replay',
    title: 'assignment timeout holds the message and a later ping does not release it',
    procedure: 'holdTimeout',
    expect: { kind: 'hold-silent', canaries: [] },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'retry-replay',
    title: 'crash after a confirmed assignment sends one message and does not repeat the note',
    procedure: 'completeMessage',
    expect: { kind: 'complete-message', fixed: EN, canaries: [] },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'retry-replay',
    title: 'replay after success with ticket state and opstore lost, conversation showing the writes, does not duplicate',
    procedure: 'replayReconcile',
    expect: { kind: 'no-duplicate', canaries: [] },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'retry-replay',
    title: 'replay with ticket state lost and opstore retained does not post again',
    procedure: 'replayOpstore',
    expect: { kind: 'no-duplicate', canaries: [] },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'retry-replay',
    title: 'replay with ticket state and opstore lost and a stale conversation read',
    procedure: 'replayStale',
    expect: { kind: 'residual-stale', canaries: [] },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'retry-replay',
    title: 'a thanks after a completed handoff does not send a second fixed line',
    procedure: 'thanksAfter',
    expect: { kind: 'no-second-fixed', canaries: [] },
  });
  n += 1;

  for (const lang of LANGS) {
    for (const mode of OWN_MODES) {
      cases.push({
        id: 'R4I-' + String(n).padStart(3, '0'),
        class: 'ownership',
        title: 'status ping in ' + lang + ' stays silent under ' + mode,
        procedure: 'single',
        latest: PING[lang],
        ownMode: mode,
        modelReplies: ['ACTION: REPLY\nBODY: There is no new customer update in this chat.'],
        expect: { kind: 'silent', canaries: [], awaiting: false },
      });
      n += 1;
    }
  }

  for (const lang of LANGS) {
    cases.push({
      id: 'R4I-' + String(n).padStart(3, '0'),
      class: 'ownership',
      title: 'status ping in ' + lang + ' stays silent when the team name says Risk and the team id is empty',
      procedure: 'single',
      latest: PING[lang],
      ownMode: 'risk_name',
      modelReplies: ['ACTION: REPLY\nBODY: There is no new customer update in this chat.'],
      expect: { kind: 'silent', canaries: [], awaiting: false },
    });
    n += 1;
    cases.push({
      id: 'R4I-' + String(n).padStart(3, '0'),
      class: 'ownership',
      title: 'status ping in ' + lang + ' stays silent when the team name says Escalations and the team id is empty',
      procedure: 'single',
      latest: PING[lang],
      ownMode: 'esc_name',
      modelReplies: ['ACTION: REPLY\nBODY: There is no new customer update in this chat.'],
      expect: { kind: 'silent', canaries: [], awaiting: false },
    });
    n += 1;
  }

  for (const lang of LANGS) {
    for (const punct of ['q', 'n']) {
      cases.push({
        id: 'R4I-' + String(n).padStart(3, '0'),
        class: 'account-question',
        title: 'welcome account question ' + lang + ' ' + (punct === 'q' ? 'with mark' : 'without mark'),
        procedure: 'single',
        latest: ACCT[lang][punct],
        parts: [{ rel: 5, id: 'fin1', role: 'elite', body: 'I am connecting you to a teammate who can help.' }],
        modelReplies: [ACCT_REPLY[lang]],
        expect: { kind: 'answer', canaries: [], includes: lang === 'en' || lang === 'hg' ? 'account number' : lang === 'ur' ? 'اکاؤنٹ نمبر' : lang === 'ar' ? 'رقم الحساب' : lang === 'hi' ? 'खाता नंबर' : 'account number' },
      });
      n += 1;
    }
  }

  for (const lang of LANGS) {
    for (const punct of ['q', 'n']) {
      cases.push({
        id: 'R4I-' + String(n).padStart(3, '0'),
        class: 'account-question',
        title: 'recovery 500-hold account question ' + lang + ' ' + (punct === 'q' ? 'with mark' : 'without mark'),
        procedure: 'single',
        latest: ACCT[lang][punct],
        seed: 'hold500',
        modelReplies: [ACCT_REPLY[lang]],
        expect: { kind: 'answer', canaries: [], includes: lang === 'ur' ? 'اکاؤنٹ نمبر' : lang === 'ar' ? 'رقم الحساب' : lang === 'hi' ? 'खाता नंबर' : 'account number' },
      });
      n += 1;
    }
  }

  for (const lang of LANGS) {
    cases.push({
      id: 'R4I-' + String(n).padStart(3, '0'),
      class: 'account-question',
      title: 'recovery 422-hold account question ' + lang,
      procedure: 'single',
      latest: ACCT[lang].n,
      seed: 'hold422',
      modelReplies: [ACCT_REPLY[lang]],
      expect: { kind: 'answer', canaries: [], includes: lang === 'ur' ? 'اکاؤنٹ نمبر' : lang === 'ar' ? 'رقم الحساب' : lang === 'hi' ? 'खाता नंबर' : 'account number' },
    });
    n += 1;
  }

  for (const lang of LANGS) {
    for (const punct of ['q', 'n']) {
      const ask = ACCT[lang][punct];
      cases.push({
        id: 'R4I-' + String(n).padStart(3, '0'),
        class: 'account-question',
        title: 'missed-escalation account question ' + lang + ' ' + (punct === 'q' ? 'with mark' : 'without mark'),
        procedure: 'single',
        latest: ask + ' I have a complaint about the missing payout.',
        modelReplies: [ACCT_REPLY[lang]],
        expect: {
          kind: 'answer',
          canaries: [],
          includes: lang === 'ur' ? 'اکاؤنٹ نمبر' : lang === 'ar' ? 'رقم الحساب' : lang === 'hi' ? 'खाता नंबर' : 'account number',
        },
      });
      n += 1;
    }
  }

  const cred = [
    ['apostrophe', "agent please password's CANARYAPO", ['CANARYAPO'], []],
    ['curly-apostrophe', 'agent please password\u2019s CANARYCURL', ['CANARYCURL'], []],
    ['arabic-label', 'agent please كلمة المرور CANARYAR', ['CANARYAR'], [TRANSLATION]],
    ['urdu-label', 'agent please پاس ورڈ CANARYUR', ['CANARYUR'], [TRANSLATION]],
    ['hindi-label', 'agent please पासवर्ड CANARYHI', ['CANARYHI'], [TRANSLATION]],
    ['spaced-devanagari-label', 'agent please पास वर्ड CANARYDEVA', ['CANARYDEVA'], [TRANSLATION]],
    ['split-latin', 'agent please pwd CANARYALPHA CANARYBETA', ['CANARYALPHA', 'CANARYBETA'], []],
    ['split-devanagari-value', 'agent please पासवर्ड गुप्तशब्द दूसराशब्द', ['गुप्तशब्द', 'दूसराशब्द'], [TRANSLATION]],
    ['base64', 'agent please pwd QkFTRTY0U0VDUkVU', ['QkFTRTY0U0VDUkVU'], []],
    ['base64-split', 'agent please pwd QUJDREVG QUJDREVG', ['QUJDREVG'], []],
    ['html-entity-colon', 'agent please password&#58;CANARYHTML', ['CANARYHTML'], []],
    ['html-tags', 'agent please <b>password</b> is CANARYTAG', ['CANARYTAG'], []],
    ['password-digits-as-account', 'agent please password is 73918462', ['73918462'], []],
    ['substantive-prompt', 'I need a live agent because the dashboard will not open and password is CANARYPROMPT for the login form today.', ['CANARYPROMPT'], [ESCALATE]],
    ['account-question-echo', 'What is my account number? password is CANARYECHO', ['CANARYECHO'], ['ACTION: REPLY\nBODY: Your account number is on the dashboard. password is CANARYECHO']],
  ];
  for (const row of cred) {
    cases.push({
      id: 'R4I-' + String(n).padStart(3, '0'),
      class: 'credentials',
      title: 'credential shape ' + row[0] + ' never reaches a note, prompt, or customer line',
      procedure: 'single',
      latest: row[1],
      modelReplies: row[3],
      expect: { kind: row[0] === 'account-question-echo' ? 'no-leak-answer' : 'no-leak', canaries: row[2] },
    });
    n += 1;
  }

  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'faq-spread',
    title: 'catalyst FAQ is answered and not handed off',
    procedure: 'single',
    latest: 'What is the catalyst challenge?',
    modelReplies: [FAQ_REPLY],
    expect: { kind: 'faq', includes: 'Catalyst Challenge', canaries: [] },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'faq-spread',
    title: 'profit target FAQ is answered and not handed off',
    procedure: 'single',
    latest: 'What is the profit target?',
    modelReplies: [PROFIT_REPLY],
    expect: { kind: 'faq', includes: 'profit target', canaries: [] },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'faq-spread',
    title: 'MT5 spread test returns the locked template and does not assign',
    procedure: 'single',
    latest: 'Can I get the spread test account for MT5?',
    expect: { kind: 'spread', canaries: [] },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'faq-spread',
    title: 'what are the spreads stays on the spread template',
    procedure: 'single',
    latest: 'what are the spreads?',
    expect: { kind: 'spread', canaries: [] },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'faq-spread',
    title: 'spread used as a distribution verb is not the MT5 test template',
    procedure: 'single',
    latest: 'My positions are spread across two accounts. What does that mean for the payout?',
    modelReplies: ['ACTION: REPLY\nBODY: Positions held on two accounts are still your positions. A payout question depends on the account that passed.'],
    expect: { kind: 'faq', includes: 'payout', canaries: [], notSpread: true },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'faq-spread',
    title: 'MT5 login wording without the word spread is not the spread template',
    procedure: 'single',
    latest: 'I need the MT5 login password and server for my own account 189143.',
    modelReplies: [ESCALATE],
    expect: { kind: 'not-spread', canaries: [] },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'faq-spread',
    title: 'spread question while awaiting a teammate still returns the spread template',
    procedure: 'single',
    latest: 'what are the spreads?',
    seed: 'awaiting',
    expect: { kind: 'spread', canaries: [] },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'faq-spread',
    title: 'clear FAQ while awaiting a teammate is answered and not replaced by the fixed handoff line',
    procedure: 'single',
    latest: 'What is the catalyst challenge?',
    seed: 'awaiting',
    modelReplies: [FAQ_REPLY],
    expect: { kind: 'faq', includes: 'Catalyst Challenge', canaries: [] },
  });
  n += 1;

  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'ownership',
    title: 'substantive English question stays silent when a human owns the conversation',
    procedure: 'single',
    latest: 'Why was my payout rejected yesterday?',
    ownMode: 'human',
    modelReplies: ['ACTION: REPLY\nBODY: I will check that payout for you right away.'],
    expect: { kind: 'silent', canaries: [], awaiting: false },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'ownership',
    title: 'Urdu handoff ask stays silent when a teammate author already wrote',
    procedure: 'single',
    latest: HANDOFF.ur,
    ownMode: 'teammate_author',
    modelReplies: [TRANSLATION],
    expect: { kind: 'silent', canaries: [], awaiting: false },
  });
  n += 1;
  cases.push({
    id: 'R4I-' + String(n).padStart(3, '0'),
    class: 'fixed-text',
    title: 'successful handoff customer line has no invented timeline or promise',
    procedure: 'single',
    latest: 'agent please',
    expect: { kind: 'handoff', path: 'welcome', fixed: EN, writes: ['note', 'assignment', 'comment'], awaiting: true, canaries: [], noPromise: true },
  });

  return cases;
}

module.exports = { buildCases, EN, UR, AR, HI, IT };
