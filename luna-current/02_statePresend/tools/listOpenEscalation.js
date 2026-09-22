'use strict';

/**
 * tools/listOpenEscalation.js - read-only view of open escalation ticket fields.
 * Uses escalateGetter(conversationId) from configure opts when wired; also
 * merges escalated/waiting_for from conversation-state publicView when possible.
 */

const stateMod = require('../conversationState');

function createListOpenEscalation(opts) {
  opts = opts || {};

  async function list(_args, ctx) {
    ctx = ctx || {};
    const cid = ctx.conversationId;
    const wired = typeof opts.escalateGetter === 'function';

    let ticket = null;
    if (wired && cid) {
      try {
        ticket = opts.escalateGetter(cid);
      } catch (_) {
        ticket = null;
      }
    }

    let publicEsc = null;
    if (cid && typeof opts.getMessages === 'function') {
      try {
        const msgs = await opts.getMessages(cid);
        const images = typeof opts.getImages === 'function' ? safe(() => opts.getImages(cid)) : null;
        const full = stateMod.buildState(msgs, { images: images || undefined });
        const pv = stateMod.publicView(full);
        publicEsc = {
          escalated: !!pv.escalated,
          waiting_for: pv.waiting_for || null,
        };
      } catch (_) {
        /* ignore */
      }
    }

    if (!wired) {
      return {
        ok: false,
        error: 'escalate source not wired',
        open: !!(publicEsc && publicEsc.escalated),
        awaiting_teammate: null,
        problem: null,
        topic: null,
        topics: null,
        note_snippet: null,
        assignee_id: null,
        escalated_at: null,
        waiting_for: publicEsc ? publicEsc.waiting_for : null,
        guidance:
          'Escalate getter not wired; only conversation-state escalation flags available if any. Prefer get_state for waiting_for/escalated.',
      };
    }

    ticket = ticket && typeof ticket === 'object' ? ticket : {};
    const awaiting = !!ticket.escalateAwaitingFirstTeammate;
    const hasEsc = awaiting || !!ticket.lastEscalateAt;
    const open = hasEsc || !!(publicEsc && publicEsc.escalated);

    return {
      ok: true,
      open,
      awaiting_teammate: awaiting,
      problem: ticket.lastEscalateProblem || null,
      topic: ticket.lastEscalateTopic || null,
      topics: ticket.lastEscalateTopics || null,
      note_snippet: ticket.lastEscalateNoteSnippet || null,
      assignee_id: ticket.lastEscalateAssigneeId || null,
      escalated_at: ticket.lastEscalateAt || null,
      waiting_for: publicEsc ? publicEsc.waiting_for : null,
      allow_bot_related_until: ticket.allowBotRelatedAnswerUntil || null,
      guidance: open
        ? awaiting
          ? 'Escalation is open awaiting first teammate reply. Prefer holding/status behavior for related asks.'
          : 'Prior escalation on record. Check awaiting_teammate and waiting_for before answering.'
        : 'No open escalation ticket fields found.',
    };
  }

  return { list, spec };
}

function safe(fn) {
  try {
    return fn();
  } catch (_) {
    return null;
  }
}

const spec = {
  name: 'list_open_escalation',
  description:
    'Read open escalation ticket fields for this conversation (awaiting teammate, problem, topic, note snippet, assignee, timestamps). Use before answering when an escalation may already be open.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
};

module.exports = { createListOpenEscalation, spec };
