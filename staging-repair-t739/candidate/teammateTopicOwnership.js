'use strict';
/**
 * TEAMMATE_TOPIC_OWNERSHIP_V1 (2026-09-23)
 *
 * Human ownership applies to the BACKEND / case-specific issue a teammate is handling, not to
 * the whole conversation.
 *
 * Before this module, teammateHandoffGates.shouldDeferToHumanTeammate() returned
 * `teammate_actively_handling -> SKIP` for EVERY client message once a human teammate had
 * posted anything public in the last 6 parts / 6 hours. Live ticket 215476065591510: an
 * assignment stub ("How may we be of help today?") armed that gate, the client then asked a
 * general rules question (does a partial close count toward the 0.5% profitable day?) and
 * waited four minutes; the teammate answered a different point, the client said "you haven't
 * answered my question", and Luna stayed silent on all of it until the manager ordered a reply
 * by note.
 *
 * This module is called ONLY where that blanket SKIP used to fire. It decides, per pending
 * client ask:
 *   - teammate silence directive in notes          -> SKIP (explicit human control wins)
 *   - human teammate already replied after the msg -> SKIP (message-level, not conversation-level)
 *   - short ack / greeting / emoji                 -> SKIP (unchanged)
 *   - each pending ask classified GENERAL_ANSWERABLE / BACKEND_REQUIRED / UNCERTAIN
 *       * BACKEND_REQUIRED and UNCERTAIN stay with the human (silence)
 *       * GENERAL_ANSWERABLE not already answered   -> ANSWER_SUBSET (only those asks)
 *   - classifier unavailable / malformed            -> SKIP (uncertainty prefers silence)
 *
 * A deterministic veto (the caller's own account-specific predicates) turns any "general" ask
 * that is really about this client's account back into BACKEND_REQUIRED, so a model
 * misclassification can only ever cause silence, never a backend guess.
 *
 * Pure helpers + one async decision with an injected model call, so tests need no network.
 */

const gates = require('./teammateHandoffGates');

const GENERAL = 'GENERAL_ANSWERABLE';
const BACKEND = 'BACKEND_REQUIRED';
const UNCERTAIN = 'UNCERTAIN';
const CLASSES = new Set([GENERAL, BACKEND, UNCERTAIN]);

const stripHtml = gates.stripHtml;

function tsSec(p) {
  const n = Number((p && p.created_at) || 0);
  if (!n) return 0;
  return n > 1e12 ? Math.floor(n / 1000) : n;
}

function isClientPart(p) {
  const a = (p && p.author) || {};
  return a.type === 'user' || a.type === 'lead';
}

/** Luna's own seat, Elite AI / Fin, or any bot author posting a PUBLIC comment with a body. */
function isBotSidePublic(p, opts) {
  if (!p || String(p.part_type || '') === 'note') return false;
  const a = p.author || {};
  const id = String(a.id || '');
  const arsalId = String((opts && opts.arsalId) || '');
  const eliteAiId = String((opts && opts.eliteAiId) || '');
  const botSide =
    (id && (id === arsalId || id === eliteAiId)) ||
    a.type === 'bot' ||
    /elite\s*ai|\bfin\b/i.test(String(a.name || ''));
  if (!botSide) return false;
  const pt = String(p.part_type || '');
  if (pt !== 'comment' && pt !== 'assignment' && pt !== 'open') return false;
  return !!stripHtml(p.body || '');
}

function indexOfPart(parts, target) {
  if (!target) return -1;
  const tid = String(target.id || '');
  if (tid) {
    for (let i = 0; i < parts.length; i++) if (String((parts[i] && parts[i].id) || '') === tid) return i;
  }
  return -1;
}

/**
 * Message-level: has a real human teammate posted a public reply AFTER this client message?
 * Order in `parts` is authoritative; timestamps are the fallback for a source-only message.
 */
