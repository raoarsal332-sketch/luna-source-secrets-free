'use strict';
/**
 * [ME] replacement for the `openai` package: a fixed model stub that pops scripted outputs from the
 * shared queue (stubs/lunaResponsesTransport.state.queue). It never opens a socket. It exists to
 * drive paths whose input is model text; it can prove hold enforcement, not model quality.
 */
const lm = require('./lunaResponsesTransport');
function next() { lm.state.calls.push({ via: 'openai-stub' }); return lm.state.queue.length ? lm.state.queue.shift() : ''; }
class OpenAI {
  constructor() {
    const reply = async () => ({ choices: [{ message: { content: next() } }], output_text: '' });
    this.chat = { completions: { create: reply } };
    this.responses = { create: async () => ({ output_text: next(), output: [] }) };
  }
}
module.exports = OpenAI;
module.exports.default = OpenAI;
module.exports.OpenAI = OpenAI;
