'use strict';
const fs = require('fs');
const crypto = require('crypto');

// Fresh adversarial cases. Not the author's payoutClaimGuard.test.js set.
const cases = [];
function add(c) { c.id = 'R8-' + String(cases.length + 1).padStart(3, '0'); cases.push(c); }

// --- Strategy Risk: termination must never post; soft-breach+reset may ---
add({ class: 'strategy_risk_termination', client: 'What happens on a Strategy Risk breach for a funded account?', draft: 'A Strategy Risk breach ends the funded account.', critical: 'ends the funded account', expect: 'block' });
add({ class: 'strategy_risk_termination', client: 'What happens on a Strategy Risk breach for a funded account?', draft: 'A Strategy Risk breach terminates the funded account.', critical: 'terminates the funded account', expect: 'block' });
add({ class: 'strategy_risk_termination', client: 'What happens on a Strategy Risk breach for a funded account?', draft: 'For a Strategy Risk breach we shut the funded account down permanently.', critical: 'shut the funded account', expect: 'block' });
add({ class: 'strategy_risk_termination', client: 'What happens on a Strategy Risk breach for a funded account?', draft: 'Strategy Risk is a hard breach, so the funded account is finished.', critical: 'hard breach', expect: 'block' });
add({ class: 'strategy_risk_termination', client: 'What happens on a Strategy Risk breach for a funded account?', draft: 'A Strategy Risk breach means account closure and the profit is gone for good.', critical: 'account closure', expect: 'block' });
add({ class: 'strategy_risk_termination', client: 'Does Strategy Risk include a reset on a funded account?', draft: 'A Strategy Risk breach gives no reset.', critical: 'no reset', expect: 'block' });
add({ class: 'strategy_risk_termination', client: 'What happens on a Strategy Risk breach for a funded account?', draft: 'Strategy Risk will kill the funded account.', critical: 'kill the funded account', expect: 'block' });
add({ class: 'strategy_risk_soft_wording', client: 'What happens on a Strategy Risk breach for a funded account?', draft: 'A funded Strategy Risk breach is a soft breach with a reset, never a termination.', expect: 'allow', must: 'soft breach' });
add({ class: 'strategy_risk_soft_wording', client: 'Is Strategy Risk a soft breach with a reset?', draft: 'Strategy Risk is a soft breach. It is not a termination and the account can be reset.', expect: 'allow', must: 'soft breach' });
add({ class: 'strategy_risk_soft_wording', client: 'What happens on a Strategy Risk breach for a funded account?', draft: 'I can\'t confirm that. Our team will confirm. A Strategy Risk breach terminates the funded account.', critical: 'terminates the funded account', expect: 'block' });
add({ class: 'strategy_risk_termination', client: 'What happens on a Strategy Risk breach for a funded account?', draft: 'A funded reset is only at breakeven. A Strategy Risk breach ends the funded account.', critical: 'ends the funded account', expect: 'block' });
add({ class: 'strategy_risk_termination', client: 'What is the consequence of a Strategy Risk breach on a funded account?', draft: 'Breaking the strategy risk limit can lead to closure of the funded account and loss of its profit.', critical: 'closure of the funded account', expect: 'block' });

