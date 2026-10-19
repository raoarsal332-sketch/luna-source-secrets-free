'use strict';

/**
 * TURN_INTENT_V1 (2026-09-28, live 215476138819546). ONE semantic intent layer for the latest client turn.
 *
 *   SOCIAL_SMALLTALK   courtesy only: greeting, how are you, answering it, thanks, glad, compliment, farewell
 *   SUPPORT_META       managing the support conversation: "can I ask", "I have some questions", "are you
 *                      free / available / there", "can we continue", "one more question", "I need help",
 *                      "do you have a minute"
 *   SUPPORT_QUESTION   anything carrying a FundedElite / account / trading / referential support subject
 *   GENUINE_OFF_TOPIC  POSITIVE evidence of an unrelated task (homework, essay, dinner/date invitation,
 *                      unrelated tech work, external subjects)
 *   UNCLEAR            none of the above; never a refusal, the normal answer path (or a clarification) handles it
 *
 * "Okay i have some questions are you free to help me ?" matched no positive detector, so the old decision
 * fell to its DEFAULT branch, which was out-of-scope, and the held draft became the canned scope refusal.
 * Out-of-scope is now a POSITIVE finding only.
 *
 * Decided by structure, not phrase lists:
 *  - robust normalisation (u/r/ur/pls, common misspellings, and edit-distance matching of the few anchor words);
 *  - clause segmentation, including run-on messages without punctuation ("okay i have some questions are you
 *    free to help me"): a clause may be split once more where both halves are complete conversational clauses;
 *  - a clause is SUPPORT_META when EVERY word belongs to the closed conversation-management vocabulary
 *    (pronouns, auxiliaries, determiners, quantity words, courtesy fillers, and anchors such as ask / question /
 *    help / free / available / minute / continue) and at least one anchor is present. Any content word ("payout",
 *    "homework", "dinner", "screenshot", ...) makes the clause something else, so paraphrases and typos of
 *    conversation management generalise while real subjects never hide inside it;
 *  - social clauses reuse textUtils' courtesy grammar (single source for small talk);
 *  - support subject beats everything; conversation context turns an ambiguous availability-with-time
 *    ("are you free tonight?") into availability when the chat is a support chat.
 * No model call; deterministic and cheap. Pure function of (text, context).
 */

const T = require('./textUtils');

// ---- normalisation ---------------------------------------------------------------------------------
const TOKEN_MAP = {
  u: 'you', yu: 'you', yoo: 'you', uou: 'you', yuo: 'you', yoy: 'you', r: 'are', ar: 'are', ur: 'your', urs: 'yours',
  pls: 'please', plz: 'please', plzz: 'please', pleas: 'please', pleae: 'please', plx: 'please', kindly: 'please',
  im: "i'm", iam: "i'm", ive: "i've", id: "i'd", ill: "i'll", dont: "don't", cant: "can't", wont: "won't",
  wanna: 'want', gonna: 'going', gimme: 'give', lemme: 'let', abt: 'about', bcz: 'because', coz: 'because',
  q: 'question', qs: 'questions', qns: 'questions', ques: 'question', qstn: 'question', qstns: 'questions',
  hlp: 'help', halp: 'help', hepl: 'help', hep: 'help', helpp: 'help', hellp: 'help',
  sec: 'second', secs: 'seconds', min: 'minute', mins: 'minutes', mnt: 'minute', sm: 'some', smth: 'something',
  sumthing: 'something', somthing: 'something', smthing: 'something', somethin: 'something', thng: 'thing',
  helo: 'hello', hellow: 'hello', hlw: 'hello', hii: 'hi', hiii: 'hi', heyy: 'hey', okk: 'ok', okey: 'okay', oky: 'okay', k: 'ok',
  ya: 'yes', yea: 'yes', yeah: 'yes', yep: 'yes', yup: 'yes', thx: 'thanks', ty: 'thanks', tnx: 'thanks', thanx: 'thanks',
  n: 'and', nd: 'and', tym: 'time', tyme: 'time', avl: 'available', avail: 'available', b: 'be', c: 'see', wat: 'what',
  wht: 'what', hw: 'how', gud: 'good', gd: 'good', nyc: 'nice', bro: 'bro',
};
// Anchor words of conversation management; misspellings within a small edit distance map onto them.
const META_ANCHORS = ['ask', 'question', 'questions', 'query', 'queries', 'doubt', 'doubts', 'help', 'helping',
  'assist', 'assistance', 'support', 'free', 'available', 'availability', 'there', 'around', 'online', 'minute',
  'minutes', 'moment', 'second', 'seconds', 'time', 'continue', 'continuing', 'proceed', 'more', 'another', 'something',
  'anything', 'thing', 'things', 'talk', 'speak', 'chat', 'problem', 'problems', 'issue', 'issues', 'ready', 'here',
  'clarify', 'clarification', 'inquiry', 'inquiries', 'enquiry', 'enquiries'];
