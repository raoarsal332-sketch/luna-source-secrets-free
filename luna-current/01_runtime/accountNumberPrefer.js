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

function isBlockedNoise(token, text) {
  const t = String(token ?? '').replace(/\s+/g, '');
  if (!t) return true;
  if (isChallengeSize(t)) return true;
  if (YEAR_RE.test(t)) return true;
  if (/^\d+$/.test(t) && REPEAT_DIGIT_RE.test(t)) return true;
  if (isIpDerived(t, text)) return true;
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

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function rankAccountCandidates(rawTokens, fullText, opts) {
  const options = opts && typeof opts === 'object' ? opts : {};
  const messageTexts = Array.isArray(options.messageTexts) ? options.messageTexts : null;
  const text = String(fullText ?? '');
  const filtered = uniquePreserve(rawTokens || []).filter((t) => !isBlockedNoise(t, text));

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

  if (explicit.length) {
    const all = uniquePreserve(explicit);
    return { primary: all[0] || '', all };
  }

  // 3) Else prefer tokens from the latest client message that has any valid account token
  if (messageTexts && messageTexts.length) {
    for (let i = messageTexts.length - 1; i >= 0; i--) {
      const msg = messageTexts[i];
      const inMsg = filtered.filter((t) => tokenAppearsIn(msg, t) && !isBlockedNoise(t, msg));
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

  // 4) Else remaining filtered tokens in reverse chronological appearance
  const all = reverseChronological(filtered, text);
  return { primary: all[0] || '', all };
}

function formatAccountField(all) {
  const list = uniquePreserve(all || []);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  return list.join(', ');
}

module.exports = {
  stripIpv4,
  isChallengeSize,
  isIpDerived,
  isBlockedNoise,
  extractExplicitAccountMentions,
  rankAccountCandidates,
  formatAccountField,
  CHALLENGE_SIZES,
};
