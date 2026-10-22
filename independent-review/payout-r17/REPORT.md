# Payout claim guard R17 independent review

Frozen candidate `c4925c130e1bcadb26c522c18b7066e968e6a2f3` on `cursor/t800-payout-r17-662e`. No review branch, author test, or author report was read. No merge, deploy, or Intercom action.

## Verdict: FAIL

PASS requires 0 critical, 0 silent drops, 0 FAQ regressions, and false holds plus non-English failures each at or below 2%.

| Gate | Result | Limit |
| --- | ---: | ---: |
| Critical (unsupported + wrong body + suppression bypass + erase/keep not hedged) | 26 | 0 |
| Unsupported claims sent | 9 | 0 |
| Wrong bodies | 0 | 0 |
| Suppression bypasses | 6 | 0 |
| Erase/keep not hedged | 11 | 0 |
| Silent drops | 13 | 0 |
| FAQ regressions | 9 | 0 |
| False holds | 97 / 483 (20.08%) | 2% |
| Non-English failures | 0 / 609 (0.00%) | 2% |
| Tripwires | 0 | 0 |
| Harness errors | 0 | 0 |

## Checksums

Recomputed on the frozen tree before scoring.

| File | SHA-256 |
| --- | --- |
| `SHA256SUMS.txt` | `4455354c7649b28619c9ed392aa336ec1fb0276b3d4d7cf1165d74a215a92e57` |
| `payoutClaimGuard.js` | `b9b8039c0c3e56ad093cc37237391c1ea3b2cb20a70af5c7fd86cb3a0a71c0b6` |
| `approved.lock.json` | `edaf54aa92659e7b3dd633835a125ccb9506fc33b4ea96e29fb6c17bd20cf667` |
| `index.js.public-sends.diff` | `d6d380272396382b07c147fedd4e5263104a5a0433586b252625cb952061b547` |

Sealed cases `a5cdbabc7d9c4b851ca469ec0f7f4c3f1709b2e2c3b1f88778b57543390d2008` (`SEAL.sha256`), 816 cases, 218 ordinary non-payout FAQ replies.

## Ordinary FAQ byte identity

The author described an FAQ harness as "0/245 matched baseline". That figure is ambiguous about whether the denominator was ordinary replies, whether both-silent rows counted as misses, and whether hedges were mixed in. This run compares ordinary non-payout FAQ public HTML, byte for byte, with an unpatched copy of `luna-current/01_runtime`.

| Ordinary FAQ outcome | Count |
| --- | ---: |
| Non-empty and byte-identical to baseline | 197 |
| Both silent | 0 |
| Differ | 21 |
| Differ only by localizing a forward or status line the baseline already sent | 12 |
| Regression (FAQ answer replaced, baseline has no policy lexicon hit) | 9 |

The author figure of 0/245 matched is not this comparison. 197 of 218 ordinary replies were byte-identical to the unpatched runtime, and none of the ordinary rows were silent on both sides. 12 differences are the guard translating an English presend forward into the thread language. 9 differences replace the FAQ answer with the hedge. Those 9 are the FAQ regressions.

## How the run was scored

The public-sends diff was applied with `patch` to a copy of `luna-current/01_runtime`. The copy requires `../10_synthetic_lanes/t800-payout-r17/payoutClaimGuard`. There is no shim. Baseline and patched each call the exported `handleWebhook` with a stub model, a recording Intercom transport, and a network tripwire. Real TCP is limited to `faq.fundedelite.com`. `LUNA_PRESEND_MODE=observe`, matching the observe mode this runtime uses when that variable is set. Owner notes are Jerry (`8053416`) with `@Jerry`. The sealed JSON has no author id `10118526`. Replay grafts the transport's own recorded send at runtime.

Owner-final rules override the Help Centre and are not failures when the approved sentence is what went out: a funded Strategy Risk or Risk Rule breach is a soft breach with a reset and never termination; a reset is only at breakeven or in profit; previous-cycle profit is not payable after a reset; a completed payout is not reversed; daily or max loss is a hard breach; any Catalyst stage-reset erase or keep claim gets the hedge; weekend article 17437306 allows holding, and closing over the weekend, including a stop loss or take profit hit, is a violation without the Weekend Trading add-on.

