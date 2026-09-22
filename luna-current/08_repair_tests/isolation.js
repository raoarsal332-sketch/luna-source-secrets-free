'use strict';
const fs = require('fs'), path = require('path'), Module = require('module');
const root = process.env.LUNA_TEST_MIRROR || path.join(__dirname, 'test_mirror');
const state = process.env.LUNA_TEST_STATE || path.join(__dirname, 'isolated_state');
fs.mkdirSync(state, { recursive: true });
for (const k of Object.keys(process.env)) if (/^(LUNA_|MAINTAINER_|INTERCOM_|OPENAI_|IMAGE_GUARD_|TICKET_STATE_|MENTION_ROTATE_)/.test(k)) delete process.env[k];
Object.assign(process.env, {
  LUNA_ROOT: root,
  MAINTAINER_ENABLED: 'false',
  MAINTAINER_DATA_DIR: path.join(state, 'maintainer'),
  LUNA_CONTROL_STATE_FILE: path.join(state, 'control.json'),
  LUNA_OP_STORE_FILE: path.join(state, 'luna-write-ops.json'),
  LUNA_PROMPT_FILE: path.join(root, 'system-prompt.txt'),
  IMAGE_GUARD_STATE_FILE: path.join(state, 'image.json'),
  TICKET_STATE_FILE: path.join(state, 'tickets.json'),
  MENTION_ROTATE_FILE: path.join(state, 'mentions.json'),
  FUNDEDELITE_FAQ_PATH: path.join(root, 'fundedelite-faqs.md'),
  OPENAI_API_KEY: 'audit-dummy',
  INTERCOM_ACCESS_TOKEN: 'audit-dummy',
  CONTROL_SECRET: 'audit-dummy',
  LUNA_PRESEND_MODE: 'observe',
});
const writes = [];
function setControl(p = {}) {
  fs.writeFileSync(process.env.LUNA_CONTROL_STATE_FILE, JSON.stringify({
    paused: false,
    testMode: true,
    testAllowConversationIds: ['audit'],
    aiOff: {},
    config: { welcomeEnabled: false },
    ...p,
  }));
}
setControl();
const blocked = () => { throw Error('AUDIT_EXTERNAL_IO_BLOCKED'); };
global.fetch = blocked;
for (const name of ['http', 'https']) { const m = require(name); m.request = blocked; m.get = blocked; m.createServer = blocked; }
const net = require('net'); net.connect = blocked; net.createConnection = blocked; net.Socket.prototype.connect = blocked;
const dns = require('dns'); dns.lookup = blocked; dns.resolve = blocked;
const child = require('child_process');
for (const k of ['exec', 'execSync', 'spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']) child[k] = blocked;
let axiosImpl = blocked, modelImpl = blocked;
function axios(...args) { return axiosImpl(...args); }
axios.get = (url, opts) => axiosImpl({ method: 'get', url, ...opts });
axios.post = (url, data, opts) => axiosImpl({ method: 'post', url, data, ...opts });
axios.request = axios; axios.create = () => axios;
class OpenAI { constructor() { this.chat = { completions: { create: (...a) => modelImpl(...a) } }; } }
function express() { return { routes: [], use() {}, get(...a) { this.routes.push(['get', ...a]); }, post(...a) { this.routes.push(['post', ...a]); }, listen: blocked }; }
express.json = () => () => {};
const load = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'axios') return axios; if (name === 'openai') return OpenAI; if (name === 'express') return express; if (name === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (name.startsWith('/home/ubuntu/')) name = path.join(root, name.slice('/home/ubuntu/'.length));
  return load.call(this, name, parent, isMain);
};
function mapRead(p) { return typeof p === 'string' && p.startsWith('/home/ubuntu/') ? path.join(root, p.slice('/home/ubuntu/'.length)) : p; }
for (const k of ['readFileSync', 'existsSync', 'statSync', 'readdirSync']) { const old = fs[k]; fs[k] = function (p, ...a) { return old.call(this, mapRead(p), ...a); }; }
for (const k of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'unlinkSync', 'rmSync', 'renameSync']) {
  const old = fs[k]; fs[k] = function (p, ...a) {
    const ps = k === 'renameSync' ? [p, a[0]] : [p];
    for (const x of ps) if (typeof x === 'string' && path.resolve(x) !== state && !path.resolve(x).startsWith(state + path.sep)) throw Error('AUDIT_WRITE_OUTSIDE_ISOLATION');
    writes.push({ operation: k, path: String(p) }); return old.call(this, p, ...a);
  };
}
module.exports = { root, state, setControl, writes, setAxios: (f) => axiosImpl = f, setModel: (f) => modelImpl = f, blocked };
