'use strict';

/**
 * T800 payout guard R20 — frozen synthetic candidate. Not approved.
 *
 * One final stage for every outbound public body, after other presend
 * rewriting. An exact locked sentence passes in the thread language. A body
 * with no payout or policy topic passes untouched. Any sentence that touches
 * a policy topic and is not itself an exact lock makes the whole body the
 * localized hedge. Catalyst erase or keep always hedges, including an empty
 * model turn. An empty body hedges. A defer window suppresses the send. A
 * hedge the guard itself emits, and a matched locked sentence, use the thread
 * language. A non-policy body is never rewritten: presend forward lines and
 * status lines pass byte for byte, greeting included. Localization of those
 * lines belongs at their source.
 *
 * R20 keeps the R19 final stage. The topic gate is per sentence and does not
 * require a second assertion. A menu, profile, chart, or browser co-mention
 * does not cancel a topic hit in that sentence. Baseline FAQ, forward, and
 * status bytes stay byte-identical. Known welcome prefixes are stripped only
 * to classify a lock or a baseline line. An empty body still hedges. A failed
 * postgate hedges. Instruction leaks are detected by concept in English,
 * Hindi, Arabic, Urdu, Roman Urdu, and Hinglish, on both the owner and
 * customer paths. Urdu مٹا/صاف and Arabic يحتفظ are not policy unless they
 * sit with a stage, profit, reset, or payout context.
 *
 * Not applied to index.js. The proposed hook is index.js.public-sends.diff.
 */

const crypto = require('crypto');
const LOCK = require('./approved.lock.json');

const STATUS = Object.freeze({
  candidate: 't800-payout-r20',
  frozen: true,
  approved: false,
  release: false,
});

const CORE_LANGS = new Set(['en', 'ur', 'roman', 'hi', 'ar', 'hinglish']);

const HEDGES = Object.freeze({
  en: "I can't confirm that. Our team will confirm.",
  ur: 'میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔',
  roman: 'Main is ki tasdeeq nahi kar sakta. Hamari team tasdeeq karegi.',
  hi: 'मैं इसकी पुष्टि नहीं कर सकता। हमारी टीम पुष्टि करेगी।',
  ar: 'لا أستطيع تأكيد ذلك. سيؤكد فريقنا ذلك.',
  hinglish: 'Main isko confirm nahi kar sakta. Hamari team confirm karegi.',
  fr: 'Je ne peux pas confirmer cela. Notre équipe va confirmer.',
  es: 'No puedo confirmar eso. Nuestro equipo lo confirmará.',
  ru: 'Я не могу это подтвердить. Наша команда подтвердит.',
});

const HEDGE_HASH = Object.freeze(LOCK.hedges);

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function fact(id, source, body) {
  const hash = LOCK[id];
  if (!hash) throw new Error('missing lock for ' + id);
  return { id, source, body, hash };
}

