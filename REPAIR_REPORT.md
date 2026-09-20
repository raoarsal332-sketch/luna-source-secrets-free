# Luna C1–C11 repair report

Baseline: `Luna_Current_A2Z_FULL.tar.gz` (export 2026-09-20T13:27:38Z), extracted to `luna-current/`.
This report does **not** claim a live VPS deploy or unpause.

## Protected content

Recorded against the extracted runtime copies. Must stay byte-identical.

| File | SHA-256 before / after |
|---|---|
| `01_runtime/system-prompt.txt` | `bdafd4f336d823df739fd422e63c86e2164b6e462977c2914351c468046b464d` |
| `01_runtime/fundedelite-faqs.md` | `8c586883b3ed1417f5559ad987a9fb74c07b08e2f89d44c72cecb3e32cb98e92` |

No business-policy rewrite. FAQ/prompt bytes were not edited.

## C1–C11

| ID | Fix | Files | Evidence | Residual risk |
|---|---|---|---|---|
| C1 | Policy numbers are audited against applicable evidence + conversation context. Customer-suggested policy figures are not authority. Time claims compare by duration (unit mismatch fails). Add-on exceptions apply only when confirmed or stated as the conditional rule. | `02_statePresend/policyEvidence.js`, `02_statePresend/presendMega.js` | Isolated checks: false-premise 99 minutes, 30s without add-on, 99 hours; 3-minute and confirmed 30s positives; account IDs preserved. | Broad product/version/phase combinations beyond holding-time/add-on are only as good as retrieved evidence. |
| C2 | Rephrase accepts only when number+unit facts are preserved. Final send re-validates the exact payload with local FAQ evidence. | `01_runtime/repeatedClientQuestion.js`, `01_runtime/index.js`, `01_runtime/faq-kb.js` (`live:false` option) | Minutes→hours and fabricated-completion rephrases held; faithful 3-minute + 30-second rephrase allowed. | Completeness of every compound construction is not exhaustively sampled. |
| C3 | Completion detector covers contractions, simple past, and ordinary passives; still requires verified human/note evidence. | `02_statePresend/knowledgeGapGate.js`, `02_statePresend/statePresend.js` | I've / I approved / passive blocked; pending allowed; verified note allows the claim. | Other languages / unusual periphrasis may still slip. |
| C4 | Distinct `FORBIDDEN_DIAGNOSTIC_ACTION`, fail-closed in observe. Lone “reset” no longer disables the check. | `02_statePresend/presendMega.js`, `02_statePresend/statePresend.js`, `02_statePresend/targetedRegeneration.js` | Diagnostic trade blocked with and without the word reset; non-diagnostic reset how-to still allowed. | Approved paid workflows that also use “to check/see” wording will be held (fail-closed). |
| C5 | Control schema requires boolean `paused`/`testMode` (and typed optionals) before cache replace. Incomplete/wrong-type/unreadable → last-good or paused+testMode. Writes stay atomic. | `01_runtime/control.js` | `{}`, missing `testMode`, wrong types, broken JSON hold paused+testMode; explicit valid unpause works. | First-run without a file is still fail-safe paused+testMode. |
| C6 | Account switch and account correction share `applyAccountChange`, clearing product/stage/add-on unless restated for the new account. | `02_statePresend/conversationState.js` | `No, I meant account 765432` drops Instant Elite; same-line new product kept; email-only correction keeps account facts. | Size/phase/add-on are cleared but only product is re-extracted from the same message. |
| C7 | Shared sanitizer before memory, maintainer evidence, analytics, and image-guard persistence. Account IDs kept. | `02_statePresend/credentialSanitizer.js`, `statePresend.js`, `analytics/index.js`, `imageAskGuard.js`, `luna-maintainer/schema.js`, `collector.js` | Synthetic password absent from memory snapshot and maintainer events; account 219876 still accepted. | Live historical stores were not inspected or cleaned. Ad-hoc `console.log` of raw client text is not fully covered. |
| C8 | Final send rechecks pause, ticket `aiOff`, test allowlist, takeover, freshness, and `conversation_parts.conversation_parts` array shape. Recheck after rephrase. | `01_runtime/index.js` | `{conversation_parts:{}}`, null fetch, human takeover, ticket-off all hold. | Allowlist/pause races depend on control-file freshness, not a remote lock. |
| C9 | Durable write-op identity (pending/unknown/confirmed/failed). Unknown/pending/confirmed not blindly replayed. HTTP 200 + unrelated body is not success. | `01_runtime/writeOpStore.js`, `01_runtime/index.js` | Timeout-after-accept + redelivery → one transport effect; malformed 200 → `ok:false`. | Not exactly-once Intercom delivery. Confirmed non-execution (4xx) can retry; unknown cannot. |
| C10 | IPv4-mapped IPv6 unwrapped; resolve-time `lookup` hook; magic-byte image check. | `01_runtime/index.js` | Mapped loopback/link-local rejected; `lookup` present on adapter; junk PNG header rejected; tiny valid PNG accepted; 8 MB stream still capped. | No live DNS/private-network request was made. Redirect-to-internal still depends on hop re-validation + lookup. |
| C11 | Operation-specific required finite inputs and finite outputs. Missing/invalid → `ok:false`. | `02_statePresend/tools/calc.js` | Missing base / invalid percent / missing date rejected; `8% of 100000` and `0%` succeed. | Timezone/DST still unverified. |

## Tests

- Isolated adversarial suite: `luna-current/08_repair_tests/current_checks.js` (audit appendix cases + positives).
- Runner: `node luna-current/08_repair_tests/run-suite.js` (rebuilds `test_mirror`, syntax-check, adversarial, selftests).
- `test-escalate-ack-norepeat.js` now injects `teammateHandoffGates` (and `escalateRelatedOnly`) into the VM fixture.

## Out of scope

- Live VPS hash/mode reconciliation, unpause, or customer-store cleanup.
- Held-out model suites / HO-06 / BRAIN-11 rates (artifacts not in this export).
- Dollar cost accounting.

Working repairs listed in the audit under “What is genuinely improved” were preserved (FAQ wiring, original 99-minute reject, original completion string, CRM leak, OTP/image, analytics password variants, ordinary account switch, holding completeness, compound original, takeover/null fetch, pause + invalid JSON, single-write no-blind-retry, 8 MB cap, webhook auth module).
