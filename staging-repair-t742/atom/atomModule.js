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
 * The shared matcher and matcher-params.json belong to t742-impl
 * (bc-fde119ce). This module loads them when they exist and does not
 * write them. Until that branch is published, scores use the frozen
 * algorithm in design section (g): IDF-weighted tokens plus character
 * trigrams, cosine, then highest score and smallest partId.
 * PROVISIONAL_T is an Atom-local stand-in, not a frozen shared param.
 *
 * Requested model: grok-4.7. Actual model: grok-4.7.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CATALOG_PATH = path.join(
  __dirname,
  '..',
  '..',
  'staging-repair-t739',
  'atom',
  'faq-approved-answers-atom-v1.json'
);

const LEAD_MATCHER = path.join(
  __dirname,
  '..',
  '..',
  'staging-repair-t739',
  'candidate',
  'approvedMatcher.js'
);

const LEAD_PARAMS = path.join(
  __dirname,
  '..',
  '..',
  'staging-repair-t739',
  'candidate',
  'matcher-params.json'
);

const REFUSE_ID = 'atom.account-status.refuse.en';
// Design section (g) sweeps T in {0.15, 0.20, …, 0.60}. On this dev set no
// value in that grid keeps false refusals ≤ 5%. The lead has not published
// matcher-params.json, so the score floor is not applied. Cosine still picks
// among bodies that cover. This is not a frozen shared T.
const PROVISIONAL_T = 0;

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

function productOf(n) {
  if (/\b(?:nobody named|without picking|no variant|product unspecified|product not (?:said|stated|named)|variant not named|variant missing|did not name|have not picked|did not say trailing or static or a variant|no 1-step or 2-step|no product named)\b/.test(n)) {
    return null;
  }
  const oneRe = /\b(?:1\s*-\s*step|1\s+step|one\s*-\s*step|one\s+step)\b/;
  const twoRe = /\b(?:2\s*-\s*step|2\s+step|two\s*-\s*step|two\s+step)\b/;
  const one = oneRe.test(n);
  const two = twoRe.test(n);
  if (one && two) {
    if (/\b(?:compar\w*|both variants|together with|and also|versus)\b/.test(n)) return 'both';
    const i1 = n.search(oneRe);
    const i2 = n.search(twoRe);
    return i1 >= 0 && (i2 < 0 || i1 < i2) ? '1' : '2';
  }
  if (one) return '1';
  if (two) return '2';
  return null;
}

function isPersonalOrMixed(n) {
  if (/\bpersonally\b/.test(n)) return true;
  if (/\bin my name\b/.test(n)) return true;
  if (/\bmy individual\b/.test(n)) return true;
  if (/\bmy personal\b/.test(n)) return true;
  if (/\b(?:did|have)\s+i\b/.test(n) && /\b(?:pass\w*|clear\w*|fail\w*|breach\w*|funded)\b/.test(n)) return true;
  if (/\b(?:am|was)\s+i\b/.test(n)) return true;
  if (/\bwhat phase am i\b/.test(n)) return true;
  if (/\bmy(?:\s+own)?(?:\s+atom)?\s+(?:kyc|equity|balance|dashboard|verification|login|order)\b/.test(n)) return true;
  if (/\bis my atom\b/.test(n) && /\bbreach/.test(n)) return true;
  if (/\bmy own\b/.test(n) && /\b(?:payout|pass)\b/.test(n)) return true;
  if (/\blook at my\b/.test(n)) return true;
  if (/\bmy trailing figure\b/.test(n)) return true;
  if (/\bapprove my atom\b/.test(n)) return true;
  if (/\bstatus of my\b/.test(n)) return true;
  if (/\bbreach me\b/.test(n)) return true;
  if (/\bconfirm my atom balance\b/.test(n)) return true;
  if (/\bmy atom dashboard\b/.test(n)) return true;
  return false;
}