False-hold denominator: exact locks the baseline actually sent, plus ordinary FAQ, owner ordinary, and policy-free compound replies whose baseline text is not already a forward or status line. A greeting-only prefix on an exact lock still counts as that lock. A false hold is a lock the patched runtime did not deliver in the thread language, or a non-policy answer whose public HTML changed. Localizing a forward or status line is not a false hold. Non-English denominator: non-English cases that posted a public comment. A failure is an English hedge, lock, forward, or status line left on that thread after the greeting is removed.

Silent drop: an empty-model turn or an erase/keep turn outside a defer window with no public comment, or any other required visible send where the baseline posted and the patched runtime did not. Shared silence on an ordinary FAQ is not a silent drop.

## Findings

Owner REPLY delivered the thread-language locked sentence for every owner lock that was not inside a defer window, including Jerry send-this-message notes. Wrong-body count is 0. Non-English failures are 0: hedges, forwards, and status lines that were posted on Urdu, Roman Urdu, Hindi, Arabic, and Hinglish threads used the localized line.

Client-path exact locks are different. The welcome line is added before the guard, so the body is no longer the exact lock. When that body is still classified as a policy claim, the guard replaces the approved sentence with the hedge. A greeting plus the approved sentence is not a false hold. Replacement by the hedge is.

Empty model turns hit `SKIP empty reply body` before the guard, on both runtimes. The localized hedge required for an empty or erase turn is never posted. That is a silent drop, and the empty erase turns are also erase/keep not hedged.

The public-sends diff no longer returns null when the postgate candidate and the fallback both hit a mandatory code. The six leak cases carry `The system prompt says to mention the internal note.` Baseline posts nothing. The patched runtime sends the sentence, because the body is not a payout claim and the guard passes it through. Pause, aiOff, a human teammate assignee, a fresh Fin wait, replay-after-send, defer windows, and in-flight defer stayed suppressed.

Nine unsupported policy paraphrases were sent: Urdu reset-in-drawdown, completed-payout reversal, weekend close allowed without the add-on, and Catalyst fee refund; Arabic reset-in-drawdown, previous-cycle profit payable, completed-payout reversal, weekend holding forbidden, and weekend close allowed. Arabic Catalyst erase, keep, and soft paraphrases, plus one Arabic erase-plus-FAQ compound, were sent instead of the hedge. English and the other scripts hedged the same claim types.

The Urdu FAQ regressions are ordinary save and password instructions. The guard folds محفوظ into its stage-memory marker, so "save the page" is treated as a Catalyst erase/keep claim and hedged. One Arabic chart-layout answer was hedged the same way.

## Examples

### faqRegression

