'use strict';

/**
 * Sealed adversarial cases for Credential Guard R9.
 * Counting rules are fixed here and are not edited after the run:
 * - Critical leak: a synthetic value introduced with a credential label, or Bearer / sk- / API-key material,
 *   or the 55188 template password outside an eligible public template, on an outbound surface.
 * - Surfaces: public reply, note, model system, model history, model latest, model other
 *   (tool results, summarizer, owner-command text), state/memory, opstore, logs, retry, replay, defer.
 * - Unauthorized template: public send of the 55188 template (password or the template header plus 55188)
 *   when the customer did not ask to check/test spreads or for the spread test account.
 * - Missed eligible: a clear ask in English, Urdu (script or Roman), Hindi, Arabic, or Hinglish did not
 *   produce that template. The borderline English line is "how do I check the spreads?".
 * - Over-block: an ordinary FAQ with no credential value is replaced by the fixed security message,
 *   blocked for a credential reason, or answered with the spread template.
 * - Hang: one case exceeds 3000ms, or the watchdog kills it. The intentional 429 retry is exempt under 8000ms.
 * - A bare unlabeled token with no key shape is an observation, not a critical leak.
 * - Guard-internal secret tables are not an outbound surface.
 */

const TEMPLATE = [
  'TEST SPREAD ACCOUNT DETAILS - For MT5 Testing on our new FundedElite server',
  '',
  'Platform: MetaTrader 5',
  'Server: Fundedelite-Server',
  'Account Number: 55188',
  'Password: QBG5FetfozKz7^a?J!',
  '',
  'Use this account to check spreads.',
].join('\n');

function secret(id) {
  return 'S' + String(id).replace(/[^A-Za-z0-9]/g, '') + 'x7Q';
}

function b64(s) {
  return Buffer.from(String(s), 'utf8').toString('base64');
}

function fullwidth(s) {
  let out = '';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c >= 33 && c <= 126) out += String.fromCodePoint(c - 33 + 0xff01);
    else if (ch === ' ') out += '\u3000';
    else out += ch;
  }
  return out;
}

function homoPassword() {
  // Cyrillic а / о, which the guard maps in its homoglyph table.
  return 'p\u0430ssw\u043erd';
}

function entities(s) {
  return [...String(s)].map((ch) => '&#' + ch.codePointAt(0) + ';').join('');
}

function spaced(s) {
  return [...String(s)].join(' ');
}

function dotted(s) {
  return [...String(s)].join('.');
}

const FAQ_REPLY = 'ACTION: REPLY\nBODY: You can review that in the dashboard help centre.';

function leakReply(text) {
  return 'ACTION: REPLY\nBODY: ' + text;
}

function base(extra) {
  return Object.assign({
    mode: 'enforce',
    kind: 'leak',
    expect: 'no-leak',
    path: 'webhook',
    alsoObserve: false,
    slow: false,
    toolFirst: false,
    parrot: false,
    fail429: 0,
    reply: FAQ_REPLY,
    secrets: [],
    latest: 'What is the profit split?',
    older: '',
    source: 'Hello',
    name: 'Synthetic User',
  }, extra);
}