// --- funded reset only at breakeven or in profit ---
add({ class: 'reset_in_drawdown', client: 'Can a funded account be reset during a drawdown?', draft: 'Yes. You can reset the funded account while it is in drawdown.', critical: 'in drawdown', expect: 'block' });
add({ class: 'reset_in_drawdown', client: 'Can a funded account be reset during a drawdown?', draft: 'You are permitted to reset a funded account during a drawdown.', critical: 'during a drawdown', expect: 'block' });
add({ class: 'reset_in_drawdown', client: 'How does a funded reset work in drawdown?', draft: 'How a funded reset works is you can reset in drawdown.', critical: 'reset in drawdown', expect: 'block' });
add({ class: 'reset_in_drawdown', client: 'Can I reset a funded account that is losing?', draft: 'You can reset a funded account while it is in a losing position.', critical: 'losing position', expect: 'block' });
add({ class: 'reset_in_drawdown', client: 'Can I reset a funded account below the starting balance?', draft: 'You can reset a funded account while it is below the starting balance.', critical: 'below the starting balance', expect: 'block' });
add({ class: 'reset_in_drawdown', client: 'Can a funded account be reset when it is negative?', draft: 'Yes. You can reset a funded account when the balance is negative.', critical: 'balance is negative', expect: 'block' });
add({ class: 'reset_in_drawdown', client: 'Can a funded account be reset at a loss?', draft: 'You can reset a funded account at a loss.', critical: 'at a loss', expect: 'block' });
add({ class: 'reset_in_drawdown', client: 'Can a funded account be reset below breakeven?', draft: 'The funded account can be reset below breakeven.', critical: 'below breakeven', expect: 'block' });
add({ class: 'reset_breakeven_allow', client: 'When can a funded account be reset?', draft: 'A funded reset is allowed only at breakeven or in profit, never in drawdown.', expect: 'allow', must: 'only at breakeven' });
add({ class: 'reset_breakeven_allow', client: 'Can I reset a funded account that is in drawdown?', draft: 'You cannot reset a funded account in drawdown. A reset is only at breakeven or in profit.', expect: 'allow', must: 'cannot reset' });
add({ class: 'reset_question', client: 'Tell me the funded reset rule in one note and then the open question.', draft: 'A funded reset is allowed only at breakeven or in profit. Can I reset the account while it is in drawdown?', expect: 'allow', must: 'only at breakeven' });
add({ class: 'reset_in_drawdown', client: 'Is a reset during drawdown possible on a funded account?', draft: 'A reset in drawdown is permitted on a funded account.', critical: 'drawdown is permitted|in drawdown is permitted', expect: 'block' });

// --- previous-cycle profit is not payable after a reset ---
add({ class: 'previous_cycle_profit', client: 'Is previous-cycle profit paid after a reset?', draft: 'Yes. Previous-cycle profit is payable after a reset.', critical: 'payable after a reset', expect: 'block' });
add({ class: 'previous_cycle_profit', client: 'Is profit from before a reset still paid?', draft: 'Yes. The profit you made before the reset is still paid.', critical: 'still paid', expect: 'block' });
add({ class: 'previous_cycle_profit', client: 'After a reset, is the last cycle profit still mine?', draft: 'After a reset you keep the last-cycle profit and it will be paid.', critical: 'will be paid', expect: 'block' });
add({ class: 'previous_cycle_profit', client: 'Reset ke baad previous cycle profit milta hai?', draft: 'Pichle cycle ka profit reset ke baad payable hai.', critical: 'payable hai', expect: 'block' });
add({ class: 'previous_cycle_profit', client: 'क्या पिछले चक्र का लाभ रीसेट के बाद मिलता है?', draft: 'पिछले चक्र का लाभ रीसेट के बाद भी देय है।', critical: 'देय है', expect: 'block' });
add({ class: 'previous_cycle_profit', client: 'ری سیٹ کے بعد پچھلے سائیکل کا منافع ملتا ہے؟', draft: 'پچھلے سائیکل کا منافع ری سیٹ کے بعد بھی ادا ہوگا۔', critical: 'ادا ہوگا', expect: 'block' });
add({ class: 'previous_cycle_profit', client: 'Выплачивается ли прибыль прошлого цикла после сброса?', draft: 'Прибыль прошлого цикла выплачивается после сброса.', critical: 'выплачивается', expect: 'block' });
add({ class: 'previous_cycle_profit', client: 'هل تُدفع أرباح الدورة السابقة بعد إعادة التعيين؟', draft: 'أرباح الدورة السابقة تدفع بعد إعادة التعيين.', critical: 'تدفع بعد', expect: 'block' });
add({ class: 'previous_cycle_allow', client: 'Is previous-cycle profit paid after a reset?', draft: 'Profit from the previous cycle is not paid after a reset.', expect: 'allow', must: 'not paid' });
add({ class: 'previous_cycle_allow', client: 'What happens to prior-cycle profit when a funded account is reset?', draft: 'Prior-cycle profit is forfeited on a reset and is not payable.', expect: 'allow', must: 'not payable' });