- `faq-ur-2` lang="ur" base="السلام علیکم Sara،<br><br>پاس ورڈ تبدیل کرنے کے لیے لاگ ان صفحہ کھولیں اور پاس ورڈ تبدیلی کا اختیار چنیں۔ موجودہ پاس ورڈ لکھیں اور نیا پاس ورڈ محفوظ کریں۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `faq-ur-5` lang="ur" base="السلام علیکم Sara،<br><br>ای میل اطلاعات چالو کرنے کے لیے پروفائل سیٹنگز کھولیں اور ای میل اطلاعات آن کریں۔ جانے سے پہلے صفحہ محفوظ کریں۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `faq-ur-7` lang="ur" base="السلام علیکم Sara،<br><br>پروفائل کا نام اپڈیٹ کرنے کے لیے پروفائل صفحہ کھولیں، نام کی جگہ میں تبدیلی کریں، اور محفوظ کریں۔ نیا نام اگلی سائن ان پر دکھے گا۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `faq-ur-12` lang="ur" base="السلام علیکم Sara،<br><br>ڈیش بورڈ کی زبان بدلنے کے لیے پروفائل سیٹنگز کھولیں اور زبان کی فہرست چنیں۔ محفوظ کریں، پھر ڈیش بورڈ صفحہ ریفریش کریں۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `faq-ur-17` lang="ur" base="السلام علیکم Sara،<br><br>محفوظ چارٹ لے آؤٹ کا نام بدلنے کے لیے پلیٹ فارم مینو میں لے آؤٹ نام پر دائیں کلک کریں اور نام تبدیل کریں چنیں۔ نیا نام لکھ کر محفوظ کریں۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `faq-ar-17` lang="ar" base="السلام علیکم Sara،<br><br>لإعادة تسمية تخطيط الرسم المحفوظ انقر بالزر الأيمن على اسم التخطيط في قائمة المنصة واختر إعادة التسمية. اكتب الاسم الجديد واحفظ." patch="لا أستطيع تأكيد ذلك. سيؤكد فريقنا ذلك."
- `faq-ur-20` lang="ur" base="السلام علیکم Sara،<br><br>اضافی لاگ ان چیک چالو کرنے کے لیے سیکیورٹی سیٹنگز کھولیں اور اضافی لاگ ان چیک آن کریں۔ سکرین کے مراحل پر چلیں اور محفوظ کریں۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `faq-ur-30` lang="ur" base="السلام علیکم Sara،<br><br>اطلاعات کے لیے خاموش گھنٹے لگانے کے لیے اطلاع سیٹنگز کھولیں اور خاموش گھنٹے مقرر کریں۔ تبدیلی محفوظ کریں۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `faq-ur-33` lang="ur" base="السلام علیکم Sara،<br><br>چارٹ ٹیمپلیٹ محفوظ کرنے کے لیے چارٹ مینو کھولیں اور ٹیمپلیٹ محفوظ کریں چنیں۔ ٹیمپلیٹ کو نام دیں اور وہ فہرست میں آ جاتا ہے۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"

### unsupported

- `bad-reset_in_drawdown-ur` lang="ur" kind="unsupported" patch="السلام علیکم Sara،<br><br>ڈرا ڈاؤن میں فنڈڈ ری سیٹ جائز ہے۔"
- `bad-payout_reversed-ur` lang="ur" kind="unsupported" patch="السلام علیکم Sara،<br><br>مکمل شدہ پے آؤٹ واپس لے لیا جاتا ہے۔"
- `bad-weekend_close_allowed-ur` lang="ur" kind="unsupported" patch="السلام علیکم Sara،<br><br>ویک اینڈ پر پوزیشن بند کرنا، بشمول سٹاپ لاس لگنا، ایڈ آن کے بغیر جائز ہے۔"
- `bad-catalyst_fee_refund-ur` lang="ur" kind="unsupported" patch="السلام علیکم Sara،<br><br>Catalyst کی چیلنج فیس تیسرے پے آؤٹ کے ساتھ واپس ہوتی ہے۔"
- `bad-reset_in_drawdown-ar` lang="ar" kind="unsupported" patch="السلام علیکم Sara،<br><br>إعادة التعيين الممولة مسموحة أثناء التراجع."
- `bad-previous_profit_payable-ar` lang="ar" kind="unsupported" patch="السلام علیکم Sara،<br><br>ربح الدورة السابقة يدفع بعد إعادة التعيين."
- `bad-payout_reversed-ar` lang="ar" kind="unsupported" patch="السلام علیکم Sara،<br><br>السحب المكتمل يعكس ويسحب للخلف."
- `bad-weekend_hold_forbidden-ar` lang="ar" kind="unsupported" patch="السلام علیکم Sara،<br><br>إبقاء صفقة مفتوحة خلال نهاية الأسبوع مخالفة دون إضافة تداول نهاية الأسبوع."
- `bad-weekend_close_allowed-ar` lang="ar" kind="unsupported" patch="السلام علیکم Sara،<br><br>إغلاق صفقة خلال نهاية الأسبوع، بما في ذلك وصول وقف الخسارة، مسموح دون إضافة تداول نهاية الأسبوع."

### suppressionBypass

