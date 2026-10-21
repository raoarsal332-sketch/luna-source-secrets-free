'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const h = require('./harness');
const { buildCases } = require('./sealed-cases');

const ARSAL = h.ARSAL_ID;
const ELITE = h.ELITE_AI_ID;
const HUMAN = h.HUMAN_ID;
const OTHER = h.OTHER_ID;
const TEAM = h.TEAMMATE_ID;
const FIXED_SET = new Set(Object.values(h.FIXED));

function relPart(spec, base) {
  const role = spec.role || 'user';
  const author =
    role === 'arsal'
      ? { type: 'admin', id: ARSAL, name: 'Arsal' }
      : role === 'elite'
        ? { type: 'admin', id: ELITE, name: 'Elite AI' }
        : role === 'human'
          ? { type: 'admin', id: HUMAN, name: 'Human Teammate' }
          : role === 'teammate'
            ? { type: 'teammate', id: HUMAN, name: 'Human Teammate' }
            : { type: 'user', id: 'user-synthetic', name: 'Synthetic Client' };
  const part = {
    id: spec.id,
    part_type: spec.part_type != null ? spec.part_type : 'comment',
    body: spec.body || '',
    author: author,
    created_at: base + (spec.rel || 0),
  };
  if (spec.assignedTo) part.assigned_to = { type: 'admin', id: spec.assignedTo };
  return part;
}

function seedFor(name, id) {
  if (name === 'hold500') {
    return {
      fixedHandoff: {
        noteConfirmed: true,
        noteAmbiguous: false,
        assignConfirmed: false,
        assignAmbiguous: true,
        assigneeId: TEAM,
        messageSent: false,
        messageAmbiguous: false,
        turnId: 'seed-500',
      },
    };
  }
  if (name === 'hold422') {
    return {
      fixedHandoff: {
        noteConfirmed: true,
        noteAmbiguous: false,
        assignConfirmed: false,
        assignAmbiguous: false,
        assigneeId: TEAM,
        messageSent: false,
        messageAmbiguous: false,
        turnId: 'seed-422',
      },
    };
  }
  if (name === 'awaiting') {
    return {
      escalateAwaitingFirstTeammate: true,
      lastEscalateAt: h.nowSec() - 100,
      lastEscalateProblem: 'IP review for a VPN flag',
      lastEscalateTopic: 'ip_risk',
      lastEscalateTopics: ['ip_risk'],
      fixedHandoff: { noteConfirmed: true, assignConfirmed: true, messageSent: true, assigneeId: TEAM, turnId: 'seed-await' },
    };
  }
  if (name === 'complete') {
    return {
      fixedHandoff: {
        noteConfirmed: true,
        noteAmbiguous: false,
        assignConfirmed: true,
        assignAmbiguous: false,
        assigneeId: TEAM,
        messageSent: false,
        messageAmbiguous: false,
        turnId: 'seed-msg',
      },
    };
  }
  return null;
}

function ownParts(mode, base) {
  if (mode === 'admin_body') {
    return [{ rel: 8, id: 'own-admin', role: 'human', part_type: '', body: 'I am looking at this for you.' }];
  }
  if (mode === 'teammate_author') {
    return [{ rel: 8, id: 'own-tm', role: 'teammate', part_type: 'comment', body: 'I have this ticket.' }];
  }
  if (mode === 'stale') {
    return [{ rel: 8, id: 'own-stale', role: 'arsal', part_type: 'assignment', body: '', assignedTo: HUMAN }];
  }
  return [];
}

