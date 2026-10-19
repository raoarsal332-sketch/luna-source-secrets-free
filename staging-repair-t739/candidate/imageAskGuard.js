'use strict';

const accountNumberPrefer = require('./accountNumberPrefer');

/**
 * imageAskGuard.js
 *
 * Per-conversation memory of client images plus an outbound reply filter that
 * stops the "please send the screenshot again" loop (ticket 215475946865995).
 *
 * The guard does not decide routing. It only:
 *   1. remembers that a client image was received / loaded into vision,
 *   2. remembers that the account number was collected,
 *   3. remembers that one specific image clarification was already requested,
 *   4. recognises short acknowledgments ("ok", "sent", "done"),
 *   5. rewrites outbound replies that would (a) ask generically for a screenshot
 *      that already exists, (b) claim an image cannot be seen although vision
 *      loaded it, or (c) ask for a second clarification on the same issue.
 *
 * Integration hooks (installed in index.js by the apply script):
 *   hookA(conversationId, attachments?)   before `let text = ...` (never touches text)
 *   hookB(conversationId, text)           right after `let text = ...`
 *   hookCFromLogArgs(conversationId, ...) right after the `IMAGE_IN ... loaded N/M` log
 *   hookD(conversationId, replyText)      right before the reply is sent
 *   escalationNoteAddendum(conversationId) optional, for the internal note
 *
 * Dependency-free. All hooks are defensive and never throw.
 */

const IMAGE_GUARD_VERSION = 'spread-image-fixes-v1';

const DEFAULTS = {
  // How long a received image counts as "recent" for the open issue.
  imageRecencyMs: 72 * 60 * 60 * 1000,
  // Drop conversation state that has not been touched for this long.
  stateTtlMs: 7 * 24 * 60 * 60 * 1000,
  // Hard cap on tracked conversations (oldest evicted first).
  maxConversations: 5000,
  // Additional image clarification requests allowed once an image exists.
  maxClarifications: 1,
};

const store = new Map();

const PERSIST_FILE = process.env.IMAGE_GUARD_STATE_FILE || '/home/ubuntu/bot-image-guard.json';

function persist() {
  try {
    const out = {};
    for (const [k, v] of store.entries()) out[k] = v;
    require('./atomicJsonFile').writeJsonAtomic(PERSIST_FILE, out, { pretty: false }); // ATOMIC_STATE_V1
  } catch (_) {}
}

function restore() {
  try {
    const raw = JSON.parse(require('fs').readFileSync(PERSIST_FILE, 'utf8'));
    for (const [k, v] of Object.entries(raw || {})) store.set(k, v);
  } catch (_) {}
}
restore();
// A bulk restore bypasses the per-insert counter below entirely, so a persisted file at or
// past maxConversations/stateTtlMs would otherwise sit unpruned until enough new conversations
// trickle in one at a time.
prune();

function now() {
  return Date.now();
}

function newState(conversationId) {
  return {
    conversationId: conversationId === undefined || conversationId === null ? null : String(conversationId),
    issueSeq: 1,
    imagesReceived: 0,
    imagesLoaded: 0,
    lastImageAt: 0,
    accountNumber: null,
    accountCollected: false,
    clarificationsAsked: 0,
    identityAsksForImageIssue: 0,
    lastIdentityAskForImageAt: 0,
    genericAsksBeforeImage: 0,
    lastInboundText: '',
    lastInboundIsShortAck: false,
    turn: 0,
    blockedReplies: 0,
    updatedAt: now(),
  };
}

function prune() {
  const t = now();
  for (const [k, s] of store) {
    if (t - s.updatedAt > DEFAULTS.stateTtlMs) store.delete(k);
  }
  while (store.size > DEFAULTS.maxConversations) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }
}

function keyOf(conversationId) {
  return conversationId === undefined || conversationId === null ? '__no_conversation__' : String(conversationId);
}

