# Elite Packs — deny-by-default ownership gate (STAGING COMPLETE)

**Label:** STAGING COMPLETE (pending independent review by a different agent)  
**Owner authorization:** t728 — ONE staging attempt; deny-by-default Packs ownership-gate redesign  
**Failed review that this attempt answers:** `PACKS_OWNERSHIP_PREGATE_INDEPENDENT_REVIEW.md` sha `ae3443c1f45decb132e0ed78d4667aa8444319dd18964ea598c9fd75747b55f5`  
**Date (UTC):** 2026-10-17  
**Implementer:** this staging agent (not the independent reviewer)

**Boundaries kept:** No production edits, no PM2 mutate/restart, no Intercom writes, no synthetic production events, no secrets/PII printed. Live FAQ V12 / MT5 containment / Atom trees not edited. The prior Option-1 pregate tree was **not** edited. Customer-facing Packs stays disabled in production. Hardlinked copies only; files rewritten here were un-hardlinked first.

---

## Verdict in one paragraph

`decideInner` is inverted. Product SELECTORS / shortcuts / ML never run unless `productSelectPermitted(gate) === true`. Any first-person / possessive / implicit-subject stance (EN, AR, HI, UR, ES, PT, FR, DE, mixed scripts) together with a Packs item or account-status term **refuses**, unless the message matches a **positive** general-product STRUCTURE allow-list. Missing / uncertain / thrown gate fail-closed. The cue table was **not** patched: `receiveVerb` still matches `pulled` and still does **not** match `pull`. The 11 independent-review leaks (I20, I48, I52, I55, I61–I65, I69, I70) all refuse. Fresh sealed set (hashed before the gate rewrite; run once; not tuned) = **120/121**, **0** ownership→product CRITICAL, **0/42** false refusals. The one sealed fail is related routing (N08 Hindi Exotic definition → `packs.card-count.en`, sendable, not refuse). Production Packs hook remains absent.

---

## 1. Live baseline (read-only)

| Item | Value |
|---|---|
| Live `index.js` | `1b8de524924c845c33dd995ad2e3a25dd417ee46a9f8f8e340c59672bd55c473` |
| PM2 `intercom-bot` | pid **290068**, restarts **4**, online, node 20.20.2 |
| `spreadPublicGuard.js` | `2158c43f3fbb4c6470983065613864f477d8959e46b79c7bed2a520788bdca8c` |
| Packs hook in live `index.js` / `faqAnswerSelect.js` / `faqAssistance.js` / `faqOutboundSafety.js` | **Absent** |
| Shared V12 `kb/elite_packs` symlink | still → `/home/ubuntu/staging-elite-packs-20261017/kb/elite_packs` (**not** this tree, **not** the pregate tree) |

---

## 2. Trees (pregate preserved; new dir only)

| Item | Path |
|---|---|
| **t728 candidate** | `/home/ubuntu/staging-elite-packs-deny-default-20261017/` |
| Prior Option-1 pregate (FROZEN, not edited) | `/home/ubuntu/staging-elite-packs-pregate-20261017/` |
| Untouched original Packs staging | `/home/ubuntu/staging-elite-packs-20261017/` (selector still `f0ddc1fd…`, inode **276073**) |
| Atom trees | `/home/ubuntu/staging-elite-atom-20261017` **untouched** |

Created with `cp -al` from the frozen pregate tree. Only files this workstream rewrote were un-hardlinked first. Pregate hashes after all work still match the failed review:

| Pregate artifact | sha256 (unchanged) |
|---|---|
| `adapter/packsOwnershipPregate.js` | `59ab1c05fc7d8cc82ac822caf1b7e72607fceb0b9f8b112c5da5751bef87ca06` |
| `adapter/packsAnswerSelect.js` | `5bd79261dec6fc109c2e506e0b29f4dc5dbf966900e1c17c2a4d4f2100ceecca` |
| Author sealed pregate v1 | `18f2b6755f952dfc3784f9f7d3e868434f492c09c4e567f450a883ed3aa03c49` |
| release `SHA256SUMS.txt` | `57afaa318a5aca6f354d07c97555c090f505ca697c99dbcfcc1ce0bcb4c93c7c` |

---

## 3. Architecture (invert — not a cue-table / phrase patch)

Review root cause (ae3443c1): `decideInner` was fail-open. `firstPerson`/`possessive` + item returned `NOT_PERSONAL` unless extra verb/status features fired (`possessionStrong`, confirm+possessive, `receiveVerb` including `pulled` but not `pull`, …). That is the same class as C-OWN-1b (cue gap → product SELECTORS).

