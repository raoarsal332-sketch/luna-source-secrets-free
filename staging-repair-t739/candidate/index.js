'use strict';
require("./logRedact").install(); // LOG_REDACT_V1: stdout/stderr secret redaction only (2026-09-29)
/* STATE_PATH_GUARD_V1 — must run before ANY module reads these variables.
 * Live incident 2026-09-23 13:46–14:37 UTC: an agent restarted PM2 with `--update-env` from a shell
 * that had test variables exported, and the live bot ran for ~50 minutes on /tmp/luna-review-reg/*
 * state files and a staging prompt. Ticket/escalation/Risk-note memory was split off, which
 * produced duplicate Risk notes. The production process (this file, run as the entry point from
 * /home/ubuntu) now takes its state/prompt paths from ecosystem.config.js — the single declared
 * source — whatever the launching shell exported. Tests and staging trees are unaffected. */
const STATE_PATH_GUARD = { checked: false, enforced: [] };
(function enforceProductionStatePaths() {
  if (require.main !== module || __dirname !== '/home/ubuntu') return;
  let declared = null;
  try {
    const eco = require('./ecosystem.config.js');
    const app = (eco.apps || []).find((a) => a && a.name === 'intercom-bot');
    declared = app && app.env;
  } catch (e) {
    console.error('STATE_PATH_GUARD cannot read ecosystem.config.js:', 'class=' + (e && e.name || 'Error'));
    return;
  }
  if (!declared) return;
  STATE_PATH_GUARD.checked = true;
  const __v = require('./statePathGuard').validateDeclaredPaths(declared);
  if (!__v.ok) {
    // STATE_PATH_GUARD_V2: never enforce an unsafe declaration; leave the launch env and shout.
    console.error('STATE_PATH_DECLARATION_UNSAFE', JSON.stringify(__v.problems));
    STATE_PATH_GUARD.enforced.push('DECLARATION_UNSAFE');
    return;
  }
  for (const c of require('./statePathGuard').applyDeclaredStatePaths(process.env, declared)) {
    console.error('STATE_PATH_ENFORCED', c.key, 'launch env had', JSON.stringify(c.had), '-> using declared', c.now);
    STATE_PATH_GUARD.enforced.push(c.key);
  }
})();
/* LUNA_SPREAD_IMAGE_FIXES_V1:BEGIN:require */
const __spreadAskGate = require('./spreadAskGate');
const __imageAskGuard = require('./imageAskGuard');
const LUNA_SPREAD_IMAGE_FIXES_VERSION = 'spread-image-fixes-v1';
/* LUNA_SPREAD_IMAGE_FIXES_V1:END:require */
/* LUNA_STATE_PRESEND_V1:BEGIN:require */
const __statePresend = require('./statePresend/statePresend')
const { isGreetingOrSmallTalk } = require('./statePresend/textUtils');
const challengeVariantGuard = require('./challengeVariantGuard');
const replyDecision = require('./replyDecision');
const publicReplyBoundary = require('./publicReplyBoundary');
const humanRequest = require('./humanRequest');
const { isRepeatedClientQuestion, nearCopiedWording, protectedFactsMatch } = require('./repeatedClientQuestion');
const repeatTextUtils = require('./statePresend/textUtils');
const LUNA_STATE_PRESEND_VERSION = 'fresh-2026-09-16-botstop-owner-only-v1';
/* MICHAN_TEAMMATE_HANDOFF_V1:applied */
/* LUNA_STATE_PRESEND_V1:END:require */
/* LUNA_TOOLS_V1:BEGIN:require */
const lunaToolsRuntime = require('./lunaToolsRuntime');
// Reused from luna-codex-staging/webhookSecurity.js (Codex, 2026-09-18) rather than writing a
// second signature implementation. Scheme is Intercom's documented X-Hub-Signature:
// HMAC-SHA1 over the raw JSON body keyed with the app client secret.
const webhookSecurity = require('./webhookSecurity');
const webhookFastAck = require('./webhookFastAck');
/* LUNA_TOOLS_V1:END:require */
/* LUNA_MAINTAINER_V1:BEGIN:require */
// Observation only. Never mutates the reply, never throws, and does nothing
// when MAINTAINER_ENABLED=false. See luna-maintainer/README.md.
let __maintainer = { observe: () => [], sweepAnalytics: () => [] };
try { __maintainer = require('./luna-maintainer').create(); } catch (__e) { console.error('[maintainer] disabled:', 'class=' + (__e && __e.name || 'Error')); }
/* LUNA_MAINTAINER_V1:END:require */

/**
 * FRESH Luna engine - fresh-2026-09-16-botstop-owner-only-v1 (audit harden: promo SCOPE reset gate + note email + spread FP + bot-stop + FAQ fallthrough + identity strip)
 * Behavior = system-prompt.txt only (FINAL + Arsal client name).
 * Formatting + scope-decline + escalate note/tag in code; behavior otherwise from system-prompt.txt.
 */
require('dotenv').config();
const fs = require('fs');
const dns = require('dns');
const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');
const modelConfig = require('./modelConfig');
/* LUNA_RESPONSES_V1:BEGIN:require
 * Every OpenAI generation call in this file goes through lunaModel. It builds the
 * /v1/responses request, enforces the MEDIUM reasoning floor and MEDIUM verbosity centrally,
 * parses the typed output, and returns the Chat-Completions shape the call sites below still
 * read (ai.choices[0].message.content). LUNA_API_MODE=chat is the release-level rollback. */
const lunaModel = require('./lunaResponsesTransport');
const imageEvidence = require('./imageEvidence'); /* IMAGE_EVIDENCE_V1 */
const lunaEpisode = require('./lunaEpisode');
/* LUNA_RESPONSES_V1:END:require */
const control = require('./control');
const writeOpStore = require('./writeOpStore');
const publicCredentialHold = require('./publicCredentialHold'); /* PUBLIC_CREDENTIAL_HOLD_V1 (t739) */
const f1AbstainMark = require('./f1AbstainMark'); /* T742 F1: flag-off exclusive stays silent on later writes */
const faqModuleGates = require('./faqModuleGates'); /* FAQ_MODULE_GATES_V1 (t739): hook for Packs/Atom detectors */
/* LOG_TEXT_REDACTION_V1 (t739): customer and model text never go to logs. Reason codes, lengths and
 * non-sensitive ids only. */
function logLen(value) { return '[redacted len=' + String(value == null ? '' : value).length + ']'; }
function icErrorCodes(data) {
  try {
    const errs = data && Array.isArray(data.errors) ? data.errors : [];
    return errs.map((e) => String((e && e.code) || '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40)).filter(Boolean).slice(0, 5).join(',');
  } catch (_) { return ''; }
}
function credentialHoldLog(url, hold) {
  const cid = (String(url || '').match(/conversations\/(\d+)/) || [])[1] || '';
  console.error(...publicCredentialHold.logLine(cid, hold));
}
// Design lines 282 and 573. A staff command that does not send posts
// note.staff.hold with a boundary code. CRED_* is not a note code, so an
// unapproved staff reply uses NOT_APPROVED_OUTPUT. Automated holds do not
// call this.
function staffCommandHoldNote(code) {
  return publicCredentialHold.staffHoldNote(code) || publicCredentialHold.staffHoldNote('NOT_APPROVED_OUTPUT');
}
function credentialHoldForWrite(method, url, data) {
  const cid = (String(url || '').match(/conversations\/(\d+)/) || [])[1] || '';
  return publicCredentialHold.holdOutgoingPayload(method, data, { conversationId: cid });
}
let faqKb = null;
try {
  faqKb = require('./faq-kb');
} catch (_) {
  faqKb = null;
}
let septemberPromos = null;
try {
  septemberPromos = require('./september-promos');
} catch (_) {
  septemberPromos = null;
}
let partnershipIntent = null;
try {
  partnershipIntent = require('./partnershipIntent');
} catch (_) {
  partnershipIntent = null;
}
const idGates = require('./identityEscalateGates');
const prePurchaseGate = require('./prePurchaseGate'); /* PREPURCHASE_ACCOUNT_V1 */
const assistantIdentityGuard = require('./assistantIdentityGuard');
const escalateProblemPolish = require('./escalateProblemPolish');
const riskNoteGate = require('./riskNoteGate');
const policyFactGuard = require('./policyFactGuard');
const tradingStagePolicy = require('./tradingStagePolicy');
const accountNumberPrefer = require('./accountNumberPrefer');
const internalNoteFormat = require('./internalNoteFormat'); /* NOTE_FORMAT_V1: Account→Email→Problem→Action→fixed Note */
const softEdges = require('./softEdges');
const publicResponseContract = require('./publicResponseContract');
const contextualFollowUp = require('./contextualFollowUp');
const variantComparisonCompleteness = require('./variantComparisonCompleteness');
const productComparison = require('./productComparison');
const publicRestatementGuard = require('./publicRestatementGuard');
const escalateRelatedOnly = require('./escalateRelatedOnly');
/* MICHAN_TEAMMATE_HANDOFF_V1:BEGIN:require */
const teammateHandoffGates = require('./teammateHandoffGates');
const atomicJsonFile = require('./atomicJsonFile'); /* ATOMIC_STATE_V1 */
const accountCheckRequest = require('./accountCheckRequest'); /* ACCOUNT_CHECK_REQUEST_V1 */
const reviewRequestFlow = require('./reviewRequestFlow'); /* REVIEW_REQUEST_FLOW_V1 */
const teammateTopicOwnership = require('./teammateTopicOwnership'); /* TEAMMATE_TOPIC_OWNERSHIP_V1 */
const continuousOwnership = require('./continuousOwnership');
const generalAccountAskGuard = require('./generalAccountAskGuard'); /* GENERAL_ACCOUNT_ASK_GUARD_V1 */
const teammateAudit = require('./teammateAudit');
const teammateAdmins = require('./teammateAdmins');
/* MICHAN_TEAMMATE_HANDOFF_V1:END:require */

const app = express();
app.use(express.json({ limit: '2mb', verify: webhookSecurity.captureRawBody }));
// MODEL_TEST_GUARD_V1: returns the client unchanged inside the PM2 intercom-bot process; wraps it
// (bounded, production-yielding) when index.js is loaded by a test/replay harness.
const openai = require('./modelTestGuard').guardClient(new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000,
  maxRetries: 2,
}), { label: 'index.js' });
/* LUNA_RESPONSES_V1:BEGIN:startup-config
 * A bad effort/verbosity environment must fail at boot, loudly, instead of quietly producing
 * a downgraded customer runtime. In responses mode this throws and PM2 shows the reason. */
modelConfig.assertValidStartupConfig();
/* LUNA_RESPONSES_V1:END:startup-config */
control.mount(app);

const ARSAL_ID = '10118526';
const ELITE_AI_ID = '8052954';
const ESCALATIONS_TEAM_ID = '9629759';
const RISK_TEAM_ID = '10675195';
const SKIP_TEAM_IDS = new Set(); // Payouts (11195250) allowed to reply , Arsal 2026-09-13
const ESCALATIONS_SILENCE_SEC = 15 * 60; // 15 minutes with no team reply
const ESCALATIONS_MIN_CLIENT_MSGS = 3;
const LONG_MSG_WORD_MIN = 150; // Escalations + Jerry: long client msg summary note
const RISK_SILENCE_SEC = 15 * 60; // Risk: 15m no team reply
const RISK_MIN_CLIENT_MSGS = 3; // same bar as Escalations — ignore short 1–2 line pings

const icHeaders = () => ({
  Authorization: 'Bearer ' + process.env.INTERCOM_ACCESS_TOKEN,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'Intercom-Version': '2.11',
});

const IC_TIMEOUT_MS = 20000;
const IC_MAX_RETRY = 2;

/* INTERCOM_AUTH_SHORTCIRCUIT_V1 (2026-09-24): Intercom auth state learned from responses the bot already
 * receives (no extra API calls). 401/403 marks auth DOWN; any 2xx marks it UP again. While it is down a
 * reply can never be delivered (the send path must re-fetch the conversation, which also fails), so the
 * handler skips the model and defers the event for replay. Live 2026-09-23 19:06-20:35: every event
 * still ran the model (~24-73k tokens/min) and the send was then dropped as refetch-unavailable. */
const intercomAuth = {
  downSince: 0,
  lastStatus: 0,
  markFailure(status) {
    if (status !== 401 && status !== 403) return;
    if (!this.downSince) { this.downSince = Date.now(); console.log('INTERCOM_AUTH_DOWN', status); }
    this.lastStatus = status;
  },
  markOk() {
    if (!this.downSince) return;
    console.log('INTERCOM_AUTH_UP after', Math.round((Date.now() - this.downSince) / 1000) + 's');
    this.downSince = 0;
    this.lastStatus = 0;
    setImmediate(() => { replayAuthDeferred('auth-recovered').catch((e) => console.error('AUTH_REPLAY_ERR', 'class=' + (e && e.name || 'Error'))); });
  },
  isDown() { return this.downSince > 0; },
};
const AUTH_DEFERRED_FILE = require('path').join(require('path').dirname(TICKET_STATE_FILE_FOR_AUTH()), 'auth-deferred.json');
function TICKET_STATE_FILE_FOR_AUTH() { return process.env.TICKET_STATE_FILE || '/home/ubuntu/bot-ticket-state.json'; }
const AUTH_DEFERRED_MAX_AGE_MS = 6 * 3600 * 1000;
const AUTH_DEFERRED_MAX = 200;
function deferForAuth(conversationId) {
  try {
    const all = atomicJsonFile.readJsonSafe(AUTH_DEFERRED_FILE, { fallback: {}, label: 'auth-deferred' }) || {};
    const id = String(conversationId || '');
    if (!id) return;
    if (!all[id]) all[id] = { firstAt: Date.now() };
    all[id].lastAt = Date.now();
    const keys = Object.keys(all).sort((a, b) => (all[a].lastAt || 0) - (all[b].lastAt || 0));
    while (keys.length > AUTH_DEFERRED_MAX) delete all[keys.shift()];
    atomicJsonFile.writeJsonAtomic(AUTH_DEFERRED_FILE, all, { lastGood: false });
  } catch (e) { console.error('AUTH_DEFER_WRITE_FAIL', conversationId, 'class=' + (e && e.name || 'Error')); }
}
let __authReplayRunning = false;
/** Re-run the normal handler once for every conversation deferred during an auth outage. Every gate
 *  applies again (pause, aiOff, teammate ownership, already-replied dedupe), so nothing is sent twice. */
async function replayAuthDeferred(reason) {
  if (__authReplayRunning || intercomAuth.isDown()) return { replayed: 0 };
  __authReplayRunning = true;
  let replayed = 0;
  try {
    const all = atomicJsonFile.readJsonSafe(AUTH_DEFERRED_FILE, { fallback: {}, label: 'auth-deferred' }) || {};
    const ids = Object.keys(all).sort((a, b) => (all[a].lastAt || 0) - (all[b].lastAt || 0));
    if (!ids.length) return { replayed: 0 };
    console.log('AUTH_REPLAY start', reason, ids.length);
    atomicJsonFile.writeJsonAtomic(AUTH_DEFERRED_FILE, {}, { lastGood: false });
    for (const id of ids) {
      if (intercomAuth.isDown()) { deferForAuth(id); continue; } // outage again: keep it deferred
      if (Date.now() - (all[id].lastAt || 0) > AUTH_DEFERRED_MAX_AGE_MS) { console.log('AUTH_REPLAY skip stale', id); continue; }
      const req = { body: { topic: 'conversation.user.replied', data: { item: { id } } }, headers: {}, __authReplay: true };
      const res = { sendStatus() { return this; }, status() { return this; }, json() { return this; }, send() { return this; } };
      try { await handleWebhook(req, res); replayed += 1; } catch (e) { console.error('AUTH_REPLAY_ERR', id, 'class=' + (e && e.name || 'Error')); }
      await new Promise((r) => setTimeout(r, Number(process.env.LUNA_AUTH_REPLAY_GAP_MS || 2000)));
    }
    console.log('AUTH_REPLAY done', replayed);
  } finally { __authReplayRunning = false; }
  return { replayed };
}

function approvedCommentHold(method, data, opScope, url) {
  if (['get', 'head', 'options'].includes(String(method || 'get').toLowerCase())) return null;
  if (!data || data.message_type !== 'comment') return null;
  const boundary = require('./publicWriteBoundary');
  const conversationId = (String(url || '').match(/conversations\/(\d+)/) || [])[1] || '';
  const verdict = boundary.assertApprovedPublicOutput(data, { opScope, conversationId });
  boundary.logDecision(verdict, data);
  if (verdict && verdict.ok) return null;
  return boundary.denyResult(verdict);
}

async function icRequest(method, url, data, tag, opScope, retryPermission) {
  const faqVeto = faqAssistance.privilegedVeto((String(url).match(/conversations\/(\d+)/) || [])[1], data && data.message_type || 'other-write');
  if (!['get','head','options'].includes(String(method).toLowerCase()) && faqVeto) return faqVeto;
  if (!['get','head','options'].includes(String(method).toLowerCase()) && data && data.message_type === 'comment') {
    const __f1Cid = (String(url).match(/conversations\/(\d+)/) || [])[1] || '';
    if (__f1Cid && f1AbstainMark.blocksConversation(__f1Cid)) {
      return { ok: false, skipped: true, held: true, unknown: false, reason: 'f1-english-module-off', delivery: 'not-attempted' };
    }
    if (__f1Cid && ownershipWriteLock.commentBlocked(__f1Cid)) {
      return { ok: false, skipped: true, held: true, unknown: false, reason: 'ownership-lock', delivery: 'not-attempted' };
    }
  }
  // PUBLIC_CREDENTIAL_HOLD_V1: nothing credential-bearing reaches the fast-ack store or the transport.
  const __credHold = credentialHoldForWrite(method, url, data);
  if (__credHold) { credentialHoldLog(url, __credHold); return publicCredentialHold.holdResult(__credHold); }
  const __approvedHold = approvedCommentHold(method, data, opScope, url);
  if (__approvedHold) return __approvedHold;
  // Fast-ack worker only. Direct handleWebhook / pollers / sync mode have no event
  // context, so this returns the existing request unchanged.
  if (!webhookFastAck.currentStore()) return icRequestUnguarded(method, url, data, tag, opScope, retryPermission);
  let gate = null;
  try {
    gate = await webhookFastAck.prepareCustomerWrite({
      method,
      url,
      data,
      tag,
      opScope,
      fetchConversation: (id) => fetchConversation(id),
    });
  } catch (e) {
    if (e && (e.code === 'CRASH_INJECTED' || e.code === 'CRASH_PROCESS')) throw e;
    webhookFastAck.markGateError(e);
    const err = new Error('gate-error');
    err.code = 'FASTACK_GATE';
    throw err;
  }
  if (gate && gate.shortCircuit) return gate.result;
  const result = await icRequestUnguarded(method, url, data, tag, opScope, retryPermission);
  if (gate && gate.token) {
    // A denied retry did not perform a write. `skipped` is not evidence of a
    // completed customer write; recoverable read failures must remain retryable.
    const receipt = result && result.skipped && !result.ok && !result.unknown ? { ...result, skipped: false } : result;
    await webhookFastAck.finishCustomerWrite(gate.token, receipt);
  }
  return result;
}

async function icRequestUnguarded(method, url, data, tag, opScope, retryPermission) {
  // Reads and consequential writes need different retry policies. The old loop retried a
  // POST after a timeout or a 5xx, but in both cases the remote side may already have
  // ACCEPTED it, so a retry could post a second reply/note/assignment. Intercom documents no
  // idempotency key for these endpoints, so an ambiguous write is reported as unknown rather
  // than repeated. A 429 is a rejection (nothing was applied), so it stays retryable.
  const isWrite = !['get', 'head', 'options'].includes(String(method || 'get').toLowerCase());
  let last = { status: 0, data: null };
  let ambiguous = false;
  let opId = null;

  if (isWrite) {
    // PUBLIC_CREDENTIAL_HOLD_V1: last check on the exact payload, before any op record is created.
    const __credHold = credentialHoldForWrite(method, url, data);
    if (__credHold) { credentialHoldLog(url, __credHold); return publicCredentialHold.holdResult(__credHold); }
    opId = writeOpStore.opKey(method, url, data, opScope);
    const prev = writeOpStore.get(opId);
    if (writeOpStore.shouldSkipReplay(prev)) {
      console.error('IC_REQ_REPLAY_SUPPRESSED', tag, url, prev && prev.status);
      return {
        ok: prev.status === 'confirmed',
        unknown: prev.status !== 'confirmed',
        skipped: true,
        status: prev.status === 'confirmed' ? 200 : 0,
        data: null,
      };
    }
    writeOpStore.set(opId, { status: 'pending', scoped: !!opScope });
  }

  for (let attempt = 0; attempt <= IC_MAX_RETRY; attempt += 1) {
    if (isWrite) {
      const backendDenied = await faqAssistance.backendPermission((String(url).match(/conversations\/(\d+)/) || [])[1], data && data.message_type || 'other-write');
      if (backendDenied) { if (opId) writeOpStore.set(opId,{status:'failed',reason:backendDenied.reason,scoped:!!opScope}); return backendDenied; }
    }
    // A 429 proved the previous write was rejected. It does not preserve permission
    // across the backoff: a teammate/STOP/aiOff may have intervened meanwhile.
    if (isWrite && attempt > 0) {
      let denied;
      try {
        denied = retryPermission ? await retryPermission() : { ok: false, skipped: true, reason: 'missing-retry-permission' };
      } catch (_) { denied = ownershipUnavailableResult('retry-permission-unavailable'); }
      if (denied) {
        if (opId) writeOpStore.set(opId, { status: 'failed', reason: denied.reason, scoped: !!opScope });
        return denied; // No new POST happened; do not label this an ambiguous write.
      }
    }
    try {
      // PUBLIC_CREDENTIAL_HOLD_V1: the non-bypassable stage. Every public write attempt,
      // including retries, is judged on the exact payload about to be handed to axios.
      if (isWrite) {
        const __attemptHold = credentialHoldForWrite(method, url, data);
        if (__attemptHold) {
          credentialHoldLog(url, __attemptHold);
          if (opId) writeOpStore.set(opId, { status: 'failed', reason: 'credential-hold', scoped: !!opScope });
          return publicCredentialHold.holdResult(__attemptHold);
        }
        const __approvedAttempt = approvedCommentHold(method, data, opScope, url);
        if (__approvedAttempt) {
          if (opId) writeOpStore.set(opId, { status: 'failed', reason: __approvedAttempt.holdCode, scoped: !!opScope });
          return __approvedAttempt;
        }
      }
      const r = await axios({
        method,
        url,
        data,
        headers: icHeaders(),
        timeout: IC_TIMEOUT_MS,
        validateStatus: () => true,
      });
      last = r;
      if (r.status < 400) intercomAuth.markOk(); else intercomAuth.markFailure(r.status); /* INTERCOM_AUTH_SHORTCIRCUIT_V1 */
      if (r.status < 400) {
        if (isWrite && !writeOpStore.isValidWriteSuccess(r.data)) {
          if (opId) writeOpStore.set(opId, { status: 'unknown', reason: 'malformed-success', scoped: !!opScope });
          return { ok: false, unknown: true, status: r.status, data: r.data, reason: 'malformed-success' };
        }
        if (opId) writeOpStore.set(opId, { status: 'confirmed', scoped: !!opScope });
        return { ok: true, status: r.status, data: r.data };
      }
      if (r.status === 429) {
        // Rejected outright: nothing was applied, so retrying is safe for reads and writes.
      } else if (r.status >= 500) {
        if (isWrite) { ambiguous = true; break; } // may have been applied server-side
      } else {
        break; // 4xx client error: never retryable
      }
    } catch (e) {
      // No response at all: for a write the outcome is genuinely unknown.
      last = { status: 0, data: null, message: e && e.name };
      console.error('IC_REQ_ERR', tag, 'status=0', 'class=' + (e && e.name || 'Error'));
      if (isWrite) { ambiguous = true; break; }
    }
    if (attempt < IC_MAX_RETRY) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  if (ambiguous) {
    if (opId) writeOpStore.set(opId, { status: 'unknown', scoped: !!opScope });
    console.error('IC_REQ_UNKNOWN', tag, url, 'write outcome unknown , not retried');
    return { ok: false, unknown: true, status: last.status || 0, data: last.data };
  }
  if (opId) writeOpStore.set(opId, { status: 'failed', scoped: !!opScope });
  console.error('IC_REQ_FAIL', tag, url, last.status, 'codes=' + icErrorCodes(last.data), logLen(JSON.stringify(last.data || '')));
  return { ok: false, status: last.status, data: last.data };
}

function rememberVisibleContext(conversationId, convOrParts) {
  try {
    const parts = Array.isArray(convOrParts) ? convOrParts : authoritativeConversationParts(convOrParts);
    if (!parts) return;
    const texts = [];
    for (const p of parts) {
      if (!p || p.part_type === 'note') continue;
      const body = stripHtml(String(p.body || '')).trim();
      if (body) texts.push(body);
    }
    publicCredentialHold.rememberConversationContext(conversationId, texts);
  } catch (_) { /* current-body detection still runs when context cannot be read */ }
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

const JERRY_ID = '8053416';
// Live Intercom admin "Risk Team" (riskteam@fundedelite.com). Was wrongly 9378750 (404).
const RISK_TEAM_ADMIN_ID = '11128191';
const RISK_TEAM_ADMIN_IDS = new Set([RISK_TEAM_ADMIN_ID]);
const SUPPORT_TEAM_ID = 9629780;
const MENTION_ROTATE_FILE = process.env.MENTION_ROTATE_FILE || '/home/ubuntu/bot-mention-rotate.json';
const NEVER_MENTION_IDS = new Set([
  JERRY_ID,
  ARSAL_ID,
  ELITE_AI_ID,
  RISK_TEAM_ADMIN_ID,
  '8052557',
  '11128310',
  '11370955',
  '8089069',
  '9379207',
]);
const NEVER_MENTION_NAME_RE = /^(jerry(\s*-?\s*manager)?|arsal|elite ai|risk team|fundedelite|teamfutureselite|saqii|brian|blank)\b/i;
const EXTRA_NEVER_EMAIL_RE = /supportjp@|teamfutureselite@|affiliate@fundedelite\.com/i;
const UNSOLVED_JERRY_LINE = 'please mention jerry & assign ticket to him';

function adminMentionHtml(admin) {
  const id = String(admin.id);
  let name = String(admin.name || '').trim();
  // Never surface placeholder Intercom name "Blank" in notes
  if (!name || /^blank$/i.test(name)) name = 'teammate';
  return (
    '<a class="entity_mention intercom-content-link" href="//app.intercom.com/apps/h2z8cgfr/admin/' +
    id +
    '" rel="nofollow noopener noreferrer" target="_blank">' +
    name +
    '</a>'
  );
}

function jerryMentionHtml() {
  return (
    '<a class="entity_mention intercom-content-link" href="//app.intercom.com/apps/h2z8cgfr/admin/' +
    JERRY_ID +
    '" rel="nofollow noopener noreferrer" target="_blank">Jerry - Manager</a>'
  );
}

/** Escape plain text for Intercom note HTML (mentions inserted separately). */
function escapeNoteText(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

let _adminsMentionCache = { at: 0, list: null };

/** Broader admin list for owner @mention resolution (includes Away; still skips forbidden seats). */
async function fetchAdminsForMentionResolve() {
  const now = Date.now();
  if (_adminsMentionCache.list && now - _adminsMentionCache.at < 60_000) {
    return _adminsMentionCache.list;
  }
  const r = await axios.get('https://api.intercom.io/admins', {
    headers: icHeaders(),
    timeout: IC_TIMEOUT_MS,
    validateStatus: () => true,
  });
  if (r.status >= 400) {
    console.log('admins mention-resolve fetch fail', r.status);
    return _adminsMentionCache.list || [];
  }
  const admins = (r.data && r.data.admins) || [];
  const out = [];
  for (const a of admins) {
    if (!a || a.has_inbox_seat !== true) continue;
    const id = String(a.id || '');
    if (!id || NEVER_MENTION_IDS.has(id)) continue;
    const name = String(a.name || '').trim();
    const email = String(a.email || '');
    if (!name) continue;
    if (NEVER_MENTION_NAME_RE.test(name)) continue;
    if (/@intercom\.io$/i.test(email)) continue;
    if (EXTRA_NEVER_EMAIL_RE.test(email)) continue;
    out.push({ id, name, email });
  }
  _adminsMentionCache = { at: now, list: out };
  return out;
}

function adminMatchesMentionToken(admin, token) {
  const t = String(token || '').trim().toLowerCase().replace(/^@/, '');
  if (!t) return false;
  const name = String(admin.name || '').trim().toLowerCase();
  if (!name) return false;
  if (name === t) return true;
  const first = name.split(/\s+/)[0];
  if (first && first === t) return true;
  const compact = name.replace(/[^a-z0-9]/g, '');
  if (compact && compact === t.replace(/[^a-z0-9]/g, '')) return true;
  return false;
}

function resolveAdminByMentionToken(admins, token) {
  const t = String(token || '').trim().replace(/^@/, '');
  if (!t) return null;
  const ranked = admins.slice().sort((a, b) => String(b.name || '').length - String(a.name || '').length);
  for (const a of ranked) {
    if (adminMatchesMentionToken(a, t)) return a;
  }
  return null;
}

/**
 * Turn "@anjsha Please reply" (and similar) into real Intercom entity_mention HTML.
 * Escapes non-mention text; does not HTML-escape the mention anchors.
 * Respects NEVER_MENTION_* (those @tokens stay plain escaped text).
 */
async function enrichNoteMentionsHtml(body) {
  const raw = String(body || '');
  if (!raw.trim()) return escapeNoteText(raw);
  let admins = [];
  try {
    admins = await fetchAdminsForMentionResolve();
  } catch (e) {
    console.log('enrichNoteMentionsHtml admins fail', 'class=' + (e && e.name || 'Error'));
  }
  const atRe = /@([A-Za-z][A-Za-z0-9_.-]{0,60})/g;
  const parts = [];
  let last = 0;
  let m;
  while ((m = atRe.exec(raw)) !== null) {
    const token = m[1];
    const admin = resolveAdminByMentionToken(admins, token);
    parts.push(escapeNoteText(raw.slice(last, m.index)));
    if (admin) {
      parts.push(adminMentionHtml(admin));
    } else {
      parts.push(escapeNoteText(m[0]));
    }
    last = m.index + m[0].length;
  }
  parts.push(escapeNoteText(raw.slice(last)));
  return parts.join('');
}

/** Deterministic: "mention X and ask them to reply" → NOTE body with @Name. */
function extractOwnerMentionAskReplyBody(plain) {
  const t = String(plain || '');
  const stripped = typeof stripOwnerMentionPrefix === 'function' ? stripOwnerMentionPrefix(t) : t;
  const hay = stripped + '\n' + t;
  let m = hay.match(
    /\bmention\s+@?([A-Za-z][A-Za-z0-9_.-]{1,40})\b(?:\s+and)?\s+(?:ask\s+(?:him|her|them)\s+to\s+)?(?:ask\s+to\s+)?reply\b/i
  );
  if (!m) {
    m = hay.match(/\bmention\s+@?([A-Za-z][A-Za-z0-9_.-]{1,40})\b.{0,40}\breply\b/i);
  }
  if (!m) return null;
  const name = String(m[1] || '').trim();
  if (!name) return null;
  if (NEVER_MENTION_NAME_RE.test(name)) return null;
  if (/^(arsal|jerry|elite|risk|saqii|brian)$/i.test(name)) return null;
  return '@' + name + ' Please reply on this ticket.';
}

function boldNoteLabel(label) {
  return '<b>' + label + '</b>';
}

function loadMentionRotate() {
  try {
    return atomicJsonFile.readJsonSafe(MENTION_ROTATE_FILE, { fallback: { recent: [] }, label: 'mention-rotate' });
  } catch (_) {
    return { recent: [] }; // rotation order only; never worth failing a note over
  }
}

function saveMentionRotate(state) {
  atomicJsonFile.writeJsonAtomic(MENTION_ROTATE_FILE, state, { pretty: false });
}

async function fetchActiveTeammatesForMention() {
  // Staging selftests set this so a route test cannot call Intercom.
  // Inert when this file is the production tree, even if a shell exported the flag.
  if (process.env.LUNA_SELFTEST_NO_NET === '1' && __dirname !== '/home/ubuntu') return [];
  // Intercom has no live green-dot API , "online" ≈ Away mode OFF + Support Team seat.
  const r = await axios.get('https://api.intercom.io/admins', {
    headers: icHeaders(),
    timeout: IC_TIMEOUT_MS,
    validateStatus: () => true,
  });
  if (r.status >= 400) {
    console.log('admins fetch fail', r.status);
    return [];
  }
  const admins = (r.data && r.data.admins) || [];
  const out = [];
  for (const a of admins) {
    if (!a || a.has_inbox_seat !== true) continue;
    const id = String(a.id || '');
    if (!id || NEVER_MENTION_IDS.has(id)) continue;
    if (a.away_mode_enabled !== false) continue;
    const name = String(a.name || '').trim();
    const email = String(a.email || '');
    // Never tag placeholder seats (empty / literal "Blank") in Action needed
    if (!name || /^blank$/i.test(name)) continue;
    if (NEVER_MENTION_NAME_RE.test(name)) continue;
    if (/@intercom\.io$/i.test(email)) continue;
    if (EXTRA_NEVER_EMAIL_RE.test(email)) continue;
    const teams = (a.team_ids || []).map(Number);
    if (!teams.includes(SUPPORT_TEAM_ID)) continue;
    out.push({ id, name, email, away: a.away_mode_enabled });
  }
  out.sort((x, y) => x.name.localeCompare(y.name));
  console.log('ACTIVE_FOR_TAG', out.map((x) => x.name + '(' + x.id + ')').join(', ') || '(none)');
  return out;
}

function pickOneActiveTeammate(actives, preferId) {
  if (!actives.length) return null;
  if (preferId) {
    const pref = actives.find((a) => String(a.id) === String(preferId));
    if (pref) return pref;
  }
  const state = loadMentionRotate();
  const recent = Array.isArray(state.recent) ? state.recent.map(String) : [];
  const fresh = actives.filter((a) => !recent.includes(String(a.id)));
  const pool = fresh.length ? fresh : actives;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  saveMentionRotate({
    recent: recent.concat([String(pick.id)]).slice(-8),
    lastId: String(pick.id),
    at: Date.now(),
  });
  return pick;
}

async function assignToTeammate(conversationId, teammateId) {
  if (!teammateId) return { ok: false, status: 0 };
  return withOwnershipWriteLock(conversationId, async () => {
  let parts;
  const permission = async () => {
  let fresh;
  try { fresh = await fetchConversation(conversationId); }
  catch (_) { return ownershipUnavailableResult('assignment-ownership-unavailable'); }
  parts = fresh && authoritativeConversationParts(fresh);
  if (!fresh || !parts) return ownershipUnavailableResult('assignment-ownership-unavailable');
  if (control.isPaused() || control.isAiOff(conversationId)) return { ok: false, skipped: true, reason: 'assignment-paused-or-ai-off' };
  let owned;
  try { owned = ownershipBoundary.evaluate(fresh, parts, ownershipOptions(conversationId)); }
  catch (_) { return ownershipUnavailableResult('assignment-evidence-unavailable'); }
  if (owned.blocked) return { ok: false, skipped: true, reason: owned.reason };
  return null;
  };
  const denied = await permission();
  if (denied) return denied;
  const r = await icRequest(
    'post',
    'https://api.intercom.io/conversations/' + conversationId + '/reply',
    { message_type: 'assignment', type: 'admin', admin_id: ARSAL_ID, assignee_id: Number(teammateId) },
    'ASSIGN', undefined, permission
  );
  console.log('ASSIGN', conversationId, teammateId, r.status, r.ok ? 'ok' : 'FAIL');
  if (r && r.ok && !r.skipped) {
    const known = rememberLunaAction(conversationId, r, 'assignment', '', teammateId, parts.map((p) => String(p.id)));
    if (known.length === 1) __lunaAssignedAt.set(String(conversationId), { target: String(teammateId), partId: known[0].id, at: Date.now(), publicUsed: false });
  }
  return r;
  });
}

async function assignToTeammateIfNeeded(conversation, conversationId, teammateId) {
  if (!teammateId) return { ok: false, status: 0, reason: 'missing_assignee' };
  const current = conversation && conversation.admin_assignee_id != null
    ? String(conversation.admin_assignee_id)
    : '';
  if (current && current === String(teammateId)) {
    return { ok: true, status: 200, skipped: true, reason: 'already_assigned' };
  }
  const result = await assignToTeammate(conversationId, teammateId);
  const errors = result && result.data && Array.isArray(result.data.errors) ? result.data.errors : [];
  if (
    result &&
    result.status === 422 &&
    errors.some((e) => e && e.code === 'conversation_already_assigned_to_assignee')
  ) {
    console.log('ASSIGN skip already-assigned 422', conversationId, teammateId);
    return { ok: true, status: 200, skipped: true, reason: 'already_assigned_422' };
  }
  return result;
}

function extractEmailsFromText(text) {
  const out = [];
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let m;
  const s = String(text || '');
  while ((m = re.exec(s))) {
    const e = m[0];
    if (!out.find((x) => x.toLowerCase() === e.toLowerCase())) out.push(e);
  }
  return out;
}

function extractAccountNumbersFromText(text) {
  // Merged: idGates patterns (letter+digit / spaced digits / 5-12) + live year/repeat/size/IP filters.
  const original = String(text || '');
  const s = accountNumberPrefer.stripIpv4(original);
  const raw = idGates.extractAccountNumbersFromText(original);
  const out = [];
  const push = (v) => {
    const x = String(v || '').replace(/\s+/g, '');
    if (!x || out.includes(x)) return;
    if (/^(19|20)\d{2}$/.test(x)) return;
    if (/^(\d)\1+$/.test(x)) return;
    if (accountNumberPrefer.isBlockedNoise(x, original)) return;
    out.push(x);
  };
  for (const v of raw) push(v);
  // Preserve live letter+digit / spaced fallbacks if idGates missed a form
  for (const m of s.matchAll(/\b[A-Za-z]\d{5,}\b/g)) push(m[0]);
  for (const m of s.matchAll(/\b\d{5,12}\b/g)) push(m[0]);
  for (const m of s.matchAll(/\b\d{3,4}\s+\d{3,5}\b/g)) push(m[0]);
  const ranked = accountNumberPrefer.rankAccountCandidates(out, original);
  // Only exact, context-checked tokens. Do not fall back to glued or unlabeled noise.
  return Array.isArray(ranked.all) ? ranked.all : [];
}

function collectClientMessageTexts(conversation) {
  const out = [];
  const src = (conversation && conversation.source) || {};
  if (src.body && src.author && (src.author.type === 'user' || src.author.type === 'lead')) {
    out.push(stripHtml(src.body));
  }
  const parts = partsOf(conversation);
  for (const p of parts) {
    const a = p.author || {};
    if (a.type !== 'user' && a.type !== 'lead') continue;
    if (p.part_type === 'note') continue;
    const body = stripHtml(p.body || '');
    if (body) out.push(body);
  }
  return out;
}

function isUsableClientEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !e.includes('@')) return false;
  // Never treat Intercom/company/support addresses as "client-provided" note email.
  if (/@intercom\.io$/i.test(e)) return false;
  // *@intercom-mail.com and *@*.intercom-mail.com (e.g. fundedelite.intercom-mail.com)
  if (/intercom-mail\.com$/i.test(e)) return false;
  if (/@(fundedelite\.com|fundedelitetraders\.com)$/i.test(e)) return false;
  if (/^(support|noreply|no-reply|hello|info)@/i.test(e)) return false;
  return true;
}

function lunaAskedClientForEmail(conversation) {
  try {
    return countIdentityFieldAsks(partsOf(conversation), 'email') > 0;
  } catch (_) {
    return false;
  }
}

/** Usable Intercom ticket/profile email (never company/intercom-mail). */
function profileEmailFromConversation(conversation, bits) {
  const candidates = [];
  if (bits && bits.email) candidates.push(bits.email);
  const srcAuthor = ((conversation && conversation.source) || {}).author || {};
  if (srcAuthor.email) candidates.push(srcAuthor.email);
  const contacts = ((conversation && conversation.contacts) || {}).contacts || [];
  for (const c of contacts) {
    if (c && c.email) candidates.push(c.email);
  }
  for (const e of candidates) {
    if (isUsableClientEmail(e)) return String(e).trim();
  }
  return '';
}

/**
 * Prefer chat-typed email; else Intercom profile/contact email when chat did not type one.
 * Arsal lock 2026-09-22: do NOT skip profile fallback just because Luna asked for email
 * (ticket 215476045133527 left Email: Not provided despite profile email).
 * Fetches contact by id when the conversation payload lacks email.
 */
async function resolveNoteEmail(conversation, ids) {
  let email = ids && ids.email ? String(ids.email).trim() : '';
  if (email && isUsableClientEmail(email) && !/^not provided/i.test(email)) return email;
  // Always try profile/contact when chat has no usable email (lunaAsked no longer blocks).
  void lunaAskedClientForEmail; // kept for callers / identity gates elsewhere
  const bits = typeof contactBits === 'function' ? contactBits(conversation || {}) : {};
  const profile = profileEmailFromConversation(conversation, bits);
  if (profile) return profile;
  const cid = (bits && bits.id) || (((conversation || {}).source || {}).author || {}).id || '';
  if (!cid) return '';
  try {
    const r = await axios.get('https://api.intercom.io/contacts/' + cid, {
      headers: icHeaders(),
      timeout: IC_TIMEOUT_MS,
      validateStatus: () => true,
    });
    const em = r && r.data && r.data.email;
    if (isUsableClientEmail(em)) return String(em).trim();
  } catch (e) {
    console.error('resolveNoteEmail contact fetch fail', 'class=' + (e && e.name || 'Error'));
  }
  return '';
}

/**
 * Unlabeled digits are an account only when they are the client's next reply
 * to a Luna or teammate public message that asked for the trading account number,
 * and only until the client changes topic. Notes do not open or close that window.
 */
function provenAccountRepliesFromConversation(conversation) {
  const events = [];
  const push = (role, body) => {
    const t = stripHtml(body || '');
    if (!t) return;
    events.push({ role, body: t });
  };
  const src = (conversation && conversation.source) || {};
  if (src.body) {
    const type = String((src.author || {}).type || '');
    if (type === 'user' || type === 'lead') push('client', src.body);
    else if (type === 'admin' || type === 'bot') push('staff', src.body);
  }
  for (const p of partsOf(conversation)) {
    if (!p) continue;
    const pt = String(p.part_type || '');
    if (pt === 'note') continue;
    if (pt && pt !== 'comment' && pt !== 'assignment' && pt !== 'open') continue;
    const a = p.author || {};
    if (a.type === 'user' || a.type === 'lead') push('client', p.body);
    else if (a.type === 'admin' || a.type === 'bot') push('staff', p.body);
  }
  const proven = [];
  let open = false;
  for (const ev of events) {
    if (ev.role === 'staff') {
      open = !!detectIdentityAskFields(ev.body).account;
      continue;
    }
    if (!open) continue;
    const tokens = accountNumberPrefer.directAccountReplyTokens(ev.body);
    if (tokens.length) {
      for (const tok of tokens) if (!proven.includes(tok)) proven.push(tok);
    } else open = false;
  }
  return proven;
}

function collectEscalateIds(conversation, bits, modelBody) {
  // Account: from what the client wrote in chat.
  // Email: prefer client-typed chat email; if chat has none, fall back to Intercom
  // ticket/profile email instead of leaving "Not provided" (even if Luna asked).
  void modelBody;
  const profileBits =
    bits && typeof bits === 'object' && (bits.email || bits.name || bits.id)
      ? bits
      : typeof contactBits === 'function'
        ? contactBits(conversation || {})
        : {};
  const clientTexts = collectClientMessageTexts(conversation);
  const blob = clientTexts.join('\n');
  const accounts = extractAccountNumbersFromText(blob);
  const proven = provenAccountRepliesFromConversation(conversation);
  for (const tok of proven) {
    if (accounts.includes(tok)) continue;
    const host = clientTexts.find((m) => accountNumberPrefer.directAccountReplyTokens(m).indexOf(tok) !== -1);
    if (host && accountNumberPrefer.isBlockedNoise(tok, host)) continue;
    if (!host && accountNumberPrefer.isBlockedNoise(tok, blob)) continue;
    accounts.push(tok);
  }
  const ranked = accountNumberPrefer.rankAccountCandidates(accounts, blob, {
    messageTexts: clientTexts,
    provenTokens: proven,
  });
  const rankedAll = ranked.all && ranked.all.length ? ranked.all : [];
  const emails = extractEmailsFromText(blob).filter(isUsableClientEmail);
  let email = emails[0] || '';
  if (!email) {
    const profileEmail = profileEmailFromConversation(conversation, profileBits);
    if (profileEmail) {
      email = profileEmail;
      emails.unshift(profileEmail);
    }
  }
  let ids = {
    account: accountNumberPrefer.formatAccountField(rankedAll) || ranked.primary || '',
    email,
    accounts: rankedAll,
    emails,
  };
  ids = applyContextualPendingIds(conversation, ids);
  // Trusted prior-note accounts are applied in resolveIdentityAskDecision (not here),
  // so collectEscalateIds stays client/profile-scoped for callers that distinguish sources.
  if (!ids.email) {
    const profileEmail = profileEmailFromConversation(conversation, profileBits);
    if (profileEmail) {
      ids.email = profileEmail;
      if (!ids.emails) ids.emails = [];
      if (!ids.emails.find((e) => String(e).toLowerCase() === profileEmail.toLowerCase())) {
        ids.emails.unshift(profileEmail);
      }
    }
  }
  return ids;
}

function nlToBr(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br>');
}

function rewriteBareNumberOrderLabels(text, account) {
  let t = String(text || '');
  const acct = String(account || '').trim();
  if (!acct) return t;
  const esc = acct.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // "order 131324" / "order ID 131324" / "order/challenge ID: 131324" -> account
  t = t.replace(new RegExp('\\border\\s*(?:/\\s*challenge\\s*)?(?:id|#)?\\s*[:=]?\\s*' + esc + '\\b', 'gi'), 'account ' + acct);
  t = t.replace(new RegExp('\\bchallenge\\s*(?:/\\s*order\\s*)?(?:id|#)?\\s*[:=]?\\s*' + esc + '\\b', 'gi'), 'account ' + acct);
  return t;
}

function sanitizeEscalateProblem(text, account, email) {
  let t = rewriteBareNumberOrderLabels(String(text || '').replace(/\r\n/g, '\n').trim(), account);
  // Drop structured fields the note already has above Problem
  t = t.replace(/^\s*(Account|Email|Order(?:\/challenge)?(?:\s*ID)?|Action needed|KIND|BODY|CLIENT|ACTION_NEEDED)\s*:.*$/gim, '');
  t = t.replace(/\bRegistered email\s*:?\s*/gi, '');
  t = t.replace(/\bOrder\/challenge ID\s*:?\s*/gi, '');
  t = t.replace(/\bchallenge\/order ID\s*:?\s*/gi, '');
  t = t.replace(/\b(account|order|challenge)\s*(number|id|#)?\s*[:=]\s*[A-Za-z0-9\-]+/gi, '');
  if (email) {
    const re = new RegExp(String(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    t = t.replace(re, '');
  }
  if (account) {
    const re = new RegExp('\\b' + String(account).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    t = t.replace(re, '');
  }
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');
  t = t.replace(/\(\s*\)/g, '');
  t = t.replace(/\s+([,.;])/g, '$1');
  t = t.replace(/([,.;]){2,}/g, '$1');
  t = t.replace(/^[,.\s]+|[,.\s]+$/g, '').trim();
  return t || 'Client needs backend / verification review.';
}

/** Arsal lock: internal notes always English (never Roman Urdu / Urdu / Italian for notes). */
function looksNonEnglishNote(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  // Urdu/Arabic script
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(t)) return true;
  // Common Roman Urdu / Urdu-Latin markers (word-ish)
  if (/\b(mujhe|mujhay|krna|karna|kriye|kijiye|nahi|nahin|acha|theek|please\s+check\s+kardo|account\s+check\s+karo|yeh|ye|hai\s+kya|kya\s+hai|bhai|sahab|janab|shukriya|meherbani)\b/i.test(t)) {
    return true;
  }
  // Italian note markers (common support phrasing)
  if (/\b(il\s+cliente|per\s+favore|grazie|non\s+riesco|verificare|conto\s+trading|mi\s+serve|vorrei|potete|prego)\b/i.test(t)) {
    return true;
  }
  return false;
}

async function ensureInternalNoteEnglish(text, label) {
  const raw = String(text || '').trim();
  if (!raw) return raw;
  if (!looksNonEnglishNote(raw)) return raw;
  try {
    // A teammate acts on this note, so it influences downstream handling: MEDIUM floor applies,
    // it is not housekeeping.
    const ai = await lunaModel.create(openai, {
      model: control.getModel(),
      ...modelConfig.answerParams({ tools: false, purpose: 'note.english' }),
      messages: [
        {
          role: 'system',
          content:
            'Rewrite the following INTERNAL Intercom note field into clear English only. Keep meaning, names, numbers, emails, @mentions, and account IDs. No Roman Urdu, Urdu, Italian, or other languages. No greeting. Output only the rewritten note text.',
        },
        { role: 'user', content: (label ? '[' + label + ']\n' : '') + raw },
      ],
    });
    const out = (((ai.choices[0] || {}).message || {}).content || '').trim();
    if (out) return out;
  } catch (e) {
    console.error('NOTE_EN_OVERLAY fail', label || '', 'class=' + (e && e.name || 'Error'));
  }
  return raw;
}


/**
 * Turn a draft escalate Problem into a short own-words summary with key context.
 * Avoids leaving the teammate a copy-pasted client question.
 */
async function polishInternalProblemSummary(problemText, opts) {
  const raw = String(problemText || '').trim();
  if (!raw) return raw;
  const clientTexts = (opts && Array.isArray(opts.clientTexts)) ? opts.clientTexts : [];
  const account = opts && opts.account;
  // Always rewrite Problem into an own-words third-person summary.
  // Client-voice pastes (even without "?") must not land verbatim in the note.
  try {
    const ctxBits = clientTexts.filter(Boolean).slice(-6).map((t) => String(t).replace(/\s+/g, ' ').trim().slice(0, 220));
    const userPayload = ctxBits.length
      ? ('Draft Problem:\n' + raw + '\n\nClient messages (for grounding — summarize the real ask, do not paste):\n- ' + ctxBits.join('\n- '))
      : raw;
    const ai = await lunaModel.create(openai, {
      model: control.getModel(),
      ...modelConfig.answerParams({
        tools: false,
        purpose: 'note.problem-polish',
        conversationId: opts && opts.conversationId,
        episode: opts && opts.conversationId ? lunaEpisode.get(opts.conversationId) : null,
      }),
      conversationId: opts && opts.conversationId,
      episode: opts && opts.conversationId ? lunaEpisode.get(opts.conversationId) : null,
      messages: [
        {
          role: 'system',
          content:
            'Rewrite this Intercom INTERNAL note Problem field.\n' +
            'NEVER copy-paste or lightly edit the client message.\n' +
            'Write a short but complete third-person summary of the actual issue in simple English.\n' +
            'Include important context (account/product/dates/status/what they want) when present.\n' +
            escalateProblemPolish.polishPromptAddon() +
            'Keep concise (2–4 sentences). No greeting. No Account/Email/Action headers. No "Problem:" label. Output only the rewritten summary.',
        },
        { role: 'user', content: userPayload },
      ],
    });
    let polished = (((ai.choices[0] || {}).message || {}).content || '').trim().replace(/^Problem:\s*/i, '');
    if (polished) {
      const repaired = escalateProblemPolish.repairEscalateProblemSummary(polished, {
        account,
        clientTexts,
      });
      if (repaired.repaired) {
        console.log('PROBLEM_SUMMARY_REPAIRED', repaired.reason, logLen(polished), '=>', logLen(repaired.problem));
        polished = repaired.problem;
      }
      console.log('PROBLEM_SUMMARY_POLISHED', logLen(raw), '=>', logLen(polished));
      return polished;
    }
  } catch (e) {
    console.error('PROBLEM_SUMMARY_POLISH fail', 'class=' + (e && e.name || 'Error'));
  }
  const fallback = escalateProblemPolish.repairEscalateProblemSummary(raw, { account, clientTexts });
  return fallback.problem || raw;
}

/**
 * Pure escalate/CoS/Risk/Escalations internal-note HTML (Arsal 2026-09-29 / dest 2026-09-30).
 * Destination-aware: Risk / Jerry / Escalations → Account+Email+Problem only;
 * normal escalate → full format with Action needed + fixed Jerry Note footer.
 * Destination is read from CURRENT conversation admin/team assignee at note time.
 * Never inject Jerry entity mentions into the body; the Note footer names Jerry in plain text.
 */
function noteDestinationIds() {
  return {
    riskTeamId: RISK_TEAM_ID,
    escalationsTeamId: ESCALATIONS_TEAM_ID,
    jerryId: JERRY_ID,
    riskTeamAdminId: RISK_TEAM_ADMIN_ID,
    riskTeamAdminIds: RISK_TEAM_ADMIN_IDS,
  };
}

function vetNoteAccount(acct, conversation, email) {
  const s = String(acct || '').trim();
  if (!s) return s;
  if (isNonAccountLine(s)) return NON_ACCOUNT_LINE;
  if (s === idGates.AUTH_ACCESS_ACCOUNT_LINE) return s;
  if (/^not provided\b/i.test(s) || /^not available\b/i.test(s)) return s;
  if (!isRealTradingAccount(s)) return s;
  let allowed = new Set();
  try {
    if (conversation) {
      const selected = accountProvenance(conversation);
      allowed = new Set(selected && selected.all ? selected.all : []);
    }
  } catch (_) {}
  const kept = [];
  for (const part of s.split(/\s*,\s*/)) {
    const p = String(part || '').trim();
    if (!p) continue;
    // allowed is already limited to original provenance. Do not re-judge the
    // number against the joined transcript; an earlier sentence must not
    // relabel a later direct reply.
    if (allowed.has(p)) kept.push(p);
  }
  if (kept.length) return accountNumberPrefer.formatAccountField(kept);
  if (conversation && clientSaidNoAccount(conversation)) {
    return 'Not provided (client has no account / not purchased)';
  }
  if (conversation) {
    const cls = classifyAuthAccessFromConversation(conversation);
    const em = String(email || '').trim();
    if (cls.useEmailIdentity && isUsableClientEmail(em)) return idGates.AUTH_ACCESS_ACCOUNT_LINE;
  }
  return '';
}

function formatEscalateNoteHtml(opts) {
  const o = Object.assign({}, opts || {});
  if (o.destination == null && o.conversation) {
    o.destinationIds = o.destinationIds || noteDestinationIds();
  }
  // Every note builder writes Account through here. Re-check provenance on the
  // value about to be written; a prior note or earlier selection is not enough.
  if (o.conversation && o.account) {
    o.account = vetNoteAccount(o.account, o.conversation, o.email);
  }
  return internalNoteFormat.formatEscalateNoteHtml(o);
}

function isEmailSufficientNonAccount(conversation) {
  if (!conversation) return false;
  let ids;
  try { ids = collectEscalateIds(conversation, {}, ''); } catch (_) { return false; }
  if (!ids || !isUsableClientEmail(ids.email)) return false;
  let resolved;
  try { resolved = resolveIdentityAskDecision(conversation, ids, 'ACCOUNT'); } catch (_) { return false; }
  const reason = resolved && resolved.decision && resolved.decision.reason;
  if (reason !== 'email_sufficient') return false;
  if (resolved.needAccount || resolved.needEmail) return false;
  const texts = [];
  try { texts.push(...(collectClientMessageTexts(conversation) || [])); } catch (_) {}
  const latest = texts.length ? String(texts[texts.length - 1] || '') : '';
  try { if (isClearlyAccountSpecificIssue(latest)) return false; } catch (_) {}
  try { if (idGates.tradingAccountNumberRequired(latest) || idGates.payoutRejectionRequiresAccount(latest)) return false; } catch (_) {}
  try { if (clientWantsHumanTeammate(latest)) return false; } catch (_) {}
  return true;
}

function isHollowEscalationAck(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return true;
  const body = stripHandoffClaims(raw).replace(/\s+/g, ' ').trim();
  if (!body || body === handoffClaimGate.TRUTHFUL_NO_HANDOFF_FALLBACK) return true;
  const words = body.split(' ').filter(Boolean);
  if (words.length > 12) return false;
  return /^(?:got it|thanks|thank you|thx|understood|noted|okay|ok|sure|great|perfect|alright)\b/i.test(body);
}

function preferredForEscalation(built, modelClient, assignOk) {
  const model = String(modelClient || '').trim();
  if (built && built.nonAccount) {
    if (!assignOk) return '';
    if (!model || isHollowEscalationAck(model)) return ACCOUNT_HANDOFF_ACK;
    return model;
  }
  if (assignOk) return model || ACCOUNT_HANDOFF_ACK;
  return model;
}

async function buildEscalateNoteAndAssignee({ problem, actionNeeded, account, email, preferAssigneeId, conversation, forceNonAccount }) {
  // ACCOUNT_NOTE_NO_PLACEHOLDER_V1: resolve a real account (or declined marker) BEFORE
  // teammate fetch / note HTML. Never default to bare "Not provided".
  let acct = String(account || '').trim();
  if (internalNoteFormat.isBareAccountPlaceholder(acct) && conversation) {
    try {
      const bits = typeof contactBits === 'function' ? contactBits(conversation) : {};
      const collected = collectEscalateIds(conversation, bits, '');
      if (collected && collected.account) acct = String(collected.account).trim();
    } catch (_) {}
    if (internalNoteFormat.isBareAccountPlaceholder(acct)) {
      try {
        const trusted = trustedExplicitAccount(conversation);
        if (trusted) acct = String(trusted).trim();
      } catch (_) {}
    }
    if (internalNoteFormat.isBareAccountPlaceholder(acct) && clientSaidNoAccount(conversation)) {
      acct = 'Not provided (client has no account / not purchased)';
    }
    if (internalNoteFormat.isBareAccountPlaceholder(acct)) {
      const cls = classifyAuthAccessFromConversation(conversation);
      let em = String(email || '').trim();
      if (!isUsableClientEmail(em)) {
        try {
          const bits = typeof contactBits === 'function' ? contactBits(conversation) : {};
          const collected = collectEscalateIds(conversation, bits, '');
          em = collected && collected.email ? String(collected.email).trim() : '';
        } catch (_) {}
      }
      if (cls.useEmailIdentity && isUsableClientEmail(em)) {
        acct = idGates.AUTH_ACCESS_ACCOUNT_LINE;
        console.log('AUTH_ACCESS_NOTE', cls.reason);
      }
    }
  }
  acct = vetNoteAccount(acct, conversation, email);
  let nonAccount = isNonAccountLine(acct);
  if (internalNoteFormat.isBareAccountPlaceholder(acct)) {
    if (forceNonAccount || isEmailSufficientNonAccount(conversation)) {
      acct = NON_ACCOUNT_LINE;
      nonAccount = true;
      console.log('ESCALATE_NOTE_NON_ACCOUNT');
    } else {
      console.log('ESCALATE_NOTE_DEFERRED missing_account');
      console.log('ESCALATION_MISSING_REQUIRED_ACCOUNT');
      console.log('ACCOUNT_PROVENANCE_REJECTED', 'missing');
      return {
        deferred: true,
        reason: 'missing_account',
        html: null,
        teammate: null,
        assigneeId: null,
        problemText: null,
      };
    }
  }

  let actives = await fetchActiveTeammatesForMention();
  actives = await fetchActiveTeammatesForMention();
  const one = pickOneActiveTeammate(actives, preferAssigneeId);
  if (one) console.log('TAG_PICK', one.name, one.id);

  /* AUDIT_HARDEN_V1:noteEmail */
  // Final note Email: chat-typed first; else Intercom profile if Luna never asked; else Not provided.
  let em = email || '';
  if ((!em || /^not provided/i.test(String(em)) || !isUsableClientEmail(em)) && conversation) {
    const resolved = await resolveNoteEmail(conversation, { email: em });
    if (resolved) em = resolved;
  }
  if (!em || /^not provided/i.test(String(em)) || !isUsableClientEmail(em)) {
    em = 'Not provided';
  }
  let problemText = sanitizeEscalateProblem(problem, acct, email);
  let task = String(actionNeeded || 'Please review this case and guide the client.').trim();
  let clientTexts = [];
  try {
    if (conversation && typeof collectClientMessageTexts === 'function') {
      clientTexts = collectClientMessageTexts(conversation) || [];
    }
  } catch (_) { clientTexts = []; }
  {
    const pre = escalateProblemPolish.repairEscalateProblemSummary(problemText, {
      account: acct,
      clientTexts,
    });
    if (pre.repaired) {
      console.log('PROBLEM_PRE_REPAIR', pre.reason, logLen(problemText), '=>', logLen(pre.problem));
      problemText = pre.problem;
    }
  }
  problemText = await polishInternalProblemSummary(problemText, { account: acct, clientTexts });
  problemText = await ensureInternalNoteEnglish(problemText, 'Problem');
  {
    // NOTE_ACTION_SUMMARY_V1: fill the Action-needed placeholder with the polished problem summary.
    const rawAt = task.indexOf('\u0000RAW:');
    const raw = rawAt >= 0 ? task.slice(rawAt + 5) : '';
    if (rawAt >= 0) task = task.slice(0, rawAt);
    const summary = String(problemText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || raw;
    task = task.replace('{{PROBLEM}}', /[.!?]$/.test(summary) ? summary : summary + '.');
  }
  if (nonAccount) {
    task = task.replace(/check\s+the\s+client['\u2019]s\s+account/gi, 'Review this');
    task = task.replace(/check\s+account\s+not required(?:\s*\(non-account issue\))?/gi, 'Review this');
  }
  task = await ensureInternalNoteEnglish(task, 'Action needed');

  let actionHtml;
  let assigneeId = null;
  const mentionOk =
    one &&
    String(one.name || '').trim() &&
    !/^blank$/i.test(String(one.name || '').trim()) &&
    !NEVER_MENTION_NAME_RE.test(String(one.name || '').trim());
  if (mentionOk) {
    actionHtml = adminMentionHtml(one) + ' ' + nlToBr(task);
    assigneeId = one.id;
  } else if (one && one.id) {
    // Usable assignee id but not mentionable (e.g. Blank) — assign silently, no name in note
    actionHtml = nlToBr(task);
    assigneeId = one.id;
  } else {
    // No Away-off Support teammate: still assign to Jerry silently for routing,
    // but NEVER put Jerry mention HTML or "mention jerry" text in the note body
    // (Arsal lock 2026-09-22 — ticket 215476046020823).
    actionHtml = nlToBr(task);
    assigneeId = JERRY_ID;
  }

  // NOTE_DEST_FORMAT_V1: format from CURRENT Intercom assignee/inbox at note time
  // (before any new assignment this turn). Short for Risk/Jerry/Escalations.
  const dest = internalNoteFormat.resolveNoteDestination(conversation, noteDestinationIds());
  if (dest && dest.short) {
    console.log('NOTE_DEST_SHORT', dest.reason);
  }

  let html;
  try {
    html = formatEscalateNoteHtml({
      problemText,
      email: em,
      account: acct,
      actionHtml: dest && dest.short ? '' : actionHtml,
      destination: dest,
      conversation,
      destinationIds: noteDestinationIds(),
    });
  } catch (e) {
    if (e && e.code === 'MISSING_ACCOUNT_FOR_NOTE') {
      console.log('ESCALATE_NOTE_DEFERRED missing_account (format)');
      console.log('ESCALATION_MISSING_REQUIRED_ACCOUNT');
      console.log('ACCOUNT_PROVENANCE_REJECTED', 'missing');
      return {
        deferred: true,
        reason: 'missing_account',
        html: null,
        teammate: null,
        assigneeId: null,
        problemText: null,
      };
    }
    throw e;
  }

  const __acctN = provenAccountLogCount(acct);
  console.log('ACCOUNT_PROVENANCE_ACCEPTED', 'count=' + __acctN);
  console.log('ESCALATION_READY', 'accounts=' + __acctN);
  return { html, teammate: one, assigneeId, problemText, deferred: false, destination: dest, nonAccount };
}

/** PROMO_CHECKOUT_FAILURE_V1 — named coupon not applying at checkout/dashboard. */
function isPromoCodeFailureAsk(text) {
  try {
    if (septemberPromos && typeof septemberPromos.isPromoCodeFailureAsk === 'function') {
      return !!septemberPromos.isPromoCodeFailureAsk(text);
    }
  } catch (_) {}
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  const named =
    /\b(?:new\s*50|new50|oct\s*3535|oct35|flash\s*5|flash5)\b/.test(t) ||
    /\b(?:promo|discount|coupon|voucher)\s*codes?\b/.test(t) ||
    /\b(?:the|my|this|that)\s+(?:code|coupon|discount|promo)\b/.test(t);
  if (!named) return false;
  return (
    /\b(?:can(?:not|'?t)|unable\s+to|won'?t|does\s*n(?:ot|')t|did\s*n(?:ot|')t|not|never)\s+(?:\w+\s+){0,4}(?:apply|applied|work|working|use|using|accept|accepted)\b/.test(t) ||
    /\b(?:code|coupon|discount|promo)\b[^.?!\n]{0,60}\b(?:not\s+(?:apply|working|accepted)|does\s*n(?:ot|')t\s+apply|won'?t\s+apply|never\s+apply|failed|invalid)\b/.test(t) ||
    /\b(?:just\s+)?(?:does\s*n(?:ot|')t|doesnt|won't|wont|never)\s+applys?\b/.test(t) ||
    /\bbefore\s+creating\s+(?:the\s+)?account\b/.test(t) ||
    /\bafter\s+creating\s+(?:the\s+)?account\b/.test(t) ||
    /\b24\s*hours?\b[^.?!\n]{0,80}\b(?:appl|expir)/.test(t)
  );
}

function isClearlyAccountSpecificIssue(text) {
  // PAST_CONTEXT_SCOPE_V1: a concluded past event given as the reason for a general question is not evidence of
  // an open account problem (see statePresend/textUtils.withoutConcludedPastContext).
  const t = require('./statePresend/textUtils').withoutConcludedPastContext(String(text || '')).trim();
  if (!t) return false;
  // PREPURCHASE_ACCOUNT_V1: a hypothetical or pre-purchase policy question is not this client's account.
  if (prePurchaseGate.exemptFromAccountIdentity(t)) return false;
  // A general question about why payouts can be denied is not this client's case
  // ("if my payout is rejected", "why do payouts get rejected"). The reported
  // rejection ("why was my payout rejected?") stays account work.
  if (/\b(?:payouts?|withdrawals?)\b/i.test(t) && /\b(?:rejected|rejection|denied|declined|refused)\b/i.test(t) &&
      !idGates.payoutRejectionRequiresAccount(t)) return false;
  // Promo/coupon apply failures are this client's checkout case, not a general FAQ.
  if (isPromoCodeFailureAsk(t)) return true;
  if (
    /\b(why\s+(was|is|did)\s+my|my\s+(payout|withdrawal)\s+(was|is|got)\s+(rejected|denied|delayed|stuck)|my\s+account\s+(shows|is|was|got)\s+(breach|disabled|banned|flagged)|i\s+was\s+breached|my\s+dashboard\s+shows)\b/i.test(t)
  ) {
    return true;
  }
  // HOWTO_NOT_ACCOUNT_V1: "check my account/balance/payout" is account work when asked OF staff, but
  // "how do I check my account balance on the dashboard?" is a self-service how-to the FAQ answers
  // (real-model run 2026-09-23: escalated 1/3). The how-to form alone is exempt.
  if (/\bcheck\s+my\s+(account|balance|payout)\b/i.test(t) &&
      !/\bhow\s+(?:do|can|should|would)\s+i\b|\bhow\s+to\b|\bwhere\s+(?:do|can)\s+i\b/i.test(t)) {
    return true;
  }
  if (/\b(not\s+eligible\s+for\s+(a\s+)?payout|payout\s+(is\s+)?not\s+eligible|payout[^.?!\n]{0,50}please\s+try\s+again)\b/i.test(t)) {
    return true;
  }
  if (/\b(i\s+can(?:not|'?t)|unable\s+to|won'?t\s+let\s+me)\b[^.?!\n]{0,45}\b(log\s*in|login|access\s+(my\s+)?account|sign\s*in)\b/i.test(t)) {
    return true;
  }
  if (/\b(wrong|invalid|incorrect|not\s+working|doesn'?t\s+work)\b[^.?!\n]{0,30}\b(password|credentials?|login)\b|\b(password|credentials?|login)\b[^.?!\n]{0,30}\b(wrong|invalid|incorrect|not\s+working|doesn'?t\s+work)\b/i.test(t)) {
    return true;
  }
  return /\b(my|mine|i|we)\b[^.?!\n]{0,70}\b(kyc|verification|balance|credentials?|account|payout|withdrawal|dashboard)\b[^.?!\n]{0,70}\b(stuck|pending|failed|rejected|denied|disabled|breached|flagged|wrong|missing|not\s+working|not\s+eligible|can(?:not|'?t)|unable)\b/i.test(t);
}

function looksLikeMixedNonPromoQuestion(text) {
  const t = String(text || '');
  return /\b(drawdown|daily\s+loss|max(?:imum)?\s+loss|consistency|profit\s+target|leverage|kyc|breach|payout\s+status|second\s+chance|restricted|news\s+trading|expert\s+advisor|\bea\b|weekend\s+hold|copy\s+trad|scalping|reset\s+fee)\b/i.test(t);
}

function isPromotionQuestion(text) {
  const t = String(text || '');
  if (!t || isClearlyAccountSpecificIssue(t)) return false;
  // A partnership / custom-audience request is not a promo auto-reply, even if it says "discount".
  if (partnershipIntent && typeof partnershipIntent.blocksPromoAutoReply === 'function' && partnershipIntent.blocksPromoAutoReply(t)) {
    return false;
  }
  if (partnershipIntent && typeof partnershipIntent.looksLikePublicPromoAsk === 'function' && partnershipIntent.looksLikePublicPromoAsk(t)) {
    return true;
  }
  // Checkout apply-failure is account work even when a code name is present.
  if (isPromoCodeFailureAsk(t)) return false;
  // PLAN_DIFF_GATE: never treat plan-difference / features compares as promo
  if (
    septemberPromos &&
    typeof septemberPromos.isPlanDifferenceOrFeaturesAsk === 'function' &&
    septemberPromos.isPlanDifferenceOrFeaturesAsk(t) &&
    !(
      /\b(discount|promo(?:tion)?s?|coupon|offer|oct\s*3535|oct35|%\s*off|price)\b/i.test(t)
    )
  ) {
    return false;
  }
  if (/\b(oct\s*3535|oct35|flash\s*5|flash5|new\s*50|new50)\b/i.test(t)) return true;
  if (/\b(promo(?:tion)?s?|discount(?:s)?|coupon(?:s)?|offer(?:s)?|voucher(?:s)?)\b/i.test(t)) return true;
  if (/\b(\d+\s*%\s*off|percent(?:age)?\s*off)\b/i.test(t)) return true;
  if (/\bany\s+(?:deals?|sales?|promos?|offers?|discounts?)\b/i.test(t)) return true;
  if (/flash\s*activation/i.test(t) && /\b(\$\s*5|5\s*dollars?|buy\s*1|get\s*4|bogo|free)\b/i.test(t)) return true;
  if (/\bweekly\s*payout\b/i.test(t)) return true;
  if (/\b(bulk\s+discount|bulk\s+(?:buy|purchase)|quantity\s+discount)\b/i.test(t)) return true;
  if (/\bbulk\b/i.test(t) && /\b(discount|promo|offer|oct35|challenge)\b/i.test(t)) return true;
  if (/instant\s*elite/i.test(t) && /(50|100|200|300|400)\s*k\b/i.test(t) && !looksLikeMixedNonPromoQuestion(t)) return true;
  return false;
}

/** Build recent public user+admin/bot comments for promo conversation context (last N). */
function buildPromoConversationHistory(conv, maxN) {
  const out = [];
  const srcMsg = (conv && conv.source) || {};
  if (srcMsg.body) {
    const a = srcMsg.author || {};
    const role = a.type === 'user' || a.type === 'lead' ? 'user' : 'assistant';
    const text = stripHtml(srcMsg.body || '').trim();
    if (text) out.push({ role, text });
  }
  const parts = partsOf(conv || {});
  for (const p of parts) {
    if (!p) continue;
    if (String(p.part_type || '') !== 'comment') continue;
    const a = p.author || {};
    const text = stripHtml(p.body || '').trim();
    if (!text) continue;
    if (a.type === 'user' || a.type === 'lead') out.push({ role: 'user', text });
    else if (a.type === 'admin' || a.type === 'bot') out.push({ role: 'assistant', text });
  }
  const n = Math.max(4, Math.min(Number(maxN) || 16, 20));
  return out.slice(-n);
}

/**
 * Promo short-circuit resolver with conversation history.
 * Returns { reply } to send, or null to fall through to FAQ/AI (rules / mixed / no promo).
 */
function resolvePromoReply(text, conv) {
  if (!septemberPromos) return null;
  if (partnershipIntent && typeof partnershipIntent.blocksPromoAutoReply === 'function' && partnershipIntent.blocksPromoAutoReply(text)) {
    return null;
  }
  if (isClearlyAccountSpecificIssue(text)) return null;
  const history = buildPromoConversationHistory(conv, 18);
  {
    const __mix = softEdges.shouldBypassPromoShortCircuit(text, history);
    if (__mix.bypass) {
      if (__mix.classification && __mix.classification.systemHint && typeof global !== 'undefined') {
        global.__lunaSoftEdgePromoHint = __mix.classification.systemHint;
      }
      return null;
    }
  }
  /* AUDIT_HARDEN_V1:promoScopeGate */
  if (typeof softEdges.isResetFeeOrAccountDiscountAsk === 'function' && softEdges.isResetFeeOrAccountDiscountAsk(text)) {
    return null;
  }
  if (
    typeof softEdges.isBareDiscountAsk === 'function' &&
    softEdges.isBareDiscountAsk(text) &&
    typeof softEdges.historyLooksLikeResetFeeContext === 'function' &&
    softEdges.historyLooksLikeResetFeeContext(history)
  ) {
    return null;
  }
  const planDiffNow =
    typeof septemberPromos.isPlanDifferenceOrFeaturesAsk === 'function' &&
    septemberPromos.isPlanDifferenceOrFeaturesAsk(text);
  const featuresCtx =
    typeof septemberPromos.historyLooksLikePlanDifference === 'function' &&
    septemberPromos.historyLooksLikePlanDifference(history);
  const promoSigNow =
    typeof septemberPromos.isPromoSignal === 'function'
      ? septemberPromos.isPromoSignal(text)
      : /\b(discount|promo|coupon|offer|oct35|%\s*off)\b/i.test(String(text || ''));
  // Plan-difference / features topic (incl. short "2 step" follow-up) → NEVER promo short-circuit
  if ((planDiffNow || featuresCtx) && !promoSigNow) return null;
  const histLooks =
    typeof septemberPromos.historyLooksLikePromotions === 'function' &&
    septemberPromos.historyLooksLikePromotions(history);
  const shortFollow =
    typeof septemberPromos.isShortPromoFollowUp === 'function' &&
    septemberPromos.isShortPromoFollowUp(text, history);
  const gate =
    isPromotionQuestion(text) ||
    histLooks ||
    shortFollow;
  if (!gate) return null;
  // Mixed rules+non-promo on a fresh (no promo history) ask → fall through
  if (looksLikeMixedNonPromoQuestion(text) && !histLooks && !shortFollow) return null;

  let result = null;
  try {
    if (typeof septemberPromos.handleCustomerMessage === 'function') {
      result = septemberPromos.handleCustomerMessage(text, history);
    } else if (typeof septemberPromos.answerPromotionQuestion === 'function') {
      result = septemberPromos.answerPromotionQuestion(text, history);
    }
  } catch (e) {
    console.error('PROMO_RESOLVE_FAIL', 'class=' + (e && e.name || 'Error'));
    return null;
  }
  if (result == null) return null;
  if (typeof result === 'object' && result.useExistingRulesFlow) return null;
  let reply = typeof result === 'string' ? result : result && result.reply;
  if (!reply || !String(reply).trim()) return null;
  if (typeof septemberPromos.sanitizePromoCustomerText === 'function') {
    reply = septemberPromos.sanitizePromoCustomerText(reply);
  }
  if (!reply || !String(reply).trim()) return null;
  if (typeof septemberPromos.hasPromoInstructionLeak === 'function' && septemberPromos.hasPromoInstructionLeak(reply)) {
    return null;
  }
  const product =
    typeof septemberPromos.detectProduct === 'function' ? septemberPromos.detectProduct(text) : '';
  return { reply: String(reply).trim(), product, historyLen: history.length };
}

function isPromotionQuestionWithHistory(text, conv) {
  if (isPromotionQuestion(text)) return true;
  if (!septemberPromos || !conv) return false;
  const history = buildPromoConversationHistory(conv, 18);
  if (
    typeof septemberPromos.historyLooksLikePromotions === 'function' &&
    septemberPromos.historyLooksLikePromotions(history)
  ) {
    return true;
  }
  if (
    typeof septemberPromos.isShortPromoFollowUp === 'function' &&
    septemberPromos.isShortPromoFollowUp(text, history)
  ) {
    return true;
  }
  return false;
}

function isGeneralPolicyQuestion(text) {
  let t = String(text || '');
  // Read obvious typos through, so "drawdon" is still the drawdown policy (owner rule 2026-09-21).
  try { t = require('./statePresend/typoNormalizer').normalizeText(t); } catch (_) {}
  if (isClearlyAccountSpecificIssue(t)) return false;
  if (typeof isReviewNotificationProcessAsk === 'function' && isReviewNotificationProcessAsk(t)) return true;
  if (isPromotionQuestion(t)) return true;
  // "is the consistency rule in the account" / "does my account have X rule"
  if (/\b(is|does|do)\b[\s\S]{0,40}\b(consistency|profit\s*split|drawdown|daily\s+loss|max(?:imum)?\s+loss|leverage|payout\s+schedule|minimum\s+(?:payout|withdrawal)|reset|second\s+chance|scalping|news\s+trading|ea|expert\s+advisor|weekend\s+hold(?:ing)?|fee[ -]?back|profit\s+target)\b/i.test(t)) {
    return true;
  }
  if (/\b(what\s+is|what'?s|how\s+does|how\s+do|explain|tell\s+me\s+about)\b[\s\S]{0,60}\b(consistency|profit\s*split|drawdown|leverage|payout|reset|rule|policy|kyc|withdrawal|minimum)\b/i.test(t)) {
    return true;
  }
  if (/\bwhat\s+are\s+the\s+rules\b/i.test(t)) return true;
  if (/\b(don'?t|do\s+not)\s+pass\b/i.test(t) && /\b(rule|consistency|policy)\b/i.test(t)) return true;
  try {
    if (policyFactGuard && policyFactGuard.isGeneralPolicyQuestionExtra(t)) return true;
  } catch (_) {}
  return false;
}

function isIdentityAskBody(text) {
  const t = String(text || '');
  // Matches our gate asks (full or missing-field-only variants)
  if (!/(account\s*number|account\s*#|registered\s+email|fundedelite\s+email)/i.test(t)) return false;
  return /(please\s+share|can\s+you\s+send|before\s+i\s+pass|forward|teammate|team)/i.test(t);
}

function hasArsalEscalateNote(parts) {
  for (const p of parts || []) {
    if (String(p.part_type || '') !== 'note') continue;
    if (String((p.author || {}).id || '') !== ARSAL_ID) continue;
    if (isEscalateOrSystemNote(stripHtml(p.body || ''))) return true;
  }
  return false;
}

function isPendingIdentityAsk(parts) {
  let last = '';
  for (const p of parts || []) {
    const a = p.author || {};
    if (String(a.id || '') !== ARSAL_ID) continue;
    if (String(p.part_type || '') === 'note') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    last = body;
  }
  return isIdentityAskBody(last);
}

// --- Identity recall (merged from client-info-recall concepts; live path stays index.js) ---
const IDENTITY_REQUEST_HINT =
  /(please\s+)?(share|provide|send|confirm|give|enter|drop|type)\b|\bwhat\s+is\s+your\b|\bneed\s+your\b|\bcan\s+you\s+(share|send|provide)\b|\bbefore\s+i\s+pass\b|\bforward\b|\bteammate\b/i;

const MAX_IDENTITY_ASKS_PER_FIELD = 2; // 1 clear ask + 1 clarification max

/** Real identity only — placeholders / empty must not unlock ACCOUNT escalate. */
function isUsableEscalateAccount(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  if (isNonAccountLine(s)) return false;
  if (/^not provided\b/i.test(s)) return false;
  if (/unclear after asks/i.test(s)) return false;
  return true;
}
function isUsableEscalateEmail(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  if (/^not provided\b/i.test(s)) return false;
  if (/unclear after asks/i.test(s)) return false;
  return s.includes('@');
}
/**
 * Identity present enough to continue a gate decision.
 * Account-specific NOTE writing still requires a trading account via
 * ACCOUNT_NOTE_NO_PLACEHOLDER_V1 in resolveIdentityAskDecision (email alone is
 * not enough there). Email remains usable for general identity unlock.
 */
function hasUsableEscalateIdentity(ids, declinedAccount, declinedEmail) {
  if (declinedAccount || declinedEmail) return true;
  return isUsableEscalateAccount(ids && ids.account) || isUsableEscalateEmail(ids && ids.email);
}


function detectIdentityAskFields(text) {
  const t = String(text || '');
  if (!t) return { account: false, email: false };
  // Shared tight detector: request verb / question in the SAME sentence as the field noun.
  // Bare mentions ("your account is under review", "we'll email you", "they have your
  // account details") are NOT asks , previously they were, which blocked normal replies
  // and forced spurious escalations / inflated ask counts.
  const out = idGates.detectIdentityAskFields(t);
  if (isIdentityAskBody(t)) {
    // Our own gate ask variants always count.
    if (/account\s*(number|#)/i.test(t) && !/e-?mail[\s\S]{0,40}account\s+\d{5,12}/i.test(t)) out.account = true;
    if (/(registered|fundedelite)\s+e-?mail/i.test(t)) out.email = true;
  }
  // Explicit MT5 login/ID request counts as an account ask (never client-visible by lock).
  if (/\bmt5\s*(login|account|id)\b/i.test(t) && IDENTITY_REQUEST_HINT.test(t)) out.account = true;
  return out;
}

function lastBotPublicIdentityPending(parts) {
  for (let i = (parts || []).length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!p) continue;
    const a = p.author || {};
    if (String(p.part_type || '') === 'note') continue;
    if (String(a.id || '') !== ARSAL_ID && a.type !== 'bot') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    const fields = detectIdentityAskFields(body);
    if (fields.account || fields.email) {
      return { account: fields.account, email: fields.email, body };
    }
    // Stop at last bot public comment even if it wasn't an ask
    return null;
  }
  return null;
}

function countIdentityFieldAsks(parts, field) {
  let n = 0;
  for (const p of parts || []) {
    const a = p.author || {};
    if (String(p.part_type || '') === 'note') continue;
    if (String(a.id || '') !== ARSAL_ID && a.type !== 'bot') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    const f = detectIdentityAskFields(body);
    if (field === 'account' && f.account) n += 1;
    if (field === 'email' && f.email) n += 1;
  }
  return n;
}

function extractAccountsFromPendingReply(text) {
  // Contextual: after an account ask, accept 5-12 / letter+digit / spaced from the reply.
  const s = String(text || '');
  const out = extractAccountNumbersFromText(s);
  if (out.length) return out;
  // Bare token in a longer sentence already covered by \d{5,12}; keep letter+digit fallback
  for (const m of s.matchAll(/\b[A-Za-z]\d{4,}\b/g)) {
    const x = m[0];
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

function applyContextualPendingIds(conversation, ids) {
  const parts = partsOf(conversation);
  const pending = lastBotPublicIdentityPending(parts);
  if (!pending) return ids;
  const clientTexts = collectClientMessageTexts(conversation);
  const latest = clientTexts.length ? clientTexts[clientTexts.length - 1] : '';
  if (!latest) return ids;
  const next = { ...ids, accounts: (ids.accounts || []).slice(), emails: (ids.emails || []).slice() };
  if (pending.account && !next.account) {
    const found = extractAccountsFromPendingReply(latest).filter(
      (t) => !accountNumberPrefer.isBlockedNoise(t, latest)
    );
    if (found.length) {
      for (let i = found.length - 1; i >= 0; i--) {
        if (!next.accounts.includes(found[i])) next.accounts.unshift(found[i]);
      }
      next.account = accountNumberPrefer.formatAccountField(found) || found[0];
    }
  }
  if (pending.email && !next.email) {
    const emails = extractEmailsFromText(latest).filter(isUsableClientEmail);
    if (emails[0]) {
      next.email = emails[0];
      if (!next.emails.find((e) => e.toLowerCase() === emails[0].toLowerCase())) {
        next.emails.unshift(emails[0]);
      }
    }
  }
  return next;
}

function draftAsksIdentityFields(draft) {
  return detectIdentityAskFields(draft);
}

/** Pre-send gate: block re-asks of known OR declined identity; block email ask when account enough. */
function preSendIdentityCheck(conversation, draftMessage) {
  const draft = String(draftMessage || '').trim();
  if (!draft) return { ok: false, reason: 'empty draft', known: null, asks: null };
  let ids = collectEscalateIds(conversation, {}, '');
  ids = applyContextualPendingIds(conversation, ids);
  const declinedAccount = clientSaidNoAccount(conversation);
  const declinedEmail = clientSaidNoEmail(conversation);
  const asks = draftAsksIdentityFields(draft);
  const manyAccounts = Array.isArray(ids.accounts) && ids.accounts.length > 1;
  const whichAccountAsk = /\bwhich account\b/i.test(draft);
  const gateIds = {
    accountNumber: (manyAccounts && whichAccountAsk) ? null : (ids.account || null),
    email: ids.email || null,
    declinedAccount,
    declinedEmail,
  };
  const cls = classifyAuthAccessFromConversation(conversation);
  if (cls.useEmailIdentity) {
    gateIds.accountUnavailable = !!cls.unavailable;
    gateIds.authAccessWaive = true;
  }
  const gated = idGates.preSendIdentityCheck(gateIds, draft);
  if (!gated.ok) {
    return { ok: false, reason: gated.reason, known: ids, asks };
  }
  if (asks.account && ids.account) {
    // Several proven accounts, and the draft only asks which one is affected.
    // That is not a re-ask for a number the client already gave.
    const many = Array.isArray(ids.accounts) && ids.accounts.length > 1;
    const whichAsk = /\bwhich account\b/i.test(draft);
    if (!(many && whichAsk)) {
      return {
        ok: false,
        reason: 'account already known (' + ids.account + ') , do not re-ask',
        known: ids,
        asks,
      };
    }
  }
  if (asks.account && declinedAccount) {
    return {
      ok: false,
      reason: 'client declined account , do not re-ask',
      known: ids,
      asks,
    };
  }
  if (asks.account && !isRealTradingAccount(ids.account) && cls.useEmailIdentity) {
    return {
      ok: false,
      reason: 'account number is not required for this login/access issue',
      known: ids,
      asks,
    };
  }
  if (asks.email && ids.email) {
    return {
      ok: false,
      reason: 'email already known (' + ids.email + ') , do not re-ask',
      known: ids,
      asks,
    };
  }
  if (asks.email && declinedEmail) {
    return {
      ok: false,
      reason: 'client declined email , do not re-ask',
      known: ids,
      asks,
    };
  }
  if (asks.email && ids.account) {
    return {
      ok: false,
      reason: 'account ' + ids.account + ' already enough for escalate , do not ask email',
      known: ids,
      asks,
    };
  }
  return { ok: true, reason: null, known: ids, asks };
}

/**
 * Original account provenance for this conversation.
 * Luna/bot notes, public replies, and summaries are never a root source.
 * A human Account: field or explicit identification can be, unless the client
 * used that same number only as something else (followers, balance, and so on).
 */
function accountProvenance(conversation, bits) {
  const clientTexts = [];
  try {
    if (conversation) clientTexts.push(...(collectClientMessageTexts(conversation) || []));
  } catch (_) {}
  let proven = [];
  try {
    if (conversation) proven = provenAccountRepliesFromConversation(conversation) || [];
  } catch (_) {}
  const humanTexts = [];
  const pushHuman = (author, part, body) => {
    if (!body) return;
    if (accountNumberPrefer.isDerivedAccountAuthor(author, part)) return;
    const type = String((author && author.type) || '').toLowerCase();
    if (type !== 'admin' && type !== 'team') return;
    humanTexts.push(stripHtml(body));
  };
  if (conversation) {
    const src = conversation.source || {};
    if (src.body) pushHuman(src.author || {}, { author: src.author || {}, part_type: 'comment' }, src.body);
    for (const p of partsOf(conversation)) {
      if (!p) continue;
      const pt = String(p.part_type || '');
      if (pt !== 'note' && pt !== 'comment') continue;
      pushHuman(p.author || {}, p, p.body || '');
    }
  }
  let structured = [];
  try {
    structured = accountNumberPrefer.collectStructuredTradingAccounts(conversation, bits);
  } catch (_) {}
  return accountNumberPrefer.selectProvenAccounts({
    clientTexts,
    provenTokens: proven,
    structuredTokens: structured,
    humanTexts,
  });
}

function trustedExplicitAccount(conversation) {
  try {
    const selected = accountProvenance(conversation);
    if (!selected || !selected.all || !selected.all.length) return '';
    return accountNumberPrefer.formatAccountField(selected.all);
  } catch (_) {
    return '';
  }
}

function classifyAuthAccessFromConversation(conversation) {
  const texts = collectClientMessageTexts(conversation).slice(-8);
  const unavailable = texts.some((t) => idGates.clientCannotProvideAccountNumber(t));
  const auth = texts.some((t) => idGates.isAuthAccessIssue(t));
  const trading = texts.some((t) => idGates.tradingAccountNumberRequired(t));
  return {
    unavailable,
    auth,
    trading,
    useEmailIdentity: unavailable || (auth && !trading),
    reason: unavailable ? 'cannot-provide' : (auth && !trading ? 'auth-access' : ''),
  };
}

function isRealTradingAccount(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  if (isNonAccountLine(s)) return false;
  if (/^not provided\b/i.test(s)) return false;
  if (s === idGates.AUTH_ACCESS_ACCOUNT_LINE) return false;
  try {
    if (internalNoteFormat.isBareAccountPlaceholder(s)) return false;
  } catch (_) {}
  return true;
}

const ACCOUNT_CLARIFY_TEXT = 'Could you please share the account number where you\'re experiencing this issue?';
const ACCOUNT_WHICH_TEXT = 'You shared more than one account number. Which account is affected?';
const ACCOUNT_CONFIRM_TEXT = 'Could you confirm the trading account number this is about?';
const ACCOUNT_HOLDING_TEXT = 'I still need the trading account number before this can go to a teammate, so I have not passed it on.';
const ACCOUNT_NOTE_ONLY_ACK = 'I saved the case details, but the assignment did not go through, so I can\'t confirm a teammate has it yet.';
const ACCOUNT_HANDOFF_ACK = 'I\'ve forwarded this to a human support teammate. You\'ll receive an update soon.';
const NON_ACCOUNT_LINE = 'not required (non-account issue)';

function isNonAccountLine(value) {
  return String(value || '').trim().toLowerCase() === NON_ACCOUNT_LINE;
}

function provenAccountLogCount(acct) {
  const s = String(acct || '').trim();
  if (!s || /^not provided\b/i.test(s) || /^not available\b/i.test(s)) return 0;
  try {
    if (s === idGates.AUTH_ACCESS_ACCOUNT_LINE) return 0;
    if (internalNoteFormat.isBareAccountPlaceholder(s)) return 0;
  } catch (_) {}
  return s.split(/\s*,\s*/).filter((p) => {
    const t = String(p || '').trim();
    return t && !/^not provided\b/i.test(t);
  }).length;
}

/**
 * Public text after an escalation attempt. A missing note is not a handoff.
 * A note without assignment is not a full handoff. Both must succeed before
 * the forwarded acknowledgement is eligible.
 */
function escalationClientAck(opts) {
  const o = opts || {};
  const preferred = String(o.preferred || '');
  const where = o.where || '';
  if (!o.noteOk) {
    console.log('ESCALATION_ACTION_FAILED', 'note', where);
    return handoffClaimGate.TRUTHFUL_NO_HANDOFF_FALLBACK;
  }
  if (!o.assignOk) {
    console.log('ESCALATION_ACTION_FAILED', 'assign', where);
    const stripped = stripHandoffClaims(preferred);
    // A claim-only draft strips to the no-handoff fallback. The note was saved, so say that.
    if (
      String(stripped || '').trim() &&
      stripped !== handoffClaimGate.TRUTHFUL_NO_HANDOFF_FALLBACK &&
      !handoffClaimGate.hasHandoffClaim(stripped)
    ) return stripped;
    return ACCOUNT_NOTE_ONLY_ACK;
  }
  console.log('ESCALATION_READY', 'note-and-assigned', where);
  return preferred || ACCOUNT_HANDOFF_ACK;
}

function latestRefersToOpenCase(text) {
  return /\b(?:hiervan|hierover|hierop|daarvan|ervan|about this|about that|this issue|same issue)\b/i.test(String(text || ''));
}

function accountListAmbiguous(host) {
  const t = String(host || '');
  if (/\b(?:beide|allebei|both(?:\s+of\s+them)?|all of them|both accounts|these accounts)\b/i.test(t)) return false;
  return /\b(?:one of (?:them|these|my accounts)|not sure which|which (?:one|account)|een van(?:\s+de|\s+mijn)?|niet zeker welke|either account)\b/i.test(t);
}

/**
 * A later follow-up still belongs to a trading-account investigation when an
 * earlier turn asked for the account number, or an earlier client message was
 * account work, and this message refers back to that case.
 * A fresh policy question does not inherit that requirement.
 */
function conversationHasOpenAccountInvestigation(conversation, clientTexts) {
  const texts = Array.isArray(clientTexts) ? clientTexts : [];
  const latest = texts.length ? String(texts[texts.length - 1] || '') : '';
  let staffAsked = false;
  try {
    staffAsked = countIdentityFieldAsks(partsOf(conversation), 'account') > 0;
  } catch (_) {}
  let priorAccountWork = false;
  for (let i = 0; i < texts.length - 1; i++) {
    const t = texts[i];
    if (!t) continue;
    if (
      isClearlyAccountSpecificIssue(t) ||
      idGates.tradingAccountNumberRequired(t) ||
      idGates.payoutRejectionRequiresAccount(t)
    ) {
      priorAccountWork = true;
      break;
    }
    let mentions = [];
    try {
      mentions = accountNumberPrefer.extractExplicitAccountMentions(t).filter(
        (tok) => !accountNumberPrefer.isBlockedNoise(tok, t)
      );
    } catch (_) {}
    if (mentions.length) {
      priorAccountWork = true;
      break;
    }
  }
  if (!staffAsked && !priorAccountWork) return false;
  if (
    isClearlyAccountSpecificIssue(latest) ||
    idGates.tradingAccountNumberRequired(latest) ||
    idGates.payoutRejectionRequiresAccount(latest) ||
    latestRefersToOpenCase(latest)
  ) {
    return true;
  }
  return false;
}

function escalationClarificationText(resolved, needAccount, needEmail) {
  const reason = resolved && resolved.decision && resolved.decision.reason;
  if (reason === 'ambiguous_account') return ACCOUNT_WHICH_TEXT;
  // Account-only recovery never promises a handoff. The number is not in yet.
  if (needAccount && !needEmail) return ACCOUNT_CLARIFY_TEXT;
  return pickAccountEmailAsk(needAccount, needEmail);
}

function accountClarificationAlreadyActive(conversation) {
  let pending = null;
  try {
    pending = lastBotPublicIdentityPending(partsOf(conversation));
  } catch (_) {
    pending = null;
  }
  if (!pending || !pending.account) return false;
  const texts = collectClientMessageTexts(conversation);
  const latest = texts.length ? texts[texts.length - 1] : '';
  const found = extractAccountsFromPendingReply(latest).filter(
    (t) => !accountNumberPrefer.isBlockedNoise(t, latest)
  );
  return !found.length;
}

/** Map live ids + declines through idGates.pickAccountEmailAsk decision. */
function resolveIdentityAskDecision(conversation, ids, kind) {
  const partsGate = partsOf(conversation);
  const declinedAccount = clientSaidNoAccount(conversation);
  const declinedEmail = clientSaidNoEmail(conversation);
  const acctAsks = countIdentityFieldAsks(partsGate, 'account');
  const emailAsks = countIdentityFieldAsks(partsGate, 'email');
  if (!isUsableEscalateAccount(ids.account)) {
    const trusted = trustedExplicitAccount(conversation);
    if (trusted) {
      ids.account = trusted;
      if (!Array.isArray(ids.accounts)) ids.accounts = [];
      if (!ids.accounts.includes(trusted)) ids.accounts.unshift(trusted);
    }
  }
  const clientTexts = collectClientMessageTexts(conversation);
  const latestClient = clientTexts.length ? clientTexts[clientTexts.length - 1] : '';
  const cls = classifyAuthAccessFromConversation(conversation);
  // A human handoff request keeps the existing identity rule. A profile email is
  // still not the trading account on a payout rejection.
  const requireAccountNumber = !clientWantsHumanTeammate(latestClient) &&
    idGates.payoutRejectionRequiresAccount(latestClient);
  let decision = idGates.pickAccountEmailAsk({
    accountNumber: isRealTradingAccount(ids.account) ? ids.account : null,
    email: ids.email || null,
    declinedAccount,
    declinedEmail,
    kind: kind === 'EMAIL_REQUIRED' ? 'EMAIL_REQUIRED' : 'ACCOUNT',
    alreadyAskedAccount: acctAsks >= MAX_IDENTITY_ASKS_PER_FIELD,
    alreadyAskedEmail: emailAsks >= MAX_IDENTITY_ASKS_PER_FIELD,
    requireAccountNumber,
    tradingAccountIssue: cls.trading && !cls.unavailable,
    authAccessIssue: cls.auth && !cls.trading && !cls.unavailable,
    accountUnavailable: cls.unavailable,
  });
  if (declinedAccount && !isRealTradingAccount(ids.account) && !ids.account) {
    ids.account = 'Not provided (client has no account / not purchased)';
  }
  if (
    !declinedAccount &&
    cls.useEmailIdentity &&
    !isRealTradingAccount(ids.account) &&
    decision.ask !== 'account' &&
    decision.ask !== 'email'
  ) {
    ids.account = idGates.AUTH_ACCESS_ACCOUNT_LINE;
    ids.authAccessNote = true;
  }
  if (declinedEmail && !ids.email) {
    ids.email = 'Not provided (client has no email)';
  }
  // Never invent "Not provided (unclear after asks)" — that unlocked empty escalations
  // and public "sent to teammate" replies before the client shared an account number.
  // Exhausted asks => wait (gates return ready:false awaiting_client_identity_after_asks).
  let needAccount = decision.ask === 'account';
  let needEmail = decision.ask === 'email';
  let readyOut = !!decision.ready;
  // Fail closed: exhausted/ready without a real account/email (and no decline) is NOT ready.
  if (readyOut && !hasUsableEscalateIdentity(ids, declinedAccount, declinedEmail)) {
    readyOut = false;
    if (!needAccount && !needEmail) {
      // Keep waiting for client rather than unlocking empty escalate.
      needAccount = !ids.account && !declinedAccount;
      needEmail = false;
    }
  }
  // ACCOUNT_NOTE_NO_PLACEHOLDER_V1: for account-specific / human / payout-rejection work,
  // email alone (email_sufficient) must not unlock a note that would say
  // "Account: Not provided". General FAQ/policy stays on the existing identity rule.
  // ESCALATION_IDENTITY_DEADLOCK_V1: a follow-up in an open trading-account
  // investigation is the same requirement. Profile email does not identify the account.
  if (readyOut && !isUsableEscalateAccount(ids.account) && !declinedAccount && !cls.useEmailIdentity) {
    const latestForAcct = clientTexts.length ? clientTexts[clientTexts.length - 1] : '';
    let accountWork = !!requireAccountNumber || (cls.trading && !cls.unavailable);
    let inheritedInvestigation = false;
    try {
      if (
        typeof isClearlyAccountSpecificIssue === 'function' &&
        isClearlyAccountSpecificIssue(latestForAcct)
      ) {
        accountWork = true;
      }
    } catch (_) {}
    try {
      if (typeof clientWantsHumanTeammate === 'function' && clientWantsHumanTeammate(latestForAcct)) {
        accountWork = true;
      }
    } catch (_) {}
    if (!accountWork) {
      try {
        inheritedInvestigation = conversationHasOpenAccountInvestigation(conversation, clientTexts);
      } catch (_) {
        inheritedInvestigation = false;
      }
      if (inheritedInvestigation) accountWork = true;
    }
    if (accountWork) {
      readyOut = false;
      if (inheritedInvestigation && acctAsks >= MAX_IDENTITY_ASKS_PER_FIELD) {
        needAccount = false;
        needEmail = false;
        decision = Object.assign({}, decision, {
          ready: false,
          ask: null,
          reason: 'trading_account_awaiting_account',
        });
        console.log('ESCALATION_NOT_READY', 'awaiting-account');
      } else {
        needAccount = true;
        needEmail = false;
        // Email on file must not remain the reason once a trading account is required.
        if (decision.reason === 'email_sufficient' || decision.ask !== 'account') {
          decision = Object.assign({}, decision, {
            ready: false,
            ask: 'account',
            reason: 'trading_account_required',
          });
          console.log('ESCALATION_MISSING_REQUIRED_ACCOUNT');
          console.log('IDENTITY_EMAIL_ONLY');
          console.log('IDENTITY_CLARIFICATION_NEEDED', 'account');
        }
      }
    }
  }
  if (readyOut && Array.isArray(ids.accounts) && ids.accounts.length > 1) {
    const host = clientTexts.find((t) => ids.accounts.every((a) => String(t || '').indexOf(a) !== -1)) || latestClient;
    if (accountListAmbiguous(host)) {
      readyOut = false;
      needAccount = true;
      needEmail = false;
      decision = Object.assign({}, decision, {
        ready: false,
        ask: 'account',
        reason: 'ambiguous_account',
      });
      console.log('ESCALATION_AMBIGUOUS_ACCOUNT', 'count=' + ids.accounts.length);
    }
  }
  return {
    decision,
    needAccount,
    needEmail,
    ready: readyOut,
    declinedAccount,
    declinedEmail,
    noteExtraLines: idGates
      .identityEscalationNoteExtras({
        accountNumber: isRealTradingAccount(ids.account) ? ids.account : null,
        email: ids.email && !String(ids.email).startsWith('Not provided') ? ids.email : null,
        declinedAccount,
        declinedEmail,
        authAccessNote: !!ids.authAccessNote,
      })
      .filter((l) => String(l).startsWith('Note:')),
  };
}

function provenanceDisagrees(conversation, ids) {
  const acct = String((ids && ids.account) || '').trim();
  if (!isRealTradingAccount(acct)) return false;
  let trusted = '';
  try { trusted = trustedExplicitAccount(conversation); } catch (_) { trusted = ''; }
  if (!trusted) return true;
  const have = new Set(String(trusted).split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean));
  return acct.split(/\s*,\s*/).some((part) => part && !have.has(part.trim()));
}

function holdingForMissingAccount(resolved, reason) {
  return { ask: ACCOUNT_HOLDING_TEXT, resolved, reason: reason || 'holding-awaiting-account', holding: true };
}

function recoverUntrustedAccount(conversation, resolved, reason) {
  let asks = 0;
  try { asks = countIdentityFieldAsks(partsOf(conversation), 'account'); } catch (_) { asks = 0; }
  if (accountClarificationAlreadyActive(conversation) || asks >= MAX_IDENTITY_ASKS_PER_FIELD) {
    return holdingForMissingAccount(resolved, 'holding-awaiting-account');
  }
  console.log('ESCALATION_DEFERRED_WITH_RECOVERY', 'untrusted-account');
  return { ask: ACCOUNT_CONFIRM_TEXT, resolved, reason: 'confirm-trading-account' };
}

function deferredIdentityAsk(conversation, ids, kind, opts) {
  const base = ids && typeof ids === 'object' ? ids : collectEscalateIds(conversation, {}, '');
  const resolved = resolveIdentityAskDecision(conversation, base, kind || 'ACCOUNT');
  const noteMissing = opts && opts.noteDeferredReason === 'missing_account';
  // PREPURCHASE_ACCOUNT_V1: never tell a pre-purchase client the case cannot be passed on
  // because a trading account number is missing. Use the non-account note path instead.
  if (noteMissing) {
    let texts = [];
    try { texts = collectClientMessageTexts(conversation) || []; } catch (_) { texts = []; }
    const latest = texts.length ? texts[texts.length - 1] : '';
    if (prePurchaseGate.skipTradingAccountIdentity(texts, latest)) {
      console.log('PREPURCHASE_ACCOUNT skip-holding');
      return { ask: '', resolved, reason: 'pre-purchase-non-account', skipNonAccount: true };
    }
  }
  if (!(resolved.needAccount || resolved.needEmail)) {
    const reason = (resolved.decision && resolved.decision.reason) || 'no-ask';
    if (noteMissing && reason === 'email_sufficient') {
      console.log('IDENTITY_EMAIL_ONLY');
      console.log('ESCALATION_DEFERRED_WITH_RECOVERY', 'not-account-investigation');
      return { ask: '', resolved, reason, skipNonAccount: true };
    }
    if (noteMissing && provenanceDisagrees(conversation, base)) {
      return recoverUntrustedAccount(conversation, resolved, reason);
    }
    if (noteMissing && (reason === 'trading_account_awaiting_account' || reason === 'payout_rejection_awaiting_account')) {
      return holdingForMissingAccount(resolved, 'holding-awaiting-account');
    }
    return { ask: '', resolved, reason };
  }
  if (resolved.needAccount && accountClarificationAlreadyActive(conversation)) {
    console.log('ESCALATION_NOT_READY', 'clarification-active');
    if (noteMissing) return holdingForMissingAccount(resolved, 'clarification-active');
    return { ask: '', resolved, reason: 'clarification-active' };
  }
  const ask = escalationClarificationText(resolved, !!resolved.needAccount, !!resolved.needEmail);
  const pre = preSendIdentityCheck(conversation, ask);
  if (!pre.ok) return { ask: '', resolved, reason: pre.reason || 'presend-blocked' };
  if (noteMissing) console.log('ESCALATION_DEFERRED_WITH_RECOVERY', resolved.decision && resolved.decision.reason);
  if (resolved.decision && resolved.decision.reason === 'ambiguous_account') {
    console.log('IDENTITY_CLARIFICATION_NEEDED', 'which-account');
  }
  return { ask, resolved, reason: 'ask' };
}

async function routePartnershipBusiness({ conversationId, full, text, latestUser, clientName, parts }) {
  if (!partnershipIntent || !conversationId) return { handled: false };
  const business = partnershipIntent.needsBusinessHandoff(text);
  let prior = {};
  try { prior = getConvState(conversationId).state || {}; } catch (_) { prior = {}; }
  const awaiting = !!prior.partnershipAwaitingTeammate && !!prior.partnershipNoteOk;
  const pending = !!prior.partnershipRoutePending && !prior.partnershipNoteOk;
  const bare = typeof partnershipIntent.isBareFollowUp === 'function' && partnershipIntent.isBareFollowUp(text);
  if (!business && !(awaiting && bare) && !(pending && (business || bare))) return { handled: false };

  const limit = partnershipIntent.LIMIT_LINE;
  const noAcct = "I don't need a trading account number for this request.";
  const retryLine = "It has not been passed to a teammate. Please reply again and I will try once more.";
  const sendPublic = async (msg) => {
    const body = postProcessModelReply(msg, conversationId);
    if (!String(body || '').trim()) return;
    await postClientCommentOnce(conversationId, body, latestUser, clientName);
  };
  const ownParts = parts || (full && full.conversation_parts && full.conversation_parts.conversation_parts) || [];
  const handoffOpts = {
    arsalId: ARSAL_ID,
    eliteAiId: ELITE_AI_ID,
    jerryId: typeof JERRY_ID !== 'undefined' ? JERRY_ID : '',
    escalationsTeamId: typeof ESCALATIONS_TEAM_ID !== 'undefined' ? ESCALATIONS_TEAM_ID : '',
    riskTeamId: typeof RISK_TEAM_ID !== 'undefined' ? RISK_TEAM_ID : '',
    riskTeamAdminId: typeof RISK_TEAM_ADMIN_ID !== 'undefined' ? RISK_TEAM_ADMIN_ID : '',
  };
  let humanOwns = false;
  try {
    humanOwns = teammateHandoffGates.isAssignedToHumanTeammate(full, handoffOpts) ||
      teammateHandoffGates.isAssignedToProtectedTeam(full, handoffOpts) ||
      teammateHandoffGates.humanTeammateAlreadyRepliedPublic(ownParts, handoffOpts) ||
      teammateHandoffGates.humanTeammateSourceOpener(full, handoffOpts);
  } catch (_) { humanOwns = false; }
  try { if ((continuousOwnershipOf(ownParts) || {}).active) humanOwns = true; } catch (_) {}
  if (humanOwns) {
    await sendPublic(limit);
    console.log('PARTNERSHIP_ROUTE human-owned', conversationId);
    return { handled: true, reason: 'human_owned' };
  }

  if (awaiting) {
    await sendPublic(limit + '\n\n' + noAcct);
    console.log('PARTNERSHIP_ALREADY_ROUTED', conversationId);
    return { handled: true, reason: 'already_routed' };
  }

  const problem = 'The client is requesting a business partnership, affiliate collaboration, custom audience coupon, or promotional accounts. A human teammate needs to decide. This is not a trading-account support case.';
  const actionNeeded = 'Review this partnership or business-collaboration request and reply to the client. Do not promise approval, a custom coupon, or a free or funded account.';
  let built = null;
  try {
    built = await buildEscalateNoteAndAssignee({
      problem,
      actionNeeded,
      account: '',
      email: '',
      conversation: full,
      forceNonAccount: true,
    });
  } catch (e) {
    console.error('PARTNERSHIP_ROUTE build fail', 'class=' + (e && e.name || 'Error'));
  }

  const mark = (noteOk, assignOk, assigneeId, routed) => {
    const st = getConvState(conversationId).state;
    st.partnershipAwaitingTeammate = !!routed;
    st.partnershipNoteOk = !!noteOk;
    st.partnershipAssignedOk = !!assignOk;
    st.partnershipRoutePending = !routed;
    if (assigneeId) st.partnershipAssigneeId = String(assigneeId);
    saveConvState(conversationId, st);
  };

  const postNoteRetry = async (html) => {
    let last = { ok: false };
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        last = await postReply(conversationId, 'note', html);
      } catch (e) {
        last = { ok: false };
        console.error('PARTNERSHIP_ROUTE note-attempt-error', conversationId, attempt, 'class=' + (e && e.name || 'Error'));
      }
      if (last && last.ok) return last;
      console.error('PARTNERSHIP_ROUTE note-attempt-failed', conversationId, attempt);
    }
    return last || { ok: false };
  };

  if (!built || built.deferred || !built.html) {
    finishHandoffAction(conversationId, false, false);
    mark(false, false, '', false);
    await sendPublic(limit + '\n\n' + retryLine);
    console.error('PARTNERSHIP_ROUTE_UNROUTED', conversationId, 'build');
    return { handled: true, reason: 'note_failed' };
  }

  const noteRes = await postNoteRetry(built.html);
  const noteOk = !!(noteRes && noteRes.ok);
  let assignOk = !!prior.partnershipAssignedOk;
  if (noteOk && built.assigneeId) {
    const asgRes = await assignToTeammateIfNeeded(full, conversationId, built.assigneeId);
    assignOk = !!(asgRes && asgRes.ok);
  } else if (!noteOk && built.assigneeId && !assignOk) {
    const asgRes = await assignToTeammateIfNeeded(full, conversationId, built.assigneeId);
    assignOk = !!(asgRes && asgRes.ok);
  }

  if (noteOk) {
    finishHandoffAction(conversationId, true, assignOk);
    mark(true, assignOk, built.assigneeId, true);
    const alreadyTold = !!prior.partnershipAssignedOk && !prior.partnershipNoteOk;
    const clientMsg = alreadyTold
      ? (limit + '\n\n' + noAcct)
      : ((assignOk ? ACCOUNT_HANDOFF_ACK : ACCOUNT_NOTE_ONLY_ACK) + '\n\n' + limit);
    await sendPublic(clientMsg);
    console.log('PARTNERSHIP_ROUTE sent', conversationId, 'assign=' + assignOk);
    return { handled: true, reason: assignOk ? 'assigned' : 'note_only', assigneeId: built.assigneeId || '' };
  }

  if (assignOk) {
    finishHandoffAction(conversationId, false, true);
    mark(false, true, built.assigneeId, false);
    const clientMsg = (prior.partnershipAssignedOk ? (limit + '\n\n' + noAcct) : (ACCOUNT_HANDOFF_ACK + '\n\n' + limit));
    await sendPublic(clientMsg);
    console.error('PARTNERSHIP_ROUTE note-failed-assigned', conversationId);
    return { handled: true, reason: 'note_failed_assigned', assigneeId: built.assigneeId || '' };
  }

  finishHandoffAction(conversationId, false, false);
  mark(false, false, '', false);
  await sendPublic(limit + '\n\n' + retryLine);
  console.error('PARTNERSHIP_ROUTE_UNROUTED', conversationId);
  return { handled: true, reason: 'note_post_failed' };
}

async function completeNonAccountEscalation({ conversationId, full, latestUser, clientName, problem, email, preferAssigneeId, where }) {
  let built = null;
  try {
    built = await buildEscalateNoteAndAssignee({
      problem: problem || 'Client request needs a human review.',
      actionNeeded: 'Please review this case and guide the client.',
      account: '',
      email: email || '',
      preferAssigneeId: preferAssigneeId || '',
      conversation: full,
      forceNonAccount: true,
    });
  } catch (e) {
    console.error('ESCALATE_NOTE_NON_ACCOUNT build fail', where, 'class=' + (e && e.name || 'Error'));
  }
  const sendFallback = async () => {
    finishHandoffAction(conversationId, false, false);
    const fb = postProcessModelReply(handoffClaimGate.TRUTHFUL_NO_HANDOFF_FALLBACK, conversationId);
    if (String(fb || '').trim() && !handoffClaimGate.hasHandoffClaim(fb)) {
      await postClientCommentOnce(conversationId, fb, latestUser, clientName);
    }
    console.log('ESCALATE_NOTE_DEFERRED non-account fallback', where, conversationId);
  };
  if (!built || built.deferred || !built.html) {
    await sendFallback();
    return;
  }
  const noteRes = await postReply(conversationId, 'note', built.html);
  if (!noteRes || !noteRes.ok) {
    await sendFallback();
    return;
  }
  let assignOk = false;
  if (built.assigneeId) {
    const asgRes = await assignToTeammateIfNeeded(full, conversationId, built.assigneeId);
    assignOk = !!(asgRes && asgRes.ok);
    if (!asgRes || !asgRes.ok) console.error('ESCALATE_ASSIGN_FAILED', conversationId, asgRes && asgRes.status);
  }
  finishHandoffAction(conversationId, true, assignOk);
  try { recordEscalationState(conversationId, problem || '', built.problemText, full); } catch (_) {}
  let clientMsg = postProcessModelReply(
    escalationClientAck({
      noteOk: true,
      assignOk,
      where: where || 'non-account',
      preferred: assignOk ? ACCOUNT_HANDOFF_ACK : '',
    }),
    conversationId
  );
  if (assignOk) {
    if (!String(clientMsg || '').trim()) clientMsg = ACCOUNT_HANDOFF_ACK;
  } else if (!String(clientMsg || '').trim() || handoffClaimGate.hasHandoffClaim(clientMsg)) {
    clientMsg = ACCOUNT_NOTE_ONLY_ACK;
  }
  if (String(clientMsg || '').trim()) {
    await postClientCommentOnce(conversationId, clientMsg, latestUser, clientName);
  }
  console.log('ESCALATE_NOTE_NON_ACCOUNT sent', where, conversationId, 'assign=' + assignOk);
}

function pickAccountEmailAsk(needAccount, needEmail) {
  const wantAcct = needAccount !== false;
  const wantEmail = needEmail !== false;
  // Only ask for what is still missing , never re-ask a field the client already gave.
  if (wantAcct && !wantEmail) {
    const variants = [
      'Could you please share the account number where you\'re experiencing this issue?',
      'Please share your account number so I can forward this with the right details.',
      'Can you send the account number linked to this issue? I’ll pass it to a teammate once I have it.',
      'Before I pass this to the team, please share your account number.',
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }
  if (!wantAcct && wantEmail) {
    const variants = [
      'Please share the registered FundedElite email for this account so I can forward it to a teammate.',
      'Can you send the registered email linked to that account? I’ll pass this on once I have it.',
      'Before I pass this to the team, please share the registered email on your FundedElite account.',
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }
  const variants = [
    'Before I pass this to the team, please share your account number and the email registered on your FundedElite account.',
    'Can you send your account number and registered email so I can forward this with the right details?',
    'Please share your account number and registered FundedElite email , I’ll send this to a teammate once I have both.',
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

/**
 * Shared fail-closed identity gate for every account-specific escalation path.
 * Returns ready=false after asking once, so callers must stop before any public
 * "forwarded" message, internal note, or assignment is created.
 */
async function ensureIdentityBeforeAccountEscalate({
  prefix, /* MIXED_GENERAL_WITH_ACCOUNT_V1: gated answer to the general part, sent in the same message */
  conversationId,
  full,
  bits,
  text,
  kind,
  latestUser,
  clientName,
  modelBody,
  modelClient,
}) {
  let currentFull = full;
  let ids = collectEscalateIds(currentFull, bits, String(modelBody || '') + '\n' + String(modelClient || ''));
  let preTexts = [];
  try { preTexts = collectClientMessageTexts(currentFull) || []; } catch (_) { preTexts = []; }
  // typeof guard: identity-before-escalate extracts this function into a vm
  // that does not bind prePurchaseGate. Live calls still see the module binding.
  if (typeof prePurchaseGate !== 'undefined' && prePurchaseGate &&
      prePurchaseGate.skipTradingAccountIdentity(preTexts, text || (preTexts.length ? preTexts[preTexts.length - 1] : ''))) {
    console.log('PREPURCHASE_ACCOUNT identity-not-required', conversationId);
    const resolvedId = resolveIdentityAskDecision(currentFull, ids, kind || 'ACCOUNT');
    return { ready: true, full: currentFull, ids, resolvedId, prePurchase: true };
  }
  let resolvedId = resolveIdentityAskDecision(currentFull, ids, kind || 'ACCOUNT');
  let needAccount = resolvedId.needAccount;
  let needEmail = resolvedId.needEmail;

  if (needAccount || needEmail) {
    try {
      const freshGate = await fetchConversation(conversationId);
      if (freshGate) {
        currentFull = freshGate;
        ids = collectEscalateIds(currentFull, bits, String(modelBody || '') + '\n' + String(modelClient || ''));
        resolvedId = resolveIdentityAskDecision(currentFull, ids, kind || 'ACCOUNT');
        needAccount = resolvedId.needAccount;
        needEmail = resolvedId.needEmail;
      }
    } catch (e) {
      console.error('IDENTITY_BEFORE_ESCALATE refetch fail', conversationId, 'class=' + (e && e.name || 'Error'));
    }
  }

  if (!(needAccount || needEmail)) {
    // Profile email used to unlock the note here (email_sufficient). A payout
    // rejection still has no trading account: do not escalate.
    // typeof guards: the identity-before-escalate vm extract does not bind these
    // helpers. In the live function they exist, and a profile email must not
    // unlock a payout-rejection note.
    const payoutHold = typeof clientWantsHumanTeammate === 'function' &&
      typeof idGates !== 'undefined' && idGates && typeof idGates.payoutRejectionRequiresAccount === 'function' &&
      typeof isUsableEscalateAccount === 'function' &&
      !clientWantsHumanTeammate(String(text || '')) &&
      idGates.payoutRejectionRequiresAccount(text) &&
      !isUsableEscalateAccount(ids.account) &&
      !(resolvedId && resolvedId.declinedAccount);
    if (payoutHold) {
      console.error('PAYOUT_REJECTION_ACCOUNT_HOLD', conversationId, {
        reason: resolvedId && resolvedId.decision && resolvedId.decision.reason,
      });
      return { ready: false, asked: false, blocked: true, full: currentFull, ids, resolvedId };
    }
    return { ready: true, full: currentFull, ids, resolvedId };
  }

  if (needAccount && typeof accountClarificationAlreadyActive === 'function' && accountClarificationAlreadyActive(currentFull)) {
    console.log('ESCALATION_NOT_READY', 'clarification-active', conversationId);
    return { ready: false, asked: false, waiting: true, full: currentFull, ids, resolvedId };
  }
  const ask = typeof escalationClarificationText === 'function'
    ? escalationClarificationText(resolvedId, needAccount, needEmail)
    : pickAccountEmailAsk(needAccount, needEmail);
  const pre = preSendIdentityCheck(currentFull, ask);
  const __pf = async () => { try { return typeof prefix === 'function' ? String((await prefix()) || '') : String(prefix || ''); } catch (_) { return ''; } };
  if (pre.ok) {
    const __p = await __pf();
    await postClientCommentOnce(conversationId, __p ? __p.trim() + '\n\n' + ask : ask, latestUser, clientName);
    console.log('IDENTITY_BEFORE_ESCALATE asked missing', conversationId, {
      needAccount,
      needEmail,
      kind: kind || 'ACCOUNT',
      decision: resolvedId.decision.reason,
    });
    return { ready: false, asked: true, full: currentFull, ids, resolvedId };
  }

  if (pre.known) {
    if (pre.known.account) ids.account = pre.known.account;
    if (pre.known.email) ids.email = pre.known.email;
  }
  resolvedId = resolveIdentityAskDecision(currentFull, ids, kind || 'ACCOUNT');
  needAccount = resolvedId.needAccount;
  needEmail = resolvedId.needEmail;
  if (!(needAccount || needEmail)) {
    // Profile email used to unlock the note here (email_sufficient). A payout
    // rejection still has no trading account: do not escalate.
    // typeof guards: the identity-before-escalate vm extract does not bind these
    // helpers. In the live function they exist, and a profile email must not
    // unlock a payout-rejection note.
    const payoutHold = typeof clientWantsHumanTeammate === 'function' &&
      typeof idGates !== 'undefined' && idGates && typeof idGates.payoutRejectionRequiresAccount === 'function' &&
      typeof isUsableEscalateAccount === 'function' &&
      !clientWantsHumanTeammate(String(text || '')) &&
      idGates.payoutRejectionRequiresAccount(text) &&
      !isUsableEscalateAccount(ids.account) &&
      !(resolvedId && resolvedId.declinedAccount);
    if (payoutHold) {
      console.error('PAYOUT_REJECTION_ACCOUNT_HOLD', conversationId, {
        reason: resolvedId && resolvedId.decision && resolvedId.decision.reason,
      });
      return { ready: false, asked: false, blocked: true, full: currentFull, ids, resolvedId };
    }
    return { ready: true, full: currentFull, ids, resolvedId };
  }

  if (needAccount && typeof accountClarificationAlreadyActive === 'function' && accountClarificationAlreadyActive(currentFull)) {
    console.log('ESCALATION_NOT_READY', 'clarification-active', conversationId);
    return { ready: false, asked: false, waiting: true, full: currentFull, ids, resolvedId };
  }
  const retryAsk = typeof escalationClarificationText === 'function'
    ? escalationClarificationText(resolvedId, needAccount, needEmail)
    : pickAccountEmailAsk(needAccount, needEmail);
  const retryPre = preSendIdentityCheck(currentFull, retryAsk);
  if (retryPre.ok) {
    const __p2 = await __pf();
    await postClientCommentOnce(conversationId, __p2 ? __p2.trim() + '\n\n' + retryAsk : retryAsk, latestUser, clientName);
    console.log('IDENTITY_BEFORE_ESCALATE asked missing after refresh', conversationId, {
      needAccount,
      needEmail,
      kind: kind || 'ACCOUNT',
    });
    return { ready: false, asked: true, full: currentFull, ids, resolvedId };
  }

  console.error('IDENTITY_BEFORE_ESCALATE blocked empty-identity escalation', conversationId, {
    needAccount,
    needEmail,
    reason: retryPre.reason || pre.reason,
    text: String(text || '').slice(0, 160),
  });
  return { ready: false, asked: false, blocked: true, full: currentFull, ids, resolvedId };
}

const TICKET_STATE_FILE = process.env.TICKET_STATE_FILE || '/home/ubuntu/bot-ticket-state.json';
const TICKET_STATE_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

// First out-of-scope ask in a conversation , fresh decline lines.
const SCOPE_DECLINE_VARIANTS_FIRST = [
  "That's outside what I can help with. I only handle FundedElite here, so let me know if there's anything I can help with.",
  "I can't get into that one here, as I only cover FundedElite. Is there anything FundedElite-related I can help with?",
  "That's not something I can help with, I'm afraid. Is there something on your account I can look into?",
  "Outside what I cover, unfortunately. Anything I can help with on the FundedElite side?",
  "I'll have to pass on that one. What can I help you with on your account or challenge?",
];

// Second+ ask in the same conversation. These used to reference the earlier boundary ("Same as
// before , that's a different company"), which asserts WHY the previous thing was declined. In
// live conversation 215476025058340 the earlier decline was about FTMO and the new question was
// "do you have a wife ?", so the reply claimed a personal question was a different company.
// A repeat decline may vary its wording, but it must not carry a reason from the last one.
const SCOPE_DECLINE_VARIANTS_REPEAT = [
  "That one's outside what I can help with too, as I only handle FundedElite here.",
  "I only handle FundedElite questions, so that's not one I can help with.",
  "Not something I can cover here either. FundedElite is all I can help with.",
  "That's outside my scope as well. Happy to help with anything on your account though.",
  "I can't help with that one, as FundedElite topics are all I can cover.",
];

function isEscalationsTeambox(conversation) {
  const team = conversation && conversation.team_assignee_id != null ? String(conversation.team_assignee_id) : '0';
  return team === ESCALATIONS_TEAM_ID;
}

function isHumanTeamPublicReply(part) {
  const a = (part && part.author) || {};
  if (!part || part.part_type === 'note') return false;
  if (a.type !== 'admin' && a.type !== 'bot') return false;
  const id = String(a.id || '');
  // Luna/Arsal bot + Elite AI/Fin do not count as Escalations/Risk "team" replies.
  if (id === ARSAL_ID || id === ELITE_AI_ID) return false;
  // Only real public comment text counts , never assignment/close/snooze/open/empty.
  if (String(part.part_type || '') !== 'comment') return false;
  const body = stripHtml(part.body || '');
  if (!body) return false;
  return true;
}

function lastHumanTeamReplyUnix(parts) {
  let t = 0;
  for (const p of parts || []) {
    if (!isHumanTeamPublicReply(p)) continue;
    const at = Number(p.created_at || 0);
    if (at > t) t = at;
  }
  return t;
}

function clientMessagesAfter(parts, afterUnix, conversation) {
  const out = [];
  const floor = Number(afterUnix || 0);
  const seen = new Set();

  // Email/first message often lives only on conversation.source, not in parts
  const src = (conversation && conversation.source) || {};
  if (src.author && src.author.type === 'user' && src.body) {
    const at = Number((conversation && conversation.created_at) || 0);
    const body = stripHtml(src.body);
    if (body && (!floor || at > floor)) {
      const id = 'source-' + at;
      seen.add(id);
      out.push({ id, at, body });
    }
  }

  for (const p of parts || []) {
    const a = p.author || {};
    if (a.type !== 'user') continue;
    if (p.part_type === 'note') continue;
    // Client reopen-with-text comes as part_type "open"
    const pt = String(p.part_type || '');
    if (pt && pt !== 'comment' && pt !== 'open') continue;
    const at = Number(p.created_at || 0);
    if (floor && at <= floor) continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    const id = String(p.id || at);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, at, body });
  }
  return out;
}

async function summarizeEscalationsClientBatch(messages) {
  const joined = (messages || []).map((m, i) => (i + 1) + '. ' + m.body).join('\n');
  try {
    const ai = await lunaModel.create(openai, {
      model: control.getModel(),
      ...modelConfig.answerParams({ tools: false, purpose: 'note.escalation-batch-summary' }),
      messages: [
        {
          role: 'system',
          content:
            'Write one short English-only INTERNAL Problem summary for a teammate.\n' +
            'Rules:\n' +
            '- Do NOT copy-paste the client\'s question or messages.\n' +
            '- Restate the actual problem in simple own words.\n' +
            '- Keep it concise (about 2–4 sentences) but include every key detail a teammate needs: what happened, what the client wants, account/product/timing/status facts they mentioned, and any blockers already stated.\n' +
            '- Always English — never Roman Urdu, Urdu, or Italian (even if the client wrote in those languages).\n' +
            '- No greeting, no ACTION labels, no client-facing tone, no "Problem:" prefix.',
        },
        { role: 'user', content: 'Client messages to distill:\n' + joined },
      ],
    });
    const out = (((ai.choices[0] || {}).message || {}).content || '').trim();
    if (out) {
      const cleaned = out.replace(/^Problem:\s*/i, '').trim();
      return await ensureInternalNoteEnglish(cleaned, 'Escalations summary');
    }
  } catch (e) {
    console.error('ESCALATIONS summarize fail', 'class=' + (e && e.name || 'Error'));
  }
  // Last resort: still avoid dumping a raw paste wall — keep it short.
  const fallback = (messages || [])
    .map((m) => String(m.body || '').trim())
    .filter(Boolean)
    .slice(-3)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return await ensureInternalNoteEnglish(
    fallback ? 'Client needs follow-up on: ' + fallback.slice(0, 400) : 'Client needs teammate follow-up.',
    'Escalations summary fallback'
  );
}

async function buildEscalationsWatchNote(full, messages) {
  const summary = await summarizeEscalationsClientBatch(messages);
  const bits = typeof contactBits === 'function' ? contactBits(full || {}) : {};
  const ids = collectEscalateIds(full, bits, '');
  let em = ids.email || '';
  if ((!em || !isUsableClientEmail(em)) && full) {
    const resolved = await resolveNoteEmail(full, { email: em });
    if (resolved) em = resolved;
  }
  const assigneeId =
    full.admin_assignee_id != null && String(full.admin_assignee_id) !== '0'
      ? String(full.admin_assignee_id)
      : '';
  let actionHtml = 'Please continue handling this Escalations inbox case and reply to the client.';
  if (assigneeId && assigneeId !== ARSAL_ID && assigneeId !== ELITE_AI_ID && !NEVER_MENTION_IDS.has(assigneeId)) {
    let name = 'teammate';
    try {
      const r = await axios.get('https://api.intercom.io/admins/' + assigneeId, {
        headers: icHeaders(),
        timeout: IC_TIMEOUT_MS,
        validateStatus: () => true,
      });
      if (r.status < 400 && r.data && r.data.name) name = String(r.data.name);
    } catch (_) {}
    actionHtml = adminMentionHtml({ id: assigneeId, name }) + ' ' + actionHtml;
  }
  let acct = ids.account || '';
  if (!isUsableEscalateAccount(acct)) {
    try {
      const trusted = trustedExplicitAccount(full);
      if (trusted) acct = trusted;
    } catch (_) {}
  }
  acct = vetNoteAccount(acct, full, em);
  if (!isUsableEscalateAccount(acct) && clientSaidNoAccount(full)) {
    acct = 'Not provided (client has no account / not purchased)';
  } else if (!isUsableEscalateAccount(acct)) {
    // Silent teambox watch notes cannot ask the client. Never use bare "Not provided".
    acct = 'Not available in thread';
  }
  // Escalations/Jerry watch notes: short format from CURRENT inbox/assignee.
  return formatEscalateNoteHtml({
    problemText: summary,
    email: em,
    account: acct,
    actionHtml,
    conversation: full,
    destinationIds: noteDestinationIds(),
  });
}

function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function pendingLongMessages(pending) {
  return (pending || []).filter((m) => countWords(m && m.body) >= LONG_MSG_WORD_MIN);
}

function isJerryAssigned(conversation) {
  const admin = conversation && conversation.admin_assignee_id != null ? String(conversation.admin_assignee_id) : '0';
  return admin === JERRY_ID;
}

/* TEAMBOX_NOTE_LOCK_V1
 * The 60s teambox poller and the webhook handler both call these note handlers. Each one checks
 * "already noted?" (state sig / covered ids), then awaits an LLM summary for several seconds, and
 * only then saves — so two concurrent callers both passed the check and both posted
 * (live: 215475896265185 "ESCALATIONS note-only batch3" twice, seconds apart). Serialising per
 * conversation makes the second caller re-read the state the first one saved. */
const teamboxNoteLocks = new Map();
function withTeamboxNoteLock(conversationId, fn) {
  const key = String(conversationId || '');
  const prev = teamboxNoteLocks.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const settled = run.then(() => {}, () => {});
  teamboxNoteLocks.set(key, settled);
  settled.then(() => { if (teamboxNoteLocks.get(key) === settled) teamboxNoteLocks.delete(key); });
  return run;
}
async function handleEscalationsSilentNoteOnly(conversationId, full) {
  return withTeamboxNoteLock(conversationId, () => handleEscalationsSilentNoteOnlyInner(conversationId, full));
}
async function handleJerryOrEscalationsLongMessageNote(conversationId, full) {
  return withTeamboxNoteLock(conversationId, () => handleJerryOrEscalationsLongMessageNoteInner(conversationId, full));
}
async function handleRiskSilentNoteOnly(conversationId, full) {
  return withTeamboxNoteLock(conversationId, () => handleRiskSilentNoteOnlyInner(conversationId, full));
}

async function handleEscalationsSilentNoteOnlyInner(conversationId, full) {
  const ownershipSnapshot = {};
  const ownershipDenied = await automaticNoteOwnershipBlock(conversationId, ownershipSnapshot);
  if (ownershipDenied) return { noted: false, reason: ownershipDenied.reason };
  full = ownershipSnapshot.full;
  // NEVER client-reply on Escalations teambox. Note-only under strict gates.
  // Gates (either path, both need 15m team silence):
  //  A) ≥3 NEW pending client msgs since last Escalations note (not already covered)
  //  B) any single NEW pending client msg ≥150 words
  // Do NOT re-note when one extra short message arrives after a batch was already noted.
  const parts = partsOf(full);
  const lastTeamAt = lastHumanTeamReplyUnix(parts);
  const pending = clientMessagesAfter(parts, lastTeamAt, full);
  const { state, id } = getConvState(conversationId);
  const covered = new Set(
    String(state.escalationsNotedMsgIds || '')
      .split(',')
      .map((x) => String(x || '').trim())
      .filter(Boolean)
  );
  const freshPending = pending.filter((m) => !covered.has(String(m.id)));
  const longMsgs = pendingLongMessages(freshPending);
  const batchReady = freshPending.length >= ESCALATIONS_MIN_CLIENT_MSGS;
  const longReady = longMsgs.length > 0;

  if (!batchReady && !longReady) {
    console.log(
      'ESCALATIONS wait , fresh client msgs',
      conversationId,
      freshPending.length,
      '<',
      ESCALATIONS_MIN_CLIENT_MSGS,
      '(pending',
      pending.length,
      'covered',
      covered.size,
      ', no new 150+ word msg)'
    );
    return { noted: false, reason: 'need_3_fresh_client_msgs', count: freshPending.length };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const anchor = lastTeamAt || Number(full.created_at || 0) || nowSec;
  const silence = nowSec - anchor;
  if (silence < ESCALATIONS_SILENCE_SEC) {
    console.log('ESCALATIONS wait , silence', conversationId, silence, '<', ESCALATIONS_SILENCE_SEC);
    return { noted: false, reason: 'under_15m', silence };
  }

  const noteMessages = batchReady ? freshPending : longMsgs;
  const path = batchReady ? 'batch3' : 'long150';
  const sig = path + ':' + noteMessages.map((m) => m.id).join(',');
  if (state.escalationsNoteSig === sig) {
    console.log('ESCALATIONS skip duplicate note batch', conversationId);
    return { noted: false, reason: 'duplicate_batch' };
  }

  const html = await buildEscalationsWatchNote(full, noteMessages);
  if (!html) {
    return { noted: false, reason: 'missing_account' };
  }
  const noteResult = await postReply(conversationId, 'note', html);
  if (!noteResult || (!noteResult.ok && !noteResult.unknown)) {
    return { noted: false, reason: noteResult && noteResult.reason || 'note-not-confirmed' };
  }
  state.escalationsNoteSig = sig;
  state.escalationsNoteAt = Date.now();
  // Mark all pending (incl. ones in this note) as covered so +1 short follow-up cannot re-fire
  for (const m of pending) covered.add(String(m.id));
  state.escalationsNotedMsgIds = Array.from(covered).slice(-80).join(',');
  saveConvState(id, state);
  // Ambiguous delivery must suppress blind resends without claiming confirmation.
  if (noteResult.unknown) return { noted: false, unknown: true, reason: 'note-delivery-unknown' };
  console.log(
    'ESCALATIONS note-only',
    conversationId,
    'path',
    path,
    'msgs',
    noteMessages.length,
    'silence',
    silence
  );
  return { noted: true, count: noteMessages.length, silence, path };
}

async function handleJerryOrEscalationsLongMessageNoteInner(conversationId, full) {
  const ownershipSnapshot = {};
  const ownershipDenied = await automaticNoteOwnershipBlock(conversationId, ownershipSnapshot);
  if (ownershipDenied) return { noted: false, reason: ownershipDenied.reason };
  full = ownershipSnapshot.full;
  // Escalations teambox OR Jerry-assigned: 15m team silence + ≥150-word client msg → summary note.
  // Escalations tickets are handled fully by handleEscalationsSilentNoteOnly (includes this path).
  // This function is for Jerry-assigned tickets outside Escalations/Risk silent flows.
  if (isEscalationsTeambox(full) || isRiskTeambox(full)) {
    return { noted: false, reason: 'owned_by_teambox_handler' };
  }
  if (!isJerryAssigned(full)) {
    return { noted: false, reason: 'not_jerry' };
  }

  const parts = partsOf(full);
  const lastTeamAt = lastHumanTeamReplyUnix(parts);
  const pending = clientMessagesAfter(parts, lastTeamAt, full);
  const longMsgs = pendingLongMessages(pending);
  if (!longMsgs.length) {
    return { noted: false, reason: 'no_long_msg' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const anchor = lastTeamAt || Number(full.created_at || 0) || nowSec;
  const silence = nowSec - anchor;
  if (silence < ESCALATIONS_SILENCE_SEC) {
    console.log('JERRY_LONG wait , silence', conversationId, silence, '<', ESCALATIONS_SILENCE_SEC);
    return { noted: false, reason: 'under_15m', silence };
  }

  const sig = 'long:' + longMsgs.map((m) => m.id).join(',');
  const { state, id } = getConvState(conversationId);
  if (state.longMsgNoteSig === sig) {
    console.log('JERRY_LONG skip duplicate', conversationId);
    return { noted: false, reason: 'duplicate_batch' };
  }

  const html = await buildEscalationsWatchNote(full, longMsgs);
  if (!html) {
    return { noted: false, reason: 'missing_account' };
  }
  const noteResult = await postReply(conversationId, 'note', html);
  if (!noteResult || (!noteResult.ok && !noteResult.unknown)) {
    return { noted: false, reason: noteResult && noteResult.reason || 'note-not-confirmed' };
  }
  state.longMsgNoteSig = sig;
  state.longMsgNoteAt = Date.now();
  saveConvState(id, state);
  // Ambiguous delivery must suppress blind resends without claiming confirmation.
  if (noteResult.unknown) return { noted: false, unknown: true, reason: 'note-delivery-unknown' };
  console.log('JERRY_LONG note', conversationId, 'msgs', longMsgs.length, 'silence', silence);
  return { noted: true, count: longMsgs.length, silence };
}

const riskNoteInflight = new Set();

function isRiskTeambox(conversation) {
  const team = conversation && conversation.team_assignee_id != null ? String(conversation.team_assignee_id) : '0';
  return team === RISK_TEAM_ID;
}

async function handleRiskSilentNoteOnlyInner(conversationId, full) {
  // NEVER client-reply on Risk Team teambox. Note-only after silence, with GENERAL
  // anti-spam gates (riskNoteGate): meaningful new unanswered issue only; no waiting-nudge
  // spam; at most one note per pending issue until Risk replies; one material supplemental.
  const idKey = String(conversationId || '');
  if (!idKey) return { noted: false, reason: 'no_id' };
  if (riskNoteInflight.has(idKey)) {
    console.log('RISK skip inflight', idKey);
    return { noted: false, reason: 'inflight' };
  }
  riskNoteInflight.add(idKey);
  try {
    const parts = partsOf(full);
    const lastTeamAt = lastHumanTeamReplyUnix(parts);
    const pending = clientMessagesAfter(parts, lastTeamAt, full);
    const { state, id } = getConvState(conversationId);
    const covered = new Set(
      String(state.riskNotedMsgIds || '')
        .split(',')
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    );
    const freshPending = pending.filter((m) => !covered.has(String(m.id)));

    const nowSec = Math.floor(Date.now() / 1000);
    const anchor = lastTeamAt || Number(full.created_at || 0) || nowSec;
    const silence = nowSec - anchor;

    const decision = riskNoteGate.decideRiskNote({
      freshPending,
      pending,
      lastTeamAt,
      silenceSec: silence,
      silenceRequired: RISK_SILENCE_SEC,
      minClientMsgs: RISK_MIN_CLIENT_MSGS,
      longWordMin: typeof LONG_MSG_WORD_MIN !== 'undefined' ? LONG_MSG_WORD_MIN : 150,
      state,
      nowMs: Date.now(),
    });

    if (decision.statePatch && typeof decision.statePatch === 'object') {
      Object.assign(state, decision.statePatch);
    }
    if (Array.isArray(decision.coverMsgIds)) {
      for (const mid of decision.coverMsgIds) covered.add(String(mid));
      state.riskNotedMsgIds = Array.from(covered).slice(-80).join(',');
    }

    if (decision.action === 'CLEAR_AWAITING') {
      saveConvState(id, state);
      console.log(decision.log || 'RISK awaiting cleared', conversationId);
      const freshAfter = pending.filter((m) => !covered.has(String(m.id)));
      if (!freshAfter.length) {
        return { noted: false, reason: decision.reason };
      }
      const decision2 = riskNoteGate.decideRiskNote({
        freshPending: freshAfter,
        pending,
        lastTeamAt,
        silenceSec: silence,
        silenceRequired: RISK_SILENCE_SEC,
        minClientMsgs: RISK_MIN_CLIENT_MSGS,
        longWordMin: typeof LONG_MSG_WORD_MIN !== 'undefined' ? LONG_MSG_WORD_MIN : 150,
        state,
        nowMs: Date.now(),
      });
      if (decision2.statePatch) Object.assign(state, decision2.statePatch);
      if (Array.isArray(decision2.coverMsgIds)) {
        for (const mid of decision2.coverMsgIds) covered.add(String(mid));
        state.riskNotedMsgIds = Array.from(covered).slice(-80).join(',');
      }
      if (decision2.action !== 'NOTE' && decision2.action !== 'NOTE_MATERIAL') {
        saveConvState(id, state);
        console.log(decision2.log || 'RISK after-clear skip', conversationId, decision2.reason);
        return { noted: false, reason: decision2.reason };
      }
      return await postRiskGateNote(conversationId, full, id, state, covered, decision2, silence);
    }

    if (decision.action === 'ABSORB' || decision.action === 'SKIP') {
      saveConvState(id, state);
      console.log(decision.log || 'RISK skip', conversationId, decision.reason);
      return { noted: false, reason: decision.reason };
    }

    if (decision.action === 'NOTE' || decision.action === 'NOTE_MATERIAL') {
      return await postRiskGateNote(conversationId, full, id, state, covered, decision, silence);
    }

    saveConvState(id, state);
    return { noted: false, reason: decision.reason || 'unhandled' };
  } finally {
    riskNoteInflight.delete(idKey);
  }
}

async function postRiskGateNote(conversationId, full, id, state, covered, decision, silence) {
  const ownershipSnapshot = {};
  const ownershipDenied = await automaticNoteOwnershipBlock(conversationId, ownershipSnapshot);
  if (ownershipDenied) return { noted: false, reason: ownershipDenied.reason };
  full = ownershipSnapshot.full;
  const noteMessages = decision.noteMessages || [];
  if (!noteMessages.length) {
    saveConvState(id, state);
    return { noted: false, reason: 'no_note_messages' };
  }
  let summary = await summarizeEscalationsClientBatch(noteMessages);
  const polished = riskNoteGate.polishRiskNoteSummary(summary, noteMessages);
  if (polished.rejected && !polished.summary) {
    for (const m of noteMessages) covered.add(String(m.id));
    state.riskNotedMsgIds = Array.from(covered).slice(-80).join(',');
    saveConvState(id, state);
    console.log('RISK skip empty/waiting summary', conversationId);
    return { noted: false, reason: 'empty_or_waiting_spam_summary' };
  }
  summary = polished.summary || summary;

  const bits = typeof contactBits === 'function' ? contactBits(full || {}) : {};
  const ids = collectEscalateIds(full, bits, '');
  let em = ids.email || '';
  if ((!em || !isUsableClientEmail(em)) && full) {
    const resolved = await resolveNoteEmail(full, { email: em });
    if (resolved) em = resolved;
  }
  const assigneeId =
    full.admin_assignee_id != null && String(full.admin_assignee_id) !== '0'
      ? String(full.admin_assignee_id)
      : '';
  let actionHtml = 'Please review the Risk issue and reply to the client with the result.';
  if (
    assigneeId &&
    assigneeId !== ARSAL_ID &&
    assigneeId !== ELITE_AI_ID &&
    !NEVER_MENTION_IDS.has(assigneeId)
  ) {
    let name = 'teammate';
    try {
      const r = await axios.get('https://api.intercom.io/admins/' + assigneeId, {
        headers: icHeaders(),
        timeout: IC_TIMEOUT_MS,
        validateStatus: () => true,
      });
      if (r.status < 400 && r.data && r.data.name) name = String(r.data.name);
    } catch (_) {}
    actionHtml = adminMentionHtml({ id: assigneeId, name }) + ' ' + actionHtml;
  }
  let acctRisk = ids.account || '';
  if (!isUsableEscalateAccount(acctRisk)) {
    try {
      const trusted = trustedExplicitAccount(full);
      if (trusted) acctRisk = trusted;
    } catch (_) {}
  }
  acctRisk = vetNoteAccount(acctRisk, full, em);
  if (!isUsableEscalateAccount(acctRisk) && clientSaidNoAccount(full)) {
    acctRisk = 'Not provided (client has no account / not purchased)';
  } else if (!isUsableEscalateAccount(acctRisk)) {
    // Silent Risk watch notes cannot ask the client. Never use bare "Not provided".
    acctRisk = 'Not available in thread';
  }
  // Risk watch notes: short format from CURRENT Risk inbox/assignee.
  const html = formatEscalateNoteHtml({
    problemText: summary,
    email: em,
    account: acctRisk,
    actionHtml,
    conversation: full,
    destinationIds: noteDestinationIds(),
  });
  const noteResult = await postReply(conversationId, 'note', html);
  if (!noteResult || (!noteResult.ok && !noteResult.unknown)) {
    return { noted: false, reason: noteResult && noteResult.reason || 'note-not-confirmed' };
  }

  const pathLabel = decision.path || (decision.action === 'NOTE_MATERIAL' ? 'material' : 'meaningful');
  const sig = pathLabel + ':' + noteMessages.map((m) => m.id).join(',');
  state.riskNoteSig = sig;
  state.riskNoteAt = Date.now();
  state.riskAwaitingTeam = true;
  if (decision.issueKey) {
    state.lastRiskNoteIssueKey = decision.issueKey;
    state.pendingIssueFingerprint = decision.issueKey;
  }
  if (decision.statePatch) Object.assign(state, decision.statePatch);
  for (const m of noteMessages) covered.add(String(m.id));
  if (Array.isArray(decision.coverMsgIds)) {
    for (const mid of decision.coverMsgIds) covered.add(String(mid));
  }
  state.riskNotedMsgIds = Array.from(covered).slice(-80).join(',');
  saveConvState(id, state);
  // Ambiguous delivery must suppress blind resends without claiming confirmation.
  if (noteResult.unknown) return { noted: false, unknown: true, reason: 'note-delivery-unknown' };
  console.log(
    decision.log || 'RISK note-only',
    conversationId,
    'path',
    pathLabel,
    'msgs',
    noteMessages.length,
    'silence',
    silence,
    'issue',
    state.lastRiskNoteIssueKey || ''
  );
  return {
    noted: true,
    count: noteMessages.length,
    silence,
    path: pathLabel,
    action: decision.action,
  };
}

// ATOMIC_STATE_V1: a torn write (disk full 2026-09-23) made the old loader return {} and the next
// save erased ~180 conversations of escalation / Risk-note / dedupe history. Missing file = fresh
// start; corrupt file = recover from <file>.lastgood or throw (never silently empty).
function loadTicketState() {
  return atomicJsonFile.readJsonSafe(TICKET_STATE_FILE, { fallback: {}, label: 'ticket-state' });
}

function saveTicketState(all) {
  atomicJsonFile.writeJsonAtomic(TICKET_STATE_FILE, all, { lastGood: true });
}

/**
 * Fresh-read-merge-write for a single conversation. getConvState() snapshots the whole
 * ticket-state file at call time; a caller that then `await`s a network call before saving
 * (postReply/assignToTeammate/etc.) can have its later `saveTicketState(all)` overwrite
 * changes another concurrent handler (a different webhook event, or one of the 60s poll
 * loops) wrote to a DIFFERENT conversation's entry in the meantime. Re-reading immediately
 * before writing and only touching this one conversation's key avoids that cross-conversation
 * lost-update. Prefer this over `all[id] = state; saveTicketState(all);` at any call site that
 * awaits between getConvState() and the save.
 */
function saveConvState(id, state) {
  const fresh = loadTicketState();
  fresh[String(id || '')] = state;
  saveTicketState(fresh);
}

function getConvState(conversationId) {
  const all = loadTicketState();
  const id = String(conversationId || '');
  if (!all[id] || typeof all[id] !== 'object') all[id] = {};
  all[id].lastTouchedAt = Math.floor(Date.now() / 1000);
  return { all, state: all[id], id };
}

function pruneTicketState() {
  try {
    const all = loadTicketState();
    const now = Math.floor(Date.now() / 1000);
    let removed = 0;
    for (const [cid, st] of Object.entries(all || {})) {
      const touched = Number(
        (st && (st.lastTouchedAt || st.lastEscalateAt)) || 0
      );
      if (touched && now - touched > TICKET_STATE_TTL_SEC) {
        delete all[cid];
        removed += 1;
      }
    }
    if (removed) {
      saveTicketState(all);
      console.log('TICKET_STATE_PRUNE removed', removed);
    }
  } catch (e) {
    console.error('TICKET_STATE_PRUNE_ERR', 'class=' + (e && e.name || 'Error'));
  }
}

function pickScopeDeclineLine(conversationId) {
  const { all, state, id } = getConvState(conversationId);
  const count = (Number.isInteger(state.scopeDeclineCount) ? state.scopeDeclineCount : 0) + 1;
  state.scopeDeclineCount = count;

  const pool = count === 1 ? SCOPE_DECLINE_VARIANTS_FIRST : SCOPE_DECLINE_VARIANTS_REPEAT;
  const lastIndex = Number.isInteger(state.lastScopeDeclineIndex) ? state.lastScopeDeclineIndex : -1;
  let index = Math.floor(Math.random() * pool.length);
  if (pool.length > 1) {
    let guard = 0;
    while (index === lastIndex && guard < 8) {
      index = Math.floor(Math.random() * pool.length);
      guard += 1;
    }
  }
  state.lastScopeDeclineIndex = index;
  all[id] = state;
  saveTicketState(all);
  return pool[index];
}


function ensureCustomerReplySpacing(text) {
  // HARD RULE: exactly one blank line between paragraphs / separate points.
  // Do not jam paragraphs; do not leave huge gaps. Keep bullet runs tight.
  let t = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!t) return t;
  const lines = t.split('\n');
  const out = [];
  const isBullet = (line) => /^\s*(?:[•●▪\-\*]|\d+[.)])\s+/.test(line);
  const isBlank = (line) => !String(line || '').trim();
  const isHeading = (line) => /^\s*<b>[^<]+<\/b>\s*$/i.test(line) || /^\s*\[\[.+?\]\]\s*$/.test(line);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const blank = isBlank(line);
    if (blank) {
      // collapse multiple blanks to a single pending blank
      if (out.length && !isBlank(out[out.length - 1])) out.push('');
      continue;
    }
    if (out.length) {
      const prev = out[out.length - 1];
      const prevBlank = isBlank(prev);
      const prevBullet = isBullet(prev);
      const curBullet = isBullet(line);
      // Between two non-blank non-bullet prose/heading lines: require exactly one blank
      if (!prevBlank && !(prevBullet && curBullet)) {
        // already have content on previous line , insert blank unless both bullets
        out.push('');
      } else if (prevBlank) {
        // already exactly one blank (collapsed)
      }
    }
    out.push(line);
  }
  // trim leading/trailing blanks; collapse any accidental double blanks
  while (out.length && isBlank(out[0])) out.shift();
  while (out.length && isBlank(out[out.length - 1])) out.pop();
  const compact = [];
  for (const line of out) {
    if (isBlank(line) && compact.length && isBlank(compact[compact.length - 1])) continue;
    compact.push(line);
  }
  return compact.join('\n');
}

function ensureSectionGaps(text) {
  // One blank line before each <b>heading</b> block (except the first) so Intercom
  // shows a visible gap between sections , model often emits only a single \n.
  const lines = String(text || '').split('\n');
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = /^<b>[^<]+<\/b>$/i.test(trimmed);
    if (isHeading && out.length) {
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      if (out.length) out.push('');
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * HANDOFF_CLAIM_STRIP_V1 / HANDOFF_CLAIM_GATE_V1 (2026-09-24; tightened 2026-09-29 for
 * 215476138018591): "I've asked / forwarded / our team will confirm" is true only when a
 * handoff actually succeeded this turn. ESCALATE->REPLY force and ESCALATE_SUPPRESSED write
 * no note, so those sentences are false promises. Detection + strip live in handoffClaimGate.js.
 */
const handoffClaimGate = require('./handoffClaimGate');
const HANDOFF_CLAIM_RE = handoffClaimGate.HANDOFF_CLAIM_RE;
function stripHandoffClaims(text) {
  return handoffClaimGate.stripHandoffClaims(text);
}
function ownershipAlreadyActive(conversation, state) {
  try {
    if (state && state.escalateAwaitingFirstTeammate) return true;
    const id = conversation && conversation.admin_assignee_id != null
      ? String(conversation.admin_assignee_id)
      : '';
    if (!id || id === '0' || id === ARSAL_ID || id === ELITE_AI_ID) return false;
    return true;
  } catch (_) {
    return false;
  }
}
function readTrustedHandoffStatus(conversationId, conversation) {
  let st = {};
  try { st = getConvState(conversationId).state || {}; } catch (_) { st = {}; }
  return handoffClaimGate.resolveHandoffStatus({
    noteOk: !!st.handoffNoteOk,
    assignOk: !!st.handoffAssignOk,
    attempted: !!st.handoffAttempted,
    ownershipActive: !!(st.handoffOwnershipActive || ownershipAlreadyActive(conversation, st)),
  });
}
function handoffSucceededThisTurn(conversationId) {
  try {
    return handoffClaimGate.claimsAllowed(readTrustedHandoffStatus(conversationId));
  } catch (_) {
    return false;
  }
}
function markHandoffSucceededThisTurn(conversationId, ok, status) {
  try {
    const pack = getConvState(conversationId);
    const resolved = handoffClaimGate.normalizeStatus(status, !!ok);
    pack.state.handoffStatus = resolved;
    pack.state.handoffSucceededThisTurn = handoffClaimGate.claimsAllowed(resolved);
    pack.state.handoffSucceededAt = pack.state.handoffSucceededThisTurn ? Math.floor(Date.now() / 1000) : 0;
    if (resolved === 'note_and_assigned') {
      pack.state.handoffNoteOk = true;
      pack.state.handoffAssignOk = true;
      pack.state.handoffAttempted = true;
    } else if (resolved === 'note_created') {
      pack.state.handoffNoteOk = true;
      pack.state.handoffAssignOk = false;
      pack.state.handoffAttempted = true;
    } else if (resolved === 'assigned') {
      pack.state.handoffNoteOk = false;
      pack.state.handoffAssignOk = true;
      pack.state.handoffAttempted = true;
    } else if (resolved === 'already_active') {
      pack.state.handoffOwnershipActive = true;
      pack.state.handoffNoteOk = false;
      pack.state.handoffAssignOk = false;
      pack.state.handoffAttempted = false;
    } else if (resolved === 'failed') {
      pack.state.handoffAttempted = true;
      pack.state.handoffNoteOk = false;
      pack.state.handoffAssignOk = false;
    } else {
      pack.state.handoffStatus = 'none';
      pack.state.handoffNoteOk = false;
      pack.state.handoffAssignOk = false;
      pack.state.handoffAttempted = false;
      pack.state.handoffOwnershipActive = false;
      pack.state.handoffSucceededThisTurn = false;
    }
    saveConvState(pack.id, pack.state);
  } catch (_) {}
}
function clearHandoffSucceededThisTurn(conversationId) {
  markHandoffSucceededThisTurn(conversationId, false, 'none');
}
function beginHandoffTurn(conversationId, conversation) {
  let prior = {};
  try { prior = getConvState(conversationId).state || {}; } catch (_) { prior = {}; }
  const own = ownershipAlreadyActive(conversation, prior);
  clearHandoffSucceededThisTurn(conversationId);
  if (own) markHandoffSucceededThisTurn(conversationId, true, 'already_active');
}
function applyHandoffActionFacts(conversationId, facts) {
  const status = handoffClaimGate.resolveHandoffStatus(facts || {});
  markHandoffSucceededThisTurn(conversationId, handoffClaimGate.claimsAllowed(status), status);
  return status;
}
function finishHandoffAction(conversationId, noteOk, assignOk) {
  if (noteOk && assignOk) {
    markHandoffSucceededThisTurn(conversationId, true);
    return applyHandoffActionFacts(conversationId, { noteOk: true, assignOk: true, attempted: true });
  }
  const status = handoffClaimGate.resolveHandoffStatus({
    noteOk: !!noteOk,
    assignOk: !!assignOk,
    attempted: true,
    ownershipActive: false,
  });
  if (!noteOk && !assignOk) {
    console.error('handoff_action_failed', conversationId, status);
    console.error('handoff_not_created', conversationId);
  }
  markHandoffSucceededThisTurn(conversationId, handoffClaimGate.claimsAllowed(status), status);
  return status;
}
function applyTrustedHandoffGate(text, conversationId, where, conversation) {
  const status = readTrustedHandoffStatus(conversationId, conversation);
  const gated = handoffClaimGate.gatePublicHandoffClaims(text, {
    handoffStatus: status,
    handoffSucceeded: handoffClaimGate.claimsAllowed(status),
  });
  if (gated.hadClaim && gated.stripped) {
    console.log(
      where === 'send'
        ? 'HANDOFF_CLAIM_GATE send-blocked strip'
        : 'HANDOFF_CLAIM_GATE stripped (no successful handoff this turn)',
      conversationId
    );
    console.log('handoff_claim_removed_no_action', conversationId, status, where || '');
    if (!handoffClaimGate.claimsAllowed(status)) {
      console.log('handoff_not_created', conversationId, where || '');
    }
    if (status === 'failed') console.log('handoff_action_failed', conversationId, where || '');
  }
  return gated;
}

function postProcessModelReply(rawText, conversationId) {
  // ONE authoritative public-response contract for every send path (FAST/FULL/tools/
  // regen/ESCALATE→REPLY/duplicate-retry/forced/fallback). Formatting + leak scrub
  // live in publicResponseContract.js so paths cannot drift; review-link spacing stays
  // local because it is conversation-template specific.
  let text = publicResponseContract.applyPublicResponseContract(rawText, {
    conversationId,
    pickScopeDeclineLine,
  });

  // HANDOFF_CLAIM_GATE_V2: claims stay only when this turn's trusted status proves them.
  try {
    const gated = applyTrustedHandoffGate(text, conversationId, 'postprocess');
    if (gated.stripped) text = gated.text;
  } catch (_) {}

  // VARIANT_GAP_HEDGE_SCRUB_V1 (live 215476080792109): never ship "official info does not
  // state how Instant and Instant Elite differ" when approved knowledge has the size delta.
  try {
    if (variantComparisonCompleteness && typeof variantComparisonCompleteness.scrubFalseVariantGapHedge === 'function') {
      text = variantComparisonCompleteness.scrubFalseVariantGapHedge(text, '');
    }
  } catch (_) {}

  // Review asks: readable Intercom spacing (exactly one blank line between segments)
  if (/trustpilot\.com\/review\/fundedelite\.com/i.test(text) && /propfirmmatch\.com\/prop-firms\/fundedelite/i.test(text)) {
    text = normalizeReviewSpacing(text);
  }

  return text.trim();
}

/* AUDIT_HARDEN_V1:applied */
/* soft-edges v1: strip orphan Cyrillic/CJK junk before Intercom send */
postProcessModelReply = (function (origPostProcessModelReply) {
  return function postProcessModelReply() {
    const out = origPostProcessModelReply.apply(this, arguments);
    const cleaned = softEdges.postProcessStripJunk(out);
    if (cleaned === null) {
      console.warn('[softEdges] skip send: nothing useful after junk strip');
      return '';
    }
    return cleaned;
  };
})(postProcessModelReply);


function normalizeReviewSpacing(text) {
  let t = String(text || '').replace(/\r\n/g, '\n').trim();
  // Never put Arsal/teammate name in review asks (Arsal lock)
  t = t.replace(/\bfor me,\s*Arsal\b/gi, '').replace(/\bme,\s*Arsal\b/gi, '');
  t = t.replace(/\bquick review for me,?\s*/gi, 'quick review ');
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/\bquick review\s+\./gi, 'quick review.');
  t = t.replace(/ +([.,!?])/g, '$1');
  t = t.replace(/\n{3,}/g, '\n\n');
  t = t.replace(/\n*Trustpilot:\s*\n*/i, '\n\nTrustpilot:\n');
  t = t.replace(/\n*PropFirmMatch:\s*\n*/i, '\n\nPropFirmMatch:\n');
  t = t.replace(/\n*Thank you for choosing FundedElite!?\s*/i, '\n\nThank you for choosing FundedElite!');
  t = t.replace(/FundedElite!([^\s\n])/g, 'FundedElite! $1');
  // Blank line after first opener line if the next line is not already blank
  t = t.replace(/^([^\n]{1,100})\n(?!\n)/, '$1\n\n');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

function toHtml(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  // Convert any leftover [[Heading]] markers, preserve <b>, escape the rest.
  let s = t.replace(/\[\[(.+?)\]\]/g, '<b>$1</b>');
  const slots = [];
  s = s.replace(/<\/?b>/gi, (m) => {
    const tag = m.toLowerCase() === '</b>' ? '</b>' : '<b>';
    slots.push(tag);
    return '\0B' + (slots.length - 1) + '\0';
  });
  s = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/\0B(\d+)\0/g, (_, i) => slots[Number(i)]);

  // Unicode • lines → real Intercom <ul><li> (thicker native bullets). Prompt unchanged.
  const lines = s.split('\n');
  const chunks = [];
  let items = [];
  const flushList = () => {
    if (!items.length) return;
    chunks.push('<ul>' + items.map((item) => '<li>' + item + '</li>').join('') + '</ul>');
    items = [];
  };
  // SECTION_HEADING_IN_LI_GUARD_V1 (live 215476080792109): if a bullet still ends with a short
  // <b>Heading</b> (e.g. percentage.<b>IP rule</b>), peel it out as its own chunk so it never
  // nests inside <li>. Defense in depth after publicResponseContract normalize.
  const peelTrailingHeading = (body) => {
    const raw = String(body || '');
    const m = raw.match(/^(.*?)([.!?])\s*(<b>\s*[^<]{2,48}?\s*<\/b>)\s*$/i);
    if (m) {
      const headText = m[3].replace(/<\/?b>/gi, '').trim();
      if (!/[\$%]|\d{3,}/.test(headText)) {
        return { body: m[1].replace(/\s+$/, '') + m[2], heading: m[3] };
      }
    }
    const m2 = raw.match(/^(.*\S)\s*(<b>\s*(?:Shared(?:\s+Rules?)?|(?:The\s+)?Main\s+Differences?|Current\s+promotions?|IP\s+rules?|Risk\s+rules?)\s*<\/b>)\s*$/i);
    if (m2) return { body: m2[1].replace(/\s+$/, ''), heading: m2[2] };
    return { body: raw, heading: '' };
  };
  for (const line of lines) {
    const m = line.match(/^\s*[•●▪]\s+(.*)$/);
    if (m) {
      const peeled = peelTrailingHeading(m[1]);
      if (peeled.heading) {
        items.push(peeled.body);
        flushList();
        chunks.push(peeled.heading);
      } else {
        items.push(m[1]);
      }
    } else {
      flushList();
      chunks.push(line);
    }
  }
  flushList();

  const isReviewHtml =
    /trustpilot\.com\/review\/fundedelite\.com/i.test(s) &&
    /propfirmmatch\.com\/prop-firms\/fundedelite/i.test(s);

  let html = '';
  let pendingBlank = false;
  for (let i = 0; i < chunks.length; i++) {
    const cur = chunks[i];
    if (cur === '') {
      // CUSTOMER REPLY SPACING , HARD RULE: exactly one blank line between
      // paragraphs for every client-facing reply (not review-only).
      pendingBlank = true;
      continue;
    }

    if (cur.startsWith('<ul>')) {
      if (html) {
        // One blank line before a list that follows prose/heading
        if (!html.endsWith('</ul>')) {
          while (html.endsWith('<br>')) html = html.slice(0, -4);
          html += '<br><br>';
        } else {
          html += '<br>';
        }
      }
      html += cur;
      pendingBlank = true; // one blank line after list before next paragraph
      continue;
    }

    const isHeading = /^<b>[^<]+<\/b>$/i.test(cur.trim());
    if (!html) {
      html = cur;
      pendingBlank = false;
      continue;
    }
    if (isHeading) {
      html += '<br><br>' + cur;
    } else if (pendingBlank) {
      html += '<br><br>' + cur;
    } else {
      html += '<br>' + cur;
    }
    pendingBlank = false;
  }
  // Intercom occasionally receives a bold section label glued to the final
  // bullet (observed live: "1:30.<b>Main Difference</b>"). Keep that label
  // outside the list at the final HTML boundary, regardless of earlier passes.
  html = html.replace(
    /(<li>(?:(?!<\/li>)[\s\S])*?)(<b>(?:Shared Rules|Main Differences?|IP rules?|Risk rules?|Current promotions?)<\/b>)\s*<\/li>\s*<\/ul>/gi,
    '$1</li></ul><br><br>$2'
  );
  return html;
}

function contactBits(conv) {
  const contacts = (conv.contacts && conv.contacts.contacts) || [];
  const c0 = contacts[0] || {};
  const src = conv.source || {};
  const author = src.author || {};
  // CONTACTBITS_NO_ADMIN_SOURCE_V1 (2026-10-05, live 215476244301144):
  // Outbound teammate emails put Jerry (admin) on conversation.source.author. Falling back to
  // that name made Luna greet "Hello Jerry," in the client thread. Only user/lead source
  // authors may fill identity gaps; prefer the Intercom contact record.
  const authorType = String(author.type || '');
  const authorIsClient = authorType === 'user' || authorType === 'lead';
  const fromAuthor = authorIsClient ? author : {};
  return {
    name: c0.name || fromAuthor.name || '',
    email: c0.email || fromAuthor.email || '',
    id: c0.id || fromAuthor.id || '',
  };
}

function partsOf(conv) {
  return (conv.conversation_parts && conv.conversation_parts.conversation_parts) || [];
}

function authoritativeConversationParts(conv) {
  if (!conv || typeof conv !== 'object') return null;
  const box = conv.conversation_parts;
  if (!box || typeof box !== 'object' || Array.isArray(box)) return null;
  if (!Array.isArray(box.conversation_parts)) return null;
  return box.conversation_parts;
}

async function checkSendBoundary(conversationId, userPart, clientName, opts) {
  try {
    if (control.isPaused()) return { ok: false, why: 'paused' };
  } catch (_) {
    return { ok: false, why: 'control-unavailable' };
  }
  try {
    if (control.isAiOff && control.isAiOff(conversationId)) return { ok: false, why: 'ticket-ai-off' };
  } catch (_) {
    return { ok: false, why: 'control-unavailable' };
  }
  try {
    if (typeof control.isTestAllowed === 'function' && !control.isTestAllowed(conversationId, clientName)) {
      return { ok: false, why: 'test-allowlist' };
    }
  } catch (_) {
    return { ok: false, why: 'control-unavailable' };
  }

  const fresh = await fetchConversation(conversationId);
  const parts = authoritativeConversationParts(fresh);
  if (!parts) {
    ownershipUnavailableResult('send-boundary-refetch-unavailable');
    return { ok: false, why: 'refetch-unavailable' };
  }
  if (fresh && (fresh.open === false || String(fresh.state || '').toLowerCase() === 'closed')) {
    console.log('SKIP send-boundary closed-during-send', conversationId);
    return { ok: false, why: 'closed-during-send', parts, fresh };
  }

  if (userPart) {
    if (arsalAlreadyRepliedAfter(parts, userPart) && !(opts && opts.spreadTemplate)) return { ok: false, why: 'already-replied' };
    const answeredAt = Number(userPart.created_at || 0);
    for (const p of parts) {
      if (Number(p.created_at || 0) <= answeredAt) continue;
      if (String(p.part_type || '') === 'close') {
        console.log('SKIP send-boundary closed-during-send', conversationId);
        return { ok: false, why: 'closed-during-send' };
      }
      if (isHumanTeammatePublicReply(p) && teammateHandoffGates.classifyTeammatePublicReply(p.body) === 'substantive') {
        return { ok: false, why: 'human-takeover' };
      }
      if (isHumanTeammatePublicReply(p) && teammateHandoffGates.isTeammateClosingOrRating(p.body)) {
        return { ok: false, why: 'teammate-closing-or-rating' };
      }
      if (p.part_type === 'note' && (p.author || {}).type === 'admin' &&
          continuousOwnership.isStopInstruction(p.body)) return { ok: false, why: 'explicit-stop' };
    }
    for (const p of parts) {
      const a = p.author || {};
      if (a.type !== 'user') continue;
      if (String(p.id || '') === String(userPart.id || '')) continue;
      if (Number(p.created_at || 0) > answeredAt && stripHtml(p.body || '')) {
        if (!(opts && opts.spreadTemplate)) return { ok: false, why: 'stale-draft' };
      }
    }
  }
  // RISK_NO_PUBLIC_V1: never public-reply when Risk owns / is assigned (re-fetched).
  // Closes race where Intercom routes email to Risk while Luna is still drafting.
  if (fresh && isRiskOwnedOrAssignedInHistory(fresh)) {
    console.log('SKIP send-boundary risk-owned-no-public', conversationId);
    return { ok: false, why: 'risk-owned-no-public', parts, fresh };
  }

  return { ok: true, parts, fresh };
}

// RESOLVED_CLOSURE_V1: re-read before a note, assignment, or public handoff.
// A close, rating, substantive takeover, or closure-only turn that landed during
// generation cancels the stale action. Fail closed when the refetch itself fails.
async function blockStaleConsequentialEscalation(conversationId, userPart, latestText) {
  let fresh = null;
  try { fresh = await fetchConversation(conversationId); } catch (_) { fresh = null; }
  const parts = authoritativeConversationParts(fresh);
  if (!fresh || !parts) {
    console.log('ESCALATE_FRESHNESS_BLOCK', conversationId, 'refetch-unavailable');
    return { block: true, reason: 'refetch-unavailable', fresh, parts };
  }
  let stopFn = () => false;
  try { stopFn = (body) => continuousOwnership.isStopInstruction(body); } catch (_) { stopFn = () => false; }
  const decision = teammateHandoffGates.consequentialEscalationBlock(parts, fresh, {
    arsalId: ARSAL_ID,
    eliteAiId: ELITE_AI_ID,
    latestText: latestText || stripHtml((userPart && userPart.body) || ''),
    sinceCreatedAt: userPart && userPart.created_at,
    isStopInstruction: stopFn,
  });
  if (decision.block) console.log('ESCALATE_FRESHNESS_BLOCK', conversationId, decision.reason);
  return Object.assign({ fresh, parts }, decision);
}

// QUOTED_IMAGE_NOT_CLIENT_V1 (2026-09-25, live 215476103729599): an email reply carries every inline image of the
// quoted thread as an attachment, including FundedElite's own signature logo. That logo was sent to the model as the
// client's screenshot, the turn became image-extraction and the model skipped it (silence). An image the body places
// ONLY inside the quoted history ("On ... wrote:", "El ... escribió:", <blockquote>, forwarded header) is not the
// client's. Matched by Intercom upload id (body and attachment URLs use different hosts). Images before the quote, and
// attachments the body does not reference at all, are kept exactly as before.
const QUOTE_START_RE = /<blockquote\b|class="[^"]*gmail_quote|(?:^|<p[^>]*>|<br\s*\/?>|<div[^>]*>)\s*(?:on|el|le|am|il|em|op)\s(?:(?!<\/p>)[\s\S]){3,300}?(?:wrote|escribi[oó]|a\s+[ée]crit|schrieb|ha\s+scritto|escreveu|schreef)\s*:|-{2,}\s*(?:original|forwarded)\s+message|(?:^|<p[^>]*>|<br\s*\/?>)\s*from\s*:\s/i;
function quotedOnlyUploadIds(body) {
  const html = String(body || '');
  const m = QUOTE_START_RE.exec(html);
  if (!m) return new Set();
  const cut = m.index;
  const ids = (h) => new Set([...h.matchAll(/\/i\/o\/[^/"'\s]+\/(\d{3,})\//g)].map((x) => x[1]));
  const before = ids(html.slice(0, cut));
  return new Set([...ids(html.slice(cut))].filter((id) => !before.has(id)));
}

function collectImageAttachments(part) {
  const atts = (part && part.attachments) || [];
  const out = [];
  let quotedOnly = new Set();
  try { quotedOnly = quotedOnlyUploadIds(part && part.body); } catch (_) { quotedOnly = new Set(); }
  for (const a of atts) {
    if (!a) continue;
    const url = String(a.url || '');
    if (!url) continue;
    const upload = (url.match(/\/i\/o\/[^/]+\/(\d{3,})\//) || [])[1];
    if (upload && quotedOnly.has(upload)) { console.log('IMAGE_SKIP quoted-history', 'nameLen=' + String(a.name || '').length); continue; }
    const ct = String(a.content_type || a.contentType || '').toLowerCase();
    const name = String(a.name || '');
    const isImg =
      /^image\//i.test(ct) ||
      /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(url) ||
      /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
    if (!isImg) continue;
    const size = Number(a.filesize || a.file_size || 0);
    if (size && size > 8 * 1024 * 1024) continue; // skip huge files
    out.push({
      url,
      content_type: ct || 'image/png',
      name,
      filesize: size,
    });
  }
  return out.slice(0, 4); // cap
}

// Attachment fetch hardening (Final v3 §13). The previous version followed any URL axios
// accepted, followed redirects implicitly, and only checked the size AFTER buffering the
// whole body. That allowed a large download to be held in memory and allowed a redirect to
// reach an internal address. No host allowlist is hardcoded: no real attachment host could
// be derived from live data, and guessing one would break legitimate Intercom attachments.
// Set LUNA_ATTACHMENT_HOSTS (comma separated) to narrow it once the real hosts are known.
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MAX_REDIRECTS = 2;
const IMAGE_FETCH_TIMEOUT_MS = 25000;

function unwrapMappedIp(hostname) {
  let h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  const dotted = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted) return dotted[1];
  const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }
  const compat = h.match(/^::(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (compat) return compat[1];
  return h;
}

function isPrivateHost(hostname) {
  const h = unwrapMappedIp(hostname);
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(h) || /^fe80:/i.test(h)) return true; // unique-local / link-local v6
  const m4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m4) {
    const [a, b] = [Number(m4[1]), Number(m4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;            // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT
    if (a >= 224) return true;                          // multicast / reserved
  }
  return false;
}

function attachmentDnsLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (isPrivateHost(hostname)) {
    return callback(Object.assign(new Error('ATTACHMENT_BLOCKED_RESOLVED_DESTINATION'), { code: 'ENOTFOUND' }));
  }
  const opts = { all: true, verbatim: true };
  if (options && options.family) opts.family = options.family;
  dns.lookup(String(hostname || ''), opts, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: 4 }];
    for (const row of list) {
      const addr = typeof row === 'string' ? row : row.address;
      if (isPrivateHost(addr)) {
        return callback(Object.assign(new Error('ATTACHMENT_BLOCKED_RESOLVED_DESTINATION'), { code: 'ENOTFOUND' }));
      }
    }
    const first = list[0];
    const addr = typeof first === 'string' ? first : first.address;
    const family = typeof first === 'string' ? 4 : first.family;
    if (options && options.all) return callback(null, list);
    callback(null, addr, family);
  });
}

function detectImageMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function attachmentUrlAllowed(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl || '')); } catch (_) { return { ok: false, why: 'unparseable' }; }
  if (u.protocol !== 'https:') return { ok: false, why: 'scheme ' + u.protocol };
  if (isPrivateHost(u.hostname)) return { ok: false, why: 'private or local destination' };
  const allow = String(process.env.LUNA_ATTACHMENT_HOSTS || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (allow.length && !allow.some((a) => u.hostname === a || u.hostname.endsWith('.' + a))) {
    return { ok: false, why: 'host not in LUNA_ATTACHMENT_HOSTS' };
  }
  return { ok: true, url: u };
}

async function imageAttachmentToDataUrl(att) {
  try {
    let target = String((att && att.url) || '');
    let contentType = '';
    let buf = null;

    for (let hop = 0; hop <= IMAGE_MAX_REDIRECTS; hop += 1) {
      const check = attachmentUrlAllowed(target);
      if (!check.ok) {
        console.log('IMAGE_FETCH_BLOCKED', check.why, 'nameLen=' + String((att && att.name) || '').length);
        return null;
      }
      const r = await axios.get(target, {
        responseType: 'stream',
        timeout: IMAGE_FETCH_TIMEOUT_MS,
        maxRedirects: 0,               // every hop is re-validated by us, never followed blindly
        validateStatus: () => true,
        headers: { Accept: 'image/*' },
        lookup: attachmentDnsLookup,
      });

      if (r.status >= 300 && r.status < 400 && r.headers && r.headers.location) {
        if (r.data && typeof r.data.destroy === 'function') r.data.destroy();
        target = new URL(r.headers.location, target).toString();
        continue;
      }
      if (r.status >= 400) {
        if (r.data && typeof r.data.destroy === 'function') r.data.destroy();
        console.log('IMAGE_FETCH_FAIL', r.status, 'nameLen=' + String((att && att.name) || '').length);
        return null;
      }

      contentType = String((r.headers && r.headers['content-type']) || '').split(';')[0].trim();
      if (contentType && !/^image\//i.test(contentType)) {
        if (r.data && typeof r.data.destroy === 'function') r.data.destroy();
        console.log('IMAGE_FETCH_BLOCKED not-an-image', contentType, 'nameLen=' + String((att && att.name) || '').length);
        return null;
      }
      const declared = Number((r.headers && r.headers['content-length']) || 0);
      if (declared && declared > IMAGE_MAX_BYTES) {
        if (r.data && typeof r.data.destroy === 'function') r.data.destroy();
        console.log('IMAGE_FETCH_BLOCKED too-large-declared', declared);
        return null;
      }

      // Enforce the cap WHILE streaming so an oversized body is never fully buffered.
      buf = await new Promise((resolve) => {
        const chunks = [];
        let total = 0;
        const stream = r.data;
        if (!stream || typeof stream.on !== 'function') { resolve(Buffer.isBuffer(stream) ? stream : null); return; }
        stream.on('data', (c) => {
          total += c.length;
          if (total > IMAGE_MAX_BYTES) {
            console.log('IMAGE_FETCH_BLOCKED too-large-stream', total);
            try { stream.destroy(); } catch (_) {}
            resolve(null);
            return;
          }
          chunks.push(c);
        });
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', () => resolve(null));
      });
      break;
    }

    if (!buf || !buf.length) return null;
    const detected = detectImageMime(buf);
    if (!detected) {
      console.log('IMAGE_FETCH_BLOCKED not-an-image-bytes', 'nameLen=' + String((att && att.name) || '').length);
      return null;
    }
    return 'data:' + detected + ';base64,' + buf.toString('base64');
  } catch (e) {
    console.error('IMAGE_FETCH_ERR', 'class=' + (e && e.name || 'Error'));
    return null;
  }
}


async function buildVisionUserContent(textPrompt, imageAtts) {
  const content = [{ type: 'text', text: textPrompt }];
  for (const att of imageAtts || []) {
    const dataUrl = await imageAttachmentToDataUrl(att);
    if (!dataUrl) continue;
    content.push({
      type: 'image_url',
      image_url: { url: dataUrl },
    });
  }
  return content;
}

function lastLunaPublicAskedClarification(parts) {
  for (let i = (parts || []).length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!p || String(p.part_type || '') === 'note') continue;
    const a = p.author || {};
    if (String(a.id || '') !== ARSAL_ID && a.type !== 'bot') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    return /\?\s*$/.test(body.trim()) || /\?\s/m.test(body);
  }
  return false;
}

function isShortClientAck(text, parts) {
  const t = String(text || '').trim();
  // SHORT_ACK_CLARIFY_V1 (215476138018591): "Yes"/"No" after Luna's clarification question is an
  // answer in context, not a courtesy ack. Do not route it through SHORT_ACK_OVERRIDE / smalltalk.
  if (parts && lastLunaPublicAskedClarification(parts) &&
      /^(yes|yep|yeah|yup|no|nope|nah)([.!,\s].*)?$/i.test(t)) {
    return false;
  }
  /* MICHAN_TEAMMATE_HANDOFF_V1: short-ack includes Thankyou / thank you */
  if (teammateHandoffGates.isShortClientAckExpanded(text)) return true;
  if (!t || t.length > 120) return false;
  // Pure / near-pure acknowledgements , no new question
  if (/[?]/.test(t)) return false;
  if (/\b(but|however|also|what|how|why|when|where|can i|could i|please (check|look|help|review)|account|email|payout|kyc|breach)\b/i.test(t)) {
    // allow pure thanks that mention nothing else
    if (!/^(ok(ay)?|sure|thanks?|thank you|thx|ty|got it|will do|alright|perfect|great|awesome|noted|understood|yes|yep|yeah)([.!,\s]*(sure|will do|thank(?:s| you)?|thx|ty|got it|ok(ay)?|alright))*[.!]*$/i.test(t)) {
      return false;
    }
  }
  return /^(ok(ay)?|sure|thanks?|thank you|thx|ty|got it|will do|alright|perfect|great|awesome|noted|understood|yes|yep|yeah)(\s|,|!|\.|$)/i.test(t) &&
    /^(?:ok(?:ay)?|sure|thanks?|thank you|thx|ty|got it|will do|alright|perfect|great|awesome|noted|understood|yes|yep|yeah|[,\s.!]|will do|thank(?:s| you)?)+$/i.test(t);
}

/* MT5_CONTAINMENT_V1:BEGIN */
const spreadPublicGuard = require('./spreadPublicGuard');
const spreadTestState = require('./spreadTestState');
const SPREAD_TEST_REPLY = spreadPublicGuard.SAFE_SPREAD_REPLY;
function clearSpreadState(conversationId, reason) {
  try { spreadTestState.clear(String(conversationId || ''), reason || 'clear-event'); } catch (_) {}
}
function buildSpreadTestReply() {
  return SPREAD_TEST_REPLY;
}
const __spreadSquash = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
function lastPublicBotBodyFromParts(parts) {
  if (!Array.isArray(parts)) return '';
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!p || p.part_type === 'note') continue;
    const a = p.author || {};
    if (String(a.id || '') !== String(ARSAL_ID)) continue;
    if (!p.body) continue;
    return stripHtml(String(p.body || ''));
  }
  return '';
}
/** True when the last public bot message contains the contained spread reply (a greeting prefix still counts). */
function priorBotWasContainedSpreadReply(parts) {
  const body = lastPublicBotBodyFromParts(parts);
  if (!body) return false;
  const a = __spreadSquash(body);
  const b = __spreadSquash(SPREAD_TEST_REPLY);
  return b.length > 0 && a.includes(b);
}
/* MT5_CONTAINMENT_V1:END */

/* LUNA_SPREAD_IMAGE_FIXES_V1:BEGIN:spread */
function isSpreadCheckAsk(...__args) {
  // Strict spread intent is required; legacy detector can only confirm, never widen.
  return __spreadAskGate.gateLegacy(__args, isSpreadCheckAsk__legacy);
}
/* LUNA_SPREAD_IMAGE_FIXES_V1:END:spread */
function isSpreadCheckAsk__legacy(text) {
  const t = String(text || '');
  // Soft typos spreds/spreadt kept in sync with spreadAskGate SPREAD_TERM_RE
  if (!/\b(?:spreads?|spreds|spreadt)\b/i.test(t) && !(/\b(mt5|metatrader)\b/i.test(t) && /\b(login|password|server|demo|test)\b/i.test(t))) {
    return false;
  }
  return /\b(?:spreads?|spreds|spreadt|check|compare|inspect|see|show|what|how|login|password|server|demo|test account)\b/i.test(t);
}

/** True when client wants THEIR specific case status checked (not general notify process). */
function isClearlyPersonalReviewStatusCheck(text) {
  const t = String(text || '');
  if (!t) return false;
  if (/\b(check|what'?s|what\s+is|any\s+update|give\s+me)\b[\s\S]{0,50}\b(status|update|progress)\b[\s\S]{0,40}\b(my|our)\b[\s\S]{0,40}\b(review|kyc|verification)\b/i.test(t)) {
    return true;
  }
  if (/\b(status|update|progress)\s+of\s+(my|our)\s+(kyc|review|verification)\b/i.test(t)) return true;
  if (/\b(my|our)\s+(kyc|review|verification)\s+(status|update|progress)\b/i.test(t)) return true;
  if (/\bcheck\s+(my|our|the\s+status\s+of\s+my)\b[\s\S]{0,40}\b(review|kyc|verification)\b/i.test(t)) return true;
  if (/\baccount\s*(?:number|#|no\.?)?\s*:?\s*\d{5,12}\b/i.test(t) && /\b(review|kyc|verification|status)\b/i.test(t)) {
    return true;
  }
  if (/\b(has|have)\s+my\s+(kyc|review|verification)\s+(been\s+)?(done|completed|approved|finished)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * General PROCESS ask: how they will know when review/verification is done / whether they get notified.
 * NOT a personal case-status check. Code-enforced Arsal lock , answer directly, never escalate.
 */
function isReviewNotificationProcessAsk(text) {
  const t = String(text || '');
  if (!t) return false;
  if (isClearlyPersonalReviewStatusCheck(t)) return false;

  const aboutReview =
    /\b(review|verification|verif(?:y|ied|ying)|kyc|under\s+review|being\s+reviewed)\b/i.test(t) ||
    /\b(once|when|if)\s+(it|this|the\s+(?:review|verification|kyc))\s+(is\s+)?(done|complete|completed|finished)\b/i.test(t);
  if (!aboutReview) return false;

  const processNotify =
    /\bhow\s+(will|do|can)\s+(i|we)\s+(know|find\s+out|be\s+(?:told|notified|informed|updated))\b/i.test(t) ||
    /\bhow\s+will\s+(i|we)\s+know\s+(if|when|that)\b/i.test(t) ||
    /\bwill\s+(i|we)\s+(get|receive|be\s+(sent|given))\s+(an?\s+)?(email|notification|notif(?:ied)?|update|message)\b/i.test(t) ||
    /\bwill\s+(i|we)\s+be\s+(notified|informed|updated|told|emailed)\b/i.test(t) ||
    /\bwill\s+(you|they|the\s+team)\s+(tell|notify|email|update|inform|message|send)\s+(me|us)\b/i.test(t) ||
    /\bwill\s+(they|you)\s+send\s+(me\s+)?(an?\s+)?(email|message|notification)\b/i.test(t) ||
    /\bdo\s+(i|we)\s+(get|receive)\s+(an?\s+)?(email|notification)\b/i.test(t) ||
    /\bhow\s+(am\s+i|are\s+we)\s+(notified|informed|updated)\b/i.test(t) ||
    /\b(should|do)\s+i\s+(check\s+back|keep\s+checking|follow\s+up)\b/i.test(t) ||
    (/\b(email|notif(?:y|ication|ied)|intercom)\b/i.test(t) &&
      /\b(when|once|if|after)\b[\s\S]{0,40}\b(done|complete|completed|finished|result)\b/i.test(t));

  if (!processNotify) return false;
  // Mixed: if primary intent is notification method, prefer process answer (already excluded clear case-status).
  return true;
}

const REVIEW_STATUS_DIRECT_REPLIES = [
  "Once your review is complete, our team will update you on Intercom or via email, you don't need to check back manually.",
  "When the review finishes, we'll reach out on Intercom or by email - no need to keep checking in yourself.",
  "You'll get an update from our team on Intercom or email once the review is done, you won't need to follow up manually.",
];


/** Default escalate CLIENT handoff — no routine "Intercom or email" closer. */
const ESCALATE_CLIENT_HANDOFF_DEFAULT =
  "I've forwarded this to a human support teammate. You'll receive an update soon.";

/** True when client asked where/how they will receive the update (channel question). */
function clientAskedUpdateChannel(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (/\b(where|how)\b[\s\S]{0,50}\b(get|receive|hear|be\s+(?:notified|informed|updated)|notification|update)\b/i.test(t)) {
    return true;
  }
  if (/\b(will|do)\s+(i|we)\s+(get|receive)\s+(an?\s+)?(email|message|notification|update|reply)\b/i.test(t)) {
    return true;
  }
  if (/\b(intercom|email)\b/i.test(t) && /\b(update|notif(?:y|ication|ied)|hear\s+back|reach\s+me)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Soften escalate CLIENT wording only. Does not change escalate routing/logic.
 * Strips routine "through/on/via Intercom or email" unless client asked channel.
 */
function normalizeEscalateClientHandoff(msg, clientText) {
  let s = String(msg || '').trim();
  if (!s) return ESCALATE_CLIENT_HANDOFF_DEFAULT;
  if (clientAskedUpdateChannel(clientText)) return s;
  const before = s;
  s = s.replace(
    /\s*[,.-]?\s*(through|via|on|by)\s+Intercom\s+or\s+(?:via\s+|by\s+)?email\b\.?/gi,
    ''
  );
  s = s.replace(/\s*on\s+Intercom\s+or\s+email\b\.?/gi, '');
  s = s.replace(/\s*through\s+Intercom\s+or\s+email\b\.?/gi, '');
  s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
  if (!s) return ESCALATE_CLIENT_HANDOFF_DEFAULT;
  if (s !== before) {
    console.log('ESCALATE_HANDOFF_SOFTENED', logLen(before), '=>', logLen(s));
  }
  return s;
}

function pickReviewStatusDirectReply() {
  const opts = REVIEW_STATUS_DIRECT_REPLIES;
  return opts[Math.floor(Math.random() * opts.length)];
}

function clientSaidNoAccount(conversation) {
  const texts = collectClientMessageTexts(conversation);
  const latest = texts.length ? texts[texts.length - 1] : '';
  // A later breach / payout / concrete login re-opens the account requirement.
  if (prePurchaseGate.isLiveAccountIncident(latest)) return false;
  if (!prePurchaseGate.threadHasLiveAccountWork(texts) && prePurchaseGate.threadIsPrePurchase(texts)) return true;
  if (prePurchaseGate.threadHasLiveAccountWork(texts)) {
    return prePurchaseGate.clientDeclinedAccount(latest) || idGates.clientSaidNoAccount(latest);
  }
  return texts.some((t) =>
    idGates.clientSaidNoAccount(t) ||
    prePurchaseGate.clientDeclinedAccount(t) ||
    /\b(don'?t|do\s+not|dont)\s+have\b[\s\S]{0,40}\baccount(\s+number)?\b/i.test(t) ||
    /\bno\s+account\s+number\b/i.test(t) ||
    /\b(haven'?t|have\s+not)\s+(purchased|bought|got|opened)\b/i.test(t) ||
    /\b(not|never)\s+(purchased|bought)\b[\s\S]{0,30}\baccount\b/i.test(t) ||
    /\bno\s+trading\s+account\b/i.test(t) ||
    /\bi\s+don'?t\s+have\s+(a\s+)?(trading\s+)?account\b/i.test(t) ||
    /\bstill\s+haven'?t\s+bought\b/i.test(t)
  );
}

function clientSaidNoEmail(conversation) {
  const texts = collectClientMessageTexts(conversation);
  return texts.some((t) => idGates.clientSaidNoEmail(t));
}

function normalizePublicBotBody(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bodiesNearlyIdentical(a, b) {
  const na = normalizePublicBotBody(a);
  const nb = normalizePublicBotBody(b);
  if (!na || !nb) return false;
  return na === nb;
}

function getLastArsalPublicCommentBody(parts) {
  let last = '';
  for (const p of parts || []) {
    const a = p.author || {};
    if (String(a.id || '') !== ARSAL_ID) continue;
    if (String(p.part_type || '') === 'note') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    last = body;
  }
  return last;
}

function rememberEscalateStatusBody(conversationId, body) {
  const { all, state, id } = getConvState(conversationId);
  state.lastEscalateStatusBody = String(body || '');
  all[id] = state;
  saveTicketState(all);
}

function pickEscalateStatusReply(seed) {
  const bank = Array.isArray(escalateRelatedOnly.STATUS_ONLY_REPLIES)
    ? escalateRelatedOnly.STATUS_ONLY_REPLIES
    : [];
  if (Array.isArray(seed)) {
    const available = bank.filter((r) => !seed.some((ex) => bodiesNearlyIdentical(r, ex)));
    return available.length ? available[0] : null;
  }
  return escalateRelatedOnly.pickEscalateStatusReply(seed);
}

/** Holding-line while escalateAwaitingFirstTeammate. Short ack → SKIP. Never repeat last public/status body. */
async function postEscalateHoldingStatus(conversationId, text, latestUser, clientName, escState, logTag) {
  if (isShortClientAck(text)) {
    console.log(logTag + ' short-ack SKIP (awaiting teammate)', conversationId);
    return { skipped: true, reason: 'short_ack' };
  }
  // Already-escalated "Jerry!!!!!!" / teammate-name call: brief hold status, never clarify.
  if (typeof isEscalationPersonCall === 'function' && isEscalationPersonCall(text)) {
    console.log(logTag + ' escalation-person-call (awaiting teammate)', conversationId);
  }
  const fresh = await fetchConversation(conversationId);
  const parts = fresh ? partsOf(fresh) : [];
  const excludes = [];
  if (escState && escState.lastEscalateStatusBody) excludes.push(escState.lastEscalateStatusBody);
  const lastPublic = getLastArsalPublicCommentBody(parts);
  if (lastPublic) excludes.push(lastPublic);
  const status = pickEscalateStatusReply(excludes);
  if (!status) {
    console.log(logTag + ' SKIP (all status variants match last)', conversationId);
    return { skipped: true, reason: 'duplicate_all' };
  }
  // Belt-and-suspenders: if somehow still identical to last public, skip
  if (lastPublic && bodiesNearlyIdentical(status, lastPublic)) {
    console.log(logTag + ' SKIP (picked body ~identical last public)', conversationId);
    return { skipped: true, reason: 'identical_last' };
  }
  const statusOut = postProcessModelReply(status, conversationId);
  const posted = await postClientCommentOnce(conversationId, statusOut, latestUser, clientName);
  if (posted != null) {
    rememberEscalateStatusBody(conversationId, statusOut);
    console.log(logTag, conversationId);
  }
  return { skipped: false, status, posted };
}

/* ESCALATION_DEDUPE_V1
 * One Luna escalation note per unresolved issue, whichever path writes it. Live evidence
 * (2026-09-22/23, 13 duplicate notes in 30h): the identity-recovery, REPLY-preSend-block and
 * presend MISSED_ESCALATION paths escalated without checking for an open escalation, and the
 * awaiting-state related check called repeats of the same complaint "unrelated". The source of
 * truth here is the LIVE conversation (a fresh fetch), not ticket state, so a lost/stale state file
 * cannot re-open the door either.
 * A new note is allowed when: there is no prior Luna escalation note; a human teammate has
 * replied publicly since it; it is older than 24h; or the client raised a clearly different
 * issue. Fetch failure fails OPEN (a missed escalation is worse than a duplicate note). */
function escalationTokens(t) {
  return new Set(
    String(t || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length >= 4 && !/^(client|customer|wants|would|their|there|about|please|problem|account|email|action|needed|provided|check|confirm|know|with|that|this|from|have|they|them|been|will|what|when|which|asks|asked|requests|request)$/.test(w))
  );
}

function sameEscalationIssue(newText, noteText, ageSec) {
  const ctx = { escalateProblem: noteText, escalateNote: noteText.slice(0, 600) };
  try { if (escalateRelatedOnly.isRelatedToEscalatedProblem(newText, ctx)) return 'related_topic'; } catch (_) {}
  const a = escalationTokens(newText), b = escalationTokens(noteText);
  if (a.size && b.size) {
    let hit = 0;
    for (const w of a) if (b.has(w)) hit += 1;
    if (hit / Math.min(a.size, b.size) >= 0.3) return 'content_overlap';
  }
  if (ageSec < 30 * 60) {
    let ta = [], tb = [];
    try { ta = escalateRelatedOnly.detectEscalateTopics(newText) || []; tb = escalateRelatedOnly.detectEscalateTopics(noteText) || []; } catch (_) {}
    const disjoint = ta.length && tb.length && !ta.some((x) => tb.includes(x));
    if (!disjoint) return 'recent_no_distinct_topic';
  }
  return '';
}

async function escalationDuplicateCheck(conversationId, newProblemText) {
  let fresh = null;
  try { fresh = await fetchConversation(conversationId); } catch (_) { fresh = null; }
  const parts = fresh ? authoritativeConversationParts(fresh) : null;
  if (!parts) return { duplicate: false, reason: 'refetch_unavailable', full: fresh };
  let noteIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (String(p.part_type || '') !== 'note') continue;
    if (String((p.author || {}).id || '') !== ARSAL_ID) continue;
    if (isEscalateOrSystemNote(stripHtml(p.body || ''))) noteIdx = i;
  }
  if (noteIdx < 0) return { duplicate: false, reason: 'no_prior_escalation', full: fresh };
  const note = parts[noteIdx];
  const ageSec = Math.floor(Date.now() / 1000) - Number(note.created_at || 0);
  if (ageSec > 24 * 3600) return { duplicate: false, reason: 'prior_escalation_older_than_24h', full: fresh };
  for (let j = noteIdx + 1; j < parts.length; j++) {
    if (isHumanTeammatePublicReply(parts[j])) return { duplicate: false, reason: 'teammate_replied_since', full: fresh };
  }
  const clientAfter = parts.slice(noteIdx + 1).filter((p) => {
    const a = p.author || {};
    return (a.type === 'user' || a.type === 'lead') && stripHtml(p.body || '');
  });
  if (!clientAfter.length) return { duplicate: true, reason: 'no_new_client_message_since_escalation', full: fresh };
  const why = sameEscalationIssue(
    [newProblemText || '', clientAfter.map((p) => stripHtml(p.body || '')).join(' ')].join(' '),
    stripHtml(note.body || ''),
    ageSec
  );
  if (why) return { duplicate: true, reason: 'same_issue_awaiting_teammate:' + why, full: fresh };
  return { duplicate: false, reason: 'different_issue', full: fresh };
}

/** Escalation bookkeeping shared by every escalation path (the main path keeps its own block). */
function recordEscalationState(conversationId, problemText, noteText, full) {
  try {
    const stPack = getConvState(conversationId);
    stPack.state.lastEscalateAt = Math.floor(Date.now() / 1000);
    const ctx = escalateRelatedOnly.buildEscalateContext({
      problem: String(problemText || '').slice(0, 2000),
      noteBody: String(noteText || ''),
      clientTexts: typeof collectClientMessageTexts === 'function' ? collectClientMessageTexts(full || {}) : [],
    });
    stPack.state.lastEscalateProblem = ctx.lastEscalateProblem;
    stPack.state.lastEscalateNoteSnippet = ctx.lastEscalateNoteSnippet;
    stPack.state.lastEscalateTopic = ctx.lastEscalateTopic;
    stPack.state.lastEscalateTopics = ctx.lastEscalateTopics;
    stPack.state.escalateAwaitingFirstTeammate = true;
    stPack.state.escalateTeammateExplainedAt = 0;
    stPack.state.deferredRelatedReply = null;
    saveConvState(stPack.id, stPack.state);
  } catch (e) {
    console.error('ESCALATE_STATE_RECORD_FAIL', conversationId, 'class=' + (e && e.name || 'Error'));
  }
}

function isHumanTeammatePublicReply(part) {
  /* MICHAN_TEAMMATE_HANDOFF_V1: align with teammateHandoffGates (comment + assignment/open body) */
  return teammateHandoffGates.isHumanTeammatePublicReply(part, {
    arsalId: ARSAL_ID,
    eliteAiId: ELITE_AI_ID,
  });
}

// --- Fin / Elite AI wait gate (hard code-enforce; do not race Fin) ---
const FIN_RECENT_OWNING_SEC = 90;
const FIN_FRESH_CONV_SEC = 120;

function clientRequestedLiveAgent(text) {
  return softEdges.clientRequestedLiveAgent(text);
}

/** True when the client is asking for a real human / manager (not just Fin→Arsal takeover). */
function clientWantsHumanTeammate(text) {
  if (humanRequest.isHumanRequest(text)) return true;
  if (clientRequestedLiveAgent(text)) return true;
  const t = String(text || '');
  if (/\b(chargeback|legal\s+action|file\s+a\s+complaint|speak\s+to\s+(?:a\s+|an\s+|my\s+)?supervisor)\b/i.test(t)) return true;
  return false;
}

/**
 * WHEN A HELD REPLY MAY BECOME A TEAMMATE NOTE (owner order, 2026-09-20).
 * A note + assignment is for exactly one case: the bot understood a FundedElite question, it is
 * outside what the bot can answer from its approved knowledge, and a teammate has to look at
 * the client's account/backend. Everything else the presend gate holds is junk for a teammate:
 * small talk, "Are you there ?", "??", personal questions, off-topic asks. Those get a normal
 * reply (or silence) and NO note, NO assignment, NO "forwarded to a teammate".
 */
// Strong FundedElite vocabulary: any one of these makes a message a FundedElite matter.
const FUNDEDELITE_CORE_RE = /\b(?:fundedelite|funded\s*elite|challenge|evaluation|phase\s*[12]|funded\s+account|account|payout|withdraw\w*|profit\s+(?:target|split)|drawdown|daily\s+loss|max(?:imum)?\s+loss|consistency|breach\w*|reset|free\s+retry|second\s+chance|refund|kyc|verif\w*|login|log\s*in|password|credentials?|mt5|metatrader|tradelocker|dashboard|upgrade|leverage|scalp\w*|news\s+trading|weekend\s+(?:trading|hold)|copy\s+trad\w*|expert\s+advisor|hedg\w*|martingal\w*|grid\s+trading|arbitrage|tick\s+scalp\w*|lot\s+size|holding\s+time|instant\s+(?:elite|funding)|lite|flash\s+activation|catalyst|promo\w*|discount|coupon|affiliate|prohibit(?:ed|ion)?\s+strateg\w*|trading\s+practice\w*|restricted\s+practice\w*)\b/i;
// Subjects that are plainly outside FundedElite. Checked BEFORE the weak words below, because
// "bitcoin price" contains "price" and must not be mistaken for a question about our pricing.
const EXTERNAL_TOPIC_RE = /\b(?:bitcoin|btc|ethereum|eth|dogecoin|crypto\s+(?:price|market)|stocks?|nasdaq|s&p|gold\s+price|oil|weather|football|cricket|soccer|movie|film|recipe|politic\w*|election|president|religion|joke|poem|song|capital\s+of|who\s+is\s+(?:the\s+)?(?:president|prime)|ftmo|fundednext|fundingpips|the5ers|topstep|apex|opinion\s+(?:on|about)|your\s+(?:opinion|father|mother|wife|husband|age|religion))\b/i;
// Ambiguous on their own; count as FundedElite only when nothing external is being discussed.
const FUNDEDELITE_WEAK_RE = /\b(?:price|pricing|cost|fee|fees|payment|order|invoice|contract|rise)\b/i;

// FAQ_TRADING_VOCAB_V1: trading-rule questions ARE FundedElite questions. Without these words
// "is stop loss mandatory?", "what is the minimum trade duration?" and "how long do I need to hold a
// trade?" scored off-topic, so a held draft for them fell into the scope-decline / force-escalate
// branch instead of the FAQ answering path (reproduced 2026-09-23 via the burst re-run replay).
const TRADING_RULE_RE = /\b(?:stop[\s-]*loss(?:es)?|stoploss|sl|take[\s-]*profit|tp|partial(?:ly)?\s+(?:close[sd]?|closing|tp|take[\s-]*profit)|hold(?:ing)?\s+(?:time|a\s+trade|trades|positions?|my\s+(?:trade|position))|trade\s+duration|min(?:imum)?\s+(?:hold(?:ing)?|trade\s+(?:time|duration))|scalp\w*|hedg\w*|news\s+trad\w*|expert\s+advisors?|eas?|hft|high[\s-]*frequency|martingale|grid\s+(?:trading|strategy|bot)|copy[\s-]*trad\w*|lot\s+sizes?|leverage|risk\s+rule|strategy\s+risk|profitable\s+(?:days?|trading\s+days?)|trading\s+days?|weekend\s+(?:hold\w*|trad\w*)|slippage|vpn|vps|ip\s+(?:address|sharing|flag\w*)|prohibit(?:ed|ion)?|restricted(?:\s+\w+){0,3}|strateg(?:y|ies)|trading\s+practice\w*|account\s+sharing|passing\s+service|server\s+spam\w*|account\s+rolling|gambling)\b/i;

function looksFundedEliteRelated(text) {
  let t = String(text || '');
  // "chollange" is still a FundedElite question (owner rule 2026-09-21).
  try { t = require('./statePresend/typoNormalizer').normalizeText(t); } catch (_) {}
  try { if (regenModule().isContentlessMessage(t)) return false; } catch (_) { /* fall through */ }
  if (/\bwhat\s+are\s+the\s+rules\b/i.test(t)) return true;
  if (/\brules?\b/i.test(t) && /\b(?:challenge|account|payout|trading|funded|lite|eval)\b/i.test(t)) return true;
  if (FUNDEDELITE_CORE_RE.test(t)) return true;
  if (TRADING_RULE_RE.test(t) && !EXTERNAL_TOPIC_RE.test(t)) return true; // FAQ_TRADING_VOCAB_V1
  // External subject BEFORE the generic topic lexicon: extractTopics() maps "price" to a pricing
  // topic, which made "what is the bitcoin price today?" look like a FundedElite question.
  if (EXTERNAL_TOPIC_RE.test(t)) return false;
  try { if ((require('./statePresend/textUtils').extractTopics(t) || []).length > 0) return true; } catch (_) { /* ignore */ }
  // CARRIED_QUESTION_COVERAGE_V1: a timing question with a support object, or a request to
  // escalate processing, is FundedElite work. A bare "how long does this take?" stays unclear.
  try {
    const __mac = require('./statePresend/multiAskCompleteness');
    if (__mac.isRecognizedSupportTimingAsk(t) || __mac.isProcessEscalationRequest(t)) return true;
  } catch (_) { /* ignore */ }
  return FUNDEDELITE_WEAK_RE.test(t);
}

/**
 * For a comparison question ("difference between Instant and the 2-Step challenge"), the
 * per-product queries needed to gather complete evidence. Returns [] when the message is not
 * comparing two different products, so ordinary questions keep their single retrieval.
 */
const COMPARE_ASK_RE = /\b(?:differen(?:ce|ces|t)|differ|compare|comparison|versus|\bvs\b|between)\b/i;
const COMPARABLE_PRODUCTS = [
  ['instant elite', /\binstant\s+elite\b/i],
  ['instant challenge', /\binstant\b/i],
  ['2-step challenge', /\b(?:2[\s-]*step|two[\s-]*step)\b/i],
  ['1-step challenge', /\b(?:1[\s-]*step|one[\s-]*step)\b/i],
  ['lite challenge', /\blite\b/i],
  ['flash activation challenge', /\bflash\b/i],
  ['catalyst challenge', /\bcatalyst\b/i],
  ['free retry second chance', /\b(?:free\s*retry|second\s+chance)\b/i],
];

function comparedProductQueries(text) {
  const t = String(text || '');
  if (!COMPARE_ASK_RE.test(t)) return [];
  const found = [];
  for (const [query, re] of COMPARABLE_PRODUCTS) {
    if (!re.test(t)) continue;
    // "Instant Elite" already covers "Instant"; do not add the weaker match twice. (Substring
    // matching never caught this pair - "instant elite" vs "instant challenge" - so the Instant
    // article was retrieved three times in one comparison block.)
    if (found.some((q) => q.indexOf(query) !== -1 || query.indexOf(q) !== -1 ||
      (/^instant\b/.test(q) && /^instant\b/.test(query)))) continue;
    found.push(query);
  }
  return found.length > 1 ? found : [];
}

/**
 * The approved evidence for a client message: typo-normalized query, the blended retrieval, and
 * for a comparison also each named product on its own.
 *
 * Both the model and the pre-send/post-send auditors must read the SAME evidence. Every time
 * they diverged, a correct approved figure was reported unsupported and the customer got a
 * clarification or silence instead of the answer (tool-retrieved articles, raw-vs-normalized
 * query, and blended-vs-per-product comparison were three separate instances of it).
 */
async function retrieveApprovedEvidence(faqKbRef, rawText, opts) {
  if (!faqKbRef || typeof faqKbRef.retrieveOfficialFaqContext !== 'function') return null;
  let query = String(rawText || '');
  try { query = require('./statePresend/typoNormalizer').normalizeText(query); } catch (_) {}
  const hit = await faqKbRef.retrieveOfficialFaqContext(query, Object.assign({}, opts || {}, {
    priorClientTexts: (opts && opts.priorClientTexts) || [],
  }));
  if (!hit || !hit.block) return hit || null;
  // FOLLOWUP_EVIDENCE_MERGE_V1 (2026-09-25, live 215476101110604): a follow-up keeps its conversation's
  // subject. (a) When a product is inherited from earlier turns, the product-prefixed query can push the
  // TOPIC article out (Strategy Risk Limits vanished from "so i can risk as much as my margin allows?"),
  // so the plain query's articles are merged in. (b) When the client is answering Luna's clarifying
  // question ("i am on phase 2 on 100k lite 2 step" after "which challenge and stage?"), the question
  // being answered is retrieved too. Merged blocks are the same local canonical articles.
  try {
    const __extraQueries = [];
    const __priors = (opts && opts.priorClientTexts) || [];
    if (typeof faqKbRef.inheritProductForRetrieval === 'function' && __priors.length &&
        faqKbRef.inheritProductForRetrieval(query, __priors)) __extraQueries.push({ q: query, o: Object.assign({}, opts || {}, { priorClientTexts: [] }) });
    if (opts && opts.answeredQuestion) __extraQueries.push({ q: String(opts.answeredQuestion) + ' ' + query, o: Object.assign({}, opts || {}, { priorClientTexts: [] }) });
    for (const x of __extraQueries) {
      const eh = await faqKbRef.retrieveOfficialFaqContext(x.q, x.o);
      if (!eh || !eh.block) continue;
      const have = new Set([...hit.block.matchAll(/TITLE:\s*(.+)/g)].map((m) => m[1].trim()));
      const blocks = eh.block.split(/\n(?=---\nTITLE:)/).filter((b) => {
        const t = (b.match(/TITLE:\s*(.+)/) || [])[1];
        return t && !have.has(t.trim());
      });
      if (blocks.length) { hit.block += '\n' + blocks.join('\n'); hit.followupMerged = (hit.followupMerged || 0) + blocks.length; }
    }
  } catch (_) { /* keep what we already have */ }
  // A definition needs the article that says what the product is NOT: the per-product article
  // lists targets and limits, while the contrastive statements ("LITE Challenge (NO SECOND
  // CHANCE) ... does not include a second chance") live in the challenge-types overview. Without
  // it the model cannot state the defining characteristic at all, however it is prompted.
  if (opts && opts.definitionOf) {
    try {
      const oh = await faqKbRef.retrieveOfficialFaqContext(opts.definitionOf + ' second chance included', opts);
      if (oh && oh.block && !hit.block.includes(oh.block)) {
        hit.block += '\n' + oh.block;
        hit.definitionContext = true;
      }
    } catch (_) { /* keep what we already have */ }
  }
  const named = comparedProductQueries(query);
  if (named.length > 1) {
    // PRODUCT_BUNDLE_V1: a comparison needs each named product's COMPLETE published rule set,
    // not whichever of its articles a keyword query ranked highest (the Catalyst overview with
    // its 80% starting split was never retrieved, so the auditor could not see what the answer
    // relied on). Bundles are used for the product ids the client actually named; the per-product
    // keyword query remains only for a named product that has no bundle (e.g. a bare "2-Step").
    const bundled = [];
    let extra = '';
    if (typeof faqKbRef.productBundle === 'function' && typeof faqKbRef.detectQueryProducts === 'function') {
      for (const pid of faqKbRef.detectQueryProducts(query)) {
        try {
          const b = faqKbRef.productBundle(pid);
          if (b && b.block) { extra += '\n\n' + b.block; bundled.push(pid); }
        } catch (_) { /* keep what we already have */ }
      }
    }
    for (const pq of named) {
      const pids = typeof faqKbRef.detectQueryProducts === 'function' ? faqKbRef.detectQueryProducts(pq) : [];
      if (pids.length && pids.every((x) => bundled.indexOf(x) !== -1)) continue;
      try {
        const ph = await faqKbRef.retrieveOfficialFaqContext(pq, opts);
        if (ph && ph.block && !hit.block.includes(ph.block)) extra += '\n' + ph.block;
      } catch (_) { /* keep whatever we already have */ }
    }
    if (extra.trim()) { hit.block += '\n' + extra.trim(); hit.perProduct = named; }
    if (bundled.length) hit.productBundles = bundled;
  }
  return hit;
}

/**
 * Answer plan (requirement 3): what is being asked, about which product(s), and what the reply
 * therefore owes the client. Computed deterministically from the message - no extra model call -
 * and appended to the user message as internal guidance. It carries no product facts of its own;
 * the facts still come only from the approved FAQ context.
 */
const INTENT_RULES = [
  ['comparison', /\b(?:differen(?:ce|ces|t)|differ|compare|comparison|versus|\bvs\b|better|which\s+(?:one|is)\b)/i],
  ['permission', /\b(?:can\s+i|am\s+i\s+allowed|is\s+it\s+allowed|may\s+i|could\s+i|allowed\s+to)\b/i],
  ['rule', /\b(?:rule|rules|limit|limits|drawdown|consistency|leverage|profit\s*split|profit\s+target|holding\s+time|daily\s+loss|max(?:imum)?\s+loss)\b/i],
  ['definition', /\b(?:what\s+(?:is|are)|what's|explain|tell\s+me\s+about|how\s+does|describe)\b/i],
];

function planIntent(t) {
  for (const [name, re] of INTENT_RULES) if (re.test(t)) return name;
  return 'question';
}

// REPLY_DESIGN_V1 (2026-09-28, Arsal): this per-turn plan used to carry its OWN formatting rules ("short [[Heading]]
// for each distinct concept", "Use • bullets only for genuinely list-like rules", "Bold only key numbers, limits and
// rule names", "Paragraphs of 1-3 sentences"). They contradicted the prompt's section rules (2+ facts = one labelled
// bullet each, bold = label + one value, headings for major topics only) and, sitting in the user message right next
// to the evidence, they won: heading-per-fact replies, paragraphs under headings, every number bolded. The plan now
// only names the DEPTH the question needs and defers every shape rule to the prompt's single REPLY DESIGN SYSTEM.
const LIST_ASK_RE = /\b(?:what|which)\b[^?.!\n]{0,40}\b(?:options?|choices|sizes|cycles|percentages|levels|splits)\b|\blist\s+(?:all|them|every|the\s+(?:options|sizes))\b|\ball\s+(?:the\s+)?(?:available\s+)?(?:account\s+)?(?:sizes|options|choices)\b|\bwhat\s+can\s+i\s+(?:select|choose|pick)\b|\bhow\s+many\s+(?:account\s+)?sizes\b/i;
const OVERVIEW_ASK_RE = /\b(?:overview|tell\s+me\s+(?:about|more\s+about)|how\s+does\b[^?.!\n]{0,60}\bwork|how\s+do(?:es)?\b[^?.!\n]{0,40}\bchallenge\b|what\s+are\s+the\s+(?:main\s+|key\s+)?(?:rules|conditions|details|requirements)|rules\s+(?:of|for)\b|explain\b[^?.!\n]{0,50}\b(?:challenge|rules|account|program)|what\s+is\s+the\b[^?.!\n]{0,40}\bchallenge\b|details?\s+(?:of|about|on)\b|walk\s+me\s+through)/i;
const TOPIC_ASK_RE = /\b(?:payouts?|withdraw\w*|drawdowns?|daily\s+loss|max(?:imum)?\s+loss|loss\s+limits?|profit\s+split|split|profit\s+target|target|add[\s-]?ons?|leverage|consistency|scalping|weekend|news|holding\s+time|hedging|copy\s+trading|ea|eas|expert\s+advisors?|second\s+chance|kyc)\b/i;
function replyDepthOf(intent, raw, products) {
  const t = String(raw || '');
  if (
    septemberPromos &&
    typeof septemberPromos.promoAskKind === 'function' &&
    isPromotionQuestion(t) &&
    !(typeof septemberPromos.isPlanDifferenceOrFeaturesAsk === 'function' && septemberPromos.isPlanDifferenceOrFeaturesAsk(t))
  ) {
    const kind = septemberPromos.promoAskKind(t);
    if (kind === 'overview') return 'promo-overview';
    if (kind === 'sizes') return 'promo-sizes';
    if (kind === 'eligibility') return 'promo-eligibility';
    if (kind === 'compare') return 'promo-compare';
    return 'promo-one';
  }
  if (intent === 'comparison' || /\b(?:differen\w*|compare|comparison|versus|vs)\b/i.test(t)) return 'comparison';
  if (LIST_ASK_RE.test(t)) return 'list';
  const qs = (t.match(/\?/g) || []).length;
  if (qs >= 2 && /\b(?:also|and\s+(?:can|is|are|what|how|do))\b/i.test(t) && !(products || []).length) return 'multi';
  if (/\bhow\s+(?:do|can|should)\s+i\b|\bsteps?\s+(?:to|for)\b|\bstep[\s-]by[\s-]step\b|\bwhat\s+are\s+the\s+steps\b/i.test(t) && !/\bhow\s+(?:do|can)\s+i\s+(?:pass|get\s+funded)\b/i.test(t)) return 'steps';
  if (t.length <= 70 && qs <= 1 && !OVERVIEW_ASK_RE.test(t)) return (intent === 'rule' || (products || []).length) ? 'specific' : 'simple';
  if (TOPIC_ASK_RE.test(t) && !/\b(?:overview|tell\s+me\s+(?:about|more\s+about)|(?:main|key|all\s+the)\s+rules|what\s+are\s+the\s+rules|rules\s+(?:of|for)\b)/i.test(t)) return 'topic';
  if (OVERVIEW_ASK_RE.test(t) && (products || []).length) return 'overview';
  if (qs >= 2) return 'multi';
  if (t.length <= 80 && intent !== 'rule') return 'simple';
  return 'specific';
}
function structurePlanLine(intent, raw, products) {
  const depth = replyDepthOf(intent, raw, products);
  const tail = ' Shape, bullets and bold follow the REPLY DESIGN SYSTEM in the system prompt.';
  if (depth === 'promo-overview') {
    return '- Depth: promo overview. Summary not catalogue. [[Current Promotions]] then one labelled bullet per ACTIVE code (• **CODE:** main benefit + one important condition). Do NOT dump every eligible size/product/tier. Do NOT list $50k/$100k/$200k/$300k/$400k. Summarize Instant Elite as selected sizes having higher discounts. Bold only code, main discount/value, one critical condition. Then ask which challenge they are looking to purchase.' + tail;
  }
  if (depth === 'promo-sizes') {
    return '- Depth: promo sizes. List the documented size/% pairs for the asked promo. Do not expand into a full product catalogue.' + tail;
  }
  if (depth === 'promo-eligibility') {
    return '- Depth: promo eligibility. Who can use the named code (NEW50 = brand-new never-purchased clients; does not expire). Do not dump sizes or every product.' + tail;
  }
  if (depth === 'promo-compare') {
    return '- Depth: promo comparison. One labelled bullet per code (benefit + one condition). No size/product catalogue.' + tail;
  }
  if (depth === 'promo-one') {
    return '- Depth: one promo. One labelled bullet — code, main benefit, one important condition. No nested headings, no mega-paragraphs mixing eligibility/tiers/add-ons/activation/checkout.' + tail;
  }
  if (depth === 'comparison') {
    return '- Depth: comparison. [[Main Differences]] first, one labelled bullet per product or differing rule (label = the official product name, no product sub-headings). Lead with the MAIN difference(s) only — concise and natural. Do NOT dump every account size or every selectable option unless the client asked for sizes/exact options; if sizes are the same, say both are available in the same account-size range. Instant Standard consistency (when relevant): 25% Consistency Rule — most profitable day must not exceed 25% of total profit; Instant Elite: no Consistency Rule. Then [[Same on Both]] with only a short set of confirmed shared rules as labelled bullets (summarize long option lists). Never turn a simple main-difference ask into a full configuration catalogue. Do not infer shared rules from silence in one article. Facts only from the approved FAQ.' + tail;
  }
  if (depth === 'list') {
    return '- Depth: full list requested. Give the complete set of options exactly as the approved FAQ lists them, as the direct answer, plus any closely tied qualifier (e.g. selectable at checkout, first payout at 70%). No unrelated rules.' + tail;
  }
  if (depth === 'overview') {
    return '- Depth: product overview. One framing sentence, then the key rules grouped under major-topic headings, one labelled bullet per fact. For each selectable setting lead with the documented default where the FAQ has one (e.g. standard days between payouts), otherwise a brief range marked selectable. No full option lists, no invented default.' + tail;
  }
  if (depth === 'topic') {
    return '- Depth: one topic. Direct answer first, then that topic\'s facts as labelled bullets when there are two or more (one idea per bullet), a major heading only if the answer splits into two or more sections. For a selectable setting lead with the documented default where the FAQ has one, otherwise a brief range marked selectable; the full option list only if asked.' + tail;
  }
  if (depth === 'steps') {
    return '- Depth: how-to. Numbered steps, one per line, with a short heading only if the answer has more than one concept.' + tail;
  }
  if (depth === 'multi') {
    return '- Depth: several questions. Answer every one, each directly. A topic with several facts gets its own major heading and labelled bullets; a one-fact topic is one labelled bullet or one short sentence.' + tail;
  }
  if (depth === 'simple') {
    return '- Depth: simple. If this is a one-line answer (greeting, thanks, yes/no, which platforms), reply in one to three short sentences with no heading and no bullets.' + tail;
  }
  return '- Depth: specific question. Direct answer in the first sentence, then only the closely tied detail. No heading on a short answer; labelled bullets only if there are two or more distinct facts.' + tail;
}

function buildAnswerPlan(rawText, opts) {
  let t = String(rawText || '');
  try { t = require('./statePresend/typoNormalizer').normalizeText(t); } catch (_) {}
  if (!t.trim()) return '';
  if (isClearlyAccountSpecificIssue(t) || presendNeedsBackendLook(t)) return '';
  const intent = planIntent(t);
  const products = [];
  for (const [label, re] of COMPARABLE_PRODUCTS) {
    if (!re.test(t)) continue;
    if (products.some((p) => p.indexOf(label) !== -1 || label.indexOf(p) !== -1)) continue;
    products.push(label);
  }
  const lines = ['\n\nANSWER PLAN (internal, not client-facing; use ONLY the approved FAQ context above for facts):'];
  lines.push('- Intent: ' + intent + '.');
  lines.push('- Product(s) named: ' + (products.length ? products.join(', ') : 'none'));
  if (intent === 'comparison' && products.length > 1) {
    lines.push('- Cover every materially different field from the current product articles, scoped to each product and stage. Start with differences. State shared rules only when both articles support them.');
  } else if (products.length) {
    lines.push('- Answer for the product named. Ask which variant ONLY if the answer would genuinely differ between that product\'s variants; otherwise answer directly.');
    if (intent === 'definition' && opts && opts.evidence) {
      const defining = definingAttributes(opts.evidence, products);
      if (defining.length) {
        lines.push('- What makes this product itself, from the approved FAQ. State these in your own words BEFORE targets, limits, sizes or prices:');
        for (const d of defining) lines.push('    * ' + d);
      }
    }
  } else {
    lines.push('- No product was named. If the answer is the same across products, answer directly. If it genuinely differs per product, ask ONE short question naming the options.');
    const ev = String((opts && opts.evidence) || '');
    // Strategy Risk Limits documents risk calc when no Stop Loss is set → SL not company-wide mandatory.
    if (/\bstop\s*loss\b|\bstoploss\b|\bsl\b/i.test(t) &&
        /strategy risk limits/i.test(ev) &&
        /if\s+(?:no\s+)?stop\s+loss|no\s+stop\s+loss\s+is\s+set/i.test(ev)) {
      lines.push('- Approved FAQ (Strategy Risk Limits) explains how risk is calculated when no Stop Loss is set. That means Stop Loss is not mandatory company-wide; answer directly from that article. Do not ask which challenge or product unless the client named one with a genuine exception.');
    }
    // MULTI_ACTIVATE_SAME_TIME_V1 (215476173670032): drafts were answering only fee/KYC/agreement
    // prerequisites and skipping "all / at the same time".
    if (/\bactivat/i.test(t) && /\b(?:same\s+time|simultaneously|at\s+once|all\s+(?:the\s+)?accounts?|multiple\s+accounts?)\b/i.test(t)) {
      lines.push('- The client asked whether multiple/all passed accounts can be activated at the same time. Answer that simultaneous/all-at-once part explicitly from the approved FAQ (or say naturally that you cannot confirm a fixed rule if unpublished). Per-account activation fee / KYC / trader agreement are supporting detail only — do not answer those prerequisites alone.');
    }
  }
  lines.push('- Answer the direct question first, then any other answerable part. No unrelated rules, no filler.');
  lines.push(structurePlanLine(intent, t, products));
  // ADAPTIVE_COMPLETENESS_V1 (keep model verbosity MEDIUM; completeness is coverage, not length).
  // REPLY_DESIGN_V1: completeness is coverage of what was ASKED at the depth above, not a dump of every number.
  lines.push('- Completeness: for a simple factual ask, answer in 1-3 short sentences. For a rule/policy ask, include every materially relevant condition, exception, limit, stage/product distinction, and consequence that the OFFICIAL FAQ CONTEXT supports for that ask (an overview gives key rules and defaults, not every selectable option). For a broad list ask (e.g. prohibited strategies/practices), give a reasonably complete categorized list from the approved context; put closely related but separate rules (holding time, weekend addon, IP sharing, strategy risk limits) in their own short lines — do not mislabel them as the same category. For "only these? / what else? / is that all?", expand the prior answer with remaining supported items — do not decline as off-topic. Never invent restrictions. Concise where possible, complete where necessary.');
  return lines.join('\n');
}

/**
 * Defining characteristics of a product, read out of the approved evidence.
 *
 * A definition answer that opens with targets, limits and sizes but never states what makes the
 * product that product is incomplete ("what is the Lite challenge?" answered without saying it
 * has no second chance). The FAQ marks these characteristics with contrastive language - "NO
 * SECOND CHANCE", "does not include", "composed only of", "cannot be removed", "starts
 * directly" - so they are extracted rather than hardcoded, and work for any product whose
 * article uses that language.
 *
 * Returns approved sentences, never invented text, and never more than a few.
 */
// Ranked strongest-first: a statement about what the product is NOT, or what it uniquely is,
// defines it far better than one of its numeric limits. Limits are deliberately absent here -
// they are the secondary content this ranking exists to push below the defining facts.
const DEFINING_MARKER_TIERS = [
  /\b(?:no\s+second\s+chance|does\s+not\s+include|do\s+not\s+include|not\s+included|does\s+not\s+come\s+with|without\s+(?:a|the|any)\s|unlike\b)/i,
  /\b(?:composed\s+only\s+of|only\s+of\s+a|starts\s+directly|no\s+evaluation|cannot\s+be\s+removed|can\s+not\s+be\s+removed|is\s+not\s+removable|usable\s+once|only\s+for\s+new)/i,
  // Positive defining statements ("includes a unique second chance feature").
  /\b(?:includes?\s+(?:a\s+)?(?:unique|free|second)|comes\s+with\s+(?:a\s+)?(?:free|second)|features?\s+(?:a\s+)?(?:unique|second))/i,
  /\b(?:instead\s+of\b|ideal\s+for|suitable\s+for|designed\s+for)/i,
];

function definingAttributes(evidenceText, productLabels) {
  const text = String(evidenceText || '');
  if (!text.trim() || !productLabels || !productLabels.length) return [];
  const labelRes = productLabels
    .map((l) => COMPARABLE_PRODUCTS.find((p) => p[0] === l))
    .filter(Boolean)
    .map((p) => p[1]);
  if (!labelRes.length) return [];
  const ranked = [];
  const seen = new Set();
  for (const rawSentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    const sentence = rawSentence.replace(/\s+/g, ' ').trim();
    if (sentence.length < 20 || sentence.length > 260) continue;
    const tier = DEFINING_MARKER_TIERS.findIndex((re) => re.test(sentence));
    if (tier < 0) continue;
    if (!labelRes.some((re) => re.test(sentence))) continue;
    const key = sentence.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    ranked.push({ tier, sentence });
  }
  ranked.sort((a, b) => a.tier - b.tier);
  const out = ranked.slice(0, 3).map((r) => r.sentence);
  return out;
}

function regenModule() { return __statePresend.modules.regen; }

/** Latest unanswered client message that actually says something; falls back to the last message. */
function bestProblemText(parts, latestText) {
  const list = Array.isArray(parts) ? parts : [];
  let lastPublicReply = -1;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    if (!p || String(p.part_type || '') === 'note') continue;
    const a = p.author || {};
    if ((a.type === 'admin' || a.type === 'bot') && stripHtml(p.body || '')) { lastPublicReply = i; break; }
  }
  for (let i = list.length - 1; i > lastPublicReply; i -= 1) {
    const p = list[i];
    const a = (p && p.author) || {};
    if (a.type !== 'user' && a.type !== 'lead') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    if (isGreetingOrSmallTalk(body)) continue;
    try { if (regenModule().isContentlessMessage(body)) continue; } catch (_) {}
    return body;
  }
  return String(latestText || '');
}

/* PENDING_ASK_RESOLVE_V1 (2026-09-23, live 215476072310759)
 * A nudge ("Tell me arsal", "answer my question", "??") or a bare reference ("what about that one")
 * carries no question of its own. Decisions that ask "is this answerable from approved knowledge?"
 * must judge the question the client is pointing at, not the nudge. Live: an escalated payout case
 * was pending, the client asked a general product question, then sent "Tell me arsal";
 * faqHoldMustNotEscalate() judged "Tell me arsal" (not answerable) and force-escalated a general
 * question, ESCALATION_DEDUPE_V1 blocked the duplicate note, and the client got the generic
 * "our team is reviewing this" status instead of an answer. */
/**
 * Client is only calling for the escalation person / teammate by name (e.g. "Jerry!!!!!!").
 * When a case is already escalated, this must not start a clarification loop.
 * Outside that context it is NOT a human-request / escalate trigger by itself.
 */
function isEscalationPersonCall(text) {
  const s = String(text || '').trim();
  if (!s || s.length > 48) return false;
  // Bare teammate/escalation-seat name, optional punctuation / bangs. No other ask.
  return /^(?:@?\s*)?(?:jerry(?:\s*-?\s*manager)?|anjsha|arsal|robor|august|saqii|brian|elite\s*ai|risk\s*team)(?:\s*[!?.…]+|\s*)*$/i.test(s);
}

function isNudgeOrReference(t) {
  const s = String(t || '').trim();
  if (!s) return true;
  if (isGreetingOrSmallTalk(s)) return true;
  if (isEscalationPersonCall(s)) return true;
  try { if (regenModule().isContentlessMessage(s)) return true; } catch (_) {}
  try { if (require('./statePresend/textUtils').isReferentialFollowUp(s)) return true; } catch (_) {}
  try { if (contextualFollowUp.isContextualFollowUp(s)) return true; } catch (_) {}
  return false;
}

/** The question the latest client message points at (the message itself when it is a real ask). */
function resolvePendingAsk(parts, latestText) {
  const t = String(latestText || '').trim();
  // CONTEXTUAL_FOLLOWUP_V1: completeness / deictic follow-ups resolve to the prior substantive
  // FundedElite ask (e.g. Instant vs Instant Elite) before the short walk-back below.
  try {
    if (contextualFollowUp.isContextualFollowUp(t)) {
      const r = contextualFollowUp.resolveContextualFollowUp({ parts, latestText: t });
      // Attribute follow-ups need both the named product from the prior turn and
      // the new attribute question. Returning only the prior ask loses "customisable?".
      if (r && r.reason === 'attribute-followup' && r.resolvedText) return String(r.resolvedText).trim();
      if (r && r.isFollowUp && r.priorAsk) return String(r.priorAsk).trim();
      if (r && r.isFollowUp && r.resolvedText) return String(r.resolvedText).trim();
    }
  } catch (_) {}
  if (!isNudgeOrReference(t)) return t;
  // A nudge that itself carries account work ("check 637338 please") keeps its own text.
  if (presendNeedsBackendLook(t) || isClearlyAccountSpecificIssue(t)) return t;
  const list = Array.isArray(parts) ? parts : [];
  let skippedLatest = false;
  for (let i = list.length - 1, seen = 0; i >= 0 && seen < 20; i -= 1, seen += 1) {
    const p = list[i];
    const a = (p && p.author) || {};
    if (!p || String(p.part_type || '') === 'note') continue;
    if (a.type !== 'user' && a.type !== 'lead') continue;
    const body = stripHtml(p.body || '').trim();
    if (!body) continue;
    if (!skippedLatest && body === t) { skippedLatest = true; continue; }
    if (isNudgeOrReference(body)) continue;
    return body;
  }
  return t;
}

/** Client messages after the last public bot/teammate reply (newest last). */
function unansweredClientTexts(parts) {
  const list = Array.isArray(parts) ? parts : [];
  const out = [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    if (!p || String(p.part_type || '') === 'note') continue;
    const a = p.author || {};
    const body = stripHtml(p.body || '').trim();
    if ((a.type === 'admin' || a.type === 'bot') && body) break;
    if ((a.type === 'user' || a.type === 'lead') && body) out.unshift(body);
  }
  return out;
}

function lastPublicTeamText(parts) {
  const list = Array.isArray(parts) ? parts : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    if (!p || String(p.part_type || '') === 'note') continue;
    const a = p.author || {};
    const body = stripHtml(p.body || '').trim();
    if ((a.type === 'admin' || a.type === 'bot') && body) return body;
  }
  return '';
}

/* GENERAL_ACCOUNT_ASK_GUARD_V1: is this REPLY draft asking for account/email on a general question?
 * See generalAccountAskGuard.js. Returns the guard's assessment plus the texts it judged. */
function assessGeneralAccountAsk(parts, latestText, draft, intent) {
  if (intent && replyDecision.requiresIdentity(intent)) {
    return { pending: intent.accountAsks, violation: false, reason: 'resolved-account-work' };
  }
  let pending = unansweredClientTexts(parts).filter((t) => !isNudgeOrReference(t));
  if (!pending.length) pending = [resolvePendingAsk(parts, latestText)];
  // Live 215476078700441 (2026-09-24): "They have closed my accounts." was answered, then "2step lite" was
  // pending; judging only the unanswered burst suppressed a legitimate account-number ask twice. The last
  // client messages of the thread count too.
  const recent = [];
  for (let i = (parts || []).length - 1; i >= 0 && recent.length < 6; i -= 1) {
    const p = parts[i]; const a = (p && p.author) || {};
    if (!p || String(p.part_type || '') === 'note' || (a.type !== 'user' && a.type !== 'lead')) continue;
    const b = stripHtml(p.body || '').trim(); if (b) recent.push(b);
  }
  const resolvedGeneral = intent && intent.kind === 'general-faq';
  const r = generalAccountAskGuard.assessDraft({
    draft,
    recentClientTexts: recent,
    pendingClientTexts: resolvedGeneral ? [intent.knowledgeQuery] : pending,
    lastBotText: lastPublicTeamText(parts),
    isGeneralAsk: (t) => isKnowledgeAnswerableAsk(t),
    isAccountWork: (t) =>
      isClearlyAccountSpecificIssue(t) || presendNeedsBackendLook(t) || accountCheckRequest.isExplicitAccountCheckRequest(t),
  });
  return Object.assign({ pending: resolvedGeneral ? [intent.knowledgeQuery] : pending }, r);
}

/** Strip an identity ask from a general-question reply; '' when nothing answer-like remains. */
function applyGeneralAccountAskGuardSync(conversationId, parts, latestText, body, where) {
  let a;
  try { a = assessGeneralAccountAsk(parts, latestText, body); } catch (_) { return body; }
  if (!a.violation) return body;
  const stripped = generalAccountAskGuard.stripIdentityAsks(body);
  if (generalAccountAskGuard.isSubstantiveAnswer(stripped)) {
    console.log('GENERAL_ACCOUNT_ASK stripped', where || '', conversationId);
    return stripped;
  }
  console.log('GENERAL_ACCOUNT_ASK suppressed', where || '', conversationId, '(nothing but an identity ask on a general question)');
  return '';
}

/* MIXED_AWAITING_ANSWER_V1 (2026-09-23): one message that asks a general question AND follows up on
 * the case already escalated ("what is the payout split on Instant, and why hasn't my payout been
 * approved?") used to get only the generic status line, dropping the answerable part. Split it into
 * asks; when some are general (knowledge-answerable, not account work, not status pings) and the rest
 * belong to the escalated case, answer ONLY the general asks through the tested teammate-scope path
 * (no escalation, no identity ask, one optional "still with the team" sentence). If that answer cannot
 * be sent safely, the old status line is posted instead (statusFallback), never silence. */
function buildMixedAwaitingRoute(text, latestUser, escState) {
  const t = String(text || '').trim();
  if (!t) return null;
  let asks = [];
  try { asks = require('./statePresend/multiAskCompleteness').extractAsks([{ role: 'client', text: t }]).burst.map((a) => String(a.text || '').trim()).filter(Boolean); } catch (_) { return null; }
  if (!asks.length) return null;
  // FINAL5: "is stop loss mandatory, and any update on my payout?" is ONE extracted question (the second
  // clause has no question word), so the general part was never separated and only the status line went
  // out. Split clauses joined by ", and / , also / ; " inside an ask as well.
  asks = [].concat(...asks.map((a) => a.split(/,\s*(?:and|also|plus)\s+|\s+and\s+also\s+|;\s*/i).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 2)));
  let rest = t;
  for (const a of asks) { const core = a.replace(/[?,.\s]+$/g, ''); if (core && rest.includes(core)) rest = rest.replace(core, ' '); }
  rest = rest.replace(/[?,.!]+/g, ' ').replace(/\b(?:and|also|plus|then|but)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const items = asks.slice();
  if (rest.split(' ').filter((w) => w.length > 2).length >= 3) items.push(rest);
  if (items.length < 2) return null;
  const general = [];
  const held = [];
  for (const a of items) {
    // A "how long does payout processing usually take" clause matches the status-ping cues but refers to no
    // one's case (no my/me/I/it/this/that): it is a general process question (FINAL5, T5 shape).
    const genericStatusShaped = escalateRelatedOnly.isStatusPing(a) && !/\b(?:my|me|mine|i|our|it|this|that)\b/i.test(a);
    const g =
      isKnowledgeAnswerableAsk(a) && !presendNeedsBackendLook(a) &&
      (!escalateRelatedOnly.isStatusPing(a) || genericStatusShaped) && !escalateRelatedOnly.isRelatedFollowUpCue(a);
    (g ? general : held).push({ ask: a, cls: g ? 'GENERAL_ANSWERABLE' : 'BACKEND_REQUIRED' });
  }
  if (!general.length || !held.length) return null;
  // Every held part must be about the case already with the team; a NEW account request in the same
  // message is not "still with the team" and must take the normal escalation path.
  const st = escState || {};
  if (!held.every((h) => escalateRelatedOnly.isStatusPing(h.ask) || escalateRelatedOnly.isRelatedFollowUpCue(h.ask) ||
      escalateRelatedOnly.isRelatedToEscalatedProblem(h.ask, st))) return null;
  const topic = String((escState && (escState.lastEscalateProblem || escState.lastEscalateTopic)) || '').replace(/\s+/g, ' ').slice(0, 160);
  return {
    action: 'ANSWER_SUBSET',
    reason: 'awaiting_escalation_mixed',
    generalAsks: general,
    heldAsks: held,
    mixed: true,
    humanOwnedTopics: topic ? [topic] : [],
    ownerLabel: 'The support team is already reviewing this client\'s escalated account case',
    answerText: general.map((g) => g.ask).join('\n'),
    pending: [{ id: String((latestUser && latestUser.id) || ''), text: t }],
    statusFallback: true,
    log: { general: general.length, held: held.length },
  };
}

/**
 * A teammate note exists for one reason only: the backend team has to open THIS client's
 * account to answer. A general product or policy question ("What is 2 step challenge ?") is
 * answerable from approved knowledge, so a failed send-gate on it is a bot problem, never a
 * reason to page a teammate. Live chat 215476023193727 escalated exactly that question and
 * posted a note reading "Account: Not provided / Email: Not provided".
 */
/* HYPOTHETICAL_RULE_QUESTION_V1: a rule question phrased in the first person ("does a soft breach
 * affect my payout?", "if I get a soft breach will my account be closed?", "what happens to my payout
 * if I break the risk rule?") is general policy. It stays account work when it reports or asks about
 * something that actually happened to the client: an account number, "why", past tense ("was / got /
 * did / happened / has been"), "still / yet / already", "my breach / my violation", or a dashboard
 * reading ("shows / says"). Narrow on purpose: only the question forms below qualify. */
// HYPOTHETICAL_SENTENCES_V1 (2026-09-25, live 215476101459629): "I always use my home wifi ... But today iam going
// out. ... if iam taking my trade using the mobile data will it be a ip address issue? Will that breach my
// account??" was judged as ONE text, so the plan in the context sentence ("today") disqualified it, it became backend
// work and a general IP rule question was escalated. Each question sentence is judged on its own; the context
// sentences may describe plans or habits but must not report something that already happened or ask us to act.
const HYPO_CONTEXT_REPORT_RE = /\b(?:why|was|were|got|gotten|did|didn'?t|happened|has\s+been|have\s+been|had|received|shows?|showing|says|said|flagged|breached|denied|rejected|closed|suspended|yesterday|ago|earlier|already|last\s+(?:week|night|month|time)|my\s+(?:breach|violation|flag|ticket|case))\b|\b(?:i|we)\s+(?:\w+\s+)?\w+ed\b/i;
// EMBEDDED_RULE_ASK_V1 (2026-09-25, live 215476097191720): "I want to know if changing locations inside of my
// country will be flagged as multi IP" asks what the rule is, in embedded form. "I want to know" is not a request for
// us to act, and a future "will be flagged" is a consequence, not a report of a flag.
const HYPO_EMBEDDED_ASK_RE = /\b(?:want(?:ed)?|like|need)\s+to\s+know\s+(?:if|whether)\b|\bwondering\s+(?:if|whether)\b/i;
/** Strip currency / P&L / decimal money so policy asks with $1,500 do not look like account IDs. */
function textWithoutMoneyAmounts(text) {
  return String(text || '')
    .replace(/(?:USD|EUR|GBP|USDT|\$)\s*[+-]?\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/gi, ' ')
    .replace(/[+-]\s*\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/g, ' ')
    .replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b/g, ' ')
    .replace(/(?<![A-Za-z0-9])\d{1,6}\.\d{2}(?![0-9])/g, ' ');
}

function isHypotheticalRuleQuestion(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (isHypotheticalRuleSentence(t)) return true;
  // Money / P&L figures are not account numbers (ticket 215476153566436: $1,500 / $14,546.29).
  if (/\b\d{4,}\b/.test(textWithoutMoneyAmounts(t))) return false;
  // Mobile clients send one <div> per line; the handler's stripHtml joins them as "fundedelite.But today".
  const sentences = t.split(/(?<=[.?!])(?:\s+|(?=[A-Z]))|\n+/).map((x) => x.trim()).filter(Boolean);
  if (sentences.length < 2) return false;
  const isAsk = (x) => /\?\s*$/.test(x) || HYPO_EMBEDDED_ASK_RE.test(x);
  const questions = sentences.filter(isAsk);
  const context = sentences.filter((x) => !isAsk(x));
  if (!questions.length || !questions.every(isHypotheticalRuleSentence)) return false;
  return !context.some((x) => HYPO_CONTEXT_REPORT_RE.test(x) ||
    /\b(?:can|could|would|will)\s+(?:you|u|someone|the\s+team|your\s+team)\b|\bplease\b|\bplz\b|\bi\s+(?:want|need|would\s+like|wanna)\b(?!\s+to\s+know\b)/i.test(x));
}

function isHypotheticalRuleSentence(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\b\d{4,}\b/.test(textWithoutMoneyAmounts(t))) return false;
  // A request for us to act is never a rule question ("can you reset my account", "please close my trades").
  if (/\b(?:can|could|would|will)\s+(?:you|u|someone|the\s+team|your\s+team)\b|\bplease\b|\bplz\b|\bi\s+(?:want|need|would\s+like|wanna)\b(?!\s+to\s+know\b)/i.test(t)) return false;
  if (/\b(?:why|was|were|got|gotten|did|didn'?t|happened|has\s+been|have\s+been|had|still|yet|already|yesterday|today|tonight|this\s+(?:morning|week)|last\s+(?:week|night|month)|received|shows?|showing|says|said|(?<!\b(?:be|get|being)\s)flagged|my\s+(?:breach|violation|flag|ticket|case))\b/i.test(t)) return false;
  const questionForm =
    /^\s*(?:and\s+|also\s+|so\s+|but\s+)?(?:does|do|will|would|can|could|should|is|are)\b/i.test(t) ||
    /\bwhat\s+happens\b/i.test(t) ||
    HYPO_EMBEDDED_ASK_RE.test(t) ||
    /\bif\s+i(?:\s+am|am)?\s+(?:get|have|receive|hit|break|breach|use|trade|trading|taking|violate|exceed|lose|make|close|open|hold|pay|buy|purchase|request|withdraw|pass|fail|choose|select|add|upgrade|reset|switch|take|start|miss|skip)\b/i.test(t);
  if (!questionForm) return false;
  const ruleEffect = /\b(?:affect|affects|impact|impacts|count|counts|apply|applies|reduce|reduces|reset|resets|change|changes|matter|stop|stops|block|blocks|prevent|prevents|cancel|cancels|lose|forfeit|close|closed|allowed|mean|means|eligible|breach|violate|flagged|treated|considered)\b/i.test(t) ||
    /\bif\s+i(?:\s+am|am)?\b/i.test(t);
  return ruleEffect;
}

function presendNeedsBackendLook(text) {
  const t = require('./statePresend/textUtils').withoutConcludedPastContext(String(text || '')).trim(); /* PAST_CONTEXT_SCOPE_V1 */
  if (!t) return false;
  // PREPURCHASE_ACCOUNT_V1: "my … reset" in a rule question is not a request to open this client's account.
  if (prePurchaseGate.exemptFromAccountIdentity(t)) return false;
  if (isClearlyAccountSpecificIssue(t)) return true;
  if (idGates.payoutRejectionRequiresAccount(t)) return true;
  // "Why do payouts get rejected?" names a problem word and a product, which the
  // actionable-statement test would send to the backend. It is a policy question.
  if (/\b(?:payouts?|withdrawals?)\b/i.test(t) && /\b(?:rejected|rejection|denied|declined|refused)\b/i.test(t)) return false;
  // ACCOUNT_CHECK_REQUEST_V1: "212062 can you please check this account." (live 215476067497045)
  if (accountCheckRequest.isExplicitAccountCheckRequest(t)) return true;
  if (isGeneralPolicyQuestion(t)) return false;
  // HYPOTHETICAL_RULE_QUESTION_V1: "does a soft breach affect my payout?" asks what the RULE is; the
  // "my" does not make it this client's case (real-model R5 2026-09-23: the whole mixed message got
  // the status line). Account numbers / explicit check requests are tested above and still win.
  if (isHypotheticalRuleQuestion(t)) return false;
  // A non-standard or manual arrangement is backend work whoever asks it.
  // "manually" only when asking US to act manually ("can you manually reset/credit/approve ...").
  // A rule question that names a trading action ("manually close trade rule?", live 215476072310759)
  // is general: the bare word made it backend work, which escalated a knowledge question and
  // disarmed GENERAL_ACCOUNT_ASK_GUARD_V1.
  // The arrangement words mark backend work only in a REQUEST ("can you make an exception for me"),
  // not in a rule question ("is there a special rule for gold?", "can EAs trade on my behalf?").
  if (/\b(?:custom|special|exception|on\s+my\s+behalf)\b/i.test(t) &&
      !(/^\s*(?:is|are|do|does)\s+(?:there|you|any|it)\b/i.test(t) || /\brules?\b/i.test(t) ||
        /\b(?:eas?|expert\s+advisors?|bots?|robots?|copy\s*trad\w*)\b[^.?!]{0,30}\bon\s+my\s+behalf\b/i.test(t))) return true;
  if (/\bmanually\s+(?:adjust|change|update|reset|credit|add|approve|process|move|transfer|fix|override|review|extend|refund|reactivate|unlock|restore)\w*\b|\b(?:can|could|would|will|please)\s+(?:you\s+)?(?:\w+\s+){0,3}manually\b/i.test(t)) return true;
  // A reported breakage is account work even without the word "my": "payout button is disabled"
  // is the client telling us something on their side does not work. Same shared test the send
  // gate uses, so the two cannot drift apart.
  try {
    if (require('./statePresend/multiAskCompleteness').isActionableSupportStatement(t)) return true;
  } catch (_) { /* fall through to the ownership test below */ }
  // Otherwise the client has to be talking about their OWN account ("my payout",
  // "account 520119") AND either reporting something wrong with it or asking for something to
  // be done to it. "What is the profit split?" names no account and stays a knowledge question.
  const ownsAccount = /\b(?:my|mine)\b|\baccount\s*#?\s*\d{4,12}\b|\b\d{5,12}\b/i.test(t);
  if (!ownsAccount) return false;
  const problemWord =
    /\b(?:stuck|pending|failed|fail(?:s|ing|ed)?|rejected|denied|disabled|banned|breach(?:ed)?|flagged|missing|wrong|error|not\s+work\w*|not\s+(?:yet\s+)?(?:been\s+)?approved|closed|terminated|suspended|deactivated|can(?:not|'?t)|unable|blocked|locked|delay(?:ed)?|didn'?t|haven'?t|hasn'?t|still\s+(?:not|no)|no\s+(?:response|reply|update)|waiting)\b/i.test(t);
  const actionAsked =
    /\b(?:change|increase|decrease|raise|lower|enable|disable|activate|deactivate|add|remove|upgrade|downgrade|switch|transfer|reset|restore|unlock|re-?open|cancel|refund|approve|review|fix|update|link|unlink)\b/i.test(t);
  return problemWord || actionAsked;
}

/**
 * ONE named rule: is this ask answerable from approved knowledge, so that escalating it would
 * be wrong?
 *
 * Arsal's standing rule is that a teammate note may only be created when the backend team must
 * open THIS client's own account. General product and policy questions the FAQ covers must be
 * answered, never escalated "just in case".
 *
 * This condition already existed, but inline and in one place only — the ESCALATE->REPLY force
 * inside handleWebhook. That made it untestable and meant the FAST route, which has no tools,
 * had no equivalent recovery: when the model decided it lacked evidence, its only exit was a
 * handoff. Measured on the frozen case R130 ("once I pass phase 1 on 2 step, how soon does
 * phase 2 login show up...") the model escalated in 3 of 5 runs on chat.completions and 2 of 5
 * on responses — a pre-existing flake on BOTH transports, not a migration regression.
 *
 * Naming it once means the send-gate force and the FAST->FULL promotion cannot drift apart.
 */
function isKnowledgeAnswerableAsk(text) {
  const t = require('./statePresend/textUtils').withoutConcludedPastContext(String(text || '')).trim(); /* PAST_CONTEXT_SCOPE_V1 */
  if (!t) return false;
  if (isClearlyAccountSpecificIssue(t)) return false;
  if (accountCheckRequest.isExplicitAccountCheckRequest(t)) return false; // ACCOUNT_CHECK_REQUEST_V1

  // Extra fail-closed guards, added 2026-09-22 after this rule was given a name and tested.
  //
  // The composed predicates below missed a real and dangerous case:
  //   "my profit split payment of 1200 never arrived on account 771203"
  // scored isClearlyAccountSpecificIssue=false and presendNeedsBackendLook=false, only
  // looksFundedEliteRelated=true, so the rule called it "answerable from the FAQ". That would
  // let the ESCALATE->REPLY force turn a client reporting missing money into a policy answer.
  // These two guards only ever make the rule MORE conservative — they can suppress a force or
  // a promotion, never an escalation — so they cannot create the opposite failure.

  // A concrete account identifier means the teammate has something specific to open.
  if (/\b(?:account|acct|login|acc)\s*(?:number|no\.?|#|id)?\s*[:#]?\s*\d{4,}\b/i.test(t)) return false;
  // Money / P&L figures ($1,500 / $14,546.29) are not account numbers for knowledge-answerability.
  {
    const noMoney = textWithoutMoneyAmounts(t);
    if (/\b\d{6,}\b/.test(noMoney) && /\b(?:my|mine|our)\b/i.test(t)) return false;
  }

  // SOFT_BREACH_RESET_V1: funded Strategy Risk / Scalping Limit consequence questions are general
  // policy even when the client says "my" and lists termination as one of the options
  // (conv 215476153566436). Do not force escalate for a known owner-rule answer.
  try {
    if (policyFactGuard &&
        (policyFactGuard.isRiskRuleAsk(t) || policyFactGuard.isScalpingLimitAsk(t)) &&
        /\b(?:soft\s*breach|reset|what\s+happens|consequence|terminat|breached|violat)\b/i.test(t) &&
        !/\b(?:account|acct|login|acc)\s*(?:number|no\.?|#|id)?\s*[:#]?\s*\d{4,}\b/i.test(t) &&
        !accountCheckRequest.isExplicitAccountCheckRequest(t)) {
      return true;
    }
  } catch (_) {}

  // First-person ownership plus a "something went wrong with MY thing" complaint.
  const owns = /\b(?:my|mine|our|i)\b/i.test(t);
  // "not (yet) (been) approved" / "denied" added 2026-09-23 (MIXED_AWAITING_ANSWER_V1): "why has my payout
  // not been approved yet?" is the client's own case, not a policy question.
  const wrong = /\b(?:never\s+(?:arrived|received|came|got)|not\s+(?:arrived|received|credited|working)|not\s+(?:yet\s+)?(?:been\s+)?approved|denied|closed|terminated|suspended|deactivated|didn'?t\s+(?:arrive|receive|get|work)|missing|stuck|pending|declined|rejected|failed|disabled|blocked|locked|wrong|hasn'?t\s+(?:arrived|been)|still\s+(?:waiting|not))\b/i.test(t);
  // "If my payout is rejected, can I request again?" is the rule, not a reported rejection.
  if (/\b(?:payouts?|withdrawals?)\b/i.test(t) && /\b(?:rejected|rejection|denied|declined|refused)\b/i.test(t) &&
      !idGates.payoutRejectionRequiresAccount(t)) {
    return looksFundedEliteRelated(t) || isGeneralPolicyQuestion(t);
  }
  if (owns && wrong && !isHypotheticalRuleQuestion(t)) return false; /* HYPOTHETICAL_RULE_QUESTION_V1: "will my account be closed if ...?" is a rule */

  return isGeneralPolicyQuestion(t) || (looksFundedEliteRelated(t) && !presendNeedsBackendLook(t));
}

/**
 * Codes that mean OUR DRAFT was bad, not that a teammate must open this client's account.
 * UNSUPPORTED_PROMISE is deliberately absent: promising something unsupported is riskier than
 * a wrong figure, so it keeps escalating.
 */
// FAQ_HOLD_WRONG_TOPIC_V1: WRONG_TOPIC (the draft answered a different subject) is a draft defect, not
// evidence that a teammate must open the client's account. Real-model A/B 2026-09-23: "does having a
// soft breach cause any issue with the payout" was escalated 1/6 on BOTH old and new code via
// PRESEND_HOLD_FORCE_ESCALATE general-faq WRONG_TOPIC. The general-faq branch also refuses to ship a
// WRONG_TOPIC draft (see __unsafeDraft), so the wrong answer still cannot leak.
// PROMISE_STRIP_V1 (owner decision 2026-09-24): UNSUPPORTED_PROMISE joins the draft-quality codes. On a
// knowledge-answerable general question an unsupported promise is one bad sentence in OUR draft, not a
// reason to page a teammate (live 215476072310759 replay: a general products question escalated with a
// new note). The general-faq branch never ships the promise: it strips the promise sentence and
// re-validates, else regenerates once from official knowledge. Account work and every other code still
// escalate exactly as before (faqHoldMustNotEscalate requires kind general-faq + an answerable ask).
const DRAFT_QUALITY_HOLD_CODES = new Set(['UNSUPPORTED_NUMBER', 'UNSUPPORTED_FACT', 'MISSED_QUESTION', 'PUBLIC_RESTATEMENT', 'WRONG_TOPIC', 'UNSUPPORTED_PROMISE', 'VARIANT_COMPARISON_INCOMPLETE', 'UNCONFIRMED_VARIANT_FIGURE']);

/**
 * Should a held general-FAQ reply stay on the answering path instead of being forced into an
 * escalation (which then asks the customer for their account number)?
 *
 * Live 2026-09-22: a general FAQ question was held with UNSUPPORTED_NUMBER, force-escalated,
 * and the escalation path then asked the client for identifying details —
 *   PRESEND_HOLD_KIND general-faq
 *   PRESEND_HOLD_FORCE_ESCALATE general-faq UNSUPPORTED_NUMBER
 *   IDENTITY_BEFORE_ESCALATE asked missing
 * Arsal's standing rule forbids asking for account details on a question the approved
 * knowledge base answers. The failing codes there described a bad draft, not account work.
 *
 * Returns true ONLY when all three hold, so it can never swallow a real escalation:
 *   - the hold was classified general-faq (not escalate/human-request/off-topic/contentless)
 *   - every failing code is a draft-quality code
 *   - the ask itself is answerable from approved knowledge (account-specific asks excluded)
 */
function faqHoldMustNotEscalate(kind, codes, text, conversationId) {
  if (kind !== 'general-faq') return false;
  const list = (codes || []).map((c) => String((c && c.code) || c || ''));
  if (!list.length) return false;
  if (!list.every((c) => DRAFT_QUALITY_HOLD_CODES.has(c))) return false;
  if (isKnowledgeAnswerableAsk(text)) return true;
  /* LUNA_IMAGE_UNDERSTAND_V1:BEGIN:faq-hold-image */
  // Screenshot-explain asks are answerable from the image + KB even when the short
  // deictic text alone fails looksFundedEliteRelated / isKnowledgeAnswerableAsk.
  try {
    if (
      conversationId != null &&
      typeof __imageAskGuard.isImageAnswerableIssue === 'function' &&
      __imageAskGuard.isImageAnswerableIssue(conversationId, text)
    ) {
      return true;
    }
  } catch (_) { /* ignore */ }
  /* LUNA_IMAGE_UNDERSTAND_V1:END:faq-hold-image */
  return false;
}

/** What kind of message is behind a held reply? Decides reply-vs-note. */
function presendHoldKind(problemText, latestText, holdReason, conversationId) {
  if (/missed-escalation-held/.test(String(holdReason || '')) || clientWantsHumanTeammate(latestText)) return 'human-request';
  let t = String(problemText || latestText || '');
  // CONTEXTUAL_FOLLOWUP_V1: judge hold kind on the prior FundedElite topic when the latest
  // message is a short follow-up ("Only these?", "What else?") — never scope-decline first.
  try {
    const latest = String(latestText || '').trim();
    if (latest && (contextualFollowUp.isContextualFollowUp(latest) || require('./statePresend/textUtils').isReferentialFollowUp(latest))) {
      const anchor = String(problemText || '').trim();
      if (anchor && looksFundedEliteRelated(anchor)) t = anchor;
      else if (latest && looksFundedEliteRelated(latest)) t = latest;
    }
  } catch (_) {}
  if (isGreetingOrSmallTalk(t) || isGreetingOrSmallTalk(latestText)) return 'smalltalk';
  if (assistantIdentityGuard.isAssistantPersonalQuestion(t) && !/\b(?:fundedelite|account|payout|challenge|login|kyc)\b/i.test(t)) return 'personal';
  try { if (regenModule().isContentlessMessage(t)) return 'contentless'; } catch (_) {}
  /* LUNA_IMAGE_UNDERSTAND_V1:BEGIN:hold-kind-image */
  // Vague "what does this mean?" with a loaded screenshot is FundedElite work (promo /
  // challenge params / error UI), not off-topic. Classifying it off-topic forced
  // PRESEND_HOLD_FORCE_ESCALATE → IDENTITY_BEFORE_ESCALATE → account-number ask
  // (live ticket 215476054921252).
  try {
    if (
      conversationId != null &&
      typeof __imageAskGuard.isImageAnswerableIssue === 'function' &&
      __imageAskGuard.isImageAnswerableIssue(conversationId, latestText || problemText)
    ) {
      return 'general-faq';
    }
  } catch (_) { /* ignore */ }
  /* LUNA_IMAGE_UNDERSTAND_V1:END:hold-kind-image */
  if (!looksFundedEliteRelated(t)) {
    // TURN_INTENT_V1: same single intent layer as replyDecision; off-topic only on positive evidence.
    try {
      const __ti = require('./statePresend/turnIntent').classify(latestText || t, { isSupport: looksFundedEliteRelated, isExternal: (q) => EXTERNAL_TOPIC_RE.test(String(q || '')) });
      if (__ti.intent === 'SUPPORT_META' || __ti.intent === 'SOCIAL_SMALLTALK') return 'smalltalk';
      if (__ti.intent !== 'GENUINE_OFF_TOPIC') return 'clarify';
    } catch (_) { /* fall through */ }
    return 'off-topic';
  }
  if (!presendNeedsBackendLook(t)) return 'general-faq';
  return 'escalate';
}

/**
 * A draft that refuses to discuss personal topics. The model writes its own wording, so this
 * matches the sense rather than the canned lines in assistantIdentityGuard.
 */
const PERSONAL_DECLINE_RE =
  // "I keep personal topics/activities private" (live 215476088947961 replay) is the same refusal.
  /\bkeep\s+(?:my\s+)?(?:personal|private)[\s-]+\w+\s+(?:private|to\s+myself|out)\b|\b(?:not\s+something\s+i\s+can\s+help\s+with|have\s+to\s+pass\s+on\s+that)\b|\bpersonal(?:[\s-]+(?:topics?|matters?|questions?|life|masail|stuff|things))\b[^.!?]{0,60}\b(?:can(?:not|'?t)|don'?t|do\s+not|aren'?t|isn'?t|not\s+something|nahi)\b|\b(?:can(?:not|'?t)|don'?t|do\s+not|won'?t)\s+(?:discuss|answer|talk\s+about|get\s+into)\b[^.!?]{0,30}\bpersonal\b/i;

/**
 * "How are you arsal" is small talk, not a personal question. In live chat 215476024651932 the
 * model answered a plain how-are-you with "Personal topics aren't something I discuss here",
 * which refuses a greeting and answers nothing. A refusal is only right when the client really
 * did ask something personal about the assistant.
 */
function fixSmalltalkDecline(latestClientText, body, priorBotTexts) {
  const t = String(latestClientText || '');
  if (!t || !PERSONAL_DECLINE_RE.test(String(body || ''))) return body;
  try { if (assistantIdentityGuard.isAssistantPersonalQuestion(t)) return body; } catch (_) { return body; }
  if (!isGreetingOrSmallTalk(t)) return body;
  return smalltalkReplyFor(t, priorBotTexts);
}

/** A reply that answers the small talk actually asked, not always "I'm doing well". */
/** NO_REVIVE_ACCOUNT_DURING_SMALLTALK_V1: latest message is casual — do not pivot to older account work / identity asks. */
function shouldNotReviveAccountIssue(latestText) {
  const t = String(latestText || '').trim();
  if (!t) return false;
  if (isGreetingOrSmallTalk(t)) return true;
  try { if (teammateHandoffGates.isShortClientAckExpanded(t)) return true; } catch (_) {}
  try { if (require('./statePresend/textUtils').isShortAck(t)) return true; } catch (_) {}
  // Thanks / positive closing without a new account ask.
  if (/^(?:going\s+)?(?:perfect|great|good|fine|ok(?:ay)?)\b.*\b(?:thanks?|thank\s+you)\b/i.test(t)
      && !/\b(?:account|payout|upgrade|login|kyc|breach)\b/i.test(t)) return true;
  if (/\b(?:thanks?|thank\s+you|thx|ty)\b/i.test(t)
      && !/[?]/.test(t)
      && !/\b(?:account|payout|upgrade|login|kyc|breach|status|update)\b/i.test(t)
      && t.split(/\s+/).length <= 12) return true;
  // Explicit return to old case / update request / providing identity → allow revive.
  if (/\b(?:back\s+to|about\s+my\s+(?:account|upgrade|payout)|any\s+update|status\s+on|still\s+pending|my\s+account\s*(?:number|#|is)|here\s+is\s+my)\b/i.test(t)) return false;
  return false;
}

/**
 * SOCIAL_SMALLTALK_V1 fallback (the model writes small-talk replies; this is used only when its draft
 * refused). Truthful for a support assistant: no invented meals, places, family or activities beyond
 * "helping clients here". Varied, a light question back, and no "How can I help?" every time.
 */
const SOCIAL_REPLIES = [
  'Just helping clients out here today. How is your day going?',
  "Keeping busy with client chats today, which I enjoy. How about you?",
  "All good on my side, just working through today's conversations. How are things with you?",
  "It's been a steady day of helping traders here. Hope yours is going well!",
];
function socialReplyFor(text, priorBotTexts) {
  const norm = (x) => String(x || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const used = new Set((priorBotTexts || []).slice(-10).map(norm));
  const pool = SOCIAL_REPLIES.filter((r) => !used.has(norm(r)));
  const choices = pool.length ? pool : SOCIAL_REPLIES;
  let h = 0; for (const ch of String(text || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return choices[h % choices.length];
}

/* TURN_INTENT_V1: canned boundary lines (the [[SCOPE_DECLINE]] variants and the personal decline family). They may be
 * sent only after a POSITIVE off-topic finding; on any other turn they are replaced. */
const BOUNDARY_REFUSAL_TEXT_RE = /outside what I can help|only handle FundedElite|FundedElite (?:topics )?(?:is|are) all I can|FundedElite topics are all I can cover|pass on that one|Not something I can cover|I can'?t help with that one|can'?t get into that one|only cover FundedElite/i;
const UNCLEAR_CLARIFY_REPLY = 'Sure, happy to help. Could you tell me a little more about what you need?';

/* CARRIED_QUESTION_COVERAGE_V1 (2026-10-06, live 215476263877734).
 * Same-draft repair must not decide silence. A revalidated unchanged draft sends.
 * An unchanged draft that is still invalid falls through to a safe fallback. */
function decideRepairedDraft(repaired, base, opts) {
  const o = opts || {};
  const rep = repaired == null ? '' : String(repaired);
  const b = base == null ? '' : String(base);
  if (rep && rep !== b) return { send: true, body: rep, reason: 'repaired' };
  if (rep && (o.revalidated || o.staleCleared)) return { send: true, body: rep, reason: rep === b ? 'unchanged_revalidated' : 'stale_cleared' };
  return { send: false, body: '', reason: 'needs_fallback' };
}

function quietHoldReason(opts) {
  const o = opts || {};
  if (o.closed) return 'closed_conversation';
  if (o.humanOwns) return 'human_owns_ticket';
  if (o.duplicate) return 'duplicate_body';
  if ((o.unresolvedCount || 0) > 0 || o.fallbackFailed) return 'unresolved_question_but_fallback_failed';
  if (o.pendingClarification) return 'pending_clarification';
  if (o.handoffRequired) return 'handoff_required';
  if (o.alreadyAnswered) return 'question_already_answered';
  if (o.noReplyNeeded) return 'no_reply_needed';
  return 'unresolved_question_but_fallback_failed';
}

function unresolvedSupportQuestions(parts) {
  try {
    const cs = require('./statePresend/conversationState');
    const mac = require('./statePresend/multiAskCompleteness');
    const msgs = cs.normalizeMessages(parts, { botName: 'arsal', botAdminIds: [ARSAL_ID, ELITE_AI_ID] });
    const asks = mac.extractAsks(msgs);
    return [...(asks.burst || []), ...(asks.carried || [])]
      .filter((a) => a && (a.kind === 'question' || a.kind === 'support-statement'))
      .map((a) => String(a.text || '').trim())
      .filter(Boolean);
  } catch (_) { return []; }
}

/** Last resort when a genuine missed question could not be repaired. No teammate figures. */
function missedQuestionFallbackBody(asks) {
  const mac = require('./statePresend/multiAskCompleteness');
  const list = (asks || []).map((a) => String((a && a.text) || a || '').trim()).filter(Boolean);
  if (!list.length) return '';
  const timing = list.filter((q) => mac.isTimingQuestion(q));
  const cryptoReceipt = timing.some((q) => {
    const f = mac.timingFacets(q);
    return f.has('crypto') || (f.has('receipt') && /\b(?:crypto|wallet|funds)\b/i.test(q));
  });
  if (cryptoReceipt) {
    return 'Once the crypto payout is actually sent, it usually arrives within hours. That arrival time is separate from how long payout processing takes.';
  }
  if (timing.length) {
    return 'Could you tell me which timeframe you mean: payout processing, or when the funds reach you after they are sent?';
  }
  return 'Could you tell me which part is still unanswered so I can answer that directly?';
}
function supportMetaReplyFor(text) {
  let n = String(text || '').toLowerCase();
  try { n = require('./statePresend/turnIntent').normalizeText(text); } catch (_) {}
  if (/\b(?:continue|continuing|proceed)\b/.test(n)) return "Of course, let's continue. What would you like to ask next?";
  if (/\b(?:free|available|availability|busy|minute|minutes|moment|second|seconds|time|online|there|around|here)\b/.test(n)) return "Yes, I'm here and happy to help. What would you like to ask?";
  if (/\b(?:ask|asking|question|questions|query|queries|doubt|doubts|inquiry|enquiry|more|another|thing|something)\b/.test(n)) return 'Of course, go ahead! What would you like to ask?';
  return 'Absolutely, what would you like help with?';
}

function smalltalkReplyFor(text, priorBotTexts) {
  const t = String(text || '').toLowerCase();
  try {
    if (require('./statePresend/turnIntent').isSupportMetaOnly(text)) {
      const __m = supportMetaReplyFor(text);
      return /\bhow\s+(?:are|r)\s+(?:you|u)\b/.test(t) && !lunaAlreadyAskedWellbeing(priorBotTexts) ? "I'm doing well, thanks for asking! " + __m : __m;
    }
  } catch (_) {}
  try {
    const __cc = require('./statePresend/textUtils').classifySmallTalk(text);
    if (__cc.pure && __cc.components.includes('compliment') && !__cc.components.includes('ask-wellbeing')) return "That's kind of you to say, thank you! \u{1F60A}";
  } catch (_) {}
  try {
    if (assistantIdentityGuard.isArsalPresenceAsk(text)) {
      return assistantIdentityGuard.presenceReplyFor(text);
    }
  } catch (_) {}
  if (/\b(?:are|r)\s*(?:you|u)\s*(?:there|here|alive|online|available)\b|\byou\s+there\b|\bstill\s+(?:there|here)\b|\banyone\b|^\s*arsal\s*\?*\s*$/.test(t)) {
    return "Yes, I'm here. How can I help with your FundedElite account?";
  }
  if (/\bhow\s+(?:are|r|ar|is)\s+(?:you|u)\b|\bhow's\s+it\s+going\b|\bhw\s+are\b/.test(t)) {
    return "I'm doing well, thanks for asking. How can I help with your FundedElite account today?";
  }
  // Social small talk beyond "how are you" (what are you doing / up to, busy, how's your day ...).
  try { if (require('./statePresend/textUtils').isSocialSmallTalk(text) && !/\bhow\s+(?:are|r)\s+(?:you|u)\b/.test(t)) return socialReplyFor(text, priorBotTexts); } catch (_) {}
  // SMALLTALK_COURTESY_V1: the client ANSWERED how they are ("Am also fine thanks for asking!") or said
  // "glad to hear that" / "thanks for asking". Acknowledge it; never ask how they are again (no loop).
  try {
    const __c = require('./statePresend/textUtils').classifySmallTalk(text);
    if (__c.pure && __c.components.includes('wellbeing-answer')) return 'Glad to hear that! How can I help you today?';
    if (__c.pure && __c.components.includes('glad')) return 'Thanks! Let me know if there is anything I can help you with.';
    if (__c.pure && /\bfor\s+asking\b/.test(t)) return 'Of course! How can I help you today?';
  } catch (_) {}
  // Closing thanks / appreciation must never become a scope-decline.
  if (/\b(?:thanks?|thank\s*you|thankyou|thx|ty|appreciate|grateful|god\s*bless|more\s+power)\b/i.test(t) && !/[?]/.test(t)) {
    const opts = [
      "You're welcome! Happy to help anytime.",
      "You're welcome — glad I could help.",
      "My pleasure. Reach out anytime you need help with FundedElite.",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  return 'Hello, how can I help?';
}

/* SMALLTALK_COURTESY_V1 (2026-09-28, live 215476135544728): social replies answer "how are you" directly
 * and never loop it. Luna asked "How are you?" in two consecutive replies; the client had to answer twice. */
const WELLBEING_ASK_SENTENCE_RE = /\b(?:how\s+(?:are|r)\s+(?:you|u)(?:\s+(?:doing|today|doing\s+today|keeping))?|how\s+about\s+you|and\s+you|what\s+about\s+you|how'?s\s+(?:your\s+day|it\s+going|everything)(?:\s+going)?|how\s+is\s+(?:your\s+day|everything)(?:\s+going)?|how\s+have\s+you\s+been|hope\s+you'?re\s+doing\s+well\s+too)\b[^.!?]*\?/i;
const DIRECT_WELLBEING_ANSWER_RE = /\b(?:i['\u2019]?m|i\s+am|doing)\s+(?:really\s+|very\s+|pretty\s+|quite\s+)?(?:well|good|great|fine|ok(?:ay)?|alright|wonderful|fantastic)\b|\ball\s+good\b|\bdoing\s+great\b|\bnot\s+bad\b/i;
function lunaAlreadyAskedWellbeing(priorBotTexts) {
  return (priorBotTexts || []).slice(-6).some((b) => WELLBEING_ASK_SENTENCE_RE.test(stripHtml(String(b || ''))));
}
function shapeSocialReply(body, clientText, priorBotTexts) {
  let out = String(body || '').trim();
  if (!out) return out;
  let comps = [];
  try { comps = require('./statePresend/textUtils').classifySmallTalk(clientText).components || []; } catch (_) {}
  // No loop: once Luna has asked how the client is (or the client already told her), do not ask again.
  if (lunaAlreadyAskedWellbeing(priorBotTexts) || comps.includes('wellbeing-answer')) {
    const kept = out.split(/(?<=[.!?])\s+/).filter((x) => !WELLBEING_ASK_SENTENCE_RE.test(x));
    const next = kept.join(' ').trim();
    if (next !== out) console.log('SMALLTALK_NO_LOOP dropped repeated how-are-you');
    out = next;
  }
  // Direct answer: asked how Luna is -> say so first, never only "I'm here and ready to help".
  if (out && comps.includes('ask-wellbeing') && !DIRECT_WELLBEING_ANSWER_RE.test(out)) {
    out = "I'm doing well, thanks for asking! " + out.replace(/^(?:thanks\s+for\s+asking[.!]?\s*)/i, '')
      .replace(/^i['\u2019]?m\s+here\s+and\s+ready\s+to\s+help(?:,\s*thanks\s+for\s+asking)?[.!]?\s*/i, '');
    out = out.trim();
    console.log('SMALLTALK_DIRECT_ANSWER prefixed');
  }
  return out;
}

/**
 * Internal-note "Action needed" for an escalation the presend gate produced. It must name the
 * client's SPECIFIC problem so the teammate knows what to check, and it must never claim the
 * client asked for a person unless they did (live chats 215476018855544 and 215476019117282:
 * "Automated hold ... needs-escalate" told the team nothing).
 */
function presendEscalateActionNeeded(clientText, holdReason, opts) {
  if (clientWantsHumanTeammate(clientText)) {
    return 'Client requested a human teammate / manager / live agent. Please take over.';
  }
  const problem = String((opts && opts.problem) || clientText || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  let safe = problem;
  try { safe = require('./statePresend/credentialSanitizer').sanitizeCredentials(problem); } catch (_) {}
  const acct = opts && opts.account && opts.account !== 'Not provided' ? ' for account ' + opts.account : '';
  // NOTE_ACTION_SUMMARY_V1 (2026-09-24): the note must name the specific problem (owner rule), but as the
  // POLISHED summary, not the customer's raw words pasted in quotes (which also dragged along parts
  // already answered publicly). {{PROBLEM}} is filled by buildEscalateNoteAndAssignee after polishing;
  // the raw text is only the fallback.
  return 'Check' + (acct ? acct.replace(/^ for/, '') : ' the client\'s account') + ': {{PROBLEM}} ' +
    'Reply to the client with the result.' + '\u0000RAW:' + safe;
}

function finHandoffPhrase(text) {
  return softEdges.finHandoffPhrase(text);
}

function finHandoffInHistory(parts) {
  for (const part of parts || []) {
    if (!part || part.part_type === 'note') continue;
    const a = part.author || {};
    const id = String(a.id || '');
    const body = stripHtml(part.body || '');
    if (!body || !finHandoffPhrase(body)) continue;
    if (id === ELITE_AI_ID) return true;
    if (a.type === 'bot') return true;
    if (/elite\s*ai|\bfin\b/i.test(String(a.name || ''))) return true;
    // System / Fin-equivalent handoff copy from non-Arsal admin/bot
    if ((a.type === 'admin' || a.type === 'bot') && id !== ARSAL_ID) return true;
  }
  return false;
}

function eliteAiHasParticipated(parts) {
  for (const part of parts || []) {
    if (!part || part.part_type === 'note') continue;
    if (String((part.author || {}).id || '') !== ELITE_AI_ID) continue;
    if (String(part.part_type || '') !== 'comment') continue;
    if (stripHtml(part.body || '')) return true;
  }
  return false;
}

function lastEliteAiCommentUnix(parts) {
  let t = 0;
  for (const part of parts || []) {
    if (!part || part.part_type === 'note') continue;
    if (String((part.author || {}).id || '') !== ELITE_AI_ID) continue;
    if (String(part.part_type || '') !== 'comment') continue;
    if (!stripHtml(part.body || '')) continue;
    const at = Number(part.created_at || 0);
    if (at > t) t = at;
  }
  return t;
}

function clientRequestedLiveAgentAfterLastElite(parts) {
  const lastElite = lastEliteAiCommentUnix(parts);
  for (const part of parts || []) {
    if (!part) continue;
    const a = part.author || {};
    if (a.type !== 'user' && a.type !== 'lead') continue;
    const at = Number(part.created_at || 0);
    if (lastElite && at <= lastElite) continue;
    if (clientRequestedLiveAgent(stripHtml(part.body || ''))) return true;
  }
  return false;
}

function humanTeammateAlreadyRepliedPublic(parts) {
  for (const part of parts || []) {
    if (isHumanTeammatePublicReply(part)) return true;
  }
  return false;
}

function latestPublicAdminCommentAuthorId(parts) {
  let bestAt = -1;
  let bestId = '';
  for (const part of parts || []) {
    if (!part || String(part.part_type || '') !== 'comment') continue;
    const a = part.author || {};
    if (a.type !== 'admin' && a.type !== 'bot') continue;
    if (!stripHtml(part.body || '')) continue;
    const at = Number(part.created_at || 0);
    if (at >= bestAt) {
      bestAt = at;
      bestId = String(a.id || '');
    }
  }
  return bestId;
}

function conversationAgeSec(full) {
  const created = Number((full && full.created_at) || 0);
  if (!created) return -1;
  return Math.floor(Date.now() / 1000) - created;
}

function eliteAiStillOwning(full) {
  const parts = partsOf(full);
  if (finHandoffInHistory(parts)) return false;
  if (humanTeammateAlreadyRepliedPublic(parts)) return false;

  // Latest public bot/admin comment is from Elite AI
  if (latestPublicAdminCommentAuthorId(parts) === ELITE_AI_ID) return true;

  // Elite AI commented in last ~90s and no handoff yet
  const lastElite = lastEliteAiCommentUnix(parts);
  const now = Math.floor(Date.now() / 1000);
  if (lastElite && now - lastElite <= FIN_RECENT_OWNING_SEC) return true;

  // Fresh conversation: Elite AI + client only so far, no live-agent ask
  const age = conversationAgeSec(full);
  if (age >= 0 && age < FIN_FRESH_CONV_SEC) {
    if (eliteAiHasParticipated(parts) && !clientRequestedLiveAgentAfterLastElite(parts)) return true;
  }
  return false;
}

/**
 * true => SKIP public Arsal reply (Fin/Elite still owns the thread).
 * Escalations/Risk silent notes + auth-note paths never call this.
 * Assignment to Arsal alone is NOT treated as handoff.
 */
function shouldWaitForFin(full, latestUserText, topic) {
  const conversationId = full && full.id != null ? String(full.id) : '';
  const parts = partsOf(full);
  const text = String(latestUserText || '');
  if (continuousOwnershipOf(parts).active) return false;

  // Bot-test allowlist: Luna owns these tickets — do not yield to Fin/Elite wait.
  try {
    const tm = control.getTestMode && control.getTestMode();
    const bits = typeof contactBits === 'function' ? contactBits(full) : { name: '' };
    const cName = (bits && bits.name) || '';
    if (tm && tm.enabled && typeof control.isTestAllowed === 'function' && control.isTestAllowed(conversationId, cName)) {
      return false;
    }
  } catch (e) {
    console.error('testMode fin-wait check failed', 'class=' + (e && e.name || 'Error'));
  }

  // Fin-wait applies ONLY to messenger / in-app chat where Fin/Elite AI speaks first.
  // Email and other non-conversation channels never involve Fin — Luna must reply.
  {
    const srcType = String(((full && full.source) || {}).type || '').toLowerCase();
    if (srcType && srcType !== 'conversation') {
      if (topic === 'conversation.user.created') {
        console.log('ALLOW no-fin-wait email/non-messenger user.created', conversationId, srcType);
      }
      return false;
    }
  }

  // Fresh messenger tickets: always let Fin take the first shot (source-fallback must not race).
  if (topic === 'conversation.user.created') {
    console.log('SKIP fin-wait user.created', conversationId);
    return true;
  }

  // Client asked for live agent (latest OR any client msg after last Elite AI comment)
  if (clientRequestedLiveAgent(text) || clientRequestedLiveAgentAfterLastElite(parts)) {
    return false;
  }

  // Fin/Elite (or system) already announced live-agent handoff
  if (finHandoffInHistory(parts)) {
    return false;
  }

  // Real human teammate already in the public thread
  if (humanTeammateAlreadyRepliedPublic(parts)) {
    return false;
  }

  // Elite AI has participated and no handoff / live-agent yet
  if (eliteAiHasParticipated(parts)) {
    console.log('SKIP fin-wait elite-participated', conversationId);
    return true;
  }

  if (eliteAiStillOwning(full)) {
    console.log('SKIP fin-wait elite-owning', conversationId);
    return true;
  }

  // Fresh ticket, Fin has not spoken yet , brief wait (do not race first Fin reply)
  const age = conversationAgeSec(full);
  if (
    age >= 0 &&
    age < FIN_FRESH_CONV_SEC &&
    !eliteAiHasParticipated(parts) &&
    !arsalHasPublicClientReply(parts)
  ) {
    console.log('SKIP fin-wait fresh-no-elite', conversationId);
    return true;
  }

  return false;
}

function isVagueOrLiveAgentOnlyAsk(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (clientRequestedLiveAgent(t) && t.length < 140) {
    // Strip live-agent phrasing , if little substance remains, treat as vague takeover
    const rest = t
      .replace(/\b((live\s*agent)|(real\s+(person|human|agent))|(talk\s+to\s+(a\s+|an\s+)?(human|person|agent|someone))|(speak\s+(to|with)\s+(a\s+|an\s+)?(human|person|agent|someone))|(connect(\s+me)?\s+to\s+(a\s+|an\s+)?(agent|human|person|someone|support))|(need\s+(a\s+)?(live\s+)?(agent|human))|(want\s+(a\s+)?(live\s+)?(agent|human))|(human\s+support)|(agent\s+please)|(chat\s+with\s+(a\s+)?(person|human|agent|someone))|(transfer\s+(me\s+)?to\s+(a\s+)?(human|agent|person))|(put\s+me\s+through\s+to))\b/gi, ' ')
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (rest.length < 28) return true;
  }
  // A greeting addressed to the bot ("Hello arsal", "hi luna") is still just a greeting. Only
  // the bare word was accepted, so on a Fin handoff the locked welcome was skipped and the
  // model improvised ("a live team member will assist you with your payout request").
  if (/^(?:hi+|hey+|he+l+o+|yo|hola|ciao|salam)\s*,?\s*(?:arsal|elite\s*ai|luna)?[.!?\s]*$/i.test(t)) return true;
  if (/^(i\s+have\s+)?another\s+question[.!?\s]*$/i.test(t)) return true;
  // Parity with "another question": multi-issue openers after Fin/human handoff
  // (ticket 215476025058340) should get the locked welcome, not a confused clarify.
  if (/^(i\s+have\s+)?another\s+(?:issue|problem)[.!?\s]*$/i.test(t)) return true;
  if (/^(i\s+need\s+help|help\s+please|can\s+you\s+help)[.!?\s]*$/i.test(t)) return true;
  return false;
}

function lockedFinHandoffWelcome(clientName, latestClientText = '') {
  const first = firstNameFromClient(clientName);
  const name = first ? (' ' + first) : '';
  if (/[\u0600-\u06ff]/.test(String(latestClientText || ''))) return 'السلام علیکم' + name + '، میں آپ کی کیا مدد کر سکتا ہوں؟';
  if (/\b(?:ciao|buongiorno|salve|aiuto|aiutarmi)\b/i.test(String(latestClientText || ''))) return 'Ciao' + name + ', come posso aiutarti?';
  if (/\b(?:kya|aap|ap|tum|mujhe|madad|salam)\b/i.test(String(latestClientText || ''))) return 'Salam' + name + ', main aap ki kis cheez mein madad kar sakta hoon?';
  return 'Hello' + name + ', how can I help?';
}

function syncEscalateTeammateFirstState(conversationId, full) {
  const { all, state, id } = getConvState(conversationId);
  if (!state.escalateAwaitingFirstTeammate || !state.lastEscalateAt) {
    return state;
  }
  const parts = partsOf(full);
  const after = Number(state.lastEscalateAt || 0);
  for (const part of parts) {
    if (!isHumanTeammatePublicReply(part)) continue;
    if (teammateHandoffGates.classifyTeammatePublicReply(part.body) !== 'substantive') continue;
    const at = Number(part.created_at || 0);
    if (at <= after) continue;
    state.escalateAwaitingFirstTeammate = false;
    state.escalateTeammateExplainedAt = at;
    all[id] = state;
    saveTicketState(all);
    console.log('ESCALATE teammate first explanation seen', conversationId, at);
    break;
  }
  return state;
}

function hasOpenEscalation(state) {
  return !!(state && state.lastEscalateAt);
}

/**
 * Decide whether a new escalation attempt is the same pending case or a different issue.
 * A different account issue replaces the stale awaiting lock so identity collection and a
 * real escalation can proceed. Clear FAQ fallthrough intentionally leaves the old lock armed.
 */
function evaluateAwaitingEscalationAttempt(conversationId, text, escState) {
  const state = escState || {};
  const decision = escalateRelatedOnly.decideEscalateAwaitingGate({
    awaitingFirstTeammate: !!state.escalateAwaitingFirstTeammate,
    userText: text,
    lastEscalateProblem: state.lastEscalateProblem,
    lastEscalateNoteSnippet: state.lastEscalateNoteSnippet,
    lastEscalateTopic: state.lastEscalateTopic,
    lastEscalateTopics: state.lastEscalateTopics,
    isGeneralAnswerable: (t) => isKnowledgeAnswerableAsk(t) && !presendNeedsBackendLook(t), /* GENERAL_QUESTION_NOT_STATUS_V1 */
  });
  if (!decision.supersedesAwaiting) {
    return { decision, state, superseded: false };
  }

  const stPack = getConvState(conversationId);
  stPack.state.escalateAwaitingFirstTeammate = false;
  stPack.state.deferredRelatedReply = null;
  saveConvState(stPack.id, stPack.state);
  console.log(
    'ESCALATE awaiting superseded by different issue',
    conversationId,
    decision.reason || 'unrelated_other'
  );
  return { decision, state: stPack.state, superseded: true };
}

function sourceAsUserPart(conv) {
  // Fresh tickets often have the opening client message only on conversation.source
  // (not yet duplicated into conversation_parts). Treat that as the latest user part.
  const src = (conv && conv.source) || {};
  const a = src.author || {};
  if (a.type !== 'user' && a.type !== 'lead') return null;
  const hasImg = collectImageAttachments(src).length > 0;
  if (!src.body && !hasImg) return null;
  return {
    id: 'source:' + String((conv && conv.id) || ''),
    part_type: 'comment',
    body: src.body || '',
    attachments: src.attachments || [],
    author: a,
    created_at: Number(src.created_at || (conv && conv.created_at) || 0) || 0,
    __fromSource: true,
  };
}

function findLatestUserPart(parts, conv) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    const a = p.author || {};
    if (a.type !== 'user' && a.type !== 'lead') continue;
    const hasImg = collectImageAttachments(p).length > 0;
    if (p.body || p.part_type === 'comment' || p.part_type === 'open' || hasImg) return p;
  }
  // Fallback: opening message living only on source (conversation.user.created)
  if (conv) return sourceAsUserPart(conv);
  return null;
}

function buildHistory(conv, maxParts) {
  const parts = partsOf(conv);
  const lines = [];
  const src = conv.source || {};
  if (src.body) {
    const who = (src.author && src.author.type === 'user' ? 'Client' : 'Other') + ': ';
    lines.push(who + stripHtml(src.body));
  }
  const slice = parts.slice(-(maxParts || 40));
  for (const p of slice) {
    const a = p.author || {};
    let body = stripHtml(p.body || '');
    // IMAGE_EVIDENCE_V1: a client message that carried a screenshot says so in the history (with what it showed,
    // when already read), so the model and later turns know the screenshot exists; an image-only message is no
    // longer invisible.
    if ((a.type === 'user' || a.type === 'lead') && p.part_type !== 'note' && Array.isArray(p.attachments) && p.attachments.length) {
      try { body = (body + imageEvidence.historyNote(p, collectImageAttachments)).trim(); } catch (_) { /* history marker is optional */ }
    }
    if (!body) continue;
    if (p.part_type === 'note') {
      lines.push('[internal note] ' + (a.name || 'admin') + ': ' + body);
      continue;
    }
    if (a.type === 'user' || a.type === 'lead') lines.push('Client: ' + body);
    else if (a.type === 'admin' || a.type === 'bot') lines.push(historySpeakerLabel(a) + ': ' + body);
  }
  return lines.join('\n');
}

/* HISTORY_SPEAKER_LABELS_V1 — the model must be able to tell its OWN earlier replies from a human
 * teammate's. Luna posts publicly from the "Arsal - Manager" seat, and history used to label those
 * lines "Arsal - Manager:" exactly like a person. Live 2026-09-23 (215476067640302, 215476057708775,
 * 215476068707461): the model returned SKIP "a human teammate is handling this ... they asked the
 * client to clarify" when the only one who had asked was Luna herself, and the customer got silence.
 * Internal notes keep the author name (the owner writes command notes from the same seat). */
function historySpeakerLabel(a) {
  const id = String((a && a.id) || '');
  const name = String((a && a.name) || '').trim();
  if (id === ARSAL_ID) return 'Luna (you)';
  if (id === ELITE_AI_ID || (a && a.type === 'bot') || /elite\s*ai|\bfin\b/i.test(name)) return 'Fin (automated bot, not a person)';
  return 'Human teammate ' + (name || 'teammate');
}

function stripActionLeak(text) {
  let t = String(text || '');
  // Cut at first leaked second ACTION block inside body
  t = t.replace(/\n\s*ACTION\s*:\s*(?:REPLY|ESCALATE|CLOSE|SKIP)\b[\s\S]*$/i, '');
  // Drop leftover parser label lines
  t = t.replace(/^\s*(?:ACTION|BODY|KIND|CLIENT|ACTION_NEEDED)\s*:\s*.*$/gim, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

function parseAction(raw) {
  const text = String(raw || '').trim();
  const m = text.match(/ACTION:\s*(REPLY|ESCALATE|CLOSE|SKIP)\s*[\r\n]+([\s\S]*)/i);
  if (m) {
    const action = m[1].toUpperCase();
    let rest = (m[2] || '').trim();
    let kind = '';
    const km = rest.match(/^KIND:\s*([^\r\n]+)\s*/i);
    if (km) {
      kind = String(km[1] || '').trim().toUpperCase();
      rest = rest.slice(km[0].length).trim();
    }
    let client = '';
    const cm = rest.match(/^CLIENT:\s*([\s\S]*?)(?=\nBODY:|\nKIND:|\nACTION:|$)/i);
    if (cm) {
      client = (cm[1] || '').trim();
      rest = rest.slice(cm[0].length).trim();
    }
    if (!kind) {
      const km2 = rest.match(/^KIND:\s*([^\r\n]+)\s*/i);
      if (km2) {
        kind = String(km2[1] || '').trim().toUpperCase();
        rest = rest.slice(km2[0].length).trim();
      }
    }
    // Stop BODY at next ACTION / ACTION_NEEDED so leaked CLOSE blocks never enter client text
    const bm = rest.match(/^BODY:\s*([\s\S]*?)(?=\nACTION_NEEDED:|\nACTION\s*:|$)/i);
    let body = bm ? String(bm[1] || '').trim() : rest.replace(/^BODY:\s*/i, '').trim();
    const am = rest.match(/\nACTION_NEEDED:\s*([\s\S]*)$/i);
    const actionNeeded = am ? String(am[1] || '').trim() : '';
    if (am && bm) body = String(bm[1] || '').trim();
    if (!kind && /FAQ[_ ]?CONFIRM/i.test(client + '\n' + body)) kind = 'FAQ_CONFIRM';
    if (!kind && /PLATFORM|DELETE|GDPR/i.test(client + '\n' + body)) kind = 'PLATFORM';
    if (!kind) kind = 'ACCOUNT';
    if (/FAQ/.test(kind)) kind = 'FAQ_CONFIRM';
    else if (/PLATFORM|DELETE|GDPR|DATA/.test(kind)) kind = 'PLATFORM';
    else kind = 'ACCOUNT';
    body = stripActionLeak(body);
    client = stripActionLeak(client);
    return { action, client, body, kind, actionNeeded };
  }
  // If model forgot ACTION, treat as REPLY but strip labels
  const cleaned = stripActionLeak(text.replace(/^ACTION:\s*\w+\s*/i, '').replace(/^BODY:\s*/i, '').trim());
  return { action: 'REPLY', body: cleaned, client: '', kind: 'ACCOUNT', actionNeeded: '' };
}

async function fetchConversation(id) {
  const r = await icRequest(
    'get',
    'https://api.intercom.io/conversations/' + id,
    undefined,
    'FETCH'
  );
  if (!r.ok) {
    console.log('fetchConversation fail', id, r.status);
    return null;
  }
  rememberVisibleContext(id, r.data);
  return r.data;
}

/** True when an authorized human grant (authorized note mentioning Luna, or a human assigning the
 * conversation to the Luna seat) is at least as new as the latest human ownership event. */
function freshGrantOverridesOwner(parts, conversationId) {
  const verdict = ownershipBoundary.evaluate({}, parts || [], ownershipOptions(conversationId));
  return !verdict.blocked && verdict.reason === 'fresh-human-grant';
}

/* REOPEN_HUMAN_OWNERSHIP_V1: last-moment ownership re-verify for EVERY public reply (fresh GET).
 * A human admin assignee (not the Luna seat) or human close/reopen / human team ownership blocks
 * the send, including drafts prepared before the teammate took over. Lookup failure fails closed.
 * Exempt: Luna's own handoff confirmation right after Luna itself assigned the conversation. */
const __lunaAssignedAt = new Map();
const LUNA_OWN_ASSIGN_EXEMPT_MS = 120 * 1000;
const ownershipBoundary = require('./ownershipBoundary');
const faqAssistance = require('./faqAssistance');
/** Option B FAQ prepared while human-owned; execute only after model returns REPLY (not CLOSE/SKIP). */
const deferredHumanOwnedFaq = new Map();
const ownershipWriteLock = require('./ownershipWriteLock');
function ownershipUnavailableResult(reason) {
  // An unavailable read is recoverable; human ownership/STOP/aiOff are deliberate
  // holds. Reuse the durable worker's bounded retry for the former only. Direct
  // callers and pollers remain fail-closed, without manufacturing a queue event.
  const turn = webhookFastAck.currentStore();
  if (turn && !turn.gateError) webhookFastAck.markGateError(new Error('OWNERSHIP_UNAVAILABLE:' + reason));
  return { ok: false, skipped: true, reason };
}
function withOwnershipWriteLock(conversationId, fn) {
  return ownershipWriteLock.withOwnershipWriteLock(conversationId, fn);
}
function ownershipOptions(conversationId) {
  const known = new Set((conversationId ? ownershipBoundary.knownParts(conversationId) : []).map((x) => String(x.id)));
  return { arsalId: ARSAL_ID, eliteAiId: ELITE_AI_ID,
    isLunaAuthored: (p) => known.has(String(p && p.id || '')),
    isAuthorizedGrant: (p) => {
      if (!AUTHORIZED_NOTE_ADMIN_IDS.has(String((p.author || {}).id || '')) || !noteBodyMentionsAuthorized(p.body || '')) return false;
      const cmd = parseAuthorizedNoteCommand(stripHtml(p.body || ''), { fromAuthorizedAuthor: true, mentionsAuthorized: true });
      // FOLLOW also includes addressed FYI/substantive notes. Those are not a
      // hand-back. Reuse the existing explicit-resume intent classifier for it.
      return !!(cmd && (['ASSIST', 'RESUME', 'REPLY'].includes(cmd.cmd) ||
        (cmd.cmd === 'FOLLOW' && reviewRequestFlow.RESUME_INTENT_RE.test(stripHtml(p.body || '')))));
    } };
}
function rememberLunaAction(conversationId, result, kind, body, target, previousIds) {
  // FAQ assistance only treats a real conversation_part payload as a linked receipt.
  // Timeouts / unknown transport results must not fabricate confirmation.
  if ((faqAssistance.current(conversationId) || faqAssistance.recoveryActive(conversationId)) &&
      (!result || !result.data || result.data.type !== 'conversation_part')) {
    return [];
  }
  const added = ownershipBoundary.confirmedParts(result && result.data, kind, body, target, ARSAL_ID, previousIds);
  if (!added.length) return [];
  ownershipBoundary.remember(conversationId, added);
  try { faqAssistance.linkReceipt(conversationId, kind, body, added); } catch (_) { /* ledger best-effort */ }
  return added;
}
function currentAuthorizedCommand(parts, conversationId, commandPartId) {
  const list = parts || [], o = ownershipOptions(conversationId);
  const i = list.findIndex((p) => String(p.id || '') === String(commandPartId || ''));
  if (i < 0) return false;
  const p = list[i];
  if (p.part_type !== 'note' || !AUTHORIZED_NOTE_ADMIN_IDS.has(String((p.author || {}).id || '')) ||
      !noteBodyMentionsAuthorized(p.body || '')) return false;
  const parsed = parseAuthorizedNoteCommand(stripHtml(p.body || ''), { fromAuthorizedAuthor: true, mentionsAuthorized: true });
  if (!parsed) return false;
  for (const later of list.slice(i + 1)) {
    if (!ownershipBoundary.isHuman(later, o)) continue;
    if (['assignment', 'close'].includes(later.part_type)) return false;
    if (later.part_type === 'comment' && teammateHandoffGates.classifyTeammatePublicReply(later.body) === 'substantive') return false;
    if (later.part_type === 'note') {
      if (continuousOwnership.isStopInstruction(later.body) || o.isAuthorizedGrant(later)) return false;
      if (AUTHORIZED_NOTE_ADMIN_IDS.has(String((later.author || {}).id || '')) && noteBodyMentionsAuthorized(later.body || '') &&
          parseAuthorizedNoteCommand(stripHtml(later.body || ''), { fromAuthorizedAuthor: true, mentionsAuthorized: true })) return false;
    }
  }
  return true;
}
async function publicSendOwnershipBlock(conversationId, snapshot) {
  if (faqAssistance.current(conversationId)) {
    const allowed = await faqAssistance.publicPermission(conversationId, faqAssistance.current(conversationId).approvedBody, faqAssistanceDeps(), snapshot);
    return allowed && allowed.allowed ? '' : allowed && allowed.reason || 'faq-permission-unavailable';
  }
  try {
    if (control.isPaused()) return 'paused';
    if (control.isAiOff(conversationId)) return 'ticket-ai-off';
  } catch (_) { return ownershipUnavailableResult('control-unavailable').reason; }
  let fresh = null;
  try { fresh = await fetchConversation(conversationId); } catch (_) { fresh = null; }
  const parts = fresh ? authoritativeConversationParts(fresh) : null;
  if (!fresh || !parts) return ownershipUnavailableResult('ownership-refetch-failed').reason;
  if (snapshot) snapshot.parts = parts;
  const o = ownershipOptions(conversationId), own = __lunaAssignedAt.get(String(conversationId));
  if (own && !own.publicUsed && Date.now() - own.at <= LUNA_OWN_ASSIGN_EXEMPT_MS) o.handoff = own;
  const decision = ownershipBoundary.evaluate(fresh, parts, o);
  if (control.isPaused() || control.isAiOff(conversationId)) return 'ticket-paused-or-ai-off';
  if (snapshot && !decision.blocked && decision.reason === 'own-handoff-confirmation') snapshot.handoff = own;
  return decision.blocked ? decision.reason : '';
}

async function automaticNoteOwnershipBlock(conversationId, snapshot) {
  try {
    if (control.isPaused() || control.isAiOff(conversationId)) return { ok: false, skipped: true, reason: 'note-paused-or-ai-off' };
    const fresh = await fetchConversation(conversationId), parts = fresh && authoritativeConversationParts(fresh);
    if (!fresh || !parts) return ownershipUnavailableResult('note-ownership-unavailable');
    if (snapshot) { snapshot.full = fresh; snapshot.parts = parts; }
    if (control.isPaused() || control.isAiOff(conversationId)) return { ok: false, skipped: true, reason: 'note-paused-or-ai-off' };
    const o = ownershipOptions(conversationId), own = __lunaAssignedAt.get(String(conversationId));
    // Preserve only the existing confirmed assignment handoff allowance.
    if (own && Date.now() - own.at <= LUNA_OWN_ASSIGN_EXEMPT_MS) o.handoff = own;
    const decision = ownershipBoundary.evaluate(fresh, parts, o);
    if (decision.reason === 'stop-in-history') return { ok: false, skipped: true, reason: 'note-stop-in-history' };
    if (decision.blocked) {
      // P1: Risk/Escalations teambox duty is internal-note-only. Team-assignment
      // history and Risk-admin / teambox assignee must not deny the note path.
      // Public replies stay blocked by publicSendOwnershipBlock + teambox handlers.
      // Ambiguous/unavailable/limited history still fail closed. STOP still denies.
      if (isSilentTeamboxNoteDuty(fresh) && teamboxNoteOwnershipExemptReason(decision.reason)) return null;
      return { ok: false, skipped: true, reason: decision.reason };
    }
    return null;
  } catch (_) { return ownershipUnavailableResult('note-control-unavailable'); }
}

async function postReply(conversationId, messageType, body, opScope) {
  return withAuthorizedCommandWrite(conversationId, messageType, () =>
    withOwnershipWriteLock(conversationId, () => postReplyWithOwnershipLock(conversationId, messageType, body, opScope)));
}
async function postReplyWithOwnershipLock(conversationId, messageType, body, opScope) {
  const faqVeto = faqAssistance.privilegedVeto(conversationId, messageType);
  if (faqVeto) return faqVeto;
  if (faqAssistance.current(conversationId) && faqAssistance.hash(body) !== faqAssistance.current(conversationId).approvedBodyHash) return { ok:false, skipped:true, reason:'faq-body-not-approved' };
  let previousIds = null, handoff = null;
  const permission = async () => {
    if (messageType === 'comment') {
      const snapshot = {};
      let denied;
      try { denied = await publicSendOwnershipBlock(conversationId, snapshot); }
      catch (_) { denied = ownershipUnavailableResult('ownership-evidence-unavailable').reason; }
      if (denied) return { ok: false, skipped: true, reason: denied };
      previousIds = (snapshot.parts || []).map((p) => String(p.id));
      handoff = snapshot.handoff || null;
    } else if (messageType === 'note') {
      try {
        const command = String(opScope || '').startsWith('command:') ? String(opScope).slice(8) : '';
        if (command) {
          const fresh = await fetchConversation(conversationId), parts = fresh && authoritativeConversationParts(fresh);
          if (!fresh || !parts) return ownershipUnavailableResult('note-ownership-unavailable');
          previousIds = parts.map((p) => String(p.id));
          if (!currentAuthorizedCommand(parts, conversationId, command)) return { ok: false, skipped: true, reason: 'note-command-stale' };
        } else {
          const snapshot = {};
          const denied = await automaticNoteOwnershipBlock(conversationId, snapshot);
          if (denied) return denied;
          previousIds = snapshot.parts.map((p) => String(p.id));
        }
      } catch (_) { return ownershipUnavailableResult('note-control-unavailable'); }
    }
    return null;
  };
  const denied = await permission();
  if (denied) { console.error('OWNERSHIP_PRESEND_BLOCK', conversationId, denied.reason); return denied; }
  if (messageType === 'comment') {
    const original = String(body || '');
    // Hold the text that was actually composed. Screening must not be able to drop a
    // credential (or the legitimate answer) and send a different body with no hold code.
    const __preHold = publicCredentialHold.holdFinalPublic({
      screened: original,
      rendered: toHtml(original),
      conversationId,
    });
    if (__preHold) {
      credentialHoldLog('conversations/' + conversationId, __preHold);
      return publicCredentialHold.holdResult(__preHold);
    }
    const __approvedComposition = require('./publicWriteBoundary').approvedParagraphComposition(original);
    const screen = __approvedComposition
      ? { ok: true, body: original, removed: [] }
      : publicReplyBoundary.screen(original);
    if (!screen.ok) return { ok: false, skipped: true, reason: screen.reason || 'boundary-empty' };
    const origLetters = (original.match(/[\p{L}\p{N}]/gu) || []).length;
    const nextLetters = (String(screen.body || '').match(/[\p{L}\p{N}]/gu) || []).length;
    const droppedMajority = origLetters >= 40 && nextLetters * 2 < origLetters;
    const internalOnly = (screen.removed || []).every((r) => r === 'role-marker' || r === 'role-label');
    if (droppedMajority && !internalOnly) {
      console.error('BOUNDARY_REWRITE_KEPT_ORIGINAL', conversationId, screen.reason || '');
      body = original;
    } else {
      body = screen.body;
    }
  }
  // Notes are already Intercom HTML (mentions, <b>, <br>). Never run toHtml on them ,
  // escaping turns <br>/<a> into visible code and breaks teammate @mentions.
  const finalBody = messageType === 'note' ? String(body || '') : toHtml(body);
  if (messageType === 'comment') {
    // PUBLIC_CREDENTIAL_HOLD_V1: final public-content boundary. The screened text and the rendered
    // payload are both checked; a hit holds the send. Nothing is rewritten.
    const __credHold = publicCredentialHold.holdFinalPublic({ screened: body, rendered: finalBody, conversationId });
    if (__credHold) {
      credentialHoldLog('conversations/' + conversationId, __credHold);
      return publicCredentialHold.holdResult(__credHold);
    }
  }
  const r = await icRequest(
    'post',
    'https://api.intercom.io/conversations/' + conversationId + '/reply',
    { message_type: messageType, type: 'admin', admin_id: ARSAL_ID, body: finalBody },
    messageType === 'note' ? 'NOTE' : 'OUT',
    opScope, permission
  );
  // Unknown delivery also spends the allowance: never blindly repeat a possibly
  // accepted confirmation. A proven rejection or unavailable read does not.
  if (handoff && r && (r.ok || r.unknown)) handoff.publicUsed = true;
  if (r && r.ok && !r.skipped) rememberLunaAction(conversationId, r, messageType, finalBody, undefined, previousIds);
  // A write suppressed as a replay was NOT sent. It used to be logged as "OUT 200 ok", which
  // made a silent bot look healthy in the logs.
  if (r && r.skipped) {
    console.log(messageType === 'note' ? 'NOTE_SKIPPED_REPLAY' : 'OUT_SKIPPED_REPLAY', conversationId);
  } else {
    console.log(messageType === 'note' ? 'NOTE' : 'OUT', conversationId, r.status, r.ok ? 'ok' : 'FAIL');
  }
  return r;
}

async function closeConversation(conversationId, options) {
  return withAuthorizedCommandWrite(conversationId, 'close', () => withOwnershipWriteLock(conversationId, async () => {
    let autoCloseCheck = null;
    let previousIds = null;
    const permission = async () => {
    try {
      const command = options && options.commandPartId;
      if (command) {
        const fresh = await fetchConversation(conversationId), parts = fresh && authoritativeConversationParts(fresh);
        if (!fresh || !parts) return ownershipUnavailableResult('close-ownership-unavailable');
        if (!currentAuthorizedCommand(parts, conversationId, command)) return { ok: false, skipped: true, reason: 'close-command-stale' };
        previousIds = parts.map((p) => String(p.id));
      } else {
        if (control.isPaused() || control.isAiOff(conversationId)) return { ok: false, skipped: true, reason: 'close-paused-or-ai-off' };
        const fresh = await fetchConversation(conversationId), parts = fresh && authoritativeConversationParts(fresh);
        if (!fresh || !parts) return ownershipUnavailableResult('close-ownership-unavailable');
        previousIds = parts.map((p) => String(p.id));
        const own = ownershipBoundary.evaluate(fresh, parts, ownershipOptions(conversationId));
        if (own.blocked) return { ok: false, skipped: true, reason: own.reason };
        if (options && options.automatic) {
          autoCloseCheck = shouldAutoCloseConversation(fresh);
          if (!autoCloseCheck.close) return { ok: false, skipped: true, reason: 'auto-close-no-longer-due' };
        }
        if (control.isPaused() || control.isAiOff(conversationId)) return { ok: false, skipped: true, reason: 'close-paused-or-ai-off' };
      }
    } catch (_) { return ownershipUnavailableResult('close-control-unavailable'); }
    return null;
    };
    const denied = await permission();
    if (denied) return denied;
    const result = await icRequest(
    'post',
    'https://api.intercom.io/conversations/' + conversationId + '/reply',
    { message_type: 'close', type: 'admin', admin_id: ARSAL_ID },
    'CLOSE', options && options.commandPartId ? 'command:' + options.commandPartId : undefined, permission
    );
    if (result && result.ok && !result.skipped) rememberLunaAction(conversationId, result, 'close', '', undefined, previousIds);
    return { ...result, autoCloseCheck };
  }));
}

function arsalAlreadyRepliedAfter(parts, userPart) {
  if (!userPart) return false;
  const after = Number(userPart.created_at || 0);
  for (const p of parts) {
    const a = p.author || {};
    if (String(a.id || '') !== ARSAL_ID) continue;
    // Internal notes (including ASSIST acknowledgments) are not answers to the
    // customer. Intercom may also represent a public reply as assignment/open.
    if (!['comment', 'assignment', 'open'].includes(String(p.part_type || ''))) continue;
    if (!p.body) continue;
    if (Number(p.created_at || 0) > after) return true;
  }
  return false;
}

// Prevent double client replies when Intercom delivers the same webhook twice in parallel
const clientReplyInflight = new Map();

/* BURST_RERUN_V1 — rapid customer bursts.
 * While message A is processed, a webhook for B used to be dropped ("SKIP inflight") and A's draft
 * was then discarded at the send boundary because B was newer ("stale-draft"). Nothing re-ran, so
 * neither A nor B was answered until the customer wrote again (live log: 93 inflight drops, 16
 * stale discards; reproduced in selftest-burst-rerun.js). Now a dropped event queues ONE re-run of
 * the normal handler for that conversation when the in-flight run finishes. The re-run fetches fresh
 * state and passes every existing gate (pause, aiOff, teammate ownership, already-replied dedupe,
 * send boundary), so it cannot duplicate a reply that was actually sent. Chains are bounded. */
const burstRerunPending = new Set();
const burstRerunChain = new Map(); // conversationId -> consecutive re-runs in this burst
const BURST_RERUN_MAX_CHAIN = 3;
function scheduleBurstRerun(conversationId) {
  const key = String(conversationId || '');
  if (!key || !burstRerunPending.has(key)) return;
  burstRerunPending.delete(key);
  const n = (burstRerunChain.get(key) || 0) + 1;
  if (n > BURST_RERUN_MAX_CHAIN) {
    console.log('BURST_RERUN_CAP', key, n - 1);
    burstRerunChain.delete(key);
    return;
  }
  burstRerunChain.set(key, n);
  setImmediate(() => {
    console.log('BURST_RERUN', key, 'chain', n);
    const req = { body: { topic: 'conversation.user.replied', data: { item: { id: key } } }, headers: {}, __burstRerun: true };
    const res = { sendStatus() { return this; }, status() { return this; }, json() { return this; }, send() { return this; } };
    Promise.resolve().then(() => handleWebhook(req, res)).catch((e) => console.error('BURST_RERUN_ERR', key, 'class=' + (e && e.name || 'Error')));
  });
}

function firstNameFromClient(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  // Drop junk placeholders (never greet as "Bot test")
  if (/^bot\s*test$/i.test(n)) return '';
  const part = n.split(/\s+/)[0];
  return part.replace(/[^A-Za-zÀ-ÿ'\-]/g, '') || '';
}

function arsalHasPublicClientReply(parts) {
  for (const p of parts || []) {
    const a = p.author || {};
    if (String(a.id || '') !== ARSAL_ID) continue;
    if (p.part_type === 'note') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    // assignment/close with no real client text already skipped by empty body
    return true;
  }
  return false;
}

function ensureFirstReplyWelcomeIntro(body, clientName, parts, latestClientText = '') {
  let text = String(body || '').trim();
  if (!text) return text;
  if (arsalHasPublicClientReply(parts)) return text;
  /* MICHAN_TEAMMATE_HANDOFF_V1: never inject a welcome after human teammate public reply */
  if (
    teammateHandoffGates.shouldSkipWelcomeIntro(parts, {
      arsalId: ARSAL_ID,
      eliteAiId: ELITE_AI_ID,
    })
  ) {
    return text;
  }
  text = assistantIdentityGuard.stripPersonalAlias(text);
  const first = firstNameFromClient(clientName);
  const clientText = String(latestClientText || '');
  const hasGreeting = /^(?:hello|hi|hey|ciao|salve|salam|assalam|السلام)/i.test(text);
  if (hasGreeting) return text;
  const italian = /\b(ciao|sono|aiutarti|per favore)\b/i.test(text) || /\b(?:ciao|buongiorno|salve|aiuto|aiutarmi)\b/i.test(clientText);
  if (italian) {
    const greet = first ? ('Ciao ' + first + ',') : 'Ciao,';
    return greet + '\n\n' + text.replace(/^(ciao[,\s]+)+/i, '').trim();
  }
  if (/[\u0600-\u06ff]/.test(clientText)) return (first ? ('السلام علیکم ' + first + '،') : 'السلام علیکم،') + '\n\n' + text;
  if (/\b(?:kya|aap|ap|tum|mujhe|madad|salam)\b/i.test(clientText)) return (first ? ('Salam ' + first + ',') : 'Salam,') + '\n\n' + text;
  const greet = first ? ('Hello ' + first + ',') : 'Hello,';
  let rest = text.replace(/^(hello|hi|hey)[,\s]+[A-Za-zÀ-ÿ'\-]*[,\s]*/i, '').trim();
  if (!rest) rest = text;
  return greet + '\n\n' + rest;
}

// Per-conversation send serialization. The already-replied check inside re-fetches the
// conversation, but two CONCURRENT callers both fetch before either sends, so neither sees
// the other's reply and both post (demonstrated by selftest-replay-sideeffects.js:3).
// clientReplyInflight only guards the webhook entry point, so a poller racing a webhook was
// unprotected. Serializing per conversation makes the second caller re-fetch AFTER the first
// send, so the existing dedupe does its job. Legitimate retries still run - they are
// serialized, not dropped.
const clientSendLocks = new Map();

async function postClientCommentOnce(conversationId, body, userPart, clientName, replyContext) {
  const lockKey = String(conversationId);
  const prev = clientSendLocks.get(lockKey) || Promise.resolve();
  const run = prev
    .catch(() => {})
    .then(() => postClientCommentOnceInner(conversationId, body, userPart, clientName, replyContext));
  const settled = run.then(() => {}, () => {});
  clientSendLocks.set(lockKey, settled);
  settled.then(() => {
    if (clientSendLocks.get(lockKey) === settled) clientSendLocks.delete(lockKey);
  });
  return run;
}

async function postClientCommentOnceInner(conversationId, body, userPart, clientName, replyContext) {
  // Section G review links are sent only by the deterministic review flow (postReply).
  // A model draft that appends them early, or twice, is stripped here.
  const strippedReview = reviewRequestFlow.stripUnsolicitedReviewAsk(body, userPart && userPart.body ? stripHtml(String(userPart.body)) : '');
  if (strippedReview !== body) {
    console.log('REVIEW_FLOW strip unsolicited model review', conversationId);
    body = strippedReview;
  }
  if (!String(body || '').trim()) {
    console.log('REVIEW_FLOW stripped review left empty', conversationId);
    return null;
  }
  /* MT5_CONTAINMENT_V1:BEGIN */
  // The spread template is its own approved send from the persisted state machine.
  // It is not appended onto another body, and it is not flushed from a map.
  // A credential in this body is a transport hold with a reason code. Returning null here
  // dropped the send with no hold code and no staff note.
  /* MT5_CONTAINMENT_V1:END */
  if (septemberPromos && typeof septemberPromos.stripCheckoutReportForCustomer === 'function') {
    const strippedReport = septemberPromos.stripCheckoutReportForCustomer(body);
    if (strippedReport !== String(body || '')) {
      console.log('PROMO_CLIENT_REPORT_STRIPPED', conversationId);
      body = strippedReport;
    }
  }
  if (!String(body || '').trim()) {
    console.error('PROMO_CLIENT_REPORT_HOLD', conversationId);
    return null;
  }
  const __spreadTemplateSend = __spreadSquash(String(body || '')).includes(__spreadSquash(SPREAD_TEST_REPLY));
  let gate = await checkSendBoundary(conversationId, userPart, clientName, { spreadTemplate: __spreadTemplateSend });
  if (!gate.ok) {
    console.log('SKIP pre-send', gate.why, conversationId);
    return null;
  }
  let parts = gate.parts;
  const priorClientTexts = userPart ? parts
    .filter((p) => String((p.author || {}).id || '') === String((userPart.author || {}).id || '') &&
      Number(p.created_at || 0) < Number(userPart.created_at || 0))
    .map((p) => stripHtml(p.body || '')) : [];
  const priorBotTexts = userPart ? parts
    .filter((p) => String((p.author || {}).id || '') === ARSAL_ID && p.part_type !== 'note' &&
      Number(p.created_at || 0) < Number(userPart.created_at || 0))
    .map((p) => stripHtml(p.body || '')) : [];
  const latestClientText = userPart ? stripHtml(userPart.body || '') : '';
  let identitySafeBody = assistantIdentityGuard.enforceAssistantIdentityReply(
    latestClientText, body, conversationId, priorBotTexts
  );
  if (identitySafeBody !== body) console.log('ASSISTANT_IDENTITY_GUARD', conversationId);
  // WRONG_AUDIENCE_STAFF_GREETING_V1 (215476244301144): never "Hello Jerry," to a client.
  try {
    const freshConv = gate.fresh || {};
    const assigneeId = String(freshConv.admin_assignee_id || '');
    const srcAuth = (freshConv.source && freshConv.source.author) || {};
    let assigneeFirstName = '';
    if (
      assigneeId &&
      String(srcAuth.type || '') === 'admin' &&
      String(srcAuth.id || '') === assigneeId
    ) {
      assigneeFirstName = String(srcAuth.name || '').split(/\s+/)[0] || '';
    }
    const scrubbed = teammateHandoffGates.scrubWrongAudienceStaffGreeting(
      identitySafeBody,
      clientName,
      { assigneeFirstName }
    );
    if (scrubbed && scrubbed.rewritten) {
      console.log('WRONG_AUDIENCE_STAFF_GREETING_SCRUB', conversationId);
      identitySafeBody = scrubbed.text;
    }
  } catch (_) {}
  if (
    (replyContext && replyContext.intent
      ? replyContext.intent.kind === 'general-faq'
      : isGeneralPolicyQuestion(latestClientText)) &&
    typeof assistantIdentityGuard.stripUnneededIdentityAsk === 'function'
  ) {
    const stripped = assistantIdentityGuard.stripUnneededIdentityAsk(latestClientText, identitySafeBody);
    if (stripped !== identitySafeBody) {
      console.log('POLICY_IDENTITY_STRIP', conversationId);
      identitySafeBody = stripped;
    }
  }
  const smalltalkSafeBody = fixSmalltalkDecline(latestClientText, identitySafeBody, priorBotTexts);
  if (smalltalkSafeBody !== identitySafeBody) console.log('SMALLTALK_DECLINE_FIXED', conversationId);
  const guardedBody = challengeVariantGuard.clarifyProductVariantReply(
    latestClientText, priorClientTexts, smalltalkSafeBody, priorBotTexts, conversationId
  );
  if (guardedBody !== smalltalkSafeBody) console.log('PRODUCT_VARIANT_CLARIFICATION', conversationId);
  // After product-family variant ask / dual overview, "both" / difference / compare /
  // between them / dono / farq must answer BOTH variants — never SCOPE_DECLINE
  // (live 215476025058340 Instant + 2-Step).
  let bothBody = challengeVariantGuard.resolveBothVariantsReply(
    latestClientText, priorBotTexts, guardedBody, conversationId
  );
  if (bothBody !== guardedBody) {
    console.log('PRODUCT_BOTH_VARIANTS', conversationId);
    // BOTH_FAMILY_FROM_CLIENT_V1 safety: if the rewrite drifted to a different product
    // family than the client named (e.g. Instant ask → 2-Step canned), keep the draft.
    try {
      const __named = typeof challengeVariantGuard.familyNamedInClientText === 'function'
        ? challengeVariantGuard.familyNamedInClientText(latestClientText)
        : null;
      if (__named && __named.id === 'instant') {
        const __rewrittenTo2Step = /2[\s-]*step\s+lite/i.test(String(bothBody || '')) &&
          /free[\s-]*retry/i.test(String(bothBody || '')) &&
          !/instant\s*elite/i.test(String(bothBody || ''));
        const __draftHadInstant = /instant\s*elite/i.test(String(guardedBody || '')) &&
          /\binstant\b(?!\s*elite)/i.test(String(guardedBody || ''));
        if (__rewrittenTo2Step && (__draftHadInstant || /instant\s*elite/i.test(String(latestClientText || '')))) {
          console.log('PRODUCT_BOTH_FAMILY_MISMATCH_REVERT', conversationId, 'instant');
          bothBody = guardedBody;
        }
      }
      if (__named && __named.id === '2_step') {
        const __rewrittenToInstant = /instant\s*elite/i.test(String(bothBody || '')) &&
          !/2[\s-]*step/i.test(String(bothBody || ''));
        if (__rewrittenToInstant) {
          console.log('PRODUCT_BOTH_FAMILY_MISMATCH_REVERT', conversationId, '2_step');
          bothBody = guardedBody;
        }
      }
    } catch (e) {
      console.error('PRODUCT_BOTH_FAMILY_GUARD_ERR', conversationId, 'class=' + (e && e.name || 'Error'));
    }
  }
  // Inherited product-thread anaphora must never leave a scope-decline template in the
  // client-facing body (choice follow-ups like "elite" / "the first one" do not use BOTH).
  let __scopeSafeBody = bothBody;
  if (
    challengeVariantGuard.shouldInheritProductFaqScope(latestClientText, priorBotTexts) &&
    /FundedElite topics are all I can cover|Not something I can cover|outside what I can help|I can'?t help with that one|\[\[SCOPE_DECLINE\]\]/i.test(String(__scopeSafeBody || ''))
  ) {
    __scopeSafeBody = challengeVariantGuard.isBothVariantsClientReply(latestClientText)
      ? challengeVariantGuard.resolveBothVariantsReply(latestClientText, priorBotTexts, '', conversationId)
      : (regenModule().CLARIFY_REPLY || bothBody);
    console.log('PRODUCT_ANAPHORA_STRIP_DECLINE', conversationId);
  }
  let finalBody = ensureFirstReplyWelcomeIntro(__scopeSafeBody, clientName, parts, latestClientText);
  const previousBot = priorBotTexts.slice(-1)[0] || '';
  const repeatedQuestion = userPart && isRepeatedClientQuestion(stripHtml(userPart.body || ''), priorClientTexts);
  if (repeatedQuestion && guardedBody === body && previousBot &&
      (repeatTextUtils.normalize(previousBot) === repeatTextUtils.normalize(finalBody) ||
       nearCopiedWording(previousBot, finalBody))) {
    try {
      const __repeatEpisode = lunaEpisode.current(conversationId);
      const ai = await lunaModel.create(openai, {
        model: control.getModel(),
        ...modelConfig.answerParams({
          tools: false, purpose: 'reply.repeated-question-rephrase',
          conversationId, episode: __repeatEpisode, phase: 'regeneration',
        }),
        conversationId,
        episode: __repeatEpisode,
        messages: [
          { role: 'system', content: control.getPrompt() },
          { role: 'user', content: 'The client repeated this question: ' + stripHtml(userPart.body || '') +
            '\n\nApproved answer to preserve exactly in meaning, facts, numbers, eligibility, and policy:\n' + finalBody +
            '\n\nBriefly acknowledge and explain it in new natural wording. Do not add or remove any rule or next step. Output only the client-facing reply.' },
        ],
      });
      const raw = ((((ai.choices[0] || {}).message || {}).content) || '').trim();
      const parsed = parseAction(raw);
      const candidate = postProcessModelReply(/^\s*ACTION\s*:/i.test(raw) ? (parsed.action === 'REPLY' ? parsed.body : '') : raw, conversationId);
      if (candidate && protectedFactsMatch(finalBody, candidate) &&
          repeatTextUtils.normalize(previousBot) !== repeatTextUtils.normalize(candidate) &&
          !nearCopiedWording(previousBot, candidate)) finalBody = candidate;
      else { console.log('REPEATED_DIRECT_REPLY_HELD', conversationId); return null; }
    } catch (e) { console.error('REPEATED_DIRECT_REPLY_RETRY_FAILED', conversationId, 'class=' + (e && e.name || 'Error')); return null; }
    gate = await checkSendBoundary(conversationId, userPart, clientName);
    if (!gate.ok) {
      console.log('SKIP post-rephrase', gate.why, conversationId);
      return null;
    }
    parts = gate.parts;
  }
  // MANDATORY FINAL-PAYLOAD VALIDATION.
  // Re-check the exact customer bytes with FAQ evidence retained. Facts, conditions,
  // action truth and privacy stay mandatory after any later model call.
  {
    const MANDATORY = new Set([
      'INTERNAL_INFO_LEAK', 'UNSUPPORTED_PROMISE', 'EMPTY_REPLY',
      'UNSUPPORTED_NUMBER', 'UNSUPPORTED_FACT', 'FORBIDDEN_DIAGNOSTIC_ACTION',
      'KNOWLEDGE_GAP_UNSAFE',
    ]);
    // If presend already approved these exact public words against the exact
    // evidence supplied to the model, the final boundary checks only effects
    // introduced after that approval. This removes the duplicate factual audit
    // that replaced supported drafts after a fresh, different retrieval.
    const previouslyApproved = !!(replyContext && replyContext.presendOk &&
      String(replyContext.approvedBody || '').trim() === String(finalBody || '').trim());
    let __lastPostgateFails = [];
    const verdict = async (text) => {
      try {
        const built = __statePresend.buildState(conversationId, parts, userPart);
        let knowledge = null;
        if (replyContext && Array.isArray(replyContext.knowledge) && replyContext.knowledge.length) {
          // The model and presend saw this exact approved evidence. A second retrieval
          // against raw wording previously produced different top articles and falsely
          // rejected a supported answer at the final boundary.
          knowledge = __statePresend.modules.gapGate.classify(
            replyContext.knowledge,
            (replyContext.intent && replyContext.intent.knowledgeQuery) || latestClientText
          );
        } else if (faqKb && typeof faqKb.retrieveOfficialFaqContext === 'function' && latestClientText &&
            // SMALLTALK_COURTESY_V1: a pure courtesy turn has no facts to ground, so no KB search here either; the
            // content checks still run with no evidence (any stated figure/fact is then unsupported and held).
            !(replyContext && replyContext.socialOnly) && !isGreetingOrSmallTalk(latestClientText)) {
          try {
            // Exactly the evidence the model was given, via the shared helper.
            // PENDING_ASK_RESOLVE_V1: a nudge is checked against the evidence for the question it points
            // at; retrieving for "hello?? tell me" found nothing and every grounded fact in the answer
            // was judged unsupported (real-model replay of live 215476072310759).
            let __evText = (replyContext && replyContext.intent && replyContext.intent.knowledgeQuery) || latestClientText;
            if (!(replyContext && replyContext.intent)) {
              try { __evText = resolvePendingAsk(parts, latestClientText) || latestClientText; } catch (_) { __evText = latestClientText; }
            }
            const hit = await retrieveApprovedEvidence(faqKb, __evText, { live: false });
            if (hit && hit.block) {
              knowledge = __statePresend.modules.gapGate.classify(
                [{ title: 'Official FAQ', text: hit.block, score: 0.72, source: hit.from || 'faq-kb' }],
                __evText
              );
            }
          } catch (_) { /* local evidence only; fail the content checks we can still run */ }
        }
        // COMPARISON_POSTGATE_SCOPE_V1 (2026-09-28): the same scoped resolution presend applies
        // (statePresend.js "comparison source conflict resolved by scoped canonical table"): a comparison can hold
        // two product values plus a retry-stage value; the generic conflict scanner has no product/stage columns.
        // Only for a body the canonical comparison table fully validates. Without this, a comparison presend had
        // approved was suppressed here as UNSUPPORTED_FACT with no safe stock line - silence.
        if (knowledge && knowledge.level === 'conflicting' && replyContext && replyContext.comparison) {
          try {
            if (productComparison.assess(replyContext.comparison, text).ok) {
              knowledge = { ...knowledge, level: 'supported', comparisonResolvedConflict: true };
              console.log('POSTGATE_COMPARISON_CONFLICT_RESOLVED', conversationId);
            }
          } catch (_) { /* keep the conflict verdict on any table failure */ }
        }
        const res = __statePresend.modules.presend.validate(text, {
          state: built.state,
          messages: built.messages,
          knowledge,
          route: 'FULL',
          guards: __statePresend.guards,
          conversationId,
        });
        __lastPostgateFails = (res.hardFails || []).filter((f) => f && MANDATORY.has(f.code) &&
          !(previouslyApproved && ['UNSUPPORTED_NUMBER', 'UNSUPPORTED_FACT', 'KNOWLEDGE_GAP_UNSAFE'].includes(f.code)));
        return __lastPostgateFails.map((f) => f.code);
      } catch (e) {
        console.error('POSTGATE_REVALIDATE_ERROR', conversationId, 'class=' + (e && e.name || 'Error'));
        return ['REVALIDATE_ERROR'];
      }
    };

    let hits = await verdict(finalBody);
    // PROMISE_STRIP_V1: when the only mandatory failure is an unsupported promise, drop that sentence and
    // re-check, instead of replacing a supported answer with a stock line.
    if (hits.length && hits.every((c) => c === 'UNSUPPORTED_PROMISE')) {
      try {
        const __ps = regenModule().stripPromiseSentences(finalBody, __lastPostgateFails);
        if (__ps) {
          const __psHits = await verdict(__ps);
          if (!__psHits.length) {
            console.log('POSTGATE_PROMISE_STRIPPED', conversationId);
            finalBody = __ps;
            hits = [];
          }
        }
      } catch (e) { console.error('POSTGATE_PROMISE_STRIP_ERROR', conversationId, 'class=' + (e && e.name || 'Error')); }
    }
    if (hits.length) {
      const fallback = identitySafeBody;
      const fbHits = fallback && fallback !== finalBody ? await verdict(fallback) : hits;
      if (fbHits.length) {
        console.log('POSTGATE_SUPPRESSED', conversationId, 'candidate=' + hits.join(',') + ' fallback=' + fbHits.join(','));
        // POSTGATE_DIAG_V1: which check fired and on what (validator detail only: a figure or a phrase, no transcript).
        try { console.log('POSTGATE_FAIL_DETAIL', conversationId, JSON.stringify(__lastPostgateFails.map((f) => [f.code, logLen(f.detail)]))); } catch (_) {}
        // Live silence on 215476039051125: both candidate and identity fallback failed
        // mandatory postgate -> return null left the client unanswered. Prefer a
        // number-free stock line that itself passes the same revalidation.
        let safe = '';
        try {
          const regen = regenModule();
          // Ticket 215476044350495: never stock a fake checking-stall.
          // Clear FAQ-style asks: stay quiet here (upstream hold/escalate owns them).
          let substantialAsk = false;
          try {
            const TU = require('./statePresend/textUtils');
            substantialAsk = !!(TU.isSubstantialClearQuestion && TU.isSubstantialClearQuestion(latestClientText));
            // A contextual or explicit support question must not be replaced by the
            // generic "tell me more" line when a draft fails a validator.
            try {
              if (!substantialAsk && require('./statePresend/turnIntent').avoidsGenericClarify(replyContext && replyContext.intent, latestClientText)) substantialAsk = true;
            } catch (_) { /* keep the substantial-ask result */ }
          } catch (_) {}
          const candidates = substantialAsk
            ? []
            : [
            regen && regen.CLARIFY_REPLY,
            regen && regen.NUDGE_REPLY,
            "I'm here. Which FundedElite rule should I cover first?",
              ].filter((x) => x && String(x).trim());
          for (const c of candidates) {
            const cHits = await verdict(c);
            if (!cHits.length) { safe = String(c); break; }
          }
        } catch (e) {
          console.error('POSTGATE_SAFE_FALLBACK_ERROR', conversationId, 'class=' + (e && e.name || 'Error'));
        }
        if (!safe) {
          console.log('POSTGATE_SUPPRESSED quiet (no safe stock line)', conversationId);
          return null;
        }
        console.log('POSTGATE_SAFE_STOCK', conversationId);
        finalBody = safe;
      } else {
        console.log('POSTGATE_REVALIDATE_FELLBACK', conversationId, hits.join(','));
        finalBody = fallback;
      }
    }
  }

  gate = await checkSendBoundary(conversationId, userPart, clientName);
  if (!gate.ok) {
    console.log('SKIP final-boundary', gate.why, conversationId);
    return null;
  }

  // Soft dedupe AFTER identity/smalltalk/2-step guards so a stock CLARIFY_REPLY can still
  // become a fresh 2-Step Lite / Free Retry clarification (live silence on 215476025058340:
  // identical skip ran before challengeVariantGuard and swallowed the FAQ).
  try {
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const want = norm(finalBody);
    if (want) {
      for (let i = (parts || []).length - 1; i >= 0; i--) {
        const p = parts[i];
        if (!p || String(p.part_type || '') === 'note') continue;
        const a = p.author || {};
        if (String(a.id || '') !== ARSAL_ID && a.type !== 'bot') continue;
        const last = norm(stripHtml(p.body || ''));
        if (!last) continue;
        // The contained spread reply is the same text on purpose. A bare follow-up
        // ("send again", "the login", "investor password") must deliver it again.
        let __offeredResend = false;
        try { __offeredResend = require('./spreadTestState').load(conversationId).state === 'offered'; } catch (_) { __offeredResend = false; }
        const __resendSpread = __spreadSquash(finalBody).includes(__spreadSquash(SPREAD_TEST_REPLY))
          && (__offeredResend
            || (__spreadAskGate && typeof __spreadAskGate.isBareSpreadFollowUpAsk === 'function'
              && __spreadAskGate.isBareSpreadFollowUpAsk(stripHtml((userPart && userPart.body) || ''))));
        if (last === want && !__resendSpread) {
          console.log('SKIP identical last public body', conversationId);
          return null;
        }
        break;
      }
    }
  } catch (e) {
    console.error('identical-body dedupe fail', conversationId, 'class=' + (e && e.name || 'Error'));
  }

  // HANDOFF_CLAIM_GATE_V2 final send gate: re-check this turn's note/assign facts and
  // current ownership. A claim that is not proven is removed, including dependent promises.
  try {
    const gated = applyTrustedHandoffGate(finalBody, conversationId, 'send', gate && gate.fresh);
    if (gated.stripped) {
      finalBody = gated.text;
      if (!String(finalBody || '').trim()) {
        console.log('HANDOFF_CLAIM_GATE send-blocked empty after strip', conversationId);
        return null;
      }
    }
  } catch (_) {}

  try {
    const __restated = publicRestatementGuard.assess(finalBody, latestClientText);
    if (__restated.fail) {
      console.log('PUBLIC_RESTATEMENT_SEND_BLOCKED', conversationId, __restated.reason || '');
      return null;
    }
  } catch (e) {
    console.error('PUBLIC_RESTATEMENT_SEND_CHECK_FAIL', conversationId, 'class=' + (e && e.name || 'Error'));
  }

  if (!faqAssistance.current(conversationId) && replyContext && replyContext.intent && replyContext.intent.kind === 'general-faq') {
    let fresh;try {fresh=await fetchConversation(conversationId);}catch(_){return ownershipUnavailableResult('faq-adopt-source-unavailable');}
    const freshParts=fresh&&authoritativeConversationParts(fresh);
    if(!freshParts)return ownershipUnavailableResult('faq-adopt-history-unavailable');
    if(ownershipBoundary.evaluate(fresh,freshParts,ownershipOptions(conversationId)).blocked || fresh.team_assignee_id) {
      const adopted=await faqAssistance.adopt(fresh,freshParts,userPart,finalBody,faqAssistanceDeps(),{...replyContext,approvedBody:ensureFirstReplyWelcomeIntro(replyContext.approvedBody,clientName,parts,latestClientText)});
      return adopted&&adopted.result||null;
    }
  }
  try {
    const __nameBoundary = require('./publicWriteBoundary');
    const __nameTurn = __nameBoundary.currentTurn() || {};
    const __first = firstNameFromClient(clientName);
    const next = { ...__nameTurn };
    if (__first) next.expectedFirstName = __first;
    if (!next.text && latestClientText) next.text = latestClientText;
    if (!next.normalized && (next.text || latestClientText)) {
      next.normalized = require('./routeNormalizer').normalizeForRoute(next.text || latestClientText);
    }
    if (!next.conversationId) next.conversationId = String(conversationId || '');
    if (!next.eventId && userPart && userPart.id) next.eventId = String(userPart.id);
    if (!next.eventAt && userPart && userPart.created_at) next.eventAt = Number(userPart.created_at);
    __nameBoundary.bindTurn(next);
  } catch (_) {}
  const __posted = await postReply(conversationId, 'comment', finalBody, userPart && userPart.id ? 'turn:' + userPart.id : undefined);
  return __posted;
}

// Authorized note-command authors come exclusively from bot-teammate-admins.json via
// teammateAdmins.js. The separate capabilities file may describe backend/payout abilities,
// but it never grants note-command authority. Non-human/shared seats remain excluded:
// Elite AI 8052954, Risk Team 11128191,
// teamfutureselite seats 11128310/11370955, company shell Fundedelite 8052557.
// (SAQII 8089069 / Brian 9379207 stay excluded — never-mention / shared seats.)
// Authorization moved to teammateAdmins.js so access can be granted or revoked by editing a
// config file instead of core logic. Membership is still by VERIFIED Intercom admin id, and the
// module fails closed on a malformed or empty config. The `.has()` shape is kept so every
// existing call site and test continues to work unchanged.
const AUTHORIZED_NOTE_ADMIN_IDS = {
  has: (authorId) => teammateAdmins.isAuthorizedAdminId(authorId),
  get size() { return teammateAdmins.size(); },
};
teammateAdmins.validateAtStartup();

function noteBodyMentionsAuthorized(htmlOrText) {
  // Luna listens ONLY when she herself is addressed (@Arsal / Arsal entity mention).
  // A note that only @Jerry's Jerry is for Jerry — do not FOLLOW / command on it.
  const s = String(htmlOrText || '');
  if (/admin\/10118526\b/i.test(s)) return true;
  if (/entity_mention[^>]*>\s*[^<]*Arsal\b/i.test(s)) return true;
  if (/entity_mention[^>]*>\s*[^<]*Luna\b/i.test(s)) return true;
  const plain = stripHtml(s);
  if (/(^|[^a-z])@arsal\b/i.test(plain)) return true;
  if (/(^|[^a-z])@luna\b/i.test(plain)) return true;
  if (/\bluna\b/i.test(plain) && continuousOwnership.isAssistInstruction(plain)) return true;
  // Plain "Arsal" with an @ elsewhere still counts (e.g. "@Arsal please..."); Jerry-only does not.
  if (/\barsal\b/i.test(plain) && /@/.test(plain) && /(^|[^a-z])@arsal\b/i.test(plain)) return true;
  return false;
}

function continuousOwnershipOf(parts) {
  return continuousOwnership.resolve(parts, {
    arsalId: ARSAL_ID, eliteAiId: ELITE_AI_ID,
    isAuthorizedAdmin: (id) => AUTHORIZED_NOTE_ADMIN_IDS.has(id),
    mentionsLuna: noteBodyMentionsAuthorized,
  });
}

const AUTH_ACK_MARK = '[bot-ack] ';

function isEscalateOrSystemNote(plain) {
  const t = String(plain || '');
  // Bot-built escalate notes (posted as Arsal) must never become FOLLOW commands
  if (/\bAccount\s*:/i.test(t) && /\bEmail\s*:/i.test(t) && /\bProblem\s*:/i.test(t)) return true;
  if (/\bAction needed\s*:/i.test(t) && /\bIf remains unsolved\s*:/i.test(t)) return true;
  // New format (2026-09-22): Problem + Email + Action needed (Account optional; no Jerry / unsolved line)
  if (/\bProblem\s*:/i.test(t) && /\bEmail\s*:/i.test(t) && /\bAction needed\s*:/i.test(t)) return true;
  // NOTE_FORMAT_V1: Account/Email/Problem/Action/Note — still a Luna-built escalate note.
  if (/\bProblem:\s*<b>/i.test(t) && /Account:/i.test(t)) return true;
  if (/<b>Account:<\/b>/i.test(t) && /<b>Note:<\/b>/i.test(t) && /Escalations inbox/i.test(t)) return true;
  return false;
}

function isBotAuthConfirmNote(plain) {
  const t = String(plain || '').trim();
  if (!t) return true;
  if (/^\[bot-ack\]/i.test(t)) return true;
  if (/^sent to client\b/i.test(t)) return true;
  if (/^✓\s/u.test(t)) return true;
  // Any of our ack openers , never re-handle (stops note loops)
  if (/^(okay|understood|got it|noted|sure|done|yes)\b/i.test(t)) return true;
  if (/^here\b/i.test(t)) return true;
  if (/\bi'?ll\s+(follow|continue|stop|pause|resume|keep|act)\b/i.test(t)) return true;
  if (/\bi'?m\s+(back|here|on it)\b/i.test(t)) return true;
  return false;
}

function stripOwnerMentionPrefix(plain) {
  // STOP_MENTION_STRIP_V1: any '@Name', 'Name - Role', several mentions (continuousOwnership).
  try { return continuousOwnership.stripAdminMentions(plain); } catch (_) {
    return String(plain || '').replace(/^(?:\s*(?:@\S+|arsal|jerry(?:\s*-?\s*manager)?))+\s*/i, '').trim();
  }
}

/** Owner "send this message to client [ ... ]" , deterministic REPLY body (exact bracket/quote text, light trim). */
function polishOwnerDictatedClientBody(s) {
  let t = String(s || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}

function extractOwnerSendToClientBody(plain) {
  const raw = String(plain || '');
  const stripped = typeof stripOwnerMentionPrefix === 'function' ? stripOwnerMentionPrefix(raw) : raw;
  const hay = stripped + '\n' + raw;
  if (!/send\s+(?:this\s+)?(?:message|reply|this)\s+to\s+(?:the\s+)?client/i.test(hay)) {
    return null;
  }
  let m = raw.match(/\[([^\]]+)\]/);
  if (m && String(m[1] || '').trim()) {
    return polishOwnerDictatedClientBody(String(m[1]).trim());
  }
  m = raw.match(/["\u201C]([^"\u201D]+)["\u201D]/) || raw.match(/'([^']+)'/);
  if (m && String(m[1] || '').trim()) {
    return polishOwnerDictatedClientBody(String(m[1]).trim());
  }
  return null;
}

function parseAuthorizedNoteCommand(plain, opts) {
  const raw = String(plain || '').trim();
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t || isBotAuthConfirmNote(t)) return null;
  if (isEscalateOrSystemNote(t)) return null;

  // Structured REPLY: / NOTE: (after optional @mentions) , prefer before soft RESUME "reply now"
  const stripped = stripOwnerMentionPrefix(raw);
  let sm = stripped.match(/^REPLY\s*[:\-]\s*([\s\S]+)/i);
  if (sm && String(sm[1] || '').trim()) {
    return { cmd: 'REPLY', body: String(sm[1]).trim() };
  }
  sm = stripped.match(/^NOTE\s*[:\-]\s*([\s\S]+)/i);
  if (sm && String(sm[1] || '').trim()) {
    return { cmd: 'NOTE', body: String(sm[1]).trim() };
  }
  // Deterministic: send this message to client [ ... ] / quotes → REPLY (before please→FOLLOW)
  const sendBody = extractOwnerSendToClientBody(raw);
  if (sendBody) {
    return { cmd: 'REPLY', body: sendBody };
  }
  if (/^(?:SKIP)\b/i.test(stripped) || /\bskip\s+(this|the)\s+(ticket|one|message|chat)\b/i.test(t)) {
    return { cmd: 'SKIP', body: '' };
  }
  if (continuousOwnership.isStopInstruction(t)) return { cmd: 'STOP', body: '' };
  if (
    /\b(re-?open|open)\b.+\b(ticket|chat|conversation)\b/i.test(t) ||
    /\b(re-?open|open)\s+(this|it)\b/i.test(t)
  ) {
    return { cmd: 'OPEN', body: '' };
  }
  if (continuousOwnership.isAssistInstruction(t)) return { cmd: 'ASSIST', body: '' };

  // A bare operational verb after the authorized Luna mention is an explicit
  // command, just as bare STOP/OFF are. This remains behind author+mention checks.
  if (/^(?:reply|respond|answer|resume|unpause|unmute)[.!]*$/i.test(stripped)) {
    return { cmd: 'RESUME', body: '' };
  }

  if (
    /\b(resume|unpause|bot\s*on|ai\s*on|start\s+replying|keep\s+replying|keep\s+replyin|re-?enable\s+replies)\b/i.test(t) ||
    /\byou\s+can\s+reply\s+now\b/i.test(t) ||
    /\b(please\s+)?reply\s+now\b/i.test(t) ||
    /\breply\s+to\s+(?:the\s+)?(?:ticket|chat|conversation|client)\b/i.test(t) ||
    /\byou\s+may\s+reply\b/i.test(t) ||
    /\bcontinue\s+replying\b/i.test(t) ||
    /\bcontinue\s+to\s+assist\b/i.test(t) ||
    /\b(can|may)\s+continue\s+to\s+assist\b/i.test(t) ||
    /\bassist\s+this\s+client\b/i.test(t) ||
    /\bkeep\s+(helping|assisting)\b/i.test(t) ||
    /\bturn\s+(the\s+)?(bot|ai|replies)\s+on\b/i.test(t) ||
    /\bunmute\b/i.test(t)
  ) {
    return { cmd: 'RESUME', body: '' };
  }
  if (/\b(close)\b.+\b(ticket|chat|conversation)\b/i.test(t) || /\bclose\s+(this|it)\b/i.test(t)) {
    return { cmd: 'CLOSE', body: '' };
  }
  if (
    /\b(stop|pause|don'?t|do\s+not|never)\b.+\b(reply|replies|respond|responses|answering)\b/i.test(t) ||
    /\b(bot\s*off|ai\s*off|stay\s+silent|go\s+silent|silence\s+here|no\s+more\s+replies)\b/i.test(t) ||
    /\b(stop\s+replying|pause\s+responses?|don'?t\s+reply)\b/i.test(t) ||
    /* AUDIT_HARDEN_V1:botStop */
    /\bbot\s+please\s+stop\b/i.test(t) ||
    /\bplease\s+stop\s+(the\s+)?(bot|ai|replies|replying)\b/i.test(t) ||
    /\b(stop|pause)\s+(the\s+)?(bot|ai)\b/i.test(t) ||
    /\b(arsal|jerry)\s+stop\b/i.test(t) ||
    /\bbot\s+stop\b/i.test(t) ||
    /^(?:STOP|OFF)\b/i.test(stripped)
  ) {
    return { cmd: 'STOP', body: '' };
  }
  if (/\bare\s+you\s+there\b/i.test(t) || /\byou\s+there\??/i.test(t) || /\bping\b/i.test(t)) {
    return { cmd: 'PING', body: '' };
  }
  // Explicit instruction tone → flexible owner command
  if (
    /\b(please|pls)\b/i.test(t) ||
    /\b(make\s+sure|prioritize|assign|snooze|tag|forward|escalate)\b/i.test(t) ||
    /\byou\s+(should|must|need\s+to)\b/i.test(t)
  ) {
    return { cmd: 'FOLLOW', body: '' };
  }
  // FOLLOW only when the note @mentions Arsal (Luna) AND has substance. @Jerry-only is not a Luna command.
  // Casual Arsal/Jerry notes WITHOUT a mention must be ignored (no auto "Okay, noted").
  // A teammate FYI or "Arsal is in this chat" is not a command and must not create a note.
  if (tradingStagePolicy.isNonActionableTeammateNote(t)) return null;
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

const OWNER_CMD_ACTION_RE =
  /ACTION:\s*(REPLY|NOTE|CLOSE|OPEN|SKIP|STOP|RESUME|NOOP|CLARIFY)\b/i;

function parseOwnerCommandAction(raw) {
  const text = String(raw || '').trim();
  const m = text.match(/ACTION:\s*(REPLY|NOTE|CLOSE|OPEN|SKIP|STOP|RESUME|NOOP|CLARIFY)\s*[\r\n]+([\s\S]*)/i);
  if (m) {
    const action = String(m[1] || '').toUpperCase();
    let rest = String(m[2] || '').trim();
    const bm = rest.match(/^BODY:\s*([\s\S]*?)(?=\nACTION\s*:|$)/i);
    let body = bm ? String(bm[1] || '').trim() : rest.replace(/^BODY:\s*/i, '').trim();
    body = stripActionLeak(body);
    return { action, body };
  }
  const cleaned = stripActionLeak(
    text.replace(/^ACTION:\s*\w+\s*/i, '').replace(/^BODY:\s*/i, '').trim()
  );
  return { action: 'NOTE', body: cleaned || 'Okay, noted.' };
}

async function openConversation(conversationId) {
  return withAuthorizedCommandWrite(conversationId, 'open', () => withOwnershipWriteLock(conversationId, async () => {
    const command = authorizedCommandContext.getStore();
    const permission = async () => {
      let fresh;
      try { fresh = await fetchConversation(conversationId); } catch (_) { fresh = null; }
      const parts = fresh && authoritativeConversationParts(fresh);
      if (!fresh || !parts) return ownershipUnavailableResult('open-ownership-unavailable');
      if (!command || !currentAuthorizedCommand(parts, conversationId, command.partId)) return { ok: false, skipped: true, reason: 'open-command-stale' };
      return null;
    };
    const denied = await permission();
    if (denied) return denied;
    return icRequest('post', 'https://api.intercom.io/conversations/' + conversationId + '/reply',
      { message_type: 'open', type: 'admin', admin_id: ARSAL_ID }, 'OPEN', 'command:' + command.partId, permission);
  }));
}

const OWNER_CMD_SYSTEM_OVERLAY = [
  'AUTHORIZED TEAMMATE DIRECT COMMAND , HIGHEST PRIORITY',
  'You are executing a direct instruction from an authorized teammate (Arsal, Jerry, or support teammate) on this Intercom ticket.',
  'Understand intent (not exact phrases). me/my/I/Arsal/owner = the owner when context is clear.',
  'Latest direct authorized-teammate instruction overrides older workflow for this situation.',
  'Still never invent FundedElite facts. Do not @mention forbidden seats in notes.',
  'Do not use client-visible MT5 wording unless the locked spread-test template applies, or an authorized teammate explicitly demands that wording.',
  'Escalations/Risk are normally silent note-only; if an authorized teammate explicitly orders a public client reply on THIS ticket, honor it.',
  'INTERNAL NOTES ALWAYS ENGLISH: NOTE / CLARIFY / auth-confirm style BODY text must be English only , never Roman Urdu, Urdu, or Italian for notes. Client REPLY language still follows existing client-language locks.',
  'Choose exactly one ACTION. Prefer NOTE for internal-only asks (summarize, analyze, explain to owner). Prefer REPLY only when they want the client messaged.',
  'When an authorized teammate asks to mention someone and have them reply (e.g. "mention Anjsha and ask him to reply"), prefer ACTION: NOTE with BODY that starts with @TeammateName so the bot can post a real Intercom entity_mention (example BODY: "@Anjsha Please reply on this ticket."). Do not @mention forbidden seats (Jerry escalate rules / supportjp / teamfutureselite / SAQII / Arsal / Elite AI / Risk).',
  'Output format (nothing before ACTION):',
  'ACTION: REPLY|NOTE|CLOSE|OPEN|SKIP|STOP|RESUME|NOOP|CLARIFY',
  'BODY: <message or short reason>',
  'CLARIFY = short internal note asking what they meant. NOOP = nothing to do (brief reason in BODY).',
].join('\n');

async function interpretOwnerCommandViaLlm(conversationId, full, plain, authorId) {
  const bits = contactBits(full);
  const history = buildHistory(full, 50);
  const who = authorId === ARSAL_ID ? 'Arsal (owner)' : authorId === JERRY_ID ? 'Jerry' : 'authorized teammate (support)';
  const userMsg =
    'DIRECT COMMAND from ' +
    who +
    ':\n' +
    String(plain || '').trim() +
    '\n\nClient name: ' +
    (bits.name || '') +
    '\nClient email: ' +
    (bits.email || '') +
    '\nConversation id: ' +
    conversationId +
    '\n\nFULL TICKET HISTORY:\n' +
    history +
    '\n\nInterpret the direct command and respond with OWNER ACTION format only.';
  // The owner-command interpreter decides real actions (STOP/CLOSE/REPLY), so it is squarely
  // customer-affecting and stays on the MEDIUM floor.
  const ai = await lunaModel.create(openai, {
    model: control.getModel(),
    ...modelConfig.answerParams({
      tools: false, purpose: 'owner.command-interpret',
      conversationId, episode: lunaEpisode.get(conversationId),
    }),
    conversationId,
    episode: lunaEpisode.get(conversationId),
    messages: [
      { role: 'system', content: control.getPrompt() + '\n\n' + OWNER_CMD_SYSTEM_OVERLAY },
      { role: 'user', content: userMsg },
    ],
  });
  const rawOut = ((ai.choices[0] && ai.choices[0].message && ai.choices[0].message.content) || '').trim();
  console.log('OWNER_CMD_LLM_RAW', conversationId, logLen(rawOut));
  return parseOwnerCommandAction(rawOut);
}

async function executeOwnerActionPlan(conversationId, full, plan, plain, commandPartId) {
  const action = String((plan && plan.action) || 'NOOP').toUpperCase();
  let body = String((plan && plan.body) || '').trim();
  if (action === 'STOP') {
    applyAuthorizedCommandControl('setAiOff', conversationId);
    await postReply(conversationId, 'note', authConfirmText('STOP', plain), 'command:' + commandPartId);
    return 'STOP';
  }
  if (action === 'RESUME') {
    applyAuthorizedCommandControl('clearAiOff', conversationId);
    applyAuthorizedCommandControl('setReplyAllowed', conversationId, true);
    await postReply(conversationId, 'note', authConfirmText('RESUME', plain), 'command:' + commandPartId);
    return 'RESUME';
  }
  if (action === 'CLOSE') {
    applyAuthorizedCommandControl('setAiOff', conversationId);
    await postReply(conversationId, 'note', authConfirmText('CLOSE', plain), 'command:' + commandPartId);
    await closeConversation(conversationId, { commandPartId });
    return 'CLOSE';
  }
  if (action === 'OPEN') {
    applyAuthorizedCommandControl('clearAiOff', conversationId);
    await openConversation(conversationId);
    await postReply(conversationId, 'note', 'Okay, reopening this ticket.', 'command:' + commandPartId);
    return 'OPEN';
  }
  if (action === 'SKIP' || action === 'NOOP') {
    await postReply(conversationId, 'note', body ? ('Okay, noted. ' + body).slice(0, 500) : 'Okay, noted.', 'command:' + commandPartId);
    return action;
  }
  if (action === 'CLARIFY') {
    if (tradingStagePolicy.isNonActionableTeammateNote(plain)) {
      console.log('OWNER_CMD skip clarify on non-actionable note');
      return 'NOOP';
    }
    let noteBody = body || 'Could you clarify what you want me to do on this ticket?';
    noteBody = await ensureInternalNoteEnglish(noteBody, 'Owner CLARIFY');
    await postReply(conversationId, 'note', noteBody, 'command:' + commandPartId);
    return 'CLARIFY';
  }
  if (action === 'NOTE') {
    if (!body) body = 'Okay, noted.';
    body = await ensureInternalNoteEnglish(body, 'Owner NOTE');
    // Owner notes: enrich @Name → Intercom entity_mention (escape other text carefully)
    const html = await enrichNoteMentionsHtml(body);
    await postReply(conversationId, 'note', html, 'command:' + commandPartId);
    return 'NOTE';
  }
  if (action === 'REPLY') {
    if (plan && plan.held) {
      const __holdNote = staffCommandHoldNote(plan.held);
      if (__holdNote) await postReply(conversationId, 'note', __holdNote, 'command:' + commandPartId);
      return 'HELD';
    }
    if (!body) {
      await postReply(conversationId, 'note', 'I could not draft a client reply from that instruction , please clarify.', 'command:' + commandPartId);
      return 'CLARIFY';
    }
    applyAuthorizedCommandControl('clearAiOff', conversationId);
    // FOLLOW→REPLY / owner REPLY is an explicit resume lease for subsequent FAQ turns
    // (live 215476246024547: one-shot reply cleared aiOff but silence still blocked FAQs).
    applyAuthorizedCommandControl('setReplyAllowed', conversationId, true);
    // Owner-dictated public REPLY: never welcome-intro, never already-replied skip (Escalations often have prior Arsal notes).
    let out = postProcessModelReply(body, conversationId);
    const r = await postReply(conversationId, 'comment', out, 'command:' + commandPartId);
    if (r && r.held) {
      const __holdNote = staffCommandHoldNote(r.holdCode);
      if (__holdNote) await postReply(conversationId, 'note', __holdNote, 'command:' + commandPartId);
    } else if (r && r.status >= 200 && r.status < 300) {
      await postReply(conversationId, 'note', 'Sent to client.', 'command:' + commandPartId);
    } else {
      console.log('OWNER_REPLY_FAIL', conversationId, r && r.status);
      await postReply(conversationId, 'note', 'Tried to send your message to the client but Intercom returned an error.', 'command:' + commandPartId);
    }
    return 'REPLY';
  }
  await postReply(conversationId, 'note', 'Okay, noted.', 'command:' + commandPartId);
  return 'NOOP';
}

function authConfirmText(cmd, plain) {
  if (cmd === 'STOP') {
    const opts = [
      "Okay, I'll stop replying to this ticket as requested.",
      "Understood, I'll pause responses here.",
      "Got it - no more replies on this ticket from me.",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  if (cmd === 'RESUME') {
    const opts = [
      "Understood, I'll resume replies on this ticket.",
      "Okay, I'm back on this ticket.",
      "Got it - I'll continue assisting this client.",
      "Okay, I'll keep helping if the client asks further questions.",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  if (cmd === 'CLOSE') {
    const opts = [
      "Okay, closing this ticket as requested.",
      "Understood, I'll close this conversation.",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  if (cmd === 'PING') {
    const opts = [
      "Yes, I'm here on this ticket.",
      "Here - watching this ticket.",
      "Yes, I'm on it.",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  if (cmd === 'FOLLOW') {
    const opts = [
      "Okay, noted - I'll follow that on this ticket.",
      "Understood - I'll act on that here.",
      "Got it - I'll follow your instruction on this ticket.",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  return "Okay, noted.";
}

const authNoteInflight = new Map();
const authorizedCommandContext = new (require('async_hooks').AsyncLocalStorage)();
// Separate from legacy ticket snapshots: old handlers may save a snapshot after
// an await. Such a save must never erase pending/confirmed command receipts.
const AUTH_COMMAND_FILE = TICKET_STATE_FILE + '.commands.json';
function loadAuthorizedCommands() {
  try {
    const value = JSON.parse(fs.readFileSync(AUTH_COMMAND_FILE, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid command ledger');
    return value;
  } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}
function authorizedRuns(conversationId) {
  const runs = {};
  for (const row of Object.values(loadAuthorizedCommands())) {
    if (row.conversationId === String(conversationId)) runs[row.partId] = row.record;
  }
  return runs;
}
function scrubCredentialPlan(record, conversationId) {
  if (!record || !record.plan || typeof record.plan !== 'object') return false;
  if (record.plan.held && !record.plan.body) {
    if (!record.held) record.held = record.plan.held;
    return false;
  }
  const hold = publicCredentialHold.holdPlanForPersistence(record.plan, { conversationId });
  if (!hold) return false;
  const act = String(record.plan.action || 'NOOP').toUpperCase();
  const held = publicCredentialHold.safeCode(hold.code);
  record.plan = {
    action: ['REPLY', 'NOTE', 'CLOSE', 'OPEN', 'SKIP', 'STOP', 'RESUME', 'NOOP', 'CLARIFY'].includes(act) ? act : 'NOOP',
    held,
    bodyLength: Number(hold.len || 0),
  };
  record.held = held;
  return true;
}
function writeAuthorizedCommandMap(all) {
  const completed = Object.keys(all).filter((id) => all[id] && all[id].record && ['complete', 'superseded'].includes(all[id].record.phase)).sort((a, b) => all[a].at - all[b].at);
  // Never evict an unresolved intent/pending command as permission to repeat it.
  while (Object.keys(all).length > 4000 && completed.length) delete all[completed.shift()];
  if (Object.keys(all).length > 4000) throw authorizedCommandRetry('ledger-full');
  const tmp = AUTH_COMMAND_FILE + '.tmp-' + process.pid + '-' + require('crypto').randomUUID();
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(all)); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(tmp, AUTH_COMMAND_FILE);
    const dir = fs.openSync(require('path').dirname(AUTH_COMMAND_FILE), 'r');
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(tmp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
function persistAuthorizedCommand(context) {
  scrubCredentialPlan(context.record, context.conversationId);
  const all = loadAuthorizedCommands(), key = context.conversationId + ':' + context.partId;
  all[key] = { conversationId: context.conversationId, partId: context.partId, at: Date.now(), record: context.record };
  writeAuthorizedCommandMap(all);
}
function scrubAuthorizedLedger(conversationId) {
  let all;
  try { all = loadAuthorizedCommands(); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
  let changed = false;
  for (const row of Object.values(all)) {
    if (!row || !row.record) continue;
    if (conversationId && String(row.conversationId) !== String(conversationId)) continue;
    if (scrubCredentialPlan(row.record, row.conversationId)) changed = true;
  }
  if (changed) writeAuthorizedCommandMap(all);
}
function applyAuthorizedCommandControl(method, conversationId, value) {
  const c = authorizedCommandContext.getStore();
  const key = method + ':' + String(value);
  if (c && c.record.controls && c.record.controls[key]) return;
  control[method](conversationId, value);
  if (c) {
    c.record.controls = c.record.controls || {};
    c.record.controls[key] = true;
    persistAuthorizedCommand(c);
  }
}
function authorizedCommandRetry(reason) {
  ownershipUnavailableResult('authorized-command:' + reason);
  const error = new Error('Authorized command pending: ' + reason);
  error.code = 'AUTH_COMMAND_RETRY';
  return error;
}
async function withAuthorizedCommandWrite(conversationId, kind, fn) {
  const c = authorizedCommandContext.getStore();
  if (!c || c.conversationId !== String(conversationId)) return fn();
  const key = String(c.writeIndex++) + ':' + kind;
  const prior = c.record.steps[key];
  if (prior) {
    if (prior === 'confirmed') return { ok: true, skipped: true, status: 200, commandCompletedStep: true };
    // Unknown or interrupted intent is never retried, even after the generic
    // transport replay window expires. A human must reconcile the remote state.
    return { ok: false, unknown: true, skipped: true, status: 0, reason: 'command-write-unknown' };
  }
  c.record.steps[key] = 'intent';
  persistAuthorizedCommand(c);
  let result;
  try { result = await fn(); }
  catch (e) {
    // An unexpected exception may follow a remote acceptance. Keep intent.
    throw e;
  }
  if (result && result.unknown) c.record.steps[key] = 'unknown';
  else if (result && result.ok) c.record.steps[key] = 'confirmed';
  else delete c.record.steps[key]; // No accepted/ambiguous operation recorded.
  persistAuthorizedCommand(c);
  const turn = webhookFastAck.currentStore();
  if ((turn && turn.gateError) || (result && /(?:unavailable|refetch-failed)/.test(result.reason || '')) || (result && result.status === 429)) {
    throw authorizedCommandRetry(result && result.reason || 'temporary-write-rejection');
  }
  return result;
}

async function processAuthorizedNoteCommands(conversationId, full) {
  const idKey = String(conversationId || '');
  if (!idKey) return null;
  if (authNoteInflight.has(idKey)) {
    console.log('AUTH_NOTE skip inflight', idKey);
    return null;
  }
  authNoteInflight.set(idKey, Date.now());
  try {
  scrubAuthorizedLedger(conversationId);
  const parts = partsOf(full);
  const { all, state, id } = getConvState(conversationId);
  if (!Array.isArray(state.handledAuthNoteIds)) state.handledAuthNoteIds = [];
  const handled = new Set(state.handledAuthNoteIds.map(String));
  const pendingCommandIds = new Set(Object.entries(authorizedRuns(conversationId)).filter(([, row]) => row.phase === 'pending').map(([id]) => id));
  // Durable pending receipts outrank a legacy snapshot/history seed. Retrying
  // these commands still checks current authority and skips confirmed steps.
  for (const pendingId of pendingCommandIds) handled.delete(pendingId);
  let acted = null;

  // First seen ticket: seed older notes so history never auto-fires,
  // but leave the newest note free (covers admin.noted on first sight).
  if (!state.authNotesBootstrapped) {
    const noteParts = parts.filter((p) => p && p.part_type === 'note');
    let newestId = '';
    let newestAt = -1;
    for (const p of noteParts) {
      const at = Number(p.created_at || 0);
      if (at >= newestAt) {
        newestAt = at;
        newestId = String(p.id || p.created_at || '');
      }
    }
    for (const part of noteParts) {
      const partId = String(part.id || part.created_at || '');
      if (!partId || partId === newestId || pendingCommandIds.has(partId)) continue;
      handled.add(partId);
    }
    state.authNotesBootstrapped = true;
  }

  // Only the newest note can fire per wake , prevents history re-fire / confirm loops
  const notePartsNewestFirst = parts
    .filter((p) => p && p.part_type === 'note')
    .slice()
    .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));

  const pendingIds = new Set(Object.entries(authorizedRuns(conversationId)).filter(([, r]) => r.phase === 'pending').map(([id]) => id));
  const pending = notePartsNewestFirst.find((p) => pendingIds.has(String(p.id || p.created_at || '')));
  const selected = pending ? [pending, ...notePartsNewestFirst.slice(0, 1).filter((p) => p !== pending)] : notePartsNewestFirst.slice(0, 1);
  for (const part of selected) {
    if (!part || part.part_type !== 'note') continue;
    const partId = String(part.id || part.created_at || '');
    if (!partId || handled.has(partId)) continue;
    const recorded = authorizedRuns(conversationId)[partId];
    if (recorded && recorded.phase !== 'pending') { handled.add(partId); continue; }
    const author = part.author || {};
    const authorId = String(author.id || '');
    // Only authorized note-admins (Arsal/Jerry/support teammates) may author actionable commands
    if (!AUTHORIZED_NOTE_ADMIN_IDS.has(authorId)) {
      handled.add(partId);
      console.log('AUTH_NOTE skip , author not authorized', conversationId, authorId, partId);
      teammateAudit.record({ command: 'OTHER', conversationId, adminId: authorId, outcome: 'rejected', reason: 'author not authorized' });
      continue;
    }
    const rawBody = String(part.body || '');
    const plain = stripHtml(rawBody);
    if (isBotAuthConfirmNote(plain) || isEscalateOrSystemNote(plain)) {
      handled.add(partId);
      continue;
    }
    const mentionsAuthorized = noteBodyMentionsAuthorized(rawBody);
    // HARD: every actionable note must @mention Arsal / Luna (self-mention counts). @Jerry alone is not enough.
    // Plain notes from Arsal/Jerry with no mention are ignored , no auto replies.
    if (!mentionsAuthorized) {
      handled.add(partId);
      console.log('AUTH_NOTE skip , no @Arsal mention (Jerry-only notes are not for Luna)', conversationId, authorId, partId);
      continue;
    }
    // HARD: author must already be in AUTHORIZED_NOTE_ADMIN_IDS (checked above).
    // Elite AI / Risk / shared seats are not in that set and cannot command.
    // Teammates (AUGUST, Anjsha, etc.) may STOP/RESUME/CLOSE/REPLY/NOTE/FOLLOW when they @Arsal (Luna). @Jerry-only notes are ignored — those are for Jerry.
    if (!AUTHORIZED_NOTE_ADMIN_IDS.has(authorId)) {
      handled.add(partId);
      console.log('AUTH_NOTE skip , author not in authorized note-admin set', conversationId, authorId, partId);
      teammateAudit.record({ command: 'OTHER', conversationId, adminId: authorId, outcome: 'rejected', reason: 'author not in authorized set' });
      continue;
    }
    const parsedCmd = parseAuthorizedNoteCommand(plain, {
      fromAuthorizedAuthor: true,
      mentionsAuthorized,
    });
    if (!parsedCmd || !parsedCmd.cmd) {
      handled.add(partId);
      continue;
    }
    const cmd = parsedCmd.cmd;
    const cmdBody = String(parsedCmd.body || '').trim();
    // A persisted claim is PENDING, not completed. Inflight serialization prevents
    // concurrent execution; per-step receipts prevent replay after retry/restart.
    const priorRuns = authorizedRuns(conversationId);
    if (!priorRuns[partId] && Object.values(priorRuns).filter((r) => r.phase === 'pending').length >= 20) throw authorizedCommandRetry('pending-limit');
    const context = { conversationId: String(conversationId), partId, writeIndex: 0,
      record: priorRuns[partId] || { cmd, phase: 'pending', startedAt: Date.now(), steps: {} } };
    if (!currentAuthorizedCommand(parts, conversationId, partId)) {
      context.record.phase = 'superseded';
      persistAuthorizedCommand(context);
      handled.add(partId);
      continue;
    }
    // Bootstrap/history skips must also survive a retry; merge before awaits.
    const claimState = getConvState(conversationId).state;
    claimState.authNotesBootstrapped = state.authNotesBootstrapped;
    claimState.handledAuthNoteIds = Array.from(handled).slice(-500);
    saveConvState(conversationId, claimState);
    persistAuthorizedCommand(context);
    await authorizedCommandContext.run(context, async () => {
    if (cmd === 'STOP' || cmd === 'RESUME' || cmd === 'CLOSE' || cmd === 'PING' || cmd === 'ASSIST') {
      // Arm STOP synchronously before any ACK await, so queued public writes
      // observe the stop even while the confirmation waits for the write lock.
      if (cmd === 'STOP' || cmd === 'CLOSE') applyAuthorizedCommandControl('setAiOff', conversationId);
      const confirm = context.record.confirm || (cmd === 'ASSIST'
        ? "Understood, I'll continue assisting this client until the issue ends or a teammate takes over."
        : authConfirmText(cmd, plain));
      context.record.confirm = confirm;
      persistAuthorizedCommand(context);
      await postReply(conversationId, 'note', confirm, 'command:' + partId);
      if (cmd === 'STOP') {
        applyAuthorizedCommandControl('setAiOff', conversationId);
        console.log('AUTH_NOTE STOP', conversationId, authorId, partId);
      } else if (cmd === 'RESUME') {
        applyAuthorizedCommandControl('clearAiOff', conversationId);
        // Explicit resume also opens a ticket-scoped reply lease (clears STOP silence for FAQs).
        applyAuthorizedCommandControl('setReplyAllowed', conversationId, true);
        console.log('AUTH_NOTE RESUME', conversationId, authorId, partId);
      } else if (cmd === 'ASSIST') {
        // A named, authorized teammate's delegation is an explicit ticket
        // allowance even while test mode limits unrelated conversations.
        applyAuthorizedCommandControl('setReplyAllowed', conversationId, true);
        console.log('AUTH_NOTE ASSIST continuous', conversationId, authorId, partId);
        // Re-fetch through the regular webhook path to answer a pending turn too.
        authorizedCommandContext.exit(() => setImmediate(() => {
          const request = { body: { topic: 'conversation.user.replied', data: { item: full } } };
          const response = { sendStatus: () => {} };
          handleWebhook(request, response).catch((e) => console.error('ASSIST_KICK_ERR', conversationId, 'class=' + (e && e.name || 'Error')));
        }));
      } else if (cmd === 'CLOSE') {
        applyAuthorizedCommandControl('setAiOff', conversationId);
        await closeConversation(conversationId, { commandPartId: partId });
        console.log('AUTH_NOTE CLOSE', conversationId, authorId, partId);
      } else {
        console.log('AUTH_NOTE PING', conversationId, authorId, partId);
      }
      acted = cmd;
    } else if (cmd === 'REPLY') {
      applyAuthorizedCommandControl('clearAiOff', conversationId);
      applyAuthorizedCommandControl('setReplyAllowed', conversationId, true);
      // The command body is taken from tag-stripped text, which drops href targets.
      // Judge the raw note (body HTML, href/src, attachments) with the same hold before send.
      const __srcHold = publicCredentialHold.holdOutgoingPayload('post', {
        message_type: 'comment',
        body: String(part.body || ''),
        attachments: part.attachments || part.attachment || undefined,
      }, { conversationId });
      if (__srcHold) {
        credentialHoldLog('conversations/' + conversationId, __srcHold);
        const __holdNote = staffCommandHoldNote(__srcHold.code);
        if (__holdNote) await postReply(conversationId, 'note', __holdNote, 'command:' + partId);
        console.log('AUTH_NOTE REPLY_HELD', conversationId, authorId, partId);
        acted = 'REPLY';
      } else {
      // Auth-note REPLY (incl. send-this-message brackets): bypass already-replied / welcome-intro
      let out = postProcessModelReply(cmdBody, conversationId);
      const r = await postReply(conversationId, 'comment', out, 'command:' + partId);
      if (r && r.held) {
        const __holdNote = staffCommandHoldNote(r.holdCode);
        if (__holdNote) await postReply(conversationId, 'note', __holdNote, 'command:' + partId);
      } else if (r && r.status >= 200 && r.status < 300) {
        await postReply(conversationId, 'note', 'Sent to client.', 'command:' + partId);
      } else {
        console.log('AUTH_NOTE REPLY_FAIL', conversationId, r && r.status);
        await postReply(conversationId, 'note', 'Tried to send your message to the client but Intercom returned an error.', 'command:' + partId);
      }
      console.log('AUTH_NOTE REPLY', conversationId, authorId, partId);
      acted = 'REPLY';
      }
    } else if (cmd === 'NOTE') {
      const enBody = await ensureInternalNoteEnglish(cmdBody, 'AUTH_NOTE NOTE');
      const html = await enrichNoteMentionsHtml(enBody);
      await postReply(conversationId, 'note', html, 'command:' + partId);
      console.log('AUTH_NOTE NOTE', conversationId, authorId, partId);
      acted = 'NOTE';
    } else if (cmd === 'OPEN') {
      applyAuthorizedCommandControl('clearAiOff', conversationId);
      await openConversation(conversationId);
      await postReply(conversationId, 'note', 'Okay, reopening this ticket.', 'command:' + partId);
      console.log('AUTH_NOTE OPEN', conversationId, authorId, partId);
      acted = 'OPEN';
    } else if (cmd === 'SKIP') {
      await postReply(conversationId, 'note', 'Okay, skipping as requested.', 'command:' + partId);
      console.log('AUTH_NOTE SKIP', conversationId, authorId, partId);
      acted = 'SKIP';
    } else if (cmd === 'FOLLOW') {
      // Flexible owner/Jerry command , interpret via model and execute allowed actions
      applyAuthorizedCommandControl('clearAiOff', conversationId);
      try {
        const exactSend = extractOwnerSendToClientBody(plain);
        const mentionNote = extractOwnerMentionAskReplyBody(plain);
        let plan = context.record.plan || (exactSend
          ? { action: 'REPLY', body: exactSend }
          : mentionNote
            ? { action: 'NOTE', body: mentionNote }
            : await interpretOwnerCommandViaLlm(conversationId, full, plain, authorId));
        if (String(plan.body || '').length > 16000) throw authorizedCommandRetry('plan-too-large');
        // PUBLIC_CREDENTIAL_HOLD_V1: a plan body that carries a credential pair is never persisted
        // (not even for retry) and is never executed. Only a body-free held marker is kept.
        rememberVisibleContext(conversationId, full);
        const __planHold = publicCredentialHold.holdPlanForPersistence(plan, { conversationId });
        if (__planHold) {
          credentialHoldLog('conversations/' + conversationId, __planHold);
          const __act = String(plan.action || '').toUpperCase();
          plan = {
            action: ['REPLY', 'NOTE', 'CLOSE', 'OPEN', 'SKIP', 'STOP', 'RESUME', 'NOOP', 'CLARIFY'].includes(__act) ? __act : 'NOOP',
            held: publicCredentialHold.safeCode(__planHold.code),
            bodyLength: Number(__planHold.len || 0),
          };
        }
        context.record.plan = plan;
        persistAuthorizedCommand(context);
        const done = await executeOwnerActionPlan(conversationId, full, plan, plain, partId);
        // FOLLOW that produces a client REPLY / RESUME opens the same lease as ASSIST.
        if (done === 'REPLY' || done === 'RESUME') {
          applyAuthorizedCommandControl('setReplyAllowed', conversationId, true);
        }
        console.log('AUTH_NOTE FOLLOW->', done, conversationId, authorId, partId);
        acted = 'FOLLOW:' + done;
      } catch (e) {
        if (e && e.code === 'AUTH_COMMAND_RETRY') throw e;
        console.error('OWNER_CMD_FAIL', conversationId, 'class=' + (e && e.name || 'Error'));
        await postReply(
          conversationId,
          'note',
          "Got it , I'll follow that on this ticket (could not auto-execute just now).",
          'command:' + partId
        );
        acted = 'FOLLOW';
      }
    }
    });
    context.record.phase = Object.values(context.record.steps).some((s) => s === 'unknown' || s === 'intent') ? 'unknown' : 'complete';
    // Drop prepared bodies after completion. A credential hold keeps only the code.
    if (context.record.plan && context.record.plan.held) context.record.held = context.record.plan.held;
    delete context.record.plan;
    delete context.record.confirm;
    persistAuthorizedCommand(context);
    handled.add(partId);
    teammateAudit.record({ command: cmd, conversationId, adminId: authorId, outcome: context.record.phase });
  }

  const latestState = getConvState(conversationId).state;
  latestState.handledAuthNoteIds = Array.from(handled).slice(-500);
  latestState.authNotesBootstrapped = state.authNotesBootstrapped;
  saveConvState(conversationId, latestState);
  return acted;
  } finally {
    authNoteInflight.delete(idKey);
  }
}

async function postDeterministicFlowReply(conversationId, body, userPart, clientName) {
  const gate = await checkSendBoundary(conversationId, userPart, clientName);
  if (!gate.ok) return { ok: false, why: gate.why };
  if (!String(body || '').trim()) return { ok: false, why: 'empty' };
  const __posted = await postReply(
    conversationId,
    'comment',
    body,
    userPart && userPart.id ? 'turn:' + userPart.id : undefined
  );
  return __posted;
}

/* REVIEW_CONTROL_STATE_V2: the review flow reads teammate commands with the SAME authorization and
 * parser as the owner-command reader (processAuthorizedNoteCommands), so both agree on STOP/RESUME. */
const reviewControlDeps = {
  isAuthorizedAdmin: (id) => AUTHORIZED_NOTE_ADMIN_IDS.has(String(id || '')),
  mentionsLuna: (rawBody) => noteBodyMentionsAuthorized(rawBody),
  parseCommand: (plain, opts) => parseAuthorizedNoteCommand(plain, opts),
  isStopInstruction: (body) => continuousOwnership.isStopInstruction(body),
};

async function maybeSendDeterministicReviewFlow(conversationId, full, parts, latestUser, text, clientName) {
  /* REVIEW_NEVER_SWALLOWS_REPLY_V2 (2026-09-28, live 215476132844454): { handled: true } ends the
   * webhook turn, so it is returned ONLY when the review flow itself sent the closing check / review
   * ask, or when the client message is a pure closure and no reply is due
   * (reviewRequestFlow.mayEndTurnWithoutReply). Every other outcome, including any error in this
   * step, falls through to the normal reply path. */
  let stPack;
  try {
    stPack = getConvState(conversationId);
  } catch (e) {
    console.error('REVIEW_FLOW state', conversationId, 'class=' + (e && e.name || 'Error'));
    return { handled: false };
  }
  const partId = String((latestUser && (latestUser.id || latestUser.created_at)) || '');
  let aiOff = false;
  try { aiOff = !!(control.isAiOff && control.isAiOff(conversationId)); } catch (_) {}
  let decision;
  try {
    decision = reviewRequestFlow.decideReviewFlow({
      parts,
      latestText: text,
      latestPartId: partId,
      state: stPack.state,
      flags: {
        aiOff,
        escalateAwaiting: !!(stPack.state && stPack.state.escalateAwaitingFirstTeammate),
        riskAwaiting: !!(stPack.state && stPack.state.riskAwaitingTeam),
        riskOwned: isRiskTeambox(full) || isRiskAssigned(full),
        escalationsOwned: isEscalationsTeambox(full),
      },
      opts: { arsalId: ARSAL_ID, eliteAiId: ELITE_AI_ID },
      controlDeps: reviewControlDeps,
    });
  } catch (e) {
    console.error('REVIEW_FLOW decide-error (normal reply continues)', conversationId, 'class=' + (e && e.name || 'Error'));
    return { handled: false };
  }
  if (decision.staleStops) {
    console.log('REVIEW_FLOW control', decision.controlState, 'stale-stops', decision.staleStops, conversationId);
  }
  if (decision.action !== 'SEND_REVIEW' && decision.action !== 'SEND_CLOSING_CHECK') {
    if (reviewRequestFlow.mayEndTurnWithoutReply(decision, text)) {
      console.log('REVIEW_FLOW hold', decision.reason, conversationId);
      return { handled: true };
    }
    if (decision.satisfaction || decision.suppress) {
      console.log('REVIEW_FLOW pass', decision.reason, conversationId, '(normal reply path continues)');
    }
    return { handled: false };
  }
  const claim = reviewRequestFlow.claimSend(stPack.state, decision.action, partId, Date.now());
  if (!claim.ok) {
    console.log('REVIEW_FLOW claim', claim.reason, conversationId);
    return { handled: true };
  }
  saveConvState(stPack.id, stPack.state);
  const outgoing = postProcessModelReply(decision.body, conversationId);
  if (!outgoing) {
    const failed = getConvState(conversationId);
    reviewRequestFlow.releaseClaim(failed.state);
    saveConvState(failed.id, failed.state);
    console.log('REVIEW_FLOW empty', decision.action, conversationId);
    return { handled: true };
  }
  const sent = await postDeterministicFlowReply(conversationId, outgoing, latestUser, clientName);
  const fresh = getConvState(conversationId);
  if (sent && (sent.ok || sent.unknown)) {
    reviewRequestFlow.commitSend(fresh.state, decision.action, partId, Date.now(), {
      step1By: decision.closingCheckBy || '',
      step1SupportPartId: decision.closingCheckPartId || '',
    });
    saveConvState(fresh.id, fresh.state);
    console.log('REVIEW_FLOW', decision.action, decision.reason, conversationId);
    return { handled: true };
  }
  reviewRequestFlow.releaseClaim(fresh.state);
  saveConvState(fresh.id, fresh.state);
  console.log('REVIEW_FLOW send-failed', decision.action, sent && (sent.why || sent.status), conversationId);
  return { handled: true };
}


const handleWebhook = async (req, res) => {
  const topic = (req.body && req.body.topic) || 'none';
  const conversation = req.body && req.body.data && req.body.data.item;
  const conversationId = conversation && conversation.id;
  console.log('IN', topic, conversationId);

  try {
    // Authorized note commands (Arsal/Jerry only) , even when globally paused
    if (topic === 'conversation.admin.noted') {
      if (!conversationId) return res.sendStatus(200);
      let fullNoted;
      try { fullNoted = await fetchConversation(conversationId); } catch (_) { fullNoted = null; }
      if (!fullNoted || !authoritativeConversationParts(fullNoted)) {
        ownershipUnavailableResult('authorized-command-intake-unavailable');
        throw authorizedCommandRetry('intake-unavailable');
      }
      await processAuthorizedNoteCommands(conversationId, fullNoted);
      return res.sendStatus(200);
    }

    if (control.isPaused()) {
      console.log('SKIP paused');
      return res.sendStatus(200);
    }
    if (topic !== 'conversation.user.created' && topic !== 'conversation.user.replied') {
      return res.sendStatus(200);
    }
    if (!conversationId) return res.sendStatus(200);

    const inflightKey = String(conversationId);
    const inflightAt = clientReplyInflight.get(inflightKey);
    if (inflightAt && Date.now() - inflightAt < 3 * 60 * 1000) {
      // BURST_RERUN_V1: remember that a newer customer event arrived while this conversation was
      // busy; the in-flight handler re-runs once when it finishes (see the finally block below).
      burstRerunPending.add(inflightKey);
      console.log('SKIP inflight', conversationId, '(rerun queued)');
      return res.sendStatus(200);
    }
    if (ownershipWriteLock.commentBlocked(conversationId)) {
      console.log('SKIP ownership-lock-armed', conversationId);
      return res.sendStatus(200);
    }
    clientReplyInflight.set(inflightKey, Date.now());
    if (!(req && req.__burstRerun)) burstRerunChain.delete(inflightKey);

    let __spreadDecision = null;
    const __spreadTurn = (text, part, clearEvent, clearReason) => {
      if (clearEvent) {
        clearSpreadState(conversationId, clearReason || 'clear-event');
        __spreadDecision = { send: false, state: 'idle', reason: 'clear-event', __ran: true };
        return __spreadDecision;
      }
      if (__spreadDecision && __spreadDecision.__ran) return __spreadDecision;
      try {
        __spreadDecision = spreadTestState.onTurn({
          conversationId: String(conversationId),
          eventId: String((part && (part.id || part.created_at)) || ''),
          eventAt: Number((part && part.created_at) || 0),
          text: String(text || ''),
        });
      } catch (_) {
        __spreadDecision = { send: false, state: 'idle', reason: 'spread-state-error' };
      }
      if (!__spreadDecision) __spreadDecision = { send: false, state: 'idle', reason: 'idle' };
      __spreadDecision.__ran = true;
      return __spreadDecision;
    };

    try {
    const cfg = control.getConfig();
    if (cfg.repliesEnabled === false) {
      console.log('SKIP repliesEnabled=false');
      return res.sendStatus(200);
    }

    const __fetched = await fetchConversation(conversationId);
    // INTERCOM_AUTH_SHORTCIRCUIT_V1: the conversation could not be read because Intercom rejects our
    // credentials. The send path re-fetches before posting, so no reply can be delivered: skip the model,
    // keep the event for replay when auth recovers (nothing is marked handled, the ask stays pending).
    if (!__fetched && intercomAuth.isDown()) {
      console.log('INTERCOM_AUTH_DOWN model skipped, event deferred for replay', conversationId, intercomAuth.lastStatus);
      deferForAuth(conversationId);
      return res.sendStatus(200);
    }
    let full = __fetched || conversation;
    // Auth note commands run only on conversation.admin.noted (avoids note storms on user.replied)
    if (control.isAiOff(conversationId)) {
      console.log('SKIP aiOff', conversationId);
      clearSpreadState(conversationId, 'aiOff');
      return res.sendStatus(200);
    }

    // Resolve ownership from the authoritative event order before any model, summary,
    // assignment or public action. Unknown shared-seat actions fail toward human ownership.
    const __ownParts = authoritativeConversationParts(__fetched);
    // The public-comment allowlist checks coverage against this customer turn.
    try {
      const __bindBoundary = require('./publicWriteBoundary');
      const __bindNorm = require('./routeNormalizer');
      const __bindParts = __ownParts || (conversation && conversation.conversation_parts && conversation.conversation_parts.conversation_parts) || [];
      const __bindPart = findLatestUserPart(__bindParts, full);
      const __bindText = stripHtml((__bindPart && __bindPart.body) || '');
      let __inboundCredential = false;
      try {
        const __ins = publicCredentialHold.inspect(__bindText);
        __inboundCredential = !!((__ins && __ins.hold) || false);
      } catch (_) { __inboundCredential = true; }
      __bindBoundary.bindTurn({
        normalized: __bindNorm.normalizeForRoute(__bindText),
        text: __bindText,
        conversationId: String(conversationId || ''),
        expectedFirstName: '',
        inboundCredential: __inboundCredential,
        eventId: String((__bindPart && __bindPart.id) || ''),
        eventAt: Number((__bindPart && __bindPart.created_at) || 0),
      });
    } catch (_) {}
    let __humanOwnedLegacyFaqBypass = false;
    if (__fetched && __ownParts && String(__fetched.id) === String(conversationId)) {
      const __latestEarly = findLatestUserPart(__ownParts, __fetched);
      const __endedMuteEarly = continuousOwnership.shouldMuteEndedLease({
        ownership: continuousOwnershipOf(__ownParts),
        parts: __ownParts,
        latestText: stripHtml((__latestEarly && __latestEarly.body) || ''),
        opts: { arsalId: ARSAL_ID, eliteAiId: ELITE_AI_ID },
        silence: teammateTopicOwnership.teammateSilenceDirective(__ownParts, {
          arsalId: ARSAL_ID,
          eliteAiId: ELITE_AI_ID,
        }),
      });
      if (__endedMuteEarly.mute && __endedMuteEarly.reason === 'explicit-stop') {
        console.log('SKIP continuous-ownership-ended', conversationId, __endedMuteEarly.reason);
        __spreadTurn(stripHtml((__latestEarly && __latestEarly.body) || ''), __latestEarly, true, 'stop');
        return res.sendStatus(200);
      }
      const __earlyText = stripHtml((__latestEarly && __latestEarly.body) || '');
      // One onTurn. Entry is spread-test-credential only. FAQ must not swallow that send.
      const __spreadNow = __spreadTurn(__earlyText, __latestEarly, false, '');
      if (__spreadNow && !__spreadNow.send && !__spreadNow.silence && !__spreadNow.blockPublic
          && __spreadNow.loadReason === 'absent'
          && priorBotWasContainedSpreadReply(__ownParts)
          && __spreadAskGate.personalAccountCue(__earlyText) !== true) {
        try {
          spreadTestState.noteHistoryOffer(conversationId, __latestEarly && __latestEarly.id, __latestEarly && __latestEarly.created_at);
        } catch (_) {}
        __spreadDecision.send = true;
        __spreadDecision.state = 'offered';
        __spreadDecision.reason = 'offered-resend';
        __spreadDecision.entry = false;
        __spreadNow.send = true;
      }
      const __faqHandled = (__spreadNow && (__spreadNow.send || __spreadNow.blockPublic))
        ? null
        : await faqAssistance.offer(__fetched, __ownParts, topic, faqAssistanceDeps(), {
        deferExecuteIfHumanOwned: true,
      });
      if (__faqHandled && __faqHandled.allowPastOwnershipForLegacyFaq) {
        __humanOwnedLegacyFaqBypass = true;
      }
      if (__faqHandled && __faqHandled.deferred && __faqHandled.prepare && __faqHandled.prepare.plan) {
        deferredHumanOwnedFaq.set(conversationId, __faqHandled.prepare);
      } else       if (__faqHandled && __faqHandled.handled) {
        // P1 notes still post. A flag-off exclusive turn posts no customer comment.
        if (__faqHandled.reason === 'language-uncertain-module-on') {
          console.log('LANGUAGE_UNCERTAIN_MODULE_ON', conversationId, 'compose=0 post=0 note=0 assign=0');
        }
        const __riskDuty = (typeof isSilentTeamboxNoteDuty === 'function' && isSilentTeamboxNoteDuty(__fetched))
          || (typeof isRiskOwnedConversation === 'function' && isRiskOwnedConversation(__fetched));
        if (__faqHandled.reason !== 'risk-escalations-silence' && !__riskDuty) return res.sendStatus(200);
      }
    }
    let __ownVerdict;
    try {
      if (!__fetched || !__ownParts) throw new Error('OWNERSHIP_LOOKUP_UNAVAILABLE');
      __ownVerdict = ownershipBoundary.evaluate(__fetched, __ownParts, ownershipOptions(conversationId));
    } catch (e) {
      // Do not acknowledge an unavailable ownership lookup as a completed turn.
      // Existing Fast-ACK bounded retry retains this event without a model/send.
      webhookFastAck.markGateError(e);
      throw e;
    }
    if (__ownVerdict.blocked && !isSilentTeamboxNoteDuty(__fetched)) {
      /* REOPEN_HUMAN_OWNERSHIP_V1 vs Option B:
       * - Current human admin assignee after close+reopen (215476300195795): baseline silence;
       *   deferred FAQ / legacy fallthrough must not weaken it.
       * - Unassigned or Luna-seat reopen with an approved isolatable FAQ: Option B may proceed.
       * - Reopen without an approved FAQ plan: silence (no model fallthrough via legacy bypass).
       * P1: Risk/Escalations teambox note-duty skips this return so note handlers run.
       * Public suppression for those tickets is the teambox return below, not this skip. */
      const __reopenHandoffOpts = {
        arsalId: ARSAL_ID,
        eliteAiId: ELITE_AI_ID,
        jerryId: JERRY_ID,
        escalationsTeamId: ESCALATIONS_TEAM_ID,
        riskTeamId: RISK_TEAM_ID,
        riskTeamAdminId: RISK_TEAM_ADMIN_ID,
      };
      const __reopenOwnedEarly = !!(
        teammateHandoffGates.humanReopenOwnership &&
        teammateHandoffGates.humanReopenOwnership(__fetched, __ownParts, __reopenHandoffOpts).owned
      );
      const __reopenHumanAssignee = !!(
        __reopenOwnedEarly &&
        teammateHandoffGates.isAssignedToHumanTeammate(__fetched, __reopenHandoffOpts)
      );
      if (__reopenHumanAssignee) {
        deferredHumanOwnedFaq.delete(conversationId);
        __humanOwnedLegacyFaqBypass = false;
        console.log('SKIP ownership-intake', __ownVerdict.reason, conversationId);
        __spreadTurn('', null, true, 'human-ownership');
        return res.sendStatus(200);
      }
      if (__reopenOwnedEarly) {
        __humanOwnedLegacyFaqBypass = false;
        if (!deferredHumanOwnedFaq.has(conversationId)) {
          console.log('SKIP ownership-intake', __ownVerdict.reason, conversationId);
          __spreadTurn('', null, true, 'human-ownership');
          return res.sendStatus(200);
        }
        // else: Option B deferred approved FAQ on unassigned / Luna-seat reopen — continue
      } else if (!deferredHumanOwnedFaq.has(conversationId) && !__humanOwnedLegacyFaqBypass) {
        console.log('SKIP ownership-intake', __ownVerdict.reason, conversationId);
        __spreadTurn('', null, true, 'human-ownership');
        return res.sendStatus(200);
      }
    }

    const bits = contactBits(full);
    const clientName = bits.name || '';

    if (typeof control.isTestAllowed === 'function' && !control.isTestAllowed(conversationId, clientName)) {
      console.log('SKIP test-mode , not allowlisted', conversationId, clientName);
      return res.sendStatus(200);
    }

    const team = full.team_assignee_id != null ? String(full.team_assignee_id) : '0';
    // Escalations teambox: NEVER client-reply. Optional consolidated teammate note only.
    if (team === ESCALATIONS_TEAM_ID || isEscalationsTeambox(full)) {
      await handleEscalationsSilentNoteOnly(conversationId, full);
      __spreadTurn('', null, true, 'escalations');
      return res.sendStatus(200);
    }
    // Risk Team teambox OR Risk-assigned (incl. assignment-part history): NEVER client-reply.
    if (team === RISK_TEAM_ID || isRiskTeambox(full) || isRiskAssigned(full) || conversationAssignedToRiskInParts(full)) {
      await handleRiskSilentNoteOnly(conversationId, full);
      __spreadTurn('', null, true, 'risk');
      return res.sendStatus(200);
    }
    // Jerry-assigned (non-Escalations/Risk): optional long-message SUMMARY NOTE only.
    // Public client replies are blocked by teammateHandoffGates.shouldDeferToHumanTeammate
    // (TEAMMATE_ASSIGNEE_OWNERSHIP_V3) unless ticket-reply-allowed / continuous ownership.
    if (isJerryAssigned(full)) {
      await handleJerryOrEscalationsLongMessageNote(conversationId, full);
    }
    if (SKIP_TEAM_IDS.has(team)) {
      console.log('SKIP team inbox', conversationId, team);
      return res.sendStatus(200);
    }
    if (__spreadDecision && (__spreadDecision.blockPublic || __spreadDecision.silence)) {
      try {
        const __b = require('./publicWriteBoundary');
        __b.bindTurn(Object.assign({}, __b.currentTurn() || {}, { publicSilence: true, silenceReason: __spreadDecision.reason || 'spread-silence' }));
      } catch (_) {}
      console.log(__spreadDecision.reason === 'personal-clear' ? 'SPREAD_OFFERED_PERSONAL_CLEAR' : 'SPREAD_STATE_SILENCE', conversationId, __spreadDecision.reason || '');
      return res.sendStatus(200);
    }

    const parts = partsOf(full);
    // `let`: a teammate-scoped answer (TEAMMATE_TOPIC_OWNERSHIP_V1) narrows this to the general asks.
    let latestUser = findLatestUserPart(parts, full);
    if (!latestUser) {
      console.log('SKIP no user part', conversationId);
      return res.sendStatus(200);
    }
    if (latestUser.__fromSource) {
      console.log('USER_PART_FROM_SOURCE', conversationId);
    }
    // Do not message into a closed ticket. A client reopen arrives as open and is
    // evaluated from current parts (close/courtesy history is not a permanent mute).
    if (full.open === false || String(full.state || '').toLowerCase() === 'closed') {
      console.log('SKIP closed-ticket', conversationId);
      return res.sendStatus(200);
    }
    const __ownershipAtRead = continuousOwnershipOf(parts);
    const __endedMute = continuousOwnership.shouldMuteEndedLease({
      ownership: __ownershipAtRead,
      parts,
      latestText: stripHtml((latestUser && latestUser.body) || ''),
      opts: { arsalId: ARSAL_ID, eliteAiId: ELITE_AI_ID },
      silence: teammateTopicOwnership.teammateSilenceDirective(parts, {
        arsalId: ARSAL_ID,
        eliteAiId: ELITE_AI_ID,
      }),
    });
    if (__endedMute.mute) {
      if (deferredHumanOwnedFaq.has(conversationId) && __endedMute.reason === 'explicit-stop') {
        deferredHumanOwnedFaq.delete(conversationId);
      }
      if (!(deferredHumanOwnedFaq.has(conversationId) || __humanOwnedLegacyFaqBypass)) {
        console.log('SKIP continuous-ownership-ended', conversationId, __endedMute.reason);
        if (__endedMute.reason === 'explicit-stop') __spreadTurn(stripHtml((latestUser && latestUser.body) || ''), latestUser, true, 'stop');
        return res.sendStatus(200);
      }
    }

        /* escalate-related-only-v1: awaiting RELATED-only gate */
    {
      const stPackEro = (typeof stPack !== 'undefined' && stPack) || getConvState(conversationId);
      const stEro = stPackEro && stPackEro.state;
      if (stEro) {
        /* escalate-related-only-v1: Hook A text TDZ fix */
        // Do NOT read `text` here , let text is declared later (TDZ → WEBHOOK_ERR).
        const eroText =
          (typeof latestUser !== 'undefined' && latestUser && (latestUser.body || latestUser.text || latestUser.message)) ||
          '';
        const __eroAtts = (typeof latestUser !== 'undefined' && latestUser && typeof collectImageAttachments === 'function')
          ? collectImageAttachments(latestUser).length > 0
          : !!(latestUser && latestUser.attachments && latestUser.attachments.length);
        const eroDec = escalateRelatedOnly.evaluateFromConvState(
          stEro,
          eroText,
          typeof parts !== 'undefined' ? parts : (typeof partsOf === 'function' ? partsOf(full) : []),
          {
            arsalId: typeof ARSAL_ID !== 'undefined' ? ARSAL_ID : '',
            eliteAiId: typeof ELITE_AI_ID !== 'undefined' ? ELITE_AI_ID : '',
          },
          {
            isGeneralAnswerable: (t) => isKnowledgeAnswerableAsk(t) && !presendNeedsBackendLook(t), /* GENERAL_QUESTION_NOT_STATUS_V1 */
            hasAttachments: __eroAtts,
          }
        );
        // MIXED_AWAITING_ANSWER_V1: a message mixing a general question with the escalated case is
        // routed later (eroLate gate) to answer only its general part; do not post the status here.
        let __eroMixed = false;
        if (eroDec.action === 'STATUS_ONLY') {
          try { __eroMixed = !!buildMixedAwaitingRoute(eroText, latestUser, stEro); } catch (_) { __eroMixed = false; }
          if (__eroMixed) console.log('ESCALATE related-only: mixed general+escalated message, deferring to scoped answer', conversationId);
        }
        if (eroDec.cleared) {
          stPackEro.state = eroDec.state;
          stPackEro.all[stPackEro.id] = stPackEro.state;
          saveTicketState(stPackEro.all);
          console.log(eroDec.log, conversationId);
        } else if (eroDec.action === 'SKIP') {
          console.log(eroDec.log, conversationId);
          return res.sendStatus(200);
        } else if (eroDec.action === 'STATUS_ONLY' && !__eroMixed) {
          const hold =
            typeof pickEscalateStatusReply === 'function'
              ? pickEscalateStatusReply(conversationId)
              : escalateRelatedOnly.pickEscalateStatusReply(conversationId);
          const holdBody =
            typeof postProcessModelReply === 'function'
              ? postProcessModelReply(hold, conversationId)
              : hold;
          const bitsEro = typeof contactBits === 'function' ? contactBits(full) : null;
          const nameEro = (bitsEro && bitsEro.name) || '';
          await postClientCommentOnce(conversationId, holdBody, latestUser, nameEro);
          console.log(eroDec.log, conversationId);
          return res.sendStatus(200);
        } else if (eroDec.action === 'FALLTHROUGH' && eroDec.reason !== 'not_awaiting') {
          // Unrelated FAQ/other , answer normally; escalateAwaiting flag stays.
          console.log(eroDec.log, conversationId);
        }
      }
    }
    // Latest client text. Declared here, before identity recovery, so that branch cannot
    // read `text` in the temporal dead zone (WEBHOOK_ERR, live 215476265562543).
    // The image-only placeholder is applied later, after hook A collects attachments.
    let text = stripHtml(latestUser.body || '');
    if (arsalAlreadyRepliedAfter(parts, latestUser) && !(__spreadDecision && __spreadDecision.send)) {
      // Race recovery: we asked for account/email, client already supplied both (possibly
      // across messages / while AI was running), but the ask landed after their message so
      // the normal skip would leave them stuck. Escalate instead of re-asking.
      const recIds = collectEscalateIds(full, {}, '');
      if (isPendingIdentityAsk(parts) && !hasArsalEscalateNote(parts)) {
        let resolvedRec = resolveIdentityAskDecision(full, recIds, 'ACCOUNT');
        let needAccountRec = resolvedRec.needAccount;
        let needEmailRec = resolvedRec.needEmail;
        if (needAccountRec || needEmailRec) {
          // Pending identity ask already public (isPendingIdentityAsk). Wait for the
          // client — never re-send the same ask (parallel-webhook race with
          // IDENTITY_BEFORE_ESCALATE was posting the identical account-number ask twice).
          console.log('IDENTITY_RECOVERY wait pending ask', conversationId, {
            needAccountRec,
            needEmailRec,
            accountLen: String(recIds.account || '').length,
            emailLen: String(recIds.email || '').length,
            reason: resolvedRec.decision.reason,
          });
          return res.sendStatus(200);
        }
        if (!hasUsableEscalateIdentity(recIds, resolvedRec.declinedAccount, resolvedRec.declinedEmail)) {
          console.log('IDENTITY_RECOVERY block empty identity', conversationId, {
            accountLen: String(recIds.account || '').length,
            emailLen: String(recIds.email || '').length,
            ready: !!resolvedRec.ready,
            reason: resolvedRec.decision && resolvedRec.decision.reason,
          });
          return res.sendStatus(200);
        }
        // Account alone is enough , do not require email for recovery escalate.
        // HARD BLOCK: never escalate / never send "sent to teammate" with empty or placeholder identity.
        if (!needAccountRec && !needEmailRec && hasUsableEscalateIdentity(recIds, resolvedRec.declinedAccount, resolvedRec.declinedEmail)) {
        console.log('IDENTITY_RECOVERY escalate', conversationId, 'acctLen=' + String(recIds.account || '').length, 'emailLen=' + String(recIds.email || '').length);
        {
          const escBlockId = teammateHandoffGates.shouldBlockEscalateForTeammateHandoff(parts, full, {
            arsalId: ARSAL_ID,
            eliteAiId: ELITE_AI_ID,
            jerryId: JERRY_ID,
            hasArsalEscalateNote,
            latestText: text,
          });
        /* RISK_NOTE_ANTISPAM_V1 */
        {
          const __stRisk = (typeof getConvState === 'function') ? getConvState(conversationId).state : {};
          const __riskBlk = shouldBlockRiskNoteSpamNow(full, parts, __stRisk);
          if (__riskBlk && __riskBlk.block) {
            console.log('RISK_NOTE_ANTISPAM block escalate', conversationId, __riskBlk.reason);
            escBlockId.block = true;
            escBlockId.reason = __riskBlk.reason;
          }
        }

          if (escBlockId.block) {
            console.log('SKIP escalate teammate-handoff (identity-recovery)', escBlockId.reason, conversationId);
            return res.sendStatus(200);
          }
        }
        /* ESCALATION_DEDUPE_V1:identity-recovery */
        {
          const __dup = await escalationDuplicateCheck(conversationId, collectClientMessageTexts(full).slice(-6).join(' | '));
          if (__dup.full) full = __dup.full;
          if (__dup.duplicate) {
            console.log('ESCALATE_DUPLICATE_BLOCKED', 'identity-recovery', conversationId, __dup.reason);
            if (!/no_new_client_message/.test(__dup.reason)) {
              await postEscalateHoldingStatus(conversationId, (latestUser && (latestUser.body || '')) || '', null, (contactBits(full) || {}).name || '', getConvState(conversationId).state,
                'ESCALATE status-only (duplicate blocked, identity-recovery)');
            }
            return res.sendStatus(200);
          }
        }
        const bitsRec = contactBits(full);
        const clientNameRec = (bitsRec && bitsRec.name) || '';
        const clientTexts = collectClientMessageTexts(full);
        const problemRec =
          clientTexts.slice(-6).filter(Boolean).join(' | ') ||
          'Client provided account and email after identity ask , please review.';
        {
          const __riskDiv = await divertIfRiskOwnedNoPublic(conversationId, full);
          if (__riskDiv.diverted) {
            console.log('ESCALATE suppressed public — Risk-owned', conversationId);
            return res.sendStatus(200);
          }
          full = __riskDiv.full || full;
        }
        const existingAssignee =
          full.admin_assignee_id != null ? String(full.admin_assignee_id) : '';
        const built = await buildEscalateNoteAndAssignee({
          problem: [problemRec, ...(resolvedRec.noteExtraLines || [])].filter(Boolean).join('\n'),
          actionNeeded: 'Please review this case and guide the client.',
          account: recIds.account,
          email: recIds.email,
          preferAssigneeId:
            existingAssignee &&
            existingAssignee !== '0' &&
            existingAssignee !== ARSAL_ID &&
            existingAssignee !== ELITE_AI_ID
              ? existingAssignee
              : '',
        conversation: full,
      });
        if (built && built.deferred) {
          const gate = deferredIdentityAsk(full, recIds, 'ACCOUNT', { noteDeferredReason: built.reason });
          if (gate.ask) {
            await postClientCommentOnce(conversationId, gate.ask, latestUser, clientNameRec);
            console.log('ESCALATE_NOTE_DEFERRED asked account (identity-recovery)', conversationId);
          } else if (gate.skipNonAccount) {
            await completeNonAccountEscalation({
              conversationId,
              full,
              latestUser,
              clientName: clientNameRec,
              problem: problemRec,
              email: recIds && recIds.email,
              preferAssigneeId: existingAssignee && existingAssignee !== '0' && existingAssignee !== ARSAL_ID && existingAssignee !== ELITE_AI_ID ? existingAssignee : '',
              where: 'identity-recovery',
            });
          } else {
            console.log('ESCALATE_NOTE_DEFERRED wait (identity-recovery)', conversationId, gate.reason);
          }
          return res.sendStatus(200);
        }
        {
          const __freshEsc = await blockStaleConsequentialEscalation(conversationId, latestUser, text);
          if (__freshEsc.fresh) full = __freshEsc.fresh;
          if (__freshEsc.block || teammateHandoffGates.escalationNoteContradictsResolution(text, built.html)) {
            if (!__freshEsc.block) console.log('ESCALATE_FRESHNESS_BLOCK', conversationId, 'contradictory_note');
            return res.sendStatus(200);
          }
        }
        const noteRes = await postReply(conversationId, 'note', built.html);
        if (!noteRes.ok) {
          console.error('ESCALATE_NOTE_FAILED — no public handoff claim', conversationId, noteRes.status);
          finishHandoffAction(conversationId, false, false);
          const safeFailRec = postProcessModelReply(
            escalationClientAck({ noteOk: false, assignOk: false, where: 'identity-recovery' }),
            conversationId
          );
          if (String(safeFailRec || '').trim() && !handoffClaimGate.hasHandoffClaim(safeFailRec)) {
            await postClientCommentOnce(conversationId, safeFailRec, null, clientNameRec);
          }
          return res.sendStatus(200);
        }
        let __handoffAssignOkRec = false;
        if (built.assigneeId) {
          const asgRes = await assignToTeammateIfNeeded(full, conversationId, built.assigneeId);
          __handoffAssignOkRec = !!(asgRes && asgRes.ok);
          if (!asgRes.ok) console.error('ESCALATE_ASSIGN_FAILED', conversationId, asgRes.status);
        }
        finishHandoffAction(conversationId, true, __handoffAssignOkRec);
        recordEscalationState(conversationId, problemRec, built.problemText, full); /* ESCALATION_DEDUPE_V1 */
        console.log('ESCALATED identity-recovery', conversationId, built.assigneeId);
        let clientMsg = postProcessModelReply(
          "I've forwarded this to a human support teammate. You'll receive an update soon.",
          conversationId
        );
        if (!__handoffAssignOkRec) {
          clientMsg = postProcessModelReply(
            escalationClientAck({ noteOk: true, assignOk: false, preferred: '', where: 'identity-recovery' }),
            conversationId
          );
        } else {
          console.log('ESCALATION_READY', 'note-and-assigned', 'identity-recovery');
        }
        clientMsg = normalizeEscalateClientHandoff(clientMsg, (latestUser && (latestUser.body || latestUser.text || '')) || '');
        clientMsg = rewriteBareNumberOrderLabels(clientMsg, recIds.account);
        await postClientCommentOnce(conversationId, clientMsg, null, clientNameRec); // null userPart: identity ask already after latestUser
        return res.sendStatus(200);
        }
      }
      console.log('SKIP already replied after user part', conversationId);
      return res.sendStatus(200);
    }

    /* LUNA_SPREAD_IMAGE_FIXES_V1:BEGIN:hookA */
    // Hook A must not reference `text`. `text` is already the stripped client body; the
    // image-only placeholder is applied after this hook.
    // IMAGE_ROUTING_V1 (2026-09-28, live 215476135544728): the image attachments are collected HERE, before hookA,
    // routing and scope classification, and handed to hookA. hookA used to be called without them, so the image
    // guard only learned about a conversation's FIRST image at IMAGE_IN (after replyDecision) and
    // isImageAnswerableIssue()/hasRecentImage() were false while the turn was being classified.
    const imageAtts = collectImageAttachments(latestUser);
    try { __imageAskGuard.hookA(conversationId, imageAtts); } catch (__e) { console.error('[imageAskGuard.hookA] guard hook failed', 'class=' + (__e && __e.name || 'Error')); }
    /* LUNA_SPREAD_IMAGE_FIXES_V1:END:hookA */
    const repeatedClientQuestion = isRepeatedClientQuestion(text, collectClientMessageTexts(full).slice(0, -1));
    /* LUNA_SPREAD_IMAGE_FIXES_V1:BEGIN:hookB */
    try { __imageAskGuard.hookB(conversationId, text); } catch (__e) { console.error('[imageAskGuard.hookB] guard hook failed', 'class=' + (__e && __e.name || 'Error')); }
    /* LUNA_SPREAD_IMAGE_FIXES_V1:END:hookB */
    /* LUNA_STATE_PRESEND_V1:BEGIN:hookT */
    try { __statePresend.noteInbound(conversationId, text, latestUser); } catch (__e) { console.error('[statePresend.hookT] failed', 'class=' + (__e && __e.name || 'Error')); }
    /* LUNA_STATE_PRESEND_V1:END:hookT */
    if (!text && !imageAtts.length) {
      console.log('SKIP empty user text', conversationId);
      return res.sendStatus(200);
    }
    if (!text && imageAtts.length) {
      text = '(Client sent an image/screenshot with no accompanying text.)';
    }

    // Fin / Elite AI wait , hard gate before FAQ/AI/deterministic public replies
    if (shouldWaitForFin(full, text, topic)) {
      __spreadTurn(text, latestUser, true, 'fin-wait');
      return res.sendStatus(200);
    }

    // Eligible spread sends before review-flow, teammate defer, and the model.
    // A later non-personal turn while offered is the template, not a paragraph.
    if (__spreadDecision && __spreadDecision.send) {
      const spreadBody = buildSpreadTestReply();
      const posted = await postClientCommentOnce(conversationId, spreadBody, latestUser, clientName);
      if (posted && posted.ok && !posted.held && !posted.skipped) {
        try { spreadTestState.commitActed(conversationId); } catch (_) {}
      }
      console.log(__spreadDecision.entry ? 'SPREAD_TEST_REPLY' : 'SPREAD_TEST_REPLY_OFFERED', conversationId);
      return res.sendStatus(200);
    }

    /* REVIEW_REQUEST_FLOW_V1: 2-step close before the teammate skip.
     * teammate_actively_handling still suppresses active investigations (the gate
     * itself is unchanged). A resolved satisfaction is sent here, so that skip
     * cannot permanently drop the closing check or the one-time review ask. */
    {
      const reviewHandled = await maybeSendDeterministicReviewFlow(
        conversationId, full, parts, latestUser, text, clientName
      );
      if (reviewHandled && reviewHandled.handled) return res.sendStatus(200);
    }

    /* TEAMMATE_TOPIC_OWNERSHIP_V1: non-null only when answering the general subset of a
     * teammate-owned conversation. Every escalation / identity / hold path checks it. */
    let __teammateScope = null;
    let __teammateScopeOriginalText = '';
    /* MICHAN_TEAMMATE_HANDOFF_V1:BEGIN:deferGate */
    {
      const handoffOpts = {
        arsalId: ARSAL_ID,
        eliteAiId: ELITE_AI_ID,
        jerryId: JERRY_ID,
        escalationsTeamId: ESCALATIONS_TEAM_ID,
        riskTeamId: RISK_TEAM_ID,
        riskTeamAdminId: RISK_TEAM_ADMIN_ID,
      };
      const __continuousOwner = continuousOwnershipOf(parts);
      // An active ASSIST lease must not drag a post-resolution closure back into a reply.
      // A later real question is not a resolution closure, so the lease bypass stays (r72).
      const __resolvedAfterHuman =
        reviewRequestFlow.isResolutionClosure(text) &&
        (teammateHandoffGates.lastSubstantiveHumanIndex(parts, handoffOpts) >= 0 ||
          (parts || []).some((p) => p && String(p.part_type || '') === 'close'));
      /* REOPEN_HUMAN_OWNERSHIP_V1 (215476300195795): a stale ticket-reply-allowed grant or
       * continuous-ownership lease never overrides a CURRENT human owner (human admin assignee
       * other than the Luna seat, human close + customer reopen, human team routing / team with
       * recent human reply). A human hands back by assigning to the Luna seat. */
      const __humanHardOwned =
        teammateHandoffGates.isAssignedToHumanTeammate(full, handoffOpts) ||
        !!(teammateHandoffGates.humanReopenOwnership && teammateHandoffGates.humanReopenOwnership(full, parts, handoffOpts).owned);
      // A grant is honoured only when it is NEWER than the latest human ownership event
      // (human close, or an assignment to a human admin / team). A grant from days ago
      // (215476300195795: Oct 8) cannot override a teammate who took the ticket back today.
      /* Stale reply-allowed / continuous lease never overrides a current human owner — including
       * when an Option B FAQ was deferred under human ownership (215476300195795). */
      if (
        __humanHardOwned &&
        (control.isReplyAllowed(conversationId) || __continuousOwner.active) &&
        !freshGrantOverridesOwner(parts, conversationId)
      ) {
        deferredHumanOwnedFaq.delete(conversationId);
        console.log('SKIP teammate-handoff', 'human_owner_overrides_reply_allowed', conversationId);
        return res.sendStatus(200);
      }
      const defer = ((control.isReplyAllowed(conversationId) || __continuousOwner.active) && !__resolvedAfterHuman)
        ? { skip: false, reason: 'ticket-reply-allowed' }
        : teammateHandoffGates.shouldDeferToHumanTeammate(full, parts, text, handoffOpts);
      if (defer.skip && defer.reason === 'teammate_actively_handling' && !(deferredHumanOwnedFaq.has(conversationId) || __humanOwnedLegacyFaqBypass)) {
        /* SILENCE_RESUME_V1 + TEAMMATE_TOPIC_OWNERSHIP restore (2026-10-05, 215476246024547):
         * 1) Human silence directive (not Luna STOP confirm) → hard skip.
         * 2) Jerry / human assignee / Escalations·Risk / admin source opener (r67) → hard skip
         *    unless ticket-reply-allowed / continuous ownership already bypassed above.
         * 3) Otherwise a teammate is active on the backend case: answer GENERAL FAQ subset only. */
        const __silence = teammateTopicOwnership.teammateSilenceDirective(parts, handoffOpts);
        if (__silence.silenced) {
          console.log(
            'SKIP teammate-handoff',
            'teammate_silence_directive',
            conversationId,
            JSON.stringify({ directive: __silence.text })
          );
          return res.sendStatus(200);
        }
        const __assigneeOwned =
          teammateHandoffGates.isAssignedToHumanTeammate(full, handoffOpts) ||
          teammateHandoffGates.isAssignedToProtectedTeam(full, handoffOpts) ||
          teammateHandoffGates.humanTeammateSourceOpener(full, handoffOpts);
        if (__assigneeOwned && !(deferredHumanOwnedFaq.has(conversationId) || __humanOwnedLegacyFaqBypass)) {
          console.log('SKIP teammate-handoff', defer.reason, conversationId, 'assignee-or-source-owned');
          return res.sendStatus(200);
        }
        let route;
        try {
          route = await teammateTopicOwnership.decideTeammateScopedRoute({
            parts,
            latestUser,
            conv: full,
            opts: handoffOpts,
            callModel: async (system, user) => {
              const ai = await lunaModel.create(openai, {
                model: control.getModel(),
                ...modelConfig.answerParams({ tools: false, purpose: 'handoff.scope-classify', conversationId }),
                conversationId,
                messages: [
                  { role: 'system', content: system },
                  { role: 'user', content: user },
                ],
              });
              return (((ai.choices[0] || {}).message || {}).content) || '';
            },
            isAccountSpecific: (t) => isClearlyAccountSpecificIssue(t) || presendNeedsBackendLook(t),
          });
        } catch (e) {
          route = { action: 'SKIP', reason: 'scope_route_error', log: { errorClass: e && e.name || 'Error' } };
        }
        if (route.action !== 'ANSWER_SUBSET') {
          console.log('SKIP teammate-handoff', route.reason || defer.reason, conversationId, JSON.stringify(route.log || {}));
          return res.sendStatus(200);
        }
        __teammateScope = route;
        __teammateScopeOriginalText = text;
        text = route.answerText;
        latestUser = Object.assign({}, latestUser, { body: route.answerText });
        try { __statePresend.noteInbound(conversationId, route.answerText, latestUser); } catch (_) {}
        console.log(
          'TEAMMATE_SCOPE_ANSWER',
          conversationId,
          route.reason,
          JSON.stringify(route.log || {}),
          'held',
          (route.heldAsks || []).length,
          'general',
          (route.generalAsks || []).length
        );
      } else if (defer.skip && !(deferredHumanOwnedFaq.has(conversationId) || __humanOwnedLegacyFaqBypass)) {
        console.log('SKIP teammate-handoff', defer.reason, conversationId);
        return res.sendStatus(200);
      }
    }
    /* MICHAN_TEAMMATE_HANDOFF_V1:END:deferGate */

    // After Fin handoff / live-agent ask: first Arsal public reply stays short locked welcome
    // (do not invent breach quizzes on join unless client already stated a clear ask).
    /* MICHAN_TEAMMATE_HANDOFF_V1:BEGIN:finHandoffGuard */
    if (
      !arsalHasPublicClientReply(parts) &&
      !teammateHandoffGates.humanTeammateAlreadyRepliedPublic(parts, {
        arsalId: ARSAL_ID,
        eliteAiId: ELITE_AI_ID,
      }) &&
      (finHandoffInHistory(parts) ||
        clientRequestedLiveAgent(text) ||
        clientRequestedLiveAgentAfterLastElite(parts)) &&
      isVagueOrLiveAgentOnlyAsk(text)
    ) {
      const welcome = postProcessModelReply(lockedFinHandoffWelcome(clientName, text), conversationId);
      await postClientCommentOnce(conversationId, welcome, latestUser, clientName);
      console.log('FIN_HANDOFF_WELCOME', conversationId);
      return res.sendStatus(200);
    }
    /* MICHAN_TEAMMATE_HANDOFF_V1:END:finHandoffGuard */

    // Partnership / creator / custom-coupon requests are not promo replies and not spread-test replies.
    {
      const __partnerText = __teammateScopeOriginalText || text;
      const __partner = await routePartnershipBusiness({
        conversationId,
        full,
        text: __partnerText,
        latestUser,
        clientName,
        parts,
      });
      if (__partner && __partner.handled) {
        console.log('PARTNERSHIP_ROUTE', __partner.reason, conversationId);
        return res.sendStatus(200);
      }
    }

    // Spread-test state. One onTurn per customer turn. The template, when owed,
    // leaves through the same public-comment boundary. No second sender.
    {
      const __sd = (__spreadDecision && __spreadDecision.__ran)
        ? __spreadDecision
        : __spreadTurn(text, latestUser, false, '');
      if (__sd && (__sd.blockPublic || __sd.silence)) {
        try {
          const __b = require('./publicWriteBoundary');
          __b.bindTurn(Object.assign({}, __b.currentTurn() || {}, { publicSilence: true, silenceReason: __sd.reason || 'spread-silence' }));
        } catch (_) {}
        console.log(__sd.reason === 'personal-clear' ? 'SPREAD_OFFERED_PERSONAL_CLEAR' : 'SPREAD_STATE_SILENCE', conversationId, __sd.reason || '');
        return res.sendStatus(200);
      }
      if (__sd && __sd.send) {
        // The approved template is not model prose. postProcessModelReply junk-strips it.
        const spreadBody = buildSpreadTestReply();
        const posted = await postClientCommentOnce(conversationId, spreadBody, latestUser, clientName);
        if (posted && posted.ok && !posted.held && !posted.skipped) {
          try { spreadTestState.commitActed(conversationId); } catch (_) {}
        }
        console.log(__sd.entry ? 'SPREAD_TEST_REPLY' : 'SPREAD_TEST_REPLY_OFFERED', conversationId);
        return res.sendStatus(200);
      }
    }

    // Review/verification notification PROCESS ask , direct reply, never escalate (Arsal lock)
    if (isReviewNotificationProcessAsk(text)) {
      console.log('REVIEW_STATUS_DIRECT_HELD', conversationId);
      return res.sendStatus(200);
    }

    // September 2026 promotions: keep deterministic facts, but let the normal AI reply
    // path express them naturally in the client's context. Sending the SOT string here
    // verbatim made every broad discount question receive the same canned sentence.
    {
      const promoResolved = resolvePromoReply(text, full);
      if (promoResolved && promoResolved.reply) {
        console.log(
          'PROMO_CONTEXTUAL_AI',
          conversationId,
          promoResolved.product || '',
          'hist',
          promoResolved.historyLen || 0
        );
      }
    }

    // Sync escalate teammate-first state
    let escState = syncEscalateTeammateFirstState(conversationId, full);
    const relatedToOpenEsc =
      hasOpenEscalation(escState) &&
      !isGeneralPolicyQuestion(text) &&
      !isSpreadCheckAsk(text) &&
      !isReviewNotificationProcessAsk(text) &&
      !escalateRelatedOnly.isClearKbFaqAsk(text) &&
      escalateRelatedOnly.isRelatedToEscalatedProblem(text, escState);
    /* TEAMMATE_TOPIC_OWNERSHIP_V1: a scoped general ask that still reads as related to the open
     * escalation is not safe to answer while a teammate owns it — silence, never a status post. */
    if (__teammateScope && relatedToOpenEsc) {
      console.log('TEAMMATE_SCOPE_SILENT related-to-open-escalation', conversationId);
      return res.sendStatus(200);
    }

    /* escalate-related-only-v1: legacy awaiting blanket neutralized */
    // Hook A (early RELATED-only gate) already handled awaiting; do not re-hold here.
    // relatedToOpenEsc is now true only for truly related follow-ups (see above).
    // Already-escalated teammate-name call ("Jerry!!!!!!"): hold status / silence — never clarify.
    if (!__teammateScope && escState.escalateAwaitingFirstTeammate && isEscalationPersonCall(text)) {
      await postEscalateHoldingStatus(
        conversationId,
        text,
        latestUser,
        clientName,
        escState,
        'ESCALATE person-call hold (awaiting teammate)'
      );
      return res.sendStatus(200);
    }
    if (!__teammateScope && escState.escalateAwaitingFirstTeammate) {
      let __mixedRoute = null; /* MIXED_AWAITING_ANSWER_V1 */
      try { __mixedRoute = buildMixedAwaitingRoute(text, latestUser, escState); } catch (_) { __mixedRoute = null; }
      if (__mixedRoute) {
        __teammateScope = __mixedRoute;
        __teammateScopeOriginalText = text;
        text = __mixedRoute.answerText;
        latestUser = Object.assign({}, latestUser, { body: __mixedRoute.answerText });
        try { __statePresend.noteInbound(conversationId, __mixedRoute.answerText, latestUser); } catch (_) {}
        console.log('MIXED_AWAITING_ANSWER', conversationId, 'general', __mixedRoute.generalAsks.length, 'held', __mixedRoute.heldAsks.length);
      }
    }
    if (relatedToOpenEsc && !__teammateScope && escState.escalateAwaitingFirstTeammate) {
      const eroLate = escalateRelatedOnly.decideEscalateAwaitingGate({
        awaitingFirstTeammate: true,
        userText: text,
        lastEscalateProblem: escState.lastEscalateProblem,
        lastEscalateNoteSnippet: escState.lastEscalateNoteSnippet,
        lastEscalateTopic: escState.lastEscalateTopic,
        lastEscalateTopics: escState.lastEscalateTopics,
        isGeneralAnswerable: (t) => isKnowledgeAnswerableAsk(t) && !presendNeedsBackendLook(t), /* GENERAL_QUESTION_NOT_STATUS_V1 */
      });
      if (eroLate.action === 'SKIP') {
        console.log(eroLate.log || 'ESCALATE related-only SKIP (late)', conversationId);
        return res.sendStatus(200);
      }
      if (eroLate.action === 'STATUS_ONLY') {
        await postEscalateHoldingStatus(
          conversationId,
          text,
          latestUser,
          clientName,
          escState,
          eroLate.log || 'ESCALATE status-only (awaiting teammate first)'
        );
        return res.sendStatus(200);
      }
      console.log(eroLate.log || 'ESCALATE related-only FALLTHROUGH (late)', conversationId);
    }

    // After teammate first explanation: related follow-up → 10-minute defer for teammate
    if (
      relatedToOpenEsc &&
      !escState.escalateAwaitingFirstTeammate &&
      escState.escalateTeammateExplainedAt
    ) {
      const userAt = Number(latestUser.created_at || 0) || Math.floor(Date.now() / 1000);
      const partsNow = partsOf(full);
      let teammateAfterUser = false;
      for (const part of partsNow) {
        if (!isHumanTeammatePublicReply(part)) continue;
        if (Number(part.created_at || 0) > userAt) {
          teammateAfterUser = true;
          break;
        }
      }
      if (!teammateAfterUser) {
        const age = Math.floor(Date.now() / 1000) - userAt;
        const allowUntil = Number(escState.allowBotRelatedAnswerUntil || 0);
        if (allowUntil && Math.floor(Date.now() / 1000) < allowUntil) {
          console.log('ESCALATE allow bot related (defer matured)', conversationId);
          // fall through to AI
        } else if (age < 10 * 60) {
          const stPack = getConvState(conversationId);
          stPack.state.deferredRelatedReply = {
            partId: String(latestUser.id || latestUser.created_at || userAt),
            at: userAt,
            text: text.slice(0, 2000),
          };
          stPack.all[stPack.id] = stPack.state;
          saveTicketState(stPack.all);
          console.log('ESCALATE defer related 10m', conversationId, 'age', age);
          return res.sendStatus(200);
        }
        // age >= 10m: fall through to normal AI answer
        console.log('ESCALATE defer elapsed , bot may answer related', conversationId);
      }
    }

    /* LUNA_RESPONSES_V1:BEGIN:episode
     * One accepted inbound customer event == one processing episode == one budget. Opened
     * here, after every early-exit gate has already let the event through, so paused,
     * ignored, deferred and duplicate events still exit before any model work. Everything
     * downstream — FAST, a FAST→FULL promotion, tool rounds, the exhaustion final, presend
     * regeneration and the duplicate-reply rewrite — spends THIS budget and cannot reset it. */
    // Option A, language-uncertain-module-on: the main route has already run
    // its earlier gates. A protected comment origin does not compose a public
    // paragraph, post one, write a note, or assign.
    try {
      const __langPrior = [];
      for (const __p of parts || []) {
        if (!__p || !['user', 'lead'].includes(String((__p.author || {}).type || ''))) continue;
        const __body = stripHtml(String(__p.body || ''));
        if (__body) __langPrior.push(__body);
      }
      const __langRouted = await require('./publicRouter').route({
        text,
        prior: __langPrior,
        conversationId,
        eventId: latestUser && latestUser.id,
      });
      const __protectedAbstain = __langRouted && (
        __langRouted.suppressPublicComposition
        || __langRouted.f1
        || (__langRouted.terminal && !__langRouted.send)
      );
      if (__protectedAbstain) {
        try {
          const __b = require('./publicWriteBoundary');
          __b.bindTurn(Object.assign({}, __b.currentTurn() || {}, { publicSilence: true, silenceReason: __langRouted.reason || 'abstain' }));
        } catch (_) {}
        if (__langRouted.suppressPublicComposition) {
          console.log('LANGUAGE_UNCERTAIN_MODULE_ON', conversationId, 'compose=0 post=0 note=0 assign=0');
        }
        console.log('PROTECTED_ABSTAIN', conversationId, __langRouted.reason || '', 'compose=0 post=0');
        return res.sendStatus(200);
      }
    } catch (_) { /* a router failure does not invent a public paragraph */ }
    const __episode = lunaEpisode.begin(conversationId, {
      messageId: latestUser && latestUser.id,
    });
    /* LUNA_RESPONSES_V1:END:episode */

    /* IMAGE_EVIDENCE_V1:BEGIN:start (2026-09-28, live 215476135544728)
     * Image facts are extracted once per attachment (cached), started here right after the operational gates so it
     * runs while retrieval is prepared, and awaited before the prompt is built. A text-only follow-up within the
     * recent window keeps the client's last screenshot as context (the 18:48 follow-up had no trace of it and the
     * model answered an unrelated NEW50 question). Extraction failure never blocks or refuses the reply. */
    const __recentImagePart = imageAtts.length ? null
      : imageEvidence.findRecentImagePart(parts, latestUser, collectImageAttachments);
    const __recentImageAtts = __recentImagePart ? collectImageAttachments(__recentImagePart) : [];
    const __lateImageEv = { text: '', use: false }; // filled if the read finishes after its prompt-time timeout
    const __imageEvidenceP = (imageAtts.length || __recentImageAtts.length)
      ? imageEvidence.extract({
        openai, transport: lunaModel, modelConfig, model: control.getModel(), conversationId,
        atts: imageAtts.length ? imageAtts : __recentImageAtts, toDataUrl: imageAttachmentToDataUrl,
        onLate: (lf) => {
          __lateImageEv.text = imageEvidence.evidenceText(lf);
          if (__lateImageEv.text && __lateImageEv.use) { try { __statePresend.noteVisionHint(conversationId, __lateImageEv.text); } catch (_) {} }
        },
      }).catch(() => ({ ok: false, why: 'error' }))
      : null;
    if (__recentImagePart) console.log('IMAGE_RECENT_CONTEXT', conversationId, 'part', String(__recentImagePart.id || ''), 'atts', __recentImageAtts.length);
    /* IMAGE_EVIDENCE_V1:END:start */

    // Resolve customer intent once after operational gates and before knowledge/model work.
    // Later answer-quality gates consume this decision; they do not reopen routing.
    const __decision = replyDecision.resolve({
      latestText: text, parts,
      // IMAGE_ROUTING_V1: the current turn's image (and a recent screenshot a referential follow-up points at)
      // is known to the decision, so a vague "what does that mean?" is never out-of-scope because of its text alone.
      hasImage: imageAtts.length > 0,
      recentImage: __recentImageAtts.length > 0,
      isReferentialImageAsk: imageEvidence.isReferentialImageAsk,
      isAccount: (q) => isClearlyAccountSpecificIssue(q) || presendNeedsBackendLook(q) || accountCheckRequest.isExplicitAccountCheckRequest(q),
      isGeneral: isKnowledgeAnswerableAsk,
      isRelated: looksFundedEliteRelated,
      isExternal: (q) => EXTERNAL_TOPIC_RE.test(String(q || '')), /* TURN_INTENT_V1: positive off-topic evidence */
      isHumanRequest: clientWantsHumanTeammate,
      isPersonal: assistantIdentityGuard.isAssistantPersonalQuestion,
      isShortAck: teammateHandoffGates.isShortClientAckExpanded,
      resolvePendingAsk,
      isImageAnswerable: (q) => __imageAskGuard.isImageAnswerableIssue(conversationId, q),
      isProductFollowUp: (q, recent) => {
        const priorBot = recent.filter((p) => p && p.part_type !== 'note' &&
          ((p.author || {}).type === 'admin' || (p.author || {}).type === 'bot'))
          .map((p) => stripHtml(p.body || '')).filter(Boolean);
        return challengeVariantGuard.shouldInheritProductFaqScope(q, priorBot) ||
          (challengeVariantGuard.isBothVariantsClientReply(q) && !!challengeVariantGuard.lastBotAskedProductVariant(priorBot));
      },
    });
    console.log('REPLY_DECISION', conversationId, __decision.kind, __decision.contextReason);
    // HANDOFF_CLAIM_GATE_V2: this turn starts unproven, unless a human already owns the case.
    beginHandoffTurn(conversationId, full);
    console.log('TURN_INTENT', conversationId, JSON.stringify({ intent: __decision.intent, kind: __decision.kind, reason: __decision.intentReason, components: __decision.intentComponents, offTopic: __decision.offTopic || undefined, supportContext: __decision.supportContext }));
    // TURN_DIAG_V1 (2026-09-25): one bounded line per turn so a remaining failure can be traced from logs alone:
    // UTC time, per-unit account/general split, whether concluded past context was scoped out, teammate ownership.
    // Units are clipped to 60 chars, at most 4; no account data beyond what the unit text itself contains.
    try {
      const __tu = require('./statePresend/textUtils');
      console.log('TURN_DIAG', conversationId, JSON.stringify({
        at: new Date().toISOString(), kind: __decision.kind,
        units: (__decision.asks || []).slice(0, 4).map((u) => ({ len: String(u || '').length, acct: __decision.accountAsks.includes(u), gen: __decision.generalAsks.includes(u) })),
        pastContextScoped: __tu.withoutConcludedPastContext(text) !== String(text || ''),
        teammateOwner: !!(continuousOwnershipOf(parts) || {}).active,
      }));
    } catch (_) { /* diagnostics only */ }

    /* SMALLTALK_COURTESY_V1 (2026-09-28, live 215476135544728): pure social courtesy (greeting, how are you,
     * answering it, thanks / thanks for asking, glad to hear it, farewell) takes the LIGHTEST path: no KB
     * search, no product comparison, no FAQ answer plan, no promo facts, no tools (FAST even in a long
     * conversation) and no model regeneration. Bare acks ("yes", "done", "sent") are NOT covered: they can be
     * answers to Luna's own question and keep the normal path. A mixed message (greeting + real question) is
     * not pure small talk and keeps the normal support path. */
    let __social = { pure: false, components: [] };
    try { __social = require('./statePresend/textUtils').classifySmallTalk(text); } catch (_) {}
    /* TURN_INTENT_V1: conversation management ("can I ask something?", "are you free to help me?") takes the same light
     * path as courtesy: no KB, no tools, no product resolver, no answer plan, one model call. */
    const __supportMeta = __decision.kind === 'support-meta';
    const __pureSocial = ((__decision.kind === 'smalltalk' && isGreetingOrSmallTalk(text)) || __supportMeta) &&
      !(imageAtts && imageAtts.length) && !__teammateScope;
    const __priorBotSocial = __pureSocial
      ? parts.filter((p) => p && String(p.part_type || '') !== 'note' && ((p.author || {}).type === 'admin' || (p.author || {}).type === 'bot'))
        .map((p) => stripHtml(p.body || '')).filter(Boolean)
      : [];
    if (__pureSocial) {
      console.log('SMALLTALK_LIGHT_PATH', conversationId, JSON.stringify({ intent: __decision.intent, components: __supportMeta ? __decision.intentComponents : __social.components, kbSearch: false, tools: false, answerPlan: false, route: 'FAST' }));
    }

    // What the client most likely meant, once obvious typos are read through (owner rule
    // 2026-09-21). Used for retrieval and as an internal hint; the client is never corrected.
    let __clientMeaning = { text: text, changed: false, changes: [] };
    try { __clientMeaning = require('./statePresend/typoNormalizer').normalize(text); } catch (_) {}
    if (__clientMeaning.changed) {
      console.log('TYPO_READTHROUGH', conversationId, 'n=' + __clientMeaning.changes.length, 'lens=' + __clientMeaning.changes.map((c) => String(c[0] || '').length + '>' + String(c[1] || '').length).join(','));
    }

    /* IMAGE_EVIDENCE_V1:BEGIN:await */
    // Current-turn image evidence: the SAME extracted facts go to the prompt, to retrieval, to read_image_facts and
    // to every pre-send validator (statePresend vision hint -> presendMega image evidence). A recent screenshot is
    // used for a text-only follow-up only when the follow-up is referential ("this", "that", "website", ...).
    let __imageFacts = null;
    let __imageEvText = '';
    let __imageRecent = false;
    if (__imageEvidenceP) {
      const __f = await __imageEvidenceP;
      if (imageAtts.length || (__recentImageAtts.length && imageEvidence.isReferentialImageAsk(text))) {
        __imageFacts = __f || { ok: false, why: 'error' };
        __lateImageEv.use = true;
        __imageRecent = !imageAtts.length;
        __imageEvText = imageEvidence.evidenceText(__f);
        if (__imageEvText) {
          try { __statePresend.noteVisionHint(conversationId, __imageEvText); } catch (_) {}
        }
        console.log('IMAGE_EVIDENCE_TURN', conversationId, __imageRecent ? 'recent' : 'current', (__f && __f.ok) ? 'ok' : 'failed',
          (__f && __f.ok && __f.fundedeliteRelated === false) ? 'unrelated' : 'related-or-unknown');
      }
    }
    // Vision input for this turn: the current attachment, or (referential follow-up whose screenshot could not be read
    // into evidence) the recent screenshot itself, so the model never has to say it cannot see the image.
    const __visionAtts = imageAtts.length ? imageAtts
      : ((__imageRecent && !(__imageFacts && __imageFacts.ok)) ? __recentImageAtts : []);
    const __imageTurn = imageAtts.length > 0 || !!__imageFacts;
    const __imageRelated = __imageTurn && !(__imageFacts && __imageFacts.ok && __imageFacts.fundedeliteRelated === false);
    // Regeneration prompts that say "OFFICIAL FAQ CONTEXT only" must still allow describing the screenshot.
    const __imgEv = () => __imageEvText || __lateImageEv.text;
    const __imageOverrideClause = () => (__imgEv() && __imageRelated
      ? '\nIMAGE EVIDENCE: the client\'s question is about the screenshot described in IMAGE EVIDENCE above. Describing what it visibly shows (its figures and labels, stated as what the screenshot/website shows) is allowed and required; follow the image-vs-policy rule above and do not decline.'
      : '');
    /* IMAGE_EVIDENCE_V1:END:await */

    // Simple FAQ slice (retrieval layer) , optional
    let officialFaqBlock = '';
    let __presendKnowledge = null;
    let __comparison = null;
    const promoOnly = __decision.kind !== 'human-request' && !!(
      resolvePromoReply(text, full) &&
      !isClearlyAccountSpecificIssue(text)
    );
    if (!promoOnly && !__pureSocial && faqKb && typeof faqKb.retrieveOfficialFaqContext === 'function') {
      try {
        // Retrieve on the typo-normalized reading, so "2 stop chollange" finds the 2-Step
        // articles instead of nothing. __clientMeaning holds it for the model hint below.
        // Definition intent + exactly one product named -> also fetch its contrastive overview.
        // PENDING_ASK_RESOLVE_V1: a nudge ("Tell me arsal") retrieves for the question it points at;
        // live 215476072310759 retrieved 0 articles for the nudge, so the draft had no evidence.
        let __retrText = __decision.knowledgeQuery;
        // IMAGE_EVIDENCE_V1: a vague ask about a screenshot retrieves for what the screenshot shows.
        if (__imageEvText && __imageRelated) __retrText = String(__retrText || '') + '\n' + __imageEvText.slice(0, 500);
        if (__retrText !== String(text || '').trim()) console.log('FAQ_RETRIEVE_PENDING_ASK', conversationId);
        let __defOf = '';
        try {
          const __t = require('./statePresend/typoNormalizer').normalizeText(__retrText);
          if (planIntent(__t) === 'definition') {
            const __p = COMPARABLE_PRODUCTS.filter(([, re]) => re.test(__t)).map(([label]) => label);
            if (__p.length === 1) __defOf = __p[0];
          }
        } catch (_) { /* optional */ }
        const __priorClients = collectClientMessageTexts(full).slice(0, -1);
        // The client question Luna's last clarifying question was about (if the latest message answers it).
        let __answeredQuestion = '';
        try {
          const __pub = parts.filter((p) => p && p.part_type !== 'note' && p.body && ['admin', 'bot', 'user', 'lead'].includes((p.author || {}).type));
          const __li = __pub.map((p) => (p.author || {}).type).lastIndexOf('user') >= 0 ? __pub.length - 1 : -1;
          const __lastBot = __pub.slice(0, __li).reverse().find((p) => ['admin', 'bot'].includes((p.author || {}).type));
          if (__lastBot && /\?\s*$/.test(stripHtml(__lastBot.body || '')) && !/\?/.test(String(text || ''))) {
            const __bi = __pub.indexOf(__lastBot);
            const __q = __pub.slice(0, __bi).reverse().find((p) => ['user', 'lead'].includes((p.author || {}).type) && /\?/.test(stripHtml(p.body || '')));
            if (__q) __answeredQuestion = stripHtml(__q.body || '').slice(0, 300);
          }
        } catch (_) {}
        const hit = await retrieveApprovedEvidence(
          faqKb,
          __retrText,
          Object.assign(__defOf ? { definitionOf: __defOf } : {}, { priorClientTexts: __priorClients, answeredQuestion: __answeredQuestion })
        );
        if (hit && hit.followupMerged) console.log('FAQ_RETRIEVE_FOLLOWUP_MERGED', conversationId, hit.followupMerged);
        if (hit && hit.definitionContext) console.log('FAQ_RETRIEVE_DEFINITION_CONTEXT', conversationId, __defOf);
        if (hit && hit.perProduct) console.log('FAQ_RETRIEVE_PER_PRODUCT', conversationId, hit.perProduct.join(' | '));
        if (hit && hit.productBundles) console.log('FAQ_RETRIEVE_PRODUCT_BUNDLE', conversationId, hit.productBundles.join(' | '));
        if (hit && hit.block) {
          officialFaqBlock = '\n\nOFFICIAL FAQ CONTEXT:\n' + hit.block + '\n';
          // Same evidence the model was given is handed to the presend gate, so factual
          // checks audit against approved sources instead of always receiving null.
          __presendKnowledge = [{ title: 'Official FAQ', text: hit.block, score: 0.72, source: hit.from || 'faq-kb' }];
          console.log('FAQ_RETRIEVE', conversationId, hit.count || 0,
            JSON.stringify([...new Set((String(hit.block || '').match(/articles\/(\d{6,})/g) || []).map((x) => x.slice(9)))].slice(0, 8))); /* TURN_DIAG_V1: evidence article ids */
        }
      } catch (e) {
        console.error('FAQ_RETRIEVE_FAIL', 'class=' + (e && e.name || 'Error'));
      }
    }

    // A comparison uses complete, current canonical product articles. Retrieval snippets
    // alone cannot establish whether a field is shared, different, or unpublished.
    if (__decision.kind === 'general-faq' && faqKb && typeof faqKb.getArticles === 'function') {
      try {
        const __priorClientTexts = collectClientMessageTexts(full).slice(0, -1);
        if (productComparison.isComparisonTurn(text, __decision.knowledgeQuery, __priorClientTexts)) {
          const __priorPublic = parts.slice().reverse().find((p) => p && p.part_type !== 'note' &&
            ((p.author || {}).type === 'admin' || (p.author || {}).type === 'bot') && p.body);
          __comparison = productComparison.focusedTable(
            productComparison.build(__decision.knowledgeQuery || text, faqKb.getArticles(), __priorClientTexts),
            text, __priorPublic ? stripHtml(__priorPublic.body) : '');
          if (__comparison) {
            const __ids = new Set(__comparison.pair.flatMap((p) => p.source.map((s) => s.id)));
            const __sources = faqKb.getArticles().filter((a) => __ids.has(a.id));
            const __prodOf = (a) => (typeof faqKb.inferArticleProduct === 'function' ? faqKb.inferArticleProduct(a) : a.product) || null;
            const __fullEvidence = __sources.map((a) => 'TITLE: ' + a.title + '\nURL: ' + (a.url || '') + (__prodOf(a) ? '\nPRODUCT: ' + __prodOf(a) : '') + '\n' + productComparison.plain(a.body)).join('\n\n');
            officialFaqBlock += '\n\nCOMPLETE CANONICAL PRODUCT ARTICLES:\n' + __fullEvidence + '\n';
            __presendKnowledge = (__presendKnowledge || []).concat(__sources.map((a) => ({ title: a.title, product: __prodOf(a), text: productComparison.plain(a.body), source: a.url || a.id, score: 1 })));
            console.log('PRODUCT_COMPARISON_TABLE', conversationId, __comparison.pair.map((p) => p.id).join(' vs '), __comparison.fields.filter((f) => f.different).map((f) => f.key).join(','));
          }
        }
      } catch (e) { console.error('PRODUCT_COMPARISON_BUILD_FAILED', conversationId, 'class=' + (e && e.name || 'Error')); }
    }

    const history = buildHistory(full, 50);
    let userMsg =
      'Client name: ' +
      (bits.name || '') +
      '\nClient email: ' +
      (bits.email || '') +
      '\nConversation id: ' +
      conversationId +
      '\n\nFULL TICKET HISTORY:\n' +
      history +
      '\n\nLatest client message:\n' +
      text +
      officialFaqBlock;
    if (__comparison) userMsg += '\n\n' + productComparison.tableText(__comparison, /exact options|which options|list (?:them|the options)/i.test(text));
    if (continuousOwnershipOf(parts).active) {
      userMsg += '\n\nCONTINUOUS TEAMMATE DELEGATION: An authorized teammate asked Luna to assist this client through the conversation. Keep using the full history and answer each new relevant customer turn without another mention. Ask only necessary questions. A previous human greeting or assignment is not a current takeover; a later human public reply or stop instruction ends this delegation. Do not duplicate an existing escalation or note. Follow normal factual, account, and safety rules.';
    } else if (control.isReplyAllowed(conversationId)) {
      userMsg += '\n\nTICKET-SCOPED REPLY PERMISSION: The owner explicitly resumed Luna replies on this ticket. A prior human teammate greeting or assignment does not by itself require silence here. Answer the latest client request under the normal fact, escalation, and pre-send rules.';
    }
    try {
      const __follow = contextualFollowUp.resolveContextualFollowUp({ parts, latestText: text });
      if (__follow.reason === 'attribute-followup' && __follow.priorAsk) {
        userMsg += '\n\nCONTEXT FOR THIS SHORT FOLLOW-UP: It refers to the most recent client product/rule question: "' +
          __follow.priorAsk.slice(0, 240) + '". Answer the latest attribute question for that subject using the current official FAQ; do not treat it as a new off-topic question.';
      }
      if (__decision && __decision.resolvedAsk && /^(?:CONTEXTUAL_FOLLOWUP|CONTINUATION|EXPLICIT_QUESTION|NEW_TOPIC)$/.test(String(__decision.intentReason || ''))) {
        userMsg += '\n\nCONTEXTUAL FOLLOW-UP: The latest message continues the active topic. Answer this directly: ' +
          String(__decision.resolvedAsk).slice(0, 400) +
          '. Do not ask the client to restate the topic. If one detail is still ambiguous, ask one specific question about that detail only.';
        console.log('TURN_INTENT_CONTEXT', conversationId, __decision.intentReason);
      }
    } catch (_) {}
    /* MIXED_GENERAL_WITH_ACCOUNT_V1 (2026-09-24): "how long does payout processing take, and why is my payout
     * still pending?" used to get only the canned account-number ask (collect-first) or only the escalation
     * line, silently dropping the general question. When a message mixes general question(s) with the
     * client's own account matter, answer ONLY the general part (no account details, no identity ask,
     * gated like any reply) and put it in the same message as the identity ask / handoff line. */
    let __mixedPrefixMemo = null;
    const __mixedGeneralPrefix = async () => {
      if (__mixedPrefixMemo !== null) return __mixedPrefixMemo;
      __mixedPrefixMemo = '';
      try {
        if (__teammateScope) return '';
        const general = __decision.generalAsks;
        const hasAcct = replyDecision.requiresIdentity(__decision);
        if (!general.length || !hasAcct || !__episode.canRegenerate()) return '';
        __episode.chargeRegeneration();
        const r = await lunaModel.create(openai, {
          model: control.getModel(),
          ...modelConfig.answerParams({ tools: false, purpose: 'reply.mixed-general-part', conversationId, episode: __episode, phase: 'regeneration' }),
          conversationId,
          episode: __episode,
          messages: [
            { role: 'system', content: control.getPrompt() },
            { role: 'user', content: userMsg + '\n\nHARD OVERRIDE: The client asked general question(s) and also raised something about their own account. Answer ONLY these general question(s) from OFFICIAL FAQ CONTEXT: ' +
              general.map((g) => '"' + g.slice(0, 200) + '"').join('; ') +
              '. Do NOT discuss, assume or speculate about the client\'s own account, payout status or case, and do NOT ask for an account number or email (that is handled separately). If the context states no answer or figure for a part, say naturally that there is no fixed figure or answer you can confirm for that part (for example "I can\'t confirm a fixed timeframe for that"), never mentioning the official information, the FAQ or any source (SOURCE_TALK_FREE_V1). Only state a timeframe for exactly what the context says it applies to (for example, a delivery time AFTER approval is not the approval or processing time). ACTION: REPLY.' },
          ],
        });
        const pr = parseAction((((r.choices[0] || {}).message || {}).content) || '');
        if (!(pr.action === 'REPLY' && pr.body)) return '';
        const cand = postProcessModelReply(pr.body, conversationId);
        if (teammateTopicOwnership.scopedBodyViolation(cand)) { console.log('MIXED_GENERAL_PART rejected (identity ask / handoff in answer)', conversationId); return ''; }
        const genText = general.join('\n');
        // Judge only the general part (the account part is handled by the identity/handoff flow), the same
        // way the Batch 3 mixed route does; restore the real inbound text afterwards.
        try { __statePresend.noteInbound(conversationId, genText, Object.assign({}, latestUser, { body: genText })); } catch (_) {}
        const g = await __statePresend.gate({ conversationId, draft: cand, latestUser: Object.assign({}, latestUser, { body: genText }), clientName,
          history: parts.filter((p) => String((p && p.id) || '') !== String((latestUser && latestUser.id) || '')), knowledge: __presendKnowledge });
        try { __statePresend.noteInbound(conversationId, t, latestUser); } catch (_) {}
        if (g && g.send && g.body) { __mixedPrefixMemo = g.body; console.log('MIXED_GENERAL_PART answered with account flow', conversationId, 'general', general.length); }
        else console.log('MIXED_GENERAL_PART held', conversationId, (g && g.reason) || '');
      } catch (e) { console.error('MIXED_GENERAL_PART_ERR', conversationId, 'class=' + (e && e.name || 'Error')); }
      return __mixedPrefixMemo;
    };
    {
      const __plan = (__comparison || __pureSocial) ? '' : buildAnswerPlan(text, { evidence: officialFaqBlock });
      if (__plan) { userMsg += __plan; console.log('ANSWER_PLAN', conversationId, planIntent(__clientMeaning.text || text)); }
    }
    if (__clientMeaning.changed) {
      userMsg +=
        '\n\nINTERNAL READING OF THE LATEST MESSAGE (spelling/phonetic slips read through, not client-facing):\n"' +
        __clientMeaning.text +
        '"\nAnswer that intended question naturally. Do NOT correct the spelling, quote the mistake, or mention that you interpreted anything. Do NOT ask what they meant when the intent is this clear.';
    }
    if (septemberPromos && !__pureSocial && !isClearlyAccountSpecificIssue(text)) {
      try {
        const promoResolved = resolvePromoReply(text, full);
        if (promoResolved && promoResolved.reply) {
          {
            const __promoFail = isPromoCodeFailureAsk(text);
            userMsg +=
              '\n\nHARD SEPTEMBER 2026 PROMOTION FACT (authoritative factual payload, not client-facing copy; do not invent %, codes, eligibility, bulk, or activation-fee claims beyond this):\n' +
              promoResolved.reply +
              '\nUse these facts, but write the answer yourself in natural language matched to the client and conversation. Never paste the factual payload verbatim or use a compressed parenthetical list of every code. Answer what was asked, briefly explain the relevant option(s), and ask only one useful challenge/eligibility question when needed. If the client repeated the question, acknowledge that and explain it from a different angle instead of repeating the prior wording. Do NOT ask for account number or email. ' +
              (__promoFail
                ? 'PROMO_CHECKOUT_FAILURE_V1: the client reports a named code is not applying at checkout/dashboard. Confirm eligibility from the facts above (NEW50 = never-purchased new clients; not product-bound except Catalyst). Do NOT invent "NEW50 is not listed for this challenge" or force OCT35 as a substitute when they asked about NEW50. If they already meet eligibility and the code still will not apply, ESCALATE for teammate/backend review — this is not a general promo FAQ. If they also mention a conflicting expiry email (SOT says NEW50 never expires), escalate that discrepancy rather than inventing an expiry.'
                : 'Do NOT escalate a general promo FAQ. Preserve promo topic across short follow-ups; Free Retry+Lite same OCT35 , do not ask which; bulk = natural wording, auto-increase, final % at checkout , never canned 1=35%/2=40% script. NEW50 is for brand-new never-purchased clients and is not product-bound (except Catalyst); never tell an eligible new client that NEW50 is not the listed code for their challenge.' +
                  ((String(promoResolved.product || '') === 'general' || /\bcurrent\s+promotions?\b/i.test(String(text || '')) ||
                    (typeof septemberPromos.promoAskKind === 'function' && septemberPromos.promoAskKind(text) === 'overview'))
                    ? ' GENERAL_CURRENT_PROMOS_V2: overview = one labelled bullet per ACTIVE code (OCT35, FLASH5, NEW50) — benefit + one condition. Do NOT dump every eligible size/product/tier. Do NOT list $50k/$100k/$200k/$300k/$400k. Summarize Instant Elite as selected sizes having higher discounts. Human support tone. Bold only code, main discount, one critical condition. Then ask which challenge they want to purchase. Do NOT answer with only a 2-Step OCT35 line.'
                    : (typeof septemberPromos.promoShapeGuidance === 'function' ? ' ' + septemberPromos.promoShapeGuidance(septemberPromos.promoAskKind(text)) : '')));
            console.log('PROMO_INJECT', conversationId, promoResolved.product || '', __promoFail ? 'checkout-failure' : '');
            try {
              const __promoEv = String(promoResolved.reply || '').trim();
              if (__promoEv) {
                __presendKnowledge = (__presendKnowledge || []).concat([{
                  title: 'FundedElite current promotions (authoritative SOT)',
                  text: __promoEv,
                  source: 'september-promos',
                  score: 1
                }]);
              }
            } catch (_) { /* keep existing knowledge */ }
          }
        }
      } catch (e) {
        console.error('PROMO_INJECT_FAIL', 'class=' + (e && e.name || 'Error'));
      }
    }
    if (imageAtts.length) {
      /* LUNA_IMAGE_UNDERSTAND_V1:BEGIN:image-note */
      const __imgExplain = (typeof __imageAskGuard.isImageExplainAsk === 'function' && __imageAskGuard.isImageExplainAsk(text))
        || /\b(?:what\s+does\s+(?:this|that)|explain\s+(?:this|that)|check\s+this|what\s+error|why\s+(?:is\s+)?(?:this|that))\b/i.test(String(text || ''));
      userMsg +=
        '\n\nIMAGE NOTE: ' +
        imageAtts.length +
        ' image(s) attached to the latest client message and loaded for you to see. ' +
        'You CAN see them — never say you cannot see, read, open, or access the screenshot, and never say it is not something you can help with. ' +
        (__imgExplain
          ? 'The client is asking what THIS screenshot means. Bind the question to the attached image (not only prior text). Describe what is visibly shown, then explain it with FundedElite KB when needed. Visible prices, %, selected options, and labels are display evidence from the image — restate them as what the screenshot shows, not as universal policy you invented. Answer directly when the screenshot + KB is enough; do NOT ask for account number or escalate just to explain a readable screenshot. If a detail is unreadable, ask for one clearer screenshot of that part — never ask for account number instead.'
          : 'Read them carefully. Answer from what is visible plus approved KB when needed. If a critical detail is unreadable, ask for one clearer screenshot of that part. Escalate only when the issue is genuinely account-specific and cannot be answered from the image + KB. Do not guess account-specific outcomes.');
      /* LUNA_IMAGE_UNDERSTAND_V1:END:image-note */
    }
    /* IMAGE_EVIDENCE_V1:BEGIN:prompt */
    if (__imageFacts) {
      const __minsAgo = __imageRecent && __recentImagePart
        ? Math.max(0, Math.round((Number(latestUser.created_at || 0) - Number(__recentImagePart.created_at || 0)) / 60)) : null;
      userMsg += imageEvidence.promptBlock(__imageFacts, {
        recent: __imageRecent, minutesAgo: __minsAgo, payoutGuidance: imageEvidence.payoutGuidanceFor(__imageFacts),
      });
    }
    /* IMAGE_EVIDENCE_V1:END:prompt */
    if (isShortClientAck(text, parts)) {
      /* MICHAN_TEAMMATE_HANDOFF_V1: short-ack after teammate must not You're-welcome / restart */
      if (
        teammateHandoffGates.humanTeammateAlreadyRepliedPublic(parts, {
          arsalId: ARSAL_ID,
          eliteAiId: ELITE_AI_ID,
        })
      ) {
        console.log('SKIP short-ack after teammate (no youre-welcome)', conversationId);
        return res.sendStatus(200);
      }
      userMsg +=
        '\n\nHARD OVERRIDE , SHORT CLIENT ACK: The client only acknowledged your last message (sure/okay/thanks/got it/will do). Reply with a brief warm acknowledgment only (e.g. You\'re welcome, [Name]!). Do NOT repeat any instruction, reminder, or next-step you already gave. That point is closed unless they ask a new question.';
      console.log('SHORT_ACK_OVERRIDE', conversationId);
    } else if (lastLunaPublicAskedClarification(parts) && /^(yes|yep|yeah|yup|no|nope|nah)\b/i.test(String(text || '').trim()) && !reviewRequestFlow.isResolutionClosure(text)) {
      userMsg +=
        '\n\nHARD OVERRIDE , CLARIFICATION ANSWER: The client answered your previous clarifying question with "' +
        String(text || '').trim().slice(0, 40) +
        '". Treat that as the answer in context. Do NOT repeat the same clarification. Continue with the next useful step using what they confirmed (and any screenshot/platform already established). Do NOT claim a teammate was contacted unless a real handoff succeeded.';
      console.log('CLARIFICATION_ANSWER_OVERRIDE', conversationId);
    }
    // PLATFORM_NAME_PRESERVE_V1: keep established platform facts (conversation + screenshot OCR/text).
    try {
      const __platCorpus = [
        text,
        ...collectClientMessageTexts(full).slice(-12),
        String((__imageFacts && (__imageFacts.text || __imageFacts.summary || '')) || ''),
        String((__lateImageEv && __lateImageEv.text) || ''),
      ].join('\n');
      const __knownPlat = [];
      if (/\bmatch\s*-?\s*trader\b/i.test(__platCorpus)) __knownPlat.push('MatchTrader');
      if (/\bmeta\s*-?\s*trader\s*5\b|\bmetatrader\s*5\b|\bmt\s*5\b/i.test(__platCorpus)) __knownPlat.push('MetaTrader 5');
      if (/\btradelocker\b/i.test(__platCorpus)) __knownPlat.push('TradeLocker');
      if (__knownPlat.length) {
        userMsg +=
          '\n\nKNOWN PLATFORM FACTS (internal): The conversation and/or screenshot already establish: ' +
          __knownPlat.join(', ') +
          '. Do NOT re-ask which platform. When answering which platforms a challenge uses, name MetaTrader 5 explicitly when the FAQ lists it (never the vague phrase "the trading platform").';
        console.log('KNOWN_PLATFORM_FACTS', conversationId, __knownPlat.join(','));
      }
    } catch (_) {}
    if (repeatedClientQuestion) {
      // No meta-acknowledgement: the live reply opened with "You're right to ask again." (robotic, and it
      // reads as conceding an error). Lead with the clearer answer itself.
      userMsg += '\n\nREPEATED CLIENT QUESTION: The client still needs the answer. Give the same verified answer more clearly, in fresh wording or from another angle, starting directly with the answer. Do not comment on the question being repeated, do not apologise, and do not open with phrases like "You\'re right to ask again" or "As I mentioned". Preserve every fact, number, eligibility condition, and policy. Do not paste the previous reply or change the answer for variety.';
    }
    if (__pureSocial && __supportMeta) {
      userMsg += '\n\nCONVERSATION TURN (internal): the latest client message manages the support conversation (for example asking whether they may ask something, saying they have questions, checking whether you are free, available or there, or asking to continue). It is FundedElite support, never off-topic and never personal. ' +
        'Reply in one short, natural sentence of plain text that says yes and invites their question (for example "Of course, go ahead!" or "Absolutely, what would you like help with?"). ' +
        (__social.components.includes('ask-wellbeing') ? 'They also asked how you are: say you are doing well first. ' : '') +
        'No headings, bullets or bold, no product, rule or account information, no escalation, no [[SCOPE_DECLINE]]. ACTION: REPLY.';
    } else if (__pureSocial) {
      const __askedBefore = lunaAlreadyAskedWellbeing(__priorBotSocial);
      userMsg += '\n\nSMALL TALK TURN (internal): the latest client message is only social courtesy (' + (__social.components.join(', ') || 'greeting') + '), not a support question. ' +
        'Reply in one or two short, natural sentences of plain text: no headings, bullets or bold, no product, rule or account information, no escalation. ' +
        (__social.components.includes('ask-wellbeing') ? 'They asked how you are: answer that directly first (for example "I\'m doing well, thanks for asking!"), never only "I\'m here and ready to help". ' : '') +
        (__social.components.includes('wellbeing-answer') ? 'They told you how they are: acknowledge it warmly (for example "Glad to hear that!"). ' : '') +
        (__social.components.includes('compliment') ? 'They paid you a compliment: thank them warmly and briefly (for example "That\'s kind of you to say, thank you!"); do not say how you are unless they asked. ' : '') +
        ((__askedBefore || __social.components.includes('wellbeing-answer')) ? 'You already asked how they are in this conversation (or they already told you), so do NOT ask how they are again. ' : '') +
        'You may add a short, friendly offer to help. ACTION: REPLY.';
    }
    userMsg += '\n\nRespond with ACTION format only. Do not invent or use a personal support-agent identity. Mention being an AI assistant ONLY if the client directly asks whether you are an AI, a bot, or a human. Do NOT say you are an AI for personal questions (wife, father, mother, family, age, etc.). For those, briefly decline without an AI disclosure and redirect to FundedElite support.';
    /* TEAMMATE_TOPIC_OWNERSHIP_V1:BEGIN:instruction */
    if (__teammateScope) {
      userMsg +=
        '\n\nORIGINAL PENDING CLIENT MESSAGE(S) (context only):\n' +
        (__teammateScope.pending || []).map((m) => '- ' + m.text).join('\n') +
        teammateTopicOwnership.buildScopedInstruction(__teammateScope);
    }
    /* TEAMMATE_TOPIC_OWNERSHIP_V1:END:instruction */

    const userContent = __visionAtts.length /* IMAGE_EVIDENCE_V1 */
      ? await buildVisionUserContent(userMsg, __visionAtts)
      : userMsg;
    if (imageAtts.length) {
      const imgParts = Array.isArray(userContent) ? userContent.filter((c) => c && c.type === 'image_url').length : 0;
      console.log('IMAGE_IN', conversationId, 'atts', imageAtts.length, 'loaded', imgParts);
      /* LUNA_SPREAD_IMAGE_FIXES_V1:BEGIN:hookC */
      try { __imageAskGuard.hookC(conversationId, imgParts, imageAtts.length); } catch (__e) { console.error('[imageAskGuard.hookC] guard hook failed', 'class=' + (__e && __e.name || 'Error')); }
      /* LUNA_SPREAD_IMAGE_FIXES_V1:END:hookC */
      if (!imgParts) {
        console.log('IMAGE_LOAD_NONE , escalate path preferred if model unsure', conversationId);
      }
    }

    /* LUNA_TOOLS_V1:BEGIN:runChat */
    const __lunaChat = (__decision.kind === 'account' && accountCheckRequest.isExplicitAccountCheckRequest(text))
      ? { rawOut: 'ACTION: ESCALATE\nKIND: ACCOUNT\nCLIENT: I will ask a support teammate to check this for you.\nBODY: Review the client-specific account or trade record requested in the latest message.\nACTION_NEEDED: Check the requested private record and reply with the result.', retrievedKnowledge: [], route: 'ACCOUNT_CHECK' }
      : await lunaToolsRuntime.runChat({
      openai,
      control,
      __statePresend,
      conversationId,
      parts,
      latestUser,
      text,
      imageAtts,
      imageEvidenceText: __imageEvText, /* IMAGE_EVIDENCE_V1 */
      userContent,
      faqKb,
      imageAskGuard: __imageAskGuard,
      getEscalateState: (cid) => getConvState(cid).state,
      // Same episode/budget as the rest of this event, plus the knowledge already retrieved
      // above so the router and the effort policy see real evidence level instead of guessing.
      episode: __episode,
      knowledge: __presendKnowledge,
      knowledgeLevel: (__presendKnowledge && __presendKnowledge.length) ? 'supported' : 'missing',
      // A request to inspect private account/trade records needs a teammate.
      // Keep it out of FAST's plain-answer path before the model drafts text.
      forceFull: __decision.kind === 'account' && accountCheckRequest.isExplicitAccountCheckRequest(text),
      smalltalk: __pureSocial, /* SMALLTALK_COURTESY_V1: FAST, no tools, no promotion */
      // FAST has no tools, so if the model decides it lacks evidence its only exit is to hand
      // off — and the owner's standing rule forbids escalating a general product/policy
      // question the FAQ covers. This reuses the SAME predicates the ESCALATE->REPLY force
      // below already trusts, so there is one rule, not two. Promotion gives the model
      // search_knowledge instead of a teammate.
      shouldPromoteOnDraft: (rawDraft) => {
        try {
          if (!rawDraft) return false;
          const __draftAction = parseAction(rawDraft).action;
          // TEAMMATE_TOPIC_OWNERSHIP_V1: a scoped general ask the FAST route could not answer
          // (SKIP/ESCALATE) gets one knowledge-search retry on the SAME scoped ask before silence.
          if (__teammateScope && (__draftAction === 'SKIP' || __draftAction === 'ESCALATE')) {
            console.log('TEAMMATE_SCOPE_PROMOTE_FULL', conversationId, __draftAction);
            return true;
          }
          // A fluent REPLY can still be a third-person summary. Promote only when that
          // ask is one approved knowledge can answer, so search_knowledge runs before
          // Luna gives up. Account-specific asks are not promoted.
          if (publicRestatementGuard.shouldPromoteRestatement(rawDraft, text, {
            parseAction,
            isKnowledgeAnswerable: isKnowledgeAnswerableAsk,
          })) {
            console.log('PUBLIC_RESTATEMENT_PROMOTE', conversationId);
            return true;
          }
          if (__draftAction !== 'ESCALATE') return false;
          return isKnowledgeAnswerableAsk(text);
        } catch (_) { return false; }
      },
    });
    let rawOut = __lunaChat.rawOut;
    /* IMAGE_EVIDENCE_V1:BEGIN:model-reading-fallback
     * The extraction read failed but the model was given the screenshot itself: its own attributed reading ("the card
     * shows 24hrs ...") becomes this turn's image evidence, so pre-send does not reject the screenshot's figures and
     * go silent. Only used when there is no extracted evidence at all. */
    try {
      if (__imageTurn && __imageRelated && __visionAtts.length && !__imgEv()) {
        const __mr = imageEvidence.modelReadingEvidence(parseAction(rawOut || '').body || '');
        if (__mr) {
          __lateImageEv.text = __mr;
          __statePresend.noteVisionHint(conversationId, __mr);
          console.log('IMAGE_EVIDENCE_FALLBACK model-reading', conversationId, 'chars', __mr.length);
        }
      }
    } catch (_) { /* optional */ }
    /* IMAGE_EVIDENCE_V1:END:model-reading-fallback */
    // TOOL_BUDGET_FINAL_V1 (2026-09-28): the model/tool runtime produced NO draft at all (budget, deadline,
    // incomplete final and failed recovery). An empty draft used to fall through to "SKIP empty reply body"
    // - silent. Hand it to the existing ESCALATE path instead; the usual gates still decide what the client
    // sees (a teammate handoff, or the stock clarify for a general question).
    {
      const __ep = (__lunaChat && __lunaChat.episode) || __episode;
      const __why = __ep && __ep.fallbackReason;
      if (!String(rawOut || '').trim() && __why) {
        console.log('TOOL_BUDGET_EMPTY_FALLBACK', conversationId, 'len=' + String(__why || '').length);
        const __whyS = String(__why || '');
        // AUTH_RUNTIME_NO_SCOPE_DECLINE_V1 (215476169761054): auth/runtime empty drafts must never
        // become [[SCOPE_DECLINE]] ("I only handle FundedElite"). Short wait-acks stay silent.
        const __authOrRuntime = /auth|runtime|rate_limit|budget|deadline|tools-runtime|tool-round-failed|incomplete/i.test(__whyS);
        let __waitAck = false;
        try { __waitAck = !!(isShortClientAck(text) || (escalateRelatedOnly && typeof escalateRelatedOnly.isShortAck === 'function' && escalateRelatedOnly.isShortAck(text))); } catch (_) { __waitAck = !!isShortClientAck(text); }
        if (__waitAck && (__authOrRuntime || (escState && escState.escalateAwaitingFirstTeammate))) {
          console.log('TOOL_BUDGET_EMPTY_FALLBACK wait-ack silence', conversationId, 'len=' + __whyS.length);
          rawOut = 'ACTION: SKIP\nBODY:';
        } else if (__authOrRuntime) {
          if (isClearlyAccountSpecificIssue(text) || clientWantsHumanTeammate(text)) {
            rawOut =
              'ACTION: ESCALATE\nKIND: ACCOUNT\nCLIENT: I will ask a support teammate to check this for you.\nBODY: Luna could not produce a reply to the latest client message.\nACTION_NEEDED: Please answer the client\'s latest message.';
          } else {
            rawOut =
              'ACTION: ESCALATE\nKIND: FAQ_CONFIRM\nCLIENT: I will ask a support teammate to check this for you.\nBODY: Luna could not produce a reply to the latest client message.\nACTION_NEEDED: Please answer the client\'s latest message.';
          }
        } else if (
          // Do not force KIND: ACCOUNT on off-topic / general empty drafts — that asked for an
          // account number on Fiboniq-style spam once Account: Not provided notes were banned.
          !isClearlyAccountSpecificIssue(text) &&
          !clientWantsHumanTeammate(text) &&
          typeof looksFundedEliteRelated === 'function' &&
          !looksFundedEliteRelated(text)
        ) {
          rawOut =
            'ACTION: REPLY\nBODY: [[SCOPE_DECLINE]] Thanks for reaching out — I only handle FundedElite support here.';
        } else if (isClearlyAccountSpecificIssue(text) || clientWantsHumanTeammate(text)) {
          rawOut =
            'ACTION: ESCALATE\nKIND: ACCOUNT\nCLIENT: I will ask a support teammate to check this for you.\nBODY: Luna could not produce a reply to the latest client message.\nACTION_NEEDED: Please answer the client\'s latest message.';
        } else {
          rawOut =
            'ACTION: ESCALATE\nKIND: FAQ_CONFIRM\nCLIENT: I will ask a support teammate to check this for you.\nBODY: Luna could not produce a reply to the latest client message.\nACTION_NEEDED: Please answer the client\'s latest message.';
        }
      }
    }
    // Audit the draft against everything the model actually read, not only the slice retrieved
    // from the client's raw message. Both come from the same approved FAQ, so this widens the
    // evidence without admitting any new source. See live conversation 215476025058340, where a
    // correct 0,5% figure was failed as UNSUPPORTED_NUMBER because the auditor never saw the
    // article the model had looked up.
    if (Array.isArray(__lunaChat.retrievedKnowledge) && __lunaChat.retrievedKnowledge.length) {
      const seen = new Set((__presendKnowledge || []).map((k) => k.text));
      const extra = __lunaChat.retrievedKnowledge.filter((k) => k && k.text && !seen.has(k.text));
      if (extra.length) {
        __presendKnowledge = (__presendKnowledge || []).concat(extra);
        console.log('PRESEND_KNOWLEDGE_MERGED', conversationId, extra.length, 'tool article(s)');
      }
    }
    /* LUNA_TOOLS_V1:END:runChat */
    const parsed = parseAction(rawOut);
    /* SMALLTALK_COURTESY_V1: courtesy never escalates and never goes silent for lack of a draft; the reply
     * answers "how are you" directly and does not repeat Luna's own how-are-you question. */
    if (__pureSocial) {
      /* emoji/punctuation-only drafts get stripped to nothing by the reply formatter/boundary, so treat them as empty */
      if (parsed.action === 'ESCALATE' || (parsed.action === 'SKIP' && __supportMeta) || (parsed.action === 'REPLY' && !/[\p{L}\p{N}]/u.test(String(parsed.body || ''))) || !String(rawOut || '').trim() ||
          /\[\[SCOPE_DECLINE\]\]/.test(String(parsed.body || '')) || BOUNDARY_REFUSAL_TEXT_RE.test(String(parsed.body || ''))) {
        console.log('SMALLTALK_DETERMINISTIC_REPLY', conversationId, parsed.action || 'none');
        parsed.action = 'REPLY';
        parsed.body = smalltalkReplyFor(text, __priorBotSocial);
      } else if (parsed.action === 'REPLY') {
        const __shaped = shapeSocialReply(parsed.body, text, __priorBotSocial);
        parsed.body = (__shaped && /[\p{L}\p{N}]/u.test(__shaped)) ? __shaped : smalltalkReplyFor(text, __priorBotSocial);
      }
    }
    try {
      const __polCtx = { priorClientTexts: collectClientMessageTexts(full).slice(0, -1) };
      const applied = policyFactGuard.applyPolicyFacts(text, parsed, __polCtx);
      if (applied && (applied.action !== parsed.action || applied.body !== parsed.body)) {
        console.log('POLICY_FACT_GUARD', conversationId, applied.reason);
        parsed.action = applied.action;
        parsed.body = applied.body;
      }
    } catch (e) {
      console.error('POLICY_FACT_GUARD fail', conversationId, 'class=' + (e && e.name || 'Error'));
    }
    if (__comparison && parsed.action !== 'REPLY') {
      // Only force the canonical table when THIS turn is itself an explicit
      // compare / two-product ask (or a short field follow-up that still reads
      // as a comparison). Calculation / interpretation questions that merely
      // reuse a prior pair in history must keep the model's ESCALATE/answer
      // (live 215476215969258: "same day" net-profit ask → Instant/Elite matrix).
      const __latestCompare = typeof productComparison.isExplicitComparisonAsk === 'function'
        ? productComparison.isExplicitComparisonAsk(text)
        : productComparison.isComparisonTurn(text, text, []);
      if (__latestCompare) {
        console.log('PRODUCT_COMPARISON_MODEL_NONREPLY', conversationId, parsed.action);
        parsed.action = 'REPLY';
        parsed.body = productComparison.render(__comparison, /exact options|which options/i.test(text));
      } else {
        console.log('PRODUCT_COMPARISON_NONREPLY_SKIP', conversationId, parsed.action, 'latest-not-explicit-compare');
        __comparison = null;
      }
    }
    // The model tags almost every turn ACCOUNT. For a REPLY that tag is never read again - the
    // account/FAQ decision is made from the text by presendNeedsBackendLook() - but an auditor
    // reading the log cannot tell, so record the classification that actually applies.
    console.log('AI_ACTION', conversationId, parsed.action, parsed.kind || '');
    if (parsed.action === 'REPLY') {
      console.log('AI_KIND_EFFECTIVE', conversationId,
        __decision.kind, '(model tag:', (parsed.kind || 'none') + ')');
    }

    // Client asked for human/manager: do not keep REPLY-ing. Escalate (fail closed).
    // Vague first Fin→Arsal takeover already returned via FIN_HANDOFF_WELCOME above.
    if (
      !__teammateScope &&
      parsed.action === 'REPLY' &&
      clientWantsHumanTeammate(text) &&
      (arsalHasPublicClientReply(parts) || !isVagueOrLiveAgentOnlyAsk(text))
    ) {
      parsed.action = 'ESCALATE';
      if (!parsed.kind) parsed.kind = 'ACCOUNT';
      if (!parsed.problem) parsed.problem = text;
      if (!parsed.actionNeeded) {
        parsed.actionNeeded = 'Client requested a human teammate / manager / live agent. Please take over.';
      }
      console.log('FORCE_ESCALATE client_wants_human', conversationId);
    }

    if (deferredHumanOwnedFaq.has(conversationId)) {
      const __defPrep = deferredHumanOwnedFaq.get(conversationId);
      if (parsed.action === 'CLOSE' || parsed.action === 'SKIP') {
        deferredHumanOwnedFaq.delete(conversationId);
      } else if (__defPrep && __defPrep.plan) {
        deferredHumanOwnedFaq.delete(conversationId);
        const __defExec = await faqAssistance.execute(__defPrep.plan, full, parts, faqAssistanceDeps());
        if (__defExec && __defExec.handled) return res.sendStatus(200);
      } else {
        deferredHumanOwnedFaq.delete(conversationId);
      }
    }

    /* TEAMMATE_TOPIC_OWNERSHIP_V1:BEGIN:action
     * Scoped mode may only ever produce a client REPLY to the general asks. ESCALATE gets ONE
     * regeneration restricted to the same general asks (never a note, assignment or identity ask);
     * SKIP / CLOSE / anything else is silence — a teammate owns this ticket. */
    if (__teammateScope && parsed.action === 'ESCALATE' && __episode.canRegenerate()) {
      try {
        __episode.chargeRegeneration();
        const force = await lunaModel.create(openai, {
          model: control.getModel(),
          ...modelConfig.answerParams({
            tools: false, purpose: 'reply.teammate-scope-force',
            conversationId, episode: __episode, phase: 'regeneration',
          }),
          conversationId,
          episode: __episode,
          messages: [
            { role: 'system', content: control.getPrompt() },
            {
              role: 'user',
              content:
                userMsg +
                '\n\nHARD OVERRIDE: These are general FundedElite questions and a human teammate already owns the account-specific matter. ' +
                'Reply with ACTION: REPLY answering ONLY the listed general question(s) from OFFICIAL FAQ CONTEXT. Do NOT escalate. ' +
                'Do NOT ask for account number or email. If the approved knowledge does not answer them, reply ACTION: SKIP.',
            },
          ],
        });
        const forced = parseAction((((force.choices[0] || {}).message || {}).content) || '');
        if (forced.action === 'REPLY' && forced.body) {
          parsed.action = 'REPLY';
          parsed.body = forced.body;
          console.log('TEAMMATE_SCOPE ESCALATE->REPLY', conversationId);
        }
      } catch (e) {
        console.error('TEAMMATE_SCOPE force fail', conversationId, 'class=' + (e && e.name || 'Error'));
      }
    }
    if (__teammateScope && parsed.action !== 'REPLY') {
      console.log('TEAMMATE_SCOPE_SILENT non-reply action', parsed.action, conversationId,
        'len=' + String(parsed.body || '').length);
      if (__teammateScope && __teammateScope.statusFallback) await postEscalateHoldingStatus(conversationId, __teammateScopeOriginalText, latestUser, clientName, getConvState(conversationId).state, 'MIXED_AWAITING_ANSWER fallback status'); /* MIXED_AWAITING_ANSWER_V1 */
      return res.sendStatus(200);
    }
    /* TEAMMATE_TOPIC_OWNERSHIP_V1:END:action */

    /* PHANTOM_TEAMMATE_SKIP_V1 (2026-09-24, real-model T5): the model returned SKIP "A human teammate is
     * handling this conversation. Do not respond over them." in a conversation where no human teammate had
     * posted anything, and the customer got silence. Real teammate ownership is decided earlier by the
     * deterministic handoff gates; a model claim of it without any human public reply is not trusted:
     * regenerate once as the only responder (REPLY, or ESCALATE if account work). */
    if (parsed.action === 'SKIP' &&
        /\b(?:human|teammate|agent|colleague|staff|support\s+team)\b[^.]{0,60}\b(?:handling|handles|owns|own|replying|responding|taking|working)\b|respond\s+over\s+(?:them|him|her)/i.test(String(parsed.body || '')) &&
        (!(parts || []).some((p) => isHumanTeammatePublicReply(p)) || control.isReplyAllowed(conversationId) || continuousOwnershipOf(parts).active) && __episode.canRegenerate()) {
      try {
        __episode.chargeRegeneration();
        console.log('PHANTOM_TEAMMATE_SKIP regenerate', conversationId);
        const __r = await lunaModel.create(openai, {
          model: control.getModel(),
          ...modelConfig.answerParams({ tools: false, purpose: 'reply.phantom-teammate-skip', conversationId, episode: __episode, phase: 'regeneration' }),
          conversationId,
          episode: __episode,
          messages: [
            { role: 'system', content: control.getPrompt() },
            { role: 'user', content: userMsg + ((control.isReplyAllowed(conversationId) || continuousOwnershipOf(parts).active)
              ? '\n\nHARD OVERRIDE: The owner explicitly allowed Luna replies on this ticket despite the earlier human teammate turn. Respond to the latest request with ACTION: REPLY, or ACTION: ESCALATE only if backend account work is genuinely required.'
              : '\n\nHARD OVERRIDE: No human teammate has replied in this conversation. You are the only responder and the client is waiting. Respond with ACTION: REPLY, or ACTION: ESCALATE only if the backend team must open this client\'s own account.') },
          ],
        });
        const __pr = parseAction((((__r.choices[0] || {}).message || {}).content) || '');
        if (__pr.action === 'REPLY' || __pr.action === 'ESCALATE') {
          Object.assign(parsed, __pr);
          console.log('PHANTOM_TEAMMATE_SKIP ->', __pr.action, conversationId);
        }
      } catch (e) { console.error('PHANTOM_TEAMMATE_SKIP_ERR', conversationId, 'class=' + (e && e.name || 'Error')); }
    }
    if (parsed.action === 'SKIP') {
      const skipBody = String(parsed.body || '');
      // Out-of-scope must be a client-facing decline, not silence — unless this is a short
      // product-family anaphora after Instant/2-Step/1-Step context (inherit FAQ instead).
      if (/scope|unrelated|off[ -]?topic|outside|not fundedelit/i.test(skipBody)) {
        const __priorBotSkip = (parts || [])
          .filter((p) => p && String(p.part_type || '') !== 'note' && ((p.author || {}).type === 'admin' || (p.author || {}).type === 'bot'))
          .map((p) => stripHtml(p.body || ''))
          .filter(Boolean);
        if (__decision.productFollowUp) {
          parsed.action = 'REPLY';
          parsed.body = challengeVariantGuard.isBothVariantsClientReply(text)
            ? challengeVariantGuard.resolveBothVariantsReply(text, __priorBotSkip, '', conversationId)
            : (parsed.body && !/scope|unrelated|off[ -]?topic/i.test(String(parsed.body)) ? parsed.body : '');
          if (!parsed.body) parsed.body = regenModule().CLARIFY_REPLY;
          console.log('SKIP->REPLY product-anaphora-inherit', conversationId);
        } else if (__decision.kind === 'smalltalk' || __decision.kind === 'support-meta') {
          // TURN_INTENT_V1: courtesy / conversation management is never out of scope.
          parsed.action = 'REPLY';
          parsed.body = smalltalkReplyFor(text, __priorBotSkip);
          console.log('SKIP->REPLY social (not scope)', conversationId);
        } else {
          parsed.action = 'REPLY';
          parsed.body = '[[SCOPE_DECLINE]]';
          console.log('SKIP->REPLY scope_decline', conversationId);
        }
      } else {
        console.log('SKIP model', conversationId, logLen(parsed.body));
        return res.sendStatus(200);
      }
    }

    if (parsed.action === 'CLOSE') {
      await closeConversation(conversationId);
      console.log('CLOSED', conversationId);
      return res.sendStatus(200);
    }

    if (parsed.action === 'ESCALATE') {
      if (
        assistantIdentityGuard.isAssistantPersonalQuestion(text) &&
        !/\b(?:fundedelite|account|payout|challenge|login|kyc)\b/i.test(String(text || ''))
      ) {
        console.log('ESCALATE blocked personal-question', conversationId);
        const personalBody = assistantIdentityGuard.enforceAssistantIdentityReply(
          text,
          parsed.body || '',
          conversationId,
          []
        );
        await postClientCommentOnce(conversationId, personalBody, latestUser, clientName);
        return res.sendStatus(200);
      }
      escState = syncEscalateTeammateFirstState(conversationId, full);
      if (escState.escalateAwaitingFirstTeammate) {
        const awaitingAttempt = evaluateAwaitingEscalationAttempt(conversationId, text, escState);
        escState = awaitingAttempt.state;
        if (awaitingAttempt.decision.action === 'SKIP') {
          console.log(awaitingAttempt.decision.log, conversationId);
          return res.sendStatus(200);
        }
        if (awaitingAttempt.decision.action === 'STATUS_ONLY') {
          await postEscalateHoldingStatus(
            conversationId,
            text,
            latestUser,
            clientName,
            escState,
            'ESCALATE blocked duplicate , awaiting teammate first'
          );
          return res.sendStatus(200);
        }
      }
      let kind = String(parsed.kind || 'ACCOUNT').toUpperCase();
      // Never treat a KB/policy question as ACCOUNT just because the model said ESCALATE.
      // isGeneralPolicyQuestion() only knows a fixed list of policy nouns, so a plain product
      // question ("What is 2 step challenge ?") slipped past it and could still open a note -
      // the same defect as live chat 215476023193727, reached by the model-ESCALATE route
      // instead of the presend hold. presendNeedsBackendLook() is the single rule for whether
      // a teammate actually has something to look at.
      // Same single rule the FAST->FULL promotion uses, so the two cannot drift apart.
      // PENDING_ASK_RESOLVE_V1: a nudge ("hello?? tell me") is judged by the question it points at.
      const __escAsk = __decision.knowledgeQuery;
      const __escAskIsPending = __escAsk !== String(text || '').trim();
      // A login / 2FA / OTP lockout is not a product FAQ. Keep the model's ACCOUNT
      // escalation so the email-keyed note is written instead of a general-faq suppress.
      const latestAuthLockout = idGates.isAuthAccessIssue(text) || idGates.clientCannotProvideAccountNumber(text);
      // Account-state discrepancies mislabeled general-faq must not be answered with a
      // handoff sentence and no note. A safe general FAQ still takes the FAQ path.
      const __priorClientsForHandoff = collectClientMessageTexts(full).slice(0, -1);
      const __acctHandoff = !ownershipAlreadyActive(full, getConvState(conversationId).state) && (
        isClearlyAccountSpecificIssue(text) ||
        handoffClaimGate.blocksGeneralFaqNoNote(text, __priorClientsForHandoff)
      );
      if (__acctHandoff) {
        kind = 'ACCOUNT';
        parsed.kind = 'ACCOUNT';
        console.log('HANDOFF_ACCOUNT_NOT_GENERAL_FAQ', conversationId);
      } else if (__decision.kind === 'general-faq' && !latestAuthLockout) {
        kind = 'FAQ_CONFIRM';
        parsed.kind = 'FAQ_CONFIRM';
      }

      // If FAQ context is already retrieved for a general/policy ask, answer instead of gating.
      // Account-state handoffs skip this force so the note is written before any claim.
      if (
        !__acctHandoff &&
        (kind === 'FAQ_CONFIRM' || __decision.kind === 'general-faq') &&
        officialFaqBlock
      ) {
        try {
          const force = await lunaModel.create(openai, {
            model: control.getModel(),
            ...modelConfig.answerParams({
              tools: false, purpose: 'reply.escalate-to-reply-force',
              conversationId, episode: __episode, phase: 'regeneration',
            }),
            conversationId,
            episode: __episode,
            messages: [
              { role: 'system', content: control.getPrompt() },
              {
                role: 'user',
                content:
                  userMsg +
                  tradingStagePolicy.forcePromptSupplement(__lunaChat && __lunaChat.retrievedKnowledge) +
                  '\n\nHARD OVERRIDE: This is a general KB/policy question. You MUST reply with ACTION: REPLY only. Answer from OFFICIAL FAQ CONTEXT and from TOOL RETRIEVED EVIDENCE when it is present above. Do NOT escalate. Do NOT ask for account number or email. Do NOT say you will pass this to the team, asked a support teammate, notified anyone, or that a teammate is verifying/checking anything. Do NOT hedge a fact that the evidence already states. Name platforms exactly as the FAQ does (MetaTrader 5 / MetaTrader5, TradeLocker, MatchTrader) — never replace MetaTrader 5 with the vague phrase "the trading platform".' +
                  (__escAskIsPending ? '\nThe client\'s latest message is a nudge asking for an answer; answer the question still waiting (do not ask them to clarify): ' + __escAsk.slice(0, 600) : ''),
              },
            ],
          });
          const forcedRaw = (((force.choices[0] || {}).message || {}).content) || '';
          const forced = parseAction(forcedRaw);
          const __forcedStripped = stripHandoffClaims(forced.body);
          if (forced.action === 'REPLY' && forced.body && __forcedStripped && __forcedStripped !== handoffClaimGate.TRUTHFUL_NO_HANDOFF_FALLBACK) {
            const __forcedBody = __forcedStripped;
            const __polCtxForce = { priorClientTexts: collectClientMessageTexts(full).slice(0, -1) };
            const __shapedForce = policyFactGuard.applyPolicyFacts(text, { action: 'REPLY', body: __forcedBody }, __polCtxForce);
            if (tradingStagePolicy.isPurePublicHedge(__shapedForce.body) && !tradingStagePolicy.directAnswer(text, __polCtxForce)) {
              console.log('ESCALATE force hedge kept as note (undocumented)', conversationId);
            } else {
              parsed.action = 'REPLY';
              parsed.body = __shapedForce.body || __forcedBody;
              console.log('ESCALATE->REPLY general+FAQ', conversationId);
            }
          }
        } catch (e) {
          console.error('ESCALATE->REPLY force fail', 'class=' + (e && e.name || 'Error'));
        }
      }

      // PROMO_SOT_NOT_FOR_HANDOFF_V1 (2026-09-25, live 215476097914090): a model ESCALATE on a human
      // request ("Please forward to a human from the affiliate team") or a promo checkout failure is a
      // real handoff; replacing it with the promo payload sent NEW50 text instead of the handoff.
      if (parsed.action === 'ESCALATE' && septemberPromos && !isClearlyAccountSpecificIssue(text) &&
          !clientWantsHumanTeammate(text) && __decision.kind !== 'human-request' && !isPromoCodeFailureAsk(text) &&
          !(partnershipIntent && partnershipIntent.blocksPromoAutoReply(text))) {
        const promoResolved = resolvePromoReply(text, full);
        if (promoResolved && promoResolved.reply) {
          const cleaned = typeof septemberPromos.sanitizePromoCustomerText === 'function'
            ? septemberPromos.sanitizePromoCustomerText(promoResolved.reply)
            : String(promoResolved.reply || '').trim();
          const leaked = typeof septemberPromos.hasPromoInstructionLeak === 'function' && septemberPromos.hasPromoInstructionLeak(cleaned);
          if (cleaned && !leaked) {
            parsed.action = 'REPLY';
            parsed.body = cleaned;
            console.log('ESCALATE->REPLY promo-sot', conversationId, promoResolved.product || '');
          } else {
            console.log('PROMO_SOT_BLOCKED instruction-like', conversationId);
          }
        }
      }
      if (parsed.action === 'ESCALATE' && isReviewNotificationProcessAsk(text)) {
        console.log('REVIEW_STATUS_DIRECT_HELD', conversationId);
        return res.sendStatus(200);
      }

      // FAQ rescue must run before the teammate note gate. Otherwise a general
      // product question is silently dropped merely because a teammate greeted
      // the customer earlier in the same ticket.
      if (parsed.action === 'ESCALATE') {
        const pending = resolvePendingAsk(parts, text);
        const productOverview = require('./productRulesOverview');
        if (productOverview.isLite2StepRulesAsk(pending) && isKnowledgeAnswerableAsk(pending)) {
          const answer = productOverview.lite2StepOverview('/home/ubuntu');
          if (answer) {
            parsed.action = 'REPLY';
            parsed.body = answer;
            console.log('ESCALATE->REPLY product-rules-overview', conversationId);
          }
        }
      }

      if (parsed.action === 'ESCALATE') {
      /* MICHAN_TEAMMATE_HANDOFF_V1:BEGIN:escalateBlock */
      {
        const escBlock = teammateHandoffGates.shouldBlockEscalateForTeammateHandoff(parts, full, {
          arsalId: ARSAL_ID, eliteAiId: ELITE_AI_ID, jerryId: JERRY_ID, hasArsalEscalateNote,
          latestText: text,
        });
        /* RISK_NOTE_ANTISPAM_V1 */
        const __stRisk = (typeof getConvState === 'function') ? getConvState(conversationId).state : {};
        const __riskBlk = shouldBlockRiskNoteSpamNow(full, parts, __stRisk);
        if (__riskBlk && __riskBlk.block) {
          escBlock.block = true;
          escBlock.reason = __riskBlk.reason;
        }
        // DELEGATED_ESCALATE_V1 (2026-09-24, live 215476084572778): "teammate is handling" is the
        // reason this gate exists. When that teammate has since explicitly delegated the client to
        // Luna (continuous ownership; a later teammate public reply ends it), the gate returned
        // SILENCE on a delegated ticket. Delegation lifts only the teammate-is-handling reasons;
        // duplicate-note and Risk anti-spam blocks still apply.
        // Only for a GENERAL (knowledge) escalation, which the path below answers without a note:
        // account work stays with the teammate who owns the backend case (no second note/assignment).
        const __escKindNow = String(parsed.kind || '').toUpperCase();
        const __generalEsc = (__escKindNow === 'FAQ_CONFIRM' || __decision.kind === 'general-faq') &&
          __escKindNow !== 'ACCOUNT' && __escKindNow !== 'EMAIL_REQUIRED' && !isClearlyAccountSpecificIssue(text);
        if (escBlock.block && __generalEsc && continuousOwnershipOf(parts).active &&
            (escBlock.reason === 'teammate_assignee_already_replied' || escBlock.reason === 'teammate_directed_external_support')) {
          console.log('ESCALATE_DELEGATED_PROCEED', escBlock.reason, conversationId);
          escBlock.block = false;
        }
        if (escBlock.block) {
          console.log('SKIP escalate teammate-handoff', escBlock.reason, conversationId);
          return res.sendStatus(200);
        }
      }
      /* MICHAN_TEAMMATE_HANDOFF_V1:END:escalateBlock */
      const mustGateIdentity =
        kind === 'ACCOUNT' ||
        kind === 'EMAIL_REQUIRED' ||
        isClearlyAccountSpecificIssue(text);
      if (mustGateIdentity) {
        const identityGate = await ensureIdentityBeforeAccountEscalate({
          prefix: (typeof __mixedGeneralPrefix === 'function') ? __mixedGeneralPrefix : undefined, /* MIXED_GENERAL_WITH_ACCOUNT_V1 */
          conversationId,
          full,
          bits,
          text,
          kind: kind === 'EMAIL_REQUIRED' ? 'EMAIL_REQUIRED' : 'ACCOUNT',
          latestUser,
          clientName,
          modelBody: parsed.body,
          modelClient: parsed.client,
        });
        full = identityGate.full || full;
        if (!identityGate.ready) return res.sendStatus(200);
      }
      let ids = collectEscalateIds(full, bits, (parsed.body || '') + '\n' + (parsed.client || ''));
      // FAQ_CONFIRM / general policy: NEVER ask account/email ("before I pass this to the team...")
      const latestAuthLockout = idGates.isAuthAccessIssue(text) || idGates.clientCannotProvideAccountNumber(text);
      const skipIdentityGate =
        (kind === 'FAQ_CONFIRM' || __decision.kind === 'general-faq') && !latestAuthLockout;
      let resolvedId = resolveIdentityAskDecision(full, ids, kind);
      let needAccount = resolvedId.needAccount;
      let needEmail = resolvedId.needEmail;
      if (resolvedId.declinedAccount) {
        console.log('ESCALATE no-account , skip account ask', conversationId);
      }
      if (resolvedId.declinedEmail) {
        console.log('ESCALATE no-email , skip email ask', conversationId);
      }
      if (!skipIdentityGate && (needAccount || needEmail)) {
        // Re-fetch: client may have sent the other field while the model was running
        try {
          const freshGate = await fetchConversation(conversationId);
          if (freshGate) {
            full = freshGate;
            ids = collectEscalateIds(freshGate, bits, (parsed.body || '') + '\n' + (parsed.client || ''));
            resolvedId = resolveIdentityAskDecision(full, ids, kind);
            needAccount = resolvedId.needAccount;
            needEmail = resolvedId.needEmail;
          }
        } catch (e) {
          console.error('identity re-fetch fail', 'class=' + (e && e.name || 'Error'));
        }
      }
      if (!skipIdentityGate && (needAccount || needEmail)) {
        // Hard no-reask: only ask for genuinely missing fields (account preferred; account alone enough).
        const ask = escalationClarificationText(resolvedId, needAccount, needEmail);
        const pre = preSendIdentityCheck(full, ask);
        if (!pre.ok) {
          if (pre.asks && pre.asks.account && pre.known && pre.known.account) {
            needAccount = false;
            ids.account = pre.known.account;
          }
          if (pre.asks && pre.asks.email && pre.known && pre.known.email) {
            needEmail = false;
            ids.email = pre.known.email;
          }
          resolvedId = resolveIdentityAskDecision(full, ids, kind);
          needAccount = resolvedId.needAccount;
          needEmail = resolvedId.needEmail;
          console.log('ESCALATE preSend blocked identity ask', conversationId, pre.reason, {
            needAccount,
            needEmail,
            decision: resolvedId.decision.reason,
          });
          if (needAccount || needEmail) {
            const ask2 = escalationClarificationText(resolvedId, needAccount, needEmail);
            const pre2 = preSendIdentityCheck(full, ask2);
            if (pre2.ok) {
              await postClientCommentOnce(conversationId, ask2, latestUser, clientName);
              console.log('ESCALATE gated , asked missing only', conversationId, { needAccount, needEmail, kind });
              return res.sendStatus(200);
            }
            console.log('ESCALATE preSend , falling through with known ids', conversationId);
          }
        } else {
          await postClientCommentOnce(conversationId, ask, latestUser, clientName);
          console.log('ESCALATE gated , asked account/email', conversationId, {
            needAccount,
            needEmail,
            kind,
            decision: resolvedId.decision.reason,
          });
          return res.sendStatus(200);
        }
      }
      if (skipIdentityGate && (needAccount || needEmail)) {
        console.log('ESCALATE FAQ_CONFIRM , identity gate skipped', conversationId, { kind });
      }

      // Last stop before a note is written: a general product/policy question has nothing for
      // the backend team to look at, so it is answered here instead. The HARD OVERRIDE above
      // usually turns it into a REPLY; this catches the case where the model insists on
      // ESCALATE anyway, which is how live chat 215476023193727 produced a note reading
      // "Account: Not provided". Owner rule 2026-09-21.
      // SUPPRESS_ONLY_WITH_ANSWER_V1 (2026-09-25, real-transcript replay of live 215476098669498): suppressing
      // an escalation presumes the model ANSWERED. When its client text is only thanks + a handoff claim,
      // removing the claim left "Thanks for explaining the IP variations.", the send gate blocked that
      // hollow line and the client got silence (or, when empty, the stock clarify). Without a substantive
      // answer the model's escalation stands and continues through the normal identity/note flow.
      const __suppressHadClaim = handoffClaimGate.hasHandoffClaim(parsed.client || '');
      const __suppressText = stripHandoffClaims(parsed.client);
      const __suppressAnswer = __suppressText === handoffClaimGate.TRUTHFUL_NO_HANDOFF_FALLBACK ? '' : __suppressText;
      const __substantiveAnswer = (() => {
        const sents = String(__suppressAnswer || '').split(/(?<=[.!?])\s+/).filter((x) =>
          !/^\s*(?:hi|hello|hey|dear\b[^.!?]*|thanks?|thank\s+you|thx|understood|noted|got\s+it)\b[^.!?]*[.!?]?\s*$/i.test(x));
        return sents.join(' ').split(/\s+/).filter(Boolean).length >= 8;
      })();
      if (!__substantiveAnswer && kind === 'FAQ_CONFIRM') {
        console.log('ESCALATE_NOT_SUPPRESSED no substantive answer', conversationId);
        if (__suppressHadClaim) {
          console.log('handoff_claim_removed_no_action', conversationId, 'none', 'escalate-not-suppressed');
          console.log('handoff_not_created', conversationId, 'escalate-not-suppressed');
        }
        // Collect account only for real account work / human handoff. Off-topic ESCALATE
        // (e.g. Fiboniq spam) must not get a spurious "share your account number" ask.
        if (isClearlyAccountSpecificIssue(text) || clientWantsHumanTeammate(text) || __acctHandoff) {
          const __acctId = resolveIdentityAskDecision(full, ids, 'ACCOUNT');
          if ((__acctId.needAccount || __acctId.needEmail) && !__acctId.declinedAccount) {
            const gate = deferredIdentityAsk(full, ids, 'ACCOUNT');
            if (gate.ask) {
              await postClientCommentOnce(conversationId, gate.ask, latestUser, clientName);
              console.log('ESCALATE_NOT_SUPPRESSED asked account first', conversationId);
              return res.sendStatus(200);
            }
          }
        } else {
          // General / off-topic hollow ESCALATE: reply without note or account ask.
          // Never ship a leftover "they'll update you" once the claim sentence is gone.
          // A hollow "Got it, thanks" on a real FundedElite question is not an answer.
          // Fall through so the email-sufficient note path can write a truthful note.
          const __hollow = postProcessModelReply(stripHandoffClaims(parsed.client || ''), conversationId);
          const __hollowAck = isHollowEscalationAck(parsed.client || '') || isHollowEscalationAck(__hollow);
          const __realAsk = __decision.kind === 'general-faq' || looksFundedEliteRelated(text);
          const __ownNow = continuousOwnershipOf(parts);
          const __teammateOwns = ownershipAlreadyActive(full) || !!((__ownNow && __ownNow.active));
          const __hollowOut = handoffClaimGate.withoutFalseHandoffDenial(__hollow, __teammateOwns);
          if (__hollowAck && __realAsk) {
            console.log('ESCALATE_NOT_SUPPRESSED hollow falls through to note', conversationId);
          } else if (String(__hollowOut || '').trim() && !handoffClaimGate.hasHandoffClaim(__hollowOut)) {
            await postClientCommentOnce(conversationId, __hollowOut, latestUser, clientName);
            console.log('ESCALATE_NOT_SUPPRESSED general no-note reply', conversationId);
            return res.sendStatus(200);
          }
        }
      }
      if (kind === 'FAQ_CONFIRM' && __substantiveAnswer && !__acctHandoff && !isClearlyAccountSpecificIssue(text) && !clientWantsHumanTeammate(text) && !(idGates.isAuthAccessIssue(text) || idGates.clientCannotProvideAccountNumber(text))) {
        // ESCALATE_SUPPRESSED_CLIENT_TEXT_V1 (2026-09-24): for an ESCALATE, parsed.body is the INTERNAL
        // team summary ("The prospective client is considering ..."); the customer-facing text is
        // parsed.client. Posting body leaked a third-person internal note to the customer. And since
        // this branch writes NO note, a CLIENT sentence claiming a handoff ("I've sent this for a
        // compliance check") would be false, so it is dropped.
        if (__suppressHadClaim) {
          console.log('handoff_claim_removed_no_action', conversationId, 'none', 'escalate-suppressed');
          console.log('handoff_not_created', conversationId, 'escalate-suppressed');
        }
        const faqAnswer = postProcessModelReply(__suppressAnswer, conversationId);
        if (String(faqAnswer || '').trim() && !handoffClaimGate.hasHandoffClaim(faqAnswer)) {
          await postClientCommentOnce(conversationId, faqAnswer, latestUser, clientName);
        }
        console.log('ESCALATE_SUPPRESSED general-faq (answered, no note)', conversationId);
        return res.sendStatus(200);
      }

        /* ESCALATION_DEDUPE_V1:main */
        {
          const __dup = await escalationDuplicateCheck(conversationId, (parsed.body || '') + ' ' + text);
          if (__dup.full) full = __dup.full;
          if (__dup.duplicate) {
            console.log('ESCALATE_DUPLICATE_BLOCKED', 'main', conversationId, __dup.reason);
            if (!/no_new_client_message/.test(__dup.reason)) {
              await postEscalateHoldingStatus(conversationId, text, latestUser, clientName, getConvState(conversationId).state,
                'ESCALATE status-only (duplicate blocked, main)');
            }
            return res.sendStatus(200);
          }
        }
      {
        const __riskDiv = await divertIfRiskOwnedNoPublic(conversationId, full);
        if (__riskDiv.diverted) {
          console.log('ESCALATE suppressed public — Risk-owned', conversationId);
          return res.sendStatus(200);
        }
        full = __riskDiv.full || full;
      }

      // HANDOFF_CLAIM_GATE_V1: post the internal note/assignment FIRST. Only after success may
      // the public acknowledgement claim a teammate was contacted. A failed note must never
      // leave a false "I've asked a teammate" sentence on the ticket.
      const existingAssignee =
        full.admin_assignee_id != null ? String(full.admin_assignee_id) : '';
      const problemWithExtras = [parsed.body || text, ...(resolvedId.noteExtraLines || [])]
        .filter(Boolean)
        .join('\n');
      const built = await buildEscalateNoteAndAssignee({
        problem: problemWithExtras,
        actionNeeded: parsed.actionNeeded || '',
        account: ids.account,
        email: ids.email,
        preferAssigneeId:
          existingAssignee &&
          existingAssignee !== '0' &&
          existingAssignee !== ARSAL_ID &&
          existingAssignee !== ELITE_AI_ID
            ? existingAssignee
            : '',
        conversation: full,
      });
      if (built && built.deferred) {
        // One readiness decision. An open account investigation asks for the account.
        // A general question that does not need one must not be asked, and must not
        // claim a handoff. Email on file does not satisfy a missing trading account.
        const gate = deferredIdentityAsk(full, ids, kind, { noteDeferredReason: built.reason });
        if (gate.ask) {
          await postClientCommentOnce(conversationId, gate.ask, latestUser, clientName);
          console.log('ESCALATE_NOTE_DEFERRED asked account', conversationId);
        } else if (gate.skipNonAccount) {
          await completeNonAccountEscalation({
            conversationId,
            full,
            latestUser,
            clientName,
            problem: problemWithExtras,
            email: ids && ids.email,
            preferAssigneeId: existingAssignee && existingAssignee !== '0' && existingAssignee !== ARSAL_ID && existingAssignee !== ELITE_AI_ID ? existingAssignee : '',
            where: 'main',
          });
        } else {
          console.log('ESCALATE_NOTE_DEFERRED wait (no re-ask)', conversationId, gate.reason);
        }
        return res.sendStatus(200);
      }
      {
        const __freshEsc = await blockStaleConsequentialEscalation(conversationId, latestUser, text);
        if (__freshEsc.fresh) full = __freshEsc.fresh;
        if (__freshEsc.block || teammateHandoffGates.escalationNoteContradictsResolution(text, built.html)) {
          if (!__freshEsc.block) console.log('ESCALATE_FRESHNESS_BLOCK', conversationId, 'contradictory_note');
          return res.sendStatus(200);
        }
      }
      const noteRes = await postReply(conversationId, 'note', built.html);
      if (!noteRes.ok) {
        console.error('ESCALATE_NOTE_FAILED — no public handoff claim', conversationId, noteRes.status);
        finishHandoffAction(conversationId, false, false);
        const safeFail = postProcessModelReply(
          escalationClientAck({ noteOk: false, assignOk: false, where: 'main' }),
          conversationId
        );
        if (String(safeFail || '').trim() && !handoffClaimGate.hasHandoffClaim(safeFail)) {
          await postClientCommentOnce(conversationId, safeFail, latestUser, clientName);
        }
        return res.sendStatus(200);
      }
      let __handoffAssignOk = false;
      if (built.assigneeId) {
        const asgRes = await assignToTeammateIfNeeded(full, conversationId, built.assigneeId);
        __handoffAssignOk = !!(asgRes && asgRes.ok);
        if (!asgRes.ok) console.error('ESCALATE_ASSIGN_FAILED', conversationId, asgRes.status);
      }
      finishHandoffAction(conversationId, true, __handoffAssignOk);
      console.log(
        'ESCALATED note+assign',
        conversationId,
        built.teammate ? built.teammate.name : 'Jerry-fallback',
        built.assigneeId
      );
      {
        const stPack = getConvState(conversationId);
        stPack.state.lastEscalateAt = Math.floor(Date.now() / 1000);
        stPack.state.lastEscalateAssigneeId = built.assigneeId || '';
        stPack.state.handoffSucceededThisTurn = true;
        
        /* escalate-related-only-v1: store escalate context */
        {
          const __ctx = escalateRelatedOnly.buildEscalateContext({
            problem:
              (typeof problem !== 'undefined' && problem) ||
              (typeof problemRec !== 'undefined' && problemRec) ||
              (typeof parsed !== 'undefined' && parsed && (parsed.body || parsed.client)) ||
              '',
            // buildEscalateNoteAndAssignee() returns { html, teammate, assigneeId, problemText } -
            // there is no `.note` field (that was always undefined here, so this snippet was
            // silently always empty). Use the sanitized problem text it actually returns.
            noteBody:
              (typeof built !== 'undefined' && built && built.problemText) ||
              '',
            clientTexts:
              typeof collectClientMessageTexts === 'function'
                ? collectClientMessageTexts(typeof full !== 'undefined' ? full : {})
                : [],
          });
          stPack.state.lastEscalateProblem = __ctx.lastEscalateProblem;
          stPack.state.lastEscalateNoteSnippet = __ctx.lastEscalateNoteSnippet;
          stPack.state.lastEscalateTopic = __ctx.lastEscalateTopic;
          stPack.state.lastEscalateTopics = __ctx.lastEscalateTopics;
        }
        stPack.state.escalateAwaitingFirstTeammate = true;
        stPack.state.escalateTeammateExplainedAt = 0;
        stPack.state.deferredRelatedReply = null;
        saveConvState(stPack.id, stPack.state);
      }

      let clientMsg = postProcessModelReply(
        escalationClientAck({
          noteOk: true,
          assignOk: __handoffAssignOk,
          where: 'main',
          preferred: preferredForEscalation(built, parsed.client, __handoffAssignOk),
        }),
        conversationId
      );
      clientMsg = normalizeEscalateClientHandoff(clientMsg, text);
      { const __mp = await __mixedGeneralPrefix(); if (__mp) clientMsg = __mp.trim() + '\n\n' + clientMsg; } /* MIXED_GENERAL_WITH_ACCOUNT_V1 */
      clientMsg = rewriteBareNumberOrderLabels(clientMsg, ids.account);
      await postClientCommentOnce(conversationId, clientMsg, latestUser, clientName);
      return res.sendStatus(200);
      } // end remaining ESCALATE after possible ESCALATE->REPLY conversion
    }

    // REPLY
    let __isScopeDecline = String(parsed.body || '').trim() === '[[SCOPE_DECLINE]]';
    // A short attribute question inherits the last FundedElite subject. A prior
    // off-topic turn must not cause "is it customizable?" after a product answer
    // to be sent as another scope decline.
    try {
      const __wrongScope = __isScopeDecline || /outside what I can help|only handle FundedElite|not something I can help with|FundedElite topics are all I can cover/i.test(String(parsed.body || ''));
      if (__wrongScope && __decision.contextReason === 'attribute-followup' && __decision.kind === 'general-faq' && __episode.canRegenerate()) {
        __episode.chargeRegeneration();
        const __retry = await lunaModel.create(openai, {
          model: control.getModel(),
          ...modelConfig.answerParams({ tools: false, purpose: 'reply.attribute-followup', conversationId, episode: __episode, phase: 'regeneration' }),
          conversationId, episode: __episode,
          messages: [
            { role: 'system', content: control.getPrompt() },
            { role: 'user', content: userMsg + '\n\nHARD CORRECTION: The latest short question refers to "' + __decision.priorAsk.slice(0, 240) + '". Answer that attribute question directly from OFFICIAL FAQ CONTEXT. It is FundedElite support, so do not use SCOPE_DECLINE. ACTION: REPLY.' },
          ],
        });
        const __corrected = parseAction(((__retry.choices[0] || {}).message || {}).content || '');
        if (__corrected.action === 'REPLY' && __corrected.body && !/\[\[SCOPE_DECLINE\]\]|outside what I can help|only handle FundedElite/i.test(__corrected.body)) {
          parsed.body = __corrected.body;
          __isScopeDecline = false;
          console.log('ATTRIBUTE_FOLLOWUP_SCOPE_REPAIRED', conversationId);
        }
      }
    } catch (e) { console.error('ATTRIBUTE_FOLLOWUP_SCOPE_REPAIR_ERR', conversationId, 'class=' + (e && e.name || 'Error')); }
    /* IMAGE_EVIDENCE_V1:BEGIN:scope-repair
     * The model declined a turn whose screenshot is FundedElite content (or could not be judged unrelated). One
     * bounded regeneration answers from the image + approved knowledge instead of the canned out-of-scope line.
     * A clearly unrelated image (extraction says fundedelite_related=false) keeps the normal boundary. */
    try {
      const __scopeLike = __isScopeDecline || /outside what I can help|only handle FundedElite|not something I can (?:help with|cover)|FundedElite topics are all I can cover|FundedElite is all I can help with/i.test(String(parsed.body || ''));
      if (__scopeLike && __imageTurn && __imageRelated && __episode.canRegenerate()) {
        __episode.chargeRegeneration();
        const __fixText = userMsg + '\n\nHARD CORRECTION: The client is asking about the screenshot described in IMAGE EVIDENCE' +
          (__imageRecent ? ' (sent in their earlier message)' : '') + '. It is FundedElite support content, so do NOT decline or use [[SCOPE_DECLINE]]. ' +
          'Explain what the screenshot shows and what each visible item means, using OFFICIAL FAQ CONTEXT / approved facts where they apply. Follow the image-vs-policy rule above. Return ACTION: REPLY.';
        const __retry = await lunaModel.create(openai, {
          model: control.getModel(),
          ...modelConfig.answerParams({ tools: false, purpose: 'reply.image-scope-repair', conversationId, episode: __episode, phase: 'regeneration' }),
          conversationId, episode: __episode,
          messages: [
            { role: 'system', content: control.getPrompt() },
            { role: 'user', content: __visionAtts.length ? await buildVisionUserContent(__fixText, __visionAtts) : __fixText },
          ],
        });
        const __corrected = parseAction(((__retry.choices[0] || {}).message || {}).content || '');
        if (__corrected.action === 'REPLY' && __corrected.body && !/\[\[SCOPE_DECLINE\]\]|outside what I can help|only handle FundedElite|FundedElite is all I can help with/i.test(__corrected.body)) {
          parsed.body = __corrected.body;
          __isScopeDecline = false;
          console.log('IMAGE_SCOPE_DECLINE_REPAIRED', conversationId);
        } else {
          console.log('IMAGE_SCOPE_DECLINE_REPAIR_FAILED', conversationId, __corrected.action || 'none');
        }
      }
    } catch (e) { console.error('IMAGE_SCOPE_REPAIR_ERR', conversationId, 'class=' + (e && e.name || 'Error')); }
    /* IMAGE_EVIDENCE_V1:END:scope-repair */
    if (
      __isScopeDecline &&
      (__decision.kind === 'smalltalk' || __decision.kind === 'support-meta')
    ) {
      parsed.body = smalltalkReplyFor(text);
      __isScopeDecline = false;
      console.log('THANKS_BLOCK_SCOPE_DECLINE_PARSED', conversationId);
    }
    let body = postProcessModelReply(parsed.body || '', conversationId);
    if (__comparison) {
      let __check = productComparison.assess(__comparison, body);
      if (!__check.ok && __episode.canRegenerate()) {
        try {
          __episode.chargeRegeneration();
          const __retry = await lunaModel.create(openai, {
            model: control.getModel(),
            ...modelConfig.answerParams({ tools: false, purpose: 'reply.comparison-regenerate', conversationId, episode: __episode, phase: 'regeneration' }),
            conversationId, episode: __episode,
            messages: [
              { role: 'system', content: control.getPrompt() },
              { role: 'user', content: userMsg + '\n\nYour comparison draft is missing or misplacing these points (values are from the current product articles):\n- ' +
                (typeof productComparison.explainErrors === 'function' ? productComparison.explainErrors(__comparison, __check.errors) : __check.errors).join('\n- ') +
                '\nOriginal draft:\n' + body + '\n\nCorrect only the failed facts or missing fields. Keep supported content. Return ACTION: REPLY with Main Differences first.' },
            ],
          });
          const __candidate = parseAction((((__retry.choices[0] || {}).message || {}).content) || '');
          if (__candidate.action === 'REPLY' && __candidate.body) {
            const __body = postProcessModelReply(__candidate.body, conversationId);
            const __candidateCheck = productComparison.assess(__comparison, __body);
            if (__candidateCheck.ok) { body = __body; __check = __candidateCheck; }
            else console.log('PRODUCT_COMPARISON_REGEN_INVALID', conversationId, __candidateCheck.errors.join(','));
          }
        } catch (e) { console.error('PRODUCT_COMPARISON_REGEN_FAILED', conversationId, 'class=' + (e && e.name || 'Error')); }
      }
      if (!__check.ok) {
        body = postProcessModelReply(productComparison.render(__comparison, /exact options|which options/i.test(text)), conversationId);
        __check = productComparison.assess(__comparison, body);
        console.log('PRODUCT_COMPARISON_CANONICAL_FALLBACK', conversationId, __check.ok, __check.errors.join(','));
      }
      // The canonical render is built from the current KB articles; if it still does not satisfy the
      // structural assessor, sending it (presend still audits every figure) beats silence.
      if (!__check.ok) console.log('PRODUCT_COMPARISON_CANONICAL_SENT_ANYWAY', conversationId, __check.errors.join(','));
    }
    if (!body) {
      console.log('SKIP empty reply body', conversationId);
      return res.sendStatus(200);
    }
    // The composed draft is the customer-facing text. A credential in it is a
    // silent hold here, before presend or the allowlist can replace the draft
    // and drop the pair. Automated path: no staff note.
    {
      const __draftHold = publicCredentialHold.holdFinalPublic({
        screened: body,
        rendered: body,
        conversationId,
      });
      if (__draftHold) {
        credentialHoldLog('conversations/' + conversationId, __draftHold);
        return res.sendStatus(200);
      }
    }
    /* PENDING_ASK_RESOLVE_V1: a stock "share a bit more" clarify / nudge is not an answer when the latest
     * message is a nudge pointing at a clear, knowledge-answerable question (real-model replay of live
     * 215476072310759: the forced ESCALATE->REPLY body was the stock clarify in 2 of 5 runs). Regenerate
     * once from official knowledge naming that question; presend still validates the result. */
    if (!__teammateScope) {
      try {
        const __R = regenModule();
        const __isStock = [__R.CLARIFY_REPLY, __R.NUDGE_REPLY, __R.ENGAGE_REPLY].filter(Boolean)
          .some((x) => stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase() === stripHtml(body).replace(/\s+/g, ' ').trim().toLowerCase());
        const __pend = __isStock ? resolvePendingAsk(parts, text) : '';
        let __substantialPend = false;
        try { __substantialPend = !!(__pend && require('./statePresend/textUtils').isSubstantialClearQuestion(__pend)); } catch (_) {}
        if (__isStock) {
          console.log('PENDING_ASK stock-template draft', conversationId, JSON.stringify({
            pending: __pend !== String(text || '').trim(), substantial: __substantialPend,
            answerable: !!(__pend && isKnowledgeAnswerableAsk(__pend)), evidence: !!officialFaqBlock, budget: __episode.canRegenerate(),
          }));
        }
        if (__isStock && __pend !== String(text || '').trim() && __substantialPend && isKnowledgeAnswerableAsk(__pend) && officialFaqBlock && __episode.canRegenerate()) {
          __episode.chargeRegeneration();
          console.log('PENDING_ASK stock-template draft on a pending question: regenerate', conversationId);
          const __r = await lunaModel.create(openai, {
            model: control.getModel(),
            ...modelConfig.answerParams({ tools: false, purpose: 'reply.pending-ask-answer', conversationId, episode: __episode, phase: 'regeneration' }),
            conversationId,
            episode: __episode,
            messages: [
              { role: 'system', content: control.getPrompt() },
              { role: 'user', content: userMsg + '\n\nHARD OVERRIDE: The client\'s latest message is a nudge asking you to answer. The question still waiting for an answer is: ' + __pend.slice(0, 600) +
                '\nAnswer it from OFFICIAL FAQ CONTEXT. ACTION: REPLY. Cover every part. Do NOT ask the client to clarify, do NOT ask for account number or email, do NOT escalate.' },
            ],
          });
          const __pr = parseAction((((__r.choices[0] || {}).message || {}).content) || '');
          const __cand = __pr.action === 'REPLY' && __pr.body ? postProcessModelReply(__pr.body, conversationId) : '';
          if (__cand && ![__R.CLARIFY_REPLY, __R.NUDGE_REPLY, __R.ENGAGE_REPLY].filter(Boolean).some((x) => stripHtml(x).trim().toLowerCase() === stripHtml(__cand).trim().toLowerCase())) {
            body = __cand;
            console.log('PENDING_ASK regenerated answer', conversationId);
          }
        }
      } catch (e) { console.error('PENDING_ASK regenerate failed', conversationId, 'class=' + (e && e.name || 'Error')); }
    }

    // Collect-first does not depend on which ACTION the model happened to emit.
    // The approved rule is action-agnostic: "Verify identity ... before discussing any
    // account-specific detail - balance, breach reason, payout status, personal data."
    // A model REPLY that starts investigating "my payout was rejected" bypassed the gate that
    // only ever ran on the ESCALATE path, so the account was never collected (SUP-01/SUP-02).
    // ensureIdentityBeforeAccountEscalate() carries the approved policy: never re-ask a
    // field already in history, at most one ask per field, trust a client who says they
    // have none. A profile email is enough for other account issues. A payout rejection
    // still collects the account number first (PAYOUT_REJECTION_ACCOUNT_V1).
    if (
      !__teammateScope && /* TEAMMATE_TOPIC_OWNERSHIP_V1: never collect identity in scoped mode */
      !__isScopeDecline &&
      !clientWantsHumanTeammate(text) &&
      replyDecision.requiresIdentity(__decision)
    ) {
      const __replyGate = await ensureIdentityBeforeAccountEscalate({
          prefix: (typeof __mixedGeneralPrefix === 'function') ? __mixedGeneralPrefix : undefined, /* MIXED_GENERAL_WITH_ACCOUNT_V1 */
        conversationId,
        full,
        bits,
        text,
        kind: 'ACCOUNT',
        latestUser,
        clientName,
        modelBody: body,
        modelClient: '',
      });
      full = __replyGate.full || full;
      if (!__replyGate.ready) {
        console.log('REPLY identity collect-first (account-specific, ids missing)', conversationId);
        return res.sendStatus(200);
      }
    }

    /* AUDIT_HARDEN_V1:stripKnownAccountAsk */
    {
      const __knownIds = collectEscalateIds(full, bits, '');
      if (__knownIds && __knownIds.account) {
        const __before = body;
        body = body.replace(
          /(?:^|[.\n])[^.\n]*(?:please\s+share|can\s+you\s+send|before\s+i\s+pass)[^.\n]*(?:account\s*number|account\s*#|registered\s+email)[^.\n]*[.!?]?/gi,
          (m) => (m.startsWith('.') || m.startsWith('\n') ? m[0] : '')
        );
        body = body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        if (body !== __before) {
          console.log('STRIP known-account re-ask from model reply', conversationId, __knownIds.account);
        }
        if (!body) {
          console.log('SKIP empty after strip known-account ask', conversationId);
          return res.sendStatus(200);
        }
      }
    }
    // Pre-send identity recall: never send a draft that re-asks account/email already in history.
    // Higher priority than generic escalate/ask scripts.
    {
      const preReply = preSendIdentityCheck(full, body);
      if (!preReply.ok && __teammateScope) {
        // TEAMMATE_TOPIC_OWNERSHIP_V1: never ask for identity or escalate from a scoped answer.
        console.log('TEAMMATE_SCOPE_SILENT identity re-ask in draft', conversationId, preReply.reason);
        if (__teammateScope && __teammateScope.statusFallback) await postEscalateHoldingStatus(conversationId, __teammateScopeOriginalText, latestUser, clientName, getConvState(conversationId).state, 'MIXED_AWAITING_ANSWER fallback status'); /* MIXED_AWAITING_ANSWER_V1 */
        return res.sendStatus(200);
      }
      if (!preReply.ok) {
        console.log('REPLY preSend blocked re-ask', conversationId, preReply.reason);
        const known = preReply.known || collectEscalateIds(full, bits, '');
        const replyDecision = resolveIdentityAskDecision(full, {
          account: known.account || '',
          email: known.email || '',
          accounts: known.accounts || [],
          emails: known.emails || [],
        }, 'ACCOUNT');
        const stillNeedAccount = replyDecision.needAccount;
        const stillNeedEmail = replyDecision.needEmail;
        if (stillNeedAccount || stillNeedEmail) {
          const askOnly = escalationClarificationText(replyDecision, stillNeedAccount, stillNeedEmail);
          const preAsk = preSendIdentityCheck(full, askOnly);
          if (preAsk.ok) {
            await postClientCommentOnce(conversationId, askOnly, latestUser, clientName);
            console.log('REPLY->ask missing only after preSend block', conversationId, {
              stillNeedAccount,
              stillNeedEmail,
            });
            return res.sendStatus(200);
          }
        }
        // Both known (or ask also blocked): do not send the re-ask; escalate with what we have.
        if (known.account || known.email) {
          parsed.action = 'ESCALATE';
        /* ESCALATION_DEDUPE_V1:reply-presend-block */
          {
            const __dup = await escalationDuplicateCheck(conversationId, text);
            if (__dup.full) full = __dup.full;
            if (__dup.duplicate) {
              console.log('ESCALATE_DUPLICATE_BLOCKED', 'reply-presend-block', conversationId, __dup.reason);
              if (!/no_new_client_message/.test(__dup.reason)) {
                await postEscalateHoldingStatus(conversationId, text, latestUser, clientName, getConvState(conversationId).state,
                  'ESCALATE status-only (duplicate blocked, reply-presend-block)');
              }
              return res.sendStatus(200);
            }
          }

          // Fall into a minimal escalate using known ids (inline, avoid re-ask loop)
          {
            const __riskDiv = await divertIfRiskOwnedNoPublic(conversationId, full);
            if (__riskDiv.diverted) {
              console.log('ESCALATE suppressed public — Risk-owned', conversationId);
              return res.sendStatus(200);
            }
            full = __riskDiv.full || full;
          }
          const existingAssignee =
            full.admin_assignee_id != null ? String(full.admin_assignee_id) : '';
          const built = await buildEscalateNoteAndAssignee({
            problem: text,
            actionNeeded: 'Please review this case and guide the client.',
            account: known.account || '',
            email: known.email || '',
            preferAssigneeId:
              existingAssignee &&
              existingAssignee !== '0' &&
              existingAssignee !== ARSAL_ID &&
              existingAssignee !== ELITE_AI_ID
                ? existingAssignee
                : '',
        conversation: full,
      });
          if (built && built.deferred) {
            const gate = deferredIdentityAsk(full, { account: known.account || '', email: known.email || '', accounts: known.accounts || [] }, 'ACCOUNT', { noteDeferredReason: built.reason });
            if (gate.ask) {
              await postClientCommentOnce(conversationId, gate.ask, latestUser, clientName);
              console.log('ESCALATE_NOTE_DEFERRED asked account (reply-presend)', conversationId);
            } else if (gate.skipNonAccount) {
              await completeNonAccountEscalation({
                conversationId,
                full,
                latestUser,
                clientName,
                problem: text,
                email: known && known.email,
                preferAssigneeId: existingAssignee && existingAssignee !== '0' && existingAssignee !== ARSAL_ID && existingAssignee !== ELITE_AI_ID ? existingAssignee : '',
                where: 'reply-presend',
              });
            } else {
              console.log('ESCALATE_NOTE_DEFERRED wait (reply-presend)', conversationId, gate.reason);
            }
            return res.sendStatus(200);
          }
          {
            const __freshEsc = await blockStaleConsequentialEscalation(conversationId, latestUser, text);
            if (__freshEsc.fresh) full = __freshEsc.fresh;
            if (__freshEsc.block || teammateHandoffGates.escalationNoteContradictsResolution(text, built.html)) {
              if (!__freshEsc.block) console.log('ESCALATE_FRESHNESS_BLOCK', conversationId, 'contradictory_note');
              return res.sendStatus(200);
            }
          }
          const noteRes = await postReply(conversationId, 'note', built.html);
          if (!noteRes.ok) {
            console.error('ESCALATE_NOTE_FAILED — no public handoff claim', conversationId, noteRes.status);
            finishHandoffAction(conversationId, false, false);
            const safeFailReply = postProcessModelReply(
              escalationClientAck({ noteOk: false, assignOk: false, where: 'reply-presend' }),
              conversationId
            );
            if (String(safeFailReply || '').trim() && !handoffClaimGate.hasHandoffClaim(safeFailReply)) {
              await postClientCommentOnce(conversationId, safeFailReply, latestUser, clientName);
            }
            return res.sendStatus(200);
          }
          let __handoffAssignOkReply = false;
          if (built.assigneeId) {
            const asgRes = await assignToTeammateIfNeeded(full, conversationId, built.assigneeId);
            __handoffAssignOkReply = !!(asgRes && asgRes.ok);
            if (!asgRes.ok) console.error('ESCALATE_ASSIGN_FAILED', conversationId, asgRes.status);
          }
          finishHandoffAction(conversationId, true, __handoffAssignOkReply);
          recordEscalationState(conversationId, text, built.problemText, full); /* ESCALATION_DEDUPE_V1 */
          console.log('ESCALATED after REPLY preSend block', conversationId, built.assigneeId);
          let clientMsg = postProcessModelReply(
            escalationClientAck({
              noteOk: true,
              assignOk: __handoffAssignOkReply,
              where: 'reply-presend',
              preferred: __handoffAssignOkReply ? ACCOUNT_HANDOFF_ACK : '',
            }),
            conversationId
          );
          clientMsg = normalizeEscalateClientHandoff(clientMsg, text);
          { const __mp = await __mixedGeneralPrefix(); if (__mp) clientMsg = __mp.trim() + '\n\n' + clientMsg; } /* MIXED_GENERAL_WITH_ACCOUNT_V1 */
          clientMsg = rewriteBareNumberOrderLabels(clientMsg, known.account);
          await postClientCommentOnce(conversationId, clientMsg, latestUser, clientName);
          return res.sendStatus(200);
        }
        // Nothing known and blocked , strip is unsafe; skip send rather than re-ask
        console.log('REPLY preSend , skip send (would re-ask, nothing to escalate)', conversationId);
        return res.sendStatus(200);
      }
    }
    /* LUNA_SPREAD_IMAGE_FIXES_V1:BEGIN:hookD */
    // IMAGE_EVIDENCE_V1: on an image the read judged unrelated to FundedElite (a meme), the FundedElite-only boundary
    // is the intended reply. Some decline variants ("Not something I can help with") read like an image refusal to
    // hookD, which swapped them for "I am reading it now and will explain" - a promise nothing would keep.
    const __unrelatedImageDecline = __imageTurn && !__imageRelated &&
      (__isScopeDecline || /\[\[SCOPE_DECLINE\]\]|outside what I (?:can help|cover)|only (?:handle|cover) FundedElite|not something I can (?:help with|cover)|FundedElite (?:topics )?(?:is|are) all I can|I can't get into that/i.test(String(body || '')));
    if (__unrelatedImageDecline) console.log('IMAGE_UNRELATED scope boundary kept (hookD skipped)', conversationId);
    else { try { body = __imageAskGuard.hookD(conversationId, body); } catch (__e) { console.error('[imageAskGuard.hookD] guard hook failed', 'class=' + (__e && __e.name || 'Error')); } }
    /* LUNA_SPREAD_IMAGE_FIXES_V1:END:hookD */
    /* LUNA_STATE_PRESEND_V1:BEGIN:hookP */
    body = challengeVariantGuard.explainVariantFollowup(
      text,
      parts.filter((p) => String((p.author || {}).id || '') === ARSAL_ID && p.part_type !== 'note' && p.body)
        .map((p) => stripHtml(p.body || '')),
      body,
      conversationId
    );
    // Fail-closed default: if gate() throws before returning, hold the send rather than
    // shipping the un-gated draft (MISSED_QUESTION/WRONG_TOPIC/REPEATED_IMAGE_ASK/MISSED_ESCALATION
    // must never be silently bypassed — see CLAUDE.md).
    let __presend = { body: body, send: false, reason: 'gate-init-fail-closed' };
    // The gate replaces `body` with its own fallback (often empty, or the clarify line), so the
    // model's real draft has to be kept separately. The general-faq hold branch below needs the
    // ANSWER the model wrote, not the gate's stand-in - that mix-up is what sent
    // "could you tell me a bit more about what you mean?" in live conversation 215476025058340.
    const __modelDraft = body;
    // Gives the presend gate one real chance to fix a MISSED_QUESTION/WRONG_TOPIC draft with
    // the model before falling to clarify/escalate/generic-fallback. Same one-shot correction
    // pattern as the REPEATED_QUESTION retry just below; no new tool-calling, same userMsg.
    // targetedRegeneration calls this as regenerate(correctionInstruction, hardFails, ctx).
    // hardFails is what decides whether this regeneration earns HIGH reasoning: a substantive
    // factual/policy/state/coverage failure does, a formatting-only failure does not.
    const __presendRegenerate = async (correctionInstruction, __hardFails) => {
      try {
        // Presend regeneration is separately capped and has NO remaining tool budget. Effort
        // is re-evaluated against the presend result: a substantive HARD failure earns HIGH,
        // a formatting-only failure does not.
        if (!__episode.canRegenerate()) { console.log('PRESEND_REGENERATE_BUDGET', conversationId); return null; }
        // SMALLTALK_COURTESY_V1: pure courtesy is never regenerated through the model (no tools, no heavy
        // retry); the deterministic social line re-enters the same gate instead.
        if (__pureSocial) {
          console.log('SMALLTALK_REGEN_DETERMINISTIC', conversationId, (__hardFails || []).map((f) => String((f && f.code) || f)).join('+'));
          return smalltalkReplyFor(text, __priorBotSocial);
        }
        __episode.chargeRegeneration();

        // EVIDENCE-AWARE REGENERATION (2026-09-22, root cause of the R130 escalations).
        //
        // On the FAST route the model has no tools. When it produces an answer the gate then
        // rejects for an evidence or coverage reason — UNSUPPORTED_NUMBER because a figure it
        // stated is not in the slice the auditor holds, or MISSED_QUESTION because it answered
        // only one half of a two-part ask — the plain retry below re-runs with exactly the same
        // context and no way to look anything up. When that retry also fails, the only exit is
        // a handoff, and the owner's rule forbids escalating a question the FAQ answers.
        //
        // Measured on frozen case R130 ("once I pass phase 1 on 2 step, how soon does phase 2
        // login show up, and after phase 2 how long to live?"): escalated 3 of 5 runs on
        // chat.completions and 2 of 5 on responses — pre-existing on BOTH transports. The gate
        // itself is correct: given a complete answer it returns send:true with no hard fails.
        //
        // So for an evidence/coverage failure on a knowledge-answerable ask, regenerate through
        // the FULL tool route instead, which gives the model search_knowledge. Episode budgets
        // still apply (regenerations, tool rounds, model calls), and the regenerated reply
        // re-enters the same validation path as any other draft.
        const __fails = (__hardFails || []).map((f) => String((f && f.code) || f));
        const __evidenceFail = __fails.some((c) => c === 'UNSUPPORTED_NUMBER' || c === 'MISSED_QUESTION' || c === 'COVERAGE_INCOMPLETE' || c === 'PUBLIC_RESTATEMENT' || c === 'UNCONFIRMED_VARIANT_FIGURE');
        if (__evidenceFail && isKnowledgeAnswerableAsk(text) && __episode.canStartToolRound()) {
          try {
            console.log('PRESEND_REGENERATE_WITH_TOOLS', conversationId, __fails.join('+'));
            /* LUNA_IMAGE_UNDERSTAND_V1:BEGIN:regen-with-images */
            const __regenText = userMsg + '\n\n' + correctionInstruction +
              ((imageAtts && imageAtts.length)
                ? '\n\nHARD IMAGE RULE: The client screenshot(s) are still attached below. You can see them. Explain what they show. Do not claim you cannot see the image. Do not ask for account number just to explain a readable screenshot. Visible figures on the screenshot are display evidence — you may restate them as shown. Use search_knowledge for FundedElite policy around what is shown.'
                : '') +
              '\n\nLook up whatever you need to state every figure exactly as the approved FAQ gives it, and answer every part of the question. Return ACTION: REPLY with the corrected client-facing answer only.' +
              (__fails.includes('PUBLIC_RESTATEMENT')
                ? '\n\nThe draft you are replacing only restated the client or summarized them in the third person. Do not send that. Answer in second person with the resolution, explanation, required clarification, or next step from approved knowledge. If you still cannot answer, ACTION: ESCALATE with CLIENT as a short second-person handoff and BODY as an internal summary only.'
                : '');
            const __regenUserContent = (__visionAtts && __visionAtts.length)
              ? await buildVisionUserContent(__regenText, __visionAtts)
              : __regenText;
            const __toolRetry = await lunaToolsRuntime.runChat({
              openai, control, __statePresend, conversationId, parts, latestUser, text,
              imageAtts, imageEvidenceText: __imgEv(), faqKb, imageAskGuard: __imageAskGuard, /* IMAGE_EVIDENCE_V1 */
              getEscalateState: (cid) => getConvState(cid).state,
              episode: __episode,
              knowledge: __presendKnowledge,
              knowledgeLevel: 'partial',
              forceFull: true,
              previousPresendFailed: true,
              presendHardCodes: __fails, // effortPolicy X4: a HIGH draft failed validation; regenerate at XHIGH
              userContent: __regenUserContent,
            });
            /* LUNA_IMAGE_UNDERSTAND_V1:END:regen-with-images */
            if (Array.isArray(__toolRetry.retrievedKnowledge) && __toolRetry.retrievedKnowledge.length) {
              const seen = new Set((__presendKnowledge || []).map((k) => k.text));
              const extra = __toolRetry.retrievedKnowledge.filter((k) => k && k.text && !seen.has(k.text));
              if (extra.length) {
                __presendKnowledge = (__presendKnowledge || []).concat(extra);
                console.log('PRESEND_KNOWLEDGE_MERGED_REGEN', conversationId, extra.length);
              }
            }
            const __tp = parseAction(__toolRetry.rawOut || '');
            if (__tp.action === 'REPLY' && __tp.body) return postProcessModelReply(__tp.body, conversationId);
            console.log('PRESEND_REGENERATE_WITH_TOOLS_NO_REPLY', conversationId, __tp.action || 'none');
          } catch (e) {
            console.error('PRESEND_REGENERATE_WITH_TOOLS_FAILED', conversationId, 'class=' + (e && e.name || 'Error'));
          }
          // fall through to the plain retry below
        }

        /* LUNA_IMAGE_UNDERSTAND_V1:BEGIN:plain-regen-images */
        const __plainRegenText = userMsg + '\n\n' + correctionInstruction +
          ((imageAtts && imageAtts.length)
            ? '\n\nHARD IMAGE RULE: The client screenshot(s) are still attached. You can see them. Explain what they show; never say you cannot see the image; do not ask for account number just to explain it.'
            : '') +
          '\n\nReturn ACTION: REPLY with the corrected client-facing answer only.';
        const __plainRegenContent = (__visionAtts && __visionAtts.length)
          ? await buildVisionUserContent(__plainRegenText, __visionAtts)
          : __plainRegenText;
        const retry = await lunaModel.create(openai, {
          model: control.getModel(),
          ...modelConfig.answerParams({
            tools: false, purpose: 'presend.regenerate',
            conversationId, episode: __episode, phase: 'regeneration',
            presend: { result: { hardFails: __hardFails || [] } },
          }),
          conversationId,
          episode: __episode,
          messages: [
            { role: 'system', content: control.getPrompt() },
            { role: 'user', content: __plainRegenContent },
          ],
        });
        /* LUNA_IMAGE_UNDERSTAND_V1:END:plain-regen-images */
        const retryParsed = parseAction((((retry.choices[0] || {}).message || {}).content) || '');
        if (retryParsed.action === 'REPLY' && retryParsed.body) return postProcessModelReply(retryParsed.body, conversationId);
      } catch (e) { console.error('PRESEND_REGENERATE_FAILED', conversationId, 'class=' + (e && e.name || 'Error')); }
      return null;
    };
    /* TEAMMATE_TOPIC_OWNERSHIP_V1: in scoped mode the pending client parts are replaced by the scoped
     * general ask(s) (latestUser), so coverage is audited on exactly what Luna is allowed to answer. */
    const __presendHistory = __teammateScope
      ? (() => { const __pid = new Set((__teammateScope.pending || []).map((m) => m.id)); return parts.filter((p) => !__pid.has(String((p && p.id) || ''))); })()
      : parts;
    try { __presend = await __statePresend.gate({ conversationId: conversationId, draft: body, latestUser: latestUser, clientName: clientName, history: __presendHistory, knowledge: __presendKnowledge, comparison: __comparison, regenerate: __presendRegenerate, scopeDecline: __isScopeDecline, route: __pureSocial ? 'FAST' : undefined }); body = __presend.body; } catch (__e) { console.error('[statePresend.hookP] gate threw — fail-closed (holding send)', 'class=' + (__e && __e.name || 'Error')); __presend = { body: body, send: false, reason: 'gate-error-fail-closed' }; }
    if (__comparison && !__presend.send) {
      // One canonical recovery after the general presend gate has exhausted its
      // targeted repair. Do not enter older variant or generic status fallbacks.
      const __safe = postProcessModelReply(productComparison.render(__comparison, /exact options|which options/i.test(text)), conversationId);
      if (productComparison.assess(__comparison, __safe).ok) {
        try {
          const __safeGate = await __statePresend.gate({ conversationId, draft: __safe, latestUser, clientName, history: __presendHistory, knowledge: __presendKnowledge, comparison: __comparison, scopeDecline: __isScopeDecline });
          if (__safeGate.send && productComparison.assess(__comparison, __safeGate.body).ok) {
            __presend = __safeGate;
            body = __safeGate.body;
            console.log('PRODUCT_COMPARISON_PRESEND_RECOVERED', conversationId);
          }
        } catch (e) { console.error('PRODUCT_COMPARISON_PRESEND_RECOVERY_FAILED', conversationId, 'class=' + (e && e.name || 'Error')); }
      }
      if (!__presend.send) {
        console.log('PRODUCT_COMPARISON_HELD', conversationId, 'len=' + String(__presend.reason || '').length,
          JSON.stringify(((__presend.result && __presend.result.hardFails) || []).map((f) => f && f.code).slice(0, 3)));
        // TOOL_BUDGET_FINAL_V1 / COMPARISON_HOLD_NO_SILENCE (2026-09-28): a multi-topic message that also asks for a
        // comparison failed presend (typically MISSED_QUESTION: the canonical table only covers the comparison).
        // Returning here was silent. Fall through to the existing presend-hold handling below (partial-answer
        // completion for a general question, escalation/clarify otherwise) - the same fail-closed path every
        // non-comparison hold already uses. The send stays held (__presend.send === false) until that path decides.
        console.log('PRODUCT_COMPARISON_HELD_TO_HOLD_PATH', conversationId);
      }
    }
    // The presend formatter and its recovery may rewrite an otherwise correct
    // comparison. Audit the actual outgoing body against the same table.
    if (__comparison && __presend.send) {
      const __finalCheck = productComparison.assess(__comparison, body);
      if (!__finalCheck.ok) {
        console.log('PRODUCT_COMPARISON_DOWNSTREAM_REPLACEMENT', conversationId, __finalCheck.errors.join(','));
        const __safe = postProcessModelReply(productComparison.render(__comparison, /exact options|which options/i.test(text)), conversationId);
        if (productComparison.assess(__comparison, __safe).ok) {
          const __safeGate = await __statePresend.gate({ conversationId, draft: __safe, latestUser, clientName, history: __presendHistory, knowledge: __presendKnowledge, comparison: __comparison, scopeDecline: __isScopeDecline });
          if (__safeGate.send && productComparison.assess(__comparison, __safeGate.body).ok) {
            __presend = __safeGate;
            body = __safeGate.body;
          } else {
            // COMPARISON_HOLD_NO_SILENCE (2026-09-28): the approved draft failed the table check and the canonical
            // table failed presend (multi-topic: it does not cover the other questions). This used to end in a
            // silent return. Hand it to the existing presend-hold handling (partial-answer completion for a general
            // question, escalation/clarify otherwise) with the canonical gate's failures.
            console.log('PRODUCT_COMPARISON_FINAL_TO_HOLD_PATH', conversationId, 'comparison-final-invalid');
            __presend = { ...__presend, ...(__safeGate || {}), send: false, reason: 'enforce-critical:needs-escalate', comparisonHold: 'comparison-final-invalid' };
          }
        } else {
          console.log('PRODUCT_COMPARISON_FINAL_TO_HOLD_PATH', conversationId, 'comparison-canonical-invalid');
          __presend = { ...__presend, send: false, reason: 'enforce-critical:needs-escalate', comparisonHold: 'comparison-canonical-invalid' };
        }
      }
    }
    if (repeatedClientQuestion && !__presend.send && __presend.result &&
        __presend.result.hardFails.length > 0 &&
        __presend.result.hardFails.every((f) => f.code === 'DUPLICATE_REPLY')) {
      const priorReply = parts.slice().reverse().find((p) =>
        String((p.author || {}).id || '') === ARSAL_ID && p.part_type !== 'note' && p.body);
      // Out of regeneration budget: skip the rewrite only. The send is already held by the
      // gate, so the existing hold handling below still runs — the handler must not return.
      if (priorReply && !__episode.canRegenerate()) {
        console.log('REPEATED_QUESTION_REGEN_BUDGET', conversationId);
      } else if (priorReply) {
        try {
          const previous = stripHtml(priorReply.body);
          __episode.chargeRegeneration();
          const retry = await lunaModel.create(openai, {
            model: control.getModel(),
            ...modelConfig.answerParams({
              tools: false, purpose: 'presend.duplicate-reply-rewrite',
              conversationId, episode: __episode, phase: 'regeneration',
              presend: __presend,
            }),
            conversationId,
            episode: __episode,
            messages: [
              { role: 'system', content: control.getPrompt() },
              { role: 'user', content: userMsg + '\n\nYour draft copied your previous reply. Retry once: answer the client in fresh, natural wording. Keep the previous verified answer\'s facts, numbers, eligibility, and policy unchanged. Previous reply:\n' + previous + '\n\nReturn ACTION: REPLY with the revised client-facing answer only.' },
            ],
          });
          const retryParsed = parseAction((((retry.choices[0] || {}).message || {}).content) || '');
          if (retryParsed.action === 'REPLY' && retryParsed.body) {
            const candidate = postProcessModelReply(retryParsed.body, conversationId);
            if (protectedFactsMatch(previous, candidate)) {
              const retryGate = await __statePresend.gate({ conversationId, draft: candidate, latestUser, clientName, history: __presendHistory, knowledge: __presendKnowledge });
              if (retryGate.send && retryGate.result && retryGate.result.ok &&
                  protectedFactsMatch(previous, retryGate.body)) {
                __presend = retryGate;
                body = retryGate.body;
                console.log('REPEATED_QUESTION_REPHRASED', conversationId);
              }
            } else console.log('REPEATED_QUESTION_FACT_MISMATCH_HELD', conversationId);
          }
        } catch (e) { console.error('REPEATED_QUESTION_RETRY_FAILED', conversationId, 'class=' + (e && e.name || 'Error')); }
      }
    }
    /* LUNA_STATE_PRESEND_V1:END:hookP */
    /* LUNA_MAINTAINER_V1:BEGIN:observe */
    try {
      __maintainer.observe(__presend, {
        conversationId: conversationId,
        messageId: latestUser && latestUser.id,
        clientText: text,
        authorType: 'customer',
        isNote: false,
        sent: !!(__presend && __presend.send),
        body: body,
        escalated: !!(typeof escalateRequested !== 'undefined' && escalateRequested),
        assignedToId: (full && full.admin_assignee_id) || '',
        retries: (__presend && __presend.attempts) || 0,
        engine: LUNA_STATE_PRESEND_VERSION,
      });
    } catch (__e) { /* observation must never affect the reply */ }
    /* LUNA_MAINTAINER_V1:END:observe */
    /* TEAMMATE_TOPIC_OWNERSHIP_V1:BEGIN:scopedSend
     * The presend gate above already ran its own evidence-aware regeneration (retrieval + tools,
     * restricted to the same general asks because `text`/`latestUser`/`userMsg` are scoped).
     * Send only a validated, knowledge-grounded answer; otherwise stay silent. Never fall into
     * the hold / escalate / clarify / identity branches below — a teammate owns this ticket. */
    if (__teammateScope) {
      const __grounded = Array.isArray(__presendKnowledge) && __presendKnowledge.length > 0;
      const __violation = teammateTopicOwnership.scopedBodyViolation(body);
      if (!__presend.send) {
        console.log('TEAMMATE_SCOPE_SILENT presend-held', conversationId, 'len=' + String(__presend.reason || '').length,
          ((__presend.result && __presend.result.hardFails) || []).map((f) => f && f.code).join(','));
        if (__teammateScope && __teammateScope.statusFallback) await postEscalateHoldingStatus(conversationId, __teammateScopeOriginalText, latestUser, clientName, getConvState(conversationId).state, 'MIXED_AWAITING_ANSWER fallback status'); /* MIXED_AWAITING_ANSWER_V1 */
        return res.sendStatus(200);
      }
      if (!__grounded) {
        console.log('TEAMMATE_SCOPE_SILENT no-approved-knowledge', conversationId);
        if (__teammateScope && __teammateScope.statusFallback) await postEscalateHoldingStatus(conversationId, __teammateScopeOriginalText, latestUser, clientName, getConvState(conversationId).state, 'MIXED_AWAITING_ANSWER fallback status'); /* MIXED_AWAITING_ANSWER_V1 */
        return res.sendStatus(200);
      }
      if (__violation) {
        console.log('TEAMMATE_SCOPE_SILENT body-violation', __violation, conversationId);
        if (__teammateScope && __teammateScope.statusFallback) await postEscalateHoldingStatus(conversationId, __teammateScopeOriginalText, latestUser, clientName, getConvState(conversationId).state, 'MIXED_AWAITING_ANSWER fallback status'); /* MIXED_AWAITING_ANSWER_V1 */
        return res.sendStatus(200);
      }
      if (__comparison && !productComparison.assess(__comparison, body).ok) {
        console.log('PRODUCT_COMPARISON_FINAL_HOLD', conversationId, 'teammate-scope');
        return res.sendStatus(200);
      }
      const __sent = await postClientCommentOnce(conversationId, body, latestUser, clientName,
        { intent: __decision, knowledge: __presendKnowledge, comparison: __comparison, presendOk: !!(__presend.finalResult && __presend.finalResult.ok), approvedBody: __presend.body });
      console.log('TEAMMATE_SCOPE_SENT', conversationId, __sent ? 'ok' : 'blocked-at-send-boundary',
        'mixed', !!__teammateScope.mixed);
      return res.sendStatus(200);
    }
    /* TEAMMATE_TOPIC_OWNERSHIP_V1:END:scopedSend */
    /* NO_REVIVE_ACCOUNT_DURING_SMALLTALK_V1 */
    if (typeof shouldNotReviveAccountIssue === 'function' && shouldNotReviveAccountIssue(text) && generalAccountAskGuard.asksForIdentity(body)) {
      console.log('NO_REVIVE_ACCOUNT_DURING_SMALLTALK', conversationId);
      body = smalltalkReplyFor(text);
    }
    /* GENERAL_ACCOUNT_ASK_GUARD_V1:BEGIN:replySend
     * A REPLY that asks for account number/email on a question approved knowledge answers is never
     * sent as-is (live 215476072310759: the ESCALATE->REPLY force body was only the account ask).
     * Strip the ask when a real answer remains; otherwise regenerate once from official knowledge
     * and re-validate; otherwise send nothing rather than an account ask. Legitimate account
     * collection never passes through here (ensureIdentityBeforeAccountEscalate posts directly). */
    if (__presend.send && body) {
      let __acct = null;
      try { __acct = assessGeneralAccountAsk(parts, text, body, __decision); } catch (_) { __acct = null; }
      if (__acct && __acct.violation) {
        const __stripped = generalAccountAskGuard.stripIdentityAsks(body);
        if (generalAccountAskGuard.isSubstantiveAnswer(__stripped)) {
          body = __stripped;
          console.log('GENERAL_ACCOUNT_ASK stripped reply', conversationId);
        } else {
          let __fixed = '';
          if (__episode.canRegenerate()) {
            try {
              __episode.chargeRegeneration();
              console.log('GENERAL_ACCOUNT_ASK regenerate', conversationId);
              const __r = await lunaModel.create(openai, {
                model: control.getModel(),
                ...modelConfig.answerParams({ tools: false, purpose: 'reply.general-no-account-ask', conversationId, episode: __episode, phase: 'regeneration' }),
                conversationId,
                episode: __episode,
                messages: [
                  { role: 'system', content: control.getPrompt() },
                  {
                    role: 'user',
                    content: userMsg +
                      '\n\nHARD OVERRIDE: The client asked a general question that the OFFICIAL FAQ CONTEXT answers: ' +
                      __acct.pending.join(' / ').slice(0, 800) +
                      '\nAnswer it from that context. ACTION: REPLY. Do NOT ask for an account number, login or email. Do NOT say you will pass anything to a teammate. If a part is not covered by the context, say so briefly instead of asking for account details.',
                  },
                ],
              });
              const __pr = parseAction((((__r.choices[0] || {}).message || {}).content) || '');
              if (__pr.action === 'REPLY' && __pr.body) {
                const __cand = postProcessModelReply(__pr.body, conversationId);
                const __g = await __statePresend.gate({ conversationId, draft: __cand, latestUser, clientName, history: __presendHistory, knowledge: __presendKnowledge });
                if (__g.send && __g.body) __fixed = applyGeneralAccountAskGuardSync(conversationId, parts, text, __g.body, 'regenerated');
                else console.log('GENERAL_ACCOUNT_ASK regenerate held', conversationId, __g.reason || '');
              }
            } catch (e) {
              console.error('GENERAL_ACCOUNT_ASK regenerate failed', conversationId, 'class=' + (e && e.name || 'Error'));
            }
          }
          if (!__fixed) {
            console.log('GENERAL_ACCOUNT_ASK suppressed reply', conversationId, '(no safe general answer; account ask not sent)');
            return res.sendStatus(200);
          }
          body = __fixed;
          console.log('GENERAL_ACCOUNT_ASK regenerated-ok', conversationId);
        }
      }
    }
    /* GENERAL_ACCOUNT_ASK_GUARD_V1:END:replySend */
    if (__presend.send && __comparison && !productComparison.assess(__comparison, body).ok) {
      console.log('PRODUCT_COMPARISON_FINAL_HOLD', conversationId, 'send-boundary');
      return res.sendStatus(200);
    }
    if (__presend.send) {
      await postClientCommentOnce(conversationId, body, latestUser, clientName,
        { intent: __decision, knowledge: __presendKnowledge, comparison: __comparison, presendOk: !!(__presend.finalResult && __presend.finalResult.ok), approvedBody: __presend.body, socialOnly: __pureSocial }); /* LUNA_STATE_PRESEND_V1:guardSend */
      return res.sendStatus(200);
    }
    // Fail-closed hold for missed human handoff: perform escalate instead of silence.
    // 'needs-escalate' is the same hold, reached instead when the client's own last message
    // (not an explicit "get me a human" ask) is understood but the bot has no compliant
    // answer for it (MISSED_QUESTION/WRONG_TOPIC unfixable) - reuses this same escalate path
    // rather than shipping the generic "checking this now" line.
    if (
      __presend &&
      (__presend.reason === 'missed-escalation-held' ||
        __presend.reason === 'enforce-critical:missed-escalation-held' ||
        __presend.reason === 'needs-escalate' ||
        __presend.reason === 'enforce-critical:needs-escalate' ||
        (__presend.result &&
          Array.isArray(__presend.result.hardFails) &&
          __presend.result.hardFails.some((f) => f && f.code === 'MISSED_ESCALATION')))
    ) {
      try {
        console.log('PRESEND_MISSED_ESCALATION_ESCALATE', conversationId, __presend.reason || '');
        // Decide WHAT this held reply really is before anything can become a teammate note.
        // Junk, small talk, personal and off-topic messages get a normal reply (or silence);
        // only an understood FundedElite question the bot cannot answer, or a real request for
        // a person, may open a note. See presendHoldKind().
        const __problem = bestProblemText(parts, text);
        // PENDING_ASK_RESOLVE_V1: the question a nudge/reference points at (== text for a real ask).
        const __holdAsk = resolvePendingAsk(parts, text);
        if (__holdAsk !== String(text || '').trim()) console.log('PRESEND_HOLD_PENDING_ASK', conversationId, 'latest message is a nudge/reference; judging the pending question');
        let __kind = replyDecision.holdKind(__decision, __presend && __presend.reason);
        // IMAGE_ROUTING_V1: an image turn about FundedElite content is at least general-faq for hold purposes; a held
        // draft there never becomes the canned out-of-scope decline.
        if ((__kind === 'off-topic' || __kind === 'contentless') && __imageTurn && __imageRelated) {
          console.log('PRESEND_HOLD_KIND_IMAGE', conversationId, __kind, '-> general-faq');
          __kind = 'general-faq';
        }
        // The resolved turn decision owns routing. These flags only choose how to
        // word an answer inside that route; they cannot reclassify it.
        const __priorBot = parts
          .filter((p) => p && String(p.part_type || '') !== 'note' && ((p.author || {}).type === 'admin' || (p.author || {}).type === 'bot'))
          .map((p) => stripHtml(p.body || ''))
          .filter(Boolean);
        const __familyCtx = challengeVariantGuard.lastBotAskedProductVariant(__priorBot);
        const __bothPending = challengeVariantGuard.isBothVariantsClientReply(text) && !!__familyCtx;
        const __faqInherit = __decision.productFollowUp;
        console.log('PRESEND_HOLD_KIND', conversationId, __kind);
        // Clear client question held as needs-escalate / MISSED_QUESTION / UNSUPPORTED_PROMISE
        // must never become the vague "share a bit more" clarify — escalate with a note instead
        // (or keep a safe FAQ draft when one exists further below).
        if (__kind === 'general-faq' || __kind === 'contentless' || __kind === 'off-topic') {
          const __codesForce = ((__presend.result && __presend.result.hardFails) || []).map((f) => (f && f.code) || '');
          const __holdNeedsEsc =
            /needs-escalate/i.test(String((__presend && __presend.reason) || '')) ||
            __codesForce.some((c) =>
              c === 'MISSED_QUESTION' ||
              c === 'UNSUPPORTED_PROMISE' ||
              c === 'UNSUPPORTED_NUMBER' ||
              c === 'UNSUPPORTED_FACT' ||
              c === 'FORBIDDEN_DIAGNOSTIC_ACTION' ||
              c === 'PUBLIC_RESTATEMENT'
            );
          let __substantial = false;
          try {
            const TU = require('./statePresend/textUtils');
            __substantial =
              (TU.isSubstantialClearQuestion && (TU.isSubstantialClearQuestion(text) || TU.isSubstantialClearQuestion(__problem))) ||
              (TU.isReferentialFollowUp && (TU.isReferentialFollowUp(text) || TU.isReferentialFollowUp(__problem)));
          } catch (_) {
            __substantial = String(text || '').trim().length >= 40;
          }
          // A general FAQ question must NOT become an escalation just because OUR draft failed
          // validation. UNSUPPORTED_NUMBER / UNSUPPORTED_FACT / MISSED_QUESTION mean the model
          // wrote something ungrounded or incomplete — they say nothing about whether a
          // teammate has to open this client's account. Forcing escalate here sent the episode
          // down the escalation path, which then asked the customer for their account number
          // (live: IDENTITY_BEFORE_ESCALATE after PRESEND_HOLD_FORCE_ESCALATE general-faq
          // UNSUPPORTED_NUMBER). Arsal's standing rule forbids asking for account details on a
          // question the approved knowledge base answers.
          //
          // So: skip the force only when the ask is knowledge-answerable AND every failing code
          // is a draft-quality code. Anything else — UNSUPPORTED_PROMISE, MISSED_ESCALATION,
          // FORBIDDEN_DIAGNOSTIC_ACTION, or an account-specific ask — still escalates exactly
          // as before. The general-faq branch below already refuses to ship a draft that failed
          // these codes, so skipping the force cannot leak the ungrounded figure.
          const __faqAnswerableHold =
            faqHoldMustNotEscalate(__kind, __codesForce, text, conversationId) ||
            (__holdAsk !== String(text || '').trim() && faqHoldMustNotEscalate(__kind, __codesForce, __holdAsk, conversationId)); /* PENDING_ASK_RESOLVE_V1 */

          if (__holdNeedsEsc && __substantial && __faqAnswerableHold) {
            console.log('PRESEND_HOLD_FAQ_NO_ESCALATE', conversationId, __codesForce.join(','),
              '(knowledge-answerable: answering path kept, no account details asked)');
          } else if (__holdNeedsEsc && __substantial && __kind !== 'off-topic') {
            // OFFTOPIC_NEVER_ESCALATE_V1: an off-topic message must never become a teammate note
            // (owner escalation policy); it keeps the scope-decline path below.
            console.log('PRESEND_HOLD_FORCE_ESCALATE', conversationId, __kind, __codesForce.join(','));
            __kind = 'escalate';
          }
        }
        if (__kind !== 'escalate' && __kind !== 'human-request') {
          let __reply = '';
          if (__kind === 'smalltalk' || __kind === 'support-meta') {
            const __draft = body && String(body).trim();
            const __looksScope =
              !__draft ||
              /\[\[SCOPE_DECLINE\]\]|outside what I can help|only handle FundedElite|FundedElite topics are all I can cover|Not something I can cover/i.test(__draft) ||
              BOUNDARY_REFUSAL_TEXT_RE.test(__draft); /* TURN_INTENT_V1 */
            __reply = __looksScope ? smalltalkReplyFor(text, __priorBot) : __draft;
            if (__looksScope) console.log('THANKS_OR_SMALLTALK_OVERRIDE', conversationId);
          } else if (__kind === 'personal') {
            __reply = assistantIdentityGuard.enforceAssistantIdentityReply(__problem, body || '', conversationId, __priorBot);
          } else if (__kind === 'off-topic') {
            if (isGreetingOrSmallTalk(text) || teammateHandoffGates.isShortClientAckExpanded(text)) {
              __reply = smalltalkReplyFor(text, __priorBot);
              console.log('THANKS_BLOCK_SCOPE_DECLINE', conversationId);
            } else {
              __reply = postProcessModelReply('[[SCOPE_DECLINE]]', conversationId);
            }
          } else if (__kind === 'clarify') {
            /* TURN_INTENT_V1: no positive evidence that this is FundedElite work or an unrelated task. A validator hold
             * must never turn that into the scope refusal. Keep the model's own draft when only coverage failed (the
             * coverage check cannot judge an unclassified message) and it is not a refusal; else a natural clarification. */
            // Already-escalated "Jerry!!!!!!": never the stock clarify loop.
            if (isEscalationPersonCall(text) && hasOpenEscalation(getConvState(conversationId).state)) {
              console.log('TURN_INTENT_HOLD_CLARIFY skipped (escalation person call)', conversationId);
              await postEscalateHoldingStatus(
                conversationId, text, latestUser, clientName,
                getConvState(conversationId).state,
                'ESCALATE person-call hold (clarify-path)'
              );
              return res.sendStatus(200);
            }
            const __draft = body && String(body).trim();
            const __cc = ((__presend.result && __presend.result.hardFails) || []).map((f) => (f && f.code) || '');
            const __draftOk = __draft && !BOUNDARY_REFUSAL_TEXT_RE.test(__draft) && !/\[\[SCOPE_DECLINE\]\]/.test(__draft) &&
              __cc.length > 0 && __cc.every((c) => c === 'MISSED_QUESTION');
            const __specific = (__decision && __decision.specificClarify) || '';
            __reply = __draftOk ? __draft : (__specific || UNCLEAR_CLARIFY_REPLY);
            console.log('TURN_INTENT_HOLD_CLARIFY', conversationId, __draftOk ? 'draft' : (__specific ? 'specific' : 'clarify'), __cc.join(','));
          } else if (__kind === 'contentless') {
            const nudge = regenModule().NUDGE_REPLY;
            const norm = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
            __reply = __priorBot.slice(-3).some((r) => norm(r) === norm(nudge)) ? '' : nudge;
          } else if (__kind === 'general-faq') {
            /* PARTIAL_ANSWER_COMPLETE_V1 (2026-09-24): never silently drop a materially distinct question.
             * 1. keep the supported answer; 2. ONE bounded regeneration that must cover every part (a part the
             * official context does not state is answered as "not published"; an unclear part gets one short
             * clarification); 3. else append an explicit line per missed general part. Account-work parts are
             * left to the existing account/escalation flow (no note or account ask is created here). Every
             * candidate passes the full presend gate before it is used. */
            const __completePartialAnswer = async (partialBody, fails, where) => {
              try {
                const missed = [].concat(...((fails || []).filter((f) => f && f.code === 'MISSED_QUESTION').map((f) => (Array.isArray(f.missed) ? f.missed : []))))
                  .map((x) => String(x || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
                if (!partialBody || !missed.length) return partialBody;
                const general = missed.filter((m) => !(isClearlyAccountSpecificIssue(m) || presendNeedsBackendLook(m)));
                if (!general.length) { console.log('PARTIAL_ANSWER account part left to account flow', conversationId, where); return partialBody; }
                const __gateIt = async (d) => {
                  const g = await __statePresend.gate({ conversationId, draft: postProcessModelReply(d, conversationId), latestUser, clientName, history: parts, knowledge: __presendKnowledge, scopeDecline: __isScopeDecline });
                  return g && g.send && g.body ? g.body : '';
                };
                /* PARTIAL_VARIANT_PROMO_FACTS_V1 (live 215476080792109): Instant↔Elite compare
                 * and general current-promotions asks must use approved facts — never
                 * "official info does not state how Instant and Instant Elite differ", and never
                 * answer "current promotions" with only a single product's OCT35 line. */
                let __partialExtraFacts = '';
                try {
                  const __missBlob = general.join(' ') + ' ' + String(text || '') + ' ' + String(typeof __holdAsk !== 'undefined' ? __holdAsk : '');
                  const __families = (challengeVariantGuard && challengeVariantGuard.PRODUCT_FAMILIES) || [];
                  if (variantComparisonCompleteness.looksLikeVariantComparisonAsk(__missBlob) ||
                      variantComparisonCompleteness.looksLikeVariantComparisonAsk(String(text || '')) ||
                      /instant\s*(?:vs\.?|versus|and|or|compared?\s+to)\s*instant\s*elite|instant\s*elite\s*(?:vs\.?|versus|and|or|compared?\s+to)\s*instant/i.test(__missBlob)) {
                    const __fam = variantComparisonCompleteness.sizeOnlyFamilyForAsk(__missBlob, __families)
                      || variantComparisonCompleteness.sizeOnlyFamilyForAsk(String(text || ''), __families);
                    const __plan = variantComparisonCompleteness.comparisonPlanLinesForSizeOnlyFamily(__fam);
                    __partialExtraFacts += '\n\nAPPROVED VARIANT COMPARISON FACTS (use these; NEVER say the official information does not state how Instant and Instant Elite differ):\n' + __plan.join('\n');
                  }
                  if (septemberPromos && /\b(?:current\s+)?promotions?\b|\b(?:any\s+)?(?:promo|discount|coupon|offer)s?\b/i.test(__missBlob)) {
                    const __pr = (typeof septemberPromos.handleCustomerMessage === 'function'
                      ? septemberPromos.handleCustomerMessage('What are the current promotions?', [])
                      : null);
                    const __promoTxt = typeof __pr === 'string' ? __pr : (__pr && __pr.reply) || '';
                    if (__promoTxt) {
                      __partialExtraFacts += '\n\nAPPROVED CURRENT-PROMOTIONS OVERVIEW (summary not catalogue: one bullet per ACTIVE code — OCT35, FLASH5, NEW50. Do not dump $50k/$100k/$200k/$300k/$400k or every eligible product):\n' + String(__promoTxt).trim();
                    }
                  }
                } catch (e) { console.error('PARTIAL_ANSWER_FACTS_ERR', conversationId, 'class=' + (e && e.name || 'Error')); }
                if (__episode.canRegenerate()) {
                  __episode.chargeRegeneration();
                  const r = await lunaModel.create(openai, {
                    model: control.getModel(),
                    ...modelConfig.answerParams({ tools: false, purpose: 'reply.partial-complete', conversationId, episode: __episode, phase: 'regeneration' }),
                    conversationId,
                    episode: __episode,
                    messages: [
                      { role: 'system', content: control.getPrompt() },
                      { role: 'user', content: userMsg + '\n\nHARD OVERRIDE: Your draft answered only part of the client\'s message. Draft:\n' + String(partialBody).slice(0, 2500) +
                        '\n\nWrite ONE reply that keeps the correct answered parts and also addresses: ' + general.map((m) => '"' + m.slice(0, 200) + '"').join('; ') +
                        '. Use OFFICIAL FAQ CONTEXT only. If the context states no answer or no figure for a part, say naturally that there is no fixed figure or answer you can confirm for that part (for example "I can\'t confirm a fixed timeframe for that"), never mentioning the official information, the FAQ or any source (never invent a number or timeframe; SOURCE_TALK_FREE_V1). Only state a timeframe for exactly what the context says it applies to (for example, a delivery time AFTER approval is not the approval or processing time). If a part is unclear, ask one short clarifying question about it. No account/email ask. No teammate handoff. ACTION: REPLY.' +
                        __partialExtraFacts + __imageOverrideClause() },
                    ],
                  });
                  const pr = parseAction((((r.choices[0] || {}).message || {}).content) || '');
                  if (pr.action === 'REPLY' && pr.body) {
                    let __regenBody = pr.body;
                    try {
                      if (typeof variantComparisonCompleteness.scrubFalseVariantGapHedge === 'function') {
                        __regenBody = variantComparisonCompleteness.scrubFalseVariantGapHedge(__regenBody, String(text || '') + ' ' + general.join(' '));
                      }
                    } catch (_) {}
                    const ok = await __gateIt(__regenBody);
                    if (ok) { console.log('PARTIAL_ANSWER regenerated-complete', conversationId, where); return ok; }
                    console.log('PARTIAL_ANSWER regeneration held', conversationId, where);
                  }
                }
                // PARTIAL_ANSWER_HONEST_V2 (2026-09-25, docs/maintainer-20260925): the missed part is never pasted
                // from evidence (retrieved text can carry internal guidance: live 215476097914090) and never
                // quoted back to the client. An honest "not published" line is added only when ALL hold:
                //   - the missed unit is a genuine question (not a statement, courtesy line or complaint);
                //   - the approved evidence does not address it (checked, never copied);
                //   - the conversation is in English (a French reply got an English line appended).
                // Otherwise the supported answer is sent on its own.
                const T = require('./statePresend/textUtils');
                const __STOPW = new Set(['what', 'when', 'where', 'which', 'that', 'this', 'with', 'from', 'have', 'your', 'about', 'there', 'their', 'would', 'could', 'should', 'does', 'will', 'please', 'tell', 'know', 'want', 'much', 'many']);
                const __content = (x) => new Set((T.tokens(String(x || '').toLowerCase()) || []).map((w) => String(w).replace(/(?:ing|ed|es|s)$/, '').replace(/e$/, '')).filter((w) => w.length > 3 && !__STOPW.has(w)));
                const __evidenceText = (Array.isArray(__presendKnowledge) ? __presendKnowledge : []).map((k) => stripHtml(String((k && k.text) || ''))).join('\n');
                const __evidenceSentences = __evidenceText.split(/(?<=[.!?])\s+|\n+/).filter((x) => x.length >= 20);
                const __DUR = /\b\d+(?:\s*(?:to|-)\s*\d+)?\s*(?:business\s+|working\s+)?(?:minutes?|hours?|days?|weeks?|months?)\b|\bwithin\s+(?:hours|minutes|days)\b/i;
                const __evidenceCovers = (q) => {
                  try {
                    if (require('./statePresend/multiAskCompleteness').timingAnswerCovers(q, __evidenceText)) return true;
                  } catch (_) { /* lexical check still runs */ }
                  const want = __content(q);
                  if (want.size < 2) return true; // too little to judge: never claim "not published"
                  const time = /\bhow\s+(?:long|soon|often)\b|\bwhen\b|\bwithin\b|\b(?:processing|turnaround)\s+time\b/i.test(q);
                  return __evidenceSentences.some((sent) => {
                    if (time && !__DUR.test(sent)) return false;
                    const have = __content(sent);
                    let sc = 0; for (const w of want) if (have.has(w)) sc += 1;
                    return sc >= 2;
                  });
                };
                const __genuineQuestion = (q0) => { const q = String(q0 || '').trim().replace(/^(?:and|also|so|but|plus|or|then)[,\s]+/i, ''); return /\?\s*$/.test(q) ? !/^(?:how\s+(?:is|can|could)\s+(?:this|that|it)\s+(?:even\s+)?possible|why\s+(?:is|are)\s+you\s+not)\b/i.test(q.trim())
                  : /^(?:what|how|when|where|which|who|why|is|are|can|could|do|does|will|would|should)\b/i.test(q); };
                const __english = (x) => {
                  const w = (String(x || '').toLowerCase().match(/[a-z\u00c0-\u024f']+/g) || []);
                  if (w.length < 3) return true;
                  const EN = new Set(['the', 'is', 'are', 'you', 'what', 'how', 'can', 'my', 'to', 'a', 'of', 'and', 'will', 'i', 'it', 'do', 'for', 'in', 'on', 'be', 'if', 'your', 'this', 'that', 'long', 'when']);
                  return w.filter((t) => EN.has(t)).length / w.length >= 0.15 && !/[\u00c0-\u024f]/.test(String(x || ''));
                };
                const __sharedFactAsk = (q) => {
                  try { return require('./challengeVariantGuard').sharedFactStatus(q, '') === 'missing'; } catch (_) { return false; }
                };
                const __unpublished = general.filter((m) => __genuineQuestion(m) && !__evidenceCovers(m) && !__sharedFactAsk(m));
                console.log('PARTIAL_ANSWER_UNITS', conversationId, where, JSON.stringify(general.map((m) => ({ q: logLen(m), genuine: __genuineQuestion(m), covered: __evidenceCovers(m) }))), 'en', __english(text), __english(partialBody));
                // Name the topic in Luna's own words ("a timeframe for payouts"), never by quoting the client's
                // sentence back. TOPIC_SAFE_HONEST_LINE_V1 (2026-09-26, live 215476112354442 / 215476109613017): the
                // topic used to be the first five raw words of the client's message ("the answer on hy was checking
                // fundedelite via", "on if win 50 000 usd"). It is now taken only from the fixed topic lexicon and a
                // fixed phrase per topic; a unit that names no single known topic gets no line at all.
                const __topicOf = (q) => require('./statePresend/multiAskCompleteness').honestTopicPhrase(q);
                const __topics = [...new Set(__unpublished.map(__topicOf).filter(Boolean))];
                if (__topics.length && __english(text) && __english(partialBody)) {
                  const plain = String(partialBody).trim() + '\n\n' + 'I can\'t confirm ' + /* SOURCE_TALK_FREE_V1 */
                    (__topics.length > 1 ? __topics.slice(0, -1).join(', ') + ' or ' + __topics[__topics.length - 1] : __topics[0]) + ' for you, so I won\'t guess.';
                  const ok3 = await __gateIt(plain);
                  if (ok3) { console.log('PARTIAL_ANSWER completed-honest', conversationId, where); return ok3; }
                }
                /* IMAGE_EVIDENCE_V1:BEGIN:partial-image
                 * Live 215476135544728 18:48: the only genuine open question ("What does that mean ?", about the client's
                 * screenshot) was judged "covered" because it has too few words to judge, and a draft about an unrelated
                 * older topic (NEW50) was sent. With image context, a missed referential ask is only kept as answered when
                 * the draft actually uses the screenshot's content; otherwise nothing unrelated is sent from here. */
                if (__imageTurn && __imageRelated) {
                  const __imgMissed = general.filter((m) => imageEvidence.isReferentialImageAsk(m));
                  // With extracted evidence the draft must use it. Without evidence (read failed / timed out) the model's own
                  // reading is the only one: trust it only when the screenshot was actually in this turn's vision input.
                  if (__imgMissed.length && (__imgEv() ? imageEvidence.anchorsInDraft(partialBody, __imgEv()) < 2 : !__visionAtts.length)) {
                    console.log('PARTIAL_ANSWER image-referential ask not answered by draft; not sent', conversationId, where);
                    return '';
                  }
                }
                /* IMAGE_EVIDENCE_V1:END:partial-image */
                try {
                  const __salv = challengeVariantGuard.salvageMixedVariantSections(text, partialBody);
                  if (__salv && __salv !== String(partialBody || '').trim()) {
                    const __okS = await __gateIt(__salv);
                    if (__okS) { console.log('PARTIAL_ANSWER shared-facts', conversationId, where); return __okS; }
                  }
                } catch (e) { console.error('PARTIAL_ANSWER_SHARED_ERR', conversationId, 'class=' + (e && e.name || 'Error')); }
                try {
                  const __cv = require('./challengeVariantGuard');
                  const __asks = require('./statePresend/multiAskCompleteness').extractAsks([{ role: 'client', text: text }]);
                  if ((__asks.burst || []).some((a) => __cv.sharedFactStatus(a.text, partialBody) === 'missing')) {
                    console.log('PARTIAL_ANSWER withheld shared fact not sent', conversationId, where);
                    return '';
                  }
                } catch (_) { /* fall through to stale-or-fallback */ }
                // CARRIED_QUESTION_COVERAGE_V1: do not treat an unchanged draft as success.
                // Stale carried units are dropped and the draft is revalidated. A question that
                // is still open, or a draft the gate still rejects, returns '' so the caller
                // uses a safe fallback instead of going quiet.
                let __openLeft = general;
                try {
                  const __openNow = unresolvedSupportQuestions(parts);
                  const __Tov = require('./statePresend/textUtils');
                  const __sameUnit = (a, b) => {
                    const left = String(a || '');
                    const right = String(b || '');
                    if (!left || !right) return false;
                    if (left === right || right.includes(left) || left.includes(right)) return true;
                    const ta = new Set(__Tov.tokens(left));
                    const tb = new Set(__Tov.tokens(right));
                    if (!ta.size || !tb.size) return false;
                    let n = 0;
                    for (const w of ta) if (tb.has(w)) n += 1;
                    return n / Math.min(ta.size, tb.size) >= 0.6;
                  };
                  __openLeft = __openNow.length ? general.filter((m) => __openNow.some((o) => __sameUnit(m, o))) : [];
                } catch (_) { __openLeft = general; }
                if (!__openLeft.length) {
                  const __okStale = await __gateIt(partialBody);
                  if (__okStale) {
                    console.log('PARTIAL_ANSWER stale-carried cleared, revalidated', conversationId, where);
                    return __okStale;
                  }
                  console.log('PARTIAL_ANSWER stale-carried cleared but draft still invalid', conversationId, where);
                  return '';
                }
                // Genuine misses remain after regen and the honest line. A stock clarify is
                // not an answer. A substantive partial keeps the parts already answered so
                // the client is not left in silence; the caller sends it even if the text
                // is unchanged. This is not a completed repair and does not clear the miss.
                let __stockPartial = false;
                try { __stockPartial = require('./statePresend/multiAskCompleteness').isOnlyStockClarification(partialBody); } catch (_) { __stockPartial = false; }
                if (!__stockPartial) {
                  console.log('PARTIAL_ANSWER supported-partial; open units remain', conversationId, where);
                  return partialBody;
                }
                console.log('PARTIAL_ANSWER repair-incomplete', conversationId, where);
                return '';
              } catch (e) {
                console.error('PARTIAL_ANSWER_ERR', conversationId, 'class=' + (e && e.name || 'Error'));
                return '';
              }
            };
            // Answerable from approved knowledge: keep talking to the client, never open a note.
            // Pending-variant both/compare → dual FAQ overview; other anaphora keeps draft.
            if (__bothPending) {
              __reply = challengeVariantGuard.resolveBothVariantsReply(
                text, __priorBot, (__modelDraft && String(__modelDraft).trim()) || '', conversationId
              );
              console.log('PRESEND_HOLD general-faq', conversationId, 'both-variants');
            } else {
              const __codes = ((__presend.result && __presend.result.hardFails) || []).map((f) => (f && f.code) || '');
              const __unsafeDraft = __codes.some((c) =>
                c === 'UNSUPPORTED_NUMBER' ||
                c === 'UNSUPPORTED_FACT' ||
                c === 'UNSUPPORTED_PROMISE' ||
                c === 'FORBIDDEN_DIAGNOSTIC_ACTION' ||
                c === 'UNNECESSARY_CLARIFICATION' ||
                c === 'PUBLIC_RESTATEMENT' ||
                c === 'UNCONFIRMED_VARIANT_FIGURE' ||
                c === 'WRONG_TOPIC');
              let __draft = (!__unsafeDraft && __modelDraft && String(__modelDraft).trim()) || '';
              // PROMISE_STRIP_V1: keep the supported answer; drop only the unsupported promise sentence.
              if (!__draft && __modelDraft && __codes.includes('UNSUPPORTED_PROMISE')) {
                try {
                  const __ps = regenModule().stripPromiseSentences(String(__modelDraft), (__presend.result && __presend.result.hardFails) || []);
                  if (__ps) {
                    const __g = await __statePresend.gate({ conversationId, draft: postProcessModelReply(__ps, conversationId), latestUser, clientName, history: parts, knowledge: __presendKnowledge, scopeDecline: __isScopeDecline });
                    if (__g.send && __g.body) { __draft = __g.body; console.log('PROMISE_STRIP held-draft kept supported answer', conversationId); }
                    else console.log('PROMISE_STRIP held-draft still unsafe', conversationId, __g.reason || '');
                  }
                } catch (e) { console.error('PROMISE_STRIP held-draft failed', conversationId, 'class=' + (e && e.name || 'Error')); }
              }
              // GENERAL_ACCOUNT_ASK_GUARD_V1: a held draft that asks for account/email on a general
              // question is not a safe fallback either.
              try {
                if (__draft && assessGeneralAccountAsk(parts, text, __draft).violation) {
                  console.log('GENERAL_ACCOUNT_ASK held-draft dropped', conversationId);
                  __draft = '';
                }
              } catch (_) { /* keep the draft decision above */ }
              // If model wrongly drafted a scope decline on an inherited product follow-up, drop it.
              if (__faqInherit && /\[\[SCOPE_DECLINE\]\]|FundedElite topics are all I can cover|Not something I can cover|outside what I can help/i.test(__draft)) {
                __draft = '';
              }
              // IMAGE_ROUTING_V1: same for a FundedElite screenshot turn.
              if (__imageTurn && __imageRelated && /\[\[SCOPE_DECLINE\]\]|FundedElite topics are all I can cover|Not something I can cover|outside what I can help|only handle FundedElite|FundedElite is all I can help with/i.test(__draft)) {
                console.log('PRESEND_HOLD image scope-decline draft dropped', conversationId);
                __draft = '';
              }
              // Prefer product-family clarify/dual-brief over stock CLARIFY when the client
              // asked generally about Instant / 1-Step / 2-Step (closes silent single-variant
              // dump + hold-draft race). Then rotate stock lines so identical SKIP cannot
              // silence after a prior hold (live 215476025058340 x3).
              let __candidate = __draft || '';
              if (!__candidate) {
                const __pv = challengeVariantGuard.clarifyProductVariantReply(
                  text, [], '', __priorBot, conversationId
                );
                if (__pv && String(__pv).trim()) {
                  __candidate = __pv;
                  console.log('PRESEND_HOLD_PRODUCT_VARIANT_CLARIFY', conversationId);
                }
              }
              if (!__candidate) {
                const __regen = regenModule();
                const __norm = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
                const __recent = (__priorBot || []).slice(-6).map(__norm);
                let __substantialFaq = false;
                try {
                  const TU = require('./statePresend/textUtils');
                  __substantialFaq =
                    (TU.isSubstantialClearQuestion && TU.isSubstantialClearQuestion(text)) ||
                    (TU.isReferentialFollowUp && TU.isReferentialFollowUp(text)) ||
                    (__holdAsk !== String(text || '').trim() && TU.isSubstantialClearQuestion && TU.isSubstantialClearQuestion(__holdAsk)); /* PENDING_ASK_RESOLVE_V1 */
                } catch (_) {}
                // Substantial clear asks: never stock clarify/nudge — leave empty so we stay quiet
                // here only if kind was not force-escalated above; prefer no vague template.
                if (__substantialFaq || __unsafeDraft) {
                  console.log('PRESEND_HOLD skip-vague-clarify', conversationId, __substantialFaq ? 'substantial' : 'unsafe');
                  __candidate = '';
                } else {
                  const __clarify = __regen.CLARIFY_REPLY;
                  const __nudge = __regen.NUDGE_REPLY;
                  const __engage = __regen.ENGAGE_REPLY;
                  if (__clarify && !__recent.includes(__norm(__clarify))) __candidate = __clarify;
                  else if (__nudge && !__recent.includes(__norm(__nudge))) __candidate = __nudge;
                  else if (__engage && !__recent.includes(__norm(__engage))) __candidate = __engage;
                  else {
                    console.log('PRESEND_HOLD quiet (stock clarify/nudge already used)', conversationId);
                    __candidate = '';
                  }
                }
              }
              __reply = __candidate;
              console.log('PRESEND_HOLD general-faq', conversationId, __faqInherit ? 'anaphora-inherit' : (__unsafeDraft ? 'clarify (unsafe draft)' : 'draft'), __codes.join(','));
              // PARTIAL_ANSWER_COMPLETE_V1: a held draft that answered only some of the client's questions is
              // completed (bounded regeneration, else an explicit line per missed part), never sent as a
              // silent partial answer.
              if (__reply && __draft && __reply === __draft && __codes.includes('MISSED_QUESTION')) {
                __reply = await __completePartialAnswer(__reply, (__presend.result && __presend.result.hardFails) || [], 'held-draft');
              }
            }
            // Final FAQ recovery (2026-09-22 hardening): if draft-quality hold kept us on the
            // answering path but we still have nothing safe to send, try ONE forced FAQ reply
            // from approved evidence — same shape as ESCALATE→REPLY — before quieting.
            // Never asks account / never opens a teammate note.
            if (!__reply && (faqHoldMustNotEscalate('general-faq', ((__presend.result && __presend.result.hardFails) || []), text, conversationId) ||
                (__holdAsk !== String(text || '').trim() && faqHoldMustNotEscalate('general-faq', ((__presend.result && __presend.result.hardFails) || []), __holdAsk, conversationId))) &&
                officialFaqBlock && __episode.canRegenerate()) {
              try {
                __episode.chargeRegeneration();
                console.log('PRESEND_HOLD_FAQ_FORCE_REPLY', conversationId);
                const __force = await lunaModel.create(openai, {
                  model: control.getModel(),
                  ...modelConfig.answerParams({
                    tools: false, purpose: 'reply.presend-faq-force',
                    conversationId, episode: __episode, phase: 'regeneration',
                  }),
                  conversationId,
                  episode: __episode,
                  messages: [
                    { role: 'system', content: control.getPrompt() },
                    {
                      role: 'user',
                      content:
                        userMsg +
                        '\n\nHARD OVERRIDE: Answer this general FAQ from OFFICIAL FAQ CONTEXT only. ACTION: REPLY. Cover every asked part. No account/email ask. No teammate handoff. No unsupported figures: if the OFFICIAL FAQ CONTEXT states no figure or timeframe for a part, say naturally that there is no fixed figure or answer you can confirm for that part (for example "I can\'t confirm a fixed timeframe for that"), never mentioning the official information, the FAQ or any source (NOT_PUBLISHED_ANSWER_V1, SOURCE_TALK_FREE_V1). Only state a timeframe for exactly what the context says it applies to (for example, a delivery time AFTER approval is not the approval or processing time).' +
                        (__holdAsk !== String(text || '').trim() ? '\nThe client\'s latest message is a nudge; the question still waiting for an answer is: ' + __holdAsk.slice(0, 600) : '') +
                        __imageOverrideClause(),
                    },
                  ],
                });
                const __fr = parseAction(((((__force.choices || [])[0] || {}).message || {}).content) || '');
                if (__fr.action === 'REPLY' && __fr.body) {
                  const __candidate2 = postProcessModelReply(__fr.body, conversationId);
                  // Re-validate; only send if the gate would accept (or soft-only fails).
                  try {
                    const __re = await __statePresend.gate({
                      conversationId, draft: __candidate2, latestUser, clientName,
                      history: parts, knowledge: __presendKnowledge, scopeDecline: __isScopeDecline,
                    });
                    if (__re.send && __re.body) {
                      __reply = __re.body;
                      console.log('PRESEND_HOLD_FAQ_FORCE_REPLY_OK', conversationId);
                    } else {
                      console.log('PRESEND_HOLD_FAQ_FORCE_REPLY_HELD', conversationId, __re.reason || '');
                      // PARTIAL_ANSWER_COMPLETE_V1: held only for a missed part -> keep what it answered.
                      let __fails = (__re.result && __re.result.hardFails) || [];
                      let __base = __candidate2;
                      // FORCE_REPLY_PROMISE_STRIP_V1 (2026-09-24, real-model corpus "can i get refund if i didnt trade
                      // yet"): the forced general answer was correct except for one "I've forwarded your request"
                      // sentence (no note is written on this path), so the whole answer was dropped and the client
                      // got silence. Same recovery as PROMISE_STRIP_V1 at the send boundary: drop only the promise
                      // sentence and re-validate.
                      if (__fails.length && __fails.some((f) => f && f.code === 'UNSUPPORTED_PROMISE') &&
                          __fails.every((f) => f && (f.code === 'UNSUPPORTED_PROMISE' || f.code === 'MISSED_QUESTION'))) {
                        try {
                          const __ps = regenModule().stripPromiseSentences(__candidate2, __fails);
                          if (__ps && __ps !== __candidate2) {
                            const __g3 = await __statePresend.gate({ conversationId, draft: __ps, latestUser, clientName,
                              history: parts, knowledge: __presendKnowledge, scopeDecline: __isScopeDecline });
                            if (__g3.send && __g3.body) { __reply = __g3.body; console.log('PRESEND_HOLD_FAQ_FORCE_REPLY_PROMISE_STRIPPED', conversationId); }
                            else { __base = __ps; __fails = (__g3.result && __g3.result.hardFails) || []; }
                          }
                        } catch (e) { console.error('PRESEND_HOLD_FAQ_FORCE_REPLY_STRIP_ERR', conversationId, 'class=' + (e && e.name || 'Error')); }
                      }
                      if (!__reply && __fails.length && __fails.every((f) => f && f.code === 'MISSED_QUESTION')) {
                        const __c = await __completePartialAnswer(__base, __fails, 'force-reply');
                        // Equality with the base draft is not a reason to drop the reply.
                        // A gated unchanged body sends; an empty repair goes to fallback.
                        const __rd = decideRepairedDraft(__c, __base, { revalidated: !!__c, staleCleared: !!__c && __c === __base });
                        if (__rd.send && __rd.body) {
                          __reply = __rd.body;
                          console.log('PARTIAL_ANSWER force-reply accepted', conversationId, __rd.reason);
                        } else {
                          console.log('PARTIAL_ANSWER force-reply needs fallback', conversationId, __rd.reason);
                        }
                      }
                    }
                  } catch (e) {
                    console.error('PRESEND_HOLD_FAQ_FORCE_REPLY_GATE_ERR', conversationId, 'class=' + (e && e.name || 'Error'));
                  }
                }
              } catch (e) {
                console.error('PRESEND_HOLD_FAQ_FORCE_REPLY_FAILED', conversationId, 'class=' + (e && e.name || 'Error'));
              }
            }
          }
          /* NOT_PUBLISHED_ANSWER_V1: last resort for a general TIME question ("will my payout be processed within
           * 72 hours?") whose every generated draft was held for an unsupported promise / timeframe: say honestly
           * that no timeframe is published instead of going silent. Gated like any reply. */
          if (!__reply && __kind === 'general-faq') {
            try {
              const __TIME_RE = /\bhow\s+(?:long|soon|quickly|fast)\b|\bwhen\s+(?:will|would|do|does|can|is)\b|\bhow\s+many\s+(?:business\s+|working\s+)?(?:hours?|days?|minutes?|weeks?)\b|\b(?:processing|turnaround|approval|review)\s+(?:time|timeframe|period)\b|\bwithin\s+\d+\s*(?:business\s+|working\s+)?(?:hours?|hrs?|days?|minutes?|weeks?)\b/i;
              const __openUnits = unresolvedSupportQuestions(parts);
              const __timeUnit = __openUnits.find((q) => __TIME_RE.test(q)) || '';
              let __cryptoReceipt = false;
              try {
                const __macT = require('./statePresend/multiAskCompleteness');
                __cryptoReceipt = !!(__timeUnit && (__macT.timingFacets(__timeUnit).has('crypto') || /\b(?:crypto|wallet)\b/i.test(__timeUnit)));
              } catch (_) { __cryptoReceipt = false; }
              const __hc = ((__presend.result && __presend.result.hardFails) || []).map((f) => (f && f.code) || '');
              // Judge the unresolved unit, not only the latest message. A crypto-receipt
              // question is answered by the arrival fallback below, not by "not published".
              if (__timeUnit && !__cryptoReceipt && __hc.length && __hc.every((c) => c === 'UNSUPPORTED_PROMISE' || c === 'UNSUPPORTED_NUMBER' || c === 'MISSED_QUESTION')) {
                const __subject = (__timeUnit.match(/\b(payouts?|withdrawals?|reset|kyc|verification|refund|phase\s*2|live\s+account|funded\s+account|account)\b/i) || [])[1];
                const __np = 'A fixed timeframe for ' + (__subject ? 'the ' + __subject.toLowerCase() + ' ' : 'this ') +
                  (/payout|withdrawal/i.test(__subject || '') ? 'processing ' : '') + 'isn\u2019t published, so I can\u2019t confirm one.'; /* SOURCE_TALK_FREE_V1: no "official information" source-talk */
                const __g = await __statePresend.gate({ conversationId, draft: __np, latestUser, clientName, history: parts, knowledge: __presendKnowledge, scopeDecline: __isScopeDecline });
                if (__g.send && __g.body) { __reply = __g.body; console.log('NOT_PUBLISHED_ANSWER last-resort', conversationId); }
                else console.log('NOT_PUBLISHED_ANSWER last-resort held', conversationId, __g.reason || '');
              }
            } catch (e) { console.error('NOT_PUBLISHED_ANSWER_ERR', conversationId, 'class=' + (e && e.name || 'Error')); }
          }
          if (!__reply && __kind === 'general-faq') {
            try {
              let __openFb = unresolvedSupportQuestions(parts);
              try {
                const __macFb = require('./statePresend/multiAskCompleteness');
                if (!__openFb.length && (__macFb.isRecognizedSupportTimingAsk(text) || __macFb.isProcessEscalationRequest(text))) __openFb = [String(text || '').trim()];
              } catch (_) { /* keep the extracted set */ }
              if (__openFb.length) {
                const __fb = missedQuestionFallbackBody(__openFb);
                const __normFb = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
                const __usedFb = (__priorBot || []).some((r) => __normFb(r) === __normFb(__fb));
                if (__fb && !__usedFb) {
                  const __gfb = await __statePresend.gate({ conversationId, draft: __fb, latestUser, clientName, history: parts, knowledge: __presendKnowledge, scopeDecline: __isScopeDecline });
                  if (__gfb.send && __gfb.body) { __reply = __gfb.body; console.log('MISSED_QUESTION_FALLBACK', conversationId); }
                  else console.log('MISSED_QUESTION_FALLBACK held', conversationId, __gfb.reason || '');
                } else if (__usedFb) {
                  console.log('MISSED_QUESTION_FALLBACK duplicate skipped', conversationId);
                }
              }
            } catch (e) { console.error('MISSED_QUESTION_FALLBACK_ERR', conversationId, 'class=' + (e && e.name || 'Error')); }
          }
          if (__reply) __reply = applyGeneralAccountAskGuardSync(conversationId, parts, text, __reply, 'hold'); /* GENERAL_ACCOUNT_ASK_GUARD_V1 */
          // HELD_SEND_SAME_EVIDENCE_V1 (2026-09-25, live 215476101110604): the held-path reply was validated against
          // __presendKnowledge, but was posted without it, so the final boundary re-retrieved from the raw latest
          // message ("so i can risk as much as my margin") without the inherited product, judged the correct
          // Lite 2-Step "4% daily loss" contradicted and suppressed the reply (silence). Pass the same evidence;
          // presendOk stays unset, so every mandatory check still re-runs on the exact bytes.
          if (__reply) await postClientCommentOnce(conversationId, __reply, latestUser, clientName, { intent: __decision, knowledge: __presendKnowledge, comparison: __comparison });
          else {
            let __openQuiet = [];
            let __priorAsk = false;
            let __needsReply = false;
            try {
              __openQuiet = unresolvedSupportQuestions(parts);
              const __macQ = require('./statePresend/multiAskCompleteness');
              const __csQ = require('./statePresend/conversationState');
              const __msgsQ = __csQ.normalizeMessages(parts, { botName: 'arsal', botAdminIds: [ARSAL_ID, ELITE_AI_ID] });
              __priorAsk = __msgsQ.some((m) => m && m.role === 'client' && (__macQ.isTimingQuestion(m.text) || __macQ.isRecognizedSupportTimingAsk(m.text) || __macQ.isProcessEscalationRequest(m.text)));
              __needsReply = __macQ.isRecognizedSupportTimingAsk(text) || __macQ.isProcessEscalationRequest(text) || __macQ.isTimingQuestion(text);
            } catch (_) { __openQuiet = []; }
            const __quietReason = quietHoldReason({
              unresolvedCount: __openQuiet.length || (__needsReply ? 1 : 0),
              fallbackFailed: __openQuiet.length > 0 || __needsReply,
              alreadyAnswered: !__openQuiet.length && !__needsReply && __priorAsk,
              noReplyNeeded: !__openQuiet.length && !__needsReply && !__priorAsk,
            });
            console.log('PRESEND_HOLD quiet', conversationId, __quietReason);
          }
          return res.sendStatus(200);
        }
        escState = syncEscalateTeammateFirstState(conversationId, full);
        if (escState.escalateAwaitingFirstTeammate) {
          const awaitingAttempt = evaluateAwaitingEscalationAttempt(conversationId, text, escState);
          escState = awaitingAttempt.state;
          if (awaitingAttempt.decision.action === 'SKIP') {
            console.log(awaitingAttempt.decision.log, conversationId);
            return res.sendStatus(200);
          }
          if (awaitingAttempt.decision.action === 'STATUS_ONLY') {
            await postEscalateHoldingStatus(
              conversationId,
              text,
              latestUser,
              clientName,
              escState,
              'ESCALATE holding after missed-escalation presend'
            );
            return res.sendStatus(200);
          }
        }
        let idsHeld = collectEscalateIds(full, bits, text) || {};
        // Reaching 'escalate' now means the backend team has to open this client's account, so
        // the note needs the account before it is worth writing. Same collect-first gate as the
        // normal ESCALATE path: when it is not ready it has asked the client and we post no note.
        // Ids can still be empty afterwards if the client declined or the ask limit was reached -
        // then "Not provided" is the honest value, not a shortcut. A plain "get me a human"
        // request ('human-request') is not account work and keeps its own path.
        // Also gate a "get me a human" request when the problem behind it IS account work:
        // "my payout failed, get me a human" is gated account work under the collect-first rule,
        // and the normal ESCALATE path already asks for the account in that case. Without this,
        // the presend path could still write a note reading "Account: Not provided".
        if (__kind === 'escalate' || presendNeedsBackendLook(__problem)) {
          /* LUNA_IMAGE_UNDERSTAND_V1:BEGIN:skip-identity-image */
          let __skipIdForImage = false;
          try {
            __skipIdForImage =
              typeof __imageAskGuard.shouldSkipIdentityAskForImage === 'function' &&
              __imageAskGuard.shouldSkipIdentityAskForImage(conversationId, text || __problem);
          } catch (_) { __skipIdForImage = false; }
          if (__skipIdForImage) {
            console.log('IDENTITY_BEFORE_ESCALATE skipped image-answerable', conversationId);
            console.log('PRESEND_HOLD_IMAGE_NO_ACCOUNT_ASK', conversationId);
            try { __imageAskGuard.noteIdentityAskForImage(conversationId); } catch (_) {}
            // Last-resort client reply: never ask for account number to explain a screenshot.
            let __imgReply = '';
            try {
              const __md = String(__modelDraft || body || '').trim();
              const __bad =
                !__md ||
                publicRestatementGuard.assess(__md, text || __problem).fail ||
                (typeof __imageAskGuard.isImageRefusal === 'function' && __imageAskGuard.isImageRefusal(__md)) ||
                /please share your account number|account number so i can forward/i.test(__md) ||
                /[[SCOPE_DECLINE]]|outside what I can help|not something I can help with/i.test(__md);
              if (!__bad && __md.length > 40) __imgReply = __md;
            } catch (_) {}
            if (!__imgReply) {
              __imgReply = 'I can see the screenshot you sent. Tell me which part you want explained — for example a price, a selected rule, or an error message — and I will explain it from the image.';
            }
            try { __imgReply = __imageAskGuard.hookD(conversationId, __imgReply); } catch (_) {}
            await postClientCommentOnce(conversationId, __imgReply, latestUser, clientName);
            return res.sendStatus(200);
          }
          /* LUNA_IMAGE_UNDERSTAND_V1:END:skip-identity-image */
          const identityGate = await ensureIdentityBeforeAccountEscalate({
          prefix: (typeof __mixedGeneralPrefix === 'function') ? __mixedGeneralPrefix : undefined, /* MIXED_GENERAL_WITH_ACCOUNT_V1 */
            conversationId,
            full,
            bits,
            text: __problem,
            kind: 'ACCOUNT',
            latestUser,
            clientName,
            modelBody: __problem,
            modelClient: '',
          });
          full = identityGate.full || full;
          idsHeld = identityGate.ids || idsHeld;
          if (!identityGate.ready) return res.sendStatus(200);
        }
        /* MICHAN_TEAMMATE_HANDOFF_V1:BEGIN:presendMissedEscalateBlock */
        {
          const escBlockHeld = teammateHandoffGates.shouldBlockEscalateForTeammateHandoff(parts, full, {
            arsalId: ARSAL_ID,
            eliteAiId: ELITE_AI_ID,
            jerryId: JERRY_ID,
            hasArsalEscalateNote,
            latestText: text,
          });
        /* RISK_NOTE_ANTISPAM_V1 */
        {
          const __stRisk = (typeof getConvState === 'function') ? getConvState(conversationId).state : {};
          const __riskBlk = shouldBlockRiskNoteSpamNow(full, parts, __stRisk);
          if (__riskBlk && __riskBlk.block) {
            console.log('RISK_NOTE_ANTISPAM block escalate', conversationId, __riskBlk.reason);
            escBlockHeld.block = true;
            escBlockHeld.reason = __riskBlk.reason;
          }
        }

          // DELEGATED_ESCALATE_V1 (held-draft path; real-model replay of live 215476084572778): a teammate
          // delegated this client and the question is general (not account work). Writing a note is not
          // allowed for a general question and staying silent strands the client, so answer with the
          // model's own client text (handoff claims removed), validated by presend like any reply. A
          // result that fails only MISSED_QUESTION is a correct partial answer and is still sent.
          if (escBlockHeld.block && continuousOwnershipOf(parts).active && __decision.kind === 'general-faq' &&
              (escBlockHeld.reason === 'teammate_assignee_already_replied' || escBlockHeld.reason === 'teammate_directed_external_support') &&
              !isClearlyAccountSpecificIssue(text)) {
            const __delegatedText = handoffClaimGate.withoutFalseHandoffDenial(
              postProcessModelReply(stripHandoffClaims(parsed.client || ''), conversationId),
              true
            );
            if (__delegatedText) {
              try {
                const __dg = await __statePresend.gate({ conversationId, draft: __delegatedText, latestUser, clientName,
                  history: parts, knowledge: __presendKnowledge, scopeDecline: __isScopeDecline });
                const __dFails = ((__dg.result && __dg.result.hardFails) || []).map((f) => f && f.code);
                const __dBody = (__dg.send && __dg.body) ? __dg.body
                  : (__dFails.length && __dFails.every((c) => c === 'MISSED_QUESTION') ? __delegatedText : '');
                if (__dBody) {
                  await postClientCommentOnce(conversationId, __dBody, latestUser, clientName, { intent: __decision, knowledge: __presendKnowledge, comparison: __comparison }); /* HELD_SEND_SAME_EVIDENCE_V1 */
                  console.log('DELEGATED_GENERAL_ANSWER_SENT', conversationId, __dg.send ? 'validated' : 'partial');
                  return res.sendStatus(200);
                }
                console.log('DELEGATED_GENERAL_ANSWER_HELD', conversationId, __dFails.join(','));
              } catch (e) { console.error('DELEGATED_GENERAL_ANSWER_ERR', conversationId, 'class=' + (e && e.name || 'Error')); }
            }
          }
          if (escBlockHeld.block) {
            console.log('SKIP escalate teammate-handoff (presend-missed)', escBlockHeld.reason, conversationId);
            return res.sendStatus(200);
          }
        }
        /* MICHAN_TEAMMATE_HANDOFF_V1:END:presendMissedEscalateBlock */
        /* ESCALATION_DEDUPE_V1:presend-missed-escalation */
        {
          const __dup = await escalationDuplicateCheck(conversationId, __problem);
          if (__dup.full) full = __dup.full;
          if (__dup.duplicate) {
            console.log('ESCALATE_DUPLICATE_BLOCKED', 'presend-missed-escalation', conversationId, __dup.reason);
            if (!/no_new_client_message/.test(__dup.reason)) {
              await postEscalateHoldingStatus(conversationId, text, latestUser, clientName, getConvState(conversationId).state,
                'ESCALATE status-only (duplicate blocked, presend-missed-escalation)');
            }
            return res.sendStatus(200);
          }
        }
        {
          const __riskDiv = await divertIfRiskOwnedNoPublic(conversationId, full);
          if (__riskDiv.diverted) {
            console.log('ESCALATE suppressed public — Risk-owned', conversationId);
            return res.sendStatus(200);
          }
          full = __riskDiv.full || full;
        }
        const existingAssignee =
          full.admin_assignee_id != null ? String(full.admin_assignee_id) : '';
        const built = await buildEscalateNoteAndAssignee({
          problem: __problem,
          actionNeeded: presendEscalateActionNeeded(text, __presend && __presend.reason, {
            problem: __problem,
            account: idsHeld.account,
          }),
          account: idsHeld.account || '',
          email: idsHeld.email || '',
          preferAssigneeId:
            existingAssignee &&
            existingAssignee !== '0' &&
            existingAssignee !== ARSAL_ID &&
            existingAssignee !== ELITE_AI_ID
              ? existingAssignee
              : '',
          conversation: full,
        });
        if (built && built.deferred) {
          const gate = deferredIdentityAsk(full, idsHeld, 'ACCOUNT', { noteDeferredReason: built.reason });
          if (gate.ask) {
            await postClientCommentOnce(conversationId, gate.ask, latestUser, clientName);
            console.log('ESCALATE_NOTE_DEFERRED asked account (presend-missed)', conversationId);
          } else if (gate.skipNonAccount) {
            await completeNonAccountEscalation({
              conversationId,
              full,
              latestUser,
              clientName,
              problem: __problem,
              email: idsHeld && idsHeld.email,
              preferAssigneeId: existingAssignee && existingAssignee !== '0' && existingAssignee !== ARSAL_ID && existingAssignee !== ELITE_AI_ID ? existingAssignee : '',
              where: 'presend-missed',
            });
          } else {
            console.log('ESCALATE_NOTE_DEFERRED wait (presend-missed)', conversationId, gate.reason);
          }
          return res.sendStatus(200);
        }
        {
          const __freshEsc = await blockStaleConsequentialEscalation(conversationId, latestUser, text);
          if (__freshEsc.fresh) full = __freshEsc.fresh;
          if (__freshEsc.block || teammateHandoffGates.escalationNoteContradictsResolution(text, built.html)) {
            if (!__freshEsc.block) console.log('ESCALATE_FRESHNESS_BLOCK', conversationId, 'contradictory_note');
            return res.sendStatus(200);
          }
        }
        const noteRes = await postReply(conversationId, 'note', built.html);
        if (noteRes.ok) {
          let __handoffAssignOkHold = false;
          if (built.assigneeId) {
            const asgRes = await assignToTeammateIfNeeded(full, conversationId, built.assigneeId);
            __handoffAssignOkHold = !!(asgRes && asgRes.ok);
            if (!asgRes.ok) console.error('ESCALATE_ASSIGN_FAILED', conversationId, asgRes.status);
          }
          finishHandoffAction(conversationId, true, __handoffAssignOkHold);
          // Mark awaiting teammate like normal escalate path
          recordEscalationState(conversationId, __problem || text, built.problemText, full); /* ESCALATION_DEDUPE_V1 */
          console.log('ESCALATED after MISSED_ESCALATION presend hold', conversationId, built.assigneeId);
          let clientMsg = postProcessModelReply(
            escalationClientAck({
              noteOk: true,
              assignOk: __handoffAssignOkHold,
              where: 'presend-missed',
              preferred: __handoffAssignOkHold ? ACCOUNT_HANDOFF_ACK : '',
            }),
            conversationId
          );
          clientMsg = normalizeEscalateClientHandoff(clientMsg, text);
          { const __mp = await __mixedGeneralPrefix(); if (__mp) clientMsg = __mp.trim() + '\n\n' + clientMsg; } /* MIXED_GENERAL_WITH_ACCOUNT_V1 */
          await postClientCommentOnce(conversationId, clientMsg, latestUser, clientName);
        } else {
          console.error('ESCALATE_NOTE_FAILED after MISSED_ESCALATION — no public handoff claim', conversationId, noteRes.status);
          finishHandoffAction(conversationId, false, false);
          const safeFailHold = postProcessModelReply(
            escalationClientAck({ noteOk: false, assignOk: false, where: 'presend-missed' }),
            conversationId
          );
          if (String(safeFailHold || '').trim() && !handoffClaimGate.hasHandoffClaim(safeFailHold)) {
            await postClientCommentOnce(conversationId, safeFailHold, latestUser, clientName);
          }
        }
      } catch (e) {
        console.error('PRESEND_MISSED_ESCALATION_ESCALATE_ERR', 'class=' + (e && e.name || 'Error'));
      }
      return res.sendStatus(200);
    }
    if (__presend && !__presend.send) {
      const __r = String((__presend && __presend.reason) || '');
      if (/unnecessary-clarify-held/i.test(__r)) {
        console.log('PRESEND_HOLD quiet (unnecessary clarification; knowledge should answer)', conversationId);
      } else if (/needs-escalate|missed-escalation|critical-unfixable|enforce-critical/i.test(__r)) {
        // already handled above when reason matched; otherwise quiet fail-closed
        console.log('PRESEND_HOLD quiet (fail-closed)', conversationId, __r);
      }
    }
    return res.sendStatus(200);
    } finally {
      try { require('./publicWriteBoundary').bindTurn(null); } catch (_) {}
      clientReplyInflight.delete(inflightKey);
      scheduleBurstRerun(inflightKey);
      /* LUNA_RESPONSES_V1: close the episode on EVERY exit path from the AI section (reply
       * sent, hold, escalate, early return or throw) and emit its LUNA_EPISODE summary. A
       * no-op when this event never opened one. */
      try { lunaEpisode.end(conversationId); } catch (_) {}
    }
  } catch (e) {
    console.error('WEBHOOK_ERR', 'class=' + (e && e.name || 'Error'));
    try { webhookFastAck.noteSwallowedError(e); } catch (_) {}
    return res.sendStatus(200);
  }
};
webhookFastAck.init({ rootDir: __dirname });
webhookFastAck.mountStatus(app);
app.post('/webhook', webhookSecurity.middleware(), (req, res) => webhookFastAck.acceptHttp(req, res, handleWebhook));

const AUTO_CLOSE_SILENCE_SEC = 10 * 60; // 10 minutes after last team public reply

function isRiskOwnedConversation(conversation) {
  return isRiskTeambox(conversation) || isRiskAssigned(conversation);
}

function riskActivelyHandlingParts(parts) {
  try {
    return teammateHandoffGates.isHumanTeammateActivelyHandling(parts, {
      arsalId: ARSAL_ID,
      eliteAiId: ELITE_AI_ID,
    });
  } catch (_) {
    return false;
  }
}

/** Block escalate/Risk note spam when Risk owns the ticket or is actively handling. */
function shouldBlockRiskNoteSpamNow(full, parts, escState) {
  const st = escState || {};
  const owned = isRiskOwnedConversation(full);
  const active = riskActivelyHandlingParts(parts);
  const gate = riskNoteGate.shouldBlockRiskOwnedNoteSpam({
    isRiskTeambox: isRiskTeambox(full),
    isRiskAssigned: isRiskAssigned(full),
    riskAwaitingTeam: !!st.riskAwaitingTeam,
    riskActivelyHandling: active,
  });
  if (gate.block) return gate;
  // Extra: Risk-owned + prior Risk note fingerprint still pending → block escalate note floods
  if (owned && st.riskAwaitingTeam) {
    return { block: true, reason: 'risk_awaiting_after_note' };
  }
  if (owned && active) {
    return { block: true, reason: 'risk_actively_handling' };
  }
  return { block: false, reason: '' };
}

function isRiskAssigned(conversation) {
  const admin = conversation && conversation.admin_assignee_id != null ? String(conversation.admin_assignee_id) : '0';
  if (admin === '0') return false;
  if (typeof RISK_TEAM_ADMIN_IDS !== 'undefined' && RISK_TEAM_ADMIN_IDS.has(admin)) return true;
  return admin === RISK_TEAM_ADMIN_ID;
}

/** True if conversation parts show assignment to Risk team/admin (covers assignee-field lag). */
function conversationAssignedToRiskInParts(conversation) {
  let parts = [];
  try {
    parts = typeof partsOf === 'function' ? partsOf(conversation) : [];
  } catch (_) {
    parts = (conversation && conversation.conversation_parts && conversation.conversation_parts.conversation_parts) || [];
  }
  for (const p of parts || []) {
    if (String(p.part_type || '') !== 'assignment') continue;
    const to = p.assigned_to || {};
    const toId = to.id != null ? String(to.id) : '';
    if (to.type === 'team' && toId === String(RISK_TEAM_ID)) return true;
    if (
      (to.type === 'admin' || to.type === 'bot') &&
      (toId === String(RISK_TEAM_ADMIN_ID) ||
        (typeof RISK_TEAM_ADMIN_IDS !== 'undefined' && RISK_TEAM_ADMIN_IDS.has(toId)))
    ) {
      return true;
    }
  }
  return false;
}

function isRiskOwnedOrAssignedInHistory(conversation) {
  return isRiskOwnedConversation(conversation) || conversationAssignedToRiskInParts(conversation);
}

/** P1: conversations whose public path is teambox note-only (Risk / Escalations). */
function isSilentTeamboxNoteDuty(conversation) {
  if (!conversation) return false;
  try {
    if (isEscalationsTeambox(conversation) || isRiskTeambox(conversation)) return true;
    if (isRiskAssigned(conversation) || conversationAssignedToRiskInParts(conversation)) return true;
  } catch (_) {}
  return false;
}

function teamboxNoteOwnershipExemptReason(reason) {
  return reason === 'human-assignee' || reason === 'human-history-owned' || reason === 'human-outbound-source';
}

/**
 * Re-fetch and, if Risk owns the ticket, run note-only path (no public client reply).
 * Closes the race where Intercom auto-assigns to Risk while Luna is still drafting.
 */
async function divertIfRiskOwnedNoPublic(conversationId, full) {
  let fresh = full;
  try {
    fresh = (await fetchConversation(conversationId)) || full;
  } catch (_) {}
  if (!isRiskOwnedOrAssignedInHistory(fresh)) {
    return { diverted: false, full: fresh || full };
  }
  console.log('RISK_OWNED divert note-only (no public reply)', conversationId);
  try {
    await handleRiskSilentNoteOnly(conversationId, fresh || full);
  } catch (e) {
    console.error('RISK_OWNED divert failed', conversationId, 'class=' + (e && e.name || 'Error'));
  }
  return { diverted: true, full: fresh || full };
}


function isAutoCloseExcluded(conversation) {
  // Risk teambox OR Risk assignee; Escalations teambox; Jerry assignee
  if (isRiskTeambox(conversation) || isRiskAssigned(conversation)) return true;
  if (isEscalationsTeambox(conversation)) return true;
  if (isJerryAssigned(conversation)) return true;
  return false;
}

function lastTeamSidePublicReplyUnix(parts) {
  // Any admin/bot public comment counts as "team replied" (includes Arsal / Elite AI / humans).
  let t = 0;
  for (const p of parts || []) {
    const a = (p && p.author) || {};
    if (String(p.part_type || '') !== 'comment') continue;
    if (a.type !== 'admin' && a.type !== 'bot') continue;
    const body = stripHtml(p.body || '');
    if (!body) continue;
    const at = Number(p.created_at || 0);
    if (at > t) t = at;
  }
  return t;
}

function lastClientPublicReplyUnix(parts, conversation) {
  let t = 0;
  const src = (conversation && conversation.source) || {};
  if (src.body && src.author && (src.author.type === 'user' || src.author.type === 'lead')) {
    const at = Number(src.created_at || conversation.created_at || 0);
    if (at > t) t = at;
  }
  for (const p of parts || []) {
    const a = (p && p.author) || {};
    if (a.type !== 'user' && a.type !== 'lead') continue;
    if (String(p.part_type || '') === 'note') continue;
    const body = stripHtml(p.body || '');
    const hasImg = typeof collectImageAttachments === 'function' && collectImageAttachments(p).length > 0;
    if (!body && !hasImg) continue;
    const at = Number(p.created_at || 0);
    if (at > t) t = at;
  }
  return t;
}

function shouldAutoCloseConversation(full) {
  if (!full || isAutoCloseExcluded(full)) {
    return { close: false, reason: 'excluded' };
  }
  try {
    if (control.isPaused()) return { close: false, reason: 'paused' };
    const cid = full.id != null ? full.id : full.conversation_id;
    const owned = ownershipBoundary.evaluate(full, authoritativeConversationParts(full), ownershipOptions(cid));
    if (owned.blocked) return { close: false, reason: owned.reason };
  } catch (_) { return { close: false, reason: 'ownership-check-error' }; }
  /* REOPEN_HUMAN_OWNERSHIP_V1 (2026-10-12, ticket 215476349592456): Luna (seat 10118526) must
   * not auto-close a conversation a human teammate owns or is handling: human assignee, a human
   * close then customer reopen / human team routing, a recent human public reply, or an open
   * escalation still waiting for the first teammate reply. */
  try {
    const __o = { arsalId: ARSAL_ID, eliteAiId: ELITE_AI_ID };
    const __cid0 = full.id != null ? full.id : full.conversation_id;
    // aiOff (STOP) means Luna takes no action at all on this ticket, including the close timer.
    if (__cid0 && control.isAiOff && control.isAiOff(__cid0)) return { close: false, reason: 'ai_off' };
    const __p = partsOf(full);
    if (teammateHandoffGates.isAssignedToHumanTeammate(full, __o)) return { close: false, reason: 'human_assignee' };
    // Team inboxes (Payouts 9629780, 11195250, ...) are human queues: never auto-close them.
    if (full.team_assignee_id != null && String(full.team_assignee_id) !== '0' && String(full.team_assignee_id) !== '') {
      return { close: false, reason: 'team_assigned' };
    }
    if (teammateHandoffGates.humanReopenOwnership && teammateHandoffGates.humanReopenOwnership(full, __p, __o).owned) {
      return { close: false, reason: 'human_reopen_owned' };
    }
    if (teammateHandoffGates.humanTeammateAlreadyRepliedPublic(__p, __o) &&
        teammateHandoffGates.isHumanTeammateActivelyHandling(__p, __o)) {
      return { close: false, reason: 'human_actively_handling' };
    }
    const __cid = full.id != null ? full.id : full.conversation_id;
    if (__cid && (getConvState(__cid).state || {}).escalateAwaitingFirstTeammate) {
      return { close: false, reason: 'escalation_open' };
    }
  } catch (_) {
    return { close: false, reason: 'ownership_check_error' };
  }
  // An unresolved partnership request stays open until a human teammate replies in public.
  try {
    const cid = full.id != null ? full.id : full.conversation_id;
    if (cid) {
      const st = getConvState(cid).state || {};
      if (st.partnershipAwaitingTeammate || st.partnershipRoutePending) {
        const human = teammateHandoffGates.humanTeammateAlreadyRepliedPublic(partsOf(full), {
          arsalId: ARSAL_ID,
          eliteAiId: ELITE_AI_ID,
        });
        if (!human) return { close: false, reason: 'partnership_unresolved' };
      }
    }
  } catch (_) {}
  // Only open tickets
  if (full.open === false || String(full.state || '').toLowerCase() === 'closed') {
    return { close: false, reason: 'already_closed' };
  }
  const parts = partsOf(full);
  const lastTeamAt = lastTeamSidePublicReplyUnix(parts);
  if (!lastTeamAt) return { close: false, reason: 'no_team_reply' };
  // A holding dead-end ("I still need the trading account number… I have not passed it on")
  // is not a finished answer. Leave the ticket open.
  let lastTeamBody = '';
  for (const p of parts) {
    const a = (p && p.author) || {};
    if (String(p.part_type || '') !== 'comment') continue;
    if (a.type !== 'admin' && a.type !== 'bot') continue;
    const body = stripHtml(p.body || '').trim();
    if (!body) continue;
    if (Number(p.created_at || 0) === lastTeamAt) lastTeamBody = body;
  }
  if (lastTeamBody === ACCOUNT_HOLDING_TEXT) {
    return { close: false, reason: 'account_hold_unresolved', lastTeamAt };
  }
  const lastClientAt = lastClientPublicReplyUnix(parts, full);
  if (lastClientAt >= lastTeamAt) {
    return { close: false, reason: 'client_replied_after_team', lastTeamAt, lastClientAt };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const silence = nowSec - lastTeamAt;
  if (silence < AUTO_CLOSE_SILENCE_SEC) {
    return { close: false, reason: 'under_10m', silence, lastTeamAt };
  }
  return { close: true, reason: 'silent_10m', silence, lastTeamAt, lastClientAt };
}

async function handleAutoCloseIfDue(conversationId, full) {
  const check = shouldAutoCloseConversation(full);
  if (!check.close) return check;
  const { all, state, id } = getConvState(conversationId);
  if (state.autoClosedAt && state.autoCloseTeamReplyAt === check.lastTeamAt) {
    return { close: false, reason: 'already_auto_closed_sig' };
  }
  const sent = await closeConversation(conversationId, { automatic: true });
  if (!sent || !sent.ok || sent.skipped) return { close: false, reason: sent && sent.reason || 'close-not-confirmed' };
  const finalCheck = sent.autoCloseCheck || check;
  const current = getConvState(conversationId);
  current.state.autoClosedAt = Date.now();
  current.state.autoCloseTeamReplyAt = finalCheck.lastTeamAt;
  current.state.autoCloseSilence = finalCheck.silence;
  current.all[current.id] = current.state; saveTicketState(current.all);
  console.log('AUTO_CLOSE', conversationId, 'silence', finalCheck.silence, 'lastTeamAt', finalCheck.lastTeamAt);
  return { close: true, ...finalCheck };
}

async function searchOpenConversationsAutoClose() {
  const out = [];
  let startingAfter = null;
  for (let page = 0; page < 15; page++) {
    const body = {
      query: {
        operator: 'AND',
        value: [{ field: 'open', operator: '=', value: true }],
      },
      pagination: { per_page: 50 },
    };
    if (startingAfter) body.pagination.starting_after = startingAfter;
    const r = await axios.post('https://api.intercom.io/conversations/search', body, {
      headers: icHeaders(),
      timeout: IC_TIMEOUT_MS,
      validateStatus: () => true,
    });
    if (r.status >= 400) {
      console.log('AUTO_CLOSE_SEARCH_FAIL', r.status);
      break;
    }
    const batch = (r.data && r.data.conversations) || [];
    out.push(...batch);
    const next = r.data && r.data.pages && r.data.pages.next && r.data.pages.next.starting_after;
    if (!next || !batch.length) break;
    startingAfter = next;
  }
  return out;
}

let autoClosePollRunning = false;
let deferPollRunning = false;

async function pollDeferredRelatedReplies() {
  if (deferPollRunning) return;
  deferPollRunning = true;
  try {
    const all = loadTicketState();
    const now = Math.floor(Date.now() / 1000);
    for (const [cid, state] of Object.entries(all || {})) {
      const def = state && state.deferredRelatedReply;
      if (!def || !def.at) continue;
      if (now - Number(def.at) < 10 * 60) continue;
      try {
        const full = await fetchConversation(cid);
        if (!full) continue;
        syncEscalateTeammateFirstState(cid, full);
        const parts = partsOf(full);
        const userAt = Number(def.at);
        let teammateAfter = false;
        let arsalAfter = false;
        for (const part of parts) {
          const at = Number(part.created_at || 0);
          if (at <= userAt) continue;
          if (isHumanTeammatePublicReply(part)) teammateAfter = true;
          const a = part.author || {};
          if (String(a.id || '') === ARSAL_ID && String(part.part_type || '') === 'comment' && stripHtml(part.body || '')) {
            arsalAfter = true;
          }
        }
        if (teammateAfter || arsalAfter) {
          state.deferredRelatedReply = null;
          const cur = loadTicketState();
          cur[cid] = { ...(cur[cid] || {}), ...state };
          saveTicketState(cur);
          continue;
        }
        // Still unanswered , post a short consistent assist nudge via AI would be heavy;
        // clear defer and let next client webhook answer, OR post status that team was given time.
        // Prefer: clear defer flag so a synthetic wake isn't needed , store allowBotRelatedAnswer
        state.deferredRelatedReply = null;
        state.allowBotRelatedAnswerUntil = now + 30 * 60;
        const cur = loadTicketState();
        cur[cid] = { ...(cur[cid] || {}), ...state };
        saveTicketState(cur);
        console.log('ESCALATE defer matured , allow bot related answer', cid);
      } catch (e) {
        console.error('DEFER_POLL_ITEM', cid, 'class=' + (e && e.name || 'Error'));
      }
    }
  } catch (e) {
    console.error('DEFER_POLL_ERR', 'class=' + (e && e.name || 'Error'));
  } finally {
    deferPollRunning = false;
  }
}

async function pollAutoCloseSilentTickets() {
  if (autoClosePollRunning) return;
  if (control.isPaused && control.isPaused()) return;
  autoClosePollRunning = true;
  try {
    let list = [];
    try {
      list = await searchOpenConversationsAutoClose();
    } catch (e) {
      console.error('AUTO_CLOSE_SEARCH_ERR', 'class=' + (e && e.name || 'Error'));
      return;
    }
    console.log('AUTO_CLOSE_POLL open', list.length);
    let closed = 0;
    for (const c of list) {
      const id = c && c.id;
      if (!id) continue;
      try {
        // Cheap exclude from search hit fields when present
        const team = c.team_assignee_id != null ? String(c.team_assignee_id) : '0';
        const admin = c.admin_assignee_id != null ? String(c.admin_assignee_id) : '0';
        if (team === ESCALATIONS_TEAM_ID || team === RISK_TEAM_ID) continue;
        if (admin === JERRY_ID || admin === RISK_TEAM_ADMIN_ID) continue;
        // REOPEN_HUMAN_OWNERSHIP_V1: decide on a fresh conversation only (fail closed on lookup error).
        const full = await fetchConversation(id);
        if (!full) { console.log('AUTO_CLOSE_SKIP refetch-failed', id); continue; }
        const res = await handleAutoCloseIfDue(String(id), full);
        if (res && res.close) closed++;
      } catch (e) {
        console.error('AUTO_CLOSE_ITEM_ERR', id, 'class=' + (e && e.name || 'Error'));
      }
    }
    if (closed) console.log('AUTO_CLOSE_POLL closed', closed);
  } finally {
    autoClosePollRunning = false;
  }
}

const TEAMBOX_POLL_MS = 60 * 1000; // wake Escalations/Risk note gates after 15m without a new client webhook

async function searchOpenTeamConversations(teamId) {
  const out = [];
  let startingAfter = null;
  for (let page = 0; page < 10; page++) {
    const body = {
      query: {
        operator: 'AND',
        value: [
          { field: 'team_assignee_id', operator: '=', value: Number(teamId) },
          { field: 'open', operator: '=', value: true },
        ],
      },
      pagination: { per_page: 50 },
    };
    if (startingAfter) body.pagination.starting_after = startingAfter;
    const r = await axios.post('https://api.intercom.io/conversations/search', body, {
      headers: icHeaders(),
      timeout: IC_TIMEOUT_MS,
      validateStatus: () => true,
    });
    if (r.status >= 400) {
      console.log('TEAMBOX_SEARCH_FAIL', teamId, r.status, r.data && r.data.errors);
      break;
    }
    const batch = (r.data && r.data.conversations) || [];
    out.push(...batch);
    const next = r.data && r.data.pages && r.data.pages.next && r.data.pages.next.starting_after;
    if (!next || !batch.length) break;
    startingAfter = next;
  }
  return out;
}

let teamboxPollRunning = false;
async function searchOpenJerryConversations() {
  const out = [];
  let startingAfter = null;
  for (let page = 0; page < 10; page++) {
    const body = {
      query: {
        operator: 'AND',
        value: [
          { field: 'admin_assignee_id', operator: '=', value: Number(JERRY_ID) },
          { field: 'open', operator: '=', value: true },
        ],
      },
      pagination: { per_page: 50 },
    };
    if (startingAfter) body.pagination.starting_after = startingAfter;
    const r = await axios.post('https://api.intercom.io/conversations/search', body, {
      headers: icHeaders(),
      timeout: IC_TIMEOUT_MS,
      validateStatus: () => true,
    });
    if (r.status >= 400) {
      console.log('JERRY_SEARCH_FAIL', r.status, r.data && r.data.errors);
      break;
    }
    const batch = (r.data && r.data.conversations) || [];
    out.push(...batch);
    const next = r.data && r.data.pages && r.data.pages.next && r.data.pages.next.starting_after;
    if (!next || !batch.length) break;
    startingAfter = next;
  }
  return out;
}

async function pollSilentTeamboxNotes() {
  if (teamboxPollRunning) return;
  if (control.isPaused && control.isPaused()) return;
  teamboxPollRunning = true;
  try {
    const jobs = [
      { teamId: ESCALATIONS_TEAM_ID, label: 'ESCALATIONS', run: handleEscalationsSilentNoteOnly },
      { teamId: RISK_TEAM_ID, label: 'RISK', run: handleRiskSilentNoteOnly },
    ];
    for (const job of jobs) {
      let list = [];
      try {
        list = await searchOpenTeamConversations(job.teamId);
      } catch (e) {
        console.error('TEAMBOX_SEARCH_ERR', job.label, 'class=' + (e && e.name || 'Error'));
        continue;
      }
      console.log('TEAMBOX_POLL', job.label, 'open', list.length);
      for (const c of list) {
        const id = c && c.id;
        if (!id) continue;
        try {
          const full = (await fetchConversation(id)) || c;
          await job.run(String(id), full);
        } catch (e) {
          console.error('TEAMBOX_POLL_ITEM_ERR', job.label, id, 'class=' + (e && e.name || 'Error'));
        }
      }
    }
    // Jerry-assigned open tickets: long (150+ word) pending client msg + 15m → summary note
    let jerryList = [];
    try {
      jerryList = await searchOpenJerryConversations();
    } catch (e) {
      console.error('JERRY_SEARCH_ERR', 'class=' + (e && e.name || 'Error'));
      jerryList = [];
    }
    console.log('TEAMBOX_POLL JERRY open', jerryList.length);
    for (const c of jerryList) {
      const id = c && c.id;
      if (!id) continue;
      try {
        const full = (await fetchConversation(id)) || c;
        // Escalations/Risk Jerry tickets already handled above
        if (isEscalationsTeambox(full) || isRiskTeambox(full)) continue;
        await handleJerryOrEscalationsLongMessageNote(String(id), full);
      } catch (e) {
        console.error('TEAMBOX_POLL_ITEM_ERR', 'JERRY', id, 'class=' + (e && e.name || 'Error'));
      }
    }
  } finally {
    teamboxPollRunning = false;
  }
}

app.get('/health', (req, res) => res.json({ ok: true, engine: 'fresh-2026-09-16-botstop-owner-only-v1', statePathsEnforced: STATE_PATH_GUARD.enforced }));

// TESTABILITY SEAM: binding the port and starting the pollers only happens when this file
// is run as the entry point (`node index.js`, which is what pm2 runs). Requiring index.js
// from a test therefore loads the same handlers without opening a port, starting the
// teambox/auto-close/defer pollers, or the prune interval. Startup behavior is unchanged.
function fastAckInspect(ev, kind) {
  if (kind !== 'reply' && kind !== 'close') return Promise.resolve({ skip: false });
  // Teammate note commands (@Arsal REPLY / CLOSE / FOLLOW / stop ...) arrive as
  // conversation.admin.noted. In sync mode they deliberately bypass paused / aiOff /
  // Risk-owned / closed / already-replied, and the CLOSE command sets aiOff right
  // before it closes. The queue inspector must not change that, so it only guards
  // customer-triggered turns. Stale admin.noted events are still skipped by processOne.
  if (String((ev && ev.topic) || '') === 'conversation.admin.noted') return Promise.resolve({ skip: false });
  const ageMs = Date.now() - Number(ev.createdAtMs || 0);
  if (ev.createdAtMs && ageMs > webhookFastAck.stalenessMs()) return Promise.resolve({ skip: true, reason: 'stale' });
  try { if (control.isPaused()) return Promise.resolve({ skip: true, reason: 'paused' }); } catch (_) { return Promise.resolve({ skip: true, reason: 'paused' }); }
  try {
    if (ev.conversationId && control.isAiOff(ev.conversationId)) return Promise.resolve({ skip: true, reason: 'aiOff' });
  } catch (_) { return Promise.resolve({ skip: true, reason: 'aiOff' }); }
  return fetchConversation(ev.conversationId).then((fresh) => {
    if (!fresh) return { skip: false };
    if (fresh.open === false || String(fresh.state || '').toLowerCase() === 'closed') return { skip: true, reason: 'closed' };
    try { if (isRiskOwnedOrAssignedInHistory(fresh)) return { skip: true, reason: 'risk-owned' }; } catch (_) {}
    const since = Number(ev.triggerUserPartAt || 0);
    if (!(since > 0)) return { skip: false };
    const parts = typeof partsOf === 'function' ? partsOf(fresh) : [];
    for (const p of parts || []) {
      if (!p) continue;
      const at = Number(p.created_at || 0);
      if (at <= since) continue;
      const author = p.author || {};
      if (p.part_type === 'note') {
        try { if (continuousOwnership.isStopInstruction(p.body)) return { skip: true, reason: 'stop' }; } catch (_) {}
      }
      if ((author.type === 'user' || author.type === 'lead') && stripHtml(p.body || '')) {
        return { skip: true, reason: 'newer-customer-message' };
      }
      if ((author.type === 'admin' || author.type === 'bot') && String(p.part_type || '') === 'comment' && stripHtml(p.body || '')) {
        return { skip: true, reason: 'already-replied' };
      }
    }
    return { skip: false };
  }).catch(() => ({ skip: false }));
}
webhookFastAck.registerInspector(fastAckInspect);

if (require.main === module) {
  webhookFastAck.startWorker(async (rec) => {
    const req = { body: rec.body, headers: {}, __queuedWebhook: true, __notificationId: rec.notificationId };
    const res = { sendStatus() { return this; }, status() { return this; }, json() { return this; }, send() { return this; }, end() { return this; } };
    await handleWebhook(req, res);
  });
  app.listen(process.env.PORT || 3000, () => {
    console.log('Bot running (fresh engine)');
    // INTERCOM_AUTH_SHORTCIRCUIT_V1: events deferred during an auth outage (a restart is how a new token
    // is loaded) are replayed once the process is up and Intercom answers again.
    setTimeout(() => { replayAuthDeferred('startup').catch((e) => console.error('AUTH_REPLAY_START_ERR', 'class=' + (e && e.name || 'Error'))); }, 30000);
    // Catch Escalations/Risk tickets that already passed the 15m gate but got no new webhook
    setTimeout(() => {
      pollSilentTeamboxNotes().catch((e) => console.error('TEAMBOX_POLL_START_ERR', 'class=' + (e && e.name || 'Error')));
      pollAutoCloseSilentTickets().catch((e) => console.error('AUTO_CLOSE_START_ERR', 'class=' + (e && e.name || 'Error')));
      pollDeferredRelatedReplies().catch((e) => console.error('DEFER_START_ERR', 'class=' + (e && e.name || 'Error')));
    }, 8000);
    let ticketStatePruneTicks = 0;
    setInterval(() => {
      pollSilentTeamboxNotes().catch((e) => console.error('TEAMBOX_POLL_ERR', 'class=' + (e && e.name || 'Error')));
      pollAutoCloseSilentTickets().catch((e) => console.error('AUTO_CLOSE_POLL_ERR', 'class=' + (e && e.name || 'Error')));
      pollDeferredRelatedReplies().catch((e) => console.error('DEFER_POLL_ERR', 'class=' + (e && e.name || 'Error')));
      ticketStatePruneTicks += 1;
      if (ticketStatePruneTicks >= 60) {
        ticketStatePruneTicks = 0;
        pruneTicketState();
      }
    }, TEAMBOX_POLL_MS);
  });
}

// Exported for isolated tests only. Nothing here changes runtime behavior.
// __setTestDoubles lets a test replace the two functions that reach Intercom, so a test
// can exercise failure/timeout/dedup paths and still cannot send a real message.
// Captured before any test double can replace them.
const __realIcRequest = icRequest;
const __realFetchConversation = fetchConversation;
const t742Hooks = {
  replayAuthDeferred,
  scheduleBurstRerun,
  deferForAuth,
  armQueuedWebhook(req) {
    if (req && typeof req === 'object') req.__queuedWebhook = true;
    return req;
  },
  armBurstPending(conversationId) { burstRerunPending.add(String(conversationId || '')); },
  f1MarkFile() { return require('./f1AbstainMark').filePath(); },
  spreadStateFile() { return require('./spreadTestState').filePath(); },
  withOwnershipWriteLock,
  duplicateInflight: clientReplyInflight,
};

module.exports = {
  riskNoteGate,
  shouldBlockRiskNoteSpamNow,
  handleRiskSilentNoteOnly,
  handleEscalationsSilentNoteOnly, /* TEAMBOX_NOTE_LOCK_V1: exported for the concurrency regression test only */
  isSilentTeamboxNoteDuty, /* P1: exported for isolated note-path tests only */
  teamboxNoteOwnershipExemptReason,
  automaticNoteOwnershipBlock,
  escalationDuplicateCheck, /* ESCALATION_DEDUPE_V1: exported for tests only */
  buildHistory, /* HISTORY_SPEAKER_LABELS_V1: exported for tests only */
  contactBits, /* CONTACTBITS_NO_ADMIN_SOURCE_V1: exported for tests only */
  app,
  handleWebhook,
  webhookSecurity,
  buildVisionUserContent,
  attachmentUrlAllowed,
  presendEscalateActionNeeded,
  presendHoldKind,
  definingAttributes,
  retrieveApprovedEvidence,
  buildAnswerPlan,
  variantComparisonCompleteness,
  SCOPE_DECLINE_VARIANTS_REPEAT,
  bestProblemText,
  smalltalkReplyFor,
  finHandoffInHistory,
  isVagueOrLiveAgentOnlyAsk,
  arsalHasPublicClientReply,
  lockedFinHandoffWelcome,
  isPrivateHost,
  postReply,
  postClientCommentOnce,
  assignToTeammateIfNeeded,
  closeConversation,
  arsalAlreadyRepliedAfter,
  getConvState,
  parseAction,
  isShortClientAck,
  stripHandoffClaims,
  handoffClaimGate,
  handoffSucceededThisTurn,
  markHandoffSucceededThisTurn,
  /* R130 regression surface (2026-09-22): these four pure predicates decide whether a
   * model ESCALATE on a knowledge-answerable question is converted back into a REPLY.
   * They were only reachable from inside handleWebhook, so the behaviour could not be
   * regression-tested and a flaky escalation went unnoticed on BOTH transports.
   * Exporting them changes no behaviour; it only makes the rule testable.
   * See selftest-escalate-scope-knowledge-answerable.js */
  isClearlyAccountSpecificIssue,
  __resolveIdentityAskDecision: resolveIdentityAskDecision,
  __deferredIdentityAsk: deferredIdentityAsk,
  __buildEscalateNoteAndAssignee: buildEscalateNoteAndAssignee,
  __collectEscalateIds: collectEscalateIds,
  __vetNoteAccount: vetNoteAccount,
  __accountProvenance: accountProvenance,
  __escalationClientAck: escalationClientAck,
  formatEscalateNoteHtml,
  ESCALATE_NOTE_FOOTER: internalNoteFormat.ESCALATE_NOTE_FOOTER,
  resolveNoteDestination: (conversation, ids) =>
    internalNoteFormat.resolveNoteDestination(conversation, ids || noteDestinationIds()),
  noteDestinationIds,
  isPromoCodeFailureAsk,
  isPromotionQuestion,
  resolvePromoReply,
  shouldAutoCloseConversation,
  __handleAutoCloseIfDue: handleAutoCloseIfDue,
  routePartnershipBusiness,
  isGeneralPolicyQuestion,
  looksFundedEliteRelated,
  decideRepairedDraft, /* CARRIED_QUESTION_COVERAGE_V1 */
  quietHoldReason,
  unresolvedSupportQuestions,
  missedQuestionFallbackBody,
  collectImageAttachments,
  presendNeedsBackendLook,
  isKnowledgeAnswerableAsk,
  faqHoldMustNotEscalate,
  shouldNotReviveAccountIssue,
  DRAFT_QUALITY_HOLD_CODES,
  isHypotheticalRuleQuestion, /* HYPOTHETICAL_RULE_QUESTION_V1 */
  resolvePendingAsk, /* PENDING_ASK_RESOLVE_V1 */
  assessGeneralAccountAsk, /* GENERAL_ACCOUNT_ASK_GUARD_V1 */
  evaluateAwaitingEscalationAttempt,
  __buildMixedAwaitingRoute: buildMixedAwaitingRoute, /* MIXED_AWAITING_ANSWER_V1 */
  __intercomAuth: intercomAuth, /* INTERCOM_AUTH_SHORTCIRCUIT_V1 */
  replayAuthDeferred,
  AUTH_DEFERRED_FILE,
  t742Hooks,
  postProcessModelReply,
  toHtml,
  __reviewControlDeps: reviewControlDeps, /* REVIEW_CONTROL_STATE_V2: exported for tests only */
  applyPublicResponseContract: (...args) => publicResponseContract.applyPublicResponseContract(...args),
  __setTestDoubles(doubles) {
    doubles = doubles || {};
    // Passing null restores the real implementation, so a test can exercise icRequest's own
    // retry/reconciliation behavior after having stubbed it earlier in the same process.
    if (doubles.icRequest !== undefined) icRequest = doubles.icRequest || __realIcRequest;
    if (doubles.fetchConversation !== undefined) fetchConversation = doubles.fetchConversation || __realFetchConversation;
  },
};


// Action-scoped informational FAQ pathway (V12: select approved answers only).
// It never changes the global ownership verdict and never ships model-composed FAQ facts.
const faqApprovedAnswers = require('./faqApprovedAnswers');

/**
 * Model FAQ selector: JSON {answerId,confidence} from the sendable allowlist only.
 * Never returns customer-facing prose. On timeout/error/bad JSON/unknown id → null
 * (fail closed; deterministic cues in faqAnswerSelect may still match a sendable id).
 */
async function selectFaqAnswerId(text, meta) {
  meta = meta || {};
  const sendable = faqApprovedAnswers.list().map((a) => a.id);
  if (!sendable.length) return null;
  const allow = new Set(sendable);
  try {
    const ai = await lunaModel.create(openai, {
      model: control.getModel(),
      ...modelConfig.answerParams({
        tools: false,
        purpose: 'faq-assistance.select',
        conversationId: meta.conversationId || undefined,
      }),
      conversationId: meta.conversationId || undefined,
      messages: [
        {
          role: 'system',
          content:
            'You classify customer FAQ intents. Reply with ONLY compact JSON: {"answerId":"<id>","confidence":0.0-1.0}. ' +
            'answerId MUST be one of the provided sendable ids, or "ABSTAIN". Never write policy facts, never invent ids, never reply in prose.',
        },
        {
          role: 'user',
          content:
            'SENDABLE_IDS:\n' +
            sendable.join('\n') +
            '\nLANG_HINT: ' +
            (meta.lang || '') +
            '\nPRODUCT_HINT: ' +
            (meta.prod || '') +
            '\nCUSTOMER_TEXT:\n' +
            String(text || '').slice(0, 2000),
        },
      ],
    });
    const raw = ((((ai.choices || [])[0] || {}).message || {}).content || '').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    let parsed;
    try {
      parsed = JSON.parse(m[0]);
    } catch (_) {
      return null;
    }
    const id = String((parsed && parsed.answerId) || '').trim();
    if (!id || id === 'ABSTAIN' || !allow.has(id)) return null;
    const conf = Number(parsed.confidence);
    if (!Number.isFinite(conf)) return null;
    return { answerId: id, confidence: conf };
  } catch (_) {
    return null;
  }
}

function faqAssistanceDeps() {
  return {
    recover:ownershipUnavailableResult,
    moduleGates: faqModuleGates.list,
    fetch: (id) => fetchConversation(id), parts: authoritativeConversationParts, control,
    clientName: (full) => (contactBits(full) || {}).name || '',
    ownership: (full, parts) => ownershipBoundary.evaluate(full, parts, ownershipOptions(full.id)),
    isOwn: (cid, p) => ownershipOptions(cid).isLunaAuthored(p),
    silence: (parts) => teammateTopicOwnership.teammateSilenceDirective(parts, { arsalId:ARSAL_ID, eliteAiId:ELITE_AI_ID }),
    teammateScopeOpts: () => ({ arsalId: ARSAL_ID, eliteAiId: ELITE_AI_ID }),
    endedLeaseMute: (full, parts, user) =>
      continuousOwnership.shouldMuteEndedLease({
        ownership: continuousOwnershipOf(parts),
        parts,
        latestText: stripHtml((user && user.body) || ''),
        opts: { arsalId: ARSAL_ID, eliteAiId: ELITE_AI_ID },
        silence: teammateTopicOwnership.teammateSilenceDirective(parts, { arsalId: ARSAL_ID, eliteAiId: ELITE_AI_ID }),
      }),
    consequentialFreshnessBlock: (full, parts, plan, user) =>
      teammateHandoffGates.consequentialEscalationBlock(parts, full, {
        latestText: stripHtml((user && user.body) || ''),
        sinceCreatedAt: Number(user && user.created_at),
        arsalId: ARSAL_ID,
        eliteAiId: ELITE_AI_ID,
      }),
    isGrant:(p)=>ownershipOptions('').isAuthorizedGrant(p),screen:publicReplyBoundary.screen,
    stop: continuousOwnership.isStopInstruction, finWait: shouldWaitForFin,
    humanRequest: clientWantsHumanTeammate,
    // Owner: Risk/Escalations hard silence; ambiguous/stale ownership fail-closed inside faqAssistance.
    riskTeamId: RISK_TEAM_ID,
    escalationsTeamId: ESCALATIONS_TEAM_ID,
    isProtectedTeam: (full) => teammateHandoffGates.isAssignedToProtectedTeam(full, {
      riskTeamId: RISK_TEAM_ID, escalationsTeamId: ESCALATIONS_TEAM_ID,
    }),
    // Model selection: return {answerId,confidence} from sendable allowlist only — never prose.
    // Timeout / parse error / unknown id → null (fail closed at select layer).
    selectAnswer: selectFaqAnswerId,
    selectAnswerTimeoutMs: 1200,
    requireOwnerApprovedAnswers: true,
    backend: (q) => isClearlyAccountSpecificIssue(q) || presendNeedsBackendLook(q) || accountCheckRequest.isExplicitAccountCheckRequest(q),
    general: isKnowledgeAnswerableAsk,
    policyFacts:(text)=>{const p=require('./statePresend/policyEvidence');return p.policyFacts(text).map(f=>({...f,attributes:p.attributionsOf(text,f.raw)}));},
    questionScope:(text)=>{const p=require('./statePresend/policyEvidence');return p.attributionsOf(String(text).replace(/[?!.]+\s*$/,'')+' 0%','0%')[0]||{};},
    productsConflict:(q,a)=>{const p=require('./statePresend/policyEvidence');const normalize=x=>String(x).replace(/\b(stages?|phases?)\b/gi,'step');const qp=Array.from(p.productsIn(normalize(q))),ap=Array.from(p.productsIn(normalize(a)));return qp.length&&ap.length&&!qp.some(x=>ap.some(y=>p.compatible(x,y)));},
    aliases:()=>{const pairs=new Map();for(const a of faqKb.getArticles()){const text=stripHtml(a.body||'');for(const m of text.matchAll(/([A-Za-z][A-Za-z -]{2,60})\s*\(([A-Z]{2,8})\)/g)){const words=m[1].trim().split(/\s+/);const acronym=m[2].toLowerCase();for(let n=2;n<=Math.min(words.length,8);n++){const term=words.slice(-n).join(' ');if(term.split(/[ -]+/).map(w=>w[0]).join('').toLowerCase()===acronym){pairs.set(acronym,term);break}}}}return [...pairs];},
    intent: (text, parts) => replyDecision.resolve({ latestText:text, parts,
      isAccount:(q)=>isClearlyAccountSpecificIssue(q)||presendNeedsBackendLook(q)||accountCheckRequest.isExplicitAccountCheckRequest(q),
      isGeneral:isKnowledgeAnswerableAsk, isRelated:looksFundedEliteRelated, isHumanRequest:clientWantsHumanTeammate, resolvePendingAsk }),
    retrieve: (q, parts) => retrieveApprovedEvidence(faqKb,q,{ priorClientTexts:parts.filter(p=>['user','lead'].includes((p.author||{}).type)).map(p=>stripHtml(p.body||'')) }),
    comparison: (q, parts) => productComparison.isComparisonTurn(q,q,[])?productComparison.build(q,faqKb.getArticles(),[]):null,
    comparisonEvidence: (table) => { const ids=new Set(table.pair.flatMap(p=>p.source.map(s=>s.id))); return '\nCOMPLETE CANONICAL PRODUCT ARTICLES:\n'+faqKb.getArticles().filter(a=>ids.has(a.id)).map(a=>'TITLE: '+a.title+'\nURL: '+a.url+'\n'+productComparison.plain(a.body)).join('\n\n'); },
    begin:(cid,turn)=>lunaEpisode.begin(cid,{messageId:turn}),end:(cid)=>lunaEpisode.end(cid),
    model: async (question, evidence, history, correction, comparison, cid, episode) => {
      const ai=await lunaModel.create(openai,{ model:control.getModel(), ...modelConfig.answerParams({tools:false,purpose:correction?'faq-assistance.regenerate':'faq-assistance.answer',conversationId:cid,episode}), conversationId:cid,episode,
        messages:[{role:'system',content:control.getPrompt()},{role:'user',content:'Answer only these supported GENERAL FAQ questions. Do not investigate any account, promise backend actions, or execute actions. Return ACTION: REPLY with the supported answer.\nQUESTIONS:\n'+question+'\nAUTHORITATIVE EVIDENCE:\n'+evidence+(comparison?'\nSTRUCTURED COMPARISON:\n'+productComparison.tableText(comparison):'')+'\n'+buildAnswerPlan(question,{evidence})+(correction?'\nVALIDATOR CORRECTION:\n'+correction:'')}] });
      return (((ai.choices||[])[0]||{}).message||{}).content||'';
    },
    parse:parseAction, format:postProcessModelReply, validate:(p)=>__statePresend.gate(p),
    send:(cid,body,scope)=>postReply(cid,'comment',body,scope),
    publicHtml:toHtml,
    known:(cid)=>ownershipBoundary.knownParts(cid),
    confirmed:(result,body,before)=>result&&result.data&&result.data.type==='conversation_part'?ownershipBoundary.confirmedParts(result.data,'comment',toHtml(body),undefined,ARSAL_ID,before):[],
    coordinateBackend:coordinateFAQBackend,
    backendCaveat:(b)=>b.status==='existing-human'?'The account-specific portion requires internal records; your current human teammate remains responsible for that review.':b.status==='confirmed'?'The account-specific portion requires internal records and has been referred to a support teammate.':b.status==='identity-needed'?'For the account-specific check, please provide the account number so a support teammate can investigate.':'The account-specific portion requires human review. I could not confirm a completed handoff for that part.'
  };
}
async function coordinateFAQBackend(plan, full, parts) {
  const owned=ownershipBoundary.evaluate(full,parts,ownershipOptions(plan.cid));
  if(owned.blocked || (full.team_assignee_id && String(full.team_assignee_id)!=='0')) return {status:'existing-human'};
  const st=getConvState(plan.cid).state;
  if(st.escalateAwaitingFirstTeammate || st.escalationPending) return {status:'existing-human'};
  const problem=plan.backend.join('\n'),ids=collectEscalateIds(full,problem);
  let current;
  try {current=await fetchConversation(plan.cid);}catch(_){return {status:'unresolved'}}
  const currentParts=current&&authoritativeConversationParts(current),latest=currentParts&&findLatestUserPart(currentParts,current);
  if(!current || !currentParts || !latest || String(latest.id||'source')!==plan.turnId || faqAssistance.hash(latest.body)!==plan.rawHash)return {status:'unresolved'};
  const built=await buildEscalateNoteAndAssignee({problem,actionNeeded:'Review the customer account-specific request',account:ids.account,email:ids.email,conversation:current});
  if(!built || !built.html)return {status:built&&built.deferred&&built.reason==='missing_account'?'identity-needed':'unresolved'};
  const before=ownershipBoundary.knownParts(plan.cid),note=await postReply(plan.cid,'note',built.html,'faq-backend:'+plan.turnId);
  const freshReceipt=ownershipBoundary.knownParts(plan.cid).filter(p=>p.kind==='note'&&!before.some(b=>b.id===p.id));
  if(!note || !note.ok || note.unknown || freshReceipt.length!==1)return {status:note&&(note.unknown||note.ok&&!note.skipped&&freshReceipt.length!==1)?'unknown':'rejected'};
  const assign=built.assigneeId?await assignToTeammateIfNeeded(current,plan.cid,built.assigneeId):null;
  const assignReceipt=ownershipBoundary.knownParts(plan.cid).filter(p=>p.kind==='assignment'&&!before.some(b=>b.id===p.id));
  const confirmed=!!(assign&&assign.ok&&!assign.unknown&&assignReceipt.length===1);
  if(confirmed)recordEscalationState(plan.cid,problem,built.problemText,current);
  return {status:confirmed?'confirmed':'note-only',noteReceiptId:freshReceipt[0].id,assignmentReceiptId:confirmed?assignReceipt[0].id:null};
}
