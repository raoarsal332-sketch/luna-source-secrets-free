# T739 Elite Atom module: implementation author report

Cycle 1 remediation (actual model Grok 4.7; requested Claude Sonnet 5.5) is in `REMEDIATION_R1_NOTES.md`. The counts below are the pre-cycle-1 freeze. Cycle 1 does not claim PASS.

Status: CANDIDATE, FROZEN. This report does not claim PASS. My own tests were written by me and were iterated against, so they cannot show acceptance. The independent sealed cases are withheld and still have to run.

Scope: NON-PRODUCTION staging only. I did not use SSH, a VPS, production, Intercom or any external API. I used no real customer data or credentials, and I did no deployment. Atom stays OFF by default and turns on only with `opts.enabled === true` or `LUNA_ATOM_SELECTOR_ENABLED=1` in an isolated test config.

Model id: Claude Sonnet 5.5, as stated in my system prompt. The exact API slug and effort tier are not exposed to me, so I cannot give a more precise id.

Tags: [SV] means source-verified against the baseline code or the frozen review files. [HI] means historical inference from the earlier failure reports. [AS] means an assumption I made and the owner must confirm.

## 1. Root cause

1. [SV] The baseline `atomAnswerSelect.js` (dd3b9f79) decides "price intent" lexically, before it resolves what money the user means. `isAllowlistedPurePriceAsk` (L126-133) treats a bare amount (`$19|$59|$114|$215|$289|$409|$519|7k|25k|50k|100k|200k`) or `how much` as price intent whenever no "Zone B" word is present. An amount with no price word is therefore ranked as a price question and `atom.prices.list.en` is selected. This is the structural-hole leak. 6 of the 16 baseline leaks are of this kind (MC01-06), plus MC40 and PR27.
2. [SV] The fee-policy gate `isAtomFeePolicyRiskAsk` (L153-159) fires only if a Zone A word is present. A refund or return question that avoids the Zone A vocabulary (disguised, split across words, or about "my money") passes the gate. Whatever then scores highest is sent, which is the price row or the account-status refuse row.
3. [SV] `accountStatusAsk` (L166, `my ... payout`) is a loose pattern. Any "my ... payout" question gets the refuse row, even when it is a refund or split question. The baseline has 8 leaks of this kind (MC07, 16, 36-39, PR13, PR17).
4. [SV] The baseline ranks candidates before it resolves the referent, the relationship and the conditions. It has no concept of which qualifiers an answer covers, so a general answer can substitute for a question about something else. Examples are a price answer for a refund question, or a payout answer for a split question with an ordinal.
5. [SV] Over-blocking has the same cause in the other direction. A word-list veto (Zone A and the money terms) refuses ordinary questions. On my author general set the baseline refuses 12 of 33 answerable questions. [HI] The earlier review recorded 8 of 45 general questions wrongly blocked, which is consistent with this.
6. [AS] The baseline `languageGate` handling and the `langHint` input are not reliable language signals. I treat `langHint` as no signal and fail closed when the shared gate result is absent.

## 2. Changes

All files are under `staging-repair-t739/atom/`. Nothing outside this directory was touched. I did not modify `index.js`, `faqAssistance.js` or `faqAnswerSelect.js`.

| File | Role |
|---|---|
| `atomMoneyFrame.js` (new) | Normalization (NFKC, zero-width removal, Cyrillic and Greek homoglyph fold, accent strip, de-obfuscation, leet fold) and slot extraction. It turns amounts, percentages, ratios, products, sizes, ordinals and payout phrases into placeholder tokens and produces an evidence object. It also reads the shared `languageGate` and fails closed. |
| `atomAnswerScope.js` (new) | A sidecar of scope metadata for the 33 English ids: frame, product, relationships and allowed qualifiers. `admit()` can only narrow. `validateAgainstKb()` checks that the ids exist. |
| `atomAnswerSelect.js` (new) | The selector. It resolves in the order referent, relationship, conditions, and only then does a positive per-frame vocabulary match to an existing answer. Anything it cannot resolve abstains, clarifies or hands off. |
| `INTERFACE.md` (new) | The clean interface contract. |
| `tests/` (new) | Author tests, the baseline loader and comparison, and the runner. |
| `baseline/` | Frozen byte-identical baseline files for comparison only. |
| `atomApprovedAnswers.js`, `faq-approved-answers-atom-v1.json` | Byte-identical copies. The KB tests check their sha256. |

