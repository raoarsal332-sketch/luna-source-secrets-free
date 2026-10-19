'use strict';
const fs = require('fs');
const axios = require('axios');
let _knowledgeStore = null;
let _retired = null; /* RETIRED_AUTHORITY_V1 */
try { _retired = require('/home/ubuntu/luna-knowledge/lib/retired'); } catch (_) {
  try { _retired = require('./luna-knowledge/lib/retired'); } catch (__) {}
}
let _errata = null; /* OWNER_FAQ_ERRATA_V1 */
try { _errata = require('/home/ubuntu/luna-knowledge/lib/errata'); } catch (_) {
  try { _errata = require('./luna-knowledge/lib/errata'); } catch (__) {}
}
let _knowledgeSync = null;
try {
  _knowledgeStore = require('/home/ubuntu/luna-knowledge/lib/store');
} catch (_) {
  try { _knowledgeStore = require('./luna-knowledge/lib/store'); } catch (__) {}
}

const FAQ_MD_PATHS = [
  process.env.FUNDEDELITE_FAQ_PATH || '',
  '/home/ubuntu/fundedelite-faqs.md',
  '/workspace/fundedelite-faqs.md',
].filter(Boolean);

const OFFICIAL_FAQ_HOME = 'https://faq.fundedelite.com/en/';
const OFFICIAL_SITE = 'https://fundedelite.com/';
let tradingStagePolicy = null;
try { tradingStagePolicy = require('./tradingStagePolicy'); } catch (_) { tradingStagePolicy = null; }

let _articles = null;
let _loadedFrom = null;
let _liveCache = new Map(); // url -> { at, text }

function loadFaqMarkdown() {
  for (const p of FAQ_MD_PATHS) {
    try {
      if (fs.existsSync(p)) {
        const text = fs.readFileSync(p, 'utf8');
        if (text && text.length > 500) return { path: p, text };
      }
    } catch (_) {}
  }
  return null;
}

function parseArticles(md) {
  const parts = String(md || '').split(/\n### /);
  const out = [];
  // A "### " chunk with no URL line is a sub-section of the article above it (Catalyst's
  // "### Daily loss limit", or each product's "### Daily and Max loss limits:"). Splitting
  // on every heading detached those from their product, so a Catalyst-only 3% daily loss
  // was served as a generic "Daily loss limit" fact and four products shared one ambiguous
  // loss-limit title. Carry the parent article's title and URL down into the sub-section.
  let parentTitle = '';
  let parentUrl = '';
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const lines = chunk.split('\n');
    const rawTitle = (lines[0] || '').trim();
    let title = rawTitle;
    let url = '';
    const um = chunk.match(/URL:\s*(https:\/\/faq\.fundedelite\.com\/[^\s\)]+)/i) || chunk.match(/(https:\/\/faq\.fundedelite\.com\/en\/articles\/[a-z0-9-]+)/i);
    if (um) url = um[1].trim();
    if (url) {
      parentTitle = rawTitle;
      parentUrl = url;
    } else if (parentTitle && rawTitle.toLowerCase() !== parentTitle.toLowerCase()) {
      title = parentTitle + ' , ' + rawTitle.replace(/:$/, '');
      url = parentUrl;
    }
    // body until next --- or related bullets only
    let body = chunk
      .replace(/^[^\n]*\n/, '')
      .replace(/^URL:.*$/m, '')
      .replace(/\n---[\s\S]*$/, '')
      .trim();
    // drop trailing related-link bullets that are just titles
    const bodyLines = body.split('\n');
    while (bodyLines.length && /^\s*-\s+/.test(bodyLines[bodyLines.length - 1]) && bodyLines[bodyLines.length - 1].length < 120) {
      bodyLines.pop();
    }
    body = bodyLines.join('\n').trim();
    if (!title) continue;
    out.push({
      title,
      url: url || OFFICIAL_FAQ_HOME,
      body,
      searchText: (title + '\n' + stripHtmlForSearch(body)).toLowerCase(),
    });
  }
  return out;
}

function articlesFromKnowledgeStore() {
  if (!_knowledgeStore || typeof _knowledgeStore.getActiveArticles !== 'function') return null;
  try {
    const root = process.env.LUNA_KNOWLEDGE_ROOT || _knowledgeStore.DEFAULT_ROOT;
    const entries = _knowledgeStore.getActiveArticles(root);
    if (!entries || entries.length < 10) return null;
    const mapped = entries.map((e) => {
      // RETIRED_AUTHORITY_V1: never serve a retired owner block, even from an older/rolled-back store.
      let body = _retired ? _retired.stripRetired(e.body || '').body : e.body;
      // OWNER_FAQ_ERRATA_V1 (2026-09-28): owner-confirmed Help Center typos are corrected in their own article
      // on every served body (also protects an LKG rollback to an uncorrected canonical copy).
      if (_errata) body = _errata.applyErrata(body || '', e).body;
      const isInternal = e.sourceType === 'approved_internal';
      return {
        title: e.title,
        // approved_internal has no public page: label it by rule id, never with an invented URL.
        url: e.sourceUrl || (isInternal ? 'approved_internal:' + ((e.provenance && e.provenance.ruleId) || e.id) : OFFICIAL_FAQ_HOME),
        body,
        sourceType: e.sourceType || null,
        // Plain-text searchText so fact anchors like "daily loss limit is 3%" match
        // even when the HC body wraps numbers in <b>…</b>.
        searchText: (e.title + '\n' + stripHtmlForSearch(body)).toLowerCase(),
        id: e.id,
        topic: e.topic,
        collection: e.collection,
        product: e.product,
        stage: e.stage,
        sourceHash: e.sourceHash,
        lastSynced: e.lastSynced,
        version: e.version,
        precedence: e.precedence,
        provenance: e.provenance,
      };
    });
    return {
      from: root + '/canonical',
      articles: expandProductSectionCards(mapped),
    };
  } catch (e) {
    console.log('FAQ_KB_STORE_LOAD_FAIL', e && e.message);
    return null;
  }
}

/* KB_AUTO_RELOAD_V1: the corpus used to be loaded once per process, so every 6-hourly Knowledge
 * Sync only reached customers after the next PM2 restart (live log: one FAQ_KB load per process
 * start, none after a promote). Promote is atomic, so re-reading after the manifest changes is safe. */
let _manifestMtimeLoaded = 0;
let _manifestCheckedAt = 0;
function canonicalManifestMtime() {
  try {
    const root = process.env.LUNA_KNOWLEDGE_ROOT || (_knowledgeStore && _knowledgeStore.DEFAULT_ROOT) || '/home/ubuntu/luna-knowledge';
    return fs.statSync(root + '/canonical/manifest.json').mtimeMs;
  } catch (_) { return 0; }
}

function approvedInternalFallbackArticles() {
  try {
    let ai = null;
    try { ai = require('/home/ubuntu/luna-knowledge/lib/approvedInternal'); } catch (_) { ai = require('./luna-knowledge/lib/approvedInternal'); }
    const src = process.env.LUNA_KNOWLEDGE_ROOT ? require('path').join(process.env.LUNA_KNOWLEDGE_ROOT, 'approved-internal.json') : undefined;
    return ai.loadApprovedInternal(src ? { path: src } : {}).map((e) => ({
      title: e.title,
      url: 'approved_internal:' + ((e.provenance && e.provenance.ruleId) || e.id),
      body: e.body,
      sourceType: 'approved_internal',
      id: e.id,
      precedence: e.precedence,
      provenance: e.provenance,
      searchText: (e.title + '\n' + stripHtmlForSearch(e.body)).toLowerCase(),
    }));
  } catch (e) {
    console.log('FAQ_KB approved-internal fallback unavailable', e && e.message);
    return [];
  }
}

function getArticles() {
  if (_articles && _articles.length && _manifestMtimeLoaded) {
    const now = Date.now();
    if (now - _manifestCheckedAt > Number(process.env.LUNA_KB_RELOAD_CHECK_MS || 30000)) {
      _manifestCheckedAt = now;
      const m = canonicalManifestMtime();
      if (m && m !== _manifestMtimeLoaded) {
        console.log('FAQ_KB reload after knowledge promote');
        _articles = null;
      }
    }
  }
  if (_articles && _articles.length) return _articles;
  _manifestMtimeLoaded = canonicalManifestMtime();
  _manifestCheckedAt = Date.now();
  // Prefer versioned local knowledge store (authoritative; no live fetch on answer path)
  const fromStore = articlesFromKnowledgeStore();
  if (fromStore) {
    _articles = fromStore.articles;
    _loadedFrom = fromStore.from;
    console.log('FAQ_KB loaded', _articles.length, 'articles from knowledge store', fromStore.from);
    return _articles;
  }
  const loaded = loadFaqMarkdown();
  if (!loaded) {
    _articles = [];
    _loadedFrom = null;
    return _articles;
  }
  // FAQ_FALLBACK_AUTHORITY_V1: degraded path (canonical store unavailable). Same authority rules
  // as the store: retired owner blocks are never served (a stale/restored markdown copy must not
  // resurrect them), and owner-approved internal rules are still available, labelled as such.
  let mdText = loaded.text;
  if (_retired) {
    const r = _retired.stripRetired(mdText);
    if (r.removed && r.removed.length) console.log('FAQ_KB markdown fallback: retired blocks stripped', r.removed.length);
    mdText = r.body;
  }
  if (_errata) {
    const r = _errata.applyErrata(mdText, null);
    if (r.applied.length) console.log('FAQ_KB markdown fallback: faq errata applied', r.applied.join(','));
    mdText = r.body;
  }
  _articles = parseArticles(mdText).concat(approvedInternalFallbackArticles());
  _loadedFrom = loaded.path;
  console.log('FAQ_KB loaded', _articles.length, 'articles from', loaded.path, '(MARKDOWN FALLBACK: canonical knowledge store unavailable)');
  return _articles;
}


