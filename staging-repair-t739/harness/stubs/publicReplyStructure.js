'use strict';
/**
 * [ME] The formatting module is not in this tree. Identity keeps the draft
 * bytes so a later credential hold still sees them. It does not invent layout.
 */
const id = (text) => String(text == null ? '' : text);
module.exports = require('./_generic').withFallback({
  markdownHeadingsToBold: id,
  restructurePublicReply: id,
  boldKeyFiguresInBullets: id,
}, 'publicReplyStructure');
