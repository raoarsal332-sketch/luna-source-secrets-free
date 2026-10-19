'use strict';

const T = require('./statePresend/textUtils');

/**
 * Client explicitly asks to resend / send-again the bot's last public reply.
 * Includes live failure: "Can you please resend you last msg" (you→your typo).
 * Kept separate from generic "say again" so callers can allow exact/near resend.
 */
function isClientAskedResendLastReply(latestText) {
  const latest = T.stripHtml(latestText);
  if (!latest) return false;
  // resend / re-send / resent / send … again
  const asksResend = /\b(?:re[\s-]?send|resent)\b|\bsend\b(?:\s+\w+){0,4}\s+again\b/i.test(latest);
  // last/previous msg|message|reply|answer — tolerate "you last" for "your last"
  const namesLast = /\b(?:you(?:r)?\s+)?(?:last|previous)\s+(?:msg|message|reply|answer)\b/i.test(latest);
  return asksResend && namesLast;
}

function isRepeatedClientQuestion(latestText, priorClientTexts = []) {
  const latest = T.stripHtml(latestText);
  const prior = priorClientTexts.slice(-12).map(T.stripHtml).filter(Boolean);
  // Explicit resend-last-bot-reply (does not require a prior client question)
  if (isClientAskedResendLastReply(latest)) return true;
  if (/\b(?:explain|say|answer|tell|rephrase)\b[^.!?]{0,50}\bagain\b|\brepeat (?:that|it|the answer|your answer)\b|\bone more time\b/i.test(latest) && prior.length) return true;
  const latestTokens = T.tokens(latest);
  if (latestTokens.length < 2) return false;
  return prior.some((text) => {
    if (T.tokens(text).length < 2) return false;
    return T.normalize(text) === T.normalize(latest) || T.similarity(text, latest) >= 0.8;
  });
}

function nearCopiedWording(a, b) {
  const first = T.tokens(a);
  const second = T.tokens(b);
  if (first.length < 4 || second.length < 4) return false;
  const pairs = (tokens) => tokens.slice(1).map((word, i) => tokens[i] + ' ' + word);
  return T.jaccard(pairs(first), pairs(second)) >= 0.8;
}

function canonFactUnit(u) {
  const x = String(u || '').toLowerCase().replace(/s$/, '');
  if (x === 'percent') return '%';
  if (x === 'min') return 'minute';
  if (x === 'sec') return 'second';
  if (x === 'hr') return 'hour';
  return x;
}

function protectedFactsMatch(previous, next) {
  const facts = (text) => {
    const t = T.stripHtml(text);
    const nums = [];
    const re = /(\d+(?:[.,]\d+)?)\s*(%|percent|minutes?|mins?|seconds?|secs?|hours?|hrs?|days?|weeks?|months?|usd|\$)?/gi;
    let m;
    while ((m = re.exec(t)) !== null) {
      const unit = canonFactUnit(m[2] || '');
      const val = String(m[1]).replace(',', '.');
      nums.push(unit ? `${val}|${unit}` : val);
    }
    const keys = t.match(/\b(?:not|never|only|must|required|eligible|ineligible|allowed|prohibited|cannot|can't|no|free|retry|refund|addon|add-on|scalping)\b/gi) || [];
    const urls = t.match(/https?:\/\/[^\s]+/gi) || [];
    return [...new Set([
      ...nums,
      ...keys.map((x) => x.toLowerCase().replace(/\s+/g, '')),
      ...urls.map((x) => x.toLowerCase()),
    ])].sort();
  };
  const a = facts(previous);
  const b = facts(next);
  const prevMeasured = a.filter((x) => String(x).includes('|'));
  const nextSet = new Set(b);
  if (prevMeasured.some((x) => !nextSet.has(x))) return false;
  const nextMeasured = b.filter((x) => String(x).includes('|'));
  if (nextMeasured.some((x) => !a.includes(x))) return false;
  return true;
}

module.exports = { isRepeatedClientQuestion, isClientAskedResendLastReply, nearCopiedWording, protectedFactsMatch };