function convFrom(spec, id) {
  const base = h.nowSec() - 400;
  const parts = []
    .concat(ownParts(spec.ownMode, base))
    .concat(spec.parts || [])
    .map((p) => relPart(p, base));
  const convOpts = {
    id: id,
    latest: spec.latest || 'hello',
    latestId: spec.latestId || 'part-latest',
    latestAt: base + (spec.latestRel || 20),
    parts: parts,
    sourceBody: spec.sourceBody,
    omitLatest: !!spec.omitLatest,
    assigneeId: ARSAL,
    teamId: '0',
  };
  if (spec.ownMode === 'human') convOpts.assigneeId = HUMAN;
  if (spec.ownMode === 'other') convOpts.assigneeId = OTHER;
  if (spec.ownMode === 'risk') convOpts.teamId = h.RISK_TEAM_ID;
  if (spec.ownMode === 'escalations') convOpts.teamId = h.ESCALATIONS_TEAM_ID;
  if (spec.ownMode === 'risk_name') {
    convOpts.teamId = '0';
    convOpts.teamName = 'Risk Desk';
  }
  if (spec.ownMode === 'esc_name') {
    convOpts.teamId = '0';
    convOpts.teamName = 'Escalations Queue';
  }
  if (spec.ownMode === 'ambiguous') {
    convOpts.assigneeId = '0';
    convOpts.assigneeObj = { type: 'admin', id: '' };
  }
  if (spec.assigneeId) convOpts.assigneeId = spec.assigneeId;
  return h.makeConv(convOpts);
}

function applyModes(spec) {
  h.world.noteMode = spec.noteMode || 'ok';
  h.world.assignMode = spec.assignMode || 'ok';
  h.world.messageMode = spec.messageMode || 'ok';
  h.world.modelReplies = (spec.modelReplies || []).slice();
  h.world.modelIndex = 0;
}

