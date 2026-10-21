'use strict';

/**
 * Loads the patched flat runtime with an in-process recording transport and a
 * stub model. No socket is opened. This file is review harness only.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const net = require('net');
const dns = require('dns');
const http = require('http');
const https = require('https');

const TEMPLATE_PASSWORD = 'QBG5FetfozKz7^a?J!';
const ARSAL_ID = '10118526';

function installNetworkBlock() {
  const deny = () => {
    const err = new Error('NETWORK_BLOCKED');
    err.code = 'NETWORK_BLOCKED';
    throw err;
  };
  net.Socket.prototype.connect = function blockedConnect() {
    deny();
  };
  const lookup = (hostname, options, cb) => {
    const callback = typeof options === 'function' ? options : cb;
    const err = new Error('NETWORK_BLOCKED');
    err.code = 'NETWORK_BLOCKED';
    if (typeof callback === 'function') callback(err);
    else throw err;
  };
  dns.lookup = lookup;
  if (dns.promises) dns.promises.lookup = async () => deny();
  http.request = function blockedHttp() { deny(); };
  http.get = function blockedHttpGet() { deny(); };
  https.request = function blockedHttps() { deny(); };
  https.get = function blockedHttpsGet() { deny(); };
}

function createRuntime(flatDir) {
  const httpLog = [];
  const modelLog = [];
  const plan = {
    reply: 'ACTION: REPLY\nBODY: You can review that in the dashboard help centre.',
    toolFirst: false,
    tooled: false,
    fail429: 0,
    parrot: false,
  };
  const convs = new Map();

  function resetPlan(next) {
    plan.reply = (next && next.reply) || 'ACTION: REPLY\nBODY: You can review that in the dashboard help centre.';
    plan.toolFirst = !!(next && next.toolFirst);
    plan.tooled = false;
    plan.fail429 = (next && next.fail429) || 0;
    plan.parrot = !!(next && next.parrot);
  }

  function recordHttp(entry) {
    const copy = JSON.parse(JSON.stringify(entry));
    httpLog.push(copy);
    return copy;
  }

  async function handleAxios(config) {
    const cfg = config || {};
    const method = String(cfg.method || 'get').toLowerCase();
    const url = String(cfg.url || '');
    const data = cfg.data === undefined ? null : cfg.data;
    const headers = cfg.headers || {};
    recordHttp({ method, url, data, headers, kind: 'request' });
    if (method === 'post' && /\/conversations\/search$/.test(url)) {
      const body = data || {};
      const values = (((body.query || {}).value) || []);
      const team = values.find((v) => v && v.field === 'team_assignee_id');
      const admin = values.find((v) => v && v.field === 'admin_assignee_id');
      const openOnly = !team && !admin;
      let list = [];
      if (plan.search) {
        if (team && String(team.value) === String(plan.search.teamId)) list = plan.search.list || [];
        else if (admin && String(admin.value) === String(plan.search.adminId)) list = plan.search.list || [];
        else if (openOnly && plan.search.openOnly) list = plan.search.list || [];
      }
      return { status: 200, data: { conversations: list, pages: {} } };
    }
    if (method === 'get' && /\/admins\/[^/]+$/.test(url)) {
      return { status: 200, data: { id: '1', name: 'Synthetic Teammate' } };
    }
    if (method === 'get' && /\/admins$/.test(url)) {
      return { status: 200, data: { admins: [] } };
    }
    if (method === 'get' && /\/conversations\/[^/]+$/.test(url)) {
      const id = url.split('/conversations/')[1].split(/[?#]/)[0];
      const conv = convs.get(String(id));
      if (!conv) return { status: 404, data: { errors: [{ code: 'not_found' }] } };
      return { status: 200, data: conv };
    }
    if (method === 'post' && /\/reply$/.test(url)) {
      if (plan.fail429 > 0) {
        plan.fail429 -= 1;
        return { status: 429, data: { error: 'synthetic_rate_limit' } };
      }
      return { status: 200, data: { id: 'syn-reply', type: 'conversation' } };
    }
    return { status: 200, data: { id: 'syn-ok', type: 'conversation' } };
  }

  function axios(config) {
    return handleAxios(config || {});
  }
  axios.get = (url, config) => handleAxios(Object.assign({}, config || {}, { method: 'get', url }));
  axios.post = (url, data, config) => handleAxios(Object.assign({}, config || {}, { method: 'post', url, data }));
  axios.put = (url, data, config) => handleAxios(Object.assign({}, config || {}, { method: 'put', url, data }));
  axios.delete = (url, config) => handleAxios(Object.assign({}, config || {}, { method: 'delete', url }));
  axios.request = axios;
  axios.create = () => axios;
  axios.defaults = { headers: { common: {} } };

  class OpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async (req) => {
            const messages = (req && req.messages) || [];
            modelLog.push({
              model: req && req.model,
              messages: JSON.parse(JSON.stringify(messages)),
              tools: !!(req && req.tools),
            });
            if (plan.toolFirst && !plan.tooled && req && req.tools) {
              plan.tooled = true;
              return {
                choices: [{
                  message: {
                    content: null,
                    tool_calls: [{
                      id: 'tc-syn-1',
                      type: 'function',
                      function: { name: 'get_state', arguments: '{}' },
                    }],
                  },
                }],
              };
            }
            let content = plan.reply;
            if (plan.parrot) {
              const user = messages.filter((m) => m && m.role === 'user').map((m) => {
                if (typeof m.content === 'string') return m.content;
                if (Array.isArray(m.content)) return m.content.map((p) => (p && p.text) || '').join('\n');
                return '';
              }).join('\n');
              content = user;
            }
            return { choices: [{ message: { content: content || '', tool_calls: [] } }] };
          },
        },
      };
    }
  }

  const originalRequire = Module.prototype.require;
  Module.prototype.require = function patchedRequire(id) {
    if (id === 'axios') return axios;
    if (id === 'openai') return OpenAI;
    return originalRequire.apply(this, arguments);
  };

  installNetworkBlock();

  const seamPath = path.join(flatDir, 'index.seam.js');
  const src = fs.readFileSync(path.join(flatDir, 'index.js'), 'utf8');
  if (src.includes('module.exports.__review')) {
    throw new Error('product index.js already exports __review; refusing to hide a shim');
  }
  fs.writeFileSync(
    seamPath,
    src + '\nmodule.exports.__review = {\n' +
      '  pollDeferredRelatedReplies,\n' +
      '  pollAutoCloseSilentTickets,\n' +
      '  pollSilentTeamboxNotes,\n' +
      '  searchOpenConversationsAutoClose,\n' +
      '  searchOpenTeamConversations,\n' +
      '  searchOpenJerryConversations,\n' +
      '  icRequest,\n' +
      '  getConvState,\n' +
      '  saveTicketState,\n' +
      '  loadTicketState,\n' +
      '};\n'
  );
  const luna = require(seamPath);
  const guard = require(path.join(flatDir, 'credentialGuardR9.js'));
  const presend = require(path.join(flatDir, 'statePresend', 'statePresend.js'));

  return {
    luna,
    guard,
    presend,
    httpLog,
    modelLog,
    plan,
    convs,
    resetPlan,
    TEMPLATE_PASSWORD,
    ARSAL_ID,
    clearLogs() {
      httpLog.length = 0;
      modelLog.length = 0;
    },
  };
}

module.exports = { createRuntime, TEMPLATE_PASSWORD, ARSAL_ID };
