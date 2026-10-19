'use strict';
/**
 * Deny-by-default public comment allowlist.
 * Part matcher runs only for message_type === 'comment'.
 * Final check is on stripHtml(toHtml(plaintext)) bytes, including retries and replays.
 */

const { normalizeBody, sha256, isWelcomeOrBoilerplate, PURE_GREETING_ALLOWLIST } = require('./faqApprovedAnswers');
const { normalizeForRoute } = require('./routeNormalizer');
const { coversAllIntents, loadParams } = require('./approvedMatcher');
const { DENY_CODE_SET } = require('./moduleInterface');

const GREETING_IDS = Object.freeze({
  'Hello,': 'env.hello.comma',
  'Hello.': 'env.hello.dot',
  'Hello!': 'env.hello.bang',
  Hello: 'env.hello.bare',
  'Hi,': 'env.hi.comma',
  'Hi.': 'env.hi.dot',
  'Hi!': 'env.hi.bang',
  Hi: 'env.hi.bare',
  'Hey,': 'env.hey.comma',
  'Hey.': 'env.hey.dot',
  'Hey!': 'env.hey.bang',
  Hey: 'env.hey.bare',
  'Ciao,': 'env.ciao.comma',
  'Ciao.': 'env.ciao.dot',
  Ciao: 'env.ciao.bare',
  'Salam,': 'env.salam.comma',
  'Salam.': 'env.salam.dot',
  Salam: 'env.salam.bare',
  'Thanks for reaching out.': 'env.thanks.reaching',
  'Thanks for contacting us.': 'env.thanks.contacting',
  'Thanks for writing.': 'env.thanks.writing',
  'Hope you are doing well.': 'env.hope.doing',
  "Hope you're doing well.": 'env.hope.youre',
  'Hope you are well.': 'env.hope.well',
});

const DENIED_PUBLIC = new Set([
  "Once your review is complete, our team will update you on Intercom or via email, you don't need to check back manually.",
  "When the review finishes, we'll reach out on Intercom or by email - no need to keep checking in yourself.",
  "You'll get an update from our team on Intercom or email once the review is done, you won't need to follow up manually.",
  "I've forwarded this to a human support teammate. You'll receive an update soon.",
].map((s) => normalizeBody(s)));
const FALLBACK_PUBLIC = normalizeBody('Thanks for the details. I am checking this now and will update you here shortly.');
const TEAM_PUBLIC = normalizeBody('I will ask a support teammate to check this for you.');

let staffDepth = 0;
let turn = null;
let partIndex = null;

function enterStaff() { staffDepth += 1; }
function exitStaff() { staffDepth = Math.max(0, staffDepth - 1); }
function staffActive() { return staffDepth > 0; }
function bindTurn(next) { turn = next || null; }
function currentTurn() { return turn; }

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function hrefCount(html) {
  return (String(html || '').match(/\b(?:href|src)\s*=/gi) || []).length;
}

function attachmentCount(data) {
  if (!data || typeof data !== 'object') return 0;
  const lists = [data.attachments, data.attachment_files, data.attachment_urls];
  let n = 0;
  for (const list of lists) {
    if (Array.isArray(list)) n += list.length;
    else if (list) n += 1;
  }
  return n;
}

function addPart(index, id, body, kind) {
  const text = normalizeBody(body);
  if (!text) return;
  const hash = sha256(text);
  const part = { id, hash, kind, text };
  if (!index.byText.has(text)) index.byText.set(text, []);
  index.byText.get(text).push(part);
  index.byId.set(id, part);
}

