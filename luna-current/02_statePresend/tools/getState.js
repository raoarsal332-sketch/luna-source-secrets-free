'use strict';

/**
 * tools/getState.js - read-only Luna-facing view of the structured state.
 *
 * createGetState({ getMessages, getImages })
 *   getMessages: async (conversationId) => Intercom parts or normalised messages
 *   getImages:   (conversationId) => { received, loaded }  (e.g. from imageAskGuard.snapshot)
 */

const state = require('../conversationState');

function createGetState(opts) {
  opts = opts || {};
  const cache = new Map();

  async function get(conversationId, o) {
    o = o || {};
    if (typeof opts.getMessages !== 'function') return { ok: false, error: 'message source not wired' };
    let msgs;
    try { msgs = await opts.getMessages(conversationId); } catch (e) { return { ok: false, error: `message source failed: ${e.message}` }; }
    const images = typeof opts.getImages === 'function' ? safe(() => opts.getImages(conversationId)) : null;
    const full = state.buildState(msgs, { ...(opts.stateOptions || {}), images: images || undefined });
    cache.set(String(conversationId), full);
    return { ok: true, conversation_id: String(conversationId), ...(o.full ? { full } : {}), state: state.publicView(full) };
  }

  function last(conversationId) { return cache.get(String(conversationId)) || null; }

  return { get, last, spec };
}

function safe(fn) { try { return fn(); } catch (_) { return null; } }

const spec = {
  name: 'get_state',
  description: 'Structured state of the current conversation: known client details (account number, email), what was already asked and answered, open client questions, teammate confirmations, escalation and what the bot is waiting for. Use before asking the client for any detail.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
};

module.exports = { createGetState, spec };
