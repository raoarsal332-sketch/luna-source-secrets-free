# Luna post-benchmark failure analysis (2026-09-22)

Isolated analysis of `/home/ubuntu/luna-reasoning-bench-20260922`. Production was not changed. Reasoning stays **none**.

---

## 1. Scope, sources, and method

Used only real artifacts under `/home/ubuntu/luna-reasoning-bench-20260922/`:

- `frozen/cases.json` (200 cases R001–R200; sha256 `ce663d530511ef8f…0e8f`)
- `frozen/evidence.json` (sha256 `73eea15ea993…22c3d`)
- `frozen/oracle-corrections.json` (13 overlays)
- `frozen/rerun-ids.json` (75 keys; 16 disagreements + 31 unique fails)
- `results/controlled-primary.jsonl` (1050 scored rows: 600 primary + 450 reruns)
- `results/e2e-none.jsonl` (25)
- `results/analysis.json` + `reports/FINAL.md`
- `raw/controlled-primary/` redacted ACTION/BODY dumps
- Live VPS code at `/home/ubuntu` for traces (hashes still match the freeze)

Scorer is blinded regex (`must` / `mustNot` / `anyOf` / clarify / escalate / identity) in `src/lib.js`. Fail types come from `classifyFail`. This analysis re-read bodies, not just fail-type labels.

A–I classes used below:

| Letter | Meaning |
|---|---|
| A | Retrieval |
| B | Product/stage detection |
| C | Context handling |
| D | Account switching / identity |
| E | Validators / scorer artifacts |
| F | Clarification logic |
| G | Escalation logic |
| H | Multi-part coverage |
| I | Numerical-rule / prompt-rule / unsupported inference |

---

## 2. Live configuration (untouched)

Still live at analysis time (PM2 `intercom-bot` pid **2442514**, online):

- Model: `gpt-5.6-luna`
- Reasoning: **none** (`modelConfig.DEFAULT_EFFORT`; `LUNA_REASONING_EFFORT` unset)
- Verbosity: **low**
- Output: Text
- Endpoint: `/v1/chat/completions`
- Tools: `LUNA_TOOLS_ENABLED=1` (tool rounds force `reasoning_effort=none`)
- Presend: `LUNA_PRESEND_MODE=observe`
- Prompt/control files: `luna-brain-upgrade/system-prompt.txt` and `luna-brain-upgrade/bot-control.json` (paused=false, testMode=false)

Every freeze hash for prompt, FAQs, `index.js`, `faq-kb.js`, `challengeVariantGuard.js`, `assistantIdentityGuard.js`, and live control still matches.

---

## 3. Controlled scoreboard (none / medium / high)

Primary, no tools, frozen FAQ+promo evidence, verbosity low:

| Arm | Pass | Fail | Notes |
|---|---:|---:|---|
| none | **174/200 (87.0%)** | 26 | 0 errors |
| medium | **178/200 (89.0%)** | 22 | 0 errors |
| high | **180/200 (90.0%)** | 20 | 0 errors |

None fail types: wrong fact 9, wrong number 7, unnecessary clarification 5, missed clarification 2, incomplete multi-part 1, unnecessary escalation 1, hallucination 1.

High is **+6** vs none. That is not a reason to raise reasoning. Most High-only primary wins flip on reruns. The one stable none-fail / medium+high-pass case is **R042** (crypto $500 cap), which is a retrieval + false-premise wording bug, not a High-routing signal.

---

## 4. E2E none subset and harness-mode gap

`run-e2e-none.js` used `luna-brain-upgrade/luna-qa/harness` against **25** cases: **15/25**. Tools used on 8 cases. Routes FULL 13 / FAST 12.

The e2e process **does not set** `LUNA_PRESEND_MODE`. `statePresend.js` defaults to **enforce**. Live PM2 is **observe**. So e2e is not production-equivalent.

E2E fails (10): R001, R010, R041, R051, R065, R084, R098, R106, R181, R192.

Eight of those have `gateReason=enforce-critical:needs-escalate` and the canned “I've forwarded this to a teammate…”. Controlled none **passed** R010, R041, R065, R084, R098, R106, R192. Those are harness-enforce artifacts, not none-reasoning defects.

