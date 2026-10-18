'use strict';
/**
 * Elite Packs answer selection — CLASSIFY / SELECT only (V12 contract).
 * Never returns free-text facts; only an approved answer_id or abstain.
 *
 * t739 contract:
 *  - OFF by default: nothing is selected unless opts.packsEnabled === true.
 *  - English only: opts.languageGate (shared language gate result) is REQUIRED
 *    and must positively allow English; absent / malformed / uncertain =>
 *    abstain. A local non-English detector backs it up (defence in depth).
 *  - The ownership pregate (clause-level, packsOwnershipPregate) runs before
 *    every selector. Product selectors run only when productSelectPermitted(gate).
 *  - PERSONAL / MIXED  -> approved account-status refusal.
 *    AMBIGUOUS / unresolved / multi-intent -> approved handoff (clarification).
 *    REFUND / MISSING (every clause) -> their dedicated approved answers.
 *    Never a partial answer and never a nearest-FAQ substitution.
 *  - Every emitted id must be sendable AND pass the narrow-only scope check
 *    (intentTags can remove a row from a role, never add one).
 */
const approved = require('./packsApprovedAnswers');
const pregate = require('./packsOwnershipPregate');

const CONFIDENCE_THRESHOLD = Number(process.env.LUNA_PACKS_SELECT_THRESHOLD || 0.72);

const DEFAULT_CONFIG = Object.freeze({ packsEnabled: false });

function isPacksEnabled(opts) {
  return !!(opts && opts.packsEnabled === true);
}

/**
 * Shared language-gate input. Expected shape (produced by the other author's
 * shared gate):
 *   { language: 'en', confident: true, allowsAnswer: true }
 * Anything else (undefined, null, wrong type, allowsAnswer !== true,
 * language !== 'en', confident === false, uncertain/mixed === true) fails closed.
 */
function languageGateDecision(gate) {
  if (gate === undefined || gate === null) return { ok: false, reason: 'language-gate-absent-fail-closed' };
  if (typeof gate !== 'object' || Array.isArray(gate)) return { ok: false, reason: 'language-gate-malformed-fail-closed' };
  const lang = typeof gate.language === 'string' ? gate.language.toLowerCase() : '';
  const english = lang === 'en' || lang.startsWith('en-') || lang.startsWith('en_');
  // Explicit rejection still fails closed. A missing allowsAnswer on confident English does not.
  if (gate.allowsAnswer === false || (gate.allowsAnswer != null && gate.allowsAnswer !== true)) {
    return { ok: false, reason: 'language-gate-not-allowed' };
  }
  if (!english) return { ok: false, reason: 'language-gate-not-english' };
  if (gate.confident === false || gate.uncertain === true || gate.mixed === true) {
    return { ok: false, reason: 'language-gate-uncertain' };
  }
  if (gate.allowsAnswer !== true && gate.confident !== true) {
    return { ok: false, reason: 'language-gate-not-allowed' };
  }
  return { ok: true, reason: 'language-gate-english' };
}

/**
 * Wrap every product selector: missing/blocking gate => no match (fail-closed).
 * Selectors must not fire unless productSelectPermitted(gate) === true.
 */
function gatedTest(fn) {
  return function packsGatedSelectorTest(t, prod, gate) {
    if (!pregate.productSelectPermitted(gate)) return false;
    return fn(t, prod, gate);
  };
}

