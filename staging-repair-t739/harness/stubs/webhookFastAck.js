'use strict';
/**
 * [ME] stand-in for webhookFastAck (not in the staging tree). Default: no fast-ack turn context,
 * exactly what direct handleWebhook / pollers see. A test can switch on a fake turn store so that
 * icRequest takes the prepareCustomerWrite branch, and every payload that reaches
 * prepareCustomerWrite is recorded: that is how the pre-persistence hold (layer B) is proven.
 */
const state = { store: null, prepared: [], finished: [] };
module.exports = require('./_generic').withFallback({
  state,
  currentStore: () => state.store,
  async prepareCustomerWrite(args) { state.prepared.push(JSON.parse(JSON.stringify({ method: args.method, url: args.url, data: args.data }))); return { token: 'fake-token' }; },
  async finishCustomerWrite(token, receipt) { state.finished.push({ token, ok: !!(receipt && receipt.ok) }); },
  markGateError() {}, noteSwallowedError() {}, init() {}, mountStatus() {}, registerInspector() {}, startWorker() {},
  acceptHttp() {}, stalenessMs: () => 600000,
}, 'webhookFastAck');
