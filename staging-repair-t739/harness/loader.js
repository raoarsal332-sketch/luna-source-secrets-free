'use strict';
/**
 * Dependency resolution for the staging tree, which ships only 11 of the ~70 modules index.js needs.
 * Order for any relative require that does not exist next to the requiring file:
 *   1. [HI] the older historical snapshot in /workspace/luna-current (matched by basename)
 *   2. [ME] a harness stub (harness/stubs/<name>.js if present, else a generic inert stub)
 * Every substitution is recorded in `resolved` so the report can list exactly what was not real.
 */
const Module = require('module');
const fs = require('fs');
const path = require('path');

const HI_ROOT = '/workspace/luna-current';
const STUB_DIR = path.join(__dirname, 'stubs');
const GEN_DIR = path.join(require('os').tmpdir(), 't739-generic-stubs');
const NEVER_STUB = new Set(['faqModuleDetectors']);
const resolved = { tree: new Set(), hi: new Map(), stub: new Set() };

function findHi(base) {
  const stack = [HI_ROOT];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === base + '.js') return p;
    }
  }
  return null;
}

function scriptedTransport(treeDir) {
  const realPath = path.join(treeDir, 'lunaResponsesTransport.js');
  if (!fs.existsSync(realPath)) return null;
  const stubPath = path.join(STUB_DIR, 'lunaResponsesTransport.js');
  const wrap = path.join(GEN_DIR, 'scripted_lunaResponsesTransport.js');
  fs.mkdirSync(GEN_DIR, { recursive: true });
  fs.writeFileSync(wrap, `'use strict';
const real = require(${JSON.stringify(realPath)});
const stub = require(${JSON.stringify(stubPath)});
function take() {
  if (!stub.state || !Array.isArray(stub.state.queue) || !stub.state.queue.length) return null;
  const next = stub.state.queue.shift();
  if (stub.state.calls) stub.state.calls.push({ scripted: true });
  return next == null ? '' : String(next);
}
function scriptedParsed(text) {
  const t = String(text || '').trim();
  return {
    status: 'completed', incomplete: false, incompleteReason: null, refusal: null,
    unknownTypes: [], toolCalls: [], text: t, partialText: t, outputItems: [],
    responseId: 'scripted', usage: { available: false },
  };
}
async function createRaw(openai, req) {
  const next = take();
  if (next != null) return scriptedParsed(next);
  return real.createRaw(openai, req);
}
async function create(openai, req) {
  const next = take();
  if (next != null) {
    return { choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: next } }], usage: {}, _luna: scriptedParsed(next) };
  }
  return real.create(openai, req);
}
module.exports = Object.assign({}, real, { create, createRaw });
`);
  return wrap;
}

function install(opts) {
  opts = opts || {};
  const treeDir = path.resolve(opts.treeDir);
  const noHi = new Set(opts.noHi || []);
  const scripted = scriptedTransport(treeDir);
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'openai') return path.join(STUB_DIR, 'openai.js');
    if (scripted && typeof request === 'string' && !path.isAbsolute(request) && /(?:^|\/)lunaResponsesTransport(?:\.js)?$/.test(request)) {
      resolved.stub.add('lunaResponsesTransport');
      return scripted;
    }
    try {
      return origResolve.call(this, request, parent, isMain, options);
    } catch (e) {
      if (!e || e.code !== 'MODULE_NOT_FOUND' || !/^\.{1,2}\//.test(request)) throw e;
      // The test tree is a flat copy of candidate/. Author packages live at
      // /workspace/staging-repair-t742 and are not inside that copy. A relative
      // require that names that tree must hit the real package, not a stub.
      const marker = 'staging-repair-t742';
      const at = request.indexOf(marker);
      if (at >= 0) {
        const abs = path.join('/workspace', request.slice(at));
        const hit = [abs, abs + '.js', path.join(abs, 'index.js')].find((p) => fs.existsSync(p));
        if (hit) return origResolve.call(this, hit.endsWith('.js') ? hit : abs, parent, isMain, options);
      }
      const name = path.basename(request).replace(/\.js$/, '');
      if (NEVER_STUB.has(name)) throw e;
      const inTree = path.join(treeDir, name + '.js');
      if (fs.existsSync(inTree)) {
        resolved.tree.add(name);
        return inTree;
      }
      const stub = path.join(STUB_DIR, name + '.js');
      if (fs.existsSync(stub)) {
        resolved.stub.add(name);
        return stub;
      }
      if (!noHi.has(name)) {
        const hi = findHi(name);
        if (hi) {
          resolved.hi.set(name, hi);
          const wrap = path.join(GEN_DIR, 'hi_' + name.replace(/[^\w.-]/g, '_') + '.js');
          fs.mkdirSync(GEN_DIR, { recursive: true });
          fs.writeFileSync(wrap, 'const real = require(' + JSON.stringify(hi) + ');\nconst patch = require(' + JSON.stringify(path.join(STUB_DIR, 'hiPatches.js')) + ')[' + JSON.stringify(name) + '] || {};\nmodule.exports = (real && (typeof real === "object" || typeof real === "function")) ? require(' + JSON.stringify(path.join(STUB_DIR, '_generic.js')) + ').withFallback(Object.assign(real, Object.fromEntries(Object.entries(patch).filter(([k]) => !(k in real)))), ' + JSON.stringify(name) + ') : real;\n');
          return wrap;
        }
      }
      resolved.stub.add(name);
      const gen = path.join(GEN_DIR, name.replace(/[^\w.-]/g, '_') + '.js');
      if (!fs.existsSync(gen)) {
        fs.mkdirSync(GEN_DIR, { recursive: true });
        fs.writeFileSync(gen, "module.exports = require(" + JSON.stringify(path.join(STUB_DIR, '_generic.js')) + ").make(" + JSON.stringify(name) + ");\n");
      }
      return gen;
    }
  };
  return { treeDir };
}

module.exports = { install, resolved };
