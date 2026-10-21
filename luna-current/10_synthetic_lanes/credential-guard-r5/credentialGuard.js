'use strict';

/**
 * Credential guard R5 — frozen synthetic candidate.
 *
 * Rebuilt from this repo plus the t812 handoff delta. The R4 tree and its
 * review file are not in this checkout. Not wired into index.js. Not a release.
 * approved is false until a different agent reviews it.
 *
 * The fixed message follows the existing credentials rule in
 * 01_runtime/system-prompt.txt (do not repeat a pasted secret, tell the client
 * to change it immediately, escalate it as a security event). It adds no
 * account, payout, or lock outcome.
 */

const STATUS = Object.freeze({
  candidate: 'credential-guard-r5',
  frozen: true,
  approved: false,
  release: false,
});

const FIXED_MESSAGE =
  'Please change that immediately. I will not repeat it back. I am escalating this as a security event for the team.';

const STOP = new Set([
  'the', 'a', 'an', 'my', 'your', 'this', 'that', 'it', 'to', 'on', 'in', 'and', 'or',
  'please', 'again', 'phase', 'challenge', 'evaluation', 'account', 'successfully',
  'failed', 'fail', 'wrong', 'incorrect', 'password', 'code', 'otp', 'today',
  'tomorrow', 'now', 'later', 'phase1', 'step', 'verification', 'kyc', 'payout',
  'email', 'login', 'server',
]);

const LABELED_RE = /\b(password|passcode|otp|o\.t\.p|one[\s-]?time(?:\s+(?:code|password|pin))?|pin|2fa|mfa|verification\s+code|security\s+code|auth(?:entication)?\s+code)\b([\s:=-]*(?:is|was|:|=)?[\s:=-]*)(\S+)/gi;
const PASS_RE = /\bpass\b(?!word\b)([\s:=-]*(?:is|was|:|=)[\s:=-]*|\s+)(\S+)/gi;
const TYPED_RE = /\btyped\b([\s:=-]*(?:is|was|:|=)[\s:=-]*|\s+)(\S+)/gi;
const HERE_RE = /\bhere it is\s*:\s*(\S+)/gi;

