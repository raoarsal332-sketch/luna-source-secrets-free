'use strict';
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const FAQ_MD_PATHS = [
  process.env.FUNDEDELITE_FAQ_PATH || '',
  '/home/ubuntu/fundedelite-faqs.md',
  '/workspace/fundedelite-faqs.md',
  path.join(__dirname, 'fundedelite-faqs.md'),
].filter(Boolean);

const OFFICIAL_FAQ_HOME = 'https://faq.fundedelite.com/en/';
const OFFICIAL_SITE = 'https://fundedelite.com/';

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
      searchText: (title + '\n' + body).toLowerCase(),
    });
  }
  return out;
}

function getArticles() {
  if (_articles && _articles.length) return _articles;
  const loaded = loadFaqMarkdown();
  if (!loaded) {
    _articles = [];
    _loadedFrom = null;
    return _articles;
  }
  _articles = parseArticles(loaded.text);
  _loadedFrom = loaded.path;
  console.log('FAQ_KB loaded', _articles.length, 'articles from', loaded.path);
  return _articles;
}

// Clients and the FAQ use different words for the same thing ("how much can I LOSE" vs
// "daily LOSS limit"), and scoring is plain substring matching, so the article that
// actually holds the answer scores lower than a loosely related one. Expand the query with
// the FAQ's own vocabulary. Expansion only adds tokens; it never drops the client's words.
const QUERY_EXPAND = {
  lose: 'loss', loses: 'loss', losing: 'loss', lost: 'loss',
  withdraw: 'payout', withdrawal: 'payout', withdrawals: 'payout',
  breach: 'loss', breached: 'loss', breaching: 'loss',
};

function tokenize(q) {
  const base = String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
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

function isCountryEligibilityAsk(text) {
  const t = String(text || '');
  // The country-name alternatives below are case-SENSITIVE on purpose: they used to sit in
  // the same /i regex as the keywords, where [A-Z][a-z]+ also matched lowercase, so "lose
  // in one day" counted as "in <Country>".
  return /\b(?:country|countries|restricted|reside|resident|nationalit|citizenship|geo)\b/i.test(t) ||
    /\b(?:from|in|for)\s+[A-Z][a-z]+/.test(t) ||
    // The candidate after in/from/for must look like a country: a proper noun, not any run
    // of words. Without this, "how much can I lose IN ONE DAY before I breach?" was read as
    // a country ask and forced Restricted Countries to the top of every result, pushing the
    // real loss-limit article out and leaving Luna to guess the percentage.
    /\b(?:is|can|allowed|allow|open|trade|trading|buy|purchase)\b[\s\S]{0,60}\b(?:in|from|for)\s+(?!(?:one|a|an|the|my|this|that|each|any|some|per)\b)[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,3}\s*\??\s*$/.test(t) ||
    /\b(usa|united states|uk|india|pakistan|germany|canada|australia|nigeria|brazil|turkey|kenya|somalia|iran|iraq|russia|syria|cuba|myanmar)\b/i.test(t) &&
      /\b(trade|trading|account|allowed|allow|open|buy|purchase|restrict|eligible|eligibility)\b/i.test(t);
}

function scoreArticle(article, tokens, clientText) {
  if (!tokens.length) return 0;
  let score = 0;
  const titleL = article.title.toLowerCase();
  for (const t of tokens) {
    if (titleL.includes(t)) score += 6;
    const c = article.searchText.split(t).length - 1;
    if (c > 0) score += Math.min(4, c);
  }
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
  return score;
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
 * Uses synced official FAQ markdown + live fetch of matched article URLs.
 */
function rankArticles(clientText) {
  const tokens = tokenize(clientText);
  return getArticles()
    .map((a) => ({ a, score: scoreArticle(a, tokens, clientText) }))
    .filter((x) => x.score >= 4)
    .sort((x, y) => y.score - x.score);
}

// The top local article from the same ranking retrieveOfficialFaqContext uses.
// The body is the synced answer. No figure is added.
function selectApprovedAnswer(clientText) {
  const ranked = rankArticles(clientText);
  if (!ranked.length) return null;
  const top = ranked[0];
  let body = String((top.a && top.a.body) || '').trim();
  if (!body) return null;
  if (body.length > 1600) body = body.slice(0, 1600) + '…';
  return { title: top.a.title, url: top.a.url, body, score: top.score };
}

async function retrieveOfficialFaqContext(clientText, opts) {
  const limit = (opts && opts.limit) || 4;
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
  const ranked = rankArticles(clientText).slice(0, limit);

  if (!ranked.length) {
    return {
      ok: true,
      block:
        'OFFICIAL FAQ CONTEXT (no strong article match for this ask):\n' +
        '- Official FAQ: ' +
        OFFICIAL_FAQ_HOME +
        '\n- Official website: ' +
        OFFICIAL_SITE +
        '\n- If the answer is not clearly supported, do NOT guess. Use confirm-with-team + ACTION: ESCALATE KIND: FAQ_CONFIRM.\n' +
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
      '\nRules: Prefer this retrieved FAQ text. Arsal LOCKED product corrections in your system prompt still win if they conflict with stale FAQ wording (e.g. Instant vs Instant Elite naming, Instant leverage 1:30). Never invent. Exact ask only.'
  );

  for (const { a, score } of ranked) {
    let body = a.body;
    const canLive = opts && opts.live === false
      ? false
      : a.url && !/^https:\/\/faq\.fundedelite\.com\/en\/?$/i.test(a.url) && /\/articles\//i.test(a.url);
    if (canLive) {
      const live = await fetchLiveArticle(a.url);
      const junk = /Search for articles|Back to website|Get started with fundedElite/i.test(live || '');
      if (live && live.length > 120 && !junk) body = live;
    }
    if (!body || body.length < 40) body = a.body;
    if (body.length > 1600) body = body.slice(0, 1600) + '…';
    pieces.push(
      '---\nTITLE: ' +
        a.title +
        '\nURL: ' +
        a.url +
        '\nSCORE: ' +
        score +
        '\nCONTENT:\n' +
        body
    );
  }

  return { ok: true, block: pieces.join('\n\n'), count: ranked.length, from: _loadedFrom };
}

function reloadFaqKb() {
  _articles = null;
  return getArticles().length;
}

module.exports = {
  retrieveOfficialFaqContext,
  selectApprovedAnswer,
  rankArticles,
  shouldRetrieveOfficialFaq,
  reloadFaqKb,
  getArticles,
  OFFICIAL_FAQ_HOME,
  OFFICIAL_SITE,
};