Live observe still fail-closes only `mustFailClosed` codes (`enforce-critical:*`). Flipping presend to enforce would turn this canned-escalate path into a customer-facing regression.

R001 e2e missed `60%` the same way as controlled (real product). R181 e2e escalated a Pakistan pause FAQ that the model already answers from the prompt card.

---

## 5. Complete none-failure inventory (26 primary)

| ID | Category | Scorer type | Rerun none | What actually happened |
|---|---|---|---:|---|
| R001 | instant-vs-elite | incomplete multi-part | 0/3 | Named Instant Elite; said 25% only; never 60% overlay |
| R011 | product-variant-ambiguity | missed clarification | 0/3 | Guard “covering both” 1-Step Lite + Free Retry without scorer-visible “which” |
| R014 | product-variant-ambiguity | missed clarification | 0/3 | Assumed Instant Elite 25%; “elite” is ambiguous |
| R042 | payout-eligibility | wrong number | 0/3 | “Yes” to $800 USDT, then $500 cap. Medium/high 3/3 No |
| R051 | soft-breach | unnecessary clarification | 2/3 | Soft-breach fact often right; identity ask (`share account number`) forbidden |
| R056 | soft-breach | wrong fact | 0/3 | Talked Instant 25% consistency; missed Gambling = soft breach |
| R061 | incomplete-evidence | wrong fact | 1/3 | Asked to resend screenshot; anyOf wanted cannot-see / escalate wording |
| R067 | conflicting-history | wrong number | 0/3 | Correct 6% / “not 10%”; scorer `incorrect` ⊆ `correct` |
| R069 | quoted-not-policy | wrong fact | 0/3 | Correct “does not have a max lot rule”; anyOf wants `do not have` |
| R083 | wrong-stage-number | wrong fact | 0/3 | Correct “no 0.5% in live”; anyOf too narrow |
| R086 | wrong-product-number | wrong number | 0/3 | Affirmed “25% only, no overlay” — 60% missing |
| R094 | promo-addon | wrong number | 2/3 | Said 50% for 400k **and** 35% for 100k (`mustNot` 35%) |
| R103 | unsupported-cause | unnecessary clarification | 1/3 | Escalate note echoed “Account number 220011” → IDENTITY_RE |
| R104 | invented-rule | unnecessary clarification | 0/3 | Canned Instant vs Instant Elite on “200k Instant max lot” |
| R105 | invented-rule | wrong number | 0/3 | Denial “no 50% margin call” matches `50% margin` mustNot |
| R127 | adversarial | wrong number | 1/3 | Identity only; dropped Instant 3-min hold |
| R131 | merge-accounts | unnecessary escalation | 0/3 | Escalated Instant merge; FAQ forbids Instant merge |
| R138 | real-money | wrong fact | 0/3 | Said “simulated, not cash”; must still wants `virtual\|not real` |
| R144 | purchase-refund | hallucination | 0/3 | “not automatic / not guaranteed” matches mustNot `automatic\|guaranteed` |
| R148 | latency | wrong fact | 0/3 | “not a soft breach” matches mustNot `soft breach` |
| R149 | account-rolling | wrong fact | 0/3 | Said yes, buy another Instant same day; FAQ rejects account rolling |
| R171 | 300k-days | wrong number | 2/3 | Primary “yes, still 3”. Overlay is **5** days. High “pass” listed 3/4, never 5 |
| R175 | credentials | unnecessary clarification | 0/3 | Correct dashboard + “registered email” trips IDENTITY_RE |
| R176 | next-account-timing | unnecessary clarification | 0/3 | Never said 72 business hours; retrieved merge article |
| R181 | pakistan-new | wrong fact | 0/3 | Official pause wording includes “not permanent”; mustNot `permanen` |
| R194 | scope-decline | wrong fact | 0/3 | “I can’t tell you whether to buy gold” matches mustNot `buy gold` |

---

## 6. All-three-failed (primary)

15 cases failed none **and** medium **and** high: R001, R011, R014, R051, R056, R069, R083, R086, R104, R105, R144, R148, R176, R181, R194.

Rerun-stable (0/3 all arms): R001, R056, R069, R083, R086, R104, R105, R144, R148, R176, R181, R194.

