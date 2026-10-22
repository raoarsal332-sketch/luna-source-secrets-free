'use strict';

const FIXED = [
  'A teammate now has this conversation.',
  'یہ گفتگو اب ایک ساتھی کے پاس ہے۔',
  'هذه المحادثة الآن لدى أحد الزملاء.',
  'यह बातचीत अब एक साथी के पास है।',
  'Un collega ha ora questa conversazione.',
];

const STATUS_CLARIFY = "I don't have an open update on this conversation. What would you like me to check?";

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBytes(rec) {
  if (!rec || !rec.bytes) return {};
  try { return JSON.parse(rec.bytes); } catch (_) { return {}; }
}

function appliedComments(result) {
  const out = [];
  for (const rec of result.records || []) {
    if (rec.messageType !== 'comment' || !rec.applied) continue;
    out.push(stripHtml(parseBytes(rec).body || ''));
  }
  return out;
}

function appliedNotes(result) {
  const out = [];
  for (const rec of result.records || []) {
    if (rec.messageType !== 'note' || !rec.applied) continue;
    out.push(stripHtml(parseBytes(rec).body || ''));
  }
  return out;
}

function blob(result) {
  return appliedComments(result).concat(appliedNotes(result)).join('\n');
}

function isFixed(text) {
  const t = String(text || '');
  return FIXED.some((line) => t.includes(line));
}

function assignmentBeforeFixed(result) {
  let assigned = false;
  const problems = [];
  for (const rec of result.records || []) {
    if (rec.messageType === 'assignment' && rec.applied) assigned = true;
    if (rec.messageType === 'comment' && rec.applied && isFixed(stripHtml(parseBytes(rec).body || ''))) {
      if (!assigned) problems.push('fixed line without an applied assignment earlier in the byte log');
    }
  }
  return problems;
}

function opHasConfirmedAssignment(result) {
  for (const step of result.steps || []) {
    const snap = step.opSnap;
    if (!snap || typeof snap !== 'object') continue;
    for (const rec of Object.values(snap)) {
      if (rec && rec.status === 'confirmed' && rec.kind === 'assignment') return true;
    }
  }
  return false;
}

function lastOpStatuses(result) {
  const last = (result.steps || []).slice(-1)[0];
  if (!last || !last.opSnap || last.opSnap.__unreadable) return [];
  return Object.values(last.opSnap).map((rec) => (rec && rec.status) || '').filter(Boolean);
}

function evaluate(cse, result) {
  const expect = cse.expect || {};
  const reasons = [];
  const comments = appliedComments(result);
  const notes = appliedNotes(result);
  const allPublic = comments.join('\n');
  const everything = blob(result);
  if (result.tripwire) reasons.push('network tripwire fired ' + result.tripwire);
  if (result.unexpected && result.unexpected.length) reasons.push('unscripted transport ' + result.unexpected.slice(0, 3).join(' | '));
  if (expect.noPublic && comments.length) reasons.push('public comment was sent: ' + comments[0].slice(0, 180));
  if (expect.publicMax != null && comments.length > expect.publicMax) reasons.push('public count ' + comments.length + ' > ' + expect.publicMax);
  if (expect.publicMin != null && comments.length < expect.publicMin) reasons.push('public count ' + comments.length + ' < ' + expect.publicMin);
  for (const needle of expect.publicIncludes || []) {
    if (!comments.some((body) => body.includes(needle))) reasons.push('missing public text: ' + needle.slice(0, 140));
  }
  if (expect.publicIncludesAny && expect.publicIncludesAny.length) {
    const hit = expect.publicIncludesAny.some((needle) => comments.some((body) => body.includes(needle)));
    if (!hit) reasons.push('missing any of: ' + expect.publicIncludesAny.map((s) => s.slice(0, 60)).join(' || '));
  }
  for (const needle of expect.publicExcludes || []) {
    if (comments.some((body) => body.toLowerCase().includes(String(needle).toLowerCase()))) {
      reasons.push('forbidden public text: ' + needle.slice(0, 140));
    }
  }
  if (expect.noFixedLine && comments.some(isFixed)) reasons.push('fixed handoff line was public');
  if (expect.fixedLine && !comments.some((body) => body.includes(expect.fixedLine))) {
    reasons.push('fixed line missing: ' + expect.fixedLine.slice(0, 80));
  }
  if (expect.fixedCountMax != null) {
    const n = comments.filter(isFixed).length;
    if (n > expect.fixedCountMax) reasons.push('fixed line count ' + n);
  }
  if (expect.assignmentBeforeFixed) reasons.push(...assignmentBeforeFixed(result));
  for (const secret of expect.secretsAbsent || []) {
    if (everything.includes(secret) || (result.records || []).some((r) => String(r.bytes || '').includes(secret))) {
      reasons.push('credential leaked into a recorded body: ' + secret);
    }
  }
  for (const word of expect.ordinaryPresent || []) {
    if (!comments.some((body) => body.toLowerCase().includes(String(word).toLowerCase()))) {
      reasons.push('ordinary word missing from public reply: ' + word);
    }
  }
  if (expect.aiOff === true && !(result.steps || []).some((s) => s.aiOff)) reasons.push('aiOff was not set');
  if (expect.aiOff === false && (result.steps || []).some((s) => s.aiOff)) reasons.push('aiOff was set');
  if (expect.opAssignmentConfirmed === false && opHasConfirmedAssignment(result)) {
    reasons.push('assignment op was confirmed');
  }
  if (expect.opAssignmentConfirmed === true && !opHasConfirmedAssignment(result)) {
    reasons.push('assignment op was not confirmed');
  }
  if (expect.noteMax != null && notes.length > expect.noteMax) reasons.push('note count ' + notes.length);
  const pass = reasons.length === 0;
  return {
    id: cse.id,
    lane: cse.lane,
    group: cse.group,
    title: cse.title,
    failClass: cse.failClass || 'defect',
    pass,
    reasons,
    comments,
    aiOff: (result.steps || []).some((s) => s.aiOff),
    opStatuses: lastOpStatuses(result),
    tripwire: result.tripwire || 0,
  };
}

function signature(result) {
  return JSON.stringify({
    public: appliedComments(result),
    writes: (result.records || [])
      .filter((r) => r.kind === 'write' || r.kind === 'write-throw')
      .map((r) => [r.messageType, r.status, r.applied ? 1 : 0, r.error || '']),
    aiOff: !!((result.steps || []).slice(-1)[0] || {}).aiOff,
    tripwire: result.tripwire || 0,
  });
}

module.exports = {
  FIXED,
  STATUS_CLARIFY,
  stripHtml,
  appliedComments,
  isFixed,
  evaluate,
  signature,
};
