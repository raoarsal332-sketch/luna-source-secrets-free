'use strict';

/**
 * Prefer real FundedElite account numbers over challenge sizes, IPv4 digit glue, years, etc.
 * Additive helper for identityEscalateGates + index.js live extract.
 */

const CHALLENGE_SIZES = new Set([
  '25000',
  '50000',
  '100000',
  '200000',
  '300000',
  '400000',
]);

const IPV4_RE =
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const YEAR_RE = /^(19|20)\d{2}$/;
const REPEAT_DIGIT_RE = /^(\d)\1+$/;

function stripIpv4(text) {
  return String(text ?? '').replace(IPV4_RE, ' ');
}

function normalizeSizeToken(token) {
  let t = String(token ?? '').trim();
  if (!t) return '';
  // 100.000 / 100,000 / 100 000 → digits only when thousand-separated
  if (/^\d{1,3}([.,\s]\d{3})+$/.test(t)) {
    t = t.replace(/[.,\s]/g, '');
  } else {
    t = t.replace(/\s+/g, '');
  }
  return t;
}

function isChallengeSize(token) {
  const t = normalizeSizeToken(token);
  if (!t || !/^\d+$/.test(t)) return false;
  if (CHALLENGE_SIZES.has(t)) return true;
  // written forms already normalized to ints above; also accept trailing k slang as ints only
  return false;
}

function ipv4ConcatsInText(originalText) {
  const raw = String(originalText ?? '');
  const out = new Set();
  for (const m of raw.matchAll(IPV4_RE)) {
    const octets = m[0].split('.');
    out.add(octets.join(''));
    if (octets.length >= 3) out.add(octets.slice(0, 3).join(''));
  }
  return out;
}

function isIpDerived(token, originalText) {
  const t = String(token ?? '').replace(/\s+/g, '');
  if (!t || !/^\d+$/.test(t)) return false;
  return ipv4ConcatsInText(originalText).has(t);
}

/**
 * Reject digits carved out of money amounts (ticket 215476153566436):
 * "$14,546.29" → "54629", "+$599.86" → "59986".
 */
