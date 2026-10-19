'use strict';

// A teammate's instruction is a conversation lease, not a one-turn command.
// Reconstruct it from Intercom's ordered history so restarts and webhook replays
// cannot silently lose ownership. No mutable duplicate state is required.
const handoff = require('./teammateHandoffGates');
const teammateTopicOwnership = require('./teammateTopicOwnership');

function text(body) {
  return String(body || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function isAssistInstruction(body) {
  const s = text(body);
  return /\b(?:assist|help)\s+(?:him|her|them|this\s+client|the\s+client|this\s+customer|the\s+customer)\b|\b(?:take\s+care\s+of|handle|look\s+after)\s+(?:this|him|her|them|the\s+client|this\s+client)\b|\b(?:keep|continue)\s+(?:helping|assisting)\b/i.test(s);
}

/* STOP_MENTION_STRIP_V1 (215476350121763): '@Arsal - Manager Stop' was not a STOP because only
 * 'Arsal' was stripped, leaving '- Manager Stop'. Strip ANY leading admin-mention form: @Token,
 * known seat names, an optional ' - Role' suffix, several mentions, and separators. */
const MENTION_NAME = String.raw`(?:@elite\s*ai|@[^\s,:;.!?]+|arsal|jerry|luna|elite\s*ai)`;
const MENTION_ROLE = String.raw`(?:\s*[-\u2013\u2014|]\s*(?:manager|admin|support|team|lead|agent|owner|ceo)\b)?`;
const LEADING_MENTIONS_RE = new RegExp(String.raw`^(?:\s*` + MENTION_NAME + MENTION_ROLE + String.raw`[\s,:;.!\-\u2013\u2014]*)+`, 'i');
function stripAdminMentions(body) {
  return String(body || '').replace(LEADING_MENTIONS_RE, '').trim();
}
const BARE_STOP_RE = /^(?:stop|off|bot\s*off|ai\s*off)\b(?!\s+(?:the|this|that|his|her|their|my|your|a|an|loss|out|limit|level|trading)\b)(?!-)/i;

function isStopInstruction(body) {
  if (teammateTopicOwnership.teammateSilenceDirective([{
    part_type: 'note', body, author: { type: 'admin' }, created_at: 0,
  }]).silenced) return true;
  const rest = stripAdminMentions(text(body));
  return BARE_STOP_RE.test(rest) || teammateTopicOwnership.teammateSilenceDirective([{
    part_type: 'note', body: rest, author: { type: 'admin' }, created_at: 0,
  }]).silenced;
}

function isClearEnd(body) {
  return handoff.isShortClientAckExpanded(body) && /\b(?:thanks?|thank\s*you|thankyou|thx|ty|resolved|all\s+good)\b/i.test(text(body));
}

function resolve(parts, opts) {
  let active = false;
  let reason = 'no-assist-instruction';
  let grantPartId = '';
  const list = (parts || []).map((p, i) => ({ p, i }))
    .sort((a, b) => Number(a.p.created_at || 0) - Number(b.p.created_at || 0) || a.i - b.i);
  for (const { p } of list) {
    const a = p.author || {};
    const body = p.body || '';
    if (p.part_type === 'note' && a.type === 'admin') {
      if (isStopInstruction(body)) { active = false; reason = 'explicit-stop'; continue; }
      if (opts && opts.isAuthorizedAdmin && opts.isAuthorizedAdmin(String(a.id || '')) &&
          opts.mentionsLuna && opts.mentionsLuna(body) && isAssistInstruction(body)) {
        active = true; reason = 'teammate-assist'; grantPartId = String(p.id || '');
      }
      continue;
    }
    if (!active) continue;
    // COURTESY_VS_SUBSTANTIVE_V1: only a substantive teammate public reply ends the
    // ASSIST lease. "Your welcome" / "No problem" after Luna already resolved is not
    // a takeover (live 215476246024547, Max).
    if (handoff.isHumanTeammatePublicReply(p, opts)) {
      if (handoff.classifyTeammatePublicReply(body) === 'substantive') {
        active = false; reason = 'human-takeover';
      }
      continue;
    }
    if ((a.type === 'user' || a.type === 'lead') && isClearEnd(body)) {
      active = false; reason = 'customer-ended';
    }
  }
  return Object.freeze({ active, reason, grantPartId });
}

/**
 * Clear new support intent: another question / another issue / a real FAQ.
 * A status ping on a case a human already took ("any update on my payout?") is not one.
 */
function hasNewSupportIntent(text) {
  const raw = handoff.stripHtml(text);
  const t = raw.replace(/[’‘]/g, "'");
  if (!t) return false;
  try {
    if (require('./reviewRequestFlow').isResolutionClosure(raw)) return false;
  } catch (_) { /* keep the structural checks below */ }
  if (handoff.isShortClientAckExpanded(t)) return false;
  if (/\b(?:any|an)\s+update\b/i.test(t) && !/\b(?:another|one more|1 more|new)\s+(?:question|issue|problem)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:one|1|another)\s+more\s+questions?\b/i.test(t)) return true;
  if (/\bi have\s+(?:a\s+|one\s+|1\s+)?(?:more\s+|another\s+)?(?:question|query|doubt)\b/i.test(t)) return true;
  if (/\b(?:another|new|different|separate)\s+(?:issue|problem|question|query|topic)\b/i.test(t)) return true;
  if (/\bsorr+y to disturb\b/i.test(t) && /\bquestion\b/i.test(t)) return true;
  if (/\?/.test(raw)) {
    if (/\b(?:update|status)\b/i.test(t) && t.split(/\s+/).length <= 14) return false;
    return true;
  }
  if (/\b(?:what is|what's|how (?:do|does|can|much)|is there|can i|do i need|is stop loss|minimum trade|fundedelite)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * COURTESY_VS_SUBSTANTIVE_V1: the old index.js early return treated any ended ASSIST
 * (human-takeover, explicit-stop, customer-ended) as a permanent mute. That skip is now
 * current-state only.
 *
 * Mute when a STOP is still in force, or when the latest teammate public handling is
 * still substantive and that episode was not closed and reopened.
 * A courtesy ack, a customer thank-you, or a new question after reopen does not mute.
 *
 * RESTART RACE (do not redesign): on 215476246024547 the thank-you turn would have
 * reached SEND_CLOSING_CHECK, and a process restart dropped that in-flight turn.
 * There is no separate recovery job. A later delivery of that same thank-you is not
 * suppressed just because a courtesy teammate line sits in history — this function
 * returns mute:false for that shape, so the closing check can still run if the
 * webhook is replayed. A webhook Intercom never redelivers is not reconstructed here.
 */
function shouldMuteEndedLease(ctx) {
  const c = ctx || {};
  const ownership = c.ownership || {};
  const silence = c.silence || {};
  // No ASSIST lease in history: leave silence / assignee / active-handling to the later gates.
  if (!ownership.grantPartId || ownership.active) {
    return { mute: false, reason: ownership.active ? 'lease-active' : 'no-grant' };
  }
  if (silence.silenced) return { mute: true, reason: 'explicit-stop' };
  if (ownership.reason === 'explicit-stop') return { mute: false, reason: 'stop-cleared' };

  const parts = c.parts || [];
  const idx = handoff.lastSubstantiveHumanIndex(parts, c.opts || {});
  const substantiveNow = idx >= 0 && !handoff.substantiveEpisodeClosedAfter(parts, idx);
  if (substantiveNow) return { mute: true, reason: 'human-takeover' };
  if (ownership.reason === 'human-takeover' && hasNewSupportIntent(c.latestText)) {
    return { mute: false, reason: 'new-support-intent' };
  }
  return { mute: false, reason: ownership.reason || 'ended-lease-reeval' };
}

module.exports = {
  stripAdminMentions,
  isAssistInstruction,
  isStopInstruction,
  isClearEnd,
  resolve,
  hasNewSupportIntent,
  shouldMuteEndedLease,
};