Resolution order in the selector:
1. Gates, in order: Atom off, invalid input, empty, paused, aiOff, stop, finWait, protectedTeam, languageGate, length cap (1200), local non-English check, Atom scope.
2. Deny classes: strong recovery verbs, weak recovery plus a fee, money, amount or payout term, fee-paid evidence, price word plus payout, and price amount plus a payout or ordinal. These abstain with `atom-fee-policy-owner-decision`.
3. Money plus a transfer verb with no resolved referent clarifies `monetary-referent`.
4. Account-specific asks get the refuse row only if every word is in the closed boundary vocabulary.
5. Frame detection: split, payout, price, checkout, bundle and rule. Only three overlaps are allowed (split+checkout resolves to split, checkout+timing to checkout, and bundle+price to bundle when only discount words appear). Every other overlap abstains as `multi-intent-not-covered`.
6. Unresolved topics are never answered: consistency equality, news-minute calculations, checkout SKU selection, translations and coupon stacking.
7. Per-frame closed vocabulary. A word outside it gives `unrecognized-qualifier`. A qualifier the matched answer does not cover also abstains.

Mapping, existing answers only:
- split goes to `atom.1step.reward.en` or `atom.2step.reward.en`.
- payout amount or timing goes to `atom.payouts.general.en`.
- price goes to `atom.prices.list.en` or `atom.checkout.options.en`.
- account-specific goes to `atom.account-status.refuse.en`.
- uncertain goes to clarify, abstain or `atom.handoff.unverified.en`.
- A challenge-fee refund has no approved row, so it abstains with `atom-fee-policy-owner-decision`.

Judgment calls:
- Split with no product named: "default" asked goes to `atom.payouts.general.en`, because its body states the default 80% and both reward rows share that default. Anything else clarifies `product`. [AS] The owner should confirm this choice.
- Leverage with no product goes to `atom.obsolete.leverage-150-default.en`.
- "my money" counts as fee paid and abstains.
- Multi-turn: follow-ups walk back to the anchor turn. Fee-policy and monetary-referent abstains are inherited. The current turn's product beats the inherited one.
- Bodies, ids, approval status and sendability are byte-unchanged. The KB has 33 English base rows and 31 sendable, so 31 x 8 paraphrases = 248 controls.
- The public `selectAtomAnswer` wraps the core in a try/catch (`selector-error-fail-closed`) and re-checks that the row is sendable and its `contentHash` matches. Abstain results never carry `answerId`. Diagnostics are stripped unless `opts.debug` is set.

## 3. Interface

See `INTERFACE.md` for the full contract. Summary:

```js
const { selectAtomAnswer } = require('./atomAnswerSelect');
await selectAtomAnswer(text, { enabled: true, languageGate, priorClientTexts, ...gates });
```

- It is OFF unless `opts.enabled === true` or `LUNA_ATOM_SELECTOR_ENABLED=1`. `enabled:false` always wins.
- `languageGate` is required. [AS] I accept the string `'en'`, or an object whose `lang`, `language`, `code` or `detected` is `en` or `en-*`, with no negative flags. If it is absent or malformed the selector fails closed (`language-gate-missing`, `-malformed`, `-not-english` or `-not-confident`).
- The result `action` is one of `answer`, `clarify`, `abstain` or `handoff`. `answerId` appears only on `answer`. `handoffAnswerId` is only a suggestion.
- There is no approved clarification text. The selector returns a reason code and the caller must supply wording.

## 4. Tests

Run from `staging-repair-t739/atom/`:

```
./tests/run_all.sh
node --test tests/author_suite.test.js
node tests/report_counts.js            # add --json for machine output
node tests/baseline_compare.js
```

Full captured output is in `artifacts/final_test_run.txt`. I ran these on Node v22.14.0 only. Production reportedly runs Node 20, which I did not test.

Raw counts from the final run:

