'use strict';

/**
 * textUtils.js - shared deterministic text helpers for the state/presend pack.
 * Dependency-free.
 */

const STOPWORDS = new Set(('a an the and or but if then so to of in on at for from by with without about as is are was were be been being am do does did done have has had having i you he she it we they me him her us them my your his its our their this that these those there here can could will would shall should may might must please thanks thank hi hello hey ok okay yes no not just also still already again very really much many some any all more most other another one two just now today yesterday tomorrow when where what which who whom how why want need like get got make made take took go went come came see saw know knew think thought say said tell told ask asked give gave let put keep kept try tried use used help ' +
  'kindly regards dear team support account issue problem question').split(/\s+/));

function stripHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n\n+/g, '\n')
    .trim();
}

/** Light stemmer so "trading"/"trade", "resetting"/"reset", "positions"/"position" compare equal. */
function stem(w) {
  if (w.length < 5 || /\d/.test(w)) return w;
  let s = w.replace(/(?:ing|ed|es|s|e)$/, '');
  if (/([b-df-hj-np-tv-z])\1$/.test(s)) s = s.slice(0, -1);
  return s.length >= 3 ? s : w;
}

function normalize(s) {
  return stripHtml(s).toLowerCase().replace(/[^\p{L}\p{N}\s@.%$-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(s, { keepStop = false } = {}) {
  const out = [];
  for (const t of normalize(s).split(/[\s.,;:!?()[\]{}"']+/)) {
    if (!t) continue;
    if (!keepStop && STOPWORDS.has(t)) continue;
    if (t.length < 2 && !/\d/.test(t)) continue;
    out.push(t);
  }
  return out;
}

function sentences(s) {
  const text = stripHtml(s).replace(/\n+/g, '. ');
  // Devanagari danda, Arabic question mark, and fullwidth question mark end a
  // sentence the same way "." and "?" do. A question mark still splits even
  // when the next sentence is not separated by whitespace.
  return text.split(/(?<=[.!?।？؟])\s+|(?<=[?؟？])/).map((x) => x.trim()).filter(Boolean);
}

function jaccard(a, b) {
  const A = new Set(a.map(stem));
  const B = new Set(b.map(stem));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}

function overlapRatio(needle, haystack) {
  // fraction of (stemmed) needle tokens present in haystack tokens
  const H = new Set(haystack.map(stem));
  const N = [...new Set(needle.map(stem))];
  if (!N.length) return 0;
  let hit = 0;
  for (const t of N) if (H.has(t)) hit += 1;
  return hit / N.length;
}

function similarity(a, b) {
  return jaccard(tokens(a), tokens(b));
}

// Kept in sync with imageAskGuard.js / accountNumberPrefer.js (5-12 digits); a narrower
// range here let 8+ digit accounts slip past the CONVERSATION_CONTRADICTION check.
const ACCOUNT_RE = /(?<!\d)(\d{5,12})(?!\d)/g;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

// A one-time code, PIN or verification code is the same shape as an account number, and
// retaining one in conversation state would be storing a credential (see the retention rule
// in the upgrade spec). Skip a match that is explicitly labelled as a credential.
const CREDENTIAL_LABEL_RE = /\b(?:otp|o\.t\.p|one[\s-]?time(?:\s+(?:code|password|pin))?|pin|passcode|password|pass|2fa|mfa|auth(?:entication)?\s+code|verification\s+code|security\s+code|code)\b[\s:=-]*(?:is|was|:)?[\s:=-]*$/i;

function extractAccountNumbers(s) {
  const t = stripHtml(s);
  const out = [];
  let m;
  const re = new RegExp(ACCOUNT_RE.source, 'g');
  while ((m = re.exec(t)) !== null) {
    const before = t.slice(Math.max(0, m.index - 40), m.index);
    if (CREDENTIAL_LABEL_RE.test(before)) continue;
    out.push(m[1]);
  }
  return out;
}

function extractEmail(s) {
  const m = stripHtml(s).match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

const SHORT_ACK_RE = /^(?:ok(?:ay)?|k|kk|done|sent|yes|yep|yeah|sure|thanks|thank you|thx|ty|attached|here|noted|alright|fine|great|good|got it|perfect|cool|no problem|np|welcome|you're welcome|ok thanks|okay thanks|ok done|done thanks|hi|hello|hey|good morning|good evening|bye|goodbye)[.!\s]*$/i;

function isShortAck(s) {
  const t = stripHtml(s);
  if (!t) return false;
  if (t.split(/\s+/).length > 5) return false;
  return SHORT_ACK_RE.test(t);
}

// Greeting words + "how are you" (incl. common typos like "atre", "r u", an optional
// "i said ..." repeat prefix, and light punctuation) - pure small talk, not a real
// information request. Anchored to the whole (trimmed) sentence so it never matches a
// real question that merely starts with a greeting or "how" (e.g. "how do I reset my
// account" still falls through untouched).
const GREETING_WORD_RE = /^(?:hi+|hey+|hello+|hola|yo|salam|(?:as+alam|assalam)\s*(?:u|o)?\s*alaikum|good\s*(?:morning|afternoon|evening|day))$/i;
const HOW_ARE_YOU_RE = /^(?:i\s+said\s+)?how\s+(?:a[a-z]{0,2}re|r)\s+(?:you|u|ya|yu)(?:\s+(?:doing|going))?$/i;
// Bot-presence / "still there" chitchat - "what are you doing", "are you there", etc.
// Whole-sentence anchored, so "what are you doing with my payout" or "are you there to fix
// my account" (extra trailing content) are NOT small talk and still fall through untouched.
const PRESENCE_CHITCHAT_RE = /^(?:i\s+said\s+)?what\s+(?:are|r)\s+(?:you|u)\s+(?:doing|up\s+to)$/i;
const STILL_THERE_RE = /^(?:are\s+you\s+(?:still\s+)?there|you\s+(?:still\s+)?there|is\s+(?:anyone|anybody)\s+there|anyone\s+there|hello+\s*,?\s*(?:anyone|anybody)\s+there)$/i;
// Short identity chitchat only ("who are you", "are you a bot") - a real account question
// that happens to mention "bot"/"human" in passing will not match this narrow, anchored set.
const IDENTITY_CHITCHAT_RE = /^(?:who\s+are\s+you|are\s+you\s+(?:a\s+)?(?:bot|human|real|robot|an?\s+ai)|is\s+this\s+a\s+bot|am\s+i\s+(?:talking|chatting)\s+(?:to|with)\s+a\s+(?:bot|human|real\s+person))$/i;
const SMALLTALK_PHRASE_RE = /^(?:what'?s\s+up|how'?s\s+it\s+going|how\s+have\s+you\s+been|how'?s\s+(?:everything|your\s+day)|how\s+do\s+you\s+do)$/i;
// Client calling out the bot's own configured display name/persona only ("Arsal ?", "Arsal",
// "Elite AI?", "Luna?") - Arsal is Luna's live admin-seat display name (see
// statePresend.js botIdentityOpts()). This is a presence/identity check ("is this Arsal? are
// you there?"), not a real information request, so it must not force the generic "checking
// this now" fallback. Anchored to the whole message, so "Arsal, can you check my payout?"
// (extra real content) still falls through untouched.
const BOT_NAME_CHITCHAT_RE = /^(?:arsal|elite\s*ai|luna)$/i;
// Allow extra repeated letters in a greeting ("helllo arsal"), while still
// requiring the entire message to be only a greeting and bot name.
const HELLO_BOT_NAME_RE = /^(?:hi+|hey+|he+l+o+)\s*,?\s*(?:arsal|elite\s*ai|luna)$/i;
// "hello arsal how are you" / "hi luna, how are you doing" — common combo the split
// patterns alone miss (HELLO_BOT_NAME has no how-are-you; HOW_ARE_YOU has no name).
const HELLO_NAME_HOW_ARE_YOU_RE =
  /^(?:hi+|hey+|he+l+o+)\s*,?\s*(?:arsal|elite\s*ai|luna)\s*,?\s+how\s+(?:a[a-z]{0,2}re|r)\s+(?:you|u|ya|yu)(?:\s+(?:doing|going))?$/i;
const HOW_ARE_YOU_NAME_RE =
  /^how\s+(?:a[a-z]{0,2}re|r)\s+(?:you|u|ya|yu)(?:\s+(?:doing|going))?\s*,?\s*(?:arsal|elite\s*ai|luna)$/i;

function isGreetingOrSmallTalk(s) {
  const t = stripHtml(s).replace(/’/g, "'").trim();
  if (!t || t.length > 80) return false;
  const stripped = t.replace(/[?!.,\s]+$/g, '').trim();
  return (
    GREETING_WORD_RE.test(stripped) ||
    HOW_ARE_YOU_RE.test(stripped) ||
    PRESENCE_CHITCHAT_RE.test(stripped) ||
    STILL_THERE_RE.test(stripped) ||
    IDENTITY_CHITCHAT_RE.test(stripped) ||
    SMALLTALK_PHRASE_RE.test(stripped) ||
    BOT_NAME_CHITCHAT_RE.test(stripped) ||
    HELLO_BOT_NAME_RE.test(stripped) ||
    HELLO_NAME_HOW_ARE_YOU_RE.test(stripped) ||
    HOW_ARE_YOU_NAME_RE.test(stripped)
  );
}

// --- Ask detectors (what the bot is asking the client for) --------------------

const ASK_PATTERNS = {
  account_number: /\b(?:share|send|provide|give|tell|confirm|what(?:'s| is)|could you|can you|may i have|i need|please)\b[^.?!\n।؟？]{0,50}\b(?:account|login|trading account|acc)\s*(?:number|no\.?|id|#)|(?:^|[^a-z0-9])(?:mera|meri|mere|mujhe|kya|kaise)\s+(?:\S+\s+){0,6}account\s*(?:number|no\.?|#)|(?:खाता|अकाउंट|अकाउण्ट|एकाउंट|अकाउन्ट)\s*(?:संख्या|नंबर|नम्बर)/iu,
  email: /\b(?:share|send|provide|give|tell|confirm|what(?:'s| is)|could you|can you|may i have|i need|please)\b[^.?!\n]{0,50}\b(?:e-?mail(?: address)?|registered email)\b/i,
  order_id: /\b(?:share|send|provide|give|tell|confirm|what(?:'s| is)|could you|can you|may i have|i need|please)\b[^.?!\n]{0,50}\b(?:order|payment|transaction|invoice)\s*(?:id|number|no\.?|reference)/i,
  screenshot: /\b(?:send|share|upload|attach|provide|forward|resend|re-send)\b[^.?!\n]{0,50}\b(?:screenshots?|screen shots?|images?|pictures?|photos?)\b/i,
};

function detectAsks(botText) {
  const t = stripHtml(botText);
  const out = [];
  for (const [item, re] of Object.entries(ASK_PATTERNS)) if (re.test(t)) out.push(item);
  return out;
}

// \\b is ASCII-only, including under the u flag, so Devanagari interrogatives are
// bounded by "not a Devanagari letter" instead. Hinglish tokens are bounded by
// "not an ASCII letter" so "kya" does not match inside a longer Latin word.
const DEVANAGARI_INTERROGATIVE = /(?:^|[^\u0900-\u097F])(?:क्या|कैसे|कहाँ|कहां|कब|क्यों|कौन|किस)(?:[^\u0900-\u097F]|$)/;
const HINGLISH_INTERROGATIVE = /(?:^|[^a-z0-9])(?:kya|kaise|kahan|kab|kyun|kyon|kaun|kis)(?:[^a-z0-9]|$)/i;

function isQuestionSentence(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  if (/[?؟？]\s*$/.test(t)) return true;
  if (DEVANAGARI_INTERROGATIVE.test(t)) return true;
  if (HINGLISH_INTERROGATIVE.test(t)) return true;
  return /^(?:can|could|would|will|how|what|when|where|why|which|who|is|are|do|does|did|should|may|am|please (?:tell|explain|let me know|advise|confirm)|i (?:want|need|would like) to know|let me know|any (?:idea|update)|tell me)\b/i.test(t);
}

// "A and B?" carries two material asks under one question mark. Treating it as one ask let
// a reply answering only the first half score as complete, so the completeness gate never
// fired and half the client's question was silently dropped. Split on a conjunction only
// when BOTH sides still look like a real ask, so ordinary "X and Y" phrasing is untouched.
// "और" / "aur" are the same conjunction in Devanagari and Hinglish.
const COMPOUND_SPLIT_RE = /\s+(?:,\s*)?(?:and|also|plus)\s+(?=(?:what|how|when|where|why|which|who|can|could|do|does|did|is|are|will|would|should|may|am)\b)|\s+aur\s+(?=(?:(?:\S+\s+){0,4})?(?:kya|kaise|kahan|kab|kyun|kyon|kaun|kis)\b)|\s+और\s+(?=(?:(?:\S+\s+){0,4})?(?:क्या|कैसे|कहाँ|कहां|कब|क्यों|कौन|किस))/iu;

function splitCompoundQuestion(q) {
  const t = String(q || '').trim();
  if (!COMPOUND_SPLIT_RE.test(t)) return [t];
  const parts = t.split(COMPOUND_SPLIT_RE).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return [t];
  // Every part must carry real content; otherwise keep the original single ask.
  if (!parts.every((p) => tokens(p).length >= 1)) return [t];
  return parts.map((p, i) => (i === parts.length - 1 || /\?$/.test(p) ? p : p + '?'));
}

function extractQuestions(text) {
  const out = [];
  for (const q of sentences(text).filter(isQuestionSentence)) {
    for (const part of splitCompoundQuestion(q)) out.push(part);
  }
  return out;
}

// --- Topics -----------------------------------------------------------------

const TOPIC_LEXICON = {
  login: /\b(log ?in|login|sign ?in|password|credential|invalid account|logged out|log out)\b/i,
  account_status: /\b(activat(?:e|ed|ion)|status|pending|awaiting|active now|not active|approved|approval)\b/i,
  payout: /\b(payout|withdraw(?:al)?|profit split|paid|payment received|payment status)\b/i,
  kyc: /\b(kyc|verification|verify (?:my )?identity|id document|passport)\b/i,
  rules: /\b(rule|drawdown|daily loss|max loss|consistency|news trading|weekend|holding|lot size|leverage)\b/i,
  challenge: /\b(challenge|evaluation|phase ?[12]|funded|instant(?: elite)?|elite|1-?step|2-?step|target|profit target)\b/i,
  reset_retry: /\b(reset|retry|free retry|restart|new attempt)\b/i,
  refund: /\b(refund|chargeback|money back|charged twice|double charge)\b/i,
  promo: /\b(promo(?:tion)?|discount|coupon|voucher|offer|sale|code)\b/i,
  spreads: /\bspreads?\b/i,
  platform: /\b(platform|terminal|chart|server|trade history|open positions?|positions? disappeared|history missing)\b/i,
  screenshot: /\b(screenshot|image|picture|attached)\b/i,
  certificate: /\b(certificate|badge)\b/i,
  affiliate: /\b(affiliate|referral|commission)\b/i,
  pricing: /\b(price|pricing|cost|fee|how much)\b/i,
  scaling: /\b(scal(?:e|ing) plan|scale up|upgrade)\b/i,
};

function extractTopics(text) {
  const t = stripHtml(text);
  const out = [];
  for (const [topic, re] of Object.entries(TOPIC_LEXICON)) if (re.test(t)) out.push(topic);
  return out;
}

function containsAny(text, res) {
  const t = stripHtml(text);
  return res.some((re) => re.test(t));
}

function uniq(arr) {
  return [...new Set(arr)];
}

function clip(s, n) {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n - 3) + '...' : t;
}

module.exports = {
  STOPWORDS,
  TOPIC_LEXICON,
  ASK_PATTERNS,
  stripHtml,
  normalize,
  tokens,
  stem,
  sentences,
  jaccard,
  overlapRatio,
  similarity,
  extractAccountNumbers,
  extractEmail,
  isShortAck,
  isGreetingOrSmallTalk,
  detectAsks,
  isQuestionSentence,
  extractQuestions,
  splitCompoundQuestion,
  extractTopics,
  containsAny,
  uniq,
  clip,
};
