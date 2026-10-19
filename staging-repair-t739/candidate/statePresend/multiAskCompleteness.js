'use strict';

/**
 * multiAskCompleteness.js - collects every relevant unanswered client ask from
 * the recent message burst (not just the last message) and checks whether a
 * draft covers them.
 */

const { stripHtml, stripQuotedHistory, extractQuestions, tokens, overlapRatio, extractTopics, isShortAck, isGreetingOrSmallTalk, uniq, stem, sentences, withoutConcludedPastContext } = require('./textUtils');
const EMBEDDED_ASK_UNIT_RE = /\bi\s+(?:\w+\s+)?(?:want(?:ed)?|would\s+like|need)\s+to\s+know\s+(?:if|whether|how|what|when|which)\b|\bi(?:'m|\s+am|\s+was)\s+wondering\s+(?:if|whether|how|what)\b/i;

// The shared stem() only strips (ing|ed|es|s|e), so it cannot join the domain
// word-pairs a client's question and a correct answer routinely swap: "lose" vs
// "loss", "day" vs "daily", "withdraw" vs "withdrawal". Coverage is a recall
// problem here — a missed match reports an already-answered question as missed,
// which fails the draft closed and escalates it to a human — so map these known
// variants onto one concept before measuring overlap. The 0.45 threshold below is
// deliberately unchanged: this raises recall without accepting a draft that never
// states an answer.
const CONCEPT_EQUIV = new Map(Object.entries({
  lose: 'loss', loses: 'loss', losing: 'loss', lost: 'loss', loss: 'loss', losses: 'loss',
  day: 'day', days: 'day', daily: 'day',
  breach: 'breach', breaches: 'breach', breached: 'breach', breaching: 'breach',
  withdraw: 'withdraw', withdraws: 'withdraw', withdrawal: 'withdraw', withdrawals: 'withdraw', withdrawing: 'withdraw',
  payout: 'payout', payouts: 'payout',
  // 215476174205151: "payout eligibility" answered with "not eligible for payouts".
  eligible: 'eligible', eligibility: 'eligible', ineligible: 'eligible',
  profit: 'profit', profits: 'profit', profitable: 'profit', profitability: 'profit',
  trade: 'trade', trades: 'trade', trading: 'trade', trader: 'trade',
  hold: 'hold', holds: 'hold', holding: 'hold', held: 'hold',
  pass: 'pass', passes: 'pass', passed: 'pass', passing: 'pass',
  fail: 'fail', fails: 'fail', failed: 'fail', failing: 'fail', failure: 'fail',
  limit: 'limit', limits: 'limit', limited: 'limit',
  inside: 'within', within: 'within',
  // HUMAN_HANDOFF_CONCEPT_V1 (2026-09-26, live 215476097094954): "can i have an actual agent here" is answered by
  // "forwarded to a human teammate"; the words differ, the concept is the same.
  agent: 'human', agents: 'human', human: 'human', humans: 'human', person: 'human', people: 'human', representative: 'human',
  rep: 'human', staff: 'human', teammate: 'human', teammates: 'human', colleague: 'human', colleagues: 'human',
  // live 215476101110604: "what the limitation is?" answered with "risk limit ... 4% daily loss limit".
  limitation: 'limit', limitations: 'limit', restriction: 'limit', restrictions: 'limit', cap: 'limit', caps: 'limit',
  reset: 'reset', resets: 'reset', resetting: 'reset',
  allow: 'allow', allows: 'allow', allowed: 'allow', allowance: 'allow',
  drawdown: 'drawdown', drawdowns: 'drawdown',
  max: 'max', maximum: 'max', min: 'min', minimum: 'min', least: 'min', most: 'max',
  // Live MISSED_QUESTION (multi-account breach / login): clients say "the rest" / "log in";
  // correct answers say "remaining" / "credentials" / "login". Without these equivalences a
  // right answer scored ~0.43 and was held as unanswered.
  rest: 'remain', remaining: 'remain', others: 'remain', other: 'remain',
  log: 'login', login: 'login', credentials: 'login', credential: 'login',
  happen: 'happen', happens: 'happen', happening: 'happen',
}));

// A "how much / how many / how long / how often" ask requests a figure. Concept
// overlap alone cannot tell a real answer ("the daily loss limit is 5% ... $2,500")
// from a topic echo that states nothing ("thanks for asking about your daily loss,
// let me look into it") — both share the same words. Requiring a figure in the
// reply keeps the gate closed on the echo while the equivalence map above lets the
// real answer through. This tightens coverage; it never accepts more.
// A holding line shares the ask's words but answers nothing, so it must never satisfy the
// relaxed weak-word path below.
// A reply that deliberately declines the question: out-of-scope, another company, or a
// personal-life boundary. Matches the sense rather than one fixed wording, because the
// scope-decline and personal-boundary pools both rotate their phrasing.
const DECLINE_REPLY_RE = /\b(?:only (?:handle|cover|help with)\s+fundedelite|outside what i (?:can help with|cover)|not something i can (?:help with|get into|speak to|discuss)|can(?:'t|not) (?:get into|help with|discuss|speak to)|i'll have to pass on|separate company|another (?:proprietary trading firm|company)|different company|personal (?:topics?|matters?|questions?|life|masail)|don'?t discuss personal|personal masail discuss nahi)\b/i;

// Prefatory wrapper around a numbered multi-ask ("Could you please confirm the following...?").
// Live Lite 2-Step ticket: a complete answer covering every numbered rule still missed this
// meta-ask alone and failed MISSED_QUESTION. Drop it when the same burst has real asks.
const PREFATORY_ASK_RE = /^(?:(?:could|can|would)\s+you\s+)?(?:please\s+)?(?:confirm|answer|clarify|address|cover|tell\s+me|explain)\s+(?:the\s+)?(?:following|below|these|those)\b/i;

// Cross-company / promo auto-replies (WeMasterTrade, WeCopyTrade, expo spam). Not FundedElite
// client questions; treating them as asks floods MISSED_QUESTION on correct scope declines.
const FOREIGN_AUTOREPLY_RE = /\b(?:wemastertrade|wecopytrade|we\s*master\s*trade|we\s*copy\s*trade)\b|\b(?:london\s+prop\s+trading\s+expo|prop\s+trading\s+expo)\b/i;

const HOLDING_REPLY_RE = /\b(?:let me (?:check|confirm|look|see)|i(?:'ll| will) (?:check|confirm|look|find out|get back)|looking into|i am checking|checking this now|our team will (?:check|confirm|review|look)|(?:has|have) been (?:received|noted|logged|forwarded)|we(?:'ve| have) received|thanks for (?:your|the) (?:question|message|details))\b/i;

const WEAK_ASK_WORDS = new Set(['anything', 'something', 'different', 'differences', 'difference', 'special', 'else', 'extra', 'about', 'regarding', 'concerning', 'thing', 'things',
  // SCOPE_ASK_FRAMING_V1 (2026-09-25, live 215476097191720): "just wanted to know if multi IP rule includes also
  // situations when I'm changing locations inside of my country?" - the framing of a yes/no scope question. A correct
  // "notify support before using a different IP, even within the same country" scored 0.44 and was held.
  'wanted', 'want', 'know', 'just', 'hey', 'rule', 'rules', 'include', 'includes', 'included', 'including', 'situation', 'situations',
  'case', 'cases', 'scenario', 'scenarios',
  // HUMAN_HANDOFF_CONCEPT_V1: the framing of "can I speak/talk to a real/actual person".
  'speak', 'talk', 'real', 'actual', 'actually',
  // ASK_CORE_V1: every ask is implicitly about FundedElite; naming the firm is not something the answer must repeat.
  'fundedelite']);

// "what is the minimum/maximum X?" requests a value just as much as "how long?" does, so it
// carries the same requirement that the reply actually state a figure. This TIGHTENS the
// check: a reply that only echoes the ask's words ("let me check the minimum holding time")
// is still reported missed.
const QUANTITY_ASK_RE = /\bhow\s+(?:much|many|long|often)\b|\bwhat(?:'s| is|\s+are)?\s+(?:the\s+)?(?:minimum|maximum|max|min)\b/i;
// A bare digit is not an answer: the "2" in "2-Step" satisfied the old check, so
// "On the 2-Step challenge, holding time depends on your add-ons" counted as a duration.
// A quantity ask must be answered with a figure carrying a unit (or an explicit "no limit").
const FIGURE_RE = /(?:\$\s?\d|\d[\d,.]*\s*(?:%|percent|minutes?|mins?\b|seconds?|secs?\b|hours?|hrs?\b|days?|weeks?|months?|years?|usd|eur|gbp|k\b|pips?)|\b\d[\d,]*\s*(?:,\d{3})+)|\b(?:unlimited|no\s+limit|none)\b/i;
// FIGURE_QUALIFIED_DURATION_V1 (2026-09-24): "3 trading days", "5 profitable days", "2 business days",
// "14 calendar days", "30 consecutive days", "1 trading day" are figures with a unit. FIGURE_RE needs the
// unit right after the number, so a correct "the live phase requires 3 trading days" answer to "how
// many profitable days ...?" was reported MISSED_QUESTION (real-model R5b, 0/3). Only up to two words
// from this fixed qualifier list may sit between the number and a TIME unit; any other word still fails.
const DURATION_QUALIFIER = '(?:trading|profitable|business|calendar|consecutive|working|full|separate|additional|extra|winning|qualifying|valid|minimum|min)';
const QUALIFIED_DURATION_RE = new RegExp(
  '\\b\\d[\\d,.]*\\*{0,2}\\s+(?:' + DURATION_QUALIFIER + '\\s+){1,2}(?:minutes?|mins?|seconds?|secs?|hours?|hrs?|days?|weeks?|months?|years?)\\b', 'i');
const hasFigure = (t) => FIGURE_RE.test(t) || QUALIFIED_DURATION_RE.test(t);

// QUANTITY_UNIT_MATCH_V1: the figure must be of the KIND asked for. "How many profitable days ...?"
// was satisfied by "the profit target is 8%" because any percentage counted as a figure. Time asks need
// a time figure, "how many <things>" needs a count of those things; an explicit "no minimum / none /
// unlimited / not required" answers either. Other quantity asks ("how much ...") keep hasFigure().
const NUM_SRC = '(?:\\d[\\d,.]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|ninety|a|an|single)';
const TIME_UNIT_SRC = '(?:minutes?|mins?|seconds?|secs?|hours?|hrs?|days?|weeks?|months?|years?)';
const TIME_FIGURE_RE = new RegExp('(?:\\b' + NUM_SRC + '\\*{0,2}\\s*(?:-\\s*)?(?:' + DURATION_QUALIFIER + '\\s+){0,2}' + TIME_UNIT_SRC + '\\b|\\b\\d+\\s*h\\b)', 'i');
const NO_QUANTITY_RE = /\b(?:no\s+(?:minimum|maximum|max|min|limit|specific|fixed|set|required|required\s+number)|unlimited|none|not\s+required|isn'?t\s+required|no\s+(?:time|day|days)\s+limit)\b/i;
const TIME_ASK_RE = new RegExp('\\bhow\\s+(?:long|often|soon)\\b|\\bhow\\s+much\\s+time\\b|\\bhow\\s+many\\s+(?:[a-z-]+\\s+){0,2}' + TIME_UNIT_SRC + '\\b|\\b(?:minimum|maximum|max|min)\\s+(?:[a-z-]+\\s+){0,2}(?:' + TIME_UNIT_SRC + '|time|duration|period)\\b', 'i');
const COUNT_ASK_RE = /\bhow\s+many\s+((?:[a-z-]+\s+){0,2}?)([a-z]{3,}s)\b/i;
// NOT_PUBLISHED_ANSWER_V1 (2026-09-24, P1): when approved knowledge publishes no figure (e.g. payout processing
// time), the honest answer says so. "No fixed processing time is published" answers a "how long" question;
// before, only a number counted, so the honest answer was held as MISSED_QUESTION and the customer got silence.
// Word overlap with the question is still required afterwards (isCovered).
// NOT_PUBLISHED_WORDING_V2 (2026-09-24, live 215476084572778): honest "the approved information does
// not settle this" answers are worded many ways ("the rules don't specifically confirm", "doesn't
// clarify", "I can't confirm that", "not addressed in the rules"). Only a few were recognised, so a
// correct NOT_PUBLISHED answer was held as MISSED_QUESTION and, under a teammate's delegation, the
// customer got silence. The topic-overlap requirement at each use site is unchanged.
const NOT_PUBLISHED_RE = /\b(?:(?:is|are)\s+not|isn'?t|aren'?t|not)\s+(?:publicly\s+|specifically\s+|explicitly\s+|clearly\s+)?(?:published|stated|specified|listed|documented|provided|given|addressed|covered|mentioned|confirmed|defined)\b|\b(?:does|do)(?:\s+not|n['\u2019]?t)\s+(?:specifically\s+|explicitly\s+|clearly\s+)?(?:publish|state|specify|list|give|provide|include|set|confirm|clarify|say|address|cover|mention|define)\b|\b(?:can(?:['\u2019]?t|not)|unable\s+to)\s+confirm\b|\bno\s+(?:published|stated|official|fixed|set|specific|guaranteed|standard)\s+(?:[a-z-]+\s+){0,2}(?:time|timeframe|time\s*frame|timeline|period|duration|number|figure|amount|limit)\b/i;
function quantityAnswered(ask, reply) {
  const a = String(ask || ''); const r = String(reply || '');
  if (NO_QUANTITY_RE.test(r) || NOT_PUBLISHED_RE.test(r)) return true;
  if (TIME_ASK_RE.test(a)) return TIME_FIGURE_RE.test(r);
  const cm = a.match(COUNT_ASK_RE);
  if (cm) {
    const w = cm[2].toLowerCase();
    const stem = /ies$/.test(w) ? w.slice(0, -3) + 'y' : /(?:ss|x|ch|sh)es$/.test(w) ? w.slice(0, -2) : w.slice(0, -1);
    const nounRe = new RegExp('\\b' + NUM_SRC + '\\*{0,2}\\s+(?:[a-z-]+\\s+){0,2}' + stem.replace(/[^a-z]/g, '') + '(?:s|es)?\\b', 'i');
    return nounRe.test(r);
  }
  return hasFigure(r);
}

// "Are you a real person or a bot?" is answered by disclosing what Luna is, and that
// disclosure shares no vocabulary with the question, so word overlap scores 0 and the
// honest answer gets reported as an unanswered question. Reuse the live identity guard
// for the ask side; the reply still has to actually disclose.
let __identityGuard = null;
try { __identityGuard = require('../assistantIdentityGuard'); } catch (_) { __identityGuard = null; }
const AI_DISCLOSURE_RE = /\b(?:a[in]\s+(?:ai|assistant|bot)|artificial intelligence|automated|virtual assistant|ai assistant|not a human|i'?m an ai|i am an ai)\b/i;
function isIdentityAsk(text) {
  try {
    return !!(__identityGuard && __identityGuard.isDirectIdentityQuestion(text));
  } catch (_) {
    return false;
  }
}

// Clients write "200k"; answers write "$200,000" or "$200K". normalize() also splits on the
// comma, so "200,000" became two tokens and the size never matched at all. Fold every form to
// a bare number before tokenizing so they compare equal. Sizes are the whole point of many
// asks, so a mismatch here reports an answered question as unanswered.
// In this domain "hold a position" and "keep / stay / remain open" are the same concept, but
// they share no vocabulary, so a correct holding-time answer ("positions must remain open for
// at least 3 minutes") scored below the threshold against an ask about "holding time" and was
// escalated. Normalize the phrase before tokenizing. Narrow and domain-grounded; the figure
// requirement and the remaining token matches still apply.
// A garbled question ("waht is instnt chalenge draw down ?") shares almost no tokens with a
// correct answer, so coverage scored 0 and a perfect reply was reported as leaving the question
// unanswered. Compare in the same spelling space the knowledge is written in.
/**
 * An actionable account/support statement: the client is reporting that something on their side
 * is broken or blocked. These carry no question mark and often fall under the 3-token bar once
 * stopwords are removed ("my payout was rejected" -> payout, rejected), so they were never
 * scored for coverage at all and a reply that ignored them passed the gate. Recognising them
 * lets the existing workflow run: the draft fails closed, the handler classifies the turn and
 * the identity collect-first / escalation rules apply unchanged.
 */
/* TURN_INTENT_V1 (2026-09-28, live 215476138819546): conversation management ("I have some questions, are you free to
 * help me?", "can I ask something?", "can we continue?") and courtesy are never coverage units. "are you free to help
 * me?" was a question unit no reply could "answer", so MISSED_QUESTION held the correct "Of course, go ahead!" draft and
 * the held turn ended in the canned scope refusal. One source: statePresend/turnIntent. */
const __turnIntent = require('./turnIntent');
function isConversational(q) {
  if (isGreetingOrSmallTalk(q)) return true;
  try { return __turnIntent.isConversationalOnly(q); } catch (_) { return false; }
}
const SUPPORT_PROBLEM_RE = /\b(?:rejected|denied|declined|blocked|disabled|deactivated|banned|suspended|locked|breached|failed|failing|stuck|pending|frozen|missing|gone|disappeared|expired|error|not\s+work\w*|doesn'?t\s+work|isn'?t\s+work\w*|can(?:'?t|not)\s+(?:access|log\s*in|login|open|withdraw|request)|unable\s+to|no\s+longer\s+(?:work|access)|won'?t\s+(?:open|load|work))\b/i;
const SUPPORT_OWNER_RE = /\b(?:my|mine|i|we|our)\b|\baccount\s*#?\s*\d{4,12}\b/i;

function isActionableSupportStatement(text) {
  const t = stripHtml(text);
  if (!t || isShortAck(t) || isConversational(t)) return false;
  if (!SUPPORT_PROBLEM_RE.test(t)) return false;
  // Either the client is talking about their own side, or they named a FundedElite thing
  // ("payout button is disabled").
  return SUPPORT_OWNER_RE.test(t) || extractTopics(t).length > 0;
}

function readThroughTypos(s) {
  try { return require('./typoNormalizer').normalizeText(String(s || '')); } catch (_) { return String(s || ''); }
}

function normalizeDomainPhrases(s) {
  return String(s || '')
    .replace(/\b(?:stay|stays|stayed|staying|remain|remains|remained|remaining|keep|keeps|kept|keeping)\s+(?:it\s+|them\s+|the\s+(?:trade|position)s?\s+)?open\b/gi, 'hold')
    .replace(/\b(?:open|hold)\s+(?:a\s+|the\s+)?(?:trade|position)s?\s+for\b/gi, 'hold for');
}

// FIGURE_FORMS_V1 (2026-09-26, live 215476109613017): "win 50,000 USD on a 80:20 split" and the correct
// "$50,000 ... 80% split" are the same figures written differently; the currency word, the percent sign and
// the trader:firm ratio kept them apart, so an answered calculation was reported MISSED_QUESTION.
function normalizeSizes(s) {
  return String(s || '')
    .replace(/\b(\d{1,2})\s*[:/]\s*(\d{1,2})\b/g, (m, a, b) => (Number(a) + Number(b) === 100 ? a : m))
    .replace(/\b(?:usd|eur|gbp)\s?(?=\d)/gi, '')
    .replace(/(\d)\s*(?:usd|us\s+dollars?|dollars?|bucks|eur|euros?|gbp)\b/gi, '$1')
    .replace(/(\d)\s?%/g, '$1')
    .replace(/\$\s?(?=\d)/g, '')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\b(\d+(?:\.\d+)?)\s?k\b/gi, (m, n) => String(Math.round(parseFloat(n) * 1000)));
}

function conceptToken(t) {
  const direct = CONCEPT_EQUIV.get(t);
  if (direct) return direct;
  const s = stem(t);
  return CONCEPT_EQUIV.get(s) || s;
}

/** fraction of the ask's concept tokens present in the reply's concept tokens */
// Product names are written "1 step" by clients and "1-Step" in answers; tokens() keeps the
// hyphen, so "1-step" never matched "1" + "step". Split hyphenated tokens before comparing.
const splitHyphen = (toks) => toks.flatMap((t) => (/[a-z0-9]-[a-z0-9]/.test(t) ? t.split('-').filter(Boolean) : [t]));

// Product-name words appear in almost every answer about that product, so matching only on
// them ("Lite 1-Step ... profit split") must not count as answering a different question
// about that product ("max drawdown on the lite 1 step"). At least one non-product word of
// the ask has to be present in the reply as well. This only ever tightens coverage.
const PRODUCT_WORDS = new Set(['lite', 'step', '1', '2', 'instant', 'flash', 'catalyst', 'challenge', 'challenges', 'elite', 'standard', 'free', 'retry', 'activation']);

function conceptOverlap(askToks, replyToks) {
  const H = new Set(splitHyphen(replyToks).map(conceptToken));
  const N = [...new Set(splitHyphen(askToks).map(conceptToken))];
  if (!N.length) return 0;
  let hit = 0;
  for (const t of N) if (H.has(t)) hit += 1;
  const topical = N.filter((t) => !PRODUCT_WORDS.has(t));
  if (topical.length && !topical.some((t) => H.has(t))) return 0;
  return hit / N.length;
}

// "What services/products/things do you offer/have/provide?" - a generic capability
// question, not a request for a specific fact. See isCovered() below for why this needs a
// looser coverage check than the strict word-overlap ratio.
const GENERIC_OFFERINGS_ASK_RE = /^what\s+(?:services?|products?|things?|programs?|options?|packages?)\s+do\s+you\s+(?:guys\s+)?(?:offer|have|provide)\s*\??$|^what\s+do\s+you\s+(?:guys\s+)?(?:offer|have|provide)\s*\??$/i;
const GENERIC_TWO_STEP_ASK_RE = /^(?:what\s+is|what'?s|tell\s+me\s+about|explain)\s+(?:the\s+)?2[\s-]*step\s+challenge\s*\??$/i;
const MEANING_FOLLOWUP_RE = /^(?:w?hat\s+do\s+you\s+mean|what\s+does\s+that\s+mean|can\s+you\s+explain\s+what\s+you\s+mean)\s*\??$/i;
const BOTH_TWO_STEP_VARIANTS_RE = /\b2[\s-]*step\b[\s\S]*\blite\b[\s\S]*\bfree\s*retry\b|\b2[\s-]*step\b[\s\S]*\bfree\s*retry\b[\s\S]*\blite\b/i;

/**
 * COMMA_ASK_SPLIT_V1: "What is the daily loss limit on the 2-Step, can I hold trades over the weekend,
 * and how do payouts work?" The conjunction split leaves the first two asks glued together, so a weekend
 * answer covers the daily-loss ask. Split on a comma only when every piece starts as its own question.
 */
function splitCommaAsks(q) {
  const ASK_START = /^(?:what|how|when|where|why|which|who|can|could|do|does|did|is|are|will|would|should)\b/i;
  const COMMA_ASK = /\s*,\s+(?=(?:what|how|when|where|why|which|who|can|could|do|does|did|is|are|will|would|should)\b)/i;
  const t = String(q || '').trim();
  if (!COMMA_ASK.test(t)) return [t];
  const sub = t.split(COMMA_ASK).map((x) => x.trim().replace(/[,\s]+$/, '')).filter(Boolean);
  if (sub.length < 2 || !sub.every((s) => ASK_START.test(s))) return [t];
  // "When I use a VPN, will my account be flagged?" is one question. The clause before the comma
  // is subordinate, not its own ask.
  if (sub.slice(0, -1).some((s) => /^(?:when|whenever|if|once|while|after|before)\s+(?:i|we|my|the)\b/i.test(s))) return [t];
  return sub.map((p, i) => (/\?$/.test(p) ? p : p + '?'));
}

/** "daily loss and max loss" / "target and minimum trading days" are two asks, not one. */
function splitCoordinatedAsks(q) {
  const t = String(q || '').trim();
  const pairs = [
    /\b(daily\s+loss(?:\s+limit)?)\b[\s\S]{0,60}\b(max(?:imum)?\s+loss(?:\s+limit)?)\b/i,
    /\b((?:profit\s+)?target)\b[\s\S]{0,80}\b(minimum\s+(?:profitable\s+|trading\s+|calendar\s+)?days|profitable\s+days|trading\s+days|calendar\s+days)\b/i,
  ];
  for (const re of pairs) {
    const m = t.match(re);
    if (!m) continue;
    return [`What is the ${m[1]}?`, `What is the ${m[2]}?`];
  }
  return [t];
}

const ACCOUNT_ASK_RE = /\b(?:why\s+(?:is|was|did)\s+my|my\s+(?:payout|withdrawal|account)\b[^.?]{0,80}\b(?:still|pending|rejected|denied|closed|stuck|not\s+approved)|check\s+why\s+my\s+account|my\s+account\s+(?:was|is|got)\s+closed)\b/i;
const WITH_TEAM_RE = /\b(?:with the team|forwarded (?:this|it|that)|human support teammate|a teammate will|the team will (?:review|look|check)|share your account|account number)\b/i;
const CLARIFY_IN_REPLY_RE = /\b(?:which|what)\s+(?:product|challenge|stage|phase|plan|version|account size)\b|\bcould you (?:tell me |confirm )?(?:which|what)\b|\bdo you mean\b/i;

function isAccountSpecificAsk(text) {
  const t = String(text || '');
  if (/\b(?:does|do|will|can|if)\b/.test(t) && /\b(?:soft\s*breach|rule|limit|policy)\b/i.test(t) && !/\b(?:still|pending|rejected|closed|not approved|check why)\b/i.test(t)) return false;
  // PAYOUT_REJECTION_POLICY_NOT_ACCOUNT_V1: "If my payout is rejected, can I request it again?"
  // matches "my payout ... rejected", but it is the rule. A published answer must be allowed
  // to cover it. "Why was my payout rejected?" is not a policy question and stays account-specific.
  try {
    const gates = require('../identityEscalateGates');
    if (gates && typeof gates.isPayoutRejectionPolicyQuestion === 'function' && gates.isPayoutRejectionPolicyQuestion(t)) return false;
  } catch (_) { /* gates are optional when this file is loaded alone */ }
  return ACCOUNT_ASK_RE.test(t);
}

/**
 * Classify one ask against the draft and conversation state before calling it missed.
 * Classes: ANSWERABLE_GENERAL, ACCOUNT_SPECIFIC, ALREADY_ESCALATED_OR_HELD,
 * UNSUPPORTED_GENERAL_INFORMATION, NEEDS_CLARIFICATION, TRUE_UNANSWERED_ASK.
 */
/**
 * NOT_PUBLISHED outcome for one ask: a reply SENTENCE states that the approved information does not
 * settle something, and that sentence is about this ask (topic overlap with the sentence itself, not
 * with the whole reply, so a long question is not held to the whole-reply overlap threshold). An
 * honest "not published" about a different topic does not count.
 */
function notPublishedSentenceCovers(ask, reply) {
  const askToks = tokens(normalizeSizes(normalizeDomainPhrases(readThroughTypos(ask)))).filter((t) => !WEAK_ASK_WORDS.has(t));
  if (!askToks.length) return false;
  const sentences = stripHtml(reply).split(/(?<=[.!?])\s+|\n+/);
  for (const sent of sentences) {
    if (!NOT_PUBLISHED_RE.test(sent)) continue;
    if (conceptOverlap(askToks, tokens(normalizeSizes(normalizeDomainPhrases(sent)))) >= 0.3) return true;
  }
  return false;
}

// CLARIFY_SCOPED_TO_ASK_V1 (2026-09-26, real-model replay fmt-multi-3topics): "What is the daily loss limit on the 2-Step,
// can I hold trades over the weekend, and how do payouts work?" was answered ONLY with "Do you mean 2-Step Lite or 2-Step +
// Free Retry? Their daily loss limits differ." Any clarification anywhere in the reply excused EVERY uncovered ask as
// NEEDS_CLARIFICATION, so the unanswered payout question passed. With several asks, a clarification only excuses the ask it
// is about: the ask names the product family the clarification names, or shares a topical word with the clarification
// sentence (or the sentence right after it). A single ask keeps the old behaviour.
const CLARIFY_FAMILY_RES = [/\b(?:2|two)[\s-]*step\b/i, /\b(?:1|one)[\s-]*step\b/i, /\binstant\b/i];
// A variant question is a clarification even without "which"/"do you mean": "Is your challenge 2-Step Lite or 2-Step + Free Retry?"
const VARIANT_QUESTION_RE = /\blite\b[^?]{0,60}\bfree[\s-]*retry\b[^?]*\?|\bfree[\s-]*retry\b[^?]{0,60}\blite\b[^?]*\?|\binstant\b[^?]{0,40}\binstant\s+elite\b[^?]*\?/i;
const isClarifySentence = (x) => CLARIFY_IN_REPLY_RE.test(x) || VARIANT_QUESTION_RE.test(x);
const VARIANT_NAMES_RE = /\blite\b[\s\S]{0,80}\bfree[\s-]*retry\b|\bfree[\s-]*retry\b[\s\S]{0,80}\blite\b|\binstant\s+elite\b/i;
function clarificationWindow(reply) {
  const sents = stripHtml(String(reply || '')).split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  const win = []; const idx = new Set();
  sents.forEach((x, i) => {
    const prev = sents[i - 1] || '';
    // "...depend on whether you mean 2-Step Lite or 2-Step + Free Retry. Which one do you have?"
    const whichAfterVariants = /\?/.test(x) && /\bwhich\b/i.test(x) && VARIANT_NAMES_RE.test(prev);
    if (!isClarifySentence(x) && !whichAfterVariants) return;
    if (i > 0 && VARIANT_NAMES_RE.test(prev)) idx.add(i - 1);
    idx.add(i);
    if (sents[i + 1]) idx.add(i + 1);
  });
  [...idx].sort((a, b) => a - b).forEach((i) => win.push(sents[i]));
  // What the reply says OUTSIDE the clarification: headings ([[..]] or short unpunctuated lines) are labels, not answers.
  const rest = sents.filter((x, i) => !idx.has(i) && !/^\[\[[^\]]*\]\]$/.test(x) &&
    !(x.split(/\s+/).length <= 6 && !/[.!?:]$/.test(x))).join(' ');
  return { win, rest };
}
function clarificationTargetsAsk(ask, reply) {
  const { win } = clarificationWindow(reply);
  if (!win.length) return true;
  const w = win.join(' ');
  const a = String(ask || '');
  // A "Lite or Free Retry?" question covers only the asks whose answer depends on the variant (VARIANT_CLARIFY_SCOPE_V1).
  try {
    const v = require('../challengeVariantGuard').variantClarificationCoversAsk(a, w);
    if (v !== null && v !== undefined) return v;
  } catch (_) { /* fall back to the topical check below */ }
  if (CLARIFY_FAMILY_RES.some((re) => re.test(a) && re.test(w))) return true;
  const askToks = tokens(normalizeSizes(normalizeDomainPhrases(readThroughTypos(askCore(a))))).filter((t) => !WEAK_ASK_WORDS.has(t));
  if (!askToks.length) return true;
  return conceptOverlap(askToks, tokens(normalizeSizes(normalizeDomainPhrases(w)))) > 0;
}

function classifyAsk(ask, draft, state, opts) {
  const text = String((ask && ask.text) || ask || '');
  const reply = String(draft || '');
  const st = state || {};
  const held = !!(st.escalated || st.human_active || st.current_stage === 'human_handling' || st.current_stage === 'escalated');
  const account = isAccountSpecificAsk(text);
  if (account && (held || WITH_TEAM_RE.test(reply))) {
    return { text, class: 'ALREADY_ESCALATED_OR_HELD', covered: true };
  }
  if (account) return { text, class: 'ACCOUNT_SPECIFIC', covered: WITH_TEAM_RE.test(reply) };
  // SHARED_FACT_NOT_DEFERRED_V1: in a mixed 2-Step/1-Step message, weekend holding, the payout
  // schedule and the platform pair are the same on both versions. A dashboard mention, "the
  // trading platform", "I'll tell you once you pick a version", or a "not published" line does
  // not answer them. This runs before the not-published excuse so that excuse cannot hide a
  // fact the approved articles do state.
  if (opts && opts.variantMixed) {
    let status = 'n/a';
    try { status = require('../challengeVariantGuard').sharedFactStatus(text, reply); } catch (_) { status = 'n/a'; }
    if (status === 'missing') return { text, class: 'TRUE_UNANSWERED_ASK', covered: false };
    if (status === 'ok') return { text, class: 'ANSWERABLE_GENERAL', covered: true };
  }
  const judgedEarly = String((ask && ask.resolvedText) || '');
  const coveredEither = (a, b) => isCovered(a, b) || (judgedEarly && judgedEarly !== a && isCovered(judgedEarly, b));
  if (NOT_PUBLISHED_RE.test(reply) && (coveredEither(text, reply) || notPublishedSentenceCovers(text, reply) || (judgedEarly && notPublishedSentenceCovers(judgedEarly, reply)))) {
    return { text, class: 'UNSUPPORTED_GENERAL_INFORMATION', covered: true };
  }
  // A mention inside the clarification ("...before giving you the correct limit and payout details") or in a heading is
  // not an answer to an ask the clarification does not legitimately cover.
  if (opts && opts.multi && clarificationWindow(reply).win.length && !clarificationTargetsAsk(text, reply) &&
      !coveredEither(text, clarificationWindow(reply).rest)) {
    return { text, class: 'TRUE_UNANSWERED_ASK', covered: false };
  }
  if (CLARIFY_IN_REPLY_RE.test(reply) && !coveredEither(text, reply) &&
      (!(opts && opts.multi) || clarificationTargetsAsk(text, reply))) {
    return { text, class: 'NEEDS_CLARIFICATION', covered: true };
  }
  const judged = String((ask && ask.resolvedText) || '');
  const covered = isCovered(text, reply) || (judged && judged !== text && isCovered(judged, reply));
  if (covered) return { text, class: 'ANSWERABLE_GENERAL', covered: true };
  return { text, class: 'TRUE_UNANSWERED_ASK', covered: false };
}

// CONTEXTUAL_EPISODE_V1. A carried question stays only inside the active support
// episode. Resolution, closure, an explicit withdraw, a teammate/Luna answer, or
// a later new issue (long gap or a second topic change) drops it. One immediate
// extra question does not: an unanswered crypto-timing ask is still carried when
// the next message asks daily loss. Time is only a supporting signal.
function supportTopicSet(text) {
  const s = new Set(extractTopics(text));
  const t = String(text || '');
  if (/\b(?:crypto|usdt|trc-?20|erc-?20)\b/i.test(t) && !/\bcrypto\s+(?:price|market)\b/i.test(t)) s.add('crypto');
  if (/\bwallet\b/i.test(t) && !/\bbank\b/i.test(t) && !/\bcrypto\s+(?:price|market)\b/i.test(t)) s.add('crypto');
  if (/\b(?:bank|wire|sepa|iban|swift)\b/i.test(t)) s.add('bank');
  if (/\bcards?\b/i.test(t)) s.add('card');
  if (/\b(?:brother|sister|household|same\s+house|same\s+home)\b/i.test(t)) s.add('household');
  if (/\b(?:violat\w*|breach\w*)\b/i.test(t)) s.add('violation');
  if (/\bmax(?:imum)?\s+(?:loss|drawdown)\b/i.test(t)) s.add('max_loss');
  if (/\bdaily\s+(?:loss|drawdown)\b|\bdll\b/i.test(t)) s.add('daily_loss');
  if (/\bevaluation\b/i.test(t)) s.add('evaluation');
  if (/\bfunded\b/i.test(t)) s.add('funded');
  if (/\bnews\b/i.test(t)) s.add('news');
  if (/\b(?:payouts?|withdraw\w*)\b/i.test(t)) s.add('payout');
  return s;
}

function messageTs(m) {
  const n = Number(m && (m.ts || m.created_at) || 0) || 0;
  if (!n) return 0;
  return n > 1e12 ? Math.floor(n / 1000) : n;
}

function episodeNoise(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (isReferentialNudge(t) || isShortAck(t) || isConversational(t)) return true;
  if (/^(?:and\s+)?update\s+me\b/i.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 8 && /^(?:and|so|then|also)\b/i.test(t) && !supportTopicSet(t).size) return true;
  return false;
}

function sameSupportIssue(q, later, qTopics, laterTopics) {
  // "payout" alone is not the same issue: a September card/reset payout and an
  // October payout-date question share the word and are still different episodes.
  // A specific facet (card, crypto, violation) or a real restatement revives it.
  const generic = new Set(['payout', 'timing']);
  const specA = [...qTopics].filter((t) => !generic.has(t));
  const specB = [...laterTopics].filter((t) => !generic.has(t));
  if (specA.length && specB.some((t) => specA.includes(t))) return true;
  if (overlapRatio(tokens(q), tokens(later)) >= 0.45) return true;
  return false;
}

function outsideActiveEpisode(q, qIdx, msgs) {
  const qTopics = supportTopicSet(q);
  const qTs = messageTs(msgs[qIdx]);
  let disjoint = 0;
  let longGap = false;
  let closed = false;
  let latest = '';
  for (let j = qIdx + 1; j < msgs.length; j += 1) {
    const m = msgs[j];
    if (!m || m.role !== 'client') continue;
    const text = stripQuotedHistory(m.text || '');
    if (!text) continue;
    const ts = messageTs(m);
    if (qTs && ts && ts - qTs >= 36 * 3600) longGap = true;
    try {
      if (require('../reviewRequestFlow').isResolutionClosure(text)) { closed = true; continue; }
    } catch (_) { /* closure helper optional */ }
    if (clientWithdrewQuestion(text)) return 'WITHDRAWN';
    if (episodeNoise(text)) continue;
    const mt = supportTopicSet(text);
    if (sameSupportIssue(q, text, qTopics, mt)) { latest = 'revive'; closed = false; continue; }
    if (mt.size || tokens(text).length >= 6) {
      disjoint += 1;
      latest = 'new';
      if (/\b(?:instead|rather than|forget\s+(?:the|that|about))\b/i.test(text)) return 'SUPERSEDED';
    }
  }
  if (latest === 'revive') return '';
  // "all clear" / "resolved" ends the open questions in this episode. A later
  // message about the same subject clears that and the question may return.
  if (closed && latest !== 'new') return 'RESOLVED';
  if (latest !== 'new') return '';
  if (closed || longGap || disjoint >= 2) return 'EPISODE_EXPIRED';
  return '';
}

function resolutionLabel(q, msgs, i) {
  for (let j = i + 1; j < msgs.length; j += 1) {
    const m = msgs[j];
    if (!m) continue;
    if (m.role === 'client') {
      if (clientWithdrewQuestion(m.text)) return 'WITHDRAWN';
      try {
        if (require('../reviewRequestFlow').isResolutionClosure(m.text)) return 'RESOLVED';
      } catch (_) { /* optional */ }
      continue;
    }
    if (m.role !== 'bot' && m.role !== 'human') continue;
    const r = stripHtml(m.text || '');
    if (!r || isOnlyStockClarification(r)) continue;
    if (timingAnswerCovers(q, r) || isCovered(q, r)) return m.role === 'human' ? 'RESOLVED_BY_TEAMMATE' : 'RESOLVED_BY_LUNA';
  }
  return 'RESOLVED_BY_LUNA';
}

function withResolvedAsk(unit, msgs, idx) {
  try {
    const hist = [];
    for (let k = 0; k < idx; k += 1) {
      const m = msgs[k];
      if (!m || !m.text) continue;
      hist.push({ role: m.role, text: m.text, ts: m.ts || 0 });
    }
    const full = stripQuotedHistory((msgs[idx] && msgs[idx].text) || '');
    const bit = String(unit.text || '').trim();
    if (full && bit && full !== bit) {
      const rest = full.replace(bit, ' ').replace(/\s+/g, ' ').trim();
      if (rest.length > 12) hist.push({ role: 'client', text: rest, ts: (msgs[idx] && msgs[idx].ts) || 0 });
    }
    if (!hist.length) return unit;
    const r = __turnIntent.resolveContextualIntent(unit.text, { history: hist, supportContext: true });
    if (r && r.resolvedAsk && r.intent === 'SUPPORT_QUESTION') {
      unit.resolvedText = r.resolvedAsk;
      unit.intentReason = r.reason;
    }
  } catch (_) { /* keep the original unit */ }
  return unit;
}

/**
 * Extract asks from an ordered list of normalised messages
 * ({role:'client'|'bot'|'human', text}). Only client messages after the last
 * bot/human reply form the current burst; earlier client questions that were
 * never answered are included as `carried`.
 */
const REQUEST_FRAGMENT_RE = /\b(?:can|could|would|will)\s+(?:you|u)\s+(?:please\s+|pls\s+|plz\s+|kindly\s+)?(?:explain|clarify|describe|elaborate|tell\s+me|tell\s+us|break\s+(?:it|this|that)\s+down)\b|\b(?:please|pls|plz|kindly)\s+(?:explain|clarify|describe|elaborate|tell\s+me)\b|^\s*(?:explain|clarify)\b/i;

function extractAsks(messages, opts) {
  const maxCarried = (opts && opts.maxCarried) || 3;
  const msgs = Array.isArray(messages) ? messages : [];
  let lastReplyIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'bot' || msgs[i].role === 'human') { lastReplyIdx = i; break; }

  const burst = [];
  for (let i = lastReplyIdx + 1; i < msgs.length; i++) {
    if (msgs[i].role !== 'client') continue;
    const text = stripQuotedHistory(msgs[i].text);
    if (!text || isShortAck(text)) continue;
    // EMBEDDED_ASK_UNIT_V1 (2026-09-25, live 215476097191720): "In January my payout on another account was denied
    // ... My bad. I travel frequently and I want to know if changing locations inside of my country will be flagged"
    // has no sentence-initial question, so the whole message became one support-statement that no answer could
    // cover and the turn was force-escalated. An embedded "I want to know if / whether ..." sentence is the ask.
    let qsAll = extractQuestions(text);
    if (!qsAll.length) {
      qsAll = (sentences(text) || []).filter((x) => EMBEDDED_ASK_UNIT_RE.test(x))
        .map((x) => x.replace(/^.*?\b(?=i\s+(?:\w+\s+)?(?:want(?:ed)?|would\s+like|need)\s+to\s+know\b|i(?:'m|\s+am|\s+was)\s+wondering\b)/i, '').trim());
    }
    // REQUEST_FRAGMENT_V1 (2026-09-28, live 215476135544728): "What does that mean ? On website can you please
    // explain!" kept only the first sentence; the second is a request with no question mark and no question-word
    // start, so it was silently dropped from the asks. A request sentence ("can you please explain", "please
    // clarify") is an ask: added beside the questions, or as the ask when the message has no question at all.
    {
      const have = new Set(qsAll.map((q) => String(q).trim()));
      const reqs = (sentences(text) || []).map((x) => String(x).trim())
        .filter((x) => x && !have.has(x) && REQUEST_FRAGMENT_RE.test(x) && !qsAll.some((q) => String(q).includes(x) || x.includes(String(q))));
      if (reqs.length) qsAll = qsAll.concat(reqs);
    }
    // Pure greeting / small-talk ("how are you", incl. typos like "how atre you") is not a
    // real information request; do not require the draft to answer it (MISSED_QUESTION must
    // stay fail-closed for actual unanswered questions, so only these are dropped here).
    // Foreign-company auto-replies are also not FundedElite asks.
    if (FOREIGN_AUTOREPLY_RE.test(text)) continue;
    // NOT_AN_ASK_V1 (2026-09-26, live 215476098669498): "When I attempt to turn on a VPN, the issue worsens ..." is a
    // statement (subordinate "When/If I ..." clause, no question mark), and "Please let me know if you need any additional
    // information from my end" is a courtesy offer. Neither can be answered, so as units they held correct drafts.
    let qs = qsAll.filter((q) => !isConversational(q) && !FOREIGN_AUTOREPLY_RE.test(q) &&
      !/^how\s+(?:is|can|could)\s+(?:this|that|it)\s+(?:even\s+)?possible\b/i.test(q) &&
      !(/^(?:when|whenever|if|once)\s+(?:i|we|my)\b/i.test(q) && !/\?/.test(q)) &&
      !/^(?:please\s+)?(?:do\s+)?(?:let\s+me\s+know|feel\s+free\s+to\s+(?:ask|contact|reach))\s+if\s+(?:you|there|anything)\s+(?:need|require|is\s+anything|have\s+any|want|would\s+like|further)\b/i.test(q));
    // Drop prefatory "confirm the following" wrappers when real questions sit beside them.
    const concrete = qs.filter((q) => !PREFATORY_ASK_RE.test(String(q || '').trim()));
    if (concrete.length && concrete.length < qs.length) qs = concrete;
    if (qs.length) qs.forEach((q) => splitCommaAsks(q).forEach((part) => splitCoordinatedAsks(part).forEach((bit) => burst.push(withResolvedAsk({ text: bit, source: i, kind: 'question' }, msgs, i)))));
    // PAST_CONTEXT_SCOPE_V1: a concluded past event beside a question is context, not an open problem to answer.
    else if (isActionableSupportStatement(withoutConcludedPastContext(text))) burst.push({ text, source: i, kind: 'support-statement' });
    // CLOSING_NOT_A_UNIT_V1 (2026-09-25, live 215476098849431): "Ok thank you for your assistance. Have a
    // good day" became a 'statement' unit, which disabled the greeting-only guard below, re-opened an
    // older question and sent the stock clarify. A thanks/closing/small-talk line is not something to answer.
    else if (!qsAll.length && tokens(text).length >= 3 && !isConversational(text)) burst.push({ text, source: i, kind: 'statement' });
  }

  // Carried: client questions before lastReplyIdx that no later bot/human reply covered.
  const carried = [];
  const lifecycle = [];
  const latestClient = [...msgs].reverse().find((m) => m.role === 'client');
  // A standalone greeting is a presence check, not a request to reopen every
  // older question that the word-overlap coverage heuristic may have missed.
  const onlyGreetingNow = burst.length === 0 && latestClient &&
    (isConversational(latestClient.text) || isShortAck(latestClient.text) ||
      /^\s*\?+\s*$/.test(latestClient.text || '') ||
      /^\s*(?:(?:my|current)\s+)?account\s+(?:number|no\.?|id)?\s*(?:is|:)?\s*\d{5,12}\s*$/i.test(latestClient.text || ''));
  if (onlyGreetingNow && latestClient) {
    try {
      if (require('../reviewRequestFlow').isResolutionClosure(latestClient.text)) {
        lifecycle.push({ status: 'RESOLVED', topic: '' });
      }
    } catch (_) { /* closure helper optional */ }
  }
  // CLIENT_MOVED_ON_V1 (2026-09-25, live 215476097094954): an older question that got a substantive on-topic
  // reply is handled once the client sends ANY further substantive message (a new question, a statement or a
  // complaint), not only a new question: "what does that even mean sir" was answered, the client moved on to
  // complaints, and the old question kept forcing MISSED_QUESTION -> stock clarify. A bare nudge ("??",
  // "answer me") still keeps it carried.
  const latestText = latestClient ? stripQuotedHistory(latestClient.text) : '';
  const clientAskedSomethingNew = burst.some((b) => b.kind === 'question' && !isReferentialNudge(b.text)) ||
    (!!latestText && latestText.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length >= 4 && !isReferentialNudge(latestText) &&
      !/^\s*(?:answer|reply|respond|tell\s+me|hello|hi|any\s+update)\b/i.test(latestText));
  for (let i = 0; !onlyGreetingNow && i < lastReplyIdx; i++) {
    if (msgs[i].role !== 'client') continue;
    if (FOREIGN_AUTOREPLY_RE.test(msgs[i].text || '')) continue;
    for (const q of extractQuestions(stripQuotedHistory(msgs[i].text))) {
      if (isConversational(q) || FOREIGN_AUTOREPLY_RE.test(q) || PREFATORY_ASK_RE.test(String(q || '').trim())) continue;
      const later = msgs.slice(i + 1).filter((m) => m.role === 'bot' || m.role === 'human').map((m) => m.text).join(' ');
      // A deliberate refusal already given IS the answer. Luna declines out-of-scope and
      // personal questions by design, and a decline shares no words with the question, so word
      // overlap can never see it as covered. Without this, "do you have a wife ?" stayed
      // "unanswered" for the rest of the conversation and every later draft was failed with
      // MISSED_QUESTION for not answering it - the stale-context contamination in live
      // conversation 215476025058340.
      // Deliberately NOT part of isCovered(): that also judges the draft being sent right now,
      // and a draft must never certify itself by merely sounding like a decline
      // (selftest-scope-decline-not-escalated). Only replies already sent count, and only for
      // an ask that names no FundedElite topic.
      if (DECLINE_REPLY_RE.test(later) && !extractTopics(q).length) {
        if (lifecycle.length < 8) lifecycle.push({ status: 'RESOLVED', topic: '' });
        continue;
      }
      // CARRIED_QUESTION_COVERAGE_V1 (2026-10-06, live 215476263877734): a question stays carried
      // only until a LATER substantive public reply answers it. The first reply is often a short
      // stock clarify; that must not freeze the question. Scan every later reply. A teammate's
      // substantive answer closes the unit for completeness only — it does not become a KB fact.
      if (questionResolvedAfter(q, msgs, i, { clientAskedSomethingNew })) {
        const status = resolutionLabel(q, msgs, i);
        if (lifecycle.length < 8) lifecycle.push({ status, topic: ([...supportTopicSet(q)][0] || '') });
        continue;
      }
      // A later episode (closure, long gap plus a new issue, or two topic changes)
      // drops a question that was never answered. The same unresolved topic can return.
      const outside = outsideActiveEpisode(q, i, msgs);
      if (outside) {
        if (lifecycle.length < 8) lifecycle.push({ status: outside, topic: ([...supportTopicSet(q)][0] || '') });
        continue;
      }
      if (!isCovered(q, later)) carried.push({ text: q, source: i, kind: 'question', carried: true, lifecycle: 'CARRY_ACTIVE' });
      else if (lifecycle.length < 8) lifecycle.push({ status: 'RESOLVED_BY_LUNA', topic: ([...supportTopicSet(q)][0] || '') });
    }
  }

  const dedupe = (arr) => {
    const out = [];
    for (const a of arr) if (!out.some((b) => overlapRatio(tokens(a.text), tokens(b.text)) >= 0.8)) out.push(a);
    return out;
  };
  const expired = lifecycle.filter((t) => t.status === 'EPISODE_EXPIRED' || t.status === 'SUPERSEDED' || t.status === 'WITHDRAWN');
  if (expired.length) {
    try { console.log('CARRY_LIFECYCLE', expired.map((t) => t.status + (t.topic ? ':' + t.topic : '')).join(' ')); } catch (_) { /* observability only */ }
  }
  return { burst: dedupe(burst), carried: dedupe(carried).slice(-maxCarried), lifecycle, clientMessagesInBurst: msgs.slice(lastReplyIdx + 1).filter((m) => m.role === 'client').length };
}

// A reply that only holds, stalls or asks for details has not answered anything yet.
const NON_ANSWER_REPLY_RE = /\b(?:checking|look(?:ing)?\s+into|get\s+back\s+to\s+you|one\s+moment|bear\s+with|share\s+(?:your|the)\s+(?:account|email|login)|a\s+teammate\s+will|passed\s+(?:this|it)\s+to)\b/i;
// "??", "hello?", "tell me", "any update" re-ask the previous question rather than asking a new one.
const NUDGE_RE = /^\s*(?:\?+|hello\??|hi\??|any\s+update\??|tell\s+me(?:\s+\w+)?\s*\??|answer(?:\s+me)?\??|please\??|\w+\s*\?)\s*$/i;
function isReferentialNudge(text) {
  const t = String(text || '').trim();
  return NUDGE_RE.test(t) || tokens(t).length <= 1;
}

// CARRIED_QUESTION_COVERAGE_V1 (2026-10-06, live 215476263877734).
// A stock clarify is not an answer. Timing coverage is by intent (what kind of "how long"),
// not by shared vocabulary. Teammate figures recognised here are completeness only.
const STOCK_CLARIFY_RE = /\b(?:could|can|would)\s+you\s+(?:please\s+)?(?:tell\s+me\s+)?(?:a\s+little|a\s+bit|some)\s+more\b|\b(?:could|can|would)\s+you\s+(?:please\s+)?share\s+(?:a\s+bit|a\s+little|some)\s+more\b|\b(?:can|could|would)\s+you\s+(?:please\s+)?clarify\b|\btell\s+me\s+(?:a\s+bit\s+)?more\s+about\s+what\s+you\s+need\b|\bwhat\s+(?:exactly\s+)?do\s+you\s+need\b/i;
const LOOSE_DURATION_RE = /\b(?:within|in)\s+(?:a\s+few\s+|several\s+|a\s+couple\s+of\s+)?(?:hours|minutes|days|business\s+days)\b|\b(?:a\s+few|several|couple\s+of)\s+(?:hours|minutes|days|business\s+days)\b/i;
const TIMING_LEAD_RE = /\b(?:how\s+long|how\s+soon|how\s+fast|how\s+quickly|how\s+much\s+time|how\s+many\s+(?:business\s+|working\s+)?(?:hours?|days?|minutes?|weeks?)|when\s+(?:will|would|do|does|can|could|should|is|are))\b/i;
const SUPPORT_TIMING_OBJECT_RE = /\b(?:funds?|payouts?|withdraw\w*|crypto(?:\s*wallet)?|wallet|credited|credit|receiv\w*|arriv\w*|transfer(?:red|s)?|process(?:ed|ing)?|approv\w*|bank|blockchain|reach(?:es|ed)?)\b/i;
const CLIENT_WITHDREW_RE = /\b(?:never\s*mind|nevermind|forget\s+(?:it|that|about(?:\s+(?:it|that))?|this)|don'?t\s+(?:worry|bother)(?:\s+about\s+(?:it|that))?|no\s+longer\s+(?:need|want|asking)|ignore\s+(?:that|my)\s+(?:question|ask)|scratch\s+that)\b/i;

function hasDurationSignal(text) {
  const t = String(text || '');
  return TIME_FIGURE_RE.test(t) || QUALIFIED_DURATION_RE.test(t) || LOOSE_DURATION_RE.test(t);
}

function isTimingQuestion(ask) {
  const a = String(ask || '');
  if (TIME_ASK_RE.test(a) || /\bhow\s+(?:long|soon|fast|quickly)\b/i.test(a)) return true;
  return /\bwhen\b/i.test(a) && /\b(?:receiv|arriv|credit|reach|process|approv|sent|payout|withdraw|funds|wallet)\b/i.test(a);
}

/** how long / when + a recognizable support object. A bare "how long does this take?" stays ambiguous. */
function isRecognizedSupportTimingAsk(text) {
  const t = String(text || '');
  if (!TIMING_LEAD_RE.test(t) || !SUPPORT_TIMING_OBJECT_RE.test(t)) return false;
  if (/\bcrypto\s+(?:price|market)\b/i.test(t)) return false;
  return true;
}

/** "escalate the matter for a quick processing" is a real request, not unclear filler. */
function isProcessEscalationRequest(text) {
  const t = String(text || '');
  if (!/\bescalat\w*\b/i.test(t)) return false;
  return /\b(?:process\w*|payouts?|withdraw\w*|quicker|faster)\b/i.test(t);
}

function isOnlyStockClarification(text) {
  const raw = stripHtml(String(text || '')).replace(/\s+/g, ' ').trim();
  if (!raw || !STOCK_CLARIFY_RE.test(raw)) return false;
  const parts = raw.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const leftover = parts.filter((s) => !STOCK_CLARIFY_RE.test(s) && !/^(?:sure|hi|hello|hey|of course|happy to help|absolutely)[,!.\s]*$/i.test(s) && !/^sure,?\s+happy to help[.!]*$/i.test(s));
  const rest = leftover.join(' ').trim();
  if (!rest) return true;
  if (hasDurationSignal(rest)) return false;
  if (tokens(rest).length < 6 && !SUPPORT_TIMING_OBJECT_RE.test(rest)) return true;
  return false;
}

function clientWithdrewQuestion(text) {
  return CLIENT_WITHDREW_RE.test(stripHtml(String(text || '')));
}

/**
 * Timing facets kept apart: review, processing, crypto credit, blockchain receipt,
 * bank receipt, generic funds receipt, withdrawal status.
 * Completeness only — a teammate duration is not an approved fact.
 */
function timingFacets(text) {
  const t = String(text || '');
  const f = new Set();
  if (/\b(?:crypto(?:\s*wallet)?|usdt|trc-?20|erc-?20)\b/i.test(t) && !/\bcrypto\s+(?:price|market)\b/i.test(t)) f.add('crypto');
  if (/\bwallet\b/i.test(t) && !/\bbank\b/i.test(t)) f.add('crypto');
  if (/\b(?:blockchain|on-?chain|txid|tx\s*hash|network\s+confirm)\b/i.test(t)) f.add('blockchain');
  if (/\b(?:bank|wire|sepa|iban|swift)\b/i.test(t)) f.add('bank');
  if (/\b(?:under\s+review|being\s+reviewed|approv(?:e|al|ed|ing))\b/i.test(t)) f.add('review');
  if (/\b(?:process(?:ed|ing|es)|turnaround)\b/i.test(t)) f.add('processing');
  if (/\b(?:receiv(?:e|ed|es|ing)|credit(?:ed|s)?|arriv(?:e|es|ed|al|ing)|reach(?:es|ed)?|\blands?\b|\blanded\b)\b/i.test(t)) f.add('receipt');
  if (/\b(?:get|gets|getting)\s+credited\b/i.test(t)) f.add('receipt');
  if (/\b(?:withdrawal|payout)\s+status\b|\bwhere\s+is\s+my\s+(?:payout|withdrawal|funds)\b/i.test(t)) f.add('status');
  return f;
}

function timingChannel(facets) {
  if (!facets) return '';
  if (facets.has('crypto')) return 'crypto';
  if (facets.has('bank')) return 'bank';
  if (facets.has('blockchain')) return 'blockchain';
  return '';
}

function sentenceTimesAsk(askFacets, sentence) {
  const s = String(sentence || '');
  if (!hasDurationSignal(s) && !NOT_PUBLISHED_RE.test(s)) return false;
  if ((HOLDING_REPLY_RE.test(s) || NON_ANSWER_REPLY_RE.test(s)) && !hasDurationSignal(s)) return false;
  const rf = timingFacets(s);
  const qCh = timingChannel(askFacets);
  const rCh = timingChannel(rf);
  if (qCh && rCh && qCh !== rCh) return false;
  const qReceipt = askFacets.has('receipt') || askFacets.has('crypto') || askFacets.has('bank') || askFacets.has('status');
  if (qReceipt && rf.has('receipt')) return true;
  if (askFacets.has('processing') && !askFacets.has('receipt') && rf.has('processing') && !rf.has('receipt') && !rf.has('crypto') && !rf.has('bank')) return true;
  if (askFacets.has('review') && !askFacets.has('receipt') && !askFacets.has('processing') && rf.has('review') && !rf.has('receipt')) return true;
  if (askFacets.has('blockchain') && !askFacets.has('receipt') && rf.has('blockchain') && (rf.has('receipt') || hasDurationSignal(s))) return true;
  if (qCh && rCh === qCh && rf.has('receipt')) return true;
  return false;
}

function timingAnswerCovers(ask, replyText) {
  if (!isTimingQuestion(ask)) return false;
  if (isOnlyStockClarification(replyText)) return false;
  const qf = timingFacets(ask);
  if (!qf.size) return false;
  const chunks = String(replyText || '').replace(/\*\*/g, '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const list = chunks.length ? chunks : [String(replyText || '')];
  return list.some((s) => !isOnlyStockClarification(s) && sentenceTimesAsk(qf, s));
}

function questionResolvedAfter(q, msgs, i, opts) {
  const clientMoved = !!(opts && opts.clientAskedSomethingNew);
  let substantive = false;
  for (let j = i + 1; j < msgs.length; j++) {
    const m = msgs[j];
    if (!m) continue;
    if (m.role === 'client') {
      if (clientWithdrewQuestion(m.text)) return true;
      try {
        if (substantive && require('../reviewRequestFlow').isResolutionClosure(m.text)) return true;
      } catch (_) { /* closure helper optional */ }
      continue;
    }
    if (m.role !== 'bot' && m.role !== 'human') continue;
    const r = stripHtml(m.text || '');
    if (!r || isOnlyStockClarification(r)) continue;
    if ((NON_ANSWER_REPLY_RE.test(r) || HOLDING_REPLY_RE.test(r)) && r.length < 260 && !timingAnswerCovers(q, r)) continue;
    substantive = true;
    if (timingAnswerCovers(q, r) || isCovered(q, r)) return true;
    if (/\bwhat\s+(?:does|do|did)\s+(?:that|this|it|you)\s+(?:even\s+)?mean\b|\bwhat\s+do\s+you\s+mean\b|\bmeaning\s+of\s+(?:that|this)\b/i.test(q)) return true;
  }
  if (clientMoved && handledByReply(q, msgs, i)) return true;
  return false;
}

function handledByReply(q, msgs, i) {
  // Scan past stock clarifications and holding lines. A short generic clarify is not the
  // reply that decides handled-ness, and body length is not the semantic signal.
  let next = null;
  for (let j = i + 1; j < msgs.length; j++) {
    if (msgs[j].role !== 'bot' && msgs[j].role !== 'human') continue;
    const candidate = stripHtml(msgs[j].text || '');
    if (!candidate || isOnlyStockClarification(candidate)) continue;
    if ((NON_ANSWER_REPLY_RE.test(candidate) || HOLDING_REPLY_RE.test(candidate)) && candidate.length < 260 && !timingAnswerCovers(q, candidate)) continue;
    next = msgs[j];
    break;
  }
  if (!next) return false;
  const r = stripHtml(next.text || '');
  if ((NON_ANSWER_REPLY_RE.test(r) || HOLDING_REPLY_RE.test(r)) && r.length < 260 && !timingAnswerCovers(q, r)) return false;
  // A question about Luna's own previous message ("what does that even mean sir") is answered by the
  // next substantive reply by definition; it shares no content words with the explanation.
  if (/\bwhat\s+(?:does|do|did)\s+(?:that|this|it|you)\s+(?:even\s+)?mean\b|\bwhat\s+do\s+you\s+mean\b|\bmeaning\s+of\s+(?:that|this)\b/i.test(q)) return true;
  // REFERENTIAL_ASK_CONTEXT_V1 (2026-09-25, live 215476103729599): "I want the payout to be made after 7
  // days. Can this be modified?" - the question's content is the sentence it points at ("this"). Judged
  // alone, "modified" shares no word with the teammate's "No, the first payout wait can't be changed to
  // 7 days", so the answered question stayed carried and held the next correct reply. A short question
  // that refers back is judged with the rest of its own message.
  let qSrc = q;
  if (/\b(?:this|that|it)\b/i.test(q) && tokens(q).length <= 3) qSrc = stripQuotedHistory(msgs[i].text || '') || q;
  const qt = new Set(tokens(normalizeDomainPhrases(readThroughTypos(qSrc))));
  if (!qt.size) return true;
  // Weak lexical overlap is only trusted on a substantive reply. Short stock lines are
  // already skipped above; this length check is not what decides a semantic timing answer.
  if (stripHtml(r).length < 80) return false;
  return tokens(normalizeDomainPhrases(r)).some((w) => qt.has(w));
}

// ASK_CORE_V1 (2026-09-26, live 215476112354442): "Hy there i was checking fundedelite via PFM you have operations
// in Pakistan right ?" is ONE question ("do you operate in Pakistan?") wrapped in a greeting, a how-I-found-you
// intro and a tag ("right?"). The wrapper words filled the denominator of the overlap ratio, so the correct
// "Yes, Pakistan is not on our restricted list ..." was reported MISSED_QUESTION (X4 -> XHIGH regeneration and
// a garbled honest line). Coverage is also judged on the question core with only that wrapper removed. The
// intro is removed only when it carries no problem report and no figure, and the core must keep at least two
// concrete words, so a real question is never reduced to nothing and nothing else is relaxed.
const ASK_GREETING_LEAD_RE = /^\s*(?:(?:hi+|hy+e?|hey+|hel+o+|hlo|hai|salam|salaam|as+ala+m+u?\s*o?\s*alaikum|aoa|good\s+(?:morning|afternoon|evening|day)|greetings|dear)\b[\s,!.]*(?:(?:there|team|all|guys|sir|madam|ma'?am|bro|brother|bhai|everyone|support|fundedelite|luna)\b[\s,!.]*){0,2})+/i;
const ASK_CONTEXT_LEAD_RE = /^\s*(?:(?:so|actually|well)\s+)?(?:i|we)(?:'m|'ve\s+been|\s+am|\s+was|\s+were|\s+have\s+been|\s+had\s+been)?\s+(?:just\s+|recently\s+)?(?:checking(?:\s+out)?|checked(?:\s+out)?|looking(?:\s+at|\s+into)?|looked\s+(?:at|into)|reading|browsing|researching|going\s+through|went\s+through|exploring|came\s+across|found|saw|heard\s+(?:about|of)|visited|discovered)\b.{0,80}?(?=\b(?:you|do|does|is|are|can|could|will|would|what|how|when|where|which|who|why|should|may|did)\b)/i;
const ASK_TAG_TAIL_RE = /[\s,]+(?:right|correct|isn'?t\s+it|or\s+not|na)\s*([?.!]*)\s*$/i;
function askCore(ask) {
  const orig = String(ask || '').trim();
  let t = orig.replace(ASK_GREETING_LEAD_RE, '');
  const m = ASK_CONTEXT_LEAD_RE.exec(t);
  if (m && !SUPPORT_PROBLEM_RE.test(orig) && !/\d/.test(m[0])) t = t.slice(m[0].length);
  t = t.replace(ASK_TAG_TAIL_RE, (w, p) => p || '?').trim();
  if (!t || t === orig) return orig;
  return tokens(t).filter((x) => !WEAK_ASK_WORDS.has(x)).length >= 2 ? t : orig;
}

function isCovered(ask, replyText, opts) {
  if (isCoveredRaw(ask, replyText, opts)) return true;
  const core = askCore(ask);
  return core !== String(ask || '').trim() && isCoveredRaw(core, replyText, opts);
}

function isCoveredRaw(ask, replyText, opts) {
  // 0.34 let a reply that merely echoes ~a third of the question's vocabulary count as
  // "answered" without actually addressing it (e.g. reusing "profit"/"target"/"challenge"
  // while never stating a number). Raised to require overlap on most of the ask's content
  // words; still a token-overlap heuristic, not semantic understanding, so this is a
  // deliberately moderate increase rather than an aggressive one that could start blocking
  // real, differently-worded answers.
  // Prefatory wrappers ("confirm the following") are never themselves "missed" — the concrete
  // numbered asks beside them still are. Decline-looking drafts must NOT self-certify here
  // (selftest-scope-decline-not-escalated); foreign auto-replies are dropped at extractAsks.
  if (PREFATORY_ASK_RE.test(String(ask || '').trim())) return true;
  // A generic clarify shares no answer with the ask. It must not count as coverage.
  if (isOnlyStockClarification(replyText)) return false;
  // Semantic timing coverage runs before the figure hard-fail so "within hours"
  // can answer a receipt question that does not repeat the client's words.
  if (timingAnswerCovers(String(ask || ''), String(replyText || ''))) return true;
  // PLATFORM_NAME_PRESERVE_V1 (2026-09-29, ticket 215476138018591):
  // "Besides TradeLocker?" / "which trading platform?" is answered by naming MetaTrader 5 /
  // MT5 / TradeLocker / MatchTrader. Token overlap alone fails because the answer uses the
  // platform name instead of repeating "trading platform", which previously held correct
  // drafts as MISSED_QUESTION and produced PRESEND_HOLD silence.
  {
    const askS = String(ask || '');
    const replyS = String(replyText || '');
    const platformAsk =
      /\b(?:platform|platforms|metatrader|mt\s*5|tradelocker|match[\s-]?trader)\b/i.test(askS) &&
      /\b(?:which|what|besides|other|available|use|using|offer|choose|between|name|define)\b/i.test(askS);
    if (platformAsk &&
        /\b(?:meta\s*-?\s*trader\s*5|metatrader\s*5|\bmt\s*5\b|tradelocker|match\s*-?\s*trader)\b/i.test(replyS) &&
        !HOLDING_REPLY_RE.test(replyS)) {
      return true;
    }
  }
  // A named metric in the ask must appear in the reply. "daily loss is 5%" does not answer "max loss".
  {
    const metricNeed = [
      [/\bmax(?:imum)?\s+(?:loss|drawdown)\b/i, /\bmax(?:imum)?\b/i],
      [/\bdaily\s+(?:loss|drawdown)\b/i, /\bdaily\b/i],
      [/\bprofit\s+target\b|\bthe\s+target\b/i, /\btarget\b/i],
      [/\b(?:trading|profitable|calendar)\s+days\b/i, /\bdays?\b/i],
    ];
    for (const [askRe, replyRe] of metricNeed) {
      if (askRe.test(String(ask || '')) && !replyRe.test(String(replyText || ''))) return false;
    }
  }
  const threshold = (opts && opts.threshold) || 0.45;
  const askToks = tokens(normalizeSizes(normalizeDomainPhrases(readThroughTypos(ask))));
  const replyToks = tokens(normalizeSizes(normalizeDomainPhrases(replyText)));
  if (!askToks.length) return true;
  // The generic 2-Step question is answered by naming both available versions.
  // Word overlap alone misses "2-step" and "challenges" as variants of
  // "2 step challenge", causing an already answered ask to be carried forever.
  if (GENERIC_TWO_STEP_ASK_RE.test(String(ask || '').trim()) && BOTH_TWO_STEP_VARIANTS_RE.test(replyText)) return true;
  // "What do you mean?" refers to the preceding explanation. Its words have
  // no topic overlap, so require a concrete answer naming both variants.
  if (MEANING_FOLLOWUP_RE.test(String(ask || '').trim())) return BOTH_TWO_STEP_VARIANTS_RE.test(replyText);
  if (isIdentityAsk(ask) && AI_DISCLOSURE_RE.test(String(replyText || ''))) return true;
  // A value-asking question must be answered with a figure. This hard requirement runs
  // BEFORE the relaxation below, so a contentless reply can never pass by word overlap.
  if (QUANTITY_ASK_RE.test(String(ask || '')) && !quantityAnswered(ask, replyText)) return false;
  // NOT_PUBLISHED_ANSWER_V1: "will my payout be processed within 72 hours?" is answered by an explicit "a fixed
  // processing time is not published" that stays on the topic; the "72 / hours / within" of the question need not
  // be repeated for the honest answer to count.
  if ((QUANTITY_ASK_RE.test(String(ask || '')) || /\bwithin\s+\d+\s*(?:business\s+|working\s+)?(?:hours?|hrs?|days?|minutes?|weeks?)\b/i.test(String(ask || ''))) &&
      NOT_PUBLISHED_RE.test(String(replyText || '')) && conceptOverlap(askToks, replyToks) >= 0.2) return true;

  // Time questions are answered by a duration tied to the same operation, even when
  // the wording differs substantially ("how long after passing" / "29 days to pay").
  // Match the operation, not the generic word "days": a payout-processing time
  // cannot be supplied by the first-payout waiting period or payout cadence.
  if (TIME_ASK_RE.test(String(ask || '')) && !HOLDING_REPLY_RE.test(String(replyText || ''))) {
    const topics = [
      /\bactivation\s+fee\b/i,
      /\b(?:first|initial)\s+payout\b/i,
      /\bpayout\s+(?:process|approv|review)/i,
      /\bpayout\s+(?:cadence|cycle|frequency|schedule)/i,
      /\b(?:minimum|profitable|qualifying)\s+trading\s+days\b/i,
      /\b(?:minimum|maximum)\s+(?:hold|holding|trade)\s+(?:time|duration)\b/i,
    ];
    const required = topics.filter((re) => re.test(String(ask || '')));
    if (required.length && required.every((re) => re.test(String(replyText || ''))) &&
        (TIME_FIGURE_RE.test(String(replyText || '')) || NOT_PUBLISHED_RE.test(String(replyText || '')))) return true;
  }
  // TIME_OPERATION_COVERAGE_V1 (2026-09-25, live 215476102070900): the fixed topic list above only knew
  // asks that already say "activation fee"; "how much time do I have to activate the account?" answered
  // with "29 days ... to pay the activation fee" was held as MISSED_QUESTION (silence under teammate
  // ownership). The operation the client asks the deadline for is the verb after "(have) to":
  // the answer must name that same operation (same root: activate/activation, request/requested) in a
  // sentence that states a duration. An operation named only as the starting point ("29 days from
  // passing") does not answer "how long do I have to pass?".
  if (TIME_ASK_RE.test(String(ask || '')) && !HOLDING_REPLY_RE.test(String(replyText || ''))) {
    const op = /\b(?:have|got|need|allowed|able)\s+to\s+([a-z]{4,})\b|\bto\s+([a-z]{4,})\s+(?:the|my|an?|it|this)\b/i.exec(String(ask || ''));
    const verb = op && (op[1] || op[2]).toLowerCase();
    if (verb && !/^(?:wait|have|make|take|keep|stay|know|tell|help)$/.test(verb)) {
      const root = verb.replace(/(?:ate|e|ing|ed|s)$/, '').slice(0, Math.max(4, verb.length - 3));
      const rootRe = new RegExp('(?<!\\b(?:from|after|since|upon|on)\\s)\\b' + root + '[a-z]*\\b', 'i');
      const sentences = String(replyText || '').replace(/\*\*/g, '').split(/(?<=[.!?])\s+/);
      if (sentences.some((s) => TIME_FIGURE_RE.test(s) && rootRe.test(s))) return true;
    }
  }

  // Words like "anything / different / else" carry no discriminative content, but they sit in
  // the denominator and drag a correct answer below the threshold when the reply names the
  // same thing differently ("300K challenges" for "300k accounts"). Drop them from the ask
  // side only. The remaining tokens must still match, so a wrong-product or contentless
  // reply is still reported missed.
  {
    const concrete = askToks.filter((t) => !WEAK_ASK_WORDS.has(t));
    if (concrete.length && concrete.length < askToks.length &&
        !HOLDING_REPLY_RE.test(String(replyText || '')) &&
        conceptOverlap(concrete, replyToks) >= threshold) return true;
  }
  if (conceptOverlap(askToks, replyToks) >= threshold) return true;
  // Short contextual follow-ups ("and the max loss?") share few tokens with a real answer.
  // Every topical word of the short ask must be in the reply, and the reply must state a figure
  // or an honest "not published". A daily-loss figure does not cover a max-loss ask.
  if (askToks.length <= 4 && !HOLDING_REPLY_RE.test(String(replyText || '')) &&
      (hasFigure(replyText) || NOT_PUBLISHED_RE.test(String(replyText || '')))) {
    const topical = [...new Set(splitHyphen(askToks).map(conceptToken))].filter((t) => !PRODUCT_WORDS.has(t) && !WEAK_ASK_WORDS.has(t) && t.length > 2);
    const H = new Set(splitHyphen(replyToks).map(conceptToken));
    if (topical.length && topical.every((t) => H.has(t))) return true;
  }
  // Soft-breach consequence: the official effect (cycle reset / split change) answers the ask
  // without repeating "soft breach" and "affect" verbatim.
  if (/\bsoft\s*breach/.test(String(ask || '').toLowerCase()) && /\bpayout|withdraw/.test(String(ask || '').toLowerCase()) &&
      /\b(?:payout|split|cycle)\b/i.test(String(replyText || '')) &&
      /\b(?:reset|reduc|affect|forfeit|withhold|delay|30\s*%)\b/i.test(String(replyText || ''))) return true;
  // PAYOUT_ELIGIBILITY_OR_INFO_V1 (215476174205151): extracted unit is often only
  // "Does this affect payout eligibility or is it informational only?" while the draft states
  // the eligibility consequence ("not eligible for payouts until ..."). Token overlap alone
  // stays ~0.2 even with eligible↔eligibility, so accept an explicit eligibility answer.
  {
    const askS = String(ask || '');
    const replyS = String(replyText || '');
    if (
      /\bpayout\s+eligibility\b|\beligible\s+for\s+(?:a\s+)?payout|\baffect(?:s)?\s+(?:my\s+|the\s+)?payout\b/i.test(askS) &&
      /\b(?:informational|information(?:al)?\s+only|just\s+(?:for\s+)?info|for\s+info(?:rmation)?\s+only)\b/i.test(askS) &&
      !HOLDING_REPLY_RE.test(replyS) &&
      (/\b(?:not\s+eligible|ineligible|eligible\s+for\s+payout)/i.test(replyS) ||
        (/\bpayout/i.test(replyS) && /\b(?:until|after|once|when|before)\b/i.test(replyS) &&
          /\b(?:breach|reset|resolv|eligible)\b/i.test(replyS)))
    ) return true;
  }
  // MULTI_ACTIVATE_SAME_TIME_V1 (215476173670032): "can I activate all ... at the same time"
  // is not answered by listing fee/KYC/agreement prerequisites alone.
  {
    const askS = String(ask || '');
    const replyS = String(replyText || '');
    if (
      /\bactivat/i.test(askS) &&
      /\b(?:same\s+time|simultaneously|at\s+once|all\s+(?:the\s+)?accounts?|multiple\s+accounts?)\b/i.test(askS)
    ) {
      const addressesSimul =
        /\b(?:same\s+time|simultaneously|at\s+once|together|all\s+(?:passed\s+)?accounts?|multiple\s+(?:passed\s+)?accounts?)\b/i.test(replyS) ||
        NOT_PUBLISHED_RE.test(replyS) ||
        /\bcan(?:'|’)t\s+confirm\b|\bcannot\s+confirm\b|\bno\s+fixed\b/i.test(replyS);
      if (!addressesSimul && !HOLDING_REPLY_RE.test(replyS)) return false;
      if (addressesSimul && /\bactivat/i.test(replyS) && !HOLDING_REPLY_RE.test(replyS)) return true;
    }
  }
  // "What services/products do you offer?" is a generic capability question - a good answer
  // describes concrete offerings in different words ("we offer evaluation challenges...") and
  // will rarely repeat the literal words "services"/"products"/"guys", so it fails the word
  // -overlap check above even when it fully answers the question. Treat any substantive,
  // on-topic reply as covering this specific generic-ask pattern instead of requiring literal
  // overlap (narrowly scoped to this phrasing - a real "what is my profit target" style
  // question still needs real word/topic overlap below).
  if (GENERIC_OFFERINGS_ASK_RE.test(String(ask || '').trim())) {
    if (extractTopics(replyText).length || tokens(replyText).length >= 8) return true;
  }
  // topic-level coverage only for very short asks ("how about payouts?") where
  // token overlap is meaningless; longer asks must overlap on content.
  if (askToks.length > 1) return false;
  const askTopics = extractTopics(ask);
  const replyTopics = extractTopics(replyText);
  return askTopics.length > 0 && askTopics.every((t) => replyTopics.includes(t));
}

/**
 * @returns {{asks:Array, covered:Array, missed:Array, total:number}}
 */
const POLAR_ASK_RE = /^\s*(?:(?:and|so|also|but)[,\s]+)?(?:is|are|am|can|could|do|does|did|will|would|should|may|must|has|have)\b[^?]*\?\s*$/i;
const POLAR_REPLY_RE = /^\s*(?:(?:hi|hello|hey)\b[^.!?\n]{0,40}[.!?,\n]\s*)?(?:yes|no|yep|nope|correct|that(?:'|’)?s\s+(?:right|correct))\b/i;

const IMAGE_REFERENTIAL_ASK_RE = /\b(?:this|that|these|those|it|mean|means|meaning|explain|website|web\s?site|site|page|screenshot|screen\s?shot|image|picture|written|shown|says|stats?|figures?|numbers?)\b/i;
function imageAnchors(draft, ev) {
  try { return require('../imageEvidence').anchorsInDraft(draft, ev); } catch (_) { return 0; }
}

function checkCoverage(draft, asks, opts) {
  const list = Array.isArray(asks) ? asks : [...(asks.burst || []), ...(asks.carried || [])];
  const state = (opts && opts.state) || {};
  const covered = [];
  const missed = [];
  const classes = [];
  // POLAR_SINGLE_ASK_V1 (2026-09-26, real-model replay en-short-yesno): "Is weekend holding allowed on the 2-Step?
  // Just yes or no please." answered "Yes." shares no word with the question, so the correct answer was reported
  // MISSED_QUESTION (3 X4/XHIGH regenerations; on the old boundary the "Yes." was then blocked -> silence). When the
  // client asked exactly ONE yes/no question and the draft opens with an explicit yes/no, the question is answered.
  // Only for a single ask: with several asks a leading "Yes" cannot show which one it answers.
  const polarAnswered = (a) => list.length === 1 &&
    POLAR_ASK_RE.test(askCore(String((a && a.text) || a || ''))) &&
    POLAR_REPLY_RE.test(stripHtml(String(draft || '')));
  const joined = list.map((a) => String((a && a.text) || a || '')).join('\n');
  // One part needs the variant (daily loss, price) and another part does not. The shared part
  // has to be the published fact, not a mention of the topic.
  const variantMixed = list.length > 1
    && /\b(?:[12]|one|two)[\s-]*step\b/i.test(joined)
    && /\b(?:daily\s+loss|price|cost|fees?)\b/i.test(joined);
  // IMAGE_EVIDENCE_V1 (2026-09-28): with a client screenshot, a referential ask ("what does that mean?", "can you
  // explain?", "it's on the website") is about the image. It is answered when the draft explains the screenshot's
  // content (uses at least two of its figures / distinctive labels); word overlap with the ask cannot see that.
  const imageEv = String((opts && opts.imageEvidenceText) || '');
  const imageAnswered = (a) => {
    if (!imageEv) return false;
    const t = String((a && a.text) || a || '');
    if (!IMAGE_REFERENTIAL_ASK_RE.test(t) || tokens(t).length > 8) return false;
    return imageAnchors(String(draft || ''), imageEv) >= 2;
  };
  for (const a of list) {
    if (imageAnswered(a)) { const c = { text: String((a && a.text) || a || ''), class: 'ANSWERABLE_GENERAL', covered: true, image: true }; classes.push(c); covered.push(a); continue; }
    if (polarAnswered(a)) { const c = { text: String((a && a.text) || a || ''), class: 'ANSWERABLE_GENERAL', covered: true }; classes.push(c); covered.push(a); continue; }
    const c = classifyAsk(a, draft, state, { multi: list.length > 1, variantMixed });
    classes.push(c);
    if (c.covered || c.class === 'ALREADY_ESCALATED_OR_HELD' || c.class === 'UNSUPPORTED_GENERAL_INFORMATION' || c.class === 'NEEDS_CLARIFICATION') covered.push(a);
    else missed.push(a);
  }
  return { asks: list, covered, missed, total: list.length, classes };
}

function summarize(asks) {
  return uniq([...(asks.burst || []), ...(asks.carried || [])].map((a) => a.text));
}

// TOPIC_SAFE_HONEST_LINE_V1 (2026-09-26, live 215476112354442 / 215476109613017): the customer-facing
// "The official information doesn't state <topic>" line used to take <topic> from the first five raw
// words of the client's message ("the answer on hy was checking fundedelite via", "on if win 50 000
// usd"). The topic is now only ever a fixed phrase for ONE recognised topic of the lexicon; an ask that
// names no single known topic returns '' and the caller adds no line.
const HONEST_TOPIC_PHRASE = {
  payout: 'payouts', kyc: 'KYC verification', reset_retry: 'resets or retries', refund: 'refunds',
  promo: 'promotions', spreads: 'spreads', platform: 'trading platforms (MetaTrader 5 / TradeLocker / MatchTrader)', trading_days: 'trading-day requirements',
  certificate: 'certificates', affiliate: 'the affiliate program', pricing: 'pricing', scaling: 'scaling',
  login: 'login access', rules: 'this trading rule', challenge: 'this challenge', account_status: 'account status',
};
function honestTopicPhrase(q) {
  // "how much" is the question form, not the pricing topic.
  const ts = [...new Set((extractTopics(String(q || '').replace(/\bhow\s+(?:much|many)\b/gi, ' ')) || []).filter((t) => HONEST_TOPIC_PHRASE[t]))];
  if (ts.length !== 1) return '';
  const phrase = HONEST_TOPIC_PHRASE[ts[0]];
  return /\bhow\s+(?:long|soon|often)\b|\bwhen\b/i.test(String(q || '')) ? 'a timeframe for ' + phrase : 'the answer to your question about ' + phrase;
}

module.exports = { extractAsks, checkCoverage, isCovered, askCore, honestTopicPhrase, summarize, isActionableSupportStatement, hasFigure, quantityAnswered, classifyAsk, splitCoordinatedAsks, isAccountSpecificAsk, isOnlyStockClarification, isTimingQuestion, isRecognizedSupportTimingAsk, isProcessEscalationRequest, timingAnswerCovers, timingFacets, questionResolvedAfter, hasDurationSignal, supportTopicSet, outsideActiveEpisode };
