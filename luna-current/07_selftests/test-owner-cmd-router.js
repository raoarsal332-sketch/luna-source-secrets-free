'use strict';
// Unit-test classifier/router (mirrors patched parseAuthorizedNoteCommand + mention gate)

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, '').trim();
}
function noteBodyMentionsAuthorized(htmlOrText) {
  const s = String(htmlOrText || '');
  if (/admin\/(?:10118526|8053416)\b/i.test(s)) return true;
  if (/entity_mention[^>]*>\s*[^<]*(Arsal|Jerry)/i.test(s)) return true;
  const plain = stripHtml(s);
  if (/(^|[^a-z])@(?:arsal|jerry)\b/i.test(plain)) return true;
  if (/\b(?:arsal|jerry(?:\s*-?\s*manager)?)\b/i.test(plain) && /@/.test(plain)) return true;
  return false;
}
function isEscalateOrSystemNote() { return false; }
function isBotAuthConfirmNote(plain) {
  const t = String(plain || '').trim();
  if (!t) return true;
  if (/^\[bot-ack\]/i.test(t)) return true;
  if (/^(okay|understood|got it|noted|sure|done|yes)\b/i.test(t)) return true;
  return false;
}
function stripOwnerMentionPrefix(plain) {
  return String(plain || '')
    .replace(/^(?:\s*(?:@\S+|arsal|jerry(?:\s*-?\s*manager)?))+\s*/i, '')
    .trim();
}

