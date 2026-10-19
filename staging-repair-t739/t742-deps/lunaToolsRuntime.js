'use strict';

/**
 * lunaToolsRuntime.js — FAST/FULL routing and the six-tool loop, on /v1/responses.
 *
 * Tools: get_state, search_knowledge, calc, compare_challenges, read_image_facts,
 *        list_open_escalation.
 *
 * What the Responses migration changed here
 * -----------------------------------------
 *  - The loop now runs WITH reasoning. On chat.completions gpt-5.6-luna refused tools together
 *    with any reasoning, so every "which tool next" decision and every final answer built on
 *    tool results was produced unreasoned. That restriction does not exist on /v1/responses.
 *  - Continuation is explicit replay of the model's own typed output items (including the
 *    opaque reasoning items) plus one `function_call_output` per `call_id`. No
 *    `previous_response_id`, no provider-side storage: `store:false`. Verified by probe on
 *    2026-09-22.
 *  - Budgets live on the episode, not on a local counter, so a retry or a wrapper cannot start
 *    a second four-round loop for the same inbound message.
 *
 * Business logic of the tools themselves is untouched — this file only speaks protocol.
 */

const modelConfig = require('./modelConfig');
const transport = require('./lunaResponsesTransport');
const lunaEpisode = require('./lunaEpisode');

const MAX_TOOL_ROUNDS = 4;

/** Argument payloads larger than this are refused rather than parsed. */
const MAX_ARGS_CHARS = 8000;
/** Serialized tool results larger than this are trimmed, with the trim declared. */
const MAX_RESULT_CHARS = 12000;

const TOOLS_HINT =
  '\n\nTOOLS AVAILABLE: You may call get_state, search_knowledge, calc, compare_challenges, ' +
  'read_image_facts, or list_open_escalation when helpful before your final answer. ' +
  'Final response must still be ACTION format only.';

function toolsEnabled() {
  const v = String(process.env.LUNA_TOOLS_ENABLED === undefined ? '1' : process.env.LUNA_TOOLS_ENABLED).toLowerCase().trim();
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no');
}

function configureTools(__statePresend, opts) {
  opts = opts || {};
  const faqKb = opts.faqKb;
  // Everything search_knowledge actually returned this turn. The send gate audits policy
  // figures against evidence, and it used to see only the slice index.js retrieved from the
  // client's raw message. When the model looked something up itself with a better query, a
  // correct figure ("0,5% minimum profitable day", which IS in the approved FAQ) was reported
  // as unsupported. The auditor must read the same approved sources the model read.
  const retrievedKnowledge = opts.retrievedKnowledge || [];
  const parts = opts.parts;
  const imageAskGuard = opts.imageAskGuard;
  const getEscalateState = opts.getEscalateState;

  const retriever = async (q) => {
    if (!faqKb || typeof faqKb.retrieveOfficialFaqContext !== 'function') return [];
    try {
      const hit = await faqKb.retrieveOfficialFaqContext(q);
      if (hit && hit.block) {
        const results = [
          {
            text: hit.block,
            score: 0.72,
            source: hit.from || 'faq-kb',
            title: 'Official FAQ',
            authority: hit.authority || 'local-knowledge-store',
            provenance: hit.provenance || null,
            url: hit.provenance && hit.provenance[0] && hit.provenance[0].url,
            sourceHash: hit.provenance && hit.provenance[0] && hit.provenance[0].sourceHash,
            lastSynced: hit.provenance && hit.provenance[0] && hit.provenance[0].lastSynced,
            version: hit.provenance && hit.provenance[0] && hit.provenance[0].version,
            product: hit.provenance && hit.provenance[0] && hit.provenance[0].product,
            stage: hit.provenance && hit.provenance[0] && hit.provenance[0].stage,
          },
        ];
        for (const r of results) if (!retrievedKnowledge.some((k) => k.text === r.text)) retrievedKnowledge.push(r);
        return results;
      }
    } catch (e) {
      console.error('LUNA_TOOLS_RETRIEVER_FAIL', e && e.message);
    }
    return [];
  };

  const getMessages = async () => parts;

  const getImages = (cid) => {
    try {
      if (!imageAskGuard || typeof imageAskGuard.snapshot !== 'function') {
        return { received: 0, loaded: 0 };
      }
      const s = imageAskGuard.snapshot(cid);
      return {
        received: (s && s.imagesReceived) || 0,
        loaded: (s && s.imagesLoaded) || 0,
      };
    } catch (_) {
      return { received: 0, loaded: 0 };
    }
  };

  const escalateGetter = (cid) => {
    try {
      if (typeof getEscalateState !== 'function') return null;
      return getEscalateState(cid);
    } catch (_) {
      return null;
    }
  };

  return __statePresend.configure({
    retriever,
    getMessages,
    getImages,
    escalateGetter,
  });
}

