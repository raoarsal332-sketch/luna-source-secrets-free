'use strict';

/**
 * Build a field table from the currently active canonical FAQ articles.
 * Product identities are stable aliases; every rule and number comes from article
 * bodies. A missing value stays unknown and is never silently made "shared".
 */
const PRODUCT_IDS = [
  { id: 'lite-2-step', label: '2-Step Lite', display: 'Lite 2-Step', aliases: ['Lite 2-Step'], product: 'lite-2-step', re: /\b(?:2[\s-]*step\s+lite|lite[\s-]*2[\s-]*step)\b/ig },
  { id: '2-step', label: '2-Step + Free Retry', product: '2-step', re: /\b2[\s-]*step(?:\s+challenge)?\s*(?:\+|with)?\s*(?:free[\s-]*retry|second\s+chance)\b/ig },
  { id: 'lite-1-step', label: '1-Step Lite', display: 'Lite 1-Step', aliases: ['Lite 1-Step'], product: 'lite-1-step', re: /\b(?:1[\s-]*step\s+lite|lite[\s-]*1[\s-]*step)\b/ig },
  { id: '1-step', label: '1-Step + Free Retry', product: '1-step', re: /\b1[\s-]*step(?:\s+challenge)?\s*(?:\+|with)?\s*(?:free[\s-]*retry|second\s+chance)\b/ig },
  { id: 'instant-elite', label: 'Instant Elite', product: 'instant', re: /\binstant\s+elite\b/ig },
  { id: 'instant', label: 'Instant', display: 'Instant Standard', aliases: ['Instant Standard'], product: 'instant', re: /\binstant(?:\s+challenge)?\b/ig },
  { id: 'flash', label: 'Flash Activation', product: 'flash', re: /\bflash(?:\s+activation)?(?:\s+challenge)?\b/ig },
  { id: 'catalyst', label: 'Catalyst', product: 'catalyst', re: /\bcatalyst(?:\s+challenge)?\b/ig },
];
const FIELD_LABELS = Object.freeze({
  evaluationStages: 'Evaluation stages',
  phase1Target: 'Phase 1 target',
  phase2Target: 'Phase 2 target',
  stageTarget: 'Profit target',
  dailyLoss: 'Daily Loss Limit',
  maxLoss: 'Max Loss Limit',
  drawdown: 'Drawdown calculation',
  minDays: 'Minimum trading days',
  dailyPnl: 'Qualifying daily P&L',
  profitSplit: 'Profit split',
  payoutCadence: 'Payout cadence',
  consistency: 'Consistency rule',
  leverage: 'Leverage',
  freeRetry: 'Free Retry / Second Chance',
  livePhase: 'Live phase',
  accountSizes: 'Account sizes',
  addons: 'Add-ons',
  activation: 'Activation conditions',
});