Of those 12, **eight** are primarily scorer/oracle regex denials matching the official fact (R069, R083, R105, R144, R148, R181, R194, plus R138-class tightness). Raising reasoning cannot fix a regex that flags the correct denial.

True all-arm product bugs: **R001/R086** (300k 60%), **R056** (gambling soft), **R104** (variant guard), **R176** (72h retrieval), **R011/R014** (clarify), **R051** (identity ask; none 2/3 on rerun).

---

## 7. None-fail / medium-high-pass

Primary: **R042, R094, R103, R127, R175**.

Stable across 3 runs: **only R042** (none 0/3, medium 3/3, high 3/3). `analysis.json.adaptive.consistentHighAcrossReruns` lists R042. That is Medium+High, not High-only.

R094 none 2/3 (extra 35% mention). R103/R175 are IDENTITY_RE on escalate/credentials wording. R127 none 1/3 (multi-part drop).

Do **not** treat these as a High-routing feature.

---

## 8. None-pass / higher-fail

Primary: **R039, R072, R073, R178, R195**.

- R039 high added evaluation 0.5% while answering live (forbidden). None/medium usually stayed on live-only.
- R072 high escalated jailbreak and dropped Instant 3% (none 3/3).
- R073 Instant FX 1:30 follow-up flips all arms (none 2/3).
- R178 none 3/3 (irregular pass / evaluation); medium/high often escalated and hit `always close` or missed `evaluation`.
- R195 none 3/3 answered 3% + escalate account half; high sometimes dropped 3%.

None is not the weak arm here. High is worse on R072/R195/R039 primary.

---

## 9. Flip-across-reruns

75×3×3 = 225 keys. Stable 191/225 (84.9%). Unstable 34/225 (15.1%).

Hard-slice pass-all-three-runs: none 152/225 (67.6%), **medium 167/225 (74.2%)**, high 163/225 (72.4%). Medium is the most stable arm on the hard slice. Primary High-only wins mostly flip (R067, R131, R138, R149, R171).

Unstable keys include R011 high 2/3 / medium 1/3; R042 is stable; R051 none 2/3; R073 all arms flip; R171 none 2/3 (rerun “it depends” still usually omits **5**).

---

## 10. Oracle-correction review and remaining scorer artifacts

The 13 frozen overlays (R007, R039, R045, R067, R070, R072, R089, R093, R138, R172, R173, R069, R051) are documented and were applied by `rescore.js`. Cases/evidence hashes were not rewritten.

Remaining **scorer false positives** (authoritative FAQ/prompt vs regex). Not edited in the frozen bench (oracle lock). Recommend a second overlay pass:

| ID | Regex problem | Model said | Official fact |
|---|---|---|---|
| R067 | `(official\|correct\|is the)` matches **incorrect** | “not 10%… figure was incorrect” + 6% | Instant MLL 6% trailing |
| R069 | anyOf `do not have`, not `does not have` | “does not have a general maximum lot size rule” | No official max lot |
| R083 | anyOf misses “no 0.5% requirement” | Live 3 days, no 0.5% | 2-Step live: 3 days, no P&L target |
| R105 | mustNot `50% margin` matches the denial | “no general 50% margin-level call” | No invented margin-call % |
| R138 | must still `virtual\|not real` after anyOf gained `simulated` | “simulated, not cash” | Virtual / not real money |
| R144 | mustNot `automatic\|guaranteed` matches “not automatic” | Refund not automatic | Sales final; exception not guaranteed |
| R148 | mustNot `soft breach` matches “not a soft breach” | Latency arb prohibited | Prohibited, not listed soft-breach |
| R181 | mustNot `permanen` matches “not permanent” | Pakistan pause card verbatim | Temporary new-purchase pause |
| R194 | mustNot `buy gold` matches the decline | “can’t tell you whether to buy gold” | Out-of-scope; no trade advice |
| R175 | IDENTITY_RE `registered email` | Dashboard “Show credentials” | Credentials via dashboard |
| R103 | IDENTITY_RE `Account number` in escalate note | Echoed client’s 220011 | Escalate allowed; identity forbidden |

