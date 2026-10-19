'use strict';

const { compactAccountChallengeSizes } = require('./accountSizeFormat');
const publicReplyStructure = require('./publicReplyStructure');

/**
 * publicResponseContract.js — ONE authoritative public-reply quality layer.
 *
 * Every customer-facing path (FAST, FULL, tools, regen, ESCALATE→REPLY, duplicate
 * retry, forced FAQ, fallback) must run drafts through applyPublicResponseContract
 * before send. This module does NOT invent a second style system: it centralises
 * the formatting / leak / spacing rules that already lived in index.js
 * postProcessModelReply, so call sites cannot drift apart.
 *
 * Content/policy rules (no unsupported numbers, no unnecessary account asks, answer
 * all questions, no third-person restatement) remain enforced by the presend gate
 * + knowledge-answerable predicates. validatePublicAnswer is that content check.
 * applyPublicResponseContract stays formatting-only and must not blank a
 * restatement; presend and the send boundary refuse it before it is posted.
 *
 * List / option formatting (Arsal): mobile-readable sequence with consistent
 * label → price/value → qualifier → discount/status structure. Formatting only —
 * never invents, drops, or changes factual numbers/names/rules.
 */

function ensureCustomerReplySpacing(text) {
  let t = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!t) return '';
  const lines = t.split('\n');
  const out = [];
  const isBlank = (s) => !String(s || '').trim();
  const isBullet = (s) => /^\s*(?:[-*•]|<\s*li[\s>]|<\/\s*li\s*>)/i.test(s) || /^\s*\d+[.)]\s+/.test(s);
  const isHeading = (s) => /\[\[[^\]]+\]\]/.test(s) || /^\s*<b>.*<\/b>\s*$/i.test(s);
  for (let i = 0; i < lines.length; i += 1) {
    const cur = lines[i];
    const prev = out.length ? out[out.length - 1] : '';
    if (isBlank(cur)) {
      if (out.length && !isBlank(prev)) out.push('');
      continue;
    }
    if (out.length && !isBlank(prev)) {
      const bothBullets = isBullet(prev) && isBullet(cur);
      if (!bothBullets && (isHeading(cur) || (!isBullet(prev) && !isBullet(cur) && !isHeading(prev)))) {
        if (!isBlank(prev)) out.push('');
      }
    }
    out.push(cur.replace(/[ \t]+$/g, ''));
  }
  while (out.length && isBlank(out[out.length - 1])) out.pop();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function ensureSectionGaps(text) {
  let t = String(text || '').replace(/\r\n/g, '\n');
  // One blank line before each <b>heading</b> / [[Heading]] block (except the first).
  t = t.replace(/([^\n])\n(\[\[.+?\]\])/g, '$1\n\n$2');
  t = t.replace(/([^\n])\n(<b>[^<]+<\/b>)/gi, '$1\n\n$2');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

function stripDuplicateParagraphs(text) {
  const parts = String(text || '').split(/\n{2,}/);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const key = p.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p.trim());
  }
  return out.join('\n\n').trim();
}

function stripActionLeak(text) {
  let t = String(text || '');
  t = t.replace(/^\s*ACTION\s*:\s*(?:REPLY|ESCALATE|CLOSE|SKIP)\s*$/gim, '');
  t = t.replace(/^\s*BODY\s*:\s*/gim, '');
  t = t.replace(/^\s*KIND\s*:\s*\S+\s*$/gim, '');
  t = t.replace(/^\s*CLIENT\s*:\s*/gim, '');
  t = t.replace(/^\s*ACTION\s+NEEDED\s*:\s*/gim, '');
  return t.trim();
}

/* ─── Mobile list / option formatting (formatting-only) ─── */

const BULLET_LINE_RE = /^\s*(?:[-*•●▪]|\d+[.)])\s+/;
const OPTION_HINT_RE = /(?:\$\d|\d+(?:\.\d+)?\s*%|\b(?:account|accounts|each|total|off|day|days|phase|step|option|tier|size|payout|challenge|lite|instant|elite|profit|loss|drawdown)\b)/i;
const PRICE_RE = /\$\d[\d,]*(?:\.\d+)?/;
const PCT_OFF_RE = /(\d+(?:\.\d+)?)\s*%\s*off/i;
const SELECTED_RE = /^\s*(?:\*\*|<_?b>)?\s*(Selected|Current|Your\s+pick|Chosen)\s*:\s*(?:\*\*|<\/b>)?\s*/i;

function stripInlineBold(s) {
  return String(s || '').replace(/\*\*/g, '').replace(/<\/?b>/gi, '').trim();
}

