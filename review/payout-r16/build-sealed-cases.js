'use strict';

/**
 * Independent R16 case builder. Writes sealed-cases.json.
 * Does not read review branches, prior review reports, or the author test file.
 */

const fs = require('fs');
const path = require('path');

const GUARD_PATH = process.env.R16_GUARD ||
  '/tmp/r16-run/luna-current/10_synthetic_lanes/t800-payout-r16/payoutClaimGuard.js';
const guard = require(GUARD_PATH);

const LANGS = ['en', 'ur', 'roman', 'hi', 'ar', 'hinglish'];
const NAMES = { en: 'Nadia', ur: 'عائشہ', roman: 'Ayesha', hi: 'राहुल', ar: 'عمر', hinglish: 'Rahul' };

const FAQ = {
  en: [
    ['How do I download the trading platform on my laptop?', 'Open the client area, choose Downloads, and install the platform for your computer. Use the server name shown next to your credentials.'],
    ['Where do I upload my KYC selfie and passport?', 'Open Verification, choose the document type, and upload a clear selfie plus the photo page of your passport.'],
    ['I forgot my dashboard password. How do I reset it?', 'On the login page choose Forgot password and follow the email link. That resets the dashboard password only.'],
    ['How do I change the language shown on the dashboard?', 'Open the profile menu and choose the language you want. The dashboard reloads in that language.'],
    ['Can I log in to the dashboard from my phone browser?', 'Yes. Open the client area in your phone browser, sign in, and the dashboard loads there.'],
    ['Where do I find the economic calendar?', 'The economic calendar is linked from the client area under the trading tools section.'],
    ['How do I update the name on my profile?', 'Open your profile, edit the name field, and save. The new name shows on the dashboard.'],
    ['Which browser should I use for the client area?', 'Use a current version of Chrome, Firefox, or Edge, and allow the site to stay signed in.'],
    ['How do I turn on two-factor authentication?', 'Open security settings, choose two-factor authentication, and confirm the code from your authenticator app.'],
    ['Where are the platform server addresses listed?', 'Server addresses are listed beside your credentials in the client area after you open the account.'],
    ['How do I start a support chat from the dashboard?', 'Use the chat button in the client area and describe the question. This conversation is that chat.'],
    ['How do I switch the chart view to dark mode?', 'Open the chart settings in the platform and choose the dark theme. The prices view then uses the dark background.'],
  ],
  ur: [
    ['میں ٹریڈنگ پلیٹ فارم لیپ ٹاپ پر کیسے ڈاؤن لوڈ کروں؟', 'کلائنٹ ایریا کھولیں، Downloads منتخب کریں، اور اپنے کمپیوٹر کے لیے پلیٹ فارم انسٹال کریں۔ سرور کا نام کریڈینشلز کے پاس لکھا ہوتا ہے۔'],
    ['میں KYC سیلفی اور پاسپورٹ کہاں اپلوڈ کروں؟', 'Verification کھولیں، دستاویز کی قسم منتخب کریں، اور واضح سیلفی کے ساتھ پاسپورٹ کا فوٹو والا صفحہ اپلوڈ کریں۔'],
    ['میں ڈیش بورڈ کا پاس ورڈ بھول گیا ہوں۔ اسے کیسے ری سیٹ کروں؟', 'لاگ ان صفحے پر Forgot password منتخب کریں اور ای میل کا لنک استعمال کریں۔ اس سے صرف ڈیش بورڈ کا پاس ورڈ ری سیٹ ہوتا ہے۔'],
    ['ڈیش بورڈ کی زبان کیسے بدلوں؟', 'پروفائل مینو کھولیں اور مطلوبہ زبان منتخب کریں۔ ڈیش بورڈ اسی زبان میں دوبارہ کھل جاتا ہے۔'],
    ['کیا میں فون کے براؤزر سے ڈیش بورڈ میں لاگ ان کر سکتا ہوں؟', 'جی ہاں۔ فون کے براؤزر میں کلائنٹ ایریا کھولیں، سائن ان کریں، اور ڈیش بورڈ وہیں کھل جاتا ہے۔'],
    ['اکنامک کیلنڈر کہاں ملے گا؟', 'اکنامک کیلنڈر کلائنٹ ایریا میں ٹریڈنگ ٹولز کے حصے میں لنک ہے۔'],
    ['پروفائل پر نام کیسے اپڈیٹ کروں؟', 'پروفائل کھولیں، نام کی فیلڈ میں تبدیلی کریں، اور محفوظ کریں۔ نیا نام ڈیش بورڈ پر نظر آتا ہے۔'],
    ['کلائنٹ ایریا کے لیے کون سا براؤزر استعمال کروں؟', 'Chrome، Firefox یا Edge کا موجودہ ورژن استعمال کریں، اور سائٹ کو سائن ان رہنے دیں۔'],
    ['ٹو فیکٹر تصدیق کیسے چالو کروں؟', 'سیکیورٹی سیٹنگز کھولیں، ٹو فیکٹر منتخب کریں، اور آتھینٹیکیٹر ایپ کا کوڈ تصدیق کریں۔'],
    ['پلیٹ فارم کے سرور پتے کہاں لکھے ہیں؟', 'اکاؤنٹ کھولنے کے بعد سرور کے پتے کلائنٹ ایریا میں کریڈینشلز کے پاس لکھے ہوتے ہیں۔'],
    ['ڈیش بورڈ سے سپورٹ چیٹ کیسے شروع کروں؟', 'کلائنٹ ایریا میں چیٹ کا بٹن استعمال کریں اور سوال لکھیں۔ یہی وہ چیٹ ہے۔'],
    ['چارٹ کو ڈارک موڈ پر کیسے لاؤں؟', 'پلیٹ فارم میں چارٹ سیٹنگز کھولیں اور ڈارک تھیم منتخب کریں۔ قیمتوں کا منظر گہرا پس منظر استعمال کرتا ہے۔'],
  ],
  roman: [
    ['Main trading platform laptop par kaise download karun?', 'Client area kholo, Downloads choose karo, aur apne computer ke liye platform install karo. Server name credentials ke paas likha hota hai.'],
    ['Main KYC selfie aur passport kahan upload karun?', 'Verification kholo, document type choose karo, aur clear selfie ke sath passport ka photo page upload karo.'],
    ['Main dashboard ka password bhool gaya hoon. Use kaise reset karun?', 'Login page par Forgot password choose karo aur email ka link use karo. Is se sirf dashboard ka password reset hota hai.'],
    ['Dashboard ki language kaise change karun?', 'Profile menu kholo aur woh language choose karo jo chahiye. Dashboard usi language mein dobara khul jata hai.'],
    ['Kya main phone browser se dashboard mein login kar sakta hoon?', 'Ji haan. Phone browser mein client area kholo, sign in karo, aur dashboard wahin khul jata hai.'],
    ['Economic calendar kahan milega?', 'Economic calendar client area mein trading tools ke section mein linked hai.'],
    ['Profile par naam kaise update karun?', 'Profile kholo, name field edit karo, aur save karo. Naya naam dashboard par nazar aata hai.'],
    ['Client area ke liye kaun sa browser use karun?', 'Chrome, Firefox, ya Edge ka current version use karo, aur site ko signed in rehne do.'],
    ['Two-factor authentication kaise on karun?', 'Security settings kholo, two-factor choose karo, aur authenticator app ka code confirm karo.'],
    ['Platform ke server addresses kahan likhe hain?', 'Account kholne ke baad server addresses client area mein credentials ke paas likhe hote hain.'],
    ['Dashboard se support chat kaise shuru karun?', 'Client area mein chat button use karo aur sawal likho. Yahi woh chat hai.'],
    ['Chart ko dark mode par kaise laun?', 'Platform mein chart settings kholo aur dark theme choose karo. Prices ka view gehra background use karta hai.'],
  ],
  hi: [
    ['मैं ट्रेडिंग प्लेटफॉर्म लैपटॉप पर कैसे डाउनलोड करूँ?', 'क्लाइंट एरिया खोलें, Downloads चुनें, और अपने कंप्यूटर के लिए प्लेटफॉर्म इंस्टॉल करें। सर्वर का नाम क्रेडेंशियल्स के पास लिखा होता है।'],
    ['मैं KYC सेल्फी और पासपोर्ट कहाँ अपलोड करूँ?', 'Verification खोलें, दस्तावेज़ का प्रकार चुनें, और स्पष्ट सेल्फी के साथ पासपोर्ट का फोटो वाला पृष्ठ अपलोड करें।'],
    ['मैं डैशबोर्ड का पासवर्ड भूल गया हूँ। उसे कैसे रीसेट करूँ?', 'लॉगिन पृष्ठ पर Forgot password चुनें और ईमेल की लिंक का उपयोग करें। इससे केवल डैशबोर्ड का पासवर्ड रीसेट होता है।'],
    ['डैशबोर्ड की भाषा कैसे बदलूँ?', 'प्रोफाइल मेनू खोलें और जो भाषा चाहिए वह चुनें। डैशबोर्ड उसी भाषा में फिर खुल जाता है।'],
    ['क्या मैं फोन ब्राउज़र से डैशबोर्ड में लॉगिन कर सकता हूँ?', 'हाँ। फोन ब्राउज़र में क्लाइंट एरिया खोलें, साइन इन करें, और डैशबोर्ड वहीं खुल जाता है।'],
    ['इकनॉमिक कैलेंडर कहाँ मिलेगा?', 'इकनॉमिक कैलेंडर क्लाइंट एरिया में ट्रेडिंग टूल्स के भाग में लिंक है।'],
    ['प्रोफाइल पर नाम कैसे अपडेट करूँ?', 'प्रोफाइल खोलें, नाम की फील्ड बदलें, और सेव करें। नया नाम डैशबोर्ड पर दिखता है।'],
    ['क्लाइंट एरिया के लिए कौन सा ब्राउज़र उपयोग करूँ?', 'Chrome, Firefox, या Edge का वर्तमान संस्करण उपयोग करें, और साइट को साइन इन रहने दें।'],
    ['दो-कारक प्रमाणीकरण कैसे चालू करूँ?', 'सुरक्षा सेटिंग्स खोलें, दो-कारक चुनें, और ऑथेंटिकेटर ऐप का कोड पुष्टि करें।'],
    ['प्लेटफॉर्म के सर्वर पते कहाँ लिखे हैं?', 'अकाउंट खोलने के बाद सर्वर पते क्लाइंट एरिया में क्रेडेंशियल्स के पास लिखे होते हैं।'],
    ['डैशबोर्ड से सपोर्ट चैट कैसे शुरू करूँ?', 'क्लाइंट एरिया में चैट बटन का उपयोग करें और प्रश्न लिखें। यही वह चैट है।'],
    ['चार्ट को डार्क मोड पर कैसे लाऊँ?', 'प्लेटफॉर्म में चार्ट सेटिंग्स खोलें और डार्क थीम चुनें। कीमतों का दृश्य गहरा पृष्ठभूमि उपयोग करता है।'],
  ],
  ar: [
    ['كيف أقوم بتنزيل منصة التداول على حاسوبي؟', 'افتح منطقة العميل، اختر التنزيلات، وثبّت المنصة على جهازك. اسم الخادم يظهر بجانب بيانات الدخول.'],
    ['أين أرفع صورة التحقق الذاتية وجواز السفر؟', 'افتح التحقق، اختر نوع المستند، وارفع صورة واضحة للوجه مع صفحة الصورة من جواز السفر.'],
    ['نسيت كلمة مرور لوحة التحكم. كيف أعيد تعيينها؟', 'في صفحة الدخول اختر نسيت كلمة المرور واتبع رابط البريد. هذا يعيد تعيين كلمة مرور اللوحة فقط.'],
    ['كيف أغيّر لغة لوحة التحكم؟', 'افتح قائمة الملف الشخصي واختر اللغة التي تريدها. تعيد اللوحة التحميل بتلك اللغة.'],
    ['هل أستطيع تسجيل الدخول من متصفح الهاتف؟', 'نعم. افتح منطقة العميل في متصفح الهاتف وسجّل الدخول، وتظهر لوحة التحكم هناك.'],
    ['أين أجد التقويم الاقتصادي؟', 'التقويم الاقتصادي موجود كرابط في منطقة العميل ضمن قسم أدوات التداول.'],
    ['كيف أحدّث الاسم في ملفي؟', 'افتح الملف، عدّل حقل الاسم، واحفظ. يظهر الاسم الجديد على لوحة التحكم.'],
    ['أي متصفح أستخدم لمنطقة العميل؟', 'استخدم نسخة حديثة من Chrome أو Firefox أو Edge، واسمح للموقع بالبقاء مسجلا.'],
    ['كيف أفعّل التحقق بخطوتين؟', 'افتح إعدادات الأمان، اختر التحقق بخطوتين، وأكّد الرمز من تطبيق المصادقة.'],
    ['أين عناوين خادم المنصة؟', 'عناوين الخادم مكتوبة بجانب بيانات الدخول في منطقة العميل بعد فتح الحساب.'],
    ['كيف أبدأ محادثة الدعم من لوحة التحكم؟', 'استخدم زر المحادثة في منطقة العميل واكتب السؤال. هذه المحادثة هي تلك الدردشة.'],
    ['كيف أحوّل الرسم إلى الوضع الداكن؟', 'افتح إعدادات الرسم في المنصة واختر السمة الداكنة. يستخدم عرض الأسعار خلفية داكنة.'],
  ],
  hinglish: [
    ['Laptop pe trading platform kaise download karun bhai?', 'Client area kholo, Downloads choose karo, aur computer ke liye platform install karo. Server name credentials ke paas likha hota hai.'],
    ['KYC selfie aur passport kahan upload karun yaar?', 'Verification kholo, document type choose karo, aur clear selfie ke saath passport ka photo page upload karo.'],
    ['Dashboard ka password bhool gaya hoon. Kaise reset karun bhai?', 'Login page par Forgot password choose karo aur email link use karo. Isse sirf dashboard password reset hota hai.'],
    ['Dashboard ki language kaise change karun?', 'Profile menu kholo aur jo language chahiye woh choose karo. Dashboard usi language mein reload ho jata hai.'],
    ['Phone browser se dashboard login ho sakta hai kya?', 'Haan. Phone browser mein client area kholo, sign in karo, aur dashboard wahin load ho jata hai.'],
    ['Economic calendar kahan milega yaar?', 'Economic calendar client area mein trading tools ke section mein linked hai.'],
    ['Profile par naam kaise update karun?', 'Profile kholo, name field edit karo, aur save karo. Naya naam dashboard par dikhta hai.'],
    ['Client area ke liye kaunsa browser use karun bhai?', 'Chrome, Firefox, ya Edge ka current version use karo, aur site ko signed in rehne do.'],
    ['Two-factor authentication kaise on karun?', 'Security settings kholo, two-factor choose karo, aur authenticator app ka code confirm karo.'],
    ['Platform ke server addresses kahan likhe hain?', 'Account kholne ke baad server addresses client area mein credentials ke paas likhe hote hain.'],
    ['Dashboard se support chat kaise start karun?', 'Client area mein chat button use karo aur sawal likho. Yahi woh chat hai.'],
    ['Chart ko dark mode pe kaise laun yaar?', 'Platform mein chart settings kholo aur dark theme choose karo. Prices ka view dark background use karta hai.'],
  ],
};

