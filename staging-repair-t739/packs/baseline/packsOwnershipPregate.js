'use strict';
/**
 * Elite Packs — deny-by-default ownership / account-status gate (t728).
 *
 * Structural invert (not a cue-table / phrase patch):
 *  1. Always extract features + stance / item / account-status / general-structure.
 *  2. Always return a typed decision.
 *  3. Product SELECTORS / shortcuts / ML may run ONLY when
 *     productSelectPermitted(gate) === true.
 *  4. Default: first-person / possessive / implicit-subject stance (any
 *     language/script) + (Packs item OR account-status term) => PERSONAL
 *     refuse, UNLESS the message is unambiguously a general product-
 *     information question (positive STRUCTURE allow-list).
 *  5. Missing / uncertain / thrown gate => fail-closed (AMBIGUOUS).
 *  6. Never add possession verbs (e.g. "pull") to close paraphrases.
 *     "Did I" + named card is enough under the invert.
 *
 * FEATURE_TABLE below is retained for selector-helper compatibility.
 * decideInner does not use possessionStrong conjunctions.
 */

const KIND = Object.freeze({
  PERSONAL: 'personal-account-status',
  REFUND: 'refund',
  MISSING: 'missing-item',
  AMBIGUOUS: 'ambiguous-account-status',
  NOT_PERSONAL: 'not-personal',
});