/**
 * Normalize stop-loss spellings before tokenize/score.
 * "Is stoploss mandatory?" / "must I use SL?" must hit Strategy Risk Limits
 * ("If Stop Loss is not placed"), not return empty or Instant/Catalyst loss cards.
 */
function normalizeStopLossQuery(q) {
  let t = String(q || "");
  t = t.replace(/\bstoploss\b/gi, "stop loss");
  t = t.replace(/\bstop[\s_-]*loss\b/gi, "stop loss");
  // Bare "SL" in trading / requirement / without contexts → "stop loss".
  if (/\bsl\b/i.test(t) &&
      (/\b(?:stop|mandatory|compulsory|required|need|must|without|trade|trading|set|use|place|placed|obligat|have\s+to|do\s+i)\b/i.test(t) ||
       /^\s*(?:is|do|must|can|what|should|need)\b/i.test(t))) {
    t = t.replace(/\bsl\b/gi, "stop loss");
  }
  return t;
}

// Clients and the FAQ use different words for the same thing ("how much can I LOSE" vs
// "daily LOSS limit"), and scoring is plain substring matching, so the article that
// actually holds the answer scores lower than a loosely related one. Expand the query with
// the FAQ's own vocabulary. Expansion only adds tokens; it never drops the client's words.
const QUERY_EXPAND = {
  lose: 'loss', loses: 'loss', losing: 'loss', lost: 'loss',
  withdraw: 'payout', withdrawal: 'payout', withdrawals: 'payout',
  breach: 'loss', breached: 'loss', breaching: 'loss',
  // Stop-loss terminology: customers write stoploss; FAQ uses "Stop Loss".
  stoploss: 'stop loss',
};

// SHORT_DOMAIN_TERMS_V1 (2026-09-24): the >=3-letter filter silently dropped the domain acronyms
// customers actually use, so "can I share my IP with my brother" was searched as "share brother
// trades", the IP Sharing article was never retrieved, and the model answered from the wrong
// article that sharing is fine after notifying support (KB: strictly prohibited). Acronyms are kept
// as WORD-BOUNDARY tokens ('#ip'), because substring matching would hit "tip"/"ship"/"membership".
const SHORT_DOMAIN_TERMS = { ip: '#ip', ea: '#ea', sl: 'stop loss', tp: 'take profit', fx: '#fx', dd: 'drawdown' };
function tokenize(q) {
  const words = String(normalizeStopLossQuery(q) || '')
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, ' ')
    .split(/\s+/);
  const base = words.filter((w) => w.length >= 3 && !STOP.has(w));
  for (const w of words) {
    const t = SHORT_DOMAIN_TERMS[w];
    if (t && !base.includes(t)) base.push(t);
  }
  const out = base.slice();
  for (const w of base) {
    const ex = QUERY_EXPAND[w];
    if (ex && !out.includes(ex)) out.push(ex);
  }
  return out;
}

const STOP = new Set(
  'the and for with what how when where why who can does did are was were you your our this that from into about please tell me need help want'.split(' ')
);


function stripHtmlForSearch(s) {
  return String(s || '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Detect explicitly named product(s) in the client ask.
 * Order: more-specific lite variants before generic 1/2-step; instant elite before instant.
 * Used for attribution ranking so Catalyst 3% DLL cannot outrank a named 2-Step ask.
 */
function detectQueryProducts(q) {
  const t = String(q || '').toLowerCase();
  const found = [];
  // Both variants of one family can be named in one message ("2 step lite and with free retry").
  // Detect the Lite variant, then look for the Free Retry variant in what is left, so a variant
  // comparison names both products instead of only the first one it saw.
  const freeRetry = /\b(?:free[\s-]*retry|second\s+chance)\b/;
  const lite2 = /\b(?:lite[\s-]*(?:2|two)[\s-]*step|(?:2|two)[\s-]*step[\s-]*(?:challenge[\s-]*)?lite)\b/g;
  const lite1 = /\b(?:lite[\s-]*(?:1|one)[\s-]*step|(?:1|one)[\s-]*step[\s-]*(?:challenge[\s-]*)?lite)\b/g;
  const rest2 = t.replace(lite2, ' ');
  const rest1 = t.replace(lite1, ' ');
  const has2 = /\b(?:2|two)[\s-]*step\b/.test(t);
  const has1 = /\b(?:1|one)[\s-]*step\b/.test(t);
  if (rest2 !== t) found.push('lite-2-step');
  if (/\b(?:2|two)[\s-]*step\b/.test(rest2) || (rest2 !== t && freeRetry.test(rest2) && !has1)) found.push('2-step');
  if (rest1 !== t) found.push('lite-1-step');
  if (/\b(?:1|one)[\s-]*step\b/.test(rest1) || (rest1 !== t && freeRetry.test(rest1) && !has2)) found.push('1-step');
  if (/\bcatalyst\b/.test(t)) found.push('catalyst');
  if (/\bflash\b/.test(t)) found.push('flash');
  if (/\binstant(?:\s+elite)?\b/.test(t)) found.push('instant');
  return found;
}

function inferArticleProduct(article) {
  if (article && article.product) return String(article.product).toLowerCase().replace(/\s+/g, '-');
  // PRODUCT_SCOPE_V2: every article in the Help Center's "Catalyst Challenge" collection is a
  // Catalyst article, including the ones whose title and metadata never say so ("Starting sizes").
  if (article && /^\s*catalyst\s+challenge\s*$/i.test(String(article.collection || ''))) return 'catalyst';
  const t = ((article && article.title) || '') + ' ' + ((article && article.url) || '');
  const low = t.toLowerCase();
  if (/\bcatalyst\b/.test(low)) return 'catalyst';
  if (/\bflash\b/.test(low)) return 'flash';
  if (/\binstant\b/.test(low)) return 'instant';
  if (/\blite[\s-]*2/.test(low)) return 'lite-2-step';
  if (/\blite[\s-]*1/.test(low)) return 'lite-1-step';
  if (/\b2[\s-]*step\b/.test(low)) return '2-step';
  if (/\b1[\s-]*step\b/.test(low)) return '1-step';
  return null;
}

const PRODUCT_SECTION_HEADING_RE =
  /^(?:daily and max loss limits|daily loss limit|max loss limit|minimum profitable trading days|profit targets?|profit split|consistency|second chance modifications|leverage)\s*:?\s*$/i;

/**
 * Expand whole HC articles into product-attributed section cards (same contract as
 * parseArticles orphan inheritance). Keeps "Daily loss limit" / "Daily and Max loss
 * limits" attached to the parent product title so ranking can prefer same-context
 * sources after markdown_section cards were superseded by full official pages.
 */
function expandProductSectionCards(articles) {
  const out = [];
  const seen = new Set();
  for (const a of articles || []) {
    const key = String(a.title || '').trim().toLowerCase();
    if (key) seen.add(key);
    out.push(a);
  }
  for (const a of articles || []) {
    const parentTitle = String(a.title || '').trim();
    if (!parentTitle || / , /.test(parentTitle)) continue; // already a section card
    const body = String(a.body || '');
    if (body.length < 80) continue;
    const lines = body.split(/\n/);
    const headings = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw || raw.length > 90) continue;
      const cleaned = stripHtmlForSearch(raw).replace(/:$/, '').trim();
      if (!PRODUCT_SECTION_HEADING_RE.test(cleaned)) continue;
      headings.push({ i, name: cleaned.replace(/:$/, '').trim() });
    }
    for (let h = 0; h < headings.length; h++) {
      const start = headings[h].i + 1;
      const end = h + 1 < headings.length ? headings[h + 1].i : lines.length;
      let sectionBody = lines.slice(start, end).join('\n').trim();
      const bl = sectionBody.split('\n');
      while (bl.length && /^\s*-\s+/.test(bl[bl.length - 1]) && bl[bl.length - 1].length < 120) bl.pop();
      sectionBody = bl.join('\n').trim();
      if (sectionBody.length < 40) continue;
      // SECTION_OPTIONS_CONTEXT_V1 (2026-09-24): a section can name one example value for a SELECTABLE
      // rule ("customizable max loss limit of 8%") while the options list lives earlier in the parent
      // ("The Max loss limit can be selected with the following percentages: 6% / 8% / 10%"). Served
      // alone, the section made the model state 8% as the fixed rule. Carry the parent's option list
      // for each metric the section mentions (verbatim article text, nothing added).
      {
        const plainParent = stripHtmlForSearch(body);
        const optionLines = [];
        const optRe = /(?:^|\n)\s*The\s+([A-Za-z ()0-9]{3,60}?)\s+can be selected with the following (?:percentages|levels)[^\n]*\n((?:\s*-\s*[^\n]+\n?)+)/gi;
        let om;
        while ((om = optRe.exec(plainParent)) !== null) {
          const metric = om[1].replace(/\(.*?\)/g, '').trim().toLowerCase();
          const key = metric.split(/\s+/).slice(0, 2).join(' ');
          if (key && stripHtmlForSearch(sectionBody).toLowerCase().indexOf(key) !== -1) {
            optionLines.push('The ' + om[1].trim() + ' can be selected with the following options: ' +
              om[2].split('\n').map((x) => x.replace(/^\s*-\s*/, '').trim()).filter(Boolean).join(', ') + '.');
          }
        }
        if (optionLines.length) sectionBody += '\n' + optionLines.join('\n');
      }
      const sectionTitle = parentTitle + ' , ' + headings[h].name;
      const sk = sectionTitle.toLowerCase();
      if (seen.has(sk)) continue;
      if (PRODUCT_SECTION_HEADING_RE.test(sectionTitle)) continue;
      seen.add(sk);
      const plain = stripHtmlForSearch(sectionBody);
      out.push({
        title: sectionTitle,
        url: a.url,
        body: sectionBody,
        searchText: (sectionTitle + '\n' + plain).toLowerCase(),
        id: (a.id ? a.id + '__' : '') + headings[h].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
        topic: a.topic || null,
        product: a.product || inferArticleProduct(a),
        stage: a.stage || null,
        sourceHash: a.sourceHash || null,
        lastSynced: a.lastSynced || null,
        version: a.version || null,
        precedence: a.precedence || null,
        provenance: Object.assign({}, a.provenance || {}, { expandedSection: true, parentTitle }),
        sectionTitle: headings[h].name,
      });
    }
  }
  return out;
}

