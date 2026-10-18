# Elite Atom fix2 — Independent Review (structural deny-by-default)

**Reviewer role:** Independent (did not author this candidate; did not patch it)  
**Date (UTC):** 2026-10-17  
**Scope:** Staging + read-only only. No production edits, no PM2 restart/reload, no nginx reload, no Intercom writes, no synthetic Intercom events or webhook replays, `bot-control.json` not edited, no secrets/PII printed.  
**Author report:** `/home/ubuntu/docs/closure-20261017/ATOM_V12_REBASE_FIX2_STAGING_REPORT.md` sha256 `c2d9f0129b506f99cf4185230bc85172ccdc8c573b5961ad31dfccef69e1df1f`  
**Candidate:** `/home/ubuntu/staging-elite-atom-v12-rebase-fix2-20261017/`  
**Candidate `atomAnswerSelect.js`:** `dd3b9f79c002a8c04ba8298aab5eca3ba6f187c86a0e23dcf89fa60041d9473f` (adapter copy identical)  
**Prior FAIL:** `elite-atom/ATOM_INDEPENDENT_REVIEW.md` v4 sha `cd2d81a8c39027d3d5b9b572ed160b379fed2e23b13da20931ef1b75d18a3e99`

**Verdict:** **FAIL**

**One-line:** Prior v4 synonym leaks (`returned` / `cashback` / `money back` / `reimbursement` / `return` / `rebate` / `fee back`) now abstain, and flag-off is byte-identical to live, but fee/refund-at-payout **meaning** still reaches sendable `atom.prices.list.en` (and once `atom.account-status.refuse.en`) when the ask avoids Zone A (fee/price/cost/payment) and Zone B (payout/recovery-stem) tokens. The gate is still a two-lexicon conjunction plus a dollar/size allow-list, not intent-complete deny-by-default.

---

## 0. Pass rule applied

PASS only if **zero sendable leaks of any deny class** on this reviewer’s sealed set **and** no candidate-only suite regressions.

False abstains on genuine general questions are reported separately and do **not** by themselves decide FAIL.

This review **FAIL**s on the first clause (sendable D3 leaks). Suite pairing is clean (`only_candidate=[]`).

---

## 1. Live / production invariants (before and after this review)

Host is the VPS (`51.79.173.231`). This reviewer made **no** production change.

| Check | Result |
|---|---|
| Live `index.js` | `1b8de524924c845c33dd995ad2e3a25dd417ee46a9f8f8e340c59672bd55c473` — **unchanged** before and after |
| Live `faqAnswerSelect.js` | `cb8df44284905f4477ad5b3148a81c6f9664900a897642f85a4c903164b85d5e` |
| Live `faqApprovedAnswers.js` | `f36640af229bd025b7797d0a04803c96128ea103704d162cdbed2a4ec4932749` |
| Live `spreadPublicGuard.js` | `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c` (containment) |
| Live V12 answers | **17** rows, **0** `atom.*` |
| Live Atom adapter / `kb/elite_atom` | **absent** |
| `.env` / `ecosystem.config.js` `LUNA_FAQ_APPROVED_ANSWERS_EXTRA` | **absent** |
| PM2 `intercom-bot` | **online**, pid **290068**, cwd `/home/ubuntu`, node **20.20.2**, EXTRA **unset** (key not defined) |
| `bot-control.json` | not edited (sha `55c8f42180b9fc4de5a0a19d844871dee3a4f7b176d2724be04f9d53e1c8bda0`, mtime 2026-10-17 17:15:43Z) |
| Candidate `index.js` | **byte-identical** to live `1b8de524…` |
| Candidate `faqAnswerSelect.js` | `fc752a472bd691713127b7fafdd40dba98eb669ae777a5578a1085484a070deb` (differs from live — expected; Extra-gated Atom intercept) |
| Staging baseline FAQ files | hard-match live (`cb8df442…` / `f36640af…`) |

Flag-off select (EXTRA unset and EXTRA=`0`) vs live on a 30-query corpus including Atom-scoped and D3 asks: **`mismatchUnset=0`, `mismatch0=0`**. Requirement “flag-off byte-identical to `1b8de524`” **holds**.

---

## 2. Independent sealed set (hashed before any select)

