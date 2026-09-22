'use strict';

/**
 * tools/index.js - registry of Luna-facing tools.
 *
 * const tools = createTools({ getMessages, getImages, retriever, escalateGetter, getLastVisionHint });
 * tools.specs()                 -> OpenAI-style function specs (6 tools)
 * tools.dispatch(name, args, ctx) -> result object
 */

const getStateTool = require('./getState');
const searchTool = require('./searchKnowledge');
const calcTool = require('./calc');
const compareTool = require('./compareChallenges');
const readImageTool = require('./readImageFacts');
const escalateTool = require('./listOpenEscalation');

function createTools(opts) {
  opts = opts || {};
  const gs = getStateTool.createGetState(opts);
  const sk = searchTool.createSearchKnowledge(opts);
  const cc = compareTool.createCompareChallenges(opts);
  const ri = readImageTool.createReadImageFacts(opts);
  const le = escalateTool.createListOpenEscalation(opts);

  const names = [
    'get_state',
    'search_knowledge',
    'calc',
    'compare_challenges',
    'read_image_facts',
    'list_open_escalation',
  ];

  function specs(o) {
    const list = [
      getStateTool.spec,
      searchTool.spec,
      calcTool.spec,
      compareTool.spec,
      readImageTool.spec,
      escalateTool.spec,
    ];
    const style = (o && o.style) || 'openai';
    if (style === 'openai') return list.map((s) => ({ type: 'function', function: s }));
    return list;
  }

  async function dispatch(name, args, ctx) {
    ctx = ctx || {};
    args = args || {};
    switch (name) {
      case 'get_state':
        return gs.get(ctx.conversationId, args);
      case 'search_knowledge':
        return sk.search(args.query, { limit: args.limit, conversationId: ctx.conversationId });
      case 'calc':
        return calcTool.calc(args);
      case 'compare_challenges':
        return cc.compare(args.a, args.b);
      case 'read_image_facts':
        return ri.read(args, ctx);
      case 'list_open_escalation':
        return le.list(args, ctx);
      default:
        return { ok: false, error: `unknown tool ${name}` };
    }
  }

  return {
    specs,
    dispatch,
    getState: gs,
    searchKnowledge: sk,
    calc: calcTool.calc,
    compareChallenges: cc,
    readImageFacts: ri,
    listOpenEscalation: le,
    names,
  };
}

module.exports = { createTools };
