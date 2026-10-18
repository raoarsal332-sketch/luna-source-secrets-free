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
  /\b(?:ignition|oracle|whale|pack\s*credits?|the\s*million|pack\s*pass|lucky\s*streak|redeem\s*keys?|drop\s*rates?|purple\s*card|100\s*%\s*payout|skip\s*a\s*step|drawdown\s*buffer|primordial|mythic|free\s*packs?|instant\s*override|founder'?s?\s*keys?)\b/;

const PACKS_ENTITY_RE =
  /\b(?:elite\s*packs?|my\s*packs?|packs?|pack\s*credits?|pack\s*pass|pack\s*keys?|redeem\s*keys?|founder'?s?\s*keys?|(?:purple|pink|exotic|mythic|legendary|primordial)\s*cards?|pack\s*cards?|(?:card|pack)s?\s+rarit(?:y|ies)|rarit(?:y|ies)\s+(?:of\s+)?(?:the\s+)?(?:cards?|packs?))\b/;

const PACKS_FOLLOW_RE =
  /\b(?:open(?:ed|ing)?|redeem(?:ed|ing)?|rarit(?:y|ies)|pack\s*credits?|cards?|collection|inventory|streak)\b/;

const CONFUSABLES = new Map(Object.entries({
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c', '\u0443': 'y', '\u0445': 'x',
  '\u0410': 'a', '\u0415': 'e', '\u041e': 'o', '\u0420': 'p', '\u0421': 'c', '\u0423': 'y', '\u0425': 'x',
  '\u0456': 'i', '\u0406': 'i', '\u0455': 's', '\u0405': 's', '\u04bb': 'h', '\u043a': 'k', '\u041a': 'k',
  '\u043c': 'm', '\u041c': 'm', '\u0442': 't', '\u0422': 't', '\u0432': 'b', '\u0412': 'b', '\u043d': 'h', '\u041d': 'h',
  '\u03b1': 'a', '\u03b5': 'e', '\u03b9': 'i', '\u03bf': 'o', '\u03c1': 'p', '\u03c4': 't', '\u03ba': 'k',
  '\u0391': 'a', '\u0395': 'e', '\u0399': 'i', '\u039f': 'o', '\u03a1': 'p', '\u03a4': 't', '\u039a': 'k',
}));

/** NFKC, strip zero-width/format characters, fold confusables per character (not gated on ASCII letter count), then join spaced single-letter runs. */
function normalizeForDetect(raw) {
  let s = String(raw == null ? '' : raw);
  s = s.replace(/[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]|\p{Cf}/gu, '');
  try { s = s.normalize('NFKC'); } catch (_) { /* keep */ }
  let out = '';
  for (const ch of s) out += CONFUSABLES.has(ch) ? CONFUSABLES.get(ch) : ch;
  out = out.toLowerCase();
  // "E l i t e P a c k s" / "a.t.o.m" — same join the Packs pregate uses, after confusables so a homoglyph letter still joins.
  out = out.replace(/(?<![a-z0-9'])(?:[a-z][ .\-_*·]){2,}[a-z](?![a-z0-9'])/g, (m) => m.replace(/[ .\-_*·]/g, ''));
  return out;
}

function scrubNonModule(norm) {
  return String(norm || '')
    .replace(/\bpack(?:ing)?\s+(?:my\s+|the\s+|a\s+)?bags?\b/g, ' ')
    .replace(/\b(?:backpacks?|packages?|packets?)\b/g, ' ')
    .replace(/\b(?:credit|debit)\s+cards?\b/g, ' ');
}

function packsEntity(norm) {
  return PACKS_ENTITY_RE.test(norm) || PACKS_EXTRA_TERMS_RE.test(norm);
}

function packsDetect(text, ctx) {
  const p = loadPacks();
  const norm = scrubNonModule(normalizeForDetect(text));
  if (packsEntity(norm)) return true;
  if (!p) return false;
  const pg = p.pregate;
  if (p.packsProductHint(norm) || pg.NAMED_CARD_RE.test(norm)) return true;
  if (p.missingItemIntent(norm) && pg.PACKS_ITEM_RE.test(norm)) return true;
  const priors = Array.isArray(ctx && ctx.priorClientTexts) ? ctx.priorClientTexts : [];
  const priorHit = priors.some((t) => packsEntity(scrubNonModule(normalizeForDetect(t))));
  if (priorHit && PACKS_FOLLOW_RE.test(norm)) return true;
  return false;
}

function atomDetect(text, ctx) {
  const a = loadAtom();
  const norm = normalizeForDetect(text).replace(/\b(?:atomic|anatomy|anatomical|atomizer)\b/g, ' ');
  if (/\belite\s*atom\b|\batom\b/.test(norm)) return true;
  if (!a) return false;
  const priors = Array.isArray(ctx && ctx.priorClientTexts) ? ctx.priorClientTexts : [];
  const c = a.buildContext(norm, priors.map((t) => normalizeForDetect(t)));
  if (c && c.cur && c.cur.n && /\batom\b/.test(c.cur.n.t)) return true;
  return !!(c && c.scopeAtom && c.chain > 0);
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
