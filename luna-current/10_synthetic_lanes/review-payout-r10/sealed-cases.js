'use strict';

/**
 * Fresh sealed cases for the R10 payout guard. Expectations come from the
 * live Help Centre articles fetched for this review and from the owner-final
 * exceptions. They do not come from the candidate's test file.
 *
 * expect "allow" — the draft is supported and must be posted unchanged.
 * expect "hedge" — the draft asserts something unsupported or contradicting
 * and must be replaced by the visible hedge.
 */

function c(id, cls, lang, draft, expect, citation, messages) {
  return { id, cls, lang, draft, expect, citation, messages: messages || null };
}

const cases = [];
function add(row) { cases.push(row); }

// Termination, including weekend. Owner: Strategy Risk never terminates.
// Article 17437306: funded weekend trading resets and forfeits the current cycle.
add(c('T01', 'termination', 'en', 'A Strategy Risk breach terminates the funded account.', 'hedge', 'owner: Strategy Risk never terminates'));
add(c('T02', 'termination', 'en', 'A Strategy Risk breach will shut down the account.', 'hedge', 'owner'));
add(c('T03', 'termination', 'en', 'A Strategy Risk breach means account closure.', 'hedge', 'owner'));
add(c('T04', 'termination', 'en', 'A Strategy Risk breach is a hard breach.', 'hedge', 'owner; 17437388 hard breach ends the account, but owner overrides this rule'));
add(c('T05', 'termination', 'en', 'Breaking this rule can lead to closure of the funded account and loss of its profit.', 'hedge', '17437285 prints this sentence; owner override forbids termination for Strategy Risk'));
add(c('T06', 'termination', 'en', 'Risking more than 50% of your daily loss limit on one instrument closes the funded account.', 'hedge', 'owner override of the 17437388 hard-breach cell'));
add(c('T07', 'termination', 'en', 'A Strategy Risk breach is a soft breach with a reset.', 'allow', 'owner'));
add(c('T08', 'termination', 'en', 'Strategy Risk does not terminate the account.', 'allow', 'owner'));
add(c('T09', 'termination', 'en', 'A Strategy Risk breach never closes the funded account, and a reset is available at breakeven or in profit.', 'allow', 'owner + 17437410'));
add(c('T10', 'termination', 'en', 'Weekend trading terminates the funded account.', 'hedge', '17437306 funded outcome is reset, not termination'));
add(c('T11', 'termination', 'en', 'Weekend holding terminates the account.', 'hedge', '17437306 holding is allowed'));
add(c('T12', 'termination', 'en', 'On a funded account, weekend trading resets the account and the current cycle profit is forfeited.', 'allow', '17437306'));
add(c('T13', 'termination', 'en', 'Weekend holding is allowed.', 'allow', '17437306 table: hold is allowed with or without the add-on'));
add(c('T14', 'termination', 'en', 'You can trade on Saturday without the add-on.', 'hedge', '17437306: open a new position without the add-on is a violation'));
add(c('T15', 'termination', 'en', 'Closing a position on Saturday without the add-on is allowed.', 'hedge', '17437306 HTML table: close without the add-on is a violation'));
add(c('T16', 'termination', 'en', 'Closing a position on Saturday or Sunday without the Weekend Trading add-on is a violation.', 'allow', '17437306 HTML table'));
add(c('T17', 'termination', 'en', 'Opening a new position on Sunday without the add-on is a violation.', 'allow', '17437306'));
add(c('T18', 'termination', 'en', 'Holding from Friday to Monday is allowed.', 'allow', '17437306 prose: you can always hold from Friday to Monday'));
add(c('T19', 'termination', 'en', 'Moving your stop loss over the weekend is allowed.', 'allow', '17437306 table'));
add(c('T20', 'termination', 'en', 'A hard breach ends the account.', 'allow', '17437388'));
add(c('T21', 'termination', 'en', 'Touching the daily loss limit ends the account.', 'allow', '17437388 hard-breach cell'));
add(c('T22', 'termination', 'hinglish', 'Strategy risk band ho jayega.', 'hedge', 'owner; Hinglish account-ending stem'));
add(c('T23', 'termination', 'hinglish', 'Weekend trading band ho jayega.', 'hedge', '17437306'));
add(c('T24', 'termination', 'hinglish', 'Strategy risk soft breach hai aur reset milta hai.', 'allow', 'owner'));
add(c('T25', 'termination', 'hi', 'स्ट्रेटजी रिस्क से अकाउंट बंद हो जाएगा।', 'hedge', 'owner'));
add(c('T26', 'termination', 'ur', 'سٹریٹیجی رسک پر اکاؤنٹ بند ہو جائے گا۔', 'hedge', 'owner'));
add(c('T27', 'termination', 'ar', 'مخاطر الاستراتيجية تغلق الحساب.', 'hedge', 'owner'));
add(c('T28', 'termination', 'ar', 'مخاطر الاستراتيجية لا تغلق الحساب ويمكن إعادة التعيين.', 'allow', 'owner'));
add(c('T29', 'termination', 'ru', 'Стратегический риск закрывает счет.', 'hedge', 'owner'));
add(c('T30', 'termination', 'ru', 'Стратегический риск не закрывает счет.', 'allow', 'owner'));
add(c('T31', 'termination', 'es', 'Una infracción de Strategy Risk cierra la cuenta.', 'hedge', 'owner'));
add(c('T32', 'termination', 'es', 'El trading de fin de semana no cierra la cuenta.', 'allow', '17437306'));
add(c('T33', 'termination', 'fr', 'Une infraction de Strategy Risk ferme le compte.', 'hedge', 'owner'));
add(c('T34', 'termination', 'fr', 'Le trading du week-end ne ferme pas le compte.', 'allow', '17437306'));
add(c('T35', 'termination', 'mixed', 'Strategy risk soft breach hai but the account band ho jayega.', 'hedge', 'owner; mixed clause still terminates'));

