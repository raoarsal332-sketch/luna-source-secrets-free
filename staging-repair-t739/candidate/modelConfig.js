'use strict';
/**
 * modelConfig.js — the one place that decides the generation parameters for gpt-5.6-luna.
 *
 * ===========================================================================
 * 2026-09-22 — migrated from /v1/chat/completions to /v1/responses.
 * ===========================================================================
 *
 * WHAT CHANGED AND WHY
 *
 * The old configuration in this file sent `reasoning_effort: 'none'` and `verbosity: 'low'`,
 * and it was not a preference — it was forced. On /v1/chat/completions gpt-5.6-luna rejects
 * function tools together with any reasoning:
 *
 *   "Function tools with reasoning_effort are not supported for gpt-5.6-luna in
 *    /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort
 *    to 'none'."
 *
 * So Luna's entire six-tool loop ran with reasoning switched off. /v1/responses has no such
 * restriction. Probed against the real endpoint on 2026-09-22 (14 calls, raw results in
 * docs/responses-migration/probe-responses.json): tools + reasoning medium PASS, tools +
 * reasoning high PASS, dependent multi-round tool continuation PASS, medium→high continuation
 * PASS, text+image PASS, store:false PASS, invalid effort correctly rejected with a 400.
 *
 * [2026-09-22] MEDIUM was the floor and verbosity MEDIUM; effort was raised to HIGH by a named rule.
 * [2026-09-26] Superseded: HIGH floor, XHIGH by a named X1-X6 rule, verbosity HIGH (see constants below).
 *
 * ---------------------------------------------------------------------------
 * HONEST RECORD OF THE PRIOR MEASUREMENT THAT DISAGREES WITH THIS SETTING
 * ---------------------------------------------------------------------------
 * The previous version of this file documented a real, measured finding from 2026-09-21, and
 * it is NOT being deleted just because the target changed. Measured end-to-end through the
 * real handler, 31-case held-out suite, verbosity 'low', on CHAT COMPLETIONS:
 *
 *     effort   run 1    run 2    behaviour
 *     none     30/31    30/31    stable; same single failure both times
 *     low      27/31    28/31    unstable; unnecessary variant clarifications
 *     medium   31/31    27/31    unstable; unnecessary variant clarifications
 *
 * Raising effort on the ANSWER path made Luna notice product-variant ambiguity and ask "which
 * version do you mean?" instead of answering — which the approved rules forbid when the answer
 * is the same for both variants. That risk is real and it is a REPLY/CLARIFY behaviour risk,
 * not a factual one.
 *
 * Two things differ now and both are measured, not assumed — see
 * docs/responses-migration/RESULTS.md for the re-run on this runtime:
 *   1. the prompt now carries the variant rule that those failures were tripping over, and
 *   2. tools finally run WITH reasoning, so the model reaches the approved article instead of
 *      reasoning in the dark about which variant applies.
 *
 * If the variant-clarification regression returns, the correct response is to fix the
 * clarification rule, not to quietly drop back below the floor.
 */

const effortPolicy = require('./effortPolicy');
const transport = require('./lunaResponsesTransport');

const VALID_EFFORT = transport.VALID_EFFORT;
const VALID_VERBOSITY = transport.VALID_VERBOSITY;

// 2026-09-27 (owner request, REASONING_MEDIUM_V1): EVERY live model call reasons at MEDIUM and verbosity is
// MEDIUM globally. No automatic HIGH/XHIGH: effortPolicy.select still runs, but only as a logged SHADOW signal
// and can no longer change effort. Explicit, housekeeping and env values are all clamped to MEDIUM below.
// (Superseded 2026-09-26 policy: HIGH floor, adaptive XHIGH, verbosity HIGH.)
const FIXED_EFFORT = 'medium';
const FLOOR_EFFORT = FIXED_EFFORT;
const CEILING_EFFORT = FIXED_EFFORT;
// VERBOSITY_HIGH_V1 (2026-09-28, owner): verbosity HIGH on every live call; reasoning stays MEDIUM.
const DEFAULT_VERBOSITY = 'high';

/** Env can RAISE effort for an experiment. It can never take it below the floor. */
function envEffort() {
  const v = String(process.env.LUNA_REASONING_EFFORT || '').toLowerCase().trim();
  return v || null;
}

function envVerbosity() {
  const v = String(process.env.LUNA_VERBOSITY || '').toLowerCase().trim();
  return v || null;
}

/**
 * Called once at boot. A bad environment must fail loudly at deploy time, not silently
 * produce a downgraded customer runtime three hours later.
 * @returns {{ok:boolean, problems:string[], effective:object}}
 */
