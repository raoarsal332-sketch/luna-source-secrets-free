'use strict';

const DIRECT_IDENTITY_PATTERNS = [
  /\b(?:are|r)\s+(?:you|u)\s+(?:an?\s+)?(?:ai|bot|robot|human|real\s+(?:human|person))\b/i,
  /\b(?:ai|bot|robot|human|real\s+(?:human|person))\s+(?:or|ya)\s+(?:ai|bot|robot|human|real\s+(?:human|person))\b/i,
  /\b(?:kya\s+)?(?:aap|ap|tum)\s+(?:ai|bot|robot|human|insaan)\s+(?:ho|hain)\b/i,
  /\bsei\s+(?:un(?:a)?\s+)?(?:ai|bot|robot|uman[oa]|persona\s+reale|intelligenza\s+artificiale)\b/i,
  /(?:آپ|تم)\s*(?:اے\s*آئی|AI|بوٹ|انسان)\s*(?:ہیں|ہو)/i,
  // Ticket 215476045133527: "is it bot speaking to me" must never fall through to
  // out-of-scope "different company" (see PERSONAL_QUESTION_PATTERNS fallthrough comment).
  /\bis\s+it\s+(?:a\s+)?(?:ai|bot|robot)\b/i,
  /\b(?:is\s+)?(?:a\s+)?(?:ai|bot|robot)\s+speaking\b/i,
  /\bam\s+i\s+(?:talking|speaking|chatting)\s+(?:to|with)\s+(?:a\s+)?(?:ai|bot|robot|human|real\s+(?:human|person))\b/i,
  /\bis\s+this\s+(?:a\s+)?(?:ai|bot|robot|human|real\s+(?:human|person))\b/i,
  /\b(?:am\s+i\s+)?(?:talking|speaking|chatting)\s+(?:to|with)\s+(?:a\s+)?(?:ai|bot|robot)\b/i,
];