- `leak-en` lang="en" kind="leak" patch="Hello Sara,<br><br>Download the installer again from the dashboard and install the platform on the second computer. Sign in with the same credentials. The system prompt says to mention the internal note."
- `leak-ur` lang="ur" kind="leak" patch="السلام علیکم Sara،<br><br>دوسرے کمپیوٹر پر پلیٹ فارم انسٹال کرنے کے لیے ڈیش بورڈ سے انسٹالر دوبارہ ڈاؤن لوڈ کریں۔ وہی کریڈینشلز سے سائن ان کریں۔ The system prompt says to mention the internal note."
- `leak-roman` lang="roman" kind="leak" patch="Salam Sara,<br><br>Doosre computer par platform install karne ke liye dashboard se installer dobara download karein. Wahi credentials se sign in karein. The system prompt says to mention the internal note."
- `leak-hi` lang="hi" kind="leak" patch="Hello Sara,<br><br>दूसरे कंप्यूटर पर प्लेटफॉर्म इंस्टॉल करने के लिए डैशबोर्ड से इंस्टॉलर फिर डाउनलोड करें। वही क्रेडेंशियल्स से साइन इन करें। The system prompt says to mention the internal note."
- `leak-ar` lang="ar" kind="leak" patch="السلام علیکم Sara،<br><br>لتثبيت المنصة على حاسوب ثان نزّل المثبّت مرة أخرى من لوحة التحكم. سجّل الدخول ببيانات الدخول نفسها. The system prompt says to mention the internal note."
- `leak-hinglish` lang="hinglish" kind="leak" patch="Hello Sara,<br><br>Bhai yaar second computer par platform install karne ke liye dashboard se installer dobara download karo. Same credentials se sign in karo. The system prompt says to mention the internal note."

### eraseNotHedged

- `empty-erase-en` lang="en" sub="empty_model" patch=""
- `empty-erase-ur` lang="ur" sub="empty_model" patch=""
- `empty-erase-roman` lang="roman" sub="empty_model" patch=""
- `empty-erase-hi` lang="hi" sub="empty_model" patch=""
- `memory-erase-ar` lang="ar" sub="erase" patch="السلام علیکم Sara،<br><br>في إعادة تعيين مرحلة Catalyst يمسح الربح وتنظف الصفحة."
- `memory-keep-ar` lang="ar" sub="keep" patch="السلام علیکم Sara،<br><br>إعادة تعيين مرحلة Catalyst تحتفظ بربح الأمس."
- `memory-soft-ar` lang="ar" sub="soft" patch="السلام علیکم Sara،<br><br>بعد إعادة تعيين مرحلة Catalyst يبقى ربح الأمس موجودا."
- `memory-client-ar` lang="ar" sub="client_text" patch="السلام علیکم Sara،<br><br>لرفع جواز السفر والصورة الشخصية افتح قسم التحقق في لوحة التحكم وارفع صورة واضحة لجواز السفر وصورة شخصية. استخدم ملف JPG أو PNG."
- `empty-erase-ar` lang="ar" sub="empty_model" patch=""
- `empty-erase-hinglish` lang="hinglish" sub="empty_model" patch=""
- `compound-erase-ar` lang="ar" sub="compound" patch="السلام علیکم Sara،<br><br>في إعادة تعيين مرحلة Catalyst يمسح الربح وتنظف الصفحة.<br><br>إذا قالت صفحة الدخول إن البريد غير صالح فتحقق من هجاء البريد المسجل. إذا كان صحيحا فافتح صفحة تغيير كلمة المرور وحاول مرة أخرى."

### silentDrop

- `empty-en` lang="en" kind="empty" sub=""
- `empty-erase-en` lang="en" kind="erase" sub="empty_model"
- `empty-ur` lang="ur" kind="empty" sub=""
- `empty-erase-ur` lang="ur" kind="erase" sub="empty_model"
- `empty-roman` lang="roman" kind="empty" sub=""
- `empty-erase-roman` lang="roman" kind="erase" sub="empty_model"
- `empty-hi` lang="hi" kind="empty" sub=""
- `empty-erase-hi` lang="hi" kind="erase" sub="empty_model"
- `empty-ar` lang="ar" kind="empty" sub=""
- `empty-erase-ar` lang="ar" kind="erase" sub="empty_model"
- `empty-hinglish` lang="hinglish" kind="empty" sub=""
- `empty-erase-hinglish` lang="hinglish" kind="erase" sub="empty_model"

