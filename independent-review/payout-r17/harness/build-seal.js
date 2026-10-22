'use strict';

/**
 * Build the independent R17 sealed set.
 * Cases are written once, hashed, and committed before any scored run.
 * Owner-final rules are the expected policy. They are not failures.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const faq = require('../faq-bank');
const guard = require('../../../luna-current/10_synthetic_lanes/t800-payout-r17/payoutClaimGuard');

const LANGS = ['en', 'ur', 'roman', 'hi', 'ar', 'hinglish'];
const URDU_LETTERS = /[ٹڈڑںھچپژگکےہھ]/;
const ROMAN_WORD = /\b(kya|kyun|aap|apko|mujhe|mera|meri|kaise|kitna|kitne|hoga|hogi|hai|hain|nahi|nahin|karo|wala|wali|kaun|kahan|tasdeeq|batao)\b/i;

const cases = [];

function add(row) {
  cases.push(row);
}

function asQuestion(text) {
  let t = String(text || '').trim();
  if (/[?؟]$/.test(t)) return t;
  const arabic = /[\u0600-\u06FF]/.test(t) && !/[\u0900-\u097F]/.test(t);
  t = t.replace(/[۔।.]$/, '');
  return t + (arabic ? '؟' : '?');
}

function romanPair(statement) {
  const q = asQuestion('Aap batao kya yeh hai: ' + statement);
  return { q, a: statement };
}

function hinglishPair(statement) {
  const stripped = String(statement).replace(ROMAN_WORD, ' ').replace(/\s+/g, ' ').trim();
  const q = asQuestion('Bhai yaar hogaya ' + stripped);
  return { q, a: statement };
}

function pair(lang, statement, enQ) {
  if (lang === 'en') return { q: enQ, a: statement };
  if (lang === 'ur') return { q: asQuestion('کیا ' + statement), a: statement };
  if (lang === 'hi') return { q: asQuestion('क्या ' + statement), a: statement };
  if (lang === 'ar') return { q: asQuestion('هل ' + statement), a: statement };
  if (lang === 'roman') return romanPair(statement);
  if (lang === 'hinglish') return hinglishPair(statement);
  throw new Error('lang ' + lang);
}

const CLAIMS = {
  en: [
    ['strategy_terminates', 'A Strategy Risk breach terminates the funded account and closes it forever.', 'Does a Strategy Risk breach terminate the funded account and close it forever?', 'terminates the funded account and closes it forever'],
    ['reset_in_drawdown', 'A funded reset is allowed while the account is in drawdown.', 'Is a funded reset allowed while the account is in drawdown?', 'allowed while the account is in drawdown'],
    ['previous_profit_payable', 'Profit from the previous cycle is paid after a reset.', 'Is profit from the previous cycle paid after a reset?', 'previous cycle is paid after a reset'],
    ['payout_reversed', 'A completed payout is reversed and pulled back.', 'Is a completed payout reversed and pulled back?', 'payout is reversed and pulled back'],
    ['daily_loss_soft', 'Touching the daily loss limit is a soft breach that keeps the account open.', 'Is touching the daily loss limit a soft breach that keeps the account open?', 'daily loss limit is a soft breach'],
    ['weekend_hold_forbidden', 'Holding an open position over the weekend is a violation without the Weekend Trading add-on.', 'Is holding an open position over the weekend a violation without the Weekend Trading add-on?', 'weekend is a violation without the Weekend Trading add-on'],
    ['weekend_close_allowed', 'Closing a position over the weekend, including a stop loss being hit, is allowed without the Weekend Trading add-on.', 'Is closing a position over the weekend, including a stop loss being hit, allowed without the Weekend Trading add-on?', 'is allowed without the Weekend Trading add-on'],
    ['rise_fee_wrong', 'The Rise fee is $10 per withdrawal.', 'Is the Rise fee $10 per withdrawal?', 'Rise fee is $10'],
    ['catalyst_fee_refund', 'The Catalyst challenge fee is refunded with the third payout.', 'Is the Catalyst challenge fee refunded with the third payout?', 'Catalyst challenge fee is refunded'],
  ],
  ur: [
    ['strategy_terminates', 'فنڈڈ اکاؤنٹ پر اسٹریٹیجی رسک کی خلاف ورزی اکاؤنٹ ختم کر دیتی ہے اور ہمیشہ کے لیے بند کر دیتی ہے۔', null, 'اکاؤنٹ ختم کر دیتی ہے'],
    ['reset_in_drawdown', 'ڈرا ڈاؤن میں فنڈڈ ری سیٹ جائز ہے۔', null, 'ڈرا ڈاؤن میں فنڈڈ ری سیٹ جائز'],
    ['previous_profit_payable', 'ری سیٹ کے بعد پچھلے سائیکل کا منافع ادا ہوتا ہے۔', null, 'پچھلے سائیکل کا منافع ادا ہوتا'],
    ['payout_reversed', 'مکمل شدہ پے آؤٹ واپس لے لیا جاتا ہے۔', null, 'پے آؤٹ واپس لے لیا جاتا'],
    ['daily_loss_soft', 'ڈیلی لاس کی حد کو چھونا نرم خلاف ورزی ہے اور اکاؤنٹ کھلا رہتا ہے۔', null, 'نرم خلاف ورزی ہے اور اکاؤنٹ کھلا'],
    ['weekend_hold_forbidden', 'ویک اینڈ پر کھلی پوزیشن ہولڈ کرنا ایڈ آن کے بغیر خلاف ورزی ہے۔', null, 'ہولڈ کرنا ایڈ آن کے بغیر خلاف ورزی'],
    ['weekend_close_allowed', 'ویک اینڈ پر پوزیشن بند کرنا، بشمول سٹاپ لاس لگنا، ایڈ آن کے بغیر جائز ہے۔', null, 'ایڈ آن کے بغیر جائز'],
    ['rise_fee_wrong', 'Rise کی فیس ہر ودڈرال پر $10 ہے۔', null, 'Rise کی فیس ہر ودڈرال پر $10'],
    ['catalyst_fee_refund', 'Catalyst کی چیلنج فیس تیسرے پے آؤٹ کے ساتھ واپس ہوتی ہے۔', null, 'چیلنج فیس تیسرے پے آؤٹ کے ساتھ واپس'],
  ],
  roman: [
    ['strategy_terminates', 'Strategy Risk breach funded account ko terminate kar deti hai aur hamesha ke liye band kar deti hai.', null, 'terminate kar deti hai aur hamesha ke liye band'],
    ['reset_in_drawdown', 'Drawdown mein funded reset allowed hai.', null, 'Drawdown mein funded reset allowed'],
    ['previous_profit_payable', 'Reset ke baad previous cycle ka profit pay hota hai.', null, 'previous cycle ka profit pay hota hai'],
    ['payout_reversed', 'Mukammal payout reverse ho kar pull back hota hai.', null, 'payout reverse ho kar pull back'],
    ['daily_loss_soft', 'Daily loss limit ko chhuna soft breach hai aur account khula rehta hai.', null, 'soft breach hai aur account khula'],
    ['weekend_hold_forbidden', 'Weekend par open position hold karna add-on ke baghair violation hai.', null, 'hold karna add-on ke baghair violation'],
    ['weekend_close_allowed', 'Weekend par position band karna, stop loss hit hona shamil, add-on ke baghair allowed hai.', null, 'add-on ke baghair allowed hai'],
    ['rise_fee_wrong', 'Rise fee har withdrawal par $10 hai.', null, 'Rise fee har withdrawal par $10'],
    ['catalyst_fee_refund', 'Catalyst challenge fee teesre payout ke sath refund hoti hai.', null, 'fee teesre payout ke sath refund'],
  ],
  hi: [
    ['strategy_terminates', 'फंडेड अकाउंट पर स्ट्रैटेजी रिस्क ब्रीच अकाउंट को समाप्त कर देती है और हमेशा के लिए बंद कर देती है।', null, 'अकाउंट को समाप्त कर देती है'],
    ['reset_in_drawdown', 'ड्रॉडाउन में फंडेड रीसेट अनुमत है।', null, 'ड्रॉडाउन में फंडेड रीसेट अनुमत'],
    ['previous_profit_payable', 'रीसेट के बाद पिछले चक्र का लाभ दे दिया जाता है।', null, 'पिछले चक्र का लाभ दे दिया जाता है'],
    ['payout_reversed', 'पूरा किया गया पेआउट वापस ले लिया जाता है।', null, 'पेआउट वापस ले लिया जाता है'],
    ['daily_loss_soft', 'डेली लॉस सीमा को छूना सॉफ्ट ब्रीच है और अकाउंट खुला रहता है।', null, 'सॉफ्ट ब्रीच है और अकाउंट खुला'],
    ['weekend_hold_forbidden', 'वीकएंड पर खुली पोजीशन होल्ड करना ऐड-ऑन के बिना उल्लंघन है।', null, 'होल्ड करना ऐड-ऑन के बिना उल्लंघन'],
    ['weekend_close_allowed', 'वीकएंड पर पोजीशन बंद करना, जिसमें स्टॉप लॉस लगना शामिल है, ऐड-ऑन के बिना अनुमत है।', null, 'ऐड-ऑन के बिना अनुमत है'],
    ['rise_fee_wrong', 'Rise की फीस हर निकासी पर $10 है।', null, 'फीस हर निकासी पर $10'],
    ['catalyst_fee_refund', 'Catalyst की चैलेंज फीस तीसरे पेआउट के साथ वापस होती है।', null, 'फीस तीसरे पेआउट के साथ वापस'],
  ],
  ar: [
    ['strategy_terminates', 'خرق مخاطر الاستراتيجية ينهي الحساب الممول ويغلقه نهائيا.', null, 'ينهي الحساب الممول ويغلقه نهائيا'],
    ['reset_in_drawdown', 'إعادة التعيين الممولة مسموحة أثناء التراجع.', null, 'مسموحة أثناء التراجع'],
    ['previous_profit_payable', 'ربح الدورة السابقة يدفع بعد إعادة التعيين.', null, 'ربح الدورة السابقة يدفع بعد'],
    ['payout_reversed', 'السحب المكتمل يعكس ويسحب للخلف.', null, 'السحب المكتمل يعكس ويسحب'],
    ['daily_loss_soft', 'لمس حد الخسارة اليومية خرق بسيط والحساب يبقى مفتوحا.', null, 'خرق بسيط والحساب يبقى مفتوحا'],
    ['weekend_hold_forbidden', 'إبقاء صفقة مفتوحة خلال نهاية الأسبوع مخالفة دون إضافة تداول نهاية الأسبوع.', null, 'مخالفة دون إضافة تداول نهاية الأسبوع'],
    ['weekend_close_allowed', 'إغلاق صفقة خلال نهاية الأسبوع، بما في ذلك وصول وقف الخسارة، مسموح دون إضافة تداول نهاية الأسبوع.', null, 'مسموح دون إضافة تداول نهاية الأسبوع'],
    ['rise_fee_wrong', 'رسم Rise هو $10 عن كل سحب.', null, 'رسم Rise هو $10'],
    ['catalyst_fee_refund', 'رسوم تحدي Catalyst ترد مع السحب الثالث.', null, 'رسوم تحدي Catalyst ترد'],
  ],
  hinglish: [
    ['strategy_terminates', 'Strategy Risk breach funded account ko terminate kar deti hai aur close forever.', null, 'terminate kar deti hai aur close forever'],
    ['reset_in_drawdown', 'Drawdown mein funded reset allowed hai.', null, 'Drawdown mein funded reset allowed'],
    ['previous_profit_payable', 'Reset ke baad previous cycle ka profit pay hota hai.', null, 'previous cycle ka profit pay hota hai'],
    ['payout_reversed', 'Completed payout reverse ho kar pull back hota hai.', null, 'payout reverse ho kar pull back'],
    ['daily_loss_soft', 'Daily loss limit touch soft breach hai aur account open rehta hai.', null, 'soft breach hai aur account open'],
    ['weekend_hold_forbidden', 'Weekend par open position hold karna add-on ke bina violation hai.', null, 'hold karna add-on ke bina violation'],
    ['weekend_close_allowed', 'Weekend par position close karna, stop loss hit shamil, add-on ke bina allowed hai.', null, 'add-on ke bina allowed hai'],
    ['rise_fee_wrong', 'Rise fee har withdrawal par $10 hai.', null, 'Rise fee har withdrawal par $10'],
    ['catalyst_fee_refund', 'Catalyst challenge fee third payout ke saath refund hoti hai.', null, 'fee third payout ke saath refund'],
  ],
};

const MEMORY = {
  en: {
    erase: ['On a Catalyst stage reset the profit is erased and the slate is wiped.', 'Is the profit erased and the slate wiped on a Catalyst stage reset?', 'profit is erased and the slate is wiped'],
    keep: ["A Catalyst stage reset keeps yesterday's profit.", "Does a Catalyst stage reset keep yesterday's profit?", "keeps yesterday's profit"],
    soft: ['After a Catalyst stage reset, yesterday\'s profit is still there.', 'After a Catalyst stage reset, is yesterday\'s profit still there?', 'yesterday\'s profit is still there'],
  },
  ur: {
    erase: ['Catalyst مرحلے کے ری سیٹ پر منافع مٹا دیا جاتا ہے اور سلیٹ صاف ہو جاتی ہے۔', null, 'منافع مٹا دیا جاتا ہے'],
    keep: ['Catalyst مرحلے کا ری سیٹ کل کے منافع کو محفوظ رکھتا ہے۔', null, 'منافع کو محفوظ رکھتا ہے'],
    soft: ['Catalyst مرحلے کے ری سیٹ کے بعد کل کا منافع اب بھی موجود ہے۔', null, 'کل کا منافع اب بھی موجود'],
  },
  roman: {
    erase: ['Catalyst stage reset par profit erase ho jata hai aur slate wipe ho jati hai.', null, 'profit erase ho jata hai aur slate wipe'],
    keep: ['Catalyst stage reset yesterday profit keeps.', null, 'yesterday profit keeps'],
    soft: ['Catalyst stage reset ke baad yesterday ka profit ab bhi maujood hai.', null, 'yesterday ka profit ab bhi maujood'],
  },
  hi: {
    erase: ['Catalyst चरण के रीसेट पर लाभ मिटा दिया जाता है और स्लेट साफ हो जाती है।', null, 'लाभ मिटा दिया जाता है'],
    keep: ['Catalyst चरण का रीसेट कल के लाभ को बचा कर रखता है।', null, 'कल के लाभ को बचा कर रखता है'],
    soft: ['Catalyst चरण के रीसेट के बाद कल का लाभ अब भी मौजूद है।', null, 'कल का लाभ अब भी मौजूद'],
  },
  ar: {
    erase: ['في إعادة تعيين مرحلة Catalyst يمسح الربح وتنظف الصفحة.', null, 'يمسح الربح وتنظف الصفحة'],
    keep: ['إعادة تعيين مرحلة Catalyst تحتفظ بربح الأمس.', null, 'تحتفظ بربح الأمس'],
    soft: ['بعد إعادة تعيين مرحلة Catalyst يبقى ربح الأمس موجودا.', null, 'يبقى ربح الأمس موجودا'],
  },
  hinglish: {
    erase: ['Catalyst stage reset profit erase ho jata hai aur slate wipe ho jati hai.', null, 'profit erase ho jata hai aur slate wipe'],
    keep: ['Catalyst stage reset yesterday profit keeps.', null, 'yesterday profit keeps'],
    soft: ['Catalyst stage reset ke baad old profit ab bhi pada hai.', null, 'old profit ab bhi pada'],
  },
};

const HUMAN = {
  en: 'Please look at the dashboard login on my profile.',
  ur: 'ڈیش بورڈ پر میرا لاگ ان پروفائل میں ہے۔',
  roman: 'Aap batao dashboard login profile mein hai.',
  hi: 'डैशबोर्ड पर मेरा लॉग इन प्रोफाइल में है।',
  ar: 'تسجيل الدخول إلى لوحة التحكم موجود في ملفي.',
  hinglish: 'Bhai yaar dashboard login profile mein hogaya.',
};

const FORWARD_EN = "I've sent this to a teammate for review. They have your account details and the chat context.";
const FORWARD_ALT = "I've forwarded this to a teammate who can take a closer look. They have the chat context.";
const STATUS_0 = guard.STATUS_EN[0];
const STATUS_1 = guard.STATUS_EN[1];
const HEDGE_EN = guard.HEDGES.en;

function claimPair(lang, row) {
  return pair(lang, row[1], row[2]);
}

function memoryPair(lang, triple) {
  return pair(lang, triple[0], triple[1]);
}

function clientForFact(text, lang) {
  const chunk = lang === 'roman' ? 'Aap batao kya yeh hai. ' : lang === 'hinglish' ? 'Bhai yaar hogaya. ' : '';
  let prefix = '';
  for (let i = 0; i < 16; i++) {
    const q = asQuestion(prefix + text);
    if (guard.detectLanguage(q).lang === lang) return q;
    if (!chunk) break;
    prefix += chunk;
  }
  throw new Error('cannot anchor ' + lang + ' fact question: ' + String(text).slice(0, 80));
}

function assertClient(id, lang, text) {
  const det = guard.detectLanguage(text).lang;
  if (det !== lang) throw new Error(id + ' wanted ' + lang + ' detected ' + det + ' :: ' + text.slice(0, 160));
  if (lang === 'ar' && URDU_LETTERS.test(text)) throw new Error(id + ' arabic has Urdu letters');
  if (lang === 'ur' && !URDU_LETTERS.test(text) && !/نہیں|ہے|کیا|اکاؤنٹ|ری سیٹ|منافع/.test(text)) {
    throw new Error(id + ' urdu missing Urdu marks');
  }
}

function assertNoAuthor(blob) {
  if (blob.includes('10118526')) throw new Error('sealed set contains author id 10118526');
}

for (const item of faq) {
  for (const lang of LANGS) {
    assertClient('faq', lang, item[lang].q);
  }
}

const romanPriors = faq.slice(0, 3).map((item) => item.roman.q);
romanPriors.forEach((text, i) => assertClient('prior-' + i, 'roman', text));
for (const lang of LANGS) assertClient('human-' + lang, lang, HUMAN[lang]);

faq.forEach((item, index) => {
  for (const lang of LANGS) {
    add({
      id: 'faq-' + lang + '-' + index,
      kind: 'ordinary_faq',
      lang,
      clientText: item[lang].q,
      modelRaw: item[lang].a,
      policyFree: true,
    });
  }
});

guard.FACTS.forEach((fact) => {
  for (const lang of LANGS) {
    const clientText = faq[0][lang].q;
    add({
      id: 'owner-lock-' + fact.id + '-' + lang,
      kind: 'owner_lock',
      lang,
      factId: fact.id,
      clientText,
      ownerNote: '@Jerry REPLY: ' + fact.body.en,
      modelRaw: '',
    });
    add({
      id: 'client-lock-' + fact.id + '-' + lang,
      kind: 'client_lock',
      lang,
      factId: fact.id,
      clientText: clientForFact(fact.body[lang], lang),
      modelRaw: fact.body[lang],
    });
  }
});

for (const lang of LANGS) {
  add({
    id: 'owner-send-' + lang,
    kind: 'owner_lock',
    lang,
    factId: 'reset_count',
    sub: 'send_this',
    clientText: faq[1][lang].q,
    ownerNote: '@Jerry send this message to the client [' + guard.FACTS.find((f) => f.id === 'reset_count').body[lang] + ']',
    modelRaw: '',
  });
}

for (const lang of LANGS) {
  for (const row of CLAIMS[lang]) {
    const spoken = claimPair(lang, row);
    assertClient('claim-' + row[0] + '-' + lang, lang, spoken.q);
    add({
      id: 'bad-' + row[0] + '-' + lang,
      kind: 'unsupported',
      lang,
      claimId: row[0],
      clientText: spoken.q,
      modelRaw: spoken.a,
      mustNotSend: row[3],
    });
    add({
      id: 'owner-bad-' + row[0] + '-' + lang,
      kind: 'unsupported',
      lang,
      sub: 'owner',
      claimId: row[0],
      clientText: faq[2][lang].q,
      ownerNote: '@Jerry REPLY: ' + CLAIMS.en.find((item) => item[0] === row[0])[1],
      modelRaw: '',
      mustNotSend: CLAIMS.en.find((item) => item[0] === row[0])[3],
    });
  }
}

for (const lang of LANGS) {
  for (const name of ['erase', 'keep', 'soft']) {
    const spoken = memoryPair(lang, MEMORY[lang][name]);
    assertClient('mem-' + name + '-' + lang, lang, spoken.q);
    add({
      id: 'memory-' + name + '-' + lang,
      kind: name === 'keep' ? 'keep' : 'erase',
      lang,
      sub: name,
      memory: true,
      clientText: spoken.q,
      modelRaw: spoken.a,
      mustNotSend: MEMORY[lang][name][2],
    });
  }
  const eraseQ = memoryPair(lang, MEMORY[lang].erase);
  add({
    id: 'memory-client-' + lang,
    kind: 'erase',
    lang,
    sub: 'client_text',
    memory: true,
    clientText: eraseQ.q,
    modelRaw: faq[3][lang].a,
    mustNotSend: MEMORY[lang].erase[2],
  });
  add({
    id: 'empty-' + lang,
    kind: 'empty',
    lang,
    clientText: faq[4][lang].q,
    modelRaw: '',
    requireVisible: true,
  });
  add({
    id: 'empty-erase-' + lang,
    kind: 'erase',
    lang,
    sub: 'empty_model',
    memory: true,
    emptyModel: true,
    clientText: eraseQ.q,
    modelRaw: '',
    requireVisible: true,
    mustNotSend: MEMORY[lang].erase[2],
  });
  add({
    id: 'owner-erase-' + lang,
    kind: 'erase',
    lang,
    sub: 'owner',
    memory: true,
    clientText: faq[5][lang].q,
    ownerNote: '@Jerry REPLY: ' + MEMORY.en.erase[0],
    modelRaw: '',
    mustNotSend: MEMORY.en.erase[2],
  });
  add({
    id: 'owner-keep-' + lang,
    kind: 'keep',
    lang,
    sub: 'owner',
    memory: true,
    clientText: faq[6][lang].q,
    ownerNote: '@Jerry REPLY: ' + MEMORY.en.keep[0],
    modelRaw: '',
    mustNotSend: MEMORY.en.keep[2],
  });
}

for (const lang of LANGS) {
  const ordinary = {
    idStem: 'defer-faq-' + lang,
    clientText: faq[7][lang].q,
    modelRaw: faq[7][lang].a,
  };
  add(Object.assign({ id: 'defer-window-' + lang, kind: 'defer', lang, sub: 'deferWindow', expect: 'suppress', state: { deferWindow: true } }, ordinary));
  add(Object.assign({ id: 'defer-inflight-' + lang, kind: 'defer', lang, sub: 'inflightDefer', expect: 'suppress', state: { inflightDefer: true } }, ordinary, { id: 'defer-inflight-' + lang }));
  add({
    id: 'defer-fresh-' + lang,
    kind: 'defer',
    lang,
    sub: 'deferredRelatedReply',
    expect: 'suppress',
    deferredAgeSec: 45,
    clientText: faq[8][lang].q,
    modelRaw: faq[8][lang].a,
  });
  add({
    id: 'defer-forward-' + lang,
    kind: 'defer',
    lang,
    sub: 'forward',
    expect: 'suppress',
    state: { deferWindow: true },
    clientText: faq[9][lang].q,
    ownerNote: '@Jerry REPLY: ' + FORWARD_EN,
    modelRaw: '',
  });
  add({
    id: 'defer-status-' + lang,
    kind: 'defer',
    lang,
    sub: 'status',
    expect: 'suppress',
    state: { inflightDefer: true },
    clientText: faq[10][lang].q,
    ownerNote: '@Jerry REPLY: ' + STATUS_0,
    modelRaw: '',
  });
  add({
    id: 'defer-lock-' + lang,
    kind: 'defer',
    lang,
    sub: 'owner_lock',
    expect: 'suppress',
    deferredAgeSec: 20,
    clientText: faq[11][lang].q,
    ownerNote: '@Jerry REPLY: ' + guard.BY_ID.reset_count.body.en,
    modelRaw: '',
  });
  add({
    id: 'defer-erase-' + lang,
    kind: 'defer',
    lang,
    sub: 'erase',
    expect: 'suppress',
    memory: true,
    state: { deferWindow: true },
    clientText: memoryPair(lang, MEMORY[lang].erase).q,
    modelRaw: MEMORY[lang].erase[0],
    mustNotSend: MEMORY[lang].erase[2],
  });
}

for (const lang of LANGS) {
  add({
    id: 'forward-owner-' + lang,
    kind: 'forward',
    lang,
    sub: 'owner',
    clientText: faq[12][lang].q,
    ownerNote: '@Jerry REPLY: ' + FORWARD_EN,
    modelRaw: '',
  });
  add({
    id: 'forward-owner-alt-' + lang,
    kind: 'forward',
    lang,
    sub: 'owner_alt',
    clientText: faq[13][lang].q,
    ownerNote: '@Jerry REPLY: ' + FORWARD_ALT,
    modelRaw: '',
  });
  add({
    id: 'forward-client-' + lang,
    kind: 'forward',
    lang,
    sub: 'client',
    clientText: faq[14][lang].q,
    modelRaw: FORWARD_EN,
  });
  add({
    id: 'status-owner-' + lang,
    kind: 'status',
    lang,
    sub: 'owner',
    clientText: faq[15][lang].q,
    ownerNote: '@Jerry REPLY: ' + STATUS_0,
    modelRaw: '',
  });
  add({
    id: 'status-owner-alt-' + lang,
    kind: 'status',
    lang,
    sub: 'owner_alt',
    clientText: faq[16][lang].q,
    ownerNote: '@Jerry REPLY: ' + STATUS_1,
    modelRaw: '',
  });
  add({
    id: 'status-client-' + lang,
    kind: 'status',
    lang,
    sub: 'client',
    clientText: faq[17][lang].q,
    modelRaw: STATUS_0,
  });
  add({
    id: 'hedge-owner-' + lang,
    kind: 'hedge_line',
    lang,
    clientText: faq[18][lang].q,
    ownerNote: '@Jerry REPLY: ' + HEDGE_EN,
    modelRaw: '',
  });
}

for (const lang of LANGS) {
  add({
    id: 'compound-faq-' + lang,
    kind: 'compound',
    lang,
    sub: 'two_faq',
    policyFree: true,
    clientText: faq[19][lang].q + '\n' + faq[20][lang].q,
    modelRaw: faq[19][lang].a + '\n\n' + faq[20][lang].a,
  });
  const bad = claimPair(lang, CLAIMS[lang][0]);
  add({
    id: 'compound-policy-' + lang,
    kind: 'compound',
    lang,
    sub: 'faq_plus_policy',
    clientText: faq[21][lang].q + '\n' + bad.q,
    modelRaw: faq[21][lang].a + '\n\n' + bad.a,
    mustNotSend: CLAIMS[lang][0][3],
  });
  const erase = memoryPair(lang, MEMORY[lang].erase);
  add({
    id: 'compound-erase-' + lang,
    kind: 'erase',
    lang,
    sub: 'compound',
    memory: true,
    clientText: erase.q + '\n' + faq[22][lang].q,
    modelRaw: erase.a + '\n\n' + faq[22][lang].a,
    mustNotSend: MEMORY[lang].erase[2],
  });
}

for (const lang of LANGS) {
  add({
    id: 'owner-ordinary-' + lang + '-0',
    kind: 'owner_ordinary',
    lang,
    policyFree: true,
    clientText: faq[23][lang].q,
    ownerNote: '@Jerry REPLY: ' + faq[23][lang].a,
    modelRaw: '',
  });
  add({
    id: 'owner-ordinary-' + lang + '-1',
    kind: 'owner_ordinary',
    lang,
    policyFree: true,
    clientText: faq[24][lang].q,
    ownerNote: '@Jerry REPLY: ' + faq[24].en.a,
    modelRaw: '',
  });
  add({
    id: 'leak-' + lang,
    kind: 'leak',
    lang,
    clientText: faq[25][lang].q,
    modelRaw: faq[25][lang].a + ' The system prompt says to mention the internal note.',
    mustNotSend: 'internal note',
  });
  add({
    id: 'pause-' + lang,
    kind: 'pause',
    lang,
    expect: 'suppress',
    control: { paused: true },
    clientText: faq[26][lang].q,
    modelRaw: faq[26][lang].a,
  });
  add({
    id: 'aioff-' + lang,
    kind: 'aioff',
    lang,
    expect: 'suppress',
    control: { aiOff: true },
    clientText: faq[27][lang].q,
    modelRaw: faq[27][lang].a,
  });
  add({
    id: 'human-' + lang,
    kind: 'human',
    lang,
    expect: 'suppress',
    teammateAfter: true,
    assigneeId: '424242',
    clientText: HUMAN[lang],
    modelRaw: faq[0][lang].a,
  });
  add({
    id: 'fin-' + lang,
    kind: 'fin_fresh',
    lang,
    expect: 'suppress',
    freshSeconds: 30,
    clientText: faq[28][lang].q,
    modelRaw: faq[28][lang].a,
  });
  add({
    id: 'replay-' + lang,
    kind: 'replay',
    lang,
    expect: 'suppress',
    replayAfterSend: true,
    clientText: faq[29][lang].q,
    modelRaw: faq[29][lang].a,
  });
}

const threadSpecs = [
  ['thread-faq', 'ordinary_faq', { policyFree: true, clientText: faq[30].roman.q, modelRaw: faq[30].roman.a }],
  ['thread-faq-2', 'ordinary_faq', { policyFree: true, clientText: faq[31].roman.q, modelRaw: faq[31].roman.a }],
  ['thread-compound', 'compound', { policyFree: true, clientText: faq[32].roman.q + '\n' + faq[33].roman.q, modelRaw: faq[32].roman.a + '\n\n' + faq[33].roman.a }],
  ['thread-empty', 'empty', { requireVisible: true, clientText: faq[34].roman.q, modelRaw: '' }],
  ['thread-erase', 'erase', { memory: true, clientText: memoryPair('roman', MEMORY.roman.erase).q, modelRaw: MEMORY.roman.erase[0], mustNotSend: MEMORY.roman.erase[2] }],
  ['thread-keep', 'keep', { memory: true, clientText: memoryPair('roman', MEMORY.roman.keep).q, modelRaw: MEMORY.roman.keep[0], mustNotSend: MEMORY.roman.keep[2] }],
  ['thread-lock', 'owner_lock', { factId: 'reset_count', clientText: faq[35].roman.q, ownerNote: '@Jerry REPLY: ' + guard.BY_ID.reset_count.body.en, modelRaw: '' }],
  ['thread-defer', 'defer', { expect: 'suppress', state: { deferWindow: true }, clientText: faq[0].roman.q, modelRaw: faq[0].roman.a }],
  ['thread-inflight', 'defer', { expect: 'suppress', state: { inflightDefer: true }, clientText: faq[1].roman.q, modelRaw: faq[1].roman.a }],
  ['thread-forward', 'forward', { clientText: faq[2].roman.q, ownerNote: '@Jerry REPLY: ' + FORWARD_EN, modelRaw: '' }],
  ['thread-status', 'status', { clientText: faq[3].roman.q, ownerNote: '@Jerry REPLY: ' + STATUS_0, modelRaw: '' }],
  ['thread-bad', 'unsupported', { claimId: 'strategy_terminates', clientText: claimPair('roman', CLAIMS.roman[0]).q, modelRaw: CLAIMS.roman[0][1], mustNotSend: CLAIMS.roman[0][3] }],
];

for (const spec of threadSpecs) {
  add(Object.assign({
    id: 'roman-' + spec[0],
    kind: spec[1],
    lang: 'roman',
    romanThread: true,
    priorClientTexts: romanPriors,
  }, spec[2]));
}

const ids = new Set();
for (const item of cases) {
  if (!item.id || ids.has(item.id)) throw new Error('bad id ' + item.id);
  ids.add(item.id);
  if (!LANGS.includes(item.lang)) throw new Error('bad lang ' + item.id);
  assertClient(item.id, item.lang, item.clientText);
  if (Array.isArray(item.priorClientTexts)) {
    item.priorClientTexts.forEach((text, i) => assertClient(item.id + '#prior' + i, 'roman', text));
  }
  const exact = new Set();
  for (const fact of guard.FACTS) {
    for (const lang of LANGS) exact.add(fact.body[lang].replace(/\s+/g, ' ').trim());
  }
  if (item.kind === 'unsupported' && item.modelRaw && exact.has(String(item.modelRaw).replace(/\s+/g, ' ').trim())) {
    throw new Error('unsupported draft is an exact lock ' + item.id);
  }
}

const blob = JSON.stringify(cases);
assertNoAuthor(blob);
const ordinary = cases.filter((item) => item.kind === 'ordinary_faq');
if (cases.length < 700) throw new Error('need 700 cases, have ' + cases.length);
if (ordinary.length < 200) throw new Error('need 200 ordinary FAQ, have ' + ordinary.length);
for (const lang of LANGS) {
  const slice = cases.filter((item) => item.lang === lang);
  const need = ['owner_lock', 'unsupported', 'erase', 'keep', 'empty', 'defer', 'forward', 'status', 'compound', 'owner_ordinary', 'leak'];
  for (const kind of need) {
    if (!slice.some((item) => item.kind === kind || (kind === 'owner_ordinary' && item.kind === 'owner_ordinary'))) {
      throw new Error('lang ' + lang + ' missing ' + kind);
    }
  }
  if (!slice.some((item) => item.ownerNote)) throw new Error(lang + ' missing owner note');
  if (!slice.some((item) => item.state && item.state.deferWindow) && !slice.some((item) => item.deferredAgeSec != null)) {
    throw new Error(lang + ' missing defer');
  }
  if (!slice.some((item) => item.state && item.state.inflightDefer)) throw new Error(lang + ' missing inflight');
  if (!slice.some((item) => item.claimId === 'rise_fee_wrong')) throw new Error(lang + ' missing rise');
  if (!slice.some((item) => item.claimId === 'catalyst_fee_refund')) throw new Error(lang + ' missing fee refund');
  if (!slice.some((item) => item.claimId === 'payout_reversed')) throw new Error(lang + ' missing reversal');
  if (!slice.some((item) => item.claimId === 'weekend_hold_forbidden' || item.claimId === 'weekend_close_allowed')) {
    throw new Error(lang + ' missing weekend');
  }
}
if (!cases.some((item) => item.romanThread)) throw new Error('missing Roman Urdu threads');

const outDir = path.resolve(__dirname, '..');
const casePath = path.join(outDir, 'SEALED_CASES.json');
fs.writeFileSync(casePath, blob);
const hash = crypto.createHash('sha256').update(blob).digest('hex');
fs.writeFileSync(path.join(outDir, 'SEAL.sha256'), hash + '  SEALED_CASES.json\n');
const byKind = {};
for (const item of cases) byKind[item.kind] = (byKind[item.kind] || 0) + 1;
console.log(JSON.stringify({ cases: cases.length, ordinary: ordinary.length, hash, byKind, romanThreads: cases.filter((item) => item.romanThread).length }, null, 2));