function teammateRepliedAfter(parts, latestUser, opts) {
  const list = parts || [];
  const idx = indexOfPart(list, latestUser);
  const at = tsSec(latestUser);
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!gates.isHumanTeammatePublicReply(p, opts)) continue;
    if (idx >= 0 ? i > idx : tsSec(p) > at) return true;
  }
  return false;
}

/**
 * The client messages nobody has answered yet: walk back from the latest client message until
 * the most recent PUBLIC reply by a human teammate or by the bot side. Oldest first.
 */
function pendingClientWindow(parts, latestUser, conv, opts) {
  const list = parts || [];
  const max = (opts && opts.maxPending) || 8;
  const maxAgeSec = (opts && opts.maxPendingAgeSec) || 45 * 60;
  let idx = indexOfPart(list, latestUser);
  if (idx < 0) idx = list.length - 1;
  const latestAt = tsSec(latestUser) || tsSec(list[idx]);
  const out = [];
  let reachedStart = true;
  for (let i = idx; i >= 0; i--) {
    const p = list[i];
    if (!p) continue;
    if (String(p.part_type || '') === 'note') continue;
    if (gates.isHumanTeammatePublicReply(p, opts) || isBotSidePublic(p, opts)) { reachedStart = false; break; }
    if (!isClientPart(p)) continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    if (latestAt && tsSec(p) && latestAt - tsSec(p) > maxAgeSec) { reachedStart = false; break; }
    out.unshift({ id: String(p.id || ''), text: body, at: tsSec(p) });
    if (out.length >= max) { reachedStart = false; break; }
  }
  // Opening message that only lives on conversation.source.
  if (reachedStart && conv && conv.source && out.length < max) {
    const s = conv.source;
    const a = s.author || {};
    const body = stripHtml(s.body || '');
    if ((a.type === 'user' || a.type === 'lead') && body && !out.some((m) => m.text === body)) {
      out.unshift({ id: 'source', text: body, at: Number(s.created_at || 0) });
    }
  }
  if (!out.length && latestUser) {
    const body = stripHtml(latestUser.body || '');
    if (body) out.push({ id: String(latestUser.id || ''), text: body, at: tsSec(latestUser) });
  }
  return out;
}

/* ---------------------------------------------------------------- explicit human control */

// A teammate or the owner telling the bot to stay out. Matched in INTERNAL NOTES only; the
// latest directive wins, so a later "resume / assist him" re-enables the scoped behaviour.
const SILENCE_DIRECTIVE_RE = new RegExp(
  [
    String.raw`\b(?:stop|quit|cease)\s+(?:replying|responding|answering|messaging|talking|chatting)\b`,
    String.raw`\b(?:do\s*n[o']?t|dont|never|no\s+need\s+to|pls\s+don'?t|please\s+don'?t)\s+(?:reply|respond|answer|message|engage|interfere|intervene|jump\s+in|touch)\b`,
    String.raw`\b(?:stay|keep|remain|be)\s+(?:silent|quiet|out\s+of\s+(?:this|it|the\s+(?:ticket|chat|conversation)))\b`,
    String.raw`\bleave\s+(?:this|it|him|her|them|the\s+(?:ticket|chat|client|conversation))\s+(?:to|with)\s+me\b`,
    String.raw`\bi(?:'ll|\s+will|\s+am|'m)\s+(?:handle|handling|take\s+care\s+of|taking\s+care\s+of|take\s+over|taking\s+over)\s+(?:this|it|him|her|them|the\s+(?:ticket|chat|client|conversation))\b`,
    String.raw`\bhands?\s+off\b`,
    String.raw`\bno\s+more\s+replies\b`,
    String.raw`\bpause\s+(?:your\s+)?(?:responses|replies)\b`,
    String.raw`\b(?:bot|luna|arsal|ai)\s+(?:stop|off|silent|quiet)\b`,
    // Ticket 215476153533183: Anjsha posted public "please hold" while owning — treat as silence.
    String.raw`\bplease\s+hold\b`,
    String.raw`\bhold\s+(?:please|this|here)\b`,
  ].join('|'),
  'i'
);

