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

function install(opts) {
  opts = opts || {};
  const treeDir = path.resolve(opts.treeDir);
  const noHi = new Set(opts.noHi || []);
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'openai') return path.join(STUB_DIR, 'openai.js');
    try {
      return origResolve.call(this, request, parent, isMain, options);
    } catch (e) {
      if (!e || e.code !== 'MODULE_NOT_FOUND' || !/^\.{1,2}\//.test(request)) throw e;
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