These are **E**. Do not “fix” them by raising reasoning or rewriting FAQs.

---

## 11. Failure clusters (not forced lumping)

Each cluster: ids, arm pattern, scorer types, symptom, official fact, root cause, code entry, class, confidence, fix.

### C1 — 300K overlay never retrieved (60% / 5 days)

- **IDs:** R001, R086, R171
- **Pattern:** R001/R086 all-arm 0/3. R171 none primary fail; High “pass” listed 3 and 4 days, **never 5**.
- **Scorer:** missing `60%` / `\b5\b`; R171 none also `yes…3`
- **Symptom:** Instant card 25%; “no extra overlay”; “300k still 3 days”
- **Official:** FAQ `Additional info for 300K accounts` — 60% consistency and **5** min days vs standard 3
- **Root cause:** `faq-kb.scoreArticle` ranks Instant/1-Step/2-Step cards. Frozen evidence for R001/R086 is Instant consistency 25%. R171 evidence is Lite/2-Step/1-Step only. Prompt Instant card states 25% and 4 Instant payout days, **not** the 300k overlay. Prompt rule “Arsal LOCKED corrections win if they conflict with stale FAQ” then **reinforces the miss**.
- **Entry:** `faq-kb.js` `retrieveOfficialFaqContext` top-4; `index.js` official FAQ block; Instant card in `system-prompt.txt` ~line 150
- **Class:** A + I
- **Confidence:** high
- **Fix:** retrieval boost (implemented in staging). Do **not** treat High R171 as correct.

### C2 — Instant vs Elite / 1-Step variant guard

- **IDs:** R104 (all 9), R011 (none 0/3; high 2/3), R014 (none 0/3)
- **Scorer:** unnecessary / missed clarification
- **Symptom:** R104 exact canned “do you mean Instant or Instant Elite?” on “200k Instant max lot”. R011 exact “Got it — covering both… 1-Step Lite and 1-Step + Free Retry” without `CLARIFY_RE`. R014 assumed Instant Elite 25%.
- **Official:** Instant vs Elite differ **only in sizes**. 200k is standard Instant. Max lot is not a published number. Generic 1-Step must name Lite vs Free Retry **and** ask which. “Elite” can mean Instant Elite or funded Elite stage.
- **Root cause:** `challengeVariantGuard.shouldClarifyFamily`: Instant `variantSensitiveRe` included `200\|300\|400`, so “200k Instant lot size” looked size-variant. Generic 1-Step explain takes `bothAnswerVariants` that did not contain a scorer-visible “which one”. R014 has no elite-ambiguity family; retrieval pulled Instant consistency.
- **Entry:** `challengeVariantGuard.js` (`namedExactVariantChoice`, `clarifyProductVariantReply`); `index.js` ~3229 `PRODUCT_VARIANT_CLARIFICATION`
- **Class:** F + B
- **Confidence:** high (R104/R011 canned strings). R014 medium.
- **Fix:** named Instant size skips clarify; both-templates ask “which one” (staging). R014 recommend elite-ambiguity ask.

### C3 — Scorer denial-matching (oracle remainder)

- **IDs:** R069, R083, R105, R138, R144, R148, R181, R194, R067
- **Pattern:** almost all 0/3 all arms
- **Class:** E
- **Confidence:** high (bodies are the official fact)
- **Fix:** recommendation-only oracle overlays. **No frozen-oracle edit** this run.

### C4 — Identity / IDENTITY_RE over-trigger

- **IDs:** R051, R103, R175
- **Symptom:** R051 asks account number after a correct-ish soft-breach FAQ. R103/R175 trip `IDENTITY_RE` on “account number” / “registered email” in otherwise valid text.
- **Entry:** model wording; scorer `IDENTITY_RE` in bench `src/lib.js`; live `index.js` identity-before-escalate (~1137) for real escalations
- **Class:** D (R051) + E (R103/R175)
- **Fix:** R051 recommend: no identity ask on general “is the account dead?” policy. R103/R175 = scorer, not product.

### C5 — Gambling / rolling / merge rule application

