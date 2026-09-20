# Luna (FundedElite Intercom bot) — Claude Code

**One live bot only.** PM2 process uses `/home/ubuntu` (system Node). Claude, Codex-prod, and Grok CoS all share that same live tree when editing prod. Do not race other agents on the same files; prefer staging first.

## Access (Arsal order — CoS-aligned)
- `/home/ubuntu` production: read/write when the task is live
- `/home/ubuntu/luna-codex-staging` staging: prefer for experiments
- PM2 inspect/mutate (`intercom-bot`) when required
- Intercom MCP (`intercom` HTTP) for ticket work
- Control API / local tooling already on the VPS

## Still do NOT (unless Arsal asks in-session)
- AppArmor / sysctl / kernel / firewall changes
- `rm -rf /home/ubuntu` or disk wipes
- Paste `.env` / tokens / private keys into chat

## Paths
- `index.js` — main bot
- `control.js` — control API / prompts
- `system-prompt.txt` — behavior prompt (loaded live via `control.getPrompt()`)
- `statePresend/` — pre-send gates
- Backups: `~/backups/`

## Safety
- Backup before live edits
- Surgical patches; preserve business rules
- After code changes: `node --check`, then `pm2 restart intercom-bot --update-env`, verify health
- Coordinate: if Grok or Codex already editing live, wait or use staging

## Stack
- Intercom webhook bot, OpenAI chat.completions + tools via `lunaToolsRuntime.js`

## Luna local chat (no Intercom) — Arsal 2026-09-19

Cursor / Codex / Claude may quiz Luna like a client without Intercom:

`luna-local-chat --ask "..." ` or `luna-local-chat --quiz /home/ubuntu/tools/luna-local-chat-sample-quiz.txt`

Full notes: `/home/ubuntu/LUNA_LOCAL_CHAT.md`
Aliases: `luna-ask`, `cursor-luna-chat`, `codex-luna-chat`, `claude-luna-chat`