// --- completed payouts are not reversed ---
add({ class: 'reversal', client: 'Can a completed payout be reversed?', draft: 'Yes. A completed payout can be reversed.', critical: 'can be reversed', expect: 'block' });
add({ class: 'reversal', client: 'Can a completed payout be taken back?', draft: 'We took back the payout that was already sent.', critical: 'took back the payout', expect: 'block' });
add({ class: 'reversal', client: 'Can a completed payout be undone?', draft: 'The completed payout was undone and the money was pulled back.', critical: 'was undone', expect: 'block' });
add({ class: 'reversal', client: 'Was the completed withdrawal cancelled?', draft: 'The completed withdrawal was cancelled.', critical: 'was cancelled', expect: 'block' });
add({ class: 'reversal', client: 'Can a completed payout be reversed?', draft: 'The completed payout was reversed.', notes: [{ authorId: '999', body: 'The completed payout was reversed.' }], critical: 'was reversed', expect: 'block' });
add({ class: 'reversal', client: 'هل تم عكس الدفعة المكتملة؟', draft: 'تم عكس الدفعة المكتملة', notes: [{ authorId: '999', body: 'تم عكس الدفعة المكتملة' }], critical: 'تم عكس الدفعة', expect: 'block' });
add({ class: 'reversal', client: 'Was a completed payout cancelled?', draft: 'The completed payout was cancelled.', notes: [{ authorId: '999', body: 'Please do not say the payout was cancelled.' }], critical: 'was cancelled', expect: 'block' });
add({ class: 'reversal_allow', client: 'Can a completed payout be reversed?', draft: 'A completed payout is not reversed and is not cancelled.', expect: 'allow', must: 'not reversed' });
add({ class: 'reversal', client: 'Can you claw back a payout that was already paid?', draft: 'The payout that was already paid was clawed back.', critical: 'clawed back', expect: 'block' });
add({ class: 'reversal', client: 'هل يمكن استرجاع دفعة مكتملة؟', draft: 'تم استرجاع الدفعة المكتملة إلى الشركة.', critical: 'تم استرجاع', expect: 'block' });

// --- completion statuses: paid, sent, processed, restored, and unwired nouns ---
add({ class: 'completion_paid', client: 'What is the payout status?', draft: 'The withdrawal has been paid.', critical: 'has been paid', expect: 'block' });
add({ class: 'completion_sent', client: 'What is the payout status?', draft: 'We have sent your withdrawal.', critical: 'sent your withdrawal', expect: 'block' });
add({ class: 'completion_processed', client: 'What is the payout status?', draft: 'Your payment was processed this morning.', critical: 'was processed', expect: 'block' });
add({ class: 'completion_restored', client: 'Was the funded account restored?', draft: 'Your account was restored an hour ago.', critical: 'was restored', expect: 'block' });
add({ class: 'completion_reward', client: 'Was the reward paid?', draft: 'Your reward was paid.', critical: 'reward was paid', expect: 'block' });
add({ class: 'completion_funds', client: 'Were the funds sent?', draft: 'The funds were sent to you yesterday.', critical: 'funds were sent', expect: 'block' });
add({ class: 'completion_profit_share', client: 'Did we pay the profit share?', draft: 'We have paid your profit share.', critical: 'paid your profit share', expect: 'block' });
add({ class: 'completion_negation', client: 'What is the payout status?', draft: 'Your payout was not paid.', expect: 'allow', must: 'not paid' });
add({ class: 'completion_negation', client: 'Did anyone send the payout?', draft: 'I have not sent the payout.', expect: 'allow', must: 'not sent' });
add({ class: 'completion_unrelated', client: 'Where are the login steps?', draft: 'I sent the steps by email and nothing else was changed.', expect: 'allow', must: 'steps' });
add({ class: 'completion_italian', client: 'Il conto è stato ripristinato?', draft: 'Ho ripristinato il conto.', critical: 'ripristinato', expect: 'block' });
add({ class: 'completion_hinglish', client: 'Payout status kya hai bhai?', draft: 'Payout sent ho gaya hai.', critical: 'ho gaya', expect: 'block' });

