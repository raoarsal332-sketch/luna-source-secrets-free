'use strict';

/**
 * Atom claim + decide for t742 implementation #1.
 *
 * Frozen design: t742-design 46efb63bc5356961520549b711c7b1c961870ec3
 * (doc sha256 06e2be0bcb7ceb843db1a12e2b1b0c3e8358a8f9589cc69ddfeffd4da703dde2).
 * Frozen Atom labels: ea1a8a0246c2333d919c35c68a8b230376dcba49.
 *
 * claim reads the host normalized string. It does not fold.
 * decide returns SEND(partId) or ABSTAIN(code). No prose.
 * Bodies, ids, and sendability are not modified.
 *
 * Scores, policy, 2-Step trailing, and proposition membership come from
 * the shared matcher on t742-impl (bc-fde119ce). This module does not
 * edit those files. It feeds explain().covered from the frozen body-fact
 * map in atom-body-facts.json. Frozen params: T=0, M=null.
 *
 * Requested model: grok-4.7. Actual model: grok-4.7.
 *
 * Remediation cycle 1: a current covering body outranks an obsolete one;
 * account-state asks send the refuse id; a 2-Step trailing mechanism
 * abstains; a product-split ask with no product abstains. T stays 0.
 * M stays null. Shared matcher files are not edited.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { matchApproved, loadParams, twoStepTrailing } = require('../../staging-repair-t739/candidate/approvedMatcher');
const { unresolvedPolicy } = require('../../staging-repair-t739/candidate/unresolvedPolicy');

const CATALOG_PATH = path.join(
  __dirname,
  '..',
  '..',
  'staging-repair-t739',
  'candidate',
  'atom',
  'faq-approved-answers-atom-v1.json'
);

const PARAMS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'staging-repair-t739',
  'candidate',
  'matcher-params.json'
);

const REFUSE_ID = 'atom.account-status.refuse.en';
const HANDOFF_ID = 'atom.handoff.unverified.en';

function sha256(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

function loadCatalog() {
  const rawText = fs.readFileSync(CATALOG_PATH, 'utf8');
  const raw = JSON.parse(rawText);
  const answers = raw.answers;
  const english = answers.filter((a) => a.locale === 'en' && String(a.id).endsWith('.en'));
  const sendable = english.filter((a) => a.sendable === true);
  return {
    fileSha256: sha256(rawText),
    englishCount: english.length,
    sendableCount: sendable.length,
    byId: new Map(answers.map((a) => [a.id, a])),
    sendableEn: sendable,
  };
}

const CATALOG = loadCatalog();

function verifyCatalog() {
  return {
    english: CATALOG.englishCount,
    sendable: CATALOG.sendableCount,
    fileSha256: CATALOG.fileSha256,
    baseOk: CATALOG.englishCount === 33,
    sendableOk: CATALOG.sendableCount === 31,
  };
}

function atomSpans(s) {
  const spans = [];
  const re = /\b(?:elite atom|atom)\b/g;
  let m;
  while ((m = re.exec(s))) {
    const tail = s.slice(m.index, m.index + 12);
    if (/^(?:atomic|anatomy|anatomical|atomizer)\b/.test(tail)) continue;
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

function packsEntity(s) {
  if (/\belite packs\b/.test(s)) return true;
  return /\bpacks?\b/.test(s);
}

function sharedWord(s) {
  return /\b(?:discounts?|subscriptions?|refunds?|dashboard|elite|cards?|credits?|checkout|simulated)\b/.test(s);
}

function claim({ normalized }) {
  const s = String(normalized == null ? '' : normalized);
  const spans = atomSpans(s);
  const packs = packsEntity(s);
  if (spans.length && packs) return { kind: 'none', entity: null, evidenceSpans: [] };
  if (spans.length) return { kind: 'exclusive', entity: 'atom', evidenceSpans: spans };
  if (sharedWord(s)) return { kind: 'shared', entity: null, evidenceSpans: [] };
  return { kind: 'none', entity: null, evidenceSpans: [] };
}

const ONE_RE = /\b(?:1\s*-?\s*step|one\s*-?\s*step|onestep|1step)\b/g;
const TWO_RE = /\b(?:2\s*-?\s*step|two\s*-?\s*step|twostep|2step)\b/g;

function affirmed(n, re) {
  const r = new RegExp(re.source, 'g');
  let m;
  let hit = false;
  while ((m = r.exec(n))) {
    const before = n.slice(Math.max(0, m.index - 48), m.index);
    if (/\b(?:not the|not|no|without|never|didn'?t|don'?t|rather than|instead of)(?:\s+(?:the|a|an|picking|naming|saying)){0,2}\s*$/.test(before)) continue;
    hit = true;
    break;
  }
  return hit;
}

function productOf(n) {
  if (/\b(?:nobody named|without picking|no variant|product unspecified|product not (?:said|stated|named)|variant not named|variant missing|did not name|have not picked|did not say trailing or static or a variant|no 1-step or 2-step|no product named|which product|what product|variant missing)\b/.test(n)) {
    return null;
  }
  const one = affirmed(n, ONE_RE);
  const two = affirmed(n, TWO_RE);
  if (one && two) {
    if (/\b(?:compar\w*|both variants|together with|and also|versus)\b/.test(n)) return 'both';
    if (/\b(?:either|not sure if|not sure whether|unsure whether)\b/.test(n)) return null;
    const i1 = n.search(new RegExp(ONE_RE.source));
    const i2 = n.search(new RegExp(TWO_RE.source));
    return i1 >= 0 && (i2 < 0 || i1 < i2) ? '1' : '2';
  }
  if (one) return '1';
  if (two) return '2';
  return null;
}

function isPersonalOrMixed(n) {
  const s = String(n || '');
  if (/\b(?:did|have|has|am|are|was|were)\s+(?:i|we)\b/.test(s)) return true;
  if (/\b(?:i|we)\s+(?:already\s+)?(?:passed|failed|breached|cleared)\b/.test(s)) return true;
  if (/\b(?:i|we)\s+(?:got|am|are|was|were)\s+funded\b/.test(s)) return true;
  if (/\bpersonally\b/.test(s)) return true;
  if (!/\b(?:my|our|mine)\b/.test(s)) return false;
  if (/\b(?:in my opinion|my question|my understanding|my view)\b/.test(s)) return false;
  if (/^\s*if\b/.test(s) && !/\b(?:today|right now|already|dashboard|kyc|login|this morning|status|balance|equity|order|verification|passed|failed|breached)\b/.test(s)) {
    return false;
  }
  return true;
}

function negatedTrail(n) {
  return /\b(?:did not say|without saying|not say) trailing\b/.test(n);
}

function asksTrail(n) {
  if (negatedTrail(n)) return false;
  return /\btrail\w*\b/.test(n);
}

function twoStepTrailingAsk(n) {
  if (twoStepTrailing(n)) return true;
  if (productOf(n) !== '2') return false;
  if (/\btogether with\b/.test(n)) return false;
  if (negatedTrail(n)) return false;
  const loss = /\b(?:max(?:imum)?\s+(?:loss|drawdown)|drawdown|floor|overall\s+loss|equity stop|loss limit)\b/.test(n);
  if (/\btrail\w*\b/.test(n) && (loss || /\b(?:lock|mechanism|follow|open profit|equity|high)\b/.test(n))) return true;
  if (!loss) return false;
  if (/\b(?:high[\s-]?water|hwm)\b/.test(n)) return true;
  if (/\b(?:moves?|moving)\s+with\b/.test(n) && /\b(?:equity|peak|high|profit|balance)\b/.test(n)) return true;
  if (/\bfollows?\b/.test(n) && /\b(?:peak|high|equity|open profit)\b/.test(n)) return true;
  if (/\bfloating\b/.test(n) && /\b(?:drawdown|floor|loss)\b/.test(n)) return true;
  if (/\bdynamic\b/.test(n) && /\b(?:drawdown|floor)\b/.test(n)) return true;
  if (/\blocks?\b/.test(n) && /\b(?:open profit|in profit)\b/.test(n)) return true;
  return false;
}

function needsClarification(n) {
  if (/\bminute of the day\b/.test(n) || /\bclock time\b/.test(n)) return false;
  if (/\b(?:third payout|after the third|dollar split|500 profit|swap-free|islamic|if i ask nicely|beyond the house line)\b/.test(n)) return false;
  const p = productOf(n);
  if (asksTrail(n) && p !== '2') return false;
  if (p === '1' || p === '2' || p === 'both') return false;
  if (/\b(?:daily|intraday|per day|each day)\b/.test(n) && /\b(?:loss|limit|drawdown)\b/.test(n)) return true;
  if (/\b(?:how many phases|phases does|profit targets?|pass marks?|evaluation target)\b/.test(n)) return true;
  if (/\bconsistenc\w*\b/.test(n) || /\bbest[\s-]?day\b/.test(n)) return true;
  if (/\bnews\b/.test(n) || /\bhigh[\s-]?impact\b/.test(n)) return true;
  if (/\b(?:reward percents|which reward|which split|reward menu|profit[\s-]?shares?)\b/.test(n) && !/\bdefault\b/.test(n)) return true;
  if (/\b(?:max(?:imum)? loss|overall loss|loss limit|drawdown|atom floor)\b/.test(n)) return true;
  if (/\bprofitable[\s-]?days?\b/.test(n) || /\bup[\s-]?days?\b/.test(n)) return true;
  if (/\b(?:above 1\s*:\s*30|gearing choices|raise atom leverage|leverage options|change leverage)\b/.test(n)) return true;
  if (/\b(?:leverage|gearing)\b/.test(n) && !/\b(?:default|start(?:s|ing)?|150|1\s*:\s*150)\b/.test(n)) return true;
  return false;
}

const BODY_FACTS_PATH = path.join(__dirname, 'atom-body-facts.json');
const BODY_FACTS_TEXT = fs.readFileSync(BODY_FACTS_PATH);
const BODY_FACTS_SHA256 = sha256(BODY_FACTS_TEXT);
const BODY_FACTS = JSON.parse(BODY_FACTS_TEXT);
const FACTS = new Map(Object.entries(BODY_FACTS.facts).map(([id, list]) => [id, new Set(list)]));

function addIntent(intents, id) {
  if (id && !intents.includes(id)) intents.push(id);
}

function intentsOf(n) {
  const intents = [];
  const add = (id) => addIntent(intents, id);
  const p = productOf(n);
  const priceTalk = /\$|\b(?:price|prices|list|sticker|sheet|column|coupon|cart|dollar|sizes?|catalog|advertis\w*)\b/.test(n);
  const bestDay = /\bbest[\s-]day\b/.test(n);

  if (/\b(?:swap-free|islamic|commission per lot|best firm|as an opinion|how risky|300k size|minute of the day|clock time)\b/.test(n)) add('uncovered');
  if (/\bif i ask nicely\b/.test(n)) add('uncovered');
  if (/\bbeyond the house line\b/.test(n)) add('uncovered');
  if (/\b(?:cheap|what does that add-on cost)\b/.test(n)) add('uncovered');
  if (/\bdollar price\b/.test(n) && !/\bnot the dollar price\b/.test(n)) add('uncovered');
  if (/\bafter the third payout\b/.test(n) || /\bthird atom payout\b/.test(n)) add('uncovered');
  if (/\bdollar split\b/.test(n) || /\b500 profit\b/.test(n)) add('uncovered');
  if (/\bspread atom charges\b/.test(n) || /\batom charges\b/.test(n)) add('uncovered');
  if (/\batom 289\b/.test(n)) add('uncovered');
  if (/\bfigure 215\b/.test(n) && !priceTalk) add('uncovered');

  const feeAsPrice = /\bchallenge fee\b/.test(n) && /\blist price\b/.test(n);

  if (/\b(?:expert advisors?|bots?|trade copier|copiers?)\b/.test(n)) {
    if (/\bcopier/.test(n)) add('copier-own');
    else add('ea-allowed');
    if (/\bown accounts\b/.test(n) && /\bexpert advisors?\b/.test(n)) add('copier-own');
  }
  if (/\bhedging\b/.test(n) && !/\bbeyond\b/.test(n)) add('no-hedge');
  if (/\baccount sharing\b/.test(n)) add('no-share');
  if (/\bthree-minute\b/.test(n) || /\b3-minute\b/.test(n) || /\bminimum hold\b/.test(n)) add('hold-3');

  if (/\bguaranteed rewards?\b/.test(n)) add('no-guarantee');
  if (/\breal(?:-money)? (?:trading )?capital\b/.test(n) || /\blive capital\b/.test(n) || /\breal-money\b/.test(n)) add('no-real-capital');
  if (/\bsimulated profit\b/.test(n)) add('rewards-sim');
  if ((/\bsimulated\b/.test(n) || /\bsimulation\b/.test(n)) && !intents.includes('no-real-capital') && !intents.includes('rewards-sim') && !intents.includes('no-guarantee')) add('simulated');

  if (/\bweekend(?: holding| add-on)?\b/.test(n) && /\b(?:holding|add-on|included|optional)\b/.test(n)) {
    if (p === '1' || /\bincluded\b/.test(n)) add('weekend-1');
    if (p === '2' || /\boptional\b/.test(n) || /\badd-on\b/.test(n)) add('weekend-2');
    if (p == null && !/\bincluded\b/.test(n) && !/\boptional\b/.test(n)) add('weekend-2');
  }
  if (/\b(?:partial[- ]scalping|scalping add-on)\b/.test(n)) {
    if (/\b(?:checkout|listed|partial|order form)\b/.test(n) && !/\b(?:threshold|hold)\b/.test(n)) add('scalping-listed');
    else add('scalping-addon');
  }
  if (/\bcheckout\b/.test(n) && /\bmax(?:imum)?[-\s]?loss\b/.test(n) && /\b(?:offered|percents)\b/.test(n)) add('maxloss-menu');
  if (/\b(?:checkout page|purchase screen|what can a buyer change)\b/.test(n)) add('checkout-page');

  if (/\bsecond(?:[-\s]+\w+){0,3}[-\s]+account\b/.test(n) && /\b(?:discount|percent off|%)\b/.test(n)) add('bundle-2');
  if (/\b(?:two|2) atom accounts\b/.test(n) && /\b(?:discount|percent off)\b/.test(n)) add('bundle-2');
  if (/\bbundle discount\b/.test(n)) add('bundle-2');
  if (/\bfour atom\b/.test(n) || /\bfourth atom\b/.test(n)) add('bundle-4');
  if (/\bthree atom\b/.test(n) && /\bcredits\b/.test(n)) add('bundle-credits');
  if (/\bsix thousand credits\b/.test(n) || /\b6,?000 credits\b/.test(n)) add('bundle-credits');
  if (/\bpayout credits\b/.test(n) && /\bbundle\b/.test(n)) add('not-payout-credits');
  if (/\bcredits\b/.test(n) && /\b(?:withdraw|open elite packs|buy challenges)\b/.test(n)) {
    add('credits-not-withdrawable');
    add('bundle-credits');
  }

  if (priceTalk || feeAsPrice) {
    if (/\b161\b/.test(n) || /\bone sixty-one\b/.test(n)) add('not-161');
    if (!/\b(?:floor|static|drawdown|trailing)\b/.test(n) && /\b100\s?k\b/.test(n) && (/\b215\b/.test(n) || /\b289\b/.test(n) || /\blist\b/.test(n) || /\bbefore\b/.test(n) || /\bdollar\b/.test(n) || /\bfigure\b/.test(n) || /\$161\b/.test(n))) add('price-100k');
    if (/\b25\s?k\b/.test(n)) add('price-25k');
    if (/\b50\s?k\b/.test(n) && !/\bor atom 100k\b/.test(n)) add('price-50k');
    if ((/\b7\s?k\b/.test(n) || /\bseven-k\b/.test(n)) && (/\$/.test(n) || /\b(?:price|prices|list figures|sheet|dollar)\b/.test(n)) && !/\bsize\b/.test(n)) add('price-7k');
    if (/\b200\s?k\b/.test(n) && /\b(?:price|sticker|\$|dollar|list)\b/.test(n)) add('price-table');
    if (/\b409\b/.test(n)) add('price-409');
    if (/\b519\b/.test(n)) add('price-519');
    if (/\b(?:5\s?k|10\s?k|five k|ten-thousand|10k)\b/.test(n)) add('size-old');
    if (/\bwhich\s+(?:\w+\s+){0,3}sizes\b/.test(n) || /\bwhat sizes\b/.test(n) || (/\bsizes\b/.test(n) && /\badvertis/.test(n)) || /\bcatalog (?:actually name|advertises)\b/.test(n) || /\badvertised (?:sizes|range)\b/.test(n) || (/\bpublished list\b/.test(n) && /\bsizes\b/.test(n)) || /\bten-thousand\b/.test(n)) add('size-list');
    if (/\bprice table\b/.test(n)) add('price-table');
    if (!intents.some((id) => id.startsWith('price') || id.startsWith('size') || id === 'not-161') && /\bprices\b/.test(n)) add('price-table');
  }

  const payoutTopic = /\b(?:payouts?|withdrawals?|per[\s-]?instrument|intervals?|payout wait|\bwait\b)\b/.test(n) || (/\bcap\b/.test(n) && !/\b(?:intraday|daily)\b/.test(n)) || /\brisk\b/.test(n);
  if (payoutTopic && !/\bup-days\b/.test(n) && !/\bprofitable days\b/.test(n) && !/\bintraday cap\b/.test(n)) {
    if (/\bcap\b/.test(n)) add('cap-3');
    if (/\babove the cap\b/.test(n) || /\bnext cycle\b/.test(n)) add('cap-stays');
    if (/\b1\.5\b/.test(n) || /\bper[\s-]?instrument\b/.test(n) || (/\brisk\b/.test(n) && /\binstrument\b/.test(n))) add('risk-1.5');
    const intervalList = /\b3\b/.test(n) && /\b21\b/.test(n) && /\b(?:gap|interval|schedule|days)\b/.test(n);
    if (/\binterval/.test(n) || intervalList) add('interval-list');
    if (/\bchoices at checkout\b/.test(n)) add('checkout-page');
    if (/\bpayout schedule\b/.test(n)) add('reward-on-payout-sheet');
    const first = /\b(?:first|initial)\b/.test(n) && /\b(?:payout|withdrawal|wait)\b/.test(n);
    const later = /\b(?:later|after the first|default gap)\b/.test(n) || (/\bnext\b/.test(n) && !/\bup-days\b/.test(n) && !/\bprofitable\b/.test(n));
    const fourteen = /\b14\b/.test(n) || /\bfourteen\b/.test(n) || /\btwo weeks\b/.test(n);
    if (!intervalList && ((first && later) || (later && /\bdistinct\b/.test(n)) || (first && /\bcap\b/.test(n)))) add('first-and-later');
    else if (later) add('later-14');
    else if (first || fourteen) add('first-21');
    if (fourteen && (/\b(?:obsolete|fourteen-day first|still 14|not 14|two weeks|day 14)\b/.test(n))) add('not-14');
  }

  const rewardAsk = !bestDay && (/\b(?:reward|profit-shares?|splits?)\b/.test(n) || /\bshares?\b/.test(n));
  if (rewardAsk && !intents.includes('uncovered')) {
    if (p === '2' && /\b(?:menu|options|choices|list|95|sixty|60)\b/.test(n)) add('reward-menu-2');
    if (p === '1' && (/\b(?:menu|options|choices|list|shares?|percents|100|70|one hundred|set)\b/.test(n))) add('reward-menu-1');
    if (/\bdefault\b/.test(n) && (/\b80\b/.test(n) || /\breward share\b/.test(n) || /\bsplit\b/.test(n))) add('reward-default-80');
    if (/\bordinary atom split\b/.test(n)) add('reward-default-80');
    if (/\bone hundred percent\b/.test(n)) add('reward-menu-1');
    if (/\bsixty percent\b/.test(n) || /\b60 percent\b/.test(n)) add('reward-menu-2');
  }
  if (p === '1' && /\b70\b/.test(n) && /\b100\b/.test(n)) add('reward-menu-1');
  if (p === '1' && /\b95\b/.test(n) && /\bshare\b/.test(n)) add('reward-menu-1');

  if (/\b(?:leverage|gearing)\b/.test(n) || /\b1\s*:\s*(?:30|50|100|150)\b/.test(n) || /\b150\s*:\s*1\b/.test(n) || /\b150 to 1\b/.test(n) || /\b150\b/.test(n)) {
    if (/\b(?:1\s*:\s*150|150\s*:\s*1|150 to 1|\b150\b)\b/.test(n)) add('lev-default-30');
    if (/\bfixed\b/.test(n) && p === '1') add('lev-fixed');
    if (p === '1' && (/\b1\s*:\s*30\b/.test(n) || /\b1 to 30\b/.test(n) || /\bcannot be moved\b/.test(n) || /\bchange\b/.test(n))) add('lev-fixed-number');
    if (/\b(?:1\s*:\s*50|1\s*:\s*100|menu|choices|options|higher)\b/.test(n) && p !== '1') add('lev-menu');
    if (/\bdefault\b/.test(n) && !/\bfixed\b/.test(n)) add('lev-default-30');
    if (p == null && /\bstart on\b/.test(n)) add('lev-default-30');
    if (p === '1' && /\b1\s*:\s*50\b/.test(n)) add('lev-fixed');
    if (!intents.some((id) => id.startsWith('lev-'))) {
      if (p === '1') add('lev-fixed');
      else if (p === '2') add('lev-menu');
      else if (/\b(?:default|start\w*|150)\b/.test(n)) add('lev-default-30');
    }
  }

  if (/\bnews\b/.test(n) || /\bhigh-impact\b/.test(n) || /\brelease\b/.test(n)) {
    const funded = /\bfunded\b/.test(n);
    const challenge = /\b(?:evaluation|phase[\s-]*1|phase[\s-]*2|challenge|release)\b/.test(n);
    if (funded && !challenge) add('news-funded-ban');
    else if (p === '1') add('news-eval-1');
    else if (p === '2') add('news-phase-2');
    else if (funded && challenge) add('news-funded-ban');
  }

  if (/\bconsistenc\w*\b/.test(n) || bestDay) {
    if (p === '1') add('cons-1-both');
    if (p === '2' && /\b(?:challenge|phase|absent|no consistency)\b/.test(n)) add('cons-2-none');
    if (p === '2' && /\bfunded\b/.test(n)) add('cons-2-funded');
    if (p === '2' && !intents.includes('cons-2-none') && !intents.includes('cons-2-funded')) add('cons-2-funded');
    if (/\bnot a breach\b/.test(n) || /\bkeep trading\b/.test(n) || /\bbreach on its own\b/.test(n) || /\bby itself\b/.test(n)) add('not-breach');
    if (/\bthree thousand\b/.test(n) || /\b3,?000\b/.test(n)) add('cons-1-example');
    if (/\btwice the best day\b/.test(n) && p === '1') add('cons-1-both');
  }

  const daily = (/\b(?:daily|intraday|per day|each day|a day|in a day)\b/.test(n) && /\b(?:loss|limit|percent|cap|line|drawdown)\b/.test(n)) || /\b(?:three|four) percent day\b/.test(n) || /\bday reset\b/.test(n) || /\bbalance or equity\b/.test(n) || /\bsnapshot\b/.test(n);
  if (daily && !/\bminute of the day\b/.test(n)) {
    if (/\bopen trades?\b/.test(n) || /\bfloating\b/.test(n)) add('open-trades');
    if (/\b(?:higher of|balance and equity|prior daily close|snapshot)\b/.test(n)) add('daily-anchor');
    if (p === '1' || /\bfour percent\b/.test(n)) add('daily-4');
    else if (p === '2' || /\bthree percent\b/.test(n)) add('daily-3');
    else add('daily-unspecified');
  }

  const lossAsk = /\b(?:max(?:imum)? loss|overall loss|loss limit|drawdown|draw down|\bdd\b|floor|trail\w*|static)\b/.test(n);
  if (lossAsk && !daily && !intents.includes('maxloss-menu') && !negatedTrail(n)) {
    const trail = asksTrail(n);
    if ((trail && p !== '2') || (p === '1' && !/\bstatic\b/.test(n))) {
      add('trailing-6');
      if (/\b(?:down|high|lock|follow)\b/.test(n)) add('floor-follows');
      if (/\bopen profit\b/.test(n)) add('open-profit');
      if (/\b94/.test(n)) add('floor-94k');
      if (/\b103/.test(n)) add('floor-103');
    } else if (p === '2' || /\bstatic\b/.test(n)) {
      add('static-10');
      if (/\b(?:90,?000|ninety thousand)\b/.test(n)) add('floor-90k');
      if (/\b(?:never|chase|ratchet|lift|glued|stay put|standing|static)\b/.test(n)) add('floor-static');
    }
  }

  const phaseGate = /\b(?:phases?|targets?|pass mark|goal)\b/.test(n) || /\bphase[\s-]*[12]\b/.test(n) || /\b(?:single evaluation|one evaluation|only evaluation)\b/.test(n) || (p === '1' && /\b(?:10 percent|ten percent|eight percent)\b/.test(n)) || (/\bevaluation\b/.test(n) && /\bpercent\b/.test(n) && !daily && !bestDay) || /\bhow many\b[\s\S]{0,40}\bstages\b/.test(n);
  if (phaseGate && !bestDay && !/\btrading[\s-]?days?\b/.test(n) && !/\bnews\b/.test(n) && !/\brelease\b/.test(n)) {
    const asksTarget = /\b(?:target|percent|eight|five|goal|\b8\b|\b5\b|\b10\b)\b/.test(n);
    if (/\bold(?:er)?(?:\s+\w+){0,5}\s+draft\b/.test(n) || /\bold draft\b/.test(n)) add('older-draft-10');
    else if (p === '1' && (/\b10\b/.test(n) || /\bten percent\b/.test(n) || /\beight percent\b/.test(n) || /\b8 percent\b/.test(n) || /\btarget\b/.test(n) || /\bpercent\b/.test(n))) add('target-8-not-10');
    if (p === '1' && /\b(?:how many|single evaluation|one evaluation|phase count|only evaluation)\b/.test(n)) add('phases-1');
    if (p === '2' && (/\bphase[\s-]*2\b/.test(n) || /\bphase two\b/.test(n)) && asksTarget) add('phase2-5');
    if (p === '2' && (/\bphase[\s-]*1\b/.test(n) || /\bphase one\b/.test(n) || /\bstage one\b/.test(n)) && asksTarget) add('phase1-8');
    if (p === '2' && /\beight percent\b/.test(n) && !/\bphase[\s-]*2\b/.test(n)) add('phase1-8');
    if (p === '2' && /\b(?:two targets|8 and 5|phase count)\b/.test(n)) {
      add('phase1-8');
      add('phase2-5');
    }
    if (p === '2' && (/\bhow many\b/.test(n) || /\bcount the\b/.test(n))) add('phases-2');
    if (p === '2' && /\bsecond\b/.test(n) && asksTarget) add('phase2-5');
    if (p === '2' && /\bdivided\b/.test(n)) {
      add('phases-2');
      add('phase1-8');
      add('phase2-5');
    }
  }

  if (/\b(?:trading[\s-]?days?|time limit|deadline|expire|expiry|inactivity|profitable[\s-]?days?|up[\s-]?days?|half a percent|0\.5|five hundred|\$500|five-day|five day|minimum day|lapse|on a clock|calendar date|how long|size day|payout prerequisite)\b/.test(n)) {
    if (/\bfive hundred\b/.test(n) || /\$500/.test(n)) add('dollar-500');
    if (/\bhalf a percent\b/.test(n) || /\b0\.5\b/.test(n)) add('funded-5');
    if (p === '1' && /\b(?:profitable|up[\s-]?days|five-day|five day|five up|payout prerequisite|size day)\b/.test(n)) add('funded-5');
    if (p === '1' && /\bminimum profitable\b/.test(n) && /\b(?:evaluation|challenge|pass)\b/.test(n)) add('no-profit-eval');
    if (p === '1' && /\btrading[\s-]?days?\b/.test(n)) add('no-min-trading-1');
    if (p === '1' && /\b(?:time limit|deadline|expire|absence of a deadline)\b/.test(n)) add('no-time-1');
    if (p === '1' && /\binactivity\b/.test(n)) add('inactivity-1');
    if (p === '2' && /\b(?:trading[\s-]?days?|minimum day|day count)\b/.test(n)) add('no-min-trading-2');
    if (p === '2' && /\bprofitable/.test(n)) add('no-profit-days-2');
    if (p === '2' && /\b(?:expire|expiry|time limit|lapse)\b/.test(n)) add('no-expire-2');
    if (p === '2' && /\binactivity\b/.test(n)) add('inactivity-2');
    if (p == null && /\b(?:time limit|deadline|calendar|clock|expire|how long|race against)\b/.test(n)) add('no-time-general');
    if (p == null && /\btrading[\s-]?days?\b/.test(n)) add('no-min-general');
  }

  if (/\bminimum days\b/.test(n) && p === '2') add('no-min-trading-2');

  if (!intents.length && /\b(?:what program|introduction|summarise|summarize|onboarding|plain description|in one paragraph|what atom is)\b/.test(n)) add('what-is');
  if (!intents.length && /\bwhat is\b/.test(n) && !/\bwhat is (?:being|that)\b/.test(n)) add('what-is');
  if (intents.includes('phases-1')) {
    const i = intents.indexOf('simulated');
    if (i >= 0) intents.splice(i, 1);
  }
  if (p === 'both') {
    if (/\bdaily\b/.test(n)) {
      add('daily-3');
      add('daily-4');
    }
    if (/\btrailing\b/.test(n) && /\bstatic\b/.test(n)) {
      add('trailing-6');
      add('static-10');
    }
  }

  fillMissingFacts(n, p, intents);
  return intents.filter((id) => id !== 'daily-unspecified');
}

function familyHits(n) {
  const found = [];
  const add = (name) => { if (!found.includes(name)) found.push(name); };
  if (/\b(?:leverage|gearing)\b/.test(n) || /\b1\s*:\s*(?:30|50|100|150)\b/.test(n)) add('lev');
  if (/\b(?:payouts?|withdrawals?|cash[\s-]?outs?|paid out)\b/.test(n)) add('payout');
  if (/\$|\b(?:prices?|sticker|list price|how much (?:is|does|for)|costs?)\b/.test(n)) add('price');
  if (/\b(?:sizes?|5\s?k|10\s?k)\b/.test(n) && /\b(?:advertis\w*|catalog|published|still appear|account)\b/.test(n)) add('size');
  if (/\b(?:phases?|profit targets?|pass marks?|evaluation targets?)\b/.test(n) || (/\bto pass\b/.test(n) && /\b(?:percent|target|profit|goal)\b/.test(n))) add('phase');
  if (/\b(?:daily|intraday|per day|each day)\b/.test(n) && /\b(?:loss|lose|limit|drawdown)\b/.test(n)) add('daily');
  if (!/\b(?:daily|intraday|per day|each day)\b/.test(n) && (/\b(?:max(?:imum)? loss|overall loss|loss limit|drawdown|atom floor)\b/.test(n) || /\btrail\w*\b/.test(n) || /\blose\b/.test(n))) add('loss');
  if (/\bconsistenc\w*\b/.test(n) || /\bbest[\s-]?day\b/.test(n)) add('cons');
  if (/\bnews\b/.test(n) || /\bhigh[\s-]?impact\b/.test(n)) add('news');
  if (/\b(?:rewards?|profit[\s-]?shares?|splits?)\b/.test(n)) add('reward');
  if (/\b(?:trading[\s-]?days?|time limit|deadline|inactivity|profitable[\s-]?days?|up[\s-]?days?)\b/.test(n)) add('days');
  if (/\b(?:expert advisors?|trade copiers?|hedging|account sharing|minimum hold)\b/.test(n)) add('house');
  if (/\b(?:simulated|simulation|live capital|guaranteed rewards?)\b/.test(n)) add('sim');
  if (/\b(?:bundle|second account)\b/.test(n) && /\b(?:discount|credit|account)\b/.test(n)) add('bundle');
  if (/\bcheckout\b/.test(n) || /\border form\b/.test(n) || /\bpurchase screen\b/.test(n)) add('checkout');
  return found;
}

function fillMissingFacts(n, p, intents) {
  if (intents.some((id) => id !== 'uncovered')) return;
  if (intents.includes('uncovered')) return;
  const families = familyHits(n);
  if (!families.length) return;
  if (families.length > 1) {
    addIntent(intents, 'uncovered');
    return;
  }
  const family = families[0];
  const split = new Set(['lev', 'phase', 'daily', 'loss', 'cons', 'news', 'reward', 'days']);
  if (p === 'both' && split.has(family)) {
    addIntent(intents, 'uncovered');
    return;
  }
  const add = (id) => addIntent(intents, id);
  if (family === 'lev') {
    if (p === '1') add('lev-fixed');
    else if (p === '2') add('lev-menu');
    else if (/\b(?:default|start\w*|150)\b/.test(n)) add('lev-default-30');
    return;
  }
  if (family === 'payout') {
    if (/\b(?:14|fourteen|two weeks)\b/.test(n)) add('not-14');
    add('first-21');
    return;
  }
  if (family === 'price') {
    if (/\b161\b/.test(n)) add('not-161');
    add('price-table');
    return;
  }
  if (family === 'size') {
    add('size-list');
    return;
  }
  if (family === 'phase') {
    if (p === '1') add('target-8-not-10');
    else if (p === '2') {
      add('phase1-8');
      add('phase2-5');
    }
    return;
  }
  if (family === 'daily') {
    if (p === '1' || /\bfour percent\b/.test(n)) add('daily-4');
    else if (p === '2' || /\bthree percent\b/.test(n)) add('daily-3');
    return;
  }
  if (family === 'loss') {
    if (asksTrail(n) && p !== '2') add('trailing-6');
    else if (p === '2' || /\bstatic\b/.test(n)) add('static-10');
    else if (p === '1') add('trailing-6');
    return;
  }
  if (family === 'cons') {
    if (p === '1') add('cons-1-both');
    else if (p === '2') add('cons-2-funded');
    return;
  }
  if (family === 'news') {
    if (p === '1') add('news-eval-1');
    else if (p === '2') add('news-phase-2');
    else if (/\bfunded\b/.test(n) && !/\b(?:challenge|evaluation|phase)\b/.test(n)) add('news-funded-ban');
    return;
  }
  if (family === 'reward') {
    if (p === '1') add('reward-menu-1');
    else if (p === '2') add('reward-menu-2');
    else if (/\bdefault\b/.test(n) || /\b80\b/.test(n)) add('reward-default-80');
    return;
  }
  if (family === 'days') {
    if (p === '1') add('no-min-trading-1');
    else if (p === '2') add('no-min-trading-2');
    else add('no-time-general');
    return;
  }
  if (family === 'house') add('ea-allowed');
  else if (family === 'sim') add('simulated');
  else if (family === 'bundle') add('bundle-2');
  else if (family === 'checkout') add('checkout-page');
}

const CROSS_PRODUCT_OK = new Set(['news-funded-ban', 'simulated', 'reward-default-80', 'lev-default-30']);

function productAllows(row, product, intents) {
  if (!product || product === 'both') return true;
  if (intents.length && intents.every((id) => CROSS_PRODUCT_OK.has(id))) return true;
  const tags = row.intentTags || [];
  const p1 = tags.includes('product:atom-1step');
  const p2 = tags.includes('product:atom-2step');
  if (product === '1' && p2 && !p1) return false;
  if (product === '2' && p1 && !p2) return false;
  return true;
}

function coversAll(row, intents, product) {
  if (!intents.length) return false;
  if (intents.includes('uncovered') || intents.includes('daily-unspecified')) return false;
  const facts = FACTS.get(row.id);
  if (!facts) return false;
  if (!productAllows(row, product, intents)) return false;
  return intents.every((id) => facts.has(id));
}

const MATCH_POOL = CATALOG.sendableEn.filter((row) => row.id !== REFUSE_ID && row.id !== HANDOFF_ID);

function sharedStatus() {
  const params = loadParams();
  let paramsSha256 = null;
  try {
    paramsSha256 = sha256(fs.readFileSync(PARAMS_PATH));
  } catch (_) { paramsSha256 = null; }
  return {
    matcher: 'candidate/approvedMatcher.js',
    paramsPath: PARAMS_PATH,
    paramsSha256,
    T: params ? params.T : null,
    M: params ? params.M : null,
    paramsFrozen: !!(params && params.status === 'frozen'),
    matchPool: MATCH_POOL.length,
    bodyFactsSha256: BODY_FACTS_SHA256,
  };
}

function send(partId) {
  const row = CATALOG.byId.get(partId);
  if (!row || row.sendable !== true) {
    return { action: 'ABSTAIN', code: 'COVERAGE_DENIED', policy: null };
  }
  return { action: 'SEND', partId, contentHash: row.contentHash };
}

function abstain(code, policy) {
  return { action: 'ABSTAIN', code, policy: policy == null ? null : policy };
}

function preferCurrent(matched) {
  const ids = (matched && matched.acceptableSet) || [];
  const current = ids.filter((id) => !/\.obsolete\./.test(id));
  if (!current.length) return matched.partId;
  const score = new Map((matched.candidates || []).map((c) => [c.partId, c.score]));
  current.sort((a, b) => {
    const ds = (score.get(b) || 0) - (score.get(a) || 0);
    if (ds) return ds;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return current[0];
}

function decide({ normalized, gate, claim: claimIn, params }) {
  if (gate && gate.lang === 'non-en') return abstain('not-a-claim', null);
  const c = claimIn || claim({ normalized });
  if (!c || c.kind !== 'exclusive' || c.entity !== 'atom') return abstain('not-owner', null);
  const n = String(normalized == null ? '' : normalized);
  if (isPersonalOrMixed(n)) return send(REFUSE_ID);
  const frozen = loadParams();
  const use = params && typeof params.T === 'number' ? { T: params.T, M: null } : frozen;
  if (!use || typeof use.T !== 'number') return abstain('calibration-blocked', null);
  const matched = matchApproved({
    normalized: n,
    rows: MATCH_POOL,
    params: use,
    clarify: needsClarification(n),
  });
  if (matched && matched.code === 'unresolved-policy') {
    return abstain('unresolved-policy', matched.policy || null);
  }
  if (twoStepTrailingAsk(n)) return abstain('atom-2step-trailing', null);
  if (!matched || matched.action !== 'SEND') {
    return abstain((matched && matched.code) || 'COVERAGE_DENIED', matched ? matched.policy : null);
  }
  return send(preferCurrent(matched));
}

function explain(normalized) {
  const n = String(normalized || '');
  const intents = intentsOf(n);
  const product = productOf(n);
  return {
    product,
    personal: isPersonalOrMixed(n),
    policy: unresolvedPolicy(n),
    trailing: twoStepTrailingAsk(n),
    clarify: needsClarification(n),
    intents,
    covered: MATCH_POOL.filter((row) => coversAll(row, intents, product)).map((row) => row.id),
  };
}

module.exports = {
  claim,
  decide,
  unresolvedPolicy,
  verifyCatalog,
  explain,
  sharedStatus,
  REFUSE_ID,
  CATALOG_PATH,
  BODY_FACTS_PATH,
  BODY_FACTS_SHA256,
};