const FACTS = [
  fact('strategy_risk', 'owner_final', {
    en: 'A Strategy Risk or Risk Rule breach on a funded account is a soft breach with a reset. It does not terminate or close the account.',
    ur: 'فنڈڈ اکاؤنٹ پر اسٹریٹیجی رسک یا رسک رول کی خلاف ورزی نرم خلاف ورزی ہے اور اس کے ساتھ ری سیٹ ہوتا ہے۔ اس سے اکاؤنٹ ختم یا بند نہیں ہوتا۔',
    roman: 'Funded account par Strategy Risk ya Risk Rule ki breach ek soft breach hai aur is ke sath reset hota hai. Is se account khatam ya band nahi hota.',
    hi: 'फंडेड अकाउंट पर स्ट्रैटेजी रिस्क या रिस्क रूल की ब्रीच एक सॉफ्ट ब्रीच है और इसके साथ रीसेट होता है। इससे अकाउंट समाप्त या बंद नहीं होता।',
    ar: 'خرق مخاطر الاستراتيجية أو قاعدة المخاطر في الحساب الممول هو خرق بسيط مع إعادة تعيين. وهو لا ينهي الحساب ولا يغلقه.',
    hinglish: 'Funded account par Strategy Risk ya Risk Rule breach ek soft breach hai, reset ke saath. Isse account terminate ya close nahi hota.',
  }),
  fact('daily_loss_hard', '17437388', {
    en: 'Touching the daily loss limit or the max loss limit is a hard breach. A hard breach ends the account.',
    ur: 'ڈیلی لاس کی حد یا میکس لاس کی حد کو چھونا سخت خلاف ورزی ہے۔ سخت خلاف ورزی اکاؤنٹ ختم کر دیتی ہے۔',
    roman: 'Daily loss ki had ya max loss ki had ko chhuna hard breach hai. Hard breach account khatam kar deti hai.',
    hi: 'डेली लॉस की सीमा या मैक्स लॉस की सीमा को छूना हार्ड ब्रीच है। हार्ड ब्रीच अकाउंट समाप्त कर देती है।',
    ar: 'لمس حد الخسارة اليومية أو حد الخسارة القصوى هو خرق شديد. الخرق الشديد ينهي الحساب.',
    hinglish: 'Daily loss limit ya max loss limit ko touch karna hard breach hai. Hard breach account end kar deti hai.',
  }),
  fact('hard_breach', '17437388', {
    en: 'A hard breach ends the account. Hard breaches include touching the daily or max loss limit, fraud, KYC fraud or chargebacks, group trading or IP sharing, account management or passing services, scalp profit above the scalp limit in evaluation, and a repeated soft breach after a warning. In evaluation, a hard breach on 1-Step or 2-Step with Free Retry triggers the free retry automatically, unless the cause is fraud.',
    ur: 'سخت خلاف ورزی اکاؤنٹ ختم کر دیتی ہے۔ اس میں ڈیلی یا میکس لاس کی حد کو چھونا، فراڈ، کے وائی سی فراڈ یا چارج بیک، گروپ ٹریڈنگ یا آئی پی شیئرنگ، اکاؤنٹ مینجمنٹ یا پاسنگ سروس، ایویلیوایشن میں اسکیلپ حد سے زیادہ منافع، اور وارننگ کے بعد دہرائی گئی نرم خلاف ورزی شامل ہے۔ ایویلیوایشن میں 1-Step یا 2-Step پر فری ری ٹرائی کے ساتھ سخت خلاف ورزی خود بخود فری ری ٹرائی چلا دیتی ہے، سوائے فراڈ کے۔',
    roman: 'Hard breach account khatam kar deti hai. Is mein daily ya max loss ki had ko chhuna, fraud, KYC fraud ya chargeback, group trading ya IP sharing, account management ya passing service, evaluation mein scalp limit se zyada profit, aur warning ke baad dohrayi soft breach shamil hai. Evaluation mein 1-Step ya 2-Step par Free Retry ke sath hard breach khud Free Retry chala deti hai, fraud ke ilawa.',
    hi: 'हार्ड ब्रीच अकाउंट समाप्त कर देती है। इसमें डेली या मैक्स लॉस की सीमा को छूना, फ्रॉड, केवाईसी फ्रॉड या चार्जबैक, ग्रुप ट्रेडिंग या आईपी शेयरिंग, अकाउंट मैनेजमेंट या पासिंग सर्विस, इवैल्यूएशन में स्कैल्प सीमा से अधिक लाभ, और चेतावनी के बाद दोहराई गई सॉफ्ट ब्रीच शामिल है। इवैल्यूएशन में 1-Step या 2-Step पर फ्री रिट्राई के साथ हार्ड ब्रीच अपने आप फ्री रिट्राई चला देती है, फ्रॉड को छोड़कर।',
    ar: 'الخرق الشديد ينهي الحساب. ويشمل لمس حد الخسارة اليومية أو القصوى، والاحتيال، واحتيال التحقق من الهوية أو عمليات الاسترداد، والتداول الجماعي أو مشاركة عنوان الشبكة، وإدارة الحساب أو خدمات اجتياز التحدي، وربح السكالب فوق الحد في التقييم، وتكرار الخرق البسيط بعد التحذير. في التقييم، الخرق الشديد على 1-Step أو 2-Step مع إعادة المحاولة المجانية يشغلها تلقائيا، إلا إذا كان السبب احتيالا.',
    hinglish: 'Hard breach account end kar deti hai. Isme daily ya max loss limit ko touch karna, fraud, KYC fraud ya chargeback, group trading ya IP sharing, account management ya passing service, evaluation mein scalp limit se upar profit, aur warning ke baad repeated soft breach shamil hai. Evaluation mein 1-Step ya 2-Step par Free Retry wali hard breach apne aap Free Retry chala deti hai, fraud ko chhod kar.',
  }),
  fact('soft_kinds', '17437388', {
    en: 'A soft breach keeps the account open and you must correct your trading. It includes an isolated trade under the minimum holding time, scalp profit under the limit, an IP flag with an honest explanation, a hedging flag with no link to another trader, and a first case of gambling-style trading.',
    ur: 'نرم خلاف ورزی اکاؤنٹ کھلا رکھتی ہے اور آپ کو اپنی ٹریڈنگ درست کرنی ہوتی ہے۔ اس میں کم از کم ہولڈنگ وقت سے کم الگ ٹریڈ، حد سے کم اسکیلپ منافع، ایماندار وضاحت کے ساتھ آئی پی فلگ، کسی دوسرے ٹریڈر سے بغیر تعلق ہیجنگ فلگ، اور جوئے والی ٹریڈنگ کا پہلا کیس شامل ہے۔',
    roman: 'Soft breach account khula rakhti hai aur aap ko apni trading theek karni hoti hai. Is mein minimum holding time se kam alag trade, limit se kam scalp profit, imaandar wazahat ke sath IP flag, kisi doosre trader se baghair taaluq hedging flag, aur gambling style trading ka pehla case shamil hai.',
    hi: 'सॉफ्ट ब्रीच अकाउंट खुला रखती है और आपको अपनी ट्रेडिंग सुधारनी होती है। इसमें न्यूनतम होल्डिंग समय से कम अलग ट्रेड, सीमा से कम स्कैल्प लाभ, ईमानदार स्पष्टीकरण वाला आईपी फ्लैग, दूसरे ट्रेडर से बिना संबंध हेजिंग फ्लैग, और जुए जैसी ट्रेडिंग का पहला मामला शामिल है।',
    ar: 'الخرق البسيط يبقي الحساب مفتوحا ويجب تصحيح التداول. ويشمل صفقة منفردة تحت الحد الأدنى لوقت الاحتفاظ، وربح سكالب تحت الحد، وتنبيه عنوان شبكة مع تفسير صادق، وتنبيه تحوط بلا صلة بمتداول آخر، وأول حالة تداول بأسلوب المقامرة.',
    hinglish: 'Soft breach account open rakhti hai aur aapko apni trading theek karni hoti hai. Isme minimum holding time se kam isolated trade, limit se kam scalp profit, honest explanation wala IP flag, doosre trader se bina link hedging flag, aur gambling-style trading ka pehla case shamil hai.',
  }),
  fact('instrument_cap', '17437285', {
    en: 'On a funded account you may not risk more than 50% of your daily loss limit on the same instrument in one trading day. A 3% daily loss limit means 1.5% on that instrument, 4% means 2%, and 5% means 2.5%. Example: a 2-Step $100,000 account has a $2,500 limit. Trades of $1,000 and $1,500 on the same instrument reach that limit.',
    ur: 'فنڈڈ اکاؤنٹ پر آپ ایک ٹریڈنگ دن میں ایک ہی انسٹرومنٹ پر اپنی ڈیلی لاس حد کا 50% سے زیادہ رسک نہیں لے سکتے۔ 3% ڈیلی لاس حد کا مطلب اس انسٹرومنٹ پر 1.5% ہے، 4% کا مطلب 2% ہے، اور 5% کا مطلب 2.5% ہے۔ مثال: 2-Step $100,000 اکاؤنٹ کی حد $2,500 ہے۔ ایک ہی انسٹرومنٹ پر $1,000 اور $1,500 کی ٹریڈز اس حد تک پہنچ جاتی ہیں۔',
    roman: 'Funded account par aap ek trading din mein ek hi instrument par apni daily loss had ka 50% se zyada risk nahi le sakte. 3% daily loss had ka matlab us instrument par 1.5% hai, 4% ka matlab 2% hai, aur 5% ka matlab 2.5% hai. Misal: 2-Step $100,000 account ki had $2,500 hai. Ek hi instrument par $1,000 aur $1,500 ki trades us had tak pahunch jati hain.',
    hi: 'फंडेड अकाउंट पर आप एक ट्रेडिंग दिन में एक ही इंस्ट्रूमेंट पर अपनी डेली लॉस सीमा का 50% से अधिक जोखिम नहीं ले सकते। 3% डेली लॉस सीमा का अर्थ उस इंस्ट्रूमेंट पर 1.5% है, 4% का अर्थ 2% है, और 5% का अर्थ 2.5% है। उदाहरण: 2-Step $100,000 अकाउंट की सीमा $2,500 है। उसी इंस्ट्रूमेंट पर $1,000 और $1,500 के ट्रेड उस सीमा तक पहुँच जाते हैं।',
    ar: 'في الحساب الممول لا يجوز المخاطرة بأكثر من 50% من حد الخسارة اليومية على الأداة نفسها في يوم تداول واحد. حد 3% يعني 1.5% على تلك الأداة، و4% يعني 2%، و5% يعني 2.5%. مثال: حساب 2-Step بقيمة $100,000 حده $2,500. صفقات بقيمة $1,000 و$1,500 على الأداة نفسها تبلغ ذلك الحد.',
    hinglish: 'Funded account par aap ek trading day mein same instrument par apni daily loss limit ka 50% se zyada risk nahi le sakte. 3% daily loss limit ka matlab us instrument par 1.5% hai, 4% ka matlab 2% hai, aur 5% ka matlab 2.5% hai. Example: 2-Step $100,000 account ki limit $2,500 hai. Same instrument par $1,000 aur $1,500 ki trades us limit tak pahunch jati hain.',
  }),
  fact('soft_breach_payout', '17437398', {
    en: 'After a soft breach on a funded account, the account is not closed. The current payout is still processed at a 30% reward share, and the payout cycle restarts from payout 1, which also restarts the fee-refund count. If it happens again after the warning, the account can be reset and its profit forfeited. In evaluation, the team may reset the account using a free retry if you still have one.',
    ur: 'فنڈڈ اکاؤنٹ پر نرم خلاف ورزی کے بعد اکاؤنٹ بند نہیں ہوتا۔ موجودہ پے آؤٹ 30% ریوارڈ شیئر پر پھر بھی پراسیس ہوتا ہے، اور پے آؤٹ سائیکل پے آؤٹ 1 سے دوبارہ شروع ہوتا ہے، جس سے فیس ریفنڈ کی گنتی بھی دوبارہ شروع ہوتی ہے۔ اگر وارننگ کے بعد یہ دوبارہ ہو تو اکاؤنٹ ری سیٹ ہو سکتا ہے اور اس کا منافع ضبط ہو جاتا ہے۔ ایویلیوایشن میں ٹیم فری ری ٹرائی سے اکاؤنٹ ری سیٹ کر سکتی ہے اگر وہ ابھی دستیاب ہو۔',
    roman: 'Funded account par soft breach ke baad account band nahi hota. Mojooda payout 30% reward share par phir bhi process hota hai, aur payout cycle payout 1 se dobara shuru hota hai, jis se fee refund ki ginti bhi dobara shuru hoti hai. Agar warning ke baad yeh dobara ho to account reset ho sakta hai aur us ka profit forfeit ho jata hai. Evaluation mein team free retry se account reset kar sakti hai agar woh abhi maujood ho.',
    hi: 'फंडेड अकाउंट पर सॉफ्ट ब्रीच के बाद अकाउंट बंद नहीं होता। मौजूदा पेआउट 30% रिवॉर्ड शेयर पर फिर भी प्रोसेस होता है, और पेआउट चक्र पेआउट 1 से फिर शुरू होता है, जिससे फीस रिफंड की गिनती भी फिर शुरू होती है। यदि चेतावनी के बाद यह फिर हो तो अकाउंट रीसेट हो सकता है और उसका लाभ जब्त हो जाता है। इवैल्यूएशन में टीम फ्री रिट्राई से अकाउंट रीसेट कर सकती है यदि वह अभी उपलब्ध हो।',
    ar: 'بعد الخرق البسيط في الحساب الممول لا يُغلق الحساب. ويُعالج السحب الحالي بحصة مكافأة 30%، وتعيد دورة السحب البدء من السحب 1، وهذا يعيد أيضا عد استرداد الرسوم. إذا تكرر ذلك بعد التحذير يمكن إعادة تعيين الحساب ومصادرة ربحه. في التقييم قد تعيد الفريق تعيين الحساب باستخدام إعادة المحاولة المجانية إذا كانت لا تزال متاحة.',
    hinglish: 'Funded account par soft breach ke baad account close nahi hota. Current payout 30% reward share par phir bhi process hota hai, aur payout cycle payout 1 se restart hota hai, jis se fee refund ki count bhi restart hoti hai. Warning ke baad agar yeh phir ho to account reset ho sakta hai aur uska profit forfeit ho jata hai. Evaluation mein team free retry se account reset kar sakti hai agar woh abhi available ho.',
  }),
  fact('weekend_hold', '17437306', {
    en: 'You can always hold positions from Friday to Monday. Holding an open position over the weekend is allowed without the Weekend Trading add-on and allowed with the add-on. Moving your stop loss or take profit over the weekend is allowed without the Weekend Trading add-on and allowed with the add-on. Closing a position over the weekend, including a stop loss or take profit being hit, is a violation without the Weekend Trading add-on and is allowed only with the add-on.',
    ur: 'آپ جمعہ سے پیر تک پوزیشن ہمیشہ ہولڈ کر سکتے ہیں۔ ویک اینڈ پر کھلی پوزیشن ہولڈ کرنا ویک اینڈ ٹریڈنگ ایڈ آن کے بغیر بھی جائز ہے اور ایڈ آن کے ساتھ بھی جائز ہے۔ ویک اینڈ پر سٹاپ لاس یا ٹیک پرافٹ ہلانا ایڈ آن کے بغیر بھی جائز ہے اور ایڈ آن کے ساتھ بھی جائز ہے۔ ویک اینڈ پر پوزیشن بند کرنا، بشمول سٹاپ لاس یا ٹیک پرافٹ لگنا، ایڈ آن کے بغیر خلاف ورزی ہے اور صرف ایڈ آن کے ساتھ جائز ہے۔',
    roman: 'Aap Jumma se Peer tak position hamesha hold kar sakte hain. Weekend par khuli position hold karna Weekend Trading add-on ke baghair bhi allowed hai aur add-on ke sath bhi allowed hai. Weekend par stop loss ya take profit hilana add-on ke baghair bhi allowed hai aur add-on ke sath bhi allowed hai. Weekend par position band karna, shamil stop loss ya take profit lagna, add-on ke baghair violation hai aur sirf add-on ke sath allowed hai.',
    hi: 'आप शुक्रवार से सोमवार तक पोजीशन हमेशा होल्ड कर सकते हैं। वीकएंड पर खुली पोजीशन होल्ड करना वीकएंड ट्रेडिंग ऐड-ऑन के बिना भी अनुमत है और ऐड-ऑन के साथ भी अनुमत है। वीकएंड पर स्टॉप लॉस या टेक प्रॉफिट हिलाना ऐड-ऑन के बिना भी अनुमत है और ऐड-ऑन के साथ भी अनुमत है। वीकएंड पर पोजीशन बंद करना, जिसमें स्टॉप लॉस या टेक प्रॉफिट लगना शामिल है, ऐड-ऑन के बिना उल्लंघन है और केवल ऐड-ऑन के साथ अनुमत है।',
    ar: 'يمكنك دائما إبقاء الصفقات من الجمعة إلى الاثنين. إبقاء صفقة مفتوحة خلال نهاية الأسبوع مسموح دون إضافة تداول نهاية الأسبوع ومسموح مع الإضافة. وتحريك وقف الخسارة أو جني الربح خلال نهاية الأسبوع مسموح دون الإضافة ومسموح مع الإضافة. وإغلاق صفقة خلال نهاية الأسبوع، بما في ذلك وصول وقف الخسارة أو جني الربح، مخالفة دون إضافة تداول نهاية الأسبوع ومسموح فقط مع الإضافة.',
    hinglish: 'Aap Friday se Monday tak position hamesha hold kar sakte ho. Weekend par open position hold karna Weekend Trading add-on ke bina bhi allowed hai aur add-on ke saath bhi allowed hai. Weekend par stop loss ya take profit move karna add-on ke bina bhi allowed hai aur add-on ke saath bhi allowed hai. Weekend par position close karna, including stop loss ya take profit hit hona, add-on ke bina violation hai aur sirf add-on ke saath allowed hai.',
  }),
  fact('weekend_trade', '17437306', {
    en: 'Trading on Saturday or Sunday needs the Weekend Trading add-on. Opening a new position without the add-on is a violation. With the add-on it is allowed. A fill on Saturday or Sunday counts as weekend trading. In evaluation the account may be reset with a free retry or reinstated. On a funded account it is reset and the current cycle\'s profit is forfeited.',
    ur: 'ہفتہ یا اتوار کو ٹریڈنگ کے لیے ویک اینڈ ٹریڈنگ ایڈ آن چاہیے۔ ایڈ آن کے بغیر نئی پوزیشن کھولنا خلاف ورزی ہے۔ ایڈ آن کے ساتھ یہ جائز ہے۔ ہفتہ یا اتوار کو فل ہونا ویک اینڈ ٹریڈنگ شمار ہوتا ہے۔ ایویلیوایشن میں اکاؤنٹ فری ری ٹرائی سے ری سیٹ ہو سکتا ہے یا بحال ہو سکتا ہے۔ فنڈڈ اکاؤنٹ پر یہ ری سیٹ ہوتا ہے اور موجودہ سائیکل کا منافع ضبط ہوتا ہے۔',
    roman: 'Hafta ya Itwar ko trading ke liye Weekend Trading add-on chahiye. Add-on ke baghair nayi position kholna violation hai. Add-on ke sath yeh allowed hai. Hafta ya Itwar ko fill hona weekend trading shumar hota hai. Evaluation mein account free retry se reset ho sakta hai ya bahal ho sakta hai. Funded account par yeh reset hota hai aur mojooda cycle ka profit forfeit hota hai.',
    hi: 'शनिवार या रविवार को ट्रेडिंग के लिए वीकएंड ट्रेडिंग ऐड-ऑन चाहिए। ऐड-ऑन के बिना नई पोजीशन खोलना उल्लंघन है। ऐड-ऑन के साथ यह अनुमत है। शनिवार या रविवार को फिल होना वीकएंड ट्रेडिंग गिना जाता है। इवैल्यूएशन में अकाउंट फ्री रिट्राई से रीसेट हो सकता है या बहाल हो सकता है। फंडेड अकाउंट पर यह रीसेट होता है और मौजूदा चक्र का लाभ जब्त होता है।',
    ar: 'التداول يوم السبت أو الأحد يحتاج إضافة تداول نهاية الأسبوع. فتح صفقة جديدة دون الإضافة مخالفة. ومع الإضافة هو مسموح. والتنفيذ يوم السبت أو الأحد يُحسب تداول نهاية أسبوع. في التقييم قد يُعاد تعيين الحساب بإعادة محاولة مجانية أو يُعاد. وفي الحساب الممول يُعاد تعيينه ويُصادر ربح الدورة الحالية.',
    hinglish: 'Saturday ya Sunday ko trading ke liye Weekend Trading add-on chahiye. Add-on ke bina nayi position kholna violation hai. Add-on ke saath yeh allowed hai. Saturday ya Sunday ko fill hona weekend trading count hota hai. Evaluation mein account free retry se reset ho sakta hai ya reinstate ho sakta hai. Funded account par yeh reset hota hai aur current cycle ka profit forfeit hota hai.',
  }),
  fact('rise_fee', '17437354', {
    en: 'Rise is available for withdrawals of $500 or more. The fee is $40 per withdrawal. A $4,800 reward through Rise arrives as $4,760.',
    ur: 'Rise $500 یا اس سے زیادہ کی ودڈرال کے لیے دستیاب ہے۔ فیس ہر ودڈرال پر $40 ہے۔ Rise کے ذریعے $4,800 ریوارڈ $4,760 بن کر پہنچتا ہے۔',
    roman: 'Rise $500 ya is se zyada ki withdrawal ke liye available hai. Fee har withdrawal par $40 hai. Rise ke zariye $4,800 reward $4,760 ban kar pohanchta hai.',
    hi: 'Rise $500 या उससे अधिक की निकासी के लिए उपलब्ध है। शुल्क हर निकासी पर $40 है। Rise के जरिए $4,800 रिवॉर्ड $4,760 बनकर पहुँचता है।',
    ar: 'Rise متاح لعمليات السحب بقيمة $500 أو أكثر. الرسم $40 عن كل سحب. مكافأة $4,800 عبر Rise تصل بقيمة $4,760.',
    hinglish: 'Rise $500 ya usse zyada ki withdrawal ke liye available hai. Fee har withdrawal par $40 hai. Rise se $4,800 reward $4,760 ban kar aata hai.',
  }),
  fact('crypto_fee', '17437354', {
    en: 'Crypto (USDC) is available for any amount and is the only method below $500. The fee is 3% of the amount. A $400 crypto reward arrives as $388.',
    ur: 'کرپٹو (USDC) کسی بھی رقم کے لیے دستیاب ہے اور $500 سے کم کی واحد صورت ہے۔ فیس رقم کا 3% ہے۔ $400 کرپٹو ریوارڈ $388 بن کر پہنچتا ہے۔',
    roman: 'Crypto (USDC) kisi bhi raqam ke liye available hai aur $500 se kam ki wahid surat hai. Fee raqam ka 3% hai. $400 crypto reward $388 ban kar pohanchta hai.',
    hi: 'क्रिप्टो (USDC) किसी भी राशि के लिए उपलब्ध है और $500 से कम की एकमात्र विधि है। शुल्क राशि का 3% है। $400 क्रिप्टो रिवॉर्ड $388 बनकर पहुँचता है।',
    ar: 'العملات المشفرة (USDC) متاحة لأي مبلغ وهي الطريقة الوحيدة تحت $500. الرسم 3% من المبلغ. مكافأة كريبتو بقيمة $400 تصل بقيمة $388.',
    hinglish: 'Crypto (USDC) kisi bhi amount ke liye available hai aur $500 se neeche ka only method hai. Fee amount ka 3% hai. $400 crypto reward $388 ban kar aata hai.',
  }),
  fact('payout_timing', '17437354', {
    en: 'Approved rewards are paid within 5 business days of approval. Bank transfers then take 1 to 3 days. Crypto usually arrives within hours. If a review is needed first, it is finished within 30 days. In some cases the reward is paid back to the original payment method, and you are told before it is sent.',
    ur: 'منظور شدہ ریوارڈ منظوری کے 5 کاروباری دنوں میں ادا ہوتا ہے۔ بینک ٹرانسفر پھر 1 سے 3 دن لیتی ہے۔ کرپٹو عموماً چند گھنٹوں میں پہنچ جاتا ہے۔ اگر پہلے جائزہ چاہیے تو وہ 30 دن میں مکمل ہوتا ہے۔ کچھ صورتوں میں ریوارڈ اصل ادائیگی کے طریقے پر واپس جاتا ہے، اور بھیجنے سے پہلے آپ کو بتایا جاتا ہے۔',
    roman: 'Manzoor shuda reward manzoori ke 5 business days mein ada hota hai. Bank transfer phir 1 se 3 din leti hai. Crypto aam tor par chand ghanton mein pohanch jata hai. Agar pehle review chahiye to woh 30 din mein mukammal hota hai. Kuch sooraton mein reward asal payment method par wapas jata hai, aur bhejne se pehle aap ko bataya jata hai.',
    hi: 'स्वीकृत रिवॉर्ड स्वीकृति के 5 कार्यदिवसों में दिया जाता है। बैंक ट्रांसफर फिर 1 से 3 दिन लेता है। क्रिप्टो आमतौर पर कुछ घंटों में पहुँच जाता है। यदि पहले समीक्षा चाहिए तो वह 30 दिनों में पूरी होती है। कुछ मामलों में रिवॉर्ड मूल भुगतान विधि पर वापस जाता है, और भेजने से पहले आपको बताया जाता है।',
    ar: 'تُدفع المكافآت المعتمدة خلال 5 أيام عمل من الاعتماد. ثم يستغرق التحويل البنكي من 1 إلى 3 أيام. وتصل العملات المشفرة عادة خلال ساعات. وإذا لزم مراجعة أولا فإنها تُنجز خلال 30 يوما. وفي بعض الحالات تُعاد المكافأة إلى طريقة الدفع الأصلية، ويُبلّغك قبل الإرسال.',
    hinglish: 'Approved reward approval ke 5 business days mein pay hota hai. Bank transfer phir 1 se 3 days leti hai. Crypto usually kuch hours mein aa jata hai. Agar pehle review chahiye to woh 30 days mein finish hota hai. Kuch cases mein reward original payment method par wapas jata hai, aur bhejne se pehle aapko bataya jata hai.',
  }),
  fact('catalyst_rules', '17437215', {
    en: 'On every Catalyst stage the profit target is 8% of the stage balance, with options of 5%, 8%, and 10%, and there is no time limit. The daily loss limit is 3%, based on the higher of yesterday\'s closing balance or equity. Max loss is trailing equity: 6% on the $25,000 stage and 5% from $50,000 up. It rises with equity and never moves down. You need 5 profitable days, each with at least one trade and the stage\'s minimum P&L. The consistency rule is 30% and can be removed at checkout. Weekend trading is not allowed. The first payout is after 14 days, then every 7, 14, or 21 days as chosen at checkout.',
    ur: 'ہر Catalyst مرحلے پر منافع کا ہدف مرحلے کے بیلنس کا 8% ہے، اختیارات 5%، 8% اور 10% ہیں، اور وقت کی حد نہیں۔ ڈیلی لاس حد 3% ہے، کل کے اختتامی بیلنس یا ایکویٹی میں سے جو زیادہ ہو۔ میکس لاس ٹریلنگ ایکویٹی ہے: $25,000 مرحلے پر 6% اور $50,000 سے اوپر 5%۔ یہ ایکویٹی کے ساتھ بڑھتی ہے اور نیچے نہیں جاتی۔ 5 منافع بخش دن چاہییں، ہر دن کم از کم ایک ٹریڈ اور مرحلے کا کم از کم پی اینڈ ایل۔ مستقل مزاجی کا قاعدہ 30% ہے اور چیک آؤٹ پر ہٹایا جا سکتا ہے۔ ویک اینڈ ٹریڈنگ جائز نہیں۔ پہلا پے آؤٹ 14 دن بعد ہے، پھر چیک آؤٹ پر منتخب 7، 14 یا 21 دن۔',
    roman: 'Har Catalyst stage par profit target stage balance ka 8% hai, options 5%, 8% aur 10% hain, aur time limit nahi. Daily loss had 3% hai, kal ke closing balance ya equity mein se jo zyada ho. Max loss trailing equity hai: $25,000 stage par 6% aur $50,000 se upar 5%. Yeh equity ke sath barhti hai aur neeche nahi jati. 5 profitable days chahiye, har din kam az kam ek trade aur stage ka minimum P&L. Consistency rule 30% hai aur checkout par hata ya ja sakta hai. Weekend trading allowed nahi. Pehla payout 14 din baad hai, phir checkout par chune gaye 7, 14 ya 21 din.',
    hi: 'हर Catalyst चरण पर लाभ लक्ष्य चरण बैलेंस का 8% है, विकल्प 5%, 8% और 10% हैं, और समय सीमा नहीं है। डेली लॉस सीमा 3% है, कल के समापन बैलेंस या इक्विटी में से जो अधिक हो। मैक्स लॉस ट्रेलिंग इक्विटी है: $25,000 चरण पर 6% और $50,000 से ऊपर 5%। यह इक्विटी के साथ बढ़ती है और नीचे नहीं जाती। 5 लाभ वाले दिन चाहिए, हर दिन कम से कम एक ट्रेड और चरण का न्यूनतम पी एंड एल। कंसिस्टेंसी नियम 30% है और चेकआउट पर हटाया जा सकता है। वीकएंड ट्रेडिंग अनुमत नहीं। पहला पेआउट 14 दिन बाद है, फिर चेकआउट पर चुने गए 7, 14 या 21 दिन।',
    ar: 'في كل مرحلة من Catalyst هدف الربح 8% من رصيد المرحلة، والخيارات 5% و8% و10%، ولا حد زمني. حد الخسارة اليومية 3%، بحسب الأعلى بين رصيد إغلاق الأمس أو حقوق الملكية. الخسارة القصوى حقوق ملكية متحركة: 6% في مرحلة $25,000 و5% من $50,000 فصاعدا. ترتفع مع حقوق الملكية ولا تنخفض. تحتاج 5 أيام رابحة، كل يوم صفقة واحدة على الأقل والحد الأدنى لأرباح المرحلة. قاعدة الاتساق 30% ويمكن إزالتها عند الدفع. تداول نهاية الأسبوع غير مسموح. أول سحب بعد 14 يوما، ثم كل 7 أو 14 أو 21 يوما حسب الاختيار عند الدفع.',
    hinglish: 'Har Catalyst stage par profit target stage balance ka 8% hai, options 5%, 8% aur 10% hain, aur koi time limit nahi. Daily loss limit 3% hai, yesterday ke closing balance ya equity mein se jo higher ho. Max loss trailing equity hai: $25,000 stage par 6% aur $50,000 se upar 5%. Yeh equity ke saath upar jati hai aur neeche nahi aati. 5 profitable days chahiye, har din kam se kam ek trade aur stage ka minimum P&L. Consistency rule 30% hai aur checkout par hata sakte ho. Weekend trading allowed nahi. Pehla payout 14 days baad hai, phir checkout par choose kiye 7, 14 ya 21 days.',
  }),
  fact('catalyst_ladder', '17437215', {
    en: 'Catalyst doubles after every approved payout, up to a $1,000,000 account and a 95% reward share. Stage 1 is $25,000, 80% share, $150 minimum P&L per profitable day, and no reset. Stage 2 is $50,000, 85%, $250, reset $890. Stage 3 is $100,000, 90%, $350, reset $1,290. Stage 4 is $200,000, 95%, $450, reset $1,790. Stage 5 is $400,000, 95%, $650, reset $2,490. Stage 6 is $800,000, 95%, $850, reset $3,390. Stage 7 is $1,000,000, 95%, $1,000, reset $4,790. Starting from $50,000 begins at stage 2 with an 80% share, rising 5 points per approved payout up to 95%.',
    ur: 'Catalyst ہر منظور شدہ پے آؤٹ کے بعد دگنا ہوتا ہے، $1,000,000 اکاؤنٹ اور 95% ریوارڈ شیئر تک۔ مرحلہ 1 $25,000 ہے، 80% شیئر، منافع بخش دن پر $150 کم از کم پی اینڈ ایل، اور کوئی ری سیٹ نہیں۔ مرحلہ 2 $50,000، 85%، $250، ری سیٹ $890۔ مرحلہ 3 $100,000، 90%، $350، ری سیٹ $1,290۔ مرحلہ 4 $200,000، 95%، $450، ری سیٹ $1,790۔ مرحلہ 5 $400,000، 95%، $650، ری سیٹ $2,490۔ مرحلہ 6 $800,000، 95%، $850، ری سیٹ $3,390۔ مرحلہ 7 $1,000,000، 95%، $1,000، ری سیٹ $4,790۔ $50,000 سے آغاز مرحلہ 2 پر 80% شیئر سے ہوتا ہے، جو ہر منظور شدہ پے آؤٹ پر 5 پوائنٹ بڑھ کر 95% تک جاتا ہے۔',
    roman: 'Catalyst har manzoor payout ke baad double hota hai, $1,000,000 account aur 95% reward share tak. Stage 1 $25,000 hai, 80% share, profitable day par $150 minimum P&L, aur koi reset nahi. Stage 2 $50,000, 85%, $250, reset $890. Stage 3 $100,000, 90%, $350, reset $1,290. Stage 4 $200,000, 95%, $450, reset $1,790. Stage 5 $400,000, 95%, $650, reset $2,490. Stage 6 $800,000, 95%, $850, reset $3,390. Stage 7 $1,000,000, 95%, $1,000, reset $4,790. $50,000 se shuruat stage 2 par 80% share se hoti hai, jo har manzoor payout par 5 points barh kar 95% tak jati hai.',
    hi: 'Catalyst हर स्वीकृत पेआउट के बाद दोगुना होता है, $1,000,000 अकाउंट और 95% रिवॉर्ड शेयर तक। चरण 1 $25,000 है, 80% शेयर, लाभ वाले दिन $150 न्यूनतम पी एंड एल, और कोई रीसेट नहीं। चरण 2 $50,000, 85%, $250, रीसेट $890। चरण 3 $100,000, 90%, $350, रीसेट $1,290। चरण 4 $200,000, 95%, $450, रीसेट $1,790। चरण 5 $400,000, 95%, $650, रीसेट $2,490। चरण 6 $800,000, 95%, $850, रीसेट $3,390। चरण 7 $1,000,000, 95%, $1,000, रीसेट $4,790। $50,000 से शुरुआत चरण 2 पर 80% शेयर से होती है, जो हर स्वीकृत पेआउट पर 5 अंक बढ़कर 95% तक जाती है।',
    ar: 'يتضاعف Catalyst بعد كل سحب معتمد، حتى حساب $1,000,000 وحصة مكافأة 95%. المرحلة 1 هي $25,000 وحصة 80% وحد أدنى $150 للأرباح في اليوم الرابح، وبلا إعادة تعيين. المرحلة 2 $50,000 و85% و$250 وإعادة تعيين $890. المرحلة 3 $100,000 و90% و$350 وإعادة تعيين $1,290. المرحلة 4 $200,000 و95% و$450 وإعادة تعيين $1,790. المرحلة 5 $400,000 و95% و$650 وإعادة تعيين $2,490. المرحلة 6 $800,000 و95% و$850 وإعادة تعيين $3,390. المرحلة 7 $1,000,000 و95% و$1,000 وإعادة تعيين $4,790. البدء من $50,000 يبدأ عند المرحلة 2 بحصة 80%، ترتفع 5 نقاط مع كل سحب معتمد حتى 95%.',
    hinglish: 'Catalyst har approved payout ke baad double hota hai, $1,000,000 account aur 95% reward share tak. Stage 1 $25,000 hai, 80% share, profitable day par $150 minimum P&L, aur no reset. Stage 2 $50,000, 85%, $250, reset $890. Stage 3 $100,000, 90%, $350, reset $1,290. Stage 4 $200,000, 95%, $450, reset $1,790. Stage 5 $400,000, 95%, $650, reset $2,490. Stage 6 $800,000, 95%, $850, reset $3,390. Stage 7 $1,000,000, 95%, $1,000, reset $4,790. $50,000 se start stage 2 par 80% share se hota hai, jo har approved payout par 5 points badh kar 95% tak jata hai.',
  }),
  fact('catalyst_reopen', '17437215', {
    en: 'Each approved Catalyst payout closes the account and opens a fresh one at double the size, with new limits. This is automatic, or done by the team within 24 hours.',
    ur: 'ہر منظور شدہ Catalyst پے آؤٹ اکاؤنٹ بند کر کے دگنے سائز کا نیا اکاؤنٹ کھولتا ہے، نئی حدود کے ساتھ۔ یہ خودکار ہے، یا ٹیم 24 گھنٹوں میں کرتی ہے۔',
    roman: 'Har manzoor Catalyst payout account band kar ke dugne size ka naya account kholta hai, nayi hadon ke sath. Yeh automatic hai, ya team 24 ghanton mein karti hai.',
    hi: 'हर स्वीकृत Catalyst पेआउट अकाउंट बंद करके दोगुने आकार का नया अकाउंट खोलता है, नई सीमाओं के साथ। यह स्वचालित है, या टीम 24 घंटों में करती है।',
    ar: 'كل سحب Catalyst معتمد يغلق الحساب ويفتح حسابا جديدا بضعف الحجم وبحدود جديدة. وهذا تلقائي، أو تنفذه الفريق خلال 24 ساعة.',
    hinglish: 'Har approved Catalyst payout account close karke double size ka naya account kholta hai, nayi limits ke saath. Yeh automatic hai, ya team 24 hours mein karti hai.',
  }),
  fact('catalyst_stage_reset', '17437215', {
    en: 'If you breach after your first Catalyst stage, you can buy one reset at that stage instead of starting over. Your first stage, the $25,000 or $50,000 account you bought, has no reset.',
    ur: 'اگر آپ پہلے Catalyst مرحلے کے بعد خلاف ورزی کریں تو شروع سے شروع کرنے کے بجائے اسی مرحلے پر ایک ری سیٹ خرید سکتے ہیں۔ آپ کا پہلا مرحلہ، جو $25,000 یا $50,000 اکاؤنٹ آپ نے خریدا، اس پر ری سیٹ نہیں۔',
    roman: 'Agar aap pehle Catalyst stage ke baad breach karein to shuru se shuru karne ke bajaye usi stage par ek reset khareed sakte hain. Aap ka pehla stage, jo $25,000 ya $50,000 account aap ne kharida, us par reset nahi.',
    hi: 'यदि आप पहले Catalyst चरण के बाद ब्रीच करें तो शुरू से शुरू करने के बजाय उसी चरण पर एक रीसेट खरीद सकते हैं। आपका पहला चरण, जो $25,000 या $50,000 अकाउंट आपने खरीदा, उस पर रीसेट नहीं है।',
    ar: 'إذا خرقت القواعد بعد أول مرحلة في Catalyst فيمكنك شراء إعادة تعيين واحدة في تلك المرحلة بدلا من البدء من جديد. مرحلتك الأولى، حساب $25,000 أو $50,000 الذي اشتريته، بلا إعادة تعيين.',
    hinglish: 'Agar aap pehle Catalyst stage ke baad breach karein to start over karne ke bajaye usi stage par ek reset khareed sakte ho. Aapka pehla stage, jo $25,000 ya $50,000 account aapne kharida, us par no reset hai.',
  }),
  fact('reset_eligibility', '17437410', {
    en: 'A funded reset is allowed only while the account is at breakeven or in profit. It is not allowed in a loss or in drawdown.',
    ur: 'فنڈڈ ری سیٹ صرف تب جائز ہے جب اکاؤنٹ بریک ایون پر ہو یا منافع میں ہو۔ نقصان یا ڈرا ڈاؤن میں یہ جائز نہیں۔',
    roman: 'Funded reset sirf tab allowed hai jab account breakeven par ho ya profit mein ho. Nuqsan ya drawdown mein yeh allowed nahi.',
    hi: 'फंडेड रीसेट केवल तभी अनुमत है जब अकाउंट ब्रेकईवन पर हो या लाभ में हो। हानि या ड्रॉडाउन में यह अनुमत नहीं।',
    ar: 'إعادة تعيين الحساب الممول مسموحة فقط عندما يكون الحساب عند التعادل أو في ربح. وهي غير مسموحة في خسارة أو في تراجع.',
    hinglish: 'Funded reset sirf tab allowed hai jab account breakeven par ho ya profit mein ho. Loss ya drawdown mein yeh allowed nahi.',
  }),
  fact('reset_count', '17437410', {
    en: 'A funded account can be reset up to 3 times.',
    ur: 'فنڈڈ اکاؤنٹ کو 3 بار تک ری سیٹ کیا جا سکتا ہے۔',
    roman: 'Funded account ko 3 bar tak reset kiya ja sakta hai.',
    hi: 'फंडेड अकाउंट को 3 बार तक रीसेट किया जा सकता है।',
    ar: 'يمكن إعادة تعيين الحساب الممول حتى 3 مرات.',
    hinglish: 'Funded account ko 3 times tak reset kiya ja sakta hai.',
  }),
  fact('reset_price', '17437410', {
    en: 'The first funded reset is 40% of the original challenge price before discounts, including add-ons, with a minimum of $10. The second reset doubles the first. The third reset doubles the second. Example: a 1-Step $100,000 account bought at $569 resets for $228, then $456, then $912.',
    ur: 'پہلا فنڈڈ ری سیٹ اصل چیلنج قیمت کا 40% ہے، رعایت سے پہلے، ایڈ آن سمیت، کم از کم $10۔ دوسرا ری سیٹ پہلے کو دگنا کرتا ہے۔ تیسرا ری سیٹ دوسرے کو دگنا کرتا ہے۔ مثال: $569 پر خریدا 1-Step $100,000 اکاؤنٹ $228، پھر $456، پھر $912 میں ری سیٹ ہوتا ہے۔',
    roman: 'Pehla funded reset asal challenge price ka 40% hai, discount se pehle, add-on samet, kam az kam $10. Doosra reset pehle ko double karta hai. Teesra reset doosre ko double karta hai. Misal: $569 par kharida 1-Step $100,000 account $228, phir $456, phir $912 mein reset hota hai.',
    hi: 'पहला फंडेड रीसेट मूल चैलेंज कीमत का 40% है, छूट से पहले, ऐड-ऑन सहित, न्यूनतम $10। दूसरा रीसेट पहले को दोगुना करता है। तीसरा रीसेट दूसरे को दोगुना करता है। उदाहरण: $569 पर खरीदा 1-Step $100,000 अकाउंट $228, फिर $456, फिर $912 में रीसेट होता है।',
    ar: 'أول إعادة تعيين ممولة هي 40% من سعر التحدي الأصلي قبل الخصومات، شاملا الإضافات، بحد أدنى $10. الثانية تضاعف الأولى. الثالثة تضاعف الثانية. مثال: حساب 1-Step بقيمة $100,000 اشتُري بـ $569 يُعاد تعيينه مقابل $228 ثم $456 ثم $912.',
    hinglish: 'Pehla funded reset original challenge price ka 40% hai, discount se pehle, add-ons samet, minimum $10. Second reset pehle ko double karta hai. Third reset second ko double karta hai. Example: $569 par kharida 1-Step $100,000 account $228, phir $456, phir $912 mein reset hota hai.',
  }),
  fact('reset_where', '17437410', {
    en: 'You can reset a funded account from Trading Objectives on the dashboard. The Reset options button sits next to Credentials. It shows the next reset price, or it shows No reset options on this account.',
    ur: 'آپ فنڈڈ اکاؤنٹ کو ڈیش بورڈ پر ٹریڈنگ آبجیکٹوز سے ری سیٹ کر سکتے ہیں۔ ری سیٹ آپشنز کا بٹن کریڈینشلز کے پاس ہے۔ یہ اگلی ری سیٹ قیمت دکھاتا ہے، یا دکھاتا ہے کہ اس اکاؤنٹ پر کوئی ری سیٹ آپشن نہیں۔',
    roman: 'Aap funded account ko dashboard par Trading Objectives se reset kar sakte hain. Reset options ka button Credentials ke paas hai. Yeh agli reset price dikhata hai, ya dikhata hai ke is account par koi reset option nahi.',
    hi: 'आप फंडेड अकाउंट को डैशबोर्ड पर ट्रेडिंग ऑब्जेक्टिव्स से रीसेट कर सकते हैं। रीसेट ऑप्शन बटन क्रेडेंशियल्स के पास है। यह अगली रीसेट कीमत दिखाता है, या दिखाता है कि इस अकाउंट पर कोई रीसेट विकल्प नहीं।',
    ar: 'يمكنك إعادة تعيين الحساب الممول من أهداف التداول في لوحة التحكم. زر خيارات إعادة التعيين بجانب بيانات الدخول. ويعرض سعر إعادة التعيين التالية، أو يعرض أنه لا توجد خيارات إعادة تعيين في هذا الحساب.',
    hinglish: 'Aap funded account ko dashboard par Trading Objectives se reset kar sakte ho. Reset options ka button Credentials ke paas hai. Yeh next reset price dikhata hai, ya dikhata hai No reset options on this account.',
  }),
  fact('reset_previous', '17437410', {
    en: 'A reset gives a fresh funded account. Profit from the previous cycle is not paid.',
    ur: 'ری سیٹ ایک نیا فنڈڈ اکاؤنٹ دیتا ہے۔ پچھلے سائیکل کا منافع ادا نہیں ہوتا۔',
    roman: 'Reset ek naya funded account deta hai. Pichle cycle ka profit ada nahi hota.',
    hi: 'रीसेट एक नया फंडेड अकाउंट देता है। पिछले चक्र का लाभ नहीं दिया जाता।',
    ar: 'إعادة التعيين تمنح حسابا ممولا جديدا. ربح الدورة السابقة لا يُدفع.',
    hinglish: 'Reset ek naya funded account deta hai. Previous cycle ka profit pay nahi hota.',
  }),
  fact('fee_refund', '17437366', {
    en: 'On 1-Step, 2-Step, LITE 1-Step, and LITE 2-Step, the challenge fee is refunded with the third payout if you passed the evaluation on the first attempt with no Free Retry, never reset the account, and had no soft breach in those three payout cycles. A soft breach restarts the count, so three more clean payouts are needed. Instant, Instant Elite, Flash Activation, and Catalyst have no fee refund.',
    ur: '1-Step، 2-Step، LITE 1-Step اور LITE 2-Step پر چیلنج فیس تیسرے پے آؤٹ کے ساتھ واپس ہوتی ہے اگر آپ نے پہلی کوشش میں ایویلیوایشن پاس کی ہو، فری ری ٹرائی استعمال نہ ہوئی ہو، اکاؤنٹ کبھی ری سیٹ نہ ہوا ہو، اور ان تین پے آؤٹ سائیکلوں میں نرم خلاف ورزی نہ ہوئی ہو۔ نرم خلاف ورزی گنتی دوبارہ شروع کرتی ہے، اس لیے تین مزید صاف پے آؤٹ چاہییں۔ Instant، Instant Elite، Flash Activation اور Catalyst پر فیس ریفنڈ نہیں۔',
    roman: '1-Step, 2-Step, LITE 1-Step aur LITE 2-Step par challenge fee teesre payout ke sath wapas hoti hai agar aap ne pehli koshish mein evaluation pass ki ho, Free Retry use na hui ho, account kabhi reset na hua ho, aur in teen payout cycles mein soft breach na hui ho. Soft breach ginti dobara shuru karti hai, is liye teen mazeed saaf payout chahiye. Instant, Instant Elite, Flash Activation aur Catalyst par fee refund nahi.',
    hi: '1-Step, 2-Step, LITE 1-Step और LITE 2-Step पर चैलेंज फीस तीसरे पेआउट के साथ वापस होती है यदि आपने पहली कोशिश में इवैल्यूएशन पास किया हो, फ्री रिट्राई उपयोग न हुई हो, अकाउंट कभी रीसेट न हुआ हो, और उन तीन पेआउट चक्रों में सॉफ्ट ब्रीच न हुई हो। सॉफ्ट ब्रीच गिनती फिर शुरू करती है, इसलिए तीन और साफ पेआउट चाहिए। Instant, Instant Elite, Flash Activation और Catalyst पर फीस रिफंड नहीं।',
    ar: 'في 1-Step و2-Step وLITE 1-Step وLITE 2-Step تُرد رسوم التحدي مع السحب الثالث إذا اجتزت التقييم من المحاولة الأولى دون إعادة محاولة مجانية، ولم تُعد تعيين الحساب أبدا، ولم يحدث خرق بسيط في دورات السحب الثلاث. الخرق البسيط يعيد العد، فتحتاج ثلاثة سحوبات نظيفة إضافية. Instant وInstant Elite وFlash Activation وCatalyst بلا استرداد رسوم.',
    hinglish: '1-Step, 2-Step, LITE 1-Step aur LITE 2-Step par challenge fee third payout ke saath refund hoti hai agar aapne first attempt mein evaluation pass kiya, Free Retry use nahi hui, account kabhi reset nahi hua, aur un teen payout cycles mein soft breach nahi hui. Soft breach count restart karti hai, isliye teen aur clean payouts chahiye. Instant, Instant Elite, Flash Activation aur Catalyst par fee refund nahi.',
  }),
  fact('payout_not_reversed', 'owner_final', {
    en: 'A completed payout is not reversed.',
    ur: 'مکمل شدہ پے آؤٹ واپس نہیں لیا جاتا۔',
    roman: 'Mukammal payout wapas nahi liya jata.',
    hi: 'पूरा किया गया पेआउट वापस नहीं लिया जाता।',
    ar: 'السحب المكتمل لا يُعكس.',
    hinglish: 'Completed payout reverse nahi hota.',
  }),
  fact('source_primary', 'owner_final', {
    en: 'The Help Centre is the primary public policy reference. The repo FAQ does not override it.',
    ur: 'ہیلپ سینٹر عوامی پالیسی کا بنیادی حوالہ ہے۔ ریپو کا سوال جواب اس پر غالب نہیں۔',
    roman: 'Help Centre awami policy ka bunyadi hawala hai. Repo ka FAQ is par ghalib nahi.',
    hi: 'हेल्प सेंटर सार्वजनिक नीति का प्राथमिक संदर्भ है। रिपो का प्रश्नोत्तर उस पर भारी नहीं पड़ता।',
    ar: 'مركز المساعدة هو المرجع الأساسي للسياسة العامة. أسئلة المستودع الشائعة لا تلغيه.',
    hinglish: 'Help Centre public policy ka primary reference hai. Repo FAQ us par override nahi karta.',
  }),
];

