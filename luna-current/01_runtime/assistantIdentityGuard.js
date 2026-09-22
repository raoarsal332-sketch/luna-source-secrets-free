'use strict';

const DIRECT_IDENTITY_PATTERNS = [
  /\b(?:are|r)\s+(?:you|u)\s+(?:an?\s+)?(?:ai|bot|robot|human|real\s+(?:human|person))\b/i,
  /\b(?:ai|bot|robot|human|real\s+(?:human|person))\s+(?:or|ya)\s+(?:ai|bot|robot|human|real\s+(?:human|person))\b/i,
  /\b(?:kya\s+)?(?:aap|ap|tum)\s+(?:ai|bot|robot|human|insaan)\s+(?:ho|hain)\b/i,
  /\bsei\s+(?:un(?:a)?\s+)?(?:ai|bot|robot|uman[oa]|persona\s+reale|intelligenza\s+artificiale)\b/i,
  /(?:آپ|تم)\s*(?:اے\s*آئی|AI|بوٹ|انسان)\s*(?:ہیں|ہو)/i,
];

const AI_DISCLOSURE_RE = /\b(?:ai|artificial\s+intelligence|intelligenza\s+artificiale|assistente\s+virtuale)\b|مصنوعی\s+ذہانت|اے\s*آئی/i;
const HUMAN_CLAIM_RE = /\b(?:i\s*(?:am|'m)\s+(?:a\s+)?(?:human|real\s+(?:human|person))|not\s+(?:an?\s+)?(?:ai|bot)|main\s+(?:aik\s+)?insaan\s+hoon|sono\s+uman[oa]|persona\s+reale)\b|میں\s+انسان\s+ہوں/i;
const PERSONAL_ALIAS_RE = /\b(?:it'?s\s+me|this\s+is|i\s*(?:am|'m))[,\s]+arsal\b|\bsono\s+arsal\b|\bmain\s+arsal\s+hoon\b/i;
const SUPPORT_TOPIC_RE = /\b(?:fundedelite|challenge|account|payout|withdraw|kyc|breach|login|password|credential|dashboard|trade|trading|drawdown|profit|loss|balance|platform|mt5|match[\s-]*trader|tradelocker|refund|payment|discount|promo|coupon|verification)\b/i;
const PERSONAL_QUESTION_PATTERNS = [
  /\b(?:what(?:'s|\s+is)|who\s+is)\s+your\s+(?:mother|mom|mum|father|dad|sister|brother|wife|husband|son|daughter)(?:'s)?\s*name\b/i,
  /\b(?:mother|mom|mum|father|dad)\s*name\b/i,

  /\b(?:do|did)\s+you\s+have\s+(?:any\s+|an?\s+|a\s+)?(?:wife|husband|girlfriend|boyfriend|partner|father|mother|parent|parents|brother|sister|son|daughter|children|kids|family)\b/i,
  /\b(?:are|were)\s+you\s+(?:married|single|divorced|dating|religious)\b/i,
  /\bdo\s+you\s+have\s+(?:a\s+)?son\b/i,
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

function enforceAssistantIdentityReply(latestClientText, draft, conversationId = '', priorBotTexts = []) {
  const value = String(draft || '').trim();
  if (isDirectIdentityQuestion(latestClientText)) {
    if (
      HUMAN_CLAIM_RE.test(value) ||
      PERSONAL_ALIAS_RE.test(value) ||
      !AI_DISCLOSURE_RE.test(value) ||
      /personal/i.test(value)
    ) {
      return disclosureFor(latestClientText);
    }
    return value;
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
  enforceAssistantIdentityReply,
};