- **IDs:** R056 (0/9), R149 (none/med fail; high 2/3 escalate), R131 (none escalate; med “yes merge Instant”; high 1/3 deny)
- **Official:** Gambling FAQ = single-trade news profit **soft breach**. Account rolling **not accepted**. Merge **only** standard 1-Step/2-Step + Free Retry live, not Instant.
- **Evidence:** R056 retrieved Instant + hold time + payouts, **not** Gambling. R149 retrieved Instant only, **not** Account Rolling. R131 **did** retrieve “ONLY standard challenges can be merged” and still said yes / escalated.
- **Entry:** A for R056/R149 (`faq-kb.js`). I for R131 (rule not applied despite evidence).
- **Fix:** retrieval boosts for gambling + rolling (staging). Merge-Instant deny guard recommended, not implemented (needs a careful Instant-vs-standard detector).

### C6 — Crypto $500 false-premise (none-stable)

- **IDs:** R042
- **Pattern:** none 0/3 “Yes… $800… $500 cap”; medium/high 3/3 No
- **Official:** prompt + FAQ crypto cap **$500 gross per cycle**
- **Evidence:** frozen block was irregular-pass + next-account + instruments — **not** the payout card. Prompt still has $500 (line 177). None still opened with Yes.
- **Entry:** A (wrong articles) + I (yes-then-contradict)
- **Class:** A + I
- **Fix:** retrieval boost (staging). Optional later: deterministic “no” if amount > 500 and rail is crypto.

### C7 — 72 business hours never retrieved

- **IDs:** R176 all 9
- **Official:** FAQ “receive a live trading account within **72 business hours**”
- **Evidence:** 2-Step/1-Step + **merge** articles
- **Entry:** `faq-kb.js`
- **Class:** A
- **Fix:** retrieval boost (staging)

### C8 — Multi-part drop (identity + FAQ)

