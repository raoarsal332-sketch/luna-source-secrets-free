'use strict';

const fs = require('fs');
const { createRuntime } = require('./runtime-loader');
const { buildCases } = require('./cases');
const { runOne } = require('./execute');

const flat = process.env.CRED_R9_FLAT;
const prompt = fs.readFileSync(process.env.LUNA_PROMPT_FILE, 'utf8');
const paths = {
  ticket: process.env.TICKET_STATE_FILE,
  ops: process.env.LUNA_OP_STORE_FILE,
  maintainer: process.env.MAINTAINER_DATA_DIR,
};
const rt = createRuntime(flat);
const byId = new Map(buildCases().map((row) => [row.id, row]));

process.send({ ready: true });
process.on('message', async (msg) => {
  const src = byId.get(msg.id);
  if (!src) {
    process.send({ error: 'unknown case ' + msg.id });
    return;
  }
  const c = Object.assign({}, src, { runId: msg.runId || src.id, mode: msg.mode || src.mode });
  try {
    const result = await runOne(rt, c, paths, prompt);
    process.send({ result });
  } catch (err) {
    process.send({ error: String(err && err.stack || err).slice(0, 800) });
  }
});