function withToolsHint(userContent) {
  if (typeof userContent === 'string') return userContent + TOOLS_HINT;
  if (Array.isArray(userContent)) {
    // Never mutate the caller's array, and never attach the hint to an image part.
    const copy = userContent.slice();
    const lastTextIdx = findLastTextIndex(copy);
    if (lastTextIdx >= 0) {
      const part = copy[lastTextIdx];
      copy[lastTextIdx] = { ...part, text: String(part.text || '') + TOOLS_HINT };
    } else {
      copy.push({ type: 'text', text: TOOLS_HINT.trim() });
    }
    return copy;
  }
  return userContent;
}

function findLastTextIndex(parts) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p && (p.type === 'text' || p.type === 'input_text') && typeof p.text === 'string') return i;
  }
  return -1;
}

/* ------------------------------------------------------------ tool protocol */

/**
 * Validate one requested call BEFORE executing it.
 * Returns either { ok:true, args } or { ok:false, error } — a structured rejection that is
 * still returned to the model as this call's function_call_output, so the protocol stays
 * consistent and the model can recover inside the remaining budget.
 */
function validateCall(call, allowedNames, seenCallIds) {
  if (!call.callId) {
    return { ok: false, error: { ok: false, error: 'protocol_error', detail: 'function call had no call_id' } };
  }
  if (seenCallIds.has(call.callId)) {
    return { ok: false, error: { ok: false, error: 'duplicate_call_id', detail: 'this call_id was already resolved' } };
  }
  if (!call.name || !allowedNames.has(call.name)) {
    return { ok: false, error: { ok: false, error: 'unknown_tool', detail: 'tool is not available' } };
  }
  const raw = call.argumentsRaw == null ? '{}' : String(call.argumentsRaw);
  if (raw.length > MAX_ARGS_CHARS) {
    return { ok: false, error: { ok: false, error: 'arguments_too_large', limit: MAX_ARGS_CHARS } };
  }
  let args;
  try {
    args = JSON.parse(raw || '{}');
  } catch (_) {
    return { ok: false, error: { ok: false, error: 'malformed_arguments', detail: 'arguments were not valid JSON' } };
  }
  if (args == null || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, error: { ok: false, error: 'malformed_arguments', detail: 'arguments must be a JSON object' } };
  }
  return { ok: true, args };
}

/**
 * Keep a tool result inside the transport budget WITHOUT silently losing qualifications,
 * units, product/stage distinctions or provenance.
 *
 * Strategy: trim the longest array fields first and declare exactly what was dropped. If the
 * result still does not fit, refuse it with an explicit error instead of shipping a payload
 * that quietly lost a condition.
 */