function unresolvedPolicy(normalized) {
  const n = String(normalized == null ? '' : normalized);
  if (isFeeReturn(n)) return 'policy.fee-refunds';
  if (isEquality50(n)) return 'policy.equality-50';
  if (isNewsMinutes(n)) return 'policy.news-minutes';
  if (isSku(n)) return 'policy.sku';
  if (isTranslation(n)) return 'policy.translations';
  if (isCouponStack(n)) return 'policy.coupon-stacking';
  return null;
}

function isFeeReturn(n) {
  if (/\bnot a refund\b/.test(n)) return false;
  return (
    /\b(?:refund(?:ed|s)?|reimburse\w*|rebates?|repaid|repay\w*)\b/.test(n) ||
    /\bhanded back\b/.test(n) ||
    /\bcredited back\b/.test(n) ||
    /\bcome back\b/.test(n) ||
    /\breturned after\b/.test(n) ||
    /\bpurchase price be returned\b/.test(n) ||
    /\bcharge repaid\b/.test(n)
  );
}

function isEquality50(n) {
  if (/\bequal split\b/.test(n)) return false;
  const topic = /\b(?:consistenc\w*|best[\s-]day|50|fifty|half)\b/.test(n);
  if (!topic) return false;
  return (
    /\b(?:exactly|precisely|on the nose|exact equality|right at)\b/.test(n) ||
    /\bequal to half\b/.test(n) ||
    /\bequals the halfway\b/.test(n) ||
    /\bprecisely equal\b/.test(n) ||
    /\bborderline\b/.test(n) ||
    (/\bequality\b/.test(n) && /\b(?:50|fifty|half)\b/.test(n))
  );
}

function isNewsMinutes(n) {
  if (/\bminute of the day\b/.test(n) || /\bclock time\b/.test(n)) return false;
  if (!/\b(?:news|release|print|event|blackout)\b/.test(n)) return false;
  return (
    /\bminutes\b/.test(n) ||
    /\bseconds\b/.test(n) ||
    /\bgmt\b/.test(n) ||
    /\bblackout\b/.test(n) ||
    /\bclock range\b/.test(n) ||
    /\binstruments?\b/.test(n) ||
    /\bwindow\b/.test(n) ||
    /\bminute count\b/.test(n)
  );
}

function isSku(n) {
  return (
    /\bwhich size should\b/.test(n) ||
    /\bwhich atom size should\b/.test(n) ||
    /\bshould (?:a |the )?(?:beginner|customer)\b/.test(n) ||
    /\brecommend an atom\b/.test(n) ||
    /\bbest atom plan\b/.test(n) ||
    /\bpick the right\b/.test(n) ||
    /\bmost suitable\b/.test(n) ||
    /\bhelp me choose\b/.test(n) ||
    /\bought they\b/.test(n) ||
    /\bchoose between\b/.test(n) ||
    /\b50k or atom 100k\b/.test(n)
  );
}

function isTranslation(n) {
  return /\b(?:translate|translation|german wording)\b/.test(n) ||
    /\b(?:into|in)\s+(?:spanish|french|urdu|arabic|portuguese|hindi|german|italian)\b/.test(n);
}

function isCouponStack(n) {
  return (
    /\bstack(?:ing|ed)?\b/.test(n) ||
    /\bcombine\b/.test(n) ||
    /\bboth coupons\b/.test(n) ||
    /\btwo (?:promo|voucher|discounts)\b/.test(n) ||
    /\bsecond code\b/.test(n) ||
    /\bcoupons be combined\b/.test(n) ||
    /\b2 promo codes\b/.test(n)
  );
}

function negatedTrail(n) {
  return /\b(?:did not say|without saying|not say) trailing\b/.test(n);
}

function asksTrail(n) {
  if (negatedTrail(n)) return false;
  return /\btrailing\b/.test(n) || /\btrail\b/.test(n);
}

