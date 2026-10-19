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
  return text.split(/(?<=[.!?])\s+|(?<=\?)/).map((x) => x.trim()).filter(Boolean);
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
// Signature phone labels (live 215476211580841): "(M):+00 (0)000000000" must not become known.account_number.
const PHONE_LABEL_RE = /(?:\b(?:m|tel|telephone|phone|mobile|cell|whatsapp|wa|contact)\b\s*[):.\-]|\+\d{1,3}\s*(?:\(?0\)?)?\s*)$/i;

function extractAccountNumbers(s) {
  const t = stripHtml(s);
  const out = [];
  let m;
  const re = new RegExp(ACCOUNT_RE.source, 'g');
  while ((m = re.exec(t)) !== null) {
    const before = t.slice(Math.max(0, m.index - 40), m.index);
    if (CREDENTIAL_LABEL_RE.test(before)) continue;
    if (PHONE_LABEL_RE.test(before)) continue;
    try {
      if (require('../accountNumberPrefer').isBlockedNoise(m[1], t)) continue;
    } catch (_) {}
    // International dial fragments glued to national numbers: "+00 (0)000000000"
    const around = t.slice(Math.max(0, m.index - 8), m.index + m[0].length + 2);
    if (/\+\d{1,3}\s*\(?0?\)?\s*\d{6,12}/.test(around) || /\(\s*0\s*\)\s*\d{6,12}/.test(around)) continue;
    out.push(m[1]);
  }
  return out;
}