const RESUME_DIRECTIVE_RE = new RegExp(
  [
    String.raw`\bresume\b`,
    String.raw`\b(?:you\s+can|go\s+ahead\s+and|please|pls)\s+(?:reply|respond|answer|continue|help|assist)\b`,
    String.raw`\bstart\s+(?:replying|responding|answering)\s+again\b`,
    String.raw`\b(?:assist|help)\s+(?:him|her|them|the\s+client)\b`,
    String.raw`\banswer\s+(?:his|her|their|the\s+client'?s?)\b`,
    String.raw`\bi'?m\s+back\s+on\s+this\b`,
    String.raw`\b(?:keep|continue)\s+(?:helping|assisting)\b`,
    // SILENCE_RESUME_V1 (2026-10-05, live 215476246024547): teammate "reply to ticket" /
    // "keep replyin" / "@Arsal reply" must clear a prior STOP silence.
    String.raw`\breply\s+to\s+(?:the\s+)?(?:ticket|chat|conversation|client)\b`,
    String.raw`\bkeep\s+replyin(?:g)?\b`,
    String.raw`\b(?:@?arsal|@?luna)\b[\s\S]{0,40}\b(?:keep\s+)?replyin(?:g)?\b`,
    String.raw`\b(?:@?arsal|@?luna)\b[\s\S]{0,40}\breply\b`,
  ].join('|'),
  'i'
);

/**
 * Luna / Arsal-seat ack notes ("Got it - no more replies…") must never arm silence.
 * Only apply the broad auth-confirm opener check to Luna-seat authors — a human note
 * that starts with "Got it" but says "stop replying" must still count as silence.
 */