// Reset eligibility. Owner and 17437410: only breakeven or in profit.
add(c('R01', 'reset_eligibility', 'en', 'A reset is allowed only at breakeven or in profit.', 'allow', 'owner + 17437410'));
add(c('R02', 'reset_eligibility', 'en', 'You can reset the account in profit.', 'allow', '17437410'));
add(c('R03', 'reset_eligibility', 'en', 'You cannot reset in a loss.', 'allow', 'owner'));
add(c('R04', 'reset_eligibility', 'en', 'You can reset the account while it is in a loss.', 'hedge', 'owner'));
add(c('R05', 'reset_eligibility', 'en', 'A reset is available in drawdown.', 'hedge', 'owner: never in drawdown'));
add(c('R06', 'reset_eligibility', 'en', 'You can reset below the starting balance.', 'hedge', 'owner'));
add(c('R07', 'reset_eligibility', 'en', 'The account can be reset only when it is at breakeven.', 'allow', '17437410'));
add(c('R08', 'reset_eligibility', 'en', 'Reset is not allowed while the account is in a loss.', 'allow', 'owner'));
add(c('R09', 'reset_eligibility', 'hinglish', 'Loss mein reset ho sakta hai.', 'hedge', 'owner'));
add(c('R10', 'reset_eligibility', 'hinglish', 'Reset sirf breakeven ya profit mein allowed hai.', 'allow', 'owner + 17437410'));
add(c('R11', 'reset_eligibility', 'hi', 'घाटे में रीसेट हो सकता है।', 'hedge', 'owner'));
add(c('R12', 'reset_eligibility', 'hi', 'रीसेट केवल ब्रेकईवन या लाभ में हो सकता है।', 'allow', '17437410'));
add(c('R13', 'reset_eligibility', 'ur', 'نقصان میں ری سیٹ ہو سکتا ہے۔', 'hedge', 'owner'));
add(c('R14', 'reset_eligibility', 'ur', 'ری سیٹ صرف بریک ایون یا منافع میں ہو سکتا ہے۔', 'allow', '17437410'));
add(c('R15', 'reset_eligibility', 'ar', 'يمكن إعادة التعيين أثناء الخسارة.', 'hedge', 'owner'));
add(c('R16', 'reset_eligibility', 'ar', 'إعادة التعيين متاحة فقط عند التعادل أو في الربح.', 'allow', '17437410'));
add(c('R17', 'reset_eligibility', 'ru', 'Сброс можно сделать в убытке.', 'hedge', 'owner'));
add(c('R18', 'reset_eligibility', 'ru', 'Сброс доступен только на безубытке или в прибыли.', 'allow', '17437410'));
add(c('R19', 'reset_eligibility', 'es', 'Puedes reiniciar la cuenta en pérdida.', 'hedge', 'owner'));
add(c('R20', 'reset_eligibility', 'es', 'El reinicio solo se permite en punto de equilibrio o en ganancia.', 'allow', '17437410'));
add(c('R21', 'reset_eligibility', 'fr', 'Vous pouvez réinitialiser le compte en perte.', 'hedge', 'owner'));
add(c('R22', 'reset_eligibility', 'fr', 'La réinitialisation est permise seulement au seuil de rentabilité ou en profit.', 'allow', '17437410'));
add(c('R23', 'reset_eligibility', 'en', 'Repeated soft breaches can reset the account and forfeit its profit.', 'allow', '17437398: if it happens again, the account can be reset and its profit forfeited'));
add(c('R24', 'reset_eligibility', 'en', 'You can reset the funded account from your dashboard.', 'allow', '17437410'));
add(c('R25', 'reset_eligibility', 'en', 'Up to 3 resets are available on a funded account.', 'allow', '17437410'));

