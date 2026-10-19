'use strict';
/**
 * Elite Atom answer selection — t739 corrected selector (STAGING, ISOLATED).
 *
 * CLASSIFY / SELECT only. Never returns free text; only an approved answer id, or
 * an abstain / clarify / handoff decision with machine-readable reason codes.
 *
 * Order of operations (see INTERFACE.md):
 *   0. gates: atom OFF by default, pause/stop, shared language gate (fail closed)
 *   1. resolve monetary referent -> requested relationship -> conditions
 *   2. deny classes that have NO approved row (fee recovery, fee x payout, ...)
 *   3. account-specific boundary
 *   4. choose exactly one frame by proposition (topic + product + condition)
 *   5. only then pick the row, narrowed by atomAnswerScope, checked against the KB
 *
 * Does NOT touch index.js / faqAssistance.js / faqAnswerSelect.js. The load-path
 * integration (resolveExtraPath) is BLOCKED (file missing) and is not guessed.
 */
const path = require('path');
const approved = require('./atomApprovedAnswers');
const frame = require('./atomMoneyFrame');
const scope = require('./atomAnswerScope');

const KB_PATH =
  process.env.LUNA_ATOM_APPROVED_ANSWERS || path.join(__dirname, 'faq-approved-answers-atom-v1.json');

const HANDOFF_ID = 'atom.handoff.unverified.en';
const REFUSE_ID = 'atom.account-status.refuse.en';
const MAX_PRIOR_TURNS = 6;

function atomSelectorEnabled(opts) {
  if (opts && opts.enabled === true) return true;
  if (opts && opts.enabled === false) return false;
  return process.env.LUNA_ATOM_SELECTOR_ENABLED === '1';
}

// ---------------------------------------------------------------------------
// Closed vocabularies for money frames (deny-by-default on unknown words).
// ---------------------------------------------------------------------------
const w = (s) => s.split(/\s+/).filter(Boolean);
const BASE = new Set(
  w(
    'a an the this that these those it its is are was were be been being am do does did can could will would should may might must ' +
      'have has had having of for on in at to from by with about as into per than then there here also still just only really ' +
      'actually please pls hi hello hey thanks thank you your yours i me we us our they their and or but if so not no yes any ' +
      'some all each every both either other another more most less much many few such same very too quite what which who whom ' +
      'whose where when why how whether tell know explain show wondering wonder curious ask asking question quick quickly ' +
      'clarify understand details detail info information confirm want need like let lets kindly regarding concerning ' +
      'currently current right now today again ever always never anymore anyway generally usually typically normally exactly ' +
      'approximately roughly basically ok okay yeah sure s t re ve ll d m ain won don doesn didn isn aren wasn weren ' +
      'whats hows thats theres ive im ill id youre theyre dont doesnt isnt cant wont didnt arent wasnt ' +
      'one ones two three four five six seven eight nine ten fourteen twenty elite fundedelite funded challenge challenges account accounts plan plans step steps ' +
      // neutral discourse / request framing words (cycle 1): these never change the proposition
      'walk walks through give gives help helps would specifically briefly simple simply terms basics basic overview describe describes ' +
      'involve involves involved general allowed permitted okay correct verify saw seen heard read told someone somebody said says say ' +
      'mentioned brochure article video website site online regular normal standard actual happen happens happened once while during own ' +
      'across within up down out my mine me exact exactly sure possible possibly let lets making made make makes goes go going ' +
      'explained explaining explanation clarification clarifying understanding learn learning learned know knowing known about regarding ' +
      'details detail specific mean means meaning meant work works worked working use used using start started'
  )
);

const VOCAB = {
  price: new Set(
    w(
      'price prices pricing priced cost costs costing fee fees charge charges list listed lists published official total size ' +
        'sizes tier tiers available offered sell sold buy buying purchase purchasing pay get getting take order ordering ' +
        'usd dollar dollars before after without difference between compare available offered range ' +
        'come comes offer offers legit real correct accurate permanent permanently forever always valid promo promotional deal offer offers ' +
        'much amount starting ticket regular normal exact challenge challenges each every account accounts'
    )
  ),
  payout: new Set(
    w(
      'first later next subsequent following last interval intervals schedule schedules timing timeline frequency frequent ' +
        'frequently every wait waiting long soon often fast many days day weeks week time times cap capped caps maximum max ' +
        'limit limits ceiling instrument instruments risk request requests requesting default purchased option options ' +
        'checkout rules rule policy policies process terms conditions work works working structure start starting balance ' +
        'created creation allowed possible available biggest largest highest come comes arrive arrives happen happens get getting receive receiving make profit profits above over excess stays stay ' +
        'carry carried after before between since until once pay pays eligible ' +
        'withdraw withdrawal withdrawals withdrawn withdrawing pick picks choose chosen apply applies applying report cycle cycles period ' +
        'payout payouts later rest remaining available allowance funding funded'
    )
  ),
  split: new Set(
    w(
      'profit profits split splits share shares sharing reward rewards keep kept cut percent percentage default standard ' +
        'options option chosen choose choice choices selected checkout apply applies applied applying work works get getting ' +
        'receive go goes trader traders firm pay pays available possible offered offer offers pick picks choose percentages ' +
        'funded keeps keep customise customize customised customized option options reward bigger higher larger greater'
    )
  ),
  checkout: new Set(
    w(
      'checkout check out customise customize customisation customization options option choose choices configure ' +
        'configuration configurations setting settings default defaults available add addon addons weekend holding hold ' +
        'scalping partial interval intervals reward rewards leverage loss target targets max maximum days include included allow allows allowed ' +
        'optional offered get getting buy buying purchase purchasing customisable customizable pick picks chosen choosable ' +
        'payout payouts what can set sets changeable change changes configurable'
    )
  ),
  boundary: new Set(
    w(
      'my mine our account accounts kyc verification verified verify approval approved approve eligible eligibility status ' +
        'breach breached breaches pass passed fail failed funded reset check request requested pending processed processing ' +
        'review reviewed reviewing closed active denied rejected declined sent arrived arrive arrives when why has have did was ' +
        'am is will profit profits split share reward rewards balance equity dashboard trades trade yet already ready qualify ' +
        'qualified qualifies get got paid phase phases'
    )
  ),
  bundle: new Set(
    w(
      'bundle bundles multiple several second third fourth discount discounts off percent pack packs market maker credit ' +
        'credits free order orders same together buy buying purchase purchasing get getting withdrawable work works apply ' +
        'applies expire expires multi purchase purchases deal deals offer offers once time at third second fourth fifth account accounts ' +
        'multiaccount'
    )
  ),
};

