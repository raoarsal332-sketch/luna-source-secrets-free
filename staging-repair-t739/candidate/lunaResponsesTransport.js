'use strict';

/**
 * lunaResponsesTransport.js — the ONE place Luna talks to the OpenAI generation API.
 *
 * Why this module exists
 * ----------------------
 * Luna used to call `openai.chat.completions.create` from 11 places. On /v1/chat/completions
 * gpt-5.6-luna refuses to combine function tools with any reasoning_effort other than 'none'
 * ("To use function tools, use /v1/responses or set reasoning_effort to 'none'"), which is why
 * the whole tool loop ran unreasoned. /v1/responses has no such restriction — probed
 * 2026-09-22, evidence in docs/responses-migration/probe-responses.json.
 *
 * Responsibilities (transport only — no business decisions, no Intercom side effects):
 *   - build the outgoing Responses request from Luna's existing message shape
 *   - enforce reasoning effort + verbosity centrally, and REJECT invalid configuration
 *     rather than silently dropping it or downgrading the model
 *   - parse the whole typed output, not just its first item
 *   - normalize errors into retryable / fatal categories
 *   - emit one structured telemetry line per attempt
 *
 * Return contract: `create()` returns a Chat-Completions-shaped object so the existing call
 * sites keep working unchanged. That shape is produced HERE and nowhere else; the tool loop
 * uses `createRaw()` and works with native typed items.
 *
 * Rollback: LUNA_API_MODE=chat restores the legacy Chat Completions transport. That is a
 * deliberate, release-level emergency switch — never an automatic per-request downgrade.
 */

const rateGate = require('./openaiRateGate'); // OPENAI_RATE_GATE_V1: pacing + bounded 429 retry (transport only)

const MODES = new Set(['responses', 'chat']);
const VALID_EFFORT = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const VALID_VERBOSITY = new Set(['low', 'medium', 'high']);

/** Efforts allowed on EVERY live model call (2026-09-27 REASONING_MEDIUM_V1: MEDIUM only). */
const CUSTOMER_MIN_EFFORTS = new Set(['medium']);
const FIXED_EFFORT = 'medium';
// VERBOSITY_HIGH_V1 (2026-09-28, owner): every live call is sent with HIGH verbosity; effort stays MEDIUM.
const FIXED_VERBOSITY = 'high';

function apiMode() {
  const v = String(process.env.LUNA_API_MODE || 'responses').toLowerCase().trim();
  return MODES.has(v) ? v : 'responses';
}

class LunaModelError extends Error {
  constructor(message, kind, meta) {
    super(message);
    this.name = 'LunaModelError';
    this.kind = kind; // 'config' | 'auth' | 'rate_limit' | 'timeout' | 'server' | 'protocol' | 'incomplete' | 'unknown'
    this.retryable = kind === 'rate_limit' || kind === 'timeout' || kind === 'server';
    Object.assign(this, meta || {});
  }
}

function classifyError(e) {
  if (!e) return new LunaModelError('unknown model failure', 'unknown');
  const status = e.status || e.statusCode || (e.response && e.response.status) || 0;
  const code = String(e.code || '');
  const msg = String(e.message || e);
  let kind = 'unknown';
  if (status === 429) kind = 'rate_limit';
  else if (status >= 500) kind = 'server';
  else if (status === 401 || status === 403) kind = 'auth';
  else if (status === 400 || status === 404 || status === 422) kind = 'config';
  else if (/timeout|ETIMEDOUT|ESOCKETTIMEDOUT|aborted/i.test(msg + code)) kind = 'timeout';
  else if (/ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up/i.test(msg + code)) kind = 'server';
  const out = new LunaModelError(msg, kind, { status, providerRequestId: e.request_id || (e.headers && e.headers['x-request-id']) || null });
  out.cause = e;
  return out;
}

/* ------------------------------------------------------------------ settings */

/**
 * Resolve effort/verbosity from whatever the caller passed, accepting both the legacy
 * chat-style keys (reasoning_effort / verbosity) and the native ones.
 *
 * Invalid values throw. Any other valid effort/verbosity is clamped to MEDIUM for every call including
 * housekeeping (2026-09-27 owner rule REASONING_MEDIUM_V1).
 */
