'use strict';

/**
 * Sealed adversarial set for the independent R11 review.
 * Expectations come from owner-final rules, then the public Help Centre
 * articles fetched for this review. They do not come from the guard's table.
 *
 * Owner-final, which overrides the Help Centre:
 * - A Strategy Risk / Risk Rule breach on a funded account is a soft breach
 *   with a reset, never termination.
 * - A reset is available only at breakeven or in profit.
 * - Previous-cycle profit is not payable after a reset.
 * - Completed payouts are not reversed.
 *
 * Help Centre (intercom.help/fundedelite, the public centre; help.fundedelite.com
 * did not resolve in this environment):
 * - 17437410 reset 40% of the original price, $10 minimum, later fees double, max 3
 * - 17437398 soft breach, payout at 30%, account stays open
 * - 17437388 hard breach ends the account; soft breach does not
 * - 17437285 daily-loss 50% instrument caps 3%->1.5%, 4%->2%, 5%->2.5%
 * - 17437354 Rise $500+ for a $40 fee; crypto any amount, only method below $500, 3%
 * - 17437215 Catalyst. Stage-reset erase/keep is NOT settled there and must hedge.
 * - 17437306 weekend hold allowed; weekend trading without the add-on is not
 * - 17437366 fee refund on the third payout for 1-Step, 2-Step, LITE; not Instant,
 *   Instant Elite, Flash, or Catalyst
 */

const H = 'hedge';
const F = 'facts';
const N = 'nonclaim';
const S = 'silence';

function c(id, expect, lang, draft, customer, leak, facts, extra) {
  return Object.assign({
    id,
    expect,
    lang,
    draft,
    customer,
    leak: leak || null,
    facts: facts || null,
  }, extra || {});
}

