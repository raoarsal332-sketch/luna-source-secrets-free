'use strict';
/**
 * Hook for module-specific detectors (Packs, Atom).
 *
 * A gate is { id, detect(text) -> boolean, enabled() -> boolean }.
 * faqAssistance.prepare asks every gate that is NOT enabled whether the customer text belongs
 * to that module; a hit on a disabled module is a terminal fail-closed (no public reply).
 * This file implements NO Packs/Atom detection. Other authors supply detectors either by
 * calling register() or by dropping ./faqModuleDetectors.js next to this file.
 *
 * Flags default OFF. Only 1/true/on/yes (case-insensitive) turn a module on.
 */

const gates = [];

function flagOn(name) {
  return /^(?:1|true|on|yes)$/i.test(String(process.env[name] == null ? '' : process.env[name]).trim());
}

function register(gate) {
  if (!gate || typeof gate.id !== 'string' || !gate.id) throw new Error('module gate needs an id');
  if (typeof gate.detect !== 'function') throw new Error('module gate needs detect(text)');
  const enabled = typeof gate.enabled === 'function' ? gate.enabled : () => flagOn(gate.flag || '');
  const at = gates.findIndex((g) => g.id === gate.id);
  const entry = Object.freeze({ id: gate.id, detect: gate.detect, enabled });
  if (at >= 0) gates[at] = entry;
  else gates.push(entry);
  return entry;
}

function list() {
  return gates.slice();
}

function reset() {
  gates.length = 0;
}

try {
  const extra = require('./faqModuleDetectors');
  if (extra && typeof extra.register === 'function') extra.register({ register, flagOn });
  else if (extra && Array.isArray(extra.gates)) extra.gates.forEach(register);
} catch (e) {
  if (!e || e.code !== 'MODULE_NOT_FOUND' || !/faqModuleDetectors/.test(String(e.message))) throw e;
}

module.exports = { register, list, reset, flagOn };