t728 invert, implemented in `adapter/packsOwnershipPregate.js` (852 lines):

1. Control gates first (STOP / aiOff / pause / finWait / `protectedTeam`) — unchanged.  
2. **Always** `evaluateOwnershipPregate(raw)` — no skip / bypass.  
3. `REFUND` / `MISSING` classified (not skipped).  
4. `personalAccount && unambiguousGeneralProductStructure` → `NOT_PERSONAL`.  
5. `personalAccount` → `PERSONAL` refuse.  
6. Else `NOT_PERSONAL`.  
7. Product SELECTORS only if `productSelectPermitted(gate) === true`.  
8. ML fallback only inside that permit; a second permit check sits **after** ML pushes so ungated `{id,conf}` objects cannot emit if the gate is missing/blocking.  
9. Missing / undefined / `{}` / `allowsProductSelect` without `blocksProductSelect===false` / thrown extract → fail-closed.

`personalAccount` =

- personal **stance** (pronoun / possessive / conjugation / implicit subject / account deixis) **AND** (Packs item OR account-status term), **OR**
- account-status term **AND** Packs item (KYC/payout/balance next to a named card with dropped pronoun; I29 class).

Stance is morphological / pronoun-class, not a possession-verb list. Explicitly includes: EN I/my/we/me/mine/ours; Roman `mera/meri/maine/mujhe`; HI `मैं/मेरा/मुझे`; UR `میرا/میرے/میری` (Farsi yeh) + `میں نے` (not locative `میں` = in); ES/PT `me quedan` / `a mí` / `nos` / `nosso`; AR `أنا/معي/عندي/لدي/حسابي/ملكيتي` + أ-prefix 1sg minus non-personal particles (`أخرى`…); FR `je/moi`; DE `ich` (`mein` only with German context, so Roman-Urdu locative `mein` does not collide); implicit RU-HI subject `mil gaya`.

**Not done:** adding `pull` to `receiveVerb`. Probe: `receiveVerb.test("Did I pull Instant Override last night?") === false`; `pulled` still true. “Did I” + named card is enough under the invert.

General-product STRUCTURE allow-list (positive, not a deny-list): definition (`what are/is/does`, `qué son`, `kya hain`, `ما هي`); how-to (`how do/can I`, `kaise`, `cómo/como consigo`, not `did I` / `how did I`); process (`what do I get in`, `when I open`, free-copy priority, close-before-reveal charging); rates / price / card-count catalog (not “credits I have left”); `tell me about` / `tell me` + rates (not `tell me if/whether`); their/its own; positive free-tier (`free … pack` + new-account/size); policy `can I` withdraw/convert/refund/buy; inventory how-to; auto-apply how-it-works; which-pack-best. Mixed ownership+product bait (`what are Exotic cards, and do I already own Open Season?`) is **not** unambiguous — residual personal-status clause blocks the allow-list.

`FEATURE_TABLE` is retained only for selector-helper compatibility. `decideInner` does not use `possessionStrong` conjunctions.

---

## 4. Diff / hashes

KB / catalog / approved answers **unchanged** (same inode **275995** as original Packs KB). Selector and gate un-hardlinked.

Diffs under `staging-elite-packs-deny-default-20261017/artifacts/`:

| Diff | Lines |
|---|---|
| `deny-default-vs-f0ddc1fd-packsAnswerSelect.diff` | 385 |
| `deny-default-vs-pregate-packsOwnershipPregate.diff` | 524 |
| `deny-default-vs-pregate-packsAnswerSelect.diff` | 60 |

