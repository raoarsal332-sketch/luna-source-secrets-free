# FundedElite Luna — escalate RELATED-only status hold v1 (Composer pack)

**Status: NOT LIVE.** Grok must: backup → apply → selftests → `pm2 restart` → health.

Engine target: `fresh-2026-09-15-escalate-related-only-v1`  
Base: live `fresh-2026-09-15-soft-edges-v1` (identity escalate gates, Fin-wait, soft-edges, promo SCOPE CONTROL preserved).

> Cursor sandbox does **not** have the live VPS `index.js` body (no repo; LUNA_FULL only partially recovered — awaiting status-only *reader* was missing from dumps). This pack ships **additive `escalateRelatedOnly.js` + apply script** that patches the live webhook gate on the VPS. Do not claim live until VPS selftests pass.

## Bug

Ticket example `215475945364936` (Arsal): after `escalateAwaitingFirstTeammate`, client asked unrelated FAQ (“what is catalyst challenge?”) and Luna only sent escalate holding lines (`ESCALATE status-only (awaiting teammate first)`).

## What changed

| Area | Change |
|---|---|
| Per-message gate | While awaiting first teammate public reply: **RELATED** → status-only hold; **short ack** → SKIP; **unrelated clear FAQ** (Catalyst, SEP35, leverage, Lite vs Standard, …) → **FALLTHROUGH** (answer normally). Escalate state stays armed. |
| Related detect | Uses escalate Problem/note text + topic (ip/risk/reset/payout/kyc/…) — not vague “any follow-up”. |
| Status copy | `pickEscalateStatusReply` bank — team already informed / reviewing; **no invented Risk/teammate outcomes**. |
| Teammate clear | First non-Luna admin public reply clears `escalateAwaitingFirstTeammate` (existing post-escalate rules resume). |
| Setter enrich | On escalate, store `lastEscalateProblem` / `lastEscalateTopic` / note snippet for RELATED matching. |
| Engine | `/health` → `fresh-2026-09-15-escalate-related-only-v1` |

## Exact file list (copy onto VPS `/home/ubuntu/`)

1. `escalateRelatedOnly.js` *(new)*
2. `selftest-escalate-related-only.js` *(new)*
3. `apply-escalate-related-only-on-vps.js` *(new — run once on VPS)*
4. This `APPLY.md`

`index.js` is **patched in place** by the apply script (not a full replacement). Prior soft-edges / identity modules are untouched.

## Commands (VPS)

```bash
cd /home/ubuntu
ts=$(date +%Y%m%d%H%M)
mkdir -p backups
cp index.js backups/index.js.bak.$ts
cp softEdges.js backups/softEdges.js.bak.$ts 2>/dev/null || true

# Copy the pack files into /home/ubuntu, then:
node apply-escalate-related-only-on-vps.js /home/ubuntu

node --check index.js
node --check escalateRelatedOnly.js
node selftest-escalate-related-only.js     # expect ALL PASS 15
# Keep prior locks green:
node selftest-identity-escalate-gates.js   # if present
node selftest-soft-edges.js                # if present
node test-fin-wait.js                      # if present

pm2 restart intercom-bot
sleep 2
curl -s localhost:3000/health
# expect: {"ok":true,"engine":"fresh-2026-09-15-escalate-related-only-v1"}