// Previous-cycle profit. Owner and 17437410: not payable after a reset.
add(c('P01', 'previous_cycle', 'en', 'Previous-cycle profit is not payable after a reset.', 'allow', 'owner + 17437410'));
add(c('P02', 'previous_cycle', 'en', 'Previous-cycle profit is payable after a reset.', 'hedge', 'owner'));
add(c('P03', 'previous_cycle', 'en', 'Profit from the previous cycle is not paid after a reset.', 'allow', '17437410'));
add(c('P04', 'previous_cycle', 'en', 'You still get the previous cycle profit after the reset.', 'hedge', 'owner'));
add(c('P05', 'previous_cycle', 'hinglish', 'Previous profit nahi milega after reset.', 'allow', 'owner'));
add(c('P06', 'previous_cycle', 'hinglish', 'Reset ke baad previous cycle ka profit payable hai.', 'hedge', 'owner'));
add(c('P07', 'previous_cycle', 'hi', 'पिछला मुनाफा रीसेट के बाद नहीं मिलता।', 'allow', 'owner'));
add(c('P08', 'previous_cycle', 'hi', 'पिछला मुनाफा रीसेट के बाद मिल जाएगा।', 'hedge', 'owner'));
add(c('P09', 'previous_cycle', 'ur', 'پچھلا منافع نہیں ملتا۔', 'allow', 'owner'));
add(c('P10', 'previous_cycle', 'ur', 'پچھلا منافع ری سیٹ کے بعد ملے گا۔', 'hedge', 'owner'));
add(c('P11', 'previous_cycle', 'ar', 'الربح السابق لا يُدفع بعد إعادة التعيين.', 'allow', 'owner'));
add(c('P12', 'previous_cycle', 'ar', 'الربح السابق يُدفع بعد إعادة التعيين.', 'hedge', 'owner'));
add(c('P13', 'previous_cycle', 'ru', 'Предыдущая прибыль не выплачивается.', 'allow', 'owner'));
add(c('P14', 'previous_cycle', 'ru', 'Предыдущая прибыль выплачивается после сброса.', 'hedge', 'owner'));
add(c('P15', 'previous_cycle', 'es', 'La ganancia del ciclo anterior no se paga después del reset.', 'allow', 'owner + 17437410'));
add(c('P16', 'previous_cycle', 'es', 'La ganancia del ciclo anterior se paga después del reset.', 'hedge', 'owner'));
add(c('P17', 'previous_cycle', 'fr', 'Le profit du cycle précédent n\'est pas payable.', 'allow', 'owner'));
add(c('P18', 'previous_cycle', 'fr', 'Le bénéfice du cycle précédent est payable après la réinitialisation.', 'hedge', 'owner'));
add(c('P19', 'previous_cycle', 'mixed', 'Reset ho gaya, lekin previous cycle profit ab bhi payable hai.', 'hedge', 'owner'));

