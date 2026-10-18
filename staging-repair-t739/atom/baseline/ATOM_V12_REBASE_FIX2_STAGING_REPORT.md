# Elite Atom × FAQ V12 — Structural D3 fix2 staging report

**Label:** STAGING COMPLETE  
**Owner rule:** Second and final fix attempt (no further phrase-only patch)  
**Driver:** Independent review §15 FAIL — `ATOM_INDEPENDENT_REVIEW.md` sha `cd2d81a8…`, sealed v4 `aafd4c11…` 31/32 (F30 synonym → sendable `atom.payouts.general.en`)  
**Implementer:** Atom staging agent (this report)  
**Date (UTC):** 2026-10-17  
**Scope:** **STAGING ONLY** under `/home/ubuntu/staging-elite-atom-v12-rebase-fix2-20261017/`. No production code change, no PM2 restart, no package, no deploy, no Intercom writes. Secrets/PII never printed.

---

## 0. Defect and required approach

**§15 defect:** `Do Atom challenge fees get returned at payout #3?` (and synonym probes: returned / cashback / money back / reimbursement / return / rebate / fee back) selected sendable `atom.payouts.general.en` (or account-status refuse). Root cause: `isAtomFeeRefundPolicyAsk` was a phrase lexicon, not intent-complete.

**Required approach (this pass):** STRUCTURAL deny-by-default:

- Zone A = fee / price / cost / payment term (EN + ES/PT + Roman Urdu + Urdu/Hindi/Arabic scripts)
- Zone B = payout/withdrawal context **or** money-recovery/compensation/return-back class
- **A ∩ B → ABSTAIN** unless a narrow **POSITIVE allow-list** matches a known-general payout or pure price-list question the KB answers exactly
- Unknown → abstain
- Flag-off byte parity with live `1b8de524…`; D1–D6 remain fail-closed

---

## 1. Staging tree (new copy)

| Item | Path |
|---|---|
| Fix2 staging root | `/home/ubuntu/staging-elite-atom-v12-rebase-fix2-20261017/` |
| Prior rebase (untouched by this pass’s intent) | `/home/ubuntu/staging-elite-atom-v12-rebase-20261017/` |
| Preserve | `/home/ubuntu/staging-elite-atom-preserved-20261017T1900Z/` |
| Artifacts | `…/artifacts/fix2-final/` |

---

## 2. Structural change (candidate + adapter synced)

**File:** `candidate/atomAnswerSelect.js` (= `adapter/atomAnswerSelect.js`)  
**sha256:** `dd3b9f79c002a8c04ba8298aab5eca3ba6f187c86a0e23dcf89fa60041d9473f`

### Mechanism

1. `hasAtomFeeMoneyTerm` — Zone A (multilingual fee/price/cost/payment)
2. `hasAtomPayoutContext` — Zone B payout/withdrawal/reward-request (+ script forms)
3. `hasAtomMoneyRecoveryContext` — Zone B recovery **class stems** (refund*/reimburs*/return*/back*/rebate*/compensat*/repay*/wapas/استرداد/…), not a closed “refund synonym” patch list
4. `isAllowlistedGeneralPayoutAsk` — positive allow-list only (timing/caps/rules); **never** when Zone A fee-money present
5. `isAllowlistedPurePriceAsk` — positive allow-list for prices.list; excludes recovery/payout mix
6. Early abstain **before** account-status and selectors: `reason: atom-fee-policy-owner-decision`, `failClosed`, `handoff`
7. `atom.payouts.general` selector itself is allow-list-only (bare `/payout/` can no longer select it)

`faqAnswerSelect.js` / `faqApprovedAnswers.js` unchanged vs t723 (`fc752a47…` / `2e0e0cfa…`) — EXTRA opt-in + flag-off parity preserved.

---

## 3. Live / production invariants (read-only verified)

| Check | Result |
|---|---|
| Live `index.js` | **unchanged** `1b8de524924c845c33dd995ad2e3a25dd417ee46a9f8f8e340c59672bd55c473` |
| Live `faqAnswerSelect.js` | **unchanged** `cb8df442…` |
| Live `faqApprovedAnswers.js` | **unchanged** `f36640af…` |
| Live `spreadPublicGuard.js` | `2158c43f…` (containment) |
| Live V12 answers | 17 rows, **0** `atom.*` |
| PM2 | online, cwd `/home/ubuntu`, node 20.20.2; this agent did **not** restart |
| EXTRA in prod | unset (no Atom intercept live) |

---

## 4. Fresh adversarial set (hash **before** author probe)