function isCountryEligibilityAsk(text) {
  const t = String(text || '');
  // The country-name alternatives below are case-SENSITIVE on purpose: they used to sit in
  // the same /i regex as the keywords, where [A-Z][a-z]+ also matched lowercase, so "lose
  // in one day" counted as "in <Country>".
  return /\b(?:country|countries|restricted|reside|resident|nationalit|citizenship|geo)\b/i.test(t) ||
    // A FundedElite product name after in/from/for ("available in Catalyst") is not a country.
    /\b(?:from|in|for)\s+(?!(?:Catalyst|Instant|Elite|Flash|Lite|Standard|Phase|Step|Free|Funded|FundedElite|Rise|MetaTrader|TradeLocker|Match)\b)[A-Z][a-z]+/.test(t) ||
    // The candidate after in/from/for must look like a country: a proper noun, not any run
    // of words. Without this, "how much can I lose IN ONE DAY before I breach?" was read as
    // a country ask and forced Restricted Countries to the top of every result, pushing the
    // real loss-limit article out and leaving Luna to guess the percentage.
    /\b(?:is|can|allowed|allow|open|trade|trading|buy|purchase)\b[\s\S]{0,60}\b(?:in|from|for)\s+(?!(?:one|a|an|the|my|this|that|each|any|some|per|Catalyst|Instant|Elite|Flash|Lite|Standard|Phase|Step|Free|Funded|FundedElite|Rise|MetaTrader|TradeLocker|Match)\b)[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,3}\s*\??\s*$/.test(t) ||
    /\b(usa|united states|uk|india|pakistan|germany|canada|australia|nigeria|brazil|turkey|kenya|somalia|iran|iraq|russia|syria|cuba|myanmar)\b/i.test(t) &&
      /\b(trade|trading|account|allowed|allow|open|buy|purchase|restrict|eligible|eligibility)\b/i.test(t);
}