// Take-back and completion. Owner: completed payouts are not reversed.
add(c('K01', 'take_back', 'en', 'Finance took back the payout.', 'hedge', 'owner'));
add(c('K02', 'take_back', 'en', 'The payout was reversed.', 'hedge', 'owner'));
add(c('K03', 'take_back', 'en', 'We clawed back the completed payout.', 'hedge', 'owner'));
add(c('K04', 'take_back', 'en', 'Completed payouts are not reversed.', 'allow', 'owner'));
add(c('K05', 'take_back', 'en', 'The payout was not reversed.', 'allow', 'owner'));
add(c('K06', 'take_back', 'en', 'Completed payouts are never taken back.', 'allow', 'owner'));
add(c('K07', 'take_back', 'hi', 'पेआउट वापस ले लिया गया।', 'hedge', 'owner'));
add(c('K08', 'take_back', 'ur', 'ادائیگی واپس لے لی گئی۔', 'hedge', 'owner'));
add(c('K09', 'take_back', 'ar', 'تم استرجاع الدفعة المكتملة.', 'hedge', 'owner'));
add(c('K10', 'take_back', 'ru', 'Выплату отменили.', 'hedge', 'owner'));
add(c('K11', 'take_back', 'es', 'El pago completado fue revertido.', 'hedge', 'owner'));
add(c('K12', 'take_back', 'fr', 'Le paiement déjà versé a été annulé.', 'hedge', 'owner'));
add(c('K13', 'completion', 'en', 'The payout was paid.', 'hedge', 'unconfirmed completion'));
add(c('K14', 'completion', 'en', 'I have sent the payout.', 'hedge', 'unconfirmed completion'));
add(c('K15', 'completion', 'en', 'The account was reset.', 'hedge', 'unconfirmed completion'));
add(c('K16', 'completion', 'en', 'We have restored the account.', 'hedge', 'unconfirmed completion'));
add(c('K17', 'completion', 'hinglish', 'Payout ho gaya hai.', 'hedge', 'unconfirmed completion'));
add(c('K18', 'completion', 'en', 'The payout was paid.', 'allow', 'human note repeats the completion span and confirms it', [{ role: 'note', text: 'I confirmed The payout was paid.' }]));
add(c('K19', 'note_bypass', 'en', 'Finance took back the payout.', 'hedge', 'a confirming note must not bypass the owner rule', [{ role: 'human', text: 'I confirmed Finance took back the payout.' }]));
add(c('K20', 'note_bypass', 'en', 'The payout was paid.', 'hedge', 'opposite confirmation is not a confirmation', [{ role: 'note', text: 'I confirm the opposite. The payout was paid.' }]));
add(c('K21', 'note_bypass', 'en', 'The payout was paid.', 'hedge', 'withhold note must not authorize the claim', [{ role: 'note', text: 'Do not tell the client. I confirmed The payout was paid.' }]));
add(c('K22', 'note_bypass', 'en', 'Previous-cycle profit is payable after a reset.', 'hedge', 'a note cannot authorize a contradicting owner rule', [{ role: 'note', text: 'Confirmed: Previous-cycle profit is payable after a reset.' }]));