function resolveSettings(req) {
  const effort = String(
    (req.reasoning && req.reasoning.effort) || req.effort || req.reasoning_effort || ''
  ).toLowerCase().trim();
  const verbosity = String(
    (req.text && req.text.verbosity) || req.verbosity || ''
  ).toLowerCase().trim();

  if (!effort) throw new LunaModelError('reasoning effort missing (purpose=' + (req.purpose || '?') + ')', 'config');
  if (!VALID_EFFORT.has(effort)) throw new LunaModelError('invalid reasoning effort: ' + effort, 'config');
  if (!verbosity) throw new LunaModelError('verbosity missing (purpose=' + (req.purpose || '?') + ')', 'config');
  if (!VALID_VERBOSITY.has(verbosity)) throw new LunaModelError('invalid verbosity: ' + verbosity, 'config');

  // REASONING_MEDIUM_V1 (2026-09-27) + VERBOSITY_HIGH_V1 (2026-09-28): central clamp. Every live call is sent at
  // MEDIUM effort and HIGH verbosity. Any other valid value (including a hand-built request) is normalised, not failed, so no path
  // can reach HIGH/XHIGH/max or none/low, and no call is lost to a config error.
  if (!CUSTOMER_MIN_EFFORTS.has(effort)) {
    try { console.log('LUNA_EFFORT_CLAMPED ' + JSON.stringify({ purpose: req.purpose || null, requested: effort, sent: FIXED_EFFORT })); } catch (_) {}
  }
  return { effort: FIXED_EFFORT, verbosity: FIXED_VERBOSITY };
}

/* -------------------------------------------------------- request conversion */

function textPart(text) {
  return { type: 'input_text', text: String(text) };
}

/**
 * Luna builds multimodal user content in the Chat Completions shape
 * ({type:'text'} / {type:'image_url'}). Convert without dropping anything.
 */
function toInputContent(content) {
  if (content == null) return [];
  if (typeof content === 'string') return content ? [textPart(content)] : [];
  if (!Array.isArray(content)) return [textPart(String(content))];
  const out = [];
  for (const part of content) {
    if (!part) continue;
    if (typeof part === 'string') { if (part) out.push(textPart(part)); continue; }
    if (part.type === 'text' && part.text) { out.push(textPart(part.text)); continue; }
    if (part.type === 'input_text' && part.text) { out.push(part); continue; }
    if (part.type === 'input_image') { out.push(part); continue; }
    if (part.type === 'image_url') {
      const url = typeof part.image_url === 'string' ? part.image_url : (part.image_url && part.image_url.url);
      if (!url) continue;
      const img = { type: 'input_image', image_url: url };
      const detail = (part.image_url && part.image_url.detail) || part.detail;
      if (detail) img.detail = detail;
      out.push(img);
      continue;
    }
    // Unknown part: keep its text if it has any, never silently drop content.
    if (part.text) out.push(textPart(part.text));
  }
  return out;
}

/**
 * messages[] -> { instructions, input[] }
 *
 * System messages become top-level `instructions`. The Responses API does NOT carry
 * instructions across a chain, and Luna resends them on every call including continuations
 * and regenerations, so the trusted prompt is always in force.
 *
 * Customer text, retrieved FAQ text, tool output and image content only ever land in `input`
 * as user/tool items — never as instructions.
 */
function toResponsesRequest(req) {
  const { effort, verbosity } = resolveSettings(req);
  const instructionsParts = [];
  const input = [];

  if (Array.isArray(req.input)) {
    // Caller already speaks native Responses items (the tool loop does).
    for (const item of req.input) if (item) input.push(item);
    if (req.instructions) instructionsParts.push(String(req.instructions));
  } else {
    for (const m of req.messages || []) {
      if (!m) continue;
      const role = m.role;
      if (role === 'system' || role === 'developer') {
        const s = typeof m.content === 'string' ? m.content : toInputContent(m.content).map((p) => p.text || '').join('\n');
        if (s) instructionsParts.push(s);
        continue;
      }
      if (role === 'tool') {
        input.push({
          type: 'function_call_output',
          call_id: m.tool_call_id,
          output: typeof m.content === 'string' ? m.content : JSON.stringify(m.content == null ? {} : m.content),
        });
        continue;
      }
      if (role === 'assistant') {
        for (const tc of m.tool_calls || []) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.function && tc.function.name,
            arguments: (tc.function && tc.function.arguments) || '{}',
          });
        }
        if (m.content) {
          input.push({ role: 'assistant', content: [{ type: 'output_text', text: String(m.content) }] });
        }
        continue;
      }
      const content = toInputContent(m.content);
      if (content.length) input.push({ role: role || 'user', content });
    }
  }

  const out = {
    model: req.model,
    input,
    reasoning: { effort },
    text: { verbosity },
    // Explicit: Luna keeps its own transcript and does not ask the provider to retain one.
    store: req.store === true,
  };
  if (instructionsParts.length) out.instructions = instructionsParts.join('\n\n');
  if (req.tools && req.tools.length) {
    out.tools = toResponsesTools(req.tools);
    out.tool_choice = req.tool_choice || 'auto';
  }
  if (req.max_output_tokens) out.max_output_tokens = req.max_output_tokens;
  if (req.metadata && req.store === true) out.metadata = req.metadata;
  return out;
}