function scoreArticle(article, tokens, clientText) {
  if (!tokens.length) return 0;
  let score = 0;
  const titleL = article.title.toLowerCase();
  for (const t of tokens) {
    if (t.charAt(0) === '#') {
      const rx = new RegExp('\\b' + t.slice(1) + 's?\\b', 'g');
      if (rx.test(titleL)) score += 6;
      const c = (article.searchText.match(new RegExp('\\b' + t.slice(1) + 's?\\b', 'g')) || []).length;
      if (c > 0) score += Math.min(4, c);
      continue;
    }
    if (titleL.includes(t)) score += 6;
    const c = article.searchText.split(t).length - 1;
    if (c > 0) score += Math.min(4, c);
  }
  // PRODUCT_IMPLIED_TITLE_V1 (2026-09-27, Catalyst "How many account sizes?" answered "not listed"): an
  // article that belongs to a product only through its Help Center collection ("Starting sizes" in the
  // Catalyst Challenge collection) never names the product in its title or body, so it lost the product
  // word to every sibling that does and fell out of the top 4. Credit the implied product like a title word.
  try {
    const __qp = detectQueryProducts(String(clientText || tokens.join(' ')));
    const __ap = inferArticleProduct(article);
    if (__ap && __qp.includes(__ap) && !titleL.includes(__ap.replace(/-/g, ' ').split(' ')[0])) {
      score += 6;
      // A size / count-of-sizes ask ("how many account sizes", "which sizes", "is 100k available")
      // is answered by that product's size article.
      if (/\b(?:sizes?|account\s+sizes?|how\s+many\s+accounts?|\d+\s*k\s+(?:account\s+)?(?:available|offered)|\d+\s*k\s+available)\b/i.test(String(clientText || '')) &&
          /\bsizes?\b/i.test(titleL)) score += 20;
    }
  } catch (_) { /* scoring aid only */ }
  // boost exact-ish product words
  if (/instant|elite|flash|lite|catalyst|payout|drawdown|consistency|kyc|refund/i.test(tokens.join(' '))) {
    if (titleL.match(/instant|elite|flash|lite|catalyst|payout|drawdown|consistency|kyc|refund/)) score += 3;
  }
  // Country eligibility → force Restricted Countries article to the top
  if (isCountryEligibilityAsk(clientText || tokens.join(' '))) {
    if (/restricted countries/i.test(titleL)) score += 50;
    if (/vpn|vps|ip variations|travel/i.test(titleL)) score -= 20;
  }
  // "What time does the daily loss / drawdown reset?" is answered by the dashboard clock
  // article (4 pm ET, 21:00 UTC), but it only shares "time"/"reset" with the ask and loses
  // to the generic daily-loss-limit article. Boost it for reset-time / clock asks only, so a
  // "how much is an account reset" or "what is the daily loss %" ask is unaffected.
  const q = String(clientText || '');
  const asksResetTime =
    /\b(?:what\s+time|when|at\s+what\s+time)\b[\s\S]{0,60}\b(?:reset|resets|refresh|start|restart)\b/i.test(q) ||
    /\b(?:reset|resets)\b[\s\S]{0,30}\b(?:time|clock|timezone|time\s*zone)\b/i.test(q) ||
    /\b(?:dashboard|server|platform)\s+(?:clock|time|timezone)\b/i.test(q);
  if (asksResetTime && /dashboard clock/i.test(titleL)) score += 40;

  // PLATFORM_NAME_PRESERVE_V1 (2026-09-29, ticket 215476138018591):
  // "which platform / besides TradeLocker / which CFD uses MetaTrader 5" must retrieve the
  // challenge FAQs that name MetaTrader5 + TradeLocker. Otherwise the model only sees
  // unrelated hits and invents "the trading platform" / "I can't confirm its specific name".
  const asksPlatformName =
    /\b(?:meta\s*-?\s*trader\s*5|metatrader\s*5|\bmt\s*5\b|tradelocker|match\s*-?\s*trader)\b/i.test(q) ||
    (/\b(?:platform|platforms)\b/i.test(q) &&
      /\b(?:which|what|besides|other|available|use|using|offer|choose|between)\b/i.test(q));
  if (asksPlatformName && !asksResetTime) {
    const bodyL = String(article.searchText || article.body || '').toLowerCase();
    if (/metatrader\s*5|metatrader5/.test(bodyL) && /tradelocker/.test(bodyL)) score += 40;
    else if (/metatrader\s*5|metatrader5|\bmt5\b|tradelocker|match\s*-?\s*trader/.test(bodyL) &&
             /\b(?:platform|platforms)\b/.test(bodyL)) score += 22;
  }

  // "How much can I lose in one day?" scored "Minimum profitable trading days" above the
  // loss-limit section, because "day" sits in that title while the answer's words ("loss
  // limit") do not. Boost the sections that actually carry the limit when the ask is about
  // losing / drawdown / a limit, and only then.
  const asksLossLimit =
    /\b(?:lose|losing|loss|drawdown|dll|mll|breach)\b/i.test(q) &&
    !asksResetTime &&
    /\b(?:how much|limit|maximum|max|before|allowed)\b/i.test(q);
  if (asksLossLimit) {
    if (/loss limits?\b|drawdown/i.test(titleL)) score += 12;
    if (/minimum profitable trading days/i.test(titleL)) score -= 8;
  }

  // 300K overlay (60% consistency, 5 min days) is a sibling article that loses to
  // generic Instant / 1-Step / 2-Step cards when the client says "300k" (bench R001,
  // R086, R171). Boost only overlay asks, not every Instant size question.
  const asks300kOverlay =
    /\$?\s*(?:300|350|400)\s*k\b|accounts?\s+above\s+\$?\s*300|300\s*k\s+plus/i.test(q) &&
    /\b(?:consistenc|overlay|trading\s+days?|min(?:imum)?\s+(?:trading\s+)?days?|extra|stricter)\b/i.test(q);
  if (asks300kOverlay && /additional info for 300k/i.test(titleL)) score += 45;

  // Live-account issuance after pass is 72 business hours (bench R176).
  const asksNextAccountTiming =
    /\b(?:how long|when|how soon|business\s+hours?)\b/i.test(q) &&
    /\b(?:live\s+account|next\s+account|after\s+(?:i\s+)?pass)\b/i.test(q);
  if (asksNextAccountTiming && /receive the next account after passing/i.test(titleL)) score += 45;

  // PAYOUT_PROCESSING_TIME_V1 (Arsal 2026-09-27): "how long does payout processing take / when will I get
  // my payout" must retrieve the owner-approved payout processing time rule (average ~72 business hours,
  // longer on a Risk Team manual review) next to the official payout article (arrival times per method).
  const asksPayoutProcessingTime =
    /\b(?:payouts?|pay[\s-]?outs?|withdraw(?:al|als)?|paid)\b|pago|retiro|nikas|\u0646\u06a9\u0627\u0633|\u092d\u0941\u0917\u0924\u093e\u0928|\u092a\u0947\u0906\u0909\u091f/i.test(q) &&
    /\b(?:how\s+(?:long|much\s+time|many\s+(?:business\s+|working\s+)?(?:hours?|days?))|when|how\s+soon|process(?:ed|ing)?|review|approv(?:e|ed|al)|take|takes|time|timeframe|arrive|where|still|yet|wait(?:ing)?|days?|hours?)\b|cu[a\u00e1]nto|cu[a\u00e1]ndo|tiempo|kitna|kitne|kab|waqt|\u06a9\u062a\u0646\u0627|\u06a9\u0628|\u0915\u093f\u0924\u0928\u093e|\u0915\u092c/i.test(q) &&
    !/\b(?:live\s+account|next\s+account|phase\s*2\s+account|after\s+(?:i\s+)?pass)\b/i.test(q);
  if (asksPayoutProcessingTime && /^payout processing time:/i.test(titleL)) score += 60;

  // FAQ_SYNC_TOPICS_V1 (2026-09-27): facts added by the FAQ sync live inside broader articles whose titles do not
  // name them, so keyword overlap alone ranked them below siblings.
  const asksKycFraud = /\bkyc\s*fraud\b/i.test(q) ||
    (/\b(?:kyc|veriff|verification|verify|identity|id\s+card|passport|documents?)\b/i.test(q) &&
     /\b(?:fraud\w*|fake|falsif\w*|forg\w*|altered|edit(?:ed)?|someone\s+else|another\s+person|other\s+(?:people|person)|third[\s-]party|friend|relative|brother|sister|father|mother|not\s+mine|circumvent\w*|cheat\w*)\b/i.test(q));
  if (asksKycFraud && /documentation is required.*verification/i.test(titleL)) score += 40;
  const asksLiveBreachBan = /\blive\b/i.test(q) &&
    /\b(?:breach\w*|blown|blew|lost|violat\w*|failed|terminated)\b/i.test(q) &&
    /\b(?:buy|purchase|new\s+(?:account|challenge)|another\s+(?:account|challenge)|ban(?:ned)?|restrict\w*)\b/i.test(q);
  if (asksLiveBreachBan && /transition to live trading/i.test(titleL)) score += 45;

  // Same-day repurchase after a fail is account rolling (bench R149).
  const asksRolling =
    /\b(?:fail|failed|blown?|breach)\b/i.test(q) &&
    /\b(?:buy|purchase|another|new)\b/i.test(q) &&
    /\b(?:instant|account|challenge)\b/i.test(q);
  if (asksRolling && /account rolling/i.test(titleL)) score += 42;

  // Crypto payout cap is $500 gross / cycle (bench R042). Prompt has the number;
  // retrieval was returning irregular-pass / next-account instead of the payout card.
  const asksCryptoCap =
    /\b(?:usdt|crypto|bitcoin|\bbtc\b)\b/i.test(q) &&
    /\b(?:payout|withdraw|take|request|cycle|800|500)\b/i.test(q);
  if (asksCryptoCap && /payouts process|payout limitations/i.test(titleL)) score += 40;

  // Lost-email / show-credentials (bench R175) was retrieving 1-Step/2-Step cards.
  const asksCreds =
    /\b(?:credential|show credentials|lost (?:the )?email|challenge login)\b/i.test(q) ||
    (/\blogin\b/i.test(q) && /\b(?:email|dashboard|lost)\b/i.test(q));
  if (asksCreds && /trading credentials/i.test(titleL)) score += 40;

  // One-trade / news-lottery entire profit = Gambling soft breach (bench R056).
  const asksGamblingSoft =
    /\b(?:lottery|one\s+(?:news\s+)?trade|single\s+trade|entire profit|whole.{0,24}profit)\b/i.test(q) &&
    /\b(?:soft|hard|breach|pass|news)\b/i.test(q);
  if (asksGamblingSoft && /^gambling\b| , gambling/i.test(titleL)) score += 45;


  // Risk Rule / Strategy Risk Limits + Scalping Limit consequence asks (SOFT_BREACH_RESET_V1 2026-09-29)
  // Prefer the owner approved-internal card and the Strategy Risk / min-holding articles. Do NOT demote
  // the soft-breach article into teaching "not a soft breach"; the general Soft Breach 30% story still
  // must not outrank the owner reset rule for these two topics.
  const asksRiskRule =
    /\brisk\s+rule\b/i.test(q) ||
    (/\b(?:strategy\s+)?risk\s+limits?\b/i.test(q) && /\b(?:breach|violat|consequence|what\s+happens|reset)\b/i.test(q)) ||
    (/\b50\s*%\b/.test(q) && /\b(?:daily\s+loss|instrument|pair|risk)\b/i.test(q));
  const asksScalpLimit =
    /scalping\s+limit|scalp\s+limit|490\s*\/\s*500|500\s*\/\s*500/i.test(q);
  const isOwnerSoftResetCard =
    /funded strategy risk|scalping limit soft breach|soft-breach-reset|ai-funded-strategy-risk/i.test(titleL) ||
    /ai-funded-strategy-risk-and-scalping-limit-soft-breach-reset/i.test(String(article && (article.id || article.url || article.topic) || ''));
  if (asksRiskRule && /strategy risk limits/i.test(titleL)) score += 46;
  if (asksRiskRule && isOwnerSoftResetCard) score += 80;
  if (asksRiskRule && /what is considered a soft breach/i.test(titleL)) score -= 28;
  if (asksScalpLimit && isOwnerSoftResetCard) score += 80;
  if (asksScalpLimit && /minimum holding time/i.test(titleL)) score += 40;
  if (asksScalpLimit && /what is considered a soft breach/i.test(titleL)) score -= 20;

  // Stop Loss mandatory / without SL (Arsal 2026-09-22 live: "Is stoploss mandatory?")
  // Authoritative FAQ Strategy Risk Limits explains risk calc when no SL is set → SL is not
  // company-wide mandatory. Without this boost, "loss"+"required" ranks Instant/Catalyst
  // product loss-limit cards first and Luna wrongly asks which challenge.
  const qNorm = normalizeStopLossQuery(q);
  const asksStopLossTopic =
    /\bstop\s+loss\b/i.test(qNorm) ||
    (/\bsl\b/i.test(q) && /\b(?:mandatory|compulsory|required|need|must|without|trade|set|use|place)\b/i.test(q));
  if (asksStopLossTopic) {
    if (/strategy risk limits/i.test(titleL)) score += 52;
    // Product daily/max loss cards share the word "loss" but do not answer SL-required.
    if (/loss limits?\b|daily and max loss/i.test(titleL) && !/strategy risk/i.test(titleL)) score -= 18;
    if (/documentation is required|verification\?/i.test(titleL)) score -= 22;
    if (/eas?\s*\(expert|expert advisors\)/i.test(titleL)) score -= 10;
  }

  // Ticket 215476045517331: priced dashboard reset option vs Soft Breach retrieval
  const asksPricedResetOption =
    /\$\s*\d{2,4}\s*option\b|\bbottom\s+option\b|\b(?:choose|select|pick)\s+the\s+(?:bottom\s+)?option\b|\bhow\s+much\s+(?:for\s+)?(?:a\s+)?reset\b|\breset\s+(?:fee|price|cost|option)\b|\bfunded\s+account\s+directly\b|\balready\s+passed\s+(?:the\s+)?required\s+stages\b|\bgo\s+through\s+the\s+steps\b|\bwithout\s+(?:repeating\s+)?(?:the\s+)?(?:evaluation\s+)?steps\b/i.test(q);
  const asksSoftBreachOrScalping =
    /\bsoft\s*breach\b|\bscalping\s+rule\b|\bscalp\s+limit\b|\bminimum\s+holding\s+time\b|\bholding\s+time\b/i.test(q);
  if (asksPricedResetOption && !asksSoftBreachOrScalping) {
    if (/strategy risk limits.*consequence|consequence of the rule violation/i.test(titleL)) score += 48;
    if (/^resets?, the safety net$/i.test(titleL)) score += 20;
    if (/what is considered a soft breach|soft breach\?|minimum holding time|hft and high-frequency scalping/i.test(titleL)) score -= 30;
  }


  // Product attribution: a named product in the ask must beat other products'
  // similarly worded % cards (Catalyst 3% DLL vs Instant 3% DLL vs 2-Step 5% DLL).
  const qProducts = detectQueryProducts(q);
  const aProduct = inferArticleProduct(article);
  if (qProducts.length === 1) {
    const qp = qProducts[0];
    if (aProduct === qp) {
      score += 18;
      // Extra boost when the card is the product's loss-limit section/title
      if (asksLossLimit && /loss limits?\b|daily and max loss/i.test(titleL)) score += 10;
    } else if (aProduct && aProduct !== qp) {
      if (asksLossLimit && /loss limits?\b|daily and max loss|drawdown/i.test(titleL)) score -= 28;
      else if (asksLossLimit) score -= 14;
      else score -= 8;
    }
  } else if (qProducts.length > 1) {
    // Multi-product ask (comparison): mild boost for any named product, no hard penalty
    if (aProduct && qProducts.includes(aProduct)) score += 10;
  }

  return score;
}


