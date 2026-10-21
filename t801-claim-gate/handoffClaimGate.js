'use strict';

/**
 * HANDOFF_CLAIM_GATE_V2 (2026-10-07, Issue 2):
 * A public claim that someone was contacted, the case was forwarded, or the team will
 * update the client is allowed only when this turn proved a handoff, or ownership is
 * already active. Detection is semantic across EN/IT/ES/FR/DE/PT, including the
 * dependent promise that follows a stripped claim ("They'll update you…").
 *
 * Trusted status: none | already_active | note_created | assigned | note_and_assigned | failed
 */

const HANDOFF_STATUSES = Object.freeze([
  'none',
  'already_active',
  'note_created',
  'assigned',
  'note_and_assigned',
  'failed',
]);

const CLAIM_ALLOWED = new Set(['already_active', 'note_created', 'assigned', 'note_and_assigned']);

// English direct-claim detector kept from V1 so existing English forms stay covered.
const HANDOFF_CLAIM_RE =
  /\b(?:i|we)(?:['\u2019]ve|\s+have)\s+(?:already\s+)?(?:sent|passed|forwarded|escalated|shared|flagged|raised|asked|notified|pinged|looped\s+in)\b|\b(?:i|we)(?:['\u2019]ll|\s+will)\s+(?:pass|forward|escalate|send|share|flag|ask|notify|loop\s+in)\b|\b(?:i|we)(?:['\u2019]m|\s+am|\s+are)\s+(?:asking|forwarding|escalating|passing|sending|notifying)\b|\b(?:asked|asking)\s+(?:a\s+)?(?:support\s+)?(?:teammate|team\s+member|colleague|human)\b|\b(?:support\s+)?(?:teammate|team\s+member)\s+(?:to\s+)?(?:verify|confirm|check|review|look|investigate|help)\b|\b(?:our|the)\s+(?:\w+\s+)?(?:support\s+)?team\s+will\s+(?:confirm|review|check|get\s+back|update|reply|verify|look)\b|\bplease\s+wait\s+for\s+(?:confirmation|the\s+team|our\s+team|a\s+(?:support\s+)?teammate)\b|\b(?:i|we)\s+(?:have\s+)?(?:already\s+)?(?:escalated|forwarded)\b|\b(?:left|posted)\s+(?:an?\s+)?(?:internal\s+)?note\b|\b(?:assigned|assigning)\s+(?:this|it|your\s+(?:case|request|issue))\b/i;

// First-person completed handoff, language-agnostic enough for the languages Luna actually sends.
const HANDOFF_ACTION_RE =
  /\b(?:ho\s+inoltrat\w*|abbiamo\s+inoltrat\w*|ho\s+passat\w*\s+(?:la|il|quest|questa)|he\s+(?:pasado|enviado|derivado|escalado)|hemos\s+(?:pasado|enviado|escalado|derivado)|j['\u2019]ai\s+(?:transmis|transf\w*|escalad\w*)|nous\s+avons\s+(?:transmis|transf\w*|escalad\w*)|ich\s+habe\s+(?:.{0,40})?(?:weitergeleitet|eskaliert)|wir\s+haben\s+(?:.{0,40})?(?:weitergeleitet|eskaliert)|encaminhei|escalei|passei\s+(?:o|a|para|seu|sua))\b/i;

// Dependent promise: the sentence that survives a claim-only strip and is itself the false handoff.
const DEPENDENT_PROMISE_RE =
  /\bthey(?:['\u2019]ll|\s+will)\s+(?:update|review|check|confirm|get\s+back|reply|contact)\b|\byou(?:['\u2019]ll|\s+will)\s+(?:receive|get|hear)\s+(?:an?\s+)?(?:update|reply|response)\b|\b(?:i|we)(?:['\u2019]ll|\s+will)\s+update\s+you\b|\bwill\s+update\s+you\s+as\s+soon\s+as\b|\bonce\s+they(?:['\u2019]ve|\s+have)\s+(?:reviewed|checked|confirmed)\b|\balready\s+with\s+(?:the\s+|our\s+)?team\b|\bti\s+aggiorn\w*|\briceverai\s+un\s+aggiornamento\b|\bti\s+contatter\w*|\bte\s+(?:actualizar\w*|contactar\w*|avisar\w*|mantendr\w*\s+informad\w*)\b|\brecibir[a\u00e1]s\s+una\s+actualizaci[o\u00f3]n\b|\bvous\s+(?:serez\s+inform\w*|recevrez\s+une\s+mise\s+[a\u00e0]\s+jour|allez\s+recevoir)\b|\bl['\u2019]?\u00e9quipe\s+vous\s+(?:r\u00e9pondra|tiendra\s+inform\w*)\b|\bsie\s+(?:werden\s+sich\s+melden|erhalten\s+ein\s+update)\b|\bdas\s+team\s+(?:meldet\s+sich|aktualisiert\s+sie)\b|\beles\s+v[a\u00e3]o\s+(?:atualizar|rever|analisar)\b|\bvoc[e\u00ea]\s+receber[a\u00e1]\s+uma\s+atualiza[c\u00e7][a\u00e3]o\b/i;

// Third-person agent future. Present-tense process lines ("our team reviews payouts")
// and "can" conditionals do not match. Customer-directed verbs only.
const THIRD_PERSON_VERB =
  'update\\s+you|follow\\s+up(?:\\s+with)?(?:\\s+you)?|contact\\s+you|reach\\s+out(?:\\s+to)?(?:\\s+you)?|get\\s+back(?:\\s+to)?(?:\\s+you)?|look\\s+into(?:\\s+(?:this|it|your\\s+\\w+))?|review\\s+(?:this|it|your(?:\\s+\\w+)?)';
const THIRD_PERSON_AGENT_RE = new RegExp(
  '\\b(?:a|an|our|the)\\s+(?:support\\s+)?(?:teammate|team\\s+member|agent|specialist|team)(?:\\s+will|[\'\u2019]ll)\\s+(?:' + THIRD_PERSON_VERB + ')\\b' +
  '|\\bsomeone\\s+from\\s+(?:our|the)\\s+(?:support\\s+)?team(?:\\s+will|[\'\u2019]ll)\\s+(?:' + THIRD_PERSON_VERB + ')\\b',
  'i'
);

// T795 CLAIM_GATE_FETCH_V1 (T791 rev6 blocker 11): first-person promises to fetch / connect / transfer a human
// ("I will get a teammate for you", "Let me get someone from the team", "I'm connecting you to an agent") and
// "a teammate will be with you shortly". Same exemptions as the other new future patterns (question,
// conditional opener, customer-acts-first, reported speech). "can"/"could" offers and "won't"/"will not" do not match.
const HUMAN_NOUN = '(?:(?:a|an|one\\s+of\\s+our|our|the|your)\\s+)?(?:(?:support|human|live|real)\\s+)?(?:teammates?|team\\s+members?|colleagues?|humans?|agents?|specialists?|(?:support\\s+)?team|person|someone(?:\\s+from\\s+(?:our|the)\\s+(?:support\\s+)?team)?|somebody)';
const FIRST_PERSON_FETCH_RE = new RegExp(
  '\\b(?:i|we)(?:[\'\u2019]ll|\\s+will|\\s+am\\s+going\\s+to|[\'\u2019]m\\s+going\\s+to|\\s+are\\s+going\\s+to)\\s+(?:now\\s+|quickly\\s+|just\\s+)?(?:get|grab|bring\\s+in|bring|find|fetch|call(?:\\s+in)?|involve|connect\\s+you\\s+(?:with|to)|transfer\\s+you\\s+to|put\\s+you\\s+through\\s+to|hand\\s+(?:you|this|it)\\s+(?:over\\s+)?to|have)\\s+' + HUMAN_NOUN + '\\b' +
  '|\\blet\\s+me\\s+(?:get|grab|bring\\s+in|find|fetch|call(?:\\s+in)?|involve|connect\\s+you\\s+(?:with|to)|transfer\\s+you\\s+to|hand\\s+(?:you|this|it)\\s+(?:over\\s+)?to)\\s+' + HUMAN_NOUN + '\\b' +
  '|\\b(?:i|we)(?:[\'\u2019]m|\\s+am|[\'\u2019]re|\\s+are)\\s+(?:now\\s+)?(?:getting|grabbing|bringing\\s+in|finding|fetching|calling(?:\\s+in)?|involving|connecting\\s+you\\s+(?:with|to)|transferring\\s+you\\s+to|handing\\s+(?:you|this|it)\\s+(?:over\\s+)?to)\\s+' + HUMAN_NOUN + '\\b' +
  '|\\b(?:a|an|our|the)\\s+(?:support\\s+|human\\s+|live\\s+)?(?:teammate|team\\s+member|colleague|agent|specialist|human)(?:\\s+will|[\'\u2019]ll)\\s+(?:be\\s+with\\s+you|join(?:\\s+(?:you|this\\s+chat|the\\s+chat|shortly|soon))?|take\\s+over|assist\\s+you|help\\s+you|contact\\s+you|be\\s+in\\s+touch)\\b',
  'i'
);

// T795 R2 CLAIM_GATE_FETCH_V2 (review residuals): "bring a human in", subjectless "transferring you to an agent",
// Roman Urdu, Urdu script and Arabic transfer/connect promises.
const FETCH_V2_RE = new RegExp(
  '\\blet\\s+me\\s+bring\\s+' + HUMAN_NOUN + '\\s+in\\b' +
  '|\\b(?:i|we)(?:[\'\u2019]ll|\\s+will)\\s+bring\\s+' + HUMAN_NOUN + '\\s+in\\b' +
  '|\\b(?:transferring|connecting|handing|passing)\\s+you\\s+(?:over\\s+)?(?:to|with)\\s+' + HUMAN_NOUN + '\\b' +
  '|\\b(?:main|mai|mein|hum)\\s+(?:aap|ap)(?:ko|ka)?\\b[^.!?]{0,60}?\\b(?:team|teammate|team\\s+member|agent|member|insaan|banda|support)\\b[^.!?]{0,30}?\\b(?:se|say|ke\\s+saath|ko)\\s+(?:connect|transfer|forward)\\s+(?:kar|kr)\\s*(?:raha|rahi|rahe|rha|rhi|dunga|dungi|denge|diya|di|deta|deti)\\b' +
  '|(?:\u06a9\u0646\u06cc\u06a9\u0679|\u0679\u0631\u0627\u0646\u0633\u0641\u0631|\u0641\u0627\u0631\u0648\u0631\u0688)\\s+\u06a9\u0631\\s+(?:\u0631\u06c1\u0627|\u0631\u06c1\u06cc|\u0631\u06c1\u06d2|\u062f\u06cc\u0627|\u062f\u0648\u06ba|\u062f\u06cc\u06ba)' +
  '|(?:\u0633\u0623|\u0633\u0648\u0641\\s+\u0623)(?:\u062d\u0648\u0644|\u0648\u0635\u0644|\u0646\u0642\u0644)\u0643|(?:\u062c\u0627\u0631\u064a?|\u064a\u062a\u0645)\\s+\u062a\u062d\u0648\u064a\u0644\u0643|\u0633\u064a\u062a\u0648\u0627\u0635\u0644\\s+\u0645\u0639\u0643|\u0633\u064a\u0646\u0636\u0645\\s+\u0625\u0644\u064a\u0643',
  'i'
);
const FETCH_V2_NEGATED_RE = /\b(?:not|never|can['\u2019]?t|cannot|won['\u2019]?t|unable\s+to)\b[^.!?]{0,25}\b(?:transferr|connect|hand|bring|pass)|\b(?:nahi|nahin|nai)\b|\u0646\u06c1\u06cc\u06ba|\u0644\u0646\s|\u0644\u0627\s+(?:\u064a\u0645\u0643\u0646|\u0623\u0633\u062a\u0637\u064a\u0639)/i;

// T795 R3 STRUCTURAL_CLAIM_V3 kept as the legacy structural pass.
// T801: a handoff promise is the combination of three classes inside one clause:
//   (H) human/team noun, (V) handoff verb, (C) commitment
//       (future, progressive, perfect, "let me"/"allow me", "going to", "right away"/"now").
// English uses those classes in a closed grammatical frame (not a phrase list).
// Roman Urdu, Urdu, Arabic, Hindi, French, Spanish, Portuguese, Italian and German
// use the same three classes with each language's commitment paradigm.
// Negation, offers, questions, you-conditionals, attributed quotes and
// third-party document futures are not claims. A reply wrapped only in quotes is.
const S3_H_EN = '(?:teammates?|team\\s*members?|colleagues?|humans?|agents?|specialists?|support(?:\\s+(?:team|staff|agent|desk))?|(?:the|our|a|my)\\s+team|staff|person|people|someone|somebody|representative|rep|operator|advisor|manager|supervisor)';
const S3_V_EN = '(?:get|getting|got|grab|grabbing|bring|bringing|pull|pulling|fetch|fetching|find|finding|call|calling|summon|involve|involving|connect|connecting|connected|transfer|transferring|transferred|put\\s+you\\s+through|putting\\s+you\\s+through|hand|handing|handed|pass|passing|passed|loop|looping|looped|escalat\\w*|forward\\w*|assign\\w*|route|routing|routed|refer|referring|ping|pinging|notify|notifying|ask|asking|page|paging)';
const S3_V3_EN = '(?:join\\w*|be\\s+with\\s+you|jump\\w*\\s+in|step\\w*\\s+in|take\\s+over|taking\\s+over|contact\\w*\\s+you|reach\\w*\\s+out|be\\s+in\\s+touch|follow\\w*\\s+up|get\\s+back\\s+to\\s+you|getting\\s+back\\s+to\\s+you|look\\w*\\s+into|assist\\w*\\s+you|help\\w*\\s+you|chat\\w*\\s+with\\s+you|message\\s+you|call\\s+you|email\\s+you|on\\s+(?:the|their|his|her)\\s+way|coming)';
const S3_FIRST = '(?:\\b(?:i|we)(?:[\'\\u2019]ll|\\s+will|\\s+shall|[\'\\u2019]m|\\s+am|[\'\\u2019]re|\\s+are|[\'\\u2019]ve|\\s+have|\\s+just|\\s+now)(?:\\s+(?:now|just|quickly|already|going\\s+to|gonna|about\\s+to|right\\s+now|immediately|also|go\\s+ahead\\s+and))*|\\blet\\s+(?:me|us)(?:\\s+(?:now|just|quickly|go\\s+ahead\\s+and))*|\\b(?:allow|permit)\\s+me\\s+to)';
const S3_EN_FIRST_RE = new RegExp(S3_FIRST + '\\s+' + S3_V_EN + '\\b[^.!?]{0,40}?\\b' + S3_H_EN + '\\b', 'i');
const S3_EN_GERUND_RE = new RegExp('^(?:[\\s"\'(]*(?:ok(?:ay)?|sure|alright|all\\s+right|right|great|got\\s+it|thanks?(?:\\s+you)?|hang\\s+on|hold\\s+on|one\\s+(?:moment|sec(?:ond)?)|please\\s+hold|no\\s+problem|understood)[,!.\\s-]+)*(?:(?:now|just|quickly)\\s+)?(?:getting|grabbing|bringing|pulling|fetching|finding|calling|connecting|transferring|putting\\s+you\\s+through|handing|passing|looping|escalating|forwarding|assigning|routing|paging|notifying)\\b[^.!?]{0,40}?\\b' + S3_H_EN + '\\b', 'i');
const S3_EN_THIRD_RE = new RegExp('\\b' + S3_H_EN + '(?:\\s+(?:from|on|of)\\s+(?:our|the)\\s+(?:support\\s+)?team)?\\s*(?:[\'\\u2019]ll|\\s+will|\\s+shall|\\s+is|[\'\\u2019]s|\\s+are|[\'\\u2019]re|\\s+has\\s+been|\\s+have\\s+been)(?:\\s+(?:now|just|already|soon|shortly|going\\s+to|about\\s+to|be))*\\s+(?:' + S3_V3_EN + '|' + S3_V_EN + ')\\b', 'i');
const S3_EN_PASSIVE_RE = new RegExp('\\byou(?:[\'\\u2019]ll|\\s+will|[\'\\u2019]re|\\s+are|\\s+have)\\s+(?:now\\s+|soon\\s+|shortly\\s+)?(?:be\\s+|being\\s+|been\\s+)(?:connected|transferred|put\\s+through|handed\\s+(?:over\\s+)?|passed|routed|assigned|contacted)\\b[^.!?]{0,40}?\\b' + S3_H_EN + '\\b|\\byou(?:[\'\\u2019]ll|\\s+will)\\s+(?:now\\s+|soon\\s+|shortly\\s+)?(?:hear\\s+from|be\\s+speaking\\s+(?:with|to)|be\\s+chatting\\s+with)\\s+' + '[^.!?]{0,20}?\\b' + S3_H_EN + '\\b', 'i');
const S3_MODAL_EN_RE = /\b(?:can|could|may|might|would\s+you\s+like|do\s+you\s+want|want\s+me\s+to|happy\s+to|able\s+to|if\s+(?:you|needed|necessary))\b/i;
// Multilingual (co-occurrence) stems.
const S3_H_ML = /\b(?:team|teammate|member|agent|insaan|insan|banda|bande|support|staff|koi|kisi|representative)\b|\u0679\u06cc\u0645|\u0627\u06cc\u062c\u0646\u0679|\u0646\u0645\u0627\u0626\u0646\u062f|\u0627\u0646\u0633\u0627\u0646|\u0633\u067e\u0648\u0631\u0679|\u0639\u0645\u0644|\u0645\u0645\u0628\u0631|\u0641\u0631\u064a\u0642|\u0648\u0643\u064a\u0644|\u0645\u0648\u0638\u0641|\u0632\u0645\u064a\u0644|\u0627\u0644\u062f\u0639\u0645|\u0634\u062e\u0635|\u0623\u062d\u062f|\u0645\u0645\u062b\u0644|\u0628\u0634\u0631\u064a|\u091f\u0940\u092e|\u090f\u091c\u0947\u0902\u091f|\u0938\u0926\u0938\u094d\u092f|\u092e\u0947\u0902\u092c\u0930|\u0915\u093f\u0938\u0940|\u0938\u092a\u094b\u0930\u094d\u091f|\u0907\u0902\u0938\u093e\u0928|\u0935\u094d\u092f\u0915\u094d\u0924\u093f|\u092a\u094d\u0930\u0924\u093f\u0928\u093f\u0927\u093f|(?<![a-z])(?:conseill\w+|agent|\u00e9quipe|equipe|coll\u00e8gue|quelqu['\u2019]un|humain|membre|op\u00e9rateur|sp\u00e9cialiste)\b/i;
const S3_V_ML = /\b(?:connect|transfer|forward|escalate|bula|bulaa?|bulwa|rabta|raabta|jor|jod|mila|milwa|refer|assign|pass)\w*|\u062c\u0648\u0691|\u06a9\u0646\u06cc\u06a9\u0679|\u0679\u0631\u0627\u0646\u0633\u0641\u0631|\u0628\u0644\u0627|\u0631\u0627\u0628\u0637|\u0641\u0627\u0631\u0648\u0631\u0688|\u0645\u0644\u0627|\u062d\u0648\u0644|\u062a\u062d\u0648\u064a\u0644|\u0648\u0635\u0644|\u062a\u0648\u0627\u0635\u0644|\u0646\u0642\u0644|\u0631\u0628\u0637|\u064a\u0646\u0636\u0645|\u0627\u0646\u0636\u0645|\u0633\u064a\u0646\u0636\u0645|\u0625\u062d\u0627\u0644|\u062c\u094b\u0921\u093c|\u091c\u094b\u0921|\u0915\u0928\u0947\u0915\u094d\u091f|\u091f\u094d\u0930\u093e\u0902\u0938\u092b\u0930|\u092c\u0941\u0932\u093e|\u0938\u0902\u092a\u0930\u094d\u0915|\u092b\u0949\u0930\u0935\u0930\u094d\u0921|\b(?:mets?\s+en\s+relation|mettre\s+en\s+relation|transf\u00e8r\w*|transf\u00e9r\w*|transf[e\u00e8\u00e9]r\w*|connect\w*|contacter\w*|recontacter\w*|rejoindre|rejoint|passe\s+(?:la\s+main|\u00e0)|redirig\w*|escalad\w*)\b/i;
const S3_C_ML = /\b(?:kar|kr|karwa|karva)\s*(?:raha|rahi|rahe|rha|rhi|rhe|diya|diyaa|di|dia|dunga|dungi|denge|deta|deti|dete|chuka|chuki|liya)\b|\b(?:raha|rahi|rahe|rha|rhi|rhe)\s+(?:hoon|hun|hu|hain|hai|he)\b|\w+(?:unga|ungi|enge|oonga|oongi)\b|\b(?:diya|liya|dia)\s+(?:hai|he|hain)\b|\u0631\u06c1(?:\u0627|\u06cc|\u06d2)|\u062f\u06cc\u0627|\u062f\u0648\u06ba\s+\u06af|\u06af\u0627|\u06af\u06cc|\u06af\u06d2|\u0644\u06cc\u0627|(?:^|\s)\u0633[\u0623\u0646\u064a\u062a]\S+|\u0633\u0648\u0641|\u062c\u0627\u0631[\u064a\u064d]?|\u064a\u062a\u0645|\u0642\u0645\u062a|\u062a\u0645\s|\u0627\u0644\u0622\u0646|\u0930\u0939\u093e|\u0930\u0939\u0940|\u0930\u0939\u0947|\u0926\u093f\u092f\u093e|\u0926\u0942\u0902\u0917|\u0926\u0942\u0901\u0917|(?:\u0917\u093e|\u0917\u0940|\u0917\u0947)(?=[\s\u0964.!?]|$)|\u0942\u0902\u0917\u093e|\b(?:je\s+vais|nous\s+allons|je\s+vous|nous\s+vous|vais\s+vous|va\s+vous|vont\s+vous|vous\s+serez|vous\s+allez\s+\u00eatre|est\s+en\s+train|je\s+suis\s+en\s+train|un\s+\w+\s+va)\b/i;
const S3_NEG_ML_RE = /\b(?:nahi|nahin|nai|nhi|mat|sakta|sakti|sakte|skta|chahein|chahen|chahte|chahti|agar)\b|\u0646\u06c1\u06cc\u06ba|\u0633\u06a9\u062a|\u0627\u06af\u0631|(?:^|\s)(?:\u0644\u0646|\u0644\u0627|\u0644\u0645)\s|\u064a\u0645\u0643\u0646|\u0623\u0633\u062a\u0637\u064a\u0639|\u0647\u0644\s|\u0625\u0630\u0627|\u0646\u0939\u0940\u0902|\u0938\u0915\u0924|\u0905\u0917\u0930|\u0915\u094d\u092f\u093e\s|\b(?:ne|n['\u2019])\s*\w+\s+(?:pas|jamais)\b|\b(?:peux|pouvez|pourrais|pouvons|souhaitez|voulez|si\s+vous)\b/i;
function structuralClaimV3Legacy(sentence) {
  const s = String(sentence || '').trim();
  if (!s) return false;
  if (handoffNegated(s) || FETCH_V2_NEGATED_RE.test(s)) return false;
  const en = S3_EN_FIRST_RE.test(s) || S3_EN_GERUND_RE.test(s) || S3_EN_THIRD_RE.test(s) || S3_EN_PASSIVE_RE.test(s);
  if (en) {
    if (/\b(?:not|never|no\s+longer|won['\u2019]?t|can['\u2019]?t|cannot|don['\u2019]?t|doesn['\u2019]?t|isn['\u2019]?t|aren['\u2019]?t|unable)\b/i.test(s)) return false;
    // A modal offer only blocks when no unconditional commitment form precedes it.
    const m = s.match(S3_MODAL_EN_RE); if (m) { const before = s.slice(0, m.index); if (!/\b(?:i|we)(?:['\u2019]ll|\s+will|['\u2019]m|\s+am)\b|^\s*(?:\w+[,!]\s*)?\w+ing\b/i.test(before)) return false; }
    return true;
  }
  if (S3_H_ML.test(s) && S3_V_ML.test(s) && S3_C_ML.test(s) && !S3_NEG_ML_RE.test(s)) return true;
  return false;
}

// --- T801 structural promise: human noun + handoff verb + commitment form ---

const T801_H_EN = [
  'customer\\s+service(?:\\s+(?:agents?|reps?|team|staff))?',
  'customer\\s+support',
  'service\\s+(?:team|desk|agents?|reps?)',
  'help\\s*desks?(?:\\s+(?:agents?|associates?|reps?))?',
  'support\\s+(?:team|staff|agents?|desk|reps?|side)',
  'live\\s+(?:chat\\s+)?(?:agents?|persons?|humans?|reps?|advis[oe]rs?|operators?)',
  'real\\s+(?:persons?|humans?|agents?|people)',
  'human\\s+(?:agents?|beings?|reps?)',
  'actual\\s+persons?',
  'members?\\s+of\\s+(?:the\\s+|our\\s+)?(?:support\\s+)?(?:team|staff)',
  'team[-\\s]?mates?',
  'team\\s+members?',
  'co[-\\s]?workers?',
  'colleagues?',
  'specialists?',
  'supervisors?',
  'representatives?',
  'administrators?',
  'technicians?',
  'engineers?',
  'analysts?',
  'moderators?',
  'operators?',
  'associates?',
  'advis[oe]rs?',
  'managers?',
  '(?:support\\s+)?staff(?:\\s+members?)?',
  'someone(?:\\s+(?:on|from)\\s+(?:our|the|your)\\s+(?:support\\s+)?(?:team|staff|side))?',
  'somebody',
  'personnel',
  'experts?',
  'persons?',
  'humans?',
  'agents?',
  'crews?',
  'handlers?',
  'liaisons?',
  'attendants?',
  'staffers?',
  'reps?',
  '(?:the|our)\\s+desk',
  '(?:the|our|my)\\s+(?:support\\s+)?team',
  'support',
  'team',
].join('|');

const T801_GAP = '(?:you|your|this|that|it|them|us|chat|case|request|issue|ticket|conversation|matter|call|over|in|through|along|back|on|to|with|into|onto|a|an|the|our|my|one|of|live|real|human|actual|senior|dedicated|available|for|please|now|just|right|away|immediately|straight|up|from|and|soon|shortly)';
const T801_ADV = '(?:now|just|quickly|immediately|promptly|shortly|soon|straight|kindly|also|simply|currently|already|right\\s+away|right\\s+now)';

const T801_V = '(?:' + [
  'warm[\\s-]+transfer(?:ring|red)?',
  'lin(?:e|ing)\\s+up',
  'rop(?:e|ing|ed)\\s+in',
  'put(?:ting)?\\s+(?:you\\s+)?in\\s+touch(?:\\s+with)?',
  'put(?:ting)?\\s+you\\s+through',
  'hand(?:ing|ed)?\\s+(?:you\\s+)?off',
  'hand(?:ing|ed)?\\s+you\\s+over',
  'walk(?:ing)?\\s+you\\s+over',
  'hop(?:ping|ped)?\\s+(?:on|in)',
  'conference(?:ing|d)?',
  'bridg(?:e|ing|ed)',
  'redirect(?:ing|ed)?',
  'transfer(?:ring|red)?',
  'connect(?:ing|ed)?',
  'escalat(?:e|ing|ed)',
  'forward(?:ing|ed)?',
  'arrang(?:e|ing|ed)',
  'request(?:ing|ed)?',
  'involv(?:e|ing|ed)',
  'summon(?:ing|ed)?',
  'invit(?:e|ing|ed)',
  'notif(?:y|ying|ied)',
  'assign(?:ing|ed)?',
  'fetch(?:ing|ed)?',
  'bring(?:ing)?',
  'brought',
  'pull(?:ing|ed)?',
  'grab(?:bing|bed)?',
  'loop(?:ing|ed)?',
  'pag(?:e|ing|ed)',
  'ping(?:ing|ed)?',
  'rout(?:e|ing|ed)',
  'refer(?:ring|red)?',
  'patch(?:ing|ed)?',
  'pass(?:ing|ed)?',
  'put(?:ting)?',
  'hand(?:ing|ed)?',
  'add(?:ing|ed)?',
  'get(?:ting)?',
  'got',
  'call(?:ing|ed)?',
  'ask(?:ing|ed)?',
  'find(?:ing)?',
  'found',
  'hav(?:e|ing)',
  'join(?:ing|ed)?',
  'dial(?:ing|led|ed)?',
  'buzz(?:ing|ed)?',
  'flag(?:ging|ged)?',
].join('|') + ')';

const T801_VING = '(?:' + [
  'warm[\\s-]+transferring',
  'lining\\s+up',
  'roping\\s+in',
  'putting\\s+(?:you\\s+)?in\\s+touch(?:\\s+with)?',
  'putting\\s+you\\s+through',
  'handing\\s+(?:you\\s+)?off',
  'handing\\s+you\\s+over',
  'walking\\s+you\\s+over',
  'hopping\\s+(?:on|in)',
  'conferencing',
  'bridging',
  'redirecting',
  'transferring',
  'connecting',
  'escalating',
  'forwarding',
  'arranging',
  'requesting',
  'involving',
  'summoning',
  'inviting',
  'notifying',
  'assigning',
  'fetching',
  'bringing',
  'pulling',
  'grabbing',
  'looping',
  'paging',
  'pinging',
  'routing',
  'referring',
  'patching',
  'passing',
  'putting',
  'handing',
  'adding',
  'getting',
  'calling',
  'asking',
  'finding',
  'having',
  'joining',
  'dialing',
  'buzzing',
  'flagging',
  'reaching\\s+out',
  'getting\\s+back',
  'replying',
  'responding',
].join('|') + ')';

const T801_COMMIT = '(?:' + [
  'let\\s+me',
  'let\\s+us',
  'lemme',
  'allow\\s+me\\s+to',
  'permit\\s+me\\s+to',
  '(?:i|we)(?:\'ll|\\s+will|\\s+shall)\\s+be',
  '(?:i|we)(?:\'m|\'re|\\s+am|\\s+are)\\s+(?:going\\s+to|gonna|about\\s+to)\\s+be',
  '(?:i|we)(?:\'m|\'re|\\s+am|\\s+are)\\s+(?:going\\s+to|gonna|about\\s+to)',
  '(?:i|we)(?:\'ll|\\s+will|\\s+shall)',
  '(?:i|we)(?:\'m|\'re|\\s+am|\\s+are)',
  '(?:i|we)(?:\'ve|\\s+have)(?=\\s+(?:already\\s+|just\\s+)?(?:loop|ping|page|assign|forward|contact|ask|notif|escalat|transfer|connect|call|invit|request|bridg|rop|pull|bring|fetch|hand|pass|add|conferenc|reach|repl|respond))',
].join('|') + ')';

const T801_TVERB = '(?:' + [
  'hop(?:ping|ped)?\\s+(?:on|in)',
  'jump(?:ing)?\\s+in',
  'step(?:ping)?\\s+in',
  'join(?:ing|ed)?(?:\\s+you|\\s+this(?:\\s+chat)?|\\s+the\\s+chat)?',
  'tak(?:e|ing)\\s+over',
  'take\\s+it\\s+from\\s+here',
  'be\\s+with\\s+you',
  'be\\s+in\\s+touch',
  'reach(?:ing)?\\s+out(?:\\s+to\\s+you)?',
  'contact(?:ing)?\\s+you',
  'follow(?:ing)?\\s+up(?:\\s+with\\s+you)?',
  'get(?:ting)?\\s+back\\s+to\\s+you',
  'get(?:ting)?\\s+in\\s+touch',
  'repl(?:y|ies|ying|ied)\\s+(?:to\\s+you|here|shortly|soon|back|now)',
  'respond(?:s|ing|ed)?\\s+(?:to\\s+you|here|shortly|soon|now)',
  'assist(?:ing)?\\s+you',
  'help(?:ing)?\\s+you',
  'come\\s+on',
  'be\\s+on\\s+(?:the|their)\\s+way',
  'on\\s+(?:the|their)\\s+way',
  'look(?:ing)?\\s+into\\s+(?:this|it|your\\s+\\w+)',
].join('|') + ')';

const T801_FP_RE = new RegExp(
  '\\b(?:' + T801_COMMIT + ')\\s+(?:' + T801_ADV + '\\s+)*(?:be\\s+)?\\b(?:' + T801_V + ')\\b(?:\\s+' + T801_GAP + '){0,8}\\s+(?:' + T801_H_EN + ')\\b',
  'i'
);
const T801_GER_RE = new RegExp(
  '^(?:[\\s"\'(]*)(?:(?:ok(?:ay)?|sure|alright|all\\s+right|right|great|got\\s+it|thanks(?:\\s+you)?|thank\\s+you|hang\\s+on|hold\\s+on|one\\s+(?:moment|sec(?:ond)?|minute)|please\\s+hold|no\\s+problem|understood|absolutely|of\\s+course|certainly|hey|hi|hello|now|just|quickly|right\\s+away|immediately)[,!.\\s-]*)*(?:' + T801_ADV + '\\s+)*\\b(?:' + T801_VING + ')\\b(?:\\s+' + T801_GAP + '){0,8}\\s+(?:' + T801_H_EN + ')\\b',
  'i'
);
const T801_THIRD_RE = new RegExp(
  '\\b(?:' + T801_H_EN + ')\\b(?:\\s+(?:on|from|of)\\s+(?:our|the|your)\\s+(?:support\\s+)?(?:team|staff|side))?\\s+(?:will|shall|\'ll|is|are)(?:\\s+(?:now|just|soon|shortly|already|about\\s+to|going\\s+to|be|being))*\\s+(?:' + T801_TVERB + ')',
  'i'
);
const T801_THIRD_PASS_RE = new RegExp(
  '\\b(?:' + T801_H_EN + ')\\b(?:\\s+(?:on|from)\\s+(?:our|the)\\s+(?:team|support|staff))?\\s+is\\s+being\\s+(?:brought|pulled|looped|called|roped|invited|added|paged|fetched|handed|connected|transferred|bridged|escalated)(?:\\s+in)?\\b',
  'i'
);
const T801_CASE_PASS_RE = new RegExp(
  '\\b(?:your|this|the)\\s+(?:chat|case|request|ticket|conversation|call)\\s+(?:will\\s+be|is\\s+being|is\\s+going\\s+to\\s+be|has\\s+been|\'ll\\s+be)\\s+(?:handed(?:\\s+over)?|transferred|escalated|passed|routed|forwarded|connected|assigned)\\s+(?:to|over\\s+to)\\s+(?:' + T801_GAP + '\\s+){0,4}(?:' + T801_H_EN + ')\\b',
  'i'
);
// Contact/reply verbs are a handoff only when aimed at a person or at you.
// "get back to the steps" and "reply with the FAQ" have neither.
const T801_CONTACT_V = '(?:reach(?:ing|ed)?\\s+out|get(?:ting)?\\s+back|repl(?:y|ying|ied|ies)|respond(?:ing|ed|s)?)';
const T801_CONTACT_RE = new RegExp(
  '\\b(?:' + T801_COMMIT + ')\\s+(?:' + T801_ADV + '\\s+)*(?:' + T801_CONTACT_V + ')\\b(?:\\s+' + T801_GAP + '){0,8}\\s+(?:' + T801_H_EN + ')\\b' +
  '|\\b(?:' + T801_COMMIT + ')\\s+(?:' + T801_ADV + '\\s+)*(?:' + T801_CONTACT_V + ')\\s+to\\s+you\\b',
  'i'
);
// Subjectless completed handoff: "Escalated to the desk." Imperatives ("Bring your account number") are not in this list.
const T801_BARE_RE = new RegExp(
  '^(?:[\\s"“«\'(]*)(?:(?:ok(?:ay)?|sure|done|alright|thanks|thank\\s+you|already|just|now)[,!.\\s-]*)*' +
  '(?:escalated|forwarded|transferred|connected|assigned|passed|routed|referred|handed(?:\\s+off)?|looped(?:\\s+in)?|pinged|paged|notified|reached\\s+out)' +
  '(?:\\s+(?:this|it|you|them))?' +
  '(?:\\s+(?:your|the|this)\\s+(?:chat|case|request|ticket|issue|conversation|call|matter))?' +
  '\\s+(?:over\\s+)?(?:to|with)\\s+(?:' + T801_GAP + '\\s+){0,4}(?:' + T801_H_EN + ')\\b',
  'i'
);

const T801_THING_AFTER = /^(?:schedule|page|pages|faq|article|articles|roster|meeting|policy|policies|rules|hours|handbook|update|updates|documentation|docs|doc|site|website|portal|inbox|address|number|queue|channel|email|blog|post|posts|guide|center|centre|name|system|wording|copy|catalog|blog)$/i;

function t801Norm(s) {
  return normalizeClaimText(s);
}

// NFKC folds fullwidth letters and fullwidth apostrophes. Cf strips zero-width
// and other format characters. Remaining apostrophe look-alikes, including
// U+02BC, are mapped to ASCII before any regex runs.
function normalizeClaimText(s) {
  let t = String(s || '').replace(/\p{Cf}/gu, '').replace(/\u3000/g, ' ');
  try { t = t.normalize('NFKC'); } catch (e) { /* keep t */ }
  t = t.replace(/[\u064B-\u065F\u0670]/g, '');
  t = t.replace(/[\u02B9\u02BB\u02BC\u02CA\u02CB\u02EE\u2018\u2019\u201A\u201B\u2032\u2035\u00B4\u0060\uFF07\u0374\u05F3\uA78B\uA78C]/g, "'");
  t = t.replace(/[\u2014\u2013\u2212]/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

function t801HumanOk(text, match) {
  const end = match.index + match[0].length;
  if (/^['’]s\b/.test(text.slice(end))) return false;
  const h = match[0].match(/([A-Za-z][A-Za-z-]*)\s*$/);
  const hword = h ? h[1] : '';
  const after = text.slice(end).match(/^\s+([A-Za-z]+)/);
  if (/^(?:team|support|staff|desk|crew)$/i.test(hword) && after && T801_THING_AFTER.test(after[1])) return false;
  if (/desk$/i.test(hword)) {
    const nounAt = text.lastIndexOf(hword, end);
    const beforeNoun = text.slice(Math.max(0, nounAt - 20), nounAt);
    if (/\b(?:on|at|onto|upon)\s+(?:your\s+|the\s+|my\s+|our\s+)?$/i.test(beforeNoun)) return false;
  }
  if (/person$/i.test(hword) && after && /^(?:reply|response|name|account|details)$/i.test(after[1])) return false;
  return true;
}

function t801Search(re, text) {
  const r = new RegExp(re.source, 'gi');
  let m;
  while ((m = r.exec(text))) {
    if (t801HumanOk(text, m)) return true;
    if (m[0].length === 0) r.lastIndex += 1;
  }
  return false;
}

function t801ClauseBlocked(clause) {
  if (/\b(?:not|never|no\s+longer|won'?t|will\s+not|can'?t|cannot|don'?t|doesn'?t|isn'?t|aren'?t|am\s+not|are\s+not|unable|without)\b/i.test(clause)) return true;
  if (/\b(?:shall|can|may|could|should)\s+i\b/i.test(clause)) return true;
  if (/\b(?:would\s+you|do\s+you\s+want|did\s+you\s+want|want\s+me\s+to|happy\s+to|glad\s+to|able\s+to)\b/i.test(clause)) return true;
  if (/\bif\s+(?:you|you'd|needed|necessary)\b/i.test(clause)) return true;
  if (/\b(?:can|could|may|might|would|should)\b/i.test(clause) &&
      !/\b(?:i|we)(?:'ll|\s+will|\s+shall)\b/i.test(clause) &&
      !/\b(?:i'm|we're|i\s+am|we\s+are|let\s+me)\b/i.test(clause)) return true;
  return false;
}

function t801InherentYou(clause) {
  if (t801ClauseBlocked(clause)) return false;
  const m = clause.match(/\b(?:connect(?:ing|ed)?|transfer(?:ring|red)?|patch(?:ing|ed)?|bridg(?:e|ing|ed)|redirect(?:ing|ed)?|escalat(?:e|ing|ed))\s+you\b/i)
    || clause.match(/\bhand(?:ing|ed)?\s+you\s+over\b/i)
    || clause.match(/\bput(?:ting)?\s+you\s+through\b/i);
  if (!m) return false;
  const after = clause.slice(m.index + m[0].length);
  if (/^\s+(?:the|a|an|your|some|this)\s+(?!team\b|agent\b|human\b|person\b|specialist\b|teammate\b|colleague\b|rep\b|support\b|advisor\b|staff\b)/i.test(after)) return false;
  const commit = /\b(?:let\s+me|let\s+us|lemme|allow\s+me\s+to|permit\s+me\s+to|(?:i|we)(?:'ll|\s+will|\s+shall)|(?:i'm|we're|i\s+am|we\s+are))\b/i.test(clause);
  const ing = /^(?:[\s"'(]*)(?:(?:ok(?:ay)?|sure|alright|now|just|right\s+away|one\s+\w+)[,!\s-]*)*(?:connecting|transferring|handing|patching|bridging|redirecting|escalating|putting)\s+you\b/i.test(clause);
  return commit || ing;
}

function t801_you_passive(clause) {
  if (t801ClauseBlocked(clause)) return false;
  const r = /\byou(?:'ll|'re|\s+will|\s+are|\s+were)\s+(?:now\s+|soon\s+|shortly\s+|going\s+to\s+)?(?:be\s+|being\s+)?(?:connected|transferred|handed(?:\s+over)?|passed(?:\s+over)?|routed|patched|bridged|put\s+through)\b/ig;
  let m;
  while ((m = r.exec(clause))) {
    const after = clause.slice(m.index + m[0].length);
    const obj = after.match(/^\s+(?:to|with)\s+([^,.!?]*)/);
    if (!obj) return true;
    const dest = obj[1];
    const hr = new RegExp('(?:' + T801_H_EN + ')', 'i');
    if (hr.test(dest)) return true;
  }
  const hear = new RegExp("\\byou(?:'ll|\\s+will)\\s+(?:now\\s+|soon\\s+|shortly\\s+)?(?:hear\\s+from|be\\s+speaking\\s+with|speak\\s+with|be\\s+chatting\\s+with|chat\\s+with)\\s+(?:a\\s+|an\\s+|the\\s+|our\\s+)?(?:" + T801_H_EN + ")\\b", 'i');
  if (hear.test(clause)) return true;
  return false;
}

function t801EnglishClause(clause) {
  const c = t801Norm(clause);
  if (!c || t801ClauseBlocked(c)) return false;
  if (t801Search(T801_FP_RE, c)) return true;
  if (t801Search(T801_GER_RE, c)) return true;
  if (t801Search(T801_THIRD_RE, c)) return true;
  if (t801Search(T801_THIRD_PASS_RE, c)) return true;
  if (t801Search(T801_CASE_PASS_RE, c)) return true;
  if (t801Search(T801_CONTACT_RE, c)) return true;
  if (t801Search(T801_BARE_RE, c)) return true;
  if (t801InherentYou(c)) return true;
  if (t801_you_passive(c)) return true;
  return false;
}

function t801English(text) {
  const t = t801Norm(text);
  if (!t) return false;
  const parts = t.split(/,|;|\s+but\s+|\s+however\s+/i).map((x) => x.trim()).filter(Boolean);
  return (parts.length ? parts : [t]).some((p) => t801EnglishClause(p));
}

function t801Roman(s) {
  if (!/\b(aap|aapko|aapse|apko|apne|hoon|hun|raha|rahi|rahe|rha|rhi|rhe|karunga|karungi|karega|karegi|karenge|dunga|dungi|denge|abhi|insaan|insan|banda|bande|chahiye|mujhe|mera)\b/i.test(s)) return false;
  if (/\b(nahi|nahin|nai|nhi|mat|sakta|sakti|sakte|skta|agar|chahein|chahen|chahte|chahti|kya|kia)\b/i.test(s)) return false;
  if (/\?\s*$/.test(s)) return false;
  const H = /\b(team(?:mate)?s?|members?|agents?|insaan|insan|banda|bande|support|staff|kisi|koi|numainda|representatives?|colleagues?|humans?|operators?|supervisors?|specialists?|crews?|desks?)\b/i;
  const V = /\b(connect|transfer|forward|escalate|bula\w*|jor\w*|jod\w*|mila\w*|milwa\w*|milau\w*|rabta|raabta|refer\w*|assign\w*|join\w*|contact\w*|handoff|repl(?:y|ies|ied|ying))\w*/i;
  const C = /\b(raha|rahi|rahe|rha|rhi|rhe|hoon|hun|karunga|karungi|karenge|karega|karegi|dunga|dungi|denge|diya|dia|abhi)\b|\b\w+(?:unga|ungi|enge|ega|egi)\b/i;
  return H.test(s) && V.test(s) && C.test(s);
}

function t801Hindi(s) {
  if (!/[\u0900-\u097F]/.test(s)) return false;
  if (/नहीं|सकत|अगर|क्या|चाहिए|चाहेंग|चाहते|चाहती|चाहें/.test(s)) return false;
  if (/\?\s*$/.test(s)) return false;
  const H = /टीम|एजेंट|एजेन्ट|सदस्य|मेंबर|सपोर्ट|इंसान|व्यक्ति|प्रतिनिधि|स्टाफ|सहयोगी|ऑपरेटर|मानव|हेल्पडेस्क|आदमी/;
  const V = /जोड़|जोड़|कनेक्ट|ट्रांसफर|ट्रान्सफर|बुला|संपर्क|फॉरवर्ड|फारवर्ड|मिला|मिलवा|बात|शामिल|रेफर/;
  const C = /रहा|रही|रहे|दूंगा|दूँगा|दूंगी|देंगे|करूंगा|करूँगा|करेगा|करेगी|करेंगे|होगा|होगी|होंगे|दिया|अभी|दूँ|गया|गई|गए|चुका|चुकी|चुके/;
  // मिलेगा is "will meet you", not "a support page will be available".
  if (/मिलेगा|मिलेगी|मिलेंगे|मिलूँगा|मिलूंगा/.test(s) &&
      /आपसे|तुमसे|उनसे|सदस्य|मेंबर|एजेंट|एजेन्ट|इंसान|व्यक्ति|आदमी|हेल्पडेस्क|स्टाफ|सहयोगी|ऑपरेटर|मानव|प्रतिनिधि/.test(s) &&
      !(/स्टाफ\s*(?:पेज|पृष्ठ|लेख|सूची)|सपोर्ट\s*(?:पेज|लेख|साइट)|टीम\s*(?:पेज|मीटिंग|सूची)/.test(s) && !/आपसे|तुमसे|उनसे|सदस्य|मेंबर|एजेंट|इंसान|व्यक्ति|आदमी|हेल्पडेस्क/.test(s))) return true;
  return H.test(s) && V.test(s) && C.test(s);
}

function t801Urdu(s) {
  if (/نہیں|نہيں|سکتا|سکتی|اگر/.test(s)) return false;
  // کیا is the question word, except inside the passive کیا گیا.
  if (/کیا/.test(s) && !/کیا\s*گ/.test(s)) return false;
  if (/\?\s*$/.test(s)) return false;
  const tok = (stem) => new RegExp('(?<![\\u0600-\\u06FF])' + stem);
  const H = ['ٹیم', 'ایجنٹ', 'نمائند', 'انسان', 'سپورٹ', 'عملہ', 'ممبر', 'رکن', 'شخص', 'ساتھی', 'اسٹاف', 'بند'];
  const V = ['جوڑ', 'کنیکٹ', 'ٹرانسفر', 'بلا', 'رابط', 'فارورڈ', 'ملا', 'منتقل'];
  const hasH = H.some((x) => tok(x).test(s));
  const hasV = V.some((x) => tok(x).test(s));
  const hasC = /رہا|رہی|رہے|دیا|ابھی|ہوں|دونگا|کروں|گیا|گئی|گئے|چکا|چکی/.test(s) || /(?:گا|گی|گے)(?![\u0600-\u06FF])/.test(s);
  if (/ملے\s*گا|ملے\s*گی|ملیں\s*گے/.test(s) && /آپ\s*سے|رکن|ممبر|ایجنٹ|انسان|شخص|اسٹاف|عملہ|ساتھی|نمائند/.test(s)) return true;
  return hasH && hasV && hasC;
}

function t801Arabic(s) {
  if (/لا\s*يمكن|لا\s*أستطيع|لا\s*استطيع|لن|لم\s|ليس|هل|إذا|اذا/.test(s)) return false;
  if (/\?\s*$/.test(s)) return false;
  const H = /فريق|وكيل|موظف|زميل|الدعم|شخص|أحد|ممثل|بشري|مسؤول|العملاء|مختص/;
  const V = /تحويل|إيصال|ايصال|أوصلك|اوصلك|توصيل|تواصل|يتواصل|سيتواصل|ينضم|سينضم|انضم|إحالة|احالة|أحيلك|احيلك|نحيلك|سأحول|سنحول|أحولك|احولك|ربط|تصعيد/;
  const C = /سوف|جاري|يجري|الآن|سيتم|قمت|(?<![\u0600-\u06FF])تم(?![\u0600-\u06FF])|(?<![\u0600-\u06FF])س[أنيت]/;
  // "قمت بتصعيد" is a completed escalation even when the human noun is only implied.
  if (/تصعيد/.test(s) && /قمت|أقوم|اقوم|سأقوم|سنقوم|سوف|سيتم|(?<![\u0600-\u06FF])تم(?![\u0600-\u06FF])/.test(s)) return true;
  return H.test(s) && V.test(s) && C.test(s);
}

function t801French(s) {
  const cue = /[àâçéèêëîïôùûüœ]/i.test(s) ||
    /\b(je|tu|nous|vous|ils|elles|vais|allez|allons|une|des|les|dans|avec|vers|chez|aux|cette|mon|ma)\b/i.test(s) ||
    /\b(equipe|conseiller|collegue|interlocuteur|responsable|laissez|bascul)\b/i.test(s);
  if (!cue) return false;
  if (/\bne\b|\bn['’]/i.test(s) && /\bpas\b/i.test(s)) return false;
  if (/\b(peux|pouvez|pourrais|pourriez|pouvons|souhaitez|voulez|puis-je)\b/i.test(s)) return false;
  if (/\bsi\s+(vous|tu|besoin)\b/i.test(s)) return false;
  if (/\?\s*$/.test(s)) return false;
  const B = "(?<![A-Za-z0-9_\\u00C0-\\u017F])";
  const E = "(?![A-Za-z0-9_\\u00C0-\\u017F])";
  const H = new RegExp(B + "(?:conseill(?:er|ère|ere)s?|agents?|[eé]quipes?|equipes?|coll[eè]gues?|quelqu['’]un|humains?|membres?|op[eé]rateurs?|sp[eé]cialistes?|service\\s+client|assistances?|responsables?|interlocuteurs?|interlocutrices?|charg[eé]s?|support)" + E, "i");
  const splitRel = "(?:mets?|mettre|mettons|mettrai|mettra|mettras|mettrons|mettrez|mettront)[^.]{0,70}?en\\s+relation";
  const V = new RegExp(B + "(?:transf[eèé]r\\w*|transfer\\w*|" + splitRel + "|connect\\w*|contact\\w*|recontact\\w*|rejoindre|rejoint\\w*|passe(?:r|z)?\\s+la\\s+main|passe(?:r|z)?\\s+[aà]|redirig\\w*|escalad\\w*|transmet\\w*|prend(?:re|s|ra)?\\s+le\\s+relais|bascul\\w*|r[eé]pond\\w*)" + E, "i");
  const C = /\b(je\s+vais|nous\s+allons|on\s+va|vais|allons|je\s+vous|nous\s+vous|vous\s+serez|vous\s+allez|en\s+train|laissez-moi|laisse-moi|permettez-moi)\b|\b(je|nous|on)\s+(?:vous\s+)?(?:transf|met|passe|contact|bascul|redirig|escalad|r[eé]pond)/i;
  const C3 = /\bva(?:is|ont)?\s+(?:vous\s+)?(?:transf|prendre|rejoindre|contact|mettre|passer|bascul|redirig)/i;
  const Cfut = new RegExp(B + "(?:transf[eèé]r|transfer|contact|recontact|r[eé]pond|repond|escalad|rejoind|mettr|bascul|transmet|redirig)\\w*(?:rai|ras|ra|rons|rez|ront)" + E, "i");
  return H.test(s) && V.test(s) && (C.test(s) || C3.test(s) || Cfut.test(s));
}

function t801Fold(s) {
  return String(s || '').normalize('NFD').replace(/\p{M}/gu, '');
}

function t801Es(raw) {
  const s = t801Fold(raw);
  if (!/\b(?:voy a|vamos a|va a|estoy|estamos|usted|equipo|agente|companer\w*|colega|deriv\w*|soporte|asesor\w*|especialista)\b/i.test(s)) return false;
  if (/\b(?:no\s+(?:puedo|podemos|voy|vamos|he|hemos)|sin que|si\s+(?:quieres|quiere|desea|usted|necesitas))\b/i.test(s)) return false;
  if (/[?]/.test(s)) return false;
  if (/\b(?:puedo|podemos|podria|podriamos|quieres|quiere|gustaria)\b/i.test(s) && !/\b(?:voy a|vamos a|he |hemos |estoy|estamos)\b/i.test(s)) return false;
  if (/\b(?:actualiz\w*|public\w*|revis\w*)\b/i.test(s)) return false;
  const H = /\b(?:equipos?|agentes?|companeros?|colegas?|especialistas?|humanos?|personas?|soporte|asesores?|representantes?|miembros?|operadores?)\b/i;
  const V = /\b(?:transfer\w*|conect\w*|escal\w*|deriv\w*|contact\w*|respond\w*|pasar(?:e|a|emos|an)|paso|pondr\w+\s+en contacto|poner\w*\s+en contacto|pongo en contacto)\b/i;
  const C = /\b(?:voy a|vamos a|va a|estoy|estamos|ahora|ya)\b|\b(?:he|hemos)\s+\w+|\b(?:contact|transfer|escal|deriv|respond|conect|pas)\w*(?:re|ra|remos|ran)\b/i;
  return H.test(s) && V.test(s) && C.test(s);
}

function t801Pt(raw) {
  const s = t801Fold(raw);
  if (!/\b(?:vou|vamos|vai|voce|equipe|encaminh\w*|nao)\b/i.test(s)) return false;
  if (/\b(?:nao\s+(?:posso|podemos|vou|vamos)|se\s+(?:voce|quiser|precisar))\b/i.test(s)) return false;
  if (/\?\s*$/.test(s)) return false;
  if (/\b(?:posso|podemos|poderia|quer|gostaria)\b/i.test(s) && !/\b(?:vou|vamos|vai|estou|estamos|ja)\b/i.test(s)) return false;
  if (/\b(?:atualiz\w*|public\w*|revis\w*)\b/i.test(s)) return false;
  const H = /\b(?:equipes?|agentes?|colegas?|especialistas?|humanos?|pessoas?|suporte|atendentes?|representantes?|membros?|operadores?)\b/i;
  const V = /\b(?:transfer\w*|encaminh\w*|conect\w*|escal\w*|contact\w*|contat\w*|respond\w*|passar|passo)\b/i;
  const C = /\b(?:vou|vamos|vai|estou|estamos|agora|ja)\b|\b(?:encaminh|transfer|conect|escal|contact|contat|respond|pass)\w*(?:rei|ra|remos|rao|ei)\b/i;
  return H.test(s) && V.test(s) && C.test(s);
}

function t801It(raw) {
  const s = t801Fold(raw);
  if (!/\b(?:collega|colleghi|inoltr\w*|trasfer\w*|adesso|sto per|ti contatt\w*|ti trasfer\w*|operatore|specialista)\b/i.test(s)) return false;
  if (/\b(?:non\s+(?:posso|possiamo|ho|ti|trasfer|inoltr|collego)|se\s+(?:vuoi|vuole|desidera|preferisci))\b/i.test(s)) return false;
  if (/\?\s*$/.test(s)) return false;
  if (/\b(?:posso|possiamo|potrei|vuoi|vorrei)\b/i.test(s) && !/\b(?:sto|vado|ho\s+\w+|adesso)\b/i.test(s)) return false;
  if (/\b(?:aggiorn\w*|pubblich\w*)\b/i.test(s)) return false;
  const H = /\b(?:team|agentes?|colleg(?:a|hi|he)|specialist[ai]|uman[oi]|person[ae]|supporto|operator[ei]|membri|membro|consulent[ei])\b/i;
  const V = /\b(?:trasfer\w*|inoltr\w*|colleg(?:are|ato|ati|ando|o|hiamo)|pass(?:o|are|ato|iamo)|escal\w*|contatt\w*|metter\w*\s+in contatto|in contatto)\b/i;
  const C = /\b(?:sto\s+|vado a|ti\s+|adesso|ora|ho\s+\w+)\b|\b(?:trasfer|inoltr|colleg|contatt|pass|escal)\w*(?:ro|ra|remo|rete)\b/i;
  return H.test(s) && V.test(s) && C.test(s);
}

function t801De(raw) {
  const s = t801Fold(raw);
  if (!/\b(?:werde|werden|weiterleit\w*|mitarbeiter\w*|kolleg\w*|verbinden|durchstell\w*|eskaliere\w*)\b/i.test(s)) return false;
  if (/\bnicht\s+(?:weiter|eskal|verbind|kontakt|an\s+)|\bkein(?:e|en|em)?\s+(?:kolleg|mitarbeiter|menschen|agent)/i.test(s)) return false;
  if (/\b(?:wenn|falls)\b/i.test(s)) return false;
  if (/\?\s*$/.test(s)) return false;
  if (/\b(?:kann|konnte|mochte)\b/i.test(s) && !/\bwerde\b/i.test(s)) return false;
  if (/\b(?:aktualis\w*|veroffentlich\w*|uberarbeit\w*)\b/i.test(s)) return false;
  const H = /\b(?:teams?|kolleg(?:e|in|en|innen)?|mitarbeiter(?:in|n)?|menschen|agenten?|spezialist(?:en|in)?|support|berater(?:in|n)?|sachbearbeiter(?:in|n)?)\b/i;
  const V = /\b(?:weiterleit\w*|eskaliere\w*|verbind\w*|durchstell\w*|ubergeb\w*|kontaktiere\w*|melde\w*)\b/i;
  const C = /\b(?:werde|werden|wird|gerade|jetzt|habe|haben|sofort)\b/i;
  return H.test(s) && V.test(s) && C.test(s);
}

function t801Multilingual(text) {
  const s = t801Norm(text);
  if (!s) return false;
  if (/[\u0900-\u097F]/.test(s)) return t801Hindi(s);
  if (/[\u0600-\u06FF]/.test(s)) {
    if (/[ٹڈڑںےھچگپژ]/.test(s)) return t801Urdu(s);
    return t801Arabic(s);
  }
  if (t801French(s)) return true;
  if (t801Roman(s)) return true;
  if (t801Es(s) || t801Pt(s) || t801It(s) || t801De(s)) return true;
  return false;
}

function isPureDocumentFuture(s) {
  const re = /\b(?:our|the|their|my|support|specialists?|agents?|staff|they|we|team)\b[^.!?]{0,48}?\b(?:will|shall|going\s+to|'ll)\s+(?:now\s+|soon\s+|just\s+)?(?:be\s+)?(?:updat\w*|revis\w*|refresh\w*|rewrit\w*|publish\w*|redesign\w*|chang\w*|edit\w*|improv\w*|launch\w*|releas\w*|review\w*|check\w*|verif\w*|confirm\w*|look\s+at|repl\w*|respond\w*)\b([^.!?]{0,80})/i;
  const m = String(s || '').match(re);
  if (!m) return false;
  const obj = m[1] || '';
  if (/\b(?:you|your\s+(?:case|ticket|request|issue|account|chat|order|payout)|client|customer)\b/i.test(obj)) return false;
  if (!/\b(?:faq|articles?|pages?|docs?|documentation|polic(?:y|ies)|guides?|websites?|sites?|pricing|rules?|dashboards?|help\s*centers?|contents?|wordings?|hours|schedules?|features?|products?|apps?|posts?|handbooks?|catalogs?|blogs?|copy|tool)\b/i.test(obj)) return false;
  const rest = String(s).replace(m[0], ' ');
  if (/\b(?:i|we)(?:'ll|\s+will)\s+(?:get|connect|transfer|escalate|forward|hand|loop|pull|bring|fetch|page|ping|bridge)\b/i.test(rest)) return false;
  if (/\blet\s+me\b/i.test(rest) && /\b(?:teammate|agent|human|specialist|colleague)\b/i.test(rest)) return false;
  return true;
}

function isProcessDescription(s) {
  return /\b(?:transferring|connecting|passing|handing|getting|moving|sending)\b/i.test(s) &&
    /\b(?:takes|requires|needs|means|involves)\b/i.test(s) &&
    !/\b(?:transferring|connecting|passing|handing)\s+you\b/i.test(s);
}

function isOwnershipNotHandoff(s) {
  return /\b(?:transferr\w*|mov\w*|send\w*|pass\w*)\s+(?:ownership|funds|money|(?:an?\s+|the\s+|your\s+)?(?:account|balance|payment|payout|profit|challenge))\b/i.test(s) &&
    !/\b(?:transferr\w*|connect\w*|hand\w*)\s+you\b/i.test(s);
}

function isNonHandoffShape(s) {
  return isPureDocumentFuture(s) || isProcessDescription(s) || isOwnershipNotHandoff(s);
}

// "support article", "team schedule", "support number" — the noun is a thing, not a person being fetched.
function institutionalThingOnly(s) {
  if (!/\b(?:support|team|staff)\s+(?:number|article|articles|page|pages|schedule|hours|portal|site|website|email|address|center|centre|docs|documentation|faq|guide|policy|policies|directory|handbook|inbox|queue|channel|roster|meeting|name|id)\b/i.test(String(s || '')) &&
      !/\b(?:help|service|support)\s+desk\s+(?:page|pages|hours|schedule|number|article|articles|site|portal|email|guide)\b/i.test(String(s || ''))) return false;
  if (commitmentHandoff(s)) return false;
  return true;
}

function isYouConditional(s) {
  if (!/\bif\s+(?:you|you'd|needed|necessary)\b/i.test(String(s || ''))) return false;
  if (/\b(?:i|we)(?:['’]ve|\s+have)\s+(?:already\s+)?(?:forwarded|escalated|sent|passed|pinged|notified|asked|assigned|looped|shared|flagged|raised|connected|transferred)\b/i.test(s)) return false;
  return true;
}

function commitmentHandoff(sentence) {
  const s = String(sentence || '');
  if (!s.trim()) return false;
  if (isQuestion(s) || opensWithProcessConditional(s) || customerMustActFirst(s) || isReportedSpeech(s)) return false;
  if (isNonHandoffShape(s) || isYouConditional(s)) return false;
  if (t801English(s)) return true;
  if (t801Multilingual(s)) return true;
  return false;
}

function structuralClaimV3(sentence) {
  const s = claimView(normalizeClaimText(sentence));
  if (!s.trim()) return false;
  if (isNonHandoffShape(s) || isYouConditional(s) || institutionalThingOnly(s)) return false;
  if (structuralClaimV3Legacy(s)) return true;
  if (commitmentHandoff(s)) return true;
  return false;
}


const TRUTHFUL_NO_HANDOFF_FALLBACK =
  "I can't confirm that specific case from here, and it has not been passed to a teammate.";

// Used when a human teammate already owns the ticket. Same first clause, without the denial.
const OWNED_TICKET_FALLBACK = "I can't confirm that specific case from here.";

const SOMEONE_WILL_RE =
  /\bsomeone\s+will\s+(?:be\s+in\s+touch(?:\s+soon)?|get\s+back(?:\s+to)?(?:\s+you)?)\b/i;

function claimsAllowed(status) {
  return CLAIM_ALLOWED.has(String(status || ''));
}

function normalizeStatus(status, ok) {
  const s = String(status || '');
  if (HANDOFF_STATUSES.indexOf(s) >= 0) return s;
  return ok ? 'note_and_assigned' : 'none';
}

/**
 * Proven outcome of this turn. Ownership already active allows a claim even when
 * this turn did not create a new note. A failed attempt with no ownership is `failed`.
 */
function resolveHandoffStatus(facts) {
  const f = facts || {};
  const note = !!f.noteOk;
  const assign = !!f.assignOk;
  if (note && assign) return 'note_and_assigned';
  if (note) return 'note_created';
  if (assign) return 'assigned';
  if (f.ownershipActive) return 'already_active';
  if (f.attempted) return 'failed';
  return 'none';
}

function statusFromOpts(opts) {
  const o = opts || {};
  if (o.handoffStatus && HANDOFF_STATUSES.indexOf(o.handoffStatus) >= 0) return o.handoffStatus;
  if (o.handoffSucceeded) return 'note_and_assigned';
  return 'none';
}

function legacyNegated(sentence) {
  const s = String(sentence || '');
  return (
    /\b(?:not|never|no|haven['\u2019]t|have\s+not|did\s+not|didn['\u2019]t|cannot|can['\u2019]t|without)\b(?:\s+\w+){0,5}\s+(?:forward|pass|escalat|sent|send|ask|assign|notif|inoltr|pasad|transmis|weitergeleitet|encaminh)/i.test(s) ||
    /\bnon\s+(?:ho|abbiamo)\s+(?:inoltrat|passat)/i.test(s) ||
    /\bno\s+(?:he|hemos)\s+(?:pasado|enviado|escalado|derivado)/i.test(s) ||
    /\bje\s+n['\u2019]ai\s+pas\b/i.test(s) ||
    /\b(?:nicht\s+weitergeleitet|nicht\s+eskaliert)\b/i.test(s) ||
    /\bn[a\u00e3]o\s+(?:encaminhei|escalei|passei)\b/i.test(s) ||
    /\b(?:has|have)\s+not\s+been\s+(?:passed|forwarded|escalated|sent)\b/i.test(s) ||
    /\bit\s+has\s+not\s+been\s+passed\b/i.test(s)
  );
}

function handoffNegated(sentence) {
  const s = String(sentence || '');
  return (
    legacyNegated(s) ||
    /\bniet\s+(?:doorgestuurd|doorgezet|doorgegeven)\b/i.test(s) ||
    /\bniet\b[^.!?]{0,30}\bdoor\b/i.test(s) ||
    /n['\u2019]a\s+pas\s+[\u00e9e]t[\u00e9e]\s+transmis/i.test(s) ||
    /n[a\u00e3]o\s+(?:foi\s+encaminhad|vou\s+(?:encaminhar|escalar|passar))/i.test(s) ||
    /\bnon\s+(?:inoltro|passo|giro)\b/i.test(s) ||
    /\bno\s+(?:reenv[\u00edi]o|paso|derivo|escalo)\b/i.test(s)
  );
}

// r83 detectors, with r83 negation only. Opener and question marks do not apply.
function legacyIsHandoffClaim(sentence) {
  const s = String(sentence || '').trim();
  if (!s) return false;
  if (legacyNegated(s)) return false;
  if (HANDOFF_CLAIM_RE.test(s)) return true;
  if (DEPENDENT_PROMISE_RE.test(s)) return true;
  if (HANDOFF_ACTION_RE.test(s)) return true;
  return false;
}

/**
 * Evidence-backed multilingual claims (NL/IT/ES/FR/PT + EN causative).
 * Each alternative is anchored to a handoff verb plus an object or target.
 * Probe sentences informed these patterns; held-out controls live in the selftest.
 */
function evidenceMultilingualClaim(sentence) {
  const s = String(sentence || '');
  const objectRe = /\b(?:vraag|verzoek|aanvraag|ticket|zaak|melding|dit|het)\b/i;
  const targetRe = /\b(?:team|collega|afdeling|controle|risk|finance|support|specialist)\b/i;
  const separable =
    (/\b(?:ik|we|wij)\s+(?:stuur|zet|geef|leg)\b[^.!?]{0,80}\bdoor\b/i.test(s) ||
      /\b(?:ik|we|wij)\s+leg\b[^.!?]{0,80}\bvoor\b/i.test(s)) &&
    objectRe.test(s) &&
    targetRe.test(s);
  if (separable) return true;
  // Passive forwarding needs a request/ticket object and a team target.
  // "wordt doorgestuurd naar je wallet" and "is doorgestuurd naar je spammap" are process lines.
  if (
    /\b(?:is|wordt|werd)\s+(?:al\s+)?(?:doorgestuurd|doorgezet|doorgegeven|ge[e\u00eb]scaleerd)\b/i.test(s) &&
    objectRe.test(s) &&
    targetRe.test(s)
  ) return true;
  // "krijg je hier" is the probe form. "krijg je een bericht per e-mail" is not a handoff.
  if (/\bkrijg\s+je\s+hier\s+(?:een\s+)?(?:update|bericht|reactie|antwoord)\b/i.test(s)) return true;
  if (/\b(?:een\s+)?collega\b[^.!?]{0,40}\b(?:neemt|zal|gaat)\b[^.!?]{0,40}\bcontact\b/i.test(s)) return true;
  if (
    /\b(?:we|wij|het\s+team|ze)\s+laten?\s+(?:je|u)\s+(?:het\s+)?weten\b/i.test(s) &&
    objectRe.test(s) &&
    targetRe.test(s)
  ) return true;
  // Present "inoltro" only with a request object and a team target. Bare "inoltro" is not a claim.
  if (
    /\binoltro\b/i.test(s) &&
    /\b(?:richiesta|pratica|segnalazione)\b/i.test(s) &&
    /\b(?:team|supporto|collega|specialista)\b/i.test(s)
  ) return true;
  if (/\b(?:passo|giro)\s+(?:la|il)\s+(?:richiesta|pratica|segnalazione)\b/i.test(s)) return true;
  if (/\b(?:reenv[\u00edi\u00ed]o|paso|derivo|escalo)\s+(?:tu|su|la|el)\s+(?:solicitud|consulta|caso|pregunta)\b/i.test(s)) return true;
  if (
    /\b(?:est|a\s+(?:d[\u00e9e]j[a\u00e0]\s+)?[\u00e9e]t[\u00e9e])\s+(?:d[\u00e9e]j[a\u00e0]\s+)?transmise?s?\b/i.test(s) &&
    /\b(?:dossier|demande|requ[e\u00ea]te|ticket|cas)\b/i.test(s) &&
    /(?:[\u00e9e]quipe|membre|support|coll[\u00e8e]gue|sp[\u00e9e]cialiste)/i.test(s)
  ) return true;
  if (/\bje\s+transmets\b/i.test(s) && /\b(?:dossier|demande|requ[e\u00ea]te|ticket|cas)\b/i.test(s)) return true;
  if (/\b(?:elle|il|l['\u2019]?[\u00e9e]quipe)\s+vous\s+fera\s+un\s+retour\b/i.test(s)) return true;
  if (/\bvou\s+(?:encaminhar|escalar|passar)\b/i.test(s)) return true;
  if (/\b(?:i|we)(?:['\u2019]ll|\s+will)\s+have\s+(?:the\s+|our\s+)?(?:\w+\s+)?team\s+(?:review|check|look|verify|confirm)\b/i.test(s)) return true;
  return false;
}

function isQuestion(sentence) {
  return /\?\s*$/.test(String(sentence || '').trim());
}

function isBareAffirmation(clause) {
  return /^(?:s[i\u00ec\u00ed])\s*[.!?]*$/i.test(String(clause || '').trim());
}

// Conditional and process openers for the NEW future patterns only.
// "Sì," / "Sí," / "Si," is an interjection, not "if". Spanish/Italian "Se" is not an opener.
function opensWithProcessConditional(sentence) {
  const s = String(sentence || '').trim();
  if (/^s[i\u00ec\u00ed]\s*,/i.test(s)) return false;
  return /^(?:if|als|si|wenn|caso|wanneer|once|when|after|unless|as\s+soon\s+as)\b/i.test(s);
}

// A process that happens only after the customer does something is not a handoff claim.
function customerMustActFirst(sentence) {
  const s = String(sentence || '');
  return (
    /\bonly\s+after\s+you\b/i.test(s) ||
    /\bafter\s+you\s+(?:open|submit|send|share|provide|complete|file|create)\b/i.test(s)
  );
}

// Quoted speech is the customer's words, not Luna's claim. Contractions (I'll, 'll) stay.
function textOutsideQuotes(sentence) {
  return String(sentence || '')
    .replace(/"[^"]*"/g, ' ')
    .replace(/\u201c[^\u201d]*\u201d/g, ' ')
    .replace(/\u00ab[^\u00bb]*\u00bb/g, ' ')
    .replace(/(^|[\s([{\u2014-])['\u2018][^'\u2019]*['\u2019](?=$|[\s.,;:!?)\]])/g, '$1 ');
}

function isReportedSpeech(sentence) {
  const s = textOutsideQuotes(sentence);
  return (
    /\b(?:said|told|mentioned|wrote|stated|claimed|says|writes|states|notes|claims|asks|asked)\s+(?:that\s+)?(?:the\s+)?(?:a\s+|an\s+)?(?:support\s+)?(?:agent|teammate|team\s+member|specialist|team|human|colleague|person)\b/i.test(s) ||
    /\b(?:customer|client)\s+said\b/i.test(s) ||
    /\b(?:faq|article|guide|docs|documentation|policy|help\s*center)\s+(?:says|states|notes|claims|mentions)\b/i.test(s) ||
    /\b(?:guide|faq|article|art[ií]culo|articolo|artikel|client|customer|cliente|kunde|docs|documentation|guia|guida)\b[^.!?]{0,48}\b(?:dit|disent|a\s+dit|dijo|ha\s+dicho|dice|disse|ha\s+detto|sagte|schrieb|sagt|diz|कहा|کہا|قال)\b/i.test(sentence) ||
    /\b(?:dit|dijo|disse|sagte|कहा|کہا|قال)\s+(?:que|che|dass|that|कि)\b/i.test(textOutsideQuotes(sentence))
  );
}

function isEntirelyQuoted(s) {
  const t = String(s || '').trim();
  return /^"[^"]+"[.!?]*$/.test(t) || /^“[^”]+”[.!?]*$/.test(t) || /^«[^»]+»[.!?]*$/.test(t);
}

function unwrapQuoted(s) {
  const t = String(s || '').trim().replace(/[.!?]+$/, '');
  const m = t.match(/^"([\s\S]*)"$/) || t.match(/^“([\s\S]*)”$/) || t.match(/^«([\s\S]*)»$/);
  return m ? m[1].trim() : String(s || '');
}

// A quote is someone else's words only when the text outside it reports or attributes it.
// A reply that is itself the quote is still Luna's claim.
function quoteIsAttributed(s) {
  if (isEntirelyQuoted(s) || !/["“«]/.test(s)) return false;
  const outside = textOutsideQuotes(s);
  if (/\b(?:said|wrote|written|told|mentioned|stated|claimed|says|writes|asked|asking|noted|notes|claims|according\s+to|dit|dijo|disse|sagte|schrieb)\b/i.test(outside)) return true;
  if (/\b(?:is|was|were)\s+(?:only\b|an?\s+(?:example|sample|illustration|quote|quotation)|not\s+a\s+promise)\b/i.test(outside)) return true;
  if (/\b(?:customer|client|user|guide|faq|article|he|she|they)\b/i.test(outside) &&
      /\b(?:said|wrote|says|writes|asked|dit|dijo|disse|sagte)\b/i.test(s)) return true;
  return false;
}

function claimView(s) {
  const t = String(s || '').trim();
  if (!t) return t;
  if (isEntirelyQuoted(t)) return unwrapQuoted(t);
  if (quoteIsAttributed(t)) return textOutsideQuotes(t);
  return t;
}

// Completed first-person / past handoffs. Not subject to question or conditional exemptions.
function completedPastClaim(sentence) {
  const s = String(sentence || '');
  if (!s.trim() || handoffNegated(s)) return false;
  if (/\b(?:ik|we|wij)\s+(?:heb|hebben)\b[^.!?]{0,60}\b(?:doorgestuurd|doorgezet|doorgegeven|ge[e\u00eb]scaleerd|voorgelegd)\b/i.test(s)) return true;
  if (/\b(?:he|hemos)\s+reenviado\b/i.test(s)) return true;
  if (
    /\bse\s+ha\s+reenviado\b/i.test(s) &&
    /\b(?:solicitud|caso|consulta|pregunta)\b/i.test(s) &&
    /\b(?:equipo|soporte|team|colega)\b/i.test(s)
  ) return true;
  if (/\bfoi\s+encaminhad[oa]\b/i.test(s)) return true;
  return false;
}

function alwaysClaim(sentence) {
  const s = String(sentence || '').trim();
  if (!s) return false;
  if (legacyIsHandoffClaim(s) || completedPastClaim(s)) return true;
  // A negation that covers the whole sentence stays a non-claim, matching r83.
  if (legacyNegated(s)) return false;
  const parts = s.split(/,\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  return parts.some((p) => {
    const bare = p.replace(/[.!?]+$/, '').trim();
    if (!bare || isBareAffirmation(bare)) return false;
    return legacyIsHandoffClaim(bare) || legacyIsHandoffClaim(bare + '.') || completedPastClaim(bare) || completedPastClaim(p);
  });
}

function newFutureExempt(sentence) {
  const s = String(sentence || '').trim();
  if (!s) return true;
  if (isQuestion(s)) return true;
  if (opensWithProcessConditional(s)) return true;
  if (customerMustActFirst(s)) return true;
  if (isReportedSpeech(s)) return true;
  return false;
}

function matchesNewFuture(sentence) {
  const s = String(sentence || '');
  if (!s.trim() || handoffNegated(s)) return false;
  if (THIRD_PERSON_AGENT_RE.test(s)) return true;
  if (SOMEONE_WILL_RE.test(s)) return true;
  if (FIRST_PERSON_FETCH_RE.test(s)) return true; // T795 CLAIM_GATE_FETCH_V1
  if (FETCH_V2_RE.test(s) && !FETCH_V2_NEGATED_RE.test(s)) return true; // T795 R2 CLAIM_GATE_FETCH_V2
  if (evidenceMultilingualClaim(s)) return true;
  if (structuralClaimV3(s)) return true; // T795 R3 STRUCTURAL_CLAIM_V3
  return false;
}

function sentenceIsHandoffClaim(sentence) {
  const s = claimView(normalizeClaimText(sentence));
  if (!s) return false;
  // Third-party document work and process descriptions are not handoff promises.
  if (isNonHandoffShape(s) || institutionalThingOnly(s)) return false;
  // "I will … if you want" is an offer, same as a leading "if you".
  if (isYouConditional(s)) return false;
  if (alwaysClaim(s)) return true;
  // Exemptions apply only to the new future-tense third-person and passive patterns.
  if (newFutureExempt(s)) return false;
  if (matchesNewFuture(s)) return true;
  return false;
}

function withoutFalseHandoffDenial(text, teammateOwns) {
  const t = String(text || '');
  if (!teammateOwns) return t;
  if (t === TRUTHFUL_NO_HANDOFF_FALLBACK || /\bit has not been passed to a teammate\b/i.test(t)) {
    return OWNED_TICKET_FALLBACK;
  }
  return t;
}

function hasHandoffClaim(text) {
  const raw = normalizeClaimText(text);
  if (!raw) return false;
  if (sentenceIsHandoffClaim(raw)) return true;
  return raw.split(/\n|(?<=[.!?])\s+/).some((part) => sentenceIsHandoffClaim(part));
}

function expandClauses(sentence) {
  const s = String(sentence || '').trim();
  if (!s || !sentenceIsHandoffClaim(s)) return [s];
  const parts = s.split(/,\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return [s];
  const flagged = parts.map((p) => sentenceIsHandoffClaim(p) || sentenceIsHandoffClaim(p + '.'));
  if (flagged.some(Boolean) && flagged.some((f) => !f)) return parts;
  return [s];
}

function clauseIsClaim(part) {
  const p = String(part || '').trim();
  if (!p) return false;
  return sentenceIsHandoffClaim(p) || sentenceIsHandoffClaim(p.replace(/[.!?]+$/, '')) || sentenceIsHandoffClaim(p + '.');
}

function stripSentence(sent) {
  const original = String(sent || '').trim();
  if (!original || !clauseIsClaim(original)) return original;
  const clauses = expandClauses(original);
  if (clauses.length < 2) return '';
  const kept = [];
  for (const c of clauses) {
    if (clauseIsClaim(c) || isBareAffirmation(c)) continue;
    const bare = String(c || '').replace(/[.!?]+$/, '').trim();
    if (bare && !isBareAffirmation(bare)) kept.push(bare);
  }
  if (!kept.length) return '';
  const term = (original.match(/[.!?]+$/) || ['.'])[0];
  const joined = kept.join(', ').replace(/\s{2,}/g, ' ').trim();
  return /[.!?]$/.test(joined) ? joined : joined + term;
}

function stripOnce(text) {
  return String(text || '')
    .split(/\n/)
    .map((line) => {
      if (!hasHandoffClaim(line)) return line;
      const kept = line
        .split(/(?<=[.!?])\s+/)
        .map((sent) => stripSentence(sent))
        .filter(Boolean)
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return /^\s*(?:[-*\u2022]\s*)?$/.test(kept) ? '' : kept;
    })
    .filter((line) => line.trim())
    .join('\n')
    .trim();
}

function stripHandoffClaims(text) {
  const raw = String(text || '');
  let next = stripOnce(raw);
  // Re-check the full remainder. A dependent promise can sit in a clause the first
  // split kept, or a second language form can survive the first pass.
  if (hasHandoffClaim(next)) next = stripOnce(next);
  if (hasHandoffClaim(next)) {
    next = String(next)
      .split(/\n/)
      .filter((line) => !hasHandoffClaim(line))
      .join('\n')
      .trim();
  }
  // A claim-only reply must not go out blank.
  if (!String(next || '').trim() && raw.trim()) return TRUTHFUL_NO_HANDOFF_FALLBACK;
  return next;
}

/**
 * Structural final gate. Claims stay only when status is already_active, note_created,
 * assigned, or note_and_assigned. `handoffSucceeded: true` without a status remains
 * the V1 alias for a proven handoff.
 * @returns {{ text: string, stripped: boolean, hadClaim: boolean, handoffStatus: string, reason?: string }}
 */
function gatePublicHandoffClaims(text, opts) {
  const raw = String(text || '');
  const hadClaim = hasHandoffClaim(raw);
  const handoffStatus = statusFromOpts(opts);
  if (!hadClaim) return { text: raw, stripped: false, hadClaim: false, handoffStatus };
  if (claimsAllowed(handoffStatus)) {
    return { text: raw, stripped: false, hadClaim: true, handoffStatus };
  }
  const next = stripHandoffClaims(raw);
  return {
    text: next,
    stripped: next !== raw.trim(),
    hadClaim: true,
    handoffStatus,
    reason: 'handoff_claim_removed_no_action',
  };
}

/**
 * Account-state work must not be answered as a general FAQ that only promises a handoff.
 * Safe general answers stay on the FAQ path. A numbered account plus a dashboard
 * discrepancy, or this client's own payout/card problem, does not.
 */
function looksLikeAccountStateDiscrepancy(text) {
  const t = String(text || '');
  if (!/\b\d{5,8}\b/.test(t)) return false;
  if (!/\b(?:account|conto|cuenta|compte|konto)\b/i.test(t)) return false;
  return /\b(?:while|whereas|however|but|discrepan|mismatch|does\s+not\s+match|doesn't\s+match|still\s+have\s+to|dashboard|shows?)\b/i.test(t);
}

function blocksGeneralFaqNoNote(latest, priorTexts) {
  const blob = [latest].concat(priorTexts || []).map((x) => String(x || '')).join('\n');
  if (!blob.trim()) return false;
  if (looksLikeAccountStateDiscrepancy(blob)) return true;
  if (/\bhow\s+(?:do|can|should|would)\s+i\b|\bhow\s+to\b/i.test(blob)) return false;
  if (
    /\b(?:i\s+(?:have|had)\s+requested|my)\b/i.test(blob) &&
    /\b(?:payout|payment|withdrawal)\b/i.test(blob) &&
    /\b(?:card|rise|cancell?ed|not\s+showing|what\s+can\s+be\s+done)\b/i.test(blob)
  ) {
    return true;
  }
  return false;
}

/** Pending-work language for review eligibility (includes false public handoff claims). */
function isPendingHandoffLanguage(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (hasHandoffClaim(t)) return true;
  return (
    /\b(?:i am|i'm|we are|we're)\s+check(?:ing)?\b/i.test(t) ||
    /\b(?:i'll|i will|we will|we'll)\s+(?:check|look|review|investigate|escalate|forward|update|ask|verify|confirm)\b/i.test(t) ||
    /\blet me (?:check|look|ask|escalate|confirm|verify)\b/i.test(t) ||
    /\blooking into\b/i.test(t) ||
    /\bget back to you\b/i.test(t) ||
    /\bunder review\b/i.test(t) ||
    /\bstill (?:reviewing|checking|looking|processing|waiting)\b/i.test(t) ||
    /\bwaiting (?:for|on) (?:the )?(?:team|finance|backend|approval|verification|support|teammate)\b/i.test(t) ||
    /\bonce (?:the team|we|finance|they|support|a teammate) (?:confirm|reply|finish|complete|verify)\b/i.test(t)
  );
}

/**
 * Client deferred an open issue to support / said they will come back — conversation not closed.
 */
function clientDeferredToSupport(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  return (
    /\b(?:i(?:['\u2019]ll| will)|we(?:['\u2019]ll| will)|gonna|going to)\s+(?:come\s+back|return|check\s+(?:back\s+)?(?:with|on)|follow\s+up)\b/i.test(t) ||
    /\bcome\s+back\s+to\s+check\b/i.test(t) ||
    /\bcheck\s+(?:with\s+)?(?:the\s+)?(?:support\s+)?(?:team|teammate)\b/i.test(t) ||
    /\bwait(?:ing)?\s+for\s+(?:the\s+)?(?:support\s+)?(?:team|teammate|human)\b/i.test(t)
  );
}

/**
 * Luna left an unresolved verification / platform / timezone issue in public text.
 */
function lunaLeftIssueOpen(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (isPendingHandoffLanguage(t)) return true;
  // Admitted inability + pending topic (timezone / platform) without resolution.
  if (/\bi can['\u2019]?t confirm\b/i.test(t) && /\b(?:timezone|time\s*zone|platform|utc|matchtrader|metatrader|mt5|tradelocker)\b/i.test(t)) {
    return true;
  }
  return false;
}

module.exports = {
  HANDOFF_STATUSES,
  HANDOFF_CLAIM_RE,
  HANDOFF_ACTION_RE,
  DEPENDENT_PROMISE_RE,
  FIRST_PERSON_FETCH_RE,
  FETCH_V2_RE,
  structuralClaimV3,
  TRUTHFUL_NO_HANDOFF_FALLBACK,
  OWNED_TICKET_FALLBACK,
  withoutFalseHandoffDenial,
  claimsAllowed,
  normalizeStatus,
  resolveHandoffStatus,
  hasHandoffClaim,
  stripHandoffClaims,
  gatePublicHandoffClaims,
  looksLikeAccountStateDiscrepancy,
  blocksGeneralFaqNoNote,
  isPendingHandoffLanguage,
  clientDeferredToSupport,
  lunaLeftIssueOpen,
};
