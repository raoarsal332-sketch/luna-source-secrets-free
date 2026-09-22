#!/usr/bin/env node
'use strict';
/**
 * Luna local chat (NO Intercom).
 * Lets Cursor / Codex / Claude Code ask Luna company-service questions
 * like a client, see the reply, then fix code/prompt if wrong.
 *
 * Usage:
 *   luna-local-chat
 *   luna-local-chat --ask "What is Instant Elite?"
 *   luna-local-chat --quiz /path/to/questions.txt
 *   luna-local-chat --session /tmp/luna-session.json
 *
 * Does NOT post to Intercom. Escalate decisions are shown, not executed.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = process.env.LUNA_ROOT || '/home/ubuntu';
process.chdir(ROOT);

// Load env without printing secrets
try {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] != null && process.env[m[1]] !== '') continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
} catch (_) {}

const OpenAI = require('openai');
const control = require(path.join(ROOT, 'control'));
const assistantIdentityGuard = require(path.join(ROOT, 'assistantIdentityGuard'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function parseArgs(argv) {
  const out = { ask: null, quiz: null, session: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ask') out.ask = argv[++i] || '';
    else if (a === '--quiz') out.quiz = argv[++i] || '';
    else if (a === '--session') out.session = argv[++i] || '';
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function parseAction(raw) {
  const text = String(raw || '').trim();
  const m = text.match(/ACTION:\s*(REPLY|ESCALATE|CLOSE|SKIP)\s*[\r\n]+([\s\S]*)/i);
  if (!m) {
    return { action: 'REPLY', body: text.replace(/^ACTION:\s*\w+\s*/i, '').replace(/^BODY:\s*/i, '').trim(), kind: '', problem: '', actionNeeded: '' };
  }
  const action = m[1].toUpperCase();
  const rest = m[2] || '';
  let body = '';
  let kind = '';
  let problem = '';
  let actionNeeded = '';
  const bm = rest.match(/^BODY:\s*([\s\S]*?)(?=\nACTION_NEEDED:|\nKIND:|\nPROBLEM:|\nACTION\s*:|$)/i);
  if (bm) body = bm[1].trim();
  const km = rest.match(/\nKIND:\s*([^\n]+)/i);
  if (km) kind = km[1].trim();
  const pm = rest.match(/\nPROBLEM:\s*([\s\S]*?)(?=\nACTION_NEEDED:|\nKIND:|\nACTION\s*:|$)/i);
  if (pm) problem = pm[1].trim();
  const am = rest.match(/\nACTION_NEEDED:\s*([\s\S]*)$/i);
  if (am) actionNeeded = am[1].trim();
  if (!body) {
    body = rest.replace(/^BODY:\s*/i, '').split(/\n(?:KIND|PROBLEM|ACTION_NEEDED)\s*:/i)[0].trim();
  }
  return { action, body, kind, problem, actionNeeded };
}

function loadSession(file) {
  if (!file || !fs.existsSync(file)) return { messages: [] };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { messages: [] };
  }
}

function saveSession(file, session) {
  if (!file) return;
  fs.writeFileSync(file, JSON.stringify(session, null, 2));
}

async function askLuna(session, clientText) {
  const system = control.getPrompt();
  const formatHint =
    '\n\nLOCAL_CHAT_MODE (no Intercom): Respond with ACTION format only.\n' +
    'ACTION: REPLY|ESCALATE|CLOSE|SKIP\n' +
    'BODY: <client-facing reply>\n' +
    'For ESCALATE also include KIND / PROBLEM / ACTION_NEEDED when relevant.\n' +
    'Mention being an AI assistant ONLY if the client directly asks whether you are an AI, a bot, or a human.\n' +
    'For personal questions (wife, father, mother, family, age, married, son, etc.), briefly decline WITHOUT saying you are an AI, and redirect to FundedElite support.\n';

  const history = (session.messages || []).slice(-16).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  const userPayload =
    'Client message:\n' +
    String(clientText || '').trim() +
    '\n\nRespond with ACTION format only. Do not invent a personal support-agent identity.';

  const completion = await openai.chat.completions.create({
    model: control.getModel(),
    messages: [
      { role: 'system', content: system + formatHint },
      ...history,
      { role: 'user', content: userPayload },
    ],
  });

  const raw = ((((completion.choices[0] || {}).message || {}).content) || '').trim();
  const parsed = parseAction(raw);
  let body = parsed.body || '';

  // Same identity guard as live public replies (personal → no AI line; direct AI ask → honest).
  try {
    body = assistantIdentityGuard.enforceAssistantIdentityReply(
      clientText,
      body,
      'local-chat',
      (session.messages || []).filter((m) => m.role === 'assistant').map((m) => m.content)
    );
  } catch (e) {
    console.error('[local-chat] identity guard failed', e && e.message);
  }

  session.messages = session.messages || [];
  session.messages.push({ role: 'user', content: String(clientText || '').trim() });
  session.messages.push({
    role: 'assistant',
    content: body || raw,
    action: parsed.action,
    kind: parsed.kind || '',
  });

  return { raw, parsed: { ...parsed, body }, body };
}

function printResult(clientText, result) {
  console.log('\n--- CLIENT ---');
  console.log(clientText);
  console.log('--- LUNA ACTION:', result.parsed.action + (result.parsed.kind ? ' / ' + result.parsed.kind : ''), '---');
  if (result.parsed.action === 'ESCALATE') {
    console.log('(Local mode: escalate NOT sent to Intercom — decision only)');
    if (result.parsed.problem) console.log('PROBLEM:', result.parsed.problem);
    if (result.parsed.actionNeeded) console.log('ACTION_NEEDED:', result.parsed.actionNeeded);
  }
  console.log('--- REPLY ---');
  console.log(result.body || '(empty)');
  console.log('-------------\n');
}

async function interactive(session, sessionFile) {
  console.log('Luna local chat (NO Intercom). Model:', control.getModel());
  console.log('Type a client question. Commands: /quit  /clear  /save');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));
  while (true) {
    const line = String(await ask('client> ')).trim();
    if (!line) continue;
    if (line === '/quit' || line === '/exit') break;
    if (line === '/clear') {
      session.messages = [];
      saveSession(sessionFile, session);
      console.log('(history cleared)');
      continue;
    }
    if (line === '/save') {
      saveSession(sessionFile, session);
      console.log('(saved', sessionFile || 'no --session path', ')');
      continue;
    }
    try {
      const result = await askLuna(session, line);
      printResult(line, result);
      saveSession(sessionFile, session);
    } catch (e) {
      console.error('ERROR', e && e.message);
    }
  }
  rl.close();
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage:
  luna-local-chat
  luna-local-chat --ask "What is Instant Elite?"
  luna-local-chat --quiz questions.txt
  luna-local-chat --session /tmp/luna-session.json

For Cursor / Codex / Claude: run these on the VPS. Does not use Intercom.`);
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY missing in env /home/ubuntu/.env');
    process.exit(1);
  }

  const session = loadSession(args.session);

  if (args.ask) {
    const result = await askLuna(session, args.ask);
    printResult(args.ask, result);
    saveSession(args.session, session);
    return;
  }

  if (args.quiz) {
    const lines = fs
      .readFileSync(args.quiz, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    for (const q of lines) {
      const result = await askLuna(session, q);
      printResult(q, result);
    }
    saveSession(args.session, session);
    return;
  }

  await interactive(session, args.session);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
