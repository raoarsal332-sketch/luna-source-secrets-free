'use strict';

/**
 * lunaToolsRuntime.js — FULL-route OpenAI function-calling for Luna.
 * Tools: get_state, search_knowledge, calc, compare_challenges, read_image_facts, list_open_escalation.
 * FAST / disabled → plain chat.completions.create (no tools).
 * Fail-open on tools API / 400 unsupported.
 */

const MAX_TOOL_ROUNDS = 4;

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
  const parts = opts.parts;
  const imageAskGuard = opts.imageAskGuard;
  const getEscalateState = opts.getEscalateState;

  const retriever = async (q) => {
    if (!faqKb || typeof faqKb.retrieveOfficialFaqContext !== 'function') return [];
    try {
      const hit = await faqKb.retrieveOfficialFaqContext(q);
      if (hit && hit.block) {
        return [
          {
            text: hit.block,
            score: 0.72,
            source: hit.from || 'faq-kb',
            title: 'Official FAQ',
          },
        ];
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
  return userContent;
}

async function plainCreate(openai, control, userContent) {
  const ai = await openai.chat.completions.create({
    model: control.getModel(),
    messages: [
      { role: 'system', content: control.getPrompt() },
      { role: 'user', content: userContent },
    ],
  });
  return ((ai.choices[0] && ai.choices[0].message && ai.choices[0].message.content) || '').trim();
}

function isToolsUnsupportedError(e) {
  if (!e) return false;
  const status = e.status || e.statusCode || (e.response && e.response.status);
  if (status === 400) return true;
  const msg = String(e.message || e);
  return /tool|function.?call|unsupported|unrecognized.?request.?argument/i.test(msg);
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

  const toolCallsLog = [];
  let route = 'FAST';

  if (!toolsEnabled()) {
    console.log('LUNA_TOOLS', conversationId, 'disabled');
    const rawOut = await plainCreate(openai, control, userContent);
    return { rawOut, route: 'DISABLED', toolCallsLog };
  }

  try {
    configureTools(__statePresend, {
      faqKb,
      parts,
      conversationId,
      imageAskGuard,
      getEscalateState,
    });

    // Cheap vision hint for read_image_facts (no vision API call).
    try {
      if (imageAtts && imageAtts.length && typeof __statePresend.noteVisionHint === 'function') {
        const hintBits = [];
        if (text) hintBits.push(String(text));
        if (latestUser && latestUser.body) hintBits.push(String(latestUser.body));
        if (typeof userContent === 'string') hintBits.push(userContent);
        else if (Array.isArray(userContent)) {
          for (const part of userContent) {
            if (part && part.type === 'text' && part.text) hintBits.push(String(part.text));
          }
        }
        const hint = hintBits.join('\n').trim();
        if (hint) __statePresend.noteVisionHint(conversationId, hint);
      }
    } catch (_) { /* ignore */ }

    const built = __statePresend.buildState(conversationId, parts, latestUser);
    const state = built && built.state ? built.state : built;
    const decision = __statePresend.modules.router.decide(state, {
      text,
      hasImage: !!(imageAtts && imageAtts.length),
    });
    route = (decision && decision.route) || 'FULL';
    console.log(
      'LUNA_ROUTE',
      conversationId,
      route,
      (decision && decision.reasons && decision.reasons.join(',')) || ''
    );

    if (route !== 'FULL') {
      const rawOut = await plainCreate(openai, control, userContent);
      return { rawOut, route, toolCallsLog };
    }

    const toolsApi = __statePresend.getTools();
    const specs = toolsApi.specs();
    const messages = [
      { role: 'system', content: control.getPrompt() },
      { role: 'user', content: withToolsHint(userContent) },
    ];

    let rawOut = '';
    let finished = false;

    for (let round = 0; round < MAX_TOOL_ROUNDS && !finished; round++) {
      let ai;
      try {
        ai = await openai.chat.completions.create({
          model: control.getModel(),
          messages,
          tools: specs,
          tool_choice: 'auto',
          // gpt-5.6-luna: function tools need reasoning_effort none on chat.completions
          reasoning_effort: 'none',
        });
      } catch (e) {
        if (isToolsUnsupportedError(e)) {
          console.error('LUNA_TOOLS_UNSUPPORTED', conversationId, e && e.message);
        } else {
          console.error('LUNA_TOOLS_FAIL', conversationId, e && e.message);
        }
        rawOut = await plainCreate(openai, control, userContent);
        return { rawOut, route, toolCallsLog };
      }

      const msg = (ai.choices[0] && ai.choices[0].message) || {};
      const tcs = msg.tool_calls || [];
      if (!tcs.length) {
        rawOut = (msg.content || '').trim();
        finished = true;
        break;
      }

      messages.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: tcs,
      });

      for (const tc of tcs) {
        const name = (tc.function && tc.function.name) || '';
        let args = {};
        try {
          args = JSON.parse((tc.function && tc.function.arguments) || '{}');
        } catch (_) {
          args = {};
        }
        let result;
        try {
          result = await toolsApi.dispatch(name, args, { conversationId });
        } catch (e) {
          console.error('LUNA_TOOLS_FAIL', conversationId, name, e && e.message);
          result = { ok: false, error: (e && e.message) || 'dispatch failed' };
        }
        toolCallsLog.push({ name, args, ok: !!(result && result.ok) });
        console.log('LUNA_TOOLS_CALL', conversationId, name, 'round', round + 1);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result == null ? {} : result),
        });
      }
    }

    if (!finished) {
      try {
        const ai = await openai.chat.completions.create({
          model: control.getModel(),
          messages: [
            ...messages,
            {
              role: 'user',
              content: 'Please give your final ACTION-format reply now without calling more tools.',
            },
          ],
        });
        rawOut = (
          (ai.choices[0] && ai.choices[0].message && ai.choices[0].message.content) ||
          ''
        ).trim();
      } catch (e) {
        console.error('LUNA_TOOLS_FAIL', conversationId, e && e.message);
        rawOut = await plainCreate(openai, control, userContent);
      }
    }

    console.log('LUNA_TOOLS', conversationId, 'FULL', 'calls', toolCallsLog.length);
    return { rawOut, route, toolCallsLog };
  } catch (e) {
    console.error('LUNA_TOOLS_FAIL', conversationId, e && e.message);
    const rawOut = await plainCreate(openai, control, userContent);
    return { rawOut, route, toolCallsLog };
  }
}

module.exports = {
  configureTools,
  runChat,
  toolsEnabled,
  MAX_TOOL_ROUNDS,
};