function loadIndex() {
  if (partIndex) return partIndex;
  const index = { byText: new Map(), byId: new Map(), rows: [] };
  const faq = require('./faqApprovedAnswers');
  for (const row of faq.list()) addPart(index, row.id, row.body, 'catalog');
  for (const row of faq.listPending()) addPart(index, row.id, row.body, 'nonsendable');
  const data = faq.load();
  const templateIds = {
    backendCaveatExistingHuman: 'tpl.v12.backendCaveatExistingHuman',
    backendCaveatConfirmed: 'tpl.v12.backendCaveatConfirmed',
    backendCaveatIdentity: 'tpl.v12.backendCaveatIdentity',
    backendCaveatDefault: 'tpl.v12.backendCaveatDefault',
    assuranceNoPersonalBreach: 'tpl.v12.assuranceNoPersonalBreach',
  };
  for (const [key, id] of Object.entries(templateIds)) {
    if (data.templates[key]) addPart(index, id, data.templates[key], 'template');
  }
  try {
    const packs = require('./packs/packsApprovedAnswers');
    for (const row of packs.listSendable()) addPart(index, row.id, row.body, 'catalog');
    for (const row of packs.list()) {
      if (!row.sendable) addPart(index, row.id, row.body, 'nonsendable');
    }
    const pdata = packs.load ? packs.load() : null;
    if (pdata && pdata.templates) {
      if (pdata.templates.backendCaveatExistingHuman) addPart(index, 'tpl.packs.backendCaveatExistingHuman', pdata.templates.backendCaveatExistingHuman, 'template');
      if (pdata.templates.assuranceNoPersonalOwnership) addPart(index, 'tpl.packs.assuranceNoPersonalOwnership', pdata.templates.assuranceNoPersonalOwnership, 'template');
    }
  } catch (_) { /* packs catalog optional at boot */ }
  try {
    if (!process.env.LUNA_ATOM_APPROVED_ANSWERS) {
      const path = require('path');
      process.env.LUNA_ATOM_APPROVED_ANSWERS = path.join(__dirname, 'atom', 'faq-approved-answers-atom-v1.json');
    }
    const atom = require('./atom/atomApprovedAnswers');
    for (const row of atom.listSendable()) addPart(index, row.id, row.body, 'catalog');
    for (const row of atom.list()) {
      if (!row.sendable) addPart(index, row.id, row.body, 'nonsendable');
    }
    const adata = atom.load ? atom.load() : null;
    if (adata && adata.templates) {
      if (adata.templates.backendCaveatExistingHuman) addPart(index, 'tpl.atom.backendCaveatExistingHuman', adata.templates.backendCaveatExistingHuman, 'template');
      if (adata.templates.assuranceNoPersonalBreach) addPart(index, 'tpl.atom.assuranceNoPersonalBreach', adata.templates.assuranceNoPersonalBreach, 'template');
    }
    if (typeof atom.listPending === 'function') {
      for (const row of atom.listPending()) addPart(index, row.id, row.body, 'nonsendable');
    }
  } catch (_) { /* atom catalog optional at boot */ }
  for (const [text, id] of Object.entries(GREETING_IDS)) addPart(index, id, text, 'greeting');
  const spread = require('./spreadPublicGuard').SAFE_SPREAD_REPLY;
  addPart(index, 'tpl.spread.safe-reply', spread, 'spread');
  index.spreadText = normalizeBody(spread);
  index.rows = [];
  for (const parts of index.byText.values()) {
    for (const p of parts) {
      if (p.kind === 'catalog' || p.kind === 'template') index.rows.push({ id: p.id, body: p.text, contentHash: p.hash, intentTags: [] });
    }
  }
  partIndex = index;
  return index;
}

function paragraphsOf(plain) {
  const n = normalizeBody(plain);
  if (!n) return [];
  return n.split(/\n\n/).map((p) => p.trim()).filter(Boolean);
}

function approvedParagraphComposition(plain) {
  const index = loadIndex();
  const paras = paragraphsOf(plain);
  if (!paras.length) return false;
  return paras.every((p) => {
    const hit = lookupExact(index, p);
    return hit && (hit.kind === 'catalog' || hit.kind === 'template' || hit.kind === 'spread' || hit.kind === 'greeting');
  });
}

function lookupExact(index, text) {
  const hits = index.byText.get(normalizeBody(text)) || [];
  return hits[0] || null;
}