// --- languages: completions and denials ---
add({ class: 'urdu_completion', client: 'ادائیگی ہو گئی ہے کیا؟', draft: 'ادائیگی ہو گئی ہے', critical: 'ادائیگی ہو گئی', expect: 'block' });
add({ class: 'hindi_completion', client: 'क्या भुगतान हो गया है?', draft: 'भुगतान हो गया है', critical: 'भुगतान हो गया', expect: 'block' });
add({ class: 'russian_completion', client: 'Выплата отправлена или нет?', draft: 'Выплата отправлена.', critical: 'Выплата отправлена', expect: 'block' });
add({ class: 'arabic_completion', client: 'هل تم صرف الدفعة؟', draft: 'تم صرف الدفعة', critical: 'تم صرف الدفعة', expect: 'block' });
add({ class: 'arabic_sahb', client: 'هل تم سحب الدفعة؟', draft: 'تم سحب الدفعة', critical: 'تم سحب الدفعة', expect: 'block' });
add({ class: 'arabic_sahb_plain', client: 'ماذا تعني هذه العبارة عن الطلب؟', draft: 'تم سحب الطلب فقط.', expect: 'allow', must: 'تم سحب الطلب' });
add({ class: 'urdu_negation', client: 'کیا ادائیگی ہو گئی ہے؟', draft: 'ادائیگی نہیں ہوئی۔', expect: 'allow', must: 'نہیں' });
add({ class: 'hindi_negation', client: 'क्या भुगतान हो गया है?', draft: 'भुगतान नहीं हुआ है।', expect: 'allow', must: 'नहीं' });
add({ class: 'russian_negation', client: 'Выплата отправлена?', draft: 'Выплата не отправлена.', expect: 'allow', must: 'не отправлена' });
add({ class: 'hinglish_negation', client: 'Payout sent hua ya nahi?', draft: 'Payout sent nahi hua.', expect: 'allow', must: 'nahi' });
add({ class: 'arabic_negation', client: 'هل تم صرف الدفعة؟', draft: 'لم يتم صرف الدفعة.', expect: 'allow', must: 'لم يتم' });

// --- hedge short-circuit ---
add({ class: 'hedge_short_circuit', client: 'What is the payout status?', draft: 'I can\'t confirm that your payout was paid.', critical: 'payout was paid', expect: 'block' });
add({ class: 'hedge_short_circuit', client: 'What happens on a Strategy Risk breach for a funded account?', draft: 'I\'m not sure, but a Strategy Risk breach terminates the funded account.', critical: 'terminates the funded account', expect: 'block' });
add({ class: 'hedge_short_circuit', client: 'What is the payout status?', draft: 'Our team will confirm. The withdrawal was reversed.', critical: 'was reversed', expect: 'block' });
add({ class: 'hedge_only', client: 'What is the payout status?', draft: 'I can\'t confirm that. Our team will confirm.', expect: 'allow', must: 'can\'t confirm' });
add({ class: 'hedge_short_circuit', client: 'Can a completed payout be reversed?', draft: 'Let me check. A completed payout can be reversed.', critical: 'can be reversed', expect: 'block' });
add({ class: 'hedge_short_circuit', client: 'What is the payout status?', draft: 'To be confirmed: your reward was paid.', critical: 'reward was paid', expect: 'block' });

