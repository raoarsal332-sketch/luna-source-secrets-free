'use strict';

/**
 * T800 payout claim guard R7 — frozen synthetic candidate.
 *
 * Rebuilt from this repo plus the t812 handoff delta. The R6 package and its
 * review are not in this checkout. Not wired into presendMega.js or index.js.
 * Not a release. approved is false until a different agent reviews it.
 *
 * Blocks completion claims that a reset, restore, or payout disbursement has
 * already happened. Topic and language tags are not inputs. The English hedge
 * in knowledgeGapGate is kept: a hedged draft is returned unchanged. A block
 * always carries a non-empty client message and a reason.
 */

const gap = require('../../02_statePresend/knowledgeGapGate');

const STATUS = Object.freeze({
  candidate: 't800-payout-r7',
  frozen: true,
  approved: false,
  release: false,
});

const CLIENT_MESSAGE = "I can't confirm that. Our team will confirm.";

const EN_CLAIM = new RegExp(
  String.raw`\b(?:` +
    String.raw`(?:i|we)(?:\s*'\s*ve|\s+have|\s+already)\s+(?:just\s+)?(?:reset|restored)` +
    String.raw`|(?:i|we)\s+(?:just\s+)?(?:reset|restored)` +
    String.raw`|(?:your|the)\s+(?:account|payout|withdrawal|challenge|balance|cycle|credentials?)\s+(?:has\s+been|have\s+been|was|were|is\s+now|are\s+now)\s+(?:reset|restored)` +
    String.raw`|(?:it|this)\s+(?:has\s+been|have\s+been|was|were)\s+(?:reset|restored)` +
    String.raw`|(?:reset|restore)\s+(?:has\s+been|is)\s+(?:done|completed|applied)` +
  String.raw`)\b`,
  'i'
);

const IT_CLAIM = /\b(?:ho|abbiamo)\s+(?:ripristinato|resettato)\b|\b(?:è|e')\s+stato\s+(?:ripristinato|resettato)\b/i;
const HI_CLAIM = /\b(?:account\s+)?(?:reset|restore)\s+(?:ho\s+gaya(?:\s+hai)?|kar\s+diya(?:\s+hai)?|ho\s+chuka(?:\s+hai)?)\b/i;
const AR_RESET = /(?:تم|تمت)\s+إعادة\s+تعيين|(?:تم|تمت)\s+استعادة/;

function sentences(text) {
  return String(text || '')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?؟])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

function hasArabicWord(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // One attached clitic (و/ف/ب/...) and the definite ال, so والخسارة still counts.
  const re = new RegExp(
    '(?:^|[^\\p{Script=Arabic}\\p{L}\\p{N}])[\\p{Script=Arabic}]?(?:ال)?' +
      escaped +
      '(?:$|[^\\p{Script=Arabic}\\p{L}\\p{N}])',
    'u'
  );
  return re.test(String(text || ''));
}

function hasSarfCue(text) {
  return /(?:^|[^\p{Script=Arabic}\p{L}\p{N}])صرف[\p{Script=Arabic}]{0,3}(?=$|[^\p{Script=Arabic}\p{L}\p{N}])/u.test(
    String(text || '')
  );
}

function hasPayoutCue(text) {
  return hasArabicWord(text, 'الدفعة') || hasArabicWord(text, 'الدفع') || hasSarfCue(text);
}

function hasSahb(text) {
  return /(?:^|[^\p{Script=Arabic}\p{L}\p{N}])[\p{Script=Arabic}]?(?:ال)?سحب(?=$|[^\p{Script=Arabic}\p{L}\p{N}])/u.test(
    String(text || '')
  );
}

function hasLossWord(text) {
  return (
    hasArabicWord(text, 'خسارة') ||
    hasArabicWord(text, 'خسائر') ||
    /\bloss\b/i.test(text) ||
    /\bdrawdown\b/i.test(text)
  );
}

function isQuestion(sentence) {
  return /[?؟]\s*$/.test(String(sentence || '').trim());
}

function arabicNegated(sentence) {
  return /لم\s*(?:ي|ت)?تم|لن\s*(?:ي|ت)?تم/.test(sentence);
}

function completionMarked(sentence) {
  return /تم|تمت|صُرف|صرفت|أُرسلت|ارسلت/.test(sentence);
}

function sahbArmed(sentence) {
  if (!hasSahb(sentence)) return false;
  return hasLossWord(sentence) || hasPayoutCue(sentence) || /\bpayout\b/i.test(sentence) || /\bwithdraw(?:al)?\b/i.test(sentence);
}

function findClaims(draft) {
  const claims = [];
  function add(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text && !claims.includes(text)) claims.push(text);
  }
  const english = draft.match(EN_CLAIM);
  if (english) add(english[0]);
  const italian = draft.match(IT_CLAIM);
  if (italian) add(italian[0]);
  const hinglish = draft.match(HI_CLAIM);
  if (hinglish) add(hinglish[0]);
  for (const sentence of sentences(draft)) {
    if (isQuestion(sentence) || arabicNegated(sentence)) continue;
    const reset = sentence.match(AR_RESET);
    if (reset) add(reset[0]);
    if (hasPayoutCue(sentence) && completionMarked(sentence)) add(sentence);
    else if (sahbArmed(sentence) && /تم|تمت/.test(sentence)) add(sentence);
  }
  return claims;
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function humanConfirmed(claims, messages) {
  if (!claims.length) return false;
  const support = normalize(
    (messages || [])
      .filter((m) => m && (m.role === 'human' || m.role === 'note'))
      .map((m) => m.text || '')
      .join('\n')
  );
  return claims.every((claim) => support.includes(normalize(claim)));
}

/**
 * @param {object} ctx
 * @param {string} [ctx.draft]
 * @param {Array<{role: string, text: string}>} [ctx.messages]
 * @returns {object}
 */
function evaluateResetRestoreClaim(ctx) {
  const input = ctx || {};
  const draft = String(input.draft == null ? '' : input.draft);
  const base = {
    version: STATUS.candidate,
    frozen: true,
    approved: false,
    release: false,
    silent: false,
    topicIgnored: true,
  };
  if (!draft.trim()) {
    return Object.assign(base, {
      action: 'allow',
      reason: 'no_claim',
      claims: [],
      clientMessage: draft,
      hedgeKept: false,
    });
  }
  if (gap.HEDGE_RE.test(draft)) {
    return Object.assign(base, {
      action: 'allow',
      reason: 'hedge_kept',
      claims: findClaims(draft),
      clientMessage: draft,
      hedgeKept: true,
    });
  }
  const claims = findClaims(draft);
  if (!claims.length) {
    return Object.assign(base, {
      action: 'allow',
      reason: 'no_claim',
      claims: [],
      clientMessage: draft,
      hedgeKept: false,
    });
  }
  if (humanConfirmed(claims, input.messages)) {
    return Object.assign(base, {
      action: 'allow',
      reason: 'human_confirmed',
      claims,
      clientMessage: draft,
      hedgeKept: false,
    });
  }
  return Object.assign(base, {
    action: 'block',
    reason: 'reset_restore_or_payout_completion',
    claims,
    clientMessage: CLIENT_MESSAGE,
    hedgeKept: false,
  });
}

module.exports = {
  STATUS,
  CLIENT_MESSAGE,
  findClaims,
  sahbArmed,
  hasPayoutCue,
  evaluateResetRestoreClaim,
};