| Item | Value |
|---|---|
| Path | `docs/closure-20261017/elite-atom/independent-review/v12-rebase-fix2/adversarial-cases-v5-structural.json` |
| Seal sha256 | `1a14afdea88164793ec93b1bc107843cab058b5d8278564157a71d709fd90a49` |
| Cases | 39 (31 adversarial S\* incl. reviewer 10 synonyms + unseen stems + ML; 8 allow-list G\* for false-abstain measurement) |

Sealed v4 (prior independent seal, re-run): `aafd4c11cb1cb7a2a03bdac2f2f75abc3c67e9529a640794dacec910f00f0a46`

---

## 5. Test evidence (ACTUAL fix2 run)

| Suite | Result | Notes |
|---|---|---|
| Atom author selftest | **39/39 PASS** | + structural D3 + allow-list false-abstain tests |
| Sealed v4 `aafd4c11…` | **32/32 PASS**, **d3Leaks=0** | F30 now abstains |
| Fresh v5 `1a14afde…` | **39/39 PASS**, **d3Leaks=0**, **falseAbstain=0** | reviewer 10 + unseen + ML |
| Flag-off vs live | **mismatchUnset=0**, **mismatch0=0** | 32-query corpus byte-identical |
| R03 / R10 / R13 | acceptable content / safe abstention / acceptable content | unchanged classification |
| V12 author EXTRA off | **26/32** | teammate-helper OOS (unchanged) |
| Reopen heldout | **10/10** cand = base | |
| Reopen human-ownership | **36/36** cand = base | fixture `215476300195795` silent |
| MT5 live guard `2158c43f…` | **expected fail** (`authorizedSourceHashes` missing) | containment |
| MT5 cand/staging guard | **ALL_PASS v2** | |
| Full suite baseline | **130/137** (failed=7 shared) | |
| Full suite cand EXTRA off | **130/137** (failed=7) | |
| Full suite cand EXTRA on | **130/137** (failed=7) | |
| **`only_candidate`** | **`[]`** | no candidate-only fails |

Shared durable fails (all three trees): knowledge-sync, account-provenance, contextual-episode, escalation-identity-deadlock, final5, handoff-claim-action-binding, lock-harden.

### D3 probe sample (EXTRA on, atom-direct)

All of: returned / cashback / money back / reimbursement / return / fee back / rebate / refundable / pay back / come back / restitution / clawback / kickback / استرداد / wapas → **`atom-fee-policy-owner-decision` abstain** (zero sendable payouts/account-status).

Allow-list controls (first payout timing, 3%/1.5% caps, payout rules, price list, 25k cost, 2-Step daily loss, pack credit bundle) → still select correct sendable ids (falseAbstain=0).

---

## 6. D1–D6

| ID | Behavior | Silently adopted? |
|---|---|---|
| D1 equality 50% | abstain / non-sendable | **No** |
| D2 news minutes | abstain non-sendable | **No** |
| D3 fee refund / fee-policy | **structural A∩B abstain** unless allow-list | **No** (fail-closed) |
| D4 checkout SKU | prices/obsolete hedge; no live-SKU invent | **No** |
| D5 translations | EN confirmed fallback; provisional non-sendable | **No** |
| D6 stacking | bundles; no guarantee language | **No** |

---

## 7. Rollback

Staging-only; production unchanged → **no production rollback needed**.

To discard this staging attempt:

```bash
# Remove fix2 tree only (does not touch live or preserve)
rm -rf /home/ubuntu/staging-elite-atom-v12-rebase-fix2-20261017
# Optional: remove this report + v5 adversarial
# rm -f /home/ubuntu/docs/closure-20261017/ATOM_V12_REBASE_FIX2_STAGING_REPORT.md
# rm -rf /home/ubuntu/docs/closure-20261017/elite-atom/independent-review/v12-rebase-fix2
```

Prior rebase tree `/home/ubuntu/staging-elite-atom-v12-rebase-20261017/` and preserve `/home/ubuntu/staging-elite-atom-preserved-20261017T1900Z/` remain available.

---

## 8. Package / promote

**Not built. Not installed. Not promoted.** Awaiting independent re-review of structural D3 gate.

---

## 9. Status

# STAGING COMPLETE

Structural deny-by-default closed the §15 synonym hole (F30 + reviewer 10 + unseen stems) with **zero D3 sendable leaks** and **zero allow-list false abstains** on the fresh sealed set. Flag-off parity, R03/R10/R13 classification, reopen, MT5 containment, and full-suite `only_candidate=[]` hold. Production untouched.
