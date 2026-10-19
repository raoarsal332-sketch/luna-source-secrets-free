'use strict';

// Pure ownership decision shared by intake and the final write boundary. Shared-seat
// identity is insufficient attribution: only confirmed Luna part IDs prove a bot action.
const co = require('./continuousOwnership');
const fs = require('fs');
const path = require('path');
const EVIDENCE_FILE = process.env.LUNA_OWNERSHIP_EVIDENCE_FILE ||
  (process.env.TICKET_STATE_FILE ? process.env.TICKET_STATE_FILE + '.ownership.json' : path.join(__dirname, 'ownership-evidence.json'));
const text = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const sec = (p) => Number(p.created_at || 0) > 1e12 ? Number(p.created_at) / 1000 : Number(p.created_at || 0);
const ordered = (parts) => (parts || []).map((p, i) => ({ p, i })).sort((a, b) => sec(a.p) - sec(b.p) || a.i - b.i).map((x) => x.p);

function isHuman(p, opts) {
  const a = p && p.author || {};
  if (a.type !== 'admin') return false;
  if (String(a.id || '') === String(opts.eliteAiId || '8052954')) return false;
  if (String(a.id || '') === String(opts.arsalId || '10118526')) return !(opts.isLunaAuthored && opts.isLunaAuthored(p));
  return true;
}

function evaluate(full, parts, opts = {}) {
  if (!full || !Array.isArray(parts)) return { blocked: true, reason: 'ownership-unavailable' };
  const list = ordered(parts);
  let owner = -1, grant = -1, stop = -1;
  for (let i = 0; i < list.length; i++) {
    const p = list[i], pt = p.part_type;
    const human = isHuman(p, opts);
    if (human && pt === 'note') {
      if (co.isStopInstruction(p.body)) { stop = i; continue; }
      if (opts.isAuthorizedGrant && opts.isAuthorizedGrant(p)) { grant = i; continue; }
    }
    if (pt === 'assignment' && p.assigned_to) {
      const to = String(p.assigned_to.id || '');
      // An explicit human assignment back to Luna is a hand-back. A bot's own
      // self-assignment or a stale ticket allowance cannot release human ownership.
      if (human && to === String(opts.arsalId || '10118526')) { grant = i; continue; }
      if (to && to !== '0' && p.assigned_to.type !== 'nobody_admin' &&
          to !== String(opts.arsalId || '10118526') && to !== String(opts.eliteAiId || '8052954')) owner = i;
    }
    if (human && pt === 'close') owner = i;
    if (human && ['comment', 'assignment', 'open'].includes(pt) && text(p.body)) {
      const h = require('./teammateHandoffGates');
      if (h.classifyTeammatePublicReply(p.body) === 'substantive') owner = i;
    }
  }
  if (stop >= 0 && stop >= grant) return { blocked: true, reason: 'stop-in-history' };
  if (grant > owner && grant > stop) return { blocked: false, reason: 'fresh-human-grant', grantPartId: String(list[grant].id || '') };
  // Intercom returns at most 500 recent parts. The omitted prefix may contain a
  // human takeover/close. An explicit later delegation can release that history;
  // otherwise the owner-approved uncertain-history policy is to hold.
  if (list.length >= 500) return { blocked: true, reason: 'ownership-history-limited' };
  const admin = full.admin_assignee_id == null ? '' : String(full.admin_assignee_id);
  const humanAssignee = admin && admin !== '0' && admin !== String(opts.arsalId || '10118526') && admin !== String(opts.eliteAiId || '8052954');
  if (humanAssignee || owner >= 0) {
    // A handoff confirmation is allowed only against its exact confirmed assignment
    // part, current destination, and no later human event. Every caller still GETs.
    const handoff = opts.handoff;
    if (handoff && handoff.partId && admin === String(handoff.target) &&
        list[owner] && String(list[owner].id) === String(handoff.partId) &&
        opts.isLunaAuthored && opts.isLunaAuthored(list[owner])) return { blocked: false, reason: 'own-handoff-confirmation' };
    return { blocked: true, reason: humanAssignee ? 'human-assignee' : 'human-history-owned', ownerPartId: owner >= 0 ? String(list[owner].id || '') : '' };
  }
  // An outbound human source can be the only visible human handling in the payload.
  if (full.source && isHuman(full.source, opts) && text(full.source.body)) return { blocked: true, reason: 'human-outbound-source' };
  return { blocked: false, reason: 'unowned' };
}

function confirmedParts(data, kind, body, target, seat = '10118526', previousIds) {
  if (!data || typeof data !== 'object') return [];
  // A Conversation response includes historical parts, not just our write.
  // Without the immediately-before snapshot we cannot attribute a matching old
  // human message. A direct conversation_part receipt identifies a single write.
  if (data.type !== 'conversation_part' && !Array.isArray(previousIds)) return [];
  const before = new Set(previousIds || []);
  const list = data.type === 'conversation_part' ? [data] :
    ((data.conversation_parts || {}).conversation_parts || (Array.isArray(data.conversation_parts) ? data.conversation_parts : []));
  const matches = list.filter((p) => p && p.id && !before.has(String(p.id)) && p.part_type === kind &&
    String((p.author || {}).id || '') === String(seat) &&
    (kind === 'assignment' ? String((p.assigned_to || {}).id || '') === String(target) :
      kind === 'close' || text(p.body) === text(body)));
  // Multiple matching new writes are ambiguous even at different timestamps: a
  // human using the shared seat may have sent the same text during our request.
  // Never select the newest match as a substitute for attribution evidence.
  return matches.length === 1 ? [{ id: String(matches[0].id), kind, at: sec(matches[0]) }] : [];
}

function loadEvidence() {
  try { return JSON.parse(fs.readFileSync(EVIDENCE_FILE, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}
function knownParts(conversationId) {
  return (loadEvidence()[String(conversationId)] || {}).parts || [];
}
function remember(conversationId, parts) {
  if (!parts.length) return;
  // Separate from ticket state: legacy handlers retain old ticket snapshots over
  // awaits, and must not overwrite newly confirmed attribution on a later save.
  const all = loadEvidence(), id = String(conversationId);
  const merged = new Map(((all[id] || {}).parts || []).map((p) => [String(p.id), p]));
  for (const p of parts) merged.set(String(p.id), { id: String(p.id), kind: p.kind, at: p.at });
  all[id] = { at: Date.now(), parts: [...merged.values()].slice(-120) };
  const ids = Object.keys(all).sort((a, b) => all[a].at - all[b].at);
  for (const old of ids.slice(0, Math.max(0, ids.length - 4000))) delete all[old];
  fs.mkdirSync(path.dirname(EVIDENCE_FILE), { recursive: true });
  const tmp = EVIDENCE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(all), { mode: 0o600 }); fs.renameSync(tmp, EVIDENCE_FILE);
}

module.exports = { evaluate, isHuman, confirmedParts, knownParts, remember, EVIDENCE_FILE };
