'use strict';
/**
 * [ME] stand-in for continuousOwnership (not in the staging tree). Only what the exercised paths
 * need: STOP / ASSIST wording, mention stripping, and a lease that is never active/ended.
 * Ownership decisions in the tests come from the REAL ownershipBoundary, not from this stub.
 */
const STOP_RE = /^(?:@\S+\s*)*(?:stop|off|pause|mute|silence)\b[.!\s]*$|\b(?:stop\s+replying|do\s+not\s+reply|don'?t\s+reply|stop\s+responding)\b/i;
const ASSIST_RE = /\b(?:assist\s+this\s+client|take\s+over|you\s+can\s+assist)\b/i;
function isStopInstruction(body) { return STOP_RE.test(String(body || '').replace(/<[^>]+>/g, ' ').trim()); }
function isAssistInstruction(body) { return ASSIST_RE.test(String(body || '')); }
function stripAdminMentions(plain) { return String(plain || '').replace(/^(?:\s*(?:@\S+|arsal|luna|jerry(?:\s*-?\s*manager)?)[\s,:-]*)+/i, '').trim(); }
function resolve() { return { active: false, ended: false, state: 'none' }; }
function shouldMuteEndedLease() { return false; }
module.exports = require('./_generic').withFallback({ isStopInstruction, isAssistInstruction, stripAdminMentions, resolve, shouldMuteEndedLease }, 'continuousOwnership');