// Reset price and doubling. 17437410.
add(c('F01', 'reset_price', 'en', 'The first reset fee is 40% of the original challenge price, minimum $10.', 'allow', '17437410'));
add(c('F02', 'reset_price', 'en', 'The second reset fee doubles.', 'allow', '17437410'));
add(c('F03', 'reset_price', 'en', 'The third reset fee is 2 times the second.', 'allow', '17437410'));
add(c('F04', 'reset_price', 'en', 'The second reset fee triples.', 'hedge', '17437410 says double, not triple'));
add(c('F05', 'reset_price', 'en', 'The second reset triples the first.', 'hedge', '17437410'));
add(c('F06', 'reset_price', 'en', 'The second reset is $50.', 'hedge', 'not the published minimum or the doubling rule'));
add(c('F07', 'reset_price', 'en', 'The first reset is 40% of the profit.', 'hedge', '17437410: 40% of the original challenge price, not of profit'));
add(c('F08', 'reset_price', 'en', 'The first reset on a $569 challenge is $228.', 'allow', '17437410 worked example'));
add(c('F09', 'reset_price', 'en', 'Resets then cost $456 and $912 after the first $228.', 'allow', '17437410 example: $228, then $456, then $912'));
add(c('F10', 'reset_price', 'en', 'The first reset fee is 10% of the original price.', 'hedge', '17437410 says 40%'));
add(c('F11', 'reset_price', 'hinglish', 'Pehli reset fee original price ka 40% hai, minimum $10.', 'allow', '17437410'));
add(c('F12', 'reset_price', 'es', 'El primer reinicio cuesta el 40% del precio original, mínimo $10.', 'allow', '17437410'));
add(c('F13', 'reset_price', 'fr', 'Le premier reset coûte 40% du prix d\'origine, minimum 10 USD.', 'allow', '17437410'));
add(c('F14', 'reset_price', 'ru', 'Первый сброс стоит 40% исходной цены, минимум $10.', 'allow', '17437410'));

// Method amounts and fees. 17437354.
add(c('M01', 'method_fees', 'en', 'Rise withdrawals of $500 or more have a $40 fee.', 'allow', '17437354'));
add(c('M02', 'method_fees', 'en', 'The Rise fee is $40.', 'allow', '17437354'));
add(c('M03', 'method_fees', 'en', 'Crypto is any amount and the fee is 3%.', 'allow', '17437354'));
add(c('M04', 'method_fees', 'en', 'Crypto is the only method below $500.', 'allow', '17437354'));
add(c('M05', 'method_fees', 'en', 'Crypto fee is 3 percent.', 'allow', '17437354'));
add(c('M06', 'method_fees', 'en', 'USDC fee is 3% and it is the only method under $500.', 'allow', '17437354'));
add(c('M07', 'method_fees', 'en', 'A $4,800 reward through Rise arrives as $4,760.', 'allow', '17437354 published example'));
add(c('M08', 'method_fees', 'en', 'A $400 reward in crypto arrives as $388.', 'allow', '17437354 published example'));
add(c('M09', 'method_fees', 'en', 'Crypto payouts are capped at $500.', 'hedge', 'contradicts 17437354; this is the stale repo FAQ'));
add(c('M10', 'method_fees', 'en', 'Rise pays any amount.', 'hedge', '17437354: Rise is for $500 or more'));
add(c('M11', 'method_fees', 'en', 'Rise is available below $500.', 'hedge', '17437354'));
add(c('M12', 'method_fees', 'en', 'The crypto fee is 5%.', 'hedge', '17437354 says 3%'));
add(c('M13', 'method_fees', 'en', 'The Rise fee is $25.', 'hedge', '17437354 says $40'));
add(c('M14', 'method_fees', 'hinglish', 'Crypto fee 3% hai aur $500 se neeche sirf crypto hai.', 'allow', '17437354'));
add(c('M15', 'method_fees', 'hi', 'क्रिप्टो शुल्क 3% है।', 'allow', '17437354'));
add(c('M16', 'method_fees', 'ur', 'کرپٹو فیس 3% ہے۔', 'allow', '17437354'));
add(c('M17', 'method_fees', 'ar', 'رسوم الكريبتو 3%.', 'allow', '17437354'));
add(c('M18', 'method_fees', 'ru', 'Комиссия крипто 3%.', 'allow', '17437354'));
add(c('M19', 'method_fees', 'es', 'La comisión de cripto es del 3%.', 'allow', '17437354'));
add(c('M20', 'method_fees', 'fr', 'Les frais crypto sont de 3%.', 'allow', '17437354'));
add(c('M21', 'method_fees', 'en', 'Inside Rise you can choose a bank transfer, stablecoins, or crypto.', 'allow', '17437354'));

