'use strict';
/**
 * Module-specific detectors for faqModuleGates: Elite Packs and Elite Atom.
 *
 * A detector only answers "does this customer text belong to the module?". It never selects,
 * ranks or renders an answer. It is built from each module's own exported scope logic; the
 * selector logic of both modules is untouched (byte-identical copies under ./packs and ./atom).
 *
 *   packs  scope = packsProductHint() or the module's inline Packs term list (selectPacksAnswer
 *                  "not-elite-packs" test, without the two generic words refund/missing), applied to
 *                  the module's own obfuscation-folded text (pregate.normalizeInput), plus the module's
 *                  named-card list and a missing-item report that uses Packs item vocabulary.
 *   atom   scope = the word "atom" in the current text, or Atom's own follow-up chain
 *                  (buildContext: scopeAtom with chain > 0) for a follow-up to an Atom turn.
 *
 * Flags (default OFF): packs = LUNA_PACKS_ENABLED (1/true/on/yes); atom = the module's own
 * atomSelectorEnabled() (LUNA_ATOM_SELECTOR_ENABLED=1).
 *
 * If a module file cannot be loaded the detector degrades to a coarse word test ("pack(s)" /
 * "atom") and logs one body-free line. Loading never throws into the request path. A detector
 * that throws on a particular input counts as a hit (faqAssistance fail-closed rule).
 */

let packs = null;
let atom = null;
let packsErr = null;
let atomErr = null;
let warned = false;

function loadPacks() {
  if (packs || packsErr) return packs;
  try {
    packs = require('./packs/packsAnswerSelect');
  } catch (e) {
    packsErr = String((e && e.code) || 'LOAD_ERROR');
    warnOnce('packs', packsErr);
  }
  return packs;
}

function loadAtom() {
  if (atom || atomErr) return atom;
  try {
    atom = require('./atom/atomAnswerSelect');
  } catch (e) {
    atomErr = String((e && e.code) || 'LOAD_ERROR');
    warnOnce('atom', atomErr);
  }
  return atom;
}

function warnOnce(id, code) {
  try {
    console.error('FAQ_MODULE_DETECTOR_DEGRADED', id, code);
  } catch (_) {}
  warned = true;
}

const PACKS_EXTRA_TERMS_RE =
  /\b(?:ignition|oracle|whale|pack\s*credits?|the\s*million|pack\s*pass|lucky\s*streak|redeem\s*key|drop\s*rates?|purple\s*card|100\s*%\s*payout|skip\s*a\s*step|drawdown\s*buffer|primordial|mythic|free\s*pack|instant\s*override|founder'?s?\s*key)\b/;

function packsDetect(text) {
  const p = loadPacks();
  const raw = String(text == null ? '' : text);
  if (!p) return /\bpacks?\b/i.test(raw);
  const pg = p.pregate;
  const n = pg.normalizeInput(raw);
  const norm = String((n && n.text) || '').toLowerCase();
  if (p.packsProductHint(norm) || PACKS_EXTRA_TERMS_RE.test(norm)) return true;
  if (pg.NAMED_CARD_RE.test(norm)) return true;
  return !!(p.missingItemIntent(norm) && pg.PACKS_ITEM_RE.test(norm));
}

function atomDetect(text, ctx) {
  const a = loadAtom();
  const raw = String(text == null ? '' : text);
  if (!a) return /\batom\b/i.test(raw);
  const priors = Array.isArray(ctx && ctx.priorClientTexts) ? ctx.priorClientTexts : [];
  const c = a.buildContext(raw, priors);
  if (/\batom\b/.test(c.cur.n.t)) return true;
  return !!(c.scopeAtom && c.chain > 0);
}

function packsEnabled(flagOn) {
  return flagOn('LUNA_PACKS_ENABLED');
}

function atomEnabled() {
  const a = loadAtom();
  if (!a) return false;
  return a.atomSelectorEnabled({}) === true;
}

/**
 * ON-path selection (isolated test configuration only). Returns the module's own result,
 * reduced to body-free fields. Delivery of a module answer is NOT wired (see faqAssistance).
 */
async function packsSelect(text, gate, ctx) {
  const p = loadPacks();
  if (!p) return { abstain: true, reason: 'module-unavailable' };
  const adapter = require('./faqModuleAdapter');
  const r = await p.selectPacksAnswer(text, adapter.packsOptions(gate, { ...ctx, enabled: true }));
  return summarize(r);
}

async function atomSelect(text, gate, ctx) {
  const a = loadAtom();
  if (!a) return { abstain: true, reason: 'module-unavailable' };
  const adapter = require('./faqModuleAdapter');
  const r = await a.selectAtomAnswer(text, adapter.atomOptions(gate, { ...ctx, enabled: true }));
  return summarize(r);
}

function summarize(r) {
  if (!r || typeof r !== 'object') return { abstain: true, reason: 'module-result-malformed' };
  return {
    abstain: r.abstain !== false,
    answerId: r.abstain === false && typeof r.answerId === 'string' ? r.answerId : undefined,
    action: typeof r.action === 'string' ? r.action : undefined,
    reason: typeof r.reason === 'string' ? r.reason.slice(0, 80) : '',
  };
}

function register(api) {
  api.register({ id: 'packs', enabled: () => packsEnabled(api.flagOn), detect: packsDetect, select: packsSelect });
  api.register({ id: 'atom', enabled: atomEnabled, detect: atomDetect, select: atomSelect });
}

module.exports = { register, packsDetect, atomDetect, packsEnabled, atomEnabled, packsSelect, atomSelect, PACKS_EXTRA_TERMS_RE, _status: () => ({ packsErr, atomErr, warned }) };