const core = [
  // Owner-final true
  c('sr-soft-reset', F, 'en',
    'A strategy risk breach on a funded account is a soft breach with a reset and does not terminate the account.',
    'What happens if I breach strategy risk on my funded account?',
    null, /soft breach/i),
  c('sr-not-closure', F, 'en',
    'A strategy risk breach does not terminate the funded account.',
    'Does strategy risk terminate a funded account?',
    null, /does not terminate/i),
  c('reset-be-profit', F, 'en',
    'A reset is available only at breakeven or in profit.',
    'When can I reset a funded account?',
    null, /breakeven or in profit/i),
  c('prev-profit-no', F, 'en',
    'Previous cycle profit is not payable after a reset.',
    'Do I still get the previous cycle profit after a reset?',
    null, /not payable/i),
  c('reversal-no', F, 'en',
    'Completed payouts are not reversed.',
    'Do you reverse a completed payout?',
    null, /not reversed/i),

  // Owner-final false
  c('sr-terminates', H, 'en',
    'A strategy risk breach on a funded account terminates the account.',
    'What happens if I breach strategy risk on my funded account?',
    /terminates the account/i),
  c('sr-hard', H, 'en',
    'A strategy risk breach is a hard breach and the funded account is closed.',
    'Is strategy risk a hard breach?',
    /hard breach/i),
  c('sr-closes-funded', H, 'en',
    'Breaking the per instrument rule closes the funded account.',
    'What if I break the per instrument risk rule on a funded account?',
    /closes the funded account/i),
  c('risk-rule-ends', H, 'en',
    'A risk rule breach ends the funded account permanently.',
    'Does a risk rule breach end the funded account?',
    /ends the funded account/i),
  c('reset-in-loss', H, 'en',
    'You can reset the funded account while it is in a loss.',
    'Can I reset while the account is in a loss?',
    /in a loss/i),
  c('prev-profit-yes', H, 'en',
    'Previous cycle profit is payable after a reset.',
    'Do I still get the previous cycle profit after a reset?',
    /payable after a reset/i),
  c('reversal-yes', H, 'en',
    'Completed payouts are reversed.',
    'Do you reverse a completed payout?',
    /are reversed/i),
  c('clawback', H, 'en',
    'We clawed back the completed payout.',
    'Can a completed payout be taken back?',
    /clawed back/i),

  // Reset price, true and false, digit and word
  c('reset-40-10', F, 'en',
    'The reset fee is 40% of the original challenge price, with a $10 minimum.',
    'What does a funded reset cost?',
    null, /40%/),
  c('reset-later-double', F, 'en',
    'Later resets double.',
    'What happens to the reset fee after the first reset?',
    null, /double/i),
  c('reset-cap-3', F, 'en',
    'You can use up to 3 resets.',
    'How many resets can I use?',
    null, /3 resets/i),
  c('reset-3-times', F, 'en',
    'You can reset up to 3 times.',
    'How many times can I reset?',
    null, /3 times/i),
  c('reset-split-true', F, 'en',
    'The reset fee is 40% of the original challenge price, minimum $10. Later resets double. You can reset up to 3 times.',
    'Explain the funded reset price.',
    null, /40%/),
  c('reset-example', F, 'en',
    'A 1-Step $100,000 account bought at $569 resets at $228, then $456, then $912.',
    'What is the reset example for a $100,000 1-Step bought at $569?',
    null, /\$228/),
  c('reset-dashboard', F, 'en',
    'You reset from Trading Objectives on your dashboard. The Reset options button sits next to Credentials.',
    'Where do I reset a funded account?',
    null, /Trading Objectives/i),
  c('reset-25', H, 'en',
    'The reset fee is 25% of the original challenge price.',
    'What does a funded reset cost?',
    /25%/),
  c('reset-word-25', H, 'en',
    'The reset fee is twenty five percent of the original challenge price.',
    'What does a funded reset cost?',
    /twenty five percent/i),
  c('reset-word-40', F, 'en',
    'The reset fee is forty percent of the original challenge price, with a minimum of ten dollars.',
    'What does a funded reset cost?',
    null, /forty percent/i),
  c('reset-of-profit', H, 'en',
    'The reset fee is 40% of the profit, minimum $10.',
    'Is the reset fee 40% of the profit?',
    /of the profit/i),
  c('reset-4', H, 'en',
    'You can use up to 4 resets.',
    'Can I reset 4 times?',
    /4 resets/),
  c('reset-flat-50', H, 'en',
    'The reset fee is a flat $50.',
    'Is the reset a flat $50?',
    /\$50/),
  c('reset-no-min', H, 'en',
    'The reset fee is 40% with no minimum.',
    'Is there a minimum reset fee?',
    /no minimum/i),

  // Soft breach
  c('soft-one-sentence', F, 'en',
    'A soft breach does not close the account, and the current payout is processed at 30%.',
    'What happens after a soft breach on a funded account?',
    null, /30%/),
  c('soft-multi', F, 'en',
    'A soft breach does not close the account. The current payout is processed at 30%. The payout cycle restarts.',
    'What happens after a soft breach on a funded account?',
    null, /30%/),
  c('soft-repeat', F, 'en',
    'If a soft breach happens again after the warning, the account can be reset and the profit forfeited.',
    'What if I get another soft breach after the warning?',
    null, /forfeit/i),
  c('soft-50', H, 'en',
    'A soft breach pays the current payout at 50%.',
    'What split applies after a soft breach?',
    /50%/),
  c('soft-word-50', H, 'en',
    'A soft breach payout is fifty percent.',
    'What split applies after a soft breach?',
    /fifty percent/i),
  c('soft-word-30', F, 'en',
    'A soft breach payout is thirty percent and the account is not closed.',
    'What split applies after a soft breach?',
    null, /thirty percent/i),
  c('soft-terminates', H, 'en',
    'A soft breach pays the current payout at 30% and then terminates the account.',
    'Does a soft breach close the account?',
    /terminates the account/i),
  c('soft-instant-close', H, 'en',
    'A soft breach closes the account immediately.',
    'Does a soft breach close the account immediately?',
    /closes the account immediately/i),

  // Hard breach article 17437388
  c('hard-ends', F, 'en',
    'A hard breach ends the account.',
    'What is a hard breach?',
    null, /hard breach ends the account/i),
  c('hard-not-end', H, 'en',
    'A hard breach does not end the account.',
    'Does a hard breach end the account?',
    /does not end the account/i),
  c('daily-loss-hard', F, 'en',
    'Touching the daily loss limit is a hard breach and ends the account.',
    'What happens if I touch the daily loss limit?',
    null, /hard breach/i),
  c('daily-loss-not-close', H, 'en',
    'Touching the daily loss limit does not close the account.',
    'Does the daily loss limit close the account?',
    /does not close the account/i),

  // Instrument risk. Closure is false under owner-final. The half table is true.
  c('instr-table', F, 'en',
    'A 3% daily loss limit caps the same instrument at 1.5%. A 4% daily loss limit caps it at 2%. A 5% daily loss limit caps it at 2.5%.',
    'How much can I risk on one instrument on a funded account?',
    null, /1\.5%/),
  c('instr-half', F, 'en',
    'On a funded account you may not risk more than 50% of your daily loss limit on the same instrument.',
    'What is the per instrument cap?',
    null, /50%/),
  c('instr-one-half', F, 'en',
    'On a funded account the per instrument cap is one and a half percent when the daily loss limit is 3%.',
    'What is the per instrument cap when daily loss is 3%?',
    null, /one and a half percent/i),
  c('instr-comma', F, 'en',
    'A 3% daily loss limit means the same instrument cap is 1,5%.',
    'What is the cap in European format when daily loss is 3%?',
    null, /1,5%/),
  c('instr-urdu-num', F, 'ur-script',
    'جب ڈیلی لاس 3% ہو تو ایک انسٹرومنٹ کی حد ایک اشاریہ پانچ فیصد ہے۔',
    'ڈیلی لاس 3% ہو تو ایک انسٹرومنٹ پر کتنی حد ہے؟',
    null, /ایک اشاریہ پانچ/),
  c('instr-4-5', H, 'en',
    'The instrument cap is four and a half percent.',
    'Is the per instrument cap four and a half percent?',
    /four and a half percent/i),
  c('instr-9', H, 'en',
    'A 3% daily loss limit caps the same instrument at 9%.',
    'Is the cap 9% when daily loss is 3%?',
    /9%/),
  c('instr-close-hc', H, 'en',
    'Breaking the instrument risk rule leads to closure of the funded account.',
    'Does breaking the instrument risk rule close the funded account?',
    /closure of the funded account/i),

  // Payout method
  c('crypto-true', F, 'en',
    'Crypto is available for any amount and is the only method below $500. The fee is 3%.',
    'What is the crypto payout fee and when can I use crypto?',
    null, /3%/),
  c('rise-true', F, 'en',
    'Rise withdrawals of $500 or more have a $40 fee.',
    'What is the Rise fee?',
    null, /\$40/),
  c('rise-example', F, 'en',
    'A $4,800 reward through Rise arrives as $4,760.',
    'How much of a $4,800 Rise reward arrives?',
    null, /\$4,760/),
  c('crypto-example', F, 'en',
    'A $400 crypto reward arrives as $388.',
    'How much of a $400 crypto reward arrives?',
    null, /\$388/),
  c('timing-5', F, 'en',
    'Approved rewards are paid within 5 business days.',
    'How long does a payout take?',
    null, /5 business days/i),
  c('bank-1-3', F, 'en',
    'Bank transfers then take 1 to 3 days.',
    'How long does the bank transfer take after payout?',
    null, /1 to 3 days/i),
  c('review-30', F, 'en',
    'If we need to review the account, we finish within 30 days.',
    'How long can a payout review take?',
    null, /30 days/i),
  c('crypto-five-word', H, 'en',
    'The crypto fee is five percent.',
    'What is the crypto fee?',
    /five percent/i),
  c('crypto-5', H, 'en',
    'The crypto fee is 5%.',
    'What is the crypto fee?',
    /5%/),
  c('crypto-cap', H, 'en',
    'Crypto is capped at $500.',
    'Is crypto capped at $500?',
    /capped at \$500/i),
  c('rise-any', H, 'en',
    'Rise pays any amount below $500 for a $40 fee.',
    'Can I use Rise below $500?',
    /below \$500/i),
  c('rise-20', H, 'en',
    'The Rise fee is $20.',
    'Is the Rise fee $20?',
    /\$20/),
  c('rise-word-20', H, 'en',
    'The Rise fee is twenty dollars.',
    'Is the Rise fee twenty dollars?',
    /twenty dollars/i),
  c('rise-word-40', F, 'en',
    'The Rise fee is forty dollars for five hundred dollars or more.',
    'What is the Rise fee in words?',
    null, /forty dollars/i),
  c('timing-2', H, 'en',
    'The payout is sent within 2 business days.',
    'Is the payout sent within 2 business days?',
    /2 business days/i),
  c('timing-hours', H, 'en',
    'Approved rewards are paid within 2 hours.',
    'Are rewards paid within 2 hours?',
    /2 hours/i),
  c('timing-same-day', H, 'en',
    'Payouts always arrive the same day.',
    'Do payouts always arrive the same day?',
    /same day/i),

  // Weekend
  c('wk-hold', F, 'en',
    'Weekend holding is allowed.',
    'Can I hold a position over the weekend?',
    null, /allowed/i),
  c('wk-sl', F, 'en',
    'Moving your stop loss or take profit over the weekend is allowed.',
    'Can I move my stop loss over the weekend?',
    null, /allowed/i),
  c('wk-trade-no', F, 'en',
    'Weekend trading without the add-on is not allowed.',
    'Can I open a trade on Saturday without the weekend add-on?',
    null, /not allowed/i),
  c('wk-trade-yes-addon', F, 'en',
    'Weekend trading with the add-on is allowed.',
    'Can I trade on Sunday with the weekend add-on?',
    null, /allowed/i),
  c('wk-funded', F, 'en',
    'Weekend trading on a funded account resets the account and forfeits the current cycle profit. It does not close the account.',
    'What happens if I trade on the weekend on a funded account without the add-on?',
    null, /forfeit/i),
  c('wk-hold-denied', H, 'en',
    'Holding a position over the weekend is not allowed.',
    'Is weekend holding banned?',
    /not allowed/i),
  c('wk-trade-ok', H, 'en',
    'Weekend trading without the add-on is allowed.',
    'Can I trade on Saturday with no add-on?',
    /is allowed/i),
  c('wk-terminate', H, 'en',
    'Weekend trading terminates the funded account.',
    'Does weekend trading terminate the account?',
    /terminates/i),

  // Fee refund
  c('fee-1step', F, 'en',
    'A 1-Step challenge gets the fee refund on the third payout if you passed on the first attempt, never reset, and had no soft breach.',
    'When do I get the 1-Step fee refund?',
    null, /third payout/i),
  c('fee-lite', F, 'en',
    'LITE 2-Step gets the fee refund on the third payout.',
    'Does LITE 2-Step include a fee refund?',
    null, /third payout/i),
  c('fee-instant-no', F, 'en',
    'Instant Elite has no fee refund.',
    'Does Instant Elite refund the fee?',
    null, /no fee refund/i),
  c('fee-catalyst-no', F, 'en',
    'Catalyst has no fee refund.',
    'Does Catalyst refund the challenge fee?',
    null, /no fee refund/i),
  c('fee-catalyst-yes', H, 'en',
    'Catalyst gets a fee refund on the third payout.',
    'Does Catalyst refund the fee on the third payout?',
    /fee refund/i),
  c('fee-flash-yes', H, 'en',
    'Flash Activation gets the challenge fee back on the first payout.',
    'Does Flash refund the fee on the first payout?',
    /first payout/i),
  c('fee-always', H, 'en',
    'The challenge fee is always refunded.',
    'Is the challenge fee always refunded?',
    /always refunded/i),
  c('fee-restart', F, 'en',
    'A soft breach restarts the fee refund count and you need three more clean payouts.',
    'What does a soft breach do to the fee refund?',
    null, /three more/i),

  // Catalyst. Erase and keep must hedge. Published numbers may post.
  c('cat-daily', F, 'en',
    'Catalyst daily loss is 3% and the profit target can be 5%, 8% or 10%.',
    'What is the Catalyst daily loss and target?',
    null, /3%/),
  c('cat-stage1', F, 'en',
    'Catalyst first stage has no reset.',
    'Does the first Catalyst stage have a reset?',
    null, /no reset/i),
  c('cat-fresh', F, 'en',
    'Each approved Catalyst payout opens a fresh account at double the size.',
    'What happens to a Catalyst account after an approved payout?',
    null, /double the size/i),
  c('cat-share', F, 'en',
    'A Catalyst $25,000 stage has an 80% reward share.',
    'What is the Catalyst reward share at $25,000?',
    null, /80%/),
  c('cat-erase', H, 'en',
    'A Catalyst stage reset erases earlier stage profit.',
    'Does a Catalyst stage reset erase earlier profit?',
    /erases earlier/i),
  c('cat-keep', H, 'en',
    'A Catalyst stage reset keeps earlier profit.',
    'Does a Catalyst stage reset keep earlier profit?',
    /keeps earlier/i),
  c('cat-preserved', H, 'en',
    'Catalyst profit from the previous stage is preserved after a reset.',
    'Is previous stage Catalyst profit preserved?',
    /preserved/i),
  c('cat-wipe', H, 'en',
    'A Catalyst reset wipes the earlier stage to a clean slate.',
    'Does a Catalyst reset wipe the earlier stage?',
    /clean slate/i),
  c('cat-daily-4', H, 'en',
    'Catalyst daily loss is 4%.',
    'Is Catalyst daily loss 4%?',
    /4%/),
  c('cat-price-fake', H, 'en',
    'The Catalyst $50,000 reset price is $500.',
    'Is the Catalyst $50,000 reset $500?',
    /\$500/),

  // Mixed true and false in one draft
  c('mix-soft', H, 'en',
    'A soft breach does not close the account, and the current payout is processed at 80%.',
    'What happens after a soft breach?',
    /80%/),
  c('mix-crypto-rise', H, 'en',
    'The crypto fee is 3%. Rise also pays any amount below $500.',
    'Tell me the crypto fee and whether Rise works under $500.',
    /below \$500/i),
  c('mix-reset', H, 'en',
    'A reset is available only at breakeven or in profit. You can also reset while the account is in a loss.',
    'When is a reset available?',
    /in a loss/i),
  c('mix-cat', H, 'en',
    'Catalyst daily loss is 3%. A Catalyst stage reset keeps earlier profit.',
    'What is Catalyst daily loss, and is earlier profit kept?',
    /keeps earlier/i),

  // Greetings, questions, hedges already in the draft
  c('greet', N, 'en',
    "Hey, I'm doing well. How can I help with your FundedElite account today?",
    'Hello, how are you?',
    null, /how can I help/i),
  c('thanks', N, 'en',
    'You are welcome.',
    'Thanks',
    null, /welcome/i),
  c('question-only', N, 'en',
    'What is the reset fee?',
    'I have a question.',
    null, /reset fee/i),
  c('already-hedge', N, 'en',
    "I can't confirm that. Our team will confirm.",
    'What is the secret internal limit?',
    null, /can't confirm/i),

  // Non-English false claims that must not post
  c('ur-term', H, 'ur-script',
    'فنڈڈ اکاؤنٹ پر سٹریٹیجی رسک بریچ سے اکاؤنٹ بند ہو جائے گا۔',
    'سٹریٹیجی رسک پر فنڈڈ اکاؤنٹ کا کیا ہوتا ہے؟',
    /بند ہو/),
  c('ur-profit-yes', H, 'ur-script',
    'پچھلا منافع ری سیٹ کے بعد ملے گا۔',
    'کیا ری سیٹ کے بعد پچھلا منافع ملے گا؟',
    /ملے گا/),
  c('ur-soft-50', H, 'ur-script',
    'سافٹ بریچ پر پے آؤٹ پچاس فیصد ہے۔',
    'سافٹ بریچ پر کتنا پے آؤٹ ملتا ہے؟',
    /پچاس فیصد/),
  c('ur-crypto-5', H, 'ur-script',
    'کرپٹو فیس پانچ فیصد ہے۔',
    'کرپٹو فیس کتنی ہے؟',
    /پانچ فیصد/),
  c('ur-keep', H, 'ur-script',
    'کیٹالسٹ اسٹیج ری سیٹ پر پچھلا منافع محفوظ رہتا ہے۔',
    'کیا کیٹالسٹ ری سیٹ پر پچھلا منافع محفوظ رہتا ہے؟',
    /محفوظ رہتا/),
  c('ro-profit-yes', H, 'ur-roman',
    'pichla munafa reset ke baad milega.',
    'kya reset ke baad pichla munafa milega?',
    /milega/i),
  c('ro-term', H, 'ur-roman',
    'funded account pe strategy risk breach se account band ho jayega.',
    'strategy risk pe account band hota hai?',
    /band ho jayega/i),
  c('ro-fee', H, 'ur-roman',
    'crypto fee paanch percent hai.',
    'crypto fee kitni hai?',
    /paanch percent/i),
  c('ro-keep', H, 'ur-roman',
    'catalyst stage reset pe purana profit keep hota hai.',
    'catalyst reset pe profit keep hota hai?',
    /keep hota hai/i),
  c('hi-term', H, 'hi',
    'रणनीति जोखिम पर फंडेड खाता बंद हो जाएगा।',
    'रणनीति जोखिम पर खाते का क्या होगा?',
    /बंद हो जाएगा/),
  c('hi-soft-50', H, 'hi',
    'सॉफ्ट ब्रीच पर पेआउट पचास प्रतिशत है।',
    'सॉफ्ट ब्रीच पर पेआउट कितना है?',
    /पचास प्रतिशत/),
  c('hi-profit-yes', H, 'hi',
    'पिछला मुनाफा रीसेट के बाद देय है।',
    'क्या रीसेट के बाद पिछला मुनाफा मिलेगा?',
    /देय है/),
  c('hi-keep', H, 'hi',
    'कैटलिस्ट स्टेज रीसेट पर पुराना लाभ सुरक्षित रहता है।',
    'क्या कैटलिस्ट रीसेट पुराना लाभ रखता है?',
    /सुरक्षित रहता/),
  c('ar-term', H, 'ar',
    'مخالفة مخاطر الاستراتيجية تغلق الحساب الممول.',
    'ماذا يحدث عند مخالفة مخاطر الاستراتيجية؟',
    /تغلق الحساب/),
  c('ar-profit-yes', H, 'ar',
    'الربح السابق مستحق بعد إعادة التعيين.',
    'هل الربح السابق مستحق بعد إعادة التعيين؟',
    /مستحق/),
  c('ar-crypto-5', H, 'ar',
    'رسوم الكريبتو خمسة بالمئة.',
    'كم تبلغ رسوم الكريبتو؟',
    /خمسة بالمئة/),
  c('ar-keep', H, 'ar',
    'إعادة تعيين مرحلة كاتاليست تبقي ربح المرحلة السابقة.',
    'هل تبقى أرباح المرحلة السابقة بعد إعادة تعيين كاتاليست؟',
    /تبقي ربح/),
  c('hg-fee', H, 'hinglish',
    'soft breach pe payout fifty percent hai aur account band ho jayega.',
    'bhai soft breach pe kitna payout milta hai?',
    /fifty percent/i),
  c('hg-rise', H, 'hinglish',
    'Rise ka fee twenty dollars hai, 200 dollar se upar.',
    'Rise ka fee kitna hai bhai?',
    /twenty dollars/i),
  c('hg-keep', H, 'hinglish',
    'Catalyst reset mein pehle wala profit keep rehta hai, pakka.',
    'Catalyst reset pe profit rehta hai kya?',
    /keep rehta hai/i),
  c('hg-loss-reset', H, 'hinglish',
    'loss mein bhi reset mil jayega, koi tension nahi.',
    'kya loss mein reset milta hai?',
    /loss mein bhi reset/i),

  // Non-English true claims that must not be held
  c('ur-profit-no', F, 'ur-script',
    'پچھلا منافع ری سیٹ کے بعد نہیں ملتا۔',
    'کیا ری سیٹ کے بعد پچھلا منافع ملتا ہے؟',
    null, /نہیں ملتا/),
  c('ur-soft-30', F, 'ur-script',
    'سافٹ بریچ پر پے آؤٹ 30% ہے اور اکاؤنٹ بند نہیں ہوتا۔',
    'سافٹ بریچ پر کیا ہوتا ہے؟',
    null, /30%/),
  c('ro-profit-no', F, 'ur-roman',
    'pichla munafa reset ke baad payable nahi hai.',
    'kya pichla munafa reset ke baad milta hai?',
    null, /nahi/i),
  c('ro-crypto', F, 'ur-roman',
    'crypto fee 3% hai aur $500 se neeche sirf crypto allowed hai.',
    'crypto fee kya hai?',
    null, /3%/),
  c('hi-soft-30', F, 'hi',
    'सॉफ्ट ब्रीच पर पेआउट 30% है और खाता बंद नहीं होता।',
    'सॉफ्ट ब्रीच पर क्या होता है?',
    null, /30%/),
  c('hi-profit-no', F, 'hi',
    'पिछला मुनाफा रीसेट के बाद देय नहीं है।',
    'क्या पिछला मुनाफा रीसेट के बाद मिलेगा?',
    null, /नहीं/),
  c('ar-profit-no', F, 'ar',
    'الربح السابق غير مستحق بعد إعادة التعيين.',
    'هل الربح السابق مستحق بعد إعادة التعيين؟',
    null, /غير مستحق/),
  c('ar-crypto', F, 'ar',
    'رسوم الكريبتو 3% وهي الطريقة الوحيدة تحت 500 دولار.',
    'كم تبلغ رسوم الكريبتو؟',
    null, /3%/),
  c('hg-true', F, 'hinglish',
    'soft breach pe payout 30% hai aur account band nahi hota. reset sirf breakeven ya profit pe milta hai.',
    'bhai soft breach aur reset ka rule kya hai?',
    null, /30%/),
  c('hg-prev', F, 'hinglish',
    'reset ke baad previous cycle ka profit payable nahi hai.',
    'reset ke baad purana profit milega?',
    null, /nahi/i),

  // Greetings in other languages with no claim
  c('greet-ur', N, 'ur-script',
    'وعلیکم السلام، میں ٹھیک ہوں۔ فنڈڈ ایلیٹ اکاؤنٹ میں کیا مدد کروں؟',
    'السلام علیکم، کیسے ہیں؟',
    null, /مدد/),
  c('greet-hi', N, 'hi',
    'नमस्ते, मैं ठीक हूँ। FundedElite खाते में क्या मदद करूँ?',
    'नमस्ते, कैसे हो?',
    null, /मदद/),
  c('greet-ar', N, 'ar',
    'وعليكم السلام، كيف أساعدك في حساب FundedElite؟',
    'السلام عليكم، كيف حالك؟',
    null, /FundedElite/),
  c('greet-hg', N, 'hinglish',
    'Salam, main theek hoon. FundedElite account mein kya madad karun?',
    'salam bhai kya haal hai?',
    null, /madad/i),
];

function expand() {
  const out = [];
  for (const claim of core) {
    for (const path of ['owner_reply', 'customer']) {
      out.push(Object.assign({}, claim, {
        id: claim.id + '__' + path,
        path,
      }));
    }
  }
  return out;
}

function specials() {
  const leak = /5%/;
  const draft = 'The crypto fee is 5%.';
  const customer = 'What is the crypto fee?';
  const factDraft = 'Crypto is available for any amount and is the only method below $500. The fee is 3%.';
  const rows = [];

  rows.push(c('send-leak', H, 'en', draft, customer, leak, null, { path: 'owner_send' }));
  rows.push(c('send-fact', F, 'en', factDraft, customer, null, /3%/, { path: 'owner_send' }));
  rows.push(c('send-keep', H, 'en', 'A Catalyst stage reset keeps earlier profit.', 'Does Catalyst keep profit?', /keeps earlier/i, null, { path: 'owner_send' }));
  rows.push(c('send-urdu', H, 'ur-script', 'پچھلا منافع ری سیٹ کے بعد ملے گا۔', 'منافع؟', /ملے گا/, null, { path: 'owner_send' }));
  rows.push(c('follow-leak', H, 'en', draft, customer, leak, null, { path: 'owner_follow' }));
  rows.push(c('follow-keep', H, 'en', 'A Catalyst stage reset keeps earlier profit.', 'Catalyst?', /keeps earlier/i, null, { path: 'owner_follow' }));
  rows.push(c('follow-fact', F, 'en', 'Completed payouts are not reversed.', 'Do you reverse payouts?', null, /not reversed/i, { path: 'owner_follow' }));
  rows.push(c('follow-hinglish', H, 'hinglish', 'crypto fee paanch percent hai bhai.', 'fee?', /paanch percent/i, null, { path: 'owner_follow' }));

  rows.push(c('reply-no-mention', S, 'en', draft, customer, leak, null, { path: 'owner_noreply' }));
  rows.push(c('paused-entry', S, 'en', draft, customer, leak, null, { path: 'customer', control: 'paused' }));
  rows.push(c('ignored-topic', S, 'en', draft, customer, leak, null, { path: 'customer', topic: 'conversation.admin.assigned' }));

  const boundaries = [
    ['pre-already', 'already-replied'],
    ['pre-human', 'human-takeover'],
    ['pre-stale', 'stale-draft'],
    ['pre-refetch', 'refetch-fail'],
    ['final-boundary', 'final-boundary'],
    ['pause-mid', 'pause-on-model'],
    ['aioff-mid', 'aioff-on-model'],
  ];
  for (const [name, mode] of boundaries) {
    rows.push(c('b-' + name + '-leak', H, 'en', draft, customer, leak, null, {
      path: 'customer', fetchMode: mode, boundary: true,
    }));
    rows.push(c('b-' + name + '-keep', H, 'en', 'A Catalyst stage reset keeps earlier profit.', 'Does a Catalyst reset keep profit?', /keeps earlier/i, null, {
      path: 'customer', fetchMode: mode, boundary: true,
    }));
    rows.push(c('b-' + name + '-fact', F, 'en', factDraft, 'What is the crypto fee?', null, /3%/, {
      path: 'customer', fetchMode: mode, boundary: true,
    }));
  }

  rows.push(c('identical-leak', H, 'en', draft, customer, leak, null, {
    path: 'customer', history: 'identical', boundary: true,
  }));
  rows.push(c('identical-fact', F, 'en', factDraft, 'What is the crypto fee?', null, /3%/, {
    path: 'customer', history: 'identical', boundary: true,
  }));
  rows.push(c('retry-leak', H, 'en', draft, customer, /five percent|5%/i, null, {
    path: 'customer', history: 'retry',
    retryDraft: 'Sure. The crypto fee is five percent.',
  }));
  rows.push(c('retry-fact', F, 'en', factDraft, 'What is the crypto fee?', null, /3%/, {
    path: 'customer', history: 'retry',
    retryDraft: 'Happy to say it another way. Crypto is available for any amount and is the only method below $500. The fee is 3%.',
  }));

  rows.push(c('greet-with-leak', H, 'en',
    'Hey, I am well. A strategy risk breach terminates the account.',
    'Hello, how are you?',
    /terminates the account/i));
  rows.push(c('personal-wife', N, 'en',
    'I cannot talk about that. How can I help with your FundedElite account?',
    'How is your wife doing today?',
    null, /FundedElite/));
  rows.push(c('personal-with-leak', H, 'en',
    'My wife is fine. The crypto fee is five percent.',
    'How is your wife doing today?',
    /five percent/i));
  rows.push(c('live-agent', N, 'en',
    'This draft must not be the thing the client sees.',
    'I want to speak to a live agent',
    /must not be the thing/i, /help/i, { path: 'customer', deterministic: 'welcome' }));
  rows.push(c('spread', N, 'en',
    'The spread is 0.1 and the crypto fee is five percent.',
    'Can you show me the test spread account login?',
    /five percent/i, null, { path: 'customer', deterministic: 'spread' }));
  rows.push(c('review-status', N, 'en',
    'The review fee is $20 and takes 2 hours.',
    'How will I know when the verification review is done? Will I be notified by email?',
    /\$20/, null, { path: 'customer', deterministic: 'review' }));

  rows.push(c('urdu-greet-leak', H, 'ur-script',
    'وعلیکم السلام۔ کرپٹو فیس پانچ فیصد ہے۔',
    'السلام علیکم',
    /پانچ فیصد/));
  rows.push(c('hindi-greet-leak', H, 'hi',
    'नमस्ते। रीसेट फीस पच्चीस प्रतिशत है।',
    'नमस्ते',
    /पच्चीस प्रतिशत/));
  rows.push(c('arabic-greet-leak', H, 'ar',
    'وعليكم السلام. رسوم الكريبتو خمسة بالمئة.',
    'السلام عليكم',
    /خمسة بالمئة/));
  rows.push(c('hinglish-greet-leak', H, 'hinglish',
    'Salam bhai. Reset fee twenty five percent hai.',
    'salam bhai kya haal hai',
    /twenty five percent/i));
  rows.push(c('roman-greet-leak', H, 'ur-roman',
    'Salam. Catalyst reset pe profit keep hota hai.',
    'salam kya haal hai',
    /keep hota hai/i));

  rows.push(c('defer-related', S, 'en', draft, 'any update on the same payout issue please', leak, null, {
    path: 'customer', seed: 'defer',
  }));
  rows.push(c('number-1-5', F, 'en',
    'A 3% daily loss limit caps the same instrument at 1.5%.',
    'What is 1.5% of a 3% daily loss?',
    null, /1\.5%/));
  rows.push(c('number-words-pair', F, 'en',
    'Three percent daily loss becomes one and a half percent on one instrument. Four percent becomes two percent. Five percent becomes two and a half percent.',
    'Say the instrument caps in words.',
    null, /one and a half percent/i));
  rows.push(c('fake-timeline-ur', H, 'ur-script',
    'پے آؤٹ دو گھنٹے میں آ جاتا ہے۔',
    'پے آؤٹ کب آتا ہے؟',
    /دو گھنٹے/));
  rows.push(c('fake-timeline-ar', H, 'ar',
    'يتم دفع المكافأة خلال ساعتين.',
    'متى يصل الدفع؟',
    /ساعتين/));
  rows.push(c('fake-timeline-hi', H, 'hi',
    'पेआउट दो घंटे में आ जाता है।',
    'पेआउट कब आता है?',
    /दो घंटे/));

  return rows.map((row) => Object.assign({ path: row.path || 'customer' }, row));
}

function allCases() {
  const cases = expand().concat(specials());
  const ids = new Set();
  for (const item of cases) {
    if (ids.has(item.id)) throw new Error('duplicate case ' + item.id);
    ids.add(item.id);
  }
  return cases;
}

module.exports = { allCases, H, F, N, S };