/** Accept both Chat-Completions tool specs and native Responses specs. */
function toResponsesTools(tools) {
  return (tools || []).map((t) => {
    if (t && t.type === 'function' && t.function) {
      const f = t.function;
      const spec = { type: 'function', name: f.name, parameters: f.parameters };
      if (f.description) spec.description = f.description;
      // Strictness is set deliberately. Luna's handlers validate their own arguments and
      // several tool schemas carry optional fields, so strict mode is NOT turned on by
      // default — enabling it would silently change the existing optional-field contract.
      if (f.strict === true) spec.strict = true;
      return spec;
    }
    if (t && t.name && t.parameters) {
      const spec = { type: 'function', name: t.name, parameters: t.parameters };
      if (t.description) spec.description = t.description;
      if (t.strict === true) spec.strict = true;
      return spec;
    }
    return t;
  });
}

/* ----------------------------------------------------------- output parsing */

/**
 * Parse the ENTIRE typed output.
 *
 * Rules enforced here, so no caller has to remember them:
 *   - assistant text is only taken from `output_text` content of a `message` item
 *   - a refusal is never returned as public text
 *   - reasoning items are opaque protocol data: kept for replay, never read, never logged
 *   - unknown item types are recorded by type only and can never become text or an action
 *   - if the response is incomplete, `text` is empty — a truncated fragment is not an answer
 */
function parseOutput(r) {
  const items = Array.isArray(r && r.output) ? r.output : [];
  let text = '';
  const toolCalls = [];
  const unknownTypes = [];
  let refusal = null;

  for (const item of items) {
    if (!item || !item.type) continue;
    switch (item.type) {
      case 'message':
        for (const c of item.content || []) {
          if (!c) continue;
          if (c.type === 'output_text' && c.text) text += c.text;
          else if (c.type === 'refusal' && c.refusal) refusal = String(c.refusal);
        }
        break;
      case 'function_call':
        toolCalls.push({
          callId: item.call_id,
          name: item.name,
          argumentsRaw: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments || {}),
        });
        break;
      case 'reasoning':
        // Opaque protocol data. Carried in outputItems for replay; never decoded, printed,
        // logged, or sent to Intercom.
        break;
      default:
        unknownTypes.push(item.type);
    }
  }

  const status = String((r && r.status) || 'completed');
  const incomplete = status === 'incomplete';
  const incompleteReason = incomplete ? ((r.incomplete_details && r.incomplete_details.reason) || 'unknown') : null;

  return {
    status,
    incomplete,
    incompleteReason,
    refusal,
    unknownTypes,
    toolCalls,
    // A partial body from a truncated response is not a usable final answer.
    text: incomplete ? '' : text.trim(),
    partialText: text.trim(),
    outputItems: items,
    responseId: (r && r.id) || null,
    usage: normalizeUsage(r && r.usage),
  };
}

/**
 * Usage, without double counting.
 *   reasoning_tokens are already inside output_tokens
 *   cached_tokens are already inside input_tokens
 * Fields the provider did not return stay null (unavailable), never a fabricated 0.
 */
