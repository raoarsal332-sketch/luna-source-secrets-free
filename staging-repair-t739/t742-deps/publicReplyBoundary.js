'use strict';

/**
 * PUBLIC_REPLY_BOUNDARY_V2 (2026-09-25, live 215476097914090): last check before a public Intercom
 * write. Internal guidance written for Luna ("we do not invent fee amounts", "Never use OCT35 for
 * Flash", role markers such as "ACTION_NEEDED:", validator/prompt vocabulary) must never reach a
 * customer. The earliest-layer fix removed those strings from the customer-facing promo replies;
 * this is defense in depth for any other path.
 *
 * It REMOVES only the offending lines/sentences and keeps the rest of the answer. It blocks the whole
 * send only when nothing legitimate is left, so a false match can never turn a correct reply into
 * silence. Patterns are instruction-voice or pipeline vocabulary only: ordinary customer advice
 * ("never share your password", "our internal review") is not matched.
 */

// Wrapper labels whose remainder IS the public answer: keep the text after the label.
const KEEP_AFTER_LABEL = /^\s*(?:BODY|CLIENT)\s*:\s*/i;
// Labels whose whole line is internal.
const ROLE_LINE = /^\s*(?:SYSTEM|DEVELOPER|INTERNAL\s+NOTE|VALIDATOR|RECOVERY|HARD\s+OVERRIDE|ACTION(?:_NEEDED)?|KIND)\s*:/i;
const PIPELINE_META = /\b(?:system\s+prompt|developer\s+(?:message|instruction)|hidden\s+(?:instruction|prompt)|validator|presend|postgate|fail[\s-]closed|model\s+draft|chain\s+of\s+thought|official\s+faq\s+context|hard\s+override|(?:private|internal)\s+(?:teammate\s+)?note)\b/i;
const INSTRUCTION_VOICE = /\b(?:we\s+do\s+not\s+invent|do\s+not\s+invent|never\s+invent|never\s+use\s+[a-z]{2,}\d+\s+for|do\s+not\s+say\s+(?:that\s+)?new50|do\s+not\s+dismiss\s+it|don'?t\s+tell\s+the\s+client|do\s+not\s+tell\s+the\s+client|mat\s+karo|mat\s+kaho|invent\s+nahi|client\s+report\s*:)/i;

function sentencesOf(line) {
  return String(line).split(/(?<=[.!?])\s+/);
}

// MEANINGFUL_CONTENT_V1 (2026-09-26, live 215476062944447 / 215476111763423): the old "at least 3
// whitespace-separated words" rule read a whole Japanese/Chinese sentence (no ASCII spaces) as ONE word
// and blocked it as "empty" (a Japanese escalation acknowledgement and a Japanese answer were never
// sent), and it also blocked a correct English "Yes." / "No.". Content is now measured language-
// agnostically: CJK/Thai-family characters are counted as characters, other scripts as words.
//  - Nothing removed: send when there is real text — at least 2 letters/digits in total and at least
//    one word or CJK character. Empty, emoji-only, punctuation-only, a single character, and bare
//    pipeline artifacts ("undefined", "[[SCOPE_DECLINE]]") are still blocked.
//  - Something was removed: the remnant must still be a real sentence (>= 3 word units, two CJK
//    characters counting as one unit), as before — a stripped draft never ships as a stub.
const DENSE_SCRIPT_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/gu;
const ARTIFACT_ONLY_RE = /^\s*(?:null|undefined|nan|\[object\s+object\]|true|false|\[\[[^\]]*\]\])\s*[.!]?\s*$/i;

function meaningfulSize(text) {
  const plain = String(text || '').replace(/<[^>]+>/g, ' ');
  const dense = (plain.match(DENSE_SCRIPT_RE) || []).length;
  const rest = plain.replace(DENSE_SCRIPT_RE, ' ');
  const words = rest.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const letters = (rest.match(/[\p{L}\p{N}]/gu) || []).length;
  return { dense, words, letters };
}

function hasMeaningfulContent(text, strict) {
  const t = String(text || '');
  if (!t.trim() || ARTIFACT_ONLY_RE.test(t)) return false;
  const m = meaningfulSize(t);
  if (strict) return m.words + Math.floor(m.dense / 2) >= 3;
  return m.letters + m.dense >= 2 && m.words + m.dense >= 1;
}

function screen(body) {
  const text = String(body || '');
  if (!text.trim()) return { ok: false, reason: 'empty', body: '', removed: [] };
  const removed = [];
  const kept = [];
  let bodyLabelSeen = false;
  for (let line of text.split('\n')) {
    if (ROLE_LINE.test(line)) { removed.push('role-marker'); continue; }
    if (KEEP_AFTER_LABEL.test(line)) {
      // With both CLIENT: and BODY: present, BODY is the internal summary of an escalation draft.
      const isBody = /^\s*BODY\s*:/i.test(line);
      if (isBody && /(?:^|\n)\s*CLIENT\s*:/i.test(text)) { removed.push('internal-body'); bodyLabelSeen = true; continue; }
      removed.push('role-label');
      line = line.replace(KEEP_AFTER_LABEL, '');
    } else if (bodyLabelSeen) {
      continue; // continuation lines of an internal BODY block
    }
    const good = sentencesOf(line).filter((sent) => {
      if (PIPELINE_META.test(sent)) { removed.push('pipeline-meta'); return false; }
      if (INSTRUCTION_VOICE.test(sent)) { removed.push('instruction-voice'); return false; }
      return true;
    });
    if (good.length || !line.trim()) kept.push(good.join(' '));
  }
  const out = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!out || !hasMeaningfulContent(out, removed.length > 0)) return { ok: false, reason: removed[0] || 'empty', body: '', removed };
  return { ok: true, reason: removed.length ? 'stripped:' + [...new Set(removed)].join(',') : 'public', body: out, removed };
}

module.exports = { screen, hasMeaningfulContent };
