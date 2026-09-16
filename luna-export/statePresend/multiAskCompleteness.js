'use strict';

const { stripHtml, extractQuestions, tokens, overlapRatio, extractTopics, isShortAck, uniq } = require('./textUtils');

function extractAsks(messages, opts) {
  const maxCarried = (opts && opts.maxCarried) || 3;
  const msgs = Array.isArray(messages) ? messages : [];
  let lastReplyIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'bot' || msgs[i].role === 'human') { lastReplyIdx = i; break; }
  const burst = [];
  for (let i = lastReplyIdx + 1; i < msgs.length; i++) {
    if (msgs[i].role !== 'client') continue;
    const text = stripHtml(msgs[i].text);
    if (!text || isShortAck(text)) continue;
    const qs = extractQuestions(text);
    if (qs.length) qs.forEach((q) => burst.push({ text: q, source: i, kind: 'question' }));
    else if (tokens(text).length >= 3) burst.push({ text, source: i, kind: 'statement' });
  }
  const carried = [];
  for (let i = 0; i < lastReplyIdx; i++) {
    if (msgs[i].role !== 'client') continue;
    for (const q of extractQuestions(msgs[i].text)) {
      const later = msgs.slice(i + 1).filter((m) => m.role === 'bot' || m.role === 'human').map((m) => m.text).join(' ');
      if (!isCovered(q, later)) carried.push({ text: q, source: i, kind: 'question', carried: true });
    }
  }
  const dedupe = (arr) => { const out = []; for (const a of arr) if (!out.some((b) => overlapRatio(tokens(a.text), tokens(b.text)) >= 0.8)) out.push(a); return out; };
  return { burst: dedupe(burst), carried: dedupe(carried).slice(-maxCarried), clientMessagesInBurst: msgs.slice(lastReplyIdx + 1).filter((m) => m.role === 'client').length };
}
function isCovered(ask, replyText, opts) {
  const threshold = (opts && opts.threshold) || 0.34;
  const askToks = tokens(ask); const replyToks = tokens(replyText);
  if (!askToks.length) return true;
  if (overlapRatio(askToks, replyToks) >= threshold) return true;
  if (askToks.length > 1) return false;
  const askTopics = extractTopics(ask); const replyTopics = extractTopics(replyText);
  return askTopics.length > 0 && askTopics.every((t) => replyTopics.includes(t));
}
function checkCoverage(draft, asks, opts) {
  const list = Array.isArray(asks) ? asks : [...(asks.burst || []), ...(asks.carried || [])];
  const covered = []; const missed = [];
  for (const a of list) (isCovered(a.text, draft, opts) ? covered : missed).push(a);
  return { asks: list, covered, missed, total: list.length };
}
function summarize(asks) { return uniq([...(asks.burst || []), ...(asks.carried || [])].map((a) => a.text)); }
module.exports = { extractAsks, checkCoverage, isCovered, summarize };
