'use strict';
/**
 * Isolation proof. Run as:  unshare -rn node tests/t5_isolation.js
 * Part A needs the OS-level block (no non-loopback interface); parts B-D prove the in-process
 * layers, the recorder position below axios, and that init writes only into a temp directory.
 */
const assert = require('assert');
const os = require('os');
const fs = require('fs');
const net = require('net');
const dns = require('dns');
const { test, run } = require('./runner');

const RawSocketConnect = net.Socket.prototype.connect;
const rawLookup = dns.lookup.bind(dns);
const before = (p) => fs.existsSync(p);
const PROD_PATHS = ['/home/ubuntu/bot-control.json', '/home/ubuntu/luna-write-ops.json', '/home/ubuntu/system-prompt.txt', '/home/ubuntu/ecosystem.config.js', '/home/ubuntu/auth-deferred.json'];
const existedBefore = PROD_PATHS.map(before);

test('A1 OS level: only loopback interfaces exist (unshare -rn)', () => {
  const nics = Object.entries(os.networkInterfaces()).filter(([, a]) => a.some((x) => !x.internal));
  assert.deepStrictEqual(nics.map(([n]) => n), [], 'non-loopback interface present: not network-isolated');
});
test('A2 OS level: DNS resolution of api.intercom.io fails', async () => {
  const err = await new Promise((resolve) => rawLookup('api.intercom.io', (e) => resolve(e)));
  assert.ok(err, 'lookup unexpectedly succeeded');
  process.stdout.write('       dns error code: ' + err.code + '\n');
});
test('A3 OS level: raw TCP connect to a public IP fails', async () => {
  const err = await new Promise((resolve) => {
    const s = new net.Socket();
    RawSocketConnect.call(s, { host: '93.184.216.34', port: 443 });
    s.setTimeout(2000);
    s.on('connect', () => { s.destroy(); resolve(null); });
    s.on('timeout', () => { s.destroy(); resolve(new Error('timeout')); });
    s.on('error', (e) => resolve(e));
  });
  assert.ok(err, 'connect unexpectedly succeeded');
  process.stdout.write('       tcp error code: ' + (err.code || err.message) + '\n');
});

const E = require('./env');
const { h, fake, index, sc, reset, newConv } = E;

test('B1 in-process block: fetch, https.request, net.connect, dns.lookup and child_process are refused and recorded', async () => {
  const https = require('https');
  const child = require('child_process');
  await assert.rejects(() => fetch('https://api.intercom.io/me'), /NETWORK_BLOCKED/);
  assert.throws(() => https.request({ host: 'api.intercom.io' }), /NETWORK_BLOCKED/);
  assert.throws(() => net.connect({ host: '1.1.1.1', port: 80 }), /NETWORK_BLOCKED/);
  assert.throws(() => child.spawn('curl', ['https://api.intercom.io']), /NETWORK_BLOCKED/);
  const e = await new Promise((r) => dns.lookup('api.intercom.io', (x) => r(x)));
  assert.ok(e && e.code === 'NETWORK_BLOCKED');
  const kinds = h.net.attempts.map((a) => a.kind);
  for (const k of ['fetch', 'https.request', 'net.connect', 'child_process.spawn', 'dns.lookup']) assert.ok(kinds.includes(k), k + ' not recorded: ' + kinds.join(','));
  h.net.attempts.length = 0;
});
test('B2 recorder sits BELOW axios: the real icRequest/axios stack runs, headers are built by the real code, the adapter records the request', async () => {
  reset();
  const { id } = newConv();
  const r = await index.postReply(id, 'comment', 'The daily loss limit is 5%.');
  assert.ok(r.ok);
  assert.ok(fake.requests.length >= 2, 'expected GET (ownership re-fetch) and POST');
  assert.ok(fake.requests.every((q) => q.auth === 'fake-token'), JSON.stringify(fake.requests.map((q) => q.auth)));
  assert.ok(fake.requests.every((q) => q.url.startsWith('https://api.intercom.io/')));
  assert.strictEqual(h.net.attempts.length, 0);
});
test('B3 a direct axios call to an external host goes to the recorder, not the network', async () => {
  const axios = require(require('path').join(E.root, 'node_modules', 'axios'));
  fake.reset();
  const r = await axios.get('https://example.org/anything', { validateStatus: () => true });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(fake.requests.length, 1);
  assert.strictEqual(h.net.attempts.length, 0);
});
test('B4 credentials in this process are synthetic', () => {
  assert.strictEqual(process.env.INTERCOM_ACCESS_TOKEN, 'fake-intercom-token-not-real');
  assert.strictEqual(process.env.OPENAI_API_KEY, 'fake-openai-key-not-real');
  assert.strictEqual(E.FAKE.login, '99999001');
  assert.strictEqual(E.FAKE.pass, 'Fake#Pass1');
});
test('C1 init side effects: all state files are inside the temp dir; no production default path was created', () => {
  PROD_PATHS.forEach((p, i) => { if (!existedBefore[i]) assert.ok(!fs.existsSync(p), 'created ' + p); });
  assert.ok(process.cwd().startsWith(os.tmpdir()), process.cwd());
  for (const k of ['LUNA_OP_STORE_FILE', 'LUNA_CONTROL_STATE_FILE', 'TICKET_STATE_FILE', 'MENTION_ROTATE_FILE', 'LUNA_PROMPT_FILE', 'LUNA_FAQ_ASSIST_STATE_FILE']) {
    assert.ok(process.env[k].startsWith(os.tmpdir()), k + '=' + process.env[k]);
  }
  process.stdout.write('       temp files: ' + fs.readdirSync(h.tmp).join(', ') + '\n');
});
test('C2 the app exports an express app but nothing is listening (no server handle in this process)', () => {
  assert.strictEqual(typeof index.app.listen, 'function');
  const servers = process._getActiveHandles().filter((x) => x instanceof net.Server);
  assert.strictEqual(servers.length, 0);
});
test('C3 module flags for Packs/Atom are OFF in the default config', () => {
  for (const k of ['LUNA_PACKS_ENABLED', 'LUNA_ATOM_ENABLED', 'LUNA_FAQ_APPROVED_ANSWERS_EXTRA']) assert.strictEqual(process.env[k], undefined, k);
});
run('isolation');