function boundResult(result) {
  let s = safeStringify(result);
  if (s.length <= MAX_RESULT_CHARS) return { output: s, truncated: false };

  if (result && typeof result === 'object') {
    const clone = { ...result };
    const arrayKeys = Object.keys(clone)
      .filter((k) => Array.isArray(clone[k]))
      .sort((a, b) => safeStringify(clone[b]).length - safeStringify(clone[a]).length);
    for (const k of arrayKeys) {
      const orig = clone[k];
      for (let keep = Math.floor(orig.length / 2); keep >= 1; keep = Math.floor(keep / 2)) {
        clone[k] = orig.slice(0, keep);
        clone._truncated = { ...(clone._truncated || {}), [k]: { kept: keep, omitted: orig.length - keep } };
        s = safeStringify(clone);
        if (s.length <= MAX_RESULT_CHARS) return { output: s, truncated: true };
      }
      clone[k] = orig;
      delete (clone._truncated || {})[k];
    }
  }
  return {
    output: safeStringify({ ok: false, error: 'result_too_large', limit: MAX_RESULT_CHARS, detail: 'tool result could not be delivered without losing detail' }),
    truncated: true,
  };
}

/**
 * A handler's exception message can carry absolute paths, line numbers or connection strings.
 * None of that may go back to the model (it becomes part of the prompt) — strip it and keep a
 * short, useful description.
 */
