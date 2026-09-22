'use strict';

/**
 * llm.js - strict JSON-only model access, isolated behind one interface.
 *
 * Reuses the `openai` dependency Luna already has; the SDK is required lazily
 * so the whole package stays importable and testable offline. Tests inject a
 * stub - no test ever reaches the network.
 */

function createOpenAiLlm(cfg) {
  return {
    async json(system, user, schemaHint) {
      const key = process.env[cfg.apiKeyEnv];
      if (!key) throw new Error(`${cfg.apiKeyEnv} not set`);
      let OpenAI;
      try { OpenAI = require('openai'); } catch (_) { throw new Error('openai package not installed'); }
      const client = new OpenAI({ apiKey: key });
      const res = await client.chat.completions.create({
        model: cfg.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${system}\n\nReturn ONLY JSON matching:\n${schemaHint}` },
          { role: 'user', content: user },
        ],
      });
      const raw = (res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
      let data;
      try { data = JSON.parse(raw); } catch (_) { throw new Error(`model returned non-JSON: ${raw.slice(0, 200)}`); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('model returned JSON that is not an object');
      return data;
    },
  };
}

/** Deterministic, scripted model for tests and dry runs. */
function createStubLlm(responses) {
  const queue = (responses || []).slice();
  const calls = [];
  return {
    calls,
    async json(system, user) {
      calls.push({ system, user });
      if (!queue.length) throw new Error('StubLlm exhausted');
      return queue.shift();
    },
  };
}

module.exports = { createOpenAiLlm, createStubLlm };
