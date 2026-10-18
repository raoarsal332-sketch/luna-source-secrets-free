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
  if (gate.allowsAnswer !== true) return { ok: false, reason: 'language-gate-not-allowed' };
  if (typeof gate.language !== 'string' || gate.language.toLowerCase() !== 'en') {
    return { ok: false, reason: 'language-gate-not-english' };
  }
  if (gate.confident === false || gate.uncertain === true || gate.mixed === true) {
    return { ok: false, reason: 'language-gate-uncertain' };
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
      // Ownership / account-state is decided by the clause-level pregate (gatedTest); no legacy cue here.
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

function bestProductMatch(t, prod, gate) {
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
      if (clauseHasItem && !covered) {
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