const FRAME_PLACEHOLDERS = {
  price: ['ATOM', 'PROD', 'SIZE', 'AMT', 'PRELIST'],
  payout: ['ATOM', 'PROD', 'SIZE', 'AMT', 'PAYOUT', 'ORD', 'NUM', 'PCT'],
  split: ['ATOM', 'PROD', 'SIZE', 'AMT', 'PAYOUT', 'ORD', 'NUM', 'PCT', 'RATIO'],
  checkout: ['ATOM', 'PROD', 'SIZE', 'PAYOUT', 'NUM', 'PCT', 'RATIO'],
  bundle: ['ATOM', 'PROD', 'SIZE', 'ORD', 'NUM', 'PCT', 'PAYOUT'],
  boundary: ['ATOM', 'PROD', 'SIZE', 'PAYOUT', 'ORD', 'NUM', 'AMT'],
};

function stemCandidates(tk) {
  const out = [];
  if (tk.length > 4 && /ies$/.test(tk)) out.push(tk.slice(0, -3) + 'y');
  if (tk.length > 3 && /(?:ses|xes|ches|shes)$/.test(tk)) out.push(tk.slice(0, -2));
  if (tk.length > 3 && /s$/.test(tk)) out.push(tk.slice(0, -1));
  if (tk.length > 4 && /ed$/.test(tk)) out.push(tk.slice(0, -2), tk.slice(0, -1));
  if (tk.length > 5 && /ing$/.test(tk)) out.push(tk.slice(0, -3), tk.slice(0, -3) + 'e');
  if (tk.length > 5 && /ly$/.test(tk)) out.push(tk.slice(0, -2));
  return out;
}