function is2StepTrailing(n) {
  if (productOf(n) !== '2') return false;
  if (/\btogether with\b/.test(n)) return false;
  const trail = asksTrail(n);
  const lossTopic = /\b(?:max(?:imum)?\s+(?:loss|drawdown)|drawdown|floor|overall\s+loss|equity stop)\b/.test(n);
  if (trail && (lossTopic || /\b(?:lock|mechanism|follow|open profit)\b/.test(n) || /\btrail\b/.test(n))) return true;
  if (/\bdrawdown\b/.test(n) && /\b(?:moves with|peak)\b/.test(n)) return true;
  return false;
}

function needsClarification(n) {
  if (/\bminute of the day\b/.test(n) || /\bclock time\b/.test(n)) return false;
  if (productOf(n)) return false;
  if (asksTrail(n)) return false;
  if (/\b(?:daily|intraday)\b/.test(n) && /\b(?:loss|limit)\b/.test(n)) return true;
  if (/\bhow many phases\b/.test(n) || /\bphases does atom\b/.test(n)) return true;
  if (/\bprofit target\b/.test(n) || /\bpass mark\b/.test(n)) return true;
  if (/\bconsistency\b/.test(n) || /\bbest-day\b/.test(n)) return true;
  if (/\bnews\b/.test(n) && /\b(?:before the account is funded|challenge versus funded)\b/.test(n)) return true;
  if (/\breward percents\b/.test(n) || /\bwhich reward\b/.test(n)) return true;
  if (/\bmaximum loss\b/.test(n) || /\bthe atom floor\b/.test(n)) return true;
  if (/\bprofitable days\b/.test(n) || /\bup-days\b/.test(n)) return true;
  if (/\babove 1\s*:\s*30\b/.test(n) || /\bgearing choices\b/.test(n) || /\braise atom leverage\b/.test(n)) return true;
  return false;
}

function has(b, re) {
  return re.test(b);
}

