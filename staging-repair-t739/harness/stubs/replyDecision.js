'use strict';
/** [ME] intent resolver stand-in: every turn is a plain informational question, no identity needed. */
module.exports = {
  resolve: ({ latestText }) => ({ kind: 'question', asks: [String(latestText || '')], accountContext: false, needAccount: false, needEmail: false }),
  holdKind: () => null, needAccount: () => false, needEmail: () => false, requiresIdentity: () => false,
};
