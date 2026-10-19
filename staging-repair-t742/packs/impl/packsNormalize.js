'use strict';
/**
 * Host normalizer stand-in. The frozen contract puts this in
 * candidate/routeNormalizer.js, which the integration owner publishes.
 * claim() does not call this. It reads the host `normalized` string.
 *
 * Order from design (e), commit 46efb63b:
 * 1. NFKC
 * 2. Delete \p{Cf}
 * 3. UTS #39 skeleton, except ASCII Latin letters and ASCII digits
 *    are not skeleton-mapped (so `m` stays `m` and `0` stays `0`)
 * 4. Lowercase
 * 5. Join a run of single letters separated by space, dot, hyphen,
 *    underscore, asterisk, or middle dot, when the run does not touch
 *    a letter or digit on either side
 * No leetspeak pass.
 */

const SKELETON = Object.freeze({
  '\u00D7': 'x', // multiplication sign
  '\u00B7': '.', // middle dot
  '\u2219': '.', // bullet operator
  '\u22C5': '.', // dot operator
});

function skeletonChar(ch) {
  if (/^[A-Za-z0-9]$/.test(ch)) return ch;
  return Object.prototype.hasOwnProperty.call(SKELETON, ch) ? SKELETON[ch] : ch;
}

function joinSpacedLetters(s) {
  return s.replace(
    /(?<![a-z0-9])(?:[a-z][ .\-_*\u00B7]+)+[a-z](?![a-z0-9])/g,
    (run) => run.replace(/[ .\-_*\u00B7]/g, '')
  );
}

function normalizeForRoute(text) {
  const nfkc = String(text || '').normalize('NFKC');
  const stripped = nfkc.replace(/\p{Cf}/gu, '');
  let mapped = '';
  for (const ch of stripped) mapped += skeletonChar(ch);
  return joinSpacedLetters(mapped.toLowerCase());
}

module.exports = {
  normalizeForRoute,
  SKELETON,
};