function sanitizeErrorDetail(message) {
  return String(message || 'dispatch failed')
    .replace(/(?:[A-Za-z]:)?[\\/][\w.@+-]+(?:[\\/][\w.@+-]+)+(?::\d+(?::\d+)?)?/g, '[path]')
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, '[email]')
    .replace(/\b(?:sk|tok|Bearer)[-_][A-Za-z0-9._-]{8,}/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function safeStringify(v) {
  try { return JSON.stringify(v == null ? {} : v); } catch (_) { return '{"ok":false,"error":"unserializable_result"}'; }
}

/* ------------------------------------------------------------------ routes */

/** FAST / tools-disabled: one Responses call, MEDIUM reasoning, MEDIUM verbosity, no tools. */
async function plainCreate(openai, control, userContent, ctx) {
  ctx = ctx || {};
  const parsed = await transport.createRaw(openai, {
    model: control.getModel(),
    ...modelConfig.answerParams({
      tools: false,
      purpose: ctx.purpose || 'plain',
      state: ctx.state,
      signals: ctx.signals,
      episode: ctx.episode,
      phase: ctx.phase || 'initial',
      conversationId: ctx.conversationId,
    }),
    messages: [
      { role: 'system', content: control.getPrompt() },
      { role: 'user', content: userContent },
    ],
    conversationId: ctx.conversationId,
    episode: ctx.episode,
    route: ctx.route,
  });
  return parsed;
}

async function runChat(p) {
  p = p || {};
  const {
    openai,
    control,
    __statePresend,
    conversationId,
    parts,
    latestUser,
    text,
    imageAtts,
    userContent,
    faqKb,
    imageAskGuard,
    getEscalateState,
  } = p;

  const episode = p.episode || lunaEpisode.current(conversationId);
  const toolCallsLog = [];
  const retrievedKnowledge = [];
  let route = 'FAST';

  if (!toolsEnabled()) {
    // The operational disable switch must degrade safely, never guess. Luna still answers from
    // the prompt and the FAQ slice index.js already retrieved; it simply cannot look anything
    // else up, and the presend gate still audits every figure it states.
    console.log('LUNA_TOOLS', conversationId, 'disabled');
    const parsed = await plainCreate(openai, control, userContent, {
      conversationId, episode, route: 'DISABLED', purpose: 'disabled.plain',
      signals: { text, hasImage: !!(imageAtts && imageAtts.length) },
    });
    return { rawOut: parsed.text, route: 'DISABLED', toolCallsLog, retrievedKnowledge, episode, effort: null };
  }

  try {
    configureTools(__statePresend, {
      faqKb,
      parts,
      conversationId,
      imageAskGuard,
      getEscalateState,
      retrievedKnowledge,
    });

    // IMAGE_EVIDENCE_V1 (2026-09-28): the vision hint read by read_image_facts and by the pre-send image-evidence
    // checks is the REAL content of the client's screenshot (index.js imageEvidence.extract), never the prompt text.
    // It used to be the client text + the whole prompt (history + FAQ), so the "image evidence" contained none of
    // the screenshot's figures and every number in the history counted as image evidence. No evidence -> no hint.
    try {
      const imageEv = String(p.imageEvidenceText || '').trim();
      if (imageEv && typeof __statePresend.noteVisionHint === 'function') __statePresend.noteVisionHint(conversationId, imageEv);
    } catch (_) { /* ignore */ }

    const built = __statePresend.buildState(conversationId, parts, latestUser);
    const state = built && built.state ? built.state : built;

    // The router used to receive only { text, hasImage }. Everything else it can use is
    // already computed on this path, so it is wired through instead of re-detected — and the
    // same trusted structured context feeds the effort policy.
    const features = buildFeatures(p, state);

    const decision = __statePresend.modules.router.decide(state, features);
    route = (decision && decision.route) || 'FULL';
    console.log(
      'LUNA_ROUTE',
      conversationId,
      route,
      (decision && decision.reasons && decision.reasons.join(',')) || ''
    );

    if (route !== 'FULL') {
      const fast = await plainCreate(openai, control, userContent, {
        conversationId, episode, route, state, signals: features, purpose: 'fast.plain',
      });
      // FAST→FULL promotion. The abandoned FAST draft is never published; the episode keeps
      // its identity and its already-spent budget.
      //
      // Two triggers:
      //  1. the FAST answer is unusable (empty / incomplete / refused), and
      //  2. the FAST answer is an ESCALATE on a question the approved knowledge base can
      //     answer. FAST has no tools, so when the model decides it lacks evidence its only
      //     exit is to hand off — which the owner's standing rule forbids for general product
      //     and policy questions. Promoting gives it search_knowledge and a real chance to
      //     answer. The caller supplies the predicate (`shouldPromoteOnDraft`) because that is
      //     a business rule and belongs in index.js, not in the transport layer.
      // SMALLTALK_COURTESY_V1: pure courtesy never promotes to the tool route; an unusable draft is replaced
      // by index.js's deterministic social line instead.
      if (features.smalltalk) {
        console.log('LUNA_TOOLS', conversationId, 'SMALLTALK calls 0 rounds 0');
        return { rawOut: fast.text || '', route, toolCallsLog, retrievedKnowledge, episode, effort: 'medium' };
      }
      let promoteWhy = needsPromotion(fast) ? promotionReason(fast) : null;
      if (!promoteWhy && typeof p.shouldPromoteOnDraft === 'function') {
        try {
          if (p.shouldPromoteOnDraft(fast.text)) promoteWhy = 'escalate-on-knowledge-answerable';
        } catch (e) {
          console.error('LUNA_PROMOTE_PREDICATE_FAIL', conversationId, e && e.message);
        }
      }
      if (promoteWhy) {
        console.log('LUNA_ROUTE_PROMOTE', conversationId, 'FAST->FULL', promoteWhy);
        episode.markPromoted();
        route = 'FULL';
      } else {
        return { rawOut: fast.text, route, toolCallsLog, retrievedKnowledge, episode, effort: 'medium' };
      }
    }

    return await runFullRoute({
      openai, control, __statePresend, conversationId, userContent,
      state, features, episode, toolCallsLog, retrievedKnowledge, route,
    });
  } catch (e) {
    const err = e && e.name === 'LunaModelError' ? e : transport.classifyError(e);
    console.error('LUNA_TOOLS_FAIL', conversationId, err.kind || '', err.message);
    episode.markFallback('tools-runtime-error:' + (err.kind || 'unknown'));
    // Bounded recovery: one plain attempt, then the caller's existing fallback/handoff policy
    // takes over on an empty rawOut. No silent success is manufactured.
    try {
      const parsed = await plainCreate(openai, control, userContent, {
        conversationId, episode, route, purpose: 'recovery.plain',
        signals: { text, hasImage: !!(imageAtts && imageAtts.length) },
      });
      return { rawOut: parsed.text, route, toolCallsLog, retrievedKnowledge, episode, effort: 'medium' };
    } catch (e2) {
      const err2 = e2 && e2.name === 'LunaModelError' ? e2 : transport.classifyError(e2);
      console.error('LUNA_TOOLS_RECOVERY_FAIL', conversationId, err2.kind || '', err2.message);
      episode.markFallback('recovery-failed:' + (err2.kind || 'unknown'));
      return { rawOut: '', route, toolCallsLog, retrievedKnowledge, episode, effort: null };
    }
  }
}

/**
 * Structured context for the router and the effort policy. Signals are taken from state that
 * has already been computed for this turn — nothing here re-runs a detector or copies a whole
 * history into a signal object.
 */
function buildFeatures(p, state) {
  const text = String(p.text || '');
  const s = state || {};
  return {
    text,
    hasImage: !!(p.imageAtts && p.imageAtts.length),
    imageNeedsExtraction: !!(p.imageAtts && p.imageAtts.length),
    clientMessagesSinceLastReply: Array.isArray(s.client_burst) ? s.client_burst.length : 0,
    knowledgeLevel: p.knowledgeLevel || (Array.isArray(p.knowledge) && p.knowledge.length ? 'supported' : undefined),
    previousPresendFailed: !!p.previousPresendFailed,
    presendHardCodes: Array.isArray(p.presendHardCodes) ? p.presendHardCodes.slice(0, 8) : [], // X4 on tool-loop regeneration
    correction: !!(Array.isArray(s.recent_corrections) && s.recent_corrections.length),
    hasPriorBotAnswer: !!(s.counts && s.counts.bot > 0),
    identitySensitive: /\b(?:not my account|someone else|on behalf|hacked|unauthori[sz]ed|transfer (?:the )?account)\b/i.test(text),
    calculation: /\b(?:how much|calculate|percent|%|profit target|drawdown|days? left|split)\b/i.test(text) && /\d/.test(text),
    comparison: /\b(?:compare|versus|vs\.?|difference between|which is better)\b/i.test(text),
    policyInvolved: /\b(?:rule|policy|allowed|permitted|eligible|require|condition|payout|refund|breach)\b/i.test(text),
    forceFull: !!p.forceFull,
    smalltalk: !!p.smalltalk, // SMALLTALK_COURTESY_V1
  };
}

/** A FAST answer that cannot be used is promoted, never published. */
function needsPromotion(fast) {
  if (!fast) return true;
  if (fast.incomplete) return true;
  if (fast.refusal) return true;
  if (!fast.text) return true;
  return false;
}

function promotionReason(fast) {
  if (!fast) return 'no-result';
  if (fast.incomplete) return 'incomplete:' + fast.incompleteReason;
  if (fast.refusal) return 'refusal';
  if (!fast.text) return 'empty-text';
  return 'unknown';
}

/* --------------------------------------------------------------- FULL route */

async function runFullRoute(ctx) {
  const {
    openai, control, __statePresend, conversationId, userContent,
    state, features, episode, toolCallsLog, retrievedKnowledge, route,
  } = ctx;

  const toolsApi = __statePresend.getTools();
  const specs = toolsApi.specs({ style: 'raw' });
  const allowedNames = new Set(toolsApi.names);
  const instructions = control.getPrompt();

  // The running episode transcript, as native Responses items.
  let input = [{ role: 'user', content: transport.toInputContent(withToolsHint(userContent)) }];

  const seenCallIds = new Set();
  let rawOut = '';
  let finished = false;
  let lastSignature = null;
  let noProgressRounds = 0;

  while (!finished) {
    // TOOL_BUDGET_FINAL_V1: also stop when no normal model call is left, so the loop ends in the
    // exhaustion final below instead of throwing a budget error into recovery (which also failed -> '').
    if (!episode.canStartToolRound() || !episode.canModelCall()) {
      console.log('LUNA_TOOLS_ROUND_BUDGET', conversationId, 'rounds', episode.toolRounds, 'calls', episode.toolCalls, 'expired', episode.expired(), 'modelCalls', episode.modelCalls);
      break;
    }

    let parsed;
    try {
      parsed = await transport.createRaw(openai, {
        model: control.getModel(),
        ...modelConfig.answerParams({
          tools: true,
          purpose: 'full.tool-round',
          state,
          signals: features,
          episode,
          phase: episode.toolRounds === 0 ? 'initial' : 'post-tools',
          conversationId,
        }),
        instructions,
        input,
        tools: specs,
        tool_choice: 'auto',
        conversationId,
        episode,
        route: 'FULL',
      });
    } catch (e) {
      const err = e && e.name === 'LunaModelError' ? e : transport.classifyError(e);
      console.error('LUNA_TOOLS_FAIL', conversationId, err.kind, err.message);
      episode.markFallback('tool-round-failed:' + err.kind);
      // Bounded recovery, no invisible downgrade to another API.
      const recovered = await plainCreate(openai, control, userContent, {
        conversationId, episode, route: 'FULL', state, signals: features, purpose: 'full.recovery',
      });
      return { rawOut: recovered.text, route, toolCallsLog, retrievedKnowledge, episode, effort: 'medium' };
    }

    const calls = parsed.toolCalls;

    if (!calls.length) {
      // Final assistant text. An incomplete or refused response yields '' and the caller's
      // existing fallback/handoff policy decides — a truncated fragment is never an answer.
      rawOut = parsed.text;
      if (parsed.incomplete) episode.markFallback('incomplete:' + parsed.incompleteReason);
      if (parsed.refusal) episode.markFallback('refusal');
      finished = true;
      break;
    }

    // Text arriving ALONGSIDE pending calls is intermediate narration. It is not published;
    // the tool workflow is completed first.
    if (parsed.text) console.log('LUNA_TOOLS_INTERIM_TEXT_DISCARDED', conversationId, parsed.text.length, 'chars');

    episode.startToolRound();
    const roundNo = episode.toolRounds;

    // Repeated identical batches make no progress — stop instead of looping to the cap.
    const signature = calls.map((c) => c.name + ':' + (c.argumentsRaw || '')).sort().join('|');
    if (signature === lastSignature) {
      noProgressRounds += 1;
      if (noProgressRounds >= 2) {
        console.log('LUNA_TOOLS_NO_PROGRESS', conversationId, 'round', roundNo);
        episode.markFallback('no-progress');
        break;
      }
    } else {
      noProgressRounds = 0;
    }
    lastSignature = signature;

    // Replay the model's own typed items verbatim (reasoning items included, opaque).
    input = input.concat(parsed.outputItems);

    const allowed = episode.allowedCallsThisRound(calls.length);
    let executed = 0;

    // Sequential on purpose. Several handlers read conversation state that an earlier call in
    // the same batch can change, so nothing here is "demonstrably independent".
    for (const call of calls) {
      const check = validateCall(call, allowedNames, seenCallIds);
      let result;

      if (!check.ok) {
        result = check.error;
        console.log('LUNA_TOOLS_REJECT', conversationId, call.name || '?', result.error, 'round', roundNo);
      } else if (executed >= allowed) {
        result = { ok: false, error: 'tool_call_budget_exhausted', detail: 'no tool-call budget left in this episode' };
        console.log('LUNA_TOOLS_BUDGET_REJECT', conversationId, call.name, 'round', roundNo);
      } else {
        executed += 1;
        episode.chargeToolCall(call.name);
        try {
          result = await toolsApi.dispatch(call.name, check.args, { conversationId });
        } catch (e) {
          // Execution failure is distinct from unavailability, malformed input and permission
          // failure. No stack trace and no secret goes back to the model.
          console.error('LUNA_TOOLS_FAIL', conversationId, call.name, e && e.message);
          result = { ok: false, error: 'execution_failed', detail: sanitizeErrorDetail(e && e.message) };
        }
        toolCallsLog.push({ name: call.name, args: check.args, ok: !!(result && result.ok) });
        // X6 (effortPolicy): the policy sees which evidence categories actually returned results this episode.
        if (features && typeof features === 'object') (features.toolResults = features.toolResults || []).push({ name: call.name, ok: !!(result && result.ok) });
        console.log('LUNA_TOOLS_CALL', conversationId, call.name, 'round', roundNo);
      }

      if (call.callId) seenCallIds.add(call.callId);
      const bounded = boundResult(result);
      if (bounded.truncated) console.log('LUNA_TOOLS_RESULT_TRUNCATED', conversationId, call.name || '?');

      // Every pending call_id gets exactly one matching output, including the rejected ones —
      // otherwise the next request is a protocol error and the round is wasted.
      input.push({ type: 'function_call_output', call_id: call.callId, output: bounded.output });
    }
  }

  // After the last round, ONE dedicated no-tools finalization may consume the results.
  // It is not a fifth tool round: tool_choice is 'none' and no tools are offered.
  if (!finished) {
    if (!episode.canFinalize()) {
      console.log('LUNA_TOOLS_NO_FINALIZE_BUDGET', conversationId);
      episode.markFallback('finalize-budget');
      return { rawOut: '', route, toolCallsLog, retrievedKnowledge, episode, effort: 'medium' };
    }
    try {
      const finalInput = input.concat([{
        role: 'user',
        content: [{ type: 'input_text', text: 'Please give your final ACTION-format reply now without calling more tools.' }],
      }]);
      const parsed = await transport.createRaw(openai, {
        model: control.getModel(),
        ...modelConfig.answerParams({
          tools: false, purpose: 'full.exhaustion-final', state, signals: features,
          episode, phase: 'post-tools', conversationId,
        }),
        instructions,
        input: finalInput,
        conversationId,
        episode,
        route: 'FULL',
      });
      rawOut = parsed.text;
      if (parsed.incomplete) episode.markFallback('finalize-incomplete:' + parsed.incompleteReason);
      console.log('TOOL_BUDGET_FINAL_V1', conversationId, 'exhaustion-final', rawOut ? 'text' : 'empty', 'expired', episode.expired(), 'modelCalls', episode.modelCalls);
      // An incomplete/empty final is not an answer. One bounded plain recovery (no tools, same FAQ
      // context the handler already injected), only inside the normal call budget.
      if (!rawOut && episode.canModelCall()) {
        const recovered = await plainCreate(openai, control, userContent, {
          conversationId, episode, route: 'FULL', state, signals: features, purpose: 'full.recovery',
        });
        rawOut = recovered.text || '';
        console.log('TOOL_BUDGET_FINAL_V1', conversationId, 'recovery', rawOut ? 'text' : 'empty');
      }
    } catch (e) {
      const err = e && e.name === 'LunaModelError' ? e : transport.classifyError(e);
      console.error('LUNA_TOOLS_FAIL', conversationId, err.kind, err.message);
      episode.markFallback('finalize-failed:' + err.kind);
      try {
        const recovered = await plainCreate(openai, control, userContent, {
          conversationId, episode, route: 'FULL', state, signals: features, purpose: 'full.recovery',
        });
        rawOut = recovered.text;
      } catch (e2) {
        console.error('LUNA_TOOLS_RECOVERY_FAIL', conversationId, (e2 && e2.message) || '');
        rawOut = '';
      }
    }
  }

  console.log('LUNA_TOOLS', conversationId, 'FULL', 'calls', toolCallsLog.length, 'rounds', episode.toolRounds);
  return { rawOut, route, toolCallsLog, retrievedKnowledge, episode, effort: 'medium' };
}

module.exports = {
  configureTools,
  runChat,
  toolsEnabled,
  plainCreate,
  buildFeatures,
  validateCall,
  boundResult,
  sanitizeErrorDetail,
  withToolsHint,
  needsPromotion,
  MAX_TOOL_ROUNDS,
  MAX_ARGS_CHARS,
  MAX_RESULT_CHARS,
};