function cleanToken(raw) {
  return String(raw || '').replace(/^['"`([{]+|['"`)\]}.,;!?]+$/g, '');
}

function tokenAccepted(sep, raw) {
  const token = cleanToken(raw);
  if (!token || token.length > 128) return null;
  if (STOP.has(token.toLowerCase())) return null;
  if (/^(?:phase|challenge|evaluation|step|account|payout)\d*$/i.test(token)) return null;
  const explicit = /[:=]/.test(sep) || /\b(?:is|was)\b/i.test(sep);
  if (explicit) {
    if (token.length < 3 && !/\d/.test(token)) return null;
    return token;
  }
  if (/\d/.test(token) || /[A-Z]/.test(token) || token.length >= 6) return token;
  return null;
}

function collect(re, text, take) {
  re.lastIndex = 0;
  let match;
  while ((match = re.exec(text))) {
    take(match);
    if (match.index === re.lastIndex) re.lastIndex += 1;
  }
}

/**
 * Scan the full string. There is no message-length cap and no start anchor.
 * @returns {{kind: string, start: number, end: number, value: string}[]}
 */
function findDisclosures(text) {
  const source = String(text == null ? '' : text);
  const found = [];
  collect(LABELED_RE, source, (m) => {
    const value = tokenAccepted(m[2] || ':', m[3]);
    if (!value) return;
    found.push({ kind: 'labeled', start: m.index, end: m.index + m[0].length, value });
  });
  collect(PASS_RE, source, (m) => {
    const value = tokenAccepted(m[1] || ' ', m[2]);
    if (!value) return;
    found.push({ kind: 'pass', start: m.index, end: m.index + m[0].length, value });
  });
  collect(TYPED_RE, source, (m) => {
    const value = tokenAccepted(m[1] || ' ', m[2]);
    if (!value) return;
    found.push({ kind: 'typed', start: m.index, end: m.index + m[0].length, value });
  });
  collect(HERE_RE, source, (m) => {
    const value = tokenAccepted(':', m[1]);
    if (!value) return;
    found.push({ kind: 'here_it_is', start: m.index, end: m.index + m[0].length, value });
  });
  return found;
}

function authorId(part) {
  const author = (part && part.author) || {};
  return String(author.id || part.authorId || '');
}

function lunaOwnAssign(ctx) {
  const lunaIds = new Set((ctx.lunaIds || []).map(String).filter(Boolean));
  const teamId = ctx.teamAssigneeId != null ? String(ctx.teamAssigneeId) : '';
  const escalationId = ctx.escalationAssigneeId != null ? String(ctx.escalationAssigneeId) : '';
  const out = { team: false, escalation: false, assignmentPart: false, lunaAuthored: false };
  if (ctx.lunaAssignedTo === 'team') out.team = true;
  if (ctx.lunaAssignedTo === 'escalation') out.escalation = true;

  for (const part of ctx.parts || []) {
    if (!part) continue;
    const fromLuna = part.authorIsLuna === true || (authorId(part) && lunaIds.has(authorId(part)));
    if (!fromLuna) continue;
    const target = String(part.target || part.assignee_type || '');
    const assignee = String(part.assignee_id || part.assigneeId || '');
    const escalation = part.escalation === true || /escalat/i.test(target) || (escalationId && assignee === escalationId);
    const team = part.team === true || /^team$/i.test(target) || (teamId && assignee === teamId);
    if (!escalation && !team) continue;
    out.lunaAuthored = true;
    if (escalation) out.escalation = true;
    if (team) out.team = true;
    const partType = String(part.part_type || part.partType || '');
    if (partType === 'assignment' || part.assignment === true) out.assignmentPart = true;
  }
  return out;
}

function coversEntireMessage(text, hits) {
  const trimmed = String(text || '').trim();
  if (!trimmed || !hits.length) return false;
  const leading = String(text || '').indexOf(trimmed);
  return hits.some((hit) => hit.start <= leading && hit.end >= leading + trimmed.length);
}

/**
 * @param {object} ctx
 * @param {string} [ctx.clientText]
 * @param {string} [ctx.draft]
 * @param {boolean} [ctx.wouldSkip] caller would otherwise send nothing
 * @param {'team'|'escalation'} [ctx.lunaAssignedTo]
 * @param {Array} [ctx.parts]
 * @param {string[]} [ctx.lunaIds]
 * @returns {object}
 */
function decideCredentialGuard(ctx) {
  const input = ctx || {};
  const clientText = String(input.clientText == null ? '' : input.clientText);
  const draft = input.draft == null ? '' : String(input.draft);
  const hits = findDisclosures(clientText);
  const values = [];
  for (const hit of hits) {
    if (hit.value && !values.includes(hit.value)) values.push(hit.value);
  }
  const draftContains = values.some((value) => value && draft.includes(value));
  const contained = hits.length > 0 && !coversEntireMessage(clientText, hits);
  const assign = lunaOwnAssign(input);
  const reasons = [];
  if (hits.length || draftContains) reasons.push('credential_disclosure');
  if (hits.length && assign.team) reasons.push('AF02');
  if (hits.length && assign.escalation) reasons.push('NT03');
  if (hits.length && assign.assignmentPart) reasons.push('NC01');
  if (contained || draftContains) reasons.push('OH07');

  const base = {
    version: STATUS.candidate,
    frozen: true,
    approved: false,
    release: false,
    silent: false,
    kinds: hits.map((hit) => hit.kind),
    treatedAsHumanHandoff: false,
  };

  if (!hits.length && !draftContains) {
    return Object.assign(base, {
      action: 'allow',
      message: input.draft == null ? null : draft,
      reasons: [],
      matchMode: null,
      overridesSkip: false,
    });
  }

  return Object.assign(base, {
    action: 'fixed_message',
    message: FIXED_MESSAGE,
    reasons,
    matchMode: contained || draftContains ? 'contains' : 'exact',
    overridesSkip: true,
    wouldHaveSkipped: !!input.wouldSkip,
  });
}

module.exports = {
  STATUS,
  FIXED_MESSAGE,
  findDisclosures,
  decideCredentialGuard,
};