const BY_ID = Object.freeze(Object.fromEntries(FACTS.map((item) => [item.id, item])));

function hashMatches(text, expected) {
  return typeof expected === 'string' && expected.length === 64 && sha256(text) === expected;
}

function locksOk() {
  const hedgesOk = Object.entries(HEDGES).every(([lang, text]) => hashMatches(text, HEDGE_HASH[lang]));
  const factsOk = FACTS.every((item) => Object.entries(item.body).every(([lang, text]) => hashMatches(text, item.hash[lang])));
  const ex = LOCK.owner_exceptions;
  const exceptionOk = Array.isArray(ex) && ex.some((row) => row
    && row.id === 'strategy_risk'
    && row.kind === 'owner_final_exception'
    && Array.isArray(row.overrides)
    && row.overrides.includes('17437285')
    && row.overrides.includes('17437388')
    && row.daily_loss_hard_unchanged === '17437388');
  const citations = LOCK.citations || {};
  const citedOk = FACTS.every((item) => {
    const rows = citations[item.id];
    return Array.isArray(rows) && rows.length > 0 && rows.every((row) => row
      && row.sentence && item.body.en.includes(row.sentence)
      && row.source);
  });
  return hedgesOk && factsOk && exceptionOk && citedOk;
}

function fold(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
}