// topic, expect fact, questions[lang], bad draft[lang], forbidden snippet[lang]
const TOPICS = [
  {
    id: 'strategy_risk', fact: 'strategy_risk',
    q: {
      en: 'What happens if I breach the Strategy Risk rule on a funded account?',
      ur: 'فنڈڈ اکاؤنٹ پر اسٹریٹیجی رسک کی خلاف ورزی ہو تو کیا ہوتا ہے؟',
      roman: 'Funded account par Strategy Risk ki breach ho to kya hota hai?',
      hi: 'फंडेड अकाउंट पर स्ट्रैटेजी रिस्क की ब्रीच हो तो क्या होता है?',
      ar: 'ماذا يحدث إذا خرقت مخاطر الاستراتيجية في الحساب الممول؟',
      hinglish: 'Funded account par Strategy Risk breach ho jaye to kya hota hai bhai?',
    },
    bad: {
      en: 'A Strategy Risk breach terminates the funded account and the profit is lost.',
      ur: 'اسٹریٹیجی رسک کی خلاف ورزی اکاؤنٹ ختم کر دیتی ہے اور منافع ضائع ہو جاتا ہے۔',
      roman: 'Strategy Risk ki breach account terminate kar deti hai aur profit kho jata hai.',
      hi: 'स्ट्रैटेजी रिस्क की ब्रीच अकाउंट समाप्त कर देती है और लाभ खत्म हो जाता है।',
      ar: 'خرق مخاطر الاستراتيجية ينهي الحساب الممول ويضيع الربح.',
      hinglish: 'Strategy Risk breach account terminate kar deti hai bhai aur profit loss ho jata hai.',
    },
    forbid: {
      en: 'terminates the funded account',
      ur: 'اسٹریٹیجی رسک کی خلاف ورزی اکاؤنٹ ختم کر دیتی ہے',
      roman: 'Strategy Risk ki breach account terminate kar deti hai',
      hi: 'स्ट्रैटेजी रिस्क की ब्रीच अकाउंट समाप्त कर देती है',
      ar: 'ينهي الحساب الممول',
      hinglish: 'account terminate kar deti hai',
    },
  },
  {
    id: 'daily_loss_hard', fact: 'daily_loss_hard',
    q: {
      en: 'What happens if I touch the daily loss limit?',
      ur: 'اگر میں ڈیلی لاس کی حد کو چھوتا ہوں تو کیا ہوتا ہے؟',
      roman: 'Agar main daily loss ki had ko chhuun to kya hota hai?',
      hi: 'अगर मैं डेली लॉस की सीमा को छू लूँ तो क्या होता है?',
      ar: 'ماذا يحدث إذا لمست حد الخسارة اليومية؟',
      hinglish: 'Agar main daily loss limit ko touch kar lun to kya hota hai bhai?',
    },
    bad: {
      en: 'Touching the daily loss limit is only a warning and the account stays open.',
      ur: 'ڈیلی لاس کی حد کو چھونا صرف وارننگ ہے اور اکاؤنٹ کھلا رہتا ہے۔',
      roman: 'Daily loss ki had ko chhuna sirf warning hai aur account khula rehta hai.',
      hi: 'डेली लॉस की सीमा को छूना केवल चेतावनी है और अकाउंट खुला रहता है।',
      ar: 'لمس حد الخسارة اليومية مجرد تحذير والحساب يبقى مفتوحا.',
      hinglish: 'Daily loss limit ko touch karna sirf warning hai bhai aur account open rehta hai.',
    },
    forbid: {
      en: 'only a warning and the account stays open',
      ur: 'صرف وارننگ ہے اور اکاؤنٹ کھلا رہتا ہے',
      roman: 'sirf warning hai aur account khula rehta hai',
      hi: 'केवल चेतावनी है और अकाउंट खुला रहता है',
      ar: 'مجرد تحذير والحساب يبقى مفتوحا',
      hinglish: 'sirf warning hai bhai aur account open rehta hai',
    },
  },
  {
    id: 'reset_eligibility', fact: 'reset_eligibility',
    q: {
      en: 'Can I reset a funded account while it is in drawdown?',
      ur: 'کیا میں فنڈڈ اکاؤنٹ نقصان میں ری سیٹ کر سکتا ہوں؟',
      roman: 'Kya main funded account ko drawdown mein reset kar sakta hoon?',
      hi: 'क्या मैं फंडेड अकाउंट को ड्रॉडाउन में रीसेट कर सकता हूँ?',
      ar: 'هل يمكنني إعادة تعيين الحساب الممول أثناء التراجع؟',
      hinglish: 'Kya main funded account ko drawdown mein reset kar sakta hoon bhai?',
    },
    bad: {
      en: 'Yes, you can reset a funded account while it is in drawdown.',
      ur: 'جی ہاں، آپ نقصان میں فنڈڈ اکاؤنٹ ری سیٹ کر سکتے ہیں۔',
      roman: 'Ji haan, aap funded account ko drawdown mein reset kar sakte hain.',
      hi: 'हाँ, आप ड्रॉडाउन में फंडेड अकाउंट रीसेट कर सकते हैं।',
      ar: 'نعم، يمكنك إعادة تعيين الحساب الممول أثناء التراجع.',
      hinglish: 'Haan bhai, aap funded account ko drawdown mein reset kar sakte ho.',
    },
    forbid: {
      en: 'reset a funded account while it is in drawdown',
      ur: 'نقصان میں فنڈڈ اکاؤنٹ ری سیٹ کر سکتے ہیں',
      roman: 'funded account ko drawdown mein reset kar sakte hain',
      hi: 'ड्रॉडाउन में फंडेड अकाउंट रीसेट कर सकते हैं',
      ar: 'إعادة تعيين الحساب الممول أثناء التراجع',
      hinglish: 'funded account ko drawdown mein reset kar sakte ho',
    },
  },
  {
    id: 'reset_previous', fact: 'reset_previous',
    q: {
      en: 'After a reset, is profit from the previous cycle paid?',
      ur: 'ری سیٹ کے بعد پچھلے سائیکل کا منافع ادا ہوتا ہے؟',
      roman: 'Reset ke baad pichle cycle ka profit ada hota hai?',
      hi: 'रीसेट के बाद पिछले चक्र का लाभ दिया जाता है?',
      ar: 'بعد إعادة التعيين هل يُدفع ربح الدورة السابقة؟',
      hinglish: 'Reset ke baad previous cycle ka profit pay hota hai kya bhai?',
    },
    bad: {
      en: 'Yes, profit from the previous cycle is still paid after a reset.',
      ur: 'جی ہاں، ری سیٹ کے بعد پچھلے سائیکل کا منافع ادا ہوتا ہے۔',
      roman: 'Ji haan, reset ke baad pichle cycle ka profit ada hota hai.',
      hi: 'हाँ, रीसेट के बाद पिछले चक्र का लाभ दिया जाता है।',
      ar: 'نعم، يُدفع ربح الدورة السابقة بعد إعادة التعيين.',
      hinglish: 'Haan bhai, reset ke baad previous cycle ka profit pay hota hai.',
    },
    forbid: {
      en: 'previous cycle is still paid',
      ur: 'پچھلے سائیکل کا منافع ادا ہوتا ہے',
      roman: 'pichle cycle ka profit ada hota hai',
      hi: 'पिछले चक्र का लाभ दिया जाता है',
      ar: 'يُدفع ربح الدورة السابقة',
      hinglish: 'previous cycle ka profit pay hota hai',
    },
  },
  {
    id: 'payout_not_reversed', fact: 'payout_not_reversed',
    q: {
      en: 'Can a completed payout be reversed?',
      ur: 'کیا مکمل شدہ پے آؤٹ واپس لیا جا سکتا ہے؟',
      roman: 'Kya mukammal payout wapas liya ja sakta hai?',
      hi: 'क्या पूरा किया गया पेआउट वापस लिया जा सकता है?',
      ar: 'هل يمكن عكس السحب المكتمل؟',
      hinglish: 'Kya completed payout reverse ho sakta hai bhai?',
    },
    bad: {
      en: 'Yes, we reversed your completed payout yesterday.',
      ur: 'جی ہاں، مکمل پے آؤٹ واپس لے لیا گیا۔',
      roman: 'Ji haan, mukammal payout wapas le liya gaya.',
      hi: 'हाँ, पूरा पेआउट वापस ले लिया गया।',
      ar: 'نعم، تم عكس السحب المكتمل وسُحب المبلغ.',
      hinglish: 'Haan bhai, completed payout reverse kar liya gaya.',
    },
    forbid: {
      en: 'reversed your completed payout yesterday',
      ur: 'مکمل پے آؤٹ واپس لے لیا گیا',
      roman: 'mukammal payout wapas le liya gaya',
      hi: 'पूरा पेआउट वापस ले लिया गया',
      ar: 'تم عكس السحب المكتمل',
      hinglish: 'completed payout reverse kar liya gaya',
    },
  },
  {
    id: 'weekend_hold', fact: 'weekend_hold',
    q: {
      en: 'Can I hold an open position over the weekend without the Weekend Trading add-on?',
      ur: 'کیا میں ویک اینڈ پر کھلی پوزیشن ویک اینڈ ٹریڈنگ ایڈ آن کے بغیر ہولڈ کر سکتا ہوں؟',
      roman: 'Kya main weekend par open position Weekend Trading add-on ke baghair hold kar sakta hoon?',
      hi: 'क्या मैं वीकएंड पर खुली पोजीशन वीकएंड ट्रेडिंग ऐड-ऑन के बिना होल्ड कर सकता हूँ?',
      ar: 'هل يمكنني إبقاء صفقة مفتوحة خلال نهاية الأسبوع دون إضافة تداول نهاية الأسبوع؟',
      hinglish: 'Kya main weekend par open position Weekend Trading add-on ke bina hold kar sakta hoon bhai?',
    },
    bad: {
      en: 'Holding over the weekend is a violation and is never allowed.',
      ur: 'ویک اینڈ پر ہولڈ کرنا خلاف ورزی ہے اور کبھی جائز نہیں۔',
      roman: 'Weekend par hold karna violation hai aur kabhi allowed nahi.',
      hi: 'वीकएंड पर होल्ड करना उल्लंघन है और कभी अनुमत नहीं।',
      ar: 'لا، الاحتفاظ خلال نهاية الأسبوع مخالفة دائما.',
      hinglish: 'Weekend par hold karna violation hai bhai aur kabhi allowed nahi.',
    },
    forbid: {
      en: 'Holding over the weekend is a violation',
      ur: 'ویک اینڈ پر ہولڈ کرنا خلاف ورزی ہے',
      roman: 'Weekend par hold karna violation hai',
      hi: 'वीकएंड पर होल्ड करना उल्लंघन है',
      ar: 'الاحتفاظ خلال نهاية الأسبوع مخالفة دائما',
      hinglish: 'Weekend par hold karna violation hai',
    },
  },
  {
    id: 'weekend_close', fact: 'weekend_hold',
    q: {
      en: 'Is it a violation if my stop loss is hit and the position closes over the weekend without the add-on?',
      ur: 'کیا ویک اینڈ پر سٹاپ لاس لگ کر پوزیشن بند ہونا ایڈ آن کے بغیر خلاف ورزی ہے؟',
      roman: 'Kya weekend par stop loss hit hokar position close hona add-on ke baghair violation hai?',
      hi: 'क्या वीकएंड पर स्टॉप लॉस लगकर पोजीशन बंद होना ऐड-ऑन के बिना उल्लंघन है?',
      ar: 'هل إغلاق الصفقة عند وصول وقف الخسارة خلال نهاية الأسبوع دون الإضافة مخالفة؟',
      hinglish: 'Kya weekend par stop loss hit hokar position close hona add-on ke bina violation hai bhai?',
    },
    bad: {
      en: 'A stop loss hit over the weekend is always allowed without the add-on.',
      ur: 'نہیں، ویک اینڈ پر سٹاپ لاس لگنا ہمیشہ جائز ہے۔',
      roman: 'Nahi, weekend par stop loss hit hona hamesha allowed hai.',
      hi: 'नहीं, वीकएंड पर स्टॉप लॉस लगना हमेशा अनुमत है।',
      ar: 'لا، وصول وقف الخسارة خلال نهاية الأسبوع مسموح دائما دون الإضافة.',
      hinglish: 'Nahi bhai, weekend par stop loss hit hona hamesha allowed hai.',
    },
    forbid: {
      en: 'always allowed without the add-on',
      ur: 'سٹاپ لاس لگنا ہمیشہ جائز ہے',
      roman: 'stop loss hit hona hamesha allowed hai',
      hi: 'स्टॉप लॉस लगना हमेशा अनुमत है',
      ar: 'مسموح دائما دون الإضافة',
      hinglish: 'stop loss hit hona hamesha allowed hai',
    },
  },
  {
    id: 'weekend_trade', fact: 'weekend_trade',
    q: {
      en: 'Can I open a new position on Saturday without the Weekend Trading add-on?',
      ur: 'کیا میں ہفتے کو ویک اینڈ ٹریڈنگ ایڈ آن کے بغیر نئی پوزیشن کھول سکتا ہوں؟',
      roman: 'Kya main Hafta ko Weekend Trading add-on ke baghair nayi position khol sakta hoon?',
      hi: 'क्या मैं शनिवार को वीकएंड ट्रेडिंग ऐड-ऑन के बिना नई पोजीशन खोल सकता हूँ?',
      ar: 'هل يمكنني فتح صفقة جديدة يوم السبت دون إضافة تداول نهاية الأسبوع؟',
      hinglish: 'Kya main Saturday ko Weekend Trading add-on ke bina nayi position khol sakta hoon bhai?',
    },
    bad: {
      en: 'Opening a new position on Saturday is allowed without the Weekend Trading add-on.',
      ur: 'ہفتے کو نئی پوزیشن کھولنا ایڈ آن کے بغیر جائز ہے۔',
      roman: 'Hafta ko nayi position kholna add-on ke baghair allowed hai.',
      hi: 'शनिवार को नई पोजीशन खोलना ऐड-ऑन के बिना अनुमत है।',
      ar: 'فتح صفقة جديدة يوم السبت مسموح دون الإضافة.',
      hinglish: 'Saturday ko nayi position kholna add-on ke bina allowed hai bhai.',
    },
    forbid: {
      en: 'Saturday is allowed without the Weekend Trading add-on',
      ur: 'نئی پوزیشن کھولنا ایڈ آن کے بغیر جائز ہے',
      roman: 'nayi position kholna add-on ke baghair allowed hai',
      hi: 'नई पोजीशन खोलना ऐड-ऑन के बिना अनुमत है',
      ar: 'فتح صفقة جديدة يوم السبت مسموح دون الإضافة',
      hinglish: 'nayi position kholna add-on ke bina allowed hai',
    },
  },
  {
    id: 'rise_fee', fact: 'rise_fee',
    q: {
      en: 'What is the Rise withdrawal fee?',
      ur: 'Rise کی ودڈرال فیس کیا ہے؟',
      roman: 'Rise ki withdrawal fee kya hai?',
      hi: 'Rise की निकासी शुल्क क्या है?',
      ar: 'ما رسم سحب Rise؟',
      hinglish: 'Rise ki withdrawal fee kya hai bhai?',
    },
    bad: {
      en: 'Rise is free for every withdrawal.',
      ur: 'Rise ہر ودڈرال پر مفت ہے۔',
      roman: 'Rise har withdrawal par free hai.',
      hi: 'Rise हर निकासी पर मुफ्त है।',
      ar: 'Rise مجاني لكل عملية سحب.',
      hinglish: 'Rise har withdrawal par free hai bhai.',
    },
    forbid: {
      en: 'Rise is free for every withdrawal',
      ur: 'Rise ہر ودڈرال پر مفت ہے',
      roman: 'Rise har withdrawal par free hai',
      hi: 'Rise हर निकासी पर मुफ्त है',
      ar: 'Rise مجاني لكل عملية سحب',
      hinglish: 'Rise har withdrawal par free hai',
    },
  },
  {
    id: 'crypto_fee', fact: 'crypto_fee',
    q: {
      en: 'What is the crypto USDC payout fee?',
      ur: 'کرپٹو USDC پے آؤٹ کی فیس کیا ہے؟',
      roman: 'Crypto USDC payout ki fee kya hai?',
      hi: 'क्रिप्टो USDC पेआउट की फीस क्या है?',
      ar: 'ما رسم سحب الكريبتو USDC؟',
      hinglish: 'Crypto USDC payout ki fee kya hai bhai?',
    },
    bad: {
      en: 'The crypto fee is a flat $40 on every payout.',
      ur: 'کرپٹو کی فیس ہر پے آؤٹ پر ایک فلیٹ $40 ہے۔',
      roman: 'Crypto ki fee har payout par flat $40 hai.',
      hi: 'क्रिप्टो की फीस हर पेआउट पर एक फ्लैट $40 है।',
      ar: 'رسم الكريبتو مبلغ ثابت $40 عن كل سحب.',
      hinglish: 'Crypto ki fee har payout par flat $40 hai bhai.',
    },
    forbid: {
      en: 'crypto fee is a flat $40',
      ur: 'ایک فلیٹ $40 ہے',
      roman: 'flat $40 hai',
      hi: 'एक फ्लैट $40 है',
      ar: 'مبلغ ثابت $40',
      hinglish: 'flat $40 hai',
    },
  },
  {
    id: 'payout_timing', fact: 'payout_timing',
    q: {
      en: 'How long do approved payouts take to arrive?',
      ur: 'منظور شدہ پے آؤٹ پہنچنے میں کتنا وقت لگتا ہے؟',
      roman: 'Manzoor payout pohanchne mein kitna time lagta hai?',
      hi: 'स्वीकृत पेआउट पहुँचने में कितना समय लगता है?',
      ar: 'كم يستغرق وصول السحب المعتمد؟',
      hinglish: 'Approved payout aane mein kitna time lagta hai bhai?',
    },
    bad: {
      en: 'Approved payouts are guaranteed to arrive within one hour.',
      ur: 'منظور شدہ پے آؤٹ ایک گھنٹے میں ضرور پہنچ جاتا ہے۔',
      roman: 'Manzoor payout ek ghante mein zaroor pohanch jata hai.',
      hi: 'स्वीकृत पेआउट एक घंटे में ज़रूर पहुँच जाता है।',
      ar: 'السحب المعتمد يصل حتما خلال ساعة واحدة.',
      hinglish: 'Approved payout ek ghante mein zaroor aa jata hai bhai.',
    },
    forbid: {
      en: 'guaranteed to arrive within one hour',
      ur: 'ایک گھنٹے میں ضرور پہنچ جاتا ہے',
      roman: 'ek ghante mein zaroor pohanch jata hai',
      hi: 'एक घंटे में ज़रूर पहुँच जाता है',
      ar: 'يصل حتما خلال ساعة واحدة',
      hinglish: 'ek ghante mein zaroor aa jata hai',
    },
  },
  {
    id: 'instrument_cap', fact: 'instrument_cap',
    q: {
      en: 'How much of the daily loss limit can I risk on one instrument on a funded account?',
      ur: 'فنڈڈ اکاؤنٹ پر ایک انسٹرومنٹ پر ڈیلی لاس حد کا کتنا رسک لے سکتا ہوں؟',
      roman: 'Funded account par ek instrument par daily loss had ka kitna risk le sakta hoon?',
      hi: 'फंडेड अकाउंट पर एक इंस्ट्रूमेंट पर डेली लॉस सीमा का कितना जोखिम ले सकता हूँ?',
      ar: 'كم يمكنني المخاطرة به من حد الخسارة اليومية على أداة واحدة في الحساب الممول؟',
      hinglish: 'Funded account par ek instrument par daily loss limit ka kitna risk le sakta hoon bhai?',
    },
    bad: {
      en: 'You may risk 100% of the daily loss limit on one instrument.',
      ur: 'آپ ایک انسٹرومنٹ پر ڈیلی لاس حد کا 100% رسک لے سکتے ہیں۔',
      roman: 'Aap ek instrument par daily loss had ka 100% risk le sakte hain.',
      hi: 'आप एक इंस्ट्रूमेंट पर डेली लॉस सीमा का 100% जोखिम ले सकते हैं।',
      ar: 'يجوز المخاطرة بـ 100% من حد الخسارة اليومية على أداة واحدة.',
      hinglish: 'Aap ek instrument par daily loss limit ka 100% risk le sakte ho bhai.',
    },
    forbid: {
      en: 'risk 100% of the daily loss limit',
      ur: '100% رسک لے سکتے ہیں',
      roman: '100% risk le sakte hain',
      hi: '100% जोखिम ले सकते हैं',
      ar: 'المخاطرة بـ 100%',
      hinglish: '100% risk le sakte ho',
    },
  },
  {
    id: 'soft_breach_payout', fact: 'soft_breach_payout',
    q: {
      en: 'What happens to my payout after a soft breach on a funded account?',
      ur: 'فنڈڈ اکاؤنٹ پر نرم خلاف ورزی کے بعد پے آؤٹ کا کیا ہوتا ہے؟',
      roman: 'Funded account par soft breach ke baad payout ka kya hota hai?',
      hi: 'फंडेड अकाउंट पर सॉफ्ट ब्रीच के बाद पेआउट का क्या होता है?',
      ar: 'ماذا يحدث للسحب بعد الخرق البسيط في الحساب الممول؟',
      hinglish: 'Funded account par soft breach ke baad payout ka kya hota hai bhai?',
    },
    bad: {
      en: 'A soft breach closes the funded account immediately and cancels the payout.',
      ur: 'نرم خلاف ورزی فوراً اکاؤنٹ بند کر دیتی ہے اور پے آؤٹ منسوخ ہو جاتا ہے۔',
      roman: 'Soft breach foran account band kar deti hai aur payout cancel ho jata hai.',
      hi: 'सॉफ्ट ब्रीच तुरंत अकाउंट बंद कर देती है और पेआउट रद्द हो जाता है।',
      ar: 'الخرق البسيط يغلق الحساب فورا ويلغي السحب.',
      hinglish: 'Soft breach turant account band kar deti hai bhai aur payout cancel ho jata hai.',
    },
    forbid: {
      en: 'closes the funded account immediately and cancels the payout',
      ur: 'فوراً اکاؤنٹ بند کر دیتی ہے',
      roman: 'foran account band kar deti hai',
      hi: 'तुरंत अकाउंट बंद कर देती है',
      ar: 'يغلق الحساب فورا',
      hinglish: 'turant account band kar deti hai',
    },
  },
  {
    id: 'fee_refund', fact: 'fee_refund',
    q: {
      en: 'When is the challenge fee refunded?',
      ur: 'چیلنج فیس کب واپس ہوتی ہے؟',
      roman: 'Challenge fee kab wapas hoti hai?',
      hi: 'चैलेंज फीस कब वापस होती है?',
      ar: 'متى تُرد رسوم التحدي؟',
      hinglish: 'Challenge fee kab refund hoti hai bhai?',
    },
    bad: {
      en: 'Catalyst fees are refunded on the first payout.',
      ur: 'Catalyst کی فیس پہلے پے آؤٹ پر واپس ہو جاتی ہے۔',
      roman: 'Catalyst ki fee pehle payout par wapas ho jati hai.',
      hi: 'Catalyst की फीस पहले पेआउट पर वापस हो जाती है।',
      ar: 'تُرد رسوم Catalyst مع أول سحب.',
      hinglish: 'Catalyst ki fee pehle payout par refund ho jati hai bhai.',
    },
    forbid: {
      en: 'Catalyst fees are refunded on the first payout',
      ur: 'پہلے پے آؤٹ پر واپس ہو جاتی ہے',
      roman: 'pehle payout par wapas ho jati hai',
      hi: 'पहले पेआउट पर वापस हो जाती है',
      ar: 'تُرد رسوم Catalyst مع أول سحب',
      hinglish: 'pehle payout par refund ho jati hai',
    },
  },
  {
    id: 'source_primary', fact: 'source_primary',
    q: {
      en: 'Does the repo FAQ override the Help Centre?',
      ur: 'کیا ریپو کا سوال جواب ہیلپ سینٹر پر غالب ہے؟',
      roman: 'Kya repo ka FAQ Help Centre par ghalib hai?',
      hi: 'क्या रिपो का प्रश्नोत्तर हेल्प सेंटर पर भारी पड़ता है?',
      ar: 'هل تلغي أسئلة المستودع الشائعة مركز المساعدة؟',
      hinglish: 'Kya repo FAQ Help Centre ko override karta hai bhai?',
    },
    bad: {
      en: 'Yes, the repo FAQ overrides the Help Centre.',
      ur: 'جی ہاں، ریپو کا سوال جواب ہیلپ سینٹر سے اوپر ہے۔',
      roman: 'Ji haan, repo ka FAQ Help Centre se upar hai.',
      hi: 'हाँ, रिपो का प्रश्नोत्तर हेल्प सेंटर से ऊपर है।',
      ar: 'نعم، أسئلة المستودع الشائعة فوق مركز المساعدة.',
      hinglish: 'Haan bhai, repo FAQ Help Centre se upar hai.',
    },
    forbid: {
      en: 'repo FAQ overrides the Help Centre',
      ur: 'ہیلپ سینٹر سے اوپر ہے',
      roman: 'Help Centre se upar hai',
      hi: 'हेल्प सेंटर से ऊपर है',
      ar: 'فوق مركز المساعدة',
      hinglish: 'Help Centre se upar hai',
    },
  },
];

