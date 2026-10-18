# INTERFACE_REQUEST - Elite Packs module (staging repair t739)

Status: AUTHOR CANDIDATE. Not independently reviewed. NON-PRODUCTION staging only.
Author model: Claude Sonnet 5.5.
Constraint: this module does not edit `index.js`, `faqAssistance.js` or `faqAnswerSelect.js`. The integrating author wires the exported interface below.

## 1. Entry point

```js
const { selectPacksAnswer } = require('./packs/packsAnswerSelect');
const r = await selectPacksAnswer(clientText, opts);
```

`r` is `{ abstain, answerId?, confidence, contentHash?, reason, lang, pregateKind?, pregateReason?, productHint? }`.
When `r.abstain === true`, send nothing from Packs (fall through to the caller's normal path / human handoff). When `r.abstain === false`, `r.answerId` is a sendable approved row id from `faq-approved-answers-packs-v1.json`. The body must be read from the catalog by id and sent unchanged.

## 2. `opts`

| key | meaning |
| --- | --- |
| `packsEnabled` | Must be exactly `true`. Default OFF (`reason: packs-disabled-default`). The module deliberately does not read env vars. `DEFAULT_CONFIG.packsEnabled === false`. |
| `languageGate` | REQUIRED. Result of the shared language gate: `{ language: 'en', confident: true, allowsAnswer: true }`. Absent, malformed, non-`en`, not confident or `allowsAnswer !== true` abstains (`language-gate-*`). The module also runs a local non-English detector (non-Latin scripts, accented Latin, Roman Urdu/Hindi, Arabizi, Romance/German markers) and abstains (`language-non-english-abstain`) even if the gate says English. The gate shape is this author's definition; the other author must supply an adapter if theirs differs. |
| `priorClientTexts` | Optional array of earlier CUSTOMER turns (oldest to newest). Used only to resolve dropped subjects and anaphora ("is it unlocked?"). A non-array or non-string entry fails closed for anaphora. Bot turns must not be passed. |
| `forcePacks` | Optional. Suppresses only the `not-elite-packs` abstain (caller already knows the topic is Elite Packs). It never bypasses the language gate, control gates or the ownership gate. |
| `stop`, `aiOff`, `globalPause`, `finWait`, `protectedTeam` | Control gates. Any `true` abstains before anything else runs. |

## 3. Routing (the ownership gate runs first, before any selector)

`evaluateOwnershipPregate(text, opts)` interprets the message clause by clause. A question about how something works or what the rule is defaults to GENERAL. PERSONAL requires positive evidence that the customer is asking for their own account value (possession, status, balance, delivery, or a specific item of theirs). `I` / `my` in a rule question is not that evidence. A hypothetical `if I …` is a condition, not a lookup. When a real account-state request is joined to a general question, the message is mixed and the module refuses rather than answering only the general part. A narrative aside that does not ask for an account value is ignored.

| gate kind | result |
| --- | --- |
| `personal-account-status` | `packs.account-status.refuse.en` |
| `mixed-general-and-personal` | `packs.account-status.refuse.en` (no partial answer) |
| `ambiguous-account-status` | `packs.handoff.unverified.en` |
| `refund` | `packs.refunds-legal.en` |
| `missing-item` | `packs.missing-reward.en` |
| `not-personal` | topic/entity score, with the phrase selectors as a fallback. A condition clause is not a second intent. A clause that selects a different id is a handoff. No partial answer. Catalog words (pack, card, credit, key, rarity, My Packs, pack names) establish the module without the literal phrase "Elite Packs". |

Obfuscation (invisible characters, homoglyphs, leet, spaced letters), over-long input (>1500 chars), more than 10 clauses, non-string input or any thrown error fails closed (ambiguous, never product).
The product selectors are only reachable when `productSelectPermitted(gate) === true`. An allow-list or catalog tag can never override a non-general stance.

## 4. Other exports

- `packsOwnershipPregate.js`: `evaluateOwnershipPregate`, `productSelectPermitted`, `KIND`, `VERDICT`, `normalizeInput`, `languageEvidence`, `splitClauses`, `interpretClause`, `refundIntent`, `missingItemIntent`, `NAMED_CARD_RE`, `PACKS_ITEM_RE`, `MAX_INPUT_CHARS`. `FEATURE_TABLE` is kept as an empty frozen object for compatibility; there is no cue table.
- `packsApprovedAnswers.js`: existing API plus `scopeAllows(row, role)` and `NEVER_DELIVER_TAGS`. Scope metadata (`intentTags`) may only NARROW eligibility. A row that is not `isSendableRow` is never deliverable, whatever its tags.
- `packsAnswerSelect.js`: `selectPacksAnswer`, `isPacksEnabled`, `languageGateDecision`, `packsProductHint`, `isProductCatalogAsk`, `SELECTORS`, `DEFAULT_CONFIG`, re-exports of the gate.
- Removed from the previous candidate: `detectLangHint`, `personalBalanceCue` (the ML/non-English fallback and locale selection are gone; answering is English-only).

## 5. Catalog

`faq-approved-answers-packs-v1.json` is byte-unchanged (sha256 in `MANIFEST.sha256`). 259 rows in total, 44 English base rows, 40 sendable. `the-million-every-rule-conflict`, `free-packs-provisional`, `free-packs-help-center` and `_fail_closed` stay non-sendable. Catalog path: `LUNA_PACKS_APPROVED_ANSWERS`, else the same-directory JSON, else `../kb/elite_packs/...`.

## 6. Integration requirements for the other author

1. Call `selectPacksAnswer` before any other Packs shortcut or ML fallback, and pass the shared `languageGate` result and the customer-only `priorClientTexts`.
2. Keep `packsEnabled` unset in the default configuration. Enable only in an isolated test configuration.
3. Treat `abstain: true` as "Packs sends nothing". Do not substitute the nearest FAQ.
4. Do not edit the JSON bodies, ids, approval status or sendability.

## 7. Tests

```
cd staging-repair-t739/packs && node tests/run-author-tests.js [--json out.json] [--verbose]
```

These are the author's own cases. Independent sealed cases are authored separately and were not seen.
