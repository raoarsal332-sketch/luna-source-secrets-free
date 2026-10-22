'use strict';

/**
 * Fixed-message handoff R2 — frozen extraction for independent review.
 *
 * The handoff names tree_fm_r2 b02e38e7. That tree is not in this checkout.
 * This module copies the current in-repo decision without changing it:
 *   01_runtime/index.js isVagueOrLiveAgentOnlyAsk (2534-2550),
 *   lockedFinHandoffWelcome (2552-2559), firstNameFromClient (2780-2787),
 *   arsalHasPublicClientReply (2789-2800), finHandoffInHistory (2362-2376),
 *   clientRequestedLiveAgentAfterLastElite (2401-2412),
 *   and the send gate at 3763-3772.
 * Live-agent and Fin-phrase checks delegate to 01_runtime/softEdges.js.
 * Human-reply checks delegate to 01_runtime/teammateHandoffGates.js.
 *
 * Not wired back into index.js. Not a release. approved is false.
 * Seat ids are caller arguments. This file does not embed production ids.
 */

const softEdges = require('../../01_runtime/softEdges');
const teammateHandoffGates = require('../../01_runtime/teammateHandoffGates');

const STATUS = Object.freeze({
  candidate: 'fixed-message-handoff-r2',
  frozen: true,
  approved: false,
  release: false,
  behaviorChange: false,
});

const stripHtml = teammateHandoffGates.stripHtml;

function clientRequestedLiveAgent(text) {
  return softEdges.clientRequestedLiveAgent(text);
}

function finHandoffPhrase(text) {
  return softEdges.finHandoffPhrase(text);
}

function isVagueOrLiveAgentOnlyAsk(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (clientRequestedLiveAgent(t) && t.length < 140) {
    // Strip live-agent phrasing , if little substance remains, treat as vague takeover
    const rest = t
      .replace(/\b((live\s*agent)|(real\s+(person|human|agent))|(talk\s+to\s+(a\s+|an\s+)?(human|person|agent|someone))|(speak\s+(to|with)\s+(a\s+|an\s+)?(human|person|agent|someone))|(connect(\s+me)?\s+to\s+(a\s+|an\s+)?(agent|human|person|someone|support))|(need\s+(a\s+)?(live\s+)?(agent|human))|(want\s+(a\s+)?(live\s+)?(agent|human))|(human\s+support)|(agent\s+please)|(chat\s+with\s+(a\s+)?(person|human|agent|someone))|(transfer\s+(me\s+)?to\s+(a\s+)?(human|agent|person))|(put\s+me\s+through\s+to))\b/gi, ' ')
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (rest.length < 28) return true;
  }
  if (/^(hi|hello|hey|yo|hola|ciao)[.!?\s]*$/i.test(t)) return true;
  if (/^(i\s+have\s+)?another\s+question[.!?\s]*$/i.test(t)) return true;
  if (/^(i\s+need\s+help|help\s+please|can\s+you\s+help)[.!?\s]*$/i.test(t)) return true;
  return false;
}

