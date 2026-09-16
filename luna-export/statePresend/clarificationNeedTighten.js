'use strict';

const T = require('./textUtils');

const CLARIFY_RE = /\b(?:could you (?:please )?(?:clarify|specify|explain|confirm)|can you (?:please )?(?:clarify|specify|explain|confirm)|what (?:exactly|specifically) do you mean|which (?:account|challenge|one|platform|issue) (?:do you mean|are you referring to)|please (?:clarify|specify|elaborate)|to (?:better )?(?:assist|help) you[^.?!]{0,40}\b(?:could|can) you)\b/i;
const FIELD_FOR_ASK = { account_number: 'account_number', email: 'email', order_id: 'order_id', screenshot: 'screenshot' };
function evaluate(draft, state, knowledge) {
  const d = T.stripHtml(draft);
  const asksFor = T.detectAsks(d);
  const issues = [];
  const known = (state && state.known_details) || {};
  for (const item of asksFor) {
    const field = FIELD_FOR_ASK[item];
    if (field === 'screenshot') continue;
    if (known[field]) issues.push({ code: 'ALREADY_COLLECTED_INFO_REQUEST', item, detail: `Client already provided ${item.replace('_', ' ')} ${known[field]}.` });
    else if (state && state.asked_items && state.asked_items.filter((a) => a.item === item).length >= 1 && state.last_client_message && !T.isShortAck(state.last_client_message)) issues.push({ code: 'REPEATED_QUESTION', item, detail: `${item.replace('_', ' ')} was already requested earlier and the client has since replied.` });
  }
  const questions = T.extractQuestions(d);
  const nonQuestionSentences = T.sentences(d).filter((x) => !T.isQuestionSentence(x) && T.tokens(x).length >= 3);
  const isPureClarification = questions.length > 0 && nonQuestionSentences.length === 0 && (CLARIFY_RE.test(d) || asksFor.length > 0);
  if (isPureClarification && !asksFor.length && CLARIFY_RE.test(d)) {
    const level = knowledge && knowledge.level;
    const pending = state && state.pending_questions ? state.pending_questions.length : 0;
    if (level === 'supported' && pending >= 1 && !(state && state.waiting_for)) issues.push({ code: 'UNNECESSARY_CLARIFICATION', item: null, detail: 'Approved knowledge already answers the client question; answer it instead of asking for clarification.' });
  }
  return { issues, asksFor, isPureClarification };
}
module.exports = { evaluate, CLARIFY_RE };