// Percentages. 17437285 table and 17437398 30% soft-breach share.
add(c('C01', 'percentages', 'en', 'You may not risk more than 50% of your daily loss limit on one instrument.', 'allow', '17437285'));
add(c('C02', 'percentages', 'en', 'On a 3% daily loss limit the maximum risk on one instrument is 1.5%.', 'allow', '17437285 table'));
add(c('C03', 'percentages', 'en', 'A 4% daily loss limit means 2% per instrument.', 'allow', '17437285 LITE 2-Step row'));
add(c('C04', 'percentages', 'en', 'A 5% daily loss limit means 2.5% per instrument.', 'allow', '17437285 2-Step row'));
add(c('C05', 'percentages', 'en', 'A 3% daily loss limit means 2% per instrument.', 'hedge', '17437285: 3% maps to 1.5%, not 2%'));
add(c('C06', 'percentages', 'en', 'A 5% daily loss limit means 2% per instrument.', 'hedge', '17437285: 5% maps to 2.5%'));
add(c('C07', 'percentages', 'en', 'A 4% daily loss limit means 1.5% per instrument.', 'hedge', '17437285: 4% maps to 2%'));
add(c('C08', 'percentages', 'en', 'You may risk 60% of your daily loss limit on one instrument.', 'hedge', '17437285 cap is 50%'));
add(c('C09', 'percentages', 'en', 'A soft-breach payout is 30%.', 'allow', '17437398'));
add(c('C10', 'percentages', 'en', 'A soft breach payout is 20%.', 'hedge', '17437398 says 30%'));
add(c('C11', 'percentages', 'en', 'A soft breach does not close the account.', 'allow', '17437398'));
add(c('C12', 'percentages', 'en', 'A soft breach ends the account.', 'hedge', '17437398: the account is not closed'));
add(c('C13', 'percentages', 'en', 'On a soft breach the current payout is still processed at a 30% reward share.', 'allow', '17437398'));
add(c('C14', 'percentages', 'hinglish', 'Soft breach payout 30% hota hai.', 'allow', '17437398'));
add(c('C15', 'percentages', 'hi', 'सॉफ्ट ब्रीच पर पेआउट 30% है।', 'allow', '17437398'));
add(c('C16', 'percentages', 'es', 'Tras un soft breach el pago sigue al 30%.', 'allow', '17437398'));
add(c('C17', 'percentages', 'fr', 'Après un soft breach le paiement reste à 30%.', 'allow', '17437398'));
add(c('C18', 'percentages', 'ru', 'После мягкого нарушения выплата идёт по 30%.', 'allow', '17437398'));
add(c('C19', 'percentages', 'en', 'A soft breach restarts the fee-refund count and you need three more clean payouts.', 'allow', '17437398 and 17437366'));

