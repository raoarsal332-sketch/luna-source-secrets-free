'use strict';

// Isolated transport. No socket to Intercom, OpenAI, or the Help Centre.
const Module = require('module');
const orig = Module.prototype.require;

const recorded = [];
global.__R8_HTTP = recorded;
function remember(entry) {
  recorded.push(entry);
  if (global.__R8_ON_HTTP) global.__R8_ON_HTTP(entry);
}

function axios(cfg) {
  const info = {
    via: 'axios',
    method: (cfg && cfg.method) || 'get',
    url: cfg && cfg.url,
    data: cfg && cfg.data,
  };
  remember(info);
  return Promise.resolve({ status: 599, data: null, headers: {} });
}
axios.get = (url) => {
  remember({ via: 'axios.get', method: 'get', url });
  return Promise.resolve({ status: 599, data: null, headers: {} });
};
axios.post = axios.get;
axios.create = () => axios;
axios.isAxiosError = () => false;

class OpenAI {
  constructor() {}
  chat = {
    completions: {
      create: async () => ({
        choices: [{ message: { content: global.__R8_MODEL || 'ACTION: REPLY\nBODY: Hello.' } }],
      }),
    },
  };
}

Module.prototype.require = function (id) {
  if (id === 'axios') return axios;
  if (id === 'openai') return OpenAI;
  return orig.apply(this, arguments);
};

module.exports = { recorded };