function firstNameFromClient(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  // Drop junk placeholders (never greet as "Bot test")
  if (/^bot\s*test$/i.test(n)) return '';
  const part = n.split(/\s+/)[0];
  return part.replace(/[^A-Za-zÀ-ÿ'\-]/g, '') || '';
}

function lockedFinHandoffWelcome(clientName, latestClientText = '') {
  const first = firstNameFromClient(clientName);
  const name = first ? (' ' + first) : '';
  if (/[\u0600-\u06ff]/.test(String(latestClientText || ''))) return 'السلام علیکم' + name + '، میں آپ کی کیا مدد کر سکتا ہوں؟';
  if (/\b(?:ciao|buongiorno|salve|aiuto|aiutarmi)\b/i.test(String(latestClientText || ''))) return 'Ciao' + name + ', come posso aiutarti?';
  if (/\b(?:kya|aap|ap|tum|mujhe|madad|salam)\b/i.test(String(latestClientText || ''))) return 'Salam' + name + ', main aap ki kis cheez mein madad kar sakta hoon?';
  return 'Hello' + name + ', how can I help?';
}

function arsalHasPublicClientReply(parts, arsalId) {
  for (const p of parts || []) {
    const a = p.author || {};
    if (String(a.id || '') !== String(arsalId || '')) continue;
    if (p.part_type === 'note') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    return true;
  }
  return false;
}

function finHandoffInHistory(parts, ids) {
  const eliteAiId = String((ids && ids.eliteAiId) || '');
  const arsalId = String((ids && ids.arsalId) || '');
  for (const part of parts || []) {
    if (!part || part.part_type === 'note') continue;
    const a = part.author || {};
    const id = String(a.id || '');
    const body = stripHtml(part.body || '');
    if (!body || !finHandoffPhrase(body)) continue;
    if (eliteAiId && id === eliteAiId) return true;
    if (a.type === 'bot') return true;
    if (/elite\s*ai|\bfin\b/i.test(String(a.name || ''))) return true;
    if ((a.type === 'admin' || a.type === 'bot') && id !== arsalId) return true;
  }
  return false;
}

function lastEliteAiCommentUnix(parts, eliteAiId) {
  let t = 0;
  const elite = String(eliteAiId || '');
  for (const part of parts || []) {
    if (!part || part.part_type === 'note') continue;
    if (String((part.author || {}).id || '') !== elite) continue;
    if (String(part.part_type || '') !== 'comment') continue;
    if (!stripHtml(part.body || '')) continue;
    const at = Number(part.created_at || 0);
    if (at > t) t = at;
  }
  return t;
}

function clientRequestedLiveAgentAfterLastElite(parts, ids) {
  const lastElite = lastEliteAiCommentUnix(parts, ids && ids.eliteAiId);
  for (const part of parts || []) {
    if (!part) continue;
    const a = part.author || {};
    if (a.type !== 'user' && a.type !== 'lead') continue;
    const at = Number(part.created_at || 0);
    if (lastElite && at <= lastElite) continue;
    if (clientRequestedLiveAgent(stripHtml(part.body || ''))) return true;
  }
  return false;
}

/**
 * Same send condition as index.js 3763-3772.
 * Ids are synthetic caller inputs, not read from the runtime.
 */
function decideFixedMessageHandoff(ctx) {
  const input = ctx || {};
  const parts = input.parts || [];
  const text = stripHtml(input.latestText || '');
  const ids = {
    arsalId: String(input.arsalId || ''),
    eliteAiId: String(input.eliteAiId || ''),
  };
  const handoff = finHandoffInHistory(parts, ids);
  const liveNow = clientRequestedLiveAgent(text);
  const liveAfter = clientRequestedLiveAgentAfterLastElite(parts, ids);
  const vague = isVagueOrLiveAgentOnlyAsk(text);
  const arsalSpoke = arsalHasPublicClientReply(parts, ids.arsalId);
  const humanSpoke = teammateHandoffGates.humanTeammateAlreadyRepliedPublic(parts, ids);
  const send = !arsalSpoke && !humanSpoke && (handoff || liveNow || liveAfter) && vague;
  const base = {
    version: STATUS.candidate,
    frozen: true,
    approved: false,
    release: false,
    behaviorChange: false,
    silent: false,
  };
  if (!send) {
    return Object.assign(base, {
      action: 'allow',
      message: null,
      reason: 'gate_closed',
    });
  }
  return Object.assign(base, {
    action: 'fixed_message',
    message: lockedFinHandoffWelcome(input.clientName, text),
    reason: 'fixed_handoff_welcome',
  });
}

module.exports = {
  STATUS,
  isVagueOrLiveAgentOnlyAsk,
  firstNameFromClient,
  lockedFinHandoffWelcome,
  finHandoffInHistory,
  decideFixedMessageHandoff,
};