function isMoneyDerived(token, text) {
  const t = String(token ?? '').replace(/\s+/g, '');
  if (!t || !/^\d{4,12}$/.test(t)) return false;
  const raw = String(text ?? '');
  // $1,234.56 / +$599.86 / USD 1,500.00
  for (const m of raw.matchAll(
    /(?:USD|EUR|GBP|USDT|\$)\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/gi
  )) {
    const whole = String(m[1] || '').replace(/,/g, '');
    const frac = String(m[2] || '');
    if (!whole) continue;
    if (whole === t) return true;
    const joined = whole + frac;
    if (joined === t) return true;
    // "54629" from "14546.29" (integer tail + cents)
    if (frac && joined.endsWith(t) && t.length >= 5) return true;
  }
  // Thousand-separated amounts without currency symbol: 14,546.29
  for (const m of raw.matchAll(/\b(\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?\b/g)) {
    const whole = String(m[1] || '').replace(/,/g, '');
    const frac = String(m[2] || '');
    if (!whole) continue;
    if (whole === t) return true;
    const joined = whole + frac;
    if (joined === t || (frac && joined.endsWith(t) && t.length >= 5)) return true;
  }
  // Bare decimal money: 599.86 → 59986 when token is int+cents glue
  for (const m of raw.matchAll(/(?<![A-Za-z0-9])(\d{1,6})\.(\d{2})(?![0-9])/g)) {
    const joined = m[1] + m[2];
    if (joined === t) return true;
  }
  return false;
}

/** Signature / dial-code phones must never become FundedElite account numbers (215476211580841). */
function isPhoneDerived(token, text) {
  const t = String(token ?? '').replace(/\s+/g, '');
  if (!t || !/^\d{6,12}$/.test(t)) return false;
  const raw = String(text ?? '');
  // (M):+00 (0)000000000 / Phone: +0 000... / Mobile 0000000000
  const labelRe = new RegExp(
    String.raw`(?:\b(?:m|tel|telephone|phone|mobile|cell|whatsapp|wa|contact)\b\s*[):.\-]|\+\d{1,3}\s*(?:\(?0\)?)?\s*)[^0-9]{0,6}` +
      t.replace(/(\d)/g, '\\s*$1').replace(/^\\s\*/, ''),
    'i'
  );
  // Simpler: token appears in an international phone cluster.
  if (new RegExp(String.raw`\+\d{1,3}\s*\(?0?\)?\s*` + t, 'i').test(raw)) return true;
  if (new RegExp(String.raw`\b(?:m|tel|telephone|phone|mobile|cell|whatsapp|wa)\b\s*[):.\-]\s*\+?\d[\d\s().\-]{0,16}` + t, 'i').test(raw)) return true;
  if (new RegExp(String.raw`\(\s*0\s*\)\s*` + t).test(raw)) return true;
  return false;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findExactSpans(text, token) {
  const raw = String(text ?? '');
  const t = String(token ?? '');
  if (!raw || !t) return [];
  const re = new RegExp('(?:^|[^A-Za-z0-9])(' + escapeRe(t) + ')(?=[^A-Za-z0-9]|$)', 'gi');
  const spans = [];
  let m;
  while ((m = re.exec(raw))) {
    const index = m.index + m[0].lastIndexOf(m[1]);
    spans.push({ index, end: index + m[1].length });
    if (re.lastIndex === m.index) re.lastIndex += 1;
  }
  return spans;
}

function thousandForms(token) {
  const t = String(token ?? '');
  if (!/^\d{4,12}$/.test(t)) return [];
  const parts = [];
  let rest = t;
  while (rest.length > 3) {
    parts.unshift(rest.slice(-3));
    rest = rest.slice(0, -3);
  }
  if (rest) parts.unshift(rest);
  if (parts.length < 2) return [];
  return [parts.join(','), parts.join('.'), parts.join(' ')];
}

function findContextSpans(text, token) {
  const exact = findExactSpans(text, token);
  if (exact.length) return exact;
  const spans = [];
  for (const form of thousandForms(token)) {
    spans.push(...findExactSpans(text, form));
  }
  return spans;
}

// Label immediately before the digits. "account 000000", "Account: 000000",
// "my account number is 00000", "acct 00000", "login id 000000".
const EXPLICIT_BEFORE_RE =
  /(?:\b(?:trading\s+)?accounts?\s*(?:numbers?|nos?\.?|#|ids?|logins?)?\s*(?:is|are|=|:|,)?|\b(?:rekeningnummer|accountnummer|handelsrekening)\s*(?:is|zijn|=|:|,)?|\baccts?\s*(?:numbers?|nos?\.?|#|ids?)?\s*(?:is|are|=|:|,)?|\b(?:login|mt5|tradelocker)\s*(?:id|account|numbers?|no\.?)?\s*(?:is|=|:)?|\bid\s*(?:is|=|:)?)\s*$/i;
// "000000 is my account number" — the account words follow the digits.
const EXPLICIT_AFTER_RE =
  /^\s*[,;]?\s*is\s+(?:my\s+|the\s+|our\s+)?(?:trading\s+)?(?:accounts?\s*(?:numbers?|nos?\.?|#|ids?)?|logins?(?:\s*id)?)\b/i;

// The next word owns the number: followers, balances, OTPs, lot size, "a 000000 account".
const NEGATIVE_AFTER_RE =
  /^\s*[,;]?\s*(?:on\s+|in\s+|of\s+)?(?:tiktok|instagram|insta|youtube|facebook|fb|twitter|subscribers?|followers?|views?|likes?|comments?|members?|users?|clients?|audience|community|lots?|percent\b|accounts?|challenges?|steps?)\b|^\s*%/i;
const NEGATIVE_BEFORE_RE =
  /\b(?:balances?|equit(?:y|ies)|profits?|losses?|p\s*&\s*l|pnls?|payouts?|withdrawals?|fees?|prices?|discounts?|lots?|leverages?|margins?|drawdowns?|followers?|subscribers?|views?|likes?|comments?|members?|users?|clients?|audience|community|phones?|mobiles?|cells?|tels?|telephones?|whatsapps?|contacts?|otps?|pins?|passcodes?|passwords?|(?:verification|security|auth(?:entication)?|one[\s-]?time)\s+codes?|2[\s-]?fa(?:\s+codes?)?|account\s+sizes?|challenge\s+sizes?|order\s+(?:values?|amounts?|totals?)|transaction\s+(?:values?|amounts?|totals?)|paid|paying|charged|costs?|worth)\s*(?:numbers?|codes?|pins?)?\s*(?:is|are|of|was|were|about|around|=|:)?\s*$/i;
const SIZE_BEFORE_RE =
  /\b(?:bought|buy(?:ing)?|purchased?|orders?|ordered|want(?:ed)?|a|an|the|this|new)\s+$/i;

function classifySpan(text, span) {
  const before = String(text || '').slice(Math.max(0, span.index - 60), span.index);
  const after = String(text || '').slice(span.end, span.end + 48);
  if (EXPLICIT_BEFORE_RE.test(before) || EXPLICIT_AFTER_RE.test(after)) return 'explicit';
  if (NEGATIVE_BEFORE_RE.test(before) || NEGATIVE_AFTER_RE.test(after)) return 'negative';
  if (SIZE_BEFORE_RE.test(before) && /^\s*[,;]?\s*accounts?\b/i.test(after)) return 'negative';
  return 'neutral';
}

function spanClasses(token, text) {
  return findContextSpans(text, token).map((span) => classifySpan(text, span));
}

function hasExplicitAccountContext(token, text) {
  const exact = findExactSpans(text, token).map((span) => classifySpan(text, span));
  return exact.indexOf('explicit') !== -1;
}

function isNegativeAccountContext(token, text) {
  const classes = spanClasses(token, text);
  if (!classes.length) return false;
  if (classes.indexOf('explicit') !== -1 && findExactSpans(text, token).length) {
    // An explicit label on the exact digits wins over a different negative span
    // of the same number ("account number is 000000" plus a separate metric).
    return false;
  }
  return classes.indexOf('negative') !== -1;
}

/**
 * The client text uses this number only as a non-account figure.
 * A prior note that copied it must not be treated as a trusted Account field.
 */
function clientContextRejects(token, clientText) {
  const classes = spanClasses(token, clientText);
  if (!classes.length) return false;
  if (findExactSpans(clientText, token).some((span) => classifySpan(clientText, span) === 'explicit')) {
    return false;
  }
  return classes.indexOf('negative') !== -1;
}

function isBlockedNoise(token, text) {
  const t = String(token ?? '').replace(/\s+/g, '');
  if (!t) return true;
  if (isChallengeSize(t)) return true;
  if (YEAR_RE.test(t)) return true;
  if (/^\d+$/.test(t) && REPEAT_DIGIT_RE.test(t)) return true;
  if (isIpDerived(t, text)) return true;
  if (isMoneyDerived(t, text)) return true;
  if (isPhoneDerived(t, text)) return true;
  if (isNegativeAccountContext(t, text)) return true;
  return false;
}

function normalizeAccountToken(token) {
  let t = String(token ?? '').trim();
  if (!t) return '';
  t = t.replace(/\s+/g, '');
  return t;
}

function extractExplicitAccountMentions(text) {
  const raw = String(text ?? '');
  if (!raw.trim()) return [];
  const hits = []; // { index, token }

  const pushAt = (index, token) => {
    const t = normalizeAccountToken(token);
    if (!t) return;
    // Accept letter+digit or 5–12 pure digits (filter noise later)
    if (!/^(?:[A-Za-z]{1,6}\d{4,12}|\d{5,12})$/.test(t)) return;
    hits.push({ index, token: t });
  };

  // account (number|no|#|id)? (is|:)? TOKEN
  for (const m of raw.matchAll(
    /\baccount\s*(?:number|no\.?|#|id)?\s*(?:is|=|:)?\s*([A-Za-z]{1,6}\d{4,12}|\d{5,12})\b/gi
  )) {
    pushAt(m.index, m[1]);
  }

  // TOKEN is my account (number)?
  for (const m of raw.matchAll(
    /\b([A-Za-z]{1,6}\d{4,12}|\d{5,12})\s+is\s+my\s+account(?:\s*(?:number|no\.?|#|id))?\b/gi
  )) {
    pushAt(m.index, m[1]);
  }

  // my account (number|...) is TOKEN / : TOKEN
  for (const m of raw.matchAll(
    /\bmy\s+account\s*(?:number|no\.?|#|id)?\s*(?:is|=|:)\s*([A-Za-z]{1,6}\d{4,12}|\d{5,12})\b/gi
  )) {
    pushAt(m.index, m[1]);
  }

  // following accounts: TOKEN TOKEN…
  for (const m of raw.matchAll(
    /\b(?:the\s+)?following\s+accounts?\s*[:=]?\s*((?:[A-Za-z]{1,6}\d{4,12}|\d{5,12})(?:\s*[,;/]?\s*(?:[A-Za-z]{1,6}\d{4,12}|\d{5,12}))*)/gi
  )) {
    const chunk = m[1];
    const base = m.index + m[0].indexOf(chunk);
    for (const tm of chunk.matchAll(/\b([A-Za-z]{1,6}\d{4,12}|\d{5,12})\b/g)) {
      pushAt(base + tm.index, tm[1]);
    }
  }

  // my accounts: …
  for (const m of raw.matchAll(
    /\bmy\s+accounts?\s*[:=]\s*((?:[A-Za-z]{1,6}\d{4,12}|\d{5,12})(?:\s*[,;/]?\s*(?:[A-Za-z]{1,6}\d{4,12}|\d{5,12}))*)/gi
  )) {
    const chunk = m[1];
    const base = m.index + m[0].indexOf(chunk);
    for (const tm of chunk.matchAll(/\b([A-Za-z]{1,6}\d{4,12}|\d{5,12})\b/g)) {
      pushAt(base + tm.index, tm[1]);
    }
  }

  // accounts: TOKEN TOKEN… (bare list label)
  for (const m of raw.matchAll(
    /\baccounts?\s*[:=]\s*((?:[A-Za-z]{1,6}\d{4,12}|\d{5,12})(?:\s*[,;/]?\s*(?:[A-Za-z]{1,6}\d{4,12}|\d{5,12}))*)/gi
  )) {
    const chunk = m[1];
    const base = m.index + m[0].indexOf(chunk);
    for (const tm of chunk.matchAll(/\b([A-Za-z]{1,6}\d{4,12}|\d{5,12})\b/g)) {
      pushAt(base + tm.index, tm[1]);
    }
  }

  // Narrow non-English labels that mean the trading-account number itself.
  // "rekeningnummer 000000", "accountnummer: 000000 en 000000".
  for (const m of raw.matchAll(
    /\b(?:rekeningnummer|accountnummer|handelsrekening)\s*(?:is|zijn|=|:|,)?\s*((?:[A-Za-z]{1,6}\d{4,12}|\d{5,12})(?:\s*(?:[,;/]|\ben\b|\band\b|\bund\b|\bet\b)\s*(?:[A-Za-z]{1,6}\d{4,12}|\d{5,12}))*)/gi
  )) {
    const chunk = m[1];
    const base = m.index + m[0].indexOf(chunk);
    for (const tm of chunk.matchAll(/\b([A-Za-z]{1,6}\d{4,12}|\d{5,12})\b/g)) {
      pushAt(base + tm.index, tm[1]);
    }
  }

  // Leading list the client predicates as the accounts. A bare pair is not enough.
  // "000000 en 000000. Maar beide instant funding 100K dus dat zal niet uit maken."
  const lead = raw.match(
    /^\s*((?:\d{5,12})(?:\s*(?:[,;/]|&|\ben\b|\band\b|\bund\b|\bet\b)\s*(?:\d{5,12}))+)/i
  );
  if (lead) {
    const rest = raw.slice(lead.index + lead[0].length);
    const predicated =
      /\b(?:beide|allebei|both(?:\s+of\s+them)?|all of them)\b[\s\S]{0,80}\b(?:instant\s+funding|funding|accounts?|rekeningen?|challenges?|logins?)\b/i.test(rest);
    if (predicated) {
      const chunk = lead[1];
      const base = lead.index + lead[0].indexOf(chunk);
      for (const tm of chunk.matchAll(/\b(\d{5,12})\b/g)) {
        pushAt(base + tm.index, tm[1]);
      }
    }
  }

  hits.sort((a, b) => a.index - b.index || 0);
  const out = [];
  const seen = new Set();
  for (const h of hits) {
    if (seen.has(h.token)) continue;
    seen.add(h.token);
    out.push(h.token);
  }
  return out;
}

function uniquePreserve(list) {
  const out = [];
  const seen = new Set();
  for (const x of list || []) {
    const t = String(x || '');
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function tokenAppearsIn(msg, token) {
  const t = String(token || '');
  const s = String(msg || '');
  if (!t || !s) return false;
  try {
    const re = new RegExp('(?:^|[^A-Za-z0-9])' + escapeRe(t) + '(?:[^A-Za-z0-9]|$)', 'i');
    return re.test(s);
  } catch (_) {
    return s.includes(t);
  }
}

/** Public order is (token, text), matching the other candidate helpers. */
function candidateAppearsExact(token, text) {
  return tokenAppearsIn(text, token);
}

function lastAppearanceIndex(fullText, token) {
  const s = String(fullText || '');
  const t = String(token || '');
  if (!t) return -1;
  // Prefer last whole-token-ish index
  let idx = s.toLowerCase().lastIndexOf(t.toLowerCase());
  return idx;
}

function reverseChronological(tokens, fullText) {
  return uniquePreserve(tokens).slice().sort((a, b) => {
    return lastAppearanceIndex(fullText, b) - lastAppearanceIndex(fullText, a);
  });
}

/**
 * A client message whose only content is an account token (optional light wrapper).
 * "000000" and "It's 000000" qualify. "00000 scalp" and "my balance is 00000" do not.
 * Negative context and challenge sizes still reject the token.
 */
function directAccountReplyTokens(text) {
  const raw = String(text || '').replace(/[\u3000\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const stripped = raw
    .replace(
      /^(?:(?:it(?:'s| is)|this is|that(?:'s| is)|here(?:'s| is)?|my account(?: number)?(?: is)?|account(?: number)?(?: is)?|number(?: is)?|#)\s+)+/i,
      ''
    )
    .replace(/[.!\s]+$/g, '')
    .trim();
  const compact = stripped.replace(/\s+/g, '');
  if (/^(?:[A-Za-z]{1,6}\d{4,12}|\d{5,12})$/.test(compact)) {
    if (!tokenAppearsIn(raw, compact)) return [];
    if (isBlockedNoise(compact, raw)) return [];
    return [compact];
  }
  // A reply that is only a list of account tokens ("000000 en 000000"), nothing else.
  const listOnly = stripped.match(
    /^((?:\d{5,12})(?:\s*(?:[,;/]|&|\ben\b|\band\b|\bund\b|\bet\b)\s*(?:\d{5,12}))+)$/i
  );
  if (!listOnly) return [];
  const toks = [];
  for (const tm of listOnly[1].matchAll(/\b(\d{5,12})\b/g)) {
    if (!tokenAppearsIn(raw, tm[1])) continue;
    if (isBlockedNoise(tm[1], raw)) continue;
    if (!toks.includes(tm[1])) toks.push(tm[1]);
  }
  return toks.length > 1 ? toks : [];
}

/**
 * Flat transcript (tests and gates that have no speaker roles).
 * An account-number ask opens the window; the following number-only replies are
 * proven until a message that is neither an ask nor a number-only reply.
 */
function provenDirectReplyTokens(messages, isAccountAsk) {
  const askFn = typeof isAccountAsk === 'function' ? isAccountAsk : () => false;
  const proven = [];
  let open = false;
  for (const msg of messages || []) {
    const t = String(msg || '');
    if (askFn(t)) {
      open = true;
      continue;
    }
    if (!open) continue;
    const tokens = directAccountReplyTokens(t);
    if (tokens.length) {
      for (const tok of tokens) if (!proven.includes(tok)) proven.push(tok);
      continue;
    }
    if (t.trim()) open = false;
  }
  return proven;
}

function rankAccountCandidates(rawTokens, fullText, opts) {
  const options = opts && typeof opts === 'object' ? opts : {};
  const messageTexts = Array.isArray(options.messageTexts) ? options.messageTexts : null;
  const text = String(fullText ?? '');
  const provenSet = new Set(
    (Array.isArray(options.provenTokens) ? options.provenTokens : []).map((t) => String(t || ''))
  );
  const filtered = uniquePreserve(rawTokens || []).filter((t) => {
    if (messageTexts && messageTexts.length) {
      const hosts = messageTexts.filter((m) => tokenAppearsIn(m, t));
      if (!hosts.length) return tokenAppearsIn(text, t) && !isBlockedNoise(t, text);
      // A number is noise only when every message that contains it rejects it.
      // The previous message must not relabel a later direct reply.
      return !hosts.every((m) => isBlockedNoise(t, m));
    }
    return !isBlockedNoise(t, text) && tokenAppearsIn(text, t);
  });

  // 2) Prefer explicit mentions (latest message with explicit wins)
  let explicit = [];
  if (messageTexts && messageTexts.length) {
    for (let i = messageTexts.length - 1; i >= 0; i--) {
      const mentions = extractExplicitAccountMentions(messageTexts[i]).filter(
        (t) => !isBlockedNoise(t, messageTexts[i])
      );
      if (mentions.length) {
        explicit = mentions;
        break;
      }
    }
  } else {
    explicit = extractExplicitAccountMentions(text).filter((t) => !isBlockedNoise(t, text));
  }

  if (!explicit.length) {
    // Labeled forms the mention regex misses ("acct 00000", "login id 000000") are still
    // account-specific context. A bare number is not.
    explicit = filtered.filter((t) => {
      if (messageTexts && messageTexts.length) {
        return messageTexts.some((m) => tokenAppearsIn(m, t) && hasExplicitAccountContext(t, m));
      }
      return hasExplicitAccountContext(t, text);
    });
  }

  if (explicit.length) {
    const all = uniquePreserve(explicit);
    return { primary: all[0] || '', all };
  }

  // Unlabeled digits are accepted only with ask provenance (provenTokens).
  const provenFiltered = filtered.filter((t) => provenSet.has(String(t)));
  if (!provenFiltered.length) return { primary: '', all: [] };

  // 3) Else prefer tokens from the latest client message that has any valid account token
  if (messageTexts && messageTexts.length) {
    for (let i = messageTexts.length - 1; i >= 0; i--) {
      const msg = messageTexts[i];
      const inMsg = provenFiltered.filter((t) => tokenAppearsIn(msg, t) && !isBlockedNoise(t, msg));
      if (inMsg.length) {
        // Within that message: appearance order in the message (not global first-in-blob).
        // Preferred list is ONLY this latest message's valid tokens (earlier unlabeled drop).
        const orderedInMsg = inMsg.slice().sort(
          (a, b) => lastAppearanceIndex(msg, a) - lastAppearanceIndex(msg, b)
        );
        const all = uniquePreserve(orderedInMsg);
        return { primary: all[0] || '', all };
      }
    }
  }

  // 4) Else remaining proven tokens in reverse chronological appearance
  const all = reverseChronological(provenFiltered, text);
  return { primary: all[0] || '', all };
}

function formatAccountField(all) {
  const list = uniquePreserve(all || []);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  return list.join(', ');
}

// Luna posts as the Arsal seat. Elite AI / Fin is the other bot seat.
// A display name is included so a note still counts as derived if the id was stripped.
const DERIVED_ACCOUNT_AUTHOR_IDS = new Set(['10118526', '8052954']);

function isDerivedAccountAuthor(author, part) {
  const a = author || (part && part.author) || {};
  const type = String(a.type || (part && part.author_type) || '').toLowerCase();
  const id = String(a.id != null ? a.id : (part && part.author_id) || '');
  const name = String(a.name || (part && part.author_name) || '');
  const role = String((part && part.role) || '').toLowerCase();
  if (type === 'bot') return true;
  if (id && DERIVED_ACCOUNT_AUTHOR_IDS.has(id)) return true;
  if (/^\s*luna\b/i.test(name) || /\belite\s*ai\b/i.test(name) || /^\s*fin\b/i.test(name)) return true;
  if (/^\s*arsal\s*-\s*manager\b/i.test(name)) return true;
  if (role === 'bot' || role === 'luna' || role === 'assistant' || role === 'ai') return true;
  return false;
}

// Keys that explicitly mean a FundedElite trading account. A generic number is not one of these.
const STRUCTURED_TRADING_ACCOUNT_KEYS = [
  'trading_account',
  'trading_account_number',
  'tradingAccount',
  'tradingAccountNumber',
  'fundedelite_account',
  'fundedelite_account_number',
  'fundedEliteAccount',
  'fundedEliteAccountNumber',
];

function collectStructuredTradingAccounts(conversation, bits) {
  const out = [];
  const take = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    const bags = [obj];
    if (obj.custom_attributes && typeof obj.custom_attributes === 'object') bags.push(obj.custom_attributes);
    for (const bag of bags) {
      for (const key of STRUCTURED_TRADING_ACCOUNT_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(bag, key)) continue;
        const t = normalizeAccountToken(bag[key]);
        if (!/^(?:[A-Za-z]{1,6}\d{4,12}|\d{5,12})$/.test(t)) continue;
        if (isChallengeSize(t) || YEAR_RE.test(t) || REPEAT_DIGIT_RE.test(t)) continue;
        if (!out.includes(t)) out.push(t);
      }
    }
  };
  take(bits);
  take(conversation);
  const contacts = conversation && conversation.contacts && conversation.contacts.contacts;
  if (Array.isArray(contacts)) {
    for (const c of contacts) take(c);
  }
  return out;
}

/**
 * Staff identification, not client chat. Requires a real label ("Account:", "account number is"),
 * not a passing "account 000000" mention. Luna/bot text must not be passed here.
 */
function extractAuthoritativeAccountStatements(text) {
  const raw = String(text || '');
  if (!raw.trim()) return [];
  const hits = [];
  const push = (token) => {
    const t = normalizeAccountToken(token);
    if (!/^(?:[A-Za-z]{1,6}\d{4,12}|\d{5,12})$/.test(t)) return;
    if (!hits.includes(t)) hits.push(t);
  };
  const labeled = /\b(?:trading\s+)?accounts?\s*(?:number|no\.?|#|id)?\s*:\s*((?:[A-Za-z]{1,6}\d{4,12}|\d{5,12})(?:\s*[,;/]?\s*(?:[A-Za-z]{1,6}\d{4,12}|\d{5,12}))*)/gi;
  for (const m of raw.matchAll(labeled)) {
    for (const tm of String(m[1] || '').matchAll(/\b([A-Za-z]{1,6}\d{4,12}|\d{5,12})\b/g)) push(tm[1]);
  }
  for (const m of raw.matchAll(
    /\b(?:trading\s+)?account\s*(?:number|no\.?|#|id)\s*(?:is|=|:)\s*([A-Za-z]{1,6}\d{4,12}|\d{5,12})\b/gi
  )) {
    push(m[1]);
  }
  for (const m of raw.matchAll(
    /\b(?:trading\s+)?account\s+is\s*([A-Za-z]{1,6}\d{4,12}|\d{5,12})\b/gi
  )) {
    push(m[1]);
  }
  for (const m of raw.matchAll(
    /\b([A-Za-z]{1,6}\d{4,12}|\d{5,12})\s+is\s+(?:my\s+|the\s+|our\s+)?(?:trading\s+)?account(?:\s*(?:number|no\.?|#|id))?\b/gi
  )) {
    push(m[1]);
  }
  for (const m of raw.matchAll(
    /\b(?:login|mt5|tradelocker)\s*(?:id|account|number|no\.?)?\s*(?:is|=|:)\s*([A-Za-z]{1,6}\d{4,12}|\d{5,12})\b/gi
  )) {
    push(m[1]);
  }
  return hits;
}

/**
 * Original provenance only. A Luna/bot note, reply, or summary is not a source;
 * callers must omit those texts. Highest tier wins:
 * structured trading-account field, client explicit statement, direct reply to an
 * account-number ask, then a human authoritative statement.
 */
function selectProvenAccounts(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const clientTexts = Array.isArray(o.clientTexts) ? o.clientTexts.map((t) => String(t || '')) : [];
  const provenTokens = Array.isArray(o.provenTokens) ? o.provenTokens : [];
  const structuredTokens = Array.isArray(o.structuredTokens) ? o.structuredTokens : [];
  const humanTexts = Array.isArray(o.humanTexts) ? o.humanTexts : [];

  // Judge each client message on its own. Joining them makes the previous
  // sentence's last word ("payout") look like it labels the next message's number.
  const hostsOf = (token) => clientTexts.filter((t) => tokenAppearsIn(t, token));
  const rejectedByClient = (token) => {
    const hosts = hostsOf(token);
    if (!hosts.length) return false;
    if (hosts.some((t) => hasExplicitAccountContext(token, t))) return false;
    return hosts.every((t) => isNegativeAccountContext(token, t) || isBlockedNoise(token, t));
  };

  const structured = [];
  for (const raw of structuredTokens) {
    const t = normalizeAccountToken(raw);
    if (!/^(?:[A-Za-z]{1,6}\d{4,12}|\d{5,12})$/.test(t)) continue;
    if (rejectedByClient(t)) continue;
    if (isChallengeSize(t) || YEAR_RE.test(t) || REPEAT_DIGIT_RE.test(t)) continue;
    if (!structured.includes(t)) structured.push(t);
  }

  let explicit = [];
  for (let i = clientTexts.length - 1; i >= 0; i--) {
    const mentions = extractExplicitAccountMentions(clientTexts[i]).filter(
      (t) => !isBlockedNoise(t, clientTexts[i])
    );
    if (mentions.length) {
      explicit = mentions;
      break;
    }
  }

  const proven = [];
  for (const raw of provenTokens) {
    const t = normalizeAccountToken(raw);
    if (!/^(?:[A-Za-z]{1,6}\d{4,12}|\d{5,12})$/.test(t)) continue;
    if (rejectedByClient(t)) continue;
    const host = clientTexts.find((msg) => directAccountReplyTokens(msg).indexOf(t) !== -1);
    if (host && isBlockedNoise(t, host)) continue;
    if (!proven.includes(t)) proven.push(t);
  }

  let human = [];
  for (let i = humanTexts.length - 1; i >= 0; i--) {
    const text = String(humanTexts[i] || '');
    const hits = extractAuthoritativeAccountStatements(text).filter((t) => {
      if (rejectedByClient(t)) return false;
      if (isBlockedNoise(t, text) && !hasExplicitAccountContext(t, text)) return false;
      return true;
    });
    if (hits.length) {
      human = hits;
      break;
    }
  }

  let chosen = [];
  let tier = '';
  if (structured.length) {
    chosen = structured;
    tier = 'structured';
  } else if (explicit.length) {
    chosen = explicit;
    tier = 'client_explicit';
  } else if (proven.length) {
    // A single reply that lists several accounts keeps every token from that reply.
    // A later one-token reply still replaces an earlier unlabeled number.
    let host = '';
    for (let i = clientTexts.length - 1; i >= 0; i--) {
      if (directAccountReplyTokens(clientTexts[i]).length) {
        host = clientTexts[i];
        break;
      }
    }
    const inHost = host
      ? proven.filter((t) => directAccountReplyTokens(host).indexOf(t) !== -1)
      : [];
    chosen = inHost.length ? inHost : [proven[proven.length - 1]];
    tier = 'direct_reply';
  } else if (human.length) {
    chosen = human;
    tier = 'human_structured';
  }
  const all = uniquePreserve(chosen);
  return { primary: all[0] || '', all, tier };
}

module.exports = {
  stripIpv4,
  isChallengeSize,
  isIpDerived,
  isBlockedNoise,
  isMoneyDerived,
  isPhoneDerived,
  hasExplicitAccountContext,
  isNegativeAccountContext,
  clientContextRejects,
  candidateAppearsExact,
  directAccountReplyTokens,
  provenDirectReplyTokens,
  extractExplicitAccountMentions,
  extractAuthoritativeAccountStatements,
  isDerivedAccountAuthor,
  collectStructuredTradingAccounts,
  selectProvenAccounts,
  rankAccountCandidates,
  formatAccountField,
  CHALLENGE_SIZES,
  DERIVED_ACCOUNT_AUTHOR_IDS,
  STRUCTURED_TRADING_ACCOUNT_KEYS,
};
