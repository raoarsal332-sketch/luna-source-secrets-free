'use strict';
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const casesPath = '/tmp/r8-exec/cases.json';
const raw = fs.readFileSync(casesPath);
const hash = crypto.createHash('sha256').update(raw).digest('hex');
const sealed = fs.readFileSync('/tmp/r8-exec/cases.sha256', 'utf8').split(/\s+/)[0];
if (hash !== sealed) {
  console.error('SEAL BROKEN', hash, sealed);
  process.exit(2);
}

process.env.LUNA_CONTROL_STATE_FILE = '/tmp/r8-exec/state/bot-control.json';
process.env.LUNA_PROMPT_FILE = '/tmp/r8-exec/luna-current/01_runtime/system-prompt.txt';
process.env.TICKET_STATE_FILE = '/tmp/r8-exec/state/tickets-sealed.json';
process.env.LUNA_OP_STORE_FILE = '/tmp/r8-exec/state/ops-sealed.json';
process.env.LUNA_TOOLS_ENABLED = '0';
process.env.LUNA_PRESEND_MODE = 'enforce';
process.env.OPENAI_API_KEY = 'sk-synthetic-not-used';
process.env.INTERCOM_ACCESS_TOKEN = '';
process.env.PORT = '0';

const index = require('/tmp/r8-exec/luna-current/01_runtime/index.js');
const cases = JSON.parse(raw.toString('utf8'));

const httpLog = global.__R8_HTTP || [];
const posts = [];
index.__setTestDoubles({
  fetchConversation: async () => global.__R8_CONV,
  icRequest: async (method, url, data, tag) => {
    const rec = { method, url: String(url || ''), data, tag };
    posts.push(rec);
    if (/intercom\.io/i.test(rec.url) && String(method).toLowerCase() !== 'get') {
      // recording only; the double never calls the network
    }
    if (String(method).toLowerCase() === 'get') return { ok: true, status: 200, data: global.__R8_CONV };
    return { ok: true, status: 200, data: { id: 'synthetic-reply', type: 'conversation_part' } };
  },
});

function strip(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function buildConv(c) {
  const id = 'sealed-' + c.id;
  if (c.topic === 'admin.noted') {
    return {
      id,
      topic: 'conversation.admin.noted',
      team_assignee_id: 0,
      admin_assignee_id: '10118526',
      contacts: { contacts: [{ name: 'Synthetic Client', email: 'synthetic@example.test' }] },
      source: { body: '', author: { type: 'user', id: 'user-synthetic' } },
      conversation_parts: {
        conversation_parts: [{
          id: 'cmd-' + c.id,
          part_type: 'note',
          body: '@arsal REPLY: ' + c.draft,
          created_at: 1700000800,
          author: { type: 'admin', id: '10118526', name: 'Arsal' },
        }],
      },
    };
  }
  const notes = (c.notes || []).map((n, i) => ({
    id: 'note-' + c.id + '-' + i,
    part_type: n.partType || 'note',
    body: n.body,
    created_at: 1700000000 + i,
    author: { type: 'admin', id: String(n.authorId), name: 'Synthetic Admin' },
  }));
  const user = {
    id: 'user-' + c.id,
    part_type: 'comment',
    body: c.client,
    created_at: 1700000500,
    author: { type: 'user', id: 'user-synthetic', name: 'Synthetic Client' },
  };
  return {
    id,
    topic: 'conversation.user.replied',
    team_assignee_id: 0,
    admin_assignee_id: null,
    contacts: { contacts: [{ name: 'Synthetic Client', email: 'synthetic@example.test' }] },
    source: { body: '', author: { type: 'user', id: 'user-synthetic', name: 'Synthetic Client' } },
    conversation_parts: { conversation_parts: notes.concat([user]) },
  };
}

(async () => {
  const results = [];
  for (const c of cases) {
    posts.length = 0;
    const conv = buildConv(c);
    global.__R8_CONV = conv;
    global.__R8_MODEL = 'ACTION: REPLY\nBODY: ' + c.draft;
    const logs = [];
    const ol = console.log;
    const oe = console.error;
    console.log = (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
    console.error = (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
    const res = { status: null, sendStatus(code) { this.status = code; return this; } };
    let threw = null;
    try {
      await index.handleWebhook({ body: { topic: conv.topic, data: { item: conv } } }, res);
    } catch (e) {
      threw = e && e.message;
    }
    console.log = ol;
    console.error = oe;
    const outbound = posts.filter((p) => p.tag === 'OUT').map((p) => ({
      url: p.url,
      message_type: p.data && p.data.message_type,
      admin_id: p.data && p.data.admin_id,
      body: p.data && p.data.body,
      text: strip(p.data && p.data.body),
    }));
    const text = outbound.map((o) => o.text).join('\n');
    const critical = c.critical ? new RegExp(c.critical, 'i').test(text) : false;
    const guard = (logs.find((l) => /PAYOUT_GUARD/.test(l)) || '').replace(/^.*PAYOUT_GUARD_VISIBLE_HEDGE\s+\S+\s+/, '').replace(/^.*PAYOUT_GUARD_FAIL_CLOSED\s+\S+\s+/, 'fail-closed ');
    const hookReached = logs.some((l) => /PAYOUT_GUARD/.test(l));
    const presendHold = logs.some((l) => /needs-escalate|MISSED_QUESTION|POSTGATE_SUPPRESSED|SKIP empty/.test(l));
    const hedgePosted = /I can't confirm that/.test(text);
    const silent = outbound.length === 0;
    let verdict = 'pass';
    if (critical) verdict = 'critical';
    else if (c.expect === 'allow' && c.must && !text.includes(c.must)) verdict = 'regression';
    else if (c.expect === 'hedge' && c.must && !text.includes(c.must)) verdict = silent ? 'silent_drop' : 'regression';
    else if (c.expect === 'block' && silent) verdict = 'silent_drop';
    results.push({
      id: c.id,
      class: c.class,
      expect: c.expect,
      verdict,
      critical,
      hookReached,
      presendHold,
      hedgePosted,
      silent,
      guard: guard || null,
      status: res.status,
      threw,
      outbound,
    });
    if (verdict !== 'pass') {
      console.log(c.id, c.class, verdict, critical ? 'CRITICAL' : '', guard || (presendHold ? 'presend' : ''), JSON.stringify(text).slice(0, 220));
    }
  }

  const summary = {
    sealedCasesSha256: hash,
    caseCount: results.length,
    pass: results.filter((r) => r.verdict === 'pass').length,
    critical: results.filter((r) => r.verdict === 'critical').length,
    regression: results.filter((r) => r.verdict === 'regression').length,
    silentDrop: results.filter((r) => r.verdict === 'silent_drop').length,
    hookReached: results.filter((r) => r.hookReached).length,
    httpAttempts: httpLog.map((h) => ({ method: h.method, url: h.url })),
    byClass: {},
  };
  for (const r of results) {
    if (!summary.byClass[r.class]) summary.byClass[r.class] = { pass: 0, critical: 0, regression: 0, silentDrop: 0 };
    if (r.verdict === 'pass') summary.byClass[r.class].pass += 1;
    else if (r.verdict === 'critical') summary.byClass[r.class].critical += 1;
    else if (r.verdict === 'regression') summary.byClass[r.class].regression += 1;
    else if (r.verdict === 'silent_drop') summary.byClass[r.class].silentDrop += 1;
  }
  fs.writeFileSync('/tmp/r8-exec/results.json', JSON.stringify({ summary, results }, null, 2));
  console.log('SUMMARY', JSON.stringify(summary, null, 2));
})();