function normalizeUsage(u) {
  if (!u) return { available: false };
  const inD = u.input_tokens_details || {};
  const outD = u.output_tokens_details || {};
  const num = (v) => (typeof v === 'number' ? v : null);
  return {
    available: true,
    inputTokens: num(u.input_tokens),
    cachedInputTokens: num(inD.cached_tokens),
    outputTokens: num(u.output_tokens),
    reasoningTokens: num(outD.reasoning_tokens),
    totalTokens: num(u.total_tokens),
  };
}

/* --------------------------------------------------------------- telemetry */

function telemetry(fields) {
  try {
    console.log('LUNA_MODEL_CALL ' + JSON.stringify(fields));
  } catch (_) {
    /* telemetry must never break customer processing */
  }
}

/* ------------------------------------------------------------------- calls */

/**
 * Native call. Returns the parsed typed result.
 * `req.episode` (optional) supplies budget accounting and the correlation id.
 */
async function createRaw(openai, req) {
  const episode = req.episode || null;
  if (episode && typeof episode.chargeModelCall === 'function') episode.chargeModelCall(req.purpose || 'model');

  const mode = apiMode();
  const t0 = Date.now();
  const built = mode === 'responses' ? toResponsesRequest(req) : toChatRequest(req);

  const base = {
    api: mode,
    purpose: req.purpose || 'unknown',
    cid: req.conversationId || null,
    episode: episode ? episode.id : null,
    model: built.model,
    // Read back off the REQUEST WE ARE ABOUT TO SEND, not off a default or an env var.
    effort: mode === 'responses' ? built.reasoning.effort : built.reasoning_effort,
    verbosity: mode === 'responses' ? built.text.verbosity : built.verbosity,
    effortRule: req.effortRule || null,
    route: req.route || null,
    toolsOffered: (built.tools || []).length,
    toolChoice: built.tool_choice || null,
    store: mode === 'responses' ? built.store : null,
  };

  let raw;
  // OPENAI_RATE_GATE_V1 (2026-09-29): for the real production SDK client the request is sent through
  // openaiRateGate (org-TPM pacing, shared 429 cooldown, bounded jittered 429 retry that REPLACES the
  // SDK's own retry). The request body is untouched. Fake clients, test-guarded clients and
  // LUNA_RL_GATE=off take the original direct call below, byte-for-byte as before.
  const rl = {};
  try {
    if (rateGate.applies(openai)) {
      const target = mode === 'responses' ? openai.responses : openai.chat.completions;
      raw = await rateGate.run(openai, built, async (opts) => {
        const p = target.create(built, opts);
        if (p && typeof p.withResponse === 'function') {
          const wr = await p.withResponse();
          const data = wr.data;
          if (data && typeof data === 'object' && !data._request_id && wr.request_id) {
            try { Object.defineProperty(data, '_request_id', { value: wr.request_id, enumerable: false, configurable: true }); } catch (_) {}
          }
          return { data, headers: wr.response && wr.response.headers };
        }
        return { data: await p, headers: null };
      }, { purpose: base.purpose, cid: base.cid }, rl);
    } else {
      raw = mode === 'responses'
        ? await openai.responses.create(built)
        : await openai.chat.completions.create(built);
    }
  } catch (e) {
    const err = classifyError(e);
    telemetry({ ...base, ms: Date.now() - t0, ok: false, errorKind: err.kind, status: err.status || null, providerRequestId: err.providerRequestId || null, rl: rlTelemetry(rl) });
    throw err;
  }

  const parsed = mode === 'responses' ? parseOutput(raw) : parseChatOutput(raw);
  if (episode && typeof episode.recordUsage === 'function') episode.recordUsage(parsed.usage);

  telemetry({
    ...base,
    ms: Date.now() - t0,
    ok: true,
    respStatus: parsed.status,
    incompleteReason: parsed.incompleteReason,
    toolsCalled: parsed.toolCalls.map((c) => c.name),
    refused: !!parsed.refusal,
    unknownItemTypes: parsed.unknownTypes.length ? parsed.unknownTypes : undefined,
    textChars: parsed.text.length,
    usage: parsed.usage,
    providerRequestId: (raw && raw._request_id) || null,
    rl: rlTelemetry(rl),
  });

  return parsed;
}