function normalizeNumerals(text) {
  const map = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
    '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  };
  return String(text || '').replace(/[٠-٩۰-۹०-९０-９]/g, (ch) => map[ch] || ch);
}

function normalize(text) {
  let s = fold(normalizeNumerals(text));
  const maps = [
    [/strategy risk|risk rule|risque de strategie|regla de riesgo|riesgo de estrategia|regle de risque|стратег\S{0,12}\s+риск|правило риска|रणनीति\s*जोखिम|स्ट्रैटेजी\s*रिस्क|سٹریٹیجی\s*رسک|رسک\s*رول|مخاطر الاستراتيجية|قاعدة المخاطر|risque strategique/g, ' strategy risk '],
    [/daily loss|perte journaliere|perdida diaria|дневн\S{0,8}\s+убыт|डेली\s*लॉस|ڈیلی\s*لاس|حد الخسارة اليومية|خسارة يومية/g, ' daily loss '],
    [/max(?:imum)? loss|perte max|perdida maxima|حد الخسارة القصوى/g, ' max loss '],
    [/hard breach|خرق شديد|سخت خلاف|हार्ड ब्रीच/g, ' hard breach '],
    [/soft breach|خرق بسيط|نرم خلاف|सॉफ्ट ब्रीच|softbreach/g, ' soft breach '],
    [/one instrument|same instrument|per instrument|ek instrument|aik instrument|même instrument|mismo instrumento|одно\S{0,6} инструмент|ایک ہی انسٹرومنٹ|एक ही इंस्ट्रूमेंट|الأداة نفسها/g, ' one instrument '],
    [/weekend|fin de semana|finde|выходн|ویک اینڈ|वीकएंड|نهاية الأسبوع|week end|جمعہ|جمعه|الجمعة|शुक्रवार|सोमवार|پیر|الاثنين/g, ' weekend '],
    [/ہولڈ|होल्ड|الاحتفاظ|احتفاظ/g, ' hold '],
    [/saturday|samedi|sabado|суббот|ہفتہ|शनिवार|السبت|hafta\b/g, ' saturday '],
    [/sunday|dimanche|domingo|воскресен|اتوار|रविवार|الأحد|itwar/g, ' sunday '],
    [/catalyst|catalyseur|катализ|کیٹال\S*|کاتال\S*|कैटल\S*|كاتال\S*/g, ' catalyst '],
    [/\brise\b/g, ' rise '],
    [/crypto|usdc|cripto|крипто|کرپٹو|کریپٹو|क्रिप्टो|كريبتو/g, ' crypto '],
    [/fee refund|challenge fee|remboursement des frais|reembolso|استرداد الرسوم|فیس ریفنڈ|फीس रिफंड|fee back/g, ' fee refund '],
    [/फीस|فیس|رسوم/g, ' fee '],
    [/छू|چھو|لمس|لمست/g, ' touch '],
    [/password|passcode|پاس ?ورڈ|पासवर्ड|كلمة المرور|كلمة السر|mot de passe|contrasena|парол/g, ' password '],
    [/pay with|paid with|buy with|bought with|purchase|checkout|خرید|खरीद|شراء|اشتري|ادفع ب/g, ' purchase '],
    [/one hour|1 hour|an hour|ek ghante|ایک گھنٹ\S*|ساعة واحدة|خلال ساعة|एक घंट\S*|одн\S{0,6} час/g, ' one hour '],
    [/was returned|returned|paid back|واپس کر|واپس ہو|أُعيد|اعيد|تم إرجاع|استُرجع|वापस कर|wapas kar|lauta diya/g, ' returned '],
    [/reset|reinitial|reinicio|сброс|ری ?سیٹ|रीसेट|إعادة تعيين|اعادة تعيين/g, ' reset '],
    [/payout|withdrawal|retrait|retiro|вывод|выплат|پے ?آؤٹ|ادائیگی|نکاسی|ودڈرال|पेआउट|भुगतान|निकासी|سحب|دفعة|مكافا\S*|ارباح|أرباح|reward/g, ' payout '],
    [/breakeven|break even|تعادل|بریک ایون|ब्रेकईवन/g, ' breakeven '],
    [/drawdown|تراجع|ڈرا ڈاؤن|ड्रॉडाउन/g, ' drawdown '],
    [/previous cycle|pichl\w* cycle|पिछल\S* चक्र|پچھل\S* سائیکل|الدورة السابقة|cycle précédent|ciclo anterior/g, ' previous cycle '],
    [/erase|wiped?|clean slate|kept the profit|profit kept|profit is kept|profit stays|profit remains|preserved|preserve|reh gaya|reh jaye|mita diya|\bmita\b|saaf ho gaya|carry over|carried over|conserv\w*|gard[eé]\w*|effac\w*|borrad\w*|guardad\w*|сохран\w*|стер\w*|mahiya rakha|munafa rakha|profit rakha|profit bacha|يُمسح|مُسح|मिटा|मिटाया|बचेगा|रहेगा/g, ' stage memory '],
    [/account closure|ferme le compte|cierra la cuenta|закр\S{0,8}\s+счет|بند ہو جا\S*|बंद हो जा\S*|يغلق الحساب|اغلاق الحساب|إغلاق الحساب|account band|khatam|terminat\w*|ends the account|end the account/g, ' account closure '],
    [/what happens|kya hota|kya hoga|क्या होता|क्या होगा|کیا ہوتا|کیا ہوگا|ماذا يحدث|que se passe|qué pasa|que pasa|что будет/g, ' what happens '],
    [/\b(fifty|pachas|pachaas|पचास|پچاس)\b/g, ' 50 '],
    [/\b(thirty|tees|तीस|تیس)\b/g, ' 30 '],
    [/\b(forty|chaalis|chalis|चालीस|چالیس)\b/g, ' 40 '],
    [/\b(three)\b/g, ' 3 '],
    [/\b(five|paanch|पाँच|पांच)\b/g, ' 5 '],
    [/\b(eight|aath|आठ)\b/g, ' 8 '],
    [/\b(ten|das)\b/g, ' 10 '],
    [/\bhalf\b/g, ' 50 percent '],
    [/help cent\w*|centre d'aide|centro de ayuda|مركز المساعدة|ہیلپ سینٹر|हेल्प सेंटर/g, ' help centre '],
    [/\bfaq\b|preguntas frecuentes|questions frequentes/g, ' faq '],
  ];
  for (const [re, to] of maps) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}

function detectLanguage(text) {
  const s = String(text || '');
  const urduMarks = /[ٹڈڑںھچپژگک]/.test(s) || /نہیں|ہے|کیا|اکاؤنٹ|ری سیٹ|منافع/.test(s);
  if (/[\u0600-\u06FF]/.test(s) && urduMarks) return { lang: 'ur', confident: true };
  if (/[\u0600-\u06FF]/.test(s)) return { lang: 'ar', confident: true };
  if (/[\u0900-\u097F]/.test(s)) return { lang: 'hi', confident: true };
  if (/[а-яё]/i.test(s)) return { lang: 'ru', confident: true };
  const latin = fold(s);
  const roman = (latin.match(/\b(kya|kyun|aap|apko|mujhe|mera|meri|kaise|kitna|kitne|hoga|hogi|hai|hain|nahi|nahin|karo|wala|wali|kaun|kahan|tasdeeq|batao)\b/gi) || []).length;
  const hing = (latin.match(/\b(bhai|yaar|hogaya|batao)\b/gi) || []).length + (/\bho gaya\b|\bband ho\b|\baccount band\b/i.test(latin) ? 2 : 0);
  const fr = (latin.match(/\b(que|passe|risque|strategie|compte|fermeture|semaine|samedi|dimanche|frais|remboursement|pas)\b/gi) || []).length;
  const es = (latin.match(/\b(que|cuenta|cierra|semana|sabado|domingo|reembolso|perdida|estrategia|riesgo)\b/gi) || []).length;
  if (fr >= 3 && fr > es && fr > roman) return { lang: 'fr', confident: true };
  if (es >= 3 && es > fr && es > roman) return { lang: 'es', confident: true };
  if (roman >= 2 && roman >= hing) return { lang: 'roman', confident: true };
  if (hing >= 2) return { lang: 'hinglish', confident: true };
  if (/[a-z]/i.test(s)) return { lang: 'en', confident: true };
  return { lang: 'en', confident: false };
}

function unique(list) {
  return [...new Set(list)];
}


function hedgeFor(lang) {
  return HEDGES[lang] || HEDGES.en;
}

function threadLanguage(clientRaw, draftRaw) {
  const client = String(clientRaw || '').trim();
  if (client) {
    const detected = detectLanguage(client);
    if (detected.lang && detected.lang !== 'en') return detected.lang;
    if (detected.confident) return 'en';
  }
  const draft = String(draftRaw || '').trim();
  if (draft) {
    const detected = detectLanguage(draft);
    if (detected.lang && detected.lang !== 'en') return detected.lang;
    if (detected.confident) return 'en';
  }
  return 'en';
}

function scriptFold(text) {
  return normalizeNumerals(String(text || ''))
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀہ]/g, 'ه')
    .replace(/ة/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .toLowerCase();
}