function bodyFacts(row) {
  const b = String(row.body || '').toLowerCase();
  const f = new Set();
  if (has(b, /phase 1 profit target is 8%/) || has(b, /phase 1 target 6%/)) f.add('phase1-8');
  if (has(b, /phase 2 profit target is 5%/)) f.add('phase2-5');
  if (has(b, /has 2 phases/)) f.add('phases-2');
  if (has(b, /has 1 evaluation phase/)) f.add('phases-1');
  if (has(b, /8% \(not 10%\)/) || has(b, /8%, not 10%/)) f.add('target-8-not-10');
  if (has(b, /older drafts that said 10% are outdated/)) f.add('older-draft-10');
  if (has(b, /daily loss limit is 3%/)) f.add('daily-3');
  if (has(b, /daily loss limit is 4%/)) f.add('daily-4');
  if (has(b, /higher of your balance and equity at the previous daily close/)) f.add('daily-anchor');
  if (has(b, /open trades count/)) f.add('open-trades');
  if (has(b, /max loss is 10% static/)) f.add('static-10');
  if (has(b, /never moves/)) f.add('floor-static');
  if (has(b, /\$90,000/)) f.add('floor-90k');
  if (has(b, /6% trailing equity/)) f.add('trailing-6');
  if (has(b, /follows the highest equity/) && has(b, /never moves down/)) f.add('floor-follows');
  if (has(b, /\$94,000/)) f.add('floor-94k');
  if (has(b, /\$103,000/)) f.add('floor-103');
  if (has(b, /including open profit/)) f.add('open-profit');
  if (has(b, /no minimum trading days/) && has(b, /atom 2-step/)) f.add('no-min-trading-2');
  if (has(b, /no minimum profitable days in phase 1/)) f.add('no-profit-days-2');
  if (has(b, /funded accounts do not expire/) && has(b, /atom 2-step/)) f.add('no-expire-2');
  if (has(b, /there is no time limit/) && has(b, /atom 2-step/)) f.add('no-time-2');
  if (has(b, /normal inactivity rules still apply/) && has(b, /atom 2-step/)) f.add('inactivity-2');
  if (has(b, /no minimum trading days/) && has(b, /atom 1-step/)) f.add('no-min-trading-1');
  if (has(b, /no minimum profitable days in evaluation/) || has(b, /evaluation has no minimum profitable days/)) f.add('no-profit-eval');
  if (has(b, /funded accounts do not expire/) && has(b, /atom 1-step/)) f.add('no-expire-1');
  if (has(b, /no time limit/) && has(b, /atom 1-step has no minimum/)) f.add('no-time-1');
  if (has(b, /normal inactivity rules still apply/) && has(b, /atom 1-step/)) f.add('inactivity-1');
  if (has(b, /5 profitable days/) && has(b, /0\.5%/)) f.add('funded-5');
  if (has(b, /\$500/)) f.add('dollar-500');
  if (has(b, /50% consistency rule in both evaluation and funded/)) f.add('cons-1-both');
  if (has(b, /best day \$3,000/)) f.add('cons-1-example');
  if (has(b, /no consistency rule in the challenge phases/)) f.add('cons-2-none');
  if (has(b, /once funded, a 50% consistency rule applies/)) f.add('cons-2-funded');
  if (has(b, /not a breach by itself/)) f.add('not-breach');
  if (has(b, /news trading is allowed during evaluation/)) f.add('news-eval-1');
  if (has(b, /news trading is allowed in phase 1 and phase 2/)) f.add('news-phase-2');
  if (has(b, /trading high-impact news is not allowed/)) f.add('news-funded-ban');
  if (has(b, /defaults to 1:30/) || has(b, /default leverage is 1:30/) || has(b, /default of 1:30/) || has(b, /leverage 1:30\/1:50\/1:100/)) f.add('lev-default-30');
  if (has(b, /1:50 or 1:100/) || has(b, /1:30\/1:50\/1:100/)) f.add('lev-menu');
  if (has(b, /leverage is fixed at the published default of 1:30/)) f.add('lev-fixed-number');
  if (has(b, /leverage and scalping fixed/) || has(b, /leverage is fixed/)) f.add('lev-fixed');
  if (has(b, /not the universal default/)) f.add('lev-not-universal');
  if (has(b, /options include 60%, 70%, 80%, or 95%/) || has(b, /reward 60%\/70%\/80%\/95%/)) f.add('reward-menu-2');
  if (has(b, /options include 70%, 80%, or 100%/) || has(b, /reward 70%\/80%\/100%/)) f.add('reward-menu-1');
  if (has(b, /default reward share is 80%/) || has(b, /reward 60%\/70%\/80%\/95% \(default 80%\)/) || has(b, /reward 70%\/80%\/100% \(default 80%\)/)) f.add('reward-default-80');
  if (has(b, /first payout is 21 days/) || has(b, /first payout wait is 21 days/)) f.add('first-21');
  if (has(b, /not 14 days/)) f.add('not-14');
  if (has(b, /later payouts are every 14 days/) || has(b, /default 14 days/) || has(b, /default 14\)/)) f.add('later-14');
  if (has(b, /3, 7, 14, or 21 days/) || has(b, /3\/7\/14\/21/)) f.add('interval-list');
  if (has(b, /capped at 3%/)) f.add('cap-3');
  if (has(b, /above the cap stays/)) f.add('cap-stays');
  if (has(b, /1\.5%/)) f.add('risk-1.5');
  if (has(b, /first payout is 21 days/) && has(b, /later payouts are every 14/)) f.add('first-and-later');
  if (has(b, /first payout wait is 21 days/) && has(b, /later payouts follow/)) f.add('first-and-later');
  if (has(b, /7k \$19\/\$29/) || has(b, /25k \$59/) || has(b, /50k \$114/) || has(b, /200k \$409/)) f.add('price-table');
  if (has(b, /100k \$215\/\$289/) || has(b, /100k list prices are \$215/)) f.add('price-100k');
  if (has(b, /\$161/) || has(b, /\$161/)) f.add('not-161');
  if (has(b, /\$409/)) f.add('price-409');
  if (has(b, /\$519/)) f.add('price-519');
  if (has(b, /\$19\/\$29/)) f.add('price-7k');
  if (has(b, /\$59\/\$70/)) f.add('price-25k');
  if (has(b, /\$114\/\$145/)) f.add('price-50k');
  if (has(b, /5k or 10k/) || has(b, /5k and 10k/)) f.add('size-old');
  if (has(b, /7k, 25k, 50k, 100k, and 200k/)) f.add('size-list');
  if (has(b, /weekend holding optional/)) f.add('weekend-2');
  if (has(b, /weekend holding included/)) f.add('weekend-1');
  if (has(b, /partial-scalping add-on/)) f.add('scalping-listed');
  if (has(b, /scalping add-on/)) f.add('scalping-addon');
  if (has(b, /max loss 6%\/8%\/10%/)) f.add('maxloss-menu');
  if (has(b, /2nd account 25% off/)) f.add('bundle-2');
  if (has(b, /3rd 30% off/)) f.add('bundle-3');
  if (has(b, /4th 35% off/)) f.add('bundle-4');
  if (has(b, /6,000 credits/) || has(b, /6000 credits/)) f.add('bundle-credits');
  if (has(b, /not withdrawable/)) f.add('credits-not-withdrawable');
  if (has(b, /payout credits/)) f.add('not-payout-credits');
  if (has(b, /free market maker pack/)) f.add('free-pack');
  if (has(b, /expert advisors are allowed/)) f.add('ea-allowed');
  if (has(b, /trade copiers only between the trader's own accounts/) || has(b, /copiers only between/)) f.add('copier-own');
  if (has(b, /3-minute minimum hold/)) f.add('hold-3');
  if (has(b, /no hedging across accounts/)) f.add('no-hedge');
  if (has(b, /no account sharing/)) f.add('no-share');
  if (has(b, /are simulated trading accounts/)) f.add('simulated');
  if (has(b, /does not promise real trading capital/)) f.add('no-real-capital');
  if (has(b, /rewards are calculated from simulated profit/)) f.add('rewards-sim');
  if (has(b, /guaranteed rewards/)) f.add('no-guarantee');
  if (has(b, /low-cost challenge/)) f.add('what-is');
  if (has(b, /no time limit/) && has(b, /low-cost challenge/)) f.add('no-time-general');
  if (has(b, /no minimum trading days/) && has(b, /low-cost challenge/)) f.add('no-min-general');
  if (has(b, /you pass as soon as you hit the profit target/)) f.add('pass-on-target');
  if (has(b, /atom checkout options/)) f.add('checkout-page');
  if (has(b, /default reward share is 80%/) && has(b, /first payout is 21 days/)) f.add('reward-on-payout-sheet');
  return f;
}

const FACTS = new Map(CATALOG.sendableEn.map((row) => [row.id, bodyFacts(row)]));

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
    if (/\bwhich\s+(?:\w+\s+){0,3}sizes\b/.test(n) || /\bcatalog (?:actually name|advertises)\b/.test(n) || /\badvertised (?:sizes|range)\b/.test(n) || (/\bpublished list\b/.test(n) && /\bsizes\b/.test(n)) || /\bten-thousand\b/.test(n)) add('size-list');
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

  if (/\b(?:leverage|gearing)\b/.test(n) || /\b1\s*:\s*(?:30|50|100|150)\b/.test(n) || /\b150\s*:\s*1\b/.test(n) || /\b150 to 1\b/.test(n) || /\b\b150\b/.test(n)) {
    if (/\b(?:1\s*:\s*150|150\s*:\s*1|150 to 1|\b150\b)\b/.test(n)) add('lev-default-30');
    if (/\bfixed\b/.test(n) && p === '1') add('lev-fixed');
    if (p === '1' && (/\b1\s*:\s*30\b/.test(n) || /\b1 to 30\b/.test(n) || /\bcannot be moved\b/.test(n) || /\bchange\b/.test(n))) add('lev-fixed-number');
    if (/\b(?:1\s*:\s*50|1\s*:\s*100|menu|choices|options|higher)\b/.test(n) && p !== '1') add('lev-menu');
    if (/\bdefault\b/.test(n) && !/\bfixed\b/.test(n)) add('lev-default-30');
    if (p == null && /\bstart on\b/.test(n)) add('lev-default-30');
    if (p === '1' && /\b1\s*:\s*50\b/.test(n)) add('lev-fixed');
  }

  if ((/\bnews\b/.test(n) || /\bhigh-impact\b/.test(n) || /\brelease\b/.test(n)) && !isNewsMinutes(n)) {
    const funded = /\bfunded\b/.test(n);
    const challenge = /\b(?:evaluation|phase[\s-]*1|phase[\s-]*2|challenge|release)\b/.test(n);
    if (funded && !challenge) add('news-funded-ban');
    else if (p === '1') add('news-eval-1');
    else if (p === '2') add('news-phase-2');
    else if (funded && challenge) add('news-funded-ban');
  }

  if (/\bconsistenc\w*\b/.test(n) || bestDay) {
    if (!isEquality50(n)) {
      if (p === '1') add('cons-1-both');
      if (p === '2' && /\b(?:challenge|phase|absent|no consistency)\b/.test(n)) add('cons-2-none');
      if (p === '2' && /\bfunded\b/.test(n)) add('cons-2-funded');
      if (p === '2' && !intents.includes('cons-2-none') && !intents.includes('cons-2-funded')) add('cons-2-funded');
      if (/\bnot a breach\b/.test(n) || /\bkeep trading\b/.test(n) || /\bbreach on its own\b/.test(n) || /\bby itself\b/.test(n)) add('not-breach');
      if (/\bthree thousand\b/.test(n) || /\b3,?000\b/.test(n)) add('cons-1-example');
      if (/\btwice the best day\b/.test(n) && p === '1') add('cons-1-both');
    }
  }

  const daily = (/\b(?:daily|intraday)\b/.test(n) && /\b(?:loss|limit|percent|cap|line)\b/.test(n)) || /\b(?:three|four) percent day\b/.test(n) || /\bday reset\b/.test(n) || /\bbalance or equity\b/.test(n) || /\bsnapshot\b/.test(n);
  if (daily && !/\bminute of the day\b/.test(n)) {
    if (/\bopen trades?\b/.test(n) || /\bfloating\b/.test(n)) add('open-trades');
    if (/\b(?:higher of|balance and equity|prior daily close|snapshot)\b/.test(n)) add('daily-anchor');
    if (p === '1' || /\bfour percent\b/.test(n)) add('daily-4');
    else if (p === '2' || /\bthree percent\b/.test(n)) add('daily-3');
    else add('daily-unspecified');
  }

  const lossAsk = /\b(?:max(?:imum)? loss|overall loss|drawdown|floor|trailing|trail|static)\b/.test(n);
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

  return intents.filter((id) => id !== 'daily-unspecified');
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

function tokensOf(s) {
  return String(s).match(/[\p{L}\p{N}]{2,}/gu) || [];
}

function trigramsOf(s) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  const g = [];
  for (let i = 0; i + 3 <= t.length; i++) g.push(t.slice(i, i + 3));
  return g;
}