function boldImportantTokens(s) {
  let t = String(s || '');
  const slots = [];
  t = t.replace(/\*\*([^*]+)\*\*/g, (m) => {
    slots.push(m);
    return '\0B' + (slots.length - 1) + '\0';
  });
  // BOLD_CURRENCY_WHOLE_TOKEN_V1 (live 215476080792109): bold $25k / $25.5k / $25,000 as ONE
  // token. Never match $25 inside $25k (produced <b>$25</b>k). Protect new spans before
  // bare-$ fallback so we do not nest bold markers.
  // Millions stay one token too: "$1M", "$1 million" (was "**$1**M" / "**$1** million").
  t = t.replace(/(\$\d[\d,]*(?:\.\d+)?\s?(?:m\b|million\b|mn\b))/gi, (m) => {
    slots.push('**' + m + '**');
    return '\0B' + (slots.length - 1) + '\0';
  });
  t = t.replace(/(\$\d[\d,]*(?:\.\d+)?k)\b/gi, (m) => {
    slots.push('**' + m + '**');
    return '\0B' + (slots.length - 1) + '\0';
  });
  t = t.replace(/(\$\d{1,3}(?:,\d{3})+(?:\.\d+)?)\b/g, (m) => {
    slots.push('**' + m + '**');
    return '\0B' + (slots.length - 1) + '\0';
  });
  t = t.replace(/(\$\d+(?:\.\d+)?)(?![k\d,])/gi, (m) => {
    slots.push('**' + m + '**');
    return '\0B' + (slots.length - 1) + '\0';
  });
  t = t.replace(/(\d+(?:\.\d+)?\s*%(?:\s*off)?)/gi, (m) => {
    slots.push('**' + m.replace(/\s+/g, ' ') + '**');
    return '\0B' + (slots.length - 1) + '\0';
  });
  t = t.replace(/\0B(\d+)\0/g, (_, i) => slots[Number(i)]);
  // Collapse only truly empty markers, never merge adjacent bold spans
  t = t.replace(/\*\*\*\*/g, '**');
  return t;
}

function normalizeBulletMarkers(text) {
  return String(text || '').replace(/^[ \t]*[-*•●▪]\s+/gm, '• ');
}

/**
 * Split a dense multi-option paragraph into one-option-per-bullet lines.
 * Only fires when parallel option labels are clearly present — never invents content.
 */