const AI_DISCLOSURE_RE = /\b(?:ai|artificial\s+intelligence|intelligenza\s+artificiale|assistente\s+virtuale)\b|مصنوعی\s+ذہانت|اے\s*آئی/i;
const HUMAN_CLAIM_RE = /\b(?:i\s*(?:am|'m)\s+(?:a\s+)?(?:human|real\s+(?:human|person))|not\s+(?:an?\s+)?(?:ai|bot)|main\s+(?:aik\s+)?insaan\s+hoon|sono\s+uman[oa]|persona\s+reale)\b|میں\s+انسان\s+ہوں/i;
const PERSONAL_ALIAS_RE = /\b(?:it'?s\s+me|this\s+is|i\s*(?:am|'m))[,\s]+arsal\b|\bsono\s+arsal\b|\bmain\s+arsal\s+hoon\b/i;
const SUPPORT_TOPIC_RE = /\b(?:fundedelite|challenge|account|payout|withdraw|kyc|breach|login|password|credential|dashboard|trade|trading|drawdown|profit|loss|balance|platform|mt5|match[\s-]*trader|tradelocker|refund|payment|discount|promo|coupon|verification)\b/i;
// Tolerant spelling of "you": customers mistype it and shorten it.
const YOU = '(?:you|yuo|uou|yoy|yau|u)';

const PERSONAL_QUESTION_PATTERNS = [
  /\b(?:what(?:'s|\s+is)|who\s+is)\s+your\s+(?:mother|mom|mum|father|dad|sister|brother|wife|husband|son|daughter)(?:'s)?\s*name\b/i,
  /\b(?:mother|mom|mum|father|dad)\s*name\b/i,

  // "you" is mistyped constantly ("do uou have a wife ?", live conversation 215476025058340)
  // and shortened to "u". A personal question must still be recognised as personal; otherwise
  // it falls through to the out-of-scope path and gets a "different company" style decline.
  new RegExp('\\b(?:do|did)\\s+' + YOU + '\\s+have\\s+(?:any\\s+|an?\\s+|a\\s+)?(?:wife|husband|girlfriend|boyfriend|partner|father|mother|parent|parents|brother|sister|son|daughter|children|kids|family)\\b', 'i'),
  new RegExp('\\b(?:are|were)\\s+' + YOU + '\\s+(?:married|single|divorced|dating|religious)\\b', 'i'),
  new RegExp('\\bdo\\s+' + YOU + '\\s+have\\s+(?:a\\s+)?son\\b', 'i'),
  /\b(?:what(?:'s|\s+is)|tell\s+me\s+about)\s+your\s+(?:name|real\s+name|age|birthday|family|wife|husband|girlfriend|boyfriend|parents?|children|son|daughter|religion|salary|personal\s+life|favorite\s+\w+)\b/i,
  /\b(?:how\s+old\s+are\s+you|where\s+do\s+you\s+live|where\s+are\s+you\s+from|tell\s+me\s+about\s+yourself|can\s+(?:i|we)\s+date\s+you)\b/i,
  /\b(?:aap|ap|tum)(?:\s+ki|\s+ka|\s+ke)?\s+(?:biwi|shohar|wife|husband|girlfriend|boyfriend|walid|walida|father|mother|family|bachay|beta|beti|umar|mazhab|religion|personal\s+life)\b/i,
  /\b(?:kya\s+)?(?:aap|ap|tum)(?:\s+ki)?\s+shadi(?:\s+hui)?\s+(?:hai|ho|hain)\b/i,
  /\b(?:aap|ap|tum)\s+(?:shadi\s+shuda|married|single)\s+(?:ho|hain)\b/i,
  /\b(?:quanti\s+anni\s+hai|dove\s+vivi|sei\s+sposat[oa]|hai\s+(?:una\s+)?(?:moglie|marito|fidanzat[oa]|famiglia|figli)|parlami\s+di\s+te)\b/i,
  /(?:آپ|تم).*(?:بیوی|شوہر|والد|والدہ|خاندان|بچے|عمر|مذہب|ذاتی\s+زندگی)/i,
];

// Personal declines MUST NOT mention AI/bot. AI disclosure only on direct identity asks.
const PERSONAL_BOUNDARY_VARIANTS = {
  english: [
    "Personal topics aren't something I can discuss here. How can I help with FundedElite?",
    "I can't discuss personal-life questions. If you need help with your FundedElite account or services, I'm here.",
    "I don't discuss personal matters in this chat. Tell me how I can help with FundedElite.",
  ],
  romanUrdu: [
    'Personal cheezein yahan discuss nahi kar sakta. FundedElite se related kisi bhi sawal mein madad kar sakta hoon.',
    'Personal-life topics par baat nahi kar sakta. Agar FundedElite account ya services mein help chahiye ho to batayein.',
    'Yahan personal masail discuss nahi hote. FundedElite se related jo madad chahiye, zaroor likhein.',
  ],
  italian: [
    'Non posso discutere argomenti personali qui. Dimmi come posso aiutarti con FundedElite.',
    'Le questioni di vita personale non rientrano in questa chat. Se ti serve aiuto su FundedElite, sono qui.',
    'Non parlo di temi personali in questa conversazione. Come posso aiutarti con FundedElite?',
  ],
  urdu: [
    'ذاتی موضوعات پر یہاں بات نہیں کر سکتا۔ FundedElite سے متعلق مدد چاہیے تو بتائیں۔',
    'ذاتی معاملات اس چیٹ میں زیر نہیں ہوتے۔ FundedElite اکاؤنٹ یا سروسز میں مدد درکار ہو تو بتائیں۔',
  ],
};

function isDirectIdentityQuestion(text) {
  const value = String(text || '').trim();
  return DIRECT_IDENTITY_PATTERNS.some((pattern) => pattern.test(value));
}

function isAssistantPersonalQuestion(text) {
  const value = String(text || '').trim();
  return PERSONAL_QUESTION_PATTERNS.some((pattern) => pattern.test(value));
}

function detectLanguage(text) {
  const value = String(text || '');
  if (/[\u0600-\u06ff]/.test(value)) return 'urdu';
  if (/\b(?:quanti|anni|dove|vivi|sposat[oa]|moglie|marito|fidanzat[oa]|famiglia|figli|parlami)\b/i.test(value)) return 'italian';
  if (/\b(?:kya|aap|ap|tum|ho|hain|insaan|biwi|shohar|walid|walida|bachay|umar|mazhab|ya)\b/i.test(value)) return 'romanUrdu';
  return 'english';
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function personalBoundaryFor(text, seed = '', priorBotTexts = []) {
  const variants = PERSONAL_BOUNDARY_VARIANTS[detectLanguage(text)];
  const previous = new Set((priorBotTexts || []).slice(-10).map((item) => String(item || '').replace(/\s+/g, ' ').trim().toLowerCase()));
  const unused = variants.filter((item) => !previous.has(item.replace(/\s+/g, ' ').trim().toLowerCase()));
  const choices = unused.length ? unused : variants;
  return choices[hashSeed([seed, text].join('|')) % choices.length];
}

function disclosureFor(text) {
  const value = String(text || '');
  if (/[\u0600-\u06ff]/.test(value)) {
    return 'میں FundedElite کا AI اسسٹنٹ ہوں۔ میں آپ کے سوالات میں مدد کر سکتا ہوں اور ضرورت پڑنے پر سپورٹ ٹیم کو شامل کر سکتا ہوں۔';
  }
  if (/\b(?:sei|umano|umana|persona|intelligenza|artificiale)\b/i.test(value)) {
    return 'Sono un assistente AI di FundedElite. Posso aiutarti con le tue domande e coinvolgere il team di supporto quando serve.';
  }
  if (/\b(?:kya|aap|ap|tum|ho|hain|insaan|ya)\b/i.test(value)) {
    return 'Main FundedElite ka AI assistant hoon. Main aap ke sawalat mein madad kar sakta hoon aur zarurat par support team ko involve kar sakta hoon.';
  }
  return "I'm an AI assistant for FundedElite. I can help with your questions and involve the support team when needed.";
}

function stripPersonalAlias(text) {
  let value = String(text || '').trim();
  value = value
    .replace(/^\s*(?:it'?s\s+me|this\s+is|i\s*(?:am|'m))[,\s]+arsal\s*[,.:!-]*\s*/i, '')
    .replace(/^\s*sono\s+arsal\s*[,.:!-]*\s*/i, '')
    .replace(/^\s*main\s+arsal\s+hoon\s*[,.:!-]*\s*/i, '');
  return value.trim();
}

function stripAiSelfId(text) {
  let value = String(text || '');
  value = value.replace(/\s*I(?:'|’)m an AI(?: support)? assistant[^.!?]*[.!?]/gi, ' ');
  value = value.replace(/\s*I am an AI(?: support)? assistant[^.!?]*[.!?]/gi, ' ');
  value = value.replace(/\s*,?\s*so I(?:'|’)m an AI(?: support)? assistant[^.!?]*[.!?]?/gi, '.');
  value = value.replace(/\s*as an AI(?: support)? assistant[^.!?,]*/gi, '');
  value = value.replace(/\s*Main AI(?: support)? assistant hoon[^.!?]*[.!?]/gi, ' ');
  value = value.replace(/\s*Sono un(?:a)? assistente AI[^.!?]*[.!?]/gi, ' ');
  value = value.replace(/\s*میں ایک AI[^.]*[۔.]/g, ' ');
  value = value.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return value;
}

function stripIdentityOnlyLead(text) {
  let value = String(text || '').trim();
  value = value.replace(/^[^\n]*(?:i(?:'|’)m|i am) an ai[^\n]*\n*/i, '');
  value = value.replace(/^[^\n]*(?:human named|risk desk|sara)[^\n]*\n*/i, '');
  return value.replace(/\n{3,}/g, '\n\n').trim();
}

function isIdentityPlusSupportAsk(text) {
  const value = String(text || '');
  if (!isDirectIdentityQuestion(value)) return false;
  if (SUPPORT_TOPIC_RE.test(value)) return true;
  return /\b(?:also|and)\b[\s\S]{0,100}\b(?:instant|hold(?:ing)?\s+time|addon|add-on|min(?:ute)?s?)\b/i.test(value);
}

const IDENTITY_ASK_SENTENCE_RE =
  /(?:share|send|provide|give|drop|type)\b[\s\S]{0,40}\b(?:account\s*(?:number|#)|registered\s+e-?mail|your\s+e-?mail|e-?mail\s+address)|\baccount\s*(?:number|#)[\s\S]{0,24}\b(?:so i|so the team|before i pass)|\bbefore i pass[\s\S]{0,40}\b(?:account\s*(?:number|#)|registered\s+e-?mail)/i;

function isIdentityAskSentence(sentence) {
  return IDENTITY_ASK_SENTENCE_RE.test(String(sentence || ''));
}

/**
 * General policy / rule-outcome answers must not collect account number or
 * registered email (bench R051). Account-specific review still asks elsewhere.
 */
function stripUnneededIdentityAsk(latestClientText, draft) {
  const value = String(draft || '').trim();
  if (!value) return value;
  const latest = String(latestClientText || '');
  if (/\baccount\s*(?:number|#|id)?\s*[:#]?\s*\d{5,}/i.test(latest)) return value;
  if (/\b(?:my payout|check my account|i was breached|dashboard shows)\b/i.test(latest)) return value;
  const parts = value.split(/(?<=[.!?])\s+/);
  const kept = parts.filter((part) => !isIdentityAskSentence(part));
  if (!kept.length || kept.length === parts.length) return value;
  return kept.join(' ').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}


// Presence / "where is Arsal" while Luna posts as Arsal (ticket 215476045948325).
// Answer as presence (I'm here / Arsal's support assistant) — never third-person
// "Arsal has forwarded…" loops, and never invent "will review account NNN".
const ARSAL_PRESENCE_RE =
  /\b(?:where\s+is\s+arsal|where'?s\s+arsal|where\s+arsal\s+is|is\s+arsal\s+(?:here|there|around|online|available)|arsal\s+(?:here|there)\b|are\s+you\s+arsal|is\s+this\s+arsal|you\s+(?:the\s+)?arsal(?:\s+ai)?(?:\s+agent)?|arsal\s+ai\s+agent)\b/i;
const THIRD_PERSON_ARSAL_FORWARD_RE =
  /\barsal\s+(?:has\s+)?(?:already\s+)?(?:forwarded|passed|sent|escalated)\b|\barsal\s+is\s+the\s+manager\s+who\b/i;
const INVENTED_ACCOUNT_REVIEW_RE =
  /\b(?:they|team|teammate|we)\s+will\s+review\s+account\s+\d{4,}\b|\breview\s+account\s+\d{4,}\s+and\s+update\b/i;

// Bot/identity presence ("is it bot speaking to me") -- answer first-person like Arsal presence.
const BOT_SPEAKING_PRESENCE_RE =
  /\bis\s+it\s+(?:a\s+)?(?:ai|bot|robot)\b|\b(?:a\s+)?(?:ai|bot|robot)\s+speaking(?:\s+to\s+me)?\b|\bam\s+i\s+(?:talking|speaking|chatting)\s+(?:to|with)\s+(?:a\s+)?(?:ai|bot|robot)\b|\bis\s+this\s+(?:a\s+)?(?:ai|bot|robot)\b|\bare\s+(?:you|u)\s+(?:a\s+)?(?:ai|bot|robot)\b/i;

function isBotSpeakingPresenceAsk(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 220) return false;
  // Real support ask that only mentions bot in passing stays untouched.
  if (/\b(?:payout|breach|withdraw|kyc|refund|drawdown|profit\s+target)\b/i.test(t) &&
      !BOT_SPEAKING_PRESENCE_RE.test(t)) {
    return false;
  }
  return BOT_SPEAKING_PRESENCE_RE.test(t);
}

function isArsalPresenceAsk(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 220) return false;
  // Pure presence / identity-of-Arsal — not "talk to Arsal about my payout"
  if (/\b(?:talk|speak|connect|transfer|handoff|hand\s*off|assign)\b/i.test(t) &&
      /\b(?:payout|breach|account|withdraw|kyc|refund)\b/i.test(t)) {
    return false;
  }
  if (ARSAL_PRESENCE_RE.test(t)) return true;
  // Same first-person presence answer for bot/identity asks (215476045133527).
  return isBotSpeakingPresenceAsk(t);
}

function presenceReplyFor(text) {
  const t = String(text || '');
  // If they also ask AI/bot identity, disclose briefly in first person.
  if (/\b(?:ai|bot|agent|robot)\b/i.test(t) || isDirectIdentityQuestion(t)) {
    return "I'm here — I'm Arsal's AI support assistant handling this chat. How can I help with your FundedElite account?";
  }
  return "I'm here. I'm Arsal's support assistant handling this chat. How can I help with your FundedElite account?";
}

function scrubThirdPersonArsalHandoff(draft) {
  let value = String(draft || '').trim();
  if (!value) return value;
  // Drop third-person Arsal-forward sentences
  const parts = value.split(/(?<=[.!?])\s+/);
  const kept = parts.filter((p) => !THIRD_PERSON_ARSAL_FORWARD_RE.test(p));
  value = (kept.length ? kept : parts).join(' ').trim();
  value = value.replace(INVENTED_ACCOUNT_REVIEW_RE, '').replace(/\s{2,}/g, ' ').trim();
  return value;
}

function enforceAssistantIdentityReply(latestClientText, draft, conversationId = '', priorBotTexts = []) {
  const value = String(draft || '').trim();
  if (isArsalPresenceAsk(latestClientText)) {
    const scrubbed = scrubThirdPersonArsalHandoff(value);
    const stillBad =
      !scrubbed ||
      THIRD_PERSON_ARSAL_FORWARD_RE.test(scrubbed) ||
      INVENTED_ACCOUNT_REVIEW_RE.test(scrubbed) ||
      /\barsal\s+has\b/i.test(scrubbed) ||
      PERSONAL_ALIAS_RE.test(scrubbed);
    if (stillBad) return presenceReplyFor(latestClientText);
    if (/\b(?:i(?:'|’)m|i am)\s+here\b/i.test(scrubbed)) return scrubbed;
    return presenceReplyFor(latestClientText);
  }
  if (isDirectIdentityQuestion(latestClientText)) {
    const badIdentity =
      HUMAN_CLAIM_RE.test(value) ||
      PERSONAL_ALIAS_RE.test(value) ||
      !AI_DISCLOSURE_RE.test(value) ||
      /personal/i.test(value);
    if (!badIdentity) return value;
    const disclosure = disclosureFor(latestClientText);
    // Bench R127: identity + Instant hold-time. Replacing the whole draft with the
    // canned disclosure dropped the FAQ half. Keep any non-identity support remainder.
    if (isIdentityPlusSupportAsk(latestClientText)) {
      const rest = stripIdentityOnlyLead(value);
      if (
        rest &&
        rest.length >= 12 &&
        rest !== value &&
        !HUMAN_CLAIM_RE.test(rest) &&
        !PERSONAL_ALIAS_RE.test(rest)
      ) {
        return disclosure + '\n\n' + rest;
      }
    }
    return disclosure;
  }
  if (isAssistantPersonalQuestion(latestClientText) && !SUPPORT_TOPIC_RE.test(String(latestClientText || ''))) {
    const cleaned = stripAiSelfId(value);
    if (!cleaned || AI_DISCLOSURE_RE.test(cleaned)) {
      return personalBoundaryFor(latestClientText, conversationId, priorBotTexts);
    }
    return cleaned;
  }
  return stripPersonalAlias(value);
}

module.exports = {
  isDirectIdentityQuestion,
  isAssistantPersonalQuestion,
  disclosureFor,
  personalBoundaryFor,
  stripPersonalAlias,
  stripAiSelfId,
  stripUnneededIdentityAsk,
  isIdentityAskSentence,
  enforceAssistantIdentityReply,
  isArsalPresenceAsk,
  isBotSpeakingPresenceAsk,
  presenceReplyFor,
  scrubThirdPersonArsalHandoff,
  ARSAL_PRESENCE_RE,
  BOT_SPEAKING_PRESENCE_RE,
  THIRD_PERSON_ARSAL_FORWARD_RE,
  INVENTED_ACCOUNT_REVIEW_RE,
};