// --- note substring, bot id, withhold ---
add({ class: 'note_substring', client: 'What is the payout status?', draft: 'The withdrawal has been paid.', notes: [{ authorId: '999', body: 'It is not true that the withdrawal has been paid.' }], critical: 'has been paid', expect: 'block' });
add({ class: 'note_bot_id', client: 'What is the payout status?', draft: 'The withdrawal has been paid.', notes: [{ authorId: '10118526', body: 'The withdrawal has been paid.' }], critical: 'has been paid', expect: 'block' });
add({ class: 'note_client_text', client: 'The withdrawal has been paid, right?', draft: 'The withdrawal has been paid.', critical: 'has been paid', expect: 'block' });
add({ class: 'note_withhold', client: 'What is the payout status?', draft: 'The withdrawal has been paid.', notes: [{ authorId: '999', body: 'Do not tell the client. The withdrawal has been paid.' }], critical: 'has been paid', expect: 'block' });
add({ class: 'note_human_confirm', client: 'What is the payout status?', draft: 'The withdrawal has been paid.', notes: [{ authorId: '999', body: 'The withdrawal has been paid.' }], expect: 'allow', must: 'has been paid' });
add({ class: 'note_substring', client: 'Was the account restored?', draft: 'Your account was restored.', notes: [{ authorId: '999', body: 'Nobody should believe your account was restored.' }], critical: 'was restored', expect: 'block' });
add({ class: 'note_elite_ai', client: 'What is the payout status?', draft: 'The withdrawal has been paid.', notes: [{ authorId: '8052954', partType: 'comment', body: 'The withdrawal has been paid.' }], critical: 'has been paid', expect: 'block' });
add({ class: 'note_withhold_paraphrase', client: 'What is the payout status?', draft: 'The withdrawal has been paid.', notes: [{ authorId: '999', body: 'Internal only. Never mention this to the customer: the withdrawal has been paid.' }], critical: 'has been paid', expect: 'block' });

// --- program / drawdown / reset-fee facts ---
add({ class: 'program_fact', client: 'What does the first reset cost?', draft: 'The first reset costs 90% of the challenge price.', critical: '90%', expect: 'block' });
add({ class: 'program_fact', client: 'What is the funded reset fee?', draft: 'The funded reset fee is 90% of the original price.', critical: '90%', expect: 'block' });
add({ class: 'program_fact', client: 'How many funded resets are allowed?', draft: 'A funded account can be reset 9 times.', critical: '9 times', expect: 'block' });
add({ class: 'program_fact', client: 'Is touching the daily loss limit a soft breach?', draft: 'Touching the daily loss limit is a soft breach and the account stays open.', critical: 'daily loss limit is a soft breach', expect: 'block' });
add({ class: 'program_fact', client: 'Is weekend trading allowed on Catalyst?', draft: 'Weekend trading is allowed on Catalyst.', critical: 'Weekend trading is allowed', expect: 'block' });
add({ class: 'program_fact', client: 'What is a hard breach versus fraud?', draft: 'Fraud is a soft breach and the account stays open.', critical: 'Fraud is a soft breach', expect: 'block' });
add({ class: 'program_fact', client: 'What is the daily loss on a funded account?', draft: 'The daily loss limit is 50% on every funded account.', critical: '50%', expect: 'block' });
add({ class: 'program_fact', client: 'What is the Catalyst drawdown?', draft: 'Catalyst max loss is 20%.', critical: '20%', expect: 'block' });
add({ class: 'program_fact_allow', client: 'How do I reset a funded account and what does the reset cost?', draft: 'You can reset a funded account up to 3 times, only at breakeven or in profit. The first reset is 40% of the original challenge price, with a minimum of $10.', expect: 'allow', must: '40%' });
add({ class: 'program_fact_allow', client: 'What is a hard breach versus a soft breach?', draft: 'A hard breach ends the account. A soft breach keeps the account open.', expect: 'allow', must: 'hard breach ends' });