function plain(s) {
  return String(s || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/\u200b/g, '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}
function norm(s) { return plain(s).toLowerCase().replace(/\s+/g, ' ').trim(); }
function nums(s, unit) {
  const re = unit === '$' ? /\$\s*([\d.,]+)\s*(k|m(?:illion)?)?\b/gi : unit === ':' ? /\b1\s*:\s*(\d+)\b/g
    // "4 profitable days", "3 trading days" are day counts too (qualified counts were invisible).
    : unit === 'days' ? /\b(\d+)\s*(?:(?:profitable|trading|calendar|business|working|positive|winning|qualifying)\s+){0,2}days?\b/gi : unit === 'stages' ? /\b(\d+)\s*(?:evaluation\s+)?phases?\b/gi
      : /\b(\d+(?:[.,]\d+)?)\s*%/g;
  const out = [];
  for (const m of String(s || '').matchAll(re)) {
    let n = Number(String(m[1]).replace(',', '.'));
    if (unit === '$') {
      const raw = m[1]; n = Number(raw.replace(/[.,]/g, ''));
      if (m[2]) n = Number(raw.replace(',', '.')) * (/^m/i.test(m[2]) ? 1000000 : 1000);
    }
    if (Number.isFinite(n) && !out.includes(n)) out.push(n);
  }
  return out;
}
function fact(mode, values, detail, source) {
  return { mode, values: (values || []).slice(), detail: String(detail || '').replace(/\s+/g, ' ').trim(), source };
}
function optionsAfter(lines, anchor, unit, source) {
  const i = lines.findIndex((x) => anchor.test(x));
  if (i < 0) return null;
  const values = [];
  for (let j = i + 1; j < lines.length && j <= i + 14; j++) {
    const line = lines[j].trim();
    if (!line) continue;
    if (!/^[-*•]\s+/.test(line)) break;
    const found = nums(line, unit);
    if (!found.length) break;
    for (const n of found) if (!values.includes(n)) values.push(n);
  }
  return values.length ? fact('SELECTABLE', values, lines[i], source) : null;
}
function first(text, re) {
  const m = String(text || '').match(re);
  return m ? m : null;
}
function scalar(text, re, mode, source, detail) {
  const m = first(text, re);
  return m ? fact(mode || 'FIXED', nums(m[1] || m[0], '%'), detail || m[0], source) : null;
}
function formatNumber(n, unit) {
  if (unit === '$') return '$' + (n >= 1000000 ? (n / 1000000) + 'M' : n >= 1000 ? (n / 1000) + 'k' : n);
  if (unit === ':') return '1:' + n;
  if (unit === 'days') return n + (n === 1 ? ' day' : ' days');
  if (unit === 'stages') return n === 0 ? 'no evaluation phase' : n + (n === 1 ? ' evaluation phase' : ' evaluation phases');
  return n + '%';
}
/**
 * CMP_MAINDIFF_V1 (2026-10-05, Arsal): list every selectable value only when the client
 * asked for sizes / exact options / a full list. Otherwise summarize long option sets.
 */
function wantsSizeList(text) {
  const t = String(text || '');
  return /\b(?:what|which)\b[^?.!\n]{0,50}\b(?:account\s+)?sizes?\b|\b(?:list|all)\s+(?:the\s+)?(?:available\s+)?(?:account\s+)?sizes?\b|\b(?:account\s+)?sizes?\s+(?:are\s+)?available\b|\ball\s+(?:the\s+)?(?:available\s+)?(?:account\s+)?sizes?\b|\bhow\s+many\s+(?:account\s+)?sizes?\b/i.test(t);
}
function wantsExactOptions(text) {
  const t = String(text || '');
  if (wantsSizeList(t)) return true;
  return /\bexact\s+options\b|\bwhich\s+options\b|\bwhat\s+options\b|\ball\s+(?:the\s+)?options\b|\blist\s+(?:them|the\s+options|every)\b|\bwhat\s+can\s+i\s+(?:select|choose|pick)\b|\b(?:what|which)\b[^?.!\n]{0,40}\b(?:choices|cycles|percentages|levels|splits)\b/i.test(t);
}
function isMainDiffAsk(text) {
  const t = String(text || '');
  if (!t.trim() || wantsExactOptions(t)) return false;
  return /\b(?:main|key|primary|biggest|major)\s+differen|\bwhat(?:'s|\s+is)\s+the\s+differen|\bdifferen(?:ce|ces|t)\s+between\b|\bcompare\b|\bvs\.?\b|\bversus\b|\bwhat(?:'s|\s+is)\s+(?:different|the\s+difference)\b/i.test(t);
}
function valueText(f, unit, exact) {
  if (!f) return 'not published in the available product article';
  if (f.mode === 'YES') return 'included' + (f.retryModifiers && f.retryModifiers.length
    ? '; on the second-chance account: ' + f.retryModifiers.join('; ').replace(/(\d),(\d+)%/g, '$1.$2%') : '');
  if (f.mode === 'NO') return f.detail || 'not included';
  if (f.mode === 'TEXT') return f.detail;
  const values = f.values.map((n) => formatNumber(n, unit));
  if (f.mode === 'SELECTABLE') {
    // CMP_MAINDIFF_V1: summarize long account-size lists unless the client asked for sizes/exact
    // options. Differing selectable %/days option sets must still list values (hiding 7% vs 9%
    // would mis-state the products); Same-on-Both summaries are handled in render().
    if (!exact && values.length > 3 && unit === '$') {
      return 'available in the same account-size range';
    }
    const base = exact || values.length <= 3 || unit === ':'
      ? values.join(', ')
      : unit === '%' && values.length >= 4 && f.rangeAllowed
        ? formatNumber(Math.min(...f.values), unit) + '–' + formatNumber(Math.max(...f.values), unit)
        : values.join(', ');
    return 'selectable: ' + base + (f.defaultValue != null ? '; ' + (f.defaultLabel || 'standard') + ' ' + formatNumber(f.defaultValue, unit === 'days' ? 'days' : unit) : '') +
      (f.firstValue != null ? '; first payout split ' + formatNumber(f.firstValue, '%') : '') +
      (f.firstPayout != null ? '; first payout after ' + formatNumber(f.firstPayout, 'days') : '') +
      (f.retryValue != null ? '; second-chance ' + formatNumber(f.retryValue, unit) + (unit === '%' && f.retryMetric === 'profitSplit' ? ' for future payouts' : '') : '');
  }
  return (values.length ? values.join(', ') : f.detail) +
    (f.retryValue != null ? '; second-chance ' + formatNumber(f.retryValue, unit) : '');
}
function articleBundle(spec, articles) {
  // PRODUCT_SCOPE_V2: a Catalyst article whose metadata carries no product ("Starting sizes") still
  // belongs to the Catalyst collection; without it the table could not see Catalyst's sizes.
  const productOf = (a) => a.product || (/^\s*catalyst\s+challenge\s*$/i.test(String(a.collection || '')) ? 'catalyst' : null);
  const selected = (articles || []).filter((a) => a && productOf(a) === spec.product && a.sourceType !== 'approved_internal');
  // The main product article comes first. Child policy cards fill stage-specific gaps.
  selected.sort((a, b) => (String(a.id).includes('__') ? 1 : 0) - (String(b.id).includes('__') ? 1 : 0));
  return selected;
}
function extractProfile(spec, articles) {
  const bundle = articleBundle(spec, articles);
  if (!bundle.length) return null;
  const source = bundle.map((a) => ({ id: a.id, hash: a.sourceHash || null, url: a.url || null }));
  const body = bundle.map((a) => plain(a.title) + '\n' + plain(a.body)).join('\n');
  const lines = body.split('\n').map((s) => s.trim()).filter(Boolean);
  const main = source[0];
  const fields = {};
  fields.accountSizes = optionsAfter(lines, /available in the following sizes/i, '$', main)
    || optionsAfter(lines, /choose your starting account size/i, '$', main);
  // A ladder product states where the ladder ends; the starting sizes alone would hide it.
  const ladderTop = first(body, /top of the ladder is\s*\$\s*([\d.,]+)(?:\s*\/\s*|\s+with\s+an?\s+)(\d+)\s*%/i);
  if (fields.accountSizes && ladderTop) {
    fields.accountSizes.ladderTop = Number(String(ladderTop[1]).replace(/[.,]/g, ''));
    fields.accountSizes.detail = 'starting sizes; each approved payout doubles the account up to ' + formatNumber(fields.accountSizes.ladderTop, '$');
  }
  fields.phase1Target = optionsAfter(lines, /profit target.*(?:phase\s*1|following percentages)/i, '%', main)
    || scalar(body, /\bprofit target\s*:\s*(\d+(?:[.,]\d+)?\s*%)/i, 'FIXED', main);
  fields.phase2Target = scalar(body, /phase\s*2[^\n.]*?reduces?\s+to\s+(\d+(?:[.,]\d+)?\s*%)/i, 'FIXED', main);
  if (/composed of a phase\s*1,?\s*a phase\s*2/i.test(body)) fields.evaluationStages = fact('FIXED', [2], 'two evaluation phases before live', main);
  else if (/composed of a phase\s*1 and a live phase|only one evaluation phase|single evaluation phase/i.test(body)) {
    fields.evaluationStages = fact('FIXED', [1], 'one evaluation phase before live', main);
    fields.phase2Target = fact('NO', [], 'no Phase 2', main);
  } else if (/no evaluation phase|composed only of a live phase|single stage instant funded/i.test(body)) {
    fields.evaluationStages = fact('FIXED', [0], 'starts live without an evaluation phase', main);
    fields.phase2Target = fact('NO', [], 'no Phase 2', main);
  }
  // Stage-dependent max loss ("6% at the $25,000 stage and 5% at every stage from $50,000 upwards").
  const stagedMax = first(body, /max loss limit[\s\S]{0,500}?percentage is\s*(\d+(?:[.,]\d+)?)\s*%\s*at the\s*\$\s*([\d.,]+)\s*stage and\s*(\d+(?:[.,]\d+)?)\s*%\s*at every stage from\s*\$\s*([\d.,]+)/i);
  fields.maxLoss = (stagedMax && fact('TEXT', [Number(stagedMax[1]), Number(stagedMax[3])],
    stagedMax[1] + '% at the ' + formatNumber(Number(stagedMax[2].replace(/[.,]/g, '')), '$') + ' stage, ' + stagedMax[3] + '% from ' +
    formatNumber(Number(stagedMax[4].replace(/[.,]/g, '')), '$') + ' upward', main))
    || optionsAfter(lines, /max loss limit can be selected/i, '%', main)
    || scalar(body, /fixed max loss limit of\s*(\d+(?:[.,]\d+)?\s*%)/i, 'FIXED', main)
    || scalar(body, /(?:max(?:imum)?|total)\s+(?:loss|drawdown)[^\n:]{0,35}:?\s*(\d+(?:[.,]\d+)?\s*%)/i, 'FIXED', main);
  if (fields.maxLoss && fields.maxLoss.mode === 'SELECTABLE') fields.maxLoss.rangeAllowed = true;
  // LITE1_MLL_V1 (2026-09-28): a documented default max loss ("a default max loss limit of 6%", the owner-corrected
  // Lite 1-Step sentence) is carried as the field's default, so comparisons show it and never another value.
  const mlDefault = first(body, /default max(?:imum)? loss limit (?:is |of )?(\d+(?:[.,]\d+)?)\s*%/i);
  if (fields.maxLoss && fields.maxLoss.mode === 'SELECTABLE' && mlDefault) {
    const v = Number(mlDefault[1].replace(',', '.'));
    if (fields.maxLoss.values.includes(v)) { fields.maxLoss.defaultValue = v; fields.maxLoss.defaultLabel = 'default'; }
  }
  fields.profitSplit = optionsAfter(lines, /profit split can be selected/i, '%', main)
    || scalar(body, /profit split\s*:\s*(\d+(?:[.,]\d+)?\s*%)/i, 'FIXED', main)
    || scalar(body, /\bwith an?\s+(\d+(?:[.,]\d+)?\s*%)\s+profit split/i, 'FIXED', main);
  if (fields.profitSplit && fields.profitSplit.mode === 'FIXED' && ladderTop) {
    fields.profitSplit = fact('TEXT', [fields.profitSplit.values[0], Number(ladderTop[2])],
      'starts at ' + fields.profitSplit.values[0] + '%, rising with each ladder stage to ' + ladderTop[2] + '%', main);
  }
  const firstSplit = first(body, /first profit split at\s*(\d+(?:[.,]\d+)?\s*%)/i);
  if (fields.profitSplit && firstSplit) fields.profitSplit.firstValue = nums(firstSplit[1], '%')[0];
  fields.leverage = optionsAfter(lines, /leverage.*selected with the following levels/i, ':', main);
  const fixedLev = first(body, /leverage is fixed at up to\s*(1\s*:\s*\d+)/i);
  if (fixedLev) fields.leverage = fact('FIXED', nums(fixedLev[1], ':'), 'up to ' + fixedLev[1], main);
  const payout = first(body, /standard days between payouts are\s*(\d+)/i);
  fields.payoutCadence = optionsAfter(lines, /standard days between payouts are/i, '%', main);
  // Payout lists are days, not percentages.
  if (payout) {
    const i = lines.findIndex((x) => /standard days between payouts are/i.test(x));
    const choices = [];
    for (let j = i + 1; j < lines.length && j <= i + 8; j++) {
      const m = lines[j].match(/^[-*•]\s*(\d+)\s*days?$/i);
      if (!m) break;
      choices.push(Number(m[1]));
    }
    fields.payoutCadence = fact(choices.length ? 'SELECTABLE' : 'FIXED', choices.length ? choices : [Number(payout[1])],
      'first payout after 21 days only if stated by source', main);
    fields.payoutCadence.defaultValue = Number(payout[1]);
    const firstPayout = first(body, /first payout[^\n.]{0,80}after\s*(\d+)\s*days/i);
    if (firstPayout) fields.payoutCadence.firstPayout = Number(firstPayout[1]);
  }
  const daily = first(body, /fixed daily loss limit of\s*(\d+(?:[.,]\d+)?\s*%)/i)
    || first(body, /(?:maximum\s+daily\s+drawdown|max\s+daily\s+loss|daily loss limit)\s*(?::|is|of)?\s*(\d+(?:[.,]\d+)?\s*%)/i);
  if (daily) fields.dailyLoss = fact('FIXED', nums(daily[1], '%'), daily[0], main);
  const dd = first(body, /drawdown type is[^\n.]+/i) || first(body, /(?:max drawdown becomes|total drawdown\s*:)\s*[^\n.]+/i)
    || first(body, /max loss limit type is\s*[^\n.]+/i);
  if (dd) {
    // Compare drawdown TYPES, not article sentences: "Drawdown type is Trailing" and "Max loss limit
    // type is Trailing equity" are the same rule. The daily line's end-of-day reference is part of it.
    const mll = /static/i.test(dd[0]) ? 'static' : /trailing/i.test(dd[0]) ? 'trailing' : null;
    const eod = /\bEOD\b|end of day|last EOD|closing (?:balance|equity)/i.test(body);
    fields.drawdown = mll
      ? fact('TEXT', [], mll + ' max loss' + (eod ? '; daily loss measured from the end-of-day level' : ''), main)
      : fact('TEXT', [], dd[0].replace(/\s+/g, ' '), main);
  }
  const evalDd = first(body, /during the evaluation phase[^\n.]*(?:drawdown|drawdwn) type is\s*(static|trailing)/i);
  const liveDd = first(body, /max drawdown becomes\s*(static|trailing)/i);
  if (evalDd && liveDd) fields.drawdown = fact('TEXT', [], 'evaluation ' + evalDd[1] + '; live ' + liveDd[1], main);
  const consistency = first(body, /consistency is\s*\d+\s*%[^\n.]*/i)
    || first(body, /consistency rule[^\n:]*:\s*[^\n]+/i)
    || first(body, /up to\s*\d+\s*%\s+of your total account profit in a single trading day/i);
  if (consistency) {
    const cv = nums(consistency[0], '%');
    const fixedRule = /not\s+removable|cannot\s+be\s+removed|no\s+add-?on\s+to\s+remove/i.test(body);
    // CMP_MAINDIFF_V1 (2026-10-05, Arsal): Instant Standard consistency wording is exact —
    // "25% Consistency Rule — most profitable day must not exceed 25% of total profit".
    if (spec.id === 'instant' && cv[0] === 25) {
      fields.consistency = fact('TEXT', cv,
        '25% Consistency Rule — most profitable day must not exceed 25% of total profit', main);
    } else {
      fields.consistency = fact('TEXT', cv, cv.length
        ? cv[0] + '% Consistency Rule' + (fixedRule ? ', cannot be removed' : '')
        : consistency[0], main);
    }
  }
  else if (/consistency rule,?\s+if you enabled it at checkout/i.test(body)) {
    fields.consistency = fact('TEXT', [], 'optional: applies only if enabled at checkout', main);
  }
  const days = first(body, /Phase\s*1:\s*a minimum of\s*(\d+)\s+trading days/i)
    || first(body, /at least\s*(\d+)\s+profitable trading days/i)
    || first(body, /no minimum trading days \(in the challenge phase only\)/i);
  if (days) fields.minDays = days[1] ? fact('FIXED', [Number(days[1])], fields.evaluationStages && fields.evaluationStages.values[0] === 0
    ? 'profitable days required before a payout' : 'Phase 1; live phase is separate', main)
    : fact('FIXED', [0], 'evaluation phase only; live phase differs', main);
  const pnl = first(body, /Phase\s*1:[^\n]*?positive P&L of at least\s*(\d+(?:[.,]\d+)?\s*%)/i)
    || first(body, /(?:profitable trading days|minimum positive P&L)[^\n]*?positive P&L of at least\s*(\d+(?:[.,]\d+)?\s*%)/i);
  if (pnl) fields.dailyPnl = fact('FIXED', nums(pnl[1], '%'), 'Phase 1 daily qualifying P&L', main);
  if (/second chance free retry|right to obtain your second chance/i.test(body)) {
    fields.freeRetry = fact('YES', [], 'Eligible evaluation retry; live phase excluded', main);
    const retryAt = lines.findIndex((line) => /second chance modifications:/i.test(line));
    if (retryAt >= 0) {
      const mods = [];
      for (let i = retryAt + 1; i < lines.length && i <= retryAt + 8; i++) {
        if (!/^[-*•]\s+/.test(lines[i])) break;
        mods.push(lines[i].replace(/^[-*•]\s+/, '').replace(/\s+/g, ' ').trim());
      }
      if (mods.length) fields.freeRetry.retryModifiers = mods;
      for (const mod of mods) {
        const percentages = nums(mod, '%');
        if (!percentages.length) continue;
        const key = /\bDLL\b|daily loss/i.test(mod) ? 'dailyLoss'
          : /\bMLL\b|max(?:imum)? loss/i.test(mod) ? 'maxLoss'
            : /P\s*&\s*L/i.test(mod) ? 'dailyPnl'
              : /profit split/i.test(mod) ? 'profitSplit' : null;
        if (key && fields[key]) {
          fields[key].retryValue = percentages[percentages.length - 1];
          fields[key].retryMetric = key;
        }
      }
    }
  }
  else if (/does not have second chance|no retries|no second chance included|do not come with second chance/i.test(body)) fields.freeRetry = fact('NO', [], 'not included', main);
  if (!fields.payoutCadence) {
    const firstReq = first(body, /first payout[^\n.]*?requestable after\s*(\d+)\s*days/i);
    const laterReq = first(body, /every payout after that[^\n.]*?requestable after\s*(\d+)\s*days/i);
    if (firstReq) {
      fields.payoutCadence = fact('TEXT', [Number(firstReq[1])].concat(laterReq ? [Number(laterReq[1])] : []),
        'first payout after ' + firstReq[1] + ' days' + (laterReq ? ', then every ' + laterReq[1] + ' days' : ''), main);
    }
  }
  // A single-stage product's profit target is per stage, not a "Phase 1" target.
  if (fields.evaluationStages && fields.evaluationStages.values[0] === 0) {
    const t = optionsAfter(lines, /profit target,?\s+selected at checkout|adjustable profit target/i, '%', main);
    if (t) { fields.stageTarget = t; fields.stageTarget.rangeAllowed = false; delete fields.phase1Target; }
    else if (/no profit target|no specific profit target/i.test(body) || spec.product === 'instant') fields.stageTarget = fact('NO', [], 'no profit target', main);
  }
  if (!fields.freeRetry && /one reset per stage|carries its own paid reset/i.test(body)) {
    fields.freeRetry = fact('TEXT', [], 'no free retry; one paid reset per ladder stage', main);
  }
  const live = first(body, /Live phase only requires[^\n.]+/i)
    || first(body, /composed only of a live phase[^\n.]*/i)
    || first(body, /(?:no evaluation phase|single stage instant funded challenge)[^\n.]*/i);
  if (live) fields.livePhase = fact('TEXT', nums(live[0], '%'), live[0], main);
  // "composed only of a live phase" and "single stage instant funded challenge" say the same thing.
  if (fields.evaluationStages && fields.evaluationStages.values[0] === 0) fields.livePhase = fact('TEXT', [], 'funded from day one', main);
  const addons = [];
  if (/enable the scalping addon/i.test(body)) addons.push('scalping');
  if (/enable the weekend trading addon/i.test(body)) addons.push('weekend trading');
  if (addons.length) fields.addons = fact('TEXT', [], addons.join(' and ') + ' optional', main);
  const activation = first(body, /(?:completing KYC|activation fee|Live Trader Contract)[^\n.]*/i);
  if (activation) fields.activation = fact('TEXT', [], activation[0], main);
  // Instant Elite is a named size variant within the Instant article. Only use the
  // article's explicit Elite sentence; all other fields inherit the same source.
  if (spec.id === 'instant-elite') {
    // INSTANT_VARIANTS_OFFICIAL_V2 (official FAQ 12683783, 2026-09-27): the article names the formats and
    // the rule that differs ("INSTANT ELITE: This format does not include the Consistency Rule"). A variant
    // sentence that excludes the consistency rule overrides the parent article's consistency figure.
    const plainBody = String(body || '').replace(/<[^>]+>/g, ' ');
    if (/\binstant\s+elite\b[^\n]{0,80}\b(?:does\s+not|doesn['\u2019]?t)\s+include\s+the\s+consistency\s+rule/i.test(plainBody)) {
      // CMP_MAINDIFF_V1 (2026-10-05, Arsal): exact Instant Elite consistency wording.
      fields.consistency = fact('NO', [], 'no Consistency Rule', main);
    }
    const elite = first(body, /Instant Elite additionally offers\s+([^\n.]+)\s+accounts/i);
    if (elite && fields.accountSizes) {
      const vals = nums(elite[1], '$');
      fields.accountSizes = fact('SELECTABLE', [...new Set(fields.accountSizes.values.concat(vals))], 'Instant Elite sizes', main);
    }
  }
  return { id: spec.id, label: spec.label, display: spec.display || spec.label, aliases: spec.aliases || [], fields, source };
}
function resolvePair(query, history) {
  const candidates = [String(query || ''), ...(history || []).slice().reverse().map(String)];
  for (const text of candidates) {
    const found = [];
    for (const spec of PRODUCT_IDS) {
      spec.re.lastIndex = 0;
      let match;
      while ((match = spec.re.exec(text))) found.push({ spec, start: match.index, end: spec.re.lastIndex });
    }
    found.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const chosen = [];
    for (const m of found) {
      if (chosen.some((x) => m.start >= x.start && m.end <= x.end)) continue;
      if (!chosen.some((x) => x.spec.id === m.spec.id)) chosen.push(m);
    }
    if (chosen.length >= 2) return chosen.slice(0, 2).map((x) => x.spec);
  }
  return null;
}
/**
 * True when the latest client text itself is an explicit product compare / sameness ask.
 * Bare "same" is not enough — "same day / same account / same trade" must not revive a
 * prior Instant vs Instant Elite pair (live 215476215969258).
 */
function isExplicitComparisonAsk(latest) {
  const current = String(latest || '');
  if (!current.trim()) return false;
  if (/\bsame\s+(?:day|time|account|trade|week|month|order|position)\b/i.test(current) &&
      !/\b(?:are|is)\s+(?:(?:they|these|both)\s+)?(?:the\s+)?same\b|\b(?:the\s+)?same\s+(?:rules?|as|for\s+both)\b/i.test(current)) {
    return false;
  }
  const explicit = /\b(?:compare|comparison|differ\w*|versus|vs\.?|between|which\s+(?:one|product)\s+has)\b/i.test(current);
  // Drop bare \bsame\b. Allow only sameness phrases that clearly mean product-rule equality.
  const follow = /\b(?:anything else|only these|other rules|rest of the rules|what about|which exact options|exact options|better target|(?:are|is)\s+(?:(?:they|these|both)\s+)?(?:the\s+)?same\b|(?:the\s+)?same\s+(?:rules?|as|for\s+both)\b)\b/i.test(current);
  const twoNamedProducts = !!resolvePair(current);
  return !!(explicit || follow || (twoNamedProducts && /\?|\b(?:or|which|better|best)\b/i.test(current)));
}
function isComparisonTurn(latest, resolved, history) {
  const current = String(latest || '');
  if (!isExplicitComparisonAsk(current)) return false;
  return !!resolvePair(resolved || current, history);
}
function comparable(f) {
  if (!f) return null;
  return JSON.stringify([f.mode, f.values.slice().sort((a, b) => a - b), f.defaultValue ?? null,
    f.firstPayout ?? null, f.firstValue ?? null, f.retryValue ?? null, f.mode === 'TEXT'
      ? norm(f.detail).replace(/\b(?:the|a|an|this|challenge|lite|instant|elite|free retry)\b/g, '').trim() : '']);
}
function build(query, articles, history) {
  const pair = resolvePair(query, history);
  if (!pair) return null;
  const a = extractProfile(pair[0], articles);
  const b = extractProfile(pair[1], articles);
  if (!a || !b) return null;
  const fields = Object.keys(FIELD_LABELS).map((key) => {
    const left = a.fields[key] || null;
    const right = b.fields[key] || null;
    const status = !left || !right ? 'NOT_PUBLISHED'
      : comparable(left) === comparable(right) ? 'SAME'
        : (left.mode === 'NO' || right.mode === 'NO') ? 'PRODUCT-SPECIFIC'
        : (left.mode === 'SELECTABLE' || right.mode === 'SELECTABLE') ? 'SELECTABLE / RANGE'
          : 'DIFFERENT';
    // Different option sets can have the same endpoints. Showing only a range
    // would hide the very option that distinguishes the products.
    if (status === 'SELECTABLE / RANGE') {
      if (left) left.rangeAllowed = false;
      if (right) right.rangeAllowed = false;
    }
    return { key, label: FIELD_LABELS[key], status, different: !!left && !!right && status !== 'SAME', a: left, b: right };
  });
  return { pair: [a, b], fields, sourceHashes: [...a.source, ...b.source].map((s) => s.hash).filter(Boolean) };
}
function unit(key) {
  if (key === 'accountSizes') return '$';
  if (key === 'leverage') return ':';
  if (key === 'evaluationStages') return 'stages';
  if (key === 'minDays' || key === 'payoutCadence') return 'days';
  return '%';
}
function displayValue(field, side, exact, compactRetry) {
  const own = side ? field.b : field.a;
  const other = side ? field.a : field.b;
  if (field.key === 'freeRetry' && compactRetry && own && own.mode === 'YES' && own.retryModifiers && own.retryModifiers.length)
    return 'included; eligible evaluation retry starts again from Phase 1; live phase excluded';
  if (field.key === 'accountSizes' && own && own.ladderTop) {
    return 'starts at ' + own.values.map((n) => formatNumber(n, '$')).join(' or ') + ', doubling with each approved payout up to ' + formatNumber(own.ladderTop, '$');
  }
  if (field.key === 'accountSizes' && !exact && own && other) {
    const values = own.values.slice().sort((a, b) => a - b);
    const unique = values.filter((n) => !other.values.includes(n));
    if (!values.length) return valueText(own, '$', exact);
    if (!unique.length) return 'available in the same account-size range';
    if (unique.length > 3) return 'selectable from ' + formatNumber(values[0], '$') + ' up to ' + formatNumber(values[values.length - 1], '$');
    const list = unique.map((n) => formatNumber(n, '$')).join(' and ');
    return 'selectable sizes include ' + list + '; other tiers shared';
  }
  if (field.key !== 'accountSizes' || exact || !own || !other) return valueText(own, unit(field.key), exact);
  const values = own.values.slice().sort((a, b) => a - b);
  const unique = values.filter((n) => !other.values.includes(n));
  if (!values.length) return valueText(own, '$', exact);
  const top = formatNumber(values[values.length - 1], '$');
  if (!unique.length) return 'selectable sizes up to ' + top;
  if (unique.length > 3) return 'selectable from ' + formatNumber(values[0], '$') + ' up to ' + top;
  const list = unique.map((n) => formatNumber(n, '$')).join(' and ');
  return 'selectable sizes include ' + list + '; up to ' + top + ' (other tiers shared)';
}
function replyModeOf(table, exactArg) {
  const wantExact = exactArg === true || !!(table && (table.exactRequested || table.sizesRequested));
  const mainDiff = !!(table && table.mainDiffMode) && !wantExact;
  const sizesAsked = !!(table && table.sizesRequested);
  return { wantExact, mainDiff, sizesAsked };
}
function tableText(table, exact) {
  if (!table) return '';
  const mode = replyModeOf(table, exact);
  const lines = ['AUTHORITATIVE PRODUCT COMPARISON TABLE (internal; each field is scoped to its named product, and missing means UNKNOWN, never SAME):'];
  for (const f of table.fields) {
    lines.push('- ' + f.label + ' [' + f.status + ']: ' + table.pair[0].label + ' = ' + valueText(f.a, unit(f.key), mode.wantExact) +
      '; ' + table.pair[1].label + ' = ' + valueText(f.b, unit(f.key), mode.wantExact));
  }
  if (mode.sizesAsked) {
    lines.push('REPLY RULES FOR THIS TURN (sizes / exact-list ask): List every account size (or requested option) for each product. Do not expand into a full configuration catalogue of unrelated rules. Lead with the sizes answer.');
  } else if (mode.mainDiff || !mode.wantExact) {
    lines.push('REPLY RULES FOR THIS TURN (main-difference / compare ask): Lead with the MAIN difference(s) only — concise and natural. Do NOT dump every account size or every selectable option value. If account sizes are the same, say both are available in the same account-size range (do not list $7k, $15k, …). Summarize other long option lists the same way unless the client asked for exact options. Instant Standard consistency (when relevant): "25% Consistency Rule — most profitable day must not exceed 25% of total profit". Instant Elite: "no Consistency Rule". Never turn a simple main-difference ask into a full configuration catalogue.');
  }
  // REPLY_DESIGN_V1 (2026-09-28): no product sub-headings (owner: no nested headings); a product is a bold bullet label.
  lines.push('Render Main Differences first, with one labelled bullet per product (• **<official product name>:** ...) or per differing rule, no product sub-headings. ' +
    (mode.wantExact
      ? 'When listing options, include every selectable value for the requested field.'
      : 'Mention each materially DIFFERENT field briefly; do not expand SELECTABLE/RANGE fields into full option catalogues unless asked. Same on Both is optional and short — confirmed shared rules only, summarize shared sizes, never a catch-all bullet such as Other features.') +
    ' Do not state unknown as shared. Keep stage and default/selectable qualifiers. Do not invent values.');
  return lines.join('\n');
}
function render(table, exact) {
  if (!table) return '';
  const mode = replyModeOf(table, exact);
  const wantExact = mode.wantExact;
  const nameOf = (p) => p.display || p.label;
  // Sizes-asked: answer with the size list; do not open with an unrelated consistency catalogue.
  if (mode.sizesAsked) {
    const sizes = table.fields.find((f) => f.key === 'accountSizes') || null;
    if (sizes && sizes.a && sizes.b) {
      const lines = ['**Account sizes**', ''];
      if (sizes.status === 'SAME') {
        lines.push('- **Both (' + nameOf(table.pair[0]) + ' and ' + nameOf(table.pair[1]) + '):** ' + valueText(sizes.a, '$', true));
      } else {
        lines.push('- **' + nameOf(table.pair[0]) + ':** ' + valueText(sizes.a, '$', true));
        lines.push('- **' + nameOf(table.pair[1]) + ':** ' + valueText(sizes.b, '$', true));
      }
      return lines.join('\n');
    }
  }
  const diffs = table.fields.filter((f) => f.different);
  // Same on Both: every meaningful shared rule (not "no Phase 2"-style absences), capped for brevity.
  // CMP_MAINDIFF_V1: when the client did not ask for exact sizes/options, lead Same on Both with a
  // size-range summary and keep the section short — never dump full option catalogues.
  const SAME_PRIORITY = (!wantExact || mode.mainDiff)
    ? ['accountSizes', 'dailyLoss', 'maxLoss', 'drawdown', 'livePhase', 'minDays', 'dailyPnl', 'profitSplit']
    : ['profitSplit', 'dailyLoss', 'maxLoss', 'drawdown', 'consistency', 'phase1Target', 'phase2Target',
      'stageTarget', 'minDays', 'dailyPnl', 'payoutCadence', 'leverage', 'livePhase', 'freeRetry', 'accountSizes'];
  const sameCap = (!wantExact || mode.mainDiff) ? 4 : 6;
  const same = table.fields.filter((f) => f.status === 'SAME' && f.a && f.a.mode !== 'NO' && SAME_PRIORITY.includes(f.key))
    .sort((x, y) => SAME_PRIORITY.indexOf(x.key) - SAME_PRIORITY.indexOf(y.key)).slice(0, sameCap);
  // OFFICIAL_RENDER_NAMES_V1 (2026-09-28, owner): the fallback shows official product names (display:
  // Lite 2-Step, Lite 1-Step, Instant Standard); internal ids/labels used for matching are unchanged.
  const lines = ['**Main Differences**', '', '**' + nameOf(table.pair[0]) + '**'];
  for (const f of diffs) lines.push('- **' + f.label + ':** ' + displayValue(f, 0, wantExact, diffs.length > 1));
  lines.push('', '**' + nameOf(table.pair[1]) + '**');
  for (const f of diffs) lines.push('- **' + f.label + ':** ' + displayValue(f, 1, wantExact, diffs.length > 1));
  if (!diffs.length) lines.push('- No difference is established for the requested field by the current product articles.');
  if (same.length) {
    lines.push('', '**Same on Both**');
    for (const f of same) {
      if (f.key === 'accountSizes' && !wantExact) {
        lines.push('- **' + f.label + ':** Both are available in the same account-size range.');
      } else if (!wantExact && f.a && f.a.mode === 'SELECTABLE' && (f.a.values || []).length > 3) {
        // Shared long option lists: summarize; client can ask for the full list.
        const u = unit(f.key);
        const qual = (f.a.defaultValue != null ? '; ' + (f.a.defaultLabel || 'standard') + ' ' + formatNumber(f.a.defaultValue, u === 'days' ? 'days' : u) : '') +
          (f.a.firstValue != null ? '; first payout split ' + formatNumber(f.a.firstValue, '%') : '') +
          (f.a.firstPayout != null ? '; first payout after ' + formatNumber(f.a.firstPayout, 'days') : '');
        lines.push('- **' + f.label + ':** selectable options in the same range' + qual);
      } else {
        lines.push('- **' + f.label + ':** ' + valueText(f.a, unit(f.key), wantExact));
      }
    }
  }
  return lines.join('\n');
}
function focusedTable(table, latest, previousReply) {
  if (!table) return null;
  const text = norm(latest);
  // The client explicitly asked for the exact options / sizes: every option must then be listed.
  table.exactRequested = wantsExactOptions(latest);
  table.sizesRequested = wantsSizeList(latest);
  table.mainDiffMode = isMainDiffAsk(latest) || (isComparisonTurn(latest, latest, []) && !table.exactRequested);
  // Sizes ask with two named products: answer sizes, do not dump the full catalogue.
  if (table.sizesRequested && table.fields.some((f) => f.key === 'accountSizes')) {
    return { ...table, fields: table.fields.filter((f) => f.key === 'accountSizes') };
  }
  // A full comparison can contain words such as "Free Retry" or "Max Loss"
  // in a product name. Attribute focus applies only to subsequent short turns.
  if (resolvePair(latest) && isComparisonTurn(latest, latest, []) && !table.sizesRequested) return table;
  if (/anything else|only these|other rules|rest of the rules|are.*same/i.test(text)) return table;
  const selectors = [
    ['phase1Target', /phase\s*1|target/i], ['phase2Target', /phase\s*2/i],
    ['dailyLoss', /daily\s+loss/i], ['maxLoss', /max(?:imum)?\s+loss/i],
    ['drawdown', /drawdown|draw\s*down/i], ['profitSplit', /profit\s+split/i],
    ['payoutCadence', /payout|withdraw/i], ['consistency', /consistency/i],
    ['leverage', /leverage/i], ['freeRetry', /retry|second\s+chance/i],
    ['accountSizes', /size|tier/i], ['minDays', /trading\s+days?/i],
    ['dailyPnl', /p\s*&\s*l|profitable/i], ['addons', /add-?ons?/i],
  ];
  let focus = selectors.filter(([, re]) => re.test(text)).map(([key]) => key);
  if (/exact options|which options|list (?:them|the options)/i.test(text) && !focus.length) {
    const prior = String(previousReply || '');
    focus = selectors.filter(([, re]) => re.test(prior)).map(([key]) => key).slice(-1);
  }
  if (!focus.length) return table;
  return { ...table, fields: table.fields.filter((f) => focus.includes(f.key)) };
}
// COMPARISON_ASSESS_V2 (2026-09-24): the assessor judges CONTENT per product, not template labels.
// V1 required each field's exact label ("Minimum trading days", "Live phase") to start a bullet
// under an exact product heading. A complete, correct natural answer ("Payouts require 4 profitable
// days") failed, the regeneration failed the same way, and the customer received the thin canonical
// table instead (live Bot-test 215476082100892 replay). Numbers are audited separately against the
// KB by presend (UNSUPPORTED_NUMBER), so this checks what only it can: every materially different
// field is covered for BOTH products in their own section, nothing unknown or different is claimed
// as shared, and differences come first.
const FIELD_TERMS = {
  evaluationStages: /evaluation|phase|funded|live/i,
  phase1Target: /phase\s*1|target/i,
  phase2Target: /phase\s*2|target/i,
  stageTarget: /target/i,
  dailyLoss: /daily\s+(?:loss|drawdown)|\bDLL\b/i,
  maxLoss: /max(?:imum)?\s+(?:loss|drawdown)|\bMLL\b|overall\s+(?:loss|drawdown)|trailing/i,
  drawdown: /drawdown|trailing|static|end[\s-]of[\s-]day|\bEOD\b/i,
  minDays: /profitable\s+(?:trading\s+)?days?|trading\s+days?|minimum\s+(?:number\s+of\s+)?days/i,
  dailyPnl: /P\s*&\s*L|PnL|positive|profitable\s+day/i,
  profitSplit: /split/i,
  payoutCadence: /payout|days\s+between|requestable|withdraw/i,
  consistency: /consisten/i,
  leverage: /leverage|1\s*:\s*\d+/i,
  freeRetry: /retry|second\s+chance|reset/i,
  livePhase: /live|funded|evaluation/i,
  accountSizes: /size|\$\s*\d|\d+\s*k\b|ladder/i,
  addons: /add[\s-]?ons?|scalping|weekend/i,
  activation: /activation|KYC|contract/i,
};
function headingText(line) {
  return String(line || '').replace(/<[^>]+>/g, '').replace(/\*\*/g, '').replace(/\[\[|\]\]/g, '')
    .replace(/^#+\s*/, '').replace(/[:\s]+$/, '').trim().toLowerCase();
}
function productSections(table, body) {
  const lines = String(body || '').split('\n');
  // OFFICIAL_NAME_SECTIONS_V1 (2026-09-28): accept official names (Lite 2-Step, Instant Standard) as
  // well as internal labels, and a flat bullet whose bold label is the product ("• **Instant Standard:** ...")
  // as that product's section (Arsal: no nested headings), so a good flat draft is not replaced.
  const namesOf = (p) => [p.label].concat((p.aliases || [])).map((x) => String(x).toLowerCase());
  const labels = table.pair.map((p) => p.label.toLowerCase());
  const find = (label, other, exact) => {
    let offset = 0;
    for (const line of lines) {
      const bl = String(line || '').match(/^\s*(?:[-*\u2022]|\d+[.)])\s*(?:\*\*|<b>)\s*([^*<:]{2,40}?)\s*:?\s*(?:\*\*|<\/b>)\s*:?/);
      const h = bl ? bl[1].trim().toLowerCase() : headingText(line);
      // A heading line naming the product ("2-Step Lite", "[[Instant Elite]]", "Catalyst:"); a
      // heading that names the OTHER, longer product ("Instant Elite" for "Instant") is not this one.
      const ok = exact ? h === label
        : h && h.length <= label.length + 24 && h.indexOf(label) !== -1 && !(other.indexOf(label) !== -1 && h.indexOf(other) !== -1);
      if (ok) return offset;
      offset += line.length + 1;
    }
    return -1;
  };
  return table.pair.map((p, i) => {
    const label = labels[i];
    const other = labels[1 - i];
    const exact = find(label, other, true);
    let best = exact >= 0 ? exact : find(label, other, false);
    if (best >= 0) return best;
    for (const alias of namesOf(p).slice(1)) {
      for (const o of namesOf(table.pair[1 - i])) {
        const ex = find(alias, o, true);
        const at = ex >= 0 ? ex : find(alias, o, false);
        if (at >= 0 && (best < 0 || at < best)) best = at;
      }
    }
    return best;
  });
}
function sectionCovers(section, f, expected) {
  if (!expected) return true;
  const terms = FIELD_TERMS[f.key];
  const hasTerm = !terms || terms.test(section);
  // A product-specific feature is required only on the side that HAS it ("Instant: no profit target"
  // may be left implicit when Catalyst's selectable target is stated).
  if (expected.mode === 'NO') return true;
  const vals = (expected.values || []).filter((n) => Number.isFinite(n));
  if (vals.length && f.key !== 'evaluationStages') {
    const got = nums(section, unit(f.key));
    if (f.key === 'accountSizes') {
      const k = nums(section.replace(/\$\s*(\d+(?:[.,]\d+)?)\s*(?:k|K)\b/g, (m, n) => '$' + Math.round(Number(n.replace(',', '.')) * 1000)), '$');
      return hasTerm && vals.some((n) => k.includes(n) || got.includes(n));
    }
    return hasTerm && vals.some((n) => got.includes(n));
  }
  return hasTerm;
}
function assess(table, reply) {
  if (!table) return { ok: true, errors: [] };
  const body = String(reply || '');
  const errors = [];
  const mode = replyModeOf(table, !!(table.exactRequested || table.sizesRequested));

  // CMP_MAINDIFF_V1: sizes-asked replies list sizes; they need not use the Main Differences template.
  if (mode.sizesAsked) {
    const sizes = table.fields.find((f) => f.key === 'accountSizes');
    const expected = sizes && (sizes.a || sizes.b);
    if (expected && expected.values && expected.values.length) {
      const normalized = body.replace(/\$\s*(\d+(?:[.,]\d+)?)\s*(?:k|K)\b/g, (m, n) => '$' + Math.round(Number(String(n).replace(',', '.')) * 1000));
      const got = nums(normalized, '$').concat(nums(body, '$'));
      for (const n of expected.values) {
        if (!got.includes(n)) errors.push('missing-size:' + n);
      }
    }
    // A sizes answer must not be forced into a full configuration catalogue — soft signal only when
    // many unrelated rule labels appear alongside a size list.
    return { ok: errors.length === 0, errors: [...new Set(errors)] };
  }

  const mainAt = body.search(/(?:main|key)\s+differences?/i);
  const sameAt = body.search(/same\s+on\s+both|shared\s+rules|what(?:'s|\s+is)\s+the\s+same|in\s+common/i);
  // One short lead-in sentence ("I'm here. On your question about X and Y:") may precede the heading.
  if (mainAt < 0 || mainAt > 180 || (sameAt >= 0 && sameAt < mainAt)) errors.push('differences-not-first');
  const positions = productSections(table, body);
  if (positions.some((n) => n < 0) || positions[0] >= positions[1]) errors.push('missing-product-sections');
  if (/\b(?:all other rules|the rest of the rules|everything else)\s+(?:are|is)\s+(?:the\s+)?same\b/i.test(body) &&
      table.fields.some((x) => x.status === 'NOT_PUBLISHED')) errors.push('unknown-treated-as-shared');
  // A shared claim is a shared-section line LABELLED with the field ("- Max Loss Limit: 6%"), not the
  // word appearing inside another rule's sentence ("... no profit target for the single day").
  const sharedLabels = sameAt >= 0 ? body.slice(sameAt).split('\n').map((l) => norm(l.replace(/^\s*[-*\u2022]\s*/, '').replace(/\*\*/g, ''))) : [];
  for (const f of table.fields) {
    if (!sharedLabels.length || f.status === 'SAME') continue;
    const label = f.label.toLowerCase();
    if (sharedLabels.some((l) => l.startsWith(label))) errors.push('false-shared:' + f.key);
  }
  if (positions.every((n) => n >= 0) && positions[0] < positions[1]) {
    for (const f of table.fields.filter((x) => x.different)) {
      for (let i = 0; i < 2; i++) {
        const start = positions[i];
        const end = i ? (sameAt > start ? sameAt : body.length) : positions[1];
        const section = body.slice(start, end);
        const expected = i ? f.b : f.a;
        const label = f.label.toLowerCase();
        const bullet = section.split(/\n/).find((line) =>
          line.replace(/^\s*[-*\u2022]\s*/, '').replace(/^\*\*/, '').toLowerCase().startsWith(label)) || '';
        if (bullet && expected) {
          // A line labelled with the field states its value: audit that value strictly (V1 oracle).
          const numbers = nums(bullet, unit(f.key));
          if (expected.values.length) {
            if (numbers.some((n) => !expected.values.includes(n) && n !== expected.defaultValue && n !== expected.firstPayout &&
                n !== expected.retryValue && n !== expected.ladderTop)) errors.push('unsupported-value:' + f.key + ':' + i);
            // General comparisons may say "selectable" compactly; when options ARE listed, the list must be
            // complete (a partial list reads as the whole set), and when the client asked for the exact
            // options they must all be there.
            const listed = numbers.filter((n) => n !== expected.defaultValue && n !== expected.firstPayout && n !== expected.retryValue);
            if (expected.mode === 'SELECTABLE' && !expected.rangeAllowed && expected.values.length > 1 && f.key !== 'accountSizes' &&
                (table.exactRequested || listed.length >= 2) &&
                expected.values.some((n) => !numbers.includes(n))) errors.push('missing-exact-options:' + f.key + ':' + i);
            // CMP_MAINDIFF_V1: on main-diff asks, accountSizes may be summarized without listing every tier.
            if (f.key === 'accountSizes' && (table.exactRequested || table.sizesRequested) &&
                expected.values.some((n) => !numbers.includes(n) && !nums(section.replace(/\$\s*(\d+(?:[.,]\d+)?)\s*(?:k|K)\b/g, (m, x) => '$' + Math.round(Number(String(x).replace(',', '.')) * 1000)), '$').includes(n))) {
              errors.push('missing-exact-options:' + f.key + ':' + i);
            }
            if (expected.mode === 'SELECTABLE' && !expected.rangeAllowed &&
                /\b(?:from|between)\s*\d[^\n]*\bto\s*\d|\d+%\s*[\u2013-]\s*\d+%/i.test(bullet)) errors.push('range-hides-options:' + f.key + ':' + i);
            if (expected.mode === 'FIXED' && numbers.length && !numbers.some((n) => expected.values.includes(n))) errors.push('wrong-fixed-value:' + f.key + ':' + i);
          }
          if (expected.mode === 'FIXED' && /selectable|options?|choose|choice/i.test(bullet)) errors.push('invented-selectable:' + f.key + ':' + i);
          continue;
        }
        if (!sectionCovers(section, f, expected)) errors.push('missing-product-field:' + f.key + ':' + i);
        if (expected && expected.mode === 'SELECTABLE' && FIELD_TERMS[f.key] && FIELD_TERMS[f.key].test(section) &&
            expected.values.length > 1 && !/selectable|options?|choose|choice|select|\bor\b|between|range|from\s+\S+\s+to|up\s+to|[–-]\s*\$?\d|same\s+account-size\s+range/i.test(section)) {
          errors.push('lost-selectable:' + f.key + ':' + i);
        }
        if (expected && expected.mode === 'YES' && !/included|available|yes|eligible|free\s+retry|second\s+chance/i.test(section)) errors.push('lost-yes:' + f.key + ':' + i);
      }
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
/** Plain-language correction for a failed assessment, with the KB values to use. */
function explainErrors(table, errors) {
  const out = [];
  for (const e of errors || []) {
    const [kind, key, side] = String(e).split(':');
    const f = table && table.fields.find((x) => x.key === key);
    if (kind === 'missing-product-field' && f) {
      const p = table.pair[Number(side) || 0];
      const v = Number(side) ? f.b : f.a;
      out.push('Add under ' + p.label + ': ' + f.label + ' = ' + displayValue(f, Number(side) || 0, false, true) + (v && v.mode === 'SELECTABLE' ? ' (keep it selectable)' : '') + '.');
    } else if (kind === 'false-shared' && f) out.push('Do not list ' + f.label + ' under Same on Both; it differs or is not published for both.');
    else if (kind === 'differences-not-first') out.push('Put the Main Differences section first, then Same on Both.');
    else if (kind === 'missing-product-sections') out.push('Use one short heading per product (' + table.pair.map((p) => p.label).join(', ') + ') under Main Differences.');
    else if (kind === 'unknown-treated-as-shared') out.push('Do not say all other rules are the same; some are not published for both products.');
    else if (kind === 'lost-selectable' && f) out.push('For ' + table.pair[Number(side) || 0].label + ', say ' + f.label + ' is selectable (options, not a single value).');
    else out.push(e);
  }
  return out;
}

module.exports = {
  explainErrors, PRODUCT_IDS, FIELD_LABELS, plain, resolvePair, isComparisonTurn, isExplicitComparisonAsk,
  wantsSizeList, wantsExactOptions, isMainDiffAsk, extractProfile, build, focusedTable, tableText, render, assess, valueText };