/**
 * SOFT_BREACH_RESET_V1 (owner 2026-09-29): live Help Center HTML can still carry the stale
 * "closure + forfeiture" sentence on Strategy Risk Limits. Strip/replace that sentence only;
 * do not rewrite the general Soft Breach article or other soft-breach types. Primary authority
 * is approved-internal + faq-errata; this overlay is a retrieval safety net for live fetch.
 */
function applyArsalBreachOverlays(title, url, body) {
  let out = String(body || '');
  const titleL = String(title || '').toLowerCase();
  const urlL = String(url || '').toLowerCase();
  const isRisk =
    /strategy risk limits/i.test(titleL) || /12682106-strategy-risk-limits/.test(urlL);
  if (!isRisk) return out;
  const replacement =
    'A Strategy Risk Limits (Risk Rule) breach on the funded/live stage is a soft breach, not immediate termination. ' +
    'The client must reset the account to continue; the reset option appears on the dashboard (maximum 3 resets). ' +
    'First reset is 40% of the challenge fee; the second costs double the first; the third costs double the second.';
  out = out.replace(
    /Breaches of the rule outlined in this agreement may result in funded account closure and forfeiture of any accumulated profits?\.?/gi,
    replacement
  );
  return out;
}

function _isProductionBotProcess() {
  return process.env.pm_id != null && String(process.env.name || '') === 'intercom-bot';
}

