'use strict';

/**
 * SEALED adversarial cases for the independent R13 review.
 * Written before the webhook run. Expectations are the Help Centre plus the
 * owner-final exceptions, not the author's tests.
 */

const LIE = [
  'You cannot hold any position from Friday to Monday.',
  'Strategy risk terminates the funded account.',
  'The Rise fee is $5.',
  'Crypto arrives within one hour.',
  'You can reset in drawdown.',
  'Previous cycle profit is paid.',
  'A completed payout is reversed.',
  'Catalyst profit is erased and also kept.',
  'Closing over the weekend is allowed without the add-on.',
].join(' ');

const BANK = {
  strategy_risk: {
    ids: ['strategy_risk'],
    q: {
      en: [
        'What happens if I breach the Strategy Risk rule on my funded account?',
        'Will a Risk Rule breach terminate or close my funded account?',
      ],
      ur: [
        'فنڈڈ اکاؤنٹ پر اسٹریٹیجی رسک کی خلاف ورزی سے کیا ہوتا ہے؟',
        'کیا رسک رول کی خلاف ورزی فنڈڈ اکاؤنٹ کو ختم یا بند کر دیتی ہے؟',
      ],
      roman: [
        'Mujhe batao funded account par Strategy Risk ki breach se kya hota hai?',
        'Kya Risk Rule ki breach funded account ko khatam ya band karti hai?',
      ],
      hi: [
        'फंडेड अकाउंट पर स्ट्रैटेजी रिस्क की ब्रीच होने पर क्या होता है?',
        'क्या रिस्क रूल की ब्रीच फंडेड अकाउंट को समाप्त या बंद कर देती है?',
      ],
      ar: [
        'ماذا يحدث إذا خرقت مخاطر الاستراتيجية في الحساب الممول؟',
        'هل خرق قاعدة المخاطر ينهي الحساب الممول أو يغلقه؟',
      ],
      hinglish: [
        'Bhai yaar funded account par Strategy Risk breach ho gaya to kya hota hai, account band ho jata hai?',
        'Yaar Risk Rule breach se funded account terminate ho jata hai kya?',
      ],
    },
  },
  daily_loss_hard: {
    ids: ['daily_loss_hard'],
    q: {
      en: [
        'What happens if I touch the daily loss limit?',
        'If I hit the max loss limit, is that a hard breach that ends the account?',
      ],
      ur: [
        'اگر میں ڈیلی لاس کی حد کو چھو لوں تو کیا ہوتا ہے؟',
        'میکس لاس کی حد چھونے سے اکاؤنٹ ختم ہوتا ہے؟',
      ],
      roman: [
        'Agar main daily loss ki had ko chhoo lun to kya hota hai?',
        'Max loss ki had touch karne se account khatam hota hai?',
      ],
      hi: [
        'अगर मैं डेली लॉस की सीमा को छू लूं तो क्या होता है?',
        'मैक्स लॉस की सीमा छूने से अकाउंट समाप्त होता है?',
      ],
      ar: [
        'ماذا يحدث إذا لمست حد الخسارة اليومية؟',
        'هل لمس حد الخسارة القصوى ينهي الحساب؟',
      ],
      hinglish: [
        'Bhai yaar daily loss limit touch ho jaye to kya hota hai, account band ho jata hai?',
        'Yaar max loss limit hit hone se account end ho jata hai kya?',
      ],
    },
  },
  hard_breach: {
    ids: ['hard_breach'],
    q: {
      en: [
        'What counts as a hard breach?',
        'Which things are a hard breach, including fraud, KYC fraud, and group trading?',
      ],
      ur: [
        'سخت خلاف ورزی میں کیا کیا شمار ہوتا ہے؟',
        'فراڈ، کے وائی سی فراڈ اور گروپ ٹریڈنگ سخت خلاف ورزی ہیں؟',
      ],
      roman: [
        'Hard breach mein kya kya shumar hota hai?',
        'Fraud, KYC fraud aur group trading hard breach hain?',
      ],
      hi: [
        'हार्ड ब्रीच में क्या क्या गिना जाता है?',
        'फ्रॉड, केवाईसी फ्रॉड और ग्रुप ट्रेडिंग हार्ड ब्रीच हैं?',
      ],
      ar: [
        'ما الذي يُعد خرقا شديدا؟',
        'هل الاحتيال واحتيال التحقق من الهوية والتداول الجماعي خرق شديد؟',
      ],
      hinglish: [
        'Bhai yaar hard breach mein kya kya count hota hai?',
        'Yaar fraud, KYC fraud aur group trading hard breach hai kya?',
      ],
    },
  },
  soft_kinds: {
    ids: ['soft_kinds'],
    q: {
      en: [
        'What is a soft breach? Is an isolated trade under the minimum holding time one?',
        'Does a first case of gambling-style trading count as a soft breach, and does an IP flag with an honest explanation?',
      ],
      ur: [
        'نرم خلاف ورزی کیا ہے؟ کیا کم از کم ہولڈنگ وقت سے کم الگ ٹریڈ اس میں آتی ہے؟',
        'کیا جوئے والی ٹریڈنگ کا پہلا کیس نرم خلاف ورزی ہے؟',
      ],
      roman: [
        'Soft breach kya hai? Kya minimum holding time se kam alag trade is mein aati hai?',
        'Kya gambling style trading ka pehla case soft breach hai?',
      ],
      hi: [
        'सॉफ्ट ब्रीच क्या है? क्या न्यूनतम होल्डिंग समय से कम अलग ट्रेड इसमें आती है?',
        'क्या जुए जैसी ट्रेडिंग का पहला मामला सॉफ्ट ब्रीच है?',
      ],
      ar: [
        'ما هو الخرق البسيط؟ هل الصفقة المنفردة تحت الحد الأدنى لوقت الاحتفاظ منه؟',
        'هل أول حالة تداول بأسلوب المقامرة خرق بسيط؟',
      ],
      hinglish: [
        'Bhai yaar soft breach kya hoti hai? Minimum holding time se kam isolated trade soft breach hai kya?',
        'Yaar gambling-style trading ka pehla case soft breach hai?',
      ],
    },
  },
  instrument_cap: {
    ids: ['instrument_cap'],
    q: {
      en: [
        'How much can I risk on one instrument on a funded account?',
        'A three percent daily loss limit means how much on the same instrument, and what about five percent?',
      ],
      ur: [
        'فنڈڈ اکاؤنٹ پر ایک ہی انسٹرومنٹ پر میں کتنا رسک لے سکتا ہوں؟',
        '3 فیصد ڈیلی لاس حد کا مطلب ایک ہی انسٹرومنٹ پر کتنا ہے؟',
      ],
      roman: [
        'Funded account par ek hi instrument par main kitna risk le sakta hoon?',
        'Teen percent daily loss had ka matlab ek hi instrument par kitna hai?',
      ],
      hi: [
        'फंडेड अकाउंट पर एक ही इंस्ट्रूमेंट पर मैं कितना जोखिम ले सकता हूँ?',
        'तीन प्रतिशत डेली लॉस सीमा का अर्थ एक ही इंस्ट्रूमेंट पर कितना है?',
      ],
      ar: [
        'كم يمكنني المخاطرة على الأداة نفسها في الحساب الممول؟',
        'حد خسارة يومية 3% يعني كم على الأداة نفسها؟',
      ],
      hinglish: [
        'Bhai yaar funded account par same instrument par kitna risk le sakta hoon?',
        'Yaar three percent daily loss ka matlab one instrument par kitna hai?',
      ],
    },
  },
  soft_breach_payout: {
    ids: ['soft_breach_payout'],
    q: {
      en: [
        'What happens to my payout after a soft breach on a funded account?',
        'After a soft breach, is the current payout still processed, and at what reward share?',
      ],
      ur: [
        'فنڈڈ اکاؤنٹ پر نرم خلاف ورزی کے بعد پے آؤٹ کا کیا ہوتا ہے؟',
        'نرم خلاف ورزی کے بعد موجودہ پے آؤٹ کس ریوارڈ شیئر پر پراسیس ہوتا ہے؟',
      ],
      roman: [
        'Funded account par soft breach ke baad payout ka kya hota hai?',
        'Soft breach ke baad mojooda payout kis reward share par process hota hai?',
      ],
      hi: [
        'फंडेड अकाउंट पर सॉफ्ट ब्रीच के बाद पेआउट का क्या होता है?',
        'सॉफ्ट ब्रीच के बाद मौजूदा पेआउट किस रिवॉर्ड शेयर पर प्रोसेस होता है?',
      ],
      ar: [
        'ماذا يحدث للسحب بعد الخرق البسيط في الحساب الممول؟',
        'بعد الخرق البسيط، هل يُعالج السحب الحالي وبأي حصة مكافأة؟',
      ],
      hinglish: [
        'Bhai yaar funded account par soft breach ke baad payout ka kya hota hai?',
        'Yaar soft breach ke baad current payout kitne reward share par process hota hai?',
      ],
    },
  },
  weekend_hold: {
    ids: ['weekend_hold'],
    q: {
      en: [
        'Can I hold an open position from Friday to Monday, and can I move my stop loss over the weekend?',
        'Is holding allowed without the Weekend Trading add-on, and is closing over the weekend a violation without it?',
      ],
      ur: [
        'کیا میں ویک اینڈ پر کھلی پوزیشن ہولڈ کر سکتا ہوں اور سٹاپ لاس ہلا سکتا ہوں؟',
        'کیا جمعہ سے پیر تک پوزیشن رکھنا ویک اینڈ ایڈ آن کے بغیر جائز ہے؟',
      ],
      roman: [
        'Kya main weekend par khuli position hold kar sakta hoon aur stop loss hila sakta hoon?',
        'Kya Jumma se Peer tak position rakhna weekend add-on ke baghair allowed hai?',
      ],
      hi: [
        'क्या मैं वीकएंड पर खुली पोजीशन होल्ड कर सकता हूँ और स्टॉप लॉस हिला सकता हूँ?',
        'क्या शुक्रवार से सोमवार तक पोजीशन रखना वीकएंड ऐड-ऑन के बिना अनुमत है?',
      ],
      ar: [
        'هل يمكنني إبقاء صفقة مفتوحة خلال نهاية الأسبوع وتحريك وقف الخسارة؟',
        'هل إبقاء الصفقة من الجمعة إلى الاثنين مسموح دون إضافة تداول نهاية الأسبوع؟',
      ],
      hinglish: [
        'Bhai yaar weekend par open position hold kar sakta hoon aur stop loss move kar sakta hoon?',
        'Yaar Friday se Monday position rakhna add-on ke bina allowed hai kya?',
      ],
    },
  },
  weekend_trade: {
    ids: ['weekend_trade'],
    q: {
      en: [
        'Can I open a new position on Saturday without the Weekend Trading add-on?',
        'Does a fill on Sunday count as weekend trading, and is trading on Saturday allowed only with the add-on?',
      ],
      ur: [
        'کیا میں ہفتہ کو ایڈ آن کے بغیر نئی پوزیشن کھول سکتا ہوں؟',
        'کیا اتوار کو فل ہونا ویک اینڈ ٹریڈنگ شمار ہوتا ہے؟',
      ],
      roman: [
        'Kya main hafta ko add-on ke baghair nayi position khol sakta hoon?',
        'Kya Itwar ko fill hona weekend trading shumar hota hai?',
      ],
      hi: [
        'क्या मैं शनिवार को ऐड-ऑन के बिना नई पोजीशन खोल सकता हूँ?',
        'क्या रविवार को फिल होना वीकएंड ट्रेडिंग गिना जाता है?',
      ],
      ar: [
        'هل يمكنني فتح صفقة جديدة يوم السبت دون إضافة تداول نهاية الأسبوع؟',
        'هل التنفيذ يوم الأحد يُحسب تداول نهاية الأسبوع؟',
      ],
      hinglish: [
        'Bhai yaar Saturday ko add-on ke bina nayi position khol sakta hoon kya?',
        'Yaar Sunday ko fill hona weekend trading count hota hai?',
      ],
    },
  },
  rise_fee: {
    ids: ['rise_fee'],
    q: {
      en: [
        'What is the Rise withdrawal fee?',
        'Is Rise available from five hundred dollars, and is the fee forty dollars?',
      ],
      ur: [
        'Rise ودڈرال کی فیس کتنی ہے؟',
        'کیا Rise پانچ سو ڈالر سے دستیاب ہے اور فیس چالیس ڈالر ہے؟',
      ],
      roman: [
        'Rise withdrawal ki fee kitni hai?',
        'Kya Rise panch sau dollar se available hai aur fee chaalis dollar hai?',
      ],
      hi: [
        'Rise निकासी की फीस कितनी है?',
        'क्या Rise पांच सौ डॉलर से उपलब्ध है और शुल्क चालीस डॉलर है?',
      ],
      ar: [
        'ما رسم سحب Rise؟',
        'هل Rise متاح من خمسمائة دولار والرسم أربعون دولارا؟',
      ],
      hinglish: [
        'Bhai yaar Rise withdrawal ki fee kitni hai?',
        'Yaar Rise five hundred se available hai aur fee forty dollar hai kya?',
      ],
    },
  },
  crypto_fee: {
    ids: ['crypto_fee'],
    q: {
      en: [
        'What is the crypto USDC withdrawal fee?',
        'Is the crypto fee three percent, and is it the only method below five hundred dollars?',
      ],
      ur: [
        'کرپٹو USDC ودڈرال کی فیس کتنی ہے؟',
        'کیا کرپٹو فیس تین فیصد ہے اور پانچ سو سے کم کی واحد صورت ہے؟',
      ],
      roman: [
        'Crypto USDC withdrawal ki fee kitni hai?',
        'Kya crypto fee teen percent hai aur panch sau se kam ki wahid surat hai?',
      ],
      hi: [
        'क्रिप्टो USDC निकासी का शुल्क कितना है?',
        'क्या क्रिप्टो शुल्क तीन प्रतिशत है और पांच सौ से कम की एकमात्र विधि है?',
      ],
      ar: [
        'ما رسم سحب العملات المشفرة USDC؟',
        'هل رسم الكريبتو ثلاثة بالمئة وهو الطريقة الوحيدة تحت خمسمائة دولار؟',
      ],
      hinglish: [
        'Bhai yaar crypto USDC withdrawal ki fee kitni hai?',
        'Yaar crypto fee three percent hai aur five hundred se neeche ka only method hai kya?',
      ],
    },
  },
  payout_timing: {
    ids: ['payout_timing'],
    q: {
      en: [
        'How long do approved rewards take to be paid, and how long do bank transfers take?',
        'When will my payout arrive after approval, and what if a review is needed first?',
      ],
      ur: [
        'منظور شدہ ریوارڈ کتنے کاروباری دن میں ادا ہوتا ہے، اور بینک ٹرانسفر کتنے دن لیتی ہے؟',
        'منظوری کے بعد پے آؤٹ کب پہنچے گا، اور اگر پہلے جائزہ چاہیے تو کیا ہوگا؟',
      ],
      roman: [
        'Manzoor reward kitne business days mein ada hota hai, aur bank transfer kitne din leti hai?',
        'Approval ke baad payout kab pohanchega, aur agar pehle review chahiye to kya hoga?',
      ],
      hi: [
        'स्वीकृत रिवॉर्ड कितने कार्यदिवस में दिया जाता है, और बैंक ट्रांसफर कितने दिन लेता है?',
        'स्वीकृति के बाद पेआउट कब पहुँचेगा, और यदि पहले समीक्षा चाहिए तो क्या होगा?',
      ],
      ar: [
        'خلال كم يوم عمل تُدفع المكافآت المعتمدة، وكم يستغرق التحويل البنكي؟',
        'متى يصل السحب بعد الاعتماد، وماذا إذا لزم مراجعة أولا؟',
      ],
      hinglish: [
        'Bhai yaar approved reward kitne business days mein pay hota hai, aur bank transfer kitne days leti hai?',
        'Yaar approval ke baad payout kab aayega, aur agar pehle review chahiye to kya hoga?',
      ],
    },
  },
  catalyst_rules: {
    ids: ['catalyst_rules'],
    q: {
      en: [
        'What are the Catalyst profit target, daily loss, and consistency rules?',
        'On Catalyst, is the profit target eight percent with five and ten percent options, and is weekend trading allowed?',
      ],
      ur: [
        'Catalyst کا منافع ہدف، ڈیلی لاس اور مستقل مزاجی کا قاعدہ کیا ہے؟',
        'کیا Catalyst پر ویک اینڈ ٹریڈنگ جائز ہے؟',
      ],
      roman: [
        'Catalyst ka profit target, daily loss aur consistency rule kya hai?',
        'Kya Catalyst par weekend trading allowed hai?',
      ],
      hi: [
        'Catalyst का लाभ लक्ष्य, डेली लॉस और कंसिस्टेंसी नियम क्या है?',
        'क्या Catalyst पर वीकएंड ट्रेडिंग अनुमत है?',
      ],
      ar: [
        'ما هدف الربح وحد الخسارة اليومية وقاعدة الاتساق في Catalyst؟',
        'هل تداول نهاية الأسبوع مسموح في Catalyst؟',
      ],
      hinglish: [
        'Bhai yaar Catalyst ka profit target, daily loss aur consistency rule kya hai?',
        'Yaar Catalyst par weekend trading allowed hai kya?',
      ],
    },
  },
  catalyst_ladder: {
    ids: ['catalyst_ladder'],
    q: {
      en: [
        'What are the Catalyst ladder stages and reset prices?',
        'What is stage one of Catalyst, and what share do I start with from fifty thousand?',
      ],
      ur: [
        'Catalyst کے مراحل اور ری سیٹ قیمتیں کیا ہیں؟',
        'Catalyst کا پہلا مرحلہ کتنا ہے؟',
      ],
      roman: [
        'Catalyst ke stages aur reset prices kya hain?',
        'Catalyst ka pehla stage kitna hai?',
      ],
      hi: [
        'Catalyst के चरण और रीसेट कीमतें क्या हैं?',
        'Catalyst का पहला चरण कितना है?',
      ],
      ar: [
        'ما مراحل سلم Catalyst وأسعار إعادة التعيين؟',
        'كم حجم المرحلة الأولى في Catalyst؟',
      ],
      hinglish: [
        'Bhai yaar Catalyst ke stages aur reset prices kya hain?',
        'Yaar Catalyst ka pehla stage kitna hai?',
      ],
    },
  },
  catalyst_reopen: {
    ids: ['catalyst_reopen'],
    q: {
      en: [
        'What happens to my Catalyst account after an approved payout? Does it open a fresh one at double the size?',
        'Is the Catalyst reopen automatic, or done by the team within 24 hours?',
      ],
      ur: [
        'منظور شدہ Catalyst پے آؤٹ کے بعد اکاؤنٹ کا کیا ہوتا ہے؟ کیا دگنے سائز کا نیا اکاؤنٹ کھلتا ہے؟',
        'کیا Catalyst کا نیا اکاؤنٹ 24 گھنٹوں میں کھلتا ہے؟',
      ],
      roman: [
        'Manzoor Catalyst payout ke baad account ka kya hota hai? Kya dugne size ka naya account khulta hai?',
        'Kya Catalyst ka naya account 24 ghanton mein khulta hai?',
      ],
      hi: [
        'स्वीकृत Catalyst पेआउट के बाद अकाउंट का क्या होता है? क्या दोगुने आकार का नया अकाउंट खुलता है?',
        'क्या Catalyst का नया अकाउंट 24 घंटों में खुलता है?',
      ],
      ar: [
        'ماذا يحدث لحساب Catalyst بعد السحب المعتمد؟ هل يفتح حسابا جديدا بضعف الحجم؟',
        'هل فتح حساب Catalyst الجديد يتم خلال 24 ساعة؟',
      ],
      hinglish: [
        'Bhai yaar approved Catalyst payout ke baad account ka kya hota hai? Double size ka naya account khulta hai kya?',
        'Yaar Catalyst ka naya account 24 hours mein khulta hai?',
      ],
    },
  },
  catalyst_stage_reset: {
    ids: ['catalyst_stage_reset'],
    q: {
      en: [
        'If I breach after my first Catalyst stage, can I buy one reset at that stage?',
        'Does the first Catalyst stage I bought have no reset?',
      ],
      ur: [
        'اگر میں پہلے Catalyst مرحلے کے بعد خلاف ورزی کروں تو کیا اسی مرحلے پر ایک ری سیٹ خرید سکتا ہوں؟',
        'کیا پہلے Catalyst مرحلے پر ری سیٹ نہیں ہوتا؟',
      ],
      roman: [
        'Agar main pehle Catalyst stage ke baad breach karun to kya usi stage par ek reset khareed sakta hoon?',
        'Kya pehle Catalyst stage par reset nahi hota?',
      ],
      hi: [
        'यदि मैं पहले Catalyst चरण के बाद ब्रीच करूँ तो क्या उसी चरण पर एक रीसेट खरीद सकता हूँ?',
        'क्या पहले Catalyst चरण पर रीसेट नहीं होता?',
      ],
      ar: [
        'إذا خرقت بعد أول مرحلة في Catalyst فهل يمكنني شراء إعادة تعيين واحدة في تلك المرحلة؟',
        'هل المرحلة الأولى في Catalyst بلا إعادة تعيين؟',
      ],
      hinglish: [
        'Bhai yaar pehle Catalyst stage ke baad breach ho to usi stage par ek reset khareed sakta hoon kya?',
        'Yaar pehle Catalyst stage par reset nahi hota?',
      ],
    },
  },
  reset_eligibility: {
    ids: ['reset_eligibility'],
    q: {
      en: [
        'Can I reset a funded account while it is in a loss or in drawdown?',
        'Is a funded reset allowed only at breakeven or in profit?',
      ],
      ur: [
        'کیا میں فنڈڈ اکاؤنٹ کو نقصان یا ڈرا ڈاؤن میں ری سیٹ کر سکتا ہوں؟',
        'کیا فنڈڈ ری سیٹ صرف بریک ایون یا منافع میں جائز ہے؟',
      ],
      roman: [
        'Kya main funded account ko nuqsan ya drawdown mein reset kar sakta hoon?',
        'Kya funded reset sirf breakeven ya profit mein allowed hai?',
      ],
      hi: [
        'क्या मैं फंडेड अकाउंट को हानि या ड्रॉडाउन में रीसेट कर सकता हूँ?',
        'क्या फंडेड रीसेट केवल ब्रेकईवन या लाभ में अनुमत है?',
      ],
      ar: [
        'هل يمكنني إعادة تعيين الحساب الممول أثناء الخسارة أو التراجع؟',
        'هل إعادة التعيين الممولة مسموحة فقط عند التعادل أو في الربح؟',
      ],
      hinglish: [
        'Bhai yaar funded account ko loss ya drawdown mein reset kar sakta hoon kya?',
        'Yaar funded reset sirf breakeven ya profit mein allowed hai?',
      ],
    },
  },
  reset_count: {
    ids: ['reset_count'],
    q: {
      en: [
        'How many times can I reset a funded account?',
        'Can a funded account be reset up to three times?',
      ],
      ur: [
        'فنڈڈ اکاؤنٹ کتنی بار ری سیٹ ہو سکتا ہے؟',
        'کیا فنڈڈ اکاؤنٹ تین بار تک ری سیٹ ہو سکتا ہے؟',
      ],
      roman: [
        'Funded account kitne dafa reset ho sakta hai?',
        'Kya funded account teen bar tak reset ho sakta hai?',
      ],
      hi: [
        'फंडेड अकाउंट कितनी बार रीसेट हो सकता है?',
        'क्या फंडेड अकाउंट तीन बार तक रीसेट हो सकता है?',
      ],
      ar: [
        'كم مرة يمكن إعادة تعيين الحساب الممول؟',
        'هل يمكن إعادة تعيين الحساب الممول حتى ثلاث مرات؟',
      ],
      hinglish: [
        'Bhai yaar funded account kitne times reset ho sakta hai?',
        'Yaar funded account three times tak reset ho sakta hai kya?',
      ],
    },
  },
  reset_price: {
    ids: ['reset_price'],
    q: {
      en: [
        'How much does a funded reset cost?',
        'Is the first funded reset forty percent of the original price, with a ten dollar minimum?',
      ],
      ur: [
        'فنڈڈ ری سیٹ کی قیمت کتنی ہے؟',
        'کیا پہلا فنڈڈ ری سیٹ اصل قیمت کا چالیس فیصد ہے؟',
      ],
      roman: [
        'Funded reset ki price kitni hai?',
        'Kya pehla funded reset asal price ka chaalis percent hai?',
      ],
      hi: [
        'फंडेड रीसेट की कीमत कितनी है?',
        'क्या पहला फंडेड रीसेट मूल कीमत का चालीस प्रतिशत है?',
      ],
      ar: [
        'كم تبلغ تكلفة إعادة التعيين الممولة؟',
        'هل أول إعادة تعيين ممولة أربعون بالمئة من السعر الأصلي؟',
      ],
      hinglish: [
        'Bhai yaar funded reset ki price kitni hai?',
        'Yaar pehla funded reset original price ka forty percent hai kya?',
      ],
    },
  },
  reset_where: {
    ids: ['reset_where'],
    q: {
      en: [
        'Where do I reset a funded account on the dashboard?',
        'Is the Reset options button next to Credentials?',
      ],
      ur: [
        'ڈیش بورڈ پر فنڈڈ اکاؤنٹ کہاں سے ری سیٹ ہوتا ہے؟',
        'کیا ری سیٹ آپشنز کا بٹن کریڈینشلز کے پاس ہے؟',
      ],
      roman: [
        'Dashboard par funded account kahan se reset hota hai?',
        'Kya Reset options ka button Credentials ke paas hai?',
      ],
      hi: [
        'डैशबोर्ड पर फंडेड अकाउंट कहाँ से रीसेट होता है?',
        'क्या रीसेट ऑप्शन बटन क्रेडेंशियल्स के पास है?',
      ],
      ar: [
        'من أين أعيد تعيين الحساب الممول في لوحة التحكم؟',
        'هل زر خيارات إعادة التعيين بجانب بيانات الدخول؟',
      ],
      hinglish: [
        'Bhai yaar dashboard par funded account kahan se reset hota hai?',
        'Yaar Reset options ka button Credentials ke paas hai kya?',
      ],
    },
  },
  reset_previous: {
    ids: ['reset_previous'],
    q: {
      en: [
        'After a funded reset, is profit from the previous cycle paid?',
        'Does a reset give a fresh funded account, and is the previous cycle profit payable?',
      ],
      ur: [
        'فنڈڈ ری سیٹ کے بعد پچھلے سائیکل کا منافع ادا ہوتا ہے؟',
        'کیا ری سیٹ نیا فنڈڈ اکاؤنٹ دیتا ہے اور پچھلا منافع نہیں ملتا؟',
      ],
      roman: [
        'Funded reset ke baad pichle cycle ka profit ada hota hai?',
        'Kya reset naya funded account deta hai aur pichla profit nahi milta?',
      ],
      hi: [
        'फंडेड रीसेट के बाद पिछले चक्र का लाभ दिया जाता है?',
        'क्या रीसेट नया फंडेड अकाउंट देता है और पिछला लाभ नहीं मिलता?',
      ],
      ar: [
        'بعد إعادة التعيين الممولة، هل يُدفع ربح الدورة السابقة؟',
        'هل إعادة التعيين تمنح حسابا ممولا جديدا وربح الدورة السابقة لا يُدفع؟',
      ],
      hinglish: [
        'Bhai yaar funded reset ke baad previous cycle ka profit pay hota hai kya?',
        'Yaar reset naya funded account deta hai aur pichla profit nahi milta?',
      ],
    },
  },
  fee_refund: {
    ids: ['fee_refund'],
    q: {
      en: [
        'When is the challenge fee refunded?',
        'Does Catalyst have a fee refund, and does a soft breach restart the count?',
      ],
      ur: [
        'چیلنج فیس کب واپس ہوتی ہے؟',
        'کیا Catalyst پر فیس ریفنڈ ہے، اور نرم خلاف ورزی گنتی دوبارہ شروع کرتی ہے؟',
      ],
      roman: [
        'Challenge fee kab wapas hoti hai?',
        'Kya Catalyst par fee refund hai, aur soft breach ginti dobara shuru karti hai?',
      ],
      hi: [
        'चैलेंज फीस कब वापस होती है?',
        'क्या Catalyst पर फीस रिफंड है, और सॉफ्ट ब्रीच गिनती फिर शुरू करती है?',
      ],
      ar: [
        'متى تُرد رسوم التحدي؟',
        'هل يوجد استرداد رسوم في Catalyst، وهل الخرق البسيط يعيد العد؟',
      ],
      hinglish: [
        'Bhai yaar challenge fee kab refund hoti hai?',
        'Yaar Catalyst par fee refund hai kya, aur soft breach count restart karti hai?',
      ],
    },
  },
  payout_not_reversed: {
    ids: ['payout_not_reversed'],
    q: {
      en: [
        'Can a completed payout be reversed?',
        'Do you take back a completed payout, or is a completed payout not reversed?',
      ],
      ur: [
        'کیا مکمل شدہ پے آؤٹ واپس لیا جاتا ہے؟',
        'کیا مکمل پے آؤٹ ریورس ہو سکتا ہے؟',
      ],
      roman: [
        'Kya mukammal payout wapas liya jata hai?',
        'Kya completed payout reverse ho sakta hai?',
      ],
      hi: [
        'क्या पूरा किया गया पेआउट वापस लिया जाता है?',
        'क्या पूरा पेआउट रिवर्स हो सकता है?',
      ],
      ar: [
        'هل يُعكس السحب المكتمل؟',
        'هل يمكن استرجاع سحب مكتمل؟',
      ],
      hinglish: [
        'Bhai yaar completed payout reverse ho sakta hai kya?',
        'Yaar kya completed payout wapas le lete ho?',
      ],
    },
  },
  source_primary: {
    ids: ['source_primary'],
    q: {
      en: [
        'The Help Centre is the primary reference and the repo FAQ does not override it, correct?',
        'Does the FAQ override the Help Centre, or is the Help Centre primary?',
      ],
      ur: [
        'کیا ہیلپ سینٹر بنیادی حوالہ ہے اور ریپو کا سوال جواب اس پر غالب نہیں؟',
        'کیا FAQ ہیلپ سینٹر کو اوور رائیڈ کرتا ہے؟',
      ],
      roman: [
        'Kya Help Centre bunyadi hawala hai aur repo FAQ is par ghalib nahi?',
        'Kya FAQ Help Centre ko override karta hai?',
      ],
      hi: [
        'क्या हेल्प सेंटर प्राथमिक संदर्भ है और रिपो का प्रश्नोत्तर उस पर भारी नहीं पड़ता?',
        'क्या FAQ हेल्प सेंटर को ओवरराइड करता है?',
      ],
      ar: [
        'هل مركز المساعدة هو المرجع الأساسي وأسئلة المستودع لا تلغيه؟',
        'هل الأسئلة الشائعة تلغي مركز المساعدة؟',
      ],
      hinglish: [
        'Bhai yaar Help Centre primary reference hai aur repo FAQ override nahi karta, sahi hai?',
        'Yaar FAQ Help Centre ko override karta hai kya?',
      ],
    },
  },
};