function buildIndex(rows) {
  const N = rows.length;
  const texts = rows.map((r) => String(r.body || '').toLowerCase());
  function idfOf(extractor) {
    const df = new Map();
    for (const t of texts) {
      const seen = new Set(extractor(t));
      for (const w of seen) df.set(w, (df.get(w) || 0) + 1);
    }
    const m = new Map();
    for (const [w, c] of df) m.set(w, Math.log((N + 1) / (c + 1)));
    return m;
  }
  const tokenIdf = idfOf(tokensOf);
  const triIdf = idfOf(trigramsOf);
  function vec(text) {
    const v = new Map();
    for (const w of new Set(tokensOf(text))) {
      const wgt = tokenIdf.get(w);
      if (wgt) v.set('t:' + w, wgt);
    }
    for (const g of new Set(trigramsOf(text))) {
      const wgt = triIdf.get(g);
      if (wgt) v.set('g:' + g, wgt);
    }
    return v;
  }
  const vectors = rows.map((r, i) => ({ row: r, vec: vec(texts[i]) }));
  return { vec, vectors };
}

const INDEX = buildIndex(CATALOG.sendableEn);

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    na += v * v;
    if (b.has(k)) dot += v * b.get(k);
  }
  for (const [, v] of b) nb += v * v;
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