async function fetchLiveArticle(url) {
  if (!url || !/^https:\/\/faq\.fundedelite\.com\//i.test(url)) return '';
  const cached = _liveCache.get(url);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.text;
  try {
    const r = await axios.get(url, {
      timeout: 4500,
      headers: { 'User-Agent': 'FundedEliteSupportBot/1.0', Accept: 'text/html' },
      validateStatus: () => true,
      maxRedirects: 3,
    });
    if (r.status >= 400 || typeof r.data !== 'string') return '';
    let html = r.data;
    // strip scripts/styles
    html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    let text = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<li>/gi, '\n- ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    // keep middle chunk
    if (text.length > 3500) text = text.slice(0, 3500) + '…';
    _liveCache.set(url, { at: Date.now(), text });
    return text;
  } catch (e) {
    console.log('FAQ_LIVE_FETCH_FAIL', url, e && e.message);
    return '';
  }
}

const ATTRIBUTE_FOLLOWUP_RE =
  /\b(?:leverage|fx|forex|consistency|drawdown|daily\s+loss|max(?:imum)?\s+(?:loss|drawdown)|profit\s*split|profit\s+target|target|trading\s+days|profitable\s+days|holding\s+time|payout|lot\s*size|risk|split|fee|price|sizes?|scalp\w*|weekend|news)\b/i;
const PRODUCT_HINT_RE =
  /\b(?:instant(?:\s+elite)?|1[\s-]*step|2[\s-]*step|flash|catalyst|lite)\b/i;

/**
 * Short attribute follow-ups ("and leverage on fx?") drop the product name.
 * Inherit the most recent named product from prior client text so Instant
 * 1:30 is not beaten by the generic "customizable leverage" article (R073).
 */
function inheritProductForRetrieval(latest, priorTexts) {
  const q = String(latest || '').trim();
  if (!q || PRODUCT_HINT_RE.test(q)) return '';
  if (!ATTRIBUTE_FOLLOWUP_RE.test(q)) return '';
  if (q.split(/\s+/).filter(Boolean).length > 12) return '';
  // PRODUCT_INHERIT_VARIANT_V1 (2026-09-25, live 215476101110604): the old regex matched "2 step" and dropped
  // "lite", so a Lite 2-Step client's follow-up retrieved 2-Step + FREE RETRY articles (wrong product
  // evidence -> false UNSUPPORTED_NUMBER -> silence). Use the shared variant-aware detector, most recent first.
  const PHRASE = { 'lite-2-step': '2 step lite', '2-step': '2 step free retry', 'lite-1-step': '1 step lite', '1-step': '1 step free retry',
    instant: 'instant', catalyst: 'catalyst', flash: 'flash activation' };
  const recent = (priorTexts || []).slice(-8).reverse();
  for (const t of recent) {
    if (/\binstant\s+elite\b/i.test(String(t || ''))) return 'instant elite';
    const found = detectQueryProducts(String(t || ''));
    if (found.length === 1 && PHRASE[found[0]]) return PHRASE[found[0]];
    if (found.length > 1) return '';
  }
  return '';
}

function shouldRetrieveOfficialFaq(clientText) {
  const t = String(clientText || '').trim();
  if (!t || t.length < 3) return false;
  // skip pure social / personal / transfer-only short pings without product ask
  if (/^(ok|okay|thanks|thank you|thx|ty|got it|alright|yes|no|hi|hey|hello)\.?$/i.test(t)) return false;
  if (/(wife|girlfriend|kids|age|telegram|whatsapp|personal)/i.test(t) && !/(payout|challenge|account|drawdown|instant|lite|flash|funded)/i.test(t)) {
    return false;
  }
  // product / rules / FAQ-ish
  return true;
}

/**
 * Retrieve top FAQ snippets for a client question.
 * Uses versioned local knowledge store (preferred) or synced FAQ markdown.
 * Live fetch is opt-in (opts.live === true) for sync jobs only — never on answer path.
 */

/**
 * SECTION/CHUNK-aware body selection.
 * Blind head truncation (slice 0,N) drops late-article facts (e.g. Flash split/consistency).
 * Split into sections/paragraphs, score vs the ask, keep original order, bound tokens.
 * Title/URL/provenance stay on the wrapper; examples stay attached to their rule chunk.
 */
function splitBodyChunks(body) {
  const text = String(body || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  const rough = text.split(
    /\n(?=(?:#{1,6}\s+|[A-Z][A-Za-z0-9 /&%'()\-]{2,80}:\s*$|[A-Z][A-Za-z0-9 /&%'()\-]{2,80}\n(?=- |\* |\d+\. |[A-Z])))/
  );
  const chunks = [];
  for (const part of rough) {
    const p = part.trim();
    if (!p) continue;
    if (p.length <= 900) {
      chunks.push(p);
      continue;
    }
    const paras = p.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
    if (paras.length <= 1) {
      // LINE_SNAP_V1 (2026-09-27): window on whole lines (one line of overlap) instead of raw 700-char slices,
      // which cut facts mid-sentence ("Payouts below 500 USD are proces…"). A single over-long line still
      // falls back to character windows.
      const lines = p.split('\n');
      let buf = [];
      let len = 0;
      const flush = () => { if (buf.length) chunks.push(buf.join('\n')); };
      for (const line of lines) {
        if (line.length > 700) {
          flush(); buf = []; len = 0;
          let i = 0;
          while (i < line.length) {
            const end = Math.min(line.length, i + 700);
            chunks.push(line.slice(i, end));
            if (end >= line.length) break;
            i = Math.max(i + 500, end - 120);
          }
          continue;
        }
        if (len + line.length + 1 > 700 && buf.length) {
          flush();
          const last = buf[buf.length - 1];
          buf = last.length < 250 ? [last] : [];
          len = buf.length ? last.length + 1 : 0;
        }
        buf.push(line);
        len += line.length + 1;
      }
      flush();
    } else {
      let buf = '';
      for (const para of paras) {
        if ((buf + '\n\n' + para).trim().length > 850 && buf) {
          chunks.push(buf.trim());
          buf = para;
        } else {
          buf = buf ? buf + '\n\n' + para : para;
        }
      }
      if (buf.trim()) chunks.push(buf.trim());
    }
  }
  return chunks.length ? chunks : [text];
}

function scoreChunk(chunk, tokens, clientText) {
  const c = String(chunk || '').toLowerCase();
  const q = String(clientText || '').toLowerCase();
  let score = 0;
  for (const t of tokens || []) {
    if (!t || t.length < 3) continue;
    if (c.includes(t)) score += 3;
  }
  const topicPairs = [
    [/split|payout|withdraw/, /profit split|payout|withdraw/],
    [/consistenc/, /consistenc/],
    [/target|objective/, /profit target|trading objectives|objective/],
    [/daily loss|max loss|drawdown|dll|mll/, /daily|max loss|drawdown|loss limit/],
    [/leverag/, /leverag/],
    [/scalp|holding|hold time/, /scalp|holding|hold/],
    [/weekend/, /weekend/],
    [/activation|fee|\$5|entry/, /activation|fee|\$\d|entry/],
    [/second chance|retry/, /second chance|retry/],
    [/live phase/, /live phase|live account/],
  ];
  for (const [qRe, cRe] of topicPairs) {
    if (qRe.test(q) && cRe.test(c)) score += 8;
  }
  // Exact fact-anchor boosts: keep the answering section even when earlier
  // "funded/activation" prose also matches loosely.
  if (/\bsplit\b/.test(q) && /profit\s*split\s*:/.test(c)) score += 18;
  if (/\bconsistenc/.test(q) && /consistenc/.test(c) && /\d\s*%/.test(c)) score += 16;
  if (/\btarget\b/.test(q) && /profit\s*target\s*:/.test(c)) score += 16;
  if (/\b\d+\s*%|\$\s*\d/.test(c) && /\b(?:%|percent|split|target|loss|fee|payout|consistenc|drawdown)\b/i.test(q)) {
    score += 4;
  }
  if (/table of contents|related articles|did this answer/i.test(c)) score -= 6;
  return score;
}

// LINE_SNAP_V1 helpers: move a cut position to the nearest line boundary (within 40% of the window).
function snapBack(text, pos) {
  if (pos >= text.length) return text.length;
  const nl = text.lastIndexOf('\n', pos);
  return nl > pos * 0.6 ? nl : pos;
}
function snapForward(text, pos) {
  if (pos <= 0) return 0;
  const nl = text.indexOf('\n', pos);
  return nl !== -1 && nl - pos < 400 ? nl + 1 : pos;
}

function selectRelevantBodyChunks(body, clientText, opts) {
  opts = opts || {};
  const maxChars = opts.maxChars || 1800;
  const text = String(body || '').trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;

  const tokens = tokenize(clientText);
  const chunks = splitBodyChunks(text);
  if (chunks.length <= 1) {
    const lower = text.toLowerCase();
    let bestAt = 0;
    let bestScore = -1;
    for (const t of tokens) {
      let idx = 0;
      while (t && (idx = lower.indexOf(t, idx)) !== -1) {
        if (10 > bestScore) {
          bestScore = 10;
          bestAt = idx;
        }
        idx += t.length;
      }
    }
    // Also hunt common late-fact anchors
    for (const anchor of ['profit split', 'consistency', 'payout request', 'live phase']) {
      const idx = lower.indexOf(anchor);
      if (idx > bestAt) {
        bestAt = idx;
        bestScore = 12;
      }
    }
    if (bestAt > maxChars * 0.55) {
      // The opening paragraph often defines product, stage and exceptions for
      // every later section. Preserve it when a later keyword wins ranking;
      // otherwise a retrieved article can lose the very scope that authorizes
      // its numbers (and the model/validator both see an incomplete rule).
      const leadSize = Math.min(500, Math.floor(maxChars * 0.32));
      const focusSize = maxChars - leadSize - 8;
      const start = Math.max(leadSize, bestAt - Math.floor(focusSize * 0.35));
      // LINE_SNAP_V1 (2026-09-27): cut on line boundaries. A mid-sentence cut turned "Payouts below 500 USD are
      // processed exclusively in cryptocurrency" into "Payouts below 500 USD are proces … cy." in the evidence.
      const leadEnd = snapBack(text, leadSize);
      const s0 = snapForward(text, start);
      const e0 = snapBack(text, start + focusSize);
      const piece = text.slice(s0, e0 > s0 ? e0 : start + focusSize);
      return text.slice(0, leadEnd) + '\n…\n' + piece + ((e0 > s0 ? e0 : start + focusSize) < text.length ? '\n…' : '');
    }
    // Head + tail hybrid so late facts are not silently lost
    const headLen = Math.floor(maxChars * 0.45);
    const tailLen = maxChars - headLen - 20;
    return text.slice(0, snapBack(text, headLen)) + '\n…\n' + text.slice(snapForward(text, text.length - tailLen));
  }

  const scored = chunks.map((chunk, i) => ({
    i,
    chunk,
    score: scoreChunk(chunk, tokens, clientText),
  }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);

  const selected = new Set();
  let used = 0;
  for (const s of scored) {
    if (s.score <= 0 && selected.size > 0) continue;
    const add = s.chunk.length + (selected.size ? 2 : 0);
    if (used + add > maxChars && selected.size > 0) continue;
    if (used + add > maxChars && selected.size === 0) {
      selected.add(s.i);
      used = maxChars;
      break;
    }
    selected.add(s.i);
    used += add;
    if (used >= maxChars * 0.92) break;
  }
  if (!selected.size) {
    selected.add(0);
    selected.add(chunks.length - 1);
  }
  // Force-include the single best fact-anchor chunk for split/consistency/target asks
  const qLow = String(clientText || '').toLowerCase();
  let must = null;
  if (/\bsplit\b/.test(qLow)) {
    must = scored.find((s) => /profit\s*split\s*:/i.test(s.chunk));
  } else if (/\bconsistenc/.test(qLow)) {
    must = scored.find((s) => /consistenc/i.test(s.chunk) && /\d\s*%/.test(s.chunk));
  } else if (/\btarget\b/.test(qLow)) {
    must = scored.find((s) => /profit\s*target\s*:/i.test(s.chunk));
  }
  if (must && !selected.has(must.i)) {
    // Make room by dropping lowest-score selected chunks first
    while (used + must.chunk.length > maxChars + 220 && selected.size) {
      let drop = null;
      let dropScore = Infinity;
      for (const idx of selected) {
        const sc = scored.find((s) => s.i === idx);
        const scv = sc ? sc.score : 0;
        if (scv < dropScore) {
          drop = idx;
          dropScore = scv;
        }
      }
      if (drop == null) break;
      used -= chunks[drop].length;
      selected.delete(drop);
    }
    selected.add(must.i);
    used += must.chunk.length;
  }

  const lateHits = scored.filter((s) => s.score >= 8 && s.i >= Math.floor(chunks.length / 2));
  for (const h of lateHits.slice(0, 2)) {
    if (selected.has(h.i)) continue;
    const add = h.chunk.length + 2;
    if (used + add <= maxChars + 220) {
      selected.add(h.i);
      used += add;
    } else if (selected.size > 1) {
      const selectedList = [...selected].sort((a, b) => a - b);
      let drop = null;
      let dropScore = Infinity;
      for (const idx of selectedList) {
        const sc = scored.find((s) => s.i === idx);
        const scv = sc ? sc.score : 0;
        if (scv < h.score && scv < dropScore) {
          drop = idx;
          dropScore = scv;
        }
      }
      if (drop != null) {
        used -= chunks[drop].length;
        selected.delete(drop);
        selected.add(h.i);
        used += h.chunk.length;
      }
    }
  }

  const ordered = [...selected].sort((a, b) => a - b);
  const parts = ordered.map((i) => {
    let c = chunks[i];
    if (c.length > maxChars && ordered.length === 1) c = c.slice(0, maxChars) + '…';
    return c;
  });
  let out = parts.join('\n\n');
  if (ordered[0] > 0) out = '…\n' + out;
  if (ordered[ordered.length - 1] < chunks.length - 1) out = out + '\n…';
  if (out.length > maxChars + 280) {
    // Prefer keeping the end of the assembled relevant block (late matched facts)
    out = '…' + out.slice(-(maxChars + 280));
  }
  // Keep the article's opening scope even if chunk ranking or the final size cap
  // selected only a later section. The opening often says which stage/product
  // the rest of the article governs.
  const lead = text.slice(0, Math.min(400, Math.floor(maxChars * 0.23)));
  if (lead.length >= 80 && !out.includes(lead.slice(0, 80))) {
    const tailSize = Math.max(0, maxChars + 280 - lead.length - 5);
    out = lead + '\n…\n' + out.slice(-tailSize);
  }
  return out;
}


/* PRICED_OPTION_QUERY_V1: a priced dashboard option ("the $185 option", "the bottom option") on a
 * funded/passed account is the account RESET purchase; its price rules live in the official Strategy
 * Risk Limits reset-fee text. The question never says "reset", so it used to surface only by accident
 * (through the now-retired owner overlay). Append retrieval terms; the client text is unchanged. */
function normalizePricedOptionQuery(text) {
  const t = String(text || '');
  const pricedOption = /\$\s*\d{2,4}\s*option\b|\bbottom\s+option\b|\b(?:choose|select|pick)\s+the\s+(?:\$\s*\d{2,4}\s+|bottom\s+|second\s+|last\s+)?option\b/i.test(t);
  const context = /\b(?:funded|passed|stages?|dashboard|reset|account)\b/i.test(t);
  return pricedOption && context ? t + ' reset account fee dashboard reset button first reset fee' : t;
}

const OWNER_DEFAULT_RULE_BY_PRODUCT = {
  '1-step': 'ai-defaults-1-step-free-retry', '2-step': 'ai-defaults-2-step-free-retry',
  'lite-1-step': 'ai-defaults-lite-1-step', 'lite-2-step': 'ai-defaults-lite-2-step', instant: 'ai-instant-profit-split-first-payout',
};
const OWNER_DEFAULT_RULE_IDS = new Set(Object.values(OWNER_DEFAULT_RULE_BY_PRODUCT));
async function retrieveOfficialFaqContext(clientText, opts) {
  const limit = (opts && opts.limit) || 4;
  const __priorForScope = (opts && opts.priorClientTexts) || [];
  const inherited = inheritProductForRetrieval(clientText, __priorForScope);
  if (inherited) clientText = inherited + ' ' + clientText;
  else if (tradingStagePolicy && typeof tradingStagePolicy.productPhraseFromHistory === 'function') {
    const phrase = tradingStagePolicy.productPhraseFromHistory(clientText, __priorForScope);
    if (phrase) clientText = phrase + ' ' + clientText;
  }
  clientText = normalizeStopLossQuery(clientText);
  clientText = normalizePricedOptionQuery(clientText);
  const tokens = tokenize(clientText);
  const articles = getArticles();
  if (!articles.length) {
    return {
      ok: false,
      block:
        'OFFICIAL FAQ CONTEXT: Local FAQ sync file not loaded. Prefer escalate FAQ_CONFIRM if unsure. Official sources: ' +
        OFFICIAL_FAQ_HOME +
        ' and ' +
        OFFICIAL_SITE,
    };
  }
  // A broad prohibited-practices question refers to the whole official collection.
  // Keyword ranking returned zero for "prohibited strategies" because none of the
  // individual article titles contain both words. Give the model the collection's
  // actual rules, including HFT, IP sharing and the funded-stage risk limit.
  const broadProhibited = /\b(?:prohibit(?:ed|ions?)|forbidden|banned|not\s+allowed|disallowed)\b/i.test(clientText) &&
    /\b(?:strateg(?:y|ies)|practices?|trading|rules?|activities|methods?)\b/i.test(clientText) &&
    !/\b(?:hft|scalp|weekend|hedg|ip\s+shar|risk\s+limit|ea\b|grid|martingale)\b/i.test(clientText);
  if (broadProhibited) {
    const overview = articles.filter((a) => a.collection === 'What is prohibited with us?' &&
      a.sourceType !== 'approved_internal' && !String(a.id || '').includes('__'));
    const adjacent = articles.filter((a) => /^(?:EAs \(Expert Advisors\)|Martingale|Grid Trading)$/i.test(a.title) && a.sourceType !== 'approved_internal');
    if (overview.length >= 10) {
      const selected = overview.concat(adjacent.filter((a) => !overview.includes(a)));
      const pieces = ['OFFICIAL FAQ CONTEXT: Broad prohibited-practices overview. Cover the relevant rules below and state stage/add-on exceptions. Distinguish manual Martingale/Grid (permitted with conditions) from automated EA versions (restricted). The payment-card FAQ advises using a card in your own name; it does not state a blanket ban on third-party cards. These excerpts are from the current FundedElite Help Center; follow article URLs for details.'];
      for (const a of selected) {
        const plain = stripHtmlForSearch(a.body || '').replace(/\s+/g, ' ').trim();
        pieces.push('---\nTITLE: ' + a.title + '\nURL: ' + a.url + '\nCONTENT: ' + plain.slice(0, 700));
      }
      return {
        ok: true, block: pieces.join('\n'), count: selected.length, from: _loadedFrom,
        provenance: selected.map((a) => ({ id: a.id, title: a.title, url: a.url, sourceHash: a.sourceHash })),
        authority: 'local-knowledge-store',
      };
    }
  }
  // A single explicitly named variant must never receive sibling product rules
  // among its evidence. Ranking penalties alone still let Lite 1-Step or Free
  // Retry into the fourth slot of a "2-Step Lite rules" answer.
  const namedProducts = detectQueryProducts(clientText);
  const isVariantComparison = /\b(?:compare|comparison|differ\w*|versus|vs\.?|both)\b|\b(?:and|or)\b.{0,35}\bfree\s*retry\b|\bother challenges\b|\bdifferent leverage\b/i.test(clientText);
  const __scope = tradingStagePolicy && typeof tradingStagePolicy.retrievalScope === 'function'
    ? tradingStagePolicy.retrievalScope(clientText, (opts && opts.priorClientTexts) || [])
    : { strict: '', family: '', comparison: isVariantComparison, topic: '', realCapitalAsk: false };
  let strictProduct = namedProducts.length === 1 && !isVariantComparison ? namedProducts[0] : '';
  if (!strictProduct && __scope.strict && !isVariantComparison) strictProduct = __scope.strict;
  const broadProductOverview = namedProducts.length === 1 &&
    /\b(?:rules?|requirements?|overview|details?)\b|^(?:what(?:'s|\s+is)|tell\s+me\s+about)\b/i.test(String(clientText).trim()) &&
    !/\b(?:profit\s+target|profit\s+split|payout|daily\s+loss|max(?:imum)?\s+loss|drawdown|consistency|leverage|trading\s+days|holding\s+time|fee|refund|price)\b/i.test(clientText);
  // OWNER_DEFAULTS_V1 (2026-09-28): the owner-approved per-product default entries never compete for the
  // ranked slots (they displaced official article chunks, e.g. LITE 2-Step on a comparison); instead the entry of
  // each product the client names is appended after the ranked official evidence.
  const SOFT_BREACH_RESET_RULE_ID = 'ai-funded-strategy-risk-and-scalping-limit-soft-breach-reset';
  const __ownerRule = (a) => a && a.sourceType === 'approved_internal' && OWNER_DEFAULT_RULE_IDS.has((a.provenance && a.provenance.ruleId) || String(a.url || '').replace(/^approved_internal:/, ''));
  const __softResetRule = (a) => a && a.sourceType === 'approved_internal' &&
    ((a.provenance && a.provenance.ruleId) || String(a.url || '').replace(/^approved_internal:/, '')) === SOFT_BREACH_RESET_RULE_ID;
  const asksSoftResetTopic =
    /\brisk\s+rule\b|strategy\s+risk\s+limits?/i.test(clientText) ||
    /scalping\s+limit|scalp\s+limit|490\s*\/\s*500|500\s*\/\s*500/i.test(clientText) ||
    (/\b50\s*%\b/.test(clientText) && /\b(?:daily\s+loss|instrument|pair)\b/i.test(clientText) && /\b(?:breach|violat|consequence|happen|reset)\b/i.test(clientText));
  const __noConsId = 'ai-standard-challenges-no-consistency-rule';
  const __instantOnly = namedProducts.length > 0 && namedProducts.every((p) => p === 'instant' || p === 'instant-standard' || p === 'instant-elite');
  const __levId = 'ai-leverage-per-asset-class';
  const __scalpStageId = 'ai-scalping-threshold-by-stage';
  const __ruleIdOf = (a) => (a && ((a.provenance && a.provenance.ruleId) || String(a.url || '').replace(/^approved_internal:/, ''))) || '';
  const __isTransitionLive = (a) => /12688214/.test(String((a && (a.id || a.url)) || ''));
  const ranked = articles
    .filter((a) => !__ownerRule(a))
    .filter((a) => !strictProduct || !inferArticleProduct(a) || inferArticleProduct(a) === strictProduct)
    .filter((a) => {
      if (!tradingStagePolicy || typeof tradingStagePolicy.articleExcluded !== 'function') return true;
      if (__scope.comparison || isVariantComparison) return true;
      return !tradingStagePolicy.articleExcluded(inferArticleProduct(a), Object.assign({}, __scope, { strict: strictProduct || __scope.strict }));
    })
    .filter((a) => {
      if (__scope.realCapitalAsk || __scope.stage === 'real-capital') return true;
      if ((__scope.topic === 'leverage' || /\bleverage\b/i.test(clientText)) && __isTransitionLive(a)) return false;
      return true;
    })
    .filter((a) => !(__instantOnly && __ruleIdOf(a) === __noConsId))
    .map((a) => ({ a, score: scoreArticle(a, tokens, clientText) }))
    .filter((x) => x.score >= 4)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
  if (ranked.length) {
    for (const p of namedProducts) {
      const rid = OWNER_DEFAULT_RULE_BY_PRODUCT[p];
      const hit = rid && articles.find((a) => __ownerRule(a) && ((a.provenance && a.provenance.ruleId) || String(a.url || '').replace(/^approved_internal:/, '')) === rid);
      if (hit && !ranked.some((x) => x.a === hit)) ranked.push({ a: hit, score: 4 });
    }
  }
  // SOFT_BREACH_RESET_V1: pin the owner reset card first for Strategy Risk / Scalping Limit asks so
  // stale Help Center "closure and forfeiture" wording cannot outrank it.
  if (asksSoftResetTopic) {
    const hit = articles.find(__softResetRule);
    if (hit) {
      const idx = ranked.findIndex((x) => x.a === hit || (x.a && x.a.id === hit.id));
      if (idx >= 0) ranked.splice(idx, 1);
      ranked.unshift({ a: hit, score: 999 });
      while (ranked.length > limit + 1) ranked.pop();
    }
  }
  // STAGE_POLICY_V1: pin the canonical card for the topic so another product's article cannot outrank it.
  {
    const pinId = (__scope.topic === 'consistency' && strictProduct && tradingStagePolicy && tradingStagePolicy.NO_CONSISTENCY && tradingStagePolicy.NO_CONSISTENCY.has(strictProduct))
      ? __noConsId
      : (__scope.topic === 'leverage' ? __levId
        : (__scope.topic === 'scalping' ? __scalpStageId : ''));
    if (pinId) {
      const hit = articles.find((a) => __ruleIdOf(a) === pinId);
      if (hit) {
        const idx = ranked.findIndex((x) => x.a === hit || (x.a && x.a.id === hit.id));
        if (idx >= 0) ranked.splice(idx, 1);
        ranked.unshift({ a: hit, score: 998 });
        while (ranked.length > limit + 1) ranked.pop();
      }
    }
  }

  if (!ranked.length) {
    return {
      ok: true,
      block:
        'OFFICIAL FAQ CONTEXT (no strong article match for this ask):\n' +
        '- Official FAQ: ' +
        OFFICIAL_FAQ_HOME +
        '\n- Official website: ' +
        OFFICIAL_SITE +
        '\n- If the answer is not clearly supported, do NOT guess and do NOT send a third-person summary as the client reply. Either answer the client directly in second person from approved facts, or use ACTION: ESCALATE KIND: FAQ_CONFIRM with CLIENT as a short second-person handoff and BODY as an internal summary that is never shown to the client.\n' +
        '- Synced FAQ file: ' +
        (_loadedFrom || 'unknown'),
    };
  }

  const pieces = [];
  pieces.push(
    'OFFICIAL FAQ CONTEXT (verify answer from these FundedElite official sources before replying):\n' +
      'Primary FAQ: ' +
      OFFICIAL_FAQ_HOME +
      '\nWebsite: ' +
      OFFICIAL_SITE +
      '\nRules: Prefer this retrieved FAQ text. Canonical luna-knowledge (Official FAQ CONTEXT) is the runtime authority for CURRENT PUBLIC business facts for the same product/stage/rule. System-prompt product % cards and historical snapshots are NON-AUTHORITATIVE for those facts and must NOT override newer active synced KB. Behavioral LOCKED instructions (safety, escalation, tone) still apply. Soft-breach consequences: general Soft Breach / IP / Scalping Flag follow their official articles; funded Strategy Risk / Risk Rule and Scalping Limit follow the owner approved-internal soft-breach reset rule when present (soft breach, dashboard reset, max 3, 40% then double then double) and must not be answered as immediate closure/forfeiture. Never invent. Exact ask only.'
  );

  for (const { a, score } of ranked) {
    let body = a.body;
    // Authoritative knowledge sync: answer path NEVER live-fetches.
    // Live HTML refresh belongs to `luna-knowledge-sync --live` only.
    // ANSWER_PATH_LOCAL_ONLY_V1 (2026-09-24, owner order): Help Center changes must not reach
    // customers automatically. The live-fetch option is therefore refused inside the production
    // bot process even if a caller passes it; only the manual sync tooling (outside PM2) may use it.
    const canLive = !!(opts && opts.live === true) && !_isProductionBotProcess() &&
      a.url && !/^https:\/\/faq\.fundedelite\.com\/en\/?$/i.test(a.url) && /\/articles\//i.test(a.url);
    if (canLive) {
      const live = await fetchLiveArticle(a.url);
      const junk = /Search for articles|Back to website|Get started with fundedElite/i.test(live || '');
      if (live && live.length > 120 && !junk) body = live;
    }
    if (!body || body.length < 40) body = a.body;
    body = applyArsalBreachOverlays(a.title, a.url, body);
    // A product-wide rules request needs the whole parent article. The default
    // 1,800-character slice cut off later-stage rules and payout conditions.
    // COMPARISON_BODY_V1 (2026-09-27): a variant comparison ("difference between both", "X vs Y") needs every
    // rule of the article, not the chunks that share words with "difference". The official Instant body is
    // long; the 1800-char slice dropped the 25% / 6% / 4-day / 0,5% facts and the final revalidation then
    // rejected a correct KB comparison table as unsupported.
    const comparisonAsk = /\b(?:differen(?:ce|ces|t)|compare|comparison|versus|vs\.?)\b/i.test(String(clientText || ''));
    body = selectRelevantBodyChunks(body, clientText, { maxChars: (broadProductOverview || comparisonAsk) ? 4200 : 1800 });
    pieces.push(
      '---\nTITLE: ' +
        a.title +
        '\nURL: ' +
        a.url +
        (inferArticleProduct(a) ? '\nPRODUCT: ' + inferArticleProduct(a) : '') +
        '\nSCORE: ' +
        score +
        '\nCONTENT:\n' +
        body
    );
  }

  const provenance = ranked.map(({ a, score }) => ({
    id: a.id || null,
    title: a.title,
    url: a.url,
    score,
    sourceHash: a.sourceHash || null,
    lastSynced: a.lastSynced || null,
    version: a.version || null,
    product: a.product || null,
    stage: a.stage || null,
    precedence: a.precedence || null,
  }));
  return {
    ok: true,
    block: pieces.join('\n\n'),
    count: ranked.length,
    from: _loadedFrom,
    provenance,
    authority: 'local-knowledge-store',
  };
}

/**
 * PRODUCT_BUNDLE_V1: every active parent article of one product, as an evidence block.
 * A comparison needs each product's complete published rule set; a keyword query for
 * "catalyst challenge" returned the profit-target / loss / payout articles but never the
 * overview that states the 80% starting split, so the auditor could not see the article the
 * answer relied on. Section cards ("Title , Section") are skipped because their parent is included.
 */
function productBundle(product, opts) {
  const want = String(product || '').toLowerCase();
  if (!want) return null;
  const maxChars = (opts && opts.maxCharsPerArticle) || 3500;
  const arts = getArticles().filter((a) => a && a.sourceType !== 'approved_internal' &&
    !/ , /.test(String(a.title || '')) && inferArticleProduct(a) === want);
  if (!arts.length) return null;
  const pieces = arts.map((a) => '---\nTITLE: ' + a.title + '\nURL: ' + a.url + '\nPRODUCT: ' + want +
    '\nCONTENT:\n' + String(a.body || '').slice(0, maxChars));
  return {
    ok: true, block: pieces.join('\n\n'), count: arts.length, from: _loadedFrom, authority: 'local-knowledge-store',
    provenance: arts.map((a) => ({ id: a.id || null, title: a.title, url: a.url, product: want, sourceHash: a.sourceHash || null })),
  };
}

function reloadFaqKb() {
  _articles = null;
  return getArticles().length;
}

module.exports = {
  retrieveOfficialFaqContext,
  shouldRetrieveOfficialFaq,
  inheritProductForRetrieval,
  reloadFaqKb,
  getArticles,
  applyArsalBreachOverlays,
  stripHtmlForSearch,
  detectQueryProducts,
  inferArticleProduct,
  expandProductSectionCards,
  articlesFromKnowledgeStore,
  normalizeStopLossQuery,
  selectRelevantBodyChunks,
  splitBodyChunks,
  scoreChunk,
  OFFICIAL_FAQ_HOME,
  productBundle,
  OFFICIAL_SITE,
};
