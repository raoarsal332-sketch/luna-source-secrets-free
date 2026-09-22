# Luna local chat (no Intercom)

Arsal order: Cursor, Codex, and Claude Code can ask Luna company-service questions **like a client**, without opening Intercom. Luna answers via the live system prompt + model. Escalate is shown only (not posted).

## Commands (on this VPS)

```bash
luna-local-chat
luna-local-chat --ask "What is Instant Elite?"
luna-local-chat --quiz /home/ubuntu/tools/luna-local-chat-sample-quiz.txt
luna-local-chat --session /tmp/luna-session.json --ask "follow-up question"

# Aliases (same binary)
luna-ask
cursor-luna-chat
codex-luna-chat
claude-luna-chat
```

## Agent instructions

When Arsal asks you to quiz Luna / check answers / fix wrong replies:

1. Run `luna-local-chat --ask "..."` (or a quiz file).
2. Read ACTION + REPLY.
3. If the reply is wrong vs official FundedElite facts, fix `system-prompt.txt` and/or code, then re-ask the same question.
4. Do **not** post to Intercom from this tool.
5. One live editor at a time among Cursor / Codex / Claude / CoS.

## Limits

- No Intercom ticket state, assignment, or real teammate notes.
- Identity guard still applies (personal Q → no AI line; direct "are you AI?" → honest AI).
- Full webhook-only gates may differ slightly from live Intercom turns; for ticket-faithful tests use Bot-test Intercom.

## Staging copy

Same tool path works with `LUNA_ROOT=/home/ubuntu` (default). Prefer prompt/code edits via staging when doing large changes, then promote.