function isBotAuthConfirmNoteText(plain) {
  const t = String(plain || '').trim();
  if (!t) return true;
  if (/^\[bot-ack\]/i.test(t)) return true;
  if (/^sent to client\b/i.test(t)) return true;
  if (/^✓\s/u.test(t)) return true;
  if (/^(okay|understood|got it|noted|sure|done|yes)\b/i.test(t)) return true;
  if (/^here\b/i.test(t)) return true;
  if (/\bi'?ll\s+(follow|continue|stop|pause|resume|keep|act)\b/i.test(t)) return true;
  if (/\bi'?m\s+(back|here|on it)\b/i.test(t)) return true;
  return false;
}

function isLunaSeatAuthor(author, opts) {
  const id = String((author && author.id) || '');
  if (!id) return false;
  const arsalId = String((opts && opts.arsalId) || '');
  const eliteAiId = String((opts && opts.eliteAiId) || '');
  if (arsalId && id === arsalId) return true;
  if (eliteAiId && id === eliteAiId) return true;
  const name = String((author && author.name) || '');
  if (/elite\s*ai|\bfin\b/i.test(name)) return true;
  return false;
}

/**
 * Only HUMAN teammate silence/resume notes count.
 * Luna's own STOP confirm ("Got it - no more replies on this ticket from me.") is ignored
 * (live 215476246024547: confirm kept silence armed after Huzafa FOLLOW→REPLY).
 * @returns {{silenced:boolean, at:number, text:string}}
 */
function teammateSilenceDirective(parts, opts) {
  let state = { silenced: false, at: 0, text: '' };
  for (const p of parts || []) {
    if (!p) continue;
    const a = p.author || {};
    if (a.type !== 'admin') continue;
    const pt = String(p.part_type || '');
    const isNote = pt === 'note';
    // Notes: full silence/resume vocabulary. Public teammate comments: only explicit hold/silence
    // phrases (so ordinary guidance does not accidentally arm a permanent silence).
    if (!isNote && pt !== 'comment' && pt !== 'assignment') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    // Luna / Arsal-seat notes never set or clear silence — only human teammates do.
    // (Also ignore auth-confirm openers when the seat is Luna, defense in depth.)
    if (isLunaSeatAuthor(a, opts)) continue;
    if (isBotAuthConfirmNoteText(body) && /no more replies on this ticket from me|i'?ll stop replying to this ticket|i'?ll pause responses here/i.test(body)) {
      continue;
    }
    if (!isNote) {
      if (/\bplease\s+hold\b|\bhold\s+(?:please|this|here)\b|\b(?:stop|quit)\s+replying\b|\bhands?\s+off\b|\bstay\s+silent\b/i.test(body)) {
        state = { silenced: true, at: tsSec(p), text: body.slice(0, 160) };
      }
      continue;
    }
    // A silence phrase wins over a resume phrase inside the SAME note (fail toward silence).
    if (SILENCE_DIRECTIVE_RE.test(body)) state = { silenced: true, at: tsSec(p), text: body.slice(0, 160) };
    else if (RESUME_DIRECTIVE_RE.test(body)) state = { silenced: false, at: tsSec(p), text: body.slice(0, 160) };
  }
  return state;
}

/* ---------------------------------------------------------------- transcript for the classifier */

function roleLabel(p, opts) {
  const a = (p && p.author) || {};
  const pt = String((p && p.part_type) || '');
  const name = String(a.name || '').trim();
  if (isClientPart(p)) return 'CLIENT';
  if (pt === 'note') return 'INTERNAL NOTE (' + (name || 'teammate') + ')';
  const id = String(a.id || '');
  if (id && id === String((opts && opts.arsalId) || '')) return 'LUNA';
  if (a.type === 'bot' || /elite\s*ai|\bfin\b/i.test(name)) return 'FIN/BOT';
  if (a.type === 'admin') return 'HUMAN TEAMMATE (' + (name || 'teammate') + ')';
  return '';
}

function buildOwnershipTranscript(parts, conv, opts, pendingIds) {
  const pend = new Set(pendingIds || []);
  const lines = [];
  const s = (conv && conv.source) || {};
  const sb = stripHtml(s.body || '');
  if (sb) lines.push('[CLIENT' + (pend.has('source') ? ' — PENDING' : '') + '] ' + sb.slice(0, 500));
  const list = (parts || []).slice(-(opts && opts.transcriptParts || 40));
  for (const p of list) {
    const body = stripHtml((p && p.body) || '');
    if (!body) continue;
    const label = roleLabel(p, opts);
    if (!label) continue;
    const pendingTag = pend.has(String(p.id || '')) ? ' — PENDING' : '';
    lines.push('[' + label + pendingTag + '] ' + body.replace(/\s+/g, ' ').slice(0, 500));
  }
  return lines.join('\n');
}

/* ---------------------------------------------------------------- classifier */

const CLASSIFIER_SYSTEM = [
  'You route client messages in a FundedElite (prop-trading firm) support chat where a HUMAN TEAMMATE is currently active.',
  'The AI assistant (Luna) may answer only GENERAL FundedElite questions that the public FAQ / rules knowledge base answers,',
  'and must never interfere with the case-specific work the human teammate is doing.',
  '',
  'Split the PENDING client message(s) into individual asks and classify each one:',
  '- GENERAL_ANSWERABLE: a general product/policy/rules/platform/pricing/promo question whose answer is the same for every',
  '  client and comes from the FAQ (trading rules, minimum trade duration, profitable-day rules, how partial closes count,',
  '  payout schedule rules, targets, daily/max loss, risk rule, stop loss, scalping, news trading, EAs, platforms,',
  '  product differences, general pricing/promos). A hypothetical about how a rule works ("if I take a partial, does it',
  '  count?") is GENERAL even if the client mentions their own trade size or account size.',
  '- BACKEND_REQUIRED: needs this client\'s own private account/backend state or a human/admin action: checking a',
  '  specific account, payout/withdrawal status or investigation, KYC/verification review, payment/refund, risk-team',
  '  decision, breach/restriction investigation, manual reset/change, "how many days do I have left", "why was my X',
  '  rejected", "can you check". Also: the client supplying an account number / email / screenshot for such a case.',
  '- UNCERTAIN: you cannot tell, OR the question sounds general but its answer would pre-judge or contradict the',
  '  specific case the human teammate is investigating (e.g. "can payouts be denied for consistency?" while the teammate',
  '  is investigating this client\'s denied payout). When in doubt, choose UNCERTAIN.',
  '',
  'Rules:',
  '- Only PENDING messages contain asks. Earlier transcript is context only. If a pending message only points back',
  '  ("you haven\'t answered my question", "read what I asked"), restate the earlier unanswered question it refers to as',
  '  the ask and classify that.',
  '- Context-only fragments (account size, "I have a flash account", greetings, thanks, "ok") are NOT asks; omit them,',
  '  but use them to make an ask self-contained (e.g. add "on a 100k Flash Activation account").',
  '- Write each ask in the client\'s own words where possible, minimally edited so it is self-contained. Do not answer it.',
  '- already_answered = true only if a HUMAN TEAMMATE or LUNA public reply in the transcript already fully answered THIS',
  '  exact ask and the client has not said it was not answered.',
  '- same_topic_as_human_case = true if the ask is about the same matter a human teammate is handling (see teammate',
  '  replies and INTERNAL NOTES).',
  '',
  'Return ONLY a JSON object, no prose:',
  '{"human_owned_topics":["short topic", ...],',
  ' "asks":[{"ask":"...","class":"GENERAL_ANSWERABLE|BACKEND_REQUIRED|UNCERTAIN","already_answered":false,',
  '          "same_topic_as_human_case":false,"reason":"<=15 words"}]}',
  'If there is no real ask in the pending messages, return {"human_owned_topics":[...],"asks":[]}.',
].join('\n');

function buildClassifierUser(transcript, pending) {
  return (
    'TRANSCRIPT (oldest first; INTERNAL NOTES are teammate-only):\n' +
    transcript +
    '\n\nPENDING CLIENT MESSAGE(S) — no human teammate or Luna reply has come after these:\n' +
    pending.map((m, i) => (i + 1) + '. ' + m.text).join('\n') +
    '\n\nClassify the asks. JSON only.'
  );
}

function extractJson(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch (_) { return null; }
}

/** Strict schema check. Anything off-schema is treated as "classifier unavailable". */
function normalizeClassification(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.asks)) return null;
  const asks = [];
  for (const a of obj.asks) {
    if (!a || typeof a !== 'object') return null;
    const ask = String(a.ask || '').trim();
    const cls = String(a.class || '').trim().toUpperCase();
    if (!ask || !CLASSES.has(cls)) return null;
    asks.push({
      ask: ask.slice(0, 600),
      cls,
      alreadyAnswered: a.already_answered === true,
      sameTopicAsHumanCase: a.same_topic_as_human_case === true,
      reason: String(a.reason || '').slice(0, 160),
    });
  }
  const topics = Array.isArray(obj.human_owned_topics)
    ? obj.human_owned_topics.map((x) => String(x || '').slice(0, 80)).filter(Boolean).slice(0, 6)
    : [];
  return { asks, humanOwnedTopics: topics };
}