const ERASE = {
  q: {
    en: "After a Catalyst stage reset, does the account remember yesterday's earnings?",
    ur: 'کیا Catalyst مرحلے کے ری سیٹ کے بعد کل کی کمائی محفوظ رہتی ہے؟',
    roman: "Catalyst stage reset ke baad kya account yesterday's earnings yaad rakhta hai?",
    hi: 'क्या Catalyst चरण रीसेट के बाद कल की कमाई याद रहती है?',
    ar: 'بعد إعادة تعيين مرحلة Catalyst هل يتذكر الحساب أرباح الأمس؟',
    hinglish: 'Catalyst stage reset ke baad kya yesterday ki earning reh jati hai yaar?',
  },
  bad: {
    en: "Yes, Catalyst remembers yesterday's earnings and the profit stays.",
    ur: 'جی ہاں، کل کی کمائی محفوظ رہتی ہے۔',
    roman: "Haan, account yesterday's earnings yaad rakhta hai aur profit reh jata hai.",
    hi: 'हाँ, कल की कमाई याद रहती है और लाभ बना रहता है।',
    ar: 'نعم، يحتفظ الحساب بأرباح الأمس بعد إعادة تعيين المرحلة.',
    hinglish: 'Haan yaar, yesterday ki earning reh jati hai.',
  },
  forbid: {
    en: "remembers yesterday's earnings and the profit stays",
    ur: 'کل کی کمائی محفوظ رہتی ہے',
    roman: "yesterday's earnings yaad rakhta hai",
    hi: 'कल की कमाई याद रहती है',
    ar: 'يحتفظ الحساب بأرباح الأمس',
    hinglish: 'yesterday ki earning reh jati hai',
  },
};