function promptText() {
  return h.world.prompts
    .map((p) => (p.messages || []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n'))
    .join('\n');
}

function canaryHits(canaries) {
  const notes = h.noteBodies().join('\n');
  const comments = h.postsOf('comment').map((c) => String((c.data && c.data.body) || '')).join('\n');
  const prompts = promptText();
  const hits = [];
  for (const c of canaries || []) {
    if (!c) continue;
    if (notes.includes(c)) hits.push('note:' + c);
    if (comments.includes(c)) hits.push('comment:' + c);
    if (prompts.includes(c)) hits.push('prompt:' + c);
  }
  return hits;
}

function writeTypes() {
  return h.replyPosts().map((c) => c.data && c.data.message_type);
}

function awaiting(id) {
  const st = h.ticketState(id);
  return !!(st && st.escalateAwaitingFirstTeammate);
}

function authOk() {
  for (const c of h.world.calls) {
    if (!/api\.intercom\.io/.test(c.url)) continue;
    if (c.auth !== 'Bearer synthetic-intercom-token') return false;
  }
  return true;
}

function foreignUrl() {
  return h.world.calls
    .map((c) => c.url)
    .filter((u) => u && !/api\.intercom\.io|faq\.fundedelite\.com|fundedelite\.com/.test(u));
}

function promiseHits(bodies) {
  return (bodies || h.customerBodies()).filter((b) => h.PROMISE_RE.test(b) && !FIXED_SET.has(b));
}

function logHas(fragment) {
  return h.world.logs.some((l) => l.includes(fragment));
}

function fail(result, reason, extra) {
  result.ok = false;
  result.reasons.push(reason);
  if (extra) result.extra = Object.assign(result.extra || {}, extra);
}

function checkCommon(spec, result, id) {
  if (!authOk()) fail(result, 'intercom call was not sealed to the synthetic token');
  const foreign = foreignUrl();
  if (foreign.length) fail(result, 'call left the synthetic hosts', { foreign: foreign.slice(0, 4) });
  if (logHas('WEBHOOK_ERR')) fail(result, 'handleWebhook threw WEBHOOK_ERR');
  const hits = canaryHits(spec.expect.canaries);
  if (hits.length) fail(result, 'credential canary reached ' + hits.join(', '), { hits: hits });
  const promises = promiseHits();
  if ((spec.expect.noPromise || spec.expect.kind === 'silent' || spec.expect.kind === 'handoff' || spec.expect.kind === 'withhold') && promises.length) {
    fail(result, 'customer line invented a promise', { promises: promises.map((p) => p.slice(0, 180)) });
  }
  if (spec.expect.awaiting === true && !awaiting(id)) fail(result, 'escalateAwaitingFirstTeammate was not set');
  if (spec.expect.awaiting === false && awaiting(id)) fail(result, 'escalateAwaitingFirstTeammate was set');
}

function checkWrites(spec, result) {
  const got = writeTypes();
  const want = spec.expect.writes || [];
  if (got.join(',') !== want.join(',')) {
    fail(result, 'write order ' + JSON.stringify(got) + ' != ' + JSON.stringify(want));
  }
  if (want.includes('assignment')) {
    const asg = h.postsOf('assignment')[0];
    const assignee = asg && asg.data && asg.data.assignee_id;
    if (assignee !== Number(TEAM)) fail(result, 'assignment assignee_id ' + assignee);
    if (!asg || asg.data.admin_id !== ARSAL) fail(result, 'assignment was not posted as the bot seat');
  }
  if (want.includes('comment') && spec.expect.fixed) {
    const bodies = h.customerBodies();
    if (bodies.filter((b) => b === spec.expect.fixed).length !== 1) {
      fail(result, 'fixed customer line mismatch', { bodies: bodies });
    }
  }
  if (spec.expect.kind === 'withhold' && h.customerBodies().length) {
    fail(result, 'customer line was sent on a withheld handoff', { bodies: h.customerBodies() });
  }
  if (spec.expect.withheldReason && !logHas(spec.expect.withheldReason)) {
    fail(result, 'expected withhold reason ' + spec.expect.withheldReason);
  }
  if (spec.expect.path && spec.expect.kind === 'handoff' && !logHas('FIXED_HANDOFF sent ' + spec.expect.path)) {
    fail(result, 'path ' + spec.expect.path + ' was not reached');
  }
}

function checkSilent(result) {
  if (writeTypes().length) fail(result, 'owned conversation was not silent', { writes: writeTypes(), bodies: h.customerBodies() });
  if (h.fixedHits().length) fail(result, 'fixed line sent despite ownership');
}

const IDENTITY_REASK_RE = /please share your account number|please share the registered|before i pass this to the team|so i can forward|can you send (?:your |the )?account number|can you send the registered email|i['’]ll pass (?:it|this)|i['’]ll send this to a teammate/i;

function checkAnswer(spec, result) {
  const bodies = h.customerBodies();
  if (!bodies.length) fail(result, 'account question was swallowed');
  if (bodies.some((b) => IDENTITY_REASK_RE.test(b))) {
    fail(result, 'identity re-ask is not an answer to an account-number question', {
      bodies: bodies.map((b) => b.slice(0, 240)),
    });
  }
  if (h.fixedHits().length) fail(result, 'fixed handoff line sent for an account question', { bodies: bodies });
  if (h.postsOf('assignment').length) fail(result, 'assignment ran for an account question');
  if (spec.expect.includes && !bodies.some((b) => b.includes(spec.expect.includes))) {
    fail(result, 'answer did not include ' + spec.expect.includes, { bodies: bodies.map((b) => b.slice(0, 240)) });
  }
  if (promiseHits(bodies).length) fail(result, 'answer invented a promise', { bodies: bodies.map((b) => b.slice(0, 180)) });
  if (!result.ok) {
    result.extra = Object.assign(result.extra || {}, {
      pathLogs: h.world.logs
        .filter((l) => /FIXED_HANDOFF|IDENTITY_BEFORE|PRESEND_MISSED|account-question|SKIP empty/.test(l))
        .slice(0, 12),
    });
  }
}

function checkSpread(result) {
  const bodies = h.customerBodies();
  const hit = bodies.filter((b) => b.includes('TEST SPREAD ACCOUNT DETAILS'));
  if (hit.length !== 1) fail(result, 'spread template was not the single customer line', { bodies: bodies.map((b) => b.slice(0, 180)) });
  const text = hit[0] || '';
  if (!text.includes('MetaTrader 5') || !text.includes('55188')) fail(result, 'MT5 spread template was rewritten');
  if (h.postsOf('note').length || h.postsOf('assignment').length) fail(result, 'spread test assigned or noted');
  if (h.fixedHits().length) fail(result, 'fixed handoff line sent for a spread test');
}

function checkFaq(spec, result) {
  const bodies = h.customerBodies();
  if (h.fixedHits().length) fail(result, 'fixed handoff line replaced a FAQ');
  if (h.postsOf('assignment').length) fail(result, 'FAQ assigned a teammate');
  if (bodies.some((b) => b.includes('TEST SPREAD ACCOUNT DETAILS'))) fail(result, 'FAQ received the spread template');
  if (!bodies.length) fail(result, 'FAQ was swallowed');
  if (spec.expect.includes && !bodies.some((b) => b.toLowerCase().includes(String(spec.expect.includes).toLowerCase()))) {
    fail(result, 'FAQ answer missing expected text', { bodies: bodies.map((b) => b.slice(0, 220)) });
  }
}

function checkNotSpread(result) {
  if (h.customerBodies().some((b) => b.includes('TEST SPREAD ACCOUNT DETAILS'))) {
    fail(result, 'non-spread MT5 wording received the spread template');
  }
}

async function runSingle(spec) {
  const id = spec.id;
  h.resetWorld();
  applyModes(spec);
  const seed = seedFor(spec.seed, id);
  if (seed) h.seedTicket(id, seed);
  if (spec.seed === 'complete') {
    spec = Object.assign({}, spec, { assigneeId: TEAM });
  }
  const conv = convFrom(spec, id);
  await h.postWebhook(conv);
  const result = { id: spec.id, class: spec.class, title: spec.title, ok: true, reasons: [], scored: true };
  checkCommon(spec, result, id);
  if (spec.expect.kind === 'handoff' || spec.expect.kind === 'withhold') checkWrites(spec, result);
  if (spec.expect.kind === 'silent') checkSilent(result);
  if (spec.expect.kind === 'answer' || spec.expect.kind === 'no-leak-answer') {
    checkAnswer(spec, result);
    if (spec.expect.kind === 'no-leak-answer' && canaryHits(spec.expect.canaries).length) {
      fail(result, 'echoed credential on the customer line or prompt');
    }
  }
  if (spec.expect.kind === 'spread') checkSpread(result);
  if (spec.expect.kind === 'faq') checkFaq(spec, result);
  if (spec.expect.kind === 'not-spread') checkNotSpread(result);
  if (spec.expect.kind === 'no-leak' && h.fixedHits().length > 1) fail(result, 'duplicate fixed line');
  return result;
}

function welcomeConv(id, latest) {
  return h.makeConv({ id: id, latest: latest || 'agent please', latestId: 'u-main' });
}

async function runRetry422(spec) {
  const id = spec.id;
  h.resetWorld();
  h.world.assignMode = '422';
  await h.postWebhook(welcomeConv(id));
  const result = { id: spec.id, class: spec.class, title: spec.title, ok: true, reasons: [], scored: true };
  if (writeTypes().join(',') !== 'note,assignment') fail(result, '422 first turn writes ' + writeTypes().join(','));
  if (h.customerBodies().length) fail(result, '422 first turn sent a customer line');
  if (awaiting(id)) fail(result, '422 set awaiting');
  h.world.calls = [];
  h.world.logs = [];
  h.world.assignMode = 'ok';
  const base = h.nowSec() - 400;
  const conv = h.makeConv({
    id: id,
    latest: 'still waiting on this',
    latestId: 'u-retry',
    latestAt: base + 50,
    parts: [h.userPart('u-main', 'agent please', base + 20)],
  });
  await h.postWebhook(conv);
  const types = writeTypes();
  if (types.join(',') !== 'assignment,comment') fail(result, '422 retry writes ' + types.join(','));
  if (h.fixedHits().length !== 1 || h.fixedHits()[0] !== h.FIXED.en) fail(result, '422 retry fixed line', { bodies: h.customerBodies() });
  if (!awaiting(id)) fail(result, '422 retry did not set awaiting after success');
  if (promiseHits().length) fail(result, '422 retry invented a promise');
  return result;
}

async function runHold(spec, mode, second) {
  const id = spec.id;
  h.resetWorld();
  h.world.assignMode = mode;
  await h.postWebhook(welcomeConv(id));
  const result = { id: spec.id, class: spec.class, title: spec.title, ok: true, reasons: [], scored: true };
  if (h.customerBodies().length) fail(result, mode + ' hold sent a customer line on the first turn');
  if (awaiting(id)) fail(result, mode + ' hold set awaiting');
  if (writeTypes().join(',') !== 'note,assignment') fail(result, mode + ' first writes ' + writeTypes().join(','));
  h.world.calls = [];
  h.world.logs = [];
  h.world.prompts = [];
  h.world.modelIndex = 0;
  h.world.modelReplies = second.model || [];
  h.world.assignMode = mode;
  const base = h.nowSec() - 400;
  const conv = h.makeConv({
    id: id,
    latest: second.latest,
    latestId: 'u-next',
    latestAt: base + 60,
    parts: [h.userPart('u-main', 'agent please', base + 20)],
  });
  await h.postWebhook(conv);
  if (second.kind === 'silent') {
    if (writeTypes().length) fail(result, mode + ' hold released a write on the next ping', { writes: writeTypes(), bodies: h.customerBodies() });
    if (h.fixedHits().length) fail(result, 'fixed line released after ' + mode);
    if (awaiting(id)) fail(result, 'awaiting set during ' + mode + ' hold');
  } else {
    checkAnswer({ expect: { includes: second.includes } }, result);
    if (awaiting(id)) fail(result, 'awaiting set while the account question was answered during a hold');
    if (h.postsOf('assignment').length) fail(result, 'hold retried assignment while answering an account question');
  }
  const hits = canaryHits(spec.expect.canaries);
  if (hits.length) fail(result, 'canary ' + hits.join(','));
  return result;
}

async function runComplete(spec) {
  const id = spec.id;
  h.resetWorld();
  h.seedTicket(id, seedFor('complete'));
  const conv = h.makeConv({ id: id, latest: 'I am still here', latestId: 'u-msg', assigneeId: TEAM });
  await h.postWebhook(conv);
  const result = { id: spec.id, class: spec.class, title: spec.title, ok: true, reasons: [], scored: true };
  if (writeTypes().join(',') !== 'comment') fail(result, 'completion writes ' + writeTypes().join(','));
  if (h.fixedHits().length !== 1 || h.fixedHits()[0] !== h.FIXED.en) fail(result, 'completion fixed line', { bodies: h.customerBodies() });
  if (!awaiting(id)) fail(result, 'completion did not set awaiting');
  if (promiseHits().length) fail(result, 'completion invented a promise');
  return result;
}

async function runReplay(spec, how) {
  const id = spec.id;
  h.resetWorld();
  const original = welcomeConv(id);
  await h.postWebhook(original);
  const result = { id: spec.id, class: spec.class, title: spec.title, ok: true, reasons: [], scored: how !== 'stale' };
  if (h.fixedHits().length !== 1) fail(result, 'setup handoff did not send one fixed line');
  const note = h.noteBodies()[0] || '';
  const comment = h.postsOf('comment')[0] && h.postsOf('comment')[0].data.body;
  h.world.calls = [];
  h.world.logs = [];
  h.world.prompts = [];
  if (how === 'reconcile' || how === 'stale') h.wipeTickets();
  if (how === 'reconcile' || how === 'stale') h.wipeOps();
  if (how === 'opstore') h.wipeTickets();
  let conv;
  if (how === 'reconcile') {
    const base = h.nowSec() - 400;
    conv = h.makeConv({
      id: id,
      latest: 'agent please',
      latestId: 'u-main',
      latestAt: base + 20,
      assigneeId: TEAM,
      omitLatest: true,
      parts: [
        h.userPart('u-main', 'agent please', base + 20),
        { id: 'note-1', part_type: 'note', body: note, author: { type: 'admin', id: ARSAL, name: 'Arsal' }, created_at: base + 21 },
        { id: 'cmt-1', part_type: 'comment', body: comment, author: { type: 'admin', id: ARSAL, name: 'Arsal' }, created_at: base + 22 },
      ],
    });
  } else {
    conv = welcomeConv(id);
  }
  await h.postWebhook(conv);
  const dupes = h.replyPosts().length;
  result.replayWrites = writeTypes();
  if (how === 'stale') {
    result.observedDuplicate = dupes > 0;
    result.scored = false;
    if (dupes > 0) result.reasons.push('OBSERVED stale read posted again: ' + writeTypes().join(','));
    return result;
  }
  if (dupes) fail(result, 'replay posted again', { writes: writeTypes() });
  if (h.fixedHits().length) fail(result, 'replay sent another fixed line');
  return result;
}

async function runThanks(spec) {
  const id = spec.id;
  h.resetWorld();
  await h.postWebhook(welcomeConv(id));
  const result = { id: spec.id, class: spec.class, title: spec.title, ok: true, reasons: [], scored: true };
  const comment = (h.postsOf('comment')[0] && h.postsOf('comment')[0].data.body) || h.FIXED.en;
  h.world.calls = [];
  h.world.logs = [];
  const base = h.nowSec() - 400;
  const conv = h.makeConv({
    id: id,
    latest: 'thanks',
    latestId: 'u-thanks',
    latestAt: base + 80,
    assigneeId: TEAM,
    parts: [
      h.userPart('u-main', 'agent please', base + 20),
      { id: 'cmt-1', part_type: 'comment', body: comment, author: { type: 'admin', id: ARSAL, name: 'Arsal' }, created_at: base + 30 },
    ],
  });
  await h.postWebhook(conv);
  if (h.fixedHits().length) fail(result, 'second fixed line after thanks', { bodies: h.customerBodies() });
  if (promiseHits().length) fail(result, 'thanks received a promise', { bodies: h.customerBodies() });
  if (h.postsOf('assignment').length) fail(result, 'thanks triggered another assignment');
  return result;
}

async function runCase(spec) {
  if (spec.procedure === 'retry422') return runRetry422(spec);
  if (spec.procedure === 'hold500ping') return runHold(spec, '500', { kind: 'silent', latest: 'any update?' });
  if (spec.procedure === 'hold500account') return runHold(spec, '500', { kind: 'answer', latest: 'What is my account number?', includes: 'account number', model: ['ACTION: REPLY\nBODY: Your account number is the number shown on your dashboard. I do not have a stored account number in this chat.'] });
  if (spec.procedure === 'holdPartial') return runHold(spec, 'partial', { kind: 'silent', latest: 'any update?' });
  if (spec.procedure === 'holdTimeout') return runHold(spec, 'timeout', { kind: 'silent', latest: 'any update?' });
  if (spec.procedure === 'completeMessage') return runComplete(spec);
  if (spec.procedure === 'replayReconcile') return runReplay(spec, 'reconcile');
  if (spec.procedure === 'replayOpstore') return runReplay(spec, 'opstore');
  if (spec.procedure === 'replayStale') return runReplay(spec, 'stale');
  if (spec.procedure === 'thanksAfter') return runThanks(spec);
  return runSingle(spec);
}

async function main() {
  const casePath = path.join(__dirname, 'sealed-cases.js');
  const caseHash = crypto.createHash('sha256').update(fs.readFileSync(casePath)).digest('hex');
  const harnessHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'harness.js'))).digest('hex');
  const cases = buildCases();
  const results = [];
  for (const spec of cases) {
    try {
      results.push(await runCase(spec));
    } catch (e) {
      results.push({ id: spec.id, class: spec.class, title: spec.title, ok: false, scored: true, reasons: ['threw ' + (e && e.stack ? e.stack.split('\n')[0] : e)] });
    }
  }
  const scored = results.filter((r) => r.scored !== false);
  const passed = scored.filter((r) => r.ok);
  const failed = scored.filter((r) => !r.ok);
  const observed = results.filter((r) => r.scored === false);
  const byClass = {};
  for (const r of scored) {
    const row = byClass[r.class] || (byClass[r.class] = { pass: 0, fail: 0 });
    if (r.ok) row.pass += 1;
    else row.fail += 1;
  }
  const summary = {
    commit: '45e533d60b4b0e8eef7d1607e77a9bbdf8439662',
    caseFileSha256: caseHash,
    harnessSha256: harnessHash,
    cases: results.length,
    scored: scored.length,
    passed: passed.length,
    failed: failed.length,
    observed: observed.length,
    byClass: byClass,
    failures: failed.map((r) => ({ id: r.id, class: r.class, title: r.title, reasons: r.reasons, extra: r.extra || null })),
    observedDetail: observed,
  };
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(summary, null, 2));
  h.origLog(JSON.stringify({ cases: summary.cases, scored: summary.scored, passed: summary.passed, failed: summary.failed, byClass: byClass }, null, 2));
  for (const f of failed) {
    h.origLog('FAIL', f.id, f.class, f.reasons.join(' || '), f.extra ? JSON.stringify(f.extra).slice(0, 400) : '');
  }
  for (const o of observed) h.origLog('OBSERVED', o.id, (o.reasons || []).join(' || '), JSON.stringify(o.replayWrites));
  process.exitCode = 0;
}

main().catch((e) => {
  h.origLog(e && e.stack);
  process.exit(1);
});
