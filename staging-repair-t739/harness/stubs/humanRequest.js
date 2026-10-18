'use strict';
/** [ME] minimal human-request detector. */
const RE = /\b(?:human|real\s+person|live\s+agent|talk\s+to\s+(?:a\s+)?(?:person|someone|agent|teammate)|speak\s+to\s+(?:a\s+)?(?:person|human|agent))\b/i;
module.exports = require('./_generic').withFallback({ clientWantsHumanTeammate: (t) => RE.test(String(t || '')), isHumanRequest: (t) => RE.test(String(t || '')) }, 'humanRequest');
