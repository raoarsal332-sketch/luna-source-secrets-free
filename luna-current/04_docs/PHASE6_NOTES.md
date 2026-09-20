# Phase 6 notes — system-prompt consolidation (gpt-5.6-luna / FundedElite Intercom)

Date: 2026-09-10 (Asia/Karachi)
Backup: `/workspace/luna-edit/system-prompt.txt.before-phase6`
Edited: `/workspace/luna-edit/system-prompt.txt`
Deploy: NOT done (no VPS / no network). `index.js` untouched.

## Size
- Before: 152474 chars (153137 bytes)
- After:  146023 chars (146714 bytes)
- Delta:  -6451 chars (-6423 bytes) — shrunk

## Preserved (authoritative / mandatory)
- AUTHORITY hierarchy added once at top; SOT still primary for product numbers
- ARSAL PRODUCT SOURCE OF TRUTH (full Instant / Instant Elite / Flash / Free Retry / LITE / second chance / soft breach / Catalyst / Pakistan)
- OFFICIAL LEVERAGE CHART
- HARD FAQ FACTS (lot / margin / hypothetical)
- REASONING ALIGNMENT, GENERAL FAQ vs ACCOUNT-SPECIFIC, OPERATING IMPROVEMENTS, FAQ-FIRST
- Ownership / escalate / closing state machine (OWNERSHIP, ESCALATE ACCOUNT-NUMBER GATE, GLOBAL TICKET STATE MACHINE, CLOSING ENFORCEMENT)
- OUTPUT FORMAT
- Welcome / Fin handoff / introduction-once flows
- CUSTOMER REVIEW REQUEST mandatory closing flow
- Italian governing-law / Terms content kept (Italian Republic jurisdiction, etc.)
- Valid FAQ + Terms scrape retained as backup knowledge (not deleted wholesale)

## Cleaned / consolidated
1. **Hierarchy section** — single AUTHORITY HIERARCHY (1 safety/ownership … 6 FAQ scrape … 7 style).
2. **Duplicate OWNERSHIP** — collapsed dual top OWNERSHIP blocks into one LOCKED blurb + pointer to state machine / escalate gate.
3. **SOT trailing one-liners** — ESCALATE/CLOSING/OWNERSHIP repeats after leverage chart shortened to a pointer.
4. **FAQ-FIRST consistency** — aligned to SOT (Flash add-on turns consistency OFF; Instant 25% NOT removable); removed scrape-contradicting “no add-on = no rule” wording.
5. **STALE FAQ SCRAPE header** — KB labeled backup-only; never overrides SOT.
6. **Contradiction strikes / SOT pointers in scrape**
   - Instant consistency “removable via add-on” → struck; SOT NOT removable
   - Instant FX → FIXED 1:30 (not chart 50/100)
   - Instant Elite sizes note ($50k–$400k, no consistency)
   - Flash eval PT fixed 6% / MLL 6% / no min days → struck; SOT custom PT 2–6%, MLL 6/8/10%, eval min days 1
   - Flash live total DD fixed 6%, split 80%/14d → struck; SOT purchased MLL + custom split/payout days
   - Flash consistency always-on-only → SOT add-on turns OFF
   - Leverage article empty charts → point to OFFICIAL LEVERAGE CHART; Instant not on 50/100 chart
   - Flash $300k/$400k fees: note sizes exist in SOT; do not invent missing fee rows
7. **Deduped** $300k consistency double EXPLANATION block.
8. **Stripped** Intercom related-article suggestion footers from FAQ scrape (~5k chars) — already marked non-policy.
9. **Blank-line compaction** in LOCKED prefix (max runs reduced).

## Not done (by design)
- No new product facts invented
- No deploy / no network / `index.js` not modified
- Terms body left intact (legal text); only FAQ related-link chrome stripped
- Did not delete entire challenge articles — struck/annotated conflicts instead so backup FAQ remains usable when SOT is silent

## SOT key check
OK: AUTHORITY HIERARCHY
OK: ARSAL PRODUCT SOURCE OF TRUTH
OK: OFFICIAL LEVERAGE CHART
OK: HARD FAQ FACTS
OK: REASONING ALIGNMENT WITH COMMAND CENTER
OK: GENERAL FAQ vs ACCOUNT-SPECIFIC
OK: OPERATING IMPROVEMENTS
OK: FAQ-FIRST + NO GUESSING
OK: OWNERSHIP — FRESH TICKETS
OK: GLOBAL TICKET STATE MACHINE
OK: CLOSING ENFORCEMENT
OK: CUSTOMER REVIEW REQUEST — MANDATORY CLOSING FLOW
OK: Welcome Message Style
OK: OUTPUT FORMAT
OK: STALE FAQ SCRAPE (BACKUP ONLY
OK: ESCALATE ACCOUNT-NUMBER GATE