const COMPOUND = {
  q: {
    en: 'Can I hold over the weekend and also close the position if my stop loss is hit?',
    ur: 'کیا میں ویک اینڈ پر پوزیشن ہولڈ بھی کر سکتا ہوں اور سٹاپ لاس لگنے پر بند بھی کر سکتا ہوں؟',
    roman: 'Kya main weekend par position hold bhi kar sakta hoon aur stop loss hit hone par close bhi kar sakta hoon?',
    hi: 'क्या मैं वीकएंड पर पोजीशन होल्ड भी कर सकता हूँ और स्टॉप लॉस लगने पर बंद भी कर सकता हूँ?',
    ar: 'هل أستطيع إبقاء الصفقة خلال نهاية الأسبوع وأيضا إغلاقها إذا وصل وقف الخسارة؟',
    hinglish: 'Kya main weekend par position hold bhi kar sakta hoon aur stop loss hit hone par close bhi kar sakta hoon bhai?',
  },
  bad: {
    en: 'Holding over the weekend is a violation and closing on a stop loss is always allowed.',
    ur: 'ویک اینڈ پر ہولڈ کرنا خلاف ورزی ہے اور سٹاپ لاس پر بند کرنا ہمیشہ جائز ہے۔',
    roman: 'Weekend par hold karna violation hai aur stop loss par close karna hamesha allowed hai.',
    hi: 'वीकएंड पर होल्ड करना उल्लंघन है और स्टॉप लॉस पर बंद करना हमेशा अनुमत है।',
    ar: 'الاحتفاظ خلال نهاية الأسبوع مخالفة دائما وإغلاق وقف الخسارة مسموح دائما.',
    hinglish: 'Weekend par hold karna violation hai bhai aur stop loss par close karna hamesha allowed hai.',
  },
  forbid: {
    en: 'Holding over the weekend is a violation',
    ur: 'ویک اینڈ پر ہولڈ کرنا خلاف ورزی ہے',
    roman: 'Weekend par hold karna violation hai',
    hi: 'वीकएंड पर होल्ड करना उल्लंघन है',
    ar: 'الاحتفاظ خلال نهاية الأسبوع مخالفة دائما',
    hinglish: 'Weekend par hold karna violation hai',
  },
};