function splitDenseOptionParagraphs(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || BULLET_LINE_RE.test(trimmed) || /^\s*<b>.*<\/b>\s*$/i.test(trimmed) || /^\[\[/.test(trimmed)) {
      out.push(line);
      continue;
    }
    const headed = trimmed.match(/^(Available\s+options|Options|Pricing|Account\s+sizes?|Payout\s+options?|Choices|Tiers?|Sizes?|Plans?)\s*:\s*(.+)$/i);
    if (headed && OPTION_HINT_RE.test(headed[2]) && /(?:\d+\s*accounts?|\$\d)/i.test(headed[2])) {
      out.push('**' + headed[1].trim() + '**');
      out.push('');
      const parts = splitOptionChunks(headed[2]);
      if (parts.length >= 2) {
        for (const p of parts) out.push('• ' + p.trim());
        continue;
      }
      out.push(line);
      continue;
    }
    if (!BULLET_LINE_RE.test(trimmed) && /(?:\d+\s*accounts?)/i.test(trimmed)) {
      const parts = splitOptionChunks(trimmed);
      if (parts.length >= 2 && parts.every((p) => OPTION_HINT_RE.test(p))) {
        for (const p of parts) out.push('• ' + p.trim());
        continue;
      }
    }
    if (!BULLET_LINE_RE.test(trimmed) && /(?:\d+\s*k\s*[=:]|\d+k\s*[=:])/i.test(trimmed) && (trimmed.match(/%/g) || []).length >= 2) {
      const parts = splitOptionChunks(trimmed);
      if (parts.length >= 2) {
        for (const p of parts) out.push('• ' + p.trim());
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

function splitOptionChunks(s) {
  const raw = String(s || '').trim();
  if (!raw) return [];
  let parts = raw.split(/\s*[;|]\s*|\s*[•●]\s+/);
  if (parts.length < 2) {
    parts = raw.split(/\s*,\s*(?=(?:\d+\s*accounts?|\d+\s*k\b|\d+k\b|\*\*\d|\d+\s*day))/i);
  }
  if (parts.length < 2) {
    parts = raw.split(/(?=(?:(?:\d+\s*accounts?)|(?:\d+\s*k\b)|(?:\d+k\b))\s*[:=])/i);
  }
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Parse one option/bullet line into structured parts.
 * Returns null if it does not look like a structured option line.
 */
function parseOptionLine(line) {
  let body = String(line || '').replace(/^\s*(?:[-*•●▪]|\d+[.)])\s+/, '').trim();
  if (!body) return null;

  let selected = false;
  if (SELECTED_RE.test(body)) {
    selected = true;
    body = body.replace(SELECTED_RE, '').trim();
  }

  const plain = stripInlineBold(body);
  if (!OPTION_HINT_RE.test(plain) && !selected) return null;
  // PROSE_NOT_OPTION_V1 (2026-09-24): this parser rewrites PRICE option lines ("50k: $299 each (35% off)")
  // and strips a leading "at", moves "each" to the end, drops "with". Applied to a rule sentence it
  // corrupted correct text ("At least 4 profitable days" -> "least 4 ..."; "Each approved payout
  // doubles ..." -> "... up to $1 million. each"). A value that is prose is not an option line.
  {
    const afterLabel = plain.replace(/^(?:[^:]|\d:\d){1,48}?(?<!\d):(?!\d)\s*/, '');
    const words = afterLabel.split(/\s+/).filter(Boolean).length;
    if (!selected && (words > 8 || /[.!?]\s+[A-Z]/.test(afterLabel))) return null;
  }

  let label = '';
  let rest = plain;

  // HYPHEN_NAME_SAFE_V1 (2026-09-28): a digit:digit colon ("1:30" leverage, times) is not a label separator.
  const colon = plain.match(/^((?:[^:]|\d:\d)+?)\s*(?<!\d):(?!\d)\s*(.+)$/);
  if (colon && colon[1].length <= 48) {
    label = colon[1].trim();
    rest = colon[2].trim();
  } else {
    // HYPHEN_NAME_SAFE_V1 (2026-09-28): only a SPACED hyphen (" - ") or an en/em dash separates a label.
    // The old /[^-]+?\s*-\s*/ split official names: "1-Step + Free Retry" -> "**1:** Step + Free Retry".
    const dash = plain.match(/^([^–—]+?)(?:\s+-\s+|\s*[–—]\s*)(.+)$/);
    if (
      dash &&
      dash[1].trim().length <= 40 &&
      !PRICE_RE.test(dash[1]) &&
      /(?:account|day|phase|step|k\b|lite|instant|elite|standard|challenge|option|tier|size|payout|\d)/i.test(dash[1])
    ) {
      label = dash[1].trim();
      rest = dash[2].trim();
    } else {
      const lead = plain.match(/^(\d+\s*accounts?|\d+\s*k\b|\d+k\b)\s*(?:=\s*|:|\s+)(.+)$/i)
        || plain.match(/^([A-Za-z][A-Za-z0-9 +/&-]{0,32}?)\s*(?:=\s*|:)(.+)$/i);
      const leadIsOption = lead && (PRICE_RE.test(lead[2]) || /\d+\s*%/.test(lead[2]) || /\b(?:account|day|phase|step)s?\b/i.test(lead[1]));
      if (lead && leadIsOption && OPTION_HINT_RE.test(lead[2]) && lead[1].trim().length <= 32) {
        label = lead[1].trim();
        rest = lead[2].replace(/^=\s*/, '').trim();
      } else if (selected) {
        label = '';
        rest = plain;
      } else {
        return null;
      }
    }
  }

  let discount = '';
  const mOff = rest.match(PCT_OFF_RE);
  if (mOff) {
    discount = mOff[1] + '% off';
    rest = rest.replace(/(?:with\s+)?\(?\s*\d+(?:\.\d+)?\s*%\s*off\s*\)?/gi, '').trim();
  }

  let qualifier = '';
  const eachPrice = /\bper\s+account\b/i.test(rest) || (/\$\d/.test(rest) && /\beach\b/i.test(rest) && !/\beach\s+account\b/i.test(rest));
  if (eachPrice) {
    qualifier = 'each';
    rest = rest.replace(/\bper\s+account\b/gi, '').replace(/\beach\b/gi, '').trim();
  } else if (/\btotal\b/i.test(rest) && /\$\d/.test(rest) && rest.length < 80) {
    qualifier = 'total';
    rest = rest.replace(/\btotal\b/gi, '').trim();
  }

  rest = rest.replace(/\s*[–—,;|/]+\s*$/g, '').replace(/^\s*[–—,;|/]+\s*/g, '').replace(/\s{2,}/g, ' ').trim();
  rest = rest.replace(/\bwith\s*$/i, '').replace(/^\s*with\s+/i, '').trim();
  rest = rest.replace(/^\s*at\s+(?!least\b|most\b)/i, '').replace(/\bat\s*$/i, '').trim();
  rest = rest.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();

  return { label, value: rest, qualifier, discount, selected };
}

function chooseListQualifierMode(parsedItems) {
  let each = 0;
  let total = 0;
  for (const it of parsedItems) {
    if (!it) continue;
    if (it.qualifier === 'each') each += 1;
    if (it.qualifier === 'total') total += 1;
  }
  if (each === 0 && total === 0) return 'none';
  if (total > each) return 'total';
  if (each > 0) return 'each';
  return 'total';
}

function emitOptionLine(it, qualifierMode) {
  if (!it) return null;
  let q = it.qualifier;
  // Never rewrite total↔each across lines in a way that changes meaning.
  // Mode only unifies "per account"→"each" (already done at parse) and keeps one discount phrasing.
  if (qualifierMode === 'each' && q === 'each') q = 'each';

  const label = stripInlineBold(it.label || '');
  const value = stripInlineBold(it.value || '');
  const discount = stripInlineBold(it.discount || '');

  let core = '';
  if (label) {
    core = '**' + label + ':**';
    if (value) core += ' ' + value;
  } else if (value) {
    core = value;
  }
  if (q === 'each' && value && !/\beach\b/i.test(core)) core += ' each';
  if (q === 'total' && value && !/\btotal\b/i.test(core)) core += ' total';
  if (discount) {
    // Avoid " **50k:** - **35% off**" when there is no mid-value.
    const bareLabel = label && !value;
    core += (bareLabel ? ' **' : ' - **') + discount + '**';
  }

  // Structured option lines already bold label + discount. Leave mid prices
  // unbolded (Arsal example pattern) so mobile lines stay scannable.
  return '• ' + core.replace(/\s{2,}/g, ' ').trim();
}

function normalizeSingleBullet(line) {
  const raw = String(line || '');
  if (/^\s*\d+[.)]\s+/.test(raw)) {
    const m = raw.trim().match(/^(\d+[.)]\s+)(.*)$/);
    // DRAFT_EMPHASIS_PRESERVE_V1 (2026-09-28): keep the model's own bold; never auto-bold every figure.
    if (m) return m[1] + m[2];
    return raw.trim();
  }
  let body = raw.replace(/^\s*[-*•●▪]\s+/, '• ');
  const m = body.match(/^•\s+(?:\*\*)?((?:[^:*]|\d:\d)+?)(?:\*\*\s*:|:\*\*|(?<!\d):(?!\d))\s*(.+)$/);
  if (m && m[1].trim().length <= 48) {
    return '• **' + m[1].trim() + ':** ' + m[2].trim();
  }
  return '• ' + body.replace(/^\s*•\s+/, '');
}

// RULE_BULLET_VERBATIM_V1 (2026-09-28, REPLY_DESIGN_V1): the option-line rewriter (emitOptionLine) exists for PRICE /
// discount lists ("50k: $299 each (35% off)"). A labelled RULE bullet with a short value also parsed as an "option", so
// it was re-emitted with the model's bold stripped and "at"/"each" moved: "• **Live phase:** At least 3 trading days"
// became "least 3 trading days", "Fixed at **3%**" lost its one critical-value bold. Only a price or discount line is
// an option line now; every other bullet keeps its text and emphasis (normalizeSingleBullet only bolds the label).
function isPriceOptionItem(it) {
  return !!(it && (it.discount || PRICE_RE.test(it.value || '') || PRICE_RE.test(it.label || '')));
}

/** Bold a rule bullet's label and keep the rest of the line exactly as written (text and emphasis). */
function labelledVerbatim(raw, label) {
  const body = String(raw || '').replace(/^\s*(?:[-*\u2022\u25cf\u25aa]|\d+[.)])\s+/, '');
  const esc = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  if (!esc) return null;
  const m = body.match(new RegExp('^(?:\\*\\*)?\\s*' + esc + '\\s*(?:\\*\\*\\s*(?::|\\s-\\s|[\u2013\u2014]|=)|(?::|\\s-\\s|\\s*[\u2013\u2014]|\\s*=)\\s*(?:\\*\\*)?)\\s*([\\s\\S]+)$'));
  if (!m) return null;
  let rest = m[1].trim();
  if (/^\*\*/.test(rest) && ((rest.match(/\*\*/g) || []).length % 2 === 1)) rest = rest.replace(/^\*\*\s*/, '');
  if (!rest) return null;
  return '\u2022 **' + String(label).trim() + ':** ' + rest;
}

function formatListBlock(lines) {
  const parsed = lines.map((ln) => ({ raw: ln, it: parseOptionLine(ln) }));
  const optionish = parsed.filter((p) => p.it && (p.it.label || isPriceOptionItem(p.it)));
  const selectedItems = [];
  const bodyItems = [];

  for (const p of parsed) {
    if (p.it && p.it.selected) selectedItems.push(p);
    else bodyItems.push(p);
  }

  const mode = chooseListQualifierMode(bodyItems.map((p) => p.it).filter(Boolean));
  const out = [];
  const usedStructured = optionish.length >= 2 || (optionish.length === 1 && bodyItems.length === 1 && optionish[0].it && optionish[0].it.discount);

  for (const p of bodyItems) {
    if (usedStructured && isPriceOptionItem(p.it)) {
      const emitted = emitOptionLine(p.it, mode);
      out.push(emitted || normalizeSingleBullet(p.raw));
    } else if (usedStructured && p.it && p.it.label) {
      out.push(labelledVerbatim(p.raw, p.it.label) || normalizeSingleBullet(p.raw));
    } else {
      out.push(normalizeSingleBullet(p.raw));
    }
  }

  for (const p of selectedItems) {
    const emitted = p.it ? emitOptionLine(Object.assign({}, p.it, { selected: false }), mode) : null;
    const inner = emitted ? emitted.replace(/^\s*•\s+/, '') : stripInlineBold(p.raw.replace(BULLET_LINE_RE, ''));
    out.push('');
    out.push('**Selected:** ' + inner);
  }

  return out;
}

function reformatListBlocks(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!BULLET_LINE_RE.test(line.trim())) {
      if (SELECTED_RE.test(line.trim()) && !BULLET_LINE_RE.test(line.trim())) {
        const rest = line.trim().replace(SELECTED_RE, '').trim();
        out.push('**Selected:** ' + boldImportantTokens(stripInlineBold(rest)));
        i += 1;
        continue;
      }
      out.push(line);
      i += 1;
      continue;
    }
    const block = [];
    while (i < lines.length && BULLET_LINE_RE.test(lines[i].trim())) {
      block.push(lines[i]);
      i += 1;
    }
    let j = i;
    while (j < lines.length && !lines[j].trim()) j += 1;
    if (j < lines.length && SELECTED_RE.test(lines[j].trim()) && !BULLET_LINE_RE.test(lines[j].trim())) {
      block.push(lines[j]);
      i = j + 1;
    }

    const formatted = formatListBlock(block);
    for (const fl of formatted) {
      if (fl === '') {
        if (out.length && out[out.length - 1] !== '') out.push('');
      } else {
        out.push(fl);
      }
    }
  }
  return out.join('\n');
}