function residualTokens(tokens, frameName) {
  const vocab = VOCAB[frameName];
  const ph = new Set(FRAME_PLACEHOLDERS[frameName]);
  const known = (tk) => BASE.has(tk) || vocab.has(tk);
  const out = [];
  for (const tk of tokens) {
    if (/^[A-Z]+$/.test(tk)) {
      if (!ph.has(tk)) out.push(tk);
      continue;
    }
    if (known(tk)) continue;
    if (stemCandidates(tk).some(known)) continue;
    out.push(tk);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Result builders
// ---------------------------------------------------------------------------
function abstain(reason, extra) {
  return Object.assign(
    { abstain: true, action: 'abstain', reason, failClosed: true, lang: 'en', sendable: false },
    extra || {}
  );
}

function clarify(slot, reason, extra) {
  return abstain(reason, Object.assign({ action: 'clarify', clarify: { slot } }, extra || {}));
}

function handoff(reason, extra) {
  return abstain(reason, Object.assign({ action: 'handoff', handoff: true, handoffAnswerId: HANDOFF_ID }, extra || {}));
}

function summarize(A, extra) {
  const e = A.e;
  const flags = Object.keys(e).filter((k) => e[k] === true);
  return Object.assign(
    {
      product: A.product,
      ordinals: A.slots.ords.slice(),
      amounts: A.slots.amounts.map((a) => a.value),
      sizes: A.slots.sizes.slice(),
      pcts: A.slots.pcts.slice(),
      evidence: flags,
    },
    extra || {}
  );
}

function sendableRow(id) {
  const row = approved.get(id, KB_PATH);
  if (!row || !approved.isSendable(row)) return null;
  return row;
}

function answerResult(id, confidence, reason, fr, A, qualifiers) {
  const row = sendableRow(id);
  if (!row) {
    return abstain('non-sendable-status-fail-closed', { handoff: true, handoffAnswerId: HANDOFF_ID, diagnostics: { candidate: id } });
  }
  const adm = scope.admit(id, {
    frame: fr.scopeFrame,
    product: fr.product,
    relationship: fr.relationship,
    qualifiers,
  });
  if (!adm.ok) {
    if (/^qualifier-not-covered/.test(adm.reason)) {
      return abstain(adm.reason, { diagnostics: { candidate: id, frame: fr, qualifiers: [...qualifiers] } });
    }
    return abstain('scope-narrowed:' + adm.reason, { diagnostics: { candidate: id, frame: fr } });
  }
  return {
    abstain: false,
    action: 'answer',
    answerId: id,
    confidence,
    reason,
    lang: 'en',
    contentHash: row.contentHash,
    intentTags: row.intentTags.slice(),
    status: row.status,
    approval: row.approval,
    sendable: true,
    frame: { name: fr.name, relationship: fr.relationship, product: fr.product, qualifiers: [...qualifiers] },
  };
}

// ---------------------------------------------------------------------------
// Account-specific boundary (runs AFTER fee-policy deny classes).
// ---------------------------------------------------------------------------
function accountSpecific(t) {
  // A published payout schedule (first wait, interval, cap, how often) is not an account lookup,
  // even when the wording is colloquial ("my first payout"). Personal status words still refuse.
  const personalStatus =
    /\b(?:kyc|eligib\w*|account\s+status|verif\w*|approv\w*|breach\w*|denied|rejected|declined|dashboard|reset|qualif\w*|arriv\w*|sent|processed|processing|pending|ready)\b/.test(t);
  const publishedPayoutSchedule =
    /\b(?:payouts?|withdrawals?|cash\s*-?\s*outs?)\b/.test(t) &&
    /\b(?:first|next|later|subsequent|intervals?|caps?|capped|rules?|policy|policies|how\s+often|how\s+long|how\s+soon|every|schedule)\b/.test(t) &&
    !personalStatus;
  if (publishedPayoutSchedule) return false;
  if (/\b(?:my|our)\b.{0,40}\b(?:kyc|payouts?|withdrawals?|breach(?:ed)?|account\s+status|verification|approval|eligib\w*|status|request)\b/.test(t)) return true;
  if (/\b(?:kyc|payouts?|withdrawals?|breach(?:ed)?|verification|approval|eligib\w*|split|share|reward|rewards)\b.{0,40}\b(?:my|our)\s+(?:[\w-]+\s+){0,3}(?:account|payout|withdrawal|challenge|request|order)\b/.test(t)) return true;
  if (/\b(?:did|have|has)\s+(?:i|we)\s+(?:breach\w*|pass(?:ed)?|fail(?:ed)?|qualif\w*|(?:get|become|been)\s+funded)\b/.test(t)) return true;
  if (/\b(?:am|are)\s+(?:i|we)\s+(?:funded|eligible|approved|verified|breached|qualified)\b/.test(t)) return true;
  if (/\b(?:can|could|will|would)\s+(?:i|we)\s+(?:get|become|be)\s+funded\b/.test(t)) return true;
  if (/\b(?:is|was|has)\s+my\b.{0,40}\b(?:approved|verified|closed|breached|paid|sent|eligible)\b/.test(t)) return true;
  if (/\bcheck\s+my\b.{0,40}\b(?:account|payout|kyc|status|breach)\b/.test(t)) return true;
  if (/\b(?:am i|can i get)\b.{0,40}\b(?:payout|paid|eligible)\b/.test(t) && /\b(?:my|account|now)\b/.test(t)) return true;
  return false;
}

/** Personal state, not the published rule. "for a friend" and "my own accounts" (copier) are not this. */
function personalState(c) {
  if (/\b(?:my|our)\s+(?:own\s+)?(?:situation|case)\b/.test(c)) return true;
  if (/\b(?:my|our)\s+(?:current|personal|live|actual)\s+(?:drawdown|loss|floor|phase|target|balance|equity|status|account)\b/.test(c)) return true;
  if (/\b(?:my|our)\s+trailing\s+drawdown\b/.test(c)) return true;
  if (/\boverview\s+of\s+me\b|\babout\s+me\b/.test(c)) return true;
  return false;
}

const OVERVIEW_SHELL = new Set(
  'challenge challenges program programs product products account accounts plan plans overview platform service firm company intro introduction summary basics'.split(
    ' '
  )
);

function leverage150(A) {
  const ratios = (A.slots.ratios || []).map((r) => String(r).replace(/\s+/g, ''));
  if (ratios.some((r) => r === '1:150' || r === '150:1')) return true;
  if ((A.slots.nums || []).includes(150)) return true;
  return /\b150\b/.test(A.n.t);
}

function isPureOverview(A, c) {
  if (/\b(?:everything|all\s+rules|every\s+rule)\b/.test(c)) return false;
  if (personalState(c)) return false;
  // "I am new" names the speaker, not a product condition.
  const speaker = new Set();
  for (const m of c.matchAll(/\b(?:i am|im|we are)\s+([a-z]+)\b/g)) speaker.add(m[1]);
  const cw = [];
  for (const tk of A.tokens) {
    if (/^(?:PAYOUT|AMT|PCT|RATIO|ORD|SIZE|PRELIST|REALCAPITAL)$/.test(tk)) {
      cw.push(tk);
      continue;
    }
    if (/^[A-Z]+$/.test(tk)) continue;
    if (speaker.has(tk)) continue;
    if (BASE.has(tk) || stemCandidates(tk).some((s) => BASE.has(s))) continue;
    cw.push(tk);
  }
  const shellish = (w) => OVERVIEW_SHELL.has(w) || stemCandidates(w).some((s) => OVERVIEW_SHELL.has(s));
  if (cw.some((w) => !shellish(w))) return false;
  return /\bATOM\b/.test(c);
}

// ---------------------------------------------------------------------------
// Rule (non-money) topics
// ---------------------------------------------------------------------------
const P1 = 'atom-1step';
const P2 = 'atom-2step';

function ruleTopics(A) {
  const c = A.c;
  const t = A.n.t;
  const e = A.e;
  const pcts = A.slots.pcts;
  const out = [];
  const consistency =
    /consisten/.test(c) ||
    /\bbest\s+(?:single\s+)?(?:trading\s+)?day\b/.test(c) ||
    /\b(?:one|single|any)\s+day\b.{0,40}\b(?:more\s+than\s+)?half\b.{0,24}\b(?:profit|total)\b/.test(c) ||
    /\bhalf\s+(?:of\s+)?(?:my\s+|the\s+|your\s+|total\s+)?profit\b/.test(c);
  const daily = /\b(?:daily|intraday)\b.{0,24}\b(?:loss|limit|drawdown)\b|\b(?:loss|losses|lose|limit)\b.{0,24}\b(?:daily|per day|a day|each day|one day)\b|\bdaily\s+(?:PCT|NUM)\b|\bdaily\s+(?:loss|limit)\b/.test(c) || /\bday\b.{0,12}\b(?:loss|limit)\b/.test(c);
  const maxLoss =
    /\b(?:max|maximum)\s+(?:loss|drawdown)\b|\bstatic\b|\bfloor\b|\btrailing\b|\b(?:90|94),?000\b/.test(t) ||
    (/\bdrawdown\b/.test(c) && !daily) ||
    /\b(?:overall|total)\s+(?:loss|drawdown|limit)\b|\bhow\s+far\b.{0,30}\b(?:fall|drop|lose|go\s+down|decline)\b/.test(c);
  const targetStrong = /\btargets?\b/.test(c) || /\bstages?\b|\bgoal\b/.test(c) ||
    /\b(?:pass|passing)\b.{0,30}\b(?:need|make|reach|hit|achieve)\b|\b(?:need|have|must)\b.{0,12}\b(?:to\s+)?(?:make|reach|hit|achieve)\b.{0,30}\b(?:pass|funded)\b|\bhow\s+much\b.{0,24}\b(?:make|reach|hit|achieve)\b.{0,30}\b(?:pass|funded)\b/.test(c) || /\bhow\s+many\s+phases?\b/.test(c) || /\bprofit\b.{0,30}\bphase\b|\bphase\b.{0,30}\bprofit\b|\b(?:pass|hit|reach|complete|clear)\b.{0,20}\bphase\b/.test(c);
  const targetWeak = /\bphases\b|\bone\s+phase\b/.test(c);
  const profitableDays = /\bprofitable\s+days?\b/.test(c) || /\b0\.5\s*%/.test(t);
  const days = /\bmin(?:imum)?\b.{0,24}\bdays\b|\b(?:number\s+of|certain|set)\s+(?:trading\s+)?days\b|\btrading\s+days?\b|\bday\s+requirements?\b|\bsingle\s+day\b|\btime\s+limit\b|\bdeadline\b|\bno\s+minimum\b|\binactiv\w*/.test(c) || (/\bexpir\w*/.test(c) && !/\b(?:credits?|packs?|bundles?|coupons?|codes?)\b/.test(c)) || profitableDays;
  const news = /\bnews\b/.test(c);
  const leverage = /\bleverage\b|\bgearing\b/.test(c) || (A.slots.ratios.some((r) => /^1:\d+$/.test(r)) && !/\b(?:news|minutes?|payout|win|risk|reward)\b/.test(c));
  const fundedMention = /\bfunded\b/.test(c);
  const evaluationMention = /\bevaluation\b|\bphases?\b/.test(c);
  const eas = /\b(?:eas?|expert\s+advisors?|copiers?|copy\s*trad\w*|trade\s+copier|bots?|robots?|automated|automation|algo\w*)\b/.test(c);
  const simulated = /\b(?:simulated|simulation|demo|guarantee\w*)\b|\bREALCAPITAL\b|\blive\s+(?:trading\s+)?accounts?\b/.test(c);
  const obsolete10 = A.product === P1 && pcts.includes(10) && /\b(?:target|profit|pass|phase|still|need|require|evaluation)\b/.test(c);
  const overview = isPureOverview(A, c);

  if (consistency) out.push('consistency');
  if (daily) out.push('daily-loss');
  if (maxLoss) out.push('max-loss');
  if (obsolete10) out.push('obsolete-10pct');
  else if (targetStrong && !consistency && !daily && !maxLoss) out.push('phases');
  if (days && !consistency) out.push('min-days');
  if (news) out.push('news');
  if (leverage) out.push('leverage');
  if (eas) out.push('eas-copy');
  if (simulated) out.push('simulated');
  if (targetWeak && !targetStrong && !out.length) out.push('phases');
  if (!out.length && A.product === P1 && /\bevaluation\b/.test(c)) out.push('phases');
  if (overview && !out.length) out.push('overview');
  return { topics: out, profitableDays, daily, fundedMention, evaluationMention, c };
}

function ruleRow(topic, product, info) {
  const p = product === P1 ? '1step' : product === P2 ? '2step' : null;
  const per = (fam) => (p ? 'atom.' + p + '.' + fam + '.en' : null);
  switch (topic) {
    case 'consistency': return { id: per('consistency') };
    case 'daily-loss': return { id: per('daily-loss') };
    case 'max-loss': return { id: per('max-loss') };
    case 'phases': return { id: per('phases') };
    case 'min-days':
      if (!p) {
        // No minimum trading days and no time limit are the same on both products (overview body).
        // Funded profitable-days are not: only Atom 1-Step has them.
        if (info.profitableDays && info.fundedMention) return { id: null };
        if (info.profitableDays && !info.evaluationMention) return { id: null };
        return { id: 'atom.overview.en', relationship: 'overview' };
      }
      if (p === '1step') {
        // Profitable-day / 0.5% asks use the funded-prerequisite row.
        // Minimum trading days and time limits stay on the min-days row even if "funded" is mentioned.
        if (!info.profitableDays) return { id: 'atom.1step.min-days.en' };
        if (info.evaluationMention && !info.fundedMention) return { id: 'atom.1step.min-days.en' };
        return { id: 'atom.1step.funded-profitable-days.en' };
      }
      return { id: per('min-days') };
    case 'news': return { id: per('news') };
    case 'leverage': return { id: p ? per('leverage') : 'atom.obsolete.leverage-150-default.en', neutralOk: true };
    case 'eas-copy': return { id: 'atom.house.eas-copy.en', neutralOk: true };
    case 'simulated': return { id: 'atom.house.simulated.en', neutralOk: true };
    case 'overview': return { id: 'atom.overview.en', neutralOk: true };
    case 'obsolete-10pct': return { id: 'atom.obsolete.10pct-1step.en' };
    default: return { id: null };
  }
}

// ---------------------------------------------------------------------------
// Qualifiers actually present in the ask (scope decides whether they are covered)
// ---------------------------------------------------------------------------
function qualifiersOf(A) {
  const e = A.e;
  const s = A.slots;
  const q = new Set();
  if (e.ord) q.add('ordinal');
  if (s.amounts.some((a) => !(a.value !== null && (frame.PRICE_POINT_VALUES.includes(a.value) || a.value === frame.OBSOLETE_PRICE_VALUE)))) q.add('amount');
  if (e.priceAmount) q.add('pricePoint');
  if (s.pcts.length) q.add('pct');
  if (s.ratios.length) q.add('ratio');
  if (s.sizes.length) q.add('size');
  if (s.nums.length) q.add('num');
  if (/\b(?:options?|choices?|choose|chosen|purchased|customi[sz]\w*|selected)\b/.test(A.c)) q.add('options');
  if (e.preList) q.add('preList');
  if (e.change) q.add('change');
  if (e.calc || (e.howMuch && s.amounts.length && (e.splitEv || e.payout))) q.add('calc');
  if (e.couponStack && !e.preList) q.add('coupon');
  if (e.addon) q.add('addon');
  return q;
}

// ---------------------------------------------------------------------------
// Core resolution (pure; text already past gates)
// ---------------------------------------------------------------------------
function resolveAsk(A, ctx) {
  const e = A.e;
  const t = A.n.t;
  const product = ctx.product;

  if (e.translation) return handoff('unresolved:translation', { diagnostics: summarize(A) });

  // --- deny classes with NO approved row -----------------------------------
  const feeish = e.priceWord || e.feePaidStrong || e.priceAmount;
  if (e.strongRecovery) return abstain('atom-fee-policy-owner-decision', { handoff: true, diagnostics: summarize(A, { cls: 'fee-recovery' }) });
  if (e.weakRecovery && (feeish || e.moneyGeneric || e.amountAny || e.payout)) {
    return abstain('atom-fee-policy-owner-decision', { handoff: true, diagnostics: summarize(A, { cls: 'fee-recovery-weak' }) });
  }
  if (e.feePaidStrong) return abstain('atom-fee-policy-owner-decision', { handoff: true, diagnostics: summarize(A, { cls: 'fee-paid' }) });
  if (e.priceWord && e.payout) return abstain('atom-fee-policy-owner-decision', { handoff: true, diagnostics: summarize(A, { cls: 'fee-x-payout' }) });
  if (e.priceAmount && (e.payout || e.ord)) {
    return abstain('atom-fee-policy-owner-decision', { handoff: true, diagnostics: summarize(A, { cls: 'price-amount-x-payout-stage' }) });
  }
  if (/\bfree\b/.test(A.c) && (e.payout || e.ord)) {
    return abstain('atom-fee-policy-owner-decision', { handoff: true, diagnostics: summarize(A, { cls: 'fee-becomes-free' }) });
  }
  if (/\bpay\s+for\b/.test(A.c) && e.firstPerson && (e.payout || e.ord)) {
    return abstain('atom-fee-policy-owner-decision', { handoff: true, diagnostics: summarize(A, { cls: 'pay-for-account' }) });
  }
  if (
    /\b(?:waived|waive|handed\s+over|thrown\s+in|made\s+up\s+to\s+me|come\s+to\s+me|given\s+(?:back|to\s+me|again)|be\s+covered)\b/.test(A.c) &&
    (e.priceWord || e.moneyGeneric || e.priceAmount || e.payout)
  ) {
    return abstain('atom-fee-policy-owner-decision', { handoff: true, diagnostics: summarize(A, { cls: 'fee-given-back' }) });
  }
  if (e.moneyGeneric && e.transfer && !e.realCapital) {
    return clarify('monetary-referent', 'monetary-referent-unresolved', { diagnostics: summarize(A) });
  }

  // --- account-specific boundary -------------------------------------------
  if (accountSpecific(t) || personalState(A.c)) {
    const qs = qualifiersOf(A);
    return answerResult(
      REFUSE_ID,
      0.99,
      'account-status-boundary',
      { name: 'boundary', scopeFrame: 'boundary', relationship: 'account-specific', product },
      A,
      qs
    );
  }

  // --- frame detection -------------------------------------------------------
  const rt = ruleTopics(A);
  const qs = qualifiersOf(A);
  const obsolete161 = A.slots.amounts.some((a) => a.value === frame.OBSOLETE_PRICE_VALUE) && !e.payout;
  const oldSizes = A.slots.sizes.some((n) => n === 5 || n === 10);
  const sizeCue = oldSizes && !e.payout && !e.splitEv && !e.strongRecovery;
  const cueC =
    /\b(?:checkout|check\s+out|customi[sz]\w*|configur\w*|add\s*-?\s*ons?|addons?)\b/.test(A.c) ||
    /\bweekend\s+hold(?:ing)?\b|\bpartial\s+scalping\b/.test(A.c) ||
    (/\b(?:options?|choose|pick|select|buying|purchasing)\b/.test(A.c) && /\b(?:interval|intervals|weekend|scalping)\b/.test(A.c) && !e.profit);
  const cueB =
    /\b(?:bundles?|multiple|several|market\s+maker|packs?)\b/.test(A.c) ||
    (/\b(?:NUM|ORD)\s+(?:ATOM\s+)?accounts?\b/.test(A.c) && /\b(?:discount|off|PCT|order)\b/.test(A.c)) ||
    (/\baccounts?\b/.test(A.c) && /\bdiscounts?\b/.test(A.c)) ||
    (e.ord && /\baccounts?\b/.test(A.c) && /\b(?:discount|off|PCT)\b/.test(A.c)) ||
    /\bmulti\s*-?\s*purchas/.test(A.c) ||
    (/\bdiscounts?\b/.test(A.c) && /\b(?:purchas\w*|buy(?:ing)?|orders?)\b/.test(A.c));
  const sizeList = /\b(?:what|which)\b.{0,24}\bsizes?\b|\bsizes?\s+(?:available|offered)\b|\bavailable\s+sizes\b|\bhow\s+many\s+sizes\b/.test(A.c) && !e.payout;
  const priceIntent =
    (e.priceWord && !e.payout) || sizeList ||
    (e.howMuch && !e.payout && !e.profit && !e.splitWord && !rt.topics.length && !cueC && !cueB);

  if (e.selection && !rt.topics.includes('consistency') && (cueC || A.slots.sizes.length || /\b(?:size|plan|account|option|package)s?\b/.test(A.c))) {
    return handoff('unresolved:checkout-sku-selection', { diagnostics: summarize(A) });
  }
  if (e.couponStack && !e.preList) {
    return handoff('unresolved:coupon-stacking', { diagnostics: summarize(A) });
  }

  const F = {};
  if (e.splitEv && !e.priceWord) F.S = true;
  if (e.payout && (e.timingStrong || e.cap || (!rt.topics.length && (e.timing || e.rules)))) F.T = true;
  if (priceIntent || obsolete161 || sizeCue) F.P = true;
  if (cueC) F.C = true;
  if (cueB) F.B = true;
  if (rt.topics.length) F.R = true;
  const names = Object.keys(F);

  if (!names.length) {
    if (e.equality && /consisten/.test(A.c)) return handoff('unresolved:consistency-equality', { diagnostics: summarize(A) });
    return abstain('no-exact-approved-answer', { diagnostics: summarize(A) });
  }

  // unresolved topics are detected on rule topics first
  if (F.R && rt.topics.includes('consistency')) {
    const eqWord = /\b(?:exact|exactly|equal|equals|equality|boundary|edge|borderline|hit|hits|reach|reaches|touch|touches|tie|precisely)\b/.test(A.c);
    if (eqWord && (A.slots.pcts.includes(50) || /\bhalf\b/.test(A.c) || e.equality)) {
      return handoff('unresolved:consistency-equality', { diagnostics: summarize(A) });
    }
  }
  // Clock/window arithmetic only. Bare "am I" and "before" are not a minute calculation.
  const newsWindow =
    /\b(?:minutes?|mins?|seconds?|hours?)\b/.test(A.c) ||
    /\b(?:gmt|utc|windows?)\b/.test(A.c) ||
    /\binstruments?\b/.test(A.c) ||
    A.slots.ratios.length > 0 ||
    /\bNUM\s*(?:am|pm)\b|\b(?:am|pm)\s*NUM\b/.test(A.c);
  if (F.R && rt.topics.includes('news') && newsWindow) {
    return handoff('unresolved:news-minutes', { diagnostics: summarize(A) });
  }

  let win = null;
  if (names.length === 1) win = names[0];
  else if (names.length === 2 && F.S && F.C) win = 'S';
  else if (names.length === 2 && F.C && F.T) win = 'C';
  else if (names.length === 2 && F.B && F.P && /\b(?:discount|off|PCT)\b/.test(A.c) && !e.priceWord) win = 'B';
  else if (names.length === 2 && F.R && F.C && rt.topics.length === 1 && rt.topics[0] === 'leverage' && !e.addon) win = 'R';
  else if (names.length === 2 && F.R && F.T && rt.topics.length === 1 && !e.cap && !e.timingStrong) win = 'R';
  else {
    return abstain('multi-intent-not-covered', { diagnostics: summarize(A, { frames: names }) });
  }

  const mkFrame = (name, scopeFrame, relationship) => ({ name, scopeFrame, relationship, product });

  // --- rule frame (no closed vocabulary; money intrusion guard instead) -----
  if (win === 'R') {
    if (e.priceWord || (e.moneyGeneric && !e.realCapital) || e.feePaidStrong || e.priceAmount) {
      return abstain('money-referent-in-rule-ask', { diagnostics: summarize(A) });
    }
    let topic = rt.topics[0];
    if (e.otherProduct) return abstain('not-atom-scope', { diagnostics: summarize(A) });
    if (product === 'both' && topic !== 'eas-copy' && topic !== 'simulated' && topic !== 'overview') {
      return abstain('multi-product-not-covered', { diagnostics: summarize(A) });
    }
    let productForRow = product === 'both' ? null : product;
    if (!productForRow && (topic === 'max-loss' || rt.topics.includes('max-loss'))) {
      const trailing = /\btrailing\b/.test(A.c);
      const staticW = /\bstatic\b/.test(A.c);
      if (trailing && !staticW) productForRow = P1;
      else if (staticW && !trailing) productForRow = P2;
    }
    if (rt.topics.length > 1) {
      const ids = rt.topics.map((tp) => ruleRow(tp, productForRow, rt).id);
      const uniq = [...new Set(ids)];
      if (!(uniq.length === 1 && uniq[0])) {
        return abstain('multi-intent-not-covered', { diagnostics: summarize(A, { topics: rt.topics }) });
      }
    }
    if ((topic === 'leverage' || rt.topics.includes('leverage')) && leverage150(A)) {
      return answerResult(
        'atom.obsolete.leverage-150-default.en',
        0.95,
        'frame:rule/leverage-150',
        { name: 'rule', scopeFrame: 'rule', relationship: 'correction', product: productForRow },
        A,
        qs
      );
    }
    const r = ruleRow(topic, productForRow, rt);
    if (!r.id) return clarify('product', 'product-required', { diagnostics: summarize(A, { topic }) });
    const rel =
      r.relationship ||
      (/correction|obsolete/.test(topic) || r.id.startsWith('atom.obsolete')
        ? 'correction'
        : r.id === 'atom.overview.en'
          ? 'overview'
          : 'rule');
    const relationship = r.id === 'atom.obsolete.leverage-150-default.en' ? 'correction' : rel;
    return answerResult(
      r.id,
      0.94,
      'frame:rule/' + topic,
      { name: 'rule', scopeFrame: 'rule', relationship, product: productForRow },
      A,
      qs
    );
  }

  // --- money frames: closed vocabulary --------------------------------------
  if (win === 'S') {
    if (e.priceAmount) return clarify('amount', 'amount-ambiguous-with-price', { diagnostics: summarize(A) });
    if (product === 'both') return abstain('multi-product-not-covered', { diagnostics: summarize(A) });
    if (product === P1 || product === P2) {
      const id = product === P1 ? 'atom.1step.reward.en' : 'atom.2step.reward.en';
      const qS = new Set(qs);
      // "bigger/higher share" is the published option list, not an uncovered policy change.
      const comparativeShare =
        /\b(?:bigger|higher|larger|greater)\b/.test(A.c) &&
        !e.ord &&
        !/\b(?:increase|decreas\w*|chang\w*|rais\w*|reduc\w*|upgrad\w*|scal\w*)\b/.test(A.c);
      if (comparativeShare) qS.delete('change');
      return answerResult(id, 0.96, 'frame:split', mkFrame('split', 'split', 'split'), A, qS);
    }
    const wantsDefault = /\b(?:default|standard|typical|usual|baseline|normally)\b/.test(A.c);
    if (wantsDefault) {
      const q2 = new Set(qs);
      return answerResult('atom.payouts.general.en', 0.88, 'frame:split/default-no-product', mkFrame('payout', 'payout', 'default-split'), A, q2);
    }
    return clarify('product', 'product-required', { diagnostics: summarize(A, { topic: 'split' }) });
  }

  if (win === 'T') {
    const fourteen = /\b(?:14|fourteen)\b/.test(t) || /\b(?:two|2)\s+weeks\b/.test(t);
    if (fourteen && /\bfirst\b/.test(t)) {
      return answerResult('atom.obsolete.first-payout-14.en', 0.96, 'frame:payout/obsolete-14', mkFrame('payout', 'payout', 'correction'), A, qs);
    }
    const rel = e.timing ? 'timing' : e.cap ? 'cap' : 'rules';
    return answerResult('atom.payouts.general.en', 0.9, 'frame:payout/' + rel, mkFrame('payout', 'payout', rel), A, qs);
  }

  if (win === 'P') {
    if (e.selection) return handoff('unresolved:checkout-sku-selection', { diagnostics: summarize(A) });
    if (e.couponStack && !e.preList) return handoff('unresolved:coupon-stacking', { diagnostics: summarize(A) });
    if (e.addon) return abstain('qualifier-not-covered:addon-price', { diagnostics: summarize(A) });
    if (obsolete161) {
      return answerResult('atom.obsolete.price-161-permanent.en', 0.97, 'frame:price/obsolete-161', mkFrame('price', 'price', 'correction'), A, qs);
    }
    if (oldSizes) {
      return answerResult('atom.obsolete.sizes-5k-10k.en', 0.94, 'frame:price/obsolete-sizes', mkFrame('price', 'price', 'correction'), A, qs);
    }
    if (!priceIntent) return abstain('no-exact-approved-answer', { diagnostics: summarize(A) });
    return answerResult('atom.prices.list.en', 0.93, 'frame:price/list', mkFrame('price', 'price', 'cost'), A, qs);
  }

  if (win === 'C') {
    if (e.selection) return handoff('unresolved:checkout-sku-selection', { diagnostics: summarize(A) });
    if (e.priceWord || e.howMuch || e.amountAny) return abstain('qualifier-not-covered:addon-price', { diagnostics: summarize(A) });
    if (e.couponStack && !e.preList) return handoff('unresolved:coupon-stacking', { diagnostics: summarize(A) });
    return answerResult('atom.checkout.options.en', 0.9, 'frame:checkout', mkFrame('checkout', 'checkout', 'options'), A, qs);
  }

  if (win === 'B') {
    if (/\b(?:elite\s+packs?|elite\s+pro|\bmt5\b|spread\s+test|instant\s+funding|stellar)\b/.test(t)) {
      return abstain('not-atom-scope', { diagnostics: summarize(A, { cls: 'other-product' }) });
    }
    if (e.couponStack && !e.preList) return handoff('unresolved:coupon-stacking', { diagnostics: summarize(A) });
    return answerResult('atom.bundles.en', 0.93, 'frame:bundle', mkFrame('bundle', 'bundle', 'discount'), A, qs);
  }

  return abstain('no-exact-approved-answer', { diagnostics: summarize(A) });
}

// ---------------------------------------------------------------------------
// Multi-turn context
// ---------------------------------------------------------------------------
function hasOwnTopic(A) {
  const e = A.e;
  const rt = ruleTopics(A);
  if (rt.topics.length) return true;
  if (e.splitEv || e.priceWord || e.strongRecovery) return true;
  if (e.payout && (e.timing || e.cap || e.rules)) return true;
  return false;
}

const CONTINUATION = /^\s*(?:and|also|what\s+about|how\s+about|same|then|but|so|what\s+if|or|and\s+what)\b/i;

function isFollowUp(text, A) {
  return CONTINUATION.test(text) || (!hasOwnTopic(A) && A.tokens.length <= 12);
}

function buildContext(raw, priors) {
  const cur = frame.analyze(raw);
  const clean = (priors || []).filter((x) => typeof x === 'string' && x.trim()).slice(-MAX_PRIOR_TURNS);
  const scopeAtom = /\batom\b/.test(cur.n.t) || (!cur.e.otherProduct && clean.some((x) => /\batom\b/i.test(x)));

  let product = cur.product;
  if (!product) {
    for (let i = clean.length - 1; i >= 0; i--) {
      const p = frame.analyze(clean[i]).product;
      if (p) {
        product = p;
        break;
      }
    }
  }

  const followUp = clean.length > 0 && isFollowUp(raw, cur);
  const ownTopic = hasOwnTopic(cur);
  const chainTexts = [];
  if (followUp) {
    for (let i = clean.length - 1; i >= 0; i--) {
      chainTexts.unshift(clean[i]);
      const a = frame.analyze(clean[i]);
      if (!isFollowUp(clean[i], a) && hasOwnTopic(a)) break;
    }
  }

  let A = cur;
  let combined = false;
  if (followUp && !ownTopic && cur.tokens.length <= 12) {
    A = frame.analyze(chainTexts.concat([raw]).join(' . '));
    A.product = product;
    combined = true;
  }
  return { A, cur, scopeAtom, product, chain: chainTexts.length, chainTexts, combined };
}

function inheritedDeny(ctx) {
  for (const txt of ctx.chainTexts) {
    const a = frame.analyze(txt);
    const rr = resolveAsk(a, { product: ctx.product });
    if (rr.abstain && /^(?:atom-fee-policy-owner-decision|monetary-referent-unresolved)/.test(rr.reason)) return rr;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
async function selectAtomAnswerCore(text, opts) {
  opts = opts || {};
  if (!atomSelectorEnabled(opts)) return abstain('atom-off');
  if (text !== undefined && text !== null && typeof text !== 'string') return abstain('invalid-input');
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return abstain('empty');
  if (opts.paused) return abstain('global-pause');
  if (opts.aiOff) return abstain('aiOff');
  if (opts.stop) return abstain('STOP');
  if (opts.finWait) return abstain('fin-wait');
  if (opts.protectedTeam) return abstain('protected-team-silence');

  const gate = frame.readLanguageGate(opts.languageGate);
  if (!gate.ok) return abstain(gate.reason);

  if (raw.length > frame.MAX_ASK_CHARS) return abstain('ask-too-long');
  const priors = Array.isArray(opts.priorClientTexts) ? opts.priorClientTexts : [];

  const ctx = buildContext(raw, priors);
  if (frame.looksNonEnglish(ctx.cur.n)) return abstain('non-english');
  for (const p of ctx.chainTexts) {
    if (frame.looksNonEnglish(frame.normalize(p))) return abstain('non-english');
  }
  if (!ctx.scopeAtom) return abstain('not-atom-scope');

  const inh = ctx.chain ? inheritedDeny(ctx) : null;
  if (inh) {
    return abstain('inherited:' + inh.reason, {
      handoff: !!inh.handoff,
      action: inh.action,
      diagnostics: { inheritedTurns: ctx.chain, inheritedFrom: inh.diagnostics && inh.diagnostics.cls },
    });
  }

  const res = resolveAsk(ctx.A, { product: ctx.product });
  if (ctx.chain && res.diagnostics) res.diagnostics.inheritedTurns = ctx.chain;

  if (!res.abstain && opts.requireOwnerApproved) {
    const row = approved.get(res.answerId, KB_PATH);
    if (!row || (row.approval !== 'owner-approved' && row.approval !== 'source-verified')) {
      return abstain('needs-owner-approval');
    }
  }
  return res;
}


const SAFE_DIAGNOSTIC_KEYS = ['cls', 'frames', 'topic', 'inheritedTurns', 'inheritedFrom', 'product'];

function stripDiagnostics(res, opts) {
  if (!res || !res.diagnostics || (opts && opts.debug === true)) return res;
  const safe = {};
  for (const k of SAFE_DIAGNOSTIC_KEYS) if (res.diagnostics[k] !== undefined) safe[k] = res.diagnostics[k];
  res.diagnostics = safe;
  return res;
}

/**
 * Public entry. Never throws: any internal error fails closed to an abstain.
 * Diagnostics never include customer words unless opts.debug === true.
 */
async function selectAtomAnswer(text, opts) {
  try {
    const res = await selectAtomAnswerCore(text, opts);
    if (res && res.abstain === false) {
      const row = approved.get(res.answerId, KB_PATH);
      if (!row || !approved.isSendable(row) || row.contentHash !== res.contentHash) {
        return abstain('non-sendable-status-fail-closed', { handoff: true, handoffAnswerId: HANDOFF_ID });
      }
    }
    return stripDiagnostics(res, opts);
  } catch (err) {
    return abstain('selector-error-fail-closed', { handoff: true, errorClass: err && err.name ? String(err.name) : 'Error' });
  }
}

module.exports = {
  KB_PATH,
  HANDOFF_ID,
  REFUSE_ID,
  selectAtomAnswer,
  atomSelectorEnabled,
  resolveAsk,
  buildContext,
  residualTokens,
  qualifiersOf,
  accountSpecific,
  VOCAB,
  BASE,
  claim(input) {
    return require('../../../staging-repair-t742/atom/atomModule').claim(input);
  },
  decide(input) {
    return require('../../../staging-repair-t742/atom/atomModule').decide(input);
  },
};