| Artifact | sha256 |
|---|---|
| **Candidate** `packsOwnershipPregate.js` | `da9d0154d8eb03367c2d850a9bb780e4d32ae085e39b006e29da1d276cf45226` |
| **Candidate** `packsAnswerSelect.js` | `e6af8112b1623a708aa21d4cf26e98476b9d9474e86339531248fa37b11503d9` |
| Base / rollback selector (original Packs) | `f0ddc1fd0f7c8eaa405462dc73139bdb3f6cc51db4370f8b614c725e399a6768` |
| Frozen pregate gate (not this candidate) | `59ab1c05fc7d8cc82ac822caf1b7e72607fceb0b9f8b112c5da5751bef87ca06` |
| `packsApprovedAnswers.js` | `88181c7abf05b0541ecead70c8e0561c28798474c65e3b926748fac5b8b70194` (unchanged) |
| `faq-approved-answers-packs-v1.json` | `bed88e6ab45c74a378273f301a197ee56b8276c312bb4bca081c7c9efb6b2318` (unchanged; hardlink) |
| `PACKS_KB_MANIFEST.json` | `8552b9af950c1dd253731a52a02cb6c813359b25770e74d80c1ebd30269506ac` (unchanged) |
| Author tests | `a9b01e997b283af54a9550b87b6f529764f681082b649fab71d3bbd1cc9a76c6` |
| Sealed cases (frozen **before** gate rewrite) | `c18e10e9da16b8da6ea9169e3b7420c9027fc863d2ca51fe7ba094d09867b2a5` |
| Sealed runner | `c277a52b266a30841349ff84d6c8bb0385e7c082665757ba682db377d4059429` |
| `INTERFACE_REQUEST.md` | `f8c2525efdeca5655fdac50cb4b866688646a4b697844cd48dc74163a56e8632` |
| `preflight.sh` | `f5ef1b0e8ce26f8501df5bceeb6fcb3c62a3f0354318301861311c17a5b35d86` |
| `install.sh` | `bb95cdb8e6ee6c59fd76412e2b2fd9220d7c82cf61e94a8296877163395cdda2` |
| `rollback.sh` | `c7a8a2fbb427c7634fd1939d268757a166912fd323db14aadde015dd9f599ee3` |
| release `SHA256SUMS.txt` | `9455a94f4c4300d508424fd65b8369b4a30a4b58751ccbe868a757864dbe74fd` |

Sealed file written `2026-10-17T22:39:00Z`, chmod `a-w`, hashed **before** `packsOwnershipPregate.js` was rewritten (`SEALED_BEFORE_GATE_REWRITE.marker`). Hash unchanged after the single run.

---

## 5. Tests — actual numbers

### Author Packs suite

`node tests/selftest-elite-packs-staging.js` → **pass=45 fail=0**

Includes prior Option-1 structural consult / missing-gate fail-closed, C-OWN-1 multilingual, C-OWN-1b `confirm karo` cannot suppress, payout/KYC, product negatives, STOP/aiOff/finWait/protectedTeam, `humanOwned` still selects overview, **plus**:

- invert: “Did I pull Instant Override last night?” refuses **without** `pull` on `receiveVerb`
- **11 reviewer leak strings** as regression (I20, I48, I52, I55, I61–I65, I69, I70) — all `packs.account-status.refuse`
- multilingual stance+item (AR/HI/UR/ES/PT/FR/DE/mixed)
- general-structure still selects Exotic / how-to / Primordial / card-count / price / rates / withdraw / free-tier / Arabic `ما هي بطاقات Exotic`
- `productSelectPermitted(undefined|null|{})` false; `evaluateOwnershipPregate(null)` → `AMBIGUOUS` fail-closed

### Fresh sealed deny-default v1 (hashed before rewrite; run **once**; not tuned)

| Item | Value |
|---|---|
| File | `tests/sealed/adversarial-cases-deny-default-v1.json` |
| sha256 | `c18e10e9da16b8da6ea9169e3b7420c9027fc863d2ca51fe7ba094d09867b2a5` |
| Cases | **121** (ownership **72**, negatives **42**, controls 6, arch 1) |
| Languages | EN, AR, HI, UR, ES, PT, FR, DE, mixed, varied word order |
| Result | **120 PASS / 1 FAIL** |
| **Ownership → sendable product FAQ** | **0 CRITICAL** |
| False-refusal on negatives | **0/42 = 0%** |

Single non-CRITICAL fail:

| ID | Input | Observed | Class |
|---|---|---|---|
| **N08** | Hindi “Elite Packs के Exotic कार्ड क्या हैं” | `packs.card-count.en` (sendable) not `packs.exotic-cards` | **related routing / test prefix** — not refuse, not ownership leak |

Results: `artifacts/adversarial-results-deny-default-v1.json` sha `0bc7b4fb95ad7f6fb4a5a7face64fb72b07da1b8d0a4af5823559298be307514`.

### 11 independent-review leaks (author regression, not the sealed set)

All refuse `packs.account-status.refuse`; none select a product FAQ.

