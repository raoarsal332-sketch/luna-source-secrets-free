'use strict';
/**
 * normalizeForRoute. One normalizer, match side only.
 * NFKC, strip format characters, UTS #39-style confusable skeleton except
 * ASCII Latin letters and ASCII digits, lowercase, then join a spaced
 * single-letter run. The frozen host string also maps U+00D7 (×) to "x"
 * and U+00B7 (·) to ".", and joins a single-letter run when the separators
 * are repeated. Does not rewrite catalog bodies or public comments.
 * Digit 0 is not rewritten. Latin m stays m. at0m stays not-a-claim.
 * The hand map in faqModuleDetectors.js is not used.
 */

const CONFUSABLES = new Map([
  ['\u0430', 'a'], ['\u0410', 'a'], ['\u0251', 'a'], ['\u03b1', 'a'], ['\u0391', 'a'],
  ['\u0435', 'e'], ['\u0415', 'e'], ['\u0437', 'e'], ['\u0417', 'e'], ['\u0454', 'e'],
  ['\u03b5', 'e'], ['\u0395', 'e'], ['\u0451', 'e'],
  ['\u0456', 'i'], ['\u0406', 'i'], ['\u0457', 'i'], ['\u03b9', 'i'], ['\u0399', 'i'],
  ['\u0458', 'j'], ['\u0408', 'j'],
  ['\u043e', 'o'], ['\u041e', 'o'], ['\u03bf', 'o'], ['\u039f', 'o'], ['\u00ba', 'o'],
  ['\u0440', 'p'], ['\u0420', 'p'], ['\u03c1', 'p'], ['\u03a1', 'p'],
  ['\u0441', 'c'], ['\u0421', 'c'], ['\u0455', 's'], ['\u0405', 's'],
  ['\u0443', 'y'], ['\u0423', 'y'], ['\u0445', 'x'], ['\u0425', 'x'],
  ['\u04bb', 'h'], ['\u04ba', 'h'], ['\u043d', 'h'], ['\u041d', 'h'],
  ['\u043a', 'k'], ['\u041a', 'k'], ['\u03ba', 'k'], ['\u039a', 'k'],
  ['\u043c', 'm'], ['\u041c', 'm'],
  ['\u0442', 't'], ['\u0422', 't'], ['\u03c4', 't'], ['\u03a4', 't'],
  ['\u0432', 'b'], ['\u0412', 'b'], ['\u044c', 'b'],
  ['\u0491', 'r'], ['\u0433', 'r'],
  ['\u0501', 'd'], ['\u0500', 'd'],
  ['\u0261', 'g'], ['\u0262', 'g'],
  ['\u029f', 'l'], ['\u2113', 'l'], ['\u01c0', 'l'],
  ['\u0578', 'n'], ['\u057c', 'n'],
  ['\u044a', 'b'], ['\u044b', 'bl'],
  ['\u0461', 'w'],
  ['\u0475', 'v'], ['\u0474', 'v'],
  ['\u051b', 'q'], ['\u051a', 'q'],
  ['\u0561', 'w'],
  ['\u0585', 'o'],
  ['\u05d0', 'a'],
  ['\uff41', 'a'],
]);

function mathFold(cp) {
  const blocks = [
    [0x1d400, 0x1d419, 'A'],
    [0x1d41a, 0x1d433, 'a'],
    [0x1d434, 0x1d44d, 'A'],
    [0x1d44e, 0x1d467, 'a'],
    [0x1d468, 0x1d481, 'A'],
    [0x1d482, 0x1d49b, 'a'],
    [0x1d4d0, 0x1d4e9, 'A'],
    [0x1d4ea, 0x1d503, 'a'],
    [0x1d56c, 0x1d585, 'A'],
    [0x1d586, 0x1d59f, 'a'],
    [0x1d5a0, 0x1d5b9, 'A'],
    [0x1d5ba, 0x1d5d3, 'a'],
    [0x1d5d4, 0x1d5ed, 'A'],
    [0x1d5ee, 0x1d607, 'a'],
    [0x1d608, 0x1d621, 'A'],
    [0x1d622, 0x1d63b, 'a'],
    [0x1d63c, 0x1d655, 'A'],
    [0x1d656, 0x1d66f, 'a'],
    [0x1d670, 0x1d689, 'A'],
    [0x1d68a, 0x1d6a3, 'a'],
    [0x1d6a8, 0x1d6c0, 'A'],
    [0x1d6c2, 0x1d6da, 'a'],
    [0x1d6e2, 0x1d6fa, 'A'],
    [0x1d6fc, 0x1d714, 'a'],
    [0x1d71c, 0x1d734, 'A'],
    [0x1d736, 0x1d74e, 'a'],
    [0x1d756, 0x1d76e, 'A'],
    [0x1d770, 0x1d788, 'a'],
    [0x1d790, 0x1d7a8, 'A'],
    [0x1d7aa, 0x1d7c2, 'a'],
    [0x1d7ce, 0x1d7d7, '0'],
    [0x1d7d8, 0x1d7e1, '0'],
    [0x1d7e2, 0x1d7eb, '0'],
    [0x1d7ec, 0x1d7f5, '0'],
    [0x1d7f6, 0x1d7ff, '0'],
  ];
  for (const [lo, hi, base] of blocks) {
    if (cp >= lo && cp <= hi) {
      return String.fromCharCode(base.charCodeAt(0) + (cp - lo));
    }
  }
  return '';
}

function skeletonChar(ch) {
  const cp = ch.codePointAt(0);
  if (cp >= 0x30 && cp <= 0x39) return ch;
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return ch;
  if (cp === 0x00d7) return 'x';
  if (cp === 0x00b7) return '.';
  if (CONFUSABLES.has(ch)) return CONFUSABLES.get(ch);
  const math = mathFold(cp);
  if (math) return math;
  return ch;
}

function joinSpacedLetters(s) {
  return s.replace(/(?<![a-z0-9])(?:[a-z][ .\-_*\u00b7]+){2,}[a-z](?![a-z0-9])/g, (m) => m.replace(/[ .\-_*\u00b7]/g, ''));
}

function normalizeForRoute(text) {
  let s = String(text == null ? '' : text);
  try { s = s.normalize('NFKC'); } catch (_) { /* keep */ }
  s = s.replace(/\p{Cf}/gu, '');
  let out = '';
  for (const ch of s) out += skeletonChar(ch);
  out = out.toLowerCase();
  out = joinSpacedLetters(out);
  return out;
}

module.exports = { normalizeForRoute, skeletonChar };
