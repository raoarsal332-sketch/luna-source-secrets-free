'use strict';
/** [ME] no topic-level teammate ownership/silence. Ownership comes from the real ownershipBoundary. */
module.exports = {
  teammateSilenceDirective: () => ({ silenced: false }),
  teammateAnsweredPendingClient: () => false,
};