function nameSlot(part, expected) {
  if (PURE_GREETING_ALLOWLIST.has(normalizeBody(part))) return 'bare';
  if (!isWelcomeOrBoilerplate(part)) return 'no';
  const m = String(part || '').match(/^(?:Hello|Hi|Hey|Ciao|Salam)\s+([A-Za-zÀ-ÿ'\-]{1,40})[,!.]?$/i);
  if (!m) return 'no';
  if (!expected) return 'denied';
  if (m[1] !== expected) return 'denied';
  return 'ok';
}

function deny(code) {
  return { ok: false, code, ids: [], hashes: [] };
}

/**
 * Protected-category decision for unmatched model prose (owner t745, Option A).
 * Returns true only when the comment is protected content: an exclusive Packs
 * or Atom claim, both entity tokens, an MT5/spread offer or detector hit, a
 * credential-detector hit, or a staff REPLY/FOLLOW customer comment.
 * A shared selector word with no entity token is ordinary main-route content
 * and is allowed through the existing live gates. Classification that throws
 * on protected-looking text fails closed. Approved catalog rows, the spread
 * template, and admitted greetings do not consult this function.
 */
function looksProtected(text) {
  return /\b(?:packs?|atom|spreads?|mt5|metatrader|meta\s*trader|passwords?|logins?|credentials?)\b/i.test(String(text || ''));
}

function moduleTurnProtected(sample) {
  const { normalizeForRoute } = require('./routeNormalizer');
  const { packsEntityPresent, atomEntityPresent } = require('./moduleInterface');
  const router = require('./publicRouter');
  const normalized = normalizeForRoute(sample);
  if (packsEntityPresent(normalized) && atomEntityPresent(normalized)) return true;
  const input = { text: sample, normalized };
  const packsClaim = router.askClaim('packs', input);
  const atomClaim = router.askClaim('atom', input);
  if ((packsClaim && (packsClaim.thrown || packsClaim.malformed))
    || (atomClaim && (atomClaim.thrown || atomClaim.malformed))) return true;
  const resolved = router.resolveClaims(packsClaim, atomClaim, normalized);
  if (!resolved || resolved.malformed) return true;
  return resolved.kind === 'exclusive';
}

function plainMainRouteModelTextDenied(ctx) {
  ctx = ctx || {};
  const bound = currentTurn() || {};
  const plain = String(ctx.plain || '');
  const opScope = ctx.opScope != null ? ctx.opScope : bound.opScope;
  const staff = staffActive() || bound.staff === true || String(opScope || '').startsWith('command:');
  if (staff) return true;
  const cid = ctx.conversationId || bound.conversationId || '';
  const samples = [];
  if (bound.text) samples.push(String(bound.text));
  if (bound.normalized && bound.normalized !== bound.text) samples.push(String(bound.normalized));
  if (plain) samples.push(plain);
  let uncertain = false;
  try {
    const cred = require('./publicCredentialHold');
    const payload = ctx.data && ctx.data.message_type ? ctx.data : { message_type: 'comment', body: plain };
    const held = cred.holdOutgoingPayload('post', payload, { conversationId: cid });
    if (held && held.hold) return true;
  } catch (_) {
    uncertain = true;
  }
  try {
    const spreadState = require('./spreadTestState');
    if (cid && spreadState.load(cid).state === 'offered') return true;
  } catch (_) {
    uncertain = true;
  }
  try {
    const gate = require('./spreadAskGate');
    for (const sample of samples) {
      const explained = gate.explain(sample);
      if (explained && (explained.result === true || explained.reason === 'spread-test-credential')) return true;
    }
  } catch (_) {
    uncertain = true;
  }
  try {
    for (const sample of samples) {
      if (moduleTurnProtected(sample)) return true;
    }
  } catch (_) {
    uncertain = true;
  }
  if (uncertain && samples.some(looksProtected)) return true;
  return false;
}

function exclusiveFlagOffTurn(turn) {
  const sample = String((turn && (turn.text || turn.normalized)) || '');
  if (!sample) return false;
  try {
    const router = require('./publicRouter');
    const { languageGate } = require('./faqAnswerSelect');
    const { normalizeForRoute } = require('./routeNormalizer');
    const normalized = turn.normalized || normalizeForRoute(sample);
    const gate = languageGate(normalized, []);
    if (!gate || gate.lang === 'non-en') return false;
    const input = { text: sample, normalized };
    const resolved = router.resolveClaims(router.askClaim('packs', input), router.askClaim('atom', input), normalized);
    if (!resolved || resolved.kind !== 'exclusive') return false;
    const flag = resolved.entity === 'packs' ? 'LUNA_PACKS_ENABLED' : 'LUNA_ATOM_SELECTOR_ENABLED';
    if (router.flagOn(flag)) return false;
    return gate.lang === 'en' || gate.lang === 'uncertain';
  } catch (_) {
    return looksProtected(sample);
  }
}

function spreadOnlyVerdict(verdict) {
  const ids = (verdict && verdict.ids) || [];
  const cls = ids[0];
  return (cls === 'comp.spread-only' || cls === 'comp.greeting-plus-spread') && ids.includes('tpl.spread.safe-reply');
}

function spreadTemplateEligible(turn) {
  const text = String((turn && (turn.text || turn.normalized)) || '');
  try {
    const gate = require('./spreadAskGate');
    if (gate.personalAccountCue(text) === true) return false;
    const cid = turn && turn.conversationId;
    const state = require('./spreadTestState').load(cid);
    const eventAt = Number((turn && turn.eventAt) || 0);
    if (state && state.state === 'offered') {
      if (eventAt && state.eventAt && eventAt < Number(state.eventAt)) return false;
      return true;
    }
    const explained = gate.explain(text);
    return !!(explained && explained.reason === 'spread-test-credential');
  } catch (_) {
    return false;
  }
}

function applyExclusiveFlagOff(verdict) {
  if (!verdict || !verdict.ok || verdict.skipped) return verdict;
  const turn = currentTurn();
  if (!exclusiveFlagOffTurn(turn)) return verdict;
  if (spreadOnlyVerdict(verdict) && spreadTemplateEligible(turn)) return verdict;
  return deny('NOT_APPROVED_OUTPUT');
}

function assertApprovedPublicOutput(data, opts) {
  opts = opts || {};
  if (!data || data.message_type !== 'comment') return { ok: true, ids: [], hashes: [], skipped: true };
  if (attachmentCount(data) > 0) return deny('ATTACHMENT_DENIED');
  const html = String(data.body || '');
  if (hrefCount(html) > 0) return deny('URL_DENIED');
  const plain = stripHtml(html);
  const normPlain = normalizeBody(plain);
  const boundNow = currentTurn() || {};
  if (DENIED_PUBLIC.has(normPlain)) return deny('NOT_APPROVED_OUTPUT');
  if (boundNow.publicSilence) return deny('NOT_APPROVED_OUTPUT');
  if (normPlain === FALLBACK_PUBLIC || normPlain === TEAM_PUBLIC) {
    let protectedTurn = !!(boundNow.publicSilence || boundNow.inboundCredential);
    if (!protectedTurn) {
      try { protectedTurn = plainMainRouteModelTextDenied({ plain: '', conversationId: opts.conversationId, opScope: opts.opScope, data }); }
      catch (_) { protectedTurn = true; }
    }
    if (protectedTurn) return deny('NOT_APPROVED_OUTPUT');
  }
  const paras = paragraphsOf(plain);
  if (!paras.length) return deny('NOT_APPROVED_OUTPUT');
  const index = loadIndex();
  let i = 0;
  let greeting = null;
  const slot = nameSlot(paras[0], opts.expectedFirstName != null ? opts.expectedFirstName : (turn && turn.expectedFirstName) || '');
  if (slot === 'denied') return deny('NAME_SLOT_DENIED');
  if (slot === 'bare' || slot === 'ok') {
    greeting = lookupExact(index, paras[0]);
    if (!greeting || greeting.kind !== 'greeting') {
      if (slot === 'ok') greeting = { id: 'env.greeting.with-name', hash: sha256(normalizeBody(paras[0])), kind: 'greeting' };
      else return deny('NOT_APPROVED_OUTPUT');
    }
    i = 1;
  }
  const rest = paras.slice(i);
  const spreadParas = paragraphsOf(index.spreadText);
  let spread = null;
  let core = rest;
  if (spreadParas.length && rest.length >= spreadParas.length) {
    const tail = normalizeBody(rest.slice(rest.length - spreadParas.length).join('\n\n'));
    if (tail === index.spreadText) {
      spread = index.byId.get('tpl.spread.safe-reply');
      core = rest.slice(0, rest.length - spreadParas.length);
    }
  }
  const coreText = normalizeBody(core.join('\n\n'));
  let body = null;
  if (coreText) {
    for (let k = 1; k < core.length; k += 1) {
      const a = lookupExact(index, core.slice(0, k).join('\n\n'));
      const b = lookupExact(index, core.slice(k).join('\n\n'));
      if (a && b && (a.kind === 'catalog' || a.kind === 'template' || a.kind === 'nonsendable')
        && (b.kind === 'catalog' || b.kind === 'template' || b.kind === 'nonsendable')) {
        return deny('MULTI_BODY_DENIED');
      }
    }
    body = lookupExact(index, coreText);
    if (!body) {
      if (plainMainRouteModelTextDenied({ plain: coreText, opScope: opts.opScope, conversationId: opts.conversationId, data })) return deny('NOT_APPROVED_OUTPUT');
      return applyExclusiveFlagOff({
        ok: true,
        code: 'OK',
        ids: ['comp.main-route-model'],
        hashes: [sha256(coreText)],
        classId: 'comp.main-route-model',
      });
    }
    if (body.kind === 'nonsendable') return deny('NON_SENDABLE');
    if (body.hash !== sha256(coreText)) return deny('NOT_APPROVED_OUTPUT');
    if (body.kind === 'catalog') {
      const params = loadParams();
      const normalized = (turn && turn.normalized) || (opts.normalized) || '';
      if (!normalized || !coversAllIntents(normalized, body.id, index.rows, params)) return deny('COVERAGE_DENIED');
    }
  }
  if (!greeting && !body && !spread) return deny('NOT_APPROVED_OUTPUT');
  let classId = 'comp.body-only';
  if (greeting && body && spread) classId = 'comp.envelope-body-spread';
  else if (body && spread) classId = 'comp.catalog-plus-spread';
  else if (greeting && spread) classId = 'comp.greeting-plus-spread';
  else if (spread) classId = 'comp.spread-only';
  else if (greeting && body) classId = 'comp.envelope-plus-body';
  else if (greeting && !body) return deny('NOT_APPROVED_OUTPUT');
  const ids = [classId];
  const hashes = [];
  for (const part of [greeting, body, spread]) {
    if (!part) continue;
    ids.push(part.id);
    hashes.push(part.hash);
  }
  return applyExclusiveFlagOff({ ok: true, code: 'OK', ids, hashes, classId });
}

function logDecision(verdict, data) {
  const body = data && data.body ? String(data.body) : '';
  const line = JSON.stringify({
    event: 'PUBLIC_WRITE',
    code: verdict && verdict.ok ? 'OK' : (verdict && verdict.code) || 'NOT_APPROVED_OUTPUT',
    ids: (verdict && verdict.ids) || [],
    bodyLen: body.length,
    hrefCount: hrefCount(body),
    attachmentCount: attachmentCount(data),
  });
  try { console.log(line); } catch (_) {}
}

function denyResult(verdict) {
  const code = verdict && DENY_CODE_SET.has(verdict.code) ? verdict.code : 'NOT_APPROVED_OUTPUT';
  return {
    ok: false,
    skipped: true,
    held: true,
    unknown: false,
    reason: 'approved-output-deny',
    holdCode: code,
    delivery: 'not-attempted',
  };
}

function shouldPostStaffHold(info) {
  if (!info || !info.staff) return false;
  if (info.unknown || info.outcome === 'unknown') return false;
  return true;
}

module.exports = {
  stripHtml,
  assertApprovedPublicOutput,
  logDecision,
  denyResult,
  shouldPostStaffHold,
  enterStaff,
  exitStaff,
  staffActive,
  bindTurn,
  currentTurn,
  plainMainRouteModelTextDenied,
  moduleTurnProtected,
  approvedParagraphComposition,
  loadIndex,
  hrefCount,
  attachmentCount,
};