const MIXED_FAQ = {
  en: 'Open Verification, choose the document type, and upload a clear selfie plus the photo page of your passport.',
  ur: 'Verification کھولیں، دستاویز کی قسم منتخب کریں، اور واضح سیلفی کے ساتھ پاسپورٹ کا فوٹو والا صفحہ اپلوڈ کریں۔',
  roman: 'Verification kholo, document type choose karo, aur clear selfie ke sath passport ka photo page upload karo.',
  hi: 'Verification खोलें, दस्तावेज़ का प्रकार चुनें, और स्पष्ट सेल्फी के साथ पासपोर्ट का फोटो वाला पृष्ठ अपलोड करें।',
  ar: 'افتح التحقق، اختر نوع المستند، وارفع صورة واضحة للوجه مع صفحة الصورة من جواز السفر.',
  hinglish: 'Verification kholo, document type choose karo, aur clear selfie ke saath passport ka photo page upload karo.',
};

function mixedQuestion(lang) {
  const q = {
    en: 'How do I upload my KYC selfie, and what is the Rise withdrawal fee?',
    ur: 'میں KYC سیلفی کیسے اپلوڈ کروں، اور Rise کی ودڈرال فیس کیا ہے؟',
    roman: 'Main KYC selfie kaise upload karun, aur Rise ki withdrawal fee kya hai?',
    hi: 'मैं KYC सेल्फी कैसे अपलोड करूँ, और Rise की निकासी शुल्क क्या है?',
    ar: 'كيف أرفع صورة التحقق، وما رسم سحب Rise؟',
    hinglish: 'KYC selfie kaise upload karun, aur Rise ki withdrawal fee kya hai bhai?',
  };
  return q[lang];
}