async function classifyPendingAsks({ transcript, pending, callModel }) {
  if (typeof callModel !== 'function') return { ok: false, error: 'no_model' };
  let raw = '';
  try {
    raw = await callModel(CLASSIFIER_SYSTEM, buildClassifierUser(transcript, pending));
  } catch (e) {
    return { ok: false, error: 'model_error:' + ((e && e.message) || 'unknown').slice(0, 80) };
  }
  const norm = normalizeClassification(extractJson(raw));
  if (!norm) return { ok: false, error: 'malformed', raw: String(raw || '').slice(0, 200) };
  return Object.assign({ ok: true }, norm);
}

/* ---------------------------------------------------------------- decision */

function isNonAskClientMsg(text) {
  const t = String(text || '').trim();
  return (
    !t ||
    gates.isShortClientAckExpanded(t) ||
    gates.isGreetingOnlyClientMsg(t) ||
    gates.isEmojiOnlyClientMsg(t)
  );
}

/**
 * @param {object} args
 * @param {object[]} args.parts
 * @param {object}   args.latestUser
 * @param {object}   args.conv
 * @param {object}   args.opts             { arsalId, eliteAiId }
 * @param {function} args.callModel        async (system, user) => raw text
 * @param {function} [args.isAccountSpecific]  deterministic veto: (askText) => boolean
 * @returns {Promise<{action:'SKIP'|'ANSWER_SUBSET', reason:string, generalAsks?:object[],
 *                    heldAsks?:object[], mixed?:boolean, humanOwnedTopics?:string[],
 *                    answerText?:string, pending?:object[], log:object}>}
 */