| Item | Value |
|---|---|
| Path | `/home/ubuntu/docs/closure-20261017/elite-atom/independent-review/v12-rebase-fix2-indep/adversarial-cases-v6-indep-structural.json` |
| **Sealed sha256 (before first run)** | **`0a5d28401033ff826bd0d9be966b111eada270c07c8296e892815bd8cf9bb237`** |
| Sealed at UTC | `2026-10-17T23:22:12.991Z` (`SEALED_AT_UTC.txt` recorded `NO_SELECT_YET=1`) |
| Post-run seal | **unchanged** |
| Case count | **155** (108 deny-class, **45** general negatives, 2 non-Atom) |
| Not reused | v4 `aafd4c11…`, author v5 `1a14afde…` |

Coverage (designed from the published A∩B claim + the structural question, not from author v5 cases):

- Prior v4 FAIL synonyms (returned / cashback / money back / reimbursement / return / rebate / fee back / refund)
- Paraphrases with **no** fee/price/cost/payment word (`$X I paid`, challenge purchase, what I spent, billed, bought, put down)
- Recovery wording outside the old refund lexicon (credited, reversed, compensated, back to me, recoup, recovered, give me my money, refundable)
- **Structural-hole** asks that also avoid published Zone B payout/withdrawal and recovery stems
- Misspellings, ZWSP / homoglyph / NBSP, dropped words
- EN / AR / HI / UR / ES / PT + Roman Urdu
- Mixed general+refund, allow-list bait, injection, account-status mix
- D1–D6
- ≥40 genuine general negatives

Runner (atom-direct **and** EXTRA-on `selectApprovedAnswer`):  
`independent-review/v12-rebase-fix2-indep/run-v6-sealed.js`  
Results: `…/artifacts/v6-sealed-results.json`

---

## 3. Every sendable leak

**7 unique inputs. 13 path-level leak records** (each S\* leak fires on both atom-direct and EXTRA-on FAQ).

| ID | Input class | Ask (verbatim) | Emitted answer id | Paths |
|---|---|---|---|---|
| **S01** | `d3-structural-hole` | Will the $289 I put down for Atom come to me the third time I get paid? | **`atom.prices.list.en`** | atom-direct + faq-extra-on |
| **S03** | `d3-structural-hole` | Give me my money for the Atom 100k I bought once I have been paid three times | **`atom.prices.list.en`** | both |
| **S06** | `d3-structural-hole` | Third Atom cashout — do I get the $215 I spent? | **`atom.prices.list.en`** | both |
| **S08** | `d3-structural-hole` | After three Atom settlements, is the $19 I spent for 7k given to me again? | **`atom.prices.list.en`** | both |
| **S09** | `d3-structural-hole` | Atom 100k I bought — do I get that $215 the third time you send me funds? | **`atom.prices.list.en`** | both |
| **S12** | `d3-structural-hole` | Do I get the Elite Atom 100k I bought thrown in after three cashouts? | **`atom.prices.list.en`** | both |
| **K03** | `d3-dropped` | Get my money at payout 3 Atom | **`atom.account-status.refuse.en`** | atom-direct only (FAQ EXTRA-on abstains `account-status-boundary`) |

All seven are D3 fee/refund-at-payout **meaning**. None of the S\* asks contain the published Zone A words `fee` / `price` / `cost` / `payment`, nor Zone B `payout` / `withdrawal` / `refund` / `return` / `back` / `reimburse` / `rebate`. They still selected a **sendable** confirmed EN Atom answer (`reason: deterministic-cue`).

`atom.prices.list.en` is a catalog/price-list body. Shipping it to “do I get the $X I spent on the third cashout?” is a D3 fail-closed violation (wrong template; adopts a sendable Atom answer instead of abstain/handoff). The body does not need to assert a refund for this to be a leak.

K03 is the dropped-word form of the same intent. Adapter selects sendable account-status refuse (`my` … `payout` personal-status cue). V12 FAQ `accountStatusAsk` abstains first, so the Extra-on customer path is safer here — but the Atom adapter still emits a sendable `atom.*` id.

**Zero leaks** on: P01–P10 (prior v4 synonyms), A01–A08 (no-Zone-A with explicit `payout` — those **abstain** `no-exact-approved-answer`), B01–B08, mixed X\*, allow-list bait T\*, injection I\*, account-mix C\*, D1–D2 (fail-closed / abstain), D4 (hedge, no live-SKU invent), D5 (EN fallback only), D6 (bundles, no guarantee language).

---

## 4. Root cause (FAIL)

The candidate’s “structural” gate is still **lexical A ∩ B**, then a **positive price allow-list** that treats catalog dollar/size tokens as “pure price” whenever Zone B is absent.

Evidence in `candidate/atomAnswerSelect.js` (`dd3b9f79…`):