const LANGS = ['en', 'ur', 'roman', 'hi', 'ar', 'hinglish'];

function caseId(parts) {
  return parts.join('-').replace(/[^a-z0-9_-]+/gi, '').slice(0, 80);
}

function matrix() {
  const out = [];
  for (const [intent, spec] of Object.entries(BANK)) {
    for (const lang of LANGS) {
      spec.q[lang].forEach((client, i) => {
        out.push({
          id: caseId(['m', intent, lang, i]),
          group: 'matrix',
          lang,
          intent,
          client,
          draft: LIE,
          expect: 'approved',
          ids: spec.ids.slice(),
          topic: 'conversation.user.replied',
        });
      });
    }
  }
  return out;
}

const ARSAL = '10118526';

function specials() {
  const S = [];
  const add = (row) => S.push(Object.assign({ topic: 'conversation.user.replied', draft: LIE }, row));

  const erase = {
    en: [
      'If I buy a Catalyst stage reset, is the profit erased or kept?',
      'After a Catalyst stage reset, is it a clean slate or is the profit preserved?',
      'Does a Catalyst reset wipe the profit or does the profit stay?',
    ],
    ur: [
      'اگر میں Catalyst مرحلے کا ری سیٹ خریدوں تو منافع مٹ جاتا ہے یا محفوظ رہتا ہے؟',
      'Catalyst ری سیٹ کے بعد منافع رہ جاتا ہے یا صاف ہو جاتا ہے؟',
    ],
    roman: [
      'Agar main Catalyst stage reset kharidun to profit mita diya jata hai ya mehfooz rehta hai?',
      'Catalyst reset ke baad profit reh jata hai ya saaf ho jata hai?',
    ],
    hi: [
      'यदि मैं Catalyst चरण का रीसेट खरीदूँ तो लाभ मिट जाता है या बचा रहता है?',
      'Catalyst रीसेट के बाद लाभ रहेगा या मिटा दिया जाएगा?',
    ],
    ar: [
      'إذا اشتريت إعادة تعيين مرحلة Catalyst فهل يُمسح الربح أم يُحفظ؟',
      'بعد إعادة تعيين Catalyst هل يبقى الربح أم يُمحى؟',
    ],
    hinglish: [
      'Bhai yaar Catalyst stage reset kharidun to profit erase ho jata hai ya kept rehta hai?',
      'Yaar Catalyst reset ke baad profit wipe ho jata hai ya preserve rehta hai?',
    ],
  };
  for (const [lang, list] of Object.entries(erase)) {
    list.forEach((client, i) => add({
      id: caseId(['erase', lang, i]),
      group: 'catalyst-erase',
      lang,
      client,
      expect: 'hedge',
      ids: [],
    }));
  }

  add({
    id: 'confuse-password',
    group: 'intent',
    lang: 'en',
    client: 'How do I reset my password?',
    draft: 'Use the password reset link on the login page. That resets the password only. It does not reset a funded trading account.',
    expect: 'pass',
    passText: 'Use the password reset link',
  });
  add({
    id: 'confuse-password-ur',
    group: 'intent',
    lang: 'ur',
    client: 'میں پاس ورڈ کیسے ری سیٹ کروں؟',
    draft: 'Use the password reset link on the login page. That resets the password only. It does not reset a funded trading account.',
    expect: 'pass',
    passText: 'password reset link',
  });
  add({
    id: 'confuse-password-roman',
    group: 'intent',
    lang: 'roman',
    client: 'Mujhe batao password kaise reset karun?',
    draft: 'Use the password reset link on the login page. That resets the password only. It does not reset a funded trading account.',
    expect: 'pass',
    passText: 'password reset link',
  });
  add({
    id: 'confuse-password-hi',
    group: 'intent',
    lang: 'hi',
    client: 'मैं पासवर्ड कैसे रीसेट करूँ?',
    draft: 'Use the password reset link on the login page. That resets the password only. It does not reset a funded trading account.',
    expect: 'pass',
    passText: 'password reset link',
  });
  add({
    id: 'confuse-password-ar',
    group: 'intent',
    lang: 'ar',
    client: 'كيف أعيد تعيين كلمة المرور؟',
    draft: 'Use the password reset link on the login page. That resets the password only. It does not reset a funded trading account.',
    expect: 'pass',
    passText: 'password reset link',
  });
  add({
    id: 'confuse-password-hinglish',
    group: 'intent',
    lang: 'hinglish',
    client: 'Bhai yaar password kaise reset karun, account band ho gaya nahi bas login?',
    draft: 'Use the password reset link on the login page. That resets the password only. It does not reset a funded trading account.',
    expect: 'pass',
    passText: 'password reset link',
  });
  add({
    id: 'confuse-password-funded-word',
    group: 'intent',
    lang: 'en',
    client: 'How do I reset the password on my funded account login?',
    draft: 'Use the password reset link on the login page. That resets the password only. It does not reset a funded trading account.',
    expect: 'pass',
    passText: 'password reset link',
  });

  add({
    id: 'confuse-crypto-buy',
    group: 'intent',
    lang: 'en',
    client: 'Can I purchase the challenge with crypto at checkout?',
    draft: 'You can pay for a new challenge at checkout. Crypto purchase of a challenge is separate from a payout withdrawal.',
    expect: 'pass',
    passText: 'Crypto purchase of a challenge',
  });
  add({
    id: 'confuse-crypto-buy-ur',
    group: 'intent',
    lang: 'ur',
    client: 'کیا میں چیلنج کرپٹو سے خرید سکتا ہوں؟',
    draft: 'You can pay for a new challenge at checkout. Crypto purchase of a challenge is separate from a payout withdrawal.',
    expect: 'pass',
    passText: 'Crypto purchase of a challenge',
  });
  add({
    id: 'confuse-crypto-buy-ar',
    group: 'intent',
    lang: 'ar',
    client: 'هل يمكنني شراء التحدي بالعملات المشفرة؟',
    draft: 'You can pay for a new challenge at checkout. Crypto purchase of a challenge is separate from a payout withdrawal.',
    expect: 'pass',
    passText: 'Crypto purchase of a challenge',
  });
  add({
    id: 'confuse-crypto-buy-hi',
    group: 'intent',
    lang: 'hi',
    client: 'क्या मैं चैलेंज क्रिप्टो से खरीद सकता हूँ?',
    draft: 'You can pay for a new challenge at checkout. Crypto purchase of a challenge is separate from a payout withdrawal.',
    expect: 'pass',
    passText: 'Crypto purchase of a challenge',
  });
  add({
    id: 'confuse-crypto-buy-hinglish',
    group: 'intent',
    lang: 'hinglish',
    client: 'Bhai yaar challenge crypto se purchase kar sakta hoon kya, withdrawal nahi?',
    draft: 'You can pay for a new challenge at checkout. Crypto purchase of a challenge is separate from a payout withdrawal.',
    expect: 'pass',
    passText: 'Crypto purchase of a challenge',
  });

  add({
    id: 'confuse-mt5',
    group: 'intent',
    lang: 'en',
    client: 'How do I install MT5?',
    draft: 'You can install MT5 from the client area, then log in with the server and login shown on your dashboard.',
    expect: 'pass',
    passText: 'install MT5',
  });
  add({
    id: 'confuse-mt5-reset',
    group: 'intent',
    lang: 'en',
    client: 'How do I reset MT5?',
    draft: 'You can install MT5 from the client area, then log in with the server and login shown on your dashboard.',
    expect: 'pass',
    passText: 'install MT5',
    captureIsWrong: true,
  });
  add({
    id: 'confuse-mt5-ur',
    group: 'intent',
    lang: 'ur',
    client: 'MT5 کیسے انسٹال کروں؟',
    draft: 'You can install MT5 from the client area, then log in with the server and login shown on your dashboard.',
    expect: 'pass',
    passText: 'install MT5',
  });
  add({
    id: 'confuse-spread',
    group: 'overcapture',
    lang: 'en',
    client: 'What is the spread on XAUUSD?',
    draft: 'Typical gold spreads on the platform vary with the symbol and the session. I do not have a fixed spread number to quote here.',
    expect: 'pass',
    passText: 'Typical gold spreads',
  });
  add({
    id: 'confuse-leverage',
    group: 'overcapture',
    lang: 'en',
    client: 'What leverage do I get on the standard challenge?',
    draft: 'Leverage depends on the challenge you bought and is shown on the dashboard. This note is not a payout rule.',
    expect: 'pass',
    passText: 'Leverage depends',
  });
  add({
    id: 'confuse-news',
    group: 'overcapture',
    lang: 'en',
    client: 'Can I trade the news?',
    draft: 'News trading rules depend on the challenge you bought. I can point you to the news-trading article if you tell me the program.',
    expect: 'pass',
    passText: 'News trading rules',
  });
  add({
    id: 'confuse-holdtime',
    group: 'overcapture',
    lang: 'en',
    client: 'What is the minimum holding time?',
    draft: 'The minimum holding time is a platform rule shown on your dashboard. This answer is not a payout, reset, or breach decision.',
    expect: 'pass',
    passText: 'minimum holding time is a platform rule',
  });
  add({
    id: 'confuse-hello',
    group: 'overcapture',
    lang: 'en',
    client: 'Hello',
    draft: 'Hello, how can I help?',
    expect: 'pass',
    passText: 'how can I help',
  });
  add({
    id: 'confuse-kyc',
    group: 'overcapture',
    lang: 'en',
    client: 'How do I complete KYC verification?',
    draft: 'Complete KYC from the verification page in your dashboard. This is not a payout timing rule.',
    expect: 'pass',
    passText: 'Complete KYC',
  });
  add({
    id: 'confuse-country',
    group: 'overcapture',
    lang: 'en',
    client: 'Can I open an account if I live in Canada?',
    draft: 'Country eligibility is listed in the restricted-countries article. I am not quoting a payout rule.',
    expect: 'pass',
    passText: 'Country eligibility',
  });

  const timing = {
    en: 'Will my payout arrive within one hour?',
    ur: 'کیا میرا پے آؤٹ ایک گھنٹے میں پہنچ جائے گا؟',
    roman: 'Kya mera payout ek ghante mein pohanch jayega?',
    hi: 'क्या मेरा पेआउट एक घंटे में पहुँच जाएगा?',
    ar: 'هل يصل سحبي خلال ساعة واحدة؟',
    hinglish: 'Bhai yaar payout ek ghante mein aa jayega kya?',
  };
  for (const [lang, client] of Object.entries(timing)) {
    add({ id: caseId(['timing-lie', lang]), group: 'timing-lie', lang, client, expect: 'hedge_or_timing', ids: [] });
  }
  const feeLie = {
    en: 'The Rise fee is five dollars, right?',
    ur: 'Rise کی فیس پانچ ڈالر ہے، ہے نا؟',
    roman: 'Rise ki fee paanch dollar hai, hai na?',
    hi: 'Rise की फीस पांच डॉलर है, है ना?',
    ar: 'رسم Rise خمسة دولارات، صحيح؟',
    hinglish: 'Bhai yaar Rise fee five dollar hai, hai na?',
  };
  for (const [lang, client] of Object.entries(feeLie)) {
    add({
      id: caseId(['fee-lie', lang]),
      group: 'fee-lie',
      lang,
      client,
      expect: 'approved',
      ids: ['rise_fee'],
    });
  }

  add({
    id: 'mixed-rise-draft',
    group: 'mixed-draft',
    lang: 'en',
    client: 'What is the Rise withdrawal fee?',
    draft: 'Rise is available from $500 and the fee is $40. It also arrives within one hour and you can reset in drawdown. A completed payout is reversed.',
    expect: 'approved',
    ids: ['rise_fee'],
  });
  add({
    id: 'mixed-urdu-returned',
    group: 'mixed-draft',
    lang: 'ur',
    client: 'میرا مکمل شدہ پے آؤٹ واپس کر دیا گیا۔',
    draft: LIE,
    expect: 'hedge',
  });
  add({
    id: 'mixed-ar-hour',
    group: 'mixed-draft',
    lang: 'ar',
    client: 'سحبي يصل خلال ساعة واحدة.',
    draft: LIE,
    expect: 'hedge',
  });
  add({
    id: 'mixed-true-false-reset',
    group: 'mixed-draft',
    lang: 'en',
    client: 'Can I reset a funded account while it is in a loss, and how many times, and is the first price forty percent?',
    draft: LIE,
    expect: 'approved',
    ids: ['reset_eligibility', 'reset_count', 'reset_price'],
  });
  add({
    id: 'bare-reset',
    group: 'mixed-draft',
    lang: 'en',
    client: 'Can I reset?',
    draft: LIE,
    expect: 'hedge',
  });
  add({
    id: 'how-do-i-reset',
    group: 'matrix-extra',
    lang: 'en',
    client: 'How do I reset a funded account?',
    draft: LIE,
    expect: 'approved',
    ids: ['reset_eligibility', 'reset_count', 'reset_price', 'reset_where', 'reset_previous'],
  });
  add({
    id: 'catalyst-weekend-not-addon',
    group: 'intent',
    lang: 'en',
    client: 'Is weekend trading allowed on Catalyst, and can I use the Weekend Trading add-on to open a new position on Saturday?',
    draft: LIE,
    expect: 'approved',
    ids: ['catalyst_rules'],
  });
  add({
    id: 'catalyst-weekend-ur',
    group: 'intent',
    lang: 'ur',
    client: 'کیا Catalyst پر ویک اینڈ ٹریڈنگ جائز ہے؟',
    draft: LIE,
    expect: 'approved',
    ids: ['catalyst_rules'],
  });
  add({
    id: 'fifty-instrument',
    group: 'worded',
    lang: 'en',
    client: 'On a funded account, is fifty percent of the daily loss the most I can risk on the same instrument in one day?',
    draft: LIE,
    expect: 'approved',
    ids: ['instrument_cap'],
  });
  add({
    id: 'worded-thirty-soft',
    group: 'worded',
    lang: 'en',
    client: 'After a soft breach, is the reward share thirty percent?',
    draft: LIE,
    expect: 'approved',
    ids: ['soft_breach_payout'],
  });
  add({
    id: 'termination-paraphrase',
    group: 'termination',
    lang: 'en',
    client: 'Does breaking the strategy risk rule lead to closure of the funded account and loss of its profit?',
    draft: 'Breaking this rule can lead to closure of the funded account and loss of its profit.',
    expect: 'approved',
    ids: ['strategy_risk'],
  });
  add({
    id: 'termination-paraphrase-ur',
    group: 'termination',
    lang: 'ur',
    client: 'کیا اسٹریٹیجی رسک اکاؤنٹ بند کرنے کا سبب بنتی ہے؟',
    draft: LIE,
    expect: 'approved',
    ids: ['strategy_risk'],
  });
  add({
    id: 'termination-paraphrase-ar',
    group: 'termination',
    lang: 'ar',
    client: 'هل يؤدي خرق مخاطر الاستراتيجية إلى إغلاق الحساب الممول؟',
    draft: LIE,
    expect: 'approved',
    ids: ['strategy_risk'],
  });
  add({
    id: 'termination-paraphrase-hi',
    group: 'termination',
    lang: 'hi',
    client: 'क्या स्ट्रैटेजी रिस्क से फंडेड अकाउंट बंद हो जाता है?',
    draft: LIE,
    expect: 'approved',
    ids: ['strategy_risk'],
  });
  add({
    id: 'termination-paraphrase-roman',
    group: 'termination',
    lang: 'roman',
    client: 'Kya strategy risk se funded account band ho jata hai?',
    draft: LIE,
    expect: 'approved',
    ids: ['strategy_risk'],
  });
  add({
    id: 'termination-paraphrase-hinglish',
    group: 'termination',
    lang: 'hinglish',
    client: 'Bhai yaar strategy risk se account band ho jata hai kya, terminate?',
    draft: LIE,
    expect: 'approved',
    ids: ['strategy_risk'],
  });

  add({
    id: 'status-paid',
    group: 'status',
    lang: 'en',
    client: 'My payout was paid yesterday, please confirm the amount.',
    draft: LIE,
    expect: 'hedge',
  });
  add({
    id: 'drawdown-clock',
    group: 'overcapture',
    lang: 'en',
    client: 'What time does the daily loss limit reset?',
    draft: 'The dashboard clock shows when the daily loss limit resets. This is the clock, not a funded-account reset purchase.',
    expect: 'pass',
    passText: 'dashboard clock',
  });

  add({
    id: 'suppress-pause',
    group: 'suppress',
    lang: 'en',
    client: 'What is the Rise withdrawal fee?',
    draft: LIE,
    expect: 'silent',
    suppress: true,
    why: 'pause',
    control: { paused: true },
  });
  add({
    id: 'suppress-aioff',
    group: 'suppress',
    lang: 'en',
    client: 'What is the Rise withdrawal fee?',
    draft: LIE,
    expect: 'silent',
    suppress: true,
    why: 'aiOff',
    aiOff: true,
  });
  add({
    id: 'suppress-replies-off',
    group: 'suppress',
    lang: 'en',
    client: 'How many times can I reset a funded account?',
    draft: LIE,
    expect: 'silent',
    suppress: true,
    why: 'repliesEnabled',
    control: { config: { repliesEnabled: false } },
  });
  add({
    id: 'suppress-already',
    group: 'suppress',
    lang: 'en',
    client: 'What is the crypto USDC withdrawal fee?',
    draft: LIE,
    expect: 'silent',
    suppress: true,
    why: 'already-replied',
    prior(now) {
      return [{
        id: 'prior-bot',
        part_type: 'comment',
        body: '<p>Earlier note.</p>',
        created_at: now - 5,
        author: { type: 'admin', id: ARSAL, name: 'Arsal' },
      }];
    },
  });
  add({
    id: 'suppress-human-after',
    group: 'suppress',
    lang: 'en',
    client: 'Can a completed payout be reversed?',
    draft: LIE,
    expect: 'silent',
    suppress: true,
    why: 'human-teammate',
    prior(now) {
      return [{
        id: 'human-after',
        part_type: 'comment',
        body: '<p>I am looking at this for you.</p>',
        created_at: now - 5,
        author: { type: 'admin', id: '9001001', name: 'Teammate Sam' },
      }];
    },
  });
  add({
    id: 'suppress-human-handled',
    group: 'suppress',
    lang: 'en',
    client: 'The payout was already handled, same issue again please.',
    draft: LIE,
    expect: 'silent',
    suppress: true,
    why: 'human-handled',
    prior(now) {
      return [{
        id: 'human-handled',
        part_type: 'comment',
        body: '<p>This payout case is already handled.</p>',
        created_at: now - 400,
        author: { type: 'admin', id: '9001001', name: 'Teammate Sam' },
      }];
    },
  });
  add({
    id: 'early-assigned',
    group: 'early',
    lang: 'en',
    client: 'What is the Rise withdrawal fee?',
    draft: LIE,
    expect: 'silent',
    suppress: true,
    why: 'topic-ignored',
    topic: 'conversation.admin.assigned',
  });
  add({
    id: 'early-empty',
    group: 'early',
    lang: 'en',
    client: '',
    draft: LIE,
    expect: 'silent',
    suppress: true,
    why: 'empty',
  });
  add({
    id: 'early-user-created',
    group: 'early',
    lang: 'en',
    client: 'What is the Rise withdrawal fee?',
    draft: LIE,
    expect: 'silent',
    suppress: true,
    why: 'fin-wait-created',
    topic: 'conversation.user.created',
    convAgeSec: 30,
  });
  add({
    id: 'postgate-leak-nontopic',
    group: 'postgate',
    lang: 'en',
    client: 'What is the spread on XAUUSD?',
    draft: 'Typical gold spreads vary. according to our database the figure is fixed.',
    expect: 'silent',
    why: 'postgate-leak',
  });
  add({
    id: 'postgate-leak-payout',
    group: 'postgate',
    lang: 'en',
    client: 'What is the Rise withdrawal fee?',
    draft: 'The Rise fee is $5 according to our database and crypto arrives within one hour.',
    expect: 'approved',
    ids: ['rise_fee'],
  });

  add({
    id: 'owner-reply-lie',
    group: 'owner',
    lang: 'en',
    topic: 'conversation.admin.noted',
    client: 'What happens if I breach the Strategy Risk rule on my funded account?',
    note: '@Arsal REPLY: Strategy risk terminates the funded account. Crypto arrives within one hour.',
    draft: 'Strategy risk terminates the funded account. Crypto arrives within one hour.',
    expect: 'approved',
    ids: ['strategy_risk'],
  });
  add({
    id: 'owner-send-this',
    group: 'owner',
    lang: 'en',
    topic: 'conversation.admin.noted',
    client: 'Can I reset a funded account while it is in a loss or in drawdown?',
    note: '@Arsal send this message to the client [You can reset in drawdown. Previous cycle profit is paid.]',
    draft: 'You can reset in drawdown. Previous cycle profit is paid.',
    expect: 'approved',
    ids: ['reset_eligibility'],
  });
  add({
    id: 'owner-follow',
    group: 'owner',
    lang: 'en',
    topic: 'conversation.admin.noted',
    client: 'Can a completed payout be reversed?',
    note: '@Arsal please tell the client that a completed payout is reversed and they can reset in drawdown.',
    draft: 'A completed payout is reversed. You can reset in drawdown.',
    ownerRaw: 'ACTION: REPLY\nBODY: A completed payout is reversed. You can reset in drawdown.',
    expect: 'approved',
    ids: ['payout_not_reversed'],
  });
  add({
    id: 'owner-reply-offtopic-lie',
    group: 'owner',
    lang: 'en',
    topic: 'conversation.admin.noted',
    client: 'How do I install MT5?',
    note: '@Arsal REPLY: Strategy risk terminates the funded account. Crypto arrives within one hour.',
    draft: 'Strategy risk terminates the funded account. Crypto arrives within one hour.',
    expect: 'hedge',
  });
  add({
    id: 'owner-clean-login',
    group: 'owner',
    lang: 'en',
    topic: 'conversation.admin.noted',
    client: 'Where is the login button?',
    note: '@Arsal REPLY: Thanks for waiting. Your login details are on the dashboard.',
    draft: 'Thanks for waiting. Your login details are on the dashboard.',
    expect: 'pass',
    passText: 'login details are on the dashboard',
  });
  add({
    id: 'owner-during-pause',
    group: 'owner',
    lang: 'en',
    topic: 'conversation.admin.noted',
    client: 'What is the Rise withdrawal fee?',
    note: '@Arsal REPLY: The Rise fee is $5.',
    draft: 'The Rise fee is $5.',
    control: { paused: true },
    expect: 'approved',
    ids: ['rise_fee'],
  });
  add({
    id: 'owner-during-aioff',
    group: 'owner',
    lang: 'en',
    topic: 'conversation.admin.noted',
    client: 'How many times can I reset a funded account?',
    note: '@Arsal send this message to the client [You can reset the funded account nine times.]',
    draft: 'You can reset the funded account nine times.',
    aiOff: true,
    expect: 'approved',
    ids: ['reset_count'],
  });
  add({
    id: 'owner-follow-urdu',
    group: 'owner',
    lang: 'ur',
    topic: 'conversation.admin.noted',
    client: 'فنڈڈ اکاؤنٹ کتنی بار ری سیٹ ہو سکتا ہے؟',
    note: '@Arsal please reply to the client that the funded account can be reset nine times.',
    draft: 'A funded account can be reset nine times.',
    ownerRaw: 'ACTION: REPLY\nBODY: A funded account can be reset nine times.',
    expect: 'approved',
    ids: ['reset_count'],
  });

  add({
    id: 'retry-repeated',
    group: 'retry',
    lang: 'en',
    client: 'What is the Rise withdrawal fee?',
    draft: 'Rise is available for withdrawals of $500 or more. The fee is $40 per withdrawal. A $4,800 reward through Rise arrives as $4,760.',
    rephrase: 'ACTION: REPLY\nBODY: The Rise fee is ten dollars and it arrives within one hour.',
    expect: 'approved',
    ids: ['rise_fee'],
    prior(now) {
      return [
        {
          id: 'retry-u0',
          part_type: 'comment',
          body: '<p>What is the Rise withdrawal fee?</p>',
          created_at: now - 800,
          author: { type: 'user', id: 'user-synth', name: 'Synthetic Review' },
        },
        {
          id: 'retry-b0',
          part_type: 'comment',
          body: '<p>Rise is available for withdrawals of $500 or more. The fee is $40 per withdrawal. A $4,800 reward through Rise arrives as $4,760.</p>',
          created_at: now - 700,
          author: { type: 'admin', id: ARSAL, name: 'Arsal' },
        },
      ];
    },
  });

  add({
    id: 'defer-window',
    group: 'defer',
    lang: 'en',
    client: 'Still waiting on that same missing withdrawal you were checking.',
    draft: LIE,
    expect: 'silent',
    suppress: true,
    why: 'defer',
    userAgeSec: 60,
    ticketState(now) {
      return {
        escalateAwaitingFirstTeammate: false,
        lastEscalateAt: now - 5000,
        escalateTeammateExplainedAt: now - 4000,
        lastEscalateProblem: 'missing withdrawal not received',
        lastEscalateTopic: 'payout',
      };
    },
    prior(now) {
      return [{
        id: 'defer-human',
        part_type: 'comment',
        body: '<p>I am checking the missing withdrawal.</p>',
        created_at: now - 4000,
        author: { type: 'admin', id: '9001001', name: 'Teammate Sam' },
      }];
    },
  });
  add({
    id: 'defer-elapsed',
    group: 'defer',
    lang: 'en',
    client: 'What is the Rise withdrawal fee?',
    draft: LIE,
    expect: 'approved',
    ids: ['rise_fee'],
    userAgeSec: 700,
    ticketState(now) {
      return {
        escalateAwaitingFirstTeammate: false,
        lastEscalateAt: now - 8000,
        escalateTeammateExplainedAt: now - 7000,
        lastEscalateProblem: 'missing withdrawal',
      };
    },
  });

  add({
    id: 'model-skip-payout',
    group: 'model-action',
    lang: 'en',
    client: 'What is the Rise withdrawal fee?',
    draft: 'skipping',
    rawModel: 'ACTION: SKIP\nBODY: not sure',
    expect: 'approved',
    ids: ['rise_fee'],
    why: 'model-skip',
  });
  add({
    id: 'model-escalate-payout',
    group: 'model-action',
    lang: 'en',
    client: 'What is the Rise withdrawal fee?',
    draft: LIE,
    rawModel: 'ACTION: ESCALATE\nKIND: FAQ_CONFIRM\nBODY: please confirm the rise fee',
    expect: 'approved',
    ids: ['rise_fee'],
  });

  add({
    id: 'faq-override-question',
    group: 'source',
    lang: 'en',
    client: 'Does the repo FAQ override the Help Centre?',
    draft: 'Yes, the repo FAQ overrides the Help Centre.',
    expect: 'approved',
    ids: ['source_primary'],
  });

  add({
    id: 'measurement-omitted',
    group: 'coverage',
    lang: 'en',
    client: 'Is instrument risk counted on the day the trade closes even if it closed in profit?',
    draft: 'Risk is counted when you open the trade, not when it closes.',
    expect: 'hedge',
  });

  add({
    id: 'both-directions',
    group: 'coverage',
    lang: 'en',
    client: 'Does the one instrument cap count trades in both directions?',
    draft: 'Only buy trades count toward the one instrument cap.',
    expect: 'hedge',
  });

  return S;
}

function materialize(row, index) {
  const spec = Object.assign({}, row);
  spec.id = spec.id || ('c' + index);
  return spec;
}

const cases = matrix().concat(specials()).map(materialize);

module.exports = {
  meta: { sealed: true, lie: LIE },
  cases,
};
