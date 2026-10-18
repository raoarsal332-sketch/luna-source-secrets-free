'use strict';
/** [ME] inert stand-in for a module that is not in the staging tree and has no better source. */
function make(name) {
  const fn = function () {};
  const handler = {
    get(t, k) {
      if (k === 'then' || k === Symbol.toPrimitive || k === 'toJSON') return undefined;
      if (k === '__esModule') return false;
      if (k === '__stub') return name;
      if (!(k in t)) t[k] = make(name + '.' + String(k));
      return t[k];
    },
    apply() { make.called.add(name); return undefined; },
    construct() { return {}; },
  };
  return new Proxy(fn, handler);
}
make.called = new Set();
/** Hand-written stubs and patched [HI] modules expose only what they define; a missing function stays undefined so feature checks behave like the real module. */
function withFallback(obj) { return obj; }
module.exports = { make, withFallback };