/** OPENAI_RATE_GATE_V1: telemetry only when the gate actually waited or retried (lines stay identical otherwise). */
function rlTelemetry(rl) {
  if (!rl || !rl.attempts) return undefined;
  if (rl.attempts <= 1 && !(rl.paceWaitMs > 0) && !rl.exhausted) return undefined;
  return { attempts: rl.attempts, paceWaitMs: Math.round(rl.paceWaitMs || 0), retryWaitMs: Math.round(rl.retryWaitMs || 0), exhausted: rl.exhausted || undefined };
}

/**
 * Compatibility call. Returns a Chat-Completions-shaped object for the existing call sites:
 *   ai.choices[0].message.content   ai.choices[0].message.tool_calls   ai.usage
 * The synthetic shape is built here and only here.
 */
async function create(openai, req) {
  const parsed = await createRaw(openai, req);
  return {
    choices: [{
      index: 0,
      finish_reason: parsed.toolCalls.length ? 'tool_calls' : (parsed.incomplete ? 'length' : 'stop'),
      message: {
        role: 'assistant',
        content: parsed.text || null,
        tool_calls: parsed.toolCalls.length
          ? parsed.toolCalls.map((c) => ({ id: c.callId, type: 'function', function: { name: c.name, arguments: c.argumentsRaw } }))
          : undefined,
        refusal: parsed.refusal || undefined,
      },
    }],
    usage: parsed.usage,
    _luna: parsed,
  };
}

/* ------------------------------------------- legacy transport (rollback only) */

/**
 * Only reachable with LUNA_API_MODE=chat. Kept so a release-level rollback restores working
 * behaviour, including the old constraint that tool calls must carry reasoning_effort 'none'.
 */
function toChatRequest(req) {
  const effort = String((req.reasoning && req.reasoning.effort) || req.effort || req.reasoning_effort || 'none').toLowerCase();
  const verbosity = String((req.text && req.text.verbosity) || req.verbosity || 'low').toLowerCase();
  const out = {
    model: req.model,
    messages: req.messages || [],
    reasoning_effort: (req.tools && req.tools.length) ? 'none' : effort,
    verbosity,
  };
  if (req.tools && req.tools.length) {
    out.tools = (req.tools || []).map((t) => (t && t.function ? t : { type: 'function', function: t }));
    out.tool_choice = req.tool_choice || 'auto';
  }
  if (req.max_output_tokens) out.max_completion_tokens = req.max_output_tokens;
  return out;
}

function parseChatOutput(r) {
  const msg = (r && r.choices && r.choices[0] && r.choices[0].message) || {};
  const finish = (r && r.choices && r.choices[0] && r.choices[0].finish_reason) || 'stop';
  const incomplete = finish === 'length';
  const text = String(msg.content || '').trim();
  return {
    status: incomplete ? 'incomplete' : 'completed',
    incomplete,
    incompleteReason: incomplete ? 'max_output_tokens' : null,
    refusal: msg.refusal || null,
    unknownTypes: [],
    toolCalls: (msg.tool_calls || []).map((tc) => ({
      callId: tc.id, name: tc.function && tc.function.name, argumentsRaw: (tc.function && tc.function.arguments) || '{}',
    })),
    text: incomplete ? '' : text,
    partialText: text,
    outputItems: [],
    responseId: (r && r.id) || null,
    usage: r && r.usage
      ? {
        available: true,
        inputTokens: r.usage.prompt_tokens != null ? r.usage.prompt_tokens : null,
        cachedInputTokens: (r.usage.prompt_tokens_details && r.usage.prompt_tokens_details.cached_tokens) != null
          ? r.usage.prompt_tokens_details.cached_tokens : null,
        outputTokens: r.usage.completion_tokens != null ? r.usage.completion_tokens : null,
        reasoningTokens: (r.usage.completion_tokens_details && r.usage.completion_tokens_details.reasoning_tokens) != null
          ? r.usage.completion_tokens_details.reasoning_tokens : null,
        totalTokens: r.usage.total_tokens != null ? r.usage.total_tokens : null,
      }
      : { available: false },
  };
}

module.exports = {
  apiMode,
  create,
  createRaw,
  toResponsesRequest,
  toResponsesTools,
  toInputContent,
  parseOutput,
  normalizeUsage,
  resolveSettings,
  classifyError,
  LunaModelError,
  VALID_EFFORT,
  VALID_VERBOSITY,
  CUSTOMER_MIN_EFFORTS,
};
