'use strict';
/**
 * Elite Packs answer selection — CLASSIFY / SELECT only (V12 contract).
 * Never returns free-text facts; only answer_id or abstain.
 *
 * Intent-class gates (independent review M-ROUTE / M-OWN-DETECT):
 * personal eligibility / balance / account-action → refuse
 * refund / missing-item → their general-safe answers (beat unrelated FAQs)
 * Then specific product selectors by confidence; overview last.
 */
const approved = require('./packsApprovedAnswers');
const pregate = require('./packsOwnershipPregate');

const CONFIDENCE_THRESHOLD = Number(process.env.LUNA_PACKS_SELECT_THRESHOLD || 0.72);

/**
 * Wrap every product selector: missing/blocking gate → no match (fail-closed).
 * Selectors must not fire unless productSelectPermitted(gate) === true.
 */
function gatedTest(fn) {
  return function packsGatedSelectorTest(t, prod, gate) {
    if (!pregate.productSelectPermitted(gate)) return false;
    return fn(t, prod, gate);
  };
}

function detectLangHint(text) {
  const t = String(text || '');
  if (/[\u0600-\u06ff]{3,}/.test(t)) {
    // Arabic product asks use أ/إ/ة/ى; Urdu-only letters ے/گ keep ur.
    if (/[أإةى]/.test(t) && !/[ےگ]/.test(t)) return 'ar';
    return 'ur';
  }
  if (/[\u0900-\u097f]/.test(t)) return 'hi';
  if (/\b(?:el|la|los|las|qué|que|cuál|cual|paquete|cartas|créditos|creditos)\b/i.test(t)) {
    return 'es';
  }
  if (/\b(?:qual|quais|pacote|cartas|créditos|creditos|alavancagem)\b/i.test(t)) {
    return 'pt';
  }
  if (/\b(?:hai|hain|mein|kitna|kya|nahi|nahin|bhai|ka|ki|ke|aap|farq)\b/i.test(t)) {
    return 'ur-latn';
  }
  return 'en';
}

function packsProductHint(text) {
  const t = String(text || '').toLowerCase();
  if (
    /\belite\s*packs?\b|\bpack\s*credits?\b|\bmy\s*packs\b|\bopen(?:ing)?\s+(?:a\s+)?pack\b|\bpack\s*pass\b|\blucky\s*streak\b|\bthe\s*million\b|\bignition\b|\bbreakout\b|\bmarket\s*maker\b|\bwhale\s*pack\b|\boracle\s*pack\b|\bfounder'?s?\s*key\b|\binstant\s*override\b|\bopen\s*season\b|\blifetime\s*split\b|\bpayout\s*boost\s*100\b|\b100\s*%\s*payout\s*card\b|\bdrop\s*rates?\b|\bredeem\s*key\b|\bfree\s*packs?\b|\bexotic\b|\bprimordial\b|\bpurple\s*card\b|\bpink\s*card\b|\bpack\s*credits?\b|\bmythic\b|\blegendary\b/.test(
      t
    )
  ) {
    return 'elite-packs';
  }
  if (/\b(?:elite\s*)?packs?\b/.test(t) && !/\belite\s*atom\b|\batom\s+\d/.test(t)) {
    return 'elite-packs';
  }
  if (
    /\b(?:free\s*packs?|pack\s*pass|instant\s*override|open\s*season|lifetime\s*split|founder'?s?\s*key|purchase\s+credits?|buy\s+credits?|kharid|pack\s*credits?|cartas?|créditos?)\b/.test(
      t
    )
  ) {
    return 'elite-packs';
  }
  if (/کریڈٹ|پیک|اووررائیڈ|کارڈ|क्रेडिट|पैक/.test(text)) return 'elite-packs';
  return '';
}

/** Reward / Packs item anchors — language-agnostic. */
function rewardToken(text) {
  return /\b(?:pack|card|credits?|exotic|million|inventory|collection|subscription|ownership|instant\s*override|lifetime\s*split|founder'?s?\s*key|open\s*season|primordial|whale|oracle|ignition|cartas?|créditos?|creditos?|paquete|pacote)\b|اووررائیڈ|کریڈٹ|پیک|کارڈ|कार्ड|क्रेडिट|पैक/i.test(
    text
  );
}

