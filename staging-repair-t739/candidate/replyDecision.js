'use strict';

/** One immutable interpretation for the accepted customer turn.
 * Existing domain detectors are dependencies; downstream code consumes this decision
 * instead of asking different classifiers the same question again. No model call.
 */
const T = require('./statePresend/textUtils');
const followUp = require('./contextualFollowUp');
const multiAsk = require('./statePresend/multiAskCompleteness');
const regen = require('./statePresend/targetedRegeneration');
const turnIntent = require('./statePresend/turnIntent');

function resolve(input) {
  const latestText = T.stripHtml(input.latestText || '').trim();
  const parts = input.parts || [];
  const isAccount = input.isAccount || (() => false);
  const isGeneral = input.isGeneral || (() => false);
  const isRelated = input.isRelated || (() => false);
  const isHumanRequest = input.isHumanRequest || (() => false);
  const hasImage = !!input.hasImage;
  /* TURN_INTENT_V1 (2026-09-28, live 215476138819546): ONE semantic intent for the turn (statePresend/turnIntent):
   * SOCIAL_SMALLTALK / SUPPORT_META / SUPPORT_QUESTION / GENUINE_OFF_TOPIC / UNCLEAR. Out-of-scope is a POSITIVE
   * finding only; before this, any message no detector recognised ("Okay i have some questions are you free to help
   * me ?") fell to the default branch below as out-of-scope and ended in the canned scope refusal. */
  const recentAll = parts.filter((p) => p && p.part_type !== 'note').slice(-12);
  const supportContext = recentAll.some((p) => {
    const b = T.stripHtml(p.body || '').trim();
    if (!b || b === latestText) return false;
    const a = (p.author || {}).type;
    if (a === 'admin' || a === 'bot') return b.length >= 120;
    try { return !!(isAccount(b) || isGeneral(b) || isRelated(b)); } catch (_) { return false; }
  });
  const history = [];
  {
    let skippedLatest = false;
    for (let i = recentAll.length - 1; i >= 0 && history.length < 18; i -= 1) {
      const p = recentAll[i];
      const a = (p.author || {}).type || (p.role === 'client' ? 'user' : (p.role === 'bot' ? 'bot' : ((p.role === 'human' || p.role === 'agent') ? 'admin' : '')));
      const text = T.stripHtml(p.body || p.text || '').trim();
      if (!text) continue;
      const role = (a === 'user' || a === 'lead') ? 'client' : ((a === 'admin' || a === 'bot') ? 'agent' : '');
      if (!role) continue;
      if (!skippedLatest && role === 'client' && text === latestText) { skippedLatest = true; continue; }
      history.push({ role, text, ts: Number(p.created_at || 0) || 0 });
    }
    history.reverse();
  }
  let intent;
  try {
    intent = turnIntent.classify(latestText, {
      isSupport: (q) => !!(isAccount(q) || isGeneral(q) || isRelated(q)),
      isExternal: input.isExternal, supportContext, hasImage, history,
    });
  } catch (_) {
    intent = { intent: 'UNCLEAR', components: [], reason: 'classifier-error', offTopic: '', resolvedAsk: '', specificClarify: '' };
  }
  // A screenshot carries the question: "can you help?" + image is image work, not conversation management.
  const conversational = !hasImage && (intent.intent === 'SOCIAL_SMALLTALK' || intent.intent === 'SUPPORT_META');
  // Positive off-topic evidence is authoritative: "are you free this weekend to hang out?" also looks like light
  // social chat to the courtesy detector, but it is an invitation, i.e. the boundary.
  const latestIsSmalltalk = intent.intent !== 'GENUINE_OFF_TOPIC' && (T.isGreetingOrSmallTalk(latestText) ||
    !!(input.isShortAck && input.isShortAck(latestText)) || conversational);
  const follow = latestIsSmalltalk
    ? { isFollowUp: false, resolvedText: latestText, priorAsk: '', reason: 'smalltalk' }
    : followUp.resolveContextualFollowUp({ parts, latestText });
  const anchor = follow.priorAsk || '';
  let knowledgeQuery = follow.isFollowUp && anchor
    ? (follow.reason === 'attribute-followup' ? follow.resolvedText : anchor)
    : latestText;
  if (!latestIsSmalltalk && !anchor && input.resolvePendingAsk) {
    const pending = String(input.resolvePendingAsk(parts, latestText) || '').trim();
    if (pending) knowledgeQuery = pending;
  }
  // A reconstructed follow-up ("How long?" -> crypto arrival) is what retrieval and
  // the answer path should judge. A prior completeness follow-up already has its anchor.
  if (!latestIsSmalltalk && intent.resolvedAsk && !(follow.isFollowUp && anchor)) {
    knowledgeQuery = intent.resolvedAsk;
  }
  const askText = knowledgeQuery;
  const extracted = multiAsk.extractAsks([{ role: 'client', text: askText }]);
  const asks = ((extracted && extracted.burst) || []).map((a) => String(a.text || '').trim()).filter(Boolean);
  const units = asks.length ? asks : [knowledgeQuery];
  const accountAsks = units.filter(isAccount);
  const generalAsks = units.filter((q) => !isAccount(q) && isGeneral(q));
  // A short answer to Luna's open question belongs to the active account case.
  // This is structural context, not a product-name phrase list: an earlier client
  // reported account work, Luna asked a question, and the latest message supplies
  // a brief answer rather than asking a new question.
  const recent = parts.filter((p) => p && p.part_type !== 'note').slice(-12);
  const priorAccount = recent.some((p) => (p.author || {}).type === 'user' &&
    T.stripHtml(p.body || '').trim() !== latestText && isAccount(T.stripHtml(p.body || '')));
  const lastBot = recent.slice().reverse().find((p) => (p.author || {}).type === 'admin' || (p.author || {}).type === 'bot');
  const accountContext = !latestIsSmalltalk && priorAccount && lastBot &&
    /\?\s*$/.test(T.stripHtml(lastBot.body || '')) && !/[?]/.test(latestText) && T.tokens(latestText).length <= 4;
  // IDENTITY_SUPPLY_V1 (2026-09-25, live 215476097191720): Luna asked for the account number ("Before I pass
  // this to the team, please share your account number") and the client supplied it in a sentence ("Current
  // account that I'm trading with is 209174"). That continues the account case at any length; it is not a
  // new general question (it got the stock clarify).
  const lastBotText = lastBot ? T.stripHtml(lastBot.body || '') : '';
  const identitySupply = !latestIsSmalltalk && !/[?]/.test(latestText) &&
    /\b(?:share|send|provide|confirm|give)\b[^.?!]{0,40}\b(?:account\s+(?:number|id|no)|login|mt[45]\s+(?:number|id)|email)\b/i.test(lastBotText) &&
    (/(?:^|\D)\d{5,12}(?:\D|$)/.test(latestText) || /[\w.+-]+@[\w-]+\.[\w.]+/.test(latestText));
  // STATUS_FOLLOWUP_V1 (2026-09-25, live 215476098827398): "Can you please tell when should i expect from your
  // side?" after the client's own payout case was forwarded names no topic of its own, so it resolved to
  // out-of-scope and got "I only cover FundedElite". Asking for the timing / progress of the open case continues
  // that account case. Only when an earlier client message in this conversation was account work.
  const statusFollowUp = !latestIsSmalltalk && priorAccount && !isGeneral(latestText) &&
    /\bwhen\s+(?:should|will|can|could|do|would)\s+i\s+(?:expect|get|receive|hear|see)\b|\b(?:any|an)\s+(?:update|news|timeline|eta|progress)\b|\bhow\s+(?:much\s+)?(?:longer|more\s+time)\b|\bstill\s+(?:waiting|pending|nothing)\b|\bwhat(?:'s|\s+is)\s+(?:the\s+)?(?:status|progress|update)\b/i.test(latestText);
  const productFollowUp = !!(input.isProductFollowUp && input.isProductFollowUp(latestText, recent));
  const imageAnswerable = !!(input.isImageAnswerable && input.isImageAnswerable(latestText));
  let kind;
  if (isHumanRequest(latestText)) kind = 'human-request';
  else if (conversational && intent.intent === 'SUPPORT_META') kind = 'support-meta';
  else if (latestIsSmalltalk) kind = 'smalltalk';
  else if (input.isPersonal && input.isPersonal(latestText)) kind = 'personal';
  else if (accountContext || identitySupply || statusFollowUp) kind = 'account';
  // TURN_INTENT_V1: a personal invite whose only "support" words were its own time phrase ("this weekend") was already
  // judged by the intent layer; the broad FAQ matcher must not flip it back to a KB answer.
  else if (intent.intent === 'GENUINE_OFF_TOPIC' && intent.offTopic === 'personal-invite' && !imageAnswerable) kind = 'out-of-scope';
  else if (accountAsks.length && generalAsks.length) kind = 'mixed';
  else if (accountAsks.length || isAccount(knowledgeQuery)) kind = 'account';
  else if (generalAsks.length || isGeneral(knowledgeQuery) || isRelated(knowledgeQuery) || productFollowUp || imageAnswerable) kind = 'general-faq';
  else if (regen.isContentlessMessage(latestText)) kind = 'contentless';
  else if (intent.intent === 'GENUINE_OFF_TOPIC') kind = 'out-of-scope';
  // CONTEXTUAL_EPISODE_V1: a follow-up resolved against the active topic is support
  // work. Generic clarify is only for GENUINE_UNCLEAR.
  else if (intent.intent === 'SUPPORT_QUESTION' && intent.resolvedAsk) kind = isAccount(knowledgeQuery) ? 'account' : 'general-faq';
  // No positive evidence either way: the normal answer path (the model reads the whole conversation) or a natural
  // clarification handles it; never the canned refusal.
  else kind = 'unclear';
  // IMAGE_ROUTING_V1 (2026-09-28, live 215476135544728): a turn that carries an image is judged with its image, not
  // by its words alone. "What does that mean ? On website can you please explain!" + a FundedElite website
  // screenshot was out-of-scope here because the image was recorded only after this decision. With an image on the
  // current turn (or a referential follow-up to a screenshot sent moments ago), vague / contentless / small-talk /
  // text-only-out-of-scope readings become general-faq: the model sees the image and answers it, and a clearly
  // unrelated image still gets the normal boundary from the model. Human requests and account work are unchanged.
  // TURN_INTENT_V1 merge: the intent layer's text-only 'unclear' / 'support-meta' readings also yield to the image.
  const imageTurn = !!input.hasImage ||
    !!(input.recentImage && (typeof input.isReferentialImageAsk === 'function' ? input.isReferentialImageAsk(latestText) : false));
  if (imageTurn && (kind === 'out-of-scope' || kind === 'contentless' || kind === 'unclear' || kind === 'support-meta' ||
    (kind === 'smalltalk' && !!input.hasImage))) kind = 'general-faq';
  return Object.freeze({
    kind, latestText, knowledgeQuery, contextReason: follow.reason,
    intent: intent.intent, intentReason: intent.reason, intentComponents: Object.freeze((intent.components || []).slice()),
    resolvedAsk: intent.resolvedAsk || '', specificClarify: intent.specificClarify || '',
    offTopic: intent.offTopic || '', supportContext,
    priorAsk: anchor, accountContext: !!(accountContext || identitySupply || statusFollowUp), productFollowUp, imageAnswerable, imageTurn,
    asks: Object.freeze(units.slice()),
    accountAsks: Object.freeze(accountAsks), generalAsks: Object.freeze(generalAsks),
  });
}

function holdKind(decision, holdReason) {
  // A validator can require escalation for backend account work too. Preserve
  // the resolved intent; the hold code alone is not a human request.
  if (!decision) return 'contentless';
  if (decision.kind === 'account' || decision.kind === 'mixed') return 'escalate';
  if (decision.kind === 'out-of-scope') return decision.imageTurn ? 'general-faq' : 'off-topic'; // IMAGE_ROUTING_V1
  // TURN_INTENT_V1: a held conversation-management turn gets a short "go ahead" reply; an unclear one a natural
  // clarification. Neither may become the scope refusal (and an image turn stays general-faq).
  if (decision.kind === 'support-meta') return decision.imageTurn ? 'general-faq' : 'support-meta';
  if (decision.kind === 'unclear') return decision.imageTurn ? 'general-faq' : 'clarify';
  return decision.kind;
}

function requiresIdentity(decision) {
  // A short answer to our own account-detail question may already contain the
  // relevant policy answer plus a legitimate identity request. Let the reply
  // through normal validation; deterministic collect-first would discard it.
  return !!decision && !decision.accountContext && (decision.kind === 'account' || decision.kind === 'mixed');
}

module.exports = { resolve, holdKind, requiresIdentity };