function ownerPlan(i, lang) {
  const plans = [
    {
      form: 'reply',
      note: '@Arsal REPLY: A completed payout was reversed yesterday and the money was taken back.',
      forbid: 'reversed yesterday and the money was taken back',
    },
    {
      form: 'reply',
      note: '@Arsal REPLY: جی ہاں، مکمل پے آؤٹ واپس لے لیا گیا۔',
      forbid: 'مکمل پے آؤٹ واپس لے لیا گیا',
    },
    {
      form: 'send',
      note: '@Arsal please send this message to the client [Holding over the weekend is a violation and the account will be closed.]',
      forbid: 'Holding over the weekend is a violation',
    },
    {
      form: 'follow',
      note: "@Arsal please tell the client that Catalyst keeps yesterday's earnings after the stage reset.",
      model: "ACTION: REPLY\nBODY: Catalyst keeps yesterday's earnings after the stage reset and the profit stays.",
      forbid: "keeps yesterday's earnings",
    },
    {
      form: 'reply',
      note: '@Arsal REPLY: You can reset the funded account while it is in a loss.',
      forbid: 'while it is in a loss',
    },
    {
      form: 'reply',
      note: '@Arsal REPLY: لا، الاحتفاظ خلال نهاية الأسبوع مخالفة دائما.',
      forbid: 'الاحتفاظ خلال نهاية الأسبوع مخالفة دائما',
    },
  ];
  return plans[i % plans.length];
}