function packsProductHint(text) {
  const t = String(text || '').toLowerCase();
  if (
    /\belite\s*packs?\b|\bpacks?\b|\bcards?\b|\bcredits?\b|\bkeys?\b|\brarit(?:y|ies)\b|\bodds\b|\binventory\b|\bcollection\b|\bmy\s*packs\b|\bopen(?:ing)?\s+(?:a\s+)?pack\b|\bpack\s*pass\b|\blucky\s*streak\b|\bthe\s*million\b|\bignition\b|\bbreakout\b|\bmarket\s*maker\b|\bwhale\b|\boracle\b|\bfounder'?s?\s*key\b|\binstant\s*override\b|\bopen\s*season\b|\blifetime\s*split\b|\bpayout\s*boost\b|\b100\s*%\s*payout\b|\bdrop\s*rates?\b|\bredeem\b|\bfree\s*packs?\b|\bexotic\b|\bprimordial\b|\bpurple\b|\bpink\b|\bmythic\b|\blegendary\b|\bsubscription\b|\bcrypto\b|\brefund|\bdiscount\b|\bcheckout\b|\bseal\b|\breveal\b|\bmultiplier\b|\bx[235]\b|\batom\b|\bsimulated\b|\bdashboard\b|\bgiveaway\b|\bepic\b/.test(
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
  return '';
}

/** Compatibility wrappers — decisions live in packsOwnershipPregate. */
function accountStatusAsk(text, opts) {
  return pregate.isPersonalOrAmbiguous(text, opts);
}
function personalPossessionCue(text, opts) {
  const g = pregate.evaluateOwnershipPregate(text, opts);
  return g.kind === pregate.KIND.PERSONAL || g.kind === pregate.KIND.MIXED;
}
function refundIntent(text) {
  return pregate.refundIntent(text);
}
function missingItemIntent(text) {
  return pregate.missingItemIntent(text);
}
function isProductCatalogAsk(text, opts) {
  return pregate.evaluateOwnershipPregate(text, opts).kind === pregate.KIND.NOT_PERSONAL;
}

function rowIsSendable(row) {
  if (!row) return false;
  if (typeof approved.isSendableRow === 'function') return approved.isSendableRow(row);
  return row.sendable === true && row.approval === 'source-verified';
}

function deliverableId(baseId, role) {
  const id = `${baseId}.en`;
  const row = approved.get(id);
  if (!row || !rowIsSendable(row)) return null;
  if (!approved.scopeAllows(row, role)) return null;
  return id;
}

function selectId(baseId, role, conf, reason, prod) {
  const id = deliverableId(baseId, role);
  if (!id) return { abstain: true, reason: reason + '-handoff', confidence: conf, lang: 'en' };
  const row = approved.get(id);
  return {
    abstain: false,
    answerId: id,
    confidence: conf,
    contentHash: row.contentHash,
    reason,
    productHint: prod || 'elite-packs',
    lang: 'en',
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
      (/chain\s*discount|upgrade\s*offer|90\s*seconds|same\s+pack\s+again|next\s+pack\s+after|15\s*%\s*off/.test(t) ||
        (/special\s*pack/.test(t) && /(?:chain|stack|better\s*offer)/.test(t)) ||
        (/15\s*%/.test(t) && /20\s*%/.test(t) && /pack/.test(t))),
  },
  {
    id: 'packs.discount-stacking',
    conf: 0.97,
    test: (t) =>
      ((/stack|combine|together\s+with/.test(t) && /discount|founder|checkout|offer|60\s*%/.test(t)) ||
        /two\s+discount\s+cards/.test(t) ||
        (/founder'?s?\s*key/.test(t) && /(?:stack|combine|other\s*discount|exception)/.test(t))) &&
      !/chain\s*discount|special\s*pack|atom/.test(t),
  },
  {
    id: 'packs.convert-payout-credits',
    conf: 0.97,
    test: (t) =>
      (/convert/.test(t) && /credits?/.test(t)) ||
      (/payout\s*credits?/.test(t) && /(?:buy\s+packs?|into\s+pack|pay\s+for|turn)/.test(t)) ||
      /convert\s+and\s+buy|short\s+on\s+credits/.test(t),
  },
  {
    id: 'packs.my-packs-keys',
    conf: 0.99,
    test: (t) =>
      /redeem\s+(?:a\s+|the\s+|my\s+)?key|redemption\s*key|giveaway\s*key|pack\s*key|my\s*packs\s*tab|what\s+is\s+(?:the\s+)?my\s*packs|where\s+do\s+free\s+packs\s+(?:show|appear|go)|unopened\s+free\s+packs/.test(t),
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
        /free\s*(?:elite\s*)?pack|new\s*account|launch\s*week|which\s*(?:account|size).{0,40}(?:bonus|free|oracle|whale|market\s*maker)/.test(
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
      if (/\bcollection\b/.test(t) && !/drop\s*rate|per\s*card|whale|oracle|ignition|breakout|market\s*maker/.test(t)) return false;
      const rateCue =
        /drop\s*rate|odds|probability|per\s*card|\bchance\b|how\s+likely|rarity\s+odds|exotic\s*rates?|(?:whale|oracle|ignition).{0,80}exotic\s*rates?|can\s+\w+\s+drop\s+exotic/.test(
          t
        );
      return rateCue && !/fast\s*open|charg|deduct|when\s*are\s*credits|how\s*many\s*credits/.test(t);
    },
  },
  {
    id: 'packs.card-count',
    conf: 0.96,
    test: (t) => {
      const perPack = /(?:\bper\b|\beach\b|\bevery\b|\ba\b|\ban\b|\bone\b|\bsingle\b)\s+packs?\b|cards?\s+in\s+(?:a|an|each|every|one|single)\s+pack\b|when\s+(?:\w+\s+){0,4}?open(?:ing)?\s+a\s+pack|same\s+number\s+of\s+cards|number\s+of\s+cards\s+inside/.test(t);
      if (perPack && !/in\s+total|exist|different|collection\s+size|size\s+of/.test(t)) return false;
      return (
        (/how\s*many\s*cards|how\s*many\s*different\s*cards|cards?\s*(?:exist|in\s*total|to\s*collect)|76|80\s*cards|card\s*reference|collection\s*size|size\s+of\s+the\s+(?:full\s+)?(?:card\s+)?collection|total\s+(?:number\s+of\s+)?cards/.test(
          t
        ) ||
          (/how\s*many/.test(t) && /(?:regular|exotic|primordial|mythic|legendary)/.test(t) && /card/.test(t))) &&
        !/in\s+(?:a|an|one|each|every|single)\s+pack\b/.test(t) &&
        !/\bper\s+pack\b/.test(t) &&
        !/credits?\s*(?:do i|have|left|balance)/.test(t)
      );
    },
  },
  {
    id: 'packs.cards-per-pack',
    conf: 0.97,
    // Keep "how many cards in an Exotic pack" → cards-per-pack; block definition paraphrases without how-many.
    test: (t) => {
      // "how many cards in a pack" / "cards in an Exotic pack" — not "how many cards to collect in Elite Packs".
      if (/to\s*collect|in\s*total|total\s+number|exist|collection\s*size|size\s+of\s+the|76|80\s*cards|how\s+many\s+different|\bodds\b|\bcollection\b/.test(t)) return false;
      const countInPack =
        /how\s*many\s*cards.{0,40}pack|cards?\s+per\s+pack|number\s+of\s+cards|three\s*cards|exactly\s*three|same\s+number\s+of\s+cards|cards?\s+(?:come|inside|in)\s+(?:a|an|each|every|one|single)\s+pack/.test(
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
      !/missing|didn'?t|did\s*not|refund|by\s+itself|on\s+its\s+own|automatically/.test(t) &&
      /(?:open(?:ing)?\s+(?:a\s+)?pack|fast\s*open|cut(?:ting)?\s*(?:the\s*)?seal|when.{0,30}charg|why.{0,20}charg|deduct|credits?\s*charg|close\s+the\s+pack|before\s+the\s+reveal|\breveal\b)/.test(
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
    test: (t) => /[×x]\s*[235]\b|\bx2\b|\bx3\b|\bx5\b|multipl|how\s*many\s*uses|uses\s*left|duplicates|used[\s-]up|five\s+times|mean\s*on\s*an?\s*elite\s*pack\s*card/.test(t),
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
      // Ownership / account-state is decided by the clause-level pregate (gatedTest); no legacy cue here.
      !/(?:drop\s*rate|odds|probability|\bchance\b|exotic\s*rates?|can\s+\w+\s+drop\s+exotic)/.test(t) &&
      (/(?:exotic(?:\s+\w+){0,4}\s*cards?|instant\s*override|lifetime\s*split|open\s*season|بطاقات\s*exotic|exotic\s*بطاقات|cartas?\s*exotic|exotic\s*cartas?)/.test(t) ||
        (/founder'?s?\s*key/.test(t) && !/stack|combine|other\s*discount|exception/.test(t))),
  },
  {
    id: 'packs.eligibility-labels',
    conf: 0.96,
    test: (t) =>
      (/eligibility\s+labels|any\s+account\s+mean|card\s+label/.test(t) ||
        (/skip\s*a\s*(?:trading\s*)?day|drawdown\s*buffer|drawdown\s*ceiling|skip\s*a\s*step|funded\s*reset|consistency\s*\+?\s*\d|leverage\s*boost|weekend\s*trading|funded\s*scalping|split\s*(?:70|80|90)/.test(
          t
        ) &&
          /(?:what\s*does|how\s*does|which\s*accounts?|works?\s*on|card)/.test(t))),
  },
  {
    id: 'packs.buy-credits',
    conf: 0.96,
    test: (t) =>
      (/(?:buy|add|top\s*up|purchase|get\s*more|kharid(?:u|na|o)?|comprar)\s+(?:more\s+|some\s+)?(?:pack\s*)?credits?/.test(t) ||
        /where.{0,40}(?:buy|purchase|top\s*up).{0,20}credits?/.test(t) ||
        /top\s*up\s+.{0,20}credits?/.test(t) ||
        /credits?\s*kaise\s*kharid/.test(t)) &&
        !/payout\s*credits?/.test(t) &&
        !/challenge/.test(t) &&
        !/crypto|discount\s*on|monthly|subscription|cancel|quantos|cuántos|کیتنے|कितने|tenho|بचे/.test(t),
  },
  {
    id: 'packs.crypto-discount',
    conf: 0.97,
    test: (t) => /crypto/.test(t) && /(?:discount|5\s*%|percent|off|bundle|save|cheaper|pay)/.test(t),
  },
  {
    id: 'packs.pack-costs-floors',
    conf: 0.93,
    test: (t) =>
      !/free\s*pack|new\s*account|launch\s*week|35\s*%\s*off|50\s*%\s*off/.test(t) &&
      /(?:how\s*much|how\s*many\s*credits|cost|price|floors?).{0,50}(?:ignition|breakout|market\s*maker|whale|oracle|pack)|(?:ignition|breakout|market\s*maker|whale|oracle).{0,40}(?:cost|price|how\s*many\s*credits|floor)|pack\s+tiers?.{0,40}(?:cost|credit|price)|credit\s+costs?/.test(
        t
      ) &&
      !/tell\s*me\s*about\s*the\s*(?:whale|oracle)/.test(t) &&
      !/rarity\s*floor/.test(t) &&
      !/credits?\s+tab|buy\s+a\s+challenge|two\s+(?:kinds|types)|payout\s*credits?/.test(t) &&
      !/free/.test(t),
  },
  {
    id: 'packs.rarity-floor',
    conf: 0.9,
    test: (t) =>
      /rarity\s*floor|lowest\s+rarity|rare\s+or\s+better|common\s+card|\bfloor\b/.test(t) &&
      /(?:whale|oracle|common|rare|uncommon|rarity|pack)/.test(t) &&
      !/tell\s*me\s*about|free\s*pack/.test(t),
  },
  {
    id: 'packs.credits-vs-payout-credits',
    conf: 0.94,
    test: (t) =>
      !/convert|buy\s*credits|how\s*many\s*credits\s*do\s*i|turn\s+my\s+payout/.test(t) &&
      ((/pack\s*credits?/.test(t) && /payout\s*credits?/.test(t) && !/buy\s+packs?|into\s+pack/.test(t)) ||
        /difference.{0,30}credits?|credits?\s*vs|what\s*(?:is|are)\s*(?:the\s*)?(?:pack\s*)?credits?|two\s+(?:kinds|types|balances)\s+of\s+credits?|buy\s+a\s+challenge|account\s+expires|cash\s+value|monetary\s+value/.test(t) ||
        (/pack\s*credits?/.test(t) && /real\s+money|expire|cash\s+value|monetary/.test(t))),
  },
  {
    id: 'packs.withdraw-credits',
    conf: 0.93,
    test: (t) =>
      /withdraw|cash(?:ed)?\s*out|transferable|withdrawable|\btransfer\b|sell\s+(?:my\s+|the\s+|your\s+)?credits?/.test(t) &&
      /credit/.test(t) &&
      !/refund/.test(t),
  },
  {
    id: 'packs.cancel-subscription',
    conf: 0.94,
    test: (t) => /cancel/.test(t) && /(?:subscription|monthly|renew)/.test(t),
  },
  {
    id: 'packs.monthly-subscription',
    conf: 0.93,
    test: (t) =>
      /monthly|subscription|billing|billed|one[\s-]off|renew/.test(t) &&
      /(?:credit|pack|bundle|plan|option)/.test(t) &&
      !/cancel/.test(t),
  },
  {
    id: 'packs.card-auto-apply',
    conf: 0.92,
    // Below refunds (0.99). Pure auto-apply questions only.
    test: (t) =>
      !/refund|missing|didn'?t|eligible|qualify/.test(t) &&
      /(?:auto(?:matic(?:ally)?)?|by\s*itself|on\s+its\s+own|itself|manually|without\s*(?:me|my)|change\s*(?:my\s*)?(?:challenge|account)\s*rules)/.test(t) &&
      /card|pack|apply/.test(t),
  },
  {
    id: 'packs.inventory-use-card',
    conf: 0.9,
    test: (t) =>
      !/missing|didn'?t|did\s*not|refund|eligible|where\s+(?:is|are|can\s+i\s+(?:see|find))|tabs?\b|\bmenu\b/.test(t) &&
      /(?:inventory|use\s*(?:a\s*)?cards?|apply\s+(?:a\s+|the\s+|my\s+)?cards?|save\s+(?:\w+\s+){0,4}?for\s*checkout|where\s*are\s*(?:my\s*)?(?:elite\s*pack\s*)?cards|redeem\s+(?:a\s+|the\s+)?cards?)/.test(
        t
      ) &&
      !/\b(?:did i|check my|confirm my)\b/.test(t) &&
      !/manually|by\s+itself|on\s+its\s+own|automatically/.test(t),
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
      (/recent\s+pulls/.test(t) ||
        (/\bcollection\b/.test(t) && /(?:tab|discover|discovered|track|recent\s*pulls|odds|show|\bfor\b)/.test(t))) &&
      !/how\s*many\s*cards|76|80\s*cards|in\s*total|to\s*collect|size\s+of\s+the|collection\s+size/.test(t),
  },
  {
    id: 'packs.which-pack-best',
    conf: 0.9,
    test: (t) =>
      /which\s*pack\s*(?:is\s*)?(?:the\s*)?best|best\s*(?:elite\s*)?pack|should\s*i\s*(?:buy|go\s*for)|worth\s*buying|recommend\s+i\s+open|which\s+tier\s+of\s+pack|what\s+pack\s+should\s+i\s+go/.test(t),
  },
  {
    id: 'packs.simulated',
    conf: 0.9,
    test: (t) => /simulated|real\s*money|live\s+account/.test(t) && /pack|card|elite|account|trading/.test(t),
  },
  {
    id: 'packs.dashboard-tabs',
    conf: 0.9,
    test: (t) =>
      /dashboard|\btabs?\b|\bmenu\b|\bsection\b|where\s*(?:do\s*i\s*|can\s+i\s*)?(?:find|is|see)|how\s+do\s+i\s+get\s+to/.test(t) &&
      /elite\s*packs?|packs?\s*tab|inventory|credits?\s*tab|collection/.test(t) &&
      !/how\s+many\s+cards|drop\s*rate|cost|price/.test(t) &&
      !/\bcollection\s+tab\b|\bthe\s+collection\b/.test(t),
  },
  {
    id: 'packs.overview',
    conf: 0.8,
    test: (t) =>
      /^(?:what\s*are\s*elite\s*packs?\??|elite\s*packs?\s*(?:overview|explained)\??|how\s*do\s*elite\s*packs?\s*work\??)\s*$/.test(
        t.trim()
      ) ||
      (/elite\s*packs?/.test(t) &&
        /what\s+(?:is|are)|how\s+(?:do|does)|overview|all\s+about|explained|\bwork\b|thing\s+is/.test(t) &&
        !/drop|odds|credit|free\s*pack|million|exotic|inventory|whale|oracle|ignition|breakout|subscription|refund|card|primordial|chance|pack\s*pass|\bmenu\b|\btab\b/.test(
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

function topicScores(t) {
  const rows = [];
  const add = (id, score) => {
    if (score >= 4) rows.push({ id, score });
  };
  const costQ = /how\s+much|how\s+many\s+credits|\bprice\b|\bcost\b|sell\s+for|credit\s+amount/.test(t);
  const oddsQ = /drop\s*rates?|\bodds\b|how\s+likely|probability|how\s+often/.test(t);
  const floorQ = /rarity\s+floor|minimum\s+rarity|lowest\s+rarity|common\s+card/.test(t);
  if (oddsQ && !/collection\s+tab/.test(t)) add('packs.drop-rates', 5 + (/\bwhale\b|\boracle\b|\bignition\b/.test(t) ? 2 : 0));
  if (floorQ) add('packs.rarity-floor', 6);
  if (costQ && /pack|oracle|whale|ignition|breakout|tier/.test(t) && !floorQ) add('packs.pack-costs-floors', 6);
  if (/\bwhale\b/.test(t) && !oddsQ && !costQ && !floorQ) add('packs.followup.whale-pack', 6);
  if (/\boracle\b/.test(t) && !oddsQ && !costQ && !floorQ && !/upgrade\s+offer|chain/.test(t)) add('packs.followup.oracle-pack', 6);
  if (/withdraw|cash\s*out|cashable|cashed/.test(t) && /credit/.test(t)) add('packs.withdraw-credits', 6);
  const convertQ = /convert|turned\s+into|turn\b[^.]{0,40}\binto\b|conversion/.test(t);
  if (/payout\s+credits?/.test(t) && /pack\s+credits?|differ|difference|versus|\bvs\b|separat|convert|turned\s+into|turn\b|conversion/.test(t) && !/withdraw|cash\s*out|cashable/.test(t)) {
    add(convertQ ? 'packs.convert-payout-credits' : 'packs.credits-vs-payout-credits', 6);
  }
  if (/two\s+credit\s+balances|balances\s+expire|pack\s+credits?\s+differ/.test(t)) add('packs.credits-vs-payout-credits', 6);
  if (/automatically|on\s+their\s+own|by\s+itself|on\s+its\s+own|sitting\s+unused|rewrite\s+rules|apply\s+automatically/.test(t)) add('packs.card-auto-apply', 6);
  if (/pack\s+pass/.test(t)) add('packs.pack-pass', 6);
  if (/three[-\s]card|three\s+(?:separate\s+)?card|cards?\s+per\s+pack/.test(t) || (/how\s+many\s+cards/.test(t) && /pack/.test(t) && !/collect|catalogue|catalog|in\s+total|distinct/.test(t))) {
    add('packs.cards-per-pack', 5);
  }
  if (/distinct\s+cards|catalogue|catalog|in\s+total|to\s+collect|different\s+cards/.test(t)) add('packs.card-count', 5);
  if (/top(?:\s|-)?up|purchase\s+additional|buy\s+(?:more\s+)?(?:pack\s+)?credits?/.test(t)) add('packs.buy-credits', 5);
  if (/monthly|subscription/.test(t) && /cancel/.test(t)) add('packs.cancel-subscription', 6);
  else if (/monthly|subscription/.test(t) && /credit|plan|renew|bill/.test(t)) add('packs.monthly-subscription', 5);
  if (/crypto/.test(t) && /discount|cheaper|percent|%|off/.test(t)) add('packs.crypto-discount', 6);
  if (/seal|reveal|deduct|charged|fast\s*open|open(?:ing)?\s+(?:a\s+)?pack|when\s+would\s+credits/.test(t) && !/refund/.test(t)) add('packs.opening-and-charges', 5);
  if (/chain|upgrade\s+offer|next\s+pack|second\s+pack/.test(t) && /discount|offer|%|after/.test(t)) add('packs.chain-upgrade-discounts', 5);
  if (/inventory|saved\s+card|apply\s+(?:a|one|the|my)/.test(t) && /apply|use|checkout|redeem/.test(t) && !/automatically|on\s+its\s+own|by\s+itself/.test(t)) add('packs.inventory-use-card', 5);
  if (/\bx3\b|\bx2\b|\bx5\b|times[-\s]three|multiplier|how\s+many\s+times/.test(t)) add('packs.uses-multiplier', 5);
  if (/stack|combin/.test(t) && /discount|offer|founder|checkout/.test(t)) add('packs.discount-stacking', 5);
  if (/eligible\s+label|skip\s+a\s+step|which\s+account\s+sizes/.test(t)) add('packs.eligibility-labels', 5);
  if (/exotic|instant\s+override|lifetime\s+split|open\s+season/.test(t) && !/showing|mine|do\s+i\s+own|in\s+my/.test(t)) add('packs.exotic-cards', 4);
  if (/primordial|the\s+million/.test(t)) add('packs.the-million', 5);
  if (/lucky\s+streak/.test(t)) add('packs.lucky-streak', 6);
  if (/special\s+pack/.test(t)) add('packs.special-packs', 5);
  if (/giveaway|redeem\s+key|my\s+packs\s+tab/.test(t)) add('packs.my-packs-keys', 5);
  if (/collection\s+tab/.test(t)) add('packs.collection', 6);
  if (/free\s+pack|complimentary\s+pack/.test(t) && !/pack\s+pass/.test(t)) add('packs.free-packs-general', 5);
  if (/purple|pink/.test(t) && /card/.test(t)) add('packs.followup.purple-card-ambiguous', 6);
  if (/payout\s+boost|100\s*%\s+payout/.test(t)) add('packs.followup.payout-boost-100', 6);
  if (/atom/.test(t) && /bundle|promo|pack/.test(t)) add('packs.atom-bundle-distinct', 5);
  if (/simulated/.test(t) || (/real\s+money/.test(t) && /account/.test(t))) add('packs.simulated', 6);
  if (/real\s+money/.test(t) && /pack\s+credits?/.test(t) && !/account/.test(t)) add('packs.credits-vs-payout-credits', 6);
  if (/which\s+tier|worth\s+opening|sensible\s+one\s+to\s+buy|which\s+pack|best\s+pack/.test(t)) add('packs.which-pack-best', 5);
  if (/\btabs?\b|\bmenu\b|\bdashboard\b/.test(t) && /inventory|collection|credits|packs/.test(t)) add('packs.dashboard-tabs', 5);
  if (/reward\s+packs?|three-card\s+reward|what\s+are\s+(?:these\s+)?(?:elite\s+)?packs|how\s+do\s+(?:elite\s+)?packs\s+work|big\s+picture/.test(t) && !oddsQ && !costQ) add('packs.overview', 4);
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

function regexBest(t, prod, gate) {
  const matches = [];
  for (const sel of SELECTORS) {
    try {
      if (sel.test(t, prod, gate)) matches.push(sel);
    } catch (_) {
      /* selector error => no match */
    }
  }
  matches.sort((a, b) => b.conf - a.conf);
  for (const sel of matches) {
    if (sel.conf < CONFIDENCE_THRESHOLD) break;
    const id = deliverableId(sel.id, 'product');
    if (id) return { id, baseId: sel.id, conf: sel.conf, top: matches[0] };
  }
  return { id: null, top: matches[0] || null };
}

function bestProductMatch(t, prod, gate) {
  const regex = regexBest(t, prod, gate);
  const ranked = topicScores(t);
  const top = ranked[0];
  const second = ranked[1];
  const margin = top ? top.score - (second ? second.score : 0) : 0;
  if (top && margin >= 2) {
    const id = deliverableId(top.id, 'product');
    const beatsRegex = !regex.id || regex.baseId === top.id || top.score >= 6;
    if (id && beatsRegex) {
      return { id, baseId: top.id, conf: Math.min(0.97, 0.75 + top.score / 40), top: { id: top.id, conf: 0.9 } };
    }
  }
  return regex;
}

function abstainResult(reason, extra) {
  return Object.assign({ abstain: true, reason, confidence: 1, lang: 'en' }, extra || {});
}

/**
 * @param {string} text customer text (current turn)
 * @param {object} opts
 *   packsEnabled      true only in an isolated test / opted-in config
 *   languageGate      shared language-gate result (REQUIRED, see languageGateDecision)
 *   forcePacks        caller-declared Packs scope (only suppresses the
 *                     "not-elite-packs" abstain; never affects the gate)
 *   priorClientTexts  previous customer turns (oldest -> newest); resolves
 *                     dropped subjects / anaphora; personal context never
 *                     resolves to a general reading
 *   stop/aiOff/globalPause/finWait/protectedTeam  control gates (abstain)
 */
async function selectPacksAnswer(text, opts) {
  opts = opts || {};
  if (!isPacksEnabled(opts)) {
    return abstainResult('packs-disabled-default', { confidence: 1 });
  }
  if (opts.stop === true || opts.aiOff === true || opts.globalPause === true || opts.finWait === true) {
    return abstainResult('control-gate');
  }
  if (opts.protectedTeam === true) {
    return abstainResult('protected-team-silence');
  }

  const lg = languageGateDecision(opts.languageGate);
  if (!lg.ok) return abstainResult(lg.reason, { languageGate: lg.reason });

  if (typeof text !== 'string') {
    return abstainResult('pregate-missing-text-fail-closed');
  }

  let gate;
  try {
    gate = pregate.evaluateOwnershipPregate(text, opts);
  } catch (_) {
    return abstainResult('pregate-throw-fail-closed');
  }
  if (!gate || typeof gate.kind !== 'string') {
    return abstainResult('pregate-malformed-fail-closed');
  }

  const norm = (gate.features && gate.features.normalized) || '';
  const localLang = pregate.languageEvidence(norm);
  if (localLang.nonEnglish) {
    return abstainResult('language-non-english-abstain', { languageEvidence: localLang.reasons.slice() });
  }

  const prod = packsProductHint(norm) || 'elite-packs';
  const tag = (r) => {
    r.pregateKind = gate.kind;
    r.pregateReason = gate.reason;
    return r;
  };

  if (gate.kind === pregate.KIND.PERSONAL || gate.kind === pregate.KIND.MIXED) {
    return tag(selectId('packs.account-status.refuse', 'refuse', 0.99, gate.reason || 'account-status-boundary', prod));
  }
  if (gate.kind === pregate.KIND.AMBIGUOUS) {
    return tag(selectId('packs.handoff.unverified', 'handoff', 0.99, gate.reason || 'ambiguous-handoff', prod));
  }
  if (gate.kind === pregate.KIND.REFUND) {
    return tag(selectId('packs.refunds-legal', 'refund', 0.99, 'intent-refund', prod));
  }
  if (gate.kind === pregate.KIND.MISSING) {
    return tag(selectId('packs.missing-reward', 'missing', 0.99, 'intent-missing-item', prod));
  }
  if (!pregate.productSelectPermitted(gate)) {
    return tag(selectId('packs.handoff.unverified', 'handoff', 0.99, 'pregate-fail-closed', prod));
  }

  // kind === NOT_PERSONAL and every clause positively general from here.
  if (
    !packsProductHint(norm) &&
    opts.forcePacks !== true &&
    !/\b(?:ignition|oracle|whale|pack\s*credits?|the\s*million|pack\s*pass|lucky\s*streak|redeem\s*key|drop\s*rates?|purple\s*card|100\s*%\s*payout|skip\s*a\s*step|drawdown\s*buffer|primordial|mythic|free\s*pack|instant\s*override|founder'?s?\s*key|refund|missing)\b/.test(
      norm
    )
  ) {
    return tag({ abstain: true, reason: 'not-elite-packs', confidence: 0.2, productHint: '', lang: 'en' });
  }

  const overall = bestProductMatch(norm, prod, gate);
  if (!overall.id) {
    if (overall.top && overall.top.conf >= CONFIDENCE_THRESHOLD) {
      const probed = approved.get(overall.top.id + '.en');
      if (probed && !rowIsSendable(probed)) {
        return tag({
          abstain: true,
          reason: 'needs-owner-decision-fail-closed',
          confidence: overall.top.conf,
          matchedNonSendableId: overall.top.id + '.en',
          productHint: prod,
          lang: 'en',
        });
      }
    }
    return tag({
      abstain: true,
      reason: 'no-confident-select',
      confidence: overall.top ? overall.top.conf : 0,
      productHint: prod,
      lang: 'en',
    });
  }

  // Clause coverage: every positively-general clause that names an item must
  // independently select the same approved answer. Disagreement or an
  // unanswerable clause => handoff, never a partial answer.
  const winners = new Set();
  for (const c of gate.clauses || []) {
    if (c.verdict !== pregate.VERDICT.GENERAL || c.anaphoric) continue;
    // A condition is not its own question. A fragment that selects nothing is not a
    // second intent; a fragment that selects a different row is.
    if (c.frame === 'cond' || c.frame === 'cond-procedure') continue;
    if (c.intro && /^(?:if|unless|because|since|although|though|whereas)$/.test(c.intro)) continue;
    const w = bestProductMatch(c.text, prod, gate);
    if (!w.id) {
      const clauseHasItem = pregate.PACKS_ITEM_RE.test(c.text) || pregate.NAMED_CARD_RE.test(c.text);
      const covered = clauseHasItem && SELECTORS.some((sel) => sel.id + '.en' === overall.id && sel.test(c.text, prod, gate));
      // The topic verb may sit in the condition ("credits taken if I open a pack").
      // A condition that selects the same row is one intent, not a second topic.
      const siblingCovers = (gate.clauses || []).some((x) => {
        if (x === c || x.verdict !== pregate.VERDICT.GENERAL) return false;
        const isCond =
          x.frame === 'cond' ||
          x.frame === 'cond-procedure' ||
          (x.intro && /^(?:if|unless|because|since|although|though|whereas)$/.test(x.intro));
        if (!isCond) return false;
        return SELECTORS.some((sel) => sel.id + '.en' === overall.id && sel.test(x.text, prod, gate));
      });
      if (clauseHasItem && !covered && !siblingCovers) {
        return tag(selectId('packs.handoff.unverified', 'handoff', 0.99, 'clause-unresolved-no-partial-answer', prod));
      }
      continue;
    }
    winners.add(w.id);
  }
  if (winners.size > 1 || (winners.size === 1 && !winners.has(overall.id))) {
    return tag(selectId('packs.handoff.unverified', 'handoff', 0.99, 'multi-intent-no-partial-answer', prod));
  }

  const row = approved.get(overall.id);
  return tag({
    abstain: false,
    answerId: overall.id,
    confidence: overall.conf,
    contentHash: row.contentHash,
    reason: 'packs-cue-select',
    productHint: prod,
    lang: 'en',
  });
}

module.exports = {
  CONFIDENCE_THRESHOLD,
  DEFAULT_CONFIG,
  isPacksEnabled,
  languageGateDecision,
  packsProductHint,
  accountStatusAsk,
  personalPossessionCue,
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