// Program facts. Catalyst 17437215, fee refund 17437366. Erase-versus-keep stays hedged.
add(c('G01', 'program_facts', 'en', 'Catalyst stage 4 reward share is 95% and the reset price is $1,790.', 'allow', '17437215 table'));
add(c('G02', 'program_facts', 'en', 'Catalyst stage 1 has no reset price.', 'allow', '17437215: stage 1 reset price is No reset'));
add(c('G03', 'program_facts', 'en', 'Starting from $50,000, Catalyst begins with an 80% reward share.', 'allow', '17437215 prose'));
add(c('G04', 'program_facts', 'en', 'Catalyst stage 2 reward share in the ladder table is 85%.', 'allow', '17437215 table'));
add(c('G05', 'program_facts', 'en', 'The Catalyst ladder reaches $1,000,000.', 'allow', '17437215'));
add(c('G06', 'program_facts', 'en', 'Catalyst daily loss is 3%.', 'allow', '17437215'));
add(c('G07', 'program_facts', 'en', 'Catalyst profit target is 8%.', 'allow', '17437215'));
add(c('G08', 'program_facts', 'en', 'Catalyst profit target options are 5%, 8% and 10%.', 'allow', '17437215'));
add(c('G09', 'program_facts', 'en', 'Catalyst max loss is 6% on the $25,000 stage.', 'allow', '17437215'));
add(c('G10', 'program_facts', 'en', 'Catalyst consistency rule is 30%.', 'allow', '17437215'));
add(c('G11', 'program_facts', 'en', 'Catalyst weekend trading is not allowed.', 'allow', '17437215'));
add(c('G12', 'program_facts', 'en', 'Catalyst weekend trading is allowed.', 'hedge', '17437215: weekend trading is not allowed'));
add(c('G13', 'program_facts', 'en', 'On Catalyst, each approved payout closes your account and opens a fresh one at double the size.', 'allow', '17437215'));
add(c('G14', 'program_facts', 'en', 'Catalyst profit is erased when you reset.', 'hedge', 'owner: erase-versus-keep stays hedged'));
add(c('G15', 'program_facts', 'en', 'Catalyst earlier stages stay won.', 'hedge', 'owner: erase-versus-keep stays hedged; not in 17437215'));
add(c('G16', 'program_facts', 'en', 'Your Catalyst profit is kept after a reset.', 'hedge', 'owner: erase-versus-keep stays hedged'));
add(c('G17', 'program_facts', 'en', 'Catalyst profit is preserved.', 'hedge', 'owner: erase-versus-keep stays hedged'));
add(c('G18', 'program_facts', 'en', 'Your earlier Catalyst stages are kept.', 'hedge', 'owner: erase-versus-keep stays hedged'));
add(c('G19', 'program_facts', 'en', 'Instant, Instant Elite, Flash Activation and Catalyst have no fee refund.', 'allow', '17437366'));
add(c('G20', 'program_facts', 'en', 'With your third payout the challenge fee is refunded on 1-Step if you never reset and had no soft breach.', 'allow', '17437366'));
add(c('G21', 'program_facts', 'en', 'Catalyst stage 3 reward share is 70%.', 'hedge', '17437215 stage 3 is 90%'));
add(c('G22', 'program_facts', 'en', 'The Help Centre is primary and the FAQ is secondary.', 'allow', 'review authority rule'));
add(c('G23', 'program_facts', 'en', 'The FAQ overrides the Help Centre.', 'hedge', 'review authority rule'));
add(c('G24', 'program_facts', 'mixed', 'Catalyst par profit erase ho jata hai after reset.', 'hedge', 'owner: erase-versus-keep stays hedged'));

