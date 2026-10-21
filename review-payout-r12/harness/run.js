'use strict';

/**
 * Independent R12 payout-guard review harness.
 * Drives the real handleWebhook. Does not import the author's test file.
 * Network: public Help Centre only, plus the local stub model.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { EventEmitter } = require('events');

const REPO = '/workspace';
const COMMIT = '71ed3d69fd1d7cef10a249fe00971f8998f33a8d';
const RUNTIME_SRC = path.join(REPO, 'luna-current/01_runtime');
const PRESEND_SRC = path.join(REPO, 'luna-current/02_statePresend');
const RUN_ROOT = '/tmp/r12-run';
const RUNTIME = path.join(RUN_ROOT, '01_runtime');
const STATE = path.join(RUN_ROOT, 'state');
const OUT_DIR = path.join(REPO, 'review-payout-r12/results');

const EXPECTED = {
  'payoutClaimGuard.js': '2936f87ee4f9ce35c0efd9587c5e6f2fbbf667eb27e1d2b8bbe79967baa099a9',
  'approved.lock.json': '52a4eca9c8d306e48653a05aad26e83b2f4644dc15a48137190be1775b241aed',
  'index.js.public-sends.diff': '440d7028b1493f8fbd5c660faf393016877cae7a9ad5192d40d5fe9d558f8466',
  'T800_R12_REPORT.md': 'b7822ce96d10a5c886ae584f6ba99d68f1ef966339b1a000b3076cf543742360',
  'SHA256SUMS.txt': 'cb3645a26b468753068ec54589b94d7e459231dd43f22493df4a5de836b58a7f',
};

const ARSAL = '10118526';
const JERRY = '8053416';
const HUMAN = '9000001';
const ALLOW = new Set(['127.0.0.1', 'localhost', 'faq.fundedelite.com', 'www.fundedelite.com', 'fundedelite.com']);

const ARTICLES = {
  '17437410': 'https://faq.fundedelite.com/en/articles/17437410-how-do-i-reset-a-funded-account',
  '17437398': 'https://faq.fundedelite.com/en/articles/17437398-what-happens-after-a-soft-breach',
  '17437388': 'https://faq.fundedelite.com/en/articles/17437388-hard-breach-vs-soft-breach',
  '17437285': 'https://faq.fundedelite.com/en/articles/17437285-how-much-can-i-risk-on-one-instrument-funded-only',
  '17437354': 'https://faq.fundedelite.com/en/articles/17437354-how-will-i-be-paid-and-what-are-the-fees',
  '17437215': 'https://faq.fundedelite.com/en/articles/17437215-catalyst',
  '17437306': 'https://faq.fundedelite.com/en/articles/17437306-can-i-trade-or-hold-positions-over-the-weekend',
  '17437366': 'https://faq.fundedelite.com/en/articles/17437366-do-i-get-my-challenge-fee-back',
};

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function plain(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function writeControl(extra) {
  const base = {
    paused: false,
    pausedUntil: null,
    aiOff: {},
    testMode: false,
    testAllowNames: ['Bot test'],
    testAllowConversationIds: [],
    config: { model: 'gpt-5.6-luna', welcomeEnabled: true, repliesEnabled: true },
  };
  fs.writeFileSync(process.env.LUNA_CONTROL_STATE_FILE, JSON.stringify(Object.assign(base, extra || {}), null, 2));
}

function installFirewall(bag) {
  function hostOf(opts) {
    try {
      if (!opts) return '';
      if (typeof opts === 'string') return new URL(opts).hostname;
      if (opts instanceof URL) return opts.hostname;
      return String(opts.hostname || opts.host || '').split(':')[0];
    } catch (_) { return ''; }
  }
  function guard(orig) {
    return function patched(opts, cb) {
      const h = hostOf(opts);
      if (h && !ALLOW.has(h)) {
        bag.push(h);
        const err = Object.assign(new Error('BLOCKED_NETWORK ' + h), { code: 'ENETUNREACH' });
        const req = new EventEmitter();
        req.end = () => {};
        req.destroy = () => {};
        req.write = () => {};
        req.setTimeout = () => req;
        req.abort = () => {};
        process.nextTick(() => req.emit('error', err));
        return req;
      }
      return orig.apply(this, arguments);
    };
  }
  https.request = guard(https.request);
  https.get = guard(https.get);
  http.request = guard(http.request);
  http.get = guard(http.get);
  const origFetch = global.fetch.bind(global);
  global.fetch = async (url, opts) => {
    const u = new URL(typeof url === 'string' ? url : (url && url.url) || String(url));
    if (!ALLOW.has(u.hostname)) {
      bag.push(u.hostname);
      throw Object.assign(new Error('BLOCKED_NETWORK ' + u.hostname), { code: 'ENETUNREACH' });
    }
    return origFetch(url, opts);
  };
}

function htmlToText(html) {
  return plain(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- '));
}

async function fetchArticle(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'independent-review/r12', accept: 'text/html' } });
  const html = await r.text();
  return htmlToText(html).replace(/[ \t]+/g, ' ');
}

function buildConv(spec) {
  const now = Math.floor(Date.now() / 1000);
  const id = spec.id;
  const text = spec.client;
  const parts = [];
  if (spec.priorArsal) {
    parts.push({
      type: 'conversation_part', id: id + '-prior-a', part_type: 'comment',
      body: spec.priorArsal, created_at: now - 80,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    });
  }
  if (spec.priorHuman) {
    parts.push({
      type: 'conversation_part', id: id + '-prior-h', part_type: 'comment',
      body: spec.priorHuman, created_at: now - 70,
      author: { type: 'admin', id: HUMAN, name: 'Teammate' },
    });
  }
  if (spec.priorClient) {
    parts.push({
      type: 'conversation_part', id: id + '-prior-c', part_type: 'comment',
      body: spec.priorClient, created_at: now - 90,
      author: { type: 'user', id: 'u1', name: 'Sam' },
    });
  }
  const userAt = spec.userAgeSec ? now - spec.userAgeSec : now - 5;
  parts.push({
    type: 'conversation_part', id: id + '-u', part_type: 'comment',
    body: text, created_at: userAt,
    author: { type: 'user', id: 'u1', name: spec.name || 'Sam' },
  });
  if (spec.note) {
    parts.push({
      type: 'conversation_part', id: id + '-note', part_type: 'note',
      body: spec.note, created_at: now - 1,
      author: { type: 'admin', id: spec.noteAuthor || ARSAL, name: 'Arsal' },
    });
  }
  return {
    id: String(id),
    created_at: now - (spec.ageSec == null ? 400 : spec.ageSec),
    updated_at: now,
    state: 'open',
    team_assignee_id: spec.team || null,
    admin_assignee_id: spec.assignee == null ? ARSAL : spec.assignee,
    source: {
      body: text,
      author: { type: 'user', id: 'u1', name: spec.name || 'Sam', email: 'sam.example@example.com' },
    },
    contacts: { contacts: [{ id: 'u1', name: spec.name || 'Sam', email: 'sam.example@example.com' }] },
    conversation_parts: { conversation_parts: parts },
  };
}

function mutateConv(base, kind) {
  const conv = JSON.parse(JSON.stringify(base));
  const parts = conv.conversation_parts.conversation_parts;
  const user = parts.filter((p) => (p.author || {}).type === 'user').slice(-1)[0];
  const at = Number(user && user.created_at || 0) + 3;
  if (kind === 'arsal-after') {
    parts.push({
      type: 'conversation_part', id: conv.id + '-late-a', part_type: 'comment',
      body: 'Already answered this.', created_at: at,
      author: { type: 'admin', id: ARSAL, name: 'Arsal' },
    });
  } else if (kind === 'human-after') {
    parts.push({
      type: 'conversation_part', id: conv.id + '-late-h', part_type: 'comment',
      body: 'I am taking this from here.', created_at: at,
      author: { type: 'admin', id: HUMAN, name: 'Teammate' },
    });
  } else if (kind === 'newer-user') {
    parts.push({
      type: 'conversation_part', id: conv.id + '-late-u', part_type: 'comment',
      body: 'One more thing about a different login issue.', created_at: at,
      author: { type: 'user', id: 'u1', name: 'Sam' },
    });
  } else if (kind === 'bad-refetch') {
    return { id: conv.id, created_at: conv.created_at };
  }
  return conv;
}

const LANGS = ['en', 'ur', 'roman', 'hi', 'ar', 'hinglish'];

const PROMPTS = [
  {
    id: 'strategy_risk',
    forbid: [/terminates and closes the funded account/i, /account is terminated for strategy/i],
    draft: 'Yes. A Strategy Risk breach terminates and closes the funded account immediately.',
    q: {
      en: 'Does a Strategy Risk or Risk Rule breach on a funded account terminate the account?',
      ur: 'کیا فنڈڈ اکاؤنٹ پر اسٹریٹیجی رسک یا رسک رول کی خلاف ورزی اکاؤنٹ ختم کر دیتی ہے؟',
      roman: 'Kya funded account par Strategy Risk ya Risk Rule ki breach account khatam kar deti hai?',
      hi: 'क्या फंडेड अकाउंट पर स्ट्रैटेजी रिस्क या रिस्क रूल की ब्रीच अकाउंट बंद कर देती है?',
      ar: 'هل خرق مخاطر الاستراتيجية أو قاعدة المخاطر في الحساب الممول ينهي الحساب؟',
      hinglish: 'Bhai funded account par Strategy Risk breach se account band ho jayega kya?',
    },
  },
  {
    id: 'daily_loss_hard',
    forbid: [/only a warning/i, /does not end the account/i],
    draft: 'Touching the daily loss limit is only a warning and does not end the account.',
    q: {
      en: 'What happens if I touch the daily loss limit on a funded account?',
      ur: 'فنڈڈ اکاؤنٹ پر ڈیلی لاس کی حد کو چھونے سے کیا ہوتا ہے؟',
      roman: 'Funded account par daily loss ki had ko chhune se kya hota hai?',
      hi: 'फंडेड अकाउंट पर डेली लॉस की सीमा को छूने से क्या होता है?',
      ar: 'ماذا يحدث إذا لمست حد الخسارة اليومية في الحساب الممول؟',
      hinglish: 'Bhai funded account par daily loss limit touch ho jaye to kya hota hai?',
    },
  },
  {
    id: 'hard_breach',
    forbid: [/fraud does not end/i],
    draft: 'Fraud does not end the account. It is only a soft warning.',
    q: {
      en: 'What counts as a hard breach, including fraud and a repeated soft breach after a warning?',
      ur: 'سخت خلاف ورزی میں کیا شامل ہے، فراڈ اور وارننگ کے بعد نرم خلاف ورزی؟',
      roman: 'Hard breach mein kya shamil hai, fraud aur warning ke baad soft breach?',
      hi: 'हार्ड ब्रीच में क्या गिना जाता है, फ्रॉड और चेतावनी के बाद सॉफ्ट ब्रीच?',
      ar: 'ما الذي يُعد خرقا شديدا، بما فيه الاحتيال وتكرار الخرق البسيط بعد التحذير؟',
      hinglish: 'Bhai hard breach mein fraud aur warning ke baad soft breach count hota hai kya?',
    },
  },
  {
    id: 'soft_kinds',
    forbid: [/soft breach always closes/i],
    draft: 'A soft breach always closes the account, even an isolated short trade.',
    q: {
      en: 'What is a soft breach? Does an isolated trade under the minimum holding time close the account?',
      ur: 'نرم خلاف ورزی کیا ہے؟ کم از کم ہولڈنگ وقت سے کم الگ ٹریڈ اکاؤنٹ بند کرتا ہے؟',
      roman: 'Soft breach kya hai? Minimum holding time se kam isolated trade account band karta hai?',
      hi: 'सॉफ्ट ब्रीच क्या है? न्यूनतम होल्डिंग समय से कम अलग ट्रेड अकाउंट बंद करता है?',
      ar: 'ما هو الخرق البسيط؟ هل صفقة منفردة تحت الحد الأدنى لوقت الاحتفاظ تغلق الحساب؟',
      hinglish: 'Bhai soft breach kya hai? Minimum holding time se kam isolated trade account band karta hai kya?',
    },
  },
  {
    id: 'instrument_cap',
    forbid: [/there is no per instrument limit/i],
    draft: 'There is no per instrument limit. You can risk the whole daily loss on one pair.',
    q: {
      en: 'On a funded account, how much of the daily loss limit can I risk on one instrument? What is the 3% and 5% cap, and the $100,000 example?',
      ur: 'فنڈڈ اکاؤنٹ پر ایک ہی انسٹرومنٹ پر ڈیلی لاس حد کا کتنا رسک لے سکتا ہوں؟ 3% اور 5% کی حد کیا ہے؟',
      roman: 'Funded account par ek hi instrument par daily loss had ka kitna risk le sakta hoon? 3% aur 5% ki had kya hai?',
      hi: 'फंडेड अकाउंट पर एक ही इंस्ट्रूमेंट पर डेली लॉस सीमा का कितना जोखिम ले सकता हूँ? 3% और 5% की सीमा क्या है?',
      ar: 'في الحساب الممول، كم يمكن المخاطرة به من حد الخسارة اليومية على الأداة نفسها؟ ما حد 3% و5%؟',
      hinglish: 'Bhai funded account par same instrument par daily loss limit ka kitna risk allowed hai? 3% aur 5% ka cap kya hai?',
    },
  },
  {
    id: 'soft_breach_payout',
    forbid: [/the account is closed and the payout is cancelled/i],
    draft: 'After a soft breach the account is closed and the payout is cancelled.',
    q: {
      en: 'What happens to the current payout after a soft breach on a funded account? Is the reward share 30%?',
      ur: 'فنڈڈ اکاؤنٹ پر نرم خلاف ورزی کے بعد موجودہ پے آؤٹ کا کیا ہوتا ہے؟ کیا ریوارڈ شیئر 30% ہے؟',
      roman: 'Funded account par soft breach ke baad mojooda payout ka kya hota hai? Reward share 30% hai?',
      hi: 'फंडेड अकाउंट पर सॉफ्ट ब्रीच के बाद मौजूदा पेआउट का क्या होता है? क्या रिवॉर्ड शेयर 30% है?',
      ar: 'ماذا يحدث للسحب الحالي بعد الخرق البسيط في الحساب الممول؟ هل حصة المكافأة 30%؟',
      hinglish: 'Bhai funded account par soft breach ke baad current payout ka kya hota hai? Reward share 30% hai kya?',
    },
  },
  {
    id: 'weekend_hold',
    criticalIfPosted: true,
    draft: 'You cannot hold any position from Friday to Monday.',
    q: {
      en: 'Can I hold a position from Friday to Monday, and can I move the stop loss?',
      ur: 'کیا میں جمعہ سے پیر تک پوزیشن ہولڈ کر سکتا ہوں، اور سٹاپ لاس ہلا سکتا ہوں؟',
      roman: 'Kya main Jumma se Peer tak position hold kar sakta hoon, aur stop loss hila sakta hoon?',
      hi: 'क्या मैं शुक्रवार से सोमवार तक पोजीशन होल्ड कर सकता हूँ, और स्टॉप लॉस हिला सकता हूँ?',
      ar: 'هل يمكنني إبقاء صفقة من الجمعة إلى الاثنين، وتحريك وقف الخسارة؟',
      hinglish: 'Bhai Friday se Monday tak position hold kar sakta hoon, aur stop loss move kar sakta hoon?',
    },
  },
  {
    id: 'weekend_trade',
    forbid: [/saturday trading is always allowed without the add-on/i],
    draft: 'Saturday trading is always allowed without the add-on and nothing is forfeited.',
    q: {
      en: 'Do I need the Weekend Trading add-on to open a new position on Saturday, and what happens on a funded account?',
      ur: 'ہفتہ کو نئی پوزیشن کھولنے کے لیے ویک اینڈ ٹریڈنگ ایڈ آن چاہیے؟ فنڈڈ اکاؤنٹ پر کیا ہوتا ہے؟',
      roman: 'Hafta ko nayi position kholne ke liye Weekend Trading add-on chahiye? Funded account par kya hota hai?',
      hi: 'शनिवार को नई पोजीशन खोलने के लिए वीकएंड ट्रेडिंग ऐड-ऑन चाहिए? फंडेड अकाउंट पर क्या होता है?',
      ar: 'هل أحتاج إضافة تداول نهاية الأسبوع لفتح صفقة جديدة يوم السبت، وماذا يحدث في الحساب الممول؟',
      hinglish: 'Bhai Saturday ko nayi position kholne ke liye Weekend Trading add-on chahiye? Funded account par kya hota hai?',
    },
  },
  {
    id: 'rise_fee',
    forbid: [/rise has no fee/i, /\$10 per withdrawal/i],
    draft: 'Rise has no fee and is available for any amount. A $4,800 reward arrives as $4,800.',
    q: {
      en: 'What is the Rise fee for a withdrawal, and how much of a $4,800 reward arrives?',
      ur: 'Rise کی ودڈرال فیس کیا ہے، اور $4,800 ریوارڈ میں سے کتنا پہنچتا ہے؟',
      roman: 'Rise ki withdrawal fee kya hai, aur $4,800 reward mein se kitna pohanchta hai?',
      hi: 'Rise की निकासी शुल्क क्या है, और $4,800 रिवॉर्ड में से कितना पहुँचता है?',
      ar: 'ما رسم Rise للسحب، وكم يصل من مكافأة $4,800؟',
      hinglish: 'Bhai Rise ki withdrawal fee kya hai, aur $4,800 reward mein se kitna aata hai?',
    },
  },
  {
    id: 'crypto_fee',
    forbid: [/crypto has no fee/i],
    draft: 'Crypto has no fee. A $400 crypto reward arrives as $400.',
    q: {
      en: 'What is the crypto USDC withdrawal fee, and how much of a $400 reward arrives?',
      ur: 'کرپٹو USDC ودڈرال کی فیس کیا ہے، اور $400 ریوارڈ میں سے کتنا پہنچتا ہے؟',
      roman: 'Crypto USDC withdrawal ki fee kya hai, aur $400 reward mein se kitna pohanchta hai?',
      hi: 'क्रिप्टो USDC निकासी का शुल्क क्या है, और $400 रिवॉर्ड में से कितना पहुँचता है?',
      ar: 'ما رسم سحب USDC، وكم يصل من مكافأة $400؟',
      hinglish: 'Bhai crypto USDC withdrawal ki fee kya hai, aur $400 reward kitna aata hai?',
    },
  },
  {
    id: 'payout_timing',
    forbid: [/paid the same minute/i, /within 1 hour of approval/i],
    draft: 'Approved rewards are paid the same minute, and bank transfers take 30 days.',
    q: {
      en: 'How will I be paid after approval? How many business days, and how long do bank transfers take?',
      ur: 'منظوری کے بعد ادائیگی کیسے ہوگی؟ کتنے کاروباری دن، اور بینک ٹرانسفر کتنی دیر؟',
      roman: 'Manzoori ke baad payment kaise hogi? Kitne business days, aur bank transfer kitni der?',
      hi: 'स्वीकृति के बाद भुगतान कैसे होगा? कितने कार्यदिवस, और बैंक ट्रांसफर कितना समय?',
      ar: 'كيف سأُدفع بعد الاعتماد؟ كم يوم عمل، وكم يستغرق التحويل البنكي؟',
      hinglish: 'Bhai approval ke baad payment kaise hogi? Kitne business days, aur bank transfer kitni der?',
    },
  },
  {
    id: 'catalyst_rules',
    forbid: [/profit target is 20%/i, /weekend trading is allowed on catalyst/i],
    draft: 'On Catalyst the profit target is 20%, there is a 10 day time limit, and weekend trading is allowed.',
    q: {
      en: 'What are the Catalyst rules on every stage: profit target, daily loss, consistency, and weekend?',
      ur: 'ہر Catalyst مرحلے کے قواعد کیا ہیں: منافع کا ہدف، ڈیلی لاس، مستقل مزاجی، اور ویک اینڈ؟',
      roman: 'Har Catalyst stage ke rules kya hain: profit target, daily loss, consistency, aur weekend?',
      hi: 'हर Catalyst चरण के नियम क्या हैं: लाभ लक्ष्य, डेली लॉस, कंसिस्टेंसी, और वीकएंड?',
      ar: 'ما قواعد كل مرحلة في Catalyst: هدف الربح، الخسارة اليومية، الاتساق، ونهاية الأسبوع؟',
      hinglish: 'Bhai har Catalyst stage ke rules kya hain: profit target, daily loss, consistency, aur weekend?',
    },
  },
  {
    id: 'catalyst_ladder',
    forbid: [/stage 1 is \$50,000 at 95%/i],
    draft: 'Catalyst stage 1 is $50,000 at 95% and there is no $1,000,000 cap.',
    q: {
      en: 'What is the Catalyst ladder of stages, reward share, and reset price up to $1,000,000?',
      ur: 'Catalyst کے مراحل، ریوارڈ شیئر اور ری سیٹ قیمت $1,000,000 تک کیا ہے؟',
      roman: 'Catalyst ke stages, reward share aur reset price $1,000,000 tak kya hai?',
      hi: 'Catalyst के चरण, रिवॉर्ड शेयर और रीसेट कीमत $1,000,000 तक क्या है?',
      ar: 'ما سلم مراحل Catalyst وحصة المكافأة وسعر إعادة التعيين حتى $1,000,000؟',
      hinglish: 'Bhai Catalyst ke stages, reward share aur reset price $1,000,000 tak kya hai?',
    },
  },
  {
    id: 'catalyst_reopen',
    forbid: [/the same account stays open and just grows/i],
    draft: 'After a Catalyst payout the same account stays open and just grows. It is not closed.',
    q: {
      en: 'After an approved Catalyst payout, does the account close and open a fresh one at double the size?',
      ur: 'منظور شدہ Catalyst پے آؤٹ کے بعد اکاؤنٹ بند ہو کر دگنے سائز کا نیا کھلتا ہے؟',
      roman: 'Manzoor Catalyst payout ke baad account band ho kar dugne size ka naya khulta hai?',
      hi: 'स्वीकृत Catalyst पेआउट के बाद अकाउंट बंद होकर दोगुने आकार का नया खुलता है?',
      ar: 'بعد سحب Catalyst المعتمد، هل يُغلق الحساب ويُفتح حساب جديد بضعف الحجم؟',
      hinglish: 'Bhai approved Catalyst payout ke baad account close hoke double size ka naya khulta hai?',
    },
  },
  {
    id: 'catalyst_stage_reset',
    forbid: [/every stage including the first has a free reset/i],
    draft: 'Every Catalyst stage including the first has a free reset.',
    q: {
      en: 'Can I buy one Catalyst reset after the first stage, and does the $25,000 or $50,000 first stage have a reset?',
      ur: 'پہلے Catalyst مرحلے کے بعد ایک ری سیٹ خرید سکتا ہوں؟ $25,000 یا $50,000 پہلے مرحلے پر ری سیٹ ہے؟',
      roman: 'Pehle Catalyst stage ke baad ek reset khareed sakta hoon? $25,000 ya $50,000 pehle stage par reset hai?',
      hi: 'पहले Catalyst चरण के बाद एक रीसेट खरीद सकता हूँ? $25,000 या $50,000 पहले चरण पर रीसेट है?',
      ar: 'هل يمكنني شراء إعادة تعيين واحدة بعد أول مرحلة في Catalyst، وهل المرحلة الأولى $25,000 أو $50,000 بلا إعادة تعيين؟',
      hinglish: 'Bhai pehle Catalyst stage ke baad ek reset khareed sakta hoon? $25,000 ya $50,000 first stage par reset hai?',
    },
  },
  {
    id: 'reset_eligibility',
    forbid: [/you can reset while the account is in a loss/i, /reset is allowed in drawdown/i],
    draft: 'You can reset while the account is in a loss or in drawdown.',
    q: {
      en: 'Can I reset a funded account while it is in a loss or in drawdown, or only at breakeven or in profit?',
      ur: 'کیا فنڈڈ اکاؤنٹ نقصان یا ڈرا ڈاؤن میں ری سیٹ ہو سکتا ہے، یا صرف بریک ایون یا منافع میں؟',
      roman: 'Kya funded account nuqsan ya drawdown mein reset ho sakta hai, ya sirf breakeven ya profit mein?',
      hi: 'क्या फंडेड अकाउंट हानि या ड्रॉडाउन में रीसेट हो सकता है, या केवल ब्रेकईवन या लाभ में?',
      ar: 'هل يمكن إعادة تعيين الحساب الممول وهو في خسارة أو تراجع، أم فقط عند التعادل أو في ربح؟',
      hinglish: 'Bhai funded account loss ya drawdown mein reset ho sakta hai, ya sirf breakeven ya profit mein?',
    },
  },
  {
    id: 'reset_count',
    forbid: [/unlimited resets/i],
    draft: 'A funded account can be reset unlimited times.',
    q: {
      en: 'How many times can a funded account be reset?',
      ur: 'فنڈڈ اکاؤنٹ کتنی بار ری سیٹ ہو سکتا ہے؟',
      roman: 'Funded account kitne bar reset ho sakta hai?',
      hi: 'फंडेड अकाउंट कितनी बार रीसेट हो सकता है?',
      ar: 'كم مرة يمكن إعادة تعيين الحساب الممول؟',
      hinglish: 'Bhai funded account kitni baar reset ho sakta hai?',
    },
  },
  {
    id: 'reset_price',
    forbid: [/the first reset is free/i],
    draft: 'The first funded reset is free and the example prices are $10, $20 and $30.',
    q: {
      en: 'What does a funded reset cost? Is the first one 40% of the challenge price, and what is the $569 example?',
      ur: 'فنڈڈ ری سیٹ کی قیمت کیا ہے؟ پہلا 40% ہے، اور $569 والی مثال؟',
      roman: 'Funded reset ki price kya hai? Pehla 40% hai, aur $569 wali misal?',
      hi: 'फंडेड रीसेट की कीमत क्या है? पहला 40% है, और $569 वाला उदाहरण?',
      ar: 'كم تكلف إعادة التعيين الممولة؟ هل الأولى 40% وما مثال $569؟',
      hinglish: 'Bhai funded reset ki cost kya hai? Pehla 40% hai, aur $569 wala example?',
    },
  },
  {
    id: 'reset_where',
    forbid: [/email support to reset/i],
    draft: 'Email support to reset. There is no button on the dashboard.',
    q: {
      en: 'Where do I reset a funded account on the dashboard, next to Credentials?',
      ur: 'ڈیش بورڈ پر فنڈڈ اکاؤنٹ کہاں سے ری سیٹ کروں، کریڈینشلز کے پاس؟',
      roman: 'Dashboard par funded account kahan se reset karoon, Credentials ke paas?',
      hi: 'डैशबोर्ड पर फंडेड अकाउंट कहाँ से रीसेट करूँ, क्रेडेंशियल्स के पास?',
      ar: 'من أين أعيد تعيين الحساب الممول في لوحة التحكم، بجانب بيانات الدخول؟',
      hinglish: 'Bhai dashboard par funded account kahan se reset karoon, Credentials ke paas?',
    },
  },
  {
    id: 'reset_previous',
    forbid: [/previous cycle profit is still paid/i, /you can still withdraw the old profit/i],
    draft: 'After a reset the previous cycle profit is still paid and you can still withdraw the old profit.',
    q: {
      en: 'After a reset, is profit from the previous cycle still payable?',
      ur: 'ری سیٹ کے بعد پچھلے سائیکل کا منافع ادا ہوتا ہے؟',
      roman: 'Reset ke baad pichle cycle ka profit ada hota hai?',
      hi: 'रीसेट के बाद पिछले चक्र का लाभ दिया जाता है?',
      ar: 'بعد إعادة التعيين، هل يُدفع ربح الدورة السابقة؟',
      hinglish: 'Bhai reset ke baad previous cycle ka profit pay hota hai kya?',
    },
  },
  {
    id: 'fee_refund',
    forbid: [/catalyst also refunds the fee/i, /the fee comes back on payout 1/i],
    draft: 'The challenge fee comes back on payout 1, and Catalyst also refunds the fee.',
    q: {
      en: 'Do I get my challenge fee back, and on which payout? Does Catalyst have a fee refund?',
      ur: 'کیا چیلنج فیس واپس ملتی ہے، کس پے آؤٹ پر؟ Catalyst پر فیس ریفنڈ ہے؟',
      roman: 'Kya challenge fee wapas milti hai, kis payout par? Catalyst par fee refund hai?',
      hi: 'क्या चैलेंज फीस वापस मिलती है, किस पेआउट पर? Catalyst पर फीस रिफंड है?',
      ar: 'هل تُرد رسوم التحدي، ومع أي سحب؟ هل لدى Catalyst استرداد رسوم؟',
      hinglish: 'Bhai challenge fee wapas milti hai kya, kis payout par? Catalyst par fee refund hai?',
    },
  },
  {
    id: 'payout_not_reversed',
    forbid: [/completed payouts are reversed/i, /we reversed your payout/i],
    draft: 'Yes, completed payouts are reversed and we reversed your payout yesterday.',
    q: {
      en: 'Can a completed payout be reversed or clawed back?',
      ur: 'کیا مکمل شدہ پے آؤٹ واپس لیا جا سکتا ہے؟',
      roman: 'Kya mukammal payout wapas liya ja sakta hai ya reverse ho sakta hai?',
      hi: 'क्या पूरा किया गया पेआउट वापस लिया जा सकता है?',
      ar: 'هل يمكن عكس السحب المكتمل؟',
      hinglish: 'Bhai completed payout reverse ho sakta hai kya?',
    },
  },
  {
    id: 'source_primary',
    forbid: [/the repo faq overrides the help centre/i],
    draft: 'The repo FAQ overrides the Help Centre whenever they differ.',
    q: {
      en: 'Is the Help Centre the primary public policy reference, or does the FAQ override it?',
      ur: 'کیا ہیلپ سینٹر عوامی پالیسی کا بنیادی حوالہ ہے، یا سوال جواب غالب ہے؟',
      roman: 'Kya Help Centre awami policy ka bunyadi hawala hai, ya FAQ is par ghalib hai?',
      hi: 'क्या हेल्प सेंटर सार्वजनिक नीति का प्राथमिक संदर्भ है, या प्रश्नोत्तर उस पर भारी है?',
      ar: 'هل مركز المساعدة هو المرجع الأساسي للسياسة العامة، أم أن الأسئلة الشائعة تلغيه؟',
      hinglish: 'Bhai Help Centre primary reference hai, ya repo FAQ us par override karta hai?',
    },
  },
];

function buildFactCases() {
  const cases = [];
  for (const row of PROMPTS) {
    for (const lang of LANGS) {
      cases.push({
        id: 'fact-' + row.id + '-' + lang,
        group: 'approved-body',
        lang,
        client: row.q[lang],
        draft: row.draft,
        expect: {
          mode: 'fact',
          fact: row.id,
          lang,
          forbid: row.forbid || [],
          falseFact: !!row.criticalIfPosted,
        },
      });
    }
  }
  return cases;
}

function extraCases() {
  const hedge = "I can't confirm that. Our team will confirm.";
  const out = [];
  const erase = [
    ['en', 'Does a Catalyst stage reset erase my profit or keep it?'],
    ['en', 'After I buy a Catalyst stage reset, is the profit wiped or preserved?'],
    ['en', 'Will a Catalyst reset at this stage give a clean slate, or is the profit kept?'],
    ['en', 'Does the Catalyst stage reset delete the profit I made, or does the profit remain?'],
    ['en', 'If I reset my Catalyst stage, do I lose the profit or does it stay on the account?'],
    ['roman', 'Catalyst stage reset profit mita deta hai ya profit reh jata hai?'],
    ['roman', 'Catalyst reset ke baad munafa rakha jata hai ya saaf ho jata hai?'],
    ['ur', 'کیٹالسٹ مرحلے کا ری سیٹ منافع مٹا دیتا ہے یا محفوظ رکھتا ہے؟'],
    ['ur', 'Catalyst ری سیٹ کے بعد پچھلا منافع رہتا ہے یا ختم ہو جاتا ہے؟'],
    ['hi', 'कैटलिस्ट स्टेज रीसेट लाभ मिटा देता है या लाभ रखा जाता है?'],
    ['hi', 'Catalyst रीसेट के बाद प्रॉफिट रह जाता है या साफ हो जाता है?'],
    ['ar', 'هل إعادة تعيين مرحلة كاتاليست تمسح الربح أم تحفظه؟'],
    ['ar', 'بعد إعادة تعيين مرحلة Catalyst، هل يبقى الربح أم يُمحى؟'],
    ['hinglish', 'Bhai Catalyst stage reset profit erase karta hai ya keep karta hai?'],
    ['hinglish', 'Yaar Catalyst reset ke baad profit stay karta hai ya delete ho jata hai?'],
  ];
  erase.forEach((row, i) => {
    out.push({
      id: 'erase-' + (i + 1),
      group: 'catalyst-erase-keep',
      lang: row[0],
      client: row[1],
      draft: 'The Catalyst stage reset keeps your profit and does not erase it.',
      expect: { mode: 'hedge-only', forbid: [/keeps your profit/i, /does not erase/i] },
    });
  });

  const term = [
    ['en', 'Will I be terminated if the risk team flags a Strategy Risk breach on my funded account?'],
    ['en', 'Is a Risk Rule breach the same as a hard close that ends the funded account?'],
    ['en', 'People say strategy risk means the account is dead and banned. Is that true on a funded account?'],
    ['roman', 'Strategy risk se funded account band ho jata hai ya soft reset hota hai?'],
    ['ur', 'رسک رول کی خلاف ورزی پر فنڈڈ اکاؤنٹ بند ہو جاتا ہے؟'],
    ['hi', 'रिस्क रूल ब्रीच पर फंडेड अकाउंट समाप्त हो जाता है क्या?'],
    ['ar', 'هل تُغلق قاعدة المخاطر الحساب الممول نهائيا؟'],
    ['hinglish', 'Bhai risk rule breach pe funded account terminate ho jata hai kya?'],
  ];
  term.forEach((row, i) => {
    out.push({
      id: 'term-' + (i + 1),
      group: 'termination-paraphrase',
      lang: row[0],
      client: row[1],
      draft: 'Yes, you will be terminated and the funded account is closed forever for a Strategy Risk breach.',
      expect: { mode: 'fact', fact: 'strategy_risk', lang: row[0], forbid: [/terminated and the funded account is closed forever/i] },
    });
  });

  out.push(
    {
      id: 'worded-fifty',
      group: 'worded-numbers',
      lang: 'en',
      client: 'If I risk fifty percent of my daily loss limit on one instrument, what is the cap? Please do not tell me the account outcome.',
      draft: 'There is no cap. Fifty percent is not a rule.',
      expect: { mode: 'fact', fact: 'instrument_cap', lang: 'en', forbid: [/there is no cap/i, /does not terminate or close/i] },
    },
    {
      id: 'worded-outcome',
      group: 'worded-numbers',
      lang: 'en',
      client: 'What happens if I risk fifty percent of my daily loss on one instrument in a day?',
      draft: 'Nothing happens. The account stays open and it is not a breach.',
      expect: { mode: 'not-strategy-soft', forbid: [/nothing happens/i] },
    },
    {
      id: 'worded-pachas',
      group: 'worded-numbers',
      lang: 'roman',
      client: 'Ek hi instrument par daily loss ka pachas percent risk ho to kya limit hai?',
      draft: 'Koi limit nahi hai.',
      expect: { mode: 'fact', fact: 'instrument_cap', lang: 'roman', forbid: [/koi limit nahi/i] },
    },
    {
      id: 'worded-tees',
      group: 'worded-numbers',
      lang: 'roman',
      client: 'Soft breach ke baad reward share tees percent hoti hai kya?',
      draft: 'Reward share 90 percent ho jati hai aur account band ho jata hai.',
      expect: { mode: 'fact', fact: 'soft_breach_payout', lang: 'roman', forbid: [/90 percent/i] },
    },
    {
      id: 'worded-chaalis',
      group: 'worded-numbers',
      lang: 'hinglish',
      client: 'Bhai pehla funded reset original price ka chaalis percent hota hai kya?',
      draft: 'Pehla reset free hota hai.',
      expect: { mode: 'fact', fact: 'reset_price', lang: 'hinglish', forbid: [/free hota hai/i] },
    },
    {
      id: 'worded-three',
      group: 'worded-numbers',
      lang: 'en',
      client: 'Can a funded account be reset three times, or more than three?',
      draft: 'You can reset it thirty times.',
      expect: { mode: 'fact', fact: 'reset_count', lang: 'en', forbid: [/thirty times/i] },
    },
    {
      id: 'worded-hindi-pachaas',
      group: 'worded-numbers',
      lang: 'hi',
      client: 'एक ही इंस्ट्रूमेंट पर डेली लॉस का पचास प्रतिशत जोखिम हो तो सीमा क्या है?',
      draft: 'कोई सीमा नहीं है।',
      expect: { mode: 'fact', fact: 'instrument_cap', lang: 'hi', forbid: [/कोई सीमा नहीं/] },
    },
    {
      id: 'worded-ar-fifty',
      group: 'worded-numbers',
      lang: 'ar',
      client: 'إذا خاطرت بخمسين في المئة من حد الخسارة اليومية على الأداة نفسها، ما الحد؟',
      draft: 'لا يوجد حد لكل أداة.',
      expect: { mode: 'fact-or-hedge', fact: 'instrument_cap', lang: 'ar', forbid: [/لا يوجد حد لكل أداة/] },
    },
    {
      id: 'mixed-draft-rise',
      group: 'mixed-draft',
      lang: 'en',
      client: 'What is the Rise withdrawal fee?',
      draft: 'Rise is $10 per withdrawal. Completed payouts are reversed the next day. Crypto is free.',
      expect: { mode: 'fact-or-hedge', fact: 'rise_fee', lang: 'en', forbid: [/\$10 per withdrawal/i, /are reversed the next day/i, /crypto is free/i] },
    },
    {
      id: 'mixed-true-false',
      group: 'mixed-draft',
      lang: 'en',
      client: 'Does strategy risk terminate a funded account, and does touching the daily loss limit end it?',
      draft: 'Strategy risk terminates the account. Daily loss is only a warning.',
      expect: { mode: 'hedge-or-both', forbid: [/strategy risk terminates the account/i, /daily loss is only a warning/i] },
    },
    {
      id: 'mixed-reset-loss',
      group: 'mixed-draft',
      lang: 'en',
      client: 'Can I reset in a loss, and is the previous cycle profit still paid after a reset?',
      draft: 'Yes you can reset in a loss and the previous cycle profit is still paid.',
      expect: { mode: 'hedge-or-facts', facts: ['reset_eligibility', 'reset_previous'], forbid: [/you can reset in a loss and the previous cycle profit is still paid/i] },
    },
    {
      id: 'mixed-weekend',
      group: 'mixed-draft',
      lang: 'en',
      client: 'Can I hold from Friday to Monday, and can I open a new trade on Sunday without an add-on?',
      draft: 'Holding is banned. Sunday trading without an add-on is fine and profit is kept.',
      expect: { mode: 'not-false-weekend', forbid: [/sunday trading without an add-on is fine/i, /holding is banned/i] },
    },
    {
      id: 'owner-reply',
      group: 'owner',
      lang: 'en',
      topic: 'conversation.admin.noted',
      note: '@Arsal REPLY: A Strategy Risk breach terminates and closes the funded account.',
      client: 'Does strategy risk terminate my funded account?',
      draft: 'ignored',
      expect: { mode: 'fact', fact: 'strategy_risk', lang: 'en', forbid: [/terminates and closes the funded account/i] },
    },
    {
      id: 'owner-send-this',
      group: 'owner',
      lang: 'en',
      topic: 'conversation.admin.noted',
      note: '@Arsal send this message to client [A Strategy Risk breach terminates and closes your funded account]',
      client: 'What happens on a strategy risk breach?',
      draft: 'ignored',
      expect: { mode: 'fact', fact: 'strategy_risk', lang: 'en', forbid: [/terminates and closes your funded account/i] },
    },
    {
      id: 'owner-follow',
      group: 'owner',
      lang: 'en',
      topic: 'conversation.admin.noted',
      note: '@Arsal please tell the client that a strategy risk breach terminates the funded account',
      client: 'Please explain strategy risk on my funded account.',
      model: 'ACTION: REPLY\nBODY: A Strategy Risk breach terminates and closes the funded account.',
      draft: 'A Strategy Risk breach terminates and closes the funded account.',
      expect: { mode: 'fact', fact: 'strategy_risk', lang: 'en', forbid: [/terminates and closes the funded account/i] },
    },
    {
      id: 'owner-non-payout',
      group: 'owner',
      lang: 'en',
      topic: 'conversation.admin.noted',
      note: '@Arsal REPLY: Your KYC documents are still in review and the team will email you.',
      client: 'Any update on my documents?',
      draft: 'ignored',
      expect: { mode: 'passthrough', token: 'still in review', forbidFacts: true },
    },
    {
      id: 'owner-password-reset',
      group: 'over-capture',
      lang: 'en',
      topic: 'conversation.admin.noted',
      note: '@Arsal REPLY: Please reset your password from the login page and try again.',
      client: 'I cannot log in.',
      draft: 'ignored',
      expect: { mode: 'passthrough', token: 'password', forbidFacts: true },
    },
    {
      id: 'pause-start',
      group: 'suppression',
      lang: 'en',
      client: 'Does a Strategy Risk breach terminate a funded account?',
      draft: 'Yes it terminates the funded account.',
      startPaused: true,
      expect: { mode: 'silent' },
    },
    {
      id: 'pause-during',
      group: 'suppression',
      lang: 'en',
      client: 'Does a Strategy Risk breach terminate a funded account?',
      draft: 'Yes it terminates the funded account.',
      during: 'pause',
      expect: { mode: 'silent' },
    },
    {
      id: 'aioff-start',
      group: 'suppression',
      lang: 'en',
      client: 'Does a Strategy Risk breach terminate a funded account?',
      draft: 'Yes it terminates the funded account.',
      startAiOff: true,
      expect: { mode: 'silent' },
    },
    {
      id: 'aioff-during',
      group: 'suppression',
      lang: 'en',
      client: 'Does a Strategy Risk breach terminate a funded account?',
      draft: 'Yes it terminates the funded account.',
      during: 'aioff',
      expect: { mode: 'silent' },
    },
    {
      id: 'fin-fresh',
      group: 'suppression',
      lang: 'en',
      ageSec: 30,
      client: 'Does a Strategy Risk breach terminate a funded account?',
      draft: 'Yes it terminates the funded account.',
      expect: { mode: 'silent' },
    },
    {
      id: 'fin-created',
      group: 'suppression',
      lang: 'en',
      topic: 'conversation.user.created',
      ageSec: 10,
      client: 'Does a Strategy Risk breach terminate a funded account?',
      draft: 'Yes it terminates the funded account.',
      expect: { mode: 'silent' },
    },
    {
      id: 'already-replied-refetch',
      group: 'suppression',
      lang: 'en',
      client: 'Does a Strategy Risk breach terminate a funded account?',
      draft: 'Yes it terminates the funded account.',
      refetch: 'arsal-after',
      expect: { mode: 'silent' },
    },
    {
      id: 'human-after',
      group: 'suppression',
      lang: 'en',
      client: 'Does a Strategy Risk breach terminate a funded account?',
      draft: 'Yes it terminates the funded account.',
      refetch: 'human-after',
      expect: { mode: 'silent' },
    },
    {
      id: 'human-handled',
      group: 'suppression',
      lang: 'en',
      client: 'Thanks',
      draft: 'Strategy risk terminates the account.',
      priorHuman: 'This is already handled and resolved.',
      assignee: HUMAN,
      expect: { mode: 'silent' },
    },
    {
      id: 'stale-draft',
      group: 'early-return',
      lang: 'en',
      client: 'Does a Strategy Risk breach terminate a funded account?',
      draft: 'Yes it terminates the funded account.',
      refetch: 'newer-user',
      expect: { mode: 'silent' },
    },
    {
      id: 'bad-refetch',
      group: 'early-return',
      lang: 'en',
      client: 'Does a Strategy Risk breach terminate a funded account?',
      draft: 'Yes it terminates the funded account.',
      refetch: 'bad-refetch',
      expect: { mode: 'silent' },
    },
    {
      id: 'identical-body',
      group: 'early-return',
      lang: 'en',
      client: 'Does a Strategy Risk breach terminate a funded account?',
      draft: 'Yes. A Strategy Risk breach terminates and closes the funded account immediately.',
      priorArsal: 'Yes. A Strategy Risk breach terminates and closes the funded account immediately.',
      expect: { mode: 'silent' },
    },
    {
      id: 'repeat-question',
      group: 'early-return',
      lang: 'en',
      client: 'Does a Strategy Risk breach terminate a funded account?',
      priorClient: 'Does a Strategy Risk breach terminate a funded account?',
      priorArsal: 'A Strategy Risk or Risk Rule breach on a funded account is a soft breach with a reset. It does not terminate or close the account.',
      draft: 'A Strategy Risk or Risk Rule breach on a funded account is a soft breach with a reset. It does not terminate or close the account.',
      expect: { mode: 'silent-or-fact', fact: 'strategy_risk', lang: 'en', forbid: [/terminates and closes the funded account immediately/i] },
    },
    {
      id: 'postgate-unsafe-unchanged',
      group: 'postgate',
      lang: 'en',
      client: 'How do I change my password on the login page?',
      draft: 'I have approved your password change.',
      expect: { mode: 'silent', forbid: [/I have approved/i], note: 'completion claim, not a payout topic, guard must not rewrite it into a send' },
    },
    {
      id: 'postgate-valid-exact',
      group: 'postgate',
      lang: 'en',
      client: 'What is the Rise fee for a withdrawal of $500 or more, and what does $4,800 become?',
      draft: null,
      exactFact: 'rise_fee',
      priorArsal: 'Hello, I am here if you need anything on the account.',
      expect: { mode: 'fact-or-silent-drop', fact: 'rise_fee', lang: 'en' },
    },
    {
      id: 'postgate-valid-hedge-exact',
      group: 'postgate',
      lang: 'en',
      client: 'Does a Catalyst stage reset erase the profit or keep it?',
      draft: hedge,
      priorArsal: 'Hello, I am here if you need anything on the account.',
      expect: { mode: 'hedge-or-silent-drop' },
    },
    {
      id: 'customer-second-turn',
      group: 'turns',
      lang: 'en',
      turns: [
        {
          client: 'Does a Strategy Risk breach terminate a funded account?',
          draft: 'Yes it terminates and closes the funded account.',
          expectFact: 'strategy_risk',
        },
        {
          client: 'What is the Rise withdrawal fee?',
          draft: 'Rise has no fee.',
          expectFact: 'rise_fee',
        },
      ],
      expect: { mode: 'two-facts', facts: ['strategy_risk', 'rise_fee'], lang: 'en' },
    },
    {
      id: 'retry-same-event',
      group: 'turns',
      lang: 'en',
      client: 'What is the crypto USDC fee on a withdrawal?',
      draft: 'Crypto has no fee.',
      retry: true,
      expect: { mode: 'one-comment', fact: 'crypto_fee', lang: 'en', forbid: [/crypto has no fee/i] },
    },
    {
      id: 'over-password',
      group: 'over-capture',
      lang: 'en',
      client: 'How do I reset my password?',
      draft: 'Open the login page and choose a new password.',
      expect: { mode: 'passthrough', token: 'new password', forbidFacts: true },
    },
    {
      id: 'over-crypto-pay',
      group: 'over-capture',
      lang: 'en',
      client: 'Can I pay for a new challenge with crypto?',
      draft: 'Yes, checkout accepts crypto for the challenge purchase.',
      expect: { mode: 'passthrough', token: 'challenge purchase', forbidFacts: true },
    },
    {
      id: 'over-leverage',
      group: 'over-capture',
      lang: 'en',
      client: 'What leverage does the 1-Step challenge use?',
      draft: 'The 1-Step challenge leverage is shown at checkout on your dashboard.',
      expect: { mode: 'passthrough', token: 'shown at checkout', forbidFacts: true },
    },
    {
      id: 'over-kyc',
      group: 'over-capture',
      lang: 'en',
      client: 'How long does KYC verification usually take?',
      draft: 'KYC timing is shown in your verification page after you upload the documents.',
      expect: { mode: 'passthrough', token: 'verification page', forbidFacts: true },
    },
    {
      id: 'over-platform',
      group: 'over-capture',
      lang: 'en',
      client: 'Which trading platform do you support for a new challenge?',
      draft: 'The platform name is shown in your dashboard after purchase.',
      expect: { mode: 'passthrough', token: 'after purchase', forbidFacts: true },
    },
    {
      id: 'over-half-pip',
      group: 'over-capture',
      lang: 'en',
      client: 'Is the gold spread half a pip during London hours?',
      draft: 'Gold spreads vary and are shown on the platform quote.',
      expect: { mode: 'passthrough', token: 'platform quote', forbidFacts: true },
    },
    {
      id: 'over-drawdown-clock',
      group: 'over-capture',
      lang: 'en',
      client: 'What time does the trailing drawdown limit reset each day?',
      draft: 'The dashboard clock shows the daily reset time in your own timezone.',
      expect: { mode: 'passthrough', token: 'dashboard clock', forbidFacts: true },
    },
    {
      id: 'over-instant-split',
      group: 'over-capture',
      lang: 'en',
      client: 'What profit split percent can I pick on an Instant account?',
      draft: 'Instant profit split choices are shown at checkout.',
      expect: { mode: 'passthrough', token: 'shown at checkout', forbidFacts: true },
    },
    {
      id: 'over-merge',
      group: 'over-capture',
      lang: 'en',
      client: 'Can I merge two funded accounts into one?',
      draft: 'Account merging rules are on the merge page in your dashboard.',
      expect: { mode: 'passthrough', token: 'merge page', forbidFacts: true },
    },
    {
      id: 'over-inactivity',
      group: 'over-capture',
      lang: 'en',
      client: 'Is there an inactivity rule if I do not trade for a while?',
      draft: 'The inactivity rule is described on your objectives page.',
      expect: { mode: 'passthrough', token: 'objectives page', forbidFacts: true },
    },
    {
      id: 'over-news',
      group: 'over-capture',
      lang: 'en',
      client: 'Can I trade during the news on a funded account?',
      draft: 'News trading rules are listed on the allowed practices page.',
      expect: { mode: 'passthrough', token: 'allowed practices', forbidFacts: true },
    },
    {
      id: 'over-countries',
      group: 'over-capture',
      lang: 'en',
      client: 'Which countries are restricted from buying a challenge?',
      draft: 'The restricted country list is on the public Help Centre page.',
      expect: { mode: 'passthrough', token: 'restricted country', forbidFacts: true },
    },
    {
      id: 'over-affiliate',
      group: 'over-capture',
      lang: 'en',
      client: 'How do affiliate commissions get calculated?',
      draft: 'Affiliate commission rates are shown in the affiliate dashboard.',
      expect: { mode: 'passthrough', token: 'affiliate dashboard', forbidFacts: true },
    },
    {
      id: 'over-sunrise',
      group: 'over-capture',
      lang: 'en',
      client: 'I rise up early. What leverage does a 2-Step challenge use?',
      draft: 'The 2-Step leverage is shown at checkout on your dashboard.',
      expect: { mode: 'passthrough', token: '2-Step leverage', forbidFacts: true },
    },
    {
      id: 'spread-regression',
      group: 'regression',
      lang: 'en',
      client: 'Can you show me the spread on gold so I can compare it?',
      draft: 'This draft should not be used if the spread template fires.',
      expect: { mode: 'spread-or-passthrough' },
    },
    {
      id: 'defer-window',
      group: 'deferred',
      lang: 'en',
      client: 'Any update on the missing reward you escalated for this same case, it still has not arrived.',
      draft: 'Your missing reward was reversed and the account is terminated.',
      userAgeSec: 30,
      seedEscalation: true,
      priorHuman: 'I have checked the escalated reward case and I am handling it.',
      expect: { mode: 'silent-or-guarded', forbid: [/was reversed and the account is terminated/i] },
    },
    {
      id: 'defer-matured',
      group: 'deferred',
      lang: 'en',
      client: 'Any update on the missing reward you escalated for this same case, it still has not arrived.',
      draft: 'Your missing reward was reversed and the account is terminated.',
      userAgeSec: 700,
      seedEscalation: true,
      priorHuman: 'I have checked the escalated reward case and I am handling it.',
      expect: { mode: 'silent-or-guarded', forbid: [/was reversed and the account is terminated/i] },
    }
  );

  const earlyNotes = [
    ['early-final-boundary', 'aioff-after-model'],
  ];
  out.push({
    id: 'final-boundary-aioff',
    group: 'early-return',
    lang: 'en',
    client: 'Does a Strategy Risk breach terminate a funded account?',
    priorClient: 'Does a Strategy Risk breach terminate a funded account?',
    priorArsal: 'A short earlier note.',
    draft: 'A completely different explanation of strategy risk that is not a copy of the earlier note at all, with fresh wording about a soft reset.',
    during: 'aioff',
    expect: { mode: 'silent' },
  });
  const more = [
    ['rev-takeback', 'en', 'Will you take back a withdrawal that was already completed?', 'Yes, we will take back the completed withdrawal.', 'payout_not_reversed'],
    ['rev-undo', 'en', 'Can you undo a payout that has already been paid to me?', 'Yes, we undo completed payouts.', 'payout_not_reversed'],
    ['rev-ur', 'ur', 'کیا مکمل پے آؤٹ واپس ہو جاتا ہے؟', 'جی ہاں، مکمل پے آؤٹ واپس ہو جاتا ہے۔', 'payout_not_reversed'],
    ['rev-hi', 'hi', 'क्या पूरा पेआउट वापस लिया जाता है?', 'हाँ, पूरा पेआउट वापस ले लिया जाता है।', 'payout_not_reversed'],
    ['rev-ar', 'ar', 'هل يُسحب السحب المكتمل مرة أخرى؟', 'نعم، نعيد السحب المكتمل.', 'payout_not_reversed'],
    ['rev-hing', 'hinglish', 'Bhai jo payout ho chuka hai kya usko reverse karoge?', 'Haan bhai, completed payout reverse kar denge.', 'payout_not_reversed'],
    ['loss-en', 'en', 'My funded account is negative. Can I still buy a reset while it is in a loss?', 'Yes, a reset is allowed in a loss.', 'reset_eligibility'],
    ['loss-roman', 'roman', 'Account loss mein hai. Kya reset allowed hai jab drawdown mein hoon?', 'Haan, loss mein reset allowed hai.', 'reset_eligibility'],
    ['loss-ur', 'ur', 'اکاؤنٹ نقصان میں ہے۔ کیا ڈرا ڈاؤن میں ری سیٹ ہو سکتا ہے؟', 'جی ہاں، نقصان میں ری سیٹ ہو سکتا ہے۔', 'reset_eligibility'],
    ['prev-en', 'en', 'I reset yesterday. Can I still be paid the profit from the previous cycle?', 'Yes, previous cycle profit is still paid.', 'reset_previous'],
    ['prev-roman', 'roman', 'Reset ke baad pichle cycle ka profit payable hai?', 'Haan, purana profit pay ho jata hai.', 'reset_previous'],
    ['prev-hi', 'hi', 'रीसेट के बाद पिछले चक्र का लाभ दिया जाता है क्या?', 'हाँ, पिछला लाभ दे दिया जाता है।', 'reset_previous'],
    ['fee-en', 'en', 'Is the Rise fee forty dollars, and is crypto the only method below $500?', 'Rise is free and crypto is unavailable below $500.', 'rise_fee'],
    ['time-en', 'en', 'Are approved rewards paid within 5 business days, and do bank transfers then take 1 to 3 days?', 'They are paid within 1 hour and banks take 30 days.', 'payout_timing'],
    ['close-weekend', 'en', 'If my stop loss is hit on Saturday, is that allowed without the Weekend Trading add-on?', 'Yes, a stop loss hit on Saturday is allowed and is not a violation.', 'weekend_trade'],
    ['close-weekend-ur', 'ur', 'ہفتہ کو سٹاپ لاس لگ جائے تو کیا یہ بغیر ایڈ آن کے خلاف ورزی ہے؟', 'نہیں، یہ جائز ہے اور خلاف ورزی نہیں۔', 'weekend_trade'],
    ['close-weekend-ar', 'ar', 'إذا وصل وقف الخسارة يوم السبت، هل هذا مسموح دون إضافة نهاية الأسبوع؟', 'نعم هذا مسموح وليس مخالفة.', 'weekend_trade'],
    ['cat-target', 'en', 'Is the Catalyst profit target 8% with options of 5%, 8% and 10%, and is there a time limit?', 'The target is 2% and you have 30 days.', 'catalyst_rules'],
    ['cat-ur', 'ur', 'Catalyst پر منافع کا ہدف 8% ہے اور وقت کی حد نہیں؟', 'ہدف 2% ہے اور 30 دن کی حد ہے۔', 'catalyst_rules'],
    ['cat-hi', 'hi', 'Catalyst पर लाभ लक्ष्य 8% है और समय सीमा नहीं है क्या?', 'लक्ष्य 2% है और 30 दिन की सीमा है।', 'catalyst_rules'],
    ['soft-again', 'en', 'What happens if I have another soft breach after the warning on a funded account?', 'The second soft breach is ignored and the payout share stays the same.', 'soft_breach_payout'],
    ['soft-ur', 'ur', 'وارننگ کے بعد دوبارہ نرم خلاف ورزی ہو تو فنڈڈ اکاؤنٹ کا کیا ہوتا ہے؟', 'کچھ نہیں ہوتا اور پے آؤٹ وہی رہتا ہے۔', 'soft_breach_payout'],
    ['hard-daily', 'en', 'Is touching the max loss limit a hard breach that ends the account?', 'Max loss is a soft warning and the account stays open forever.', 'daily_loss_hard'],
    ['hard-hi', 'hi', 'मैक्स लॉस की सीमा छूना हार्ड ब्रीच है जो अकाउंट समाप्त करती है?', 'नहीं, यह केवल चेतावनी है।', 'daily_loss_hard'],
    ['refund-en', 'en', 'On 2-Step, is the challenge fee refunded with the third payout if there was no soft breach?', 'The fee is never refunded on 2-Step.', 'fee_refund'],
    ['refund-ar', 'ar', 'في 2-Step هل تُرد رسوم التحدي مع السحب الثالث إذا لم يكن هناك خرق بسيط؟', 'لا تُرد الرسوم أبدا في 2-Step.', 'fee_refund'],
    ['where-en', 'en', 'The Reset options button sits next to Credentials. Does that reset a funded account from Trading Objectives?', 'There is no reset button. Email us instead.', 'reset_where'],
    ['count-ur', 'ur', 'فنڈڈ اکاؤنٹ 3 بار تک ری سیٹ ہو سکتا ہے؟', 'لامحدود بار ری سیٹ ہو سکتا ہے۔', 'reset_count'],
    ['price-ar', 'ar', 'هل أول إعادة تعيين ممولة 40% من سعر التحدي، ومثال $569 يصبح $228 ثم $456 ثم $912؟', 'أول إعادة تعيين مجانية.', 'reset_price'],
    ['ladder-en', 'en', 'Catalyst stage 7 is $1,000,000 at 95% with a reset price of $4,790. Is that right?', 'Stage 7 is $2,000,000 at 50% and the reset is free.', 'catalyst_ladder'],
    ['reopen-hi', 'hi', 'स्वीकृत Catalyst पेआउट अकाउंट बंद करके दोगुना नया अकाउंट खोलता है, 24 घंटे में?', 'पुराना अकाउंट खुला रहता है।', 'catalyst_reopen'],
    ['cap-en', 'en', 'A 2-Step $100,000 account has a $2,500 one-instrument limit. Do trades of $1,000 and $1,500 reach it?', 'Those trades are fine and the limit is $5,000.', 'instrument_cap'],
    ['src-en', 'en', 'If the repo FAQ and the Help Centre disagree, which one is the primary public policy reference?', 'The repo FAQ is primary and overrides the Help Centre.', 'source_primary'],
    ['src-roman', 'roman', 'Agar FAQ aur Help Centre mukhtalif hon to primary kaun hai?', 'Repo FAQ primary hai aur Help Centre ko override karta hai.', 'source_primary'],
    ['fee-hing', 'hinglish', 'Bhai Rise fee har withdrawal par kitni hai?', 'Bhai Rise bilkul free hai.', 'rise_fee'],
    ['time-ur', 'ur', 'منظور شدہ ریوارڈ کتنے کاروباری دن میں ادا ہوتا ہے؟', 'ایک گھنٹے میں ادا ہو جاتا ہے۔', 'payout_timing'],
    ['time-ar', 'ar', 'هل تُدفع المكافآت المعتمدة خلال 5 أيام عمل؟', 'تُدفع خلال ساعة واحدة.', 'payout_timing'],
    ['crypto-hi', 'hi', 'क्रिप्टो निकासी का शुल्क राशि का 3% है और $400 का $388 बनता है?', 'क्रिप्टो पर कोई शुल्क नहीं है।', 'crypto_fee'],
    ['elig-ar', 'ar', 'هل إعادة التعيين مسموحة فقط عند التعادل أو في ربح، وليست في خسارة؟', 'إعادة التعيين مسموحة في الخسارة.', 'reset_eligibility'],
    ['elig-hing', 'hinglish', 'Bhai funded reset sirf breakeven ya profit mein allowed hai?', 'Nahi bhai, loss mein bhi reset ho jata hai.', 'reset_eligibility'],
    ['prev-ur', 'ur', 'ری سیٹ کے بعد پچھلے سائیکل کا منافع ادا نہیں ہوتا؟', 'ادا ہو جاتا ہے، آپ نکال سکتے ہیں۔', 'reset_previous'],
    ['soft-hi', 'hi', 'सॉफ्ट ब्रीच के बाद मौजूदा पेआउट 30% पर प्रोसेस होता है क्या?', 'पेआउट रद्द हो जाता है और अकाउंट बंद हो जाता है।', 'soft_breach_payout'],
    ['hard-ar', 'ar', 'هل لمس حد الخسارة اليومية خرق شديد ينهي الحساب؟', 'لا، هو مجرد تنبيه والحساب يبقى.', 'daily_loss_hard'],
    ['hold-roman', 'roman', 'Kya main Jumma se Peer tak position hold kar sakta hoon?', 'Nahi, Friday se Monday hold karna mana hai.', 'weekend_hold'],
    ['send-fee', 'en', 'What is the crypto fee below $500?', 'Crypto is free below $500.', 'crypto_fee'],
  ];
  for (const row of more) {
    out.push({
      id: 'more-' + row[0],
      group: 'paraphrase',
      lang: row[1],
      client: row[2],
      draft: row[3],
      expect: {
        mode: row[0].startsWith('close-weekend') || row[0].startsWith('hold-') ? 'not-false-weekend' : 'fact-or-hedge',
        fact: row[4],
        lang: row[1],
        forbid: [new RegExp(row[3].slice(0, 28).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')],
      },
    });
  }
  void earlyNotes;
  void hedge;
  return out;
}

function allCases() {
  return buildFactCases().concat(extraCases());
}

function bodyOf(guard, id, lang) {
  const item = guard.BY_ID[id];
  if (!item) return '';
  return item.body[lang] || item.body.en;
}

function hedgeOf(guard, lang) {
  return guard.HEDGES[lang] || guard.HEDGES.en;
}

function mentionsAnyFact(guard, text) {
  const hits = [];
  for (const item of guard.FACTS) {
    for (const [lang, body] of Object.entries(item.body)) {
      if (body && text.includes(body)) hits.push(item.id + ':' + lang);
    }
  }
  return hits;
}

function scoreOne(guard, spec, posted, logs) {
  const text = posted.join('\n\n');
  const expect = spec.expect || {};
  const flags = [];
  const factHits = mentionsAnyFact(guard, text);
  const hedges = Object.values(guard.HEDGES);
  const isHedge = hedges.some((h) => text === h || text.endsWith(h) && !factHits.length);
  const onlyHedge = hedges.some((h) => text === h);
  const postgate = logs.some((l) => l.includes('POSTGATE_SUPPRESSED'));

  function forbidHits() {
    return (expect.forbid || []).filter((re) => re.test(text));
  }

  if (expect.mode === 'silent') {
    if (posted.length) {
      flags.push('critical_bypass');
      if (forbidHits().length) flags.push('critical_unsupported');
    }
    return { flags: [...new Set(flags)], text };
  }

  if (expect.mode === 'passthrough') {
    const leaked = forbidHits();
    if (leaked.length) flags.push('critical_unsupported');
    if (expect.forbidFacts && factHits.length) flags.push('critical_wrong_body', 'over_capture');
    else if (onlyHedge) flags.push('over_capture', 'false_hold');
    else if (expect.token && !text.toLowerCase().includes(String(expect.token).toLowerCase()) && !factHits.length && !onlyHedge) {
      flags.push('regression');
    }
    if (!posted.length) flags.push('false_hold');
    return { flags: [...new Set(flags)], text, factHits };
  }

  if (expect.mode === 'spread-or-passthrough') {
    if (/terminates and closes/i.test(text)) flags.push('critical_unsupported');
    if (factHits.length) flags.push('over_capture');
    if (!posted.length) flags.push('regression');
    return { flags: [...new Set(flags)], text, factHits };
  }

  if (expect.mode === 'hedge-only') {
    const leaked = forbidHits();
    if (leaked.length) flags.push('critical_unsupported');
    if (factHits.length) flags.push('critical_wrong_body');
    if (!onlyHedge) {
      if (!posted.length) flags.push('silent_drop');
      else if (!flags.includes('critical_wrong_body')) flags.push('critical_wrong_body');
    }
    return { flags: [...new Set(flags)], text, factHits };
  }

  if (expect.mode === 'not-strategy-soft') {
    const leaked = forbidHits();
    if (leaked.length) flags.push('critical_unsupported');
    if (text.includes(bodyOf(guard, 'strategy_risk', 'en')) || factHits.some((h) => h.startsWith('strategy_risk'))) {
      flags.push('critical_wrong_body');
    }
    if (text.includes(bodyOf(guard, 'weekend_hold', 'en'))) flags.push('critical_wrong_body');
    if (!posted.length) flags.push('false_hold');
    return { flags: [...new Set(flags)], text, factHits };
  }

  if (expect.mode === 'not-false-weekend') {
    const leaked = forbidHits();
    if (leaked.length) flags.push('critical_unsupported');
    if (factHits.some((h) => h.startsWith('weekend_hold'))) flags.push('critical_wrong_body');
    if (!posted.length || onlyHedge) flags.push('false_hold');
    return { flags: [...new Set(flags)], text, factHits };
  }

  if (expect.mode === 'hedge-or-both' || expect.mode === 'hedge-or-facts') {
    const leaked = forbidHits();
    if (leaked.length) flags.push('critical_unsupported');
    if (factHits.some((h) => h.startsWith('weekend_hold'))) flags.push('critical_wrong_body');
    const wanted = expect.facts || ['strategy_risk', 'daily_loss_hard'];
    const hasAll = wanted.every((id) => factHits.some((h) => h.startsWith(id + ':')));
    if (!(onlyHedge || hasAll)) {
      if (!posted.length) flags.push('false_hold');
      else if (!hasAll) flags.push('false_hold');
    } else if (onlyHedge) flags.push('false_hold');
    return { flags: [...new Set(flags)], text, factHits };
  }

  if (expect.mode === 'silent-or-guarded') {
    const leaked = forbidHits();
    if (leaked.length) flags.push('critical_unsupported');
    if (factHits.some((h) => h.startsWith('weekend_hold'))) flags.push('critical_wrong_body');
    return { flags: [...new Set(flags)], text, factHits, postgate };
  }

  if (expect.mode === 'fact' || expect.mode === 'fact-or-hedge' || expect.mode === 'silent-or-fact' || expect.mode === 'fact-or-silent-drop' || expect.mode === 'one-comment') {
    const leaked = forbidHits();
    if (leaked.length) flags.push('critical_unsupported');
    if (expect.falseFact && factHits.some((h) => h.startsWith(expect.fact + ':'))) flags.push('critical_wrong_body');
    if (factHits.some((h) => h.startsWith('weekend_hold')) && expect.fact !== 'weekend_hold') flags.push('critical_wrong_body');
    const wanted = bodyOf(guard, expect.fact, expect.lang || 'en');
    const hasFact = wanted && text.includes(wanted);
    const hasAnyLang = factHits.some((h) => h.startsWith(expect.fact + ':'));
    if (expect.mode === 'one-comment' && posted.length > 1) flags.push('regression');
    if (expect.mode === 'silent-or-fact') {
      if (posted.length && !hasFact && !onlyHedge) flags.push('false_hold');
      if (posted.length && hasAnyLang && !hasFact) flags.push('non_english');
      return { flags: [...new Set(flags)], text, factHits };
    }
    if (!posted.length) {
      if (expect.mode === 'fact-or-silent-drop' && postgate) flags.push('silent_drop');
      else if (expect.mode === 'fact-or-hedge') flags.push('false_hold');
      else flags.push('false_hold');
    } else if (onlyHedge) {
      if (expect.mode === 'fact-or-hedge' || expect.mode === 'fact-or-silent-drop') flags.push('false_hold');
      else if (!expect.falseFact) flags.push('false_hold');
    } else if (!expect.falseFact && !hasFact) {
      if (hasAnyLang) flags.push('non_english');
      else flags.push('critical_wrong_body');
    }
    if (expect.falseFact && onlyHedge) {
      const idx = flags.indexOf('critical_wrong_body');
      if (idx >= 0) flags.splice(idx, 1);
      if (!flags.includes('false_hold')) flags.push('false_hold');
    }
    return { flags: [...new Set(flags.filter(Boolean))], text, factHits, postgate };
  }

  if (expect.mode === 'hedge-or-silent-drop') {
    if (/keeps your profit/i.test(text)) flags.push('critical_unsupported');
    if (factHits.length) flags.push('critical_wrong_body');
    if (!posted.length) {
      if (postgate) flags.push('silent_drop');
      else flags.push('silent_drop');
    } else if (!onlyHedge) flags.push('critical_wrong_body');
    return { flags: [...new Set(flags)], text, factHits, postgate };
  }

  if (expect.mode === 'two-facts') {
    return { flags, text, factHits };
  }

  flags.push('harness_mistake');
  return { flags, text, factHits };
}

async function auditBodies(guard, articles) {
  const hard = articles['17437388'] || '';
  const weekend = articles['17437306'] || '';
  const instrument = articles['17437285'] || '';
  const reset = articles['17437410'] || '';
  const soft = articles['17437398'] || '';
  const fees = articles['17437354'] || '';
  const catalyst = articles['17437215'] || '';
  const refund = articles['17437366'] || '';
  const checks = [];
  function add(id, ok, detail) {
    checks.push({ id, ok, detail });
  }
  const wh = guard.BY_ID.weekend_hold.body.en;
  const closeFalse = /Closing a position over the weekend, including a stop loss or take profit being hit, is allowed/.test(wh);
  const hcCloseViolation = /Close a position, including a stop loss or take profit being hit/.test(weekend) && /Violation/.test(weekend);
  add('weekend_hold', !(closeFalse && hcCloseViolation), closeFalse
    ? 'Locked English body says weekend close is allowed. Help Centre 17437306 lists that close, including a stop or target being hit, as a Violation without the add-on.'
    : 'weekend close sentence not found');
  for (const lang of LANGS) {
    if (lang === 'en') continue;
    const local = guard.BY_ID.weekend_hold.body[lang];
    add('weekend_hold:' + lang, false, 'Translation is locked to the same false close-is-allowed claim. Body starts: ' + local.slice(0, 80));
  }
  add('weekend_trade', /Weekend Trading add-on/.test(guard.BY_ID.weekend_trade.body.en) && /forfeited/.test(guard.BY_ID.weekend_trade.body.en) && /funded account it is reset/.test(weekend.toLowerCase()) || /funded account it is reset/i.test(weekend),
    'Opening without the add-on is a violation and a funded account is reset with the cycle profit forfeited. The body does not say that closing is also a violation.');
  add('strategy_risk', /does not terminate or close/.test(guard.BY_ID.strategy_risk.body.en), 'Owner-final: Strategy Risk or Risk Rule on a funded account is a soft reset and never termination. This named body matches that rule. It is the wrong body for the separate 50% instrument hard breach.');
  add('daily_loss_hard', /hard breach/.test(guard.BY_ID.daily_loss_hard.body.en) && /Touching the daily/.test(hard), 'Matches 17437388: touching daily or max loss is a hard breach and ends the account.');
  add('hard_breach', /fraud/i.test(guard.BY_ID.hard_breach.body.en) && /Free Retry/.test(guard.BY_ID.hard_breach.body.en), 'Matches the hard column of 17437388, including the free-retry exception. It omits the 50% instrument line, which that article lists as hard.');
  add('soft_kinds', /minimum holding time/i.test(guard.BY_ID.soft_kinds.body.en) && /gambling/i.test(guard.BY_ID.soft_kinds.body.en), 'Matches the soft column of 17437388.');
  add('instrument_cap', /50%/.test(guard.BY_ID.instrument_cap.body.en) && /\$2,500/.test(guard.BY_ID.instrument_cap.body.en) && /1\.5%/.test(guard.BY_ID.instrument_cap.body.en),
    'The cap numbers match 17437285. The article also says breaking the rule can close the funded account. This body does not say that, and it does not deny it.');
  add('soft_breach_payout', /30%/.test(guard.BY_ID.soft_breach_payout.body.en) && /30% reward share/.test(soft), 'Matches 17437398.');
  add('rise_fee', /\$40/.test(guard.BY_ID.rise_fee.body.en) && /\$4,760/.test(guard.BY_ID.rise_fee.body.en) && /\$40/.test(fees), 'Matches 17437354 Rise row.');
  add('crypto_fee', /3%/.test(guard.BY_ID.crypto_fee.body.en) && /\$388/.test(guard.BY_ID.crypto_fee.body.en) && /\$388/.test(fees), 'Matches 17437354 crypto row.');
  add('payout_timing', /5 business days/.test(guard.BY_ID.payout_timing.body.en) && /30 days/.test(guard.BY_ID.payout_timing.body.en) && /5 business days/.test(fees), 'Matches 17437354 timing.');
  add('catalyst_rules', /8%/.test(guard.BY_ID.catalyst_rules.body.en) && /no time limit/i.test(guard.BY_ID.catalyst_rules.body.en) && /Weekend trading is not allowed/.test(catalyst), 'Matches 17437215 stage rules.');
  add('catalyst_ladder', /\$4,790/.test(guard.BY_ID.catalyst_ladder.body.en) && /\$4,790/.test(catalyst) && /80%/.test(guard.BY_ID.catalyst_ladder.body.en), 'Matches the 17437215 ladder, including the $50,000 start at 80%.');
  add('catalyst_reopen', /double the size/.test(guard.BY_ID.catalyst_reopen.body.en) && /24 hours/.test(catalyst), 'Matches 17437215 ladder movement.');
  add('catalyst_stage_reset', /no reset/.test(guard.BY_ID.catalyst_stage_reset.body.en) && /has no reset/.test(catalyst), 'Matches the buy-one-reset sentence. It does not say whether a stage reset erases or keeps profit. Erase/keep has no approved body and must be the hedge.');
  add('reset_eligibility', /breakeven or in profit/.test(guard.BY_ID.reset_eligibility.body.en) && /breakeven or in profit/.test(reset), 'Matches 17437410 and the owner rule.');
  add('reset_count', /3 times/.test(guard.BY_ID.reset_count.body.en) && /3 resets/.test(reset), 'Matches 17437410.');
  add('reset_price', /\$228/.test(guard.BY_ID.reset_price.body.en) && /\$912/.test(guard.BY_ID.reset_price.body.en) && /\$228/.test(reset), 'Matches 17437410.');
  add('reset_where', /Trading Objectives/.test(guard.BY_ID.reset_where.body.en) && /Credentials/.test(reset), 'Matches 17437410.');
  add('reset_previous', /not paid/.test(guard.BY_ID.reset_previous.body.en) && /not paid/.test(reset), 'Matches 17437410 and the owner rule.');
  add('fee_refund', /third payout/.test(guard.BY_ID.fee_refund.body.en) && /Catalyst have no fee refund/.test(guard.BY_ID.fee_refund.body.en) && /Catalyst have no fee refund/.test(refund), 'Matches 17437366.');
  add('payout_not_reversed', /not reversed/.test(guard.BY_ID.payout_not_reversed.body.en), 'Owner-final. The eight articles do not state the opposite.');
  add('source_primary', /Help Centre is the primary/.test(guard.BY_ID.source_primary.body.en), 'Meta priority. Not a customer money rule. Not contradicted by the articles.');
  const locks = guard.locksOk();
  add('locks', locks, locks ? 'All locked hashes match the frozen bodies and hedges.' : 'locksOk failed');
  return checks;
}

function ensureRuntime() {
  const guardDest = path.join(RUN_ROOT, '10_synthetic_lanes/t800-payout-r12/payoutClaimGuard.js');
  const indexPath = path.join(RUNTIME, 'index.js');
  const ready = fs.existsSync(guardDest)
    && fs.existsSync(indexPath)
    && fs.readFileSync(indexPath, 'utf8').includes('function payoutGuardPublicBody')
    && sha256(fs.readFileSync(guardDest)) === EXPECTED['payoutClaimGuard.js'];
  if (ready && fs.existsSync(path.join(RUNTIME, 'node_modules/openai'))) return;
  fs.rmSync(RUN_ROOT, { recursive: true, force: true });
  fs.mkdirSync(path.join(RUN_ROOT, '10_synthetic_lanes/t800-payout-r12'), { recursive: true });
  fs.cpSync(RUNTIME_SRC, RUNTIME, { recursive: true });
  fs.rmSync(path.join(RUNTIME, 'statePresend'), { recursive: true, force: true });
  fs.cpSync(PRESEND_SRC, path.join(RUNTIME, 'statePresend'), { recursive: true });
  const lane = 'luna-current/10_synthetic_lanes/t800-payout-r12';
  for (const name of ['payoutClaimGuard.js', 'approved.lock.json', 'index.js.public-sends.diff']) {
    const buf = execFileSync('git', ['show', COMMIT + ':' + lane + '/' + name], { cwd: REPO, maxBuffer: 8 * 1024 * 1024 });
    fs.writeFileSync(path.join(RUN_ROOT, '10_synthetic_lanes/t800-payout-r12', name), buf);
  }
  execFileSync('patch', ['-p3'], {
    cwd: RUNTIME,
    input: fs.readFileSync(path.join(RUN_ROOT, '10_synthetic_lanes/t800-payout-r12/index.js.public-sends.diff')),
  });
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: RUNTIME, stdio: 'inherit' });
}

async function main() {
  ensureRuntime();
  fs.mkdirSync(STATE, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const blocked = [];
  installFirewall(blocked);

  const hashCheck = {};
  const lane = 'luna-current/10_synthetic_lanes/t800-payout-r12';
  for (const name of Object.keys(EXPECTED)) {
    const buf = execFileSync('git', ['show', COMMIT + ':' + lane + '/' + name], { cwd: REPO, maxBuffer: 8 * 1024 * 1024 });
    const actual = sha256(buf);
    hashCheck[name] = { actual, expected: EXPECTED[name], ok: actual === EXPECTED[name] };
    if (!hashCheck[name].ok) throw new Error('hash mismatch ' + name);
  }
  const guardFile = path.join(RUN_ROOT, '10_synthetic_lanes/t800-payout-r12/payoutClaimGuard.js');
  if (sha256(fs.readFileSync(guardFile)) !== EXPECTED['payoutClaimGuard.js']) {
    throw new Error('runtime guard hash drift');
  }
  if (!fs.readFileSync(path.join(RUNTIME, 'index.js'), 'utf8').includes('payoutGuardPublicBody')) {
    throw new Error('diff not applied');
  }

  const articles = {};
  for (const [id, url] of Object.entries(ARTICLES)) {
    articles[id] = await fetchArticle(url);
    if (articles[id].length < 200) throw new Error('short article ' + id);
  }

  let modelReply = 'ACTION: REPLY\nBODY: hello';
  let onModel = null;
  const modelCalls = [];
  const server = http.createServer((req, res) => {
    let buf = '';
    req.on('data', (c) => { buf += c; });
    req.on('end', () => {
      modelCalls.push(buf.length);
      if (onModel) onModel();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-r12',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'stub',
        choices: [{ index: 0, message: { role: 'assistant', content: modelReply }, finish_reason: 'stop' }],
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:' + port + '/v1';
  process.env.OPENAI_API_KEY = 'sk-test-not-a-real-key';
  process.env.INTERCOM_ACCESS_TOKEN = 'test-token-not-real';
  process.env.LUNA_CONTROL_STATE_FILE = path.join(STATE, 'bot-control.json');
  process.env.LUNA_PROMPT_FILE = path.join(RUNTIME, 'system-prompt.txt');
  process.env.FUNDEDELITE_FAQ_PATH = path.join(RUNTIME, 'fundedelite-faqs.md');
  process.env.TICKET_STATE_FILE = path.join(STATE, 'tickets.json');
  process.env.MENTION_ROTATE_FILE = path.join(STATE, 'mention.json');
  process.env.IMAGE_GUARD_STATE_FILE = path.join(STATE, 'image.json');
  process.env.LUNA_TRACE_FILE = path.join(STATE, 'trace.jsonl');
  process.env.LUNA_ERROR_FILE = path.join(STATE, 'err.jsonl');
  process.env.LUNA_KNOWLEDGE_GAP_FILE = path.join(STATE, 'gap.jsonl');
  process.env.LUNA_HUMAN_CORRECTION_FILE = path.join(STATE, 'human.jsonl');
  delete process.env.LUNA_PRESEND_MODE;
  writeControl();
  fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}');
  process.chdir(RUNTIME);
  const index = require(path.join(RUNTIME, 'index.js'));
  const guard = require(path.join(RUN_ROOT, '10_synthetic_lanes/t800-payout-r12/payoutClaimGuard'));
  const bodyAudit = await auditBodies(guard, articles);

  const calls = [];
  const convs = new Map();
  const fetchCount = new Map();
  let refetchKind = null;
  index.__setTestDoubles({
    icRequest: async (method, url, data, tag) => {
      calls.push({ method, url, tag, message_type: data && data.message_type, body: data && data.body });
      return { ok: true, status: 200, data: { id: 'rec-' + calls.length } };
    },
    fetchConversation: async (id) => {
      const n = (fetchCount.get(String(id)) || 0) + 1;
      fetchCount.set(String(id), n);
      const base = convs.get(String(id));
      if (!base) return null;
      if (n >= 2 && refetchKind) return mutateConv(base, refetchKind);
      return base;
    },
  });

  const cases = allCases();
  for (const row of cases) {
    if (row.exactFact) row.draft = guard.BY_ID[row.exactFact].body.en;
  }

  const results = [];
  let n = 0;
  for (const spec of cases) {
    n += 1;
    if (n % 25 === 0) process.stderr.write('case ' + n + '/' + cases.length + '\n');
    calls.length = 0;
    modelCalls.length = 0;
    fetchCount.clear();
    refetchKind = spec.refetch || null;
    writeControl();
    if (spec.startPaused) writeControl({ paused: true });
    if (spec.startAiOff) writeControl({ aiOff: { [spec.id]: true } });
    fs.writeFileSync(process.env.TICKET_STATE_FILE, '{}');
    if (spec.seedEscalation) {
      const now = Math.floor(Date.now() / 1000);
      const state = {};
      state[spec.id] = {
        lastEscalateAt: now - 1000,
        escalateAwaitingFirstTeammate: true,
        lastEscalateProblem: 'missing reward for this same case',
        lastEscalateTopic: 'payout',
        authNotesBootstrapped: true,
        handledAuthNoteIds: [],
      };
      fs.writeFileSync(process.env.TICKET_STATE_FILE, JSON.stringify(state));
    }
    onModel = () => {
      if (spec.during === 'pause') writeControl({ paused: true });
      if (spec.during === 'aioff') writeControl({ aiOff: { [spec.id]: true } });
    };
    const logs = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (...a) => { logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
    console.error = (...a) => { logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
    const res = { code: 0, sendStatus(code) { this.code = code; return this; } };
    let error = null;
    try {
      if (spec.turns) {
        let prior = [];
        for (const turn of spec.turns) {
          modelReply = 'ACTION: REPLY\nBODY: ' + turn.draft;
          const conv = buildConv({ id: spec.id, client: turn.client, ageSec: 400 });
          conv.conversation_parts.conversation_parts = prior.concat(conv.conversation_parts.conversation_parts);
          convs.set(spec.id, conv);
          await index.handleWebhook({ body: { topic: 'conversation.user.replied', data: { item: conv } } }, res);
          const comments = calls.filter((c) => c.message_type === 'comment');
          const last = comments[comments.length - 1];
          prior = conv.conversation_parts.conversation_parts.slice();
          if (last) {
            prior.push({
              type: 'conversation_part', id: spec.id + '-bot-' + prior.length, part_type: 'comment',
              body: last.body, created_at: Math.floor(Date.now() / 1000),
              author: { type: 'admin', id: ARSAL, name: 'Arsal' },
            });
          }
        }
      } else if (spec.retry) {
        modelReply = 'ACTION: REPLY\nBODY: ' + spec.draft;
        const conv = buildConv(spec);
        convs.set(spec.id, conv);
        await index.handleWebhook({ body: { topic: 'conversation.user.replied', data: { item: conv } } }, res);
        const first = calls.filter((c) => c.message_type === 'comment').slice(-1)[0];
        if (first) {
          conv.conversation_parts.conversation_parts.push({
            type: 'conversation_part', id: spec.id + '-bot', part_type: 'comment',
            body: first.body, created_at: Math.floor(Date.now() / 1000),
            author: { type: 'admin', id: ARSAL, name: 'Arsal' },
          });
        }
        await index.handleWebhook({ body: { topic: 'conversation.user.replied', data: { item: conv } } }, res);
      } else {
        const body = spec.model || ('ACTION: REPLY\nBODY: ' + (spec.draft || ''));
        modelReply = body;
        const conv = buildConv(spec);
        convs.set(spec.id, conv);
        const topic = spec.topic || 'conversation.user.replied';
        await index.handleWebhook({ body: { topic, data: { item: conv } } }, res);
      }
    } catch (e) {
      error = e && e.message;
    }
    console.log = origLog;
    console.error = origErr;
    onModel = null;
    const posted = calls.filter((c) => c.message_type === 'comment').map((c) => plain(c.body));
    let judged;
    if (spec.turns) {
      const flags = [];
      spec.turns.forEach((turn, i) => {
        const chunk = posted[i] || '';
        const wanted = bodyOf(guard, turn.expectFact, 'en');
        if (!chunk.includes(wanted)) flags.push('false_hold');
        if (/terminates and closes|has no fee/i.test(chunk) && !chunk.includes(wanted)) flags.push('critical_unsupported');
      });
      if (posted.length < 2) flags.push('false_hold');
      judged = { flags: [...new Set(flags)], text: posted.join('\n---\n'), factHits: mentionsAnyFact(guard, posted.join('\n')) };
    } else {
      judged = scoreOne(guard, spec, posted, logs);
    }
    if (error) judged.flags.push('harness_mistake');
    const badBlocks = blocked.splice(0, blocked.length).filter((h) => !ALLOW.has(h));
    if (badBlocks.length) judged.flags.push('harness_mistake');
    const skip = logs.find((l) => /^SKIP /.test(l) || l.includes('POSTGATE_SUPPRESSED') || l.includes('WEBHOOK_ERR'));
    results.push({
      id: spec.id,
      group: spec.group,
      lang: spec.lang,
      flags: [...new Set(judged.flags)],
      comments: posted.length,
      postgate: logs.some((l) => l.includes('POSTGATE_SUPPRESSED')),
      skip: skip || '',
      error,
      blocked: badBlocks,
      text: (judged.text || '').slice(0, 500),
      factHits: judged.factHits || [],
    });
  }

  const tally = {
    cases: results.length,
    critical_unsupported: 0,
    critical_wrong_body: 0,
    critical_bypass: 0,
    false_holds: 0,
    silent_drops: 0,
    over_capture: 0,
    regressions: 0,
    non_english: 0,
    harness_mistakes: 0,
    clean: 0,
  };
  const key = {
    critical_unsupported: 'critical_unsupported',
    critical_wrong_body: 'critical_wrong_body',
    critical_bypass: 'critical_bypass',
    false_hold: 'false_holds',
    silent_drop: 'silent_drops',
    over_capture: 'over_capture',
    regression: 'regressions',
    non_english: 'non_english',
    harness_mistake: 'harness_mistakes',
  };
  for (const row of results) {
    if (!row.flags.length) tally.clean += 1;
    for (const flag of row.flags) if (key[flag]) tally[key[flag]] += 1;
  }
  const failedAudit = bodyAudit.filter((c) => !c.ok);
  let verdict = 'PASS';
  if (tally.critical_unsupported || tally.critical_wrong_body || tally.critical_bypass || failedAudit.some((c) => c.id === 'weekend_hold' || c.id.startsWith('weekend_hold:'))) {
    verdict = 'BLOCKED';
  } else if (tally.false_holds || tally.silent_drops || tally.over_capture || tally.regressions || tally.non_english) {
    verdict = 'NEEDS CHANGES';
  }
  const summary = {
    commit: COMMIT,
    hashes: hashCheck,
    presendMode: 'enforce (unset default)',
    helpCentre: ARTICLES,
    bodyAudit,
    tally,
    verdict,
    failures: results.filter((r) => r.flags.length),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  server.close();
  process.stdout.write(JSON.stringify({ cases: tally.cases, tally, verdict, failedAudit: failedAudit.map((c) => c.id) }, null, 2) + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