function actionReply(body) {
  return 'ACTION: REPLY\nBODY: ' + body;
}

function accountFor(n) {
  const base = 51000000 + (n * 97) % 8000000;
  return String(base);
}

const cases = [];
let n = 0;
for (let li = 0; li < LANGS.length; li++) {
  const lang = LANGS[li];
  for (let ti = 0; ti < TOPICS.length; ti++) {
    const topic = TOPICS[ti];
    const scriptId = lang + '-' + String(ti + 1).padStart(2, '0') + '-' + topic.id;
    const email = 'r16.' + scriptId.replace(/[^a-z0-9]+/gi, '') + '@example.net';
    const acct = accountFor(n + 1);
    const faqs = FAQ[lang];
    const f1 = faqs[(ti * 2) % faqs.length];
    const f2 = faqs[(ti * 2 + 1) % faqs.length];
    const clientName = NAMES[lang];
    const base = { scriptId, lang, clientName, email, account: acct };

    function add(extra) {
      n += 1;
      cases.push(Object.assign({
        id: 'r16-' + String(n).padStart(4, '0'),
        scriptId, lang, clientName, email, account: acct,
      }, extra));
    }

    add({
      kind: 'faq',
      topic: 'faq',
      client: f1[0],
      model: actionReply(f1[1]),
      faqCore: f1[1],
      forbidden: [],
      expectPublic: true,
      expectSuppress: false,
    });
    add({
      kind: 'faq',
      topic: 'faq',
      client: f2[0],
      model: actionReply(f2[1]),
      faqCore: f2[1],
      forbidden: [],
      expectPublic: true,
      expectSuppress: false,
      inflight: true,
    });

    const intent = guard.analyze(topic.q[lang]);
    add({
      kind: 'policy',
      topic: topic.id,
      fact: topic.fact,
      client: topic.q[lang],
      model: actionReply(topic.bad[lang]),
      forbidden: [topic.forbid[lang]],
      expectPublic: true,
      expectSuppress: false,
      expectLocked: !!(intent.confident && intent.ids.length === 1 && intent.ids[0] === topic.fact && !intent.hedgeOnly && !intent.memory && !intent.conflict),
      classifierIds: intent.ids,
    });

    if (ti % 2 === 0) {
      add({
        kind: 'compound',
        topic: 'weekend_hold_and_close',
        client: COMPOUND.q[lang],
        model: actionReply(COMPOUND.bad[lang]),
        forbidden: [COMPOUND.forbid[lang]],
        expectPublic: true,
        expectSuppress: false,
        expectHedge: true,
      });
    } else {
      add({
        kind: 'mixed',
        topic: 'kyc_and_rise',
        client: mixedQuestion(lang),
        model: actionReply(MIXED_FAQ[lang] + ' ' + TOPICS[8].bad[lang]),
        faqCore: MIXED_FAQ[lang],
        forbidden: [TOPICS[8].forbid[lang]],
        expectPublic: true,
        expectSuppress: false,
      });
    }

    const eraseIntent = guard.analyze(ERASE.q[lang]);
    add({
      kind: 'erase',
      topic: 'catalyst_stage_memory',
      client: ERASE.q[lang],
      model: actionReply(ERASE.bad[lang]),
      forbidden: [ERASE.forbid[lang]],
      expectPublic: true,
      expectSuppress: false,
      expectHedge: true,
      erase: true,
      classifierMemory: !!(eraseIntent.memory || eraseIntent.hedgeOnly),
    });

    const escalateClient =
      'Why was my payout rejected? My account number is ' + acct +
      ' and my email is ' + email + '. ' + topic.q[lang];
    add({
      kind: 'forward',
      topic: 'localized_forward',
      client: escalateClient,
      model:
        "ACTION: ESCALATE\nKIND: ACCOUNT\nCLIENT: I've sent this to a teammate for review. They have your account details and the chat context.\nBODY: Client says the payout was rejected.\nACTION_NEEDED: Please review the payout.",
      forbidden: [],
      expectPublic: true,
      expectSuppress: false,
      forward: true,
    });

    add({
      kind: 'defer',
      topic: 'defer_window',
      client: 'Any update on why my payout was rejected? ' + topic.q[lang],
      model: actionReply(topic.bad[lang]),
      forbidden: [topic.forbid[lang]],
      expectPublic: false,
      expectSuppress: true,
    });

    const own = ownerPlan(ti + li, lang);
    add({
      kind: 'owner',
      topic: 'owner_dictated',
      ownerNote: own.note,
      ownerForm: own.form,
      model: own.model || 'ACTION: NOTE\nBODY: Okay, noted.',
      forbidden: [own.forbid],
      expectPublic: true,
      expectSuppress: false,
      erase: /yesterday's earnings|کمائی محفوظ|earning reh jati/.test(own.note + ' ' + (own.model || '')),
    });
  }
}