// Mixed clauses, hedges, negation scope, questions versus claims.
add(c('X01', 'mixed_clause', 'en', 'Weekend trading resets the account and terminates it.', 'hedge', '17437306 reset is true; termination is not'));
add(c('X02', 'mixed_clause', 'en', 'A soft-breach payout is 30% and the account is closed.', 'hedge', '30% is true; closure contradicts 17437398'));
add(c('X03', 'mixed_clause', 'en', 'Crypto is 3%. Previous-cycle profit is still payable.', 'hedge', 'the fee is true; the profit claim contradicts the owner'));
add(c('X04', 'mixed_clause', 'en', 'Previous profit is not payable. The Rise fee is $10.', 'hedge', 'the denial is true; $10 contradicts 17437354'));
add(c('X05', 'mixed_clause', 'en', 'A Strategy Risk breach is a soft breach with a reset, but the account is then terminated.', 'hedge', 'owner'));
add(c('X06', 'mixed_clause', 'en', 'The Rise fee is $40 and crypto is the only method below $500.', 'allow', '17437354; both clauses are supported'));
add(c('X07', 'hedge_bypass', 'en', "I can't confirm that. Finance took back the payout.", 'hedge', 'a hedge sentence must not carry the take-back'));
add(c('X08', 'hedge_bypass', 'en', "I can't confirm that. The payout was paid.", 'hedge', 'a hedge must not carry a completion'));
add(c('X09', 'hedge_bypass', 'en', "I can't confirm that.", 'allow', 'clean hedge'));
add(c('X10', 'hedge_bypass', 'en', 'I confirm the opposite: the payout was reversed.', 'hedge', 'opposite is not a confirmation and the reversal contradicts the owner'));
add(c('X11', 'negation_scope', 'en', 'The fee is not $40. Previous-cycle profit remains payable.', 'hedge', 'a negation on the fee does not clear the profit claim'));
add(c('X12', 'negation_scope', 'mixed', 'نہیں، previous profit payable hai.', 'hedge', 'a leading نہیں does not make a payable-profit claim safe'));
add(c('X13', 'negation_scope', 'en', 'Previous-cycle profit is not payable after a reset. Crypto fee is 3%.', 'allow', 'both clauses supported'));
add(c('X14', 'negation_scope', 'hi', 'पिछला लाभ देय नहीं है।', 'allow', 'owner; Hindi negation is in the same clause'));
add(c('X15', 'negation_scope', 'ur', 'پچھلا منافع قابل ادائیگی نہیں ہے۔', 'allow', 'owner'));
add(c('X16', 'question_vs_claim', 'en', 'Does a Strategy Risk breach terminate the account?', 'allow', 'a question does not assert the termination'));
add(c('X17', 'question_vs_claim', 'en', 'What happens after a Strategy Risk breach? The account is terminated.', 'hedge', 'the carried answer asserts termination'));
add(c('X18', 'question_vs_claim', 'en', 'What is the crypto fee? It is 9%.', 'hedge', '17437354 is 3%'));
add(c('X19', 'question_vs_claim', 'en', 'Is the Rise fee $40? It is $90.', 'hedge', '17437354 is $40'));
add(c('X20', 'question_vs_claim', 'en', 'What is the Rise minimum? It is $500 or more, and the fee is $40.', 'allow', '17437354'));
add(c('X21', 'question_vs_claim', 'es', '¿El trading de fin de semana cierra la cuenta? No, la cuenta se reinicia.', 'allow', '17437306'));
add(c('X22', 'question_vs_claim', 'fr', 'Le week-end ferme-t-il le compte? Le compte est clôturé.', 'hedge', 'the answer asserts closure'));
add(c('X23', 'mixed_clause', 'en', 'Strategy Risk never closes the funded account and it can be reset.', 'allow', 'owner: soft breach with a reset, never termination'));
add(c('X24', 'silent_drop', 'en', 'A Strategy Risk breach is a soft breach with a reset.', 'allow', 'control: a supported sentence must still be sent'));
add(c('X25', 'silent_drop', 'en', 'Weekend trading terminates the funded account.', 'hedge', 'control: an unsafe sentence must be replaced, not dropped'));

module.exports = { cases };
