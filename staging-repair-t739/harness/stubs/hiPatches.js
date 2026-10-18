'use strict';
/**
 * [ME] additions for [HI] modules. The historical snapshot predates some functions the staging
 * index.js calls; each missing function that is needed is defined here as the plainest possible
 * pass-through, and listed in the report.
 */
module.exports = {
  teammateHandoffGates: {
    isAssignedToProtectedTeam: (full, o) => {
      const t = String((full && full.team_assignee_id) || '');
      return !!t && t !== '0' && (t === String(o && o.riskTeamId) || t === String(o && o.escalationsTeamId));
    },
    shouldSkipWelcomeIntro: () => false,
    classifyTeammatePublicReply: () => 'substantive',
    consequentialEscalationBlock: () => null,
    escalationNoteContradictsResolution: () => false,
    humanReopenOwnership: () => false,
    humanTeammateSourceOpener: () => false,
    isHumanTeammateActivelyHandling: () => false,
    isTeammateClosingOrRating: () => false,
    lastSubstantiveHumanIndex: () => -1,
    scrubWrongAudienceStaffGreeting: (t) => t,
  },
  identityEscalateGates: {
    payoutRejectionRequiresAccount: (t) => /\bmy\b/i.test(t) && /\b(?:payouts?|withdrawals?)\b/i.test(t) && /\b(?:rejected|denied|declined)\b/i.test(t),
    clientCannotProvideAccountNumber: () => false,
    isAuthAccessIssue: (t) => /\b(?:log\s*in|password|access)\b/i.test(t) && /\b(?:issue|cannot|can't|forgot|reset|locked)\b/i.test(t),
    tradingAccountNumberRequired: () => false,
  },
  control: { setReplyAllowed() {}, isReplyAllowed: () => true, clearReplyAllowed() {} },
  textUtils: {
    withoutConcludedPastContext: (s) => s,
    stripQuotedHistory: (s) => s,
    classifySmallTalk: () => null,
    isReferentialFollowUp: () => false,
    isSocialSmallTalk: () => false,
    isSubstantialClearQuestion: (s) => /\?/.test(String(s || '')),
  },
};