async function decideTeammateScopedRoute(args) {
  const { parts, latestUser, conv, opts, callModel, isAccountSpecific } = args || {};
  const log = {};

  const directive = teammateSilenceDirective(parts, opts);
  if (directive.silenced) {
    return { action: 'SKIP', reason: 'teammate_silence_directive', log: { directive: directive.text } };
  }

  if (teammateRepliedAfter(parts, latestUser, opts)) {
    return { action: 'SKIP', reason: 'teammate_answered_latest', log };
  }

  const latestText = stripHtml((latestUser && latestUser.body) || '');
  if (isNonAskClientMsg(latestText)) {
    return { action: 'SKIP', reason: 'teammate_handoff_short_ack_or_greeting', log };
  }

  const pending = pendingClientWindow(parts, latestUser, conv, opts).filter((m) => !isNonAskClientMsg(m.text));
  log.pending = pending.length;
  if (!pending.length) return { action: 'SKIP', reason: 'no_pending_ask', log };

  const transcript = buildOwnershipTranscript(parts, conv, opts, pending.map((m) => m.id));
  const cls = await classifyPendingAsks({ transcript, pending, callModel });
  if (!cls.ok) {
    return { action: 'SKIP', reason: 'scope_classifier_unavailable', log: Object.assign(log, { error: cls.error }) };
  }

  const general = [];
  const held = [];
  let alreadyAnswered = 0;
  for (const a of cls.asks) {
    let cls2 = a.cls;
    let veto = false;
    if (cls2 === GENERAL && typeof isAccountSpecific === 'function') {
      try { veto = !!isAccountSpecific(a.ask); } catch (_) { veto = true; }
      if (veto) cls2 = BACKEND;
    }
    const item = Object.assign({}, a, { cls: cls2, vetoed: veto });
    if (cls2 !== GENERAL) { held.push(item); continue; }
    if (a.alreadyAnswered) { alreadyAnswered++; continue; }
    general.push(item);
  }
  log.asks = cls.asks.map((a) => a.cls[0] + (a.alreadyAnswered ? '*' : ''));
  log.vetoed = held.filter((h) => h.vetoed).length;

  if (!general.length) {
    let reason = 'no_general_ask';
    if (held.some((h) => h.cls === UNCERTAIN)) reason = 'uncertain_prefers_silence';
    else if (held.length) reason = 'backend_required_human_owned';
    else if (alreadyAnswered) reason = 'general_already_answered';
    return { action: 'SKIP', reason, heldAsks: held, humanOwnedTopics: cls.humanOwnedTopics, log };
  }

  return {
    action: 'ANSWER_SUBSET',
    reason: held.length ? 'mixed_answer_general_only' : 'general_unanswered',
    generalAsks: general,
    heldAsks: held,
    mixed: held.length > 0,
    humanOwnedTopics: cls.humanOwnedTopics,
    answerText: general.map((g) => g.ask).join('\n'),
    pending,
    log,
  };
}

/**
 * Model-facing instruction for a scoped answer. Keeps Luna on the general asks only.
 */
