'use strict';
/**
 * Boots a staging tree (candidate or baseline) inside this process with:
 *   - synthetic fake credentials and state files in a fresh temp dir,
 *   - egress blocked (in-process; run under `unshare -rn` for the OS-level block),
 *   - the axios adapter replaced by the recording fake Intercom,
 *   - the real index.js icRequest/icRequestUnguarded/axios stack above it.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const FAKE = Object.freeze({ login: '99999001', pass: 'Fake#Pass1' });

function boot(opts) {
  opts = opts || {};
  const root = path.resolve(__dirname, '..');
  const tree = path.resolve(opts.treeDir || path.join(root, 'candidate'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't739-state-'));
  const f = (n) => path.join(tmp, n);
  Object.assign(process.env, {
    INTERCOM_ACCESS_TOKEN: 'fake-intercom-token-not-real',
    OPENAI_API_KEY: 'fake-openai-key-not-real',
    PORT: '0',
    LUNA_SELFTEST_NO_NET: '1',
    LUNA_OP_STORE_FILE: f('write-ops.json'),
    LUNA_CONTROL_STATE_FILE: f('control.json'),
    TICKET_STATE_FILE: f('tickets.json'),
    MENTION_ROTATE_FILE: f('mention.json'),
    LUNA_AUTH_REPLAY_GAP_MS: '0',
    LUNA_FAQ_ASSIST_STATE_FILE: f('faq-assist.json'),
    MAINTAINER_ENABLED: 'false',
    LUNA_PROMPT_FILE: f('system-prompt.txt'),
    LUNA_TEAMMATE_ADMINS_FILE: f('bot-teammate-admins.json'),
    NODE_ENV: 'test',
  });
  fs.writeFileSync(f('system-prompt.txt'), 'synthetic prompt for tests\n');
  // Synthetic principals only. The live seed is real Intercom admin ids and must
  // not be the test authority. The candidate module treats this file as the set.
  const adminsFile = f('bot-teammate-admins.json');
  fs.writeFileSync(adminsFile, JSON.stringify(String(process.env.FAKE_AUTHORIZED_ADMINS || '777001,777002').split(',')));
  const controlFile = f('control.json');
  const setControl = (patch) => {
    let cur = { paused: false, testMode: false, aiOff: {}, testAllowNames: [], testAllowConversationIds: [], config: {} };
    try { cur = JSON.parse(fs.readFileSync(controlFile, 'utf8')); } catch (_) {}
    fs.writeFileSync(controlFile, JSON.stringify({ ...cur, ...patch }));
  };
  setControl({});
  for (const k of ['LUNA_PACKS_ENABLED', 'LUNA_ATOM_ENABLED', 'LUNA_FAQ_APPROVED_ANSWERS_EXTRA']) delete process.env[k];
  process.env.NODE_PATH = path.join(root, 'node_modules');
  process.env.LUNA_T742_ROOT = path.join(root, '..', 'staging-repair-t742');
  require('module').Module._initPaths();
  process.chdir(tmp);

  const net = require('./netblock');
  net.install();
  const loader = require('./loader');
  loader.install({ treeDir: tree, noHi: opts.noHi || ['writeOpStore'] });
  const axios = require(path.join(root, 'node_modules', 'axios'));
  const fake = require('./fakeIntercom');
  fake.install(axios);
  const logs = [];
  const say = (...a) => process.stdout.write(a.join(' ') + '\n');
  if (opts.captureLogs !== false) {
    for (const k of ['log', 'error', 'warn']) {
      const orig = console[k];
      console[k] = (...a) => {
        logs.push({ k, line: a.map((x) => (typeof x === 'string' ? x : safe(x))).join(' ') });
        if (opts.echo) orig.apply(console, a);
      };
    }
  }
  const index = require(path.join(tree, 'index.js'));
  return { setControl, say, index, fake, net, loader, tmp, logs, env: process.env, FAKE, tree, files: { opStore: f('write-ops.json'), faq: f('faq-assist.json') } };
}
function safe(x) {
  try { return JSON.stringify(x); } catch (_) { return String(x); }
}

module.exports = { boot, FAKE };
