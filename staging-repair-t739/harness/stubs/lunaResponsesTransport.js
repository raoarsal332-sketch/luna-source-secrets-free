'use strict';
/**
 * [ME] fixed model stub. create() pops the next scripted output; it never reaches any network.
 * It exists to drive code paths whose input is model text; it proves enforcement of the hold on
 * that text, not model quality.
 */
const state = { queue: [], calls: [] };
function create(_client, params) {
  state.calls.push({ purpose: params && params.conversationId });
  const next = state.queue.length ? state.queue.shift() : '';
  return Promise.resolve({ choices: [{ message: { content: next } }] });
}
module.exports = require('./_generic').withFallback({ state, create }, 'lunaResponsesTransport');
