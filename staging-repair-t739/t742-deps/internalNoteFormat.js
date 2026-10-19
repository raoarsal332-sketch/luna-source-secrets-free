'use strict';

/**
 * internalNoteFormat.js — single formatter for every Luna escalation / internal note.
 *
 * Order (Arsal 2026-09-29 / destination-aware 2026-09-30):
 *   Short (Risk / Jerry / Escalations): Account → Email → Problem
 *   Full (normal escalate): Account → Email → Problem → Action needed → Note (fixed footer)
 *
 * Account + Email share a single line break (no blank line between them).
 * Remaining fields keep a blank line between sections.
 *
 * Destination is decided from CURRENT Intercom admin/team assignee fields at note time
 * (not from conversation text). Callers pass destination or conversation + destinationIds.
 *
 * Never write bare "Account: Not provided". Callers must supply a real account
 * number or an explicit declined/annotated marker before formatting.
 *
 * The Note line is a code constant appended deterministically — never model-generated.
 */

const ESCALATE_NOTE_FOOTER =
  'If you are unable to resolve this issue, assign the ticket to Jerry and move it to the Escalations inbox.';

function boldNoteLabel(label) {
  return '<b>' + String(label || '') + '</b>';
}

function nlToBr(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br>');
}

function normalizeField(value, placeholder) {
  const v = String(value == null ? '' : value).trim();
  if (!v || /^not provided$/i.test(v) || /^n\/?a$/i.test(v) || /^unknown$/i.test(v)) {
    return placeholder || 'Not provided';
  }
  return v;
}

/** Bare / empty account values that must never appear after Account:. */
function isBareAccountPlaceholder(value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return true;
  if (/^not provided$/i.test(v)) return true;
  if (/^n\/?a$/i.test(v)) return true;
  if (/^unknown$/i.test(v)) return true;
  return false;
}

/**
 * Resolve note format destination from CURRENT Intercom assignee/inbox state.
 * ids: { riskTeamId, escalationsTeamId, jerryId, riskTeamAdminId, riskTeamAdminIds? }
 * @returns {{ short: boolean, reason: string }}
 */
function resolveNoteDestination(conversation, ids) {
  const cfg = ids || {};
  const riskTeamId = String(cfg.riskTeamId || '');
  const escalationsTeamId = String(cfg.escalationsTeamId || '');
  const jerryId = String(cfg.jerryId || '');
  const riskTeamAdminId = String(cfg.riskTeamAdminId || '');
  const riskAdmins =
    cfg.riskTeamAdminIds instanceof Set
      ? cfg.riskTeamAdminIds
      : new Set(
          Array.isArray(cfg.riskTeamAdminIds)
            ? cfg.riskTeamAdminIds.map(String)
            : riskTeamAdminId
              ? [riskTeamAdminId]
              : []
        );
  if (riskTeamAdminId) riskAdmins.add(riskTeamAdminId);

  const team =
    conversation && conversation.team_assignee_id != null
      ? String(conversation.team_assignee_id)
      : '0';
  const admin =
    conversation && conversation.admin_assignee_id != null
      ? String(conversation.admin_assignee_id)
      : '0';

  if (riskTeamId && team === riskTeamId) {
    return { short: true, reason: 'risk_inbox' };
  }
  if (admin !== '0' && (riskAdmins.has(admin) || (riskTeamAdminId && admin === riskTeamAdminId))) {
    return { short: true, reason: 'risk_assignee' };
  }
  if (escalationsTeamId && team === escalationsTeamId) {
    return { short: true, reason: 'escalations_inbox' };
  }
  if (jerryId && admin === jerryId) {
    return { short: true, reason: 'jerry_assignee' };
  }
  return { short: false, reason: 'normal' };
}

function isShortDestination(destination) {
  if (!destination) return false;
  if (destination === 'short' || destination === true) return true;
  if (typeof destination === 'object') return !!destination.short;
  return false;
}

/**
 * Pure escalate/CoS/Risk/Escalations internal-note HTML.
 * Account is required (real number or declined/annotated marker — never bare "Not provided").
 * Email may still be "Not provided" when truly unavailable.
 *
 * opts.destination: { short, reason } | 'short' | true — when short, omit Action needed + Note.
 * opts.conversation + opts.destinationIds: resolve destination at format time if destination omitted.
 */
function formatEscalateNoteHtml({
  problemText,
  email,
  account,
  actionHtml,
  destination,
  conversation,
  destinationIds,
} = {}) {
  const problem = String(problemText || '').trim() || 'Client needs backend / verification review.';
  const em = normalizeField(email, 'Not provided');
  const acct = String(account == null ? '' : account).trim();
  if (isBareAccountPlaceholder(acct)) {
    const err = new Error(
      'formatEscalateNoteHtml: usable account required (never bare Account: Not provided)'
    );
    err.code = 'MISSING_ACCOUNT_FOR_NOTE';
    throw err;
  }

  let dest = destination;
  if (dest == null && conversation) {
    dest = resolveNoteDestination(conversation, destinationIds || {});
  }
  const short = isShortDestination(dest);

  // Account + Email: single <br> (no blank line). Then blank line before Problem.
  const head =
    boldNoteLabel('Account:') + ' ' + acct + '<br>' + boldNoteLabel('Email:') + ' ' + em;
  if (short) {
    return [head, boldNoteLabel('Problem:') + '<br>' + nlToBr(problem)].join('<br><br>');
  }

  const action =
    String(actionHtml || '').trim() || 'Please review this case and guide the client.';
  const rest = [
    boldNoteLabel('Problem:') + '<br>' + nlToBr(problem),
    boldNoteLabel('Action needed:') + '<br>' + action,
    boldNoteLabel('Note:') + ' ' + ESCALATE_NOTE_FOOTER,
  ];
  return [head].concat(rest).join('<br><br>');
}

module.exports = {
  ESCALATE_NOTE_FOOTER,
  formatEscalateNoteHtml,
  boldNoteLabel,
  nlToBr,
  normalizeField,
  isBareAccountPlaceholder,
  resolveNoteDestination,
  isShortDestination,
};