function assertValidStartupConfig(opts) {
  const strict = !(opts && opts.strict === false);
  const problems = [];
  const mode = transport.apiMode();
  const e = envEffort();
  const v = envVerbosity();

  if (e && !VALID_EFFORT.has(e)) problems.push('LUNA_REASONING_EFFORT="' + e + '" is not a valid effort');
  if (v && !VALID_VERBOSITY.has(v)) problems.push('LUNA_VERBOSITY="' + v + '" is not a valid verbosity');

  // REASONING_MEDIUM_V1: a valid but non-MEDIUM env value cannot take effect (answerParams and the transport
  // clamp every call to MEDIUM). Warn instead of refusing to boot, so a stray env var can never cause an outage.
  if (e && VALID_EFFORT.has(e) && e !== FIXED_EFFORT) {
    console.error('LUNA_MODEL_CONFIG_WARN: LUNA_REASONING_EFFORT="' + e + '" is ignored; every live call is clamped to medium');
  }
  if (v && VALID_VERBOSITY.has(v) && v !== DEFAULT_VERBOSITY) {
    console.error('LUNA_MODEL_CONFIG_WARN: LUNA_VERBOSITY="' + v + '" is ignored; verbosity is clamped to ' + DEFAULT_VERBOSITY);
  }

  const effective = describe();
  if (problems.length) {
    const msg = 'LUNA_MODEL_CONFIG_INVALID: ' + problems.join('; ');
    if (strict && mode === 'responses') throw new Error(msg);
    console.error(msg);
  } else {
    console.log('LUNA_MODEL_CONFIG_OK ' + JSON.stringify(effective));
  }
  return { ok: problems.length === 0, problems, effective };
}

/**
 * The generation settings for one outgoing call.
 *
 * @param {object} opts
 * @param {boolean} [opts.tools]        whether this call offers tools (no longer changes effort)
 * @param {string}  [opts.purpose]      telemetry label, e.g. 'full.tool-round'
 * @param {object}  [opts.signals]      router features for the effort policy
 * @param {object}  [opts.state]        conversation state for the effort policy
 * @param {object}  [opts.presend]      presend result, when regenerating
 * @param {object}  [opts.episode]      active episode (carries retained HIGH)
 * @param {string}  [opts.phase]        'initial' | 'post-tools' | 'regeneration'
 * @param {string}  [opts.effort]       explicit override (still floor-checked)
 * @param {boolean} [opts.housekeeping] proven unable to affect customer handling
 * @returns {{reasoning_effort:string, verbosity:string, effortRule:string, purpose:string}}
 */
function answerParams(opts) {
  opts = opts || {};

  let effort;
  let rule;

  if (opts.effort) {
    effort = String(opts.effort).toLowerCase();
    rule = 'explicit';
  } else if (opts.housekeeping) {
    effort = FIXED_EFFORT;
    rule = 'housekeeping-medium';
  } else {
    const decision = effortPolicy.select({
      state: opts.state,
      features: opts.signals,
      presend: opts.presend,
      episode: opts.episode,
      phase: opts.phase,
    }) || { effort: 'medium', rule: 'no-decision' };
    // REASONING_MEDIUM_V1: the policy decision is SHADOW-ONLY (logged, never applied).
    effort = FIXED_EFFORT;
    rule = 'medium-fixed(shadow:' + decision.effort + ':' + decision.rule + ')';
    if (decision.effort === 'xhigh' || (decision.ignored && decision.ignored.length)) {
      try {
        console.log('LUNA_EFFORT ' + JSON.stringify({
          cid: opts.conversationId || null,
          purpose: opts.purpose || null,
          effort, shadowEffort: decision.effort, rule: decision.rule,
          escalatedFrom: decision.escalatedFrom || undefined,
          signals: decision.signals,
          ignored: decision.ignored,
        }));
      } catch (_) {}
    }
  }

  // REASONING_MEDIUM_V1 central clamp: explicit overrides and LUNA_REASONING_EFFORT can neither raise nor
  // lower effort. Every call resolves to MEDIUM (the transport enforces the same thing again).
  if (effort !== FIXED_EFFORT) {
    effort = FIXED_EFFORT;
    rule = rule + '+clamped-medium';
  }

  const verbosity = pickVerbosity();

  return { reasoning_effort: effort, verbosity, effortRule: rule, purpose: opts.purpose || 'model' };
}

const EFFORT_RANK = { none: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6 };
function rankEffort(e) { const r = EFFORT_RANK[String(e || '').toLowerCase()]; return r == null ? -1 : r; }

function pickVerbosity() {
  // VERBOSITY_HIGH_V1: HIGH verbosity globally; LUNA_VERBOSITY cannot override it.
  return DEFAULT_VERBOSITY;
}

function describe() {
  return {
    apiMode: transport.apiMode(),
    floorEffort: FLOOR_EFFORT,
    verbosity: pickVerbosity(),
    ceilingEffort: CEILING_EFFORT,
    fixedEffort: FIXED_EFFORT,
    adaptiveXhigh: false,
    xhighSelector: 'disabled: effortPolicy.select X1-X6 runs as a logged shadow signal only',
    maxEffort: 'never used',
    toolCallEffort: 'same as answer path — /v1/responses has no tools-vs-reasoning restriction',
    store: 'false (Luna keeps its own transcript; no provider-side retention)',
    continuation: 'explicit replay of typed output items within one episode',
    textFormat: 'text (no response_format is set anywhere; replies are plain text)',
  };
}

module.exports = {
  answerParams,
  describe,
  assertValidStartupConfig,
  rankEffort,
  VALID_EFFORT,
  VALID_VERBOSITY,
  FLOOR_EFFORT,
  CEILING_EFFORT,
  DEFAULT_VERBOSITY,
  // Back-compat aliases so any older reference keeps resolving.
  DEFAULT_EFFORT: FLOOR_EFFORT,
  TOOL_EFFORT: FLOOR_EFFORT,
};