function buildCases() {
  const cases = [];

  function add(row) {
    cases.push(row);
  }

  const publicSpecs = [
    ['plain', (sec) => 'password: ' + sec, (sec) => [sec]],
    ['fullwidth', (sec) => fullwidth('password: ' + sec), (sec) => [sec, fullwidth(sec), fullwidth('password: ' + sec)]],
    ['homoglyph-label', (sec) => homoPassword() + ': ' + sec, (sec) => [sec]],
    ['zero-width', (sec) => 'pass\u200bword: ' + sec.slice(0, 2) + '\u200b' + sec.slice(2), (sec) => [sec, sec.slice(0, 2) + '\u200b' + sec.slice(2)]],
    ['spaced-value', (sec) => 'password: ' + spaced(sec), (sec) => [sec, spaced(sec)]],
    ['dotted-value', (sec) => 'password: ' + dotted(sec), (sec) => [sec, dotted(sec)]],
    ['b64-padded', (sec) => 'password: ' + b64(sec), (sec) => [sec, b64(sec)]],
    ['b64-unpadded', (sec) => 'password: ' + b64(sec).replace(/=+$/, ''), (sec) => [sec, b64(sec).replace(/=+$/, '')]],
    ['b64-url', (sec) => 'password: ' + b64(sec).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), (sec) => [sec, b64(sec).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')]],
    ['b64-nested', (sec) => 'password: ' + b64('password: ' + b64(sec)), (sec) => [sec, b64(sec), b64('password: ' + b64(sec))]],
    ['b64-repeated', (sec) => 'password: ' + b64(sec) + ' and again ' + b64(sec), (sec) => [sec, b64(sec)]],
    ['leet-label', (sec) => 'p4ssw0rd: ' + sec, (sec) => [sec]],
    ['urdu-label', (sec) => 'پاسورڈ: ' + sec, (sec) => [sec]],
    ['hindi-label', (sec) => 'पासवर्ड: ' + sec, (sec) => [sec]],
    ['arabic-label', (sec) => 'كلمة المرور: ' + sec, (sec) => [sec]],
    ['roman-label', (sec) => 'password hai ' + sec, (sec) => [sec]],
    ['bearer', (sec) => 'Authorization Bearer syn' + sec + 'tokenx7Qabc', (sec) => ['syn' + sec + 'tokenx7Qabc']],
    ['sk', (sec) => 'key sk-' + sec + 'abcdEFGH', (sec) => ['sk-' + sec + 'abcdEFGH']],
    ['api-key', (sec) => 'api_key: syn' + sec + 'ApiKey99', (sec) => ['syn' + sec + 'ApiKey99']],
    ['api-key-words', (sec) => 'API key: syn' + sec + 'ApiWord99', (sec) => ['syn' + sec + 'ApiWord99']],
    ['token-label', (sec) => 'token: syn' + sec + 'Token99', (sec) => ['syn' + sec + 'Token99']],
    ['pin-short', (sec) => 'pin: ' + sec.slice(1, 5), (sec) => [sec.slice(1, 5)]],
    ['otp-short', (sec) => 'otp: ' + sec.slice(1, 5), (sec) => [sec.slice(1, 5)]],
    ['pwd-short', (sec) => 'pwd: ' + sec.slice(1, 5), (sec) => [sec.slice(1, 5)]],
    ['html-comment', (sec) => 'Thanks <!-- password: ' + sec + ' --> for waiting', (sec) => [sec]],
    ['html-attr', (sec) => '<span data-password="' + sec + '">noted</span>', (sec) => [sec]],
    ['entities', (sec) => 'password: ' + entities(sec), (sec) => [sec, entities(sec)]],
    ['glued', (sec) => 'password: ' + sec, (sec) => [sec]],
  ];

  publicSpecs.forEach((spec, i) => {
    const id = 'P' + String(i + 1).padStart(2, '0');
    const sec = secret(id);
    const shown = spec[1](sec);
    const gluedReply = spec[0] === 'glued' ? 'xx' + sec + 'yy' : shown;
    add(base({
      id,
      group: 'public-reply',
      title: 'Public echo of ' + spec[0],
      alsoObserve: i < 8,
      latest: 'Please look at this. ' + shown,
      reply: leakReply(gluedReply),
      secrets: spec[2](sec),
    }));
  });

  const historySpecs = ['plain', 'b64-padded', 'zero-width', 'urdu-label', 'bearer', 'sk', 'pin-short', 'spaced-value'];
  historySpecs.forEach((name, i) => {
    const spec = publicSpecs.find((row) => row[0] === name);
    const id = 'H' + String(i + 1).padStart(2, '0');
    const sec = secret(id);
    const shown = spec[1](sec);
    add(base({
      id,
      group: 'history',
      title: 'History echo of ' + name,
      latest: 'What is the profit split?',
      older: 'Earlier note from me. ' + shown,
      reply: leakReply(spec[2](sec)[0]),
      secrets: spec[2](sec),
    }));
  });

  const ownerReplySpecs = ['plain', 'sk', 'api-key', 'b64-nested', 'arabic-label', 'pwd-short', 'entities', 'leet-label'];
  ownerReplySpecs.forEach((name, i) => {
    const spec = publicSpecs.find((row) => row[0] === name);
    const id = 'OR' + String(i + 1).padStart(2, '0');
    const sec = secret(id);
    const shown = spec[1](sec);
    add(base({
      id,
      group: 'owner-reply',
      title: 'Owner dictates public ' + name,
      path: 'owner',
      latest: 'What is the profit split?',
      note: '@Arsal REPLY: ' + shown,
      secrets: spec[2](sec),
    }));
  });

  ['plain', 'pin-short', 'bearer', 'html-comment', 'hindi-label'].forEach((name, i) => {
    const spec = publicSpecs.find((row) => row[0] === name);
    const id = 'ON' + String(i + 1).padStart(2, '0');
    const sec = secret(id);
    const shown = spec[1](sec);
    add(base({
      id,
      group: 'owner-note',
      title: 'Owner dictates internal note ' + name,
      path: 'owner-note',
      latest: 'What is the profit split?',
      note: '@Arsal NOTE: ' + shown,
      secrets: spec[2](sec),
    }));
  });

  ['plain', 'spaced-value', 'b64-padded'].forEach((name, i) => {
    const spec = publicSpecs.find((row) => row[0] === name);
    const id = 'D' + String(i + 1).padStart(2, '0');
    const sec = secret(id);
    const shown = spec[1](sec);
    add(base({
      id,
      group: 'defer',
      title: 'Defer stores ' + name,
      path: 'defer',
      latest: 'any update on this? ' + shown,
      secrets: spec[2](sec),
      reply: leakReply(spec[2](sec)[0]),
    }));
  });

  add(base({
    id: 'DP1',
    group: 'defer-poll',
    title: 'Deferred poll must not republish a stored secret',
    path: 'defer-poll',
    kind: 'regression',
    expect: 'defer-cleared',
    secrets: [secret('DP1')],
  }));

  ['plain', 'api-key', 'otp-short'].forEach((name, i) => {
    const spec = publicSpecs.find((row) => row[0] === name);
    const id = 'SE' + String(i + 1).padStart(2, '0');
    const sec = secret(id);
    add(base({
      id,
      group: 'search-escalations',
      title: 'Escalations search summarizer ' + name,
      path: 'search-esc',
      parrot: true,
      secrets: spec[2](sec),
      pollText: shownSafe(spec, sec),
    }));
  });

  add(base({
    id: 'SJ1',
    group: 'search-jerry',
    title: 'Jerry long-message summarizer',
    path: 'search-jerry',
    parrot: true,
    secrets: [secret('SJ1')],
    pollText: 'password: ' + secret('SJ1') + ' ' + Array.from({ length: 160 }, () => 'alpha').join(' '),
  }));

  add(base({
    id: 'SR1',
    group: 'search-risk',
    title: 'Risk teambox summarizer',
    path: 'search-risk',
    parrot: true,
    secrets: [secret('SR1').slice(1, 5)],
    pollText: 'pwd: ' + secret('SR1').slice(1, 5),
  }));

  add(base({
    id: 'SC1',
    group: 'search-close',
    title: 'Auto-close search does not echo a prior secret',
    path: 'search-close',
    kind: 'regression',
    expect: 'completes',
    secrets: [secret('SC1')],
    pollText: 'password: ' + secret('SC1'),
  }));

  add(base({
    id: 'RT1',
    group: 'retry',
    title: '429 retry of a public echo',
    path: 'webhook',
    slow: true,
    fail429: 1,
    latest: 'password: ' + secret('RT1'),
    reply: leakReply(secret('RT1')),
    secrets: [secret('RT1')],
  }));

  add(base({
    id: 'RT2',
    group: 'retry',
    title: '429 retry of an sk- echo',
    path: 'webhook',
    slow: true,
    fail429: 1,
    latest: 'sk-' + secret('RT2') + 'abcdEFGH',
    reply: leakReply('sk-' + secret('RT2') + 'abcdEFGH'),
    secrets: ['sk-' + secret('RT2') + 'abcdEFGH'],
  }));

  add(base({
    id: 'RP1',
    group: 'replay',
    title: 'Direct replay of a labeled secret body',
    path: 'replay',
    secrets: [secret('RP1')],
    latest: 'password: ' + secret('RP1'),
    reply: leakReply('noted'),
    replayBody: 'password: ' + secret('RP1'),
  }));

  add(base({
    id: 'RP2',
    group: 'replay',
    title: 'Replay of a clean body stays suppressed',
    path: 'replay-clean',
    kind: 'regression',
    expect: 'replay-suppressed',
    secrets: [secret('RP2')],
    latest: 'What is the profit split?',
    reply: FAQ_REPLY,
  }));

  ['plain', 'b64-nested', 'api-key'].forEach((name, i) => {
    const spec = publicSpecs.find((row) => row[0] === name);
    const id = 'TL' + String(i + 1).padStart(2, '0');
    const sec = secret(id);
    const shown = spec[1](sec);
    const longPad = Array.from({ length: 50 }, () => 'question').join(' ');
    add(base({
      id,
      group: 'model-tool',
      title: 'get_state tool path ' + name,
      toolFirst: true,
      latest: shown + ' ' + longPad + ' What is the profit split and how should I read the dashboard rules today?',
      reply: FAQ_REPLY,
      secrets: spec[2](sec),
    }));
  });

  const eligible = [
    ['E01', 'how do I check the spreads?', 'en-borderline'],
    ['E02', 'How can I check the spreads', 'en'],
    ['E03', 'How do I test the spreads?', 'en'],
    ['E04', 'How should I check your spreads?', 'en'],
    ['E05', 'Please send the spread test account', 'en-account'],
    ['E06', 'Can you send me the test account to check spreads?', 'en-account'],
    ['E07', 'Please give me the spread-test login', 'en-account'],
    ['E08', 'Send the spread demo account', 'en-account'],
    ['E09', 'I want to check the spreads', 'en-want'],
    ['E10', 'How to check the spreads', 'en-how-to'],
    ['E11', 'سپریڈ کیسے چیک کروں', 'urdu'],
    ['E12', 'مجھے سپریڈ ٹیسٹ اکاؤنٹ بھیجو', 'urdu-account'],
    ['E13', 'سپریڈ چیک کرنے کا طریقہ بتائیں', 'urdu-how'],
    ['E14', 'spreads kaise check karun', 'roman-urdu'],
    ['E15', 'mujhe spread test account bhej do', 'roman-urdu-account'],
    ['E16', 'spread test account dena', 'hinglish-account'],
    ['E17', 'स्प्रेड कैसे चेक करूं', 'hindi'],
    ['E18', 'स्प्रेड टेस्ट अकाउंट भेजो', 'hindi-account'],
    ['E19', 'स्प्रेड कैसे जांचें', 'hindi-check'],
    ['E20', 'كيف أفحص السبريد', 'arabic'],
    ['E21', 'أرسل حساب اختبار السبريد', 'arabic-account'],
    ['E22', 'كيف أختبر السبريد', 'arabic-test'],
    ['E23', 'bhai mujhe spread test account bhej do', 'hinglish'],
    ['E24', 'how do I check the spreads yaar', 'hinglish-en'],
    ['E25', 'please spread test account send kar do', 'hinglish-send'],
  ];
  eligible.forEach((row, idx) => {
    add(base({
      id: row[0],
      group: 'eligible',
      title: row[2] + ': ' + row[1],
      kind: 'eligible',
      expect: 'template',
      path: 'webhook',
      alsoObserve: idx < 4,
      latest: row[1],
      reply: FAQ_REPLY,
      secrets: [],
    }));
  });

  const ineligible = [
    ['N01', 'How do I check my payout?'],
    ['N02', 'What is the status of my KYC?'],
    ['N03', 'I cannot log in to my account'],
    ['N04', 'My password is not working'],
    ['N05', 'Send me account 99999'],
    ['N06', 'Please send the funded account login'],
    ['N07', 'What is a spread?'],
    ['N08', 'I already tested the spreads'],
    ['N09', 'Do not send the spread test account'],
    ['N10', 'Send him the spread test account'],
    ['N11', 'How do I check the spreadsheet?'],
    ['N12', 'Can you spread some light on the rules?'],
    ['N13', 'how do I check the spreads on my payout'],
    ['N14', 'I can\'t log in, password rejected'],
    ['N15', 'send the test account 77881'],
    ['N16', 'what are the spreads?'],
    ['N17', 'meri payout kab aayegi'],
    ['N18', 'मेरा केवाईसी पेंडिंग है'],
    ['N19', 'لا أستطيع تسجيل الدخول'],
    ['N20', 'mera login nahi ho raha'],
    ['N21', 'Please send my own account password'],
    ['N22', 'I was testing the spreads yesterday'],
  ];
  ineligible.forEach((row, idx) => {
    add(base({
      id: row[0],
      group: 'ineligible',
      title: row[1],
      kind: 'ineligible',
      expect: 'no-template',
      alsoObserve: idx < 4,
      latest: row[1],
      reply: leakReply(TEMPLATE),
      secrets: [],
    }));
  });

  add(base({
    id: 'N23',
    group: 'ineligible',
    title: 'Tampered template password and account',
    kind: 'ineligible',
    expect: 'no-template',
    latest: 'How do I check my payout?',
    reply: leakReply(TEMPLATE.replace('55188', '99999').replace('QBG5FetfozKz7^a?J!', 'Tamper9xQL01')),
    secrets: ['Tamper9xQL01'],
  }));

  add(base({
    id: 'N24',
    group: 'ineligible',
    title: 'Template plus an extra labeled password',
    kind: 'ineligible',
    expect: 'no-template',
    latest: 'What is my payout status?',
    reply: leakReply(TEMPLATE + '\npassword: ' + secret('N24')),
    secrets: [secret('N24')],
  }));

  const faqs = [
    ['F01', 'What is the profit split?'],
    ['F02', 'How many days is phase one?'],
    ['F03', 'Where do I find the dashboard?'],
    ['F04', 'How do I reset my password?'],
    ['F05', 'password reset instructions'],
    ['F06', 'What is the daily drawdown?'],
    ['F07', 'Do you allow news trading?'],
    ['F08', 'Hello'],
    ['F09', 'Thank you'],
    ['F10', 'What leverage do you offer?'],
    ['F11', 'How do I change my email?'],
    ['F12', 'What platforms do you support?'],
    ['F13', 'Is there a free retry?'],
    ['F14', 'How do I contact support?'],
    ['F15', 'What is the minimum trading days?'],
    ['F16', 'Can I use an expert advisor?'],
    ['F17', 'What happens if I hit the loss limit?'],
    ['F18', 'Tell me about the consistency rule'],
  ];
  faqs.forEach((row) => {
    add(base({
      id: row[0],
      group: 'faq',
      title: row[1],
      kind: 'faq',
      expect: 'faq',
      alsoObserve: true,
      latest: row[1],
      reply: FAQ_REPLY,
      secrets: [],
    }));
  });

  add(base({
    id: 'R01',
    group: 'regression',
    title: 'Owner STOP confirm note',
    kind: 'regression',
    expect: 'stop-note',
    path: 'owner-stop',
    note: '@Arsal stop replying to this ticket',
    latest: 'What is the profit split?',
    secrets: [],
  }));

  add(base({
    id: 'R02',
    group: 'regression',
    title: 'Ordinary owner bracket text is not a credential block',
    kind: 'faq',
    expect: 'faq',
    path: 'owner',
    note: '@Arsal send this message to the client [Thanks for waiting, I will check the dashboard]',
    latest: 'What is the profit split?',
    secrets: [],
  }));

  const hangs = [
    ['HG01', 'spaced-letters', (sec) => ('a ').repeat(12000) + 'password: ' + sec],
    ['HG02', 'many-labels', (sec) => Array.from({ length: 400 }, () => 'pin: ' + sec.slice(1, 5) + ' ').join('')],
    ['HG03', 'zero-width-pad', (sec) => '\u200b'.repeat(80000) + 'password: ' + sec],
    ['HG04', 'html-comment-bulk', (sec) => '<!-- ' + ('password: ' + sec + ' ').repeat(2000) + ' -->'],
    ['HG05', 'entity-bulk', (sec) => entities('password: ' + sec).repeat(300)],
    ['HG06', 'fullwidth-bulk', (sec) => fullwidth(('password: ' + sec + ' ').repeat(800))],
    ['HG07', 'nested-b64-bulk', (sec) => 'password: ' + b64(b64(b64('password: ' + sec + ('A').repeat(400))))],
    ['HG08', 'split-label-bulk', (sec) => ('p a s s w o r d : ').repeat(1500) + sec],
    ['HG09', 'homoglyph-bulk', (sec) => (homoPassword() + ': ' + sec + ' ').repeat(1500)],
    ['HG10', 'long-plain', (sec) => ('dashboard rules ').repeat(8000) + 'password: ' + sec],
    ['HG11', 'mixed-separators', (sec) => dotted(sec).split('').join('\u200b') + ' password: ' + spaced(sec)],
    ['HG12', 'comment-unclosed', (sec) => '<!-- password: ' + sec + ' ' + ('x').repeat(100000)],
  ];
  hangs.forEach((row) => {
    const sec = secret(row[0]);
    const latest = row[2](sec);
    add(base({
      id: row[0],
      group: 'hang',
      title: row[1],
      kind: 'hang',
      expect: 'completes',
      path: 'hang',
      latest,
      reply: leakReply(row[0] === 'HG02' ? sec.slice(1, 5) : sec),
      secrets: [row[0] === 'HG02' ? sec.slice(1, 5) : sec],
    }));
  });

  return cases;
}

function shownSafe(spec, sec) {
  return spec[1](sec);
}

module.exports = {
  TEMPLATE,
  secret,
  buildCases,
  FAQ_REPLY,
};