function buildScopedInstruction(route) {
  const g = (route.generalAsks || []).map((x, i) => (i + 1) + '. ' + x.ask).join('\n');
  const held = (route.heldAsks || []).map((x) => '- ' + x.ask).join('\n');
  const topics = (route.humanOwnedTopics || []).join('; ');
  return (
    '\n\nHARD RULE — TEAMMATE-OWNED CONVERSATION (scoped answer):\n' +
    (route.ownerLabel || 'A human teammate is actively handling this conversation') + (topics ? ' (' + topics + ')' : '') + '.\n' +
    'Answer ONLY these general question(s), accurately from the OFFICIAL FAQ CONTEXT / knowledge search:\n' +
    g + '\n' +
    (held
      ? 'Do NOT answer, speculate about, or state any conclusion on these — the teammate owns them:\n' + held + '\n' +
        'You may add at most one short sentence that the account-specific part is still with the team. Do not promise a time.\n'
      : '') +
    'Every fact you state must come from approved sources: the OFFICIAL FAQ CONTEXT, knowledge search results, or the ' +
    'FundedElite product rules in your system instructions. Do not infer or ' +
    'extrapolate a rule the approved knowledge does not state (for example how a specific trade scenario is counted). ' +
    'If the approved knowledge does not explicitly answer a question, leave it to the teammate — do not guess.\n' +
    'Do NOT ask for account number, email, or any identity details. Do NOT escalate or say you are passing anything to ' +
    'the team. Do NOT greet or re-introduce yourself. Do NOT repeat anything the teammate already said, and never apologise ' +
    'for, correct, or speak as if you wrote the teammate\'s earlier replies ("I missed", "my earlier answer"). Keep it concise.\n' +
    'Respond with ACTION: REPLY only. If you cannot answer the general question(s) from approved knowledge, respond ACTION: SKIP.'
  );
}

// Identity collection and escalation promises are never allowed in a scoped answer.
const SCOPED_IDENTITY_ASK_RE =
  /\b(?:share|send|provide|confirm|give|tell)\b[^.?!\n]{0,60}\b(?:account\s*(?:number|no\.?|#|id|login)|registered\s+e-?mail|e-?mail\s+address)\b|\b(?:what|which)\s+is\s+your\s+(?:account\s*(?:number|id)|registered\s+e-?mail)\b/i;
// Speaking as the author of the teammate's reply (live replay 215476065591510 run 3: "You're right,
// I missed the part about the partial" — the miss was the teammate's, not Luna's).
const SCOPED_TEAMMATE_IMPERSONATION_RE =
  /\b(?:i\s+(?:missed|overlooked|misread|didn'?t\s+(?:answer|address|see))|my\s+(?:earlier|previous|last)\s+(?:answer|reply|message)|sorry\s+(?:i|for\s+(?:missing|not\s+answering)))\b/i;
const SCOPED_ESCALATION_PROMISE_RE =
  /\b(?:i(?:'ve|\s+have)?\s+(?:forwarded|escalated|passed|sent|flagged|assigned)|i(?:'ll|\s+will)\s+(?:forward|escalate|pass|flag|assign|notify|check\s+with)|let\s+me\s+(?:forward|escalate|pass|check\s+with))\b/i;

function scopedBodyViolation(body) {
  const b = String(body || '');
  if (!b.trim()) return 'empty';
  if (SCOPED_IDENTITY_ASK_RE.test(b)) return 'identity_ask';
  if (SCOPED_ESCALATION_PROMISE_RE.test(b)) return 'escalation_promise';
  if (SCOPED_TEAMMATE_IMPERSONATION_RE.test(b)) return 'speaks_as_teammate';
  return '';
}

module.exports = {
  GENERAL,
  BACKEND,
  UNCERTAIN,
  teammateRepliedAfter,
  pendingClientWindow,
  teammateSilenceDirective,
  isBotAuthConfirmNoteText,
  isLunaSeatAuthor,
  RESUME_DIRECTIVE_RE,
  SILENCE_DIRECTIVE_RE,
  buildOwnershipTranscript,
  normalizeClassification,
  extractJson,
  classifyPendingAsks,
  decideTeammateScopedRoute,
  buildScopedInstruction,
  scopedBodyViolation,
  CLASSIFIER_SYSTEM,
  TEAMMATE_TOPIC_OWNERSHIP_VERSION: 'TEAMMATE_TOPIC_OWNERSHIP_V1',
};