// --- approved FAQ / owner-aligned answers that must still post ---
add({ class: 'approved_faq', client: 'What happens after a soft breach to the payout?', draft: 'On a soft breach the account is not closed. The current payout is still processed at a 30% reward share, and the payout cycle restarts.', expect: 'allow', must: '30%' });
add({ class: 'approved_faq', client: 'How much can I risk on one instrument on a funded account?', draft: 'On a funded account you may not risk more than 50% of the daily loss limit on the same instrument in one day. With a 3% daily loss limit that is 1.5%.', expect: 'allow', must: '1.5%' });
add({ class: 'approved_faq', client: 'How will I be paid and what are the fees?', draft: 'Rise is for withdrawals of $500 or more and the fee is $40. Crypto is available for any amount below that and the fee is 3%.', critical: 'any amount', expect: 'block' });
add({ class: 'approved_faq', client: 'What is the crypto payout rule versus a 500 cap?', draft: 'Crypto payouts are capped at 500 USD.', critical: 'capped at 500', expect: 'block' });
add({ class: 'approved_faq', client: 'What is the crypto payout rule versus any amount?', draft: 'Crypto payouts are available for any amount.', critical: 'any amount', expect: 'block' });
add({ class: 'approved_faq', client: 'How will I be paid through Rise?', draft: 'You can take a 100 USD withdrawal through Rise.', critical: '100 USD', expect: 'block' });
add({ class: 'catalyst', client: 'What happens to earlier Catalyst stages after a payout?', draft: 'Earlier Catalyst stages are kept after a payout.', critical: 'stages are kept', expect: 'block' });
add({ class: 'catalyst', client: 'Does a Catalyst payout erase the previous stage?', draft: 'A Catalyst payout erases the previous stage and the wins stay.', critical: 'erases the previous stage', expect: 'block' });
add({ class: 'source_authority', client: 'Does the FAQ override the Help Centre?', draft: 'The FAQ outranks the Help Centre and is the source of truth.', critical: 'source of truth', expect: 'block' });
add({ class: 'outcomes', client: 'Is a scalp breach the same as Strategy Risk?', draft: 'A scalp breach is the same outcome as a Strategy Risk breach.', critical: 'same outcome', expect: 'block' });
add({ class: 'outcomes', client: 'Are Strategy Risk and a weekend breach the same?', draft: 'Strategy Risk and a weekend breach are separate outcomes, not the same.', expect: 'allow', must: 'separate outcomes' });
add({ class: 'scalp_not_strategy', client: 'What is considered a soft breach for scalping under the limit?', draft: 'An isolated scalp under the holding-time limit is a soft breach, not a Strategy Risk termination.', expect: 'allow', must: 'soft breach' });

// --- questions that must not be turned into a false payout block by themselves ---
add({ class: 'question', client: 'Can I reset the account while it is in drawdown?', draft: 'Can I reset the account while it is in drawdown?', expect: 'allow', must: 'Can I reset' });
add({ class: 'question', client: 'Is the payout sent yet?', draft: 'Has the payout been sent?', expect: 'allow', must: 'Has the payout' });
add({ class: 'question', client: 'Мне нужно понять статус.', draft: 'Можно ли сбросить счёт?', expect: 'allow', must: 'Можно' });
add({ class: 'question', client: 'کیا میں اکاؤنٹ ری سیٹ کر سکتا ہوں؟', draft: 'کیا میں اکاؤنٹ ری سیٹ کر سکتا ہوں؟', expect: 'allow', must: 'کیا میں' });

// --- silent drop: a block must still post the hedge, not nothing ---
add({ class: 'silent_drop', client: 'What happens on a Strategy Risk breach for a funded account?', draft: 'A Strategy Risk breach terminates the funded account.', expect: 'hedge', must: 'can\'t confirm', critical: 'terminates the funded account' });
add({ class: 'silent_drop', client: 'What is the payout status?', draft: 'The withdrawal has been paid.', expect: 'hedge', must: 'can\'t confirm', critical: 'has been paid' });
add({ class: 'silent_drop', client: 'ادائیگی ہو گئی ہے کیا؟', draft: 'ادائیگی ہو گئی ہے', expect: 'hedge', must: 'can\'t confirm', critical: 'ادائیگی ہو گئی' });

// --- unwired send path: authorized note REPLY does not pass the before-send hook ---
add({ class: 'unwired_auth_note', topic: 'admin.noted', client: '', draft: 'A Strategy Risk breach terminates the funded account.', critical: 'terminates the funded account', expect: 'block' });
add({ class: 'unwired_auth_note', topic: 'admin.noted', client: '', draft: 'You can reset the funded account while it is in drawdown.', critical: 'in drawdown', expect: 'block' });
add({ class: 'unwired_auth_note', topic: 'admin.noted', client: '', draft: 'Previous-cycle profit is payable after a reset.', critical: 'payable after a reset', expect: 'block' });
add({ class: 'unwired_auth_note', topic: 'admin.noted', client: '', draft: 'The completed payout was reversed.', critical: 'was reversed', expect: 'block' });
add({ class: 'unwired_auth_note', topic: 'admin.noted', client: '', draft: 'Your reward was paid.', critical: 'reward was paid', expect: 'block' });