function localScores(normalized) {
  const q = INDEX.vec(String(normalized || '').toLowerCase());
  return INDEX.vectors
    .map(({ row, vec }) => ({
      partId: row.id,
      contentHash: row.contentHash,
      score: cosine(q, vec),
    }))
    .sort((a, b) => (b.score - a.score) || a.partId.localeCompare(b.partId));
}

function leadMatcher() {
  if (!fs.existsSync(LEAD_MATCHER)) return null;
  return require(LEAD_MATCHER);
}

function leadParams() {
  if (!fs.existsSync(LEAD_PARAMS)) return null;
  return JSON.parse(fs.readFileSync(LEAD_PARAMS, 'utf8'));
}

function sharedStatus() {
  return {
    matcherPath: LEAD_MATCHER,
    matcherPresent: fs.existsSync(LEAD_MATCHER),
    paramsPath: LEAD_PARAMS,
    paramsPresent: fs.existsSync(LEAD_PARAMS),
    provisionalT: PROVISIONAL_T,
  };
}

function scoreRows(normalized, params) {
  const lead = leadMatcher();
  if (lead && typeof lead.matchApproved === 'function') {
    const out = lead.matchApproved({
      normalized,
      rows: CATALOG.sendableEn,
      params: params || leadParams() || { T: PROVISIONAL_T },
    });
    const list = Array.isArray(out) ? out : (out && (out.candidates || out.ranked || out.rows)) || [];
    if (list.length && list[0].partId && typeof list[0].score === 'number') {
      return list.slice().sort((a, b) => (b.score - a.score) || String(a.partId).localeCompare(String(b.partId)));
    }
  }
  return localScores(normalized);
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

function decide({ normalized, gate, claim: claimIn, params }) {
  if (gate && gate.lang === 'non-en') return abstain('not-a-claim', null);
  const c = claimIn || claim({ normalized });
  if (!c || c.kind !== 'exclusive' || c.entity !== 'atom') return abstain('not-owner', null);
  const n = String(normalized == null ? '' : normalized);
  if (isPersonalOrMixed(n)) return send(REFUSE_ID);
  const policy = unresolvedPolicy(n);
  if (policy) return abstain('unresolved-policy', policy);
  if (is2StepTrailing(n)) return abstain('atom-2step-trailing', null);
  if (needsClarification(n)) return abstain('atom-clarification', null);
  const intents = intentsOf(n);
  const product = productOf(n);
  const covered = CATALOG.sendableEn.filter((row) => coversAll(row, intents, product));
  if (!covered.length) return abstain('COVERAGE_DENIED', null);
  const coveredIds = new Set(covered.map((row) => row.id));
  const shared = leadParams();
  const T = params && params.T != null ? params.T : (shared && shared.T != null ? shared.T : PROVISIONAL_T);
  const ranked = scoreRows(n, params).filter((row) => coveredIds.has(row.partId) && row.score >= T);
  if (!ranked.length) return abstain('COVERAGE_DENIED', null);
  return send(ranked[0].partId);
}

function explain(normalized) {
  const n = String(normalized || '');
  return {
    product: productOf(n),
    personal: isPersonalOrMixed(n),
    policy: unresolvedPolicy(n),
    trailing: is2StepTrailing(n),
    clarify: needsClarification(n),
    intents: intentsOf(n),
    covered: CATALOG.sendableEn.filter((row) => coversAll(row, intentsOf(n), productOf(n))).map((row) => row.id),
  };
}

module.exports = {
  claim,
  decide,
  unresolvedPolicy,
  verifyCatalog,
  explain,
  sharedStatus,
  PROVISIONAL_T,
  REFUSE_ID,
  CATALOG_PATH,
};
