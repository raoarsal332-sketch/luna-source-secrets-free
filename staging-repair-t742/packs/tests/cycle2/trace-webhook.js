'use strict';
/**
 * Source-backed stage trace through the integrated webhook.
 * Train rows only. Holdout rows are not loaded into the scored set.
 */
const fs = require('fs');
const path = require('path');

const ROOT739 = '/workspace/staging-repair-t739';
process.chdir(ROOT739);
const E = require(path.join(ROOT739, 'tests', 'env'));
const { h, fake, lm, reset, sc, index } = E;

const examples = JSON.parse(fs.readFileSync('/workspace/staging-repair-t742/packs/tests/cycle2/new-examples.json', 'utf8'));
const train = examples.rows.filter((r) => !r.holdout);

const tree = E.t.dir;
const router = require(path.join(tree, 'publicRouter'));
const { normalizeForRoute } = require(path.join(tree, 'routeNormalizer'));
const { languageGate } = require(path.join(tree, 'faqAnswerSelect'));
const { matchApproved, loadParams, statementCovers } = require(path.join(tree, 'approvedMatcher'));
const { unresolvedPolicy } = require(path.join(tree, 'unresolvedPolicy'));
const packsAccount = require('/workspace/staging-repair-t742/packs/impl/packsAccount');
const packsClaim = require('/workspace/staging-repair-t742/packs/impl/packsClaim');
const packsApproved = require(path.join(tree, 'packs', 'packsApprovedAnswers'));
const f1 = require(path.join(tree, 'f1AbstainMark'));

const calls = [];
const origRoute = router.route.bind(router);
router.route = async function tracedRoute(input) {
  const out = await origRoute(input);
  calls.push({
    text: input && input.text,
    prior: input && input.prior,
    reason: out && out.reason,
    send: !!(out && out.send),
    terminal: !!(out && out.terminal),
    mainRoute: !!(out && out.mainRoute),
    f1: !!(out && out.f1),
    suppress: !!(out && out.suppressPublicComposition),
    kind: out && out.kind,
    lang: out && out.gate && out.gate.lang,
    partId: out && out.decide && out.decide.partId,
    code: out && out.decide && out.decide.code,
  });
  return out;
};

function webhookReq(id, user, conv) {
  return {
    body: {
      topic: 'conversation.user.replied',
      data: {
        item: {
          id,
          type: 'conversation',
          conversation_parts: { conversation_parts: conv.conversation_parts.conversation_parts },
          source: conv.source,
        },
      },
    },
    headers: {},
  };
}
const res = { sendStatus() { return this; }, status() { return this; }, json() { return this; }, send() { return this; } };

function stageDivergence(row, stages) {
  const wantSend = row.bucket === 'send' || row.bucket === 'refuse';
  if (stages.claimKind !== 'exclusive') return 'claim';
  if (stages.lang !== 'en') return 'language';
  if (row.bucket === 'refuse' && !stages.personal) return 'personal-detector';
  if (row.bucket === 'refuse' && stages.selectedId !== row.gold) return 'decide-refuse';
  if (wantSend && stages.routeReason !== 'module-send') return 'coverage-or-decide';
  if (wantSend && stages.selectedId !== row.gold) return 'selected-id';
  if (row.bucket === 'abstain' && stages.routeSend) return 'abstain-sent';
  if (wantSend && !stages.posted) return 'downstream-gates';
  if (wantSend && stages.postedId !== row.gold) return 'outbound-id';
  if (row.bucket === 'abstain' && stages.posted) return 'outbound-should-abstain';
  return null;
}