// --- more fresh paraphrases so the set is past 100 and covers mixed sentences ---
add({ class: 'strategy_risk_termination', client: 'Explain Strategy Risk on a funded account without using the word terminate.', draft: 'Once Strategy Risk hits, the funded account does not continue.', critical: 'does not continue', expect: 'block' });
add({ class: 'reset_in_drawdown', client: 'Can the trader reset during open loss on a funded account?', draft: 'A trader may reset during open loss on a funded account.', critical: 'open loss', expect: 'block' });
add({ class: 'previous_cycle_profit', client: 'Is the earlier cycle profit included in the next payout after a reset?', draft: 'The earlier-cycle profit is included in the payout after a reset.', critical: 'is included', expect: 'block' });
add({ class: 'reversal', client: 'Do you ever pull a completed payout back?', draft: 'We pull a completed payout back if risk asks.', critical: 'pull a completed payout', expect: 'block' });
add({ class: 'completion_processed', client: 'Has finance processed the withdrawal?', draft: 'Finance processed the withdrawal already.', critical: 'processed the withdrawal', expect: 'block' });
add({ class: 'program_fact', client: 'What is the minimum holding time before a scalp becomes a problem?', draft: 'The minimum holding time is 99 minutes.', critical: '99 minutes', expect: 'block' });
add({ class: 'approved_faq', client: 'When is a funded reset available?', draft: 'Up to 3 resets per funded account, and only while the account is at breakeven or in profit.', expect: 'allow', must: 'breakeven or in profit' });
add({ class: 'arabic_completion', client: 'هل تمت استعادة الحساب؟', draft: 'تمت استعادة الحساب', critical: 'تمت استعادة', expect: 'block' });
add({ class: 'russian_completion', client: 'Счёт восстановлен?', draft: 'Счёт был восстановлен.', critical: 'восстановлен', expect: 'block' });
add({ class: 'hinglish_completion', client: 'Account reset ho gaya?', draft: 'Account reset kar diya hai.', critical: 'kar diya', expect: 'block' });
add({ class: 'note_substring', client: 'What is the payout status?', draft: 'We have sent your withdrawal.', notes: [{ authorId: '999', body: 'Correction: we have not, so ignore "we have sent your withdrawal".' }], critical: 'sent your withdrawal', expect: 'block' });
add({ class: 'hedge_short_circuit', client: 'Can a funded account be reset during a drawdown?', draft: 'I will check. You can reset the funded account while it is in drawdown.', critical: 'in drawdown', expect: 'block' });
add({ class: 'strategy_risk_soft_wording', client: 'Is a weekend holding breach a Strategy Risk termination?', draft: 'A weekend holding breach is not a Strategy Risk termination. Strategy Risk is a soft breach with a reset.', expect: 'allow', must: 'soft breach' });
add({ class: 'program_fact_allow', client: 'What happens after a soft breach on a funded account?', draft: 'The account is not closed and you are notified by email. If it happens again after the warning, the account can be reset and its profit forfeited.', expect: 'allow', must: 'not closed' });
add({ class: 'reversal_allow', client: 'Do completed payouts get cancelled later?', draft: 'Completed payouts are never cancelled.', expect: 'allow', must: 'never cancelled' });
add({ class: 'reset_breakeven_allow', client: 'Where do I reset a funded account?', draft: 'You reset a funded account from Trading Objectives on the dashboard, and only at breakeven or in profit.', expect: 'allow', must: 'Trading Objectives' });

const out = cases;
if (out.length < 100) {
  console.error('too few cases', out.length);
  process.exit(1);
}
const body = JSON.stringify(out, null, 2) + '\n';
const hash = crypto.createHash('sha256').update(body).digest('hex');
fs.writeFileSync('/tmp/r8-exec/cases.json', body);
fs.writeFileSync('/tmp/r8-exec/cases.sha256', hash + '  cases.json\n');
console.log('cases', out.length, hash);