const FUZZY_TARGETS = ['question', 'questions', 'available', 'availability', 'continue', 'assist', 'assistance', 'minute',
  'moment', 'something', 'queries', 'clarification', 'help', 'please', 'hello', 'anything', 'another', 'problem', 'support'];

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = [];
  for (let i = 0; i <= a.length; i += 1) { d[i] = [i]; }
  for (let j = 0; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function normalizeWord(w) {
  if (!w) return w;
  if (Object.prototype.hasOwnProperty.call(TOKEN_MAP, w)) return TOKEN_MAP[w];
  if (w.length >= 5 && !META_VOCAB.has(w)) {
    for (const t of FUZZY_TARGETS) {
      if (t[0] !== w[0] && !(t === 'available' && w[0] === 'v')) continue;
      const max = t.length >= 8 ? 2 : 1;
      if (editDistance(w, t) <= max) return t;
    }
  }
  return w;
}

function normalizeText(s) {
  let t = T.stripHtml(String(s || '')).replace(/[’‘`]/g, "'").toLowerCase();
  t = t.replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, ' ');
  t = t.replace(/\bi\s+m\b/g, "i'm").replace(/\bdo\s+u\b/g, 'do you').replace(/\bcan\s+u\b/g, 'can you');
  t = t.replace(/[^a-z0-9'?!.,;:\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.split(' ').map((w) => {
    const m = w.match(/^([^a-z0-9']*)([a-z0-9']+)([^a-z0-9']*)$/);
    if (!m) return w;
    return m[1] + normalizeWord(m[2]) + m[3];
  }).join(' ');
}

// ---- closed conversation-management vocabulary ---------------------------------------------------------
const FUNCTION_WORDS = ('i me my mine myself you your yours yourself we us our someone somebody anyone anybody one ' +
  "i'm i've i'd i'll you're you've we're it's " +
  'can could may might would will shall should do does did done have has had having got get getting am is are was were be been being ' +
  'a an the some few couple of little bit lot lots several many much any all just only quick quickly real really small simple ' +
  'short tiny two three more else too also again still yet now right currently today at this moment point ' +
  'to for with about regarding related on in from if so and or but then ok okay alright sure yes well hmm hey hi hello ' +
  'please sir madam maam bro brother dear friend arsal luna team guys there here want like need needed would love ' +
  "go going ahead let let's lets us able give spare mind don't not no if it that this i'd " +
  'wanted wanting wondering wonder hoping hope trying try thought think first before start begin sorry bother disturb excuse ' +
  'actually basically kind kinda sort sorta yeah yes okayy').split(/\s+/);
// Gratitude words are deliberately absent: "thanks for asking / for your help" is courtesy, not conversation management.
const META_VOCAB = new Set(FUNCTION_WORDS.concat(META_ANCHORS, ['asking']));
const META_ANCHOR_SET = new Set(META_ANCHORS);
// Anchors that on their own ("there", "here", "more", "thing") are too weak to call a clause conversation management.
const WEAK_ANCHORS = new Set(['there', 'here', 'more', 'thing', 'things', 'something', 'anything', 'around', 'time', 'ready']);
const WH_CONTENT_RE = /\b(?:what|why|when|where|which|who|whom|whose|how)\b/;

function metaClause(c) {
  const words = String(c || '').replace(/[?!.,;:]+/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  if (WH_CONTENT_RE.test(words.join(' ')) && !/^how\s+(?:can|could|may)\s+(?:you|i)\s+(?:help|assist|ask)\b/.test(words.join(' '))) return false;
  let strong = 0; let weak = 0;
  for (const w of words) {
    if (!META_VOCAB.has(w)) return false;
    if (META_ANCHOR_SET.has(w)) { if (WEAK_ANCHORS.has(w)) weak += 1; else strong += 1; }
  }
  if (strong > 0) return true;
  // "are you there" / "anyone here" / "one more thing" / "can we continue" style presence and continuation.
  const j = words.join(' ');
  return weak > 0 && (/\b(?:are|is)\s+(?:you|anyone|anybody|someone|somebody)\s+(?:still\s+)?(?:there|here|around)\b|\b(?:anyone|anybody|someone|somebody)\s+(?:there|here|around)\b/.test(j) ||
    /\b(?:one|a\s+few|few|some|couple\s+of)\s+more\s+(?:thing|things)\b|\bone\s+more\b|\bone\s+(?:thing|last\s+thing)\b|\bi\s+have\s+(?:some|a|one)\s+(?:thing|something)\b|\b(?:can|may|could)\s+i\s+(?:say|tell\s+you)\s+something\b/.test(j) ||
    /\bdo\s+you\s+have\s+(?:some|a\s+(?:bit\s+of|little)|any)?\s*time\b|\b(?:got|have)\s+(?:some|a\s+little)?\s*time\b/.test(j));
}

// ---- positive off-topic evidence ------------------------------------------------------------------------
const OFFTOPIC_STRONG_RE = /\b(?:home\s*work|assignments?|essays?|thesis|dissertation|poems?|poetry|lyrics|recipes?|cover\s+letter|resume|cv|curriculum\s+vitae|term\s+paper|research\s+paper|weather|football|cricket|soccer|nba|politics?|political|elections?|religions?|girlfriend|boyfriend|crush|marry\s+me|kiss(?:es)?|horoscope|zodiac)\b/;
const OFFTOPIC_TASK_OBJ_RE = /\b(?:stor(?:y|ies)|songs?|jokes?|math|maths|algebra|calculus|equations?|physics|chemistry|biology|code|coding|program|script|website|web\s*site|app|application\s+for\s+(?:a\s+)?job|logo|translation|email\s+to\s+my\s+(?:boss|teacher|landlord)|letter|speech|project|exam)\b/;
const OFFTOPIC_TASK_VERB_RE = /\b(?:write|writing|make|making|do|doing|solve|solving|build|building|create|creating|design|designing|develop|developing|code|translate|translating|tell|sing|compose|help\s+(?:me\s+)?with|finish|complete)\b/;
const INVITE_ACTIVITY_RE = /\b(?:dinner|lunch|breakfast|coffee|tea\s+together|drinks?|beer|date|dating|go\s+out|going\s+out|hang\s*out|hangout|meet\s+(?:up|me|in\s+person|irl)|party|movies?|cinema|club|picnic|your\s+(?:number|phone|whatsapp|instagram|insta|snap(?:chat)?|address|home))\b/;
const INVITE_TIME_RE = /\b(?:tonight|tomorrow\s+(?:night|evening)|this\s+(?:weekend|evening|saturday|sunday|friday)|after\s+work|later\s+tonight)\b/;
const TRADING_CODE_CONTEXT_RE = /\b(?:ea|expert\s+advisor|indicator|mt[45]|metatrader|bot\s+for\s+trading|trading\s+bot|strategy)\b/;

// External subjects (a fallback when the caller passes no isExternal; production passes index's EXTERNAL_TOPIC_RE).
const EXTERNAL_SUBJECT_RE = /\b(?:bitcoin|btc|ethereum|dogecoin|crypto\s+(?:price|market)|stock\s+(?:price|market)|nasdaq|gold\s+price|oil\s+price|capital\s+of|prime\s+minister|president\s+of|ftmo|fundednext|fundingpips|the5ers|topstep)\b/;
function offTopicEvidence(norm, externalFn) {
  if (INVITE_ACTIVITY_RE.test(norm)) return 'personal-invite';
  if (OFFTOPIC_STRONG_RE.test(norm)) return 'task';
  if (OFFTOPIC_TASK_OBJ_RE.test(norm) && OFFTOPIC_TASK_VERB_RE.test(norm) && !TRADING_CODE_CONTEXT_RE.test(norm)) return 'task';
  try { if (externalFn ? externalFn(norm) : EXTERNAL_SUBJECT_RE.test(norm)) return 'external'; } catch (_) { /* ignore */ }
  return '';
}

// Deictic references to something already on screen (Luna's last answer, a screenshot) are support work.
const SUPPORT_DEICTIC_RE = /\b(?:(?:does|do|did)\s+(?:this|that|it|these|those)\s+(?:mean|means|say)|(?:explain|clarify)\s+(?:this|that|it|these|those|more|again|further|better)|what\s+(?:is|are)\s+(?:this|that|these|those)\b|i\s+(?:don't|do\s+not|didn't)\s+(?:understand|get)\s+(?:this|that|it)|what\s+do\s+you\s+mean)\b/;

// ---- segmentation ---------------------------------------------------------------------------------------
function socialKind(c) {
  const k = T.courtesyClauseKind(c);
  if (k) return k;
  return null;
}

function labelClause(c) {
  const x = String(c || '').trim();
  if (!x) return { label: 'filler' };
  if (metaClause(x)) return { label: 'meta' };
  const k = socialKind(x);
  if (k === 'filler') return { label: 'filler' };
  if (k) return { label: 'social', kind: k };
  return null;
}

function splitRunOn(c, depth) {
  const whole = labelClause(c);
  if (whole) return [whole];
  if (depth <= 0) return null;
  const words = c.split(' ');
  if (words.length < 3) return null;
  for (let i = 1; i < words.length; i += 1) {
    const left = labelClause(words.slice(0, i).join(' '));
    if (!left) continue;
    const right = splitRunOn(words.slice(i).join(' '), depth - 1);
    if (right) return [left].concat(right);
  }
  return null;
}

function segment(norm) {
  return norm.split(/[,.!?;:\n]+|\s+-\s+|\s+(?:and|but|&|plus|btw|so)\s+(?!(?:you|yours|yourself)\b)/)
    .map((x) => x.trim()).filter(Boolean);
}

/**
 * classify(text, ctx) -> frozen { intent, components, meta, social, offTopic, supportSubject, reason }
 * ctx: { isSupport(text)->bool, isExternal(text)->bool, supportContext: bool, hasImage: bool }
 */
function classify(text, ctx) {
  const c = ctx || {};
  const raw = T.stripHtml(String(text || '')).trim();
  const norm = normalizeText(raw);
  const out = { intent: 'UNCLEAR', components: [], meta: false, social: false, offTopic: '', supportSubject: false, reason: '', resolvedAsk: '', specificClarify: '' };
  if (!norm) { out.reason = 'empty'; return Object.freeze(out); }
  // RESOLVED_CLOSURE_V1: "all clear" / "I understand the reset now" is satisfaction even
  // when a domain word (reset, payout, account) would otherwise look like a support subject.
  try {
    if (require('../reviewRequestFlow').isResolutionClosure(raw)) {
      out.intent = 'SOCIAL_SMALLTALK';
      out.social = true;
      out.components = ['satisfaction'];
      out.reason = 'satisfaction-closure';
      return Object.freeze(out);
    }
  } catch (_) { /* resolution helper optional */ }
  let support = false;
  try { support = !!(c.isSupport && (c.isSupport(raw) || c.isSupport(norm))); } catch (_) { support = false; }
  if (!support && SUPPORT_DEICTIC_RE.test(norm)) support = true;
  const clauses = segment(norm);
  const labels = [];
  let allConversational = clauses.length > 0 && norm.length <= 220;
  for (const cl of clauses) {
    const seg = allConversational ? splitRunOn(cl, 2) : null;
    if (!seg) { allConversational = false; continue; }
    labels.push(...seg);
  }
  out.meta = labels.some((l) => l.label === 'meta');
  out.social = labels.some((l) => l.label === 'social');
  out.components = [...new Set(labels.filter((l) => l.label === 'social').map((l) => l.kind))];
  if (out.meta) out.components.push('support-meta');
  const off = offTopicEvidence(norm, c.isExternal);
  if (support && off === 'personal-invite') {
    // A personal invite's own time phrase ("this weekend", "tonight") is not a FundedElite subject (weekend holding
    // etc.). Re-check support with the invite activity/time removed; only a real remaining subject keeps it support.
    const rest = norm.replace(new RegExp(INVITE_ACTIVITY_RE.source, 'g'), ' ').replace(new RegExp(INVITE_TIME_RE.source, 'g'), ' ')
      .replace(/\b(?:weekend|weekends|tonight|tomorrow|evening|night|sometime|free|busy)\b/g, ' ').replace(/\s+/g, ' ').trim();
    let still = false;
    try { still = !!(c.isSupport && c.isSupport(rest)); } catch (_) { still = false; }
    if (!still) support = false;
  }
  if (support) {
    out.intent = 'SUPPORT_QUESTION'; out.supportSubject = true; out.reason = 'support-subject';
  } else if (off === 'personal-invite' || off === 'task' || (off === 'external' && !allConversational)) {
    out.intent = 'GENUINE_OFF_TOPIC'; out.offTopic = off; out.reason = 'positive-offtopic:' + off;
  } else if (INVITE_TIME_RE.test(norm) && /\b(?:free|available|busy)\b/.test(norm) && norm.split(' ').length <= 10) {
    // "are you free tonight?": availability in a support chat, otherwise ambiguous (never a refusal).
    if (c.supportContext) { out.intent = 'SUPPORT_META'; out.meta = true; out.components = ['support-meta']; out.reason = 'availability-in-support-context'; }
    else { out.intent = 'UNCLEAR'; out.reason = 'ambiguous-availability'; }
  } else if (allConversational && (out.meta || out.social)) {
    out.intent = out.meta ? 'SUPPORT_META' : 'SOCIAL_SMALLTALK';
    out.reason = 'conversational:' + labels.map((l) => l.label + (l.kind ? '/' + l.kind : '')).join('+');
  } else {
    // CONTEXTUAL_EPISODE_V1: an elliptical follow-up is not unclear just because it
    // omits the topic. Resolve it against the active question and answer first.
    // A bare "what?" with more than one live referent stays GENUINE_UNCLEAR.
    const contextual = resolveContextualIntent(raw, c);
    if (contextual && contextual.intent) {
      out.intent = contextual.intent;
      out.reason = contextual.reason || 'GENUINE_UNCLEAR';
      out.supportSubject = contextual.intent === 'SUPPORT_QUESTION';
      out.resolvedAsk = contextual.resolvedAsk || '';
      out.specificClarify = contextual.specificClarify || '';
    } else {
      out.intent = 'UNCLEAR'; out.reason = 'no-positive-evidence';
    }
  }
  return Object.freeze(out);
}

/** A single clause/question that only manages the conversation (never a coverage unit for MISSED_QUESTION). */
function isConversationalOnly(text) {
  try {
    if (require('../reviewRequestFlow').isResolutionClosure(text)) return true;
  } catch (_) { /* keep the conversational grammar */ }
  const norm = normalizeText(text);
  if (!norm || norm.length > 220) return false;
  if (SUPPORT_DEICTIC_RE.test(norm)) return false;
  if (offTopicEvidence(norm, null)) return false;
  const clauses = segment(norm);
  if (!clauses.length) return false;
  let any = false;
  for (const cl of clauses) {
    const seg = splitRunOn(cl, 2);
    if (!seg) return false;
    if (seg.some((l) => l.label === 'meta' || l.label === 'social')) any = true;
  }
  return any;
}

function isSupportMetaOnly(text) {
  const norm = normalizeText(text);
  if (!norm || offTopicEvidence(norm, null) || SUPPORT_DEICTIC_RE.test(norm)) return false;
  const clauses = segment(norm);
  let meta = false;
  for (const cl of clauses) {
    const seg = splitRunOn(cl, 2);
    if (!seg) return false;
    if (seg.some((l) => l.label === 'meta')) meta = true;
  }
  return meta;
}

// CONTEXTUAL_EPISODE_V1. Elliptical follow-ups ("How long?", "What about bank?",
// "And max loss?", "So I can withdraw now?") are resolved against the latest
// substantive customer question and the latest substantive answer before UNCLEAR.
// No history means the old no-positive-evidence result is unchanged.

function historyOf(ctx) {
  const h = (ctx && (ctx.history || ctx.recentMessages)) || [];
  const out = [];
  for (const m of h) {
    if (!m) continue;
    if (typeof m === 'string') { out.push({ role: 'client', text: m, ts: 0 }); continue; }
    const text = T.stripHtml(String(m.text || m.body || '')).trim();
    if (!text) continue;
    out.push({ role: String(m.role || 'client'), text, ts: Number(m.ts || m.created_at || 0) || 0 });
  }
  return out;
}

function wordCount(norm) {
  return String(norm || '').split(/\s+/).filter(Boolean).length;
}

function facetSet(text) {
  const t = String(text || '');
  const f = new Set();
  if (/\b(?:crypto|usdt|trc-?20|erc-?20)\b/i.test(t) && !/\bcrypto\s+(?:price|market)\b/i.test(t)) f.add('crypto');
  if (/\bwallet\b/i.test(t) && !/\bbank\b/i.test(t) && !/\bcrypto\s+(?:price|market)\b/i.test(t)) f.add('crypto');
  if (/\b(?:bank|wire|sepa|iban|swift)\b/i.test(t)) f.add('bank');
  if (/\bmax(?:imum)?\s+(?:loss|drawdown)\b/i.test(t)) f.add('max_loss');
  if (/\bdaily\s+(?:loss|drawdown)\b|\bdll\b/i.test(t)) f.add('daily_loss');
  if (/\bprofit\s+target\b/i.test(t)) f.add('profit_target');
  if (/\bevaluation\b/i.test(t)) f.add('evaluation');
  if (/\bfunded\b/i.test(t)) f.add('funded');
  if (/\b(?:payouts?|withdraw\w*)\b/i.test(t)) f.add('payout');
  if (/\b(?:process(?:ed|ing)?|turnaround)\b/i.test(t)) f.add('timing');
  if (/\b(?:brother|sister|household|same\s+house|same\s+home|multiple\s+ip)\b/i.test(t)) f.add('household');
  if (/\b(?:violat\w*|breach\w*)\b/i.test(t)) f.add('violation');
  if (/\bcards?\b/i.test(t)) f.add('card');
  if (/\bpakistan\b/i.test(t)) f.add('pakistan');
  return f;
}

function productPhrase(blob) {
  const m = String(blob || '').match(/\blite\s+2[\s-]*step\b|\b2[\s-]*step\s+lite\b|\b2[\s-]*step(?:\s*\+\s*free\s*retry)?\b|\b1[\s-]*step\b|\binstant\s+elite\b|\binstant\b|\bflash\b/i);
  return m ? m[0] : '';
}

function isStockLine(text) {
  try { return require('./multiAskCompleteness').isOnlyStockClarification(text); } catch (_) { return false; }
}

function buildAnchor(history) {
  let clientAsk = '';
  let prevClient = '';
  let answer = '';
  const facets = new Set();
  const topicBuckets = [];
  const recent = [];
  for (let i = history.length - 1; i >= 0 && history.length - i <= 18; i -= 1) {
    const m = history[i];
    const text = m.text;
    const agent = m.role !== 'client' && m.role !== 'user' && m.role !== 'lead';
    if (agent) {
      if (isStockLine(text) || text.length < 30) continue;
      if (!answer) answer = text.slice(0, 500);
      if (recent.length < 6) recent.push(text.slice(0, 240));
      continue;
    }
    if (/^(?:hi|hello|hey|thanks|thank you|ok|okay|yes|no)\b/i.test(text) && text.length < 40) continue;
    if (!clientAsk) {
      clientAsk = text.slice(0, 400);
      for (const f of facetSet(text)) facets.add(f);
    } else if (!prevClient) prevClient = text.slice(0, 300);
    const bucket = facetSet(text);
    if (bucket.size && topicBuckets.length < 3) topicBuckets.push(bucket);
    if (recent.length < 6) recent.push(text.slice(0, 240));
  }
  // The latest customer question supplies the referent. When that question names
  // nothing, the latest substantive answer does ("crypto usually arrives…" then "How long?").
  if (!facets.size && answer) for (const f of facetSet(answer)) facets.add(f);
  return { clientAsk, prevClient, answer, facets, topicBuckets, context: recent.join('\n') };
}

function disjointGroups(buckets) {
  const seen = [];
  for (const b of buckets) {
    if (seen.some((s) => [...b].some((x) => s.has(x)))) continue;
    seen.push(b);
  }
  return seen.length || (buckets.length ? 1 : 0);
}

function ellipticalKind(raw, norm) {
  const n = wordCount(norm);
  if (!n || n > 24) return '';
  if (/^(?:what|huh|sorry|pardon)(?:\s+now)?\s*\??$/.test(norm)) return 'bare';
  if (/^(?:and\s+)?(?:after\s+that|then\s+what|what\s+next)\s*\??$/.test(norm)) return 'sequence';
  if (/^(?:what|how)\s+about\s+/.test(norm)) return 'about';
  if (/\bhow\s+long\b|\bhow\s+(?:soon|fast|quickly)\b/.test(norm) && n <= 12) return 'timing';
  if (/\bwhen\b/.test(norm) && n <= 12) return 'timing';
  if (/^(?:and|also)\s+/.test(norm) && n <= 8) return 'and';
  if (/^(?:so|then)\b/.test(norm) && n <= 12) return 'so';
  if (/^(?:can|could|will|would|is|do|does)\b/.test(norm) && n <= 12 && /\b(?:it|that|this|now|today|i)\b/.test(norm)) return 'polar';
  if (/\bwhat\s+if\b/.test(norm) && n <= 12) return 'whatif';
  if (n <= 14 && /\b(?:it|that|this|he|she|they)\b/.test(norm) && (/\?/.test(String(raw || '')) || /\b(?:stop|start|mean|happen)\b/.test(norm))) return 'anaphoric';
  if (n <= 22 && /\b(?:brother|sister|same\s+house|same\s+home)\b/.test(norm) && /\b(?:start|stop|trading)\b/.test(norm)) return 'anaphoric';
  if (/^(?:read|look)\b/.test(norm) && n <= 6) return 'reread';
  return '';
}

/**
 * resolveContextualIntent(text, ctx) -> { intent, reason, resolvedAsk, specificClarify } | null
 * ctx.history: [{ role, text, ts }] prior public messages, oldest first, excluding the current turn.
 * Reasons: CONTEXTUAL_FOLLOWUP, CONTINUATION, EXPLICIT_QUESTION, GENUINE_UNCLEAR, NEW_TOPIC.
 */
function resolveContextualIntent(raw, ctx) {
  const c = ctx || {};
  const norm = normalizeText(raw);
  const history = historyOf(c);
  if (!history.length || !norm) return null;
  if (/^(?:and\s+)?(?:please\s+)?(?:update\s+me|any\s+update|check(?:\s+please|\s+pls)?|once\s+you\s+can\s+chec?k)\b/.test(norm)) return null;
  const normRaw = norm.replace(/[?!.,]+$/g, '').trim();
  for (let i = history.length - 1; i >= 0 && history.length - i <= 8; i -= 1) {
    const m = history[i];
    if (m.role !== 'client' && m.role !== 'user' && m.role !== 'lead') continue;
    const prev = normalizeText(m.text).replace(/[?!.,]+$/g, '').trim();
    if (prev && prev === normRaw && prev.length > 20) {
      return { intent: 'SUPPORT_QUESTION', reason: 'EXPLICIT_QUESTION', resolvedAsk: m.text, specificClarify: '' };
    }
  }
  const kind = ellipticalKind(raw, norm);
  const anchor = buildAnchor(history);
  const blob = (anchor.clientAsk + '\n' + anchor.prevClient + '\n' + anchor.answer).trim();
  if (!blob) return { intent: 'UNCLEAR', reason: 'GENUINE_UNCLEAR', resolvedAsk: '', specificClarify: '' };
  const groups = disjointGroups(anchor.topicBuckets);
  if (kind === 'bare' && groups >= 2) {
    return { intent: 'UNCLEAR', reason: 'GENUINE_UNCLEAR', resolvedAsk: '', specificClarify: '' };
  }
  const prod = productPhrase(blob);
  const prodBit = prod ? ' on the ' + prod : '';
  const supportish = !!(c.supportContext || anchor.facets.size);

  if (kind === 'about' || kind === 'and' || kind === 'whatif') {
    if (/\b(?:crypto|usdt|wallet)\b/.test(norm) && !/\bcrypto\s+(?:price|market)\b/.test(norm)) {
      if (supportish || anchor.facets.has('payout') || anchor.facets.has('timing') || anchor.facets.has('bank') || anchor.facets.has('crypto')) {
        return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'How long does a crypto payout take to arrive after it is approved?', specificClarify: '' };
      }
    }
    if (/\bbank\b/.test(norm) && (anchor.facets.has('crypto') || anchor.facets.has('payout') || anchor.facets.has('timing') || anchor.facets.has('bank'))) {
      return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'How long does a bank transfer take after the payout is approved?', specificClarify: '' };
    }
    if (/\bmax(?:imum)?\s+(?:loss|drawdown)\b|\bmax\s+loss\b/.test(norm)) {
      return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'What is the maximum loss limit' + prodBit + '?', specificClarify: '' };
    }
    if (/\bevaluation\b/.test(norm)) {
      return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'What are the evaluation rules' + prodBit + '?', specificClarify: '' };
    }
    if (/\bfunded\b/.test(norm)) {
      return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'What applies once the account is funded' + prodBit + '?', specificClarify: '' };
    }
    if (/\bpakistan\b/.test(norm) && (c.supportContext || anchor.facets.size)) {
      return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'Is Pakistan on the restricted countries list?', specificClarify: '' };
    }
    const about = norm.replace(/^(?:and\s+|also\s+)?(?:what|how)\s+about\s+/, '').replace(/[?!.]+$/g, '').trim();
    if (kind === 'about' && about && wordCount(about) <= 4 && groups <= 1 && anchor.facets.size) {
      const named = [...anchor.facets].slice(0, 3).join(', ');
      return { intent: 'SUPPORT_QUESTION', reason: 'NEW_TOPIC', resolvedAsk: 'In the current ' + named + ' discussion, what about ' + about + '?', specificClarify: '' };
    }
  }

  if (kind === 'timing') {
    const channels = ['crypto', 'bank'].filter((x) => anchor.facets.has(x));
    if (channels.length >= 2 && !/\b(?:crypto|bank|wallet)\b/.test(norm)) {
      return { intent: 'UNCLEAR', reason: 'GENUINE_UNCLEAR', resolvedAsk: '', specificClarify: 'Do you mean how long the crypto transfer takes, or the bank transfer?' };
    }
    if (anchor.facets.has('crypto') || (/\b(?:crypto|wallet)\b/.test(norm) && !/\bcrypto\s+(?:price|market)\b/.test(norm))) {
      return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'How long does the crypto payout take to arrive after it is sent?', specificClarify: '' };
    }
    if (anchor.facets.has('bank')) {
      return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'How long does the bank transfer take after the payout is sent?', specificClarify: '' };
    }
    if (anchor.facets.has('payout') || anchor.facets.has('timing')) {
      return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'How long does payout processing take, and when are the funds sent?', specificClarify: '' };
    }
    if (groups >= 2) return { intent: 'UNCLEAR', reason: 'GENUINE_UNCLEAR', resolvedAsk: '', specificClarify: '' };
    if (anchor.clientAsk && (c.supportContext || anchor.facets.size)) {
      return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'How long does this take: ' + anchor.clientAsk.replace(/\s+/g, ' ').slice(0, 180), specificClarify: '' };
    }
  }

  if (/\b(?:withdraw\w*|payout\w*)\b/.test(norm) && /\b(?:now|today)\b|\bcan\s+i\b/.test(norm)) {
    return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'Can I withdraw or request the payout now?', specificClarify: '' };
  }
  if (kind === 'whatif' && /\bfunded\b/.test(norm)) {
    return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'What changes if the account is funded' + prodBit + '?', specificClarify: '' };
  }
  if (kind === 'sequence') {
    const step = (anchor.answer || anchor.clientAsk || '').replace(/\s+/g, ' ').slice(0, 160);
    if (step) return { intent: 'SUPPORT_QUESTION', reason: 'CONTINUATION', resolvedAsk: 'What is the next step after: ' + step, specificClarify: '' };
  }
  if (kind === 'polar' && /\btoday\b/.test(norm) && (anchor.clientAsk || anchor.facets.size)) {
    return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'Can the current request be done today? Context: ' + (anchor.clientAsk || anchor.answer).replace(/\s+/g, ' ').slice(0, 180), specificClarify: '' };
  }
  if (kind === 'reread' && anchor.clientAsk) {
    return { intent: 'SUPPORT_QUESTION', reason: 'CONTINUATION', resolvedAsk: anchor.clientAsk, specificClarify: '' };
  }
  const householdBlob = norm + '\n' + anchor.clientAsk + '\n' + anchor.prevClient + '\n' + anchor.answer + '\n' + (anchor.context || '');
  if ((kind === 'anaphoric' || kind === 'so' || kind === 'polar') &&
      /\b(?:brother|sister|same\s+house|same\s+home|household)\b/i.test(householdBlob) &&
      /\b(?:stop|start|he|she|brother|sister)\b/i.test(norm)) {
    return { intent: 'SUPPORT_QUESTION', reason: 'CONTINUATION', resolvedAsk: 'If the other person in the same household stops trading and I start on my own account, is that allowed?', specificClarify: '' };
  }
  if (kind === 'polar' && wordCount(norm) >= 6 && !/\b(?:it|that|this)\b/.test(norm) && (anchor.clientAsk || anchor.answer)) {
    return { intent: 'SUPPORT_QUESTION', reason: 'EXPLICIT_QUESTION', resolvedAsk: String(raw || '').trim(), specificClarify: '' };
  }
  if ((kind === 'polar' || kind === 'so') && anchor.facets.has('payout') && /\b(?:request|withdraw|payout)\b/.test(norm)) {
    return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'Can I request the payout now?', specificClarify: '' };
  }
  if (kind === 'bare' && groups <= 1 && anchor.facets.size) {
    const facet = [...anchor.facets][0];
    const spec = facet === 'crypto'
      ? 'Do you mean how long the crypto transfer takes after the payout is approved?'
      : facet === 'payout'
        ? 'Do you mean the payout we were just discussing?'
        : facet === 'timing'
          ? 'Do you mean how long that step takes?'
          : 'Do you mean the ' + facet.replace(/_/g, ' ') + ' point from the last answer?';
    return { intent: 'UNCLEAR', reason: 'GENUINE_UNCLEAR', resolvedAsk: '', specificClarify: spec };
  }
  if (kind && groups <= 1 && anchor.clientAsk && wordCount(norm) <= 14 && (c.supportContext || anchor.facets.size)) {
    return { intent: 'SUPPORT_QUESTION', reason: 'CONTINUATION', resolvedAsk: anchor.clientAsk.replace(/\s+/g, ' ').slice(0, 240) + ' Follow-up: ' + String(raw || '').trim(), specificClarify: '' };
  }
  if (kind === 'bare' || (kind && groups >= 2 && !anchor.facets.size)) {
    return { intent: 'UNCLEAR', reason: 'GENUINE_UNCLEAR', resolvedAsk: '', specificClarify: '' };
  }
  if (!kind) {
    // A short question that already names its subject is explicit. Do not stock-clarify it,
    // and do not rewrite it onto a different topic. Bare "right?" / "what?" stay unclear.
    const n = wordCount(norm);
    const namesSubject = (/\?/.test(String(raw || '')) || /^(?:how|why|where|which|who)\b/.test(norm)) &&
      n >= 3 && n <= 18 && !/^(?:right|ok|okay|yes|no|what|huh|sorry)\b/.test(norm);
    if (/^(?:on|by|via|through)\s+(?:mail|e-?mail)\b/.test(norm) && (anchor.clientAsk || anchor.answer)) {
      return { intent: 'SUPPORT_QUESTION', reason: 'CONTEXTUAL_FOLLOWUP', resolvedAsk: 'Will that be sent by email?', specificClarify: '' };
    }
    if (!namesSubject || !(anchor.clientAsk || anchor.answer)) return null;
    if (groups >= 2 && !facetSet(raw).size) {
      return { intent: 'UNCLEAR', reason: 'GENUINE_UNCLEAR', resolvedAsk: '', specificClarify: '' };
    }
    return { intent: 'SUPPORT_QUESTION', reason: 'EXPLICIT_QUESTION', resolvedAsk: String(raw || '').trim(), specificClarify: '' };
  }
  return null;
}

/** True when a generic "tell me more" line would hide a question we can already place. */
function avoidsGenericClarify(intent, text) {
  if (!intent) return false;
  const reason = intent.reason || intent.intentReason || '';
  if (reason === 'CONTEXTUAL_FOLLOWUP' || reason === 'CONTINUATION' || reason === 'EXPLICIT_QUESTION' || reason === 'NEW_TOPIC') return true;
  if (intent.specificClarify) return true;
  if (intent.intent === 'SUPPORT_QUESTION' && /\?/.test(String(text || '')) && !/^(?:what|huh|right)\s*\??$/i.test(String(text || '').trim())) return true;
  return false;
}

module.exports = { classify, isConversationalOnly, isSupportMetaOnly, normalizeText, metaClause, offTopicEvidence, resolveContextualIntent, avoidsGenericClarify, _labelClause: labelClause, _segment: segment };