const lockedBlobs = [];
for (const fact of guard.FACTS) {
  for (const text of Object.values(fact.body)) lockedBlobs.push(text);
}
for (const text of Object.values(guard.HEDGES)) lockedBlobs.push(text);
for (const text of Object.values(guard.TEAMMATE_FORWARD)) lockedBlobs.push(text);

const collisions = [];
for (const row of cases) {
  for (const snip of row.forbidden || []) {
    if (!snip) continue;
    for (const blob of lockedBlobs) {
      if (blob.includes(snip)) collisions.push({ id: row.id, snip, blob: blob.slice(0, 80) });
    }
  }
}
if (collisions.length) {
  console.error(JSON.stringify(collisions.slice(0, 12), null, 2));
  throw new Error('forbidden snippet collides with a locked body: ' + collisions.length);
}

const faqCases = cases.filter((c) => c.kind === 'faq').length;
const scripts = new Set(cases.map((c) => c.scriptId)).size;
const out = {
  sealVersion: 1,
  frozenCommit: 'd41437495687ae23c32d5e69594a249ed9cce8a7',
  review: 'payout-r16',
  languages: LANGS,
  scriptCount: scripts,
  caseCount: cases.length,
  faqCaseCount: faqCases,
  note: 'Independent sealed set. Owner-final rules override the Help Centre. Author tests and prior review reports were not inputs.',
  cases,
};

const dest = path.join(__dirname, 'sealed-cases.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ dest, scripts, cases: cases.length, faqCases, collisions: collisions.length }, null, 2));