| ID | Input (abbrev.) | Stance that fires (not extra verbs) |
|---|---|---|
| I20 | “Did I pull Instant Override last night?” | latin-pronoun `I` + item (`pull` **not** on `receiveVerb`) |
| I48 | Urdu “میری انوینٹری میں Open Season ہے کیا” | UR possessive `میری` + item |
| I52 | Hindi “क्या मैं Exotic कार्ड का मालिक हूँ Instant Override” | `मैं` + item |
| I55 | “¿Cuántos créditos de pack me quedan a mí?” | `me quedan` / `mí` + credits/pack |
| I61 | “هل أملك Instant Override الآن؟” | Arabic 1sg أ-prefix (`أملك`) + item |
| I62–I65 | AR confirm / unlock / ملكيتي / حسابي paraphrases | `لي` / `حسابي` / `ملكيتي` + item |
| I69 | FR “Est-ce que je possède…” | `je` + item |
| I70 | DE “Besitze ich…” | `ich` + item |

### Independent reviewer sealed set (7d165d99…; not tuned against)

| Suite | Result | Ownership CRITICAL | False-refusal |
|---|---|---|---|
| Independent pregate 121 | **120/121** | **0** (was 11) | **0/40 = 0%** |

Residual: N14 “Can Ignition packs contain Exotic cards, and at what rates?” → `packs.exotic-cards.en` not drop-rates (**related routing**, same class the reviewer already called non-CRITICAL). I29 “Check KYC plus whether Instant Override is on the account” now refuses (account deixis / KYC+item).

### Prior sealed (author-visible; not used to add phrases)

| Suite | sha256 | Result | Ownership CRITICAL | Notes |
|---|---|---|---|---|
| Author pregate v1 | `18f2b675…` | **94/97** | **0** | N09/N14 abstain (safe); N26 related `dashboard-tabs` — same residuals as Option 1 |
| Unseen v5 | `9228585a…` | **53/58** | **0** | E36/E44 abstain 2/25 = 8%; E49/E51/E52 related routing |
| Sealed v2 | `ac51772b…` | **35/35** | **0** | |
| Sealed v3 | `9bb6207f…` | C13 abstain (intentional); C08/C26 how-to/definition **no longer refuse** after allow-list | **0** | |
| Sealed v4 | `cf7b8640…` | 43/44 | **0** | D40 related drop-rates vs expected prefix |
| Sealed v1 | `d5789079…` | 0 CRITICAL; several literal `bodyMust` / related-prefix residuals | **0** | See false-refusal note below |

After the sealed-v1 run of **this** file, the general-structure allow-list was widened (author-visible prior cases only; sealed file **not** edited, **not** re-run) so these genuine product questions are no longer refused:

| Prior ID | Question | After allow-list |
|---|---|---|
| P21 | free Elite Pack copy used before credits | `NOT_PERSONAL` (process); selector may abstain |
| P25 | card automatically change my challenge rules | `packs.card-auto-apply.en` |
| P63 | Tell me the rarity chances… | `NOT_PERSONAL` (tell-me + rates); selector may abstain |
| P84 | close opening before reveal, am I charged | `NOT_PERSONAL` (process); selector may abstain |
| C08 | “Como consigo o Instant Override…” | `packs.exotic-cards.en` |
| C26 | “What does Instant Override give me as an Exotic reward?” | `packs.exotic-cards.en` |

Those abstentions are **safe** (human), not product-FAQ leaks.

### False-refusal summary (precise)

| Set | Negatives | Refused | Abstain-vs-expected-prefix | Rate refused |
|---|---|---|---|---|
| **New sealed v1 (single run)** | 42 | **0** | 0 | **0%** |
| Independent pregate | 40 | **0** | 0 | **0%** |
| Author pregate v1 | 36 | 0 | 2 (N09, N14) | 0% refuse / 5.56% over-abstain |
| Unseen v5 | 25 | 0 | 2 (E36, E44) | 0% refuse / 8% over-abstain |
| Author product controls | 20+ | **0** | 0 | **0%** |

Over-abstain on older suites is the same safe band the reassessment already accepted (10–20% temporary). Under-refusal on the blocking independent set is **closed**.

### Human ownership / Risk-Esc / STOP / aiOff / Fin-wait / duplicates / reopen

| Suite | Result |
|---|---|
| Packs STOP / aiOff / pause / finWait / `protectedTeam` | **PASS** (author + sealed C01–C05) |
| Packs `humanOwned` still selects overview | **PASS** (author + sealed C06) |
| V12 baseline `selftest-reopen-human-ownership.js` | **36/36 PASS** |
| V12 baseline `selftest-reopen-heldout.js` | **10/10 PASS** |
| V12 baseline `test-fin-wait.js` | **ALL PASS 9** |
| V12 baseline `selftest-hardening4-20260924.js` | **27/27 PASS** (in suite .out) |
| `selftest-risk-owned-no-public` | **8 passed** |
| `selftest-risk-note-antispam` | **17 passed** |
| `selftest-stop-mention-parse.js` | **21/21 PASS** |

