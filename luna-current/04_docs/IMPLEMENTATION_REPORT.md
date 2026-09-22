# FundedElite Intercom bot — implementation report (2026-09-10)

Backup restore point: `20260910T121559Z`  
- VPS: `~/backups/luna-20260910T121559Z.tgz`  
- Local: `/workspace/luna-backups/20260910T121559Z/`  
- Prompt auto-backup on replace: `~/prompt-backups/` (Phase 7)

## 1. Files changed
| File | Phases | Live? |
|------|--------|-------|
| `index.js` | 1–5 | Yes (PM2 restarted) |
| `control.js` | 7 | Yes |
| `system-prompt.txt` | 6 | Yes (control `/prompt` replace + backup) |
| `bot-ticket-state.json` | 3 (new) | Created empty on VPS |

## 2. Bugs fixed
1. **KIND default → ACCOUNT** — missing/invalid KIND no longer becomes ACCOUNT; safe default **FAQ_CONFIRM**; FAQ client overrides explicit ACCOUNT; invalid ACTION → **SKIP**.
2. **Escalate/review races** — early `tryClaimEscalation` / `tryClaimReview`; release claim when only asking MT5; mark done after success.
3. **Risk Team permanent silence** — historical Risk messages no longer hard-skip; only current Risk assignee or **latest** admin comment from Risk.
4. **Premature close/review** — code blocks CLOSE/anything-else while `pendingQuestions` remain or state is `HUMAN_WORKING`.
5. **Handoff vs resolved** — structured states separate `HUMAN_WORKING` vs `HANDOFF_RESOLVED`; new general FAQ allowed after handoff; blind 24h “silence forever on all questions” softened via state (escalate done lock still prevents duplicate escalate notes).

## 3. New state / logic
- Ticket state machine (JSON): NEW / ACTIVE / WAITING_FOR_CLIENT / HUMAN_WORKING / HANDOFF_RESOLVED / CLOSING / CLOSED  
- Fields: pendingQuestions, escalateKind, humanReplied/Resolved, introSent, anythingElseAsked, reviewSent, resolvedBy, …
- Multi-question: `splitClientQuestions`, model `PENDING:` / `RESOLUTION: RESOLVED`
- Control: rate limit, audit log, prompt backup + `/control/prompt-restore`, Intercom proxy method/path allowlist

## 4. Prompt cleaned (Phase 6)
- Before ~152.5k → after ~146.0k chars (−~6.4k)
- Added **AUTHORITY HIERARCHY**; labeled scrape **STALE FAQ SCRAPE (BACKUP ONLY)**
- Struck Instant removable-consistency / Flash fixed-6% contradictions; Instant FX fixed 1:30 preserved
- Notes: `/workspace/luna-edit/PHASE6_NOTES.md`

## 5. Intentionally preserved
- GPT-5.6 Luna + VPS architecture, Intercom webhook flow, active-shift teammate mention rotation
- Product SOT, leverage chart, hard lot/margin FAQ facts
- `sanitizeFaqReply` MT5-ask blocker, Fin→Arsal welcome, review message text, control API surface
- JSON locks (no SQLite/Redis migration)
- Existing ACTION: REPLY|ESCALATE|CLOSE|SKIP format (backward compatible; added kind safety + PENDING lines)

## 6. Not safely changed / remaining risk
- **Intercom webhook signature verification** — not implemented (no client secret wiring in current code). Recommended next: verify `X-Hub-Signature` / Intercom signed payloads when secret available.
- **OpenAI failure retry/backoff** — still mostly single-shot; no invented fallback (existing behavior), but no structured escalate-on-AI-fail yet.
- **Teammate skill-based routing** (payout vs backend vs futures) — not fully built; rotation + active status preserved.
- **True multilingual NLP** for done/ack — still partly English-regex; mitigated by structured ticket state for high-impact gates.
- **FORCE CLOSE paths** still rely partly on `clientLooksDone` regexes — gated by pendingQuestions/HUMAN_WORKING now.
- Concurrent JSON file writes are improved with early claims but not OS-level file locks / atomic rename everywhere.

## 7. Tests completed (logical / unit)
- D: missing/invalid KIND → FAQ_CONFIRM; FAQ overrides ACCOUNT; invalid ACTION → SKIP  
- B: multi-question split + PENDING parse  
- J: unresolved pending detected  
- K: escalate/review early claim blocks duplicates; release works  
- F/G: teammate checking vs resolved heuristics  
- A/C: FAQ vs account classifiers  
- Syntax: `node --check` on index.js + control.js  
- Live: bot online, prompt replace returned backup path, features include `prompt-restore`

Live Intercom end-to-end ticket roleplay (A–Q full) not executed against production clients in this pass — recommend Arsal shadow QA / one staging ticket.

## 8. Remaining priority follow-ups
1. Webhook authenticity verification  
2. OpenAI fail → safe note / retry  
3. Teammate capability routing matrix  
4. Stronger multilingual done/ack classification (or Luna structured `intent` field, non-breaking)  
5. Optional atomic write (`write tmp + rename`) for all JSON stores  

## Restore
See `/workspace/luna-backups/20260910T121559Z/RESTORE.md` or VPS `~/backups/luna-20260910T121559Z.tgz`.  
Prompt rollback: `POST /control/prompt-restore` with `{ "file": "<basename from ~/prompt-backups>" }`.