function polishOwnerDictatedClientBody(s) {
  let t = String(s || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}
function extractOwnerSendToClientBody(plain) {
  const raw = String(plain || '');
  const stripped = stripOwnerMentionPrefix(raw);
  const hay = stripped + '\n' + raw;
  if (!/send\s+(?:this\s+)?(?:message|reply|this)\s+to\s+(?:the\s+)?client/i.test(hay)) return null;
  let m = raw.match(/\[([^\]]+)\]/);
  if (m && String(m[1] || '').trim()) return polishOwnerDictatedClientBody(String(m[1]).trim());
  m = raw.match(/["\u201C]([^"\u201D]+)["\u201D]/) || raw.match(/'([^']+)'/);
  if (m && String(m[1] || '').trim()) return polishOwnerDictatedClientBody(String(m[1]).trim());
  return null;
}
function parseAuthorizedNoteCommand(plain, opts) {
  const raw = String(plain || '').trim();
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t || isBotAuthConfirmNote(t)) return null;
  if (isEscalateOrSystemNote(t)) return null;
  const stripped = stripOwnerMentionPrefix(raw);
  let sm = stripped.match(/^REPLY\s*[:\-]\s*([\s\S]+)/i);
  if (sm && String(sm[1] || '').trim()) return { cmd: 'REPLY', body: String(sm[1]).trim() };
  sm = stripped.match(/^NOTE\s*[:\-]\s*([\s\S]+)/i);
  if (sm && String(sm[1] || '').trim()) return { cmd: 'NOTE', body: String(sm[1]).trim() };
  const sendBody = extractOwnerSendToClientBody(raw);
  if (sendBody) return { cmd: 'REPLY', body: sendBody };
  if (/^(?:SKIP)\b/i.test(stripped) || /\bskip\s+(this|the)\s+(ticket|one|message|chat)\b/i.test(t)) {
    return { cmd: 'SKIP', body: '' };
  }
  if (/\b(re-?open|open)\b.+\b(ticket|chat|conversation)\b/i.test(t) || /\b(re-?open|open)\s+(this|it)\b/i.test(t)) {
    return { cmd: 'OPEN', body: '' };
  }
  if (
    /\b(resume|unpause|bot\s*on|ai\s*on|start\s+replying|keep\s+replying|re-?enable\s+replies)\b/i.test(t) ||
    /\byou\s+can\s+reply\s+now\b/i.test(t) ||
    /\b(please\s+)?reply\s+now\b/i.test(t) ||
    /\byou\s+may\s+reply\b/i.test(t) ||
    /\bcontinue\s+replying\b/i.test(t) ||
    /\bcontinue\s+to\s+assist\b/i.test(t) ||
    /\b(can|may)\s+continue\s+to\s+assist\b/i.test(t) ||
    /\bassist\s+this\s+client\b/i.test(t) ||
    /\bkeep\s+(helping|assisting)\b/i.test(t) ||
    /\bturn\s+(the\s+)?(bot|ai|replies)\s+on\b/i.test(t) ||
    /\bunmute\b/i.test(t)
  ) return { cmd: 'RESUME', body: '' };
  if (/\b(close)\b.+\b(ticket|chat|conversation)\b/i.test(t) || /\bclose\s+(this|it)\b/i.test(t)) {
    return { cmd: 'CLOSE', body: '' };
  }
  if (
    /\b(stop|pause|don'?t|do\s+not|never)\b.+\b(reply|replies|respond|responses|answering)\b/i.test(t) ||
    /\b(bot\s*off|ai\s*off|stay\s+silent|go\s+silent|silence\s+here|no\s+more\s+replies)\b/i.test(t) ||
    /\b(stop\s+replying|pause\s+responses?|don'?t\s+reply)\b/i.test(t) ||
    /^(?:STOP|OFF)\b/i.test(stripped)
  ) return { cmd: 'STOP', body: '' };
  if (/\bare\s+you\s+there\b/i.test(t) || /\byou\s+there\??/i.test(t) || /\bping\b/i.test(t)) {
    return { cmd: 'PING', body: '' };
  }
  if (
    /\b(please|pls)\b/i.test(t) ||
    /\b(make\s+sure|prioritize|assign|snooze|tag|forward|escalate)\b/i.test(t) ||
    /\byou\s+(should|must|need\s+to)\b/i.test(t)
  ) return { cmd: 'FOLLOW', body: '' };
  const mentioned = opts && opts.mentionsAuthorized;
  if (mentioned && t.length >= 8) {
    let rest = t
      .replace(/@(?:arsal|jerry)\b/gi, ' ')
      .replace(/\b(?:arsal|jerry)(?:\s*-?\s*manager)?\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (rest.length >= 6 && !/^(ok|okay|thanks|thank you|noted|yes|no)\.?$/i.test(rest)) {
      return { cmd: 'FOLLOW', body: '' };
    }
  }
  return null;
}

function route(rawBody, authorOk) {
  const mentions = noteBodyMentionsAuthorized(rawBody);
  if (!authorOk) return { ignored: true, reason: 'not-author' };
  if (!mentions) return { ignored: true, reason: 'no-mention' };
  const plain = stripHtml(rawBody);
  const parsed = parseAuthorizedNoteCommand(plain, { mentionsAuthorized: mentions });
  return { ignored: !parsed, parsed };
}

const cases = [
  { name: 'plain note no mention', body: 'summarize this ticket in a note', authorOk: true, expectIgnore: true },
  { name: '@Arsal summarize → FOLLOW', body: '@Arsal summarize this ticket in a note', authorOk: true, expectCmd: 'FOLLOW' },
  { name: '@Jerry STOP', body: '@Jerry STOP', authorOk: true, expectCmd: 'STOP' },
  { name: '@Jerry stop replying', body: '@Jerry please stop replying', authorOk: true, expectCmd: 'STOP' },
  { name: 'fixed REPLY', body: '@Arsal REPLY: Hello, thanks for waiting.', authorOk: true, expectCmd: 'REPLY', expectBody: 'Hello, thanks for waiting.' },
  { name: 'fixed NOTE', body: '@Arsal NOTE: Internal summary here', authorOk: true, expectCmd: 'NOTE', expectBody: 'Internal summary here' },
  { name: 'entity mention FOLLOW', body: '<a class="entity_mention" href="//app.intercom.com/apps/h2z8cgfr/admin/10118526">Arsal</a> analyze this ticket', authorOk: true, expectCmd: 'FOLLOW' },
  { name: 'other admin ignored author', body: '@Arsal STOP', authorOk: false, expectIgnore: true },
  { name: 'OPEN ticket', body: '@Arsal open this ticket', authorOk: true, expectCmd: 'OPEN' },
  { name: 'SKIP', body: '@Arsal SKIP', authorOk: true, expectCmd: 'SKIP' },
  { name: 'RESUME', body: '@Jerry resume', authorOk: true, expectCmd: 'RESUME' },
  {
    name: 'send this message to client brackets',
    body: '@Arsal Can you please send this message to client [ office closed in Italy, the client will be assisted tomorrow]',
    authorOk: true,
    expectCmd: 'REPLY',
    expectBody: 'Office closed in Italy, the client will be assisted tomorrow.',
  },
  {
    name: 'send message to client quotes',
    body: '@Arsal send this message to client "we will help you tomorrow"',
    authorOk: true,
    expectCmd: 'REPLY',
    expectBody: 'We will help you tomorrow.',
  },
];

let fail = 0;
for (const c of cases) {
  const r = route(c.body, c.authorOk);
  let ok = true;
  let detail = JSON.stringify(r);
  if (c.expectIgnore) {
    ok = !!r.ignored;
  } else if (c.expectCmd) {
    ok = !r.ignored && r.parsed && r.parsed.cmd === c.expectCmd;
    if (ok && c.expectBody) ok = r.parsed.body === c.expectBody;
  }
  console.log(ok ? 'PASS' : 'FAIL', c.name, detail);
  if (!ok) fail++;
}

// --- extractOwnerSendToClientBody unit checks ---
const extractCases = [
  {
    name: 'extract brackets Italy',
    in: '@Arsal Can you please send this message to client [ office closed in Italy, the client will be assisted tomorrow]',
    out: 'Office closed in Italy, the client will be assisted tomorrow.',
  },
  {
    name: 'extract no match without send phrase',
    in: '@Arsal please summarize [internal only]',
    out: null,
  },
];
for (const c of extractCases) {
  const got = extractOwnerSendToClientBody(c.in);
  const ok = got === c.out;
  console.log(ok ? 'PASS' : 'FAIL', c.name, JSON.stringify(got));
  if (!ok) fail++;
}

// --- Source assert: executeOwnerActionPlan REPLY must not use already-replied skip ---
const fs = require('fs');
const src = fs.readFileSync('/home/ubuntu/index.js', 'utf8');
const m = src.match(/async function executeOwnerActionPlan[\s\S]*?^}/m);
if (!m) {
  console.log('FAIL', 'executeOwnerActionPlan block missing');
  fail++;
} else {
  const block = m[0];
  const replyIdx = block.indexOf("if (action === 'REPLY')");
  const replyBlock = replyIdx >= 0 ? block.slice(replyIdx) : '';
  const bad =
    /postClientCommentOnce/.test(replyBlock) ||
    /arsalAlreadyRepliedAfter/.test(replyBlock) ||
    /ensureFirstReplyWelcomeIntro/.test(replyBlock);
  const good = /postReply\(conversationId,\s*'comment'/.test(replyBlock) && /Sent to client/.test(replyBlock);
  const ok = !bad && good;
  console.log(ok ? 'PASS' : 'FAIL', 'executeOwnerActionPlan REPLY bypasses already-replied', { bad, good });
  if (!ok) fail++;
}

// Auth-note structured REPLY path also bypasses
const authReply = src.match(/\} else if \(cmd === 'REPLY'\) \{[\s\S]*?acted = 'REPLY';/);
if (!authReply) {
  console.log('FAIL', 'AUTH_NOTE REPLY block missing');
  fail++;
} else {
  const b = authReply[0];
  const bad = /postClientCommentOnce/.test(b) || /ensureFirstReplyWelcomeIntro/.test(b);
  const good = /postReply\(conversationId,\s*'comment'/.test(b);
  const ok = !bad && good;
  console.log(ok ? 'PASS' : 'FAIL', 'AUTH_NOTE REPLY bypasses already-replied', { bad, good });
  if (!ok) fail++;
}

process.exit(fail ? 1 : 0);