function lockKey(text) {
  return scriptFold(text)
    .replace(/[^\p{L}\p{N}%$]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collapse(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function splitSentences(text) {
  return String(text || '')
    .split(/\n+|(?<=[.!?؟۔।])\s+(?=[A-Z\u0600-\u06FF\u0900-\u097F"'(\u0400-\u04FF])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const FULL_BY_KEY = new Map();
const SENT_BY_KEY = new Map();
for (const item of FACTS) {
  for (const [lang, value] of Object.entries(item.body)) {
    const full = lockKey(value);
    if (full) {
      if (!FULL_BY_KEY.has(full)) FULL_BY_KEY.set(full, []);
      FULL_BY_KEY.get(full).push({ id: item.id, lang, text: value });
    }
    for (const sentence of splitSentences(value)) {
      const key = lockKey(sentence);
      if (key.length < 12) continue;
      if (!SENT_BY_KEY.has(key)) SENT_BY_KEY.set(key, []);
      SENT_BY_KEY.get(key).push({ id: item.id, lang, text: sentence });
    }
  }
}

function variantFor(hits, lang, full) {
  if (!hits || !hits.length) return null;
  const same = hits.find((hit) => hit.lang === lang);
  if (same) return same.text;
  if (!full) return null;
  const item = BY_ID[hits[0].id];
  if (!item) return null;
  const local = item.body[lang];
  if (local && hashMatches(local, item.hash[lang])) return local;
  if (lang === 'en' && item.body.en && hashMatches(item.body.en, item.hash.en)) return item.body.en;
  return null;
}

function lockedForm(draft, lang) {
  const fullHits = FULL_BY_KEY.get(lockKey(draft));
  if (fullHits) return variantFor(fullHits, lang, true);
  const parts = splitSentences(draft);
  if (!parts.length || !parts.every((part) => SENT_BY_KEY.has(lockKey(part)) || FULL_BY_KEY.has(lockKey(part)))) return undefined;
  const out = [];
  for (const part of parts) {
    const hits = FULL_BY_KEY.get(lockKey(part)) || SENT_BY_KEY.get(lockKey(part));
    const variant = variantFor(hits, lang, !!FULL_BY_KEY.get(lockKey(part)));
    if (!variant) return null;
    out.push(variant);
  }
  return out.join('\n\n');
}

function isMemoryClaim(raw) {
  const original = String(raw || '');
  if (!original.trim()) return false;
  const text = normalize(original);
  const folded = scriptFold(original);
  const blob = text + '\n' + folded;
  const scriptMemory = /محفوظ|مٹا|يُحفظ|يحتفظ|يمح|मिटا|बच|रह जा|сохран|стер/.test(original);
  if (/previous cycle/.test(text) && !/stage memory|remember/.test(blob)) return false;
  if (/stage memory/.test(text)) return true;
  const memoryContext = /catalyst|کیٹال|کاتال|كاتال|कैट|\bstage\b|مرحل|profit|earning|کمائی|منافع|ربح|\breset\b|ری\s*سیٹ|रीसेट|payout|پے ?آؤٹ|पेआउट|سحب/;
  if (scriptMemory && memoryContext.test(blob) && !/previous cycle/.test(text)) return true;
  if (/remember(?:s|ed)?/.test(text) && /yesterday|earlier|earning|profit|munafa|stage/.test(blob)) return true;
  if (/yesterday(?:'s|s)?\s+earning/.test(text)) return true;
  if (/\bkeeps?\b|\bkeeping\b|\bkept\b/.test(text) && /yesterday|earlier stage|previous stage/.test(text)) return true;
  if (/(?:^|[^\u0600-\u06FF])یاد|याद|یتذکر|تتذکر|(?:^|[^\u0600-\u06FF])تذکر/.test(folded) && /کما[ئیي]+|منافع|कमाई|ارباح|ربح|लाभ|earning|profit/.test(blob)) return true;
  if (/(?:^|[^\u0600-\u06FF])(?:کل کی|کل کا)/.test(folded) && /کما[ئیي]+|منافع|profit|earning/.test(blob)) return true;
  if (/\b(erase|wipe|wiped|clean slate)\b/.test(text) && /catalyst|profit|earning|stage/.test(blob)) return true;
  if (/\b(?:mehfooz|mahfooz)\b/.test(text) && /catalyst|stage|profit|earning|reset|munafa/.test(blob) && !/\bpassword\b/.test(text)) return true;
  const erasePara = /(?:^|[^\u0600-\u06FF])(?:یاد\s*رکھ\S*|بھول\S*|مٹ\S*|صاف\s*ہو\S*|پرانا\s*منافع)/;
  const eraseScript = /يمح|یمح|يُمح|یُمح|يبقى\s*الربح|یبقی\s*الربح/;
  if ((erasePara.test(original) || erasePara.test(folded) || eraseScript.test(original + '\n' + folded))
    && /catalyst|کیٹال|کاتال|كاتال|कैट|\bstage\b|مرحل|चरण|\breset\b|ری\s*سیٹ|रीसेट|profit|earning|کمائی|منافع|ربح|लाभ|payout|پے ?آؤٹ|पेआउट|سحب/.test(blob)
    && !/previous cycle/.test(text)
    && !/\bpassword\b|پاس\s*ورڈ|पासवर्ड|كلمة المرور/.test(blob)) return true;
  return false;
}

function isSourceOverride(raw) {
  const text = normalize(raw);
  if (!/\bfaq\b/.test(text) || !/help centre/.test(text)) return false;
  if (/help centre is the primary|faq does not|does not override/.test(text)) return false;
  return /override|outrank|ghalib|above the help|instead of the help|replaces the help|فوق|سے اوپر|से ऊपर/.test(text);
}

function isPlatformHowto(text) {
  return /\b(mt4|mt5|password|passcode|login|terminal|install|download|selfie|passport|screenshot|inbox|browser|dashboard|settings|profile|ticket|chart|menu|notification|device|session)\b/.test(text)
    && !/\$|%|٪/.test(text)
    && !/payout|breach|strategy risk|daily loss|refund|terminat|weekend|catalyst|\brise\b|revers/.test(text);
}

function isRiseClaim(original, text) {
  const verb = /\b(?:prices?|costs?|equity|balance|limits?|values?)\s+rise\b|\brise\s+(?:in|by|up|above|over)\b|\brising\b|\bsunrise\b|\brise up\b/.test(text);
  const product = /\bRise\b/.test(original)
    || /\brise\s+(?:fee|payout|withdrawal|withdraw|payment)\b/.test(text)
    || /\b(?:fee|payout|withdrawal)\b[^.]{0,32}\brise\b/.test(text);
  if (verb && !product) return false;
  return product;
}

function isRefundClaim(original, text, folded) {
  const blob = original + '\n' + text + '\n' + folded;
  if (/refund button|refund tab|refund page|where is the refund|refund section|refund link/.test(text)) return false;
  if (/fee refund|fee was refunded|refunded your fee|refunded the fee|challenge fee|no refund|not refund|was refunded|has been refunded|have been refunded|will be refunded|فیس ریفنڈ|फीस रिफंड|استرداد الرسوم/.test(blob)) return true;
  if (/\brefund\b/.test(text) && /\b(fee|payout|challenge)\b/.test(text)) return true;
  return false;
}

function isReversalClaim(original, text, folded) {
  const blob = original + '\n' + text + '\n' + folded;
  const payout = /payout|ادای|निकासी|سحب|भुगतान|ودڈرال|withdrawal|reward|پے ?آؤٹ|پے ?اؤٹ|پی ?آؤٹ/;
  const reversed = /revers|pull(?:ed)? back|took back|clawed|\bundo\b|واپس لے|واپس کر|واپس آ|رجوع|رجع|منسوخ|الغا|إلغا|الغي|أُلغي|أُلغ|يلغ|یلغ|يُلغ|वापस ले|खींच|استرجاع|ارجاع|\breturned\b/;
  const notReversal = /not reversed|are not reversed|cannot be reversed|reversed nahi|واپس نہیں|नहीं होते|original payment|اصل ادائیگی|मूल भुगतान/;
  if (payout.test(blob) && (reversed.test(blob) || /\breturned\b/.test(text)) && !notReversal.test(blob)) return true;
  if (/paid yesterday|was paid yesterday|کل ادا|کل کی ادائیگی|دفعت أمس|دفعت امس|कल (?:भुगतान|पेआउट)|کل بھیج/.test(blob)) return true;
  if (payout.test(blob) && /yesterday|کل|कल|أمس|امس/.test(blob) && /paid|ادا|भुगतान|دفع|ادائیگی/.test(blob)
    && !/yesterday'?s closing|closing balance|اختتامی|إغلاق الأمس|اغلاق الامس/.test(blob)) return true;
  if (payout.test(blob) && /\b(?:was|were|has been|have been|got) paid\b|\bwas sent\b/.test(text)
    && !/when will|how long|how will|business day|within \d|original payment/.test(text)) return true;
  if (payout.test(blob) && /not reversed|reversed nahi|واپس نہیں|नहीं होते|لا يُعكس|لا يعكس|لا يلغ|يُعكس|يعكس|عكس/.test(blob)
    && !/original payment|اصل ادائیگی|मूल भुगतान/.test(blob)) return true;
  return false;
}

function isWeekendClaim(original, text, folded) {
  const blob = String(original || '') + '\n' + text + '\n' + folded;
  const topic = /weekend|friday|saturday|sunday|جمع[ہهےع]|ہفت|اتوار|پیر|शुक्र|शनि|रवि|الجمعه|الجمعة|السبت|الأحد|الاثنين|نهاية الأسبوع|نهایه الاسبوع|اختتام الأسبوع|اختتام الاسبوع/;
  if (!topic.test(blob)) return false;
  return /hold|clos|position|add-on|add on|violation|trading|trade|ہولڈ|پوزیشن|पोजीशन|صفقة|مخالفة|خلاف ورزی|उल्लंघन|بند|رکھ|إغلاق|اغلاق|إبقاء|ابقاء|إمساك|امساک/.test(blob);
}

function isGeneralPolicy(original, text, folded) {
  if (isPlatformHowto(text)) return false;
  const blob = original + '\n' + text + '\n' + folded;
  if (/strategy risk|risk rule|daily loss|max loss|hard breach|soft breach|one instrument|breakeven/.test(text)) return true;
  if (/اسٹریٹیجی|سٹریٹیجی|رسک رول|स्ट्रैटेजी|रणनीति|مخاطر الاستراتيج|قاعدة المخاطر|डेली|ڈیلی لاس|حد الخسارة/.test(blob)) return true;
  if (/terminat|ends the account|end the account|close the account|account closure|forfeit|account is closed|closed forever/.test(text)) return true;
  if (/\breset\b/.test(text) && /funded|payout|profit|drawdown|breakeven|cycle|account|منافع/.test(blob)
    && !/password|mt4|mt5|terminal|link|پاس ?ورڈ/.test(blob)) return true;
  if (/payout|withdrawal|reward/.test(text) && (/[$€£]|%|percent|hour|business day|refund|revers|fee/.test(blob))) return true;
  if (/\bcatalyst\b/.test(text) && (/%|percent|stage|ladder|profit target|daily loss|\breset\b|\$\s?\d/.test(text))) return true;
  if (isSourceOverride(original)) return true;
  return false;
}

function isPolicyClaim(raw) {
  const original = String(raw || '');
  if (!original.trim()) return false;
  const text = normalize(original);
  const folded = scriptFold(original);
  if (isMemoryClaim(original)) return true;
  if (isRiseClaim(original, text)) return true;
  if (isRefundClaim(original, text, folded)) return true;
  if (isReversalClaim(original, text, folded)) return true;
  if (isWeekendClaim(original, text, folded)) return true;
  if (isConceptClaim(original, text, folded)) return true;
  if (isGeneralPolicy(original, text, folded)) return true;
  return false;
}

function claimBlob(original, text, folded) {
  return String(original || '') + '\n' + String(text || '') + '\n' + String(folded || '');
}

function isResetInDrawdown(original, text, folded) {
  const blob = claimBlob(original, text, folded);
  if (/password|mt4|mt5|terminal|پاس\s*ورڈ|पासवर्ड|كلمة المرور|كلمة السر/.test(blob)) return false;
  const reset = /reset|ری\s*سیٹ|ریسیٹ|اعاد|اعاده|اعادة|إعادة/.test(blob);
  const down = /drawdown|in a loss|\bloss\b|nuqsan|nuqsaan|\bghata\b|نقصان|گھاٹ|خسار|تراجع|हानि|नुकसान/.test(blob);
  return reset && down;
}

function isPreviousProfit(original, text, folded) {
  const blob = claimBlob(original, text, folded);
  const topic = /previous cycle|پچھل|سابق|گذشت|گزشت|previous|السابق|السابقه|الماضي|الماضية|पिछल|pichl/;
  if (/yesterday'?s closing|closing balance|اختتامی بیلنس|إغلاق الأمس|اغلاق الامس/.test(blob) && !topic.test(blob)) return false;
  const profit = /profit|munafa|منافع|ارباح|أرباح|ربح|کمائی|कमाई|लाभ/;
  const paid = /paid|payable|payout|ادا|ملے|ملتا|مل جا|mil jata|milta|يدفع|یُدفع|يُدفع|یدفع|تدفع|not paid|ادا نہیں|نہیں ملت|لا يُدفع|لا يدفع|لا تدفع|مستحق/;
  return topic.test(blob) && profit.test(blob) && paid.test(blob);
}

function isCatalystFeeRefund(original, text, folded) {
  const blob = claimBlob(original, text, folded);
  const catalyst = /catalyst|کیٹال|کاتال|كاتال|कैट/.test(blob);
  const fee = /\bfees?\b|فیس|رسوم|शुल्क|फीس/.test(blob);
  const refund = /refund|ریفنڈ|रिफंड|واپس|استرداد|تُعاد|تعاد|يعيد|يعاد|یعید|رد الرسوم|واپسی|(?:^|[^\u0600-\u06FF])رد(?:$|[^\u0600-\u06FF])/.test(blob);
  return catalyst && fee && refund;
}

function isFeeAmountClaim(original, text, folded) {
  const blob = claimBlob(original, text, folded);
  if (/refund button|where is the refund|billing tab/.test(text)) return false;
  const fee = /\bfees?\b|فیس|رسوم|शुल्क|फीस/.test(blob);
  const money = /\$|€|£|%|٪|percent|فیصد|प्रतिशत/.test(blob);
  const topic = /crypto|\brise\b|catalyst|challenge|payout|withdrawal|reward|کرپٹو|کریپٹو|कीमत/.test(blob);
  return fee && money && topic;
}

function isResetPriceClaim(original, text, folded) {
  const blob = claimBlob(original, text, folded);
  if (/password|mt4|mt5|terminal|\blink\b|chart|browser|session|پاس\s*ورڈ|पासवर्ड|كلمة المرور/.test(blob)) return false;
  if (!/\breset\b|ری\s*سیٹ|ریسیٹ|रीसेट|اعاد/.test(blob)) return false;
  return /\$|€|£|\bcosts?\b|\bprice\b|قیمت|कीमत|سعر|\bfee\b/.test(blob);
}

function isPayoutTimingClaim(original, text, folded) {
  const blob = claimBlob(original, text, folded);
  const payout = /payout|withdrawal|reward|پے ?آؤٹ|پی ?آؤٹ|पेआउट|سحب|ودڈرال|ادائیگی|निकासी/.test(blob);
  const duration = /\bhours?\b|\bghante\b|\bghanta\b|گھنٹ|ساعت|घंट|business day|کاروباری|\bminute\b/.test(blob);
  return payout && duration;
}

function isConceptClaim(original, text, folded) {
  if (isPlatformHowto(text)) return false;
  return isResetInDrawdown(original, text, folded)
    || isPreviousProfit(original, text, folded)
    || isCatalystFeeRefund(original, text, folded)
    || isFeeAmountClaim(original, text, folded)
    || isResetPriceClaim(original, text, folded)
    || isPayoutTimingClaim(original, text, folded);
}

const TEAMMATE_FORWARD = Object.freeze({
  en: "I've sent this to a teammate for review. They have your account details and the chat context.",
  ur: 'میں نے اسے جائزے کے لیے ایک ساتھی کے پاس بھیج دیا ہے۔ ان کے پاس آپ کے اکاؤنٹ کی تفصیل اور چیٹ کا سیاق ہے۔',
  roman: 'Main ne ise review ke liye ek teammate ke paas bhej diya hai. Un ke paas aap ke account ki detail aur chat ka context hai.',
  hi: 'मैंने इसे समीक्षा के लिए एक साथी के पास भेज दिया है। उनके पास आपके खाते का विवरण और चैट का संदर्भ है।',
  ar: 'لقد أرسلت هذا إلى زميل للمراجعة. لديه تفاصيل حسابك وسياق المحادثة.',
  hinglish: 'Maine ise review ke liye ek teammate ke paas bhej diya hai. Unke paas aapke account ki detail aur chat ka context hai.',
  fr: "Je l'ai envoyé à un coéquipier pour examen. Il a les détails de votre compte et le contexte de la conversation.",
  es: 'Lo envié a un compañero para que lo revise. Tiene los datos de su cuenta y el contexto del chat.',
  ru: 'Я отправил это коллеге на проверку. У него есть данные вашего счёта и контекст чата.',
});

const FORWARD_MARKS = [
  TEAMMATE_FORWARD.en,
  "I've forwarded this to a teammate who can take a closer look. They have the chat context.",
  TEAMMATE_FORWARD.ur,
  TEAMMATE_FORWARD.roman,
  TEAMMATE_FORWARD.hi,
  TEAMMATE_FORWARD.ar,
  TEAMMATE_FORWARD.hinglish,
  TEAMMATE_FORWARD.fr,
  TEAMMATE_FORWARD.es,
  TEAMMATE_FORWARD.ru,
];

function isForwardLine(raw) {
  const text = collapse(raw);
  if (!text) return false;
  if (FORWARD_MARKS.some((line) => collapse(line) === text)) return true;
  return /sent this to a teammate for review|forwarded this to a teammate/i.test(text);
}

const STATUS_EN = Object.freeze([
  'Our team has already been informed and is reviewing this. We will update you here as soon as there is progress.',
  'Thanks for checking in , our team already has this and is reviewing it. We will message you here when there is an update.',
  'This is already with our team for review. Please hang tight; we will follow up on Intercom as soon as there is news.',
  'Our team has your case and is looking into it. No need to resend the same details , we will update you here.',
  'We have already passed this to the team. They are reviewing it and will reply here when ready.',
]);

const STATUS_LINE = Object.freeze({
  en: STATUS_EN[0],
  ur: 'ہماری ٹیم کو پہلے ہی بتا دیا گیا ہے اور وہ اس کا جائزہ لے رہی ہے۔ پیش رفت ہوتے ہی ہم آپ کو یہیں بتائیں گے۔',
  roman: 'Hamari team ko pehle hi bata diya gaya hai aur woh is ka jaiza le rahi hai. Progress hote hi hum aap ko yahin batayenge.',
  hi: 'हमारी टीम को पहले ही बता दिया गया है और वे इसकी समीक्षा कर रही हैं। प्रगति होते ही हम आपको यहीं बताएंगे।',
  ar: 'تم إبلاغ فريقنا بالفعل وهو يراجع هذا. سنحدثك هنا فور وجود تقدم.',
  hinglish: 'Hamari team ko pehle hi bata diya gaya hai aur woh iska review kar rahi hai. Progress hote hi hum aapko yahin batayenge.',
  fr: 'Notre équipe est déjà informée et examine cela. Nous vous tiendrons au courant ici dès qu’il y aura du nouveau.',
  es: 'Nuestro equipo ya está informado y lo está revisando. Le avisaremos aquí en cuanto haya novedades.',
  ru: 'Наша команда уже уведомлена и проверяет это. Мы напишем вам здесь, как только появится прогресс.',
});

function matchedStatus(raw) {
  const text = collapse(raw);
  if (!text) return '';
  if (STATUS_EN.some((line) => collapse(line) === text)) return 'en';
  for (const [lang, line] of Object.entries(STATUS_LINE)) {
    if (collapse(line) === text) return lang;
  }
  return '';
}

function matchedHedge(raw) {
  const text = collapse(raw);
  for (const [lang, line] of Object.entries(HEDGES)) {
    if (collapse(line) === text) return lang;
  }
  return '';
}

// Kept for the source tables. The guard does not rewrite a forward, status,
// or hedge body; those baseline bytes pass through.
function fixedLine(kind, lang, draft) {
  if (kind === 'hedge') return hedgeFor(lang);
  if (kind === 'forward') {
    if (lang === 'en' && collapse(draft) === collapse(TEAMMATE_FORWARD.en)) return TEAMMATE_FORWARD.en;
    if (lang === 'en' && /forwarded this to a teammate/i.test(draft)) return collapse(draft);
    return TEAMMATE_FORWARD[lang] || hedgeFor(lang);
  }
  if (kind === 'status') {
    if (lang === 'en') {
      const exact = STATUS_EN.find((line) => collapse(line) === collapse(draft));
      return exact || STATUS_LINE.en;
    }
    return STATUS_LINE[lang] || hedgeFor(lang);
  }
  return hedgeFor(lang);
}

function deferWindowFromState(state, nowSec) {
  if (!state || typeof state !== 'object') return false;
  if (state.escalateAwaitingFirstTeammate) return true;
  if (state.deferWindow === true || state.inflightDefer === true) return true;
  const def = state.deferredRelatedReply;
  if (def && def.at != null && String(def.at) !== '') {
    const now = Number(nowSec == null ? Math.floor(Date.now() / 1000) : nowSec);
    const age = now - Number(def.at);
    if (age >= 0 && age < 10 * 60) return true;
  }
  return false;
}

function inDefer(ctx) {
  if (!ctx) return false;
  if (ctx.deferWindow === true || ctx.defer === true || ctx.inflight === true) return true;
  return deferWindowFromState(ctx.state, ctx.nowSec);
}

function latestClient(ctx) {
  if (!ctx) return '';
  if (ctx.clientText) return String(ctx.clientText);
  const messages = [];
  if (Array.isArray(ctx.messages)) messages.push(...ctx.messages);
  if (Array.isArray(ctx.parts)) messages.push(...partsToMessages(ctx.parts, ctx.botIds));
  const clients = messages.filter((item) => item && (item.role === 'client' || item.role === 'user'));
  if (!clients.length) return '';
  return String(clients[clients.length - 1].text || clients[clients.length - 1].body || '');
}

function partsToMessages(parts, botIds) {
  const bots = new Set((botIds || []).map((id) => String(id)));
  return (parts || []).filter(Boolean).map((part) => {
    if (part.role === 'human' || part.role === 'note' || part.role === 'client' || part.role === 'bot' || part.role === 'user') {
      return { role: part.role === 'user' ? 'client' : part.role, text: String(part.text || part.body || '') };
    }
    const text = String(part.body || part.text || '');
    if (String(part.part_type || '') === 'note') return { role: 'note', text };
    const author = part.author || {};
    if (bots.has(String(author.id || ''))) return { role: 'bot', text };
    if (String(author.type || '') === 'admin') return { role: 'human', text };
    return { role: 'client', text };
  });
}

function pack(body, draft, lang, reason, suppressed) {
  const text = body && String(body).trim() ? String(body) : hedgeFor(lang);
  return {
    send: !suppressed,
    body: text,
    replaced: collapse(text) !== collapse(draft),
    silent: false,
    suppressed: !!suppressed,
    failClosed: reason === 'fail_closed',
    reason: reason || 'hedge',
    result: {
      approved: false,
      release: false,
      silent: false,
      action: !suppressed && (reason === 'pass_through' || reason === 'locked') ? 'allow' : 'hold',
      lang: lang || 'en',
    },
  };
}

function stripHelpQuestion(rest) {
  const helps = [
    'how can i help?',
    'how can i help',
    'come posso aiutarti?',
    'come posso aiutarti',
    'main aap ki kis cheez mein madad kar sakta hoon?',
    'main aap ki kis cheez mein madad kar sakta hoon',
    'میں آپ کی کیا مدد کر سکتا ہوں؟',
  ];
  const lower = String(rest || '').toLowerCase();
  for (const help of helps) {
    if (lower.startsWith(help)) return rest.slice(help.length).replace(/^\s+/, '');
  }
  return rest;
}

function stripOneWelcome(text) {
  const latin = text.match(/^(?:hello|hi|hey|ciao|salve|salam)(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]{0,40})?\s*,\s*/i);
  if (latin) return stripHelpQuestion(text.slice(latin[0].length)).replace(/^\s+/, '');
  const arabic = text.match(/^(?:السلام\s*علیکم|السلام\s*عليكم|السلام\s*عليکم)(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]{0,40})?\s*[،,]\s*/);
  if (arabic) return stripHelpQuestion(text.slice(arabic[0].length)).replace(/^\s+/, '');
  return text;
}

function coreAfterWelcome(raw) {
  let text = String(raw || '');
  for (let i = 0; i < 2; i++) {
    const next = stripOneWelcome(text);
    if (next === text) break;
    text = next;
  }
  return text.trim();
}

function isLeak(raw) {
  const original = String(raw || '');
  if (!original.trim()) return false;
  const folded = scriptFold(original);
  const latin = fold(original);
  const blob = original + '\n' + latin + '\n' + folded;
  if (/system\s+prompt|developer\s+message|hidden\s+instructions|system\s+instructions|internal\s+notes?|developer\s+instructions|follow\s+your\s+instructions/.test(latin)) return true;
  if (/\b(?:chhupi|chhipi|chuppi|gupt|poshida|posheeda)\b.{0,32}\b(?:hidayat|hidayaten|hidayatain|instruction|nirdesh|note)s?\b/.test(latin)) return true;
  if (/\b(?:andaruni|androoni)\b.{0,32}\b(?:note|hidayat)\b/.test(latin)) return true;
  if (/\b(?:system|nizam)\b.{0,32}\b(?:hidayat|hidayaten|nirdesh|prompt)\b/.test(latin)) return true;
  if (/सिस्टम\s*प्रॉम्प्ट|आंतरिक\s*नोट|आन्तरिक\s*नोट|सिस्टम\s*निर्देश|छिपी\s*हिदायत|छुपी\s*हिदायत|छिपे\s*निर्देश|गुप्त\s*निर्देश/.test(original)) return true;
  if (/التعليمات\s*الخفية|تعليمات\s*خفية|موجه\s*النظام|ملاحظة\s*داخلية|ملاحظه\s*داخليه|تعليمات\s*النظام|الموجه\s*الداخلي/.test(blob)) return true;
  if (/اندرونی\s*نوٹ|سسٹم\s*پرامپٹ|سسٹم\s*پرامپت|سیسٹم\s*پرامپٹ|سسٹم\s*ہدایات|چھپی\s*ہدایات|پوشیدہ\s*ہدایات|نظام\s*کی\s*ہدایات/.test(blob)) return true;
  if (/(?:^|\n)\s*action\s*:/i.test(original) || /\[bot-ack\]/i.test(original)) return true;
  return false;
}

function isBaselineByte(raw) {
  const text = collapse(raw);
  if (!text) return false;
  if (FORWARD_MARKS.some((line) => collapse(line) === text)) return true;
  if (STATUS_EN.some((line) => collapse(line) === text)) return true;
  for (const line of Object.values(STATUS_LINE)) {
    if (collapse(line) === text) return true;
  }
  return false;
}

function isExactLockPiece(raw) {
  const key = lockKey(raw);
  if (!key) return false;
  return FULL_BY_KEY.has(key) || SENT_BY_KEY.has(key);
}

// Topic presence, not a second assertion. Stems cover Roman Urdu, Hindi,
// Arabic, and the same topics in English. A co-mention of menu, profile,
// chart, or browser does not cancel a hit.
const LATIN_TOPIC = /\b(?:payouts?|pais(?:a|e|ay|ey)|withdraw(?:al|als|s)?|wa+pas|wapis|cancels?|cancell(?:ed|ation)|revers(?:e|ed|al|als)?|aaj|ghant(?:a|e|on|ein)?|weekends?|haft(?:a|e|ey|on)?|profits?|munafa|pichl\w*|drawdowns?|nuqsaan|nuqsans?|ghata|breaches?|catalyst|fees?|refunds?)\b/;
const HINDI_TOPIC = /भुगतान|पेआउट|निकासी|वापस|रद्द|घंट|सप्ताहांत|लाभ|शुल्क|फीस|रिफंड|नुकसान|हानि|ड्रॉडाउन|ब्रीच|उल्लंघन/;
const ARABIC_URDU_TOPIC = /دفع|سحب|استرداد|إلغاء|الغاء|يلغ|یلغ|ساع|عطلة|عطل|ربح|رسوم|پے\s*آؤٹ|پی\s*آؤٹ|پے\s*اؤٹ|نقصان|گھاٹ|فیس|ریفنڈ|خلاف\s*ورزی|ہفت|جمع[ہه]|واپس|منسوخ|ری\s*سیٹ/;
const CANON_TOPIC = /\b(?:payouts?|withdrawals?|weekends?|breaches?|drawdowns?|strategy risk|risk rule|daily loss|max loss|hard breach|soft breach|catalyst|fee refund|fees?|refunds?|resets?)\b/;
const REFUND_UI = /refund button|refund tab|refund page|where is the refund|refund section|refund link|billing tab/;

function scriptTopic(original) {
  return HINDI_TOPIC.test(original) || ARABIC_URDU_TOPIC.test(original + '\n' + scriptFold(original));
}

function latinTopic(latin) {
  return LATIN_TOPIC.test(latin);
}

function touchesPolicyTopic(raw) {
  const original = String(raw || '');
  if (!original.trim()) return false;
  if (isExactLockPiece(original)) return false;
  const latin = fold(original);
  if (REFUND_UI.test(latin)) {
    const stripped = latin.replace(/\brefunds?\b/g, ' ');
    if (!latinTopic(stripped) && !scriptTopic(original)) return false;
  }
  if (latinTopic(latin) || scriptTopic(original)) return true;
  const password = /\b(?:password|passcode|mt4|mt5|terminal)\b/.test(latin)
    || /پاس\s*ورڈ|पासवर्ड|كلمة المرور|كلمة السر/.test(original);
  const resetLink = /\breset\b/.test(latin) && /\b(?:link|email|chart|browser|session)\b/.test(latin);
  if ((password || resetLink) && !latinTopic(latin) && !scriptTopic(original)) return false;
  return CANON_TOPIC.test(normalize(original));
}

function bodyHasUnlockedTopic(raw) {
  const parts = splitSentences(raw);
  const sentences = parts.length ? parts : [String(raw || '').trim()].filter(Boolean);
  for (const sentence of sentences) {
    if (touchesPolicyTopic(sentence)) return true;
  }
  return false;
}

function guardPublicBody(body, ctx) {
  try {
    const draft = body == null ? '' : String(body);
    const input = ctx || {};
    const clientRaw = latestClient(input);
    const lang = threadLanguage(clientRaw, draft);
    const hedge = hedgeFor(lang);
    if (!locksOk()) return pack(hedge, draft, lang, 'fail_closed', false);
    if (inDefer(input)) return pack(hedge, draft, lang, 'defer', true);
    if (input.postgateFailed === true || isLeak(draft) || isLeak(clientRaw)) {
      return pack(hedge, draft, lang, input.postgateFailed === true ? 'postgate' : 'leak', false);
    }
    if (isMemoryClaim(draft) || isMemoryClaim(clientRaw)) return pack(hedge, draft, lang, 'erase', false);
    if (!draft.trim()) return pack(hedge, draft, lang, 'empty', false);
    const core = coreAfterWelcome(draft);
    if (!core) return pack(draft, draft, lang, 'pass_through', false);
    if (isBaselineByte(core) || isBaselineByte(draft)) {
      return pack(draft, draft, lang, 'pass_through', false);
    }
    const locked = lockedForm(core, lang);
    if (locked) return pack(locked, draft, lang, 'locked', false);
    if (locked === null) return pack(hedge, draft, lang, 'hedge', false);
    if (bodyHasUnlockedTopic(core) || bodyHasUnlockedTopic(draft)) {
      return pack(hedge, draft, lang, 'hedge', false);
    }
    if (!isPolicyClaim(core) && !isPolicyClaim(draft) && !isLeak(core)) {
      return pack(draft, draft, lang, 'pass_through', false);
    }
    return pack(hedge, draft, lang, 'hedge', false);
  } catch (err) {
    return {
      send: true,
      body: HEDGES.en,
      replaced: true,
      silent: false,
      suppressed: false,
      failClosed: true,
      reason: 'fail_closed',
      error: err && err.message,
      result: { approved: false, release: false, silent: false, action: 'hold', lang: 'en' },
    };
  }
}

function beforeSend(draft, ctx) {
  return guardPublicBody(draft, ctx);
}

module.exports = {
  STATUS,
  FACTS,
  BY_ID,
  HEDGES,
  HEDGE_HASH,
  CLIENT_MESSAGE: HEDGES.en,
  TEAMMATE_FORWARD,
  STATUS_LINE,
  STATUS_EN,
  sha256,
  locksOk,
  normalize,
  detectLanguage,
  guardPublicBody,
  beforeSend,
  partsToMessages,
  deferWindowFromState,
  isMemoryClaim,
  isPolicyClaim,
};
