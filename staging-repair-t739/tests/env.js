'use strict';
/** Shared test environment: boots the candidate (default) or the baseline tree (TREE=baseline). */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const tc = require(path.join(root, 'harness', 'testcopy'));
const sc = require(path.join(root, 'harness', 'scenario'));
const { boot, FAKE } = require(path.join(root, 'harness', 'boot'));

const which = process.env.TREE === 'baseline' ? 'baseline' : 'candidate';
const t = which === 'baseline' ? tc.makeBaseline(root) : tc.make(path.join(root, 'candidate'));
const h = boot({ treeDir: t.dir });
const T = h.index.__t;
const fake = h.fake;
const lm = require(path.join(root, 'harness', 'stubs', 'lunaResponsesTransport'));
const fastAck = require(path.join(root, 'harness', 'stubs', 'webhookFastAck'));
const generic = require(path.join(root, 'harness', 'stubs', '_generic'));
const L = FAKE.login, P = FAKE.pass;

const VARIANTS = [
  ['labelled', `Login: ${L} Password: ${P}`],
  ['unlabelled slash', `${L} / ${P}`],
  ['html wrapped', `<b>Login:</b> ${L}<br><b>Password:</b> ${P}`],
  ['worded digits + weak label', `nine nine nine nine nine zero zero one pw: ${P}`],
  ['zero-width label', `Pa\u200Bssword: ${P} login ${L}`],
];

function reset() {
  fake.reset();
  h.logs.length = 0;
  lm.state.queue.length = 0;
  lm.state.calls.length = 0;
  fastAck.state.store = null;
  fastAck.state.prepared.length = 0;
  fastAck.state.finished.length = 0;
  for (const f of [h.files.opStore, T.AUTH_COMMAND_FILE]) { try { fs.unlinkSync(f); } catch (_) {} }
  h.setControl({ paused: false, aiOff: {} });
}
let n = 7000;
function newConv(text, extraParts) {
  const id = String(++n);
  const user = sc.userPart(text || 'What is the daily loss limit?');
  fake.setConversation(id, sc.conversation(id, [user].concat(extraParts || [])));
  return { id, user, full: fake.getConversation(id) };
}
function read(f) { try { return fs.readFileSync(f, 'utf8'); } catch (_) { return ''; } }

/** Everything an observer could read after a run: recorder traffic, op store, ledgers, logs. */
function surfaces() {
  return {
    requests: JSON.stringify(fake.requests),
    opStore: read(h.files.opStore),
    ledger: read(T.AUTH_COMMAND_FILE),
    state: fs.readdirSync(h.tmp).map((f) => read(path.join(h.tmp, f))).join('\n'),
    logs: h.logs.map((l) => l.line).join('\n'),
  };
}
function secretsAbsent(s, label) {
  for (const [name, text] of Object.entries(s)) {
    for (const secret of [P, L]) {
      if (String(text).includes(secret)) throw new Error('secret value present in ' + name + (label ? ' (' + label + ')' : ''));
    }
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(ms) { await sleep(ms || 150); }

module.exports = { root, which, t, h, T, fake, lm, fastAck, generic, sc, L, P, VARIANTS, reset, newConv, read, surfaces, secretsAbsent, sleep, settle, index: h.index, FAKE, tc };