/** Catalog / definition / price / rates how-to — not personal status (negative controls). */
function isProductCatalogAsk(text) {
  const t = String(text || '');
  if (personalPossessionCue(t)) return false;
  return (
    /\b(?:what\s+are|what\s+is|which\s+packs?|from\s+which|how\s+many\s+cards|drop\s*rates?|odds|probability|\bchance\b|exotic\s*rates?|cost|price|kya\s+hain|kya\s+hai|qué\s+son|quais\s+são|tasas)\b/i.test(
      t
    ) || /\bhow\s+many\s+cards.{0,40}\bpack\b/i.test(t)
  );
}

/**
 * Structured personal possession / ownership cue (C-OWN-1).
 * Components: first-person / possession pronoun+verb OR explicit "I own / Do I own / Confirm I own".
 * Not a single brittle regex — checked as separable intent features.
 */
function personalPossessionCue(text) {
  const f = pregate.extractFeatures(text);
  return !!(f.possessionStrong || f.didIReceiveOwn || f.accountBoundNamedCard);
}

/** Roman Urdu / Hindi personal balance / possession cues (flexible word order). */
function personalBalanceCue(text) {
  const t = String(text || '');
  if (/\bkitne\b(?:\s+\w+){0,4}\s+(?:pack\s*)?credits?\b/i.test(t)) return true;
  if (/\b(?:bachi|bache|baaki|bachay|bachiye)\b/i.test(t) && /\b(?:pack\s*)?credits?\b/i.test(t)) return true;
  if (/\bmere\s+paas\b/i.test(t) && /\b(?:pack\s*)?credits?\b/i.test(t)) return true;
  if (/\bcheck\s+karo\b/i.test(t) && /\b(?:pack\s*)?credits?\b/i.test(t)) return true;
  return false;
}

function freeTierConfirmAsk(text) {
  // Positive free-tier only. Bare "confirm karo" is NOT an exemption.
  return !!pregate.extractFeatures(text).positiveFreeTier;
}

/**
 * Compatibility wrapper — the structural gate lives in packsOwnershipPregate.
 * True only for personal / ambiguous account-status (not refund/missing).
 */
function accountStatusAsk(text) {
  return pregate.isPersonalOrAmbiguous(text);
}

/** Refund / chargeback / consumer-code — beats auto-apply / inventory. Language-independent. */
function refundIntent(text) {
  return pregate.refundIntent(text);
}

/** Missing pack/card/key/credits — beats inventory how-to / opening. Language-independent. */
function missingItemIntent(text) {
  return pregate.missingItemIntent(text);
}

function rowIsSendable(row) {
  if (!row) return false;
  if (typeof approved.isSendableRow === 'function') return approved.isSendableRow(row);
  return row.sendable === true && row.approval === 'source-verified';
}

function preferSendableLocaleId(baseId, lang) {
  const candidates = [];
  if (lang && lang !== 'en') candidates.push(`${baseId}.${lang}`);
  candidates.push(`${baseId}.en`);
  for (const id of candidates) {
    const row = approved.get(id);
    if (!row) continue;
    if (rowIsSendable(row)) return id;
  }
  const en = approved.get(`${baseId}.en`);
  if (en && rowIsSendable(en)) return `${baseId}.en`;
  return null;
}

function selectId(baseId, lang, conf, reason, prod) {
  const id = preferSendableLocaleId(baseId, lang);
  if (!id) return { abstain: true, reason: reason + '-handoff', confidence: conf, lang };
  const row = approved.get(id);
  if (!row || !rowIsSendable(row)) {
    return { abstain: true, reason: 'non-sendable-fail-closed', confidence: conf, lang };
  }
  return {
    abstain: false,
    answerId: id,
    confidence: conf,
    contentHash: row.contentHash,
    reason,
    productHint: prod || 'elite-packs',
    lang,
  };
}