function ensureListSurroundGaps(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  const isBlank = (s) => !String(s || '').trim();
  const isBullet = (s) => BULLET_LINE_RE.test(String(s || '').trim());
  for (let i = 0; i < lines.length; i += 1) {
    const cur = lines[i];
    const prev = out.length ? out[out.length - 1] : null;
    if (isBullet(cur) && prev !== null && !isBlank(prev) && !isBullet(prev)) {
      out.push('');
    }
    if (prev !== null && isBullet(prev) && !isBlank(cur) && !isBullet(cur)) {
      if (!isBlank(out[out.length - 1])) out.push('');
    }
    out.push(cur);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Public list formatter — safe to run on every public reply.
 */
function formatMobileOptionLists(text) {
  let t = String(text || '').replace(/\r\n/g, '\n');
  if (!t.trim()) return t;
  t = normalizeBulletMarkers(t);
  t = splitDenseOptionParagraphs(t);
  t = normalizeBulletMarkers(t);
  t = reformatListBlocks(t);
  t = ensureListSurroundGaps(t);
  return t;
}


/**
 * Insert a space when a currency amount is glued to a preceding word or
 * punctuation (model typography slip: "and$300k" -> "and $300k").
 * Plain-text only; runs before boldKeyFigures / toHtml.
 * Conservative: lowercase letter or ,;:) immediately before $€£; never after
 * space, /, (, -, -, *, quotes; skip URLs and `code` spans.
 */
function ensureCurrencySpacing(text) {
  let t = String(text || '');
  if (!t) return t;
  const slots = [];
  const protect = (re) => {
    t = t.replace(re, (m) => {
      slots.push(m);
      return '\0CS' + (slots.length - 1) + '\0';
    });
  };
  protect(/https?:\/\/[^\s<>\]]+/gi);
  protect(/\bwww\.[^\s<>\]]+/gi);
  protect(/`[^`\n]+`/g);
  // Amount: digits with optional thousands commas / decimal / k suffix.
  const amt = '[$€£]\\d[\\d,]*(?:\\.\\d+)?k?';
  // Lowercase letter glued to currency (and$300k, costs$50). Skips ABC$12.
  t = t.replace(new RegExp('([a-z])(' + amt + ')\\b', 'g'), '$1 $2');
  // Punctuation glued to currency (price:$50).
  t = t.replace(new RegExp('([,;:)])(' + amt + ')\\b', 'g'), '$1 $2');
  t = t.replace(/\0CS(\d+)\0/g, (_, i) => slots[Number(i)]);
  return t;
}

/**
 * Apply the single public-response formatting contract.
 * @param {string} rawText
 * @param {{ conversationId?: string, pickScopeDeclineLine?: Function, softEdgesClean?: Function }} [opts]
 */

/**
 * SECTION_HEADING_NORMALIZE_V1 (live 215476080792109):
 * 09:02:27Z comparison: [[Shared]], ZWSP-only line, [[Main difference]] glued into first <li>.
 * 09:10:16Z multi-topic: "percentage.<b>IP rule</b>" / "trading.<b>Risk rule</b>" glued into <li>.
 * Strip zero-width chars / empty-only lines; peel ANY [[...]] or short bold section heading
 * onto its own line (never leave a heading inside a bullet); normalize Shared → Shared Rules
 * and Main difference → Main Difference. Applies to comparisons AND multi-topic answers.
 */
function normalizeComparisonHeadingMarkers(text) {
  let t = String(text || '').replace(/\r\n/g, '\n');
  if (!t) return t;
  // Zero-width / BOM / soft hyphen
  t = t.replace(/[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/g, '');

  const labelFor = (raw) => {
    const s = String(raw || '').replace(/<\/?b>/gi, '').replace(/\*\*/g, '').trim();
    if (/^shared(?:\s+rules?)?$/i.test(s)) return 'Shared Rules';
    if (/^(?:the\s+)?main\s+differences?$/i.test(s)) return 'Main Differences';
    if (/^same\s+on\s+both$/i.test(s)) return 'Same on Both';
    if (/^current\s+promotions?$/i.test(s)) return 'Current promotion';
    if (/^ip\s+rules?$/i.test(s)) return 'IP rule';
    if (/^risk\s+rules?$/i.test(s)) return 'Risk rule';
    return s;
  };

  const looksLikeSectionHeading = (raw) => {
    const s = String(raw || '').replace(/<\/?b>/gi, '').replace(/\*\*/g, '').trim();
    if (!s || s.length < 2 || s.length > 48) return false;
    if (/[\$%]|\d{2,}/.test(s) && !/^(?:phase|step)\s*\d/i.test(s)) return false;
    if (/[.!?:;]$/.test(s)) return false;
    if (/^(?:shared(?:\s+rules?)?|(?:the\s+)?main\s+differences?|current\s+promotions?|ip\s+rules?|risk\s+rules?)$/i.test(s)) {
      return true;
    }
    // Short title-ish label: 1–6 words, mostly letters (IP rule, Risk rule, Catalyst Challenge, …)
    if (/^[A-Za-z][A-Za-z0-9 +/&-]{0,46}$/.test(s) && s.split(/\s+/).length <= 6) {
      // Avoid peeling mid-sentence product emphasis like "2-Step Lite" alone when very short product names—
      // require heading cues OR Title-ish multi-word / ends with rule|promotion|difference|challenge
      if (/\b(?:rules?|promotions?|difference|overview|summary|notes?)\b/i.test(s)) return true;
      if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(s)) return true; // Title Case 2+ words
      if (/^(?:Shared|Main Differences|Same on Both|Current promotion|IP rule|Risk rule)$/i.test(s)) return true;
    }
    return false;
  };

  // Peel [[Heading]] glued to end of a non-empty line
  t = t.replace(/([^\n\[\]])\s*\[\[\s*([^\]]+?)\s*\]\](?=\s*(?:\n|$))/g, (m, pre, lab) => {
    return pre.replace(/\s+$/, '') + '\n[[' + labelFor(lab) + ']]';
  });
  // Peel [[Heading]] glued at start before more content on same line
  t = t.replace(/(^|\n)\s*\[\[\s*([^\]]+?)\s*\]\]\s*(?=\S)/gm, (m, lead, lab) => {
    return lead + '[[' + labelFor(lab) + ']]\n';
  });
  // BULLET_BOLD_NO_PEEL_V1 (2026-09-28): a trailing bold span is only a glued section heading when it
  // follows a sentence end ("percentage.<b>IP rule</b>"). Bold text that CONTINUES the line
  // ("• **Activation** and **Flash Activation**") is emphasis inside that item and is never split out.
  // Off a bullet line, the canonical section labels (Shared / Main Differences / ...) still peel.
  const CANON_SECTION_RE = /^(?:shared(?:\s+rules?)?|(?:the\s+)?main\s+differences?|same\s+on\s+both|current\s+promotions?|ip\s+rules?|risk\s+rules?)$/i;
  const gluedHeadingContextOk = (m, pre, lab, off, all) => {
    if (/[.!?:]/.test(pre)) return true;
    const lineStart = all.lastIndexOf('\n', off) + 1;
    const lineHead = all.slice(lineStart, off + 1);
    if (/^\s*(?:[-*\u2022\u25cf\u25aa]|\d+[.)])\s+/.test(lineHead)) return false;
    return CANON_SECTION_RE.test(String(lab || '').trim());
  };
  // Peel trailing <b>Section heading</b> glued after prose/bullet (esp. after .!?)
  t = t.replace(/([^\n>])\s*<b>\s*([^<]{2,48}?)\s*<\/b>\s*(?=\n|$)/gi, (m, pre, lab, off, all) => {
    if (!looksLikeSectionHeading(lab)) return m;
    if (!gluedHeadingContextOk(m, pre, lab, off, all)) return m;
    return pre.replace(/\s+$/, '') + '\n[[' + labelFor(lab) + ']]';
  });
  // Peel trailing **Section heading**
  t = t.replace(/([^\n*])\s*\*\*\s*([^*\n]{2,48}?)\s*\*\*\s*(?=\n|$)/g, (m, pre, lab, off, all) => {
    if (!looksLikeSectionHeading(lab)) return m;
    if (!gluedHeadingContextOk(m, pre, lab, off, all)) return m;
    return pre.replace(/\s+$/, '') + '\n[[' + labelFor(lab) + ']]';
  });
  // Normalize standalone [[labels]]
  t = t.replace(/\[\[\s*([^\]]+?)\s*\]\]/g, (m, lab) => '[[' + labelFor(lab) + ']]');
  // Line-only **Shared** / <b>Shared</b> → [[Shared Rules]] (same for Main difference)
  t = t.replace(/^(?:\*\*|<b>)\s*((?:Shared(?:\s+Rules?)?|(?:The\s+)?Main\s+Differences?|Current\s+promotions?|IP\s+rules?|Risk\s+rules?))\s*(?:\*\*|<\/b>)\s*$/gim, (m, lab) => '[[' + labelFor(lab) + ']]');
  // Drop empty-only lines (after ZW strip)
  t = t.split('\n').filter((line) => line.trim().length > 0).join('\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t;
}

/**
 * OFFICIAL_NAME_GUARD_V1 (2026-09-28): the FAQ article 12660006 still uses legacy labels
 * ("Standard Challenge 2 Step (FREE SECOND CHANCE)") and the model echoed them as invented product
 * names ("Standard 2-Step"). Rewrite ONLY that legacy "Standard <n> Step" family to the official
 * "<n>-Step + Free Retry". Never touches Instant Standard, Lite, official names, or the Second
 * Chance feature wording.
 */
const LEGACY_STANDARD_STEP_RE = /(?<!Instant\s)(?<!\*\*Instant\s)\bStandard\s+(?:Challenge\s+)?([12])[\s-]?Step(?:\s+Challenge)?(?:\s*\+\s*Free\s+Retry)?(?:\s*\(\s*(?:free\s+)?second\s+chance\s*\))?/gi;
function normalizeOfficialProductNames(text) {
  return String(text || '').replace(LEGACY_STANDARD_STEP_RE, (m, n) => n + '-Step + Free Retry');
}

function applyPublicResponseContract(rawText, opts) {
  opts = opts || {};
  let text = String(rawText || '');
  text = normalizeOfficialProductNames(text);

  // 1) Scope-decline tag
  if (text.includes('[[SCOPE_DECLINE]]') && typeof opts.pickScopeDeclineLine === 'function') {
    const line = opts.pickScopeDeclineLine(opts.conversationId);
    text = text.split('[[SCOPE_DECLINE]]').join(line).trim();
  }

  // 2) Markdown # headings do not render in Intercom. Bold line instead.
  text = publicReplyStructure.markdownHeadingsToBold(text);

  // 2a0) SECTION_HEADING_NORMALIZE_V1 — peel glued section headings (comparison + multi-topic),
  //      strip ZW lines; normalize Shared/Main labels BEFORE [[→b]].
  text = normalizeComparisonHeadingMarkers(text);

  // 2a) [[Heading]] → <b>Heading</b>
  text = text.replace(/\[\[(.+?)\]\]/g, '<b>$1</b>');

  // 2a2) CURRENCY_SPACING — fix glued currency (and$300k → and $300k) before
  //      list/bold passes so they see a normal "$Nk" token.
  text = ensureCurrencySpacing(text);

  // 2b) Mobile list / option formatting (label → value → qualifier → discount)
  //     before spacing so blank-line rules see final bullet shapes.
  text = formatMobileOptionLists(text);

  // 2c) PUBLIC_REPLY_STRUCTURE_V1 — break walls into headings + bullets.
  //     Facts stay verbatim. A second list pass only bolds/normalizes new bullets.
  text = publicReplyStructure.restructurePublicReply(text);
  // DRAFT_EMPHASIS_PRESERVE_V1 (2026-09-28, Arsal limited-bold rule): no auto-bold of every %/$/day in
  // bullets. Bold is the model's choice (1-2 key items per bullet), the formatter never adds more.
  // text = publicReplyStructure.boldKeyFiguresInBullets(text);

  // 3) Spacing / section gaps / de-dupe identical paragraphs
  text = ensureCustomerReplySpacing(text);
  text = ensureSectionGaps(text);
  text = stripDuplicateParagraphs(text);

  // 4) Never send em/en dashes or bare semicolons to clients (Arsal lock)
  // A bare ',' left the surrounding spaces behind ("Got it , covering both"): take them with it.
  text = text.replace(/[ \t]*\u2014[ \t]*/g, ', ').replace(/,\s*,/g, ',').replace(/\u2013/g, '-');
  text = text.replace(/&([a-zA-Z0-9#]+);/g, '\0ENT$1\0');
  text = text.replace(/;/g, ',');
  text = text.replace(/\0ENT([a-zA-Z0-9#]+)\0/g, '&$1;');

  // 4b) PLATFORM_NAME_PRESERVE_V1 (2026-09-29, ticket 215476138018591):
  // Official FAQ names MetaTrader5 / MetaTrader 5 alongside TradeLocker and MatchTrader.
  // Do NOT rewrite those names to the vague phrase "the trading platform" — that made
  // Luna unable to answer "Besides TradeLocker?" and forced "I can't confirm its specific name."
  // Restricted-country rules still apply in policy/prompt layers; this formatter only preserves
  // legitimate platform names. The locked spread-test template continues to name MetaTrader 5.

  // 5) Never leak ACTION/BODY parser labels
  text = stripActionLeak(text);

  // 6) Optional soft-edges junk strip
  if (typeof opts.softEdgesClean === 'function') {
    const cleaned = opts.softEdgesClean(text);
    if (cleaned === null) return '';
    text = cleaned;
  }

  // 7) ACCOUNT_SIZE_K_FORMAT_V1 — compact account/challenge sizes only ($200,000 → $200k).
  //    Never compact payouts, fees, profits, refunds, or other money amounts.
  try { text = compactAccountChallengeSizes(text); } catch (_) {}

  return String(text || '').trim();
}

/**
 * Content contract for a public reply. Does not modify the text.
 * @param {string} text
 * @param {{ clientText?: string, latestClientText?: string }} [opts]
 * @returns {{ ok: boolean, fail: boolean, code: string|null, reason?: string }}
 */
function validatePublicAnswer(text, opts) {
  opts = opts || {};
  const guard = require('./publicRestatementGuard');
  const result = guard.assess(text, opts.clientText || opts.latestClientText || '');
  return {
    ok: !result.fail,
    fail: !!result.fail,
    code: result.fail ? guard.CODE : null,
    reason: result.reason || '',
  };
}

module.exports = {
  applyPublicResponseContract,
  normalizeComparisonHeadingMarkers,
  boldImportantTokens,
  normalizeOfficialProductNames,
  validatePublicAnswer,
  ensureCustomerReplySpacing,
  ensureCurrencySpacing,
  ensureSectionGaps,
  stripDuplicateParagraphs,
  stripActionLeak,
  formatMobileOptionLists,
  parseOptionLine,
  splitDenseOptionParagraphs,
  compactAccountChallengeSizes,
  publicReplyStructure,
};