function extractEmail(s) {
  const m = stripHtml(s).match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

const SHORT_ACK_RE = /^(?:ok+(?:ay)?|k|kk|done|sent|yes|yep|yeah|sure|thanks|thank you|thx|ty|attached|here|noted|alright|fine|great|good|got it|perfect|cool|no problem|np|welcome|you're welcome|ok thanks|okay thanks|ok done|done thanks|hi|hello|hey|good morning|good evening|bye|goodbye)[.!\s]*$/i;
// Waiting / status acks while an open ask is pending (ticket 215476045133527).
const WAITING_ACK_RE = /^(?:ok(?:ay)?\s+)?(?:i(?:(?:'|\u2019)?(?:m|ll)|\s+am|\s+will)\s+)?(?:just\s+)?wait(?:ing)?(?:\s+(?:for|till|until)(?:\s+(?:(?:an?\s+)?(?:update|reply|answer|news|it|that|then)|you|the\s+team))?)?[.!\s]*$/i;

function isWaitingOrStatusAck(s) {
  const t = stripHtml(s).replace(/\u2019/g, "'").trim();
  if (!t || t.length > 80) return false;
  if (/[?]/.test(t)) return false;
  const stripped = t.replace(/[?!.,\s]+$/g, '').trim();
  if (WAITING_ACK_RE.test(stripped)) return true;
  // 215476169761054: "Okay Ill wait till that" (I'll without apostrophe + till/until that/then).
  if (/^(?:ok(?:ay)?|alright|sure)[,.\s]+(?:i(?:'|\u2019)?ll|ill|i\s+will)\s+wait(?:ing)?(?:\s+(?:till|until|for)\s+(?:that|then|it|you))?[.!\s]*$/i.test(stripped)) return true;
  if (/^(?:ok(?:ay)?|alright|sure)[,.\s]+(?:i(?:'|\u2019)?ll\s+)?wait(?:ing)?(?:\s+then)?$/i.test(stripped)) return true;
  return false;
}

function isShortAck(s) {
  const t = stripHtml(s);
  if (!t) return false;
  if (isWaitingOrStatusAck(t)) return true;
  if (t.split(/\s+/).length > 5) return false;
  return SHORT_ACK_RE.test(t);
}

// Greeting words + "how are you" (incl. common typos like "atre", "r u", an optional
// "i said ..." repeat prefix, and light punctuation) - pure small talk, not a real
// information request. Anchored to the whole (trimmed) sentence so it never matches a
// real question that merely starts with a greeting or "how" (e.g. "how do I reset my
// account" still falls through untouched).
const GREETING_WORD_RE = /^(?:hi+|hey+|hello+|hola|yo|salam|(?:as+alam|assalam)\s*(?:u|o)?\s*alaikum|good\s*(?:morning|afternoon|evening|day))$/i;
const HOW_ARE_YOU_RE = /^(?:i\s+(?:said|sid|sed|siad|sert|ask(?:ed)?|mean)\s+)?(?:bro[,\s]+)?(?:i\s+(?:asked|said|sid)\s+)?how\s+(?:a[a-z]{0,2}re|r)\s+(?:you|u|ya|yu)(?:\s+(?:doing|going|today))?$/i;
// Paraphrase smalltalk (day/things/you good/and you) — still greeting, not account ask.
const SMALLTALK_PARAPHRASE_RE = /^(?:(?:bro[,\s]+)?(?:i\s+(?:said|sid|sed|mean|asked)\s+)?)?(?:how(?:'s|\s+is)\s+your\s+day(?:\s+going)?|how(?:'s|\s+are)\s+things|how(?:'s|\s+is)\s+it\s+going|you\s+good|and\s+you|how\s+about\s+you|i(?:'m|\s+am)\s+asking\s+about\s+you|i\s+asked\s+how\s+you\s+(?:are|were)|how\s+r\s+u)\s*$/i;

/** Strip "I said/sid/..." prefixes so typo repeats still match how-are-you. */
function normalizeSmalltalkPrefix(s) {
  let t = String(s || '').replace(/\u2019/g, "'").trim();
  t = t.replace(/^[?!.,\s]+/, '').replace(/[?!.,\s]+$/, '').trim();
  t = t.replace(/^(?:bro[,\s]+)?(?:i\s+(?:just\s+)?)?(?:said|sid|sed|siad|sert|ask(?:ed)?|mean)\s+/i, '');
  t = t.replace(/^(?:i(?:'m|\s+am)\s+asking\s+(?:about\s+)?you)\s*$/i, 'how are you');
  t = t.replace(/^(?:i\s+asked\s+)/i, '');
  return t.trim();
}
// Bot-presence / "still there" chitchat - "what are you doing", "are you there", etc.
// Whole-sentence anchored, so "what are you doing with my payout" or "are you there to fix
// my account" (extra trailing content) are NOT small talk and still fall through untouched.
const PRESENCE_CHITCHAT_RE = /^(?:i\s+said\s+)?what\s+(?:are|r)\s+(?:you|u)\s+(?:doing|up\s+to)$/i;
const STILL_THERE_RE = /^(?:are\s+you\s+(?:still\s+)?there|you\s+(?:still\s+)?there|is\s+(?:anyone|anybody)\s+there|anyone\s+there|hello+\s*,?\s*(?:anyone|anybody)\s+there)$/i;
// Short identity chitchat only ("who are you", "are you a bot") - a real account question
// that happens to mention "bot"/"human" in passing will not match this narrow, anchored set.
const IDENTITY_CHITCHAT_RE = /^(?:who\s+are\s+you|are\s+you\s+(?:a\s+)?(?:bot|human|real|robot|an?\s+ai)|is\s+(?:it|this)\s+(?:a\s+)?(?:bot|ai|robot)|is\s+it\s+(?:a\s+)?bot\s+speaking(?:\s+to\s+me)?|(?:a\s+)?bot\s+speaking(?:\s+to\s+me)?|am\s+i\s+(?:talking|speaking|chatting)\s+(?:to|with)\s+(?:a\s+)?(?:bot|human|real\s+person|ai|robot))$/i;
const SMALLTALK_PHRASE_RE = /^(?:what'?s\s+up|how'?s\s+it\s+going|how\s+is\s+it\s+going|how\s+have\s+you\s+been|how'?s\s+(?:everything|your\s+day)(?:\s+going)?|how\s+is\s+your\s+day(?:\s+going)?|how\s+are\s+things|how\s+do\s+you\s+do|you\s+good|and\s+you)$/i;
// Client calling out the bot's own configured display name/persona only ("Arsal ?", "Arsal",
// "Elite AI?", "Luna?") - Arsal is Luna's live admin-seat display name (see
// statePresend.js botIdentityOpts()). This is a presence/identity check ("is this Arsal? are
// you there?"), not a real information request, so it must not force the generic "checking
// this now" fallback. Anchored to the whole message, so "Arsal, can you check my payout?"
// (extra real content) still falls through untouched.
const BOT_NAME_CHITCHAT_RE = /^(?:arsal|elite\s*ai|luna)$/i;
// "Where is Arsal" / "is Arsal here" while Luna posts as Arsal (215476045948325).
const WHERE_IS_ARSAL_RE = /^(?:where\s+is\s+arsal|where'?s\s+arsal|where\s+arsal(?:\s+is)?|is\s+arsal\s+(?:here|there|around|online|available)|arsal\s+(?:here|there)|are\s+you\s+arsal|is\s+this\s+arsal)$/i;
const ARSAL_AI_WHERE_RE = /\b(?:you\s+(?:the\s+)?arsal(?:\s+ai)?(?:\s+agent)?|arsal\s+ai\s+agent).{0,40}\bwhere\s+is\s+arsal\b|\bwhere\s+is\s+arsal\b.{0,40}\b(?:ai|bot|agent)\b/i;

// Allow extra repeated letters in a greeting ("helllo arsal"), while still
// requiring the entire message to be only a greeting and bot name.
const HELLO_BOT_NAME_RE = /^(?:hi+|hey+|he+l+o+)\s*,?\s*(?:arsal|elite\s*ai|luna)$/i;
// "hello arsal how are you" / "hi luna, how are you doing" — common combo the split
// patterns alone miss (HELLO_BOT_NAME has no how-are-you; HOW_ARE_YOU has no name).
const HELLO_NAME_HOW_ARE_YOU_RE =
  /^(?:hi+|hey+|he+l+o+)\s*,?\s*(?:arsal|elite\s*ai|luna)\s*,?\s+how\s+(?:a[a-z]{0,2}re|r)\s+(?:you|u|ya|yu)(?:\s+(?:doing|going))?$/i;
const HOW_ARE_YOU_NAME_RE =
  /^how\s+(?:a[a-z]{0,2}re|r)\s+(?:you|u|ya|yu)(?:\s+(?:doing|going))?\s*,?\s*(?:arsal|elite\s*ai|luna)$/i;

// Edit distance <= 1 (insert / delete / substitute / transpose). Used only on very short
// words of a whole-message "how are you" greeting, never on free text.
function withinOneEdit(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let diff = [];
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diff.push(i);
    if (diff.length === 1) return true;
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0; let j = 0; let skipped = false;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i += 1; j += 1; continue; }
    if (skipped) return false;
    skipped = true; j += 1;
  }
  return true;
}

// "How arw you ?" (live Bot-test chat 215476019007725) was not recognised: HOW_ARE_YOU_RE
// only tolerates typos that still end in "re". A typo'd greeting must not become a
// MISSED_QUESTION that escalates the client to a teammate. This works on whole, very short
// messages only ("how" + are-ish + you-ish, optionally "doing/going/today"), so a real
// question that merely starts this way ("how are you handling my payout") is untouched.
const HOW_WORDS = new Set(['how', 'hw', 'howw', 'hoow', 'hpw', 'hiw', 'hoe', 'hwo', 'hows']);
const ARE_WORDS = new Set(['are', 'ar', 'r', 're', 'arw', 'aer', 'arre', 'arr', 'ae', 'aare', 'arwe', 'atre', 'arte', 'ere']);
const YOU_WORDS = new Set(['you', 'u', 'yu', 'ya', 'yuo', 'youu', 'yoy', 'yoi']);
function looksLikeHowAreYou(stripped) {
  let base = normalizeSmalltalkPrefix(stripped);
  base = base.replace(/^bro[,\s]+/i, '').trim();
  const w = String(base || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (w.length < 3 || w.length > 5) return false;
  let idx = 0;
  if (!HOW_WORDS.has(w[0]) && w.length >= 4 && HOW_WORDS.has(w[1])) idx = 1;
  if (!HOW_WORDS.has(w[idx])) return false;
  const areW = w[idx + 1] || '';
  const youW = w[idx + 2] || '';
  const tail = w[idx + 3] || '';
  if (tail && !/^(?:doing|going|today|doin)$/.test(tail)) return false;
  if (w.length - idx > 4) return false;
  const how = HOW_WORDS.has(w[idx]);
  const are = ARE_WORDS.has(areW) || (areW.length <= 4 && withinOneEdit(areW, 'are'));
  const you = YOU_WORDS.has(youW) || (youW.length <= 4 && youW !== 'your' && withinOneEdit(youW, 'you'));
  return how && are && you;
}

// Closing thanks / appreciation — not an off-topic ask.
const THANKS_CLOSING_RE = /^\s*(?:ok(?:ay)?|alright|sure)[,.\s!]*(?:thanks?|thank\s*you|thx|ty)\b|^\s*(?:thanks?|thank\s*you|thx|ty|thankyou)\b|^\s*(?:many|much)\s+thanks\b|\b(?:appreciate(?:\s+it)?|grateful|god\s*bless|more\s+power(?:\s+(?:to|for)\s+(?:the\s+)?team)?|keep\s+(?:it\s+)?up|well\s+done)\b/i;

// Short referential follow-ups that point at prior context ("I mean those accounts",
// "those ones", "the ones I mentioned"). NOT presence/smalltalk and NOT contentless —
// keep full thread context and answer or escalate.
function isReferentialFollowUp(s) {
  const t = stripHtml(s).replace(/\u2019/g, "'").trim();
  if (!t) return false;
  if (t.length > 220) return false;
  const stripped = t.replace(/[?!.,\s]+$/g, '').trim();
  if (
    /^(?:i\s+mean\s+)?(?:those|that|them|these)\b/i.test(stripped) ||
    /^(?:only\s+)?(?:these|those|that)(?:\s+ones?)?$/i.test(stripped) ||
    /^(?:is\s+)?(?:that|this)\s+all$/i.test(stripped) ||
    /^(?:anything|what)\s+else(?:\s+\w+){0,4}$/i.test(stripped) ||
    /^(?:are\s+there\s+more|what\s+about\s+the\s+others?|and\s+(?:these|those|the\s+others?)|which\s+ones?|can\s+you\s+explain\s+more|what\s+do\s+you\s+mean|tell\s+me\s+more|explain\s+(?:that|this|more)|then\s+what|why|how)$/i.test(stripped) ||
    /\b(?:i\s+mean\s+(?:those|that|them|these|the)|those\s+(?:accounts?|ones?|challenges?|emails?|numbers?)|the\s+ones?\s+i\s+(?:mentioned|said|sent|meant|mean)|(?:same|that|this)\s+(?:one|account|issue|problem)|as\s+i\s+(?:said|mentioned|told)|referring\s+to(?:\s+(?:those|that|them|the))?|about\s+those(?:\s+\w+){0,3})\b/i.test(stripped)
  ) {
    return true;
  }
  // Soft status continuations on an open breach/IP/account thread (215476045133527):
  // "till yesterday everything was fine" is NOT a fresh vague ask needing clarify.
  if (
    /\b(?:till|until|up\s+to)\s+yesterday\b/i.test(stripped) ||
    /\beverything\s+(?:was|is)\s+fine\b/i.test(stripped) ||
    /\b(?:was|were)\s+fine\s+(?:till|until|before)\b/i.test(stripped) ||
    /\b(?:ip|vpn|proxy|location|device)\b[\s\S]{0,40}\b(?:chang(?:ed|e)|different|new|same)\b/i.test(stripped) ||
    /\b(?:chang(?:ed|e)|different|new)\b[\s\S]{0,40}\b(?:ip|vpn|proxy|location|device)\b/i.test(stripped)
  ) {
    return true;
  }
  return false;
}

/**
 * SOCIAL_SMALLTALK_V1 (2026-09-24, live 215476088947961). Harmless social small talk is decided by
 * STRUCTURE, not by a list of phrases: "What are you doing today ?" was not in the phrase list, fell
 * through to out-of-scope and got "That's not something I can help with" right after Luna had
 * answered "how are you" warmly.
 *
 * Social small talk = a short message that
 *   (a) is a greeting / well-wish / "what's up"-style opener, OR is addressed to the assistant
 *       ("you", "u", "ur", "your", Arsal/Luna) about its state, day or activity (doing, up to, busy,
 *       day, going, been, well, good, weekend ...), or asks how things / the day are going;
 *   (b) carries NO support vocabulary (account, payout, challenge, rule, trade, price, figures ...),
 *       so a real question in friendly wording still goes to the support path;
 *   (c) asks for NO personal-life fact that would have to be invented (family, meals, where you live,
 *       age, relationships ...) - those stay with the personal-question boundary;
 *   (d) is not an identity question (AI / bot / human), which has its own honest-disclosure path.
 */
const SOCIAL_SUPPORT_TERMS_RE = /\b(?:fundedelite|funded|account|acc|payouts?|withdraw\w*|challenges?|phase|step|lite|instant|elite|flash|catalyst|trad(?:e|es|ing|er)|breach\w*|kyc|verif\w*|refunds?|price|pric\w+|cost|fees?|rules?|drawdown|loss|profit|split|leverage|lots?|platform|mt5|tradelocker|login|password|credentials?|reset|dashboard|certificate|affiliate|promo\w*|discount|coupon|upgrade|contract|scalp\w*|spread|commission|swap|instrument|orders?|ea|eas|ip|vpn|risk|consistency|target|size|help\s+me|check|problem|issue|error|pending|approved|rejected|email)\b|\d/i;
const SOCIAL_PERSONAL_LIFE_RE = /\b(?:eat|ate|eating|food|lunch|dinner|breakfast|meal|live|living|from|age|old|born|birthday|married|single|wife|husband|girlfriend|boyfriend|partner|family|kids?|children|son|daughter|father|dad|mother|mom|mum|parents?|brother|sister|religion|salary|paid|hobby|hobbies|movie|watch(?:ing)?|sleep|slept|drink|travel(?:l?ing)?|vacation|holiday|house|home|car|name|real\s+name|look\s+like|photo|picture|date\s+me|love\s+me)\b/i;
const SOCIAL_IDENTITY_RE = /\b(?:ai|a\.i\.|bot|robot|human|real\s+person|machine|chatgpt|gpt)\b/i;
const SOCIAL_OPENER_RE = /^(?:(?:hey|hi|hello|hii+|yo|salam|salaam|assalam\w*)[\s,!]+)?(?:(?:arsal|luna|bro|brother|sir|madam|mate|dear|friend)[\s,!]+)?(?:what'?s\s*up|wh?at+s+up|wat\s*up|sup|wass?up|wazz?up|whats\s+new|what'?s\s+new|what'?s\s+going\s+on|what'?s\s+happening|how'?s\s+(?:it\s+going|everything|life|things|your\s+day|ur\s+day|the\s+day|your\s+week|ur\s+week|your\s+weekend)|how\s+(?:is|are|was)\s+(?:it\s+going|everything|life|things|(?:your|ur|the)\s+(?:day|week|weekend|morning|evening|shift))|how\s+(?:have|hv)\s+(?:you|u)\s+been|hope\s+(?:you|u|your|ur)(?:'re|\s+are|\s+r|\s+day\s+is|\s+day'?s)?\s+(?:doing\s+|going\s+)?(?:well|good|great|fine|ok|okay|alright|awesome|nice)|have\s+a\s+(?:good|nice|great|lovely|blessed)\s+(?:day|one|weekend|evening|night)|(?:are\s+(?:you|u)\s+|r\s+u\s+)?having\s+a\s+(?:good|nice|great|busy|long|productive)\s+(?:day|week|weekend|morning|evening)|good\s+(?:morning|afternoon|evening|night|day)|kya\s+haal(?:\s+(?:hai|hain|he|chaal))?|kia\s+haal|kaise\s+ho|kaisay\s+ho|kese\s+ho|kaisi\s+ho|kaisa\s+hai|kya\s+chal\s+raha(?:\s+hai)?|sab\s+(?:theek|thik|khair)(?:\s+(?:hai|hain))?|come\s+stai|come\s+va|tutto\s+bene)\b/i;
const SOCIAL_ADDRESSEE_RE = /\b(?:you|u|ya|yu|ur|your|yourself|arsal|luna)\b/i;
const SOCIAL_STATE_RE = /\b(?:doing|up\s+to|busy|free|day|today|tonight|morning|afternoon|evening|weekend|week|been|going|keeping|feeling|mood|well|good|fine|great|ok|okay|alright|tired|working|work|shift|holding\s+up|getting\s+on|things)\b/i;
// Short acknowledgement lead-ins ("thanks! how is your day going?") do not change a social question.
const SOCIAL_LEADIN = '(?:(?:hey|hi|hello|hii+|yo|so|and|also|btw|by\\s+the\\s+way|arsal|luna|thanks|thank\\s+you|thx|ty|ok(?:ay)?|cool|great|nice|good|alright|perfect|got\\s+it)[\\s,!.]+)*';
const SOCIAL_QUESTION_SHAPE_RE = /^(?:(?:hey|hi|hello|hii+|yo|so|and|also|btw|by\s+the\s+way|arsal|luna|thanks|thank\s+you|thx|ty|ok(?:ay)?|cool|great|nice|good|alright|perfect|got\s+it)[\s,!.]+)*(?:what|how|are|r|is|have|had|did|do|you|u|ur|hope|having|busy|still|keeping|all)\b/i;

function isSocialSmallTalk(s) {
  const t = stripHtml(s).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  if (!t || t.length > 90) return false;
  const words = t.split(' ').filter(Boolean).length;
  if (words > 12) return false;
  if (SOCIAL_SUPPORT_TERMS_RE.test(t)) return false;
  if (SOCIAL_PERSONAL_LIFE_RE.test(t)) return false;
  if (SOCIAL_IDENTITY_RE.test(t)) return false;
  const core = t.replace(/[?!.,\s]+$/g, '');
  if (SOCIAL_OPENER_RE.test(core) || SOCIAL_OPENER_RE.test(core.replace(new RegExp('^' + SOCIAL_LEADIN, 'i'), ''))) return true;
  return SOCIAL_QUESTION_SHAPE_RE.test(core) && SOCIAL_ADDRESSEE_RE.test(core) && SOCIAL_STATE_RE.test(core);
}

/**
 * SMALLTALK_COURTESY_V1 (2026-09-28, live 215476135544728). ONE source of truth for "is this message
 * pure social courtesy". "Am also fine thanks for asking !" (the client answering Luna's own "How are
 * you?") matched no greeting/how-are-you pattern, fell through to out-of-scope, was read as a question
 * ("am" = "Am I ...?"), failed MISSED_QUESTION and got the canned scope refusal.
 *
 * Decided by STRUCTURE, not by one phrase: the message is split into clauses (punctuation, and/but/&),
 * each clause must be a courtesy clause (greeting, asking how someone is, answering it, thanks /
 * thanks for asking, glad to hear it, reciprocal courtesy / farewell, or a bare ack/name filler), at
 * least one clause must carry social content, and the message must carry NO support intent (support
 * vocabulary, a figure, a request verb, a real wh-question, or a contrast word such as "but"/"still").
 * So "Thanks, but I still need help" and "Thanks, but why was my payout rejected?" are NOT small talk.
 */
const COURTESY_NAME_RE = /(?:^|\s)(?:arsal|luna|elite\s*ai|sir|madam|ma'?am|bro|brother|bhai|bhaiya|dear|friend|mate|buddy|man|team|guys|all|everyone|there|again|once\s+again)$/;
const COURTESY_LEAD_RE = /^(?:ok+(?:ay)?|okey|k|oh|ah|aw+|well|haha+|hehe+|lol|yes|yeah|yep|yup|ya|sure|alright|cool|nice|great|awesome|perfect|wow|hmm+|so|and|also|btw)\s+/;
const COURTESY_FILLER_RE = /^(?:ok+(?:ay)?|okey|k|kk|oh|ah|well|haha+|hehe+|lol|yes|yeah|yep|yup|ya|sure|alright|cool|nice|great|awesome|perfect|noted|got\s+it|wow|hmm+|arsal|luna|sir|madam|bro|brother|bhai|dear|friend|mate|buddy|team|guys|there)$/;
const COURTESY_GREET_RE = /^(?:hi+|hey+|he+l+o+|hlo|hai|hiya|howdy|yo|greetings|salam|salaam|as+ala+m+u?\s*o?\s*alaikum|as+ala+m+u?\s*o?\s*alaikum\s+wa\s+rahmatullah(?:\s+wa\s+barakatuh)?|aoa|good\s+(?:morning|afternoon|evening|day|night)|morning|evening)$/;
const COURTESY_ASK_RE = /^(?:(?:and\s+)?(?:how|what)\s+about\s+(?:you|u|yourself|urself)|(?:and\s+)?(?:you|u|yourself|urself|yours)|hbu|wbu|hru|how\s+(?:are|r|ar)\s+(?:you|u|ya)(?:\s+(?:doing|going|today|doing\s+today))?|how\s+(?:you|u)\s+doing|how\s+(?:have|hv)\s+(?:you|u)\s+been|(?:are\s+)?(?:you|u)\s+(?:ok|okay|good|well|alright|fine)|how'?s\s+(?:it\s+going|life|everything|your\s+day)|how\s+is\s+(?:it\s+going|life|everything|your\s+day)|how\s+do\s+you\s+do)$/;
const COURTESY_STATE = '(?:fine|fyn|fien|fine\\s+fine|good|gud|goo+d|good\\s+good|well|great|grt|ok+|okay|alright|all\\s+right|fantastic|awesome|excellent|not\\s+(?:too\\s+|so\\s+)?bad|happy|better|cool|perfect|amazing|wonderful|nice|blessed|doing\\s+(?:well|good|great|fine|ok|okay|alright|better))';
const COURTESY_TAIL = '(?:\\s+(?:too|also|as\\s+well|now|today|here|thanks?|thanx|thnx|thank\\s+(?:you|u)|thankyou|thx|ty|alhamdulillah|alhamdolillah|alhamdulilah|mashallah|thank\\s+god|by\\s+god\'?s\\s+grace|for\\s+asking|(?:so|very)\\s+much|a\\s+lot|and\\s+(?:you|u)))*';
const COURTESY_WELL_RE = new RegExp('^(?:(?:i\\s*\'?\\s*m|im|i\\s+am|am|me|m|we\\s+are|we\'?re)\\s+)?(?:(?:also|too|as\\s+well|really|very|pretty|quite|so|just|all|doing|feeling|totally|super|absolutely|much|good\\s+and)\\s+)*' + COURTESY_STATE + COURTESY_TAIL + '$');
const COURTESY_WELL_ALONE_RE = /^(?:all\s+good(?:\s+here)?|same\s+here|me\s+too|me\s+also|same|alhamdulillah|alhamdolillah|alhamdulilah|never\s+better|can'?t\s+complain|(?:i'?m|im|i\s+am)\s+(?:good|fine|well)\s+too|good\s+here|fine\s+here)$/;
const COURTESY_THANKS_RE = /^(?:(?:ok(?:ay)?|alright|great|cool|perfect|nice|sure|oh)\s+)?(?:thanks?|thanx|thanz|thnx|thnks|thks|tnx|tx|thankyou|thanku|thank\s*(?:you|u|ya|yu|yo)|thx|ty|tysm|tq|many\s+thanks|much\s+appreciated|appreciated|(?:i\s+)?(?:really\s+)?appreciate(?:\s+(?:it|that|this|you|your\s+(?:help|time|reply|support|kindness)))?|cheers|(?:i'?m\s+|i\s+am\s+)?(?:so\s+|very\s+)?grateful)(?:\s+(?:so|very)\s+much|\s+a\s+lot|\s+alot|\s+a\s+ton|\s+again|\s+(?:a\s+lot\s+)?for\s+(?:asking|that|this|everything|all|(?:all\s+)?(?:the|your)\s+(?:help|time|support|assistance|reply|response|answer|info|information|explanation|patience|kind\s+words|concern)|helping(?:\s+(?:me|out))?|the\s+quick\s+(?:reply|response)|checking\s+in))*$/;
const COURTESY_GLAD_RE = /^(?:(?:i\s*'?\s*m|im|i\s+am|am)\s+)?(?:so\s+|very\s+|really\s+)?(?:glad|happy|good|nice|great|pleased)\s+to\s+(?:hear|know|see)(?:\s+(?:that|it|this))?(?:\s+too)?$|^(?:that'?s|thats|that\s+is|it'?s|its)\s+(?:so\s+|very\s+|really\s+)?(?:good|great|nice|awesome|wonderful|lovely|cool|perfect|fine|amazing)(?:\s+to\s+hear)?$|^(?:good|great|nice|awesome|wonderful|lovely|cool|perfect)\s+to\s+hear(?:\s+(?:that|it))?$/;
const COURTESY_FAREWELL_RE = /^(?:you\s+too|same\s+to\s+you|likewise|no\s+problem|no\s+worries|np|you'?re\s+welcome|ur\s+welcome|welcome|bye+|bye\s+bye|goodbye|good\s+bye|see\s+(?:you|ya|u)(?:\s+(?:later|soon|around))?|take\s+care|god\s+bless(?:\s+you)?|stay\s+(?:safe|blessed)|(?:my\s+)?pleasure|(?:it\s+was\s+|it'?s\s+)?nice\s+(?:to\s+)?(?:meet(?:ing)?|talk(?:ing)?|chat(?:ting)?)(?:\s+(?:to|with))?\s+(?:you|u)|have\s+a\s+(?:good|nice|great|lovely|blessed|wonderful)\s+(?:day|one|weekend|evening|night|time)|(?:i\s+)?hope\s+(?:you|u)(?:'re|\s+are|\s+r)?\s+(?:doing\s+|having\s+a\s+)?(?:well|good|great|fine|ok|okay|good\s+day|great\s+day|nice\s+day)|(?:i\s+)?hope\s+(?:all\s+is|everything\s+is|all'?s)\s+(?:well|good|fine)|keep\s+(?:it\s+)?up|well\s+done|more\s+power(?:\s+(?:to|for)\s+(?:the\s+)?(?:team|you))?|(?:good|great|nice)\s+job)$/;
// Support intent anywhere in the message: a request verb, a real wh-question, a contrast word, or support vocabulary.
const COURTESY_CONTRAST_RE = /\b(?:but|however|though|although|except|still)\b/i;
const COURTESY_REQUEST_RE = /\b(?:need|needs|want|wanna|require|looking\s+for|help\s+(?:me|us)|assist\s+(?:me|us)|can\s+(?:you|u|i|we|someone)|could\s+(?:you|u|i|we|someone)|would\s+(?:you|u)|will\s+(?:you|u)|please|pls|plz|kindly|why|when|where|which|who|what(?!'?s\s*up|\s+about\s+(?:you|u)\b)|how\s+(?:do|does|did|can|could|to|much|many|long|soon|often|come)|is\s+it|is\s+there|are\s+there|do\s+(?:you|i|we)\s+(?!too\b)|does|tell\s+me|let\s+me\s+know|explain|question|asap|urgent)\b/i;

const COURTESY_SUPPORT_TOPIC_RE = /\b(?:account|acc|payouts?|withdraw\w*|challenges?|phase|breach\w*|kyc|refunds?|login|password|credentials?|rules?|drawdown|loss|profit|reset|dashboard|certificate|promo\w*|discount|coupon|upgrade|error|problem|issue|rejected|denied|pending|approved|trad(?:e|es|ing))\b/i;

/** Support intent (request, real question, contrast, or support topic) - a courtesy line that has it is a support turn. */
function hasSupportIntent(s) {
  const t = stripHtml(s).replace(/[’‘]/g, "'").toLowerCase();
  return COURTESY_CONTRAST_RE.test(t) || COURTESY_REQUEST_RE.test(t) || COURTESY_SUPPORT_TOPIC_RE.test(t);
}

/* TURN_INTENT_V1 (2026-09-28, live 215476138819546): a compliment ("You are very good nature man", "you're
 * awesome", "your support is great") is courtesy, not a how-are-you question. It was labelled ask-wellbeing, so the
 * reply got a stray "I'm doing well, thanks for asking!" prefix. Structural: a declarative about the assistant /
 * its help whose words are all positive-sentiment, intensifier or addressee words (sentiment lexicon, no phrases). */
const COMPLIMENT_POSITIVE = new Set(('kind nice good great helpful amazing awesome sweet best polite patient friendly smart ' +
  'brilliant legend star gem wonderful lovely excellent fantastic cool humble respectful professional fast quick genuine honest ' +
  'gentle caring supportive superb perfect outstanding incredible fabulous super top goat pro hero champ angel beautiful clear ' +
  'responsive efficient useful informative knowledgeable intelligent clever understanding decent fine gentleman nicest kindest ' +
  'sweetest greatest cooperative cooperating wise lifesaver saviour savior blessing rockstar').split(/\s+/));
const COMPLIMENT_FILL = new Set(("you you're youre your ur u are r is was were that's thats that this it's its it what such a an " +
  'the very so really too truly extremely quite pretty most always indeed soo sooo super much one of all ever sir bro dear arsal ' +
  'luna man person guy bot assistant helper human agent support service team nature natured work job help kind hearted heart soul ' +
  'bhai brother buddy friend mate for me to with in at and helping talking chatting explaining explanation explanations answers ' +
  'answer replies reply response responses assistance being been honestly seriously').split(/\s+/));
const COMPLIMENT_NEGATION_RE = /\b(?:not|never|no|isn'?t|aren'?t|wasn'?t|weren'?t|don'?t|doesn'?t|didn'?t|hardly|less|least|worst|bad|poor|terrible|useless|rude|slow)\b/;
function isComplimentClause(x) {
  const t = String(x || '').replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 90 || COMPLIMENT_NEGATION_RE.test(t)) return false;
  const words = t.split(' ');
  // Declarative about the assistant or its help, never a question ("is that good?", "are you good?").
  if (!/^(?:you(?:'re|re)?|u|ur|your|that'?s|thats|this|it'?s|its|that|such|what|really|so|very|truly)$/.test(words[0])) return false;
  if (/^(?:that|this|it)$/.test(words[0]) && !/^(?:is|was)$/.test(words[1] || '')) return false;
  let pos = 0;
  for (const w of words) {
    if (COMPLIMENT_POSITIVE.has(w)) { pos += 1; continue; }
    if (!COMPLIMENT_FILL.has(w)) return false;
  }
  return pos > 0;
}

function courtesyKindOf(x) {
  if (!x || COURTESY_FILLER_RE.test(x)) return 'filler';
  const norm = normalizeSmalltalkPrefix(x);
  if (COURTESY_GREET_RE.test(x)) return 'greeting';
  if (COURTESY_ASK_RE.test(x) || COURTESY_ASK_RE.test(norm) || looksLikeHowAreYou(x) || HOW_ARE_YOU_RE.test(x) || HOW_ARE_YOU_RE.test(norm) ||
      SMALLTALK_PARAPHRASE_RE.test(x) || SMALLTALK_PARAPHRASE_RE.test(norm) || SMALLTALK_PHRASE_RE.test(x) || SMALLTALK_PHRASE_RE.test(norm) ||
      HELLO_NAME_HOW_ARE_YOU_RE.test(x) || HOW_ARE_YOU_NAME_RE.test(x)) return 'ask-wellbeing';
  if (isComplimentClause(x)) return 'compliment';
  // Other light social questions ("what are you up to?", "are you busy?") are social, not "how are you".
  if (isSocialSmallTalk(x)) return 'social-question';
  if (COURTESY_WELL_RE.test(x) || COURTESY_WELL_ALONE_RE.test(x)) return 'wellbeing-answer';
  if (COURTESY_THANKS_RE.test(x)) return 'thanks';
  if (COURTESY_GLAD_RE.test(x)) return 'glad';
  if (COURTESY_FAREWELL_RE.test(x)) return 'farewell';
  return null;
}

function courtesyClauseKind(c) {
  // Try the clause as written, then with trailing addressee words ("thanks arsal") and leading
  // interjections ("ok great, thank you") peeled off one at a time.
  let x = String(c || '').trim();
  for (let i = 0; i < 6; i += 1) {
    const k = courtesyKindOf(x);
    if (k) return k;
    const noName = x.replace(COURTESY_NAME_RE, '').trim();
    if (noName !== x) { const k2 = courtesyKindOf(noName); if (k2) return k2; }
    const next = noName.replace(COURTESY_LEAD_RE, '').trim();
    if (next === x) return null;
    x = next;
  }
  return null;
}

/* TURN_INTENT_V1: run-on courtesy without punctuation ("Nice to hear that am also doing well", "hello arsal how
 * are you") - a clause may be split where every piece is itself a courtesy clause. */
function courtesyRunOnKinds(c, depth) {
  const k = courtesyClauseKind(c);
  if (k) return [k];
  if (!depth) return null;
  const words = String(c || '').trim().split(/\s+/);
  if (words.length < 3) return null;
  for (let i = 1; i < words.length; i += 1) {
    const left = courtesyClauseKind(words.slice(0, i).join(' '));
    if (!left) continue;
    const rest = courtesyRunOnKinds(words.slice(i).join(' '), depth - 1);
    if (rest) return [left].concat(rest);
  }
  return null;
}

/**
 * classifySmallTalk(text) -> { pure, components: Set-like array, supportIntent }
 * pure === true only when EVERY clause is social courtesy and nothing asks for support.
 */
function classifySmallTalk(s) {
  const raw = stripHtml(s).replace(/[’‘]/g, "'");
  const out = { pure: false, components: [], supportIntent: false };
  const t = raw.replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!t) return out;
  out.supportIntent = hasSupportIntent(t) || SOCIAL_SUPPORT_TERMS_RE.test(t);
  if (out.supportIntent || t.length > 160 || t.split(' ').length > 28) return out;
  const clauses = t.split(/[,.!?;:\n]+|\s+-\s+|\s+(?:and|&|plus|btw)\s+(?!(?:you|u|yours|yourself)\b)/).map((x) => x.trim()).filter(Boolean);
  if (!clauses.length) return out;
  const comps = [];
  for (const c of clauses) {
    const ks = courtesyRunOnKinds(c, 2);
    if (!ks) return out;
    for (const k of ks) if (k !== 'filler' && !comps.includes(k)) comps.push(k);
  }
  out.components = comps;
  out.pure = comps.length > 0;
  return out;
}

function isCourtesyOnly(s) {
  return classifySmallTalk(s).pure;
}

function isGreetingOrSmallTalk(s) {
  const t = stripHtml(s).replace(/’/g, "'").trim();
  if (!t) return false;
  // SMALLTALK_COURTESY_V1: "that's great" starts like a referential follow-up ("that ...") but is courtesy.
  if (isReferentialFollowUp(t) && !isCourtesyOnly(t)) return false;
  // Thanks / closing lines can be a bit longer ("thank you sir more power for the team").
  if (t.length > 140) return false;
  const stripped = t.replace(/[?!.,\s]+$/g, '').trim();
  if (isSocialSmallTalk(t)) return true;
  // Known smalltalk / presence patterns — allow trailing "?"
  const normalized = normalizeSmalltalkPrefix(stripped);
  if (
    looksLikeHowAreYou(stripped) ||
    looksLikeHowAreYou(normalized) ||
    GREETING_WORD_RE.test(stripped) ||
    HOW_ARE_YOU_RE.test(stripped) ||
    HOW_ARE_YOU_RE.test(normalized) ||
    SMALLTALK_PARAPHRASE_RE.test(stripped) ||
    SMALLTALK_PARAPHRASE_RE.test(normalized) ||
    PRESENCE_CHITCHAT_RE.test(stripped) ||
    STILL_THERE_RE.test(stripped) ||
    IDENTITY_CHITCHAT_RE.test(stripped) ||
    SMALLTALK_PHRASE_RE.test(stripped) ||
    SMALLTALK_PHRASE_RE.test(normalized) ||
    BOT_NAME_CHITCHAT_RE.test(stripped) ||
    HELLO_BOT_NAME_RE.test(stripped) ||
    HELLO_NAME_HOW_ARE_YOU_RE.test(stripped) ||
    HOW_ARE_YOU_NAME_RE.test(stripped) ||
    WHERE_IS_ARSAL_RE.test(stripped) ||
    ARSAL_AI_WHERE_RE.test(t)
  ) {
    return true;
  }
  // SMALLTALK_COURTESY_V1: a thanks/closing line is small talk only when it carries no support intent
  // ("Thanks, but I still need help" / "thanks, why was my payout rejected?" are support turns).
  if (THANKS_CLOSING_RE.test(stripped) && !hasSupportIntent(stripped) &&
      !/\b(?:how|what|when|where|why|can i|could i|please (?:check|help|review|look)|account|payout|login|kyc|breach|withdraw)\b/i.test(stripped)) {
    return true;
  }
  // SMALLTALK_COURTESY_V1: clause-structured courtesy ("Am also fine thanks for asking!", "I'm good, how are you?",
  // "Glad to hear that", "Thanks for asking", "you too, have a nice day").
  if (isCourtesyOnly(t)) return true;
  // Other messages with "?" are real questions, not small talk.
  if (/[?]/.test(t)) return false;
  if (t.length > 80) return false;
  return false;
}


/** Substantial clear client ask — not empty/short ack/greeting — must not get vague clarify. */
function isSubstantialClearQuestion(s) {
  const t = stripHtml(s).trim();
  if (!t) return false;
  if (isReferentialFollowUp(t)) return true;
  if (isShortAck(t)) return false;
  // Avoid calling isGreetingOrSmallTalk for long messages (it early-returns false anyway).
  if (t.length <= 140 && isGreetingOrSmallTalk(t)) return false;
  const toks = tokens(t);
  if (t.length >= 40 && toks.length >= 4) return true;
  if (/[?]/.test(t) && toks.length >= 3) return true;
  if (extractTopics(t).length > 0 && toks.length >= 3) return true;
  if (/\b(?:how\s+(?:do|can|to)|can\s+i|could\s+you|please\s+(?:help|check|activate|purchase)|activat|purchase|buy|pass(?:ed)?)\b/i.test(t) && toks.length >= 3) return true;
  return false;
}

// --- Ask detectors (what the bot is asking the client for) --------------------

const ASK_PATTERNS = {
  account_number: /\b(?:share|send|provide|give|tell|confirm|what(?:'s| is)|could you|can you|may i have|i need|please)\b[^.?!\n]{0,50}\b(?:account|login|trading account|acc)\s*(?:number|no\.?|id|#)/i,
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

function isQuestionSentence(s) {
  const t = s.trim();
  if (!t) return false;
  if (!tokens(t).length) return false;
  if (/\?\s*$/.test(t)) return true;
  // SMALLTALK_COURTESY_V1: only "Am I / am we ..." is a question; "Am fine thanks" / "Am also doing well" are statements.
  return /^(?:can|could|would|will|how|what|when|where|why|which|who|is|are|do|does|did|should|may|am\s+(?:i|we)|please (?:tell|explain|let me know|advise|confirm)|i (?:want|need|would like) to know|let me know|any (?:idea|update)|tell me)\b/i.test(t);
}

// "A and B?" carries two material asks under one question mark. Treating it as one ask let
// a reply answering only the first half score as complete, so the completeness gate never
// fired and half the client's question was silently dropped. Split on a conjunction only
// when BOTH sides still look like a real ask, so ordinary "X and Y" phrasing is untouched.
const COMPOUND_SPLIT_RE = /\s+(?:,\s*)?(?:and|also|plus)\s+(?=(?:what|how|when|where|why|which|who|can|could|do|does|did|is|are|will|would|should|may|am\s+(?:i|we))\b)/i;

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

// PAST_CONTEXT_SCOPE_V1 (2026-09-25, live 215476097191720): "Hey, just wanted to know if multi IP rule includes
// also situations when I'm changing locations inside of my country ? I've had my payout denied in January, so this
// time I want to ask before." The second sentence is a CONCLUDED past event given as the reason for a general rule
// question. Judged as one text it made the whole message an open account case, the correct general answer was held
// and the client only got "share your account number".
// A sentence is concluded past context when it is not a question, reports a past event with an explicit time
// anchor, and has no ongoing marker and no request. It is left out of the account-problem evidence ONLY when the
// message also asks a question and requests nothing anywhere. Open or ongoing problems, questions about the
// account itself and requests to check / review stay account work exactly as before.
const PAST_ANCHOR_RE = /\b(?:in|during|back\s+in|since)\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|20\d\d)\b|\blast\s+(?:week|month|year|time)\b|\b\d+\s+(?:days?|weeks?|months?|years?)\s+ago\b|\b(?:previously|in\s+the\s+past|back\s+then|that\s+time)\b|\b(?:on|with|for)\s+(?:another|an\s+other|a\s+previous|an\s+old|my\s+(?:old|previous|other|last))\s+account\b/i;
const PAST_EVENT_RE = /\b(?:was|were|had|got|'ve\s+had|have\s+had|did|didn'?t|received)\b|\b\w+ed\b/i;
const ONGOING_RE = /\b(?:still|now|currently|pending|yet|today|this\s+(?:week|month|morning)|again|since\s+(?:yesterday|\d+\s+days?)|is\s+(?:being|not|stuck|pending|denied|rejected|blocked|flagged|disabled|breached))\b/i;
const REQUEST_RE = /\b(?:can|could|would|will)\s+(?:you|u|someone|the\s+team|your\s+team)\b|\bplease\b|\bplz\b|\bwhy\b|\b(?:check|review|appeal|reconsider|reopen|refund)\b|\bwhat\s+(?:should|can)\s+i\s+do\b|\bhelp\s+me\b|\bi\s+(?:need|want)\s+(?:you|a\s+review|my)\b/i;
const EMBEDDED_ASK_RE = /\b(?:want(?:ed)?|like|need)\s+to\s+know\b|\bwondering\b|\bnot\s+sure\s+(?:if|whether)\b/i;

function contextSentences(text) {
  // Mobile clients send one <div> per line and some strippers join them without a space ("fundedelite.But").
  return String(text || '').split(/(?<=[.?!])(?:\s+|(?=[A-Z]))|\n+/).map((x) => x.trim()).filter(Boolean);
}

function isConcludedPastContext(sentence) {
  const t = String(sentence || '').trim();
  if (!t || /\?/.test(t) || isQuestionSentence(t) || EMBEDDED_ASK_RE.test(t)) return false;
  return PAST_ANCHOR_RE.test(t) && PAST_EVENT_RE.test(t) && !ONGOING_RE.test(t) && !REQUEST_RE.test(t);
}

/** The text an account-problem detector should judge: `text` without concluded past-context sentences, when the
 *  message asks something and requests nothing. Otherwise `text` unchanged. */
function withoutConcludedPastContext(text) {
  const raw = String(text || '');
  if (!raw.trim() || REQUEST_RE.test(raw)) return raw;
  const parts = contextSentences(raw);
  if (parts.length < 2) return raw;
  const past = parts.filter(isConcludedPastContext);
  if (!past.length) return raw;
  const rest = parts.filter((x) => !past.includes(x));
  if (!rest.some((x) => /\?/.test(x) || isQuestionSentence(x) || EMBEDDED_ASK_RE.test(x))) return raw;
  return rest.join(' ');
}

/** Only the newly written part of an email reply is a customer turn. */
function stripQuotedHistory(text) {
  const lines = stripHtml(text).split('\n');
  const kept = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^>/.test(t) || /^[-_ ]{2,}(?:original|forwarded)\s+message/i.test(t) ||
        /^(?:on\s+.+\s+wrote\s*:|from\s*:|sent\s*:|subject\s*:|el\s+.+\s+escribi[oó]\s*:)/i.test(t)) break;
    kept.push(line);
  }
  return kept.join('\n').trim();
}

// --- Topics -----------------------------------------------------------------

const TOPIC_LEXICON = {
  login: /\b(log ?in|login|sign ?in|password|credential|invalid account|logged out|log out)\b/i,
  account_status: /\b(activat(?:e|ed|ion)|status|pending|awaiting|active now|not active|approved|approval)\b/i,
  payout: /\b(payouts?|withdraw(?:als?)?|profit split|paid|payment received|payment status)\b/i,
  kyc: /\b(kyc|verification|verify (?:my )?identity|id document|passport)\b/i,
  rules: /\b(rule|drawdown|daily loss|max loss|consistency|news trading|weekend|holding|lot size|leverage|risk(?:ing|ed)?|percent(?:age)?)\b/i,
  challenge: /\b(challenge|evaluation|phase ?[12]|funded|instant(?: elite)?|elite|1-?step|2-?step|target|profit target)\b/i,
  reset_retry: /\b(reset|retry|free retry|restart|new attempt)\b/i,
  refund: /\b(refund|chargeback|money back|charged twice|double charge)\b/i,
  promo: /\b(promo(?:tion)?|discount|coupon|voucher|offer|sale|code)\b/i,
  spreads: /\bspreads?\b/i,
  // platforms? — plural must match FAQ asks like "what platforms can i trade on" (F9).
  // mt5/tradelocker/match-trader are product FAQ nouns even without the word "platform".
  platform: /\b(platforms?|terminal|chart|server|trade history|open positions?|positions? disappeared|history missing|mt5|metatrader|tradelocker|match[\s-]?trader)\b/i,
  // Minimum/profitable trading days are published challenge rules, not account work.
  trading_days: /\b(?:min(?:imum)?\s+trading\s+days|trading\s+days\s+requirement|profitable\s+days|min(?:imum)?\s+profitable\s+days)\b/i,
  screenshot: /\b(screenshot|image|picture|attached)\b/i,
  certificate: /\b(certificate|badge)\b/i,
  affiliate: /\b(affiliate|referral|commission)\b/i,
  // WRONG_TOPIC_HOW_MUCH_RISK_FP_V1 (215476215345151): "how much percent can I risk" is rules, not pricing.
  pricing: /\b(?:price|pricing|cost|fee)\b|(?:\bhow much\b(?!\s+(?:percent|percentage|%|risk|can\s+i\s+risk|of\s+(?:my|the)\s+(?:account|daily|loss|risk))))/i,
  scaling: /\b(scal(?:e|ing) plan|scale up|upgrade)\b/i,
};

function extractTopics(text) {
  // Owner rule 2026-09-21: an obvious typo must not hide the topic. "2 stop chollange" has to
  // match the challenge topic exactly as "2 step challenge" does.
  let t = stripHtml(text);
  try { t = require('./typoNormalizer').normalizeText(t); } catch (_) { /* match raw text */ }
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
  withoutConcludedPastContext,
  isConcludedPastContext,
  isSocialSmallTalk,
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
  isWaitingOrStatusAck,
  isGreetingOrSmallTalk,
  classifySmallTalk,
  courtesyClauseKind,
  isComplimentClause,
  isCourtesyOnly,
  hasSupportIntent,
  normalizeSmalltalkPrefix,
  SMALLTALK_PARAPHRASE_RE,
  WHERE_IS_ARSAL_RE,
  ARSAL_AI_WHERE_RE,
  isReferentialFollowUp,
  isSubstantialClearQuestion,
  detectAsks,
  isQuestionSentence,
  extractQuestions,
  stripQuotedHistory,
  splitCompoundQuestion,
  extractTopics,
  containsAny,
  uniq,
  clip,
};
