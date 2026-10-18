'use strict';
/** [ME] handoff-claim gate stand-in: no handoff is ever confirmed and no claim text is stripped. */
module.exports = {
  resolveHandoffStatus: () => 'none', claimsAllowed: () => false,
  gatePublicHandoffClaims: (text) => ({ text, hadClaim: false, stripped: false }),
  blocksGeneralFaqNoNote: () => false, HANDOFF_CLAIM_RE: /(?!)/, hasHandoffClaim: () => false, normalizeStatus: (x) => x,
  stripHandoffClaims: (t) => t, TRUTHFUL_NO_HANDOFF_FALLBACK: '', withoutFalseHandoffDenial: (t) => t,
};