| Set | Total | Pass | Fail | Leaks | False refusals |
|---|---|---|---|---|---|
| kb | 16 | 16 | 0 | 0 | 0 |
| controls (31 ids x 8) | 248 | 248 | 0 | 0 | 0 |
| money-confusion | 50 | 50 | 0 | 0 | 0 |
| unresolved | 12 | 12 | 0 | 0 | 0 |
| discriminate (refund vs split vs price vs timing) | 31 | 31 | 0 | 0 | 0 |
| account-specific | 6 | 6 | 0 | 0 | 0 |
| multi-turn | 20 | 20 | 0 | 0 | 0 |
| unicode | 16 | 16 | 0 | 0 | 0 |
| non-english | 15 | 15 | 0 | 0 | 0 |
| gating | 27 | 27 | 0 | 0 | 0 |
| robustness | 13 | 13 | 0 | 0 | 0 |
| general | 45 | 44 | 1 | 0 | 1 |
| probes-novel | 30 | 30 | 0 | 0 | 0 |
| fee-sweep (template combos) | 3200 | 3200 | 0 | 0 | 0 |
| mixed-sweep (248 controls x 4 fee suffixes) | 992 | 992 | 0 | 0 | 0 |
| TOTAL | 5465 | 5464 | 1 | 0 | 1 |

`node --test`: 19 tests, 19 pass. `wrapper-stability` is informational (744 of 744) and is not in the total.

Baseline (dd3b9f79) against the corrected selector on the same cases:
- 80 deny cases: the baseline sends a sendable answer on 16, the corrected selector on 0.
- General false refusals on 33 answer-expected questions: baseline 12, corrected 1.

The one failing case is GN25, "Can I get a bigger reward share on Atom 1-Step?". It returns `clarify:unrecognized-qualifier`. This is a false refusal and I did not fix it. The general set was iterated against, so the 1 of 33 figure is not independent evidence. False refusals are measured separately from leaks, as the task required.

## 5. Limitations

- All counts come from my own cases, and my fixes were written to pass them. The independent sealed cases decide acceptance. Zero leaks here does not mean zero leaks there.
- The closed per-frame vocabulary over-refuses unusual phrasings. Expect false refusals on the sealed general set. GN25 is a known example.
- Multi-intent asks abstain by design.
- Not covered and never answered: equality, news-minute calculations, checkout SKU selection, translations, coupon stacking, calc asks, change and comparative qualifiers, and ordinal-timing calculations.
- "my money" is treated as fee paid, so it abstains. Account asks with extra words abstain instead of getting the refuse row.
- No approved clarification text exists. No challenge-fee refund row exists, which is an owner decision.
- [AS] The `languageGate` shape and the other-product markers (elite packs, packs, mt5, spread test, elite pro, instant funding, stellar) are my assumptions.
- English only. The local non-English check can only narrow the gate result and cannot override it.
- Only Node 22 was tested.

## 6. BLOCKED integration

The Atom-tree `faqApprovedAnswers.js` containing or resolving `resolveExtraPath` is missing (requested from owner). I did not implement or guess that integration. The following are BLOCKED:
- The extra-catalog load path (`resolveExtraPath`) for the Atom KB.
- Passing the product hint through to the selector.
- Atom precedence against the main FAQ selector.
- Passing the shared gate result into `opts.languageGate` in the wired caller. The wired caller must also stop passing `langHint` as a language signal, and must propagate `opts` (`enabled`, `priorClientTexts`, gates).
- Any edit to `index.js`, `faqAssistance.js` or `faqAnswerSelect.js`, which another author owns. The baseline `faqAnswerSelect.atomwired.js` (fc752a47) is kept unchanged for comparison only.

## 7. Owner decisions needed

1. Whether a challenge-fee refund gets an approved row. Until then it abstains with `atom-fee-policy-owner-decision`.
2. Approved clarification wording for `product`, `monetary-referent` and similar reasons.
3. Whether a no-product split question may be answered from `atom.payouts.general.en` when "default" is asked. I chose yes, and the body supports it.
4. The real shape of the shared `languageGate` result.
5. The authoritative other-product marker list.

## 8. Freeze

`MANIFEST.json` lists the full sha256 and size of every file in the candidate. `MANIFEST.sha256` is the hash of the manifest. No changes after the freeze.
