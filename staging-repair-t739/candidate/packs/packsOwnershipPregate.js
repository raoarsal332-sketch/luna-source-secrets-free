'use strict';
/**
 * Elite Packs — clause-level ownership / account-state gate (t739, replaces the
 * t728 cue-gated deny-by-default gate).
 *
 * Root cause of the t728 FAIL (44 ownership -> product leaks): decideInner was
 * cue-gated. "Personal intent not recognized, therefore general" was the
 * default, and a general-structure allow-list could override a detected stance.
 *
 * This module inverts that. A message may reach a product selector only if
 * EVERY clause is POSITIVELY interpreted as a general rule question:
 *
 *   proposition  - a rule-type frame (definition, procedure, policy, price,
 *                  rate, count, condition) must be recognised, anchored at
 *                  the start of the clause;
 *   subject      - generic trader / rule / item, never "this customer"
 *                  (first person, definite third person, account deixis, a
 *                  dropped subject, or an unresolved anaphor);
 *   fact         - a rule value, never an account-state value (owned,
 *                  received, unlocked, balance, status, qualifies-for-me);
 *   context      - dropped subjects / anaphora are resolved from the previous
 *                  customer turn; personal context never resolves to general;
 *   uncertainty  - hedges, obfuscation, unresolved referents, non-English or
 *                  unparseable input never resolve to general.
 *
 * Anything not positively general is blocked: PERSONAL (account state asked),
 * MIXED (general + personal), AMBIGUOUS (unresolved / uncertain). Possession or
 * eligibility vocabulary alone never establishes PERSONAL and is not needed to
 * block; the absence of a positive general reading is itself the block.
 *
 * No allow-list can override a non-general stance: the verdict of a message is
 * computed from clause verdicts only (see assemble()).
 */

const KIND = Object.freeze({
  PERSONAL: 'personal-account-status',
  REFUND: 'refund',
  MISSING: 'missing-item',
  AMBIGUOUS: 'ambiguous-account-status',
  MIXED: 'mixed-general-and-personal',
  NOT_PERSONAL: 'not-personal',
});

const VERDICT = Object.freeze({
  GENERAL: 'general',
  PERSONAL: 'personal',
  AMBIGUOUS: 'ambiguous',
  REFUND: 'refund',
  MISSING: 'missing',
  NEUTRAL: 'neutral',
});

const MAX_INPUT_CHARS = 1500;
const MAX_CLAUSES = 10;
const MAX_PRIOR_TURNS = 4;