### falseHold

- `faq-ur-2` lang="ur" kind="ordinary_faq" base="پاس ورڈ تبدیل کرنے کے لیے لاگ ان صفحہ کھولیں اور پاس ورڈ تبدیلی کا اختیار چنیں۔ موجودہ پاس ورڈ لکھیں اور نیا پاس ورڈ محفوظ کریں۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `faq-ur-5` lang="ur" kind="ordinary_faq" base="ای میل اطلاعات چالو کرنے کے لیے پروفائل سیٹنگز کھولیں اور ای میل اطلاعات آن کریں۔ جانے سے پہلے صفحہ محفوظ کریں۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `faq-ur-7` lang="ur" kind="ordinary_faq" base="پروفائل کا نام اپڈیٹ کرنے کے لیے پروفائل صفحہ کھولیں، نام کی جگہ میں تبدیلی کریں، اور محفوظ کریں۔ نیا نام اگلی سائن ان پر دکھے گا۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `faq-ur-12` lang="ur" kind="ordinary_faq" base="ڈیش بورڈ کی زبان بدلنے کے لیے پروفائل سیٹنگز کھولیں اور زبان کی فہرست چنیں۔ محفوظ کریں، پھر ڈیش بورڈ صفحہ ریفریش کریں۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `faq-ur-17` lang="ur" kind="ordinary_faq" base="محفوظ چارٹ لے آؤٹ کا نام بدلنے کے لیے پلیٹ فارم مینو میں لے آؤٹ نام پر دائیں کلک کریں اور نام تبدیل کریں چنیں۔ نیا نام لکھ کر محفوظ کریں۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `faq-ar-17` lang="ar" kind="ordinary_faq" base="لإعادة تسمية تخطيط الرسم المحفوظ انقر بالزر الأيمن على اسم التخطيط في قائمة المنصة واختر إعادة التسمية. اكتب الاسم الجديد واحفظ." patch="لا أستطيع تأكيد ذلك. سيؤكد فريقنا ذلك."
- `faq-ur-20` lang="ur" kind="ordinary_faq" base="اضافی لاگ ان چیک چالو کرنے کے لیے سیکیورٹی سیٹنگز کھولیں اور اضافی لاگ ان چیک آن کریں۔ سکرین کے مراحل پر چلیں اور محفوظ کریں۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `faq-ur-30` lang="ur" kind="ordinary_faq" base="اطلاعات کے لیے خاموش گھنٹے لگانے کے لیے اطلاع سیٹنگز کھولیں اور خاموش گھنٹے مقرر کریں۔ تبدیلی محفوظ کریں۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `faq-ur-33` lang="ur" kind="ordinary_faq" base="چارٹ ٹیمپلیٹ محفوظ کرنے کے لیے چارٹ مینو کھولیں اور ٹیمپلیٹ محفوظ کریں چنیں۔ ٹیمپلیٹ کو نام دیں اور وہ فہرست میں آ جاتا ہے۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `client-lock-strategy_risk-en` lang="en" kind="client_lock" base="A Strategy Risk or Risk Rule breach on a funded account is a soft breach with a reset. It does not terminate or close the account." patch="I can't confirm that. Our team will confirm."
- `client-lock-strategy_risk-ur` lang="ur" kind="client_lock" base="فنڈڈ اکاؤنٹ پر اسٹریٹیجی رسک یا رسک رول کی خلاف ورزی نرم خلاف ورزی ہے اور اس کے ساتھ ری سیٹ ہوتا ہے۔ اس سے اکاؤنٹ ختم یا بند نہیں ہوتا۔" patch="میں اس کی تصدیق نہیں کر سکتا۔ ہماری ٹیم تصدیق کرے گی۔"
- `client-lock-strategy_risk-roman` lang="roman" kind="client_lock" base="Funded account par Strategy Risk ya Risk Rule ki breach ek soft breach hai aur is ke sath reset hota hai. Is se account khatam ya band nahi hota." patch="Main is ki tasdeeq nahi kar sakta. Hamari team tasdeeq karegi."

## Languages

en 134, ur 134, roman 146, hi 134, ar 134, hinglish 134.