let __insertsSincePrune = 0;
function getState(conversationId) {
  const k = keyOf(conversationId);
  let s = store.get(k);
  if (!s) {
    s = newState(conversationId);
    store.set(k, s);
    __insertsSincePrune++;
    // A counter (not `store.size % 100`) so this still fires reliably even if something
    // else ever removes entries out of band (e.g. a targeted reset) between calls.
    if (__insertsSincePrune >= 100 || store.size > DEFAULTS.maxConversations) {
      __insertsSincePrune = 0;
      prune();
    }
  }
  s.updatedAt = now();
  return s;
}

function reset(conversationId) {
  store.delete(keyOf(conversationId));
}

function resetAll() {
  store.clear();
}

// ---------------------------------------------------------------------------
// Text classifiers
// ---------------------------------------------------------------------------

const SHORT_ACK_RE =
  /^(?:ok(?:ay)?|okey|k|kk|done|sent|sent it|i sent it|i have sent it|i've sent it|sent again|resent|re-sent|yes|yes please|yep|yeah|sure|thanks|thank you|thx|ty|attached|here|here you go|here it is|there you go|see above|as above|please check|check now|check again|uploaded|shared|noted|alright|fine|great|good|got it|👍|✅|ok thanks|okay thanks|ok done|done thanks)[.!\s]*$/i;

function isShortAck(text) {
  const t = String(text || '').replace(/\u2019/g, "'").trim();
  if (!t) return false;
  if (t.split(/\s+/).length > 4) return false;
  return SHORT_ACK_RE.test(t);
}

// 5 to 12 digit account numbers (e.g. 000000). Kept in sync with accountNumberPrefer.js /
// identityEscalateGates.js, which also accept up to 12 digits — a narrower range here made
// this module disagree with the rest of the system about whether an 8+ digit account number
// was "known" (accountCollected never set). Excludes anything glued to other digits; noise
// like challenge sizes/years/IPs is still filtered below via accountNumberPrefer.isBlockedNoise.
const ACCOUNT_NUMBER_RE = /(?<!\d)(\d{5,12})(?!\d)/g;

// Reuse the credential-aware extractor rather than keeping a second, laxer parser here:
// this module independently stored a labelled OTP as an account number even after
// statePresend/textUtils was fixed. Loaded defensively so the guard still works standalone.
let __credTextUtils = null;
try { __credTextUtils = require('./statePresend/textUtils'); } catch (_) {
  try { __credTextUtils = require('../statePresend/textUtils'); } catch (_) { __credTextUtils = null; }
}

// Strip values introduced by a credential label so nothing downstream can read or store
// them. Keeps ordinary account wording intact.
const CREDENTIAL_VALUE_RE = /\b(otp|o\.t\.p|one[\s-]?time(?:\s+(?:code|password|pin))?|pin|passcode|password|pass|2fa|mfa|auth(?:entication)?\s+code|verification\s+code|security\s+code|code|token|api[\s-]?key|secret)\b([\s:=-]*(?:is|was|:)?[\s:=-]*)(\S+)/gi;

function stripCredentialValues(text) {
  try {
    return require('./statePresend/credentialSanitizer').sanitizeCredentials(text);
  } catch (_) {
    return String(text || '').replace(CREDENTIAL_VALUE_RE, (m, label, sep) => `${label}${sep}[secret]`);
  }
}

function extractAccountNumber(text) {
  const t = String(text || '');
  if (__credTextUtils && typeof __credTextUtils.extractAccountNumbers === 'function') {
    try {
      const shared = __credTextUtils.extractAccountNumbers(t) || [];
      for (const c of shared) {
        if (!accountNumberPrefer.isBlockedNoise(c, t)) return c;
      }
      // The shared extractor is credential-aware; if it yields nothing, do not fall back to
      // the laxer local scan, or a labelled OTP would be stored again.
      return null;
    } catch (_) { /* fall through to the local scan only if the shared one is unavailable */ }
  }
  const m = t.match(ACCOUNT_NUMBER_RE);
  if (!m) return null;
  // Prefer a number that follows account-ish wording; otherwise the first hit.
  const labelled = t.match(/(?:account|acc|acct|login|id|number|no\.?|#)\D{0,12}(?<!\d)(\d{5,12})(?!\d)/i);
  const candidates = [];
  if (labelled && labelled[1]) candidates.push(labelled[1]);
  for (const hit of m) {
    if (!candidates.includes(hit)) candidates.push(hit);
  }
  for (const c of candidates) {
    if (!accountNumberPrefer.isBlockedNoise(c, t)) return c;
  }
  return null;
}

const IMAGE_WORD = '(?:screenshots?|screen\\s?shots?|screen\\s?grabs?|images?|pictures?|pics?|photos?|attachments?|captures?)';

// Generic "send/resend the screenshot" asks.
const GENERIC_IMAGE_ASK_RES = [
  new RegExp(`\\b(?:send|share|upload|attach|provide|forward|resend|re-send|submit|post|drop)\\b[^.?!\\n]{0,60}?\\b${IMAGE_WORD}\\b`, 'i'),
  new RegExp(`\\b${IMAGE_WORD}\\b[^.?!\\n]{0,40}?\\b(?:again|once more|one more time|another time)\\b`, 'i'),
  new RegExp(`\\b(?:need|require|missing|waiting for|still need)\\b[^.?!\\n]{0,40}?\\b${IMAGE_WORD}\\b`, 'i'),
  new RegExp(`\\b(?:could|can|would)\\s+you\\b[^.?!\\n]{0,40}?\\b${IMAGE_WORD}\\b`, 'i'),
  // Requests addressed to the client that ask for a visual without saying
  // "screenshot": "please send the full dashboard", "could you crop the error banner".
  /\b(?:could|can|would|please|kindly)\s+(?:you\s+)?(?:please\s+)?(?:crop|zoom\s+in(?:to|\s+on)?|send|share|forward|upload)\b[^.?!\n]{0,40}?\b(?:full\s+(?:dashboard|page|screen|window)|dashboard|error\s+(?:banner|message|popup|pop-up|window|dialog)|the\s+part\s+(?:showing|with|where|that)|screen\s+showing|page\s+showing|status\s+section)\b/i,
  // Soft asks that omit a strong send/share verb or invert word order.
  /\b(?:can|could|may)\s+i\s+(?:get|have|see)\b[^.?!\n]{0,40}?\b(?:a\s+|the\s+)?(?:screenshot|screen\s?shot|image|picture|photo|attachment)\b/i,
  /\b(?:a\s+)?(?:screenshot|screen\s?shot|image|picture|photo)\s+please\b/i,
  /\bmind\s+sending\b[^.?!\n]{0,40}?\b(?:a\s+|the\s+)?(?:screenshot|screen\s?shot|image|picture|photo)\b/i,
  /\bplease\s+(?:send|attach|share|upload|provide)\s+(?:me\s+)?(?:a\s+|the\s+|another\s+)?(?:screenshot|screen\s?shot|image|picture|photo)\b/i,
];

// Claims that the image is not visible / accessible / received.
const IMAGE_UNAVAILABLE_RES = [
  new RegExp(`\\b(?:can(?:no|')?t|cannot|can not|unable to|couldn'?t|could not|not able to|don'?t|do not|didn'?t|did not|won'?t|will not)\\s+(?:seem to\\s+)?(?:see|view|open|access|load|find|receive|get|make out|read)\\b[^.?!\\n]{0,40}?\\b${IMAGE_WORD}\\b`, 'i'),
  new RegExp(`\\b${IMAGE_WORD}\\b[^.?!\\n]{0,40}?\\b(?:isn'?t|is not|aren'?t|are not|not|didn'?t|did not|hasn'?t|has not|haven'?t|have not|never)\\s*(?:been\\s+)?(?:visible|showing|showing up|coming through|come through|loading|loaded|attached|received|arrived?|displayed|displaying|accessible|available|appear(?:ing|ed)?)\\b`, 'i'),
  new RegExp(`\\b(?:no|without any|not any)\\s+${IMAGE_WORD}\\s+(?:was |were |has been |have been |came |is |are )?(?:attached|received|found|visible|included|showing|came through)\\b`, 'i'),
  new RegExp(`\\b${IMAGE_WORD}\\b[^.?!\\n]{0,30}?\\b(?:did not|didn'?t|hasn'?t|has not)\\s+(?:come|go|get)\\s+through\\b`, 'i'),
  new RegExp(`\\b(?:not visible|not showing|not accessible)\\b[^.?!\\n]{0,30}?\\b(?:in this chat|in the chat|on my (?:end|side)|here)\\b`, 'i'),
];

// Specificity markers: an image ask that explains exactly what is needed.
const SPECIFIC_MARKER_RE =
  /\b(?:crop|cropped|zoom(?:ed)?\s*in|close[-\s]?up|error (?:message|banner|text|code|popup|pop-up|window|dialog)|exact (?:error|message|text|wording)|status (?:section|area|tab|panel)|full (?:dashboard|page|screen|window)|showing (?:the|your|both)|the part (?:showing|with|where|that)|including (?:the|your)|account number and|together (?:with|in one)|in one (?:screenshot|image|picture)|with the (?:error|status|message|date|time) visible|highlight(?:ing)?|where it says|the (?:top|bottom|left|right) (?:of|part|section))\b/i;


// ---------------------------------------------------------------------------
// Image-explain / vague deictic asks (ticket 215476054921252)
// ---------------------------------------------------------------------------
// When a screenshot is attached (or recently loaded) and the client asks what
// it means / why / check this / what error, Luna must answer from the image +
// KB. These helpers bind the ask to the image and stop the cascade
// image → weak draft → MISSED_QUESTION → FORCE_ESCALATE → account-number ask.

const IMAGE_EXPLAIN_ASK_RE =
  /\b(?:what\s+does\s+(?:this|that|it)\s+mean|what\s+is\s+(?:this|that)|what(?:'?s|\s+is)\s+this(?:\s+meaning)?|explain\s+(?:this|that|me\s+this|the\s+(?:image|screenshot|picture|error))|at\s*least\s+explain|why\s+(?:is\s+)?(?:this|that)|check\s+(?:this|that|the\s+(?:image|screenshot|error))|what\s+error|what(?:'?s|\s+is)\s+(?:wrong|the\s+(?:issue|problem|error))|can\s+you\s+(?:see|read|check|explain)\s+(?:this|that|the\s+(?:image|screenshot))|don'?t\s+you\s+(?:able\s+to\s+)?(?:read|see)|are\s+you\s+(?:able\s+to\s+)?(?:read|see)\s+(?:the\s+)?(?:image|screenshot)|able\s+to\s+read\s+image)\b/i;

const IMAGE_REFUSAL_RE =
  /\b(?:that(?:'?s|\s+is)\s+not\s+something\s+i\s+can\s+help\s+with|i\s+(?:can(?:not|'?t)|am\s+unable\s+to)\s+(?:help\s+with|read|see|open|access|view)\s+(?:that|this|the\s+(?:image|screenshot|attachment|picture))|i\s+(?:don'?t|do\s+not)\s+(?:see|have|receive[d]?)\s+(?:an?\s+)?(?:image|screenshot|attachment)|not\s+(?:able|able\s+to)\s+(?:read|see)\s+(?:the\s+)?(?:image|screenshot))\b/i;

function isImageExplainAsk(text) {
  const t = String(text || '').replace(/\u2019/g, "'").trim();
  if (!t) return false;
  if (t.length > 280) return false;
  return IMAGE_EXPLAIN_ASK_RE.test(t);
}

function isImageRefusal(text) {
  const t = String(text || '').replace(/\u2019/g, "'").replace(/\s+/g, ' ');
  if (!t) return false;
  if (testAny(IMAGE_UNAVAILABLE_RES, t)) return true;
  return IMAGE_REFUSAL_RE.test(t);
}

/**
 * True when a recent/loaded image exists and the latest client text is asking
 * Luna to explain / check / interpret it (or complaining Luna cannot see it).
 * These are answerable from the screenshot + FundedElite KB — not account work.
 */
function isImageAnswerableIssue(conversationId, text) {
  try {
    const s = getState(conversationId);
    if (!hasRecentImage(s)) return false;
    const t = String(text || '');
    if (isImageExplainAsk(t)) return true;
    if (/\b(?:read|see|check|explain)\b/i.test(t) && /\b(?:image|screenshot|picture|this|that)\b/i.test(t)) {
      return true;
    }
    if (!t.trim() || /^\(Client sent an image/i.test(t)) return true;
    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Soft clearer-screenshot ask (not account number). Used when the image is
 * present but unreadable / too cropped. Never asks for account/email.
 */
function clearerScreenshotAsk() {
  return 'Thanks — I can see the screenshot, but a key part is hard to read. Could you send a clearer full-screen capture of the same page, with the error or status text fully visible?';
}

/**
 * Skip identity (account-number) collection when the pending issue is an
 * image-explain ask. Stops the live cascade that asked for account number
 * after Luna failed to answer an answerable screenshot.
 */
function shouldSkipIdentityAskForImage(conversationId, text) {
  try {
    const s = getState(conversationId);
    if (!hasRecentImage(s)) return false;
    if (/\b(?:my\s+(?:payout|withdrawal|login|password|kyc|breach|account\s+(?:is|was|got|has))|payout\s+(?:failed|missing|not\s+eligible)|can(?:not|'?t)\s+log\s*in)\b/i.test(String(text || ''))) {
      return false;
    }
    if (isImageAnswerableIssue(conversationId, text)) return true;
    if (s.identityAsksForImageIssue > 0 && (now() - (s.lastIdentityAskForImageAt || 0)) < 30 * 60 * 1000) {
      return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

function noteIdentityAskForImage(conversationId) {
  try {
    const s = getState(conversationId);
    s.identityAsksForImageIssue = (s.identityAsksForImageIssue || 0) + 1;
    s.lastIdentityAskForImageAt = now();
    persist();
    return s;
  } catch (_) {
    return null;
  }
}

function testAny(res, text) {
  return res.some((re) => re.test(text));
}

/**
 * Classifies a candidate outbound reply.
 * @returns {'IMAGE_UNAVAILABLE'|'SPECIFIC_IMAGE_ASK'|'GENERIC_IMAGE_ASK'|'NONE'}
 */
function classifyReply(replyText) {
  const t = String(replyText || '').replace(/\u2019/g, "'").replace(/\s+/g, ' ');
  if (!t) return 'NONE';
  if (testAny(IMAGE_UNAVAILABLE_RES, t) || IMAGE_REFUSAL_RE.test(t)) return 'IMAGE_UNAVAILABLE';
  if (testAny(GENERIC_IMAGE_ASK_RES, t)) {
    return SPECIFIC_MARKER_RE.test(t) ? 'SPECIFIC_IMAGE_ASK' : 'GENERIC_IMAGE_ASK';
  }
  return 'NONE';
}

function isGenericImageAsk(replyText) {
  return classifyReply(replyText) === 'GENERIC_IMAGE_ASK';
}

function isImageUnavailableClaim(replyText) {
  return classifyReply(replyText) === 'IMAGE_UNAVAILABLE';
}

function isSpecificImageAsk(replyText) {
  return classifyReply(replyText) === 'SPECIFIC_IMAGE_ASK';
}

// ---------------------------------------------------------------------------
// Attachment helpers
// ---------------------------------------------------------------------------

function looksLikeImageAttachment(a) {
  if (!a) return false;
  if (typeof a === 'string') return /\.(?:png|jpe?g|gif|webp|bmp|heic)(?:\?|$)/i.test(a) || /^data:image\//i.test(a);
  const ct = String(a.content_type || a.contentType || a.mime || a.mimetype || a.type || '').toLowerCase();
  if (ct.startsWith('image/') || ct === 'image') return true;
  if (ct === 'upload' && looksLikeImageAttachment(a.url || a.name)) return true;
  const name = String(a.name || a.filename || a.url || a.src || '');
  return /\.(?:png|jpe?g|gif|webp|bmp|heic)(?:\?|$)/i.test(name);
}

function countImageAttachments(attachments) {
  if (typeof attachments === 'number') return Math.max(0, attachments | 0);
  if (!attachments) return 0;
  if (Array.isArray(attachments)) return attachments.filter(looksLikeImageAttachment).length;
  if (typeof attachments === 'object') {
    // Intercom-ish shapes: { attachments: [...] } or { images: [...] }
    if (Array.isArray(attachments.attachments)) return countImageAttachments(attachments.attachments);
    if (Array.isArray(attachments.images)) return attachments.images.length;
  }
  return 0;
}

function hasRecentImage(state) {
  if (!state) return false;
  if (state.imagesLoaded > 0) return true;
  if (state.imagesReceived > 0 && now() - state.lastImageAt <= DEFAULTS.imageRecencyMs) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Hook A. Runs before `let text = ...` in the engine. MUST NOT receive text.
 * Starts a turn and records image attachments of the inbound message.
 */
function hookA(conversationId, attachments) {
  try {
    const s = getState(conversationId);
    s.turn += 1;
    s.lastInboundIsShortAck = false;
    const n = countImageAttachments(attachments);
    if (n > 0) {
      s.imagesReceived += n;
      s.lastImageAt = now();
    }
    return s;
  } catch (_) {
    return null;
  }
}

/**
 * Hook B. Runs right after `let text = ...`.
 * Records short acknowledgments and a supplied account number.
 */
function hookB(conversationId, text) {
  try {
    const s = getState(conversationId);
    const t = String(text || '');
    // Never persist raw credential-bearing text: this state file is written to disk.
    s.lastInboundText = stripCredentialValues(t);
    s.lastInboundIsShortAck = isShortAck(t);
    const acct = extractAccountNumber(t);
    if (acct) {
      s.accountNumber = acct;
      s.accountCollected = true;
    }
    persist();
    return s;
  } catch (_) {
    return null;
  }
}

/**
 * Explicit variant when the engine already knows the account number.
 */
function noteAccountCollected(conversationId, accountNumber) {
  try {
    const s = getState(conversationId);
    s.accountCollected = true;
    if (accountNumber) s.accountNumber = String(accountNumber);
    return s;
  } catch (_) {
    return null;
  }
}

/**
 * Hook C. Records how many images vision successfully loaded.
 */
function hookC(conversationId, loaded, total) {
  try {
    const s = getState(conversationId);
    const l = Math.max(0, Number(loaded) || 0);
    const tt = Math.max(0, Number(total) || 0);
    if (l > 0) {
      s.imagesLoaded += l;
      s.lastImageAt = now();
    }
    if (tt > s.imagesReceived) {
      // The log knows about images we did not see via attachments.
      s.imagesReceived = tt;
      if (tt > 0 && !s.lastImageAt) s.lastImageAt = now();
    }
    persist();
    return s;
  } catch (_) {
    return null;
  }
}

/**
 * Hook C variant fed with the same arguments as the engine's IMAGE_IN log call.
 * Parses "loaded N/M" (also "loaded N / M", "loaded N of M", "loaded=N total=M").
 */
function hookCFromLogArgs(conversationId, ...logArgs) {
  try {
    const line = logArgs.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' ');
    if (!/IMAGE_IN/i.test(line)) return getState(conversationId);
    let m = line.match(/loaded\s*[:=]?\s*(\d+)\s*(?:\/|of|out of)\s*(\d+)/i);
    if (m) return hookC(conversationId, m[1], m[2]);
    m = line.match(/loaded\s*[:=]?\s*(\d+)/i);
    const total = line.match(/total\s*[:=]?\s*(\d+)/i);
    if (m) return hookC(conversationId, m[1], total ? total[1] : m[1]);
    return getState(conversationId);
  } catch (_) {
    return null;
  }
}

function safeStringify(v) {
  try {
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  } catch (_) {
    return String(v);
  }
}

/**
 * Marks that a materially new issue started in the same conversation.
 * Not detected automatically (no reliable signal is available in this pack);
 * the engine or a human must call it. Keeps the account number.
 */
function markNewIssue(conversationId) {
  try {
    const s = getState(conversationId);
    s.issueSeq += 1;
    s.imagesReceived = 0;
    s.imagesLoaded = 0;
    s.lastImageAt = 0;
    s.clarificationsAsked = 0;
    s.genericAsksBeforeImage = 0;
    s.blockedReplies = 0;
    return s;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/**
 * Decides whether the bot may ask the client for an image right now.
 * @param {object|string|number} stateOrConversationId
 * @param {{specific?: boolean}} [opts]
 * @returns {{allow: boolean, reason: string}}
 */
function decideImageAsk(stateOrConversationId, opts) {
  const s = typeof stateOrConversationId === 'object' && stateOrConversationId !== null
    ? stateOrConversationId
    : getState(stateOrConversationId);
  const specific = !!(opts && opts.specific);
  if (!hasRecentImage(s)) {
    return { allow: true, reason: 'no-image-yet' };
  }
  if (s.lastInboundIsShortAck && s.accountCollected) {
    return { allow: false, reason: 'short-ack-with-image-and-account' };
  }
  if (!specific) {
    return { allow: false, reason: 'image-already-received' };
  }
  if (s.clarificationsAsked >= DEFAULTS.maxClarifications) {
    return { allow: false, reason: 'clarification-cap-reached' };
  }
  return { allow: true, reason: 'one-specific-clarification' };
}

function shouldAskForImage(stateOrConversationId, opts) {
  return decideImageAsk(stateOrConversationId, opts).allow;
}

function accountPhrase(s) {
  return s.accountCollected && s.accountNumber ? ` and your account number ${s.accountNumber}` : '';
}

/**
 * Client-facing replacement text. Short, natural, no em dash, no platform names.
 * It states only what is certain: the image exists and was received.
 */
function replacementText(s, kind) {
  const acct = accountPhrase(s);
  if (kind === 'IMAGE_UNAVAILABLE') {
    // Never claim we cannot see a loaded image. Steer to answering from it.
    return `I can see the screenshot you sent${acct}. I am reading it now and will explain what it shows.`;
  }
  if (kind === 'GENERIC_IMAGE_ASK') {
    return `Thanks, I already have the screenshot you sent${acct}. There is no need to send it again. I am checking this for you now.`;
  }
  // Second clarification on the same issue.
  return `Thanks, I have the screenshots you sent${acct}. I will work with what you have already provided and update you here.`;
}

/**
 * Filters a candidate outbound reply against the conversation state.
 * Mutates state (clarification counter, blocked counter).
 * @returns {{text: string, blocked: boolean, kind: string, reason: string, original: string, action: string|null}}
 */
function filterOutboundReply(stateOrConversationId, replyText) {
  const s = typeof stateOrConversationId === 'object' && stateOrConversationId !== null
    ? stateOrConversationId
    : getState(stateOrConversationId);
  const original = replyText;
  const text = typeof replyText === 'string' ? replyText : '';
  const kind = classifyReply(text);
  const base = { text: replyText, blocked: false, kind, reason: 'pass', original, action: null };

  if (kind === 'NONE') return base;

  const imagePresent = hasRecentImage(s);

  if (!imagePresent) {
    if (kind === 'GENERIC_IMAGE_ASK' || kind === 'SPECIFIC_IMAGE_ASK') s.genericAsksBeforeImage += 1;
    // Without any image the engine may ask, and may say it has none.
    return { ...base, reason: 'no-image-yet' };
  }

  if (kind === 'IMAGE_UNAVAILABLE') {
    s.blockedReplies += 1;
    return {
      text: replacementText(s, kind),
      blocked: true,
      kind,
      reason: s.imagesLoaded > 0 ? 'image-loaded-by-vision' : 'image-attached-to-ticket',
      original,
      action: 'REVIEW_EXISTING_IMAGE_OR_ESCALATE',
    };
  }

  if (kind === 'GENERIC_IMAGE_ASK') {
    s.blockedReplies += 1;
    return {
      text: replacementText(s, kind),
      blocked: true,
      kind,
      reason: s.lastInboundIsShortAck ? 'short-ack-must-not-reopen' : 'image-already-received',
      original,
      action: 'REVIEW_EXISTING_IMAGE_OR_ESCALATE',
    };
  }

  // SPECIFIC_IMAGE_ASK
  const decision = decideImageAsk(s, { specific: true });
  if (decision.allow) {
    s.clarificationsAsked += 1;
    return { ...base, reason: 'one-specific-clarification-allowed' };
  }
  s.blockedReplies += 1;
  return {
    text: replacementText(s, 'SPECIFIC_CAP'),
    blocked: true,
    kind,
    reason: decision.reason,
    original,
    action: 'REVIEW_EXISTING_IMAGE_OR_ESCALATE',
  };
}

/**
 * Hook D. Drop-in for the engine: returns the (possibly rewritten) reply string.
 * Non-string replies are returned untouched.
 */
function hookD(conversationId, replyText) {
  try {
    if (typeof replyText !== 'string') return replyText;
    const r = filterOutboundReply(conversationId, replyText);
    if (r.blocked) {
      try {
        console.log(`[imageAskGuard] blocked ${r.kind} for conversation ${keyOf(conversationId)} (${r.reason})`);
      } catch (_) { /* ignore */ }
    }
    persist();
    return r.text;
  } catch (_) {
    return replyText;
  }
}

/**
 * English internal-note addendum for escalations when images already exist.
 * Returns '' when there is nothing to add, so it can be appended blindly.
 */
function escalationNoteAddendum(stateOrConversationId) {
  try {
    const s = typeof stateOrConversationId === 'object' && stateOrConversationId !== null
      ? stateOrConversationId
      : getState(stateOrConversationId);
    if (!hasRecentImage(s)) return '';
    const lines = [];
    if (s.accountNumber) lines.push(`Account number: ${s.accountNumber}`);
    lines.push('Available information:');
    const loaded = s.imagesLoaded > 0 ? ` (${s.imagesLoaded} loaded for review)` : '';
    lines.push(`Relevant screenshots/images from the client are already attached to this ticket${loaded}. No further screenshot was requested from the client.`);
    lines.push('Action needed:');
    lines.push('Please review the account and the attached images for the reported issue.');
    return lines.join('\n');
  } catch (_) {
    return '';
  }
}

function snapshot(conversationId) {
  const s = getState(conversationId);
  return { ...s, hasRecentImage: hasRecentImage(s) };
}

module.exports = {
  IMAGE_GUARD_VERSION,
  DEFAULTS,
  // state
  getState,
  snapshot,
  reset,
  resetAll,
  markNewIssue,
  noteAccountCollected,
  // hooks
  hookA,
  hookB,
  hookC,
  hookCFromLogArgs,
  hookD,
  // decisions
  decideImageAsk,
  shouldAskForImage,
  filterOutboundReply,
  escalationNoteAddendum,
  // classifiers
  classifyReply,
  isGenericImageAsk,
  isSpecificImageAsk,
  isImageUnavailableClaim,
  isShortAck,
  extractAccountNumber,
  countImageAttachments,
  hasRecentImage,
  // image-explain orchestration (2026-09-22 screenshot cascade fix)
  isImageExplainAsk,
  isImageRefusal,
  isImageAnswerableIssue,
  shouldSkipIdentityAskForImage,
  noteIdentityAskForImage,
  clearerScreenshotAsk,
};
