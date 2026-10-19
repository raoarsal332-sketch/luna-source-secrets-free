'use strict';

// Shared intent detector for explicit requests to hand the conversation to a person.
// It combines a handoff action with a human recipient, so asking "are you a real
// person?" remains an identity question rather than a handoff command.
const PERSON = '(?:human(?:\\s+support)?|real\\s+(?:person|agent)|actual\\s+agent|live\\s+agent|agent|advisor|manager|supervisor|teammate|support\\s+(?:person|agent|team)|someone\\s+else|somebody\\s+else|another\\s+(?:person|agent|teammate)|affiliate\\s+team)';
const ACTION = '(?:forward|transfer|connect|route|pass|hand\\s+over|hand\\s+off|put)';
const VERB = '(?:speak|talk|chat)';
const explicit = new RegExp('\\b(?:' + ACTION + ')\\b.{0,70}\\b(?:to|with)\\s+(?:a\\s+|an\\s+|the\\s+)?' + PERSON + '\\b|\\b' + VERB + '\\s+(?:to|with)\\s+(?:a\\s+|an\\s+|the\\s+)?' + PERSON + '\\b|\\b(?:want|need|request|prefer|have|give\\s+me)\\b.{0,30}\\b' + PERSON + '\\b', 'i');
const short = new RegExp('^\\s*(?:' + PERSON + ')(?:\\s+(?:please|here|now))?[.!?]*\\s*$', 'i');

function isHumanRequest(text) {
  const t = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (/\b(?:are|r|is)\s+(?:you|u|this)\s+(?:a\s+|an\s+)?(?:real\s+person|human|agent|bot|ai)\b/i.test(t) && !explicit.test(t)) return false;
  return explicit.test(t) || short.test(t);
}

module.exports = { isHumanRequest };
