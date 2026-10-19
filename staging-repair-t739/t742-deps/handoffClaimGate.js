'use strict';

/**
 * HANDOFF_CLAIM_GATE_V2 (2026-10-07, Issue 2):
 * A public claim that someone was contacted, the case was forwarded, or the team will
 * update the client is allowed only when this turn proved a handoff, or ownership is
 * already active. Detection is semantic across EN/IT/ES/FR/DE/PT, including the
 * dependent promise that follows a stripped claim ("They'll update you…").
 *
 * Trusted status: none | already_active | note_created | assigned | note_and_assigned | failed
 */

const HANDOFF_STATUSES = Object.freeze([
  'none',
  'already_active',
  'note_created',
  'assigned',
  'note_and_assigned',
  'failed',
]);

const CLAIM_ALLOWED = new Set(['already_active', 'note_created', 'assigned', 'note_and_assigned']);

// English direct-claim detector kept from V1 so existing English forms stay covered.
const HANDOFF_CLAIM_RE =
  /\b(?:i|we)(?:['\u2019]ve|\s+have)\s+(?:already\s+)?(?:sent|passed|forwarded|escalated|shared|flagged|raised|asked|notified|pinged|looped\s+in)\b|\b(?:i|we)(?:['\u2019]ll|\s+will)\s+(?:pass|forward|escalate|send|share|flag|ask|notify|loop\s+in)\b|\b(?:i|we)(?:['\u2019]m|\s+am|\s+are)\s+(?:asking|forwarding|escalating|passing|sending|notifying)\b|\b(?:asked|asking)\s+(?:a\s+)?(?:support\s+)?(?:teammate|team\s+member|colleague|human)\b|\b(?:support\s+)?(?:teammate|team\s+member)\s+(?:to\s+)?(?:verify|confirm|check|review|look|investigate|help)\b|\b(?:our|the)\s+(?:\w+\s+)?(?:support\s+)?team\s+will\s+(?:confirm|review|check|get\s+back|update|reply|verify|look)\b|\bplease\s+wait\s+for\s+(?:confirmation|the\s+team|our\s+team|a\s+(?:support\s+)?teammate)\b|\b(?:i|we)\s+(?:have\s+)?(?:already\s+)?(?:escalated|forwarded)\b|\b(?:left|posted)\s+(?:an?\s+)?(?:internal\s+)?note\b|\b(?:assigned|assigning)\s+(?:this|it|your\s+(?:case|request|issue))\b/i;

// First-person completed handoff, language-agnostic enough for the languages Luna actually sends.
const HANDOFF_ACTION_RE =
  /\b(?:ho\s+inoltrat\w*|abbiamo\s+inoltrat\w*|ho\s+passat\w*\s+(?:la|il|quest|questa)|he\s+(?:pasado|enviado|derivado|escalado)|hemos\s+(?:pasado|enviado|escalado|derivado)|j['\u2019]ai\s+(?:transmis|transf\w*|escalad\w*)|nous\s+avons\s+(?:transmis|transf\w*|escalad\w*)|ich\s+habe\s+(?:.{0,40})?(?:weitergeleitet|eskaliert)|wir\s+haben\s+(?:.{0,40})?(?:weitergeleitet|eskaliert)|encaminhei|escalei|passei\s+(?:o|a|para|seu|sua))\b/i;

// Dependent promise: the sentence that survives a claim-only strip and is itself the false handoff.
const DEPENDENT_PROMISE_RE =
  /\bthey(?:['\u2019]ll|\s+will)\s+(?:update|review|check|confirm|get\s+back|reply|contact)\b|\byou(?:['\u2019]ll|\s+will)\s+(?:receive|get|hear)\s+(?:an?\s+)?(?:update|reply|response)\b|\b(?:i|we)(?:['\u2019]ll|\s+will)\s+update\s+you\b|\bwill\s+update\s+you\s+as\s+soon\s+as\b|\bonce\s+they(?:['\u2019]ve|\s+have)\s+(?:reviewed|checked|confirmed)\b|\balready\s+with\s+(?:the\s+|our\s+)?team\b|\bti\s+aggiorn\w*|\briceverai\s+un\s+aggiornamento\b|\bti\s+contatter\w*|\bte\s+(?:actualizar\w*|contactar\w*|avisar\w*|mantendr\w*\s+informad\w*)\b|\brecibir[a\u00e1]s\s+una\s+actualizaci[o\u00f3]n\b|\bvous\s+(?:serez\s+inform\w*|recevrez\s+une\s+mise\s+[a\u00e0]\s+jour|allez\s+recevoir)\b|\bl['\u2019]?\u00e9quipe\s+vous\s+(?:r\u00e9pondra|tiendra\s+inform\w*)\b|\bsie\s+(?:werden\s+sich\s+melden|erhalten\s+ein\s+update)\b|\bdas\s+team\s+(?:meldet\s+sich|aktualisiert\s+sie)\b|\beles\s+v[a\u00e3]o\s+(?:atualizar|rever|analisar)\b|\bvoc[e\u00ea]\s+receber[a\u00e1]\s+uma\s+atualiza[c\u00e7][a\u00e3]o\b/i;

// Third-person agent future. Present-tense process lines ("our team reviews payouts")
// and "can" conditionals do not match. Customer-directed verbs only.
const THIRD_PERSON_VERB =
  'update\\s+you|follow\\s+up(?:\\s+with)?(?:\\s+you)?|contact\\s+you|reach\\s+out(?:\\s+to)?(?:\\s+you)?|get\\s+back(?:\\s+to)?(?:\\s+you)?|look\\s+into(?:\\s+(?:this|it|your\\s+\\w+))?|review\\s+(?:this|it|your(?:\\s+\\w+)?)';
const THIRD_PERSON_AGENT_RE = new RegExp(
  '\\b(?:a|an|our|the)\\s+(?:support\\s+)?(?:teammate|team\\s+member|agent|specialist|team)(?:\\s+will|[\'\u2019]ll)\\s+(?:' + THIRD_PERSON_VERB + ')\\b' +
  '|\\bsomeone\\s+from\\s+(?:our|the)\\s+(?:support\\s+)?team(?:\\s+will|[\'\u2019]ll)\\s+(?:' + THIRD_PERSON_VERB + ')\\b',
  'i'
);

const TRUTHFUL_NO_HANDOFF_FALLBACK =
  "I can't confirm that specific case from here, and it has not been passed to a teammate.";

// Used when a human teammate already owns the ticket. Same first clause, without the denial.
const OWNED_TICKET_FALLBACK = "I can't confirm that specific case from here.";

const SOMEONE_WILL_RE =
  /\bsomeone\s+will\s+(?:be\s+in\s+touch(?:\s+soon)?|get\s+back(?:\s+to)?(?:\s+you)?)\b/i;

function claimsAllowed(status) {
  return CLAIM_ALLOWED.has(String(status || ''));
}

function normalizeStatus(status, ok) {
  const s = String(status || '');
  if (HANDOFF_STATUSES.indexOf(s) >= 0) return s;
  return ok ? 'note_and_assigned' : 'none';
}

/**
 * Proven outcome of this turn. Ownership already active allows a claim even when
 * this turn did not create a new note. A failed attempt with no ownership is `failed`.
 */
function resolveHandoffStatus(facts) {
  const f = facts || {};
  const note = !!f.noteOk;
  const assign = !!f.assignOk;
  if (note && assign) return 'note_and_assigned';
  if (note) return 'note_created';
  if (assign) return 'assigned';
  if (f.ownershipActive) return 'already_active';
  if (f.attempted) return 'failed';
  return 'none';
}

function statusFromOpts(opts) {
  const o = opts || {};
  if (o.handoffStatus && HANDOFF_STATUSES.indexOf(o.handoffStatus) >= 0) return o.handoffStatus;
  if (o.handoffSucceeded) return 'note_and_assigned';
  return 'none';
}

function legacyNegated(sentence) {
  const s = String(sentence || '');
  return (
    /\b(?:not|never|no|haven['\u2019]t|have\s+not|did\s+not|didn['\u2019]t|cannot|can['\u2019]t|without)\b(?:\s+\w+){0,5}\s+(?:forward|pass|escalat|sent|send|ask|assign|notif|inoltr|pasad|transmis|weitergeleitet|encaminh)/i.test(s) ||
    /\bnon\s+(?:ho|abbiamo)\s+(?:inoltrat|passat)/i.test(s) ||
    /\bno\s+(?:he|hemos)\s+(?:pasado|enviado|escalado|derivado)/i.test(s) ||
    /\bje\s+n['\u2019]ai\s+pas\b/i.test(s) ||
    /\b(?:nicht\s+weitergeleitet|nicht\s+eskaliert)\b/i.test(s) ||
    /\bn[a\u00e3]o\s+(?:encaminhei|escalei|passei)\b/i.test(s) ||
    /\b(?:has|have)\s+not\s+been\s+(?:passed|forwarded|escalated|sent)\b/i.test(s) ||
    /\bit\s+has\s+not\s+been\s+passed\b/i.test(s)
  );
}

function handoffNegated(sentence) {
  const s = String(sentence || '');
  return (
    legacyNegated(s) ||
    /\bniet\s+(?:doorgestuurd|doorgezet|doorgegeven)\b/i.test(s) ||
    /\bniet\b[^.!?]{0,30}\bdoor\b/i.test(s) ||
    /n['\u2019]a\s+pas\s+[\u00e9e]t[\u00e9e]\s+transmis/i.test(s) ||
    /n[a\u00e3]o\s+(?:foi\s+encaminhad|vou\s+(?:encaminhar|escalar|passar))/i.test(s) ||
    /\bnon\s+(?:inoltro|passo|giro)\b/i.test(s) ||
    /\bno\s+(?:reenv[\u00edi]o|paso|derivo|escalo)\b/i.test(s)
  );
}

// r83 detectors, with r83 negation only. Opener and question marks do not apply.
function legacyIsHandoffClaim(sentence) {
  const s = String(sentence || '').trim();
  if (!s) return false;
  if (legacyNegated(s)) return false;
  if (HANDOFF_CLAIM_RE.test(s)) return true;
  if (DEPENDENT_PROMISE_RE.test(s)) return true;
  if (HANDOFF_ACTION_RE.test(s)) return true;
  return false;
}

/**
 * Evidence-backed multilingual claims (NL/IT/ES/FR/PT + EN causative).
 * Each alternative is anchored to a handoff verb plus an object or target.
 * Probe sentences informed these patterns; held-out controls live in the selftest.
 */
function evidenceMultilingualClaim(sentence) {
  const s = String(sentence || '');
  const objectRe = /\b(?:vraag|verzoek|aanvraag|ticket|zaak|melding|dit|het)\b/i;
  const targetRe = /\b(?:team|collega|afdeling|controle|risk|finance|support|specialist)\b/i;
  const separable =
    (/\b(?:ik|we|wij)\s+(?:stuur|zet|geef|leg)\b[^.!?]{0,80}\bdoor\b/i.test(s) ||
      /\b(?:ik|we|wij)\s+leg\b[^.!?]{0,80}\bvoor\b/i.test(s)) &&
    objectRe.test(s) &&
    targetRe.test(s);
  if (separable) return true;
  // Passive forwarding needs a request/ticket object and a team target.
  // "wordt doorgestuurd naar je wallet" and "is doorgestuurd naar je spammap" are process lines.
  if (
    /\b(?:is|wordt|werd)\s+(?:al\s+)?(?:doorgestuurd|doorgezet|doorgegeven|ge[e\u00eb]scaleerd)\b/i.test(s) &&
    objectRe.test(s) &&
    targetRe.test(s)
  ) return true;
  // "krijg je hier" is the probe form. "krijg je een bericht per e-mail" is not a handoff.
  if (/\bkrijg\s+je\s+hier\s+(?:een\s+)?(?:update|bericht|reactie|antwoord)\b/i.test(s)) return true;
  if (/\b(?:een\s+)?collega\b[^.!?]{0,40}\b(?:neemt|zal|gaat)\b[^.!?]{0,40}\bcontact\b/i.test(s)) return true;
  if (
    /\b(?:we|wij|het\s+team|ze)\s+laten?\s+(?:je|u)\s+(?:het\s+)?weten\b/i.test(s) &&
    objectRe.test(s) &&
    targetRe.test(s)
  ) return true;
  // Present "inoltro" only with a request object and a team target. Bare "inoltro" is not a claim.
  if (
    /\binoltro\b/i.test(s) &&
    /\b(?:richiesta|pratica|segnalazione)\b/i.test(s) &&
    /\b(?:team|supporto|collega|specialista)\b/i.test(s)
  ) return true;
  if (/\b(?:passo|giro)\s+(?:la|il)\s+(?:richiesta|pratica|segnalazione)\b/i.test(s)) return true;
  if (/\b(?:reenv[\u00edi\u00ed]o|paso|derivo|escalo)\s+(?:tu|su|la|el)\s+(?:solicitud|consulta|caso|pregunta)\b/i.test(s)) return true;
  if (
    /\b(?:est|a\s+(?:d[\u00e9e]j[a\u00e0]\s+)?[\u00e9e]t[\u00e9e])\s+(?:d[\u00e9e]j[a\u00e0]\s+)?transmise?s?\b/i.test(s) &&
    /\b(?:dossier|demande|requ[e\u00ea]te|ticket|cas)\b/i.test(s) &&
    /(?:[\u00e9e]quipe|membre|support|coll[\u00e8e]gue|sp[\u00e9e]cialiste)/i.test(s)
  ) return true;
  if (/\bje\s+transmets\b/i.test(s) && /\b(?:dossier|demande|requ[e\u00ea]te|ticket|cas)\b/i.test(s)) return true;
  if (/\b(?:elle|il|l['\u2019]?[\u00e9e]quipe)\s+vous\s+fera\s+un\s+retour\b/i.test(s)) return true;
  if (/\bvou\s+(?:encaminhar|escalar|passar)\b/i.test(s)) return true;
  if (/\b(?:i|we)(?:['\u2019]ll|\s+will)\s+have\s+(?:the\s+|our\s+)?(?:\w+\s+)?team\s+(?:review|check|look|verify|confirm)\b/i.test(s)) return true;
  return false;
}

function isQuestion(sentence) {
  return /\?\s*$/.test(String(sentence || '').trim());
}

function isBareAffirmation(clause) {
  return /^(?:s[i\u00ec\u00ed])\s*[.!?]*$/i.test(String(clause || '').trim());
}

// Conditional and process openers for the NEW future patterns only.
// "Sì," / "Sí," / "Si," is an interjection, not "if". Spanish/Italian "Se" is not an opener.
function opensWithProcessConditional(sentence) {
  const s = String(sentence || '').trim();
  if (/^s[i\u00ec\u00ed]\s*,/i.test(s)) return false;
  return /^(?:if|als|si|wenn|caso|wanneer|once|when|after|unless|as\s+soon\s+as)\b/i.test(s);
}

// A process that happens only after the customer does something is not a handoff claim.
function customerMustActFirst(sentence) {
  const s = String(sentence || '');
  return (
    /\bonly\s+after\s+you\b/i.test(s) ||
    /\bafter\s+you\s+(?:open|submit|send|share|provide|complete|file|create)\b/i.test(s)
  );
}

// Quoted speech is the customer's words, not Luna's claim. Contractions (I'll, 'll) stay.
function textOutsideQuotes(sentence) {
  return String(sentence || '')
    .replace(/"[^"]*"/g, ' ')
    .replace(/\u201c[^\u201d]*\u201d/g, ' ')
    .replace(/(^|[\s([{\u2014-])['\u2018][^'\u2019]*['\u2019](?=$|[\s.,;:!?)\]])/g, '$1 ');
}

function isReportedSpeech(sentence) {
  const s = textOutsideQuotes(sentence);
  return (
    /\b(?:said|told|mentioned|wrote|stated|claimed)\s+(?:that\s+)?(?:the\s+)?(?:a\s+|an\s+)?(?:support\s+)?(?:agent|teammate|team\s+member|specialist|team)\b/i.test(s) ||
    /\b(?:customer|client)\s+said\b/i.test(s)
  );
}

// Completed first-person / past handoffs. Not subject to question or conditional exemptions.
function completedPastClaim(sentence) {
  const s = String(sentence || '');
  if (!s.trim() || handoffNegated(s)) return false;
  if (/\b(?:ik|we|wij)\s+(?:heb|hebben)\b[^.!?]{0,60}\b(?:doorgestuurd|doorgezet|doorgegeven|ge[e\u00eb]scaleerd|voorgelegd)\b/i.test(s)) return true;
  if (/\b(?:he|hemos)\s+reenviado\b/i.test(s)) return true;
  if (
    /\bse\s+ha\s+reenviado\b/i.test(s) &&
    /\b(?:solicitud|caso|consulta|pregunta)\b/i.test(s) &&
    /\b(?:equipo|soporte|team|colega)\b/i.test(s)
  ) return true;
  if (/\bfoi\s+encaminhad[oa]\b/i.test(s)) return true;
  return false;
}

function alwaysClaim(sentence) {
  const s = String(sentence || '').trim();
  if (!s) return false;
  if (legacyIsHandoffClaim(s) || completedPastClaim(s)) return true;
  // A negation that covers the whole sentence stays a non-claim, matching r83.
  if (legacyNegated(s)) return false;
  const parts = s.split(/,\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  return parts.some((p) => {
    const bare = p.replace(/[.!?]+$/, '').trim();
    if (!bare || isBareAffirmation(bare)) return false;
    return legacyIsHandoffClaim(bare) || legacyIsHandoffClaim(bare + '.') || completedPastClaim(bare) || completedPastClaim(p);
  });
}

function newFutureExempt(sentence) {
  const s = String(sentence || '').trim();
  if (!s) return true;
  if (isQuestion(s)) return true;
  if (opensWithProcessConditional(s)) return true;
  if (customerMustActFirst(s)) return true;
  if (isReportedSpeech(s)) return true;
  return false;
}

function matchesNewFuture(sentence) {
  const s = String(sentence || '');
  if (!s.trim() || handoffNegated(s)) return false;
  if (THIRD_PERSON_AGENT_RE.test(s)) return true;
  if (SOMEONE_WILL_RE.test(s)) return true;
  if (evidenceMultilingualClaim(s)) return true;
  return false;
}

function sentenceIsHandoffClaim(sentence) {
  const s = String(sentence || '').trim();
  if (!s) return false;
  if (alwaysClaim(s)) return true;
  // Exemptions apply only to the new future-tense third-person and passive patterns.
  if (newFutureExempt(s)) return false;
  if (matchesNewFuture(textOutsideQuotes(s))) return true;
  return false;
}

function withoutFalseHandoffDenial(text, teammateOwns) {
  const t = String(text || '');
  if (!teammateOwns) return t;
  if (t === TRUTHFUL_NO_HANDOFF_FALLBACK || /\bit has not been passed to a teammate\b/i.test(t)) {
    return OWNED_TICKET_FALLBACK;
  }
  return t;
}

function hasHandoffClaim(text) {
  const raw = String(text || '');
  if (!raw.trim()) return false;
  if (sentenceIsHandoffClaim(raw)) return true;
  return raw.split(/\n|(?<=[.!?])\s+/).some((part) => sentenceIsHandoffClaim(part));
}

function expandClauses(sentence) {
  const s = String(sentence || '').trim();
  if (!s || !sentenceIsHandoffClaim(s)) return [s];
  const parts = s.split(/,\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return [s];
  const flagged = parts.map((p) => sentenceIsHandoffClaim(p) || sentenceIsHandoffClaim(p + '.'));
  if (flagged.some(Boolean) && flagged.some((f) => !f)) return parts;
  return [s];
}

function clauseIsClaim(part) {
  const p = String(part || '').trim();
  if (!p) return false;
  return sentenceIsHandoffClaim(p) || sentenceIsHandoffClaim(p.replace(/[.!?]+$/, '')) || sentenceIsHandoffClaim(p + '.');
}

function stripSentence(sent) {
  const original = String(sent || '').trim();
  if (!original || !clauseIsClaim(original)) return original;
  const clauses = expandClauses(original);
  if (clauses.length < 2) return '';
  const kept = [];
  for (const c of clauses) {
    if (clauseIsClaim(c) || isBareAffirmation(c)) continue;
    const bare = String(c || '').replace(/[.!?]+$/, '').trim();
    if (bare && !isBareAffirmation(bare)) kept.push(bare);
  }
  if (!kept.length) return '';
  const term = (original.match(/[.!?]+$/) || ['.'])[0];
  const joined = kept.join(', ').replace(/\s{2,}/g, ' ').trim();
  return /[.!?]$/.test(joined) ? joined : joined + term;
}

function stripOnce(text) {
  return String(text || '')
    .split(/\n/)
    .map((line) => {
      if (!hasHandoffClaim(line)) return line;
      const kept = line
        .split(/(?<=[.!?])\s+/)
        .map((sent) => stripSentence(sent))
        .filter(Boolean)
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return /^\s*(?:[-*\u2022]\s*)?$/.test(kept) ? '' : kept;
    })
    .filter((line) => line.trim())
    .join('\n')
    .trim();
}

function stripHandoffClaims(text) {
  const raw = String(text || '');
  let next = stripOnce(raw);
  // Re-check the full remainder. A dependent promise can sit in a clause the first
  // split kept, or a second language form can survive the first pass.
  if (hasHandoffClaim(next)) next = stripOnce(next);
  if (hasHandoffClaim(next)) {
    next = String(next)
      .split(/\n/)
      .filter((line) => !hasHandoffClaim(line))
      .join('\n')
      .trim();
  }
  // A claim-only reply must not go out blank.
  if (!String(next || '').trim() && raw.trim()) return TRUTHFUL_NO_HANDOFF_FALLBACK;
  return next;
}

/**
 * Structural final gate. Claims stay only when status is already_active, note_created,
 * assigned, or note_and_assigned. `handoffSucceeded: true` without a status remains
 * the V1 alias for a proven handoff.
 * @returns {{ text: string, stripped: boolean, hadClaim: boolean, handoffStatus: string, reason?: string }}
 */
function gatePublicHandoffClaims(text, opts) {
  const raw = String(text || '');
  const hadClaim = hasHandoffClaim(raw);
  const handoffStatus = statusFromOpts(opts);
  if (!hadClaim) return { text: raw, stripped: false, hadClaim: false, handoffStatus };
  if (claimsAllowed(handoffStatus)) {
    return { text: raw, stripped: false, hadClaim: true, handoffStatus };
  }
  const next = stripHandoffClaims(raw);
  return {
    text: next,
    stripped: next !== raw.trim(),
    hadClaim: true,
    handoffStatus,
    reason: 'handoff_claim_removed_no_action',
  };
}

/**
 * Account-state work must not be answered as a general FAQ that only promises a handoff.
 * Safe general answers stay on the FAQ path. A numbered account plus a dashboard
 * discrepancy, or this client's own payout/card problem, does not.
 */
function looksLikeAccountStateDiscrepancy(text) {
  const t = String(text || '');
  if (!/\b\d{5,8}\b/.test(t)) return false;
  if (!/\b(?:account|conto|cuenta|compte|konto)\b/i.test(t)) return false;
  return /\b(?:while|whereas|however|but|discrepan|mismatch|does\s+not\s+match|doesn't\s+match|still\s+have\s+to|dashboard|shows?)\b/i.test(t);
}

function blocksGeneralFaqNoNote(latest, priorTexts) {
  const blob = [latest].concat(priorTexts || []).map((x) => String(x || '')).join('\n');
  if (!blob.trim()) return false;
  if (looksLikeAccountStateDiscrepancy(blob)) return true;
  if (/\bhow\s+(?:do|can|should|would)\s+i\b|\bhow\s+to\b/i.test(blob)) return false;
  if (
    /\b(?:i\s+(?:have|had)\s+requested|my)\b/i.test(blob) &&
    /\b(?:payout|payment|withdrawal)\b/i.test(blob) &&
    /\b(?:card|rise|cancell?ed|not\s+showing|what\s+can\s+be\s+done)\b/i.test(blob)
  ) {
    return true;
  }
  return false;
}

/** Pending-work language for review eligibility (includes false public handoff claims). */
function isPendingHandoffLanguage(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (hasHandoffClaim(t)) return true;
  return (
    /\b(?:i am|i'm|we are|we're)\s+check(?:ing)?\b/i.test(t) ||
    /\b(?:i'll|i will|we will|we'll)\s+(?:check|look|review|investigate|escalate|forward|update|ask|verify|confirm)\b/i.test(t) ||
    /\blet me (?:check|look|ask|escalate|confirm|verify)\b/i.test(t) ||
    /\blooking into\b/i.test(t) ||
    /\bget back to you\b/i.test(t) ||
    /\bunder review\b/i.test(t) ||
    /\bstill (?:reviewing|checking|looking|processing|waiting)\b/i.test(t) ||
    /\bwaiting (?:for|on) (?:the )?(?:team|finance|backend|approval|verification|support|teammate)\b/i.test(t) ||
    /\bonce (?:the team|we|finance|they|support|a teammate) (?:confirm|reply|finish|complete|verify)\b/i.test(t)
  );
}

/**
 * Client deferred an open issue to support / said they will come back — conversation not closed.
 */
function clientDeferredToSupport(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  return (
    /\b(?:i(?:['\u2019]ll| will)|we(?:['\u2019]ll| will)|gonna|going to)\s+(?:come\s+back|return|check\s+(?:back\s+)?(?:with|on)|follow\s+up)\b/i.test(t) ||
    /\bcome\s+back\s+to\s+check\b/i.test(t) ||
    /\bcheck\s+(?:with\s+)?(?:the\s+)?(?:support\s+)?(?:team|teammate)\b/i.test(t) ||
    /\bwait(?:ing)?\s+for\s+(?:the\s+)?(?:support\s+)?(?:team|teammate|human)\b/i.test(t)
  );
}

/**
 * Luna left an unresolved verification / platform / timezone issue in public text.
 */
function lunaLeftIssueOpen(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (isPendingHandoffLanguage(t)) return true;
  // Admitted inability + pending topic (timezone / platform) without resolution.
  if (/\bi can['\u2019]?t confirm\b/i.test(t) && /\b(?:timezone|time\s*zone|platform|utc|matchtrader|metatrader|mt5|tradelocker)\b/i.test(t)) {
    return true;
  }
  return false;
}

module.exports = {
  HANDOFF_STATUSES,
  HANDOFF_CLAIM_RE,
  HANDOFF_ACTION_RE,
  DEPENDENT_PROMISE_RE,
  TRUTHFUL_NO_HANDOFF_FALLBACK,
  OWNED_TICKET_FALLBACK,
  withoutFalseHandoffDenial,
  claimsAllowed,
  normalizeStatus,
  resolveHandoffStatus,
  hasHandoffClaim,
  stripHandoffClaims,
  gatePublicHandoffClaims,
  looksLikeAccountStateDiscrepancy,
  blocksGeneralFaqNoNote,
  isPendingHandoffLanguage,
  clientDeferredToSupport,
  lunaLeftIssueOpen,
};