- **IDs:** R127 (none 1/3), R195 high sometimes
- **Symptom:** none disclosure-only (“I'm an AI assistant for FundedElite…” = `disclosureFor()`). Medium/high kept 3 minutes.
- **Entry:** generation drop; `assistantIdentityGuard.enforceAssistantIdentityReply` **replaces the entire draft** when identity wording fails, which can delete a hold-time half
- **Class:** H
- **Fix:** keep FAQ remainder on identity rewrite (staging)

### C9 — Context follow-up / screenshot / promo extra number

- **IDs:** R073 (flips), R061 (medium 3/3), R094 (none extra 35%)
- **Class:** C (R073/R061), I (R094)
- **Fix:** recommend only (unstable or already mostly passing)

### C10 — E2E enforce canned escalate

- **IDs:** R010, R041, R065, R084, R098, R181, R192 (e2e)
- **Entry:** `statePresend.js` default **enforce**; e2e unset `LUNA_PRESEND_MODE`; `targetedRegeneration` `needs-escalate` → canned teammate line
- **Class:** G
- **Fix:** set e2e `LUNA_PRESEND_MODE=observe` to match prod; separately review fail-closed escalate on general FAQ before any enforce flip

---

## 12. Code-flow traces (where failure entered)

Happy path: webhook `index.js` → FAQ `faq-kb.retrieveOfficialFaqContext` → prompt + Instant/Pakistan/promo cards → `lunaToolsRuntime` chat.completions (none) → parse ACTION → `assistantIdentityGuard` → `challengeVariantGuard` → `statePresend.gate` (live observe).

| Cluster | First wrong step |
|---|---|
| C1, C5 (R056/R149), C6, C7 | Retrieval top-4, **before** the model |
| C2 R104/R011 | **After** the model: variant guard replaced a usable draft with a canned ask / both-overview |
| C3 | **After** send: bench scorer only (live clients would see a correct denial) |
| C4 R051 | Model draft (identity ask). Not the canned identity-before-escalate templates |
| C5 R131 | Model ignored retrieved merge restriction |
| C8 | Model and/or identity guard full-replace |
| C10 | Presend enforce in e2e harness, not live observe |

Controlled bench injects frozen evidence and **does not** run `challengeVariantGuard` / presend. R104/R011 canned strings in controlled outputs mean the **model also emits those templates** (they are in-prompt/in-weight from the guard corpus) **or** the evidence/prompt pushes the same shape. Live `index.js` would apply the guard even if the model answered the lot question. Staging guard fix therefore still matters for production.

---

## 13. A–I classification with evidence

| Class | Share of 26 none fails (primary) | Evidence |
|---|---|---|
| E scorer | 11 (R067, R069, R083, R103, R105, R138, R144, R148, R175, R181, R194) | Bodies match official fact; regex matches denial / identity echo |
| A retrieval | 7 (R001, R056, R086, R149, R171, R176, R042) | Frozen `faqMeta` titles omit the article that holds the number |
| F/B clarify | 3 (R011, R014, R104) | Canned variant-guard strings |
| D identity | 1 (R051) | `share your account number` on a policy FAQ |
| H multi-part | 1 (R127) | Identity-only body |
| G escalate | 1 (R131) | ACTION ESCALATE on a deny-able merge FAQ |
| C context | 1 (R061) | Screenshot none; anyOf borderline |
| I leftover | R094 extra 35% | Correct 50% plus unused 100k 35% |

High reasoning is **not** the class. The only stable none-vs-other gap (R042) is A+I.

---

## 14. Retrieval / evidence grounding

`faq-kb.js` is token overlap + a few boosts (country, clock, loss-limit). Top-4, score ≥ 4. No 300k / rolling / 72h / gambling / crypto / credentials boosts existed.

Measured frozen titles:

- R001/R086: Instant consistency 25% (not 300K overlay)
- R171: Lite/2-Step/1-Step (not 300K overlay)
- R176: merge + 1/2-Step (not “next account after passing”)
- R056: Instant + holding + payouts (not Gambling)
- R149: Instant only (not Account Rolling)
- R042: irregular pass + 72h article + instruments (not $500 crypto)
- R175: 1-Step/2-Step/Lite (not Trading credentials)

This is the highest-leverage none-reasoning fix.

---

## 15. Product/stage detection

`challengeVariantGuard.js` is the live detector. It is correct for “Tell me about Instant” and explicit Instant Elite. It is wrong when a **size already names the variant** (`200k Instant`) or when a **shared** attribute (`lot size`) is asked.

1-Step/2-Step generic explain prefers `bothAnswerVariants`. That names both (good) but historically lacked “which one” (fails bench `CLARIFY_RE` / prompt “ask which”).

No dedicated detector for “elite account” = Instant Elite vs funded Elite (R014).

Stage detection on R039/R083: model often **knows** live ≠ 0.5%; scorer (R083) or extra eval dump (R039 high) is the fail.

---

## 16. Context / account switching / identity

- R073: Instant 15k history → “and leverage on fx?”. Official Instant FX 1:30 is in the Instant card. Flips when the model says “customizable” instead. C, unstable.
- R061: “here screenshot” with no image. Medium escalates (pass). None asks resend (anyOf miss). C / F.
- R051: policy soft-breach + forbidden identity ask. D.
- No true multi-account switch cases in the 26. Merge (R131) is eligibility, not switch.

---

## 17. Validators / deterministic guards

Live validators (`knowledgeGapGate`, `presendMega`, identity, variant) did **not** catch 60%, 5 days, $500-yes, Instant-merge-yes, or rolling-yes, because the controlled arm never ran them, and several numbers are **absent from retrieved evidence** so a “number must appear in evidence” check cannot help.

The variant guard **created** R104.

Bench validators (`mustNot` without negation, `IDENTITY_RE`) created C3/C4-E. Same class as the first oracle-correction pass.

---

## 18. Clarification / escalation

Controlled none: unnecessary clarify 2/200, missed clarify 2/200, unnecessary escalate 1/200 (R131), missed escalate 0.

Missed clarify R011/R014 are variant-family, not “dd” short-ambiguous (those passed).

E2E unnecessary escalate is mostly enforce-mode canned replacement (C10), not the model preferring High-style overthinking.

---

## 19. Multi-part / numerical-rule handling

Controlled multi-complete: none 33/35, medium 33/35, high **32/35**. High is slightly **worse**.

Numerical misses that are real: 60% (R001/R086), 5 days (R171), $500 vs $800 (R042), 72h (R176). All have a home in FAQ that retrieval missed, except R042 also has the number in the prompt.

High R171 passing without “5” is a **scorer hole** (`\b5\b` accidentally satisfied or anyOf empty + lucky wording on some reruns) **and** a false High win. Do not route High for 300k-days.

---

## 20. Prompt / business-rule application

Conflicts that hurt none:

1. Instant card 25% + “LOCKED corrections win” vs unread 300k overlay.
2. Pakistan card is **correct**; bench `permanen` punishes the official sentence.
3. Merge FAQ in evidence, model still said yes (R131) — application, not prompt absence.
4. Account rolling is in the prompt prohibited list (line 192) **and** unread FAQ; model still said yes repurchase.

Prompt edit is **out of scope** this run (safety). Retrieval + guards can carry the same facts.

---

## 21. Ranked engineering backlog

1. **Retrieval boosts** for 300k overlay, 72h live, rolling, crypto $500, credentials, gambling. Highest leverage. Staging implemented.
2. **Variant guard:** named Instant size + shared attributes skip Instant-vs-Elite; both-templates ask which. Staging implemented.
3. **Oracle overlay pass** for C3 (R069/R083/R105/R138-must/R144/R148/R181/R194/R067/R175/R103). Recommendation only.
4. **E2E harness:** set `LUNA_PRESEND_MODE=observe`. Review fail-closed escalate on general FAQ before any enforce flip.
5. **Identity:** do not ask account number on general soft-breach / “is the account dead?” FAQ (R051).
6. **Merge Instant deny** deterministic guard (R131).
7. **Crypto >$500:** if draft says Yes to full USDT above cap, rewrite to No + $500.
8. **Elite-ambiguity** clarify (R014) — Instant Elite vs funded Elite.
9. **Identity+FAQ multi-part** completeness (R127). Partial staging (don’t wipe remainder).
10. Do **not**: raise reasoning, migrate Responses, High-route by keyword, edit live prompt/FAQs this turn.

---

## 22. Staging-only work performed

Location: **`/home/ubuntu/luna-failfix-staging/`** (new isolated dir). Not PM2, not `luna-codex-staging` (dirty peer tree), not `luna-brain-upgrade` deploy path.

Patched copies of `faq-kb.js`, `challengeVariantGuard.js`, `assistantIdentityGuard.js`.

Regression tests (all pass in that directory):

- existing `selftest-product-variant-awareness.js` 21/21
- existing `selftest-both-variants-not-decline.js` 6/6
- existing `selftest-faq-reset-time-retrieval.js` 5/5
- new `selftest-bench-failfix-variant.js` 5/5 (R104, R011, neighbors)
- new `selftest-bench-failfix-retrieval.js` 10/10 (R001/R086/R171/R176/R149/R042/R175/R056 + neighbors)
- new `selftest-bench-failfix-identity.js` 1/1 (R127 remainder)

No oracle edits. No live restart. No prompt/FAQ/control edits.

---

## 23. What was not changed (safety)

Did not change: live reasoning/verbosity/model/endpoint; `system-prompt.txt`; `fundedelite-faqs.md`; business-rule cards; teammate permissions; `bot-control.json` / paused / testMode / audience; production `index.js` / `faq-kb.js` / guards; PM2. Did not deploy. Did not write secrets. Did not touch `luna-codex-staging` dirty work.

---

## 24. BEST NEXT ACTION

**Review and (if Arsal approves) deploy only the isolated staging retrieval + variant-guard patches**, then re-score the 26 none fails + neighbors on a **new** isolated controlled run at reasoning **none**. Do not raise reasoning. Do not flip presend to enforce until C10 is reviewed. Apply the C3 oracle overlays only as a documented scorer pass, not as a product change.

---

## 25. PRODUCTION STATUS

**UNCHANGED.**

- Model: gpt-5.6-luna
- Reasoning: none
- Verbosity: low
- Output: Text
- Endpoint: `/v1/chat/completions`
- PM2 `intercom-bot` pid 2442514, online, `LUNA_PRESEND_MODE=observe`, `LUNA_REASONING_EFFORT` unset
- Freeze hashes still match for prompt, FAQs, index, faq-kb, variant/identity guards, live control

No Medium/High deploy. No Responses migration. Staging fixes are **not** in the live process.