const RAW_SELECTORS = [
  {
    id: 'packs.the-million',
    conf: 0.995,
    test: (t) => /million/.test(t) && /every\s+rule\s+lifted|all\s+rules?\s+(?:removed|lifted)|no\s+risk\s+rules?/.test(t),
  },
  {
    id: 'packs.pack-pass',
    conf: 0.99,
    test: (t) => /pack\s*pass/.test(t),
  },
  {
    id: 'packs.atom-bundle-distinct',
    conf: 0.995,
    test: (t) => /atom/.test(t) && /(?:bundle|same\s*order|3\s*account|combine|launch)/.test(t),
  },
  {
    id: 'packs.followup.purple-card-ambiguous',
    conf: 0.98,
    test: (t) => /purple\s*card|pink\s*card|blue\s*card|that\s*(?:purple|pink|blue)\s*card/.test(t),
  },
  {
    id: 'packs.followup.oracle-pack',
    conf: 0.99,
    test: (t) =>
      /(?:tell\s*me\s*about\s*the\s*oracle|the\s*oracle\s*(?:one|pack)|oracle\s*pack\s*(?:upgrade|floor))/.test(t) &&
      !/ignition|breakout|market\s*maker|whale|free\s*pack|new\s*account/.test(t),
  },
  {
    id: 'packs.followup.payout-boost-100',
    conf: 0.985,
    test: (t) => /payout\s*boost\s*100|100\s*%\s*payout\s*card|full\s*profit\s*split\s*card/.test(t),
  },
  {
    id: 'packs.refunds-legal',
    conf: 0.99,
    test: (t) => /refund|withdrawal\s*right|consumer\s*code|chargeback|refundable|money\s*back/.test(t),
  },
  {
    id: 'packs.missing-reward',
    conf: 0.99,
    test: (t) =>
      /missing|didn'?t\s*(?:show|appear|receive|get)|did\s*not\s*(?:show|appear|receive|get)|not\s*(?:show|appear|receive)|lost\s*(?:pack|card|credit|key)|never\s*(?:got|received)/.test(
        t
      ),
  },
  {
    id: 'packs.chain-upgrade-discounts',
    conf: 0.98,
    test: (t) =>
      !/oracle\s*pack\s*upgrade/.test(t) &&
      (/chain\s*discount|upgrade\s*offer|90\s*seconds/.test(t) ||
        (/special\s*pack/.test(t) && /(?:chain|stack|better\s*offer)/.test(t)) ||
        (/15\s*%/.test(t) && /20\s*%/.test(t) && /pack/.test(t))),
  },
  {
    id: 'packs.discount-stacking',
    conf: 0.97,
    test: (t) =>
      ((/stack/.test(t) && /discount|founder|checkout/.test(t)) ||
        (/founder'?s?\s*key/.test(t) && /(?:stack|combine|other\s*discount|exception)/.test(t))) &&
      !/chain\s*discount|special\s*pack/.test(t),
  },
  {
    id: 'packs.convert-payout-credits',
    conf: 0.97,
    test: (t) => /convert/.test(t) && /(?:payout\s*credits?|pack\s*credits?|credits?)/.test(t),
  },
  {
    id: 'packs.my-packs-keys',
    conf: 0.99,
    test: (t) => /redeem\s*key|redemption\s*key|giveaway\s*key|pack\s*key|where\s*do\s*free\s*packs\s*appear/.test(t),
  },
  {
    id: 'packs.free-packs-general',
    conf: 0.985,
    test: (t) => {
      if (/pack\s*pass/.test(t)) return false;
      // Keys / My Packs placement and Atom bundle asks are not free-tier FAQ.
      if (/redeem\s*key|where\s*do\s*free\s*packs\s*appear|\batom\b/.test(t)) return false;
      // New-account / launch free-tier (incl. HC size+credits confirmations) — not pack list prices.
      if (
        /free\s*pack|new\s*account|launch\s*week|which\s*(?:account|size).{0,40}(?:bonus|free|oracle|whale|market\s*maker)/.test(
          t
        )
      ) {
        return true;
      }
      if (
        /(?:5\s*k|25\s*k|50\s*k|100\s*k|200\s*k|300\s*k|400\s*k).{0,60}(?:free|oracle|whale|market\s*maker|35\s*%|50\s*%|3,?000|6,?000|10,?000)/.test(
          t
        ) &&
        /(?:account|free|bonus|credit|pack)/.test(t)
      ) {
        return true;
      }
      if (/confirm.{0,40}free\s*pack|free\s*pack.{0,40}confirm|get\s*(?:an?\s*)?(?:oracle|whale|market\s*maker).{0,20}(?:free|with)/.test(t)) {
        return true;
      }
      return false;
    },
  },
  {
    id: 'packs.drop-rates',
    conf: 0.97,
    test: (t) => {
      // Primordial / The Million "ordinary odds" asks belong to the-million, not the rate table.
      if (/(?:the\s*million|primordial)/.test(t) && /(?:ordinary|normales?|normal)/.test(t)) return false;
      const rateCue =
        /drop\s*rate|odds|probability|per\s*card|\bchance\b|exotic\s*rates?|(?:whale|oracle|ignition).{0,80}exotic\s*rates?|can\s+\w+\s+drop\s+exotic/.test(
          t
        );
      return rateCue && !/fast\s*open|charg|deduct|when\s*are\s*credits|how\s*many\s*credits/.test(t);
    },
  },
  {
    id: 'packs.card-count',
    conf: 0.96,
    test: (t) =>
      (/how\s*many\s*cards|cards?\s*(?:exist|in\s*total|to\s*collect|in\s*the\s*collection)|76|80\s*cards|card\s*reference|all\s*(?:the\s*)?cards|collection\s*size|total\s*cards/.test(
        t
      ) ||
        (/how\s*many/.test(t) && /(?:regular|exotic|primordial|mythic|legendary)/.test(t) && /card/.test(t))) &&
      !/in\s*(?:an?\s*)?(?:elite\s*)?pack\b/.test(t) &&
      !/credits?\s*(?:do i|have|left|balance)/.test(t),
  },
  {
    id: 'packs.cards-per-pack',
    conf: 0.97,
    // Keep "how many cards in an Exotic pack" → cards-per-pack; block definition paraphrases without how-many.
    test: (t) => {
      // "how many cards in a pack" / "cards in an Exotic pack" — not "how many cards to collect in Elite Packs".
      if (/to\s*collect|in\s*total|exist|collection\s*size|76|80\s*cards/.test(t)) return false;
      const countInPack =
        /how\s*many\s*cards.{0,25}\bin\b.{0,20}pack|cards?\s*in\s*(?:an?\s*)?(?:elite\s*|exotic\s*)?pack|three\s*cards|exactly\s*three/.test(
          t
        );
      if (!countInPack) return false;
      if (/\bexotic\b/.test(t) && !/how\s*many|three\s*cards|exactly\s*three/.test(t)) return false;
      return true;
    },
  },
  {
    id: 'packs.opening-and-charges',
    conf: 0.96,
    test: (t) =>
      !/missing|didn'?t|did\s*not|refund/.test(t) &&
      /(?:open(?:ing)?\s+(?:a\s+)?pack|fast\s*open|cut(?:ting)?\s*(?:the\s*)?seal|when.{0,20}charg|why.{0,20}charg|deduct|credits?\s*charg)/.test(
        t
      ),
  },
  {
    id: 'packs.followup.whale-pack',
    conf: 0.96,
    test: (t) =>
      /(?:tell\s*me\s*about\s*the\s*whale|the\s*whale\s*(?:one|pack)|whale\s*pack\s*floor)/.test(t) &&
      !/ignition|breakout|market\s*maker|oracle|free\s*pack|new\s*account/.test(t),
  },
  {
    id: 'packs.uses-multiplier',
    conf: 0.96,
    test: (t) => /[×x]\s*[235]\b|\bx2\b|\bx3\b|\bx5\b|multipl|how\s*many\s*uses|uses\s*left|mean\s*on\s*an?\s*elite\s*pack\s*card/.test(t),
  },
  {
    id: 'packs.the-million',
    conf: 0.995,
    // Ordinary/normal odds ask — sourced Million answer (D2: never "every rule lifted").
    test: (t) =>
      /(?:the\s*million|primordial)/.test(t) &&
      /(?:ordinary|normales?|normal)/.test(t) &&
      /(?:odds|drop|aparece|aparecen)/.test(t),
  },
  {
    id: 'packs.the-million',
    conf: 0.96,
    test: (t) =>
      (/\bthe\s*million\b|\bprimordial\b|\b1\s*,?\s*000\s*,?\s*000\b/.test(t) ||
        (/primordial/.test(t) && /(?:card|rarity|tier)/.test(t)) ||
        (/how\s+(?:do|can)\s+i\s+get\b/.test(t) && /(?:the\s*million|primordial)/.test(t))) &&
      !/every\s+rule\s+lifted|all\s+rules?\s+(?:removed|lifted)|no\s+risk\s+rules?/.test(t),
  },
  {
    id: 'packs.exotic-cards',
    conf: 0.98,
    // Product FAQ + how-to ("How do I get Instant Override?"). Personal elig handled by accountStatusAsk.
    // Allow intervening words: "Exotic Elite Pack cards". Rate/odds → drop-rates (not here).
    test: (t) =>
      // Ownership/possession handled by early accountStatusAsk — do not exclude bare "do i" (breaks how-tos).
      !personalPossessionCue(t) &&
      !accountStatusAsk(t) &&
      !/(?:drop\s*rate|odds|probability|\bchance\b|exotic\s*rates?|can\s+\w+\s+drop\s+exotic)/.test(t) &&
      (/(?:exotic(?:\s+\w+){0,4}\s*cards?|instant\s*override|lifetime\s*split|open\s*season|بطاقات\s*exotic|exotic\s*بطاقات|cartas?\s*exotic|exotic\s*cartas?)/.test(t) ||
        (/founder'?s?\s*key/.test(t) && !/stack|combine|other\s*discount|exception/.test(t))),
  },
  {
    id: 'packs.eligibility-labels',
    conf: 0.96,
    test: (t) =>
      /(?:skip\s*a\s*(?:trading\s*)?day|drawdown\s*buffer|drawdown\s*ceiling|skip\s*a\s*step|funded\s*reset|consistency\s*\+?\s*\d|leverage\s*boost|weekend\s*trading|funded\s*scalping|split\s*(?:70|80|90))/.test(
        t
      ) && /(?:what\s*does|how\s*does|which\s*accounts?|works?\s*on|card)/.test(t),
  },
  {
    id: 'packs.buy-credits',
    conf: 0.96,
    test: (t) =>
      (/((?:buy|add|top\s*up|purchase|get\s*more|kharid(?:u|na|o)?|comprar)\s+(?:more\s+)?(?:pack\s*)?credits?)|((?:pack\s*)?credits?.{0,40}(?:buy|purchase|bundle|kharid|comprar))|(where.{0,20}(?:buy|purchase).{0,20}credits?)|(credits?\s*kaise\s*kharid)/.test(
        t
      ) &&
        !/payout\s*credits?/.test(t) &&
        !/crypto|discount\s*on|monthly|subscription|cancel|quantos|cuántos|کیتنے|कितने|tenho|بचे/.test(t)),
  },
  {
    id: 'packs.crypto-discount',
    conf: 0.97,
    test: (t) => /crypto/.test(t) && /(?:discount|5\s*%|percent|off|bundle)/.test(t),
  },
  {
    id: 'packs.pack-costs-floors',
    conf: 0.93,
    test: (t) =>
      !/free\s*pack|new\s*account|launch\s*week|35\s*%\s*off|50\s*%\s*off/.test(t) &&
      /(?:how\s*much|cost|price|credits?).{0,40}(?:ignition|breakout|market\s*maker|whale|oracle|pack)|(?:ignition|breakout|market\s*maker|whale|oracle).{0,30}(?:cost|credit|floor|price)/.test(
        t
      ) &&
      !/tell\s*me\s*about\s*the\s*(?:whale|oracle)/.test(t) &&
      !/free/.test(t),
  },
  {
    id: 'packs.rarity-floor',
    conf: 0.9,
    test: (t) => /\bfloor\b/.test(t) && /(?:whale|oracle|common|rare|uncommon|pack)/.test(t) && !/tell\s*me\s*about|free\s*pack/.test(t),
  },
  {
    id: 'packs.credits-vs-payout-credits',
    conf: 0.94,
    test: (t) =>
      !/convert|buy\s*credits|how\s*many\s*credits\s*do\s*i/.test(t) &&
      ((/pack\s*credits?/.test(t) && /payout\s*credits?/.test(t)) ||
        /difference.{0,20}credits?|credits?\s*vs|what\s*(?:is|are)\s*(?:the\s*)?(?:pack\s*)?credits?/.test(t)),
  },
  {
    id: 'packs.withdraw-credits',
    conf: 0.93,
    test: (t) => /withdraw|cash\s*out|transfer.{0,20}credits?|sell\s*credits?/.test(t) && /credit/.test(t) && !/refund/.test(t),
  },
  {
    id: 'packs.cancel-subscription',
    conf: 0.94,
    test: (t) => /cancel/.test(t) && /(?:subscription|monthly|renew)/.test(t),
  },
  {
    id: 'packs.monthly-subscription',
    conf: 0.93,
    test: (t) => /monthly|subscription|renew/.test(t) && /(?:credit|pack|bundle)/.test(t) && !/cancel/.test(t),
  },
  {
    id: 'packs.card-auto-apply',
    conf: 0.92,
    // Below refunds (0.99). Pure auto-apply questions only.
    test: (t) =>
      !/refund|missing|didn'?t|eligible|qualify/.test(t) &&
      /(?:auto(?:matic(?:ally)?)?|by\s*itself|without\s*(?:me|my)|change\s*(?:my\s*)?(?:challenge|account)\s*rules)/.test(t) &&
      /card|pack|apply/.test(t),
  },
  {
    id: 'packs.inventory-use-card',
    conf: 0.9,
    test: (t) =>
      !/missing|didn'?t|did\s*not|refund|eligible/.test(t) &&
      /(?:inventory|use\s*(?:a\s*)?card|apply\s*(?:a\s*)?card|save\s*for\s*checkout|where\s*are\s*(?:my\s*)?(?:elite\s*pack\s*)?cards)/.test(
        t
      ) &&
      !/\b(?:did i|check my|confirm my)\b/.test(t),
  },
  {
    id: 'packs.eligibility-labels',
    conf: 0.88,
    test: (t) =>
      /(?:works?\s*on|eligible|which\s*accounts?).{0,30}card|card.{0,30}(?:challenge|funded|instant)/.test(t) &&
      !/skip\s*a\s*step|drawdown\s*buffer|payout\s*boost|am i|do i qualify/.test(t),
  },
  {
    id: 'packs.lucky-streak',
    conf: 0.94,
    test: (t) => /lucky\s*streak/.test(t),
  },
  {
    id: 'packs.special-packs',
    conf: 0.9,
    test: (t) => /special\s*pack/.test(t) && !/chain|pack\s*pass/.test(t),
  },
  {
    id: 'packs.collection',
    conf: 0.88,
    // Below card-count. Only when asking about Collection tab / discovery, not total card count.
    test: (t) =>
      /\bcollection\b/.test(t) &&
      /(?:tab|discover|discovered|track|recent\s*pulls|odds\s*for)/.test(t) &&
      !/how\s*many\s*cards|76|80\s*cards|in\s*total|to\s*collect/.test(t),
  },
  {
    id: 'packs.which-pack-best',
    conf: 0.9,
    test: (t) => /which\s*pack\s*(?:is\s*)?best|best\s*pack|should\s*i\s*buy/.test(t),
  },
  {
    id: 'packs.simulated',
    conf: 0.9,
    test: (t) => /simulated|real\s*money\s*account|are\s*(?:the\s*)?accounts?\s*real/.test(t) && /pack|card|elite/.test(t),
  },
  {
    id: 'packs.dashboard-tabs',
    conf: 0.9,
    test: (t) => /dashboard|tabs?|where\s*(?:do\s*i\s*)?find/.test(t) && /elite\s*packs?|packs?\s*tab|inventory|credits\s*tab/.test(t),
  },
  {
    id: 'packs.overview',
    conf: 0.8,
    test: (t) =>
      /^(?:what\s*are\s*elite\s*packs?\??|elite\s*packs?\s*(?:overview|explained)\??|how\s*do\s*elite\s*packs?\s*work\??)\s*$/.test(
        t.trim()
      ) ||
      (/what\s*are\s*elite\s*packs?/.test(t) &&
        !/drop|odds|credit|free\s*pack|million|exotic|inventory|whale|oracle|ignition|subscription|refund|card|primordial|chance|pack\s*pass/.test(
          t
        )),
  },
];

const SELECTORS = Object.freeze(
  RAW_SELECTORS.map((s) =>
    Object.freeze({
      id: s.id,
      conf: s.conf,
      test: gatedTest(s.test),
    })
  )
);

async function selectPacksAnswer(text, opts) {
  opts = opts || {};
  const raw = String(text || '');
  const t = raw.toLowerCase();
  const lang = opts.lang || detectLangHint(raw);
  let prod = packsProductHint(raw);

  if (opts.stop === true || opts.aiOff === true || opts.globalPause === true || opts.finWait === true) {
    return { abstain: true, reason: 'control-gate', confidence: 1 };
  }
  if (opts.protectedTeam === true) {
    return { abstain: true, reason: 'protected-team-silence', confidence: 1 };
  }

  // --- Option 1: mandatory ownership / account-status pre-gate ---
  // Runs before free-tier shortcuts, refund/missing routing, product SELECTORS, and ML.
  // No exception may skip evaluateOwnershipPregate; selectors consult the same result.
  const gate = pregate.evaluateOwnershipPregate(raw, opts);
  if (gate.kind === pregate.KIND.PERSONAL || gate.kind === pregate.KIND.AMBIGUOUS) {
    const refused = selectId(
      'packs.account-status.refuse',
      lang,
      0.99,
      gate.reason || 'account-status-boundary',
      prod || 'elite-packs'
    );
    refused.pregateKind = gate.kind;
    return refused;
  }
  if (gate.kind === pregate.KIND.REFUND) {
    prod = prod || 'elite-packs';
    const refunded = selectId('packs.refunds-legal', lang, 0.99, 'intent-refund', prod);
    refunded.pregateKind = gate.kind;
    return refunded;
  }
  if (gate.kind === pregate.KIND.MISSING) {
    prod = prod || 'elite-packs';
    const missing = selectId('packs.missing-reward', lang, 0.99, 'intent-missing-item', prod);
    missing.pregateKind = gate.kind;
    return missing;
  }
  // kind === NOT_PERSONAL only from here. Product select still requires explicit permit.
  if (!pregate.productSelectPermitted(gate)) {
    const closed = selectId(
      'packs.account-status.refuse',
      lang,
      0.99,
      'pregate-fail-closed',
      prod || 'elite-packs'
    );
    closed.pregateKind = gate.kind;
    return closed;
  }

  const nonLatinPacks =
    (/[\u0600-\u06ff]/.test(raw) && /پیک|ایلٹ/.test(raw)) ||
    (/[\u0900-\u097f]/.test(raw) && /पैक|कार्ड|Elite\s*Packs/i.test(raw));
  if (!prod && !opts.forcePacks && !nonLatinPacks) {
    if (
      !/\b(?:ignition|oracle|whale|pack\s*credits?|the\s*million|pack\s*pass|lucky\s*streak|redeem\s*key|drop\s*rates?|purple\s*card|100\s*%\s*payout|skip\s*a\s*step|drawdown\s*buffer|primordial|mythic|free\s*pack|instant\s*override|founder'?s?\s*key|refund|missing)\b/.test(
        t
      )
    ) {
      return { abstain: true, reason: 'not-elite-packs', confidence: 0.2, productHint: prod, lang, pregateKind: gate.kind };
    }
  }

  const matches = [];
  for (const sel of SELECTORS) {
    try {
      if (sel.test(t, prod, gate)) matches.push(sel);
    } catch (_) {
      /* ignore */
    }
  }
  matches.sort((a, b) => b.conf - a.conf);

  if (
    pregate.productSelectPermitted(gate) &&
    (!matches.length || matches[0].conf < CONFIDENCE_THRESHOLD) &&
    (lang === 'ur' || lang === 'hi' || lang === 'es' || lang === 'ur-latn' || lang === 'pt' || lang === 'ar')
  ) {
    if (/پیک|ایلٹ|पैक|Elite\s*Packs|paquete|pacote|pack|بطاقات/i.test(raw)) {
      if (/ڈراپ|ड्रॉप|drop|odds|ریٹ|रेट|rate|tasas|chance/i.test(raw)) matches.push({ id: 'packs.drop-rates', conf: 0.9 });
      else if (/کارڈ|कार्ड|76|card|cartas|بطاقات/i.test(raw)) matches.push({ id: 'packs.card-count', conf: 0.9 });
      else if (
        /cost|precio|preço|crédito|credits|ignition|oracle/i.test(raw) &&
        !personalBalanceCue(raw) &&
        !pregate.isPersonalOrAmbiguous(raw)
      ) {
        matches.push({ id: 'packs.pack-costs-floors', conf: 0.9 });
      } else if (/million|primordial/i.test(raw)) matches.push({ id: 'packs.the-million', conf: 0.9 });
      else matches.push({ id: 'packs.overview', conf: 0.85 });
      matches.sort((a, b) => b.conf - a.conf);
    }
  }

  // Defense-in-depth: ML objects are not gatedTest wrappers. Never emit a
  // product FAQ if the gate is missing, uncertain, or blocking.
  if (!pregate.productSelectPermitted(gate)) {
    const closed = selectId(
      'packs.account-status.refuse',
      lang,
      0.99,
      'pregate-fail-closed',
      prod || 'elite-packs'
    );
    closed.pregateKind = gate && gate.kind;
    return closed;
  }

  for (const sel of matches) {
    if (sel.conf < CONFIDENCE_THRESHOLD) break;
    const id = preferSendableLocaleId(sel.id, lang);
    if (!id) continue;
    const row = approved.get(id);
    if (!row || !rowIsSendable(row)) continue;
    return {
      abstain: false,
      answerId: id,
      confidence: sel.conf,
      contentHash: row.contentHash,
      reason: 'packs-cue-select',
      productHint: prod || 'elite-packs',
      lang,
    };
  }

  if (matches.length && matches[0].conf >= CONFIDENCE_THRESHOLD) {
    const probed = matches[0].id + '.en';
    const probedRow = approved.get(probed);
    if (
      probedRow &&
      (probedRow.status === 'needs_owner_decision' ||
        probedRow.status === 'provisional' ||
        probedRow.sendable === false)
    ) {
      return {
        abstain: true,
        reason: 'needs-owner-decision-fail-closed',
        confidence: matches[0].conf,
        matchedNonSendableId: probed,
        productHint: prod || 'elite-packs',
        lang,
      };
    }
  }

  return {
    abstain: true,
    reason: 'no-confident-select',
    confidence: matches[0] ? matches[0].conf : 0,
    productHint: prod,
    lang,
  };
}

module.exports = {
  CONFIDENCE_THRESHOLD,
  detectLangHint,
  packsProductHint,
  accountStatusAsk,
  personalPossessionCue,
  personalBalanceCue,
  isProductCatalogAsk,
  refundIntent,
  missingItemIntent,
  selectPacksAnswer,
  SELECTORS,
  evaluateOwnershipPregate: pregate.evaluateOwnershipPregate,
  productSelectPermitted: pregate.productSelectPermitted,
  KIND: pregate.KIND,
  pregate,
};
