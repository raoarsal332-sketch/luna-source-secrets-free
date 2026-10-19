'use strict';

/**
 * PARTNERSHIP_INTENT_V2
 * Business collaboration (custom audience coupon, creator deal, IB / signals partnership,
 * partnership-team request, promotional accounts) is not an affiliate FAQ and not a
 * public promo question. Ordinary "how do I join / what is the commission" questions
 * and questions about the codes already on offer stay off this path.
 */

const LIMIT_LINE = "I can't approve a partnership, a custom coupon, or a free or funded account from here.";

function norm(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function isBareFollowUp(text) {
  const t = norm(text);
  if (!t) return false;
  return /^[\d][\d\s.-]{3,18}$/.test(t);
}

function isAffiliateAccountProblem(t) {
  if (!/\baffiliate\b/i.test(t)) return false;
  const problem = /\b(?:can(?:not|'?t)|unable|stuck|hasn'?t|has not|not\s+arrived|not\s+working|doesn'?t\s+work|wrong|invalid|failed|pending|locked)\b/i.test(t);
  const surface = /\b(?:log\s*in|login|sign\s*in|password|payout|dashboard|portal)\b/i.test(t);
  return problem && surface;
}

function isCheckoutPromoFailure(t) {
  const code = /\b(?:coupon|promo(?:tion)?\s+code|discount\s+code|new50|oct35|flash5|code)\b/i.test(t);
  const fail = /\b(?:not\s+working|isn'?t\s+working|doesn'?t\s+work|didn'?t\s+work|not\s+apply|does\s+not\s+apply|won'?t\s+apply|isn'?t\s+applying|not\s+applying|invalid)\b/i.test(t);
  return code && fail;
}

function hasCustomAudienceOffer(t) {
  if (/\bcustom\s+(?:coupon|discount|code|offer)s?\b/i.test(t)) return true;
  if (/\bexclusive\s+(?:coupon|code)\b/i.test(t) && /\b(?:my|our)\s+(?:audience|followers|community|subscribers|users|platform)\b/i.test(t)) return true;
  if (/\b(?:discount|coupon|code)s?\s+for\s+(?:my|our)\s+(?:followers|audience|subscribers|community|users)\b/i.test(t) && !/\b(?:told|mentioned|said)\s+me\b/i.test(t)) return true;
  if (/\bfor\s+(?:my|our)\s+followers\b/i.test(t) && /\b(?:discount|coupon|code)s?\b/i.test(t) && !/\btold\s+me\b/i.test(t)) return true;
  if (/\bfollowers\s+ke\s+liye\b/i.test(t) && /\b(?:custom\s+)?(?:coupon|discount|code)\b/i.test(t)) return true;
  if (/\bkortingscode\b/i.test(t) && /\bvolgers\b/i.test(t)) return true;
  return false;
}

function hasCreatorCollab(t) {
  const creator = /\b(?:content|contant)\s+creators?\b|\binfluencers?\b|\byoutubers?\b/i.test(t);
  if (!creator) return false;
  return /\b(?:collab(?:oration)?|collaborat\w*|funded\s+accounts?|free\s+accounts?|giveaways?|partnerships?|sponsor(?:ship)?|promot\w*)\b/i.test(t);
}

function hasPartnershipTeamAsk(t) {
  if (!/\bpartnership\s+team\b/i.test(t)) return false;
  if (/\b(?:do|does)\s+i\s+need\b/i.test(t) && /\b(?:discount|promo|code|coupon)\b/i.test(t)) return false;
  return true;
}

function hasJoinAsPartner(t) {
  return /\bjoin\s+as\s+(?:a\s+)?partner\b/i.test(t) || /\bpartner\s+ban(?:na)?\b/i.test(t);
}

function hasGiveawayAccounts(t) {
  return /\baccounts?\b/i.test(t) && /\b(?:giveaways?|promotional\s+activities)\b/i.test(t);
}

function hasCommunityPromoConnect(t) {
  const connect = /\b(?:connect|speak|talk|reach)\b/i.test(t) && /\bteam\b/i.test(t);
  const promo = /\bpromot\w*\b/i.test(t) && /\b(?:community|followers|audience|channel)\b/i.test(t);
  return connect && promo;
}

function hasFreeAccountForPromotion(t) {
  const wantsFree =
    /\b(?:free|complimentary|trial)\s+(?:or\s+trial\s+)?(?:account|funded\s+account|access)\b/i.test(t) ||
    /\bfree\s+account\s+or\s+trial\b/i.test(t) ||
    /\bfunded\s+accounts?\s+for\s+(?:the\s+)?collab/i.test(t) ||
    /\baccounts?\s+for\s+giveaways?\b/i.test(t);
  const promo = /\b(?:promot\w*|community|collab|partnership|giveaway)\b/i.test(t);
  return wantsFree && promo;
}

function hasRomanUrduCollab(t) {
  return /\bcollab(?:oration)?\s+karna\b/i.test(t) || /\bpartnership\s+team\s+se\b/i.test(t);
}

function hasDutchCollab(t) {
  if (/\bhoe\s+word\s+ik\s+affiliate\b/i.test(t) && !/\bvolgers\b/i.test(t) && !/\bsamenwerk/i.test(t)) return false;
  if (/\bkortingscode\b/i.test(t) && /\bvolgers\b/i.test(t)) return true;
  if (/\bik\s+wil\s+(?:een\s+)?(?:samenwerking|partnerschap)\b/i.test(t)) return true;
  if (/\b(?:samenwerking|samenwerken|partnerschap)\b/i.test(t) && /\b(?:aanvragen|influencer|volgers|community)\b/i.test(t)) return true;
  return false;
}

function hasIntroducingBroker(t) {
  return /\bintroducing\s+brokers?\b/i.test(t) || /\bIB\s+programs?\b/.test(t) || /\bib\s+programs?\b/i.test(t);
}

function hasBusinessCollaboration(t) {
  return /\bbusiness\s+collaborat/i.test(t) ||
    (/\bcollaborat\w*\b/i.test(t) && /\b(?:business|firm|company|brand)\b/i.test(t));
}

function hasSignalsOrFirmPartnership(t) {
  if (/\btrading\s+signals?\b/i.test(t) && /\b(?:partner|partnership|collaborat\w*)\b/i.test(t)) return true;
  if (/\bpartner\b/i.test(t) && /\bwith\s+(?:your|our)\s+(?:firm|company|brand)\b/i.test(t)) return true;
  if (/\bi\s+(?:want|would like)\s+to\s+partner\b/i.test(t) && /\b(?:firm|company|brand|signals?|program|you|your)\b/i.test(t) && !/\baffiliate\s+program\b/i.test(t)) return true;
  return false;
}

function isOrgPartnership(t) {
  return (
    hasIntroducingBroker(t) ||
    hasBusinessCollaboration(t) ||
    hasSignalsOrFirmPartnership(t) ||
    hasCreatorCollab(t) ||
    hasPartnershipTeamAsk(t) ||
    hasJoinAsPartner(t) ||
    hasGiveawayAccounts(t) ||
    hasCommunityPromoConnect(t) ||
    hasFreeAccountForPromotion(t) ||
    hasRomanUrduCollab(t) ||
    hasDutchCollab(t)
  );
}

function isSoftPromoQuestion(t) {
  if (/\b(?:can|may|could)\s+i\s+share\b/i.test(t) && /\b(?:code|coupon|discount|promo)\b/i.test(t) && !/\bcustom\b/i.test(t)) return true;
  if (/\b(?:followers|friends?|someone|people|community)\b[^.?\n]{0,50}\b(?:told|mentioned|said)\s+me\b/i.test(t) && /\b(?:discount|promo|code|coupon|offer)\b/i.test(t)) return true;
  if (/\btold\s+me\s+about\s+(?:your\s+)?(?:discount|promo|code|coupon)\b/i.test(t)) return true;
  if (/\bexclusive\s+discount\b/i.test(t) && /\b(?:returning|existing|new|brand-new)\s+clients?\b/i.test(t) && !/\b(?:my|our)\s+(?:followers|audience)\b/i.test(t)) return true;
  if (/\b(?:what|which)\s+(?:codes?|promos?|promotions?|discounts?|coupons?|offers?)\b/i.test(t)) return true;
  if (/\bcodes?\s+(?:are|is)\s+available\b/i.test(t)) return true;
  if (/\b(?:code|coupon|discount)\b/i.test(t) && /\b(?:share\s+it|share\s+the|our\s+community|the\s+community|public\s+code)\b/i.test(t) && !/\bcustom\b/i.test(t)) return true;
  return false;
}

function needsBusinessHandoff(text) {
  const t = norm(text);
  if (!t || isBareFollowUp(t)) return false;
  const org = isOrgPartnership(t);
  if ((isCheckoutPromoFailure(t) || isAffiliateAccountProblem(t)) && !org) return false;
  if (isSoftPromoQuestion(t) && !org && !hasCustomAudienceOffer(t)) return false;
  if (isSoftPromoQuestion(t) && hasCustomAudienceOffer(t) && !org && /\b(?:told|mentioned|said)\s+me\b/i.test(t) && !/\bcustom\b/i.test(t)) return false;
  return org || hasCustomAudienceOffer(t);
}

function blocksPromoAutoReply(text) {
  return needsBusinessHandoff(text);
}

function looksLikePublicPromoAsk(text) {
  if (needsBusinessHandoff(text)) return false;
  return isSoftPromoQuestion(norm(text));
}

function ordinaryAffiliateFaq(text) {
  if (needsBusinessHandoff(text)) return false;
  const t = norm(text);
  if (!t || isBareFollowUp(t)) return false;
  if (/\b(?:commission\s+structure|application\s+process|payment\s+terms|referral\s+commissions?)\b/i.test(t)) return true;
  if (/\bhow\s+(?:do|can|to)\s+i\s+join\b/i.test(t)) return true;
  if (/\bhow\s+(?:do|can)\s+i\s+become\s+(?:an?\s+)?affiliate\b/i.test(t)) return true;
  if (/\baffiliate\s+program\s+kaise\s+join\b/i.test(t)) return true;
  if (/\bkaise\s+join\b/i.test(t) && /\baffiliate\b/i.test(t)) return true;
  if (/\bhoe\s+word\s+ik\s+affiliate\b/i.test(t)) return true;
  if (/\bhow\s+does\s+(?:the\s+)?affiliate\s+(?:program|programme)\s+work\b/i.test(t)) return true;
  if (/\baffiliate\s+program\b/i.test(t) && t.length < 40) return true;
  if (/\bpartnership\s+opportunit/i.test(t) && /\b(?:commission|application|payment|requirements|affiliate\s+program)\b/i.test(t)) return true;
  return false;
}

function isAmbiguous(text) {
  const t = norm(text);
  if (!t || needsBusinessHandoff(t) || ordinaryAffiliateFaq(t)) return false;
  return /^(?:partnership|partner|affiliate)\??$/i.test(t);
}

function classify(text) {
  if (needsBusinessHandoff(text)) return { kind: 'business', blocksPromo: true, faq: false, ambiguous: false };
  if (ordinaryAffiliateFaq(text)) return { kind: 'affiliate_faq', blocksPromo: false, faq: true, ambiguous: false };
  if (isAmbiguous(text)) return { kind: 'ambiguous', blocksPromo: false, faq: false, ambiguous: true };
  return { kind: 'none', blocksPromo: false, faq: false, ambiguous: false };
}

module.exports = {
  LIMIT_LINE,
  classify,
  needsBusinessHandoff,
  blocksPromoAutoReply,
  looksLikePublicPromoAsk,
  ordinaryAffiliateFaq,
  isAmbiguous,
  isBareFollowUp,
};