(async () => {
  process.env.LUNA_PACKS_ENABLED = '1';
  const data = packsApproved.load();
  const rows = data.all.filter((r) => r && r.sendable && r.id !== 'packs.account-status.refuse.en' && r.id !== 'packs.handoff.unverified.en');
  const params = loadParams();
  const out = [];
  let seq = 88000;
  for (const row of train) {
    calls.length = 0;
    try { fs.unlinkSync(f1.filePath ? f1.filePath() : ''); } catch (_) {}
    const priorParts = (row.prior || []).map((t, i) => sc.userPart(t, Math.floor(Date.now() / 1000) - 120 - i));
    reset();
    const id = String(++seq);
    const user = sc.userPart(row.text);
    const conv = sc.conversation(id, priorParts.concat([user]));
    fake.setConversation(id, conv);
    const normalized = normalizeForRoute(row.text);
    const priorNorm = (row.prior || []).map((t) => normalizeForRoute(t));
    const gate = languageGate(normalized, priorNorm);
    const claim = packsClaim.claim({ text: row.text, normalized, prior: priorNorm });
    const personal = packsAccount.isPersonalOrMixed(normalized);
    const policy = unresolvedPolicy(normalized);
    const matched = matchApproved({ normalized, rows, params });
    const covered = [];
    const excluded = [];
    for (const r of rows) {
      let covers = false;
      try { covers = statementCovers(normalized, r, null); } catch (e) { covers = false; }
      if (covers) covered.push(r.id);
    }
    const top = (matched.candidates || []).slice(0, 5).map((c) => ({ id: c.partId, score: Number(c.score.toFixed(4)), covered: covered.includes(c.partId) }));
    for (const c of (matched.candidates || []).slice(0, 8)) {
      if (!covered.includes(c.partId)) excluded.push({ id: c.partId, reason: policy ? 'policy-before-coverage' : 'statement-not-covered' });
    }
    lm.state.queue.push('ACTION: REPLY\nBODY: whatever I invent about packs should not post');
    const logStart = h.logs.length;
    let thrown = null;
    try {
      await index.handleWebhook(webhookReq(id, user, conv), res);
    } catch (e) {
      thrown = String(e && e.stack || e).split('\n').slice(0, 6).join(' | ');
    }
    const pubs = fake.publicWrites().map((w) => String((w.data && w.data.body) || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180));
    const rawLogs = h.logs.slice(logStart).map((l) => l.line);
    const logs = rawLogs.filter((l) => /PROTECTED_ABSTAIN|LANGUAGE_UNCERTAIN|FAQ_ASSIST|module-send|outbound-allowlist|final-public-screen|protected-abstain|SKIP |IN |ERROR|error|throw|offer|FAQ/.test(l)).slice(0, 20);
    const postedBody = pubs[0] || '';
    let postedId = null;
    if (postedBody) {
      for (const r of data.all) {
        if (postedBody.includes(String(r.body || '').slice(0, 40))) { postedId = r.id; break; }
      }
      if (!postedId && /whatever I invent/.test(postedBody)) postedId = 'MODEL';
    }
    const routeCall = calls[0] || null;
    const stages = {
      claimKind: claim && claim.kind,
      lang: gate.lang,
      personal,
      routeReason: routeCall && routeCall.reason,
      routeSend: !!(routeCall && routeCall.send),
      selectedId: (routeCall && routeCall.partId) || (matched.action === 'SEND' ? matched.partId : null),
      posted: pubs.length > 0,
      postedId,
    };
    out.push({
      id: row.id,
      bucket: row.bucket,
      gold: row.gold,
      normalized,
      claim,
      lang: gate.lang,
      basis: gate.basis,
      personal,
      policy: policy || null,
      matchAction: matched.action,
      matchCode: matched.code,
      matchId: matched.partId,
      covered,
      top,
      excluded: excluded.slice(0, 6),
      routeCalls: calls.map((c) => ({ ...c, prior: (c.prior || []).length })),
      pubs,
      postedId,
      thrown,
      logs: logs.slice(0, 15),
      first: stageDivergence(row, stages),
    });
  }
  const dest = '/tmp/packs-cycle2-train-trace.json';
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  const brief = out.map((r) => [r.id, r.bucket, r.first || 'ok', r.lang, r.claim && r.claim.kind, r.personal ? 'pers' : 'gen', r.matchCode || r.matchId, r.postedId || '-', (r.routeCalls[0] && r.routeCalls[0].reason) || '-'].join('\t'));
  process.stdout.write(brief.join('\n') + '\nWROTE ' + dest + ' n ' + out.length + '\n');
})().catch((e) => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exit(1); });