1. `isAtomFeePolicyRiskAsk` returns false unless `hasAtomFeeMoneyTerm` (Zone A word list: `fee`/`price`/`cost`/`payment`/`charge`/… plus a few script forms). **`$289` / `$215` / `$19` / `100k` / `7k` / “I paid” / “I spent” / “I bought” / “put down” are not Zone A.**
2. Zone B is `hasAtomPayoutContext` (`payout`/`withdrawal`/`saque`/…) **or** `hasAtomMoneyRecoveryContext` (stems: `refund*`/`return*`/`back`/`reimburs*`/`rebate*`/`compensat*`/`recover*`/`credit back`/…). **“get paid”, “cashout”, “come to me”, “give me my money”, “given to me again”, “thrown in” are not Zone B.**
3. Early abstain (`atom-fee-policy-owner-decision`) therefore **does not run** on S01/S03/S06/S08/S09/S12.
4. `isAllowlistedPurePriceAsk` is **true** when those dollar/size tokens appear **and** Zone B is false. The `atom.prices.list.en` selector (conf 0.93) then fires.

That is why A01 (`$215` + “come **back** to me” + “payout #3”) **abstains** (Zone B present → price allow-list disabled → no other selector), while S01 (`$289` + “come **to me**” + “third time I get **paid**”) **sends the price list**.

K03: no Zone A → fee gate off; `accountStatusAsk` matches `\bmy\b.{0,40}\bpayout\b` in “Get **my** money at **payout** 3 Atom” → sendable `atom.account-status.refuse.en`.

**Character of the defect:** same class as v4 (`cd2d81a8` §15.5) — a larger lexicon, still not intent-complete. Deny-by-default is implemented as “unknown A∩B tokens → maybe fall through to another sendable selector,” not “unknown fee-recovery-at-payout meaning → abstain.”

This reviewer did **not** patch the candidate.

---

## 5. False abstains (separate; not the FAIL)

On 45 genuine general negatives (EXTRA-on FAQ path): **37 selected sendable Atom ids, 8 abstained** (`no-exact-approved-answer` — **not** `atom-fee-policy-owner-decision`).

| ID | Ask | Note |
|---|---|---|
| G15 | What is default Atom leverage? | no 1-Step/2-Step cue |
| G21 | Atom news trading allowed in challenge? | no 1-Step/2-Step cue |
| G22 | Are EAs allowed on Atom? | `ea`/`expert advisor` cue miss |
| G23 | Atom funded profitable days requirement? | no 1-Step cue |
| G25 | Is Atom 1-Step still 10%? | obsolete-10 selector also wants target/profit/pass/phase |
| G29 | What is Atom 2-Step daily 3%? | “daily 3%” misses daily-loss cue |
| G33 | When can I request Atom payout after the first one? | **payouts.general allow-list too narrow** |
| G41 | How often are Atom payouts after the first? | same allow-list gap |

G07–G09 (author-shaped first-payout / 3%+1.5% / “payout rules”) still select `atom.payouts.general.en`. Allow-list-only payouts is working as designed for those phrases and over-abstains on nearby customer phrasing. Coverage gap, not a sendable leak.

A few multilingual D3 asks (`L03`/`L04`/`L06`) abstained `not-atom-scope` because the product name is only in native script (أتوم / एटम) without Latin `atom`. Fail-closed; not counted as leaks.

---

## 6. D1–D6 / R03 / R10 / R13 / controls

| ID | Behavior on this sealed set | Silently adopted? |
|---|---|---|
| D1 equality 50% | abstain or non-sendable fail-closed | **No** |
| D2 news minutes | non-sendable fail-closed | **No** |
| **D3 fee refund** | **S\* / K03 sendable leaks (§3)** | **Must not ship; FAIL** |
| D4 checkout SKU | prices / obsolete-5k-10k / checkout hedge; no “SKU live” invent | **No** |
| D5 translations | EN confirmed fallback only | **No** |
| D6 stacking | `atom.bundles.en`; no guarantee language | **No** |

| ID | Actual | Classification |
|---|---|---|
| R03 | select `atom.1step.phases.en` (8%, not 10%) | **acceptable content** |
| R10 | abstain `no-exact-approved-answer` | **SAFE ABSTENTION** (Urdu account-status coverage) |
| R13 | select `atom.prices.list.en`; body says promotional **$161 is not a list price** | **acceptable content** (misses obsolete-161 because the ask says “one hundred sixty one”, not `161`) |

STOP / aiOff / fin-wait / protected-team (Atom 2-Step daily-loss probe): **abstain with the matching reason** on atom-direct, EXTRA-on, and EXTRA-off.

---

## 7. Suite results (paired against live baseline)

Live `/home/ubuntu` does not ship every selftest file at repo root (131 vs 137). Paired full suite used staging **baseline** (index.js **identical** to live `1b8de524…`) vs candidate EXTRA off / on. Reopen was also run with `CODE_UNDER_TEST=/home/ubuntu` against live `index.js`.

| Suite | Result | Notes |
|---|---|---|
| Atom author selftest | **39/39 PASS** | includes author structural D3 + allow-list + flag-off |
| Sealed v6 `0a5d2840…` | **7 unique D3 sendable leaks** | FAIL gate |
| Flag-off vs live (30 q) | **mismatchUnset=0, mismatch0=0** | |
| Reopen heldout | **10/10** live-code = cand | fixture silence holds |
| Reopen human-ownership | **36/36** live-code = cand | fixture `215476300195795` silent |
| V12 author EXTRA off | **26/32** | teammate-helper OOS (`teammate-reply-check-unavailable` family) — unchanged class |
| V12 author EXTRA on | **25/32** | + `C1-pending-ids-not-in-sendable-allowlist` (Atom provisional in `listPending()`; still non-sendable) |
| STOP mention parse | **21/21** live-code = cand | |
| Fin-wait | **9/9** live = cand | |
| Auto-note / Risk-Esc ownership | **34/34** live-code = cand | |
| Escalate-ack | **PASS** live = cand | |
| Teammate-topic ownership | **45/45** live = cand | |
| MT5 live guard `2158c43f…` | **expected fail** (`authorizedSourceHashes` missing) | containment |
| MT5 candidate guard | **ALL_PASS v2** | |
| Full suite baseline | **130/137** (failed=7 shared) | |
| Full suite cand EXTRA off | **130/137** (failed=7) | |
| Full suite cand EXTRA on | **130/137** (failed=7) | |
| **`only_candidate`** | **`[]`** | no candidate-only regressions |

Shared durable fails (all three trees): knowledge-sync, account-provenance, contextual-episode, escalation-identity-deadlock, final5, handoff-claim-action-binding, lock-harden.

---

## 8. Hashes

| Artifact | sha256 |
|---|---|
| Author fix2 report | `c2d9f0129b506f99cf4185230bc85172ccdc8c573b5961ad31dfccef69e1df1f` |
| Prior independent review v4 | `cd2d81a8c39027d3d5b9b572ed160b379fed2e23b13da20931ef1b75d18a3e99` |
| Sealed v6 cases | `0a5d28401033ff826bd0d9be966b111eada270c07c8296e892815bd8cf9bb237` |
| Candidate `atomAnswerSelect.js` | `dd3b9f79c002a8c04ba8298aab5eca3ba6f187c86a0e23dcf89fa60041d9473f` |
| Candidate `faqAnswerSelect.js` | `fc752a472bd691713127b7fafdd40dba98eb669ae777a5578a1085484a070deb` |
| Candidate `faqApprovedAnswers.js` | `2e0e0cfa40938805551e717e54ff3327c2e7818ed46287ab1a0480c13642a865` |
| Candidate / live `index.js` | `1b8de524924c845c33dd995ad2e3a25dd417ee46a9f8f8e340c59672bd55c473` |
| Live `spreadPublicGuard.js` | `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c` |
| Full-suite delta | `independent-review/v12-rebase-fix2-indep/artifacts/suites/full-delta.json` |

Review copies:  
`/home/ubuntu/docs/closure-20261017/elite-atom/independent-review/v12-rebase-fix2-indep/`

---

## 9. Verdict

# FAIL

Do **not** build / install / promote this second-and-final structural attempt.

**Blocking:** fee/refund-at-payout meaning that avoids Zone A and Zone B **tokens** still selects sendable `atom.prices.list.en` (S01, S03, S06, S08, S09, S12) or sendable `atom.account-status.refuse.en` (K03 atom-direct). Root cause is lexical A∩B + dollar/size price allow-list, not deny-by-default on intent.

**Cleared vs v4:** prior synonym list; flag-off parity; Extra-off live select identity; suite `only_candidate=[]`; reopen 10/10 + 36/36; STOP/aiOff/Fin-wait/Risk-Esc silence; author 39/39.

**Production:** untouched (index `1b8de524…`, 0 live `atom.*`, EXTRA unset, PM2 pid 290068 unchanged). Candidate not patched by this reviewer.