const NAMED_CARD_RE =
  /\b(?:instant\s*override|lifetime\s*split|open\s*season|founder'?s?\s*key|the\s*million|primordial)\b/i;

const PACKS_ITEM_RE =
  /\b(?:pack|card|credits?|exotic|million|inventory|collection|subscription|ownership|instant\s*override|lifetime\s*split|founder'?s?\s*key|open\s*season|primordial|whale|oracle|ignition|cartas?|cr[eé]ditos?|paquete|pacote)\b|اووررائیڈ|کریڈٹ|پیک|کارڈ|कार्ड|क्रेडिट|पैक/i;

/* ------------------------------------------------------------------ */
/* 1. Input normalisation (Unicode / ZWSP / homoglyph / leet / spacing) */
/* ------------------------------------------------------------------ */

const INVIS =
  '\\u00ad\\u034f\\u061c\\u115f\\u1160\\u17b4\\u17b5\\u180b-\\u180f\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u206f\\u3164\\ufe00-\\ufe0f\\ufeff\\uffa0\\u2800';
const INTRA_INVIS_RE = new RegExp(`[\\p{L}\\p{N}](?:[${INVIS}]|\\p{Cf})+[\\p{L}\\p{N}]`, 'u');
const STRIP_INVIS_RE = new RegExp(`[${INVIS}]|\\p{Cf}`, 'gu');

const CONFUSABLES = (() => {
  const pairs = {
    // Cyrillic
    'а': 'a', 'в': 'b', 'е': 'e', 'ё': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c',
    'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ї': 'i', 'ј': 'j', 'ѕ': 's', 'һ': 'h', 'ԁ': 'd', 'ԛ': 'q',
    'ԝ': 'w', 'ӏ': 'l', 'Ӏ': 'i', 'ɡ': 'g', 'ӕ': 'ae',
    'А': 'a', 'В': 'b', 'Е': 'e', 'К': 'k', 'М': 'm', 'Н': 'h', 'О': 'o', 'Р': 'p', 'С': 'c', 'Т': 't',
    'Х': 'x', 'І': 'i', 'Ј': 'j', 'Ѕ': 's', 'У': 'y', 'Ү': 'y',
    // Greek
    'Α': 'a', 'Β': 'b', 'Ε': 'e', 'Ζ': 'z', 'Η': 'h', 'Ι': 'i', 'Κ': 'k', 'Μ': 'm', 'Ν': 'n', 'Ο': 'o',
    'Ρ': 'p', 'Τ': 't', 'Υ': 'y', 'Χ': 'x', 'ο': 'o', 'ν': 'v', 'ι': 'i', 'ρ': 'p', 'υ': 'u', 'κ': 'k',
    'χ': 'x', 'ϲ': 'c', 'α': 'a', 'τ': 't', 'ω': 'w', 'ϳ': 'j',
    // Latin-extended / IPA lookalikes
    'ı': 'i', 'ɪ': 'i', 'ɩ': 'i', 'ǀ': 'l', 'ℓ': 'l', 'ᴏ': 'o', 'ᴡ': 'w', 'ᴍ': 'm', 'ɴ': 'n', 'ᴠ': 'v',
    'ʏ': 'y', 'ᴛ': 't', 'ᴇ': 'e', 'ᴀ': 'a', 'ʀ': 'r', 'ꜱ': 's', 'ᴅ': 'd', 'ᴋ': 'k', 'ʜ': 'h', 'ᴘ': 'p',
    'ᴄ': 'c', 'ɢ': 'g', 'ʟ': 'l', 'ᴜ': 'u', 'ᴊ': 'j', 'ʙ': 'b', 'ᴢ': 'z',
  };
  return new Map(Object.entries(pairs));
})();

const LEET_MAP = Object.freeze({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' });
const LEET_LEXICON = new Set([
  'own', 'owns', 'owned', 'have', 'has', 'got', 'get', 'receive', 'received', 'unlock', 'unlocked',
  'instant', 'override', 'lifetime', 'split', 'open', 'season', 'founder', 'founders', 'key', 'card',
  'cards', 'pack', 'packs', 'credit', 'credits', 'account', 'balance', 'status', 'eligible', 'qualify',
  'inventory', 'mine', 'my', 'me', 'check', 'confirm', 'million', 'exotic', 'granted', 'pulled',
  'showing', 'applied', 'added', 'active', 'live', 'qualified', 'i', 'we', 'our',
]);

const CONTRACTION_WORDS = Object.freeze({
  dont: 'do not', doesnt: 'does not', didnt: 'did not', isnt: 'is not', arent: 'are not', wasnt: 'was not',
  werent: 'were not', havent: 'have not', hasnt: 'has not', hadnt: 'had not', wouldnt: 'would not',
  couldnt: 'could not', shouldnt: 'should not', wont: 'will not', cant: 'cannot', im: 'i am', ive: 'i have',
  u: 'you', ur: 'your', pls: 'please', plz: 'please', thx: 'thanks', abt: 'about', whats: 'what is',
  hows: 'how is', wheres: 'where is', whos: 'who is',
});

function foldConfusables(text) {
  const letterCount = (text.match(/[a-z]/gi) || []).length;
  let folded = false;
  const tokens = text.split(/([^\p{L}\p{N}]+)/u);
  const out = tokens.map((tok) => {
    if (!tok) return tok;
    const chars = Array.from(tok);
    const hasLatin = chars.some((c) => /[a-z]/i.test(c));
    const nonAscii = chars.filter((c) => c.charCodeAt(0) > 0x7f);
    if (!nonAscii.length) return tok;
    const allMappable = nonAscii.every((c) => CONFUSABLES.has(c));
    if (!allMappable) return tok;
    const fullyLookalike = chars.every((c) => CONFUSABLES.has(c) || /[a-z0-9]/i.test(c));
    if (hasLatin || (fullyLookalike && letterCount >= 3)) {
      folded = true;
      return chars.map((c) => (CONFUSABLES.has(c) ? CONFUSABLES.get(c) : c)).join('');
    }
    return tok;
  });
  return { text: out.join(''), folded };
}

function normalizeInput(raw) {
  const original = String(raw == null ? '' : raw);
  let obfuscated = false;
  let s = original;

  if (INTRA_INVIS_RE.test(s)) obfuscated = true;
  s = s.replace(/[\r\n]+/g, ' . ');
  s = s.replace(STRIP_INVIS_RE, '');
  s = s.normalize('NFKC');
  s = s.replace(/\p{Cc}/gu, ' ').replace(/[\p{Zs}\t]+/gu, ' ');
  s = s.replace(/[’‘`´ʼʻ]/g, "'").replace(/[“”„‟«»]/g, '"').replace(/[‐‑‒–—―−]/g, '-');

  const fold = foldConfusables(s);
  if (fold.folded) obfuscated = true;
  s = fold.text.toLowerCase();

  // leet / symbol substitution only when the result is a known lexicon word
  s = s
    .split(/(\s+)/)
    .map((tok) => {
      if (!/[a-z]/.test(tok) || !/[0-9@$!]/.test(tok)) return tok;
      const m = tok.match(/^([^a-z0-9@$!]*)([a-z0-9@$!']+)([^a-z0-9@$!']*)$/);
      if (!m) return tok;
      if (!/[a-z]/.test(m[2]) || !/[0-9@$!]/.test(m[2])) return tok;
      const mapped = m[2].replace(/[0-9@$!]/g, (c) => LEET_MAP[c] || c);
      if (LEET_LEXICON.has(mapped)) {
        obfuscated = true;
        return m[1] + mapped + m[3];
      }
      return tok;
    })
    .join('');

  // spaced / punctuated single-letter runs: "o w n", "i.n.s.t.a.n.t", "o-w-n"
  const joined = s.replace(/(?<![a-z0-9'])(?:[a-z][ .\-_*·]){2,}[a-z](?![a-z0-9'])/g, (m) => m.replace(/[ .\-_*·]/g, ''));
  if (joined !== s) obfuscated = true;
  s = joined;

  // single "1" / "l" standing in for the pronoun "I"
  s = s.replace(/\b(do|did|does|can|could|will|would|should|have|has|am|may|shall)\s+(?:1|l)\s+(?=[a-z])/g, '$1 i ');
  s = s.replace(/(?:^|(?<=[.,;:?!"(]\s))(?:1|l)\s+(?=(?:own|have|got|get|qualify|receive|received|unlock|unlocked|pulled|bought|opened|am)\b)/g, 'i ');

  // contractions
  s = s.replace(/\blet's\b/g, 'let us');
  s = s.replace(/\bcan't\b/g, 'cannot').replace(/\bwon't\b/g, 'will not').replace(/\bshan't\b/g, 'shall not');
  s = s.replace(/n't\b/g, ' not');
  s = s.replace(/\b(i|we|you|they|he|she|it|that|there|what|who|how|where|when|why)'m\b/g, '$1 am');
  s = s.replace(/\b(i|we|you|they|he|she|it|that|there|what|who|how|where|when|why)'re\b/g, '$1 are');
  s = s.replace(/\b(i|we|you|they|he|she|it|that|there|what|who|how|where|when|why)'ve\b/g, '$1 have');
  s = s.replace(/\b(i|we|you|they|he|she|it|that|there|what|who|how|where|when|why)'ll\b/g, '$1 will');
  s = s.replace(/\b(i|we|you|they|he|she|it|that|there|what|who|how|where|when|why)'d\b/g, '$1 would');
  s = s.replace(/\b(it|that|there|what|who|how|where|when|why|he|she)'s\b/g, '$1 is');
  s = s.replace(/\b[a-z]+\b/g, (w) => (Object.prototype.hasOwnProperty.call(CONTRACTION_WORDS, w) ? CONTRACTION_WORDS[w] : w));

  s = s.replace(/\s+/g, ' ').trim();
  return { text: s, original, obfuscated };
}

/* ------------------------------------------------------------------ */
/* 2. Language evidence (defence in depth; the shared gate decides)    */
/* ------------------------------------------------------------------ */

const ROMAN_URDU_HINDI = new Set([
  'hai', 'hain', 'hoon', 'hogaya', 'hua', 'hui', 'hue', 'huwa', 'kya', 'kia', 'nahi', 'nahin', 'nhi',
  'mera', 'meri', 'mere', 'meray', 'mujhe', 'mujh', 'mujhko', 'apka', 'aapka', 'aapki', 'aap', 'kaise',
  'kese', 'kaisay', 'karo', 'kro', 'krdo', 'kardo', 'karna', 'karein', 'batao', 'btao', 'bataye',
  'bataiye', 'batain', 'liya', 'liye', 'diya', 'diye', 'gaya', 'gayi', 'gaye', 'aaya', 'aya', 'aayi',
  'chuka', 'chuki', 'milta', 'milti', 'milte', 'mila', 'mili', 'milega', 'milegi', 'kitna', 'kitne',
  'kitni', 'bhai', 'bhaiya', 'yaar', 'yar', 'kyun', 'kyu', 'kyon', 'abhi', 'wala', 'wali', 'wale',
  'mein', 'maine', 'sakta', 'sakti', 'sakte', 'hoga', 'hogi', 'honge', 'raha', 'rahi', 'rahe', 'rha',
  'rhi', 'apna', 'apni', 'apne', 'paas', 'chahiye', 'chahye', 'shukriya', 'theek', 'thik', 'acha',
  'accha', 'bilkul', 'zaroor', 'lekin', 'magar', 'aur', 'toh', 'tou', 'bhi', 'kahan', 'kahaan', 'kab',
  'kaun', 'kyunke', 'isliye', 'jaldi', 'dikhao', 'dikha', 'dekho', 'dekh', 'samajh', 'samjha',
  'samjhao', 'wapas', 'lagta', 'lagao', 'karta', 'karti', 'karte', 'rakha', 'bohat', 'bahut', 'bohot',
  'zyada', 'haan', 'matlab', 'humein', 'hamen', 'tumhe', 'tumhara', 'woh', 'iska', 'uska', 'isme',
  'usme', 'inka', 'unka', 'yeh', 'kaam', 'wahan', 'yahan', 'sab', 'kuch', 'koi', 'ghar', 'paisa',
  'paise', 'khareed', 'kharid', 'kharidna', 'kharidu', 'milti', 'hona', 'hota', 'hoti', 'hote',
]);

const OTHER_LANG_MARKERS = new Set([
  // Spanish / Portuguese
  'que', 'cómo', 'como', 'cuál', 'cuenta', 'cuántos', 'cuantos', 'tengo', 'tienes', 'tiene', 'quiero',
  'puedo', 'necesito', 'gracias', 'hola', 'una', 'los', 'las', 'del', 'por', 'para', 'mis', 'está',
  'estoy', 'tenho', 'minha', 'meu', 'você', 'voce', 'conta', 'não', 'nao', 'obrigado', 'olá', 'ola',
  'pacote', 'cartas', 'carta', 'créditos', 'creditos', 'paquete', 'meus', 'minhas', 'ainda', 'quantos',
  // French / German
  'je', 'mon', 'compte', 'merci', 'bonjour', 'ich', 'mir', 'mich', 'meine', 'meinen', 'konto', 'haben',
  'ist', 'nicht', 'danke', 'hallo', 'wie', 'und', 'oder', 'bitte', 'karten', 'carte', 'cartes',
  // Arabizi
  'ana', 'habibi', 'shukran', 'inshallah', 'wallah', 'yalla', 'kam', 'ya3ni',
]);

function languageEvidence(normText) {
  const t = String(normText || '');
  const reasons = [];
  for (const ch of t) {
    if (/\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch)) {
      reasons.push('non-latin-script');
      break;
    }
  }
  if (/[\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u024f]/.test(t)) reasons.push('accented-latin');
  const words = t.split(/[^a-z\u00c0-\u024f0-9']+/).filter(Boolean);
  let ru = 0;
  let other = 0;
  for (const w of words) {
    if (ROMAN_URDU_HINDI.has(w)) ru += 1;
    if (OTHER_LANG_MARKERS.has(w)) other += 1;
  }
  if (ru) reasons.push('roman-urdu-hindi');
  if (other) reasons.push('romance-germanic-marker');
  return Object.freeze({ nonEnglish: reasons.length > 0, reasons: Object.freeze(reasons) });
}

/* ------------------------------------------------------------------ */
/* 3. Lexicons                                                          */
/* ------------------------------------------------------------------ */

const ITEM_RE =
  /\b(?:packs?|cards?|credits?|exotics?|million|primordial|inventory|collection|subscriptions?|plans?|bundles?|discounts?|offers?|keys?|instant\s*override|lifetime\s*split|open\s*season|founder'?s?\s*key|whale|oracle|ignition|breakout|market\s*maker|pack\s*pass|lucky\s*streak|streak|meter|floors?|rarity|rarities|odds|rates?|chain|upgrades?|seal|reveal|elite|atom|tabs?|multipliers?|uses|labels?|pass|crypto|payouts?|refunds?|dashboard|checkout|bonus)\b/;

const FIRST_PERSON_RE =
  /\b(?:i|me|my|mine|myself|we|our|ours|ourselves|us)\b/;

const DEF_THIRD_RE = new RegExp(
  [
    '\\b(?:this|that|these|those|said|your)\\s+(?:\\w+\\s+)?(?:user|customer|client|trader|account\\s*holder|account\\s*owner|holder|owner|buyer|player|member|person|guy|account|login|profile|ticket|conversation|chat|order|purchase|payment|transaction)\\b',
    '\\b(?:the|same)\\s+(?:\\w+\\s+)?(?:user|customer|client|trader|account\\s*holder|account\\s*owner|holder|owner|buyer|player|member|person|guy|account|login|profile|ticket)\\b',
    '\\b(?:a|an|my|your|his|her|our)\\s+(?:friend|brother|sister|colleague|partner|wife|husband|cousin|father|mother|dad|mom|boss|teammate|manager|student|coworker|buddy|mate|relative|family\\s+member)\\b',
    '\\b(?:he|she|him|his|hers|herself|himself)\\b',
    '\\bher\\b(?!\\s+own\\b)',
  ].join('|')
);

const THEY_RE = /\b(?:they|them|their|theirs|themselves)\b/;
const GENERIC_PERSON_RE =
  /\b(?:traders|users|customers|members|players|clients|people|everyone|everybody|anyone|anybody|accounts|an?\s+(?:new\s+)?(?:trader|user|customer|member|player|client|account|\d+\s*k\s+account)|any\s+(?:trader|user|customer|member|account)|each\s+(?:trader|account|user)|every\s+(?:trader|account|user)|per\s+trader|all\s+(?:traders|accounts)|\d+\s*k\s+accounts?)\b/;

const ANAPHORA_RE = new RegExp(
  '\\b(?:it|its|this|that|these|those|them|the\\s+same|the\\s+other|the\\s+first|the\\s+second|the\\s+last)\\b|(?<!\\b(?:than|every|each|any|no|at|per|the|a|an|whale|oracle|ignition|breakout|maker|pack|card|exotic|purple|pink|blue|special|free|monthly|upgrade|higher|bigger|smaller|next|other)\\s)\\bones?\\b(?!\\s+(?:per|of|use|uses|time|day|week|month|year|account|accounts|card|cards|pack|packs|credit|click|step|exotic|trader|key|by|more|at))'
);
const COLOR_CARD_RE = /\b(?:this|that|these|those|the)\s+(?:\w+\s+)?(?:purple|pink|blue|green|red|gold|golden|silver|orange|yellow|black|white)\s+cards?\b/;

const MODAL_RE = /\b(?:can|could|may|might|must|should|shall|will|would|cannot)\b/;

const POSSESSION_VERB_RE = /\b(?:own|owns|owned|owning|ownership|have|has|had|having|hold|holds|holding|possess|possesses|possessed|keep|keeps|kept)\b/g;

const PARTICIPLES_STATE_RE =
  /\b(?:received|got|gotten|granted|credited|awarded|delivered|issued|assigned|unlocked|locked|pulled|landed|dropped|obtained|earned|claimed|won|bought|purchased|owned|held|given|activated|enabled|disabled|appeared|showed|shown|showing|appearing|visible|live|active|available|reflected|updated|approved|processed|confirmed|completed|sent|arrived|arriving|posted|been|ready|pending|expired|expiring|charged|deducted|billed|renewed|refunded|cancelled|canceled|converted|stacked|combined|redeemed|used|applied|added|opened|closed|came|went|saw|seen|took|taken|found|lost|paid|spent|made|chose|chosen|clicked|pressed|tried)\b/;

const STATE_NOUN_RE =
  /\b(?:status|balance|balances|remaining|remains|left|leftover|progress|standing|history|inventory\s+status|account\s+status)\b/;

const PAST_EVENT_RE = /\b(?:did|was|were)\b/;
const CONTAINER_CONTENTS_RE =
  /\b(?:cards?|packs?|credits?|keys?|exotics?|items?)\s+(?:are|is)\s+(?:there\s+)?(?:in|inside|under|on)\s+(?:the\s+|an?\s+)?(?:inventory|collection|account|my\s*packs|credits?\s*tab|dashboard)\b|\b(?:what|which)\s+is\s+in\s+(?:the\s+)?(?:inventory|collection|account)\b/;
const CONTAINER_EXEMPT_RE = /\b(?:exist|in\s+total|to\s+collect|total)\b/;
const BOT_LOOKUP_RE =
  /\b(?:luna|you|system|support|team|agent|backend|staff)\s+(?:also\s+)?(?:can\s+|could\s+)?(?:see|sees|show|shows|say|says|report|reports|list|lists|find|finds|know|knows|have\s+on\s+file|has\s+on\s+file)\b|\b(?:does|do|can|could)\s+(?:luna|you|the\s+system|support|the\s+team)\s+(?:also\s+)?(?:see|show|say|report|list|find|know)\b/;
const EXISTENTIAL_NAMED_RE =
  /\b(?:is|are)\s+there\s+(?:the\s+)?(?:instant\s*override|lifetime\s*split|open\s*season|founder'?s?\s*key|the\s*million|primordial)\b/;

const THERE_STATE_RE = /\bthere\b/;

const DEIXIS_RE =
  /\b(?:now|currently|today|tonight|tomorrow|yesterday|earlier|recently|lately|already|yet|still|anymore|ago|so\s+far|by\s+now|right\s+now|at\s+the\s+moment|these\s+days|this\s+(?:week|month|morning|evening)|last\s+(?:night|week|month|time|pack|one|open|opening|purchase|order|payment|bundle|card|pull|pulls|session|day|login)|most\s+recent|latest|recent|previous|previously|at\s+this\s+point)\b/;

const LOOKUP_RE =
  /\b(?:check(?:ing)?|verify|validate|confirm(?:ing|ed|ation)?|look(?:ing)?\s*(?:up|into|at)|lookup|inspect|investigate|audit|review|see\s+(?:if|whether|what\s+(?:i|we)|my)|find\s+out|pull\s+up|show\s+me|can\s+you\s+see|do\s+you\s+see|are\s+you\s+able\s+to\s+see|display|reflect(?:ed|ing)?)\b|\b(?:your|the)\s+(?:records|system|database|backend|logs|data)\b/;

const HEDGE_RE =
  /\b(?:maybe|perhaps|probably|possibly|not\s+sure|unsure|i\s+think|i\s+guess|idk|dunno|supposedly|apparently|somehow|kinda|sort\s+of|might|or\s+something|or\s+so|something\s+like|whatever|whichever|if\s+any|etc)\b/;

const AUX_RULE_PREDICATE_RE = new RegExp(
  [
    '\\b(?:stack|combine|apply|applies|work|works|expire|expires|last|lasts|cost|costs|charge|charges|count|counts|include|includes|contain|contains|carry|carries|change|changes|convert|converts|transfer|transfers|cancel|cancels|renew|renews|open|opens|close|closes|give|gives|drop|drops|appear|appears|require|requires|need|needs|replace|replaces|reset|resets|start|starts|end|ends|stop|stops|qualify|qualifies|get|gets|receive|receives|come|comes|hold|holds|have|has|mean|means|differ|differs|affect|affects|reduce|reduces|increase|increases|remove|removes|add|adds|guarantee|guarantees|unlock|unlocks|use|uses|own|keep|be|pay|lose)\\b',
    '\\b(?:is|are)\\s+(?:\\w+\\s+){0,3}?(?:a|an|the|per|once|only|always|never|more|less|cheaper|higher|lower|different|separate|distinct|included|allowed|possible|required|needed|limited|permitted|supported|refundable|transferable|cashable|withdrawable|stackable|simulated|real|worth|valid|legal|final)\\b',
    '\\b(?:is|are)\\s+there\\b',
  ].join('|')
);
const DANGLING_RE = /\b(?:on|off|in|up|out|there|here|yet|now|still|active|live|enabled|disabled|mine|ours)\s*$/;
const STRANDED_OK_RE = /\b(?:work|works|apply|applies|used|use|valid)\s+(?:on|in)\s*$/;
const CAPABILITY_VERBS = new Set(['use', 'apply', 'open', 'buy', 'purchase', 'redeem', 'add']);

const PROC_VERBS =
  '(?:open|use|apply|buy|purchase|get|obtain|earn|win|claim|redeem|cancel|convert|withdraw|cash\\s+out|transfer|sell|resell|top\\s+up|topup|add|renew|upgrade|stack|combine|find|view|see|access|save|pay|unlock|qualify|receive|start|begin|close|preview|skip|collect|discover|track|read|learn|set\\s+up|activate)';
const OBJECT_OK_VERBS = new Set([
  'open', 'use', 'apply', 'buy', 'purchase', 'cancel', 'convert', 'withdraw', 'redeem', 'find', 'view',
  'see', 'access', 'renew', 'add', 'save', 'top', 'cash',
]);
const POLICY_VERBS =
  '(?:withdraw|cash\\s+out|convert|transfer|sell|resell|cancel|stack|combine|buy|purchase|redeem|use|apply|open|top\\s+up|add|pay|gift|share|upgrade|renew|pause|trade|swap|exchange|merge|use\\s+two|use\\s+more)';
const COND_VERBS =
  '(?:open|buy|purchase|use|apply|close|cancel|convert|redeem|pay|skip|preview|cut|press|select|choose|click|stack|combine|spend|add|top\\s+up|renew|withdraw|cash\\s+out|upgrade)';

const OBJECT_NOUNS =
  '(?:(?:monthly|current|funded|challenge|free|payout|pack|elite|paid)\\s+)?(?:account|accounts|challenge|dashboard|profile|inventory|collection|packs?|cards?|credits?|subscription|plan|key|keys|checkout|funded)';

const REFUND_CUE_RE =
  /\b(?:refunds?|refunded|refundable|refunding|charge\s*backs?|money\s+back|reimburs\w*|withdrawal\s+rights?|consumer\s+code|cooling[- ]off)\b/;

const MISSING_CUE_RE =
  /\b(?:missing|did\s+not\s+(?:show|appear|arrive|receive|get|come|register|load)|not\s+(?:showing|appearing|arriving|received|visible|credited|added)|never\s+(?:got|received|showed|arrived|appeared)|lost|disappeared|vanished|cannot\s+find|could\s+not\s+find|do\s+not\s+see|did\s+not\s+see)\b/;

const POSITIVE_FREE_TIER_RE = /\bfree(?:\s+\w+){0,3}\s*packs?\b/;

/* ------------------------------------------------------------------ */
/* 4. Clause segmentation                                               */
/* ------------------------------------------------------------------ */

const CLAUSE_START_RE =
  /^(?:do|does|did|is|are|was|were|can|could|will|would|should|shall|may|might|must|have|has|had|am|what|which|who|whom|whose|when|where|why|how|i|we|you|he|she|they|it|this|that|there|my|our|please|check|confirm|tell|show|explain|describe|verify|list|give|let|advise|help|send|see|look|find)\b/;
const ALWAYS_SPLIT = new Set(['if', 'whether', 'because', 'since', 'although', 'though', 'unless', 'while', 'whereas']);
const SOFT_SPLIT = new Set(['and', 'or', 'but', 'plus', 'also', 'then', 'so', ',']);
const REL_SPLIT = new Set(['that', 'which', 'who']);
const PRONOUN_START_RE = /^(?:i|we|you|he|she|they|it|this|that|there|my|our)\b/;

function splitClauses(norm) {
  const segs = norm
    .replace(/\.(?=\s|$)|[?!;]+|\s-\s|["()\[\]{}]|:(?=\s)|…/g, '\u0001')
    .split('\u0001')
    .map((x) => x.trim())
    .filter(Boolean);
  const out = [];
  for (const seg of segs) {
    const toks = seg.replace(/,/g, ' , ').split(/\s+/).filter(Boolean);
    let cur = [];
    let intro = null;
    const flush = () => {
      const text = cur.join(' ').trim();
      if (text) out.push({ text, intro });
      cur = [];
      intro = null;
    };
    for (let i = 0; i < toks.length; i += 1) {
      const tok = toks[i];
      const rest = toks.slice(i + 1).join(' ');
      if (ALWAYS_SPLIT.has(tok) && cur.length) {
        flush();
        intro = tok;
        continue;
      }
      if (ALWAYS_SPLIT.has(tok) && !cur.length) {
        intro = tok;
        continue;
      }
      if (SOFT_SPLIT.has(tok) && cur.length && CLAUSE_START_RE.test(rest)) {
        flush();
        continue;
      }
      if (tok === ',' && !cur.length) continue;
      if (tok === ',' && cur.length) {
        if (CLAUSE_START_RE.test(rest)) flush();
        continue;
      }
      if (REL_SPLIT.has(tok) && cur.length && PRONOUN_START_RE.test(rest)) {
        flush();
        continue;
      }
      cur.push(tok);
    }
    flush();
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 5. Clause interpretation                                             */
/* ------------------------------------------------------------------ */

const LEAD_FILLER_RE =
  /^(?:(?:hi|hello|hey|hiya|howdy|dear\s+(?:team|support|luna|sir|madam)|good\s+(?:morning|afternoon|evening|day)|greetings|thanks|thank\s+you|ok|okay|alright|sure|well|so|and|also|but|then|um|uh|hmm|hm|please|kindly|sorry|excuse\s+me|btw|by\s+the\s+way|quick\s+question|another\s+question|one\s+more\s+(?:thing|question)|just|luna|team|support|sir|madam|bro|mate|guys|folks|yo|oh|ah|wait|actually|anyway|lol)\b[\s,!:-]*)+/;
const TRAIL_FILLER_RE =
  /(?:[\s,!-]*\b(?:thanks|thank\s+you|please|cheers|regards|sir|madam|bro|mate|luna|team|support|ok|okay|lol|asap|thanks\s+in\s+advance)\b)+[\s!?.]*$/;
const SOCIAL_ONLY_RE =
  /^(?:i\s+am\s+(?:a\s+)?(?:new\s+)?(?:trader|customer|user|member|client|beginner|newbie)|i\s+am\s+new(?:\s+(?:here|to\s+(?:this|packs|elite\s+packs|trading|fundedelite)))?|just\s+(?:curious|asking|wondering)|curious|newbie|i\s+just\s+joined|yes|no|yep|nope|nothing|nvm|never\s+mind|good|great|nice|cool|got\s+it|i\s+see|noted|understood)$/;

const POLITE_VERB_LED_RE =
  /^(?:can|could|would|will)\s+you\s+(?:please\s+|kindly\s+)?(?=(?:explain|describe|clarify|summari[sz]e|outline|define|walk\s+me|help\s+me\s+understand)\b)/;

const BARE_LEAD_IN_RE =
  /^(?:what|what\s+happens|what\s+would\s+happen|what\s+will\s+happen|what\s+then|so\s+what|what\s+about\s+it)$/;

const CARRIER_PHRASES = [
  'i would like to know', 'i would like to understand', 'i would like to ask', 'i want to know',
  'i want to understand', 'i want to ask', 'i need to know', 'i need to understand', 'i wanna know',
  'i have a quick question', 'i have a question', 'i have one question', 'i have a doubt', 'i had a question',
  'i was wondering', 'i am wondering', 'i am curious', 'i was curious', 'i am confused', 'i am not sure',
  'i am unsure', 'i do not know', 'i do not understand', 'i am trying to understand',
  'i am trying to find out', 'i am looking for information', 'i need help understanding', 'i wonder',
  'could you please', 'can you please', 'would you please', 'could you kindly', 'could you', 'can you',
  'would you', 'will you', 'please tell me', 'please explain', 'please let me know',
  'please help me understand', 'help me understand', 'explain to me', 'let me know', 'tell me',
  'show me', 'help me', 'give me', 'just wondering', 'quick question', 'question', 'check', 'confirm',
  'verify',
].sort((a, b) => b.length - a.length);
const LOOKUP_CARRIERS = new Set(['check', 'confirm', 'verify']);
const CARRIER_FOLLOW_WH_RE = /^(?:what|which|how|who|whom|when|where|why)\b/;
const CARRIER_FOLLOW_ABOUT_RE = /^about\b/;

function stripCarriers(s0) {
  let s = s0;
  let topicMode = false;
  let carrierOnly = false;
  let stripped = false;
  for (let guard = 0; guard < 6; guard += 1) {
    let changed = false;
    s = s.replace(LEAD_FILLER_RE, '').trim();
    const verbLed = s.replace(POLITE_VERB_LED_RE, '');
    if (verbLed !== s) {
      s = verbLed.trim();
      stripped = true;
      changed = true;
    }
    for (const phrase of CARRIER_PHRASES) {
      if (s === phrase) {
        s = '';
        carrierOnly = true;
        changed = true;
        break;
      }
      if (s.startsWith(phrase + ' ')) {
        const rest = s.slice(phrase.length + 1).trim();
        const whFollow = CARRIER_FOLLOW_WH_RE.test(rest);
        const aboutFollow = CARRIER_FOLLOW_ABOUT_RE.test(rest);
        if (LOOKUP_CARRIERS.has(phrase) ? whFollow : whFollow || aboutFollow) {
          s = aboutFollow ? rest.replace(/^about\s+(?:more\s+)?/, '') : rest;
          if (aboutFollow) topicMode = true;
          stripped = true;
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
  s = s.replace(TRAIL_FILLER_RE, '').trim();
  return { s, topicMode, carrierOnly, stripped };
}

function removeIdioms(s) {
  return s
    .replace(/\b(?:their|its|his|her|your)\s+own\b/g, 'owned_idiom')
    .replace(/\bon\s+(?:their|its|his|her)\s+own\b/g, 'owned_idiom');
}

function countMatches(re, s) {
  const m = s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
  return m ? m.length : 0;
}

/**
 * Mask actor-"I" inside closed rule-type frames. Returns the masked string and
 * information about how-to verbs. "I" outside these frames remains and blocks.
 */
function maskGenericActorFrames(s) {
  let m = s;
  const info = { howVerbs: [], masked: [] };

  m = m.replace(
    new RegExp(`\\bhow\\s+(?:do|can|could|should|would|may|to)\\s+(?:(?:i|we)\\s+)?(?:(?:also|actually|best|even|properly|normally|exactly|easily)\\s+)?(${PROC_VERBS})\\b`, 'g'),
    (full, verb) => {
      info.howVerbs.push(verb.split(/\s+/)[0]);
      info.masked.push('how-to');
      return ' ~howto~ ';
    }
  );
  m = m.replace(
    new RegExp(`\\bwhere\\s+(?:do|can|could|would)\\s+(?:i|we)\\s+(${PROC_VERBS})\\b`, 'g'),
    (full, verb) => {
      info.howVerbs.push(verb.split(/\s+/)[0]);
      info.masked.push('where-do-i');
      return ' ~wherei~ ';
    }
  );
  m = m.replace(
    /\bwhat\s+(?:do|should|can|must|would)\s+(?:i|we)\s+(?:do|need\s+to\s+do|need|pay|owe)\b/g,
    () => {
      info.masked.push('what-do-i-do');
      return ' ~whatido~ ';
    }
  );
  m = m.replace(
    /\bwhat\s+(?:do|can|would)\s+(?:i|we)\s+get\b(?=\s+(?:in|from|per|for|when|with|after|if|on|at|inside)\b)/g,
    () => {
      info.masked.push('what-do-i-get');
      return ' ~whatiget~ ';
    }
  );
  m = m.replace(
    /\bhow\s+(?:many|much)\s+(?:\w+\s+){0,3}?(?:do|can|will|would)\s+(?:i|we)\s+(?:get|receive|earn|need|pay|spend|have\s+to\s+pay|have\s+to\s+spend)\b(?=\s+(?:\w+\s+){0,6}?(?:in|per|from|for|when|to|with|after)\b)/g,
    () => {
      info.masked.push('how-many-do-i-get');
      return ' ~howmany~ ';
    }
  );
  m = m.replace(
    new RegExp(`\\b(?:can|could|may)\\s+(?:i|we)\\s+(?:also\\s+)?(${POLICY_VERBS})\\b`, 'g'),
    (full, verb) => {
      info.howVerbs.push(verb.split(/\s+/)[0]);
      info.masked.push('policy-can-i');
      return ' ~policy~ ';
    }
  );
  m = m.replace(
    /\b(?:do|does)\s+(?:i|we)\s+(?:need\s+to|have\s+to|need|pay|lose|owe)\b/g,
    () => {
      info.masked.push('do-i-need');
      return ' ~doneed~ ';
    }
  );
  m = m.replace(/\bdo\s+(?:i|we)\s+get\s+(?:three|3|\d+)\s+(?=cards?|credits?|packs?)/g, () => {
    info.masked.push('do-i-get-qty');
    return ' ~getqty~ ';
  });
  m = m.replace(
    new RegExp(`\\b(?:when|after|before|once|whenever|while)\\s+(?:i|we)\\s+(?:also\\s+)?(?:${COND_VERBS})\\b`, 'g'),
    () => {
      info.masked.push('cond-i');
      return ' ~cond~ ';
    }
  );
  m = m.replace(
    /\b(?:which|what)\s+(?:\w+\s+){0,2}(?:(?:should|would)\s+(?:i|we)\s+(?:buy|open|pick|choose|purchase|use|start\s+with)|do\s+(?:i|we)\s+(?:buy|pick|choose|purchase))\b/g,
    () => {
      info.masked.push('which-should-i');
      return ' ~whichbest~ ';
    }
  );
  m = m.replace(/\bshould\s+(?:i|we)\s+(?:buy|open|pick|choose|purchase|use|start\s+with)\b/g, () => {
    info.masked.push('should-i-buy');
    return ' ~whichbest~ ';
  });
  return { m: m.replace(/\s+/g, ' ').trim(), info };
}

function interpretClause(clauseText, intro, ctx) {
  const reasons = [];
  const base = { text: clauseText, intro: intro || null };
  const done = (verdict, extra) =>
    Object.freeze({ ...base, verdict, reasons: Object.freeze(reasons.slice()), ...(extra || {}) });

  const elliptic =
    /^(?:and|also|or|plus|same\s+(?:for|with)|what\s+about|how\s+about|&)\b/.test(clauseText);

  const sc = stripCarriers(clauseText);
  let s = sc.s;
  if (!s) return done(VERDICT.NEUTRAL, { hasItem: false });
  if (SOCIAL_ONLY_RE.test(s) || BARE_LEAD_IN_RE.test(s)) return done(VERDICT.NEUTRAL, { hasItem: false });

  s = removeIdioms(s);
  const hasItem = ITEM_RE.test(s);

  // ---- refund / missing-report intents (dedicated approved answers) ----
  const refundCue = REFUND_CUE_RE.test(s);
  const missingCue = MISSING_CUE_RE.test(s) && hasItem;
  if (refundCue || missingCue) {
    const refs = FIRST_PERSON_RE.test(s) || DEF_THIRD_RE.test(s);
    const auxLed = /^(?:is|are|was|were|did|has|have|had|do|does)\b/.test(s);
    const stateWords = /\b(?:processed|status|pending|yet|still|already|arrived|approved|now|currently|today)\b/.test(s);
    const refundStateQ = refs
      ? PARTICIPLES_STATE_RE.test(s) || stateWords || /^(?:did|has|have|was|were|had)\b/.test(s)
      : stateWords;
    const missingStateQ = auxLed || /\b(?:processed|status|pending|yet|still|already|approved|now|currently|today)\b/.test(s);
    if (refundCue && missingCue) {
      reasons.push('refund-and-missing-in-one-clause');
      return done(VERDICT.AMBIGUOUS, { hasItem });
    }
    if (LOOKUP_RE.test(s) || (refundCue && refundStateQ) || (missingCue && missingStateQ)) {
      reasons.push(refundCue ? 'refund-state-query' : 'missing-state-query');
      return done(VERDICT.PERSONAL, { hasItem });
    }
    if (ctx.personalContextBlocks && ANAPHORA_RE.test(s) && !hasItem) {
      reasons.push('anaphora-in-personal-context');
      return done(VERDICT.PERSONAL, { hasItem });
    }
    reasons.push(refundCue ? 'refund-intent' : 'missing-item-report');
    return done(refundCue ? VERDICT.REFUND : VERDICT.MISSING, { hasItem });
  }

  // ---- positive general interpretation ----
  const { m: masked, info } = maskGenericActorFrames(s);
  let w = masked;
  const hasMask = info.masked.length > 0;

  // possessive on generic object nouns inside how-to / where-do-I-find frames
  const objectOk =
    info.masked.some((x) => x === 'how-to' || x === 'where-do-i' || x === 'policy-can-i' || x === 'policy-allowed') &&
    info.howVerbs.length > 0 &&
    info.howVerbs.every((v) => OBJECT_OK_VERBS.has(v));
  if (objectOk) {
    w = w.replace(new RegExp(`\\b(?:my|our)\\s+(?=${OBJECT_NOUNS}\\b)`, 'g'), 'a ');
  }
  const mc = (w.match(/~[a-z]+~/g) || []).length;
  const wNoMarks = w.replace(/~[a-z]+~/g, ' ').replace(/\s+/g, ' ').trim();

  if (wNoMarks === '' && hasMask && info.masked.every((x) => x === 'what-do-i-do')) return done(VERDICT.NEUTRAL, { hasItem: false });

  const blockers = [];
  const note = (r) => blockers.push(r);

  if (FIRST_PERSON_RE.test(wNoMarks)) note('first-person');
  if (DEF_THIRD_RE.test(wNoMarks) && !COLOR_CARD_RE.test(wNoMarks)) note('definite-third-person');
  if (THEY_RE.test(wNoMarks) && !GENERIC_PERSON_RE.test(wNoMarks)) note('unresolved-third-person-plural');
  if (/\b(?:your|you)\b/.test(wNoMarks) && /\byour\s+(?:account|pack|packs|card|cards|credits?|inventory|balance|records|system|data)\b/.test(wNoMarks)) {
    note('second-person-possessive');
  }

  // anaphora
  const anaphoraPresent = ANAPHORA_RE.test(wNoMarks.replace(COLOR_CARD_RE, ' '));
  const demonstrativeItem = /\b(?:this|that|these|those)\s+(?:\w+\s+)?(?:packs?|cards?|credits?|keys?|bundles?|plan|subscription|offer|discount)\b/.test(wNoMarks.replace(COLOR_CARD_RE, ' '));
  if (anaphoraPresent || demonstrativeItem) {
    if (ctx.personalContextBlocks) note('anaphora-in-personal-context');
    else if (!(ctx.priorGeneralItem || ctx.sameMessageGeneralItem)) note('unresolved-anaphora');
    else if (!/\b(?:it|them|ones?|this|that|these|those)\b/.test(wNoMarks)) note('unresolved-anaphora');
  }
  if (elliptic && ctx.personalContextBlocks) note('ellipsis-in-personal-context');

  // state vocabulary
  let st = wNoMarks;
  const modalPassive = new RegExp(
    `\\b(?:can|could|may|must|should|will|would|cannot|does|do)\\s+(?:\\w+\\s+){0,5}?be\\s+(?:unlocked|obtained|earned|claimed|won|bought|purchased|granted|given|activated|enabled|disabled|owned|held|redeemed|used|applied|converted|stacked|combined|cancelled|canceled|refunded|transferred|withdrawn|opened|closed|added|charged|deducted|billed|renewed|delivered|issued|assigned|awarded|pulled|dropped)\\b`,
    'g'
  );
  st = st.replace(modalPassive, ' ');
  const timingScope = /\b(?:when|how|why|before|after|at|during|per|upon|until|once)\b/.test(st);
  if (timingScope) {
    st = st.replace(
      /\b(?:is|are)\s+(?:\w+\s+){0,3}?(?:charged|deducted|billed|renewed|refunded|cancelled|canceled|converted|stacked|combined|redeemed|used|applied|added|opened|closed)\b/g,
      ' '
    );
  }
  st = st.replace(/\b(?:is|are)\s+there\b/g, ' ');
  if (PARTICIPLES_STATE_RE.test(st)) note('account-state-participle');
  if (THERE_STATE_RE.test(st)) note('presence-state');
  if (STATE_NOUN_RE.test(st)) note('account-state-noun');
  if (DEIXIS_RE.test(st)) note('time-deixis');
  if (LOOKUP_RE.test(st) || BOT_LOOKUP_RE.test(st)) note('lookup-request');
  if (PAST_EVENT_RE.test(st)) note('past-tense-event');
  if (CONTAINER_CONTENTS_RE.test(st) && !CONTAINER_EXEMPT_RE.test(st)) note('contents-of-account-container');
  if (EXISTENTIAL_NAMED_RE.test(st)) note('existential-named-item');
  if (/\b(?:eligible|qualif(?:y|ies|ied))\b/.test(st) && (FIRST_PERSON_RE.test(wNoMarks) || DEF_THIRD_RE.test(wNoMarks))) {
    note('person-eligibility');
  }

  // possession verbs are rule-type only under a modal, with a property-owning
  // item subject, or as obligation ("have to").
  {
    const toks = st.split(/\s+/);
    let match;
    const re = new RegExp(POSSESSION_VERB_RE.source, 'g');
    while ((match = re.exec(st))) {
      const word = match[0];
      const before = st.slice(0, match.index);
      const after = st.slice(match.index + word.length);
      if (/^(?:have|has|had)$/.test(word) && /^\s+to\b/.test(after)) continue;
      if (MODAL_RE.test(before)) continue;
      const prev = before.trim().split(/\s+/).filter((x) => !/^(?:also|ever|even|actually|always|usually|typically|all|both|each)$/.test(x));
      const prevTok = prev[prev.length - 1] || '';
      if (prevTok && ITEM_RE.test(prevTok) && !/^(?:account|accounts|dashboard|checkout)$/.test(prevTok)) continue;
      note('possession-verb-without-rule-context');
      break;
    }
    void toks;
  }

  if (HEDGE_RE.test(wNoMarks)) note('hedge-uncertain');
  if (ctx.obfuscated) note('obfuscated-input');

  // ---- frame (proposition) ----
  const head = wNoMarks.split(/\s+/)[0] || '';
  const WH_HEAD = /^(?:what|which|who|whom|whose|when|where|why|how)$/;
  const AUX_PRES = /^(?:do|does|can|could|will|would|should|shall|may|must|is|are)$/;
  let frame = null;
  if (WH_HEAD.test(head) || hasMask && /^~/.test(w.trim())) frame = 'wh';
  else if (AUX_PRES.test(head)) frame = 'aux';
  else if (/^(?:explain|describe|define|clarify|summarize|summarise|outline|overview\s+of|details?\s+(?:on|about|of)|info(?:rmation)?\s+(?:on|about|of))\b/.test(wNoMarks)) frame = 'topic';
  else if (sc.topicMode) frame = 'topic';
  else if (/^(?:the\s+)?[a-z' ]{1,40}\s+(?:overview|explained|explanation|basics|rules|info|information|details|faq|guide)$/.test(wNoMarks)) frame = 'topic';
  else if (intro && /^(?:if|unless|because|since|while|although|though|whereas)$/.test(intro) && !blockers.length) {
    if (hasItem || GENERIC_PERSON_RE.test(wNoMarks) || hasMask) frame = 'cond';
  }
  if (intro === 'if' && /^(?:i|we)\s+/.test(s) && new RegExp(`^(?:i|we)\\s+(?:also\\s+)?${COND_VERBS}\\b`).test(s)) {
    // "if I cancel ..." : hypothetical procedure (actor I masked)
    const m2 = s.replace(new RegExp(`^(?:i|we)\\s+(?:also\\s+)?${COND_VERBS}\\b`), ' ~cond~ ');
    let w2 = m2;
    if (new RegExp(`^(?:i|we)\\s+(?:also\\s+)?(?:cancel|convert|withdraw|redeem|use|apply|open|buy|purchase|renew|add|top)\\b`).test(s)) {
      w2 = w2.replace(new RegExp(`\\b(?:my|our)\\s+(?=${OBJECT_NOUNS}\\b)`, 'g'), 'a ');
    }
    const rest2 = w2.replace(/~[a-z]+~/g, ' ').trim();
    const condBlockers = [];
    if (FIRST_PERSON_RE.test(rest2)) condBlockers.push('first-person');
    if (DEF_THIRD_RE.test(rest2)) condBlockers.push('definite-third-person');
    if (PARTICIPLES_STATE_RE.test(rest2) || STATE_NOUN_RE.test(rest2) || DEIXIS_RE.test(rest2) || LOOKUP_RE.test(rest2)) {
      condBlockers.push('account-state');
    }
    if (ANAPHORA_RE.test(rest2) && !(ctx.priorGeneralItem || ctx.sameMessageGeneralItem)) condBlockers.push('unresolved-anaphora');
    if (ctx.personalContextBlocks && ANAPHORA_RE.test(rest2)) condBlockers.push('anaphora-in-personal-context');
    if (ctx.obfuscated) condBlockers.push('obfuscated-input');
    if (!condBlockers.length) {
      reasons.push('general:cond-procedure');
      return done(VERDICT.GENERAL, { hasItem, frame: 'cond-procedure', anaphoric: false });
    }
    blockers.length = 0;
    condBlockers.forEach((x) => blockers.push(x));
    frame = null;
  }

  if (frame === 'wh' && !hasMask && !ITEM_RE.test(wNoMarks) && !GENERIC_PERSON_RE.test(wNoMarks)) {
    const BARE_FILLER = new Set(['is', 'are', 'do', 'does', 'not', 'so', 'come', 'it', 'that', 'this', 'the', 'a', 'an', 'then', 'now', 'about', 'else', 'exactly', 'really', 'else', 'here', 'there', 'one', 'ones', 'of', 'to', 'for', 'on', 'in', 'work', 'works', 'happen', 'happens']);
    const content = wNoMarks.split(/\s+/).slice(1).filter((t) => t && !BARE_FILLER.has(t));
    const resolved = anaphoraPresent && (ctx.priorGeneralItem || ctx.sameMessageGeneralItem) && !ctx.personalContextBlocks;
    if (!content.length && !resolved) note('wh-without-content');
  }

  if (frame === 'aux') {
    if (!(ITEM_RE.test(wNoMarks) || GENERIC_PERSON_RE.test(wNoMarks) || (anaphoraPresent && (ctx.priorGeneralItem || ctx.sameMessageGeneralItem)))) {
      note('aux-question-without-rule-subject');
    }
    if (!AUX_RULE_PREDICATE_RE.test(wNoMarks)) note('aux-question-without-rule-predicate');
  }
  if (DANGLING_RE.test(wNoMarks) && !STRANDED_OK_RE.test(wNoMarks)) note('dangling-state-particle');
  if (
    info.masked.includes('policy-can-i') &&
    info.howVerbs.some((v) => CAPABILITY_VERBS.has(v)) &&
    NAMED_CARD_RE.test(wNoMarks)
  ) {
    note('named-item-capability-question');
  }

  if (!frame) note('no-positive-rule-frame');

  const anaphoric =
    (anaphoraPresent || demonstrativeItem) && !hasItem && !!(ctx.priorGeneralItem || ctx.sameMessageGeneralItem);

  if (!blockers.length) {
    reasons.push('general:' + frame + (mc ? ':masked-actor' : ''));
    return done(VERDICT.GENERAL, { hasItem, frame, anaphoric });
  }

  blockers.forEach((b) => reasons.push(b));
  const personalSignal =
    blockers.some((b) =>
      /^(?:first-person|definite-third-person|account-state-participle|presence-state|account-state-noun|time-deixis|lookup-request|person-eligibility|possession-verb-without-rule-context|anaphora-in-personal-context|ellipsis-in-personal-context|second-person-possessive|past-tense-event|contents-of-account-container|existential-named-item)$/.test(b)
    ) ||
    (ITEM_RE.test(s) && /^(?:check|confirm|verify|status|look|please)\b/.test(s));
  return done(personalSignal ? VERDICT.PERSONAL : VERDICT.AMBIGUOUS, { hasItem });
}

/* ------------------------------------------------------------------ */
/* 6. Message assembly                                                  */
/* ------------------------------------------------------------------ */

function analyzeNormalized(norm, ctx0) {
  const ctx = Object.assign(
    { personalContextBlocks: false, priorGeneralItem: false, obfuscated: false },
    ctx0 || {}
  );
  const clauses = splitClauses(norm);
  if (!clauses.length) return { clauses: [], results: [], tooComplex: false };
  if (clauses.length > MAX_CLAUSES) return { clauses, results: [], tooComplex: true };
  const results = [];
  let sameMessageGeneralItem = false;
  let sameMessagePersonal = false;
  for (const c of clauses) {
    const r = interpretClause(c.text, c.intro, {
      ...ctx,
      sameMessageGeneralItem,
      personalContextBlocks: ctx.personalContextBlocks || sameMessagePersonal,
    });
    results.push(r);
    if (r.verdict === VERDICT.GENERAL && r.hasItem) sameMessageGeneralItem = true;
    if (r.verdict === VERDICT.PERSONAL || r.verdict === VERDICT.AMBIGUOUS) sameMessagePersonal = true;
  }
  return { clauses, results, tooComplex: false };
}

function assemble(results, tooComplex) {
  if (tooComplex) return { kind: KIND.AMBIGUOUS, reason: 'pregate-too-many-clauses-fail-closed' };
  const live = results.filter((r) => r.verdict !== VERDICT.NEUTRAL);
  if (!live.length) return { kind: KIND.AMBIGUOUS, reason: 'pregate-no-positive-general-clause' };
  const has = (v) => live.some((r) => r.verdict === v);
  const G = has(VERDICT.GENERAL);
  const P = has(VERDICT.PERSONAL);
  const A = has(VERDICT.AMBIGUOUS);
  const R = has(VERDICT.REFUND);
  const M = has(VERDICT.MISSING);
  if (P && (G || R || M)) return { kind: KIND.MIXED, reason: 'pregate-mixed-general-and-personal' };
  if (P) return { kind: KIND.PERSONAL, reason: 'pregate-personal-account-state' };
  if (A) return { kind: KIND.AMBIGUOUS, reason: 'pregate-clause-not-positively-general' };
  if (G && !R && !M) return { kind: KIND.NOT_PERSONAL, reason: 'pregate-all-clauses-positively-general' };
  if (R && !G && !M) return { kind: KIND.REFUND, reason: 'pregate-refund' };
  if (M && !G && !R) return { kind: KIND.MISSING, reason: 'pregate-missing-item' };
  return { kind: KIND.AMBIGUOUS, reason: 'pregate-multiple-intents-no-partial-answer' };
}

function summarisePrior(prior) {
  if (prior === undefined || prior === null) return { personalContextBlocks: false, priorGeneralItem: false, known: true };
  if (!Array.isArray(prior)) return { personalContextBlocks: true, priorGeneralItem: false, known: false };
  const turns = prior.slice(-MAX_PRIOR_TURNS);
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const t = turns[i];
    if (typeof t !== 'string') return { personalContextBlocks: true, priorGeneralItem: false, known: false };
    const norm = normalizeInput(t);
    const a = analyzeNormalized(norm.text, { obfuscated: false });
    const asm = assemble(a.results, a.tooComplex);
    const live = a.results.filter((r) => r.verdict !== VERDICT.NEUTRAL);
    if (!live.length && asm.reason === 'pregate-no-positive-general-clause') continue;
    const lang = languageEvidence(norm.text);
    if (lang.nonEnglish) return { personalContextBlocks: true, priorGeneralItem: false, known: false };
    if (asm.kind === KIND.NOT_PERSONAL && !norm.obfuscated) {
      return { personalContextBlocks: false, priorGeneralItem: a.results.some((r) => r.hasItem), known: true };
    }
    return { personalContextBlocks: true, priorGeneralItem: false, known: true };
  }
  return { personalContextBlocks: false, priorGeneralItem: false, known: true };
}

/* ------------------------------------------------------------------ */
/* 7. Public API                                                        */
/* ------------------------------------------------------------------ */

function blockedGate(kind, reason, extra) {
  return Object.freeze({
    kind,
    reason,
    features: Object.freeze({}),
    clauses: Object.freeze([]),
    blocksProductSelect: true,
    allowsProductSelect: false,
    preferRefuse: kind === KIND.PERSONAL || kind === KIND.MIXED,
    ...(extra || {}),
  });
}

function evaluateOwnershipPregate(text, opts) {
  opts = opts || {};
  try {
    if (text == null || typeof text !== 'string') {
      return blockedGate(KIND.AMBIGUOUS, 'pregate-missing-text-fail-closed');
    }
    if (text.length > MAX_INPUT_CHARS) {
      return blockedGate(KIND.AMBIGUOUS, 'pregate-input-too-long-fail-closed');
    }
    const norm = normalizeInput(text);
    const lang = languageEvidence(norm.text);
    const prior = summarisePrior(opts.priorClientTexts);
    const analysis = analyzeNormalized(norm.text, {
      personalContextBlocks: prior.personalContextBlocks,
      priorGeneralItem: prior.priorGeneralItem,
      obfuscated: norm.obfuscated,
    });
    let decided = assemble(analysis.results, analysis.tooComplex);
    if (
      decided.kind !== KIND.NOT_PERSONAL &&
      decided.kind !== KIND.REFUND &&
      decided.kind !== KIND.MISSING
    ) {
      // keep blocked verdict
    } else if (norm.obfuscated) {
      decided = { kind: KIND.AMBIGUOUS, reason: 'pregate-obfuscated-input-fail-closed' };
    }
    if (lang.nonEnglish && decided.kind !== KIND.PERSONAL && decided.kind !== KIND.MIXED) {
      decided = { kind: KIND.AMBIGUOUS, reason: 'pregate-non-english-fail-closed' };
    }
    const allowsProductSelect = decided.kind === KIND.NOT_PERSONAL;
    const features = Object.freeze({
      normalized: norm.text,
      obfuscated: norm.obfuscated,
      language: lang,
      priorContextKnown: prior.known,
      priorPersonalContext: prior.personalContextBlocks,
      refundCue: REFUND_CUE_RE.test(norm.text),
      missingCue: MISSING_CUE_RE.test(norm.text),
      item: ITEM_RE.test(norm.text) || PACKS_ITEM_RE.test(norm.text) || NAMED_CARD_RE.test(norm.text),
      positiveFreeTier: POSITIVE_FREE_TIER_RE.test(norm.text) && /\b(?:new\s+(?:\d+\s*k\s*)?account|launch\s*week|\d+\s*k\b|which\s*(?:account|size))\b/.test(norm.text),
    });
    return Object.freeze({
      kind: decided.kind,
      reason: decided.reason,
      features,
      clauses: Object.freeze(analysis.results),
      blocksProductSelect: !allowsProductSelect,
      allowsProductSelect,
      preferRefuse: decided.kind === KIND.PERSONAL || decided.kind === KIND.MIXED,
    });
  } catch (_) {
    return blockedGate(KIND.AMBIGUOUS, 'pregate-error-fail-closed');
  }
}

function productSelectPermitted(gate) {
  return !!(
    gate &&
    gate.kind === KIND.NOT_PERSONAL &&
    gate.allowsProductSelect === true &&
    gate.blocksProductSelect === false
  );
}

function isPersonalOrAmbiguous(text, opts) {
  const g = evaluateOwnershipPregate(text, opts);
  return (
    g.kind === KIND.PERSONAL ||
    g.kind === KIND.AMBIGUOUS ||
    g.kind === KIND.MIXED
  );
}

function extractFeatures(text, opts) {
  const g = evaluateOwnershipPregate(text, opts);
  return g.features;
}

function refundIntent(text) {
  const g = evaluateOwnershipPregate(text);
  return g.kind === KIND.REFUND;
}

function missingItemIntent(text) {
  const g = evaluateOwnershipPregate(text);
  return g.kind === KIND.MISSING;
}

/** Compatibility: stance summary derived from clause interpretation. */
function detectPersonalStance(text) {
  const g = evaluateOwnershipPregate(text);
  const hits = [];
  for (const c of g.clauses || []) {
    for (const r of c.reasons || []) {
      if (/first-person|definite-third|anaphora|possession|account-state|lookup|deixis/.test(r) && !hits.includes(r)) hits.push(r);
    }
  }
  return Object.freeze({
    hit: g.kind === KIND.PERSONAL || g.kind === KIND.MIXED,
    hits,
    uncertain: g.kind === KIND.AMBIGUOUS,
  });
}

function detectAccountStatusTerm(text) {
  const g = evaluateOwnershipPregate(text);
  return (g.clauses || []).some((c) =>
    (c.reasons || []).some((r) => /account-state|presence-state|lookup|deixis|possession/.test(r))
  );
}

function detectUnambiguousGeneralProduct(text) {
  const g = evaluateOwnershipPregate(text);
  const reasons = (g.clauses || []).filter((c) => c.verdict === VERDICT.GENERAL).map((c) => c.frame);
  return Object.freeze({ hit: g.kind === KIND.NOT_PERSONAL, reasons: Object.freeze(reasons) });
}

module.exports = {
  KIND,
  VERDICT,
  FEATURE_TABLE: Object.freeze([]),
  extractFeatures,
  evaluateOwnershipPregate,
  productSelectPermitted,
  isPersonalOrAmbiguous,
  refundIntent,
  missingItemIntent,
  NAMED_CARD_RE,
  PACKS_ITEM_RE,
  detectPersonalStance,
  detectAccountStatusTerm,
  detectUnambiguousGeneralProduct,
  normalizeInput,
  languageEvidence,
  splitClauses,
  interpretClause,
  MAX_INPUT_CHARS,
};
