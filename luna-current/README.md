# FundedElite Luna — Complete Current Live Export (A→Z)

**Exported:** 2026-09-20T13:27:38.466222Z  
**Source:** live VPS `/home/ubuntu` (PM2 `intercom-bot`)  
**Purpose:** poora current Luna ek hi archive mein — har cheez jo bot chalati hai.

## Folder map
| Folder | Contents |
|---|---|
| `01_runtime/` | Live entrypoint + saari bot modules + system prompt + FAQs + package.json |
| `02_statePresend/` | Pre-send / completeness / knowledge-gap / analytics / tools |
| `03_luna-maintainer/` | Maintainer code (customer case dumps excluded) |
| `04_docs/` | Prompt/FAQ copies + agent notes |
| `05_config/` | Redacted bot-control, env key names, PM2 snapshot, inventories, require graph |
| `06_tools/` | Helper CLIs / bin |
| `07_selftests/` | Root-level selftest_*.js |
| `MANIFEST.sha256` | Hash of every file |

## Runtime modules packed (34)
- `accountNumberPrefer.js`
- `assistantIdentityGuard.js`
- `challengeVariantGuard.js`
- `control.js`
- `escalateRelatedOnly.js`
- `faq-kb.js`
- `fundedelite-faqs.md`
- `fundedelite-promotion-prompt.js`
- `identityEscalateGates.js`
- `imageAskGuard.js`
- `index.js`
- `lunaToolsRuntime.js`
- `package-lock.json`
- `package.json`
- `patch-stale-selftests.js`
- `repeatedClientQuestion.js`
- `scan-acct-mismatch.js`
- `september-promos.js`
- `smoke_final.js`
- `smoke_movie.js`
- `smoke_v10.js`
- `smoke_v2.js`
- `smoke_v3.js`
- `smoke_v4.js`
- `smoke_v5.js`
- `smoke_v6.js`
- `smoke_v7.js`
- `smoke_v8.js`
- `smoke_v9.js`
- `softEdges.js`
- `spreadAskGate.js`
- `system-prompt.txt`
- `teammateHandoffGates.js`
- `webhookSecurity.js`

## statePresend JS (21)
- `calc.js`
- `clarificationNeedTighten.js`
- `compareChallenges.js`
- `conversationState.js`
- `correctionDetector.js`
- `getState.js`
- `index.js`
- `index.js`
- `knowledgeGapGate.js`
- `listOpenEscalation.js`
- `multiAskCompleteness.js`
- `presendMega.js`
- `promoAnnouncementFeed.js`
- `readImageFacts.js`
- `router.js`
- `searchKnowledge.js`
- `statePresend.js`
- `structuredImageExtractor.js`
- `targetedRegeneration.js`
- `textUtils.js`
- `topicChangeDetector.js`

## How Luna runs (A→Z)
1. Intercom webhook → `webhookSecurity.js` → `index.js`
2. Pause / testMode / allowlist → `control.js` + `bot-control.json`
3. Knowledge → `system-prompt.txt` + `fundedelite-faqs.md` + `faq-kb.js`
4. Guards → identity, escalate-related-only, image ask, challenge variant, account prefer, soft edges, spread, teammate handoff, …
5. Pre-send → `statePresend/` validate / hold / regenerate
6. Maintainer observe → `luna-maintainer/` (dry-run / approval)
7. Reply / escalate via Intercom APIs

## Excluded (safety)
- `.env` **values** (only key names)
- `node_modules/`
- logs, SSH keys, bash history
- live customer ticket/image state JSON
- raw conversation IDs (redacted in bot-control)
- backup trees / bulky `luna-brain-upgrade` QA dumps

## File count
138 files including README.

## Warning
Review/offline package. Production restore needs secrets + npm install + PM2 + explicit approval.