const NAMED_CARD_RE =
  /\b(?:instant\s*override|lifetime\s*split|open\s*season|founder'?s?\s*key|the\s*million|primordial)\b/i;

const PACKS_ITEM_RE =
  /\b(?:pack|card|credits?|exotic|million|inventory|collection|subscription|ownership|instant\s*override|lifetime\s*split|founder'?s?\s*key|open\s*season|primordial|whale|oracle|ignition|cartas?|cr[eé]ditos?|paquete|pacote)\b|اووررائیڈ|کریڈٹ|پیک|کارڈ|कार्ड|क्रेडिट|पैक/i;

/** Feature table — retained for extractFeatures / selector helpers. Not the invert. */
const FEATURE_TABLE = Object.freeze([
  {
    name: 'firstPersonEn',
    group: 'stance',
    test: (t) =>
      /\b(?:i|i'm|i am|we|me|my|mine|myself|us|our|ours)\b/i.test(t),
  },
  {
    name: 'firstPersonRuHi',
    group: 'stance',
    test: (t) =>
      /\b(?:main|maine|mujhe|mujh|hum|ham|mere|meri|mera|hamari|hamara|hamare)\b/i.test(t),
  },
  {
    name: 'firstPersonEsPt',
    group: 'stance',
    test: (t) =>
      /(?:^|[^\w])(?:yo|tengo|tenemos|tienes|poseo|confirmo|mi|mis|m[ií]o|nuestra|nuestro|eu|tenho|temos|possuo|meu|minha|meus|minhas)\b/i.test(
        t
      ),
  },
  {
    name: 'firstPersonScript',
    group: 'stance',
    test: (t) => /میرا|میرے|میری|میں\s*نے|मेरा|मेरे|मेरी|क्या\s*मैंने/.test(t),
  },
  {
    name: 'possessive',
    group: 'stance',
    test: (t) =>
      /\b(?:my|mine|our|ours|mera|meri|mere|hamari|hamara|mi|mis|meu|minha|minhas)\b/i.test(t) ||
      /میرا|میرے|میری|मेरा|मेरे|मेरी/.test(t),
  },
  {
    name: 'confirmCheck',
    group: 'stance',
    test: (t) =>
      /\b(?:confirm(?:a|o|e)?|check|verify|validate|look\s*up|batao|bata\s*do)\b/i.test(t) ||
      /\b(?:confirm|check)\s+karo\b/i.test(t),
  },
  {
    name: 'statusQuestion',
    group: 'stance',
    test: (t) =>
      /\b(?:ya\s*nahi|hai\s*kya|hai\s*ke\s*nahi|or\s+not|right\??|yet\??|already|ativo|activa|active|exist\s+karta)\b/i.test(
        t
      ) ||
      /\bunlocked\s+hai\b/i.test(t) ||
      /ہے\s*\؟|है\s*क्या|है\s*\?/.test(t),
  },
  {
    name: 'ownVerb',
    group: 'possession',
    test: (t) =>
      /\b(?:own|owned|owns|possess|possesses|possessed|possession|poseo|possuo|hold|holds|held)\b/i.test(t) ||
      /حاصل\s*کیا/.test(t),
  },
  {
    name: 'theirOwnIdiom',
    group: 'catalog',
    test: (t) => /\b(?:their|its|his|her)\s+own\b/i.test(t) || /\bhave\s+their\s+own\b/i.test(t),
  },
  {
    name: 'unlockVerb',
    group: 'possession',
    test: (t) =>
      /\b(?:unlock(?:ed|s)?|unloked|desbloquead[oa]|desbloqueei)\b/i.test(t) ||
      /\bunlock\s+hua\b/i.test(t) ||
      /آنلاک|انلاک|अनलॉक/.test(t),
  },
  {
    name: 'receiveVerb',
    group: 'possession',
    // Intentionally does NOT list "pull" — invert must not need that verb.
    test: (t) =>
      /\b(?:receive[d]?|got|gotten|pulled|granted|credited|landed|applied|recebi|recebeu|recib[ií]|otorgaron|otorgad[oa]|mil\s+gaya|mil\s+gayi|mil\s+chuka|aa(?:ya|yee|yi)?\s+hai|le\s+liya)\b/i.test(
        t
      ) || /مل\s*گیا|مل\s*چکا|मिल\s*गया/.test(t),
  },
  {
    name: 'didIReceiveOwn',
    group: 'possession',
    test: (t) => {
      const stripped = String(t || '').replace(
        /\bhow\s+(?:do|can|to)\s+(?:i|we)\b(?:\s+\w+){0,6}\s+(?:get|got|receive|unlock|obtain)\b/gi,
        ' '
      );
      return (
        /\b(?:do|did|does|have|has)\s+(?:i|we)\b(?:\s+\w+){0,5}\s+(?:get|got|gotten|receive|received|unlock|unlocked|own|owned|hold|held|possess|have)\b/i.test(
          stripped
        ) ||
        /\b(?:i|we)\s+own\b/i.test(t) ||
        /\bconfirm\s+(?:that\s+)?(?:i|we)\s+own\b/i.test(t) ||
        (/\bdo\s+i\s+have\b/i.test(stripped) && !/\bhow\s+do\s+i\b/i.test(t))
      );
    },
  },
  {
    name: 'ruPossessiveCopula',
    group: 'possession',
    test: (t) =>
      /\b(?:mera|meri|mere)\s+hai\b/i.test(t) ||
      /میرا\s*ہے|मेरा\s*है/.test(t),
  },
  {
    name: 'ruTookReceived',
    group: 'possession',
    test: (t) =>
      (/\b(?:maine|main)\b(?:\s+\w+){0,6}\s+(?:liya|liye|paye|paaya)\b/i.test(t) &&
        !/\bke\s+liye\b/i.test(t)) ||
      /\bkya\s+maine\b/i.test(t) ||
      /क्या\s*मैंने|मैंने[\s\S]{0,40}लिया|میں\s*نے[\s\S]{0,40}(?:لیا|حاصل)/.test(t),
  },
  {
    name: 'ruCompletedReceive',
    group: 'possession',
    test: (t) =>
      /\b(?:mil\s+gaya|mil\s+gayi|mil\s+chuka|aa(?:ya|yee|yi)?\s+hai|le\s+liya)\b/i.test(t) ||
      /مل\s*گیا|मिल\s*गया/.test(t),
  },
  {
    name: 'esPtPossess',
    group: 'possession',
    test: (t) =>
      /(?:^|[^\w])(?:tengo|tenemos|tienes|tenho|temos|poseo|possuo)\b/i.test(t) ||
      /(?:^|[^\w])(?:es\s+m[ií]o|[ée]\s+meu)\b/i.test(t),
  },
  {
    name: 'personalCanIGet',
    group: 'possession',
    test: (t) =>
      /\bcan i\b.{0,40}\b(?:get|receive|own|qualify|unlock)\b/i.test(t) &&
      !/\b(?:refund|cancel|convert|redeem|buy|purchase|kharid|withdraw|cash\s*out)\b/i.test(t),
  },
  {
    name: 'inventoryLocation',
    group: 'possession',
    test: (t) => {
      const locus =
        /\b(?:inventory|inventario|invent[aá]rio|collection|colecci[oó]n|cole[cç][aã]o|account|cuenta|conta|profile|dashboard)\b/i.test(
          t
        );
      const poss =
        /\b(?:my|mere|meri|mera|mi|mis|meu|minha)\b/i.test(t) || /میرے|میری|میرا|मेरे|मेरी|मेरा/.test(t);
      return (
        (locus && poss) ||
        /\b(?:in|on|sitting\s+in)\s+my\s+(?:account|inventory|collection|packs?|profile|dashboard|challenge)\b/i.test(
          t
        ) ||
        /\bmere\s+paas\b/i.test(t) ||
        /\ben\s+mi\s+(?:cuenta|inventario|colecci[oó]n|desaf[ií]o)\b/i.test(t) ||
        /\bna\s+minha\s+(?:conta|invent[aá]rio|cole[cç][aã]o)\b/i.test(t) ||
        /(?:^|[^\w])(?:no\s+invent[aá]rio|en\s+el\s+inventario)\b/i.test(t) ||
        /میرے\s*پاس|मेरे\s*पास/.test(t)
      );
    },
  },
  {
    name: 'eligibilityCue',
    group: 'possession',
    test: (t) =>
      /\b(?:am i|do i|kya\s+main|main)\b.{0,48}\b(?:eligible|qualify|qualified)\b/i.test(t) ||
      /\b(?:eligible|qualify|qualified)\s+hoon\b/i.test(t) ||
      /(?:soy|somos)\s+elegible/i.test(t) ||
      /(?:sou|somos)\s+elegív?el/i.test(t) ||
      /اہل|مستحق/.test(t),
  },
  {
    name: 'balanceCue',
    group: 'possession',
    test: (t) => {
      const credits = /\b(?:pack\s*)?credits?\b|کریڈٹ|क्रेडिट/i.test(t);
      if (!credits) return false;
      if (/\b(?:cost|price|ka\s+hai\s+cost|precio|preço)\b/i.test(t) && !/\b(?:left|remaining|bachi|baaki|mere\s+paas|do i have)\b/i.test(t)) {
        return false;
      }
      return (
        /\b(?:how\s*many|how\s*much|balance|left|remaining|what's\s+left|whats\s+left)\b/i.test(t) ||
        /\b(?:kitne|bachi|bache|baaki|bachay|quantos|cu[aá]ntos|quedan|ainda\s*tenho|tenho)\b/i.test(t) ||
        /\bmere\s+paas\b/i.test(t) ||
        /कितने\s*(?:बचे|बाकी)|بچے/.test(t)
      );
    },
  },
  {
    name: 'kycPayoutCue',
    group: 'account',
    test: (t) => {
      const payoutCreditsProduct =
        /\bpayout\s*credits?\b/i.test(t) &&
        !/\b(?:kyc|my\s+payout|payout\s+status|payout\s+(?:been|sent|approved|held|pending)|account\s+status)\b/i.test(
          t
        );
      if (payoutCreditsProduct && !/\bkyc\b/i.test(t)) {
        return (
          /\b(?:kyc|withdrawal|verific(?:y|ation|ado)|approval|account\s+status|breach)\b/i.test(t) ||
          /\b(?:retiro|verificaci[oó]n|aprobado)\b/i.test(t)
        );
      }
      return (
        /\b(?:kyc|withdrawal|verific(?:y|ation|ado)|approval|account\s+status|breach)\b/i.test(t) ||
        /\b(?:my|meri|mera|nuestro|minha)\s+payout\b/i.test(t) ||
        /\bpayout\s+(?:status|been|sent|approved|held|pending)\b/i.test(t) ||
        (/\bpayout\b/i.test(t) && !/\bpayout\s*credits?\b/i.test(t)) ||
        /\b(?:retiro|verificaci[oó]n|aprobado)\b/i.test(t)
      );
    },
  },
  {
    name: 'accountLocus',
    group: 'account',
    test: (t) =>
      /\b(?:this\s+account|this\s+ticket|this\s+login|on\s+this\s+account|my\s+(?:profile|dashboard|current\s+challenge)|funded\s+side|esta\s+cuenta|nesta\s+conta|esta\s+conta)\b/i.test(
        t
      ),
  },
  {
    name: 'namedCard',
    group: 'item',
    test: (t) => NAMED_CARD_RE.test(t),
  },
  {
    name: 'packsItem',
    group: 'item',
    test: (t) => PACKS_ITEM_RE.test(t),
  },
  {
    name: 'definitionCue',
    group: 'catalog',
    test: (t) =>
      /\b(?:what\s+are|what\s+is|which\s+packs?|from\s+which|explain|list)\b/i.test(t) ||
      /\bkya\s+hain\b/i.test(t) ||
      /\bqu[eé]\s+son\b/i.test(t) ||
      /\bquais\s+s[aã]o\b/i.test(t),
  },
  {
    name: 'ratesCue',
    group: 'catalog',
    test: (t) =>
      /\b(?:drop\s*rates?|odds|probability|per\s*card|\bchance\b|exotic\s*rates?|tasas|por\s*carta)\b/i.test(t),
  },
  {
    name: 'priceCue',
    group: 'catalog',
    test: (t) =>
      /\b(?:cost|price|how\s*much|precio|preço|ka\s+hai\s+cost|kitne\s+credits\s+ka)\b/i.test(t) &&
      !/\b(?:do i have|left|remaining|mere\s+paas|bachi|balance)\b/i.test(t),
  },
  {
    name: 'cardCountCue',
    group: 'catalog',
    test: (t) =>
      /\b(?:how\s*many\s*cards|cards?\s*(?:exist|in\s*total|to\s*collect)|76|collection\s*size|cards?\s*in\s*(?:an?\s*)?(?:elite\s*|exotic\s*)?pack)\b/i.test(
        t
      ) && !/\b(?:do i have|mere\s+paas)\b/i.test(t),
  },
  {
    name: 'howToInstructional',
    group: 'catalog',
    test: (t) => {
      const how =
        /\bhow\s+(?:do|can|to)\s+i\b/i.test(t) ||
        /\bkaise\s+(?:kharid|milta|milega|le|paun|paoon|add\s+kare|unlock\s+kare)\b/i.test(t) ||
        /\bkaise\s+kharidu\b/i.test(t) ||
        /\bc[oó]mo\s+(?:puedo|obtengo|compro|cancelo)\b/i.test(t) ||
        /\bcomo\s+(?:posso|obtenho|compro|cancelo)\b/i.test(t);
      if (!how) return false;
      if (
        /\b(?:did|have|has)\s+(?:i|we)\b/i.test(t) ||
        /\b(?:do|did)\s+i\s+own\b/i.test(t)
      ) {
        return false;
      }
      return true;
    },
  },
  {
    name: 'processGenericGet',
    group: 'catalog',
    test: (t) =>
      /\bwhat\s+do\s+i\s+get\s+in\b/i.test(t) ||
      /\bdo\s+i\s+get\s+(?:three|3|\d+)\s+cards\b/i.test(t) ||
      /\b(?:each\s+time|when)\s+i\s+open\b/i.test(t),
  },
  {
    name: 'inventoryHowTo',
    group: 'catalog',
    test: (t) => {
      const howToUse =
        /\bhow\s+do\s+i\s+use\b/i.test(t) ||
        /\b(?:use|apply)\s+(?:a\s+)?card\b/i.test(t) ||
        /\bwhere\s+(?:are|do\s+i\s+find)\b/i.test(t);
      if (!howToUse) return false;
      if (NAMED_CARD_RE.test(t) && /\b(?:own|unlock|received|confirm\s+i)\b/i.test(t)) return false;
      return true;
    },
  },
  {
    name: 'accountActionHowTo',
    group: 'catalog',
    test: (t) => {
      const action =
        /\b(?:cancel|buy|purchase|convert|withdraw|cash\s*out|kharid|redeem|renew)\b/i.test(t);
      const how =
        /\bhow\s+(?:do|can|to)\s+i\b/i.test(t) ||
        /\bkaise\b/i.test(t) ||
        /\bcan i\b/i.test(t) ||
        /\bwhere\b/i.test(t);
      return action && how;
    },
  },
  {
    name: 'policyCanI',
    group: 'catalog',
    test: (t) =>
      /\bcan i\b/i.test(t) &&
      /\b(?:withdraw|cash\s*out|convert|refund|cancel|stack|buy|purchase|redeem)\b/i.test(t),
  },
  {
    name: 'purposeMarker',
    group: 'catalog',
    test: (t) => /\bke\s+liye\b/i.test(t),
  },
  {
    name: 'freePackCue',
    group: 'freetier',
    test: (t) => /\bfree(?:\s+\w+){0,3}\s*packs?\b/i.test(t),
  },
  {
    name: 'newAccountCue',
    group: 'freetier',
    test: (t) => /\b(?:new\s+(?:\d+\s*)?k?\s*account|naye\b|new\s+account|launch\s*week)\b/i.test(t),
  },
  {
    name: 'accountSizeCue',
    group: 'freetier',
    test: (t) =>
      /\b(?:5|25|50|100|200|300|400)\s*k\b/i.test(t) ||
      /\bwhich\s*(?:account|size)\b/i.test(t),
  },
  {
    name: 'refundCue',
    group: 'intent',
    test: (t) =>
      /\b(?:refund|refundable|chargeback|withdrawal\s*right|consumer\s*code|money\s*back|reembolso|reembols)\b/i.test(
        t
      ) || /ریفنڈ|استرداد|واپسی/.test(t),
  },
  {
    name: 'missingCue',
    group: 'intent',
    test: (t) =>
      /\b(?:missing|didn'?t\s*(?:show|appear|receive|get)|did\s*not\s*(?:show|appear|receive|get)|not\s*(?:show(?:ing)?|appear(?:ing)?)|lost|never\s*(?:got|received|showed)|faltan|falta(?:n)?|n[aã]o\s*aparecem|no\s*(?:aparecen|apareci[oó])|n[aã]o\s*(?:recebi|chegou)|no\s*recib[ií])\b/i.test(
        t
      ) || /نہیں\s*(?:مل|آئ|آئی)|नहीं\s*(?:मिल|आए)/.test(t),
  },
]);

const ARABIC_NON_PERSONAL_ALIF = /^(?:أخرى|أيضا|أصبح|إلا|أما|أنت|أنتم|أنها|أنه|أنهم|الأ|إلى|أيها)$/;

function arabicFirstPersonSingularVerb(t) {
  const re = /(?:^|[^\u0600-\u06FF])(أ[\u0621-\u064A]{2,})/g;
  let m;
  while ((m = re.exec(t))) {
    if (!ARABIC_NON_PERSONAL_ALIF.test(m[1])) return true;
  }
  return false;
}

/**
 * Personal stance: pronouns / possessives / conjugations / implicit subject
 * across scripts. This is NOT a possession-verb cue list.
 */
function detectPersonalStance(text) {
  const t = String(text || '');
  const hits = [];
  const probes = [
    ['latin-pronoun', () => /\b(?:i|i'm|i’m|i am|we|me|my|mine|myself|us|our|ours|ourselves)\b/i.test(t)],
    ['roman-ur-hi', () => /\b(?:main|maine|mujhe|mujh|hum|ham|mere|meri|mera|hamari|hamara|hamare|apna|apni|apne)\b/i.test(t)],
    [
      'es-pt-pronoun',
      () =>
        /(?:^|[^\wáéíóúñãõç])(?:yo|mi|mis|m[ií]o|m[ií]a|nuestra|nuestro|nuestras|nuestros|nos|eu|meu|minha|meus|minhas|nosso|nossa|nossos|nossas|comigo|conmigo|nós)\b/i.test(
          t
        ) || /(?:^|[^\w])(?:tengo|tenemos|tenho|temos|poseo|possuo|confirmo)\b/i.test(t),
    ],
    [
      'es-pt-implicit',
      () =>
        /\bme\s+(?:quedan|queda|restan|resta|aparecen|aparece|pertenece|pertenecen|faltan|falta|otorgaron|dieron|restam|resta)\b/i.test(
          t
        ) || /\ba\s+m[ií]\b/i.test(t),
    ],
    ['fr-pronoun', () => /(?:^|[^\wàâéèêëïîôùûüç])(?:je|j'|moi|mon|ma|mes|nous|notre|nos)\b/i.test(t)],
    [
      'de-pronoun',
      () => {
        if (/(?:^|[^\wäöüß])(?:ich|mir|mich|uns|unser|unsere)\b/i.test(t)) return true;
        // "mein" alone collides with Roman-Urdu locative "mein". Require German context.
        if (!/(?:^|[^\wäöüß])(?:mein|meine|meinem|meiner|meins)\b/i.test(t)) return false;
        return (
          /(?:^|[^\wäöüß])(?:ich|habe|besitze|konto|dieses|dieser|auf\s+diesem|ist\s+das)\b/i.test(t) ||
          /[äöüß]/.test(t)
        );
      },
    ],
    ['devanagari', () => /मैं|मेरा|मेरे|मेरी|मुझे|मुझ|हम(?:ारा|ारे|ारी)?|अपना|अपने|अपनी/.test(t)],
    [
      'arabic-urdu-pronoun',
      () =>
        /أنا|نحن|لي|معي|عندي|لدي|لنا|إلي|ملكيتي|حسابي|حسابنا|بطاقتي|رصيدي|حزمتي/.test(t) ||
        /میرا|میرے|میری|ميرا|ميرے|ميري/.test(t) ||
        /مجھے|مجھ|ہمارا|ہمارے|ہماری|اپنا|اپنی/.test(t) ||
        // میں = I only in 1st-person frames; bare میں is locative "in".
        /(?:^|[^\u0600-\u06FF])میں\s*نے|کیا\s*میں|(?:^|[^\u0600-\u06FF])میں\s+(?:ہوں|ہون|مالک)/.test(t),
    ],
    [
      'ru-hi-implicit-subject',
      () =>
        /\b(?:mil\s+gaya|mil\s+gayi|mil\s+chuka|le\s+liya|aa(?:ya|yee|yi)?\s+hai)\b/i.test(t) ||
        /مل\s*گیا|مل\s*چکا|मिल\s*गया/.test(t),
    ],
    // Arabic 1st-person present: أ- prefix minus common non-personal particles.
    ['arabic-1sg-prefix', () => arabicFirstPersonSingularVerb(t)],
    ['account-deixis', () =>
      /\b(?:this\s+(?:account|ticket|login|challenge|profile|dashboard)|on\s+(?:the|this|that)\s+(?:account|login|challenge)|(?:the|that)\s+account|esta\s+cuenta|nesta\s+conta|esta\s+conta|este\s+login|dieses\s+konto|diesem\s+konto|ce\s+compte)\b/i.test(
        t
      ),
    ],
  ];
  let errors = 0;
  for (const [name, fn] of probes) {
    try {
      if (fn()) hits.push(name);
    } catch (_) {
      errors += 1;
    }
  }
  return Object.freeze({
    hit: hits.length > 0,
    hits,
    uncertain: errors > 0,
  });
}

function detectAccountStatusTerm(text) {
  const t = String(text || '');
  const payoutCreditsProduct =
    /\bpayout\s*credits?\b/i.test(t) &&
    !/\b(?:kyc|my\s+payout|payout\s+status|payout\s+(?:been|sent|approved|held|pending)|account\s+status)\b/i.test(t);
  const kyc =
    /\b(?:kyc|withdrawal|verific(?:y|ation|ado)|approval|account\s+status|breach)\b/i.test(t) ||
    /\b(?:retiro|verificaci[oó]n|aprobado)\b/i.test(t) ||
    /سحب|تحق[يق]|كيه\s*واي|حالة\s*السحب/.test(t);
  const payout =
    (!payoutCreditsProduct && /\bpayout\b/i.test(t)) ||
    /\b(?:my|meri|mera|nuestro|minha)\s+payout\b/i.test(t);
  const personalBalance =
    (/\b(?:pack\s*)?credits?\b|کریڈٹ|क्रेडिट|cr[eé]ditos?|رصيد|باقات/i.test(t) &&
      (/\b(?:left|remaining|balance|bachi|baaki|quedan|restan|restam|ainda\s*tenho|المتبقي|بचे|बाكي)\b/i.test(t) ||
        /متبقي|بचे|बाकी|لدي|mere\s+paas/.test(t))) ||
    /\bcredit balance\b/i.test(t);
  return !!(kyc || payout || personalBalance);
}

/**
 * Strip instructional / process / policy frames so leftover "do I own"
 * still counts as a personal-status clause. Positive allow-list only
 * after this residue is clean (or the match IS the instructional frame).
 */
function stripGeneralFrames(text) {
  let s = String(text || '');
  s = s.replace(
    /\bhow\s+(?:do|can|to)\s+(?:i|we)\b(?:\s+\w+){0,8}\s+(?:get|got|buy|purchase|obtain|unlock|use|apply|cancel|find|convert|withdraw|redeem|kharid|open)\b/gi,
    ' '
  );
  s = s.replace(/\bwhat\s+do\s+(?:i|we)\s+get\s+in\b/gi, ' ');
  s = s.replace(/\bdo\s+i\s+get\s+(?:three|3|\d+)\s+cards\b/gi, ' ');
  s = s.replace(/\b(?:each\s+time|when)\s+i\s+open\b/gi, ' ');
  s = s.replace(
    /\bcan i\b(?:\s+\w+){0,8}\s+(?:withdraw|cash\s*out|convert|refund|cancel|stack|buy|purchase|redeem|kharid)\b/gi,
    ' '
  );
  s = s.replace(/\btell me about\b/gi, ' ');
  s = s.replace(/\btell me what\b/gi, ' ');
  s = s.replace(/\bwhere\s+(?:do\s+i\s+find|are)\b/gi, ' ');
  s = s.replace(/\bhow do i use\b/gi, ' ');
  s = s.replace(/\bshould i buy\b/gi, ' ');
  s = s.replace(/\bwhich pack(?:s)?(?:\s+is)?\s+best\b/gi, ' ');
  s = s.replace(/\bkaise\s+(?:kharid|milta|milega|le|paun|paoon|kharidu|add\s+kare)\w*\b/gi, ' ');
  s = s.replace(/\bc[oó]mo\s+(?:puedo|obtengo|compro|cancelo|uso)\b/gi, ' ');
  s = s.replace(/\bcomo\s+(?:posso|obtenho|compro|cancelo|uso)\b/gi, ' ');
  s = s.replace(/كيف\s+(?:أحصل|أشتري|أستخدم|أفتح)/g, ' ');
  s = s.replace(/कैसे\s+(?:मिलता|खरीद|पाऊं|पाऊँ)/g, ' ');
  s = s.replace(/کیسے\s+(?:ملتا|خرید)/g, ' ');
  return s;
}

function hasResidualPersonalStatusClause(text) {
  const t = stripGeneralFrames(text);
  return (
    /\b(?:do|did|does|have|has)\s+(?:i|we)\b/i.test(t) ||
    /\bcan i\b.{0,40}\b(?:get|receive|own|qualify|unlock|eligible)\b/i.test(t) ||
    /\btell me (?:if|whether)\b/i.test(text) ||
    /\b(?:is it mine|belongs? to me)\b/i.test(t) ||
    /\bconfirm (?:that\s+)?(?:i|we)\s+(?:own|have|got|received)\b/i.test(t) ||
    /\bme\s+(?:quedan|restan|aparece|pertenece)\b/i.test(t) ||
    /\bam i\b.{0,40}\b(?:eligible|qualified|qualify)\b/i.test(t) ||
    /هل\s+(?:أملك|عندي|نحن\s*نملك)|كيا\s*میں|کیا\s*میں|क्या\s+मैं/.test(text) ||
    /\bdo i already own\b/i.test(text)
  );
}

/**
 * Positive allow-list of GENERAL product-question STRUCTURE.
 * Not a deny-list of ownership phrases.
 */
function detectUnambiguousGeneralProduct(text) {
  const t = String(text || '');
  const reasons = [];

  const tellMeAbout =
    (/\btell me about\b/i.test(t) ||
      /\btell me what\b/i.test(t) ||
      (/\btell me\b/i.test(t) && /\b(?:rarity|chances|odds|drop|rates?|floor|cost|price)\b/i.test(t)) ||
      /\bexpl[ií](?:ca|que|came)\b/i.test(t) ||
      /\bdime sobre\b/i.test(t) ||
      /أخبرني\s+عن|اشرح|حدثني\s+عن/.test(t) ||
      /के\s*बारे\s*में|ke\s+baare\s+(?:mein|me)\b/i.test(t)) &&
    !/\btell me (?:if|whether)\b/i.test(t) &&
    !/\bdime si\b/i.test(t);
  if (tellMeAbout) reasons.push('tell-me-about');

  const definition =
    /\b(?:what\s+are|what\s+is|what\s+does|which\s+packs?|from\s+which|explain|list)\b/i.test(t) ||
    /\bkya\s+hain\b/i.test(t) ||
    /\bqu[eé]\s+(?:son|es)\b/i.test(t) ||
    /\bquais\s+s[aã]o\b/i.test(t) ||
    /\bo\s+que\s+s[aã]o\b/i.test(t) ||
    /ما\s+ه[يو]|ما\s+هي/.test(t) ||
    /क्या\s+हैं|क्या\s+है/.test(t) ||
    /کیا\s*ہیں|کیا\s*ہے/.test(t);
  if (definition) reasons.push('definition');

  const howTo =
    (/\bhow\s+(?:do|can|to)\s+(?:i|we)\b/i.test(t) ||
      /\bkaise\s+(?:kharid|milta|milega|le|paun|paoon|add\s+kare|unlock\s+kare|kharidu)\w*\b/i.test(t) ||
      /\bc[oó]mo\s+(?:puedo|obtengo|compro|cancelo|uso|consigo)\b/i.test(t) ||
      /\bcomo\s+(?:posso|obtenho|compro|cancelo|uso|consigo)\b/i.test(t) ||
      /كيف\s+(?:أحصل|أشتري|أستخدم|أفتح)/.test(t) ||
      /कैसे\s+(?:मिलता|खरीद|पाऊं|पाऊँ)/.test(t) ||
      /کیسے\s+(?:ملتا|خرید)/.test(t)) &&
    !/\bhow\s+did\s+(?:i|we)\b/i.test(t) &&
    !/\b(?:did|have|has)\s+(?:i|we)\b/i.test(t) &&
    !/\b(?:do|did)\s+i\s+own\b/i.test(t);
  if (howTo) reasons.push('how-to');

  const processGet =
    /\bwhat\s+do\s+i\s+get\s+in\b/i.test(t) ||
    /\bdo\s+i\s+get\s+(?:three|3|\d+)\s+cards\b/i.test(t) ||
    /\b(?:each\s+time|when)\s+i\s+open\b/i.test(t) ||
    (/\bfree\s+(?:elite\s+)?pack\b/i.test(t) &&
      /\b(?:used before|before pack credits|priority|charged first)\b/i.test(t)) ||
    (/\b(?:close|closing)\b/i.test(t) &&
      /\b(?:opening|reveal|charged)\b/i.test(t) &&
      /\bpack\b/i.test(t));
  if (processGet) reasons.push('process-get');

  const inventoryHowTo =
    (/\bhow\s+do\s+i\s+use\b/i.test(t) ||
      /\b(?:use|apply)\s+(?:a\s+)?card\b/i.test(t) ||
      /\bwhere\s+(?:are|do\s+i\s+find)\b/i.test(t)) &&
    !(NAMED_CARD_RE.test(t) && /\b(?:own|unlock|received|confirm\s+i|do i have)\b/i.test(t));
  if (inventoryHowTo) reasons.push('inventory-howto');

  const personalBalanceLeft =
    /\b(?:credits?|cr[eé]ditos?|کریڈٹ|क्रेडिट|رصيد)\b/i.test(t) &&
    /\b(?:left|remaining|balance|quedan|restan|restam|bachi|baaki|do i have|mere\s+paas|لدي|المتبقي)\b/i.test(t);

  const rates = /\b(?:drop\s*rates?|odds|probability|per\s*card|\bchances?\b|exotic\s*rates?|tasas|por\s*carta|rarity\s+chances)\b/i.test(t);
  if (rates && !personalBalanceLeft) reasons.push('rates');

  const autoApplyHowItWorks =
    /\b(?:automatic(?:ally)?|by\s*itself)\b/i.test(t) &&
    /\b(?:change|apply)\b/i.test(t) &&
    /\b(?:card|pack|rules?|challenge)\b/i.test(t) &&
    !/\b(?:did i|do i own|confirm i|in my inventory)\b/i.test(t);
  if (autoApplyHowItWorks) reasons.push('auto-apply-howto');

  const price =
    /\b(?:cost|price|how\s*much|precio|preço|ka\s+hai\s+cost|kitne\s+credits\s+ka)\b/i.test(t) &&
    !personalBalanceLeft;
  if (price) reasons.push('price');

  const cardCount =
    /\b(?:how\s*many\s*cards|cards?\s*(?:exist|in\s*total|to\s*collect)|76|collection\s*size|cards?\s*in\s*(?:an?\s*)?(?:elite\s*|exotic\s*)?pack)\b/i.test(
      t
    ) && !personalBalanceLeft;
  if (cardCount) reasons.push('card-count');

  const theirOwn = /\b(?:their|its|his|her)\s+own\b/i.test(t);
  if (theirOwn) reasons.push('their-own');

  const freeTier =
    /\bfree(?:\s+\w+){0,3}\s*packs?\b/i.test(t) &&
    (/\b(?:new\s+(?:\d+\s*)?k?\s*account|naye\b|new\s+account|launch\s*week)\b/i.test(t) ||
      /\b(?:5|25|50|100|200|300|400)\s*k\b/i.test(t) ||
      /\bwhich\s*(?:account|size)\b/i.test(t));
  if (freeTier) reasons.push('free-tier');

  const policyCanI =
    /\bcan i\b/i.test(t) &&
    /\b(?:withdraw|cash\s*out|convert|refund|cancel|stack|buy|purchase|redeem)\b/i.test(t);
  if (policyCanI) reasons.push('policy-can-i');

  const whichBest = /\bwhich pack(?:s)?(?:\s+is)?\s+best\b/i.test(t) || /\bshould i buy\b/i.test(t);
  if (whichBest) reasons.push('which-best');

  if (!reasons.length) {
    return Object.freeze({ hit: false, reasons });
  }
  // Mixed ownership+product bait is not an unambiguous general question.
  if (
    hasResidualPersonalStatusClause(t) &&
    !howTo &&
    !processGet &&
    !policyCanI &&
    !inventoryHowTo &&
    !freeTier &&
    !autoApplyHowItWorks
  ) {
    return Object.freeze({ hit: false, reasons: [], blockedBy: 'residual-personal-status' });
  }
  return Object.freeze({ hit: true, reasons });
}

function extractLegacyFlags(text) {
  const raw = String(text || '');
  const flags = Object.create(null);
  for (const row of FEATURE_TABLE) {
    try {
      flags[row.name] = !!row.test(raw);
    } catch (_) {
      flags[row.name] = false;
    }
  }
  const firstPerson = !!(
    flags.firstPersonEn ||
    flags.firstPersonRuHi ||
    flags.firstPersonEsPt ||
    flags.firstPersonScript
  );
  const item = !!(flags.packsItem || flags.namedCard);
  const positiveFreeTier = !!(
    flags.freePackCue &&
    (flags.newAccountCue || flags.accountSizeCue)
  );
  const catalogAllow = !!(
    flags.definitionCue ||
    flags.ratesCue ||
    flags.priceCue ||
    flags.cardCountCue ||
    flags.processGenericGet
  );
  const howToAllow = !!(
    flags.howToInstructional ||
    flags.inventoryHowTo ||
    flags.accountActionHowTo ||
    flags.policyCanI
  );
  const possessionStrong = !!(
    (flags.ownVerb && firstPerson && !flags.theirOwnIdiom) ||
    (flags.didIReceiveOwn && !flags.processGenericGet && !flags.howToInstructional) ||
    (flags.personalCanIGet && !flags.processGenericGet && !flags.howToInstructional) ||
    (flags.unlockVerb && (firstPerson || flags.possessive || flags.confirmCheck)) ||
    (flags.receiveVerb && firstPerson && !flags.howToInstructional && !flags.missingCue && !flags.processGenericGet) ||
    (flags.inventoryLocation && (firstPerson || flags.possessive)) ||
    (flags.possessive && flags.unlockVerb && item) ||
    (flags.possessive && flags.statusQuestion && item && !catalogAllow && !howToAllow) ||
    (flags.ruPossessiveCopula && item) ||
    (flags.ruTookReceived && item && !flags.purposeMarker) ||
    (flags.ruCompletedReceive && item && !flags.howToInstructional && !catalogAllow) ||
    (flags.esPtPossess && item && !flags.howToInstructional && !catalogAllow)
  );
  const accountBoundNamedCard = !!(
    flags.namedCard &&
    (flags.accountLocus ||
      (flags.receiveVerb && (firstPerson || flags.possessive || /\b(?:us|we|yet|already)\b/i.test(raw))))
  );
  flags.firstPerson = firstPerson;
  flags.item = item;
  flags.positiveFreeTier = positiveFreeTier;
  flags.catalogAllow = catalogAllow;
  flags.howToAllow = howToAllow;
  flags.possessionStrong = possessionStrong;
  flags.accountBoundNamedCard = accountBoundNamedCard;
  return flags;
}

function extractFeatures(text) {
  const raw = String(text || '');
  const flags = extractLegacyFlags(raw);
  const stance = detectPersonalStance(raw);
  const general = detectUnambiguousGeneralProduct(raw);
  const accountStatusTerm = detectAccountStatusTerm(raw);
  const item = !!(flags.packsItem || flags.namedCard || PACKS_ITEM_RE.test(raw) || NAMED_CARD_RE.test(raw));
  flags.personalStance = !!stance.hit;
  flags.personalStanceHits = stance.hits;
  flags.stanceUncertain = !!stance.uncertain;
  flags.accountStatusTerm = !!accountStatusTerm;
  flags.unambiguousGeneralProduct = !!general.hit;
  flags.generalReasons = general.reasons;
  flags.generalBlockedBy = general.blockedBy || null;
  flags.item = item;
  // Stance + (item|account-status) is the invert. Account-status + Packs item
  // is also personal: KYC/payout/balance next to a named card is never a
  // catalog question, even when the pronoun is dropped ("Check KYC plus
  // whether Instant Override is on the account").
  flags.personalAccount = !!(
    (stance.hit && (item || accountStatusTerm)) ||
    (accountStatusTerm && item)
  );
  return Object.freeze(flags);
}

function decideInner(text, f) {
  if (f.stanceUncertain) {
    return { kind: KIND.AMBIGUOUS, reason: 'pregate-stance-uncertain-fail-closed' };
  }
  if (f.refundCue) {
    return { kind: KIND.REFUND, reason: 'pregate-refund' };
  }
  if (f.missingCue && f.item) {
    return { kind: KIND.MISSING, reason: 'pregate-missing-item' };
  }

  const personalAccount = !!f.personalAccount;
  if (personalAccount && f.unambiguousGeneralProduct) {
    return { kind: KIND.NOT_PERSONAL, reason: 'pregate-general-product-structure' };
  }
  if (personalAccount) {
    return { kind: KIND.PERSONAL, reason: 'pregate-deny-default-personal' };
  }
  return { kind: KIND.NOT_PERSONAL, reason: 'pregate-not-personal' };
}

function evaluateOwnershipPregate(text, opts) {
  opts = opts || {};
  try {
    if (text == null) {
      return Object.freeze({
        kind: KIND.AMBIGUOUS,
        reason: 'pregate-missing-text-fail-closed',
        features: Object.freeze({}),
        blocksProductSelect: true,
        allowsProductSelect: false,
        preferRefuse: true,
      });
    }
    const features = extractFeatures(text);
    const decided = decideInner(text, features);
    const kind = decided.kind;
    const allowsProductSelect = kind === KIND.NOT_PERSONAL;
    return Object.freeze({
      kind,
      reason: decided.reason,
      features,
      blocksProductSelect: !allowsProductSelect,
      allowsProductSelect,
      preferRefuse: kind === KIND.PERSONAL || kind === KIND.AMBIGUOUS,
    });
  } catch (_) {
    return Object.freeze({
      kind: KIND.AMBIGUOUS,
      reason: 'pregate-error-fail-closed',
      features: Object.freeze({}),
      blocksProductSelect: true,
      allowsProductSelect: false,
      preferRefuse: true,
    });
  }
}

function productSelectPermitted(gate) {
  return !!(gate && gate.allowsProductSelect === true && gate.blocksProductSelect === false);
}

function isPersonalOrAmbiguous(text) {
  const g = evaluateOwnershipPregate(text);
  return g.kind === KIND.PERSONAL || g.kind === KIND.AMBIGUOUS;
}

function refundIntent(text) {
  return !!extractFeatures(text).refundCue;
}

function missingItemIntent(text) {
  const f = extractFeatures(text);
  return !!(f.missingCue && f.item);
}

module.exports = {
  KIND,
  FEATURE_TABLE,
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
};