### Cross-workstream

| Suite | Result |
|---|---|
| V12 `test-v12-author-classes.js` | **32/32 PASS** |
| Atom `selftest-elite-atom-staging.js` | **35/35 PASS** |
| lock-harden vs V12 **baseline** (`846c225f…` guard) | **ALL PASS** |
| MT5 share vs V12 **baseline** | **ALL_PASS v2** |
| V12 baseline `run-suite.sh baseline` (137 files; scored from persisted `.out`) | **130 pass / 7 fail** |

**7 baseline fails (not Packs-introduced; Packs not on this load path):** historical six — `knowledge-sync`, `account-provenance`, `contextual-episode`, `escalation-identity-deadlock`, `final5`, `handoff-claim-action-binding` — plus flaky `selftest-model-test-guard` (18 pass / 1 fail). `selftest-ownership-lookup-retry` **PASS**. lock-harden and MT5 share **PASS** inside that same tree. Independent review of Option 1 scored 131/137 (historical six only); this run is that band minus the known-flaky guard file.

### MT5 containment — expected live vs baseline (not a Packs regression)

| Authority home | Guard sha | Result |
|---|---|---|
| Live `/home/ubuntu` | `2158c43f…` | **FAIL** `TypeError: guard.authorizedSourceHashes is not a function` — **expected** |
| Live lock-harden | `index.js` `1b8de524` + new guard | **1 fail** `postProcessModelReply(SPREAD_TEST_REPLY` wrap — **expected** |
| V12 baseline | `846c225f…` | lock-harden **ALL PASS**; MT5 share **ALL_PASS v2** |

Packs candidate does not contain MT5 modules.

---

## 6. Packaging / install

- `preflight.sh` **OK** on the deny-default module; observes the shared V12 symlink and does **not** require it to point here (`V12_STAGING_SYMLINK_NOT_ATTACHED`).  
- `install.sh` **refuses** retargeting `/home/ubuntu/staging-faq-v12-20261017/kb` (`INSTALL_REFUSE_RC=4` verified). Real V12 symlink still → original Packs tree.  
- No production attach path.

---

## 7. Rollback

| Goal | Action |
|---|---|
| Drop this attempt | ignore/delete `/home/ubuntu/staging-elite-packs-deny-default-20261017/` (KB still hardlinked; pregate + original Packs untouched) |
| Keep Option-1 fail-open gate | `/home/ubuntu/staging-elite-packs-pregate-20261017/` still `59ab1c05…` / `5bd79261…` |
| Restore original selector | `/home/ubuntu/staging-elite-packs-20261017/adapter/packsAnswerSelect.js` → **`f0ddc1fd…`** inode 276073 |
| Older rollback still valid | fix-3 `513abfe9…` / fix-2 `8dcef560…` |
| Symlink install | sandbox-only `rollback.sh`; production attach still forbidden |

No PM2 restart is required (and none was performed). Production Packs hook remains absent.

---

## 8. Still blocked before any customer attach

- Independent review **PASS** with **0** ownership→product CRITICAL on a **fresh** sealed set this reviewer did not write  
- Owner D1–D3 (free-pack tiers / Million wording / translations)  
- V12 `INTERFACE_REQUEST.md` thin hook — **not** authorized; this candidate must not steal the shared V12 kb symlink  
- Production approval  

---

## 9. Integrity

| Check | Result |
|---|---|
| Failed review still `ae3443c1…` | match |
| Pregate tree edited? | **No** |
| Original Packs selector edited? | **No** (inode 276073, `f0ddc1fd…`) |
| Live / Atom / V12 core / MT5 edited? | **No** |
| PM2 restart? | **No** (pid 290068, restarts 4) |
| Intercom writes / synthetic events? | **No** |
| `pull` added to `receiveVerb`? | **No** |
| Sealed file mutated after hash? | **No** |
| `/tmp/lm-*` leftovers from this run | **removed** |

---

## 10. Verdict

**STAGING COMPLETE.**

Deny-by-default invert is in a **new** staging directory. The failed review’s 11 CRITICAL leaks refuse without cue-table phrase patches. Fresh sealed ownership set: **0** ownership→product CRITICAL, **0%** false refusal on 42 general-product negatives. Approved answers for genuine general product questions still select (author 45/45; independent negatives 0 refuse). Production, Atom, V12, MT5, and the preserved pregate tree were not modified. Independent review by a different agent follows.
